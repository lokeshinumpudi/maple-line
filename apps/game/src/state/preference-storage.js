export const PREFERENCE_STORAGE_KEY = 'maple-line:preferences:v1';
const VERSION = 1;
const MAX_CHARS = 16384;
const ENUMS = {
  view: ['scenic', 'follow', 'cab', 'passenger', 'vista', 'orbit'],
  weather: ['clear', 'rain', 'snow'],
  trainLights: ['auto', 'on', 'off'],
  trainWipers: ['auto', 'on', 'off'],
  narrationLanguage: [
    'en-IN',
    'te-IN',
    'hi-IN',
    'ta-IN',
    'bn-IN',
    'mr-IN',
    'gu-IN',
    'kn-IN',
    'ml-IN',
    'pa-IN',
    'od-IN',
  ],
};
const BOOLEANS = ['dusk', 'hudVisible', 'manualControls', 'powerFlow'];
const KEYS = [...Object.keys(ENUMS), ...BOOLEANS, 'soundVolume'];
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const valid = (key, value) =>
  key === 'soundVolume'
    ? Number.isFinite(value) && value >= 0 && value <= 1
    : Object.hasOwn(ENUMS, key)
      ? ENUMS[key].includes(value)
      : BOOLEANS.includes(key) && typeof value === 'boolean';
function pick(preferences) {
  const result = {};
  for (const key of KEYS) {
    if (Object.hasOwn(preferences, key) && valid(key, preferences[key]))
      result[key] = key === 'view' && preferences[key] === 'orbit' ? 'scenic' : preferences[key];
  }
  return result;
}

/**
 * Persist presentation/control preferences only, with writes on actual changes.
 * Sound and narrationEnabled are intentionally excluded: audio requires a live
 * user gesture. Drive, mode, story saves, director and world edits are separate.
 */
export function attachPreferenceStorage({ gameStore, storage, key = PREFERENCE_STORAGE_KEY } = {}) {
  if (!gameStore?.getState || !gameStore?.setPreferences || !gameStore?.subscribe)
    throw new TypeError('Preference storage requires a game store.');
  if (typeof key !== 'string' || !key.length)
    throw new TypeError('Preference storage requires a key.');
  let backend = storage;
  let status = 'empty';
  let readStatus = 'empty';
  let lastError = null;
  let restoredKeys = [];
  let ignoredKeys = [];
  let writeCount = 0;
  let disposed = false;
  try {
    if (backend === undefined) backend = globalThis.localStorage;
    if (!backend || typeof backend.getItem !== 'function' || typeof backend.setItem !== 'function')
      throw new Error('unavailable');
    const raw = backend.getItem(key);
    if (raw !== null) {
      if (typeof raw !== 'string' || raw.length > MAX_CHARS) {
        status = readStatus = 'corrupt';
        lastError = 'invalid-size';
      } else {
        let saved;
        try {
          saved = JSON.parse(raw);
        } catch {
          lastError = 'invalid-json';
        }
        if (!isRecord(saved) || saved.version !== VERSION || !isRecord(saved.preferences)) {
          status = readStatus = 'corrupt';
          lastError ??= 'invalid-format';
        } else {
          const preferences = pick(saved.preferences);
          restoredKeys = Object.keys(preferences);
          ignoredKeys = Object.keys(saved.preferences).filter(
            (name) => !Object.hasOwn(preferences, name),
          );
          if (restoredKeys.length) gameStore.setPreferences(preferences);
          status = readStatus = ignoredKeys.length ? 'recovered' : 'restored';
        }
      }
    }
  } catch {
    status = readStatus = 'unavailable';
    lastError = 'storage-read-denied';
  }
  let previous = JSON.stringify(pick(gameStore.getState().preferences));
  // The selector avoids serialization on the simulation's per-frame drive updates.
  const unsubscribe = gameStore.subscribe(
    (state) => state.preferences,
    (preferences) => {
      if (disposed || !backend) return;
      const selected = JSON.stringify(pick(preferences));
      if (selected === previous) return;
      try {
        backend.setItem(
          key,
          JSON.stringify({ version: VERSION, preferences: JSON.parse(selected) }),
        );
        previous = selected;
        writeCount++;
        status = 'saved';
        lastError = null;
      } catch {
        status = 'unavailable';
        lastError = 'storage-write-denied';
      }
    },
  );
  return {
    getState() {
      return {
        status,
        readStatus,
        lastError,
        restoredKeys: [...restoredKeys],
        ignoredKeys: [...ignoredKeys],
        writeCount,
        key,
        audioExcluded: true,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      status = 'disposed';
    },
  };
}
