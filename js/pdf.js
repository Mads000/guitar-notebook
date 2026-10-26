// PDF-Export (A4) mit der lokal eingebundenen Bibliothek vendor/jspdf.umd.min.js.
// Einzelner Song oder mehrere Songs als Songbook mit Inhaltsverzeichnis.
import { getAll } from './storage.js';
import { findChord, findBarres, fingerLabel, DIAGRAM, diagramLeft, isChordName, chordsShownInText, songChordList } from './chords.js';
import { songChordItems, tuningLabel, instrumentOf, defaultTuning } from './songs.js';
import { durLabel } from './progression.js';
import { countLabel } from './strumming.js';
import { noteText, stringLabels, nextOnString, flatCols, tabStrings, BEND_LABEL } from './tabs.js';

let loading = null;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = () => (window.jspdf ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF nicht verfügbar')));
      s.onerror = () => { loading = null; reject(new Error('Die PDF-Bibliothek konnte nicht geladen werden.')); };
      document.head.append(s);
    });
  }
  return loading;
}

const C = { text: [28, 28, 30], gray: [105, 105, 112], light: [160, 160, 168], line: [205, 205, 210], accent: [176, 94, 22], white: [255, 255, 255] };
const PW = 210, PH = 297, MX = 16, MT = 17, MB = 17, CW = PW - 2 * MX;
const PT = 0.3528; // mm pro Punkt

// Standardschriften von jsPDF kennen nur Latin-1 – andere Zeichen werden ersetzt.
const MAP = { '→': '->', '←': '<-', '♯': '#', '♭': 'b', '…': '...', '–': '-', '—': '-', '„': '"', '“': '"', '”': '"', '‚': "'", '‘': "'", '’': "'", '•': '·', '−': '-', '½': '½' };
const clean = (s) => String(s ?? '').replace(/\r/g, '').replace(/\t/g, '    ')
  .replace(/[^\n\x20-\x7e\xa0-\xff]/gu, (c) => MAP[c] ?? (c.codePointAt(0) > 0xffff ? '' : '?'));

class Writer {
  constructor(doc) { this.doc = doc; this.y = MT; this.running = ''; this.cur = [10, 'normal', C.text]; }
  font(size, style = 'normal', color = C.text) {
    this.cur = [size, style, color];
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }
  ensure(hgt) {
    if (this.y + hgt <= PH - MB) return false;
    this.newPage();
    return true;
  }
  newPage() {
    const keep = this.cur;
    this.doc.addPage();
    this.y = MT;
    if (this.running) {
      this.font(8, 'normal', C.light);
      this.doc.text(clean(this.running) + ' (Fortsetzung)', MX, MT - 7);
    }
    this.font(...keep);
  }
}

// ---------- Bausteine ----------
function paragraph(w, text, size = 10, color = C.text) {
  const doc = w.doc;
  w.font(size, 'normal', color);
  const lh = size * PT * 1.4;
  for (const line of doc.splitTextToSize(clean(text), CW)) {
    w.ensure(lh);
    doc.text(line, MX, w.y + lh * 0.74);
    w.y += lh;
  }
}

// Liedtext mit Inline-Akkorden („[G]Heute ist [D]der Tag“): Akkorde stehen über der passenden Textstelle.
function lyricsBlock(w, text) {
  const doc = w.doc;
  const isChord = (p) => p.startsWith('[') && isChordName(p.slice(1, -1));
  for (const raw of clean(text).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { w.y += 2.6; continue; }
    const parts = line.split(/(\[[^\]\s]{1,14}\])/);
    if (!parts.some(isChord)) { paragraph(w, line, 10, C.text); continue; }
    const chords = [];
    let lyric = '';
    for (const part of parts) {
      if (isChord(part)) {
        w.font(10);
        let x = doc.getTextWidth(lyric);
        const prev = chords[chords.length - 1];
        if (prev) { w.font(9, 'bold'); x = Math.max(x, prev.x + doc.getTextWidth(prev.name) + 1.6); }
        chords.push({ name: part.slice(1, -1), x });
      } else lyric += part;
    }
    w.font(10);
    const last = chords[chords.length - 1];
    w.font(9, 'bold');
    const chordEnd = last.x + doc.getTextWidth(last.name);
    w.font(10);
    if (Math.max(doc.getTextWidth(lyric), chordEnd) > CW) { paragraph(w, line, 10, C.text); continue; }
    const hasLyric = lyric.trim().length > 0;
    const lh = hasLyric ? 8.8 : 5.2;
    w.ensure(lh);
    w.font(9, 'bold', C.accent);
    for (const c of chords) doc.text(c.name, MX + c.x, w.y + 3.4);
    if (hasLyric) { w.font(10, 'normal', C.text); doc.text(lyric, MX, w.y + 7.6); }
    w.y += lh;
  }
}

function sectionHeader(w, name) {
  const doc = w.doc;
  w.ensure(20); // Überschrift nicht allein am Seitenende
  w.y += 2.5;
  w.font(10.5, 'bold', C.accent);
  const t = clean(String(name || 'Abschnitt').toUpperCase());
  doc.text(t, MX, w.y + 3.6, { charSpace: 0.35 });
  const tw = doc.getTextWidth(t) + t.length * 0.35;
  doc.setDrawColor(...C.line);
  doc.setLineWidth(0.25);
  doc.line(MX + tw + 3, w.y + 2.4, PW - MX, w.y + 2.4);
  w.y += 7.5;
}

function drawChord(w, ch, name, x0, y0, k) {
  const doc = w.doc;
  const { frets: NF, sx, fy, markH, nameH } = DIAGRAM;
  const base = ch.base || 1;
  const NS = ch.frets.length === 4 ? 4 : 6, LS = NS - 1, left = diagramLeft(NS);
  const X = (s) => x0 + (left + s * sx) * k, top = y0 + (nameH + markH) * k, Y = (rel) => top + (rel - 0.5) * fy * k;
  w.font(9.5, 'bold', C.text);
  doc.text(clean(name), X(LS / 2), y0 + 10.5 * k, { align: 'center' });
  doc.setDrawColor(...C.text);
  doc.setLineWidth(0.17);
  for (let i = 0; i <= NF; i++) doc.line(X(0), top + i * fy * k, X(LS), top + i * fy * k);
  for (let s = 0; s < NS; s++) doc.line(X(s), top, X(s), top + NF * fy * k);
  doc.setFillColor(...C.text);
  if (base === 1) doc.rect(X(0) - 0.1, top - 2.6 * k, X(LS) - X(0) + 0.2, 2.7 * k, 'F');
  else { w.font(7, 'normal', C.text); doc.text(String(base), X(0) - 3 * k, Y(1) + 1, { align: 'right' }); }
  for (let s = 0; s < NS; s++) {
    const f = ch.frets[s], x = X(s), y = top - 5.4 * k, r = 2.1 * k;
    doc.setLineWidth(0.2);
    if (f === -1) { doc.line(x - r, y - r, x + r, y + r); doc.line(x + r, y - r, x - r, y + r); }
    else if (f === 0) doc.circle(x, y, 2.3 * k, 'S');
  }
  const show = ch.showFingers !== false, R = 3.9 * k;
  const num = (n, x, y) => { if (!show || !n) return; w.font(6.3, 'bold', C.white); doc.text(fingerLabel(n), x, y + 0.8, { align: 'center' }); };
  const covered = new Set();
  for (const b of findBarres(ch)) {
    const rel = b.fret - base + 1;
    if (rel < 1 || rel > NF) continue;
    for (let s = b.from; s <= b.to; s++) if (ch.frets[s] === b.fret && ch.fingers[s] === b.finger) covered.add(s);
    doc.setFillColor(...C.text);
    doc.roundedRect(X(b.from) - R, Y(rel) - R, X(b.to) - X(b.from) + 2 * R, 2 * R, R, R, 'F');
    num(b.finger, (X(b.from) + X(b.to)) / 2, Y(rel));
  }
  for (let s = 0; s < NS; s++) {
    const f = ch.frets[s];
    if (!(f > 0) || covered.has(s)) continue;
    const rel = f - base + 1;
    if (rel < 1 || rel > NF) continue;
    doc.setFillColor(...C.text);
    doc.circle(X(s), Y(rel), R, 'F');
    num(ch.fingers?.[s], X(s), Y(rel));
  }
}

function renderDiagrams(w, song) {
  const inst = instrumentOf(song);
  const list = songChordList(song, inst, { unused: false }).map((x) => ({ name: x.label, ch: x.ch }));
  if (!list.length) return;
  const k = 0.25, dw = (DIAGRAM.left + DIAGRAM.sx * 5 + DIAGRAM.right) * k, dh = (DIAGRAM.nameH + DIAGRAM.markH + DIAGRAM.fy * DIAGRAM.frets + 3) * k;
  const gap = 4, per = Math.floor((CW + gap) / (dw + gap));
  for (let i = 0; i < list.length; i += per) {
    w.ensure(dh + 2);
    list.slice(i, i + per).forEach((c, j) => drawChord(w, c.ch, c.name, MX + j * (dw + gap) - DIAGRAM.left * k * 0.4, w.y, k));
    w.y += dh + 3;
  }
  w.y += 1;
}

function arrow(doc, x1, x2, y) {
  doc.setDrawColor(...C.light);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
  doc.line(x2 - 1.1, y - 0.8, x2, y);
  doc.line(x2 - 1.1, y + 0.8, x2, y);
}

function renderChords(w, b) {
  if (!b.items.length) return;
  const doc = w.doc;
  const hasDur = b.items.some((i) => i.dur && i.dur.n);
  const rowH = hasDur ? 11.5 : 8.5, AW = 7;
  const rows = [];
  let row = [], rx = 0;
  for (const it of b.items) {
    w.font(13, 'bold');
    let wd = doc.getTextWidth(clean(it.name));
    if (it.dur?.n) { w.font(7.5); wd = Math.max(wd, doc.getTextWidth(durLabel(it.dur))); }
    if (row.length && rx + AW + wd > CW - 12) { rows.push(row); row = []; rx = 0; }
    const lead = row.length ? AW : 0;
    row.push({ it, wd, x: rx + lead });
    rx += lead + wd;
  }
  rows.push(row);
  rows.forEach((r, ri) => {
    w.ensure(rowH);
    r.forEach((t, i) => {
      if (i) { const prev = r[i - 1]; arrow(doc, MX + prev.x + prev.wd + 1.4, MX + t.x - 1.4, w.y + 3.6); }
      w.font(13, 'bold', C.text);
      doc.text(clean(t.it.name), MX + t.x, w.y + 5);
      if (t.it.dur?.n) { w.font(7.5, 'normal', C.gray); doc.text(durLabel(t.it.dur), MX + t.x, w.y + 9); }
    });
    if (ri === rows.length - 1 && b.repeat > 1) {
      const last = r[r.length - 1];
      w.font(10, 'bold', C.accent);
      doc.text('×' + b.repeat, MX + last.x + last.wd + 4, w.y + 5);
    }
    w.y += rowH;
  });
  w.y += 1;
}

function renderStrum(w, b) {
  if (!b.strokes.length) return;
  const doc = w.doc;
  const cell = b.grid === 16 ? 4.8 : 6.4;
  const per = Math.max(1, Math.floor((CW - 14) / cell));
  if (b.name) { w.ensure(18); w.font(8.5, 'bold', C.gray); doc.text(clean(b.name), MX, w.y + 3); w.y += 4.5; }
  for (let i0 = 0; i0 < b.strokes.length; i0 += per) {
    const chunk = b.strokes.slice(i0, i0 + per);
    w.ensure(15);
    const y = w.y;
    chunk.forEach((st, j) => {
      const i = i0 + j, cx = MX + j * cell + cell / 2;
      const beat = b.grid === 16 ? i % 4 === 0 : i % 2 === 0;
      doc.setDrawColor(...C.text);
      doc.setLineWidth(st.a ? 0.6 : 0.35);
      if (st.k === 'D') { doc.line(cx, y + 2.6, cx, y + 9.6); doc.line(cx - 1.3, y + 8.1, cx, y + 9.8); doc.line(cx + 1.3, y + 8.1, cx, y + 9.8); }
      else if (st.k === 'U') { doc.line(cx, y + 9.8, cx, y + 2.8); doc.line(cx - 1.3, y + 4.3, cx, y + 2.6); doc.line(cx + 1.3, y + 4.3, cx, y + 2.6); }
      else if (st.k === 'X') { doc.line(cx - 1.4, y + 4.8, cx + 1.4, y + 7.6); doc.line(cx + 1.4, y + 4.8, cx - 1.4, y + 7.6); }
      else { doc.setDrawColor(...C.light); doc.line(cx - 1, y + 6.2, cx + 1, y + 6.2); }
      if (st.a) { doc.setDrawColor(...C.accent); doc.setLineWidth(0.35); doc.line(cx - 1.2, y, cx + 1.2, y + 0.8); doc.line(cx + 1.2, y + 0.8, cx - 1.2, y + 1.6); }
      w.font(7, beat ? 'bold' : 'normal', beat ? C.gray : C.light);
      doc.text(countLabel(i, b.grid), cx, y + 13.2, { align: 'center' });
    });
    if (i0 + per >= b.strokes.length && b.repeat > 1) { w.font(10, 'bold', C.accent); doc.text('×' + b.repeat, MX + chunk.length * cell + 3, y + 7.5); }
    w.y += 15;
  }
}

function renderTab(w, tab, tuning) {
  const doc = w.doc;
  const colW = 3.5, rowH = 3.3, gap = 2.4, labelW = 4.5, annot = 6.5;
  const N = tabStrings(tab), LAST = N - 1; // 6 Saiten (Gitarre) oder 4 (Ukulele)
  const sysH = annot + rowH * LAST + 4.5;
  const labels = stringLabels(tuning, N);
  const flat = flatCols(tab);
  const starts = [];
  let acc = 0;
  tab.measures.forEach((m) => { starts.push(acc); acc += m.cols; });
  const avail = CW - labelW;
  const systems = [];
  let cur = [], wsum = 0;
  tab.measures.forEach((m, mi) => {
    const mw = gap + m.cols * colW;
    if (cur.length && wsum + mw > avail) { systems.push(cur); cur = []; wsum = 0; }
    cur.push(mi);
    wsum += mw;
  });
  if (cur.length) systems.push(cur);

  if (tab.name) { w.ensure(sysH + 5); w.font(8.5, 'bold', C.gray); doc.text(clean(tab.name), MX, w.y + 3); w.y += 4.5; }
  const at = (g, s) => { const [mi, c] = flat[g]; return tab.measures[mi].notes[s][c]; };

  for (const sys of systems) {
    w.ensure(sysH);
    const y0 = w.y + annot;
    const total = sys.reduce((a, mi) => a + gap + tab.measures[mi].cols * colW, 0);
    const sc = Math.min(1, avail / total);
    const colX = new Map();
    const bars = [];
    let x = MX + labelW;
    for (const mi of sys) {
      bars.push(x);
      const m = tab.measures[mi];
      for (let c = 0; c < m.cols; c++) colX.set(starts[mi] + c, x + (gap / 2 + (c + 0.5) * colW) * sc);
      x += (gap + m.cols * colW) * sc;
    }
    const end = x;
    const Y = (s) => y0 + s * rowH;

    doc.setDrawColor(...C.light);
    doc.setLineWidth(0.15);
    for (let s = 0; s < N; s++) doc.line(MX + labelW, Y(s), end, Y(s));
    w.font(6.5, 'normal', C.gray);
    for (let s = 0; s < N; s++) doc.text(clean(labels[s]), MX + labelW / 2 - 0.6, Y(s) + 0.85, { align: 'center' });
    doc.setDrawColor(...C.gray);
    doc.setLineWidth(0.22);
    bars.forEach((bx, i) => {
      doc.line(bx, Y(0), bx, Y(LAST));
      if (tab.measures.length > 1) { w.font(5.5, 'normal', C.light); doc.text(String(sys[i] + 1), bx + 0.6, Y(0) - 1.4); }
    });
    doc.setLineWidth(sys[sys.length - 1] === tab.measures.length - 1 ? 0.6 : 0.22);
    doc.line(end, Y(0), end, Y(LAST));

    const gs = [...colX.keys()];
    // Palm Mute
    for (let i = 0; i < gs.length; i++) {
      const pm = (g) => { const [mi, c] = flat[g]; return !!tab.measures[mi].pm[c]; };
      if (!pm(gs[i])) continue;
      let e = i;
      while (e + 1 < gs.length && pm(gs[e + 1])) e++;
      const x1 = colX.get(gs[i]) - colW * sc / 2 + 0.3, x2 = colX.get(gs[e]) + colW * sc / 2 - 0.3;
      w.font(6, 'bold', C.gray);
      doc.text('P.M.', x1, y0 - 4.6);
      const tx = x1 + doc.getTextWidth('P.M.') + 0.8;
      if (x2 > tx + 1) {
        doc.setDrawColor(...C.gray);
        doc.setLineWidth(0.18);
        doc.setLineDashPattern([0.6, 0.6], 0);
        doc.line(tx, y0 - 5.2, x2, y0 - 5.2);
        doc.setLineDashPattern([], 0);
        doc.line(x2, y0 - 5.2, x2, y0 - 4.2);
      }
      i = e;
    }
    // Noten und Techniken
    for (const g of gs) {
      for (let s = 0; s < N; s++) {
        const n = at(g, s), t = noteText(n);
        if (!t) continue;
        const nx = colX.get(g), ny = Y(s);
        w.font(7.5, n.x ? 'normal' : 'bold', C.text);
        const tw = doc.getTextWidth(t) + 0.9;
        doc.setFillColor(...C.white);
        doc.rect(nx - tw / 2, ny - 1.35, tw, 2.7, 'F');
        doc.text(t, nx, ny + 0.95, { align: 'center' });
        if (n.l) {
          const g2 = nextOnString(tab, flat, g, s);
          const has = g2 >= 0 && colX.has(g2);
          const xa = nx + tw / 2;
          let xb = xa + colW * 0.7;
          if (has) { w.font(7.5, 'bold'); xb = colX.get(g2) - (doc.getTextWidth(noteText(at(g2, s))) + 0.9) / 2; }
          doc.setDrawColor(...C.gray);
          doc.setLineWidth(0.2);
          if (n.l === 'h' || n.l === 'p') {
            const dx = xb - xa;
            doc.lines([[dx * 0.25, -1.3, dx * 0.75, -1.3, dx, 0]], xa - 0.2, ny - 1.4, [1, 1], 'S', false);
            w.font(5.5, 'normal', C.gray);
            doc.text(n.l, xa + dx / 2, ny - 3.2, { align: 'center' });
          } else {
            const d = n.l === '/' ? 0.7 : -0.7;
            doc.line(xa + 0.2, ny + d, xb - 0.2, ny - d);
          }
        }
        if (n.b) {
          const bx = nx + tw / 2, tipX = nx + colW * sc * 0.55, tipY = ny - rowH * 0.95;
          doc.setDrawColor(...C.text);
          doc.setLineWidth(0.2);
          doc.lines([[tipX - bx, 0, tipX - bx, tipY - ny + 0.8, tipX - bx, tipY - ny + 0.8]], bx, ny, [1, 1], 'S', false);
          doc.setFillColor(...C.text);
          doc.triangle(tipX - 0.6, tipY + 0.9, tipX + 0.6, tipY + 0.9, tipX, tipY - 0.2, 'F');
          w.font(5.5, 'bold', C.text);
          doc.text(BEND_LABEL[n.b], tipX + 0.5, tipY - 0.5);
        }
        if (n.v) {
          doc.setDrawColor(...C.text);
          doc.setLineWidth(0.2);
          const vx = nx - 1.4, vy = y0 - 2.4, seg = 0.7;
          const pts = [];
          for (let k = 0; k < 4; k++) pts.push([seg, k % 2 ? 0.5 : -0.5]);
          doc.lines(pts, vx, vy, [1, 1], 'S', false);
        }
      }
    }
    w.y += sysH;
  }
  w.y += 1;
}

function songHeader(w, song) {
  const doc = w.doc;
  w.font(22, 'bold', C.text);
  for (const line of doc.splitTextToSize(clean(song.title), CW)) { w.ensure(10); doc.text(line, MX, w.y + 7.2); w.y += 9; }
  if (song.artist) { w.font(12.5, 'normal', C.gray); doc.text(clean(song.artist), MX, w.y + 4.4); w.y += 6.5; }
  const parts = [];
  const inst = instrumentOf(song);
  if (inst === 'ukulele') parts.push('Ukulele');
  if (song.capo) parts.push(`Capo ${song.capo}`);
  if (song.tuning && song.tuning !== defaultTuning(inst)) {
    const name = tuningLabel(song.tuning, inst);
    parts.push(`Stimmung: ${name === song.tuning ? song.tuning : `${name} (${song.tuning})`}`);
  }
  if (song.bpm) parts.push(`${song.bpm} BPM`);
  if (song.timeSig) parts.push(`Takt ${song.timeSig}`);
  if (parts.length) { w.font(9.5, 'normal', C.gray); doc.text(clean(parts.join('   ·   ')), MX, w.y + 3.8); w.y += 5.8; }
  w.y += 1.2;
  doc.setDrawColor(...C.line);
  doc.setLineWidth(0.3);
  doc.line(MX, w.y, PW - MX, w.y);
  w.y += 5;
}

function renderSong(w, song, tabsById) {
  w.running = '';
  songHeader(w, song);
  w.running = song.title;
  renderDiagrams(w, song);
  if (song.notes?.trim()) { paragraph(w, song.notes.trim(), 10, C.gray); w.y += 2; }
  for (const sec of song.sections) {
    sectionHeader(w, sec.name);
    for (const b of sec.blocks) {
      if (b.type === 'chords') { if (!chordsShownInText(sec)) renderChords(w, b); }
      else if (b.type === 'strum') renderStrum(w, b);
      else if (b.type === 'tab') { const t = tabsById.get(b.tabId); if (t) renderTab(w, t, song.tuning); }
      else if (b.text?.trim()) { lyricsBlock(w, b.text.trim()); w.y += 1.5; }
      w.y += 1.5;
    }
    w.y += 2;
  }
  w.running = '';
}

function footer(doc, label) {
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.light);
    doc.text(clean(label), MX, PH - 8);
    doc.text(`${p} / ${n}`, PW - MX, PH - 8, { align: 'right' });
  }
}

const safeName = (s) => (clean(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Song');

export async function exportSongsPDF(songs, { title = 'Songbook' } = {}) {
  if (!songs.length) throw new Error('Keine Songs ausgewählt.');
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const book = songs.length > 1;
  doc.setProperties({ title: clean(book ? title : songs[0].title), creator: 'Sorell' });
  const tabsById = new Map((await getAll('tabs')).map((t) => [t.id, t]));
  const w = new Writer(doc);
  const toc = [];
  const TOC_TOP = 62, TOC_LH = 7.2;
  const firstRows = Math.floor((PH - MB - TOC_TOP) / TOC_LH), moreRows = Math.floor((PH - MB - MT - 4) / TOC_LH);

  if (book) {
    const tocPages = 1 + Math.max(0, Math.ceil((songs.length - firstRows) / moreRows));
    for (let i = 1; i < tocPages; i++) doc.addPage();
  }
  songs.forEach((song, i) => {
    if (book || i > 0) { doc.addPage(); w.y = MT; }
    toc.push({ song, page: doc.getNumberOfPages() });
    renderSong(w, song, tabsById);
  });

  if (book) {
    doc.setPage(1);
    w.font(30, 'bold', C.text);
    doc.text(clean(title), MX, 36);
    w.font(11, 'normal', C.gray);
    doc.text(`${songs.length} Songs · ${new Date().toLocaleDateString('de-DE')}`, MX, 45);
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.3);
    doc.line(MX, 52, PW - MX, 52);
    let page = 1, y = TOC_TOP, row = 0;
    toc.forEach(({ song, page: p }) => {
      if (row >= (page === 1 ? firstRows : moreRows)) { page++; doc.setPage(page); y = MT + 4; row = 0; }
      w.font(11, 'bold', C.text);
      const t = doc.splitTextToSize(clean(song.title), CW - 70)[0];
      doc.text(t, MX, y);
      let x = MX + doc.getTextWidth(t) + 3;
      if (song.artist) { w.font(9.5, 'normal', C.gray); const a = doc.splitTextToSize(clean(song.artist), PW - MX - 16 - x)[0] || ''; doc.text(a, x, y); x += doc.getTextWidth(a) + 3; }
      w.font(11, 'normal', C.text);
      doc.text(String(p), PW - MX, y, { align: 'right' });
      doc.setDrawColor(...C.line);
      doc.setLineDashPattern([0.4, 1], 0);
      doc.line(x, y, PW - MX - 9, y);
      doc.setLineDashPattern([], 0);
      y += TOC_LH;
      row++;
    });
  }
  footer(doc, book ? title : songs[0].title + (songs[0].artist ? ' – ' + songs[0].artist : ''));
  const blob = doc.output('blob');
  const date = new Date().toISOString().slice(0, 10);
  return { blob, filename: book ? `${safeName(title)} ${date}.pdf` : `${safeName(songs[0].title)}.pdf` };
}
