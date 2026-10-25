// Songs: Datenmodell, Fabriken und Verwaltung (erstellen, duplizieren, löschen, suchen, sortieren).
import * as db from './storage.js';
import { clone } from './ui.js';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const now = () => new Date().toISOString();

export const SECTION_PRESETS = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Solo', 'Outro'];
export const TUNINGS = [
  { name: 'Standard', notes: 'E A D G B E' },
  { name: 'Drop D', notes: 'D A D G B E' },
  { name: 'Halbton tiefer', notes: 'Eb Ab Db Gb Bb Eb' },
  { name: 'D-Standard', notes: 'D G C F A D' },
  { name: 'Drop C', notes: 'C G C F A D' },
  { name: 'DADGAD', notes: 'D A D G A D' },
  { name: 'Open G', notes: 'D G D G B D' },
  { name: 'Open D', notes: 'D A D F# A D' },
  { name: 'Open E', notes: 'E B E G# B E' },
];
export const UKE_TUNINGS = [
  { name: 'Standard', notes: 'G C E A' },
  { name: 'D-Stimmung', notes: 'A D F# B' },
  { name: 'Bariton', notes: 'D G B E' },
  { name: 'Halbton tiefer', notes: 'F# B D# G#' },
];
// Instrument pro Song. Fehlt das Feld (ältere Daten), ist es eine Gitarre.
export const INSTRUMENTS = {
  guitar: { label: 'Gitarre', strings: 6, tunings: TUNINGS },
  ukulele: { label: 'Ukulele', strings: 4, tunings: UKE_TUNINGS },
};
export const instrumentOf = (song) => (song?.instrument === 'ukulele' ? 'ukulele' : 'guitar');
export const stringsOf = (inst) => INSTRUMENTS[inst === 'ukulele' ? 'ukulele' : 'guitar'].strings;
export const defaultTuning = (inst) => INSTRUMENTS[inst === 'ukulele' ? 'ukulele' : 'guitar'].tunings[0].notes;
export const songTuning = (song) => song?.tuning || defaultTuning(instrumentOf(song));
export const TIME_SIGS = ['4/4', '3/4', '6/8', '2/4', '12/8', '5/4', '7/8'];
export const BLOCK_TYPES = ['chords', 'strum', 'tab', 'notes'];

export function newSong(title = '', instrument = 'guitar') {
  const t = now();
  return {
    id: uid(), title: title || 'Neuer Song', artist: '', instrument: instrument === 'ukulele' ? 'ukulele' : 'guitar', tuning: '', capo: 0, bpm: null, timeSig: '',
    notes: '', favorite: false, sample: false, createdAt: t, updatedAt: t, sections: [],
  };
}

export const newSection = (name = 'Verse') => ({ id: uid(), name, blocks: [] });

export function newBlock(type, extra = {}) {
  const base = { id: uid(), type };
  if (type === 'chords') return { ...base, items: [], repeat: 1, ...extra };
  if (type === 'strum') return { ...base, name: '', grid: 8, strokes: [], repeat: 1, ...extra };
  if (type === 'tab') return { ...base, tabId: null, ...extra };
  return { ...base, text: '', ...extra };
}

export const newChordItem = (name, chordId) => ({ id: uid(), name, ...(chordId ? { chordId } : {}) });

export function tuningLabel(t, inst = 'guitar') {
  if (!t) return 'Standard';
  const p = INSTRUMENTS[inst === 'ukulele' ? 'ukulele' : 'guitar'].tunings.find((x) => x.notes === t);
  return p ? p.name : t;
}

export function metaParts(song) {
  const parts = [];
  const inst = instrumentOf(song);
  if (inst === 'ukulele') parts.push('Ukulele');
  if (song.capo) parts.push(`Capo ${song.capo}`);
  if (song.tuning && song.tuning !== defaultTuning(inst)) parts.push(tuningLabel(song.tuning, inst));
  if (song.bpm) parts.push(`${song.bpm} BPM`);
  if (song.timeSig) parts.push(song.timeSig);
  return parts;
}

// Alle verwendeten Akkordnamen eines Songs in Reihenfolge des ersten Auftretens.
export function songChordItems(song) {
  const seen = new Map();
  for (const sec of song.sections) for (const b of sec.blocks) {
    if (b.type !== 'chords') continue;
    for (const it of b.items) if (it.name && !seen.has(it.name)) seen.set(it.name, it);
  }
  return [...seen.values()];
}

export function firstProgression(song, max = 6) {
  return songChordItems(song).slice(0, max).map((i) => i.name).join(' · ');
}

export const tabIdsOf = (song) => song.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'tab' && b.tabId).map((b) => b.tabId));

// Kopie eines Blocks mit neuen IDs. Tab-Daten werden separat dupliziert.
export function cloneBlock(block) {
  const c = clone(block);
  c.id = uid();
  if (c.items) c.items.forEach((i) => { i.id = uid(); });
  return c;
}

export function touch(song) {
  song.updatedAt = now();
  db.saveLater('songs', song);
}

export async function createSong(title, instrument) {
  const song = newSong(title, instrument);
  await db.put('songs', song);
  return song;
}

export async function duplicateSong(song, tabsById) {
  await db.flush();
  const copy = clone(song);
  copy.id = uid();
  copy.title = song.title + ' (Kopie)';
  copy.favorite = false;
  copy.sample = false;
  copy.createdAt = copy.updatedAt = now();
  const entries = [];
  for (const sec of copy.sections) {
    sec.id = uid();
    for (const b of sec.blocks) {
      b.id = uid();
      if (b.items) b.items.forEach((i) => { i.id = uid(); });
      if (b.type === 'tab' && b.tabId) {
        const src = tabsById?.get(b.tabId) || await db.get('tabs', b.tabId);
        if (src) {
          const t = clone(src);
          t.id = uid();
          t.songId = copy.id;
          t.createdAt = t.updatedAt = now();
          b.tabId = t.id;
          entries.push(['tabs', t]);
        } else b.tabId = null;
      }
    }
  }
  entries.push(['songs', copy]);
  await db.putMany(entries);
  // Fotos und Aufnahmen einzeln kopieren (können groß sein)
  for (const m of await db.getAllByIndex('media', 'songId', song.id)) {
    await db.put('media', { ...m, id: 'm' + uid(), songId: copy.id, createdAt: now() });
  }
  return copy;
}

export async function deleteSong(song) {
  const media = await db.getKeysByIndex('media', 'songId', song.id);
  await db.deleteMany([['songs', song.id], ...tabIdsOf(song).map((id) => ['tabs', id]), ...media.map((id) => ['media', id])]);
}

export function songMatches(song, q) {
  if (!q) return true;
  const hay = [song.title, song.artist, song.notes, ...song.sections.map((s) => s.name), ...songChordItems(song).map((i) => i.name)]
    .join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export const SORTS = {
  updated: { label: 'Zuletzt bearbeitet', fn: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
  title: { label: 'Titel', fn: (a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }) },
  artist: { label: 'Künstler', fn: (a, b) => (a.artist || '￿').localeCompare(b.artist || '￿', 'de', { sensitivity: 'base' }) || a.title.localeCompare(b.title, 'de') },
  created: { label: 'Erstellt', fn: (a, b) => b.createdAt.localeCompare(a.createdAt) },
};
