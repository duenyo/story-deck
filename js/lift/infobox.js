// The Balatro-style box above a lifted card: full title, the first lines of its words with
// people's names in their colors, and badges for kind, subtype and a few facts.
import { titleOf, bodyOf, kindOf, personColor, connections } from '../cards.js';
import { shade } from '../art/rng.js';

const STATUS = { drafted: ['Drafted', '#e0b23a', '#2a1c12'], rough: ['Rough', '#8a6a3a', '#fff3dc'], idea: ['Just an idea', '#5f5476', '#fff3dc'] };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function stamp(t) {
  const d = new Date(t), h = d.getHours(), m = d.getMinutes();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' am' : ' pm');
}

// Names of the deck's people, longest first, each with its color.
function nameMatcher(ix) {
  const names = [];
  for (const p of ix.cards) {
    if (p.kind !== 'p' || p.binned || p.x.minor) continue;
    const t = titleOf(p), col = shade(personColor(p), -0.32);
    const add = n => { if (n && n.length > 2) names.push([n, col]); };
    add(t); add(t.replace(/^The /, '')); add(p.x.alias);
  }
  names.sort((a, b) => b[0].length - a[0].length);
  if (!names.length) return null;
  return { re: new RegExp('(' + names.map(n => esc(n[0])).join('|') + ')', 'g'), color: new Map(names) };
}

export function fillInfo(el, card, ix) {
  const title = el.querySelector('.ib-title'), body = el.querySelector('.ib-body'), badges = el.querySelector('.ib-badges');
  title.textContent = titleOf(card) || 'Untitled';
  body.textContent = '';
  const text = bodyOf(card).replace(/\n+/g, ' ').trim();
  const m = nameMatcher(ix);
  if (!text) { const em = document.createElement('em'); em.textContent = 'Tap the card to write on it.'; body.append(em); }
  else if (!m) body.append(text);
  else text.split(m.re).forEach((part, i) => {
    if (i % 2) { const b = document.createElement('b'); b.textContent = part; b.style.color = m.color.get(part); body.append(b); }
    else if (part) body.append(part);
  });
  badges.textContent = '';
  const add = (t, bg, fg) => { const s = document.createElement('span'); s.className = 'badge'; s.textContent = t; s.style.background = bg; s.style.color = fg; badges.append(s); };
  const k = kindOf(card);
  add(k.label, k.color, k.fg);
  if (card.sub) add(card.sub, '#5a4029', '#fff3dc');
  if (card.x.status && STATUS[card.x.status]) add(...STATUS[card.x.status]);
  if (card.x.pages) add('p. ' + card.x.pages, '#3b3f46', '#e8e2d4');
  const n = connections(card, ix).length;
  if (n) add(n + (n === 1 ? ' link' : ' links'), '#3b3f46', '#e8e2d4');
  if (!card.deck.startsWith('sample')) add(stamp(card.born), '#3b3f46', '#e8e2d4');
}
