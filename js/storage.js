// Lokale Datenspeicherung.
// App-Code liegt ausschließlich im Service-Worker-Cache, alle Nutzerdaten ausschließlich hier in IndexedDB.
// Zusätzlich schützt ein kleines Journal in localStorage Änderungen, die noch nicht in IndexedDB angekommen sind
// (z. B. wenn iOS die App im Hintergrund beendet).

const DB_NAME = 'guitar-notebook';
// Struktur der Datenbank (Object Stores). v2: Store „media“ für Fotos und Audioaufnahmen. v3: Store „folders“. v4: „setlists“.
const DB_VERSION = 4;
export const DATA_VERSION = 1; // Format der gespeicherten Datensätze
export const DATA_STORES = ['songs', 'tabs', 'chords', 'patterns', 'folders', 'setlists'];
// Medien (große Binärdaten) liegen getrennt und werden nicht in interne Sicherungen kopiert.
const STORES = [...DATA_STORES, 'settings', 'backups', 'media'];
const JOURNAL = 'gn-journal:';
const MAX_BACKUPS = 10;

let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Dieser Browser unterstützt keine lokale Datenbank (IndexedDB).'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Nur fehlende Stores anlegen – vorhandene Daten bleiben bei jedem Upgrade unberührt.
        for (const name of STORES) {
          if (db.objectStoreNames.contains(name)) continue;
          const os = db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
          if (name === 'media') os.createIndex('songId', 'songId');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        db.onclose = () => { dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
      req.onblocked = () => console.warn('IndexedDB-Upgrade wartet auf andere geöffnete Fenster');
    });
  }
  return dbPromise;
}

// Führt eine Transaktion aus. iOS trennt die DB-Verbindung gelegentlich nach längerem Hintergrund –
// dann wird einmal neu verbunden.
async function run(stores, mode, fn, retry = true) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let result;
      const r = fn(t);
      if (r && typeof r === 'object' && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Speichervorgang abgebrochen'));
    });
  } catch (e) {
    if (retry && (e?.name === 'InvalidStateError' || /connection|closing|closed/i.test(e?.message || ''))) {
      dbPromise = null;
      return run(stores, mode, fn, false);
    }
    throw e;
  }
}

export const get = (store, key) => run(store, 'readonly', (t) => t.objectStore(store).get(key));
export const getAll = (store) => run(store, 'readonly', (t) => t.objectStore(store).getAll()).then((r) => r || []);
export const put = (store, obj) => run(store, 'readwrite', (t) => { t.objectStore(store).put(obj); });
export const del = (store, key) => run(store, 'readwrite', (t) => { t.objectStore(store).delete(key); });
export const getAllByIndex = (store, index, key) => run(store, 'readonly', (t) => t.objectStore(store).index(index).getAll(key)).then((r) => r || []);
export const getKeysByIndex = (store, index, key) => run(store, 'readonly', (t) => t.objectStore(store).index(index).getAllKeys(key)).then((r) => r || []);

// Mehrere Schreibvorgänge in einer atomaren Transaktion: [[store, obj], ...]
export function putMany(entries) {
  const stores = [...new Set(entries.map((e) => e[0]))];
  if (!stores.length) return Promise.resolve();
  return run(stores, 'readwrite', (t) => { for (const [s, o] of entries) t.objectStore(s).put(o); });
}

// Mehrere Löschvorgänge: [[store, key], ...]
export function deleteMany(entries) {
  for (const [s, k] of entries) cancelPending(s, k);
  const stores = [...new Set(entries.map((e) => e[0]))];
  if (!stores.length) return Promise.resolve();
  return run(stores, 'readwrite', (t) => { for (const [s, k] of entries) t.objectStore(s).delete(k); });
}

// Ersetzt alle Nutzerdaten atomar (Import „Alles ersetzen“, Migration).
export function replaceData(data) {
  for (const key of [...queue.keys()]) { clearTimeout(queue.get(key).timer); queue.delete(key); }
  journalClearAll();
  emit();
  return run(DATA_STORES, 'readwrite', (t) => {
    for (const s of DATA_STORES) {
      const os = t.objectStore(s);
      os.clear();
      for (const o of data[s] || []) os.put(o);
    }
  });
}

export async function snapshot() {
  const out = {};
  for (const s of DATA_STORES) out[s] = await getAll(s);
  return out;
}

// ---------- Einstellungen ----------
export async function getSetting(key, fallback = null) {
  const r = await get('settings', key);
  return r ? r.value : fallback;
}
export const setSetting = (key, value) => put('settings', { key, value });

// ---------- Autosave-Warteschlange ----------
const queue = new Map(); // "store:id" -> { store, obj, timer }
let inflight = 0;
let failure = null;
const listeners = new Set();

export function saveStatus() {
  if (failure) return 'error';
  return queue.size || inflight ? 'saving' : 'saved';
}
export const lastError = () => failure;

export function onSaveStatus(fn) {
  listeners.add(fn);
  fn(saveStatus());
  return () => listeners.delete(fn);
}
function emit() {
  const s = saveStatus();
  for (const fn of listeners) fn(s);
}

const jKey = (store, id) => JOURNAL + store + ':' + id;
function journalWrite(store, obj) { try { localStorage.setItem(jKey(store, obj.id), JSON.stringify(obj)); } catch { /* Speicher voll – IndexedDB bleibt maßgeblich */ } }
function journalClear(store, id) { try { localStorage.removeItem(jKey(store, id)); } catch { /* ignorieren */ } }
function journalKeys() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(JOURNAL)) out.push(k); } } catch { /* ignorieren */ }
  return out;
}
function journalClearAll() { for (const k of journalKeys()) { try { localStorage.removeItem(k); } catch { /* ignorieren */ } } }

// Merkt eine Änderung vor: sofort im Journal, kurz danach in IndexedDB.
export function saveLater(store, obj, delay = 400) {
  const key = store + ':' + obj.id;
  journalWrite(store, obj);
  const prev = queue.get(key);
  if (prev) clearTimeout(prev.timer);
  queue.set(key, { store, obj, timer: setTimeout(() => commit(key), delay) });
  emit();
}

async function commit(key) {
  const item = queue.get(key);
  if (!item) return;
  clearTimeout(item.timer);
  queue.delete(key);
  inflight++;
  emit();
  try {
    await put(item.store, item.obj);
    failure = null;
    if (!queue.has(key)) journalClear(item.store, item.obj.id);
  } catch (e) {
    console.error('Speichern fehlgeschlagen', e);
    failure = e;
    if (!queue.has(key)) queue.set(key, { ...item, timer: setTimeout(() => commit(key), 2500) });
  } finally {
    inflight--;
    emit();
  }
}

// Schreibt alle vorgemerkten Änderungen sofort.
export async function flush() {
  await Promise.all([...queue.keys()].map(commit));
  for (let i = 0; inflight && i < 250; i++) await new Promise((r) => setTimeout(r, 20));
  return saveStatus();
}

function cancelPending(store, id) {
  const key = store + ':' + id;
  const item = queue.get(key);
  if (item) { clearTimeout(item.timer); queue.delete(key); emit(); }
  journalClear(store, id);
}

export async function removeNow(store, id) {
  cancelPending(store, id);
  await del(store, id);
}

// Stellt Änderungen wieder her, die vor einem Absturz nur im Journal landeten.
async function recoverJournal() {
  let n = 0;
  for (const k of journalKeys()) {
    const store = k.slice(JOURNAL.length).split(':')[0];
    try {
      const obj = JSON.parse(localStorage.getItem(k));
      if (STORES.includes(store) && obj && obj.id) { await put(store, obj); n++; }
      localStorage.removeItem(k);
    } catch (e) { console.warn('Journal-Eintrag nicht wiederherstellbar', k, e); }
  }
  return n;
}

// ---------- Interne Sicherungen ----------
export async function addBackup(reason, data, dataVersion = DATA_VERSION) {
  const b = { id: 'b' + Date.now().toString(36), createdAt: new Date().toISOString(), reason, dataVersion, data: data || await snapshot() };
  await put('backups', b);
  await setSetting('lastInternalBackupAt', b.createdAt);
  const all = (await getAll('backups')).sort((a, c) => c.createdAt.localeCompare(a.createdAt));
  for (const old of all.slice(MAX_BACKUPS)) await del('backups', old.id);
  return b;
}
export const listBackups = async () => (await getAll('backups')).sort((a, c) => c.createdAt.localeCompare(a.createdAt));

// ---------- Datenmigration ----------
// Jede Funktion migriert Daten von Version n auf n + 1. Beispiel für eine künftige Version 2:
//   1: (data) => { data.songs.forEach((s) => { s.key ??= ''; }); return data; },
const MIGRATIONS = {};

export function migrate(data, from) {
  let v = from;
  while (v < DATA_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) throw new Error(`Keine Migration von Datenformat ${v} auf ${v + 1} vorhanden.`);
    data = fn(data);
    v++;
  }
  return data;
}

export async function initStorage() {
  await openDB();
  const recovered = await recoverJournal();
  const stored = await getSetting('dataVersion', null);
  let migrated = false, migrationError = null;
  if (stored == null) {
    await setSetting('dataVersion', DATA_VERSION);
  } else if (stored < DATA_VERSION) {
    const snap = await snapshot();
    await addBackup(`Vor Datenmigration v${stored} → v${DATA_VERSION}`, snap, stored);
    try {
      // Erst vollständig migrieren, dann in einer Transaktion ersetzen – bei einem Fehler bleibt alles unverändert.
      const next = migrate(JSON.parse(JSON.stringify(snap)), stored);
      await replaceData(next);
      await setSetting('dataVersion', DATA_VERSION);
      migrated = true;
    } catch (e) {
      console.error('Datenmigration fehlgeschlagen', e);
      migrationError = e;
    }
  }
  let persisted = false;
  try { persisted = navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { /* nicht unterstützt */ }
  return { recovered, migrated, migrationError, persisted, newerData: stored != null && stored > DATA_VERSION };
}

// Beim Verlassen, Wechseln oder Schließen der App sofort schreiben.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', () => { flush(); });
