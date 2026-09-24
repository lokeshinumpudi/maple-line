/** Embed the game build beside this SDK. Each mount owns one disposable iframe. */
export function mountMapleLine(container, { src, config = {}, onState = () => {} } = {}) {
  const url = new URL(src, location.href);
  if (url.origin !== location.origin) throw new Error('Use a game build on this site.');
  const frame = document.createElement('iframe');
  frame.title = 'Live Maple Line scene';
  frame.src = url.href;
  frame.className = 'live-game-frame';
  const pending = new Map();
  let sequence = 0,
    disposed = false;
  const receive = (event) => {
    if (event.source !== frame.contentWindow || event.origin !== url.origin) return;
    if (event.data?.channel !== 'maple-line-embed-v1') return;
    // A change the scene made on its own, such as a staged beat that now holds.
    if (event.data.type === 'state' && event.data.id === undefined) {
      if (event.data.state && typeof event.data.state === 'object') onState(event.data.state);
      return;
    }
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    clearTimeout(request.timer);
    if (event.data.error) request.reject(new Error(event.data.error));
    else {
      onState(event.data.state);
      request.resolve(event.data.state);
    }
  };
  window.addEventListener('message', receive);
  const request = (type, payload = {}, timeout = 5000) =>
    new Promise((resolve, reject) => {
      if (disposed) return reject(new Error('The live scene has been closed.'));
      const id = `request-${++sequence}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('The live scene did not respond.'));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      frame.contentWindow?.postMessage(
        { channel: 'maple-line-embed-v1', id, type, ...payload },
        url.origin,
      );
    });
  container.append(frame);
  const ready = (async () => {
    for (let attempt = 0; attempt < 45; attempt++) {
      try {
        await request('ready', {}, 1000);
        return await request('configure', { config });
      } catch (error) {
        if (disposed || attempt === 44) throw error;
      }
    }
  })();
  return {
    frame,
    ready,
    configure: async (next) => {
      await ready;
      return request('configure', { config: next });
    },
    inspect: async (x = 0, y = 0) => {
      await ready;
      return request('inspect', { x, y });
    },
    snapshot: async () => {
      await ready;
      return request('snapshot');
    },
    setVisible: async (visible) => {
      await ready;
      return request('visibility', { visible });
    },
    dispose() {
      disposed = true;
      window.removeEventListener('message', receive);
      for (const { timer, reject } of pending.values()) {
        clearTimeout(timer);
        reject(new Error('The live scene has been closed.'));
      }
      pending.clear();
      frame.remove();
    },
  };
}
