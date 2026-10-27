// Kompakte Leseansicht zum Spielen: dicht gesetzt, ohne Bearbeitungselemente,
// Akkorde aus „[G]Liedtext“ stehen über dem Text.
import { h, icon } from './ui.js';
import { metaParts, songChordItems, instrumentOf, sectionKind } from './songs.js';
import { findChord, diagramSVG, isChordName, chordsShownInText, songChordList, chordLabels } from './chords.js';
import { progressionView } from './progression.js';
import { strumView } from './strumming.js';
import { tabSVG, isEmptyTab } from './tabs.js';

const SPLIT_RE = /(\[[^\]\s]{1,14}\])/;
const URL_RE = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/g;

// Text mit antippbaren Links (öffnen in Safari bzw. einem neuen Tab)
export function linkify(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, '');
    if (m.index > last) out.push(text.slice(last, m.index));
    const href = url.startsWith('www.') ? 'https://' + url : url;
    out.push(h('a', { class: 'link', href, target: '_blank', rel: 'noopener noreferrer' }, url));
    last = m.index + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function hasInlineChords(line) {
  return line.split(SPLIT_RE).some((p) => p.startsWith('[') && isChordName(p.slice(1, -1)));
}

// Eine Textzeile mit Inline-Akkorden als Akkord-über-Text-Zeile
export function chordLyricLine(line) {
  if (!line.trim()) return h('div', { class: 'cl-gap' });
  if (!hasInlineChords(line)) return h('div', { class: 'cl-line plain' }, ...linkify(line));
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

// Song-Notizen (Tonart, Quelle …): lange Texte zunächst gekürzt, „Mehr“ klappt auf
function notesEl(text) {
  const p = h('p', { class: 'sv-notes' }, ...linkify(text));
  if (text.length < 140 && text.split('\n').length <= 3) return p;
  p.classList.add('clamp');
  const more = h('button', { class: 'sv-more', onClick: () => { const open = p.classList.toggle('clamp'); more.textContent = open ? 'Mehr' : 'Weniger'; } }, 'Mehr');
  return h('div', { class: 'sv-notes-wrap' }, p, more);
}

export function songView(song, tabs, { tools, media, pinned = false, onPin } = {}) {
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
    if (!text) return null;
    // Liedtext mit Akkorden ist Hauptinhalt; reiner Text (Hinweise) tritt zurück, damit der Blick auf die Akkorde geht
    const lyric = text.split('\n').some(hasInlineChords);
    return h('div', { class: 'sv-block sv-text' + (lyric ? '' : ' note') }, text.split('\n').map(chordLyricLine));
  };

  return h('div', { class: 'song-view' },
    h('header', { class: 'sv-head' },
      h('h1', { class: 'sv-title' }, song.title, song.favorite && h('span', { class: 'sv-fav', 'aria-label': 'Favorit' }, '★')),
      meta.length > 0 && h('div', { class: 'sv-meta' }, meta.join('  ·  ')),
      tools),
    song.notes?.trim() && notesEl(song.notes.trim()),
    chords.length > 0 && h('div', { class: 'sv-chords-wrap' + (pinned ? ' pinned' : '') },
      h('div', { class: 'sv-chords' }, chords.map(({ it, ch }) => h('div', { class: 'chord-card mini', html: diagramSVG({ ...ch, name: it.name }) }))),
      onPin && h('button', { class: 'sv-pin' + (pinned ? ' on' : ''), 'aria-pressed': String(pinned), 'aria-label': pinned ? 'Akkordleiste lösen' : 'Akkordleiste beim Scrollen fixieren', onClick: onPin }, icon('pin', 'small'))),
    song.sections.map((sec) => h('section', { class: 'sv-sec', 'data-kind': sectionKind(sec.name) || null },
      h('button', { class: 'sv-sec-name', 'aria-expanded': 'true', onClick: (e) => { const s = e.currentTarget.parentElement; const c = s.classList.toggle('collapsed'); e.currentTarget.setAttribute('aria-expanded', String(!c)); } }, icon('chevron', 'small sec-chev'), sec.name),
      sec.blocks.map((b) => block(b, sec)))),
    !song.sections.length && h('p', { class: 'hint' }, 'Dieser Song hat noch keine Abschnitte. Wechsle zu „Bearbeiten“, um etwas hinzuzufügen.'),
    media);
}
