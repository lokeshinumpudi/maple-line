import { createStore } from 'zustand/vanilla';

export const MOMIJI_DUTY_Z = 525;
export const BOARDING_SECONDS = 3;
export const PASSING_SECONDS = 12;
const STOPPED_SPEED = 0.1;
const ARRIVAL_RADIUS = 18;
const SAVE_VERSION = 1;
const MAX_SAVE_LENGTH = 2048;
const SAVE_FIELDS = [
  'version',
  'stationId',
  'phase',
  'route',
  'boardingTime',
  'passingTime',
  'completed',
];

export function validateStationDutySave(raw) {
  try {
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (!text || text.length > MAX_SAVE_LENGTH) return null;
    const save = JSON.parse(text);
    if (
      !save ||
      typeof save !== 'object' ||
      Array.isArray(save) ||
      Object.keys(save).length !== SAVE_FIELDS.length ||
      !SAVE_FIELDS.every((key) => Object.hasOwn(save, key)) ||
      save.version !== SAVE_VERSION ||
      save.stationId !== 'momiji' ||
      !Number.isFinite(save.boardingTime) ||
      !Number.isFinite(save.passingTime) ||
      save.boardingTime < 0 ||
      save.boardingTime > BOARDING_SECONDS ||
      save.passingTime < 0 ||
      save.passingTime > PASSING_SECONDS ||
      typeof save.completed !== 'boolean' ||
      save.completed !== (save.phase === 'complete')
    )
      return null;
    const boarded = save.boardingTime === BOARDING_SECONDS;
    const cleared = save.passingTime === PASSING_SECONDS;
    if (save.phase === 'inactive')
      return save.route === null && save.boardingTime === 0 && save.passingTime === 0 ? save : null;
    if (save.phase === 'routing')
      return [null, 'freight'].includes(save.route) &&
        save.boardingTime === 0 &&
        save.passingTime === 0
        ? save
        : null;
    if (save.route !== 'passenger') return null;
    if (save.phase === 'boarding') return !boarded && save.passingTime === 0 ? save : null;
    if (save.phase === 'closing')
      return boarded && (save.passingTime === 0 || cleared) ? save : null;
    if (save.phase === 'dispatch') return boarded && save.passingTime === 0 ? save : null;
    if (save.phase === 'passing') return boarded && !cleared ? save : null;
    if (save.phase === 'ready' || save.phase === 'complete')
      return boarded && cleared ? save : null;
    return null;
  } catch {
    return null;
  }
}

/** A small station duty sequence. Effects request controls; observed doors prove completion. */
export function createStationDuties() {
  let phase = 'inactive';
  let route = null;
  let message = '';
  let boardingTime = 0;
  let passingTime = 0;
  let completed = false;
  let storyEnabled = false;
  let disposed = false;
  let context = { z: NaN, speed: Infinity, doorsOpen: false, doorFraction: 0 };
  let lastPublished = '';
  const stopped = () => Number.isFinite(context.speed) && Math.abs(context.speed) <= STOPPED_SPEED;
  const atStation = () =>
    Number.isFinite(context.z) && Math.abs(context.z - MOMIJI_DUTY_Z) <= ARRIVAL_RADIUS;
  const doorsClosed = () =>
    !context.doorsOpen && Number.isFinite(context.doorFraction) && context.doorFraction <= 0.01;
  const active = () => !disposed && storyEnabled && phase !== 'inactive' && phase !== 'complete';
  function allowedActions() {
    if (!active() || !atStation()) return [];
    if (phase === 'routing') return ['route-passenger', 'route-freight'];
    if (phase === 'boarding')
      return stopped() ? [context.doorsOpen ? 'close-doors' : 'open-doors'] : [];
    if (phase === 'closing') return ['close-doors'];
    if (phase === 'dispatch') return stopped() && doorsClosed() ? ['request-clearance'] : [];
    if (phase === 'ready')
      return stopped() && doorsClosed() && context.pointsMainReady ? ['depart'] : [];
    return [];
  }
  function snapshot() {
    return {
      phase,
      active: active(),
      completed,
      route,
      boardingProgress: boardingTime / BOARDING_SECONDS,
      passingProgress: passingTime / PASSING_SECONDS,
      boardingSecondsRemaining: Math.max(0, BOARDING_SECONDS - boardingTime),
      passingSecondsRemaining: Math.max(0, PASSING_SECONDS - passingTime),
      message:
        active() && !atStation()
          ? 'Return to Momiji’s stop marker to finish the station duties.'
          : active() && phase === 'ready' && !context.pointsMainReady
            ? 'Wait for the passenger points to settle on the main line.'
            : message,
      canDepart:
        active() &&
        phase === 'ready' &&
        stopped() &&
        doorsClosed() &&
        atStation() &&
        context.pointsMainReady,
      waitingForPoints:
        active() &&
        ((phase === 'passing' && !context.pointsLoopReady) ||
          (phase === 'ready' && !context.pointsMainReady)),
      availableActions: allowedActions(),
      station: { id: 'momiji', z: MOMIJI_DUTY_Z },
    };
  }
  const store = createStore(snapshot);
  function publish(force = false) {
    const state = snapshot();
    const signature = [
      state.phase,
      state.active,
      state.completed,
      state.route,
      state.message,
      state.canDepart,
      state.availableActions.join(','),
      Math.floor(boardingTime * 4),
      Math.floor(passingTime * 4),
    ].join('|');
    if (force || signature !== lastPublished) {
      lastPublished = signature;
      store.setState(state, true);
    }
  }
  return {
    // Fresh progress is available for the passing train; UI subscriptions update at most 4 Hz.
    getState: snapshot,
    subscribe: store.subscribe,
    update({
      dt = 0,
      z,
      speed,
      doorsOpen,
      doorFraction,
      storyEnabled: enabled,
      storyBeatId,
      storyCompletedIds = [],
      paused = false,
      pointsState,
    } = {}) {
      if (disposed) return snapshot();
      if (!Number.isFinite(dt) || dt < 0)
        throw new TypeError('Station duty dt must be finite and nonnegative.');
      context = {
        z,
        speed,
        doorsOpen: Boolean(doorsOpen),
        doorFraction,
        pointsMainReady: pointsState === undefined ? true : pointsState?.mainAligned === true,
        pointsLoopReady: pointsState === undefined ? true : pointsState?.loopAligned === true,
      };
      storyEnabled = Boolean(enabled);
      const justFinishedBread =
        Array.isArray(storyCompletedIds) && storyCompletedIds.at(-1) === 'momiji-bread';
      if (
        phase === 'inactive' &&
        storyEnabled &&
        atStation() &&
        justFinishedBread &&
        (!storyBeatId || storyBeatId === 'sakuragawa-water')
      ) {
        phase = 'routing';
        message = 'Set the passenger route toward Sakuragawa before opening the doors.';
      }
      if (active() && atStation() && !paused) {
        const step = Math.min(dt, 0.25);
        if (phase === 'boarding') {
          if (
            stopped() &&
            context.doorsOpen &&
            Number.isFinite(doorFraction) &&
            doorFraction >= 0.98
          ) {
            boardingTime = Math.min(BOARDING_SECONDS, boardingTime + step);
            message = 'Passengers are boarding. Keep the train stopped and the doors open.';
            if (boardingTime >= BOARDING_SECONDS) {
              phase = 'closing';
              message = 'Everyone is aboard. Close the doors and check the line.';
            }
          } else {
            boardingTime = 0;
            message = !stopped()
              ? 'Stop at the marker before boarding passengers.'
              : 'Open the doors fully and allow everyone time to board.';
          }
        } else if (phase === 'closing' && stopped() && doorsClosed()) {
          phase = passingTime >= PASSING_SECONDS ? 'ready' : 'dispatch';
          message =
            phase === 'ready'
              ? 'The line is clear. Depart when you are ready.'
              : 'Doors are closed. Ask the stationmaster for permission to enter the single line.';
        } else if ((phase === 'dispatch' || phase === 'ready') && !doorsClosed()) {
          phase = 'closing';
          message = 'Close the doors before departing.';
        } else if (phase === 'passing' && !context.pointsLoopReady) {
          message = 'Wait for the loop points to align before admitting the other train.';
        } else if (phase === 'passing' && stopped()) {
          message = 'Hold at Momiji. Another train is passing before the single line becomes free.';
          passingTime = Math.min(PASSING_SECONDS, passingTime + step);
          if (passingTime >= PASSING_SECONDS) {
            phase = doorsClosed() ? 'ready' : 'closing';
            message =
              phase === 'ready'
                ? 'The other train has cleared the line. Your signal is green. Depart when ready.'
                : 'The line is clear. Close your doors before departing.';
          }
        }
      } else if (active() && !atStation() && phase === 'boarding') boardingTime = 0;
      publish();
      return snapshot();
    },
    act(action) {
      if (!allowedActions().includes(action)) {
        return { ok: false, message: 'That station action is not available yet.' };
      }
      let effect;
      if (action === 'route-freight') {
        route = 'freight';
        message =
          'That siding serves freight. Select the passenger line for Nao and the other villagers.';
      } else if (action === 'route-passenger') {
        route = 'passenger';
        phase = 'boarding';
        message = 'Passenger route set. Stop at the marker, then open the doors.';
      } else if (action === 'open-doors' || action === 'close-doors') {
        effect = action;
        message =
          action === 'open-doors'
            ? 'Opening the doors. Boarding begins once they are fully open.'
            : 'Closing the doors. Wait for them to shut fully.';
      } else if (action === 'request-clearance') {
        phase = 'passing';
        passingTime = 0;
        message = 'Hold at Momiji. Another train is passing before the single line becomes free.';
      } else if (action === 'depart') {
        phase = 'complete';
        completed = true;
        effect = 'depart';
        message = 'Passenger route checked, everyone aboard, line clear. On to Sakuragawa.';
      }
      publish(true);
      return { ok: true, ...(effect ? { effect } : {}), message };
    },
    exportSave() {
      return {
        version: SAVE_VERSION,
        stationId: 'momiji',
        phase,
        route,
        boardingTime,
        passingTime,
        completed,
      };
    },
    importSave(raw) {
      if (disposed) return { ok: false, error: 'Station duties have been disposed.' };
      const save = validateStationDutySave(raw);
      if (!save) return { ok: false, error: 'Invalid or incompatible station duty save.' };
      phase = ['passing', 'ready', 'dispatch'].includes(save.phase) ? 'dispatch' : save.phase;
      route = save.route;
      completed = save.completed;
      boardingTime = ['inactive', 'routing', 'boarding'].includes(phase) ? 0 : BOARDING_SECONDS;
      passingTime = completed ? PASSING_SECONDS : 0;
      // Saved progress is not evidence of the present train position, speed, or doors.
      context = { z: NaN, speed: Infinity, doorsOpen: false, doorFraction: 0 };
      storyEnabled = false;
      message = {
        inactive: '',
        routing:
          route === 'freight'
            ? 'That siding serves freight. Select the passenger line for Nao and the other villagers.'
            : 'Set the passenger route toward Sakuragawa before opening the doors.',
        boarding: 'Open the doors fully and allow everyone time to board.',
        closing: 'Everyone is aboard. Close the doors and check the line.',
        dispatch: 'Check the doors, then request fresh permission to enter the single line.',
        complete: 'Passenger route checked, everyone aboard, line clear. On to Sakuragawa.',
      }[phase];
      publish(true);
      return { ok: true, phase };
    },
    reset() {
      if (disposed) return;
      phase = 'inactive';
      route = null;
      message = '';
      boardingTime = 0;
      passingTime = 0;
      completed = false;
      publish(true);
    },
    dispose() {
      disposed = true;
      publish(true);
    },
  };
}
