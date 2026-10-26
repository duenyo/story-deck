// Your notes are yours: the deck's beats in story order as one Markdown manuscript,
// and a full backup of every deck and card as JSON.
import * as decks from './decks.js';
import { titleOf, bodyOf, SHAPE } from './cards.js';

const day = () => new Date().toISOString().slice(0, 10);
const slug = s => (s || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';

export function manuscript(deckId = decks.app.current) {
  const deck = decks.app.decks.get(deckId), cards = decks.deckCards(deckId);
  const part = (c, h) => `${h} ${titleOf(c) || 'Untitled'}\n\n${bodyOf(c) ? bodyOf(c) + '\n\n' : ''}`;
  const beats = cards.filter(c => c.kind === 'b'), ideas = cards.filter(c => c.kind === 'i');
  let md = `# ${deck.name}\n\n`;
  beats.forEach((c, i) => { md += part({ ...c, text: (i + 1) + '. ' + c.text }, '##'); });
  if (ideas.length) { md += (beats.length ? '---\n\n' : '') + '## Ideas\n\n'; ideas.forEach(c => { md += part(c, '###'); }); }
  if (!beats.length && !ideas.length) md += '_No beats or ideas yet._\n';
  return { name: `${slug(deck.name)}-manuscript-${day()}.md`, text: md, type: 'text/markdown' };
}

export function backup() {
  const data = {
    app: 'story-deck', shape: SHAPE, exported: new Date().toISOString(),
    decks: [...decks.app.decks.values()],
    cards: [...decks.app.cards.values()]
  };
  return { name: `story-deck-backup-${day()}.json`, text: JSON.stringify(data, null, 1), type: 'application/json' };
}

export function download({ name, text, type }) {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
