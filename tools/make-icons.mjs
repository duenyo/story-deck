// Draws the app icons from the same pixel rules as the cards (the card back and the cutting mat).
// Run from the repo folder: node tools/make-icons.mjs
import fs from 'fs';
import zlib from 'zlib';
import { Img } from '../js/art/pixels.js';
import { deckStack, back } from '../js/art/face.js';
import { mat } from '../js/art/panels.js';

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; }
function png(im) {
  const w = im.w, h = im.h, px = Buffer.from(im.px.buffer), raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function shadowOf(src) { return src.silhouette('#0b1510'); }

// The mat tiled at k, a soft lamp spot, and art centered at k with a hard shadow.
function icon(size, tileK, art, k) {
  const im = new Img(size, size), tile = mat();
  for (let y = 0; y < size; y += 32 * tileK) for (let x = 0; x < size; x += 32 * tileK) im.blit(tile, x, y, tileK);
  const ox = Math.round((size - art.w * k) / 2), oy = Math.round((size - art.h * k) / 2);
  const sh = shadowOf(art);
  for (let y = 0; y < sh.h * k; y++) for (let x = 0; x < sh.w * k; x++) {
    const si = (Math.floor(y / k) * sh.w + Math.floor(x / k)) * 4;
    if (!sh.px[si + 3]) continue;
    const tx = ox + x + 2 * k, ty = oy + y + 3 * k; if (tx >= size || ty >= size) continue;
    const ti = (ty * size + tx) * 4; im.px[ti] = im.px[ti] * 0.45; im.px[ti + 1] = im.px[ti + 1] * 0.45; im.px[ti + 2] = im.px[ti + 2] * 0.45;
  }
  im.blit(art, ox, oy, k);
  return im;
}

// A blank idea card with a red plus, for the New idea shortcut.
function plusCard() {
  const im = new Img(22, 30), O = '#1a1210';
  for (let y = 0; y < 30; y++) for (let x = 0; x < 22; x++) {
    const corner = (x < 1 || x > 20) && (y < 1 || y > 28);
    if (corner) continue;
    const edge = x === 0 || y === 0 || x === 21 || y === 29;
    im.set(x, y, edge ? O : y === 1 || x === 1 ? '#f8eed6' : y === 28 || x === 20 ? '#c9b48a' : '#efe3c6');
  }
  for (let i = 6; i <= 15; i++) for (let t = 0; t < 2; t++) { im.set(i, 14 + t, '#8e2b2b'); im.set(10 + t, i + 4, '#8e2b2b'); }
  return im;
}

const out = new URL('../icons/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const deck = deckStack(5);
fs.writeFileSync(new URL('icon-512.png', out), png(icon(512, 8, deck, 6)));
fs.writeFileSync(new URL('icon-192.png', out), png(icon(192, 3, deck, 2)));
fs.writeFileSync(new URL('maskable-512.png', out), png(icon(512, 8, deck, 4)));
fs.writeFileSync(new URL('new-idea-96.png', out), png(icon(96, 3, plusCard(), 2)));
console.log('icons written');
