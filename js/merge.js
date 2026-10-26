// Sicherer Merge-Import: vergleicht bereinigte Importdaten mit dem lokalen Bestand und plant Änderungen.
// Grundregeln: Fehlende Datensätze im Import bedeuten NIE „löschen“. Gleiche ID + anderer Inhalt = Konflikt,
// der standardmäßig die lokale Version behält. Ohne Browser-Abhängigkeiten, damit er sich isoliert testen lässt.

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const VOLATILE = new Set(['createdAt', 'updatedAt', '_genId']);
const ID_KEYS = new Set(['id', 'createdAt', 'updatedAt', '_genId', 'chordId', 'songId', 'folderId', 'favorite', 'sample']);

// Kanonisches JSON (sortierte Schlüssel, ohne die angegebenen Felder)
function canon(v, drop) {
  if (Array.isArray(v)) return '[' + v.map((x) => canon(x, drop)).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter((k) => !drop.has(k) && v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k], drop)).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}
const same = (a, b) => canon(a, VOLATILE) === canon(b, VOLATILE);
const time = (o) => { const t = Date.parse(o?.updatedAt); return Number.isFinite(t) ? t : 0; };
export const songKey = (s) => [s.title, s.artist].map((x) => String(x || '').toLowerCase().replace(/\(kopie\)|\(import\)/g, '').replace(/[^\p{L}\p{N}]+/gu, '')).join('|');
const tabRefs = (song) => song.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'tab' && b.tabId).map((b) => b.tabId));

// Inhaltlicher Fingerabdruck eines Songs inkl. Tabs, unabhängig von IDs und Zeitstempeln
function fingerprint(song, tabsById) {
  const s = JSON.parse(JSON.stringify(song));
  for (const sec of s.sections) for (const b of sec.blocks) if (b.type === 'tab') { b.tab = tabsById.get(b.tabId)?.measures || null; delete b.tabId; }
  return canon(s, ID_KEYS);
}
const OTHER_FP = { chords: (c) => canon({ name: c.name, frets: c.frets, base: c.base, scope: c.songId || '' }, ID_KEYS), patterns: (p) => canon({ name: p.name, grid: p.grid, strokes: p.strokes }, ID_KEYS) };

const STORES = ['songs', 'tabs', 'chords', 'patterns', 'folders', 'setlists'];
const setFp = (x) => canon({ name: String(x.name || '').trim().toLowerCase(), songs: x.songIds || [] }, ID_KEYS);

// existing / incoming: { songs, tabs, chords, patterns, folders, setlists }
export function planMerge(existing, incoming) {
  const ex = Object.fromEntries(STORES.map((s) => [s, existing[s] || []]));
  const inc = Object.fromEntries(STORES.map((s) => [s, incoming[s] || []]));
  const exTabs = new Map(ex.tabs.map((t) => [t.id, t]));
  const incTabs = new Map(inc.tabs.map((t) => [t.id, t]));
  const notes = [];

  // ---- Ordner: per ID, sonst per Name zuordnen (keine doppelten Ordner) ----
  const exFolders = new Map(ex.folders.map((f) => [f.id, f]));
  const byName = new Map(ex.folders.map((f) => [f.name.trim().toLowerCase(), f]));
  const folderMap = new Map();
  const folders = [];
  for (const f of inc.folders) {
    const local = exFolders.get(f.id);
    if (local) {
      folderMap.set(f.id, local.id);
      folders.push({ kind: same(local, f) ? 'same' : 'conflict', inc: f, local, newer: newer(f, local), action: 'keep' });
      continue;
    }
    const named = byName.get(f.name.trim().toLowerCase());
    if (named) { folderMap.set(f.id, named.id); folders.push({ kind: 'same', inc: f, local: named, action: 'skip' }); continue; }
    folderMap.set(f.id, f.id);
    byName.set(f.name.trim().toLowerCase(), f);
    folders.push({ kind: 'new', inc: f, action: 'add' });
  }

  // ---- Songs (jeweils zusammen mit ihren Tabs) ----
  const exSongs = new Map(ex.songs.map((s) => [s.id, s]));
  const exByKey = new Map();
  for (const s of ex.songs) { const k = songKey(s); if (!exByKey.has(k)) exByKey.set(k, []); exByKey.get(k).push(s); }
  const exFp = new Map(ex.songs.map((s) => [s.id, fingerprint(s, exTabs)]));
  const usedTabs = new Set();
  const songs = [];
  for (const raw of inc.songs) {
    const s = { ...raw };
    if (s.folderId) {
      const mapped = folderMap.get(s.folderId) ?? (exFolders.has(s.folderId) ? s.folderId : null);
      if (mapped == null) notes.push(`„${s.title}“: unbekannter Ordner – Song landet ohne Ordner.`);
      s.folderId = mapped;
    }
    const tabs = tabRefs(s).map((id) => incTabs.get(id)).filter(Boolean);
    tabs.forEach((t) => usedTabs.add(t.id));
    const local = !s._genId ? exSongs.get(s.id) : null;
    if (local) {
      const lTabs = tabRefs(local).map((id) => exTabs.get(id)).filter(Boolean);
      const equal = same(local, s) && tabs.length === lTabs.length && tabs.every((t) => { const l = exTabs.get(t.id); return l && same(l, t); });
      if (equal) { songs.push({ kind: 'same', inc: s, tabs, local, action: 'skip' }); continue; }
      const it = Math.max(time(s), ...tabs.map(time)), lt = Math.max(time(local), ...lTabs.map(time));
      songs.push({ kind: 'conflict', inc: s, tabs, local, newer: it > lt ? 'import' : lt > it ? 'local' : 'unknown', action: 'keep' });
      continue;
    }
    const fp = fingerprint(s, incTabs);
    const twin = ex.songs.find((x) => exFp.get(x.id) === fp);
    if (twin) { songs.push({ kind: 'same', inc: s, tabs, local: twin, action: 'skip' }); continue; }
    const similar = exByKey.get(songKey(s));
    if (similar?.length) { songs.push({ kind: 'dup', inc: s, tabs, local: similar[0], action: 'skip' }); continue; }
    songs.push({ kind: 'new', inc: s, tabs, action: 'add' });
  }
  const strayTabs = inc.tabs.filter((t) => !usedTabs.has(t.id)).length;
  if (strayTabs) notes.push(`${strayTabs} Tab(s) ohne zugehörigen Song übersprungen.`);

  // ---- Eigene Akkorde und Anschlagmuster ----
  const other = {};
  for (const store of ['chords', 'patterns']) {
    const map = new Map(ex[store].map((x) => [x.id, x]));
    const fps = new Set(ex[store].map(OTHER_FP[store]));
    other[store] = inc[store].map((x) => {
      const local = !x._genId ? map.get(x.id) : null;
      if (local) return same(local, x) ? { kind: 'same', inc: x, local, action: 'skip' } : { kind: 'conflict', inc: x, local, newer: newer(x, local), action: 'keep' };
      if (fps.has(OTHER_FP[store](x))) return { kind: 'same', inc: x, action: 'skip' };
      return { kind: 'new', inc: x, action: 'add' };
    });
  }
  // ---- Setlisten: per ID, sonst gleicher Name mit gleichen Songs = bereits vorhanden ----
  const exSets = new Map(ex.setlists.map((x) => [x.id, x]));
  const setFps = new Set(ex.setlists.map(setFp));
  const setlists = inc.setlists.map((x) => {
    const local = !x._genId ? exSets.get(x.id) : null;
    if (local) return same(local, x) ? { kind: 'same', inc: x, local, action: 'skip' } : { kind: 'conflict', inc: x, local, newer: newer(x, local), action: 'keep' };
    if (setFps.has(setFp(x))) return { kind: 'same', inc: x, action: 'skip' };
    return { kind: 'new', inc: x, action: 'add' };
  });
  return { songs, folders, chords: other.chords, patterns: other.patterns, setlists, notes };
}
const newer = (a, b) => (time(a) > time(b) ? 'import' : time(b) > time(a) ? 'local' : 'unknown');

// Zählt die Einträge je Kategorie (für die Vorschau)
export function summarize(plan) {
  const c = (arr, k) => arr.filter((x) => x.kind === k).length;
  return {
    newSongs: c(plan.songs, 'new'), sameSongs: c(plan.songs, 'same'), conflicts: c(plan.songs, 'conflict'), dups: c(plan.songs, 'dup'),
    importNewer: plan.songs.filter((x) => x.kind === 'conflict' && x.newer === 'import').length,
    newFolders: c(plan.folders, 'new'), folderConflicts: c(plan.folders, 'conflict'),
    newOther: c(plan.chords, 'new') + c(plan.patterns, 'new') + c(plan.setlists || [], 'new'),
    otherConflicts: c(plan.chords, 'conflict') + c(plan.patterns, 'conflict') + c(plan.setlists || [], 'conflict'),
  };
}

// Setzt den Plan in Schreibvorgänge um. Es wird nie etwas gelöscht.
// Rückgabe: { writes: [[store, obj]], songIdMap: Map(importId → lokaleId|null), stats }
export function applyPlan(plan, existingTabIds = new Set()) {
  const writes = [], songIdMap = new Map();
  const stats = { added: 0, replaced: 0, copied: 0, skipped: 0, kept: 0 };
  const strip = (o) => { const c = { ...o }; delete c._genId; return c; };
  const takenTabs = new Set(existingTabIds);
  for (const f of plan.folders) {
    if (f.action === 'add' || f.action === 'import') writes.push(['folders', strip(f.inc)]);
  }
  for (const e of plan.songs) {
    const s = strip(e.inc);
    if (e.action === 'skip' || e.action === 'keep') {
      songIdMap.set(e.inc.id, e.local ? e.local.id : null);
      if (e.action === 'keep') stats.kept++; else stats.skipped++;
      continue;
    }
    if (e.action === 'copy' || (e.action === 'add' && e.tabs.some((t) => takenTabs.has(t.id)))) {
      // Als eigenständige Kopie: neue IDs für Song und Tabs, Original bleibt unberührt
      const id = rid();
      const remap = new Map();
      for (const t of e.tabs) { const nt = { ...strip(t), id: rid(), songId: id }; remap.set(t.id, nt.id); takenTabs.add(nt.id); writes.push(['tabs', nt]); }
      const copy = JSON.parse(JSON.stringify(s));
      copy.id = id;
      if (e.action === 'copy') copy.title += ' (Import)';
      for (const sec of copy.sections) for (const b of sec.blocks) if (b.type === 'tab' && b.tabId) b.tabId = remap.get(b.tabId) || null;
      writes.push(['songs', copy]);
      songIdMap.set(e.inc.id, id);
      if (e.action === 'copy') stats.copied++; else stats.added++;
      continue;
    }
    // add (neu) oder import (bewusst gewählte Importversion ersetzt die lokale)
    for (const t of e.tabs) { writes.push(['tabs', { ...strip(t), songId: s.id }]); takenTabs.add(t.id); }
    writes.push(['songs', s]);
    songIdMap.set(e.inc.id, s.id);
    if (e.action === 'import') stats.replaced++; else stats.added++;
  }
  for (const store of ['chords', 'patterns']) {
    for (const e of plan[store]) if (e.action === 'add' || e.action === 'import') writes.push([store, strip(e.inc)]);
  }
  // Song-Verweise der Setlisten auf die lokalen IDs umstellen (z. B. wenn ein Song als Kopie angelegt wurde)
  for (const e of plan.setlists || []) {
    if (e.action !== 'add' && e.action !== 'import') continue;
    const ids = e.inc.songIds.map((id) => (songIdMap.has(id) ? songIdMap.get(id) : id)).filter(Boolean);
    writes.push(['setlists', { ...strip(e.inc), songIds: [...new Set(ids)] }]);
  }
  return { writes, songIdMap, stats };
}
