// The levels you move through, kept in step with the phone's back gesture:
// deck → piles → spread → lifted card → connections, with sheets (writing, decks, tuning) on top.
// Each step deeper adds a history entry, so the back swipe climbs one level at a time.
// At the top level, one more back shows a warning first instead of closing the app by surprise.
const stack = [{ lv: 'deck', pushed: true }];
const subs = new Set();
let guardOn = false, armed = true, leaveWarning = () => {};

export const levels = () => stack;
export const top = () => stack[stack.length - 1];
export const has = lv => stack.some(l => l.lv === lv);
export const onNav = fn => subs.add(fn);
export const setLeaveWarning = fn => { leaveWarning = fn; };
const tell = info => subs.forEach(fn => { try { fn(stack, info); } catch (e) { console.error(e); } });

const activated = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;

// Browser history entries only count toward the back gesture if a touch came first,
// so entries wait until then.
function sync() {
  if (!activated()) { armed = true; return; }
  armed = false;
  if (!guardOn) { history.pushState({ sd: 0 }, ''); guardOn = true; }
  for (let i = 1; i < stack.length; i++) if (!stack[i].pushed) { history.pushState({ sd: i }, ''); stack[i].pushed = true; }
}

export function push(level) {
  level.pushed = false;
  stack.push(level);
  sync();
  tell({ dir: 1, level });
}

// A sideways move: same depth, new contents.
export function replace(level) {
  const old = stack[stack.length - 1];
  level.pushed = old.pushed;
  stack[stack.length - 1] = level;
  tell({ dir: 0, level, old });
}

export function back() {
  if (stack.length <= 1) return false;
  const t = top();
  if (t.pushed) history.back();
  else { stack.pop(); tell({ dir: -1, level: t }); }
  return true;
}

// Climb straight down to a level, by depth or by name (used when switching decks or binning a card).
let skipPops = 0;
export function backToIndex(i) {
  let n = 0;
  while (stack.length > 1 && stack.length - 1 > i) { const t = stack.pop(); if (t.pushed) n++; tell({ dir: -1, level: t, jump: true }); }
  if (n) { skipPops += 1; history.go(-n); }
}
export function backTo(lv) {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].lv === lv) return backToIndex(i);
  backToIndex(0);
}

addEventListener('popstate', e => {
  if (skipPops) { skipPops--; return; }
  if (location.hash.startsWith('#sample=')) return; // a sample link opened in a running app (main.js loads it)
  const d = e.state && typeof e.state.sd === 'number' ? e.state.sd : -1;
  if (d < 0) {
    guardOn = false; armed = true;
    while (stack.length > 1) { const t = stack.pop(); tell({ dir: -1, level: t }); }
    leaveWarning();
    return;
  }
  while (stack.length - 1 > d) { const t = stack.pop(); tell({ dir: -1, level: t }); }
});

const rearm = () => { if (armed && activated()) sync(); };
addEventListener('pointerup', rearm, true);
addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    // Escape closes an open menu first, and never takes you out of the typewriter by surprise.
    const pop = document.querySelector('.tw-pop:not([hidden])');
    if (pop) { pop.hidden = true; e.preventDefault(); return; }
    if (top().lv === 'write') return;
    if (back()) e.preventDefault();
    return;
  }
  rearm();
}, true);
