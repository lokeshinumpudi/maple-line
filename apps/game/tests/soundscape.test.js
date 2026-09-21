import test from 'node:test';
import assert from 'node:assert/strict';
import { soundMix } from '../src/audio/soundscape.js';
import { electricTrainTones } from '../src/audio/sound-model.js';

test('express sound grows through the speed range, coasts without traction and shelters the cab', () => {
  const input = { enabled: true, active: true, power: 1 };
  const slow = soundMix({ ...input, speed: 60 / 3.6 });
  const fast = soundMix({ ...input, speed: 120 / 3.6 });
  const top = soundMix({ ...input, speed: 160 / 3.6 });
  assert.ok(fast.airRush > slow.airRush * 3);
  assert.ok(top.airRush > fast.airRush);
  assert.ok(top.rolling > fast.rolling && fast.rolling > slow.rolling);
  const coast = soundMix({ ...input, power: 0, speed: 120 / 3.6 });
  assert.equal(coast.traction, 0);
  assert.equal(coast.airRush, fast.airRush);
  assert.equal(soundMix({ ...input, speed: 0 }).airRush, 0);
  assert.ok(soundMix({ ...input, speed: 120 / 3.6, view: 'cab' }).airRush < fast.airRush);
  assert.ok(
    electricTrainTones(120 / 3.6, 1).inverterHz > electricTrainTones(60 / 3.6, 1).inverterHz,
  );
  assert.deepEqual(electricTrainTones(-40, 1), electricTrainTones(40, 1));
});

const riding = {
  enabled: true,
  active: true,
  speed: 12,
  power: 0.6,
  riverDistance: 20,
  peopleDistance: 15,
};
test('mute, pause and an unstarted game silence the entire mix', () => {
  assert.ok(Math.abs(soundMix(riding).master - 0.6) < 1e-9);
  assert.equal(soundMix({ ...riding, enabled: false }).master, 0);
  assert.equal(soundMix({ ...riding, active: false }).master, 0);
  assert.equal(soundMix().master, 0);
});
test('wheel and brake sounds stop at rest while traction follows power and speed', () => {
  const stopped = soundMix({ ...riding, speed: 0, power: 0, brake: 1 });
  assert.equal(stopped.rolling, 0);
  assert.equal(stopped.brake, 0);
  assert.ok(stopped.motor < soundMix(riding).motor);
  assert.ok(soundMix({ ...riding, brake: 1 }).brake > 0);
});
test('rain and snow have separate layers; snow reduces rolling noise and birds', () => {
  const clear = soundMix(riding);
  const rain = soundMix({ ...riding, weather: 'rain' });
  const snow = soundMix({ ...riding, weather: 'snow' });
  assert.equal(clear.rain, 0);
  assert.equal(clear.snow, 0);
  assert.ok(rain.rain > 0);
  assert.equal(rain.snow, 0);
  assert.equal(snow.rain, 0);
  assert.ok(snow.snow > 0);
  assert.ok(snow.rolling < clear.rolling);
  assert.ok(snow.birds < clear.birds);
});
test('tunnels exclude outside ambience and add enclosed rolling sound', () => {
  const tunnel = soundMix({ ...riding, inTunnel: true, weather: 'rain' });
  for (const layer of ['wind', 'forest', 'river', 'rain', 'snow', 'people', 'birds', 'footsteps'])
    assert.equal(tunnel[layer], 0, layer);
  assert.ok(tunnel.tunnel > 0);
  assert.ok(tunnel.motor > 0);
  assert.equal(soundMix({ ...riding, inTunnel: true, speed: 0 }).tunnel, 0);
});
test('water and people fade with distance, while the cab muffles the outdoors', () => {
  const nearby = soundMix(riding);
  const far = soundMix({ ...riding, riverDistance: 600, peopleDistance: 600 });
  const cab = soundMix({ ...riding, view: 'cab' });
  assert.ok(nearby.river > far.river * 100);
  assert.ok(nearby.people > far.people * 100);
  assert.ok(cab.river < nearby.river);
  assert.ok(cab.cutoff < nearby.cutoff);
  assert.equal(soundMix().river, 0);
  assert.equal(soundMix().people, 0);
});

test('open cab doors let nearby voices and water through; power changes traction without wheel noise at rest', () => {
  const closed = soundMix({ ...riding, view: 'cab' });
  const open = soundMix({ ...riding, view: 'cab', doorsOpen: true });
  assert.ok(open.people > closed.people * 2);
  assert.ok(open.environmentCutoff > closed.environmentCutoff);
  assert.equal(soundMix({ ...riding, speed: 0, power: 0 }).traction, 0);
  assert.ok(
    soundMix({ ...riding, power: 1 }).traction > soundMix({ ...riding, power: 0 }).traction,
  );
});

test('cab rain has roof patter, winter birds stay quiet, and bridges add body rumble', () => {
  assert.ok(soundMix({ ...riding, weather: 'rain', view: 'cab' }).roofRain > 0);
  assert.equal(soundMix({ ...riding, weather: 'rain', inTunnel: true }).roofRain, 0);
  assert.ok(soundMix({ ...riding, season: 'winter' }).birds < soundMix(riding).birds * 0.1);
  assert.ok(soundMix({ ...riding, onBridge: true }).rumble > soundMix(riding).rumble);
  assert.ok(soundMix({ ...riding, season: 'summer', dusk: true }).insects > 0);
});

test('narration ducks the background mix and mute still wins', () => {
  assert.ok(soundMix({ ...riding, narrationPlaying: true }).master < soundMix(riding).master * 0.3);
  assert.equal(soundMix({ ...riding, narrationPlaying: true, enabled: false }).master, 0);
});

test('footsteps require nearby walking characters, not just a crowd', () => {
  assert.equal(soundMix({ ...riding, peopleDistance: 1 }).footsteps, 0);
  assert.ok(soundMix({ ...riding, walkingDistance: 5 }).footsteps > 0.01);
  assert.equal(soundMix({ ...riding, walkingDistance: 5, inTunnel: true }).footsteps, 0);
});

test('summer insects follow weather, shelter and season, while forest rustle follows wind', () => {
  const summer = { ...riding, season: 'summer' };
  assert.ok(soundMix(summer).insects > 0);
  assert.ok(soundMix({ ...summer, dusk: true }).insects > soundMix(summer).insects);
  for (const change of [
    { weather: 'snow' },
    { weather: 'rain' },
    { season: 'winter' },
    { inTunnel: true },
    { forest: 0 },
  ])
    assert.equal(soundMix({ ...summer, ...change }).insects, 0);
  assert.ok(soundMix({ ...riding, wind: 10 }).forest > soundMix({ ...riding, wind: 0 }).forest * 4);
  assert.equal(soundMix({ ...riding, forest: 0 }).forest, 0);
});

test('distant trains fade below nearby nature; passenger roof rain follows shelter', () => {
  assert.ok(soundMix({ ...riding, trainDistance: 2000 }).train < 0.005);
  assert.equal(soundMix({ ...riding, trainDistance: 2000, view: 'cab' }).train, 1);
  assert.ok(soundMix({ ...riding, weather: 'rain', view: 'passenger' }).roofRain > 0);
  assert.equal(
    soundMix({ ...riding, weather: 'rain', view: 'passenger', inTunnel: true }).roofRain,
    0,
  );
});
