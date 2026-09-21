// Each invitation varies settings the valley can actually build. The story is atmosphere.
export const WORLD_INVITATIONS = Object.freeze([
  'Spring has written a letter in pink. A few blossom trees lean into a clear afternoon, with low village rooftops scattered through the open valley.',
  'The forest is holding its breath before night. Snow settles among dense winter evergreens; a little village disappears into the blue of dusk.',
  'Take the long way home through a copper-coloured autumn. Thick woodland, small village roofs, and a clear dusk that nobody is in a hurry to leave.',
  'A city at the end of a green day. Summer trees grow thick beside the railway, tall rooftops gather in the distance, and rain softens everything into dusk.',
  'Almost nothing between us and the afternoon. A sparse winter woodland, low country roofs, clear skies, and room for the eye to wander.',
  'Pink blossom, grey rain, the last train feeling. A dense spring forest around a small town, with dusk arriving before anyone has finished looking.',
  'The valley looks like an old postcard left in the sun. Scattered autumn trees, modest village roofs, and a cloudless afternoon.',
  'A green room with the roof taken off. Dense summer woodland around a tiny rural village, all of it bright beneath a clear afternoon sky.',
  'Winter has borrowed the city for an evening. Snow falls past tall rooftops and scattered evergreens as the sky turns blue at dusk.',
  'The town has gone quiet to listen to the rain. Balanced autumn woodland, close-set town rooftops, and a slow, grey afternoon.',
  'A handful of pink trees and a city too far away to hurry us. Sparse spring woodland, tall city roofs on the horizon, clear skies at dusk.',
  'Summer rain with nowhere you need to be. A few green trees, low village roofs, an open valley, and the soft light of afternoon.',
  'Copper leaves crowd the edge of town. A dense autumn forest meets tall city rooftops beneath clear daylight; let the railway find the way through.',
  'Snow has made a small town smaller. Balanced winter woodland, modest town roofs, and flakes drifting through the afternoon light.',
  'The whole hillside seems to remember spring at once. Dense pink blossom, low country rooftops, and a clear afternoon that feels newly made.',
  'Keep the windows full of green until the day runs out. Balanced summer woodland around a small town beneath the clear blue of dusk.',
  'A few autumn trees stand like commas in the rain. An open valley, tall city roofs, and a rainy dusk with plenty of pauses.',
  'An evergreen afternoon, rinsed by rain. Dense winter woodland, a small village close to the railway, and a daylight sky the colour of pewter.',
  'Spring arrives quietly in the city. Balanced blossom woodland, tall rooftops, and rain falling through the pale afternoon.',
  'Leave a little space for the evening. Sparse summer trees, a small town, and clear dusk over an open green valley.',
  'A village folded into the last page of autumn. Balanced copper woodland, low rural roofs, and rain carrying the afternoon towards dusk.',
  'A winter town between dark trees and a pale sky. Dense evergreens, clustered town roofs, and a clear dusk without falling snow.',
  'The rain has found the smallest village on the line. Sparse spring blossom, low rural roofs, and a wet afternoon with nothing to rush towards.',
  'Green trees, grey rooftops, a city on its day off. Balanced summer woodland around a tall skyline beneath clear afternoon skies.',
]);

/** A shuffled deck: every scene appears once before any repeats, including at the boundary. */
export function createInvitationDeck(random = Math.random) {
  let remaining = [];
  let previous;
  return () => {
    if (!remaining.length) {
      remaining = [...WORLD_INVITATIONS];
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      if (remaining.at(-1) === previous)
        [remaining[0], remaining[remaining.length - 1]] = [remaining.at(-1), remaining[0]];
    }
    previous = remaining.pop();
    return previous;
  };
}
