import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: mode.endsWith('-embed')
    ? './'
    : mode === 'ship'
      ? './'
      : mode === 'public'
        ? '/maple-line/'
        : '/',
  plugins: ['ship', 'public', 'ship-embed', 'public-embed'].includes(mode)
    ? [
        {
          name: 'maple-ship-preview',
          generateBundle() {
            if (mode === 'ship')
              this.emitFile({
                type: 'asset',
                fileName: 'ship.json',
                source: JSON.stringify({
                  access: { visibility: 'public' },
                  badge: false,
                  db: { generations: { read: 'any', write: 'none' } },
                  ai: { dailySiteCapUsd: 2 },
                }),
              });
          },
          transformIndexHtml(html) {
            return html
              .replaceAll(
                'https://signal.internal.loophealth.com',
                mode.startsWith('public')
                  ? 'https://lokeshinumpudi.com'
                  : 'https://signal.internal.loophealth.com',
              )
              .replaceAll(
                'https://signal-ship.internal.loophealth.com/s/maple-line-runbook/',
                mode.startsWith('public')
                  ? 'https://lokeshinumpudi.com/maple-line-runbook/'
                  : 'https://signal-ship.internal.loophealth.com/s/maple-line-runbook/',
              )
              .replace(
                '<html lang="en">',
                `<html lang="en" data-hosting="${mode.endsWith('-embed') ? 'static' : mode === 'ship' ? 'signal' : 'vercel'}" data-director-url="${mode === 'public' ? (process.env.VITE_DIRECTOR_URL ?? '') : ''}">`,
              )
              .replace(
                '</head>',
                mode.endsWith('-embed')
                  ? '</head>'
                  : mode === 'ship'
                    ? '<script src="/sdk/v1/signal.js"></script></head>'
                    : '<base href="/maple-line/"></head>',
              );
          },
        },
      ]
    : [],
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
    proxy: { '/api/director': 'http://127.0.0.1:4175' },
    // Episode renders (scripts/render-episode.mjs): a source edit must not reload the page mid-capture.
    ...(process.env.MAPLE_RENDER_SERVER === '1' ? { hmr: false, watch: null } : {}),
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    allowedHosts: true,
    proxy: { '/api/director': 'http://127.0.0.1:4175' },
  },
  build: {
    // Source maps let browser debugging point back to the authored modules.
    sourcemap: !['ship', 'public', 'ship-embed', 'public-embed'].includes(mode),
    minify: mode === 'readable' ? false : 'esbuild',
    outDir: mode.endsWith('-embed')
      ? 'dist-embed'
      : mode === 'public'
        ? 'dist-public'
        : mode === 'ship'
          ? 'dist-ship'
          : mode === 'readable'
            ? 'dist-readable'
            : 'dist',
  },
}));
