import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameStore } from '../src/state/game-store.js';
import {
  attachPreferenceStorage,
  PREFERENCE_STORAGE_KEY,
} from '../src/state/preference-storage.js';

function memoryStorage(value = null) {
  return {
    value,
    reads: 0,
    writes: 0,
    getItem(key) {
      assert.equal(key, PREFERENCE_STORAGE_KEY);
      this.reads++;
      return this.value;
    },
    setItem(key, value) {
      assert.equal(key, PREFERENCE_STORAGE_KEY);
      this.writes++;
      this.value = value;
    },
  };
}
const saved = (preferences) => JSON.stringify({ version: 1, preferences });

test('known preferences restore once without modifying drive, world, director, mode or audio', () => {
  const gameStore = createGameStore(144);
  const before = gameStore.snapshot();
  const values = {
    view: 'cab',
    weather: 'rain',
    dusk: true,
    hudVisible: false,
    manualControls: true,
    narrationLanguage: 'te-IN',
    trainLights: 'on',
    trainWipers: 'off',
    powerFlow: false,
  };
  const storage = memoryStorage(saved(values));
  const persistence = attachPreferenceStorage({ gameStore, storage });
  const after = gameStore.snapshot();
  for (const [key, value] of Object.entries(values)) assert.equal(after.preferences[key], value);
  for (const key of ['drive', 'worldBuilder', 'director'])
    assert.deepEqual(after[key], before[key]);
  for (const key of ['mode', 'sound', 'narrationEnabled'])
    assert.equal(after.preferences[key], before.preferences[key]);
  assert.equal(storage.reads, 1);
  assert.equal(storage.writes, 0);
  assert.equal(persistence.getState().status, 'restored');
  persistence.dispose();
});

test('invalid and unknown saved fields are ignored without granting arbitrary store mutations', () => {
  const gameStore = createGameStore();
  const input = JSON.parse(
    '{"weather":"snow","view":"unknown","dusk":"true","sound":false,"narrationEnabled":true,"drive":{"power":1},"mode":"challenge","__proto__":{"polluted":true}}',
  );
  const persistence = attachPreferenceStorage({ gameStore, storage: memoryStorage(saved(input)) });
  const state = gameStore.getState();
  assert.equal(state.preferences.weather, 'snow');
  assert.equal(state.preferences.view, 'director');
  assert.equal(state.preferences.dusk, false);
  assert.equal(state.preferences.sound, true);
  assert.equal(state.preferences.narrationEnabled, false);
  assert.equal(state.preferences.mode, 'explore');
  assert.equal(state.drive.power, 0);
  assert.equal({}.polluted, undefined);
  assert.equal(persistence.getState().status, 'recovered');
  assert.deepEqual(persistence.getState().restoredKeys, ['weather']);
  assert.equal(persistence.getState().ignoredKeys.length, 7);
  persistence.dispose();
});

test('corrupt or incompatible saves leave defaults and recover on the next actual preference change', () => {
  for (const raw of [
    '{',
    'null',
    '[]',
    saved([]),
    JSON.stringify({ version: 2, preferences: { weather: 'rain' } }),
    'x'.repeat(16385),
  ]) {
    const gameStore = createGameStore();
    const before = gameStore.getState().preferences;
    const storage = memoryStorage(raw);
    const persistence = attachPreferenceStorage({ gameStore, storage });
    assert.equal(persistence.getState().status, 'corrupt');
    assert.deepEqual(gameStore.getState().preferences, before);
    gameStore.setPreferences({ weather: 'rain' });
    assert.equal(persistence.getState().status, 'saved');
    assert.equal(persistence.getState().readStatus, 'corrupt');
    assert.equal(JSON.parse(storage.value).preferences.weather, 'rain');
    persistence.dispose();
  }
});

test('writes occur only when saved preferences change, never on drive frames or audio toggles', () => {
  const gameStore = createGameStore();
  const storage = memoryStorage();
  const persistence = attachPreferenceStorage({ gameStore, storage });
  for (let i = 0; i < 1000; i++)
    gameStore.updateDrive((drive) => {
      drive.elapsed += 1 / 60;
    });
  gameStore.setPreferences({ sound: true, narrationEnabled: true, mode: 'challenge' });
  gameStore.setPreferences({ weather: 'clear' });
  assert.equal(storage.writes, 0);
  gameStore.setPreferences({ weather: 'rain' });
  assert.equal(storage.writes, 1);
  const data = JSON.parse(storage.value);
  assert.equal(Object.hasOwn(data.preferences, 'sound'), false);
  assert.equal(Object.hasOwn(data.preferences, 'narrationEnabled'), false);
  assert.equal(Object.hasOwn(data.preferences, 'mode'), false);
  assert.equal(Object.hasOwn(data, 'drive'), false);
  gameStore.setPreferences({ weather: 'rain', sound: false });
  assert.equal(storage.writes, 1);
  persistence.dispose();
  persistence.dispose();
  gameStore.setPreferences({ dusk: true });
  assert.equal(storage.writes, 1);
  assert.equal(persistence.getState().status, 'disposed');
});

test('read denial, write denial, missing storage and a blocked localStorage getter never throw', () => {
  for (const storage of [
    null,
    {},
    {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    },
    {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error('quota');
      },
    },
  ]) {
    const gameStore = createGameStore();
    const persistence = attachPreferenceStorage({ gameStore, storage });
    assert.doesNotThrow(() => gameStore.setPreferences({ dusk: true }));
    assert.equal(persistence.getState().status, 'unavailable');
    assert.equal(gameStore.getState().preferences.dusk, true);
    persistence.dispose();
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('denied');
    },
  });
  try {
    const persistence = attachPreferenceStorage({ gameStore: createGameStore() });
    assert.equal(persistence.getState().status, 'unavailable');
    persistence.dispose();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('legacy orbit normalizes to scenic and inspection arrays cannot alter persistence state', () => {
  const gameStore = createGameStore();
  const persistence = attachPreferenceStorage({
    gameStore,
    storage: memoryStorage(saved({ view: 'orbit' })),
  });
  assert.equal(gameStore.getState().preferences.view, 'scenic');
  persistence.getState().restoredKeys.push('fake');
  assert.deepEqual(persistence.getState().restoredKeys, ['view']);
  persistence.dispose();
});

test('one selected subscription is installed and removed exactly once', () => {
  const gameStore = createGameStore();
  const subscribe = gameStore.subscribe.bind(gameStore);
  let subscriptions = 0;
  let removals = 0;
  gameStore.subscribe = (...args) => {
    subscriptions++;
    const stop = subscribe(...args);
    return () => {
      removals++;
      stop();
    };
  };
  const persistence = attachPreferenceStorage({ gameStore, storage: memoryStorage() });
  assert.equal(subscriptions, 1);
  persistence.dispose();
  persistence.dispose();
  assert.equal(removals, 1);
});
