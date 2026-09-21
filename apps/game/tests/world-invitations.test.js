import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationDeck, WORLD_INVITATIONS } from '../src/ui/world-invitations.js';

test('surprise visits every invitation before repeating and avoids a boundary repeat', () => {
  for (const random of [() => 0, () => 0.5, () => 0.99999]) {
    const next = createInvitationDeck(random);
    let last;
    for (let round = 0; round < 3; round++) {
      const seen = new Set();
      for (let i = 0; i < WORLD_INVITATIONS.length; i++) {
        const invitation = next();
        assert.notEqual(invitation, last);
        assert.ok(!seen.has(invitation));
        assert.ok(invitation.length >= 3 && invitation.length <= 600);
        seen.add(invitation);
        last = invitation;
      }
      assert.equal(seen.size, WORLD_INVITATIONS.length);
    }
  }
});
