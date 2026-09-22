/**
 * Station residents in two instanced batches.
 * Platform roles stay in station-local metres. Village errands use the street frame:
 * x is metres east of the rail, z is metres along the route from the stop.
 * That frame matches the paved lane, garden path and house lots.
 */
const COATS = [
  '#a3614b',
  '#46687a',
  '#bfa65c',
  '#5b7052',
  '#73576f',
  '#d0b49a',
  '#384959',
  '#987955',
];
const HAIR = ['#302b2a', '#66534a', '#b7b3aa', '#ddddce'];
const SKIN = ['#d7ac8c', '#bd8b69', '#e3c1a3', '#c89e7e'];
const NAMES = ['Yuki', 'Sora', 'Nao', 'Akira', 'Miki', 'Ren', 'Jun', 'Tomo', 'Kei', 'Aoi'];
function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function stationResidents(stop) {
  const seed = hash(String(stop.id));
  const roles = [
    'reader',
    'commuter',
    'waiting',
    'conversation',
    'conversation',
    'vendor',
    'reader',
    'commuter',
  ];
  if (stop.theme === 'city' || stop.theme === 'harbour') roles.push('waiting', 'commuter');
  return roles.map((role, i) => {
    const value = hash(`${seed}:${i}`);
    const age = [68, 31, 47, 25, 74, 53, 17, 38, 62, 28][i];
    return {
      id: `${stop.id}-resident-${i}`,
      name: NAMES[(i + seed) % NAMES.length],
      role,
      age,
      height: 1.5 + (value % 29) / 100,
      width: 0.85 + ((value >>> 5) % 30) / 100,
      coat: COATS[(value >>> 8) % COATS.length],
      hair: age > 60 ? HAIR[2 + (value % 2)] : HAIR[value % 2],
      skin: SKIN[(value >>> 12) % SKIN.length],
      hat: i === 2 || value % 5 === 0,
      bag: ['commuter', 'waiting'].includes(role),
      scarf: ['snow', 'alpine', 'mountain'].includes(stop.theme) || value % 3 === 0,
      offset: role === 'commuter' ? (i === 1 ? 0 : i === 7 ? 27 : 52) : 0,
      index: i,
    };
  });
}

const LANE_ERRAND = [
  { x: 58, z: -78 },
  { x: 48, z: -78 },
  { x: 48, z: 0 },
  { x: 19, z: 0 },
  { x: 10, z: 8 },
];
const GARDEN_ERRAND = [
  { x: 28, z: 78 },
  { x: 21, z: 78 },
  { x: 21, z: 0 },
  { x: 19, z: 0 },
  { x: 10, z: -4 },
];
const LANE_EAVES = [
  { x: 58, z: -78 },
  { x: 55, z: -78 },
];
const GARDEN_EAVES = [
  { x: 28, z: 78 },
  { x: 28, z: 74 },
];

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return total;
}

function pointAlong(points, distance) {
  let remain = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    const len = Math.hypot(dx, dz);
    if (remain <= len || i === points.length - 1) {
      const t = len === 0 ? 1 : Math.min(1, remain / len);
      return {
        x: points[i - 1].x + dx * t,
        z: points[i - 1].z + dz * t,
        yaw: Math.atan2(dx, dz),
      };
    }
    remain -= len;
  }
  const last = points[points.length - 1];
  return { x: last.x, z: last.z, yaw: 0 };
}

/** Doorway to the paved lane or garden path, then the station forecourt. Rain and snow stay under the eaves. */
function errandPose(resident, time, weather) {
  const sheltered = weather === 'rain' || weather === 'snow';
  const lane = resident.role === 'vendor';
  const points = sheltered
    ? lane
      ? LANE_EAVES
      : GARDEN_EAVES
    : lane
      ? LANE_ERRAND
      : GARDEN_ERRAND;
  const speed = 1.15;
  const dwell = sheltered ? 6 : 16;
  const travel = polylineLength(points) / speed;
  const period = travel * 2 + dwell * 2;
  let phase = (time + resident.index * 83) % period;
  let distance = 0;
  let walking = false;
  let outbound = true;
  if (phase < dwell) distance = 0;
  else if (phase < dwell + travel) {
    distance = (phase - dwell) * speed;
    walking = true;
  } else if (phase < dwell * 2 + travel) {
    distance = polylineLength(points);
    outbound = false;
  } else {
    distance = polylineLength(points) - (phase - dwell * 2 - travel) * speed;
    walking = true;
    outbound = false;
  }
  const pose = pointAlong(points, distance);
  if (!outbound) pose.yaw += Math.PI;
  const atDoor = pose.x > 26 && Math.abs(Math.abs(pose.z) - 78) < 6;
  const onLane = pose.x > 40 && Math.abs(pose.z) > 12;
  const onPath = Math.abs(pose.z) < 6 && pose.x > 16;
  return {
    frame: 'street',
    x: pose.x,
    z: pose.z,
    yaw: pose.yaw,
    seated: false,
    walking,
    gesture: walking ? 0 : Math.max(0, Math.sin(time * 0.5)) * 0.2,
    activity: sheltered
      ? walking
        ? 'pacing under the eaves'
        : 'sheltering at the doorway'
      : !walking && pose.x < 16
        ? 'waiting at the station forecourt'
        : !walking && atDoor
          ? 'standing at the doorway'
          : onLane
            ? 'walking the village lane'
            : onPath
              ? 'walking the station path'
              : 'walking the garden lane',
  };
}

export function residentPose(resident, elapsed, context = {}) {
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  const theme = context.theme;
  const village = theme && theme !== 'city';
  if (village && (resident.role === 'vendor' || resident.index === 2))
    return errandPose(resident, time, context.weather ?? 'clear');
  const cycle = (time + resident.offset) % 132;
  const pose = {
    x: 5.2,
    z: 0,
    yaw: -Math.PI / 2,
    seated: false,
    walking: false,
    gesture: 0,
    activity: 'waiting for the next service',
  };
  if (resident.role === 'reader') {
    Object.assign(pose, {
      x: 6.35,
      z: resident.index === 0 ? -21 : 3,
      seated: true,
      activity: 'reading the local newspaper',
      gesture: Math.sin(time * 0.25) * 0.025,
    });
  } else if (resident.role === 'commuter') {
    // Enter, walk to a queue mark, wait, then leave for the village; loop only at the entrance.
    const target = -8 + (resident.index % 3) * 3;
    const progress =
      cycle < 28 ? cycle / 28 : cycle < 94 ? 1 : cycle < 122 ? 1 - (cycle - 94) / 28 : 0;
    Object.assign(pose, {
      x: 4.5 + (resident.index % 3) * 0.18,
      z: 22 + (target - 22) * progress,
      walking: cycle < 28 || (cycle >= 94 && cycle < 122),
      yaw: cycle < 28 ? Math.PI : cycle >= 94 && cycle < 122 ? 0 : -Math.PI / 2,
      activity:
        cycle < 28
          ? 'walking to the departure queue'
          : cycle < 94
            ? 'waiting at the departure queue'
            : 'returning to the village entrance',
    });
  } else if (resident.role === 'conversation') {
    Object.assign(pose, {
      x: resident.index === 3 ? 5.35 : 6.3,
      z: 10,
      yaw: resident.index === 3 ? Math.PI / 2 : -Math.PI / 2,
      gesture: Math.max(0, Math.sin(time * 0.65 + (resident.index === 3 ? 0 : Math.PI))) * 0.24,
      activity:
        resident.index === 3 ? 'telling a neighbour about the market' : 'listening to a neighbour',
    });
  } else if (resident.role === 'vendor') {
    Object.assign(pose, {
      x: 7.6,
      z: 21,
      yaw: -Math.PI / 2,
      gesture: Math.max(0, Math.sin(time * 0.55)) * 0.3,
      activity: 'arranging produce at the station stall',
    });
  } else {
    Object.assign(pose, {
      x: 5.45,
      z: resident.index === 2 ? -15 : 17,
      activity: 'waiting beside a travel bag',
    });
  }
  return pose;
}

function followStreet(prev, next, dt) {
  if (!prev || next.frame !== 'street' || prev.frame !== 'street') return next;
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const dist = Math.hypot(dx, dz);
  const allowance = 1.45 * Math.max(dt, 1 / 24);
  if (dist <= allowance + 1e-6) return next;
  const scale = allowance / dist;
  return {
    ...next,
    x: prev.x + dx * scale,
    z: prev.z + dz * scale,
    walking: true,
    yaw: Math.atan2(dx, dz),
    activity: 'walking toward shelter',
  };
}

export function createRegionalResidents({ THREE, parent, stop, local, yaw = 0, place }) {
  const residents = stationResidents(stop);
  const group = new THREE.Group();
  group.name = `${stop.name} / regional residents`;
  parent.add(group);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const roundGeometry = new THREE.SphereGeometry(1, 7, 5);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86 });
  const boxes = new THREE.InstancedMesh(boxGeometry, material, 256);
  const rounds = new THREE.InstancedMesh(roundGeometry, material, 64);
  boxes.name = `${stop.name} / resident clothes and belongings`;
  rounds.name = `${stop.name} / resident faces and hairstyles`;
  for (const mesh of [boxes, rounds]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const dummy = new THREE.Object3D();
  const body = new THREE.Object3D();
  const color = new THREE.Color();
  const matrix = new THREE.Matrix4();
  let boxCount = 0,
    roundCount = 0,
    lastTime = -Infinity,
    disposed = false;
  const shown = new Map();
  const contextFor = (weather) => ({ theme: stop.theme, weather: weather ?? 'clear' });
  function part(mesh, x, y, z, sx, sy, sz, tint, pitch = 0) {
    const index = mesh === boxes ? boxCount++ : roundCount++;
    dummy.position.set(x, y, z);
    dummy.rotation.set(pitch, 0, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    matrix.multiplyMatrices(body.matrix, dummy.matrix);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.set(tint));
  }
  const cube = (...args) => part(boxes, ...args);
  const round = (...args) => part(rounds, ...args);
  function update(elapsed = 0, context = {}) {
    if (disposed || Math.abs(elapsed - lastTime) < 1 / 24) return;
    const dt = lastTime === -Infinity ? 0 : Math.max(0, elapsed - lastTime);
    lastTime = elapsed;
    boxCount = 0;
    roundCount = 0;
    for (const resident of residents) {
      const logical = residentPose(resident, elapsed, contextFor(context.weather));
      const pose = followStreet(shown.get(resident.id), logical, dt || 1 / 24);
      shown.set(resident.id, pose);
      if (pose.frame === 'street' && place) {
        body.position.copy(place(pose.x, pose.z));
        body.rotation.set(0, pose.yaw, 0);
      } else {
        body.position.copy(local(pose.x, 0.62, pose.z));
        body.rotation.set(0, yaw + pose.yaw, 0);
      }
      body.scale.set(resident.width, resident.height / 1.7, 1);
      body.updateMatrix();
      const hip = pose.seated ? 0.58 : 0.95;
      const gait = pose.walking ? Math.sin((elapsed + resident.offset) * 5.8) * 0.36 : 0;
      cube(0, hip + 0.05, 0, 0.43, 0.59, 0.28, resident.coat);
      round(0, hip + 0.61, 0, 0.165, 0.22, 0.17, resident.skin);
      round(0, hip + 0.71, -0.035, 0.175, 0.145, 0.165, resident.hair);
      if (resident.hat) {
        cube(0, hip + 0.84, 0, 0.39, 0.05, 0.37, resident.coat);
        cube(0, hip + 0.9, -0.015, 0.29, 0.12, 0.27, resident.coat);
      }
      if (resident.scarf) cube(0, hip + 0.31, 0.145, 0.33, 0.11, 0.1, '#d5a55f');
      for (const side of [-1, 1]) {
        if (pose.seated) {
          cube(side * 0.12, 0.5, 0.18, 0.15, 0.15, 0.42, '#414951');
          cube(side * 0.12, 0.25, 0.36, 0.14, 0.47, 0.15, '#414951');
        } else {
          cube(side * 0.12, 0.42, 0, 0.15, 0.78, 0.17, '#414951', gait * side);
        }
        cube(
          side * 0.12,
          0.07,
          pose.seated ? 0.4 : gait * side * -0.32 + 0.05,
          0.18,
          0.13,
          0.29,
          '#302e2d',
        );
        const armAngle = pose.seated ? -0.9 : -gait * side - pose.gesture;
        cube(side * 0.29, hip - 0.06, 0.03, 0.13, 0.56, 0.15, resident.coat, armAngle);
        round(
          side * 0.29,
          hip - 0.3,
          pose.seated ? 0.27 : pose.gesture * 0.3,
          0.065,
          0.09,
          0.065,
          resident.skin,
        );
      }
      if (pose.seated) {
        cube(0, 0.79, 0.4, 0.59, 0.02, 0.38, '#e6dfcc', -0.25);
        for (const side of [-1, 1])
          for (let line = 0; line < 3; line++)
            cube(side * 0.15, 0.81, 0.3 + line * 0.065, 0.21, 0.008, 0.013, '#777a70');
      }
      if (resident.bag) {
        cube(0.38, 0.42, 0.035, 0.28, 0.4, 0.23, '#856143');
        cube(0.38, 0.67, 0.035, 0.15, 0.12, 0.065, '#493e32');
      }
    }
    body.position.copy(local(7, 0.62, 21));
    body.rotation.set(0, yaw, 0);
    body.scale.set(1, 1, 1);
    body.updateMatrix();
    cube(0, 0.5, 0, 0.9, 0.85, 1.5, '#806046');
    cube(0, 0.95, 0, 1.05, 0.12, 1.65, '#c7ac78');
    for (let i = 0; i < 5; i++)
      round(0, 1.08, -0.55 + i * 0.26, 0.11, 0.1, 0.1, i % 2 ? '#d88948' : '#9ba65a');
    boxes.count = boxCount;
    rounds.count = roundCount;
    for (const mesh of [boxes, rounds]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }
  update(0);
  return {
    update,
    getState: () => ({
      station: stop.id,
      residents: residents.map((resident) => ({
        ...resident,
        ...(shown.get(resident.id) ??
          residentPose(resident, Math.max(0, lastTime), contextFor('clear'))),
      })),
      drawBatches: 2,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      parent.remove(group);
      boxes.dispose();
      rounds.dispose();
      boxGeometry.dispose();
      roundGeometry.dispose();
      material.dispose();
    },
  };
}
