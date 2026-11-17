// Beispieldaten für den ersten Start. Alle Einträge sind mit sample: true markiert und lassen sich
// in den Einstellungen mit einem Tipp entfernen. Enthalten sind nur Akkordfolgen, Spielweisen und Tabs, keine Liedtexte.
import * as db from './storage.js';
import { newSong, newSection, newBlock, newChordItem, uid, now } from './songs.js';
import { newTab, newMeasure } from './tabs.js';
import { loadUserChords } from './chords.js';

// Akkord mit optionaler Spielweise und Wiederholung: ['Am', 'DD D'] oder ['E', 'DDX U', 2]
const item = ([name, note, rep]) => {
  const it = newChordItem(name);
  if (note) it.note = note;
  if (rep > 1) it.rep = rep;
  return it;
};
const chords = (list, extra = {}) => newBlock('chords', { items: list.map((x) => item(Array.isArray(x) ? x : [x])), ...extra });
const note = (text) => newBlock('notes', { text });

// Takt aus Liste [Spalte, Saite (0 = oberste Zeile: Gitarre hohe e, Ukulele A), Bund | 'x', Extras]
function measure(cols, list, pm = [], strings = 6) {
  const m = newMeasure(cols, strings);
  for (const [c, s, f, ext] of list) m.notes[s][c] = f === 'x' ? { f: null, x: true } : { f, ...ext };
  pm.forEach((c) => { m.pm[c] = true; });
  return m;
}

// Songeigene Griffe für Akkorde ohne eingebauten Griff. frets/fingers von der tiefsten Saite an, -1 = nicht spielen.
function ownChord(song, grips, name, frets, fingers) {
  const c = { id: 'u' + uid(), name, frets, fingers, base: 1, showFingers: true, songId: song.id, createdAt: now(), updatedAt: now() };
  grips.push(c);
  for (const sec of song.sections) for (const b of sec.blocks) if (b.type === 'chords') for (const it of b.items) if (it.name === name) it.chordId = c.id;
}

function section(name, blocks) { const s = newSection(name); s.blocks = blocks; return s; }
function tabBlock(song, tabs, name, measures) {
  const t = newTab(song.id, name);
  t.measures = measures;
  tabs.push(t);
  return newBlock('tab', { tabId: t.id });
}

export function buildSamples() {
  const songs = [], tabs = [], grips = [];

  const a = newSong('Backseat');
  Object.assign(a, { artist: 'Boywithuke', capo: 2, sample: true });
  a.sections = [
    section('Verse', [chords([['Am', 'DD D'], ['E7', 'DD D'], ['0', '2 1 Saite offen'], ['F', 'DD D'], ['F', 'DDD'], ['C', 'DDD']])]),
    section('Chorus', [
      tabBlock(a, tabs, 'Chorus-Tab', [
        measure(8, [[0, 4, 0], [1, 3, 2], [2, 2, 2], [3, 1, 1], [4, 2, 2], [5, 5, 0], [6, 3, 0], [7, 2, 1]]),
        measure(8, [[0, 1, 0], [1, 2, 0], [2, 5, 1], [3, 3, 3], [4, 2, 2], [5, 1, 1], [6, 1, 1], [6, 2, 2], [6, 3, 3], [6, 4, 3], [6, 5, 1], [7, 5, 'x']]),
        measure(8, [[0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 3], [0, 5, 1], [1, 5, 'x'], [2, 1, 1], [2, 2, 2], [2, 3, 3], [2, 4, 3]]),
      ]),
      note('Am - E7 - F - F'),
    ]),
  ];
  songs.push(a);

  const b = newSong("Don't Look Back in Anger");
  Object.assign(b, { artist: 'Oasis', sample: true, notes: 'Quelle: https://www.youtube.com/watch?v=f9_pCJ5L5Qw' });
  const verse = ['C', 'C/B', 'Am', 'E', 'Fmaj7', 'G', 'C', 'Am', 'G'];
  b.sections = [
    section('Intro', [note('C und Fmaj7 im Wechsel spielen.'), chords(['C', 'Fmaj7'], { repeat: 2 })]),
    section('Verse 1 & 2', [note('C/B ist ein Bassdurchgang von C nach Am (2. Bund A-Saite).'), chords(verse, { repeat: 2 })]),
    section('Pre-Chorus', [note('Erklärter Akkord vor Am: G-Grip 1 Bund höher geschoben + 3. Saite im 4. Bund.'),
      chords(['F', 'Fm', 'C', 'F', 'Fm', 'C', 'F', 'Fm', 'C', 'G', 'G#dim', 'Am', 'G', 'Fmaj7'])]),
    section('Chorus', [note('Akkorde wie in der Strophe.'), chords(verse, { repeat: 2 })]),
    section('Instrumental', [note('Instrumental-Part in der Mitte.'), chords(['F', 'Fm', 'C', 'F', 'Fm', 'C', 'G', 'G#dim', 'Am', 'G', 'Fmaj7'])]),
    section('Outro', [note('Zum Schluss auf C ausklingen lassen.'), chords(['F', 'Fm', 'C'])]),
  ];
  // C/B: Bassdurchgang von C nach Am (B im 2. Bund der A-Saite); G#dim als offener Griff
  ownChord(b, grips, 'C/B', [-1, 2, 2, 0, 1, 0], [0, 2, 3, 0, 1, 0]);
  ownChord(b, grips, 'G#dim', [-1, -1, 0, 1, 0, 4], [0, 0, 0, 1, 0, 4]);
  songs.push(b);

  const c = newSong('Heart of Ice', 'ukulele');
  Object.assign(c, { artist: 'Boywithuke', capo: 1, sample: true });
  c.sections = [
    section('Verse', [chords([['Abm', 'DDX D – Pause'], ['Gb', 'DDX D – Pause'], ['E', 'DDX D – Pause'], ['B', 'DDX D'], ['Eb', 'DDX D']])]),
    section('Chorus', [chords([['E', 'DDX U ×2'], ['B', 'DDX U ×2'], ['Eb', 'DDX U ×2'], ['Abm', 'DDX U'], ['Gb', 'DDX U']])]),
    // Saiten von oben: 0 = A, 1 = E, 2 = C, 3 = G
    section('Riff', [tabBlock(c, tabs, 'Riff-Tab', [
      measure(5, [[0, 2, 8], [1, 1, 6], [2, 1, 7], [3, 0, 9], [4, 0, 6]], [], 4),
      measure(6, [[0, 0, 4], [1, 0, 2], [2, 0, 6], [3, 0, 5], [4, 0, 2], [5, 1, 4]], [], 4),
    ])]),
  ];
  // Ukulele (G C E A): Abm und Gb gibt es nicht als eingebaute Griffe
  ownChord(c, grips, 'Abm', [1, 3, 4, 2], [1, 3, 4, 2]);
  ownChord(c, grips, 'Gb', [3, 1, 2, 1], [3, 1, 2, 1]);
  songs.push(c);

  const t = now();
  songs.forEach((s, i) => { s.createdAt = s.updatedAt = new Date(Date.parse(t) - i * 60000).toISOString(); });
  tabs.forEach((x) => { x.id = x.id || uid(); });
  return { songs, tabs, chords: grips };
}

export async function seedSamples() {
  const { songs, tabs, chords } = buildSamples();
  await db.putMany([...songs.map((s) => ['songs', s]), ...tabs.map((x) => ['tabs', x]), ...chords.map((x) => ['chords', x])]);
  await loadUserChords();
  return songs.length;
}

export async function removeSamples() {
  const songs = (await db.getAll('songs')).filter((s) => s.sample);
  const ids = new Set(songs.map((s) => s.id));
  const tabs = (await db.getAll('tabs')).filter((x) => ids.has(x.songId));
  const chords = (await db.getAll('chords')).filter((x) => ids.has(x.songId));
  await db.deleteMany([...songs.map((s) => ['songs', s.id]), ...tabs.map((x) => ['tabs', x.id]), ...chords.map((x) => ['chords', x.id])]);
  if (chords.length) await loadUserChords();
  return songs.length;
}
