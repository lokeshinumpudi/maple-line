/**
 * three.js for Node asset scripts, resolved from the game package so the scripts use the
 * same pinned version as the browser. GLTFLoader parses in Node when a file has no
 * images; the meshopt decoder is pure WebAssembly.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const gamePackage = join(dirname(fileURLToPath(import.meta.url)), '../../apps/game/package.json');
const threeRoot = join(dirname(createRequire(gamePackage).resolve('three')), '..');

export const THREE = await import(join(threeRoot, 'build/three.module.js'));
const { GLTFLoader } = await import(join(threeRoot, 'examples/jsm/loaders/GLTFLoader.js'));
const { MeshoptDecoder } = await import(
  join(threeRoot, 'examples/jsm/libs/meshopt_decoder.module.js')
);

/** Parse a GLB from disk. `plugins` are GLTFLoader plugin factories (parser) => plugin. */
export async function loadGlb(path, plugins = []) {
  const bytes = readFileSync(path);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  for (const plugin of plugins) loader.register(plugin);
  return loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    '',
  );
}
