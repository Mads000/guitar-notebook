// Musiktheorie zum Nachschlagen beim Spielen: Quintenzirkel (interaktiv, mit Tonart des Songs, Akkorden der Tonart,
// typischen Folgen und Capo-Rechner), Tonleitern auf dem Griffbrett (mit Positionen) und das CAGED-System.
// Alles wird aus wenigen Regeln berechnet – für jede Tonart, Gitarre und Ukulele, in der Stimmung des Songs.
import { h, fill, sheet, icon, toast, segmented } from './ui.js';
import { findChord, diagramSVG } from './chords.js';
import { instrumentOf, songTuning } from './songs.js';
import { openPitches } from './tabplayer.js';
import { spellNotes, stepsOfFormula, prettyNote as pretty } from './notes.js';

// ---------- Grundlagen ----------
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]); // F, Bb, Eb, Ab, Db-Dur (und ihre Moll-Parallelen) mit b
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
const mod = (n) => ((n % 12) + 12) % 12;
const noteName = (pc, flats) => (flats ? FLAT : SHARP)[mod(pc)];
// Feste Grundton-Knöpfe: Der Name im Ergebnis richtet sich nach Tonart und Akkord
const ROOT_BTN = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];

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
const keyNotes = (k) => spellNotes(k.pc, (k.minor ? MIN : MAJ).iv);
const rootOf = (k) => keyNotes(k)[0];
// Im Fließtext steht Moll als „Bm“: „B-Moll“ wird im Deutschen als B♭-Moll gelesen. Aus demselben Grund „B (Dur)“.
const keyName = (k) => (k.minor ? `${pretty(rootOf(k))}m` : rootOf(k) === 'B' ? 'B (Dur)' : `${pretty(rootOf(k))}-Dur`);
export const keyShort = (k) => `${pretty(rootOf(k))}${k.minor ? 'm' : ''}`;
// Moll-Pentatonik über einem Grundton: „Am-Pentatonik“
const pentName = (pc) => `${pretty(rootOf({ pc, minor: true }))}m-Pentatonik`;
function accidentals(k) {
  const i = FIFTHS.indexOf(majorOf(k));
  return i === 0 ? 'keine Vorzeichen' : i <= 6 ? `${i} ♯` : `${12 - i} ♭`;
}
export function keyChords(k) {
  const t = k.minor ? MIN : MAJ;
  const notes = keyNotes(k);
  return t.iv.map((_, d) => ({ num: t.num[d], name: notes[d] + t.q[d], deg: d }));
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

// Töne eines Akkords als Intervalle zum Akkord-Grundton, mit Namen (für Zieltöne beim Solo)
export function chordTones(name) {
  const c = parseChord(name);
  if (!c) return null;
  const rest = String(name).trim().replace(/^[A-H][#b♯♭]?/, '').split('/')[0];
  const t = [[0, 'R']];
  if (/sus2/.test(rest)) t.push([2, '2']);
  else if (/sus/.test(rest)) t.push([5, '4']);
  else if (rest !== '5') t.push(c.minor || c.dim ? [3, '♭3'] : [4, '3']);
  t.push(c.dim ? [6, '♭5'] : /aug|\+/.test(rest) ? [8, '♯5'] : [7, '5']);
  if (/maj7|Δ/i.test(rest)) t.push([11, '7']);
  else if (/dim7/.test(rest)) t.push([9, '♭♭7']);
  else if (/7|9|11|13/.test(rest) && !/add9/.test(rest)) t.push([10, '♭7']);
  if (/6/.test(rest)) t.push([9, '6']);
  if (/add9|add2/.test(rest)) t.push([2, '9']);
  return { pc: c.pc, tones: t };
}

// Stufenbezeichnung eines Grundtons relativ zur Tonart (♭VI, ♭VII …), klein für Moll
const DEG_NAMES = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
function degreeName(iv, q) {
  const n = DEG_NAMES[iv];
  return q === 'm' ? n.replace(/[IV]+/, (x) => x.toLowerCase()) : q === 'dim' ? n.replace(/[IV]+/, (x) => x.toLowerCase()) + '°' : n;
}
const qualityOf = (c) => (c.dim ? 'dim' : c.minor ? 'm' : '');

// Wie passt ein Akkord in die Tonart? Leitereigen, aus der gleichnamigen Moll-/Dur-Tonart geborgt,
// Zwischendominante (Dur-Akkord eine Quinte über einem leitereigenen Akkord) oder tonartfremd.
export function chordFunction(name, k) {
  const c = parseChord(name);
  if (!c) return null;
  const q = qualityOf(c);
  const iv = mod(c.pc - k.pc);
  const fits = (t) => { const d = t.iv.indexOf(iv); return d >= 0 && (c.sus || t.q[d] === q || (t.q[d] === 'dim' && q === 'm')); };
  const own = k.minor ? MIN : MAJ, other = k.minor ? MAJ : MIN;
  if (fits(own)) return { kind: 'own', num: degreeName(iv, own.q[own.iv.indexOf(iv)] === 'dim' ? 'dim' : c.sus ? '' : q), text: 'passt zur Tonart' };
  if (k.minor && iv === 7 && q === '') return { kind: 'borrowed', num: 'V', text: 'Dur-V aus harmonisch Moll – zieht stark zurück zum Grundton' };
  if (fits(other)) return { kind: 'borrowed', num: degreeName(iv, q), text: `geliehen aus ${keyName({ pc: k.pc, minor: !k.minor })}` };
  if (q === '') {
    const target = mod(iv - 7);
    const d = own.iv.indexOf(target);
    if (d > 0 && own.q[d] !== 'dim') {
      return { kind: 'secondary', num: `V/${own.num[d]}`, text: `führt kurz zu ${pretty(keyChords(k)[d].name)} hin` };
    }
  }
  return { kind: 'foreign', num: degreeName(iv, q), text: 'außerhalb der Tonart – bewusste Würze oder Tonartwechsel' };
}

// Typische Akkordfolgen (als Stufen). 'V' = Dur-Akkord auf der fünften Stufe (in Moll aus harmonisch Moll)
const PROGS = {
  major: [['Pop', [0, 4, 5, 3]], ['Traurig-Pop', [5, 3, 0, 4]], ['Doo-Wop / 50er', [0, 5, 3, 4]], ['Rock / Folk', [0, 3, 4]], ['Ballade', [0, 2, 3, 4]], ['Jazz', [1, 4, 0]],
    ['12-Takt-Blues', [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4]]],
  minor: [['Episch', [0, 5, 2, 6]], ['Moll-Klassiker', [0, 3, 4]], ['Rock-Moll', [0, 6, 5, 6]], ['Andalusisch', [0, 6, 5, 'V']], ['Moll-Pop', [0, 3, 6, 2]]],
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
// Die Blue Note gibt es nur im Blues; in Lydisch ist derselbe Halbton die ♯4, in Lokrisch die ♭5
const ivClass = (iv, scale) => (iv === 0 ? 'root' : iv === 3 || iv === 4 ? 'third' : iv === 7 ? 'fifth' : iv === 6 && scale === 'blues' ? 'blue' : '');
const ivLabel = (iv, scale) => (iv === 6 && scale === 'lydian' ? '♯4' : IV_LABEL[iv]);

// ---------- Tonleitern ----------
const SCALES = [
  ['minpent', 'Moll-Pentatonik', [0, 3, 5, 7, 10], 'Die Solo-Tonleiter für Rock und Pop.'],
  ['majpent', 'Dur-Pentatonik', [0, 2, 4, 7, 9], 'Hell und melodisch, für Soli und Fills in Dur-Songs.'],
  ['blues', 'Blues', [0, 3, 5, 6, 7, 10], 'Moll-Pentatonik plus „Blue Note“ (♭5).'],
  ['major', 'Dur (Ionisch)', [0, 2, 4, 5, 7, 9, 11], 'Die Grundlage aller Akkorde einer Dur-Tonart – fröhlich.'],
  ['minor', 'Moll (Äolisch)', [0, 2, 3, 5, 7, 8, 10], 'Natürliches Moll – traurig, ruhig.'],
  ['harm', 'Harmonisch Moll', [0, 2, 3, 5, 7, 8, 11], 'Moll mit großer Septime – klingt orientalisch, klassisch.'],
  ['lydian', 'Lydisch', [0, 2, 4, 6, 7, 9, 11], 'Dur mit erhöhter Quarte (♯4) – verträumt, Filmmusik.'],
  ['mixo', 'Mixolydisch', [0, 2, 4, 5, 7, 9, 10], 'Dur mit kleiner Septime (♭7) – bluesiger Rock.'],
  ['dorian', 'Dorisch', [0, 2, 3, 5, 7, 9, 10], 'Moll mit heller Sexte (6) – cool, Jazz, Funk.'],
  ['phrygian', 'Phrygisch', [0, 1, 3, 5, 7, 8, 10], 'Moll mit kleiner Sekunde (♭2) – dunkel, spanisch, Metal.'],
  ['locrian', 'Lokrisch', [0, 1, 3, 5, 6, 8, 10], 'Mit ♭2 und ♭5 – angespannt, selten genutzt.'],
  ['all', 'Alle Töne', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'Jeder Ton am Hals. Der gewählte Grundton ist rot – so findest du ihn überall. ♯/♭ sind die Töne dazwischen (A♯ = B♭); zwischen H–C und E–F gibt es keinen. Am 12. Bund wiederholt sich alles.'],
];

const COMMON_SCALES = ['minpent', 'majpent', 'blues', 'major', 'minor'];
const MODES = new Set(['lydian', 'mixo', 'dorian', 'phrygian', 'locrian']);

// Moll- und Dur-Pentatonik (bzw. Moll und Dur) einer Paralleltonart haben dieselben Töne
function relHint(scale, root) {
  const up = keyName({ pc: root + 3, minor: false }), down = keyName({ pc: root + 9, minor: true });
  const self = keyName({ pc: root, minor: true });
  if (scale === 'minpent') return ` Gleiche Töne wie die Dur-Pentatonik von ${up}: Über ${up} klingt sie hell, über ${self} dunkel.`;
  if (scale === 'majpent') return ` Gleiche Töne wie ${pentName(root + 9)}.`;
  if (scale === 'major') return ` Gleiche Töne wie ${down}.`;
  if (scale === 'minor') return ` Gleiche Töne wie ${up}.`;
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
  const state = { inst, tab: 'circle', key: { pc: 7, minor: false }, scale: 'minpent', sRoot: 9, pos: -1, labels: 'iv', cRoot: 0, cMinor: false, cShape: 'all', open: {}, sounding: false };
  const tuning = () => (song && instrumentOf(song) === state.inst ? songTuning(song) : '');
  const open = () => openPitches(tuning(), state.inst === 'ukulele' ? 4 : 6, 0);
  const stdTuning = () => !tuning() || tuning() === (state.inst === 'ukulele' ? 'G C E A' : 'E A D G B E');

  // Tonart des Songs
  let songKey = null;
  const songNames = song ? [...new Set(song.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'chords').flatMap((b) => b.items.map((i) => i.name))))] : [];
  if (song) {
    const names = song.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'chords').flatMap((b) => b.items.map((i) => i.name)));
    songKey = detectKey(names);
    if (songKey) { state.key = { pc: songKey.pc, minor: songKey.minor }; state.sRoot = songKey.minor ? songKey.pc : mod(songKey.pc + 9); state.cRoot = songKey.pc; state.cMinor = songKey.minor; }
  }

  const body = h('div', { class: 'theory' });
  const pane = h('div');
  const tabs = segmented([{ value: 'circle', label: 'Tonarten' }, { value: 'scales', label: 'Tonleitern' }, { value: 'chords', label: 'Akkorde' }, { value: 'caged', label: 'CAGED' }], state.tab, (v) => { state.tab = v; draw(); });
  const instSeg = !song && segmented([{ value: 'guitar', label: 'Gitarre' }, { value: 'ukulele', label: 'Ukulele' }], state.inst, (v) => {
    state.inst = v;
    try { localStorage.setItem('gn-theory-inst', v); } catch { /* egal */ }
    draw();
  });
  fill(body, h('div', { class: 'th-top' }, tabs, instSeg), pane);

  const pills = (items, cur, onPick, cls = '') => h('div', { class: 'pills th-pills ' + cls }, items.map(([v, l]) => h('button', { class: 'pill' + (v === cur ? ' accent' : ''), 'aria-pressed': String(v === cur), onClick: () => onPick(v) }, l)));
  const rootPills = (cur, onPick) => pills(ROOT_BTN.map((label, pc) => [pc, label]), cur, onPick, 'roots');
  // Aufklappbarer Bereich, der beim Neuzeichnen offen bleibt
  const fold = (key, summary, ...kids) => {
    const d = h('details', { class: 'ai-more' }, h('summary', null, summary), ...kids);
    d.open = !!state.open[key];
    d.addEventListener('toggle', () => { state.open[key] = d.open; });
    return d;
  };
  const chordCard = (name, label) => {
    const ch = findChord(name, null, state.inst);
    return h('div', { class: 'th-chord' }, label && h('div', { class: 'th-num' }, label),
      ch ? h('div', { class: 'chord-card mini', html: diagramSVG({ ...ch, name: pretty(name) }) }) : h('div', { class: 'th-noshape' }, pretty(name)));
  };

  // ---------- Quintenzirkel ----------
  function circleSVG() {
    const k = state.key, maj = majorOf(k);
    const i0 = FIFTHS.indexOf(maj);
    const near = (i) => [mod(i0 - 1), i0, mod(i0 + 1)].includes(i);
    // Akkorde des Songs, die nicht leitereigen sind, bekommen einen gestrichelten Rand
    const marked = { out: new Set(), in: new Set() };
    for (const n of state.sounding ? [] : songNames) {
      const f = chordFunction(n, k), c = parseChord(n);
      if (!f || f.kind === 'own' || c.dim) continue;
      if (c.minor) marked.in.add(FIFTHS.indexOf(mod(c.pc + 3))); else marked.out.add(FIFTHS.indexOf(c.pc));
    }
    const cx = 160, cy = 160;
    const arc = (r1, r2, a1, a2) => {
      const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      const [x1, y1] = p(r2, a1), [x2, y2] = p(r2, a2), [x3, y3] = p(r1, a2), [x4, y4] = p(r1, a1);
      return `M${x1} ${y1}A${r2} ${r2} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 0 ${x4} ${y4}z`;
    };
    let o = `<svg class="circle-svg" viewBox="0 0 320 320" width="320" height="320">`;
    FIFTHS.forEach((pc, i) => {
      const a1 = ((i * 30 - 105) * Math.PI) / 180, a2 = ((i * 30 - 75) * Math.PI) / 180, am = ((i * 30 - 90) * Math.PI) / 180;
      const mn = mod(pc + 9);
      const numOut = near(i) ? (k.minor ? ['VI', 'III', 'VII'] : ['IV', 'I', 'V'])[mod(i - i0 + 1)] : '';
      const numIn = near(i) ? (k.minor ? ['iv', 'i', 'v'] : ['ii', 'vi', 'iii'])[mod(i - i0 + 1)] : '';
      const selOut = !k.minor && i === i0, selIn = k.minor && i === i0;
      o += `<path class="cf-seg out${near(i) ? ' in-key' : ''}${selOut ? ' sel' : ''}${marked.out.has(i) ? ' borrowed' : ''}" data-i="${i}" data-r="out" d="${arc(108, 158, a1, a2)}"/>`;
      o += `<path class="cf-seg inner${near(i) ? ' in-key' : ''}${selIn ? ' sel' : ''}${marked.in.has(i) ? ' borrowed' : ''}" data-i="${i}" data-r="in" d="${arc(56, 106, a1, a2)}"/>`;
      const t = (r, s, cls) => `<text class="${cls}" x="${cx + r * Math.cos(am)}" y="${cy + r * Math.sin(am)}" text-anchor="middle" dominant-baseline="central">${s}</text>`;
      // Stufe und Akkordname stehen je Ring klar getrennt: außen die Stufe am Rand, innen zur Mitte hin
      o += t(numOut ? 126 : 133, pretty(rootOf({ pc, minor: false })), 'cf-t out' + (selOut ? ' sel' : ''));
      o += t(numIn ? 87 : 81, pretty(rootOf({ pc: mn, minor: true })) + 'm', 'cf-t inner' + (selIn ? ' sel' : ''));
      if (numOut) o += t(149, numOut, 'cf-num' + (selOut ? ' sel' : ''));
      if (numIn) o += t(66, numIn, 'cf-num' + (selIn ? ' sel' : ''));
    });
    o += `<text class="cf-center" x="160" y="158" text-anchor="middle">${keyShort(k)}</text>`;
    o += `<text class="cf-sub" x="160" y="174" text-anchor="middle">${accidentals(k).replace('keine Vorzeichen', 'ohne ♯/♭')}</text>`;
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
      state.sounding = false;
      state.cRoot = state.key.pc; state.cMinor = state.key.minor;
      state.sRoot = state.key.minor ? state.key.pc : mod(state.key.pc + 9);
      draw();
    });
    const rel = k.minor ? { pc: mod(k.pc + 3), minor: false } : { pc: mod(k.pc + 9), minor: true };
    const capo = song?.capo || 0;
    const degChord = (d) => (d === 'V' ? { name: keyNotes(k)[4], num: 'V' } : chords[d]);
    const progs = PROGS[k.minor ? 'minor' : 'major'].map(([label, degs]) => {
      const names = degs.map((d) => degChord(d).name);
      const shown = degs.length > 6 ? names.filter((n, i) => i === 0 || n !== names[i - 1]) : names;
      return h('div', { class: 'th-prog' },
        h('div', { class: 'th-prog-t' }, h('b', null, label), h('span', null, degs.map((d) => degChord(d).num).join(' – '))),
        h('div', { class: 'th-prog-c' }, shown.map(pretty).join('  ')),
        onAdd && h('button', { class: 'icon-btn', 'aria-label': `${label} in den Song übernehmen`, onClick: () => { onAdd(names); toast(`„${label}“ als neuer Abschnitt im Song`); } }, icon('plus', 'small')));
    });
    // Capo-Rechner: Welche Griffe ergeben mit Capo die gewählte Tonart?
    const easy = EASY[state.inst];
    const capoRows = Array.from({ length: 8 }, (_, c) => {
      const nm = rootOf({ pc: mod(k.pc - c), minor: k.minor }) + (k.minor ? 'm' : '');
      const ok = easy.includes(nm);
      return h('div', { class: 'th-capo' + (ok ? ' easy' : '') }, h('span', null, c ? `Capo ${c}` : 'Ohne Capo'), h('b', null, `${pretty(nm)}-Griffe`), ok && h('span', { class: 'th-easy' }, 'leicht'));
    });
    // Mit Capo: gegriffene und klingende Tonart umschalten
    const showFn = songNames.length > 0 && !state.sounding;
    const fretted = songKey && { pc: songKey.pc, minor: songKey.minor };
    const sounding = fretted && capo ? { pc: mod(songKey.pc + capo), minor: songKey.minor } : null;
    const soloRoot = k.minor ? k.pc : mod(k.pc + 9);
    fill(pane,
      songKey && h('div', { class: 'th-songkey' }, icon('music', 'small'),
        h('div', { class: 'th-songkey-t' },
          h('b', null, `${song.title}: wahrscheinlich ${keyName(songKey)}`),
          sounding
            ? h('div', { class: 'th-row' }, segmented([{ value: false, label: `Gegriffen in ${keyShort(fretted)}` }, { value: true, label: `Klingt in ${keyShort(sounding)}` }], state.sounding, (v) => {
              state.sounding = v;
              state.key = v ? sounding : fretted;
              state.cRoot = state.key.pc; state.cMinor = state.key.minor;
              state.sRoot = state.key.minor ? state.key.pc : mod(state.key.pc + 9);
              draw();
            }))
            : h('small', null, 'Erkannt aus den Akkorden des Songs.'))),
      circ,
      h('p', { class: 'hint th-center' }, 'Außen Dur, innen Moll. Hervorgehoben: Was in der Tonart zusammenpasst.' + (showFn ? ' Gestrichelt: Akkorde deines Songs, die nicht dazugehören.' : '')),
      h('div', { class: 'form-label' }, `Akkorde in ${keyName(k)}`),
      h('div', { class: 'th-chords' }, chords.map((c) => chordCard(c.name, c.num))),
      h('button', { class: 'th-sug th-solo-link', onClick: () => { state.sRoot = soloRoot; state.scale = 'minpent'; state.tab = 'scales'; tabs.set('scales'); draw(); } },
        h('b', null, `Solo: ${pentName(soloRoot)}`), h('small', null, 'Auf dem Griffbrett zeigen')),
      showFn && h('div', { class: 'form-label' }, 'Akkorde deines Songs'),
      showFn && h('div', { class: 'th-fn-list' }, songNames.map((n) => {
        const f = chordFunction(n, k);
        if (!f) return null;
        return h('div', { class: 'th-fn ' + f.kind }, h('b', null, pretty(n)), h('span', { class: 'th-fn-num' }, f.num), h('span', { class: 'th-fn-t' }, f.text));
      })),
      h('div', { class: 'th-notes' }, h('span', null, 'Töne:'), keyNotes(k).map((n, d) => h('span', { class: 'th-note' + (d === 0 ? ' root' : '') }, h('b', null, pretty(n)), h('small', null, String(d + 1))))),
      h('p', { class: 'form-foot' }, `Parallele: ${keyName(rel)} – gleiche Akkorde, anderer Grundton.${k.minor ? ` In Moll wird die v oft zur Dur-V (${pretty(keyNotes(k)[4])} statt ${pretty(chords[4].name)}).` : ''}`),
      h('div', { class: 'form-label' }, 'Typische Akkordfolgen'),
      h('div', { class: 'th-progs' }, progs),
      fold('capo', `Capo-Rechner: ${keyName(k)} spielen mit …`,
        h('div', { class: 'th-capos' }, capoRows),
        h('div', { class: 'form-label' }, 'Welcher Griff klingt wie?'),
        capoTable()));
  }

  // ---------- Tonleitern ----------
  // Solo je Abschnitt: Abschnitte mit denselben Akkorden stehen zusammen. Bleibt ein Abschnitt in der Tonart des Songs,
  // gilt deren Pentatonik; wechselt er die Tonart, die des Abschnitts.
  function sectionSolo() {
    const groups = new Map();
    for (const sec of song.sections) {
      const names = [...new Set(sec.blocks.filter((b) => b.type === 'chords').flatMap((b) => b.items.map((i) => i.name)))].filter((n) => parseChord(n));
      if (!names.length) continue;
      const id = names.slice().sort().join(' ');
      if (groups.has(id)) { const g = groups.get(id); if (!g.secs.includes(sec.name)) g.secs.push(sec.name); } else groups.set(id, { secs: [sec.name], names });
    }
    if (groups.size < 2) return null;
    const rows = [...groups.values()].map((g) => {
      const inKey = g.names.every((n) => chordFunction(n, songKey)?.kind === 'own');
      const k = inKey ? songKey : detectKey(g.names);
      const root = k.minor ? k.pc : mod(k.pc + 9);
      const pick = (target) => { state.sRoot = root; state.scale = 'minpent'; state.pos = -1; state.target = target; draw(); };
      return h('div', { class: 'th-solo' },
        h('div', { class: 'th-solo-t' }, h('b', null, g.secs.join(' · ')), h('button', { class: 'pill' + (state.sRoot === root && state.scale === 'minpent' && !state.target ? ' accent' : ''), onClick: () => pick(null) }, pentName(root))),
        h('div', { class: 'pills th-pills targets' }, h('span', { class: 'th-solo-l' }, 'Zieltöne:'), g.names.map((n) => h('button', { class: 'pill' + (state.target === n && state.sRoot === root ? ' accent' : ''), 'aria-pressed': String(state.target === n && state.sRoot === root), onClick: () => pick(n) }, pretty(n)))));
    });
    return fold('solo', 'Solo je Abschnitt', rows);
  }
  function drawScales() {
    const [, label, ivs, desc] = SCALES.find((x) => x[0] === state.scale);
    const op = open();
    const frets = state.inst === 'ukulele' ? 12 : 15;
    // Töne der Tonleiter mit ihren richtigen Namen; Akkordtöne außerhalb (Zieltöne) in der passenden Vorzeichenart
    const chromatic = state.scale === 'all';
    const named = chromatic ? [] : spellNotes(state.sRoot, ivs);
    const flats = chromatic ? FLAT_KEYS.has(state.sRoot) : named.some((n) => n.includes('b'));
    const rootName = chromatic ? noteName(state.sRoot, flats) : named[0];
    const toneName = (pc) => { const i = ivs.indexOf(mod(pc - state.sRoot)); return pretty(i >= 0 && !chromatic ? named[i] : noteName(pc, flats)); };
    const canBox = state.inst !== 'ukulele' && stdTuning() && ivs.length <= 7;
    const nBoxes = (ivs.length === 6 ? 5 : ivs.length);
    if (!canBox || state.pos >= nBoxes) state.pos = -1;
    const box = state.pos >= 0 ? scaleBox(op, state.sRoot, ivs, state.pos) : null;
    const inBox = (s, f) => !box || box.cells.some((c) => c.s === s && c.f === f) || (ivs.length === 6 && f >= box.from && f <= box.to && mod(op[s] + f - state.sRoot) === 6);
    // Zieltöne: Töne des gewählten Akkords – darauf landen, wenn der Akkord erklingt
    const target = state.target ? chordTones(state.target) : null;
    const toneOf = (pc) => target?.tones.find(([iv]) => mod(target.pc + iv) === mod(pc));
    const dots = [];
    op.forEach((p, s) => {
      for (let f = 0; f <= frets; f++) {
        const iv = mod(p + f - state.sRoot);
        const tone = toneOf(p + f);
        if (!ivs.includes(iv) && !tone) continue;
        if (!ivs.includes(iv) && box && !(f >= box.from && f <= box.to)) continue;
        if (target) {
          const cls = !tone ? 'passing' : tone[0] === 0 ? 'root' : tone[1].includes('3') ? 'third' : tone[1].includes('5') ? 'fifth' : 'seventh';
          dots.push({ s, f, text: tone ? tone[1] : state.labels === 'iv' ? ivLabel(iv, state.scale) : toneName(p + f), cls: cls + (tone && !ivs.includes(iv) ? ' outside' : ''), faint: !inBox(s, f) && !(tone && !ivs.includes(iv)) });
        } else dots.push({ s, f, text: state.labels === 'iv' && !chromatic ? ivLabel(iv, state.scale) : toneName(p + f), cls: chromatic ? (iv === 0 ? 'root' : '') : ivClass(iv, state.scale), faint: !inBox(s, f) });
      }
    });
    // Passende Tonleiter zum Song: Dur-Pentatonik (= Moll-Pentatonik der Parallele) bzw. Moll-Pentatonik
    const sk = songKey && { pc: songKey.pc, minor: songKey.minor };
    const suggest = sk && (sk.minor
      ? [[sk.pc, 'minpent', pentName(sk.pc), 'passt über den ganzen Song']]
      : [[mod(sk.pc + 9), 'minpent', pentName(sk.pc + 9), `gleiche Töne wie die Dur-Pentatonik von ${keyName(sk)}, hell und melodisch`],
        [sk.pc, 'minpent', pentName(sk.pc), 'rockiger, reibt an Dur-Akkorden – dort Zieltöne nutzen']]);
    const chordChips = (songNames.length ? songNames : keyChords(state.key).filter((c) => !c.name.endsWith('dim')).map((c) => c.name));
    const bands = box ? [{ from: box.from, to: box.to, label: `Position ${state.pos + 1}`, cls: 'sh-pos' }] : [];
    const hasOutside = dots.some((d) => d.cls.includes('outside'));
    const moreScales = state.moreScales || !COMMON_SCALES.includes(state.scale);
    const scaleItems = SCALES.filter(([v]) => moreScales || COMMON_SCALES.includes(v)).map(([v, l]) => [v, l]);
    fill(pane,
      suggest && h('div', { class: 'th-suggest' },
        h('div', { class: 'th-suggest-h' }, icon('music', 'small'), `Solo über ${song.title}`),
        suggest.map(([root, sc, l, sub]) => h('button', { class: 'th-sug' + (state.sRoot === root && state.scale === sc ? ' on' : ''), onClick: () => { state.sRoot = root; state.scale = sc; draw(); } }, h('b', null, l), h('small', null, sub))),
        sectionSolo()),
      h('div', { class: 'form-label' }, 'Grundton'),
      rootPills(state.sRoot, (v) => { state.sRoot = v; draw(); }),
      h('div', { class: 'form-label' }, 'Tonleiter'),
      pills([...scaleItems, ...(moreScales ? [] : [['$more', 'Modi & mehr …']])], state.scale, (v) => {
        if (v === '$more') { state.moreScales = true; draw(); return; }
        state.scale = v; state.pos = -1; draw();
      }),
      // Erst das Griffbrett: wo man greift. Danach die Feinheiten.
      h('div', { class: 'th-neck-head' }, h('b', null, `${pretty(rootName)} ${label}${target ? ` · über ${pretty(state.target)}` : ''}`),
        segmented([{ value: 'iv', label: 'Stufen' }, { value: 'notes', label: 'Töne' }], state.labels, (v) => { state.labels = v; draw(); })),
      h('div', { class: 'neck-scroll', html: neckSVG({ open: op, frets, dots, bands }) }),
      target
        ? h('div', { class: 'th-legend' }, h('span', { class: 'lg root' }, 'R Grundton'), h('span', { class: 'lg third' }, 'Terz'), h('span', { class: 'lg fifth' }, 'Quinte'), h('span', { class: 'lg seventh' }, 'Septime/Zusatz'), h('span', { class: 'lg passing' }, 'Durchgangston'), hasOutside && h('span', { class: 'lg outside' }, 'Akkordton außerhalb der Tonleiter'))
        : h('div', { class: 'th-legend' }, h('span', { class: 'lg root' }, 'Grundton'), h('span', { class: 'lg third' }, 'Terz'), h('span', { class: 'lg fifth' }, 'Quinte'), state.scale === 'blues' && h('span', { class: 'lg blue' }, 'Blue Note')),
      target && h('p', { class: 'form-foot th-tip' }, `Wenn ${pretty(state.target)} erklingt, auf einem farbigen Ton landen, am stärksten sind Grundton und Terz.${hasOutside ? ' Gestrichelt: Dieser Akkordton liegt nicht in der Tonleiter, klingt hier aber besser als sein Nachbar.' : ''}`),
      h('p', { class: 'form-foot' }, `${desc}${relHint(state.scale, state.sRoot)} Töne: ${chromatic ? 'alle zwölf' : named.map(pretty).join(' ')}.${box ? ` Position ${state.pos + 1}: Bund ${box.from}–${box.to}.` : ''}`),
      MODES.has(state.scale) && fold('modes', 'Modi von hell nach dunkel', h('p', { class: 'form-foot' }, 'Lydisch · Ionisch (Dur) · Mixolydisch · Dorisch · Äolisch (Moll) · Phrygisch · Lokrisch')),
      canBox && h('div', { class: 'form-label' }, 'Griff-Position'),
      canBox && pills([[-1, 'Ganzer Hals'], ...Array.from({ length: nBoxes }, (_, i) => [i, String(i + 1)])], state.pos, (v) => { state.pos = v; draw(); }),
      h('div', { class: 'form-label' }, 'Zieltöne über …'),
      pills([['', 'Keinem Akkord'], ...chordChips.map((n) => [n, pretty(n)])], state.target || '', (v) => { state.target = v || null; draw(); }, 'targets'));
    pane.querySelector('.neck-scroll')?.scrollTo({ left: box ? Math.max(0, (box.from - 1) * 44) : 0 });
  }

  // ---------- CAGED ----------
  function drawCaged() {
    const std = stdTuning();
    const op = std ? open() : openPitches('', state.inst === 'ukulele' ? 4 : 6, 0); // CAGED gilt für die Standardstimmung
    const frets = 15;
    const shapes = cagedShapes(state.inst, state.cRoot, state.cMinor);
    const name = rootOf({ pc: state.cRoot, minor: state.cMinor }) + (state.cMinor ? 'm' : '');
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
      !std && h('p', { class: 'hint' }, 'Der Song hat eine andere Stimmung, die Formen gelten für die Standardstimmung.'),
      h('div', { class: 'form-label' }, 'Akkord'),
      rootPills(state.cRoot, (v) => { state.cRoot = v; draw(); }),
      h('div', { class: 'th-row' }, segmented([{ value: false, label: 'Dur' }, { value: true, label: 'Moll' }], state.cMinor, (v) => { state.cMinor = v; draw(); })),
      h('div', { class: 'form-label' }, 'Form'),
      pills([['all', 'Alle'], ...['C', 'A', 'G', 'E', 'D'].map((l) => [l, l])], state.cShape, (v) => { state.cShape = v; draw(); }, 'shapes'),
      h('div', { class: 'neck-scroll', html: neckSVG({ open: op, frets, dots, bands }) }),
      h('div', { class: 'th-legend' }, h('span', { class: 'lg root' }, 'R = Grundton'), h('span', null, '3 = Terz · 5 = Quinte')),
      h('p', { class: 'form-foot' }, `${pretty(name)} an fünf Stellen am Hals: ${shapes.map((s) => `${s.letter} (Bund ${s.off})`).join(' → ')}. Lerne zuerst die E- und A-Form, damit kannst du jeden Dur- und Moll-Akkord greifen.`),
      h('div', { class: 'form-label' }, 'Die fünf Griffe'),
      h('div', { class: 'th-chords' }, shapes.map(diag)),
      fold('shapes', 'Form verschieben, neuer Akkord',
        shapeTable(),
        h('p', { class: 'form-foot' }, 'Oben der Akkord, links die Form, in der Zelle der Bund. Beispiel: D mit der A-Form ist der A-Griff als Barré im 5. Bund.')));
  }

  // Capo-Tabelle: Griff (Spalte) mit Capo (Zeile) klingt als …
  function capoTable() {
    const shapes = state.inst === 'ukulele' ? ['C', 'G', 'F', 'D', 'A', 'Am', 'Em'] : ['C', 'A', 'G', 'E', 'D', 'Am', 'Em'];
    const sound = (n, c) => { const p = parseChord(n); return keyShort({ pc: mod(p.pc + c), minor: p.minor }); };
    return h('div', { class: 'th-table-wrap' }, h('table', { class: 'th-table' },
      h('thead', null, h('tr', null, h('th', null, 'Griff →'), shapes.map((n) => h('th', null, pretty(n))))),
      h('tbody', null, Array.from({ length: 7 }, (_, i) => h('tr', null, h('th', null, `Capo ${i + 1}`), shapes.map((n) => h('td', null, sound(n, i + 1))))))),
      h('p', { class: 'form-foot' }, 'Beispiel: Capo 2 + C-Griff klingt wie D.'));
  }
  // CAGED-Tabelle: Form (Zeile) × Akkord (Spalte) = Bund
  function shapeTable() {
    const set = CAGED[state.inst === 'ukulele' ? 'ukulele' : 'guitar'][state.cMinor ? 'minor' : 'major'];
    const roots = [0, 2, 4, 5, 7, 9, 11, 1, 3, 6, 8, 10];
    return h('div', { class: 'th-table-wrap' }, h('table', { class: 'th-table' },
      h('thead', null, h('tr', null, h('th', null, 'Form ↓'), roots.map((pc) => h('th', { class: pc === state.cRoot ? 'on' : '' }, keyShort({ pc, minor: state.cMinor }))))),
      h('tbody', null, ['C', 'A', 'G', 'E', 'D'].map((l) => h('tr', null, h('th', { class: 'th-num ' + SHAPE_CLS[l] }, `${l}-Form`),
        roots.map((pc) => { const off = mod(pc - set[l][1]); return h('td', { class: pc === state.cRoot ? 'on' : '' }, off === 0 ? 'offen' : String(off)); }))))));
  }

  // ---------- Akkorde: Baukasten (Formeln), Barré- und Powerchords ----------
  const FORMULAS = [
    ['', 'Dur', [0, 4, 7], '1 3 5'], ['m', 'Moll', [0, 3, 7], '1 ♭3 5'], ['7', 'Dominant 7', [0, 4, 7, 10], '1 3 5 ♭7'],
    ['m7', 'Moll 7', [0, 3, 7, 10], '1 ♭3 5 ♭7'], ['maj7', 'Major 7', [0, 4, 7, 11], '1 3 5 7'], ['sus2', 'sus2', [0, 2, 7], '1 2 5'],
    ['sus4', 'sus4', [0, 5, 7], '1 4 5'], ['add9', 'add9', [0, 4, 7, 14], '1 3 5 9'], ['6', '6', [0, 4, 7, 9], '1 3 5 6'],
    ['dim', 'vermindert', [0, 3, 6], '1 ♭3 ♭5'], ['m7b5', 'halbvermindert', [0, 3, 6, 10], '1 ♭3 ♭5 ♭7'], ['aug', 'übermäßig', [0, 4, 8], '1 3 ♯5'],
    ['5', 'Powerchord', [0, 7], '1 5'],
  ];
  const DEG_OF = { 0: 'R', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7', 14: '9' };
  // Bewegliche Barré-Formen: Grundton auf der tiefen E-Saite (E-Form) bzw. A-Saite (A-Form), relativ zum Grundton-Bund
  const BARRE = {
    E: { '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], maj7: [0, -1, 1, 1, 0, -1], 5: [0, 2, 2, -1, -1, -1] },
    A: { '': [-1, 0, 2, 2, 2, 0], m: [-1, 0, 2, 2, 1, 0], 7: [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0], maj7: [-1, 0, 2, 1, 2, 0], 5: [-1, 0, 2, 2, -1, -1] },
  };
  function drawChords() {
    if (state.bRoot == null) state.bRoot = state.key.pc;
    if (state.bType == null) state.bType = state.key.minor ? 'm' : '';
    const [suf, label, ivs, formula] = FORMULAS.find((f) => f[0] === state.bType);
    const spelled = spellNotes(state.bRoot, ivs, stepsOfFormula(formula));
    const name = spelled[0] + suf;
    const op = open();
    const pcs = ivs.map((iv) => mod(state.bRoot + iv));
    const dots = [];
    op.forEach((p, s) => {
      for (let f = 0; f <= 15; f++) {
        const k = pcs.indexOf(mod(p + f));
        if (k < 0) continue;
        const iv = ivs[k];
        dots.push({ s, f, text: DEG_OF[iv], cls: iv === 0 ? 'root' : iv === 3 || iv === 4 ? 'third' : iv === 7 || iv === 6 || iv === 8 ? 'fifth' : 'seventh' });
      }
    });
    const ch = findChord(name, null, state.inst);
    const barreRow = (form) => {
      const rootFret = mod(state.bRoot - (form === 'E' ? 4 : 9));
      return h('div', { class: 'th-chords' }, Object.entries(BARRE[form]).map(([t, rel]) => {
        const frets = rel.map((x) => (x < 0 ? -1 : x + rootFret));
        const fretted = frets.filter((x) => x > 0);
        const base = !fretted.length || Math.max(...fretted) <= 4 ? 1 : Math.min(...fretted);
        const fm = FORMULAS.find((x) => x[0] === t);
        const nm = pretty(spellNotes(state.bRoot, fm[2], stepsOfFormula(fm[3]))[0] + t);
        return h('div', { class: 'th-chord' }, h('div', { class: 'th-num' }, t === '' ? 'Dur' : t === 'm' ? 'Moll' : t === '5' ? 'Power' : t),
          h('div', { class: 'chord-card mini', html: diagramSVG({ name: nm, frets, fingers: frets.map(() => 0), base }) }));
      }));
    };
    fill(pane,
      h('div', { class: 'form-label' }, 'Grundton'),
      rootPills(state.bRoot, (v) => { state.bRoot = v; draw(); }),
      h('div', { class: 'form-label' }, 'Art'),
      pills(FORMULAS.map(([v, l]) => [v, l]), state.bType, (v) => { state.bType = v; draw(); }),
      h('div', { class: 'th-build' },
        h('div', null, h('div', { class: 'th-build-name' }, pretty(name)), h('div', { class: 'th-build-f' }, `Formel ${formula}`),
          h('div', { class: 'th-build-n' }, ivs.map((iv, i) => h('span', null, h('b', null, pretty(spelled[i])), h('small', null, DEG_OF[iv]))))),
        ch && h('div', { class: 'chord-card mini', html: diagramSVG({ ...ch, name: pretty(name) }) })),
      h('div', { class: 'form-label' }, 'Alle Akkordtöne am Hals'),
      h('div', { class: 'neck-scroll', html: neckSVG({ open: op, frets: 15, dots }) }),
      h('div', { class: 'th-legend' }, h('span', { class: 'lg root' }, 'R Grundton'), h('span', { class: 'lg third' }, 'Terz'), h('span', { class: 'lg fifth' }, 'Quinte'), h('span', { class: 'lg seventh' }, 'Septime/Zusatz')),
      h('p', { class: 'form-foot' }, 'Die Formel zählt die Stufen der Dur-Tonleiter des Grundtons: 1 3 5 ist Dur, ♭3 macht Moll, ♭7 einen 7er-Akkord.'),
      state.inst !== 'ukulele' && fold('barre', `Barré- und Powerchords für ${pretty(spelled[0])}`,
        h('div', { class: 'form-label' }, 'E-Form (Grundton auf der tiefen E-Saite)'),
        barreRow('E'),
        h('div', { class: 'form-label' }, 'A-Form (Grundton auf der A-Saite)'),
        barreRow('A'),
        h('p', { class: 'form-foot' }, 'Diese Formen kannst du an jeden Bund schieben. Der Akkord heißt wie der Ton unter dem Grundton.')));
  }

  function draw() {
    if (state.tab === 'circle') drawCircle();
    else if (state.tab === 'scales') drawScales();
    else if (state.tab === 'chords') drawChords();
    else drawCaged();
  }
  draw();
  return sheet({ title: 'Musiktheorie', body, full: true, right: { label: 'Fertig', bold: true } });
}
