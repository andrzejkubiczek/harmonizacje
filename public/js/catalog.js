/* Operacje na spisie pieśni (bez dostępu do DOM). */

export const fold = (s) => s.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');

export function* allSongs(folders, path = []) {
  for (const f of folders) {
    const here = [...path, f.name];
    for (const song of f.songs) yield { song, path: here.join(' › ') };
    yield* allSongs(f.folders, here);
  }
}

export function findPath(folders, songId, path = []) {
  for (const f of folders) {
    const here = [...path, f];
    if (f.songs.some((s) => s.id === songId)) return here;
    const deeper = findPath(f.folders, songId, here);
    if (deeper) return deeper;
  }
  return null;
}

export const countSongs = (folder) => folder.songs.length + folder.folders.reduce((n, f) => n + countSongs(f), 0);

export function songSort(a, b) {
  const na = a.ddn ? parseInt(a.ddn, 10) : Infinity;
  const nb = b.ddn ? parseInt(b.ddn, 10) : Infinity;
  return na - nb || a.title.localeCompare(b.title, 'pl');
}

// Same cyfry: po numerze (dokładne trafienie pierwsze); w przeciwnym razie po tytule i autorze.
export function findSongs(index, raw) {
  const q = fold(raw);
  if (!q) return [];
  const all = [...allSongs(index.folders)];
  if (/^\d+$/.test(q)) {
    return all.filter(({ song }) => (song.ddn || '').startsWith(q))
      .sort((a, b) => (b.song.ddn === q) - (a.song.ddn === q) || parseInt(a.song.ddn, 10) - parseInt(b.song.ddn, 10));
  }
  return all.filter(({ song }) => fold(`${song.title} ${song.author || ''}`).includes(q))
    .sort((a, b) => a.song.title.localeCompare(b.song.title, 'pl'));
}
