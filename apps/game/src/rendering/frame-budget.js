/**
 * Frame timing and a bounded physical-pixel budget for high-DPI displays.
 * adaptive: false keeps the pixel ratio fixed (video renders must not drop
 * resolution because a captured frame took long to draw).
 */
export function createFrameBudget({
  renderer,
  devicePixelRatio = 1,
  pixelBudget = 2000000,
  maxPixelRatio = 1.5,
  adaptive = true,
}) {
  let width = 1,
    height = 1,
    quality = 1,
    elapsed = 0,
    healthySeconds = 0,
    lastAdjustment = 0;
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
      Math.min(devicePixelRatio, maxPixelRatio, Math.sqrt(pixelBudget / (width * height))) * quality
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
      if (!adaptive || frames.length < 90 || elapsed - lastAdjustment < 2) return false;
      const recent = percentile(frames.slice(-90), 0.75);
      if (recent > 24 && quality > 0.7) {
        quality = Math.max(0.7, quality - 0.1);
        healthySeconds = 0;
        lastAdjustment = elapsed;
        return apply();
      }
      healthySeconds = recent < 18 ? healthySeconds + 2 : 0;
      lastAdjustment = elapsed;
      if (healthySeconds >= 12 && quality < 1) {
        quality = Math.min(1, quality + 0.05);
        healthySeconds = 0;
        return apply();
      }
      return false;
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
        adaptiveScale: quality,
        adaptive,
        pixelBudget,
        draw: latestDraw,
        shadowHz: median ? Math.round(1000 / median) : null,
        reflectionHz: 20,
      };
    },
  };
}
