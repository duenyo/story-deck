// The deck list: switch decks, start a new one, rename yours, clear or bring back the sample, export.
import * as decks from './decks.js';
import * as nav from './nav.js';
import { makeSheet } from './sheets.js';
import { toast } from './hud.js';
import { manuscript, backup, download } from './export.js';

const $ = id => document.getElementById(id);
let sheet;

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const count = id => decks.deckCards(id).length;
const plural = n => n + (n === 1 ? ' card' : ' cards');

// Closing the sheet and climbing to the bench happen in one history step.
function pick(id) {
  if (id === decks.app.current) { sheet.close(); return; }
  nav.backTo('deck');
  decks.switchDeck(id);
}

function render() {
  const list = $('deck-list');
  list.textContent = '';
  for (const d of decks.ownDecks()) {
    const li = el('li', 'deck-row');
    const b = el('button', 'deck-pick');
    b.type = 'button';
    b.setAttribute('aria-current', String(d.id === decks.app.current));
    b.append(el('span', 'deck-name', d.name), el('span', 'deck-count', plural(count(d.id))));
    b.addEventListener('click', () => pick(d.id));
    const r = el('button', 'btn btn-small', 'Rename');
    r.type = 'button';
    r.addEventListener('click', () => rename(li, d));
    li.append(b, r);
    list.append(li);
  }
  const s = decks.sampleDeck(), row = $('sample-row');
  row.textContent = '';
  if (s) {
    const b = el('button', 'deck-pick sample');
    b.type = 'button';
    b.setAttribute('aria-current', String(s.id === decks.app.current));
    b.append(el('span', 'deck-name', s.name), el('span', 'deck-count', 'Sample · ' + plural(count(s.id))));
    b.addEventListener('click', () => pick(s.id));
    const c = el('button', 'btn btn-red btn-small', 'Clear');
    c.type = 'button';
    c.addEventListener('click', () => {
      decks.clearSample(); render();
      toast('Sample deck cleared', { action: 'Undo', onAction: () => { decks.undoClearSample(); render(); } });
    });
    const li = el('div', 'deck-row'); li.append(b, c); row.append(li);
  } else if (decks.hasSampleData()) {
    const b = el('button', 'btn', 'Bring back the sample deck');
    b.type = 'button';
    b.addEventListener('click', async () => {
      nav.backTo('deck');
      try { await decks.restoreSample(); } catch (e) { toast('Couldn’t load the sample deck'); }
    });
    row.append(b);
  } else {
    // The sample's cards stay off the public repo; they come from a file you pick once.
    const input = el('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
    const b = el('button', 'btn', 'Load a sample deck file');
    b.type = 'button';
    b.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        nav.backTo('deck');
        await decks.loadSample(data);
        toast('Sample deck loaded');
      } catch (e) { toast('That file isn’t a Story Deck sample'); }
    });
    row.append(b, input);
  }
}

function rename(li, d) {
  li.textContent = '';
  const input = el('input', 'deck-input'); input.value = d.name; input.maxLength = 40; input.setAttribute('aria-label', 'Deck name');
  const ok = el('button', 'btn btn-lit btn-small', 'Save'); ok.type = 'button';
  const done = () => { decks.renameDeck(d.id, input.value); render(); };
  ok.addEventListener('click', done);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
  li.append(input, ok);
  input.focus(); input.select();
}

export function initDeckSheet() {
  sheet = makeSheet('decksheet', 'decks', { onOpen: render });
  $('deck-new').addEventListener('click', () => {
    const li = el('li', 'deck-row');
    const input = el('input', 'deck-input'); input.placeholder = 'Name your deck'; input.maxLength = 40; input.setAttribute('aria-label', 'New deck name');
    const ok = el('button', 'btn btn-lit btn-small', 'Make'); ok.type = 'button';
    const make = () => { const name = input.value; nav.backTo('deck'); decks.newDeck(name); };
    ok.addEventListener('click', make);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') make(); });
    li.append(input, ok); $('deck-list').append(li); input.focus();
  });
  $('deck-export-md').addEventListener('click', () => download(manuscript()));
  $('deck-export-json').addEventListener('click', () => download(backup()));
  decks.onChange(() => { if (sheet.isOpen()) render(); });
  return sheet;
}
