/**
 * Who looks like what. Every person gets a look from a seed made of their id, so the same
 * person looks the same on every visit and in every render; role, age, region, season
 * and weather narrow the choice (coats and umbrellas in rain or snow, straw hats in summer
 * fields, uniforms on students and station staff). Named story and drama roles have fixed
 * looks in NAMED_LOOKS below.
 *
 * A look is plain data: { body, hair, outfit, accessories, colors, scale }. `colors` maps
 * palette slots (kit-spec.json) to sRGB hex. Nothing here touches three.js.
 */
import { ACCESSORIES, BODY_IDS, bodySpec } from './kit.js';

/** FNV-1a, the hash regional-residents.js uses for its own variation. */
export function hashString(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** A small deterministic generator (mulberry32) for one person's choices. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (random, list) => list[Math.floor(random() * list.length) % list.length];

export const SKIN = ['#f6dcc8', '#f0d0b4', '#eccaa8', '#e6c2a0', '#dcb08c', '#f3d6c0'];
const HAIR_YOUNG = ['#2a2024', '#1e1a1c', '#3a2a24', '#4a3428', '#2e2a30', '#5a4030', '#6a4a34'];
const HAIR_OLD = ['#c9c4bc', '#b0aaa2', '#d8d4cc', '#8a847c', '#9a948a'];
const IRIS = ['#5a3524', '#3a2a22', '#4a3a2e', '#2e2420', '#5a4632'];
const DARK = ['#2a2c36', '#3a3230', '#23252c'];

/** Clothing colours per outfit; each entry picks one value per slot. */
const OUTFIT_COLORS = {
  suit: {
    top: ['#3a4150', '#2c3240', '#4a4a52', '#34384a', '#50504e'],
    lower: ['#343844', '#2c2e36', '#44444a'],
    inner: ['#eef0f2', '#e4ecf2', '#f2eee6'],
    accent: ['#2f4f7a', '#7a2f3a', '#4a5a3a', '#6a5a8a', '#8a6a3a'],
    shoes: ['#1c1a1a', '#3a2a22'],
  },
  'office-f': {
    top: ['#c8b8a4', '#8a9ab0', '#5a6a80', '#d8c8c0', '#6a5a70', '#a4b0a0'],
    inner: ['#f4f1ea', '#eee8f0'],
    lower: ['#3f4660', '#5a5048', '#2c3552', '#6a6a70'],
    legwear: ['#3a3230', '#d8c0a8', '#2a2c36'],
    shoes: ['#2a2020', '#4a2f24'],
  },
  sailor: {
    top: ['#2c3552', '#263048'],
    inner: ['#f4f1ea'],
    lower: ['#2c3552', '#3f4660'],
    accent: ['#c0303a', '#2f4f7a', '#b85a3a'],
    legwear: ['#262a38', '#f0eee8', '#1e1e24'],
    shoes: ['#4a2f24', '#1e1a1a'],
  },
  gakuran: {
    top: ['#1e2028', '#22262e'],
    lower: ['#1e2028', '#22262e'],
    shoes: ['#1c1a1a'],
  },
  'cardigan-school': {
    top: ['#d8c8a8', '#e8e0d0', '#7a8a9a', '#3a4a6a'],
    inner: ['#f4f1ea'],
    lower: ['#3f6a6a', '#3f4660', '#5a4050'],
    accent: ['#3f7a7a', '#c0303a', '#2f4f7a'],
    legwear: ['#262a38', '#f0eee8'],
    shoes: ['#4a2f24'],
  },
  casual: {
    top: ['#d05a4a', '#4a8ab0', '#e0c060', '#6a9a6a', '#f0f0e8', '#8a6aa0'],
    lower: ['#3a4a6a', '#5a5048', '#2a2a30', '#8a7a60'],
    shoes: ['#e8e8e4', '#3a3a3a', '#6a4a3a'],
  },
  'casual-f': {
    top: ['#e8d8c0', '#c89a8a', '#9ab0c0', '#b0c09a', '#e0b0a0'],
    lower: ['#6a5a48', '#3a4a5a', '#8a7a6a', '#5a6a58'],
    legwear: ['#d8c0a8', '#3a3230'],
    shoes: ['#6a4a3a', '#2a2020'],
  },
  work: {
    top: ['#4a5a6a', '#6a6a52', '#5a4a3a', '#34405a', '#7a6a4a'],
    lower: ['#3a3a38', '#4a4438', '#50505a'],
    shoes: ['#2a2622', '#3a3028'],
  },
  farmer: {
    top: ['#6a7a52', '#8a7a5a', '#4a6a7a', '#a08a6a', '#5a7a9a'],
    lower: ['#4a4a5a', '#5a4a3a', '#3a4a4a'],
    shoes: ['#2a3a2a', '#3a3a40', '#6a4a2a'],
  },
  apron: {
    top: ['#c8a050', '#8aa0a0', '#a06a5a', '#6a7a8a', '#e8dcc4'],
    apron: ['#f0e8d8', '#e0ceb0', '#a0443a', '#3a4a5a'],
    lower: ['#4a4a50', '#5a4a3a'],
    shoes: ['#2a2622', '#4a3a30'],
  },
  staff: {
    top: ['#2a3450'],
    lower: ['#2a3450'],
    inner: ['#f4f4f2'],
    accent: ['#2a3450', '#6a2a2a'],
    shoes: ['#161414'],
    hat: ['#2a3450'],
    hatBand: ['#c8a040'],
  },
  coat: {
    top: ['#7a6a5a', '#3a3a40', '#5a4a3a', '#4a5a6a', '#8a4a3a', '#6a7a6a'],
    inner: ['#e8e4dc', '#c8b8a4'],
    lower: ['#343844', '#3a3a38', '#4a4438'],
    legwear: ['#2a2c36'],
    shoes: ['#2a2020', '#3a2a22'],
  },
  cardigan: {
    top: ['#8a6a4a', '#6a7a6a', '#7a6a7a', '#9a8a6a'],
    inner: ['#e6e0d2', '#dcdcd4'],
    lower: ['#5a5854', '#4a4a48', '#6a6050'],
    shoes: ['#3e2e24', '#2a2622'],
  },
  'cardigan-skirt': {
    top: ['#b08aa0', '#8a9ab0', '#a09070', '#c0a890', '#7a8a7a'],
    inner: ['#ece6da'],
    lower: ['#4a4a58', '#5a4a4a', '#6a5a50'],
    legwear: ['#8a7a70', '#4a4038'],
    shoes: ['#3e2e24'],
  },
  'kid-casual': {
    top: ['#e06a4a', '#4a9ae0', '#f0c040', '#6ac06a', '#e080a0'],
    lower: ['#3a4a7a', '#6a5a40', '#2a2a30'],
    legwear: ['#f0f0f0', '#e0d8c8'],
    shoes: ['#e8e8e4', '#d05a4a', '#3a4a7a'],
  },
  'kid-school': {
    top: ['#a8c8e0', '#e8e4d8'],
    inner: ['#f4f4f2'],
    lower: ['#2c3552'],
    legwear: ['#f0f0f0'],
    shoes: ['#e8e8e4'],
    hat: ['#f0c830'],
  },
  'kid-coat': {
    top: ['#d05a4a', '#4a7ab0', '#e0b040', '#6a9a6a'],
    lower: ['#2a2a30', '#3a4a7a'],
    shoes: ['#3a3a3a'],
  },
};

const ACCESSORY_COLORS = {
  hat: ['#2a3450', '#b83a2a', '#e8e4d8', '#4a6a4a', '#5a5a5a'],
  hatBand: ['#7a3a2a', '#2a3a5a', '#4a6a3a'],
  bag: ['#8a5a3a', '#3a3a3a', '#5a4a3a', '#6a3a3a', '#4a5a6a'],
  frame: ['#3a302a', '#8a7a6a', '#2a2a2a'],
  umbrella: ['#5f8fb0', '#ece8e0', '#b84a4a', '#4a4a52', '#6aa06a', '#e0c060', '#2a3450'],
  scarf: ['#c77a3a', '#b83a3a', '#4a5a7a', '#e8e0d0', '#6a8a5a', '#8a5a7a'],
  metal: ['#9a9a9a', '#6a6a6a'],
};

/** Role words people and residents carry, mapped to a crowd role. */
const ROLE_WORDS = [
  ['station staff', 'staff'],
  ['conductor', 'staff'],
  ['driver', 'staff'],
  ['student', 'student'],
  ['school', 'student'],
  ['child', 'child'],
  ['kid', 'child'],
  ['farmer', 'farmer'],
  ['gardener', 'farmer'],
  ['grower', 'farmer'],
  ['shopkeeper', 'shopkeeper'],
  ['vendor', 'vendor'],
  ['kiosk', 'vendor'],
  ['market', 'shopper'],
  ['shopper', 'shopper'],
  ['delivery', 'worker'],
  ['post', 'worker'],
  ['carrier', 'worker'],
  ['retired', 'elder'],
  ['elder', 'elder'],
  ['reader', 'elder'],
  ['tourist', 'tourist'],
  ['visitor', 'tourist'],
  ['office', 'commuter'],
  ['commuter', 'commuter'],
  ['waiting', 'commuter'],
  ['conversation', 'neighbour'],
  ['resident', 'neighbour'],
  ['neighbour', 'neighbour'],
];

export function roleKey(role = '') {
  const text = String(role).toLowerCase();
  for (const [word, key] of ROLE_WORDS) if (text.includes(word)) return key;
  return 'neighbour';
}

/** Body and outfit choices per role: [body, [outfits...]] with weights. */
const ROLE_BODIES = {
  commuter: [
    ['adult-m', ['suit'], 4],
    ['adult-f', ['office-f'], 4],
    ['teen', ['sailor', 'gakuran'], 1],
  ],
  student: [
    ['teen', ['sailor', 'gakuran', 'cardigan-school'], 6],
    ['child', ['kid-school'], 1],
  ],
  child: [['child', ['kid-casual', 'kid-school'], 1]],
  elder: [
    ['elder-f', ['cardigan-skirt'], 1],
    ['elder-m', ['cardigan'], 1],
  ],
  farmer: [
    ['elder-m', ['farmer'], 3],
    ['elder-f', ['farmer'], 3],
    ['adult-m', ['work'], 2],
  ],
  shopkeeper: [
    ['adult-f', ['apron'], 3],
    ['elder-f', ['apron'], 2],
    ['adult-m', ['work'], 1],
  ],
  vendor: [
    ['adult-f', ['apron'], 2],
    ['elder-f', ['apron'], 2],
  ],
  shopper: [
    ['adult-f', ['casual-f'], 3],
    ['elder-f', ['cardigan-skirt'], 2],
    ['adult-m', ['work'], 1],
  ],
  worker: [['adult-m', ['work'], 1]],
  staff: [
    ['adult-m', ['staff'], 3],
    ['elder-m', ['staff'], 1],
  ],
  tourist: [
    ['adult-f', ['casual-f'], 2],
    ['adult-m', ['work'], 1],
    ['teen', ['casual'], 2],
  ],
  neighbour: [
    ['adult-f', ['casual-f', 'office-f'], 2],
    ['adult-m', ['work', 'suit'], 2],
    ['elder-f', ['cardigan-skirt', 'apron'], 2],
    ['elder-m', ['cardigan'], 2],
    ['teen', ['casual', 'cardigan-school'], 1],
    ['child', ['kid-casual'], 1],
  ],
};

/** Hair that sits under a hat without strands poking through. */
const HAT_HAIR = new Set(['short', 'buzz', 'elder-thin', 'low-ponytail', 'bob', 'side-part']);
/** Hair a body wears for a gender or age cue; child and teen bodies have both. */
const HAIR_BY_OUTFIT = {
  gakuran: ['short', 'side-part'],
  sailor: ['bob', 'ponytail', 'long'],
  'cardigan-school': ['bob', 'ponytail', 'long'],
  'kid-casual': null,
  'kid-school': null,
};

function weighted(random, options) {
  const total = options.reduce((sum, option) => sum + option[2], 0);
  let roll = random() * total;
  for (const option of options) {
    roll -= option[2];
    if (roll <= 0) return option;
  }
  return options[options.length - 1];
}

function bodyFromAge(age) {
  if (!Number.isFinite(age)) return null;
  if (age < 13) return 'child';
  if (age < 20) return 'teen';
  return null;
}

/**
 * The generated look for one person.
 * @param {object} person
 * @param {string} person.id stable id (the seed)
 * @param {string} [person.role] simulation role text ('office commuter', 'reader', ...)
 * @param {number} [person.age]
 * @param {string} [person.region] 'forest' | 'city' | station theme
 * @param {string} [person.season] 'spring' | 'summer' | 'autumn' | 'winter'
 * @param {string} [person.weather] 'clear' | 'rain' | 'snow'
 * @param {boolean} [person.indoors] seated in a carriage: no umbrella
 * @param {boolean} [person.seated]
 */
export function generateLook(person) {
  const seed = hashString(person.id);
  const random = seededRandom(seed);
  const role = roleKey(person.role);
  let options = ROLE_BODIES[role] ?? ROLE_BODIES.neighbour;
  const byAge = bodyFromAge(person.age);
  if (byAge) options = ROLE_BODIES[byAge === 'child' ? 'child' : 'student'];
  else if (Number.isFinite(person.age) && person.age >= 60) {
    const elder = options.filter(([body]) => body.startsWith('elder'));
    options = elder.length ? elder : ROLE_BODIES.elder;
  }
  const [body, outfits] = weighted(random, options);
  const spec = bodySpec(body);
  let outfit = pick(random, outfits);
  const weather = person.weather ?? 'clear';
  const season = person.season ?? 'autumn';
  const wet = weather === 'rain' || weather === 'snow';
  const cold = weather === 'snow' || season === 'winter';
  // Coats in the cold and some in the rain, over whatever the role wears.
  const coat = body === 'child' ? 'kid-coat' : 'coat';
  if (spec.outfits.includes(coat) && outfit !== 'staff') {
    const chance = weather === 'snow' ? 0.8 : cold ? 0.5 : weather === 'rain' ? 0.3 : 0;
    if (random() < chance) outfit = coat;
  }
  const hairChoices = (HAIR_BY_OUTFIT[outfit] ?? spec.hair).filter((h) => spec.hair.includes(h));
  let hair = pick(random, hairChoices.length ? hairChoices : spec.hair);
  const accessories = [];
  const hatRoll = random();
  if (outfit === 'staff') accessories.push('cap');
  else if (outfit === 'kid-school') accessories.push('cap', 'backpack');
  else if (role === 'farmer' && !wet)
    accessories.push(season === 'summer' || hatRoll < 0.6 ? 'straw-hat' : 'cap');
  else if (role === 'worker' && hatRoll < 0.6) accessories.push('cap');
  else if (role === 'tourist' && season === 'summer' && hatRoll < 0.5) accessories.push('straw-hat');
  else if (hatRoll < 0.08) accessories.push('cap');
  if (accessories.some((a) => a === 'cap' || a === 'straw-hat') && !HAT_HAIR.has(hair)) {
    const safe = spec.hair.filter((h) => HAT_HAIR.has(h));
    if (safe.length) hair = pick(random, safe);
  }
  const ageLike = body.startsWith('elder') ? 0.5 : body === 'child' ? 0.02 : 0.2;
  if (random() < ageLike) accessories.push('glasses');
  if (['commuter', 'tourist', 'worker', 'shopper'].includes(role) && random() < 0.55)
    accessories.push(role === 'student' ? 'backpack' : 'shoulder-bag');
  if (role === 'student' && body === 'teen' && random() < 0.5) accessories.push('shoulder-bag');
  if (cold && random() < 0.7) accessories.push('scarf');
  else if (role === 'farmer' && random() < 0.5) accessories.push('scarf');
  if (wet && !person.indoors && !person.seated && random() < 0.65) accessories.push('umbrella');
  const colors = paletteFor(random, { body, outfit, accessories });
  // Height variation within the body type: a few percent either way.
  const scale = 0.96 + random() * 0.08;
  return finish({ id: person.id, body, hair, outfit, accessories, colors, scale, role });
}

function paletteFor(random, { body, outfit, accessories }) {
  const elder = body.startsWith('elder');
  const skin = pick(random, SKIN);
  const hair = pick(random, elder ? HAIR_OLD : HAIR_YOUNG);
  const iris = pick(random, IRIS);
  const colors = {
    skin,
    hair,
    iris,
    top: '#6a6a6a',
    inner: '#eeeeee',
    lower: '#44444a',
    legwear: pick(random, DARK),
    shoes: '#2a2622',
    accent: '#8a3a3a',
  };
  for (const [slot, list] of Object.entries(OUTFIT_COLORS[outfit] ?? {}))
    colors[slot] = pick(random, list);
  for (const [slot, list] of Object.entries(ACCESSORY_COLORS))
    if (!colors[slot]) colors[slot] = pick(random, list);
  if (accessories.includes('straw-hat')) colors.hat = '#d8c07a';
  colors.apron ??= '#f0e8d8';
  return colors;
}

/** Fill the face and derived colours so every slot has a value. */
function finish(look) {
  const c = { ...look.colors };
  const elder = look.body.startsWith('elder');
  c.eyeWhite ??= '#fbf8f4';
  c.iris ??= '#5a3524';
  c.irisLight ??= mixHex(c.iris, '#e0a070', 0.45);
  c.pupil ??= '#1a1012';
  c.glint ??= '#ffffff';
  c.line ??= elder ? '#3a302c' : '#2a1a1a';
  c.brow ??= mixHex(c.hair, '#1a1414', elder ? 0.1 : 0.35);
  c.mouth ??= look.body === 'adult-m' || look.body === 'elder-m' ? '#9a5a52' : '#b8505a';
  // Blush and the nose shadow were see-through decals on the hero VRMs: pre-mix them.
  c.blush = mixHex(c.skin, c.blush ?? '#f08a8a', 0.35);
  c.nose = mixHex(c.skin, scaleHex(c.skin, 0.82), 0.45);
  c.metal ??= '#9a9a9a';
  c.hat ??= '#2a3450';
  c.hatBand ??= '#7a3a2a';
  c.bag ??= '#8a5a3a';
  c.frame ??= '#3a302a';
  c.umbrella ??= '#5f8fb0';
  c.scarf ??= '#c77a3a';
  c.apron ??= '#f0e8d8';
  return Object.freeze({
    ...look,
    accessories: Object.freeze([...new Set(look.accessories)].filter((a) => ACCESSORIES.includes(a))),
    colors: Object.freeze(c),
  });
}

export function mixHex(a, b, t) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  return toHex(pa.map((v, i) => v + (pb[i] - v) * t));
}

function scaleHex(a, k) {
  return toHex(parseHex(a).map((v) => v * k));
}

function parseHex(hex) {
  const value = String(hex).replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
}

function toHex(rgb) {
  return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Fixed looks for named roles in the route story and the drama episodes. Anything left out
 * (scale, some colours) is filled the same way as a generated look. Add a role here and
 * give its entity id to the crowd (`crowd.castRole(entity, role)`) or to the story stage.
 */
export const NAMED_LOOKS = Object.freeze({
  // Route story (narrative/story-data.js). Haru narrates; Emi records the service.
  haru: {
    name: 'Haru Morita',
    body: 'elder-m',
    hair: 'short',
    outfit: 'staff',
    accessories: ['cap', 'shoulder-bag'],
    // docs/STORY-ART.md: navy railway work jacket and cap, grey at the sides, leather bag.
    colors: {
      hair: '#a8a49c',
      skin: '#e6c2a0',
      iris: '#3e3028',
      top: '#3d4d60',
      lower: '#3f4547',
      hat: '#34405a',
      bag: '#786047',
    },
    scale: 1.0,
    // Hand props in the socket frame (asset-src/characters/crowd-kit/build.py --props).
    props: 'models/characters/props/story-haru.glb',
  },
  emi: {
    name: 'Emi',
    body: 'teen',
    hair: 'bob',
    outfit: 'cardigan-school',
    accessories: ['shoulder-bag'],
    // The story art's rust jacket over a pale blouse, dark below, teal ribbon.
    colors: {
      hair: '#2e2226',
      top: '#a3573c',
      inner: '#e8e0d0',
      lower: '#3a4250',
      accent: '#3f7a7a',
      legwear: '#2a2c36',
      bag: '#68715b',
      skin: '#f6dcc8',
    },
    scale: 0.97,
    props: 'models/characters/props/story-emi.glb',
  },
  nao: {
    name: 'Nao',
    body: 'adult-f',
    hair: 'low-ponytail',
    outfit: 'apron',
    accessories: [],
    colors: { hair: '#413831', top: '#c8a050', apron: '#f0ece4', lower: '#4a4a50' },
  },
  jun: {
    name: 'Jun',
    body: 'adult-m',
    hair: 'short',
    outfit: 'work',
    accessories: ['straw-hat', 'scarf'],
    colors: {
      hair: '#7a5a3e',
      top: '#61735b',
      lower: '#464f3f',
      shoes: '#80765c',
      scarf: '#ece8dc',
      skin: '#dcb08c',
    },
  },
  endo: {
    name: 'Mr. Endo',
    body: 'elder-m',
    hair: 'elder-thin',
    outfit: 'cardigan',
    accessories: ['glasses'],
    colors: { hair: '#bab7a9', top: '#79756c', inner: '#ddd4bc', lower: '#4a4a48' },
  },
  fumi: {
    name: 'Fumi',
    body: 'elder-f',
    hair: 'short',
    outfit: 'farmer',
    accessories: [],
    colors: { hair: '#b5b7af', top: '#5a7a9a', lower: '#3a3a40', shoes: '#2a2622' },
    props: 'models/characters/props/story-fumi.glb',
  },
  yuta: {
    name: 'Yuta',
    body: 'adult-m',
    hair: 'low-ponytail',
    outfit: 'work',
    accessories: [],
    colors: { hair: '#231d1f', top: '#34405a', lower: '#5a4a3a' },
    props: 'models/characters/props/story-yuta.glb',
  },
  mika: {
    name: 'Mika',
    body: 'adult-f',
    hair: 'low-ponytail',
    outfit: 'apron',
    accessories: ['scarf'],
    colors: { hair: '#504136', top: '#e8dcc4', apron: '#a0443a', scarf: '#b8c2ad', lower: '#4a4438' },
    props: 'models/characters/props/story-mika.glb',
  },
  keiko: {
    name: 'Keiko',
    body: 'elder-f',
    hair: 'bob',
    outfit: 'apron',
    accessories: [],
    colors: { hair: '#b0aaa2', top: '#5a6a80', apron: '#8a7a6a', lower: '#4a4a50' },
  },
  son: {
    name: 'Haru’s son',
    body: 'adult-m',
    hair: 'side-part',
    outfit: 'suit',
    accessories: ['shoulder-bag'],
    colors: { hair: '#221c1c', top: '#4a4a52', accent: '#4a5a3a' },
  },
  // The 17:42 (drama/series/the-1742.js). Riko, Mr. Sato and Mr. Ishida keep their own
  // VRMs at Momiji; these looks dress whoever plays them elsewhere (Riko at Aonuma).
  riko: {
    name: 'Riko',
    body: 'teen',
    hair: 'ponytail',
    outfit: 'sailor',
    accessories: [],
    colors: {
      hair: '#2a2024',
      top: '#2c3552',
      lower: '#3f4660',
      accent: '#c0303a',
      legwear: '#262a38',
      shoes: '#4a2f24',
      skin: '#f6dcc8',
    },
  },
  sato: {
    name: 'Mr. Sato',
    body: 'adult-m',
    hair: 'side-part',
    outfit: 'suit',
    accessories: ['shoulder-bag'],
    colors: { hair: '#1e1a1c', top: '#3a4150', lower: '#343844', accent: '#2f4f7a' },
  },
  ishida: {
    name: 'Mr. Ishida',
    body: 'elder-m',
    hair: 'elder-thin',
    outfit: 'cardigan',
    accessories: ['glasses'],
    colors: { hair: '#c9c4bc', top: '#8a6a4a', lower: '#5a5854', inner: '#e6e0d2' },
  },
  fusae: {
    name: 'Fusae',
    body: 'elder-f',
    hair: 'bun',
    outfit: 'cardigan-skirt',
    accessories: ['glasses'],
    colors: { hair: '#d8d4cc', top: '#7a8a7a', lower: '#4a4a58' },
  },
  aoi: {
    name: 'Mrs. Hara',
    body: 'adult-f',
    hair: 'bun',
    outfit: 'apron',
    accessories: [],
    colors: { hair: '#3a2a24', top: '#8aa0a0', apron: '#3a4a5a', lower: '#4a4a50' },
  },
  tanabe: {
    name: 'Mr. Tanabe',
    body: 'adult-m',
    hair: 'short',
    outfit: 'work',
    accessories: ['glasses', 'shoulder-bag'],
    colors: { hair: '#2a2426', top: '#4a5a6a', lower: '#3a3a38' },
  },
  'bus-driver': {
    name: 'Bus driver',
    body: 'adult-m',
    hair: 'short',
    outfit: 'staff',
    accessories: ['cap', 'glasses'],
    colors: { top: '#3a4a3a', lower: '#3a4a3a', hat: '#3a4a3a', hatBand: '#d8d4cc' },
  },
});

/** Role ids the table knows, including aliases a drama may use for the bus driver. */
const ROLE_ALIASES = { busdriver: 'bus-driver', bus_driver: 'bus-driver', driver: 'bus-driver' };

export function namedLook(role, overrides = {}) {
  const key = NAMED_LOOKS[role] ? role : ROLE_ALIASES[role];
  const entry = key && NAMED_LOOKS[key];
  if (!entry) return null;
  const base = generateLook({ id: `named:${key}`, role: 'neighbour' });
  const body = entry.body && BODY_IDS.includes(entry.body) ? entry.body : base.body;
  const spec = bodySpec(body);
  return finish({
    id: `named:${key}`,
    role: key,
    named: key,
    name: entry.name,
    body,
    hair: spec.hair.includes(entry.hair) ? entry.hair : spec.hair[0],
    outfit: spec.outfits.includes(entry.outfit) ? entry.outfit : spec.outfits[0],
    accessories: entry.accessories ?? [],
    colors: { ...paletteFor(seededRandom(hashString(key)), { body, outfit: entry.outfit, accessories: [] }), ...entry.colors, ...overrides.colors },
    scale: entry.scale ?? 1,
    props: entry.props ?? null,
  });
}

/** The look for a person: a named role when cast, otherwise the generated one. */
export function lookFor(person) {
  if (person.named) {
    const named = namedLook(person.named);
    if (named) return named;
  }
  return generateLook(person);
}
