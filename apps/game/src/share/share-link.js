/**
 * Offers a link through the system share sheet when the browser has one, and
 * otherwise copies it. Returns 'shared', 'copied', 'cancelled' or 'manual' (the
 * caller then shows the link so it can be copied by hand).
 */
export async function shareLink({ url, title, text }, { nav = globalThis.navigator } = {}) {
  const data = { url, title, text };
  if (typeof nav?.share === 'function' && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      // NotAllowedError and friends: fall through to copying.
    }
  }
  try {
    await nav.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'manual';
  }
}
