/* Podkładanie tekstu pod nuty: sylabizacja polska, dopasowanie do nut, wstawianie <lyric> do MusicXML. */
const VOWELS = 'aeiouyąęó';
  const DIGRAPHS = ['dż', 'dź', 'dz', 'cz', 'sz', 'rz', 'ch'];
  const LIQUIDS = ['r', 'l', 'ł'];
  const STOP_OR_FRIC = ['p', 'b', 't', 'd', 'k', 'g', 'f', 'w', 's', 'z', 'ś', 'ź', 'c', 'ć', 'h', 'ch', 'sz', 'ż', 'rz',
    'cz', 'dz', 'dź', 'dż', 'm', 'n', 'ń'];
  const FRICATIVES = ['s', 'ś', 'z', 'ź', 'sz', 'ż', 'w', 'f', 'ch'];
  const AFTER_FRICATIVE = ['t', 'p', 'k', 'n', 'ń', 'm', 'c', 'ć', 'w'];

  const isVowel = (ch) => ch !== undefined && VOWELS.includes(ch.toLowerCase());
  const hasLetters = (s) => /\p{L}/u.test(s);

  function units(str) {
    const out = [];
    for (let i = 0; i < str.length;) {
      const two = str.slice(i, i + 2);
      if (DIGRAPHS.includes(two)) { out.push(two); i += 2; } else { out.push(str[i]); i += 1; }
    }
    return out;
  }

  const validOnset = (u) => {
    if (u.length === 1) return true;
    if (u.length === 2) {
      return (STOP_OR_FRIC.includes(u[0]) && LIQUIDS.includes(u[1])) ||
        (FRICATIVES.includes(u[0]) && AFTER_FRICATIVE.includes(u[1]));
    }
    return u.length === 3 && FRICATIVES.includes(u[0]) && ['p', 't', 'k'].includes(u[1]) && LIQUIDS.includes(u[2]);
  };

  // Podział pojedynczego słowa (bez znaków interpunkcyjnych) na sylaby.
  function syllabify(core) {
    const low = core.toLowerCase();
    const n = low.length;
    const nuclei = [];
    for (let i = 0; i < n;) {
      if (!isVowel(low[i])) { i += 1; continue; }
      if (low[i] === 'i' && i > 0 && !isVowel(low[i - 1]) && isVowel(low[i + 1])) { nuclei.push([i, i + 2]); i += 2; }
      else if (i === 0 && (low[i] === 'a' || low[i] === 'e') && low[i + 1] === 'u') { nuclei.push([0, 2]); i += 2; }
      else { nuclei.push([i, i + 1]); i += 1; }
    }
    if (nuclei.length <= 1) return [core];

    const bounds = [0];
    for (let k = 0; k < nuclei.length - 1; k++) {
      const from = nuclei[k][1];
      const us = units(low.slice(from, nuclei[k + 1][0]));
      let take = Math.min(us.length, 3);
      while (take > 1 && !validOnset(us.slice(us.length - take))) take -= 1;
      const coda = us.slice(0, us.length - take).join('').length;
      bounds.push(from + coda);
    }
    bounds.push(n);
    return bounds.slice(1).map((end, i) => core.slice(bounds[i], end));
  }

  function splitPunct(part) {
    const m = /^([^\p{L}\d]*)(.*?)([^\p{L}\d]*)$/su.exec(part);
    return { lead: m[1], core: m[2], trail: m[3] };
  }

  // Sylaby jednego członu: jawne myślniki mają pierwszeństwo przed automatem.
  function partSyllables(part) {
    const { lead, core, trail } = splitPunct(part);
    const pieces = core.includes('-') ? core.split('-').filter(Boolean) : syllabify(core);
    if (!pieces.length) return [];
    return pieces.map((text, i) => ({
      text: (i === 0 ? lead : '') + text + (i === pieces.length - 1 ? trail : ''),
      start: i === 0,
      end: i === pieces.length - 1,
    }));
  }

  const wordPos = (s) => (s.start && s.end ? 'single' : s.start ? 'begin' : s.end ? 'end' : 'middle');

  // Tekst zwrotki -> lista sylab {text, wordpos} lub {skip} (nuta bez sylaby).
  function parseStanza(text) {
    let words = text.split(/\s+/).filter(Boolean);
    if (words.length && /^\d+\.$/.test(words[0])) words.shift();
    else if (words.length) words[0] = words[0].replace(/^\d+\.\s*/, '');

    // Słowa bez samogłoski (w, z) łączymy z następnym.
    const merged = [];
    for (let i = 0; i < words.length; i++) {
      const letters = words[i].replace(/[^\p{L}]/gu, '');
      const vowelless = letters && !/[aeiouyąęó]/i.test(letters) && !words[i].includes('-') && !words[i].includes('~');
      if (vowelless && i + 1 < words.length) words[i + 1] = `${words[i]}~${words[i + 1]}`;
      else merged.push(words[i]);
    }
    words = merged;

    const out = [];
    for (const word of words) {
      if (word === '_') { out.push({ skip: true }); continue; }
      if (!hasLetters(word)) continue;
      let syl = [];
      for (const part of word.split('~').filter(Boolean)) {
        const next = partSyllables(part);
        if (!next.length) continue;
        if (syl.length) {
          const a = syl.pop();
          const b = next.shift();
          syl.push({ text: `${a.text} ${b.text}`, start: a.start, end: b.end });
        }
        syl = syl.concat(next);
      }
      syl.forEach((s) => out.push({ text: s.text, wordpos: wordPos(s) }));
    }
    return out;
  }

  // Nuty, pod którymi stoi tekst (kolejność w utworze). Bez tekstu w pliku: nuty górnego głosu bez wiązań i łuków.
  function getSlots(doc) {
    const part = doc.querySelector('part');
    if (!part) return [];
    const notes = [...part.querySelectorAll('note')].filter((n) => !n.querySelector(':scope > rest'));
    const withLyrics = notes.filter((n) => n.querySelector(':scope > lyric'));
    if (withLyrics.length) return withLyrics;

    const staff = (n) => n.querySelector(':scope > staff')?.textContent || '1';
    const voice = (n) => parseInt(n.querySelector(':scope > voice')?.textContent || '1', 10);
    const top = notes.filter((n) => staff(n) === '1');
    if (!top.length) return [];
    const topVoice = Math.min(...top.map(voice));
    let slurred = false;
    return top.filter((n) => {
      if (voice(n) !== topVoice || n.querySelector(':scope > chord')) return false;
      const tiedStop = n.querySelector(':scope > tie[type="stop"]');
      const slurStop = n.querySelector('slur[type="stop"]');
      const slurStart = n.querySelector('slur[type="start"]');
      const keep = !tiedStop && !slurred;
      if (slurStart) slurred = true;
      if (slurStop) slurred = false;
      return keep;
    });
  }

  function removeLyrics(doc) {
    doc.querySelectorAll('lyric').forEach((l) => l.remove());
  }

  // Wstawia zwrotkę jako wers `verse` (1 lub 2) pod podane nuty. `label` to numer zwrotki doklejany do pierwszej sylaby.
  function injectStanza(doc, slots, tokens, verse, label) {
    let first = true;
    tokens.forEach((tok, i) => {
      if (tok.skip || !slots[i]) return;
      const lyric = doc.createElement('lyric');
      lyric.setAttribute('number', String(verse));
      const syllabic = doc.createElement('syllabic');
      syllabic.textContent = tok.wordpos;
      const text = doc.createElement('text');
      text.textContent = (first && label ? `${label}. ` : '') + tok.text;
      first = false;
      lyric.append(syllabic, text);
      slots[i].append(lyric);
    });
  }

  // Zapis podglądowy: kropki w słowach, spacje między słowami.
  function preview(tokens) {
    let s = '';
    tokens.forEach((t, i) => {
      if (t.skip) { s += (i ? ' ' : '') + '_'; return; }
      const prev = tokens[i - 1];
      const joined = prev && !prev.skip && (prev.wordpos === 'begin' || prev.wordpos === 'middle');
      s += (i ? (joined ? '\u2027' : ' ') : '') + t.text;
    });
    return s;
  }

  export { syllabify, parseStanza, getSlots, removeLyrics, injectStanza, preview };
