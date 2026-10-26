// Sigils: a card's words become a number, and these rules turn the number into a 32x24 picture.
// Ported unchanged from make-sprites.js (the Sigil Workbench rules). Each rule returns a grid of hex colors.
import { hash, mulberry, pick, shade, norm } from './rng.js';

export const W = 32, H = 24;
const INK = '#1b1410', PAPER = '#efe3c6';

function grid(c) { const g = new Array(W * H); for (let i = 0; i < g.length; i++) g[i] = c; return g; }
function set(g, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) g[y * W + x] = c; }
function line(g, x0, y0, x1, y1, c) {
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
  for (;;) {
    set(g, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/* Person: a little symmetrical creature */
const BODIES = [['rust', '#c0582f', '#8e2b2b'], ['moss', '#6f8a3a', '#45581f'], ['teal', '#2f7f78', '#1d4f4a'], ['plum', '#7a4f96', '#4b2e60'], ['rose', '#c97a8a', '#94505e'], ['ochre', '#b08a52', '#7a5a33'], ['blue', '#3f6fb0', '#26446e'], ['gold', '#d9a441', '#9c7124']];
const EYES = [['bone', '#f7f0dc'], ['amber', '#ffd86b'], ['ice-blue', '#bfe6ff']];
function creature(R) {
  const bg = pick(R, ['#e9dfc4', '#d9cba6', '#d3dbc6', '#e6d3cb', '#cfd4de']);
  const g = grid(bg), halo = shade(bg, -0.1); let x, y, xx, yy;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) { const hx = (x - 15.5) / 11, hy = (y - 12) / 10; if (hx * hx + hy * hy < 1) set(g, x, y, halo); }
  const pal = pick(R, BODIES), body = pal[1], dark = pal[2], sw = 11, sh = 12, half = 6, ox = 10, oy = 6, left = [];
  for (yy = 0; yy < sh; yy++) for (xx = 0; xx < half; xx++) {
    let p = 0.46; if (xx === half - 1) p += 0.22; if (xx === 0) p -= 0.22; if (yy === 0 || yy === sh - 1) p -= 0.12;
    let on = R() < p; if (yy >= 3 && yy <= 8 && xx >= half - 2) on = true;
    left.push(on ? ((yy >= 8 || R() < 0.14) ? dark : body) : null);
  }
  const spr = new Array(sw * sh);
  for (yy = 0; yy < sh; yy++) for (xx = 0; xx < sw; xx++) spr[yy * sw + xx] = left[yy * half + (xx < half ? xx : sw - 1 - xx)];
  const eyeP = pick(R, EYES), cyclops = R() < 0.25, ey = 3 + Math.floor(R() * 2), ex = 3 + Math.floor(R() * 2);
  (cyclops ? [5] : [ex, sw - 1 - ex]).forEach(cx => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = (ey + j) * sw + cx + i; if (!spr[k]) spr[k] = body; }
    spr[ey * sw + cx] = eyeP[1]; spr[(ey + 1) * sw + cx] = INK;
  });
  const mouth = R() < 0.5;
  if (mouth) { const my = ey + 3, mw = R() < 0.5 ? 0 : 1; for (let m = 5 - mw; m <= 5 + mw; m++) if (spr[my * sw + m]) spr[my * sw + m] = INK; }
  const mask = {};
  for (yy = 0; yy < sh; yy++) for (xx = 0; xx < sw; xx++) if (spr[yy * sw + xx]) { set(g, ox + xx, oy + yy, spr[yy * sw + xx]); mask[(oy + yy) * W + ox + xx] = 1; }
  if (R() < 0.4) {
    const hcol = 1 + Math.floor(R() * 3);
    [hcol, sw - 1 - hcol].forEach(cx => {
      let top = 0; while (top < sh && !spr[top * sw + cx]) top++;
      if (top > 4) return;
      const out = cx < 5 ? -1 : 1;
      [[0, -1], [out, -2]].forEach(o => { const px = ox + cx + o[0], py = oy + top + o[1]; set(g, px, py, dark); mask[py * W + px] = 1; });
    });
  }
  for (y = oy - 4; y <= oy + sh; y++) for (x = ox - 2; x <= ox + sw + 1; x++) {
    if (mask[y * W + x]) continue;
    if (mask[y * W + x - 1] || mask[y * W + x + 1] || mask[(y - 1) * W + x] || mask[(y + 1) * W + x]) set(g, x, y, INK);
  }
  return g;
}

/* Place: a skyline or a forest under a banded sky */
const SKIES = [
  { sky: ['#1c2236', '#2f3561', '#5b4f86'], hill: '#2a2a3f', bld: '#141420', win: '#ffd86b', ground: '#101018', moon: '#f2e6b8', stars: true },
  { sky: ['#3a3560', '#a0596b', '#e39a6a'], hill: '#5a3a4a', bld: '#2a1d24', win: '#ffd86b', ground: '#1e1418', moon: '#ffe7b0', stars: true },
  { sky: ['#6f9fd0', '#9cc3e4', '#d8e8f0'], hill: '#5f8a5a', bld: '#4a4f5a', win: '#f2e6b8', ground: '#3f5a3a', moon: '#ffffff', stars: false },
  { sky: ['#2a3a3a', '#4f6a5f', '#9fb39a'], hill: '#2f4a3a', bld: '#1e2a24', win: '#d9e88a', ground: '#18221c', moon: '#e8f0d8', stars: false }
];
function place(R) {
  const P = pick(R, SKIES), g = grid(P.sky[0]), gy = 19; let x, y;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) { let band = y < 7 ? 0 : y < 13 ? 1 : 2; if ((y === 6 || y === 12) && (x + y) % 2 === 0) band += 1; set(g, x, y, P.sky[Math.min(2, band)]); }
  if (P.stars) for (let s = 0; s < 7; s++) set(g, Math.floor(R() * W), Math.floor(R() * 6), P.moon);
  const mx = 4 + Math.floor(R() * 24), my = 2 + Math.floor(R() * 4);
  for (y = my - 2; y <= my + 2; y++) for (x = mx - 2; x <= mx + 2; x++) if ((x - mx) * (x - mx) + (y - my) * (y - my) <= 5) set(g, x, y, P.moon);
  let h = 13 + Math.floor(R() * 3);
  for (x = 0; x < W; x++) { h += Math.floor(R() * 3) - 1; h = Math.max(11, Math.min(16, h)); for (y = h; y < H; y++) set(g, x, y, P.hill); }
  const forest = R() < 0.35;
  if (forest) {
    const tree = shade(P.hill, -0.4);
    for (let n = 0; n < 7; n++) { const tx = 1 + Math.floor(R() * 30), th = 5 + Math.floor(R() * 7); for (let k = 0; k < th; k++) { const hw = Math.floor(k / 2); for (let i = -hw; i <= hw; i++) set(g, tx + i, gy - th + k, tree); } set(g, tx, gy, '#3b2a1e'); }
  } else {
    x = 0;
    while (x < W) {
      const w = 2 + Math.floor(R() * 4), bh = 3 + Math.floor(R() * 9), y0 = gy - bh; let bx, by;
      for (bx = x; bx < x + w; bx++) for (by = y0; by < gy; by++) set(g, bx, by, P.bld);
      if (w >= 3 && R() < 0.4) { const mid = x + Math.floor(w / 2); set(g, mid, y0 - 1, P.bld); if (w >= 5) { set(g, mid - 1, y0 - 1, P.bld); set(g, mid + 1, y0 - 1, P.bld); set(g, mid, y0 - 2, P.bld); } }
      for (bx = x + 1; bx < x + w - 1; bx++) for (by = y0 + 1; by < gy - 1; by++) if (R() < 0.2) set(g, bx, by, P.win);
      x += w + (R() < 0.3 ? 1 : 0);
    }
  }
  for (y = gy; y < H; y++) for (x = 0; x < W; x++) set(g, x, y, P.ground);
  return g;
}

/* Concept: a crest with four- or eight-way symmetry inside a ring (for later kinds) */
const GOLDS = [['gold', '#d9a441'], ['straw', '#e0c070'], ['brass', '#c9a24a'], ['bone', '#e6d3a3']];
const ACCENTS = [['rust', '#c0582f'], ['teal', '#2f9f94'], ['slate', '#6a8fb0'], ['rose', '#c97a8a'], ['moss', '#8fbf6a']];
function crest(R) {
  const bg = pick(R, ['#1b1410', '#1c2236', '#2a1630', '#13221f']);
  const g = grid(bg), ringC = shade(pick(R, ['#d9a441', '#c9a24a', '#b9b29a']), -0.25); let x, y, i, j;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) { const d = Math.sqrt((x - 15) * (x - 15) + (y - 12) * (y - 12)); if (Math.abs(d - 10.6) < 0.55) set(g, x, y, ringC); }
  const c1 = pick(R, GOLDS), c2 = pick(R, ACCENTS), eight = R() < 0.5, n = 15, hc = 7, q = [];
  for (j = 0; j <= hc; j++) for (i = 0; i <= hc; i++) { const p = 0.42 + (i + j > 8 ? 0.18 : 0); q.push(R() < p ? (R() < 0.3 ? c2[1] : c1[1]) : null); }
  const cell = (ci, cj) => { let a = ci <= hc ? ci : n - 1 - ci, b = cj <= hc ? cj : n - 1 - cj; if (eight && a > b) { const t = a; a = b; b = t; } return q[b * (hc + 1) + a]; };
  for (j = 0; j < n; j++) for (i = 0; i < n; i++) { const c = cell(i, j); if (c) set(g, 8 + i, 5 + j, c); }
  set(g, 8 + hc, 5 + hc, '#f7f0dc');
  return g;
}

/* Idea: an ink rune on parchment, mirrored down the middle.
   Beats and questions use the same rune, inked in their own color. */
function rune(R, ink = '#2a1d0c') {
  const g = grid(PAPER), red = '#8e2b2b'; let x, y, i;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (R() < 0.07) set(g, x, y, '#e2d3ae');
  const ring = R() < 0.55;
  if (ring) for (y = 0; y < H; y++) for (x = 0; x < W; x++) { const d = Math.sqrt((x - 16) * (x - 16) + (y - 12) * (y - 12)); if (Math.abs(d - 11) < 0.5 && (x + y) % 2 === 0) set(g, x, y, ink); }
  const xs = [9, 12, 16], ys = [6, 10, 14, 18]; let path, turns, tries = 0;
  do {
    path = [[Math.floor(R() * 3), Math.floor(R() * 4)]]; turns = 0;
    const steps = 4 + Math.floor(R() * 4);
    for (let s = 0; s < steps; s++) {
      const c = path[path.length - 1], prev = path.length > 1 ? path[path.length - 2] : null, opts = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = c[0] + dx, ny = c[1] + dy; if ((dx || dy) && nx >= 0 && nx < 3 && ny >= 0 && ny < 4 && !(prev && prev[0] === nx && prev[1] === ny)) opts.push([nx, ny]); }
      const nxt = pick(R, opts); if (nxt[0] !== c[0]) turns++; path.push(nxt);
    }
  } while (turns < 2 && ++tries < 10);
  for (i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i]; line(g, xs[a[0]], ys[a[1]], xs[b[0]], ys[b[1]], ink); line(g, 32 - xs[a[0]], ys[a[1]], 32 - xs[b[0]], ys[b[1]], ink); }
  if (R() < 0.4) line(g, 16, ys[0] - 2, 16, ys[3] + 2, ink);
  [path[0], path[path.length - 1]].forEach(pt => { const px = xs[pt[0]], py = ys[pt[1]], hollow = R() < 0.5; [px, 32 - px].forEach(qx => { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) set(g, qx + ox, py + oy, ink); if (hollow) set(g, qx, py, PAPER); }); });
  const used = {}, free = []; path.forEach(pt => { used[pt[0] + ',' + pt[1]] = 1; });
  for (let fx = 0; fx < 3; fx++) for (let fy = 0; fy < 4; fy++) if (!used[fx + ',' + fy]) free.push([fx, fy]);
  const marks = Math.min(free.length, Math.floor(R() * 3));
  for (i = 0; i < marks; i++) { const f = free.splice(Math.floor(R() * free.length), 1)[0], rx = xs[f[0]], ry = ys[f[1]]; [rx, 32 - rx].forEach(qx => { [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(o => set(g, qx + o[0], ry + o[1], red)); }); }
  return g;
}

// Which rule draws each kind. `ink` tints the rune for beats and questions.
const RULES = { idea: rune, person: creature, place: place, concept: crest, beat: rune, question: rune };

// The seed is fixed when a card is made, so later edits never change its picture.
export const seedFor = (kindName, text, roll = 0) => hash(kindName + '|' + norm(text) + '|' + roll);

export function sigil(kindName, seed, ink) {
  const rule = RULES[kindName] || rune;
  return rule === rune && ink ? rune(mulberry(seed), ink) : rule(mulberry(seed));
}
