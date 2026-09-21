import catalog from './jev-worlds.json' with { type: 'json' };
import { validateWorldSpec } from '@maple-line/world-spec';

// Captured evaluator outputs, not a model embedded in the browser.
export const OFFLINE_WORLDS = Object.freeze(
  catalog.worlds.map((world) =>
    Object.freeze({
      ...world,
      plan: Object.freeze(validateWorldSpec(world.plan)),
    }),
  ),
);
const normalize = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ');
const ignored = new Set(
  'a an the and or with in of to at on for by from is it its us as into our your my has have all through beside beneath around world valley railway train please make build create'.split(
    ' ',
  ),
);
const tokens = (text) =>
  new Set(
    normalize(text)
      .match(/[\p{L}]+/gu)
      ?.filter((word) => word.length > 2 && !ignored.has(word)) ?? [],
  );

/** Approximate suggestions always require review; only an identical saved prompt is exact. */
export function findOfflineWorld(prompt) {
  const exact = OFFLINE_WORLDS.find((world) => normalize(world.prompt) === normalize(prompt));
  if (exact) return { preset: exact, exact: true };
  const requested = tokens(prompt);
  let preset = OFFLINE_WORLDS.find((world) => world.id === 'valley-03') ?? OFFLINE_WORLDS[0];
  let highest = 0;
  for (const world of OFFLINE_WORLDS) {
    const words = tokens(world.prompt);
    const score = [...requested].filter((word) => words.has(word)).length;
    if (score > highest) {
      highest = score;
      preset = world;
    }
  }
  return { preset, exact: false };
}

export function offlineProposal(preset, prompt = preset.prompt) {
  return {
    plan: validateWorldSpec(preset.plan),
    prompt,
    source: 'jev-preset',
    coverage: 'preset',
    preset: {
      id: preset.id,
      title: preset.title,
      prompt: preset.prompt,
      model: preset.model,
      capturedAt: preset.capturedAt,
    },
  };
}
