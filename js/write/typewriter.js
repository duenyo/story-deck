// The typewriter: your story as one continuous page. Each scene is a Beat card with its prose on the back;
// a scene break starts the next card, so the Thread fills in as you write. Saves as you type.
import * as decks from '../decks.js';
import * as nav from '../nav.js';
import { scenesOf, looseOf, chapterNumbers, newScene, place, unplace } from './manuscript.js';
import { readDom, renderDom, caretOffset, setCaret, caretToStart, caretToEnd } from './prose.js';
import { titleOf, countWords, wordsOf, KINDS, kindOf } from '../cards.js';
import * as stats from './stats.js';
import * as versions from './versions.js';
import { initDesk, update as updateDesk, startDesk, stopDesk, resetHourglass } from './desk.js';
import { sigil, W as SW, H as SH } from '../art/sigils.js';
import { Img } from '../art/pixels.js';
import { toast } from '../hud.js';
import { mirrorPending } from '../storage.js';
import { manuscript, manuscriptDocx, backup, download } from '../export.js';
import { makeSheet } from '../sheets.js';

const $ = id => document.getElementById(id);
const PREFS = 'sd.write';
const prefs = { font: 'lora', size: 19, scroll: true, paper: 'light', daily: 1667, month: 50000, last: {} };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS) || '{}')); } catch (e) { /* defaults */ }
const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

let root, page, scroller, level = null, deckId = null, hooks = {};
const virtual = new Map();   // new scenes not saved yet (they save once they have words)
const dirty = new Set();     // scenes typed in since their last save
const words = new Map();     // scene id → word count
let active = null, lastStory = null, saveTimer = 0, typingTimer = 0, renderTimer = 0, total = 0, selfSave = false;
let tocSheet, versionsSheet, statsSheet;

export const writerOpen = () => !!level;
export const setWriterHooks = h => { hooks = h; };
const cardOf = id => decks.app.cards.get(id) || virtual.get(id);
const sceneOf = id => page.querySelector(`.scene[data-id="${CSS.escape(id)}"]`);
const textEl = id => { const s = sceneOf(id); return s && s.querySelector('.scene-text'); };
const deck = () => decks.app.decks.get(deckId);
const narrow = () => innerWidth < 760;
const save = c => { selfSave = true; try { decks.saveCard(c); } finally { selfSave = false; } };

/* ---------- the page ---------- */
function storyList() {
  const list = [...scenesOf(deckId)];
  for (const v of virtual.values()) if (v.kind === 'b' && v.deck === deckId) list.push(v);
  return list.sort((a, b) => a.order - b.order);
}
function looseList() {
  const list = [...looseOf(deckId)];
  for (const v of virtual.values()) if (v.kind === 'i' && v.deck === deckId) list.push(v);
  return list.sort((a, b) => a.order - b.order);
}
const countEl = el => countWords(el.innerText);

function sceneEl(card, { chapter = 0, loose = false } = {}) {
  const s = document.createElement('section');
  s.className = 'scene' + (loose ? ' loose' : '');
  s.dataset.id = card.id;
  if (chapter) {
    const h = document.createElement('header'); h.className = 'ch-head';
    const n = document.createElement('div'); n.className = 'ch-num'; n.textContent = 'Chapter ' + chapter;
    const t = document.createElement('input'); t.className = 'ch-title'; t.placeholder = 'Chapter title (optional)';
    t.value = card.x.chTitle || ''; t.maxLength = 80; t.setAttribute('aria-label', 'Chapter ' + chapter + ' title');
    h.append(n, t); s.append(h);
  }
  if (loose) {
    const bar = document.createElement('div'); bar.className = 'loose-bar';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-small place'; b.textContent = 'Place in the story';
    bar.append(b); s.append(bar);
  }
  const t = document.createElement('div');
  t.className = 'scene-text'; t.contentEditable = 'true'; t.spellcheck = true;
  t.setAttribute('role', 'textbox'); t.setAttribute('aria-multiline', 'true'); t.setAttribute('aria-label', loose ? 'Loose scene' : 'Scene');
  renderDom(t, card.back);
  s.append(t);
  words.set(card.id, wordsOf(card));
  return s;
}

function render() {
  clearTimeout(renderTimer);
  const focusId = active && textEl(active) && textEl(active).contains(document.activeElement) ? active : null;
  const off = focusId ? caretOffset(textEl(focusId)) : -1, st = scroller.scrollTop;
  page.textContent = ''; words.clear();
  const story = storyList();
  if (!story.length && !looseList().length) { const v = newScene(deckId, null, { list: [] }); virtual.set(v.id, v); story.push(v); }
  const chapters = chapterNumbers(story);
  const h = document.createElement('h1'); h.className = 'ms-title'; h.textContent = deck().name; page.append(h);
  story.forEach((c, i) => {
    if (i > 0 && !c.x.ch) { const br = document.createElement('div'); br.className = 'scene-break'; br.setAttribute('aria-hidden', 'true'); page.append(br); }
    page.append(sceneEl(c, { chapter: chapters.get(c.id) || 0 }));
  });
  const loose = looseList();
  if (loose.length) {
    const lh = document.createElement('div'); lh.className = 'loose-head'; lh.textContent = 'Loose scenes · not in the story yet';
    page.append(lh);
    loose.forEach(c => page.append(sceneEl(c, { loose: true })));
  }
  total = [...words.values()].reduce((a, b) => a + b, 0);
  markBlank();
  renderToc(); updateCounts();
  scroller.scrollTop = st;
  if (focusId && textEl(focusId)) { textEl(focusId).focus({ preventScroll: true }); if (off >= 0) setCaret(textEl(focusId), off); }
}
const scheduleRender = () => { clearTimeout(renderTimer); renderTimer = setTimeout(() => { if (level) { flushAll(); render(); } }, 400); };

// The only scene, still blank, shows a faint hint.
function markBlank() {
  const all = [...page.querySelectorAll('.scene-text')];
  all.forEach(t => t.classList.toggle('blank', all.length === 1 && !t.textContent.trim()));
}

/* ---------- saving ---------- */
function flush(id) {
  const el = textEl(id), card = cardOf(id);
  dirty.delete(id);
  if (!el || !card) return;
  const back = readDom(el);
  if (back === card.back) return;
  if (!virtual.has(id)) versions.beforeEdit(card);
  card.back = back;
  if (virtual.has(id)) { if (!back.trim()) return; virtual.delete(id); }
  save(card);
  versions.afterEdit(card);
  rememberPlace();
  const row = $('tw-toc-list').querySelector(`.toc-row[data-id="${CSS.escape(id)}"] .toc-title`);
  if (row) row.textContent = titleOf(card) || 'New scene';
}
function flushAll() { clearTimeout(saveTimer); saveTimer = 0; [...dirty].forEach(flush); }
const schedule = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flushAll, 350); };
function rememberPlace() {
  const el = active && textEl(active);
  if (!el) return;
  prefs.last[deckId] = { id: active, off: el.contains(document.activeElement) ? caretOffset(el) : -1 };
  savePrefs();
}
// If the app is closed mid-sentence, the scene being typed is also kept in a quick store until it's saved.
function emergencySave() {
  if (!level) return;
  const id = active, el = id && textEl(id), card = id && cardOf(id);
  if (el && card && dirty.has(id)) { const c = { ...card, back: readDom(el), edited: Date.now() }; if (c.back.trim()) mirrorPending(c); }
  flushAll(); stats.flushStats(deckId); rememberPlace();
}

/* ---------- typing ---------- */
function onInput(e) {
  const t = e.target.closest && e.target.closest('.scene-text');
  if (t) {
    const id = t.parentElement.dataset.id;
    active = id; dirty.add(id); schedule();
    const n = countEl(t), before = total;
    total += n - (words.get(id) || 0); words.set(id, n);
    if (total !== before) stats.recordTotal(deckId, before, total);
    if (t.classList.contains('blank') && t.textContent.trim()) t.classList.remove('blank');
    updateCounts(); typing(); requestAnimationFrame(keepCaret);
    return;
  }
  const ch = e.target.closest && e.target.closest('.ch-title');
  if (ch) {
    const c = cardOf(ch.closest('.scene').dataset.id);
    if (c) { c.x.chTitle = ch.value.trim(); if (!c.x.chTitle) delete c.x.chTitle; if (!virtual.has(c.id)) { clearTimeout(ch._t); ch._t = setTimeout(() => save(c), 500); } }
  }
}

function typing() {
  root.classList.add('typing');
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => root.classList.remove('typing'), 2500);
}

// The line you're typing stays at the same height on the screen.
function keepCaret() {
  if (!prefs.scroll || !level) return;
  const sel = getSelection(); if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0).cloneRange(); r.collapse(true);
  let rect = r.getClientRects()[0];
  if (!rect) { const n = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement); if (!n) return; rect = n.getBoundingClientRect(); }
  const box = scroller.getBoundingClientRect(), target = box.top + scroller.clientHeight * (narrow() ? 0.36 : 0.45);
  const d = rect.top - target;
  if (Math.abs(d) > 3) scroller.scrollTop += d;
}

const currentPara = t => { const s = getSelection(); if (!s.rangeCount) return null; let n = s.anchorNode; while (n && n.parentNode !== t) n = n.parentNode; return n && n.nodeType === 1 ? n : null; };
const collapsedAt = (t, where) => { const s = getSelection(); if (!s.rangeCount || !s.isCollapsed || !t.contains(s.anchorNode)) return false; const off = caretOffset(t); return where === 'start' ? off === 0 : off >= t.innerText.replace(/\n$/, '').length; };
function onLine(t, which) {
  const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return false;
  const r = s.getRangeAt(0).cloneRange(); r.collapse(true);
  const rect = r.getClientRects()[0] || (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).getBoundingClientRect();
  const box = t.getBoundingClientRect(), lh = parseFloat(getComputedStyle(t).lineHeight) || 28;
  return which === 'first' ? rect.top - box.top < lh * 0.9 : box.bottom - rect.bottom < lh * 0.9;
}
const neighbours = id => { const all = [...page.querySelectorAll('.scene')].map(s => s.dataset.id); const i = all.indexOf(id); return [all[i - 1], all[i + 1]]; };
function moveTo(id, where) {
  const t = id && textEl(id); if (!t) return false;
  t.focus({ preventScroll: true });
  if (where === 'end') caretToEnd(t); else caretToStart(t);
  active = id; requestAnimationFrame(keepCaret);
  return true;
}

function onKey(e) {
  const t = e.target.closest && e.target.closest('.scene-text');
  if (!t) return;
  const id = t.parentElement.dataset.id, [prev, next] = neighbours(id);
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sceneBreak(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'i')) { e.preventDefault(); document.execCommand(e.key === 'b' ? 'bold' : 'italic'); return; }
  if (e.key === 'Enter' && !e.shiftKey) {
    const p = currentPara(t);
    if (p && /^\s*(\*\s*\*\s*\*|#)\s*$/.test(p.textContent)) {
      e.preventDefault();
      const after = p.nextSibling, before = p.previousSibling;
      p.remove();
      if (!t.firstChild) { const np = document.createElement('p'); np.append(document.createElement('br')); t.append(np); }
      if (after && after.parentNode === t) placeAtStart(after); else if (before && before.parentNode === t) caretToEnd(t); else caretToStart(t);
      sceneBreak();
      return;
    }
  }
  if (e.key === 'Backspace' && prev && collapsedAt(t, 'start')) { e.preventDefault(); moveTo(prev, 'end'); return; }
  if (e.key === 'ArrowUp' && prev && onLine(t, 'first')) { e.preventDefault(); moveTo(prev, 'end'); return; }
  if (e.key === 'ArrowDown' && next && onLine(t, 'last')) { e.preventDefault(); moveTo(next, 'start'); return; }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) typing();
}
function placeAtStart(node) { const r = document.createRange(); r.setStart(node, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

// Pasted text comes in as plain words, so nothing strange gets into the manuscript.
function onPaste(e) {
  if (!e.target.closest || !e.target.closest('.scene-text')) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\r\n?/g, '\n');
  document.execCommand('insertText', false, text);
}

/* ---------- scenes ---------- */
// Everything after the caret moves into a new scene right after this one.
function sceneBreak() {
  const id = active, t = id && textEl(id), card = id && cardOf(id);
  if (!t || !card) return;
  const sel = getSelection();
  if (!sel.rangeCount || !t.contains(sel.anchorNode)) caretToEnd(t);
  const r = getSelection().getRangeAt(0); r.collapse(false);
  const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(t, t.childNodes.length);
  const tmp = document.createElement('div'); tmp.append(tail.extractContents());
  const backB = readDom(tmp).replace(/^\n+/, ''), backA = readDom(t).replace(/\n+$/, '');
  if (virtual.has(id) && !backA.trim() && !backB.trim()) { renderDom(t, ''); return; }
  dirty.delete(id);
  if (!virtual.has(id) && card.back) versions.snapshot(card, 'Before a scene break');
  card.back = backA;
  if (virtual.has(id)) { virtual.delete(id); }
  save(card);
  const list = card.kind === 'b' ? storyList() : looseList();
  const b = newScene(deckId, card, { kind: card.kind, list });
  b.back = backB;
  if (backB.trim()) save(b); else virtual.set(b.id, b);
  active = b.id;
  render();
  moveTo(b.id, 'start');
}

function newSceneAt(kind) {
  flushAll();
  const list = kind === 'b' ? storyList() : looseList();
  const v = newScene(deckId, list[list.length - 1] || null, { kind, list });
  virtual.set(v.id, v);
  active = v.id;
  render();
  const s = sceneOf(v.id); if (s) scroller.scrollTop = s.offsetTop - 120;
  moveTo(v.id, 'start');
}

function toggleChapter() {
  flushAll();
  const c = active && cardOf(active);
  if (!c || c.kind !== 'b') { toast('Put the caret in a scene of the story first'); return; }
  if (c.x.ch) { delete c.x.ch; delete c.x.chTitle; } else c.x.ch = 1;
  if (!virtual.has(c.id)) save(c);
  render();
  moveTo(c.id, 'start');
}

function placeLoose(id) {
  flushAll();
  const c = cardOf(id); if (!c) return;
  const after = lastStory && decks.app.cards.get(lastStory) && decks.app.cards.get(lastStory).kind === 'b' ? decks.app.cards.get(lastStory) : null;
  if (virtual.has(id)) { if (!c.back.trim()) { toast('Write something in it first'); return; } virtual.delete(id); }
  selfSave = true; try { place(c, after); } finally { selfSave = false; }
  render();
  const s = sceneOf(id); if (s) scroller.scrollTop = s.offsetTop - 120;
  toast('Placed in the story' + (after ? ' after “' + (titleOf(after) || 'the scene you were in') + '”' : ' at the end'));
}

/* ---------- the list of scenes ---------- */
function thumb(card) {
  const k = kindOf(card), g = sigil(k.name, card.pic.seed, card.x.ink || k.ink), im = new Img(SW, SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) im.set(x, y, g[y * SW + x]);
  const c = im.toCanvas(); c.className = 'toc-pic px'; c.setAttribute('aria-hidden', 'true');
  return c;
}
function renderToc() {
  const list = $('tw-toc-list'); list.textContent = '';
  const story = storyList(), chapters = chapterNumbers(story), loose = looseList();
  const row = c => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'toc-row'; b.dataset.id = c.id;
    if (c.id === active) b.setAttribute('aria-current', 'true');
    const t = document.createElement('span'); t.className = 'toc-title'; t.textContent = titleOf(c) || 'New scene';
    const w = document.createElement('span'); w.className = 'toc-words'; w.textContent = (words.get(c.id) ?? wordsOf(c)).toLocaleString('en-US');
    b.append(thumb(c), t, w);
    return b;
  };
  story.forEach(c => {
    if (chapters.has(c.id)) { const h = document.createElement('div'); h.className = 'toc-ch'; h.textContent = 'Chapter ' + chapters.get(c.id) + (c.x.chTitle ? ' · ' + c.x.chTitle : ''); list.append(h); }
    list.append(row(c));
  });
  if (loose.length) { const h = document.createElement('div'); h.className = 'toc-ch'; h.textContent = 'Loose scenes'; list.append(h); loose.forEach(c => list.append(row(c))); }
}
function goToScene(id) {
  flushAll();
  const s = sceneOf(id); if (!s) return;
  if (tocSheet.isOpen()) tocSheet.close();
  scroller.scrollTop = s.offsetTop - 100;
  moveTo(id, 'start');
}

/* ---------- counts ---------- */
function updateCounts() {
  $('tw-scene-words').textContent = (active && words.has(active) ? words.get(active) : 0).toLocaleString('en-US');
  $('tw-total-words').textContent = total.toLocaleString('en-US');
  const row = active && $('tw-toc-list').querySelector(`.toc-row[data-id="${CSS.escape(active)}"] .toc-words`);
  if (row) row.textContent = (words.get(active) || 0).toLocaleString('en-US');
  updateDesk();
}

/* ---------- earlier versions ---------- */
async function openVersions() {
  flushAll();
  const c = active && cardOf(active);
  if (!c || virtual.has(c.id)) { toast('Put the caret in a scene with words in it'); return; }
  const list = $('tw-versions-list'), pv = $('tw-version-preview');
  list.textContent = ''; pv.hidden = true;
  $('tw-versions-scene').textContent = titleOf(c) || 'This scene';
  const all = await versions.listVersions(c.id);
  if (!all.length) { const p = document.createElement('p'); p.className = 'sheet-note'; p.textContent = 'No earlier versions yet. One is kept when you start writing in a scene, then every 10 minutes while it changes.'; list.append(p); }
  all.forEach(v => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'version-row';
    const when = new Date(v.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    b.innerHTML = '<span class="v-when"></span><span class="v-why"></span><span class="v-words"></span>';
    b.querySelector('.v-when').textContent = when; b.querySelector('.v-why').textContent = v.why; b.querySelector('.v-words').textContent = v.words.toLocaleString('en-US') + ' words';
    b.addEventListener('click', () => {
      pv.hidden = false;
      renderDom($('tw-version-text'), v.back);
      $('tw-version-restore').onclick = async () => {
        await versions.restore(c, v);
        versionsSheet.close(); render(); toast('Restored the version from ' + when);
      };
      pv.scrollIntoView({ block: 'nearest' });
    });
    list.append(b);
  });
  versionsSheet.open();
}

/* ---------- look ---------- */
const FONTS = { lora: '"Lora", Georgia, serif', courier: '"Courier Prime", "Courier New", monospace', atkinson: '"Atkinson Hyperlegible", system-ui, sans-serif' };
function applyLook() {
  root.style.setProperty('--tw-font', FONTS[prefs.font] || FONTS.lora);
  root.style.setProperty('--tw-size', prefs.size + 'px');
  root.dataset.paper = prefs.paper;
  document.querySelectorAll('#tw-font button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === prefs.font)));
  document.querySelectorAll('#tw-paper button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === prefs.paper)));
  $('tw-scroll-on').checked = !!prefs.scroll;
}

/* ---------- decks ---------- */
function renderDeckMenu() {
  const m = $('tw-deck-list'); m.textContent = '';
  decks.ownDecks().forEach(d => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'menu-item'; b.textContent = d.name;
    b.setAttribute('aria-current', String(d.id === deckId));
    b.addEventListener('click', () => { closeMenus(); switchTo(d.id); });
    m.append(b);
  });
}
function switchTo(id) {
  if (id === deckId) return;
  flushAll(); stats.flushStats(deckId); rememberPlace();
  decks.switchDeck(id);
  deckId = id; active = null; virtual.clear();
  $('tw-deck-name').textContent = deck().name;
  render(); restorePlace();
}
function restorePlace() {
  const l = prefs.last[deckId];
  const id = l && sceneOf(l.id) ? l.id : [...page.querySelectorAll('.scene')].map(s => s.dataset.id).pop();
  if (!id) return;
  const t = textEl(id);
  const s = sceneOf(id);
  scroller.scrollTop = Math.max(0, s.offsetTop - 120);
  t.focus({ preventScroll: true });
  if (l && l.id === id && l.off >= 0) setCaret(t, l.off); else caretToEnd(t);
  active = id;
  requestAnimationFrame(keepCaret);
  updateCounts();
}

/* ---------- menus ---------- */
function closeMenus() { document.querySelectorAll('.tw-pop').forEach(p => { p.hidden = true; }); }
function togglePop(id) { const p = $(id), open = p.hidden; closeMenus(); p.hidden = !open; }

/* ---------- open and close ---------- */
export function openWriter() {
  if (level) return;
  deckId = decks.writingDeckId();
  if (decks.app.current !== deckId) decks.switchDeck(deckId);
  root.hidden = false;
  document.body.classList.add('in-writer');
  $('tw-deck-name').textContent = deck().name;
  applyLook(); render();
  level = { lv: 'write' }; nav.push(level);
  try { localStorage.setItem('sd.screen', 'write'); } catch (e) { /* ignore */ }
  restorePlace(); startDesk(); resetHourglass();
  if (hooks.onOpen) hooks.onOpen();
}
function closeWriter() {
  flushAll(); stats.flushStats(deckId); rememberPlace();
  root.hidden = true; level = null; virtual.clear();
  document.body.classList.remove('in-writer');
  closeMenus(); stopDesk();
  try { localStorage.setItem('sd.screen', 'table'); } catch (e) { /* ignore */ }
  if (hooks.onClose) hooks.onClose();
}

export function initWriter() {
  root = $('typewriter'); page = $('tw-page'); scroller = $('tw-scroll');
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignore */ }
  page.addEventListener('input', onInput);
  page.addEventListener('keydown', onKey);
  page.addEventListener('paste', onPaste);
  page.addEventListener('focusin', e => {
    const s = e.target.closest('.scene'); if (!s) return;
    active = s.dataset.id;
    if (!s.classList.contains('loose')) lastStory = active;
    $('tw-toc-list').querySelectorAll('.toc-row').forEach(r => r.setAttribute('aria-current', String(r.dataset.id === active)));
    updateCounts();
  });
  page.addEventListener('focusout', e => { const s = e.target.closest && e.target.closest('.scene'); if (s && dirty.has(s.dataset.id)) flush(s.dataset.id); });
  page.addEventListener('click', e => { const b = e.target.closest('.place'); if (b) placeLoose(b.closest('.scene').dataset.id); });
  page.addEventListener('keyup', () => { if (prefs.scroll) requestAnimationFrame(keepCaret); });
  scroller.addEventListener('pointerdown', e => { if (e.target === scroller || e.target === page) { const all = page.querySelectorAll('.scene-text'); const last = all[all.length - 1]; if (last && e.clientY > last.getBoundingClientRect().bottom) { e.preventDefault(); last.focus(); caretToEnd(last); } } });
  root.addEventListener('pointermove', e => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) root.classList.remove('typing'); });

  const keep = b => b.addEventListener('pointerdown', e => e.preventDefault()); // buttons that act on the text keep the caret
  [$('tw-bold'), $('tw-italic'), $('tw-break'), $('tw-chapter')].forEach(keep);
  $('tw-bold').addEventListener('click', () => document.execCommand('bold'));
  $('tw-italic').addEventListener('click', () => document.execCommand('italic'));
  $('tw-break').addEventListener('click', () => { if (!active) newSceneAt('b'); else sceneBreak(); });
  $('tw-chapter').addEventListener('click', toggleChapter);
  $('tw-versions').addEventListener('click', openVersions);
  $('tw-back').addEventListener('click', () => nav.back());
  $('tw-new-scene').addEventListener('click', () => newSceneAt('b'));
  $('tw-new-loose').addEventListener('click', () => newSceneAt('i'));
  $('tw-toc-list').addEventListener('click', e => { const r = e.target.closest('.toc-row'); if (r) goToScene(r.dataset.id); });
  $('tw-toc-btn').addEventListener('click', () => tocSheet.open());
  $('tw-toc-btn2').addEventListener('click', () => { flushAll(); tocSheet.open(); });
  $('tw-versions-2').addEventListener('click', () => { closeMenus(); openVersions(); });
  $('tw-chip').addEventListener('click', () => statsSheet.open());
  $('tw-deck').addEventListener('click', () => { renderDeckMenu(); togglePop('tw-deck-pop'); });
  $('tw-deck-new').addEventListener('click', () => {
    closeMenus();
    const name = prompt('Name the new deck', 'My Novel'); if (!name || !name.trim()) return;
    const d = decks.newDeck(name, { open: false });
    switchTo(d.id);
  });
  $('tw-deck-rename').addEventListener('click', () => {
    closeMenus();
    const name = prompt('Rename this deck', deck().name); if (!name || !name.trim()) return;
    decks.renameDeck(deckId, name); $('tw-deck-name').textContent = deck().name; render();
  });
  $('tw-more').addEventListener('click', () => togglePop('tw-more-pop'));
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.tw-pop, #tw-deck, #tw-more, #tw-sync, #tw-sprint')) closeMenus(); });
  document.querySelectorAll('#tw-font button').forEach(b => b.addEventListener('click', () => { prefs.font = b.dataset.v; savePrefs(); applyLook(); }));
  document.querySelectorAll('#tw-paper button').forEach(b => b.addEventListener('click', () => { prefs.paper = b.dataset.v; savePrefs(); applyLook(); }));
  $('tw-size-down').addEventListener('click', () => { prefs.size = Math.max(14, prefs.size - 1); savePrefs(); applyLook(); });
  $('tw-size-up').addEventListener('click', () => { prefs.size = Math.min(28, prefs.size + 1); savePrefs(); applyLook(); });
  $('tw-scroll-on').addEventListener('change', e => { prefs.scroll = e.target.checked; savePrefs(); });
  $('tw-dl-docx').addEventListener('click', async () => { flushAll(); download(await manuscriptDocx(deckId)); });
  $('tw-dl-md').addEventListener('click', () => { flushAll(); download(manuscript(deckId)); });
  $('tw-dl-json').addEventListener('click', () => { flushAll(); download(backup()); });
  $('tw-drive').addEventListener('click', () => { flushAll(); stats.flushStats(deckId); if (hooks.saveToDrive) hooks.saveToDrive(deckId); });
  $('tw-drive-2').addEventListener('click', () => { closeMenus(); flushAll(); stats.flushStats(deckId); if (hooks.saveToDrive) hooks.saveToDrive(deckId); });
  $('tw-sync').addEventListener('click', () => { if (hooks.syncClick) hooks.syncClick(); });

  tocSheet = makeSheet('tw-toc-sheet', 'toc', { onOpen: () => { $('tw-toc-sheet-body').append($('tw-toc')); } , onClose: () => { $('tw-side-left').append($('tw-toc')); } });
  statsSheet = makeSheet('tw-stats-sheet', 'stats', { onOpen: () => { $('tw-stats-sheet-body').append($('tw-stats')); }, onClose: () => { $('tw-side-right').append($('tw-stats')); } });
  versionsSheet = makeSheet('tw-versions-sheet', 'versions');
  initDesk({ deckId: () => deckId, total: () => total, prefs, savePrefs, focusPage: () => { const t = active && textEl(active); if (t) t.focus(); } });

  nav.onNav((stack, info) => { if (info.dir < 0 && info.level === level) closeWriter(); });
  decks.onChange(ev => {
    if (!level || selfSave) return;
    if (ev.type === 'remote') {
      const c = ev.id && decks.app.cards.get(ev.id);
      if (c && c.deck !== deckId) return;
      if (c && dirty.has(c.id)) { versions.snapshot(c, 'From another device (kept, your words won)'); return; }
      const t = c && textEl(c.id);
      if (t && sceneOf(c.id).classList.contains('loose') === (c.kind === 'i') && !c.binned) {
        const focused = t.contains(document.activeElement), off = focused ? caretOffset(t) : -1;
        renderDom(t, c.back);
        const before = total; total += wordsOf(c) - (words.get(c.id) || 0); words.set(c.id, wordsOf(c));
        if (focused && off >= 0) setCaret(t, off);
        if (before !== total) updateCounts();
        renderToc();
      } else scheduleRender();
      return;
    }
    if (ev.type === 'deck' && decks.writingDeckId() !== deckId) { flushAll(); deckId = decks.writingDeckId(); virtual.clear(); $('tw-deck-name').textContent = deck().name; render(); return; }
    if (ev.type === 'rename' && ev.id === deckId) { $('tw-deck-name').textContent = deck().name; return; }
    if ((ev.type === 'card' || ev.type === 'cards') && (!ev.deck || ev.deck === deckId)) scheduleRender();
  });
  addEventListener('pagehide', emergencySave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) emergencySave(); });
  addEventListener('resize', () => { if (level) requestAnimationFrame(keepCaret); });
}
