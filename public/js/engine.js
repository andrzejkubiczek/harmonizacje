/* Silnik nut: przygotowanie MusicXML (zwrotki), układ w Verovio, dopasowanie skali do kartki, pamięć podręczna. */
import { BASE_SPACING, COARSE, MAX_SCALE, MAX_SPACING, MIN_SCALE } from './constants.js';
import { state } from './state.js';
import * as Lyrics from './lyrics.js';
import * as Music from './music.js';

let tk = null;
let scaleHint = 0;
const meiCache = new Map();
const scoreCache = new Map();

export const ready = window.verovioReady.then(() => {
  tk = new verovio.toolkit();
  tk.setOptions({
    font: 'Leland',
    header: 'none',
    footer: 'none',
    breaks: 'auto',
    adjustPageHeight: true,
    pageHeight: 60000,
    pageMarginLeft: 90,
    pageMarginRight: 30,
    pageMarginTop: 20,
    pageMarginBottom: 30,
    systemDivider: 'none',
    spacingSystem: BASE_SPACING,
    spacingStaff: 8,
    spacingBraceGroup: 6,
    lyricSize: 5.2,
    lyricTopMinMargin: 2,
    lyricWordSpace: 3,
    spacingLinear: 0.4,
    svgRemoveXlink: true,
  });
});

export function resetCaches() {
  meiCache.clear();
  scoreCache.clear();
  scaleHint = 0;
}

// Zwrotki strony: które trafiają pod nuty (liczba sylab = liczba nut), a które jako zwykły tekst.
export function stanzaPlan(page) {
  if (page === 0) return [];
  const extras = state.song.stanzas;
  const items = [];
  for (let i = (page - 1) * 2; i < Math.min(extras.length, page * 2); i++) {
    const tokens = Lyrics.parseStanza(extras[i]);
    items.push({ number: i + 3, text: extras[i], tokens, fits: state.slotCount > 0 && tokens.length === state.slotCount });
  }
  return items;
}

function buildSource(page) {
  if (page === 0) return state.xml;
  const doc = new DOMParser().parseFromString(state.xml, 'application/xml');
  const slots = Lyrics.getSlots(doc);
  Lyrics.removeLyrics(doc);
  stanzaPlan(page).filter((it) => it.fits)
    .forEach((it, k) => Lyrics.injectStanza(doc, slots, it.tokens, k + 1, it.number));
  return new XMLSerializer().serializeToString(doc);
}

// MusicXML -> MEI bez łączących kresek taktowych między pięcioliniami (nie przechodzą przez tekst).
function getMei(page) {
  const id = `${state.harmonization.id}:${page}`;
  if (!meiCache.has(id)) {
    tk.setOptions({ transpose: '' });
    tk.loadData(buildSource(page));
    meiCache.set(id, tk.getMEI().replace(/bar\.thru="true"/g, 'bar.thru="false"'));
  }
  return meiCache.get(id);
}

function svgHeight(svg) {
  const m = /<svg[^>]*\sheight="([\d.]+)px"/.exec(svg);
  return m ? parseFloat(m[1]) : Infinity;
}

// Największa skala, przy której muzyka mieści się w dostępnej wysokości (szukanie zgrubne, potem dokładne).
function fitMusic(mei, interval, availH, contentW) {
  tk.setOptions({ transpose: interval });
  tk.loadData(mei);
  const memo = new Map();
  const attempt = (scale, spacing = BASE_SPACING) => {
    const key = `${scale}/${spacing}`;
    if (!memo.has(key)) {
      tk.setOptions({ scale, spacingSystem: spacing, pageWidth: Math.round((contentW * 100) / scale) });
      tk.redoLayout();
      const svg = tk.renderToSVG(1);
      memo.set(key, { scale, svg, h: svgHeight(svg), pages: tk.getPageCount() });
    }
    return memo.get(key);
  };
  const fits = (scale, spacing) => {
    const r = attempt(scale, spacing);
    return r.pages === 1 && r.h <= availH;
  };

  let s = scaleHint ? Math.min(MAX_SCALE, scaleHint + COARSE) : MAX_SCALE;
  if (fits(s)) {
    while (s + COARSE <= MAX_SCALE && fits(s + COARSE)) s += COARSE;
    if (s + 2 <= MAX_SCALE && fits(s + 2)) s += 2;
    if (s + 1 <= MAX_SCALE && fits(s + 1)) s += 1;
  } else {
    do { s -= COARSE; } while (s > MIN_SCALE && !fits(s));
    if (s <= MIN_SCALE) return attempt(MIN_SCALE);
    if (fits(s + 2)) s += 2;
    if (fits(s + 1)) s += 1;
  }
  scaleHint = s;

  // Zapas wysokości rozdzielamy na odstępy między systemami.
  let lo = BASE_SPACING;
  let hi = MAX_SPACING;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(s, mid)) lo = mid; else hi = mid - 1;
  }
  return attempt(s, lo);
}

// ctx: { page, height, availH, contentW }
export function scoreFor(ctx, shift) {
  const key = `${state.harmonization.id}|${ctx.page}|${shift}|${ctx.height}|${ctx.availH}`;
  if (!scoreCache.has(key)) {
    if (scoreCache.size > 60) scoreCache.delete(scoreCache.keys().next().value);
    const interval = Music.intervalFor(state.key, shift);
    scoreCache.set(key, fitMusic(getMei(ctx.page), interval, ctx.availH, ctx.contentW).svg);
  }
  return scoreCache.get(key);
}
