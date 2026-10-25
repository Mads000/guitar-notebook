// JSON-Backup: Export, Import mit Validierung, interne Sicherungen.
import * as db from './storage.js';
import { DATA_VERSION, DATA_STORES } from './storage.js';
import { dialog, confirmDialog, alertDialog, toast } from './ui.js';
import { uid, now, BLOCK_TYPES } from './songs.js';
import { exportMedia, normMedia } from './media.js';

const APP_ID = 'guitar-notebook';
// Nicht exportiert: interne Zustände und der persönliche KI-Schlüssel
const PRIVATE_SETTINGS = ['dataVersion', 'seeded', 'lastBackupAt', 'aiKey'];

// Medien (Fotos, Aufnahmen) werden Base64-kodiert mitgesichert, sofern gewünscht.
export async function buildBackup({ media = true } = {}) {
  await db.flush();
  const data = await db.snapshot();
  const settings = (await db.getAll('settings')).filter((s) => !PRIVATE_SETTINGS.includes(s.key));
  const out = { app: APP_ID, format: DATA_VERSION, exportedAt: now(), ...data, settings };
  if (media) out.media = await exportMedia();
  return out;
}

export function backupBlob(backup) {
  return new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
}

export async function exportBackupFile(opts) {
  const backup = await buildBackup(opts);
  await db.setSetting('lastBackupAt', backup.exportedAt);
  const date = backup.exportedAt.slice(0, 10);
  return { blob: backupBlob(backup), filename: `guitar-notebook-backup-${date}.json`, counts: counts(backup) };
}

export const counts = (d) => ({ songs: d.songs.length, tabs: d.tabs.length, chords: d.chords.length, patterns: d.patterns.length, media: d.media?.length || 0 });
export const describeCounts = (c) => `${c.songs} ${c.songs === 1 ? 'Song' : 'Songs'}, ${c.tabs} ${c.tabs === 1 ? 'Tab' : 'Tabs'}, ${c.chords} ${c.chords === 1 ? 'eigener Akkord' : 'eigene Akkorde'}, ${c.patterns} Anschlagmuster${c.media ? `, ${c.media} ${c.media === 1 ? 'Foto/Aufnahme' : 'Fotos/Aufnahmen'}` : ''}`;

// ---------- Validierung ----------
class Invalid extends Error {}
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const str = (v, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));
const int = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : d; };
const id = (v) => (typeof v === 'string' && v.trim() ? v.slice(0, 100) : uid());
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
  return {
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
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
    sections: s.sections.filter(isObj).map((sec) => ({
      id: id(sec.id),
      name: str(sec.name, 100) || 'Abschnitt',
      blocks: (Array.isArray(sec.blocks) ? sec.blocks : []).map(normBlock).filter(Boolean),
    })),
  };
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
  return {
    id: id(c.id),
    name: str(c.name, 40) || '?',
    frets: c.frets.map((f) => int(f, -1, 30, 0)),
    fingers: Array.from({ length: c.frets.length }, (_, i) => int(c.fingers?.[i], 0, 5, 0)),
    base: int(c.base, 1, 24, 1),
    showFingers: c.showFingers !== false,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

export function normPattern(p) {
  if (!isObj(p)) throw new Invalid('kein gültiger Datensatz');
  return { id: id(p.id), name: str(p.name, 100) || 'Muster', grid: Number(p.grid) === 16 ? 16 : 8, strokes: normStrokes(p.strokes), createdAt: iso(p.createdAt), updatedAt: iso(p.updatedAt) };
}

const LABELS = { songs: 'Song', tabs: 'Tab', chords: 'Akkord', patterns: 'Anschlagmuster' };
const NORM = { songs: normSong, tabs: normTab, chords: normChord, patterns: normPattern };

// Prüft ein eingelesenes Backup und liefert bereinigte Daten + Warnungen. Wirft bei unbrauchbaren Dateien.
export function validateBackup(raw) {
  if (!isObj(raw)) throw new Error('Die Datei enthält kein Backup-Objekt.');
  if (raw.app !== APP_ID) throw new Error('Diese Datei ist kein Backup von Guitar Notebook.');
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
        if (seen.has(n.id)) n.id = uid();
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
  if (!out.songs.length && !out.chords.length && !out.patterns.length) throw new Error('Das Backup enthält keine Songs, Akkorde oder Muster.');
  const settings = (Array.isArray(raw.settings) ? raw.settings : []).filter((x) => isObj(x) && typeof x.key === 'string' && !PRIVATE_SETTINGS.includes(x.key));
  const media = [];
  (Array.isArray(raw.media) ? raw.media : []).forEach((m, i) => {
    try { media.push(normMedia(m)); } catch (e) { warnings.push(`Foto/Aufnahme Nr. ${i + 1} übersprungen: ${e.message}`); }
  });
  return { data: out, warnings, settings, media };
}

// ---------- Import-Ablauf ----------
export async function importBackupFile(file) {
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    await alertDialog('Import nicht möglich', 'Die Datei konnte nicht gelesen werden. Bitte wähle eine JSON-Backup-Datei von Guitar Notebook.');
    return false;
  }
  let res;
  try { res = validateBackup(raw); } catch (e) { await alertDialog('Import nicht möglich', e.message); return false; }

  const existing = await db.snapshot();
  const hasExisting = DATA_STORES.some((s) => existing[s].length);
  const incoming = counts({ ...res.data, media: res.media });
  const msg = `Backup vom ${raw.exportedAt ? new Date(raw.exportedAt).toLocaleString('de-DE') : 'unbekanntem Datum'}:\n${describeCounts(incoming)}`
    + (res.warnings.length ? `\n\nHinweise:\n• ${res.warnings.slice(0, 6).join('\n• ')}${res.warnings.length > 6 ? `\n• … und ${res.warnings.length - 6} weitere` : ''}` : '');

  const mode = hasExisting
    ? await dialog({
      title: 'Backup importieren', message: msg + '\n\nWie soll importiert werden?', stacked: true,
      buttons: [
        { label: 'Zusammenführen', value: 'merge', style: 'bold' },
        { label: 'Alles ersetzen', value: 'replace', style: 'danger' },
        { label: 'Abbrechen', value: null },
      ],
    })
    : ((await confirmDialog('Backup importieren', msg, { ok: 'Importieren' })) ? 'replace' : null);
  if (!mode) return false;

  if (mode === 'merge') {
    const ids = Object.fromEntries(DATA_STORES.map((s) => [s, new Set(existing[s].map((x) => x.id))]));
    const conflicts = DATA_STORES.reduce((a, s) => a + res.data[s].filter((x) => ids[s].has(x.id)).length, 0);
    if (conflicts && !(await confirmDialog('Vorhandene Einträge überschreiben?', `${conflicts} ${conflicts === 1 ? 'Eintrag existiert' : 'Einträge existieren'} bereits und ${conflicts === 1 ? 'wird' : 'werden'} durch die Version aus dem Backup ersetzt. Alle anderen Daten bleiben erhalten.\nVorher wird automatisch eine interne Sicherung angelegt.`, { ok: 'Überschreiben', destructive: true }))) return false;
  } else if (hasExisting) {
    if (!(await confirmDialog('Alle Daten ersetzen?', `Deine aktuellen Daten (${describeCounts(counts(existing))}) werden durch das Backup ersetzt.\nVorher wird automatisch eine interne Sicherung angelegt, die du in den Einstellungen wiederherstellen kannst.`, { ok: 'Ersetzen', destructive: true }))) return false;
  }

  try {
    if (hasExisting) await db.addBackup(mode === 'merge' ? 'Vor Import (Zusammenführen)' : 'Vor Import (Ersetzen)', existing);
    if (mode === 'merge') await db.putMany(DATA_STORES.flatMap((s) => res.data[s].map((x) => [s, x])));
    else await db.replaceData(res.data);
    for (const s of res.settings) await db.setSetting(s.key, s.value);
    // Medien werden ergänzt bzw. aktualisiert, aber nie pauschal gelöscht.
    for (const m of res.media) await db.put('media', m);
  } catch (e) {
    await alertDialog('Import fehlgeschlagen', `Die Daten konnten nicht gespeichert werden (${e.message || e}). Deine bisherigen Daten sind unverändert bzw. in den internen Sicherungen verfügbar.`);
    return false;
  }
  toast(`Import abgeschlossen: ${incoming.songs} ${incoming.songs === 1 ? 'Song' : 'Songs'}`);
  return true;
}

export async function restoreInternalBackup(b) {
  if (!(await confirmDialog('Sicherung wiederherstellen?', `Stand vom ${new Date(b.createdAt).toLocaleString('de-DE')} (${b.reason}).\n${describeCounts(counts(b.data))}\n\nDie aktuellen Daten werden vorher ebenfalls gesichert.`, { ok: 'Wiederherstellen', destructive: true }))) return false;
  const current = await db.snapshot();
  await db.addBackup('Vor Wiederherstellung', current);
  const data = db.migrate(b.data, b.dataVersion || DATA_VERSION);
  await db.replaceData(data);
  toast('Sicherung wiederhergestellt');
  return true;
}

export function internalBackupFile(b) {
  const backup = { app: APP_ID, format: b.dataVersion || DATA_VERSION, exportedAt: b.createdAt, ...b.data, settings: [] };
  return { blob: backupBlob(backup), filename: `guitar-notebook-sicherung-${b.createdAt.slice(0, 10)}.json` };
}
