// Text-Importer: wandelt rohe Notizen, Akkordblätter (Akkorde über Liedtext), ChordPro und ASCII-Tabs
// vollständig lokal in einen strukturierten Song um (Gitarre: 6-zeilige Tabs, Ukulele: 4-zeilige Tabs).
// Optional kann der KI-Assistent (Google Gemini) Text analysieren oder aus einer Beschreibung etwas erzeugen;
// sein Ergebnis durchläuft dieselbe Vorschau. Ohne Schlüssel oder offline bleibt alles lokal.
import * as db from './storage.js';
import { h, fill, sheet, toggle, toast, icon, formRow, segmented } from './ui.js';
import { newSong, newSection, newBlock, newChordItem, TUNINGS, UKE_TUNINGS, INSTRUMENTS, touch, tuningLabel, instrumentOf, stringsOf } from './songs.js';
import { newTab, newMeasure, tabSVG, isEmptyTab } from './tabs.js';
import { isChordName } from './chords.js';
import { strumView } from './strumming.js';
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
  if (body.length < 3 || !/^[DUdu↓↑xX\-.*>]+$/.test(body)) return null;
  if (!forced && !/[Uu↑]/.test(body)) return null;
  const strokes = [];
  let acc = false;
  for (const c of body) {
    if (c === '>') { acc = true; continue; }
    const k = /[Dd↓]/.test(c) ? 'D' : /[Uu↑]/.test(c) ? 'U' : /[xX]/.test(c) ? 'X' : 'R';
    strokes.push(acc ? { k, a: true } : { k });
    acc = false;
  }
  return strokes.length <= 32 ? strokes : null;
}

const STRUM_LABEL_RE = /^(?:strumming(?:\s*pattern)?|strum|anschlag(?:muster)?|schlagmuster|rhythm(?:us)?|pattern)\s*[:=]/i;
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
    const r = raw.replace(/[–—]/g, '-');
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
  const edges = [-1, ...[...bars].sort((a, b) => a - b), Infinity];
  let pm = null;
  if (pmLine) { const a = pmLine.search(/P/i); const b = pmLine.replace(/\s+$/, '').length - 1; pm = [a, b]; }
  const measures = [];
  for (let k = 0; k < edges.length - 1; k++) {
    const inside = notes.filter((o) => o.idx > edges[k] && o.idx < edges[k + 1]);
    if (!inside.length) continue;
    const cols = [...new Set(inside.map((o) => o.idx))].sort((a, b) => a - b);
    const m = newMeasure(Math.max(4, Math.min(64, cols.length)), rows.length);
    inside.forEach((o) => { const c = cols.indexOf(o.idx); if (c < 64) m.notes[o.s][c] = o.n; });
    if (pm) cols.forEach((idx, c) => { if (c < m.cols && idx >= pm[0] && idx <= pm[1]) m.pm[c] = true; });
    measures.push(m);
  }
  return measures;
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
  const out = { title: '', artist: '', capo: 0, tuning: '', bpm: null, timeSig: '', notes: [], sections: [], strumDefault: null, instrument: null };
  if (/\b(?:ukulele|uke|ukelele)\b/i.test(text || '')) out.instrument = 'ukulele';
  let sec = null, music = false, tabTarget = null, pendingStrum = false;

  const newSec = (name, auto = false) => {
    sec = { name, auto, segs: [], strums: [], tabs: [], lyrics: [], plain: [], repeatOf: null };
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
          if (!tabTarget) { tabTarget = []; cur().tabs.push(tabTarget); }
          tabTarget.push(...measures);
        }
        music = true;
        i = j - 1;
        continue;
      }
      if (group.every((r) => !/\d/.test(r))) { i = j - 1; continue; } // reine Trennlinien
    }
    if (isPmLine(raw) && i + 1 < lines.length && isTabLine(lines[i + 1])) continue;

    // Abschnittsüberschrift
    const hd = parseHeader(raw);
    if (hd) {
      const prev = out.sections.find((s) => s.name.toLowerCase() === hd.name.toLowerCase());
      newSec(hd.name);
      if (prev) sec.repeatOf = prev.name;
      music = true;
      if (hd.rest) {
        const cl = chordLine(hd.rest);
        if (cl) addChords(cl);
        else if (parseStrum(hd.rest)) sec.strums.push(parseStrum(hd.rest));
        else pushText(hd.rest, hd.rest);
      }
      continue;
    }

    // Anschlagmuster mit Bezeichnung
    m = line.match(/^(?:strumming(?:\s*pattern)?|strum|anschlag(?:muster)?|schlagmuster|rhythm(?:us)?|pattern)\s*[:=]?\s*(.*)$/i);
    if (m && !/^[^:=]*[:=]/.test(line) && !parseStrum(m[1], true)) m = null; // z. B. Liedzeile „Rhythm is a dancer“
    if (m) {
      const st = parseStrum(m[1], true);
      if (st) { if (sec) sec.strums.push(st); else out.strumDefault = st; } else pendingStrum = true;
      continue;
    }
    if (pendingStrum) {
      pendingStrum = false;
      const st = parseStrum(line, true);
      if (st) { if (sec) sec.strums.push(st); else out.strumDefault = st; continue; }
    }

    // Metadaten (vor dem ersten Abschnitt oder mit Bezeichnung)
    const labelled = /^(?:title|titel|artist|künstler|interpret|band|capo|kapo|key|tonart|tuning|stimmung|tempo|bpm|time|takt)\b/i.test(line);
    if ((!out.sections.length || labelled) && parseMeta(line, out, labelled)) continue;

    if (isCountLine(line)) continue;

    // Akkordzeile – ggf. mit Liedtext darunter zusammenführen
    const cl = chordLine(raw);
    if (cl) {
      addChords(cl);
      const next = lines[i + 1];
      if (next && next.trim() && !chordLine(next) && !parseHeader(next) && !isTabLine(next) && !parseStrum(next) && !isCountLine(next.trim()) && !STRUM_LABEL_RE.test(next.trim()) && !META_LABEL_RE.test(next.trim()) && !/^\{/.test(next.trim())) {
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
    const st = parseStrum(line);
    if (st) { if (sec) sec.strums.push(st); else out.strumDefault = st; continue; }

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
  if (str(res.notes, 4000)) out.notes.push(str(res.notes, 4000));
  for (const raw of Array.isArray(res.sections) ? res.sections.slice(0, 40) : []) {
    if (!raw || typeof raw !== 'object') continue;
    const sec = { name: niceName(str(raw.name, 40) || 'Abschnitt'), segs: [], strums: [], tabs: [], lyrics: [], plain: [], repeatOf: null, comment: str(raw.comment, 2000) };
    const names = (Array.isArray(raw.chords) ? raw.chords : []).map((c) => str(c, 14).replace(/♯/g, '#').replace(/♭/g, 'b')).filter(isChordName);
    if (names.length) sec.segs.push({ names, repeat: Number.isInteger(raw.repeat) && raw.repeat > 1 && raw.repeat <= 16 ? raw.repeat : 1 });
    const st = str(raw.strum, 100) && parseStrum(str(raw.strum, 100), true);
    if (st) sec.strums.push(st);
    const rows = (Array.isArray(raw.tab) ? raw.tab : []).map((r) => String(r || '')).filter((r) => isTabLine(r));
    const n = tabGroupSize(rows) || (rows.length === stringsOf(inst) ? rows.length : 0);
    if (n) {
      const measures = [];
      for (let g = 0; g + n <= rows.length; g += n) measures.push(...parseTabGroup(rows.slice(g, g + n), null));
      if (measures.length) sec.tabs.push(measures);
    } else if (rows.length) sec.comment = [sec.comment, rows.join('\n')].filter(Boolean).join('\n');
    const text = str(raw.lyrics, 20000);
    if (text) {
      for (const line of text.split('\n')) {
        sec.lyrics.push(line.replace(/\s+$/, ''));
        sec.plain.push(line.replace(INLINE_RE, (all, c) => (isChordName(c) ? '' : all)).replace(/\s{2,}/g, ' ').trim());
        if (!names.length) { const inl = inlineChords(line); if (inl.length) { if (!sec.segs.length) sec.segs.push({ names: [], repeat: 1 }); sec.segs[0].names.push(...inl); } }
      }
    }
    if (sec.segs.length || sec.strums.length || sec.tabs.length || sec.lyrics.length || sec.comment) out.sections.push(sec);
  }
  return out;
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
    const sec = newSection(s.name);
    if (s.comment) sec.blocks.push(newBlock('notes', { text: s.comment }));
    const names = s.segs.flatMap((g) => Array.from({ length: g.repeat }, () => g.names).flat());
    if (names.length) {
      const { items, repeat } = collapse(names);
      sec.blocks.push(newBlock('chords', { items: items.map((n) => newChordItem(n)), repeat }));
    }
    for (const strokes of s.strums) sec.blocks.push(newBlock('strum', { strokes, grid: strokes.length > 8 && strokes.length % 4 === 0 && strokes.length >= 12 ? 16 : 8 }));
    s.tabs.forEach((measures, k) => {
      const t = newTab(songId, s.tabs.length > 1 ? `${s.name}-Tab ${k + 1}` : `${s.name}-Tab`);
      t.measures = measures;
      tabs.push(t);
      sec.blocks.push(newBlock('tab', { tabId: t.id }));
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
      sections.length ? sections.map((sec) => {
        const ch = sec.blocks.find((b) => b.type === 'chords');
        const tx = sec.blocks.filter((b) => b.type === 'notes');
        const lines = tx.reduce((a, b) => a + b.text.split('\n').filter(Boolean).length, 0);
        return h('div', { class: 'ip-sec' },
          h('div', { class: 'ip-name' }, sec.name),
          ch && h('div', { class: 'ip-chords' }, ch.items.map((i) => i.name).join(' → ') + (ch.repeat > 1 ? `  ×${ch.repeat}` : '')),
          sec.blocks.filter((b) => b.type === 'strum').map((b) => h('div', { class: 'ip-strum' }, strumView(b))),
          sec.blocks.filter((b) => b.type === 'tab').map((b) => {
            const t = tabsById.get(b.tabId);
            return t && !isEmptyTab(t) && h('div', { class: 'tab-scroll ip-tab', html: tabSVG(t, { tuning: parsed.tuning, colW: 17, rowH: 12, top: 20, fs: 10 }) });
          }),
          lines > 0 && h('div', { class: 'ip-info' }, lines === 1 ? '1 Textzeile' : `${lines} Textzeilen`));
      }) : h('p', { class: 'hint' }, mode !== 'text' ? 'Die KI hat nichts Verwertbares geliefert. Formuliere die Beschreibung genauer oder gib einen Hinweis.' : 'Keine Abschnitte oder Akkorde erkannt – der Text wird als Notiz übernommen.'));
  }
  ta.addEventListener('input', () => { aiResult = null; clearTimeout(timer); timer = setTimeout(update, 200); });

  // ---------- KI ----------
  const aiBtn = h('button', { class: 'btn small accent-btn', onClick: () => runAi('analyze') }, icon('magic', 'small'), 'Mit KI analysieren');
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
    if (busy) fill(aiState, h('div', { class: 'ai-busy' }, h('span', { class: 'spinner' }), mode === 'media' && youtubeUrl(ytIn.value) ? 'KI sieht sich das Video an … (kann einige Minuten dauern)' : 'KI arbeitet … (kann bis zu einer Minute dauern)'));
    else if (why) fill(aiState, h('p', { class: 'hint' }, mode !== 'text' ? `${why} Ohne KI: Text unter „Text“ einfügen – das funktioniert immer offline.` : `KI-Analyse nicht verfügbar: ${why} Die lokale Erkennung oben funktioniert trotzdem.`));
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

  const textPane = h('div', null,
    ta,
    h('div', { class: 'btn-row', style: 'margin:10px 0 6px' },
      h('button', { class: 'btn small', onClick: () => { ta.value = EXAMPLE; aiResult = null; titleTouched = false; update(); } }, 'Beispiel einfügen'),
      h('button', { class: 'btn small', onClick: () => fileIn.click() }, icon('doc', 'small'), 'Textdatei …'),
      h('button', { class: 'btn small', onClick: () => { ta.value = ''; aiResult = null; titleTouched = false; update(); } }, 'Leeren'),
      aiBtn),
    fileIn);
  const aiPane = h('div', null,
    idea,
    h('div', { class: 'form-label', style: 'margin-top:12px' }, 'Was soll entstehen?'),
    kindRow,
    h('div', { style: 'margin-top:12px' }, genBtn));
  const songPhotos = intoSong ? h('div') : null;
  const mediaPane = h('div', null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onClick: () => pickIn(true) }, icon('camera', 'small'), 'Foto aufnehmen'),
      h('button', { class: 'btn small', onClick: () => pickIn(false) }, icon('photo', 'small'), 'Aus Mediathek'),
      songPhotos),
    shotRow,
    keepRow,
    h('div', { class: 'form-label', style: 'margin-top:14px' }, 'YouTube-Video'),
    ytIn,
    ytInfo,
    h('div', { class: 'form-label', style: 'margin-top:12px' }, 'Hinweis an die KI'),
    mediaHint,
    h('div', { style: 'margin-top:12px' }, mediaBtn),
    h('p', { class: 'hint', style: 'margin-top:8px' }, 'Gut geeignet: Akkordblätter, handschriftliche Notizen, Tab-Screenshots, Gitarren- und Ukulele-Tutorials. Fotos und Link gehen dabei an Google Gemini.'));
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
    h('div', { class: 'form-group', style: 'margin-top:12px' },
      !intoSong && formRow('Instrument', instSeg),
      !intoSong && formRow('Titel', titleIn),
      !intoSong && formRow('Künstler', artistIn),
      formRow('Liedtext übernehmen', toggle(true, (v) => { opts.lyrics = v; update(); })),
      formRow('Akkorde im Text', toggle(true, (v) => { opts.inline = v; update(); }), 'als [G] über dem Liedtext')),
    h('div', { class: 'form-label' }, 'Vorschau'),
    preview,
    h('p', { class: 'hint', style: 'margin-top:14px' }, 'Lokal erkannt werden Abschnitte ([Verse], Chorus:, Strophe 2 …), Akkordzeilen über dem Text, ChordPro ([G]Text, {title: …}), ASCII-Tabs für Gitarre (6 Zeilen) und Ukulele (4 Zeilen) mit h, p, /, \\, b, ~, x und P.M., Anschlagmuster (D DU UDU) sowie Titel, Künstler, Capo, Stimmung, Tempo und Taktart – ohne Internet. Nur „Mit KI analysieren“ und „KI-Idee“ senden den Text an Google Gemini.'));

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
