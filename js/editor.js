// Songeditor: Kopfbereich, Abschnitte und frei kombinierbare Blöcke (Akkorde, Anschlag, Tab, Notiz).
import * as db from './storage.js';
import { h, fill, icon, navBtn, sheet, actionSheet, ask, confirmDialog, alertDialog, toast, autogrow, stepper, formRow, saveIndicator, offerFile, clone, fullDate, segmented, dragSort } from './ui.js';
import { SECTION_PRESETS, INSTRUMENTS, TIME_SIGS, newSection, newBlock, cloneBlock, touch, duplicateSong, deleteSong, metaParts, songChordItems, uid, instrumentOf, stringsOf, defaultTuning, onTouch, sectionKind } from './songs.js';
import { progressionView, openProgressionEditor } from './progression.js';
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

const BLOCKS = {
  chords: { label: 'Akkorde', icon: 'music' },
  strum: { label: 'Anschlag', icon: 'wave' },
  tab: { label: 'Tab', icon: 'strings' },
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

export async function showEditor(song, { mount, goHome }) {
  const tabs = new Map((await loadTabsOf(song.id)).map((t) => [t.id, t]));
  const view = h('div', { class: 'view paper editor-view' });
  const status = saveIndicator();
  // Zwei Ansichten: „Bearbeiten“ und kompakt „Ansehen“ (die zuletzt gewählte wird gemerkt)
  let mode = song.sections.length && (await db.getSetting('songMode', 'edit')) === 'view' ? 'view' : 'edit';
  let scale = Number(await db.getSetting('viewScale', 1)) || 1;
  const modeBtns = {
    edit: h('button', { class: 'seg-btn', role: 'radio', 'aria-label': 'Bearbeiten', title: 'Bearbeiten', onClick: () => setMode('edit') }, icon('pencil', 'small')),
    view: h('button', { class: 'seg-btn', role: 'radio', 'aria-label': 'Ansehen', title: 'Ansehen', onClick: () => setMode('view') }, icon('eye', 'small')),
  };
  const undoBtn = navBtn('undo', () => undo(), { label: 'Rückgängig' });
  const nav = h('header', { class: 'navbar' },
    h('div', { class: 'nav-row flex' },
      h('div', { class: 'nav-left' }, h('button', { class: 'nav-btn back', onClick: close }, icon('back'), 'Songs')),
      h('div', { class: 'seg mode-seg', role: 'radiogroup', 'aria-label': 'Ansicht' }, modeBtns.edit, modeBtns.view),
      h('div', { class: 'nav-right' }, status.el,
        undoBtn,
        navBtn('more', moreMenu, { label: 'Weitere Aktionen' }))));
  const main = h('main', { class: 'editor' });
  const media = mediaSection(song, { onAnalyze: (photos) => openImporter({ intoSong: song, mode: 'media', photos, onDone: afterImport }) });
  function afterImport() { mode = 'edit'; render(); media.refresh(); }
  view.append(nav, main);
  view.addEventListener('scroll', () => nav.classList.toggle('scrolled', view.scrollTop > 10), { passive: true });

  const save = () => touch(song);

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

  function render() {
    const st = view.scrollTop;
    for (const [k, b] of Object.entries(modeBtns)) { b.classList.toggle('on', k === mode); b.setAttribute('aria-checked', String(k === mode)); }
    main.classList.toggle('viewing', mode === 'view');
    main.style.setProperty('--vs', scale);
    media.setEditable(mode === 'edit');
    if (mode === 'view') fill(main, songView(song, tabs, { tools: viewTools(), media }));
    else fill(main, head(), chordStrip(), song.sections.map(sectionEl), addSectionEl(), media);
    view.scrollTop = st;
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    db.setSetting('songMode', m);
    if (m === 'edit') { setWake(false); if (view.classList.contains('stage')) stopStage(); }
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

  function viewTools() {
    const sizeBtn = (label, d, aria) => h('button', {
      class: 'pill', 'aria-label': aria,
      onClick: () => {
        scale = Math.round(Math.min(1.6, Math.max(0.8, scale + d)) * 100) / 100;
        db.setSetting('viewScale', scale);
        main.style.setProperty('--vs', scale);
      },
    }, label);
    const wake = h('button', {
      class: 'pill' + (wantWake ? ' accent' : ''), 'aria-pressed': String(wantWake),
      onClick: async () => {
        await setWake(!wantWake);
        wake.classList.toggle('accent', wantWake);
        wake.setAttribute('aria-pressed', String(wantWake));
        if (wantWake) toast('Das Display bleibt an, solange der Song geöffnet ist.');
      },
    }, icon('sun', 'small'), 'Display an');
    const play = h('button', { class: 'pill accent', onClick: () => startStage() }, icon('play', 'small'), 'Spielansicht');
    return h('div', { class: 'sv-tools' }, play, sizeBtn('A−', -0.1, 'Schrift kleiner'), sizeBtn('A+', 0.1, 'Schrift größer'), wake);
  }

  // ---------- Spielansicht mit Auto-Scroll ----------
  let speed = Number(await db.getSetting('scrollSpeed', 25)) || 25, scrolling = false, raf = 0, lastT = 0, acc = 0, touchPause = false;
  const speedLbl = h('span', { class: 'stage-speed' });
  const playBtn = h('button', { class: 'stage-btn main', 'aria-label': 'Auto-Scroll starten', onClick: () => setScroll(!scrolling) }, icon('play'));
  const stageBar = h('div', { class: 'stage-bar', role: 'toolbar', 'aria-label': 'Spielansicht' },
    h('button', { class: 'stage-btn', 'aria-label': 'Spielansicht beenden', onClick: () => stopStage() }, icon('close')),
    h('button', { class: 'stage-btn', 'aria-label': 'Langsamer', onClick: () => setSpeed(speed - 5) }, '−'),
    speedLbl,
    h('button', { class: 'stage-btn', 'aria-label': 'Schneller', onClick: () => setSpeed(speed + 5) }, '+'),
    h('button', { class: 'stage-btn', 'aria-label': 'Nach oben', onClick: () => { view.scrollTop = 0; } }, icon('up')),
    playBtn);
  function setSpeed(v) { speed = Math.max(5, Math.min(150, v)); speedLbl.textContent = `${speed}`; db.setSetting('scrollSpeed', speed); }
  setSpeed(speed);
  function tick(t) {
    if (!scrolling) return;
    const dt = lastT ? Math.min(100, t - lastT) : 16;
    lastT = t;
    if (!touchPause) {
      acc += (speed * dt) / 1000;
      const px = Math.floor(acc);
      if (px) { view.scrollTop += px; acc -= px; }
      if (view.scrollTop + view.clientHeight >= view.scrollHeight - 1) { setScroll(false); toast('Ende des Songs'); return; }
    }
    raf = requestAnimationFrame(tick);
  }
  function setScroll(on) {
    scrolling = on;
    cancelAnimationFrame(raf);
    lastT = 0; acc = 0;
    playBtn.replaceChildren(icon(on ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', on ? 'Auto-Scroll anhalten' : 'Auto-Scroll starten');
    if (on) raf = requestAnimationFrame(tick);
  }
  // Beim Berühren kurz anhalten, damit man selbst schieben kann
  view.addEventListener('touchstart', () => { touchPause = true; }, { passive: true });
  view.addEventListener('touchend', () => { touchPause = false; lastT = 0; }, { passive: true });
  async function startStage() {
    view.classList.add('stage');
    view.append(stageBar);
    if (!wantWake) await setWake(true);
    toast('Spielansicht: ▶ startet den Auto-Scroll', 2200);
  }
  function stopStage() {
    setScroll(false);
    view.classList.remove('stage');
    stageBar.remove();
    setWake(false);
    render();
  }

  // ---------- Kopf ----------
  function head() {
    const title = autogrow(h('textarea', { class: 'song-title', rows: 1, value: song.title, placeholder: 'Titel', 'aria-label': 'Titel', enterkeyhint: 'next' }));
    const artist = h('input', { class: 'song-artist', value: song.artist, placeholder: 'Künstler', 'aria-label': 'Künstler', enterkeyhint: 'done', autocomplete: 'off' });
    title.addEventListener('input', () => {
      if (title.value.includes('\n')) title.value = title.value.replace(/\n/g, ' ');
      song.title = title.value.trim() || 'Ohne Titel';
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
    return h('section', { class: 'sec', 'data-sec': sec.id, 'data-kind': sectionKind(sec.name) || null },
      h('div', { class: 'sec-head' },
        h('button', { class: 'sec-name', onClick: () => renameSection(sec) }, sec.name || 'Abschnitt'),
        h('span', { class: 'sec-rule' }),
        h('button', { class: 'icon-btn', 'aria-label': `Optionen für ${sec.name}`, onClick: () => sectionMenu(sec, i) }, icon('more'))),
      sec.blocks.map((b, bi) => blockEl(sec, b, bi)),
      h('div', { class: 'add-row' },
        Object.entries(BLOCKS).map(([type, info]) => h('button', { class: 'pill', onClick: () => addBlock(sec, type) }, icon('plus', 'small'), info.label)),
        blockClip && h('button', { class: 'pill accent', onClick: () => pasteBlock(sec) }, icon('copy', 'small'), 'Einfügen')));
  }

  function addSectionEl() {
    const pill = (label, fn) => h('button', { class: 'pill', onClick: fn }, label);
    return h('div', { class: 'add-section' },
      h('div', { class: 'form-label' }, song.sections.length ? 'Abschnitt hinzufügen' : 'Beginne mit einem Abschnitt'),
      h('div', { class: 'preset-row' },
        SECTION_PRESETS.map((n) => pill(n, () => addSection(n))),
        pill('Eigener …', async () => { const n = await ask('Neuer Abschnitt', { placeholder: 'Name, z. B. Zwischenspiel', ok: 'Hinzufügen' }); if (n) addSection(n); })));
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
      { label: 'Umbenennen', onClick: () => renameSection(sec) },
      { label: 'Duplizieren', onClick: async () => { song.sections.splice(i + 1, 0, await cloneSectionInto(sec)); save(); render(); toast('Abschnitt dupliziert'); } },
      i > 0 && { label: 'Nach oben', onClick: () => moveSection(i, -1) },
      i < n - 1 && { label: 'Nach unten', onClick: () => moveSection(i, 1) },
      n > 2 && { label: 'Reihenfolge ändern …', onClick: openReorder },
      { label: 'Abschnitt löschen', destructive: true, onClick: () => deleteSection(sec, i) },
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
  function blockEl(sec, b, bi) {
    let content;
    if (b.type === 'chords') content = h('button', { class: 'block-main', onClick: () => editBlock(b) }, progressionView(b, inst(), chordLabels(song, inst())));
    else if (b.type === 'strum') content = h('button', { class: 'block-main', onClick: () => editBlock(b) }, strumView(b));
    else if (b.type === 'tab') {
      const t = tabs.get(b.tabId);
      content = h('div', { class: 'block-main', role: 'button', tabindex: '0', onClick: () => editBlock(b), onKeydown: (e) => { if (e.key === 'Enter') editBlock(b); } },
        h('div', { class: 'block-label' }, icon('strings', 'small'), t?.name || 'Tab'),
        !t ? h('div', { class: 'empty-hint' }, 'Tippen, um einen Tab anzulegen')
          : isEmptyTab(t) ? h('div', { class: 'empty-hint' }, 'Leerer Tab – tippen zum Bearbeiten')
            : h('div', { class: 'tab-scroll', html: tabSVG(t, { tuning: song.tuning }) }));
    } else {
      const ta = autogrow(h('textarea', { class: 'note-text', rows: 2, value: b.text, placeholder: 'Notiz, Text, Hinweis zum Spielen …', 'aria-label': 'Notiz' }));
      ta.addEventListener('input', () => { b.text = ta.value; save(); });
      content = h('div', { class: 'block-main' }, ta);
    }
    return h('div', { class: 'block block-' + b.type, 'data-block': b.id },
      content,
      h('button', { class: 'block-more', 'aria-label': `${BLOCKS[b.type].label}: Optionen`, onClick: () => blockMenu(sec, b, bi) }, icon('more', 'small')));
  }

  function editBlock(b) {
    if (b.type === 'chords') openProgressionEditor(b, song, () => { save(); render(); });
    else if (b.type === 'strum') openStrumEditor(b, () => { save(); render(); });
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
    else editBlock(b);
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
      b.type === 'tab' && t && { label: 'Tab umbenennen', onClick: async () => { const n = await ask('Tab benennen', { value: t.name, ok: 'Sichern' }); if (n) { t.name = n; saveTab(t); save(); render(); } } },
      { label: 'Kopieren', onClick: () => copyBlock(b) },
      { label: 'Duplizieren', onClick: () => insertCopy(sec, b, t, bi + 1, ' (Kopie)') },
      canUp && { label: bi > 0 ? 'Nach oben' : `Nach oben in „${song.sections[si - 1].name}“`, onClick: () => moveBlock(sec, bi, -1) },
      canDown && { label: bi < sec.blocks.length - 1 ? 'Nach unten' : `Nach unten in „${song.sections[si + 1].name}“`, onClick: () => moveBlock(sec, bi, 1) },
      { label: 'Löschen', destructive: true, onClick: () => deleteBlock(sec, b) },
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
      { section: 'Song' },
      { label: song.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten', onClick: toggleFavorite },
      { label: 'Details bearbeiten', onClick: openDetails },
      { label: 'Abschnitte ordnen', disabled: song.sections.length < 2, onClick: openReorder },
      { label: 'Transponieren & Vereinfachen …', onClick: () => openTransposer(song, render) },
      { section: 'Hinzufügen' },
      { label: 'Foto hinzufügen', onClick: () => addPhotoMenu(song.id, () => media.refresh()) },
      { label: 'Audio aufnehmen', onClick: () => openRecorder(song.id, () => media.refresh()) },
      { label: 'Text importieren …', onClick: () => openImporter({ intoSong: song, onDone: afterImport }) },
      { section: 'KI' },
      { label: 'Mit KI bearbeiten …', onClick: async () => { await db.flush(); openAiEdit(song.id, { onDone: () => window.dispatchEvent(new HashChangeEvent('hashchange')) }); } },
      { label: 'KI-Idee hinzufügen …', onClick: () => openImporter({ intoSong: song, mode: 'ai', onDone: afterImport }) },
      { label: 'Aus Foto oder Video …', onClick: () => openImporter({ intoSong: song, mode: 'media', onDone: afterImport }) },
      { section: 'Teilen & Sichern' },
      { label: 'Als PDF exportieren', onClick: exportPdf },
      { label: 'Als Datei exportieren (JSON)', onClick: async () => { await db.flush(); const f = await exportSongsFile([song]); offerFile(f.blob, f.filename, { title: 'Song-Datei' }); } },
      { label: 'Song duplizieren', onClick: async () => { await db.flush(); const c = await duplicateSong(song, tabs); toast('Kopie erstellt'); location.hash = '#/song/' + encodeURIComponent(c.id); } },
      { section: ' ' },
      { label: 'Song löschen', destructive: true, onClick: async () => {
        if (!(await confirmDialog('Song löschen?', `„${song.title}“ wird mit allen Abschnitten und Tabs endgültig gelöscht.`, { ok: 'Löschen', destructive: true }))) return;
        await deleteSong(song);
        toast('Song gelöscht');
        goHome();
      } },
    ]);
  }

  async function close() {
    await db.flush();
    goHome();
  }

  render();
  syncUndo();
  // Beim Öffnen erscheinen die Karten leicht gestaffelt; beim Bearbeiten selbst wird nicht animiert
  main.classList.add('anim');
  setTimeout(() => main.classList.remove('anim'), 1000);
  mount(view, 'push', () => { status.dispose(); media.dispose(); setWake(false); setScroll(false); offTouch(); clearTimeout(recordTimer); document.removeEventListener('visibilitychange', onVisible); });
  if (!song.sections.length && song.title === 'Neuer Song') main.querySelector('.song-title')?.select();
}
