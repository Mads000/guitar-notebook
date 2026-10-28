// Kompakte Leseansicht zum Spielen: dicht gesetzt, ohne Bearbeitungselemente,
// Akkorde aus „[G]Liedtext“ stehen über dem Text.
import { h, icon, toast, haptic } from './ui.js';
import { metaParts, songChordItems, instrumentOf, sectionKind } from './songs.js';
import { findChord, diagramSVG, isChordName, chordsShownInText, songChordList, chordLabels } from './chords.js';
import { progressionView } from './progression.js';
import { strumView } from './strumming.js';
import { tabSVG, isEmptyTab } from './tabs.js';

// In der Ansicht stehen die Akkorde oben, darunter Anschlag und Tabs, zuletzt Notizen und Liedtext
const ORDER = { chords: 0, strum: 1, tab: 2, notes: 3 }; // strum nur noch in alten, nicht umgewandelten Daten
const byKind = (blocks) => blocks.slice().sort((a, b) => (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9));

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

// Großes Griffbild; ‹ › bzw. Wischen blättert durch die Griffe des Songs, Tippen daneben schließt
export function openChordZoom(list, start = 0) {
  let i = start;
  const stage = h('div', { class: 'cz-diagram' });
  const name = h('div', { class: 'cz-name' });
  const count = h('div', { class: 'cz-count' });
  const prev = h('button', { class: 'cz-nav', 'aria-label': 'Vorheriger Griff', onClick: (e) => { e.stopPropagation(); go(-1); } }, icon('back'));
  const next = h('button', { class: 'cz-nav', 'aria-label': 'Nächster Griff', onClick: (e) => { e.stopPropagation(); go(1); } }, icon('chevron'));
  const draw = () => {
    const x = list[i];
    stage.innerHTML = diagramSVG({ ...x.ch, name: '' }, { name: false });
    name.textContent = x.label;
    count.textContent = list.length > 1 ? `${i + 1} / ${list.length}` : '';
    prev.disabled = i === 0;
    next.disabled = i === list.length - 1;
  };
  const go = (d) => { const j = i + d; if (j < 0 || j >= list.length) return; i = j; draw(); };
  const close = () => { wrap.classList.add('closing'); document.removeEventListener('keydown', onKey); setTimeout(() => wrap.remove(), 160); };
  const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); };
  const card = h('div', { class: 'cz-card', onClick: (e) => e.stopPropagation() }, name, stage, h('div', { class: 'cz-bar' }, prev, count, next));
  const wrap = h('div', { class: 'chord-zoom', role: 'dialog', 'aria-label': 'Griffbild', onClick: close },
    card, h('button', { class: 'cz-close', 'aria-label': 'Schließen', onClick: close }, icon('close')));
  let sx = null;
  card.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  card.addEventListener('pointerup', (e) => { if (sx != null && Math.abs(e.clientX - sx) > 50) go(e.clientX < sx ? 1 : -1); sx = null; });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  draw();
}

export function songView(song, tabs, { media, pinned = false, onPin } = {}) {
  const meta = [song.artist, ...metaParts(song)].filter(Boolean);
  const inst = instrumentOf(song);
  const used = songChordList(song, inst, { unused: false });
  const chords = used.map((x) => ({ it: { name: x.label }, ch: x.ch }));
  const labels = chordLabels(song, inst);

  const block = (b, sec) => {
    if (b.type === 'chords') return b.items.length && !chordsShownInText(sec) ? h('div', { class: 'sv-block' }, progressionView(b, inst, labels)) : null;
    if (b.type === 'strum') return b.strokes.length ? h('div', { class: 'sv-block' }, strumView(b)) : null;
    if (b.type === 'tab') {
      const t = tabs.get(b.tabId);
      if (!t || isEmptyTab(t)) return null;
      return h('div', { class: 'sv-block' },
        (t.name || b.repeat > 1) && h('div', { class: 'sv-label' }, t.name, b.repeat > 1 && h('span', { class: 'pl-rep' }, '×' + b.repeat)),
        h('div', { class: 'tab-scroll', html: tabSVG(t, { tuning: song.tuning, colW: 19, rowH: 13, top: 22, fs: 11 }) }));
    }
    const text = (b.text || '').replace(/\s+$/, '');
    if (!text) return null;
    // Liedtext mit Akkorden ist Hauptinhalt; reiner Text (Hinweise) tritt zurück, damit der Blick auf die Akkorde geht
    const lyric = text.split('\n').some(hasInlineChords);
    return h('div', { class: 'sv-block sv-text' + (lyric ? '' : ' note') }, text.split('\n').map(chordLyricLine));
  };

  // Doppeltipp auf ein Griffbild oder einen Akkord in einer Folge öffnet ihn groß
  let lastTap = { el: null, t: 0 };
  const onTap = (e) => {
    const el = e.target.closest('.chord-card.mini, .prog-chord');
    if (!el) return;
    const t = Date.now();
    if (lastTap.el !== el || t - lastTap.t > 350) { lastTap = { el, t }; return; }
    lastTap = { el: null, t: 0 };
    haptic();
    const id = el.dataset.chord;
    const idx = used.findIndex((x) => x.ch.id === id);
    if (idx >= 0) openChordZoom(used, idx);
    else if (id) { const ch = findChord(el.dataset.name, id, inst); if (ch) openChordZoom([{ ch, label: el.dataset.name }]); }
    else toast(`Für ${el.dataset.name} gibt es noch kein Griffbild.`);
  };

  return h('div', { class: 'song-view', onClick: onTap },
    h('header', { class: 'sv-head' },
      h('h1', { class: 'sv-title' }, song.title, song.favorite && h('span', { class: 'sv-fav', 'aria-label': 'Favorit' }, '★')),
      meta.length > 0 && h('div', { class: 'sv-meta' }, meta.join('  ·  '))),
    chords.length > 0 && h('div', { class: 'sv-chords-wrap' + (pinned ? ' pinned' : '') },
      h('div', { class: 'sv-chords' }, chords.map(({ it, ch }) => h('div', { class: 'chord-card mini', 'data-chord': ch.id, 'data-name': it.name, title: 'Doppeltippen zum Vergrößern', html: diagramSVG({ ...ch, name: it.name }) }))),
      onPin && h('button', { class: 'sv-pin' + (pinned ? ' on' : ''), 'aria-pressed': String(pinned), 'aria-label': pinned ? 'Akkordleiste lösen' : 'Akkordleiste beim Scrollen fixieren', onClick: onPin }, icon('pin', 'small'))),
    song.notes?.trim() && notesEl(song.notes.trim()),
    song.sections.map((sec) => h('section', { class: 'sv-sec', 'data-kind': sectionKind(sec.name) || null },
      h('button', { class: 'sv-sec-name', 'aria-expanded': 'true', onClick: (e) => { const s = e.currentTarget.parentElement; const c = s.classList.toggle('collapsed'); e.currentTarget.setAttribute('aria-expanded', String(!c)); } }, icon('chevron', 'small sec-chev'), sec.name),
      byKind(sec.blocks).map((b) => block(b, sec)))),
    !song.sections.length && h('p', { class: 'hint' }, 'Dieser Song hat noch keine Abschnitte. Wechsle zu „Bearbeiten“, um etwas hinzuzufügen.'),
    media);
}
