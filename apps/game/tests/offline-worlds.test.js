import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFLINE_WORLDS,
  findOfflineWorld,
  offlineProposal,
} from '../src/world/presets/offline-worlds.js';
import { WORLD_INVITATIONS } from '../src/ui/world-invitations.js';
import { validateWorldSpec, seedFromPrompt } from '@maple-line/world-spec';

test('every invitation has a validated captured Jev world with stable prompt seed', () => {
  assert.equal(OFFLINE_WORLDS.length, 24);
  assert.equal(new Set(OFFLINE_WORLDS.map((world) => world.id)).size, 24);
  for (const prompt of WORLD_INVITATIONS) {
    const match = findOfflineWorld(prompt);
    assert.equal(match.exact, true);
    assert.equal(match.preset.model, 'typesafe-ai/jev');
    assert.ok(Number.isFinite(Date.parse(match.preset.capturedAt)));
    assert.deepEqual(validateWorldSpec(match.preset.plan), match.preset.plan);
    assert.equal(match.preset.plan.seed, seedFromPrompt(prompt));
  }
});
test('negated or expanded prompts are suggestions only, and proposals cannot mutate the catalog', () => {
  const original = OFFLINE_WORLDS[0];
  assert.equal(findOfflineWorld(`  ${original.prompt.toUpperCase()}  `).exact, true);
  assert.equal(findOfflineWorld(`Not ${original.prompt}`).exact, false);
  assert.equal(findOfflineWorld(`${original.prompt} Add a castle.`).exact, false);
  const proposal = offlineProposal(original);
  proposal.plan.seed = 0;
  assert.notEqual(original.plan.seed, 0);
});
