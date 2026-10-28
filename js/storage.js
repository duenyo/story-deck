// Device first: every change goes straight into the phone's own database (IndexedDB) and works offline.
// A card being typed is also mirrored to localStorage on every keystroke, so nothing is lost if the app is killed.
const NAME = 'story-deck', VERSION = 2; // 2: earlier versions of what's written on cards
let dbp = null;
const errors = new Set();
export const onStorageError = fn => errors.add(fn);
const fail = err => { console.error(err); errors.forEach(fn => fn(err)); };

function open() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('decks')) d.createObjectStore('decks', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('cards')) d.createObjectStore('cards', { keyPath: 'id' }).createIndex('deck', 'deck');
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'vid' }).createIndex('card', 'card');
    };
    r.onblocked = () => console.warn('Story Deck is open in another tab with an older version; close it to finish updating');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function run(stores, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(stores, mode);
    let out;
    try { out = fn(t); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(typeof out === 'function' ? out() : out);
    t.onerror = t.onabort = () => rej(t.error);
  });
}

export async function loadAll() {
  return run(['decks', 'cards', 'meta'], 'readonly', t => {
    const got = {};
    ['decks', 'cards', 'meta'].forEach(s => { const r = t.objectStore(s).getAll(); r.onsuccess = () => { got[s] = r.result; }; });
    return () => ({ decks: got.decks || [], cards: got.cards || [], meta: Object.fromEntries((got.meta || []).map(m => [m.k, m.v])) });
  });
}

export const putCards = cards => run(['cards'], 'readwrite', t => { const s = t.objectStore('cards'); cards.forEach(c => s.put(c)); }).catch(fail);
export const delCards = ids => run(['cards'], 'readwrite', t => { const s = t.objectStore('cards'); ids.forEach(id => s.delete(id)); }).catch(fail);
export const putDeck = deck => run(['decks'], 'readwrite', t => { t.objectStore('decks').put(deck); }).catch(fail);
export const delDeck = id => run(['decks'], 'readwrite', t => { t.objectStore('decks').delete(id); }).catch(fail);
export const setMeta = (k, v) => run(['meta'], 'readwrite', t => { t.objectStore('meta').put({ k, v }); }).catch(fail);

/* ---------- earlier versions, kept on this device ---------- */
const KEEP_VERSIONS = 80;
export function putVersion(v) {
  return run(['versions'], 'readwrite', t => {
    const s = t.objectStore('versions');
    s.put(v);
    const r = s.index('card').getAll(v.card);
    r.onsuccess = () => {
      const all = r.result.sort((a, b) => b.at - a.at);
      all.slice(KEEP_VERSIONS).forEach(old => s.delete(old.vid));
    };
  }).catch(fail);
}
export function getVersions(cardId) {
  return run(['versions'], 'readonly', t => {
    let out = [];
    const r = t.objectStore('versions').index('card').getAll(cardId);
    r.onsuccess = () => { out = r.result.sort((a, b) => b.at - a.at); };
    return () => out;
  });
}

/* ---------- the card being typed, mirrored synchronously ---------- */
const PENDING = 'sd.pending';
export function mirrorPending(card) { try { localStorage.setItem(PENDING, JSON.stringify(card)); } catch (e) { /* storage full or blocked */ } }
export function clearPending(card) {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING) || 'null');
    if (p && (!card || (p.id === card.id && p.edited <= card.edited))) localStorage.removeItem(PENDING);
  } catch (e) { /* ignore */ }
}
export function readPending() { try { return JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch (e) { return null; } }

export function askToKeep() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* ignore */ } }
