// Cards are what's saved: text, kind, labels and links. Looks and motion never touch them.
// Every card shares one shape with a version number (upgrade.js converts older shapes).
import { hash, shade } from './art/rng.js';
import { clean, faceTitle } from './art/font.js';
import { seedFor } from './art/sigils.js';

export const SHAPE = 1;

// Kinds are stored as one-letter codes. Concept, Thing and Source come later.
export const KINDS = {
  b: { name: 'beat', label: 'Beat', plural: 'Beats', color: '#6b3f86', fg: '#fff3dc', ink: '#4b2e60' },
  p: { name: 'person', label: 'Person', plural: 'People', color: '#b5402f', fg: '#fff3dc' },
  l: { name: 'place', label: 'Place', plural: 'Places', color: '#3c6e39', fg: '#fff3dc' },
  i: { name: 'idea', label: 'Idea', plural: 'Ideas', color: '#e0a33a', fg: '#2a1c12' },
  q: { name: 'question', label: 'Question', plural: 'Questions', color: '#2f6f73', fg: '#fff3dc', ink: '#1d4f4a' }
};
export const KIND_ORDER = ['b', 'p', 'l', 'i', 'q'];
export const kindOf = c => KINDS[c.kind] || KINDS.i;

export const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function makeCard({ deck, kind = 'i', text = '', sub = '', links = [], x = {}, order, id }) {
  const now = Date.now();
  return {
    v: SHAPE, id: id || uid('c'), deck, kind, sub, text,
    labels: [], links, pic: { seed: 0, roll: 0, set: false },
    order: order ?? now, born: now, edited: now, from: null, binned: 0, x
  };
}

// While a new card is being written its picture follows the words; once it's made, the seed stays.
export function refreshPicture(card) {
  if (!card.pic.set) card.pic.seed = seedFor(kindOf(card).name, card.text, card.pic.roll);
}
export function reroll(card) {
  card.pic.roll = (card.pic.roll || 0) + 1;
  card.pic.seed = seedFor(kindOf(card).name, card.text + '|' + card.id, card.pic.roll);
  card.pic.set = true;
}

/* ---------- titles: from the first words ---------- */
const TITLE_MAX = 48;
export function splitTitle(text) {
  const t = String(text || '').replace(/\r/g, '').replace(/^\s+/, '');
  const nl = t.indexOf('\n');
  const first = (nl < 0 ? t : t.slice(0, nl)).trim();
  const rest = nl < 0 ? '' : t.slice(nl + 1).trim();
  if (first.length <= TITLE_MAX) return { title: first.replace(/[.:;,]+$/, ''), body: rest };
  const m = /[.!?:;](\s|$)/g; let cutAt = -1, r;
  while ((r = m.exec(first)) && r.index <= TITLE_MAX) if (r.index >= 6) { cutAt = r.index; break; }
  if (cutAt > 0) {
    const title = first.slice(0, cutAt + 1).replace(/[.:;]$/, '');
    return { title, body: [first.slice(cutAt + 1).trim(), rest].filter(Boolean).join('\n') };
  }
  let sp = first.lastIndexOf(' ', TITLE_MAX - 4); if (sp < 12) sp = TITLE_MAX - 4;
  return { title: first.slice(0, sp).trim() + '…', body: ['…' + first.slice(sp).trim(), rest].filter(Boolean).join('\n') };
}
export const titleOf = c => splitTitle(c.text).title;
export const bodyOf = c => splitTitle(c.text).body;

/* ---------- people dots and connections ---------- */
const DOT_COLORS = ['#D9772B', '#3D7FD6', '#C94A3B', '#9A7716', '#23857A', '#8A6FB8', '#C04F9A', '#5E8C31'];
export const personColor = p => p.x.color || DOT_COLORS[hash(p.id) % DOT_COLORS.length];
export function initialOf(p) { const t = clean(titleOf(p)).replace(/^(THE|A|AN) /, ''); return /[A-Z0-9]/.test(t[0] || '') ? t[0] : '?'; }
const dotted = p => p && p.kind === 'p' && !p.binned && !p.x.minor;

// The index a deck needs for dots and connections, rebuilt when its cards change.
export function indexDeck(cards) {
  const byId = new Map(cards.map(c => [c.id, c]));
  const back = new Map(); // id -> cards that link to it
  for (const c of cards) for (const l of c.links) { if (!back.has(l.to)) back.set(l.to, []); back.get(l.to).push(c); }
  return { byId, back, cards };
}

function topPeople(counts, ix) {
  return [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || ix.byId.get(a).order - ix.byId.get(b).order).slice(0, 4);
}

// Up to four people: who a beat or note names, who a person shares beats with, who turns up at a place.
export function peopleFor(card, ix) {
  let ids = [];
  if (card.kind === 'p' || card.kind === 'l') {
    const counts = new Map();
    for (const b of ix.back.get(card.id) || []) {
      if (b.kind !== 'b' || b.binned) continue;
      for (const l of b.links) if (l.to !== card.id && dotted(ix.byId.get(l.to))) counts.set(l.to, (counts.get(l.to) || 0) + 1);
    }
    ids = topPeople(counts, ix);
  } else {
    ids = card.links.map(l => l.to).filter(id => dotted(ix.byId.get(id))).slice(0, 4);
  }
  return ids.map(id => { const p = ix.byId.get(id); return { id, color: personColor(p), initial: initialOf(p), name: titleOf(p) }; });
}

export function connections(card, ix) {
  const seen = new Set([card.id]), out = [];
  const add = c => { if (c && !c.binned && !seen.has(c.id)) { seen.add(c.id); out.push(c); } };
  card.links.forEach(l => add(ix.byId.get(l.to)));
  (ix.back.get(card.id) || []).forEach(add);
  return out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.order - b.order);
}

// Everything the card face drawing needs, in one small object.
export function faceSpec(card, ix) {
  const k = kindOf(card);
  return {
    frameKey: card.id,
    title: card.x.face ? clean(card.x.face) : faceTitle(titleOf(card)),
    kind: k.name,
    label: card.sub || k.label,
    pips: peopleFor(card, ix),
    seal: !!card.x.seal,
    seed: card.pic.seed,
    ink: card.x.ink || k.ink || null
  };
}

export const darkInk = hex => shade(hex, -0.25);
