/* Logika tonacji: wyznaczanie interwału transpozycji dla Verovio. */
const LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

  // Dozwolone tonacje docelowe wg wysokości dźwięku (0 = C). Bez Cis-, Ces-, Ges-dur.
  const MAJOR = [
    { n: 'C', pl: 'C-dur' }, { n: 'Db', pl: 'Des-dur' }, { n: 'D', pl: 'D-dur' }, { n: 'Eb', pl: 'Es-dur' },
    { n: 'E', pl: 'E-dur' }, { n: 'F', pl: 'F-dur' }, { n: 'F#', pl: 'Fis-dur' }, { n: 'G', pl: 'G-dur' },
    { n: 'Ab', pl: 'As-dur' }, { n: 'A', pl: 'A-dur' }, { n: 'Bb', pl: 'B-dur' }, { n: 'B', pl: 'H-dur' },
  ];
  const MINOR = [
    { n: 'c', pl: 'c-moll' }, { n: 'c#', pl: 'cis-moll' }, { n: 'd', pl: 'd-moll' }, { n: 'eb', pl: 'es-moll' },
    { n: 'e', pl: 'e-moll' }, { n: 'f', pl: 'f-moll' }, { n: 'f#', pl: 'fis-moll' }, { n: 'g', pl: 'g-moll' },
    { n: 'g#', pl: 'gis-moll' }, { n: 'a', pl: 'a-moll' }, { n: 'bb', pl: 'b-moll' }, { n: 'b', pl: 'h-moll' },
  ];

  // Nazwa tonacji wzorcowej wg liczby krzyżyków/bemoli (-7..7).
  const FIFTHS_MAJOR = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const FIFTHS_MINOR = ['ab', 'eb', 'bb', 'f', 'c', 'g', 'd', 'a', 'e', 'b', 'f#', 'c#', 'g#', 'd#', 'a#'];
  const PL_ROOT = { c: 'c', d: 'd', e: 'e', f: 'f', g: 'g', a: 'a', b: 'h' };

  const mod = (a, n) => ((a % n) + n) % n;

  function parseName(name) {
    const letter = LETTERS.indexOf(name[0].toLowerCase());
    const accid = name.length > 1 ? (name[1] === '#' ? 1 : -1) : 0;
    return { letter, pc: mod(LETTER_PC[letter] + accid, 12) };
  }

  function polishName(name, minor) {
    const l = name[0].toLowerCase();
    let root;
    if (!name[1]) root = PL_ROOT[l];
    else if (name[1] === '#') root = PL_ROOT[l] + 'is';
    else root = l === 'b' ? 'b' : l === 'a' ? 'as' : l === 'e' ? 'es' : l + 'es';
    if (!minor) root = root[0].toUpperCase() + root.slice(1);
    return root + (minor ? '-moll' : '-dur');
  }

  function originalKey(fifths, minor) {
    const name = (minor ? FIFTHS_MINOR : FIFTHS_MAJOR)[fifths + 7];
    const { letter, pc } = parseName(name);
    return { name, letter, pc, minor, label: polishName(name, minor) };
  }

  // Interwał Verovio (np. "-M3") z tonacji wzorcowej o `shift` półtonów w górę/dół.
  function intervalFor(orig, shift) {
    if (shift === 0) return '';
    const table = orig.minor ? MINOR : MAJOR;
    const target = parseName(table[mod(orig.pc + shift, 12)].n);
    const up = shift > 0;
    const steps = up ? mod(target.letter - orig.letter, 7) : mod(orig.letter - target.letter, 7);
    const number = steps + 1;
    const semis = Math.abs(shift);
    const ref = LETTER_PC[steps];
    const diff = semis - ref;
    const perfect = number === 1 || number === 4 || number === 5;
    let quality;
    if (perfect) quality = diff === 0 ? 'P' : diff > 0 ? 'A'.repeat(diff) : 'd'.repeat(-diff);
    else quality = diff === 0 ? 'M' : diff === -1 ? 'm' : diff > 0 ? 'A'.repeat(diff) : 'd'.repeat(-diff - 1);
    return (up ? '' : '-') + quality + number;
  }

  function keyLabel(orig, shift) {
    if (shift === 0) return orig.label;
    const table = orig.minor ? MINOR : MAJOR;
    return table[mod(orig.pc + shift, 12)].pl;
  }

  export { originalKey, intervalFor, keyLabel };
