import { experimental_evaluate } from 'ai';
import {
  WORLD_EVALUATION_QUESTIONS as questions,
  seedFromPrompt,
  validateWorldSpec,
} from '@maple-line/world-spec';
import { DirectorError, MODEL } from './director.js';

/** @param {unknown} value */
export function validateWorldRequest(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !('prompt' in value) ||
    typeof value.prompt !== 'string'
  )
    throw new DirectorError(400, 'Send one world description.');
  const prompt = value.prompt.trim();
  if (prompt.length < 3 || prompt.length > 600)
    throw new DirectorError(400, 'Describe your world in 3–600 characters.');
  return prompt;
}

/** @typedef {(input:Parameters<typeof experimental_evaluate>[0])=>Promise<unknown>} Evaluator */
/** @param {{evaluate?:Evaluator, hasCredentials?:()=>boolean, now?:()=>number, timeoutMs?:number, cooldownMs?:number}} [options] */
export function createWorldPlanner({
  evaluate = experimental_evaluate,
  hasCredentials = () => Boolean(process.env.AI_GATEWAY_API_KEY?.trim()),
  now = Date.now,
  timeoutMs = 8000,
  cooldownMs = 5000,
} = {}) {
  let inflight = false;
  let lastStarted = -Infinity;
  return {
    status() {
      return { inflight, retryAfterMs: Math.max(0, cooldownMs - (now() - lastStarted)) };
    },
    /** @param {unknown} body */
    async plan(body) {
      const prompt = validateWorldRequest(body);
      if (!hasCredentials())
        throw new DirectorError(
          503,
          'World creation needs a Jev connection. Your current world is unchanged.',
        );
      if (inflight || now() - lastStarted < cooldownMs)
        throw new DirectorError(
          429,
          'A world request is still running or cooling down. Try again shortly.',
        );
      inflight = true;
      lastStarted = now();
      const controller = new AbortController();
      const pending = Promise.resolve().then(() =>
        evaluate({
          model: MODEL,
          state: { description: prompt },
          questions,
          abortSignal: controller.signal,
          maxRetries: 0,
        }),
      );
      void pending.then(
        () => {
          inflight = false;
        },
        () => {
          inflight = false;
        },
      );
      /** @type {ReturnType<typeof setTimeout>|undefined} */
      let timer;
      try {
        const result = await Promise.race([
          pending,
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error('deadline'));
            }, timeoutMs);
          }),
        ]);
        const answers = /** @type {{answers:Record<string, {type?:string,choice?:unknown}>}} */ (
          result
        ).answers;
        /** @type {Record<string, unknown>} */
        const values = {};
        for (const key of Object.keys(questions)) {
          const answer = answers[key];
          if (!answer || answer.type !== 'choice') throw new Error('Invalid answer');
          values[key] = answer.choice;
        }
        const coverage = values.coverage;
        if (!['supported', 'partial', 'unsupported'].includes(/** @type {string} */ (coverage)))
          throw new Error('Invalid coverage');
        delete values.coverage;
        const plan = validateWorldSpec({ ...values, seed: seedFromPrompt(prompt) });
        return { source: 'jev', coverage, plan };
      } catch {
        throw new DirectorError(
          503,
          'Jev could not finish this world. Your current world is unchanged. Please try again.',
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
