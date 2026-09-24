/**
 * When the adaptive resolution may step. Every change resizes the canvas and the film
 * targets, which shows as a visible pop, so steps are rare and never reverse quickly:
 *
 * - it looks at the 75th-percentile frame of the last 90 frames once a second;
 * - it steps down 0.1 only after `slowChecks` slow checks in a row, and up 0.1 only after
 *   `healthySeconds` of healthy checks;
 * - between the two thresholds nothing changes (a dead band), and any two steps are at
 *   least `dwellSeconds` apart;
 * - a step down within `bounceSeconds` of a step up means the higher level cannot hold, so
 *   the level is capped for `lockSeconds`;
 * - a decided step waits for `canApply()` (a camera cut) for up to `deferSeconds`.
 */
export const RESOLUTION_POLICY = Object.freeze({
  floor: 0.7,
  step: 0.1,
  slowMs: 24,
  healthyMs: 18,
  slowChecks: 3,
  healthySeconds: 20,
  dwellSeconds: 8,
  bounceSeconds: 30,
  lockSeconds: 120,
  deferSeconds: 3,
});

/**
 * The adaptive scale as a small state machine, separate from the renderer so the timing
 * can be tested. check() runs once a second with the recent p75 frame time and returns
 * the scale to move to, or null. pending/commit let the caller hold a step for a cut.
 */
export function createResolutionGovernor(policy = RESOLUTION_POLICY) {
  const p = { ...RESOLUTION_POLICY, ...policy };
  let scale = 1,
    slow = 0,
    healthy = 0,
    lastChange = -Infinity,
    lastUp = -Infinity,
    ceiling = 1,
    ceilingUntil = -Infinity,
    pending = null,
    pendingSince = 0,
    changes = 0;
  const round = (value) => Math.round(value * 100) / 100;
  return {
    get scale() {
      return scale;
    },
    /** One check: `now` in seconds, `p75` the recent 75th-percentile frame in ms. */
    check(now, p75) {
      if (now >= ceilingUntil) ceiling = 1;
      if (p75 > p.slowMs) {
        slow++;
        healthy = 0;
      } else if (p75 < p.healthyMs) {
        healthy++;
        slow = 0;
      } else {
        // Dead band: neither slow nor healthy; hold and forget partial streaks.
        slow = 0;
        healthy = 0;
      }
      if (pending !== null || now - lastChange < p.dwellSeconds) return null;
      if (slow >= p.slowChecks && scale > p.floor) {
        if (now - lastUp < p.bounceSeconds) {
          ceiling = round(scale - p.step);
          ceilingUntil = now + p.lockSeconds;
        }
        pending = round(Math.max(p.floor, scale - p.step));
      } else if (healthy >= p.healthySeconds && scale < ceiling) {
        pending = round(Math.min(ceiling, scale + p.step));
      }
      if (pending !== null) pendingSince = now;
      return pending;
    },
    /**
     * Apply the pending step when allowed or when it has waited long enough. `allowed` may
     * be a function, called only while a step is pending.
     */
    commit(now, allowed = true) {
      if (pending === null) return null;
      const ok = typeof allowed === 'function' ? allowed() : allowed;
      if (!ok && now - pendingSince < p.deferSeconds) return null;
      if (pending > scale) lastUp = now;
      scale = pending;
      pending = null;
      lastChange = now;
      slow = 0;
      healthy = 0;
      changes++;
      return scale;
    },
    getState: () => ({ scale, pending, ceiling, changes }),
  };
}

/**
 * Frame timing and a bounded physical-pixel budget for high-DPI displays.
 * adaptive: false keeps the pixel ratio fixed (video renders must not drop
 * resolution because a captured frame took long to draw). canApply() says whether a
 * resolution step may show now, for example on a camera cut.
 */
export function createFrameBudget({
  renderer,
  devicePixelRatio = 1,
  pixelBudget = 2000000,
  maxPixelRatio = 1.5,
  adaptive = true,
  canApply = () => true,
  policy,
}) {
  let width = 1,
    height = 1,
    elapsed = 0,
    lastCheck = 0;
  const governor = createResolutionGovernor(policy);
  const frames = [],
    cpu = [],
    listeners = new Set();
  let latestDraw = { calls: 0, triangles: 0 };
  const percentile = (values, p) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  };
  function ratio() {
    return (
      Math.min(devicePixelRatio, maxPixelRatio, Math.sqrt(pixelBudget / (width * height))) *
      governor.scale
    );
  }
  function apply() {
    const value = ratio();
    if (Math.abs(renderer.getPixelRatio() - value) > 0.00001) {
      renderer.setPixelRatio(value);
      return true;
    }
    return false;
  }
  return {
    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      return apply();
    },
    record({ intervalMs, cpuMs, calls = 0, triangles = 0, active = true }) {
      if (!active || !Number.isFinite(intervalMs) || intervalMs <= 0) return false;
      for (const listener of listeners) listener({ intervalMs, cpuMs, calls, triangles });
      frames.push(intervalMs);
      cpu.push(cpuMs);
      if (frames.length > 240) {
        frames.shift();
        cpu.shift();
      }
      latestDraw = { calls, triangles };
      elapsed += intervalMs / 1000;
      if (!adaptive || frames.length < 90) return false;
      if (elapsed - lastCheck >= 1) {
        lastCheck = elapsed;
        governor.check(elapsed, percentile(frames.slice(-90), 0.75));
      }
      return governor.commit(elapsed, canApply) === null ? false : apply();
    },
    async measure(durationSeconds = 3, { signal } = {}) {
      if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 10)
        throw new TypeError('Measure for 1–10 seconds.');
      if (signal?.aborted) throw new Error('Measurement cancelled.');
      if (listeners.size >= 2) throw new Error('A maximum of two measurements may run together.');
      const samples = [];
      const collect = (value) => samples.push(value);
      listeners.add(collect);
      try {
        await new Promise((resolve, reject) => {
          const cancel = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
            reject(new Error('Measurement cancelled.'));
          };
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', cancel);
            resolve();
          }, durationSeconds * 1000);
          signal?.addEventListener('abort', cancel, { once: true });
        });
      } finally {
        listeners.delete(collect);
      }
      const average = (key) =>
        samples.length ? samples.reduce((sum, item) => sum + item[key], 0) / samples.length : 0;
      return {
        durationSeconds,
        samples: samples.length,
        averageFps: samples.length ? 1000 / average('intervalMs') : null,
        frameMs: {
          median: percentile(
            samples.map((s) => s.intervalMs),
            0.5,
          ),
          p95: percentile(
            samples.map((s) => s.intervalMs),
            0.95,
          ),
          max: samples.length ? Math.max(...samples.map((s) => s.intervalMs)) : null,
        },
        cpuMs: {
          median: percentile(
            samples.map((s) => s.cpuMs),
            0.5,
          ),
          p95: percentile(
            samples.map((s) => s.cpuMs),
            0.95,
          ),
        },
        framesOverBudget: samples.filter((s) => s.intervalMs > 20).length,
        averageDrawCalls: average('calls'),
        averageTriangles: average('triangles'),
        rendering: this.getState(),
        note: 'Observed animation-frame and CPU timing in this browser. Draw totals include water and shadow passes; CPU timing is not GPU timing. Hidden-tab samples are excluded.',
      };
    },
    getState() {
      const median = percentile(frames, 0.5);
      return {
        targetFps: 60,
        samples: frames.length,
        medianFps: median ? Math.round(1000 / median) : null,
        frameMs: { median, p95: percentile(frames, 0.95) },
        cpuMs: { median: percentile(cpu, 0.5), p95: percentile(cpu, 0.95) },
        physicalPixels: Math.round(width * height * ratio() ** 2),
        pixelRatio: ratio(),
        adaptiveScale: governor.scale,
        adaptive,
        resolutionSteps: governor.getState(),
        pixelBudget,
        draw: latestDraw,
        shadowHz: median ? Math.round(1000 / median) : null,
        reflectionHz: 20,
      };
    },
  };
}
