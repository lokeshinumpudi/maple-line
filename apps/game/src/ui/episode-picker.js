import './episode-picker.css';

/**
 * Adds a "Watch" row of episodes to the Places dialog. Text is set with textContent.
 * With `voice`, a language picker and a voice switch sit under the logline:
 *   voice: { languages: [{ code, label }], get: () => ({ language, enabled }), set(patch) }
 * The returned setStatus(status) shows why an episode would play with subtitles only.
 */
export function installEpisodePicker({ dialog, series, onPlay, voice }) {
  if (!dialog) return null;
  const section = document.createElement('section');
  section.className = 'places-episodes';
  section.setAttribute('aria-labelledby', 'places-episodes-title');
  const heading = document.createElement('div');
  heading.className = 'places-episodes-heading';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'WATCH A SHORT DRAMA';
  const title = document.createElement('h3');
  title.id = 'places-episodes-title';
  title.textContent = series.japanese ? `${series.title} · ${series.japanese}` : series.title;
  const logline = document.createElement('p');
  logline.textContent = series.logline;
  heading.append(eyebrow, title, logline);
  let note = null;
  if (voice) {
    const settings = document.createElement('div');
    settings.className = 'places-episodes-voice';
    const languageLabel = document.createElement('label');
    languageLabel.textContent = 'Language';
    const language = document.createElement('select');
    language.id = 'episode-language';
    for (const item of voice.languages) language.append(new Option(item.label, item.code));
    languageLabel.append(language);
    const voiceLabel = document.createElement('label');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = 'episode-voice';
    voiceLabel.append(toggle, document.createTextNode(' Voices (Sarvam)'));
    note = document.createElement('span');
    note.className = 'places-episodes-voice-note';
    note.setAttribute('role', 'status');
    const sync = () => {
      const current = voice.get();
      language.value = current.language;
      toggle.checked = current.enabled;
    };
    sync();
    dialog.addEventListener('toggle', sync);
    language.addEventListener('change', () => voice.set({ language: language.value }));
    toggle.addEventListener('change', () => voice.set({ enabled: toggle.checked }));
    settings.append(languageLabel, voiceLabel, note);
    heading.append(settings);
  }
  const list = document.createElement('div');
  list.className = 'places-episodes-list';
  for (const episode of series.episodes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'episode-card';
    button.dataset.episode = episode.id;
    const number = document.createElement('span');
    number.className = 'episode-number';
    number.textContent = String(episode.number ?? '').padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = episode.title;
    const line = document.createElement('small');
    line.textContent = episode.logline ?? '';
    button.append(number, name, line);
    button.addEventListener('click', () => {
      dialog.close();
      onPlay(episode);
    });
    list.append(button);
  }
  section.append(heading, list);
  const before = dialog.querySelector('.places-all');
  if (before) before.before(section);
  else dialog.append(section);
  return {
    section,
    /** Shows the voice fallback reason, or nothing while voices are available. */
    setStatus(status) {
      if (!note) return;
      note.textContent =
        status?.reason ??
        (status?.mode === 'voice' ? 'Voiced by Sarvam' : status?.requested ? '' : 'Subtitles only');
    },
  };
}
