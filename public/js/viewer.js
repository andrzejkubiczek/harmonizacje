/* Otwieranie pieśni i routing (#song=<id>). */
import { MAX_SHIFT } from './constants.js';
import { el } from './dom.js';
import { state } from './state.js';
import { findPath } from './catalog.js';
import * as Lyrics from './lyrics.js';
import * as Music from './music.js';
import * as Offline from './offline.js';
import { resetCaches } from './engine.js';
import { render } from './sheet.js';
import { updateControls } from './controls.js';
import { renderTree } from './library.js';

const parseXml = (xml) => new DOMParser().parseFromString(xml, 'application/xml');

function readKey(doc) {
  const key = doc.querySelector('key');
  const fifths = parseInt(key?.querySelector('fifths')?.textContent ?? '0', 10);
  const minor = key?.querySelector('mode')?.textContent.trim() === 'minor';
  return Music.originalKey(Math.max(-7, Math.min(7, fifths || 0)), minor);
}

function showEmpty(message) {
  state.song = null;
  state.harmonization = null;
  el.harmonyGroup.hidden = true;
  el.wrap.hidden = true;
  el.empty.hidden = false;
  if (message) el.empty.querySelector('.empty-title').textContent = message;
  updateControls();
}

let routeToken = 0;

async function openSong(id, harmonyId, token) {
  const path = findPath(state.index.folders, id);
  if (!path) { showEmpty(); return; }
  const song = path[path.length - 1].songs.find((s) => s.id === id);
  const harmonizations = song.harmonizations || [];
  const harmonization = harmonizations.find((h) => h.id === harmonyId) || harmonizations[0];
  if (!harmonization) { showEmpty('Ta pieśń nie ma harmonizacji.'); return; }
  el.loading.hidden = false;
  let xml;
  try {
    const res = await fetch(Offline.songUrl(harmonization));
    if (!res.ok) throw new Error(res.status);
    xml = await res.text();
  } catch {
    if (token !== routeToken) return;
    el.loading.hidden = true;
    showEmpty('Nie udało się wczytać pieśni.');
    return;
  }
  if (token !== routeToken) return;
  el.loading.hidden = true;

  const doc = parseXml(xml);
  state.song = song;
  state.harmonization = harmonization;
  state.xml = xml;
  state.key = readKey(doc);
  state.slotCount = Lyrics.getSlots(doc).length;
  state.shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, parseInt(localStorage.getItem(`shift:${id}`) || '0', 10) || 0));
  state.page = 0;
  resetCaches();

  el.crumb.textContent = path.map((f) => f.name).join(' › ');
  el.harmonyGroup.hidden = harmonizations.length < 2;
  el.harmonySelect.textContent = '';
  harmonizations.forEach((item, i) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.author || `Harmonizacja ${i + 1}`;
    option.selected = item.id === harmonization.id;
    el.harmonySelect.append(option);
  });
  el.empty.hidden = true;
  el.wrap.hidden = false;
  document.title = `${song.title} – Harmonizacje`;
  path.forEach((f) => state.expanded.add(f.id));
  if (!el.search.value) renderTree();
  await render();
}

export function route() {
  const token = ++routeToken;
  const m = /^#song=([a-z0-9-]+)(?:&harmony=([a-z0-9-]+))?$/.exec(location.hash);
  if (m) openSong(m[1], m[2], token); else showEmpty();
}
