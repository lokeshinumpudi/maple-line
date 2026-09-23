/**
 * NPC minds: persona, emotion, needs, and a bounded intent for each background character.
 *
 * Pure module with no Three.js dependency. Simulation time only advances through
 * tick(dt), so paused frames freeze moods and hold timers. Every random draw comes
 * from a per-character generator seeded by (seed, id), so a run is reproducible.
 *
 * Priority of the visible choice: directed (agent acting note) > jev > local.
 * Movement code reads `expressionFor(id)`; it never needs to know the model.
 */

export const MOODS = [
  'content',
  'cheerful',
  'wistful',
  'anxious',
  'impatient',
  'curious',
  'tired',
  'irritated',
  'shy',
];
export const INTENTS = [
  'continue',
  'linger',
  'chat',
  'hurry',
  'shelter',
  'watch-train',
  'wave',
  'sit',
  'check-phone',
  'stretch',
];
export const MIND_ROLES = [
  'commuter',
  'student',
  'shopper',
  'resident',
  'visitor',
  'worker',
  'shopkeeper',
  'gardener',
  'elder',
  'reader',
  'vendor',
  'neighbour',
  'traveller',
];
export const MIND_REGIONS = [
  'gorge',
  'terraces',
  'village',
  'shrine',
  'bridge',
  'station',
  'city',
  'farmland',
  'wetland',
  'lakeside',
  'cedar',
  'forest',
  'mountain',
  'snow',
  'alpine-lake',
  'birch',
  'autumn',
  'harbour',
];
export const TRAIN_PHASES = ['away', 'approaching', 'stopped', 'departing'];
export const MIND_EVENTS = [
  'rain-start',
  'rain-stop',
  'dusk',
  'train-approaching',
  'train-arrival',
  'doors-open',
  'crowded',
  'chat',
  'horn',
  'fast-pass',
];
export const ENTITY_ID_PATTERN = /^[a-z0-9-]{1,24}$/;
export const JEV_HOLD_SECONDS = 45;
export const MAX_DIRECTIVE_SECONDS = 300;
export const MAX_JEV_BATCH = 6;
export const MIN_INTENT_DWELL = 6;
const MAX_ENTITIES = 160;
const FORGET_AFTER = 10;
const TRAITS = ['warmth', 'patience', 'curiosity', 'sociability', 'energy'];
const WEATHERS = ['clear', 'rain', 'snow'];

// Anchor points in (valence, arousal) space for each named mood.
const MOOD_ANCHORS = {
  content: [0.4, 0.3],
  cheerful: [0.75, 0.6],
  wistful: [-0.2, 0.2],
  anxious: [-0.5, 0.75],
  impatient: [-0.35, 0.65],
  curious: [0.35, 0.55],
  tired: [-0.15, 0.1],
  irritated: [-0.6, 0.6],
  shy: [-0.05, 0.35],
};

// Game roles from population.js and regional-residents.js map onto the short whitelist.
const ROLE_MAP = {
  'office commuter': 'commuter',
  'school student': 'student',
  'market shopper': 'shopper',
  'returning resident': 'resident',
  'guesthouse visitor': 'visitor',
  'delivery worker': 'worker',
  'post carrier': 'worker',
  'vegetable gardener': 'gardener',
  'retired neighbour': 'elder',
  'retired newspaper reader': 'reader',
  'visitor carrying a market bag': 'shopper',
  'neighbour helping a visitor': 'neighbour',
  waiting: 'traveller',
  conversation: 'neighbour',
};
const ROLE_TRAITS = {
  commuter: { patience: -0.15, urgency: 0.45 },
  student: { energy: 0.2, curiosity: 0.1, urgency: 0.35 },
  shopper: { sociability: 0.1, urgency: 0.2 },
  resident: { warmth: 0.1, urgency: 0.15 },
  visitor: { curiosity: 0.25, urgency: 0.1 },
  worker: { energy: 0.1, patience: -0.1, urgency: 0.5 },
  shopkeeper: { warmth: 0.15, sociability: 0.15, urgency: 0.2 },
  gardener: { patience: 0.15, urgency: 0.15 },
  elder: { energy: -0.25, patience: 0.2, warmth: 0.1, urgency: 0.05 },
  reader: { patience: 0.2, sociability: -0.15, urgency: 0.05 },
  vendor: { sociability: 0.2, warmth: 0.1, urgency: 0.2 },
  neighbour: { warmth: 0.2, sociability: 0.2, urgency: 0.1 },
  traveller: { curiosity: 0.1, urgency: 0.35 },
};
const PHONE_ROLES = new Set(['commuter', 'student', 'visitor', 'worker', 'traveller']);
const INTENT_INDEX = Object.fromEntries(INTENTS.map((intent, i) => [intent, i]));
const scratch = new Float64Array(INTENTS.length);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round2 = (value) => Math.round(value * 100) / 100;

export function hashText(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++)
    value = Math.imul(value ^ text.charCodeAt(i), 16777619) >>> 0;
  return value >>> 0;
}
function generator(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Map a game role label onto the minds role whitelist. */
export function mindRole(raw) {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (MIND_ROLES.includes(key)) return key;
  return ROLE_MAP[key] ?? 'traveller';
}

/** Persona traits are stable for a seed and id; the role shifts them slightly. */
export function personaFor(seed, id, role) {
  const random = generator(hashText(`${seed}:${id}:persona`));
  const shift = ROLE_TRAITS[role] ?? {};
  const persona = {};
  for (const trait of TRAITS)
    persona[trait] = round2(clamp(0.2 + random() * 0.6 + (shift[trait] ?? 0), 0.05, 0.95));
  return persona;
}

/**
 * @param {{seed?:number}} [options]
 */
export function createNpcMinds({ seed = 1 } = {}) {
  const entities = new Map();
  let time = 0;
  let generation = 0;
  const world = {
    weather: 'clear',
    dusk: false,
    region: 'village',
    trainPhase: 'away',
    crowd: 0,
    departTimer: 0,
    passing: false,
    doorsOpen: false,
    trainX: NaN,
    trainZ: NaN,
    initialised: false,
  };

  function createEntity(id, rawRole) {
    const role = mindRole(rawRole);
    const persona = personaFor(seed, id, role);
    const random = generator(hashText(`${seed}:${id}:choices`));
    const baseUrgency = ROLE_TRAITS[role]?.urgency ?? 0.2;
    const entity = {
      id,
      role,
      generation: ++generation,
      persona,
      random,
      baseUrgency,
      valence: clamp(0.1 + (persona.warmth - 0.5) * 0.4, -1, 1),
      arousal: clamp(0.2 + persona.energy * 0.3, 0, 1),
      mood: 'content',
      moodTime: time,
      moodChangedAt: -Infinity,
      nextMoodCheck: time + random(),
      needs: {
        rest: 0.6 + random() * 0.35,
        social: 0.4 + random() * 0.5,
        urgency: baseUrgency,
        comfort: 0.8,
      },
      x: 0,
      z: 0,
      walking: false,
      platform: false,
      visible: true,
      activity: '',
      lastSensed: time,
      waitTime: 0,
      startleAt: -Infinity,
      neighbour: null,
      neighbourDistance: Infinity,
      localIntent: 'continue',
      intentSince: time,
      nextDecision: time + random() * 2,
      jevMood: null,
      jevIntent: null,
      jevUntil: -Infinity,
      directedMood: null,
      directedIntent: null,
      directedUntil: -Infinity,
      requested: false,
      glancePhase: random() * Math.PI * 2,
      glanceRate: 0.25 + random() * 0.35,
      expression: {
        intent: 'continue',
        mood: 'content',
        source: 'local',
        headTurn: 0,
        posture: 'upright',
        gestureRate: 0.2,
        walkSpeedScale: 1,
        lookAt: null,
      },
    };
    entities.set(id, entity);
    return entity;
  }

  const directed = (e) => time < e.directedUntil;
  const jevActive = (e) => time < e.jevUntil;
  const effectiveIntent = (e) =>
    (directed(e) && e.directedIntent) || (jevActive(e) && e.jevIntent) || e.localIntent;
  const effectiveMood = (e) =>
    (directed(e) && e.directedMood) || (jevActive(e) && e.jevMood) || e.mood;
  const sourceOf = (e) =>
    directed(e) ? 'directed' : jevActive(e) && (e.jevIntent || e.jevMood) ? 'jev' : 'local';
  const wet = () => world.weather !== 'clear';
  const nearTrain = (e) =>
    e.platform ||
    (Number.isFinite(world.trainX) && Math.hypot(e.x - world.trainX, e.z - world.trainZ) < 80);
  const sheltered = (e) =>
    effectiveIntent(e) === 'shelter' ||
    e.activity === 'at-home' ||
    e.activity.includes('shelter') ||
    e.activity.includes('eaves') ||
    e.activity.includes('doorway');

  function applyEvent(e, type, detail) {
    const p = e.persona;
    const n = e.needs;
    if (type === 'rain-start') {
      n.comfort -= 0.25;
      e.valence -= 0.05 + 0.15 * (1 - p.patience);
      e.arousal += 0.12 * (1 - p.patience);
    } else if (type === 'rain-stop') {
      n.comfort += 0.1;
      e.valence += 0.08;
    } else if (type === 'dusk') {
      e.arousal -= 0.08;
      e.valence -= 0.03;
    } else if (type === 'train-approaching') {
      if (!nearTrain(e)) return false;
      e.arousal += 0.08 + 0.1 * p.curiosity;
    } else if (type === 'train-arrival') {
      if (!e.platform) return false;
      const late = detail?.late ?? e.waitTime > 45 + p.patience * 120;
      if (late) {
        e.valence -= 0.25 * (1 - p.patience);
        e.arousal += 0.1;
      } else e.valence += e.baseUrgency > 0.3 ? 0.1 : 0.05;
    } else if (type === 'doors-open') {
      if (!e.platform) return false;
      e.arousal += 0.1;
      n.urgency += 0.2;
    } else if (type === 'crowded') {
      if (p.sociability >= 0.45) return false;
      e.valence -= 0.1;
      e.arousal += 0.05;
    } else if (type === 'chat') {
      n.social += 0.3;
      e.valence += 0.15;
    } else if (type === 'horn' || type === 'fast-pass') {
      if (type === 'fast-pass' && !nearTrain(e)) return false;
      e.arousal += 0.35 * (1 - p.patience * 0.5);
      e.valence += p.curiosity > 0.6 ? 0.05 : -0.08;
      e.startleAt = time;
    }
    clampState(e);
    return true;
  }
  function clampState(e) {
    e.valence = clamp(e.valence, -1, 1);
    e.arousal = clamp(e.arousal, 0, 1);
    const n = e.needs;
    n.rest = clamp(n.rest, 0, 1);
    n.social = clamp(n.social, 0, 1);
    n.urgency = clamp(n.urgency, 0, 1);
    n.comfort = clamp(n.comfort, 0, 1);
  }
  function broadcast(type, detail) {
    let affected = 0;
    for (const e of entities.values()) if (applyEvent(e, type, detail)) affected++;
    return affected;
  }

  function updateWorld(dt, context) {
    const weather = WEATHERS.includes(context.weather) ? context.weather : 'clear';
    const dusk = Boolean(context.dusk);
    const region = MIND_REGIONS.includes(context.region) ? context.region : world.region;
    const speed = Math.abs(Number(context.trainSpeed) || 0);
    const doorsOpen = context.doorsOpen === true;
    const remaining = Number.isFinite(context.remainingToStation)
      ? context.remainingToStation
      : Infinity;
    const train = context.trainPosition;
    world.trainX = train && Number.isFinite(train.x) ? train.x : NaN;
    world.trainZ = train && Number.isFinite(train.z) ? train.z : NaN;
    let phase = 'away';
    if (doorsOpen || (speed < 0.3 && Math.abs(remaining) < 60)) phase = 'stopped';
    else if (
      (world.trainPhase === 'stopped' || world.trainPhase === 'departing') &&
      world.departTimer < 20
    )
      phase = 'departing';
    else if (remaining > 0 && remaining <= 450 && speed > 0.3) phase = 'approaching';
    world.departTimer = phase === 'departing' ? world.departTimer + dt : 0;
    if (world.initialised) {
      if (weather !== 'clear' && world.weather === 'clear') broadcast('rain-start');
      if (weather === 'clear' && world.weather !== 'clear') broadcast('rain-stop');
      if (dusk && !world.dusk) broadcast('dusk');
      if (phase === 'approaching' && world.trainPhase !== 'approaching')
        broadcast('train-approaching');
      if (phase === 'stopped' && world.trainPhase !== 'stopped') broadcast('train-arrival');
      if (doorsOpen && !world.doorsOpen) broadcast('doors-open');
    }
    const passing = Math.abs(remaining) < 40 && speed > 16;
    if (passing && !world.passing && world.initialised) broadcast('fast-pass');
    world.passing = passing;
    world.weather = weather;
    world.dusk = dusk;
    world.region = region;
    world.trainPhase = phase;
    world.doorsOpen = doorsOpen;
    const camera = context.cameraPosition;
    let crowd = 0;
    for (const e of entities.values()) {
      if (!e.visible) continue;
      if (camera && Number.isFinite(camera.x)) {
        if (Math.hypot(e.x - camera.x, e.z - camera.z) < 35) crowd++;
      } else if (e.platform) crowd++;
    }
    crowd = Math.min(20, crowd);
    if (crowd >= 8 && world.crowd < 8 && world.initialised) broadcast('crowded');
    world.crowd = crowd;
    world.initialised = true;
  }

  function findNeighbour(e) {
    let best = null;
    let bestDistance = Infinity;
    for (const other of entities.values()) {
      if (other === e || !other.visible) continue;
      const d = Math.hypot(other.x - e.x, other.z - e.z);
      if (d < bestDistance) {
        best = other;
        bestDistance = d;
      }
    }
    e.neighbour = bestDistance < 4 ? best : null;
    e.neighbourDistance = bestDistance;
  }

  function scoreIntents(e) {
    const p = e.persona;
    const n = e.needs;
    const mood = effectiveMood(e);
    const phase = world.trainPhase;
    const trainNear = phase !== 'away' && nearTrain(e);
    const boarding = e.activity === 'approaching-door' || e.activity === 'boarding';
    scratch.fill(-Infinity);
    scratch[INTENT_INDEX.continue] =
      0.8 + n.urgency * 0.8 + (e.walking ? 0.5 : 0) + (mood === 'content' ? 0.2 : 0);
    if (boarding) return;
    scratch[INTENT_INDEX.linger] =
      (1 - n.urgency) * 0.9 +
      p.curiosity * 0.4 +
      (world.dusk ? 0.2 : 0) -
      (wet() && !sheltered(e) ? 0.6 : 0) +
      (mood === 'wistful' ? 0.5 : mood === 'curious' ? 0.3 : 0);
    if (e.neighbour)
      scratch[INTENT_INDEX.chat] =
        p.sociability * 1.2 +
        (1 - n.social) +
        p.warmth * 0.3 +
        (mood === 'cheerful' ? 0.4 : mood === 'shy' ? -0.8 : mood === 'irritated' ? -0.4 : 0);
    scratch[INTENT_INDEX.hurry] =
      n.urgency * 1.6 +
      (world.doorsOpen && e.platform ? 0.8 : 0) +
      (wet() && !sheltered(e) ? (1 - n.comfort) * 0.6 : 0) -
      p.patience * 0.4 -
      0.4 +
      (mood === 'irritated' || mood === 'impatient' ? 0.3 : 0);
    if (wet())
      scratch[INTENT_INDEX.shelter] =
        (1 - n.comfort) * 1.8 + (1 - p.patience) * 0.3 + (mood === 'anxious' ? 0.4 : 0);
    if (trainNear)
      scratch[INTENT_INDEX['watch-train']] =
        p.curiosity * 1.2 +
        (phase === 'approaching' ? 0.5 : 0) +
        (e.role === 'student' || e.role === 'visitor' ? 0.3 : 0) +
        (mood === 'curious' ? 0.5 : 0);
    if (trainNear && (phase === 'approaching' || phase === 'departing'))
      scratch[INTENT_INDEX.wave] =
        p.warmth * 0.9 + (e.valence > 0.3 ? 0.4 : 0) - 0.6 + (mood === 'cheerful' ? 0.4 : 0);
    else if (e.neighbour && p.warmth > 0.6)
      scratch[INTENT_INDEX.wave] = 0.2 + (mood === 'cheerful' ? 0.4 : 0);
    scratch[INTENT_INDEX.sit] =
      (1 - n.rest) * 1.6 +
      (1 - p.energy) * 0.4 -
      n.urgency * 0.8 -
      0.4 -
      (e.walking ? 0.5 : 0) +
      (mood === 'tired' ? 0.6 : 0);
    scratch[INTENT_INDEX['check-phone']] =
      (PHONE_ROLES.has(e.role) ? 0.8 : 0.1) +
      (1 - p.sociability) * 0.4 -
      0.3 +
      (mood === 'impatient' || mood === 'anxious' || mood === 'shy' ? 0.3 : 0);
    scratch[INTENT_INDEX.stretch] =
      (1 - n.rest) * 0.8 + p.energy * 0.3 - 0.9 + (e.waitTime > 60 ? 0.5 : 0);
  }

  function intentAvailable(e, intent) {
    scoreIntents(e);
    return scratch[INTENT_INDEX[intent]] > -Infinity;
  }

  function chooseLocalIntent(e) {
    findNeighbour(e);
    const current = e.localIntent;
    scoreIntents(e);
    const currentIndex = INTENT_INDEX[current];
    const available = scratch[currentIndex] > -Infinity;
    // Minimum dwell: keep a still-valid intent so behaviour does not flicker.
    if (available && time - e.intentSince < MIN_INTENT_DWELL) return;
    if (available) scratch[currentIndex] += 0.6;
    // Softmax sampling. Calm characters are predictable; aroused ones are less so.
    const temperature = 0.35 + 0.65 * e.arousal;
    let max = -Infinity;
    for (let i = 0; i < scratch.length; i++) if (scratch[i] > max) max = scratch[i];
    let total = 0;
    for (let i = 0; i < scratch.length; i++) {
      scratch[i] = scratch[i] === -Infinity ? 0 : Math.exp((scratch[i] - max) / temperature);
      total += scratch[i];
    }
    let pick = e.random() * total;
    let chosen = 0;
    for (let i = 0; i < scratch.length; i++) {
      pick -= scratch[i];
      if (pick <= 0 && scratch[i] > 0) {
        chosen = i;
        break;
      }
    }
    const next = INTENTS[chosen];
    if (next !== current) {
      e.localIntent = next;
      e.intentSince = time;
    }
  }

  function moodScore(e, mood) {
    const [v, a] = MOOD_ANCHORS[mood];
    const p = e.persona;
    const n = e.needs;
    let bias = 0;
    if (mood === 'tired' && n.rest < 0.3) bias = 0.25;
    else if (mood === 'wistful') bias = (world.dusk ? 0.12 : 0) + (wet() ? 0.05 : 0);
    else if (mood === 'anxious' && wet() && n.comfort < 0.4 && p.patience < 0.5) bias = 0.15;
    else if (mood === 'impatient' && n.urgency > 0.6 && e.waitTime > 30) bias = 0.2;
    else if (mood === 'curious' && world.trainPhase === 'approaching' && p.curiosity > 0.55)
      bias = 0.15;
    else if (mood === 'shy' && world.crowd > 6 && p.sociability < 0.4) bias = 0.2;
    else if (mood === 'cheerful' && n.social > 0.8) bias = 0.1;
    else if (mood === 'irritated' && time - e.startleAt < 8 && p.patience < 0.4) bias = 0.15;
    return Math.hypot(e.valence - v, e.arousal - a) - bias;
  }
  function updateMood(e) {
    let best = e.mood;
    let bestScore = moodScore(e, e.mood);
    const currentScore = bestScore;
    for (const mood of MOODS) {
      const score = moodScore(e, mood);
      if (score < bestScore) {
        best = mood;
        bestScore = score;
      }
    }
    // Hysteresis: a new mood must be clearly better and the old one held for a moment.
    if (best !== e.mood && currentScore - bestScore > 0.05 && time - e.moodTime > 3) {
      e.mood = best;
      e.moodTime = time;
      e.moodChangedAt = time;
    }
  }

  function step(e, dt) {
    const p = e.persona;
    const n = e.needs;
    const intent = effectiveIntent(e);
    const isWet = wet();
    const cover = sheltered(e);
    let comfortTarget = isWet ? (cover ? 0.7 : world.weather === 'snow' ? 0.35 : 0.3) : 0.85;
    if (world.dusk) comfortTarget -= 0.05;
    n.comfort += (comfortTarget - n.comfort) * (1 - Math.exp(-dt * 0.08));
    if (e.walking) n.rest -= 0.004 * (1.3 - p.energy) * dt;
    else n.rest += (intent === 'sit' ? 0.02 : 0.004) * dt;
    n.social -= 0.003 * p.sociability * dt;
    if (e.neighbour && e.neighbourDistance < 4 && intent === 'chat') {
      n.social += 0.05 * dt;
      e.neighbour.needs.social = Math.min(1, e.neighbour.needs.social + 0.03 * dt);
    }
    e.waitTime = e.platform && !e.walking && e.visible ? e.waitTime + dt : 0;
    const phase = world.trainPhase;
    const urgencyTarget =
      e.baseUrgency +
      (e.platform && phase === 'approaching' ? 0.25 : 0) +
      (e.platform && phase === 'stopped' ? 0.35 : 0) +
      Math.min(0.2, e.waitTime / 600);
    n.urgency += (urgencyTarget - n.urgency) * (1 - Math.exp(-dt * 0.2));

    const baseValence =
      0.12 +
      0.35 * (p.warmth - 0.5) +
      0.35 * (n.comfort - 0.55) +
      0.2 * (n.social - 0.5) +
      0.2 * (n.rest - 0.5) -
      0.5 * Math.max(0, n.urgency - p.patience);
    const baseArousal = 0.2 + 0.35 * p.energy * n.rest + 0.3 * n.urgency - (world.dusk ? 0.08 : 0);
    e.valence += (baseValence - e.valence) * (1 - Math.exp(-dt * 0.05));
    e.arousal += (baseArousal - e.arousal) * (1 - Math.exp(-dt * 0.08));
    // Bounded emotional randomness: a small seeded random walk, larger for impatient people.
    const noise = 0.06 * (1.2 - p.patience) * Math.sqrt(dt);
    e.valence += (e.random() - 0.5) * noise;
    e.arousal += (e.random() - 0.5) * noise;
    const forced = (directed(e) && e.directedMood) || (jevActive(e) && e.jevMood);
    if (forced) {
      const [v, a] = MOOD_ANCHORS[forced];
      const pull = 1 - Math.exp(-dt * 0.3);
      e.valence += (v - e.valence) * pull;
      e.arousal += (a - e.arousal) * pull;
    }
    clampState(e);
    if (time >= e.nextMoodCheck) {
      e.nextMoodCheck = time + 1;
      updateMood(e);
    }
    if (time >= e.nextDecision) {
      e.nextDecision = time + 2 + e.random() * 3;
      chooseLocalIntent(e);
    } else if (e.neighbour) {
      e.neighbourDistance = Math.hypot(e.neighbour.x - e.x, e.neighbour.z - e.z);
      if (e.neighbourDistance > 5 || !e.neighbour.visible) e.neighbour = null;
    }
    if (e.localIntent === 'chat' && !e.neighbour) {
      e.localIntent = 'continue';
      e.intentSince = time;
    }
    express(e);
  }

  function express(e) {
    const x = e.expression;
    const intent = effectiveIntent(e);
    const mood = effectiveMood(e);
    const p = e.persona;
    x.intent = intent;
    x.mood = mood;
    x.source = sourceOf(e);
    const low = e.valence < -0.25 && e.arousal < 0.35;
    x.posture =
      intent === 'sit' || mood === 'tired' || mood === 'wistful' || low
        ? 'slumped'
        : (e.arousal > 0.6 && e.valence > 0.1) ||
            intent === 'hurry' ||
            intent === 'wave' ||
            (intent === 'watch-train' && mood === 'curious')
          ? 'eager'
          : 'upright';
    x.gestureRate = clamp(
      0.1 +
        e.arousal * 0.5 +
        (intent === 'chat' ? 0.35 : 0) +
        (intent === 'wave' ? 0.5 : 0) -
        (mood === 'shy' ? 0.2 : 0),
      0,
      1,
    );
    x.walkSpeedScale = clamp(
      0.85 +
        e.arousal * 0.3 +
        e.needs.urgency * 0.1 +
        (intent === 'hurry' ? 0.3 : 0) -
        (mood === 'tired' ? 0.15 : 0) -
        (intent === 'linger' ? 0.1 : 0),
      0.6,
      1.4,
    );
    x.lookAt =
      intent === 'watch-train' || (intent === 'wave' && world.trainPhase !== 'away')
        ? 'train'
        : intent === 'chat' || intent === 'wave'
          ? 'neighbour'
          : intent === 'check-phone' || mood === 'tired' || mood === 'shy'
            ? 'ground'
            : intent === 'stretch' || (mood === 'wistful' && world.dusk)
              ? 'sky'
              : mood === 'curious' && world.trainPhase !== 'away'
                ? 'train'
                : null;
    x.headTurn =
      x.lookAt === null
        ? clamp(Math.sin(time * e.glanceRate + e.glancePhase) * (0.2 + p.curiosity * 0.6), -1, 1)
        : 0;
  }

  function summary(e) {
    const until = directed(e) ? e.directedUntil : jevActive(e) ? e.jevUntil : time;
    return {
      id: e.id,
      role: e.role,
      persona: { ...e.persona },
      mood: effectiveMood(e),
      localMood: e.mood,
      valence: round2(e.valence),
      arousal: round2(e.arousal),
      needs: {
        rest: round2(e.needs.rest),
        social: round2(e.needs.social),
        urgency: round2(e.needs.urgency),
        comfort: round2(e.needs.comfort),
      },
      intent: effectiveIntent(e),
      localIntent: e.localIntent,
      source: sourceOf(e),
      expiresIn: Math.round(Math.max(0, until - time) * 10) / 10,
      visible: e.visible,
      platform: e.platform,
      activity: e.activity,
      expression: { ...e.expression, headTurn: round2(e.expression.headTurn) },
    };
  }
  const contextSnapshot = () => ({
    weather: world.weather,
    dusk: world.dusk,
    region: world.region,
    trainPhase: world.trainPhase,
    crowd: world.crowd,
  });
  const signature = () => `${world.weather}|${world.dusk}|${world.region}|${world.trainPhase}`;
  function requireEntity(id) {
    if (typeof id !== 'string' || !ENTITY_ID_PATTERN.test(id))
      throw new TypeError('entityId must be 1-24 characters of a-z, 0-9, or -.');
    const e = entities.get(id);
    if (!e) throw new Error(`No character with id ${id} is loaded.`);
    return e;
  }

  return {
    /**
     * Report where a character is. Unknown ids register lazily with a seeded persona.
     * Allocation-free for known ids so it can run every frame.
     */
    sense(id, role, x, z, walking, platform, visible, activity = '') {
      let e = entities.get(id);
      if (!e) {
        if (typeof id !== 'string' || !ENTITY_ID_PATTERN.test(id)) return;
        if (entities.size >= MAX_ENTITIES) return;
        e = createEntity(id, role);
      }
      e.x = Number.isFinite(x) ? x : e.x;
      e.z = Number.isFinite(z) ? z : e.z;
      e.walking = Boolean(walking);
      e.platform = Boolean(platform);
      e.visible = visible !== false;
      e.activity = typeof activity === 'string' ? activity : '';
      e.lastSensed = time;
    },
    /** Remove a character immediately (for example when its scenery chunk unloads). */
    forget(id) {
      return entities.delete(id);
    },
    /**
     * Advance every mind. Context: weather, dusk, region, trainSpeed (m/s), doorsOpen,
     * remainingToStation (m, signed), trainPosition {x,z}, cameraPosition {x,z}.
     */
    tick(dt, context = {}) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.25);
      time += dt;
      updateWorld(dt, context);
      for (const e of entities.values()) {
        if (time - e.lastSensed > FORGET_AFTER) {
          entities.delete(e.id);
          continue;
        }
        step(e, dt);
      }
    },
    /** Apply a named world event, optionally to a list of ids. */
    observe(event) {
      if (!event || typeof event !== 'object' || !MIND_EVENTS.includes(event.type))
        throw new TypeError(`event.type must be one of: ${MIND_EVENTS.join(', ')}.`);
      if (event.late !== undefined && typeof event.late !== 'boolean')
        throw new TypeError('event.late must be boolean.');
      const detail = event.late === undefined ? undefined : { late: event.late };
      if (event.ids === undefined) return { ok: true, affected: broadcast(event.type, detail) };
      if (!Array.isArray(event.ids) || event.ids.length > 20)
        throw new TypeError('event.ids must be an array of at most 20 ids.');
      let affected = 0;
      for (const id of event.ids) {
        const e = entities.get(id);
        if (e && applyEvent(e, event.type, detail)) affected++;
      }
      return { ok: true, affected };
    },
    /** Movement and rendering hook. Returns a live object; do not keep or mutate it. */
    expressionFor(id) {
      return entities.get(id)?.expression;
    },
    /** A directed acting note wins over Jev and local choices until it expires. */
    setDirective(id, { mood, intent, holdSeconds } = {}) {
      const e = requireEntity(id);
      if (mood === undefined && intent === undefined)
        throw new TypeError('A directive needs a mood, an intent, or both.');
      if (mood !== undefined && !MOODS.includes(mood))
        throw new TypeError(`mood must be one of: ${MOODS.join(', ')}.`);
      if (intent !== undefined && !INTENTS.includes(intent))
        throw new TypeError(`intent must be one of: ${INTENTS.join(', ')}.`);
      if (
        typeof holdSeconds !== 'number' ||
        !Number.isFinite(holdSeconds) ||
        holdSeconds < 1 ||
        holdSeconds > MAX_DIRECTIVE_SECONDS
      )
        throw new TypeError(`holdSeconds must be from 1 to ${MAX_DIRECTIVE_SECONDS}.`);
      e.directedMood = mood ?? null;
      e.directedIntent = intent ?? null;
      e.directedUntil = time + holdSeconds;
      express(e);
      return summary(e);
    },
    clearDirective(id) {
      const e = requireEntity(id);
      e.directedMood = null;
      e.directedIntent = null;
      e.directedUntil = -Infinity;
      express(e);
      return summary(e);
    },
    /** Ask for this character in the next Jev batch. */
    requestJev(id) {
      const e = requireEntity(id);
      e.requested = true;
      return { ok: true, id };
    },
    /**
     * Choose up to six salient, visible characters for one Jev request.
     * Returns null when nobody qualifies. Characters under a directive are skipped.
     */
    buildJevBatch({ camera, max = MAX_JEV_BATCH } = {}) {
      const limit = clamp(Math.floor(max) || MAX_JEV_BATCH, 1, MAX_JEV_BATCH);
      const candidates = [];
      for (const e of entities.values()) {
        if (!e.visible || directed(e)) continue;
        if (jevActive(e) && e.jevUntil - time > 10 && !e.requested) continue;
        let score = 0;
        if (camera && Number.isFinite(camera.x))
          score += Math.max(0, 1 - Math.hypot(e.x - camera.x, e.z - camera.z) / 120) * 2;
        if (time - e.moodChangedAt < 15) score += 1;
        if (e.requested) score += 3;
        if (e.platform) score += 0.3;
        if (score > 0.2) candidates.push({ e, score });
      }
      if (!candidates.length) return null;
      candidates.sort((a, b) => b.score - a.score || (a.e.id < b.e.id ? -1 : 1));
      const chosen = candidates.slice(0, limit).map(({ e }) => e);
      for (const e of chosen) e.requested = false;
      return {
        signature: signature(),
        ids: chosen.map((e) => e.id),
        generations: chosen.map((e) => e.generation),
        context: contextSnapshot(),
        entities: chosen.map((e) => ({
          id: e.id,
          role: e.role,
          mood: effectiveMood(e),
          intent: effectiveIntent(e),
          valence: round2(e.valence),
          arousal: round2(e.arousal),
          needs: {
            rest: round2(e.needs.rest),
            social: round2(e.needs.social),
            urgency: round2(e.needs.urgency),
            comfort: round2(e.needs.comfort),
          },
        })),
      };
    },
    /**
     * Accept Jev choices for a batch. Rejects everything if the world context changed,
     * and rejects any character that despawned, respawned, or became invisible.
     */
    applyJev(batch, choices) {
      if (!batch || !Array.isArray(batch.ids)) return { stale: true, accepted: [], rejected: [] };
      if (batch.signature !== signature())
        return {
          stale: true,
          accepted: [],
          rejected: batch.ids.map((id) => ({ id, reason: 'context-changed' })),
        };
      const accepted = [];
      const rejected = [];
      const list = Array.isArray(choices) ? choices.slice(0, batch.ids.length) : [];
      for (const choice of list) {
        const index = batch.ids.indexOf(choice?.id);
        if (index < 0) {
          rejected.push({ id: String(choice?.id ?? ''), reason: 'not-requested' });
          continue;
        }
        const e = entities.get(choice.id);
        if (!e || e.generation !== batch.generations[index] || !e.visible) {
          rejected.push({ id: choice.id, reason: 'despawned' });
          continue;
        }
        if (!MOODS.includes(choice.mood) || !INTENTS.includes(choice.intent)) {
          rejected.push({ id: choice.id, reason: 'invalid' });
          continue;
        }
        if (choice.intent === 'chat' && !e.neighbour) findNeighbour(e);
        e.jevMood = choice.mood;
        e.jevIntent =
          intentAvailable(e, choice.intent) || choice.intent === 'continue'
            ? choice.intent
            : 'continue';
        e.jevUntil = time + JEV_HOLD_SECONDS;
        express(e);
        accepted.push(choice.id);
      }
      return { stale: false, accepted, rejected };
    },
    getEntity(id) {
      const e = entities.get(id);
      return e ? summary(e) : null;
    },
    /** Last sensed ground position, for cameras and episode casting. */
    positionOf(id) {
      const e = entities.get(id);
      return e ? { x: e.x, z: e.z, platform: e.platform, visible: e.visible } : null;
    },
    getState() {
      return {
        time: Math.round(time * 10) / 10,
        seed,
        context: contextSnapshot(),
        count: entities.size,
        entities: [...entities.values()].map(summary),
      };
    },
  };
}
