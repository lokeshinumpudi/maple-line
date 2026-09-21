import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { campaign } from '../src/narrative/story-data.js';
import { wildlifeEncounters, wildlifeBroadcast } from '../src/narrative/wildlife-encounters.js';
import { createStoryEngine } from '../src/narrative/story-engine.js';
import { createStoryWildlife } from '../src/world/story-wildlife.js';
import { addWildlife } from '../src/world/wildlife.js';
import { WILDLIFE_MODELS } from '../src/world/wildlife-models.js';
import { riverProfile } from '../src/world/river-profile.js';
import { registerStoryTools } from '../src/narrative/story-tools.js';
const options = { campaign, encounters: wildlifeEncounters, wildlifeBroadcast, storage: null };
const engine = () => createStoryEngine(options);
const intro = campaign.beats[0];
const nearby = { beatId: intro.id, season: 'autumn' };
const cast = (beat = intro) => ({
  visible: true,
  beatId: beat.id,
  stageType: beat.z > 0 ? 'platform' : 'trackside',
  feet: [{ position: [6.55, 0.6, beat.z - 0.8] }, { position: [6.55, 0.6, beat.z + 0.8] }],
});
const stage = (extra = {}) =>
  createStoryWildlife({
    encounters: wildlifeEncounters,
    railPoint: (z) => ({ x: 0, y: 0, z }),
    terrainHeight: () => 0,
    ...extra,
  });

test('optional observations require a visible encounter, save once and never advance dialogue', () => {
  const story = engine();
  assert.equal(story.observeWildlife('record'), false);
  story.start();
  assert.equal(story.observeWildlife('record'), false);
  story.setNearbyWildlife({ ...nearby, beatId: 'wrong-stop' });
  assert.equal(story.getState().wildlifeEncounter, null);
  story.setNearbyWildlife(nearby);
  assert.equal(story.observeWildlife('feed'), false);
  assert.equal(story.observeWildlife('record'), true);
  assert.equal(story.observeWildlife('wait'), false);
  assert.equal(story.getState().progress.completed, 0);
  assert.equal(story.getState().canContinue, false);
  assert.equal(story.journal().length, 1);
  assert.match(story.journal()[0].text, /Japanese squirrel/);
  story.setNearbyWildlife(null);
  assert.equal(story.getState().wildlifeEncounter.available, false);
  assert.equal(story.getState().wildlifeEncounter.selectedAction, 'record');
  story.suspend();
  assert.equal(story.getState().wildlifeEncounter, null);
  assert.equal(story.observeWildlife('record'), false);
  story.reset();
  assert.deepEqual(story.getState().fieldNotes, {});
});

test('old saves load, observations survive reload and invalid or future notes are rejected', () => {
  const story = engine();
  story.start();
  const legacy = story.exportSave();
  delete legacy.fieldNotes;
  assert.equal(story.importSave(legacy).ok, true);
  story.setNearbyWildlife(nearby);
  story.observeWildlife('wait');
  const saved = story.exportSave(),
    restored = engine();
  assert.equal(restored.importSave(saved).ok, true);
  restored.start();
  assert.equal(restored.getState().wildlifeEncounter.selectedAction, 'wait');
  assert.equal(restored.getState().wildlifeEncounter.available, false);
  assert.deepEqual(restored.journal(), story.journal());
  for (const notes of [
    { 'akane-notebook': { season: 'autumn', action: 'record' } },
    { [intro.id]: { season: 'monsoon', action: 'wait' } },
    { [intro.id]: { season: 'winter', action: 'feed' } },
  ]) {
    assert.equal(restored.importSave({ ...saved, fieldNotes: notes }).ok, false);
  }
  restored.dispose();
  assert.equal(restored.setNearbyWildlife(nearby), false);
});

test('a recording returns in the radio programme while skipped encounters leave the story unchanged', () => {
  for (const action of [null, 'wait', 'record']) {
    const story = engine();
    story.start();
    if (action) {
      story.setNearbyWildlife(nearby);
      story.observeWildlife(action);
    }
    for (const beat of campaign.beats) {
      if (!story.getState().activeBeat)
        story.update({ z: beat.z, speed: 0, paused: false, started: true });
      if (beat.choices?.length) story.choose(beat.choices[0].id);
      if (beat.id === wildlifeBroadcast.beatId) {
        const lines = story.getState().activeBeat.displayLines;
        assert.equal(lines.includes(wildlifeBroadcast.line), action === 'record');
      }
      if (beat.task?.kind === 'delivery-plan') {
        assert.equal(story.recordDeliveryAction('inspect'), true);
        assert.equal(story.recordDeliveryAction('later-clinic'), true);
      } else if (beat.task?.required) assert.equal(story.recordTask(beat.task.id), true);
      assert.equal(story.advance(), true);
    }
    assert.equal(story.getState().status, 'complete');
  }
});

test('every authored seasonal encounter has a model and repeatable safe placement after revisiting', () => {
  for (const [id, encounter] of Object.entries(wildlifeEncounters)) {
    const beat = campaign.beats.find((b) => b.id === id);
    for (const [season, [species]] of Object.entries(encounter.species))
      for (const seed of [0, 1, 2147483647, -4]) {
        assert.ok(WILDLIFE_MODELS[species]);
        const runtime = stage();
        const input = {
          storyState: { enabled: true, status: 'dialogue', activeBeat: beat },
          castState: cast(beat),
          season,
          seed,
        };
        const first = runtime.update(input);
        assert.equal(first.visible, true);
        assert.equal(first.species, species);
        assert.ok(first.pose.x > 4.8);
        if (cast(beat).stageType === 'platform') {
          assert.ok(first.pose.x - 0.6 > 8.6, 'roaming footprint must clear the platform edge');
          assert.ok(
            first.pose.z - 0.6 > beat.z - 1.1,
            'visitor must be ahead of the station building',
          );
        }
        assert.equal(first.pose.y, 0);
        runtime.update({});
        assert.deepEqual(runtime.update(input), first);
      }
  }
});

test('unsafe terrain and moving trains hide animals; weather shelters without changing recorded notes', () => {
  const story = engine();
  story.start();
  const input = { storyState: story.getState(), castState: cast() };
  for (const overrides of [
    { terrainHeight: () => NaN },
    { terrainHeight: (x) => x * 3 },
    { habitatAllowed: () => false },
  ]) {
    assert.equal(stage(overrides).update(input).reason, 'no-safe-habitat');
  }
  const runtime = stage();
  assert.equal(runtime.update({ ...input, trainSpeed: 1 }).visible, false);
  assert.equal(
    runtime.update({ ...input, castState: { ...cast(), visible: false } }).visible,
    false,
  );
  assert.equal(runtime.update({ ...input, weather: 'rain' }).reason, 'sheltering');
  assert.equal(runtime.update(input).behaviour, 'watching');
  story.setNearbyWildlife(nearby);
  story.observeWildlife('wait');
  input.storyState = story.getState();
  for (let i = 0; i < 40; i++) runtime.update({ ...input, dt: 0.1 });
  assert.notEqual(runtime.getState().behaviour, 'watching');
  const still = runtime.getState();
  runtime.update(input);
  assert.deepEqual(runtime.getState(), still);
  runtime.update({ ...input, weather: 'snow' });
  assert.equal(story.journal().length, 1);
  assert.throws(() => runtime.update({ ...input, dt: NaN }));
});

test('story animals share existing buffers, render beyond the valley and vanish on exit', () => {
  const scene = new THREE.Scene();
  const world = addWildlife({ THREE, scene, center: () => 0, terrain: () => 4, riverProfile });
  const buffers = scene.children[0].children.map((mesh) => mesh.instanceMatrix);
  const runtime = stage();
  const story = engine();
  story.start();
  const encounter = runtime.update({ storyState: story.getState(), castState: cast() });
  world.update(0, { encounter });
  assert.equal(world.getState().storyAnimal.species, 'japanese-squirrel');
  world.update(0, { encounter, cameraPosition: { z: 8000 } });
  assert.equal(scene.children[0].visible, true);
  const stats = world.getState().rendering;
  assert.ok(stats.activeBatches <= 5);
  assert.deepEqual(
    scene.children[0].children.map((mesh) => mesh.instanceMatrix),
    buffers,
  );
  for (const mesh of scene.children[0].children) assert.ok(mesh.count <= mesh.instanceMatrix.count);
  world.update(0, { cameraPosition: { z: 8000 } });
  assert.equal(world.getState().storyAnimal, null);
  assert.equal(scene.children[0].visible, false);
  world.dispose();
  assert.equal(scene.children.length, 0);
});

test('story tools validate observation against the current visible animal', async () => {
  const story = engine(),
    tools = new Map();
  story.start();
  registerStoryTools({
    engine: story,
    tool: (name, _description, _schema, _readOnly, execute) => tools.set(name, execute),
  });
  const act = tools.get('story_action');
  await assert.rejects(act({ action: 'observe', choiceId: 'record' }), /unavailable/);
  story.setNearbyWildlife(nearby);
  const result = await act({ action: 'observe', choiceId: 'record' });
  assert.equal(result.story.wildlifeEncounter.selectedAction, 'record');
  await assert.rejects(act({ action: 'observe', choiceId: 'wait' }), /already recorded/);
});

test('winter macaques remain visible in Yukihara snow and rest instead of foraging', () => {
  const beat = campaign.beats.find((beat) => beat.id === 'yukihara-scaffolding');
  const runtime = stage();
  const input = {
    storyState: {
      enabled: true,
      status: 'dialogue',
      activeBeat: beat,
      fieldNotes: { [beat.id]: { action: 'wait', season: 'winter' } },
    },
    castState: cast(beat),
    season: 'winter',
    weather: 'snow',
    dt: 0.1,
  };
  for (let frame = 0; frame < 40; frame++) runtime.update(input);
  assert.equal(runtime.getState().visible, true);
  assert.equal(runtime.getState().species, 'japanese-macaque');
  assert.equal(runtime.getState().behaviour, 'settled');
  assert.equal(runtime.update({ ...input, weather: 'rain' }).visible, false);
});
