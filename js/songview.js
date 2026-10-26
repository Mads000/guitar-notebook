// Kompakte Leseansicht zum Spielen: dicht gesetzt, ohne Bearbeitungselemente,
// Akkorde aus „[G]Liedtext“ stehen über dem Text.
import { h } from './ui.js';
import { metaParts, songChordItems, instrumentOf, sectionKind } from './songs.js';
import { findChord, diagramSVG, isChordName, chordsShownInText, songChordList, chordLabels } from './chords.js';
import { progressionView } from './progression.js';
import { strumView } from './strumming.js';
import { tabSVG, isEmptyTab } from './tabs.js';

const SPLIT_RE = /(\[[^\]\s]{1,14}\])/;

export function hasInlineChords(line) {
  return line.split(SPLIT_RE).some((p) => p.startsWith('[') && isChordName(p.slice(1, -1)));
}

// Eine Textzeile mit Inline-Akkorden als Akkord-über-Text-Zeile
export function chordLyricLine(line) {
  if (!line.trim()) return h('div', { class: 'cl-gap' });
  if (!hasInlineChords(line)) return h('div', { class: 'cl-line plain' }, line);
  const el = h('div', { class: 'cl-line' });
  let chord = null;
  const flush = (text) => {
    if (chord == null && !text) return;
    el.append(h('span', { class: 'cl-seg' + (chord && !text.trim() ? ' only' : '') },
      h('b', { class: 'cl-chord' }, chord || ' '),
      h('span', { class: 'cl-text' }, text || ' ')));
    chord = null;
  };
  for (const part of line.split(SPLIT_RE)) {
    if (part.startsWith('[') && isChordName(part.slice(1, -1))) {
      if (chord != null) flush('');
      chord = part.slice(1, -1);
    } else if (part) flush(part);
  }
  if (chord != null) flush('');
  return el;
}

export function songView(song, tabs, { tools, media } = {}) {
  const meta = [song.artist, ...metaParts(song)].filter(Boolean);
  const inst = instrumentOf(song);
  const chords = songChordList(song, inst, { unused: false }).map((x) => ({ it: { name: x.label }, ch: x.ch }));
  const labels = chordLabels(song, inst);

  const block = (b, sec) => {
    if (b.type === 'chords') return b.items.length && !chordsShownInText(sec) ? h('div', { class: 'sv-block' }, progressionView(b, inst, labels)) : null;
    if (b.type === 'strum') return b.strokes.length ? h('div', { class: 'sv-block' }, strumView(b)) : null;
    if (b.type === 'tab') {
      const t = tabs.get(b.tabId);
      if (!t || isEmptyTab(t)) return null;
      return h('div', { class: 'sv-block' },
        t.name && h('div', { class: 'sv-label' }, t.name),
        h('div', { class: 'tab-scroll', html: tabSVG(t, { tuning: song.tuning, colW: 19, rowH: 13, top: 22, fs: 11 }) }));
    }
    const text = (b.text || '').replace(/\s+$/, '');
    return text ? h('div', { class: 'sv-block sv-text' }, text.split('\n').map(chordLyricLine)) : null;
  };

  return h('div', { class: 'song-view' },
    h('header', { class: 'sv-head' },
      h('h1', { class: 'sv-title' }, song.title, song.favorite && h('span', { class: 'sv-fav', 'aria-label': 'Favorit' }, '★')),
      meta.length > 0 && h('div', { class: 'sv-meta' }, meta.join('  ·  ')),
      tools),
    song.notes?.trim() && h('p', { class: 'sv-notes' }, song.notes.trim()),
    chords.length > 0 && h('div', { class: 'sv-chords' }, chords.map(({ it, ch }) => h('div', { class: 'chord-card mini', html: diagramSVG({ ...ch, name: it.name }) }))),
    song.sections.map((sec) => h('section', { class: 'sv-sec', 'data-kind': sectionKind(sec.name) || null },
      h('div', { class: 'sv-sec-name' }, sec.name),
      sec.blocks.map((b) => block(b, sec)))),
    !song.sections.length && h('p', { class: 'hint' }, 'Dieser Song hat noch keine Abschnitte. Wechsle zu „Bearbeiten“, um etwas hinzuzufügen.'),
    media);
}
