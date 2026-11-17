// JSON-Backup: Export, Import mit Validierung, interne Sicherungen.
import { tr, LOCALE } from './i18n.js';
import * as db from './storage.js';
import { DATA_VERSION, DATA_STORES } from './storage.js';
import { h, fill, sheet, icon, actionSheet, confirmDialog, alertDialog, toast, sx } from './ui.js';
import { planMerge, summarize, applyPlan } from './merge.js';
import { uid, now, BLOCK_TYPES } from './songs.js';
import { exportMedia, normMedia } from './media.js';

// Kennung im Dateiformat – bleibt trotz neuem App-Namen „Plekto“, damit alte und neue Backups kompatibel sind.
const APP_ID = 'guitar-notebook';
// Nicht exportiert: interne Zustände und der persönliche KI-Schlüssel
const PRIVATE_SETTINGS = ['dataVersion', 'seeded', 'lastBackupAt', 'aiKey', 'aiUsage', 'lastInternalBackupAt', 'lastAutoBackupAt', 'backupDir'];
// Geräte-ID und Kopplungen („sync…“) gehören zu diesem Gerät: Ein Backup darf sie nicht auf ein anderes Gerät übertragen.
// Einstellungen, die nur auf dem Gerät liegen (localStorage), wandern als ein Eintrag „devicePrefs“ mit ins Backup.
const DEVICE_PREFS = ['gn-design', 'gn-zoom','gn-statusbar', 'gn-chord-layout', 'gn-haptics', 'gn-wide', 'gn-sidebar', 'gn-tab-auto', 'gn-play-speed', 'gn-share-format', 'gn-theory-inst', 'gn-import-lyrics'];
function readDevicePrefs() {
  const out = {};
  try { for (const k of DEVICE_PREFS) { const v = localStorage.getItem(k); if (v != null) out[k] = v; } } catch { /* ohne localStorage: nichts zu sichern */ }
  return out;
}
function writeDevicePrefs(value, replace) {
  if (!value || typeof value !== 'object') return;
  try {
    if (replace) DEVICE_PREFS.forEach((k) => localStorage.removeItem(k));
    for (const k of DEVICE_PREFS) if (typeof value[k] === 'string' && (replace || localStorage.getItem(k) == null)) localStorage.setItem(k, value[k]);
  } catch { /* egal */ }
}
// Einstellungen aus einem Backup übernehmen: beim Zusammenführen nur ergänzen, beim Ersetzen überschreiben
async function restoreSettings(list, replace) {
  for (const st of list) {
    if (st.key === 'devicePrefs') writeDevicePrefs(st.value, replace);
    else if (replace || (await db.get('settings', st.key)) == null) await db.setSetting(st.key, st.value);
  }
}
const isPrivateSetting = (key) => PRIVATE_SETTINGS.includes(key) || key.startsWith('sync');

// Medien (Fotos, Aufnahmen) werden Base64-kodiert mitgesichert, sofern gewünscht.
export async function buildBackup({ media = true } = {}) {
  await db.flush();
  const data = await db.snapshot();
  const settings = (await db.getAll('settings')).filter((s) => !isPrivateSetting(s.key));
  const out = { app: APP_ID, format: DATA_VERSION, kind: 'full', exportedAt: now(), ...data, settings: [...settings, { key: 'devicePrefs', value: readDevicePrefs() }] };
  if (media) out.media = await exportMedia();
  return out;
}

export function backupBlob(backup) {
  return new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
}

export async function exportBackupFile(opts) {
  const backup = await buildBackup(opts);
  const date = backup.exportedAt.slice(0, 10);
  return { blob: backupBlob(backup), filename: tr("plekto-backup-{0}.json", date), counts: counts(backup) };
}

// Nur aufrufen, wenn die Datei tatsächlich geteilt/gesichert oder heruntergeladen wurde.
export const markFileExported = () => db.setSetting('lastBackupAt', now());

// ---------- Fester Backup-Ordner ----------
// Nur in Browsern mit File System Access API (Chrome/Edge am PC). Safari/iPhone unterstützt das nicht –
// dort bleibt der Weg über „Teilen → In Dateien sichern“. Der Ordner-Zugriff liegt nur in der lokalen Datenbank.
export const canPickFolder = () => typeof window.showDirectoryPicker === 'function';
export const getBackupFolder = () => db.getSetting('backupDir', null);
export async function pickBackupFolder() {
  const dir = await window.showDirectoryPicker({ id: 'guitar-notebook-backup', mode: 'readwrite' });
  await db.setSetting('backupDir', dir);
  return dir;
}
export const clearBackupFolder = () => db.setSetting('backupDir', null);

// Schreibt die Datei in den gewählten Ordner. Gibt den Ordnernamen zurück, oder null ohne Ordner/Berechtigung.
export async function saveToBackupFolder(blob, filename) {
  const dir = await getBackupFolder();
  if (!dir || typeof dir.getFileHandle !== 'function') return null;
  let perm = await dir.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') perm = await dir.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') return null;
  const file = await dir.getFileHandle(filename, { create: true });
  const w = await file.createWritable();
  await w.write(blob);
  await w.close();
  return dir.name;
}

// Teil-Export einzelner Songs (gleiches Format, kind = "songs"). Beim Import wird zusammengeführt.
export async function exportSongsFile(songs) {
  const out = await songsPayload(songs);
  const base = songs.length === 1 ? songs[0].title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'song' : `${songs.length}-songs`;
  return { blob: backupBlob(out), filename: tr("plekto-{0}.json", base) };
}

// Ausgewählte Songs mit allem, was dazugehört (Tabs, eigene Griffe, Ordner, optional Fotos/Aufnahmen)
export async function songsPayload(songs, { media = false } = {}) {
  await db.flush();
  const tabIds = new Set(songs.flatMap((s) => s.sections.flatMap((sec) => sec.blocks.filter((b) => b.type === 'tab' && b.tabId).map((b) => b.tabId))));
  const folderIds = new Set(songs.map((s) => s.folderId).filter(Boolean));
  const tabs = (await db.getAll('tabs')).filter((t) => tabIds.has(t.id));
  const folders = (await db.getAll('folders')).filter((f) => folderIds.has(f.id));
  // Eigene Akkorde, auf die die Songs verweisen (auch songeigene Griffe), damit sie am Ziel gleich aussehen
  const chordIds = new Set(songs.flatMap((s) => s.sections.flatMap((sec) => sec.blocks.filter((b) => b.type === 'chords').flatMap((b) => b.items.map((i) => i.chordId).filter(Boolean)))));
  const chords = (await db.getAll('chords')).filter((c) => chordIds.has(c.id));
  const out = { app: APP_ID, format: DATA_VERSION, kind: 'songs', exportedAt: now(), songs, tabs, chords, patterns: [], folders, settings: [] };
  if (media) out.media = await exportMedia(new Set(songs.map((s) => s.id)));
  return out;
}

export const counts = (d) => ({ songs: (d.songs || []).length, tabs: (d.tabs || []).length, chords: (d.chords || []).length, patterns: (d.patterns || []).length, folders: (d.folders || []).length, setlists: (d.setlists || []).length, media: d.media?.length || 0 });
export const describeCounts = (c) => tr("{0} {1}, {2} {3}, {4} {5}, {6} Anschlagmuster{7}{8}", c.songs, c.songs === 1 ? tr("Song") : tr("Songs"), c.tabs, c.tabs === 1 ? tr("Tab") : tr("Tabs"), c.chords, c.chords === 1 ? tr("eigener Akkord") : tr("eigene Akkorde"), c.patterns, c.setlists ? `, ${c.setlists} ${c.setlists === 1 ? tr("Setlist") : tr("Setlisten")}` : '', c.media ? `, ${c.media} ${c.media === 1 ? tr("Foto/Aufnahme") : tr("Fotos/Aufnahmen")}` : '');

// ---------- Validierung ----------
class Invalid extends Error {}
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const str = (v, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));
const int = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : d; };
const hasId = (v) => typeof v === 'string' && !!v.trim();
const id = (v) => (hasId(v) ? v.slice(0, 100) : uid());
// Datensätze ohne ID bekommen eine neue, werden aber markiert: Der Merge sucht dann inhaltlich nach Duplikaten.
const mark = (o, raw) => (hasId(raw.id) ? o : { ...o, _genId: true });
const iso = (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : now());

function normBlock(b) {
  if (!isObj(b) || !BLOCK_TYPES.includes(b.type)) return null;
  const out = { id: id(b.id), type: b.type };
  if (b.type === 'chords') {
    out.items = (Array.isArray(b.items) ? b.items : []).filter(isObj).map((i) => {
      const it = { id: id(i.id), name: str(i.name, 40) || '?' };
      if (typeof i.chordId === 'string') it.chordId = i.chordId;
      if (isObj(i.dur) && ['beats', 'bars'].includes(i.dur.unit)) it.dur = { n: int(i.dur.n, 1, 64, 1), unit: i.dur.unit };
      const note = str(i.note, 300);
      if (note) it.note = note;
      const rep = int(i.rep, 1, 16, 1);
      if (rep > 1) it.rep = rep;
      return it;
    });
    out.repeat = int(b.repeat, 1, 99, 1);
    const play = str(b.play, 500);
    if (play) out.play = play;
    const name = str(b.name, 60).trim();
    if (name) out.name = name;
  } else if (b.type === 'strum') {
    out.name = str(b.name, 100);
    out.grid = Number(b.grid) === 16 ? 16 : 8;
    out.strokes = normStrokes(b.strokes);
    out.repeat = int(b.repeat, 1, 99, 1);
  } else if (b.type === 'tab') {
    out.tabId = typeof b.tabId === 'string' ? b.tabId : null;
    const rep = int(b.repeat, 1, 16, 1);
    if (rep > 1) out.repeat = rep;
  } else out.text = str(b.text, 100000);
  return out;
}

const normStrokes = (a) => (Array.isArray(a) ? a : []).filter((s) => isObj(s) && ['D', 'U', 'R', 'X', 'H'].includes(s.k)).slice(0, 256).map((s) => (s.a ? { k: s.k, a: true } : { k: s.k }));

const normTags = (v) => {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  return v.map((t) => str(t, 30).replace(/^#+/, '').replace(/\s+/g, ' ').trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 20);
};
export function normSong(s) {
  if (!isObj(s)) throw new Invalid(tr("kein gültiger Datensatz"));
  if (!Array.isArray(s.sections)) throw new Invalid(tr("Abschnitte fehlen"));
  return mark({
    id: id(s.id),
    title: str(s.title, 300).trim() || tr("Ohne Titel"),
    artist: str(s.artist, 300),
    instrument: s.instrument === 'ukulele' ? 'ukulele' : 'guitar',
    tuning: str(s.tuning, 60),
    capo: int(s.capo, 0, 24, 0),
    bpm: s.bpm == null || s.bpm === '' ? null : int(s.bpm, 1, 999, null),
    timeSig: str(s.timeSig, 10),
    notes: str(s.notes, 100000),
    favorite: !!s.favorite,
    sample: !!s.sample,
    folderId: hasId(s.folderId) ? s.folderId.slice(0, 100) : null,
    ...(s.chordLayout === 'inline' || s.chordLayout === 'rows' ? { chordLayout: s.chordLayout } : {}),
    ...(int(s.transposed, -11, 11, 0) ? { transposed: int(s.transposed, -11, 11, 0) } : {}),
    ...(s.simplified === true ? { simplified: true } : {}),
    ...(s.reharmonized === true ? { reharmonized: true } : {}),
    // Schlagworte und Versionen: nur gespeichert, wenn gesetzt
    ...(normTags(s.tags).length ? { tags: normTags(s.tags) } : {}),
    ...(hasId(s.versionOf) && s.versionOf !== s.id ? { versionOf: s.versionOf.slice(0, 100) } : {}),
    ...(str(s.versionName, 40).trim() ? { versionName: str(s.versionName, 40).trim() } : {}),
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
    sections: s.sections.filter(isObj).map((sec) => ({
      id: id(sec.id),
      name: str(sec.name, 100) || tr("Abschnitt"),
      blocks: (Array.isArray(sec.blocks) ? sec.blocks : []).map(normBlock).filter(Boolean),
    })),
  }, s);
}

export function normFolder(f) {
  if (!isObj(f) || !hasId(f.id)) throw new Invalid(tr("Ordner ohne ID"));
  const name = str(f.name, 100).trim();
  if (!name) throw new Invalid(tr("Ordner ohne Namen"));
  return { id: f.id.slice(0, 100), name, createdAt: iso(f.createdAt), updatedAt: iso(f.updatedAt) };
}

function normNote(n) {
  if (!isObj(n)) return null;
  if (n.x) return { f: null, x: true };
  const f = Number(n.f);
  if (!Number.isInteger(f) || f < 0 || f > 30) return null;
  const out = { f };
  if (['h', 'p', '/', '\\'].includes(n.l)) out.l = n.l;
  if ([0.5, 1, 1.5, 2].includes(n.b)) out.b = n.b;
  if (n.v) out.v = true;
  return out;
}

export function normTab(t) {
  if (!isObj(t)) throw new Invalid(tr("kein gültiger Datensatz"));
  if (!Array.isArray(t.measures) || !t.measures.length) throw new Invalid(tr("Takte fehlen"));
  // 6 Saiten (Gitarre) oder 4 (Ukulele); maßgeblich ist der erste Takt
  const strings = t.measures[0]?.notes?.length === 4 ? 4 : 6;
  return {
    id: id(t.id),
    songId: str(t.songId, 100),
    name: str(t.name, 100) || tr("Tab"),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
    measures: t.measures.filter(isObj).slice(0, 1000).map((m) => {
      const cols = int(m.cols, 1, 64, 8);
      const notes = Array.from({ length: strings }, (_, s) => Array.from({ length: cols }, (_, c) => normNote(m.notes?.[s]?.[c])));
      const pm = Array.from({ length: cols }, (_, c) => !!m.pm?.[c]);
      const dur = Array.from({ length: cols }, (_, c) => ([1, 2, 4, 8, 16].includes(m.dur?.[c]) ? m.dur[c] : 0));
      const lr = Array.from({ length: cols }, (_, c) => !!m.lr?.[c]);
      const st = Array.from({ length: cols }, (_, c) => (['d', 'u'].includes(m.st?.[c]) ? m.st[c] : 0));
      const ch = Array.from({ length: cols }, (_, c) => str(m.ch?.[c], 40));
      return { id: id(m.id), cols, notes, pm, ...(dur.some(Boolean) ? { dur } : {}), ...(lr.some(Boolean) ? { lr } : {}), ...(st.some(Boolean) ? { st } : {}), ...(ch.some(Boolean) ? { ch } : {}) };
    }),
  };
}

export function normChord(c) {
  if (!isObj(c) || !Array.isArray(c.frets) || ![4, 6].includes(c.frets.length)) throw new Invalid(tr("ungültige Bundpositionen"));
  return mark({
    id: id(c.id),
    name: str(c.name, 40) || '?',
    frets: c.frets.map((f) => int(f, -1, 30, 0)),
    fingers: Array.from({ length: c.frets.length }, (_, i) => int(c.fingers?.[i], 0, 5, 0)),
    base: int(c.base, 1, 24, 1),
    showFingers: c.showFingers !== false,
    ...(hasId(c.songId) ? { songId: c.songId.slice(0, 100) } : {}),
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  }, c);
}

export function normPattern(p) {
  if (!isObj(p)) throw new Invalid(tr("kein gültiger Datensatz"));
  return mark({ id: id(p.id), name: str(p.name, 100) || tr("Muster"), grid: Number(p.grid) === 16 ? 16 : 8, strokes: normStrokes(p.strokes), createdAt: iso(p.createdAt), updatedAt: iso(p.updatedAt) }, p);
}

export function normSetlist(x) {
  if (!isObj(x)) throw new Invalid(tr("kein gültiger Datensatz"));
  const songIds = (Array.isArray(x.songIds) ? x.songIds : []).filter(hasId).map((v) => v.slice(0, 100)).slice(0, 1000);
  return mark({ id: id(x.id), name: str(x.name, 100).trim() || tr("Setlist"), songIds, createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt) }, x);
}

const LABELS = { songs: tr("Song"), tabs: tr("Tab"), chords: tr("Akkord"), patterns: tr("Anschlagmuster"), folders: tr("Ordner"), setlists: tr("Setlist") };
export const NORM = { songs: normSong, tabs: normTab, chords: normChord, patterns: normPattern, folders: normFolder, setlists: normSetlist };

// Prüft ein eingelesenes Backup und liefert bereinigte Daten + Warnungen. Wirft bei unbrauchbaren Dateien.
export function validateBackup(raw) {
  if (!isObj(raw)) throw new Error(tr("Die Datei enthält kein Backup-Objekt."));
  if (raw.app !== APP_ID) throw new Error(tr("Diese Datei ist kein Backup von Plekto (früher Guitar Notebook)."));
  const fmt = Number(raw.format);
  if (!Number.isInteger(fmt) || fmt < 1) throw new Error(tr("Das Datenformat des Backups ist unbekannt."));
  if (fmt > DATA_VERSION) throw new Error(tr("Das Backup stammt aus einer neueren App-Version (Datenformat {0}, diese App kennt {1}). Bitte aktualisiere zuerst die App.", fmt, DATA_VERSION));
  for (const s of DATA_STORES) if (raw[s] != null && !Array.isArray(raw[s])) throw new Error(tr("Der Bereich „{0}“ im Backup ist beschädigt.", s));
  let data = Object.fromEntries(DATA_STORES.map((s) => [s, raw[s] || []]));
  data = db.migrate(data, fmt);
  const out = {}, warnings = [];
  for (const s of DATA_STORES) {
    out[s] = [];
    const seen = new Set();
    data[s].forEach((item, i) => {
      try {
        const n = NORM[s](item);
        if (seen.has(n.id)) { n.id = uid(); n._genId = true; }
        seen.add(n.id);
        out[s].push(n);
      } catch (e) {
        warnings.push(tr("{0} Nr. {1} übersprungen: {2}", LABELS[s], i + 1, e instanceof Invalid ? e.message : 'unlesbar'));
      }
    });
  }
  const tabIds = new Set(out.tabs.map((t) => t.id));
  let missing = 0;
  out.songs.forEach((s) => s.sections.forEach((sec) => sec.blocks.forEach((b) => { if (b.type === 'tab' && b.tabId && !tabIds.has(b.tabId)) missing++; })));
  if (missing) warnings.push(tr("{0} Tab-Verweis(e) ohne Tab-Daten – diese Tabs erscheinen leer.", missing));
  if (!out.songs.length && !out.chords.length && !out.patterns.length && !out.folders.length && !out.setlists.length) throw new Error(warnings.length ? tr("Das Backup enthält keine gültigen Datensätze:\n• ") + warnings.slice(0, 5).join('\n• ') : tr("Das Backup enthält keine Songs, Akkorde oder Muster."));
  const settings = (Array.isArray(raw.settings) ? raw.settings : []).filter((x) => isObj(x) && typeof x.key === 'string' && !isPrivateSetting(x.key));
  const media = [];
  (Array.isArray(raw.media) ? raw.media : []).forEach((m, i) => {
    try { media.push(normMedia(m)); } catch (e) { warnings.push(tr("Foto/Aufnahme Nr. {0} übersprungen: {1}", i + 1, e.message)); }
  });
  return { data: out, warnings, settings, media };
}


// ---------- Import-Ablauf ----------
// Standard ist immer ein Merge: Nichts wird gelöscht, Konflikte behalten ohne Entscheidung die lokale Version.
export async function importBackupFile(file) {
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    await alertDialog(tr("Import nicht möglich"), sx(tr("Die Datei konnte nicht gelesen werden. Bitte wähle eine JSON-Datei von Plekto."), tr("Keine Plekto-Backup-Datei.")));
    return false;
  }
  return importRaw(raw, { title: tr("Import-Vorschau") });
}

// Lokale Daten nur für den Vergleich gleich bereinigen wie Importdaten (ältere Datensätze haben z. B. kein folderId).
export function normalizeExisting(existing) {
  return Object.fromEntries(DATA_STORES.map((st) => [st, (existing[st] || []).map((x) => {
    try { const n = NORM[st](x); delete n._genId; return n; } catch { return x; }
  })]));
}

const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? tr('unbekannt') : d.toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const NEWER = { import: tr("Import ist neuer"), local: tr("Lokal ist neuer"), unknown: tr("Alter unklar") };

export async function importRaw(raw, { title = tr("Import-Vorschau"), allowReplace = true } = {}) {
  let res;
  try { res = validateBackup(raw); } catch (e) { await alertDialog(tr("Import nicht möglich"), tr("{0}\n\nEs wurde nichts verändert.", e.message)); return false; }
  await db.flush();
  const existing = await db.snapshot();
  const plan = planMerge(normalizeExisting(existing), res.data);
  return new Promise((resolve) => {
    let finished = false;
    const done = (v) => { if (!finished) { finished = true; resolve(v); } };
    const body = h('div', { class: 'import-plan' });
    const draw = () => {
      const sum = summarize(plan);
      const conflicts = plan.songs.filter((e) => e.kind === 'conflict');
      const dups = plan.songs.filter((e) => e.kind === 'dup');
      const fresh = plan.songs.filter((e) => e.kind === 'new');
      const sameSongs = plan.songs.filter((e) => e.kind === 'same');
      const otherConf = [...plan.chords.map((e) => [tr("Akkord"), e]), ...plan.patterns.map((e) => [tr("Muster"), e]), ...plan.folders.map((e) => [tr("Ordner"), e]), ...plan.setlists.map((e) => [tr("Setlist"), e])].filter(([, e]) => e.kind === 'conflict');
      const hints = [...res.warnings, ...plan.notes];
      const n = (count, one, many) => (count === 1 ? `1 ${one}` : `${count} ${many}`);
      const parts = [sum.newSongs && tr('{0} neu', sum.newSongs), sum.conflicts && n(sum.conflicts, tr("Konflikt"), tr("Konflikte")), sum.dups && n(sum.dups, tr("mögliches Duplikat"), tr("mögliche Duplikate")), sum.sameSongs && tr("{0} schon vorhanden", sum.sameSongs), sum.newFolders && n(sum.newFolders, tr("neuer Ordner"), tr("neue Ordner"))].filter(Boolean);
      const CHOICE = { keep: tr("Lokal behalten"), import: tr("Import"), copy: tr("Beide behalten"), skip: tr("Überspringen"), add: tr("Hinzufügen") };
      // Eine Zeile je Eintrag; die Wahl steckt hinter einem Tipp statt hinter mehreren Knöpfen pro Song
      const choiceRow = (e, title, why, opts) => h('button', { class: 'form-row action review-row', onClick: () => actionSheet(title, opts.map((value) => ({ label: CHOICE[value], value }))).then((v) => { if (v) { e.action = v; draw(); } }) },
        h('span', { class: 'lbl' }, title, h('small', null, why)), h('span', { class: 'muted choice' }, CHOICE[e.action]), icon('chevron', 'small chev'));
      const group = (head, rows, foot) => rows.length > 0 && [h('div', { class: 'form-label' }, head), h('div', { class: 'form-group' }, rows), foot && h('p', { class: 'form-foot' }, foot)];
      const nameRow = (title, sub) => h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, title, sub && h('small', null, sub)));
      fill(body,
        h('p', { class: 'sync-summary' }, parts.join(', ') || tr("Nichts Neues in dieser Datei")),
        h('p', { class: 'form-foot' }, tr("Datei vom {0}. Songs, die nicht darin stehen, bleiben unverändert. Vorher entsteht eine interne Sicherung.", fmtDate(raw.exportedAt))),
        sum.importNewer > 0 && h('button', { class: 'btn small', style: 'margin:0 0 12px', onClick: () => { conflicts.forEach((e) => { if (e.newer === 'import') e.action = 'import'; }); draw(); } }, tr("{0} neuere Versionen übernehmen", sum.importNewer)),
        group(tr("Konflikte"), conflicts.map((e) => choiceRow(e, e.inc.title, tr("{0} · lokal {1}", NEWER[e.newer], fmtDate(e.local.updatedAt)), ['keep', 'import', 'copy'])), tr("„Import“ ersetzt die lokale Version, „Beide behalten“ legt den Import als Kopie an.")),
        group(tr("Mögliche Duplikate"), dups.map((e) => choiceRow(e, e.inc.title, tr("Ähnlich wie „{0}“", e.local.title), ['skip', 'add']))),
        group(tr("Weitere Konflikte"), otherConf.map(([kind, e]) => choiceRow(e, `${kind}: ${e.inc.name}`, NEWER[e.newer], ['keep', 'import']))),
        fresh.length > 0 && h('details', { class: 'disclosure' + (fresh.length <= 5 ? ' open-default' : ''), open: fresh.length <= 5 },
          h('summary', null, fresh.length === 1 ? tr("1 neuer Song") : tr("{0} neue Songs", fresh.length)),
          h('div', { class: 'form-group' }, fresh.map((e) => nameRow(e.inc.title, e.inc.artist)))),
        group(tr("Neue Setlisten"), plan.setlists.filter((e) => e.kind === 'new').map((e) => nameRow(e.inc.name, tr("{0} Songs", e.inc.songIds.length)))),
        hints.length > 0 && h('details', { class: 'disclosure' }, h('summary', null, `${hints.length} ${hints.length === 1 ? tr("Hinweis") : tr("Hinweise")}`),
          h('div', { class: 'form-group' }, hints.slice(0, 30).map((w) => nameRow(w)))),
        allowReplace && h('div', { class: 'form-group', style: 'margin-top:18px' },
          h('button', { class: 'form-row action danger', onClick: () => replaceAll() }, h('span', { class: 'action-label' }, tr("Sonderaktion: Alles ersetzen …")))));
      void sameSongs;
    };

    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      const { writes, songIdMap, stats } = applyPlan(plan, new Set(existing.tabs.map((t) => t.id)));
      try {
        if (DATA_STORES.some((st) => existing[st].length)) await db.addBackup(tr("Vor {0}", title), existing);
        if (writes.length) await db.putMany(writes);
        // Einstellungen nur ergänzen, nie überschreiben
        await restoreSettings(res.settings, false);
        let mediaAdded = 0;
        const known = new Set((await db.getAll('media')).map((m) => m.id));
        for (const m of res.media) {
          const target = songIdMap.has(m.songId) ? songIdMap.get(m.songId) : m.songId;
          if (!target || known.has(m.id)) continue;
          await db.put('media', target === m.songId ? m : { ...m, id: 'm' + uid(), songId: target });
          mediaAdded++;
        }
        done(true);
        sheetCtl.close();
        await alertDialog(tr("Import abgeschlossen"), [
          tr("{0} hinzugefügt", stats.added), tr("{0} durch Import ersetzt", stats.replaced), tr("{0} als Kopie angelegt", stats.copied),
          tr("{0} übersprungen (identisch/Duplikat)", stats.skipped), tr("{0} Konflikte: lokale Version behalten", stats.kept),
          mediaAdded ? tr("{0} Fotos/Aufnahmen ergänzt", mediaAdded) : '', res.warnings.length ? tr("{0} ungültige Datensätze übersprungen", res.warnings.length) : '',
        ].filter(Boolean).join('\n'));
      } catch (e) {
        await alertDialog(tr("Import fehlgeschlagen"), sx(tr("Die Daten konnten nicht gespeichert werden ({0}). Es wurde nichts gelöscht; der vorherige Stand liegt in den internen Sicherungen.", e.message || e), tr('{0}. Nichts gelöscht.', e.message || e)));
      } finally { busy = false; }
    };

    const replaceAll = async () => {
      const cur = counts(existing), inc = counts(res.data);
      const lost = existing.songs.filter((s) => !res.data.songs.some((x) => x.id === s.id)).length;
      if (!(await confirmDialog(tr("Alle Daten ersetzen?"), tr("Sonderaktion – kein Zusammenführen!\n\nAktuell: {0}\nNachher: {1}\n\n{2} lokale {3} in der Datei und {4} entfernt. Vorher wird eine interne Sicherung angelegt.", describeCounts(cur), describeCounts(inc), lost, lost === 1 ? tr("Song fehlt") : tr("Songs fehlen"), lost === 1 ? 'wird' : 'werden'), { ok: tr("Weiter"), destructive: true }))) return;
      if (!(await confirmDialog(tr("Wirklich ersetzen?"), sx(tr("Tipp: Exportiere vorher zusätzlich ein Backup als Datei (Einstellungen → Backup als Datei sichern)."), tr("Vorher ein Backup als Datei sichern.")), { ok: tr("Endgültig ersetzen"), destructive: true }))) return;
      try {
        await db.addBackup(tr("Vor {0} (Ersetzen)", title), existing);
        const clean = Object.fromEntries(DATA_STORES.map((st) => [st, res.data[st].map((x) => { const c = { ...x }; delete c._genId; return c; })]));
        await db.replaceData(clean);
        await restoreSettings(res.settings, true);
        for (const m of res.media) await db.put('media', m);
        done(true);
        sheetCtl.close();
        toast(sx(tr("Daten ersetzt – vorheriger Stand liegt in den internen Sicherungen."), tr("Daten ersetzt")), 3500);
      } catch (e) {
        await alertDialog(tr("Ersetzen fehlgeschlagen"), `${e.message || e}. Der vorherige Stand liegt in den internen Sicherungen.`);
      }
    };

    const sheetCtl = sheet({ title, body, full: true, left: { label: tr("Abbrechen") }, right: { label: tr("Importieren"), bold: true, onClick: run }, onClose: () => done(false) });
    draw();
  });
}

// Interne Sicherung: standardmäßig ebenfalls als Merge, „Alles ersetzen“ nur als Sonderaktion
export function restoreInternalBackup(b) {
  const raw = { app: APP_ID, format: b.dataVersion || DATA_VERSION, kind: 'full', exportedAt: b.createdAt, ...b.data, settings: [] };
  return importRaw(raw, { title: tr("Wiederherstellung") });
}

export function internalBackupFile(b) {
  const backup = { app: APP_ID, format: b.dataVersion || DATA_VERSION, kind: 'full', exportedAt: b.createdAt, ...b.data, settings: [] };
  return { blob: backupBlob(backup), filename: tr("plekto-sicherung-{0}.json", b.createdAt.slice(0, 10)) };
}

// Automatische interne Sicherung höchstens einmal pro Tag (liegt im selben Gerätespeicher!)
export async function autoBackup() {
  try {
    const last = await db.getSetting('lastAutoBackupAt');
    if (last && Date.now() - Date.parse(last) < 20 * 3600e3) return;
    const snap = await db.snapshot();
    if (!snap.songs.length) return;
    await db.addBackup(tr("Automatisch (täglich)"), snap);
    await db.setSetting('lastAutoBackupAt', now());
  } catch (e) { console.warn('Automatische Sicherung fehlgeschlagen', e); }
}

// ---------- Ordner-Reparatur ----------
// Fügt nur Ordner hinzu bzw. setzt die Ordner-Zuordnung von Songs ohne Ordner – löscht und überschreibt nie Inhalte.
const freeName = (name, taken) => {
  let n = name, i = 2;
  while (taken.has(n.trim().toLowerCase())) n = `${name} (${i++})`;
  taken.add(n.trim().toLowerCase());
  return n;
};

// Beim Start: Songs verweisen auf Ordner, die fehlen → aus den internen Sicherungen zurückholen
export async function repairMissingFolders() {
  const songs = await db.getAll('songs'), folders = await db.getAll('folders');
  const have = new Set(folders.map((f) => f.id));
  const missing = [...new Set(songs.map((s) => s.folderId).filter((id) => id && !have.has(id)))];
  if (!missing.length) return 0;
  const found = new Map();
  for (const b of await db.listBackups()) for (const f of b.data?.folders || []) if (missing.includes(f.id) && !found.has(f.id)) found.set(f.id, f);
  const taken = new Set(folders.map((f) => f.name.trim().toLowerCase()));
  let unnamed = 0;
  const writes = missing.map((id) => {
    let f = null;
    try { f = found.has(id) ? normFolder(found.get(id)) : null; } catch { f = null; }
    const t = now();
    // Ohne Sicherung: Ordner unter neutralem Namen anlegen, damit die Songs zusammenbleiben
    if (!f) f = { id, name: tr("Wiederhergestellter Ordner {0}", ++unnamed), createdAt: t, updatedAt: t };
    return ['folders', { ...f, name: freeName(f.name, taken) }];
  });
  await db.putMany(writes);
  return writes.length;
}

// Was eine interne Sicherung an Ordnern zurückbringen würde
export async function folderRestorePlan(b) {
  const songs = await db.getAll('songs'), folders = await db.getAll('folders');
  const byId = new Map(folders.map((f) => [f.id, f]));
  const byName = new Map(folders.map((f) => [f.name.trim().toLowerCase(), f]));
  const map = new Map(), add = [];
  for (const raw of b.data?.folders || []) {
    let f;
    try { f = normFolder(raw); } catch { continue; }
    const local = byId.get(f.id) || byName.get(f.name.trim().toLowerCase());
    if (local) map.set(f.id, local.id);
    else { map.set(f.id, f.id); add.push(f); byName.set(f.name.trim().toLowerCase(), f); }
  }
  const old = new Map((b.data?.songs || []).map((s) => [s.id, s.folderId]));
  const known = new Set([...byId.keys(), ...add.map((f) => f.id)]);
  // Nur Songs, die jetzt in keinem (vorhandenen) Ordner liegen
  const moves = songs.filter((s) => (!s.folderId || !byId.has(s.folderId)) && map.has(old.get(s.id)) && known.has(map.get(old.get(s.id))) && s.folderId !== map.get(old.get(s.id)))
    .map((s) => ({ song: s, folderId: map.get(old.get(s.id)) }));
  return { add, moves };
}

export async function applyFolderRestore(plan) {
  await db.flush();
  await db.addBackup(tr("Vor Ordner-Wiederherstellung"));
  await db.putMany([
    ...plan.add.map((f) => ['folders', f]),
    ...plan.moves.map(({ song, folderId }) => ['songs', { ...song, folderId, updatedAt: now() }]),
  ]);
}
