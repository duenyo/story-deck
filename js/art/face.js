// The 44x62 card: frame, title plate, picture window, kind line, people dots and seal.
// Same drawing rules as make-sprites.js; beats and questions add an icon and a color of their own.
import { Img } from './pixels.js';
import { hash, mulberry, shade } from './rng.js';
import { sigil, W as SW, H as SH } from './sigils.js';
import { FONT, text, textW, fitLabel } from './font.js';

export const CW = 44, CH = 62;
const OUTL = '#1a1210', F0 = '#3b2a1c', F1 = '#563d27', F2 = '#765536', F3 = '#94704a', F4 = '#b8905e';
const PL = '#d9bf8f', PLH = '#f1deb3', PLS = '#ad8d60', PE = '#2b1d12', PA = '#efe0bd', PAH = '#f8eed6';
export const KIND_INK = { person: '#a8352a', place: '#3c6e39', idea: '#93630c', concept: '#34559a', beat: '#6b3f86', question: '#2f6f73' };
const ICON = {
  person: ['.###.', '.###.', '..#..', '#####', '#####'], place: ['..#..', '.###.', '#####', '.#.#.', '.#.#.'],
  idea: ['..#..', '..#..', '##.##', '..#..', '..#..'], concept: ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  beat: ['#####', '#####', '#####', '##.##', '#...#'], question: ['.###.', '#...#', '..##.', '.....', '..#..']
};

const cutPx = (x, y, w, h) => { const cx = x < 2 ? x : x > w - 3 ? w - 1 - x : 9, cy = y < 2 ? y : y > h - 3 ? h - 1 - y : 9; return cx + cy < 2; };
const edgePx = (x, y, w, h) => { const cx = x < 2 ? x : x > w - 3 ? w - 1 - x : 9, cy = y < 2 ? y : y > h - 3 ? h - 1 - y : 9; return !cutPx(x, y, w, h) && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || (cx === 1 && cy === 1)); };

function cardBase(w, h, P, R) {
  const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (cutPx(x, y, w, h)) continue;
    if (edgePx(x, y, w, h)) { im.set(x, y, OUTL); continue; }
    let c = P.fill;
    if (y === 1 || x === 1) c = P.hi;
    if (y === h - 2 || x === w - 2) c = P.lo;
    if (c === P.fill && P.specA) { const r = R(); if (r < 0.1) c = P.specA; else if (r < 0.16) c = P.specB; }
    im.set(x, y, c);
  }
  return im;
}

function plate(im, x0, y0, x1, y1, fill, hi, lo) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if ((x === x0 || x === x1) && (y === y0 || y === y1)) continue;
    if (x === x0 || x === x1 || y === y0 || y === y1) { im.set(x, y, PE); continue; }
    im.set(x, y, y === y0 + 1 ? hi : (lo && y === y1 - 1) ? lo : fill);
  }
}

function pip(im, x, y, col, ch) {
  const S = ['.#####.', '#ccccc#', '#ccccc#', '#ccccc#', '#ccccc#', '#ccccc#', '.#####.'];
  S.forEach((row, j) => { for (let i = 0; i < 7; i++) { if (row[i] === '#') im.set(x + i, y + j, OUTL); else if (row[i] === 'c') im.set(x + i, y + j, col); } });
  im.set(x + 1, y + 1, shade(col, 0.35)); im.set(x + 5, y + 5, shade(col, -0.3));
  const g = FONT[ch] || FONT['?'], gw = g[0].length, tx = x + 1 + Math.floor((5 - gw) / 2);
  g.forEach((row, j) => { for (let i = 0; i < gw; i++) if (row[i] === '#') im.set(tx + i, y + 1 + j, '#fff3dc'); });
}

function seal(im, ox, oy) {
  const M = ['..xxxxx..', '.xxxxxxx.', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', '.xxxxxxx.', '..xxxxx..'];
  const inM = (x, y) => y >= 0 && y < 9 && x >= 0 && x < 9 && M[y][x] === 'x';
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (!inM(x, y)) continue;
    const border = !inM(x - 1, y) || !inM(x + 1, y) || !inM(x, y - 1) || !inM(x, y + 1);
    im.set(ox + x, oy + y, border ? OUTL : x + y < 7 ? '#f6d873' : x + y > 10 ? '#b8841f' : '#e3b23c');
  }
  [[4, 2], [4, 3], [4, 5], [4, 6], [2, 4], [3, 4], [5, 4], [6, 4]].forEach(p => im.set(ox + p[0], oy + p[1], '#8a5f12'));
  im.set(ox + 4, oy + 4, '#fff0b0');
}

// f: { frameKey, title, kind, label, pips: [{color, initial}], seal, seed, ink }
// title and label are already shortened to fit (font.js).
export function face(f) {
  const R = mulberry(hash('frame|' + f.frameKey));
  const im = cardBase(CW, CH, { fill: F2, hi: F4, lo: F1, specA: F3, specB: F1 }, R);
  plate(im, 3, 3, 40, 11, PL, PLH, PLS);
  const tw = textW(f.title);
  if (f.title) text(im, f.title, 4 + Math.floor((36 - tw) / 2), 5, '#24180f');
  im.rect(5, 12, 38, 12, F0); im.rect(4, 12, 4, 38, F0); im.rect(5, 39, 39, 39, F4); im.rect(39, 13, 39, 39, F4);
  im.rect(5, 13, 38, 13, OUTL); im.rect(5, 38, 38, 38, OUTL); im.rect(5, 13, 5, 38, OUTL); im.rect(38, 13, 38, 38, OUTL);
  const art = sigil(f.kind, f.seed, f.ink);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) im.set(6 + x, 14 + y, art[y * SW + x]);
  plate(im, 3, 40, 40, 47, PL, PLH, null);
  const icon = ICON[f.kind] || ICON.idea, ink = KIND_INK[f.kind] || KIND_INK.idea;
  icon.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === '#') im.set(5 + i, 42 + j, ink); });
  const label = fitLabel(f.label);
  text(im, label, textW(label) > 28 ? 11 : 12, 42, '#24180f');
  plate(im, 3, 49, 40, 58, PA, PAH, null);
  if (f.pips && f.pips.length) f.pips.slice(0, 4).forEach((p, i) => pip(im, 5 + i * 8, 50, p.color, p.initial));
  else [[52, 37], [55, 29]].forEach(([y, end]) => { let x = 6; while (x < end) { const len = 2 + Math.floor(R() * 5); for (let i = 0; i < len && x + i <= end; i++) im.set(x + i, y, '#b39d74'); x += len + 1 + Math.floor(R() * 2); } });
  if (f.seal) seal(im, 31, 31);
  return im;
}

export function back() {
  const R = mulberry(hash('story deck back'));
  const im = cardBase(CW, CH, { fill: '#7d2a24', hi: '#a8463a', lo: '#561b17' }, R);
  for (let y = 2; y < 60; y++) for (let x = 2; x < 42; x++) if ((x + y) % 6 === 0 || ((x - y) % 6 + 6) % 6 === 0) im.set(x, y, '#68221e');
  for (let x = 4; x <= 39; x++) { im.set(x, 3, '#e6cf9c'); im.set(x, 58, '#e6cf9c'); }
  for (let y = 4; y <= 57; y++) { im.set(3, y, '#e6cf9c'); im.set(40, y, '#e6cf9c'); }
  [[7, 7], [36, 7], [7, 54], [36, 54]].forEach(([x, y]) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(o => im.set(x + o[0], y + o[1], '#e6cf9c')));
  for (let y = 18; y <= 43; y++) for (let x = 9; x <= 34; x++) {
    const d = Math.hypot(x - 21.5, y - 30.5);
    if (d < 8.6) im.set(x, y, '#4e1815'); else if (d < 9.8) im.set(x, y, '#d9a441'); else if (Math.abs(d - 11.3) < 0.5 && (x + y) % 2 === 0) im.set(x, y, '#e6cf9c');
  }
  const q = []; for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) q.push(R() < 0.5 ? (R() < 0.35 ? '#f1dfb0' : '#d9a441') : null);
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    let a = i < 6 ? i : 11 - i, b = j < 6 ? j : 11 - j; if (a > b) { const t = a; a = b; b = t; }
    const c = q[b * 6 + a]; if (c && Math.hypot(16 + i - 21.5, 25 + j - 30.5) < 7.6) im.set(16 + i, 25 + j, c);
  }
  return im;
}

// The deck seen from the bench: backs stacked 2 px apart, one layer per few cards (make-sprites draws 5).
export function deckStack(layers = 5) {
  const b = back(), n = Math.max(1, Math.min(8, layers)), dk = new Img(CW, CH + (n - 1) * 2);
  for (let k = n - 1; k >= 0; k--) dk.blit(b, 0, k * 2);
  return dk;
}

// A blank paper card for the empty-deck slot and the new-idea icon.
export function blankCard() {
  return cardBase(CW, CH, { fill: '#e9dcbc', hi: '#f8eed6', lo: '#c9b48a' }, mulberry(1));
}
