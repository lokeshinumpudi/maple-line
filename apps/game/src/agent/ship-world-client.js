/** The browser agent channel invokes a Function; its database record is the result. */
export async function fetchShipWorld(_url, options, sdk = globalThis.signal) {
  if (!sdk?.agent || !sdk?.db) throw new Error('Signal connection is unavailable.');
  options.signal?.throwIfAborted();
  const { prompt } = JSON.parse(options.body);
  const requestId = crypto.randomUUID();
  const session = await sdk.agent('world-builder').send(JSON.stringify({ requestId, prompt }));
  options.signal?.throwIfAborted();
  if (session.status !== 'done') throw new Error('World generation did not complete.');
  const record = await sdk.db('generations').get(requestId);
  const result = record?.data ?? record;
  if (!result || result.source !== 'signal' || result.prompt !== prompt)
    throw new Error('The generated world was not saved.');
  return { ok: true, status: 200, json: async () => result };
}
