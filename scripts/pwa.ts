import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** A versioned static-only shell. API responses and user records are never cached. */
export function dailyPepPWA(): Plugin {
  let publicDir = '';
  return {
    name: 'dailypep-offline-shell',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { publicDir = config.publicDir; },
    generateBundle(_options, bundle) {
      const files = [...new Set([
        ...Object.keys(bundle).filter((file) => /\.(?:js|css|html|png|svg|woff2)$/.test(file)),
        'index.html', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'manifest.webmanifest',
      ])].sort();
      const hash = createHash('sha256');
      for (const file of Object.keys(bundle).sort()) {
        const output = bundle[file];
        hash.update(file);
        hash.update(output.type === 'chunk' ? output.code : output.source);
      }
      for (const file of files.filter((file) => !(file in bundle))) {
        hash.update(file);
        hash.update(readFileSync(resolve(publicDir, file)));
      }
      const version = hash.digest('hex').slice(0, 20);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const VERSION = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};
const SCOPE = self.registration.scope;
const PREFIX = 'dailypep-shell-' + encodeURIComponent(SCOPE) + '-';
const CACHE = PREFIX + VERSION;
const URLS = FILES.map(file => new URL(file, SCOPE).href);
const ALLOWED = new Set(URLS);
const INDEX = new URL('index.html', SCOPE).href;

self.addEventListener('install', event => {
  // Fail atomically when a shell file is missing; retain the old worker.
  // Never skipWaiting here: the app offers an explicit update.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const relative = url.pathname.slice(new URL(SCOPE).pathname.length);
  if (/^(auth|rest|storage|functions|api)\\//.test(relative)) return;
  if (request.mode === 'navigate') {
    // Never cache navigation URLs: sign-in tokens can appear in queries.
    event.respondWith(fetch(request).catch(async () => {
      const cached = await (await caches.open(CACHE)).match(INDEX);
      return cached || Response.error();
    }));
    return;
  }
  if (!ALLOWED.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(request)) || fetch(request);
  })());
});
` });
    },
  };
}
