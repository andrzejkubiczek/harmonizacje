/* Tryb pełnoekranowy: pływający pasek znika po chwili i wraca po dotknięciu. */
import { $, el } from './dom.js';
import { render } from './sheet.js';

let idleTimer = null;
const isFocus = () => document.body.classList.contains('focus');

export function wake() {
  el.bar.classList.remove('idle');
  clearTimeout(idleTimer);
  if (isFocus()) idleTimer = setTimeout(() => el.bar.classList.add('idle'), 3500);
}

function setFocus(on) {
  document.body.classList.toggle('focus', on);
  wake();
  requestAnimationFrame(() => render(false));
}

$('btnFull').addEventListener('click', () => {
  const on = !isFocus();
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (on && request) request.call(root).catch(() => {});
  if (!on && document.fullscreenElement && exit) exit.call(document).catch(() => {});
  setFocus(on);
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && isFocus()) setFocus(false);
});

el.stage.addEventListener('click', () => {
  if (!isFocus()) return;
  if (el.bar.classList.contains('idle')) wake(); else el.bar.classList.add('idle');
});
el.bar.addEventListener('pointerdown', wake);
