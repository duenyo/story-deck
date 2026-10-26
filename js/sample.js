// The Kill the Witch sample deck, kept apart from your own decks. Your notes never go in the public repo:
// the sample arrives once from a link (its cards packed into the part after #, which never leaves the phone)
// or from the kill-the-witch-cards.json file, and is kept on the device from then on.
// People, places and beats come from the draft; the notes become Idea cards.
import { makeCard, darkInk } from './cards.js';
import { seedFor } from './art/sigils.js';

export const SAMPLE_ID = 'sample-ktw';

export function looksLikeSample(d) {
  return !!d && typeof d === 'object' && Array.isArray(d.characters) && Array.isArray(d.places) && Array.isArray(d.scenes);
}

// "#sample=…" holds the JSON, deflated and base64url-encoded.
export async function decodeSampleLink(packed) {
  const b64 = packed.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((packed.length + 3) % 4);
  const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
  const data = JSON.parse(text);
  if (!looksLikeSample(data)) throw new Error('Not a sample deck');
  return data;
}

// Face titles and picture words from make-sprites.js, so these cards match the mockups exactly.
const MOCKUP = {
  'p:kreeg': ['KREEG', 'Kreeg\nHuge, brutal and grieving a brother lost on the Captain’s mission.'],
  'p:witch': ['WITCH', 'The Witch\nNever seen until the end, only her effects.'],
  'p:beon': ['BEON', 'Beon\nA conscripted guard the Lord uses as a reader and scribe.'],
  'p:captain': ['CAPTAIN', 'The Captain\nComes home smiling after losing his men in the village.'],
  'p:lord': ['THE LORD', 'The Lord\nWispy and scholarly, and owns every book on witchcraft.'],
  'p:priest': ['PRIEST', 'The Priest\nCame to the city begging for help with the blight.'],
  'p:tallman': ['TALL MAN', 'The Tall Man\nBlack leathers, a huge hat and hand crossbows.'],
  'l:tunnel': ['TUNNEL', 'The Tunnel\nOlder than the church, lit only by glittering dirt.'],
  'l:gate': ['CITY GATE', 'City Gate\nThe stone walls of the river city.'],
  'l:tower': ['TOWER', 'The Lord’s Tower\nA cozy study inside a keep built in an alien style.'],
  'l:village': ['VILLAGE', 'The Village\nBlighted crops, stillbirths, shared nightmares and no young women.'],
  'l:villagechurch': ['CHURCH', 'The Village Church\nGraves and flowers out back, and a hatch under the desk.'],
  'l:cave': ['THE CAVE', 'The Witch’s Cave\nFlat, endless carved rooms, like the Backrooms.'],
  'i:The Tall Man brings fresh meat': ['MEAT', 'The Tall Man brings fresh meat\nIs it tainted? The Priest’s hungry stare gives him away.'],
  'i:Reading is a vestige': ['VESTIGE'],
  'i:Make it clear it’s a witch': ['UNSEEN']
};
// Short face titles where the automatic shortening (the first words that fit) reads badly.
const FACE = {
  'p:guardian': 'GUARDIAN', 'p:girl': 'GIRL', 'p:tan': 'TAN', 'p:officer': 'OFFICER', 'l:citychurch': 'CITY CH.',
  'b:3': 'YOU HURT', 'b:4': 'REAL GOD', 'b:8': 'LIBRARY', 'b:9': 'THANK YOU', 'b:11': 'THE ROAD', 'b:19': 'END?', 'b:27': 'BONES',
  'i:Does gunpowder': 'POWDER?', 'i:A chessboard': 'CHESS', 'i:The Tall Man mirrors': 'MIRROR', 'i:The core metaphor': 'METAPHOR',
  'i:From La Bo': 'LA BOETIE', 'i:Everyone treats': 'DOORMAT', 'i:Write what': 'CORNER', 'i:Maybe everyone': 'POWER', 'i:Show the Lord': 'SACRIFICE'
};
const NOTE_SUB = { 'Plot idea': 'Plot' };

const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export function buildSample(data) {
  data = { types: {}, notes: [], ...data };
  const deck = { v: 1, id: SAMPLE_ID, name: data.title || 'Kill the Witch', sample: true, born: Date.now() };
  const cards = [], pid = id => 'ktw-p-' + id, lid = id => 'ktw-l-' + id;
  const add = (key, kind, fields, seedText) => {
    const mock = MOCKUP[key];
    const c = makeCard({ deck: deck.id, kind, ...fields });
    c.x = clean({ ...c.x, face: (mock && mock[0]) || FACE[key] });
    c.pic = { seed: seedFor({ p: 'person', l: 'place', b: 'beat', i: 'idea' }[kind], (mock && mock[1]) || seedText || c.text), roll: 0, set: true };
    cards.push(c);
  };

  data.characters.forEach((ch, i) => add('p:' + ch.id, 'p', {
    id: pid(ch.id), sub: ch.main ? ch.piece : '', text: ch.name + '\n' + ch.bio, order: i,
    x: clean({ color: ch.main ? ch.color : null, role: ch.role, minor: !ch.main, alias: ch.alias })
  }));

  data.places.forEach((pl, i) => add('l:' + pl.id, 'l', { id: lid(pl.id), text: pl.name + '\n' + pl.desc, order: i }));

  data.scenes.forEach(s => {
    const qs = (s.qs || []).map(q => '• ' + q).join('\n');
    const text = [s.title, s.sum, s.line ? '“' + s.line + '”' : '', qs].filter(Boolean).join('\n\n').replace(/^([^\n]*)\n\n/, '$1\n');
    const type = data.types[s.type] || {};
    const links = (s.chars || []).map(id => ({ to: pid(id), as: 'with' }));
    if (s.place) links.push({ to: lid(s.place), as: 'at' });
    add('b:' + s.n, 'b', {
      id: 'ktw-b-' + s.n, sub: type.name || '', text, links, order: s.n,
      x: clean({ act: s.act, chapter: s.chapter, pages: s.pages, status: s.status, type: s.type, seal: s.status === 'drafted' ? 1 : 0, ink: type.color ? darkInk(type.color) : null })
    });
  });

  data.notes.forEach((n, i) => {
    const key = [...Object.keys(MOCKUP), ...Object.keys(FACE)].find(k => k.startsWith('i:') && n.text.startsWith(k.slice(2))) || 'i:' + i;
    add(key, 'i', {
      id: 'ktw-i-' + i, sub: NOTE_SUB[n.kind] || n.kind, text: n.text, order: i,
      links: (n.links || []).map(id => ({ to: pid(id), as: 'about' })), x: clean({ pages: n.pages })
    });
  });
  return { deck, cards };
}
