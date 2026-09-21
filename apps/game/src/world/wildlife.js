import { openingAnimalPose } from '../presentation/opening-sequence.js';
import { wildlifeSeason } from './wildlife-seasons.js';
import { createWildlifeModelRenderer, WILDLIFE_MODELS } from './wildlife-models.js';

/** Local habitat routines; model geometry and instance buffers remain outside game state. */
export function addWildlife({
  THREE,
  scene,
  center,
  terrain,
  riverProfile,
  waterY = -0.4,
  season = 'autumn',
}) {
  let activeSeason = season,
    cast = wildlifeSeason(season),
    elapsed = 0,
    swimTime = 0,
    duckTime = 0,
    flightAmount = 1,
    disposed = false;
  let openingAnimals = [];
  const root = new THREE.Group();
  root.name = 'Seasonal valley wildlife';
  scene.add(root);
  const models = createWildlifeModelRenderer(root);
  const branchGeometry = new THREE.CylinderGeometry(0.8, 1, 1, 8),
    branchMaterial = new THREE.MeshStandardMaterial({ color: '#695c48', roughness: 1 });
  const snags = new THREE.InstancedMesh(branchGeometry, branchMaterial, 6),
    branches = new THREE.InstancedMesh(branchGeometry, branchMaterial, 6);
  snags.name = 'Bird perch snags';
  branches.name = 'Bird perch branches';
  root.add(snags, branches);
  const dummy = new THREE.Object3D();
  const schoolCount = 11,
    perSchool = 7,
    fishCount = 77,
    birdCount = 18;
  const fish = [],
    deer = [],
    birds = [],
    mammals = [],
    reptiles = [],
    perches = [];
  let storyAnimal = null;
  const paths = Array.from({ length: 14 }, (_, i) => i * 1.7);
  const round = (n) => Math.round(n * 1000) / 1000;
  const dryBank = (z, extra = 0) => {
    const p = riverProfile(z);
    return p.offset - p.halfWidth - 10 - extra;
  };
  function instance(mesh, i, p, scale, rotation = 0) {
    dummy.position.fromArray(p);
    dummy.scale.fromArray(scale);
    dummy.rotation.set(0, 0, rotation);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  for (let i = 0; i < 12; i++) {
    const z = [-650, -450, -230, -10, 480, 650][Math.floor(i / 2)] + (i % 2) * 7,
      u = dryBank(z, 4 + (i % 3) * 2);
    deer.push({
      id: `sika-${i + 1}`,
      species: 'sika-deer',
      baseZ: z,
      baseU: u,
      x: center(z) + u,
      y: terrain(u, z),
      z,
      heading: 0,
      state: 'grazing',
      alert: 0,
    });
  }
  for (let i = 0; i < 6; i++) {
    const z = [-640, -440, -200, 60, 495, 680][i],
      u = dryBank(z, 6),
      p = { x: center(z) + u, y: terrain(u, z), z };
    perches.push(p);
    instance(snags, i, [p.x, p.y + 1.65, p.z], [0.2, 3.3, 0.2], 0.08);
    instance(branches, i, [p.x + 0.45, p.y + 3, p.z], [0.075, 1.4, 0.075], Math.PI * 0.44);
  }
  function fishPose(index, time) {
    const school = Math.floor(index / perSchool),
      member = index % perSchool,
      phase = time * 0.075 + school * 1.37;
    const z = -720 + school * 143 + Math.sin(phase) * 22 + (member - 3) * 1.05,
      p = riverProfile(z);
    const fraction = Math.sin(phase + 0.75) * 0.27 + ((member % 3) - 1) * 0.055,
      u = p.offset + fraction * p.halfWidth,
      n = Math.abs(fraction);
    const available = p.depth * (1 - n * n * (3 - 2 * n)) * 0.84;
    const depth = Math.min(
      cast.fishDepth + (member % 4) * 0.12 + Math.sin(time * 0.6 + member) * 0.025,
      available * 0.55,
    );
    return { x: center(z) + u, y: waterY - depth, z, school };
  }
  function update(
    dt,
    {
      cameraPosition,
      weather = 'clear',
      dusk = false,
      trainPosition,
      season = activeSeason,
      encounter = null,
      opening = null,
    } = {},
  ) {
    if (disposed) return;
    if (!Number.isFinite(dt) || dt < 0)
      throw new TypeError('Wildlife time step must be finite and nonnegative.');
    if (season !== activeSeason) {
      const next = wildlifeSeason(season);
      activeSeason = season;
      cast = next;
    }
    dt = Math.min(dt, 0.1);
    elapsed += dt;
    swimTime += dt * cast.fishSpeed;
    if (weather === 'clear' && !dusk) duckTime += dt;
    flightAmount = THREE.MathUtils.lerp(
      flightAmount,
      weather !== 'clear' || dusk ? 0 : 1,
      1 - Math.exp(-dt * 0.8),
    );
    const train = Array.isArray(trainPosition)
      ? { x: trainPosition[0], y: trainPosition[1], z: trainPosition[2] }
      : trainPosition;
    openingAnimals = [];
    models.begin();
    const inValley = !cameraPosition || (cameraPosition.z > -1050 && cameraPosition.z < 1100);
    snags.visible = branches.visible = inValley;
    storyAnimal = encounter?.visible ? encounter.pose : null;
    const indices = new Map();
    const draw = (species, pose) => {
      if (!inValley) return;
      const index = indices.get(species) ?? 0;
      indices.set(species, index + 1);
      const staged = train && openingAnimalPose(species, index, opening, train, center, terrain);
      if (staged)
        openingAnimals.push({
          species,
          position: [staged.x, staged.y, staged.z],
          walking: staged.walking,
          flying: staged.flying,
        });
      models.draw(species, index, staged ?? { ...pose, time: elapsed, season: activeSeason });
    };
    for (let i = 0; i < fishCount; i++) {
      const p = fishPose(i, swimTime),
        next = fishPose(i, swimTime + 0.15),
        heading = Math.atan2(next.x - p.x, next.z - p.z);
      const species = p.school % 4 === 1 ? cast.secondaryFish : cast.fish;
      fish[i] = { ...p, id: `${species}-${i + 1}`, species, heading };
      // Scale tiny medaka up for legibility, while retaining a visibly slimmer silhouette.
      const size = 0.88 + (i % 3) * 0.12;
      const index = indices.get(species) ?? 0;
      indices.set(species, index + 1);
      if (inValley)
        models.draw(species, index, { ...p, heading, time: swimTime, size, season: activeSeason });
    }
    for (let i = 0; i < cast.deer; i++) {
      const p = deer[i],
        cycle = elapsed * 0.16 + i * 0.91,
        walk = Math.sin(cycle) > 0.63,
        desiredZ = p.baseZ + Math.sin(cycle * 0.5) * 2.8;
      const near = train && Math.hypot(train.x - p.x, train.z - p.z) < 47;
      if (walk && !near) {
        const u = Math.min(p.baseU + Math.cos(cycle * 0.5) * 1.7, dryBank(desiredZ, 1));
        const dx = center(desiredZ) + u - p.x,
          dz = desiredZ - p.z,
          step = Math.min(1, (dt * 0.48) / Math.max(Math.hypot(dx, dz), 0.001));
        p.x += dx * step;
        p.z += dz * step;
      }
      const u = Math.min(p.x - center(p.z), dryBank(p.z, 1));
      p.x = center(p.z) + u;
      p.y = terrain(u, p.z);
      p.alert = THREE.MathUtils.lerp(p.alert, near ? 1 : 0, 1 - Math.exp(-dt * 2.8));
      p.state = p.alert > 0.35 ? 'alert' : walk ? 'walking' : 'grazing';
      p.heading =
        p.alert > 0.35 && train
          ? Math.atan2(train.x - p.x, train.z - p.z)
          : Math.sin(cycle * 0.5) * 0.5 + 0.8;
      draw('sika-deer', {
        ...p,
        alert: p.alert > 0.35,
        walking: walk && p.alert < 0.35,
        graze: p.state === 'grazing' ? 0.9 : 0,
      });
    }
    mammals.length = 0;
    reptiles.length = 0;
    const castAnimals = [
      ...Array(cast.mammals).fill(cast.mammal),
      ...Array(cast.companions).fill(cast.companion),
    ];
    const speciesIndices = new Map();
    for (let i = 0; i < castAnimals.length; i++) {
      const species = castAnimals[i],
        hare = species === 'japanese-hare',
        turtle = species === 'pond-turtle';
      const local = speciesIndices.get(species) ?? 0;
      speciesIndices.set(species, local + 1);
      const baseZ =
        [-650, -450, -230, -10, 480, 650, -200, 60][local] + (species === cast.companion ? 18 : 0);
      const cycle = elapsed * (hare ? 0.9 : turtle ? 0.16 : 0.35) + i * 1.7;
      const shelter = weather !== 'clear',
        baseX = center(baseZ) + dryBank(baseZ, 5),
        alert = Boolean(train && Math.hypot(train.x - baseX, train.z - baseZ) < 47);
      const walking = !shelter && !alert && Math.sin(cycle * 0.4) > -0.25;
      if (walking) paths[i] += dt * (hare ? 0.9 : turtle ? 0.13 : 0.35);
      const z = baseZ + Math.sin(paths[i] * 0.25) * 2,
        u = dryBank(z, 5 + Math.cos(paths[i] * 0.25)),
        x = center(z) + u,
        y = terrain(u, z);
      const heading = alert
        ? Math.atan2(train.x - x, train.z - z)
        : 0.8 + Math.cos(paths[i] * 0.25) * 0.5;
      const p = {
        id: `${species}-${local + 1}`,
        species,
        x,
        y,
        z,
        heading,
        state: alert
          ? 'alert'
          : shelter
            ? 'sheltering'
            : walking
              ? hare
                ? 'hopping'
                : 'foraging'
              : turtle
                ? 'basking'
                : 'resting',
      };
      (turtle ? reptiles : mammals).push(p);
      draw(species, {
        ...p,
        walking,
        alert,
        hop: hare && walking ? Math.max(0, Math.sin(cycle * 5)) * 0.22 : 0,
      });
    }
    for (let i = 0; i < birdCount; i++) {
      const flock = Math.floor(i / 3),
        member = i % 3,
        p = perches[flock],
        species = member === 2 ? cast.secondaryBird : cast.bird;
      if (species === 'mandarin-duck') {
        const phase = duckTime * 0.065 + flock,
          z = p.z + Math.sin(phase) * 9,
          channel = riverProfile(z),
          u = channel.offset + Math.sin(phase * 0.7) * channel.halfWidth * 0.24;
        const nextZ = p.z + Math.sin(phase + 0.01) * 9,
          nextChannel = riverProfile(nextZ),
          nextX =
            center(nextZ) +
            nextChannel.offset +
            Math.sin((phase + 0.01) * 0.7) * nextChannel.halfWidth * 0.24;
        const x = center(z) + u,
          y = waterY + 0.065,
          heading = Math.atan2(nextX - x, nextZ - z);
        birds[i] = {
          id: `${species}-${i + 1}`,
          species,
          x,
          y,
          z,
          state: weather === 'clear' && !dusk ? 'swimming' : 'resting',
          flock,
        };
        draw(species, { x, y, z, heading, flying: false });
      } else {
        const cycle = (elapsed + flock * 8) % 48,
          t = cycle / 32,
          flying = cycle < 32 && flightAmount > 0.03;
        const lift = flying ? Math.sin(Math.PI * t) * flightAmount : 0,
          angle = t * Math.PI * 2,
          spread = member * 0.6;
        const x = p.x + member * 0.35 + lift * (Math.sin(angle) * 10 + spread),
          z = p.z + lift * (12 + Math.cos(angle) * 8 + spread),
          y = p.y + 3.18 + lift * (8 + Math.sin(angle) * 2) + member * 0.035;
        const heading = flying ? angle + Math.PI * 0.5 : Math.PI * 0.25;
        birds[i] = {
          id: `${species}-${i + 1}`,
          species,
          x,
          y,
          z,
          state: flying ? 'flying' : 'perched',
          flock,
        };
        draw(species, { x, y, z, heading, flying });
      }
    }
    if (storyAnimal)
      models.draw(storyAnimal.species, indices.get(storyAnimal.species) ?? 0, storyAnimal);
    models.end();
    root.visible = inValley || Boolean(storyAnimal);
  }
  const snapshot = (p) => ({
    id: p.id,
    species: p.species,
    ...(p.state ? { state: p.state } : {}),
    ...(p.school !== undefined ? { school: p.school } : {}),
    ...(p.flock !== undefined ? { flock: p.flock } : {}),
    position: [round(p.x), round(p.y), round(p.z)],
  });
  update(0);
  return {
    update,
    getState() {
      return {
        openingAnimals: structuredClone(openingAnimals),
        elapsed: round(elapsed),
        season: activeSeason,
        species: {
          fish: cast.fish,
          secondaryFish: cast.secondaryFish,
          birds: cast.bird,
          secondaryBird: cast.secondaryBird,
          mammals: cast.mammal,
          companion: cast.companion,
          deer: 'sika-deer',
        },
        counts: {
          fish: fishCount,
          deer: cast.deer,
          birds: birdCount,
          mammals: mammals.length,
          reptiles: reptiles.length,
        },
        schools: schoolCount,
        rendering: models.getStats(),
        fish: fish.map(snapshot),
        deer: deer.slice(0, cast.deer).map(snapshot),
        mammals: mammals.map(snapshot),
        reptiles: reptiles.map(snapshot),
        birds: birds.map(snapshot),
        catalog: Object.keys(WILDLIFE_MODELS),
        storyAnimal: storyAnimal ? snapshot({ ...storyAnimal, id: 'story-visitor' }) : null,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      models.dispose();
      snags.dispose();
      branches.dispose();
      branchGeometry.dispose();
      branchMaterial.dispose();
      scene.remove(root);
    },
  };
}
