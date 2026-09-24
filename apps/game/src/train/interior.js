import { CAR_COUNT } from './consist.js';
import { DRIVE_LIMITS } from '../simulation/physics.js';

/** Named riders from the population simulation, three boarding slots per car from the front. */
const NAMED_RIDERS = [
  'returning-1',
  'returning-2',
  'returning-3',
  'commuter-1',
  'commuter-2',
  'commuter-3',
  'commuter-4',
  'commuter-5',
  'commuter-6',
];
const NAMED_PER_CAR = 3;
/** Deterministic seated activities; the pattern is offset per car so neighbours differ. */
const ACTIVITIES = ['newspaper', 'window', 'book', 'bag', 'window', 'newspaper', 'bag'];
export const CAB_CARS = [0, CAR_COUNT - 1];
/** Through riders' roles for the crowd kit's looks; the pattern is offset per car. */
const THROUGH_ROLES = [
  'office commuter',
  'school student',
  'retired neighbour',
  'tourist',
  'market shopper',
];
/** Momiji people with their own hero VRM keep the same look when the crowd draws them aboard. */
const HERO_LOOKS = { 'commuter-1': 'sato', 'commuter-2': 'riko', 'reader-1': 'ishida' };
/**
 * The crowd kit's seated clip for each activity. Riders with a bag on their lap alternate
 * between a phone call and a doze, so a carriage is not all readers and window watchers.
 */
function crowdActivity(activity, index) {
  if (activity === 'bag') return index % 2 ? 'doze' : 'phone';
  return activity;
}
const DIAL_REST = -2.3;
const DIAL_SWEEP = 4.6;

/** Car-local furnishings and passengers; shared instance batches keep each coat one draw. */
export function createCarInterior({
  THREE,
  car,
  index,
  paints,
  material,
  geometry,
  boxGeometry,
  box,
  cylinder,
}) {
  const upholstery = material(`Interior ${index} / cushion piping`, '#a1aa83', { roughness: 0.95 });
  const wood = material(`Interior ${index} / oak trim`, '#9b7751', { roughness: 0.8 });
  const dark = material(`Interior ${index} / instrument panel`, '#263c3c', { roughness: 0.76 });
  const face = material(`Interior ${index} / skin`, '#d1a580', { roughness: 0.96 });
  const hair = material(`Interior ${index} / hair and shoes`, '#35332e', { roughness: 1 });
  const coats = ['#617b85', '#b17b53', '#73765b'].map((color, i) =>
    material(`Interior ${index} / coat ${i}`, color, { roughness: 1 }),
  );
  const headGeo = geometry(new THREE.SphereGeometry(1, 10, 8), 'Interior / rounded heads');
  const ringGeo = geometry(new THREE.TorusGeometry(0.09, 0.012, 5, 12), 'Interior / hand straps');
  for (const side of [-1, 1]) {
    box(wood, side * 1.385, 2.17, 0, 0.06, 0.075, 7.7, false);
    box(paints.steel, side * 1.07, 1.25, 0, 0.45, 0.22, 6.7);
    box(paints.bright, side * 1.03, 3.02, 0, 0.035, 0.035, 7.1, false);
    for (const z of [-3.25, -2.15, -1.05, 0.05, 1.15, 2.25, 3.25]) {
      box(upholstery, side * 1.055, 1.595, z, 0.55, 0.025, 0.026, false);
      box(paints.bright, side * 1.16, 3.07, z, 0.49, 0.026, 0.026, false);
    }
    for (const z of [-3.48, 3.48]) {
      box(wood, side * 1.08, 1.88, z, 0.58, 0.07, 0.07);
      cylinder(paints.bright, side * 0.8, 1.6, z, 0.02, 0.55, 'y', false);
    }
    box(paints.bright, side * 1.22, 3.05, 0, 0.46, 0.035, 6.8, false);
    for (const z of [-2.2, 1.2]) {
      box(wood, side * 1.21, 3.16, z, 0.32, 0.19, 0.48, false);
      box(paints.rubber, side * 1.21, 3.265, z, 0.2, 0.025, 0.04, false);
    }
  }
  // Floor seams, ceiling vents and route diagram above each vestibule.
  for (const x of [-0.6, 0, 0.6]) box(wood, x, 1.099, 0, 0.012, 0.005, 11.9, false);
  for (const z of [-4.0, 0, 4.0]) {
    box(paints.bright, 0, 3.245, z, 0.5, 0.015, 0.42, false);
    for (let i = 0; i < 6; i++)
      box(dark, 0, 3.233, z - 0.17 + i * 0.065, 0.42, 0.009, 0.015, false);
  }
  for (const end of [-1, 1]) {
    box(wood, 0, 3.0, end * 3.85, 2.85, 0.29, 0.06, false);
    box(paints.cream, 0, 3.0, end * 3.81, 1.5, 0.22, 0.015, false);
    box(paints.seat, 0, 3.0, end * 3.795, 1.26, 0.018, 0.008, false);
    for (let i = 0; i < 8; i++)
      box(paints.red, -0.59 + i * 0.17, 3.0, end * 3.78, 0.035, 0.055, 0.01, false);
  }
  const strapMesh = new THREE.InstancedMesh(ringGeo, paints.interior, 12);
  strapMesh.name = 'Interior / swinging hand straps';
  strapMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  strapMesh.frustumCulled = false;
  car.add(strapMesh);
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++)
      box(paints.bright, side * 0.72, 2.98, -2.8 + i * 1.12, 0.022, 0.39, 0.024, false);

  const needles = [];
  const isCab = CAB_CARS.includes(index);
  if (isCab) {
    const end = index === 0 ? 1 : -1;
    // Desk leaves the standing driver's sight line through the actual windscreen.
    box(dark, -0.76, 1.61, end * 5.75, 1.26, 1.02, 0.62);
    box(paints.steel, -0.76, 2.17, end * 5.58, 1.3, 0.09, 0.87);
    for (const [x, kind] of [
      [-1.02, 'speed'],
      [-0.52, 'power'],
    ]) {
      cylinder(paints.rubber, x, 2.224, end * 5.67, 0.19, 0.015, 'y', false);
      cylinder(paints.cream, x, 2.235, end * 5.67, 0.163, 0.01, 'y', false);
      for (let i = 0; i < 9; i++) {
        const angle = -2.3 + i * 0.575;
        box(
          dark,
          x + Math.sin(angle) * 0.137,
          2.244,
          end * 5.67 + Math.cos(angle) * 0.137,
          0.015,
          0.01,
          0.018,
          false,
        );
      }
      // The pivot reads zero at rest; the inner group parks the needle on the first tick.
      const needle = new THREE.Mesh(boxGeometry, paints.red);
      needle.name = `Cab / live ${kind} gauge`;
      const pivot = new THREE.Group();
      pivot.position.set(x, 2.256, end * 5.67);
      const rest = new THREE.Group();
      rest.rotation.y = DIAL_REST;
      needle.position.z = 0.065;
      needle.scale.set(0.014, 0.012, 0.13);
      rest.add(needle);
      pivot.add(rest);
      car.add(pivot);
      needles.push({ pivot, kind });
    }
    for (const x of [-1.19, -1.02, -0.85])
      cylinder(paints.doorWarning, x, 2.23, end * 5.35, 0.035, 0.025, 'y', false);
    cylinder(paints.rubber, -0.28, 2.23, end * 5.36, 0.09, 0.06, 'y', false);
    const lever = new THREE.Group();
    lever.name = 'Cab / working brake handle';
    lever.position.set(-0.28, 2.28, end * 5.36);
    const handle = new THREE.Mesh(boxGeometry, paints.bright);
    handle.position.z = 0.085;
    handle.scale.set(0.055, 0.045, 0.2);
    lever.add(handle);
    car.add(lever);
    needles.push({ pivot: lever, kind: 'brake' });
    box(paints.seat, -0.78, 1.58, end * 4.69, 0.56, 0.18, 0.48);
    box(paints.seat, -0.78, 1.9, end * 4.45, 0.57, 0.64, 0.09);
  }
  // Through passengers stay aboard; named local riders follow the population simulation.
  // Rear cars carry through passengers only; a slot without a real rider is never created.
  const slots = Array.from({ length: 7 }, (_, i) => ({
    side: i % 2 ? 1 : -1,
    z: -2.65 + Math.floor(i / 2) * 1.67,
    id: i < 4 ? `through-${index}-${i}` : NAMED_RIDERS[index * NAMED_PER_CAR + i - 4],
    through: i < 4,
    activity: ACTIVITIES[(i + index * 2) % ACTIVITIES.length],
    visible: i < 4,
  })).filter((slot) => slot.id !== undefined);
  const batches = new Map();
  const dummy = new THREE.Object3D();
  let skipDraw = false;
  function instance(geo, mat, x, y, z, sx, sy, sz, rotation = 0) {
    if (skipDraw) return;
    const key = `${geo.uuid}:${mat.uuid}`;
    if (!batches.has(key)) {
      const mesh = new THREE.InstancedMesh(geo, mat, 100);
      mesh.name = `Interior / passengers / ${mat.name}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      car.add(mesh);
      batches.set(key, { mesh, count: 0 });
    }
    const batch = batches.get(key);
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, rotation, 0);
    dummy.updateMatrix();
    batch.mesh.setMatrixAt(batch.count++, dummy.matrix);
  }
  let time = 0;
  // Riders the crowd kit draws (characters/crowd/) are left out of the instanced batches.
  const crowdHidden = new Set();
  const crowdRecords = slots.map((p, i) => ({
    id: p.id,
    source: 'interior',
    role: p.through ? THROUGH_ROLES[(i + index) % THROUGH_ROLES.length] : 'commuter',
    named: HERO_LOOKS[p.id] ?? null,
    position: new THREE.Vector3(),
    heading: 0,
    walking: false,
    pose: 'seated',
    state: 'riding',
    activity: crowdActivity(p.activity, i + index),
    // Seat cushion top above the carriage floor under the rider.
    seatHeight: 0.45,
    indoors: true,
    visible: false,
  }));
  const crowdDirection = new THREE.Vector3();
  // Car-local head centres of the seated passengers drawn this frame, for camera framing.
  const headSpots = [];
  function update({ dt = 0, speed = 0, power = 0, brake = 0, passengers = [], cabinOn = false }) {
    time += Math.max(0, dt);
    // A little material fill keeps faces readable inside a lit carriage without extra lights.
    for (const mat of [paints.interior, ...coats, face]) {
      mat.emissive.copy(mat.color);
      mat.emissiveIntensity = cabinOn ? 0.24 : 0.08;
    }
    for (const batch of batches.values()) batch.count = 0;
    headSpots.length = 0;
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i];
      p.visible =
        p.through || passengers.some((person) => person.id === p.id && person.state === 'riding');
      if (!p.visible) continue;
      if (!p.through)
        crowdRecords[i].role = passengers.find((person) => person.id === p.id)?.role ?? 'commuter';
      // A rider the crowd draws keeps a head spot for framing but no instanced parts.
      skipDraw = crowdHidden.has(p.id);
      const sway = Math.sin(time * 2.2 + i) * Math.min(Math.abs(speed) * 0.001, 0.015);
      const x = p.side * 1.01,
        z = p.z,
        inward = -p.side,
        coat = coats[i % 3],
        reading = p.activity === 'book' || p.activity === 'newspaper',
        // Window watchers turn toward the glass; readers bow a little over their laps.
        headYaw = p.activity === 'window' ? -inward * 2.55 : reading ? inward * 0.08 : 0,
        headLean = reading ? 0.05 : 0,
        headOut = p.activity === 'window' ? -inward * 0.03 : 0,
        headX = x + inward * (0.025 + headLean) + headOut,
        headY = 2.4 - headLean;
      // Torso, shoulders and collar read as one seated body against the bench.
      instance(boxGeometry, coat, x, 1.9, z + sway, 0.31, 0.58, 0.4);
      instance(boxGeometry, coat, x + inward * 0.02, 2.16, z + sway, 0.27, 0.09, 0.5);
      instance(boxGeometry, paints.interior, x + inward * 0.09, 2.2, z + sway, 0.12, 0.05, 0.16);
      instance(headGeo, face, headX, headY, z + sway, 0.145, 0.185, 0.145, headYaw);
      headSpots.push([headX, headY, z + sway]);
      instance(headGeo, hair, headX - inward * 0.04, headY + 0.11, z + sway, 0.146, 0.095, 0.148);
      // Nose follows the head turn so the facing direction is legible from the aisle.
      instance(
        headGeo,
        face,
        headX + inward * 0.133 * Math.cos(headYaw),
        headY,
        z + sway - inward * Math.sin(headYaw) * 0.133,
        0.035,
        0.041,
        0.04,
      );
      for (const side of [-1, 1]) {
        instance(
          headGeo,
          hair,
          headX + inward * 0.114 * Math.cos(headYaw) - side * 0.062 * Math.sin(headYaw) * inward,
          headY + 0.03,
          z + sway + side * 0.062 * Math.cos(headYaw) - inward * Math.sin(headYaw) * 0.114,
          0.012,
          0.014,
          0.014,
          headYaw,
        );
        // Thighs, shins and shoes; the window watcher draws both feet together toward the glass.
        const knee = p.activity === 'window' ? 0.07 : 0.12;
        instance(boxGeometry, dark, x + inward * 0.14, 1.63, z + side * 0.12, 0.46, 0.15, 0.14);
        instance(boxGeometry, dark, x + inward * 0.34, 1.38, z + side * knee, 0.14, 0.47, 0.15);
        instance(boxGeometry, hair, x + inward * 0.39, 1.16, z + side * knee, 0.25, 0.1, 0.17);
        // Arms hang for idle riders and lift forward for anyone holding paper.
        if (reading) {
          const elbowY = p.activity === 'newspaper' ? 2.02 : 1.76;
          instance(
            boxGeometry,
            coat,
            x + inward * 0.04,
            (2.18 + elbowY) / 2,
            z + side * 0.24 + sway,
            0.13,
            2.18 - elbowY + 0.08,
            0.13,
          );
        }
        instance(
          boxGeometry,
          coat,
          x + inward * (reading ? 0.12 : 0.07),
          p.activity === 'newspaper' ? 2.02 : reading ? 1.76 : 1.92,
          z + side * 0.24 + sway,
          reading ? 0.28 : 0.15,
          reading ? 0.13 : 0.45,
          0.13,
        );
        instance(
          headGeo,
          face,
          x + inward * (reading ? 0.27 : 0.17),
          p.activity === 'newspaper' ? 2.02 : reading ? 1.76 : 1.72,
          z + side * (p.activity === 'newspaper' ? 0.2 : 0.24) + sway,
          0.085,
          0.06,
          0.065,
        );
      }
      if (p.activity === 'book') {
        instance(boxGeometry, wood, x + inward * 0.25, 1.78, z, 0.22, 0.04, 0.28); // book cover
        instance(boxGeometry, paints.cream, x + inward * 0.25, 1.805, z, 0.2, 0.012, 0.26); // pages
      } else if (p.activity === 'newspaper') {
        // Broadsheet held up in both hands, with a dark column line down the fold.
        instance(boxGeometry, paints.cream, x + inward * 0.3, 2.08, z + sway, 0.02, 0.4, 0.5);
        instance(boxGeometry, dark, x + inward * 0.312, 2.08, z + sway, 0.006, 0.28, 0.02);
      } else if (p.activity === 'bag') {
        instance(boxGeometry, wood, x + inward * 0.2, 1.78, z, 0.3, 0.16, 0.34); // bag on lap
        instance(boxGeometry, hair, x + inward * 0.2, 1.88, z, 0.05, 0.05, 0.36); // handle
      } else {
        instance(boxGeometry, wood, x, 1.27, z + 0.4, 0.3, 0.33, 0.24); // bag beneath bench
      }
    }
    skipDraw = false;
    for (const { mesh, count } of batches.values()) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
    let slot = 0;
    for (const side of [-1, 1])
      for (let i = 0; i < 6; i++) {
        dummy.position.set(side * 0.72, 2.7, -2.8 + i * 1.12);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(
          Math.sin(time * 2.1 + i * 0.2) * Math.min(Math.abs(speed) * 0.012, 0.12),
          0,
          0,
        );
        dummy.updateMatrix();
        strapMesh.setMatrixAt(slot++, dummy.matrix);
      }
    strapMesh.instanceMatrix.needsUpdate = true;
    for (const { pivot, kind } of needles)
      pivot.rotation.y =
        kind === 'speed'
          ? Math.min(Math.abs(speed) / DRIVE_LIMITS.maxSpeed, 1) * DIAL_SWEEP
          : kind === 'power'
            ? Math.min(Math.max(power, 0), 1) * DIAL_SWEEP
            : Math.min(Math.max(brake, 0), 1) * 1.5;
  }
  update({});
  const world = new THREE.Vector3();
  return {
    update,
    /**
     * Seated riders for the crowd kit, in world space (call after the train has moved this
     * frame). The feet are on the floor under the pelvis; the kit's sitting clip moves the
     * body forward onto the bench (hero-cast seat geometry).
     */
    crowdPeople(push) {
      // Parents only: the carriage's own subtree is large and the train updates it anyway.
      car.updateWorldMatrix(true, false);
      slots.forEach((p, i) => {
        const record = crowdRecords[i];
        record.visible = p.visible;
        if (!p.visible) return;
        const inward = -p.side;
        record.position.set(p.side * 1.01 + inward * 0.05, 1.11, p.z);
        car.localToWorld(record.position);
        crowdDirection.set(inward, 0, 0).transformDirection(car.matrixWorld);
        record.heading = Math.atan2(crowdDirection.x, crowdDirection.z);
        push(record);
      });
    },
    setCrowdHidden(id, hidden) {
      if (!slots.some((p) => p.id === id)) return false;
      if (hidden) crowdHidden.add(id);
      else crowdHidden.delete(id);
      return true;
    },
    /** World positions of the seated passengers' heads, as [x, y, z]. */
    heads() {
      car.updateMatrixWorld();
      return headSpots.map(([x, y, z]) => car.localToWorld(world.set(x, y, z)).toArray());
    },
    state: () => ({
      carIndex: index,
      cab: isCab,
      seated: slots.filter((p) => p.visible).length,
      passengerIds: slots.filter((p) => p.visible).map((p) => p.id),
      activities: slots.filter((p) => p.visible).map((p) => ({ id: p.id, activity: p.activity })),
      gauges: needles.map(({ kind, pivot }) => ({ kind, angle: pivot.rotation.y })),
    }),
  };
}
