import * as Lyrics from './lyrics.js';

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    tree: $('adminTree'), form: $('songForm'), empty: $('formEmpty'), formTitle: $('formTitle'),
    folder: $('fFolder'), file: $('fFile'), fileLabel: $('fileLabel'), fileHint: $('fileHint'), drop: $('fileDrop'),
    title: $('fTitle'), author: $('fAuthor'), ddn: $('fDdn'), stanzas: $('stanzaList'),
    save: $('btnSave'), del: $('btnDelete'), toast: $('toast'), filter: $('aSearch'),
    dialog: $('dialog'), dialogTitle: $('dialogTitle'), dialogText: $('dialogText'), dialogInput: $('dialogInput'),
  };

  const state = { index: { folders: [] }, editing: null, xml: null, slotCount: 0, open: new Set() };
  let toastTimer = null;

  const ICONS = {
    addSong: '<path d="M6 3h8l4 4v14H6z"/><path d="M12 11v6M9 14h6"/>',
    addFolder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M12 10v6M9 13h6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  };

  /* ---------- API ---------- */

  async function api(method, path, body) {
    const res = await fetch(`api/${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Operacja nie powiodła się.');
    return data;
  }

  async function reload() {
    state.index = await fetch('data/index.json', { cache: 'no-store' }).then((r) => r.json());
    renderTree();
    fillFolderSelect();
  }

  function toast(message, isError = false) {
    el.toast.textContent = message;
    el.toast.classList.toggle('error', isError);
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200);
  }

  async function run(fn, success) {
    try {
      await fn();
      if (success) toast(success);
    } catch (e) {
      toast(e.message, true);
    }
  }

  /* ---------- Okna dialogowe ---------- */

  function ask({ title, text = '', input = null, ok = 'OK' }) {
    return new Promise((resolve) => {
      el.dialogTitle.textContent = title;
      el.dialogText.textContent = text;
      el.dialogText.hidden = !text;
      el.dialogInput.hidden = input === null;
      el.dialogInput.required = input !== null;
      el.dialogInput.value = input ?? '';
      $('dialogOk').textContent = ok;
      $('dialogOk').classList.toggle('danger', input === null);
      el.dialog.addEventListener('close', () => {
        resolve(el.dialog.returnValue === 'ok' ? (input === null ? true : el.dialogInput.value.trim()) : null);
      }, { once: true });
      el.dialog.showModal();
      if (input !== null) el.dialogInput.select();
    });
  }

  /* ---------- Drzewo ---------- */

  function button(label, title, onClick, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `mini ${cls}`.trim();
    if (ICONS[label]) b.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[label]}</svg>`;
    else b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  const fold = (s) => s.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  const matches = (song, q) => !q || fold(`${song.title} ${song.author || ''} ${song.ddn || ''}`).includes(q);
  const hasMatch = (folder, q) => folder.songs.some((s) => matches(s, q)) || folder.folders.some((f) => hasMatch(f, q));

  function songRow(song) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'a-song' + (state.editing?.id === song.id ? ' active' : '');
    const num = document.createElement('span');
    num.className = 'song-num';
    num.textContent = song.ddn || '';
    const title = document.createElement('span');
    title.textContent = song.title;
    row.append(num, title);
    row.addEventListener('click', () => editSong(song));
    return row;
  }

  function folderBlock(folder, q) {
    if (q && !hasMatch(folder, q)) return null;
    const wrap = document.createElement('div');
    wrap.className = 'a-folder' + (q || state.open.has(folder.id) ? ' open' : '');

    const head = document.createElement('div');
    head.className = 'a-folder-head';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'a-folder-name';
    toggle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg><span class="fname"></span><span class="fcount"></span>';
    toggle.querySelector('.fname').textContent = folder.name;
    toggle.querySelector('.fcount').textContent = countSongs(folder) || '';
    toggle.addEventListener('click', () => {
      if (state.open.has(folder.id)) state.open.delete(folder.id); else state.open.add(folder.id);
      wrap.classList.toggle('open');
    });

    const actions = document.createElement('div');
    actions.className = 'a-actions';
    actions.append(
      button('addSong', 'Dodaj pieśń do folderu', () => newSong(folder.id)),
      button('addFolder', 'Dodaj podfolder', () => addFolder(folder.id)),
      button('edit', 'Zmień nazwę', () => renameFolder(folder)),
      button('up', 'Przesuń w górę', () => moveFolder(folder, 'up')),
      button('down', 'Przesuń w dół', () => moveFolder(folder, 'down')),
      button('trash', 'Usuń folder', () => deleteFolder(folder), 'danger'),
    );
    head.append(toggle, actions);

    const body = document.createElement('div');
    body.className = 'a-folder-body';
    folder.folders.forEach((f) => { const n = folderBlock(f, q); if (n) body.append(n); });
    folder.songs.filter((s) => matches(s, q)).forEach((s) => body.append(songRow(s)));
    if (!q && !folder.folders.length && !folder.songs.length) {
      const p = document.createElement('p');
      p.className = 'a-empty';
      p.textContent = 'Pusty folder';
      body.append(p);
    }
    wrap.append(head, body);
    return wrap;
  }

  function renderTree() {
    el.tree.textContent = '';
    const q = fold(el.filter.value.trim());
    state.index.folders.forEach((f) => { const n = folderBlock(f, q); if (n) el.tree.append(n); });
    if (q && !el.tree.children.length) {
      const p = document.createElement('p');
      p.className = 'a-empty';
      p.textContent = 'Brak wyników.';
      el.tree.append(p);
    }
  }
  el.filter.addEventListener('input', renderTree);
  $('btnClose').addEventListener('click', closeForm);

  /* ---------- Foldery ---------- */

  async function addFolder(parentId) {
    const name = await ask({ title: parentId ? 'Nowy podfolder' : 'Nowy folder', input: '', ok: 'Dodaj' });
    if (!name) return;
    run(async () => {
      const folder = await api('POST', 'folders', { parentId, name });
      if (parentId) state.open.add(parentId);
      state.open.add(folder.id);
      await reload();
    }, 'Folder dodany.');
  }

  async function renameFolder(folder) {
    const name = await ask({ title: 'Zmień nazwę folderu', input: folder.name, ok: 'Zapisz' });
    if (!name || name === folder.name) return;
    run(async () => { await api('PATCH', `folders/${folder.id}`, { name }); await reload(); }, 'Zapisano.');
  }

  function moveFolder(folder, move) {
    run(async () => { await api('PATCH', `folders/${folder.id}`, { move }); await reload(); });
  }

  async function deleteFolder(folder) {
    const count = countSongs(folder);
    const text = count
      ? `Folder „${folder.name}” zawiera pieśni (${count}) i zostanie usunięty razem z nimi. Tej operacji nie można cofnąć.`
      : `Usunąć folder „${folder.name}”?`;
    if (!(await ask({ title: 'Usunąć folder?', text, ok: 'Usuń' }))) return;
    run(async () => {
      await api('DELETE', `folders/${folder.id}`);
      if (state.editing && !findSong(state.editing.id)) closeForm();
      await reload();
    }, 'Folder usunięty.');
  }

  function countSongs(folder) {
    return folder.songs.length + folder.folders.reduce((n, f) => n + countSongs(f), 0);
  }

  function findSong(id, folders = state.index.folders) {
    for (const f of folders) {
      const s = f.songs.find((x) => x.id === id) || findSong(id, f.folders);
      if (s) return s;
    }
    return null;
  }

  function folderOf(id, folders = state.index.folders) {
    for (const f of folders) {
      if (f.songs.some((s) => s.id === id)) return f;
      const deeper = folderOf(id, f.folders);
      if (deeper) return deeper;
    }
    return null;
  }

  /* ---------- Formularz pieśni ---------- */

  function fillFolderSelect(selected) {
    const keep = selected ?? el.folder.value;
    el.folder.textContent = '';
    const walk = (folders, depth) => folders.forEach((f) => {
      const o = document.createElement('option');
      o.value = f.id;
      o.textContent = `${'\u00A0\u00A0\u00A0'.repeat(depth)}${f.name}`;
      el.folder.append(o);
      walk(f.folders, depth + 1);
    });
    walk(state.index.folders, 0);
    if (keep) el.folder.value = keep;
  }

  function showForm() {
    el.empty.hidden = true;
    el.form.hidden = false;
    el.form.classList.remove('enter');
    void el.form.offsetWidth;
    el.form.classList.add('enter');
    document.body.classList.add('editing');
  }

  function closeForm() {
    state.editing = null;
    state.xml = null;
    el.form.hidden = true;
    el.empty.hidden = false;
    document.body.classList.remove('editing');
    renderTree();
  }

  function resetFields() {
    state.xml = null;
    state.slotCount = 0;
    el.file.value = '';
    el.fileLabel.textContent = 'Wybierz plik lub upuść go tutaj';
    el.title.value = '';
    el.author.value = '';
    el.ddn.value = '';
    el.stanzas.textContent = '';
  }

  function newSong(folderId) {
    state.editing = null;
    resetFields();
    fillFolderSelect(folderId);
    el.formTitle.textContent = 'Nowa pieśń';
    el.fileHint.textContent = '(wymagany)';
    el.del.hidden = true;
    el.save.textContent = 'Dodaj pieśń';
    state.open.add(folderId);
    showForm();
    renderTree();
  }

  function editSong(song) {
    state.editing = song;
    resetFields();
    fillFolderSelect(folderOf(song.id)?.id);
    el.formTitle.textContent = 'Edycja pieśni';
    el.fileHint.textContent = '(opcjonalnie – zastąpi obecny)';
    el.title.value = song.title;
    el.author.value = song.author || '';
    el.ddn.value = song.ddn || '';
    (song.stanzas || []).forEach((s) => addStanza(s));
    el.del.hidden = false;
    el.save.textContent = 'Zapisz zmiany';
    showForm();
    renderTree();
    fetch(`data/songs/${encodeURIComponent(song.id)}.musicxml`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((xml) => { if (state.editing === song) setSlots(xml); });
  }

  function setSlots(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    state.slotCount = doc.querySelector('parsererror') ? 0 : Lyrics.getSlots(doc).length;
    el.stanzas.querySelectorAll('textarea').forEach((t) => t.dispatchEvent(new Event('input')));
  }

  function renumberStanzas() {
    [...el.stanzas.children].forEach((row, i) => { row.querySelector('.stanza-num').textContent = `${i + 3}.`; });
  }

  function addStanza(text = '') {
    const row = document.createElement('div');
    row.className = 'stanza-row';
    const num = document.createElement('span');
    num.className = 'stanza-num';
    const body = document.createElement('div');
    const area = document.createElement('textarea');
    area.rows = 3;
    area.maxLength = 4000;
    area.placeholder = 'Tekst zwrotki';
    area.value = text;
    const status = document.createElement('div');
    status.className = 'stanza-status';
    const preview = document.createElement('div');
    preview.className = 'stanza-preview';
    body.append(area, status, preview);
    area.addEventListener('input', () => {
      const tokens = Lyrics.parseStanza(area.value);
      const slots = state.slotCount;
      preview.textContent = tokens.length ? Lyrics.preview(tokens) : '';
      status.className = 'stanza-status';
      if (!tokens.length) { status.textContent = ''; return; }
      if (!slots) { status.textContent = `${tokens.length} sylab – brak wzorca nut do porównania`; return; }
      if (tokens.length === slots) {
        status.classList.add('ok');
        status.textContent = `Pasuje pod nuty: ${tokens.length} sylab = ${slots} nut`;
      } else {
        status.classList.add('warn');
        status.textContent = `${tokens.length} sylab, ${slots} nut – zwrotka pojawi się pod nutami jako zwykły tekst. Popraw podział myślnikami.`;
      }
    });
    const remove = button('trash', 'Usuń zwrotkę', () => { row.remove(); renumberStanzas(); }, 'danger');
    row.append(num, body, remove);
    el.stanzas.append(row);
    renumberStanzas();
    area.dispatchEvent(new Event('input'));
    return area;
  }
  $('btnAddStanza').addEventListener('click', () => addStanza().focus());

  /* ---------- Plik MusicXML ---------- */

  function readXmlMeta(xml, fileName) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror') || !doc.querySelector('score-partwise, score-timewise')) return null;
    const title = doc.querySelector('work-title')?.textContent.trim()
      || doc.querySelector('movement-title')?.textContent.trim()
      || fileName.replace(/\.(musicxml|xml)$/i, '');
    const author = [...doc.querySelectorAll('identification > creator')]
      .map((c) => c.textContent.trim()).filter(Boolean).join('; ');
    return { title, author };
  }

  async function loadFile(file) {
    if (!file) return;
    if (/\.mxl$/i.test(file.name)) { toast('Wczytaj rozpakowany plik .musicxml lub .xml (nie .mxl).', true); return; }
    if (file.size > 5 * 1024 * 1024) { toast('Plik jest za duży (limit 5 MB).', true); return; }
    const xml = await file.text();
    const meta = readXmlMeta(xml, file.name);
    if (!meta) { toast('To nie jest poprawny plik MusicXML.', true); el.file.value = ''; return; }
    state.xml = xml;
    setSlots(xml);
    el.fileLabel.textContent = file.name;
    if (!state.editing || !el.title.value) el.title.value = meta.title;
    if (!state.editing || !el.author.value) el.author.value = meta.author;
  }
  el.file.addEventListener('change', () => loadFile(el.file.files[0]));
  ['dragenter', 'dragover'].forEach((t) => el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.remove('over'); }));
  el.drop.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

  /* ---------- Zapis i usuwanie ---------- */

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const editing = state.editing;
    if (!editing && !state.xml) { toast('Wybierz plik MusicXML.', true); return; }
    const body = {
      folderId: el.folder.value,
      title: el.title.value,
      author: el.author.value,
      ddn: el.ddn.value.replace(/\D/g, ''),
      stanzas: [...el.stanzas.querySelectorAll('textarea')].map((t) => t.value),
      xml: state.xml || undefined,
    };
    run(async () => {
      const saved = editing ? await api('PUT', `songs/${editing.id}`, body) : await api('POST', 'songs', body);
      state.open.add(body.folderId);
      await reload();
      editSong(findSong(saved.id));
    }, editing ? 'Zapisano zmiany.' : 'Pieśń dodana.');
  });

  el.del.addEventListener('click', async () => {
    const song = state.editing;
    if (!song) return;
    if (!(await ask({ title: 'Usunąć pieśń?', text: `„${song.title}” zostanie trwale usunięta.`, ok: 'Usuń' }))) return;
    run(async () => { await api('DELETE', `songs/${song.id}`); closeForm(); await reload(); }, 'Pieśń usunięta.');
  });

  $('btnRootFolder').addEventListener('click', () => addFolder(null));

  /* ---------- Start ---------- */

  async function init() {
    const status = await fetch('api/admin-status').then((r) => r.json()).catch(() => ({ canEdit: false }));
    if (!status.canEdit) {
      document.getElementById('adminBody').innerHTML =
        '<p class="a-empty" style="padding:40px">Edycja jest dostępna tylko na komputerze, na którym działa serwer (localhost).</p>';
      $('btnRootFolder').hidden = true;
      return;
    }
    await reload();
  }
  init();
})();
