/* Tryb offline: rejestracja Service Workera i pobieranie wszystkich pieśni z góry. */
const SONGS_CACHE = 'harmonizacje-songs';
  const songUrl = (song) => `data/songs/${encodeURIComponent(song.id)}.musicxml?v=${song.rev || 0}`;

  function listSongs(folders, out = []) {
    for (const f of folders) {
      out.push(...f.songs);
      listSongs(f.folders, out);
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
    const songs = listSongs(index.folders);
    const cache = await caches.open(SONGS_CACHE);
    let cached = 0;
    for (const s of songs) if (await cache.match(songUrl(s))) cached++;
    return { cached, total: songs.length };
  }

  // Pobiera brakujące pieśni, usuwa nieaktualne wersje. onProgress(done, total).
  async function sync(index, onProgress = () => {}) {
    const songs = listSongs(index.folders);
    const cache = await caches.open(SONGS_CACHE);
    const wanted = new Set(songs.map((s) => new URL(songUrl(s), location.href).href));
    for (const req of await cache.keys()) if (!wanted.has(req.url)) await cache.delete(req);

    const missing = [];
    for (const s of songs) if (!(await cache.match(songUrl(s)))) missing.push(s);
    let done = 0;
    onProgress(done, missing.length);
    const queue = [...missing];
    const worker = async () => {
      while (queue.length) {
        const s = queue.shift();
        const res = await fetch(songUrl(s));
        if (res.ok) await cache.put(songUrl(s), res);
        onProgress(++done, missing.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return status(index);
  }

  export { supported, songUrl, register, status, sync };
