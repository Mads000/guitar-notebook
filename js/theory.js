// Musiktheorie zum Nachschlagen beim Spielen: Quintenzirkel (interaktiv, mit Tonart des Songs, Akkorden der Tonart,
// typischen Folgen und Capo-Rechner), Tonleitern auf dem Griffbrett (mit Positionen) und das CAGED-System.
// Alles wird aus wenigen Regeln berechnet – für jede Tonart, Gitarre und Ukulele, in der Stimmung des Songs.
import { h, fill, sheet, icon, toast, segmented } from './ui.js';
import { findChord, diagramSVG } from './chords.js';
import { instrumentOf, songTuning } from './songs.js';
import { openPitches } from './tabplayer.js';

// ---------- Grundlagen ----------
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DE = { C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', A: 'A', B: 'H' }; // deutsche Bezeichnung (H statt B)
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]); // F, Bb, Eb, Ab, Db-Dur (und ihre Moll-Parallelen) mit b
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
const mod = (n) => ((n % 12) + 12) % 12;
const noteName = (pc, flats) => (flats ? FLAT : SHARP)[mod(pc)];
const pretty = (n) => n.replace('#', '♯').replace(/([A-G])b/, '$1♭');

export function parseChord(name) {
  const m = String(name || '').trim().match(/^([A-H])([#b♯♭]?)(.*)$/);
  if (!m) return null;
  const pc = mod(PC[m[1]] + (/[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0));
  const rest = m[3].split('/')[0];
  return { pc, minor: /^m(?!aj)/.test(rest), dim: /dim|°|m7b5|ø/.test(rest), sus: /sus|^5$/.test(rest) };
}

// Tonarten: Dur-Stufen und natürliches Moll
const MAJ = { iv: [0, 2, 4, 5, 7, 9, 11], q: ['', 'm', 'm', '', '', 'm', 'dim'], num: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] };
const MIN = { iv: [0, 2, 3, 5, 7, 8, 10], q: ['m', 'dim', '', 'm', 'm', '', ''], num: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] };
// Tonart = { pc: Grundton, minor }. Vorzeichen richten sich nach der Dur-Parallele.
const majorOf = (k) => (k.minor ? mod(k.pc + 3) : k.pc);
const flatsOf = (k) => FLAT_KEYS.has(majorOf(k));
const keyName = (k) => `${pretty(noteName(k.pc, flatsOf(k)))}${k.minor ? '-Moll' : '-Dur'}`;
const keyShort = (k) => `${pretty(noteName(k.pc, flatsOf(k)))}${k.minor ? 'm' : ''}`;
function accidentals(k) {
  const i = FIFTHS.indexOf(majorOf(k));
  return i === 0 ? 'keine Vorzeichen' : i <= 6 ? `${i} ♯` : `${12 - i} ♭`;
}
export function keyChords(k) {
  const t = k.minor ? MIN : MAJ;
  return t.iv.map((iv, d) => ({ num: t.num[d], name: noteName(k.pc + iv, flatsOf(k)) + t.q[d], deg: d }));
}

// Tonart aus den Akkorden eines Songs schätzen: Wie viele Akkorde passen in die Tonart? Anfang und Ende zählen extra.
export function detectKey(names) {
  const chords = names.map(parseChord).filter(Boolean);
  if (!chords.length) return null;
  let best = null;
  for (let pc = 0; pc < 12; pc++) {
    let score = 0;
    for (const c of chords) {
      const d = MAJ.iv.indexOf(mod(c.pc - pc));
      if (d < 0) continue;
      const want = MAJ.q[d];
      score += c.sus || (want === 'm') === c.minor || (want === 'dim' && (c.dim || c.minor)) ? 1 : 0.35;
    }
    const first = chords[0], last = chords[chords.length - 1];
    // Anfang und Ende auf dem Grundton – oder auf der Moll-Parallele (Moll-Songs)
    const tonic = (c) => (c.pc === pc && !c.minor) || (c.pc === mod(pc + 9) && c.minor);
    if (tonic(first)) score += 0.6;
    if (tonic(last)) score += 0.6;
    if (!best || score > best.score) best = { pc, score };
  }
  // Moll, wenn der Song auf der Moll-Parallele beginnt oder endet
  const rel = mod(best.pc + 9);
  const first = chords[0], last = chords[chords.length - 1];
  const minor = (first.pc === rel && first.minor) || (last.pc === rel && last.minor && !(first.pc === best.pc && !first.minor));
  return { pc: minor ? rel : best.pc, minor, fit: Math.min(1, best.score / chords.length) };
}

const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // Dur-Tonarten im Quintenzirkel ab C im Uhrzeigersinn

// Typische Akkordfolgen (als Stufen)
const PROGS = {
  major: [['Pop', [0, 4, 5, 3]], ['Traurig-Pop', [5, 3, 0, 4]], ['Doo-Wop / 50er', [0, 5, 3, 4]], ['Rock / Folk', [0, 3, 4]], ['Ballade', [0, 2, 3, 4]], ['Jazz', [1, 4, 0]],
    ['12-Takt-Blues', [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4]]],
  minor: [['Episch', [0, 5, 2, 6]], ['Moll-Klassiker', [0, 3, 4]], ['Rock-Moll', [0, 6, 5, 6]], ['Andalusisch', [0, 6, 5, 4]], ['Moll-Pop', [0, 3, 6, 2]]],
};

// Leichte Griffe für den Capo-Rechner
const EASY = { guitar: ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm'], ukulele: ['C', 'G', 'F', 'D', 'A', 'Am', 'Dm', 'Em'] };

// ---------- Griffbrett ----------
// open: Leersaiten (MIDI) von oben (höchste Saite) nach unten, dots: { s, f, text, cls, faint }
function neckSVG({ open, frets, dots, bands = [] }) {
  const N = open.length, ow = 34, fw = 44, rh = 26, top = bands.length ? 34 : 18, left = 22;
  const W = left + ow + frets * fw + 8, H = top + rh * (N - 1) + 30;
  const fx = (f) => (f === 0 ? left + ow / 2 - 2 : left + ow + (f - 0.5) * fw);
  const y = (s) => top + s * rh;
  let o = `<svg class="neck-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  for (const b of bands) {
    const x1 = fx(b.from) - fw / 2 + 2, x2 = fx(b.to) + fw / 2 - 2;
    o += `<rect class="neck-band ${b.cls}" x="${x1}" y="${top - 16}" width="${x2 - x1}" height="${rh * (N - 1) + 32}" rx="10"/>`;
    o += `<text class="neck-band-t ${b.cls}" x="${(x1 + x2) / 2}" y="${top - 21}" text-anchor="middle">${b.label}</text>`;
  }
  [3, 5, 7, 9, 15].filter((f) => f <= frets).forEach((f) => { o += `<circle class="neck-inlay" cx="${fx(f)}" cy="${y(0) + (rh * (N - 1)) / 2}" r="4"/>`; });
  if (frets >= 12) [-1, 1].forEach((d) => { o += `<circle class="neck-inlay" cx="${fx(12)}" cy="${y(0) + (rh * (N - 1)) / 2 + d * rh}" r="4"/>`; });
  o += `<line class="neck-nut" x1="${left + ow}" x2="${left + ow}" y1="${y(0)}" y2="${y(N - 1)}"/>`;
  for (let f = 1; f <= frets; f++) o += `<line class="neck-fret" x1="${left + ow + f * fw}" x2="${left + ow + f * fw}" y1="${y(0)}" y2="${y(N - 1)}"/>`;
  open.forEach((p, s) => {
    o += `<line class="neck-string" x1="${left + ow}" x2="${W - 8}" y1="${y(s)}" y2="${y(s)}"/>`;
    o += `<text class="neck-label" x="${left / 2}" y="${y(s) + 4}" text-anchor="middle">${pretty(noteName(p, false))}</text>`;
  });
  [0, 3, 5, 7, 9, 12, 15].filter((f) => f <= frets).forEach((f) => { o += `<text class="neck-num" x="${fx(f)}" y="${H - 6}" text-anchor="middle">${f}</text>`; });
  for (const d of dots) {
    o += `<g class="neck-dot ${d.cls || ''}${d.faint ? ' faint' : ''}"><circle cx="${fx(d.f)}" cy="${y(d.s)}" r="11"/>`;
    o += `<text x="${fx(d.f)}" y="${y(d.s) + 4}" text-anchor="middle">${d.text}</text></g>`;
  }
  return o + '</svg>';
}
const IV_LABEL = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
const ivClass = (iv) => (iv === 0 ? 'root' : iv === 3 || iv === 4 ? 'third' : iv === 7 ? 'fifth' : iv === 6 ? 'blue' : '');

// ---------- Tonleitern ----------
const SCALES = [
  ['minpent', 'Moll-Pentatonik', [0, 3, 5, 7, 10], 'Die Solo-Tonleiter für Rock und Pop.'],
  ['majpent', 'Dur-Pentatonik', [0, 2, 4, 7, 9], 'Hell und melodisch, für Soli und Fills in Dur-Songs.'],
  ['blues', 'Blues', [0, 3, 5, 6, 7, 10], 'Moll-Pentatonik plus „Blue Note“ (♭5).'],
  ['major', 'Dur', [0, 2, 4, 5, 7, 9, 11], 'Die Grundlage aller Akkorde einer Dur-Tonart.'],
  ['minor', 'Moll', [0, 2, 3, 5, 7, 8, 10], 'Natürliches Moll – traurig, ruhig.'],
  ['harm', 'Harmonisch Moll', [0, 2, 3, 5, 7, 8, 11], 'Moll mit großer Septime – klingt orientalisch, klassisch.'],
  ['dorian', 'Dorisch', [0, 2, 3, 5, 7, 9, 10], 'Moll mit heller Sexte – cool, funky.'],
  ['mixo', 'Mixolydisch', [0, 2, 4, 5, 7, 9, 10], 'Dur mit kleiner Septime – bluesiger Rock.'],
];

// Moll- und Dur-Pentatonik (bzw. Moll und Dur) einer Paralleltonart haben dieselben Töne
function relHint(scale, root, flats) {
  const up = pretty(noteName(root + 3, flats)), down = pretty(noteName(root + 9, flats));
  if (scale === 'minpent') return ` Gleiche Töne wie ${up}-Dur-Pentatonik – über einen Song in ${up}-Dur klingt sie hell, über ${pretty(noteName(root, flats))}-Moll dunkel.`;
  if (scale === 'majpent') return ` Gleiche Töne wie ${down}-Moll-Pentatonik (gleiche Griffbilder, anderer Grundton).`;
  if (scale === 'major') return ` Gleiche Töne wie ${down}-Moll.`;
  if (scale === 'minor') return ` Gleiche Töne wie ${up}-Dur.`;
  return '';
}

// Positionen: 2 Töne je Saite (Pentatonik) bzw. 3 (siebentönig), Start auf der tiefsten Saite bei Stufe n
function scaleBox(open, root, ivs, n) {
  const base = ivs.length === 6 ? [0, 3, 5, 7, 10] : ivs; // Blues: Positionen der Moll-Pentatonik, ♭5 kommt dazu
  const nps = base.length === 5 ? 2 : 3;
  const low = open.length - 1;
  const startPc = mod(root + base[n]);
  const f0 = mod(startPc - open[low]);
  const pitches = [];
  for (let p = open[low] + f0; pitches.length < nps * open.length; p++) if (base.includes(mod(p - root))) pitches.push(p);
  const cells = [];
  for (let k = 0, s = low; s >= 0; s--, k++) for (const p of pitches.slice(k * nps, k * nps + nps)) cells.push({ s, f: p - open[s] });
  if (cells.some((c) => c.f < 0)) cells.forEach((c) => { c.f += 12; });
  const fs = cells.map((c) => c.f);
  return { cells, from: Math.min(...fs), to: Math.max(...fs) };
}

// ---------- CAGED ----------
// Offene Grundformen (Bünde von der tiefsten Saite, -1 = nicht spielen) und ihr Grundton
const CAGED = {
  guitar: {
    major: { C: [[-1, 3, 2, 0, 1, 0], 0], A: [[-1, 0, 2, 2, 2, 0], 9], G: [[3, 2, 0, 0, 0, 3], 7], E: [[0, 2, 2, 1, 0, 0], 4], D: [[-1, -1, 0, 2, 3, 2], 2] },
    minor: { C: [[-1, 3, 1, 0, 1, -1], 0], A: [[-1, 0, 2, 2, 1, 0], 9], G: [[3, 1, 0, 0, 3, 3], 7], E: [[0, 2, 2, 0, 0, 0], 4], D: [[-1, -1, 0, 2, 3, 1], 2] },
  },
  ukulele: {
    major: { C: [[0, 0, 0, 3], 0], A: [[2, 1, 0, 0], 9], G: [[0, 2, 3, 2], 7], E: [[1, 4, 0, 2], 4], D: [[2, 2, 2, 0], 2] },
    minor: { C: [[0, 3, 3, 3], 0], A: [[2, 0, 0, 0], 9], G: [[0, 2, 3, 1], 7], E: [[0, 4, 3, 2], 4], D: [[2, 2, 1, 0], 2] },
  },
};
const SHAPE_CLS = { C: 'sh-c', A: 'sh-a', G: 'sh-g', E: 'sh-e', D: 'sh-d' };
function cagedShapes(inst, root, minor) {
  const set = CAGED[inst === 'ukulele' ? 'ukulele' : 'guitar'][minor ? 'minor' : 'major'];
  return Object.entries(set).map(([letter, [frets, pc]]) => {
    const off = mod(root - pc);
    const abs = frets.map((f) => (f < 0 ? -1 : f + off));
    return { letter, off, frets: abs };
  }).sort((a, b) => a.off - b.off);
}

// ---------- Oberfläche ----------
/**
 * Öffnet die Musiktheorie. song (optional): Tonart, Instrument und Stimmung kommen aus dem Song;
 * onAdd(names): Akkordfolge in den Song übernehmen.
 */
export function openTheory({ song = null, onAdd = null } = {}) {
  const inst = song ? instrumentOf(song) : (localStorage.getItem('gn-theory-inst') === 'ukulele' ? 'ukulele' : 'guitar');
  const state = { inst, tab: 'circle', key: { pc: 7, minor: false }, scale: 'minpent', sRoot: 9, pos: -1, labels: 'iv', cRoot: 0, cMinor: false, cShape: 'all' };
  const tuning = () => (song && instrumentOf(song) === state.inst ? songTuning(song) : '');
  const open = () => openPitches(tuning(), state.inst === 'ukulele' ? 4 : 6, 0);
  const stdTuning = () => !tuning() || tuning() === (state.inst === 'ukulele' ? 'G C E A' : 'E A D G B E');

  // Tonart des Songs
  let songKey = null;
  if (song) {
    const names = song.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'chords').flatMap((b) => b.items.map((i) => i.name)));
    songKey = detectKey(names);
    if (songKey) { state.key = { pc: songKey.pc, minor: songKey.minor }; state.sRoot = songKey.minor ? songKey.pc : mod(songKey.pc + 9); state.cRoot = songKey.pc; state.cMinor = songKey.minor; }
  }

  const body = h('div', { class: 'theory' });
  const pane = h('div');
  const tabs = segmented([{ value: 'circle', label: 'Quintenzirkel' }, { value: 'scales', label: 'Tonleitern' }, { value: 'caged', label: 'CAGED' }], state.tab, (v) => { state.tab = v; draw(); });
  const instSeg = !song && segmented([{ value: 'guitar', label: 'Gitarre' }, { value: 'ukulele', label: 'Ukulele' }], state.inst, (v) => {
    state.inst = v;
    try { localStorage.setItem('gn-theory-inst', v); } catch { /* egal */ }
    draw();
  });
  fill(body, h('div', { class: 'th-top' }, tabs, instSeg), pane);

  const pills = (items, cur, onPick, cls = '') => h('div', { class: 'pills th-pills ' + cls }, items.map(([v, l]) => h('button', { class: 'pill' + (v === cur ? ' accent' : ''), 'aria-pressed': String(v === cur), onClick: () => onPick(v) }, l)));
  const rootPills = (cur, onPick, flats = false) => pills(Array.from({ length: 12 }, (_, pc) => [pc, pretty(noteName(pc, flats))]), cur, onPick, 'roots');
  const chordCard = (name, label) => {
    const ch = findChord(name, null, state.inst);
    return h('div', { class: 'th-chord' }, label && h('div', { class: 'th-num' }, label),
      ch ? h('div', { class: 'chord-card mini', html: diagramSVG({ ...ch, name }) }) : h('div', { class: 'th-noshape' }, pretty(name)));
  };

  // ---------- Quintenzirkel ----------
  function circleSVG() {
    const k = state.key, maj = majorOf(k);
    const i0 = FIFTHS.indexOf(maj);
    const near = (i) => [mod(i0 - 1), i0, mod(i0 + 1)].includes(i);
    const cx = 160, cy = 160;
    const arc = (r1, r2, a1, a2) => {
      const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      const [x1, y1] = p(r2, a1), [x2, y2] = p(r2, a2), [x3, y3] = p(r1, a2), [x4, y4] = p(r1, a1);
      return `M${x1} ${y1}A${r2} ${r2} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 0 ${x4} ${y4}z`;
    };
    let o = `<svg class="circle-svg" viewBox="0 0 320 320" width="320" height="320">`;
    FIFTHS.forEach((pc, i) => {
      const a1 = ((i * 30 - 105) * Math.PI) / 180, a2 = ((i * 30 - 75) * Math.PI) / 180, am = ((i * 30 - 90) * Math.PI) / 180;
      const flats = FLAT_KEYS.has(pc);
      const mn = mod(pc + 9);
      const numOut = near(i) ? (k.minor ? ['VI', 'III', 'VII'] : ['IV', 'I', 'V'])[mod(i - i0 + 1)] : '';
      const numIn = near(i) ? (k.minor ? ['iv', 'i', 'v'] : ['ii', 'vi', 'iii'])[mod(i - i0 + 1)] : '';
      const selOut = !k.minor && i === i0, selIn = k.minor && i === i0;
      o += `<path class="cf-seg out${near(i) ? ' in-key' : ''}${selOut ? ' sel' : ''}" data-i="${i}" data-r="out" d="${arc(104, 152, a1, a2)}"/>`;
      o += `<path class="cf-seg inner${near(i) ? ' in-key' : ''}${selIn ? ' sel' : ''}" data-i="${i}" data-r="in" d="${arc(64, 102, a1, a2)}"/>`;
      const t = (r, s, cls) => `<text class="${cls}" x="${cx + r * Math.cos(am)}" y="${cy + r * Math.sin(am)}" text-anchor="middle" dominant-baseline="central">${s}</text>`;
      o += t(130, pretty(pc === 6 ? 'F#' : noteName(pc, flats)), 'cf-t out' + (selOut ? ' sel' : ''));
      o += t(84, pretty(noteName(mn, flats)) + 'm', 'cf-t inner' + (selIn ? ' sel' : ''));
      if (numOut) o += t(145, numOut, 'cf-num');
      if (numIn) o += t(70, numIn, 'cf-num');
    });
    o += `<text class="cf-center" x="160" y="152" text-anchor="middle">${keyShort(k)}</text>`;
    o += `<text class="cf-sub" x="160" y="174" text-anchor="middle">${accidentals(k)}</text>`;
    return o + '</svg>';
  }
  function drawCircle() {
    const k = state.key;
    const chords = keyChords(k);
    const circ = h('div', { class: 'cf-wrap', html: circleSVG() });
    circ.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-i]');
      if (!seg) return;
      const pc = FIFTHS[Number(seg.dataset.i)];
      state.key = seg.dataset.r === 'in' ? { pc: mod(pc + 9), minor: true } : { pc, minor: false };
      state.cRoot = state.key.pc; state.cMinor = state.key.minor;
      state.sRoot = state.key.minor ? state.key.pc : mod(state.key.pc + 9);
      draw();
    });
    const rel = k.minor ? { pc: mod(k.pc + 3), minor: false } : { pc: mod(k.pc + 9), minor: true };
    const capo = song?.capo || 0;
    const progs = PROGS[k.minor ? 'minor' : 'major'].map(([label, degs]) => {
      const names = degs.map((d) => chords[d].name);
      const shown = degs.length > 6 ? names.filter((n, i) => i === 0 || n !== names[i - 1]) : names;
      return h('div', { class: 'th-prog' },
        h('div', { class: 'th-prog-t' }, h('b', null, label), h('span', null, degs.map((d) => chords[d].num).join(' – '))),
        h('div', { class: 'th-prog-c' }, shown.map(pretty).join('  ')),
        onAdd && h('button', { class: 'icon-btn', 'aria-label': `${label} in den Song übernehmen`, onClick: () => { onAdd(names); toast(`„${label}“ als neuer Abschnitt im Song`); } }, icon('plus', 'small')));
    });
    // Capo-Rechner: Welche Griffe ergeben mit Capo die gewählte Tonart?
    const easy = EASY[state.inst];
    const capoRows = Array.from({ length: 8 }, (_, c) => {
      const shape = { pc: mod(k.pc - c), minor: k.minor };
      const nm = noteName(shape.pc, false).replace('A#', 'Bb').replace('D#', 'Eb').replace('G#', 'Ab') + (k.minor ? 'm' : '');
      const ok = easy.includes(nm);
      return h('div', { class: 'th-capo' + (ok ? ' easy' : '') }, h('span', null, c ? `Capo ${c}` : 'Ohne Capo'), h('b', null, `${pretty(nm)}-Griffe`), ok && h('span', { class: 'th-easy' }, 'leicht'));
    });
    fill(pane,
      songKey && h('div', { class: 'th-songkey' }, icon('music', 'small'),
        h('div', null,
          h('b', null, `${song.title}: wahrscheinlich ${keyName(songKey)}`),
          h('small', null, capo ? `Gegriffen in ${keyShort(songKey)} – mit Capo ${capo} klingt es in ${keyShort({ pc: mod(songKey.pc + capo), minor: songKey.minor })}.` : 'Erkannt aus den Akkorden des Songs.'))),
      circ,
      h('p', { class: 'hint th-center' }, 'Tippe eine Tonart an: außen Dur, innen Moll. Hervorgehoben sind die Akkorde, die in der Tonart zusammenpassen.'),
      h('div', { class: 'form-label' }, `Akkorde in ${keyName(k)}`),
      h('div', { class: 'th-chords' }, chords.map((c) => chordCard(c.name, c.num))),
      h('p', { class: 'form-foot' }, `Parallele: ${keyName(rel)} – gleiche Akkorde, anderer Grundton. ${k.minor ? 'In Moll wird die v oft zur Dur-V (z. B. E statt Em in a-Moll).' : 'Die vii° (vermindert) kommt in Pop-Songs selten vor.'}`),
      h('div', { class: 'form-label' }, 'Typische Akkordfolgen'),
      h('div', { class: 'th-progs' }, progs),
      h('div', { class: 'form-label' }, `Capo-Rechner: ${keyName(k)} spielen mit …`),
      h('div', { class: 'th-capos' }, capoRows),
      h('p', { class: 'form-foot' }, 'Der Capo verschiebt alles nach oben: Mit Capo 2 klingen G-Griffe wie A. So spielt man Songs in schweren Tonarten mit leichten Griffen – z. B. viele Oasis-Songs mit Capo 2.'));
  }

  // ---------- Tonleitern ----------
  function drawScales() {
    const [, label, ivs, desc] = SCALES.find((x) => x[0] === state.scale);
    const op = open();
    const frets = state.inst === 'ukulele' ? 12 : 15;
    const flats = FLAT_KEYS.has(state.sRoot) || (ivs.includes(3) && FLAT_KEYS.has(mod(state.sRoot + 3)));
    const canBox = state.inst !== 'ukulele' && stdTuning();
    const nBoxes = (ivs.length === 6 ? 5 : ivs.length);
    if (!canBox || state.pos >= nBoxes) state.pos = -1;
    const box = state.pos >= 0 ? scaleBox(op, state.sRoot, ivs, state.pos) : null;
    const inBox = (s, f) => !box || box.cells.some((c) => c.s === s && c.f === f) || (ivs.length === 6 && f >= box.from && f <= box.to && mod(op[s] + f - state.sRoot) === 6);
    const dots = [];
    op.forEach((p, s) => {
      for (let f = 0; f <= frets; f++) {
        const iv = mod(p + f - state.sRoot);
        if (!ivs.includes(iv)) continue;
        dots.push({ s, f, text: state.labels === 'iv' ? IV_LABEL[iv] : pretty(noteName(p + f, flats)), cls: ivClass(iv), faint: !inBox(s, f) });
      }
    });
    const bands = box ? [{ from: box.from, to: box.to, label: `Position ${state.pos + 1}`, cls: 'sh-pos' }] : [];
    fill(pane,
      h('div', { class: 'form-label' }, 'Grundton'),
      rootPills(state.sRoot, (v) => { state.sRoot = v; draw(); }, flats),
      h('div', { class: 'form-label' }, 'Tonleiter'),
      pills(SCALES.map(([v, l]) => [v, l]), state.scale, (v) => { state.scale = v; state.pos = -1; draw(); }),
      canBox && h('div', { class: 'form-label' }, 'Position'),
      canBox && pills([[-1, 'Ganzer Hals'], ...Array.from({ length: nBoxes }, (_, i) => [i, String(i + 1)])], state.pos, (v) => { state.pos = v; draw(); }),
      h('div', { class: 'th-neck-head' }, h('b', null, `${pretty(noteName(state.sRoot, flats))} ${label}`),
        segmented([{ value: 'iv', label: 'Stufen' }, { value: 'notes', label: 'Töne' }], state.labels, (v) => { state.labels = v; draw(); })),
      h('div', { class: 'neck-scroll', html: neckSVG({ open: op, frets, dots, bands }) }),
      h('div', { class: 'th-legend' }, h('span', { class: 'lg root' }, 'Grundton'), h('span', { class: 'lg third' }, 'Terz'), h('span', { class: 'lg fifth' }, 'Quinte'), ivs.includes(6) && h('span', { class: 'lg blue' }, 'Blue Note')),
      h('p', { class: 'form-foot' }, `${desc}${relHint(state.scale, state.sRoot, flats)} Töne: ${ivs.map((iv) => pretty(noteName(state.sRoot + iv, flats))).join(' ')}.${box ? ` Position ${state.pos + 1}: Bund ${box.from}–${box.to}, gut zum Üben auf und ab.` : canBox ? ' Mit „Position“ zeigst du die Griff-Kästen einzeln.' : ''}`));
    pane.querySelector('.neck-scroll')?.scrollTo({ left: box ? Math.max(0, (box.from - 1) * 44) : 0 });
  }

  // ---------- CAGED ----------
  function drawCaged() {
    const std = stdTuning();
    const op = std ? open() : openPitches('', state.inst === 'ukulele' ? 4 : 6, 0); // CAGED gilt für die Standardstimmung
    const frets = 15;
    const shapes = cagedShapes(state.inst, state.cRoot, state.cMinor);
    const flats = FLAT_KEYS.has(state.cMinor ? mod(state.cRoot + 3) : state.cRoot);
    const name = noteName(state.cRoot, flats) + (state.cMinor ? 'm' : '');
    const lowestString = op.length - 1;
    const show = shapes.filter((s) => state.cShape === 'all' || s.letter === state.cShape);
    const dots = [], seen = new Set();
    for (const sh of show) {
      sh.frets.forEach((f, i) => {
        const s = lowestString - i; // Grundformen sind von der tiefsten Saite aus notiert
        if (f < 0 || f > frets) return;
        const key = `${s}:${f}`;
        if (seen.has(key)) return;
        seen.add(key);
        const iv = mod(op[s] + f - state.cRoot);
        dots.push({ s, f, text: iv === 0 ? 'R' : iv === 7 ? '5' : iv === 3 || iv === 4 ? '3' : IV_LABEL[iv], cls: SHAPE_CLS[sh.letter] + (iv === 0 ? ' root' : '') });
      });
    }
    const bands = show.map((sh) => {
      const fs = sh.frets.filter((f) => f >= 0);
      return { from: Math.min(...fs), to: Math.max(...fs), label: `${sh.letter}-Form`, cls: SHAPE_CLS[sh.letter] };
    }).filter((b) => b.to <= frets);
    const diag = (sh) => {
      const fretted = sh.frets.filter((f) => f > 0);
      const base = !fretted.length || Math.max(...fretted) <= 4 ? 1 : Math.min(...fretted);
      return h('div', { class: 'th-chord' }, h('div', { class: 'th-num ' + SHAPE_CLS[sh.letter] }, `${sh.letter}-Form · Bund ${sh.off}`),
        h('div', { class: 'chord-card mini', html: diagramSVG({ name: pretty(name), frets: sh.frets, fingers: sh.frets.map(() => 0), base }) }));
    };
    fill(pane,
      h('p', { class: 'pane-intro' }, `Jeder Akkord lässt sich mit fünf Grundformen (C, A, G, E, D) an fünf Stellen am Hals greifen. Hier: ${pretty(name)} – von unten nach oben ${shapes.map((s) => `${s.letter} (Bund ${s.off})`).join(' → ')}.`),
      !std && h('p', { class: 'hint' }, 'Hinweis: Der Song hat eine andere Stimmung – die Formen gelten für die Standardstimmung.'),
      h('div', { class: 'form-label' }, 'Akkord'),
      rootPills(state.cRoot, (v) => { state.cRoot = v; draw(); }, flats),
      h('div', { class: 'th-row' }, segmented([{ value: false, label: 'Dur' }, { value: true, label: 'Moll' }], state.cMinor, (v) => { state.cMinor = v; draw(); })),
      h('div', { class: 'form-label' }, 'Form'),
      pills([['all', 'Alle'], ...['C', 'A', 'G', 'E', 'D'].map((l) => [l, l])], state.cShape, (v) => { state.cShape = v; draw(); }, 'shapes'),
      h('div', { class: 'neck-scroll', html: neckSVG({ open: op, frets, dots, bands }) }),
      h('div', { class: 'th-legend' }, h('span', { class: 'lg root' }, 'R = Grundton'), h('span', null, '3 = Terz · 5 = Quinte')),
      h('div', { class: 'form-label' }, 'Die fünf Griffe'),
      h('div', { class: 'th-chords' }, shapes.map(diag)),
      h('p', { class: 'form-foot' }, 'Tipp: Lerne zuerst die E- und A-Form (Barré-Griffe) – damit kannst du jeden Dur- und Moll-Akkord spielen. Die Formen gehen nahtlos ineinander über: wo eine endet, beginnt die nächste.'));
  }

  function draw() {
    if (state.tab === 'circle') drawCircle();
    else if (state.tab === 'scales') drawScales();
    else drawCaged();
  }
  draw();
  return sheet({ title: 'Musiktheorie', body, full: true, right: { label: 'Fertig', bold: true } });
}
