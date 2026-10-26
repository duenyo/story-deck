// One animation loop for the table and the lifted card.
// Full speed while anything moves or a finger is down; a low pixel-art rate for idle sway,
// which rests a while after the last touch; and nothing at all while the app is hidden.
const tickers = new Set();
let raf = 0, timer = 0, last = 0, busyUntil = 0, lastTouch = performance.now();
export const clock = { t: 0, idle: false };
export const IDLE_FPS = 10, SWAY_REST_MS = 45000;
let swayWanted = () => false;
export const setSwayWanted = fn => { swayWanted = fn; };

export function addTicker(fn) { tickers.add(fn); kick(); }
export function touched() { lastTouch = performance.now(); kick(); }

// Asking for a frame while one is running just marks the next one as needed (never two per frame).
let inFrame = false, kicked = false;
export function kick(ms = 0) {
  busyUntil = Math.max(busyUntil, performance.now() + ms);
  if (inFrame) { kicked = true; return; }
  if (timer) { clearTimeout(timer); timer = 0; }
  if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
}

function frame(now) {
  raf = 0;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now; clock.t = now / 1000;
  let busy = now < busyUntil;
  clock.idle = !busy;
  inFrame = true; kicked = false;
  for (const fn of tickers) { try { if (fn(dt, now)) busy = true; } catch (e) { console.error(e); } }
  inFrame = false;
  if (document.hidden) { last = 0; return; }
  if (busy || kicked) { clock.idle = false; if (!raf) raf = requestAnimationFrame(frame); return; }
  if (swayWanted() && now - lastTouch < SWAY_REST_MS) {
    clock.idle = true;
    timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(frame); }, 1000 / IDLE_FPS);
  } else last = 0;
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; touched(); } });
