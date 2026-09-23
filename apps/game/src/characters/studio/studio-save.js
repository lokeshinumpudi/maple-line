/**
 * Saving: every change is shown as a line diff of the formatted JSON before it is written,
 * and only the two tuning files can be written (dev-server.js). Download is the fallback
 * when the page is not on the dev server.
 */
import { diffHunks, lineDiff } from './studio-math.js';
import { h } from './dom.js';

const FILES = {
  'cast-tuning': 'apps/game/src/characters/cast-tuning.json',
  'studio-tuning': 'apps/game/src/characters/studio/studio-tuning.json',
};

export function createSaving(S) {
  const dialog = document.getElementById('review');
  const body = document.getElementById('review-body');
  const data = (name) => (name === 'cast-tuning' ? S.tuning.cast : S.tuning.studio);

  async function post(route, name) {
    const response = await fetch(`/__studio/${route}?name=${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data(name)),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }

  /** The diffs that a save would write, without writing. */
  S.previewSave = async (names = Object.keys(FILES)) => {
    const out = {};
    for (const name of names) {
      const { before, after } = await post('preview', name);
      out[name] = { file: FILES[name], changed: before !== after, before, after };
    }
    return out;
  };
  S.save = async (names = Object.keys(FILES)) => {
    const written = [];
    for (const name of names) {
      const result = await post('save', name);
      if (result.changed) written.push(result.path);
      S.dirty.delete(name);
    }
    S.emit('dirty');
    return written;
  };

  return {
    async review() {
      let previews;
      try {
        previews = await S.previewSave();
      } catch (error) {
        return S.toast(`Preview failed: ${error.message}`);
      }
      body.replaceChildren();
      const changed = Object.entries(previews).filter(([, p]) => p.changed);
      if (!changed.length)
        body.append(h('p', { class: 'note' }, 'Nothing to write: both files match.'));
      for (const [, preview] of changed) {
        const pre = h('pre', { class: 'diff mono' });
        for (const { op, line } of diffHunks(lineDiff(preview.before, preview.after), 3))
          pre.append(
            h(
              'div',
              { class: op === '+' ? 'add' : op === '-' ? 'del' : '' },
              op === '…' ? '  …' : `${op} ${line}`,
            ),
          );
        body.append(h('div', { class: 'mono' }, preview.file), pre);
      }
      document.getElementById('review-write').disabled = !changed.length;
      document.getElementById('review-cancel').onclick = () => dialog.close();
      document.getElementById('review-write').onclick = async () => {
        try {
          const written = await S.save(changed.map(([name]) => name));
          S.toast(`Wrote ${written.join(', ') || 'nothing'}. Review with git diff.`, 4000);
        } catch (error) {
          S.toast(`Save failed: ${error.message}`, 5000);
        }
        dialog.close();
      };
      dialog.showModal();
    },
    download() {
      for (const name of Object.keys(FILES)) {
        const blob = new Blob([`${JSON.stringify(data(name), null, 2)}\n`], {
          type: 'application/json',
        });
        const a = h('a', { href: URL.createObjectURL(blob), download: `${name}.json` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    },
  };
}
