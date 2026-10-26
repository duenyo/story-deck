// The hidden tuning panel: sliders for the feel, a switch for how spreads show, reduced motion, export.
// Opened by holding the deck plaque at the top left for about a second.
import { settings, setSetting, saveDefaults, resetAll, isSaved, SLIDERS } from './settings.js';
import { makeSheet } from './sheets.js';
import { toast } from './hud.js';
import { manuscript, backup, download } from './export.js';

const $ = id => document.getElementById(id);
const STAGES = [['table', 'On the table'], ['screen', 'Own screen'], ['popup', 'Pop-up']];
let sheet;

function syncControls() {
  document.querySelectorAll('#t-stage button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === settings.stage)));
  SLIDERS.forEach(([k]) => { const i = $('t-' + k); if (i) { i.value = Math.round(settings[k] * 100); $('t-' + k + '-v').textContent = i.value; } });
  $('t-reduced').checked = !!settings.reduced;
  $('t-saved').textContent = isSaved() ? 'Saved' : 'Not saved yet';
}

function build() {
  const seg = $('t-stage');
  STAGES.forEach(([v, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = label;
    b.addEventListener('click', () => { setSetting('stage', v); syncControls(); });
    seg.append(b);
  });
  const box = $('t-sliders');
  SLIDERS.forEach(([k, label]) => {
    const wrap = document.createElement('div'); wrap.className = 'slider';
    const l = document.createElement('label'); l.htmlFor = 't-' + k; l.textContent = label;
    const v = document.createElement('span'); v.id = 't-' + k + '-v'; v.className = 'slider-v';
    const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 100; i.id = 't-' + k;
    i.addEventListener('input', () => { setSetting(k, i.value / 100); v.textContent = i.value; $('t-saved').textContent = isSaved() ? 'Saved' : 'Not saved yet'; });
    wrap.append(l, v, i); box.append(wrap);
  });
  $('t-reduced').addEventListener('change', e => { setSetting('reduced', e.target.checked); syncControls(); });
  $('t-save').addEventListener('click', () => { toast(saveDefaults() ? 'Saved as default' : 'Couldn’t save on this device'); syncControls(); });
  $('t-copy').addEventListener('click', async () => {
    const text = 'Story Deck tuning: ' + JSON.stringify(settings);
    try { await navigator.clipboard.writeText(text); toast('Settings copied'); } catch (e) { prompt('Copy these settings:', text); }
  });
  $('t-reset').addEventListener('click', () => { resetAll(); syncControls(); toast('Back to the starting feel (not saved yet)'); });
  $('t-export-md').addEventListener('click', () => download(manuscript()));
  $('t-export-json').addEventListener('click', () => download(backup()));
}

export function initTuning() {
  build();
  sheet = makeSheet('tuning', 'tuning', {
    onOpen() {
      syncControls();
      if (window.caches) caches.keys().then(k => { $('t-build').textContent = 'Build ' + (k.find(n => n.startsWith('sd-')) || 'not cached yet'); });
    }
  });
  return sheet;
}
