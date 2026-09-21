import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('Provide an output directory for the standalone server.');
const destination = resolve(target);
await mkdir(destination, { recursive: true });
for (const path of ['src', 'api', 'tests', 'vercel.json', 'tsconfig.json'])
  await cp(`apps/director/${path}`, `${destination}/${path}`, { recursive: true });
for (const name of ['world-spec', 'voice-score'])
  await cp(`packages/${name}`, `${destination}/packages/${name}`, {
    recursive: true,
    filter: (path) => !path.includes('node_modules') && !path.includes('.turbo'),
  });
const pkg = JSON.parse(await readFile('apps/director/package.json', 'utf8'));
pkg.name = 'maple-line-server';
pkg.packageManager = 'pnpm@10.33.3';
pkg.engines = { node: '24.x' };
pkg.scripts.start = 'node --env-file-if-exists=.env src/server.js';
pkg.scripts.dev = 'node --env-file-if-exists=.env --watch src/server.js';
pkg.scripts.format = 'prettier --write src api tests *.json';
pkg.scripts['format:check'] = 'prettier --check src api tests *.json';
for (const name of ['world-spec', 'voice-score'])
  pkg.dependencies[`@maple-line/${name}`] = `file:packages/${name}`;
await writeFile(`${destination}/package.json`, `${JSON.stringify(pkg, null, 2)}\n`);
await writeFile(
  `${destination}/.gitignore`,
  'node_modules/\n.env\n.env.*\n!.env.example\n.vercel/\n.cache/\n*.log\n',
);
await writeFile(
  `${destination}/.env.example`,
  'AI_GATEWAY_API_KEY=\nSARVAM_API_KEY=\nALLOWED_ORIGINS=https://lokeshinumpudi.com,https://www.lokeshinumpudi.com\n',
);
await writeFile(
  `${destination}/README.md`,
  `# Maple Line server\n\nJev world generation and sightseeing decisions for [Maple Line](https://github.com/lokeshinumpudi/maple-line), with optional Sarvam narration. Runs separately from the browser game as a Vercel Fluid Node function.\n\nInstall with \`pnpm install\`. Set the server-only variables from \`.env.example\`; run \`pnpm start\` for local development. Vercel uses \`api/director/[...path].js\` and \`vercel.json\`. Configure \`ALLOWED_ORIGINS\` with the public client origins. Keys never belong in browser variables.\n\nEndpoints: GET \`/api/director/status\`, POST \`/api/director/world\`, POST \`/api/director/decide\`, POST \`/api/director/narration\`, GET \`/api/director/narration/status\`. Requests require JSON and are limited to 4,096 bytes. Provider failures return labelled fallback results. Narration uses an ephemeral cache under /tmp on Vercel.\n\nProvider concurrency and cooldowns apply per function instance. CORS restricts browser origins; it is not user authentication or a global spending limit.\n\nVerify with \`pnpm test\`, \`pnpm typecheck\`, and \`pnpm lint\`. Source is exported from the game workspace with \`node scripts/export-director.mjs <directory>\`.\n`,
);
console.log(`Exported server to ${destination}`);
