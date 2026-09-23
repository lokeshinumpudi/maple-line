import { experimental_evaluate } from 'ai';
import { DirectorError, MODEL } from './director.js';

// These whitelists mirror apps/game/src/simulation/npc-minds.js; a test checks they match.
export const MOODS = [
  'content',
  'cheerful',
  'wistful',
  'anxious',
  'impatient',
  'curious',
  'tired',
  'irritated',
  'shy',
];
export const INTENTS = [
  'continue',
  'linger',
  'chat',
  'hurry',
  'shelter',
  'watch-train',
  'wave',
  'sit',
  'check-phone',
  'stretch',
];
export const MIND_ROLES = [
  'commuter',
  'student',
  'shopper',
  'resident',
  'visitor',
  'worker',
  'shopkeeper',
  'gardener',
  'elder',
  'reader',
  'vendor',
  'neighbour',
  'traveller',
];
export const MIND_REGIONS = [
  'gorge',
  'terraces',
  'village',
  'shrine',
  'bridge',
  'station',
  'city',
  'farmland',
  'wetland',
  'lakeside',
  'cedar',
  'forest',
  'mountain',
  'snow',
  'alpine-lake',
  'birch',
  'autumn',
  'harbour',
];
export const TRAIN_PHASES = ['away', 'approaching', 'stopped', 'departing'];
export const MAX_MIND_ENTITIES = 6;
const ID_PATTERN = /^[a-z0-9-]{1,24}$/;
const NEEDS = ['rest', 'social', 'urgency', 'comfort'];

/** @typedef {{weather:'clear'|'rain'|'snow', dusk:boolean, region:string, trainPhase:string, crowd:number}} MindContext */
/** @typedef {{rest:number, social:number, urgency:number, comfort:number}} MindNeeds */
/** @typedef {{id:string, role:string, mood:string, intent:string, valence:number, arousal:number, needs:MindNeeds}} MindEntity */
/** @typedef {{context:MindContext, entities:MindEntity[]}} MindsInput */
/** @typedef {{id:string, mood:string, intent:string}} MindChoice */
/** @typedef {{source:'jev'|'fallback', reason:string, entities:MindChoice[]}} MindsResult */
/** @typedef {(input:Parameters<typeof experimental_evaluate>[0])=>Promise<unknown>} Evaluator */

/** @param {unknown} value @returns {value is Record<string,unknown>} */
const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {Record<string,unknown>} value @param {string[]} fields */
const exactFields = (value, fields) =>
  Object.keys(value).length === fields.length &&
  Object.keys(value).every((key) => fields.includes(key));
/** @param {unknown} value @param {number} min @param {number} max */
const bounded = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
/** @param {unknown} value @param {string[]} list @returns {value is string} */
const oneOf = (value, list) => typeof value === 'string' && list.includes(value);
/** @param {number} value */
const round = (value) => Math.round(value * 100) / 100;

/** @param {unknown} input @returns {MindsInput} */
export function validateMindsInput(input) {
  if (!record(input) || !exactFields(input, ['context', 'entities']))
    throw new DirectorError(400, 'Only context and entities are accepted.');
  const { context, entities } = input;
  if (
    !record(context) ||
    !exactFields(context, ['weather', 'dusk', 'region', 'trainPhase', 'crowd'])
  )
    throw new DirectorError(
      400,
      'context accepts only weather, dusk, region, trainPhase, and crowd.',
    );
  if (!oneOf(context.weather, ['clear', 'rain', 'snow']))
    throw new DirectorError(400, 'Unsupported weather.');
  if (typeof context.dusk !== 'boolean') throw new DirectorError(400, 'dusk must be boolean.');
  if (!oneOf(context.region, MIND_REGIONS)) throw new DirectorError(400, 'Unsupported region.');
  if (!oneOf(context.trainPhase, TRAIN_PHASES))
    throw new DirectorError(400, 'Unsupported trainPhase.');
  if (!Number.isInteger(context.crowd) || !bounded(context.crowd, 0, 20))
    throw new DirectorError(400, 'crowd must be an integer from 0 to 20.');
  if (!Array.isArray(entities) || entities.length < 1 || entities.length > MAX_MIND_ENTITIES)
    throw new DirectorError(400, `Send 1 to ${MAX_MIND_ENTITIES} entities.`);
  const seen = new Set();
  const clean = entities.map((entity) => {
    if (
      !record(entity) ||
      !exactFields(entity, ['id', 'role', 'mood', 'intent', 'valence', 'arousal', 'needs'])
    )
      throw new DirectorError(
        400,
        'Each entity accepts only id, role, mood, intent, valence, arousal, and needs.',
      );
    if (typeof entity.id !== 'string' || !ID_PATTERN.test(entity.id) || seen.has(entity.id))
      throw new DirectorError(400, 'Entity ids must be unique, 1-24 characters of a-z, 0-9, or -.');
    seen.add(entity.id);
    if (!oneOf(entity.role, MIND_ROLES)) throw new DirectorError(400, 'Unsupported role.');
    if (!oneOf(entity.mood, MOODS)) throw new DirectorError(400, 'Unsupported mood.');
    if (!oneOf(entity.intent, INTENTS)) throw new DirectorError(400, 'Unsupported intent.');
    if (!bounded(entity.valence, -1, 1))
      throw new DirectorError(400, 'valence must be between -1 and 1.');
    if (!bounded(entity.arousal, 0, 1))
      throw new DirectorError(400, 'arousal must be between 0 and 1.');
    const needs = entity.needs;
    if (!record(needs) || !exactFields(needs, NEEDS))
      throw new DirectorError(400, 'needs accepts only rest, social, urgency, and comfort.');
    for (const key of NEEDS)
      if (!bounded(needs[key], 0, 1)) throw new DirectorError(400, `needs.${key} must be 0 to 1.`);
    return {
      id: entity.id,
      role: entity.role,
      mood: entity.mood,
      intent: entity.intent,
      valence: round(/** @type {number} */ (entity.valence)),
      arousal: round(/** @type {number} */ (entity.arousal)),
      needs: {
        rest: round(/** @type {number} */ (needs.rest)),
        social: round(/** @type {number} */ (needs.social)),
        urgency: round(/** @type {number} */ (needs.urgency)),
        comfort: round(/** @type {number} */ (needs.comfort)),
      },
    };
  });
  return /** @type {MindsInput} */ ({
    context: {
      weather: context.weather,
      dusk: context.dusk,
      region: context.region,
      trainPhase: context.trainPhase,
      crowd: context.crowd,
    },
    entities: clean,
  });
}

/** Deterministic rules keep the contract shape when Jev is not used. @param {MindsInput} input @param {string} reason @returns {MindsResult} */
export function mindsFallback(input, reason) {
  const { weather, trainPhase, crowd } = input.context;
  return {
    source: 'fallback',
    reason,
    entities: input.entities.map((entity) => ({
      id: entity.id,
      mood: entity.mood,
      intent:
        weather !== 'clear' && entity.needs.comfort < 0.5
          ? 'shelter'
          : entity.needs.urgency > 0.7
            ? 'hurry'
            : trainPhase === 'approaching' || trainPhase === 'stopped'
              ? 'watch-train'
              : entity.needs.rest < 0.25
                ? 'sit'
                : entity.needs.social < 0.3 && crowd > 1
                  ? 'chat'
                  : entity.intent,
    })),
  };
}

const MOOD_CRITERIA = {
  content: 'Calm and settled; nothing pressing',
  cheerful: 'Warm and upbeat, often after company or good news',
  wistful: 'Quietly reflective, typical at dusk or after a long day',
  anxious: 'Worried, often from rain, cold, or uncertainty about the train',
  impatient: 'Restless from waiting or running late',
  curious: 'Interested in the train, the scenery, or other people',
  tired: 'Low energy and ready to rest',
  irritated: 'Annoyed, usually by discomfort, delay, or a sudden noise',
  shy: 'Reserved and avoiding attention, often in a crowd',
};
const INTENT_CRITERIA = {
  continue: 'Keep doing the current routine',
  linger: 'Pause briefly and look around',
  chat: 'Turn to the nearest neighbour and talk',
  hurry: 'Walk faster toward the current goal',
  shelter: 'Move under cover or stay under cover',
  'watch-train': 'Stop and watch the train',
  wave: 'Wave at the train or a neighbour',
  sit: 'Rest; slump or sit briefly',
  'check-phone': 'Look down at a phone',
  stretch: 'Stretch after standing or walking',
};

/** @param {MindEntity} entity */
function moodQuestion(entity) {
  return /** @type {import('ai').Experimental_EvaluationQuestion} */ ({
    type: 'choice',
    instructions: {
      task: 'Choose the next mood for one background character in a fictional Japanese countryside railway game.',
      character: entity.id,
      guidance:
        'Use this character’s needs, valence, arousal, role, current mood, and the shared context. Rain with low comfort suggests anxious or irritated; dusk suggests wistful; high social need met suggests cheerful; low rest suggests tired; a crowd can make reserved people shy. Prefer small, believable changes and variety between characters.',
    },
    criteria: MOOD_CRITERIA,
  });
}
/** @param {MindEntity} entity */
function intentQuestion(entity) {
  return /** @type {import('ai').Experimental_EvaluationQuestion} */ ({
    type: 'choice',
    instructions: {
      task: 'Choose the next visible background behaviour for one character in a fictional Japanese countryside railway game.',
      character: entity.id,
      guidance:
        'Choose what this character does next given their needs, mood, role, and the shared context. Low comfort in rain or snow suggests shelter; high urgency suggests hurry; an approaching or stopped train draws curious people to watch; low rest suggests sit. These are visual behaviours only: they never open doors, stop the train, or prevent boarding.',
    },
    criteria: INTENT_CRITERIA,
  });
}

/** @param {unknown} result @param {MindsInput} input @returns {MindChoice[]} */
function extractChoices(result, input) {
  if (!record(result) || !record(result.answers)) throw new Error('Invalid evaluation response.');
  const answers = result.answers;
  return input.entities.map((entity, i) => {
    const mood = answers[`mood_${i}`];
    const intent = answers[`intent_${i}`];
    if (!record(mood) || mood.type !== 'choice' || !oneOf(mood.choice, MOODS))
      throw new Error('Invalid mood choice.');
    if (!record(intent) || intent.type !== 'choice' || !oneOf(intent.choice, INTENTS))
      throw new Error('Invalid intent choice.');
    return { id: entity.id, mood: mood.choice, intent: intent.choice };
  });
}

/**
 * Bounded mood and intent choices for up to six background characters.
 * Share the server evaluation gate: pass its `idle` lane so AI-life and world requests win.
 * @param {{evaluate?:Evaluator,hasCredentials?:()=>boolean,now?:()=>number,cooldownMs?:number,timeoutMs?:number}} [options]
 */
export function createMinds({
  evaluate = experimental_evaluate,
  hasCredentials = () => Boolean(process.env.AI_GATEWAY_API_KEY?.trim()),
  now = Date.now,
  cooldownMs = 20000,
  timeoutMs = 6000,
} = {}) {
  let inflight = false;
  let lastStarted = -Infinity;
  return {
    status() {
      return {
        inflight,
        cooldownMs,
        retryAfterMs: Math.max(0, cooldownMs - (now() - lastStarted)),
      };
    },
    /** @param {unknown} raw @returns {Promise<MindsResult>} */
    async choose(raw) {
      const input = validateMindsInput(raw);
      if (!hasCredentials())
        return mindsFallback(input, 'Local minds: AI Gateway credentials are not configured.');
      if (inflight)
        return mindsFallback(input, 'Local minds: a minds evaluation is already running.');
      if (now() - lastStarted < cooldownMs)
        return mindsFallback(input, 'Local minds: Jev is cooling down between minds evaluations.');
      const previousStart = lastStarted;
      inflight = true;
      lastStarted = now();
      const controller = new AbortController();
      let timedOut = false;
      /** @type {ReturnType<typeof setTimeout>|undefined} */
      let timer;
      /** @type {Record<string, import('ai').Experimental_EvaluationQuestion>} */
      const questions = {};
      input.entities.forEach((entity, i) => {
        questions[`mood_${i}`] = moodQuestion(entity);
        questions[`intent_${i}`] = intentQuestion(entity);
      });
      const pending = Promise.resolve().then(() =>
        evaluate({
          model: MODEL,
          state: { context: { ...input.context }, entities: input.entities },
          questions,
          maxRetries: 0,
          abortSignal: controller.signal,
        }),
      );
      // Keep the minds slot until the provider settles, as the decision route does.
      void pending.then(
        () => {
          inflight = false;
        },
        () => {
          inflight = false;
        },
      );
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error('Evaluation deadline.'));
        }, timeoutMs);
      });
      try {
        const result = await Promise.race([pending, deadline]);
        return {
          source: 'jev',
          reason: 'Jev selected bounded moods and intents for these background characters.',
          entities: extractChoices(result, input),
        };
      } catch (error) {
        const busy = error instanceof Error && error.message === 'Evaluation busy';
        const preempted = error instanceof Error && error.name === 'AbortError' && !timedOut;
        // A refused slot never reached the provider, so it does not start a cooldown.
        if (busy) lastStarted = previousStart;
        return mindsFallback(
          input,
          timedOut
            ? 'Local minds: Jev exceeded its response deadline.'
            : busy || preempted
              ? 'Local minds: an AI-life or world evaluation has priority.'
              : 'Local minds: Jev was unavailable or returned an unsupported choice.',
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
