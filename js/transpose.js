// Transponieren und Vereinfachen von Akkorden – vollständig lokal.
// Optional schlägt der KI-Assistent zusätzlich Akkord-Varianten (Reharmonisierung) vor.
import { h, fill, sheet, stepper, segmented, toast, icon } from './ui.js';
import { songChordItems, instrumentOf, touch } from './songs.js';
import { isChordName } from './chords.js';
import { aiUnavailable, generateJSON, reharmPrompt, REHARM_SCHEMA } from './ai.js';

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

function pitch(root) {
  const m = root.match(/^([A-H])([#b♯♭]?)$/);
  if (!m) return null;
  let p = PC[m[1]];
  if (m[2] === '#' || m[2] === '♯') p += 1;
  if (m[2] === 'b' || m[2] === '♭') p -= 1;
  return (p + 12) % 12;
}

const ROOT_RE = /^([A-H][#b♯♭]?)(.*?)(?:\/([A-H][#b♯♭]?))?$/;

// Ein Akkordname um n Halbtöne verschieben (Grundton und Bass), Typ bleibt erhalten.
export function transposeChord(name, n, flats = false) {
  const m = String(name).match(ROOT_RE);
  if (!m || !isChordName(name)) return name;
  const scale = flats ? FLAT : SHARP;
  const mv = (r) => { const p = pitch(r); return p == null ? r : scale[(p + n + 120) % 12]; };
  return mv(m[1]) + m[2] + (m[3] ? '/' + mv(m[3]) : '');
}

// Vorzeichen-Wahl: Ziel-Tonart mit b (F, Bb, Eb, Ab, Db, Dm, Gm, Cm, Fm …) → b-Schreibweise
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]);
export function prefersFlats(names, n) {
  const first = names.find((x) => ROOT_RE.test(x));
  if (!first) return false;
  const m = first.match(ROOT_RE);
  const p = pitch(m[1]);
  if (p == null) return false;
  const minor = /^m(?!aj)/.test(m[2]);
  const target = (p + n + 120) % 12;
  return FLAT_KEYS.has(minor ? (target + 3) % 12 : target);
}

// Vereinfachung für Einsteiger: Erweiterungen weg, sus/add/maj → Dur, Slash-Akkorde → Grundakkord
export function simplifyChord(name) {
  const m = String(name).match(ROOT_RE);
  if (!m || !isChordName(name)) return name;
  const q = m[2];
  const minor = /^(m(?!aj)|min|-)/.test(q);
  const dim = /^(dim|°)/.test(q);
  return m[1] + (dim ? 'dim' : minor ? 'm' : '');
}

const INLINE = /\[([^\]\s]{1,14})\]/g;

// Akkordnamen im ganzen Song ersetzen (Akkordfolgen und [G]-Akkorde im Liedtext).
export function mapSongChords(song, fn) {
  let count = 0;
  for (const sec of song.sections) for (const b of sec.blocks) {
    if (b.type === 'chords') b.items.forEach((it) => { const to = fn(it.name); if (to && to !== it.name) { it.name = to; delete it.chordId; count++; } });
    else if (b.type === 'notes' && b.text) b.text = b.text.replace(INLINE, (all, c) => { if (!isChordName(c)) return all; const to = fn(c); if (to && to !== c) count++; return `[${to || c}]`; });
  }
  return count;
}

// Alle Akkordnamen inkl. derer, die nur im Liedtext stehen
export function allChordNames(song) {
  const seen = new Set(songChordItems(song).map((i) => i.name));
  for (const sec of song.sections) for (const b of sec.blocks) {
    if (b.type === 'notes' && b.text) for (const m of b.text.matchAll(INLINE)) if (isChordName(m[1])) seen.add(m[1]);
  }
  return [...seen];
}

// ---------- Oberfläche ----------
export function openTransposer(song, onChange) {
  const inst = instrumentOf(song);
  const names = allChordNames(song);
  let semis = 0, acc = 'auto', undoState = null;
  const preview = h('div', { class: 'tp-preview' });
  const simplePrev = h('div', { class: 'tp-preview' });
  const aiOut = h('div', { class: 'tp-ai' });
  const undoRow = h('div');
  const wish = h('input', { class: 'field', placeholder: 'Wunsch (optional), z. B. für Anfänger, jazziger, mit Capo 2', autocomplete: 'off' });

  const flats = () => (acc === 'auto' ? prefersFlats(names, semis) : acc === 'flat');
  const pairs = (fn) => names.map((n) => [n, fn(n)]);
  const chips = (list) => (list.length
    ? list.map(([a, b]) => h('span', { class: 'tp-pair' + (a === b ? ' same' : '') }, a, a !== b && h('span', { class: 'tp-arrow' }, '→'), a !== b && h('b', null, b)))
    : [h('p', { class: 'hint' }, 'Dieser Song enthält noch keine Akkorde.')]);

  function apply(fn, label) {
    undoState = JSON.stringify(song.sections);
    const n = mapSongChords(song, fn);
    touch(song);
    onChange();
    names.splice(0, names.length, ...allChordNames(song));
    semis = 0;
    stp.set(0);
    draw();
    toast(n ? `${label}: ${n} ${n === 1 ? 'Akkord' : 'Akkorde'} geändert` : 'Keine Änderung');
  }

  function draw() {
    fill(preview, ...chips(pairs((n) => transposeChord(n, semis, flats()))));
    fill(simplePrev, ...chips(pairs(simplifyChord)));
    fill(undoRow, undoState && h('button', {
      class: 'btn block', onClick: () => { song.sections = JSON.parse(undoState); undoState = null; touch(song); onChange(); names.splice(0, names.length, ...allChordNames(song)); draw(); toast('Rückgängig gemacht'); },
    }, icon('undo', 'small'), 'Letzte Änderung rückgängig'));
  }

  const stp = stepper({ value: 0, min: -11, max: 11, format: (v) => (v > 0 ? `+${v}` : String(v)) + ' HT', onChange: (v) => { semis = v; draw(); } });

  async function askAi() {
    const why = aiUnavailable();
    if (why) { fill(aiOut, h('p', { class: 'hint' }, why, ' Offline helfen „Transponieren“ und „Vereinfachen“ oben.')); return; }
    if (!names.length) { toast('Keine Akkorde im Song.'); return; }
    fill(aiOut, h('div', { class: 'ai-busy' }, h('span', { class: 'spinner' }), 'KI denkt nach …'));
    try {
      const { system, prompt } = reharmPrompt({ chords: names, inst, wish: wish.value.trim() });
      const res = await generateJSON({ system, prompt, schema: REHARM_SCHEMA, temperature: 0.7 });
      const list = (res.suggestions || []).filter((s) => Array.isArray(s.map) && s.map.length).slice(0, 5);
      if (!list.length) { fill(aiOut, h('p', { class: 'hint' }, 'Die KI hat keine verwertbaren Vorschläge geliefert.')); return; }
      fill(aiOut, ...list.map((sg) => {
        const map = new Map(sg.map.filter((m) => m.from && m.to && isChordName(m.to)).map((m) => [String(m.from).trim(), String(m.to).trim()]));
        const hits = names.some((n) => map.has(n) && map.get(n) !== n);
        return h('div', { class: 'tp-sug' },
          h('div', { class: 'tp-sug-title' }, sg.title || 'Vorschlag'),
          sg.description && h('div', { class: 'hint' }, sg.description),
          h('div', { class: 'tp-preview' }, ...chips(names.map((n) => [n, map.get(n) || n]))),
          hits ? h('button', { class: 'btn small', onClick: () => apply((n) => map.get(n) || n, sg.title || 'Vorschlag') }, 'Anwenden')
            : h('p', { class: 'hint' }, 'Betrifft keinen Akkord dieses Songs.'));
      }));
    } catch (e) {
      fill(aiOut, h('p', { class: 'hint error-text' }, String(e.message || e)));
    }
  }

  const body = h('div', { class: 'transposer' },
    h('div', { class: 'form-label' }, 'Transponieren'),
    h('div', { class: 'form-group' },
      h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Halbtöne', h('small', null, '+2 = einen Ganzton höher')), stp),
      h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Vorzeichen'), segmented([{ value: 'auto', label: 'Auto' }, { value: 'sharp', label: '♯' }, { value: 'flat', label: '♭' }], acc, (v) => { acc = v; draw(); }))),
    preview,
    h('button', { class: 'btn primary block', onClick: () => { if (!semis) { toast('Bitte zuerst Halbtöne wählen.'); return; } const n = semis, f = flats(); apply((c) => transposeChord(c, n, f), 'Transponiert'); } }, 'Transponieren'),

    h('div', { class: 'form-label', style: 'margin-top:22px' }, 'Vereinfachen (für Einsteiger)'),
    simplePrev,
    h('button', { class: 'btn block', onClick: () => apply(simplifyChord, 'Vereinfacht') }, 'Vereinfachte Akkorde übernehmen'),

    h('div', { class: 'form-label', style: 'margin-top:22px' }, 'KI-Vorschläge (Reharmonisieren)'),
    wish,
    h('button', { class: 'btn block', style: 'margin-top:8px', onClick: askAi }, icon('magic', 'small'), 'Alternativen vorschlagen'),
    aiOut,
    h('div', { style: 'margin-top:16px' }, undoRow),
    h('p', { class: 'hint', style: 'margin-top:12px' }, 'Geändert werden Akkordfolgen und Akkorde im Liedtext ([G]). Transponieren und Vereinfachen arbeiten offline; für KI-Vorschläge wird nur die Akkordliste an Google Gemini gesendet.'));

  draw();
  return sheet({ title: 'Transponieren', body, full: true, right: { label: 'Fertig', bold: true } });
}
