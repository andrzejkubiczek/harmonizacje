export const $ = (id) => document.getElementById(id);

export const el = {
  tree: $('tree'), search: $('search'), adminLink: $('adminLink'),
  bar: $('bar'), crumb: $('crumb'), stage: $('stage'), wrap: $('wrap'), sheet: $('sheet'),
  title: $('title'), authors: $('authors'), score: $('score'), verses: $('verses'),
  harmonyGroup: $('harmonyGroup'), harmonySelect: $('harmonySelect'),
  empty: $('empty'), loading: $('loading'),
  keyGroup: $('keyGroup'), keyName: $('keyName'), keySub: $('keySub'), keyUp: $('keyUp'), keyDown: $('keyDown'),
  verseGroup: $('verseGroup'), verseName: $('verseName'), versePrev: $('versePrev'), verseNext: $('verseNext'),
};
