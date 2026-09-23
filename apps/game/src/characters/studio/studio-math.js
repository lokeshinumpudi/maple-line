/**
 * Pure maths for the character studio (character-studio.html): the jitter metric, foot
 * slide, concept-overlay alignment, timeline trims, clip mirroring and a line diff for the
 * save review. No three.js import, so everything here runs under `node --test`.
 * Quaternions are [x, y, z, w] arrays.
 */

// ---- jitter: the metric in docs/CHARACTER-MOTION.md ------------------------------------

/**
 * The rotation from `a` to `b` in `a`'s frame (conj(a) * b) as a rotation vector: axis times
 * angle in radians, taking the short way round.
 */
export function rotationVector(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  let x = aw * bx - ax * bw - ay * bz + az * by;
  let y = aw * by + ax * bz - ay * bw - az * bx;
  let z = aw * bz - ax * by + ay * bx - az * bw;
  let w = aw * bw + ax * bx + ay * by + az * bz;
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  const s = Math.hypot(x, y, z);
  const angle = 2 * Math.atan2(s, w);
  return s > 1e-9 ? [(x / s) * angle, (y / s) * angle, (z / s) * angle] : [0, 0, 0];
}

/**
 * Angular velocity (rad/s) and acceleration (rad/s^2) magnitudes of one joint's local
 * rotation, sampled every `dt` seconds. velocity[i] covers frames i-1..i, acceleration[i]
 * frames i-2..i; the first entries are 0.
 */
export function angularSeries(quaternions, dt) {
  const velocity = Array.from({ length: quaternions.length }, () => 0);
  const acceleration = Array.from({ length: quaternions.length }, () => 0);
  let previous = null;
  for (let i = 1; i < quaternions.length; i++) {
    const w = rotationVector(quaternions[i - 1], quaternions[i]);
    velocity[i] = Math.hypot(w[0], w[1], w[2]) / dt;
    if (previous)
      acceleration[i] =
        Math.hypot(w[0] - previous[0], w[1] - previous[1], w[2] - previous[2]) / (dt * dt);
    previous = w;
  }
  return { velocity, acceleration };
}

/**
 * Root-mean-square angular acceleration of one joint (the jitter figure in the
 * CHARACTER-MOTION tables). `keep(i)` excludes frames (a frame counts only with its two
 * predecessors kept too), as the measurement script did for "walking" or "standing" frames.
 */
export function jitterRms(quaternions, dt, keep = () => true) {
  let sum = 0;
  let n = 0;
  let max = 0;
  for (let t = 2; t < quaternions.length; t++) {
    if (!keep(t) || !keep(t - 1) || !keep(t - 2)) continue;
    const w1 = rotationVector(quaternions[t - 2], quaternions[t - 1]);
    const w2 = rotationVector(quaternions[t - 1], quaternions[t]);
    const a = Math.hypot(w2[0] - w1[0], w2[1] - w1[1], w2[2] - w1[2]) / (dt * dt);
    sum += a * a;
    n++;
    max = Math.max(max, a);
  }
  return { rms: n ? Math.sqrt(sum / n) : 0, max, n };
}

/** Bone groups of the CHARACTER-MOTION jitter table, by canonical bone name. */
export const JITTER_GROUPS = Object.freeze({
  arms: ['upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR'],
  legs: ['upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR'],
  neckHead: ['neck', 'head'],
  spine: ['spine', 'chest'],
});

/** Mean RMS per group from { canonical: { rms } }; groups with no measured bone are null. */
export function groupJitter(perBone, groups = JITTER_GROUPS) {
  const out = {};
  for (const [group, names] of Object.entries(groups)) {
    const values = names.map((name) => perBone[name]?.rms).filter(Number.isFinite);
    out[group] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  return out;
}

// ---- foot slide and grounding -----------------------------------------------------------

/**
 * Foot slide as the CHARACTER-MOTION measurement defines it: each frame, the contact point
 * (heels and toes) that moved least over the ground counts as the planted one, and its
 * horizontal travel is slide. `frames` are { root: [x, z], contacts: [[x, y, z], ...] }.
 * Returns metres slid, metres walked and slide as a percentage of the walk.
 */
export function footSlide(frames) {
  let slide = 0;
  let path = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    path += Math.hypot(b.root[0] - a.root[0], b.root[1] - a.root[1]);
    let least = Infinity;
    b.contacts.forEach((point, k) => {
      const before = a.contacts[k];
      if (before) least = Math.min(least, Math.hypot(point[0] - before[0], point[2] - before[2]));
    });
    if (Number.isFinite(least)) slide += least;
  }
  return { slide, path, percent: path > 0.01 ? (100 * slide) / path : 0 };
}

/**
 * State of one foot for the grounding markers: `height` above its rest height over the
 * ground (m), `speed` over the ground (m/s). A foot near the ground that still moves is
 * sliding; planted means the rig has it locked.
 */
export function footState({ height, speed, planted }, { contact = 0.03, slip = 0.12 } = {}) {
  const grounded = height < contact;
  if (planted && speed <= slip) return 'planted';
  if (grounded && speed > slip) return 'sliding';
  if (grounded) return 'grounded';
  return 'swing';
}

// ---- concept overlay alignment ----------------------------------------------------------

/**
 * An overlay alignment places a reference image on a view plane. `height` is how many
 * metres the whole image spans vertically; `offset` [x, y] is where the bottom-centre of
 * the image sits (x across the view, y up); `opacity` and `flip` (mirror left-right) are for
 * display. Image pixels are [u, v] with v = 0 at the top.
 */
export const DEFAULT_OVERLAY = Object.freeze({
  height: 1.9,
  offset: [0, -0.05],
  opacity: 0.5,
  flip: false,
});

/** Metres per image pixel for an alignment. */
export function metresPerPixel(alignment, imageHeight) {
  return alignment.height / imageHeight;
}

/** The overlay plane's size and centre in view coordinates. */
export function overlayRect(alignment, imageWidth, imageHeight) {
  const height = alignment.height;
  const width = (height * imageWidth) / imageHeight;
  return {
    width,
    height,
    centre: [alignment.offset[0], alignment.offset[1] + height / 2],
  };
}

/** View coordinates [x, y] of an image pixel [u, v]. */
export function imageToView(alignment, imageWidth, imageHeight, [u, v]) {
  const mpp = metresPerPixel(alignment, imageHeight);
  const across = (alignment.flip ? imageWidth / 2 - u : u - imageWidth / 2) * mpp;
  return [alignment.offset[0] + across, alignment.offset[1] + (imageHeight - v) * mpp];
}

/** Image pixel [u, v] under a view point [x, y] (the inverse of imageToView). */
export function viewToImage(alignment, imageWidth, imageHeight, [x, y]) {
  const mpp = metresPerPixel(alignment, imageHeight);
  const across = (x - alignment.offset[0]) / mpp;
  return [
    alignment.flip ? imageWidth / 2 - across : imageWidth / 2 + across,
    imageHeight - (y - alignment.offset[1]) / mpp,
  ];
}

/**
 * The alignment that puts image pixel `pixelA` on view point `viewA` and scales the image so
 * the vertical distance from `pixelA` to `pixelB` matches `viewA` to `viewB` (for example the
 * top of the head and the soles in the concept, onto the same points on the body).
 */
export function alignFromTwoPoints({
  imageWidth,
  imageHeight,
  pixelA,
  pixelB,
  viewA,
  viewB,
  base = DEFAULT_OVERLAY,
}) {
  const pixels = Math.abs(pixelB[1] - pixelA[1]);
  const metres = Math.abs(viewB[1] - viewA[1]);
  if (!(pixels > 0) || !(metres > 0)) throw new RangeError('The two points need a vertical span.');
  const mpp = metres / pixels;
  const flip = Boolean(base.flip);
  const across = (flip ? imageWidth / 2 - pixelA[0] : pixelA[0] - imageWidth / 2) * mpp;
  return {
    ...base,
    height: round(imageHeight * mpp, 5),
    offset: [round(viewA[0] - across, 5), round(viewA[1] - (imageHeight - pixelA[1]) * mpp, 5)],
  };
}

/**
 * Fit the drawn figure (its ink bounds in pixels, see inkBounds) to a body spanning
 * `bodyBottom`..`bodyTop` metres, centred at `bodyCentre` across the view.
 */
export function fitOverlayToBody({
  imageWidth,
  imageHeight,
  ink,
  bodyTop,
  bodyBottom,
  bodyCentre = 0,
  base = DEFAULT_OVERLAY,
}) {
  // Across the view the drawn feet go to `bodyCentre` (the body's feet); without feet
  // bounds, the whole figure's middle does.
  const across = ink.feet ?? ink;
  const middle = (across.left + across.right) / 2;
  return alignFromTwoPoints({
    imageWidth,
    imageHeight,
    pixelA: [middle, ink.bottom],
    pixelB: [middle, ink.top],
    viewA: [bodyCentre, bodyBottom],
    viewB: [bodyCentre, bodyTop],
    base,
  });
}

/**
 * Bounds of the drawn figure in an RGBA pixel buffer: pixels clearly darker or more
 * saturated than the paper. The paper's brightness is taken from the image's bright end,
 * so a cream or white sheet both work. Rows and columns need `minRun` ink pixels to count,
 * which ignores specks. Returns { left, right, top, bottom, feet: { left, right } } in
 * pixels (feet: the ink columns in the lowest 6% of the figure, the shoes), or null.
 */
export function inkBounds(data, width, height, { darker = 0.22, chroma = 0.16, minRun = 3 } = {}) {
  const lum = new Float32Array(width * height);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    histogram[Math.min(255, Math.round(lum[i] * 255))]++;
  }
  // Paper: the 80th percentile brightness.
  let seen = 0;
  let paper = 1;
  for (let level = 0; level < 256; level++) {
    seen += histogram[level];
    if (seen >= width * height * 0.8) {
      paper = level / 255;
      break;
    }
  }
  const ink = new Uint8Array(width * height);
  const rows = new Uint32Array(height);
  const cols = new Uint32Array(width);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = data[i * 4] / 255;
      const g = data[i * 4 + 1] / 255;
      const b = data[i * 4 + 2] / 255;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum[i] < paper - darker || saturation > chroma + 0.1) {
        ink[i] = 1;
        rows[y]++;
        cols[x]++;
      }
    }
  const first = (counts, min = minRun) => counts.findIndex((n) => n >= min);
  const last = (counts, min = minRun) =>
    counts.length - 1 - [...counts].reverse().findIndex((n) => n >= min);
  const top = first(rows);
  if (top < 0) return null;
  const bottom = last(rows);
  const band = new Uint32Array(width);
  const from = Math.round(bottom - (bottom - top) * 0.06);
  for (let y = from; y <= bottom; y++)
    for (let x = 0; x < width; x++) band[x] += ink[y * width + x];
  return {
    left: first(cols),
    right: last(cols),
    top,
    bottom,
    feet: { left: first(band, 1), right: last(band, 1) },
  };
}

// ---- timeline -----------------------------------------------------------------------------

/** A clip trim: play from `in` to `out` seconds, looping or holding at the end. */
export function trimmedTime(t, { start = 0, end, loop = true }) {
  const span = end - start;
  if (!(span > 0)) return start;
  if (loop) return start + ((((t - start) % span) + span) % span);
  return Math.min(end, Math.max(start, t));
}

/** Frame index and back, at a frame rate. */
export const toFrame = (t, fps) => Math.round(t * fps);
export const fromFrame = (frame, fps) => frame / fps;

/** Evenly spaced ghost times around `t`: `count` before and after, `spacing` frames apart. */
export function ghostTimes(t, { count = 1, spacing = 8, fps = 30, trim = null } = {}) {
  const out = [];
  for (let k = -count; k <= count; k++) {
    if (!k) continue;
    const time = t + (k * spacing) / fps;
    out.push({ k, time: trim ? trimmedTime(time, trim) : time });
  }
  return out;
}

// ---- mirroring and additive corrections ---------------------------------------------------

/** Swap left and right in a VRM track or bone name (Normalized_leftHand.quaternion). */
export function mirrorName(name) {
  return name.replace(/left|right|Left|Right/g, (side) =>
    side === 'left' ? 'right' : side === 'right' ? 'left' : side === 'Left' ? 'Right' : 'Left',
  );
}

/**
 * Mirror a rotation across the character's left-right (YZ) plane. Valid for VRM normalized
 * bones, whose rest is identity in a T-pose facing +Z.
 */
export function mirrorQuaternion([x, y, z, w]) {
  return [x, -y, -z, w];
}

export function mirrorPosition([x, y, z]) {
  return [-x, y, z];
}

/**
 * Mirror clip data: { name, duration, tracks: [{ name, times, values, kind }] } where kind is
 * 'quaternion', 'vector' or anything else (expression weights: renamed, values kept). Left
 * tracks become right tracks and every rotation and position is reflected.
 */
export function mirrorClipData(clip) {
  return {
    ...clip,
    name: `${clip.name}-mirror`,
    tracks: clip.tracks.map((track) => {
      if (track.kind !== 'quaternion' && track.kind !== 'vector')
        return { ...track, name: mirrorName(track.name), values: Array.from(track.values) };
      const size = track.kind === 'quaternion' ? 4 : 3;
      const values = Array.from(track.values);
      for (let i = 0; i < values.length; i += size) {
        const item = values.slice(i, i + size);
        const mirrored = size === 4 ? mirrorQuaternion(item) : mirrorPosition(item);
        for (let k = 0; k < size; k++) values[i + k] = mirrored[k];
      }
      return { ...track, name: mirrorName(track.name), values };
    }),
  };
}

/**
 * Weight of an additive correction at time `t` from keys [{ t, w }] (linear between keys,
 * held flat outside them). With one key the weight is constant.
 */
export function correctionWeight(keys, t) {
  if (!keys?.length) return 0;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return sorted[0].w;
  const lastKey = sorted[sorted.length - 1];
  if (t >= lastKey.t) return lastKey.w;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (t <= b.t) return a.w + ((b.w - a.w) * (t - a.t)) / Math.max(1e-9, b.t - a.t);
  }
  return lastKey.w;
}

/** Quaternion [x, y, z, w] from XYZ Euler degrees (three.js 'XYZ' order). */
export function quaternionFromEulerDegrees([ex, ey, ez]) {
  const r = Math.PI / 360;
  const c1 = Math.cos(ex * r);
  const c2 = Math.cos(ey * r);
  const c3 = Math.cos(ez * r);
  const s1 = Math.sin(ex * r);
  const s2 = Math.sin(ey * r);
  const s3 = Math.sin(ez * r);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

// ---- save review ---------------------------------------------------------------------------

/**
 * A line diff (longest common subsequence) for reviewing a JSON change before it is
 * written. Returns [{ op: ' ' | '-' | '+', line }].
 */
export function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: ' ', line: a[i++] });
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) out.push({ op: '-', line: a[i++] });
    else out.push({ op: '+', line: b[j++] });
  }
  while (i < n) out.push({ op: '-', line: a[i++] });
  while (j < m) out.push({ op: '+', line: b[j++] });
  return out;
}

/** Only the changed lines of a diff with `context` unchanged lines around each change. */
export function diffHunks(diff, context = 2) {
  const keep = new Set();
  diff.forEach((entry, i) => {
    if (entry.op === ' ') return;
    for (let k = i - context; k <= i + context; k++) keep.add(k);
  });
  const out = [];
  let gap = false;
  diff.forEach((entry, i) => {
    if (keep.has(i)) {
      out.push(entry);
      gap = false;
    } else if (!gap) {
      out.push({ op: '…', line: '' });
      gap = true;
    }
  });
  return out;
}

export function round(value, digits = 4) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
