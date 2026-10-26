// Card faces drawn once and kept until a card's look changes. Shared art (back, deck, shadow) too.
import { face, back, deckStack, blankCard, CW, CH } from './face.js';
import { faceSpec } from '../cards.js';
import { getVersion } from '../decks.js';

const faces = new Map();   // id -> { ver, key, canvas }
export function faceCanvas(card, ix) {
  const ver = getVersion();
  let e = faces.get(card.id);
  if (e && e.ver === ver) return e.canvas;
  const spec = faceSpec(card, ix), key = JSON.stringify(spec);
  if (!e || e.key !== key) e = { key, canvas: face(spec).toCanvas() };
  e.ver = ver;
  faces.set(card.id, e);
  return e.canvas;
}
export const dropFace = id => faces.delete(id);

let shared = null;
export function art() {
  if (shared) return shared;
  const b = back();
  shared = {
    back: b.toCanvas(),
    shadow: b.silhouette('#000000').toCanvas(),
    blank: blankCard().toCanvas(),
    decks: new Map(),
    deck(layers) { if (!this.decks.has(layers)) this.decks.set(layers, deckStack(layers).toCanvas()); return this.decks.get(layers); }
  };
  return shared;
}
export { CW, CH };
