// The sync lamp, signing in and out, and Save to Drive, as buttons and messages.
import * as sync from './sync.js';
import { toast } from '../hud.js';

let fbMod = null, watching = false;
const fbLoad = () => fbMod || (fbMod = import('./firebase.js'));
const $ = id => document.getElementById(id);

const LABEL = { off: 'Sign in to sync', connecting: 'Connecting…', synced: 'Synced', saving: 'Saving…', offline: 'Offline · saved here', error: 'Sync problem' };
const lampState = s => s.mode === 'on' ? (!s.online ? 'offline' : s.pending ? 'saving' : 'synced') : s.mode;

function renderLamps(s) {
  const st = lampState(s);
  document.querySelectorAll('[data-sync-lamp]').forEach(el => {
    el.dataset.state = st;
    const l = el.querySelector('.lamp-label'); if (l) l.textContent = LABEL[st] || st;
    el.title = s.email ? 'Signed in as ' + s.email : 'Sign in with Google to sync your decks';
  });
  const who = $('sync-who'); if (who) who.textContent = s.email ? 'Signed in as ' + s.email : 'Not signed in';
  document.querySelectorAll('[data-sync-out]').forEach(b => { b.hidden = s.mode === 'off'; });
  document.querySelectorAll('[data-sync-in]').forEach(b => { b.hidden = s.mode !== 'off'; });
}

async function watchUser() {
  if (watching) return;
  watching = true;
  const fb = await fbLoad();
  await fb.onUser(user => { if (user) sync.start(fb.backend(user.uid), user.email); else sync.signedOut(); });
}

export function initSyncUi() {
  sync.onSyncState(renderLamps);
  if (sync.wantsSync()) watchUser().catch(e => console.warn('Sync couldn’t start', e));
}
// Load the sign-in code ahead of a tap, so Google's window opens right away.
export const warmUp = () => fbLoad().then(fb => fb.load()).catch(() => {});

export async function signIn() {
  try {
    const fb = await fbLoad();
    await fb.signIn();
    await watchUser();
    toast('Signed in. Your decks will sync on every device you sign in on.');
  } catch (e) { toast(why(e, 'Couldn’t sign in')); }
}
export async function signOut() {
  const fb = await fbLoad();
  await fb.signOut();
  sync.signedOut();
  toast('Signed out. Everything stays saved on this device.');
}
export function lampClick(pop) {
  const s = sync.syncState();
  if (s.mode === 'off') { signIn(); return; }
  if (s.mode === 'error') toast('Sync problem: ' + (s.error || 'unknown') + '. Your words are still saved on this device.', { ms: 7000 });
  if (pop) pop.hidden = !pop.hidden;
}

export async function saveToDrive(deckId) {
  toast('Saving to Drive…', { ms: 30000 });
  try {
    const drive = await import('./drive.js');
    const r = await drive.saveToDrive(deckId);
    watchUser();
    toast('Saved to Drive: Story Deck / ' + r.name, { action: r.link ? 'Open' : null, onAction: () => window.open(r.link, '_blank', 'noopener'), ms: 9000 });
  } catch (e) { console.error(e); toast(why(e, 'Couldn’t save to Drive'), { ms: 8000 }); }
}

function why(e, lead) {
  const code = (e && e.code) || '';
  if (code === 'auth/popup-blocked') return 'Your browser blocked Google’s window. Tap again and allow pop-ups for this site.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return lead + ': the Google window was closed';
  if (code === 'auth/user-mismatch') return 'Pick the same Google account you sync with';
  if (code === 'auth/network-request-failed') return lead + ': no connection right now';
  if (code === 'drive-auth') return 'Drive asked to sign in again. Tap Save to Drive once more.';
  return lead + ': ' + ((e && e.message) || e);
}
