// Your notes are yours: the deck's scenes in story order as a manuscript (Word or Markdown),
// and a full backup of every deck and card as JSON.
import * as decks from './decks.js';
import { SHAPE } from './cards.js';
import { scenesOf, looseOf, chapterNumbers } from './write/manuscript.js';
import { toLines } from './write/prose.js';
import { docx } from './export/docx.js';

const day = () => new Date().toISOString().slice(0, 10);
export const slug = s => (s || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';
const asMarkup = plain => String(plain || '').replace(/[\\*]/g, m => '\\' + m);

// The story in order: each scene's prose (or its note, if nothing's written on its back yet).
export function manuscriptParts(deckId = decks.writingDeckId()) {
  const scenes = scenesOf(deckId), chapters = chapterNumbers(scenes);
  return scenes.map(c => ({
    id: c.id,
    chapter: chapters.has(c.id) ? 'Chapter ' + chapters.get(c.id) + (c.x.chTitle ? ': ' + c.x.chTitle : '') : null,
    text: c.back || asMarkup(c.text)
  }));
}

export function manuscript(deckId = decks.writingDeckId()) {
  const deck = decks.app.decks.get(deckId), parts = manuscriptParts(deckId), loose = looseOf(deckId);
  const prose = t => toLines(t).filter(l => l.trim()).join('\n\n');
  let md = `# ${deck.name}\n\n`;
  parts.forEach((p, n) => {
    if (p.chapter) md += `## ${p.chapter}\n\n`;
    else if (n > 0) md += `* * *\n\n`;
    md += prose(p.text) + '\n\n';
  });
  if (loose.length) { md += `---\n\n## Loose scenes\n\n`; loose.forEach(c => { md += prose(c.back || asMarkup(c.text)) + '\n\n* * *\n\n'; }); }
  if (!parts.length && !loose.length) md += '_Nothing written yet._\n';
  return { name: `${slug(deck.name)}-${day()}.md`, text: md, type: 'text/markdown' };
}

export async function manuscriptDocx(deckId = decks.writingDeckId()) {
  const deck = decks.app.decks.get(deckId);
  const blob = await docx(deck.name, deck.x.author || '', manuscriptParts(deckId));
  return { name: `${deck.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Story Deck'}.docx`, blob, type: blob.type };
}

export function backup() {
  const data = {
    app: 'story-deck', shape: SHAPE, exported: new Date().toISOString(),
    decks: [...decks.app.decks.values()],
    cards: [...decks.app.cards.values()]
  };
  return { name: `story-deck-backup-${day()}.json`, text: JSON.stringify(data, null, 1), type: 'application/json' };
}

export function download({ name, text, blob, type }) {
  const url = URL.createObjectURL(blob || new Blob([text], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
