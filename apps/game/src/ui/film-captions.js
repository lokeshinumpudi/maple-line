import './film-captions.css';

/**
 * On-screen film text: a lower-third place card, a narration line and a
 * centred title card. Text is set with textContent only; agent captions are
 * data, never markup.
 */
export function mountFilmCaptions(root = document.body) {
  const layer = document.createElement('div');
  layer.className = 'film-captions';
  layer.setAttribute('aria-live', 'polite');
  const place = document.createElement('div');
  place.className = 'film-place';
  const title = document.createElement('div');
  title.className = 'film-place-title';
  const titleText = document.createElement('b');
  titleText.style.fontWeight = 'inherit';
  const titleNative = document.createElement('span');
  title.append(titleText, titleNative);
  const rule = document.createElement('div');
  rule.className = 'film-place-rule';
  const subtitle = document.createElement('div');
  subtitle.className = 'film-place-subtitle';
  place.append(title, rule, subtitle);
  const line = document.createElement('p');
  line.className = 'film-line';
  const lineSpeaker = document.createElement('span');
  lineSpeaker.className = 'film-speaker';
  const lineText = document.createElement('span');
  line.append(lineSpeaker, lineText);
  const setLine = (value, { speaker = '', phone = false } = {}) => {
    lineSpeaker.textContent = speaker;
    lineText.textContent = value;
    line.classList.toggle('is-phone', phone);
  };
  const card = document.createElement('div');
  card.className = 'film-title';
  const barTop = document.createElement('div');
  const barBottom = document.createElement('div');
  barTop.className = 'film-bar film-bar-top';
  barBottom.className = 'film-bar film-bar-bottom';
  const note = document.createElement('div');
  note.className = 'film-note';
  note.setAttribute('role', 'status');
  layer.append(barTop, barBottom, place, line, card, note);
  root.append(layer);
  const timers = new Map();
  function show(element, seconds) {
    clearTimeout(timers.get(element));
    requestAnimationFrame(() => element.classList.add('is-shown'));
    timers.set(
      element,
      setTimeout(() => element.classList.remove('is-shown'), Math.max(1.5, seconds) * 1000),
    );
  }
  let titleUntil = 0;
  let deferred = 0;
  const api = {
    /** caption: { kind: 'place'|'shot'|'title'|'end', title, native, subtitle, line, seconds } */
    show(caption) {
      const seconds = caption.seconds ?? 6;
      if (caption.kind === 'note') {
        note.textContent = caption.text ?? '';
        if (caption.text) show(note, seconds);
        return;
      }
      if (caption.kind === 'dialogue') {
        const wait = titleUntil - performance.now();
        if (wait > 0) {
          setTimeout(() => api.show(caption), wait + 250);
          return;
        }
        setLine(caption.text, { speaker: caption.speaker ?? '', phone: Boolean(caption.phone) });
        show(line, seconds);
        return;
      }
      if (caption.kind === 'title' || caption.kind === 'end') {
        if (!caption.title) return;
        card.textContent = caption.kind === 'end' ? `${caption.title} · end` : caption.title;
        show(card, seconds);
        if (caption.kind === 'title') titleUntil = performance.now() + seconds * 1000;
        return;
      }
      // Shot captions wait for a sequence title card to clear.
      const wait = titleUntil - performance.now();
      if (wait > 0) {
        clearTimeout(deferred);
        deferred = setTimeout(() => api.show(caption), wait + 250);
        return;
      }
      if (caption.title) {
        titleText.textContent = caption.title;
        titleNative.textContent = caption.native ?? '';
        subtitle.textContent = caption.subtitle ?? '';
        show(place, seconds);
      }
      if (caption.line) {
        setLine(caption.line);
        show(line, seconds + 1.5);
      } else if (!caption.title && caption.subtitle) {
        setLine(caption.subtitle);
        show(line, seconds);
      }
    },
    /** Keeps text clear of the letterbox bars (CSS pixels). */
    setBar(pixels, { drawBars = false } = {}) {
      layer.style.setProperty('--film-bar', `${Math.round(pixels)}px`);
      layer.classList.toggle('draws-bars', drawBars);
    },
    hide() {
      for (const element of [place, line, card, note]) element.classList.remove('is-shown');
    },
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
      clearTimeout(deferred);
      layer.remove();
    },
  };
  return api;
}
