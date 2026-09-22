import { describeWorld, WORLD_CHOICES } from '@maple-line/world-spec';
import { OFFLINE_WORLDS } from '../world/presets/offline-worlds.js';
import { createInvitationDeck, WORLD_INVITATIONS } from './world-invitations.js';
import { enhanceSelect } from './select-menu.js';

export function installWorldBuilderPanel({ store, builder, onExplore }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('world-builder');
  const prompt = $('world-prompt');
  const open = () => {
    $('journey-menu').close();
    if (!dialog.open) dialog.showModal();
    prompt.focus();
  };
  $('create-world').onclick = open;
  $('welcome-create-world').onclick = open;
  const saved = $('world-saved');
  saved.replaceChildren(...OFFLINE_WORLDS.map((world) => new Option(world.title, world.id)));
  const savedPicker = enhanceSelect(saved, 'Saved world');
  const describeSaved = () => {
    const world = OFFLINE_WORLDS.find((item) => item.id === saved.value);
    $('world-saved-summary').textContent = world ? describeWorld(world.plan) : '';
  };
  saved.onchange = describeSaved;
  describeSaved();
  $('world-use-saved').onclick = () => {
    void builder.createPreset(saved.value);
  };
  const surprise = createInvitationDeck();
  $('world-surprise').onclick = () => {
    prompt.value = surprise();
    prompt.focus();
  };
  $('world-close').onclick = () => dialog.close();
  $('world-form').onsubmit = (event) => {
    event.preventDefault();
    void builder.create(prompt.value);
  };
  $('world-accept').onclick = () => {
    void builder.accept();
  };
  $('world-cancel').onclick = () => builder.cancel();
  document.querySelectorAll('[data-world-prompt]').forEach((button) => {
    button.onclick = () => {
      prompt.value = WORLD_INVITATIONS[Number(button.dataset.worldPrompt)];
      prompt.focus();
    };
  });
  function render(state, previous) {
    const busy = ['interpreting', 'building'].includes(state.status);
    $('world-submit').disabled = busy;
    $('world-use-saved').disabled = busy;
    saved.disabled = busy;
    savedPicker.sync();
    $('world-surprise').disabled = busy;
    prompt.disabled = busy;
    $('world-form').setAttribute('aria-busy', String(busy));
    $('world-submit').textContent =
      state.status === 'interpreting'
        ? 'Choosing settings…'
        : state.status === 'building'
          ? 'Building…'
          : state.status === 'error'
            ? 'Try again ↗'
            : 'Create my world ↗';
    $('world-cancel').hidden = !busy && state.status !== 'review';
    $('world-status').textContent = state.message;
    $('world-status').hidden = state.status === 'idle';
    document.querySelector('.world-steps').hidden = state.status === 'idle';
    $('world-status').dataset.state = state.status;
    $('world-accept').hidden = state.status !== 'review';
    $('world-active-badge').hidden = !state.active;
    $('world-active-badge').textContent = state.active
      ? `Your valley · ${WORLD_CHOICES.season[state.active.plan.season]}`
      : '';
    const proposal = state.proposal ?? state.active;
    $('world-plan').hidden = !proposal;
    $('world-plan-label').textContent =
      proposal?.source === 'jev-preset'
        ? state.proposal
          ? 'SAVED JEV WORLD · REVIEW SETTINGS'
          : 'ACTIVE WORLD · SAVED JEV PRESET'
        : proposal?.source === 'signal'
          ? state.proposal
            ? 'PROPOSED WORLD SETTINGS'
            : 'ACTIVE WORLD · CHOSEN BY SIGNAL'
          : state.proposal
            ? 'JEV’S PROPOSED SETTINGS'
            : 'ACTIVE WORLD · CHOSEN BY JEV';
    $('world-accept').textContent =
      state.proposal?.source === 'jev-preset'
        ? 'Build this saved world'
        : 'Build these supported settings';
    $('world-plan-summary').textContent = proposal ? describeWorld(proposal.plan) : '';
    $('world-seed').textContent = proposal
      ? `${proposal.source === 'jev-preset' ? `${proposal.preset.title} · ` : ''}World ${proposal.plan.seed.toString(16).toUpperCase()}`
      : '';
    for (const button of document.querySelectorAll('[data-world-prompt]')) button.disabled = busy;
    const step = { interpreting: 1, building: 2, active: 3 }[state.status] ?? 0;
    document.querySelectorAll('[data-world-step]').forEach((node) => {
      node.classList.toggle('complete', Number(node.dataset.worldStep) <= step);
    });
    if (state.status === 'active' && previous?.status === 'building') {
      dialog.close();
      if (onExplore) onExplore(state.active.plan);
      else if (!store.getState().drive.started) $('start').click();
    }
  }
  render(store.getState().worldBuilder);
  const unsubscribe = store.subscribe((value) => value.worldBuilder, render);
  return () => {
    unsubscribe();
    savedPicker.dispose();
  };
}
