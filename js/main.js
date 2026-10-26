// Start-up, capture first: the writing sheet is ready before anything else loads.
// The table, its art and the sheets load right behind it.
import { installPanelCss } from './art/panels.js';
import * as decks from './decks.js';
import * as nav from './nav.js';
import { initEditor, openEditor, editorOpen } from './editor.js';
import { toast, setPlaque, hint } from './hud.js';
import { onStorageError } from './storage.js';
import { settings, onSettings } from './settings.js';
import { KINDS } from './cards.js';

const $ = id => document.getElementById(id);
const applyFx = () => document.documentElement.style.setProperty('--scan', settings.scan);

installPanelCss();
applyFx();
onSettings(applyFx);
initEditor();
const sampleLink = location.hash.startsWith('#sample=') ? location.hash.slice(8) : null;
if (location.search || location.hash) history.replaceState(null, '', location.pathname);
nav.setLeaveWarning(() => toast('Swipe back again to close Story Deck', { ms: 2400 }));
onStorageError(() => toast('Couldn’t save on this device. Export a backup from the deck list.', { ms: 6000 }));
$('new-idea').addEventListener('click', () => openEditor());

async function loadSampleLink(packed) {
  try {
    const { decodeSampleLink } = await import('./sample.js');
    nav.backTo('deck');
    await decks.loadSample(await decodeSampleLink(packed));
    setTimeout(() => toast('Kill the Witch sample deck loaded'), 600);
  } catch (e) { console.warn(e); toast('That sample link didn’t work'); }
}
addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#sample=')) return;
  const packed = location.hash.slice(8);
  history.replaceState(history.state, '', location.pathname);
  decks.ready.then(() => loadSampleLink(packed));
});

async function start() {
  await decks.load();
  if (sampleLink) await loadSampleLink(sampleLink);
  const [table, lift, deckSheet, tuning] = await Promise.all([
    import('./table/table.js'), import('./lift/lift.js'), import('./decksheet.js'), import('./tuning.js')
  ]);
  table.initTable($('table'));
  lift.initLift();
  const decksUi = deckSheet.initDeckSheet(), tuningUi = tuning.initTuning();

  table.setActions({
    lift: (id, ctx) => nav.push({ lv: 'lifted', id, ctx }),
    emptyDeck: () => { hint('empty'); const b = $('new-idea'); b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); }
  });
  lift.setLiftActions({ write: id => openEditor({ id }) });

  // The plaque: tap for the deck list, hold for the hidden tuning panel.
  const plaque = $('hud-plaque');
  let holdTimer = 0, held = false;
  plaque.addEventListener('pointerdown', () => { held = false; holdTimer = setTimeout(() => { held = true; tuningUi.open(); }, 750); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => plaque.addEventListener(ev, () => clearTimeout(holdTimer)));
  plaque.addEventListener('click', () => { if (held) { held = false; return; } decksUi.open(); });
  plaque.addEventListener('contextmenu', e => e.preventDefault());

  const plaqueText = () => {
    const d = decks.currentDeck(); if (!d) return;
    const cards = table.cardsHere(), t = nav.levels().find(l => l.lv === 'spread');
    let line = cards.length + (cards.length === 1 ? ' card' : ' cards') + (d.sample ? ' · sample' : '');
    if (table.level() === 'piles') { const n = new Set(cards.map(c => c.kind)).size; line = n + (n === 1 ? ' pile' : ' piles'); }
    if (t) { const n = cards.filter(c => c.kind === t.kind).length; line = (t.kind === 'b' ? 'The Thread · ' : '') + n + ' ' + KINDS[t.kind].plural.toLowerCase(); }
    setPlaque(d.name, line);
  };
  nav.onNav(plaqueText); decks.onChange(plaqueText); plaqueText();
  if (document.fonts) document.fonts.ready.then(() => import('./loop.js').then(l => l.kick()));
  window.storyDeck = { decks, nav, table }; // for poking at from the browser console
  document.body.classList.add('ready');
}
start().catch(err => { console.error(err); toast('Story Deck couldn’t start: ' + (err && err.message || err), { ms: 10000 }); });

/* ---------- offline and updates ---------- */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false, lastCheck = Date.now();
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    const apply = w => w && w.postMessage('skip');
    const offer = w => {
      if (document.hidden && !editorOpen()) return apply(w);
      toast('A new version is ready', { action: 'Update', onAction: () => apply(w), ms: 8000 });
    };
    if (reg.waiting && hadController) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && reg.waiting && !editorOpen()) apply(reg.waiting);
      if (!document.hidden && Date.now() - lastCheck > 10 * 60 * 1000) { lastCheck = Date.now(); reg.update().catch(() => {}); }
    });
  }).catch(err => console.warn('Offline support unavailable', err));
}
