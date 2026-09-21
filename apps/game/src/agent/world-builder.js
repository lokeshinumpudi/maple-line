import { validateWorldSpec } from '@maple-line/world-spec';
import {
  OFFLINE_WORLDS,
  findOfflineWorld,
  offlineProposal,
} from '../world/presets/offline-worlds.js';

/** Request lifecycle only. Persistent UI and active-world state belong to the store. */
export function createWorldBuilder({
  getState,
  update,
  prepareWorld,
  onBuildError,
  fetcher = globalThis.fetch,
  timeoutMs = 20000,
  retryMs = 5000,
  offline = false,
}) {
  let generation = 0;
  let pending;
  let disposed = false;
  const current = (epoch) => !disposed && generation === epoch;
  async function build(proposal, epoch) {
    update({
      status: 'building',
      message: 'Growing trees and building the valley…',
      proposal: null,
    });
    let prepared;
    try {
      prepared = await prepareWorld(proposal.plan);
      if (!current(epoch)) {
        prepared.dispose();
        return;
      }
      prepared.activate();
      update({
        status: 'active',
        message:
          proposal.source === 'jev-preset'
            ? 'Your saved Jev world is active. No live generation was used.'
            : 'Your world is active.',
        active: { ...proposal, activatedAt: Date.now() },
        proposal: null,
      });
    } catch (error) {
      onBuildError?.(error);
      prepared?.dispose();
      if (current(epoch))
        update({
          status: 'error',
          message:
            'This world could not be built. Your previous world is still available. Try again.',
          proposal: null,
        });
    }
  }
  async function fallback(prompt, epoch) {
    if (!current(epoch)) return;
    const { preset, exact } = findOfflineWorld(prompt);
    const proposal = offlineProposal(preset, prompt);
    if (exact) return build(proposal, epoch);
    update({
      status: 'review',
      message: `Live Jev is unavailable. Saved suggestion: “${preset.title}”. This preset may differ from your description. Review its settings or choose another saved world.`,
      proposal,
    });
  }
  return {
    async create(raw) {
      if (disposed) return;
      const prompt = raw.trim();
      if (prompt.length < 3 || prompt.length > 600) {
        update({ status: 'error', message: 'Describe your world in 3–600 characters.' });
        return;
      }
      const epoch = ++generation;
      pending?.abort();
      if (offline) return fallback(prompt, epoch);
      const controller = new AbortController();
      pending = controller;
      update({
        status: 'interpreting',
        message: 'Choosing your world settings…',
        proposal: null,
      });
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let proposal;
      let receivedAnswer = false;
      try {
        const send = () =>
          fetcher('/api/director/world', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ prompt }),
            signal: controller.signal,
          });
        let response = await send();
        if (response.status === 429 && current(epoch)) {
          update({ message: 'Waiting for Jev. Retrying shortly…' });
          await new Promise((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(new Error('Cancelled'));
            };
            const timer = setTimeout(() => {
              controller.signal.removeEventListener('abort', abort);
              resolve();
            }, retryMs);
            controller.signal.addEventListener('abort', abort, { once: true });
            if (controller.signal.aborted) abort();
          });
          if (!current(epoch)) return;
          response = await send();
        }
        if (!current(epoch)) return;
        if (controller.signal.aborted) return await fallback(prompt, epoch);
        if (!response.ok) {
          if (response.status === 404 || response.status === 429 || response.status >= 500)
            return await fallback(prompt, epoch);
          update({
            status: 'error',
            message: 'The world request was rejected. Your current world is unchanged.',
          });
          return;
        }
        const result = await response.json();
        if (!current(epoch)) return;
        receivedAnswer = true;
        if (
          !['jev', 'signal'].includes(result.source) ||
          !['supported', 'partial', 'unsupported'].includes(result.coverage)
        )
          throw new Error('Invalid response');
        const plan = validateWorldSpec(result.plan);
        if (result.coverage === 'unsupported') {
          update({
            status: 'unsupported',
            message:
              'This world is beyond the valley builder. Try tree seasons, woodland density, village or city rooftops, weather, and daylight or dusk.',
          });
          return;
        }
        proposal = { plan, prompt, source: result.source, coverage: result.coverage };
        if (result.coverage === 'partial') {
          update({
            status: 'review',
            message: 'We can build the settings below. Other requested features will not be added.',
            proposal,
          });
          return;
        }
      } catch {
        if (!receivedAnswer) return await fallback(prompt, epoch);
        if (current(epoch))
          update({
            status: 'error',
            message:
              'The world request did not finish. Your current world is unchanged. Please try again.',
          });
        return;
      } finally {
        clearTimeout(timeout);
        if (pending === controller) pending = null;
      }
      if (current(epoch)) await build(proposal, epoch);
    },
    async createPreset(id) {
      if (disposed) return;
      const preset = OFFLINE_WORLDS.find((world) => world.id === id);
      if (!preset) return;
      const epoch = ++generation;
      pending?.abort();
      await build(offlineProposal(preset), epoch);
    },
    async accept() {
      const state = getState();
      if (disposed || state.status !== 'review' || !state.proposal) return;
      await build(state.proposal, ++generation);
    },
    cancel() {
      generation++;
      pending?.abort();
      update({
        status: getState().active ? 'active' : 'idle',
        message: getState().active
          ? 'Your world is active.'
          : 'Describe the valley you want to visit.',
        proposal: null,
      });
    },
    dispose() {
      disposed = true;
      generation++;
      pending?.abort();
    },
  };
}
