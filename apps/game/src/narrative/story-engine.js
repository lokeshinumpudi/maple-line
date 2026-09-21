import { createStore } from 'zustand/vanilla';
import { validateStationDutySave } from '../simulation/station-duties.js';

const SAVE_VERSION = 1;
const MAX_SAVE_BYTES = 65536;
export const STORY_ARRIVAL_RADIUS = 18;
export const STORY_ARRIVAL_SPEED = 1;
const clone = (value) => structuredClone(value);

function campaignSignature(campaign) {
  return JSON.stringify(
    campaign.beats.map((beat) => [
      beat.id,
      beat.chapterId,
      beat.z,
      (beat.choices ?? []).map((choice) => choice.id),
    ]),
  );
}

function validateCampaign(campaign) {
  if (
    !campaign?.id ||
    !campaign.title ||
    !campaign.chapters?.length ||
    !campaign.beats?.length ||
    campaign.beats.length > 256
  ) {
    throw new TypeError('A campaign needs a title, chapters, and 1–256 beats.');
  }
  const chapters = new Set(campaign.chapters.map((chapter) => chapter.id));
  const ids = new Set();
  const earlierChoices = new Map();
  const taskIds = new Set();
  let previousZ = -Infinity;
  for (const beat of campaign.beats) {
    if (
      !beat.id ||
      ids.has(beat.id) ||
      !chapters.has(beat.chapterId) ||
      !Number.isFinite(beat.z) ||
      beat.z < previousZ ||
      !Array.isArray(beat.lines) ||
      !beat.lines.every((line) => typeof line === 'string')
    ) {
      throw new TypeError('Campaign beats need unique IDs, ordered positions, and dialogue.');
    }
    ids.add(beat.id);
    previousZ = beat.z;
    if (
      beat.delivery !== undefined &&
      !['platform', 'stopped', 'rolling'].includes(beat.delivery)
    ) {
      throw new TypeError('Scene delivery must be platform, stopped, or rolling.');
    }
    if (beat.callbacks !== undefined && !Array.isArray(beat.callbacks)) {
      throw new TypeError('Scene callbacks must be an array.');
    }
    for (const callback of beat.callbacks ?? []) {
      if (
        !earlierChoices.get(callback?.beatId)?.has(callback.choiceId) ||
        !Array.isArray(callback.lines) ||
        !callback.lines.every((line) => typeof line === 'string')
      ) {
        throw new TypeError(
          'Scene callbacks must reference a choice from an earlier beat and supply lines.',
        );
      }
    }
    if (beat.task) {
      if (
        typeof beat.task.id !== 'string' ||
        !beat.task.id ||
        taskIds.has(beat.task.id) ||
        typeof beat.task.title !== 'string' ||
        typeof beat.task.actionLabel !== 'string' ||
        typeof beat.task.required !== 'boolean'
      ) {
        throw new TypeError(
          'Scene tasks need unique IDs, titles, action labels, and a required flag.',
        );
      }
      taskIds.add(beat.task.id);
    }
    const choices = new Set();
    for (const choice of beat.choices ?? []) {
      if (
        !choice.id ||
        choices.has(choice.id) ||
        !Array.isArray(choice.response) ||
        !choice.response.every((line) => typeof line === 'string')
      ) {
        throw new TypeError('Each choice needs a unique ID and a response.');
      }
      choices.add(choice.id);
    }
    earlierChoices.set(beat.id, choices);
  }
}

/** Narrative state is separate from the train. The host pauses driving for stopped conversations only. */
export function createStoryEngine({
  campaign: source,
  storage,
  saveKey = 'maple-line:story:v1',
  encounters = {},
  wildlifeBroadcast = null,
}) {
  validateCampaign(source);
  const campaign = clone(source);
  const signature = campaignSignature(campaign);
  let disposed = false;
  let enabled = false;
  let completed = 0;
  let active = false;
  let selectedChoice = null;
  let choices = {};
  let fieldNotes = {};
  let taskFacts = {};
  let deliveryPlan = { inspected: false, proposal: null };
  let stationDuty = null;
  let nearbyWildlife = null;
  let lastKnownRouteZ = campaign.beats[0].z;
  let lastSavedZ = lastKnownRouteZ;
  let hasSave = false;
  let saveError = null;
  let storageAdapter = storage;
  if (storageAdapter === undefined) {
    try {
      storageAdapter = globalThis.localStorage;
    } catch {
      storageAdapter = null;
    }
  }

  function memories() {
    const collection = new Map();
    for (const beat of campaign.beats.slice(0, completed)) {
      const choice = beat.choices?.find((item) => item.id === choices[beat.id]);
      const origin = {
        beatId: beat.id,
        title: beat.title,
        choiceLabel: choice?.label ?? null,
        completedTask:
          beat.task && taskFacts[beat.task.id]
            ? {
                ...clone(beat.task),
                completed: true,
                ...(beat.task.kind === 'delivery-plan' ? { delivery: clone(deliveryPlan) } : {}),
              }
            : null,
      };
      if (beat.memory)
        collection.set(beat.memory.id, { ...clone(beat.memory), origin: clone(origin) });
      if (choice?.memory)
        collection.set(choice.memory.id, { ...clone(choice.memory), origin: clone(origin) });
    }
    for (const beat of campaign.beats.slice(0, completed + (active ? 1 : 0))) {
      const note = fieldNotes[beat.id];
      const encounter = encounters[beat.id];
      if (note && encounter)
        collection.set(`wildlife-${beat.id}`, {
          id: `wildlife-${beat.id}`,
          title: encounter.title,
          text: `${encounter.species[note.season][1]} · ${note.season}. ${encounter.note} ${note.action === 'record' ? 'Emi kept a recording.' : 'We watched quietly.'}`,
          origin: { beatId: beat.id, title: beat.title, kind: 'field-note' },
        });
    }
    return [...collection.values()];
  }

  function snapshot() {
    const beat = campaign.beats[completed] ?? null;
    const response = beat?.choices?.find((choice) => choice.id === selectedChoice);
    const complete = completed === campaign.beats.length;
    const activeBeat =
      enabled && active && beat
        ? {
            ...clone(beat),
            phase: response ? 'response' : 'dialogue',
            displayLines: clone(
              response
                ? response.response
                : [
                    ...beat.lines,
                    ...(beat.callbacks ?? [])
                      .filter((callback) => choices[callback.beatId] === callback.choiceId)
                      .flatMap((callback) => callback.lines),
                  ],
            ),
            selectedChoice,
            ...(beat.task
              ? {
                  task: {
                    ...clone(beat.task),
                    completed: Boolean(taskFacts[beat.task.id]),
                    ...(beat.task.kind === 'delivery-plan'
                      ? { delivery: clone(deliveryPlan) }
                      : {}),
                  },
                }
              : {}),
          }
        : null;
    if (
      activeBeat &&
      response &&
      beat.id === wildlifeBroadcast?.beatId &&
      Object.values(fieldNotes).some((note) => note.action === 'record')
    ) {
      activeBeat.displayLines.push(wildlifeBroadcast.line);
    }
    const encounter = activeBeat && encounters[beat.id];
    const observation = encounter && fieldNotes[beat.id];
    const nearby = nearbyWildlife?.beatId === beat?.id ? nearbyWildlife : null;
    const encounterSeason = observation?.season ?? nearby?.season;
    const wildlifeEncounter =
      encounter && encounterSeason
        ? {
            beatId: beat.id,
            title: encounter.title,
            invitation: encounter.invitation,
            season: encounterSeason,
            species: encounter.species[encounterSeason][0],
            speciesName: encounter.species[encounterSeason][1],
            available: Boolean(nearby),
            actions: clone(encounter.actions),
            selectedAction: observation?.action ?? null,
            response: observation ? encounter[observation.action] : null,
          }
        : null;
    return {
      campaignId: campaign.id,
      title: campaign.title,
      enabled,
      status: !enabled ? 'dormant' : complete ? 'complete' : active ? 'dialogue' : 'travelling',
      activeBeat,
      nextBeat: clone(beat),
      nextStopBeat: clone(
        campaign.beats.slice(completed).find((item) => item.delivery !== 'rolling') ?? null,
      ),
      chapter: clone(
        campaign.chapters.find(
          (chapter) => chapter.id === (beat ?? campaign.beats.at(-1)).chapterId,
        ),
      ),
      progress: {
        completed,
        total: campaign.beats.length,
        fraction: completed / campaign.beats.length,
        completedChapterIds: campaign.chapters
          .filter((chapter) => {
            const chapterBeats = campaign.beats.filter((item) => item.chapterId === chapter.id);
            return (
              chapterBeats.length > 0 &&
              chapterBeats.every((item) => campaign.beats.indexOf(item) < completed)
            );
          })
          .map((chapter) => chapter.id),
      },
      seenIds: campaign.beats.slice(0, completed).map((item) => item.id),
      choices: { ...choices },
      fieldNotes: clone(fieldNotes),
      completedTasks: Object.keys(taskFacts),
      stationDuty: clone(stationDuty),
      deliveryPlan: clone(deliveryPlan),
      wildlifeEncounter,
      memories: memories(),
      lastKnownRouteZ,
      canContinue: Boolean(
        activeBeat &&
        (!beat.choices?.length || response) &&
        (!beat.task?.required || taskFacts[beat.task.id]),
      ),
      hasSave,
      saveError,
    };
  }

  function exportSave() {
    return {
      version: SAVE_VERSION,
      campaignId: campaign.id,
      signature,
      completed,
      active,
      selectedChoice,
      choices: { ...choices },
      fieldNotes: clone(fieldNotes),
      taskFacts: { ...taskFacts },
      stationDuty: clone(stationDuty),
      deliveryPlan: clone(deliveryPlan),
      lastKnownRouteZ,
    };
  }

  function persist() {
    if (!storageAdapter) return;
    try {
      storageAdapter.setItem(saveKey, JSON.stringify(exportSave()));
      hasSave = true;
      saveError = null;
      lastSavedZ = lastKnownRouteZ;
    } catch {
      saveError = 'Progress could not be saved on this device.';
    }
  }

  function parseSave(value) {
    let text;
    try {
      text = typeof value === 'string' ? value : JSON.stringify(value);
    } catch {
      return null;
    }
    if (!text || text.length > MAX_SAVE_BYTES) return null;
    let save;
    try {
      save = JSON.parse(text);
    } catch {
      return null;
    }
    if (
      !save ||
      save.version !== SAVE_VERSION ||
      save.campaignId !== campaign.id ||
      save.signature !== signature ||
      !Number.isInteger(save.completed) ||
      save.completed < 0 ||
      save.completed > campaign.beats.length ||
      typeof save.active !== 'boolean' ||
      !Number.isFinite(save.lastKnownRouteZ) ||
      Math.abs(save.lastKnownRouteZ) > 1000000 ||
      !save.choices ||
      typeof save.choices !== 'object' ||
      Array.isArray(save.choices)
    )
      return null;
    const completedBeats = campaign.beats.slice(0, save.completed);
    if (Object.keys(save.choices).some((id) => !completedBeats.some((beat) => beat.id === id)))
      return null;
    for (const beat of completedBeats) {
      if (
        beat.choices?.length &&
        !beat.choices.some((choice) => choice.id === save.choices[beat.id])
      )
        return null;
      if (!beat.choices?.length && Object.hasOwn(save.choices, beat.id)) return null;
    }
    const beat = campaign.beats[save.completed];
    if (save.active && !beat) return null;
    if (
      save.selectedChoice !== null &&
      (!save.active || !beat?.choices?.some((choice) => choice.id === save.selectedChoice))
    )
      return null;
    const notes = save.fieldNotes ?? {};
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return null;
    const visited = new Set(
      campaign.beats.slice(0, save.completed + (save.active ? 1 : 0)).map((item) => item.id),
    );
    for (const [id, note] of Object.entries(notes)) {
      const encounter = encounters[id];
      if (
        !visited.has(id) ||
        !encounter ||
        !note ||
        !Object.hasOwn(encounter.species, note.season) ||
        !encounter.actions.some((action) => action.id === note.action) ||
        Object.keys(note).some((key) => !['season', 'action'].includes(key))
      )
        return null;
    }
    const savedTasks = save.taskFacts ?? {};
    if (!savedTasks || typeof savedTasks !== 'object' || Array.isArray(savedTasks)) return null;
    const availableTasks = new Set(
      campaign.beats
        .slice(0, save.completed + (save.active ? 1 : 0))
        .map((item) => item.task?.id)
        .filter(Boolean),
    );
    if (Object.entries(savedTasks).some(([id, value]) => !availableTasks.has(id) || value !== true))
      return null;
    const savedDelivery = Object.hasOwn(save, 'deliveryPlan')
      ? save.deliveryPlan
      : { inspected: false, proposal: null };
    if (
      !savedDelivery ||
      typeof savedDelivery !== 'object' ||
      Array.isArray(savedDelivery) ||
      Object.keys(savedDelivery).some((key) => !['inspected', 'proposal'].includes(key)) ||
      typeof savedDelivery.inspected !== 'boolean' ||
      ![null, 'later-clinic', 'shared-van'].includes(savedDelivery.proposal) ||
      (savedDelivery.proposal !== null && !savedDelivery.inspected) ||
      ((savedDelivery.inspected || savedDelivery.proposal) && !visited.has('momiji-bread')) ||
      (savedDelivery.inspected &&
        save.active &&
        beat?.id === 'momiji-bread' &&
        beat.choices?.length &&
        save.selectedChoice === null) ||
      Boolean(savedTasks['plan-clinic-delivery']) !== Boolean(savedDelivery.proposal)
    )
      return null;
    const savedDuty = save.stationDuty == null ? null : validateStationDutySave(save.stationDuty);
    if (save.stationDuty != null && !savedDuty) return null;
    const dutyBeatIndex = campaign.beats.findIndex((item) => item.id === 'momiji-bread');
    if (
      savedDuty &&
      savedDuty.phase !== 'inactive' &&
      (dutyBeatIndex < 0 || save.completed <= dutyBeatIndex)
    )
      return null;
    if (
      savedDuty &&
      !['inactive', 'complete'].includes(savedDuty.phase) &&
      save.completed > dutyBeatIndex + 1
    )
      return null;
    return {
      ...save,
      fieldNotes: notes,
      taskFacts: savedTasks,
      stationDuty: savedDuty,
      deliveryPlan: savedDelivery,
    };
  }

  function applySave(save) {
    completed = save.completed;
    active = save.active;
    selectedChoice = save.selectedChoice;
    choices = { ...save.choices };
    fieldNotes = clone(save.fieldNotes);
    taskFacts = { ...save.taskFacts };
    stationDuty = clone(save.stationDuty);
    deliveryPlan = clone(save.deliveryPlan);
    nearbyWildlife = null;
    lastKnownRouteZ = save.lastKnownRouteZ;
    lastSavedZ = lastKnownRouteZ;
    hasSave = true;
    saveError = null;
  }

  try {
    const saved = storageAdapter?.getItem(saveKey);
    if (saved) {
      const parsed = parseSave(saved);
      if (parsed) applySave(parsed);
      else saveError = 'The saved story was incompatible or damaged. A new story is available.';
    }
  } catch {
    saveError = 'Saved progress is unavailable on this device.';
  }

  const store = createStore(() => snapshot());
  const publish = (save = false) => {
    if (save) persist();
    store.setState(snapshot(), true);
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    start() {
      if (disposed) return false;
      enabled = true;
      if (completed === 0) active = true;
      publish(true);
      return true;
    },
    suspend() {
      if (disposed) return false;
      enabled = false;
      nearbyWildlife = null;
      publish(true);
      return true;
    },
    reset() {
      if (disposed) return false;
      completed = 0;
      active = false;
      enabled = false;
      selectedChoice = null;
      choices = {};
      fieldNotes = {};
      taskFacts = {};
      stationDuty = null;
      deliveryPlan = { inspected: false, proposal: null };
      nearbyWildlife = null;
      lastKnownRouteZ = campaign.beats[0].z;
      hasSave = false;
      saveError = null;
      try {
        storageAdapter?.removeItem(saveKey);
      } catch {
        saveError = 'Saved progress could not be removed.';
      }
      publish();
      return true;
    },
    update({ z, speed, paused, started }) {
      if (
        disposed ||
        !enabled ||
        paused ||
        !started ||
        completed >= campaign.beats.length ||
        !Number.isFinite(z)
      )
        return false;
      const beat = campaign.beats[completed];
      if (active && beat.delivery !== 'rolling') return false;
      const arrived =
        !active &&
        Math.abs(z - beat.z) <= STORY_ARRIVAL_RADIUS &&
        Number.isFinite(speed) &&
        speed >= 0 &&
        (beat.delivery === 'rolling' || speed <= STORY_ARRIVAL_SPEED);
      const moved = Math.abs(z - lastKnownRouteZ) >= 5;
      if (arrived || moved) lastKnownRouteZ = z;
      if (arrived) {
        active = true;
        publish(true);
      } else if (moved) publish(Math.abs(z - lastSavedZ) >= 100);
      return arrived;
    },
    recordStationDuty(value) {
      if (disposed) return false;
      const next = validateStationDutySave(value);
      const dutyBeatIndex = campaign.beats.findIndex((item) => item.id === 'momiji-bread');
      if (!next || (next.phase !== 'inactive' && (dutyBeatIndex < 0 || completed <= dutyBeatIndex)))
        return false;
      if (JSON.stringify(stationDuty) === JSON.stringify(next)) return true;
      stationDuty = next;
      publish(true);
      return true;
    },
    recordDeliveryAction(action) {
      if (disposed || !enabled || !active) return false;
      const beat = campaign.beats[completed];
      if (
        beat.id !== 'momiji-bread' ||
        beat.task?.id !== 'plan-clinic-delivery' ||
        taskFacts[beat.task.id] ||
        (beat.choices?.length && selectedChoice === null)
      )
        return false;
      if (action === 'inspect') {
        if (deliveryPlan.inspected) return true;
        deliveryPlan = { inspected: true, proposal: null };
      } else if (['later-clinic', 'shared-van'].includes(action) && deliveryPlan.inspected) {
        deliveryPlan = { inspected: true, proposal: action };
        taskFacts = { ...taskFacts, [beat.task.id]: true };
      } else return false;
      publish(true);
      return true;
    },
    recordTask(id) {
      if (disposed || !enabled || !active) return false;
      const beat = campaign.beats[completed];
      if (
        !beat.task ||
        beat.task.kind === 'delivery-plan' ||
        beat.task.id !== id ||
        taskFacts[id] ||
        (beat.choices?.length && selectedChoice === null)
      )
        return false;
      taskFacts = { ...taskFacts, [id]: true };
      publish(true);
      return true;
    },
    setNearbyWildlife(value) {
      if (disposed) return false;
      const beat = enabled && active ? campaign.beats[completed] : null;
      const encounter = beat && encounters[beat.id];
      const next =
        value?.beatId === beat?.id && encounter && Object.hasOwn(encounter.species, value.season)
          ? { beatId: beat.id, season: value.season }
          : null;
      if (JSON.stringify(next) === JSON.stringify(nearbyWildlife)) return false;
      nearbyWildlife = next;
      publish();
      return true;
    },
    observeWildlife(actionId) {
      if (disposed || !enabled || !active) return false;
      const beat = campaign.beats[completed];
      const encounter = encounters[beat.id];
      if (
        !encounter ||
        nearbyWildlife?.beatId !== beat.id ||
        fieldNotes[beat.id] ||
        !encounter.actions.some((action) => action.id === actionId)
      )
        return false;
      fieldNotes = {
        ...fieldNotes,
        [beat.id]: { season: nearbyWildlife.season, action: actionId },
      };
      publish(true);
      return true;
    },
    choose(choiceId) {
      if (disposed || !enabled || !active || selectedChoice !== null) return false;
      const beat = campaign.beats[completed];
      if (!beat.choices?.some((choice) => choice.id === choiceId)) return false;
      selectedChoice = choiceId;
      publish(true);
      return true;
    },
    advance() {
      if (disposed || !enabled || !active) return false;
      const beat = campaign.beats[completed];
      if (beat.choices?.length && selectedChoice === null) return false;
      if (beat.task?.required && !taskFacts[beat.task.id]) return false;
      if (selectedChoice !== null) choices = { ...choices, [beat.id]: selectedChoice };
      completed++;
      nearbyWildlife = null;
      active = false;
      selectedChoice = null;
      publish(true);
      return true;
    },
    nextDestination() {
      const beat = campaign.beats[completed];
      return beat ? { id: beat.id, title: beat.title, z: beat.z } : null;
    },
    journal: () => memories(),
    exportSave: () => clone(exportSave()),
    importSave(value) {
      if (disposed) return { ok: false, error: 'The story engine has been disposed.' };
      const parsed = parseSave(value);
      if (!parsed) return { ok: false, error: 'Invalid or incompatible story save.' };
      applySave(parsed);
      publish(true);
      return { ok: true };
    },
    dispose() {
      if (disposed) return;
      if (hasSave || enabled) persist();
      disposed = true;
    },
  };
}
