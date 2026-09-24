import { stationFrame } from './station-props.js';

/**
 * The Aonuma village bus and its stop: a paved bus bay behind the kiosk end of the
 * platform, a small shelter, the lane out to the village street, and the Blender-built bus
 * (asset-src/vehicles/village-bus). Nothing is drawn far from Aonuma.
 *
 * States: `parked` (engine off, doors shut, lights dim), `waiting` (headlights and
 * interior lights on, front door open), `leaving` (doors shut, drives the lane out and is
 * gone), `gone`, and `arriving` (drives in along the lane and stops at the stand, waiting).
 * Episodes cue `wait`, `leave` and `arrive` (drama-props.js).
 *
 * Coordinates are Aonuma station-local metres (stationFrame): x across, away from the rail;
 * z along the route from the stop. The platform deck is 0.6 m above the rail; the bus bay
 * is built at the same height so people step straight across.
 */
export const BUS_MODEL_PATH = 'models/vehicles/village-bus.glb';
export const BUS_STOP = Object.freeze({
  stop: 'aonuma',
  deck: 0.6,
  bay: { x: [8.7, 17.6], z: [4.6, 46] },
  // Bus centre at the stand, facing back along the route (station -z): its door side,
  // the left, faces the platform.
  stand: { x: 12.35, z: 30.6, heading: Math.PI },
  // The lane out: round the corner and across the forecourt to the village street.
  lane: [
    [12.35, 30.6],
    [12.35, 15],
    [12.9, 10.2],
    [15.6, 7.1],
    [20, 6],
    [30, 6],
    [47, 6],
  ],
  // Beside the rear half of the bus, so the platform end sees along the gap between them.
  shelter: { x: [8.85, 10.25], z: [29.2, 33.2] },
});
const DOOR_SECONDS = 1.1;
const CRUISE = 6.5; // m/s along the lane
const ACCEL = 1.6;

export function createVillageBus({
  THREE,
  scene,
  loader,
  railPoint,
  groundAt,
  stops,
  lightPool = null,
}) {
  const stop = stops.find((item) => item.id === BUS_STOP.stop);
  const frame = stationFrame(railPoint, stop.z);
  const root = new THREE.Group();
  root.name = 'Aonuma / village bus stop';
  scene.add(root);
  const owned = [];
  const own = (item) => {
    owned.push(item);
    return item;
  };
  const box = own(new THREE.BoxGeometry(1, 1, 1));
  const paving = own(new THREE.MeshStandardMaterial({ color: '#56585a', roughness: 0.62 }));
  const kerb = own(new THREE.MeshStandardMaterial({ color: '#8a8780', roughness: 0.85 }));
  const timber = own(new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 0.8 }));
  const roof = own(new THREE.MeshStandardMaterial({ color: '#3f5c58', roughness: 0.6 }));
  const lampGlass = own(
    new THREE.MeshStandardMaterial({ color: '#fff2d2', emissive: '#ffd79a', emissiveIntensity: 0 }),
  );
  const line = own(new THREE.MeshStandardMaterial({ color: '#d8c35a', roughness: 0.7 }));

  const deckY = (z) => railPoint(stop.z + z).y + BUS_STOP.deck;
  /** A box standing in station-local metres, yawed with the station. */
  function block(material, x, y, z, w, h, d, yaw = 0) {
    const mesh = new THREE.Mesh(box, material);
    const p = frame.point(x, 0, z);
    mesh.position.set(p.x, y, p.z);
    mesh.rotation.y = frame.yaw + yaw;
    mesh.scale.set(w, h, d);
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  // The bay: slabs a few metres long so the deck follows the rail's grade.
  const [bx0, bx1] = BUS_STOP.bay.x;
  for (let z = BUS_STOP.bay.z[0]; z < BUS_STOP.bay.z[1]; z += 4) {
    const zc = z + 2;
    const top = deckY(zc);
    let bottom = top - 0.8;
    for (const x of [bx0, (bx0 + bx1) / 2, bx1]) {
      const p = frame.point(x, 0, zc);
      bottom = Math.min(bottom, groundAt(p.x, p.z) - 0.5);
    }
    block(paving, (bx0 + bx1) / 2, (top + bottom) / 2, zc, bx1 - bx0, top - bottom, 4.02);
    block(kerb, bx1 + 0.12, (top + 0.12 + bottom) / 2, zc, 0.24, top + 0.12 - bottom, 4.02);
  }
  // Bay markings: a yellow box at the stand.
  for (const dz of [-3.9, 3.9])
    block(line, 12.35, deckY(30.6 + dz) + 0.005, 30.6 + dz, 2.6, 0.01, 0.12);
  for (const dx of [-1.3, 1.3]) block(line, 12.35 + dx, deckY(30.6) + 0.005, 30.6, 0.12, 0.01, 7.8);
  // The lane out, from the bay down to the village street.
  const lane = BUS_STOP.lane;
  function laneGround(x, z) {
    const inBay = x <= bx1 + 0.2 && z >= BUS_STOP.bay.z[0] - 0.2;
    if (inBay) return deckY(z);
    const p = frame.point(x, 0, z);
    const ground = groundAt(p.x, p.z) + 0.1;
    // Ramp down from the deck over the first 9 m past the bay.
    const t = Math.min(1, Math.max(0, (x - bx1) / 9));
    return deckY(z) + (ground - deckY(z)) * t;
  }
  for (let i = 3; i < lane.length - 1; i++) {
    const [x0, z0] = lane[i];
    const [x1, z1] = lane[i + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2.5);
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (x < bx1) continue;
      const top = laneGround(x, z);
      const p = frame.point(x, 0, z);
      const bottom = Math.min(top - 0.4, groundAt(p.x, p.z) - 0.4);
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      block(paving, x, (top + bottom) / 2, z, 3.6, top - bottom, 2.7, yaw);
    }
  }
  // Shelter: posts, a tin roof, a back wall and a bench, open toward the bus.
  const { x: sx, z: sz } = BUS_STOP.shelter;
  const shelterY = deckY((sz[0] + sz[1]) / 2);
  for (const x of sx) for (const z of sz) block(timber, x, shelterY + 1.25, z, 0.12, 2.5, 0.12);
  block(
    roof,
    (sx[0] + sx[1]) / 2,
    shelterY + 2.55,
    (sz[0] + sz[1]) / 2,
    sx[1] - sx[0] + 0.7,
    0.08,
    sz[1] - sz[0] + 0.6,
  );
  block(timber, sx[0], shelterY + 1.05, (sz[0] + sz[1]) / 2, 0.06, 1.7, sz[1] - sz[0]);
  block(
    timber,
    sx[0] + 0.32,
    shelterY + 0.45,
    (sz[0] + sz[1]) / 2,
    0.42,
    0.06,
    sz[1] - sz[0] - 0.3,
  );
  // A lamp under the shelter roof, and one light that makes faces readable at night.
  const lamp = block(
    lampGlass,
    (sx[0] + sx[1]) / 2,
    shelterY + 2.42,
    (sz[0] + sz[1]) / 2,
    0.36,
    0.08,
    0.36,
  );
  lamp.castShadow = false;
  // With a light pool the shelter lamp, headlights, cabin and tail lamps are pool sources:
  // real lights only while the camera is close, ground pools and wet reflections always.
  // Without one, the shelter and cabin keep their own point lights.
  const shelterLight = lightPool ? null : new THREE.PointLight('#ffd49a', 0, 9, 1.6);
  if (shelterLight) {
    shelterLight.position.copy(lamp.position).add(new THREE.Vector3(0, -0.3, 0));
    root.add(shelterLight);
  }
  const shelterSource = lightPool?.add('aonuma-bus-shelter', {
    position: lamp.position.clone().add(new THREE.Vector3(0, -0.3, 0)),
    ground: shelterY,
    color: '#ffd49a',
    intensity: 6,
    distance: 9,
    pool: 2.6,
    level: 0,
    // Faces at the stop are lit by this lamp above them; a small preference, not a fill.
    priority: 1.5,
  });
  const busSources = lightPool
    ? {
        headlights: [-1, 1].map((side) =>
          lightPool.add(`aonuma-bus-headlight-${side}`, {
            kind: 'spot',
            color: '#fff1d6',
            // Dipped beams: they light the road and legs ahead, not faces at eye level.
            intensity: 32,
            distance: 24,
            angle: 0.36,
            pool: 3.2,
            level: 0,
          }),
        ),
        tails: [-1, 1].map((side) =>
          lightPool.add(`aonuma-bus-tail-${side}`, {
            color: '#ff4a2a',
            intensity: 2.5,
            distance: 5,
            pool: 0.9,
            level: 0,
          }),
        ),
        cabin: lightPool.add('aonuma-bus-cabin', {
          color: '#ffe6bf',
          intensity: 3.5,
          distance: 5,
          pool: 2.4,
          streak: false,
          level: 0,
          lift: 0.25,
          priority: 4,
        }),
      }
    : null;

  // ---- the bus ----
  const bus = new THREE.Group();
  bus.name = 'Aonuma / village bus';
  bus.visible = false;
  root.add(bus);
  const doorLeaves = [];
  const wheels = [];
  const materials = {};
  let layout = null;
  let modelState = 'loading';
  const cabinLight = lightPool ? null : new THREE.PointLight('#ffe6bf', 0, 7, 1.7);
  if (cabinLight) {
    cabinLight.position.set(0, 2.2, 1.6);
    bus.add(cabinLight);
  }
  const busPoint = new THREE.Vector3(),
    busForward = new THREE.Vector3();
  /** Move the bus's pool sources with it; level 0..1 is how bright its lamps are. */
  function placeSources(level, cabin) {
    if (!busSources || !layout) return;
    bus.updateWorldMatrix(true, false);
    const floor = bus.position.y;
    const half = layout.halfLength ?? 3.55;
    busForward.set(0, -0.32, 1).transformDirection(bus.matrixWorld);
    busSources.headlights.forEach((source, i) => {
      busPoint.set((i ? 1 : -1) * 0.78, 0.78, half + 0.05).applyMatrix4(bus.matrixWorld);
      source.set({ position: busPoint, direction: busForward, level, ground: floor });
    });
    busSources.tails.forEach((source, i) => {
      busPoint.set((i ? 1 : -1) * 0.85, 0.9, -half - 0.08).applyMatrix4(bus.matrixWorld);
      source.set({ position: busPoint, level, ground: floor });
    });
    // The cabin lamp over the front door: whoever stands in the doorway is lit from inside,
    // behind and above, and the step and kerb get the spill.
    busPoint
      .set(layout.doorX - 0.7, 2.35, (layout.door[0] + layout.door[1]) / 2)
      .applyMatrix4(bus.matrixWorld);
    busSources.cabin.set({ position: busPoint, level: cabin, ground: floor });
  }
  const ready = loader.get(BUS_MODEL_PATH).then((gltf) => {
    if (!gltf) {
      modelState = 'failed';
      return;
    }
    const body = gltf.scene.getObjectByName('bus-body');
    const leaf = gltf.scene.getObjectByName('bus-door-front');
    const wheel = gltf.scene.getObjectByName('bus-wheel');
    if (!body || !leaf || !wheel) {
      modelState = 'failed';
      return;
    }
    layout = { ...body.userData };
    const adopt = (mesh) => {
      mesh.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        const list = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of list) materials[material.name] = material;
      });
      return mesh;
    };
    const shell = adopt(body.clone());
    shell.position.set(0, 0, 0);
    bus.add(shell);
    for (const [hinge, base] of [
      [layout.door[0], 0],
      [layout.door[1], Math.PI],
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(layout.doorX, 0, hinge);
      pivot.userData.base = base;
      pivot.add(adopt(leaf.clone()).translateX(0));
      pivot.children[0].position.set(0, 0, 0);
      pivot.rotation.y = base;
      bus.add(pivot);
      doorLeaves.push(pivot);
    }
    for (const z of layout.axles)
      for (const side of [-1, 1]) {
        const copy = adopt(wheel.clone());
        copy.position.set(side * layout.wheelX, layout.wheelRadius, z);
        bus.add(copy);
        wheels.push(copy);
      }
    for (const material of Object.values(materials)) {
      if (material.emissive && /lamp|tail|sign|light/.test(material.name))
        material.emissiveIntensity = 0;
      if (material.name === 'bus-glass') {
        material.transparent = true;
        material.depthWrite = false;
        material.emissive?.set('#ffdca8');
        material.emissiveIntensity = 0;
      }
    }
    modelState = 'ready';
    bus.visible = true;
  });

  // ---- motion along the stand and the lane ----
  const path = lane.map(([x, z]) => ({ x, z }));
  const lengths = [0];
  for (let i = 1; i < path.length; i++)
    lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  const laneLength = lengths.at(-1);
  /** Station-local point and heading at distance s along the lane (0 = the stand). */
  function along(s) {
    const d = Math.min(Math.max(s, 0), laneLength);
    let i = 1;
    while (i < path.length - 1 && lengths[i] < d) i++;
    const a = path[i - 1];
    const b = path[i];
    const t = (d - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
    // Heading turns smoothly through each corner: blend with the next segment near its end.
    const h0 = Math.atan2(b.x - a.x, b.z - a.z);
    const c = path[Math.min(i + 1, path.length - 1)];
    const h1 = i + 1 < path.length ? Math.atan2(c.x - b.x, c.z - b.z) : h0;
    const segment = lengths[i] - lengths[i - 1];
    const blend = Math.max(0, 1 - (segment - (d - lengths[i - 1])) / 3);
    const turn = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: h0 + turn * blend * 0.5 };
  }
  let state = 'parked';
  let s = 0;
  let speed = 0;
  let doors = 0;
  let wheelTurn = 0;
  let lights = 0;
  let clock = 0;

  const placeBus = () => {
    const p = along(s);
    const world = frame.point(p.x, 0, p.z);
    const y = laneGround(p.x, p.z);
    bus.position.set(world.x, y, world.z);
    bus.rotation.set(0, frame.heading(p.heading), 0);
    // Pitch with the grade over the wheelbase.
    const fore = along(s + 1.9);
    const aft = along(s - 1.9);
    const rise = laneGround(fore.x, fore.z) - laneGround(aft.x, aft.z);
    const run = Math.hypot(fore.x - aft.x, fore.z - aft.z) || 1;
    bus.rotateX(-Math.atan2(rise, run));
  };
  placeBus();

  const api = {
    ready,
    /** Episode cue: 'wait' | 'leave' | 'arrive'. */
    cue(value) {
      if (value === 'wait') {
        if (state === 'gone' || state === 'leaving') s = 0;
        state = 'waiting';
        speed = 0;
      } else if (value === 'leave') {
        if (state === 'gone') return;
        state = 'leaving';
      } else if (value === 'arrive') {
        s = laneLength;
        speed = -CRUISE;
        state = 'arriving';
      }
    },
    /** Back to parked at the stand, lights off (episode stopped or a new one started). */
    reset() {
      state = 'parked';
      s = 0;
      speed = 0;
      doors = 0;
    },
    update(dt, { camera, dusk = false, wet = 0 } = {}) {
      clock += dt;
      const near = camera ? Math.abs(camera.position.z - stop.z) < 700 : true;
      root.visible = near;
      if (!near) {
        shelterSource?.set({ level: 0 });
        placeSources(0, 0);
      }
      if (!near || !(dt > 0)) return;
      const running = state !== 'parked' && state !== 'gone';
      if (state === 'leaving') {
        // Doors shut first, then pull away.
        if (doors > 0) doors = Math.max(0, doors - dt / DOOR_SECONDS);
        else {
          speed = Math.min(CRUISE, speed + ACCEL * dt);
          s += speed * dt;
          if (s >= laneLength) {
            state = 'gone';
            speed = 0;
          }
        }
      } else if (state === 'arriving') {
        const remaining = s;
        const brake = Math.sqrt(2 * ACCEL * Math.max(0, remaining));
        speed = -Math.min(CRUISE, Math.max(0.6, brake));
        s += speed * dt;
        if (s <= 0) {
          s = 0;
          speed = 0;
          state = 'waiting';
        }
      } else if (state === 'waiting') doors = Math.min(1, doors + dt / DOOR_SECONDS);
      else doors = Math.max(0, doors - dt / DOOR_SECONDS);
      placeBus();
      bus.visible = modelState === 'ready' && state !== 'gone';
      wheelTurn += (speed * dt) / (layout?.wheelRadius ?? 0.43);
      for (const wheel of wheels) wheel.rotation.x = wheelTurn;
      const open = doors * doors * (3 - 2 * doors);
      for (const leaf of doorLeaves)
        leaf.rotation.y = leaf.userData.base + (leaf.userData.base ? 1 : -1) * open * 1.45;
      // Lights ease on and off.
      const wanted = running ? 1 : 0;
      lights += (wanted - lights) * (1 - Math.exp(-dt * 4));
      const night = dusk ? 1 : 0.35;
      const set = (name, value) => {
        if (materials[name]) materials[name].emissiveIntensity = value;
      };
      set('bus-lamp', lights * (dusk ? 3.2 : 1.2));
      set('bus-tail', lights * 1.4);
      set('bus-sign', lights * 1.6);
      set('bus-light', lights * 2.2 * night);
      set('bus-glass', lights * 0.22 * night);
      if (cabinLight) cabinLight.intensity = lights * (dusk ? 5 : 0);
      lampGlass.emissiveIntensity = dusk ? 2.2 : 0;
      if (shelterLight) shelterLight.intensity = dusk ? 7 : 0;
      shelterSource?.set({ level: dusk ? 1 : 0 });
      const visible = bus.visible ? 1 : 0;
      placeSources(lights * visible * (dusk ? 1 : 0.35), lights * visible * night);
      // Wet paving shines under the lamps.
      paving.roughness += ((wet > 0.3 ? 0.2 : 0.62) - paving.roughness) * (1 - Math.exp(-dt * 0.5));
    },
    /**
     * Stage spots: `door` just outside the front door (boarding), `step` on the floor just
     * inside it. World pose { x, y, z, heading } following the bus.
     */
    spot(name) {
      if (!layout) return null;
      const local =
        name === 'step'
          ? new THREE.Vector3(
              layout.doorX - 0.42,
              layout.floorY,
              (layout.door[0] + layout.door[1]) / 2,
            )
          : new THREE.Vector3(layout.doorX + 0.55, 0, (layout.door[0] + layout.door[1]) / 2);
      bus.updateWorldMatrix(true, false);
      const world = local.applyMatrix4(bus.matrixWorld);
      if (name !== 'step') world.y = bus.position.y;
      // Facing out of the door (+X of the bus) for the step, into it for the door.
      const outward = bus.rotation.y + Math.PI / 2;
      return {
        x: world.x,
        y: world.y,
        z: world.z,
        heading: name === 'step' ? outward : outward + Math.PI,
      };
    },
    /** Director subjects for inserts: the bus from the platform end, or its front door. */
    subject(id) {
      if (!layout || !bus.visible) return null;
      const stand = along(0);
      const standWorld = frame.point(stand.x, 0, stand.z);
      const toWorld = (x, y, z) => {
        // Camera places are fixed to the stand, so a leaving bus drives out of a still frame.
        const heading = frame.heading(stand.heading);
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        return [
          standWorld.x + cos * x + sin * z,
          deckY(stand.z) + y,
          standWorld.z - sin * x + cos * z,
        ];
      };
      if (id === 'aonuma-bus-door')
        return {
          point: toWorld(layout.doorX, 1.3, (layout.door[0] + layout.door[1]) / 2),
          eye: toWorld(layout.doorX + 3.1, 1.55, (layout.door[0] + layout.door[1]) / 2 + 1.2),
          lens: 35,
        };
      bus.updateWorldMatrix(true, false);
      const live = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(bus.matrixWorld).toArray();
      // From the platform end: the lit front and open door on the right, the shelter left.
      if (id === 'aonuma-bus')
        return { point: live(0.7, 1.35, 1.2), eye: toWorld(2.9, 1.7, 9.9), lens: 30 };
      // Wide and high behind the stop: the bus pulls away round the corner, windows lit.
      if (id === 'aonuma-bus-stop')
        return { point: live(0, 1.4, 0), eye: toWorld(3.6, 3.4, -10.5), lens: 28 };
      return null;
    },
    getState: () => ({
      state,
      model: modelState,
      doors: Number(doors.toFixed(2)),
      speed: Number(speed.toFixed(2)),
      distance: Number(s.toFixed(1)),
      position: bus.position.toArray().map((value) => Number(value.toFixed(2))),
      lights: Number(lights.toFixed(2)),
    }),
    dispose() {
      if (lightPool)
        for (const id of [
          'aonuma-bus-shelter',
          'aonuma-bus-headlight--1',
          'aonuma-bus-headlight-1',
          'aonuma-bus-tail--1',
          'aonuma-bus-tail-1',
          'aonuma-bus-cabin',
        ])
          lightPool.remove(id);
      root.removeFromParent();
      for (const item of owned) item.dispose();
    },
  };
  return api;
}
