// Refresh intentionally: these requests use the configured Jev account via the local director.
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { WORLD_INVITATIONS } from '../apps/game/src/ui/world-invitations.js';
import { validateWorldSpec } from '../packages/world-spec/index.js';
const output = new URL('../apps/game/src/world/presets/jev-worlds.json', import.meta.url);
const catalog = await readFile(output, 'utf8')
  .then(JSON.parse)
  .catch(() => ({ version: 1, worlds: [] }));
for (const [index, prompt] of WORLD_INVITATIONS.entries()) {
  if (catalog.worlds.some((world) => world.prompt === prompt)) continue;
  let captured = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch('http://127.0.0.1:4173/api/director/world', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(22000),
    });
    if (response.ok) {
      const result = await response.json();
      if (result.source !== 'jev' || result.coverage !== 'supported')
        throw new Error(`Invitation ${index + 1} did not return a supported Jev plan.`);
      catalog.worlds.push({
        id: `valley-${String(index + 1).padStart(2, '0')}`,
        title: prompt.split('. ')[0].replace(/\.$/, ''),
        prompt,
        model: 'typesafe-ai/jev',
        capturedAt: new Date().toISOString(),
        plan: validateWorldSpec(result.plan),
      });
      catalog.worlds.sort((a, b) => a.id.localeCompare(b.id));
      await writeFile(output, JSON.stringify(catalog, null, 2) + '\n');
      console.log(`Captured Jev preset ${index + 1}/${WORLD_INVITATIONS.length}`);
      captured = true;
      break;
    }
    if (![429, 503].includes(response.status))
      throw new Error(`Preset request failed (${response.status}).`);
    await delay(6000);
  }
  if (!captured)
    throw new Error(`Jev was unavailable for invitation ${index + 1}. Rerun to resume.`);
  if (index < WORLD_INVITATIONS.length - 1) await delay(5200);
}
