// Where cards sit at each level: cards and the visible area in, spots out (card centers, in CSS px).
// Spread spots use content y; the table subtracts the scroll.
import { hash } from '../art/rng.js';

export const CARD_W = 88, CARD_H = 124; // a 44x62 card at 2x

export const deckSpot = view => ({ x: Math.round(view.x + view.w / 2), y: Math.round(view.y + view.h * 0.46) });

// Piles by kind, each a cascade showing the top strips of its first five cards.
export function pilesLayout(groups, view, top, bottom) {
  const n = groups.length, cols = n <= 3 ? n : n === 4 ? 2 : 3, rows = Math.ceil(n / cols);
  const availH = view.h - top - bottom, gapY = 18;
  let off = 24, pileH = CARD_H + off * 4 + 36;
  while (rows * pileH + (rows - 1) * gapY > availH && off > 10) { off -= 2; pileH = CARD_H + off * 4 + 36; }
  const colW = Math.min(124, (view.w - 16) / Math.max(1, cols));
  const blockH = rows * pileH + (rows - 1) * gapY;
  const y0 = view.y + top + Math.max(0, (availH - blockH) / 2);
  return groups.map((g, i) => {
    const r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, n - r * cols);
    const x = Math.round(view.x + view.w / 2 + (c - (inRow - 1) / 2) * colW);
    const y = Math.round(y0 + r * (pileH + gapY));
    const last = Math.min(g.cards.length - 1, 4);
    return {
      kind: g.kind, x, top: y, off, count: g.cards.length,
      // the rest of the pile hides under the fifth card
      spots: g.cards.map((card, j) => ({ id: card.id, x, y: y + CARD_H / 2 + Math.min(j, 4) * off, layer: j < 5 ? j : 3.5 })),
      labelY: y + CARD_H + last * off + 8,
      rect: { x: x - CARD_W / 2 - 8, y: y - 8, w: CARD_W + 16, h: CARD_H + last * off + 44 }
    };
  });
}

// The Thread: beats alternate left and right of a winding line, in story order, top to bottom.
export function threadLayout(cards, view, top = 84, bottom = 200) {
  const cx = view.x + view.w / 2, dx = Math.min(Math.round(view.w * 0.21), 90);
  const step = 84;
  const spots = cards.map((c, i) => {
    const side = i % 2 ? 1 : -1;
    return { id: c.id, x: Math.round(cx + side * dx), y: top + CARD_H / 2 + i * step, side, r: 0 };
  });
  const slot = (x, cy) => Math.round((cy - top - CARD_H / 2) / step);
  return { spots, height: top + CARD_H + Math.max(0, cards.length - 1) * step + bottom, slot, thread: true };
}
export const pinOffset = side => ({ x: -side * (CARD_W / 2 - 6), y: -CARD_H / 2 + 30 });

// A loose scatter for the piles whose own layouts come later (people web, place map, idea inbox).
export function scatterLayout(cards, view, top = 84, bottom = 200) {
  const cols = Math.max(2, Math.min(5, Math.floor((view.w - 20) / 116)));
  const colW = (view.w - 20) / cols, rowH = 148;
  const spots = cards.map((c, i) => {
    const h = hash(c.id), col = i % cols, row = Math.floor(i / cols);
    const jx = ((h & 255) / 255 - 0.5) * 10, jy = (((h >>> 8) & 255) / 255 - 0.5) * 10, jr = (((h >>> 16) & 255) / 255 - 0.5) * 0.08;
    return { id: c.id, x: Math.round(view.x + 10 + colW * (col + 0.5) + jx), y: Math.round(top + CARD_H / 2 + row * rowH + jy), r: jr };
  });
  const rows = Math.ceil(cards.length / cols);
  const slot = (x, cy) => {
    const col = Math.max(0, Math.min(cols - 1, Math.floor((x - view.x - 10) / colW)));
    const row = Math.max(0, Math.floor((cy - top) / rowH));
    return row * cols + col;
  };
  return { spots, height: top + rows * rowH + bottom, slot };
}

export const LAYOUTS = { thread: threadLayout, scatter: scatterLayout };
