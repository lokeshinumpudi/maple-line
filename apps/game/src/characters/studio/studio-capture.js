/**
 * Stills and short videos of the studio views. A video is frame-stepped like
 * scripts/render-episode.mjs: the studio clock advances one frame, the views render, the
 * frame is read back and posted to the dev server, which runs ffmpeg at the end. Files land
 * in artifacts/screenshots/studio/ (gitignored).
 */
import { toFrame } from './studio-math.js';

export function createCapture(S) {
  const canvas = S.view.renderer.domElement;

  /** The canvas region of one view (or the whole canvas), in device pixels. */
  function region(name) {
    if (name === 'all' || !S.view.views[name]) return [0, 0, canvas.width, canvas.height];
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    const rect = S.view.rects().find((r) => r.view.name === name);
    if (!rect) return [0, 0, canvas.width, canvas.height];
    return [
      Math.round(rect.x * ratio),
      Math.round(canvas.height - (rect.y + rect.height) * ratio),
      Math.round(rect.width * ratio),
      Math.round(rect.height * ratio),
    ];
  }

  /** Render now and copy the region to a 2D canvas (the WebGL buffer is not preserved). */
  function grab(name) {
    S.afterStep();
    S.view.render();
    const [x, y, w, h] = region(name);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
    return out;
  }

  const blob = (c, type = 'image/png', quality) =>
    new Promise((resolve) => c.toBlob(resolve, type, quality));

  async function post(url, body) {
    const response = await fetch(url, { method: 'POST', body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }

  const stamp = () =>
    `${S.loaded?.entry.id.replace(/\//g, '-') ?? 'studio'}-${S.state.clip}-${toFrame(S.state.t, 30)}`
      .replace(/[^a-z0-9._-]/gi, '-')
      .toLowerCase();

  return {
    grab,
    async still({ region: name = 'all', file = null } = {}) {
      const image = await blob(grab(name));
      const result = await post(
        `/__studio/capture?name=${encodeURIComponent(file ?? `${stamp()}-${name}`)}`,
        image,
      );
      S.toast(`Saved ${result.path}`);
      return result;
    },
    /** One pass over the trimmed clip (at least `seconds`), 30 fps. */
    async video({ region: name = 'persp', seconds = null, fps = 30, file = null } = {}) {
      const trim = S.trim();
      const length = seconds ?? Math.max(1, trim.end - trim.start);
      const frames = Math.round(length * fps);
      const id = Math.random().toString(36).slice(2, 10);
      S.pauseLoop(true);
      const wasPlaying = S.state.playing;
      S.state.playing = true;
      S.state.t = trim.start;
      try {
        for (let i = 0; i < frames; i++) {
          // Two studio steps per 30 fps frame (the studio runs at 60 Hz).
          S.step(1 / 60);
          S.step(1 / 60);
          const jpeg = await blob(grab(name), 'image/jpeg', 0.92);
          await post(`/__studio/video/frame?id=${id}&index=${i}`, jpeg);
          if (i % 10 === 0) S.toast(`Capturing ${i + 1}/${frames}`);
        }
        const result = await post(
          `/__studio/video/finish?id=${id}&fps=${fps}&name=${encodeURIComponent(file ?? `${stamp()}-${name}`)}`,
          '',
        );
        S.toast(`Saved ${result.path}`, 4000);
        return result;
      } finally {
        S.state.playing = wasPlaying;
        S.pauseLoop(false);
      }
    },
  };
}
