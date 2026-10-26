// Page elements over the table: the deck plaque, the New idea button, faint first-run hints and toasts.
const $ = id => document.getElementById(id);

export function setPlaque(name, line) {
  $('plaque-name').textContent = name;
  $('plaque-line').textContent = line;
}

let toastTimer = 0;
export function toast(msg, { action, onAction, ms = 3200 } = {}) {
  const el = $('toast'), txt = $('toast-text'), btn = $('toast-btn');
  txt.textContent = msg;
  btn.hidden = !action;
  btn.textContent = action || '';
  btn.onclick = action ? () => { hideToast(); onAction && onAction(); } : null;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}
export function hideToast() {
  const el = $('toast');
  el.classList.remove('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 250);
}

/* ---------- first-run hints: shown faintly until you've done the thing once ---------- */
const HINTS = {
  deck: 'Tap the deck to cut it into piles',
  empty: 'Your deck is empty. Tap + Idea to write the first card',
  piles: 'Fling a pile to spread it',
  spread: 'Drag to glide · tap a card to lift it · hold one to move it',
  lifted: 'Swipe sideways for neighbors · up for links · down to set it back'
};
const KEY = 'sd.hints';
let done = {};
try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { done = {}; }
export function hint(name) {
  const el = $('hint');
  const text = name && !done[name] ? HINTS[name] : '';
  if (el.textContent !== text) { el.classList.remove('on'); if (text) setTimeout(() => { el.textContent = text; el.classList.add('on'); }, 220); else el.textContent = ''; }
}
export function learned(name) {
  if (done[name]) return;
  done[name] = 1;
  try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* ignore */ }
  hint(null);
}

export function showHud(on) { document.body.classList.toggle('hud-off', !on); }
