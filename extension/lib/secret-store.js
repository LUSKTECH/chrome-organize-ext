// Encrypted-at-rest secret storage for the extension (e.g. the OpenAI API key).
//
// - The AES-GCM key is generated NON-EXTRACTABLE and kept in IndexedDB, so its
//   raw bytes can never be read back — even by our own code — only used to
//   encrypt/decrypt. Shared across the service worker and the side panel (same
//   extension origin).
// - Ciphertext lives in chrome.storage.LOCAL (never storage.sync), so secrets are
//   device-local and never replicated across the user's browsers.
//
// This meets the Chrome Web Store "encrypt sensitive data at rest (AES)" bar
// while keeping the key out of storage.sync. It does NOT defend against code
// running inside the extension origin (there is no XSS sink here) — for that,
// use the host-side env var instead.
import { encryptWith, decryptWith } from './crypto-box.js';

const DB_NAME = 'browser-organizer';
const STORE = 'keys';
const KEY_ID = 'secretKey';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, id) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function idbPut(db, value, id) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function getCryptoKey() {
  const db = await openDb();
  const existing = await idbGet(db, KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false /* non-extractable */, ['encrypt', 'decrypt']);
  await idbPut(db, key, KEY_ID);
  return key;
}

export async function setSecret(name, plaintext) {
  if (!plaintext) return clearSecret(name);
  const blob = await encryptWith(await getCryptoKey(), plaintext);
  const { secrets = {} } = await chrome.storage.local.get('secrets');
  secrets[name] = blob;
  await chrome.storage.local.set({ secrets });
}

export async function getSecret(name) {
  const { secrets = {} } = await chrome.storage.local.get('secrets');
  const blob = secrets[name];
  if (!blob) return '';
  try { return await decryptWith(await getCryptoKey(), blob); }
  catch { return ''; } // key rotated / corrupt blob — treat as absent
}

export async function clearSecret(name) {
  const { secrets = {} } = await chrome.storage.local.get('secrets');
  if (!(name in secrets)) return;
  delete secrets[name];
  await chrome.storage.local.set({ secrets });
}

export async function hasSecret(name) {
  const { secrets = {} } = await chrome.storage.local.get('secrets');
  return Boolean(secrets[name]);
}
