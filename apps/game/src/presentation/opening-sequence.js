import { TRAIN_SPAN } from '../train/consist.js';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const OPENING_SHOT_SECONDS = 9;
const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

export function sampleOpening(elapsed, reducedMotion = false) {
  const shot = reducedMotion ? 2 : Math.floor(elapsed / OPENING_SHOT_SECONDS) % 4;
  const phase = reducedMotion ? 0.5 : (elapsed % OPENING_SHOT_SECONDS) / OPENING_SHOT_SECONDS;
  return {
    season: SEASONS[shot],
    shot,
    phase,
    veil: reducedMotion
      ? 0
      : Math.max(1 - smooth(phase / 0.12), smooth((phase - 0.88) / 0.12)) * 0.94,
    snow: shot === 3 ? 1 : 0,
    weather: shot === 3 ? 'snow' : 'clear',
  };
}

/** Distinct bearings keep the consist central while showing the surrounding valley. */
export function openingShotPose(shot, phase) {
  const t = smooth(phase);
  return [
    { name: 'riverside', side: -76 + t * 12, along: 28 - t * 8, height: 30 + t * 3 },
    { name: 'rear-quarter', side: 48 + t * 8, along: -76 + t * 12, height: 42 - t * 5 },
    { name: 'opposite-bank', side: 74 - t * 10, along: 35 + t * 10, height: 36 + t * 4 },
    { name: 'valley-map', side: -22 + t * 22, along: -28 + t * 10, height: 132 - t * 12 },
  ][shot];
}
const OPENING_CAST = {
  spring: ['japanese-hare', 'japanese-squirrel', 'japanese-white-eye'],
  summer: ['tanuki', 'barn-swallow', 'kingfisher'],
  autumn: ['sika-deer', 'wild-boar', 'varied-tit'],
  winter: ['red-fox', 'japanese-macaque', 'long-tailed-tit'],
};

/** Opening presentation is separate from the route clock, saves and player preferences. */
export function createOpeningSequence({
  THREE,
  camera,
  terrainHeight,
  foliageHeight = () => -Infinity,
  reducedMotion = false,
}) {
  let elapsed = 0,
    mix = 1,
    ended = false,
    current = sampleOpening(0, reducedMotion);
  const introEye = new THREE.Vector3(),
    target = new THREE.Vector3(),
    forward = new THREE.Vector3(),
    side = new THREE.Vector3(),
    sightline = new THREE.Vector3(),
    lookCamera = camera.clone();
  let preparedShot = -1,
    shotHeight = 0;
  const probeEye = new THREE.Vector3();
  const lastEye = new THREE.Vector3(),
    lastRotation = new THREE.Quaternion();
  const tint = { value: new THREE.Color('#98b886') },
    amount = { value: 1 };
  const colors = ['#d1b7b0', '#72a66a', '#c09a51', '#bac9c3'].map((c) => new THREE.Color(c));
  const overlay = document.createElement('div');
  overlay.className = 'opening-film';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML =
    '<div class="opening-film__veil"></div><div class="opening-film__season"></div><div class="opening-film__rule"></div>';
  document.body.append(overlay);
  const veil = overlay.querySelector('.opening-film__veil'),
    label = overlay.querySelector('.opening-film__season');
  let lastSeason;
  return {
    update(dt, { started, suspended = false } = {}) {
      if (started) ended = true;
      if (!suspended && !ended && !reducedMotion) elapsed += Math.max(0, dt);
      if (!suspended)
        mix = ended ? Math.max(0, mix - Math.max(0, dt) / (reducedMotion ? 0.01 : 1.8)) : 1;
      current = sampleOpening(elapsed, reducedMotion);
      amount.value = mix * 0.72;
      tint.value.copy(colors[current.shot]);
      overlay.hidden = mix === 0;
      overlay.style.opacity = String(mix);
      veil.style.opacity = String(ended ? 0 : current.veil);
      if (lastSeason !== current.season) {
        lastSeason = current.season;
        label.textContent = `${String(current.shot + 1).padStart(2, '0')} / ${current.season.toUpperCase()} · THE LINE REMEMBERS`;
      }
      return { ...current, active: !ended, mix, elapsed, reducedMotion };
    },
    applyCamera(trainPosition, rearPosition) {
      if (!mix) return;
      if (!ended) {
        const pose = openingShotPose(current.shot, current.phase);
        forward.subVectors(trainPosition, rearPosition).normalize();
        side.set(forward.z, 0, -forward.x).normalize();
        target.copy(trainPosition).lerp(rearPosition, 0.5);
        target.y += 2;
        introEye.copy(target).addScaledVector(side, pose.side).addScaledVector(forward, pose.along);
        introEye.y = target.y + pose.height;
        // Survey the whole short dolly before revealing it. A single clearance
        // height prevents discrete canopy cells from kicking the camera each frame.
        if (preparedShot !== current.shot) {
          preparedShot = current.shot;
          shotHeight = 0;
          for (let step = 0; step <= 32; step++) {
            const probe = openingShotPose(current.shot, step / 32);
            probeEye
              .copy(target)
              .addScaledVector(side, probe.side)
              .addScaledVector(forward, probe.along);
            shotHeight = Math.max(shotHeight, probe.height);
            for (let i = 2; i <= 32; i++) {
              const fraction = i / 32;
              sightline.lerpVectors(target, probeEye, fraction);
              const away = Math.hypot(sightline.x - target.x, sightline.z - target.z) > 12;
              const floor =
                Math.max(
                  terrainHeight(sightline.x, sightline.z),
                  away ? foliageHeight(sightline.x, sightline.z) : -Infinity,
                ) + 5;
              shotHeight = Math.max(shotHeight, (floor - target.y) / fraction);
            }
          }
        }
        introEye.y = target.y + shotHeight;
        // Reserve the left of frame for the opening title without losing the train.
        side
          .subVectors(target, introEye)
          .cross(new THREE.Vector3(0, 1, 0))
          .normalize();
        target.addScaledVector(side, -17);
        target.y -= 5;
        lookCamera.position.copy(introEye);
        lookCamera.lookAt(target);
        lastEye.copy(introEye);
        lastRotation.copy(lookCamera.quaternion);
      }
      camera.position.lerp(lastEye, smooth(mix));
      camera.quaternion.slerp(lastRotation, smooth(mix));
      camera.updateMatrixWorld(true);
    },
    tintMaterial(material) {
      const previous = material.onBeforeCompile,
        key = material.customProgramCacheKey();
      material.onBeforeCompile = function (shader, renderer) {
        previous.call(this, shader, renderer);
        shader.uniforms.openingTint = tint;
        shader.uniforms.openingAmount = amount;
        shader.fragmentShader =
          'uniform vec3 openingTint; uniform float openingAmount;\n' +
          shader.fragmentShader.replace(
            '#include <color_fragment>',
            '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, openingTint * (0.55 + dot(diffuseColor.rgb, vec3(0.15,0.3,0.15))), openingAmount);',
          );
      };
      material.customProgramCacheKey = () => `${key}:opening-seasons-v1`;
      material.needsUpdate = true;
    },
    getState: () => ({
      ...current,
      cameraShot: openingShotPose(current.shot, current.phase).name,
      elapsed,
      mix,
      active: !ended,
      reducedMotion,
    }),
    dispose() {
      overlay.remove();
    },
  };
}

/** Authored parallel paths stay on the dry railway-side bank, never across the rails. */
export function openingAnimalPose(species, index, opening, train, center, terrain) {
  if (!opening?.active || index >= 3 || !OPENING_CAST[opening.season]?.includes(species))
    return null;
  const bird = [
    'japanese-white-eye',
    'barn-swallow',
    'varied-tit',
    'long-tailed-tit',
    'kingfisher',
  ].includes(species);
  const mammal = [
    'sika-deer',
    'japanese-hare',
    'tanuki',
    'red-fox',
    'japanese-squirrel',
    'japanese-macaque',
    'wild-boar',
  ].includes(species);
  if (!bird && !mammal) return null;
  const t = opening.reducedMotion ? 4.5 : opening.phase * OPENING_SHOT_SECONDS;
  const z =
    train.z - TRAIN_SPAN / 2 + (bird ? -20 + t * 5 : -15 + t * 1.4) - index * (bird ? 3 : 4);
  const u = bird ? 29 + Math.sin(t * 0.25 + index) * 8 : 40 + index * 1.4;
  return {
    x: center(z) + u,
    y: bird ? Math.max(train.y + 10, terrain(u, z) + 5) : terrain(u, z),
    z,
    heading: 0,
    walking: mammal && !opening.reducedMotion,
    flying: bird,
    time: opening.reducedMotion ? 0 : opening.elapsed,
    season: opening.season,
    graze: 0,
    alert: false,
    hop:
      species === 'japanese-hare' && !opening.reducedMotion
        ? Math.max(0, Math.sin(t * 4)) * 0.18
        : 0,
  };
}
