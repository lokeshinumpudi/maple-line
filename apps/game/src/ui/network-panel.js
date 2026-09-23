import './network-panel.css';
import { SERVICE_KINDS, formatClock } from '../simulation/rail-network.js';

/**
 * Regional network dialog: schematic map, mission board and company ledger.
 * Only the Maple Line is rendered in 3D; the other lines are simulated on this map.
 * Buttons call the same `missions.accept/abandon` actions that agent tools use.
 */
const UPDATE_INTERVAL_MS = 250; // at most 4 DOM updates per second
const SVG = 'http://www.w3.org/2000/svg';
const KIND_COLORS = { limited: '#fff1c9', rapid: '#f2a65a', local: '#dfe9dd', freight: '#a89a80' };
const TYPE_LABELS = {
  passenger: 'Passengers',
  freight: 'Freight',
  express: 'Express',
  connection: 'Connection',
};
const STATUS_LABELS = {
  offered: 'On offer',
  accepted: 'Go to pickup',
  loading: 'Loading',
  'in-transit': 'In transit',
  unloading: 'Unloading',
  completed: 'Completed',
  failed: 'Failed',
};

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const yen = (value) => `¥${Math.round(value).toLocaleString('en-US')}`;
const minutes = (value) =>
  value === null || value === undefined
    ? ''
    : value < 0
      ? 'overdue'
      : value < 60
        ? `${Math.floor(value)} min left`
        : `${Math.floor(value / 60)} h ${Math.floor(value % 60)} min left`;

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** One-line HUD summary of the most urgent mission. Writes only when the text changes. */
export function renderMissionChip(el, missionsState) {
  if (!el) return;
  const active = missionsState?.active ?? [];
  const offers = missionsState?.offers?.length ?? 0;
  let text = '';
  let tone = 'idle';
  const mission = [...active].sort(
    (a, b) => (a.minutesLeft ?? Infinity) - (b.minutesLeft ?? Infinity),
  )[0];
  if (mission) {
    if (mission.status === 'loading' || mission.status === 'unloading') {
      text = `${STATUS_LABELS[mission.status]} at ${mission.status === 'loading' ? mission.fromName : mission.toName} · ${Math.round(mission.handlingProgress * 100)}%`;
      tone = 'working';
    } else {
      const target = mission.status === 'accepted' ? mission.fromName : mission.toName;
      const verb = mission.status === 'accepted' ? 'Pick up at' : 'Deliver to';
      text = `${verb} ${target} · ${minutes(mission.minutesLeft)}`;
      tone = mission.minutesLeft !== null && mission.minutesLeft < 5 ? 'urgent' : 'active';
    }
    if (active.length > 1) text += ` · +${active.length - 1}`;
  } else if (offers) {
    text = `${offers} mission${offers === 1 ? '' : 's'} on offer`;
  }
  if (el.dataset.chip === text) return;
  el.dataset.chip = text;
  el.dataset.tone = tone;
  el.textContent = text;
  el.hidden = !text;
}

export function mountNetworkPanel({ network, missions, business, onJumpToStop } = {}) {
  if (!network?.getMap || !missions?.getState)
    throw new TypeError('The network panel needs the network and missions modules.');
  const abort = new AbortController();
  const on = (element, type, handler) =>
    element.addEventListener(type, handler, { signal: abort.signal });
  const map = network.getMap();
  const stationById = new Map(map.stations.map((station) => [station.id, station]));
  const lineById = new Map(map.lines.map((line) => [line.id, line]));

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'network-toggle';
  trigger.textContent = 'Network';
  trigger.setAttribute('aria-haspopup', 'dialog');

  const dialog = document.createElement('dialog');
  dialog.id = 'network-panel';
  dialog.setAttribute('aria-labelledby', 'network-title');
  dialog.innerHTML = `
    <div class="network-heading">
      <div><span class="eyebrow">REGIONAL NETWORK</span><h2 id="network-title">Lines &amp; missions</h2></div>
      <div class="network-heading-side"><span class="network-clock" aria-live="off"></span>
      <button type="button" class="network-close" aria-label="Close network">×</button></div>
    </div>
    <p class="network-intro">Only the Maple Line is drawn in 3D. The other lines run on this map with their own timetabled trains.</p>
    <p class="network-notice" role="status" aria-live="polite"></p>
    <figure class="network-map">
      <div class="network-map-frame"></div>
      <figcaption class="network-legend"></figcaption>
    </figure>
    <div class="network-columns">
      <section class="network-board" aria-labelledby="network-board-title">
        <h3 id="network-board-title" tabindex="-1">Mission board</h3>
        <ol class="network-campaign" aria-label="Campaign progress"></ol>
        <div class="network-missions"></div>
      </section>
      <section class="network-ledger" aria-labelledby="network-ledger-title">
        <h3 id="network-ledger-title">Company ledger</h3>
        <div class="network-ledger-body"></div>
      </section>
    </div>`;
  const $ = (selector) => dialog.querySelector(selector);

  // Static map layer: prefecture names, border ticks, lines, stations.
  const root = svg('svg', {
    viewBox: `0 0 ${map.size.width} ${map.size.height}`,
    role: 'img',
    'aria-label': 'Schematic map of the regional rail network',
    class: 'network-svg',
  });
  const prefectureLayer = svg('g', { class: 'net-prefectures' });
  const lineLayer = svg('g', { class: 'net-lines' });
  const stationLayer = svg('g', { class: 'net-stations' });
  const trainLayer = svg('g', { class: 'net-trains', 'aria-hidden': 'true' });
  const playerLayer = svg('g', { class: 'net-player', 'aria-hidden': 'true' });
  root.append(prefectureLayer, lineLayer, stationLayer, trainLayer, playerLayer);
  for (const prefecture of map.prefectures) {
    const members = map.stations.filter((s) => s.prefecture === prefecture.id);
    if (!members.length) continue;
    const x = members.reduce((sum, s) => sum + s.map.x, 0) / members.length;
    const y = members.reduce((sum, s) => sum + s.map.y, 0) / members.length;
    prefectureLayer.append(
      svg(
        'text',
        {
          // Keep the whole spaced-out name inside the map (about 12 units per half character).
          x: Math.max(
            prefecture.name.length * 12,
            Math.min(map.size.width - prefecture.name.length * 12, x),
          ),
          y: Math.max(40, Math.min(map.size.height - 20, y - 34)),
          fill: prefecture.color,
          class: 'net-prefecture-label',
          'text-anchor': 'middle',
        },
        prefecture.name.toUpperCase(),
      ),
    );
  }
  for (const edge of map.edges) {
    const a = stationById.get(edge.from),
      b = stationById.get(edge.to);
    if (a.prefecture === b.prefecture) continue;
    const mx = (a.map.x + b.map.x) / 2,
      my = (a.map.y + b.map.y) / 2;
    const length = Math.hypot(b.map.x - a.map.x, b.map.y - a.map.y) || 1;
    const nx = (-(b.map.y - a.map.y) / length) * 16,
      ny = ((b.map.x - a.map.x) / length) * 16;
    prefectureLayer.append(
      svg('line', {
        x1: mx - nx,
        y1: my - ny,
        x2: mx + nx,
        y2: my + ny,
        class: 'net-border',
      }),
    );
  }
  const linePaths = new Map();
  for (const line of map.lines) {
    const points = line.stations.map((id) => stationById.get(id).map);
    const path = svg('polyline', {
      points: points.map((p) => `${p.x},${p.y}`).join(' '),
      stroke: line.color,
      class: `net-line net-line-${line.id}${line.track === 'double' ? ' is-double' : ''}${line.electrified ? '' : ' is-diesel'}`,
    });
    path.append(
      svg(
        'title',
        {},
        `${line.name} · ${line.track} track · ${line.electrified ? 'electrified' : 'diesel'} · ${line.speedKmh} km/h`,
      ),
    );
    lineLayer.append(path);
    linePaths.set(line.id, path);
  }
  const junctions = new Set(map.junctions);
  for (const station of map.stations) {
    const group = svg('g', {
      class: `net-station${station.maple ? ' is-maple' : ''}`,
      'data-station': station.id,
    });
    const terminal = lineById
      .get(station.lines[0])
      ?.stations.some((id, i, list) => id === station.id && (i === 0 || i === list.length - 1));
    const minor = !junctions.has(station.id) && !terminal;
    group.append(
      svg('circle', {
        cx: station.map.x,
        cy: station.map.y,
        r: junctions.has(station.id) ? 9 : 5.5,
        class: junctions.has(station.id) ? 'net-junction' : 'net-dot',
      }),
      svg(
        'text',
        {
          // Labels near the right edge sit to the left of their dot so they stay inside the map.
          x: station.map.x + (station.map.x > map.size.width - 170 ? -12 : 12),
          y: station.map.y - 10,
          'text-anchor': station.map.x > map.size.width - 170 ? 'end' : 'start',
          class: `net-label${minor ? ' net-label-minor' : ''}`,
        },
        station.name,
      ),
      svg(
        'title',
        {},
        `${station.name} · ${map.prefectures.find((p) => p.id === station.prefecture)?.name ?? ''} · pop. ${station.population.toLocaleString('en-US')}`,
      ),
    );
    if (station.maple && typeof onJumpToStop === 'function') {
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', `Travel to ${station.name}`);
      const go = () => {
        dialog.close();
        onJumpToStop(station.id);
      };
      on(group, 'click', go);
      on(group, 'keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          go();
        }
      });
    }
    stationLayer.append(group);
  }
  const player = svg('g', { class: 'net-player-marker' });
  player.append(svg('circle', { r: 13, class: 'net-player-halo' }), svg('circle', { r: 7 }));
  playerLayer.append(player);
  $('.network-map-frame').append(root);
  $('.network-legend').innerHTML = [
    ...Object.entries(SERVICE_KINDS).map(
      ([kind, info]) =>
        `<span><i style="background:${KIND_COLORS[kind]}"></i>${esc(info.label)}</span>`,
    ),
    '<span><i class="legend-player"></i>Your train</span>',
    '<span><i class="legend-locked"></i>Locked line</span>',
  ].join('');

  let lastRender = -Infinity;
  let lastBoard = '';
  let lastLedger = '';
  let playerDistance = null;

  function renderMap(networkState, missionsState) {
    $('.network-clock').textContent = formatClock(networkState.clock);
    const unlocked = new Set(networkState.unlockedLines);
    for (const [id, path] of linePaths) path.classList.toggle('is-locked', !unlocked.has(id));
    trainLayer.replaceChildren(
      ...networkState.trains.map((train) =>
        svg('circle', {
          cx: train.map.x,
          cy: train.map.y,
          r: train.kind === 'limited' ? 7 : 6,
          fill: KIND_COLORS[train.kind] ?? '#fff',
          class: `net-train${train.status === 'held' ? ' is-held' : ''}`,
        }),
      ),
    );
    if (Number.isFinite(playerDistance)) {
      const point = network.mapleMapPoint(playerDistance);
      player.setAttribute('transform', `translate(${point.x} ${point.y})`);
      player.style.display = '';
    } else player.style.display = 'none';
    const targets = new Set(missionsState.active.map((m) => m.nextStop).filter(Boolean));
    for (const group of stationLayer.children)
      group.classList.toggle('is-target', targets.has(group.dataset.station));
  }

  function missionCard(m) {
    const active = !['offered', 'completed', 'failed'].includes(m.status);
    const handling = m.status === 'loading' || m.status === 'unloading';
    const meta = [
      TYPE_LABELS[m.type],
      `${m.fromName} → ${m.toName}`,
      m.type === 'freight' ? `${m.units} t` : `${m.units} ${m.cargo === 'mail' ? 'bags' : 'pax'}`,
      yen(m.reward),
    ];
    if (active && m.minutesLeft !== null) meta.push(minutes(m.minutesLeft));
    if (m.connection)
      meta.push(`Connects: ${m.connection.name} ${formatClock(m.connection.departsAt).slice(-5)}`);
    else if (m.connectLine)
      meta.push(`Connects to ${lineById.get(m.connectLine)?.name ?? m.connectLine}`);
    const buttons = [];
    if (m.status === 'offered')
      buttons.push(
        `<button type="button" class="net-primary" data-action="accept" data-id="${esc(m.id)}" data-key="accept-${esc(m.id)}">Accept</button>`,
      );
    if (m.status === 'offered' && m.campaignStep === null)
      buttons.push(
        `<button type="button" data-action="abandon" data-id="${esc(m.id)}" data-key="decline-${esc(m.id)}">Decline</button>`,
      );
    if (active)
      buttons.push(
        `<button type="button" data-action="abandon" data-id="${esc(m.id)}" data-key="abandon-${esc(m.id)}">Abandon</button>`,
      );
    if (active && !handling && m.nextStop && typeof onJumpToStop === 'function')
      buttons.push(
        `<button type="button" data-action="jump" data-stop="${esc(m.nextStop)}" data-key="jump-${esc(m.id)}">Travel to ${esc(stationById.get(m.nextStop)?.name ?? m.nextStop)}</button>`,
      );
    const progress = Math.round((m.handlingProgress ?? 0) * 100);
    return `<article class="net-mission is-${esc(m.status)}${m.campaignStep !== null ? ' is-campaign' : ''}">
      <div class="net-mission-head"><span class="net-status">${esc(STATUS_LABELS[m.status] ?? m.status)}</span><strong>${esc(m.title)}</strong></div>
      <p>${esc(m.brief)}</p>
      <p class="net-meta">${meta.map(esc).join(' · ')}</p>
      ${
        handling
          ? `<div class="net-progress" role="progressbar" aria-label="${esc(STATUS_LABELS[m.status])}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><p class="net-hint">Keep the train stopped with the doors open.</p>`
          : m.status === 'accepted'
            ? `<p class="net-hint">Stop at ${esc(m.fromName)} and open the doors.</p>`
            : m.status === 'in-transit'
              ? `<p class="net-hint">Stop at ${esc(m.toName)} and open the doors.</p>`
              : ''
      }
      ${m.result ? `<p class="net-hint">${esc(m.result.reason)} · ${m.result.money >= 0 ? '+' : ''}${esc(yen(m.result.money))}${m.punctuality !== null ? ` · punctuality ${m.punctuality}` : ''}</p>` : ''}
      ${buttons.length ? `<div class="net-actions">${buttons.join('')}</div>` : ''}
    </article>`;
  }

  function renderBoard(state) {
    const campaign = state.campaign.steps
      .map(
        (step, i) =>
          `<li class="${step.done ? 'is-done' : i === state.campaign.step ? 'is-current' : ''}" title="${esc(step.title)}"><span class="sr-only">${esc(`${i + 1}. ${step.title}${step.done ? ' (done)' : ''}`)}</span></li>`,
      )
      .join('');
    const section = (title, list, empty) =>
      `<h4>${esc(title)}</h4>${list.length ? list.map(missionCard).join('') : `<p class="net-empty">${esc(empty)}</p>`}`;
    const html =
      section('Active', state.active, 'No active missions. Accept one below.') +
      section('On offer', state.offers, 'New contracts appear as demand builds up.') +
      (state.archive.length
        ? `<details class="net-archive"><summary>Recent results</summary>${state.archive.slice(0, 5).map(missionCard).join('')}</details>`
        : '');
    const signature = campaign + html;
    if (signature === lastBoard) return;
    lastBoard = signature;
    const focusKey = dialog.contains(document.activeElement)
      ? document.activeElement?.dataset?.key
      : null;
    const archiveOpen = $('.net-archive')?.open;
    $('.network-campaign').innerHTML = campaign;
    $('.network-missions').innerHTML = html;
    if (archiveOpen && $('.net-archive')) $('.net-archive').open = true;
    if (focusKey) dialog.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
  }

  function renderLedger(state) {
    const ledger = state.ledger;
    const reputation = map.prefectures
      .map((p) => {
        const value = ledger.reputation[p.id] ?? 0;
        const locked = !state.unlocks.prefectures.includes(p.id);
        return `<li class="${locked ? 'is-locked' : ''}"><span>${esc(p.name)}${locked ? ' · locked' : ''}</span><span class="net-bar" role="meter" aria-label="${esc(p.name)} reputation" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><span style="width:${value}%;background:${p.color}"></span></span><b>${value}</b></li>`;
      })
      .join('');
    const history = ledger.history
      .slice(0, 5)
      .map(
        (entry) =>
          `<li><span>${esc(entry.reason)}</span><b class="${entry.amount < 0 ? 'is-loss' : ''}">${entry.amount >= 0 ? '+' : ''}${esc(yen(entry.amount))}</b></li>`,
      )
      .join('');
    const html = `<p class="net-money">${esc(yen(ledger.money))}</p>
      <p class="net-meta">${ledger.contractsCompleted} completed · ${ledger.contractsFailed} failed · ${ledger.capacity.seats} seats · ${ledger.capacity.freightWagons} freight wagon (${ledger.capacity.wagonTonnes} t)</p>
      <h4>Reputation</h4><ul class="net-reputation">${reputation}</ul>
      <h4>Recent entries</h4>${history ? `<ul class="net-history">${history}</ul>` : '<p class="net-empty">No entries yet.</p>'}`;
    if (html === lastLedger) return;
    lastLedger = html;
    $('.network-ledger-body').innerHTML = html;
  }

  function render(overrides = {}) {
    const networkState = overrides.network ?? network.getState();
    const missionsState = overrides.missions ?? missions.getState();
    renderMap(networkState, missionsState);
    renderBoard(missionsState);
    renderLedger(business ? { ...missionsState, ledger: business.getLedger() } : missionsState);
    const latest = missionsState.notices?.at(-1);
    const notice = $('.network-notice');
    if (latest && notice.dataset.id !== latest.id) {
      notice.dataset.id = latest.id;
      notice.dataset.tone = latest.tone;
      notice.textContent = latest.text;
    }
  }

  const feedback = (text) => {
    const notice = $('.network-notice');
    notice.dataset.tone = 'failure';
    notice.textContent = text;
  };
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
      return;
    }
    const button = event.target.closest?.('button[data-action]');
    if (!button) return;
    const { action, id, stop } = button.dataset;
    if (action === 'accept' || action === 'abandon') {
      const result = missions[action](id);
      if (!result.ok) feedback(result.message ?? 'That did not work.');
      lastBoard = '';
      render();
      // The pressed button is replaced; keep keyboard focus inside the board.
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        const next = dialog.querySelector(`[data-key="abandon-${CSS.escape(id)}"]`);
        (next ?? $('#network-board-title')).focus();
      }
    } else if (action === 'jump' && typeof onJumpToStop === 'function') {
      dialog.close();
      onJumpToStop(stop);
    }
  });
  on(dialog, 'keydown', (event) => {
    // Keep typing and arrow keys inside the dialog from reaching driving controls.
    if (event.key !== 'Escape') event.stopPropagation();
  });
  on($('.network-close'), 'click', () => dialog.close());
  on(trigger, 'click', () => api.open());
  document.body.append(dialog);

  const api = {
    trigger,
    dialog,
    open() {
      if (!dialog.open) dialog.showModal();
      lastRender = performance.now();
      render();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    /** Call every frame; renders at most 4 times per second and only while open. */
    update(state = {}) {
      if (Number.isFinite(state.playerDistance)) playerDistance = state.playerDistance;
      if (!dialog.open) return false;
      const now = performance.now();
      if (now - lastRender < UPDATE_INTERVAL_MS) return false;
      lastRender = now;
      render(state);
      return true;
    },
    dispose() {
      abort.abort();
      dialog.remove();
      trigger.remove();
    },
  };
  return api;
}
