/**
 * The crowd: every simulated person who is not one of the Momiji hero VRMs, drawn at one of
 * three detail levels by distance to the camera (lod.js):
 *
 * - near: pooled hero-cast characters on a kit body (world/hero-cast.js: UAL clips, steering,
 *   look-at, foot planting, blink, smile and talking), coloured and dressed by the palette
 *   material. A slot is bound to a base body and moves between people of that body.
 * - mid: one InstancedMesh per base body. Clips are baked into a bone texture when the body
 *   loads (anim-texture.js); per instance the look, two clip samples, a cross-fade and a
 *   blink go to the GPU.
 * - far: the source's own simple figure, tinted to the person's palette.
 *
 * Sources (the Momiji population, each station's residents, the carriages) report people
 * every frame with `collect(push)`; the crowd never moves anyone. Simulation positions,
 * poses, intents and minds stay where they are; see docs/CROWD.md for the source contract.
 */
import { createHeroCast, heroClip, INTENT_HOLD_SECONDS, VRM_CLIPS } from '../../world/hero-cast.js';
import { vrmGait, postureOffsets } from '../vrm-actor.js';
import { strideTimeScale } from '../../world/character-motion.js';
import { bodySpec, BODY_IDS, outfitIndex, partMask } from './kit.js';
import { lookFor } from './looks.js';
import { createPalette } from './palette.js';
import {
  createKitDepthMaterial,
  createKitMaterial,
  decodeKitAttributes,
  kitUniforms,
  trianglesForMask,
} from './material.js';
import { bakeClips, sampleClip } from './anim-texture.js';
import { seatedVariantClips, seatedVariantFor } from './clips.js';
import { assignSlots, CROWD_TIERS, LOD_DEFAULTS, selectTiers } from './lod.js';

/** Clips baked for the mid tier, in texture order. */
export const MID_CLIPS = Object.freeze([
  { name: 'idle' },
  { name: 'walk' },
  { name: 'walk-formal' },
  { name: 'walk-carry' },
  { name: 'hurry' },
  { name: 'sit' },
  { name: 'sit-phone' },
  { name: 'sit-read' },
  { name: 'sit-doze' },
  { name: 'sit-window' },
  { name: 'chat' },
  { name: 'check-phone' },
  { name: 'watch-train' },
  { name: 'wave' },
  { name: 'stretch' },
  { name: 'nod-yes' },
  { name: 'shake-no' },
  { name: 'board', loop: false },
]);
const SEATED = new Set(['reading', 'seated']);
const FADE_SECONDS = 0.35;
const CLIP_FADE_SECONDS = 0.4;
const MID_CAPACITY = 160;

/** Per-person clip names: suits walk formally, seated people get their activity's variant. */
export function clipVariantsFor(look, record) {
  const variants = {};
  if (look.outfit === 'suit' || look.outfit === 'staff') variants.walk = 'walk-formal';
  const seated = seatedVariantFor(record.activity);
  if (seated !== 'sit') variants.sit = seated;
  return variants;
}

export function createCrowd({
  THREE,
  scene,
  vrmLoader,
  // models/characters/props GLBs for story roles (rendering/model-loader.js `get`).
  propLoader = { get: async () => null },
  minds = null,
  mobile = false,
  tier = 'high',
  clips: clipsPath = VRM_CLIPS,
  random = Math.random,
}) {
  const palette = createPalette(THREE, { rows: 1024 });
  const bodies = new Map(BODY_IDS.map((id) => [id, { id, status: 'idle', mid: null }]));
  const people = new Map();
  const sources = new Map();
  const slots = [];
  const roles = new Map();
  const talking = new Map();
  let settings = { ...LOD_DEFAULTS, ...(CROWD_TIERS[tier] ?? CROWD_TIERS.high) };
  let tiers = new Map();
  let elapsed = 0;
  let disposed = false;
  const records = [];
  const cameraPoint = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scaleVector = new THREE.Vector3();
  const position = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let stats = { near: 0, mid: 0, far: 0, drawCalls: 0, triangles: 0 };

  // ------------------------------------------------------------------------------------
  // Base bodies: a template VRM per body bakes the mid tier's clips and geometry.

  async function loadBody(entry) {
    entry.status = 'loading';
    const spec = bodySpec(entry.id);
    const [loaded, clipSet] = await Promise.all([
      vrmLoader.vrm(spec.file),
      vrmLoader.animations(clipsPath),
    ]);
    if (disposed) return;
    if (!loaded || !clipSet) {
      entry.status = 'failed';
      return;
    }
    const { vrm, m } = loaded;
    if (vrm.lookAt && m.VRMLookAtQuaternionProxy) {
      const proxy = new m.VRMLookAtQuaternionProxy(vrm.lookAt);
      proxy.name = 'VRMLookAtQuaternionProxy';
      vrm.scene.add(proxy);
    }
    const clips = new Map();
    clipSet.animations.forEach((animation, i) => {
      const clip = m.createVRMAnimationClip(animation, vrm);
      clip.name = clipSet.names[i] ?? `clip-${i}`;
      clips.set(clip.name, clip);
    });
    for (const [alias, target] of Object.entries(clipSet.extras?.aliases ?? {}))
      if (!clips.has(alias) && clips.has(target)) clips.set(alias, clips.get(target));
    for (const clip of seatedVariantClips(THREE, vrm, clips)) clips.set(clip.name, clip);
    const hipsHeight = vrm.humanoid.normalizedRestPose.hips?.position?.[1] ?? 0.86;
    const gait = vrmGait(clipSet.extras, hipsHeight);
    const posture = postureOffsets(vrm.scene.userData?.posture ?? {}).map(([bone, degrees]) => ({
      node: vrm.humanoid.getNormalizedBoneNode(bone),
      q: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        THREE.MathUtils.degToRad(degrees),
      ),
    }));
    const lod1 = vrm.scene.getObjectByName('Kit_LOD1');
    const skinned = lod1?.isSkinnedMesh ? lod1 : lod1?.children.find((child) => child.isSkinnedMesh);
    if (!skinned) {
      entry.status = 'failed';
      console.warn(`${spec.file} has no Kit_LOD1 mesh`);
      return;
    }
    const bake = bakeClips({ THREE, vrm, mesh: skinned, clips, list: MID_CLIPS, posture });
    entry.mid = createMidMesh(entry.id, skinned.geometry, bake);
    entry.gait = gait;
    entry.layout = bake.layout;
    entry.bake = bake;
    m.VRMUtils.deepDispose(vrm.scene);
    entry.status = 'ready';
  }

  function createMidMesh(bodyId, source, bake) {
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(source.index.clone());
    for (const name of ['position', 'normal', 'uv', 'uv1', 'uv2', 'skinWeight'])
      geometry.setAttribute(name, source.attributes[name].clone());
    const skinIndex = source.attributes.skinIndex;
    const compact = new Float32Array(skinIndex.count * 4);
    for (let i = 0; i < skinIndex.count; i++)
      for (let k = 0; k < 4; k++)
        compact[i * 4 + k] = bake.boneIndex.get(skinIndex.getComponent(i, k)) ?? 0;
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(compact, 4));
    const blinkIndex = source.morphAttributes.position ? 0 : -1;
    const blink =
      blinkIndex >= 0
        ? source.morphAttributes.position[blinkIndex].clone()
        : new THREE.BufferAttribute(new Float32Array(source.attributes.position.count * 3), 3);
    geometry.setAttribute('kitBlink', blink);
    decodeKitAttributes(THREE, geometry);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4);
    const uniforms = kitUniforms(THREE, { palette: palette.texture, bones: bake.texture });
    const material = createKitMaterial(THREE, { mode: 'mid', uniforms, name: `Crowd / mid / ${bodyId}` });
    const mesh = new THREE.InstancedMesh(geometry, material, MID_CAPACITY);
    mesh.name = `Crowd / mid / ${bodyId}`;
    const attribute = (name) => {
      const value = new THREE.InstancedBufferAttribute(new Float32Array(MID_CAPACITY * 4), 4);
      value.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, value);
      return value;
    };
    const animA = attribute('kitAnimA');
    const animB = attribute('kitAnimB');
    const look = attribute('kitLook');
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = settings.shadows;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = createKitDepthMaterial(THREE, { mode: 'mid', uniforms });
    scene.add(mesh);
    return { mesh, geometry, material, uniforms, animA, animB, look };
  }

  // ------------------------------------------------------------------------------------
  // Near slots: pooled hero-cast characters.

  /**
   * A near figure of one base body. Pooled slots move between people; a dedicated slot
   * (`personId` given: a story role with hand props) stays with its person.
   */
  function createSlot(bodyId, { personId = null, props = null, variants = {}, seatHeight = null } = {}) {
    const spec = bodySpec(bodyId);
    const uniforms = kitUniforms(THREE, { palette: palette.texture });
    const slot = {
      body: bodyId,
      personId,
      dedicated: Boolean(personId),
      ready: false,
      hero: null,
      uniforms,
      mesh: null,
      mask: 1,
      hiddenProps: '',
    };
    const figures = {
      setStandIn() {},
      figureOf: (id) => {
        const person = people.get(id);
        if (!person?.record || slot.personId !== id) return null;
        const r = person.record;
        return {
          position: r.position,
          heading: r.heading,
          visible: person.nm > 0.001 && person.present,
          walking: r.walking,
          pose: r.pose,
          state: r.state,
          seatHeight: r.seatHeight,
          intent: r.intent ?? null,
        };
      },
    };
    slot.hero = createHeroCast({
      THREE,
      scene,
      loader: propLoader,
      worldDetails: figures,
      minds,
      personId,
      props,
      clipVariants: variants,
      seatHeight,
      vrm: spec.file,
      vrmLoader,
      clips: clipsPath,
      mobile,
      random,
      extraClips: (vrm, _m, clips) => seatedVariantClips(THREE, vrm, clips),
      prepare: ({ root }) => {
        const mid = [];
        root.traverse((node) => {
          if (!node.isMesh) return;
          if (node.name.startsWith('Kit_LOD1') || node.parent?.name?.startsWith('Kit_LOD1')) {
            mid.push(node);
            return;
          }
          decodeKitAttributes(THREE, node.geometry);
          node.material = createKitMaterial(THREE, { mode: 'near', uniforms, name: `Crowd / near / ${bodyId}` });
          node.customDepthMaterial = createKitDepthMaterial(THREE, { mode: 'near', uniforms });
          node.castShadow = settings.shadows;
          node.receiveShadow = true;
          node.frustumCulled = false;
          slot.mesh = node;
        });
        // The mid-tier mesh is drawn by the instanced batch; a near figure does not need it.
        for (const node of mid) {
          node.removeFromParent();
          node.geometry.dispose();
        }
      },
    });
    // Pooled figures hold nothing: the hand and grip layers (finger curls, prop IK) are off.
    if (!personId) slot.hero.setDebug({ layers: { hands: false, grip: false } });
    slot.hero.ready.then(() => {
      slot.ready = slot.hero.getState().status === 'ready';
      if (!slot.personId) slot.hero.root?.removeFromParent();
    });
    slots.push(slot);
    return slot;
  }

  // ------------------------------------------------------------------------------------
  // People.

  function personFor(record) {
    let person = people.get(record.id);
    if (!person) {
      person = {
        id: record.id,
        record,
        look: null,
        lookInputs: {},
        row: 0,
        mask: 1,
        outfit: 0,
        nm: 0,
        vis: 0,
        present: true,
        speed: 0,
        last: null,
        anim: { clip: 'idle', time: random() * 3, prev: null, prevTime: 0, blend: 1 },
        blinkIn: 1 + random() * 4,
        blinkT: -1,
        intent: { shown: null, since: Infinity },
        hidden: false,
        tinted: null,
      };
      people.set(record.id, person);
    }
    person.record = record;
    return person;
  }

  function updateLook(person, context) {
    const r = person.record;
    const named = roles.get(r.id) ?? r.named ?? null;
    const inputs = person.lookInputs;
    if (
      person.look &&
      inputs.named === named &&
      inputs.weather === context.weather &&
      inputs.season === context.season &&
      inputs.indoors === Boolean(r.indoors) &&
      inputs.role === r.role
    )
      return;
    Object.assign(inputs, {
      named,
      weather: context.weather,
      season: context.season,
      indoors: Boolean(r.indoors),
      role: r.role,
    });
    person.look = lookFor({
      id: r.id,
      role: r.role,
      age: r.age,
      named,
      region: r.region,
      season: context.season,
      weather: context.weather,
      indoors: r.indoors,
      seated: SEATED.has(r.pose),
    });
    person.row = palette.acquire(r.id, person.look.colors);
    person.mask = partMask(person.look.body, person.look);
    person.outfit = outfitIndex(person.look.body, person.look.outfit);
    person.variants = clipVariantsFor(person.look, r);
  }

  function blinkFor(person, dt) {
    person.blinkIn -= dt;
    if (person.blinkIn <= 0 && person.blinkT < 0) {
      person.blinkT = 0;
      person.blinkIn = 2.2 + random() * 4;
    }
    if (person.blinkT < 0) return 0;
    person.blinkT += dt;
    const t = person.blinkT;
    const lid = t < 0.07 ? t / 0.07 : Math.max(0, 1 - (t - 0.07) / 0.09);
    if (t > 0.16) person.blinkT = -1;
    return lid;
  }

  /** The mid tier's clip for a person this frame, with a held intent and variants. */
  function midClip(person, body, dt) {
    const r = person.record;
    const expression = minds?.expressionFor?.(r.id);
    const wanted = r.intent ?? expression?.intent ?? 'continue';
    person.intent.since += dt;
    if (wanted !== person.intent.shown && person.intent.since >= INTENT_HOLD_SECONDS) {
      person.intent.shown = wanted;
      person.intent.since = 0;
    }
    const layout = body.layout.clips;
    const walkName = layout[person.variants.walk] ? person.variants.walk : 'walk';
    const choice = heroClip({
      speed: person.speed,
      intent: person.intent.shown,
      pose: r.pose,
      state: r.state,
      walkSpeed: body.gait.speeds[walkName] ?? body.gait.walkSpeed,
      hurrySpeed: body.gait.hurrySpeed,
      hurrying: person.anim.clip === 'hurry',
    });
    if (choice.clip === 'walk') choice.clip = walkName;
    else if (person.variants[choice.clip] && layout[person.variants[choice.clip]])
      choice.clip = person.variants[choice.clip];
    if (!layout[choice.clip]) choice.clip = 'idle';
    if (choice.clip === walkName)
      choice.timeScale = strideTimeScale(person.speed, body.gait.speeds[walkName] ?? body.gait.walkSpeed);
    return choice;
  }

  function advanceAnim(person, choice, dt) {
    const anim = person.anim;
    if (choice.clip !== anim.clip) {
      anim.prev = anim.clip;
      anim.prevTime = anim.time;
      anim.blend = 0;
      anim.clip = choice.clip;
      anim.time = choice.once ? 0 : random() * 2;
    }
    anim.time += dt * choice.timeScale;
    if (anim.prev) {
      anim.prevTime += dt;
      anim.blend = Math.min(1, anim.blend + dt / CLIP_FADE_SECONDS);
      if (anim.blend >= 1) anim.prev = null;
    }
  }

  function writeMid(body, index, person, blink) {
    const mid = body.mid;
    const r = person.record;
    const gait = body.gait;
    const seated = SEATED.has(r.pose);
    position.set(r.position.x, r.position.y, r.position.z);
    if (seated) {
      position.x += Math.sin(r.heading) * gait.seatBack;
      position.z += Math.cos(r.heading) * gait.seatBack;
      if (Number.isFinite(r.seatHeight)) position.y += r.seatHeight - gait.seatHeight;
    }
    quaternion.setFromAxisAngle(yAxis, r.heading);
    scaleVector.setScalar(person.look.scale);
    matrix.compose(position, quaternion, scaleVector);
    mid.mesh.setMatrixAt(index, matrix);
    const layout = body.layout.clips;
    const a = sampleClip(layout[person.anim.clip], person.anim.time);
    const fade = person.vis * (1 - person.nm);
    if (person.anim.prev && layout[person.anim.prev]) {
      // The current clip is B, blended in; the previous clip is A.
      const p = sampleClip(layout[person.anim.prev], person.anim.prevTime);
      mid.animA.setXYZW(index, p.row0, p.row1, p.t, person.anim.blend);
      mid.animB.setXYZW(index, a.row0, a.row1, a.t, fade);
    } else {
      mid.animA.setXYZW(index, a.row0, a.row1, a.t, 0);
      mid.animB.setXYZW(index, a.row0, a.row1, a.t, fade);
    }
    mid.look.setXYZW(index, person.row, person.outfit, person.mask, blink);
  }

  // ------------------------------------------------------------------------------------

  function update(dt, context = {}) {
    if (disposed) return;
    // Real time for fades and story figures; simulation time (0 while paused) for the rest.
    const real = dt > 0 ? Math.min(dt, 0.1) : 0;
    const step = context.paused ? 0 : real;
    elapsed += real;
    const weather = context.weather ?? 'clear';
    const season = context.season ?? 'autumn';
    records.length = 0;
    for (const source of sources.values()) source.collect?.((record) => records.push(record), context);
    if (context.camera) context.camera.getWorldPosition(cameraPoint);
    for (const person of people.values()) person.present = false;
    const candidates = [];
    for (const record of records) {
      const person = personFor(record);
      person.present = true;
      if (person.source !== record.source) {
        // Boarding or alighting moves a person between sources: show them in the old one.
        if (person.hidden) sources.get(person.source)?.hide?.(person.id, false);
        person.hidden = false;
        person.tinted = null;
        person.source = record.source;
      }
      updateLook(person, { weather, season });
      // Speed from movement: the drawn clip and stride follow what the body really does.
      const p = record.position;
      if (person.last && step > 0) {
        const d = Math.hypot(p.x - person.last.x, p.z - person.last.z);
        const measured = d > 3 ? person.speed : d / step;
        const target = record.walking ? measured : 0;
        person.speed += (target - person.speed) * (1 - Math.exp(-step / 0.25));
      }
      person.last = { x: p.x, z: p.z };
      const body = bodies.get(person.look.body);
      // Riders seen through carriage windows rank as further away unless the camera is aboard.
      const indoorScale = record.indoors && !context.insideTrain ? 2.5 : 1;
      const distance =
        Math.hypot(p.x - cameraPoint.x, p.y - cameraPoint.y, p.z - cameraPoint.z) * indoorScale;
      if (body.status === 'idle' && distance < settings.midExit) void loadBody(body);
      if (body.status !== 'ready' || !record.visible) continue;
      candidates.push({ id: record.id, distance, priority: record.priority ?? (roles.has(record.id) ? 1 : 0) });
    }
    tiers = selectTiers(candidates, tiers, elapsed, settings);

    // Story roles keep their own near figure with hand props.
    const dedicated = new Set();
    for (const c of candidates) {
      const person = people.get(c.id);
      if (!person.record.dedicated) continue;
      dedicated.add(c.id);
      let slot = slots.find((s) => s.dedicated && s.personId === c.id);
      if (!slot)
        slot = createSlot(person.look.body, {
          personId: c.id,
          props: person.look.props,
          variants: person.variants,
          seatHeight: person.record.seatHeight ?? null,
        });
      const hiddenProps = (person.record.hiddenProps ?? []).join(',');
      if (slot.hiddenProps !== hiddenProps) {
        slot.hiddenProps = hiddenProps;
        slot.hero.setPocketed?.(person.record.hiddenProps ?? []);
      }
    }
    // Pooled near slots follow the closest people of their body.
    const nearIds = candidates
      .filter((c) => !dedicated.has(c.id) && tiers.get(c.id)?.tier === 'near')
      .sort((a, b) => a.distance - b.distance)
      .map((c) => c.id);
    const bodyOf = (id) => people.get(id)?.look?.body;
    const pooled = slots.filter((slot) => !slot.dedicated);
    const plan = assignSlots(
      nearIds,
      pooled.map((slot) => ({ body: slot.body, personId: slot.personId, slot })),
      bodyOf,
      Math.max(0, settings.nearCount - (slots.length - pooled.length)),
    );
    for (const wrapper of plan.release) releaseSlot(wrapper.slot);
    for (const { slot, personId } of plan.assign) bindSlot(slot.slot, personId);
    for (const bodyId of plan.create) createSlot(bodyId);
    // The pool is full of the wrong bodies: retire one idle slot so the next frame can load one.
    const unbound = nearIds.filter((id) => !slots.some((slot) => slot.personId === id));
    if (unbound.length && !plan.create.length && !plan.assign.length) {
      const idle = slots.findIndex((slot) => !slot.dedicated && !slot.personId && slot.ready);
      if (idle >= 0) {
        slots[idle].hero.dispose();
        slots.splice(idle, 1);
      }
    }

    // Fades: near <-> mid by dither, mid <-> far over the simple figure.
    for (const person of people.values()) {
      const tier = person.present ? tiers.get(person.id)?.tier ?? 'far' : 'far';
      const slot = slots.find((s) => s.personId === person.id);
      const nearReady = tier === 'near' && slot?.ready;
      const rate = real / FADE_SECONDS;
      const approach = (value, target) =>
        value < target ? Math.min(target, value + rate) : Math.max(target, value - rate);
      person.vis = person.present && tier !== 'far' ? approach(person.vis, 1) : approach(person.vis, 0);
      person.nm = nearReady ? approach(person.nm, 1) : approach(person.nm, 0);
      if (!person.present) person.vis = 0;
      person.tier = tier;
      const hide = person.present && person.vis >= 1;
      if (hide !== person.hidden) {
        person.hidden = hide;
        sources.get(person.source)?.hide?.(person.id, hide);
      }
      if (person.present && person.tinted !== person.look) {
        person.tinted = person.look;
        sources.get(person.source)?.tint?.(person.id, person.look);
      }
      if (slot && !slot.dedicated && !nearReady && person.nm <= 0) releaseSlot(slot);
    }

    // Near figures.
    let nearCount = 0;
    let triangles = 0;
    let drawCalls = 0;
    for (const slot of slots) {
      const person = slot.personId ? people.get(slot.personId) : null;
      if (person) {
        slot.uniforms.kitLookU.value.set(person.row, person.outfit, person.mask, 0);
        slot.uniforms.kitFade.value = person.nm;
        const until = talking.get(person.id);
        if (until > elapsed) slot.hero.talk(Math.min(0.5, until - elapsed));
      }
      // Story roles keep breathing and talking through a paused story scene.
      slot.hero.update(slot.dedicated ? real : step, slot.dedicated ? { ...context.hero, paused: false } : (context.hero ?? {}));
      if (person && person.nm > 0 && slot.mesh) {
        nearCount++;
        drawCalls += settings.shadows ? 2 : 1;
        triangles += trianglesForMask(slot.mesh.geometry, person.mask);
      }
    }

    // Mid instances.
    const counts = new Map();
    for (const person of people.values()) {
      if (!person.present || person.vis <= 0 || person.nm >= 1) continue;
      const body = bodies.get(person.look.body);
      if (body.status !== 'ready') continue;
      const index = counts.get(body) ?? 0;
      if (index >= MID_CAPACITY) continue;
      counts.set(body, index + 1);
      const choice = midClip(person, body, step);
      advanceAnim(person, choice, step);
      writeMid(body, index, person, blinkFor(person, step));
      triangles += trianglesForMask(body.mid.geometry, person.mask);
    }
    let midCount = 0;
    for (const body of bodies.values()) {
      if (body.status !== 'ready') continue;
      const count = counts.get(body) ?? 0;
      midCount += count;
      const mid = body.mid;
      mid.mesh.count = count;
      mid.mesh.visible = count > 0;
      mid.mesh.castShadow = settings.shadows;
      if (count > 0) {
        drawCalls += settings.shadows ? 2 : 1;
        mid.mesh.instanceMatrix.needsUpdate = true;
        mid.animA.needsUpdate = true;
        mid.animB.needsUpdate = true;
        mid.look.needsUpdate = true;
      }
    }
    for (const [id, person] of people)
      if (!person.present && person.vis <= 0 && person.nm <= 0) {
        people.delete(id);
        palette.release(id);
      }
    stats = {
      near: nearCount,
      mid: midCount,
      far: [...people.values()].filter((p) => p.present && p.vis < 1).length,
      drawCalls,
      triangles,
    };
  }

  function bindSlot(slot, personId) {
    const person = people.get(personId);
    slot.personId = personId;
    // Idle figures leave the scene graph, so their bones cost nothing per frame.
    if (slot.hero.root && !slot.hero.root.parent) scene.add(slot.hero.root);
    slot.hero.assign(personId, {
      force: true,
      clipVariants: person?.variants ?? {},
      seatHeight: person?.record?.seatHeight ?? null,
    });
  }

  function releaseSlot(slot) {
    if (!slot.personId) return;
    slot.personId = null;
    slot.hero.assign(null);
    slot.hero.root?.removeFromParent();
  }

  return {
    /**
     * Add a source of people. `collect(push, context)` pushes records every frame:
     * { id, source, role, age?, named?, position: {x,y,z} (world, feet), heading (world),
     *   walking, pose, state, activity?, seatHeight?, indoors?, visible, priority? }.
     * `hide(id, hidden)` hides the source's own figure; `tint(id, look)` recolours it.
     */
    addSource(source) {
      sources.set(source.id, source);
    },
    removeSource(id) {
      sources.delete(id);
    },
    /** Dress an entity as a named role (NAMED_LOOKS) while cast, e.g. by a drama episode. */
    castRole(entity, role) {
      if (role) roles.set(entity, role);
      else roles.delete(entity);
    },
    setRoles(map = {}) {
      roles.clear();
      for (const [role, entity] of Object.entries(map)) if (entity) roles.set(entity, role);
    },
    /** Move a near figure's mouth for `seconds` (a line attributed to this entity). */
    talk(entity, seconds) {
      talking.set(entity, elapsed + seconds * 0.85);
    },
    setTier(name) {
      settings = { ...LOD_DEFAULTS, ...(CROWD_TIERS[name] ?? CROWD_TIERS.high) };
    },
    lookOf: (id) => people.get(id)?.look ?? null,
    update,
    getState() {
      return {
        bodies: Object.fromEntries([...bodies].map(([id, body]) => [id, body.status])),
        tiers: stats,
        settings: { nearCount: settings.nearCount, midCount: settings.midCount, midEnter: settings.midEnter },
        slots: slots.map((slot) => ({ body: slot.body, personId: slot.personId, ready: slot.ready })),
        people: [...people.values()]
          .filter((p) => p.present)
          .map((p) => ({
            id: p.id,
            tier: p.tier,
            body: p.look?.body,
            hair: p.look?.hair,
            outfit: p.look?.outfit,
            accessories: p.look?.accessories,
            named: p.look?.named ?? null,
            clip: p.anim.clip,
            source: p.source,
            at: [p.record.position.x, p.record.position.y, p.record.position.z].map((v) =>
              Number(v.toFixed(2)),
            ),
            fade: Number(p.vis.toFixed(2)),
            near: Number(p.nm.toFixed(2)),
          })),
        paletteRows: palette.used,
      };
    },
    dispose() {
      disposed = true;
      for (const slot of slots) slot.hero.dispose();
      for (const body of bodies.values())
        if (body.mid) {
          body.mid.mesh.removeFromParent();
          body.mid.mesh.dispose();
          body.mid.geometry.dispose();
          body.mid.material.dispose();
          body.bake?.texture.dispose();
        }
      for (const person of people.values())
        if (person.hidden) sources.get(person.source)?.hide?.(person.id, false);
      palette.dispose();
    },
  };
}
