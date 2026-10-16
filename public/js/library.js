/* Menu boczne z drzewem pieśni oraz okno wyszukiwarki (także w pełnym ekranie). */
import { COMPACT_W } from './constants.js';
import { $, el } from './dom.js';
import { state } from './state.js';
import { allSongs, countSongs, findSongs, fold, harmonizationCount, songSort } from './catalog.js';
import { wake } from './focus.js';

export function openDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
}
$('btnMenu').addEventListener('click', () => openDrawer(!document.body.classList.contains('drawer-open')));
$('btnCloseMenu').addEventListener('click', () => openDrawer(false));
$('scrim').addEventListener('click', () => openDrawer(false));

function noHits(parent) {
  const p = document.createElement('p');
  p.className = 'no-hits';
  p.textContent = 'Brak wyników.';
  parent.append(p);
}

function songButton(song, path) {
  const b = document.createElement('button');
  b.className = 'song' + (state.song?.id === song.id ? ' active' : '');
  b.type = 'button';
  const num = document.createElement('span');
  num.className = 'song-num';
  num.textContent = song.ddn || '';
  const title = document.createElement('span');
  title.className = 'song-title';
  title.textContent = song.title;
  if ((song.harmonizations || []).length > 1) {
    const count = document.createElement('small');
    count.textContent = harmonizationCount(song.harmonizations.length);
    title.append(count);
  }
  b.append(num, title);
  if (path) {
    const small = document.createElement('small');
    small.textContent = path;
    title.append(small);
  }
  b.addEventListener('click', () => {
    location.hash = `song=${song.id}`;
    if (window.innerWidth <= COMPACT_W) openDrawer(false);
  });
  return b;
}

function folderNode(folder) {
  const wrap = document.createElement('div');
  wrap.className = 'folder' + (state.expanded.has(folder.id) ? ' open' : '');
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'folder-head';
  head.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg><span class="folder-name"></span><span class="folder-count"></span>';
  head.querySelector('.folder-name').textContent = folder.name;
  head.querySelector('.folder-count').textContent = countSongs(folder) || '';
  head.addEventListener('click', () => {
    if (state.expanded.has(folder.id)) state.expanded.delete(folder.id); else state.expanded.add(folder.id);
    localStorage.setItem('expanded', JSON.stringify([...state.expanded]));
    wrap.classList.toggle('open');
  });
  const inner = document.createElement('div');
  folder.folders.forEach((f) => inner.append(folderNode(f)));
  [...folder.songs].sort(songSort).forEach((s) => inner.append(songButton(s)));
  const body = document.createElement('div');
  body.className = 'folder-body';
  body.append(inner);
  wrap.append(head, body);
  return wrap;
}

export function renderTree() {
  el.tree.textContent = '';
  const q = fold(el.search.value.trim());
  if (!q) {
    state.index.folders.forEach((f) => el.tree.append(folderNode(f)));
    return;
  }
  const hits = [...allSongs(state.index.folders)].filter(({ song }) =>
    fold(`${song.title} ${(song.harmonizations || []).map((h) => h.author || '').join(' ')} ${song.ddn || ''}`).includes(q));
  if (!hits.length) noHits(el.tree);
  hits.forEach(({ song, path }) => el.tree.append(songButton(song, path)));
}
el.search.addEventListener('input', renderTree);

/* ---------- Wyszukiwarka ---------- */

const finder = $('finder');
const finderInput = $('finderInput');
const finderResults = $('finderResults');

export function closeFinder() {
  finder.hidden = true;
  finderInput.blur();
}

export function openFinder() {
  finder.hidden = false;
  finderInput.value = '';
  finderResults.textContent = '';
  wake();
  finderInput.focus(); // synchronicznie, aby iPad pokazał klawiaturę (wymaga gestu użytkownika)
}

function renderFinder() {
  finderResults.textContent = '';
  const raw = finderInput.value.trim();
  if (!raw) return;
  const hits = findSongs(state.index, raw).slice(0, 40);
  if (!hits.length) { noHits(finderResults); return; }
  hits.forEach(({ song, path }, i) => {
    const b = songButton(song, path);
    if (i === 0) b.classList.add('first');
    b.addEventListener('click', closeFinder);
    finderResults.append(b);
  });
}

$('btnFind').addEventListener('click', openFinder);
finderInput.addEventListener('input', renderFinder);
finderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') finderResults.querySelector('.song')?.click();
  else if (e.key === 'Escape') closeFinder();
});
finder.addEventListener('pointerdown', (e) => { if (e.target === finder) closeFinder(); });
