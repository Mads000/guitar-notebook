// Songeditor: Kopfbereich, Abschnitte und frei kombinierbare Blöcke (Akkorde, Anschlag, Tab, Notiz).
import * as db from './storage.js';
import { isSorell, longPress, removeAnimated, slideSel, wideMode } from './ui.js';
import { h, fill, icon, sheet, actionSheet, popMenu, haptic, anyOverlayOpen, ask, confirmDialog, alertDialog, toast, autogrow, stepper, formRow, saveIndicator, offerFile, clone, fullDate, segmented, dragSort, toggle, deviceScale, chordLayoutOf } from './ui.js';
import { SECTION_PRESETS, INSTRUMENTS, TIME_SIGS, newSection, newBlock, newChordItem, cloneBlock, touch, trashWithUndo, metaParts, songChordItems, uid, now, instrumentOf, stringsOf, defaultTuning, onTouch, sectionKind, sectionShort } from './songs.js';
import { progressionView, progressionEditor } from './progression.js';
import { strumView, openStrumEditor } from './strumming.js';
import { tabView, newTab, cloneTab, loadTabsOf, saveTab, isEmptyTab, tabStrings } from './tabs.js';
import { openTabEditor } from './tabeditor.js';
import { findChord, diagramSVG, openDiagramEditor, songChordList, chordLabels, linkChord, sameGrip, saveUserChord, isChordName } from './chords.js';
import { exportSongsPDF } from './pdf.js';
import { songView } from './songview.js';
import { mediaSection, addPhotoMenu, openRecorder } from './media.js';
import { openImporter } from './importer.js';
import { openSync } from './sync.js';
import { closePlayer } from './tabplayer.js';
import { openTheory } from './theory.js';
import { openTransposer, mapSongChords, transposeChord, prefersFlats, allChordNames, simplifyChord, suggestCapo } from './transpose.js';
import { transposeTabNotes } from './notes.js';
import { openMetronome, closeMetronome } from './metronome.js';
import { openAiEdit } from './aiedit.js';
import { exportSongsFile } from './backup.js';
import { openTuner } from './tuner.js';
import { openTextShare } from './textexport.js';

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

// Scrollposition je Song merken: Ein Song öffnet dort, wo man aufgehört hat
const POS_KEY = 'gn-song-pos';
const readPos = () => { try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {}; } catch { return {}; } };
function storePos(id, y) {
  const all = readPos();
  delete all[id]; // neu einsortieren, damit die ältesten zuerst herausfallen
  if (y > 0) all[id] = Math.round(y);
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 100))) delete all[k];
  try { localStorage.setItem(POS_KEY, JSON.stringify(all)); } catch { /* ohne Merken weiter */ }
}

// setlist: { name, pos, total, prev, next } – Song wird als Teil einer Setlist geöffnet (unten ‹ › zum Blättern)
export async function showEditor(song, { mount, goHome, setlist = null, sidebar = null }) {
  const tabs = new Map((await loadTabsOf(song.id)).map((t) => [t.id, t]));
  const view = h('div', { class: 'view paper editor-view' });
  const status = saveIndicator();
  // Zwei Ansichten: „Bearbeiten“ und kompakt „Ansehen“ (die zuletzt gewählte wird gemerkt)
  let mode = song.sections.length || setlist ? 'view' : 'edit';
  let scale = Number(await db.getSetting('viewScale', 1)) || 1;
  let cscale = Number(await db.getSetting('chordScale', 1)) || 1;
  let pinned = (await db.getSetting('chordPin', false)) === true;
  let jumpOn = (await db.getSetting('jumpBar', true)) !== false;
  // Kopfzeile: links nur der Zurück-Pfeil, in der Mitte der Titel (erscheint beim Scrollen), rechts ein Menü.
  // Beim Bearbeiten kommen Rückgängig und „Fertig“ dazu.
  const undoBtn = h('button', { class: 'glass-btn nav-icon nav-undo', 'aria-label': 'Rückgängig', onClick: () => undo() }, icon('undo', 'small'));
  const doneBtn = h('button', { class: 'glass-btn text bold nav-done', onClick: () => setMode('view') }, 'Fertig');
  const favBtn = h('button', { class: 'glass-btn nav-icon nav-fav s-only', onClick: () => toggleFavorite() }, icon('star', 'small'));
  const navTitle = h('div', { class: 'nav-title' }, song.title);
  const navTitleBox = h('div', { class: 'nav-titlebox' }, navTitle, h('span', { class: 'nav-editing s-only' }, 'Bearbeiten'));
  const navRight = h('div', { class: 'nav-right' });
  const nav = h('header', { class: 'navbar song-nav' },
    h('div', { class: 'nav-row' },
      h('div', { class: 'nav-left' }, h('button', { class: 'glass-btn nav-back', 'aria-label': 'Zurück zu den Songs', onClick: close }, icon('back')),
        // iPad quer / PC: Songliste daneben ein- und ausblenden
        sidebar && h('button', { class: 'glass-btn nav-icon nav-side', 'aria-label': 'Songliste ein- oder ausblenden', onClick: () => sidebar.toggle() }, icon('list', 'small'))),
      navTitleBox,
      navRight));
  fill(navRight, status.el,
    h('div', { class: 'nav-pill' }, undoBtn, favBtn,
      h('button', { class: 'glass-btn nav-icon nav-more', 'aria-label': 'Weitere Aktionen', onClick: moreMenu }, icon('more'))),
    h('button', { class: 'glass-btn nav-edit s-only', 'aria-label': 'Bearbeiten', onClick: () => setMode('edit') }, icon('pencil', 'small'), h('span', null, 'Bearbeiten')),
    doneBtn);
  const main = h('main', { class: 'editor' });
  const media = mediaSection(song, { onAnalyze: (photos) => openImporter({ intoSong: song, mode: 'media', photos, onDone: afterImport }) });
  function afterImport() { mode = 'edit'; render(); media.refresh(); }
  // Beim Spielen: eine schwebende Leiste, in der immer alle Abschnitte zu sehen und direkt antippbar sind, der aktuelle
  // ist markiert. Außen ↑ und ↓, in einer Setlist stattdessen voriger/nächster Song.
  // Passen die vollen Namen nicht, stehen dort Kürzel (St1, Ch, Br); reicht auch das nicht, gibt es eine zweite Reihe.
  const jump = h('nav', { class: 'sec-jump', 'aria-label': 'Navigation im Song' });
  // Sorell am PC: Beim Bearbeiten stehen Song-Felder, Griffe, Anhänge und Notizen rechts
  const inspector = h('aside', { class: 'inspector', 'aria-label': 'Song-Details' });
  const wideEdit = matchMedia('(min-width: 1000px)');
  const useInspector = () => isSorell() && wideEdit.matches;
  const onWideEdit = () => { if (mode === 'edit') render(); };
  wideEdit.addEventListener?.('change', onWideEdit);
  view.append(nav, main, jump, inspector);
  view.addEventListener('scroll', () => nav.classList.toggle('scrolled', view.scrollTop > 10), { passive: true });
  // Nach Song-Reihenfolge (in zwei Spalten weicht die Reihenfolge im Dokument davon ab)
  const secEls = () => [...main.querySelectorAll('.sv-sec')].sort((a, b) => a.dataset.idx - b.dataset.idx);
  const jumpOffset = () => {
    const pin = main.querySelector('.sv-chords-wrap.pinned');
    return nav.offsetHeight + (pin && getComputedStyle(pin).position === 'sticky' ? pin.offsetHeight : 0) + 10;
  };
  let jumpCur = 0, jumpLock = false, jumpShown = -1; // jumpLock: nach einem Tipp gilt das Ziel, auch wenn es nicht ganz nach oben scrollen kann
  const sjPrev = h('button', { class: 'sj-btn', 'aria-label': 'Voriger Abschnitt', onClick: () => stepJump(-1) }, icon('up'));
  const sjNext = h('button', { class: 'sj-btn', 'aria-label': 'Nächster Abschnitt', onClick: () => stepJump(1) }, icon('down'));
  const sjChips = slideSel(h('div', { class: 'sj-chips' }), '.sj-chip');
  function fitJump() {
    sjChips.classList.remove('short');
    if (sjChips.scrollWidth > sjChips.clientWidth + 1) sjChips.classList.add('short');
    view.style.setProperty('--jump-h', `${jump.offsetHeight}px`);
  }
  if (typeof ResizeObserver === 'function') {
    let w = 0;
    new ResizeObserver(() => { if (sjChips.clientWidth !== w) { w = sjChips.clientWidth; fitJump(); } }).observe(sjChips);
  }
  function drawJump() {
    const secs = jumpOn && mode === 'view' && song.sections.length > 1;
    const on = secs || !!setlist;
    view.classList.toggle('has-jump', on);
    if (!on) { jump.replaceChildren(); return; }
    const songBtn = (dir) => { const go = dir < 0 ? setlist.prev : setlist.next; return h('button', { class: 'sj-btn sj-song', 'aria-label': dir < 0 ? 'Voriger Song' : 'Nächster Song', disabled: !go, onClick: () => go() }, icon(dir < 0 ? 'prevSong' : 'nextSong')); };
    if (secs) {
      jumpShown = -1;
      fill(sjChips,
        setlist && h('span', { class: 'sj-pos', 'aria-label': `Song ${setlist.pos + 1} von ${setlist.total}` }, `${setlist.pos + 1}/${setlist.total}`),
        song.sections.map((sec, i) => h('button', { class: 'sj-chip', 'data-i': i, 'data-kind': sectionKind(sec.name) || null, 'aria-label': sec.name, onClick: () => { haptic(); jumpTo(i); } },
          h('span', { class: 'sj-l' }, sec.name), h('span', { class: 'sj-s' }, sectionShort(sec.name, i)))));
    }
    fill(jump,
      setlist && songBtn(-1),
      secs && !setlist && sjPrev,
      secs ? sjChips : h('div', { class: 'sj-now static' }, h('span', { class: 'sj-name' }, setlist.name), h('span', { class: 'sj-sub' }, `Song ${setlist.pos + 1} von ${setlist.total}`)),
      secs && !setlist && sjNext,
      setlist && songBtn(1));
    requestAnimationFrame(() => { fitJump(); markJump(); });
  }
  function jumpTo(i) {
    const el = secEls()[i];
    if (!el) return;
    if (el.classList.contains('collapsed')) { el.classList.remove('collapsed'); el.querySelector('.sv-sec-name')?.setAttribute('aria-expanded', 'true'); }
    const top = el.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop - jumpOffset();
    jumpLock = true;
    jumpCur = i;
    // Weite Sprünge sofort: Beim Spielen zählt, dass der Abschnitt gleich dasteht
    view.scrollTo({ top: Math.max(0, top), behavior: Math.abs(top - view.scrollTop) > view.clientHeight * 1.5 ? 'auto' : 'smooth' });
    markJump();
    // Kurz aufleuchten: Am Song-Ende kann der Abschnitt nicht ganz nach oben rücken
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 900);
  }
  // ↑ geht zuerst an den Anfang des aktuellen Abschnitts, wenn man schon mitten darin ist
  function stepJump(d) {
    if (d < 0) {
      const el = secEls()[jumpCur];
      const inside = el && !jumpLock && el.getBoundingClientRect().top < view.getBoundingClientRect().top + jumpOffset() - 24;
      if (inside) { jumpTo(jumpCur); return; }
      if (jumpCur === 0) { view.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    }
    jumpTo(Math.max(0, Math.min(song.sections.length - 1, jumpCur + d)));
  }
  // Der Abschnitt, der gerade oben steht, ist in der Leiste markiert
  let jumpRaf = 0;
  function markJump() {
    jumpRaf = 0;
    if (mode !== 'view' || !song.sections.length || !jump.contains(sjChips)) return;
    if (!jumpLock) {
      const lim = view.getBoundingClientRect().top + jumpOffset() + 40;
      let cur = 0;
      secEls().forEach((el, i) => { if (el.getBoundingClientRect().top <= lim) cur = i; });
      if (view.scrollTop + view.clientHeight >= view.scrollHeight - 4) cur = song.sections.length - 1;
      jumpCur = cur;
    }
    sjNext.disabled = !song.sections[jumpCur + 1];
    if (jumpCur === jumpShown) return;
    jumpShown = jumpCur;
    for (const c of sjChips.querySelectorAll('.sj-chip')) {
      const on = Number(c.dataset.i) === jumpCur;
      c.classList.toggle('on', on);
      if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
    }
  }
  view.addEventListener('scroll', () => { if (!jumpRaf && view.classList.contains('has-jump')) jumpRaf = requestAnimationFrame(markJump); }, { passive: true });
  const unlockJump = () => { jumpLock = false; };
  view.addEventListener('touchmove', unlockJump, { passive: true });
  view.addEventListener('wheel', unlockJump, { passive: true });
  edgeSwipeBack(view, close);

  const save = () => touch(song);
  const foldKey = 'gn-collapsed:' + song.id;
  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem(foldKey) || '[]')); } catch { /* ohne Speicher: alles offen */ }
  function toggleFold(sec) {
    if (collapsed.has(sec.id)) collapsed.delete(sec.id); else collapsed.add(sec.id);
    try { localStorage.setItem(foldKey, JSON.stringify([...collapsed])); } catch { /* egal */ }
    // Sorell: nicht neu zeichnen, sonst könnte die Höhe nicht weich laufen
    const el = isSorell() && main.querySelector(`[data-sec="${sec.id}"]`);
    if (el) {
      const shut = collapsed.has(sec.id);
      el.classList.toggle('collapsed', shut);
      el.querySelector('.sec-name, .sec-foldbtn')?.setAttribute('aria-expanded', String(!shut));
      return;
    }
    render();
  }

  // ---------- Rückgängig (ganzer Song) ----------
  const history = [], trash = new Map();
  // Transponieren ändert auch Tabs. Die liegen außerhalb des Songs: Ihr Stand wird zum Song-Stand davor gemerkt.
  const tabUndo = new Map();
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
    const tabSnap = tabUndo.get(prev);
    if (tabSnap) {
      tabUndo.delete(prev);
      for (const [id, measures] of JSON.parse(tabSnap)) { const t = tabs.get(id); if (t) { t.measures = measures; saveTab(t); } }
    }
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
    favBtn.firstChild.classList.toggle('filled', !!song.favorite);
    favBtn.setAttribute('aria-label', song.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten');
    main.classList.toggle('viewing', mode === 'view');
    view.classList.toggle('viewing', mode === 'view');
    closePlayer();
    main.style.setProperty('--vs', scale * deviceScale());
    media.setEditable(mode === 'edit');
    main.style.setProperty('--cs', cscale * deviceScale());
    if (mode === 'view') {
      const shown = shownSong();
      const changed = shown.song !== song;
      fill(main, songView(shown.song, shown.tabs, { media, pinned, onPin: () => setPinned(!pinned), scale, onMissing: changed ? null : addMissingGrip, notice: changed ? shownNotice(shown.song) : null }));
    } else if (useInspector()) {
      fill(main, editSections(), song.sections.length ? addSectionEl() : quickStart());
      seenReady = true;
    } else { fill(main, head(), chordStrip(), editSections(), song.sections.length ? addSectionEl() : quickStart(), media); seenReady = true; }
    drawInspector();
    view.scrollTop = st;
    drawJump();
  }

  // Sorell: ein gemeinsamer Container, damit die Abschnitte am PC wie in der Song-Ansicht in zwei Spalten laufen.
  // Lange Tabs bekommen dieselbe volle Breite wie dort.
  function editSections() {
    const els = song.sections.map((sec) => {
      const el = sectionEl(sec);
      if (sec.blocks.some((b) => b.type === 'tab' && (tabs.get(b.tabId)?.measures.length || 0) > 2)) el.dataset.wide = '1';
      return el;
    });
    return isSorell() ? h('div', { class: 'ed-secs' + (wideMode() ? ' two' : '') }, els) : els;
  }

  // Inspektor: dieselben Felder wie unter „Details“ und im Kopf des Handy-Editors
  function drawInspector() {
    const on = mode === 'edit' && useInspector();
    view.classList.toggle('inspecting', on);
    inspector.hidden = !on;
    if (on) navTitleBox.append(status.el); else if (status.el.parentNode !== navRight) navRight.prepend(status.el);
    if (!on) { inspector.replaceChildren(); return; }
    // Beim Tippen nicht neu aufbauen, sonst verliert das Feld den Fokus
    if (inspector.contains(document.activeElement) && inspector.childElementCount) return;
    const field = (label, control) => h('label', { class: 'insp-row' }, h('span', null, label), control);
    const title = h('input', { type: 'text', value: song.title, autocomplete: 'off', 'aria-label': 'Titel' });
    title.addEventListener('input', () => { song.title = title.value.trim() || 'Ohne Titel'; navTitle.textContent = song.title; save(); });
    const artist = h('input', { type: 'text', value: song.artist, autocomplete: 'off', 'aria-label': 'Künstler' });
    artist.addEventListener('input', () => { song.artist = artist.value.trim(); save(); });
    const instrument = h('select', { 'aria-label': 'Instrument' }, Object.entries(INSTRUMENTS).map(([value, i]) => h('option', { value }, i.label)));
    instrument.value = inst();
    instrument.addEventListener('change', () => {
      song.instrument = instrument.value;
      song.tuning = '';
      save();
      const other = [...tabs.values()].filter((t) => tabStrings(t) !== stringsOf(instrument.value)).length;
      toast(other ? `${INSTRUMENTS[instrument.value].label}: Diagramme und neue Tabs passen sich an. Vorhandene Tabs behalten ihre Saitenzahl.` : `Umgestellt auf ${INSTRUMENTS[instrument.value].label}`, other ? 4200 : 1600);
      instrument.blur();
      render();
    });
    const capo = h('select', { 'aria-label': 'Capo' }, Array.from({ length: 13 }, (_, n) => h('option', { value: n }, n ? `${n}. Bund` : 'kein Capo')));
    capo.value = String(song.capo || 0);
    capo.addEventListener('change', () => { song.capo = Number(capo.value); save(); });
    const bpm = h('input', { type: 'number', inputmode: 'numeric', min: '20', max: '400', value: song.bpm || '', placeholder: 'BPM', 'aria-label': 'Tempo in BPM' });
    bpm.addEventListener('input', () => { const v = parseInt(bpm.value, 10); song.bpm = v > 0 && v < 1000 ? v : null; save(); });
    const strip = chordStrip();
    const addGrip = strip.querySelector('.add-grip');
    const notes = h('textarea', { class: 'insp-notes', value: song.notes, placeholder: 'Notizen zum Song …', 'aria-label': 'Notizen zum Song' });
    notes.addEventListener('input', () => { song.notes = notes.value; save(); });
    fill(inspector,
      song.sample && h('div', { class: 'sample-note' }, 'Beispieldaten – in den Einstellungen mit einem Tipp entfernbar.'),
      h('div', { class: 'insp-cap' }, 'Song'),
      field('Titel', title), field('Künstler', artist), field('Instrument', instrument), field('Capo', capo), field('Tempo', bpm),
      h('div', { class: 'insp-cap' }, 'Griffe', h('button', { class: 'insp-add', 'aria-label': 'Griff hinzufügen', onClick: () => addGrip?.click() }, icon('plus', 'small'))),
      strip,
      h('div', { class: 'insp-cap' }, 'Anhänge'),
      h('div', { class: 'insp-media' },
        h('button', { class: 'insp-btn', onClick: () => addPhotoMenu(song.id, () => media.refresh()) }, icon('camera', 'small'), 'Foto'),
        h('button', { class: 'insp-btn', onClick: () => openRecorder(song.id, () => media.refresh()) }, icon('mic', 'small'), 'Aufnahme')),
      media,
      h('div', { class: 'insp-cap' }, 'Notizen'),
      notes);
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    if (m === 'edit') { if (!setlist) setWake(false); }
    else editing = null;
    render();
    view.scrollTop = 0;
  }

  // ---------- Nur Anzeige: andere Tonart, anderer Capo oder vereinfacht, der Song selbst bleibt unverändert ----------
  let showSemis = 0, showCapo = null, showSimple = false; // showCapo: null = Capo des Songs
  const songCapo = () => song.capo || 0;
  function shownSong() {
    const capo = showCapo ?? songCapo();
    // Mit Capo höher greift man entsprechend tiefer, damit der Song gleich klingt
    const off = showSemis - (capo - songCapo());
    if (!off && capo === songCapo() && !showSimple) return { song, tabs };
    const copy = clone(song);
    copy.capo = capo;
    // Die Angaben nennen auch, was nur angezeigt wird: Gezählt wird immer gegenüber dem Original
    const total = ((song.transposed || 0) + showSemis) % 12 || 0;
    if (total) copy.transposed = total; else delete copy.transposed;
    if (showSimple) copy.simplified = true;
    const flats = prefersFlats(allChordNames(song), off);
    const map = (c) => transposeChord(c, off, flats);
    mapSongChords(copy, map);
    // Vereinfachen ändert wie im Song selbst nur Akkordnamen, nicht die Tabs
    if (showSimple) mapSongChords(copy, simplifyChord);
    if (!off) return { song: copy, tabs };
    const out = new Map();
    for (const [id, t] of tabs) { const c = clone(t); transposeTabNotes(c, off, map); out.set(id, c); }
    return { song: copy, tabs: out };
  }
  function resetShown() { showSemis = 0; showCapo = null; showSimple = false; render(); }
  function shownNotice(shown) {
    const parts = [showSemis && `${showSemis > 0 ? '+' : ''}${showSemis} ${Math.abs(showSemis) === 1 ? 'Halbton' : 'Halbtöne'}`, showCapo != null && showCapo !== songCapo() && (shown.capo ? `Capo ${shown.capo}` : 'ohne Capo'), showSimple && 'vereinfacht'].filter(Boolean);
    return h('button', { class: 'sv-shown', 'aria-label': 'Anzeige zurücksetzen', onClick: resetShown }, h('span', null, `Nur Anzeige: ${parts.join(', ')}`), icon('close', 'small'));
  }
  // Griff für einen Akkord anlegen, der noch keinen hat: gilt für alle Stellen im Song mit diesem Namen
  function addMissingGrip(name) {
    openDiagramEditor({ name, instrument: inst(), songId: song.id, onSave: (c) => {
      for (const it of songChordItems(song)) if (it.name === name) linkChord(it, c);
      save();
      render();
    } });
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
    // Tabs werden als Bild gezeichnet: Sie wachsen erst beim Neuzeichnen mit
    let redraw = 0;
    const redrawTabs = () => { if (!tabs.size) return; clearTimeout(redraw); redraw = setTimeout(render, 120); };
    const range = (value, min, max, step, onInput) => {
      const r = h('input', { type: 'range', class: 'slider', min, max, step, value });
      r.addEventListener('input', () => onInput(Number(r.value)));
      return r;
    };
    // Vorschlag: Capo, mit dem der Song gleich klingt und leichter zu greifen ist
    const capoHint = h('div');
    const drawCapoHint = () => {
      const names = allChordNames(song);
      const s = suggestCapo(names, inst(), { songCapo: songCapo(), semis: showSemis, current: showCapo ?? songCapo() });
      fill(capoHint, s && h('button', { class: 'btn block capo-hint', onClick: () => { showCapo = s.capo; capoStepper.set(s.capo); render(); drawCapoHint(); } },
        `Leichter ${s.capo ? `mit Capo ${s.capo}` : 'ohne Capo'}: ${s.easy} von ${names.length} leichte Griffe`));
    };
    const capoStepper = stepper({ value: showCapo ?? songCapo(), min: 0, max: 12, format: (v) => (v ? `${v}. Bund` : 'Ohne'), onChange: (v) => { showCapo = v; render(); drawCapoHint(); } });
    const body = h('div', null,
      h('div', { class: 'form-group' },
        h('div', { class: 'form-row slider-row' }, h('span', { class: 'lbl small-a' }, 'A'),
          range(scale, 0.8, 1.6, 0.05, (v) => { scale = v; main.style.setProperty('--vs', v * deviceScale()); db.setSetting('viewScale', v); redrawTabs(); }), h('span', { class: 'lbl big-a' }, 'A')),
        h('div', { class: 'form-row slider-row' }, h('span', { class: 'lbl' }, icon('grid', 'small')),
          range(cscale, 0.8, 2.2, 0.1, (v) => { cscale = v; main.style.setProperty('--cs', v * deviceScale()); db.setSetting('chordScale', v); }), h('span', { class: 'lbl' }, icon('grid')))),
      h('p', { class: 'form-foot' }, 'Oben: Text und Tabs. Unten: Griffbilder.'),
      h('div', { class: 'form-group' },
        formRow('Akkorde in diesem Song', segmented([{ value: '', label: 'Standard' }, { value: 'inline', label: 'Nebeneinander' }, { value: 'rows', label: 'Untereinander' }], song.chordLayout || '', (v) => {
          if (v) song.chordLayout = v; else delete song.chordLayout;
          save();
          render();
        })),
        formRow('Griffe fixieren', toggle(pinned, (v) => setPinned(v)), 'bleiben beim Scrollen oben'),
        formRow('Abschnitte unten', toggle(jumpOn, (v) => { jumpOn = v; db.setSetting('jumpBar', v); drawJump(); }), 'zum Springen beim Spielen')),
      h('div', { class: 'form-label' }, 'Nur für die Anzeige'),
      h('div', { class: 'form-group' },
        formRow('Tonart', stepper({ value: showSemis, min: -11, max: 11, format: (v) => (v > 0 ? `+${v}` : String(v)) + ' HT', onChange: (v) => { showSemis = v; render(); drawCapoHint(); } })),
        formRow('Capo', capoStepper),
        formRow('Vereinfacht', toggle(showSimple, (v) => { showSimple = v; render(); }), 'Cmaj7 wird C, Am7 wird Am, G/B wird G')),
      capoHint,
      h('p', { class: 'form-foot' }, 'Akkorde und Tabs werden umgerechnet, beim Vereinfachen nur die Akkorde. Der Song bleibt unverändert. Gilt, bis du ihn schließt.'));
    drawCapoHint();
    sheet({ title: 'Darstellung', body, right: { label: 'Fertig', bold: true } });
  }
  function setPinned(v) {
    pinned = v;
    db.setSetting('chordPin', v);
    render();
  }

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
      title, h('div', { class: 'c-only' }, artist),
      h('button', { class: 'meta-row', onClick: openDetails, 'aria-label': 'Details bearbeiten' },
        parts.length ? parts.map((p) => h('span', { class: 'meta-chip c-only' }, p)) : h('span', { class: 'meta-chip add c-only' }, icon('plus', 'small'), 'Capo, Stimmung, Tempo'),
        h('span', { class: 'meta-chip s-only' }, INSTRUMENTS[inst()].label, icon('fold', 'small')),
        song.artist ? h('span', { class: 'meta-chip s-only' }, song.artist) : h('span', { class: 'meta-chip dash s-only' }, '+ Künstler'),
        parts.filter((p) => p !== INSTRUMENTS[inst()].label).map((p) => h('span', { class: 'meta-chip s-only' }, p)),
        !song.capo && h('span', { class: 'meta-chip dash s-only' }, '+ Capo'),
        !song.bpm && h('span', { class: 'meta-chip dash s-only' }, '+ Tempo')),
      notes);
  }

  // Alle Griffe des Songs – auch weitere Varianten mit gleichem Namen, die (noch) in keiner Akkordfolge stehen
  function chordStrip() {
    const list = songChordList(song, inst());
    const items = () => song.sections.flatMap((sec) => sec.blocks.filter((b) => b.type === 'chords').flatMap((b) => b.items));
    const missing = [...new Set(items().filter((it) => isChordName(it.name) && !findChord(it.name, it.chordId, inst())).map((it) => it.name))];
    const card = ({ ch, name, label, used }) => h('button', {
      class: 'chord-card small' + (used ? '' : ' unused'), html: diagramSVG({ ...ch, name: label }), 'aria-label': `Griff ${label} bearbeiten`,
      onClick: () => openDiagramEditor({
        chord: ch, name, instrument: inst(), songId: song.id,
        // Nur Stellen mit genau diesem Griff übernehmen den geänderten Griff
        onSave: (c) => { for (const x of items()) if (findChord(x.name, x.chordId, inst())?.id === ch.id) linkChord(x, c); save(); render(); },
        onDelete: (c) => { for (const x of items()) if (x.chordId === c.id) delete x.chordId; save(); render(); },
      }),
    });
    // Vorhandener Griff übernommen: mitgelieferte und Bibliotheks-Griffe als Song-Griff merken, damit sie oben stehen und zuerst vorgeschlagen werden
    const added = async (c) => {
      if (c.songId !== song.id && !songChordList(song, inst()).some((x) => x.name === c.name && sameGrip(x.ch, c))) {
        const { id, builtin, updatedAt, ...rest } = c;
        await saveUserChord({ ...clone(rest), id: 'u' + uid(), createdAt: now(), songId: song.id });
      }
      render();
    };
    const add = h('button', { class: 'chord-card small add-grip', 'aria-label': 'Griff hinzufügen', onClick: () => openDiagramEditor({ name: '', instrument: inst(), songId: song.id, onSave: added }) },
      icon('plus'), h('span', null, 'Griff'));
    const gap = (name) => h('button', { class: 'chord-missing', 'aria-label': `Griff für ${name} fehlt, jetzt anlegen`, onClick: () => addMissingGrip(name) }, h('b', null, name), h('small', null, 'Griff fehlt'), icon('plus', 'small'));
    return h('div', { class: 'chord-strip-wrap' + (list.length || missing.length ? '' : ' no-grips') }, h('div', { class: 'chord-strip' }, list.map(card), missing.map(gap), add));
  }

  // Neue Abschnitte und Blöcke blenden ein; beim ersten Aufbau bleibt alles ruhig
  const seen = new Set();
  let seenReady = false;
  const fresh = (id) => { if (seen.has(id)) return ''; seen.add(id); return seenReady ? ' enter' : ''; };

  // ---------- Abschnitte ----------
  function sectionEl(sec, i) {
    const folded = collapsed.has(sec.id);
    const filled = sec.blocks.filter((b) => !blockIsEmpty(b, tabs)).length;
    const sorell = isSorell(); // Sorell baut eingeklappte Abschnitte mit auf, damit das Aufklappen sofort und weich geht
    const doc = (!folded || sorell) && h('div', { class: 'sec-doc' }, sec.blocks.map((b, bi) => blockEl(sec, b, bi)));
    const addBtn = (!folded || sorell) && h('button', { class: 'add-block-btn', 'aria-label': `Zu „${sec.name}“ hinzufügen`, onClick: (e) => addMenu(sec, e.currentTarget) }, icon('plus', 'small'), !sec.blocks.length && h('span', null, 'Akkorde, Tab, Notiz …'));
    // Sorell: Der Name steht direkt editierbar im Kopfband
    const nameEdit = sorell && h('input', { class: 'sec-name-input', value: sec.name || '', placeholder: 'Abschnitt', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'Name des Abschnitts' });
    if (nameEdit) {
      nameEdit.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameEdit.blur(); });
      nameEdit.addEventListener('change', () => { const v = nameEdit.value.trim(); if (v && v !== sec.name) { sec.name = v; save(); render(); } else nameEdit.value = sec.name; });
    }
    const beingEdited = sec.blocks.some((b) => b.id === editing?.id);
    return h('section', { class: 'sec' + (folded ? ' collapsed' : '') + fresh(sec.id), 'data-sec': sec.id, 'data-kind': sectionKind(sec.name) || null },
      h('div', { class: 'sec-head' },
        sorell
          ? [h('button', { class: 'sec-foldbtn', 'aria-expanded': String(!folded), 'aria-label': `${sec.name} ein- oder ausklappen`, onClick: () => toggleFold(sec) }, icon('fold', 'small sec-fold')), icon('bars', 'small sec-bars'), nameEdit]
          : h('button', { class: 'sec-name', 'aria-expanded': String(!folded), onClick: () => toggleFold(sec) }, icon('chevron', 'small sec-chev c-only'), icon('bars', 'small sec-bars s-only'), sec.name || 'Abschnitt'),
        (folded || sorell) && h('span', { class: 'sec-count' }, beingEdited ? 'wird bearbeitet' : filled === 1 ? '1 Element' : `${filled} Elemente`),
        h('button', { class: 'icon-btn sec-more', 'aria-label': `Optionen für ${sec.name}`, onClick: () => sectionMenu(sec, i) }, icon('more'))),
      sorell ? h('div', { class: 'sec-body' }, h('div', { class: 'sec-body-in' }, doc, addBtn)) : [doc, addBtn]);
  }

  // Kompaktes Menü direkt am „+“: der neue Block erscheint sofort im Song
  function addMenu(sec, anchor) {
    popMenu(anchor, [
      ...Object.entries(BLOCKS).filter(([type]) => type !== 'strum').map(([type, info]) => ({ label: info.label, icon: info.icon, onClick: () => addBlock(sec, type) })),
      blockClip && { label: 'Kopiertes einfügen', icon: 'paste', onClick: () => pasteBlock(sec) },
    ]);
  }

  // Ein Knopf statt vieler: die Abschnitt-Vorlagen erscheinen erst im Menü.
  // „Wie Chorus“ wiederholt einen vorhandenen Abschnitt samt Akkorden und Tabs – so tippt man nichts doppelt.
  function addSectionMenu(e) {
    const filled = song.sections.filter((s) => s.blocks.some((b) => !blockIsEmpty(b, tabs)));
    const sources = [...new Map(filled.map((s) => [s.name.toLowerCase(), s])).values()].slice(-6);
    popMenu(e.currentTarget, [
      sources.length > 0 && { section: 'Wiederholen' },
      ...sources.map((s) => ({ label: `Wie „${s.name}“`, icon: 'copy', onClick: () => repeatSection(s) })),
      sources.length > 0 && { section: 'Neu' },
      ...SECTION_PRESETS.map((n) => ({ label: n, icon: 'music', onClick: () => addSection(nextName(n)) })),
      { label: 'Eigener Name …', icon: 'rename', onClick: async () => { const n = await ask('Neuer Abschnitt', { placeholder: 'Name, z. B. Zwischenspiel', ok: 'Hinzufügen' }); if (n) addSection(n); } },
    ]);
  }
  function addSectionEl() {
    const label = song.sections.length ? (useInspector() ? 'Abschnitt hinzufügen' : 'Abschnitt') : 'Ersten Abschnitt anlegen';
    return h('div', { class: 'add-section' },
      h('button', { class: 'add-sec-btn glass', onClick: addSectionMenu }, icon('plus', 'small'), label),
      isSorell() && !useInspector() && song.sections.length > 0 && [
        h('button', { class: 'glass-btn add-media', 'aria-label': 'Foto hinzufügen', onClick: () => addPhotoMenu(song.id, () => media.refresh()) }, icon('camera', 'small')),
        h('button', { class: 'glass-btn add-media', 'aria-label': 'Aufnahme hinzufügen', onClick: () => openRecorder(song.id, () => media.refresh()) }, icon('mic', 'small')),
      ]);
  }

  // Neuer, leerer Song: Gerüst mit einem Tipp oder alles als Text schreiben
  function quickStart() {
    const tpl = (label, names, first) => h('button', { class: 'qs-tpl', onClick: () => {
      const secs = names.map((n) => newSection(n));
      song.sections.push(...secs);
      addBlock(secs[0], first);
    } }, label);
    return h('div', { class: 'quick-start' },
      h('div', { class: 'qs-title' }, 'Wie willst du anfangen?'),
      h('div', { class: 'qs-tpls' },
        tpl('Verse · Chorus', ['Verse', 'Chorus'], 'chords'),
        tpl('Intro · Verse · Chorus · Bridge · Outro', ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'], 'chords'),
        tpl('Nur Akkorde', ['Akkorde'], 'chords'),
        tpl('Riff / Tab', ['Riff'], 'tab')),
      h('button', { class: 'qs-text', onClick: () => openImporter({ intoSong: song, onDone: afterImport }) },
        icon('doc'),
        h('span', { class: 'qs-text-body' }, h('b', null, 'Aus Text erstellen'), h('small', null, '„[Verse] Am F C G x2“ wird zu Abschnitten, Akkorden, Anschlag und Tabs.')),
        icon('chevron', 'small')),
      addSectionEl());
  }

  // Strophen werden durchnummeriert (Verse 2, Verse 3 …), andere Abschnitte behalten ihren Namen
  function nextName(name) {
    if (sectionKind(name) !== 'verse') return name;
    const base = name.replace(/\s*\d+$/, '');
    const taken = new Set(song.sections.map((s) => s.name.toLowerCase()));
    if (!taken.has(base.toLowerCase()) && !song.sections.some((s) => s.name.toLowerCase().startsWith(base.toLowerCase() + ' '))) return name;
    let n = 2;
    while (taken.has(`${base} ${n}`.toLowerCase())) n++;
    return `${base} ${n}`;
  }

  async function repeatSection(src) {
    const c = await cloneSectionInto(src);
    // Strophen haben eigenen Text: nur Akkorde, Anschlag und Tabs übernehmen
    if (sectionKind(src.name) === 'verse') c.blocks = c.blocks.filter((b) => b.type !== 'notes');
    c.name = nextName(src.name);
    song.sections.push(c);
    save();
    render();
    toast(`„${c.name}“ wie „${src.name}“ angelegt`);
    requestAnimationFrame(() => main.querySelector(`[data-sec="${c.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
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
    removeAnimated(main, '[data-sec]', main.querySelector(`[data-sec="${sec.id}"]`), (x) => x.dataset.sec, render);
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
  let touchedBlock = null; // zuletzt angetippter Block: sein Menü bleibt nach dem Zurückkommen sichtbar
  function blockEl(sec, b, bi) {
    let content;
    const active = editing?.id === b.id;
    if (b.type === 'chords' && active) {
      content = progressionEditor(b, song, { state: editing, onChange: save, onDone: () => { editing = null; render(); } });
    } else if (b.type === 'chords') content = h('button', { class: 'block-main', 'aria-label': 'Akkordfolge bearbeiten', onClick: () => editBlock(b) }, progressionView(b, inst(), chordLabels(song, inst()), chordLayoutOf(song)));
    else if (b.type === 'strum') content = h('button', { class: 'block-main', 'aria-label': 'Anschlagmuster bearbeiten', onClick: () => editBlock(b) }, strumView(b));
    else if (b.type === 'tab') {
      const t = tabs.get(b.tabId);
      content = h('div', { class: 'block-main', role: 'button', tabindex: '0', onClick: () => editBlock(b), onKeydown: (e) => { if (e.key === 'Enter') editBlock(b); } },
        !t ? h('div', { class: 'empty-hint' }, 'Tippen, um einen Tab anzulegen')
          : isEmptyTab(t) ? h('div', { class: 'empty-hint' }, 'Leerer Tab – tippen zum Bearbeiten')
            : [b.repeat > 1 && h('div', { class: 'tab-rep' }, h('span', { class: 'pl-rep' }, `${b.repeat}× spielen`)), tabView(t, { tuning: song.tuning, colW: 21, rowH: 15, top: 24, fs: 13, fill: isSorell() })]);
    } else {
      const ta = autogrow(h('textarea', { class: 'note-text', rows: 1, value: b.text, placeholder: 'Notiz, Hinweis zum Spielen …', 'aria-label': 'Notiz' }));
      ta.addEventListener('input', () => { b.text = ta.value; save(); });
      content = h('div', { class: 'block-main' }, ta);
    }
    const kind = b.type === 'tab' ? tabs.get(b.tabId)?.name || 'Tab' : b.type === 'chords' && b.name ? b.name : BLOCKS[b.type].label;
    const el = h('div', { class: 'block block-' + b.type + (active ? ' active' : '') + (touchedBlock === b.id ? ' touched' : '') + fresh(b.id), 'data-block': b.id },
      h('div', { class: 'block-head' },
        h('span', { class: 'block-kind' }, icon(BLOCKS[b.type].icon, 'small'), kind),
        h('button', { class: 'block-more', 'aria-label': `${BLOCKS[b.type].label}: Optionen`, onClick: () => blockMenu(sec, b, bi) }, icon('more', 'small'))),
      content);
    // Sorell: Das Menü ist meist ausgeblendet, darum öffnet es auch durch langes Drücken (Notizen brauchen das Drücken zum Markieren)
    if (isSorell() && !active && b.type !== 'notes') longPress(el, () => blockMenu(sec, b, bi));
    return el;
  }

  function editBlock(b, { focus = false } = {}) {
    touchedBlock = b.id;
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
    openTabEditor(t, { tuning: song.tuning, bpm: song.bpm, capo: song.capo, song, onChange: () => { saveTab(t); save(); }, onClose: () => render() });
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
      // Mehrere Akkordfolgen in einem Abschnitt unterscheiden, z. B. „Teil A“, „Übergang“, „Ende“
      b.type === 'chords' && { label: b.name ? 'Umbenennen …' : 'Benennen …', icon: 'rename', onClick: async () => {
        const n = await ask('Akkordfolge benennen', { value: b.name || '', placeholder: 'z. B. Teil A, Übergang, Ende', ok: 'Sichern', message: 'Leer lassen für keinen Namen.' });
        if (n == null) return;
        if (n) b.name = n.slice(0, 60); else delete b.name;
        save(); render();
      } },
      b.type === 'tab' && t && { label: 'Tab umbenennen', icon: 'rename', onClick: async () => { const n = await ask('Tab benennen', { value: t.name, ok: 'Sichern' }); if (n) { t.name = n; saveTab(t); save(); render(); } } },
      b.type === 'tab' && t && { label: `Wiederholen${b.repeat > 1 ? `: ${b.repeat}×` : ''} …`, icon: 'undo', onClick: () => actionSheet('Wie oft wird der Tab gespielt?', [1, 2, 3, 4, 6, 8].map((n) => ({
        label: n === 1 ? 'Einmal' : `${n}×`, icon: (b.repeat || 1) === n ? 'check' : undefined,
        onClick: () => { if (n > 1) b.repeat = n; else delete b.repeat; save(); render(); },
      }))) },
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
    // Nur eine Ebene bewegen: Abschnitte und die Blöcke des betroffenen Abschnitts, sonst würden Blöcke doppelt verschoben
    removeAnimated(main, `[data-sec], [data-sec="${sec.id}"] [data-block]`, main.querySelector(`[data-block="${b.id}"]`), (x) => x.dataset.block || 's' + x.dataset.sec, render);
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
    favBtn.classList.remove('hop');
    void favBtn.offsetWidth;
    favBtn.classList.add('hop');
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

  // Menü oben rechts – beim Ansehen nur, was man zum Spielen braucht, beim Bearbeiten nur Bearbeiten.
  function moreMenu() {
    const transpose = { label: 'Transponieren & Vereinfachen …', icon: 'music', onClick: () => openTransposer(song, render, {
      tabs,
      before: () => { record(); tabUndo.set(last, JSON.stringify([...tabs].map(([id, t]) => [id, t.measures]))); },
    }) };
    // Musiktheorie mit Tonart, Instrument und Stimmung des Songs; Akkordfolgen lassen sich als neuer Abschnitt übernehmen
    const theory = { label: 'Tonart & Musiktheorie …', icon: 'key', onClick: () => openTheory({ song, onAdd: (names) => {
      const sec = newSection('Idee');
      sec.blocks.push(newBlock('chords', { items: names.map((n) => newChordItem(n)) }));
      song.sections.push(sec);
      save();
      render();
    } }) };
    if (mode === 'view') {
      actionSheet(song.title, [
        { label: 'Bearbeiten', icon: 'pencil', onClick: () => setMode('edit') },
        { section: 'Beim Spielen' },
        { label: 'Darstellung & Tonart …', icon: 'text', onClick: displaySheet },
        { label: 'Metronom', icon: 'clock', onClick: () => { closePlayer(); openMetronome({ host: view, bpm: song.bpm, timeSig: song.timeSig }); } },
        { label: wantWake ? 'Display darf ausgehen' : 'Display anlassen', icon: 'sun', onClick: async () => { await setWake(!wantWake); if (wantWake) toast('Das Display bleibt an, solange der Song geöffnet ist.'); } },
        { label: 'Stimmgerät', icon: 'fork', onClick: tuner },
        transpose,
        theory,
        { section: ' ' },
        { label: song.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten', icon: 'star', onClick: toggleFavorite },
        { label: 'Teilen …', icon: 'share', onClick: shareMenu },
      ]);
      return;
    }
    actionSheet(song.title, [
      { label: 'Details: Capo, Stimmung, Tempo …', icon: 'info', onClick: openDetails },
      song.sections.length > 1 && { label: 'Abschnitte ordnen', icon: 'sort', onClick: openReorder },
      transpose,
      theory,
      { section: 'Ergänzen' },
      { label: 'Foto', icon: 'photo', onClick: () => addPhotoMenu(song.id, () => media.refresh()) },
      { label: 'Audio aufnehmen', icon: 'mic', onClick: () => openRecorder(song.id, () => media.refresh()) },
      { label: 'Aus Text, Foto oder KI-Idee …', icon: 'magic', onClick: importMenu },
      { section: 'KI' },
      { label: 'Mit KI überarbeiten …', icon: 'magic', onClick: async () => { await db.flush(); openAiEdit(song.id, { onDone: () => window.dispatchEvent(new HashChangeEvent('hashchange')) }); } },
      { section: ' ' },
      { label: 'Song löschen', icon: 'trash', destructive: true, onClick: async () => {
        await trashWithUndo([song], () => window.dispatchEvent(new HashChangeEvent('hashchange')));
        goHome();
      } },
    ]);
  }
  function shareMenu() {
    actionSheet('Teilen', [
      { label: 'Als Text oder ChordPro', icon: 'note', onClick: () => openTextShare([song]) },
      { label: 'Als PDF', icon: 'doc', onClick: exportPdf },
      { label: 'Als Datei (für Sorell)', icon: 'download', onClick: async () => { await db.flush(); const f = await exportSongsFile([song]); offerFile(f.blob, f.filename, { title: 'Song-Datei' }); } },
      { label: 'An anderes Gerät (Sync)', icon: 'sync', onClick: async () => { await db.flush(); openSync({ songs: [song], onDone: () => window.dispatchEvent(new HashChangeEvent('hashchange')) }); } },
    ]);
  }
  function importMenu() {
    actionSheet('Zu diesem Song hinzufügen', [
      { label: 'Aus Text oder Datei', icon: 'doc', onClick: () => openImporter({ intoSong: song, onDone: afterImport }) },
      { label: 'Aus Foto oder Video', icon: 'camera', onClick: () => openImporter({ intoSong: song, mode: 'media', onDone: afterImport }) },
      { label: 'KI-Idee', icon: 'magic', onClick: () => openImporter({ intoSong: song, mode: 'ai', onDone: afterImport }) },
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
  const rememberPos = () => { if (!setlist && mode === 'view') storePos(song.id, view.scrollTop); };
  const onHide = () => { if (document.visibilityState === 'hidden') rememberPos(); };
  document.addEventListener('visibilitychange', onHide);
  mount(view, 'push', () => { wideEdit.removeEventListener?.('change', onWideEdit); rememberPos(); closePlayer(); closeMetronome(); status.dispose(); media.dispose(); setWake(false); offTouch(); clearTimeout(recordTimer); document.removeEventListener('visibilitychange', onVisible); document.removeEventListener('visibilitychange', onHide); });
  // Dort weiterlesen, wo man aufgehört hat. In einer Setlist beginnt jeder Song oben.
  const savedY = !setlist && mode === 'view' ? readPos()[song.id] : 0;
  if (savedY) requestAnimationFrame(() => requestAnimationFrame(() => { view.scrollTop = savedY; markJump(); }));
  if (!song.sections.length && song.title === 'Neuer Song' && !setlist) main.querySelector('.song-title')?.select();
  if (setlist) { view.classList.add('in-setlist'); setWake(true); }
}
