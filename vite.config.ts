import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Content Security Policy for the published site. GitHub Pages can't send custom headers,
 * so it goes in a <meta> tag. Only the app's own files may run; the only outside services
 * are OpenStreetMap map tiles and place search, used when you open the map.
 * (Added to production builds only: the dev server needs inline scripts for hot reload.)
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "media-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://nominatim.openstreetmap.org",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function securityHeaders(): Plugin {
  return {
    name: 'security-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const charset = '<meta charset="UTF-8" />';
      if (!html.includes(charset)) throw new Error('index.html must declare <meta charset="UTF-8" />');
      // Right after the charset, before any script or stylesheet.
      return html.replace(charset, `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), securityHeaders()],
  build: {
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
