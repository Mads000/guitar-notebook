// App-Start, Navigation, Startseite „Meine Songs“, Einstellungen und Service-Worker-Updates.
import * as db from './storage.js';
import { h, fill, icon, navBtn, sheet, actionSheet, ask, confirmDialog, alertDialog, toast, banner, segmented, actionRow, formRow, offerFile, relDate, fullDate, toggle } from './ui.js';
import { createSong, duplicateSong, deleteSong, songMatches, SORTS, firstProgression, touch, INSTRUMENTS, instrumentOf } from './songs.js';
import { showEditor } from './editor.js';
import { loadUserChords, openChordLibrary } from './chords.js';
import { openPatternPicker } from './strumming.js';
import { exportBackupFile, importBackupFile, restoreInternalBackup, internalBackupFile, describeCounts, counts } from './backup.js';
import { seedSamples, removeSamples } from './samples.js';
import { exportSongsPDF } from './pdf.js';
import { openImporter } from './importer.js';
import { mediaStats } from './media.js';
import { loadAiConfig, aiConfig, setAiKey, setAiModel, listModels, testKey, DEFAULT_MODEL, KEY_URL } from './ai.js';

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
  if (token !== routeToken) return;
  await showLibrary(first || !current ? null : 'pop');
}

function goHome() {
  if (location.hash.startsWith('#/song/')) location.hash = '#/';
  else route();
}
const openSong = (s) => { location.hash = '#/song/' + encodeURIComponent(s.id); };

// ---------- Startseite ----------
async function showLibrary(dir = null) {
  const songs = await db.getAll('songs');
  const view = h('div', { class: 'view library-view' });
  const nav = h('header', { class: 'navbar' },
    h('div', { class: 'nav-row' },
      h('div', { class: 'nav-left' }, navBtn('sort', sortMenu, { label: 'Sortieren' })),
      h('div', { class: 'nav-title' }, 'Meine Songs'),
      h('div', { class: 'nav-right' }, navBtn('settings', openSettings, { label: 'Einstellungen und Backup' }))));
  const searchInput = h('input', { type: 'search', placeholder: 'Suchen', value: query, 'aria-label': 'Songs durchsuchen', autocomplete: 'off', enterkeyhint: 'search' });
  const searchBox = h('div', { class: 'search' + (query ? ' has-text' : '') }, icon('search', 'small'), searchInput,
    h('button', { class: 'clear', 'aria-label': 'Suche leeren', onClick: () => { searchInput.value = ''; query = ''; searchBox.classList.remove('has-text'); renderList(); } }, icon('close', 'small')));
  searchInput.addEventListener('input', () => { query = searchInput.value; searchBox.classList.toggle('has-text', !!query); renderList(); });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchInput.blur(); });
  const list = h('div');
  const content = h('main', { class: 'content' }, h('h1', { class: 'large-title' }, 'Meine Songs'), searchBox, list);
  const count = h('span', { class: 'toolbar-info' });
  const toolbar = h('footer', { class: 'toolbar' }, navBtn('magic', importFlow, { label: 'Aus Text erstellen' }), count, navBtn('compose', newSongFlow, { label: 'Neuer Song' }));
  view.append(nav, content, toolbar);
  view.addEventListener('scroll', () => nav.classList.toggle('scrolled', view.scrollTop > 44), { passive: true });

  const row = (s) => h('li', { class: 'row' },
    h('button', { class: 'row-main', onClick: () => openSong(s) },
      h('div', { class: 'row-text' },
        h('div', { class: 'row-title' }, s.title, s.sample && h('span', { class: 'badge' }, 'Beispiel')),
        h('div', { class: 'row-sub' }, [relDate(s.updatedAt), s.artist, instrumentOf(s) === 'ukulele' && 'Ukulele'].filter(Boolean).join('  ·  '))),
      s.favorite && icon('star', 'small filled row-star')),
    h('button', { class: 'row-more', 'aria-label': `Optionen für ${s.title}`, onClick: () => songMenu(s) }, icon('more')));
  const group = (title, items, link) => h('section', { class: 'group' },
    h('div', { class: 'group-head' }, h('h2', { class: 'group-title' }, title), link),
    h('ul', { class: 'list' }, items.map(row)));

  function renderList() {
    const sorted = songs.slice().sort(SORTS[sortKey].fn);
    const q = query.trim();
    count.textContent = songs.length === 1 ? '1 Song' : `${songs.length} Songs`;
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
    if (q) {
      const hits = sorted.filter((s) => songMatches(s, q));
      list.replaceChildren(hits.length ? group(`${hits.length} Treffer`, hits)
        : h('div', { class: 'empty' }, h('h2', null, 'Keine Treffer'), h('p', null, `Kein Song passt zu „${q}“.`)));
      return;
    }
    const recent = songs.slice().sort(SORTS.updated.fn).slice(0, 8);
    const favs = sorted.filter((s) => s.favorite);
    fill(list,
      songs.length >= 3 && h('section', { class: 'group' },
        h('div', { class: 'group-head' }, h('h2', { class: 'group-title' }, 'Zuletzt bearbeitet')),
        h('div', { class: 'recent' }, recent.map((s) => h('button', { class: 'card', onClick: () => openSong(s) },
          h('div', { class: 'card-title' }, s.title),
          h('div', { class: 'card-sub' }, s.artist || relDate(s.updatedAt)),
          h('div', { class: 'card-chords' }, firstProgression(s, 5) || ' '))))),
      favs.length > 0 && group('Favoriten', favs),
      group('Alle Songs', sorted, h('button', { class: 'group-link', onClick: sortMenu }, SORTS[sortKey].label)));
  }

  async function songMenu(s) {
    actionSheet(s.title, [
      { label: s.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten', onClick: async () => { s.favorite = !s.favorite; db.saveLater('songs', s); await db.flush(); renderList(); } },
      { label: 'Umbenennen', onClick: async () => { const n = await ask('Song umbenennen', { value: s.title, ok: 'Sichern' }); if (n) { s.title = n; touch(s); await db.flush(); renderList(); } } },
      { label: 'Duplizieren', onClick: async () => { const c = await duplicateSong(s); songs.push(c); renderList(); toast('Kopie erstellt'); } },
      { label: 'Als PDF exportieren', onClick: () => pdfFor([s]) },
      { label: 'Löschen', destructive: true, onClick: async () => {
        if (!(await confirmDialog('Song löschen?', `„${s.title}“ wird mit allen Abschnitten und Tabs endgültig gelöscht.`, { ok: 'Löschen', destructive: true }))) return;
        await deleteSong(s);
        songs.splice(songs.indexOf(s), 1);
        renderList();
        toast('Song gelöscht');
      } },
    ]);
  }

  async function sortMenu() {
    const k = await actionSheet('Sortieren nach', Object.entries(SORTS).map(([key, v]) => ({ label: v.label + (key === sortKey ? '  ✓' : ''), value: key })));
    if (!k) return;
    sortKey = k;
    db.setSetting('sort', k);
    renderList();
  }

  renderList();
  mount(view, dir);
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
  const lastBackup = await db.getSetting('lastBackupAt');
  const version = await appVersion();
  let usage = '–';
  try { const e = await navigator.storage?.estimate?.(); if (e && e.usage != null) usage = `${(e.usage / 1048576).toFixed(1)} MB`; } catch { /* ignorieren */ }
  let persisted = false;
  try { persisted = await navigator.storage?.persisted?.(); } catch { /* ignorieren */ }
  const offlineReady = !!navigator.serviceWorker?.controller;
  const media = await mediaStats();
  let withMedia = await db.getSetting('backupMedia', true);

  const refresh = () => { s.close(); showLibrary(); };
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (f && await importBackupFile(f)) { await loadUserChords(); await loadAiConfig(); sortKey = await db.getSetting('sort', sortKey); refresh(); }
  });

  const body = h('div', null,
    h('div', { class: 'form-label' }, 'Darstellung'),
    h('div', { style: 'margin-bottom:22px' }, segmented([{ value: 'system', label: 'Automatisch' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }], theme, (v) => { applyTheme(v); db.setSetting('theme', v); })),

    h('div', { class: 'form-label' }, 'Backup'),
    h('div', { class: 'form-group' },
      actionRow('Backup exportieren (JSON)', async () => {
        try {
          toast('Backup wird erstellt …', 1200);
          const { blob, filename, counts: c } = await exportBackupFile({ media: withMedia });
          offerFile(blob, filename, { title: 'Backup bereit' });
          toast(describeCounts(c), 3000);
        } catch (e) { alertDialog('Backup fehlgeschlagen', String(e.message || e)); }
      }, { iconName: 'download' }),
      actionRow('Backup importieren …', () => fileInput.click(), { iconName: 'doc' }),
      formRow('Fotos & Aufnahmen einschließen', toggle(withMedia, (v) => { withMedia = v; db.setSetting('backupMedia', v); }), media.count ? `${media.count} Dateien, ${(media.bytes / 1048576).toFixed(1)} MB` : 'noch keine')),
    h('p', { class: 'form-foot' }, `Letztes Backup: ${lastBackup ? fullDate(lastBackup) : 'noch keines'}. Sichere die Datei z. B. in iCloud Drive oder auf deinem PC.`),
    fileInput,

    h('div', { class: 'form-label' }, 'Export'),
    h('div', { class: 'form-group' }, actionRow('Songbook als PDF …', () => { s.close(); openSongbook(); }, { iconName: 'doc' })),

    h('div', { class: 'form-label' }, 'Bibliothek'),
    h('div', { class: 'form-group' },
      actionRow('Akkorde', () => openChordLibrary(), { iconName: 'grid' }),
      actionRow('Anschlagmuster', () => openPatternPicker(() => {}, { manage: true }), { iconName: 'wave' })),

    h('div', { class: 'form-label' }, 'KI-Assistent (optional)'),
    aiSettings(),

    h('div', { class: 'form-label' }, 'Beispieldaten'),
    h('div', { class: 'form-group' },
      sampleCount
        ? actionRow(`Beispieldaten entfernen (${sampleCount})`, async () => {
          if (!(await confirmDialog('Beispieldaten entfernen?', 'Alle mit „Beispiel“ markierten Songs und ihre Tabs werden gelöscht. Deine eigenen Songs bleiben unberührt.', { ok: 'Entfernen', destructive: true }))) return;
          const n = await removeSamples();
          toast(`${n} Beispiel-Songs entfernt`);
          refresh();
        }, { danger: true })
        : actionRow('Beispiel-Songs hinzufügen', async () => { await seedSamples(); toast('Beispiel-Songs hinzugefügt'); refresh(); })),

    backups.length > 0 && h('div', { class: 'form-label' }, 'Automatische Sicherungen'),
    backups.length > 0 && h('div', { class: 'form-group' }, backups.map((b) => actionRow(`${fullDate(b.createdAt)} – ${b.reason}`, () => actionSheet(describeCounts(counts(b.data)), [
      { label: 'Als Datei exportieren', onClick: () => { const f = internalBackupFile(b); offerFile(f.blob, f.filename, { title: 'Sicherung' }); } },
      { label: 'Wiederherstellen', destructive: true, onClick: async () => { if (await restoreInternalBackup(b)) { await loadUserChords(); refresh(); } } },
    ])))),
    backups.length > 0 && h('p', { class: 'form-foot' }, 'Wird automatisch vor Importen und Datenmigrationen angelegt (die letzten 5).'),

    h('div', { class: 'form-label' }, 'Speicher & Info'),
    h('div', { class: 'form-group' },
      formRow('Speicherort', h('span', { class: 'muted' }, 'Nur auf diesem Gerät')),
      formRow('Belegt', h('span', { class: 'muted' }, usage)),
      media.orphans.length > 0 && actionRow(`Verwaiste Medien entfernen (${media.orphans.length})`, async () => {
        if (!(await confirmDialog('Verwaiste Medien entfernen?', 'Diese Fotos und Aufnahmen gehören zu keinem vorhandenen Song mehr (z. B. nach „Alles ersetzen“ beim Import).', { ok: 'Entfernen', destructive: true }))) return;
        await db.deleteMany(media.orphans.map((m) => ['media', m.id]));
        toast('Entfernt');
        refresh();
      }, { danger: true }),
      formRow('Dauerhafter Speicher', h('span', { class: 'muted' }, persisted ? 'Aktiv' : 'Vom System verwaltet')),
      formRow('Offline verfügbar', h('span', { class: 'muted' }, offlineReady ? 'Ja' : 'Noch nicht')),
      formRow('App-Version', h('span', { class: 'muted' }, version)),
      formRow('Datenformat', h('span', { class: 'muted' }, 'v' + db.DATA_VERSION))),
    h('p', { class: 'form-foot' }, 'Keine Konten, keine Cloud. Alle Songs liegen ausschließlich in der lokalen Datenbank dieses Geräts. Nur wenn du den KI-Assistenten benutzt, wird der jeweils abgeschickte Text an Google Gemini gesendet.'));

  const s = sheet({ title: 'Einstellungen', body, full: true, right: { label: 'Fertig', bold: true } });
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
      formRow('Gemini-Schlüssel', keyIn),
      formRow('Modell', modelSel),
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
    h('p', { class: 'form-foot' }, 'Der Schlüssel wird nur auf diesem Gerät gespeichert und nie in Backups exportiert. Anfragen gehen direkt an Google, nur wenn du „Mit KI analysieren“, „KI-Idee“ oder „Alternativen vorschlagen“ antippst. Im kostenlosen Tarif darf Google Eingaben zur Verbesserung seiner Dienste verwenden – sende keine privaten Daten.'));
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
  if (!(await db.getSetting('seeded', false))) {
    if (!(await db.getAll('songs')).length) await seedSamples();
    await db.setSetting('seeded', true);
  }
  await loadUserChords();
  await loadAiConfig();
  window.addEventListener('hashchange', () => route());
  await route(true);
  if (info.recovered) toast(`${info.recovered} ungesicherte Änderung(en) wiederhergestellt`, 3500);
  if (info.migrated) toast('Daten auf neues Format aktualisiert – eine Sicherung wurde angelegt.', 4000);
  if (info.migrationError) banner('Datenformat konnte nicht aktualisiert werden', 'Deine Daten sind unverändert. Bitte exportiere ein Backup und melde den Fehler.');
  if (info.newerData) banner('Bitte App aktualisieren', 'Deine Daten stammen aus einer neueren App-Version. Sie werden nicht verändert.');
  registerSW();
}

init();
