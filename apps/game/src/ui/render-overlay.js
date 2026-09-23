import './render-overlay.css';
import { fadeOpacity } from '../rendering/render-clock.js';

/** Seconds of the closing card: fade to black, the title, a short hold. */
export const END_CARD_SECONDS = 5;

/**
 * Render-mode page furniture for shared videos: an end card on black and a title
 * overlay for poster frames. Opacity follows the render clock so the fades land on
 * exact frames. Text is set with textContent only.
 */
export function mountRenderOverlay({ root = document.body, clock }) {
  document.documentElement.classList.add('render-mode');
  const layer = document.createElement('div');
  layer.className = 'render-overlay';
  const black = document.createElement('div');
  black.className = 'render-black';
  const card = document.createElement('div');
  card.className = 'render-endcard';
  const series = document.createElement('div');
  series.className = 'render-endcard-series';
  const native = document.createElement('div');
  native.className = 'render-endcard-native';
  const episode = document.createElement('div');
  episode.className = 'render-endcard-episode';
  const next = document.createElement('div');
  next.className = 'render-endcard-next';
  const credit = document.createElement('div');
  credit.className = 'render-endcard-credit';
  card.append(series, native, episode, next, credit);
  const poster = document.createElement('div');
  poster.className = 'render-poster-title';
  const posterSeries = document.createElement('span');
  const posterTitle = document.createElement('strong');
  poster.append(posterSeries, posterTitle);
  layer.append(black, card, poster);
  root.append(layer);
  let blackFade = null;
  let cardFade = null;
  let startedAt = null;
  const api = {
    /** Starts the end card now. Returns its length in seconds. */
    endCard(text) {
      series.textContent = text.series ?? '';
      native.textContent = text.native ?? '';
      episode.textContent = text.episode ?? '';
      next.textContent = text.next ?? '';
      credit.textContent = text.credit ?? '';
      startedAt = clock.now();
      blackFade = { shown: true, changedAt: startedAt, from: 0 };
      cardFade = { shown: true, changedAt: startedAt + 900, from: 0 };
      return END_CARD_SECONDS;
    },
    /** Seconds since the end card started, or null. */
    endCardElapsed: () => (startedAt === null ? null : (clock.now() - startedAt) / 1000),
    /** Poster frames hide dialogue and show the episode title instead. */
    setPoster(enabled, text = {}) {
      posterSeries.textContent = text.series ?? '';
      posterTitle.textContent = text.title ?? '';
      document.documentElement.classList.toggle('render-poster', enabled);
    },
    tick() {
      const now = clock.now();
      black.style.opacity = blackFade ? String(fadeOpacity(blackFade, now, 1000)) : '0';
      card.style.opacity =
        cardFade && now >= cardFade.changedAt ? String(fadeOpacity(cardFade, now, 900)) : '0';
    },
    reset() {
      blackFade = cardFade = startedAt = null;
      api.tick();
    },
  };
  api.tick();
  return api;
}
