// Lifting a card: it rises from the table close to you, its words in a box below it.
// Swipe sideways for the card before or after it, up to fan out its connections, down to set it back.
// The lifted card is a page element so it can tilt in real perspective toward your finger.
import * as nav from '../nav.js';
import * as decks from '../decks.js';
import * as table from '../table/table.js';
import { faceCanvas, art } from '../art/cache.js';
import { connections } from '../cards.js';
import { phys } from '../settings.js';
import { addTicker, kick, touched } from '../loop.js';
import { GESTURES, SLOP } from '../navmap.js';
import { fillInfo } from './infobox.js';
import { learned, hint, toast, showHud } from '../hud.js';

let root, layerEl, info;
let actions = {};
export const setLiftActions = a => { actions = a; };

const live = new Map();          // card id -> DomCard on screen
let mode = 'none', mainId = null, ctxIds = [], conn = [];
let fanPos = 0, fanV = 0, fanTarget = null, pendingSwipe = 0, finger = null;
let insetTop = 0;

/* ---------- one card on the overlay ---------- */
const P = ['x', 'y', 's', 'r', 'a', 'z', 'rx', 'ry'];
const TOL = { x: 0.05, y: 0.05, s: 0.0008, r: 0.0004, a: 0.003, z: 0.003, rx: 0.02, ry: 0.02 };
class DomCard {
  constructor(id) {
    this.id = id; this.S = 0; this.role = 'main'; this.exit = null; this.drag = false;
    const el = this.el = document.createElement('div'); el.className = 'lc'; el.dataset.id = id;
    this.tilt = document.createElement('div'); this.tilt.className = 'lc-tilt';
    this.sh = document.createElement('canvas'); this.sh.className = 'lc-shadow px';
    this.cv = document.createElement('canvas'); this.cv.className = 'lc-face px';
    this.gl = document.createElement('div'); this.gl.className = 'lc-glint';
    [this.sh, this.cv].forEach(c => { c.width = 44; c.height = 62; });
    this.sh.getContext('2d').drawImage(art().shadow, 0, 0);
    this.tilt.append(this.sh, this.cv, this.gl); el.append(this.tilt); layerEl.append(el);
    for (const p of P) { this[p] = 0; this['v' + p] = 0; this['t' + p] = 0; }
    this.s = this.ts = 2; this.a = this.ta = 1;
    this.draw();
  }
  draw() {
    const c = decks.app.cards.get(this.id); if (!c) return;
    const g = this.cv.getContext('2d'); g.clearRect(0, 0, 44, 62);
    g.drawImage(faceCanvas(c, decks.deckIndex(c.deck)), 0, 0);
  }
  size(S) {
    if (S === this.S) return;
    this.S = S; this.el.style.width = 44 * S + 'px'; this.el.style.height = 62 * S + 'px';
  }
  aim(t) { for (const k in t) this['t' + k] = t[k]; }
  set(t) { for (const k in t) { this[k] = t[k]; this['t' + k] = t[k]; this['v' + k] = 0; } }
  step(dt, K, Z) {
    const c = 2 * Z * Math.sqrt(K); let moving = false;
    for (const p of P) {
      if (this.drag && (p === 'x' || p === 'y' || p === 'r')) continue;
      const vp = 'v' + p, tp = 't' + p, d = this[p] - this[tp];
      if (Math.abs(d) < TOL[p] && Math.abs(this[vp]) < TOL[p] * 10) { this[p] = this[tp]; this[vp] = 0; continue; }
      this[vp] += (-K * d - c * this[vp]) * dt; this[p] += this[vp] * dt; moving = true;
    }
    return moving;
  }
  render(t) {
    const S = this.S, k = this.s / S;
    let sr = 0, sy = 0;
    if (this.role === 'main' && !this.drag && !this.exit && phys.sway) { sr = Math.sin(t * 1.3 + 0.7) * 0.012 * phys.sway; sy = Math.sin(t * 0.9) * 3 * phys.sway; }
    this.el.style.transform = `translate3d(${(this.x - 22 * S).toFixed(2)}px,${(this.y - 31 * S + sy).toFixed(2)}px,0) rotate(${(this.r + sr).toFixed(4)}rad) scale(${k.toFixed(4)})`;
    this.el.style.opacity = Math.max(0, Math.min(1, this.a)).toFixed(3);
    this.tilt.style.transform = `perspective(${(S * 260).toFixed(0)}px) rotateX(${this.rx.toFixed(2)}deg) rotateY(${this.ry.toFixed(2)}deg)`;
    const lift = phys.shadow * Math.max(0, this.z);
    this.sh.style.transform = `translate(${((1.5 + 1.6 * lift) * S).toFixed(1)}px,${((2.5 + 2.4 * lift) * S).toFixed(1)}px)`;
    const g = Math.min(1, (Math.abs(this.rx) + Math.abs(this.ry)) / 9);
    this.gl.style.opacity = (g * 0.8).toFixed(3);
    this.gl.style.backgroundPosition = `${(50 - this.ry * 5).toFixed(1)}% ${(50 + this.rx * 5).toFixed(1)}%`;
  }
  remove() { this.el.remove(); }
}

/* ---------- where things go ---------- */
const W = () => innerWidth, H = () => innerHeight;
function liftS() { for (const S of [5, 4, 3]) if (44 * S <= W() - 40 && 62 * S <= H() * 0.47) return S; return 3; }
const topY = () => Math.max(insetTop + 16, Math.round(H() * 0.055));
const mainPose = () => { const S = liftS(); return { x: W() / 2, y: topY() + 31 * S, s: S, r: 0, a: 1, z: 1, rx: 0, ry: 0 }; };
const connMainPose = () => ({ x: W() / 2, y: topY() + 31 * 3, s: 3, r: 0, a: 1, z: 0.7, rx: 0, ry: 0 });
const FAN_R = 560, FAN_STEP = 7.2 * Math.PI / 180;
const fanY = () => topY() + 62 * 3 + 34 + 62;
function fanPose(i) {
  const a = (i - fanPos) * FAN_STEP;
  return { x: W() / 2 + FAN_R * Math.sin(a), y: fanY() + FAN_R * (1 - Math.cos(a)), r: a, s: 2, a: Math.abs(a) < 0.6 ? 1 : 0, z: 0.25, rx: 0, ry: 0 };
}

/* ---------- following the levels ---------- */
function liftLevel() {
  let t = null;
  for (const l of nav.levels()) if (l.lv === 'lifted' || l.lv === 'conn') t = l;
  return t;
}

function sync() {
  const t = liftLevel(), prevMode = mode, prevMain = mainId;
  mode = t ? t.lv : 'none'; mainId = t ? t.id : null; ctxIds = t && t.ctx ? t.ctx : [];
  const card = mainId && decks.app.cards.get(mainId);
  if (mainId && (!card || card.binned)) { mode = 'none'; mainId = null; }
  const ix = card ? decks.deckIndex(card.deck) : null;
  conn = mode === 'conn' ? connections(card, ix).map(c => c.id) : [];
  if (mode === 'conn' && (prevMode !== 'conn' || prevMain !== mainId)) { fanPos = conn.length <= 7 ? (conn.length - 1) / 2 : 2.5; fanV = 0; fanTarget = null; }

  const want = new Map();
  if (mode === 'lifted') want.set(mainId, ['main', mainPose(), 0]);
  if (mode === 'conn') { want.set(mainId, ['main', connMainPose(), 0]); conn.forEach((id, i) => { if (id !== mainId) want.set(id, ['fan', fanPose(i), i]); }); }
  const swipe = pendingSwipe; pendingSwipe = 0;

  for (const [id, dc] of live) {
    if (want.has(id) || dc.exit) continue;
    const b = table.spriteBox(id);
    if (swipe && id === prevMain) { dc.exit = 'side'; dc.drag = false; dc.aim({ x: W() / 2 - swipe * W() * 1.1, r: -swipe * 0.12, ry: 0, rx: 0 }); }
    else if (mode === 'none' && b && b.visible) { dc.exit = 'table'; dc.drag = false; dc.aim({ x: b.tx, y: b.ty, r: b.tr, s: 2, z: 0, rx: 0, ry: 0, a: 1 }); }
    else {
      dc.exit = 'fade'; dc.drag = false;
      const m = live.get(mainId);
      dc.aim(dc.role === 'fan' && m ? { x: m.tx, y: m.ty, a: 0, s: 1.6 } : { y: dc.y - 70, a: 0, z: 0 });
    }
  }
  for (const [id, [role, pose, i]] of want) {
    let dc = live.get(id);
    if (!dc) {
      dc = new DomCard(id); live.set(id, dc);
      dc.size(role === 'main' ? liftS() : 2);
      if (role === 'main') {
        const b = table.spriteBox(id);
        if (swipe) dc.set({ x: W() / 2 + swipe * W() * 1.1, y: pose.y, s: pose.s, r: swipe * 0.12, a: 1, z: 1 });
        else if (prevMode === 'none' && b && b.visible) dc.set({ x: b.x, y: b.y, s: b.s, r: b.r, a: 1, z: 0 });
        else dc.set({ ...pose, y: pose.y - 60, a: 0 });
      } else {
        const m = live.get(mainId);
        dc.set({ x: m ? m.x : W() / 2, y: m ? m.y : H() / 2, s: 2, r: 0, a: 0, z: 0 });
      }
    }
    dc.exit = null; dc.role = role; dc.fanIndex = i;
    dc.size(role === 'main' ? liftS() : 2);
    dc.el.style.zIndex = role === 'main' ? 300 : 10 + i;
    dc.aim(pose);
    table.setHidden(id, true);
  }

  root.classList.toggle('on', mode !== 'none');
  root.classList.toggle('conn', mode === 'conn');
  showHud(mode === 'none');
  if (mode === 'lifted') { fillInfo(info, card, ix); placeInfo(); info.classList.add('on'); }
  else info.classList.remove('on');
  if (mode === 'lifted') hint('lifted'); else if (prevMode !== 'none' && mode === 'none') table.updateHints(); else if (mode === 'conn') hint(null);
  kick();
}

function placeInfo() {
  const S = liftS(), top = topY() + 62 * S + 16, w = Math.min(W() - 24, 380);
  info.style.width = w + 'px';
  info.style.left = Math.round((W() - w) / 2) + 'px';
  info.style.top = Math.round(top) + 'px';
  info.style.maxHeight = Math.max(90, H() - top - 16) + 'px';
}

function relayFan() { for (const dc of live.values()) if (dc.role === 'fan' && !dc.exit) dc.aim(fanPose(dc.fanIndex)); kick(); }

/* ---------- each frame ---------- */
function tick(dt, now) {
  if (!live.size) return false;
  let busy = false;
  if (mode === 'conn' && !(finger && finger.axis === 'x')) {
    const n = conn.length;
    if (fanTarget == null && Math.abs(fanV) > 0.4) { fanPos += fanV * dt; fanV *= Math.exp(-dt * 5); busy = true; relayFan(); }
    else {
      if (fanTarget == null) fanTarget = Math.max(0, Math.min(n - 1, Math.round(n <= 7 ? (n - 1) / 2 : fanPos)));
      const d = fanPos - fanTarget;
      if (Math.abs(d) > 0.002 || Math.abs(fanV) > 0.01) { fanV += (-90 * d - 19 * fanV) * dt; fanPos += fanV * dt; busy = true; relayFan(); }
    }
  }
  const pressed = finger && finger.moved;
  const K = phys.reduced ? 1600 : pressed ? phys.followK : phys.zoomK, Z = phys.reduced ? 1 : phys.zeta;
  const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n, t = now / 1000;
  for (const [id, dc] of live) {
    if (dc.exit === 'table') { const b = table.spriteBox(id); if (b) dc.aim({ x: b.tx, y: b.ty, r: b.tr }); }
    let moving = false;
    for (let i = 0; i < n; i++) moving = dc.step(h, dc.role === 'fan' ? Math.max(K, 220) : K, Z) || moving;
    dc.render(t);
    const gone = dc.exit && (!moving || (dc.exit === 'fade' && dc.a < 0.03) || (dc.exit === 'side' && Math.abs(dc.x - W() / 2) > W() * 0.9));
    if (gone) { dc.remove(); live.delete(id); if (!live.has(id)) table.setHidden(id, false); continue; }
    if (moving || dc.drag) busy = true;
  }
  return busy || !!finger;
}

/* ---------- touch on the overlay ---------- */
function go(dir) {
  const i = ctxIds.indexOf(mainId), j = i + dir;
  const dc = live.get(mainId);
  if (i < 0 || j < 0 || j >= ctxIds.length) {
    if (dc) { dc.drag = false; dc.vx += -dir * 900; }
    return false;
  }
  pendingSwipe = dir;
  const lvl = nav.top();
  nav.replace({ lv: lvl.lv, id: ctxIds[j], ctx: ctxIds, via: lvl.via });
  table.reveal(ctxIds[j]);
  learned('lifted');
  return true;
}

function springBack() { const dc = live.get(mainId); if (dc) { dc.drag = false; dc.aim(mode === 'conn' ? connMainPose() : mainPose()); } kick(); }

function attach() {
  const pt = e => ({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  root.addEventListener('pointerdown', e => {
    if (mode === 'none' || finger) return;
    touched();
    const lc = e.target.closest('.lc'), id = lc && lc.dataset.id;
    try { root.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = pt(e);
    finger = { pid: e.pointerId, p0: p, samples: [p], id, onMain: id === mainId, onInfo: !!e.target.closest('#infobox'), moved: false, axis: null, fan0: fanPos };
    const dc = live.get(mainId);
    if (finger.onMain && dc) {
      const tilt = phys.tiltDeg, w = 22 * dc.s, h = 31 * dc.s;
      dc.aim({ ry: Math.max(-1, Math.min(1, (p.x - dc.x) / w)) * tilt, rx: -Math.max(-1, Math.min(1, (p.y - dc.y) / h)) * tilt });
    }
    kick();
  });
  root.addEventListener('pointermove', e => {
    if (!finger || e.pointerId !== finger.pid) return;
    touched();
    const p = pt(e), f = finger;
    f.samples.push(p); if (f.samples.length > 20) f.samples.shift();
    const dx = p.x - f.p0.x, dy = p.y - f.p0.y;
    if (!f.moved && Math.hypot(dx, dy) > SLOP) { f.moved = true; f.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; info.classList.add('dragging'); }
    const dc = live.get(mainId), tilt = phys.tiltDeg;
    if (!f.moved) {
      if (f.onMain && dc) dc.aim({ ry: Math.max(-1, Math.min(1, (p.x - dc.x) / (22 * dc.s))) * tilt, rx: -Math.max(-1, Math.min(1, (p.y - dc.y) / (31 * dc.s))) * tilt });
      return;
    }
    if (mode === 'conn' && f.axis === 'x') { fanPos = f.fan0 - dx / (FAN_R * FAN_STEP); fanTarget = null; fanV = 0; relayFan(); return; }
    if (!dc) return;
    const base = mode === 'conn' ? connMainPose() : mainPose();
    dc.drag = true;
    if (mode === 'conn') { dc.x = base.x; dc.y = base.y + Math.max(0, dy) * 0.8; }
    else if (f.axis === 'x') { dc.x = base.x + dx; dc.y = base.y + dy * 0.15; dc.r = dx * 0.0007; }
    else { dc.x = base.x + dx * 0.15; dc.y = base.y + dy * (dy < 0 ? 0.55 : 0.85); dc.r = 0; }
    dc.aim({ ry: Math.max(-tilt, Math.min(tilt, dx / 10)), rx: Math.max(-tilt, Math.min(tilt, -dy / 12)) });
    kick();
  });
  const end = (e, cancelled) => {
    if (!finger || e.pointerId !== finger.pid) return;
    touched();
    const f = finger; finger = null;
    info.classList.remove('dragging');
    const p = pt(e), dx = p.x - f.p0.x, dy = p.y - f.p0.y;
    const s = f.samples; let a = s[s.length - 1];
    for (let i = s.length - 1; i >= 0 && p.t - s[i].t <= 90; i--) a = s[i];
    const dt = Math.max(1, p.t - a.t), vx = (p.x - a.x) / dt, vy = (p.y - a.y) / dt;
    const dc = live.get(mainId);
    if (dc) { dc.aim({ rx: 0, ry: 0 }); if (dc.drag) { dc.vx = vx * 600; dc.vy = vy * 600; } }
    if (cancelled) { springBack(); return; }
    const G = GESTURES[mode] || {};
    if (!f.moved) {
      if (p.t - f.p0.t > 700) { springBack(); return; }
      if (mode === 'lifted') {
        if ((f.onMain || f.onInfo) && G.tapCard === 'write') actions.write && actions.write(mainId);
        else if (!f.id && G.tapTable === 'setBack') nav.back();
      } else if (mode === 'conn') {
        if (f.id && f.id !== mainId && G.tapCard === 'lift') nav.push({ lv: 'lifted', id: f.id, ctx: conn.slice(), via: mainId });
        else nav.back();
      }
      return;
    }
    if (mode === 'conn') {
      if (f.axis === 'x') { fanV = -vx * 1000 / (FAN_R * FAN_STEP); fanTarget = null; kick(); return; }
      if (dy > 70 || vy > 0.45) { if (dc) dc.drag = false; nav.back(); } else springBack();
      return;
    }
    if (f.axis === 'x') {
      const dir = dx < -70 || vx < -0.45 ? 1 : dx > 70 || vx > 0.45 ? -1 : 0;
      if (!dir || !go(dir)) springBack();
    } else if (dy < -70 || vy < -0.45) {
      if (dc) dc.drag = false;
      const card = decks.app.cards.get(mainId);
      if (card && connections(card, decks.deckIndex(card.deck)).length && G.swipeUp === 'connections') { learned('lifted'); nav.push({ lv: 'conn', id: mainId }); }
      else { springBack(); toast('No links on this card yet'); }
    } else if (dy > 70 || vy > 0.45) { if (dc) dc.drag = false; learned('lifted'); nav.back(); }
    else springBack();
    kick();
  };
  root.addEventListener('pointerup', e => end(e, false));
  root.addEventListener('pointercancel', e => end(e, true));
}

export function liftCard(id, ctx) { nav.push({ lv: 'lifted', id, ctx }); }

export function initLift() {
  root = document.getElementById('lift'); layerEl = document.getElementById('lift-cards'); info = document.getElementById('infobox');
  const probe = document.getElementById('inset-probe');
  insetTop = probe ? parseFloat(getComputedStyle(probe).paddingTop) || 0 : 0;
  attach();
  nav.onNav(() => sync());
  decks.onChange(() => { for (const dc of live.values()) dc.draw(); if (mode !== 'none') sync(); });
  addEventListener('resize', () => { if (mode !== 'none') sync(); });
  addTicker(tick);
}
