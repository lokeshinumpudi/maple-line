import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const requireGame = createRequire(new URL('../apps/game/package.json', import.meta.url));
const requireVite = createRequire(requireGame.resolve('vite'));
const { build } = requireVite('esbuild');
await mkdir('artifacts/ship', { recursive: true });
await build({
  entryPoints: ['ship/generate-world.mjs'],
  outfile: 'artifacts/ship/generate-world.mjs',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
});
