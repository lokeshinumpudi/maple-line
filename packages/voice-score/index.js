/** Increment when casting or delivery changes to invalidate prepared audio. */
export const VOICE_REVISION = 'cast-2';
/** The model every request uses unless the director is started with SARVAM_VOICE_MODEL. */
export const VOICE_MODEL = 'bulbul:v3';
/**
 * Models the director may select. bulbul:v3 uses one speaker for every language.
 * bulbul:v4-flash uses per-language, style-tagged speakers (for example
 * `kavitha_te_conversation`); it was in closed beta for this account in September 2026,
 * so a cast member without a v4 speaker for a language keeps its v3 voice.
 */
export const VOICE_MODELS = ['bulbul:v3', 'bulbul:v4-flash'];
/** Languages Sarvam can voice and translate (Bulbul and Sarvam-Translate share them). */
export const NARRATION_LANGUAGES = [
  ['en-IN', 'English'],
  ['te-IN', 'Telugu'],
  ['hi-IN', 'Hindi'],
  ['ta-IN', 'Tamil'],
  ['bn-IN', 'Bengali'],
  ['mr-IN', 'Marathi'],
  ['gu-IN', 'Gujarati'],
  ['kn-IN', 'Kannada'],
  ['ml-IN', 'Malayalam'],
  ['pa-IN', 'Punjabi'],
  ['od-IN', 'Odia'],
].map(([code, label]) => ({ code, label }));
/**
 * Stable casting; emotion never changes a character's identity. `speaker` is the
 * bulbul:v3 voice. `gender` is passed to translation so verbs agree with the speaker.
 * `v4` lists bulbul:v4-flash speakers by language, only where the name is confirmed.
 */
export const VOICE_CAST = {
  narrator: {
    name: 'Narrator',
    speaker: 'shubh',
    pace: 0.95,
    gender: 'Male',
    v4: {
      'en-IN': 'shubh_en_narration',
      'te-IN': 'tarun_te_narration',
      'ta-IN': 'gokul_ta_narration',
    },
  },
  haru: { name: 'Haru', speaker: 'ratan', pace: 0.91, gender: 'Male' },
  emi: { name: 'Emi', speaker: 'ritu', pace: 1.04, gender: 'Female' },
  nao: { name: 'Nao', speaker: 'priya', pace: 1.02, gender: 'Female' },
  fumi: { name: 'Fumi', speaker: 'roopa', pace: 0.97, gender: 'Female' },
  jun: { name: 'Jun', speaker: 'aditya', pace: 0.98, gender: 'Male' },
  yuta: { name: 'Yuta', speaker: 'rohan', pace: 1.0, gender: 'Male' },
  mika: { name: 'Mika', speaker: 'kavya', pace: 1.03, gender: 'Female' },
  keiko: {
    name: 'Keiko',
    speaker: 'kavitha',
    pace: 0.96,
    gender: 'Female',
    v4: { 'te-IN': 'kavitha_te_conversation' },
  },
  son: { name: 'Haru’s son', speaker: 'rahul', pace: 1.0, gender: 'Male' },
  // The 17:42 (drama episodes).
  meera: {
    name: 'Meera',
    speaker: 'ishita',
    pace: 1.05,
    gender: 'Female',
    v4: { 'te-IN': 'pooja_te_conversation' },
  },
  // Arjun, 17, Meera's classmate: a young male voice no other part uses.
  arjun: { name: 'Arjun', speaker: 'aayan', pace: 1.03, gender: 'Male' },
  ishida: { name: 'Mr. Ishida', speaker: 'anand', pace: 0.88, gender: 'Male' },
  ammamma: { name: 'Ammamma', speaker: 'rupali', pace: 0.93, gender: 'Female' },
  // Divya, 24, Arjun's sister, drives the Aonuma bus: bright and quick.
  divya: { name: 'Divya', speaker: 'shreya', pace: 1.04, gender: 'Female' },
};
/** Direction is expressed through pace and timed silence, not unsupported emotion tags. */
export const VOICE_DELIVERY = {
  natural: { pace: 1, pauseMs: 320 },
  warm: { pace: 0.96, pauseMs: 420 },
  playful: { pace: 1.06, pauseMs: 240 },
  curious: { pace: 1.02, pauseMs: 380 },
  reflective: { pace: 0.91, pauseMs: 650 },
  vulnerable: { pace: 0.88, pauseMs: 850 },
  reassuring: { pace: 0.93, pauseMs: 550 },
  excited: { pace: 1.1, pauseMs: 220 },
  anxious: { pace: 1.08, pauseMs: 240 },
  dry: { pace: 0.95, pauseMs: 450 },
  tired: { pace: 0.89, pauseMs: 600 },
};
/** bulbul:v3 settings. Unchanged output keeps previously prepared audio valid. */
/** @param {string} character @param {string} emotion */
export function voiceSettings(character, emotion) {
  const cast = VOICE_CAST[/** @type {keyof typeof VOICE_CAST} */ (character)];
  const delivery = VOICE_DELIVERY[/** @type {keyof typeof VOICE_DELIVERY} */ (emotion)];
  return { speaker: cast.speaker, pace: Math.round(cast.pace * delivery.pace * 100) / 100 };
}
/**
 * The model and speaker one line uses. A v4 request falls back to v3 for a cast member
 * with no confirmed v4 speaker in that language, so switching models never silences a part.
 * @param {string} character @param {string} emotion @param {{model?:string,language?:string}} [options]
 */
export function voiceFor(character, emotion, { model = VOICE_MODEL, language = 'en-IN' } = {}) {
  const settings = voiceSettings(character, emotion);
  if (model === 'bulbul:v3') return { model, ...settings };
  const cast = /** @type {{v4?:Record<string,string>}} */ (
    VOICE_CAST[/** @type {keyof typeof VOICE_CAST} */ (character)]
  );
  const speaker = cast.v4?.[language];
  return speaker ? { model, speaker, pace: settings.pace } : { model: 'bulbul:v3', ...settings };
}
