// Tonnamen richtig schreiben und Tabs transponieren – ohne Oberfläche, damit es sich auch ohne Browser testen lässt.
// Jede Stufe einer Tonleiter bekommt ihren eigenen Buchstaben: C-Moll hat E♭ (nicht D♯), F♯-Dur hat E♯ (nicht F).

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const mod = (n) => ((n % 12) + 12) % 12;
// Stufe (0 = Grundton) je Halbton bei Tonleitern und Akkorden, die nicht jede Stufe enthalten. ♭5 bleibt eine Quinte.
const STEP_OF_SEMI = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

const defaultSteps = (ivs) => (ivs.length === 7 ? ivs.map((_, i) => i) : ivs.map((iv) => STEP_OF_SEMI[mod(iv)]));

// „1 ♭3 ♯5 ♭7“ → Stufen [0, 2, 4, 6]; 9 ist die Stufe 2
export const stepsOfFormula = (formula) => formula.split(' ').map((d) => (Number(d.replace(/\D/g, '')) - 1) % 7);

function spellFrom(letter, rootPc, ivs, steps) {
  return ivs.map((iv, i) => {
    const li = (letter + steps[i]) % 7;
    let d = mod(rootPc + iv - NATURAL[li]);
    if (d > 6) d -= 12;
    return LETTERS[li] + (d > 0 ? '#'.repeat(d) : 'b'.repeat(-d));
  });
}

// Vorzeichen zählen; doppelte Vorzeichen sind teuer, damit die lesbarere Schreibweise gewinnt
const cost = (names) => names.reduce((sum, n) => sum + (n.length - 1) + (n.length > 2 ? 4 : 0), 0);

/**
 * Töne einer Tonleiter oder eines Akkords (ivs: Halbtöne ab Grundton) als Namen, z. B. ['C', 'Eb', 'G'].
 * Ein schwarzer Grundton wird so geschrieben, wie die Töne am wenigsten Vorzeichen brauchen (C♯m, aber D♭-Dur).
 * Stehen beide Schreibweisen gleich da, gilt ♯ (F♯-Dur, D♯m) – wie im Quintenzirkel.
 */
export function spellNotes(rootPc, ivs, steps = defaultSteps(ivs)) {
  const pc = mod(rootPc);
  const white = NATURAL.indexOf(pc);
  if (white >= 0) return spellFrom(white, pc, ivs, steps);
  const sharp = spellFrom(NATURAL.indexOf(mod(pc - 1)), pc, ivs, steps);
  const flat = spellFrom(NATURAL.indexOf(mod(pc + 1)), pc, ivs, steps);
  return cost(flat) < cost(sharp) ? flat : sharp;
}

// „C#m“ → „C♯m“, „Bb/Ab“ → „B♭/A♭“, „F##“ → „F♯♯“. Einheitlich für alles, was die Theorie anzeigt.
export const prettyNote = (n) => String(n)
  .replace(/([A-G])(b+)/g, (_, l, b) => l + '♭'.repeat(b.length))
  .replace(/#/g, '♯');

const MAX_FRET = 24;

/**
 * Verschiebt alle Noten eines Tabs um n Halbtöne (ändert den Tab). Techniken bleiben, wie sie sind.
 * Passt das Ergebnis nicht aufs Griffbrett, wandert der ganze Tab um eine Oktave; nur wenn er auch dann nicht passt,
 * einzelne Noten. mapName: optional für die Akkordnamen über dem Tab.
 * Ergebnis: { notes: Anzahl der Noten, octave: -12, 0 oder 12 }
 */
export function transposeTabNotes(tab, n, mapName = null) {
  const each = (fn) => { for (const m of tab.measures) for (const row of m.notes) for (const x of row) if (x && x.f != null) fn(x); };
  let lo = Infinity, hi = -Infinity, notes = 0;
  each((x) => { lo = Math.min(lo, x.f); hi = Math.max(hi, x.f); notes++; });
  let d = n;
  if (notes) {
    if (lo + d < 0) d += 12;
    else if (hi + d > MAX_FRET) d -= 12;
    each((x) => {
      let f = x.f + d;
      while (f < 0) f += 12;
      while (f > MAX_FRET) f -= 12;
      x.f = f;
    });
  }
  if (mapName) for (const m of tab.measures) if (m.ch) m.ch = m.ch.map((c) => (c ? mapName(c) : c));
  return { notes, octave: d - n };
}
