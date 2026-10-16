import { COMPACT_W } from './constants.js';
import { el } from './dom.js';
import { state } from './state.js';
import './focus.js';
import './controls.js';
import { openDrawer, renderTree } from './library.js';
import { route } from './viewer.js';
import { setupOffline } from './offline-ui.js';

window.addEventListener('hashchange', () => {
  renderTree();
  route();
});

async function init() {
  document.body.dataset.layout = state.layout || '';
  const [index, status] = await Promise.all([
    fetch('data/index.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('api/admin-status').then((r) => r.json()).catch(() => ({ canEdit: false })),
  ]);
  state.index = index;
  el.adminLink.hidden = !status.canEdit;
  renderTree();
  route();
  if (!location.hash || window.innerWidth > COMPACT_W) openDrawer(true);
  setupOffline();
}

init();
