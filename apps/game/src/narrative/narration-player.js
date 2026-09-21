import { VOICE_CAST, VOICE_REVISION } from '@maple-line/voice-score';

/** Plays scored dialogue, retaining prepared clips separately from the serializable game state. */
export function createNarrationPlayer({
  audio,
  fetchImpl = fetch,
  urls = URL,
  onState = () => {},
  onPlaying = (playing) =>
    window.dispatchEvent(new CustomEvent('maple:narration-state', { detail: { playing } })),
}) {
  let version = 0,
    disposed = false,
    objectUrl = null,
    status = 'idle';
  let playlist = [],
    index = 0,
    language = 'en-IN',
    pauseTimer;
  let preparation = [],
    preparing = false,
    cacheBytes = 0;
  const cache = new Map(),
    pending = new Map();
  const cueKey = (cue, lang) =>
    JSON.stringify([
      VOICE_REVISION,
      cue.text,
      lang,
      cue.character ?? 'narrator',
      cue.emotion ?? 'natural',
    ]);
  const publish = (next, message = '') => {
    status = next;
    onState({ status, message, cue: playlist[index] ?? null, index, total: playlist.length });
  };
  function release() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (objectUrl) urls.revokeObjectURL(objectUrl);
    objectUrl = null;
    onPlaying(false);
  }
  function cancel() {
    version++;
    clearTimeout(pauseTimer);
    preparation = [];
    preparing = false;
    for (const entry of pending.values()) entry.controller.abort();
    pending.clear();
    playlist = [];
    index = 0;
    release();
    publish('idle');
  }
  function remember(key, blob) {
    while (cache.size && (cache.size >= 128 || cacheBytes + blob.size > 32000000)) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).size;
      cache.delete(oldest);
    }
    cache.set(key, blob);
    cacheBytes += blob.size;
  }
  function load(cue, lang, priority) {
    const key = cueKey(cue, lang);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending.has(key)) return pending.get(key).promise;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 65000);
    const entry = { controller, promise: null };
    const token = version;
    entry.promise = (async () => {
      try {
        const response = await fetchImpl('/api/director/narration', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text: cue.text,
            language: lang,
            character: cue.character ?? 'narrator',
            emotion: cue.emotion ?? 'natural',
            priority,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || 'Narration is unavailable. Try again.');
        }
        const blob = await response.blob();
        if (token === version && !disposed && !controller.signal.aborted) remember(key, blob);
        return blob;
      } finally {
        clearTimeout(timer);
        if (pending.get(key) === entry) pending.delete(key);
      }
    })();
    pending.set(key, entry);
    return entry.promise;
  }
  async function prepareNext() {
    if (preparing || disposed) return;
    preparing = true;
    const token = version;
    try {
      while (preparation.length && token === version && !disposed) {
        const { cue, lang } = preparation.shift();
        try {
          await load(cue, lang, 'prefetch');
        } catch {
          if (token === version) preparation = [];
          break;
        }
      }
    } finally {
      if (token === version) preparing = false;
    }
  }
  function prepare(cues, lang = language) {
    if (disposed) return;
    const seen = new Set();
    // Current dialogue always precedes speculative branches.
    const ahead = playlist.slice(index + 1).map((cue) => ({ cue, lang: language }));
    preparation = [...ahead, ...cues.map((cue) => ({ cue, lang }))]
      .filter((item) => {
        const key = cueKey(item.cue, item.lang);
        if (seen.has(key) || cache.has(key) || pending.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 64);
    void prepareNext();
  }
  async function play(token) {
    try {
      await audio.play();
      if (disposed || token !== version) return;
      onPlaying(true);
      const name = VOICE_CAST[playlist[index]?.character]?.name ?? 'Narrator';
      publish('playing', `${name} · ${index + 1} of ${playlist.length}`);
    } catch {
      if (disposed || token !== version) return;
      onPlaying(false);
      publish('blocked', 'Audio is ready. Press Play narration to listen.');
    }
  }
  async function playCue(token) {
    const cue = playlist[index];
    if (!cue || token !== version || disposed) return;
    publish('loading', 'Preparing voice…');
    try {
      const request = load(cue, language, 'playback');
      const blob = await request;
      if (disposed || token !== version) return;
      objectUrl = urls.createObjectURL(blob);
      audio.src = objectUrl;
      await play(token);
    } catch (error) {
      if (disposed || token !== version) return;
      release();
      publish(
        'error',
        error.name === 'AbortError' ? 'Narration timed out. Try again.' : error.message,
      );
    }
  }
  async function speak(input, lang = 'en-IN') {
    if (disposed) return;
    cancel();
    language = lang;
    playlist =
      typeof input === 'string'
        ? input.trim()
          ? [{ text: input, character: 'narrator', emotion: 'natural', pauseAfterMs: 0 }]
          : []
        : (input ?? []).map((cue) => ({ ...cue }));
    if (playlist.length) {
      const playing = playCue(version);
      prepare(playlist.slice(1), language);
      await playing;
    }
  }
  const ended = () => {
    if (disposed || !playlist.length || status !== 'playing') return;
    const pause = Math.max(0, Math.min(10000, playlist[index].pauseAfterMs ?? 320));
    release();
    if (index + 1 >= playlist.length) {
      publish('ended', 'Conversation finished');
      return;
    }
    const token = version;
    publish('waiting', '…');
    pauseTimer = setTimeout(() => {
      if (token !== version || disposed) return;
      index++;
      void playCue(token);
    }, pause);
  };
  const failed = () => {
    if (!objectUrl) return;
    clearTimeout(pauseTimer);
    release();
    publish('error', 'Audio could not play. Try again.');
  };
  audio.addEventListener('ended', ended);
  audio.addEventListener('error', failed);
  return {
    speak,
    prepare,
    cancel,
    resume: () => (status === 'blocked' ? play(version) : Promise.resolve()),
    dispose() {
      cancel();
      disposed = true;
      cache.clear();
      cacheBytes = 0;
      audio.removeEventListener('ended', ended);
      audio.removeEventListener('error', failed);
    },
  };
}
