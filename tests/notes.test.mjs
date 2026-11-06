// Tonnamen und Tab-Transponieren. Aufruf: node tests/notes.test.mjs
import assert from 'node:assert/strict';
import { spellNotes, stepsOfFormula, prettyNote, transposeTabNotes } from '../js/notes.js';

let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); }
};
const line = (...a) => prettyNote(spellNotes(...a).join(' '));

const CHORD = (pc, ivs, formula) => line(pc, ivs, stepsOfFormula(formula));
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];

console.log('Akkorde (Fehler aus der Bewertung)');
check('Cm', () => assert.equal(CHORD(0, [0, 3, 7], '1 ♭3 5'), 'C E♭ G'));
check('Cm7', () => assert.equal(CHORD(0, [0, 3, 7, 10], '1 ♭3 5 ♭7'), 'C E♭ G B♭'));
check('C7', () => assert.equal(CHORD(0, [0, 4, 7, 10], '1 3 5 ♭7'), 'C E G B♭'));
check('Cdim', () => assert.equal(CHORD(0, [0, 3, 6], '1 ♭3 ♭5'), 'C E♭ G♭'));
check('C♯m statt D♭m', () => assert.equal(CHORD(1, [0, 3, 7], '1 ♭3 5'), 'C♯ E G♯'));
check('D♭ bleibt D♭', () => assert.equal(CHORD(1, [0, 4, 7], '1 3 5'), 'D♭ F A♭'));
check('Caug hat G♯', () => assert.equal(CHORD(0, [0, 4, 8], '1 3 ♯5'), 'C E G♯'));
check('Cadd9', () => assert.equal(CHORD(0, [0, 4, 7, 14], '1 3 5 9'), 'C E G D'));

console.log('Tonleitern');
check('C Mixolydisch', () => assert.equal(line(0, [0, 2, 4, 5, 7, 9, 10]), 'C D E F G A B♭'));
check('D Harmonisch Moll', () => assert.equal(line(2, [0, 2, 3, 5, 7, 8, 11]), 'D E F G A B♭ C♯'));
check('F♯-Dur', () => assert.equal(line(6, MAJ), 'F♯ G♯ A♯ B C♯ D♯ E♯'));
check('D♭-Dur', () => assert.equal(line(1, MAJ), 'D♭ E♭ F G♭ A♭ B♭ C'));
check('A Blues mit E♭', () => assert.equal(line(9, [0, 3, 5, 6, 7, 10]), 'A C D E♭ E G'));
check('A Moll-Pentatonik', () => assert.equal(line(9, [0, 3, 5, 7, 10]), 'A C D E G'));
check('C Lokrisch', () => assert.equal(line(0, [0, 1, 3, 5, 6, 8, 10]), 'C D♭ E♭ F G♭ A♭ B♭'));
check('E♭ Harmonisch Moll statt D♯ mit Doppelkreuz', () => assert.equal(line(3, [0, 2, 3, 5, 7, 8, 11]), 'E♭ F G♭ A♭ B♭ C♭ D'));
check('Doppelkreuz bleibt lesbar', () => assert.equal(prettyNote('F##'), 'F♯♯'));
check('alle Moll-Tonarten: jeder Buchstabe einmal', () => {
  for (let pc = 0; pc < 12; pc++) {
    const letters = spellNotes(pc, MIN).map((n) => n[0]);
    assert.equal(new Set(letters).size, 7, `Grundton ${pc}`);
  }
});
check('Grundtöne der Dur-Tonarten', () => assert.deepEqual(
  Array.from({ length: 12 }, (_, pc) => spellNotes(pc, MAJ)[0]),
  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']));
check('Grundtöne der Moll-Tonarten', () => assert.deepEqual(
  Array.from({ length: 12 }, (_, pc) => spellNotes(pc, MIN)[0]),
  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']));

console.log('Tab transponieren');
const tabOf = (...frets) => ({ measures: [{ cols: frets.length, notes: [frets.map((f) => (f == null ? null : { f }))], ch: frets.map((_, i) => (i === 0 ? 'Am' : '')) }] });
const frets = (t) => t.measures[0].notes[0].map((x) => x?.f ?? null);
check('+2 verschiebt alle Bünde', () => { const t = tabOf(0, 3, null, 5); assert.deepEqual(transposeTabNotes(t, 2), { notes: 3, octave: 0 }); assert.deepEqual(frets(t), [2, 5, null, 7]); });
check('−2 unter die Leersaite: eine Oktave höher', () => { const t = tabOf(0, 3); assert.equal(transposeTabNotes(t, -2).octave, 12); assert.deepEqual(frets(t), [10, 13]); });
check('zu hoch: eine Oktave tiefer', () => { const t = tabOf(20, 24); assert.equal(transposeTabNotes(t, 3).octave, -12); assert.deepEqual(frets(t), [11, 15]); });
check('passt nie: einzelne Noten wandern', () => { const t = tabOf(0, 24); transposeTabNotes(t, -2); assert.ok(frets(t).every((f) => f >= 0 && f <= 24)); });
check('Techniken und Dead Notes bleiben', () => {
  const t = { measures: [{ cols: 2, notes: [[{ f: 5, l: 'h', b: 1 }, { f: null, x: true }]] }] };
  transposeTabNotes(t, 2);
  assert.deepEqual(t.measures[0].notes[0], [{ f: 7, l: 'h', b: 1 }, { f: null, x: true }]);
});
check('Akkordnamen über dem Tab', () => { const t = tabOf(0); transposeTabNotes(t, 2, () => 'Bm'); assert.equal(t.measures[0].ch[0], 'Bm'); });

if (failed) { console.log(`\n${failed} Test(s) fehlgeschlagen`); process.exit(1); }
console.log('\nAlle Tests bestanden');
