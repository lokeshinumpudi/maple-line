/**
 * Seated clip variants made from the shared UAL clips (models/characters/vrm/cast-clips.vrma):
 * the sitting loop's legs and spine with another clip's arms, or with the head turned or
 * bowed. They are built per VRM from that VRM's own clips, so they need no extra download,
 * and the near tier (hero-cast actions) and the mid tier's baked texture use the same ones.
 *
 * - sit-phone: sitting, the phone held to the ear (arms and head of check-phone).
 * - sit-read: sitting, both hands in front at the chest as for a book or paper (the arms of
 *   walk-carry, held still), head bowed a little.
 * - sit-doze: sitting, head and neck dropped forward.
 * - sit-window: sitting, head turned and lifted toward the far window.
 */
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];

export const SEATED_VARIANTS = Object.freeze({
  'sit-phone': { overlay: 'check-phone', arms: true, head: true },
  'sit-read': { overlay: 'walk-carry', arms: true, freezeAt: 0.25, bow: { head: 16, neck: 8 } },
  'sit-doze': { bow: { head: 26, neck: 16, upperChest: 6 } },
  'sit-window': { turn: { head: 32, neck: 14 }, bow: { head: -6 } },
});

/** Which seated variant a person's activity plays (interior activities, residents). */
export function seatedVariantFor(activity) {
  if (activity === 'phone' || activity === 'check-phone') return 'sit-phone';
  if (activity === 'newspaper' || activity === 'book' || activity === 'reading') return 'sit-read';
  if (activity === 'doze' || activity === 'dozing') return 'sit-doze';
  if (activity === 'window') return 'sit-window';
  return 'sit';
}

function armBones(humanoid) {
  const names = Object.keys(humanoid.humanBones ?? {});
  return names.filter(
    (name) =>
      /^(left|right)(Shoulder|UpperArm|LowerArm|Hand)$/.test(name) ||
      FINGERS.some((finger) => name.includes(finger)),
  );
}

function nodeName(humanoid, bone) {
  return humanoid.getNormalizedBoneNode?.(bone)?.name ?? null;
}

/** A copy of `base` whose tracks for `nodes` come from `overlay` (time-stretched or frozen). */
export function spliceClip(THREE, { name, base, overlay, nodes, freezeAt = null }) {
  const owner = (track) => track.name.slice(0, track.name.lastIndexOf('.'));
  const tracks = base.tracks.filter((track) => !nodes.has(owner(track))).map((t) => t.clone());
  for (const track of overlay.tracks) {
    if (!nodes.has(owner(track)) || !track.name.endsWith('.quaternion')) continue;
    if (freezeAt !== null) {
      const value = Array.from(track.createInterpolant().evaluate(freezeAt * overlay.duration));
      tracks.push(
        new THREE.QuaternionKeyframeTrack(track.name, [0, base.duration], [...value, ...value]),
      );
    } else {
      const scale = base.duration / overlay.duration;
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          track.name,
          Array.from(track.times, (t) => t * scale),
          Array.from(track.values),
        ),
      );
    }
  }
  return new THREE.AnimationClip(name, base.duration, tracks);
}

/** Multiply every key of one bone's rotation by a local offset (pitch forward, yaw left). */
export function offsetBone(THREE, clip, node, { pitch = 0, yaw = 0 }) {
  if (!node || (!pitch && !yaw)) return;
  const offset = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ'),
  );
  const name = `${node}.quaternion`;
  let track = clip.tracks.find((t) => t.name === name);
  if (!track) {
    track = new THREE.QuaternionKeyframeTrack(name, [0, clip.duration], [0, 0, 0, 1, 0, 0, 0, 1]);
    clip.tracks.push(track);
  }
  const q = new THREE.Quaternion();
  for (let i = 0; i < track.values.length; i += 4) {
    q.fromArray(track.values, i).multiply(offset);
    q.toArray(track.values, i);
  }
}

/**
 * The seated variants for one VRM. `clips` maps clip names to that VRM's AnimationClips
 * (vrm-actor passes its own); missing sources are skipped.
 */
export function seatedVariantClips(THREE, vrm, clips) {
  const sit = clips.get('sit');
  if (!sit || !vrm?.humanoid) return [];
  const humanoid = vrm.humanoid;
  const arms = new Set(armBones(humanoid).map((bone) => nodeName(humanoid, bone)).filter(Boolean));
  const head = new Set(['neck', 'head'].map((bone) => nodeName(humanoid, bone)).filter(Boolean));
  const out = [];
  for (const [name, variant] of Object.entries(SEATED_VARIANTS)) {
    let clip;
    if (variant.overlay) {
      const overlay = clips.get(variant.overlay);
      if (!overlay) continue;
      const nodes = new Set([...(variant.arms ? arms : []), ...(variant.head ? head : [])]);
      clip = spliceClip(THREE, { name, base: sit, overlay, nodes, freezeAt: variant.freezeAt ?? null });
    } else {
      clip = sit.clone();
      clip.name = name;
    }
    for (const [bone, degrees] of Object.entries(variant.bow ?? {}))
      offsetBone(THREE, clip, nodeName(humanoid, bone), { pitch: degrees });
    for (const [bone, degrees] of Object.entries(variant.turn ?? {}))
      offsetBone(THREE, clip, nodeName(humanoid, bone), { yaw: degrees });
    out.push(clip);
  }
  return out;
}
