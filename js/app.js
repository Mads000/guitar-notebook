// App-Start, Navigation, Startseite „Meine Songs“, Einstellungen und Service-Worker-Updates.
import * as db from './storage.js';
import { h, fill, icon, navBtn, sheet, actionSheet, ask, confirmDialog, alertDialog, toast, banner, segmented, actionRow, formRow, offerFile, relDate, fullDate, toggle, longPress } from './ui.js';
import { createSong, duplicateSong, deleteSong, songMatches, SORTS, touch, INSTRUMENTS, instrumentOf, listFolders, createFolder, renameFolder, deleteFolder, moveToFolder } from './songs.js';
import { showEditor } from './editor.js';
import { loadUserChords, openChordLibrary } from './chords.js';
import { exportBackupFile, importBackupFile, restoreInternalBackup, internalBackupFile, describeCounts, counts, markFileExported, exportSongsFile, autoBackup, repairMissingFolders, folderRestorePlan, applyFolderRestore, canPickFolder, getBackupFolder, pickBackupFolder, clearBackupFolder, saveToBackupFolder } from './backup.js';
import { openSync } from './sync.js';
import { openSetlists, addToSetlist, setlistSongs, newSetlist } from './setlists.js';
import { startTour } from './tour.js';
import { haptic, hapticsEnabled, setHaptics } from './ui.js';
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
// Schrift: Serif (Standard, ähnlich wie bei Claude) oder die System-Schrift des Geräts
function applyFont(v) {
  if (v === 'system') document.documentElement.dataset.font = 'system';
  else delete document.documentElement.dataset.font;
  try { if (v === 'system') localStorage.setItem('gn-font', 'system'); else localStorage.removeItem('gn-font'); } catch { /* ignorieren */ }
  db.setSetting('font', v === 'system' ? 'system' : 'serif');
}
// App-Symbol auf dem Home-Bildschirm: dunkel (Standard) oder hell. iOS übernimmt es beim Hinzufügen zum Home-Bildschirm.
const iconMode = () => { try { return localStorage.getItem('gn-icon') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } };
function applyIcon(v) {
  try { if (v === 'light') localStorage.setItem('gn-icon', 'light'); else localStorage.removeItem('gn-icon'); } catch { /* egal */ }
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', v === 'light' ? 'assets/icons/icon-light-180.png' : 'assets/icons/icon-180.png');
}
const statusBarMode = () => { try { return localStorage.getItem('gn-statusbar') === 'ios' ? 'ios' : 'app'; } catch { return 'app'; } };
function updateThemeColor() {
  const bg = current ? getComputedStyle(current.el).backgroundColor : getComputedStyle(document.body).backgroundColor;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => setTimeout(updateThemeColor, 50));

// ---------- Navigation ----------
let routeToken = 0;
async function route(initial) {
  const token = ++routeToken;
  const first = initial === true;
  await db.flush();
  const m = location.hash.match(/^#\/song\/(.+)$/);
  if (m) {
    const song = await db.get('songs', decodeURIComponent(m[1]));
    if (token !== routeToken) return;
    if (song) {
      await showEditor(song, { mount: (el, dir, cleanup) => mount(el, first ? null : dir, cleanup), goHome });
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
      return;
    }
    history.replaceState(null, '', '#/');
  }
  if (token !== routeToken) return;
  await showLibrary(first || !current ? null : 'pop');
}

function goHome() {
  if (location.hash.startsWith('#/song/') || location.hash.startsWith('#/set/')) location.hash = '#/';
  else route();
}
const openSong = (s) => { location.hash = '#/song/' + encodeURIComponent(s.id); };

// ---------- Startseite ----------
// Filter: Instrument, Bereich (alle / Favoriten / ohne Ordner / Ordner-ID) und Zeitraum der letzten Änderung
let filter = { inst: 'all', area: 'all', period: 'all' };
const PERIODS = { all: { label: 'Alle', days: 0 }, 7: { label: '7 Tage', days: 7 }, 30: { label: '30 Tage', days: 30 }, 365: { label: '1 Jahr', days: 365 } };
const saveFilter = () => db.setSetting('libFilter', filter);

async function showLibrary(dir = null) {
  const songs = await db.getAll('songs');
  let folders = await listFolders();
  if (!['all', 'fav', 'none'].includes(filter.area) && !folders.some((f) => f.id === filter.area)) filter.area = 'all';
  const view = h('div', { class: 'view library-view' });
  // Auswahlmodus: mehrere Songs gemeinsam verschieben, exportieren oder löschen
  let selecting = false, shown = [];
  const sel = new Set();
  // Aufbau wie in Apple Notizen: oben Titel + ein Menü, Ordner als aufklappbare Liste,
  // unten eine schwebende Leiste mit Filter, Suche und „+“
  const navRight = h('div', { class: 'nav-right' });
  const nav = h('header', { class: 'navbar' },
    h('div', { class: 'nav-row' },
      h('div', { class: 'nav-left' }),
      h('div', { class: 'nav-title' }, 'Meine Songs'),
      navRight));
  const searchInput = h('input', { type: 'search', placeholder: 'Suchen', value: query, 'aria-label': 'Songs durchsuchen', autocomplete: 'off', enterkeyhint: 'search' });
  const searchBox = h('div', { class: 'search glass' + (query ? ' has-text' : '') }, icon('search', 'small'), searchInput,
    h('button', { class: 'clear', 'aria-label': 'Suche leeren', onClick: () => { searchInput.value = ''; query = ''; searchBox.classList.remove('has-text'); renderList(); } }, icon('close', 'small')));
  searchInput.addEventListener('input', () => { query = searchInput.value; searchBox.classList.toggle('has-text', !!query); renderList(); });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchInput.blur(); });
  const chips = h('div', { class: 'folder-menu' });
  const list = h('div');
  const content = h('main', { class: 'content' }, h('h1', { class: 'large-title' }, 'Meine Songs'), chips, list);
  const count = h('span', { class: 'toolbar-info' });
  const toolbar = h('footer', { class: 'float-bar' });
  const filterBtn = h('button', { class: 'glass-btn', 'aria-label': 'Sortieren und filtern', onClick: () => sortMenu() }, icon('filter'));
  const plusBtn = h('button', { class: 'glass-btn', 'aria-label': 'Neu', onClick: () => newMenu() }, icon('plus'));
  function drawBars() {
    fill(navRight, selecting
      ? h('button', { class: 'glass-btn text', onClick: () => setSelecting(false) }, 'Fertig')
      : h('button', { class: 'glass-btn', 'aria-label': 'Menü', onClick: () => mainMenu() }, icon('more')));
    filterBtn.classList.toggle('on', filter.inst !== 'all' || filter.period !== 'all');
    fill(toolbar, selecting
      ? [h('button', { class: 'glass-btn text', onClick: () => { const all = shown.every((x) => sel.has(x.id)); shown.forEach((x) => (all ? sel.delete(x.id) : sel.add(x.id))); renderList(); } }, shown.length && shown.every((x) => sel.has(x.id)) ? 'Keine' : 'Alle'),
        count,
        h('button', { class: 'glass-btn text bold', disabled: !sel.size, onClick: batchMenu }, 'Aktionen')]
      : [filterBtn, searchBox, plusBtn]);
    toolbar.classList.toggle('selecting', selecting);
  }
  function setSelecting(on) { selecting = on; sel.clear(); drawBars(); renderList(); }
  function mainMenu() {
    actionSheet('Meine Songs', [
      { label: 'Songs auswählen', icon: 'check', onClick: () => setSelecting(true) },
      { label: 'Sortieren & Filtern …', icon: 'sort', onClick: () => sortMenu() },
      { label: 'Setlisten', icon: 'list', onClick: () => openSetlists() },
      { section: ' ' },
      { label: 'Backup sichern', icon: 'download', onClick: backupNow },
      { label: 'Einstellungen', icon: 'settings', onClick: openSettings },
    ]);
  }
  function newMenu() {
    actionSheet('Neu', [
      { label: 'Neuer Song', icon: 'compose', onClick: newSongFlow },
      { label: 'Song aus Text, Foto oder KI …', icon: 'magic', onClick: importFlow },
      { section: ' ' },
      { label: 'Setlist', icon: 'list', onClick: () => newSetlist() },
      { label: 'Ordner', icon: 'folder', onClick: () => newFolderFlow() },
    ]);
  }
  view.append(nav, content, toolbar);
  view.addEventListener('scroll', () => nav.classList.toggle('scrolled', view.scrollTop > 44), { passive: true });
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
          h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, s.title), h('div', { class: 'row-sub' }, [s.artist, instrumentOf(s) === 'ukulele' && 'Ukulele', folderName(s.folderId)].filter(Boolean).join('  ·  ')))));
    }
    const main = h('button', { class: 'row-main', onClick: () => openSong(s) },
      h('div', { class: 'row-text' },
        h('div', { class: 'row-title' }, s.title, s.sample && h('span', { class: 'badge' }, 'Beispiel')),
        h('div', { class: 'row-sub' }, [relDate(s.updatedAt), s.artist, instrumentOf(s) === 'ukulele' && 'Ukulele', filter.area === 'all' && folderName(s.folderId)].filter(Boolean).join('  ·  '))),
      s.favorite && icon('star', 'small filled row-star'));
    const li = h('li', { class: 'row', style: `--i:${Math.min(i, 14) + 1}` }, main, h('button', { class: 'row-more', 'aria-label': `Optionen für ${s.title}`, onClick: () => songMenu(s) }, icon('more')));
    longPress(li, () => songMenu(s));
    return li;
  };
  // Der Bereich (Ordner) steht schon im Ordner-Menü – die Liste zeigt nur noch die Anzahl
  const countLabel = (items) => (items.length === 1 ? '1 Song' : `${items.length} Songs`);
  const group = (title, items, link) => h('section', { class: 'group' },
    h('div', { class: 'group-head' }, h('h2', { class: 'group-title' }, title), link),
    h('ul', { class: 'list' }, items.map(row)));

  // Ordner als aufklappbare Liste (statt Pillen nebeneinander); zugeklappt steht nur der aktuelle Bereich da
  let foldOpen = false;
  try { foldOpen = localStorage.getItem('gn-folders-open') === '1'; } catch { /* zu */ }
  const inArea = (area) => (area === 'all' ? songs : area === 'fav' ? songs.filter((s) => s.favorite)
    : area === 'none' ? songs.filter((s) => !s.folderId || !folderName(s.folderId)) : songs.filter((s) => s.folderId === area));
  const areaName = (area) => (area === 'all' ? 'Alle Songs' : area === 'fav' ? 'Favoriten' : area === 'none' ? 'Ohne Ordner' : folderName(area));
  const areaIcon = (area) => (area === 'all' ? 'music' : area === 'fav' ? 'star' : 'folder');
  function setOpen(v) {
    foldOpen = v;
    try { localStorage.setItem('gn-folders-open', v ? '1' : '0'); } catch { /* egal */ }
    drawChips();
  }
  function drawChips() {
    const item = (area, folder) => {
      const on = filter.area === area;
      const b = h('button', { class: 'fold-item' + (on ? ' on' : ''), role: 'menuitemradio', 'aria-checked': String(on),
        onClick: () => { filter.area = area; saveFilter(); setOpen(false); renderList(true); } },
      icon(areaIcon(area), 'small'), h('span', { class: 'fold-name' }, areaName(area)), h('span', { class: 'fold-count' }, String(inArea(area).length)),
      on ? icon('check', 'small fold-check') : h('span', { class: 'fold-check' }));
      if (folder) longPress(b, () => folderMenu(folder));
      return b;
    };
    fill(chips,
      h('button', { class: 'fold-head', 'aria-expanded': String(foldOpen), 'aria-label': `Ordner: ${areaName(filter.area)}`, onClick: () => setOpen(!foldOpen) },
        icon(areaIcon(filter.area), 'small'), h('span', { class: 'fold-name' }, areaName(filter.area)),
        h('span', { class: 'fold-count' }, String(inArea(filter.area).length)), icon('chevron', 'small fold-chev')),
      foldOpen && h('div', { class: 'fold-list', role: 'menu' },
        item('all'), item('fav'), folders.length > 0 && item('none'),
        folders.length > 0 && h('div', { class: 'fold-sep' }, 'Ordner'),
        ...folders.map((f) => item(f.id, f)),
        h('button', { class: 'fold-item add', onClick: () => newFolderFlow() }, icon('plus', 'small'), h('span', { class: 'fold-name' }, 'Neuer Ordner'))));
    chips.classList.toggle('open', foldOpen);
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
    if (anim) { void list.offsetWidth; list.classList.add('anim'); animTimer = setTimeout(() => list.classList.remove('anim'), 1000); }
  }

  function drawList() {
    drawChips();
    const base = visible();
    const sorted = base.slice().sort(SORTS[sortKey].fn);
    const q = query.trim();
    count.textContent = selecting ? `${sel.size} ausgewählt` : songs.length === 1 ? '1 Song' : `${songs.length} Songs`;
    drawBars();
    if (!songs.length) {
      list.replaceChildren(h('div', { class: 'empty' },
        h('div', { class: 'empty-icon' }, icon('music')),
        h('h2', null, 'Noch keine Songs'),
        h('p', null, 'Lege deinen ersten Song an – nur der Titel ist nötig.'),
        h('div', { class: 'stack', style: 'max-width:280px;margin:22px auto 0' },
          h('button', { class: 'btn primary', onClick: newSongFlow }, icon('plus', 'small'), 'Neuer Song'),
          h('button', { class: 'btn', onClick: importFlow }, icon('magic', 'small'), 'Aus Text erstellen'),
          h('button', { class: 'btn', onClick: async () => { await seedSamples(); showLibrary(); } }, 'Beispiel-Songs laden'))));
      return;
    }
    const filterHint = (filter.inst !== 'all' || filter.period !== 'all') && h('p', { class: 'form-foot' },
      `Gefiltert: ${[filter.inst !== 'all' && INSTRUMENTS[filter.inst].label, filter.period !== 'all' && `geändert in den letzten ${PERIODS[filter.period].label}`].filter(Boolean).join(', ')}.`);
    if (q) {
      // Die Suche durchsucht alle Ordner
      const hits = sorted.filter((s) => songMatches(s, q));
      shown = hits;
      list.replaceChildren(hits.length ? group(`${hits.length} Treffer in allen Ordnern`, hits)
        : h('div', { class: 'empty' }, h('h2', null, 'Keine Treffer'), h('p', null, `Kein Song passt zu „${q}“.`)), filterHint || '');
      return;
    }
    const empty = (t) => h('div', { class: 'empty small' }, h('p', null, t));
    if (filter.area === 'fav') {
      const favs = sorted.filter((s) => s.favorite);
      shown = favs;
      fill(list, favs.length ? group(countLabel(favs), favs) : empty('Noch keine Favoriten. Tippe im Menü eines Songs auf „Zu Favoriten“.'), filterHint);
      return;
    }
    if (filter.area !== 'all') {
      const f = folders.find((x) => x.id === filter.area);
      const inside = sorted.filter((s) => (f ? s.folderId === f.id : !s.folderId || !folderName(s.folderId)));
      shown = inside;
      const more = f && h('button', { class: 'group-link', 'aria-label': `Ordner ${f.name} verwalten`, onClick: () => folderMenu(f) }, 'Ordner …');
      fill(list, inside.length ? group(countLabel(inside), inside, more)
        : h('section', { class: 'group' }, h('div', { class: 'group-head' }, h('h2', { class: 'group-title' }, ''), more), empty(f ? 'Dieser Ordner ist leer. Verschiebe Songs über ihr Menü (⋯ oder lange drücken) hierher.' : 'Alle Songs liegen in Ordnern.')), filterHint);
      return;
    }
    shown = sorted;
    // Nur die Song-Liste – Favoriten gibt es über die Pille „★ Favoriten“
    fill(list,
      sorted.length ? group(countLabel(sorted), sorted, h('button', { class: 'group-link', onClick: () => sortMenu() }, SORTS[sortKey].label)) : empty('Keine Songs für diesen Filter.'),
      filterHint);
  }

  const reload = async () => { folders = await listFolders(); renderList(); };

  async function pickFolder(s) {
    const target = await actionSheet(`„${s.title}“ verschieben nach`, [
      ...folders.map((f) => ({ label: f.name + (s.folderId === f.id ? '  ✓' : ''), value: f.id, disabled: s.folderId === f.id })),
      { label: '+ Neuer Ordner …', value: '$new' },
    ]);
    if (!target) return;
    let id = target;
    if (target === '$new') { const f = await newFolderFlow(true); if (!f) return; id = f.id; }
    moveToFolder(s, id);
    await db.flush();
    toast(`Verschoben nach „${folderName(id)}“`);
    renderList();
  }

  async function songMenu(s) {
    actionSheet(s.title, [
      { section: 'Song' },
      { label: s.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten', icon: 'star', onClick: async () => { s.favorite = !s.favorite; touch(s); await db.flush(); renderList(); } },
      { label: 'Umbenennen', icon: 'rename', onClick: async () => { const n = await ask('Song umbenennen', { value: s.title, ok: 'Sichern' }); if (n) { s.title = n; touch(s); await db.flush(); renderList(); } } },
      { section: 'Ordner & Setlisten' },
      { label: 'In Ordner verschieben …', icon: 'folder', onClick: () => pickFolder(s) },
      { label: 'Zu Setlist hinzufügen …', icon: 'list', onClick: () => addToSetlist([s]) },
      s.folderId && folderName(s.folderId) && { label: `Aus Ordner „${folderName(s.folderId)}“ entfernen`, icon: 'close', onClick: async () => { moveToFolder(s, null); await db.flush(); toast('Aus Ordner entfernt – der Song bleibt erhalten'); renderList(); } },
      { section: 'Bearbeiten & Teilen' },
      { label: 'Duplizieren', icon: 'copy', onClick: async () => { const c = await duplicateSong(s); songs.push(c); renderList(); toast('Kopie erstellt'); } },
      { label: 'Teilen …', icon: 'share', onClick: () => actionSheet('Teilen', [
        { label: 'Als PDF', icon: 'doc', onClick: () => pdfFor([s]) },
        { label: 'Als Datei (für Sorell)', icon: 'download', onClick: async () => { const f = await exportSongsFile([s]); offerFile(f.blob, f.filename, { title: 'Song-Datei' }); } },
      ]) },
      { section: ' ' },
      { label: 'Löschen …', icon: 'trash', destructive: true, onClick: async () => {
        if (!(await confirmDialog('Song löschen?', `„${s.title}“ wird mit allen Abschnitten, Tabs, Fotos und Aufnahmen endgültig gelöscht.`, { ok: 'Löschen', destructive: true }))) return;
        await deleteSong(s);
        songs.splice(songs.indexOf(s), 1);
        renderList();
        toast('Song gelöscht');
      } },
    ]);
  }

  async function batchMenu() {
    const picked = songs.filter((x) => sel.has(x.id));
    if (!picked.length) return;
    const n = picked.length, label = n === 1 ? '1 Song' : `${n} Songs`;
    const allFav = picked.every((x) => x.favorite);
    const done = async (msg) => { await db.flush(); toast(msg); setSelecting(false); };
    actionSheet(label, [
      { section: 'Ordner & Setlisten' },
      { label: 'In Ordner verschieben …', icon: 'folder', onClick: async () => {
        const target = await actionSheet(`${label} verschieben nach`, [...folders.map((f) => ({ label: f.name, value: f.id })), { label: '+ Neuer Ordner …', value: '$new' }]);
        if (!target) return;
        let id = target;
        if (target === '$new') { const f = await newFolderFlow(true); if (!f) return; id = f.id; }
        picked.forEach((x) => moveToFolder(x, id));
        await done(`${label} verschoben nach „${folderName(id)}“`);
      } },
      { label: 'Zu Setlist hinzufügen …', icon: 'list', onClick: async () => { await addToSetlist(picked); setSelecting(false); } },
      picked.some((x) => x.folderId) && { label: 'Aus Ordnern entfernen', icon: 'close', onClick: async () => { picked.forEach((x) => moveToFolder(x, null)); await done(`${label} ohne Ordner – nichts gelöscht`); } },
      { section: 'Bearbeiten & Teilen' },
      { label: allFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten', icon: 'star', onClick: async () => { picked.forEach((x) => { x.favorite = !allFav; touch(x); }); await done(allFav ? 'Aus Favoriten entfernt' : 'Zu Favoriten hinzugefügt'); } },
      { label: 'Als PDF', icon: 'doc', onClick: () => pdfFor(picked.slice().sort(SORTS.title.fn)) },
      { label: 'Als Datei (für Sorell)', icon: 'download', onClick: async () => { const f = await exportSongsFile(picked); offerFile(f.blob, f.filename, { title: `${label} exportieren` }); } },
      { section: ' ' },
      { label: `${label} löschen …`, icon: 'trash', destructive: true, onClick: async () => {
        if (!(await confirmDialog(`${label} löschen?`, `Die ausgewählten Songs werden mit Tabs, Fotos und Aufnahmen gelöscht. Vorher wird eine interne Sicherung angelegt.`, { ok: 'Löschen', destructive: true }))) return;
        try {
          await db.flush();
          await db.addBackup(`Vor Löschen von ${label}`);
          for (const x of picked) { await deleteSong(x); songs.splice(songs.indexOf(x), 1); }
          await done(`${label} gelöscht`);
        } catch (e) { alertDialog('Löschen fehlgeschlagen', String(e.message || e)); }
      } },
    ]);
  }

  async function newFolderFlow(silent) {
    const name = await ask('Neuer Ordner', { placeholder: 'Name, z. B. Lagerfeuer', ok: 'Erstellen' });
    if (!name) return null;
    try {
      const f = await createFolder(name);
      await reload();
      if (silent !== true) { filter.area = f.id; saveFilter(); renderList(true); }
      return f;
    } catch (e) { alertDialog('Ordner nicht erstellt', e.message); return null; }
  }

  async function folderMenu(f) {
    const n = songs.filter((s) => s.folderId === f.id).length;
    actionSheet(`Ordner „${f.name}“ · ${n} ${n === 1 ? 'Song' : 'Songs'}`, [
      { label: 'Umbenennen', icon: 'rename', onClick: async () => {
        const name = await ask('Ordner umbenennen', { value: f.name, ok: 'Sichern' });
        if (!name) return;
        try { await renameFolder(f, name); await reload(); } catch (e) { alertDialog('Nicht umbenannt', e.message); }
      } },
      { label: 'Songs teilen (Datei)', icon: 'download', disabled: !n, onClick: async () => { const file = await exportSongsFile(songs.filter((s) => s.folderId === f.id)); offerFile(file.blob, file.filename, { title: `Ordner „${f.name}“` }); } },
      { label: 'Ordner löschen …', icon: 'trash', destructive: true, onClick: async () => {
        const ok = await confirmDialog('Ordner löschen?', n
          ? `Die ${n} ${n === 1 ? 'Song wird' : 'Songs werden'} nach „Ohne Ordner“ verschoben und nicht gelöscht. Nur der Ordner „${f.name}“ wird entfernt.`
          : `Der leere Ordner „${f.name}“ wird entfernt.`, { ok: n ? 'Verschieben & löschen' : 'Löschen', destructive: true });
        if (!ok) return;
        const moved = await deleteFolder(f);
        for (const s of songs) if (s.folderId === f.id) s.folderId = null;
        if (filter.area === f.id) { filter.area = 'all'; saveFilter(); }
        toast(moved ? `Ordner gelöscht – ${moved} ${moved === 1 ? 'Song' : 'Songs'} verschoben` : 'Ordner gelöscht');
        showLibrary();
      } },
    ]);
  }

  function sortMenu() {
    const body = h('div', null,
      h('div', { class: 'form-label' }, 'Sortieren nach'),
      segmented(Object.entries(SORTS).map(([value, v]) => ({ value, label: v.label.replace('Zuletzt bearbeitet', 'Geändert') })), sortKey, (v) => { sortKey = v; db.setSetting('sort', v); renderList(true); }),
      h('div', { class: 'form-label', style: 'margin-top:20px' }, 'Zuletzt geändert'),
      segmented(Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label })), filter.period, (v) => { filter.period = v; saveFilter(); renderList(true); }),
      h('div', { class: 'form-label', style: 'margin-top:20px' }, 'Instrument'),
      segmented([{ value: 'all', label: 'Alle' }, ...Object.entries(INSTRUMENTS).map(([value, i]) => ({ value, label: i.label }))], filter.inst, (v) => { filter.inst = v; saveFilter(); renderList(true); }),
      h('div', { class: 'stack', style: 'margin-top:22px' }, h('button', { class: 'btn block', onClick: () => { filter = { inst: 'all', area: 'all', period: 'all' }; saveFilter(); renderList(true); sh.close(); } }, 'Filter zurücksetzen')));
    const sh = sheet({ title: 'Sortieren & Filtern', body, right: { label: 'Fertig', bold: true } });
  }

  drawBars();
  renderList(true);
  mount(view, dir, () => { vv?.removeEventListener('resize', lift); vv?.removeEventListener('scroll', lift); });
  remindBackup(songs);
}

// Löscht man Sorell vom Home-Bildschirm, löscht iOS alle Songs mit – und sagt der App vorher nichts.
// Deshalb erinnern, sobald es Änderungen gibt, die in keiner Backup-Datei stecken.
async function remindBackup(songs) {
  const own = songs.filter((s) => !s.sample);
  if (!own.length) return;
  const last = await db.getSetting('lastBackupAt');
  const age = last ? (Date.now() - Date.parse(last)) / 864e5 : Infinity;
  const changed = last ? own.filter((s) => Date.parse(s.updatedAt) > Date.parse(last)).length : own.length;
  if (!changed || age < 7) return;
  const shownAt = await db.getSetting('backupReminderAt');
  if (shownAt && Date.now() - Date.parse(shownAt) < 20 * 3600e3) return;
  await db.setSetting('backupReminderAt', new Date().toISOString());
  const what = changed === 1 ? '1 Song ist' : `${changed} Songs sind`;
  banner('Backup empfohlen', `${what} in keiner Backup-Datei${last ? ` (letzte: vor ${Math.floor(age)} Tagen)` : ''}. Wird Sorell gelöscht, sind sie weg.`, 'Jetzt sichern', backupNow);
}

// Hinweis „Vor dem Löschen der App“ – iOS gibt einer Web-App keine Möglichkeit, das Löschen abzufangen
function deleteAppInfo() {
  const body = h('div', { class: 'guide' },
    h('p', { class: 'hint' }, 'Sorell speichert alles nur auf diesem iPhone. Wenn du die App vom Home-Bildschirm löschst, löscht iOS alle Songs, Tabs, Fotos und Aufnahmen mit – ohne Rückfrage. Sorell selbst erfährt davon nichts und kann vorher nicht warnen.'),
    h('div', { class: 'form-label' }, 'Vor dem Löschen oder Neuinstallieren'),
    h('ol', { class: 'guide-list' },
      ...[['Backup als Datei sichern', 'Am besten in iCloud Drive („In Dateien sichern“).'],
        ['App löschen oder neu hinzufügen', null],
        ['Backup importieren', 'Einstellungen → Backups → „Backup oder Song-Datei importieren …“.']]
        .map(([t, x], i) => h('li', { class: 'guide-step' }, h('span', { class: 'guide-num' }, String(i + 1)), h('div', null, h('b', null, t), x && h('p', null, x))))),
    h('button', { class: 'btn primary block', style: 'margin-top:14px', onClick: () => { sh.close(); backupNow(); } }, icon('download', 'small'), 'Backup jetzt sichern'));
  const sh = sheet({ title: 'Vor dem Löschen der App', body, full: true, right: { label: 'Fertig', bold: true } });
}

// Backup als Datei – nur ein tatsächlich geteiltes/heruntergeladenes Backup zählt als „Datei-Backup“
async function backupNow() {
  try {
    toast('Backup wird erstellt …', 1200);
    const withMedia = await db.getSetting('backupMedia', true);
    const { blob, filename, counts: c } = await exportBackupFile({ media: withMedia });
    if (canPickFolder() && await getBackupFolder()) {
      // Uhrzeit im Namen: mehrere Backups am selben Tag überschreiben sich nicht
      const t = new Date();
      const stamped = filename.replace('.json', `-${String(t.getHours()).padStart(2, '0')}${String(t.getMinutes()).padStart(2, '0')}.json`);
      try {
        const where = await saveToBackupFolder(blob, stamped);
        if (where) { await markFileExported(); toast(`Backup gespeichert in „${where}“`, 3000); return; }
        toast('Kein Zugriff auf den Backup-Ordner – bitte manuell sichern.', 3000);
      } catch (e) { toast(`Backup-Ordner nicht erreichbar (${e.message || e}) – bitte manuell sichern.`, 3500); }
    }
    offerFile(blob, filename, { title: 'Backup bereit', onSaved: async () => { await markFileExported(); toast('Backup-Datei gesichert', 2500); } });
    toast(describeCounts(c), 3000);
  } catch (e) { alertDialog('Backup fehlgeschlagen', `Die Sicherung konnte nicht erstellt werden: ${e.message || e}`); }
}

function importFlow() {
  openImporter({ onDone: (song) => openSong(song) });
}

async function newSongFlow() {
  let instrument = (await db.getSetting('lastInstrument', 'guitar')) === 'ukulele' ? 'ukulele' : 'guitar';
  const extra = h('div', { class: 'dlg-extra' }, segmented(Object.entries(INSTRUMENTS).map(([value, i]) => ({ value, label: i.label })), instrument, (v) => { instrument = v; }));
  const title = await ask('Neuer Song', { placeholder: 'Titel', ok: 'Erstellen', message: 'Künstler, Capo, Stimmung und alles Weitere sind optional.', extra });
  if (title == null) return;
  db.setSetting('lastInstrument', instrument);
  const song = await createSong(title, instrument);
  openSong(song);
}

async function pdfFor(songs, opts) {
  try {
    toast('PDF wird erstellt …', 1200);
    const { blob, filename } = await exportSongsPDF(songs, opts);
    offerFile(blob, filename, { title: 'PDF bereit', openable: true });
  } catch (e) {
    console.error(e);
    alertDialog('PDF-Export fehlgeschlagen', String(e.message || e));
  }
}

// ---------- Songbook ----------
async function openSongbook() {
  const songs = (await db.getAll('songs')).sort(SORTS.title.fn);
  if (!songs.length) { toast('Noch keine Songs vorhanden.'); return; }
  const sel = new Set();
  const title = h('input', { class: 'field', value: 'Songbook', placeholder: 'Titel des Songbooks' });
  const list = h('ul', { class: 'list' });
  const info = h('div', { class: 'hint' });
  const draw = () => {
    list.replaceChildren(...songs.map((s) => h('li', { class: 'row selectable' + (sel.has(s.id) ? ' selected' : '') },
      h('button', { class: 'row-main', 'aria-pressed': String(sel.has(s.id)), onClick: () => { if (sel.has(s.id)) sel.delete(s.id); else sel.add(s.id); draw(); } },
        h('span', { class: 'row-check' }, sel.has(s.id) && icon('check', 'small')),
        h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, s.title), s.artist && h('div', { class: 'row-sub' }, s.artist))))));
    info.textContent = `${sel.size} von ${songs.length} ausgewählt · Reihenfolge alphabetisch, jeder Song beginnt auf einer neuen Seite.`;
  };
  const body = h('div', null,
    title,
    h('div', { class: 'btn-row', style: 'margin:12px 0' },
      h('button', { class: 'btn small', onClick: () => { songs.forEach((s) => sel.add(s.id)); draw(); } }, 'Alle auswählen'),
      h('button', { class: 'btn small', onClick: () => { sel.clear(); draw(); } }, 'Keine')),
    list,
    h('div', { style: 'margin-top:10px' }, info));
  const s = sheet({
    title: 'Songbook als PDF', body, full: true, left: { label: 'Abbrechen' },
    right: { label: 'Erstellen', bold: true, onClick: async () => {
      if (!sel.size) { toast('Bitte wähle mindestens einen Song.'); return; }
      s.close();
      await pdfFor(songs.filter((x) => sel.has(x.id)), { title: title.value.trim() || 'Songbook' });
    } },
  });
  draw();
}

// Fester Backup-Ordner auf dem iPhone: ein Kurzbefehl im Teilen-Menü speichert ohne Rückfrage in einen festen Ordner
function shortcutGuide() {
  const step = (n, title, text) => h('li', { class: 'guide-step' }, h('span', { class: 'guide-num' }, String(n)), h('div', null, h('b', null, title), text && h('p', null, text)));
  const body = h('div', { class: 'guide' },
    h('p', { class: 'hint' }, 'Safari lässt Web-Apps keinen Ordner merken. Die Kurzbefehle-App von Apple kann das: Du richtest einmal einen Kurzbefehl ein, der jede geteilte Datei ohne Nachfrage in deinen Ordner legt.'),
    h('div', { class: 'form-label' }, 'Einmal einrichten (ca. 2 Minuten)'),
    h('ol', { class: 'guide-list' },
      step(1, 'App „Kurzbefehle“ öffnen', 'Unten „Kurzbefehle“ → oben rechts auf „+“.'),
      step(2, 'Namen geben', 'Oben auf den Namen tippen → „Umbenennen“ → z. B. „In Sorell-Ordner sichern“.'),
      step(3, 'Im Teilen-Menü anzeigen', 'Unten auf ⓘ (Details) → „Im Share-Sheet anzeigen“ einschalten. Bei „Empfängt“ reicht „Dateien“.'),
      step(4, 'Aktion „Datei sichern“ hinzufügen', 'Unten in der Suche „Datei sichern“ eingeben und antippen. Als Eingabe steht „Kurzbefehleingabe“ – so lassen.'),
      step(5, 'Ordner festlegen', 'In der Aktion auf den Pfeil › tippen: „Fragen, wo gesichert werden soll“ ausschalten, dann auf den Ordner tippen und z. B. iCloud Drive → neuen Ordner „Sorell“ wählen.'),
      step(6, 'Fertig tippen', null)),
    h('div', { class: 'form-label' }, 'Danach bei jedem Backup'),
    h('ol', { class: 'guide-list' },
      step(1, 'Backup-Knopf in Sorell', 'Startseite unten ⤓ oder Einstellungen → „Backup als Datei sichern“.'),
      step(2, '„Teilen / In Dateien sichern“', null),
      step(3, '„In Sorell-Ordner sichern“ antippen', 'Die Datei liegt sofort im Ordner, ohne Nachfrage.')),
    h('p', { class: 'form-foot' }, 'Tipp: Im Teilen-Menü ganz unten „Aktionen bearbeiten“ → den Kurzbefehl zu den Favoriten hinzufügen, dann steht er ganz oben. Liegt der Ordner in iCloud Drive, sind die Backups auch außerhalb des iPhones sicher und erscheinen am PC (iCloud für Windows bzw. icloud.com) – dort kannst du sie direkt in Sorell importieren.'));
  sheet({ title: 'Fester Backup-Ordner', body, full: true, right: { label: 'Fertig', bold: true } });
}

// ---------- Einstellungen ----------
async function appVersion() {
  try {
    const keys = await caches.keys();
    const k = keys.find((x) => x.startsWith('gn-app-'));
    return k ? k.slice(7) : 'nicht installiert';
  } catch { return 'nicht installiert'; }
}

async function openSettings() {
  const songs = await db.getAll('songs');
  const sampleCount = songs.filter((s) => s.sample).length;
  const backups = await db.listBackups();
  const lastFile = await db.getSetting('lastBackupAt');
  const backupDir = canPickFolder() ? await getBackupFolder() : null;
  const lastInternal = await db.getSetting('lastInternalBackupAt') || backups[0]?.createdAt;
  const version = await appVersion();
  let usage = '–';
  try { const e = await navigator.storage?.estimate?.(); if (e && e.usage != null) usage = `${(e.usage / 1048576).toFixed(1)} MB`; } catch { /* ignorieren */ }
  let persisted = false;
  try { persisted = await navigator.storage?.persisted?.(); } catch { /* ignorieren */ }
  const offlineReady = !!navigator.serviceWorker?.controller;
  const media = await mediaStats();
  let withMedia = await db.getSetting('backupMedia', true);
  const lastInst = (await db.getSetting('lastInstrument', 'guitar')) === 'ukulele' ? 'ukulele' : 'guitar';
  const fileAge = lastFile ? (Date.now() - Date.parse(lastFile)) / 864e5 : Infinity;

  const refresh = () => { sub?.close(); s.close(); showLibrary(); };
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (f && await importBackupFile(f)) { await loadUserChords(); await loadAiConfig(); sortKey = await db.getSetting('sort', sortKey); refresh(); }
  });
  const label = (t) => h('div', { class: 'form-label' }, t);

  // Unterseiten wie in iOS: Übersicht mit Kategorien, jede Kategorie öffnet eine eigene Seite
  const PAGES = {
    look: { title: 'Darstellung', icon: 'sun', sub: { system: 'Automatisch', light: 'Hell', dark: 'Dunkel' }[theme], build: () => [
      label('Erscheinungsbild'),
      h('div', { class: 'seg-block' }, segmented([{ value: 'system', label: 'Automatisch' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }], theme, (v) => { applyTheme(v); db.setSetting('theme', v); })),
      label('Schrift'),
      h('div', { class: 'form-group' },
        formRow('Schrift', segmented([{ value: 'serif', label: 'Serif' }, { value: 'system', label: 'System' }], document.documentElement.dataset.font === 'system' ? 'system' : 'serif', (v) => applyFont(v)), null, 'text')),
      label('Rückmeldung'),
      h('div', { class: 'form-group' },
        formRow('Vibration beim Tippen', toggle(hapticsEnabled(), (v) => { setHaptics(v); if (v) haptic(); }), 'iPhone ab iOS 18', 'wave')),
      label('App-Symbol'),
      iconChoice(),
      h('p', { class: 'form-foot' }, 'Das Symbol übernimmt iOS nur beim Hinzufügen zum Home-Bildschirm. Wichtig: Eine neu hinzugefügte App startet mit leerem Speicher – sichere vorher ein Backup und importiere es danach. Ohne Neuinstallation bleibt das bisherige Symbol.'),
      label('Bereich oben (Uhrzeit, Akku)'),
      h('div', { class: 'seg-block' }, segmented([{ value: 'app', label: 'Wie die App' }, { value: 'ios', label: 'iOS-Standard' }], statusBarMode(), (v) => {
        try { localStorage.setItem('gn-statusbar', v); } catch { /* egal */ }
        toast('Wirkt nach dem Neustart der App', 2500);
      })),
      h('p', { class: 'form-foot' }, '„Wie die App“: Der Bereich hinter der Uhrzeit hat dieselbe Farbe wie die App. „iOS-Standard“: iOS färbt ihn selbst (kann im hellen Modus schwarz sein). Die Änderung wirkt nach dem Neustart der App.'),
    ] },
    inst: { title: 'Instrumente & Akkorde', icon: 'grid', sub: INSTRUMENTS[lastInst].label, build: () => [
      h('div', { class: 'form-group' },
        formRow('Neue Songs', segmented(Object.entries(INSTRUMENTS).map(([value, i]) => ({ value, label: i.label })), lastInst, (v) => db.setSetting('lastInstrument', v)), null, 'guitar'),
        actionRow('Stimmgerät', () => openTuner({ instrument: lastInst }), { iconName: 'fork' }),
        actionRow('Akkorde', () => openChordLibrary(), { iconName: 'grid' })),
      h('p', { class: 'form-foot' }, 'Gitarre: 6 Saiten, Ukulele: 4 Saiten. Akkorddiagramme und Tabs richten sich nach dem Instrument des Songs. Eigene Griffe nur für einen Song legst du im Song über „+ Griff“ an.'),
    ] },
    backup: { title: 'Backups', icon: 'download', sub: lastFile ? `Datei: ${relDate(lastFile)}` : 'noch keine Datei', build: () => [
      h('div', { class: 'form-group' },
        canPickFolder() && formRow('Backup-Ordner', h('span', { class: 'muted' }, backupDir?.name || 'nicht festgelegt'), null, 'folder'),
        canPickFolder() && actionRow(backupDir ? 'Anderen Backup-Ordner wählen …' : 'Backup-Ordner wählen …', async () => {
          try { const d = await pickBackupFolder(); toast(`Backups werden in „${d.name}“ gespeichert`); refresh(); openSettings(); } catch (e) { if (e?.name !== 'AbortError') alertDialog('Ordner nicht gesetzt', String(e.message || e)); }
        }, { iconName: 'folder' }),
        canPickFolder() && backupDir && actionRow('Backup-Ordner entfernen', async () => { await clearBackupFolder(); refresh(); openSettings(); }, { danger: true, iconName: 'trash' }),
        !canPickFolder() && actionRow('Fester Backup-Ordner auf dem iPhone …', shortcutGuide, { iconName: 'folder' }),
        actionRow('Backup oder Song-Datei importieren …', () => fileInput.click(), { iconName: 'doc' }),
        actionRow('Vor dem Löschen der App …', deleteAppInfo, { iconName: 'info' }),
        backups.length > 0 && actionRow('Ordner aus Sicherung wiederherstellen …', () => restoreFolders(backups), { iconName: 'undo' }),
        formRow('Fotos & Aufnahmen im Backup', toggle(withMedia, (v) => { withMedia = v; db.setSetting('backupMedia', v); }), media.count ? `${media.count} Dateien, ${(media.bytes / 1048576).toFixed(1)} MB` : 'noch keine', 'photo')),
      h('p', { class: 'form-foot' }, (canPickFolder() ? 'Mit festgelegtem Backup-Ordner speichert der Backup-Knopf direkt dort. ' : 'Auf dem iPhone darf eine Web-App selbst keinen Ordner merken. Mit einem Kurzbefehl klappt es trotzdem: einmal einrichten, danach landet jedes Backup mit einem Tipp im selben Ordner. ') + 'Importieren führt immer zusammen: Nichts wird gelöscht, Konflikte entscheidest du in der Vorschau.'),
      backups.length > 0 && label('Interne Sicherungen (dieses Gerät)'),
      backups.length > 0 && h('div', { class: 'form-group' }, backups.map((b) => actionRow(`${fullDate(b.createdAt)} – ${b.reason}`, () => actionSheet(describeCounts(counts(b.data)), [
        { label: 'Als Datei exportieren', icon: 'download', onClick: () => { const f = internalBackupFile(b); offerFile(f.blob, f.filename, { title: 'Sicherung', onSaved: () => markFileExported() }); } },
        { label: 'Wiederherstellen (Vorschau) …', icon: 'undo', onClick: async () => { if (await restoreInternalBackup(b)) { await loadUserChords(); refresh(); } } },
        { label: 'Nur Ordner wiederherstellen …', icon: 'folder', onClick: () => restoreFolders([b]) },
      ]), { iconName: 'clock' }))),
      backups.length > 0 && h('p', { class: 'form-foot' }, 'Automatisch täglich sowie vor Importen, Wiederherstellungen, KI-Änderungen und Datenmigrationen (die letzten 10). Sie liegen im selben Speicher wie die Songs und schützen nicht, wenn iOS die App-Daten löscht – dafür braucht es die Datei.'),
      label('Speicher'),
      h('div', { class: 'form-group' },
        formRow('Speicherort', h('span', { class: 'muted' }, 'Nur auf diesem Gerät'), null, 'storage'),
        formRow('Belegt', h('span', { class: 'muted' }, usage), null, 'grid'),
        formRow('Dauerhafter Speicher', h('span', { class: 'muted' }, persisted ? 'Aktiv' : 'Vom System verwaltet'), null, 'check'),
        media.orphans.length > 0 && actionRow(`Verwaiste Medien entfernen (${media.orphans.length})`, async () => {
          if (!(await confirmDialog('Verwaiste Medien entfernen?', 'Diese Fotos und Aufnahmen gehören zu keinem vorhandenen Song mehr (z. B. nach „Alles ersetzen“ beim Import).', { ok: 'Entfernen', destructive: true }))) return;
          await db.deleteMany(media.orphans.map((m) => ['media', m.id]));
          toast('Entfernt');
          refresh();
        }, { danger: true, iconName: 'trash' })),
    ] },
    io: { title: 'Import, Export & Sync', icon: 'share', build: () => [
      h('div', { class: 'form-group' },
        actionRow('Mit anderem Gerät synchronisieren …', () => openSync({ onDone: async () => { await loadUserChords(); } }), { iconName: 'share' }),
        actionRow('Aus Text erstellen (Apple Notizen …)', () => { closeAll(); importFlow(); }, { iconName: 'magic' }),
        actionRow('Alle Songs als JSON exportieren', async () => { const f = await exportSongsFile(songs); offerFile(f.blob, f.filename, { title: 'Songs-Datei' }); }, { iconName: 'download' }),
        actionRow('Songbook als PDF …', () => { closeAll(); openSongbook(); }, { iconName: 'doc' })),
      h('p', { class: 'form-foot' }, 'Apple Notizen: Notiz öffnen, Text kopieren und unter „Aus Text erstellen“ einfügen – du siehst eine Vorschau, bevor ein neuer Song gespeichert wird. JSON-Dateien kannst du am PC bearbeiten und über „Backups“ wieder importieren. Einzelne Songs exportierst du über ihr Menü.'),
    ] },
    ai: { title: 'KI-Funktionen', icon: 'magic', sub: aiConfig().key ? 'Aktiv' : 'Aus', build: () => [aiSettings()] },
    info: { title: 'Über Sorell', icon: 'info', sub: version, build: () => [
      h('div', { class: 'form-group' },
        actionRow(`Neuigkeiten (Version ${NEWS[0].v})`, openNews, { iconName: 'star' }),
        formRow('App-Version', h('span', { class: 'muted' }, version), null, 'tag'),
        formRow('Datenformat', h('span', { class: 'muted' }, 'v' + db.DATA_VERSION), null, 'doc'),
        formRow('Offline verfügbar', h('span', { class: 'muted' }, offlineReady ? 'Ja' : 'Noch nicht'), null, 'check'),
        sampleCount
          ? actionRow(`Beispieldaten entfernen (${sampleCount})`, async () => {
            if (!(await confirmDialog('Beispieldaten entfernen?', 'Alle mit „Beispiel“ markierten Songs und ihre Tabs werden gelöscht. Deine eigenen Songs bleiben unberührt.', { ok: 'Entfernen', destructive: true }))) return;
            const n = await removeSamples();
            toast(`${n} Beispiel-Songs entfernt`);
            refresh();
          }, { danger: true, iconName: 'trash' })
          : actionRow('Beispiel-Songs hinzufügen', async () => { await seedSamples(); toast('Beispiel-Songs hinzugefügt'); refresh(); }, { iconName: 'music' })),
      h('p', { class: 'form-foot' }, 'Keine Konten, keine Cloud. Alle Songs liegen ausschließlich in der lokalen Datenbank dieses Geräts. Nur wenn du eine KI-Funktion benutzt, wird der jeweils abgeschickte Text an Google Gemini gesendet.'),
    ] },
  };
  // Ordner und Ordner-Zuordnungen aus der neuesten passenden Sicherung zurückholen (ändert sonst nichts)
  async function restoreFolders(list) {
    for (const b of list) {
      const plan = await folderRestorePlan(b);
      if (!plan.add.length && !plan.moves.length) continue;
      const msg = [`Sicherung vom ${fullDate(b.createdAt)}:`,
        plan.add.length ? `• ${plan.add.length} Ordner anlegen: ${plan.add.map((f) => f.name).join(', ')}` : '',
        plan.moves.length ? `• ${plan.moves.length} ${plan.moves.length === 1 ? 'Song kommt' : 'Songs kommen'} zurück in ${plan.moves.length === 1 ? 'seinen' : 'ihre'} Ordner` : '',
      ].filter(Boolean).join('\n') + '\n\nNur Songs ohne Ordner werden zugeordnet. Inhalte werden nicht verändert, vorher entsteht eine Sicherung.';
      if (!(await confirmDialog('Ordner wiederherstellen?', msg, { ok: 'Wiederherstellen' }))) return;
      try { await applyFolderRestore(plan); toast('Ordner wiederhergestellt'); refresh(); } catch (e) { alertDialog('Nicht wiederhergestellt', String(e.message || e)); }
      return;
    }
    alertDialog('Nichts wiederherzustellen', list.length === 1 ? 'In dieser Sicherung gibt es keine Ordner, die jetzt fehlen.' : 'Keine interne Sicherung enthält Ordner, die jetzt fehlen. Falls du eine Backup-Datei mit den Ordnern hast, importiere sie – der Import ergänzt fehlende Ordner.');
  }

  let sub = null;
  const closeAll = () => { sub?.close(); s.close(); };
  const openPage = (p) => {
    sub = sheet({ title: p.title, body: h('div', null, ...p.build()), full: true, left: { label: 'Zurück' }, right: { label: 'Fertig', bold: true, onClick: closeAll } });
  };
  const navRow = (p) => h('button', { class: 'form-row action settings-nav', onClick: () => openPage(p) },
    icon(p.icon), h('span', { class: 'set-title' }, p.title), p.sub && h('span', { class: 'muted nav-sub' }, p.sub), icon('chevron', 'small chev'));

  const body = h('div', null,
    // Häufigste Aktion zuerst
    h('div', { class: 'backup-status ' + (fileAge > 14 ? 'warn' : 'ok') },
      h('div', null, h('b', null, 'Letzte Backup-Datei: '), lastFile ? fullDate(lastFile) : 'noch keine'),
      h('div', { class: 'muted' }, 'Interne Sicherung: ', lastInternal ? fullDate(lastInternal) : 'noch keine', ' (nur auf diesem Gerät)'),
      h('button', { class: 'btn primary block', style: 'margin-top:10px', onClick: backupNow }, icon('download', 'small'), 'Backup als Datei sichern'),
      h('button', { class: 'backup-warn', onClick: deleteAppInfo }, icon('info', 'small'), h('span', { class: 'bw-text' }, 'App löschen? Vorher ein Backup sichern – sonst sind alle Songs weg.'), icon('chevron', 'small'))),
    h('div', { class: 'form-group' }, actionRow('Interaktive Einführung', () => { closeAll(); startTour(); }, { iconName: 'play' })),
    h('div', { class: 'form-group' }, navRow(PAGES.look), navRow(PAGES.inst)),
    h('div', { class: 'form-group' }, navRow(PAGES.backup), navRow(PAGES.io)),
    h('div', { class: 'form-group' }, navRow(PAGES.ai), navRow(PAGES.info)),
    fileInput);

  const s = sheet({ title: 'Einstellungen', body, full: true, right: { label: 'Fertig', bold: true } });
}

function iconChoice() {
  const cur = iconMode();
  const opt = (v, src, name) => h('button', { class: 'icon-opt' + (v === cur ? ' on' : ''), 'aria-pressed': String(v === cur), onClick: (e) => {
    applyIcon(v);
    e.currentTarget.parentElement.querySelectorAll('.icon-opt').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  } }, h('img', { src, alt: '', width: '60', height: '60' }), h('span', null, name));
  return h('div', { class: 'icon-choice' }, opt('dark', 'assets/icons/icon-180.png', 'Dunkel'), opt('light', 'assets/icons/icon-light-180.png', 'Hell'));
}

// Verbrauchsanzeige: unterscheidet klar zwischen Angaben von Google und lokaler Zählung
function aiUsagePanel() {
  const u = aiUsage();
  const c = aiConfig();
  const status = !c.key ? 'Kein Schlüssel eingetragen' : !navigator.onLine ? 'Offline' : u.lastError && (!u.lastOkAt || u.lastErrorAt > u.lastOkAt) ? `Fehler: ${u.lastError}` : u.lastOkAt ? 'Verbunden (letzte Anfrage erfolgreich)' : 'Noch nicht verwendet';
  const muted = (t) => h('span', { class: 'muted' }, t);
  return h('div', null,
    h('div', { class: 'form-group' },
      formRow('Anbieter', muted(`Google Gemini · ${c.model}`)),
      formRow('Status', muted(status)),
      formRow('Anfragen heute', muted(String(u.day === new Date().toISOString().slice(0, 10) ? u.requests || 0 : 0)), 'lokal auf diesem Gerät gezählt'),
      formRow('Token heute', muted(String(u.day === new Date().toISOString().slice(0, 10) ? u.tokens || 0 : 0)), 'Summe der von Google je Antwort gemeldeten Token'),
      formRow('Gesamt', muted(`${u.totalRequests || 0} Anfragen · ${u.totalTokens || 0} Token`), 'lokal gezählt'),
      formRow('Letzte erfolgreiche Anfrage', muted(u.lastOkAt ? fullDate(u.lastOkAt) : '–')),
      u.rateLimitedAt && formRow('Limit zuletzt erreicht', muted(fullDate(u.rateLimitedAt)), 'Google meldete „Kontingent ausgeschöpft“ (429)'),
      formRow('Verbleibendes Limit', muted('nicht verfügbar'))),
    h('p', { class: 'form-foot' }, 'Die Gemini-API meldet kein verbleibendes Kontingent. Das tatsächliche Limit und den Verbrauch deines Schlüssels siehst du nur in Google AI Studio (Link oben). Die Zahlen hier sind keine API-Limits, sondern eine lokale Zählung dieses Geräts.'));
}

// KI-Assistent: Schlüssel und Modell. Der Schlüssel bleibt in der lokalen Datenbank und kommt in kein Backup.
function aiSettings() {
  const c = aiConfig();
  const keyIn = h('input', { type: 'password', class: 'ai-key', value: c.key, placeholder: 'AIza…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Gemini-API-Schlüssel' });
  const modelSel = h('select', { 'aria-label': 'Modell' });
  const status = h('p', { class: 'form-foot' });
  const setModels = (list, current) => {
    const ids = [...new Set([current, ...list.map((m) => m.id)])];
    modelSel.replaceChildren(...ids.map((id) => h('option', { value: id }, list.find((m) => m.id === id)?.label || id)));
    modelSel.value = current;
  };
  setModels([{ id: DEFAULT_MODEL, label: DEFAULT_MODEL }], c.model);
  modelSel.addEventListener('change', async () => { await setAiModel(modelSel.value); status.textContent = `Modell: ${modelSel.value}`; });
  const show = () => { status.textContent = aiConfig().key ? `Aktiv · Modell ${aiConfig().model}. Ohne Internet arbeitet die App wie gewohnt lokal.` : 'Aus. Ohne Schlüssel nutzt die App ausschließlich die lokale Erkennung.'; };
  show();
  keyIn.addEventListener('change', async () => { await setAiKey(keyIn.value); show(); });
  const busy = (t) => { status.textContent = t; };
  return h('div', null,
    h('div', { class: 'form-group' },
      formRow('Schlüssel', keyIn, null, 'key'),
      formRow('Modell', modelSel, null, 'magic'),
      actionRow('Modelle laden', async () => {
        await setAiKey(keyIn.value);
        if (!aiConfig().key) { toast('Bitte zuerst einen Schlüssel eintragen.'); return; }
        busy('Lade Modelle …');
        try {
          const list = await listModels();
          if (!list.length) { busy('Keine passenden Modelle gefunden.'); return; }
          // Vorschau-Modelle sind oft noch nicht frei nutzbar: dann das erste stabile Modell nehmen
          const keep = list.some((m) => m.id === aiConfig().model) && !/preview|exp/i.test(aiConfig().model);
          const current = keep ? aiConfig().model : list[0].id;
          setModels(list, current);
          await setAiModel(current);
          busy(`${list.length} Modelle verfügbar · gewählt: ${current}`);
        } catch (e) { busy(String(e.message || e)); }
      }, { iconName: 'download' }),
      actionRow('Verbindung testen', async () => {
        await setAiKey(keyIn.value);
        if (!aiConfig().key) { toast('Bitte zuerst einen Schlüssel eintragen.'); return; }
        busy('Teste …');
        try { await testKey(aiConfig().key); busy(`Verbindung funktioniert (${aiConfig().model}).`); } catch (e) { busy(String(e.message || e)); }
      }, { iconName: 'magic' }),
      actionRow('Schlüssel erstellen (Google AI Studio)', () => window.open(KEY_URL, '_blank', 'noopener'), { iconName: 'share' }),
      c.key && actionRow('Schlüssel entfernen', async () => {
        if (!(await confirmDialog('Schlüssel entfernen?', 'Der KI-Assistent wird abgeschaltet. Die App arbeitet weiter vollständig offline.', { ok: 'Entfernen', destructive: true }))) return;
        await setAiKey('');
        keyIn.value = '';
        show();
      }, { danger: true })),
    status,
    aiUsagePanel(),
    h('p', { class: 'form-foot' }, 'Der Schlüssel wird nur auf diesem Gerät gespeichert und nie in Backups exportiert. Anfragen gehen direkt an Google, nur wenn du „Mit KI analysieren“, „KI-Idee“ oder „Alternativen vorschlagen“ oder „Mit KI bearbeiten“ antippst. Im kostenlosen Tarif darf Google Eingaben zur Verbesserung seiner Dienste verwenden – sende keine privaten Daten.'));
}

// ---------- Service Worker (Offline-Betrieb & Updates) ----------
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  let updating = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    const offer = (worker) => banner('Neue Version verfügbar', 'Deine Songs bleiben beim Aktualisieren unverändert.', 'Aktualisieren', async () => {
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
async function init() {
  let info;
  try {
    info = await db.initStorage();
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'view' }, h('div', { class: 'empty', style: 'padding-top:30vh' },
      h('h2', null, 'Lokaler Speicher nicht verfügbar'),
      h('p', null, `Die App kann ihre Datenbank nicht öffnen (${e.message || e}). Bitte schließe die App vollständig und öffne sie erneut.`))));
    return;
  }
  sortKey = (await db.getSetting('sort', 'updated')) || 'updated';
  if (!SORTS[sortKey]) sortKey = 'updated';
  applyTheme((await db.getSetting('theme', 'system')) || 'system');
  if ((await db.getSetting('font', 'serif')) === 'system') applyFont('system');
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
  if (repaired) toast(`${repaired} fehlende${repaired === 1 ? 'r Ordner' : ' Ordner'} wiederhergestellt`, 4000);
  if (info.recovered) toast(`${info.recovered} ungesicherte Änderung(en) wiederhergestellt`, 3500);
  if (info.migrated) toast('Daten auf neues Format aktualisiert – eine Sicherung wurde angelegt.', 4000);
  if (info.migrationError) banner('Datenformat konnte nicht aktualisiert werden', 'Deine Daten sind unverändert. Bitte exportiere ein Backup und melde den Fehler.');
  if (info.newerData) banner('Bitte App aktualisieren', 'Deine Daten stammen aus einer neueren App-Version. Sie werden nicht verändert.');
  registerSW();
  autoBackup();
  // Nach einem Update einmal zeigen, was neu ist (nicht bei der ersten Installation, nicht mitten in einem Song)
  const isFirstRun = !(await db.getAll('songs')).length;
  if (!location.hash.startsWith('#/song/') && !location.hash.startsWith('#/set/')) setTimeout(() => showNewsOnce(isFirstRun), 900);
}

init();
