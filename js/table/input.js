// Turns a finger (or mouse) on an element into taps, drags with release speed, and holds.
import { HOLD_MS, SLOP } from '../navmap.js';
import { touched } from '../loop.js';

// h: { down(p) → hit, tap(hit, p), dragStart(hit, p0, p), dragMove(hit, p, d), dragEnd(hit, p, v),
//      holdStart(hit, p), holdMove(hit, p), holdEnd(hit, p), cancel(hit) }
export function attachInput(el, h) {
  let cur = null;
  const pt = e => ({ x: e.clientX, y: e.clientY, t: e.timeStamp });

  function velocity() {
    const s = cur.samples, last = s[s.length - 1];
    let first = last;
    for (let i = s.length - 1; i >= 0 && last.t - s[i].t <= 90; i--) first = s[i];
    const dt = last.t - first.t;
    if (dt < 8 || performance.now() - last.t > 70) return { x: 0, y: 0 };
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt }; // px per ms
  }

  el.addEventListener('pointerdown', e => {
    touched();
    if (cur) return;
    if (e.button > 0) return;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = pt(e);
    cur = { id: e.pointerId, p0: p, samples: [p], moved: false, holding: false, hit: h.down(p) };
    if (cur.hit && cur.hit.holdable) {
      cur.timer = setTimeout(() => {
        if (cur && !cur.moved) { cur.holding = true; h.holdStart(cur.hit, cur.samples[cur.samples.length - 1]); }
      }, HOLD_MS);
    }
  });

  el.addEventListener('pointermove', e => {
    if (!cur || e.pointerId !== cur.id) return;
    touched();
    const p = pt(e);
    cur.samples.push(p);
    if (cur.samples.length > 24) cur.samples.shift();
    const dx = p.x - cur.p0.x, dy = p.y - cur.p0.y;
    if (!cur.moved && !cur.holding && Math.hypot(dx, dy) > SLOP) {
      cur.moved = true; clearTimeout(cur.timer);
      h.dragStart(cur.hit, cur.p0, p);
    }
    if (cur.holding) h.holdMove(cur.hit, p);
    else if (cur.moved) h.dragMove(cur.hit, p, { x: dx, y: dy });
  });

  const end = (e, cancelled) => {
    if (!cur || e.pointerId !== cur.id) return;
    touched();
    clearTimeout(cur.timer);
    const c = cur, p = pt(e);
    c.samples.push(p);
    const v = velocity();
    cur = null;
    if (cancelled) { h.cancel(c.hit); return; }
    if (c.holding) h.holdEnd(c.hit, p);
    else if (c.moved) h.dragEnd(c.hit, p, v);
    else if (p.t - c.p0.t < 700) h.tap(c.hit, p);
    else h.cancel(c.hit);
  };
  el.addEventListener('pointerup', e => end(e, false));
  el.addEventListener('pointercancel', e => end(e, true));
  el.addEventListener('contextmenu', e => e.preventDefault());
}
