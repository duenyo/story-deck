// Decks and cards in memory, saved through storage.js on every change.
// Your own decks and the sample deck are kept apart: new ideas never land in the sample.
import * as store from './storage.js';
import { upgradeCard, upgradeDeck } from './upgrade.js';
import { uid, indexDeck } from './cards.js';
import { SAMPLE_ID, buildSample, looksLikeSample } from './sample.js';

export const app = { decks: new Map(), cards: new Map(), meta: {}, current: null, lastOwn: null };
export const FIRST_DECK = 'my-deck';
const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = ev => listeners.forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } });

let readyResolve;
export const ready = new Promise(r => { readyResolve = r; });

// Mirrors of where new ideas go, readable before the database opens.
const LAST_OWN = 'sd.lastOwn';
export const lastOwnHint = () => { try { return localStorage.getItem(LAST_OWN); } catch (e) { return null; } };

function remember(k, v) { app.meta[k] = v; store.setMeta(k, v); }

export async function load() {
  const { decks, cards, meta } = await store.loadAll();
  app.meta = meta;
  decks.map(upgradeDeck).filter(Boolean).forEach(d => app.decks.set(d.id, d));
  cards.map(upgradeCard).filter(Boolean).forEach(c => app.cards.set(c.id, c));

  // A card that was being typed when the app closed, if the database missed its last keystrokes.
  const p = upgradeCard(store.readPending());
  if (p && p.deck && (!app.cards.has(p.id) || app.cards.get(p.id).edited < p.edited)) { app.cards.set(p.id, p); store.putCards([p]); }
  store.clearPending();

  const own = ownDecks();
  if (!own.length) {
    // Every device's first deck shares one id, so two new devices meet in the same deck when they sync.
    const hinted = lastOwnHint();
    const d = { v: 1, id: hinted || FIRST_DECK, name: 'My Deck', sample: false, born: Date.now(), edited: 0, x: {} };
    app.decks.set(d.id, d); store.putDeck(d);
  }
  app.lastOwn = app.decks.has(meta.lastOwn) && !app.decks.get(meta.lastOwn).sample ? meta.lastOwn : ownDecks()[0].id;
  setLastOwnHint(app.lastOwn);
  app.current = app.decks.has(meta.current) ? meta.current : (app.decks.has(SAMPLE_ID) && !ownCards(app.lastOwn).length ? SAMPLE_ID : app.lastOwn);
  if (meta.current !== app.current) remember('current', app.current); // the bench shows the deck you last used
  store.askToKeep();
  readyResolve();
  emit({ type: 'load' });
}

function setLastOwnHint(id) { try { localStorage.setItem(LAST_OWN, id); } catch (e) { /* ignore */ } }

export const ownDecks = () => [...app.decks.values()].filter(d => !d.sample).sort((a, b) => a.born - b.born);
export const sampleDeck = () => app.decks.get(SAMPLE_ID) || null;
export const currentDeck = () => app.decks.get(app.current);
const ownCards = id => [...app.cards.values()].filter(c => c.deck === id && !c.binned);

// Live cards of a deck in their saved order.
export function deckCards(id = app.current) {
  return [...app.cards.values()].filter(c => c.deck === id && !c.binned).sort((a, b) => a.order - b.order);
}
let ixCache = { key: '', ix: null };
let version = 0;
export function deckIndex(id = app.current) {
  const key = id + ':' + version;
  if (ixCache.key !== key) ixCache = { key, ix: indexDeck(deckCards(id)) };
  return ixCache.ix;
}

// The deck the typewriter writes in: the one you're in, or your last own deck if that's the sample.
export const writingDeckId = () => captureDeckId();
// Where a new idea goes: the deck you're in, unless it's the sample, then your last own deck.
export function captureDeckId() {
  const cur = app.decks.get(app.current);
  if (cur && !cur.sample) return cur.id;
  return app.lastOwn || lastOwnHint() || ownDecks()[0]?.id;
}

export function saveCard(card, { quiet = false, keepTime = false } = {}) {
  if (!keepTime) card.edited = Date.now();
  app.cards.set(card.id, card);
  version++;
  const done = store.putCards([card]);
  if (!quiet) emit({ type: 'card', id: card.id, deck: card.deck });
  return done;
}
// For a new card emptied before it was finished: it never existed.
export function dropCard(id) {
  if (!app.cards.delete(id)) return;
  version++;
  store.delCards([id]);
  emit({ type: 'card', id });
}
export const getVersion = () => version;
export function saveCards(cards) {
  const now = Date.now();
  cards.forEach(c => { c.edited = now; app.cards.set(c.id, c); });
  version++;
  store.putCards(cards);
  emit({ type: 'cards', deck: cards[0] && cards[0].deck });
}
// Binned cards stay in the database (and in backups) so nothing is ever truly lost.
export function binCard(id) {
  const c = app.cards.get(id); if (!c) return;
  c.binned = Date.now(); saveCard(c);
}
export function unbinCard(id) {
  const c = app.cards.get(id); if (!c) return;
  c.binned = 0; saveCard(c);
}

export function switchDeck(id) {
  if (!app.decks.has(id) || id === app.current) return;
  app.current = id; remember('current', id);
  if (!app.decks.get(id).sample) { app.lastOwn = id; remember('lastOwn', id); setLastOwnHint(id); }
  version++;
  emit({ type: 'deck', id });
}

export function newDeck(name, { open = true } = {}) {
  const now = Date.now();
  const d = { v: 1, id: uid('d'), name: (name || '').trim() || 'New Deck', sample: false, born: now, edited: now, x: {} };
  app.decks.set(d.id, d); store.putDeck(d);
  if (open) switchDeck(d.id); else emit({ type: 'deckmeta', id: d.id });
  return d;
}
export function renameDeck(id, name) {
  const d = app.decks.get(id); if (!d || !name.trim()) return;
  d.name = name.trim(); d.edited = Date.now(); store.putDeck(d); emit({ type: 'rename', id });
}
// Deck details that change often (word counts by day): saved without disturbing the table.
export function saveDeckMeta(d) {
  d.edited = Date.now(); store.putDeck(d); emit({ type: 'deckmeta', id: d.id });
}

/* ---------- changes arriving from another device (sync.js) ---------- */
export function applyRemoteCard(card) {
  app.cards.set(card.id, card);
  version++;
  store.putCards([card]);
  emit({ type: 'remote', id: card.id, deck: card.deck });
}
export function applyRemoteDeck(deck, { replaceIds = [] } = {}) {
  app.decks.set(deck.id, deck); store.putDeck(deck);
  replaceIds.forEach(id => { if (id !== deck.id) { app.decks.delete(id); store.delDeck(id); } });
  if (!app.decks.has(app.current)) { app.current = deck.id; remember('current', deck.id); }
  if (!app.decks.has(app.lastOwn)) { app.lastOwn = deck.id; remember('lastOwn', deck.id); setLastOwnHint(deck.id); }
  version++;
  emit({ type: 'deck', id: app.current, remote: true });
}
export function removeRemoteCard(id) {
  if (!app.cards.delete(id)) return;
  version++; store.delCards([id]);
  emit({ type: 'remote', id });
}

async function installSample(data) {
  const { deck, cards } = buildSample(data);
  const old = [...app.cards.values()].filter(c => c.deck === SAMPLE_ID).map(c => c.id);
  old.forEach(id => app.cards.delete(id));
  if (old.length) await store.delCards(old);
  app.decks.set(deck.id, deck); cards.forEach(c => app.cards.set(c.id, c));
  await store.putDeck(deck); await store.putCards(cards);
  version++;
}

// Loads the sample from a link or file, keeps its data on the device for "Bring back", and opens it.
export async function loadSample(data) {
  if (!looksLikeSample(data)) throw new Error('Not a sample deck');
  await installSample(data);
  remember('sampleData', data);
  app.current = null;
  switchDeck(SAMPLE_ID);
}
export const hasSampleData = () => looksLikeSample(app.meta.sampleData);

// One tap clears the sample; it can come back from the deck list any time.
let lastCleared = null;
export function clearSample() {
  const deck = sampleDeck(); if (!deck) return;
  const cards = [...app.cards.values()].filter(c => c.deck === SAMPLE_ID);
  lastCleared = { deck, cards };
  cards.forEach(c => app.cards.delete(c.id)); app.decks.delete(SAMPLE_ID);
  store.delCards(cards.map(c => c.id)); store.delDeck(SAMPLE_ID);
  version++;
  if (app.current === SAMPLE_ID) { app.current = app.lastOwn; remember('current', app.lastOwn); }
  emit({ type: 'deck', id: app.current, cleared: true });
}
export function undoClearSample() {
  if (!lastCleared) return;
  const { deck, cards } = lastCleared; lastCleared = null;
  app.decks.set(deck.id, deck); cards.forEach(c => app.cards.set(c.id, c));
  store.putDeck(deck); store.putCards(cards);
  version++;
  emit({ type: 'deck', id: app.current });
}
export async function restoreSample() {
  if (sampleDeck() || !hasSampleData()) return;
  await installSample(app.meta.sampleData);
  switchDeck(SAMPLE_ID);
}

export const bump = () => { version++; };
