import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'ship' ? './' : mode === 'public' ? '/maple-line/' : '/',
  plugins: ['ship', 'public'].includes(mode)
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
              .replaceAll('https://signal.internal.loophealth.com', mode === 'public' ? 'https://lokeshinumpudi.com' : 'https://signal.internal.loophealth.com')
              .replaceAll('https://signal-ship.internal.loophealth.com/s/maple-line-runbook/', mode === 'public' ? 'https://lokeshinumpudi.com/maple-line-runbook/' : 'https://signal-ship.internal.loophealth.com/s/maple-line-runbook/')
              .replace(
                '<html lang="en">',
                `<html lang="en" data-hosting="${mode === 'ship' ? 'signal' : 'vercel'}" data-director-url="${mode === 'public' ? (process.env.VITE_DIRECTOR_URL ?? '') : ''}">`,
              )
              .replace(
                '</head>',
                mode === 'ship'
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
    sourcemap: !['ship', 'public'].includes(mode),
    minify: mode === 'readable' ? false : 'esbuild',
    outDir:
      mode === 'public'
        ? 'dist-public'
        : mode === 'ship'
          ? 'dist-ship'
          : mode === 'readable'
            ? 'dist-readable'
            : 'dist',
  },
}));
