// Tab-Editor: eigene Tastenleiste (keine iPhone-Tastatur), Cursor, Auswahl, Techniken, Takte, Undo/Redo.
import { h, sheet, icon, toast, ask, actionSheet, popMenu, confirmDialog, clone, saveIndicator, haptic, helpHint, isSorell } from './ui.js';
import { MAX_FRET, newMeasure, tabStrings, flatCols, tabSVG, tabLayout, stringLabels, describeNote, noteText, isEmptyTab, tabToText, autoRhythm, strumAt, colUsed } from './tabs.js';
import { uid } from './songs.js';
import { findChord, isChordName, songChordList, commonNames, openChordLibrary } from './chords.js';
import { parseTabText } from './importer.js';
import { playTab, playSpeed } from './tabplayer.js';
import { strokeSVG } from './strumming.js';

const CLIP_KEY = 'gn-tab-clipboard';
let clip = null;
try { clip = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); } catch { clip = null; }
const storeClip = () => { try { localStorage.setItem(CLIP_KEY, JSON.stringify(clip)); } catch { /* ignorieren */ } };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// „Auto →“: nach jeder Note springt der Cursor eine Position weiter (bei 1 und 2 kurz warten, falls eine zweite Ziffer folgt)
const AUTO_KEY = 'gn-tab-auto';
let auto = true;
try { auto = localStorage.getItem(AUTO_KEY) !== 'off'; } catch { /* Standard: an */ }
const OPTS_FULL = { colW: 34, rowH: 28, top: 36, gap: 12, labelW: 24, fs: 17, bottom: 12 };
const OPTS_COMPACT = { colW: 32, rowH: 23, top: 32, gap: 10, labelW: 22, fs: 15, bottom: 10 };

// song: Griffe des Songs stehen in der Akkordleiste vorn
export function openTabEditor(tab, { tuning, bpm, capo, song = null, onChange, onClose } = {}) {
  let cur = { g: 0, s: 0 }, selOn = false, anchor = null, last = null, advT = null;
  // strumChord: zuletzt gewählter Akkord (in der Leiste markiert); placed: Position, an die er gerade eingefügt wurde
  let strumChord = null, placed = null;
  const cancelAdv = () => { clearTimeout(advT); advT = null; };
  const undo = [], redo = [];
  const N = tabStrings(tab), LAST = N - 1; // 6 Saiten (Gitarre) oder 4 (Ukulele)
  const inst = N === 4 ? 'ukulele' : 'guitar';
  const labels = stringLabels(tuning, N);
  const OPTS = window.innerHeight < 700 ? OPTS_COMPACT : OPTS_FULL;

  const flat = () => flatCols(tab);
  const loc = (g) => { const [mi, c] = flat()[g]; return { m: tab.measures[mi], mi, c }; };
  const getNote = (g, s) => { const { m, c } = loc(g); return m.notes[s][c]; };
  // Wird eine Position leer, verschwindet dort auch der Akkordname (ein Anschlag bleibt – er gilt dann dem vorigen Akkord)
  const setNote = (g, s, n) => {
    const { m, c } = loc(g);
    m.notes[s][c] = n;
    if (!n && !m.notes.some((row) => noteText(row[c]))) setCol(m, 'ch', c, '');
  };
  // Optionale Spalten-Angaben (st, ch) setzen und ganz entfernen, wenn nichts mehr drinsteht
  function setCol(m, key, c, v) {
    if (!m[key]) { if (!v) return; m[key] = Array(m.cols).fill(key === 'ch' ? '' : 0); }
    m[key][c] = v;
    if (!m[key].some(Boolean)) delete m[key];
  }
  const ensureCols = (n) => { while (flat().length < n) tab.measures.push(newMeasure(tab.measures[tab.measures.length - 1].cols, N)); };

  function mutate(fn) {
    const before = JSON.stringify(tab.measures);
    if (fn() === false) return;
    if (JSON.stringify(tab.measures) === before) { draw(); return; }
    undo.push(before);
    if (undo.length > 200) undo.shift();
    redo.length = 0;
    onChange();
    draw();
  }
  function restore(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(tab.measures));
    tab.measures = JSON.parse(from.pop());
    last = null;
    onChange();
    draw();
  }

  const selRect = () => (selOn && anchor
    ? { g1: Math.min(anchor.g, cur.g), g2: Math.max(anchor.g, cur.g), s1: Math.min(anchor.s, cur.s), s2: Math.max(anchor.s, cur.s) }
    : { g1: cur.g, g2: cur.g, s1: cur.s, s2: cur.s });
  const selNotes = () => {
    const r = selRect(), out = [];
    for (let g = r.g1; g <= r.g2; g++) for (let s = r.s1; s <= r.s2; s++) { const n = getNote(g, s); if (noteText(n)) out.push(n); }
    return out;
  };

  // ---------- Darstellung ----------
  const scroll = h('div', { class: 'tab-scroll editing' });
  // Saitennamen bleiben beim horizontalen Scrollen sichtbar
  const labelCol = h('div', { class: 'tab-labels', 'aria-hidden': 'true' },
    labels.map((l, i) => h('span', { style: `top:${6 + OPTS.top + i * OPTS.rowH}px` }, l)));
  const wrap = h('div', { class: 'tab-wrap' }, scroll, labelCol);
  let labelTop = OPTS.top;
  const edgeFade = () => scroll.classList.toggle('more', scroll.scrollLeft + scroll.clientWidth < scroll.scrollWidth - 4);
  scroll.addEventListener('scroll', () => { wrap.classList.toggle('scrolled', scroll.scrollLeft > 8); edgeFade(); }, { passive: true });
  const info = h('div', { class: 'tab-info' });

  function draw() {
    cur.g = clamp(cur.g, 0, flat().length - 1);
    scroll.innerHTML = tabSVG(tab, { ...OPTS, tuning, cursor: cur, sel: selOn ? selRect() : null });
    // Über dem Tab stehen ggf. Akkordnamen und Pfeile – die Saitennamen rücken mit
    const L0 = tabLayout(tab, OPTS);
    if (L0.top !== labelTop) { labelTop = L0.top; [...labelCol.children].forEach((el, i) => { el.style.top = `${6 + labelTop + i * OPTS.rowH}px`; }); }
    const { mi, c } = loc(cur.g);
    const n = getNote(cur.g, cur.s);
    info.replaceChildren(
      h('span', null, `Takt ${mi + 1} · Pos. ${c + 1} · Saite ${labels[cur.s]}`),
      h('span', { class: 'tab-info-note' }, noteText(n) ? describeNote(n) : selOn ? 'Auswahl: Pfeile oder Tippen erweitern' : ''));
    autoBtn.classList.toggle('on', auto);
    autoBtn.textContent = auto ? 'Auto → an' : 'Auto → aus';
    undoBtn.disabled = !undo.length;
    redoBtn.disabled = !redo.length;
    selKey.classList.toggle('on', selOn);
    selBar.classList.toggle('hidden', !selOn);
    pasteKey.disabled = !clip;
    const notes = selNotes(), first = notes[0];
    const dNow = loc(cur.g).m.dur?.[loc(cur.g).c] || 0;
    rhythmKey.replaceChildren(h('span', { class: 'rk-note' }, '♪'), h('span', null, dNow ? `1/${dNow}` : 'Rhythmus'));
    rhythmKey.classList.toggle('on', dNow > 0);
    const stNow = strumAt(loc(cur.g).m, loc(cur.g).c);
    strumDown.classList.toggle('on', stNow === 'd');
    strumUp.classList.toggle('on', stNow === 'u');
    for (const b of chordRow.querySelectorAll('[data-chord]')) b.classList.toggle('on', b.dataset.chord === strumChord?.name);
    for (const [k, b] of Object.entries(techBtns)) {
      let on = false;
      if (k === 'pm') on = loc(cur.g).m.pm[loc(cur.g).c];
      else if (k === 'lr') on = !!loc(cur.g).m.lr?.[loc(cur.g).c];
      else if (k === 'x') on = !!first?.x;
      else if (first) on = k === 'b' ? !!first.b : k === 'v' ? !!first.v : first.l === k;
      b.classList.toggle('on', !!on);
    }
    const L = tabLayout(tab, OPTS);
    const x = L.colX[cur.g], w = scroll.clientWidth;
    if (w) {
      if (x - 50 < scroll.scrollLeft) scroll.scrollLeft = Math.max(0, x - 70);
      else if (x + 50 > scroll.scrollLeft + w) scroll.scrollLeft = x - w + 70;
    }
    edgeFade();
  }

  // Position (Spalte g, Saite s) unter einem Punkt auf dem Bildschirm
  function cellAt(clientX, clientY) {
    const svg = scroll.querySelector('svg');
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    const L = tabLayout(tab, OPTS);
    let best = 0, bd = Infinity;
    L.colX.forEach((cx, g) => { const d = Math.abs(cx - x); if (d < bd) { bd = d; best = g; } });
    // rechts hinter dem letzten Takt: neue Positionen anbieten
    if (x > L.end) best = flat().length - 1 + Math.max(1, Math.round((x - L.end) / L.colW));
    return { g: Math.max(0, best), s: clamp(Math.round((y - L.top) / L.rowH), 0, LAST) };
  }

  let dragged = false;
  scroll.addEventListener('click', (e) => {
    if (dragged) { dragged = false; return; }
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    cur = { g: Math.min(c.g, flat().length - 1), s: c.s };
    last = null;
    placed = null;
    cancelAdv();
    draw();
  });

  // Noten frei verschieben: Note (oder die Auswahl) gedrückt halten und an die richtige Stelle ziehen.
  // Mit dem Finger nach kurzem Halten (sonst scrollt man den Tab), mit der Maus sofort.
  let drag = null;
  const dragRect = () => drag.block ? drag.block : { g1: drag.from.g, g2: drag.from.g, s1: drag.from.s, s2: drag.from.s };
  function startDrag() {
    if (!drag) return;
    drag.on = true;
    haptic();
    scroll.classList.add('dragging');
    preview(drag.from);
  }
  // Vorschau: Tab mit der verschobenen Note bzw. Auswahl, ohne schon etwas zu ändern
  function preview(to) {
    const r = dragRect(), dg = to.g - drag.from.g, ds = clamp(to.s - drag.from.s, -r.s1, LAST - r.s2);
    const dgc = Math.max(dg, -r.g1);
    drag.delta = { dg: dgc, ds };
    const t = clone(tab);
    while (flatCols(t).length < r.g2 + dgc + 1) t.measures.push(newMeasure(t.measures[t.measures.length - 1].cols, N));
    const fl = flatCols(t);
    const at = (g) => { const [mi, c] = fl[g]; return [t.measures[mi], c]; };
    const buf = [];
    for (let g = r.g1; g <= r.g2; g++) for (let s = r.s1; s <= r.s2; s++) { const [m, c] = at(g); buf.push([g, s, m.notes[s][c]]); m.notes[s][c] = null; }
    buf.forEach(([g, s, n]) => { const [m, c] = at(g + dgc); m.notes[s + ds][c] = n; });
    const sel = { g1: r.g1 + dgc, g2: r.g2 + dgc, s1: r.s1 + ds, s2: r.s2 + ds };
    scroll.innerHTML = tabSVG(t, { ...OPTS, tuning, sel });
    info.firstChild.textContent = 'Loslassen zum Ablegen';
  }
  function endDrag(commit) {
    clearTimeout(drag?.timer);
    const d = drag;
    drag = null;
    scroll.classList.remove('dragging');
    if (!d?.on) return;
    dragged = true;
    setTimeout(() => { dragged = false; }, 400);
    const { dg, ds } = d.delta || { dg: 0, ds: 0 };
    if (!commit || (!dg && !ds)) { draw(); return; }
    if (d.block) { selOn = true; shiftSel(dg, ds); return; }
    // Einzelne Note: liegt am Ziel schon eine, tauschen beide den Platz
    const to = { g: d.from.g + dg, s: d.from.s + ds };
    mutate(() => {
      ensureCols(to.g + 1);
      const a = getNote(d.from.g, d.from.s), b = getNote(to.g, to.s);
      setNote(to.g, to.s, a);
      setNote(d.from.g, d.from.s, b);
      const src = loc(d.from.g), dst = loc(to.g);
      const v = src.m.dur?.[src.c];
      if (v && to.g !== d.from.g && !src.m.notes.some((row) => noteText(row[src.c])) && !dst.m.dur?.[dst.c]) {
        if (!dst.m.dur) dst.m.dur = Array(dst.m.cols).fill(0);
        dst.m.dur[dst.c] = v;
        src.m.dur[src.c] = 0;
      }
    });
    cur = to;
    haptic();
    draw();
  }
  scroll.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c || c.g >= flat().length) return;
    const r = selRect();
    const inSel = selOn && c.g >= r.g1 && c.g <= r.g2 && c.s >= r.s1 && c.s <= r.s2;
    if (!inSel && !noteText(getNote(c.g, c.s))) return;
    drag = { from: c, block: inSel ? r : null, x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse', on: false };
    if (!drag.mouse) drag.timer = setTimeout(startDrag, 260);
  });
  scroll.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.on) {
      if (drag.mouse && moved > 5) startDrag();
      else if (!drag.mouse && moved > 8) { clearTimeout(drag.timer); drag = null; } // war ein Scrollen
      return;
    }
    // am Rand weiterscrollen
    const b = scroll.getBoundingClientRect();
    if (e.clientX > b.right - 30) scroll.scrollLeft += 10; else if (e.clientX < b.left + 30) scroll.scrollLeft -= 10;
    const c = cellAt(e.clientX, e.clientY);
    if (c) preview(c);
  });
  scroll.addEventListener('pointerup', () => endDrag(true));
  scroll.addEventListener('pointercancel', () => endDrag(false));
  // Während des Ziehens nicht scrollen
  scroll.addEventListener('touchmove', (e) => { if (drag?.on) e.preventDefault(); }, { passive: false });

  // ---------- Aktionen ----------
  function digit(d) {
    cancelAdv();
    mutate(() => {
      const t = Date.now();
      const n = getNote(cur.g, cur.s);
      let f = d;
      if (last && last.g === cur.g && last.s === cur.s && t - last.t < 1300 && n && !n.x && n.f != null && n.f < 10 && n.f * 10 + d <= MAX_FRET) f = n.f * 10 + d;
      const nn = { f };
      if (n && !n.x) { if (n.l) nn.l = n.l; if (n.b) nn.b = n.b; if (n.v) nn.v = true; }
      setNote(cur.g, cur.s, nn);
      last = f >= 10 ? null : { g: cur.g, s: cur.s, t };
    });
    if (!auto || selOn) return;
    const f = getNote(cur.g, cur.s)?.f;
    if (f == null || f === 0 || f >= 3) { last = null; move(1, 0); }
    else { const at = { ...cur }; advT = setTimeout(() => { if (cur.g === at.g && cur.s === at.s) { last = null; move(1, 0); } }, 900); }
  }

  function clearRect(r) {
    for (let g = r.g1; g <= r.g2; g++) {
      for (let s = r.s1; s <= r.s2; s++) setNote(g, s, null);
      const { m, c } = loc(g);
      setCol(m, 'st', c, 0);
    }
  }

  function del() {
    if (selOn) { mutate(() => clearRect(selRect())); return; }
    const { m, c } = loc(cur.g);
    if (noteText(getNote(cur.g, cur.s))) mutate(() => setNote(cur.g, cur.s, null));
    else if (strumAt(m, c)) mutate(() => setCol(m, 'st', c, 0));
    else move(-1, 0);
  }

  function move(dg, ds) {
    cancelAdv();
    placed = null;
    if (dg > 0 && cur.g + dg >= flat().length && !selOn) {
      mutate(() => ensureCols(cur.g + dg + 1));
    }
    cur = { g: clamp(cur.g + dg, 0, flat().length - 1), s: clamp(cur.s + ds, 0, LAST) };
    last = null;
    draw();
  }

  // Nach einer Note springt der Cursor weiter. Eine Technik gilt dann für die letzte Note auf dieser Saite –
  // egal, wie schnell man tippt.
  function techNotes() {
    const notes = selNotes();
    if (notes.length || selOn) return notes;
    for (let g = cur.g - 1; g >= 0; g--) { const n = getNote(g, cur.s); if (noteText(n)) return [n]; }
    return [];
  }

  function technique(kind) {
    // Palm Mute und Let Ring gelten für Positionen (alle Saiten), mit Auswahl für eine ganze Strecke
    if (kind === 'pm' || kind === 'lr') {
      const r = selRect();
      mutate(() => {
        const on = !loc(r.g1).m[kind]?.[loc(r.g1).c];
        for (let g = r.g1; g <= r.g2; g++) {
          const { m, c } = loc(g);
          if (!m[kind]) m[kind] = Array(m.cols).fill(false);
          m[kind][c] = on;
        }
        tab.measures.forEach((m) => { if (kind === 'lr' && m.lr && !m.lr.some(Boolean)) delete m.lr; });
      });
      return;
    }
    if (kind === 'x') {
      mutate(() => {
        const r = selRect();
        const n0 = getNote(r.g1, r.s1);
        const on = !n0?.x;
        for (let g = r.g1; g <= r.g2; g++) for (let s = r.s1; s <= r.s2; s++) {
          if (selOn && !noteText(getNote(g, s))) continue;
          setNote(g, s, on ? { f: null, x: true } : null);
        }
      });
      return;
    }
    const notes = techNotes();
    if (!notes.length) { toast('Gib zuerst eine Bundzahl ein.'); return; }
    mutate(() => {
      const first = notes[0];
      if (kind === 'b') {
        const steps = [0, 0.5, 1, 1.5, 2];
        const next = steps[(steps.indexOf(first.b || 0) + 1) % steps.length];
        notes.forEach((n) => { if (next) n.b = next; else delete n.b; });
      } else if (kind === 'v') {
        const on = !first.v;
        notes.forEach((n) => { if (on) n.v = true; else delete n.v; });
      } else {
        const on = first.l !== kind;
        notes.forEach((n) => { if (on) n.l = kind; else delete n.l; });
      }
    });
  }

  function copy(silent) {
    const r = selOn ? selRect() : { g1: cur.g, g2: cur.g, s1: 0, s2: LAST };
    clip = { w: r.g2 - r.g1 + 1, hgt: r.s2 - r.s1 + 1, s1: r.s1, cells: [], pm: [], st: [], ch: [] };
    for (let i = 0; i < clip.w; i++) {
      const col = [];
      for (let j = 0; j < clip.hgt; j++) { const n = getNote(r.g1 + i, r.s1 + j); col.push(n ? clone(n) : null); }
      clip.cells.push(col);
      const { m, c } = loc(r.g1 + i);
      clip.pm.push(!!m.pm[c]);
      clip.st.push(m.st?.[c] || 0);
      clip.ch.push(m.ch?.[c] || '');
    }
    storeClip();
    if (!silent) toast(clip.w === 1 && clip.hgt === N ? 'Spalte kopiert' : `${clip.w} × ${clip.hgt} kopiert`);
    draw();
  }

  function paste() {
    if (!clip) return;
    // Eingefügt wird ab der Cursorspalte auf denselben Saiten, von denen kopiert wurde.
    // Ganze Spalten (alle Saiten) passen auch zwischen Gitarre und Ukulele: überzählige Saiten entfallen.
    const full = clip.s1 === 0 && (clip.hgt === 6 || clip.hgt === 4);
    const s0 = clip.s1 ?? (full ? 0 : cur.s);
    mutate(() => {
      ensureCols(cur.g + clip.w);
      for (let i = 0; i < clip.w; i++) {
        for (let j = 0; j < clip.hgt; j++) { if (s0 + j <= LAST) setNote(cur.g + i, s0 + j, clip.cells[i][j] ? clone(clip.cells[i][j]) : null); }
        if (full) { const { m, c } = loc(cur.g + i); m.pm[c] = !!clip.pm[i]; setCol(m, 'st', c, clip.st?.[i] || 0); setCol(m, 'ch', c, clip.ch?.[i] || ''); }
      }
    });
    toast('Eingefügt');
  }

  function shiftSel(dg, ds) {
    const r = selRect();
    if (r.g1 + dg < 0 || r.s1 + ds < 0 || r.s2 + ds > LAST) return;
    mutate(() => {
      ensureCols(r.g2 + dg + 1);
      const buf = [];
      for (let g = r.g1; g <= r.g2; g++) for (let s = r.s1; s <= r.s2; s++) buf.push([g, s, getNote(g, s)]);
      clearRect(r);
      buf.forEach(([g, s, n]) => setNote(g + dg, s + ds, n));
    });
    if (anchor) anchor = { g: anchor.g + dg, s: anchor.s + ds };
    cur = { g: cur.g + dg, s: cur.s + ds };
    draw();
  }

  function transpose(d) {
    const notes = selNotes().filter((n) => n.f != null);
    if (!notes.length) return;
    if (notes.some((n) => n.f + d < 0 || n.f + d > MAX_FRET)) { toast('Bundgrenze erreicht'); return; }
    mutate(() => notes.forEach((n) => { n.f += d; }));
  }

  function toggleSel() {
    selOn = !selOn;
    anchor = selOn ? { ...cur } : null;
    draw();
  }

  function addMeasureAfter() {
    const { mi, m } = loc(cur.g);
    mutate(() => tab.measures.splice(mi + 1, 0, newMeasure(m.cols, N)));
    cur.g = flat().findIndex(([x]) => x === mi + 1);
    draw();
  }

  // Griff eines Akkords als eine Spalte (alle Saiten gleichzeitig), mit Akkordname darüber
  function fillChord(g, ch, name, st = 0) {
    ensureCols(g + 1);
    for (let s = 0; s < N; s++) { const f = ch.frets[N - 1 - s]; setNote(g, s, f >= 0 ? { f } : null); }
    const { m, c } = loc(g);
    setCol(m, 'ch', c, name);
    setCol(m, 'st', c, st);
  }
  // Akkord aus der Leiste: an den Cursor setzen; ein weiterer Akkord kommt dann eine Position weiter
  function placeChord(ch, name = ch.name) {
    if (!ch?.frets || ch.frets.length !== N) { toast(`Kein Griff für „${name}“ gefunden`); return; }
    if (placed && placed.g === cur.g && !selOn) move(1, 0);
    strumChord = { ch, name };
    mutate(() => fillChord(cur.g, ch, name));
    placed = { g: cur.g };
    haptic();
    draw();
  }
  async function chordColumn() {
    const name = await ask('Akkord als Spalte', { placeholder: 'z. B. Am, G, D7', ok: 'Einfügen', autocapitalize: 'characters' });
    if (!name) return;
    const n = name.trim().replace(/^./, (x) => x.toUpperCase());
    const ch = isChordName(n) && findChord(n, null, inst);
    if (!ch) { toast(`Kein Griff für „${n}“ gefunden`); return; }
    placeChord(ch, n);
  }

  // Anschlag ↓/↑ an der Position (erneut tippen entfernt ihn). Auf einer leeren Position steht nur der Pfeil –
  // er schlägt den Akkord davor erneut an, der Griff muss nicht mehrmals im Tab stehen. Danach eine Position weiter:
  // G antippen, dann ↓ ↓ ↑ ↑ ↓ ↑.
  function strum(dir) {
    cancelAdv();
    if (selOn) {
      const r = selRect();
      mutate(() => {
        const on = strumAt(loc(r.g1).m, loc(r.g1).c) !== dir;
        for (let g = r.g1; g <= r.g2; g++) { const { m, c } = loc(g); setCol(m, 'st', c, on ? dir : 0); }
      });
      return;
    }
    const { m, c } = loc(cur.g);
    mutate(() => setCol(m, 'st', c, strumAt(m, c) === dir ? 0 : dir));
    placed = null;
    haptic();
    if (auto) move(1, 0);
  }

  // Ganzen Tab als Text: ASCII bearbeiten oder einen Tab aus dem Internet einfügen
  function textEdit() {
    const ta = h('textarea', { class: 'field mono tab-text', rows: N + 2, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', value: isEmptyTab(tab) ? '' : tabToText(tab, tuning, { perBlock: 2 }),
      placeholder: N === 4 ? 'A|-----0---|\nE|---1-----|\nC|-0-------|\nG|---------|' : 'e|-----0---|\nB|---1-----|\nG|-0-------|\nD|---------|\nA|---------|\nE|---------|' });
    const body = h('div', null, ta,
      h('p', { class: 'form-foot' }, `Eine Zeile je Saite (${labels.join(' ')} von oben), Taktstriche mit |. Techniken: h p / \\ b ~ x. Mehrere Zeilen-Blöcke untereinander werden aneinandergehängt.`));
    const sh = sheet({ title: 'Tab als Text', body, full: true, left: { label: 'Abbrechen' }, right: { label: 'Übernehmen', bold: true, onClick: () => {
      const measures = parseTabText(ta.value, N);
      if (!measures.length) { toast(`Kein Tab erkannt – ${N} Zeilen wie „${labels[0]}|--0--|“ nötig.`); return; }
      mutate(() => {
        measures.forEach((m, i) => { const o = tab.measures[i]; if (o?.cols === m.cols) for (const k of ['dur', 'st', 'ch']) if (o[k]) m[k] = o[k].slice(); });
        tab.measures = measures;
      });
      cur = { g: 0, s: 0 };
      sh.close();
      toast(`${measures.length} ${measures.length === 1 ? 'Takt' : 'Takte'} übernommen`);
    } } });
    setTimeout(() => { ta.focus(); ta.setSelectionRange(0, 0); ta.scrollLeft = 0; ta.scrollTop = 0; }, 350);
  }

  // Löscht den Takt am Cursor (ist es der einzige, wird er geleert). Mit Noten vorher nachfragen.
  async function deleteMeasure() {
    const { mi, m } = loc(cur.g);
    const measureEmpty = m.notes.every((row) => row.every((n) => !noteText(n)));
    if (!measureEmpty && !(await confirmDialog(tab.measures.length > 1 ? 'Takt löschen?' : 'Takt leeren?', `Takt ${mi + 1} enthält Noten. Du kannst das mit „Rückgängig“ widerrufen.`, { ok: 'Löschen', destructive: true }))) return;
    mutate(() => { if (tab.measures.length > 1) tab.measures.splice(mi, 1); else tab.measures[0] = newMeasure(m.cols, N); });
  }

  async function more() {
    const { mi, m, c } = loc(cur.g);
    actionSheet(`Takt ${mi + 1}`, [
      { label: 'Takt danach einfügen', icon: 'plus', onClick: addMeasureAfter },
      { label: 'Takt duplizieren', icon: 'copy', onClick: () => { mutate(() => { const d = clone(m); d.id = uid(); tab.measures.splice(mi + 1, 0, d); }); } },
      { label: 'Akkord als Spalte …', icon: 'grid', onClick: chordColumn },
      { label: 'Als Text bearbeiten oder einfügen …', icon: 'paste', onClick: textEdit },
      { section: 'Position' },
      { label: 'Spalte hier einfügen', icon: 'right', onClick: () => mutate(() => { m.notes.forEach((row) => row.splice(c, 0, null)); m.pm.splice(c, 0, false); m.dur?.splice(c, 0, 0); m.lr?.splice(c, 0, false); m.st?.splice(c, 0, 0); m.ch?.splice(c, 0, ''); m.cols++; }) },
      { label: 'Spalte hier löschen', icon: 'close', disabled: m.cols <= 1, onClick: () => mutate(() => { m.notes.forEach((row) => row.splice(c, 1)); m.pm.splice(c, 1); m.dur?.splice(c, 1); m.lr?.splice(c, 1); m.st?.splice(c, 1); m.ch?.splice(c, 1); m.cols--; }) },
      { label: 'Rhythmus für den ganzen Tab automatisch', icon: 'music', onClick: () => { mutate(() => tab.measures.forEach((x) => { x.dur = autoRhythm(x); })); toast('Notenwerte aus den Abständen gesetzt – einzeln änderbar.'); } },
      { label: 'Rhythmus im ganzen Tab entfernen', icon: 'close', onClick: () => mutate(() => tab.measures.forEach((x) => { delete x.dur; })) },
      { label: `Taktlänge ändern (${m.cols} Positionen)`, icon: 'clock', onClick: () => resizeMeasure(m) },
      { section: ' ' },
      { label: 'Tab umbenennen', icon: 'rename', onClick: rename },
      { label: tab.measures.length > 1 ? 'Takt löschen' : 'Takt leeren', icon: 'trash', destructive: true, onClick: deleteMeasure },
    ]);
  }

  async function resizeMeasure(m) {
    const n = await actionSheet('Positionen pro Takt', [4, 6, 8, 12, 16, 24].map((v) => ({ label: `${v}${v === m.cols ? ' ✓' : ''}`, value: v })));
    if (!n || n === m.cols) return;
    mutate(() => {
      if (n < m.cols) { m.notes.forEach((row) => row.splice(n)); m.pm.splice(n); m.dur?.splice(n); m.lr?.splice(n); m.st?.splice(n); m.ch?.splice(n); }
      else { m.notes.forEach((row) => row.push(...Array(n - m.cols).fill(null))); m.pm.push(...Array(n - m.cols).fill(false)); m.dur?.push(...Array(n - m.cols).fill(0)); m.lr?.push(...Array(n - m.cols).fill(false)); m.st?.push(...Array(n - m.cols).fill(0)); m.ch?.push(...Array(n - m.cols).fill('')); }
      m.cols = n;
    });
  }

  async function rename() {
    const name = await ask('Tab benennen', { value: tab.name, placeholder: 'z. B. Intro-Riff', ok: 'Sichern' });
    if (name == null) return;
    tab.name = name || 'Tab';
    s.setTitle(tab.name);
    onChange();
  }

  // ---------- Tastenleiste ----------
  // Sorell: unter dem Symbol der Name (am Handy kürzer), am PC oben rechts die Taste, die hier wirklich funktioniert
  const key = (label, fn, cls = '', aria, kbd, long, short) => h('button', { class: 'key ' + cls, 'aria-label': aria || null, onClick: fn }, label,
    long && h('span', { class: 'k-long s-only' }, long), (short || long) && h('span', { class: 'k-short s-only' }, short || long), kbd && h('kbd', { class: 'k-kbd s-only' }, kbd));
  const techBtns = {
    h: key('h', () => technique('h'), 'tech', 'Hammer-on', 'H', 'Hammer'),
    p: key('p', () => technique('p'), 'tech', 'Pull-off', 'P', 'Pull-off', 'Pull'),
    '/': key('/', () => technique('/'), 'tech', 'Slide aufwärts', '/', 'Slide ↑'),
    '\\': key('\\', () => technique('\\'), 'tech', 'Slide abwärts', '\\', 'Slide ↓'),
    b: key('b', () => technique('b'), 'tech', 'Bend (½ / voll / 1½ / 2)', 'B', 'Bend'),
    v: key('~', () => technique('v'), 'tech', 'Vibrato', '~', 'Vibrato'),
    pm: key('P.M.', () => technique('pm'), 'tech', 'Palm Mute', 'M', 'Palm Mute', 'Mute'),
    lr: key('L.R.', () => technique('lr'), 'tech', 'Let Ring – ausklingen lassen', 'L', 'Let Ring', 'Ring'),
    x: key('x', () => technique('x'), 'tech', 'Dead Note', 'X', 'Gedämpft', 'Dämpfen'),
  };
  // Rhythmus: Notenwert für die Position (bzw. alle Positionen der Auswahl); danach weiter zur nächsten Note
  function setDur(d) {
    const r = selRect();
    const g1 = selOn ? r.g1 : cur.g, g2 = selOn ? r.g2 : cur.g;
    mutate(() => {
      for (let g = g1; g <= g2; g++) {
        const { m, c } = loc(g);
        if (selOn && !colUsed(m, c)) continue;
        if (!m.dur) m.dur = Array(m.cols).fill(0);
        m.dur[c] = d;
        if (!m.dur.some(Boolean)) delete m.dur;
      }
    });
    if (selOn || !auto) return;
    const next = flat().findIndex(([mi, c], g) => g > cur.g && colUsed(tab.measures[mi], c));
    if (next >= 0) { cur = { g: next, s: cur.s }; last = null; draw(); }
  }
  function autoDur() {
    const r = selRect();
    const ms = new Set();
    for (let g = selOn ? r.g1 : cur.g; g <= (selOn ? r.g2 : cur.g); g++) ms.add(loc(g).mi);
    mutate(() => ms.forEach((mi) => { tab.measures[mi].dur = autoRhythm(tab.measures[mi]); }));
    toast(ms.size === 1 ? 'Notenwerte aus den Abständen gesetzt' : `Notenwerte in ${ms.size} Takten gesetzt`);
  }
  // Rhythmus in einer Taste: zeigt den Notenwert der Position, Tippen öffnet die Auswahl
  const rhythmKey = key('', () => popMenu(rhythmKey, [
    ...[[2, 'Halbe'], [4, 'Viertel'], [8, 'Achtel'], [16, 'Sechzehntel']].map(([d, l]) => ({ label: `1/${d}  ${l}`, icon: 'music', onClick: () => setDur(d) })),
    { label: 'Automatisch (Takt)', icon: 'clock', onClick: autoDur },
    { label: 'Notenwert entfernen', icon: 'close', onClick: () => setDur(0) },
  ]), 'tech rhythm-key', 'Rhythmus: Notenwert wählen');
  const strumIcon = (k, text) => [h('span', { class: 'rk-icon', html: strokeSVG({ k }) }), h('span', null, text)];
  const strumDown = key(strumIcon('D', 'ab'), () => strum('d'), 'tech strum-key', 'Abschlag');
  const strumUp = key(strumIcon('U', 'auf'), () => strum('u'), 'tech strum-key', 'Aufschlag');

  // Akkordleiste: zuerst die Griffe des Songs, dann gängige Akkorde, am Ende die ganze Bibliothek
  const chordRow = h('div', { class: 'tab-chords' });
  const own = song ? songChordList(song, inst) : [];
  const rest = commonNames(inst).filter((n) => !own.some((x) => x.name === n)).map((n) => ({ ch: findChord(n, null, inst), name: n, label: n })).filter((x) => x.ch);
  chordRow.append(
    ...[...own, ...rest].map((x) => h('button', { class: 'key tech chord-key', 'data-chord': x.name, onClick: () => placeChord(x.ch, x.name) }, x.label)),
    key('…', () => openChordLibrary({ instrument: inst, onPick: (c) => { if (c.frets) placeChord(c); else toast(`„${c.name}“ hat keinen Griff`); } }), 'tech chord-key', 'Weitere Akkorde'));
  
  const selKey = key('Auswahl', toggleSel, 'fn small k-sel');
  const pasteKey = key('Einfügen', paste, 'fn wide k-paste', null, 'Strg V');
  const selBar = h('div', { class: 'key-row sel-row hidden' },
    key('Ausschn.', () => { copy(true); mutate(() => clearRect(selRect())); toast('Ausgeschnitten'); }, 'fn small'),
    key(icon('left', 'small'), () => shiftSel(-1, 0), 'fn', 'Auswahl nach links'),
    key(icon('right', 'small'), () => shiftSel(1, 0), 'fn', 'Auswahl nach rechts'),
    key(icon('up', 'small'), () => shiftSel(0, -1), 'fn', 'Auswahl eine Saite höher'),
    key(icon('down', 'small'), () => shiftSel(0, 1), 'fn', 'Auswahl eine Saite tiefer'),
    key('−1', () => transpose(-1), 'fn', 'Bund −1'),
    key('+1', () => transpose(1), 'fn', 'Bund +1'));

  const pad = h('div', { class: 'keypad', role: 'group', 'aria-label': 'Tab-Tastatur' },
    selBar,
    chordRow,
    h('div', { class: 'tech-grid' }, Object.values(techBtns), strumDown, strumUp, rhythmKey),
    // Links die Zahlen, rechts Auswahl, Pfeile als Kreuz, Löschen und Bearbeiten
    h('div', { class: 'key-grid' },
      key('7', () => digit(7), 'k7'), key('8', () => digit(8), 'k8'), key('9', () => digit(9), 'k9'), selKey, key(icon('up'), () => move(0, -1), 'nav k-up', 'Saite höher'), key('⌫', del, 'fn k-del', 'Löschen'),
      key('4', () => digit(4), 'k4'), key('5', () => digit(5), 'k5'), key('6', () => digit(6), 'k6'), key(icon('left'), () => move(-1, 0), 'nav k-left', 'Zurück'), key(icon('down'), () => move(0, 1), 'nav k-down', 'Saite tiefer'), key(icon('right'), () => move(1, 0), 'nav k-right', 'Weiter'),
      key('1', () => digit(1), 'k1'), key('2', () => digit(2), 'k2'), key('3', () => digit(3), 'k3'), key('Kopieren', () => copy(), 'fn wide k-copy', null, 'Strg C'), pasteKey,
      key('0', () => digit(0), 'zero k0'), key('+ Takt', addMeasureAfter, 'fn wide add-measure'), key(icon('more'), more, 'fn wide k-more', 'Weitere Aktionen'),
      // Nur am PC (styles/sorell.css): eigene Tasten für Vorhandenes
      key('Takt löschen', deleteMeasure, 'fn k-delm s-only'),
      key(h('b', null, 'Nächste Spalte'), () => move(1, 0), 'k-next s-only', 'Nächste Spalte', null, '→')));

  let run = null;
  const playBtn = h('button', { class: 'tab-auto tab-playbtn', 'aria-label': 'Ab Cursor abspielen', onClick: () => togglePlay() });
  const drawPlay = () => { playBtn.replaceChildren(icon(run ? 'pause' : 'play', 'small'), h('span', { class: 'play-lbl s-only' }, run ? 'Stopp' : 'Abspielen')); playBtn.classList.toggle('on', !!run); };
  function togglePlay() {
    if (run) { run.stop(); return; }
    const r = selRect();
    run = playTab(tab, {
      tuning, capo, bpm, speed: playSpeed(), from: selOn ? r.g1 : cur.g, to: selOn ? r.g2 : undefined, loop: selOn,
      onPos: (g) => { if (g == null) return; cur = { g, s: cur.s }; draw(); },
      onEnd: () => { run = null; drawPlay(); },
    });
    drawPlay();
  }
  drawPlay();
  const autoBtn = h('button', { class: 'tab-auto', 'aria-label': 'Nach jeder Note automatisch weiter', onClick: () => {
    auto = !auto;
    try { if (auto) localStorage.removeItem(AUTO_KEY); else localStorage.setItem(AUTO_KEY, 'off'); } catch { /* egal */ }
    toast(auto ? 'Nach jeder Note geht es eine Position weiter' : 'Cursor bleibt stehen – gut für Akkorde übereinander');
    draw();
  } });
  const undoBtn = h('button', { class: 'nav-btn', 'aria-label': 'Rückgängig', onClick: () => restore(undo, redo) }, icon('undo'));
  const redoBtn = h('button', { class: 'nav-btn', 'aria-label': 'Wiederholen', onClick: () => restore(redo, undo) }, icon('redo'));
  const status = saveIndicator();

  // PC: Die Bildschirmtastatur lässt sich einklappen; sichtbar macht das nur styles/sorell.css bei Maus und breitem Fenster
  const PAD_KEY = 'gn-tab-pad';
  let padOff = false;
  try { padOff = localStorage.getItem(PAD_KEY) === 'off'; } catch { /* Standard: sichtbar */ }
  const padBtn = h('button', { class: 'tab-auto tab-keys', onClick: () => {
    padOff = !padOff;
    try { if (padOff) localStorage.setItem(PAD_KEY, 'off'); else localStorage.removeItem(PAD_KEY); } catch { /* egal */ }
    drawPad();
  } });
  function drawPad() {
    padBtn.textContent = padOff ? 'Tasten einblenden' : 'Tasten ausblenden';
    body.classList.toggle('no-pad', padOff);
    requestAnimationFrame(draw);
  }

  // Im Querformat stehen Tab und Infos links, die Tasten rechts (siehe styles/tabs.css)
  const help = helpHint('gn-hint-tab', 'Akkord antippen setzt ihn als Spalte, die Pfeile schlagen ihn an (ab oder auf). Noten verschiebst du durch Halten und Ziehen. Zweistellige Bünde: Ziffern zügig nacheinander (1, 2 = 12).', 'hint tab-hint');
  const body = h('div', { class: 'tab-editor' },
    wrap,
    h('div', { class: 'tab-info-row' }, info, h('span', { class: 'tab-typehint' }, 'Du kannst auch tippen'), help.btn, playBtn, autoBtn, padBtn),
    help.el,
    pad);
  drawPad();

  // Tastatur am PC
  const onKey = (e) => {
    if (document.querySelector('.dlg-wrap') || e.target.matches('input, textarea')) return;
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); restore(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo); }
      else if (k === 'y') { e.preventDefault(); restore(redo, undo); }
      else if (k === 'c') { e.preventDefault(); copy(); }
      else if (k === 'v') { e.preventDefault(); paste(); }
      return;
    }
    const map = { ArrowLeft: () => move(-1, 0), ArrowRight: () => move(1, 0), ArrowUp: () => move(0, -1), ArrowDown: () => move(0, 1), Backspace: del, Delete: del };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
    else if (/^[0-9]$/.test(e.key)) digit(Number(e.key));
    else if (['h', 'p', '/', '\\', 'b', 'x'].includes(e.key)) technique(e.key);
    else if (e.key === '~') technique('v');
    else if (e.key === 'm') technique('pm');
    else if (e.key === 'l') technique('lr');
    else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  };
  document.addEventListener('keydown', onKey);
  // Drehen: der Cursor bleibt im Bild
  const onResize = () => draw();
  window.addEventListener('resize', onResize);

  const s = sheet({
    title: tab.name || 'Tab', body, full: true, cls: 'tab-sheet',
    right: { label: 'Fertig', bold: true },
    onClose: () => { run?.stop(); cancelAdv(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); status.dispose(); if (onClose) onClose(isEmptyTab(tab)); },
  });
  // Rückgängig/Wiederholen und Speicherstatus in der Kopfzeile; Titel antippen = umbenennen
  const headEl = s.el.querySelector('.sheet-head');
  headEl.firstElementChild.replaceWith(h('div', { class: 'tab-head-tools' }, h('div', { class: 'tab-undo' }, undoBtn, redoBtn), status.el));
  // Sorell am PC: Hilfe und Abspielen stehen neben „Fertig“ im Dialog-Kopf
  if (isSorell() && matchMedia('(min-width: 1000px)').matches) {
    const done = headEl.lastElementChild;
    const right = h('div', { class: 'tab-head-right' }, help.btn, playBtn);
    done.replaceWith(right);
    right.append(done);
  }
  const titleEl = s.el.querySelector('.sheet-title');
  titleEl.classList.add('tappable');
  titleEl.setAttribute('role', 'button');
  titleEl.setAttribute('aria-label', 'Tab umbenennen');
  titleEl.addEventListener('click', rename);
  draw();
  requestAnimationFrame(draw);
  return s;
}
