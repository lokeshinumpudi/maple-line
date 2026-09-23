import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

export function initialDrive(distance = 0) {
  return {
    distance,
    speed: 0,
    power: 0,
    brake: 0,
    actualPower: 0,
    actualBrake: 0,
    acceleration: 0,
    jerk: 0,
    maxJerk: 0,
    comfortPenalty: 0,
    overspeedSeconds: 0,
    elapsed: 0,
    penalty: 0,
    started: false,
    paused: false,
    done: false,
    direction: 1,
    autopilot: false,
    emergency: false,
    doorsOpen: false,
    doorsClosing: false,
    journeyPhase: 'cruising',
    dwellRemaining: 0,
    reversals: 0,
    visitedStops: [],
    stopHoldId: null,
    stopHoldSeconds: 0,
  };
}
export function createGameStore(startDistance = 0) {
  const store = createStore(
    subscribeWithSelector(() => ({
      drive: initialDrive(startDistance),
      preferences: {
        mode: 'explore',
        view: 'scenic',
        weather: 'clear',
        dusk: false,
        sunPhase: 'daylight',
        sound: true,
        soundVolume: 0.8,
        hudVisible: true,
        manualControls: false,
        trainLights: 'auto',
        narrationLanguage: 'en-IN',
        narrationEnabled: false,
        trainWipers: 'auto',
        powerFlow: true,
        episodeVoice: true,
        filmLook: 'auto',
      },
      revision: 0,
      presentation: { menuOpen: false, sceneViewBeatId: null },
      worldBuilder: {
        status: 'idle',
        message: 'Describe the valley you want to visit.',
        active: null,
        proposal: null,
      },
      director: {
        enabled: true,
        status: 'idle',
        source: 'fallback',
        pace: 'cruise',
        stationActivity: 'commute',
        decidedAt: 0,
      },
    })),
  );
  return Object.assign(store, {
    updatePresentation(patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'menuOpen' && typeof value === 'boolean') continue;
        if (key === 'sceneViewBeatId' && (value === null || (typeof value === 'string' && value)))
          continue;
        throw new TypeError(`Invalid presentation field ${key}`);
      }
      const previous = store.getState();
      if (Object.entries(patch).every(([key, value]) => previous.presentation[key] === value))
        return;
      store.setState({
        presentation: { ...previous.presentation, ...patch },
        revision: previous.revision + 1,
      });
    },
    updateWorldBuilder(patch) {
      const previous = store.getState();
      store.setState({
        worldBuilder: { ...previous.worldBuilder, ...structuredClone(patch) },
        revision: previous.revision + 1,
      });
    },
    updateDirector(patch) {
      const previous = store.getState();
      store.setState({
        director: { ...previous.director, ...patch },
        revision: previous.revision + 1,
      });
    },
    updateDrive(recipe) {
      const previous = store.getState(),
        drive = { ...previous.drive };
      recipe(drive);
      if (drive.doorsOpen || drive.doorsClosing) {
        drive.power = 0;
        drive.actualPower = 0;
        drive.autopilot = false;
        drive.brake = 1;
      }
      store.setState({ drive, revision: previous.revision + 1 });
      return drive;
    },
    resetDrive() {
      const previous = store.getState();
      store.setState({ drive: initialDrive(startDistance), revision: previous.revision + 1 });
    },
    setPreferences(patch) {
      const allowed = {
        mode: ['explore', 'challenge'],
        view: ['scenic', 'follow', 'cab', 'passenger', 'vista', 'director', 'orbit'],
        filmLook: ['auto', 'full', 'lite', 'off'],
        weather: ['clear', 'rain', 'snow'],
        sunPhase: ['daylight', 'sunrise', 'sunset'],
        trainLights: ['auto', 'on', 'off'],
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
        trainWipers: ['auto', 'on', 'off'],
      };
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'soundVolume') {
          if (!Number.isFinite(value) || value < 0 || value > 1)
            throw new TypeError('Invalid soundVolume');
        } else if (key in allowed) {
          if (!allowed[key].includes(value)) throw new TypeError(`Invalid ${key}`);
        } else if (
          [
            'dusk',
            'sound',
            'hudVisible',
            'manualControls',
            'powerFlow',
            'episodeVoice',
            'narrationEnabled',
          ].includes(key)
        ) {
          if (typeof value !== 'boolean') throw new TypeError(`Invalid ${key}`);
        } else throw new TypeError(`Unknown preference ${key}`);
      }
      const previous = store.getState();
      store.setState({
        preferences: {
          ...previous.preferences,
          ...patch,
          ...(patch.view === 'orbit' ? { view: 'scenic' } : {}),
        },
        revision: previous.revision + 1,
      });
    },
    snapshot() {
      const value = store.getState();
      return {
        drive: { ...value.drive, visitedStops: [...value.drive.visitedStops] },
        preferences: { ...value.preferences },
        presentation: { ...value.presentation },
        director: { ...value.director },
        worldBuilder: structuredClone(value.worldBuilder),
        revision: value.revision,
      };
    },
  });
}
