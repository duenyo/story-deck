// Sync: your own decks and cards, mirrored to your Firebase database and back.
// Every change saves on the device first; this sends it on when it can and brings in other devices' changes.
// One card at a time: the newer edit wins, and if this device had unsent words in a card that another
// device replaced, they're kept as an earlier version of that card first. Nothing is thrown away.
import * as decks from '../decks.js';
import * as store from '../storage.js';
import { SAMPLE_ID } from '../sample.js';
import { upgradeCard, upgradeDeck } from '../upgrade.js';
import { snapshot } from '../write/versions.js';
import { mergeDays } from '../write/stats.js';

const FLAG = 'sd.sync';
let be = null, unsubs = [], synced = { c: {}, d: {} }, firstCards = false, firstDecks = false, ready = false;
const cardQ = new Set(), deckQ = new Set();
let flushTimer = 0, persistTimer = 0, pending = 0;
let state = { mode: 'off', pending: 0, online: navigator.onLine, email: '' };
const subs = new Set();
export const onSyncState = fn => { subs.add(fn); fn(state); };
const setState = p => { state = { ...state, ...p, pending, online: navigator.onLine }; subs.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); };
export const syncState = () => state;
export const wantsSync = () => { try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; } };
const setWants = on => { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch (e) { /* ignore */ } };

const isSample = deckId => deckId === SAMPLE_ID || !!(decks.app.decks.get(deckId) || {}).sample;
const plain = o => JSON.parse(JSON.stringify(o));
const cardDirty = c => (c.edited || 0) > (synced.c[c.id] || 0);
const deckDirty = d => (d.edited || 0) > (synced.d[d.id] || 0);
const sameWords = (a, b) => a.text === b.text && a.back === b.back;
// Cards written in on this device since a version last arrived from elsewhere, and the versions this device sent.
const localEdits = new Set(), mine = new Map();
const sentByMe = (id, edited) => (mine.get(id) || new Set()).has(edited);
function noteSent(id, edited) { const s = mine.get(id) || new Set(); s.add(edited); if (s.size > 30) s.delete(s.values().next().value); mine.set(id, s); }

function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { if (be) { decks.app.meta['synced:' + be.uid] = synced; store.setMeta('synced:' + be.uid, synced); } }, 800);
}

/* ---------- starting and stopping ---------- */
export function start(backend, email) {
  stop();
  be = backend; ready = false; firstCards = firstDecks = false;
  synced = plain(decks.app.meta['synced:' + be.uid] || { c: {}, d: {} });
  setWants(true);
  setState({ mode: 'connecting', email: email || '' });
  unsubs.push(be.listen('decks', onDecks, onError));
  unsubs.push(be.listen('cards', onCards, onError));
}
export function stop() {
  unsubs.forEach(u => { try { u(); } catch (e) { /* ignore */ } });
  unsubs = []; be = null; ready = false; cardQ.clear(); deckQ.clear();
}
export function signedOut() { stop(); setWants(false); setState({ mode: 'off', email: '' }); }
function onError(err) { console.error('Sync error', err); setState({ mode: 'error', error: (err && (err.code || err.message)) || 'unknown' }); }

/* ---------- changes from other devices ---------- */
function onDecks(changes) {
  for (const ch of changes) {
    if (ch.pending || ch.data.sample || ch.id === SAMPLE_ID) continue;
    const remote = upgradeDeck(ch.data), local = decks.app.decks.get(ch.id);
    if (ch.type === 'removed') continue; // decks are never deleted from another device
    if (!firstDecks && !local) { adoptOrAdd(remote); continue; }
    if (!local) { synced.d[ch.id] = remote.edited; decks.applyRemoteDeck(remote); continue; }
    const days = mergeDays(local.x.days, remote.x.days, remote.edited >= local.edited);
    if (remote.edited > local.edited) {
      const merged = { ...remote, x: { ...remote.x, days } };
      synced.d[ch.id] = remote.edited; decks.applyRemoteDeck(merged);
      if (JSON.stringify(days) !== JSON.stringify(remote.x.days || {})) { merged.edited = Date.now(); deckQ.add(ch.id); }
    } else if (remote.edited === local.edited) synced.d[ch.id] = remote.edited;
    else { local.x.days = days; synced.d[ch.id] = Math.min(synced.d[ch.id] || 0, remote.edited); deckQ.add(ch.id); }
  }
  if (!firstDecks) { firstDecks = true; maybeReady(); }
  persist(); scheduleFlush();
}

// The first time a device syncs: if its own decks are still empty, it takes the decks already saved
// instead of adding a second empty "My Deck".
const firstRemoteDecks = [];
function adoptOrAdd(remote) { firstRemoteDecks.push(remote); }
function settleFirstDecks() {
  if (!firstRemoteDecks.length) return;
  const remoteIds = new Set(firstRemoteDecks.map(d => d.id));
  const emptyLocal = decks.ownDecks().filter(d => !remoteIds.has(d.id) && !decks.deckCards(d.id).length && !(d.edited > d.born + 1000));
  firstRemoteDecks.forEach((d, i) => { synced.d[d.id] = d.edited; decks.applyRemoteDeck(d, { replaceIds: i === 0 ? emptyLocal.map(x => x.id) : [] }); });
  firstRemoteDecks.length = 0;
}

function onCards(changes) {
  for (const ch of changes) {
    if (ch.pending) continue;
    const local = decks.app.cards.get(ch.id);
    if (ch.type === 'removed') {
      if (local && !cardDirty(local)) decks.removeRemoteCard(ch.id);
      delete synced.c[ch.id];
      continue;
    }
    const remote = upgradeCard(ch.data);
    if (!remote || isSample(remote.deck)) continue;
    if (!local) { synced.c[ch.id] = remote.edited; decks.applyRemoteCard(remote); continue; }
    const theirs = !sentByMe(ch.id, remote.edited);
    if (remote.edited > local.edited) {
      // a newer edit from elsewhere wins; words written here first are kept as an earlier version
      if ((localEdits.has(ch.id) || cardDirty(local)) && theirs && !sameWords(local, remote)) snapshot(local, 'Your words on this device, before a newer edit from another device');
      synced.c[ch.id] = remote.edited; localEdits.delete(ch.id);
      decks.applyRemoteCard(remote);
    } else if (remote.edited === local.edited) synced.c[ch.id] = remote.edited;
    else {
      // this device's copy is newer: keep the other device's words as an earlier version, then send ours
      // (the database now holds the older copy, so ours counts as unsent again)
      if (theirs && !sameWords(local, remote)) snapshot(remote, 'From another device, older than the words here');
      synced.c[ch.id] = Math.min(synced.c[ch.id] || 0, remote.edited);
      cardQ.add(ch.id);
    }
  }
  if (!firstCards) { firstCards = true; maybeReady(); }
  persist(); scheduleFlush();
}

function maybeReady() {
  if (!firstCards || !firstDecks || ready) return;
  settleFirstDecks();
  ready = true;
  // anything changed here since the last sync goes up now
  decks.ownDecks().forEach(d => { if (deckDirty(d)) deckQ.add(d.id); });
  for (const c of decks.app.cards.values()) if (!isSample(c.deck) && cardDirty(c)) cardQ.add(c.id);
  setState({ mode: 'on' });
  scheduleFlush(0);
}

/* ---------- this device's changes ---------- */
decks.onChange(ev => {
  if (ev.type === 'remote') return;
  if (ev.type === 'card' && ev.id) { cardQ.add(ev.id); localEdits.add(ev.id); }
  else if (ev.type === 'deckmeta' || ev.type === 'rename') deckQ.add(ev.id);
  else if (ev.type === 'cards' || ev.type === 'deck') {
    for (const c of decks.app.cards.values()) if (!isSample(c.deck) && cardDirty(c)) cardQ.add(c.id);
    decks.ownDecks().forEach(d => { if (deckDirty(d)) deckQ.add(d.id); });
  }
  scheduleFlush();
});

// Sends a moment after typing pauses, and at least every 5 seconds while you keep going.
let firstQueued = 0;
function scheduleFlush(ms = 1200) {
  const now = Date.now();
  if (!firstQueued) firstQueued = now;
  const due = Math.min(now + ms, firstQueued + 5000);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { firstQueued = 0; flush(); }, Math.max(0, due - now));
}
function track(p, done) {
  pending++; setState({});
  p.then(done, err => { console.error('Sync write failed', err); if (err && /permission|unauth/i.test(err.code || '')) onError(err); })
    .finally(() => { pending--; setState({}); });
}
function flush() {
  if (!be || !ready) return;
  for (const id of deckQ) {
    const d = decks.app.decks.get(id);
    if (!d || d.sample) continue;
    const ed = d.edited || 0;
    track(be.put('decks', id, plain(d)), () => { synced.d[id] = Math.max(synced.d[id] || 0, ed); persist(); });
  }
  deckQ.clear();
  for (const id of cardQ) {
    const c = decks.app.cards.get(id);
    if (!c) { if (synced.c[id]) { track(be.del('cards', id), () => { delete synced.c[id]; persist(); }); } continue; }
    if (isSample(c.deck) || !cardDirty(c)) continue;
    const ed = c.edited;
    noteSent(id, ed);
    track(be.put('cards', id, plain(c)), () => { synced.c[id] = Math.max(synced.c[id] || 0, ed); persist(); });
  }
  cardQ.clear();
}
export const flushNow = () => { clearTimeout(flushTimer); flush(); };

addEventListener('online', () => setState({}));
addEventListener('offline', () => setState({}));
document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
