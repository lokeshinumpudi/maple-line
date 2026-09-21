import { BOARDING_SECONDS, PASSING_SECONDS } from '../simulation/station-duties.js';

/** Keep railway work in the narrative checkpoint; live signals are never saved authority. */
export function connectStorySession({ engine, duties }) {
  const saved = engine.getState().stationDuty;
  if (saved) duties.importSave(saved);
  else {
    // Older stories beyond this stop predate duty saves. Do not send them back a chapter.
    const seen = engine.getState().seenIds;
    const index = seen.indexOf('momiji-bread');
    if (index >= 0 && index < seen.length - 1) {
      duties.importSave({
        version: 1,
        stationId: 'momiji',
        phase: 'complete',
        route: 'passenger',
        boardingTime: BOARDING_SECONDS,
        passingTime: PASSING_SECONDS,
        completed: true,
      });
    }
  }
  let last = null;
  function checkpoint() {
    const value = duties.exportSave();
    // A save is a recovery point, not a frame recording. Incomplete timed actions restart.
    if (value.phase === 'boarding') value.boardingTime = 0;
    if (value.phase === 'passing') value.passingTime = 0;
    const signature = JSON.stringify(value);
    if (signature === last) return;
    if (engine.recordStationDuty(value)) last = signature;
  }
  // Avoid creating a story save merely because the title screen loaded.
  if (engine.getState().hasSave) checkpoint();
  const unsubscribeDuty = duties.subscribe(checkpoint);
  return { dispose: unsubscribeDuty };
}
