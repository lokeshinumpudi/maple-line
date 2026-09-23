import { VOICE_REVISION } from '@maple-line/voice-score';

/**
 * Voice and translated subtitles for drama episodes, through the same director routes
 * and disk cache as story narration:
 *
 *   POST /api/director/narration/translate   English line -> chosen language (cached)
 *   POST /api/director/narration             line text -> WAV (cached)
 *
 * Hand-written `translations` in the episode win over machine translation. When the
 * director is offline or has no Sarvam key the episode keeps playing with subtitles,
 * and status() says why. Prepared clips live here, outside the serializable store.
 */
const REASONS = {
  offline: 'Director offline · subtitles only',
  'no-key': 'No Sarvam key on the director · subtitles only',
  hosted: 'Voice is not part of this build · subtitles only',
  blocked: 'The browser blocked audio · subtitles only until the next click',
};
const MAX_ENTRIES = 256;
const WORKERS = 2;

/** Length of a PCM WAV in milliseconds from its header, or null if it is not one. */
export function wavDurationMs(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? buffer : buffer?.buffer;
  if (!bytes || bytes.byteLength < 44) return null;
  const view = new DataView(bytes, buffer.byteOffset ?? 0, buffer.byteLength);
  const tag = (at) => String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + at, 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let byteRate = 0;
  for (let at = 12; at + 8 <= view.byteLength;) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ' && at + 20 <= view.byteLength) byteRate = view.getUint32(at + 16, true);
    if (id === 'data') {
      // Streamed WAVs can leave the size unset; fall back to the bytes that follow.
      const available = view.byteLength - (at + 8);
      const data = size > 0 && size <= available ? size : available;
      return byteRate > 0 ? Math.round((data / byteRate) * 1000) : null;
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

export function createEpisodeVoice({
  audio,
  fetchImpl = fetch,
  urls = URL,
  hosted = false,
  onPlaying = () => {},
  onStatus = () => {},
} = {}) {
  let language = 'en-IN';
  let enabled = true;
  let availability = hosted ? 'hosted' : 'unknown';
  let blocked = false;
  let checking = null;
  let version = 0;
  let current = null;
  let objectUrl = null;
  let running = 0;
  let paused = false;
  const entries = new Map();
  const queue = [];
  const controllers = new Set();

  const keyOf = (item) =>
    JSON.stringify([
      VOICE_REVISION,
      language,
      item.id,
      item.text,
      item.voice ?? null,
      item.emotion ?? 'natural',
    ]);
  const override = (item) =>
    language === 'en-IN' ? item.text : (item.translations?.[language] ?? null);
  const voicing = () => enabled && availability === 'ready' && !blocked;

  function status() {
    const reason = !enabled
      ? null
      : blocked
        ? REASONS.blocked
        : availability === 'unknown' || availability === 'checking' || availability === 'ready'
          ? null
          : REASONS[availability];
    return {
      mode: voicing() ? 'voice' : 'subtitles',
      language,
      requested: enabled,
      availability,
      reason,
    };
  }
  const publish = () => onStatus(status());

  async function request(path, body, signal) {
    const response = await fetchImpl(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (response.status === 503) {
      availability = 'no-key';
      publish();
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  }

  /** One status request decides whether the director can voice lines at all. */
  function check() {
    if (availability === 'hosted') return Promise.resolve(status());
    if (checking) return checking;
    availability = 'checking';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    checking = fetchImpl('/api/director/narration/status', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((value) => {
        availability = value?.configured ? 'ready' : 'no-key';
      })
      .catch(() => {
        availability = 'offline';
      })
      .then(() => {
        clearTimeout(timer);
        checking = null;
        publish();
        pump();
        return status();
      });
    return checking;
  }

  async function work(entry, token) {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 65000);
    const { item } = entry;
    try {
      if (entry.textState === 'pending') {
        const authored = override(item);
        if (authored) {
          entry.text = authored;
          entry.authored = language !== 'en-IN';
          entry.textState = 'ready';
        } else if (availability !== 'ready') {
          entry.textState = 'failed';
        } else {
          try {
            const response = await request(
              '/api/director/narration/translate',
              {
                text: item.text,
                language,
                ...(item.voice ? { character: item.voice } : {}),
              },
              controller.signal,
            );
            const value = await response.json();
            if (typeof value?.text !== 'string' || !value.text.trim()) throw new Error('empty');
            entry.text = value.text;
            entry.textState = 'ready';
          } catch (error) {
            if (error?.name === 'TypeError' && availability === 'ready') {
              availability = 'offline';
              publish();
            }
            entry.textState = 'failed';
          }
        }
      }
      if (token !== version) return;
      if (entry.clipState === 'pending') {
        // A failed translation is shown in English but never voiced in the wrong language.
        if (!voicing() || !item.voice || entry.textState !== 'ready') {
          entry.clipState = 'none';
          return;
        }
        try {
          const response = await request(
            '/api/director/narration',
            {
              text: entry.text,
              language,
              character: item.voice,
              emotion: item.emotion ?? 'natural',
              priority: 'prefetch',
              ...(language === 'en-IN' ? {} : { textLanguage: language }),
            },
            controller.signal,
          );
          const blob = await response.blob();
          const durationMs = wavDurationMs(await blob.arrayBuffer());
          if (!durationMs) throw new Error('not a WAV');
          if (token !== version) return;
          entry.clip = { blob, durationMs };
          entry.clipState = 'ready';
        } catch (error) {
          if (error?.name === 'TypeError' && availability === 'ready') {
            availability = 'offline';
            publish();
          }
          entry.clipState = 'failed';
        }
      }
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }
  function pump() {
    if (availability === 'unknown' || availability === 'checking') return;
    while (running < WORKERS && queue.length) {
      const entry = queue.shift();
      const token = version;
      running++;
      void work(entry, token).finally(() => {
        running--;
        pump();
      });
    }
  }
  function entryFor(item) {
    const key = keyOf(item);
    let entry = entries.get(key);
    if (entry) return entry;
    const authored = override(item);
    entry = {
      item,
      text: authored ?? item.text,
      authored: Boolean(authored) && language !== 'en-IN',
      textState: authored ? 'ready' : language === 'en-IN' ? 'ready' : 'pending',
      clipState: item.voice && enabled ? 'pending' : 'none',
      clip: null,
    };
    if (!authored && language !== 'en-IN' && availability !== 'ready' && isSettled())
      entry.textState = 'failed';
    if (entry.clipState === 'pending' && isSettled() && !voicing()) entry.clipState = 'none';
    while (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value);
    entries.set(key, entry);
    if (entry.textState === 'pending' || entry.clipState === 'pending') queue.push(entry);
    return entry;
  }
  const isSettled = () => !['unknown', 'checking'].includes(availability);
  function release({ quiet = false } = {}) {
    if (current) current.done = true;
    current = null;
    audio?.pause();
    audio?.removeAttribute('src');
    audio?.load?.();
    if (objectUrl) urls.revokeObjectURL(objectUrl);
    objectUrl = null;
    if (!quiet) onPlaying(false);
  }
  const ended = () => {
    if (current) release();
  };
  audio?.addEventListener('ended', ended);
  audio?.addEventListener('error', ended);

  return {
    /** Language code from NARRATION_LANGUAGES and whether to voice lines. */
    configure({ language: nextLanguage = language, enabled: nextEnabled = enabled } = {}) {
      if (nextLanguage === language && nextEnabled === enabled) return;
      language = nextLanguage;
      enabled = nextEnabled;
      blocked = false;
      // Earlier work belongs to another language or setting; clips already prepared stay.
      version++;
      queue.length = 0;
      for (const controller of controllers) controller.abort();
      for (const [key, entry] of entries)
        if (
          entry.textState === 'pending' ||
          entry.clipState === 'pending' ||
          (entry.item.voice && !entry.clip)
        )
          entries.delete(key);
      if (enabled && availability === 'unknown') void check();
      publish();
    },
    check,
    active: () => voicing() || language !== 'en-IN' || (enabled && !isSettled()),
    prepare(items) {
      if (enabled && availability === 'unknown') void check();
      for (const item of items) entryFor(item);
      pump();
    },
    ready(item) {
      if (!isSettled()) {
        entryFor(item);
        return false;
      }
      const entry = entryFor(item);
      pump();
      return entry.textState !== 'pending' && entry.clipState !== 'pending';
    },
    text: (item) => entries.get(keyOf(item))?.text ?? override(item) ?? item.text,
    durationMs: (item) => entries.get(keyOf(item))?.clip?.durationMs ?? null,
    play(item) {
      const entry = entries.get(keyOf(item));
      if (!voicing() || !entry?.clip || !audio) return null;
      release({ quiet: true });
      objectUrl = urls.createObjectURL(entry.clip.blob);
      audio.src = objectUrl;
      const handle = {
        durationMs: entry.clip.durationMs,
        done: false,
        stop: () => {
          if (current === handle) release();
          handle.done = true;
        },
      };
      current = handle;
      onPlaying(true);
      if (!paused)
        Promise.resolve(audio.play()).catch(() => {
          if (current !== handle) return;
          blocked = true;
          release();
          publish();
        });
      return handle;
    },
    /** Game pause, menus and hidden tabs hold the line with the timeline. */
    setPaused(value) {
      value = Boolean(value);
      if (value === paused) return;
      paused = value;
      if (!current || !audio) return;
      if (paused) audio.pause();
      else Promise.resolve(audio.play()).catch(() => {});
    },
    /** A fresh click (starting an episode) may play audio again after a block. */
    unblock() {
      if (!blocked) return;
      blocked = false;
      publish();
    },
    stopAll() {
      version++;
      queue.length = 0;
      for (const controller of controllers) controller.abort();
      for (const [key, entry] of entries)
        if (entry.textState === 'pending' || entry.clipState === 'pending') entries.delete(key);
      release();
    },
    status,
    dispose() {
      this.stopAll();
      entries.clear();
      audio?.removeEventListener('ended', ended);
      audio?.removeEventListener('error', ended);
    },
  };
}
