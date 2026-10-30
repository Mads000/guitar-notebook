// Tabulaturen: Datenmodell und SVG-Darstellung.
// Tab: { id, songId, name, measures: [{ id, cols, notes: [Saiten][cols] (Note | null), pm: [cols] (Palm Mute) }] }
// Saitenzahl = Länge von notes: 6 (Gitarre) oder 4 (Ukulele).
// Saitenindex 0 = höchste Saite oben (Gitarre e, Ukulele A), letzter Index = unterste Zeile (Gitarre E, Ukulele G).
// Note: { f: Bund | null, x?: true (Dead Note), l?: 'h' | 'p' | '/' | '\\' (Verbindung zur nächsten Note),
//         b?: 0.5 | 1 | 1.5 | 2 (Bend in Ganztönen), v?: true (Vibrato) }
import * as db from './storage.js';
import { esc, clone } from './ui.js';
import { uid, now } from './songs.js';

export const MAX_FRET = 24;
export const LINKS = { h: 'Hammer-on', p: 'Pull-off', '/': 'Slide aufwärts', '\\': 'Slide abwärts' };
export const BEND_LABEL = { 0.5: '½', 1: 'voll', 1.5: '1½', 2: '2' };

export const newMeasure = (cols = 8, strings = 6) => ({ id: uid(), cols, notes: Array.from({ length: strings }, () => Array(cols).fill(null)), pm: Array(cols).fill(false) });
export const tabStrings = (tab) => tab?.measures?.[0]?.notes?.length || 6;

export function newTab(songId, name = 'Tab', strings = 6) {
  const t = now();
  return { id: uid(), songId, name, measures: [newMeasure(8, strings), newMeasure(8, strings)], createdAt: t, updatedAt: t };
}

export function cloneTab(tab, songId) {
  const c = clone(tab);
  c.id = uid();
  c.songId = songId;
  c.measures.forEach((m) => { m.id = uid(); });
  c.createdAt = c.updatedAt = now();
  return c;
}

export const loadTab = (id) => db.get('tabs', id);
export async function loadTabsOf(songId) { return (await db.getAll('tabs')).filter((t) => t.songId === songId); }
export function saveTab(tab) { tab.updatedAt = now(); db.saveLater('tabs', tab); }

export function flatCols(tab) {
  const out = [];
  tab.measures.forEach((m, mi) => { for (let c = 0; c < m.cols; c++) out.push([mi, c]); });
  return out;
}

const DEFAULT_LABELS = { 6: ['e', 'B', 'G', 'D', 'A', 'E'], 4: ['A', 'E', 'C', 'G'] };

// Saitennamen von oben nach unten. Passt die Stimmung nicht zur Saitenzahl, gilt die Standardstimmung.
export function stringLabels(tuning, strings = 6) {
  const notes = String(tuning || '').split(/\s+/).filter(Boolean);
  if (notes.length !== strings) return DEFAULT_LABELS[strings] || Array.from({ length: strings }, (_, i) => String(i + 1));
  const rev = notes.slice().reverse();
  const last = rev.length - 1;
  if (strings === 6 && rev[0].toUpperCase() === rev[last].toUpperCase()) rev[0] = rev[0][0].toLowerCase() + rev[0].slice(1);
  return rev;
}

export const noteText = (n) => (!n ? '' : n.x ? 'x' : n.f == null ? '' : String(n.f));
export const isEmptyTab = (tab) => tab.measures.every((m) => m.notes.every((row) => row.every((n) => !noteText(n))) && !m.pm.some(Boolean));

export function describeNote(n) {
  if (!n) return '';
  const parts = [n.x ? 'Dead Note' : `Bund ${n.f}`];
  if (n.l) parts.push(LINKS[n.l]);
  if (n.b) parts.push(`Bend ${BEND_LABEL[n.b]}`);
  if (n.v) parts.push('Vibrato');
  return parts.join(' · ');
}

// Nächste Note auf derselben Saite (für Hammer-on, Pull-off, Slide).
export function nextOnString(tab, flat, g, s) {
  for (let k = g + 1; k < flat.length; k++) {
    const [mi, c] = flat[k];
    if (noteText(tab.measures[mi].notes[s][c])) return k;
  }
  return -1;
}

// Breite einer Position in der kompakten Ansicht: leer = halb, zweistellige Bünde und Bögen bekommen mehr Platz
function colFactor(m, c) {
  let wide = 0, link = false, any = false;
  for (const row of m.notes) { const t = noteText(row[c]); if (!t) continue; any = true; wide = Math.max(wide, t.length); if (row[c].l) link = true; }
  if (!any) return 0.5;
  return 1 + (wide > 1 ? 0.3 : 0) + (link ? 0.25 : 0);
}

export function tabLayout(tab, o = {}) {
  const colW = o.colW || 22, rowH = o.rowH || 15, gap = o.gap ?? 10, labelW = o.labelW ?? 18, top = o.top ?? 26, bottom = o.bottom ?? 10;
  // compact (Ansicht): leere Positionen nur halb so breit – so passen lange Tabs auf den Bildschirm
  const bars = [], colX = [];
  let x = labelW;
  for (const m of tab.measures) {
    bars.push(x);
    let cx = x + gap / 2;
    for (let c = 0; c < m.cols; c++) { const w = o.compact ? colW * colFactor(m, c) : colW; colX.push(cx + w / 2); cx += w; }
    x = cx + gap / 2;
  }
  const flat = flatCols(tab);
  const strings = tabStrings(tab);
  return { colW, rowH, gap, labelW, top, bottom, bars, end: x, width: x + 2, height: top + rowH * (strings - 1) + bottom, flat, colX, strings, y: (s) => top + s * rowH };
}

export function tabSVG(tab, o = {}) {
  const L = tabLayout(tab, o);
  const { flat, colX, colW, rowH, top } = L;
  const fs = o.fs || Math.round(rowH * 0.8);
  const small = Math.round(fs * 0.68);
  const N = L.strings;
  const labels = stringLabels(o.tuning, N);
  const at = (g, s) => { const [mi, c] = flat[g]; return tab.measures[mi].notes[s][c]; };
  const pmAt = (g) => { const [mi, c] = flat[g]; return !!tab.measures[mi].pm[c]; };
  const annY = top - rowH * 0.5 - small * 0.45; // Zeile für Bend-/Vibrato-Angaben
  const pmY = Math.max(small, annY - small - 2);
  let s = `<svg class="tab-svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" font-size="${fs}">`;

  if (o.sel) {
    const { g1, g2, s1, s2 } = o.sel;
    s += `<rect class="tab-sel" x="${colX[g1] - colW / 2}" y="${L.y(s1) - rowH / 2}" width="${colX[g2] - colX[g1] + colW}" height="${(s2 - s1 + 1) * rowH}" rx="5"/>`;
  }
  if (o.cursor) {
    const x = colX[o.cursor.g];
    s += `<rect class="tab-curcol" x="${x - colW / 2}" y="${top - rowH / 2}" width="${colW}" height="${rowH * N}" rx="5"/>`;
  }
  for (let i = 0; i < N; i++) {
    s += `<line class="tab-line" x1="${L.labelW}" x2="${L.end}" y1="${L.y(i)}" y2="${L.y(i)}"/>`;
    s += `<text class="tab-label" x="${L.labelW / 2 - 1}" y="${L.y(i) + small * 0.36}" font-size="${small}" text-anchor="middle">${esc(labels[i])}</text>`;
  }
  [...L.bars, L.end].forEach((x, i) => {
    s += `<line class="tab-bar${i === L.bars.length ? ' end' : ''}" x1="${x}" x2="${x}" y1="${L.y(0)}" y2="${L.y(N - 1)}"/>`;
    if (i < L.bars.length && (tab.measures.length > 1 || o.mStart)) s += `<text class="tab-mnum" x="${x + 2}" y="${top - rowH * 0.5 - 1}" font-size="${Math.round(small * 0.85)}">${(o.mStart || 0) + i + 1}</text>`;
  });

  // Palm Mute als zusammenhängende Strecken
  for (let g = 0; g < flat.length; g++) {
    if (!pmAt(g)) continue;
    let e = g;
    while (e + 1 < flat.length && pmAt(e + 1)) e++;
    const x1 = colX[g] - colW / 2 + 1, x2 = colX[e] + colW / 2 - 1;
    s += `<text class="tab-pm" x="${x1}" y="${pmY}" font-size="${small}">P.M.</text>`;
    const tx = x1 + small * 2.3;
    if (x2 > tx + 2) s += `<path class="tab-pmline" d="M${tx} ${pmY - small * 0.32}H${x2}v${small * 0.5}"/>`;
    g = e;
  }

  for (let g = 0; g < flat.length; g++) {
    for (let st = 0; st < N; st++) {
      const n = at(g, st);
      const t = noteText(n);
      if (!t) continue;
      const x = colX[g], y = L.y(st);
      const w = t.length * fs * 0.6 + 4;
      s += `<rect class="tab-bg" x="${x - w / 2}" y="${y - fs * 0.6}" width="${w}" height="${fs * 1.2}" rx="2"/>`;
      s += `<text class="tab-num${n.x ? ' dead' : ''}" x="${x}" y="${y + fs * 0.35}" text-anchor="middle">${t}</text>`;
      if (n.l) {
        const g2 = nextOnString(tab, flat, g, st);
        const x1 = x + w / 2;
        const x2 = g2 >= 0 ? colX[g2] - (noteText(at(g2, st)).length * fs * 0.6 + 4) / 2 : x1 + colW * 0.55;
        if (n.l === 'h' || n.l === 'p') {
          const mid = (x1 + x2) / 2;
          s += `<path class="tab-arc" d="M${x1 - 1} ${y - fs * 0.5}Q${mid} ${y - fs * 1.25} ${x2 + 1} ${y - fs * 0.5}"/>`;
          s += `<text class="tab-tech" x="${mid}" y="${y - fs * 1.02}" font-size="${Math.round(small * 1.1)}" text-anchor="middle">${n.l}</text>`;
        } else {
          const d = fs * 0.32 * (n.l === '/' ? 1 : -1);
          s += `<path class="tab-slide" d="M${x1 + 1} ${y + d}L${x2 - 1} ${y - d}"/>`;
          if (x2 - x1 > fs * 1.4) s += `<text class="tab-tech" x="${(x1 + x2) / 2}" y="${y - fs * 0.62}" font-size="${Math.round(small * 0.9)}" text-anchor="middle">sl.</text>`;
        }
      }
      if (n.b) {
        const bx = x + w / 2, tipX = x + colW * 0.5, tipY = y - rowH * 0.95;
        s += `<path class="tab-bend" d="M${bx - 1} ${y}Q${tipX} ${y} ${tipX} ${tipY + 3}"/><path class="tab-bendhead" d="M${tipX - 2.6} ${tipY + 4.5}L${tipX} ${tipY}L${tipX + 2.6} ${tipY + 4.5}z"/>`;
        s += `<text class="tab-tech" x="${tipX + 2}" y="${tipY - 1}" font-size="${small}">${BEND_LABEL[n.b]}</text>`;
      }
      if (n.v) {
        const vx = x - colW * 0.36, seg = colW * 0.18;
        let d = `M${vx} ${annY}`;
        for (let k = 0; k < 4; k++) d += `q${seg / 2} ${k % 2 ? 3 : -3} ${seg} 0`;
        s += `<path class="tab-vib" d="${d}"/>`;
      }
    }
  }
  if (o.cursor) {
    const x = colX[o.cursor.g], y = L.y(o.cursor.s);
    s += `<rect class="tab-curcell" x="${x - colW / 2 + 1.5}" y="${y - rowH / 2 + 1.5}" width="${colW - 3}" height="${rowH - 3}" rx="5"/>`;
  }
  return s + '</svg>';
}

// Ganze Takte je Zeile, so viele wie in die Breite passen
export function tabLines(tab, width, o = {}) {
  const lines = [];
  let cur = [], start = 0;
  tab.measures.forEach((m, i) => {
    if (cur.length && tabLayout({ ...tab, measures: [...cur, m] }, o).width > width) { lines.push({ start, measures: cur }); cur = []; start = i; }
    cur.push(m);
  });
  if (cur.length) lines.push({ start, measures: cur });
  return lines;
}

const TECH = [['h', 'Hammer-on'], ['p', 'Pull-off'], ['/', 'Slide hoch'], ['\\', 'Slide runter'], ['b', 'Bend'], ['~', 'Vibrato'], ['x', 'Dead Note'], ['P.M.', 'Palm Mute']];
// Nur die Zeichen erklären, die im Tab vorkommen
export function tabLegend(tab) {
  const used = new Set();
  for (const m of tab.measures) {
    if (m.pm.some(Boolean)) used.add('P.M.');
    for (const row of m.notes) for (const n of row) {
      if (!n) continue;
      if (n.l) used.add(n.l);
      if (n.b) used.add('b');
      if (n.v) used.add('~');
      if (n.x) used.add('x');
    }
  }
  return TECH.filter(([k]) => used.has(k));
}

// Tab für die Ansicht: bricht in Zeilen um, statt seitlich zu scrollen, und erklärt die Techniken darunter
export function tabView(tab, o = {}) {
  const el = document.createElement('div');
  el.className = 'tab-view';
  const opts = { compact: true, ...o };
  const legend = o.legend === false ? [] : tabLegend(tab);
  let lastW = 0;
  const draw = (width) => {
    if (Math.abs(width - lastW) < 4) return;
    lastW = width;
    const lines = tabLines(tab, width, opts);
    el.innerHTML = lines.map((ln) => `<div class="tab-row">${tabSVG({ ...tab, measures: ln.measures }, { ...opts, mStart: lines.length > 1 ? ln.start : 0 })}</div>`).join('')
      + (legend.length ? `<div class="tab-legend">${legend.map(([k, t]) => `<span><b>${esc(k)}</b> ${t}</span>`).join('')}</div>` : '');
  };
  draw(Math.max(240, (o.width || window.innerWidth) - 72));
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      if (!el.isConnected) { ro.disconnect(); return; }
      if (el.clientWidth) draw(el.clientWidth);
    });
    ro.observe(el);
  }
  return el;
}

// Noten mit Techniken als Kürzel: „5h“, „7b“, „x“
const noteToken = (n) => (!noteText(n) ? '' : noteText(n) + (n.l || '') + (n.b ? 'b' : '') + (n.v ? '~' : ''));

// Tab als ASCII (zum Bearbeiten als Text und für die KI-Vorschau). Alle Positionen gleich breit, damit beim
// Zurücklesen leere Positionen erhalten bleiben; perBlock = Takte je Zeilen-Block (fürs Handy).
export function tabToText(tab, tuning, { perBlock = 0 } = {}) {
  const n = tabStrings(tab);
  const labels = stringLabels(tuning, n);
  const w = Math.max(1, ...tab.measures.flatMap((m) => m.notes.flatMap((row) => row.map((x) => noteToken(x).length)))) + 1;
  const size = perBlock || tab.measures.length;
  const blocks = [];
  for (let i = 0; i < tab.measures.length; i += size) {
    const lw = Math.max(...labels.map((l) => l.length));
    const rows = labels.map((l) => l.padEnd(lw) + '|');
    for (const m of tab.measures.slice(i, i + size)) {
      for (let c = 0; c < m.cols; c++) m.notes.forEach((row, s) => { rows[s] += (noteToken(row[c]) || '-').padEnd(w, '-'); });
      rows.forEach((_, s) => { rows[s] += '|'; });
    }
    blocks.push(rows.join('\n'));
  }
  return blocks.join('\n\n');
}

// Tab als Schritte (Format der KI): ein Eintrag je Takt, „Saite-Bund“, gleichzeitige Noten mit +, Saite 1 = oben
export function tabToSteps(tab) {
  return tab.measures.map((m) => Array.from({ length: m.cols }, (_, c) => {
    const notes = m.notes.map((row, s) => (noteText(row[c]) ? `${s + 1}-${noteToken(row[c])}` : '')).filter(Boolean);
    return notes.length ? notes.join('+') : '-';
  }).join(' '));
}
