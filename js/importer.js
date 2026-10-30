// Text-Importer: wandelt rohe Notizen, Akkordblätter (Akkorde über Liedtext), ChordPro und ASCII-Tabs
// vollständig lokal in einen strukturierten Song um (Gitarre: 6-zeilige Tabs, Ukulele: 4-zeilige Tabs).
// Optional kann der KI-Assistent (Google Gemini) Text analysieren oder aus einer Beschreibung etwas erzeugen;
// sein Ergebnis durchläuft dieselbe Vorschau. Ohne Schlüssel oder offline bleibt alles lokal.
import * as db from './storage.js';
import { h, fill, sheet, toggle, toast, icon, formRow, segmented } from './ui.js';
import { newSong, newSection, newBlock, newChordItem, uid, now, TUNINGS, UKE_TUNINGS, INSTRUMENTS, touch, tuningLabel, instrumentOf, stringsOf } from './songs.js';
import { newTab, newMeasure, isEmptyTab, tabView, MAX_FRET } from './tabs.js';
import { isChordName, saveUserChord, diagramSVG } from './chords.js';
import { aiUnavailable, generateJSON, generatePrompt, analyzePrompt, mediaPrompt, imagePart, youtubePart, youtubeUrl, SONG_SCHEMA } from './ai.js';
import { addImages, fileToAiImage, mediaToAiImage, mediaBlob, listMedia } from './media.js';

// ---------- Erkennung einzelner Zeilen ----------
const KW = 'intro|verse|vers|strophe|pre[\\s-]?chorus|post[\\s-]?chorus|chorus|refrain|bridge|solo|outro|interlude|zwischenspiel|instrumental|hook|ending|schluss|coda|riff|break|tag';
const KW_RE = new RegExp(`^(${KW})(?:\\s*(\\d+|[ivx]+))?\\s*(?:[:.)\\-–]\\s*(.*)|$)`, 'i');
const CANON = { verse: 'Verse', vers: 'Verse', strophe: 'Strophe', 'pre-chorus': 'Pre-Chorus', prechorus: 'Pre-Chorus', 'post-chorus': 'Post-Chorus', postchorus: 'Post-Chorus' };

function niceName(raw) {
  let t = String(raw).split(':')[0].trim().replace(/\s+/g, ' ');
  const m = t.match(new RegExp(`^(${KW})\\b(.*)$`, 'i'));
  if (m) {
    const key = m[1].toLowerCase().replace(/\s+/g, '-');
    const base = CANON[key] || CANON[key.replace('-', '')] || key.charAt(0).toUpperCase() + key.slice(1);
    t = base + m[2];
  }
  return t.slice(0, 40) || 'Abschnitt';
}

function parseHeader(line) {
  const t = line.trim();
  let m = t.match(/^\[\s*([^\]]{1,40}?)\s*\]\s*(.*)$/);
  if (m && !isChordName(m[1]) && !/\[[^\]]*\]/.test(m[2])) return { name: niceName(m[1]), rest: m[2] };
  m = t.match(/^\(\s*([^)]{1,30}?)\s*\)\s*$/);
  if (m && new RegExp(`^(${KW})`, 'i').test(m[1])) return { name: niceName(m[1]), rest: '' };
  m = t.match(KW_RE);
  if (m) return { name: niceName(m[1] + (m[2] ? ' ' + m[2] : '')), rest: m[3] || '' };
  return null;
}

// Akkordzeile: nur Akkorde, Trennzeichen und Wiederholungsangaben (x2, 2x, (x4)).
function chordLine(raw) {
  const chords = [];
  let repeat = 1;
  const re = /\S+/g;
  let m;
  while ((m = re.exec(raw))) {
    const tok = m[0];
    if (/^(?:\|+|:?\|\|?:?|->|→|–|-|\/|\.+|,|%)$/.test(tok)) continue;
    const rep = tok.match(/^\(?(?:[x×*]\s?(\d{1,2})|(\d{1,2})\s?[x×])\)?$/i);
    if (rep) { repeat = Number(rep[1] || rep[2]); continue; }
    if (/^\(?N\.?C\.?\)?$/i.test(tok)) continue;
    let offset = 0;
    for (const part of tok.split(/→|->|\|/)) {
      const name = part.replace(/^[(\[]+|[)\],.]+$/g, '');
      if (name && !isChordName(name)) return null;
      if (name) chords.push({ name: name.replace(/♯/g, '#').replace(/♭/g, 'b'), idx: m.index + offset });
      offset += part.length + 1;
    }
  }
  return chords.length ? { chords, repeat } : null;
}

// Ein Akkord gefolgt von einer Spielanweisung (Zupfmuster, Saiten, Technik) – keine Liedzeile
const PLAY_RE = /\bP\s*\(|\bP\s?\d|[x×]\s?\d|\d\s*[x×]|\(\s*\d(?:\s*,\s*\d)+\s*\)|zupf|pluck|picking|arpegg|anschlag|abschlag|aufschlag|strum|daumen|thumb|saite|string|hammer|slide|dämpf|mute|palm/i;
const STROKES_RE = /(?:^|[\s(])[DUXPHM]{2,}(?=[\s,()]|$)|(?:^|\s)[DUXPHM](?:\s+[DUXPHM]){1,}(?=[\s(]|$)/;
function playLine(line) {
  const m = line.match(/^([A-H][^\s:]{0,10})\s*[:=–-]?\s+(.+)$/);
  if (!m || !isChordName(m[1]) || chordLine(line) || !(PLAY_RE.test(m[2]) || STROKES_RE.test(m[2]))) return null;
  const { text, rep } = splitRep(m[2]);
  return { name: m[1].replace(/♯/g, '#').replace(/♭/g, 'b'), play: text.slice(0, 300), rep };
}

// „DDU UDU ×2“ → Text „DDU UDU“ und Wiederholung 2 (die App hat dafür ein eigenes Feld)
export function splitRep(raw) {
  const t = String(raw || '').trim();
  const m = t.match(/\s*(?:[x×*]\s?(\d{1,2})|(\d{1,2})\s?[x×])\s*$/i);
  if (!m || m.index === 0) return { text: t, rep: 1 };
  const rep = Number(m[1] || m[2]);
  return rep >= 2 && rep <= 16 ? { text: t.slice(0, m.index).trim(), rep } : { text: t, rep: 1 };
}

// Hinweise, die die App als Funktion abbildet, statt sie als Notiz zu speichern:
// „x2“ allein (Wiederholung), „Chorus x2“, „Strophe 2 wie Strophe 1“, „Refrain wiederholen“, „Tab:“
const SEC_T = `((?:${KW})(?:\\s*(?:\\d+|[ivx]+\\b))?)`;
const REP_T = '\\(?\\s*(?:[x×]\\s*(\\d{1,2})|(\\d{1,2})\\s*(?:[x×]|mal))\\s*\\)?';
const REP_LINE_RE = new RegExp(`^[\\[(]?\\s*(?:[x×]\\s*(\\d{1,2})|(\\d{1,2})\\s*(?:[x×]|mal))\\s*[)\\]]?\\s*[.:]?$`, 'i');
const CUE_REP_RE = new RegExp(`^\\[?\\s*${SEC_T}\\s*\\]?\\s*[:.\\-–]?\\s*${REP_T}\\s*\\]?\\s*:?$`, 'i');
const LIKE_W = '(?:wie|like|same as|siehe|=)\\s+(?:(?:die|der|das|den|dem|im|the)\\s+)?';
const CUE_LIKE_RE = new RegExp(`^\\[?\\s*${SEC_T}\\s*\\]?\\s*[:.\\-–]?\\s*${LIKE_W}${SEC_T}\\s*(?:${REP_T})?\\s*[.:]?$`, 'i');
const LIKE_RE = new RegExp(`^\\(?\\s*${LIKE_W}${SEC_T}\\s*\\)?\\s*(?:${REP_T})?\\s*[.:]?$`, 'i');
const AGAIN_W = '(?:wiederholen|wiederholung|repeat|nochmal|noch\\s*mal|again)';
const CUE_AGAIN_RE = new RegExp(`^(?:(?:repeat|wiederhole?n?|nochmal|noch\\s*mal)\\s+(?:(?:den|die|das|the)\\s+)?${SEC_T}|${SEC_T}\\s+${AGAIN_W})\\s*(?:${REP_T})?\\s*[.!:]?$`, 'i');
const TAB_LABEL_RE = /^(?:tabs?|tabulatur|tablature)\s*:?$/i;
// „wie oben, aber gezupft: PP“ → wie der Abschnitt davor, mit eigener Spielweise
const LIKE_PREV_RE = /^\(?\s*(?:genauso\s+)?wie\s+(?:oben|vorher|davor|zuvor|eben)\s*\)?\s*(?:[,;–-]\s*(?:aber|nur|but)?\s*(.*))?$/i;
// Zeichenerklärung wie „\ = Slide runter, / = Slide hoch“ – erklärt die App selbst
const LEGEND_RE = /^(?:[\\/~^<>hpbxDUXHMP]{1,2}\s*=\s*[^,=]{2,40}(?:,\s*|$))+$/;
const repOf = (a, b) => { const n = Number(a || b); return n >= 2 && n <= 16 ? n : 1; };
// Gleicher Abschnitt trotz anderer Sprache: Refrain = Chorus, Strophe = Verse
const secKey = (n) => String(n).toLowerCase().replace(/\s+/g, ' ').trim().replace(/^refrain/, 'chorus').replace(/^(?:strophe|vers)\b/, 'verse');

// Inline-Akkorde im ChordPro-Stil: „[G]Heute ist [D]der Tag“
const INLINE_RE = /\[([^\]\s]{1,14})\]/g;
function inlineChords(line) {
  const out = [];
  for (const m of line.matchAll(INLINE_RE)) if (isChordName(m[1])) out.push(m[1]);
  return out;
}

// Anschlagmuster wie „D - D U - U D U“, „DDUUDU“, „↓ ↓↑ ↑↓↑“, Akzent mit „>“
function parseStrum(text, forced = false) {
  const body = text.replace(/\s+/g, '');
  if (body.length < 3 || !/^[DUdu↓↑xXHM\-.*>]+$/.test(body)) return null;
  if (!forced && !/[Uu↑]/.test(body)) return null;
  const strokes = [];
  let acc = false;
  for (const c of body) {
    if (c === '>') { acc = true; continue; }
    const k = /[Dd↓]/.test(c) ? 'D' : /[Uu↑]/.test(c) ? 'U' : /[xXM]/.test(c) ? 'X' : c === 'H' ? 'H' : 'R';
    strokes.push(acc ? { k, a: true } : { k });
    acc = false;
  }
  return strokes.length <= 32 ? strokes : null;
}

const STRUM_LABEL_RE = /^(?:strumming(?:\s*pattern)?|strum|anschlag(?:muster)?|schlagmuster|spielweise|zupfmuster|plucking|picking|rhythm(?:us)?|pattern)\s*[:=]/i;
const META_LABEL_RE = /^(?:title|titel|artist|künstler|interpret|band|capo|kapo|key|tonart|tuning|stimmung|tempo|bpm|time|takt(?:art)?)\s*[:=]/i;
const isCountLine = (t) => /[&+]/.test(t) && /^(?:\s*(?:\d{1,2}|&|\+|e|a|and|und))+\s*$/i.test(t);

// ASCII-Tab-Zeile: e|---0---3--| (mit überwiegend Bindestrichen)
function tabBody(raw) {
  const m = raw.match(/^\s*([A-Ha-h][#b]?)?\s*([|:])?/);
  return { start: m[0].length, body: raw.slice(m[0].length) };
}
function isTabLine(raw) {
  const { body } = tabBody(raw);
  const dashes = (body.match(/[-–—]/g) || []).length;
  return dashes >= 4 && dashes / body.replace(/\s/g, '').length > 0.35 && /^[-–—0-9hHpPbrsxX~\/\\|().*^<> ]+$/.test(body);
}
const isPmLine = (raw) => /P\.?\s?M\.?/i.test(raw) && /^[\sA-Za-z|:]*?P\.?\s?M\.?[-–.\s|]*$/i.test(raw.trim());

function parseTabGroup(rows, pmLine) {
  const notes = [];
  const bars = new Set();
  rows.forEach((raw, s) => {
    const r = raw.replace(/[–—]/g, '-').replace(/([|\s])\s*[x×]\s?\d{1,2}\s*$/, '$1');
    const { start } = tabBody(r);
    for (let i = start; i < r.length; i++) {
      const c = r[i];
      if (c === '|') { if (i > start && i < r.trimEnd().length - 1) bars.add(i); continue; }
      if (/\d/.test(c)) {
        let j = i + 1, num = c;
        if (/\d/.test(r[j] || '') && Number(c + r[j]) <= 24) { num += r[j]; j++; }
        const n = { f: Number(num) };
        const t = r[j];
        if (t === 'h' || t === 'H') n.l = 'h';
        else if (t === 'p' || t === 'P') n.l = 'p';
        else if (t === '/' || t === 's') n.l = '/';
        else if (t === '\\') n.l = '\\';
        else if (t === 'b') { n.b = 1; j++; if (r[j] === '(') j++; while (/\d/.test(r[j] || '')) j++; if (r[j] === ')') j++; j--; }
        else if (t === '~') n.v = true;
        notes.push({ s, idx: i, n });
        i = j - 1 + (t === 'b' ? 1 : 0);
      } else if (c === 'x' || c === 'X') notes.push({ s, idx: i, n: { f: null, x: true } });
      else if (c === '~') { const last = notes[notes.length - 1]; if (last && last.s === s) last.n.v = true; }
    }
  });
  // Ränder der Takte: nach dem Saitennamen, an jedem Taktstrich und am schließenden |
  const first = rows.map((r) => tabBody(r).start).reduce((x, y) => Math.min(x, y), Infinity);
  const ends = rows.map((r) => r.trimEnd()).filter((r) => r.endsWith('|')).map((r) => r.length - 1);
  const close = ends.length === rows.length && ends.every((e) => e === ends[0]) ? ends[0] : Infinity;
  const edges = [first - 1, ...[...bars].sort((a, b) => a - b), close];
  let pm = null;
  if (pmLine) { const a = pmLine.search(/P/i); const b = pmLine.replace(/\s+$/, '').length - 1; pm = [a, b]; }
  // Gleichmäßiges Raster (jede Position gleich breit, z. B. aus „Als Text bearbeiten“): leere Positionen
  // und damit der Rhythmus bleiben erhalten. Sonst werden nur die Positionen mit Noten übernommen.
  const groups = [];
  for (let k = 0; k < edges.length - 1; k++) {
    const inside = notes.filter((o) => o.idx > edges[k] && o.idx < edges[k + 1]);
    if (inside.length) groups.push({ k, inside, cols: [...new Set(inside.map((o) => o.idx))].sort((a, b) => a - b) });
  }
  let unit = Infinity;
  for (const g of groups) for (let i = 1; i < g.cols.length; i++) unit = Math.min(unit, g.cols[i] - g.cols[i - 1]);
  const grid = unit >= 2 && unit < Infinity && groups.every((g) => g.cols.every((idx) => (idx - edges[g.k] - 1) % unit === 0)
    && (edges[g.k + 1] === Infinity || (edges[g.k + 1] - edges[g.k] - 1) % unit === 0));
  const measures = [];
  for (const { k, inside, cols } of groups) {
    const pos = (idx) => (grid ? (idx - edges[k] - 1) / unit : cols.indexOf(idx));
    const n = grid ? (edges[k + 1] === Infinity ? pos(cols[cols.length - 1]) + 1 : (edges[k + 1] - edges[k] - 1) / unit) : cols.length;
    const m = newMeasure(Math.max(4, Math.min(64, n)), rows.length);
    inside.forEach((o) => { const c = pos(o.idx); if (c < 64) m.notes[o.s][c] = o.n; });
    if (pm) cols.forEach((idx) => { const c = pos(idx); if (c < m.cols && idx >= pm[0] && idx <= pm[1]) m.pm[c] = true; });
    measures.push(m);
  }
  return measures;
}

// Tab als Schritte (Format der KI): ein Eintrag je Takt, z. B. „6-0 5-2h 5-4 4-2+3-2 - 1-3b“.
// Schritt = gleichzeitig gespielte Noten (mit +), Note = Saite-Bund (Saite 1 = oberste Tab-Zeile), „-“ = leerer Schritt.
// Anders als ASCII kann hier nichts verrutschen – jede Note steht ausdrücklich auf ihrer Saite und Position.
const STEP_NOTE_RE = /^(\d)[-:.](x|\d{1,2})((?:[hp/\\~]|b(?:1½|1\.5|½|0?\.5|1|2)?)*)$/i;
const bendOf = (t) => { const v = t.slice(1); return !v || v === '1' ? 1 : /^(?:½|0?\.5)$/.test(v) ? 0.5 : /^(?:1½|1\.5)$/.test(v) ? 1.5 : 2; };
export function parseTabBars(list, strings) {
  const measures = [];
  for (const raw of list) {
    const steps = String(raw || '').replace(/[|]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const cols = [];
    let notes = 0;
    for (const st of steps) {
      const col = Array(strings).fill(null);
      if (!/^[-–._r]+$/i.test(st)) {
        for (const tok of st.split('+')) {
          const m = tok.match(STEP_NOTE_RE);
          const s = m ? Number(m[1]) - 1 : -1;
          const f = m && m[2].toLowerCase() !== 'x' ? Number(m[2]) : null;
          if (!m || s < 0 || s >= strings || f > MAX_FRET) continue;
          const n = f == null ? { f: null, x: true } : { f };
          for (const t of m[3].match(/b[^hp/\\~b]*|[hp/\\~]/gi) || []) {
            if (t === '~') n.v = true;
            else if (/^b/i.test(t)) { if (f != null) n.b = bendOf(t); }
            else if (f != null) n.l = t.toLowerCase();
          }
          col[s] = n;
          notes++;
        }
      }
      cols.push(col);
    }
    if (!notes) continue;
    const m = newMeasure(Math.max(4, Math.min(64, cols.length)), strings);
    cols.slice(0, 64).forEach((col, c) => col.forEach((n, s) => { m.notes[s][c] = n; }));
    measures.push(m);
  }
  return measures;
}

// Tab aus Text (zum Einfügen im Tab-Editor): ASCII-Tab oder Schritte wie oben
export function parseTabText(text, strings) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const rows = lines.filter((l) => isTabLine(l));
  if (rows.length >= strings) {
    const measures = [];
    const tidy = tidyTabRows(rows);
    for (let g = 0; g + strings <= tidy.length; g += strings) measures.push(...parseTabGroup(tidy.slice(g, g + strings), null));
    return measures;
  }
  return parseTabBars(lines.filter((l) => l.trim()), strings);
}

// KI-Tabzeilen angleichen: Gedankenstriche → „-“, alle Zeilen einer Gruppe gleich lang (sonst verrutschen Töne)
function tidyTabRows(list) {
  const rows = list.map((r) => String(r || '').replace(/[–—]/g, '-').replace(/\s+$/, ''));
  const len = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => (r.endsWith('|') ? r.slice(0, -1).padEnd(len - 1, '-') + '|' : r.padEnd(len, '-')));
}

// Wie viele Zeilen bilden ein Tab-System? Ukulele-Tabs erkennt man an den Saitennamen A E C G.
const label = (raw) => (raw.match(/^\s*([A-Ha-h][#b]?)\s*[|:]/) || [])[1]?.toUpperCase() || '';
function tabGroupSize(group) {
  const ukeLabels = group.length >= 4 && ['A', 'E', 'C', 'G'].every((l, k) => label(group[k]) === l);
  if (group.length % 4 === 0 && (ukeLabels || group.length % 6 !== 0)) return 4;
  if (group.length >= 6 && group.length % 6 === 0) return 6;
  return 0;
}

function parseTuning(text) {
  const t = text.trim().replace(/\(.*\)/, '').trim();
  const low = t.toLowerCase();
  const compact = low.replace(/[\s,-]+/g, '');
  if (/^g?cea$|^low\s*g|^standard\s*(uke|ukulele)/.test(compact) || compact === 'gcea') return '';
  const uke = UKE_TUNINGS.find((u) => u.notes.toLowerCase().replace(/\s+/g, '') === compact || u.name.toLowerCase() === low);
  if (uke) return uke === UKE_TUNINGS[0] ? '' : uke.notes;
  const alias = [
    [/^(e[\s-]?)?standard|^eadgbe$|^normal/, 0], [/drop\s*d$/, 1], [/half|halbton|^eb|^e♭/, 2],
    [/^d[\s-]?standard|whole step|ganzton/, 3], [/drop\s*c/, 4], [/dadgad/, 5], [/open\s*g/, 6], [/open\s*d/, 7], [/open\s*e/, 8],
  ].find(([re]) => re.test(low));
  if (alias) return alias[1] === 0 ? '' : TUNINGS[alias[1]].notes;
  const notes = t.match(/[A-G][#b]?/g);
  if (notes && (notes.length === 6 || notes.length === 4)) return notes.join(' ');
  return '';
}

function parseMeta(line, out, labelled) {
  let m, hit = false;
  if ((m = line.match(/^(?:title|titel|song(?:titel)?)\s*[:=]\s*(.+)$/i))) { out.title = m[1].trim(); return true; }
  if ((m = line.match(/^(?:artist|künstler|kuenstler|interpret|band)\s*[:=]\s*(.+)$/i))) { out.artist = m[1].trim(); return true; }
  if ((m = line.match(/^(?:key|tonart)\s*[:=]?\s*([A-H][#b]?(?:m|moll|dur|major|minor)?)\b/i))) { out.notes.push(`Tonart: ${m[1]}`); return true; }
  if ((m = line.match(/^(?:tuning|stimmung)\s*[:=]?\s*(.+)$/i))) { out.tuning = parseTuning(m[1]); if (!out.tuning && !/standard/i.test(m[1])) out.notes.push(`Stimmung: ${m[1].trim()}`); return true; }
  if (!labelled && line.length > 70) return false;
  if (/\b(?:no|kein|ohne)\s+(?:capo|kapo)\b/i.test(line)) { out.capo = 0; hit = true; }
  else if ((m = line.match(/\b(?:capo|kapo)\b\D{0,14}?(\d{1,2})/i) || line.match(/\b(\d{1,2})(?:st|nd|rd|th|\.)?\s*(?:fret|bund)\b.{0,10}\b(?:capo|kapo)\b/i))) { out.capo = Math.min(12, Number(m[1])); hit = true; }
  if ((m = line.match(/\b(\d{2,3})\s*bpm\b/i) || line.match(/^(?:tempo|bpm)\s*[:=]?\s*(\d{2,3})\b/i))) { out.bpm = Number(m[1]); hit = true; }
  if ((m = line.match(/\b(?:time(?:\s*signature)?|takt(?:art)?)\s*[:=]?\s*(\d{1,2}\/\d{1,2})\b/i))) { out.timeSig = m[1]; hit = true; }
  return hit;
}

function titleFrom(line, out) {
  const clean = (s) => s.replace(/\s+(?:chords?|tabs?|akkorde|lyrics|songtext)\s*$/i, '').replace(/^["„“']|["“”']$/g, '').trim();
  let m = line.match(/^(.+?)\s+(?:chords?|tabs?|akkorde|lyrics|songtext)\s+(?:by|von)\s+(.+)$/i) || line.match(/^(.+?)\s+(?:by|von)\s+(.+)$/i);
  if (!m) m = line.match(/^(.+?)\s+[-–—|]\s+(.+)$/);
  if (m) { out.title = clean(m[1]); out.artist = clean(m[2]); } else out.title = clean(line);
}

// ---------- Hauptfunktion ----------
export function parseText(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out = { title: '', artist: '', capo: 0, tuning: '', bpm: null, timeSig: '', notes: [], sections: [], strumDefault: null, instrument: null, shapes: [] };
  if (/\b(?:ukulele|uke|ukelele)\b/i.test(text || '')) out.instrument = 'ukulele';
  let sec = null, music = false, tabTarget = null, pendingStrum = false;

  const newSec = (name, auto = false) => {
    sec = { name, auto, segs: [], strums: [], tabs: [], tabReps: [], lyrics: [], plain: [], repeatOf: null, rep: 1 };
    out.sections.push(sec);
    tabTarget = null;
    return sec;
  };
  const cur = () => sec || newSec('Song', true);
  const pushText = (inline, plain) => {
    const s = cur();
    s.lyrics.push(inline);
    s.plain.push(plain);
    tabTarget = null;
  };
  const addChords = (cl) => { cur().segs.push({ names: cl.chords.map((c) => c.name), repeat: cl.repeat }); music = true; };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      if (sec && sec.lyrics.length && sec.lyrics[sec.lyrics.length - 1] !== '') { sec.lyrics.push(''); sec.plain.push(''); }
      continue;
    }

    // ChordPro-Anweisungen {title: …}, {soc}, {c: …}
    let m = line.match(/^\{\s*([\w-]+)\s*(?::\s*(.*?))?\s*\}$/);
    if (m) {
      const k = m[1].toLowerCase(), v = (m[2] || '').trim();
      if (k === 'title' || k === 't') out.title = v;
      else if (['subtitle', 'st', 'artist', 'a'].includes(k)) out.artist = v;
      else if (['capo', 'key', 'tempo', 'time', 'tuning'].includes(k)) parseMeta(`${k === 'time' ? 'Takt' : k}: ${v}${k === 'tempo' ? ' bpm' : ''}`, out, true);
      else if (['comment', 'c', 'ci', 'cb'].includes(k)) pushText(v, v);
      else if (/^(start_of_|so)(chorus|c)$/.test(k) || k === 'soc') newSec(v || 'Chorus');
      else if (/^(start_of_verse|sov)$/.test(k)) newSec(v || 'Verse');
      else if (/^(start_of_bridge|sob)$/.test(k)) newSec(v || 'Bridge');
      else if (/^(start_of_tab|sot)$/.test(k)) { if (!sec) newSec(v || 'Tab'); }
      continue;
    }

    // Zeile nur mit dem Instrument
    if (/^(?:ukulele|uke|ukelele|gitarre|guitar)$/i.test(line)) { out.instrument = /^g/i.test(line) ? 'guitar' : 'ukulele'; continue; }

    // Eigener Griff: „Griff Abm: 4 3 4 2“ – 4 Werte = Ukulele, 6 = Gitarre
    m = line.match(/^(?:griff|grip|shape)\s+([A-H]\S{0,10}?)\s*[:=]\s*(.+)$/i);
    if (m) {
      const n = m[2].trim().split(/[\s,]+/).length;
      if (n === 4) out.instrument = 'ukulele';
      const shape = parseShape({ name: m[1], frets: m[2] }, n === 4 ? 'ukulele' : 'guitar');
      if (shape) { out.shapes.push(shape); continue; }
    }

    // ASCII-Tabs (Gruppen von 6 Zeilen = Gitarre, 4 Zeilen = Ukulele)
    if (isTabLine(raw)) {
      const group = [];
      let j = i;
      while (j < lines.length && isTabLine(lines[j])) group.push(lines[j++]);
      const n = tabGroupSize(group);
      if (n) {
        if (n === 4) out.instrument = 'ukulele';
        const pmLine = i > 0 && isPmLine(lines[i - 1]) ? lines[i - 1] : null;
        for (let g = 0; g < group.length; g += n) {
          const measures = parseTabGroup(group.slice(g, g + n), pmLine);
          if (!measures.length) continue;
          if (!tabTarget) { tabTarget = []; cur().tabs.push(tabTarget); cur().tabReps.push(1); }
          tabTarget.push(...measures);
        }
        music = true;
        i = j - 1;
        continue;
      }
      if (group.every((r) => !/\d/.test(r))) { i = j - 1; continue; } // reine Trennlinien
    }
    if (isPmLine(raw) && i + 1 < lines.length && isTabLine(lines[i + 1])) continue;

    // „Tab:“ über einem Tab ist nur eine Beschriftung
    if (TAB_LABEL_RE.test(line)) continue;

    // „x2“ allein: Wiederholung des Tabs bzw. der Akkordfolge direkt davor
    m = line.match(REP_LINE_RE);
    if (m && sec && (tabTarget || sec.segs.length)) {
      const n = repOf(m[1], m[2]);
      if (tabTarget) sec.tabReps[sec.tabs.indexOf(tabTarget)] = n;
      else sec.segs[sec.segs.length - 1].repeat = n;
      continue;
    }

    // „Chorus x2“, „Strophe 2 wie Strophe 1“, „Refrain wiederholen“, „wie Intro“
    const named = (n) => { const k = secKey(niceName(n)); return out.sections.find((s) => secKey(s.name) === k)?.name || niceName(n); };
    if ((m = line.match(CUE_REP_RE))) {
      const prev = named(m[1]);
      newSec(niceName(m[1]));
      if (out.sections.some((s) => s !== sec && s.name === prev)) sec.repeatOf = prev;
      sec.rep = repOf(m[2], m[3]);
      music = true;
      continue;
    }
    if ((m = line.match(CUE_LIKE_RE))) {
      newSec(niceName(m[1]));
      sec.repeatOf = named(m[2]);
      sec.rep = repOf(m[3], m[4]);
      music = true;
      continue;
    }
    if ((m = line.match(CUE_AGAIN_RE))) {
      const name = named(m[1] || m[2]);
      newSec(name);
      sec.repeatOf = name;
      sec.rep = repOf(m[3], m[4]);
      music = true;
      continue;
    }
    if (LEGEND_RE.test(line)) continue;
    if (sec && (m = line.match(LIKE_PREV_RE))) {
      const i0 = out.sections.indexOf(sec);
      if (i0 > 0) {
        sec.repeatOf = out.sections[i0 - 1].name;
        const rest = (m[1] || '').trim();
        if (rest) { const t = rest.replace(/^(?:spielweise|anschlag|strum)\s*[:=]\s*/i, ''); if (PLAY_RE.test(rest) || parseStrum(t, true) || STROKES_RE.test(t)) sec.strums.push(rest); else pushText(rest, rest); }
        continue;
      }
    }
    if (sec && (m = line.match(LIKE_RE))) {
      sec.repeatOf = named(m[1]);
      if (repOf(m[2], m[3]) > 1) sec.rep = repOf(m[2], m[3]);
      continue;
    }

    // Abschnittsüberschrift
    const hd = parseHeader(raw);
    if (hd) {
      const prev = out.sections.find((s) => secKey(s.name) === secKey(hd.name));
      newSec(hd.name);
      if (prev) sec.repeatOf = prev.name;
      music = true;
      if (hd.rest) {
        const cl = chordLine(hd.rest);
        if (cl) addChords(cl);
        else if (parseStrum(hd.rest)) sec.strums.push(hd.rest.trim());
        else pushText(hd.rest, hd.rest);
      }
      continue;
    }

    // Anschlagmuster mit Bezeichnung
    m = line.match(/^(?:strumming(?:\s*pattern)?|strum|anschlag(?:muster)?|schlagmuster|spielweise|zupfmuster|plucking|picking|rhythm(?:us)?|pattern)\s*[:=]?\s*(.*)$/i);
    if (m && !/^[^:=]*[:=]/.test(line) && !parseStrum(m[1], true)) m = null; // z. B. Liedzeile „Rhythm is a dancer“
    if (m) {
      const t = m[1].trim();
      if (t) { if (sec) sec.strums.push(t); else out.strumDefault = t; } else pendingStrum = true;
      continue;
    }
    if (pendingStrum) {
      pendingStrum = false;
      if (parseStrum(line, true)) { if (sec) sec.strums.push(line); else out.strumDefault = line; continue; }
    }

    // Metadaten (vor dem ersten Abschnitt oder mit Bezeichnung)
    const labelled = /^(?:title|titel|artist|künstler|interpret|band|capo|kapo|key|tonart|tuning|stimmung|tempo|bpm|time|takt)\b/i.test(line);
    if ((!out.sections.length || labelled) && parseMeta(line, out, labelled)) continue;

    if (isCountLine(line)) continue;

    // Akkord mit Spielweise: „Abm  P(1,3,4) – P2 ×2“ (mehrere solche Zeilen bilden eine Folge)
    const pl = playLine(line);
    if (pl) {
      const s = cur();
      const last = s.segs[s.segs.length - 1];
      if (last && last.notes && s.lastPlay === i - 1) { last.names.push(pl.name); last.notes.push(pl.play); last.reps.push(pl.rep); } else s.segs.push({ names: [pl.name], notes: [pl.play], reps: [pl.rep], repeat: 1 });
      s.lastPlay = i;
      music = true;
      continue;
    }

    // Akkordzeile – ggf. mit Liedtext darunter zusammenführen
    const cl = chordLine(raw);
    if (cl) {
      addChords(cl);
      const next = lines[i + 1];
      // Nur ausgerichtete Akkorde (mit Abständen) gehören über eine Liedzeile; „C Am Em G“ ist eine Liste
      const aligned = cl.chords.length === 1 || /\S {2,}\S/.test(raw.trim());
      if (aligned && next && next.trim() && !chordLine(next) && !parseHeader(next) && !isTabLine(next) && !parseStrum(next) && !isCountLine(next.trim()) && !STRUM_LABEL_RE.test(next.trim()) && !META_LABEL_RE.test(next.trim()) && !/^\{/.test(next.trim())) {
        let merged = next.replace(/\s+$/, '');
        // Akkorde hinter dem Textende rücken direkt an den Text heran (ohne lange Leerräume)
        const textEnd = merged.length;
        cl.chords.filter((c) => c.idx > textEnd).sort((a, b) => a.idx - b.idx).forEach((c, k) => { c.idx = textEnd + 1 + k; });
        for (const c of [...cl.chords].sort((a, b) => b.idx - a.idx)) {
          if (c.idx > merged.length) merged = merged.padEnd(c.idx, ' ');
          merged = merged.slice(0, c.idx) + `[${c.name}]` + merged.slice(c.idx);
        }
        pushText(merged.trim(), next.trim());
        i++;
      }
      continue;
    }

    // ChordPro-Zeile mit Inline-Akkorden
    const inl = inlineChords(line);
    if (inl.length) {
      cur().segs.push({ names: inl, repeat: 1 });
      music = true;
      pushText(line, line.replace(INLINE_RE, (all, c) => (isChordName(c) ? '' : all)).replace(/\s{2,}/g, ' ').trim());
      continue;
    }

    // Anschlagmuster ohne Bezeichnung
    if (parseStrum(line)) { if (sec) sec.strums.push(line); else out.strumDefault = line; continue; }

    // Titel / Notizen vor der Musik, danach Liedtext
    if (!music && !out.sections.length) {
      if (!out.title && line.length <= 80) titleFrom(line, out);
      else out.notes.push(line);
      continue;
    }
    pushText(line, line);
  }

  for (const s of out.sections) {
    while (s.lyrics.length && s.lyrics[s.lyrics.length - 1] === '') { s.lyrics.pop(); s.plain.pop(); }
  }
  const first = out.sections[0];
  if (first && first.auto && out.sections.length > 1) first.name = 'Intro';
  resolveRepeats(out);
  if (out.strumDefault) {
    const target = out.sections.find((s) => s.segs.length) || out.sections[0];
    if (target && !target.strums.length) target.strums.push(out.strumDefault);
  }
  return out;
}

// Antwort des KI-Assistenten (siehe SONG_SCHEMA in ai.js) → Struktur wie parseText().
// Tabs kommen als ASCII-Zeilen und laufen durch denselben Tab-Parser wie eingefügter Text.
export function fromAi(res, inst) {
  const out = { title: '', artist: '', capo: 0, tuning: '', bpm: null, timeSig: '', notes: [], sections: [], strumDefault: null, instrument: inst, ai: true };
  if (!res || typeof res !== 'object') return out;
  const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  out.title = str(res.title);
  out.artist = str(res.artist);
  out.capo = Number.isInteger(res.capo) && res.capo > 0 && res.capo <= 12 ? res.capo : 0;
  out.bpm = Number.isInteger(res.bpm) && res.bpm >= 30 && res.bpm <= 300 ? res.bpm : null;
  out.timeSig = /^\d{1,2}\/\d{1,2}$/.test(str(res.timeSig)) ? str(res.timeSig) : '';
  if (str(res.key)) out.notes.push(`Tonart: ${str(res.key, 20)}`);
  // Song-Notizen: Angaben wie „Capo 2“ oder „Tempo 90“ in ihre Felder, nur der Rest bleibt Notiz
  const songNotes = str(res.notes, 4000).split('\n').filter((l) => {
    const t = l.trim();
    if (!t) return false;
    const before = out.notes.length;
    if (META_LABEL_RE.test(t) && parseMeta(t, out, true)) { out.notes.length = before; return /^(?:key|tonart)/i.test(t) && !str(res.key); }
    return true;
  }).join('\n').trim();
  if (songNotes) out.notes.push(songNotes);
  for (const raw of Array.isArray(res.sections) ? res.sections.slice(0, 40) : []) {
    if (!raw || typeof raw !== 'object') continue;
    const sec = { name: niceName(str(raw.name, 40) || 'Abschnitt'), segs: [], strums: [], tabs: [], tabReps: [], lyrics: [], plain: [], repeatOf: str(raw.sameAs, 40) ? niceName(str(raw.sameAs, 40)) : null, rep: 1, comment: '' };
    const fix = (c) => str(c, 14).replace(/♯/g, '#').replace(/♭/g, 'b');
    const rep = Number.isInteger(raw.repeat) && raw.repeat > 1 && raw.repeat <= 16 ? raw.repeat : 1;
    const steps = (Array.isArray(raw.steps) ? raw.steps : []).filter((x) => x && isChordName(fix(x.chord)));
    const names = steps.length ? steps.map((x) => fix(x.chord)) : (Array.isArray(raw.chords) ? raw.chords : []).map(fix).filter(isChordName);
    if (steps.length) {
      const parts = steps.map((x) => splitRep(str(x.play, 300)));
      const reps = steps.map((x, k) => (Number.isInteger(x.repeat) && x.repeat > 1 && x.repeat <= 16 ? x.repeat : parts[k].rep));
      sec.segs.push({ names, notes: parts.map((p) => p.text), reps, repeat: rep });
    }
    else if (names.length) sec.segs.push({ names, repeat: rep });
    if (str(raw.strum, 200)) sec.strums.push(str(raw.strum, 200));
    sec.comment = absorbHints(sec, str(raw.comment, 2000));
    const tabRep = Number.isInteger(raw.tabRepeat) && raw.tabRepeat > 1 && raw.tabRepeat <= 16 ? raw.tabRepeat : 1;
    // Bevorzugt Schritte (tabBars), sonst ASCII-Zeilen (tab)
    const bars = parseTabBars((Array.isArray(raw.tabBars) ? raw.tabBars : []).filter((x) => typeof x === 'string').slice(0, 64), stringsOf(inst));
    const rows = bars.length ? [] : tidyTabRows(Array.isArray(raw.tab) ? raw.tab : []).filter((r) => isTabLine(r));
    const n = tabGroupSize(rows) || (rows.length === stringsOf(inst) ? rows.length : 0);
    if (bars.length) { sec.tabs.push(bars); sec.tabReps.push(tabRep); }
    else if (n) {
      const measures = [];
      for (let g = 0; g + n <= rows.length; g += n) measures.push(...parseTabGroup(rows.slice(g, g + n), null));
      if (measures.length) { sec.tabs.push(measures); sec.tabReps.push(tabRep); }
    } else if (rows.length) sec.comment = [sec.comment, rows.join('\n')].filter(Boolean).join('\n');
    const text = str(raw.lyrics, 20000);
    if (text) {
      for (const line of text.split('\n')) {
        sec.lyrics.push(line.replace(/\s+$/, ''));
        sec.plain.push(line.replace(INLINE_RE, (all, c) => (isChordName(c) ? '' : all)).replace(/\s{2,}/g, ' ').trim());
        if (!names.length) { const inl = inlineChords(line); if (inl.length) { if (!sec.segs.length) sec.segs.push({ names: [], repeat: 1 }); sec.segs[0].names.push(...inl); } }
      }
    }
    if (sec.segs.length || sec.strums.length || sec.tabs.length || sec.lyrics.length || sec.comment || sec.repeatOf) out.sections.push(sec);
  }
  resolveRepeats(out);
  out.notes = [...new Set(out.notes)];
  out.shapes = (Array.isArray(res.shapes) ? res.shapes.slice(0, 24) : []).map((x) => parseShape(x, inst)).filter(Boolean);
  return out;
}

// Hinweise der KI, für die es ein Feld gibt („×2“, „wie Chorus“, „Anschlag: DDU“), umsetzen; der Rest bleibt Notiz
function absorbHints(sec, text) {
  return text.split('\n').filter((l) => {
    const t = l.trim();
    if (!t) return false;
    let m;
    if ((m = t.match(REP_LINE_RE))) {
      const n = repOf(m[1], m[2]);
      const g = sec.segs[sec.segs.length - 1];
      if (g && g.repeat < 2) { g.repeat = n; return false; }
      if (sec.tabs.length && sec.tabReps[sec.tabReps.length - 1] < 2) { sec.tabReps[sec.tabReps.length - 1] = n; return false; }
      return true;
    }
    if ((m = t.match(LIKE_RE))) { sec.repeatOf = niceName(m[1]); return false; }
    if ((m = t.match(/^(?:strumming(?:\s*pattern)?|strum|anschlag(?:muster)?|schlagmuster|spielweise|zupfmuster|plucking|picking)\s*[:=]\s*(.+)$/i))) { sec.strums.push(m[1].trim()); return false; }
    return true;
  }).join('\n').trim();
}

// „Strophe 2 wie Strophe 1“ / „Refrain wiederholen“: Der Abschnitt bekommt Akkorde, Anschlag und Tabs des Vorbilds
// (ohne Liedtext) – so steht beim Spielen alles da, ohne zurückzublättern.
function resolveRepeats(out) {
  out.sections.forEach((s, i) => {
    if (!s.repeatOf) return;
    const own = s.segs.some((g) => g.names.length) || s.tabs.length;
    const src = out.sections.slice(0, i).find((x) => secKey(x.name) === secKey(s.repeatOf) && (x.segs.some((g) => g.names.length) || x.tabs.length));
    if (own || !src) return;
    s.segs = JSON.parse(JSON.stringify(src.segs));
    if (!s.strums.length) s.strums = [...src.strums];
    s.tabs = JSON.parse(JSON.stringify(src.tabs));
    s.tabReps = [...(src.tabReps || src.tabs.map(() => 1))];
    s.repeatOf = null;
  });
}

// Griffbild der KI („x 3 2 0 1 0“ oder „x32010“) prüfen; ungültige werden verworfen
function parseShape(raw, inst) {
  if (!raw || typeof raw !== 'object') return null;
  const n = stringsOf(inst);
  const toks = (v) => { const s = String(v || '').trim().toLowerCase(); return /[\s,]/.test(s) ? s.split(/[\s,]+/).filter(Boolean) : [...s]; };
  const name = String(raw.name || '').trim().slice(0, 14).replace(/♯/g, '#').replace(/♭/g, 'b');
  if (!isChordName(name)) return null;
  const frets = toks(raw.frets).map((t) => (t === 'x' || t === '-1' || t === '-' ? -1 : Number(t)));
  if (frets.length !== n || frets.some((f) => !Number.isInteger(f) || f < -1 || f > 24) || frets.every((f) => f < 0)) return null;
  let fingers = toks(raw.fingers).map((t) => (t === 't' ? 5 : t === 'x' ? 0 : Number(t)));
  if (fingers.length !== n || fingers.some((f) => !Number.isInteger(f) || f < 0 || f > 5)) fingers = frets.map(() => 0);
  const fretted = frets.filter((f) => f > 0);
  const base = !fretted.length || Math.max(...fretted) <= 4 ? 1 : Math.min(...fretted);
  return { name, frets, fingers, base, showFingers: fingers.some((f) => f > 0) };
}

// Griffe der KI als songeigene Griffe speichern und mit den passenden Akkorden verknüpfen
export async function saveShapes(shapes, songId, sections) {
  if (!shapes?.length) return 0;
  const made = new Map();
  for (const s of shapes) {
    if (made.has(s.name)) continue;
    const ch = { ...s, id: 'u' + uid(), songId, createdAt: now() };
    await saveUserChord(ch);
    made.set(s.name, ch);
  }
  for (const sec of sections) for (const b of sec.blocks) if (b.type === 'chords') for (const it of b.items) if (!it.chordId && made.has(it.name)) it.chordId = made.get(it.name).id;
  return made.size;
}

// Wiederholte Folgen zusammenfassen: G D Em C G D Em C → G D Em C ×2
export function collapse(names) {
  const n = names.length;
  for (let p = 1; p <= n / 2; p++) {
    if (n % p) continue;
    let ok = true;
    for (let i = p; i < n && ok; i++) ok = names[i] === names[i % p];
    if (ok) return { items: names.slice(0, p), repeat: n / p };
  }
  return { items: names, repeat: 1 };
}

// Erzeugt Abschnitte, Blöcke und Tabs für einen (neuen oder vorhandenen) Song.
export function buildSections(parsed, songId, { lyrics = true, inline = true } = {}) {
  const sections = [], tabs = [];
  for (const s of parsed.sections) {
    // „Chorus ×2“: Wiederholung des ganzen Abschnitts gehört an die eine Akkordfolge bzw. den einen Tab,
    // nur wenn es mehrere gibt, steht sie am Namen
    const rep = s.rep > 1 ? s.rep : 1;
    const withPlay = s.segs.some((g) => g.notes);
    const nChords = withPlay ? s.segs.filter((g) => g.names.length).length : s.segs.some((g) => g.names.length) ? 1 : 0;
    const repAt = rep < 2 ? null : nChords === 1 && !s.tabs.length ? 'chords' : !nChords && s.tabs.length === 1 ? 'tab' : 'name';
    const sec = newSection(repAt === 'name' ? `${s.name} ×${rep}` : s.name);
    if (s.comment) sec.blocks.push(newBlock('notes', { text: s.comment }));
    if (withPlay) {
      // Mit Spielweisen: jede Folge als eigener Block, Wiederholung bleibt Wiederholung
      for (const g of s.segs) {
        if (!g.names.length) continue;
        const items = g.names.map((n, k) => { const it = newChordItem(n); if (g.notes?.[k]) it.note = g.notes[k]; if (g.reps?.[k] > 1) it.rep = g.reps[k]; return it; });
        sec.blocks.push(newBlock('chords', { items, repeat: Math.min(16, (g.repeat || 1) * (repAt === 'chords' ? rep : 1)) }));
      }
    } else {
      const once = s.segs.flatMap((g) => Array.from({ length: g.repeat }, () => g.names).flat());
      const names = repAt === 'chords' ? Array.from({ length: rep }, () => once).flat() : once;
      if (names.length) {
        const { items, repeat } = collapse(names);
        sec.blocks.push(newBlock('chords', { items: items.map((n) => newChordItem(n)), repeat }));
      }
    }
    // Anschlag gehört als Spielweise zur Akkordfolge (steht in der Ansicht über den Akkorden)
    if (s.strums.length) {
      const text = s.strums.join(' · ');
      const target = sec.blocks.find((b) => b.type === 'chords');
      if (target) target.play = text; else sec.blocks.push(newBlock('notes', { text: `Anschlag: ${text}` }));
    }
    s.tabs.forEach((measures, k) => {
      const t = newTab(songId, s.tabs.length > 1 ? `${s.name}-Tab ${k + 1}` : `${s.name}-Tab`);
      t.measures = measures;
      tabs.push(t);
      const r = Math.min(16, (s.tabReps?.[k] || 1) * (repAt === 'tab' ? rep : 1));
      sec.blocks.push(newBlock('tab', r > 1 ? { tabId: t.id, repeat: r } : { tabId: t.id }));
    });
    const text = lyrics ? (inline ? s.lyrics : s.plain).join('\n').trim() : '';
    if (text) sec.blocks.push(newBlock('notes', { text }));
    if (!sec.blocks.length && s.repeatOf) sec.blocks.push(newBlock('notes', { text: `Wie ${s.repeatOf}` }));
    sections.push(sec);
  }
  return { sections, tabs };
}

export const EXAMPLE = `Sommerabend am See – Beispielband
Capo: 2
Tempo: 92 BPM
Strumming: D - D U - U D U

[Intro]
G  D  Em  C

[Verse 1]
G              D
Die Sonne sinkt langsam ins Wasser
Em             C
und wir zählen die Sterne

[Chorus]
C        G        D
Bleib noch ein bisschen hier
C        G        D    G
der Abend gehört nur uns

[Solo]
e|-----3-----3----|----------------|
B|---3---3-----3--|--3h5--5p3------|
G|-0-------0------|-0---------2/4--|
D|----------------|----------------|
A|----------------|----------------|
E|----------------|----------------|

[Chorus]

[Outro]
G D Em C (x2)`;

// ---------- Oberfläche ----------
// mode: 'text' (Text erkennen, lokal), 'ai' (aus Beschreibung erzeugen) oder 'media' (Fotos / YouTube-Link mit KI)
// photos: bereits gespeicherte Fotos eines Songs, die im Modus 'media' vorausgewählt sind
export function openImporter({ intoSong = null, onDone, mode = 'text', photos = [] } = {}) {
  let parsed = null, aiResult = null, titleTouched = false, timer = 0, busy = false;
  let inst = intoSong ? instrumentOf(intoSong) : null, instTouched = !!intoSong;
  let kind = 'auto';
  const opts = { lyrics: true, inline: true };

  const ta = h('textarea', {
    class: 'field import-text', rows: 10, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
    placeholder: 'Notizen, Akkordblatt, ChordPro oder Tabs hier einfügen …\n\n[Verse]\nG        D\nLiedtext …\n\nCapo 2 · Strumming: D DU UDU',
  });
  const idea = h('textarea', {
    class: 'field idea-text', rows: 3, autocomplete: 'off',
    placeholder: 'Beschreibe, was du brauchst, z. B. „Melancholisches Arpeggio in Am“ oder „Lagerfeuer-Akkorde in G mit einfachem Anschlag“',
  });
  const titleIn = h('input', { type: 'text', placeholder: 'Titel', 'aria-label': 'Titel' });
  const artistIn = h('input', { type: 'text', placeholder: 'Optional', 'aria-label': 'Künstler' });
  titleIn.addEventListener('input', () => { titleTouched = true; });
  artistIn.addEventListener('input', () => { titleTouched = true; });
  const preview = h('div', { class: 'import-preview' });
  const aiState = h('div', { class: 'ai-state' });
  const fileIn = h('input', { type: 'file', accept: '.txt,.cho,.chopro,.pro,.crd,.chordpro,text/plain', class: 'hidden' });
  fileIn.addEventListener('change', async () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) { ta.value = await f.text(); aiResult = null; update(); } });

  const curInst = () => inst || parsed?.instrument || 'guitar';
  const instSeg = segmented(Object.entries(INSTRUMENTS).map(([value, i]) => ({ value, label: i.label })), curInst(), (v) => { inst = v; instTouched = true; update(); });

  function update() {
    if (mode !== 'text') parsed = aiResult || { title: '', artist: '', capo: 0, tuning: '', bpm: null, timeSig: '', notes: [], sections: [], instrument: null };
    else parsed = aiResult || parseText(ta.value);
    if (!instTouched && !inst) instSeg.set(curInst());
    if (!titleTouched) { titleIn.value = parsed.title; artistIn.value = parsed.artist; }
    const it = curInst();
    const meta = [it === 'ukulele' ? 'Ukulele' : '', parsed.capo ? `Capo ${parsed.capo}` : '', parsed.tuning ? tuningLabel(parsed.tuning, it) : '', parsed.bpm ? `${parsed.bpm} BPM` : '', parsed.timeSig].filter(Boolean);
    const { sections, tabs } = buildSections(parsed, 'preview', opts);
    const tabsById = new Map(tabs.map((t) => [t.id, t]));
    syncAiState();
    if (mode === 'text' && !ta.value.trim()) { fill(preview, h('p', { class: 'hint' }, 'Die Vorschau erscheint, sobald du Text einfügst.')); return; }
    if (mode !== 'text' && !aiResult) { fill(preview, h('p', { class: 'hint' }, 'Das Ergebnis erscheint hier, bevor etwas gespeichert wird.')); return; }
    fill(preview,
      parsed.ai && h('div', { class: 'ai-badge' }, icon('magic', 'small'), 'Ergebnis des KI-Assistenten – bitte prüfen'),
      meta.length > 0 && h('div', { class: 'meta-row' }, meta.map((p) => h('span', { class: 'meta-chip' }, p))),
      parsed.notes.length > 0 && h('p', { class: 'hint' }, `Notizen: ${parsed.notes.join(' · ')}`),
      parsed.shapes?.length > 0 && h('div', { class: 'ip-sec' }, h('div', { class: 'ip-name' }, 'Eigene Griffe für diesen Song'),
        h('div', { class: 'ip-shapes' }, parsed.shapes.map((c) => h('div', { class: 'chord-card mini', html: diagramSVG(c) })))),
      sections.length ? sections.map((sec) => {
        const ch = sec.blocks.find((b) => b.type === 'chords');
        const tx = sec.blocks.filter((b) => b.type === 'notes');
        const lines = tx.reduce((a, b) => a + b.text.split('\n').filter(Boolean).length, 0);
        return h('div', { class: 'ip-sec' },
          h('div', { class: 'ip-name' }, sec.name),
          ch && h('div', { class: 'ip-chords' }, ch.items.map((i) => i.name).join(' → ') + (ch.repeat > 1 ? `  ×${ch.repeat}` : '')),
          ch && ch.items.some((i) => i.note || i.rep > 1) && h('div', { class: 'ip-info' }, ch.items.filter((i) => i.note || i.rep > 1).map((i) => `${i.name}: ${[i.note, i.rep > 1 && '×' + i.rep].filter(Boolean).join(' ')}`).join(' · ')),
          ch?.play && h('div', { class: 'ip-info' }, `Anschlag: ${ch.play}`),
          sec.blocks.filter((b) => b.type === 'tab').map((b) => {
            const t = tabsById.get(b.tabId);
            return t && !isEmptyTab(t) && h('div', { class: 'ip-tab' }, tabView(t, { tuning: parsed.tuning, colW: 17, rowH: 12, top: 20, fs: 10, legend: false }));
          }),
          lines > 0 && h('div', { class: 'ip-info' }, lines === 1 ? '1 Textzeile' : `${lines} Textzeilen`));
      }) : h('p', { class: 'hint' }, mode !== 'text' ? 'Die KI hat nichts Verwertbares geliefert. Formuliere die Beschreibung genauer oder gib einen Hinweis.' : 'Keine Abschnitte oder Akkorde erkannt – der Text wird als Notiz übernommen.'));
  }
  ta.addEventListener('input', () => { aiResult = null; clearTimeout(timer); timer = setTimeout(update, 200); });

  // ---------- KI ----------
  const aiBtn = h('button', { class: 'btn block accent-btn', onClick: () => runAi('analyze') }, icon('magic', 'small'), 'Mit KI strukturieren');
  // Warum ein KI-Knopf gerade nicht geht (statt eines kommentarlos ausgegrauten Knopfs)
  const aiWhy = h('p', { class: 'hint btn-why' }), genWhy = h('p', { class: 'hint btn-why' }), mediaWhy = h('p', { class: 'hint btn-why' });
  const genBtn = h('button', { class: 'btn primary block', onClick: () => runAi('generate') }, icon('magic', 'small'), 'Mit KI erzeugen');
  const mediaBtn = h('button', { class: 'btn primary block', onClick: () => runAi('media') }, icon('magic', 'small'), 'Mit KI auswerten');

  // ---------- Fotos und YouTube-Link ----------
  // Einträge: { file } (neu aufgenommen/gewählt) oder { media } (bereits im Song gespeichert)
  const shots = photos.filter((m) => m.kind === 'image').map((m) => ({ media: m }));
  let keepPhotos = true, thumbUrls = [];
  const shotRow = h('div', { class: 'thumbs ai-thumbs' });
  const keepRow = h('div');
  const ytIn = h('input', { type: 'url', class: 'field', placeholder: 'YouTube-Link (optional), z. B. https://youtu.be/…', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', inputmode: 'url' });
  const ytInfo = h('p', { class: 'hint yt-info' });
  const mediaHint = h('textarea', { class: 'field idea-text', rows: 2, placeholder: 'Hinweis (optional), z. B. „nur das Intro-Riff“ oder „ab 2:30 wird der Refrain erklärt“' });
  const pickIn = (camera) => {
    const input = h('input', { type: 'file', accept: 'image/*', class: 'hidden', multiple: !camera, capture: camera ? 'environment' : null });
    input.addEventListener('change', () => { shots.push(...[...input.files].map((file) => ({ file }))); input.remove(); drawShots(); });
    document.body.append(input);
    input.click();
  };
  function drawShots() {
    thumbUrls.forEach((u) => URL.revokeObjectURL(u));
    thumbUrls = shots.map((x) => URL.createObjectURL(x.file || mediaBlob(x.media, !!x.media.thumb)));
    fill(shotRow, shots.map((x, k) => h('div', { class: 'thumb' },
      h('img', { src: thumbUrls[k], alt: '' }),
      h('button', { class: 'thumb-del', 'aria-label': 'Foto entfernen', onClick: () => { shots.splice(k, 1); drawShots(); } }, icon('close', 'small')))));
    const fresh = shots.filter((x) => x.file).length;
    fill(keepRow, fresh > 0 && h('div', { class: 'form-group', style: 'margin-top:10px' },
      formRow(fresh === 1 ? 'Foto im Song speichern' : 'Fotos im Song speichern', toggle(keepPhotos, (v) => { keepPhotos = v; }), 'unter „Fotos & Aufnahmen“')));
    syncAiState();
  }
  function checkYt() {
    const v = ytIn.value.trim();
    ytInfo.textContent = !v ? '' : youtubeUrl(v) ? 'YouTube-Video erkannt. Lange Videos brauchen viel vom kostenlosen Kontingent.' : 'Kein YouTube-Link erkannt. Andere Webseiten kann die KI hier nicht öffnen – kopiere deren Text unter „Text“.';
    ytInfo.classList.toggle('error-text', !!v && !youtubeUrl(v));
    syncAiState();
  }
  ytIn.addEventListener('input', checkYt);

  function syncAiState() {
    const why = aiUnavailable();
    aiBtn.disabled = busy || !!why || !ta.value.trim();
    genBtn.disabled = busy || !!why;
    mediaBtn.disabled = busy || !!why || (!shots.length && !youtubeUrl(ytIn.value));
    aiWhy.textContent = why ? `Nicht verfügbar: ${why}` : !ta.value.trim() ? 'Zuerst oben Text einfügen.' : '';
    genWhy.textContent = why ? `Nicht verfügbar: ${why}` : '';
    mediaWhy.textContent = why ? `Nicht verfügbar: ${why}` : !shots.length && !youtubeUrl(ytIn.value) ? 'Zuerst ein Foto oder einen YouTube-Link hinzufügen.' : '';
    if (busy) fill(aiState, h('div', { class: 'ai-busy' }, h('span', { class: 'spinner' }), mode === 'media' && youtubeUrl(ytIn.value) ? 'KI sieht sich das Video an … (kann einige Minuten dauern)' : 'KI arbeitet … (kann bis zu einer Minute dauern)'));
    else if (why) fill(aiState);
    else if (mode === 'text' && aiResult) fill(aiState, h('p', { class: 'hint' }, 'Vorschau zeigt das KI-Ergebnis. ', h('button', { class: 'link-btn', onClick: () => { aiResult = null; update(); } }, 'Zur lokalen Erkennung zurück')));
    else fill(aiState);
  }

  async function runAi(task) {
    const why = aiUnavailable();
    if (why) { toast(why, 3500); return; }
    const video = task === 'media' ? youtubeUrl(ytIn.value) : null;
    const text = task === 'analyze' ? ta.value.trim() : task === 'generate' ? idea.value.trim() : 'media';
    if (!text) { toast(task === 'analyze' ? 'Bitte zuerst Text einfügen.' : 'Bitte beschreibe kurz, was du brauchst.'); return; }
    if (task === 'media' && !shots.length && !video) { toast(ytIn.value.trim() ? 'Bitte einen gültigen YouTube-Link eingeben.' : 'Bitte ein Foto wählen oder einen YouTube-Link eingeben.'); return; }
    busy = true;
    syncAiState();
    try {
      const it = curInst();
      let req, media = [];
      if (task === 'media') {
        for (const x of shots.slice(0, 10)) media.push(imagePart(x.file ? await fileToAiImage(x.file) : mediaToAiImage(x.media)));
        if (video) media.push(youtubePart(video));
        req = mediaPrompt({ inst: it, photos: Math.min(shots.length, 10), video, hint: mediaHint.value.trim() });
      } else req = task === 'analyze' ? analyzePrompt({ text, inst: it }) : generatePrompt({ description: text, inst: it, kind });
      const res = await generateJSON({ ...req, schema: SONG_SCHEMA, temperature: task === 'generate' ? 0.8 : 0.2, media });
      aiResult = fromAi(res, it);
      if (video) aiResult.notes.push(`Quelle: ${video}`);
      if (task === 'analyze' && parsed && !aiResult.title) { aiResult.title = parsed.title; aiResult.artist = aiResult.artist || parsed.artist; }
      if (task === 'analyze' && parsed?.tuning) aiResult.tuning = parsed.tuning;
      if (!titleTouched && task === 'generate' && !aiResult.title) aiResult.title = text.slice(0, 60);
      if (!aiResult.sections.length) toast('Die KI hat keine Abschnitte geliefert.');
    } catch (e) {
      console.warn(e);
      toast(String(e.message || e), 4500);
    } finally {
      busy = false;
      update();
    }
  }

  // ---------- Übernehmen ----------
  async function create() {
    update();
    if (mode === 'text' && !ta.value.trim()) { toast('Bitte zuerst Text einfügen.'); return; }
    if (mode !== 'text' && !aiResult?.sections.length) { toast(mode === 'media' ? 'Bitte zuerst „Mit KI auswerten“ antippen.' : 'Bitte zuerst etwas mit der KI erzeugen.'); return; }
    // Neu aufgenommene Fotos auf Wunsch beim Song ablegen
    const keep = mode === 'media' && keepPhotos ? shots.filter((x) => x.file).map((x) => x.file) : [];
    if (!parsed.sections.length) {
      parsed.sections.push({ name: 'Notizen', segs: [], strums: [], tabs: [], lyrics: [...parsed.notes.splice(0)], plain: [], repeatOf: null });
      parsed.sections[0].plain = parsed.sections[0].lyrics;
    }
    const it = curInst();
    if (intoSong) {
      const { sections, tabs } = buildSections(parsed, intoSong.id, opts);
      await saveShapes(parsed.shapes, intoSong.id, sections);
      intoSong.sections.push(...sections);
      if (!intoSong.capo && parsed.capo) intoSong.capo = parsed.capo;
      if (!intoSong.tuning && parsed.tuning && parsed.tuning.split(' ').length === stringsOf(it)) intoSong.tuning = parsed.tuning;
      if (!intoSong.bpm && parsed.bpm) intoSong.bpm = parsed.bpm;
      if (!intoSong.timeSig && parsed.timeSig) intoSong.timeSig = parsed.timeSig;
      if (!intoSong.artist && parsed.artist) intoSong.artist = parsed.artist;
      if (parsed.notes.length && mode !== 'text') intoSong.notes = [intoSong.notes, ...parsed.notes].filter(Boolean).join('\n');
      await db.putMany(tabs.map((t) => ['tabs', t]));
      touch(intoSong);
      await db.flush();
      if (keep.length) await addImages(intoSong.id, keep);
      s.close();
      toast(`${sections.length} ${sections.length === 1 ? 'Abschnitt' : 'Abschnitte'} hinzugefügt`);
      onDone(intoSong);
      return;
    }
    const song = newSong(titleIn.value.trim() || (mode === 'ai' ? 'KI-Idee' : mode === 'media' ? 'Aus Foto/Video' : 'Importierter Song'), it);
    const tuning = parsed.tuning && parsed.tuning.split(' ').length === stringsOf(it) ? parsed.tuning : '';
    Object.assign(song, { artist: artistIn.value.trim(), capo: parsed.capo, tuning, bpm: parsed.bpm, timeSig: parsed.timeSig, notes: parsed.notes.join('\n') });
    const { sections, tabs } = buildSections(parsed, song.id, opts);
    await saveShapes(parsed.shapes, song.id, sections);
    song.sections = sections;
    await db.putMany([['songs', song], ...tabs.map((t) => ['tabs', t])]);
    if (keep.length) await addImages(song.id, keep);
    db.setSetting('lastInstrument', it);
    s.close();
    toast('Song erstellt');
    onDone(song);
  }

  // ---------- Aufbau ----------
  const KINDS = [['auto', 'Automatisch'], ['chords', 'Akkordfolge'], ['strum', 'Anschlag'], ['tab', 'Tab'], ['song', 'Ganzer Song']];
  const kindRow = h('div', { class: 'preset-row' });
  const drawKinds = () => kindRow.replaceChildren(...KINDS.map(([v, l]) => h('button', { class: 'pill' + (v === kind ? ' accent' : ''), 'aria-pressed': String(v === kind), onClick: () => { kind = v; drawKinds(); } }, l)));
  drawKinds();

  const setText = (t) => { ta.value = t; aiResult = null; titleTouched = false; update(); };
  const canPaste = !!navigator.clipboard?.readText;
  const textPane = h('div', null,
    h('p', { class: 'pane-intro' }, 'Text aus Apple Notizen, einer Webseite oder einem Akkordblatt einfügen. Abschnitte, Akkorde, Anschlag und Tabs werden ohne Internet erkannt.'),
    ta,
    h('div', { class: 'btn-row tool-row' },
      canPaste && h('button', { class: 'btn small', onClick: async () => {
        try { const t = await navigator.clipboard.readText(); if (t.trim()) setText(t); else toast('Die Zwischenablage ist leer.'); } catch { toast('Einfügen nicht erlaubt – lange ins Textfeld tippen und „Einfügen“ wählen.', 3500); }
      } }, icon('copy', 'small'), 'Einfügen'),
      h('button', { class: 'btn small', onClick: () => fileIn.click() }, icon('doc', 'small'), 'Datei'),
      h('button', { class: 'btn small', onClick: () => setText(EXAMPLE) }, 'Beispiel'),
      h('button', { class: 'btn small', onClick: () => setText('') }, 'Leeren')),
    fileIn,
    h('div', { class: 'ai-card' },
      h('div', { class: 'ai-card-head' }, icon('magic', 'small'), 'KI', h('span', { class: 'ai-card-opt' }, 'optional')),
      h('p', { class: 'hint' }, 'Reicht die automatische Erkennung nicht, ordnet Google Gemini den Text sauber in Abschnitte.'),
      aiBtn, aiWhy));
  const aiPane = h('div', null,
    h('p', { class: 'pane-intro' }, 'Beschreibe, was du brauchst. Die KI macht einen Vorschlag – gespeichert wird erst, wenn du „Erstellen“ tippst.'),
    idea,
    h('div', { class: 'form-label', style: 'margin-top:12px' }, 'Was soll entstehen?'),
    kindRow,
    h('div', { style: 'margin-top:14px' }, genBtn, genWhy));
  const songPhotos = intoSong ? h('div') : null;
  const mediaPane = h('div', null,
    h('p', { class: 'pane-intro' }, 'Die KI liest Fotos (Akkordblätter, Notizen, Tab-Screenshots) oder ein YouTube-Tutorial aus. Fotos und Link gehen dafür an Google Gemini.'),
    h('div', { class: 'form-label' }, '1 · Fotos'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onClick: () => pickIn(true) }, icon('camera', 'small'), 'Foto aufnehmen'),
      h('button', { class: 'btn small', onClick: () => pickIn(false) }, icon('photo', 'small'), 'Aus Mediathek'),
      songPhotos),
    shotRow,
    keepRow,
    h('div', { class: 'form-label', style: 'margin-top:14px' }, '2 · oder YouTube-Link'),
    ytIn,
    ytInfo,
    h('div', { class: 'form-label', style: 'margin-top:12px' }, '3 · Hinweis an die KI (optional)'),
    mediaHint,
    h('div', { style: 'margin-top:14px' }, mediaBtn, mediaWhy));
  if (songPhotos) listMedia(intoSong.id).then((all) => {
    const imgs = all.filter((m) => m.kind === 'image');
    if (imgs.length) fill(songPhotos, h('button', { class: 'btn small', onClick: () => { imgs.forEach((m) => { if (!shots.some((x) => x.media?.id === m.id)) shots.push({ media: m }); }); drawShots(); } }, `Fotos aus diesem Song (${imgs.length})`));
  });
  const PANES = { text: textPane, ai: aiPane, media: mediaPane };
  const panes = h('div');
  const modeSeg = segmented([{ value: 'text', label: 'Text' }, { value: 'ai', label: 'KI-Idee' }, { value: 'media', label: 'Foto & Video' }], mode, (v) => {
    mode = v; aiResult = null; titleTouched = false; panes.replaceChildren(PANES[v]); update();
    if (v === 'ai') idea.focus();
  });
  panes.append(PANES[mode] || textPane);
  drawShots();

  const body = h('div', { class: 'importer' },
    h('div', { style: 'margin-bottom:12px' }, modeSeg),
    panes,
    aiState,
    !intoSong && h('div', { class: 'form-label', style: 'margin-top:20px' }, 'Song'),
    !intoSong && h('div', { class: 'form-group' },
      formRow('Instrument', instSeg),
      formRow('Titel', titleIn),
      formRow('Künstler', artistIn)),
    h('div', { class: 'form-label', style: 'margin-top:20px' }, 'Vorschau'),
    preview,
    h('div', { class: 'form-label', style: 'margin-top:20px' }, 'Optionen'),
    h('div', { class: 'form-group' },
      formRow('Liedtext übernehmen', toggle(true, (v) => { opts.lyrics = v; update(); })),
      formRow('Akkorde im Text', toggle(true, (v) => { opts.inline = v; update(); }), 'als [G] über dem Liedtext')),
    h('p', { class: 'hint', style: 'margin-top:14px' }, 'Erkannt werden u. a. [Verse]/Chorus:, Akkordzeilen über dem Text, ChordPro, ASCII-Tabs (Gitarre 6, Ukulele 4 Zeilen), Anschlagmuster (D DU UDU), Capo, Stimmung und Tempo. Nur die KI-Knöpfe senden etwas an Google Gemini.'));

  const s = sheet({
    title: intoSong ? 'In Song importieren' : 'Song erstellen', body, full: true,
    left: { label: 'Abbrechen' }, right: { label: intoSong ? 'Hinzufügen' : 'Erstellen', bold: true, onClick: create },
    onClose: () => { window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet); thumbUrls.forEach((u) => URL.revokeObjectURL(u)); },
  });
  // Online/offline wechselt die KI-Knöpfe live
  const onNet = () => syncAiState();
  window.addEventListener('online', onNet);
  window.addEventListener('offline', onNet);
  update();
  if (mode === 'ai') idea.focus();
  return s;
}
