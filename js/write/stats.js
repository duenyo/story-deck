// NaNoWriMo counts: words written each day, kept on the deck so every device sees the same days.
// days['2026-11-03'] = [words in the deck when the day began, words at the latest save that day].
import * as decks from '../decks.js';

export const dayKey = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const days = deck => (deck.x.days = deck.x.days || {});

let saveTimer = 0;
// Called whenever the deck's total changes: `before` is the total just before this change.
export function recordTotal(deckId, before, now) {
  const deck = decks.app.decks.get(deckId);
  if (!deck || deck.sample) return;
  const d = days(deck), k = dayKey();
  if (!d[k]) {
    // the day starts from the last total we know (yesterday's end), else from just before this change
    const prev = Object.keys(d).filter(x => x < k).sort().pop();
    d[k] = [prev ? d[prev][1] : before, now];
  } else d[k][1] = now;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => decks.saveDeckMeta(deck), 1500);
}
export function flushStats(deckId) {
  const deck = decks.app.decks.get(deckId);
  if (deck && saveTimer) { clearTimeout(saveTimer); saveTimer = 0; decks.saveDeckMeta(deck); }
}

export function today(deckId) {
  const deck = decks.app.decks.get(deckId), e = deck && deck.x.days && deck.x.days[dayKey()];
  return e ? Math.max(0, e[1] - e[0]) : 0;
}

// This month: words written since the month's first recorded day, which days met the goal, and the pace.
export function month(deckId, total, dailyGoal, monthGoal, now = new Date()) {
  const deck = decks.app.decks.get(deckId), d = (deck && deck.x.days) || {};
  const prefix = dayKey(now).slice(0, 8), keys = Object.keys(d).filter(k => k.startsWith(prefix)).sort();
  const start = keys.length ? d[keys[0]][0] : total;
  const words = Math.max(0, total - start);
  const met = new Set(keys.filter(k => d[k][1] - d[k][0] >= dailyGoal).map(k => +k.slice(8)));
  const dayOfMonth = now.getDate(), daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const perDay = words / dayOfMonth;
  let finish = null;
  if (words >= monthGoal) finish = 'done';
  else if (perDay > 0) {
    const need = Math.ceil((monthGoal - words) / perDay);
    const f = new Date(now); f.setDate(f.getDate() + need);
    finish = f;
  }
  return { words, met, dayOfMonth, daysInMonth, finish, firstWeekday: new Date(now.getFullYear(), now.getMonth(), 1).getDay(), monthName: now.toLocaleDateString('en-US', { month: 'long' }) };
}

// Two devices' day records combined: the earliest start and the end from the newer record.
export function mergeDays(local = {}, remote = {}, remoteIsNewer) {
  const out = { ...local };
  for (const [k, r] of Object.entries(remote)) {
    const l = out[k];
    out[k] = l ? [Math.min(l[0], r[0]), remoteIsNewer ? r[1] : l[1]] : r;
  }
  return out;
}
