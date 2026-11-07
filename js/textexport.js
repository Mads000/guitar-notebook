// Songs als normalen Text oder ChordPro teilen – zum Beispiel per Nachricht an die Band.
// Der ChordPro-Text lässt sich in Sorell und anderen Song-Apps wieder importieren.
import * as db from './storage.js';
import { h, sheet, segmented, icon, toast, offerFile } from './ui.js';
import { instrumentOf, songChordItems, sectionKind, tuningLabel, defaultTuning, changeNotes } from './songs.js';
import { findChord } from './chords.js';
import { tabToText, isEmptyTab } from './tabs.js';
import { durLabel } from './progression.js';
import { detectKey, keyShort } from './theory.js';

const INLINE = /\[([^\]\s]{1,14})\]/g;

const songKey = (song) => {
  const k = detectKey(songChordItems(song).map((i) => i.name));
  return k ? keyShort(k).replace('♯', '#').replace('♭', 'b') : '';
};

// „[G]Heute ist [D]der Tag“ → Akkordzeile über der Textzeile
function chordsOverText(line) {
  if (!INLINE.test(line)) return line;
  INLINE.lastIndex = 0;
  let chords = '', text = '', last = 0;
  for (const m of line.matchAll(INLINE)) {
    text += line.slice(last, m.index);
    last = m.index + m[0].length;
    chords = chords.padEnd(text.length) + (chords.length > text.length ? ' ' : '') + m[1];
  }
  text += line.slice(last);
  return `${chords}\n${text}`.trimEnd();
}

// Eine Akkordfolge: Akkorde mit Wiederholung in einer Zeile, Spielweise einzelner Akkorde darunter
const itemDetail = (it) => [it.note, durLabel(it.dur)].filter(Boolean).join(', ');
const chordLine = (b, fmt) => {
  const names = b.items.map((it) => fmt(it.name) + (it.rep > 1 ? ` ×${it.rep}` : ''));
  return names.join('  ') + (b.repeat > 1 ? `  (×${b.repeat})` : '');
};

export function songToText(song, tabs) {
  const inst = instrumentOf(song);
  const meta = [song.artist, songKey(song) && `Tonart ${songKey(song)}`, song.capo && `Capo ${song.capo}`, inst === 'ukulele' && 'Ukulele',
    song.tuning && song.tuning !== defaultTuning(inst) && `Stimmung ${tuningLabel(song.tuning, inst)}`, song.bpm && `${song.bpm} BPM`, song.timeSig, ...changeNotes(song)].filter(Boolean);
  const out = [song.title];
  if (meta.length) out.push(meta.join(' · '));
  if (song.notes?.trim()) out.push('', song.notes.trim());
  for (const sec of song.sections) {
    out.push('', sec.name.toUpperCase());
    for (const b of sec.blocks) {
      if (b.type === 'chords' && b.items.length) {
        if (b.name) out.push(b.name);
        if (b.play) out.push(`Anschlag: ${b.play}`);
        out.push(chordLine(b, (n) => n));
        for (const it of b.items) if (itemDetail(it)) out.push(`  ${it.name}: ${itemDetail(it)}`);
      } else if (b.type === 'tab') {
        const t = tabs.get(b.tabId);
        if (t && !isEmptyTab(t)) out.push(`${t.name || 'Tab'}${b.repeat > 1 ? ` (×${b.repeat})` : ''}`, tabToText(t, song.tuning, { perBlock: 4 }));
      } else if (b.type === 'notes' && b.text?.trim()) {
        out.push(...b.text.trimEnd().split('\n').map(chordsOverText));
      }
    }
  }
  return out.join('\n');
}

const SECTION_TAG = { chorus: 'chorus', bridge: 'bridge' };

export function songToChordPro(song, tabs) {
  const inst = instrumentOf(song);
  const out = [`{title: ${song.title}}`];
  if (song.artist) out.push(`{artist: ${song.artist}}`);
  if (songKey(song)) out.push(`{key: ${songKey(song)}}`);
  if (song.capo) out.push(`{capo: ${song.capo}}`);
  if (song.bpm) out.push(`{tempo: ${song.bpm}}`);
  if (song.timeSig) out.push(`{time: ${song.timeSig}}`);
  if (song.tuning && song.tuning !== defaultTuning(inst)) out.push(`{comment: Stimmung ${song.tuning}}`);
  if (changeNotes(song).length) out.push(`{comment: ${changeNotes(song).join(' · ')}}`);
  if (inst === 'ukulele') out.push('Ukulele');
  // Eigene Griffe mitgeben, damit sie beim Empfänger gleich aussehen
  const shown = new Set();
  for (const it of songChordItems(song)) {
    const ch = findChord(it.name, it.chordId, inst);
    if (!ch || ch.builtin || shown.has(it.name)) continue;
    shown.add(it.name);
    const base = ch.base || 1;
    const frets = ch.frets.map((f) => (f < 0 ? 'x' : f === 0 ? '0' : String(f - base + 1))).join(' ');
    out.push(`{define: ${it.name} base-fret ${base} frets ${frets}}`);
  }
  if (song.notes?.trim()) for (const l of song.notes.trim().split('\n')) out.push(`{comment: ${l}}`);
  for (const sec of song.sections) {
    const tag = SECTION_TAG[sectionKind(sec.name)] || 'verse';
    out.push('', `{start_of_${tag}: ${sec.name}}`);
    for (const b of sec.blocks) {
      if (b.type === 'chords' && b.items.length) {
        if (b.play) out.push(`{comment: Anschlag: ${b.play}}`);
        out.push(chordLine(b, (n) => `[${n}]`));
        for (const it of b.items) if (itemDetail(it)) out.push(`{comment: ${it.name}: ${itemDetail(it)}}`);
      } else if (b.type === 'tab') {
        const t = tabs.get(b.tabId);
        if (t && !isEmptyTab(t)) out.push('{start_of_tab}', tabToText(t, song.tuning, { perBlock: 4 }), '{end_of_tab}');
      } else if (b.type === 'notes' && b.text?.trim()) out.push(b.text.trimEnd());
    }
    out.push(`{end_of_${tag}}`);
  }
  return out.join('\n');
}

const fileBase = (songs) => (songs.length === 1 ? songs[0].title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'song' : `${songs.length}-songs`);

// Auswahl Text / ChordPro mit Vorschau; Teilen, Kopieren oder als Datei
export async function openTextShare(songs) {
  await db.flush();
  const tabs = new Map((await db.getAll('tabs')).map((t) => [t.id, t]));
  const build = {
    text: () => songs.map((s) => songToText(s, tabs)).join('\n\n\n'),
    chordpro: () => songs.map((s) => songToChordPro(s, tabs)).join('\n\n{new_song}\n\n'),
  };
  let format = 'text';
  try { if (localStorage.getItem('gn-share-format') === 'chordpro') format = 'chordpro'; } catch { /* Standard */ }
  const preview = h('pre', { class: 'share-preview', tabindex: '0' });
  const draw = () => { preview.textContent = build[format](); };
  const canShare = !!navigator.share;
  const body = h('div', null,
    h('div', { class: 'seg-block' }, segmented([{ value: 'text', label: 'Text' }, { value: 'chordpro', label: 'ChordPro' }], format, (v) => {
      format = v;
      try { localStorage.setItem('gn-share-format', v); } catch { /* egal */ }
      draw();
    })),
    preview,
    h('div', { class: 'stack', style: 'margin-top:16px' },
      canShare && h('button', { class: 'btn primary block', onClick: () => navigator.share({ title: songs.length === 1 ? songs[0].title : 'Songs', text: preview.textContent }).catch(() => {}) }, icon('share', 'small'), 'Teilen'),
      h('button', { class: 'btn block' + (canShare ? '' : ' primary'), onClick: async () => {
        try { await navigator.clipboard.writeText(preview.textContent); toast('Kopiert'); } catch { toast('Kopieren ist hier nicht möglich.'); }
      } }, icon('copy', 'small'), 'Kopieren'),
      h('button', { class: 'btn block', onClick: () => {
        const ext = format === 'text' ? 'txt' : 'cho';
        offerFile(new Blob([preview.textContent], { type: 'text/plain;charset=utf-8' }), `${fileBase(songs)}.${ext}`, { title: format === 'text' ? 'Textdatei' : 'ChordPro-Datei' });
      } }, icon('download', 'small'), 'Als Datei')),
    h('p', { class: 'form-foot', style: 'margin-top:12px' }, 'ChordPro verstehen viele Song-Apps, auch Sorell selbst beim Import.'));
  draw();
  sheet({ title: songs.length === 1 ? songs[0].title : `${songs.length} Songs`, body, full: true, right: { label: 'Fertig', bold: true } });
}
