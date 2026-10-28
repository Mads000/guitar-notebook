// Beispieldaten für den ersten Start. Alle Einträge sind mit sample: true markiert und lassen sich
// in den Einstellungen mit einem Tipp entfernen. Inhalte sind eigene, kurze Übungsbeispiele.
import * as db from './storage.js';
import { newSong, newSection, newBlock, newChordItem, uid, now } from './songs.js';
import { newTab, newMeasure } from './tabs.js';
import { PRESETS } from './strumming.js';
import { clone } from './ui.js';

const chords = (names, extra = {}) => newBlock('chords', {
  items: names.map((n) => { const [name, d] = n.split(':'); const it = newChordItem(name); if (d) it.dur = { n: Number(d.slice(0, -1)), unit: d.endsWith('T') ? 'bars' : 'beats' }; return it; }),
  ...extra,
});
const strum = (presetId, extra = {}) => { const p = PRESETS.find((x) => x.id === presetId); return newBlock('strum', { name: p.name, grid: p.grid, strokes: clone(p.strokes), ...extra }); };
const note = (text) => newBlock('notes', { text });

// Takt aus Liste [Spalte, Saite (0 = oberste Zeile: Gitarre hohe e, Ukulele A), Bund | 'x', Extras]
function measure(cols, list, pm = [], strings = 6) {
  const m = newMeasure(cols, strings);
  for (const [c, s, f, ext] of list) m.notes[s][c] = f === 'x' ? { f: null, x: true } : { f, ...ext };
  pm.forEach((c) => { m.pm[c] = true; });
  return m;
}

function section(name, blocks) { const s = newSection(name); s.blocks = blocks; return s; }
function tabBlock(song, tabs, name, measures) {
  const t = newTab(song.id, name);
  t.measures = measures;
  tabs.push(t);
  return newBlock('tab', { tabId: t.id });
}

export function buildSamples() {
  const songs = [], tabs = [];

  const a = newSong('Lagerfeuer in G');
  Object.assign(a, { artist: 'Beispiel-Song', capo: 2, bpm: 96, timeSig: '4/4', sample: true, notes: 'Beispiel: einfacher Song mit vier Akkorden. Ideal, um die Bedienung auszuprobieren.' });
  a.sections = [
    section('Intro', [chords(['G:1T', 'D:1T', 'Em:1T', 'C:1T']), strum('p:pop')]),
    section('Verse', [chords(['G', 'D', 'Em', 'C'], { repeat: 2 }), strum('p:pop'), note('Locker aus dem Handgelenk anschlagen. Bei Em leiser werden.')]),
    section('Chorus', [chords(['C', 'G', 'D', 'G']), strum('p:backbeat', { repeat: 2 })]),
    section('Outro', [chords(['C:2T', 'G:2T']), note('Letzten G-Akkord ausklingen lassen.')]),
  ];
  songs.push(a);

  const b = newSong('Blues in A');
  Object.assign(b, { artist: 'Beispiel-Song', bpm: 110, timeSig: '4/4', sample: true, notes: 'Beispiel: 12-taktiges Blues-Schema mit Shuffle-Riff und kleinem Lick (Hammer-on, Pull-off, Bend, Slide, Vibrato, Palm Mute, Dead Notes).' });
  const riff = (low, high) => measure(8, [0, 1, 2, 3, 4, 5, 6, 7].flatMap((c) => [[c, low, 0], [c, high, c % 4 < 2 ? 2 : 4]]), [0, 1, 2, 3, 4, 5, 6, 7]);
  b.sections = [
    section('Riff', [tabBlock(b, tabs, 'Shuffle-Riff', [riff(4, 3), riff(3, 2)]), note('Alle Achtel mit Palm Mute, leicht geshuffelt spielen.')]),
    section('Verse', [chords(['A7:4T', 'D7:2T', 'A7:2T', 'E7:1T', 'D7:1T', 'A7:1T', 'E7:1T'])]),
    section('Solo', [tabBlock(b, tabs, 'Lick', [
      measure(8, [[0, 2, 5, { l: 'h' }], [1, 2, 7], [2, 1, 5], [3, 1, 8, { b: 1 }], [5, 1, 8, { l: 'p' }], [6, 1, 5], [7, 2, 7, { v: true }]]),
      measure(8, [[0, 3, 7, { l: '/' }], [2, 3, 9], [4, 4, 'x'], [5, 4, 'x'], [6, 4, 7, { v: true }]], [4, 5]),
    ])]),
  ];
  songs.push(b);

  const c = newSong('Fingerübung');
  Object.assign(c, { artist: 'Beispiel-Übung', bpm: 70, sample: true, notes: 'Beispiel: chromatische Aufwärmübung 1-2-3-4. Langsam beginnen, jeder Finger bleibt über „seinem“ Bund.' });
  const spider = (s1, s2) => measure(8, [[0, s1, 1], [1, s1, 2], [2, s1, 3], [3, s1, 4], [4, s2, 1], [5, s2, 2], [6, s2, 3], [7, s2, 4]]);
  c.sections = [
    section('Übung', [tabBlock(c, tabs, 'Spinne 1-2-3-4', [spider(5, 4), spider(3, 2), spider(1, 0)]), note('Erst mit 60 BPM, dann schrittweise schneller.')]),
  ];
  songs.push(c);

  const d = newSong('Strandtag (Ukulele)', 'ukulele');
  Object.assign(d, { artist: 'Beispiel-Song', bpm: 100, timeSig: '4/4', sample: true, notes: 'Beispiel für Ukulele (G C E A): vier offene Akkorde, Inselschlag und ein kleines Picking-Muster.' });
  // Saiten von oben: 0 = A, 1 = E, 2 = C, 3 = G
  const pick = (f0, f1, f2, f3) => measure(8, [[0, 3, f3], [1, 2, f2], [2, 1, f1], [3, 0, f0], [4, 1, f1], [5, 2, f2], [6, 1, f1], [7, 0, f0]], [], 4);
  d.sections = [
    section('Intro', [tabBlock(d, tabs, 'Picking C – Am', [pick(3, 0, 0, 0), pick(0, 0, 0, 2)]), note('Daumen auf der G-Saite, Zeige- und Mittelfinger für E und A.')]),
    section('Verse', [chords(['C', 'Am', 'F', 'G'], { repeat: 2 }), strum('p:ballad', { name: 'Inselschlag' })]),
    section('Chorus', [chords(['F', 'G', 'C', 'Am']), strum('p:pop')]),
  ];
  songs.push(d);

  const t = now();
  songs.forEach((s, i) => { s.createdAt = s.updatedAt = new Date(Date.parse(t) - i * 60000).toISOString(); });
  tabs.forEach((x) => { x.id = x.id || uid(); });
  // Anschlag als Spielweise der Akkordfolge – wie bei allen Songs seit Datenformat 2
  songs.forEach(db.strumToPlay);
  return { songs, tabs };
}

export async function seedSamples() {
  const { songs, tabs } = buildSamples();
  await db.putMany([...songs.map((s) => ['songs', s]), ...tabs.map((x) => ['tabs', x])]);
  return songs.length;
}

export async function removeSamples() {
  const songs = (await db.getAll('songs')).filter((s) => s.sample);
  const ids = new Set(songs.map((s) => s.id));
  const tabs = (await db.getAll('tabs')).filter((x) => ids.has(x.songId));
  await db.deleteMany([...songs.map((s) => ['songs', s.id]), ...tabs.map((x) => ['tabs', x.id])]);
  return songs.length;
}
