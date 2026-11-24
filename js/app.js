// App-Start, Navigation, Startseite „Meine Songs“, Einstellungen und Service-Worker-Updates.
import { tr, lang, langChosen, setLang, switchLang } from './i18n.js';
import * as db from './storage.js';
import { h, fill, icon, navBtn, sheet, actionSheet, ask, confirmDialog, alertDialog, toast, banner, segmented, actionRow, formRow, offerFile, relDate, relDay, fullDate, toggle, longPress, slideSel, note, sx } from './ui.js';
import { createSong, duplicateSong, trashWithUndo, listTrash, restoreFromTrash, purgeTrashEntry, cleanTrash, TRASH_DAYS, songChordItems, songMatches, SORTS, touch, newSection, newBlock, newChordItem, groupedSongs, hasTag, allTags, INSTRUMENTS, instrumentOf, listFolders, createFolder, renameFolder, deleteFolder, moveToFolder } from './songs.js';
import { showEditor } from './editor.js';
import { loadUserChords, openChordLibrary } from './chords.js';
import { exportBackupFile, importBackupFile, importRaw, restoreInternalBackup, internalBackupFile, describeCounts, counts, markFileExported, exportSongsFile, autoBackup, repairMissingFolders, folderRestorePlan, applyFolderRestore, canPickFolder, getBackupFolder, pickBackupFolder, clearBackupFolder, saveToBackupFolder } from './backup.js';
import { openSync, syncStatusText } from './sync.js';
import { openTextShare } from './textexport.js';
import { shareSongLink, decodeSongs } from './sharelink.js';
import { openTagEditor } from './tags.js';
import { mailBackup, editBackupEmail, getBackupEmail } from './mailbackup.js';
import { openSetlists, addToSetlist, setlistSongs, newSetlist } from './setlists.js';
import { startTour } from './tour.js';
import { showTheory, detectKey, keyShort } from './theory.js';
import { haptic, hapticsEnabled, setHaptics, wideMode, setWideMode, chordLayoutPref, setChordLayoutPref } from './ui.js';
import { openNews, showNewsOnce, NEWS } from './news.js';
import { openTuner } from './tuner.js';
import { seedSamples, removeSamples } from './samples.js';
import { exportSongsPDF } from './pdf.js';
import { openImporter } from './importer.js';
import { mediaStats } from './media.js';
import { loadAiConfig, aiConfig, setAiKey, setAiModel, listModels, testKey, DEFAULT_MODEL, KEY_URL, loadAiUsage, aiUsage } from './ai.js';

const app = document.getElementById('app');
let current = null;
let sortKey = 'updated';
let theme = 'system';
let query = '';

function mount(el, dir, cleanup) {
  // Mit Seitenleiste: zwischen Songs ohne Schiebe-Animation wechseln
  if (dir && splitOn() && current?.el.classList.contains('editor-view') && el.classList.contains('editor-view')) dir = null;
  if (current) { if (current.cleanup) current.cleanup(); current.el.remove(); }
  if (dir) el.classList.add(dir === 'push' ? 'enter-push' : 'enter-pop');
  app.append(el);
  current = { el, cleanup };
  updateThemeColor();
}

// ---------- Erscheinungsbild ----------
function applyTheme(t) {
  theme = t;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try { if (t === 'system') localStorage.removeItem('gn-theme'); else localStorage.setItem('gn-theme', t); } catch { /* ignorieren */ }
  updateThemeColor();
}
// Schrift: Gemischt (Standard: Überschriften und Bedienung in der Systemschrift, Texte in Serif), System (alles) oder Serif (alles).
// Der alte Wert „serif“ bedeutete das heutige „Gemischt“, deshalb heißt „alles Serif“ intern „allserif“.
const fontChoice = () => { const f = document.documentElement.dataset.font; return f === 'system' || f === 'allserif' ? f : 'mixed'; };
function applyFont(v) {
  const on = v === 'system' || v === 'allserif';
  if (on) document.documentElement.dataset.font = v;
  else delete document.documentElement.dataset.font;
  try { if (on) localStorage.setItem('gn-font', v); else localStorage.removeItem('gn-font'); } catch { /* ignorieren */ }
  db.setSetting('font', on ? v : 'mixed');
}
// App-Größe: verkleinert oder vergrößert die ganze App wie Zoomen im Browser (index.html setzt sie schon beim Start)
const ZOOMS = [0.8, 0.9, 1, 1.1];
const zoomLevel = () => { try { const z = Number(localStorage.getItem('gn-zoom')); return ZOOMS.includes(z) ? z : 1; } catch { return 1; } };
function applyZoom(z) {
  try { if (z === 1) localStorage.removeItem('gn-zoom'); else localStorage.setItem('gn-zoom', String(z)); } catch { /* egal */ }
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', z === 1
    ? 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
    : `initial-scale=${z}, minimum-scale=${z}, maximum-scale=${z}, user-scalable=no, viewport-fit=cover`);
}
// Design: Plekto (Standard) oder das klassische Design. Beide Stylesheets sind immer geladen, das Attribut schaltet um.
const designChoice = () => (document.documentElement.dataset.design === 'sorell' ? 'sorell' : 'classic');
function applyDesign(v) {
  const on = v !== 'classic' && CSS.supports('selector(&)');
  if (on) document.documentElement.dataset.design = 'sorell';
  else delete document.documentElement.dataset.design;
  try { localStorage.setItem('gn-design', on ? 'sorell' : 'classic'); } catch { /* egal */ }
  updateThemeColor();
}
// Akzentfarbe im Plekto-Design: nur eine Darstellungs-Einstellung dieses Geräts
const ACCENTS = [['black', tr("Schwarz")], ['orange', tr("Orange")], ['blue', tr("Blau")], ['green', tr("Grün")]];
const accentChoice = () => { try { const a = localStorage.getItem('gn-accent'); return ACCENTS.some(([v]) => v === a) ? a : 'black'; } catch { return 'black'; } };
// Plekto: Abschnittsköpfe als Kopfband, Pille oder Punkt
// Abschnittsköpfe: Standard ist die Pille; Kopfband und Punkt sind wählbar
const secStyleChoice = () => { try { const v = localStorage.getItem('gn-sec-style'); return v === 'band' || v === 'pill' ? v : 'dot'; } catch { return 'dot'; } };
function applySecStyle(v) {
  if (v === 'band') delete document.documentElement.dataset.secStyle;
  else document.documentElement.dataset.secStyle = v;
  try { localStorage.setItem('gn-sec-style', v); } catch { /* egal */ }
}
function applyAccent(v) {
  if (v === 'black') delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = v;
  try { if (v === 'black') localStorage.removeItem('gn-accent'); else localStorage.setItem('gn-accent', v); } catch { /* egal */ }
}
// Klassisch ist in der App nicht mehr wählbar; der Code bleibt. Auf true setzen, um es wieder anzubieten.
const CLASSIC_IN_APP = false;
const storedDesign = () => { if (!CLASSIC_IN_APP) return 'sorell'; try { return localStorage.getItem('gn-design') === 'classic' ? 'classic' : 'sorell'; } catch { return 'sorell'; } };
const statusBarMode = () => { try { return localStorage.getItem('gn-statusbar') === 'ios' ? 'ios' : 'app'; } catch { return 'app'; } };
function updateThemeColor() {
  const bg = current ? getComputedStyle(current.el).backgroundColor : getComputedStyle(document.body).backgroundColor;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => setTimeout(updateThemeColor, 50));

// ---------- Navigation ----------
let routeToken = 0;
let linkImport = false; // Start über einen Song-Link: dann keine Neuigkeiten darüberlegen
async function route(initial) {
  const token = ++routeToken;
  const first = initial === true;
  await db.flush();
  // Geteilter Song-Link (#/import/<Daten>): Adresse aufräumen, Startseite zeigen und darüber die Import-Vorschau
  const im = location.hash.match(/^#\/import\/(.+)$/);
  if (im) {
    linkImport = true;
    history.replaceState(null, '', '#/');
    decodeSongs(im[1])
      .then((raw) => importRaw(raw, { title: tr("Aus Link"), allowReplace: false }))
      .then(async (ok) => { if (ok) { await loadUserChords(); showLibrary(); } })
      .catch((e) => alertDialog(tr("Link lässt sich nicht öffnen"), String(e.message || e)));
  }
  const m = location.hash.match(/^#\/song\/(.+)$/);
  if (m) {
    const song = await db.get('songs', decodeURIComponent(m[1]));
    if (token !== routeToken) return;
    if (song) {
      await showEditor(song, { mount: (el, dir, cleanup) => mount(el, first ? null : dir, cleanup), goHome, sidebar: sideCtl, openTag: (t) => { filter.area = 'tag:' + t; saveFilter(); goHome(); } });
      updateSplit(song.id);
      return;
    }
    history.replaceState(null, '', '#/');
  }
  // Setlist spielen: #/set/<id>/<Position unter den vorhandenen Songs>
  const sm = location.hash.match(/^#\/set\/([^/]+)\/(\d+)$/);
  if (sm) {
    const sl = await db.get('setlists', decodeURIComponent(sm[1]));
    const list = sl ? setlistSongs(sl, await db.getAll('songs')) : [];
    if (token !== routeToken) return;
    if (list.length) {
      const i = Math.min(Number(sm[2]), list.length - 1);
      const go = (j) => location.replace(`#/set/${encodeURIComponent(sl.id)}/${j}`);
      await showEditor(list[i], { mount: (el, dir, cleanup) => mount(el, first ? null : dir, cleanup), goHome,
        setlist: { name: sl.name, pos: i, total: list.length, prev: i > 0 ? () => go(i - 1) : null, next: i < list.length - 1 ? () => go(i + 1) : null } });
      document.body.classList.remove('split', 'split-able'); // Beim Spielen einer Setlist gehört die Breite dem Song
      return;
    }
    history.replaceState(null, '', '#/');
  }
  // Musiktheorie als eigene Seite: #/theory, aus einem Song heraus #/theory/<Song-ID> (mit Tonart und Stimmung des Songs)
  const tm = location.hash.match(/^#\/theory(?:\/(.+))?$/);
  if (tm) {
    const song = tm[1] ? await db.get('songs', decodeURIComponent(tm[1])) : null;
    if (token !== routeToken) return;
    if (!tm[1] || song) {
      // Übernommene Akkordfolgen landen als neuer Abschnitt „Idee“ im Song
      const onAdd = song && (async (names) => {
        const s = await db.get('songs', song.id);
        if (!s) return;
        const sec = newSection(tr("Idee"));
        sec.blocks.push(newBlock('chords', { items: names.map((n) => newChordItem(n)) }));
        s.sections.push(sec);
        touch(s);
      });
      showTheory({ song, onAdd, mount: (el, dir, cleanup) => mount(el, first ? null : dir, cleanup), back: () => (song ? openSong(song) : goHome()), sidebar: sideCtl });
      updateSplit(song ? song.id : null);
      return;
    }
    history.replaceState(null, '', '#/');
  }
  if (token !== routeToken) return;
  updateSplit(null);
  // Plekto am Handy: Auch beim Start einblenden, sonst bleibt der obere Bereich auf dem iPhone teils unscharf
  const startPop = designChoice() === 'sorell' && !matchMedia('(min-width: 1000px)').matches;
  await showLibrary(first || !current ? (startPop ? 'pop' : null) : 'pop');
}

// ---------- iPad quer / PC: Songliste links neben dem geöffneten Song (wie Apple Notizen) ----------
const SIDE_KEY = 'gn-sidebar';
const wide = matchMedia('(min-width: 1000px)');
let sideHidden = (() => { try { return localStorage.getItem(SIDE_KEY) === 'off'; } catch { return false; } })();
let sideSong = null, sideQuery = '';
const sidebar = h('aside', { class: 'sidebar', 'aria-label': tr("Songs") });
const splitOn = () => document.body.classList.contains('split');
const sideCtl = { toggle() {
  sideHidden = !sideHidden;
  try { if (sideHidden) localStorage.setItem(SIDE_KEY, 'off'); else localStorage.removeItem(SIDE_KEY); } catch { /* egal */ }
  updateSplit(sideSong);
} };
function updateSplit(songId) {
  sideSong = songId;
  // Plekto: auch ohne geöffneten Song; ist sie ausgeblendet, holt ein Knopf in der Toolbar sie zurück
  const sorell = designChoice() === 'sorell';
  const on = wide.matches && (sorell ? !sideHidden : !!songId && !sideHidden);
  document.body.classList.toggle('split', on);
  document.body.classList.toggle('split-able', wide.matches && (sorell ? sideHidden : !!songId));
  if (on) { if (!sidebar.isConnected) document.body.append(sidebar); drawSidebar(); }
  drawSongCol();
}
wide.addEventListener?.('change', () => { updateSplit(sideSong); libRedraw?.(); });
// Bereich wechseln: auf der Startseite direkt, aus einem Song heraus zurück zur Liste
let libSetArea = null, libNewFolder = null, libFolderMenu = null, libSongMenu = null, libRedraw = null, libSelecting = false;

// Plekto am PC: Songs als Tabelle oder als Spalte neben dem geöffneten Song. Merkt sich nur die Darstellung.
const LIB_KEY = 'gn-libview';
let libView = (() => { try { return localStorage.getItem(LIB_KEY) === 'columns' ? 'columns' : 'table'; } catch { return 'table'; } })();
let lastOpened = null; // Tabelle: der zuletzt geöffnete Song bleibt markiert
const songCol = h('aside', { class: 'song-col', 'aria-label': tr("Songs") });
const songColOn = () => designChoice() === 'sorell' && wide.matches && libView === 'columns' && !libSelecting;
function setLibView(v) {
  libView = v;
  try { if (v === 'columns') localStorage.setItem(LIB_KEY, v); else localStorage.removeItem(LIB_KEY); } catch { /* egal */ }
  drawSongCol();
}
// Schlagwort-Bereich: „tag:<Name>“. Suche trifft eine Gruppe, wenn eine ihrer Versionen passt.
const isTagArea = (a) => typeof a === 'string' && a.startsWith('tag:');
const tagOf = (a) => a.slice(4);
const groupMatch = (s, q) => (s._versions || [s]).some((v) => songMatches(v, q));
const versionsText = (s) => s._versions && tr("{0} Versionen", s._versions.length);
const areaTitle = (area, folders) => (isTagArea(area) ? '#' + tagOf(area) : area === 'all' ? tr("Alle Songs") : area === 'fav' ? tr("Favoriten") : area === 'none' ? tr("Ohne Ordner") : folders.find((f) => f.id === area)?.name || tr("Alle Songs"));
const countText = (n) => (n === 1 ? tr("1 Song") : tr("{0} Songs", n));
async function drawSongCol() {
  const on = songColOn();
  document.body.classList.toggle('cols', on);
  if (!on) { songCol.remove(); return; }
  if (!songCol.isConnected) document.body.append(songCol);
  const [allRaw, folders] = await Promise.all([db.getAll('songs'), listFolders()]);
  const all = groupedSongs(allRaw);
  const q = query.trim();
  const days = PERIODS[filter.period]?.days || 0;
  const since = days ? Date.now() - days * 864e5 : 0;
  const inArea = (s) => filter.area === 'all' || (isTagArea(filter.area) ? hasTag(s, tagOf(filter.area)) : filter.area === 'fav' ? s.favorite : filter.area === 'none' ? !s.folderId || !folders.some((f) => f.id === s.folderId) : s.folderId === filter.area);
  const items = all.filter((s) => (filter.inst === 'all' || instrumentOf(s) === filter.inst) && (!since || Date.parse(s.updatedAt) >= since) && (q ? groupMatch(s, q) : inArea(s))).sort(SORTS[sortKey].fn);
  const keep = songCol.querySelector('.side-list')?.scrollTop || 0;
  const list = h('ul', { class: 'side-list' }, items.map((s) => {
    const li = h('li', null, h('button', { class: 'side-item' + (s.id === sideSong ? ' on' : ''), onClick: () => { if (s.id !== sideSong) openSong(s); } },
      h('span', { class: 'side-title' }, s.title),
      h('span', { class: 'side-sub' }, [s.artist, INSTRUMENTS[instrumentOf(s)].label, s.capo && tr("Capo {0}", s.capo)].filter(Boolean).join(' · '))));
    longPress(li, () => colSongMenu(s));
    return li;
  }));
  fill(songCol,
    h('header', { class: 'col-head' }, h('div', { class: 'tb-title' }, areaTitle(filter.area, folders)), h('div', { class: 'tb-sub' }, `${countText(items.length)} · ${SORTS[sortKey].label}`)),
    list);
  list.scrollTop = keep;
  if (sideSong && !keep) list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
// Rechtsklick in der Spalte, während ein Song offen ist: erst alles speichern, danach den Song neu laden
async function colSongMenu(s) {
  if (!sideSong && libSongMenu) { libSongMenu(s.id); return; }
  await db.flush();
  const songs = await db.getAll('songs');
  const item = songs.find((x) => x.id === s.id);
  if (!item) return;
  let folders = await listFolders();
  openSongMenu(item, {
    songs, folders: () => folders, render: () => route(), reload: () => route(),
    newFolder: async () => {
      const name = await ask(tr("Neuer Ordner"), { placeholder: tr("Name, z. B. Lagerfeuer"), ok: tr("Erstellen") });
      if (!name) return null;
      try { const f = await createFolder(name); folders = await listFolders(); return f; } catch (e) { alertDialog(tr("Ordner nicht erstellt"), e.message); return null; }
    },
  });
}

// ---------- Menü eines Songs (Rechtsklick oder langes Drücken) ----------
async function pickFolderFor(s, ctx) {
  const name = (id) => ctx.folders().find((f) => f.id === id)?.name;
  const target = await actionSheet(tr("„{0}“ verschieben nach", s.title), [
    ...ctx.folders().map((f) => ({ label: f.name + (s.folderId === f.id ? '  ✓' : ''), sIcon: 'folder', value: f.id, disabled: s.folderId === f.id })),
    { label: tr("+ Neuer Ordner …"), sIcon: 'plus', value: '$new' },
  ]);
  if (!target) return;
  let id = target;
  if (target === '$new') { const f = await ctx.newFolder(); if (!f) return; id = f.id; }
  moveToFolder(s, id);
  await db.flush();
  toast(tr("Verschoben nach „{0}“", name(id)));
  ctx.render();
}

function openSongMenu(s, ctx) {
  const folderName = ctx.folders().find((f) => f.id === s.folderId)?.name;
  const meta = [s.artist, INSTRUMENTS[instrumentOf(s)].label, s.capo && tr("Capo {0}", s.capo)].filter(Boolean).join(' · ');
  actionSheet(s.title, [
    { section: tr("Song") },
    { label: s.favorite ? tr("Aus Favoriten entfernen") : tr("Zu Favoriten"), quick: tr("Favorit"), icon: 'star', onClick: async () => { s.favorite = !s.favorite; touch(s); await db.flush(); ctx.render(); } },
    { label: tr("Umbenennen"), quick: tr("Umbenennen"), icon: 'rename', onClick: async () => { const n = await ask(tr("Song umbenennen"), { value: s.title, ok: tr("Sichern") }); if (n) { s.title = n; touch(s); await db.flush(); ctx.render(); } } },
    { section: tr("Ordner, Schlagworte & Setlisten") },
    { label: tr("In Ordner verschieben …"), icon: 'folder', more: true, onClick: () => pickFolderFor(s, ctx) },
    { label: tr("Zu Setlist hinzufügen …"), icon: 'list', more: true, onClick: () => addToSetlist([s]) },
    { label: s.tags?.length ? tr("Schlagworte: {0}", s.tags.join(', ')) : tr("Schlagworte …"), icon: 'tag', more: true, onClick: () => openTagEditor([s], { onDone: () => ctx.render() }) },
    s.folderId && folderName && { label: tr("Aus Ordner „{0}“ entfernen", folderName), icon: 'close', onClick: async () => { moveToFolder(s, null); await db.flush(); toast(sx(tr("Aus Ordner entfernt – der Song bleibt erhalten"), tr("Aus Ordner entfernt"))); ctx.render(); } },
    { section: tr("Bearbeiten & Teilen") },
    { label: tr("Duplizieren"), quick: tr("Duplizieren"), icon: 'copy', onClick: async () => { const c = await duplicateSong(s); ctx.songs.push(c); ctx.render(); toast(tr("Kopie erstellt")); } },
    { label: tr("Teilen …"), quick: tr("Teilen"), icon: 'share', onClick: () => actionSheet(tr("Teilen"), [
      { label: tr("Als Text oder ChordPro"), quick: tr("Text"), icon: 'note', onClick: () => openTextShare([s]) },
      { label: tr("Als PDF"), quick: 'PDF', icon: 'doc', onClick: () => pdfFor([s]) },
      { label: tr("Als Link (für Plekto)"), quick: tr("Link"), icon: 'share', onClick: () => shareSongLink([s]) },
      { label: tr("Als Datei (für Plekto)"), quick: tr("Datei"), icon: 'download', onClick: async () => { const f = await exportSongsFile([s]); offerFile(f.blob, f.filename, { title: tr("Song-Datei") }); } },
      { label: tr("An anderes Gerät (Sync)"), quick: tr("Sync"), icon: 'sync', onClick: () => openSync({ songs: [s], onDone: async () => { await loadUserChords(); ctx.reload(); } }) },
    ]) },
    { section: ' ' },
    { label: s._versions ? tr("Löschen (alle {0} Versionen)", s._versions.length) : tr("Löschen"), icon: 'trash', destructive: true, onClick: async () => {
      await trashWithUndo(s._versions || [s], () => ctx.reload());
      ctx.songs.splice(ctx.songs.indexOf(s), 1);
      ctx.render();
    } },
  ], { meta, song: true });
}
function sideArea(area) {
  if (libSetArea && !sideSong && !onTheory()) { libSetArea(area); return; }
  filter.area = area;
  saveFilter();
  goHome();
}
// Plekto am PC: Logo, Bereiche, Ordner und unten Musiktheorie und Einstellungen
const FOLDER_DOTS = ['intro', 'verse', 'chorus', 'bridge', 'solo', 'pre', 'outro'];
let settingsOpen = false, closeSettings = null;
async function drawSorellSidebar() {
  const [rawSongs, folders, setlists] = await Promise.all([db.getAll('songs'), listFolders(), db.getAll('setlists')]);
  const songs = groupedSongs(rawSongs);
  const tags = allTags(songs);
  const here = (a) => !settingsOpen && !onTheory() && filter.area === a;
  const row = (lead, label, on, n, onClick, cls = '') => h('button', { class: 'side-row' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), onClick }, lead, h('span', { class: 'side-label' }, label), n != null && h('span', { class: 'side-n' }, String(n)));
  const go = (a) => () => { closeSettings?.(); sideArea(a); };
  const dot = (i) => h('span', { class: 'side-dot', style: `--dot:var(--sec-${FOLDER_DOTS[i % FOLDER_DOTS.length]})` });
  const loose = folders.length > 0 && songs.filter((s) => !s.folderId || !folders.some((f) => f.id === s.folderId)).length;
  const newFolder = async () => {
    closeSettings?.();
    if (libNewFolder && !sideSong) { libNewFolder(); return; }
    const name = await ask(tr("Neuer Ordner"), { placeholder: tr("Name, z. B. Lagerfeuer"), ok: tr("Erstellen") });
    if (!name) return;
    try { await createFolder(name); drawSidebar(); } catch (e) { alertDialog(tr("Ordner nicht erstellt"), e.message); }
  };
  fill(sidebar,
    h('div', { class: 'side-brand' },
      h('span', { class: 'side-logo', 'aria-hidden': 'true' }, icon('bars', 'small')),
      h('span', { class: 'side-name' }, tr("Plekto")),
      h('button', { class: 'side-toggle', 'aria-label': tr("Seitenleiste ausblenden"), onClick: () => sideCtl.toggle() }, icon('panel', 'small'))),
    h('nav', { class: 'side-scroll', 'aria-label': tr("Bereiche") },
      h('div', { class: 'side-cap' }, tr("Bibliothek")),
      row(icon('music', 'small'), tr("Alle Songs"), here('all'), songs.length, go('all')),
      row(icon('star', 'small'), tr("Favoriten"), here('fav'), songs.filter((s) => s.favorite).length, go('fav')),
      row(icon('list', 'small'), tr("Setlisten"), false, setlists.length, () => openSetlists()),
      h('div', { class: 'side-cap' }, tr("Ordner")),
      folders.map((f, i) => {
        const b = row(dot(i), f.name, here(f.id), songs.filter((s) => s.folderId === f.id).length, go(f.id));
        longPress(b, () => { if (libFolderMenu && !sideSong) libFolderMenu(f); });
        return b;
      }),
      loose > 0 && row(h('span', { class: 'side-dot none' }), tr("Ohne Ordner"), here('none'), loose, go('none')),
      row(icon('plus', 'small'), tr("Neuer Ordner"), false, null, newFolder, 'muted'),
      tags.length > 0 && h('div', { class: 'side-cap' }, tr("Schlagworte")),
      tags.map((x) => row(icon('tag', 'small'), x.name, here('tag:' + x.name), x.n, go('tag:' + x.name)))),
    h('div', { class: 'side-foot' },
      row(icon('globe', 'small'), tr("Musiktheorie"), !settingsOpen && onTheory(), null, () => { closeSettings?.(); openTheoryPage(); }),
      row(icon('settings', 'small'), tr("Einstellungen"), settingsOpen, null, () => { if (!settingsOpen) openSettings(); })));
}

async function drawSidebar() {
  if (designChoice() === 'sorell') return drawSorellSidebar();
  const songs = groupedSongs(await db.getAll('songs')).sort(SORTS[sortKey].fn);
  const search = h('input', { type: 'search', placeholder: tr("Suchen"), value: sideQuery, 'aria-label': tr("Songs durchsuchen"), autocomplete: 'off' });
  const list = h('ul', { class: 'side-list' });
  const draw = () => {
    const q = sideQuery.trim().toLowerCase();
    list.replaceChildren(...songs.filter((s) => groupMatch(s, q)).map((s) => h('li', null,
      h('button', { class: 'side-item' + (s.id === sideSong ? ' on' : ''), onClick: () => { if (s.id !== sideSong) openSong(s); } },
        h('span', { class: 'side-title' }, s.title, s.favorite && h('span', { class: 'side-fav' }, ' ★')),
        h('span', { class: 'side-sub' }, [s.artist, instrumentOf(s) === 'ukulele' && tr("Ukulele")].filter(Boolean).join(' · ') || relDate(s.updatedAt))))));
  };
  search.addEventListener('input', () => { sideQuery = search.value; draw(); });
  draw();
  fill(sidebar,
    h('div', { class: 'side-head' },
      h('button', { class: 'glass-btn c-only', 'aria-label': tr("Zur Startseite"), onClick: goHome }, icon('back')),
      h('span', { class: 'side-h' }, tr("Songs")),
      h('button', { class: 'glass-btn', 'aria-label': tr("Neuer Song"), onClick: () => newSongFlow() }, icon('plus'))),
    h('div', { class: 'search glass side-search' }, icon('search', 'small'), search),
    list);
  list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}

function goHome() {
  if (location.hash.startsWith('#/song/') || location.hash.startsWith('#/set/') || onTheory()) location.hash = '#/';
  else route();
}
const onTheory = () => location.hash.startsWith('#/theory');
const openTheoryPage = () => { location.hash = '#/theory'; };
const openSong = (s) => { lastOpened = s.id; location.hash = '#/song/' + encodeURIComponent(s.id); };

// ---------- Startseite ----------
// Filter: Instrument, Bereich (alle / Favoriten / ohne Ordner / Ordner-ID) und Zeitraum der letzten Änderung
let filter = { inst: 'all', area: 'all', period: 'all' };
// Scrollposition der Liste: bleibt erhalten, wenn man aus einem Song zurückkommt
let libScroll = 0;
// Tonart je Song merken – sie wird aus den Akkorden geschätzt und ändert sich nur mit dem Song
const keyCache = new Map();
function songKeyLabel(s) {
  const stamp = s.updatedAt;
  const hit = keyCache.get(s.id);
  if (hit?.stamp === stamp) return hit.label;
  const k = detectKey(songChordItems(s).map((i) => i.name));
  const label = k && k.fit >= 0.5 ? keyShort(k) : '';
  keyCache.set(s.id, { stamp, label });
  return label;
}
const PERIODS = { all: { label: tr("Alle"), days: 0 }, 7: { label: tr("7 Tage"), days: 7 }, 30: { label: tr("30 Tage"), days: 30 }, 365: { label: tr("1 Jahr"), days: 365 } };
const saveFilter = () => db.setSetting('libFilter', filter);

async function showLibrary(dir = null) {
  // Versionen eines Songs erscheinen als ein Eintrag
  const songs = groupedSongs(await db.getAll('songs'));
  let folders = await listFolders();
  if (!['all', 'fav', 'none'].includes(filter.area) && !folders.some((f) => f.id === filter.area) && !(isTagArea(filter.area) && songs.some((s) => hasTag(s, tagOf(filter.area))))) filter.area = 'all';
  const view = h('div', { class: 'view library-view' });
  // Auswahlmodus: mehrere Songs gemeinsam verschieben, exportieren oder löschen
  let selecting = false, shown = [];
  const sel = new Set();
  // Aufbau wie in Apple Notizen: oben Titel + ein Menü, darunter die Ordner als Pillen,
  // unten eine schwebende Leiste mit Filter, Suche und „+“
  const navRight = h('div', { class: 'nav-right' });
  const titleEl = h('h1', { class: 'lib-title' }, tr("Meine Songs"));
  const libSub = h('div', { class: 'tb-sub s-only' });
  const libCount = h('span', { class: 'lib-count s-only' });
  const nav = h('header', { class: 'navbar lib-nav' },
    h('div', { class: 'nav-row' },
      h('div', { class: 'lib-head' }, titleEl, libSub),
      libCount,
      navRight));
  const searchInput = h('input', { type: 'search', placeholder: tr("Suchen"), value: query, 'aria-label': tr("Songs durchsuchen"), autocomplete: 'off', enterkeyhint: 'search' });
  const searchBox = h('div', { class: 'search glass' + (query ? ' has-text' : '') }, icon('search', 'small'), searchInput,
    h('button', { class: 'clear', 'aria-label': tr("Suche leeren"), onClick: () => { searchInput.value = ''; query = ''; searchBox.classList.remove('has-text'); renderList(); } }, icon('close', 'small')));
  searchInput.addEventListener('input', () => { query = searchInput.value; searchBox.classList.toggle('has-text', !!query); renderList(); });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchInput.blur(); });
  const chips = slideSel(h('div', { class: 'pills folder-pills', role: 'tablist', 'aria-label': tr("Ordner") }), '.pill');
  const list = h('div');
  // Plekto am Handy: „Ordner“ klappt unter den Tabs die Ordnerliste aus
  const folderDrop = h('div', { class: 'folder-drop s-only', inert: true });
  let foldersOpen = false;
  // Plekto am Handy: Das Suchfeld steht oben unter dem Titel, nicht in der schwebenden Leiste
  const searchSlot = h('div', { class: 'lib-search s-only' });
  const content = h('main', { class: 'content' }, searchSlot, chips, folderDrop, list, h('div', { class: 'cols-empty s-only' }, icon('music'), h('p', null, tr("Wähle links einen Song aus"))));
  const count = h('span', { class: 'toolbar-info' });
  const toolbar = h('footer', { class: 'float-bar' });
  const filterBtn = h('button', { class: 'glass-btn', 'aria-label': tr("Sortieren und filtern"), onClick: () => sortMenu() }, icon('filter'));
  const plusBtn = h('button', { class: 'glass-btn', 'aria-label': tr("Neu"), onClick: () => newMenu() }, icon('plus'));
  const moreBtn = h('button', { class: 'glass-btn', 'aria-label': tr("Menü"), onClick: () => mainMenu() }, icon('more'));
  const desk = () => designChoice() === 'sorell' && wide.matches;
  const sorellPhone = () => designChoice() === 'sorell' && !wide.matches;
  // Plekto am PC: Darstellung als gleitendes Segment in der Toolbar
  const viewSeg = () => {
    const box = slideSel(h('div', { class: 'seg view-seg', role: 'radiogroup', 'aria-label': tr("Darstellung der Songliste") }), '.seg-btn');
    const draw = () => fill(box, [['table', tr("Tabelle"), 'rows'], ['columns', tr("Spalten"), 'panel']].map(([v, label, ic]) => h('button', {
      class: 'seg-btn' + (libView === v ? ' on' : ''), role: 'radio', 'aria-checked': String(libView === v), 'aria-label': label, 'data-area': v,
      onClick: () => { if (libView === v) return; haptic(); setLibView(v); draw(); },
    }, icon(ic, 'small'))));
    draw();
    return box;
  };
  function drawBars() {
    filterBtn.classList.toggle('on', filter.inst !== 'all' || filter.period !== 'all');
    // Toolbar nur neu aufbauen, wenn sich der Modus ändert: Das Suchfeld behält so den Fokus
    const navMode = (selecting ? 'sel' : 'normal') + (desk() ? ':desk' : sorellPhone() ? ':phone' : '');
    if (navRight.dataset.mode !== navMode) {
      navRight.dataset.mode = navMode;
      fill(navRight, selecting
        ? h('button', { class: 'glass-btn text', onClick: () => setSelecting(false) }, tr("Fertig"))
        : desk()
          ? [h('button', { class: 'glass-btn nav-side', 'aria-label': tr("Seitenleiste einblenden"), onClick: () => sideCtl.toggle() }, icon('panel', 'small')),
            viewSeg(), filterBtn, moreBtn, searchBox,
            h('button', { class: 'glass-btn text bold new-song', onClick: () => newMenu() }, icon('plus', 'small'), tr("Neuer Song"))]
          : sorellPhone() ? [plusBtn, moreBtn] : moreBtn);
    }
    if (sorellPhone() && searchBox.parentNode !== searchSlot) searchSlot.append(searchBox);
    // Leiste nur neu aufbauen, wenn sich der Modus ändert – sonst verliert das Suchfeld nach jedem Buchstaben den Fokus
    const mode = selecting ? 'sel:' + (shown.length && shown.every((x) => sel.has(x.id))) + ':' + !sel.size : desk() ? 'desk' : sorellPhone() ? 'phone' : 'normal';
    if (toolbar.dataset.mode === mode) return;
    toolbar.dataset.mode = mode;
    fill(toolbar, selecting
      ? [h('button', { class: 'glass-btn text', onClick: () => { const all = shown.every((x) => sel.has(x.id)); shown.forEach((x) => (all ? sel.delete(x.id) : sel.add(x.id))); renderList(); } }, shown.length && shown.every((x) => sel.has(x.id)) ? tr("Keine") : tr("Alle")),
        count,
        h('button', { class: 'glass-btn text bold', disabled: !sel.size, onClick: batchMenu }, tr("Aktionen"))]
      : desk() || sorellPhone() ? [] : [filterBtn, searchBox, plusBtn]);
    toolbar.classList.toggle('selecting', selecting);
  }
  function setSelecting(on) { selecting = on; libSelecting = on; sel.clear(); drawBars(); renderList(); }
  function mainMenu() {
    actionSheet(tr("Meine Songs"), [
      { label: tr("Songs auswählen"), quick: tr("Auswählen"), icon: 'check', onClick: () => setSelecting(true) },
      { label: tr("Sortieren & Filtern …"), quick: tr("Sortieren"), icon: 'sort', onClick: () => sortMenu() },
      { label: tr("Setlisten"), quick: tr("Setlisten"), icon: 'list', onClick: () => openSetlists() },
      { label: tr("Musiktheorie"), quick: tr("Theorie"), icon: 'key', onClick: () => openTheoryPage() },
      { label: tr("Zuletzt gelöscht"), icon: 'trash', onClick: () => openTrash(() => showLibrary()) },
      { section: ' ' },
      { label: tr("Backup sichern"), icon: 'download', onClick: backupNow },
      { label: tr("Backup per Mail"), icon: 'mail', onClick: mailBackup },
      { label: tr("Einstellungen"), icon: 'settings', onClick: openSettings },
    ]);
  }
  function newMenu() {
    actionSheet(tr("Neu"), [
      { label: tr("Neuer Song"), quick: tr("Song"), icon: 'compose', onClick: newSongFlow },
      { label: tr("Aus Text erstellen …"), quick: tr("Aus Text"), icon: 'magic', onClick: importFlow },
      { section: ' ' },
      { label: tr("Setlist"), quick: tr("Setlist"), icon: 'list', onClick: () => newSetlist() },
      { label: tr("Ordner"), quick: tr("Ordner"), icon: 'folder', onClick: () => newFolderFlow() },
    ]);
  }
  view.append(nav, content, toolbar);
  view.addEventListener('scroll', () => nav.classList.toggle('scrolled', view.scrollTop > 8), { passive: true });
  // Tastatur auf dem iPhone: die schwebende Leiste mit dem Suchfeld bleibt darüber sichtbar
  const vv = window.visualViewport;
  const lift = () => { toolbar.style.transform = vv ? `translateY(${-Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px)` : ''; };
  vv?.addEventListener('resize', lift);
  vv?.addEventListener('scroll', lift);

  const folderName = (id) => folders.find((f) => f.id === id)?.name;
  const row = (s, i = 0) => {
    if (selecting) {
      const on = sel.has(s.id);
      return h('li', { class: 'row selectable' + (on ? ' selected' : '') },
        h('button', { class: 'row-main', 'aria-pressed': String(on), onClick: () => { if (on) sel.delete(s.id); else sel.add(s.id); renderList(); } },
          h('span', { class: 'row-check' }, on && icon('check', 'small')),
          h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, s.title), h('div', { class: 'row-sub' }, [s.artist, instrumentOf(s) === 'ukulele' && tr("Ukulele"), folderName(s.folderId)].filter(Boolean).join('  ·  ')))));
    }
    const main = h('button', { class: 'row-main', onClick: () => openSong(s) },
      h('div', { class: 'row-text' },
        h('div', { class: 'row-title' }, s.title, s.sample && h('span', { class: 'badge' }, tr("Beispiel"))),
        h('div', { class: 'row-sub c-only' }, [songKeyLabel(s), s.capo && tr("Capo {0}", s.capo), instrumentOf(s) === 'ukulele' && tr("Ukulele"), s.artist, versionsText(s), filter.area === 'all' && folderName(s.folderId)].filter(Boolean).join(' · ')),
        h('div', { class: 'row-sub row-meta s-only' }, [s.artist, INSTRUMENTS[instrumentOf(s)].label, s.capo && tr("Capo {0}", s.capo), versionsText(s)].filter(Boolean).join(' · ')),
        s.artist && h('div', { class: 'row-sub row-artist s-only' }, s.artist)),
      s.favorite && icon('star', 'small filled row-star'),
      h('span', { class: 'row-col col-artist s-only' }, s.artist || '–'),
      h('span', { class: 'row-col col-inst s-only' }, INSTRUMENTS[instrumentOf(s)].label),
      h('span', { class: 'row-col col-capo s-only' }, s.capo || '–'),
      h('span', { class: 'row-col col-date s-only' }, relDate(s.updatedAt)),
      icon('chevron', 'small row-chev s-only'));
    const li = h('li', { class: 'row' + (s.id === lastOpened ? ' on' : ''), style: `--i:${Math.min(i, 14) + 1}` }, main, h('button', { class: 'row-more c-only', 'aria-label': tr("Optionen für {0}", s.title), onClick: () => songMenu(s) }, icon('more')));
    longPress(li, () => songMenu(s));
    return li;
  };
  // Der Bereich (Ordner) steht schon in den Pillen – über der Liste nur eine kleine Zeile mit Anzahl und Sortierung
  const countLabel = (items) => (items.length === 1 ? tr("1 Song") : tr("{0} Songs", items.length));
  const group = (title, items, link) => h('section', { class: 'group' },
    h('div', { class: 'list-caption' }, h('span', null, title), link),
    !selecting && h('div', { class: 'list-head s-only', 'aria-hidden': 'true' }, h('span', { class: 'col-title' }, tr("Titel")), h('span', { class: 'col-artist' }, tr("Künstler")), h('span', { class: 'col-inst' }, tr("Instrument")), h('span', { class: 'col-capo' }, tr("Capo")), h('span', { class: 'col-date' }, tr("Bearbeitet"))),
    h('ul', { class: 'list' }, items.map(row)));

  const areaName = (area) => (isTagArea(area) ? '#' + tagOf(area) : area === 'all' ? tr("Alle") : area === 'fav' ? tr("Favoriten") : area === 'none' ? tr("Ohne Ordner") : folderName(area));
  function setArea(area) {
    if (filter.area === area) {
      const f = folders.find((x) => x.id === area);
      if (f) folderMenu(f); // Tipp auf den aktiven Ordner: Ordner verwalten
      return;
    }
    filter.area = area;
    foldersOpen = false;
    saveFilter();
    view.scrollTop = 0;
    renderList(true);
  }
  libSetArea = setArea;
  libNewFolder = () => newFolderFlow();
  libFolderMenu = folderMenu;
  libSongMenu = (id) => { const x = songs.find((y) => y.id === id); if (x) songMenu(x); };
  libRedraw = () => { if (view.isConnected) { drawBars(); renderList(); } };
  function drawChips() {
    const x = chips.scrollLeft;
    const pill = (area, folder) => {
      const on = filter.area === area;
      const b = h('button', { class: 'pill' + (on ? ' on' : ''), role: 'tab', 'aria-selected': String(on), 'data-area': area, onClick: () => setArea(area) },
        area === 'fav' && icon('star', 'small' + (on ? ' filled' : '')), areaName(area));
      if (folder) longPress(b, () => folderMenu(folder));
      return b;
    };
    const withoutFolder = folders.length > 0 && songs.some((s) => !s.folderId || !folderName(s.folderId));
    if (designChoice() === 'sorell') {
      const inFolder = filter.area !== 'all' && filter.area !== 'fav';
      const tags = allTags(songs);
      const syncDrop = () => { folderDrop.classList.toggle('open', foldersOpen); folderDrop.inert = !foldersOpen; };
      const toggle = h('button', { class: 'pill folders' + (inFolder ? ' on' : '') + (foldersOpen ? ' open' : ''), 'data-area': 'folders', 'aria-expanded': String(foldersOpen), onClick: () => {
        haptic();
        foldersOpen = !foldersOpen;
        toggle.classList.toggle('open', foldersOpen);
        toggle.setAttribute('aria-expanded', String(foldersOpen));
        syncDrop();
      } }, h('span', { class: 'pill-text' }, inFolder ? areaName(filter.area) : tr("Ordner")), icon('fold', 'small pill-chev'));
      const row = (area, ic, count, folder) => {
        const on = filter.area === area;
        const b = h('button', { class: 'drop-row' + (on ? ' on' : ''), onClick: () => setArea(area) }, icon(ic, 'small'), h('span', { class: 'drop-name' }, areaName(area)), h('span', { class: 'drop-count' }, String(count)));
        if (folder) longPress(b, () => folderMenu(folder));
        return b;
      };
      // Text-Tabs: Alle (Anzahl), Favoriten, Setlisten, „Ordner ▾“ klappt die Ordnerliste darunter aus
      chips.classList.add('tabs');
      const all = pill('all');
      all.append(h('span', { class: 'tab-n' }, String(songs.length)));
      fill(chips, all, pill('fav'), h('button', { class: 'pill', 'data-area': 'setlists', onClick: () => openSetlists() }, tr("Setlisten")), (folders.length > 0 || tags.length > 0) && toggle);
      fill(folderDrop, h('div', { class: 'folder-drop-in' }, h('div', { class: 'folder-card' },
        folders.map((f) => row(f.id, 'folder', songs.filter((s) => s.folderId === f.id).length, f)),
        withoutFolder && row('none', 'music', songs.filter((s) => !s.folderId || !folderName(s.folderId)).length),
        h('button', { class: 'drop-row add', onClick: () => newFolderFlow() }, icon('plus', 'small'), h('span', { class: 'drop-name' }, tr("Neuer Ordner")))),
        tags.length > 0 && h('div', { class: 'folder-card' }, tags.map((x) => row('tag:' + x.name, 'tag', x.n)))));
      syncDrop();
      folderDrop.classList.toggle('hidden', !songs.length);
    } else fill(chips,
      pill('all'), pill('fav'),
      folders.map((f) => pill(f.id, f)),
      withoutFolder && pill('none'),
      allTags(songs).map((x) => pill('tag:' + x.name)),
      h('button', { class: 'pill add', 'aria-label': tr("Neuer Ordner"), onClick: () => newFolderFlow() }, icon('plus', 'small')));
    chips.scrollLeft = x;
    chips.classList.toggle('hidden', !songs.length);
  }

  function visible() {
    const days = PERIODS[filter.period]?.days || 0;
    const since = days ? Date.now() - days * 864e5 : 0;
    return songs.filter((s) => (filter.inst === 'all' || instrumentOf(s) === filter.inst) && (!since || Date.parse(s.updatedAt) >= since));
  }

  // anim = true: Einträge gleiten nacheinander herein (Öffnen, Filter- und Ordnerwechsel).
  // Bei Suche und Auswahl bleibt die Liste ruhig.
  let animTimer = 0;
  function renderList(anim) {
    list.classList.remove('anim');
    clearTimeout(animTimer);
    drawList();
    if (designChoice() === 'sorell') {
      const n = (query.trim() || filter.area !== 'all' || filter.inst !== 'all' || filter.period !== 'all') ? shown.length : songs.length;
      titleEl.textContent = desk() ? areaTitle(filter.area, folders) : tr("Songs");
      libSub.textContent = countText(n);
      libCount.textContent = n;
      if (splitOn()) drawSidebar();
      drawSongCol();
    }
    if (anim) { void list.offsetWidth; list.classList.add('anim'); animTimer = setTimeout(() => list.classList.remove('anim'), 1000); }
  }

  const sortLink = () => h('button', { class: 'group-link', onClick: () => sortMenu() }, SORTS[sortKey].label);
  function drawList() {
    drawChips();
    const base = visible();
    const sorted = base.slice().sort(SORTS[sortKey].fn);
    const q = query.trim();
    count.textContent = selecting ? tr("{0} ausgewählt", sel.size) : songs.length === 1 ? tr("1 Song") : tr("{0} Songs", songs.length);
    drawBars();
    if (!songs.length) {
      list.replaceChildren(h('div', { class: 'empty' },
        h('div', { class: 'empty-icon' }, icon('music')),
        h('h2', null, tr("Noch keine Songs")),
        h('p', null, tr("Lege deinen ersten Song an – nur der Titel ist nötig.")),
        h('div', { class: 'stack', style: 'max-width:280px;margin:22px auto 0' },
          h('button', { class: 'btn primary', onClick: newSongFlow }, icon('plus', 'small'), tr("Neuer Song")),
          h('button', { class: 'btn', onClick: importFlow }, icon('magic', 'small'), tr("Aus Text erstellen")),
          h('button', { class: 'btn', onClick: async () => { await seedSamples(); showLibrary(); } }, tr("Beispiel-Songs laden")))));
      return;
    }
    const filterHint = (filter.inst !== 'all' || filter.period !== 'all') && h('p', { class: 'form-foot' },
      tr("Gefiltert: {0}.", [filter.inst !== 'all' && INSTRUMENTS[filter.inst].label, filter.period !== 'all' && tr("geändert in den letzten {0}", PERIODS[filter.period].label)].filter(Boolean).join(', ')));
    if (q) {
      // Die Suche durchsucht alle Ordner
      const hits = sorted.filter((s) => groupMatch(s, q));
      shown = hits;
      list.replaceChildren(hits.length ? group(tr("{0} Treffer in allen Ordnern", hits.length), hits)
        : h('div', { class: 'empty' }, h('h2', null, tr("Keine Treffer")), h('p', null, tr("Kein Song passt zu „{0}“.", q))), filterHint || '');
      return;
    }
    const empty = (t) => h('div', { class: 'empty small' }, h('p', null, t));
    if (filter.area === 'fav') {
      const favs = sorted.filter((s) => s.favorite);
      shown = favs;
      fill(list, favs.length ? group(countLabel(favs), favs, sortLink()) : empty(tr("Noch keine Favoriten. Tippe im Menü eines Songs auf „Zu Favoriten“.")), filterHint);
      return;
    }
    if (isTagArea(filter.area)) {
      const tag = tagOf(filter.area);
      const inside = sorted.filter((s) => hasTag(s, tag));
      shown = inside;
      fill(list, inside.length ? group(countLabel(inside), inside, sortLink()) : empty(tr("Kein Song hat das Schlagwort „{0}“.", tag)), filterHint);
      return;
    }
    if (filter.area !== 'all') {
      const f = folders.find((x) => x.id === filter.area);
      const inside = sorted.filter((s) => (f ? s.folderId === f.id : !s.folderId || !folderName(s.folderId)));
      shown = inside;
      const more = f && h('button', { class: 'group-link', 'aria-label': tr("Ordner {0} verwalten", f.name), onClick: () => folderMenu(f) }, tr("Ordner …"));
      fill(list, inside.length ? group(countLabel(inside), inside, more)
        : h('section', { class: 'group' }, h('div', { class: 'list-caption' }, h('span', null, tr("Keine Songs")), more), empty(f ? tr("Dieser Ordner ist leer. Verschiebe Songs über ihr Menü (lange drücken) hierher.") : tr("Alle Songs liegen in Ordnern."))), filterHint);
      return;
    }
    shown = sorted;
    // Nur die Song-Liste – Favoriten gibt es über die Pille „★ Favoriten“
    fill(list,
      sorted.length ? group(countLabel(sorted), sorted, sortLink()) : empty(tr("Keine Songs für diesen Filter.")),
      filterHint);
  }

  const reload = async () => { folders = await listFolders(); renderList(); };

  const songMenu = (s) => openSongMenu(s, { songs, folders: () => folders, render: renderList, reload: () => showLibrary(), newFolder: () => newFolderFlow(true) });

  async function batchMenu() {
    const picked = songs.filter((x) => sel.has(x.id));
    if (!picked.length) return;
    const n = picked.length, label = n === 1 ? tr("1 Song") : tr("{0} Songs", n);
    const allFav = picked.every((x) => x.favorite);
    const done = async (msg) => { await db.flush(); toast(msg); setSelecting(false); };
    actionSheet(label, [
      { section: tr("Ordner & Setlisten") },
      { label: tr("In Ordner verschieben …"), quick: tr("Ordner"), icon: 'folder', onClick: async () => {
        const target = await actionSheet(tr("{0} verschieben nach", label), [...folders.map((f) => ({ label: f.name, sIcon: 'folder', value: f.id })), { label: tr("+ Neuer Ordner …"), sIcon: 'plus', value: '$new' }]);
        if (!target) return;
        let id = target;
        if (target === '$new') { const f = await newFolderFlow(true); if (!f) return; id = f.id; }
        picked.forEach((x) => moveToFolder(x, id));
        await done(tr("{0} verschoben nach „{1}“", label, folderName(id)));
      } },
      { label: tr("Zu Setlist hinzufügen …"), quick: tr("Setlist"), icon: 'list', onClick: async () => { await addToSetlist(picked); setSelecting(false); } },
      { label: tr("An anderes Gerät senden …"), quick: tr("Senden"), icon: 'sync', onClick: () => { const list = picked.slice(); setSelecting(false); openSync({ songs: list, onDone: async () => { await loadUserChords(); showLibrary(); } }); } },
      picked.some((x) => x.folderId) && { label: tr("Aus Ordnern entfernen"), icon: 'close', onClick: async () => { picked.forEach((x) => moveToFolder(x, null)); await done(tr("{0} ohne Ordner – nichts gelöscht", label)); } },
      { section: tr("Bearbeiten & Teilen") },
      { label: allFav ? tr("Aus Favoriten entfernen") : tr("Zu Favoriten"), quick: tr("Favorit"), icon: 'star', onClick: async () => { picked.forEach((x) => { x.favorite = !allFav; touch(x); }); await done(allFav ? tr("Aus Favoriten entfernt") : tr("Zu Favoriten hinzugefügt")); } },
      { label: tr("Als Text oder ChordPro"), icon: 'note', onClick: () => openTextShare(picked.slice().sort(SORTS.title.fn)) },
      { label: tr("Als PDF"), icon: 'doc', onClick: () => pdfFor(picked.slice().sort(SORTS.title.fn)) },
      { label: tr("Als Link (für Plekto)"), icon: 'share', onClick: () => shareSongLink(picked.slice().sort(SORTS.title.fn)) },
      { label: tr("Als Datei (für Plekto)"), icon: 'download', onClick: async () => { const f = await exportSongsFile(picked); offerFile(f.blob, f.filename, { title: `${label} exportieren` }); } },
      { section: ' ' },
      { label: tr("{0} löschen …", label), icon: 'trash', destructive: true, onClick: async () => {
        if (!(await confirmDialog(tr("{0} löschen?", label), sx(tr("Die ausgewählten Songs bleiben {0} Tage unter „Zuletzt gelöscht“ wiederherstellbar.", TRASH_DAYS), tr("{0} Tage wiederherstellbar.", TRASH_DAYS)), { ok: tr("Löschen"), destructive: true }))) return;
        try {
          await trashWithUndo(picked, () => showLibrary());
          for (const x of picked) songs.splice(songs.indexOf(x), 1);
          setSelecting(false);
        } catch (e) { alertDialog(tr("Löschen fehlgeschlagen"), String(e.message || e)); }
      } },
    ]);
  }

  async function newFolderFlow(silent) {
    const name = await ask(tr("Neuer Ordner"), { placeholder: tr("Name, z. B. Lagerfeuer"), ok: tr("Erstellen") });
    if (!name) return null;
    try {
      const f = await createFolder(name);
      await reload();
      if (silent !== true) { filter.area = f.id; saveFilter(); renderList(true); }
      return f;
    } catch (e) { alertDialog(tr("Ordner nicht erstellt"), e.message); return null; }
  }

  async function folderMenu(f) {
    const n = songs.filter((s) => s.folderId === f.id).length;
    actionSheet(tr("Ordner „{0}“ · {1} {2}", f.name, n, n === 1 ? tr("Song") : tr("Songs")), [
      { label: tr("Umbenennen"), quick: tr("Umbenennen"), icon: 'rename', onClick: async () => {
        const name = await ask(tr("Ordner umbenennen"), { value: f.name, ok: tr("Sichern") });
        if (!name) return;
        try { await renameFolder(f, name); await reload(); } catch (e) { alertDialog(tr("Nicht umbenannt"), e.message); }
      } },
      { label: tr("Songs teilen (Datei)"), quick: tr("Teilen"), icon: 'download', disabled: !n, onClick: async () => { const file = await exportSongsFile(songs.filter((s) => s.folderId === f.id)); offerFile(file.blob, file.filename, { title: tr("Ordner „{0}“", f.name) }); } },
      { label: tr("Ordner löschen …"), icon: 'trash', destructive: true, onClick: async () => {
        const ok = await confirmDialog(tr("Ordner löschen?"), n
          ? tr("Die {0} {1} nach „Ohne Ordner“ verschoben und nicht gelöscht. Nur der Ordner „{2}“ wird entfernt.", n, n === 1 ? tr("Song wird") : tr("Songs werden"), f.name)
          : tr("Der leere Ordner „{0}“ wird entfernt.", f.name), { ok: n ? tr("Verschieben & löschen") : tr("Löschen"), destructive: true });
        if (!ok) return;
        const moved = await deleteFolder(f);
        for (const s of songs) if (s.folderId === f.id) s.folderId = null;
        if (filter.area === f.id) { filter.area = 'all'; saveFilter(); }
        toast(moved ? tr("Ordner gelöscht – {0} {1} verschoben", moved, moved === 1 ? tr("Song") : tr("Songs")) : tr("Ordner gelöscht"));
        showLibrary();
      } },
    ], { head: f.name, meta: `${n} ${n === 1 ? tr("Song") : tr("Songs")}` });
  }

  function sortMenu() {
    const body = h('div', null,
      h('div', { class: 'form-label' }, tr("Sortieren nach")),
      segmented(Object.entries(SORTS).map(([value, v]) => ({ value, label: v.label.replace(tr("Zuletzt bearbeitet"), tr("Geändert")) })), sortKey, (v) => { sortKey = v; db.setSetting('sort', v); renderList(true); }),
      h('div', { class: 'form-label', style: 'margin-top:20px' }, tr("Zuletzt geändert")),
      segmented(Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label })), filter.period, (v) => { filter.period = v; saveFilter(); renderList(true); }),
      h('div', { class: 'form-label', style: 'margin-top:20px' }, tr("Instrument")),
      segmented([{ value: 'all', label: tr("Alle") }, ...Object.entries(INSTRUMENTS).map(([value, i]) => ({ value, label: i.label }))], filter.inst, (v) => { filter.inst = v; saveFilter(); renderList(true); }),
      h('div', { class: 'stack', style: 'margin-top:22px' }, h('button', { class: 'btn block', onClick: () => { filter = { inst: 'all', area: 'all', period: 'all' }; saveFilter(); renderList(true); sh.close(); } }, tr("Filter zurücksetzen"))));
    const sh = sheet({ title: tr("Sortieren & Filtern"), body, right: { label: tr("Fertig"), bold: true } });
  }

  drawBars();
  // Zurück aus einem Song: Die Liste steht schon, wo sie war, und gleitet nicht noch einmal herein
  renderList(dir !== 'pop' && !libScroll);
  mount(view, dir, () => { libSelecting = false; libScroll = view.scrollTop; vv?.removeEventListener('resize', lift); vv?.removeEventListener('scroll', lift); });
  if (libScroll) { view.scrollTop = libScroll; nav.classList.toggle('scrolled', view.scrollTop > 8); }
  // Aktiven Ordner waagerecht in die Mitte rücken (scrollIntoView würde auch die Liste verschieben)
  const onPill = chips.querySelector('.pill.on');
  if (onPill) chips.scrollLeft = onPill.offsetLeft - (chips.clientWidth - onPill.offsetWidth) / 2;
  placeBackupBanner();
  remindBackup(songs);
}

// ---------- Zuletzt gelöscht ----------
async function openTrash(onChange) {
  const list = h('div');
  const daysLeft = (e) => Math.max(1, Math.ceil(TRASH_DAYS - (Date.now() - Date.parse(e.deletedAt)) / 864e5));
  const draw = async () => {
    const items = await listTrash();
    fill(list, items.length
      ? [h('ul', { class: 'list' }, items.map((e) => h('li', { class: 'row' },
        h('button', { class: 'row-main', onClick: () => entryMenu(e) },
          h('div', { class: 'row-text' },
            h('div', { class: 'row-title' }, e.song.title),
            h('div', { class: 'row-sub' }, [e.song.artist, `noch ${daysLeft(e)} ${daysLeft(e) === 1 ? tr("Tag") : tr("Tage")}`].filter(Boolean).join(' · ')))),
        h('button', { class: 'row-more', 'aria-label': tr("Optionen für {0}", e.song.title), onClick: () => entryMenu(e) }, icon('more'))))),
      note(tr("Gelöschte Songs bleiben {0} Tage hier, samt Tabs, Fotos und Aufnahmen. Danach werden sie endgültig entfernt.", TRASH_DAYS), tr("Bleiben {0} Tage hier.", TRASH_DAYS), { tag: 'p', cls: 'form-foot', style: 'margin-top:12px' }),
      h('button', { class: 'btn danger block', onClick: async () => {
        if (!(await confirmDialog(tr("Alle endgültig löschen?"), tr("{0} unwiderruflich entfernt.", items.length === 1 ? tr("1 Song wird") : tr("{0} Songs werden", items.length)), { ok: tr("Endgültig löschen"), destructive: true }))) return;
        for (const e of items) await purgeTrashEntry(e);
        draw();
      } }, tr("Alle endgültig löschen"))]
      : h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, icon('trash')), h('h2', null, tr("Nichts gelöscht")), h('p', null, tr("Gelöschte Songs bleiben {0} Tage hier.", TRASH_DAYS))));
  };
  const entryMenu = (e) => actionSheet(e.song.title, [
    { label: tr("Wiederherstellen"), icon: 'undo', onClick: async () => { await restoreFromTrash(e); toast(tr("„{0}“ wiederhergestellt", e.song.title)); changed = true; draw(); } },
    { label: tr("Endgültig löschen …"), icon: 'trash', destructive: true, onClick: async () => {
      if (!(await confirmDialog(tr("Endgültig löschen?"), sx(tr("„{0}“ wird mit Tabs, Fotos und Aufnahmen unwiderruflich entfernt.", e.song.title), tr("Nicht rückgängig zu machen.")), { ok: tr("Endgültig löschen"), destructive: true }))) return;
      await purgeTrashEntry(e);
      draw();
    } },
  ]);
  let changed = false;
  await draw();
  sheet({ title: tr("Zuletzt gelöscht"), body: list, full: true, right: { label: tr("Fertig"), bold: true }, onClose: () => { if (changed) onChange?.(); } });
}

// Löscht man Plekto vom Home-Bildschirm, löscht iOS alle Songs mit – und sagt der App vorher nichts.
// Deshalb erinnern, sobald es Änderungen gibt, die in keiner Backup-Datei stecken.
async function remindBackup(songs) {
  const own = songs.filter((s) => !s.sample);
  if (own.length < (designChoice() === 'sorell' ? 3 : 1)) return;
  const last = await db.getSetting('lastBackupAt');
  const age = last ? (Date.now() - Date.parse(last)) / 864e5 : Infinity;
  const changed = last ? own.filter((s) => Date.parse(s.updatedAt) > Date.parse(last)).length : own.length;
  if (!changed || age < 7) return;
  const shownAt = await db.getSetting('backupReminderAt');
  if (shownAt && Date.now() - Date.parse(shownAt) < 20 * 3600e3) return;
  await db.setSetting('backupReminderAt', new Date().toISOString());
  const what = changed === 1 ? tr("1 Song ist") : tr("{0} Songs sind", changed);
  const viaMail = !!(await getBackupEmail());
  backupBanner = banner(tr("Backup empfohlen"), tr("{0} in keiner Backup-Datei{1}. Wird Plekto gelöscht, sind sie weg.", what, last ? ` (letzte: vor ${Math.floor(age)} Tagen)` : ''), viaMail ? tr("Per Mail sichern") : tr("Jetzt sichern"), viaMail ? mailBackup : backupNow);
  backupBanner.addEventListener('click', (e) => { if (e.target.closest('button')) backupBanner.dataset.closed = '1'; });
  placeBackupBanner();
}
// Plekto: Der Hinweis schwebt nicht über Suche und Tabs, sondern steht als Zeile darunter in der Songliste
var backupBanner = null; // var: wird schon beim ersten Zeichnen der Liste gelesen
function placeBackupBanner() {
  if (!backupBanner || backupBanner.dataset.closed || designChoice() !== 'sorell') return;
  const spot = document.querySelector('.view.library-view .folder-drop');
  if (!spot) { backupBanner.remove(); return; }
  backupBanner.classList.add('in-list');
  spot.after(backupBanner);
}

// Hinweis „Vor dem Löschen der App“ – iOS gibt einer Web-App keine Möglichkeit, das Löschen abzufangen
function deleteAppInfo() {
  const body = h('div', { class: 'guide' },
    note(tr("Plekto speichert alles nur auf diesem iPhone. Wenn du die App vom Home-Bildschirm löschst, löscht iOS alle Songs, Tabs, Fotos und Aufnahmen mit – ohne Rückfrage. Plekto selbst erfährt davon nichts und kann vorher nicht warnen."), tr("Löschst du die App, löscht iOS alle Songs mit."), { tag: 'p', cls: 'hint' }),
    h('div', { class: 'form-label' }, tr("Vor dem Löschen oder Neuinstallieren")),
    h('ol', { class: 'guide-list' },
      ...[[tr("Backup als Datei sichern"), tr("Am besten in iCloud Drive („In Dateien sichern“).")],
        [tr("App löschen oder neu hinzufügen"), null],
        [tr("Backup importieren"), tr("Einstellungen → Backups → Wiederherstellen.")]]
        .map(([t, x], i) => h('li', { class: 'guide-step' }, h('span', { class: 'guide-num' }, String(i + 1)), h('div', null, h('b', null, t), x && h('p', null, x))))),
    h('button', { class: 'btn primary block', style: 'margin-top:14px', onClick: () => { sh.close(); backupNow(); } }, icon('download', 'small'), tr("Backup jetzt sichern")));
  const sh = sheet({ title: tr("Vor dem Löschen der App"), body, full: true, right: { label: tr("Fertig"), bold: true } });
}

// Backup als Datei – nur ein tatsächlich geteiltes/heruntergeladenes Backup zählt als „Datei-Backup“
async function backupNow() {
  try {
    toast(tr("Backup wird erstellt …"), 1200);
    const withMedia = await db.getSetting('backupMedia', true);
    const { blob, filename, counts: c } = await exportBackupFile({ media: withMedia });
    if (canPickFolder() && await getBackupFolder()) {
      // Uhrzeit im Namen: mehrere Backups am selben Tag überschreiben sich nicht
      const t = new Date();
      const stamped = filename.replace('.json', `-${String(t.getHours()).padStart(2, '0')}${String(t.getMinutes()).padStart(2, '0')}.json`);
      try {
        const where = await saveToBackupFolder(blob, stamped);
        if (where) { await markFileExported(); toast(tr("Backup gespeichert in „{0}“", where), 3000); return; }
        toast(sx(tr("Kein Zugriff auf den Backup-Ordner – bitte manuell sichern."), tr("Ordner nicht erreichbar – manuell sichern.")), 3000);
      } catch (e) { toast(sx(tr("Backup-Ordner nicht erreichbar ({0}) – bitte manuell sichern.", e.message || e), tr("Ordner nicht erreichbar – manuell sichern.")), 3500); }
    }
    offerFile(blob, filename, { title: tr("Backup bereit"), onSaved: async () => { await markFileExported(); toast(tr("Backup-Datei gesichert"), 2500); } });
    toast(describeCounts(c), 3000);
  } catch (e) { alertDialog(tr("Backup fehlgeschlagen"), sx(tr("Die Sicherung konnte nicht erstellt werden: {0}", e.message || e), `${e.message || e}`)); }
}

function importFlow() {
  openImporter({ onDone: (song) => openSong(song) });
}

async function newSongFlow() {
  let instrument = (await db.getSetting('lastInstrument', 'guitar')) === 'ukulele' ? 'ukulele' : 'guitar';
  const extra = h('div', { class: 'dlg-extra' }, segmented(Object.entries(INSTRUMENTS).map(([value, i]) => ({ value, label: i.label })), instrument, (v) => { instrument = v; }));
  const title = await ask(tr("Neuer Song"), { placeholder: tr("Titel"), ok: tr("Erstellen"), message: tr("Künstler, Capo, Stimmung und alles Weitere sind optional."), extra, inputLabel: tr("Titel"), extraLabel: tr("Instrument") });
  if (title == null) return;
  db.setSetting('lastInstrument', instrument);
  const song = await createSong(title, instrument);
  openSong(song);
}

async function pdfFor(songs, opts) {
  try {
    toast(tr("PDF wird erstellt …"), 1200);
    const { blob, filename } = await exportSongsPDF(songs, opts);
    offerFile(blob, filename, { title: tr("PDF bereit"), openable: true });
  } catch (e) {
    console.error(e);
    alertDialog(tr("PDF-Export fehlgeschlagen"), String(e.message || e));
  }
}

// ---------- Songbook ----------
async function openSongbook() {
  const songs = (await db.getAll('songs')).sort(SORTS.title.fn);
  if (!songs.length) { toast(tr("Noch keine Songs vorhanden.")); return; }
  const sel = new Set();
  const title = h('input', { class: 'field', value: tr("Songbook"), placeholder: tr("Titel des Songbooks") });
  const list = h('ul', { class: 'list' });
  const info = h('div', { class: 'hint' });
  const draw = () => {
    list.replaceChildren(...songs.map((s) => h('li', { class: 'row selectable' + (sel.has(s.id) ? ' selected' : '') },
      h('button', { class: 'row-main', 'aria-pressed': String(sel.has(s.id)), onClick: () => { if (sel.has(s.id)) sel.delete(s.id); else sel.add(s.id); draw(); } },
        h('span', { class: 'row-check' }, sel.has(s.id) && icon('check', 'small')),
        h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, s.title), s.artist && h('div', { class: 'row-sub' }, s.artist))))));
    info.textContent = tr("{0} von {1} ausgewählt · Reihenfolge alphabetisch, jeder Song beginnt auf einer neuen Seite.", sel.size, songs.length);
  };
  const body = h('div', null,
    title,
    h('div', { class: 'btn-row', style: 'margin:12px 0' },
      h('button', { class: 'btn small', onClick: () => { songs.forEach((s) => sel.add(s.id)); draw(); } }, tr("Alle auswählen")),
      h('button', { class: 'btn small', onClick: () => { sel.clear(); draw(); } }, tr("Keine"))),
    list,
    h('div', { style: 'margin-top:10px' }, info));
  const s = sheet({
    title: tr("Songbook als PDF"), body, full: true, left: { label: tr("Abbrechen") },
    right: { label: tr("Erstellen"), bold: true, onClick: async () => {
      if (!sel.size) { toast(tr("Bitte wähle mindestens einen Song.")); return; }
      s.close();
      await pdfFor(songs.filter((x) => sel.has(x.id)), { title: title.value.trim() || tr("Songbook") });
    } },
  });
  draw();
}

// Fester Backup-Ordner auf dem iPhone: ein Kurzbefehl im Teilen-Menü speichert ohne Rückfrage in einen festen Ordner
function shortcutGuide() {
  const step = (n, title, text) => h('li', { class: 'guide-step' }, h('span', { class: 'guide-num' }, String(n)), h('div', null, h('b', null, title), text && h('p', null, text)));
  const body = h('div', { class: 'guide' },
    note(tr("Safari lässt Web-Apps keinen Ordner merken. Die Kurzbefehle-App von Apple kann das: Du richtest einmal einen Kurzbefehl ein, der jede geteilte Datei ohne Nachfrage in deinen Ordner legt."), tr("Per Kurzbefehl automatisch in einen Ordner sichern."), { tag: 'p', cls: 'hint' }),
    h('div', { class: 'form-label' }, tr("Einmal einrichten (ca. 2 Minuten)")),
    h('ol', { class: 'guide-list' },
      step(1, tr("App „Kurzbefehle“ öffnen"), tr("Unten „Kurzbefehle“ → oben rechts auf „+“.")),
      step(2, tr("Namen geben"), tr("Oben auf den Namen tippen → „Umbenennen“ → z. B. „In Plekto-Ordner sichern“.")),
      step(3, tr("Im Teilen-Menü anzeigen"), tr("Unten auf ⓘ (Details) → „Im Share-Sheet anzeigen“ einschalten. Bei „Empfängt“ reicht „Dateien“.")),
      step(4, tr("Aktion „Datei sichern“ hinzufügen"), tr("Unten in der Suche „Datei sichern“ eingeben und antippen. Als Eingabe steht „Kurzbefehleingabe“ – so lassen.")),
      step(5, tr("Ordner festlegen"), tr("In der Aktion auf den Pfeil › tippen: „Fragen, wo gesichert werden soll“ ausschalten, dann auf den Ordner tippen und z. B. iCloud Drive → neuen Ordner „Plekto“ wählen.")),
      step(6, tr("Fertig tippen"), null)),
    h('div', { class: 'form-label' }, tr("Danach bei jedem Backup")),
    h('ol', { class: 'guide-list' },
      step(1, tr("Backup-Knopf in Plekto"), tr("Einstellungen → Backups → „Backup als Datei sichern“.")),
      step(2, tr("„Teilen / In Dateien sichern“"), null),
      step(3, tr("„In Plekto-Ordner sichern“ antippen"), tr("Die Datei liegt sofort im Ordner, ohne Nachfrage."))),
    note(tr("Tipp: Im Teilen-Menü ganz unten „Aktionen bearbeiten“ → den Kurzbefehl zu den Favoriten hinzufügen, dann steht er ganz oben. Liegt der Ordner in iCloud Drive, sind die Backups auch außerhalb des iPhones sicher und erscheinen am PC (iCloud für Windows bzw. icloud.com) – dort kannst du sie direkt in Plekto importieren."), tr("Tipp: Kurzbefehl als Favorit ablegen."), { tag: 'p', cls: 'form-foot' }));
  sheet({ title: tr("Fester Backup-Ordner"), body, full: true, right: { label: tr("Fertig"), bold: true } });
}

// ---------- Einstellungen ----------
async function appVersion() {
  try {
    const keys = await caches.keys();
    const k = keys.find((x) => x.startsWith('gn-app-'));
    return k ? k.slice(7) : tr("nicht installiert");
  } catch { return tr("nicht installiert"); }
}

async function openSettings() {
  const songs = await db.getAll('songs');
  const sampleCount = songs.filter((s) => s.sample).length;
  const backups = await db.listBackups();
  const lastFile = await db.getSetting('lastBackupAt');
  const backupDir = canPickFolder() ? await getBackupFolder() : null;
  const lastInternal = await db.getSetting('lastInternalBackupAt') || backups[0]?.createdAt;
  const syncStatus = await syncStatusText();
  const trashCount = (await db.getAll('trash')).length;
  const version = await appVersion();
  let usage = '–';
  try { const e = await navigator.storage?.estimate?.(); if (e && e.usage != null) usage = `${(e.usage / 1048576).toFixed(1)} MB`; } catch { /* ignorieren */ }
  let persisted = false;
  try { persisted = await navigator.storage?.persisted?.(); } catch { /* ignorieren */ }
  const offlineReady = !!navigator.serviceWorker?.controller;
  const media = await mediaStats();
  let withMedia = await db.getSetting('backupMedia', true);
  const backupEmail = await getBackupEmail();
  const lastInst = (await db.getSetting('lastInstrument', 'guitar')) === 'ukulele' ? 'ukulele' : 'guitar';
  const fileAge = lastFile ? (Date.now() - Date.parse(lastFile)) / 864e5 : Infinity;
  const sizes = { view: Number(await db.getSetting('viewScale', 1)) || 1, chord: Number(await db.getSetting('chordScale', 1)) || 1 };

  const refresh = () => { sub?.close(); s.close(); showLibrary(); };
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (f && await importBackupFile(f)) { await loadUserChords(); await loadAiConfig(); sortKey = await db.getSetting('sort', sortKey); applyTheme((await db.getSetting('theme', theme)) || 'system'); applyFont(await db.getSetting('font', 'mixed')); applyZoom(zoomLevel()); applyDesign(storedDesign()); refresh(); }
  });
  const label = (t) => h('div', { class: 'form-label' }, t);
  const sorell = designChoice() === 'sorell';
  const desk = sorell && wide.matches;
  // Plekto: Design, Erscheinungsbild und Akzentfarbe stehen gemeinsam in einer Karte
  const swatches = () => {
    const box = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': tr("Akzentfarbe") });
    const draw = () => fill(box, ACCENTS.map(([v, name]) => h('button', {
      class: 'swatch' + (accentChoice() === v ? ' on' : ''), role: 'radio', 'aria-checked': String(accentChoice() === v), 'aria-label': name, 'data-c': v,
      onClick: () => { haptic(); applyAccent(v); draw(); },
    })));
    draw();
    return box;
  };
  const lookCard = () => h('div', { class: 'form-group look-card' },
    CLASSIC_IN_APP && formRow(tr("Design"), segmented([{ value: 'sorell', label: tr("Plekto") }, { value: 'classic', label: tr("Klassisch") }], designChoice(), (v) => { applyDesign(v); updateSplit(sideSong); }), desk ? tr("Plekto ist schwarz-weiß, Klassisch nutzt Farbakzente.") : null),
    formRow(tr("Erscheinungsbild"), segmented([{ value: 'system', label: tr("Automatisch") }, { value: 'light', label: tr("Hell") }, { value: 'dark', label: tr("Dunkel") }], theme, (v) => { applyTheme(v); db.setSetting('theme', v); })),
    h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, tr("Akzentfarbe")), swatches()));
  // Plekto: Beispiel-Abschnitt im aktuellen Stil. Er folgt Erscheinungsbild, Akzentfarbe und Schriftgröße sofort.
  let prevEl = null;
  const preview = () => (prevEl = h('div', { class: 'song-view set-preview', style: `--ts:${sizes.view}` },
    h('section', { class: 'sv-sec', 'data-kind': 'chorus', 'aria-label': tr("Vorschau") },
      h('div', { class: 'sv-sec-name' }, icon('bars', 'small sec-bars'), h('span', { class: 'sec-label' }, tr("Chorus")), h('span', { class: 'sec-info' }, 'D DU UDU')),
      h('div', { class: 'set-prev-row' }, ['G', 'D', 'Em', 'C'].map((c) => h('span', { class: 'prog-chord' }, h('b', null, c))), h('span', { class: 'set-prev-gap' }), h('span', { class: 'repeat-badge' }, '×2')))));
  // Regler für Griffbilder und Schrift, Wert in Prozent
  const sizeRow = (text, key, prop, min, max, step) => {
    const out = h('span', { class: 'size-val' }, `${Math.round(sizes[prop] * 100)}%`);
    const r = h('input', { type: 'range', class: 'slider', min, max, step, value: sizes[prop], 'aria-label': text });
    r.addEventListener('input', () => {
      sizes[prop] = Number(r.value);
      out.textContent = `${Math.round(sizes[prop] * 100)}%`;
      prevEl?.style.setProperty('--ts', sizes.view);
      db.setSetting(key, sizes[prop]);
    });
    return h('label', { class: 'form-row size-row' }, h('span', { class: 'lbl' }, text), r, out);
  };
  // Teile der Seite „Darstellung“, die das klassische Design weiter an derselben Stelle zeigt
  const zoomPart = () => [
    label(tr("App-Größe")),
    h('div', { class: 'seg-block' }, segmented(ZOOMS.map((z) => ({ value: z, label: `${Math.round(z * 100)} %` })), zoomLevel(), (v) => applyZoom(v))),
    note(tr("Verkleinert oder vergrößert die ganze App, wie Zoomen im Browser. Falls sich nichts ändert: App einmal neu starten."), tr("Zoomt die ganze App."), { tag: 'p', cls: 'form-foot' })];
  const fontPart = (title) => [
    label(title),
    h('div', { class: 'seg-block' }, segmented([{ value: 'mixed', label: tr("Gemischt") }, { value: 'system', label: tr("System") }, { value: 'allserif', label: tr("Serif") }], fontChoice(), (v) => applyFont(v))),
    h('p', { class: 'form-foot c-only' }, tr("Gemischt: Überschriften und Bedienung in der Systemschrift, Texte in Serif. System oder Serif: alles in dieser Schrift.")),
    note(tr("Gemischt: die Plekto-Schriften. System oder Serif ersetzen sie, Akkorde und Tabs bleiben in Monospace."), tr("Akkorde und Tabs bleiben Monospace."), { tag: 'p', cls: 'form-foot s-only' })];
  const songPart = () => [
    label(tr("Songs")),
    h('div', { class: 'form-group' },
      formRow(tr("Akkorde"), segmented([{ value: 'inline', label: tr("Nebeneinander") }, { value: 'rows', label: tr("Untereinander") }], chordLayoutPref(), (v) => setChordLayoutPref(v)), null, 'guitar'),
      sorell && formRow(tr("Abschnitte"), segmented([{ value: 'pill', label: tr("Pille") }, { value: 'band', label: tr("Kopfband") }, { value: 'dot', label: tr("Punkt") }], secStyleChoice(), (v) => applySecStyle(v)), null, 'bars')),
    note(tr("Ein einzelner Song kann abweichen: im Song unter ••• → Darstellung."), tr("Pro Song änderbar unter •••."), { tag: 'p', cls: 'form-foot' }),
    label(tr("Große Bildschirme")),
    h('div', { class: 'form-group' },
      formRow(tr("Abschnitte"), segmented([{ value: true, label: tr("Nebeneinander") }, { value: false, label: tr("Untereinander") }], wideMode(), (v) => setWideMode(v)), null, 'app')),
    note(tr("Auf breiten Bildschirmen. Gilt beim nächsten Öffnen eines Songs."), tr("Gilt beim nächsten Song."), { tag: 'p', cls: 'form-foot' })];
  const feelPart = () => [
    label(tr("Rückmeldung")),
    h('div', { class: 'form-group' },
      formRow(tr("Vibration beim Tippen"), toggle(hapticsEnabled(), (v) => { setHaptics(v); if (v) haptic(); }), tr("iPhone ab iOS 18"), 'wave')),
    label(tr("Bereich oben (Uhrzeit, Akku)")),
    h('div', { class: 'seg-block' }, segmented([{ value: 'app', label: tr("Wie die App") }, { value: 'ios', label: tr("System") }], statusBarMode(), (v) => {
      try { localStorage.setItem('gn-statusbar', v); } catch { /* egal */ }
      toast(tr("Wirkt nach dem Neustart der App"), 2500);
    })),
    h('p', { class: 'form-foot' }, tr("Wirkt nach dem Neustart der App."))];

  // Unterseiten wie in iOS: Übersicht mit Kategorien, jede Kategorie öffnet eine eigene Seite
  const PAGES = {
    look: { title: tr("Darstellung"), icon: sorell ? 'palette' : 'sun', keys: tr("design erscheinungsbild hell dunkel automatisch akzentfarbe farbe vorschau griffbilder größe schrift schriftart app-größe zoom vibration haptik statusleiste uhrzeit akku song-ansicht akkorde nebeneinander untereinander abschnitte kopfband pille punkt spalten ipad pc"), sub: { system: tr("Automatisch"), light: tr("Hell"), dark: tr("Dunkel") }[theme], build: () => (sorell ? [
      label(tr("Vorschau")), preview(),
      label(tr("Design")), lookCard(),
      label(tr("Größen")),
      h('div', { class: 'form-group' }, sizeRow(tr("Griffbilder"), 'chordScale', 'chord', 0.8, 2.2, 0.1), sizeRow(tr("Schrift"), 'viewScale', 'view', 0.8, 1.6, 0.05)),
      h('p', { class: 'form-foot' }, tr("Gilt für die Song-Ansicht und den Bearbeiten-Modus.")),
      ...songPart(), ...zoomPart(), ...fontPart(tr("Schriftart")), ...feelPart(),
    ] : [
      label(tr("Design")),
      h('div', { class: 'seg-block' }, segmented([{ value: 'sorell', label: tr("Plekto") }, { value: 'classic', label: tr("Klassisch") }], designChoice(), (v) => { applyDesign(v); updateSplit(sideSong); })),
      label(tr("Erscheinungsbild")),
      h('div', { class: 'seg-block' }, segmented([{ value: 'system', label: tr("Automatisch") }, { value: 'light', label: tr("Hell") }, { value: 'dark', label: tr("Dunkel") }], theme, (v) => { applyTheme(v); db.setSetting('theme', v); })),
      ...zoomPart(), ...fontPart(tr("Schrift")), ...songPart(), ...feelPart(),
    ]) },
    inst: { title: tr("Instrumente & Akkorde"), icon: sorell ? 'music' : 'grid', keys: tr("gitarre ukulele stimmgerät akkorde griffe"), sub: INSTRUMENTS[lastInst].label, build: () => [
      h('div', { class: 'form-group' },
        formRow(tr("Neue Songs"), segmented(Object.entries(INSTRUMENTS).map(([value, i]) => ({ value, label: i.label })), lastInst, (v) => db.setSetting('lastInstrument', v)), null, 'guitar'),
        actionRow(tr("Stimmgerät"), () => openTuner({ instrument: lastInst }), { iconName: 'fork' }),
        actionRow(tr("Akkorde"), () => openChordLibrary(), { iconName: 'grid' })),
      h('p', { class: 'form-foot' }, tr("Griffe nur für einen Song legst du im Song über „+ Griff“ an.")),
    ] },
    backup: { title: tr("Backups"), icon: 'download', keys: tr("sichern datei wiederherstellen import ordner speicher mail email e-mail"), sub: lastFile ? relDay(lastFile) : tr("noch keine Datei"), warn: fileAge > 14, build: () => [
      label(tr("Sichern")),
      h('div', { class: 'form-group' },
        actionRow(tr("Backup als Datei sichern"), backupNow, { iconName: 'download' }),
        actionRow(tr("Backup per Mail senden"), mailBackup, { iconName: 'mail' }),
        h('button', { class: 'form-row action', onClick: async () => { if (await editBackupEmail() != null) { refresh(); openSettings(); } } }, icon('mail', 'row-icon'), h('span', { class: 'action-label' }, tr("E-Mail für Backups")), h('span', { class: 'muted' }, backupEmail || tr("nicht hinterlegt")), icon('chevron', 'small chev')),
        formRow(tr("Letzte Datei"), h('span', { class: 'muted' }, lastFile ? fullDate(lastFile) : tr("noch keine")), null, 'doc'),
        formRow(tr("Fotos & Aufnahmen im Backup"), toggle(withMedia, (v) => { withMedia = v; db.setSetting('backupMedia', v); }), media.count ? tr("{0} Dateien, {1} MB", media.count, (media.bytes / 1048576).toFixed(1)) : tr("noch keine"), 'photo'),
        canPickFolder() && formRow(tr("Backup-Ordner"), h('span', { class: 'muted' }, backupDir?.name || tr("nicht festgelegt")), null, 'folder'),
        canPickFolder() && actionRow(backupDir ? tr("Anderen Backup-Ordner wählen …") : tr("Backup-Ordner wählen …"), async () => {
          try { const d = await pickBackupFolder(); toast(tr("Backups werden in „{0}“ gespeichert", d.name)); refresh(); openSettings(); } catch (e) { if (e?.name !== 'AbortError') alertDialog(tr("Ordner nicht gesetzt"), String(e.message || e)); }
        }, { iconName: 'folder' }),
        canPickFolder() && backupDir && actionRow(tr("Backup-Ordner entfernen"), async () => { await clearBackupFolder(); refresh(); openSettings(); }, { danger: true, iconName: 'trash' }),
        !canPickFolder() && actionRow(tr("Fester Backup-Ordner auf dem iPhone …"), shortcutGuide, { iconName: 'folder' }),
        actionRow(tr("Vor dem Löschen der App …"), deleteAppInfo, { iconName: 'info' })),
      note(tr("Plekto speichert alles nur auf diesem Gerät. Eine Backup-Datei in iCloud Drive oder per Mail in deinem Postfach schützt deine Songs, auch wenn die App gelöscht wird. „Per Mail“ öffnet das Teilen-Menü mit der Datei – dort „Mail“ wählen."), tr("Eine Backup-Datei schützt deine Songs."), { tag: 'p', cls: 'form-foot' }),
      label(tr("Wiederherstellen")),
      h('div', { class: 'form-group' },
        actionRow(tr("Backup oder Song-Datei importieren …"), () => fileInput.click(), { iconName: 'doc' }),
        backups.length > 0 && actionRow(tr("Ordner aus Sicherung wiederherstellen …"), () => restoreFolders(backups), { iconName: 'folder' })),
      note(tr("Importieren führt immer zusammen: Nichts wird gelöscht, Konflikte entscheidest du vorher."), tr("Import löscht nichts."), { tag: 'p', cls: 'form-foot' }),
      backups.length > 0 && label(tr("Interne Sicherungen")),
      backups.length > 0 && h('div', { class: 'form-group' }, backups.map((b) => actionRow(`${fullDate(b.createdAt)} – ${b.reason}`, () => actionSheet(describeCounts(counts(b.data)), [
        { label: tr("Als Datei exportieren"), icon: 'download', onClick: () => { const f = internalBackupFile(b); offerFile(f.blob, f.filename, { title: tr("Sicherung"), onSaved: () => markFileExported() }); } },
        { label: tr("Wiederherstellen (Vorschau) …"), icon: 'undo', onClick: async () => { if (await restoreInternalBackup(b)) { await loadUserChords(); refresh(); } } },
        { label: tr("Nur Ordner wiederherstellen …"), icon: 'folder', onClick: () => restoreFolders([b]) },
      ]), { iconName: 'clock' }))),
      backups.length > 0 && note(tr("Entstehen automatisch, die letzten 10 bleiben. Sie liegen im selben Speicher wie die Songs und schützen nicht, wenn iOS die App-Daten löscht. Dafür braucht es die Datei."), tr("Automatisch, die letzten 10. Ersetzen keine Datei."), { tag: 'p', cls: 'form-foot' }),
      label(tr("Speicher")),
      h('div', { class: 'form-group' },
        formRow(tr("Speicherort"), h('span', { class: 'muted' }, tr("Nur auf diesem Gerät")), null, 'storage'),
        formRow(tr("Belegt"), h('span', { class: 'muted' }, usage), null, 'grid'),
        formRow(tr("Dauerhafter Speicher"), h('span', { class: 'muted' }, persisted ? tr("Aktiv") : tr("Vom System verwaltet")), null, 'check'),
        media.orphans.length > 0 && actionRow(tr("Verwaiste Medien entfernen ({0})", media.orphans.length), async () => {
          if (!(await confirmDialog(tr("Verwaiste Medien entfernen?"), sx(tr("Diese Fotos und Aufnahmen gehören zu keinem vorhandenen Song mehr (z. B. nach „Alles ersetzen“ beim Import)."), tr("Gehören zu keinem Song mehr.")), { ok: tr("Entfernen"), destructive: true }))) return;
          await db.deleteMany(media.orphans.map((m) => ['media', m.id]));
          toast(tr("Entfernt"));
          refresh();
        }, { danger: true, iconName: 'trash' })),
    ] },
    io: { title: tr("Import & Export"), icon: sorell ? 'swap' : 'doc', keys: 'text pdf songbook json export import', build: () => [
      h('div', { class: 'form-group' },
        actionRow(tr("Aus Text erstellen (Apple Notizen …)"), () => { closeAll(); importFlow(); }, { iconName: 'magic' }),
        actionRow(tr("Alle Songs als JSON exportieren"), async () => { const f = await exportSongsFile(songs); offerFile(f.blob, f.filename, { title: tr("Songs-Datei") }); }, { iconName: 'download' }),
        actionRow(tr("Songbook als PDF …"), () => { closeAll(); openSongbook(); }, { iconName: 'doc' })),
      note(tr("Du siehst eine Vorschau, bevor ein neuer Song gespeichert wird. Einzelne Songs teilst du über ihr Menü."), tr("Mit Vorschau vor dem Speichern."), { tag: 'p', cls: 'form-foot' }),
    ] },
    ai: { title: tr('KI-Funktionen'), icon: 'magic', keys: tr("gemini schlüssel modell"), sub: aiConfig().key ? (sorell ? tr("An") : tr("Aktiv")) : tr("Aus"), build: () => [aiSettings()] },
    info: { title: tr("Über Plekto"), icon: 'info', keys: tr("version neuigkeiten beispiel offline datenformat"), sub: version, build: () => [
      h('div', { class: 'form-group' },
        actionRow(tr("Neuigkeiten (Version {0})", NEWS[0].v), openNews, { iconName: 'star' }),
        formRow(tr("App-Version"), h('span', { class: 'muted' }, version), null, 'tag'),
        formRow(tr("Datenformat"), h('span', { class: 'muted' }, 'v' + db.DATA_VERSION), null, 'doc'),
        formRow(tr("Offline verfügbar"), h('span', { class: 'muted' }, offlineReady ? tr("Ja") : tr("Noch nicht")), null, 'check'),
        sampleCount
          ? actionRow(tr("Beispieldaten entfernen ({0})", sampleCount), async () => {
            if (!(await confirmDialog(tr("Beispieldaten entfernen?"), sx(tr("Alle mit „Beispiel“ markierten Songs und ihre Tabs werden gelöscht. Deine eigenen Songs bleiben unberührt."), tr("Nur Beispiel-Songs, deine bleiben.")), { ok: tr("Entfernen"), destructive: true }))) return;
            const n = await removeSamples();
            toast(tr("{0} Beispiel-Songs entfernt", n));
            refresh();
          }, { danger: true, iconName: 'trash' })
          : actionRow(tr("Beispiel-Songs hinzufügen"), async () => { await seedSamples(); toast(tr("Beispiel-Songs hinzugefügt")); refresh(); }, { iconName: 'music' })),
      note(tr("Keine Konten, keine Cloud. Alle Songs liegen ausschließlich in der lokalen Datenbank dieses Geräts. Nur wenn du eine KI-Funktion benutzt, wird der jeweils abgeschickte Text an Google Gemini gesendet."), tr("Alles lokal. KI-Texte gehen an Google."), { tag: 'p', cls: 'form-foot' }),
    ] },
  };
  // Ordner und Ordner-Zuordnungen aus der neuesten passenden Sicherung zurückholen (ändert sonst nichts)
  async function restoreFolders(list) {
    for (const b of list) {
      const plan = await folderRestorePlan(b);
      if (!plan.add.length && !plan.moves.length) continue;
      const msg = [tr("Sicherung vom {0}:", fullDate(b.createdAt)),
        plan.add.length ? tr("• {0} Ordner anlegen: {1}", plan.add.length, plan.add.map((f) => f.name).join(', ')) : '',
        plan.moves.length ? tr("• {0} {1} zurück in {2} Ordner", plan.moves.length, plan.moves.length === 1 ? tr("Song kommt") : tr("Songs kommen"), plan.moves.length === 1 ? 'seinen' : 'ihre') : '',
      ].filter(Boolean).join('\n') + tr("\n\nNur Songs ohne Ordner werden zugeordnet. Inhalte werden nicht verändert, vorher entsteht eine Sicherung.");
      if (!(await confirmDialog(tr("Ordner wiederherstellen?"), msg, { ok: tr("Wiederherstellen") }))) return;
      try { await applyFolderRestore(plan); toast(tr("Ordner wiederhergestellt")); refresh(); } catch (e) { alertDialog(tr("Nicht wiederhergestellt"), String(e.message || e)); }
      return;
    }
    alertDialog(tr("Nichts wiederherzustellen"), list.length === 1 ? sx(tr("In dieser Sicherung gibt es keine Ordner, die jetzt fehlen."), tr("Keine fehlenden Ordner.")) : sx(tr("Keine interne Sicherung enthält Ordner, die jetzt fehlen. Falls du eine Backup-Datei mit den Ordnern hast, importiere sie – der Import ergänzt fehlende Ordner."), tr("Keine fehlenden Ordner in den Sicherungen.")));
  }

  let sub = null;
  const closeAll = () => { sub?.close(); s.close(); };
  // Plekto am PC: Die Unterseiten erscheinen rechts neben der Liste statt als eigenes Blatt
  const pane = desk && h('div', { class: 'set-pane' });
  const openPage = (p, row) => {
    if (desk) {
      fill(pane, h('h2', { class: 'set-h' }, p.title), ...p.build());
      navBox.querySelectorAll('.on').forEach((x) => x.classList.remove('on'));
      row?.classList.add('on');
      return;
    }
    const top = sorell && h('div', { class: 'set-top sub' }, backBtn(() => sub?.close()), h('div', { class: 'set-crumb' }, h('span', null, tr("Einstellungen")), h('h1', { class: 'set-big' }, p.title)));
    sub = sheet({ title: p.title, body: h('div', null, top, ...p.build()), full: true, push: true, cls: sorell ? 'settings-phone' : '', left: { label: tr("Zurück") }, right: { label: tr("Fertig"), bold: true, onClick: closeAll } });
  };
  const backBtn = (onClick) => h('button', { class: 'glass-btn set-back', 'aria-label': tr("Zurück"), onClick }, icon('back'));
  const linkRow = (title, iconName, subText, onClick, warn) => h('button', { class: 'form-row action settings-nav', onClick },
    icon(iconName), h('span', { class: 'set-title' }, title), subText && h('span', { class: 'muted nav-sub' + (warn ? ' warn' : '') }, subText), icon('chevron', 'small chev'));
  const navRow = (p) => { const row = linkRow(p.title, p.icon, p.sub, (e) => openPage(p, e.currentTarget), p.warn); row.dataset.keys = p.keys || ''; p.row = row; return row; };
  // Drei Gruppen: Allgemein, Daten, Extras
  const GROUPS = [
    [tr("Allgemein"), [linkRow('Sprache · Language', 'globe', lang === 'en' ? 'English' : 'Deutsch', async () => {
      const v = await actionSheet('Sprache · Language', [{ label: 'Deutsch', value: 'de' }, { label: 'English', value: 'en' }]);
      if (v && v !== lang) switchLang(v);
    }), navRow(PAGES.look), navRow(PAGES.inst)]],
    [tr("Daten"), [linkRow(tr("Sync"), 'sync', syncStatus, () => openSync({ onDone: async () => { await loadUserChords(); refresh(); } })),
      navRow(PAGES.backup),
      navRow(PAGES.io),
      linkRow(tr("Zuletzt gelöscht"), 'trash', trashCount ? String(trashCount) : '', () => openTrash(() => refresh()))]],
    [tr("Extras"), [navRow(PAGES.ai),
      linkRow(sorell ? tr("Einführung") : tr("Interaktive Einführung"), 'play', '', () => { closeAll(); startTour(); }),
      navRow(PAGES.info)]],
  ];
  const groups = GROUPS.map(([, rows]) => rows);
  const navBox = desk ? h('nav', { class: 'form-group set-nav' }, GROUPS.map(([title, rows]) => [h('div', { class: 'set-nav-cap' }, title), rows])) : null;
  // Plekto am Handy: Suchfeld filtert die Zeilen (auch nach Begriffen auf der jeweiligen Seite)
  const groupEls = sorell && !desk ? GROUPS.map(([title, rows]) => h('section', { class: 'set-group' }, label(title), h('div', { class: 'form-group' }, rows))) : [];
  const findIn = h('input', { type: 'search', placeholder: tr("Einstellung suchen"), 'aria-label': tr("Einstellung suchen"), autocomplete: 'off', enterkeyhint: 'search' });
  findIn.addEventListener('input', () => {
    const q = findIn.value.trim().toLowerCase();
    for (const g of groupEls) {
      let any = false;
      for (const r of g.querySelectorAll('.settings-nav')) {
        const hit = !q || r.textContent.toLowerCase().includes(q) || (r.dataset.keys || '').includes(q);
        r.hidden = !hit;
        any = any || hit;
      }
      g.hidden = !any;
    }
  });
  findIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') findIn.blur(); });
  const body = desk
    ? h('div', { class: 'set-layout' }, navBox, pane, fileInput)
    : sorell
      ? h('div', { class: 'set-home' },
        h('div', { class: 'set-top' }, backBtn(() => closeAll()), h('h1', { class: 'set-big' }, tr("Einstellungen"))),
        h('label', { class: 'set-find' }, icon('search', 'small'), findIn),
        groupEls,
        h('p', { class: 'set-version' }, tr("Plekto {0}", version)),
        fileInput)
      : h('div', null, groups.map((g) => h('div', { class: 'form-group' }, g)), fileInput);

  // Plekto am Handy: eine eigene Seite, die von rechts kommt (wie die Unterseiten), kein Fenster von unten
  const s = sheet({ title: tr("Einstellungen"), body, full: true, push: sorell && !desk, cls: desk ? 'settings-desk' : sorell ? 'settings-phone' : '', right: { label: tr("Fertig"), bold: true }, onClose: () => { settingsOpen = false; closeSettings = null; if (splitOn()) drawSidebar(); } });
  settingsOpen = true;
  closeSettings = () => { sub?.close(); s.close(); };
  if (splitOn()) drawSidebar();
  if (desk) openPage(PAGES.look, PAGES.look.row);
}

// Verbrauchsanzeige: unterscheidet klar zwischen Angaben von Google und lokaler Zählung
function aiUsagePanel() {
  const u = aiUsage();
  const c = aiConfig();
  const today = u.day === new Date().toISOString().slice(0, 10);
  const muted = (t) => h('span', { class: 'muted' }, t);
  return h('details', { class: 'disclosure' },
    h('summary', null, tr("Details")),
    h('div', { class: 'form-group' },
      formRow(tr("Anbieter"), muted(tr("Google Gemini"))),
      formRow(tr("Modell"), muted(c.model)),
      formRow(tr("Anfragen heute"), muted(String(today ? u.requests || 0 : 0))),
      formRow(tr("Token heute"), muted(String(today ? u.tokens || 0 : 0))),
      formRow(tr("Gesamt"), muted(tr("{0} Anfragen, {1} Token", u.totalRequests || 0, u.totalTokens || 0))),
      formRow(tr("Letzte Anfrage"), muted(u.lastOkAt ? fullDate(u.lastOkAt) : '–')),
      u.rateLimitedAt && formRow(tr("Limit zuletzt erreicht"), muted(fullDate(u.rateLimitedAt)))),
    note(tr("Die Zahlen zählt dieses Gerät selbst. Das tatsächliche Limit deines Schlüssels siehst du nur in Google AI Studio."), tr("Gezählt auf diesem Gerät."), { tag: 'p', cls: 'form-foot' }));
}

// KI-Assistent: Schlüssel und Modell. Der Schlüssel bleibt in der lokalen Datenbank und kommt in kein Backup.
function aiSettings() {
  const c = aiConfig();
  const keyIn = h('input', { type: 'password', class: 'ai-key', value: c.key, placeholder: tr("AIza…"), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': tr("Gemini-API-Schlüssel") });
  const modelSel = h('select', { 'aria-label': tr("Modell") });
  const status = h('p', { class: 'form-foot' });
  const connection = () => {
    const u = aiUsage(), k = aiConfig().key;
    if (!k) return tr("Kein Schlüssel");
    if (!navigator.onLine) return tr("Offline");
    if (u.lastError && (!u.lastOkAt || u.lastErrorAt > u.lastOkAt)) return tr("Fehler: {0}", u.lastError);
    return u.lastOkAt ? tr("Verbunden") : tr("Noch nicht verwendet");
  };
  const setModels = (list, current) => {
    const ids = [...new Set([current, ...list.map((m) => m.id)])];
    modelSel.replaceChildren(...ids.map((id) => h('option', { value: id }, list.find((m) => m.id === id)?.label || id)));
    modelSel.value = current;
  };
  setModels([{ id: DEFAULT_MODEL, label: DEFAULT_MODEL }], c.model);
  modelSel.addEventListener('change', async () => { await setAiModel(modelSel.value); status.textContent = tr("Modell: {0}", modelSel.value); });
  const show = () => { status.textContent = aiConfig().key ? tr("Aktiv · Modell {0}. Ohne Internet arbeitet die App wie gewohnt lokal.", aiConfig().model) : tr("Aus. Ohne Schlüssel nutzt die App ausschließlich die lokale Erkennung."); };
  show();
  keyIn.addEventListener('change', async () => { await setAiKey(keyIn.value); show(); });
  const busy = (t) => { status.textContent = t; };
  return h('div', null,
    h('div', { class: 'form-group' },
      formRow(tr("Schlüssel"), keyIn, null, 'key'),
      formRow(tr("Status"), h('span', { class: 'muted' }, connection()), null, 'info'),
      formRow(tr("Modell"), modelSel, null, 'magic'),
      actionRow(tr("Modelle laden"), async () => {
        await setAiKey(keyIn.value);
        if (!aiConfig().key) { toast(sx(tr("Bitte zuerst einen Schlüssel eintragen."), tr("Erst Schlüssel eintragen."))); return; }
        busy(tr("Lade Modelle …"));
        try {
          const list = await listModels();
          if (!list.length) { busy(tr("Keine passenden Modelle gefunden.")); return; }
          // Vorschau-Modelle sind oft noch nicht frei nutzbar: dann das erste stabile Modell nehmen
          const keep = list.some((m) => m.id === aiConfig().model) && !/preview|exp/i.test(aiConfig().model);
          const current = keep ? aiConfig().model : list[0].id;
          setModels(list, current);
          await setAiModel(current);
          busy(tr("{0} Modelle verfügbar · gewählt: {1}", list.length, current));
        } catch (e) { busy(String(e.message || e)); }
      }, { iconName: 'download' }),
      actionRow(tr("Verbindung testen"), async () => {
        await setAiKey(keyIn.value);
        if (!aiConfig().key) { toast(sx(tr("Bitte zuerst einen Schlüssel eintragen."), tr("Erst Schlüssel eintragen."))); return; }
        busy(tr("Teste …"));
        try { await testKey(aiConfig().key); busy(tr("Verbindung funktioniert ({0}).", aiConfig().model)); } catch (e) { busy(String(e.message || e)); }
      }, { iconName: 'magic' }),
      actionRow(tr("Schlüssel erstellen (Google AI Studio)"), () => window.open(KEY_URL, '_blank', 'noopener'), { iconName: 'share' }),
      c.key && actionRow(tr("Schlüssel entfernen"), async () => {
        if (!(await confirmDialog(tr("Schlüssel entfernen?"), sx(tr("Der KI-Assistent wird abgeschaltet. Die App arbeitet weiter vollständig offline."), tr("KI wird abgeschaltet.")), { ok: tr("Entfernen"), destructive: true }))) return;
        await setAiKey('');
        keyIn.value = '';
        show();
      }, { danger: true })),
    status,
    aiUsagePanel(),
    note(tr("Was du mit einer KI-Funktion abschickst, geht an Google. Sende keine privaten Daten."), tr("KI-Texte gehen an Google."), { tag: 'p', cls: 'form-foot' }),
    h('details', { class: 'disclosure' },
      h('summary', null, tr("Datenschutz im Detail")),
      h('div', { class: 'disclosure-text' },
        h('p', null, tr("Der Schlüssel wird nur auf diesem Gerät gespeichert und nie in Backups exportiert.")),
        h('p', null, tr("Anfragen gehen direkt an Google, und nur, wenn du „Mit KI analysieren“, „KI-Idee“, „Alternativen vorschlagen“ oder „Mit KI bearbeiten“ antippst. Im kostenlosen Tarif darf Google Eingaben zur Verbesserung seiner Dienste verwenden.")))));
}

// ---------- Service Worker (Offline-Betrieb & Updates) ----------
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  let updating = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    const offer = (worker) => banner(tr("Neue Version verfügbar"), tr("Deine Songs bleiben beim Aktualisieren unverändert."), tr("Aktualisieren"), async () => {
      await db.flush();
      updating = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  } catch (e) {
    console.warn('Service Worker nicht registriert', e);
  }
}

// ---------- Start ----------
// Erster Start: Sprache wählen. Bestehende Bibliotheken (Update) bleiben ohne Frage auf Deutsch.
function pickLanguage() {
  return new Promise((resolve) => {
    // Ruhig wie die Einstellungen: App-Symbol, kurzer Titel, zwei Zeilen zur Auswahl. Die Sprache des Geräts steht oben.
    const first = /^en/i.test(navigator.language || '') ? 'en' : 'de';
    const choose = (v) => { wrap.classList.add('closing'); setTimeout(() => { wrap.remove(); resolve(v); }, 180); };
    const row = (v, label, sub) => h('button', { class: 'lang-row', onClick: () => choose(v) },
      h('span', { class: 'lang-text' }, h('span', { class: 'lang-name' }, label), h('span', { class: 'lang-sub' }, sub)), icon('chevron', 'small'));
    const rows = [row('de', 'Deutsch', 'Plekto auf Deutsch'), row('en', 'English', 'Plekto in English')];
    if (first === 'en') rows.reverse();
    const wrap = h('div', { class: 'lang-pick', role: 'dialog', 'aria-label': 'Sprache wählen / Choose your language' },
      h('div', { class: 'lang-card' },
        h('img', { class: 'lang-icon', src: 'assets/icons/icon-192.png', alt: '' }),
        h('h1', { class: 'lang-title' }, 'Plekto'),
        h('p', { class: 'lang-hint' }, first === 'en' ? 'Choose your language' : 'Sprache wählen'),
        h('div', { class: 'lang-list' }, rows),
        h('p', { class: 'lang-foot' }, first === 'en' ? 'You can change this later in Settings.' : 'Später änderbar in den Einstellungen.')));
    document.body.append(wrap);
  });
}

async function init() {
  let info;
  try {
    info = await db.initStorage();
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'view' }, h('div', { class: 'empty', style: 'padding-top:30vh' },
      h('h2', null, tr("Lokaler Speicher nicht verfügbar")),
      h('p', null, tr("Die App kann ihre Datenbank nicht öffnen ({0}). Bitte schließe die App vollständig und öffne sie erneut.", e.message || e)))));
    return;
  }
  if (!langChosen) {
    const fresh = !(await db.getAll('songs')).length;
    // Neue Installation: Erscheinungsbild „Hell“ (in den Einstellungen auf Automatisch oder Dunkel umstellbar)
    if (fresh && (await db.getSetting('theme', null)) == null) { applyTheme('light'); await db.setSetting('theme', 'light'); }
    if (fresh && (await pickLanguage()) === 'en') { switchLang('en'); return; }
    setLang('de');
  }
  sortKey = (await db.getSetting('sort', 'updated')) || 'updated';
  if (!SORTS[sortKey]) sortKey = 'updated';
  applyTheme((await db.getSetting('theme', 'system')) || 'system');
  const savedFont = await db.getSetting('font', 'mixed');
  if (savedFont === 'system' || savedFont === 'allserif') applyFont(savedFont);
  // Beispiel-Songs werden nicht mehr automatisch angelegt – nur auf Wunsch (leere Startseite oder Einstellungen).
  await loadUserChords();
  await loadAiConfig();
  await loadAiUsage();
  const f = await db.getSetting('libFilter', null);
  if (f && typeof f === 'object') filter = { inst: ['all', 'guitar', 'ukulele'].includes(f.inst) ? f.inst : 'all', area: typeof f.area === 'string' ? f.area : 'all', period: PERIODS[f.period] ? f.period : 'all' };
  // Fehlende Ordner (Songs verweisen darauf) aus internen Sicherungen zurückholen – vor der automatischen Sicherung
  let repaired = 0;
  try { repaired = await repairMissingFolders(); } catch (e) { console.warn('Ordner-Reparatur fehlgeschlagen', e); }
  window.addEventListener('hashchange', () => route());
  await route(true);
  cleanTrash().catch((e) => console.warn('Papierkorb nicht aufgeräumt', e));
  if (repaired) toast(tr("{0} fehlende{1} wiederhergestellt", repaired, repaired === 1 ? tr("r Ordner") : tr(" Ordner")), 4000);
  if (info.recovered) toast(tr("{0} ungesicherte Änderung(en) wiederhergestellt", info.recovered), 3500);
  if (info.migrated) toast(sx(tr("Daten auf neues Format aktualisiert – eine Sicherung wurde angelegt."), tr("Daten aktualisiert, Sicherung angelegt.")), 4000);
  if (info.migrationError) banner(tr("Datenformat konnte nicht aktualisiert werden"), tr("Deine Daten sind unverändert. Bitte exportiere ein Backup und melde den Fehler."));
  if (info.newerData) banner(tr("Bitte App aktualisieren"), tr("Deine Daten stammen aus einer neueren App-Version. Sie werden nicht verändert."));
  registerSW();
  autoBackup();
  // Nach einem Update einmal zeigen, was neu ist (nicht bei der ersten Installation, nicht mitten in einem Song)
  const isFirstRun = !(await db.getAll('songs')).length;
  if (!linkImport && !location.hash.startsWith('#/song/') && !location.hash.startsWith('#/set/')) setTimeout(() => showNewsOnce(isFirstRun), 900);
}

init();

