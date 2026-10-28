// Songeditor: Kopfbereich, Abschnitte und frei kombinierbare Blöcke (Akkorde, Anschlag, Tab, Notiz).
import * as db from './storage.js';
import { h, fill, icon, sheet, actionSheet, popMenu, haptic, anyOverlayOpen, ask, confirmDialog, alertDialog, toast, autogrow, stepper, formRow, saveIndicator, offerFile, clone, fullDate, segmented, dragSort, toggle } from './ui.js';
import { SECTION_PRESETS, INSTRUMENTS, TIME_SIGS, newSection, newBlock, cloneBlock, touch, duplicateSong, deleteSong, metaParts, songChordItems, uid, instrumentOf, stringsOf, defaultTuning, onTouch, sectionKind } from './songs.js';
import { progressionView, progressionEditor } from './progression.js';
import { strumView, openStrumEditor } from './strumming.js';
import { tabSVG, newTab, cloneTab, loadTabsOf, saveTab, isEmptyTab, tabStrings } from './tabs.js';
import { openTabEditor } from './tabeditor.js';
import { findChord, diagramSVG, openDiagramEditor, songChordList, chordLabels, linkChord } from './chords.js';
import { exportSongsPDF } from './pdf.js';
import { songView } from './songview.js';
import { mediaSection, addPhotoMenu, openRecorder } from './media.js';
import { openImporter } from './importer.js';
import { openTransposer } from './transpose.js';
import { openAiEdit } from './aiedit.js';
import { exportSongsFile } from './backup.js';
import { openTuner } from './tuner.js';

const BLOCKS = {
  chords: { label: 'Akkordfolge', icon: 'guitar' },
  tab: { label: 'Tab', icon: 'strings' },
  strum: { label: 'Anschlagmuster', icon: 'wave' },
  notes: { label: 'Notiz', icon: 'note' },
};

// App-weite Zwischenablage für Blöcke (auch zwischen Songs)
const CLIP_KEY = 'gn-block-clipboard';
let blockClip = null;
try { blockClip = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); } catch { blockClip = null; }

const blockIsEmpty = (b, tabs) => (b.type === 'chords' ? !b.items.length
  : b.type === 'strum' ? !b.strokes.length
    : b.type === 'tab' ? !tabs.get(b.tabId) || isEmptyTab(tabs.get(b.tabId))
      : !b.text.trim());

// Vom linken Bildschirmrand nach rechts wischen schließt den Song – wie „Zurück“ in iOS-Apps
function edgeSwipeBack(view, back) {
  let x0 = null, y0 = 0, dx = 0, on = false;
  view.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    x0 = e.touches.length === 1 && t.clientX < 24 && !anyOverlayOpen() ? t.clientX : null;
    y0 = t.clientY; dx = 0; on = false;
  }, { passive: true });
  view.addEventListener('touchmove', (e) => {
    if (x0 == null) return;
    const t = e.touches[0];
    dx = Math.max(0, t.clientX - x0);
    if (!on) {
      if (Math.abs(t.clientY - y0) > 12 && Math.abs(t.clientY - y0) > dx) { x0 = null; return; }
      if (dx < 10) return;
      on = true;
      view.style.transition = 'none';
    }
    e.preventDefault();
    view.style.transform = `translateX(${dx}px)`;
    view.style.boxShadow = '-10px 0 30px rgba(0,0,0,0.25)';
  }, { passive: false });
  const end = () => {
    if (x0 == null) return;
    x0 = null;
    if (!on) return;
    view.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
    if (dx > window.innerWidth * 0.33) { haptic(); view.style.transform = 'translateX(100%)'; setTimeout(back, 200); }
    else { view.style.transform = ''; setTimeout(() => { view.style.boxShadow = ''; view.style.transition = ''; }, 260); }
  };
  view.addEventListener('touchend', end);
  view.addEventListener('touchcancel', end);
}

// setlist: { name, pos, total, prev, next } – Song wird als Teil einer Setlist geöffnet (unten ‹ › zum Blättern)
export async function showEditor(song, { mount, goHome, setlist = null }) {
  const tabs = new Map((await loadTabsOf(song.id)).map((t) => [t.id, t]));
  const view = h('div', { class: 'view paper editor-view' });
  const status = saveIndicator();
  // Zwei Ansichten: „Bearbeiten“ und kompakt „Ansehen“ (die zuletzt gewählte wird gemerkt)
  let mode = song.sections.length || setlist ? 'view' : 'edit';
  let scale = Number(await db.getSetting('viewScale', 1)) || 1;
  let cscale = Number(await db.getSetting('chordScale', 1)) || 1;
  let pinned = (await db.getSetting('chordPin', false)) === true;
  // Kopfzeile: links nur der Zurück-Pfeil, in der Mitte der Titel (erscheint beim Scrollen), rechts ein Menü.
  // Beim Bearbeiten kommen Rückgängig und „Fertig“ dazu.
  const undoBtn = h('button', { class: 'glass-btn nav-icon nav-undo', 'aria-label': 'Rückgängig', onClick: () => undo() }, icon('undo', 'small'));
  const doneBtn = h('button', { class: 'glass-btn text bold nav-done', onClick: () => setMode('view') }, 'Fertig');
  const navTitle = h('div', { class: 'nav-title' }, song.title);
  const nav = h('header', { class: 'navbar song-nav' },
    h('div', { class: 'nav-row' },
      h('div', { class: 'nav-left' }, h('button', { class: 'glass-btn nav-back', 'aria-label': 'Zurück zu den Songs', onClick: close }, icon('back'))),
      navTitle,
      h('div', { class: 'nav-right' }, status.el, undoBtn,
        h('button', { class: 'glass-btn nav-icon nav-more', 'aria-label': 'Weitere Aktionen', onClick: moreMenu }, icon('more')),
        doneBtn)));
  const main = h('main', { class: 'editor' });
  const media = mediaSection(song, { onAnalyze: (photos) => openImporter({ intoSong: song, mode: 'media', photos, onDone: afterImport }) });
  function afterImport() { mode = 'edit'; render(); media.refresh(); }
  view.append(nav, main);
  view.addEventListener('scroll', () => nav.classList.toggle('scrolled', view.scrollTop > 10), { passive: true });
  edgeSwipeBack(view, close);

  const save = () => touch(song);
  const foldKey = 'gn-collapsed:' + song.id;
  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem(foldKey) || '[]')); } catch { /* ohne Speicher: alles offen */ }
  function toggleFold(sec) {
    if (collapsed.has(sec.id)) collapsed.delete(sec.id); else collapsed.add(sec.id);
    try { localStorage.setItem(foldKey, JSON.stringify([...collapsed])); } catch { /* egal */ }
    render();
  }

  // ---------- Rückgängig (ganzer Song) ----------
  const history = [], trash = new Map();
  let last = JSON.stringify(song), recordTimer = 0, restoring = false;
  const record = () => {
    clearTimeout(recordTimer);
    const cur = JSON.stringify(song);
    if (cur !== last) { history.push(last); if (history.length > 50) history.shift(); last = cur; }
    syncUndo();
  };
  const offTouch = onTouch((s) => { if (s === song && !restoring) { clearTimeout(recordTimer); recordTimer = setTimeout(record, 700); syncUndo(true); } });
  function syncUndo(pending) { undoBtn.disabled = !history.length && !pending; }
  async function undo() {
    record();
    const prev = history.pop();
    if (!prev) { syncUndo(); return; }
    const data = JSON.parse(prev);
    for (const k of Object.keys(song)) if (!(k in data)) delete song[k];
    Object.assign(song, data, { id: song.id });
    // Tabs, die durch das Rückgängigmachen wieder gebraucht werden, aus dem Papierkorb zurückholen
    for (const sec of song.sections) for (const b of sec.blocks) {
      if (b.type === 'tab' && b.tabId && !tabs.has(b.tabId) && trash.has(b.tabId)) { const t = trash.get(b.tabId); tabs.set(t.id, t); await db.put('tabs', t); }
    }
    restoring = true;
    touch(song);
    restoring = false;
    last = JSON.stringify(song);
    syncUndo();
    render();
    toast('Rückgängig gemacht', 1200);
  }
  const inst = () => instrumentOf(song);
  // Akkordfolge, die gerade direkt im Song bearbeitet wird (nur eine zur Zeit)
  let editing = null;

  function render() {
    const st = view.scrollTop;
    nav.classList.toggle('editing', mode === 'edit');
    navTitle.textContent = song.title;
    main.classList.toggle('viewing', mode === 'view');
    main.style.setProperty('--vs', scale);
    media.setEditable(mode === 'edit');
    main.style.setProperty('--cs', cscale);
    if (mode === 'view') fill(main, songView(song, tabs, { media, pinned, onPin: () => setPinned(!pinned) }));
    else fill(main, head(), chordStrip(), song.sections.map(sectionEl), addSectionEl(), media);
    view.scrollTop = st;
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    if (m === 'edit') { if (!setlist) setWake(false); }
    else editing = null;
    render();
    view.scrollTop = 0;
  }

  // ---------- Leseansicht: Schriftgröße und Display anlassen ----------
  let wakeLock = null, wantWake = false;
  async function setWake(on) {
    wantWake = on;
    if (!on) { if (wakeLock) wakeLock.release().catch(() => {}); wakeLock = null; return; }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      wantWake = false;
      toast('„Display an“ wird hier nicht unterstützt (iPhone: ab iOS 16.4).');
    }
  }
  // iOS gibt die Sperre beim Wechsel in den Hintergrund frei – beim Zurückkehren erneut anfordern.
  const onVisible = () => { if (document.visibilityState === 'visible' && wantWake) setWake(true); };
  document.addEventListener('visibilitychange', onVisible);

  // Schriftgröße und Größe der Griffbilder getrennt einstellen, Akkordleiste fixieren
  function displaySheet() {
    const range = (value, min, max, step, onInput) => {
      const r = h('input', { type: 'range', class: 'slider', min, max, step, value });
      r.addEventListener('input', () => onInput(Number(r.value)));
      return r;
    };
    const body = h('div', null,
      h('div', { class: 'form-group' },
        h('div', { class: 'form-row slider-row' }, h('span', { class: 'lbl small-a' }, 'A'),
          range(scale, 0.8, 1.6, 0.05, (v) => { scale = v; main.style.setProperty('--vs', v); db.setSetting('viewScale', v); }), h('span', { class: 'lbl big-a' }, 'A')),
        h('div', { class: 'form-row slider-row' }, h('span', { class: 'lbl' }, icon('grid', 'small')),
          range(cscale, 0.8, 2.2, 0.1, (v) => { cscale = v; main.style.setProperty('--cs', v); db.setSetting('chordScale', v); }), h('span', { class: 'lbl' }, icon('grid')))),
      h('p', { class: 'form-foot' }, 'Oben: Textgröße. Unten: Größe der Griffbilder – unabhängig vom Text.'),
      h('div', { class: 'form-group' },
        formRow('Akkordleiste fixieren', toggle(pinned, (v) => setPinned(v)), 'bleibt beim Scrollen oben sichtbar')));
    sheet({ title: 'Darstellung', body, right: { label: 'Fertig', bold: true } });
  }
  function setPinned(v) {
    pinned = v;
    db.setSetting('chordPin', v);
    render();
  }

  // ---------- Setlist: zum vorherigen/nächsten Song blättern ----------
  const setBtn = (dir) => h('button', { class: 'stage-btn', 'aria-label': dir < 0 ? 'Vorheriger Song' : 'Nächster Song', disabled: !(dir < 0 ? setlist.prev : setlist.next), onClick: () => (dir < 0 ? setlist.prev : setlist.next)() }, icon(dir < 0 ? 'back' : 'chevron'));
  const setBar = setlist && h('div', { class: 'stage-bar set-bar', role: 'toolbar', 'aria-label': 'Setlist' },
    setBtn(-1), h('span', { class: 'set-info' }, `${setlist.name} · ${setlist.pos + 1}/${setlist.total}`), setBtn(1));
  if (setBar) view.classList.add('in-setlist');

  // ---------- Kopf ----------
  function head() {
    const title = autogrow(h('textarea', { class: 'song-title', rows: 1, value: song.title, placeholder: 'Titel', 'aria-label': 'Titel', enterkeyhint: 'next' }));
    const artist = h('input', { class: 'song-artist', value: song.artist, placeholder: 'Künstler', 'aria-label': 'Künstler', enterkeyhint: 'done', autocomplete: 'off' });
    title.addEventListener('input', () => {
      if (title.value.includes('\n')) title.value = title.value.replace(/\n/g, ' ');
      song.title = title.value.trim() || 'Ohne Titel';
      navTitle.textContent = song.title;
      save();
    });
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); artist.focus(); } });
    artist.addEventListener('input', () => { song.artist = artist.value.trim(); save(); });
    artist.addEventListener('keydown', (e) => { if (e.key === 'Enter') artist.blur(); });
    const parts = metaParts(song);
    const notes = autogrow(h('textarea', { class: 'song-notes', rows: 1, value: song.notes, placeholder: 'Notizen zum Song …', 'aria-label': 'Notizen zum Song' }));
    notes.addEventListener('input', () => { song.notes = notes.value; save(); });
    return h('div', { class: 'song-head' },
      song.sample && h('div', { class: 'sample-note' }, 'Beispieldaten – in den Einstellungen mit einem Tipp entfernbar.'),
      title, artist,
      h('button', { class: 'meta-row', onClick: openDetails, 'aria-label': 'Details bearbeiten' },
        parts.length ? parts.map((p) => h('span', { class: 'meta-chip' }, p)) : h('span', { class: 'meta-chip add' }, icon('plus', 'small'), 'Capo, Stimmung, Tempo')),
      notes);
  }

  // Alle Griffe des Songs – auch weitere Varianten mit gleichem Namen, die (noch) in keiner Akkordfolge stehen
  function chordStrip() {
    const list = songChordList(song, inst());
    const items = () => song.sections.flatMap((sec) => sec.blocks.filter((b) => b.type === 'chords').flatMap((b) => b.items));
    const card = ({ ch, name, label, used }) => h('button', {
      class: 'chord-card small' + (used ? '' : ' unused'), html: diagramSVG({ ...ch, name: label }), 'aria-label': `Griff ${label} bearbeiten`,
      onClick: () => openDiagramEditor({
        chord: ch, name, instrument: inst(), songId: song.id,
        // Nur Stellen mit genau diesem Griff übernehmen den geänderten Griff
        onSave: (c) => { for (const x of items()) if (findChord(x.name, x.chordId, inst())?.id === ch.id) linkChord(x, c); save(); render(); },
        onDelete: (c) => { for (const x of items()) if (x.chordId === c.id) delete x.chordId; save(); render(); },
      }),
    });
    const add = h('button', { class: 'chord-card small add-grip', 'aria-label': 'Griff hinzufügen', onClick: () => openDiagramEditor({ name: '', instrument: inst(), songId: song.id, onSave: () => render() }) },
      icon('plus'), h('span', null, 'Griff'));
    return h('div', { class: 'chord-strip-wrap' }, h('div', { class: 'chord-strip' }, list.map(card), add));
  }

  // ---------- Abschnitte ----------
  function sectionEl(sec, i) {
    const folded = collapsed.has(sec.id);
    const filled = sec.blocks.filter((b) => !blockIsEmpty(b, tabs)).length;
    return h('section', { class: 'sec' + (folded ? ' collapsed' : ''), 'data-sec': sec.id, 'data-kind': sectionKind(sec.name) || null },
      h('div', { class: 'sec-head' },
        h('button', { class: 'sec-name', 'aria-expanded': String(!folded), onClick: () => toggleFold(sec) }, icon('chevron', 'small sec-chev'), sec.name || 'Abschnitt'),
        folded && h('span', { class: 'sec-count' }, filled === 1 ? '1 Element' : `${filled} Elemente`),
        h('button', { class: 'icon-btn sec-more', 'aria-label': `Optionen für ${sec.name}`, onClick: () => sectionMenu(sec, i) }, icon('more'))),
      !folded && h('div', { class: 'sec-doc' }, sec.blocks.map((b, bi) => blockEl(sec, b, bi))),
      !folded && h('button', { class: 'add-block-btn', 'aria-label': `Zu „${sec.name}“ hinzufügen`, onClick: (e) => addMenu(sec, e.currentTarget) }, icon('plus', 'small'), !sec.blocks.length && h('span', null, 'Akkorde, Tab, Notiz …')));
  }

  // Kompaktes Menü direkt am „+“: der neue Block erscheint sofort im Song
  function addMenu(sec, anchor) {
    popMenu(anchor, [
      ...Object.entries(BLOCKS).filter(([type]) => type !== 'strum').map(([type, info]) => ({ label: info.label, icon: info.icon, onClick: () => addBlock(sec, type) })),
      blockClip && { label: 'Kopiertes einfügen', icon: 'paste', onClick: () => pasteBlock(sec) },
    ]);
  }

  // Ein Knopf statt vieler: die Abschnitt-Vorlagen erscheinen erst im Menü
  function addSectionEl() {
    const menu = (e) => popMenu(e.currentTarget, [
      ...SECTION_PRESETS.map((n) => ({ label: n, icon: 'music', onClick: () => addSection(n) })),
      { label: 'Eigener Name …', icon: 'rename', onClick: async () => { const n = await ask('Neuer Abschnitt', { placeholder: 'Name, z. B. Zwischenspiel', ok: 'Hinzufügen' }); if (n) addSection(n); } },
    ]);
    return h('div', { class: 'add-section' },
      h('button', { class: 'add-sec-btn glass', onClick: menu }, icon('plus', 'small'), song.sections.length ? 'Abschnitt' : 'Ersten Abschnitt anlegen'));
  }

  function addSection(name) {
    const sec = newSection(name);
    song.sections.push(sec);
    save();
    render();
    requestAnimationFrame(() => main.querySelector(`[data-sec="${sec.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  async function renameSection(sec) {
    const n = await ask('Abschnitt umbenennen', { value: sec.name, ok: 'Sichern' });
    if (!n) return;
    sec.name = n;
    save();
    render();
  }

  function moveSection(i, d) {
    const s = song.sections;
    [s[i], s[i + d]] = [s[i + d], s[i]];
    save();
    render();
  }

  async function cloneSectionInto(sec) {
    const c = clone(sec);
    c.id = uid();
    c.name = sec.name;
    const puts = [];
    for (const b of c.blocks) {
      b.id = uid();
      if (b.items) b.items.forEach((x) => { x.id = uid(); });
      if (b.type === 'tab' && tabs.get(b.tabId)) {
        const t = cloneTab(tabs.get(b.tabId), song.id);
        tabs.set(t.id, t);
        b.tabId = t.id;
        puts.push(['tabs', t]);
      }
    }
    await db.putMany(puts);
    return c;
  }

  function sectionMenu(sec, i) {
    const n = song.sections.length;
    actionSheet(sec.name, [
      { label: 'Umbenennen', icon: 'rename', onClick: () => renameSection(sec) },
      { label: collapsed.has(sec.id) ? 'Aufklappen' : 'Einklappen', icon: 'fold', onClick: () => toggleFold(sec) },
      { label: 'Duplizieren', icon: 'copy', onClick: async () => { song.sections.splice(i + 1, 0, await cloneSectionInto(sec)); save(); render(); toast('Abschnitt dupliziert'); } },
      i > 0 && { label: 'Nach oben', icon: 'up', onClick: () => moveSection(i, -1) },
      i < n - 1 && { label: 'Nach unten', icon: 'down', onClick: () => moveSection(i, 1) },
      n > 2 && { label: 'Reihenfolge ändern …', icon: 'sort', onClick: openReorder },
      { label: 'Abschnitt löschen', icon: 'trash', destructive: true, onClick: () => deleteSection(sec, i) },
    ]);
  }

  async function deleteSection(sec, i) {
    const filled = sec.blocks.filter((b) => !blockIsEmpty(b, tabs)).length;
    if (filled && !(await confirmDialog('Abschnitt löschen?', `„${sec.name}“ enthält ${filled} ${filled === 1 ? 'Element' : 'Elemente'}. Du kannst das mit ↶ oben rückgängig machen.`, { ok: 'Löschen', destructive: true }))) return;
    song.sections.splice(i, 1);
    for (const b of sec.blocks) if (b.type === 'tab' && b.tabId) { if (tabs.has(b.tabId)) trash.set(b.tabId, tabs.get(b.tabId)); tabs.delete(b.tabId); await db.removeNow('tabs', b.tabId); }
    save();
    render();
  }

  function openReorder() {
    const list = h('ul', { class: 'list reorder' });
    const draw = () => list.replaceChildren(...song.sections.map((sec, i) => h('li', { class: 'row' },
      h('span', { class: 'drag-handle', 'aria-hidden': 'true' }, icon('reorder')),
      h('span', { class: 'row-main static' }, h('span', { class: 'reorder-idx' }, i + 1), h('span', { class: 'row-title' }, sec.name)),
      h('button', { class: 'icon-btn', disabled: i === 0, 'aria-label': 'Nach oben', onClick: () => { moveSection(i, -1); draw(); } }, icon('up')),
      h('button', { class: 'icon-btn', disabled: i === song.sections.length - 1, 'aria-label': 'Nach unten', onClick: () => { moveSection(i, 1); draw(); } }, icon('down')))));
    dragSort(list, (from, to) => { const [x] = song.sections.splice(from, 1); song.sections.splice(to, 0, x); save(); render(); draw(); });
    draw();
    sheet({ title: 'Reihenfolge', body: h('div', null, list, h('p', { class: 'hint', style: 'margin-top:12px' }, 'Am Griff ≡ ziehen oder die Pfeile benutzen. Die Reihenfolge gilt im Song und im PDF.')), right: { label: 'Fertig', bold: true } });
  }

  // ---------- Blöcke ----------
  // Die Blöcke fließen wie ein Dokument ineinander; Art und Menü stehen nur dezent am Rand
  // und werden erst beim Bearbeiten deutlich.
  function blockEl(sec, b, bi) {
    let content;
    const active = editing?.id === b.id;
    if (b.type === 'chords' && active) {
      content = progressionEditor(b, song, { state: editing, onChange: save, onDone: () => { editing = null; render(); } });
    } else if (b.type === 'chords') content = h('button', { class: 'block-main', 'aria-label': 'Akkordfolge bearbeiten', onClick: () => editBlock(b) }, progressionView(b, inst(), chordLabels(song, inst())));
    else if (b.type === 'strum') content = h('button', { class: 'block-main', 'aria-label': 'Anschlagmuster bearbeiten', onClick: () => editBlock(b) }, strumView(b));
    else if (b.type === 'tab') {
      const t = tabs.get(b.tabId);
      content = h('div', { class: 'block-main', role: 'button', tabindex: '0', onClick: () => editBlock(b), onKeydown: (e) => { if (e.key === 'Enter') editBlock(b); } },
        !t ? h('div', { class: 'empty-hint' }, 'Tippen, um einen Tab anzulegen')
          : isEmptyTab(t) ? h('div', { class: 'empty-hint' }, 'Leerer Tab – tippen zum Bearbeiten')
            : h('div', { class: 'tab-scroll', html: tabSVG(t, { tuning: song.tuning }) }));
    } else {
      const ta = autogrow(h('textarea', { class: 'note-text', rows: 1, value: b.text, placeholder: 'Notiz, Liedtext, Hinweis zum Spielen …', 'aria-label': 'Notiz' }));
      ta.addEventListener('input', () => { b.text = ta.value; save(); });
      content = h('div', { class: 'block-main' }, ta);
    }
    const kind = b.type === 'tab' ? tabs.get(b.tabId)?.name || 'Tab' : BLOCKS[b.type].label;
    return h('div', { class: 'block block-' + b.type + (active ? ' active' : ''), 'data-block': b.id },
      h('div', { class: 'block-head' },
        h('span', { class: 'block-kind' }, icon(BLOCKS[b.type].icon, 'small'), kind),
        h('button', { class: 'block-more', 'aria-label': `${BLOCKS[b.type].label}: Optionen`, onClick: () => blockMenu(sec, b, bi) }, icon('more', 'small'))),
      content);
  }

  function editBlock(b, { focus = false } = {}) {
    if (b.type === 'chords') {
      editing = { id: b.id, sel: -1, at: b.items.length };
      render();
      const el = main.querySelector(`[data-block="${b.id}"]`);
      if (focus) el?.querySelector('.pe-input')?.focus();
      requestAnimationFrame(() => el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    } else if (b.type === 'strum') openStrumEditor(b, () => { save(); render(); });
    else if (b.type === 'tab') openTab(b);
  }

  async function openTab(b) {
    let t = tabs.get(b.tabId);
    if (!t) {
      t = newTab(song.id, 'Tab', stringsOf(inst()));
      b.tabId = t.id;
      tabs.set(t.id, t);
      await db.put('tabs', t);
      save();
    }
    openTabEditor(t, { tuning: song.tuning, onChange: () => { saveTab(t); save(); }, onClose: () => render() });
  }

  async function addBlock(sec, type) {
    const b = newBlock(type);
    if (type === 'tab') {
      const t = newTab(song.id, sec.name ? `${sec.name}-Tab` : 'Tab', stringsOf(inst()));
      tabs.set(t.id, t);
      b.tabId = t.id;
      db.put('tabs', t);
    }
    sec.blocks.push(b);
    save();
    render();
    if (type === 'notes') main.querySelector(`[data-block="${b.id}"] textarea`)?.focus();
    else editBlock(b, { focus: true });
  }

  function copyBlock(b) {
    blockClip = { block: clone(b), tab: b.type === 'tab' && tabs.get(b.tabId) ? clone(tabs.get(b.tabId)) : null };
    try { localStorage.setItem(CLIP_KEY, JSON.stringify(blockClip)); } catch { /* ignorieren */ }
    toast('Kopiert – über „Einfügen“ in jedem Abschnitt und Song einfügen');
    render();
  }

  async function insertCopy(sec, src, srcTab, index, suffix = '') {
    const b = cloneBlock(src);
    if (b.type === 'tab') {
      if (srcTab) {
        const t = cloneTab(srcTab, song.id);
        if (suffix) t.name += suffix;
        tabs.set(t.id, t);
        b.tabId = t.id;
        await db.put('tabs', t);
      } else b.tabId = null;
    }
    sec.blocks.splice(index, 0, b);
    save();
    render();
  }

  const pasteBlock = (sec) => insertCopy(sec, blockClip.block, blockClip.tab, sec.blocks.length);

  function moveBlock(sec, bi, d) {
    const si = song.sections.indexOf(sec);
    const target = bi + d;
    if (target >= 0 && target < sec.blocks.length) {
      [sec.blocks[bi], sec.blocks[target]] = [sec.blocks[target], sec.blocks[bi]];
    } else {
      const other = song.sections[si + d];
      if (!other) return;
      const [b] = sec.blocks.splice(bi, 1);
      if (d < 0) other.blocks.push(b); else other.blocks.unshift(b);
      toast(`Nach „${other.name}“ verschoben`);
    }
    save();
    render();
  }

  function blockMenu(sec, b, bi) {
    const si = song.sections.indexOf(sec);
    const canUp = bi > 0 || si > 0, canDown = bi < sec.blocks.length - 1 || si < song.sections.length - 1;
    const t = tabs.get(b.tabId);
    actionSheet(BLOCKS[b.type].label, [
      b.type !== 'notes' && { label: 'Bearbeiten', icon: 'pencil', onClick: () => editBlock(b) },
      b.type === 'tab' && t && { label: 'Tab umbenennen', icon: 'rename', onClick: async () => { const n = await ask('Tab benennen', { value: t.name, ok: 'Sichern' }); if (n) { t.name = n; saveTab(t); save(); render(); } } },
      { label: 'Kopieren', icon: 'copy', onClick: () => copyBlock(b) },
      { label: 'Duplizieren', icon: 'plus', onClick: () => insertCopy(sec, b, t, bi + 1, ' (Kopie)') },
      canUp && { label: bi > 0 ? 'Nach oben' : `Nach oben in „${song.sections[si - 1].name}“`, icon: 'up', onClick: () => moveBlock(sec, bi, -1) },
      canDown && { label: bi < sec.blocks.length - 1 ? 'Nach unten' : `Nach unten in „${song.sections[si + 1].name}“`, icon: 'down', onClick: () => moveBlock(sec, bi, 1) },
      { label: 'Löschen', icon: 'trash', destructive: true, onClick: () => deleteBlock(sec, b) },
    ]);
  }

  async function deleteBlock(sec, b) {
    if (!blockIsEmpty(b, tabs) && !(await confirmDialog(`${BLOCKS[b.type].label} löschen?`, 'Dieses Element wird aus dem Abschnitt entfernt.', { ok: 'Löschen', destructive: true }))) return;
    sec.blocks.splice(sec.blocks.indexOf(b), 1);
    if (b.type === 'tab' && b.tabId) { if (tabs.has(b.tabId)) trash.set(b.tabId, tabs.get(b.tabId)); tabs.delete(b.tabId); await db.removeNow('tabs', b.tabId); }
    save();
    render();
  }

  // ---------- Details ----------
  function openDetails() {
    const tuningSel = h('select', { 'aria-label': 'Stimmung' });
    const tuningInput = h('input', { type: 'text', autocapitalize: 'characters', 'aria-label': 'Eigene Stimmung' });
    const tuningRow = h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Saiten (tief → hoch)'), tuningInput);
    // Stimmungsliste passend zum Instrument
    function fillTunings() {
      const list = INSTRUMENTS[inst()].tunings;
      const custom = !!song.tuning && !list.some((t) => t.notes === song.tuning);
      tuningSel.replaceChildren(...list.map((t, i) => h('option', { value: i === 0 ? '' : t.notes }, t.name)), h('option', { value: '__custom' }, 'Eigene …'));
      tuningSel.value = custom ? '__custom' : (song.tuning === defaultTuning(inst()) ? '' : song.tuning);
      tuningInput.value = custom ? song.tuning : '';
      tuningInput.placeholder = inst() === 'ukulele' ? 'z. B. A D F# B' : 'z. B. D A D G B D';
      tuningRow.classList.toggle('hidden', !custom);
      tuningInput.classList.toggle('hidden', !custom);
    }
    fillTunings();
    const instSeg = h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Instrument'),
      segmented(Object.entries(INSTRUMENTS).map(([value, i]) => ({ value, label: i.label })), inst(), (v) => {
        song.instrument = v;
        song.tuning = '';
        fillTunings();
        save();
        const other = [...tabs.values()].filter((t) => tabStrings(t) !== stringsOf(v)).length;
        toast(other ? `${INSTRUMENTS[v].label}: Diagramme und neue Tabs passen sich an. Vorhandene Tabs behalten ihre Saitenzahl.` : `Umgestellt auf ${INSTRUMENTS[v].label}`, other ? 4200 : 1600);
      }));
    tuningSel.addEventListener('change', () => {
      const isCustom = tuningSel.value === '__custom';
      tuningRow.classList.toggle('hidden', !isCustom);
      tuningInput.classList.toggle('hidden', !isCustom);
      song.tuning = isCustom ? tuningInput.value.trim() : tuningSel.value;
      if (isCustom) tuningInput.focus();
      save();
    });
    tuningInput.addEventListener('input', () => { song.tuning = tuningInput.value.trim().replace(/\s+/g, ' '); save(); });

    const bpm = h('input', { type: 'number', inputmode: 'numeric', min: '20', max: '400', value: song.bpm || '', placeholder: '–', 'aria-label': 'Tempo in BPM' });
    bpm.addEventListener('input', () => { const v = parseInt(bpm.value, 10); song.bpm = v > 0 && v < 1000 ? v : null; save(); });
    const ts = h('select', { 'aria-label': 'Taktart' }, h('option', { value: '' }, 'Keine'), TIME_SIGS.map((t) => h('option', { value: t }, t)));
    ts.value = song.timeSig || '';
    ts.addEventListener('change', () => { song.timeSig = ts.value; save(); });
    const title = h('input', { type: 'text', value: song.title, 'aria-label': 'Titel' });
    title.addEventListener('input', () => { song.title = title.value.trim() || 'Ohne Titel'; save(); });
    const artist = h('input', { type: 'text', value: song.artist, placeholder: 'Optional', 'aria-label': 'Künstler' });
    artist.addEventListener('input', () => { song.artist = artist.value.trim(); save(); });

    const body = h('div', null,
      h('div', { class: 'form-group' }, formRow('Titel', title), formRow('Künstler', artist)),
      h('div', { class: 'form-group' },
        instSeg,
        formRow('Stimmung', tuningSel),
        tuningRow,
        formRow('Capo', stepper({ value: song.capo || 0, min: 0, max: 12, format: (v) => (v ? `${v}. Bund` : 'Ohne'), onChange: (v) => { song.capo = v; save(); } })),
        formRow('Tempo (BPM)', bpm),
        formRow('Taktart', ts)),
      h('div', { class: 'form-group' },
        formRow('Erstellt', h('span', { class: 'muted' }, fullDate(song.createdAt))),
        formRow('Geändert', h('span', { class: 'muted' }, fullDate(song.updatedAt)))));
    sheet({ title: 'Details', body, right: { label: 'Fertig', bold: true }, onClose: render });
  }

  // ---------- Aktionen ----------
  function toggleFavorite() {
    song.favorite = !song.favorite;
    db.saveLater('songs', song);
    render();
    toast(song.favorite ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt', 1400);
  }

  async function exportPdf() {
    try {
      await db.flush();
      toast('PDF wird erstellt …', 1200);
      const { blob, filename } = await exportSongsPDF([song]);
      offerFile(blob, filename, { title: 'PDF bereit', openable: true });
    } catch (e) {
      console.error(e);
      alertDialog('PDF-Export fehlgeschlagen', String(e.message || e));
    }
  }

  function moreMenu() {
    actionSheet(song.title, [
      mode === 'view' ? { label: 'Bearbeiten', icon: 'pencil', onClick: () => setMode('edit') } : { label: 'Fertig bearbeiten', icon: 'eye', onClick: () => setMode('view') },
      { label: 'Darstellung …', icon: 'text', onClick: displaySheet },
      { label: wantWake ? 'Display darf wieder ausgehen' : 'Display anlassen', icon: 'sun', onClick: async () => { await setWake(!wantWake); if (wantWake) toast('Das Display bleibt an, solange der Song geöffnet ist.'); } },
      { label: 'Stimmgerät', icon: 'fork', onClick: tuner },
      { section: 'Song' },
      { label: song.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten', icon: 'star', onClick: toggleFavorite },
      { label: 'Details bearbeiten', icon: 'info', onClick: openDetails },
      { label: 'Abschnitte ordnen', icon: 'sort', disabled: song.sections.length < 2, onClick: openReorder },
      { label: 'Transponieren & Vereinfachen …', icon: 'music', onClick: () => openTransposer(song, render) },
      { section: 'Hinzufügen' },
      { label: 'Foto hinzufügen', icon: 'photo', onClick: () => addPhotoMenu(song.id, () => media.refresh()) },
      { label: 'Audio aufnehmen', icon: 'mic', onClick: () => openRecorder(song.id, () => media.refresh()) },
      { label: 'Text importieren …', icon: 'doc', onClick: () => openImporter({ intoSong: song, onDone: afterImport }) },
      { section: 'KI' },
      { label: 'Mit KI bearbeiten …', icon: 'magic', onClick: async () => { await db.flush(); openAiEdit(song.id, { onDone: () => window.dispatchEvent(new HashChangeEvent('hashchange')) }); } },
      { label: 'KI-Idee hinzufügen …', icon: 'magic', onClick: () => openImporter({ intoSong: song, mode: 'ai', onDone: afterImport }) },
      { label: 'Aus Foto oder Video …', icon: 'camera', onClick: () => openImporter({ intoSong: song, mode: 'media', onDone: afterImport }) },
      { section: 'Teilen & Sichern' },
      { label: 'Als PDF exportieren', icon: 'doc', onClick: exportPdf },
      { label: 'Als Datei exportieren (JSON)', icon: 'download', onClick: async () => { await db.flush(); const f = await exportSongsFile([song]); offerFile(f.blob, f.filename, { title: 'Song-Datei' }); } },
      { label: 'Song duplizieren', icon: 'copy', onClick: async () => { await db.flush(); const c = await duplicateSong(song, tabs); toast('Kopie erstellt'); location.hash = '#/song/' + encodeURIComponent(c.id); } },
      { section: ' ' },
      { label: 'Song löschen', icon: 'trash', destructive: true, onClick: async () => {
        if (!(await confirmDialog('Song löschen?', `„${song.title}“ wird mit allen Abschnitten und Tabs endgültig gelöscht.`, { ok: 'Löschen', destructive: true }))) return;
        await deleteSong(song);
        toast('Song gelöscht');
        goHome();
      } },
    ]);
  }

  function tuner() { openTuner({ instrument: inst(), tuning: song.tuning }); }

  async function close() {
    await db.flush();
    goHome();
  }

  render();
  syncUndo();
  // Beim Öffnen erscheinen die Karten leicht gestaffelt; beim Bearbeiten selbst wird nicht animiert
  main.classList.add('anim');
  setTimeout(() => main.classList.remove('anim'), 1000);
  mount(view, 'push', () => { status.dispose(); media.dispose(); setWake(false); offTouch(); clearTimeout(recordTimer); document.removeEventListener('visibilitychange', onVisible); });
  if (!song.sections.length && song.title === 'Neuer Song' && !setlist) main.querySelector('.song-title')?.select();
  if (setBar) { view.append(setBar); setWake(true); }
}
