// A deck's manuscript: its Beat cards in story order, each scene's prose on the card's back.
// Loose scenes are Idea cards marked as scenes, waiting to be placed in the story.
import * as decks from '../decks.js';
import { makeScene, wordsOf } from '../cards.js';

export const scenesOf = deckId => decks.deckCards(deckId).filter(c => c.kind === 'b');
export const looseOf = deckId => decks.deckCards(deckId).filter(c => c.kind === 'i' && (c.x.scene || c.back));

// Chapter numbers in story order: a scene marked x.ch starts the next chapter.
export function chapterNumbers(scenes) {
  const out = new Map(); let n = 0;
  scenes.forEach(s => { if (s.x.ch) out.set(s.id, ++n); });
  return out;
}

// An order number for a card placed right after `prev` (or first, or last).
export function orderAfter(list, prev) {
  const i = prev ? list.findIndex(c => c.id === prev.id) : -1;
  const a = prev ? prev.order : (list[0] ? list[0].order - 2 : 0);
  const next = prev ? list[i + 1] : list[0];
  if (!next) return a + 1;
  if (Math.abs(next.order - a) < 1e-6) return null; // too close: renumber
  return (a + next.order) / 2;
}
export function renumber(list) {
  list.forEach((c, i) => { c.order = (i + 1) * 16; });
  const saved = list.filter(c => decks.app.cards.has(c.id));
  if (saved.length) decks.saveCards(saved);
}

// A new, unsaved scene placed after `prev` (unsaved until it has words, like a new idea).
// `list` is the order it joins, including scenes on the page that aren't saved yet.
export function newScene(deckId, prev, { kind = 'b', x = {}, list } = {}) {
  list = list || (kind === 'b' ? scenesOf(deckId) : looseOf(deckId));
  let order = orderAfter(list, prev);
  if (order == null) { renumber(list); order = orderAfter(list, prev); }
  return makeScene({ deck: deckId, order, kind, x: kind === 'i' ? { scene: 1, ...x } : x });
}

// A loose scene joins the story right after `after` (or at the end).
export function place(card, after) {
  const list = scenesOf(card.deck);
  const prev = after || list[list.length - 1] || null;
  let order = orderAfter(list, prev);
  if (order == null) { renumber(list); order = orderAfter(list, prev); }
  card.kind = 'b'; card.order = order;
  delete card.x.scene;
  decks.saveCard(card);
}
// And a scene can go back to waiting.
export function unplace(card) {
  card.kind = 'i'; card.x.scene = 1; card.order = Date.now();
  decks.saveCard(card);
}

export const totalWords = deckId => scenesOf(deckId).reduce((n, c) => n + wordsOf(c), 0) + looseOf(deckId).reduce((n, c) => n + wordsOf(c), 0);
