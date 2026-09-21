const PACES = new Set(['relaxed', 'cruise', 'cautious']);
const ACTIVITIES = new Set(['commute', 'shelter', 'stroll']);

export function regionAt(z) {
  if (z < -430) return 'gorge';
  if (z < -290) return 'terraces';
  if (z < -50) return 'village';
  if (z < 145) return 'shrine';
  if (z < 415) return 'bridge';
  if (z < 610) return 'station';
  return 'city';
}

export function directorCruiseSpeed(pace) {
  return { relaxed: 90, cruise: 120, cautious: 60 }[pace] ?? 120;
}

/** Network decisions run on a slow clock; animation never awaits this client. */
export function createDirectorClient({
  getContext,
  onDecision,
  onStatus,
  fetcher = globalThis.fetch,
  now = Date.now,
  intervalMs = 20000,
  offline = false,
}) {
  let enabled = true;
  let disposed = false;
  let pending = null;
  let nextRequest = 0;
  let generation = 0;
  const signature = (state) => `${state.weather}:${state.region}`;
  const status = (value) => onStatus?.(value);

  async function tick() {
    if (disposed || !enabled || pending || now() < nextRequest) return;
    const context = getContext();
    if (!context || context.paused) return;
    if (offline) {
      nextRequest = now() + intervalMs;
      status('offline');
      return;
    }
    const epoch = generation;
    const controller = new AbortController();
    pending = controller;
    nextRequest = now() + intervalMs;
    status('thinking');
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetcher('/api/director/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Director unavailable');
      const result = await response.json();
      if (
        !['jev', 'fallback'].includes(result.source) ||
        !PACES.has(result.decision?.pace) ||
        !ACTIVITIES.has(result.decision?.stationActivity)
      )
        throw new Error('Invalid director decision');
      const current = getContext();
      if (disposed || !enabled || epoch !== generation) return;
      if (!current || current.paused || signature(current) !== signature(context)) {
        status('idle');
        return;
      }
      onDecision({
        source: result.source,
        pace: result.decision.pace,
        stationActivity: result.decision.stationActivity,
        decidedAt: now(),
      });
      status(result.source);
    } catch {
      if (!disposed && enabled && epoch === generation) status('offline');
    } finally {
      clearTimeout(timeout);
      if (pending === controller) pending = null;
    }
  }
  return {
    tick,
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
