// Small pixel-art pieces for the typewriter desk, drawn from rules like the cards:
// a candle that burns down toward today's goal, a month calendar stamped with wax seals, and a sprint hourglass.
import { Img } from '../art/pixels.js';
import { FONT } from '../art/font.js';

const OUT = '#1a1210';
function text(im, s, x, y, col) { for (const ch of s) { const g = FONT[ch] || FONT[' ']; g.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') im.set(x + i, y + j, col); }); x += g[0].length + 1; } }

/* ---------- the candle: p = today's progress 0..1, frame = flicker step, lit = still burning ---------- */
export function candle(p, frame, lit, smoke = 0) {
  const W = 18, H = 48, im = new Img(W, H);
  p = Math.max(0, Math.min(1, p));
  const base = 41, waxH = Math.round(3 + 29 * (1 - p)), top = base - waxH, x0 = 6, x1 = 11;
  // brass dish
  const dish = ['....##########....', '..##############..', '.################.', '..##############..', '....##########....'];
  dish.forEach((row, j) => { for (let i = 0; i < W; i++) if (row[i] === '#') { const edge = row[i - 1] !== '#' || row[i + 1] !== '#' || j === 0 || j === dish.length - 1; im.set(i, base + j, edge ? OUT : j === 1 ? '#f6d873' : j === 3 ? '#8a5f12' : '#c9a24a'); } });
  // wax
  for (let y = top; y < base; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    let c = '#efe3c6';
    if (x === x0 - 1 || x === x1 + 1) c = OUT;
    else if (x === x0) c = '#f8eed6';
    else if (x === x1) c = '#c9b48a';
    if (y === top && x > x0 - 1 && x < x1 + 1) c = '#e2d3ae';
    im.set(x, y, c);
  }
  for (let x = x0; x <= x1; x++) im.set(x, top - 1, OUT);
  // drips that grow as it burns
  [[x0, 3 + Math.round(p * 5)], [x1, 2 + Math.round(p * 3)]].forEach(([dx, len]) => { for (let k = 0; k < len && top + k < base; k++) im.set(dx, top + k, '#f8eed6'); });
  // wick
  im.set(8, top - 2, '#2b1d12'); im.set(9, top - 2, '#2b1d12'); im.set(9, top - 3, '#2b1d12');
  if (lit) {
    const sway = [0, 1, 0, -1][frame % 4], tall = [7, 8, 7, 6][frame % 4], fx = 9 + sway * 0;
    for (let k = 0; k < tall; k++) {
      const y = top - 4 - k, w = k < 2 ? 2 : k < 4 ? 2 : 1, sx = k > tall - 3 ? sway : 0;
      for (let i = -w; i <= w - (k > 4 ? 1 : 0); i++) im.set(fx + i + sx, y, k < 1 ? '#e98a2f' : (Math.abs(i) >= w ? '#e98a2f' : k < tall - 2 ? '#ffd86b' : '#fff6d8'));
    }
    im.set(fx, top - 5, '#fff6d8'); im.set(fx, top - 6, '#fff6d8');
  } else if (smoke > 0) {
    for (let k = 0; k < 4; k++) { const y = top - 5 - k * 3 - (frame % 3), x = 9 + ((k + frame) % 2); if (y > 0) im.set(x, y, k % 2 ? '#6b6b6b' : '#8a8a8a'); }
  }
  return im;
}

/* ---------- the month: met = Set of day numbers that reached the goal ---------- */
function seal(im, ox, oy) {
  const M = ['..xxxxx..', '.xxxxxxx.', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', '.xxxxxxx.', '..xxxxx..'];
  const inM = (x, y) => y >= 0 && y < 9 && x >= 0 && x < 9 && M[y][x] === 'x';
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (!inM(x, y)) continue;
    const border = !inM(x - 1, y) || !inM(x + 1, y) || !inM(x, y - 1) || !inM(x, y + 1);
    im.set(ox + x, oy + y, border ? OUT : x + y < 7 ? '#e0786a' : x + y > 10 ? '#7a2420' : '#a8352a');
  }
  [[4, 2], [4, 3], [4, 5], [4, 6], [2, 4], [3, 4], [5, 4], [6, 4]].forEach(p => im.set(ox + p[0], oy + p[1], '#5e1c18'));
  im.set(ox + 4, oy + 4, '#f2b3a8');
}
export function calendar(m, todayNum, stampedToday = 0) {
  const C = 12, cols = 7, rows = Math.ceil((m.firstWeekday + m.daysInMonth) / 7);
  const W = cols * C + 1, H = 8 + rows * C + 1, im = new Img(W, H);
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, i) => text(im, d, i * C + 5, 1, '#c9b48a'));
  for (let day = 1; day <= m.daysInMonth; day++) {
    const slot = m.firstWeekday + day - 1, cx = (slot % 7) * C, cy = 8 + Math.floor(slot / 7) * C;
    const future = day > todayNum;
    for (let y = 0; y <= C; y++) for (let x = 0; x <= C; x++) {
      const edge = x === 0 || y === 0 || x === C || y === C;
      im.set(cx + x, cy + y, edge ? '#4a3423' : future ? '#3b2a1c' : '#d9c7a0');
    }
    if (day === todayNum) for (let k = 1; k < C; k++) { im.set(cx + k, cy + 1, '#f6d873'); im.set(cx + k, cy + C - 1, '#f6d873'); im.set(cx + 1, cy + k, '#f6d873'); im.set(cx + C - 1, cy + k, '#f6d873'); }
    const s = String(day);
    text(im, s, cx + 2, cy + 2, future ? '#765536' : '#5a4029');
    if (m.met.has(day) && !(day === todayNum && stampedToday > 0 && stampedToday < 1)) seal(im, cx + 2, cy + 2);
  }
  return im;
}

/* ---------- the hourglass: t = share of the sprint gone, 0..1 ---------- */
export function hourglass(t, running, frame) {
  const W = 13, H = 19, im = new Img(W, H), wood = '#765536', woodHi = '#b8905e';
  for (let x = 0; x < W; x++) { im.set(x, 0, OUT); im.set(x, 1, x ? woodHi : OUT); im.set(x, 2, OUT); im.set(x, H - 3, OUT); im.set(x, H - 2, wood); im.set(x, H - 1, OUT); }
  im.set(0, 1, OUT); im.set(W - 1, 1, OUT); im.set(0, H - 2, OUT); im.set(W - 1, H - 2, OUT);
  const glassRows = H - 6, mid = 3 + Math.floor(glassRows / 2);
  const half = y => { const d = Math.abs(y - mid); return Math.max(1, Math.round(d * 0.75)); };
  for (let y = 3; y < H - 3; y++) {
    const h = half(y), l = 6 - h, r = 6 + h;
    im.set(l - 1, y, OUT); im.set(r + 1, y, OUT);
    for (let x = l; x <= r; x++) im.set(x, y, '#2a3340');
  }
  // sand: the top empties as the bottom fills
  const topRows = mid - 3, sandTop = Math.round(topRows * (1 - t)), sandBot = Math.round(topRows * t);
  for (let k = 0; k < sandTop; k++) { const y = mid - 1 - k; const h = half(y); for (let x = 6 - h; x <= 6 + h; x++) im.set(x, y, '#e0c070'); }
  for (let k = 0; k < sandBot; k++) { const y = H - 4 - k; const h = half(y); for (let x = 6 - h; x <= 6 + h; x++) im.set(x, y, '#d9a441'); }
  if (running && t < 1) for (let y = mid; y < H - 4 - sandBot; y++) if ((y + frame) % 2 === 0) im.set(6, y, '#f6d873');
  return im;
}

// Draws an Img into a canvas element at its own size (CSS scales it up crisply).
export function paint(canvas, im) {
  if (canvas.width !== im.w || canvas.height !== im.h) { canvas.width = im.w; canvas.height = im.h; }
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.px), im.w, im.h), 0, 0);
}
