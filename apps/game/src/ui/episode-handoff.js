import './episode-handoff.css';

/**
 * Episode controls around the film: a small bar while an episode plays (Skip,
 * Take the controls), an end panel (Drive from here, Watch again, Share), and a
 * toast for the driving prompt and link notices. Episode text can come from a
 * shared link, so every string is set with textContent.
 */
export function mountEpisodeHandoff({ root = document.body, actions }) {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, onClick, className = '') => {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  };

  const bar = el('div', 'episode-bar');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Episode controls');
  const barTitle = el('span', 'episode-bar-title');
  bar.append(
    barTitle,
    button('Skip', () => actions.skip()),
    button('Take the controls', () => actions.takeControls(), 'is-primary'),
  );
  bar.hidden = true;

  const panel = el('section', 'episode-end');
  panel.setAttribute('aria-labelledby', 'episode-end-title');
  const eyebrow = el('span', 'eyebrow', 'END OF EPISODE');
  const title = el('h2');
  title.id = 'episode-end-title';
  const body = el(
    'p',
    '',
    'The train is still running where the story left it. Drive on from here.',
  );
  const buttons = el('div', 'episode-end-actions');
  const drive = button('Drive from here ↗', () => actions.drive(), 'is-primary');
  const again = button('Watch again', () => actions.watchAgain());
  const share = button('Share', () => actions.share());
  buttons.append(drive, again, share);
  const status = el('p', 'episode-share-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const manual = el('input', 'episode-share-url');
  manual.type = 'text';
  manual.readOnly = true;
  manual.setAttribute('aria-label', 'Episode link');
  manual.hidden = true;
  panel.append(eyebrow, title, body, buttons, status, manual);
  panel.hidden = true;

  const toast = el('div', 'episode-toast');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  const toastText = el('span');
  const toastClose = button('×', () => hideToast(), 'episode-toast-close');
  toastClose.setAttribute('aria-label', 'Dismiss');
  toast.append(toastText, toastClose);
  toast.hidden = true;
  root.append(bar, panel, toast);

  let toastTimer = 0;
  function hideToast() {
    clearTimeout(toastTimer);
    toast.hidden = true;
  }
  const clearShare = () => {
    status.textContent = '';
    manual.hidden = true;
    manual.value = '';
  };

  return {
    showPlaying({ title: name }) {
      panel.hidden = true;
      barTitle.textContent = name;
      bar.hidden = false;
    },
    showEnded({ title: name, skipped = false }) {
      bar.hidden = true;
      clearShare();
      title.textContent = name;
      eyebrow.textContent = skipped ? 'EPISODE SKIPPED' : 'END OF EPISODE';
      panel.hidden = false;
      drive.focus({ preventScroll: true });
    },
    hide() {
      bar.hidden = true;
      panel.hidden = true;
    },
    get ended() {
      return !panel.hidden;
    },
    shareBusy(busy) {
      share.disabled = busy;
      if (busy) {
        clearShare();
        status.textContent = 'Making a link…';
      }
    },
    /** result: shared | copied | cancelled | manual | error, with the link or a message. */
    shareStatus(result, detail = '') {
      clearShare();
      if (result === 'shared') status.textContent = 'Shared.';
      else if (result === 'copied')
        status.textContent = 'Link copied. Anyone who opens it lands in this episode.';
      else if (result === 'manual') {
        status.textContent = 'Copy this link:';
        manual.value = detail;
        manual.hidden = false;
        manual.select();
      } else if (result === 'error') status.textContent = detail;
    },
    toast(message, { seconds = 8 } = {}) {
      clearTimeout(toastTimer);
      toastText.textContent = message;
      toast.hidden = false;
      toastTimer = setTimeout(hideToast, seconds * 1000);
    },
    dispose() {
      clearTimeout(toastTimer);
      bar.remove();
      panel.remove();
      toast.remove();
    },
  };
}
