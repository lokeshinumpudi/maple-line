import { CAR_COUNT, CAR_SPACING } from './consist.js';
import { createCarInterior } from './interior.js';
import { trainSystems } from './systems.js';
import { TRAIN_FAMILIES, applyWeatherFinish, createWetnessTracker } from './weather-materials.js';
/** Blender-built bodies, doors, wheelsets and pantographs (asset-src/vehicles/momiji-emu). */
export const TRAIN_MODEL_PATH = 'models/vehicles/momiji-emu.glb';
const MODEL_PARTS = ['car-cab', 'car-middle', 'door-leaf', 'wheelset', 'pantograph'];

/**
 * Five articulated EMU carriages. The caller owns carriage positions along the route.
 * The procedural carriages are built at once; `attachModel` swaps their exterior for the
 * Blender GLB when it loads and leaves them in place if it does not.
 */
export function createTrain({ THREE, scene, wireHeight = 12.1 }) {
  const cars = [],
    geometries = new Set(),
    materials = new Set(),
    wheelAnimations = [],
    doorAnimations = [],
    modelWheels = [],
    pantographs = [],
    wiperAnimations = [],
    doorIndicators = [],
    interiors = [];
  const trainLength = 12.4,
    carSpacing = CAR_SPACING,
    wheelRadius = 0.46,
    wheelY = 0.315 + wheelRadius;
  const material = (name, color, properties = {}) => {
    const result = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.12,
      ...properties,
    });
    result.name = name;
    materials.add(result);
    return result;
  };
  const paints = {
    red: material('Train / baked vermilion lower body', '#983f32'),
    cream: material('Train / ivory upper body', '#e8ddbb'),
    gold: material('Train / ochre separation stripe', '#d3b46b'),
    roof: material('Train / weathered charcoal roof', '#777f79', { roughness: 0.84 }),
    rubber: material('Train / rubber and underframe', '#293330', { roughness: 0.88 }),
    steel: material('Train / bogie steel', '#505d59', { metalness: 0.58, roughness: 0.48 }),
    bright: material('Train / brushed metal details', '#abb5ac', {
      metalness: 0.62,
      roughness: 0.38,
    }),
    glass: material('Train / blue green glazing', '#b4d4cf', {
      metalness: 0.12,
      roughness: 0.12,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
    cabinGlass: material('Train / passenger window reflections', '#527277', {
      metalness: 0.12,
      roughness: 0.16,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      emissive: '#ffd9a3',
      emissiveIntensity: 0,
    }),
    interior: material('Train / interior lining', '#cfc8b6', { roughness: 0.83 }),
    seat: material('Train / woven green seats', '#46635c', { roughness: 0.95 }),
    doorWarning: material('Train / door warning lamps', '#e8a245', {
      emissive: '#ff8b24',
      emissiveIntensity: 0,
    }),
    glint: material('Train / pale reflected window edge', '#aac9c3', {
      metalness: 0.25,
      roughness: 0.28,
    }),
    insulator: material('Train / porcelain insulators', '#d0c5a8', { roughness: 0.57 }),
    sign: material('Train / illuminated destination panel', '#eddba6', {
      emissive: '#e5c584',
      emissiveIntensity: 0.28,
    }),
    head: material('Train / active warm headlights', '#fff1bc', {
      emissive: '#ffd985',
      emissiveIntensity: 1.8,
    }),
    tail: material('Train / active red tail lamps', '#ad332b', {
      emissive: '#e8492c',
      emissiveIntensity: 1.2,
    }),
    inactive: material('Train / inactive lamp lens', '#ad8b65', {
      metalness: 0.26,
      roughness: 0.25,
    }),
  };
  // Exterior finishes wet and dry with the weather. Glass, rubber, lamps, seats and lining do not.
  // Cabin fittings share dry copies; painted exteriors may become wet without wetting paper or gauges.
  const interiorPaints = { ...paints };
  for (const key of ['red', 'cream', 'gold', 'roof', 'steel', 'bright', 'insulator']) {
    interiorPaints[key] = paints[key].clone();
    interiorPaints[key].name = `Interior dry / ${key}`;
    materials.add(interiorPaints[key]);
  }
  const exteriorWetness = createWetnessTracker({ wetTime: 6, dryTime: 35 });
  for (const key of ['red', 'cream', 'gold', 'insulator'])
    applyWeatherFinish(paints[key], TRAIN_FAMILIES.paint, exteriorWetness.uniform);
  applyWeatherFinish(paints.roof, TRAIN_FAMILIES.roofPaint, exteriorWetness.uniform);
  for (const key of ['steel', 'bright'])
    applyWeatherFinish(paints[key], TRAIN_FAMILIES.steel, exteriorWetness.uniform);
  const geometry = (g, name) => {
    g.name = name;
    geometries.add(g);
    return g;
  };
  const boxGeometry = geometry(new THREE.BoxGeometry(1, 1, 1), 'Train / unit box');
  const wheelGeometry = geometry(
    new THREE.CylinderGeometry(1, 1, 1, 14),
    'Train / wheel and axle cylinder',
  );
  const roofShape = new THREE.Shape();
  // A shallow barrel roof has a real curved silhouette and no overlapping top plate.
  roofShape.moveTo(-1.56, 0);
  roofShape.lineTo(1.56, 0);
  roofShape.lineTo(1.55, 0.14);
  roofShape.quadraticCurveTo(1.2, 0.39, 0, 0.41);
  roofShape.quadraticCurveTo(-1.2, 0.39, -1.55, 0.14);
  roofShape.closePath();
  const roofGeometry = geometry(
    new THREE.ExtrudeGeometry(roofShape, { depth: 12.5, bevelEnabled: false, curveSegments: 5 }),
    'Train / barrel roof',
  );
  roofGeometry.translate(0, 0, -6.25);
  const dummy = new THREE.Object3D(),
    matrix = new THREE.Matrix4();
  const activeHeadlights = [],
    activeTailLights = [];
  let wheelAngle = 0,
    doorProgress = 0,
    lastDusk = null,
    lastDirection = null,
    systemsTime = 0,
    lastDistance = null,
    platformSide = 'right',
    systemsState = trainSystems(),
    modelState = 'procedural';
  function createCar(index) {
    const car = new THREE.Group();
    car.name =
      index === 0
        ? 'Momiji EMU / driving motor car'
        : index === CAR_COUNT - 1
          ? 'Momiji EMU / rear driving car'
          : `Momiji EMU / middle motor car ${index}`;
    car.userData = {
      role: 'railway-carriage',
      carIndex: index,
      length: trainLength,
      width: 3,
      spacing: carSpacing,
    };
    scene.add(car);
    cars.push(car);
    const batches = new Map(),
      doorBatches = new Map();
    // 'shell' parts give way to the Blender body; 'keep' parts (cabin, seats) stay with it.
    let layer = 'shell';
    function slidingDoor(mat, side, leaf, x, y, z, sx, sy, sz) {
      if (!doorBatches.has(mat)) doorBatches.set(mat, []);
      doorBatches.get(mat).push({ side, leaf, x, y, z, sx, sy, sz });
    }
    function part(geo, mat, x, y, z, sx, sy, sz, rotation = { x: 0, y: 0, z: 0 }, cast = true) {
      const key = `${geo.uuid}:${mat.uuid}:${cast}:${layer}`;
      if (!batches.has(key)) batches.set(key, { geo, mat, cast, layer, transforms: [] });
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
      dummy.updateMatrix();
      batches.get(key).transforms.push(dummy.matrix.clone());
    }
    const box = (mat, x, y, z, sx, sy, sz, cast = true) =>
      part(boxGeometry, mat, x, y, z, sx, sy, sz, {}, cast);
    const cylinder = (mat, x, y, z, radius, length, along = 'y', cast = true) =>
      part(
        wheelGeometry,
        mat,
        x,
        y,
        z,
        radius,
        length,
        radius,
        along === 'x' ? { z: Math.PI / 2 } : along === 'z' ? { x: Math.PI / 2 } : {},
        cast,
      );
    function rod(mat, a, b, radius = 0.045, cast = true) {
      const from = new THREE.Vector3(...a),
        to = new THREE.Vector3(...b),
        mid = from.clone().add(to).multiplyScalar(0.5),
        v = to.clone().sub(from);
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        v.clone().normalize(),
      );
      dummy.position.copy(mid);
      dummy.quaternion.copy(q);
      dummy.scale.set(radius, v.length(), radius);
      dummy.updateMatrix();
      const key = `${wheelGeometry.uuid}:${mat.uuid}:${cast}:${layer}`;
      if (!batches.has(key))
        batches.set(key, { geo: wheelGeometry, mat, cast, layer, transforms: [] });
      batches.get(key).transforms.push(dummy.matrix.clone());
    }
    // Thin side walls leave real openings at the four sliding doors.
    const spans = [
      [-6.2, -5.295],
      [-3.885, 3.885],
      [5.295, 6.2],
    ];
    for (const side of [-1, 1])
      for (const [a, b] of spans) {
        box(paints.red, side * 1.46, 1.55, (a + b) / 2, 0.08, 1, b - a);
        box(paints.gold, side * 1.47, 2.1, (a + b) / 2, 0.1, 0.1, b - a);
        if (a === -3.885) {
          box(paints.cream, side * 1.46, 2.215, 0, 0.08, 0.13, b - a);
          box(paints.cream, side * 1.46, 3.25, 0, 0.08, 0.21, b - a);
          for (const [lo, hi] of [
            [a, -3.345],
            [-1.935, -1.585],
            [-0.175, 0.175],
            [1.585, 1.935],
            [3.345, b],
          ])
            box(paints.cream, side * 1.46, 2.72, (lo + hi) / 2, 0.08, 0.9, hi - lo);
        } else box(paints.cream, side * 1.46, 2.755, (a + b) / 2, 0.08, 1.21, b - a);
      }
    for (const end of [-1, 1]) {
      box(paints.red, 0, 1.55, end * 6.16, 3, 1, 0.08);
      box(paints.gold, 0, 2.1, end * 6.17, 3, 0.1, 0.1);
      box(paints.cream, 0, 2.2, end * 6.16, 3, 0.1, 0.08);
      box(paints.cream, 0, 3.25, end * 6.16, 3, 0.21, 0.08);
      for (const x of [-1.4, -0.35, 0.35, 1.4])
        box(paints.cream, x, 2.73, end * 6.16, 0.2, 0.96, 0.08);
    }
    layer = 'keep';
    box(paints.interior, 0, 1.035, 0, 2.9, 0.12, 12.2);
    box(paints.interior, 0, 3.3, 0, 2.88, 0.08, 12.2);
    for (const side of [-1, 1]) {
      box(paints.seat, side * 1.05, 1.46, 0, 0.58, 0.25, 6.8);
      box(paints.seat, side * 1.3, 1.76, 0, 0.13, 0.55, 6.8);
      for (const z of [-3.4, 3.4])
        cylinder(paints.bright, side * 0.94, 2.2, z, 0.025, 2.2, 'y', false);
    }
    box(paints.sign, 0, 3.23, 0, 0.23, 0.04, 9, false);
    layer = 'shell';
    part(roofGeometry, paints.roof, 0, 3.36, 0, 1, 1, 1);
    box(paints.rubber, 0, 0.95, 0, 2.64, 0.2, 12.15);
    for (const side of [-1, 1]) {
      box(paints.steel, side * 1.52, 1.04, 0, 0.06, 0.12, 11.8);
      box(paints.rubber, side * 1.575, 3.35, 0, 0.07, 0.12, 12.6);
      for (const z of [-2.64, -0.88, 0.88, 2.64]) {
        for (const edge of [-1, 1]) {
          box(paints.rubber, side * 1.555, 2.73 + edge * 0.465, z, 0.07, 0.07, 1.55, false);
          box(paints.rubber, side * 1.555, 2.73, z + edge * 0.74, 0.07, 0.93, 0.07, false);
        }
        box(paints.cabinGlass, side * 1.605, 2.73, z, 0.035, 0.85, 1.41, false);
        box(paints.glint, side * 1.635, 3.08, z, 0.02, 0.038, 1.34, false);
        box(paints.bright, side * 1.643, 2.73, z + 0.04, 0.026, 0.86, 0.045, false);
        box(paints.glint, side * 1.643, 2.77, z - 0.54, 0.022, 0.61, 0.04, false);
      }
      for (const z of [-4.59, 4.59]) {
        // Recess-looking rubber frame is separated from the shell by five centimetres.
        for (const edge of [-1, 1])
          box(paints.rubber, side * 1.55, 2.1, z + edge * 0.705, 0.06, 2.23, 0.07, false);
        box(paints.rubber, side * 1.55, 3.23, z, 0.06, 0.1, 1.48, false);
        box(paints.interior, side * 1.48, 1.1, z, 0.18, 0.05, 1.34, false);
        const indicator = new THREE.Mesh(boxGeometry, paints.doorWarning);
        indicator.name = 'Door / amber interlock indicator';
        indicator.position.set(side * 1.58, 3.32, z);
        indicator.scale.set(0.05, 0.06, 0.24);
        car.add(indicator);
        doorIndicators.push(indicator);
        for (const leaf of [-1, 1]) {
          slidingDoor(
            paints.cream,
            side,
            leaf,
            side * 1.605,
            1.49,
            z + leaf * 0.32,
            0.04,
            1.18,
            0.625,
          );
          slidingDoor(
            paints.interior,
            side,
            leaf,
            side * 1.605,
            3.1,
            z + leaf * 0.32,
            0.04,
            0.16,
            0.625,
          );
          for (const edge of [-1, 1])
            slidingDoor(
              paints.interior,
              side,
              leaf,
              side * 1.605,
              2.55,
              z + leaf * 0.32 + edge * 0.28,
              0.04,
              0.94,
              0.065,
            );
          slidingDoor(
            paints.red,
            side,
            leaf,
            side * 1.643,
            1.385,
            z + leaf * 0.32,
            0.032,
            0.94,
            0.605,
          );
          slidingDoor(
            paints.glass,
            side,
            leaf,
            side * 1.65,
            2.55,
            z + leaf * 0.32,
            0.045,
            0.93,
            0.46,
          );
          slidingDoor(
            paints.bright,
            side,
            leaf,
            side * 1.692,
            2.016,
            z + leaf * 0.016,
            0.025,
            2.28,
            0.027,
          );
          slidingDoor(
            paints.bright,
            side,
            leaf,
            side * 1.698,
            1.84,
            z + leaf * 0.16,
            0.026,
            0.22,
            0.046,
          );
        }
        box(paints.steel, side * 1.64, 0.81, z, 0.28, 0.1, 1.35);
        box(paints.gold, side * 1.685, 0.87, z, 0.07, 0.035, 1.28, false);
      }
      // End grab rails have a stand-off from the body and closed mounting brackets.
      for (const end of [-1, 1]) {
        rod(
          paints.bright,
          [side * 1.66, 1.6, end * 5.75],
          [side * 1.66, 2.65, end * 5.75],
          0.025,
          false,
        );
        box(paints.bright, side * 1.58, 1.59, end * 5.75, 0.16, 0.045, 0.065, false);
        box(paints.bright, side * 1.58, 2.66, end * 5.75, 0.16, 0.045, 0.065, false);
      }
      box(paints.cream, side * 1.545, 1.5, 0, 0.03, 0.2, 0.75, false);
      for (let mark = 0; mark < 3; mark++)
        box(paints.red, side * 1.572, 1.5, (mark - 1) * 0.19, 0.025, 0.11, 0.07, false);
    }
    // End faces, cab windscreens, middle gangway door, and lamp housings.
    for (const end of [-1, 1]) {
      const front = end * 6.2;
      box(paints.cream, 0, 1.45, front + end * 0.115, 0.62, 1.08, 0.04, false);
      box(paints.cream, 0, 3.03, front + end * 0.115, 0.62, 0.1, 0.04, false);
      for (const side of [-1, 1]) {
        box(paints.rubber, side * 0.34, 1.94, front + end * 0.05, 0.06, 2.28, 0.08, false);
        box(paints.cream, side * 0.27, 2.49, front + end * 0.115, 0.09, 1.02, 0.04, false);
      }
      box(paints.glass, 0, 2.49, front + end * 0.15, 0.44, 0.98, 0.04, false);
      box(paints.bright, 0.22, 1.78, front + end * 0.185, 0.035, 0.18, 0.026, false);
      for (const side of [-1, 1]) {
        for (const edge of [-1, 1]) {
          box(
            paints.rubber,
            side * 0.88,
            2.73 + edge * 0.48,
            front + end * 0.05,
            0.94,
            0.065,
            0.08,
            false,
          );
          box(
            paints.rubber,
            side * 0.88 + edge * 0.445,
            2.73,
            front + end * 0.05,
            0.065,
            0.96,
            0.08,
            false,
          );
        }
        box(paints.glass, side * 0.88, 2.73, front + end * 0.115, 0.82, 0.89, 0.04, false);
        box(paints.glint, side * 0.88, 3.12, front + end * 0.15, 0.74, 0.035, 0.02, false);
        if ((index === 0 && end === 1) || (index === CAR_COUNT - 1 && end === -1)) {
          const pivot = new THREE.Group();
          pivot.name = 'Cab / working windscreen wiper';
          pivot.position.set(side * 0.88, 2.34, front + end * 0.18);
          const arm = new THREE.Mesh(boxGeometry, paints.rubber);
          arm.position.set(0, 0.25, 0);
          arm.scale.set(0.024, 0.5, 0.024);
          const blade = new THREE.Mesh(boxGeometry, paints.rubber);
          blade.position.set(0, 0.48, end * 0.015);
          blade.scale.set(0.032, 0.29, 0.032);
          pivot.add(arm, blade);
          car.add(pivot);
          wiperAnimations.push({ pivot, side, end });
        }
        cylinder(paints.steel, side * 1.08, 1.7, front + end * 0.12, 0.18, 0.14, 'z', false);
        box(paints.rubber, side * 0.8, 1.02, front + end * 0.075, 0.85, 0.18, 0.06, false);
        for (let l = 0; l < 3; l++)
          box(
            paints.steel,
            side * 0.8,
            0.97 + l * 0.055,
            front + end * 0.13,
            0.75,
            0.018,
            0.025,
            false,
          );
      }
      // External driving ends get active lamps; the gangway ends stay unlit.
      const external = (index === 0 && end === 1) || (index === CAR_COUNT - 1 && end === -1);
      const lensMaterial = external ? (index === 0 ? paints.head : paints.tail) : paints.inactive;
      for (const side of [-1, 1]) {
        const lamp = new THREE.Mesh(wheelGeometry, lensMaterial);
        lamp.name = `${external ? 'Exterior' : 'Gangway'} lamp / ${end > 0 ? 'front' : 'rear'} ${side > 0 ? 'right' : 'left'}`;
        lamp.rotation.x = Math.PI / 2;
        lamp.scale.set(0.135, 0.035, 0.135);
        lamp.position.set(side * 1.08, 1.7, front + end * 0.22);
        car.add(lamp);
        if (external) (index === 0 ? activeHeadlights : activeTailLights).push(lamp);
      }
      box(paints.rubber, 0, 3.19, front + end * 0.09, 0.92, 0.2, 0.06, false);
      box(paints.sign, 0, 3.19, front + end * 0.14, 0.8, 0.12, 0.03, false);
      box(paints.steel, 0, 0.72, front + end * 0.13, 2.48, 0.2, 0.23);
      box(paints.rubber, 0, 0.43, front + end * 0.12, 1.72, 0.28, 0.22);
      box(paints.steel, 0, 0.57, front + end * 0.25, 0.25, 0.22, 0.45);
      box(paints.rubber, 0, 0.59, front + end * 0.49, 0.59, 0.27, 0.14);
      rod(
        paints.rubber,
        [0.36, 0.65, front + end * 0.05],
        [0.43, 0.22, front + end * 0.38],
        0.055,
        false,
      );
      rod(
        paints.rubber,
        [0.43, 0.22, front + end * 0.38],
        [0.21, 0.18, front + end * 0.51],
        0.055,
        false,
      );
    }
    // Underfloor equipment hangs above rail level between the bogies.
    for (const [z, w, d] of [
      [-1.8, 1.65, 1.7],
      [0.3, 1.8, 1.4],
      [2.1, 1.4, 1.3],
    ]) {
      box(paints.steel, 0, 0.4, z, w, 0.4, d);
      for (const side of [-1, 1])
        for (let l = 0; l < 4; l++)
          box(
            paints.rubber,
            side * (w / 2 + 0.035),
            0.4,
            z + (l - 1.5) * 0.22,
            0.035,
            0.21,
            0.04,
            false,
          );
    }
    const wheels = [];
    for (const bogieZ of [-4.18, 4.18]) {
      box(paints.rubber, 0, 0.52, bogieZ, 2.28, 0.25, 2.4);
      for (const side of [-1, 1]) {
        box(paints.steel, side * 1.09, 0.47, bogieZ, 0.22, 0.3, 2.65);
        cylinder(paints.steel, side * 0.97, 0.66, bogieZ, 0.22, 0.3);
        for (const dz of [-0.38, 0.38]) {
          cylinder(paints.rubber, side * 1.02, 0.55, bogieZ + dz, 0.15, 0.31);
          for (let ring = 0; ring < 3; ring++)
            cylinder(
              paints.bright,
              side * 1.02,
              0.43 + ring * 0.085,
              bogieZ + dz,
              0.16,
              0.027,
              'y',
              false,
            );
        }
      }
      for (const axleZ of [bogieZ - 0.86, bogieZ + 0.86]) {
        cylinder(paints.steel, 0, wheelY, axleZ, 0.11, 2.32, 'x');
        for (const side of [-1, 1]) {
          const wheelX = side * 1.05;
          cylinder(paints.rubber, wheelX, wheelY, axleZ, wheelRadius, 0.22, 'x');
          cylinder(paints.bright, side * 1.18, wheelY, axleZ, 0.365, 0.035, 'x', false);
          cylinder(paints.steel, side * 1.212, wheelY, axleZ, 0.13, 0.045, 'x', false);
          wheels.push({ x: side * 1.24, y: wheelY, z: axleZ });
        }
      }
    }
    const spokeMesh = new THREE.InstancedMesh(boxGeometry, paints.steel, wheels.length * 2);
    spokeMesh.name = 'Animated wheel spokes';
    spokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    spokeMesh.frustumCulled = false;
    spokeMesh.userData.trainLayer = 'shell';
    car.add(spokeMesh);
    wheelAnimations.push({ mesh: spokeMesh, wheels });
    // Roof hardware uses separate heights, preserving visible daylight under the scissor arms.
    box(paints.steel, 0, 3.91, -2.9, 1.65, 0.28, 2.45);
    box(paints.roof, 0, 4.1, -2.9, 1.85, 0.14, 2.6);
    for (let k = 0; k < 7; k++)
      box(paints.rubber, 0, 4.185, -3.86 + k * 0.32, 1.35, 0.026, 0.095, false);
    for (const z of [2.9, 4.55]) {
      box(paints.steel, 0, 3.91, z, 1.12, 0.22, 0.82);
      box(paints.roof, 0, 4.04, z, 1.25, 0.085, 0.92);
    }
    for (const side of [-1, 1])
      rod(paints.bright, [side * 0.92, 3.81, -4.5], [side * 0.92, 3.81, 4.9], 0.026, false);
    if (index < 2) {
      layer = 'pantograph';
      // Contact clearance is relative to the rail, including on mountain grades.
      const railHeight = 4.75,
        contactHeight = wireHeight - railHeight;
      const base = 4.13,
        top = contactHeight - 0.12,
        mid = (base + top) * 0.5,
        z = 0.25;
      box(paints.steel, 0, 3.9, z, 1.25, 0.21, 2.05);
      for (const side of [-1, 1])
        for (const dz of [-0.67, 0.67]) {
          cylinder(paints.insulator, side * 0.45, 4.045, z + dz, 0.13, 0.24);
          cylinder(paints.insulator, side * 0.45, 4.1, z + dz, 0.19, 0.075);
        }
      box(paints.rubber, 0, base, z, 0.94, 0.14, 1.5);
      for (const side of [-1, 1]) {
        const x = side * 0.42;
        rod(paints.steel, [x, base, z - 0.63], [x, mid, z + 1.03], 0.048);
        rod(paints.steel, [x, base, z + 0.63], [x, mid, z - 1.03], 0.048);
        rod(paints.steel, [x, mid, z + 1.03], [x, top, z - 0.23], 0.048);
        rod(paints.steel, [x, mid, z - 1.03], [x, top, z + 0.23], 0.048);
        for (const jointZ of [z - 1.03, z + 1.03])
          cylinder(paints.bright, x, mid, jointZ, 0.1, 0.09, 'x', false);
      }
      box(paints.steel, 0, top, z, 1.55, 0.12, 0.62);
      // Top of both carbon shoes is exactly wireHeight in world space on this level route.
      box(paints.rubber, 0, contactHeight - 0.025, z - 0.21, 1.73, 0.05, 0.1);
      box(paints.rubber, 0, contactHeight - 0.025, z + 0.21, 1.73, 0.05, 0.1);
      for (const side of [-1, 1])
        rod(
          paints.bright,
          [side * 0.87, contactHeight - 0.01, z],
          [side * 1.08, contactHeight - 0.17, z],
          0.028,
          false,
        );
      pantographs.push({
        carIndex: index,
        localContactHeight: contactHeight,
        wireHeight,
        railHeight,
      });
      car.userData.pantographContactHeight = contactHeight;
    }
    layer = 'keep';
    interiors.push(
      createCarInterior({
        THREE,
        car,
        index,
        paints: interiorPaints,
        material,
        geometry,
        boxGeometry,
        box,
        cylinder,
      }),
    );
    for (const [mat, leaves] of doorBatches) {
      const mesh = new THREE.InstancedMesh(boxGeometry, mat, leaves.length);
      mesh.name = `${car.name} / sliding door leaves / ${mat.name}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.userData.trainLayer = 'shell';
      car.add(mesh);
      doorAnimations.push({ mesh, leaves });
    }
    for (const { geo, mat, cast, layer, transforms } of batches.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
      mesh.userData.trainLayer = layer;
      mesh.name = `${car.name} / ${mat.name.split(' / ')[1]}${cast ? '' : ' / surface details'}`;
      for (let i = 0; i < transforms.length; i++) mesh.setMatrixAt(i, transforms[i]);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      car.add(mesh);
    }
    return car;
  }
  for (let index = 0; index < CAR_COUNT; index++) createCar(index);
  const frontBeam = new THREE.SpotLight('#ffe9b0', 0, 105, 0.2, 0.65, 1.1);
  frontBeam.name = 'Lead cab / headlight beam';
  frontBeam.position.set(0, 1.7, 6.47);
  frontBeam.target.position.set(0, 1.5, 75);
  frontBeam.castShadow = false;
  cars[0].add(frontBeam, frontBeam.target);
  const rearBeam = new THREE.SpotLight('#ffe9b0', 0, 105, 0.2, 0.65, 1.1);
  rearBeam.name = 'Rear cab / headlight beam';
  rearBeam.position.set(0, 1.7, -6.47);
  rearBeam.target.position.set(0, 1.5, -75);
  rearBeam.castShadow = false;
  cars[CAR_COUNT - 1].add(rearBeam, rearBeam.target);
  function update(
    dt,
    {
      speed = 0,
      direction = 1,
      dusk = false,
      doorsOpen = false,
      inTunnel = false,
      weather = 'clear',
      lights = 'auto',
      wipers = 'auto',
      power = 0,
      emergency = false,
      leadCar = direction >= 0 ? 0 : CAR_COUNT - 1,
      distance,
      wheelDirection = direction,
      passengers = [],
      brake = 0,
    } = {},
  ) {
    platformSide = direction >= 0 ? 'right' : 'left';
    const targetOpen = doorsOpen && Math.abs(speed) < 0.2 ? 1 : 0;
    doorProgress += (targetOpen - doorProgress) * (1 - Math.exp(-Math.max(0, dt) * 4));
    if (Math.abs(doorProgress - targetOpen) < 0.001) doorProgress = targetOpen;
    for (const { mesh, leaves } of doorAnimations) {
      for (let i = 0; i < leaves.length; i++) {
        const p = leaves[i],
          open = p.side * (direction >= 0 ? 1 : -1) > 0 ? doorProgress : 0;
        dummy.position.set(p.x, p.y, p.z + p.leaf * (p.slide ?? 0.64) * open);
        dummy.rotation.set(0, p.rotY ?? 0, 0);
        dummy.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    let travelled = Math.max(0, dt) * speed;
    if (Number.isFinite(distance)) {
      const delta = lastDistance === null ? 0 : Math.abs(distance - lastDistance);
      travelled = delta < 5 ? delta : 0; // Viewpoint jumps are not wheel travel.
      lastDistance = distance;
    }
    wheelAngle = (wheelAngle + (travelled / wheelRadius) * wheelDirection) % (Math.PI * 2);
    for (const { mesh, wheels } of wheelAnimations) {
      let slot = 0;
      for (const wheel of wheels)
        for (const offset of [0, Math.PI / 2]) {
          dummy.position.set(wheel.x, wheel.y, wheel.z);
          dummy.rotation.set(wheelAngle + offset, 0, 0);
          dummy.scale.set(0.03, 0.07, 0.59);
          dummy.updateMatrix();
          matrix.copy(dummy.matrix);
          mesh.setMatrixAt(slot++, matrix);
        }
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const { mesh, axles, y } of modelWheels) {
      for (let i = 0; i < axles.length; i++) {
        dummy.position.set(0, y, axles[i]);
        dummy.rotation.set(wheelAngle, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    systemsTime += Math.max(0, dt);
    exteriorWetness.advance(dt, weather);
    systemsState = trainSystems({
      weather,
      dusk,
      inTunnel,
      lights,
      wipers,
      power,
      doorsOpen,
      doorFraction: doorProgress,
      emergency,
      leadCar,
    });
    for (const { pivot, side, end } of wiperAnimations) {
      const sweep = systemsState.wipersOn
        ? Math.sin(systemsTime * (weather === 'rain' ? 5.5 : 3.2)) * 0.66
        : -0.7;
      pivot.rotation.z = sweep * end + side * 0.08;
    }
    for (const interior of interiors)
      interior.update({
        dt,
        speed,
        power,
        brake,
        passengers,
        cabinOn: systemsState.cabinOn,
        time: systemsTime,
      });
    paints.cabinGlass.emissiveIntensity = 0;
    paints.doorWarning.emissiveIntensity =
      doorProgress > 0.001 || doorsOpen ? 0.5 + Math.sin(systemsTime * 8) ** 2 * 2 : 0;
    for (const lamp of doorIndicators) lamp.visible = doorProgress > 0.001 || doorsOpen;
    if (lastDirection !== leadCar) {
      for (const lamp of activeHeadlights)
        lamp.material = leadCar === 0 ? paints.head : paints.tail;
      for (const lamp of activeTailLights)
        lamp.material = leadCar === 0 ? paints.tail : paints.head;
      lastDirection = leadCar;
    }
    if (lastDusk !== dusk) {
      paints.sign.emissiveIntensity = dusk ? 1.15 : 0.28;
      paints.head.emissiveIntensity = dusk ? 3 : 1.8;
      paints.tail.emissiveIntensity = dusk ? 2 : 1.2;
      lastDusk = dusk;
    }
    paints.head.emissiveIntensity = systemsState.headlightOn ? 3 : 0.25;
    frontBeam.intensity = systemsState.headlightOn && leadCar === 0 ? 48 : 0;
    rearBeam.intensity = systemsState.headlightOn && leadCar === CAR_COUNT - 1 ? 48 : 0;
  }
  /** Every mesh a glTF node draws: the node itself, or one child per primitive. */
  const meshesOf = (node) => (node.isMesh ? [node] : node.children.filter((child) => child.isMesh));
  const modelMaterials = new Map();
  const instancedMaterials = new Map();
  /**
   * The runtime material for a glTF material. Instanced parts (door leaves, wheelsets) get
   * their own copy: three.js picks a program per material, and one material drawn by both a
   * plain and an instanced mesh re-selects its program on every draw, in every pass.
   */
  function modelMaterial(source, { instanced = false } = {}) {
    if (source.name === 'train-sign') return paints.sign;
    const cache = instanced ? instancedMaterials : modelMaterials;
    if (cache.has(source)) return cache.get(source);
    const result = instanced ? source.clone() : source;
    // Blender exports every material double-sided. Opaque parts are closed solids, so their
    // back faces are hidden inside them; drawn, they z-fight with every face they touch
    // (roof vents on the roof, gangway rubber on the end wall, seals on door leaves).
    if (source.name !== 'train-glass') {
      result.side = THREE.FrontSide;
      result.shadowSide = THREE.FrontSide;
    }
    if (source.name === 'train-paint')
      applyWeatherFinish(result, TRAIN_FAMILIES.paint, exteriorWetness.uniform);
    if (source.name === 'train-roof')
      applyWeatherFinish(result, TRAIN_FAMILIES.roofPaint, exteriorWetness.uniform);
    if (['train-metal', 'train-bright'].includes(source.name))
      applyWeatherFinish(result, TRAIN_FAMILIES.steel, exteriorWetness.uniform);
    if (source.name === 'train-glass') {
      // Same depth rules as the procedural glazing, so cabin figures stay visible behind it.
      result.transparent = true;
      result.depthWrite = false;
      result.side = THREE.DoubleSide;
      // Thin panes need no back-then-front pass; two passes also flag the material for a
      // new program on every draw.
      result.forceSinglePass = true;
    }
    materials.add(result);
    cache.set(source, result);
    return result;
  }
  function instanced(part, count, name, car) {
    return meshesOf(part).map((source) => {
      const mesh = new THREE.InstancedMesh(
        source.geometry,
        modelMaterial(source.material, { instanced: true }),
        count,
      );
      mesh.name = `${car.name} / ${name} / ${source.material.name}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = source.material.name !== 'train-glass';
      mesh.receiveShadow = true;
      mesh.userData.trainLayer = 'model';
      geometries.add(source.geometry);
      car.add(mesh);
      return mesh;
    });
  }
  /**
   * Replace the procedural exterior with the Blender parts. Cabin, seats, passengers,
   * lamps, wipers and door lamps stay procedural and keep their behaviour. Returns true
   * when the model is in use; a missing or incomplete file leaves the train unchanged.
   */
  function applyModel(gltf) {
    const parts = {};
    gltf?.scene?.traverse((node) => {
      if (MODEL_PARTS.includes(node.name) && !parts[node.name]) parts[node.name] = node;
    });
    if (MODEL_PARTS.some((name) => !parts[name])) return false;
    const layout = parts['car-cab'].userData;
    const contactHeight = parts.pantograph.userData.contactHeight;
    for (const car of cars) {
      const { carIndex } = car.userData;
      const cab = carIndex === 0 || carIndex === CAR_COUNT - 1;
      const body = parts[cab ? 'car-cab' : 'car-middle'].clone();
      body.name = `${car.name} / Blender body`;
      body.position.set(0, 0, 0);
      // The rear driving car is the same cab body facing backwards.
      body.rotation.set(0, carIndex === CAR_COUNT - 1 ? Math.PI : 0, 0);
      for (const mesh of meshesOf(body)) {
        mesh.material = modelMaterial(mesh.material);
        mesh.castShadow = mesh.material.name !== 'train-glass';
        mesh.receiveShadow = true;
        geometries.add(mesh.geometry);
      }
      body.userData = { ...body.userData, trainLayer: 'model' };
      car.add(body);
      const leaves = [];
      for (const side of [-1, 1])
        for (const doorZ of layout.doorCentres)
          for (const leaf of [-1, 1])
            leaves.push({
              side,
              leaf,
              x: side * layout.leafX,
              y: layout.leafY,
              z: doorZ + leaf * layout.leafOffset,
              rotY: side > 0 ? 0 : Math.PI,
              slide: layout.leafSlide,
            });
      for (const mesh of instanced(parts['door-leaf'], leaves.length, 'sliding door leaves', car))
        doorAnimations.push({ mesh, leaves });
      for (const mesh of instanced(parts.wheelset, layout.axles.length, 'wheelsets', car))
        modelWheels.push({ mesh, axles: layout.axles, y: layout.wheelCentreY });
      const pantograph =
        Number.isFinite(car.userData.pantographContactHeight) &&
        Math.abs(car.userData.pantographContactHeight - contactHeight) < 0.001;
      if (pantograph) {
        const arms = parts.pantograph.clone();
        arms.name = `${car.name} / Blender pantograph`;
        arms.position.set(0, 0, parts.pantograph.userData.baseZ);
        for (const mesh of meshesOf(arms)) {
          mesh.material = modelMaterial(mesh.material);
          mesh.castShadow = true;
          geometries.add(mesh.geometry);
        }
        car.add(arms);
      }
      for (const child of car.children) {
        const hidden =
          child.userData.trainLayer === 'shell' ||
          (pantograph && child.userData.trainLayer === 'pantograph') ||
          child.name.startsWith('Gangway lamp');
        if (hidden) child.visible = false;
        // Door lamps and wipers move onto the new skin and windscreen.
        if (child.name === 'Door / amber interlock indicator')
          child.position.x = Math.sign(child.position.x) * (layout.skinX + 0.03);
        if (child.name === 'Cab / working windscreen wiper')
          child.position.z = Math.sign(child.position.z) * (layout.windscreenZ + 0.05);
      }
    }
    // Hidden procedural doors and spokes no longer need per-frame matrices.
    for (const list of [doorAnimations, wheelAnimations])
      for (let i = list.length - 1; i >= 0; i--) if (!list[i].mesh.visible) list.splice(i, 1);
    update(0);
    return true;
  }
  update(0);
  return {
    cars,
    update,
    /** Load the Blender train through a model loader (rendering/model-loader.js). */
    attachModel(loader, path = TRAIN_MODEL_PATH) {
      if (modelState !== 'procedural' || !loader) return Promise.resolve(modelState);
      modelState = 'loading';
      return loader.get(path).then((gltf) => {
        modelState = applyModel(gltf) ? 'blender' : 'failed';
        return modelState;
      });
    },
    /** Seated riders of every carriage for the crowd kit (characters/crowd/crowd.js). */
    crowdPeople(push) {
      for (const interior of interiors) interior.crowdPeople(push);
    },
    setCrowdHidden(id, hidden) {
      for (const interior of interiors) if (interior.setCrowdHidden(id, hidden)) return;
    },
    /** Keep interior riders clear of a drama seat in one car (see interior.js). */
    reserveSeat(index, x, z, seconds) {
      interiors.find((interior) => interior.state().carIndex === index)?.reserveSeat(x, z, seconds);
    },
    /** World positions of seated passengers' heads in one car (see interior.js). */
    interiorHeads: (index) =>
      interiors.find((interior) => interior.state().carIndex === index)?.heads() ?? [],
    getDoorState: () => ({
      openFraction: doorProgress,
      platformSide: platformSide,
    }),
    getSystemsState: () => ({
      ...systemsState,
      model: modelState,
      wheelAngle,
      exteriorWetness: exteriorWetness.value,
      interiors: interiors.map((interior) => interior.state()),
      wiperAngles: wiperAnimations.map(({ pivot }) => pivot.rotation.z),
    }),
    carSpacing,
    pantographs,
    materials: paints,
    dimensions: {
      length: trainLength,
      width: 3,
      roofTop: 3.77,
      wheelRadius,
      wheelCenterHeight: wheelY,
    },
    dispose() {
      for (const car of cars) {
        car.traverse((object) => {
          if (object.isInstancedMesh) object.dispose();
        });
        scene.remove(car);
      }
      for (const geometry of geometries) geometry.dispose();
      for (const mat of materials) mat.dispose();
    },
  };
}
