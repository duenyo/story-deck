// Save to Drive: a Word copy of the manuscript and a full backup, in a "Story Deck" folder in your Drive.
// Each save replaces the same two files, so Drive's own version history keeps the earlier ones.
import { driveToken, dropDriveToken } from './firebase.js';
import { manuscriptDocx, backup } from '../export.js';

const API = 'https://www.googleapis.com/drive/v3', UP = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'Story Deck';
const qs = s => encodeURIComponent(s);
const quote = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

async function call(token, url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  if (r.status === 401) { dropDriveToken(); throw Object.assign(new Error('Drive needs you to sign in again'), { code: 'drive-auth' }); }
  if (!r.ok) throw new Error('Drive said ' + r.status + ': ' + (await r.text()).slice(0, 160));
  return r.json();
}
async function folderId(token) {
  const q = `name=${quote(FOLDER)} and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await call(token, `${API}/files?q=${qs(q)}&fields=files(id)&spaces=drive`);
  if (found.files && found.files.length) return found.files[0].id;
  const made = await call(token, `${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) });
  return made.id;
}
async function putFile(token, parent, name, blob) {
  const q = `name=${quote(name)} and ${quote(parent)} in parents and trashed=false`;
  const found = await call(token, `${API}/files?q=${qs(q)}&fields=files(id)&spaces=drive`);
  const id = found.files && found.files.length ? found.files[0].id : null;
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(id ? { name } : { name, parents: [parent] })], { type: 'application/json' }));
  form.append('file', blob, name);
  return call(token, id ? `${UP}/files/${id}?uploadType=multipart&fields=id,webViewLink` : `${UP}/files?uploadType=multipart&fields=id,webViewLink`, { method: id ? 'PATCH' : 'POST', body: form });
}

export async function saveToDrive(deckId) {
  const token = await driveToken();
  const parent = await folderId(token);
  const doc = await manuscriptDocx(deckId);
  const file = await putFile(token, parent, doc.name, doc.blob);
  const b = backup();
  await putFile(token, parent, 'Story Deck backup.json', new Blob([b.text], { type: 'application/json' }));
  return { name: doc.name, link: file.webViewLink };
}
