import {
  WORLD_EVALUATION_QUESTIONS,
  seedFromPrompt,
  validateWorldSpec,
} from '@maple-line/world-spec';

/** Evaluate scenery choices through the authenticated Signal browser gateway. */
export async function fetchShipWorld(_url, options, sdk = globalThis.signal) {
  if (!sdk?.evaluate)
    throw new Error('Signal evaluation is unavailable. Reload after Signal updates.');
  options.signal?.throwIfAborted();
  const { prompt: raw } = JSON.parse(options.body);
  if (typeof raw !== 'string' || raw.trim().length < 3 || raw.trim().length > 600)
    throw new Error('Use 3–600 characters.');
  const prompt = raw.trim();
  const result = await evaluateWithCancellation(
    sdk,
    {
      model: 'typesafe-ai/jev',
      state: { description: prompt },
      questions: WORLD_EVALUATION_QUESTIONS,
    },
    options.signal,
  );
  options.signal?.throwIfAborted();
  const values = {};
  for (const key of Object.keys(WORLD_EVALUATION_QUESTIONS)) {
    const answer = result?.answers?.[key];
    if (answer?.type !== 'choice') throw new Error('Invalid evaluation answer.');
    values[key] = answer.choice;
  }
  const { coverage, ...settings } = values;
  if (!['supported', 'partial', 'unsupported'].includes(coverage))
    throw new Error('Invalid coverage from the model.');
  const plan = validateWorldSpec({ ...settings, seed: seedFromPrompt(prompt) });
  return {
    ok: true,
    status: 200,
    json: async () => ({ source: 'signal', coverage, plan, prompt }),
  };
}

// Current Signal SDK does not forward AbortSignal to fetch. End the local wait
// immediately; the server request may finish, but its result cannot activate.
function evaluateWithCancellation(sdk, request, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => {
        signal?.throwIfAborted();
        return sdk.evaluate(request);
      })
      .then(
        (result) => {
          cleanup();
          resolve(result);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
  });
}
