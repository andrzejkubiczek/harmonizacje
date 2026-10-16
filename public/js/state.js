export const state = {
  index: { folders: [] },
  song: null,       // wpis z index.json
  xml: null,
  key: null,        // tonacja wzorcowa
  slotCount: 0,     // liczba nut, pod którymi stoi tekst
  shift: 0,
  page: 0,          // 0 = zwrotki z MusicXML, 1+ = dodatkowe zwrotki tekstowe
  layout: localStorage.getItem('layout'), // 'a4' | 'screen' | null (auto wg orientacji)
  expanded: new Set(JSON.parse(localStorage.getItem('expanded') || '[]')),
};
