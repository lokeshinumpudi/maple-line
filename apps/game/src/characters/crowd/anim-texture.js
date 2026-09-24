/**
 * Baked animation for the mid tier. Each clip is sampled at MID_FPS into rows of a float
 * texture; a row holds one 4x4 matrix per bone (4 texels) that takes a bind-pose vertex
 * to its posed place in the character's own frame. The vertex shader reads two rows and
 * blends them, and can blend a second clip for cross-fades (material.js).
 *
 * The layout and sampling maths are plain functions (tested in tests/crowd-kit.test.js);
 * `bakeClips` needs three.js and a loaded kit VRM. The texture is made in the browser from
 * the shared clip file, so it adds nothing to the download.
 */
export const MID_FPS = 20;

/**
 * Rows for each clip. A loop stores `frames` samples at t = i / rate and wraps from the
 * last back to the first; a one-shot stores both ends and holds the last.
 * @param {{name: string, duration: number, loop?: boolean}[]} clips
 */
export function bakeLayout(clips, fps = MID_FPS) {
  const out = {};
  let row = 0;
  for (const { name, duration, loop = true } of clips) {
    const length = Math.max(1 / fps, duration);
    const frames = loop ? Math.max(1, Math.round(length * fps)) : Math.max(2, Math.round(length * fps) + 1);
    out[name] = {
      name,
      start: row,
      frames,
      duration: length,
      loop,
      // Samples per second actually stored, so a loop's last-to-first step is one sample.
      rate: loop ? frames / length : (frames - 1) / length,
    };
    row += frames;
  }
  return { fps, rows: row, clips: out };
}

/** Time of sample `index` in a clip's own clock. */
export function sampleTime(entry, index) {
  return index / entry.rate;
}

/**
 * The two rows to blend for clip time `time`, and the blend fraction.
 * @returns {{ row0: number, row1: number, t: number }}
 */
export function sampleClip(entry, time) {
  if (!entry) return { row0: 0, row1: 0, t: 0 };
  if (entry.loop) {
    const wrapped = ((time % entry.duration) + entry.duration) % entry.duration;
    const u = wrapped * entry.rate;
    const f0 = Math.floor(u) % entry.frames;
    const f1 = (f0 + 1) % entry.frames;
    return { row0: entry.start + f0, row1: entry.start + f1, t: u - Math.floor(u) };
  }
  const u = Math.min(entry.duration, Math.max(0, time)) * entry.rate;
  const f0 = Math.min(entry.frames - 1, Math.floor(u));
  const f1 = Math.min(entry.frames - 1, f0 + 1);
  return { row0: entry.start + f0, row1: entry.start + f1, t: f1 === f0 ? 0 : u - f0 };
}

/** Linear blend of two sampled matrices (column-major arrays), as the shader does. */
export function blendMatrices(a, b, t, out = Array.from({ length: 16 })) {
  for (let i = 0; i < 16; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/** Bones that skin at least one vertex of `geometry`, in first-use order. */
export function usedBones(skinIndex, skinWeight) {
  const used = new Map();
  for (let i = 0; i < skinIndex.count; i++)
    for (let k = 0; k < 4; k++) {
      if (skinWeight.getComponent(i, k) <= 0) continue;
      const bone = skinIndex.getComponent(i, k);
      if (!used.has(bone)) used.set(bone, used.size);
    }
  return used;
}

/**
 * Sample `clips` on a kit VRM into a bone texture for the mid tier's geometry.
 * @param {object} options
 * @param {typeof import('three')} options.THREE
 * @param {object} options.vrm a loaded VRM (its own instance; its pose is changed)
 * @param {import('three').SkinnedMesh} options.mesh the mid-tier skinned mesh inside vrm.scene
 * @param {Map<string, import('three').AnimationClip>} options.clips name -> clip for this VRM
 * @param {{name: string, loop?: boolean}[]} options.list which clips to bake, in order
 * @param {Array<{node: import('three').Object3D, q: import('three').Quaternion}>} [options.posture]
 */
export function bakeClips({ THREE, vrm, mesh, clips, list, posture = [], fps = MID_FPS }) {
  const available = list.filter((item) => clips.has(item.name));
  const layout = bakeLayout(
    available.map((item) => ({ ...item, duration: clips.get(item.name).duration })),
    fps,
  );
  const geometry = mesh.geometry;
  const used = usedBones(geometry.attributes.skinIndex, geometry.attributes.skinWeight);
  const bones = [...used.keys()];
  const width = bones.length * 4;
  const data = new Float32Array(width * layout.rows * 4);
  const mixer = new THREE.AnimationMixer(vrm.scene);
  const root = vrm.scene;
  const skeleton = mesh.skeleton;
  const rootInverse = new THREE.Matrix4();
  const toLocal = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  for (const item of available) {
    const entry = layout.clips[item.name];
    mixer.stopAllAction();
    const action = mixer.clipAction(clips.get(item.name));
    action.setLoop(entry.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !entry.loop;
    action.reset().play();
    for (let f = 0; f < entry.frames; f++) {
      mixer.setTime(Math.min(sampleTime(entry, f), entry.duration - 1e-4));
      for (const { node, q } of posture) node?.quaternion.multiply(q);
      vrm.humanoid.update();
      root.updateMatrixWorld(true);
      rootInverse.copy(root.matrixWorld).invert();
      // Skinned vertex in the character's frame: root^-1 * mesh * bind^-1 * bone * boneInverse * bind.
      toLocal.multiplyMatrices(rootInverse, mesh.matrixWorld).multiply(mesh.bindMatrixInverse);
      const rowOffset = (entry.start + f) * width * 4;
      bones.forEach((bone, i) => {
        matrix
          .multiplyMatrices(skeleton.bones[bone].matrixWorld, skeleton.boneInverses[bone])
          .multiply(mesh.bindMatrix)
          .premultiply(toLocal);
        matrix.toArray(data, rowOffset + i * 16);
      });
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  const texture = new THREE.DataTexture(data, width, layout.rows, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.name = 'Crowd / baked clips';
  return { texture, layout, bones, boneIndex: used, width };
}
