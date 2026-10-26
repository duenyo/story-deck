// The 3x5 pixel font from make-sprites.js, with digits and a little punctuation added in the same style,
// and the rules that shorten a title to fit the card's top plate (about 9 letters).
export const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'], G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], '?': ['##.', '..#', '.#.', '...', '.#.'], ' ': ['..', '..', '..', '..', '..'], "'": ['#', '#', '.', '.', '.'],
  // added for titles people type
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'], 3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'], 6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '.#.', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '##.'],
  '.': ['.', '.', '.', '.', '#'], ',': ['.', '.', '.', '#', '#'], '!': ['#', '#', '#', '.', '#'], ':': ['.', '#', '.', '#', '.'], ';': ['.', '#', '.', '#', '#'],
  '-': ['..', '..', '##', '..', '..'], '+': ['...', '.#.', '###', '.#.', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'], '(': ['.#', '#.', '#.', '#.', '.#'], ')': ['#.', '.#', '.#', '.#', '#.'],
  '&': ['.#.', '#.#', '.#.', '#.#', '.##'], '#': ['#.#', '###', '#.#', '###', '#.#'], '"': ['#.#', '#.#', '...', '...', '...'], '*': ['#.#', '.#.', '#.#', '...', '...'], '=': ['...', '###', '...', '###', '...'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'], '_': ['...', '...', '...', '...', '###']
};

// Uppercase, plain quotes and dashes, accents dropped, and anything the font can't draw removed.
export function clean(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '.')
    .toUpperCase().split('').filter(ch => FONT[ch]).join('')
    .replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
}

export const textW = s => [...s].reduce((w, ch) => w + FONT[ch][0].length + 1, 0) - 1;

export function text(im, s, x, y, col) {
  for (const ch of s) {
    const g = FONT[ch];
    g.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') im.set(x + i, y + j, col); });
    x += g[0].length + 1;
  }
}

const ARTICLES = ['THE', 'A', 'AN'];
// Words a shortened title shouldn't end on ("PIGS WITH") or start with ("IT END?").
const NO_END = new Set([...ARTICLES, 'OF', 'WITH', 'FOR', 'ON', 'IN', 'TO', 'AND', 'OR', 'AT', 'BY', 'FROM', 'INTO', 'IS', 'IT', 'DID', 'DO', 'WAS', 'BE', 'MY', 'YOUR', 'HIS', 'HER', 'OUR', 'THEIR']);
const NO_START = new Set(['IT', 'IS', 'DID', 'DO', 'WAS', 'BE', 'AND', 'OR']);
const letters = s => s.replace(/[^A-Z0-9]/g, '').length;
function cut(s, maxW) { while (s.length > 1 && textW(s) > maxW) s = s.slice(0, -1).trimEnd(); return s; }

// A title for the top plate, from the first words: the whole title if it fits, otherwise as many
// leading words as fit (not ending on "of", "the"…), without a leading "The" or "A".
// If that leaves only a tiny word, the longest ending that fits is used instead ("UP THE MOUNTAIN" → MOUNTAIN).
const trimEnd = s => s.replace(/[,:;\-]+$/, '').trim();
export function faceTitle(title, maxW = 36) {
  const s = clean(title);
  if (!s) return '';
  if (textW(s) <= maxW) return s;
  let words = s.split(' ');
  while (words.length > 1 && ARTICLES.includes(words[0])) words = words.slice(1);
  const all = trimEnd(words.join(' '));
  if (textW(all) <= maxW) return all;
  let head = '';
  for (let n = words.length - 1; n >= 1 && !head; n--) {
    const h = trimEnd(words.slice(0, n).join(' '));
    if (textW(h) <= maxW && (n === 1 || !NO_END.has(words[n - 1]))) head = h;
  }
  if (!head) return trimEnd(cut(words[0], maxW)); // a first word too long to fit: cut it short
  if (letters(head) < 4) {
    for (let n = words.length - 1; n >= 1; n--) {
      const tail = words.slice(words.length - n);
      let t = trimEnd(tail.join(' '));
      if (textW(t) > maxW || NO_START.has(tail[0])) continue;
      if (tail.length > 1 && ARTICLES.includes(tail[0])) t = tail.slice(1).join(' ');
      if (letters(t) > letters(head)) head = t;
      break;
    }
  }
  return head || trimEnd(cut(words[0], maxW));
}

// The kind line beside the icon: as many whole words as fit, else letters cut from the end.
export function fitLabel(label, maxW = 29) {
  const s = clean(label);
  if (textW(s) <= maxW) return s;
  const words = s.split(' ');
  let out = '';
  for (const w of words) { const t = out ? out + ' ' + w : w; if (textW(t) <= maxW) out = t; else break; }
  return out || cut(words[0], maxW);
}
