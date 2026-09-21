import { routeChoiceScene } from '../narrative/route-choice-data.js';
import './route-choice-panel.css';

export function mountRouteChoicePanel({ routeChoice, onChoose }) {
  const panel = document.createElement('section');
  panel.className = 'route-choice';
  panel.setAttribute('aria-label', 'Kawasemi route authority');
  panel.innerHTML = `<p class="route-choice__eyebrow">KAWASEMI · EXCURSION ROUTE</p>
    <h2>Beyond the platform</h2>
    <p data-description></p><details data-notes hidden><summary>Read the route notes</summary><p data-transcript></p></details><p data-status role="status"></p>
    <div><button type="button" data-route="direct">Direct · the connection board</button>
    <button type="button" data-route="wetland">Wetland · the walking route</button></div>`;
  document.body.append(panel);
  panel.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => onChoose(button.dataset.route));
  });
  let last = '';
  return {
    update() {
      const state = routeChoice.getState();
      const key = JSON.stringify([
        state.visible,
        state.available,
        state.confirmed,
        state.selectedRoute,
        state.onBranch,
        state.traversed,
      ]);
      if (key === last) return;
      last = key;
      panel.hidden = !state.visible;
      const scene = routeChoiceScene.choices[state.selectedRoute];
      panel.querySelector('[data-description]').textContent = state.traversed
        ? scene.arrivalNote
        : state.confirmed
          ? scene.afterSelection
          : routeChoiceScene.intro;
      panel.querySelector('[data-notes]').hidden = !state.traversed;
      panel.querySelector('[data-transcript]').textContent = scene.captions.join(' ');
      panel.querySelector('[data-status]').textContent = state.confirmed
        ? `Authority confirmed · ${state.selectedRoute === 'wetland' ? 'wetland loop · 20 km/h' : 'direct track'}`
        : state.available
          ? 'Stopped at the board. Request a route to continue.'
          : 'Stop at the route board to request authority.';
      panel.querySelectorAll('[data-route]').forEach((button) => {
        button.disabled = !state.available;
        button.setAttribute(
          'aria-pressed',
          String(state.confirmed && state.selectedRoute === button.dataset.route),
        );
      });
      for (const button of panel.querySelectorAll('[data-route]'))
        button.textContent = routeChoiceScene.choices[button.dataset.route].label;
      panel.classList.toggle('route-choice--rolling', state.onBranch);
    },
    dispose() {
      panel.remove();
    },
  };
}
