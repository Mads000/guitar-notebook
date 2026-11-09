// Kompakte Leseansicht zum Spielen: dicht gesetzt, ohne Bearbeitungselemente,
// Akkorde aus „[G]Liedtext“ stehen über dem Text.
import { h, icon, toast, deviceScale, wideMode, chordLayoutOf } from './ui.js';
import { metaParts, songChordItems, instrumentOf, sectionKind, INSTRUMENTS } from './songs.js';
import { findChord, diagramSVG, isChordName, chordsShownInText, songChordList, chordLabels } from './chords.js';
import { progressionView } from './progression.js';
import { strumView } from './strumming.js';
import { tabView, isEmptyTab } from './tabs.js';
import { openPlayer } from './tabplayer.js';

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

// Breite Ansicht: Abschnitte wie Zeitungsspalten – links der Reihe nach von oben nach unten, dann rechts weiter.
// Getrennt wird dort, wo beide Spalten möglichst gleich lang sind. Abschnitte mit langem Tab (data-wide)
// bekommen die volle Breite, damit der Tab nicht so klein wird wie auf dem Handy; davor und danach geht es zweispaltig weiter.
function masonry(box) {
  const secs = [...box.children];
  let cols = 0;
  // Ein Block aus zwei ausgeglichenen Spalten
  const pair = (run) => {
    const wrap = h('div', { class: 'sv-pair' });
    const a = h('div', { class: 'sv-col' }), b = h('div', { class: 'sv-col' });
    wrap.append(a, b);
    return { wrap, fill: () => {
      a.append(...run); // in Spaltenbreite messen
      const hs = run.map((x) => x.offsetHeight + 12);
      const total = hs.reduce((x, y) => x + y, 0);
      let k = 1, best = Infinity, sum = 0;
      for (let i = 1; i <= run.length; i++) {
        sum += hs[i - 1];
        const worst = Math.max(sum, total - sum);
        if (worst < best) { best = worst; k = i; }
      }
      b.append(...run.slice(k));
    } };
  };
  const layout = () => {
    // Handy quer: lieber zwei Spalten, die Höhe reicht sonst für kaum eine Zeile
    const two = wideMode() && (box.clientWidth >= 760 || (box.clientWidth >= 560 && window.innerHeight <= 520));
    if (two === (cols === 2) && cols) return;
    cols = two ? 2 : 1;
    box.classList.toggle('two', two);
    if (!two) { box.replaceChildren(...secs); return; }
    const parts = [], pairs = [];
    let run = [];
    const flush = () => {
      if (run.length === 1) parts.push(run[0]);
      else if (run.length) { const p = pair(run); parts.push(p.wrap); pairs.push(p); }
      run = [];
    };
    for (const s of secs) { if (s.dataset.wide) { flush(); parts.push(s); } else run.push(s); }
    flush();
    box.replaceChildren(...parts);
    pairs.forEach((p) => p.fill());
  };
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => { if (!box.isConnected) { ro.disconnect(); return; } if (box.clientWidth) layout(); });
    ro.observe(box);
  }
  return box;
}

// Fixierte Akkordleiste: Alle Griffe sollen gleichzeitig zu sehen sein und trotzdem wenig vom Song verdecken.
// Die Griffe werden deshalb nur so weit verkleinert, bis die Leiste höchstens ein Viertel des Bildschirms belegt.
function fitPinned(wrap) {
  const box = wrap.firstChild;
  let seen = '';
  const fit = () => {
    box.style.removeProperty('--pin-w');
    let w = box.firstChild?.offsetWidth || 0;
    while (w > 30 && box.offsetHeight > window.innerHeight * 0.24) {
      w -= 2;
      box.style.setProperty('--pin-w', `${w}px`);
    }
    seen = `${box.clientWidth}:${box.offsetHeight}:${window.innerHeight}`;
  };
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      if (!wrap.isConnected) { ro.disconnect(); return; }
      if (`${box.clientWidth}:${box.offsetHeight}:${window.innerHeight}` !== seen) fit();
    });
    ro.observe(box);
  }
  return wrap;
}

// scale: gewählte Textgröße (Tabs wachsen mit). onMissing(name): Griff anlegen. notice: Hinweis über dem Song.
export function songView(song, tabs, { media, pinned = false, onPin, scale = 1, onMissing = null, notice = null } = {}) {
  const meta = [song.artist, ...metaParts(song)].filter(Boolean);
  const inst = instrumentOf(song);
  const used = songChordList(song, inst, { unused: false });
  const chords = used.map((x) => ({ it: { name: x.label }, ch: x.ch }));
  const labels = chordLabels(song, inst);
  const layout = chordLayoutOf(song);
  // Akkorde ohne Griff: Platzhalter statt stillem Fehlen
  const missing = [...new Set(songChordItems(song).filter((it) => isChordName(it.name) && !findChord(it.name, it.chordId, inst)).map((it) => it.name))];

  // Abschnitt mit langem Tab (mehr als 2 Takte) – steht in der breiten Ansicht über die volle Breite
  const isWide = (sec) => sec.blocks.some((b) => b.type === 'tab' && (tabs.get(b.tabId)?.measures.length || 0) > 2);
  const block = (b, sec) => {
    if (b.type === 'chords') return b.items.length && !chordsShownInText(sec) ? h('div', { class: 'sv-block' }, progressionView(b, inst, labels, layout)) : null;
    if (b.type === 'strum') return b.strokes.length ? h('div', { class: 'sv-block' }, strumView(b)) : null;
    if (b.type === 'tab') {
      const t = tabs.get(b.tabId);
      if (!t || isEmptyTab(t)) return null;
      const k = deviceScale() * scale;
      const tv = tabView(t, { tuning: song.tuning, colW: 21 * k, rowH: 15 * k, top: 24 * k, fs: Math.round(13 * k) });
      const play = h('button', { class: 'tab-play', 'aria-label': `„${t.name || 'Tab'}“ abspielen`, onClick: (e) => {
        openPlayer(t, { host: e.currentTarget.closest('.view') || document.body, tuning: song.tuning, capo: song.capo, bpm: song.bpm, onPos: (g) => tv.setPlay(g), onStop: () => tv.setPlay(null) });
      } }, icon('play', 'small'), 'Abspielen');
      return h('div', { class: 'sv-block' },
        h('div', { class: 'sv-label tab-label-row' }, t.name, b.repeat > 1 && h('span', { class: 'pl-rep' }, '×' + b.repeat), play),
        tv);
    }
    const text = (b.text || '').replace(/\s+$/, '');
    if (!text) return null;
    // Liedtext mit Akkorden ist Hauptinhalt; reiner Text (Hinweise) tritt zurück, damit der Blick auf die Akkorde geht
    const lyric = text.split('\n').some(hasInlineChords);
    return h('div', { class: 'sv-block sv-text' + (lyric ? '' : ' note') }, text.split('\n').map(chordLyricLine));
  };

  // Tipp auf ein Griffbild oder einen Akkord in einer Folge öffnet ihn groß
  const onTap = (e) => {
    const el = e.target.closest('.chord-card.mini, .prog-chord');
    if (!el) return;
    const id = el.dataset.chord;
    const idx = used.findIndex((x) => x.ch.id === id);
    if (idx >= 0) openChordZoom(used, idx);
    else if (id) { const ch = findChord(el.dataset.name, id, inst); if (ch) openChordZoom([{ ch, label: el.dataset.name }]); }
    else if (onMissing) onMissing(el.dataset.name);
    else toast(`Für ${el.dataset.name} gibt es noch kein Griffbild.`);
  };

  const chordBar = (chords.length > 0 || missing.length > 0) && h('div', { class: 'sv-chords-wrap' + (pinned ? ' pinned' : '') },
    h('div', { class: 'sv-chords' }, chords.map(({ it, ch }) => h('button', { class: 'chord-card mini', 'data-chord': ch.id, 'data-name': it.name, 'aria-label': `Griff ${it.name} groß anzeigen`, html: diagramSVG({ ...ch, name: it.name }) })),
      // In der Nur-Anzeige lässt sich kein Griff anlegen: Der Platzhalter sagt dann nur, dass einer fehlt
      missing.map((name) => (onMissing
        ? h('button', { class: 'chord-missing', 'aria-label': `Griff für ${name} fehlt, jetzt anlegen`, onClick: (e) => { e.stopPropagation(); onMissing(name); } }, h('b', null, name), h('small', null, 'Griff fehlt'), icon('plus', 'small'))
        : h('div', { class: 'chord-missing', 'aria-label': `Für ${name} gibt es keinen Griff` }, h('b', null, name), h('small', null, 'kein Griff'))))),
    h('div', { class: 's-cap sv-chords-cap s-only' }, 'Akkorde'),
    onPin && h('button', { class: 'sv-pin' + (pinned ? ' on' : ''), 'aria-pressed': String(pinned), 'aria-label': pinned ? 'Akkordleiste lösen' : 'Akkordleiste beim Scrollen fixieren', onClick: onPin }, icon('pin', 'small')));
  if (chordBar && pinned) fitPinned(chordBar);

  return h('div', { class: 'song-view', onClick: onTap },
    h('header', { class: 'sv-head' },
      h('h1', { class: 'sv-title' }, song.title, song.favorite && h('span', { class: 'sv-fav c-only', 'aria-label': 'Favorit' }, '★')),
      meta.length > 0 && h('div', { class: 'sv-meta c-only' }, meta.join('  ·  ')),
      h('div', { class: 'sv-pills s-only' }, [INSTRUMENTS[inst].label, song.artist, ...metaParts(song).filter((p) => p !== INSTRUMENTS[inst].label)].filter(Boolean).map((p) => h('span', { class: 'sv-pill' }, p)))),
    notice,
    chordBar,
    song.notes?.trim() && notesEl(song.notes.trim()),
    // Auf dem iPad (quer) und am PC stehen die Abschnitte in zwei Spalten nebeneinander
    masonry(h('div', { class: 'sv-secs' }, song.sections.map((sec, i) => h('section', { class: 'sv-sec', 'data-idx': i, 'data-kind': sectionKind(sec.name) || null, 'data-wide': isWide(sec) ? '1' : null },
      h('button', { class: 'sv-sec-name', 'aria-expanded': 'true', onClick: (e) => { const s = e.currentTarget.parentElement; const c = s.classList.toggle('collapsed'); e.currentTarget.setAttribute('aria-expanded', String(!c)); } }, h('span', { class: 'sv-badge s-only' }, i + 1), icon('chevron', 'small sec-chev'), sec.name),
      byKind(sec.blocks).map((b) => block(b, sec)))))),
    !song.sections.length && h('p', { class: 'hint' }, 'Dieser Song hat noch keine Abschnitte. Wechsle zu „Bearbeiten“, um etwas hinzuzufügen.'),
    media);
}
