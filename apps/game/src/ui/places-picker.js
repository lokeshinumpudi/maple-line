/** Destinations reuse the existing location action, including railway duty guards. */
export function installPlacesPicker(select) {
  const abort = new AbortController();
  const originalParent = select.parentElement;
  const trigger = document.createElement('button');
  trigger.id = 'places-toggle';
  trigger.textContent = 'Places';
  trigger.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog');
  dialog.id = 'places-picker';
  dialog.setAttribute('aria-labelledby', 'places-title');
  dialog.innerHTML = `<div class="places-heading"><div><span class="eyebrow">A LITTLE FURTHER ALONG THE LINE</span><h2 id="places-title">Where next?</h2></div><button type="button" class="places-close" aria-label="Close places">×</button></div><p class="places-intro">A new view, one stop away. Choose somewhere to linger.</p><div class="places-grid"></div><details class="places-all"><summary>Every stop & viewpoint</summary><div class="places-list"></div></details><div class="places-footer"><span>Or imagine somewhere of your own.</span></div>`;
  const on = (element, type, handler) =>
    element.addEventListener(type, handler, { signal: abort.signal });
  on(trigger, 'click', () => dialog.showModal());
  on(dialog.querySelector('.places-close'), 'click', () => dialog.close());
  on(dialog, 'click', (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  const options = [...select.options].filter((option) => option.value !== '');
  const visit = (value) => {
    dialog.close();
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const featured = [
    ['Autumn gorge', 'River & red leaves', 'Follow the water', 'gorge'],
    ['Rice terraces', 'Rice terraces', 'Fields in the afternoon', 'fields'],
    ['Aonuma waterfall lookout', 'Aonuma lakeside', 'Islands & falling water', 'lake'],
    ['500 ft valley bridge', 'Above the valley', 'A bridge between hills', 'bridge'],
    ['Snow-country summit', 'Snow country', 'The quiet at the top', 'snow'],
    ['Minato · harbour', 'Minato harbour', 'The last light on the water', 'harbour'],
    ['Tokyo neon passage', 'Tokyo neon passage', 'City lights & passing traffic', 'tokyo'],
  ];
  for (const [match, title, subtitle, theme] of featured) {
    const option = options.find((item) => item.textContent === match);
    if (!option) continue;
    const card = document.createElement('button');
    card.className = `place-card place-${theme}`;
    card.dataset.location = option.value;
    const art = document.createElement('img');
    art.className = 'place-art';
    art.src = `./images/places/${theme}.jpg`;
    art.alt = '';
    art.loading = 'lazy';
    art.decoding = 'async';
    art.width = 800;
    art.height = 500;
    art.setAttribute('aria-hidden', 'true');
    const name = document.createElement('strong');
    name.textContent = title;
    const detail = document.createElement('small');
    detail.textContent = subtitle;
    card.append(art, name, detail);
    on(card, 'click', () => visit(option.value));
    dialog.querySelector('.places-grid').append(card);
  }
  for (const option of options) {
    const button = document.createElement('button');
    button.textContent = option.label;
    on(button, 'click', () => visit(option.value));
    dialog.querySelector('.places-list').append(button);
  }
  originalParent.hidden = true;
  select.hidden = true;
  dialog.append(select);
  document.body.append(dialog);
  return {
    trigger,
    dialog,
    footer: dialog.querySelector('.places-footer'),
    dispose() {
      abort.abort();
      originalParent.hidden = false;
      originalParent.append(select);
      select.hidden = false;
      dialog.remove();
      trigger.remove();
    },
  };
}

export function arrangeSettings(menu) {
  const abort = new AbortController();
  const tabs = document.createElement('div');
  tabs.className = 'settings-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Settings sections');
  const groups = [
    ['Atmosphere', ['#menu-atmosphere']],
    ['Train & ride', ['#menu-travel', '.train-systems', '#menu-other']],
    ['Controls', ['#menu-help']],
  ];
  const panels = [],
    buttons = [];
  const activate = (index) => {
    buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  };
  groups.forEach(([label, selectors], index) => {
    const panel = document.createElement('div');
    panel.id = `settings-panel-${index}`;
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    const button = document.createElement('button');
    button.id = `settings-tab-${index}`;
    button.textContent = label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panel.id);
    panel.setAttribute('aria-labelledby', button.id);
    selectors.forEach((selector) => panel.append(menu.querySelector(selector)));
    button.addEventListener('click', () => activate(index), { signal: abort.signal });
    button.addEventListener(
      'keydown',
      (event) => {
        const next =
          event.key === 'ArrowRight'
            ? (index + 1) % 3
            : event.key === 'ArrowLeft'
              ? (index + 2) % 3
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? 2
                  : null;
        if (next !== null) {
          event.preventDefault();
          activate(next);
          buttons[next].focus();
        }
      },
      { signal: abort.signal },
    );
    panels.push(panel);
    buttons.push(button);
    tabs.append(button);
  });
  menu.append(tabs, ...panels);
  menu.querySelector('.train-systems').open = true;
  menu.querySelector('#menu-help').open = true;
  activate(0);
  return () => abort.abort();
}
