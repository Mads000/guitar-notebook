// Prompt für eine andere KI (ChatGPT, Gemini, Claude …) ohne eigenen Schlüssel: Foto dort hochladen, diesen Prompt
// dazu, die Antwort unter „Text & Datei“ einfügen. Je ein Prompt für Gitarre und für Ukulele, damit die KI nur
// Griffe, Tabs und Saiten des gewählten Instruments schreibt.
// Beschreibt genau das Textformat, das parseText() in importer.js liest. Ändert sich dort etwas, hier anpassen
// und die Beispiele erneut durch parseText() prüfen.

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

export function externalPrompt(inst) {
  const I = inst === 'ukulele' ? UKULELE : GUITAR;
  return `Du bekommst ein oder mehrere Bilder von einem Song (Akkordblatt, Songbook-Seite, handschriftliche Notizen, Tabs oder Screenshot). Schreibe daraus einen Text, den meine Song-App „Sorell“ automatisch einlesen kann. Die App liest den Text Zeile für Zeile mit festen Regeln – halte dich deshalb genau an das Format unten.

${I.intro} Schreibe Griffe, Tabs und Saitenangaben nur für dieses Instrument.
${I.other}

AUSGABE
- Gib NUR den Song-Text in EINEM Codeblock aus (\`\`\`), ohne Erklärungen davor oder danach. So kann ich ihn mit einem Klick kopieren.
- Übernimm Akkorde, Griffe, Anschläge, Tabs und Hinweise genau so, wie sie auf dem Bild stehen. Liedtext lässt du immer weg. Nichts erfinden, nichts weglassen, nichts „verbessern“.
- Unleserliches schreibst du als [?], statt zu raten.
- Mehrere Bilder gehören zu EINEM Song, in der gegebenen Reihenfolge.

1. KOPF (ganz oben, vor dem ersten Abschnitt)
- Zeile 1: Titel – Künstler   (mit Gedankenstrich; ohne Künstler nur den Titel)
- Zeile 2: immer genau „${I.name}“ (nichts sonst in dieser Zeile).
- Danach je Angabe eine eigene Zeile, nur wenn sie auf dem Bild steht:
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
- Tab beim Ablesen Spalte für Spalte von links nach rechts lesen; die Saite durch Abzählen der Linien von oben bestimmen; zum Schluss jede Note mit dem Bild vergleichen.

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

Bitte jetzt den Song aus dem Bild bzw. den Bildern in genau diesem Format ausgeben.`;
}
