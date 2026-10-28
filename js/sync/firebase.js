// Firebase, loaded only once you sign in (it's big): Google sign-in, the synced database,
// and a short-lived pass to save files in your Google Drive.
import { FIREBASE } from './config.js';

let fb = null, auth = null, db = null, loading = null;
export function load() {
  if (!loading) loading = (async () => {
    fb = await import('../../vendor/firebase.js');
    const app = fb.initializeApp(FIREBASE);
    auth = fb.initializeAuth(app, { persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence], popupRedirectResolver: fb.browserPopupRedirectResolver });
    db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
    return fb;
  })();
  return loading;
}
export const loaded = () => !!fb;

export async function onUser(cb) { await load(); return fb.onAuthStateChanged(auth, cb); }
export async function signIn() {
  await load();
  const p = new fb.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return fb.signInWithPopup(auth, p);
}
export async function signOut() { await load(); dropDriveToken(); return fb.signOut(auth); }
export const currentUser = () => (auth && auth.currentUser) || null;

// The synced database, as the small interface sync.js uses.
export function backend(uid) {
  const ref = (name, id) => fb.doc(db, 'users', uid, name, id);
  return {
    uid,
    listen(name, cb, onError) {
      return fb.onSnapshot(fb.collection(db, 'users', uid, name), snap => {
        cb(snap.docChanges().map(ch => ({ type: ch.type, id: ch.doc.id, data: ch.doc.data(), pending: ch.doc.metadata.hasPendingWrites })), snap.metadata.fromCache);
      }, onError);
    },
    put: (name, id, data) => fb.setDoc(ref(name, id), data),
    del: (name, id) => fb.deleteDoc(ref(name, id))
  };
}

// Drive: a pass that only reaches files Story Deck itself makes. Google makes these last an hour,
// so Save to Drive asks again (a quick pop-up) when it's run out.
let drive = { token: null, until: 0 };
export async function driveToken() {
  if (drive.token && Date.now() < drive.until) return drive.token;
  await load();
  const p = new fb.GoogleAuthProvider();
  p.addScope('https://www.googleapis.com/auth/drive.file');
  const u = auth.currentUser;
  if (u && u.email) p.setCustomParameters({ login_hint: u.email });
  const res = u ? await fb.reauthenticateWithPopup(u, p) : await fb.signInWithPopup(auth, p);
  const cred = fb.GoogleAuthProvider.credentialFromResult(res);
  if (!cred || !cred.accessToken) throw new Error('Google didn’t grant Drive access');
  drive = { token: cred.accessToken, until: Date.now() + 50 * 60 * 1000 };
  return drive.token;
}
export function dropDriveToken() { drive = { token: null, until: 0 }; }
