# Sorell – Design System

Anleitung für die KI: Bau die App mit diesem Design um. Ändere nur das Aussehen (HTML-Struktur wo nötig, CSS), **nicht** die Funktionen. Alle bestehenden Features, IDs, Event-Handler und gespeicherten Daten bleiben gleich.

## Grundidee

- Look kommt vom App-Logo: schwarzes, abgerundetes Quadrat mit weißen, abgerundeten Balken.
- Schlicht, viel Weißraum, Monochrom mit **einer** Akzentfarbe.
- Aktive Elemente sind invertiert: im Hellmodus schwarz mit weißer Schrift, im Dunkelmodus weiß mit schwarzer Schrift.
- Hell- und Dunkelmodus über `prefers-color-scheme`.

## Größen und Liquid Glass (ab Version 1.36, hat Vorrang vor den Maßen weiter unten)

- Größen, Abstände und Rundungen kommen aus dem klassischen Design. `styles/sorell.css` legt nur Farben, Schriften und Glas fest.
- Karten sind durchscheinend mit heller Oberkante, ohne Weichzeichner. Alles Schwebende (Kopfzeile, Leisten, Menüs, Dialoge) hat echten Weichzeichner.
- Der Seitenhintergrund hat einen sehr schwachen, kühl-warmen Schimmer (`--ambient`), damit das Glas sichtbar wird. Das ist die einzige erlaubte Verlaufsfläche.

## Glas, Bewegung und PC (ab Version 1.37, hat Vorrang vor den Maßen weiter unten)

**Glas**
- Echtes Glas nur, wo Inhalt dahinter durchläuft: Kopfzeile, `.glass-btn`, `.float-bar`, `.sec-jump`, Menüs, Sheets.
- Kleine Elemente im Inhalt (`.pill`, `.sv-pill`, `.meta-chip`, `.field` usw.) haben feste Flächen (`--surface-2` bzw. `--surface`).
- Gefüllte Knöpfe sind deckend `--accent` mit feinem Glanz oben (`inset 0 1px 0 rgba(255,255,255,.28)`) und kleinem Schatten.
- Glas-Elemente haben über `--glass-rim` eine helle Oberkante und eine dezent dunklere Unterkante.
- Die Einfügemarke `.pe-plus.on` ist nur ein 2px-Rahmen in `--accent`, nicht gefüllt.

**Bearbeiten**
- Foto, Aufnahme und „+ Abschnitt“ liegen in der schwebenden `.edit-bar`.
- Das Menü eines Blocks erscheint nur bei angetipptem Block, Fokus oder Hover und öffnet auch durch langes Drücken. Das Menü des Abschnitts bleibt immer sichtbar.
- Die Wiederholung (`×2`) steht direkt hinter dem letzten Akkord.
- Ohne Griffe ist die Akkordleiste nur ein kleiner „+ Griff“-Knopf.

**PC (ab 1000px)**
- Die Seitenleiste ist auch auf der Startseite da (Alle, Favoriten, Ordner, Setlisten), die Songliste rechts wird breit.
- Bei offener Seitenleiste entfällt der Zurück-Pfeil.
- Abschnitte laufen per CSS Grid zeilenweise in zwei Spalten. Bearbeiten und Ansehen haben dieselbe maximale Breite.

**Bewegung**
- Kurven nur über `--spring`, `--spring-soft` und `--spring-sheet`, nie `ease` oder `linear`.
- Auswahl in Leisten: `slideSel()` in `js/ui.js` lässt `.sel-indicator` zum aktiven Eintrag gleiten. Der aktive Knopf selbst ist durchsichtig, seine Schrift blendet mit.
- Drücken: `scale(.96)`, große Flächen `scale(.98)`, hinein in 80 ms, zurück mit Feder in 300 ms.
- Animiert werden nur `transform` und `opacity`. Ausnahmen: Breite des Auswahl-Indikators, Höhe beim Klappen (`grid-template-rows`), Schriftfarbe in Auswahl-Leisten.
- Löschen: erst ausblenden, dann entfernen, die Nachbarn gleiten nach (`removeAnimated()`).
- `prefers-reduced-motion`: keine Federn und Skalierungen, nur Überblendungen von 150 ms.

## Regeln

- **Keine** feste Navigationsleiste unten (keine Tab-Bar).
- **Keine** Tonart in der Songliste oder im Song-Kopf anzeigen.
- **Keine** Karten mit dickem farbigem Rand links. Abschnitte bekommen stattdessen eine Nummer-Badge oder ein kleines Balken-Icon in ihrer Farbe.
- Keine Verläufe als Flächenfarbe, keine Emojis als Icons. Icons sind Linien-SVGs (stroke 2px, runde Enden).
- Akkordnamen, Strumming-Muster und Tabs immer in der Monospace-Schrift.
- Klickflächen mindestens 44×44px.

## Farben (CSS-Variablen)

```css
:root {
  --bg: #F4F4F2;          /* Seitenhintergrund */
  --surface: #FFFFFF;     /* Karten */
  --surface-2: #EDEDEA;   /* sekundäre Buttons, Badges */
  --surface-3: #F4F4F2;   /* Felder innerhalb von Karten */
  --border: #E4E4E0;
  --divider: #EEEEEB;
  --text: #111112;
  --text-2: #3F3F46;
  --muted: #66666B;
  --faint: #A3A3A8;       /* nur Deko, z. B. Chevrons */
  --accent: #111112;      /* Alternativen: #C2410C, #1D4ED8, #15803D */
  --on-accent: #FFFFFF;
  --chord-grid: #CFCFCA;
  --verse: #0F766E;       /* Abschnittsfarben */
  --chorus: #B45309;
  --saved: #16A34A;
  --shadow: 0 8px 24px rgba(0,0,0,0.08);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0C0C0D;
    --surface: #151517;
    --surface-2: #232326;
    --surface-3: #1C1C1F;
    --border: #2C2C30;
    --divider: #222225;
    --text: #F4F4F5;
    --text-2: #D4D4D8;
    --muted: #A1A1AA;
    --faint: #5E5E66;
    --accent: #F4F4F5;
    --on-accent: #0C0C0D;
    --chord-grid: #4A4A50;
    --verse: #2DD4BF;
    --chorus: #F59E0B;
    --shadow: none;
  }
}
```

## Schriften

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@600;700;800&family=JetBrains+Mono:wght@500;600&display=swap">
```

| Einsatz | Schrift | Größe / Gewicht |
|---|---|---|
| Seitentitel („Meine Songs“) | Inter Tight | 40px / 800, letter-spacing -0.03em |
| Songtitel im Song | Inter Tight | 36px / 800 |
| Abschnittsname, Songname in Liste | Inter Tight | 17px / 700 |
| Fließtext, Buttons | Inter | 14–16px / 400–600 |
| Kleine Überschriften („AKKORDE“) | Inter | 12px / 600, Großbuchstaben, letter-spacing 0.08em, Farbe --muted |
| Akkorde, Strumming, Tabs, Zahlen | JetBrains Mono | 13–18px / 500–600 |

## Abstände und Rundungen

- Seitenrand: 16px (Header 20px)
- Abstand zwischen Karten: 14–18px
- Karten-Innenabstand: 14–18px
- Radius: Karten 24px, innere Panels 20px, Akkord-Chips 12px, Tastatur-Tasten 10px, Buttons/Pills komplett rund (Höhe / 2)

## Komponenten

**Runder Icon-Button:** 44×44px, `border-radius: 22px`, Hintergrund --surface, 1px --border.

**Primär-Button (z. B. Fertig, +):** Hintergrund --accent, Text --on-accent, rund, 40–52px hoch.

**Filter-Chips:** 36px hoch, rund. Aktiv = --accent / --on-accent. Inaktiv = --surface + 1px --border.

**Songliste:** Eine weiße Karte (--surface, Radius 22px) mit Zeilen. Jede Zeile: Titel (Inter Tight 17/700) und darunter Meta-Zeile „Künstler · Instrument · Capo“ (13px, --muted), rechts ein Chevron in --faint. Zeilen durch 1px --divider getrennt.

**Unten schwebend (Liste):** Filter-Button links, Suchfeld in der Mitte, runder +-Button rechts. Alles 52px hoch, mit --shadow. Darunter ein Ausblend-Verlauf von transparent zu --bg, damit die Liste weich verschwindet.

**Song-Kopf:** Zurück-Button links. Rechts Favorit, Bearbeiten (Stift), Mehr. Darunter der Titel und Pills für Instrument und Künstler.

**Akkord-Leiste:** Karte mit kleiner Überschrift „AKKORDE“ und Pin-Button. Darunter horizontal scrollende Griffbilder:
- 4 Saiten, 5 Bünde, Linien in --chord-grid
- Sattel als dicke Linie in --text
- Fingerpunkte als gefüllte Kreise in --accent
- Leere Saiten als kleiner Kreis-Umriss über dem Sattel
- Akkordname darüber in Mono 14/600
- Im Bearbeiten-Modus am Ende ein gestricheltes „+“-Feld

**Abschnitt (Song-Ansicht):** Karte mit Kopfzeile: Nummer-Badge (28×28, Radius 9; beim aktiven Teil --accent, sonst --surface-2), daneben der Name, rechts ein Chevron zum Einklappen. Darunter die Zeilen im Grid `96px 1fr`: Akkord (Mono 18/600) | Strumming (Mono 14, --muted, letter-spacing 0.12em). Zeilen durch --divider getrennt.

**Abschnitt (Bearbeiten, Verse/Chorus):** Kopfzeile mit Chevron, einem 3-Balken-Icon und dem Namen in Großbuchstaben (13/700, letter-spacing 0.12em), beides in der Abschnittsfarbe. Darunter die Akkorde als Chips (44px hoch, --surface-3, Radius 12). Am Ende ein gestrichelter +-Chip.

**Akkordfolge-Editor:** Inneres Panel in --surface-3 mit Radius 20px. Inhalt von oben nach unten:
1. Strumming-Eingabe (Mono)
2. Akkord-Chips, danach ein Cursor-Chip mit Rahmen in --accent
3. Eingabefeld „Akkord eingeben, z. B. Am“ mit ✓-Button (--accent) und Griffbild-Button
4. Vorschlags-Chips
5. Zeile mit „Folge“-Stepper (− ×1 +), Hilfe-Button „?“ und Fertig-Button

**Teile-Navigation (Song-Ansicht):** Schwebende Pill unten, 60px hoch, mit --shadow. Pfeil hoch, Teil-Buttons (aktiver Teil in --accent), Pfeil runter.

**Tab-Anzeige:** Saiten als dünne Linien. Die Zahlen bekommen einen Hintergrund in Kartenfarbe, damit die Linie dahinter unterbrochen wird. Die aktuelle Spalte ist hellgrau hinterlegt, der Cursor ist eine abgerundete Box mit 2px Rahmen in --accent. Strum-Pfeile und das ⊓-Abschlag-Zeichen sind in --text.

**Tab-Tastatur (Bottom Sheet):**
- Das Sheet hat oben Radius 28px und einen Griff (40×5px).
- Kopfzeile: Undo, Redo, grüner Gespeichert-Punkt, Tab-Name, Fertig.
- Tastaturfläche: im Hellmodus #E6E6E2.
- Zahlentasten: weiß mit 1px Schatten nach unten.
- Funktionstasten: #D6D6D1.
- „+ Takt“ ist in --accent hervorgehoben.
- Raster: links Zahlen 3 Spalten (die 0 geht über alle 3), rechts Funktionen.
