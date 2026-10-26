// JSON-Backup: Export, Import mit Validierung, interne Sicherungen.
import * as db from './storage.js';
import { DATA_VERSION, DATA_STORES } from './storage.js';
import { h, sheet, segmented, confirmDialog, alertDialog, toast } from './ui.js';
import { planMerge, summarize, applyPlan } from './merge.js';
import { uid, now, BLOCK_TYPES } from './songs.js';
import { exportMedia, normMedia } from './media.js';

// Kennung im Dateiformat – bleibt trotz neuem App-Namen „Sorell“, damit alte und neue Backups kompatibel sind.
const APP_ID = 'guitar-notebook';
// Nicht exportiert: interne Zustände und der persönliche KI-Schlüssel
const PRIVATE_SETTINGS = ['dataVersion', 'seeded', 'lastBackupAt', 'aiKey', 'aiUsage', 'lastInternalBackupAt', 'lastAutoBackupAt', 'backupDir'];

// Medien (Fotos, Aufnahmen) werden Base64-kodiert mitgesichert, sofern gewünscht.
export async function buildBackup({ media = true } = {}) {
  await db.flush();
  const data = await db.snapshot();
  const settings = (await db.getAll('settings')).filter((s) => !PRIVATE_SETTINGS.includes(s.key));
  const out = { app: APP_ID, format: DATA_VERSION, kind: 'full', exportedAt: now(), ...data, settings };
  if (media) out.media = await exportMedia();
  return out;
}

export function backupBlob(backup) {
  return new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
}

export async function exportBackupFile(opts) {
  const backup = await buildBackup(opts);
  const date = backup.exportedAt.slice(0, 10);
  return { blob: backupBlob(backup), filename: `sorell-backup-${date}.json`, counts: counts(backup) };
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
  await db.flush();
  const tabIds = new Set(songs.flatMap((s) => s.sections.flatMap((sec) => sec.blocks.filter((b) => b.type === 'tab' && b.tabId).map((b) => b.tabId))));
  const folderIds = new Set(songs.map((s) => s.folderId).filter(Boolean));
  const tabs = (await db.getAll('tabs')).filter((t) => tabIds.has(t.id));
  const folders = (await db.getAll('folders')).filter((f) => folderIds.has(f.id));
  // Eigene Akkorde, auf die die Songs verweisen (auch songeigene Griffe), damit sie am Ziel gleich aussehen
  const chordIds = new Set(songs.flatMap((s) => s.sections.flatMap((sec) => sec.blocks.filter((b) => b.type === 'chords').flatMap((b) => b.items.map((i) => i.chordId).filter(Boolean)))));
  const chords = (await db.getAll('chords')).filter((c) => chordIds.has(c.id));
  const out = { app: APP_ID, format: DATA_VERSION, kind: 'songs', exportedAt: now(), songs, tabs, chords, patterns: [], folders, settings: [] };
  const base = songs.length === 1 ? songs[0].title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'song' : `${songs.length}-songs`;
  return { blob: backupBlob(out), filename: `sorell-${base}.json` };
}

export const counts = (d) => ({ songs: (d.songs || []).length, tabs: (d.tabs || []).length, chords: (d.chords || []).length, patterns: (d.patterns || []).length, folders: (d.folders || []).length, media: d.media?.length || 0 });
export const describeCounts = (c) => `${c.songs} ${c.songs === 1 ? 'Song' : 'Songs'}, ${c.tabs} ${c.tabs === 1 ? 'Tab' : 'Tabs'}, ${c.chords} ${c.chords === 1 ? 'eigener Akkord' : 'eigene Akkorde'}, ${c.patterns} Anschlagmuster${c.media ? `, ${c.media} ${c.media === 1 ? 'Foto/Aufnahme' : 'Fotos/Aufnahmen'}` : ''}`;

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
      return it;
    });
    out.repeat = int(b.repeat, 1, 99, 1);
  } else if (b.type === 'strum') {
    out.name = str(b.name, 100);
    out.grid = Number(b.grid) === 16 ? 16 : 8;
    out.strokes = normStrokes(b.strokes);
    out.repeat = int(b.repeat, 1, 99, 1);
  } else if (b.type === 'tab') {
    out.tabId = typeof b.tabId === 'string' ? b.tabId : null;
  } else out.text = str(b.text, 100000);
  return out;
}

const normStrokes = (a) => (Array.isArray(a) ? a : []).filter((s) => isObj(s) && ['D', 'U', 'R', 'X'].includes(s.k)).slice(0, 256).map((s) => (s.a ? { k: s.k, a: true } : { k: s.k }));

export function normSong(s) {
  if (!isObj(s)) throw new Invalid('kein gültiger Datensatz');
  if (!Array.isArray(s.sections)) throw new Invalid('Abschnitte fehlen');
  return mark({
    id: id(s.id),
    title: str(s.title, 300).trim() || 'Ohne Titel',
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
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
    sections: s.sections.filter(isObj).map((sec) => ({
      id: id(sec.id),
      name: str(sec.name, 100) || 'Abschnitt',
      blocks: (Array.isArray(sec.blocks) ? sec.blocks : []).map(normBlock).filter(Boolean),
    })),
  }, s);
}

export function normFolder(f) {
  if (!isObj(f) || !hasId(f.id)) throw new Invalid('Ordner ohne ID');
  const name = str(f.name, 100).trim();
  if (!name) throw new Invalid('Ordner ohne Namen');
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
  if (!isObj(t)) throw new Invalid('kein gültiger Datensatz');
  if (!Array.isArray(t.measures) || !t.measures.length) throw new Invalid('Takte fehlen');
  // 6 Saiten (Gitarre) oder 4 (Ukulele); maßgeblich ist der erste Takt
  const strings = t.measures[0]?.notes?.length === 4 ? 4 : 6;
  return {
    id: id(t.id),
    songId: str(t.songId, 100),
    name: str(t.name, 100) || 'Tab',
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
    measures: t.measures.filter(isObj).slice(0, 1000).map((m) => {
      const cols = int(m.cols, 1, 64, 8);
      const notes = Array.from({ length: strings }, (_, s) => Array.from({ length: cols }, (_, c) => normNote(m.notes?.[s]?.[c])));
      const pm = Array.from({ length: cols }, (_, c) => !!m.pm?.[c]);
      return { id: id(m.id), cols, notes, pm };
    }),
  };
}

export function normChord(c) {
  if (!isObj(c) || !Array.isArray(c.frets) || ![4, 6].includes(c.frets.length)) throw new Invalid('ungültige Bundpositionen');
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
  if (!isObj(p)) throw new Invalid('kein gültiger Datensatz');
  return mark({ id: id(p.id), name: str(p.name, 100) || 'Muster', grid: Number(p.grid) === 16 ? 16 : 8, strokes: normStrokes(p.strokes), createdAt: iso(p.createdAt), updatedAt: iso(p.updatedAt) }, p);
}

const LABELS = { songs: 'Song', tabs: 'Tab', chords: 'Akkord', patterns: 'Anschlagmuster', folders: 'Ordner' };
const NORM = { songs: normSong, tabs: normTab, chords: normChord, patterns: normPattern, folders: normFolder };

// Prüft ein eingelesenes Backup und liefert bereinigte Daten + Warnungen. Wirft bei unbrauchbaren Dateien.
export function validateBackup(raw) {
  if (!isObj(raw)) throw new Error('Die Datei enthält kein Backup-Objekt.');
  if (raw.app !== APP_ID) throw new Error('Diese Datei ist kein Backup von Sorell (früher Guitar Notebook).');
  const fmt = Number(raw.format);
  if (!Number.isInteger(fmt) || fmt < 1) throw new Error('Das Datenformat des Backups ist unbekannt.');
  if (fmt > DATA_VERSION) throw new Error(`Das Backup stammt aus einer neueren App-Version (Datenformat ${fmt}, diese App kennt ${DATA_VERSION}). Bitte aktualisiere zuerst die App.`);
  for (const s of DATA_STORES) if (raw[s] != null && !Array.isArray(raw[s])) throw new Error(`Der Bereich „${s}“ im Backup ist beschädigt.`);
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
        warnings.push(`${LABELS[s]} Nr. ${i + 1} übersprungen: ${e instanceof Invalid ? e.message : 'unlesbar'}`);
      }
    });
  }
  const tabIds = new Set(out.tabs.map((t) => t.id));
  let missing = 0;
  out.songs.forEach((s) => s.sections.forEach((sec) => sec.blocks.forEach((b) => { if (b.type === 'tab' && b.tabId && !tabIds.has(b.tabId)) missing++; })));
  if (missing) warnings.push(`${missing} Tab-Verweis(e) ohne Tab-Daten – diese Tabs erscheinen leer.`);
  if (!out.songs.length && !out.chords.length && !out.patterns.length && !out.folders.length) throw new Error(warnings.length ? 'Das Backup enthält keine gültigen Datensätze:\n• ' + warnings.slice(0, 5).join('\n• ') : 'Das Backup enthält keine Songs, Akkorde oder Muster.');
  const settings = (Array.isArray(raw.settings) ? raw.settings : []).filter((x) => isObj(x) && typeof x.key === 'string' && !PRIVATE_SETTINGS.includes(x.key));
  const media = [];
  (Array.isArray(raw.media) ? raw.media : []).forEach((m, i) => {
    try { media.push(normMedia(m)); } catch (e) { warnings.push(`Foto/Aufnahme Nr. ${i + 1} übersprungen: ${e.message}`); }
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
    await alertDialog('Import nicht möglich', 'Die Datei konnte nicht gelesen werden. Bitte wähle eine JSON-Datei von Sorell.');
    return false;
  }
  return importRaw(raw, { title: 'Import-Vorschau' });
}

// Lokale Daten nur für den Vergleich gleich bereinigen wie Importdaten (ältere Datensätze haben z. B. kein folderId).
export function normalizeExisting(existing) {
  return Object.fromEntries(DATA_STORES.map((st) => [st, (existing[st] || []).map((x) => {
    try { const n = NORM[st](x); delete n._genId; return n; } catch { return x; }
  })]));
}

const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? 'unbekannt' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const NEWER = { import: 'Import ist neuer', local: 'Lokale Version ist neuer', unknown: 'Nicht feststellbar, welche neuer ist' };

export async function importRaw(raw, { title = 'Import-Vorschau', allowReplace = true } = {}) {
  let res;
  try { res = validateBackup(raw); } catch (e) { await alertDialog('Import nicht möglich', `${e.message}\n\nEs wurde nichts verändert.`); return false; }
  await db.flush();
  const existing = await db.snapshot();
  const plan = planMerge(normalizeExisting(existing), res.data);
  return new Promise((resolve) => {
    let finished = false;
    const done = (v) => { if (!finished) { finished = true; resolve(v); } };
    const body = h('div', { class: 'import-plan' });
    const draw = () => {
      const sum = summarize(plan);
      const stat = (n, label, cls = '') => h('div', { class: 'ipl-stat ' + cls }, h('b', null, String(n)), h('span', null, label));
      const seg = (e, opts) => segmented(opts, e.action, (v) => { e.action = v; });
      const songRow = (e, extra) => h('li', { class: 'ipl-row' },
        h('div', { class: 'ipl-title' }, e.inc.title, e.inc.artist && h('small', null, ' · ' + e.inc.artist)),
        extra);
      const list = (head, items, render, foot) => items.length > 0 && h('section', { class: 'ipl-sec' },
        h('div', { class: 'form-label' }, head), h('ul', { class: 'ipl-list' }, items.map(render)), foot && h('p', { class: 'form-foot' }, foot));
      const conflicts = plan.songs.filter((e) => e.kind === 'conflict');
      const dups = plan.songs.filter((e) => e.kind === 'dup');
      const fresh = plan.songs.filter((e) => e.kind === 'new');
      const sameSongs = plan.songs.filter((e) => e.kind === 'same');
      const otherConf = [...plan.chords.map((e) => ['Akkord', e]), ...plan.patterns.map((e) => ['Muster', e]), ...plan.folders.map((e) => ['Ordner', e])].filter(([, e]) => e.kind === 'conflict');
      const hints = [...res.warnings, ...plan.notes];
      body.replaceChildren(
        h('p', { class: 'hint' }, `Datei vom ${fmtDate(raw.exportedAt)}${raw.kind === 'songs' ? ' (Teil-Export einzelner Songs)' : ''}. Songs, die nicht in der Datei stehen, bleiben unverändert erhalten.`),
        h('div', { class: 'ipl-stats' },
          stat(sum.newSongs, 'neue Songs', 'ok'), stat(sum.sameSongs, 'bereits vorhanden'), stat(sum.conflicts, 'geändert / Konflikt', sum.conflicts ? 'warn' : ''),
          stat(sum.dups, 'mögliche Duplikate', sum.dups ? 'warn' : ''), stat(sum.newFolders, 'neue Ordner'), stat(hints.length, 'ungültig / Hinweise', res.warnings.length ? 'warn' : '')),
        sum.importNewer > 0 && h('button', { class: 'btn small', style: 'margin:4px 0 8px', onClick: () => { conflicts.forEach((e) => { if (e.newer === 'import') e.action = 'import'; }); draw(); } }, `Alle ${sum.importNewer} neueren Import-Versionen übernehmen`),
        list('Konflikte – gleicher Song, anderer Inhalt', conflicts, (e) => songRow(e, h('div', null,
          h('div', { class: 'ipl-sub ' + (e.newer === 'local' ? 'warn' : '') }, `${NEWER[e.newer]} · lokal ${fmtDate(e.local.updatedAt)} · Import ${fmtDate(e.inc.updatedAt)}`),
          seg(e, [{ value: 'keep', label: 'Lokal behalten' }, { value: 'import', label: 'Import' }, { value: 'copy', label: 'Beide' }]))),
        'Standard: lokale Version behalten. „Import“ ersetzt die lokale Version, „Beide“ legt den Import als Kopie an.'),
        list('Mögliche Duplikate (anderer Datensatz, gleicher Titel)', dups, (e) => songRow(e, h('div', null,
          h('div', { class: 'ipl-sub' }, `Ähnlich wie vorhandener Song „${e.local.title}“`),
          seg(e, [{ value: 'skip', label: 'Überspringen' }, { value: 'add', label: 'Trotzdem hinzufügen' }]))), 'Wird nie automatisch zusammengeführt.'),
        list('Weitere Konflikte', otherConf, ([kind, e]) => h('li', { class: 'ipl-row' },
          h('div', { class: 'ipl-title' }, `${kind}: ${e.inc.name}`), h('div', { class: 'ipl-sub' }, NEWER[e.newer]),
          seg(e, [{ value: 'keep', label: 'Lokal behalten' }, { value: 'import', label: 'Import' }]))),
        list('Neue Songs', fresh, (e) => songRow(e, null)),
        sameSongs.length > 0 && h('p', { class: 'form-foot' }, `${sameSongs.length} ${sameSongs.length === 1 ? 'Song ist' : 'Songs sind'} bereits identisch vorhanden und ${sameSongs.length === 1 ? 'wird' : 'werden'} übersprungen.`),
        hints.length > 0 && h('section', { class: 'ipl-sec' }, h('div', { class: 'form-label' }, 'Übersprungen / Hinweise'),
          h('ul', { class: 'ipl-list' }, hints.slice(0, 30).map((w) => h('li', { class: 'ipl-row ipl-sub' }, w)))),
        h('p', { class: 'form-foot' }, 'Vor dem Import wird automatisch eine interne Sicherung des aktuellen Stands angelegt.'),
        allowReplace && h('div', { class: 'form-group', style: 'margin-top:18px' },
          h('button', { class: 'action-row danger', onClick: () => replaceAll() }, h('span', { class: 'lbl' }, 'Sonderaktion: Alles ersetzen …'))));
    };

    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      const { writes, songIdMap, stats } = applyPlan(plan, new Set(existing.tabs.map((t) => t.id)));
      try {
        if (DATA_STORES.some((st) => existing[st].length)) await db.addBackup(`Vor ${title}`, existing);
        if (writes.length) await db.putMany(writes);
        // Einstellungen nur ergänzen, nie überschreiben
        for (const st of res.settings) if ((await db.get('settings', st.key)) == null) await db.setSetting(st.key, st.value);
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
        await alertDialog('Import abgeschlossen', [
          `${stats.added} hinzugefügt`, `${stats.replaced} durch Import ersetzt`, `${stats.copied} als Kopie angelegt`,
          `${stats.skipped} übersprungen (identisch/Duplikat)`, `${stats.kept} Konflikte: lokale Version behalten`,
          mediaAdded ? `${mediaAdded} Fotos/Aufnahmen ergänzt` : '', res.warnings.length ? `${res.warnings.length} ungültige Datensätze übersprungen` : '',
        ].filter(Boolean).join('\n'));
      } catch (e) {
        await alertDialog('Import fehlgeschlagen', `Die Daten konnten nicht gespeichert werden (${e.message || e}). Es wurde nichts gelöscht; der vorherige Stand liegt in den internen Sicherungen.`);
      } finally { busy = false; }
    };

    const replaceAll = async () => {
      const cur = counts(existing), inc = counts(res.data);
      const lost = existing.songs.filter((s) => !res.data.songs.some((x) => x.id === s.id)).length;
      if (!(await confirmDialog('Alle Daten ersetzen?', `Sonderaktion – kein Zusammenführen!\n\nAktuell: ${describeCounts(cur)}\nNachher: ${describeCounts(inc)}\n\n${lost} lokale ${lost === 1 ? 'Song fehlt' : 'Songs fehlen'} in der Datei und ${lost === 1 ? 'wird' : 'werden'} entfernt. Vorher wird eine interne Sicherung angelegt.`, { ok: 'Weiter', destructive: true }))) return;
      if (!(await confirmDialog('Wirklich ersetzen?', 'Tipp: Exportiere vorher zusätzlich ein Backup als Datei (Einstellungen → Backup als Datei sichern).', { ok: 'Endgültig ersetzen', destructive: true }))) return;
      try {
        await db.addBackup(`Vor ${title} (Ersetzen)`, existing);
        const clean = Object.fromEntries(DATA_STORES.map((st) => [st, res.data[st].map((x) => { const c = { ...x }; delete c._genId; return c; })]));
        await db.replaceData(clean);
        for (const st of res.settings) await db.setSetting(st.key, st.value);
        for (const m of res.media) await db.put('media', m);
        done(true);
        sheetCtl.close();
        toast('Daten ersetzt – vorheriger Stand liegt in den internen Sicherungen.', 3500);
      } catch (e) {
        await alertDialog('Ersetzen fehlgeschlagen', `${e.message || e}. Der vorherige Stand liegt in den internen Sicherungen.`);
      }
    };

    const sheetCtl = sheet({ title, body, full: true, left: { label: 'Abbrechen' }, right: { label: 'Importieren', bold: true, onClick: run }, onClose: () => done(false) });
    draw();
  });
}

// Interne Sicherung: standardmäßig ebenfalls als Merge, „Alles ersetzen“ nur als Sonderaktion
export function restoreInternalBackup(b) {
  const raw = { app: APP_ID, format: b.dataVersion || DATA_VERSION, kind: 'full', exportedAt: b.createdAt, ...b.data, settings: [] };
  return importRaw(raw, { title: 'Wiederherstellung' });
}

export function internalBackupFile(b) {
  const backup = { app: APP_ID, format: b.dataVersion || DATA_VERSION, kind: 'full', exportedAt: b.createdAt, ...b.data, settings: [] };
  return { blob: backupBlob(backup), filename: `sorell-sicherung-${b.createdAt.slice(0, 10)}.json` };
}

// Automatische interne Sicherung höchstens einmal pro Tag (liegt im selben Gerätespeicher!)
export async function autoBackup() {
  try {
    const last = await db.getSetting('lastAutoBackupAt');
    if (last && Date.now() - Date.parse(last) < 20 * 3600e3) return;
    const snap = await db.snapshot();
    if (!snap.songs.length) return;
    await db.addBackup('Automatisch (täglich)', snap);
    await db.setSetting('lastAutoBackupAt', now());
  } catch (e) { console.warn('Automatische Sicherung fehlgeschlagen', e); }
}
