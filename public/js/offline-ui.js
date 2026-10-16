/* Pasek stanu trybu offline w menu. */
import { $, el } from './dom.js';
import { state } from './state.js';
import * as Offline from './offline.js';
import { renderTree } from './library.js';

const plural = (n) => `${n} ${n === 1 ? 'pieśń' : 'pieśni'}`;

export async function setupOffline() {
  if (!Offline.supported) return;
  const box = $('offline');
  const text = $('offlineText');
  const btn = $('offlineBtn');
  const fill = $('offlineFill');
  box.hidden = false;

  const show = ({ cached, total }) => {
    fill.style.width = '0';
    box.classList.remove('busy');
    const ready = cached === total;
    box.classList.toggle('ready', ready);
    text.textContent = ready ? `Offline: gotowe (${plural(total)})` : `Offline: ${cached} z ${plural(total)}`;
    btn.textContent = ready ? 'Aktualizuj' : 'Pobierz';
  };

  const run = async () => {
    if (!navigator.onLine) { text.textContent = 'Brak internetu – nie można pobrać'; return; }
    box.classList.add('busy');
    btn.disabled = true;
    try {
      state.index = await fetch('data/index.json', { cache: 'no-cache' }).then((r) => r.json());
      if (!el.search.value) renderTree();
      show(await Offline.sync(state.index, (done, total) => {
        text.textContent = `Pobieranie ${done} z ${total}…`;
        fill.style.width = `${total ? (done / total) * 100 : 100}%`;
      }));
    } catch {
      text.textContent = 'Pobieranie nie powiodło się';
      box.classList.remove('busy');
    }
    btn.disabled = false;
  };
  btn.addEventListener('click', run);

  await Offline.register();
  show(await Offline.status(state.index));
  if (navigator.onLine) run();
}
