/* Service Worker: praca bez internetu. Pieśni (z numerem wersji w adresie) są niezmienne, reszta: sieć, a przy braku łączności pamięć podręczna. */
const SHELL = 'harmonizacje-shell-v2';
const SONGS = 'harmonizacje-songs';
const SHELL_FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'data/index.json',
  'vendor/verovio-toolkit-wasm.js',
  'js/app.js', 'js/constants.js', 'js/dom.js', 'js/state.js', 'js/catalog.js', 'js/engine.js', 'js/sheet.js',
  'js/focus.js', 'js/library.js', 'js/controls.js', 'js/viewer.js', 'js/offline-ui.js',
  'js/music.js', 'js/lyrics.js', 'js/offline.js',
];
const NETWORK_TIMEOUT = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== SONGS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request) {
  return new Promise((resolve) => {
    const fallback = () => caches.match(request, { ignoreSearch: false }).then((r) => r || caches.match('index.html'));
    const timer = setTimeout(() => fallback().then((r) => r && resolve(r)), NETWORK_TIMEOUT);
    fetch(request).then((res) => {
      clearTimeout(timer);
      if (res.ok) {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(request, copy));
      }
      resolve(res);
    }).catch(() => {
      clearTimeout(timer);
      fallback().then((r) => resolve(r || Response.error()));
    });
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname.includes('/api/') || url.pathname.endsWith('/admin.html') || url.pathname.endsWith('/js/admin.js')) return;

  const isSong = url.pathname.includes('/data/songs/') && url.searchParams.has('v');
  const isVendor = url.pathname.includes('/vendor/');
  if (isSong || isVendor) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(isSong ? SONGS : SHELL).then((c) => c.put(request, copy));
      }
      return res;
    })));
    return;
  }
  event.respondWith(networkFirst(request));
});
