import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CROSSING_ROAD,
  CROSSING_TIMING,
  LEVEL_CROSSINGS,
  advanceCrossingTraffic,
  createLevelCrossings,
  crossingFrame,
  crossingPhase,
  crossingSiteReport,
  renderedTerrainHeight,
} from '../src/world/level-crossings.js';
import {
  additionalStops,
  createExtendedWorld,
  landmarks,
  routeCenter,
  routeElevation,
  scenicTerrain,
} from '../src/world/extended-route.js';
import { TOKYO_PASSAGE } from '../src/world/tokyo-passage.js';
import { CROSSING_BELL, bellLevel, createCrossingBell } from '../src/audio/crossing-bell.js';
const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);
const TRAIN = 67.5;

// Drive a train past a crossing and record each phase change with the front position.
function ride({ crossingZ = 5000, start, speed, direction, seconds = 60 }) {
  let state = { phase: 'open', timer: 0 },
    front = start,
    prevFront;
  const changes = [{ phase: 'open', front }];
  for (let t = 0; t < seconds; t += 0.05) {
    front += direction * speed * 0.05;
    state = crossingPhase({
      trainFront: front,
      trainRear: front - direction * TRAIN,
      crossingZ,
      speed,
      direction,
      prevPhase: state.phase,
      timer: state.timer,
      dt: 0.05,
      prevFront,
    });
    prevFront = front;
    if (state.phase !== changes.at(-1).phase) changes.push({ phase: state.phase, front });
  }
  return changes;
}

test('crossing warns, lowers, closes before the train and reopens after it clears, both ways', () => {
  for (const direction of [1, -1]) {
    const changes = ride({ start: 5000 - direction * 600, speed: 20, direction });
    assert.deepEqual(
      changes.map((c) => c.phase),
      ['open', 'warning', 'lowering', 'closed', 'raising', 'open'],
    );
    const closed = changes.find((c) => c.phase === 'closed');
    const ahead = (5000 - closed.front) * direction;
    assert.ok(ahead > 20 * 3, `closed ${ahead} m before the train reaches the road`);
    const raising = changes.find((c) => c.phase === 'raising');
    const rearPast = (raising.front - direction * TRAIN - 5000) * direction;
    assert.ok(rearPast >= CROSSING_TIMING.clearMetres, 'whole train clears before arms rise');
    const warning = changes.find((c) => c.phase === 'warning');
    assert.ok((5000 - warning.front) * direction <= 250);
  }
});

test('a fast train gets at least the lead time; a stopped train on the crossing keeps it shut', () => {
  const fast = ride({ start: 4000, speed: 44, direction: 1, seconds: 30 });
  const warn = fast.find((c) => c.phase === 'warning');
  assert.ok((5000 - warn.front) / 44 >= CROSSING_TIMING.leadSeconds - 0.1);
  let state = { phase: 'closed', timer: 0 };
  for (let i = 0; i < 2000; i++)
    state = crossingPhase({
      trainFront: 5030,
      trainRear: 5030 - TRAIN,
      crossingZ: 5000,
      speed: 0,
      direction: 1,
      prevPhase: state.phase,
      timer: state.timer,
      dt: 0.1,
      prevFront: 5030,
    });
  assert.equal(state.phase, 'closed');
  // Standing just short of the road holds it closed; a distant stopped train does not warn.
  const near = crossingPhase({ trainFront: 4960, trainRear: 4892, crossingZ: 5000, dt: 0.1 });
  assert.equal(near.phase, 'warning');
  const far = crossingPhase({ trainFront: 4800, trainRear: 4732, crossingZ: 5000, dt: 0.1 });
  assert.equal(far.phase, 'open');
});

test('viewpoint jumps reset the crossing instead of leaving it stuck', () => {
  const away = crossingPhase({
    trainFront: 9000,
    trainRear: 9000 - TRAIN,
    crossingZ: 5000,
    speed: 0,
    prevPhase: 'closed',
    timer: 0,
    dt: 0.05,
    prevFront: 5010,
  });
  assert.equal(away.phase, 'open');
  assert.equal(away.barrier, 0);
  assert.equal(away.reset, true);
  const onto = crossingPhase({
    trainFront: 5020,
    trainRear: 5020 - TRAIN,
    crossingZ: 5000,
    speed: 0,
    prevPhase: 'open',
    dt: 0.05,
    prevFront: 12000,
  });
  assert.equal(onto.phase, 'closed');
  assert.equal(onto.barrier, 1);
  assert.equal(crossingPhase({ trainFront: NaN, trainRear: 0, crossingZ: 5000 }).phase, 'open');
  // A reversal during lowering raises the arms from their current angle.
  const reversing = crossingPhase({
    trainFront: 4700,
    trainRear: 4767,
    crossingZ: 5000,
    speed: 5,
    direction: -1,
    prevPhase: 'lowering',
    timer: CROSSING_TIMING.lower / 2,
    dt: 0,
    prevFront: 4700,
  });
  assert.equal(reversing.phase, 'raising');
  assert.ok(Math.abs(reversing.barrier - 0.5) < 1e-9);
});

test('crossing sites respect stops, landmarks, masts and the hillside rule', () => {
  assert.ok(LEVEL_CROSSINGS.length >= 5 && LEVEL_CROSSINGS.length <= 7);
  assert.equal(new Set(LEVEL_CROSSINGS.map((site) => site.id)).size, LEVEL_CROSSINGS.length);
  for (const site of LEVEL_CROSSINGS) {
    const report = crossingSiteReport(site.z);
    assert.ok(report.ok, `${site.name}: ${report.reasons.join(', ')}`);
    for (const stop of additionalStops) assert.ok(Math.abs(stop.z - site.z) >= 90, site.name);
    assert.ok(Math.abs(site.z - landmarks.bridgeZ) > 250);
    assert.ok(site.z < landmarks.tunnelStartZ - 200 || site.z > landmarks.tunnelEndZ + 200);
    assert.ok(site.z < TOKYO_PASSAGE.start);
    // Within the built road, ground stays within 6 m of the rail on both sides.
    const { rail, n } = crossingFrame(site.z, railPoint);
    for (const sign of [-1, 1])
      for (let s = 0; s <= report.sides[sign > 0 ? 'plus' : 'minus']; s += 2) {
        const h = scenicTerrain(rail.x + n.x * s * sign, rail.z + n.z * s * sign);
        assert.ok(Math.abs(h - (rail.y - 0.65)) <= 6, `${site.name} at ${s * sign} m`);
      }
  }
  assert.ok(!crossingSiteReport(1500).ok, 'Sakuragawa platform');
  assert.ok(!crossingSiteReport(11500).ok, 'tunnel');
  assert.ok(!crossingSiteReport(6250).ok, 'bridge');
  assert.ok(!crossingSiteReport(7520).ok, 'catenary mast');
});

test('cars queue behind the stop line while closed, then each makes a full stop once open', () => {
  const ends = { minus: 32, plus: 32 };
  const cars = [0, 1, 2].map((k) => ({
    s: 30 - k * 6,
    d: -1,
    speed: 9,
    cruise: 9.7,
    length: 3.4,
    doneStop: false,
    wait: 0,
    hidden: false,
  }));
  for (let t = 0; t < 20; t += 0.05) advanceCrossingTraffic(cars, 0.05, { open: false, ends });
  const line = CROSSING_ROAD.stopLine;
  const sorted = [...cars].sort((a, b) => a.s - b.s);
  assert.ok(Math.abs(sorted[0].s - sorted[0].length / 2 - line) < 0.4, 'leader waits at the line');
  for (const car of cars) {
    assert.equal(car.speed, 0);
    assert.ok(car.s - car.length / 2 >= line - 0.05, 'nobody crosses the line');
  }
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].s - sorted[i].length / 2 - (sorted[i - 1].s + sorted[i - 1].length / 2);
    assert.ok(gap >= 1.95 && gap < 2.6, `queue gap ${gap}`);
  }
  // Open: the leader still waits one second at the line before driving on.
  const leader = sorted[0];
  let held = 0;
  for (let t = 0; t < 0.9; t += 0.05) {
    advanceCrossingTraffic(cars, 0.05, { open: true, ends });
    if (leader.speed === 0) held += 0.05;
  }
  assert.ok(held >= 0.85 && leader.s - leader.length / 2 >= line - 0.05);
  // Each later car also stops for a second at the line before it crosses.
  const stopped = new Map(cars.map((car) => [car, car === leader ? held : 0]));
  for (let t = 0; t < 30; t += 0.05) {
    const before = cars.map((car) => car.s - car.length / 2);
    advanceCrossingTraffic(cars, 0.05, { open: true, ends });
    cars.forEach((car, i) => {
      if (car.speed === 0) stopped.set(car, stopped.get(car) + 0.05);
      if (before[i] >= line - 0.05 && car.s - car.length / 2 < line - 0.05) {
        assert.ok(stopped.get(car) >= 0.95, 'crossed the line without a full stop');
        stopped.set(car, 0);
      }
    });
  }
  // Frozen when dt is zero.
  const frozen = JSON.stringify(cars);
  advanceCrossingTraffic(cars, 0, { open: true, ends });
  assert.equal(JSON.stringify(cars), frozen);
});

test('every open-road car makes a brief stop at its line', () => {
  const ends = { minus: 30, plus: 30 };
  const car = { s: -29, d: 1, speed: 9, cruise: 10, length: 3.4, doneStop: false, wait: 0 };
  let stopped = 0,
    crossedWithoutStop = false;
  for (let t = 0; t < 12; t += 0.02) {
    advanceCrossingTraffic([car], 0.02, { open: true, ends });
    if (car.speed === 0) stopped += 0.02;
    if (car.s > 0 && stopped < 0.95) crossedWithoutStop = true;
  }
  assert.equal(crossedWithoutStop, false);
  assert.ok(stopped >= 0.95);
});

test('roads sit on the rendered terrain and stay clear of trees, farms and buildings', () => {
  const scene = new THREE.Scene();
  const world = createExtendedWorld({ THREE, scene, railPoint, center: routeCenter });
  const crossings = createLevelCrossings({ THREE, scene, railPoint, center: routeCenter });
  const raycaster = new THREE.Raycaster();
  const road = crossings.group.getObjectByName('Level crossings / asphalt farm roads');
  for (const site of LEVEL_CROSSINGS) {
    world.update(0, { position: railPoint(site.z) });
    const { rail, n, t } = crossingFrame(site.z, railPoint);
    const { ends } = crossings.group.children.find((c) => c.userData.id === site.id).userData;
    const grounds = [],
      trunks = [];
    scene.traverse((object) => {
      if (object.name === 'Mountain and valley terrain') grounds.push(object);
      if (object.isInstancedMesh && object.material.name === 'Regional railway / tree trunks')
        trunks.push(object);
    });
    // The road's rendered edge and centre stay just above the ground triangles.
    for (let s = -ends.minus + 1; s < ends.plus - 1; s += 1.5) {
      if (Math.abs(s) < 10) continue;
      for (const w of [-2.9, 0, 2.9]) {
        const x = rail.x + n.x * s + t.x * w,
          z = rail.z + n.z * s + t.z * w;
        raycaster.set(new THREE.Vector3(x, 2000, z), new THREE.Vector3(0, -1, 0));
        const hit = raycaster.intersectObjects(grounds, false)[0];
        assert.ok(hit, `${site.name} ground at ${s}`);
        const mesh = Math.abs(hit.point.y - renderedTerrainHeight(x, z, scenicTerrain, railPoint));
        assert.ok(mesh < 0.05, `${site.name} lattice mirror off by ${mesh} at ${s}, ${w}`);
        const asphalt = raycaster.intersectObject(road, false)[0];
        const lift = asphalt.point.y - hit.point.y;
        assert.ok(lift > 0.02 && lift < 1.5, `${site.name} road lift ${lift} at ${s}, ${w}`);
      }
    }
    const matrix = new THREE.Matrix4(),
      p = new THREE.Vector3();
    const onRoad = (x, z, margin) => {
      const s = (x - rail.x) * n.x + (z - rail.z) * n.z,
        w = (x - rail.x) * t.x + (z - rail.z) * t.z;
      return s > -ends.minus - margin && s < ends.plus + margin && Math.abs(w) < 3 + margin;
    };
    for (const mesh of trunks)
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        p.setFromMatrixPosition(matrix);
        assert.ok(!onRoad(p.x, p.z, 0.6), `${site.name}: tree at ${p.x.toFixed(1)}, ${p.z}`);
      }
    const state = world.getState();
    for (const farm of state.farms)
      for (let s = -ends.minus; s <= ends.plus; s += 1)
        for (const w of [-3, 3]) {
          const x = rail.x + n.x * s + t.x * w,
            z = rail.z + n.z * s + t.z * w;
          assert.ok(
            !(Math.abs(x - farm.x) < 11 && Math.abs(z - farm.z) < 27.5),
            `${site.name}: farm ${farm.id}`,
          );
        }
    for (const building of state.buildings)
      assert.ok(Math.abs(building.position[2] - site.z) > 25, `${site.name}: ${building.id}`);
  }
  crossings.dispose();
  world.dispose();
});

test('crossing scene stays within the draw-call budget, reports plain state and disposes', () => {
  const scene = new THREE.Scene();
  const crossings = createLevelCrossings({
    THREE,
    scene,
    railPoint,
    center: routeCenter,
    terrainAt: (x, z) => scenicTerrain(x, z),
  });
  const site = LEVEL_CROSSINGS[0];
  const meshes = [];
  crossings.group.traverse((object) => object.isMesh && meshes.push(object));
  assert.ok(meshes.length < 25, `${meshes.length} draw calls`);
  assert.ok(crossings.group.children.some((c) => c.name === `Level crossing · ${site.name}`));
  let front = site.z - 500;
  for (let i = 0; i < 1200; i++) {
    front += 20 / 60;
    crossings.update(1 / 60, {
      trainFront: front,
      trainRear: front - TRAIN,
      speed: 20,
      direction: 1,
      cameraPosition: railPoint(site.z),
      dusk: true,
      weather: 'rain',
    });
  }
  const state = crossings.getState();
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  const first = state.crossings[0];
  assert.equal(first.phase, 'closed');
  assert.equal(first.lampsOn, true);
  assert.equal(first.barrierAngle, 90);
  assert.equal(first.bell, true);
  assert.equal(state.nearestBell.id, site.id);
  assert.equal(state.totals.active, 1);
  assert.ok(first.queuedCars >= 1);
  assert.equal(crossings.group.visible, true);
  // Paused: nothing moves.
  const before = JSON.stringify(crossings.getState());
  crossings.update(0.5, {
    trainFront: front + 30,
    trainRear: front + 30 - TRAIN,
    speed: 20,
    cameraPosition: railPoint(site.z),
    paused: true,
  });
  assert.equal(JSON.stringify(crossings.getState()), before);
  // Far away from every crossing, the whole group is hidden.
  crossings.update(1 / 60, {
    trainFront: 10000,
    trainRear: 9932,
    cameraPosition: railPoint(10000),
  });
  assert.equal(crossings.group.visible, false);
  crossings.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(crossings.getState().disposed, true);
});

// Minimal Web Audio stand-in that records oscillator start times.
function fakeAudio() {
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    setTargetAtTime(v) {
      this.value = v;
    },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    connect(target) {
      return target;
    },
    disconnect() {},
  });
  const context = {
    currentTime: 0,
    destination: node(),
    starts: [],
    createGain: () => ({ ...node(), gain: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createBiquadFilter: () => ({ ...node(), frequency: param(), type: '' }),
    createOscillator: () => ({
      ...node(),
      frequency: param(),
      type: '',
      start(time) {
        context.starts.push(time);
      },
      stop() {},
    }),
  };
  return context;
}

test('crossing bell strikes at a steady rate, fades with distance and falls silent', () => {
  assert.equal(bellLevel(450), 0);
  assert.ok(bellLevel(20) > bellLevel(150) && bellLevel(150) > bellLevel(350));
  assert.equal(bellLevel(20, 0), 0);
  const context = fakeAudio();
  const bell = createCrossingBell(context);
  for (let i = 0; i < 100; i++) {
    context.currentTime = i * 0.04;
    bell.update({ ringing: true, distance: 40, pan: 0.4 });
  }
  const strikes = [...new Set(context.starts)].sort((a, b) => a - b);
  const partials = CROSSING_BELL.partials.length;
  assert.equal(context.starts.length, strikes.length * partials, 'no duplicate strikes');
  for (let i = 1; i < strikes.length; i++)
    assert.ok(Math.abs(strikes[i] - strikes[i - 1] - 1 / CROSSING_BELL.rate) < 1e-9);
  assert.ok(Math.abs(strikes.length - 4 * CROSSING_BELL.rate) <= 2);
  const count = context.starts.length;
  context.currentTime = 5;
  bell.update({ ringing: true, distance: 900 });
  context.currentTime = 5.5;
  bell.update({ ringing: false, distance: 40 });
  assert.equal(context.starts.length, count);
  assert.equal(bell.state().ringing, false);
  bell.dispose();
});
