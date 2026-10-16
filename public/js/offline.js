/* Tryb offline: rejestracja Service Workera i pobieranie wszystkich pieśni z góry. */
const SONGS_CACHE = 'harmonizacje-songs';
  const songUrl = (harmonization) => `data/songs/${encodeURIComponent(harmonization.id)}.musicxml?v=${harmonization.rev || 0}`;

  function listHarmonizations(folders, out = []) {
    for (const f of folders) {
      for (const song of f.songs) out.push(...(song.harmonizations || []));
      listHarmonizations(f.folders, out);
    }
    return out;
  }

  const supported = 'serviceWorker' in navigator && 'caches' in window;

  async function register() {
    if (!supported) return;
    try {
      await navigator.serviceWorker.register('sw.js');
      navigator.storage?.persist?.();
    } catch { /* brak HTTPS lub localhost: tryb offline niedostępny */ }
  }

  async function status(index) {
    if (!supported) return { cached: 0, total: 0 };
    const harmonizations = listHarmonizations(index.folders);
    const cache = await caches.open(SONGS_CACHE);
    let cached = 0;
    for (const h of harmonizations) if (await cache.match(songUrl(h))) cached++;
    return { cached, total: harmonizations.length };
  }

  // Pobiera brakujące pieśni, usuwa nieaktualne wersje. onProgress(done, total).
  async function sync(index, onProgress = () => {}) {
    const harmonizations = listHarmonizations(index.folders);
    const cache = await caches.open(SONGS_CACHE);
    const wanted = new Set(harmonizations.map((h) => new URL(songUrl(h), location.href).href));
    for (const req of await cache.keys()) if (!wanted.has(req.url)) await cache.delete(req);

    const missing = [];
    for (const h of harmonizations) if (!(await cache.match(songUrl(h)))) missing.push(h);
    let done = 0;
    onProgress(done, missing.length);
    const queue = [...missing];
    const worker = async () => {
      while (queue.length) {
        const h = queue.shift();
        const res = await fetch(songUrl(h));
        if (res.ok) await cache.put(songUrl(h), res);
        onProgress(++done, missing.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return status(index);
  }

  export { supported, songUrl, register, status, sync };
