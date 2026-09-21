/** Coordinates narration with the train without making the narrative engine own physics. */
export function createStoryHost({
  engine,
  gameStore,
  jumpTo,
  zToDistance,
  stationDuties,
  resumePosition = (z) => z,
}) {
  let held = false;
  let cachedBeatId = null,
    cachedDistance;
  function hold() {
    held = true;
    gameStore.updateDrive((drive) => {
      drive.paused = true;
      drive.speed = 0;
      drive.power = 0;
      drive.actualPower = 0;
      drive.brake = 1;
      drive.actualBrake = 1;
      drive.acceleration = 0;
      drive.jerk = 0;
    });
  }
  function release() {
    if (!held) return;
    held = false;
    gameStore.updateDrive((drive) => {
      drive.paused = false;
      drive.power = 0;
      drive.brake = 0;
      drive.actualBrake = 0;
      drive.autopilot = !gameStore.getState().preferences.manualControls;
    });
  }
  const unsubscribe = engine.subscribe((next, previous) => {
    if (
      next.activeBeat &&
      next.activeBeat.delivery !== 'rolling' &&
      (!previous.activeBeat || !held)
    )
      hold();
    else if (next.status === 'complete' && previous.status !== 'complete') hold();
    else if (
      (!next.activeBeat || next.activeBeat.delivery === 'rolling') &&
      next.status !== 'complete'
    )
      release();
  });
  function prepare(z) {
    gameStore.setPreferences({ mode: 'explore' });
    jumpTo(Math.max(-700, Math.min(24000, z)));
    gameStore.updateDrive((drive) => {
      drive.direction = 1;
      drive.speed = 0;
      drive.actualPower = 0;
      drive.actualBrake = 0;
      drive.power = 0;
      drive.brake = 0;
      drive.paused = false;
      drive.doorsOpen = false;
      drive.emergency = false;
      drive.autopilot = !gameStore.getState().preferences.manualControls;
      drive.done = false;
    });
  }
  return {
    engine,
    start() {
      engine.reset();
      stationDuties?.reset();
      prepare(engine.nextDestination().z);
    },
    resume() {
      const state = engine.getState(),
        save = engine.exportSave();
      const duty = stationDuties?.getState();
      const pendingDuty = duty && !['inactive', 'complete'].includes(duty.phase);
      prepare(
        pendingDuty
          ? duty.station.z
          : save.active && state.nextBeat && state.nextBeat.delivery !== 'rolling'
            ? state.nextBeat.z
            : resumePosition(state.lastKnownRouteZ),
      );
    },
    travel(z) {
      const state = engine.getState(),
        destination = engine.nextDestination();
      const duty = stationDuties?.getState();
      if (duty && !['inactive', 'complete'].includes(duty.phase)) return false;
      if (state.status !== 'travelling' || !destination || z !== destination.z) return false;
      prepare(destination.z);
      engine.update({ z: destination.z, speed: 0, paused: false, started: true });
      return true;
    },
    exit() {
      release();
    },
    update({ z, speed, paused, started }) {
      const state = engine.getState();
      // External controls cannot set a paused conversation rolling.
      if (
        (state.activeBeat && state.activeBeat.delivery !== 'rolling') ||
        state.status === 'complete'
      ) {
        if (!gameStore.getState().drive.paused || gameStore.getState().drive.speed !== 0) hold();
        return;
      }
      engine.update({ z, speed, paused, started });
    },
    invalidateRoute() {
      cachedBeatId = null;
    },
    scheduledStopDistance() {
      const state = engine.getState();
      const nextStop = state.nextStopBeat;
      if (
        !state.enabled ||
        !nextStop ||
        (state.activeBeat && state.activeBeat.delivery !== 'rolling')
      )
        return undefined;
      if (cachedBeatId !== nextStop.id) {
        cachedBeatId = nextStop.id;
        cachedDistance = zToDistance(nextStop.z);
      }
      return cachedDistance;
    },
    dispose() {
      unsubscribe();
      engine.dispose();
    },
  };
}
