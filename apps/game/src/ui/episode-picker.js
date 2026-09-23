import './episode-picker.css';

/** Adds a "Watch" row of episodes to the Places dialog. Text is set with textContent. */
export function installEpisodePicker({ dialog, series, onPlay }) {
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
  return section;
}
