import { experimental_evaluate } from 'ai';

/**
 * One provider evaluation at a time, with three priorities:
 * foreground (world) > background (AI life) > idle (NPC minds).
 * Idle work is cancelled when a higher-priority request arrives. Every request
 * still waits until the provider settles, so calls never overlap.
 * @param {import('./world-planner.js').Evaluator} [evaluate]
 */
export function createEvaluationGate(evaluate = experimental_evaluate) {
  /** @typedef {Parameters<typeof experimental_evaluate>[0]} Request */
  /** @typedef {{resolve:()=>void}} Waiter */
  /** @type {{tier:'foreground'|'background'|'idle'|'reserved', preempt?:AbortController}|null} */
  let active = null;
  /** @type {{foreground:Waiter|null, background:Waiter|null}} */
  const queue = { foreground: null, background: null };

  function release() {
    active = null;
    const next = queue.foreground ?? queue.background;
    if (!next) return;
    if (next === queue.foreground) queue.foreground = null;
    else queue.background = null;
    // Hold the slot until the waiting caller starts, so idle work cannot slip in.
    active = { tier: 'reserved' };
    next.resolve();
  }
  /** @param {'foreground'|'background'|'idle'} tier @param {Request} request @param {AbortController} [preempt] */
  function start(tier, request, preempt) {
    if (request.abortSignal?.aborted) {
      if (active?.tier === 'reserved') release();
      throw new Error('Cancelled');
    }
    const pending = Promise.resolve().then(() => evaluate(request));
    active = { tier, preempt };
    void pending.then(release, release);
    return pending;
  }
  /** @param {'foreground'|'background'} tier @param {Request} request */
  function wait(tier, request) {
    return new Promise((resolve, reject) => {
      const signal = request.abortSignal;
      const abort = () => {
        if (queue[tier] === entry) queue[tier] = null;
        signal?.removeEventListener('abort', abort);
        reject(new Error('Cancelled'));
      };
      /** @type {Waiter} */
      const entry = {
        resolve: () => {
          signal?.removeEventListener('abort', abort);
          resolve(undefined);
        },
      };
      queue[tier] = entry;
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
  return {
    /** AI-life decisions. Rejects while another request is active or queued, except idle work, which it preempts. @param {Request} request */
    async background(request) {
      if (queue.foreground || queue.background) throw new Error('Evaluation busy');
      if (active) {
        if (active.tier !== 'idle') throw new Error('Evaluation busy');
        active.preempt?.abort();
        await wait('background', request);
      }
      return start('background', request);
    },
    /** World requests wait for the active evaluation and take priority over later work. @param {Request} request */
    async foreground(request) {
      if (queue.foreground) throw new Error('World request already queued');
      if (active) {
        if (active.tier === 'idle') active.preempt?.abort();
        await wait('foreground', request);
      }
      return start('foreground', request);
    },
    /** NPC minds. Runs only when nothing else is active or queued, and yields to any later request. @param {Request} request */
    async idle(request) {
      if (active || queue.foreground || queue.background) throw new Error('Evaluation busy');
      if (request.abortSignal?.aborted) throw new Error('Cancelled');
      const controller = new AbortController();
      const forward = () => controller.abort();
      request.abortSignal?.addEventListener('abort', forward, { once: true });
      try {
        return await start('idle', { ...request, abortSignal: controller.signal }, controller);
      } finally {
        request.abortSignal?.removeEventListener('abort', forward);
      }
    },
  };
}
