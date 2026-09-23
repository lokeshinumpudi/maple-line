/**
 * Readable station props for the drama: timetable boards and station clocks at Momiji and
 * Aonuma. Boards are canvas textures with large type, so an insert shot can read them; the
 * clock hands follow the scene clock (an episode's `set.clock`, running on from there) or
 * the game's own clock when no episode is playing.
 *
 * Ids match drama/drama-props.js. `subject(id)` answers where a prop is and where an insert
 * camera should stand to see it square on.
 */

/** A station's local frame, as extended-route.js builds regional stations. */
export function stationFrame(railPoint, stopZ) {
  const a = railPoint(stopZ - 1);
  const b = railPoint(stopZ + 1);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    yaw,
    /** World point for station-local x (across, away from the rail), y (up) and z (along). */
    point(x, y, z) {
      const q = railPoint(stopZ + z);
      return { x: q.x + cos * x, y: q.y + y, z: q.z - sin * x };
    },
    /** World heading for a station-local heading (both measured from +z toward +x). */
    heading: (local) => local + yaw,
  };
}

const MINUTE = (Math.PI * 2) / 60;

function drawBoard(ctx, width, height, board) {
  ctx.fillStyle = '#f3ecd9';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = board.band;
  ctx.fillRect(0, 0, width, 150);
  ctx.fillStyle = '#fff4d8';
  ctx.textBaseline = 'middle';
  ctx.font = '700 64px "Noto Sans JP", "Hiragino Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(board.title, 40, 60);
  ctx.font = '500 38px "Noto Sans JP", "Hiragino Sans", sans-serif';
  ctx.fillText(board.subtitle, 40, 118);
  let y = 205;
  for (const row of board.rows) {
    if (row.heading) {
      ctx.fillStyle = '#4b4a44';
      ctx.fillRect(40, y - 26, width - 80, 4);
      ctx.font = '600 40px "Noto Sans JP", "Hiragino Sans", sans-serif';
      ctx.fillStyle = '#3c3a33';
      ctx.fillText(row.heading, 40, y + 20);
      y += 78;
      continue;
    }
    if (row.mark) {
      ctx.fillStyle = row.mark;
      ctx.fillRect(28, y - 44, width - 56, 88);
    }
    ctx.fillStyle = row.mark ? '#ffffff' : '#23231f';
    ctx.font = '700 76px "Roboto Mono", "Menlo", monospace';
    ctx.fillText(row.time, 50, y);
    ctx.font = '600 50px "Noto Sans JP", "Hiragino Sans", sans-serif';
    ctx.fillText(row.label, 330, y);
    y += 104;
  }
  ctx.strokeStyle = '#2f3b36';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, width - 14, height - 14);
}

function drawClockFace(ctx, size) {
  const c = size / 2;
  ctx.fillStyle = '#fbf8ef';
  ctx.beginPath();
  ctx.arc(c, c, c - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1c1f1e';
  for (let i = 0; i < 60; i++) {
    const a = i * MINUTE;
    const long = i % 5 === 0;
    ctx.lineWidth = long ? 14 : 5;
    const r0 = c - (long ? 58 : 36);
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0);
    ctx.lineTo(c + Math.sin(a) * (c - 18), c - Math.cos(a) * (c - 18));
    ctx.stroke();
  }
  ctx.fillStyle = '#1c1f1e';
  ctx.font = '700 64px "Roboto", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [n, a] of [
    [12, 0],
    [3, 3],
    [6, 6],
    [9, 9],
  ])
    ctx.fillText(
      String(n),
      c + Math.sin(a * 5 * MINUTE) * (c - 100),
      c - Math.cos(a * 5 * MINUTE) * (c - 100),
    );
}

/**
 * Where each prop stands. `station` is 'momiji' (the Momiji group's local frame: deck top
 * at y 1.1, platform x 2.5–7.5, track toward -x) or a regional stop id (station frame,
 * deck top at y 0.6, platform x 3–8.6). `face` is the local heading of the readable side.
 */
export const STATION_PROPS = Object.freeze([
  {
    id: 'momiji-timetable',
    kind: 'board',
    station: 'momiji',
    at: [6.9, 2.62, -24.4],
    face: -Math.PI / 2,
    size: [1.56, 1.2],
    posts: 1.1,
    board: {
      band: '#1f4d44',
      title: 'もみじ  Momiji',
      subtitle: 'Evening local · for Aonuma',
      rows: [
        { time: '16:58', label: 'Leaves Momiji' },
        { time: '17:42', label: 'Arrives Aonuma', mark: '#b8872a' },
        { heading: 'Aonuma bus · hill road' },
        { time: '17:40', label: 'Last bus', mark: '#b3342b' },
      ],
    },
  },
  {
    id: 'momiji-clock',
    kind: 'clock',
    station: 'momiji',
    at: [3.39, 3.95, -22],
    face: -Math.PI / 2,
    radius: 0.32,
  },
  {
    id: 'aonuma-clock',
    kind: 'clock',
    station: 'aonuma',
    at: [6.7, 3.25, 15],
    face: -Math.PI / 2,
    radius: 0.32,
    twoFaced: true,
  },
  {
    id: 'aonuma-timetable',
    kind: 'board',
    station: 'aonuma',
    at: [8.95, 2.0, 21.9],
    face: Math.PI / 2,
    size: [0.92, 1.1],
    pole: true,
    board: {
      band: '#1f6f86',
      title: '青沼駅前',
      subtitle: 'Aonuma Station · hill road',
      rows: [
        { time: '12:15', label: 'Kamisato' },
        { time: '15:30', label: 'Kamisato' },
        { time: '17:40', label: 'Last bus', mark: '#b3342b' },
      ],
    },
  },
]);

export function createStationProps({ THREE, momiji, scene, railPoint, stops }) {
  const group = new THREE.Group();
  group.name = 'Drama / station props';
  scene.add(group);
  const owned = [];
  const own = (item) => {
    owned.push(item);
    return item;
  };
  const wood = own(new THREE.MeshStandardMaterial({ color: '#4c3a2a', roughness: 0.8 }));
  const metal = own(
    new THREE.MeshStandardMaterial({ color: '#2e3431', roughness: 0.5, metalness: 0.6 }),
  );
  const box = own(new THREE.BoxGeometry(1, 1, 1));
  const placed = new Map();
  let clockMinutes = null;
  let fallbackMinutes = 16 * 60 + 42;

  function frameFor(item) {
    if (item.station === 'momiji') return null;
    const stop = stops.find((entry) => entry.id === item.station);
    return stop ? stationFrame(railPoint, stop.z) : null;
  }

  function mount(item) {
    const holder = new THREE.Group();
    holder.name = `Prop / ${item.id}`;
    const [x, y, z] = item.at;
    if (item.station === 'momiji') {
      holder.position.set(x, y, z);
      holder.rotation.y = item.face;
      momiji.add(holder);
    } else {
      const frame = frameFor(item);
      if (!frame) return null;
      const p = frame.point(x, y, z);
      holder.position.set(p.x, p.y, p.z);
      holder.rotation.y = frame.heading(item.face);
      group.add(holder);
    }
    return holder;
  }

  function buildBoard(item, holder) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.round(1024 * (item.size[1] / item.size[0]));
    drawBoard(canvas.getContext('2d'), canvas.width, canvas.height, item.board);
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const face = new THREE.Mesh(
      own(new THREE.PlaneGeometry(...item.size)),
      own(
        new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.7,
          emissive: '#ffffff',
          emissiveMap: texture,
          emissiveIntensity: 0.12,
        }),
      ),
    );
    face.name = `${item.id} / face`;
    face.position.z = 0.035;
    holder.add(face);
    const back = new THREE.Mesh(box, metal);
    back.scale.set(item.size[0] + 0.08, item.size[1] + 0.08, 0.06);
    holder.add(back);
    if (item.posts)
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(box, wood);
        post.scale.set(0.08, item.posts + item.size[1] / 2, 0.08);
        post.position.set((side * item.size[0]) / 2.1, -(item.posts + item.size[1] / 2) / 2, -0.04);
        holder.add(post);
      }
    if (item.pole) {
      const pole = new THREE.Mesh(box, metal);
      const height = item.at[1] + 0.9;
      pole.scale.set(0.07, height, 0.07);
      pole.position.set(item.size[0] / 2 + 0.06, 0.9 - height / 2, -0.03);
      holder.add(pole);
      // The round blue bus-stop sign on top of the pole.
      const sign = document.createElement('canvas');
      sign.width = sign.height = 256;
      const ctx = sign.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(128, 128, 124, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d5fb0';
      ctx.beginPath();
      ctx.arc(128, 128, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(58, 86, 140, 70);
      ctx.fillStyle = '#1d5fb0';
      ctx.fillRect(70, 96, 36, 26);
      ctx.fillRect(114, 96, 36, 26);
      ctx.fillRect(158, 96, 28, 26);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(88, 164, 14, 0, Math.PI * 2);
      ctx.arc(170, 164, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '700 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('バス', 128, 212);
      const signTexture = own(new THREE.CanvasTexture(sign));
      signTexture.colorSpace = THREE.SRGBColorSpace;
      const disc = new THREE.Mesh(
        own(new THREE.CircleGeometry(0.3, 32)),
        own(
          new THREE.MeshStandardMaterial({
            map: signTexture,
            side: THREE.DoubleSide,
            roughness: 0.5,
          }),
        ),
      );
      disc.position.set(item.size[0] / 2 + 0.06, 1.25, 0);
      holder.add(disc);
    }
    return { face };
  }

  function buildClock(item, holder) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    drawClockFace(canvas.getContext('2d'), 512);
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    const faceMaterial = own(
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.4,
        emissive: '#ffffff',
        emissiveMap: texture,
        emissiveIntensity: 0.15,
      }),
    );
    const handMaterial = own(new THREE.MeshStandardMaterial({ color: '#141615', roughness: 0.5 }));
    const redHand = own(new THREE.MeshStandardMaterial({ color: '#b3342b', roughness: 0.5 }));
    const disc = own(new THREE.CircleGeometry(item.radius, 48));
    const rim = own(new THREE.TorusGeometry(item.radius, 0.028, 8, 48));
    const hands = [];
    for (const side of item.twoFaced ? [1, -1] : [1]) {
      const dial = new THREE.Group();
      dial.rotation.y = side > 0 ? 0 : Math.PI;
      // In front of the case (0.05 deep each way), so the dial never shares its plane.
      const face = new THREE.Mesh(disc, faceMaterial);
      face.position.z = 0.058;
      dial.add(face);
      const ring = new THREE.Mesh(rim, metal);
      ring.position.z = 0.058;
      dial.add(ring);
      const make = (length, width, material, z) => {
        const pivot = new THREE.Group();
        pivot.position.z = z;
        const hand = new THREE.Mesh(box, material);
        hand.scale.set(width, length, 0.012);
        hand.position.y = length * 0.4;
        pivot.add(hand);
        dial.add(pivot);
        return pivot;
      };
      hands.push({
        hour: make(item.radius * 0.55, 0.045, handMaterial, 0.062),
        minute: make(item.radius * 0.85, 0.03, handMaterial, 0.07),
        second: make(item.radius * 0.9, 0.01, redHand, 0.078),
      });
      holder.add(dial);
    }
    const body = new THREE.Mesh(box, metal);
    body.scale.set(item.radius * 2.1, item.radius * 2.1, item.twoFaced ? 0.1 : 0.06);
    holder.add(body);
    // A short bracket up to the canopy.
    const bracket = new THREE.Mesh(box, metal);
    bracket.scale.set(0.05, 0.5, 0.05);
    bracket.position.y = item.radius + 0.25;
    holder.add(bracket);
    return { hands };
  }

  for (const item of STATION_PROPS) {
    const holder = mount(item);
    if (!holder) continue;
    const parts = item.kind === 'board' ? buildBoard(item, holder) : buildClock(item, holder);
    placed.set(item.id, { item, holder, ...parts });
  }

  const target = new THREE.Vector3();
  const normal = new THREE.Vector3();
  return {
    /** Scene clock in minutes after midnight, or null to follow the game's clock. */
    setClock(minutes) {
      clockMinutes = Number.isFinite(minutes) ? minutes : null;
    },
    update(dt, { minutes = null, dusk = false } = {}) {
      if (clockMinutes !== null && dt > 0) clockMinutes += dt / 60;
      if (Number.isFinite(minutes)) fallbackMinutes = minutes;
      const now = clockMinutes ?? fallbackMinutes;
      const seconds = (now * 60) % 60;
      for (const entry of placed.values()) {
        if (entry.face) entry.face.material.emissiveIntensity = dusk ? 0.55 : 0.12;
        for (const hand of entry.hands ?? []) {
          // Clock hands turn clockwise seen from the front: negative about +z.
          hand.hour.rotation.z = -((now / 60) % 12) * 5 * MINUTE;
          hand.minute.rotation.z = -(now % 60) * MINUTE;
          hand.second.rotation.z = -seconds * MINUTE;
        }
      }
    },
    /** Where a prop is and where an insert camera stands to read it. */
    subject(id) {
      const entry = placed.get(id);
      if (!entry) return null;
      entry.holder.updateWorldMatrix(true, false);
      entry.holder.getWorldPosition(target);
      normal.set(0, 0, 1).transformDirection(entry.holder.matrixWorld);
      // Far enough back that the whole board fits inside the 2.39:1 letterbox.
      const distance = entry.item.kind === 'board' ? entry.item.size[0] * 2.1 : 2.6;
      const eye = target.clone().addScaledVector(normal, distance);
      eye.y -= 0.1;
      return {
        point: target.toArray(),
        eye: eye.toArray(),
        lens: entry.item.kind === 'board' ? 32 : 45,
      };
    },
    minutes: () => clockMinutes ?? fallbackMinutes,
    getState: () => ({
      props: [...placed.keys()],
      clock: clockMinutes === null ? null : Number(clockMinutes.toFixed(2)),
    }),
    dispose() {
      for (const entry of placed.values()) entry.holder.removeFromParent();
      group.removeFromParent();
      for (const item of owned) item.dispose();
    },
  };
}
