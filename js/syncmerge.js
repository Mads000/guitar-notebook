// Sync-Logik ohne Browser-Abhängigkeiten: vergleicht zwei Geräte mit ihrem gemeinsamen letzten Stand (Basis).
//
// Regeln je Datensatz:
//   Nur das andere Gerät hat geändert → übernehmen.   Nur ich habe geändert → behalten und senden.
//   Beide haben geändert → Song feiner zusammenführen: Titel, Favorit, Ordner … einzeln, der Inhalt je Abschnitt.
//   Rückfrage nur, wenn beide denselben Teil verschieden geändert haben (Favorit und Ordner: die neuere Änderung gilt).
//   Löschen: In der Basis, aber auf einem Gerät nicht mehr da → dort gelöscht. Hat das andere Gerät ihn seither
//   geändert, wird nachgefragt. Ohne Basis (erster Sync) entscheidet der gemerkte Löschzeitpunkt (Tombstone).
//
// Die Basis speichert nur Prüfsummen, nie Inhalte. Für die Entscheidung genügt die Frage „Hat sich das seither geändert?“.
import { canon, fingerprint } from './merge.js';

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const VOLATILE = new Set(['createdAt', 'updatedAt', '_genId']);
const time = (o) => { const t = Date.parse(o?.updatedAt ?? o); return Number.isFinite(t) ? t : 0; };

// Schnelle 53-Bit-Prüfsumme (cyrb53) – schützt vor Zufallstreffern, nicht vor Angreifern; das reicht hier.
export function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const hv = (v) => hash(canon(v ?? null, VOLATILE));

export const SONG_FIELDS = ['title', 'artist', 'instrument', 'tuning', 'capo', 'bpm', 'timeSig', 'notes', 'sample', 'favorite', 'folder'];
// Hier fragt niemand nach: Es gilt die zuletzt geänderte Version des Songs.
const LATEST_WINS = new Set(['favorite', 'folder', 'sample']);
const FIELD_LABEL = { title: 'Titel', artist: 'Künstler', instrument: 'Instrument', tuning: 'Stimmung', capo: 'Capo', bpm: 'Tempo', timeSig: 'Taktart', notes: 'Notizen' };
export const ID_STORES = ['chords', 'patterns', 'folders', 'setlists'];
const STORE_LABEL = { chords: 'Griff', patterns: 'Muster', folders: 'Ordner', setlists: 'Setlist' };

const normName = (n) => String(n || '').trim().toLowerCase();
const tabRefs = (song) => song.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'tab' && b.tabId).map((b) => b.tabId));

// Abschnitt samt eingebetteten Tabs: Ändert sich ein Tab, ist der Abschnitt geändert
function sectionHash(sec, tabs) {
  return hv({ ...sec, blocks: sec.blocks.map((b) => (b.type === 'tab' ? { ...b, tab: pickTab(tabs.get(b.tabId)) } : b)) });
}
const pickTab = (t) => (t ? { name: t.name, measures: t.measures } : null);

// Ein Song in Prüfsummen. Der Ordner zählt über seinen Namen, nicht seine ID: Zwei Geräte können ihn getrennt angelegt haben.
export function songDigest(song, tabs, folderName = '') {
  const f = {};
  for (const k of SONG_FIELDS) f[k] = hv(k === 'folder' ? normName(folderName) : song[k]);
  const s = {};
  for (const sec of song.sections) s[sec.id] = sectionHash(sec, tabs);
  const o = hv(song.sections.map((x) => x.id));
  return { fp: hash(JSON.stringify([f, s, o])), f, s, o };
}

const folderNames = (folders) => new Map(folders.map((f) => [f.id, f.name]));
const recordFp = (store, x) => (store === 'folders' ? hv({ name: normName(x.name) }) : hv(x));

// Datenstand eines Geräts als kurze Liste. full enthält zusätzlich die vollständigen Prüfsummen für die Basis.
export function buildManifest(data, { tombstones = [], media = [] } = {}) {
  const tabs = new Map(data.tabs.map((t) => [t.id, t]));
  const names = folderNames(data.folders);
  const m = { songs: {}, tomb: {}, media: media.map((x) => ({ id: x.id, songId: x.songId })), folderNames: Object.fromEntries(names) };
  const full = { songs: {} };
  for (const s of data.songs) {
    const d = songDigest(s, tabs, names.get(s.folderId));
    full.songs[s.id] = d;
    m.songs[s.id] = { fp: d.fp, cfp: hash(fingerprint(s, tabs)), u: s.updatedAt, t: s.title };
  }
  for (const st of ID_STORES) {
    m[st] = {};
    full[st] = {};
    for (const x of data[st]) {
      const fp = recordFp(st, x);
      m[st][x.id] = { fp, u: x.updatedAt, t: x.name };
      full[st][x.id] = fp;
    }
  }
  for (const t of tombstones) m.tomb[t.id] = t.deletedAt;
  return { manifest: m, full };
}

const baseFp = (base, store, id) => (store === 'songs' ? base?.songs?.[id]?.fp : base?.[store]?.[id]);

// Einordnung eines Datensatzes (L/R: Manifest-Einträge oder undefined, B: Prüfsumme in der Basis)
function classify(L, R, B, tombL, tombR) {
  if (L && R) {
    if (L.fp === R.fp) return 'same';
    if (B === L.fp) return 'pull';
    if (B === R.fp) return 'push';
    return 'both';
  }
  if (L) {
    if (B != null) return B === L.fp ? 'delLocal' : 'delLocalConflict';
    if (tombR && time(tombR) > time(L.u)) return 'delLocal';
    return 'push';
  }
  if (R) {
    if (B != null) return B === R.fp ? 'delRemote' : 'delRemoteConflict';
    if (tombL && time(tombL) > time(R.u)) return 'delRemote';
    return 'pull';
  }
  return 'none';
}

const inScopeChord = (scope, x) => !!scope && (scope.chords.has(x.id));

// Welche Datensätze braucht dieses Gerät vom anderen? Nur diese werden übertragen.
export function wantList(lm, rm, base, scope = null) {
  const want = { songs: [], chords: [], patterns: [], folders: [], setlists: [] };
  const localContent = new Set(Object.values(lm.songs).map((x) => x.cfp));
  for (const [id, R] of Object.entries(rm.songs)) {
    if (scope && !scope.songs.has(id)) continue;
    const kind = scope ? (lm.songs[id] ? classify(lm.songs[id], R, baseFp(base, 'songs', id)) : 'pull') : classify(lm.songs[id], R, baseFp(base, 'songs', id), lm.tomb[id], rm.tomb[id]);
    if (kind === 'none' || kind === 'same' || kind === 'push' || kind === 'delRemote') continue;
    if (kind === 'pull' && !lm.songs[id] && localContent.has(R.cfp)) continue; // gleicher Inhalt liegt schon hier (andere ID)
    want.songs.push(id);
  }
  if (scope) return want; // Bei „nur diese Songs“ gehen Griffe nur in Senderichtung
  for (const st of ID_STORES) {
    const localNames = st === 'folders' ? new Set(Object.values(lm.folderNames).map(normName)) : null;
    for (const [id, R] of Object.entries(rm[st])) {
      const kind = classify(lm[st][id], R, baseFp(base, st, id));
      if (kind === 'none' || kind === 'same' || kind === 'push' || kind === 'delRemote') continue;
      if (localNames && !lm[st][id] && localNames.has(normName(R.t))) continue;
      want[st].push(id);
    }
  }
  return want;
}

// ---------- Song zusammenführen ----------
// choice: null = Konflikte nur melden · 'local' / 'remote' = die strittigen Teile von dieser Seite nehmen
export function mergeSong(l, r, ctx, choice = null) {
  const { lTabs, rTabs, lFolder, rFolder } = ctx;
  const ld = songDigest(l, lTabs, lFolder), rd = songDigest(r, rTabs, rFolder), bd = ctx.base || null;
  const newer = time(r) > time(l) ? 'remote' : 'local';
  const parts = [];
  const out = { ...l };
  let folder = lFolder || '';
  for (const k of SONG_FIELDS) {
    const lh = ld.f[k], rh = rd.f[k], bh = bd?.f?.[k];
    if (lh === rh) continue;
    let take;
    if (bh === lh) take = 'remote';
    else if (bh === rh) take = 'local';
    else if (LATEST_WINS.has(k)) take = newer;
    else { parts.push(FIELD_LABEL[k] || k); take = choice || 'local'; }
    if (take === 'remote') { if (k === 'folder') folder = rFolder || ''; else out[k] = r[k]; }
  }
  const lSec = new Map(l.sections.map((s) => [s.id, s])), rSec = new Map(r.sections.map((s) => [s.id, s]));
  const kept = new Map(); // Abschnitts-ID → { sec, from }
  const label = (s) => `Abschnitt „${s.name}“`;
  for (const id of new Set([...lSec.keys(), ...rSec.keys()])) {
    const a = lSec.get(id), b = rSec.get(id), bh = bd?.s?.[id];
    if (a && b) {
      const lh = ld.s[id], rh = rd.s[id];
      if (lh === rh) { kept.set(id, { sec: a, from: 'local' }); continue; }
      let take;
      if (bh === lh) take = 'remote';
      else if (bh === rh) take = 'local';
      else { parts.push(label(a)); take = choice || 'local'; }
      kept.set(id, take === 'remote' ? { sec: b, from: 'remote' } : { sec: a, from: 'local' });
    } else if (a) {
      if (bh == null) kept.set(id, { sec: a, from: 'local' }); // hier neu angelegt
      else if (bh === ld.s[id]) continue; // dort gelöscht, hier unverändert
      else { parts.push(label(a)); if ((choice || 'local') === 'local') kept.set(id, { sec: a, from: 'local' }); }
    } else if (b) {
      if (bh == null) kept.set(id, { sec: b, from: 'remote' });
      else if (bh === rd.s[id]) continue;
      else { parts.push(label(b)); if (choice === 'remote') kept.set(id, { sec: b, from: 'remote' }); }
    }
  }
  // Reihenfolge: die des Geräts, das sie geändert hat. Abschnitte, die dort fehlen, stehen hinter ihrem bisherigen Vorgänger.
  const lead = bd?.o != null && bd.o === ld.o ? r.sections : l.sections, other = lead === l.sections ? r.sections : l.sections;
  const order = lead.map((s) => s.id).filter((id) => kept.has(id));
  other.forEach((s, i) => {
    if (!kept.has(s.id) || order.includes(s.id)) return;
    const prev = other.slice(0, i).reverse().find((x) => order.includes(x.id));
    order.splice(prev ? order.indexOf(prev.id) + 1 : 0, 0, s.id);
  });
  out.sections = order.map((id) => kept.get(id).sec);
  out.updatedAt = time(r) > time(l) ? r.updatedAt : l.updatedAt;
  const tabs = [];
  for (const id of order) {
    const { sec, from } = kept.get(id);
    for (const t of tabRefs({ sections: [sec] })) { const tab = (from === 'remote' ? rTabs : lTabs).get(t); if (tab) tabs.push(tab); }
  }
  return { song: out, tabs, parts, folder };
}

// ---------- Plan ----------
// local: alle Daten dieses Geräts · remote: nur die angeforderten Datensätze des anderen (normalisiert)
// scope: { songs: Set, chords: Set } = nur diese Songs abgleichen, nichts löschen
export function planSync({ local, remote, lm, rm, base, scope = null }) {
  const lSongs = new Map(local.songs.map((s) => [s.id, s])), rSongs = new Map(remote.songs.map((s) => [s.id, s]));
  const lTabs = new Map(local.tabs.map((t) => [t.id, t])), rTabs = new Map(remote.tabs.map((t) => [t.id, t]));
  const lNames = folderNames(local.folders);
  const rNames = new Map(Object.entries(rm.folderNames));
  const lContent = new Set(Object.values(lm.songs).map((x) => x.cfp)), rContent = new Set(Object.values(rm.songs).map((x) => x.cfp));
  const items = [];
  let same = 0;
  for (const id of new Set([...Object.keys(lm.songs), ...Object.keys(rm.songs)])) {
    if (scope && !scope.songs.has(id)) continue;
    const L = lm.songs[id], R = rm.songs[id], B = baseFp(base, 'songs', id);
    let kind = classify(L, R, B, lm.tomb[id], rm.tomb[id]);
    if (scope) { if (L && !R) kind = 'push'; else if (R && !L) kind = 'pull'; }
    const title = (L || R).t;
    if (kind === 'same') { same++; continue; }
    if (kind === 'none') continue;
    if (kind === 'push' && !R && rContent.has(L.cfp)) { same++; continue; }
    if (kind === 'pull' && !L && lContent.has(R.cfp)) { same++; continue; }
    const it = { store: 'songs', id, title, kind, isNew: (kind === 'push' && !R) || (kind === 'pull' && !L) };
    if (kind === 'both') {
      const l = lSongs.get(id), r = rSongs.get(id);
      const ctx = { lTabs, rTabs, lFolder: lNames.get(l.folderId), rFolder: r._folderName, base: base?.songs?.[id] || null };
      const m = mergeSong(l, r, ctx);
      it.ctx = ctx;
      it.newer = time(r) > time(l) ? 'remote' : 'local';
      if (m.parts.length) { it.kind = 'conflict'; it.parts = m.parts; it.choice = it.newer; } else it.kind = 'merge';
    } else if (kind === 'delLocalConflict' || kind === 'delRemoteConflict') it.choice = 'keep';
    items.push(it);
  }
  for (const st of ID_STORES) {
    if (scope && st !== 'chords') continue;
    const lmap = new Map(local[st].map((x) => [x.id, x]));
    const lByName = st === 'folders' ? new Set(local[st].map((f) => normName(f.name))) : null;
    const rByName = st === 'folders' ? new Set([...rNames.values()].map(normName)) : null;
    for (const id of new Set([...Object.keys(lm[st]), ...Object.keys(rm[st])])) {
      const L = lm[st][id], R = rm[st][id];
      if (scope && !inScopeChord(scope, { id })) continue;
      let kind = classify(L, R, baseFp(base, st, id));
      if (scope) { if (!L) continue; if (!R) kind = 'push'; else if (kind !== 'push') continue; }
      if (kind === 'same') { same++; continue; }
      if (kind === 'none') continue;
      if (lByName && kind === 'push' && !R && rByName.has(normName(L.t))) { same++; continue; }
      if (lByName && kind === 'pull' && !L && lByName.has(normName(R.t))) { same++; continue; }
      const it = { store: st, id, title: `${STORE_LABEL[st]}: ${(L || R).t || id}`, kind, isNew: (kind === 'push' && !R) || (kind === 'pull' && !L) };
      if (kind === 'both') { it.kind = 'conflict'; it.newer = time(R.u) > time(L.u) ? 'remote' : 'local'; it.choice = it.newer; it.parts = ['Inhalt']; }
      else if (kind === 'delLocalConflict' || kind === 'delRemoteConflict') it.choice = 'keep';
      if (lmap.has(id)) it.local = lmap.get(id);
      items.push(it);
    }
  }
  return { items, same, conflicts: items.filter(isConflict) };
}

export const isConflict = (it) => it.kind === 'conflict' || it.kind === 'delLocalConflict' || it.kind === 'delRemoteConflict';

// ---------- Umsetzen ----------
// Ein Song für ein Gerät: Der Ordner wird über den Namen zur dortigen ID, fehlt er, entsteht er dort neu.
function folderFor(name, side) {
  const key = normName(name);
  if (!key) return null;
  let id = side.folderIds.get(key);
  if (!id) {
    const t = new Date().toISOString();
    id = 'f' + rid();
    side.folderIds.set(key, id);
    side.put.push(['folders', { id, name: String(name).trim(), createdAt: t, updatedAt: t }]);
  }
  return id;
}

// Eine Änderung am Song hebt alte Löschungen auf diesem Gerät auf
function putSong(side, song, tabs, folderName) {
  const { _folderName, ...clean } = song;
  side.put.push(['songs', { ...clean, folderId: folderFor(folderName, side) }]);
  for (const t of tabs) side.put.push(['tabs', { ...t, songId: song.id }]);
  side.del.push(['tombstones', song.id], ['trash', song.id]);
}

function copyOf(song, tabs, suffix) {
  const id = rid();
  const remap = new Map();
  const nt = tabs.map((t) => { const n = { ...t, id: rid(), songId: id }; remap.set(t.id, n.id); return n; });
  const c = JSON.parse(JSON.stringify(song));
  c.id = id;
  c.title = `${c.title} (${suffix})`;
  for (const sec of c.sections) for (const b of sec.blocks) if (b.type === 'tab' && b.tabId) b.tabId = remap.get(b.tabId) || null;
  return { song: c, tabs: nt };
}

// Rückgabe: Schreibvorgänge je Gerät, jeweils { put: [[store, obj]], del: [[store, id]], trash: [songId] }
export function finalizeSync(plan, { local, remote, rm, remoteName = 'anderes Gerät' }) {
  const lSongs = new Map(local.songs.map((s) => [s.id, s])), rSongs = new Map(remote.songs.map((s) => [s.id, s]));
  const lTabs = new Map(local.tabs.map((t) => [t.id, t])), rTabs = new Map(remote.tabs.map((t) => [t.id, t]));
  const lNames = folderNames(local.folders);
  const sideOf = (folderIdsByName) => ({ put: [], del: [], trash: [], folderIds: folderIdsByName });
  const L = sideOf(new Map(local.folders.map((f) => [normName(f.name), f.id])));
  const R = sideOf(new Map(Object.entries(rm.folderNames).map(([id, n]) => [normName(n), id])));
  const tabsOf = (song, map) => tabRefs(song).map((id) => map.get(id)).filter(Boolean);
  const lFolder = (s) => lNames.get(s.folderId) || '';
  const rFolder = (s) => s._folderName || '';

  // Ordner zuerst, damit Songs sie anschließend finden
  const order = [...plan.items].sort((a, b) => (b.store === 'folders') - (a.store === 'folders'));
  const removedFolders = (side, id) => { for (const [k, v] of side.folderIds) if (v === id) side.folderIds.delete(k); };
  const renameFolder = (side, id, name) => { removedFolders(side, id); side.folderIds.set(normName(name), id); };

  for (const it of order) {
    if (it.store !== 'songs') {
      const rRec = remote[it.store].find((x) => x.id === it.id), lRec = it.local;
      const toRemote = () => { R.put.push([it.store, lRec]); if (it.store === 'folders') renameFolder(R, it.id, lRec.name); };
      const toLocal = () => { L.put.push([it.store, rRec]); if (it.store === 'folders') renameFolder(L, it.id, rRec.name); };
      const delL = () => { L.del.push([it.store, it.id]); if (it.store === 'folders') removedFolders(L, it.id); };
      const delR = () => { R.del.push([it.store, it.id]); if (it.store === 'folders') removedFolders(R, it.id); };
      if (it.kind === 'pull') toLocal();
      else if (it.kind === 'push') toRemote();
      else if (it.kind === 'delLocal') delL();
      else if (it.kind === 'delRemote') delR();
      else if (it.kind === 'conflict') { if (it.choice === 'remote') toLocal(); else toRemote(); }
      else if (it.kind === 'delLocalConflict') { if (it.choice === 'keep') toRemote(); else delL(); }
      else if (it.kind === 'delRemoteConflict') { if (it.choice === 'keep') toLocal(); else delR(); }
      continue;
    }
    const l = lSongs.get(it.id), r = rSongs.get(it.id);
    const pull = () => putSong(L, r, tabsOf(r, rTabs), rFolder(r));
    const push = () => putSong(R, l, tabsOf(l, lTabs), lFolder(l));
    switch (it.kind) {
      case 'pull': pull(); break;
      case 'push': push(); break;
      case 'delLocal': L.trash.push(it.id); break;
      case 'delRemote': R.trash.push(it.id); break;
      case 'delLocalConflict': if (it.choice === 'keep') push(); else L.trash.push(it.id); break;
      case 'delRemoteConflict': if (it.choice === 'keep') pull(); else R.trash.push(it.id); break;
      case 'merge':
      case 'conflict': {
        if (it.choice === 'both') {
          push();
          const c = copyOf(r, tabsOf(r, rTabs), remoteName);
          putSong(L, c.song, c.tabs, rFolder(r));
          putSong(R, c.song, c.tabs, rFolder(r));
          break;
        }
        const m = mergeSong(l, r, it.ctx, it.choice || 'local');
        putSong(L, m.song, m.tabs, m.folder);
        putSong(R, m.song, m.tabs, m.folder);
        break;
      }
      default:
    }
  }
  const strip = ({ put, del, trash }) => ({ put, del, trash });
  return { local: strip(L), remote: strip(R) };
}

// Ein Satz statt Zahlenkacheln, z. B. „2 neu, 3 aktualisiert, 1 gelöscht, 1 Konflikt“
export function summarizeSync(plan) {
  const songs = plan.items.filter((x) => x.store === 'songs');
  const count = (f) => songs.filter(f).length;
  const added = count((x) => x.isNew);
  const conflicts = count(isConflict);
  const deleted = count((x) => x.kind === 'delLocal' || x.kind === 'delRemote');
  const updated = songs.length - added - conflicts - deleted;
  const others = plan.items.length - songs.length;
  const parts = [];
  if (added) parts.push(`${added} neu`);
  if (updated) parts.push(`${updated} aktualisiert`);
  if (deleted) parts.push(`${deleted} gelöscht`);
  if (conflicts) parts.push(conflicts === 1 ? '1 Konflikt' : `${conflicts} Konflikte`);
  if (others) parts.push(others === 1 ? '1 weitere Änderung' : `${others} weitere Änderungen`);
  return { added, updated, deleted, conflicts, others, text: parts.length ? parts.join(', ') : 'Alles ist aktuell' };
}

// Rückfrage nur bei echten Konflikten und bei Löschungen – der Rest läuft ohne Unterbrechung
export const needsReview = (plan) => plan.items.some((x) => isConflict(x) || x.kind === 'delLocal' || x.kind === 'delRemote');

// Neue Basis: nur, was auf beiden Geräten nachweislich gleich ist
export function agreedIds(mine, theirs) {
  const out = {};
  for (const st of ['songs', ...ID_STORES]) out[st] = Object.keys(mine[st]).filter((id) => theirs[st][id] && theirs[st][id].fp === mine[st][id].fp);
  return out;
}

export function buildBase(full, agreed, previous = null, scope = null) {
  const out = {};
  for (const st of ['songs', ...ID_STORES]) {
    out[st] = scope ? { ...(previous?.[st] || {}) } : {};
    for (const id of agreed[st]) if (full[st][id] != null) out[st][id] = full[st][id];
  }
  return out;
}
