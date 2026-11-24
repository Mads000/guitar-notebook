// Prompt für eine andere KI (ChatGPT, Gemini, Claude …) ohne eigenen Schlüssel: Foto dort hochladen, diesen Prompt
// dazu, die Antwort unter „Text & Datei“ einfügen. Je ein Prompt für Gitarre und für Ukulele, damit die KI nur
// Griffe, Tabs und Saiten des gewählten Instruments schreibt.
// Beschreibt genau das Textformat, das parseText() in importer.js liest. Ändert sich dort etwas, hier anpassen
// und die Beispiele erneut durch parseText() prüfen.

import { lang } from './i18n.js';

const GUITAR = {
  name: 'Gitarre',
  intro: 'Instrument: GITARRE (6 Saiten, Standardstimmung E A D G B e).',
  tuning: 'Stimmung: Drop D   (oder Halbton tiefer, DADGAD, Open G … bzw. 6 Töne wie D A D G B E; bei Standardstimmung weglassen)',
  shape: `  Griff Fmaj7: x 3 3 2 1 0
  6 Werte = Bund je Saite von der tiefsten zur höchsten Saite (E A D G B e), x = nicht spielen, 0 = leer.
  Griffdiagramm lesen: 6 senkrechte Linien = Saiten (links die tiefe E-Saite), waagerechte = Bünde, Zahl am Rand = Bundnummer.`,
  pick: 'P(5,3,2,1) = diese Saiten nacheinander zupfen (Saite 1 = hohe e, 6 = tiefe E)',
  tab: `- 6 Zeilen in der Reihenfolge e B G D A E (oben die hohe e-Saite). Jede Zeile beginnt mit dem Saitennamen und |.`,
  pm: `- Palm Mute: eine Zeile „PM-----|“ direkt über dem Tab, die über den gedämpften Tönen steht.\n`,
  other: 'Ist das Material erkennbar für Ukulele (4 Tab-Linien, Griffbilder mit 4 Saiten, Saiten G C E A), übernimm nur Akkorde, Anschläge und Hinweise und lass Tabs und Griffe weg.',
  example: `Nachtzug nach Norden – Die Beispielband
Gitarre
Capo: 2
Tempo: 96 BPM
Takt: 4/4
Tonart: Am
Griff Fmaj7: x 3 3 2 1 0
Griff Bm7: x 2 4 2 3 2

Ruhig beginnen, ab dem Chorus kräftiger.

[Intro]
  PM-----------------|
e|------------------------|------------------------|
B|---------1-----------1--|---------0-----------0--|
G|------2-----2-----2-----|------0-----0-----0-----|
D|---2-----------2--------|---2-----------2--------|
A|0-----------------------|------------------------|
E|------------------------|3-----------------------|
x2

[Verse 1]
Am  P(5,3,2,1) ×2
Fmaj7  P(4,3,2,1) ×2
C  P(5,3,2,1)
G  DDU UDU ×2

[Pre-Chorus]
Anschlag: D D DU >D U
Dm Am G G Dm Am E7 E7

Nur leise mitklopfen, nicht strummen.

[Chorus]
Anschlag: D - D U - U D U
Am F C G Am F E7

[Verse 2]
Verse 2 wie Verse 1

[Chorus]

[Bridge]
Anschlag: D X U X D X U X
Dm Bm7 F E7 (x2)

[Solo]
e|---------5--8p-5--------|------------------------|------------------------|
B|5h-6-----------------6--|8b----6/-8--6-----------|5~----------------------|
G|------------------------|------------------------|------------------------|
D|------------------------|------------------------|------------------------|
A|------------------------|------------------------|------------------------|
E|------------------------|------------------------|------------------------|

[Chorus] x2

[Outro]
wie oben, aber gezupft: P(5,3,2,1)

Zum Schluss ausklingen lassen.`,
};

const UKULELE = {
  name: 'Ukulele',
  intro: 'Instrument: UKULELE (4 Saiten, Standardstimmung G C E A).',
  tuning: 'Stimmung: Bariton   (oder D-Stimmung, Halbton tiefer bzw. 4 Töne wie D G B E; bei Standardstimmung G C E A weglassen)',
  shape: `  Griff E: 4 4 4 2
  4 Werte = Bund je Saite in der Reihenfolge G C E A, x = nicht spielen, 0 = leer.
  Griffdiagramm lesen: 4 senkrechte Linien = Saiten (links G, rechts A), waagerechte = Bünde, Zahl am Rand = Bundnummer.`,
  pick: 'P(4,3,2,1) = diese Saiten nacheinander zupfen (Saite 1 = A, 2 = E, 3 = C, 4 = G)',
  tab: `- 4 Zeilen in der Reihenfolge A E C G (oben die A-Saite). Jede Zeile beginnt mit dem Saitennamen und |.`,
  pm: '',
  other: 'Ist das Material erkennbar für Gitarre (6 Tab-Linien, Griffbilder mit 6 Saiten), übernimm nur Akkorde, Anschläge und Hinweise und lass Tabs und Griffe weg.',
  example: `Sonnendeck – Die Beispielband
Ukulele
Capo: 1
Tempo: 110 BPM
Takt: 4/4
Tonart: C
Griff E: 4 4 4 2

Locker und leicht spielen.

[Intro]
A|---------3h-5-----------|---------0--2/-4p-2-----|
E|------0--------0--------|------0--------------0--|
C|---0--------------0-----|---0--------------------|
G|0--------------------0--|2-----------------------|
x2

[Verse 1]
C  DDU UDU ×2
Am  DDU UDU ×2
F  P(4,3,2,1) ×2
G  D D DU

[Chorus]
Anschlag: D - D U - U D U
F G C Am (x2)

Hier etwas lauter werden.

[Verse 2]
Verse 2 wie Verse 1

[Chorus]

[Bridge]
Anschlag: D X D X
Dm E Am G (x2)

[Chorus] x2

[Outro]
wie oben, aber gezupft: P(4,3,2,1)

Zum Schluss ausklingen lassen.`,
};

// ---------- Englisch (gleiche Regeln, englische Schlüsselwörter, die parseText() ebenfalls versteht) ----------
const GUITAR_EN = {
  name: 'Guitar',
  intro: 'Instrument: GUITAR (6 strings, standard tuning E A D G B e).',
  tuning: 'Tuning: Drop D   (or Half step down, DADGAD, Open G … or 6 notes like D A D G B E; leave out for standard tuning)',
  shape: `  Shape Fmaj7: x 3 3 2 1 0
  6 values = fret per string from the LOWEST to the highest string (E A D G B e), x = not played, 0 = open.
  Reading a chord diagram: 6 vertical lines = strings (low E on the left), horizontal lines = frets, number at the side = fret number.`,
  pick: 'P(5,3,2,1) = pick these strings one after the other (string 1 = high e, 6 = low E)',
  pickShort: 'P(5,3,2,1)',
  tab: `- 6 lines in the order e B G D A E (high e string at the top). Each line starts with the string name and |.`,
  pm: `- Palm mute: a line “PM-----|” directly above the tab, standing over the muted notes.\n`,
  other: 'If the material is clearly for ukulele (4 tab lines, chord diagrams with 4 strings, strings G C E A), take over only chords, strumming and notes, and leave out tabs and shapes.',
  example: `Night Train North – The Example Band
Guitar
Capo: 2
Tempo: 96 BPM
Time: 4/4
Key: Am
Shape Fmaj7: x 3 3 2 1 0
Shape Bm7: x 2 4 2 3 2

Start calmly, stronger from the chorus on.

[Intro]
  PM-----------------|
e|------------------------|------------------------|
B|---------1-----------1--|---------0-----------0--|
G|------2-----2-----2-----|------0-----0-----0-----|
D|---2-----------2--------|---2-----------2--------|
A|0-----------------------|------------------------|
E|------------------------|3-----------------------|
x2

[Verse 1]
Am  P(5,3,2,1) ×2
Fmaj7  P(4,3,2,1) ×2
C  P(5,3,2,1)
G  DDU UDU ×2

[Pre-Chorus]
Strum: D D DU >D U
Dm Am G G Dm Am E7 E7

Just tap along quietly, no strumming.

[Chorus]
Strum: D - D U - U D U
Am F C G Am F E7

[Verse 2]
Verse 2 like Verse 1

[Chorus]

[Bridge]
Strum: D X U X D X U X
Dm Bm7 F E7 (x2)

[Solo]
e|---------5--8p-5--------|------------------------|------------------------|
B|5h-6-----------------6--|8b----6/-8--6-----------|5~----------------------|
G|------------------------|------------------------|------------------------|
D|------------------------|------------------------|------------------------|
A|------------------------|------------------------|------------------------|
E|------------------------|------------------------|------------------------|

[Chorus] x2

[Outro]
like above, but picked: P(5,3,2,1)

Let it ring out at the end.`,
};

const UKULELE_EN = {
  name: 'Ukulele',
  intro: 'Instrument: UKULELE (4 strings, standard tuning G C E A).',
  tuning: 'Tuning: Baritone   (or D tuning, Half step down, or 4 notes like D G B E; leave out for standard tuning G C E A)',
  shape: `  Shape E: 4 4 4 2
  4 values = fret per string in the order G C E A, x = not played, 0 = open.
  Reading a chord diagram: 4 vertical lines = strings (G on the left, A on the right), horizontal lines = frets, number at the side = fret number.`,
  pick: 'P(4,3,2,1) = pick these strings one after the other (string 1 = A, 2 = E, 3 = C, 4 = G)',
  pickShort: 'P(4,3,2,1)',
  tab: `- 4 lines in the order A E C G (A string at the top). Each line starts with the string name and |.`,
  pm: '',
  other: 'If the material is clearly for guitar (6 tab lines, chord diagrams with 6 strings), take over only chords, strumming and notes, and leave out tabs and shapes.',
  example: `Sun Deck – The Example Band
Ukulele
Capo: 1
Tempo: 110 BPM
Time: 4/4
Key: C
Shape E: 4 4 4 2

Play it loose and light.

[Intro]
A|---------3h-5-----------|---------0--2/-4p-2-----|
E|------0--------0--------|------0--------------0--|
C|---0--------------0-----|---0--------------------|
G|0--------------------0--|2-----------------------|
x2

[Verse 1]
C  DDU UDU ×2
Am  DDU UDU ×2
F  P(4,3,2,1) ×2
G  D D DU

[Chorus]
Strum: D - D U - U D U
F G C Am (x2)

Get a bit louder here.

[Verse 2]
Verse 2 like Verse 1

[Chorus]

[Bridge]
Strum: D X D X
Dm E Am G (x2)

[Chorus] x2

[Outro]
like above, but picked: P(4,3,2,1)

Let it ring out at the end.`,
};

// ---------- Quelle: Bilder oder Video (nur diese Stellen unterscheiden sich, das Format bleibt gleich) ----------
const IMAGE = {
  intro: 'Du bekommst ein oder mehrere Bilder von einem Song (Akkordblatt, Songbook-Seite, handschriftliche Notizen, Tabs oder Screenshot).',
  output: `- Übernimm Akkorde, Griffe, Anschläge, Tabs und Hinweise genau so, wie sie auf dem Bild stehen. Liedtext lässt du immer weg. Nichts erfinden, nichts weglassen, nichts „verbessern“.
- Unleserliches schreibst du als [?], statt zu raten.
- Mehrere Bilder gehören zu EINEM Song, in der gegebenen Reihenfolge.`,
  appears: 'auf dem Bild steht',
  tabRead: '- Tab beim Ablesen Spalte für Spalte von links nach rechts lesen; die Saite durch Abzählen der Linien von oben bestimmen; zum Schluss jede Note mit dem Bild vergleichen.',
  final: 'Bitte jetzt den Song aus dem Bild bzw. den Bildern in genau diesem Format ausgeben.',
};
const VIDEO = {
  intro: 'Du bekommst ein Video zu einem Song (YouTube-Link oder Videodatei) – meist ein Tutorial, eine Lesson, ein Playthrough oder eine Aufführung. Sieh dir das ganze Video an, Bild UND Ton.',
  output: `- Übernimm nur, was im Video gezeigt, eingeblendet oder erklärt wird: Akkorde, Griffe, Anschläge, Riffs/Tabs und Spieltipps. Liedtext lässt du immer weg. Nichts erfinden.
- Was du nicht sicher erkennst, schreibst du als [?], statt zu raten.
- Akkorde und Griffe: achte auf die Griffhand, auf eingeblendete Griffbilder, Tabs und Untertitel sowie auf das, was gesagt wird. Weicht ein gezeigter Griff vom Standardgriff ab, schreibe ihn als „Griff …“ in den Kopf.
- Anschlag: höre und sieh auf die Schlaghand – Ab- und Aufschläge, Pausen, gedämpfte Schläge, Zupfmuster.
- Wichtige Tipps mit Zeitangabe (mm:ss) als Hinweis am Ende des passenden Abschnitts, z. B. „Tipp ab 03:12: Daumen über den Hals legen.“
- Zeigt das Video nur einen Teil des Songs, schreibe nur diesen Teil.
- Kannst du das Video nicht ansehen oder abspielen, antworte nur mit einem Satz, der das sagt – erfinde dann nichts.`,
  appears: 'im Video vorkommt (gesagt, gezeigt oder eingeblendet)',
  tabRead: '- Tabs nur für Riffs, Licks und Melodien, die im Video gezeigt oder Ton für Ton erklärt werden. Sind Bund oder Saite nicht eindeutig, beschreibe das Riff lieber als kurzen Hinweis, statt einen ungenauen Tab zu schreiben.',
  final: 'Bitte jetzt den Song aus dem Video in genau diesem Format ausgeben.',
};
const IMAGE_EN = {
  intro: 'You will get one or more images of a song (chord sheet, songbook page, handwritten notes, tabs or a screenshot).',
  it: 'them',
  output: `- Take over chords, shapes, strumming, tabs and notes exactly as they appear in the image. Always leave out lyrics. Don't invent anything, don't leave anything out, don't “improve” anything.
- Write anything illegible as [?] instead of guessing.
- Several images belong to ONE song, in the given order.`,
  appears: 'appears in the image',
  tabRead: '- When reading a tab, go column by column from left to right; find the string by counting the lines from the top; finally compare every note with the image.',
  final: 'Now please output the song from the image(s) in exactly this format.',
};
const VIDEO_EN = {
  intro: 'You will get a video of a song (YouTube link or video file) – usually a tutorial, a lesson, a playthrough or a performance. Watch the whole video, picture AND sound.',
  it: 'it',
  output: `- Take over only what is shown, displayed or explained in the video: chords, shapes, strumming, riffs/tabs and playing tips. Always leave out lyrics. Don't invent anything.
- Write anything you can't recognise for sure as [?] instead of guessing.
- Chords and shapes: watch the fretting hand, chord diagrams, tabs and subtitles shown on screen, and listen to what is said. If a shown shape differs from the standard shape, write it as “Shape …” in the header.
- Strumming: listen and watch the strumming hand – down- and upstrokes, rests, muted strokes, picking patterns.
- Important tips with a timestamp (mm:ss) as a note at the end of the matching section, e.g. “Tip from 03:12: thumb over the neck.”
- If the video only shows part of the song, write only that part.
- If you can't watch or play the video, answer only with one sentence saying so – don't invent anything then.`,
  appears: 'comes up in the video (said, shown or displayed)',
  tabRead: '- Tabs only for riffs, licks and melodies that are shown or explained note by note in the video. If fret or string are unclear, rather describe the riff as a short note than write an inaccurate tab.',
  final: 'Now please output the song from the video in exactly this format.',
};

function promptEn(I, V) {
  return `${V.intro} Turn ${V.it} into a text that my song app “Plekto” can read automatically. The app reads the text line by line with fixed rules – so stick exactly to the format below.

${I.intro} Write shapes, tabs and string references only for this instrument.
${I.other}

OUTPUT
- Output ONLY the song text in ONE code block (\`\`\`), with no explanations before or after. That way I can copy it with one click.
${V.output}

1. HEADER (at the very top, before the first section)
- Line 1: Title – Artist   (with a dash; without an artist just the title)
- Line 2: always exactly “${I.name}” (nothing else on this line).
- Then one line per detail, only if it ${V.appears}:
  Capo: 2
  Tempo: 96 BPM
  Time: 4/4
  Key: Am
  ${I.tuning}
- Shapes that differ from the standard shape or are drawn as chord diagrams:
${I.shape}
- General notes about the whole song: after an empty line, as a normal sentence.

2. SECTIONS
- Each section starts with its name in square brackets on its own line:
  [Intro] [Verse 1] [Verse 2] [Pre-Chorus] [Chorus] [Bridge] [Solo] [Riff] [Interlude] [Outro]
- Sections in the order they are played.
- One empty line between two sections.

3. CHORDS
a) Chord progression: all chords on ONE line, separated by just ONE space:
   Dm Am G G
   If the whole progression is repeated, add (x2):  Dm F C G (x2)
b) NEVER copy lyrics – the app only stores chord progressions and tabs. If chords stand above lyrics, read only the chords in playing order and write them as a progression as in a). If the progression repeats within the section, write it only once with (x2).
c) Each chord has its own playing style (typical for handwritten notes): one line per chord, “chord, two spaces, playing style, repeat”:
   Am  DDU UDU ×2
   F  DDX D
   Put these lines directly below each other, without an empty line – together they form one progression.
- Write chord names normally: C, Am, F#m, Bb, G7, Cmaj7, Dsus4, Cadd9, D/F#, E7 …

4. STRUMMING / PLAYING STYLE
- If one pattern applies to the whole section: directly below the section heading
  Strum: D - D U - U D U
- Symbols: D = downstroke, U = upstroke, - = rest, X = muted, > before a stroke = accent, P = pick, ${I.pick}.
- Write the pattern in every section where it applies (not just once in the header).

5. TABS
${I.tab}
- Bar lines | in the same places on every line, all lines exactly the same length.
- IMPORTANT for the rhythm: every time step has the same width, namely 3 characters. The note stands at the start of its field and is padded with - (“5--”, “8p-”, “12-”), an empty step is “---”. In 4/4 with eighths = 8 fields per bar (24 characters). Notes played at the same time stand exactly above each other.
- Technique directly after the fret: h = hammer-on, p = pull-off, / = slide up, \\ = slide down, b = bend, ~ = vibrato, x instead of a fret = dead note.
${I.pm}- If the tab is repeated: put only “x2” on the line directly below it.
${V.tabRead}

6. REPEATS – never copy the content again, instead:
- Section simply again (e.g. second chorus with the same chords): only the heading [Chorus] with an empty line after it. The app takes over chords and strumming.
- Section several times in a row:  [Chorus] x2
- Different name, same content: below the heading  Verse 2 like Verse 1
- Like the section before, but played differently:  like above, but picked: ${I.pickShort}

7. NOTES
- Short notes for a section (e.g. “play quietly”) as their own sentence AFTER an empty line at the end of the section.
- A note must not start with a chord name (e.g. not “A little louder …” but “Slightly louder …”).
- No explanations of what you did and no source references.

EXAMPLE for ${I.name} (shows all options – a real song usually needs only part of it):

\`\`\`
${I.example}
\`\`\`

${V.final}`;
}

// source: 'image' (Fotos, Screenshots, PDF) oder 'video' (YouTube-Link oder Videodatei)
export function externalPrompt(inst, source = 'image') {
  if (lang === 'en') return promptEn(inst === 'ukulele' ? UKULELE_EN : GUITAR_EN, source === 'video' ? VIDEO_EN : IMAGE_EN);
  const V = source === 'video' ? VIDEO : IMAGE;
  const I = inst === 'ukulele' ? UKULELE : GUITAR;
  return `${V.intro} Schreibe daraus einen Text, den meine Song-App „Plekto“ automatisch einlesen kann. Die App liest den Text Zeile für Zeile mit festen Regeln – halte dich deshalb genau an das Format unten.

${I.intro} Schreibe Griffe, Tabs und Saitenangaben nur für dieses Instrument.
${I.other}

AUSGABE
- Gib NUR den Song-Text in EINEM Codeblock aus (\`\`\`), ohne Erklärungen davor oder danach. So kann ich ihn mit einem Klick kopieren.
${V.output}

1. KOPF (ganz oben, vor dem ersten Abschnitt)
- Zeile 1: Titel – Künstler   (mit Gedankenstrich; ohne Künstler nur den Titel)
- Zeile 2: immer genau „${I.name}“ (nichts sonst in dieser Zeile).
- Danach je Angabe eine eigene Zeile, nur wenn sie ${V.appears}:
  Capo: 2
  Tempo: 96 BPM
  Takt: 4/4
  Tonart: Am
  ${I.tuning}
- Griffe, die vom Standardgriff abweichen oder als Griffbild gezeichnet sind:
${I.shape}
- Allgemeine Hinweise zum ganzen Song: nach einer Leerzeile als normaler Satz.

2. ABSCHNITTE
- Jeder Abschnitt beginnt mit seinem Namen in eckigen Klammern in einer eigenen Zeile:
  [Intro] [Verse 1] [Verse 2] [Pre-Chorus] [Chorus] [Bridge] [Solo] [Riff] [Interlude] [Outro]
- Abschnitte in der Reihenfolge, in der gespielt wird.
- Zwischen zwei Abschnitten eine Leerzeile.

3. AKKORDE
a) Akkordfolge: alle Akkorde in EINE Zeile, nur durch EIN Leerzeichen getrennt:
   Dm Am G G
   Wird die ganze Folge wiederholt, hängst du (x2) an:  Dm F C G (x2)
b) Liedtext NIE abschreiben – die App speichert nur Akkordfolgen und Tabs. Stehen Akkorde über einem Liedtext, liest du nur die Akkorde in Spielreihenfolge ab und schreibst sie wie unter a) als Folge. Wiederholt sich die Folge im Abschnitt, schreibe sie nur einmal mit (x2).
c) Jeder Akkord hat eine eigene Spielweise (typisch in handschriftlichen Notizen): je Akkord eine Zeile „Akkord, zwei Leerzeichen, Spielweise, Wiederholung“:
   Am  DDU UDU ×2
   F  DDX D
   Diese Zeilen direkt untereinander, ohne Leerzeile – sie bilden zusammen eine Folge.
- Akkordnamen normal schreiben: C, Am, F#m, Bb, G7, Cmaj7, Dsus4, Cadd9, D/F#, E7 …

4. ANSCHLAG / SPIELWEISE
- Gilt ein Muster für den ganzen Abschnitt: direkt unter der Abschnittsüberschrift
  Anschlag: D - D U - U D U
- Zeichen: D = Abschlag, U = Aufschlag, - = Pause, X = gedämpft (Mute), > vor einem Schlag = Akzent, P = Zupfen, ${I.pick}.
- Schreibe das Muster in jedem Abschnitt, in dem es gilt (nicht nur einmal oben im Kopf).

5. TABS
${I.tab}
- Taktstriche | an denselben Stellen in allen Zeilen, alle Zeilen exakt gleich lang.
- WICHTIG für den Rhythmus: Jeder Zeitschritt ist gleich breit, und zwar 3 Zeichen. Die Note steht am Anfang ihres Feldes und wird mit - aufgefüllt („5--“, „8p-“, „12-“), ein leerer Schritt ist „---“. Bei 4/4 mit Achteln = 8 Felder je Takt (24 Zeichen). Gleichzeitig gespielte Töne stehen genau übereinander.
- Technik direkt hinter dem Bund: h = Hammer-on, p = Pull-off, / = Slide hoch, \\ = Slide runter, b = Bend, ~ = Vibrato, x statt Bund = Dead Note.
${I.pm}- Wird der Tab wiederholt: in die Zeile direkt darunter nur „x2“.
${V.tabRead}

6. WIEDERHOLUNGEN – nie den Inhalt erneut abschreiben, sondern:
- Abschnitt einfach nochmal (z. B. zweiter Chorus mit gleichen Akkorden): nur die Überschrift [Chorus] mit Leerzeile danach. Die App übernimmt Akkorde und Anschlag.
- Abschnitt mehrmals hintereinander:  [Chorus] x2
- Anderer Name, gleicher Inhalt: unter der Überschrift  Verse 2 wie Verse 1
- Wie der Abschnitt davor, aber anders gespielt:  wie oben, aber gezupft: ${I === UKULELE ? 'P(4,3,2,1)' : 'P(5,3,2,1)'}

7. HINWEISE
- Kurze Hinweise zu einem Abschnitt (z. B. „leise spielen“) als eigener Satz NACH einer Leerzeile am Ende des Abschnitts.
- Ein Hinweis darf nicht mit einem Akkordnamen beginnen (statt „Am Schluss …“ lieber „Zum Schluss …“).
- Keine Erklärungen, was du gemacht hast, und keine Quellenangaben.

BEISPIEL für ${I.name} (zeigt alle Möglichkeiten – ein echter Song braucht meist nur einen Teil davon):

\`\`\`
${I.example}
\`\`\`

${V.final}`;
}
