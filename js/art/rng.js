// Words → number → dice. The same hash and dice as make-sprites.js and the Sigil Workbench.
export function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return h >>> 0;
}

export function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const pick = (R, arr) => arr[Math.floor(R() * arr.length)];

export function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

// f < 0 darkens toward black, f > 0 lightens toward white.
export function shade(h, f) {
  return '#' + hexRgb(h).map(v => {
    const x = Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
    return (x < 16 ? '0' : '') + x.toString(16);
  }).join('');
}

export const norm = t => t.trim().replace(/\s+/g, ' ').toLowerCase();
