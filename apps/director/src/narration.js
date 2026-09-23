import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  NARRATION_LANGUAGES,
  VOICE_CAST,
  VOICE_DELIVERY,
  VOICE_MODEL,
  VOICE_MODELS,
  VOICE_REVISION,
  voiceFor,
} from '@maple-line/voice-score';
import { DirectorError } from './director.js';
import { createNarrationCache, createTranslationCache, isNarrationWav } from './narration-cache.js';

export { NARRATION_LANGUAGES };
export const TRANSLATION_MODEL = 'sarvam-translate:v1';
const MAX_TRANSLATED = 2500;

/**
 * Disk and memory key for one translated line. Speaker gender is part of the key because
 * it can change verb forms; the model and mode are included so a switch never reuses text.
 * @param {string} text @param {string} language @param {string|null} [gender]
 */
export function translationKey(text, language, gender = null) {
  return createHash('sha256')
    .update(
      JSON.stringify([TRANSLATION_MODEL, 'formal', 'en-IN', language, gender ?? '', text.trim()]),
    )
    .digest('hex');
}

/** @param {unknown} value */
const selectModel = (value) =>
  typeof value === 'string' && VOICE_MODELS.includes(value) ? value : VOICE_MODEL;

/** @typedef {{audio:Buffer,text:string,language:string}} Clip */
/** @typedef {{text:string,language:string,character:string,emotion:string,textLanguage?:string}} Cue */
/** @typedef {{key:string,cue:Cue,priority:number,controller:AbortController,waiters:number,promise:Promise<Clip>,resolve:(clip:Clip)=>void,reject:(error:unknown)=>void}} Job */
/** @typedef {{text:string,source:string}} Translation */
const cancelled = () => new DirectorError(504, 'Narration was cancelled or timed out.');

/** @param {{apiKey?:string, fetchImpl?:typeof fetch, deadlineMs?:number, cacheDirectory?:string|null, concurrency?:number, model?:string}} [options] */
export function createNarration({
  apiKey = process.env.SARVAM_API_KEY,
  fetchImpl = fetch,
  deadlineMs = 30000,
  cacheDirectory = null,
  concurrency = 2,
  model = process.env.SARVAM_VOICE_MODEL,
} = {}) {
  const voiceModel = selectModel(model);
  const disk = createNarrationCache(cacheDirectory);
  const translationDisk = createTranslationCache(
    cacheDirectory ? join(cacheDirectory, 'translations') : null,
  );
  /** @type {Map<string, Clip>} */
  const cache = new Map();
  /** @type {Map<string, Job>} */
  const jobs = new Map();
  /** @type {Job[]} */
  const queue = [];
  /** @type {Map<string, string>} */
  const translations = new Map();
  /** @type {Map<string, Promise<Translation>>} */
  const translating = new Map();
  /** @type {(() => void)[]} */
  const translationWaiters = [];
  let cacheBytes = 0,
    active = 0,
    hits = 0,
    generated = 0,
    translationActive = 0,
    translationHits = 0,
    translated = 0;
  const limit = Math.max(1, Math.min(4, concurrency));

  /** @param {string} key @param {Clip} clip */
  function remember(key, clip) {
    while (cache.size && (cache.size >= 128 || cacheBytes + clip.audio.length > 32000000)) {
      const oldest = /** @type {string} */ (cache.keys().next().value);
      cacheBytes -= /** @type {Clip} */ (cache.get(oldest)).audio.length;
      cache.delete(oldest);
    }
    cache.set(key, clip);
    cacheBytes += clip.audio.length;
    return clip;
  }
  function requireKey() {
    if (!apiKey?.trim())
      throw new DirectorError(
        503,
        'Add SARVAM_API_KEY to the server .env and restart the director to enable narration.',
      );
  }
  /** @param {string} path @param {Record<string,unknown>} body @param {AbortSignal} signal */
  async function request(path, body, signal) {
    const response = await fetchImpl(`https://api.sarvam.ai/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-subscription-key': /** @type {string} */ (apiKey),
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok)
      throw new DirectorError(
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? 'Sarvam is busy. Try narration again shortly.'
          : 'Sarvam could not prepare this narration. Check the server key and account access.',
      );
    return response.json();
  }
  /**
   * English text to one language: memory, then disk, then one bounded provider call.
   * Concurrent requests for the same line share that call.
   * @param {string} text @param {string} language @param {string|null} gender @param {AbortSignal} [signal]
   * @returns {Promise<Translation>}
   */
  function translateLine(text, language, gender, signal) {
    const key = translationKey(text, language, gender);
    const remembered = translations.get(key);
    if (remembered) {
      translationHits++;
      return Promise.resolve({ text: remembered, source: 'cache' });
    }
    let shared = translating.get(key);
    if (!shared) {
      if (translating.size >= 32)
        return Promise.reject(
          new DirectorError(429, 'The translation queue is full. Try again shortly.'),
        );
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(deadlineMs, 20000));
      shared = (async () => {
        try {
          const stored = await translationDisk.read(key);
          if (stored) {
            translationHits++;
            return { text: stored, source: 'cache' };
          }
          requireKey();
          while (translationActive >= limit)
            await new Promise((resolve) => translationWaiters.push(() => resolve(undefined)));
          translationActive++;
          try {
            const result = await request(
              'translate',
              {
                input: text.trim(),
                source_language_code: 'en-IN',
                target_language_code: language,
                model: TRANSLATION_MODEL,
                ...(gender ? { speaker_gender: gender } : {}),
              },
              controller.signal,
            );
            const value = result?.translated_text;
            if (typeof value !== 'string' || !value.trim() || value.length > MAX_TRANSLATED)
              throw new DirectorError(502, 'Sarvam returned an unsupported translation.');
            translated++;
            await translationDisk.write(key, {
              text: value.trim(),
              language,
              model: TRANSLATION_MODEL,
              source: text.trim(),
            });
            return { text: value.trim(), source: 'sarvam' };
          } finally {
            translationActive--;
            translationWaiters.shift()?.();
          }
        } catch (error) {
          if (controller.signal.aborted) throw cancelled();
          if (error instanceof DirectorError) throw error;
          throw new DirectorError(502, 'Sarvam translation is temporarily unavailable.');
        } finally {
          clearTimeout(timer);
          translating.delete(key);
        }
      })();
      shared.then(
        (value) => {
          while (translations.size >= 1024)
            translations.delete(/** @type {string} */ (translations.keys().next().value));
          translations.set(key, value.text);
        },
        () => {},
      );
      translating.set(key, shared);
    }
    if (!signal) return shared;
    const pending = shared;
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(cancelled());
      const abort = () => reject(cancelled());
      signal.addEventListener('abort', abort, { once: true });
      pending.then(
        (value) => {
          signal.removeEventListener('abort', abort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        },
      );
    });
  }
  /** @param {Job} job */
  async function generate(job) {
    const { cue, controller, key } = job;
    const stored = await disk.read(key);
    if (controller.signal.aborted) throw cancelled();
    if (stored) {
      hits++;
      return remember(key, { audio: stored, text: cue.text, language: cue.language });
    }
    requireKey();
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    try {
      const text =
        cue.language === 'en-IN' || cue.textLanguage === cue.language
          ? cue.text
          : (await translateLine(cue.text, cue.language, null, controller.signal)).text;
      const voice = voiceFor(cue.character, cue.emotion, {
        model: voiceModel,
        language: cue.language,
      });
      const result = await request(
        'text-to-speech',
        {
          text,
          language_code: cue.language,
          model: voice.model,
          speaker: voice.speaker,
          pace: voice.pace,
          speech_sample_rate: 24000,
          output_audio_codec: 'wav',
        },
        controller.signal,
      );
      if (
        !Array.isArray(result.audios) ||
        result.audios.length !== 1 ||
        typeof result.audios[0] !== 'string' ||
        result.audios[0].length > 16000000
      )
        throw new DirectorError(502, 'Sarvam returned an unsupported audio response.');
      const audio = Buffer.from(result.audios[0], 'base64');
      if (!isNarrationWav(audio))
        throw new DirectorError(502, 'Sarvam returned an unsupported audio format.');
      if (controller.signal.aborted) throw cancelled();
      await disk.write(key, audio);
      generated++;
      return remember(key, { audio, text: cue.text, language: cue.language });
    } catch (error) {
      if (controller.signal.aborted) throw cancelled();
      if (error instanceof DirectorError) throw error;
      throw new DirectorError(502, 'Sarvam narration is temporarily unavailable.');
    } finally {
      clearTimeout(timer);
    }
  }
  function pump() {
    queue.sort((a, b) => a.priority - b.priority);
    while (active < limit && queue.length) {
      const job = /** @type {Job} */ (queue.shift());
      if (job.controller.signal.aborted) {
        if (jobs.get(job.key) === job) jobs.delete(job.key);
        job.reject(cancelled());
        continue;
      }
      active++;
      void generate(job)
        .then(job.resolve, job.reject)
        .finally(() => {
          active--;
          if (jobs.get(job.key) === job) jobs.delete(job.key);
          pump();
        });
    }
  }
  /** @param {unknown} input @param {AbortSignal} [signal] */
  async function speak(input, signal) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new DirectorError(400, 'Invalid narration request.');
    const data = /** @type {Record<string,unknown>} */ (input);
    const character = data.character ?? 'narrator',
      emotion = data.emotion ?? 'natural';
    if (
      Object.keys(data).some(
        (key) =>
          !['text', 'language', 'character', 'emotion', 'priority', 'textLanguage'].includes(key),
      ) ||
      typeof data.text !== 'string' ||
      !data.text.trim() ||
      data.text.length > 1600 ||
      !NARRATION_LANGUAGES.some((lang) => lang.code === data.language) ||
      (data.textLanguage !== undefined &&
        data.textLanguage !== 'en-IN' &&
        data.textLanguage !== data.language) ||
      typeof character !== 'string' ||
      !Object.hasOwn(VOICE_CAST, character) ||
      typeof emotion !== 'string' ||
      !Object.hasOwn(VOICE_DELIVERY, emotion) ||
      (data.priority !== undefined &&
        !['playback', 'prefetch'].includes(/** @type {string} */ (data.priority)))
    )
      throw new DirectorError(
        400,
        'Choose a supported language, character, delivery and 1–1600 characters of dialogue.',
      );
    if (signal?.aborted) throw cancelled();
    const language = /** @type {string} */ (data.language);
    /** @type {Cue} */
    const cue = {
      text: data.text.trim(),
      language,
      character,
      emotion,
      // Only text already written in the target language carries this field, so keys
      // made before translated lines existed stay valid.
      ...(data.textLanguage === language && language !== 'en-IN' ? { textLanguage: language } : {}),
    };
    const voice = voiceFor(character, emotion, { model: voiceModel, language });
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          VOICE_REVISION,
          voice.model,
          TRANSLATION_MODEL,
          cue,
          { speaker: voice.speaker, pace: voice.pace },
          24000,
        ]),
      )
      .digest('hex');
    const cached = cache.get(key);
    if (cached) {
      hits++;
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    let job = jobs.get(key);
    if (job?.controller.signal.aborted) job = undefined;
    const priority = data.priority === 'prefetch' ? 1 : 0;
    if (!job) {
      if (jobs.size >= 32)
        throw new DirectorError(429, 'The narration queue is full. Try again shortly.');
      let resolveJob = /** @type {(clip:Clip)=>void} */ (() => {});
      let rejectJob = /** @type {(error:unknown)=>void} */ (() => {});
      const promise = new Promise((resolve, reject) => {
        resolveJob = resolve;
        rejectJob = reject;
      });
      job = {
        key,
        cue,
        priority,
        controller: new AbortController(),
        waiters: 0,
        promise,
        resolve: resolveJob,
        reject: rejectJob,
      };
      jobs.set(key, job);
      queue.push(job);
    }
    job.priority = Math.min(job.priority, priority);
    const shared = job;
    shared.waiters++;
    queueMicrotask(pump);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return false;
        settled = true;
        signal?.removeEventListener('abort', abort);
        shared.waiters--;
        return true;
      };
      const abort = () => {
        if (!finish()) return;
        if (!shared.waiters) shared.controller.abort();
        reject(cancelled());
      };
      signal?.addEventListener('abort', abort, { once: true });
      shared.promise.then(
        (value) => {
          if (finish()) resolve(value);
        },
        (error) => {
          if (finish()) reject(error);
        },
      );
    });
  }
  /**
   * Translate one English line for subtitles. speak() reads the same cache, so a
   * machine-translated subtitle and its audio always use the same words.
   * @param {unknown} input @param {AbortSignal} [signal]
   */
  async function translate(input, signal) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new DirectorError(400, 'Invalid translation request.');
    const data = /** @type {Record<string,unknown>} */ (input);
    if (
      Object.keys(data).some((key) => !['text', 'language', 'character'].includes(key)) ||
      typeof data.text !== 'string' ||
      !data.text.trim() ||
      data.text.length > 1600 ||
      !NARRATION_LANGUAGES.some((lang) => lang.code === data.language) ||
      (data.character !== undefined &&
        (typeof data.character !== 'string' || !Object.hasOwn(VOICE_CAST, data.character)))
    )
      throw new DirectorError(
        400,
        'Choose a supported language, character and 1–1600 characters of text.',
      );
    const language = /** @type {string} */ (data.language);
    const text = data.text.trim();
    if (language === 'en-IN') return { text, language, source: 'original' };
    const gender =
      typeof data.character === 'string'
        ? VOICE_CAST[/** @type {keyof typeof VOICE_CAST} */ (data.character)].gender
        : null;
    const result = await translateLine(text, language, gender, signal);
    return { text: result.text, language, source: result.source };
  }
  return {
    speak,
    translate,
    status: () => ({
      configured: Boolean(apiKey?.trim()),
      provider: 'sarvam',
      model: voiceModel,
      translationModel: TRANSLATION_MODEL,
      defaultLanguage: 'en-IN',
      languages: NARRATION_LANGUAGES,
      busy: active > 0,
      active,
      queued: queue.length,
      cast: VOICE_CAST,
      delivery: VOICE_DELIVERY,
      revision: VOICE_REVISION,
      cache: { ...disk.status(), clips: cache.size, bytes: cacheBytes, hits, generated },
      translations: {
        active: translationActive,
        lines: translations.size,
        hits: translationHits,
        translated,
      },
    }),
  };
}
