// The feel, as numbers from 0 to 1 that the tuning panel's sliders change.
// Changes apply at once; "Save as default" keeps them after the app closes.
const KEY = 'sd.tuning';
let reducedPref = false;
try { reducedPref = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }

export const DEFAULTS = {
  stage: 'table',   // how a spread is shown: 'table', 'screen' or 'popup'
  follow: 0.6,      // how closely cards follow your thumb
  bounce: 0.35,     // bounce when they land
  fling: 0.55,      // how far a fling throws
  tilt: 0.5,        // tilt amount
  sway: 0.4,        // idle sway
  zoom: 0.5,        // zoom speed (lifting and setting down)
  shadow: 0.5,      // shadow lift
  scan: 0.3,        // scanline strength
  reduced: reducedPref // quick fades instead of big moves
};

export const SLIDERS = [
  ['follow', 'Follow your thumb'], ['bounce', 'Bounce on landing'], ['fling', 'Fling throw'],
  ['tilt', 'Tilt'], ['sway', 'Idle sway'], ['zoom', 'Zoom speed'], ['shadow', 'Shadow lift'], ['scan', 'Scanlines']
];

function saved() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } }
export const settings = { ...DEFAULTS, ...saved() };

const subs = new Set();
export const onSettings = fn => subs.add(fn);
export function setSetting(k, v) { settings[k] = v; subs.forEach(fn => fn(k, v)); }
export function saveDefaults() { try { localStorage.setItem(KEY, JSON.stringify(settings)); return true; } catch (e) { return false; } }
export function resetAll() { Object.keys(DEFAULTS).forEach(k => setSetting(k, DEFAULTS[k])); }
export function isSaved() { const s = saved(); return Object.keys(DEFAULTS).every(k => (k in s ? s[k] : DEFAULTS[k]) === settings[k]); }

const lerp = (a, b, t) => a + (b - a) * t;
// What the numbers mean to the physics.
export const phys = {
  get followK() { return lerp(70, 1100, settings.follow ** 1.4); },      // spring stiffness toward targets (1/s²)
  get zeta() { return settings.reduced ? 1 : lerp(1.0, 0.38, settings.bounce); }, // damping ratio: lower bounces more
  get flingTau() { return lerp(110, 800, settings.fling); },              // ms for a fling's speed to fall to a third
  get tiltDeg() { return settings.reduced ? 0 : lerp(0, 16, settings.tilt); },
  get sway() { return settings.reduced ? 0 : settings.sway; },
  get zoomK() { return lerp(60, 520, settings.zoom ** 1.2); },            // stiffness for lifting and setting down
  get shadow() { return lerp(0.3, 2.4, settings.shadow); },
  get scan() { return settings.scan; },
  get reduced() { return !!settings.reduced; }
};
