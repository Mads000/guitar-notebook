// Tab-Editor: eigene Tastenleiste (keine iPhone-Tastatur), Cursor, Auswahl, Techniken, Takte, Undo/Redo.
import { h, sheet, icon, toast, ask, actionSheet, confirmDialog, clone, saveIndicator } from './ui.js';
import { MAX_FRET, newMeasure, tabStrings, flatCols, tabSVG, tabLayout, stringLabels, describeNote, noteText, isEmptyTab, tabToText } from './tabs.js';
import { uid } from './songs.js';
import { findChord, isChordName } from './chords.js';
import { parseTabText } from './importer.js';

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

export function openTabEditor(tab, { tuning, onChange, onClose } = {}) {
  let cur = { g: 0, s: 0 }, selOn = false, anchor = null, last = null, advT = null;
  const cancelAdv = () => { clearTimeout(advT); advT = null; };
  const undo = [], redo = [];
  const N = tabStrings(tab), LAST = N - 1; // 6 Saiten (Gitarre) oder 4 (Ukulele)
  const labels = stringLabels(tuning, N);
  const OPTS = window.innerHeight < 700 ? OPTS_COMPACT : OPTS_FULL;

  const flat = () => flatCols(tab);
  const loc = (g) => { const [mi, c] = flat()[g]; return { m: tab.measures[mi], mi, c }; };
  const getNote = (g, s) => { const { m, c } = loc(g); return m.notes[s][c]; };
  const setNote = (g, s, n) => { const { m, c } = loc(g); m.notes[s][c] = n; };
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
  scroll.addEventListener('scroll', () => wrap.classList.toggle('scrolled', scroll.scrollLeft > 8), { passive: true });
  const info = h('div', { class: 'tab-info' });

  function draw() {
    cur.g = clamp(cur.g, 0, flat().length - 1);
    scroll.innerHTML = tabSVG(tab, { ...OPTS, tuning, cursor: cur, sel: selOn ? selRect() : null });
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
    for (const [k, b] of Object.entries(techBtns)) {
      let on = false;
      if (k === 'pm') on = loc(cur.g).m.pm[loc(cur.g).c];
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
  }

  scroll.addEventListener('click', (e) => {
    const svg = scroll.querySelector('svg');
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const L = tabLayout(tab, OPTS);
    let best = 0, bd = Infinity;
    L.colX.forEach((cx, g) => { const d = Math.abs(cx - x); if (d < bd) { bd = d; best = g; } });
    cur = { g: best, s: clamp(Math.round((y - L.top) / L.rowH), 0, LAST) };
    last = null;
    cancelAdv();
    draw();
  });

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

  function clearRect(r) { for (let g = r.g1; g <= r.g2; g++) for (let s = r.s1; s <= r.s2; s++) setNote(g, s, null); }

  function del() {
    if (selOn) { mutate(() => clearRect(selRect())); return; }
    if (noteText(getNote(cur.g, cur.s))) mutate(() => setNote(cur.g, cur.s, null));
    else move(-1, 0);
  }

  function move(dg, ds) {
    cancelAdv();
    if (dg > 0 && cur.g + dg >= flat().length && !selOn) {
      mutate(() => ensureCols(cur.g + dg + 1));
    }
    cur = { g: clamp(cur.g + dg, 0, flat().length - 1), s: clamp(cur.s + ds, 0, LAST) };
    last = null;
    draw();
  }

  function technique(kind) {
    if (kind === 'pm') {
      const r = selRect();
      mutate(() => {
        const on = !loc(r.g1).m.pm[loc(r.g1).c];
        for (let g = r.g1; g <= r.g2; g++) { const { m, c } = loc(g); m.pm[c] = on; }
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
    const notes = selNotes();
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
    clip = { w: r.g2 - r.g1 + 1, hgt: r.s2 - r.s1 + 1, s1: r.s1, cells: [], pm: [] };
    for (let i = 0; i < clip.w; i++) {
      const col = [];
      for (let j = 0; j < clip.hgt; j++) { const n = getNote(r.g1 + i, r.s1 + j); col.push(n ? clone(n) : null); }
      clip.cells.push(col);
      const { m, c } = loc(r.g1 + i);
      clip.pm.push(!!m.pm[c]);
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
        if (full) { const { m, c } = loc(cur.g + i); m.pm[c] = !!clip.pm[i]; }
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

  // Griff eines Akkords als eine Spalte (alle Saiten gleichzeitig)
  async function chordColumn() {
    const name = await ask('Akkord als Spalte', { placeholder: 'z. B. Am, G, D7', ok: 'Einfügen', autocapitalize: 'characters' });
    if (!name) return;
    const n = name.trim().replace(/^./, (x) => x.toUpperCase());
    const ch = isChordName(n) && findChord(n, null, N === 4 ? 'ukulele' : 'guitar');
    if (!ch) { toast(`Kein Griff für „${n}“ gefunden`); return; }
    mutate(() => { for (let s = 0; s < N; s++) { const f = ch.frets[N - 1 - s]; setNote(cur.g, s, f >= 0 ? { f } : null); } });
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
      mutate(() => { tab.measures = measures; });
      cur = { g: 0, s: 0 };
      sh.close();
      toast(`${measures.length} ${measures.length === 1 ? 'Takt' : 'Takte'} übernommen`);
    } } });
    setTimeout(() => { ta.focus(); ta.setSelectionRange(0, 0); ta.scrollLeft = 0; ta.scrollTop = 0; }, 350);
  }

  async function more() {
    const { mi, m, c } = loc(cur.g);
    const measureEmpty = m.notes.every((row) => row.every((n) => !noteText(n)));
    actionSheet(`Takt ${mi + 1}`, [
      { label: 'Takt danach einfügen', icon: 'plus', onClick: addMeasureAfter },
      { label: 'Takt duplizieren', icon: 'copy', onClick: () => { mutate(() => { const d = clone(m); d.id = uid(); tab.measures.splice(mi + 1, 0, d); }); } },
      { label: 'Akkord als Spalte …', icon: 'grid', onClick: chordColumn },
      { label: 'Als Text bearbeiten oder einfügen …', icon: 'paste', onClick: textEdit },
      { section: 'Position' },
      { label: 'Spalte hier einfügen', icon: 'right', onClick: () => mutate(() => { m.notes.forEach((row) => row.splice(c, 0, null)); m.pm.splice(c, 0, false); m.cols++; }) },
      { label: 'Spalte hier löschen', icon: 'close', disabled: m.cols <= 1, onClick: () => mutate(() => { m.notes.forEach((row) => row.splice(c, 1)); m.pm.splice(c, 1); m.cols--; }) },
      { label: `Taktlänge ändern (${m.cols} Positionen)`, icon: 'clock', onClick: () => resizeMeasure(m) },
      { section: ' ' },
      { label: 'Tab umbenennen', icon: 'rename', onClick: rename },
      { label: tab.measures.length > 1 ? 'Takt löschen' : 'Takt leeren', icon: 'trash', destructive: true, onClick: async () => {
        if (!measureEmpty && !(await confirmDialog(tab.measures.length > 1 ? 'Takt löschen?' : 'Takt leeren?', `Takt ${mi + 1} enthält Noten. Du kannst das mit „Rückgängig“ widerrufen.`, { ok: 'Löschen', destructive: true }))) return;
        mutate(() => { if (tab.measures.length > 1) tab.measures.splice(mi, 1); else tab.measures[0] = newMeasure(m.cols, N); });
      } },
    ]);
  }

  async function resizeMeasure(m) {
    const n = await actionSheet('Positionen pro Takt', [4, 6, 8, 12, 16, 24].map((v) => ({ label: `${v}${v === m.cols ? ' ✓' : ''}`, value: v })));
    if (!n || n === m.cols) return;
    mutate(() => {
      if (n < m.cols) { m.notes.forEach((row) => row.splice(n)); m.pm.splice(n); }
      else { m.notes.forEach((row) => row.push(...Array(n - m.cols).fill(null))); m.pm.push(...Array(n - m.cols).fill(false)); }
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
  const key = (label, fn, cls = '', aria) => h('button', { class: 'key ' + cls, 'aria-label': aria || null, onClick: fn }, label);
  const techBtns = {
    h: key('h', () => technique('h'), 'tech', 'Hammer-on'),
    p: key('p', () => technique('p'), 'tech', 'Pull-off'),
    '/': key('/', () => technique('/'), 'tech', 'Slide aufwärts'),
    '\\': key('\\', () => technique('\\'), 'tech', 'Slide abwärts'),
    b: key('b', () => technique('b'), 'tech', 'Bend (½ / voll / 1½ / 2)'),
    v: key('~', () => technique('v'), 'tech', 'Vibrato'),
    pm: key('P.M.', () => technique('pm'), 'tech', 'Palm Mute'),
    x: key('x', () => technique('x'), 'tech', 'Dead Note'),
  };
  const selKey = key('Auswahl', toggleSel, 'fn');
  const pasteKey = key('Einfügen', paste, 'fn');
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
    h('div', { class: 'key-row tech-row' }, Object.values(techBtns)),
    h('div', { class: 'key-grid' },
      key('7', () => digit(7)), key('8', () => digit(8)), key('9', () => digit(9)), key(icon('up'), () => move(0, -1), 'nav', 'Saite höher'), key('⌫', del, 'fn', 'Löschen'),
      key('4', () => digit(4)), key('5', () => digit(5)), key('6', () => digit(6)), key(icon('down'), () => move(0, 1), 'nav', 'Saite tiefer'), selKey,
      key('1', () => digit(1)), key('2', () => digit(2)), key('3', () => digit(3)), key(icon('left'), () => move(-1, 0), 'nav', 'Zurück'), key(icon('right'), () => move(1, 0), 'nav', 'Weiter'),
      key('+ Takt', addMeasureAfter, 'fn'), key('0', () => digit(0)), key('Kopieren', () => copy(), 'fn'), pasteKey, key(icon('more'), more, 'fn', 'Weitere Aktionen')));

  const autoBtn = h('button', { class: 'tab-auto', 'aria-label': 'Nach jeder Note automatisch weiter', onClick: () => {
    auto = !auto;
    try { if (auto) localStorage.removeItem(AUTO_KEY); else localStorage.setItem(AUTO_KEY, 'off'); } catch { /* egal */ }
    toast(auto ? 'Nach jeder Note geht es eine Position weiter' : 'Cursor bleibt stehen – gut für Akkorde übereinander');
    draw();
  } });
  const undoBtn = h('button', { class: 'nav-btn', 'aria-label': 'Rückgängig', onClick: () => restore(undo, redo) }, icon('undo'));
  const redoBtn = h('button', { class: 'nav-btn', 'aria-label': 'Wiederholen', onClick: () => restore(redo, undo) }, icon('redo'));
  const status = saveIndicator();

  const body = h('div', { class: 'tab-editor' },
    wrap,
    h('div', { class: 'tab-info-row' }, info, autoBtn),
    h('p', { class: 'hint tab-hint' }, 'Zweistellige Bünde: Ziffern zügig nacheinander tippen (1, 2 = 12). Ganze Akkorde, Text-Tabs und mehr unter •••.'),
    pad);

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
  };
  document.addEventListener('keydown', onKey);

  const s = sheet({
    title: tab.name || 'Tab', body, full: true, cls: 'tab-sheet',
    right: { label: 'Fertig', bold: true },
    onClose: () => { cancelAdv(); document.removeEventListener('keydown', onKey); status.dispose(); if (onClose) onClose(isEmptyTab(tab)); },
  });
  // Rückgängig/Wiederholen und Speicherstatus in der Kopfzeile; Titel antippen = umbenennen
  s.el.querySelector('.sheet-head').firstElementChild.replaceWith(h('div', { class: 'tab-head-tools' }, undoBtn, redoBtn, status.el));
  const titleEl = s.el.querySelector('.sheet-title');
  titleEl.classList.add('tappable');
  titleEl.setAttribute('role', 'button');
  titleEl.setAttribute('aria-label', 'Tab umbenennen');
  titleEl.addEventListener('click', rename);
  draw();
  requestAnimationFrame(draw);
  return s;
}
