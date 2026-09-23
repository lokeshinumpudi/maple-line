import { INTENTS, MIND_REGIONS, MOODS, MAX_JEV_BATCH } from '../simulation/npc-minds.js';
import { regionAt } from './ai-director.js';

/** Region label for the minds contract: a nearby regional stop theme, else the original valley region. */
export function mindRegion(z, stops = []) {
  let nearest = null;
  let distance = 300;
  for (const stop of stops) {
    const d = Math.abs(stop.z - z);
    if (d < distance) {
      nearest = stop;
      distance = d;
    }
  }
  const theme = nearest?.theme;
  return MIND_REGIONS.includes(theme) ? theme : regionAt(z);
}

/**
 * Slow-clock Jev requests for NPC minds. Local minds keep running without it.
 * Same discipline as the AI-life client: one inflight request, a deadline,
 * stale-response rejection, and no awaiting in the render loop.
 */
export function createMindsClient({
  minds,
  getContext,
  onStatus,
  fetcher = globalThis.fetch,
  now = Date.now,
  intervalMs = 25000,
  emptyRetryMs = 5000,
  timeoutMs = 10000,
  offline = false,
}) {
  let enabled = true;
  let disposed = false;
  let pending = null;
  let nextRequest = 0;
  let generation = 0;
  let last = { status: 'idle', accepted: 0, rejected: 0, at: 0 };
  const status = (value, extra = {}) => {
    last = { ...last, ...extra, status: value, at: now() };
    onStatus?.(value, last);
  };

  function valid(result, batch) {
    if (!result || !['jev', 'fallback'].includes(result.source)) return false;
    if (!Array.isArray(result.entities) || result.entities.length > MAX_JEV_BATCH) return false;
    return result.entities.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        batch.ids.includes(item.id) &&
        MOODS.includes(item.mood) &&
        INTENTS.includes(item.intent),
    );
  }

  async function tick() {
    if (disposed || !enabled || pending || now() < nextRequest) return;
    const context = getContext();
    if (!context || context.paused) return;
    if (offline) {
      nextRequest = now() + intervalMs;
      status('offline');
      return;
    }
    const batch = minds.buildJevBatch({ camera: context.camera });
    if (!batch) {
      nextRequest = now() + emptyRetryMs;
      return;
    }
    const epoch = generation;
    const controller = new AbortController();
    pending = controller;
    nextRequest = now() + intervalMs;
    status('thinking');
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher('/api/director/minds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: batch.context, entities: batch.entities }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Minds unavailable');
      const result = await response.json();
      if (!valid(result, batch)) throw new Error('Invalid minds response');
      if (disposed || !enabled || epoch !== generation) return;
      const current = getContext();
      if (!current || current.paused) {
        status('idle');
        return;
      }
      // Server fallback choices are not applied: local minds already cover that case.
      if (result.source !== 'jev') {
        status('fallback', { accepted: 0, rejected: 0 });
        return;
      }
      const outcome = minds.applyJev(batch, result.entities);
      status(outcome.stale ? 'stale' : 'jev', {
        accepted: outcome.accepted.length,
        rejected: outcome.rejected.length,
      });
    } catch {
      if (!disposed && enabled && epoch === generation) status('offline');
    } finally {
      clearTimeout(timeout);
      if (pending === controller) pending = null;
    }
  }
  return {
    tick,
    getStatus: () => ({ ...last, enabled, offline, inflight: Boolean(pending) }),
    setEnabled(value) {
      enabled = Boolean(value);
      generation++;
      pending?.abort();
      nextRequest = 0;
      status(enabled ? 'idle' : 'off');
    },
    dispose() {
      disposed = true;
      generation++;
      pending?.abort();
    },
  };
}
