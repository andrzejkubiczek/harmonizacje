/* Sterowanie: tonacja, zwrotki, układ strony, skróty klawiszowe. */
import { MAX_SHIFT } from './constants.js';
import { $, el } from './dom.js';
import { state } from './state.js';
import * as Music from './music.js';
import { hooks, layoutMode, pageCount, render } from './sheet.js';
import { openFinder } from './library.js';

export function updateControls() {
  const song = state.song;
  el.keyGroup.hidden = !song;
  el.verseGroup.hidden = !song || pageCount() < 2;
  if (!song) return;
  el.keyName.textContent = Music.keyLabel(state.key, state.shift);
  el.keySub.textContent = state.shift === 0 ? 'wzorcowa' : `${state.shift > 0 ? '+' : '−'}${Math.abs(state.shift)} pół.`;
  el.keyUp.disabled = state.shift >= MAX_SHIFT;
  el.keyDown.disabled = state.shift <= -MAX_SHIFT;

  const total = 2 + (song.stanzas?.length || 0);
  const from = state.page * 2 + 1;
  const to = Math.min(from + 1, total);
  el.verseName.textContent = from === to ? `${from}` : `${from}–${to}`;
  el.versePrev.disabled = state.page === 0;
  el.verseNext.disabled = state.page >= pageCount() - 1;
}
hooks.rendered = updateControls;

function setShift(value) {
  const next = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, value));
  if (next === state.shift) return;
  state.shift = next;
  localStorage.setItem(`shift:${state.song.id}`, String(next));
  render();
}

function setPage(value) {
  const next = Math.max(0, Math.min(pageCount() - 1, value));
  if (next === state.page) return;
  state.page = next;
  render();
}

el.keyUp.addEventListener('click', () => setShift(state.shift + 1));
el.keyDown.addEventListener('click', () => setShift(state.shift - 1));
el.versePrev.addEventListener('click', () => setPage(state.page - 1));
el.verseNext.addEventListener('click', () => setPage(state.page + 1));

$('btnLayout').addEventListener('click', () => {
  state.layout = layoutMode() === 'a4' ? 'screen' : 'a4';
  localStorage.setItem('layout', state.layout);
  document.body.dataset.layout = state.layout;
  render(false);
});

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if (e.key === '/') { openFinder(); e.preventDefault(); return; }
  if (e.key === 'ArrowUp') { setShift(state.shift + 1); e.preventDefault(); }
  else if (e.key === 'ArrowDown') { setShift(state.shift - 1); e.preventDefault(); }
  else if (e.key === 'ArrowRight') setPage(state.page + 1);
  else if (e.key === 'ArrowLeft') setPage(state.page - 1);
});
