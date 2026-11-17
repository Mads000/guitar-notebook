// Transponieren und Vereinfachen von Akkorden – vollständig lokal.
// Optional schlägt der KI-Assistent zusätzlich Akkord-Varianten (Reharmonisierung) vor.
import { tr } from './i18n.js';
import { h, fill, sheet, stepper, segmented, toast, icon, formRow, toggle, note, sx } from './ui.js';
import { songChordItems, instrumentOf, touch } from './songs.js';
import { isChordName } from './chords.js';
import { saveTab, isEmptyTab } from './tabs.js';
import { transposeTabNotes } from './notes.js';
import { aiUnavailable, generateJSON, reharmPrompt, REHARM_SCHEMA } from './ai.js';
import { EASY } from './theory.js';

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

// Capo, mit dem der Song gleich klingt, aber mehr leichte Griffe hat. null, wenn es keinen besseren gibt als den aktuellen.
// songCapo: Capo des Songs, zu dem die Namen gehören; semis: gewünschte Tonart; current: gerade angezeigter Capo
export function suggestCapo(names, inst, { songCapo = 0, semis = 0, current = songCapo } = {}) {
  if (!names.length) return null;
  const easy = new Set(EASY[inst === 'ukulele' ? 'ukulele' : 'guitar']);
  const at = (capo) => {
    const off = semis - (capo - songCapo);
    const flats = prefersFlats(names, off);
    const shown = names.map((n) => transposeChord(n, off, flats));
    return { capo, names: shown, easy: shown.filter((n) => easy.has(simplifyChord(n))).length };
  };
  let best = at(current);
  const start = best.easy;
  for (let c = 0; c <= 7; c++) { const x = at(c); if (x.easy > best.easy) best = x; }
  return best.easy > start ? best : null;
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
// tabs: Map der Tabs des Songs; before(): läuft vor jeder Änderung (für das Rückgängig im Song)
export function openTransposer(song, onChange, { tabs = new Map(), before = null } = {}) {
  const inst = instrumentOf(song);
  const names = allChordNames(song);
  let semis = 0, acc = 'auto', undoState = null, undoTabs = null, withTabs = true;
  const hasTabs = [...tabs.values()].some((t) => !isEmptyTab(t));
  const preview = h('div', { class: 'tp-preview' });
  const simplePrev = h('div', { class: 'tp-preview' });
  const aiOut = h('div', { class: 'tp-ai' });
  const undoRow = h('div');
  const status = h('div');
  // Vermerk im Song: um wie viel er gegenüber dem Original transponiert ist und ob er vereinfacht wurde
  const setNote = (k, v) => { if (v) song[k] = v; else delete song[k]; };
  const wish = h('input', { class: 'field', placeholder: tr("Wunsch (optional), z. B. für Anfänger, jazziger, mit Capo 2"), autocomplete: 'off' });

  const flats = () => (acc === 'auto' ? prefersFlats(names, semis) : acc === 'flat');
  const pairs = (fn) => names.map((n) => [n, fn(n)]);
  const chips = (list) => (list.length
    ? list.map(([a, b]) => h('span', { class: 'tp-pair' + (a === b ? ' same' : '') }, a, a !== b && h('span', { class: 'tp-arrow' }, '→'), a !== b && h('b', null, b)))
    : [h('p', { class: 'hint' }, tr("Dieser Song enthält noch keine Akkorde."))]);

  // tabFn(tab): ändert einen Tab und gibt einen Hinweis zurück, wenn er eine Oktave wandern musste
  // note(): vermerkt die Änderung im Song, wenn wirklich etwas geändert wurde
  function apply(fn, label, tabFn = null, note = null) {
    before?.();
    undoState = JSON.stringify({ sections: song.sections, transposed: song.transposed, simplified: song.simplified, reharmonized: song.reharmonized });
    undoTabs = tabFn ? JSON.stringify([...tabs].map(([id, t]) => [id, t.measures])) : null;
    const n = mapSongChords(song, fn);
    let moved = 0, octave = false;
    if (tabFn) for (const t of tabs.values()) { if (isEmptyTab(t)) continue; if (tabFn(t)) octave = true; saveTab(t); moved++; }
    if (n || moved) note?.();
    touch(song);
    onChange();
    names.splice(0, names.length, ...allChordNames(song));
    semis = 0;
    stp.set(0);
    draw();
    const parts = [n && `${n} ${n === 1 ? tr("Akkord") : tr("Akkorde")}`, moved && `${moved} ${moved === 1 ? tr("Tab") : tr("Tabs")}`].filter(Boolean);
    toast(parts.length ? tr("{0}: {1} geändert{2}", label, parts.join(' und '), octave ? tr(", Tab um eine Oktave versetzt, damit er aufs Griffbrett passt") : '') : tr("Keine Änderung"), octave ? 4000 : undefined);
  }

  function draw() {
    fill(preview, ...chips(pairs((n) => transposeChord(n, semis, flats()))));
    fill(simplePrev, ...chips(pairs(simplifyChord)));
    const t = song.transposed;
    const sign = (v) => `${v > 0 ? '+' : ''}${v}`;
    fill(status, (t || song.simplified || song.reharmonized) && h('div', { class: 'banner-inline tp-status' },
      h('span', null, [t && tr("Transponiert um {0} {1}, mit {2} kommst du zurück.", sign(t), Math.abs(t) === 1 ? tr("Halbton") : tr("Halbtöne"), sign(-t)), song.simplified && tr("Die Akkorde wurden vereinfacht."), song.reharmonized && tr("Akkorde wurden per KI-Vorschlag geändert.")].filter(Boolean).join(' ')),
      h('button', { class: 'btn small', onClick: () => { before?.(); delete song.transposed; delete song.simplified; delete song.reharmonized; touch(song); onChange(); draw(); } }, tr("Vermerk entfernen"))));
    fill(undoRow, undoState && h('button', {
      class: 'btn block', onClick: () => {
        const prev = JSON.parse(undoState);
        song.sections = prev.sections;
        setNote('transposed', prev.transposed);
        setNote('simplified', prev.simplified);
        setNote('reharmonized', prev.reharmonized);
        undoState = null;
        if (undoTabs) { for (const [id, measures] of JSON.parse(undoTabs)) { const t = tabs.get(id); if (t) { t.measures = measures; saveTab(t); } } undoTabs = null; }
        touch(song); onChange(); names.splice(0, names.length, ...allChordNames(song)); draw(); toast(tr("Rückgängig gemacht"));
      },
    }, icon('undo', 'small'), tr("Letzte Änderung rückgängig")));
  }

  const stp = stepper({ value: 0, min: -11, max: 11, format: (v) => (v > 0 ? `+${v}` : String(v)) + ' HT', onChange: (v) => { semis = v; draw(); } });

  async function askAi() {
    const why = aiUnavailable();
    if (why) { fill(aiOut, h('p', { class: 'hint' }, why, sx(tr(" Offline helfen „Transponieren“ und „Vereinfachen“ oben."), ''))); return; }
    if (!names.length) { toast(tr("Keine Akkorde im Song.")); return; }
    fill(aiOut, h('div', { class: 'ai-busy' }, h('span', { class: 'spinner' }), tr("KI denkt nach …")));
    try {
      const { system, prompt } = reharmPrompt({ chords: names, inst, wish: wish.value.trim() });
      const res = await generateJSON({ system, prompt, schema: REHARM_SCHEMA, temperature: 0.7 });
      const list = (res.suggestions || []).filter((s) => Array.isArray(s.map) && s.map.length).slice(0, 5);
      if (!list.length) { fill(aiOut, h('p', { class: 'hint' }, tr("Die KI hat keine verwertbaren Vorschläge geliefert."))); return; }
      fill(aiOut, ...list.map((sg) => {
        const map = new Map(sg.map.filter((m) => m.from && m.to && isChordName(m.to)).map((m) => [String(m.from).trim(), String(m.to).trim()]));
        const hits = names.some((n) => map.has(n) && map.get(n) !== n);
        return h('div', { class: 'tp-sug' },
          h('div', { class: 'tp-sug-title' }, sg.title || tr("Vorschlag")),
          sg.description && h('div', { class: 'hint' }, sg.description),
          h('div', { class: 'tp-preview' }, ...chips(names.map((n) => [n, map.get(n) || n]))),
          hits ? h('button', { class: 'btn small', onClick: () => apply((n) => map.get(n) || n, sg.title || tr("Vorschlag"), null, () => setNote('reharmonized', true)) }, tr("Anwenden"))
            : h('p', { class: 'hint' }, tr("Betrifft keinen Akkord dieses Songs.")));
      }));
    } catch (e) {
      fill(aiOut, h('p', { class: 'hint error-text' }, String(e.message || e)));
    }
  }

  const body = h('div', { class: 'transposer' },
    note(tr("Ändert den Song dauerhaft und vermerkt das in seinen Angaben. Nur zum Ansehen: im Song unter ••• → Darstellung & Tonart."), tr("Ändert den Song dauerhaft."), { tag: 'p', cls: 'form-foot' }),
    status,
    h('div', { class: 'form-label' }, tr("Transponieren")),
    h('div', { class: 'form-group' },
      h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, tr("Halbtöne"), h('small', null, tr("+2 = einen Ganzton höher"))), stp),
      h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, tr("Vorzeichen")), segmented([{ value: 'auto', label: tr("Auto") }, { value: 'sharp', label: '♯' }, { value: 'flat', label: '♭' }], acc, (v) => { acc = v; draw(); })),
      hasTabs && formRow(tr("Tabs mit transponieren"), toggle(withTabs, (v) => { withTabs = v; }), tr("Bünde rücken mit, der Griff ändert sich"))),
    preview,
    h('button', { class: 'btn primary block', onClick: () => {
      if (!semis) { toast(tr("Bitte zuerst Halbtöne wählen.")); return; }
      const n = semis, f = flats(), map = (c) => transposeChord(c, n, f);
      // Zwölf Halbtöne sind wieder dieselbe Tonart: Der Vermerk verschwindet, wenn der Song zurück im Original ist
      apply(map, tr("Transponiert"), hasTabs && withTabs ? (t) => transposeTabNotes(t, n, map).octave !== 0 : null, () => setNote('transposed', ((song.transposed || 0) + n) % 12 || 0));
    } }, tr("Transponieren")),

    h('div', { class: 'form-label', style: 'margin-top:22px' }, tr("Vereinfachen (für Einsteiger)")),
    simplePrev,
    h('button', { class: 'btn block', onClick: () => apply(simplifyChord, tr("Vereinfacht"), null, () => setNote('simplified', true)) }, tr("Vereinfachte Akkorde übernehmen")),

    h('div', { class: 'form-label', style: 'margin-top:22px' }, tr("KI-Vorschläge (Reharmonisieren)")),
    wish,
    h('button', { class: 'btn block', style: 'margin-top:8px', onClick: askAi }, icon('magic', 'small'), tr("Alternativen vorschlagen")),
    aiOut,
    h('div', { style: 'margin-top:16px' }, undoRow),
    note(tr("Vereinfachen ändert nur Akkordnamen, nicht die Tabs. Für KI-Vorschläge wird nur die Akkordliste an Google Gemini gesendet."), tr("Vereinfachen ändert nur Akkorde."), { tag: 'p', cls: 'hint', style: 'margin-top:12px' }));

  draw();
  return sheet({ title: tr("Transponieren"), body, full: true, right: { label: tr("Fertig"), bold: true } });
}
