/* Kartka: rozmiar, rysowanie nut i zwrotek, skalowanie do ekranu. */
import { MAX_SHIFT, PAD_BOTTOM, PAD_SIDE, PAD_TOP, SHEET_H, SHEET_W } from './constants.js';
import { el } from './dom.js';
import { state } from './state.js';
import { ready, scoreFor, stanzaPlan } from './engine.js';

export const hooks = { rendered() {} };
let renderToken = 0;

export function layoutMode() {
  if (state.layout) return state.layout;
  return el.stage.clientWidth > el.stage.clientHeight ? 'screen' : 'a4';
}

function sheetHeight() {
  if (layoutMode() === 'a4') return SHEET_H;
  const w = el.stage.clientWidth || 1;
  const h = el.stage.clientHeight || 1;
  return Math.max(1300, Math.round((SHEET_W * h) / w));
}

export function pageCount() {
  return 1 + Math.ceil((state.song?.stanzas?.length || 0) / 2);
}

function renderVerses() {
  el.verses.textContent = '';
  for (const item of stanzaPlan(state.page).filter((it) => !it.fits)) {
    const wrap = document.createElement('div');
    wrap.className = 'verse';
    const num = document.createElement('span');
    num.className = 'verse-num';
    num.textContent = /^\s*\d+\./.test(item.text) ? '' : `${item.number}.`;
    const body = document.createElement('p');
    body.textContent = item.text;
    wrap.append(num, body);
    el.verses.append(wrap);
  }
}

export function fitSheet() {
  if (!state.song) return;
  const cs = getComputedStyle(el.stage);
  const w = el.stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = el.stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const sheetH = Math.max(sheetHeight(), el.sheet.offsetHeight);
  const k = Math.min(w / SHEET_W, h / sheetH);
  el.wrap.style.width = `${SHEET_W * k}px`;
  el.wrap.style.height = `${sheetH * k}px`;
  el.sheet.style.transform = `scale(${k})`;
}

// Po wyświetleniu przygotowujemy w tle sąsiednie tonacje, żeby zmiana była natychmiastowa.
function prefetchKeys(ctx, token) {
  const queue = [state.shift + 1, state.shift - 1].filter((s) => Math.abs(s) <= MAX_SHIFT);
  const next = () => {
    if (token !== renderToken || !queue.length) return;
    scoreFor(ctx, queue.shift());
    setTimeout(next, 60);
  };
  setTimeout(next, 350);
}

export async function render(animate = true) {
  if (!state.song || !state.xml) return;
  const token = ++renderToken;
  await ready;
  if (animate) {
    el.score.classList.add('fading');
    el.verses.classList.add('fading');
    await new Promise((r) => setTimeout(r, 70));
    if (token !== renderToken) return;
  }

  const height = sheetHeight();
  el.sheet.style.minHeight = `${height}px`;
  el.title.textContent = state.song.title;
  el.authors.textContent = state.harmonization?.author || '';
  el.authors.hidden = !state.harmonization?.author;
  renderVerses();

  const used = el.title.offsetHeight + (el.authors.hidden ? 0 : el.authors.offsetHeight) + el.verses.offsetHeight;
  const ctx = {
    page: state.page,
    height,
    availH: height - PAD_TOP - PAD_BOTTOM - used - 30,
    contentW: SHEET_W - 2 * PAD_SIDE,
  };
  const svg = scoreFor(ctx, state.shift);
  if (token !== renderToken) return;
  el.score.innerHTML = svg;

  fitSheet();
  requestAnimationFrame(() => {
    el.score.classList.remove('fading');
    el.verses.classList.remove('fading');
  });
  hooks.rendered();
  prefetchKeys(ctx, token);
}

let resizeTimer;
window.addEventListener('resize', () => {
  fitSheet();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(false), 150);
});
window.addEventListener('orientationchange', () => setTimeout(() => render(false), 200));
