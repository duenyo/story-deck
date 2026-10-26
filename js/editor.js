// Quick capture: a blank idea card with the keyboard up. It saves on every keystroke.
// The same sheet opens an existing card to fix its words (full writing on card backs is milestone 2).
import * as decks from './decks.js';
import { makeCard, refreshPicture, faceSpec, indexDeck, kindOf } from './cards.js';
import { face } from './art/face.js';
import { mirrorPending, clearPending } from './storage.js';
import * as nav from './nav.js';
import { toast } from './hud.js';

const $ = id => document.getElementById(id);
let card = null, isNew = false, level = null, saveTimer = 0, lastSaved = '';
const closers = new Set();
export const onEditorClose = fn => closers.add(fn);
export const editorOpen = () => !!level;

const stamp = t => {
  const d = new Date(t), h = d.getHours(), m = d.getMinutes();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' am' : ' pm');
};

function drawFace() {
  const ix = card.deck && decks.app.decks.has(card.deck) && !isNew ? decks.deckIndex(card.deck) : indexDeck([card]);
  face(faceSpec(card, ix)).toCanvas($('ed-face'));
}

function fillMeta() {
  const deck = decks.app.decks.get(card.deck || decks.captureDeckId());
  $('ed-kind').textContent = (card.sub ? kindOf(card).label + ' — ' + card.sub : kindOf(card).label);
  $('ed-stamp').textContent = stamp(card.born);
  $('ed-deck').textContent = deck ? (isNew ? 'into ' : 'in ') + deck.name : '';
  $('ed-bin').hidden = isNew;
}

export function openEditor({ id = null, text = '', adopt = false } = {}) {
  if (level) return;
  const ta = $('ed-text');
  if (id) {
    card = decks.app.cards.get(id); if (!card) return;
    isNew = false; ta.value = card.text;
  } else {
    card = makeCard({ deck: decks.captureDeckId() || null, kind: 'i', order: -Date.now() });
    isNew = true;
    if (!adopt) ta.value = text;
    card.text = ta.value; refreshPicture(card);
  }
  lastSaved = isNew ? '' : card.text;
  fillMeta(); drawFace();
  const sheet = $('editor');
  sheet.hidden = false; sheet.removeAttribute('data-boot');
  requestAnimationFrame(() => sheet.classList.add('on'));
  document.body.classList.add('writing');
  level = { lv: 'editor' };
  nav.push(level);
  focusText();
  if (isNew && card.text.trim()) persist();
}

function focusText() {
  const ta = $('ed-text');
  try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
  if (!ta.value) ta.setSelectionRange(0, 0); else if (!isNew) ta.setSelectionRange(ta.value.length, ta.value.length);
}

function persist() {
  if (!card) return;
  card.text = $('ed-text').value;
  if (isNew) { refreshPicture(card); drawFace(); }
  card.edited = Date.now();
  if (isNew && !card.text.trim()) return;
  mirrorPending(card);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 200);
}

async function flush() {
  clearTimeout(saveTimer);
  if (!card || card.text === lastSaved) return;
  const c = card;
  await decks.ready;
  if (!c.deck || !decks.app.decks.has(c.deck)) { c.deck = decks.captureDeckId(); fillMeta(); }
  if (isNew && !c.text.trim()) return;
  lastSaved = c.text;
  await decks.saveCard(c, { quiet: true, keepTime: true });
  clearPending(c);
}

function close() {
  if (!card) return;
  const c = card, wasNew = isNew, ta = $('ed-text');
  c.text = ta.value;
  ta.blur();
  const sheet = $('editor');
  sheet.classList.remove('on');
  document.body.classList.remove('writing');
  setTimeout(() => { if (!level) sheet.hidden = true; }, 200);
  card = null; level = null;
  if (wasNew && !c.text.trim()) {
    clearTimeout(saveTimer); clearPending();
    if (decks.app.cards.has(c.id)) decks.dropCard(c.id);
    closers.forEach(fn => fn(null));
    return;
  }
  c.pic.set = true;
  (async () => {
    await decks.ready;
    if (!c.deck || !decks.app.decks.has(c.deck)) c.deck = decks.captureDeckId();
    lastSaved = c.text;
    await decks.saveCard(c);
    clearPending(c);
    if (wasNew && c.deck !== decks.app.current) toast('Saved to ' + decks.app.decks.get(c.deck).name);
    closers.forEach(fn => fn(c, wasNew));
  })();
}

export function initEditor() {
  const ta = $('ed-text');
  ta.addEventListener('input', persist);
  $('ed-done').addEventListener('click', () => nav.back());
  $('ed-bin').addEventListener('click', () => {
    const id = card && card.id; if (!id) return;
    const lv = level; level = null; card = null;
    clearTimeout(saveTimer); $('ed-text').blur();
    // Close the sheet and set down the lifted card (and anything above it) in one step.
    const st = nav.levels(), at = st.indexOf(lv);
    let target = at - 1;
    for (let i = at - 1; i > 0; i--) if (st[i].lv === 'lifted' && st[i].id === id) { target = i - 1; break; }
    nav.backToIndex(Math.max(0, target));
    decks.binCard(id);
    $('editor').classList.remove('on'); document.body.classList.remove('writing');
    setTimeout(() => { $('editor').hidden = true; }, 200);
    closers.forEach(fn => fn(null, false, id));
    toast('Card binned', { action: 'Undo', onAction: () => decks.unbinCard(id) });
  });
  $('ed-paper').addEventListener('click', e => { if (e.target !== ta) focusText(); });
  nav.onNav((stack, info) => { if (info.dir < 0 && info.level === level) close(); });
  addEventListener('pagehide', () => { if (card) { persist(); flush(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && card) { persist(); flush(); } });
  // Opened before the modules loaded (the New idea shortcut or a share): pick up where it is.
  const sheet = $('editor');
  if (sheet.hasAttribute('data-boot')) openEditor({ adopt: true });
}
