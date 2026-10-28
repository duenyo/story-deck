// The one place that converts saved cards and decks from older shapes to the current one.
// Shape 1 is the first; when the shape changes, add a step here and bump SHAPE in cards.js.
import { SHAPE } from './cards.js';

export function upgradeCard(c) {
  if (!c || typeof c !== 'object') return null;
  c.v = c.v || 1;
  c.kind = c.kind || 'i';
  c.sub = c.sub || '';
  c.text = c.text || '';
  c.labels = Array.isArray(c.labels) ? c.labels : [];
  c.links = Array.isArray(c.links) ? c.links : [];
  c.pic = c.pic || { seed: 0, roll: 0, set: true };
  c.order = typeof c.order === 'number' ? c.order : (c.born || 0);
  c.born = c.born || Date.now();
  c.edited = c.edited || c.born;
  c.binned = c.binned || 0;
  c.x = c.x || {};
  // shape 1 → 2: cards gain a back to write on
  if (typeof c.back !== 'string') c.back = '';
  if (c.v < SHAPE) c.v = SHAPE;
  if (c.v > SHAPE) console.warn('Card from a newer version of Story Deck', c.id);
  return c;
}

export function upgradeDeck(d) {
  if (!d || typeof d !== 'object') return null;
  d.v = d.v || 1;
  d.name = d.name || 'Untitled deck';
  d.sample = !!d.sample;
  d.born = d.born || Date.now();
  d.edited = d.edited || d.born;
  d.x = d.x || {};
  return d;
}
