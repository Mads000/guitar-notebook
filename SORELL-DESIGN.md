# Sorell – Design System (Version 2: Desktop + Handy)

Diese Datei ersetzt die alte SORELL-DESIGN.md. Sie beschreibt, wie **alle** Screens der App aussehen sollen, auf dem Handy und am Desktop (ab 1000px Breite), hell und dunkel.

## 0. Regeln für den Umbau (wichtig)

1. **Nur Aussehen und Layout ändern.** App-Logik, Funktionen, Datenmodell, IndexedDB, Service Worker, IDs, Event-Handler, Tastenkürzel und Texte bleiben, wie sie sind. Wenn für ein neues Layout HTML umgestellt werden muss, darf keine Funktion verloren gehen.
2. **Alle Bewegungen aus dem bisherigen Sorell-Design bleiben erhalten**, und zwar überall, auch in neuen Elementen:
   - gleitende Auswahl in Leisten und Segmenten
   - Drück-Federn und Hover
   - Sheet- und Menü-Animationen, Auf- und Zuklappen
   - Haptik
   - `prefers-reduced-motion`

   Nichts springt, alles federt wie bisher.
3. **Kein Glas.** Keine Durchsicht und kein `backdrop-filter` auf Knöpfen, Leisten, Karten oder Menüs. Keine Lichtkanten und kein Glanz-Verlauf. Alles ist deckend.
4. **Keine Nachbildung von Betriebssystemen.** Keine Ampel-Knöpfe, keine Mac- oder iOS-Menüleisten, keine Fake-Statusleisten, keine Systemschriften fremder Hersteller. Sorell sieht überall wie Sorell aus.
5. **Klassisches Design** (`data-design` ungleich `"sorell"`) bleibt unverändert.
6. **Alle Screens** bekommen diesen Look. Dazu gehören auch die, die hier nicht einzeln gezeichnet sind: Setlisten, Musiktheorie, Stimmgerät, Zuletzt gelöscht, Import/Export, Sync, KI, Einführung, Griff-Editor, Sortieren & Filtern, Backups. Dafür werden die Bausteine aus Abschnitt 4 und 5 benutzt.

## 1. Farben

```css
:root[data-design="sorell"] {
  --bg: #F2F2F7;          /* Seite */
  --side: #FAFAFC;        /* Seitenleiste, Inspektor (Desktop) */
  --surface: #FFFFFF;     /* Karten, Knöpfe, Leisten, Menüs */
  --surface-2: rgba(118,118,128,0.12); /* graue Chips, Segment-Grund, sekundäre Knöpfe */
  --surface-3: #F4F4F6;   /* Akkord-Chips, Felder in Karten */
  --panel: #F7F7F9;       /* Editor-Panel in Karten, Dialog-Grund */
  --line: rgba(0,0,0,0.12);  /* 0.5px Kontur um Knöpfe */
  --card-line: rgba(0,0,0,0.08);
  --divider: #EEEEEB;
  --text: #111112;
  --muted: #66666B;
  --head: #6E6E73;        /* kleine Überschriften */
  --faint: #A3A3A8;       /* nur Deko */
  --accent: #111112;      /* Hauptaktion, ausgewählter Song */
  --on-accent: #FFFFFF;
  --danger: #C62828;
  --saved: #16A34A;
  --chord-grid: #CFCFCA;
  --select: #EDEDF0;      /* aktive Pill in Leisten (deckend) */
  --key-bg: #E9E9EC; --key: #FFFFFF; --key-fn: #D9D9DE; --key-shadow: 0 1px 0 rgba(0,0,0,0.18);
  --overlay: rgba(17,17,18,0.24);   /* Desktop-Dialoge; Handy: 0.32 */

  /* Abschnittsfarben: Farbe / Kopfband-Ton (10 %) / Schrift im Band */
  --sec-intro: #3F6A9E;  --sec-intro-tint: rgba(63,106,158,0.10);  --sec-intro-ink: #2F5482;
  --sec-verse: #0F766E;  --sec-verse-tint: rgba(15,118,110,0.10);  --sec-verse-ink: #0B5E57;
  --sec-chorus: #B45309; --sec-chorus-tint: rgba(180,83,9,0.10);   --sec-chorus-ink: #8F4207;
  --sec-outro: #5B6478;  --sec-outro-tint: rgba(91,100,120,0.10);  --sec-outro-ink: #474F60;
  /* bestehende weitere Abschnittsarten (Pre-Chorus, Bridge, Solo …) nach demselben Muster */
}

:root[data-design="sorell"][data-theme="dark"] {   /* plus gleiche Werte in prefers-color-scheme: dark */
  --bg: #000000; --side: #161618; --surface: #202023; --surface-2: rgba(128,128,138,0.3);
  --surface-3: #2A2A2E; --panel: #1A1A1D; --line: rgba(255,255,255,0.1); --card-line: rgba(255,255,255,0.08);
  --divider: #333338; --text: #F4F4F5; --muted: #A1A1AA; --head: #8E8E93; --faint: #6B6B72;
  --accent: #F4F4F5; --on-accent: #111112; --danger: #FF6B6B; --saved: #22C55E;
  --chord-grid: #4A4A50; --select: #45454B;
  --key-bg: #1C1C1F; --key: #3A3A3F; --key-fn: #2A2A2E; --overlay: rgba(0,0,0,0.5);
  --sec-intro: #7BA4D9;  --sec-intro-tint: rgba(123,164,217,0.16); --sec-intro-ink: #A9C6EC;
  --sec-verse: #2DD4BF;  --sec-verse-tint: rgba(45,212,191,0.14);  --sec-verse-ink: #7EE8DA;
  --sec-chorus: #F59E0B; --sec-chorus-tint: rgba(245,158,11,0.16); --sec-chorus-ink: #FBC45E;
  --sec-outro: #A5B0C8;  --sec-outro-tint: rgba(165,176,200,0.16); --sec-outro-ink: #C9D0DF;
}
```

Die Akzentfarbe ist in den Einstellungen wählbar (Schwarz, Orange `#C2410C`, Blau `#1D4ED8`, Grün `#15803D`). Sie gilt nur für die Hauptaktion, den ausgewählten Song und die Schalter.

## 2. Schrift

| Einsatz | Desktop | Handy |
|---|---|---|
| Seitentitel in Toolbar | Inter Tight 800 · 17px · -0.02em | – |
| Großer Seitentitel | – | Inter Tight 800 · 34px · -0.03em |
| Songtitel | Inter Tight 800 · 32px · -0.03em | Inter Tight 800 · 32px |
| Dialog-Titel | Inter Tight 800 · 20px | Inter Tight 800 · 20px |
| Listen-Titel | Inter 600 · 14px | Inter 600 · 16px |
| Text, Knöpfe | Inter 400–600 · 13px | Inter 400–600 · 15–16px |
| Kleine Überschrift | Inter 600 · 11px · GROSS · 0.06em · `--head` | gleich |
| Abschnittsname | Inter 700 · 12px · GROSS · 0.1em | gleich |
| Akkord | JetBrains Mono 600 · 16px | 17px |
| Strumming, ×2, Zahlen, Kürzel | JetBrains Mono 500–600 · 11–14px | gleich |

## 3. Layout

**Handy:** Seitenrand 16px, oben 56px (unter der Statusleiste), Karten-Abstand 14px. Knöpfe oben: rund 44px. Schwebende Leisten unten: 16px Rand, 30px vom unteren Rand. Kein Logo auf dem Handy.

**Desktop (ab 1000px):**
- **Seitenleiste** links: 252px breit, 8px Abstand rundum, Radius 18, `--side`, 0.5px Kontur.
  - Oben das Sorell-Logo (26px schwarzes Quadrat, Radius 8) und „Sorell“ in Inter Tight 800 16px, rechts der Knopf zum Ausblenden.
  - Dann die Bereiche „Bibliothek“ (Alle Songs, Favoriten, Setlisten), „Ordner“ (mit Farbpunkt und Anzahl in Mono) und unten Musiktheorie und Einstellungen.
  - Zeilen: 32px hoch, Radius 16, Icon 16px, Text 13px. Der aktive Bereich ist nur grau hinterlegt (`--surface-2`) und fett.
- **Toolbar** pro Spalte: 60px hoch. Links Titel (17px) und Untertitel (11px `--head`), rechts Knopfgruppen.
- **Alle Songs:** entweder als Tabelle (Karte mit Spalten Stern · Titel · Künstler · Instrument · Capo · Bearbeitet, Kopfzeile 40px, Zeilen 46px, Radius 14) oder in Spalten: Songliste 300px, Trennlinie 1px, Song rechts. Umschalter als Segment in der Toolbar.
- **Song ansehen:** Inhalt 28px seitlich, Abschnitte zweispaltig per Grid (Zeilen von links nach rechts).
- **Bearbeiten:** Die Songliste verschwindet, rechts kommt ein **Inspektor**: 280px, 8px Abstand, Radius 18, `--side`. Darin stehen Song-Felder, Griffe (Raster mit 4 Spalten), Anhänge (Foto, Aufnahme) und Notizen. Kamera und Mikro schweben dann nicht mehr über dem Inhalt.
- Hover-Zustände nur mit `@media (hover: hover)`: Hintergrund 4 % dunkler.

## 4. Bausteine

| Baustein | Desktop | Handy |
|---|---|---|
| Knopf / Knopfgruppe | 36px hoch, Radius 18, `--surface` + `0 0 0 0.5px var(--line), 0 1px 2px rgba(0,0,0,.06)`, Icon 17px | 44px, Radius 22, Icon 18–20px |
| Hauptaktion (Fertig, Neuer Song, Übernehmen, Anlegen) | `--accent` gefüllt, `--on-accent`, Schatten `0 1px 3px rgba(0,0,0,.16)`, 36px | 44–50px |
| Gefährliche Aktion (Löschen) | `--danger` gefüllt bzw. rote Schrift im Menü | gleich |
| Sekundärer Knopf | `--surface-2` grau, ohne Kontur | gleich |
| Segment / Filter | Grund `--surface-2`, 34–36px, Radius halbe Höhe. Aktive Pill: `--surface` + `0 1px 4px rgba(0,0,0,.14)` | gleich |
| Abschnittsleiste unten | 44px, aktive Pill `--select` (deckend), Farbpunkt 7px | 52px, Pill 42px |
| Listenzeile | Spalte 54px, Radius 14. Ausgewählt: `--accent` gefüllt, Text `--on-accent` | 58px in weißer Karte, Trennlinie `--divider`, Chevron |
| Karte | Radius 20, `--surface`, `0 0 0 0.5px var(--card-line), 0 1px 2px rgba(0,0,0,.04)` | gleich |
| Info-Chip (Gitarre, Capo 2 …) | 24px, Radius 12, `--surface-2`, 12px/500 | gleich |
| Eingabefeld | 30–36px, Radius 9–10, 1px `#E4E4E0` | 44–46px, Radius 12 |
| Schalter | 42×26 (38×22 klein), an = `--accent` | gleich |
| Griffbild | 72×92 Ansicht, 40×58 Inspektor; Punkte `--text`, Raster `--chord-grid`, leere Saite = Kreis, gedämpft = × | 62×80 |

## 5. Song-Abschnitte (Kopfband)

Jeder Abschnitt ist eine Karte (Radius 20, `overflow: hidden`). Die Farbe sitzt **nur im Kopfband**:

```
┌───────────────────────────────┐
│ ▮▮▮▮ INTRO          4 Akkorde │  ← Kopfband: 40px, background var(--sec-x-tint)
├───────────────────────────────┤     Icon (4 Balken, 13px) + Name in var(--sec-x-ink)
│ [D DU U DU]                   │  ← Strumming-Chip: grau (--surface-2), Mono 13px, 0.1em
│ G   1 Takt                    │  ← Zeile 34px (Handy 36px), Trennlinie --divider
│ D   1 Takt                    │
│ C            [×2]             │  ← ×2 als grauer Mini-Chip direkt hinter der Taktangabe
│ Notiz in --muted 13px         │
└───────────────────────────────┘
```

- Kein farbiger Rand, keine farbige Strumming-Fläche, keine Nummer-Badge.
- Rechts im Band steht die Anzahl („4 Akkorde“, Mono 11px), beim Bearbeiten das „···“-Menü. Auf dem Handy zusätzlich der Chevron zum Auf- und Zuklappen (dreht mit Feder).
- Beim Bearbeiten ist der Name im Band direkt editierbar (Input, gleiche Schrift).
- Die Abschnittsleiste unten zeigt pro Abschnitt den Farbpunkt `--sec-x`.
- Der Akkordfolge-Editor ist ein Panel in der Karte: `--panel`, Radius 16, innere Kontur 1px `#ECECEF`. Die Einfügemarke ist ein 2px-Rahmen in `--accent` mit einem Strich darin, nicht gefüllt.

## 6. Tab-Editor

Er hat auf beiden Größen eine **Bildschirmtastatur**.

- **Tastaturfläche:** `--key-bg`, oben 1px Linie. Ziffern auf `--key` mit `--key-shadow`, Funktionen auf `--key-fn`. Radius 11 (Handy 10). Darüber eine Zeile mit Akkord-Tasten.
- **Desktop:**
  - Aufteilung: links Ziffernblock (3 Spalten, die 0 über die volle Breite), in der Mitte 6 Spalten Techniken (Symbol in Mono, Name 10px, **Tastenkürzel klein oben rechts**), darunter Kopieren, Einfügen, + Takt, Auswahl, Takt löschen und ···. Rechts Pfeile und Löschen, darunter ein großer schwarzer Knopf „Nächste Spalte · Tab“.
  - Die echte Tastatur funktioniert zusätzlich, wie bisher.
  - Der Editor ist ein Dialog: 1000px breit, Radius 26, `--panel`, Hintergrund abgedunkelt.
- **Handy:** Sheet von unten mit Radius 28 oben und Griff 40×5px. Aufbau wie bisher, ohne Kürzel.
- **Tab-Fläche:** weiße Karte. Die aktuelle Spalte ist hellgrau hinterlegt, der Cursor ist ein Rahmen in `--accent`. Die Ziffern unterbrechen die Saitenlinie (Hintergrund in Kartenfarbe).
- Hilfetexte nur beim ersten Öffnen, danach hinter dem „?“.

## 7. Pop-ups

Alle Pop-ups sind deckend (`--surface` bzw. `--panel`), haben keinen Weichzeichner und öffnen mit Feder (scale 0.96 → 1, opacity 0 → 1). Der Hintergrund wird abgedunkelt (`--overlay`). Esc oder Tippen daneben schließt sie.

- **Kontextmenü (Desktop, Rechtsklick):** 260px, Radius 16, Padding 6, Schatten `0 12px 32px rgba(0,0,0,.16)`. Einträge 32px, Radius 10, Kürzel rechts in Mono. Trenner 1px mit 8px Einzug. „Löschen“ steht unten in `--danger`.
- **Bestätigung:**
  - Desktop: 420px, Radius 26, Padding 24. Oben ein Icon im 44px-Quadrat (Radius 14, Farbe der Aktion mit 10 %). Titel 20px, Text 14px `--muted`. Knöpfe rechtsbündig: Abbrechen (grau, „Esc“) und Aktion (gefüllt, „↩“).
  - Handy: 36px Rand, alles zentriert, Knöpfe untereinander mit 50px Höhe.
- **Formular-Dialog (z. B. Neuer Song):** 480px, `--panel`, Kopf 60px mit Titel und rundem ×. Felder in einer weißen Gruppe (Zeilen 46px, Label 100px links). Unten Abbrechen und „Anlegen ⌘↩“.
- **Aktionsmenü (Handy, ersetzt das bisherige Action Sheet):**
  - Karte über die volle Breite mit 8px Rand, Radius 24, Griff oben.
  - Kopf mit Songtitel und Meta-Zeile.
  - Dann 4 Schnellaktionen als Kacheln (64px, `#F2F2F5`, Icon + Label 11px).
  - Danach Zeilen mit 50px (Icon 20px, Chevron bei Untermenüs), „Löschen“ in `--danger` ganz unten.
  - Darunter ein separater „Abbrechen“-Knopf mit 56px.
- **Kurzmeldung (Toast):** unten mittig, schwarz (`#111112`, im Dunkelmodus `#F4F4F5` mit dunkler Schrift). 44px Desktop, 48px Handy, Radius halbe Höhe. Grüner Haken, Text, optionaler Knopf („Rückgängig“, „Öffnen“). Verschwindet nach 4 s und gleitet mit Feder rein und raus.

## 8. Bewegung (bleibt wie im bisherigen Sorell)

- Kurven aus den bestehenden Variablen (`--spring`, `--spring-soft`), nichts neu erfinden.
- Drücken: scale 0.97 (Desktop) bzw. 0.96 (Handy) in 80 ms, Zurückfedern ca. 300 ms. Große Flächen 0.98.
- Gleitende Auswahl für Segmente, Filter, Abschnittsleiste und Darstellungs-Umschalter. Die Markierung wandert und ändert die Breite mit.
- Neue Chips einblenden, gelöschte erst ausblenden, dann entfernen.
- Nur `transform` und `opacity` animieren (außer der Breite des Auswahl-Indikators).
- `prefers-reduced-motion`: nur kurze Überblendungen.
