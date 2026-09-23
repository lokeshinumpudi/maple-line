import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** @param {Buffer} audio */
export function isNarrationWav(audio) {
  return (
    audio.length >= 44 &&
    audio.length <= 12000000 &&
    audio.toString('ascii', 0, 4) === 'RIFF' &&
    audio.toString('ascii', 8, 12) === 'WAVE'
  );
}

/** Local expendable audio cache. Writes and eviction are serialized; failures allow live speech.
 * @param {string | null} directory @param {number} [maxBytes]
 */
export function createNarrationCache(directory, maxBytes = 256000000) {
  let writes = Promise.resolve();
  let available = Boolean(directory);
  return {
    status: () => ({ persistent: Boolean(directory), available, maxBytes }),
    /** @param {string} key */
    async read(key) {
      if (!directory) return null;
      try {
        const path = join(directory, `${key}.wav`);
        const info = await stat(path);
        if (info.size > 12000000) return null;
        const audio = await readFile(path);
        return isNarrationWav(audio) ? audio : null;
      } catch {
        return null;
      }
    },
    /** @param {string} key @param {Buffer} audio */
    write(key, audio) {
      if (!directory || audio.length > maxBytes) return Promise.resolve();
      const folder = directory;
      writes = writes
        .then(async () => {
          await mkdir(folder, { recursive: true });
          const temporary = join(folder, `${key}.${randomUUID()}.tmp`);
          try {
            await writeFile(temporary, audio, { mode: 0o600 });
            await rename(temporary, join(folder, `${key}.wav`));
          } finally {
            await unlink(temporary).catch(() => {});
          }
          const names = (await readdir(folder)).filter((name) => /^[a-f0-9]{64}\.wav$/.test(name));
          const files = await Promise.all(
            names.map(async (name) => ({ name, ...(await stat(join(folder, name))) })),
          );
          let bytes = files.reduce((sum, file) => sum + file.size, 0);
          for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
            if (bytes <= maxBytes) break;
            await unlink(join(folder, file.name));
            bytes -= file.size;
          }
          available = true;
        })
        .catch(() => {
          available = false;
        });
      return writes;
    },
  };
}

/** Local translation cache: one small JSON file per line, kept beside the audio cache.
 * Translations are cheap to redo, so failures only cost another provider call.
 * @param {string | null} directory @param {number} [maxEntries]
 */
export function createTranslationCache(directory, maxEntries = 20000) {
  let writes = Promise.resolve();
  let entries = -1;
  return {
    /** @param {string} key @returns {Promise<string|null>} */
    async read(key) {
      if (!directory) return null;
      try {
        const path = join(directory, `${key}.json`);
        const info = await stat(path);
        if (info.size > 16000) return null;
        const value = JSON.parse(await readFile(path, 'utf8'));
        return typeof value?.text === 'string' && value.text.trim() ? value.text : null;
      } catch {
        return null;
      }
    },
    /** @param {string} key @param {Record<string, unknown> & {text:string}} value */
    write(key, value) {
      if (!directory) return Promise.resolve();
      const folder = directory;
      writes = writes
        .then(async () => {
          await mkdir(folder, { recursive: true });
          if (entries < 0) entries = (await readdir(folder)).length;
          if (entries >= maxEntries) return;
          const temporary = join(folder, `${key}.${randomUUID()}.tmp`);
          try {
            await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
            await rename(temporary, join(folder, `${key}.json`));
            entries++;
          } finally {
            await unlink(temporary).catch(() => {});
          }
        })
        .catch(() => {});
      return writes;
    },
  };
}
