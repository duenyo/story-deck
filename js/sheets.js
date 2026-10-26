// A bottom sheet that is one level deep: the back swipe or a tap on the dimmed table closes it.
import * as nav from './nav.js';

export function makeSheet(id, lv, { onOpen, onClose } = {}) {
  const el = document.getElementById(id);
  let level = null;
  nav.onNav((stack, info) => { if (info.dir < 0 && info.level === level) hide(); });
  el.addEventListener('click', e => { if (e.target === el) nav.back(); });
  function open() {
    if (level) return;
    if (onOpen) onOpen();
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('on'));
    level = { lv };
    nav.push(level);
  }
  function hide() {
    level = null;
    el.classList.remove('on');
    setTimeout(() => { if (!level) el.hidden = true; }, 240);
    if (onClose) onClose();
  }
  return { open, close: () => { if (level) nav.back(); }, isOpen: () => !!level, el };
}
