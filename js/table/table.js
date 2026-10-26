// The table: your deck on the bench, its piles and their spreads, drawn on one canvas.
// Every card is a sprite that springs toward the spot its level gives it, so moves are never jumps.
import { faceCanvas, art } from '../art/cache.js';
import { mat, PANELS } from '../art/panels.js';
import * as decks from '../decks.js';
import { KINDS, KIND_ORDER } from '../cards.js';
import { phys, settings, onSettings } from '../settings.js';
import { LAYOUT_OF, stageFor, GESTURES } from '../navmap.js';
import * as nav from '../nav.js';
import { addTicker, kick, clock, setSwayWanted } from '../loop.js';
import { deckSpot, pilesLayout, LAYOUTS, pinOffset, CARD_W, CARD_H } from './layouts.js';
import { attachInput } from './input.js';
import { hint, learned } from '../hud.js';

let canvas, ctx, W = 1, H = 1, dpr = 1;
const insets = { top: 0, bottom: 0 };
let matPat = null, tipImg = null, plaqueImg = null;
const sprites = new Map();
let deckId = null, cards = [], ix = null;
let lv = 'deck', kind = null;          // the table's level, and which pile is spread
let piles = [], spread = null;
const scrolls = {};
let stage = 'table', stageT = 0, stageV = 0;
let held = null, pileDrag = null, scrollFinger = null;
let actions = {};                       // lift, write… wired in by main.js
export const setActions = a => { actions = a; };

/* ---------- sprites ---------- */
const PROPS = ['x', 'y', 'r', 's', 'f', 'a', 'z'], VK = PROPS.map(p => 'v' + p), TK = PROPS.map(p => 't' + p);
const TOL = [0.05, 0.05, 0.0004, 0.0006, 0.0006, 0.002, 0.002];
class Sprite {
  constructor(id) {
    this.id = id;
    PROPS.forEach((p, i) => { this[p] = 0; this[VK[i]] = 0; this[TK[i]] = 0; });
    this.s = this.ts = 2; this.a = this.ta = 1;
    this.wait = 0; this.k = 1; this.layer = 0; this.side = 0; this.group = 'rest';
    this.ph = Math.random() * 6.283; this.hidden = false; this.still = false;
  }
}
function stepSprite(sp, dt, K, Z) {
  if (sp.wait > 0) { sp.wait -= dt; return true; }
  const k = K * sp.k, c = 2 * Z * Math.sqrt(k);
  let moving = false;
  for (let i = 0; i < 7; i++) {
    const p = PROPS[i], vp = VK[i], d = sp[p] - sp[TK[i]];
    if (Math.abs(d) < TOL[i] && Math.abs(sp[vp]) < TOL[i] * 10) { sp[p] = sp[TK[i]]; sp[vp] = 0; continue; }
    sp[vp] += (-k * d - c * sp[vp]) * dt;
    sp[p] += sp[vp] * dt;
    moving = true;
  }
  sp.still = !moving;
  return moving;
}
const target = (sp, t) => { sp.tx = t.x; sp.ty = t.y; sp.tr = t.r || 0; sp.ts = t.s || 2; sp.tf = t.f ?? 1; sp.ta = t.a ?? 1; sp.tz = t.z || 0; };
const place = sp => { PROPS.forEach((p, i) => { sp[p] = sp[TK[i]]; sp[VK[i]] = 0; }); sp.wait = 0; };

/* ---------- geometry ---------- */
const scrollOf = k => scrolls[k] || (scrolls[k] = { y: 0, v: 0, target: null, dragging: false, y0: 0, p0: 0 });
function spreadView() {
  if (stage === 'popup') {
    const top = Math.max(insets.top + 64, Math.round(H * 0.11));
    return { x: 8, y: top + 8, w: W - 16, h: H - top - 8, sheetTop: top, pad: 18 };
  }
  return { x: 0, y: 0, w: W, h: H, sheetTop: 0, pad: insets.top + 84 };
}

function relayout(stagger) {
  const full = { x: 0, y: 0, w: W, h: H };
  const groups = KIND_ORDER.map(k => ({ kind: k, cards: cards.filter(c => c.kind === k) })).filter(g => g.cards.length);
  piles = pilesLayout(groups, full, insets.top + 72, insets.bottom + 104);
  const pileSpot = new Map();
  piles.forEach(p => p.spots.forEach(s => pileSpot.set(s.id, s)));
  const dspot = deckSpot(full);

  spread = null;
  if (lv === 'spread' && kind) {
    const view = spreadView();
    let list = cards.filter(c => c.kind === kind);
    if (held) { const hc = list.find(c => c.id === held.id); list = list.filter(c => c !== hc); list.splice(Math.min(held.insert, list.length), 0, hc); }
    const lay = LAYOUTS[LAYOUT_OF[kind] || 'scatter'](list, view, view.pad, insets.bottom + 200);
    const byId = new Map(lay.spots.map((s, i) => [s.id, { ...s, index: i }]));
    spread = { kind, view, lay, list, byId, max: Math.max(0, lay.height - view.h) };
  }
  const sc = spread && scrollOf(kind);
  cards.forEach((c, i) => {
    const sp = sprites.get(c.id); if (!sp) return;
    let t, group = 'rest', layer = 0, wait = 0;
    if (lv === 'deck') { t = { x: dspot.x, y: dspot.y, f: 0 }; layer = i; if (stagger === 'gather') wait = (cards.length - i) * 0.006; }
    else if (spread && c.kind === spread.kind) {
      const s = spread.byId.get(c.id);
      t = { x: s.x, y: spread.view.y + s.y - sc.y, r: s.r };
      group = 'spread'; layer = s.index; sp.side = s.side || 0;
      if (held && held.id === c.id) { t = { x: held.x, y: held.y, s: 2.14, z: 1, r: 0 }; layer = 1e6; }
      if (stagger === 'spread') wait = Math.min(s.index, 16) * 0.024;
    } else {
      const s = pileSpot.get(c.id);
      t = { x: s.x, y: s.y }; layer = s.layer;
      if (pileDrag && pileDrag.kind === c.kind) { t.x += pileDrag.dx; t.y += pileDrag.dy; t.z = 0.4; sp.k = 1 - Math.min(s.layer, 6) * 0.1; }
      else sp.k = 1;
      if (spread && stage !== 'popup') { t.y -= H * 0.7; t.a = 0; }
      if (stagger === 'cut') wait = i * 0.012;
      if (stagger === 'unspread' && c.kind === kind) wait = 0;
    }
    target(sp, t);
    sp.group = group; sp.layer = layer;
    if (stagger && wait) sp.wait = wait;
  });
  order();
  kick();
}

let restList = [], spreadList = [];
function order() {
  restList = []; spreadList = [];
  for (const sp of sprites.values()) (sp.group === 'spread' ? spreadList : restList).push(sp);
  restList.sort((a, b) => a.layer - b.layer || a.ty - b.ty);
  spreadList.sort((a, b) => a.layer - b.layer);
}

/* ---------- loading a deck and keeping up with its cards ---------- */
function refreshCards() {
  deckId = decks.app.current;
  cards = decks.deckCards(deckId);
  ix = decks.deckIndex(deckId);
  const keep = new Set(cards.map(c => c.id));
  for (const id of sprites.keys()) if (!keep.has(id)) sprites.delete(id);
  const full = { x: 0, y: 0, w: W, h: H }, d = deckSpot(full);
  for (const c of cards) if (!sprites.has(c.id)) {
    const sp = new Sprite(c.id);
    const from = lv === 'deck' ? { x: d.x, y: d.y, f: 0 } : { x: 46, y: H - insets.bottom - 40, f: 1, s: 1 };
    target(sp, from); place(sp);
    sprites.set(c.id, sp);
  }
  if (lv === 'spread' && !cards.some(c => c.kind === kind)) nav.backTo('piles');
  if (lv !== 'deck' && !cards.length) nav.backTo('deck');
}
export function cardsHere() { return cards; }
export function index() { return ix; }

/* ---------- levels ---------- */
function canvasLevel(stack) {
  let l = 'deck', k = null;
  for (const s of stack) { if (s.lv === 'piles') { l = 'piles'; k = null; } if (s.lv === 'spread') { l = 'spread'; k = s.kind; } if (s.lv === 'deck') { l = 'deck'; k = null; } }
  return [l, k];
}
function onNav(stack) {
  const [l, k] = canvasLevel(stack);
  if (l !== lv || k !== kind) {
    const from = lv;
    lv = l; kind = k; held = null; pileDrag = null;
    if (phys.reduced) { canvas.classList.add('blink'); requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.remove('blink'))); }
    if (l === 'piles' && from === 'deck') relayout('cut');
    else if (l === 'deck') relayout('gather');
    else if (l === 'spread') { const s = scrollOf(k); s.v = 0; s.target = null; relayout('spread'); }
    else relayout(false);
  }
  updateHints();
}
export function updateHints() {
  const top = nav.top().lv;
  if (top === 'deck') hint(cards.length ? 'deck' : 'empty');
  else if (top === 'piles') hint('piles');
  else if (top === 'spread') hint('spread');
  else if (top !== 'lifted') hint(null);
}

/* ---------- each frame ---------- */
function stepScroll(dt) {
  if (!spread) return false;
  const s = scrollOf(spread.kind), max = spread.max;
  if (s.dragging) return true;
  if (held) { // carrying a card near an edge scrolls the spread
    const v = spread.view, edge = held.y < v.y + 90 ? -1 : held.y > v.y + v.h - 110 ? 1 : 0;
    if (edge) { s.y = Math.max(0, Math.min(max, s.y + edge * 520 * dt)); updateHeld(); return true; }
    return false;
  }
  if (s.target != null) {
    const k = 120, c = 2 * Math.sqrt(k);
    s.v += (-k * (s.y - s.target) - c * s.v) * dt; s.y += s.v * dt;
    if (Math.abs(s.y - s.target) < 0.3 && Math.abs(s.v) < 4) { s.y = s.target; s.v = 0; s.target = null; }
    return true;
  }
  if (s.y < 0 || s.y > max) {
    const to = s.y < 0 ? 0 : max, k = 170, c = 2 * phys.zeta * Math.sqrt(k);
    s.v += (-k * (s.y - to) - c * s.v) * dt; s.y += s.v * dt;
    if (Math.abs(s.y - to) < 0.3 && Math.abs(s.v) < 4) { s.y = to; s.v = 0; }
    return true;
  }
  if (Math.abs(s.v) > 3) { s.y += s.v * dt; s.v *= Math.exp(-dt * 1000 / phys.flingTau); return true; }
  s.v = 0;
  return false;
}

function tick(dt) {
  let busy = false;
  const want = lv === 'spread' && stage !== 'table' ? 1 : 0;
  if (Math.abs(stageT - want) > 0.001 || Math.abs(stageV) > 0.01) {
    const k = phys.reduced ? 900 : 160, c = 2 * Math.sqrt(k);
    stageV += (-k * (stageT - want) - c * stageV) * dt; stageT += stageV * dt; busy = true;
  } else { stageT = want; stageV = 0; }

  const scrolling = stepScroll(dt);
  if (scrolling) { relayout(false); busy = true; }
  const glide = scrolling || pileDrag || held;
  const K = glide ? phys.followK : 300, Z = phys.reduced ? 1 : phys.zeta;
  const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
  for (const sp of sprites.values()) for (let i = 0; i < n; i++) if (!stepSprite(sp, h, phys.reduced ? 2000 : K, Z)) break; else busy = true;
  draw();
  return busy || !!held || !!pileDrag;
}

/* ---------- drawing ---------- */
function nine(img, x, y, w, h, k) {
  const c = 3, C = c * k, m = 9 - 2 * c;
  const sx = [0, c, 9 - c], sw = [c, m, c], dx = [x, x + C, x + w - C], dw = [C, w - 2 * C, C];
  const sy = [0, c, 9 - c], dy = [y, y + C, y + h - C], dh = [C, h - 2 * C, C];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (dw[i] > 0 && dh[j] > 0) ctx.drawImage(img, sx[i], sy[j], sw[i], sw[j], dx[i], dy[j], dw[i], dh[j]);
}

function drawSprite(sp, t) {
  if (sp.hidden || sp.a < 0.01) return;
  const A = art(), card = decks.app.cards.get(sp.id);
  if (!card) return;
  const flip = Math.cos(Math.PI * Math.max(0, Math.min(1, sp.f)));
  const img = flip > 0 ? A.back : faceCanvas(card, ix);
  const sx = Math.max(0.02, Math.abs(flip));
  let rot = sp.r, dyS = 0;
  const tilt = phys.tiltDeg * Math.PI / 180;
  if (tilt) rot += Math.max(-1, Math.min(1, sp.vx / 1400)) * tilt * 0.6 + Math.max(-1, Math.min(1, sp.vy / 2200)) * tilt * 0.35 * (sp.side || 1);
  const sw = phys.sway;
  if (sw && lv !== 'deck' && sp.still) { rot += Math.sin(t * 1.7 + sp.ph) * 0.016 * sw; dyS = Math.sin(t * 1.15 + sp.ph) * 1.6 * sw; }
  const still = !rot && sp.s === 2 && sx === 1;
  const x = still ? Math.round(sp.x * dpr) / dpr : sp.x, y = (still ? Math.round((sp.y + dyS) * dpr) / dpr : sp.y + dyS) + shiftY;
  const a = Math.max(0, Math.min(1, sp.a)), lift = phys.shadow * (sp.z + (sp.s - 2) * 1.5);
  // the hard pixel shadow falls on the cards below
  ctx.globalAlpha = a * 0.42;
  ctx.setTransform(dpr, 0, 0, dpr, (x + 3 + lift * 5) * dpr, (y + 5 + lift * 8) * dpr);
  ctx.rotate(rot); ctx.scale(sp.s * sx, sp.s);
  ctx.drawImage(A.shadow, -22, -31);
  ctx.globalAlpha = a;
  ctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr);
  ctx.rotate(rot); ctx.scale(sp.s * sx, sp.s);
  ctx.drawImage(img, -22, -31);
}

// The thread runs through each beat's pin in story order (a carried card pulls it along).
const sideAt = i => (i % 2 ? 1 : -1);
function drawThread() {
  const pts = spread.list.map((c, i) => { const sp = sprites.get(c.id), o = pinOffset(sideAt(i)); return sp ? { x: sp.x + o.x, y: sp.y + o.y + shiftY } : null; }).filter(Boolean);
  if (!pts.length) return;
  const f = pts[0], l = pts[pts.length - 1];
  pts.unshift({ x: f.x + 24, y: f.y - 90 });
  pts.push({ x: l.x - 24, y: l.y + 110 });
  const path = () => {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
    }
  };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.save(); ctx.translate(1.5, 3); path(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  path(); ctx.strokeStyle = '#b23a2c'; ctx.lineWidth = 2.5; ctx.stroke();
  path(); ctx.strokeStyle = 'rgba(255,190,160,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
}
function drawPins() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  spread.list.forEach((c, i) => {
    const sp = sprites.get(c.id);
    if (!sp || sp.hidden || sp.a < 0.5) return;
    const o = pinOffset(sideAt(i)), x = Math.round(sp.x + o.x) - 3, y = Math.round(sp.y + o.y + shiftY) - 3;
    ctx.globalAlpha = sp.a;
    ctx.fillStyle = '#1a1210'; ctx.fillRect(x, y, 6, 6);
    ctx.fillStyle = '#d9a441'; ctx.fillRect(x + 1, y + 1, 4, 4);
    ctx.fillStyle = '#f6d873'; ctx.fillRect(x + 1, y + 1, 2, 2);
  });
  ctx.globalAlpha = 1;
}

function drawLabels(alpha) {
  if (alpha <= 0.01) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '600 13px "Pixelify Sans", ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of piles) {
    let a = alpha;
    if (lv === 'spread' && stage !== 'popup') a = 0;
    if (pileDrag && pileDrag.kind === p.kind) a *= 0.4;
    if (a <= 0.01) continue;
    const label = KINDS[p.kind].plural + ' · ' + p.count, w = Math.max(CARD_W, ctx.measureText(label).width + 22);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(p.x - w / 2 + 3, p.labelY + 3, w, 24);
    nine(plaqueImg, Math.round(p.x - w / 2), p.labelY, Math.round(w), 24, 2);
    ctx.fillStyle = '#fff3dc'; ctx.fillText(label, p.x, p.labelY + 12.5);
  }
  ctx.globalAlpha = 1;
}

let labelA = 0;
function draw() {
  const t = clock.t;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = matPat || '#1f3a2e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const A = art(), d = deckSpot({ x: 0, y: 0, w: W, h: H });
  if (lv === 'deck') {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cards.length) {
      const layers = Math.max(1, Math.min(8, Math.ceil(cards.length / 9))), img = A.deck(layers);
      ctx.globalAlpha = 0.42; ctx.drawImage(A.shadow, 0, 0, 44, 62, d.x - 44 + 4, d.y - 62 + 7 + (layers - 1) * 4, 88, 124);
      ctx.globalAlpha = 1; ctx.drawImage(img, d.x - 44, d.y - 62, 88, img.height * 2);
    } else {
      ctx.globalAlpha = 0.3; ctx.drawImage(A.blank, d.x - 44, d.y - 62, 88, 124); ctx.globalAlpha = 1;
    }
  }
  labelA += ((lv === 'piles' || lv === 'spread' ? 1 : 0) - labelA) * 0.25;
  for (const sp of restList) if (lv !== 'deck' || !sp.still) drawSprite(sp, t);
  drawLabels(labelA);
  if (stageT > 0.002) drawStage();
  if (spreadList.length && spread) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (stage === 'popup') {
      const v = spread.view, top = v.sheetTop + (1 - stageT) * (H - v.sheetTop);
      shiftY = top - v.sheetTop;
      ctx.beginPath(); ctx.rect(10 * dpr, (top + 8) * dpr, (W - 20) * dpr, (H - top) * dpr); ctx.clip();
    }
    if (spread.lay.thread) drawThread();
    for (const sp of spreadList) drawSprite(sp, t);
    if (spread.lay.thread) drawPins();
    shiftY = 0;
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
let shiftY = 0;

function drawStage() {
  const t = Math.max(0, Math.min(1, stageT));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (stage === 'screen') {
    ctx.globalAlpha = t; ctx.fillStyle = '#17130f'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = t * 0.6; ctx.fillStyle = '#211b15';
    for (let y = 0; y < H; y += 32) ctx.fillRect(0, y, W, 2);
  } else if (stage === 'popup') {
    ctx.globalAlpha = 1; ctx.fillStyle = `rgba(8,6,4,${0.55 * t})`; ctx.fillRect(0, 0, W, H);
    const sheetTop = spreadView().sheetTop, top = sheetTop + (1 - t) * (H - sheetTop);
    nine(tipImg, 0, top, W, H - top + 30, 2);
    ctx.save(); ctx.beginPath(); ctx.rect(8, top + 8, W - 16, H - top); ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = matPat; ctx.fillRect(0, (top + 8) * dpr, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---------- touch ---------- */
function spriteAt(list, x, y) {
  for (let i = list.length - 1; i >= 0; i--) {
    const sp = list[i];
    if (sp.hidden || sp.a < 0.3) continue;
    const dx = x - sp.x, dy = y - sp.y, c = Math.cos(-sp.r), s = Math.sin(-sp.r);
    const lx = (dx * c - dy * s) / sp.s, ly = (dx * s + dy * c) / sp.s;
    if (Math.abs(lx) <= 23 && Math.abs(ly) <= 32) return sp;
  }
  return null;
}
function hitAt(p) {
  if (lv === 'deck') {
    const d = deckSpot({ x: 0, y: 0, w: W, h: H });
    return Math.abs(p.x - d.x) < 64 && Math.abs(p.y - d.y) < 86 ? { t: 'deck' } : { t: 'table' };
  }
  if (lv === 'piles') {
    for (const pl of piles) { const r = pl.rect; if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return { t: 'pile', kind: pl.kind }; }
    return { t: 'table' };
  }
  if (lv === 'spread' && spread) {
    const v = spread.view;
    if (p.y < v.y || p.x < v.x || p.x > v.x + v.w) return { t: 'outside' };
    const sp = spriteAt(spreadList, p.x, p.y);
    return sp ? { t: 'card', id: sp.id, holdable: true } : { t: 'table' };
  }
  return null;
}

function updateHeld() {
  if (!held || !spread) return;
  const s = scrollOf(spread.kind), v = spread.view;
  const n = spread.list.length;
  const slot = spread.lay.slot(held.x, held.y - v.y + s.y);
  const ins = Math.max(0, Math.min(n - 1, slot));
  if (ins !== held.insert) { held.insert = ins; if (navigator.vibrate) try { navigator.vibrate(4); } catch (e) { /* ignore */ } }
  relayout(false);
}

const gestures = {
  down: p => hitAt(p),
  tap(hit) {
    if (!hit) return;
    const G = GESTURES[lv] || {};
    if (lv === 'deck' && hit.t === 'deck') {
      if (!cards.length) { actions.emptyDeck && actions.emptyDeck(); return; }
      if (G.tapDeck === 'cut') { learned('deck'); nav.push({ lv: 'piles' }); }
    } else if (lv === 'piles' && hit.t === 'pile' && G.tapPile === 'spread') {
      learned('piles'); nav.push({ lv: 'spread', kind: hit.kind });
    } else if (lv === 'spread' && hit.t === 'card' && G.tapCard === 'lift') {
      learned('spread');
      actions.lift && actions.lift(hit.id, spread.list.map(c => c.id));
    } else if (lv === 'spread' && hit.t === 'outside' && stage === 'popup') nav.back();
  },
  dragStart(hit, p0) {
    if (lv === 'piles' && hit && hit.t === 'pile') { pileDrag = { kind: hit.kind, dx: 0, dy: 0 }; relayout(false); return; }
    if (lv === 'spread' && spread) {
      const s = scrollOf(spread.kind);
      s.dragging = true; s.target = null; s.v = 0; s.y0 = s.y; s.p0 = p0.y;
      scrollFinger = p0.y;
    }
  },
  dragMove(hit, p, d) {
    if (pileDrag) { pileDrag.dx = d.x; pileDrag.dy = d.y; relayout(false); return; }
    if (lv === 'spread' && spread) {
      const s = scrollOf(spread.kind), max = spread.max, rub = x => 0.5 * x / (1 + x / 420);
      let y = s.y0 - d.y;
      if (y < 0) y = -rub(-y); else if (y > max) y = max + rub(y - max);
      s.y = y; scrollFinger = p.y;
      for (const sp of spreadList) sp.k = 1 - 0.5 * Math.min(1, Math.abs(sp.y - p.y) / (H * 0.9));
      relayout(false);
    }
  },
  dragEnd(hit, p, v) {
    if (pileDrag) {
      const k = pileDrag.kind, far = Math.hypot(pileDrag.dx, pileDrag.dy), fast = Math.hypot(v.x, v.y);
      pileDrag = null;
      if ((fast > 0.45 || far > 90) && (GESTURES.piles || {}).flingPile === 'spread') { learned('piles'); nav.push({ lv: 'spread', kind: k }); }
      else relayout(false);
      return;
    }
    if (lv === 'spread' && spread) {
      const s = scrollOf(spread.kind);
      s.dragging = false; s.v = -v.y * 1000 * (0.6 + settings.fling * 0.8);
      for (const sp of spreadList) sp.k = 1;
      learned('spread');
      kick();
    }
  },
  holdStart(hit, p) {
    if (lv !== 'spread' || !hit || hit.t !== 'card') return;
    const i = spread.list.findIndex(c => c.id === hit.id);
    held = { id: hit.id, x: p.x, y: p.y, insert: i, from: i };
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* ignore */ }
    relayout(false);
  },
  holdMove(hit, p) { if (held) { held.x = p.x; held.y = p.y; updateHeld(); } },
  holdEnd() {
    if (!held) return;
    const h = held; held = null;
    if (h.insert !== h.from) commitMove(h.id, h.insert);
    relayout(false);
  },
  cancel() {
    if (pileDrag) { pileDrag = null; relayout(false); }
    if (held) { held = null; relayout(false); }
    if (spread) { const s = scrollOf(spread.kind); s.dragging = false; kick(); }
  }
};

// Moving a card saves its new place: an order number between its new neighbors.
function commitMove(id, at) {
  const list = cards.filter(c => c.kind === kind && c.id !== id), card = decks.app.cards.get(id);
  list.splice(at, 0, card);
  const prev = list[at - 1], next = list[at + 1];
  if (prev && next && Math.abs(next.order - prev.order) < 1e-6) {
    list.forEach((c, i) => { c.order = i + 1; });
    decks.saveCards(list);
    return;
  }
  card.order = prev && next ? (prev.order + next.order) / 2 : prev ? prev.order + 1 : next ? next.order - 1 : 0;
  decks.saveCard(card);
}

/* ---------- the lifted card asks the table about its spot ---------- */
// Where a card is now (x, y, r) and where it's headed (tx, ty, tr), in screen px.
export function spriteBox(id) {
  const sp = sprites.get(id);
  if (!sp) return null;
  const sh = stage === 'popup' && spread ? (1 - stageT) * (H - spread.view.sheetTop) : 0;
  return { x: sp.x, y: sp.y + sh, r: sp.r, s: sp.s, tx: sp.tx, ty: sp.ty + sh, tr: sp.tr, visible: sp.ta > 0.5 };
}
export function setHidden(id, on) { const sp = sprites.get(id); if (sp) { sp.hidden = on; kick(); } }
export function reveal(id) {
  if (!spread || !spread.byId.has(id)) return;
  const s = scrollOf(spread.kind), spot = spread.byId.get(id);
  s.target = Math.max(0, Math.min(spread.max, spot.y - spread.view.h * 0.5));
  kick();
}
export const level = () => lv;
export const spreadKind = () => kind;

/* ---------- setup ---------- */
function readInsets() {
  const probe = document.getElementById('inset-probe');
  if (!probe) return;
  const cs = getComputedStyle(probe);
  insets.top = parseFloat(cs.paddingTop) || 0; insets.bottom = parseFloat(cs.paddingBottom) || 0;
}
function makeMatPattern() {
  const tile = mat(), k = Math.max(1, Math.round(2 * dpr)), big = document.createElement('canvas');
  big.width = 32 * k; big.height = 32 * k;
  const g = big.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(tile.toCanvas(), 0, 0, 32 * k, 32 * k);
  matPat = ctx.createPattern(big, 'repeat');
}
export function resize() {
  const w = innerWidth, h = innerHeight, r = Math.min(3, devicePixelRatio || 1);
  if (w === W && h === H && r === dpr) return;
  const first = W === 1;
  W = w; H = h; dpr = r;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  readInsets(); makeMatPattern();
  relayout(false);
  if (first) for (const sp of sprites.values()) place(sp);
  kick();
}

export function initTable(el) {
  canvas = el; ctx = canvas.getContext('2d', { alpha: false });
  tipImg = PANELS.tip().toCanvas(); plaqueImg = PANELS.plaque().toCanvas();
  stage = stageFor();
  refreshCards();
  resize();
  for (const sp of sprites.values()) place(sp);
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!document.body.classList.contains('writing')) resize(); }, 120); });
  attachInput(canvas, gestures);
  nav.onNav(stack => onNav(stack));
  decks.onChange(ev => {
    if (ev.type === 'deck' && decks.app.current !== deckId) {
      for (const k in scrolls) delete scrolls[k];
      sprites.clear(); lv = 'deck'; kind = null;
      refreshCards(); relayout(false); for (const sp of sprites.values()) place(sp); updateHints();
      return;
    }
    refreshCards(); relayout(false); updateHints();
  });
  onSettings(k => { if (k === 'stage') { stage = stageFor(); relayout(false); } kick(); });
  setSwayWanted(() => phys.sway > 0 && lv !== 'deck');
  addTicker(tick);
  updateHints();
}
