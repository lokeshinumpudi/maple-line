/** A seasonal cast for the valley, not a migration or population model. */
export const WILDLIFE_SEASONS = Object.freeze({
  spring: Object.freeze({
    secondaryFish: 'medaka',
    secondaryBird: 'kingfisher',
    companion: 'japanese-squirrel',
    companions: 6,
    fish: 'yamame',
    fishSpeed: 1,
    fishDepth: 0.42,
    bird: 'japanese-white-eye',
    mammal: 'japanese-hare',
    mammals: 8,
    deer: 6,
  }),
  summer: Object.freeze({
    secondaryFish: 'koi',
    secondaryBird: 'kingfisher',
    companion: 'pond-turtle',
    companions: 6,
    fish: 'ayu',
    fishSpeed: 1.3,
    fishDepth: 0.36,
    bird: 'barn-swallow',
    mammal: 'tanuki',
    mammals: 6,
    deer: 4,
  }),
  autumn: Object.freeze({
    secondaryFish: 'koi',
    secondaryBird: 'mandarin-duck',
    companion: 'wild-boar',
    companions: 6,
    fish: 'oikawa',
    fishSpeed: 0.85,
    fishDepth: 0.42,
    bird: 'varied-tit',
    mammal: null,
    mammals: 0,
    deer: 12,
  }),
  winter: Object.freeze({
    secondaryFish: 'yamame',
    secondaryBird: 'mandarin-duck',
    companion: 'japanese-macaque',
    companions: 6,
    fish: 'iwana',
    fishSpeed: 0.35,
    fishDepth: 0.8,
    bird: 'long-tailed-tit',
    mammal: 'red-fox',
    mammals: 6,
    deer: 4,
  }),
});

export function wildlifeSeason(season) {
  if (!Object.hasOwn(WILDLIFE_SEASONS, season)) throw new TypeError('Invalid wildlife season');
  return WILDLIFE_SEASONS[season];
}
