// Beside the page: today's candle, the month's calendar and pace, and the sprint hourglass.
import * as stats from './stats.js';
import { candle, calendar, hourglass, paint } from './pixelart.js';
import { toast } from '../hud.js';
import { phys } from '../settings.js';

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US');
let ctx = null, flick = 0, frame = 0, smoke = 0, wasMet = null, sprint = null, sprintTick = 0, lastCal = '';

// c: { deckId(), total(), prefs }
export function initDesk(c) {
  ctx = c;
  $('tw-sprint').addEventListener('click', onSprint);
  document.querySelectorAll('[data-sprint]').forEach(b => b.addEventListener('click', () => startSprint(+b.dataset.sprint)));
  $('tw-goal-day').addEventListener('change', e => { ctx.prefs.daily = Math.max(1, Math.round(+e.target.value || 1667)); ctx.savePrefs(); update(true); });
  $('tw-goal-month').addEventListener('change', e => { ctx.prefs.month = Math.max(1, Math.round(+e.target.value || 50000)); ctx.savePrefs(); update(true); });
}

export function update(force) {
  if (!ctx) return;
  const id = ctx.deckId(), total = ctx.total(), daily = ctx.prefs.daily, monthGoal = ctx.prefs.month;
  const today = stats.today(id), met = today >= daily;
  if (wasMet === false && met) { smoke = 12; toast('Today’s goal reached. The candle’s out.'); $('tw-cal').classList.remove('stamp'); void $('tw-cal').offsetWidth; $('tw-cal').classList.add('stamp'); }
  wasMet = met;
  $('tw-today').textContent = fmt(today) + ' / ' + fmt(daily);
  $('tw-chip-today').textContent = fmt(today);
  drawCandle(today / daily, !met);
  const m = stats.month(id, total, daily, monthGoal);
  $('tw-month-name').textContent = m.monthName;
  $('tw-month').textContent = fmt(m.words) + ' / ' + fmt(monthGoal);
  $('tw-month-bar').style.setProperty('--p', Math.min(1, m.words / monthGoal));
  // the finish date if it falls this month, otherwise where this pace lands by the month's last day
  const now = new Date(), lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const inMonth = m.finish instanceof Date && m.finish <= lastDay;
  $('tw-pace').textContent = m.finish === 'done' ? 'Month goal reached!'
    : !m.finish ? 'Write a little to see your pace'
    : inMonth ? 'At this pace you’ll finish ' + m.finish.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'At this pace: ' + fmt(Math.round(m.words / m.dayOfMonth * m.daysInMonth)) + ' words by ' + lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const key = [m.monthName, m.dayOfMonth, [...m.met].join(',')].join('|');
  if (force || key !== lastCal) { lastCal = key; paint($('tw-cal'), calendar(m, m.dayOfMonth)); }
  if (document.activeElement !== $('tw-goal-day')) $('tw-goal-day').value = daily;
  if (document.activeElement !== $('tw-goal-month')) $('tw-goal-month').value = monthGoal;
}

function drawCandle(p, lit) { paint($('tw-candle'), candle(p, frame, lit, smoke)); paint($('tw-chip-candle'), candle(p, frame, lit, smoke)); }

// A slow flicker (4 frames a second) while the typewriter is open; nothing at all with reduced motion.
export function startDesk() {
  stopDesk(); wasMet = null; update(true);
  if (phys.reduced) return;
  flick = setInterval(() => {
    frame++;
    if (smoke > 0) smoke--;
    const id = ctx.deckId(), today = stats.today(id);
    drawCandle(today / ctx.prefs.daily, today < ctx.prefs.daily);
  }, 250);
}
export function stopDesk() { clearInterval(flick); flick = 0; }

/* ---------- sprints ---------- */
function onSprint() {
  if (sprint) {
    if (sprint.armed) { endSprint(true); return; }
    sprint.armed = true; $('tw-sprint-label').textContent = 'Tap again to stop';
    setTimeout(() => { if (sprint) sprint.armed = false; }, 2500);
    return;
  }
  $('tw-sprint-pick').hidden = !$('tw-sprint-pick').hidden;
}
function startSprint(min) {
  $('tw-sprint-pick').hidden = true;
  sprint = { start: Date.now(), ms: min * 60000, words: ctx.total(), min, armed: false };
  tickSprint();
  sprintTick = setInterval(tickSprint, 1000);
  ctx.focusPage();
}
function tickSprint() {
  if (!sprint) return;
  const el = Date.now() - sprint.start, t = Math.min(1, el / sprint.ms), left = Math.max(0, sprint.ms - el);
  const mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60, plus = Math.max(0, ctx.total() - sprint.words);
  paint($('tw-hourglass'), hourglass(t, true, Math.floor(el / 250)));
  if (!sprint.armed) $('tw-sprint-label').textContent = mm + ':' + String(ss).padStart(2, '0') + ' · +' + fmt(plus);
  if (t >= 1) endSprint(false);
}
function endSprint(early) {
  const plus = Math.max(0, ctx.total() - sprint.words), mins = Math.max(1, Math.round((Date.now() - sprint.start) / 60000));
  clearInterval(sprintTick); sprint = null;
  paint($('tw-hourglass'), hourglass(0, false, 0));
  $('tw-sprint-label').textContent = 'Sprint';
  toast((early ? 'Sprint stopped: ' : 'Sprint done: ') + '+' + fmt(plus) + ' words in ' + mins + ' min', { ms: 6000 });
}
export function resetHourglass() { if (!sprint) paint($('tw-hourglass'), hourglass(0, false, 0)); }
