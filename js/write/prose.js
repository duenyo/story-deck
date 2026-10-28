// What's written on a card's back, stored as plain text: one paragraph per line, **bold** and *italic*,
// with a backslash before any * or \ you actually typed. These turn it into page elements and back.

const PARA_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'SECTION', 'ARTICLE']);

// One paragraph's markup → runs of { t, b, i }.
export function parseLine(line) {
  const runs = []; let b = false, i = false, buf = '';
  const push = () => { if (buf) { runs.push({ t: buf, b, i }); buf = ''; } };
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (ch === '\\' && k + 1 < line.length) { buf += line[++k]; continue; }
    if (ch === '*') {
      push();
      if (line[k + 1] === '*') { b = !b; k++; } else i = !i;
      continue;
    }
    buf += ch;
  }
  push();
  return runs;
}

const esc = t => t.replace(/[\\*]/g, m => '\\' + m);
// Runs → one paragraph's markup. Markers only mark where bold or italic turns on or off, so every
// marker is a toggle and they can't be misread; spaces stay outside them ("**bold** text").
export function lineOf(runs) {
  const merged = [];
  for (const r of runs) {
    if (!r.t) continue;
    const last = merged[merged.length - 1];
    if (last && last.b === r.b && last.i === r.i) last.t += r.t; else merged.push({ ...r });
  }
  let out = '', b = false, i = false, pend = '';
  for (const r of merged) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.t);
    if (!m[2]) { pend += r.t; continue; }
    const close = (b && !r.b ? '**' : '') + (i && !r.i ? '*' : '');
    const open = (!b && r.b ? '**' : '') + (!i && r.i ? '*' : '');
    out += close + pend + m[1] + open + esc(m[2]);
    pend = m[3]; b = r.b; i = r.i;
  }
  return out + (b ? '**' : '') + (i ? '*' : '') + pend;
}

export const toLines = text => String(text || '').split('\n');

// The page's paragraphs → stored text.
export function readDom(root) {
  const paras = []; let cur = null;
  const open = () => { if (!cur) cur = []; };
  const end = () => { if (cur) { paras.push(cur); cur = null; } };
  const walk = (node, b, i) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { open(); cur.push({ t: n.data.replace(/ /g, ' ').replace(/[\r\n]+/g, ' '), b, i }); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (tag === 'BR') {
        // a <br> that's the last thing in a paragraph only props it open
        const lastInBlock = !n.nextSibling && n.parentNode !== root && PARA_TAGS.has(n.parentNode.tagName);
        if (lastInBlock) { open(); } else { open(); end(); open(); }
        continue;
      }
      if (PARA_TAGS.has(tag)) { end(); walk(n, b, i); if (!cur) cur = []; end(); continue; }
      const st = n.style || {};
      const nb = b || tag === 'B' || tag === 'STRONG' || /^(bold|[6-9]00)$/.test(st.fontWeight || '');
      const ni = i || tag === 'I' || tag === 'EM' || st.fontStyle === 'italic';
      walk(n, nb, ni);
    }
  };
  walk(root, false, false);
  end();
  return paras.map(lineOf).join('\n');
}

// Stored text → the page's paragraphs.
export function renderDom(root, text) {
  root.textContent = '';
  const frag = document.createDocumentFragment();
  for (const line of toLines(text)) {
    const p = document.createElement('p');
    const runs = parseLine(line);
    if (!runs.length) p.append(document.createElement('br'));
    for (const r of runs) {
      let node = document.createTextNode(r.t);
      if (r.i) { const e = document.createElement('i'); e.append(node); node = e; }
      if (r.b) { const e = document.createElement('b'); e.append(node); node = e; }
      p.append(node);
    }
    frag.append(p);
  }
  root.append(frag);
}

// Plain words for counting and searching.
export const plainOf = text => toLines(text).map(l => parseLine(l).map(r => r.t).join('')).join('\n');

// The caret as a character offset into the element's text, and back (for re-rendering under the caret).
export function caretOffset(root) {
  const sel = getSelection();
  if (!sel.rangeCount || !root.contains(sel.anchorNode)) return -1;
  const r = document.createRange();
  r.selectNodeContents(root); r.setEnd(sel.anchorNode, sel.anchorOffset);
  return blockText(r.cloneContents()).length;
}
const blockText = frag => { const d = document.createElement('div'); d.append(frag); return [...d.querySelectorAll('p')].length ? [...d.querySelectorAll('p')].map(p => p.textContent).join('\n') : d.textContent; };
export function setCaret(root, offset) {
  const ps = [...root.querySelectorAll('p')];
  let left = Math.max(0, offset);
  for (let k = 0; k < ps.length; k++) {
    const len = ps[k].textContent.length;
    if (left <= len || k === ps.length - 1) { placeIn(ps[k], Math.min(left, len)); return; }
    left -= len + 1;
  }
  if (!ps.length) placeIn(root, 0);
}
function placeIn(el, off) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, left = off;
  while ((n = w.nextNode())) { if (left <= n.data.length) return select(n, left); left -= n.data.length; }
  select(el, el.childNodes.length && el.lastChild.nodeName === 'BR' ? 0 : el.childNodes.length);
}
function select(node, off) { const r = document.createRange(); r.setStart(node, off); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
export const caretToStart = root => setCaret(root, 0);
export const caretToEnd = root => setCaret(root, 1e9);
