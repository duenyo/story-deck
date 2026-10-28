// Earlier versions of a scene, kept on this device: how it was before you started writing in it this time,
// then every 10 minutes while it changes, and before anything replaces it (a split, a restore, another device).
import { putVersion, getVersions } from '../storage.js';
import { uid, wordsOf } from '../cards.js';
import * as decks from '../decks.js';

export const EVERY_MS = 10 * 60 * 1000;
const last = new Map(); // card id -> { at, back } of the newest snapshot this session

export function snapshot(card, why) {
  if (!card || (!card.back && !card.text)) return Promise.resolve();
  last.set(card.id, { at: Date.now(), back: card.back });
  return putVersion({ vid: uid('v'), card: card.id, deck: card.deck, at: Date.now(), back: card.back, text: card.text, words: wordsOf(card), why });
}
// Call before changing a scene's words, and after.
export function beforeEdit(card) { if (!last.has(card.id)) snapshot(card, 'Before this session'); }
export function afterEdit(card) {
  const s = last.get(card.id);
  if (!s) last.set(card.id, { at: Date.now(), back: card.back });
  else if (Date.now() - s.at >= EVERY_MS && s.back !== card.back) snapshot(card, 'Autosave');
}

export const listVersions = id => getVersions(id);

export async function restore(card, v) {
  await snapshot(card, 'Before restoring');
  card.back = v.back;
  if (typeof v.text === 'string') card.text = v.text;
  await decks.saveCard(card);
}
