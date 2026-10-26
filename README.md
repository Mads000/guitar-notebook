# Sorell (früher Guitar Notebook)

Ein persönliches Notizbuch für Gitarre und Ukulele als Progressive Web App (PWA). Die App läuft vollständig lokal auf dem iPhone: kein Server im Betrieb, keine Konten, keine Cloud. Alle Bibliotheken liegen im Projekt. Einzige Ausnahme ist der optionale KI-Assistent: Nur wenn du ihn mit einem eigenen Google-Gemini-Schlüssel einschaltest und ausdrücklich benutzt, wird der abgeschickte Text an Google gesendet.

---

## Funktionen

**Songs**
- Neuer Song mit nur einem Schritt: Titel eingeben, danach öffnet sich sofort der Editor. Alle weiteren Angaben sind optional.
- Öffnen, bearbeiten, umbenennen, duplizieren (inklusive Tabs), löschen, als Favorit markieren.
- Suche über Titel, Künstler, Notizen, Abschnittsnamen und Akkorde.
- Sortierung nach „Zuletzt bearbeitet“, Titel, Künstler oder Erstellungsdatum. Die Auswahl wird gespeichert.
- Startseite mit „Zuletzt bearbeitet“, „Favoriten“ und „Alle Songs“.
- Optionale Angaben: Künstler, Stimmung (Vorlagen oder eigene), Capo, BPM, Taktart, Notizen. Erstellungs- und Änderungsdatum werden automatisch gepflegt.

**Songeditor**
- Frei anlegbare Abschnitte (Intro, Verse, Chorus … oder eigene Namen). Abschnitte lassen sich hinzufügen, umbenennen, duplizieren, verschieben und löschen; die Reihenfolge lässt sich auch in einer eigenen Ansicht ändern.
- Jeder Abschnitt enthält beliebig viele Blöcke in freier Reihenfolge: **Akkorde**, **Anschlag**, **Tab**, **Notiz**.
- Blöcke kopieren, duplizieren, verschieben (auch in den Nachbarabschnitt) und löschen.
- Eine app-weite Zwischenablage erlaubt das Einfügen in jeden Abschnitt und in jeden Song.
- Oben im Song stehen die Diagramme aller verwendeten Akkorde. Antippen öffnet den Diagramm-Editor.

**Akkordfolgen**
- Eingabe per Text, auch mehrere Akkorde auf einmal („G D Em C“), per Vorschlag oder aus der Bibliothek.
- Akkorde verschieben, duplizieren und entfernen; die Folge als Ganzes kann wiederholt werden (×2 …).
- Optionale Dauer je Akkord in Schlägen oder Takten.
- Beliebige Akkordnamen sind erlaubt, auch ohne Diagramm (z. B. „C/G“, „H7“).

**Akkorddiagramme**
- Eigener interaktiver Editor: auf einen Bund tippen setzt einen Finger, erneutes Tippen entfernt ihn. Leere und gedämpfte Saiten werden oberhalb des Griffbretts umgeschaltet.
- Fingerzahlen (1–4, Daumen) lassen sich ein- und ausblenden; die Lage verschiebt den ganzen Griff.
- Barrés werden automatisch erkannt (gleicher Finger, gleicher Bund).
- Bibliothek mit 40 gängigen Akkorden. Daraus lassen sich eigene Varianten erstellen, kopieren und löschen.
- Gespeichert werden echte Daten (Bund und Finger je Saite), kein Bild. Eigene Akkorde stehen allen Songs zur Verfügung.

**Anschlagmuster**
- Abschlag, Aufschlag, Pause, Dämpfer, Akzente und Wiederholungen.
- Zählzeiten im Raster Achtel oder Sechzehntel.
- Große Tasten für die Bedienung mit einer Hand.
- Schläge verschieben und löschen; Muster benennen, als Vorlage sichern und wieder laden. Neun Vorlagen sind eingebaut.

**Tab-Editor**
- Echte Notenpositionen auf sechs Saiten mit erweiterbaren Takten.
- Eigene Tastenleiste: Die iPhone-Tastatur erscheint nicht und verdeckt den Tab nicht.
- Zweistellige Bünde durch zügiges Tippen (1, 2 → 12).
- Techniken: Hammer-on (h), Pull-off (p), Slide auf/ab (/ \), Bend (½, voll, 1½, 2), Vibrato (~), Palm Mute (P.M.) und Dead Notes (x). Sie werden strukturiert gespeichert.
- Auswahlmodus für mehrere Noten: kopieren, ausschneiden, einfügen, löschen, verschieben (Spalte oder Saite) und um ±1 Bund transponieren.
- Takte einfügen, duplizieren, löschen und in der Länge ändern; Spalten einfügen und löschen.
- Undo/Redo mit bis zu 200 Schritten; Tabs benennen.
- Nur der Tab-Bereich scrollt horizontal; die Saitennamen bleiben dabei stehen.
- Am PC funktioniert auch die Tastatur: Ziffern, Pfeiltasten, Rücktaste sowie Strg+Z/Y/C/V.

**Zwei Ansichten: Bearbeiten und Ansehen**
- Oben in der Mitte jedes Songs schaltest du zwischen ✎ **Bearbeiten** und 👁 **Ansehen** um. Die App merkt sich die zuletzt gewählte Ansicht.
- **Ansehen** ist eine kompakte, schreibgeschützte Leseansicht zum Spielen. Liedtext mit Akkorden erscheint wie im Songbook mit den Akkorden über den Silben.
- In der Leseansicht kannst du die Schrift vergrößern oder verkleinern (A− / A+). „Display an“ verhindert, dass der Bildschirm beim Spielen ausgeht (iPhone ab iOS 16.4).

**Aus Text erstellen (Text-Import, 100 % offline)**
- Über das Zauberstab-Symbol unten links auf der Startseite fügst du rohe Notizen, ein kopiertes Akkordblatt, ChordPro-Text oder ASCII-Tabs ein. Eine Textdatei geht ebenfalls.
- Ein lokaler Parser erkennt:
  - Abschnitte (`[Verse 1]`, `Chorus:`, `Strophe 2`, `Refrain`, `{soc}`)
  - Akkordzeilen über dem Liedtext (sie werden zu `[G]Liedtext`) und Inline-Akkorde
  - Wiederholungen (`x2`, `(2x)`) und Taktstriche (`| G | D |`)
  - Anschlagmuster (`D DU UDU`)
  - ASCII-Tabs mit h, p, /, \, b, ~, x und P.M.
  - Titel und Künstler („Song by Artist“, „Titel – Künstler“), Capo, Stimmung, Tempo und Taktart
- Eine Live-Vorschau zeigt das Ergebnis, bevor der Song angelegt wird. Über „⋯ → Text importieren …“ lässt sich Text auch an einen vorhandenen Song anhängen.

**Fotos und Audioaufnahmen**
- Unten im Song unter „Fotos & Aufnahmen“: Foto aufnehmen oder aus der Mediathek wählen, etwa handschriftliche Zettel oder Notenblätter. Fotos werden auf höchstens 2048 px verkleinert und mit Vorschaubild gespeichert.
- Antippen öffnet die Vollbildansicht mit Zoom (Doppeltippen oder Lupe), Blättern (Wischen), Teilen und Löschen.
- Der Audio-Recorder nimmt über das iPhone-Mikrofon auf (MediaRecorder). Er bietet Aufnehmen, Stoppen, Anhören, Benennen, Sichern und Verwerfen. In der Liste lassen sich Aufnahmen abspielen, umbenennen, teilen und löschen. Rauschunterdrückung ist abgeschaltet, damit die Gitarre natürlich klingt.
- Alles liegt lokal in IndexedDB beim jeweiligen Song und wird beim Duplizieren mitkopiert und beim Löschen mitgelöscht.

**Gitarre und Ukulele**
- Beim Anlegen eines Songs wählst du **Gitarre** oder **Ukulele**. Unter „Details“ lässt sich das Instrument jederzeit umstellen. Die App merkt sich das Instrument pro Song und für den nächsten neuen Song.
- Ukulele-Songs nutzen Diagramme mit 4 Saiten (Standardstimmung G C E A) und eine eigene Bibliothek mit 37 gängigen Ukulele-Akkorden (C, G, Am, F, Dm, Em, D, A, G7, C7, E7 …). Die Stimmungsliste bietet Standard, D-Stimmung, Bariton und Halbton tiefer.
- Der Tab-Editor zeigt bei Ukulele-Songs 4 Saiten (A, E, C, G von oben). Bundeingabe, Techniken, Takte, Auswahl, Kopieren und Scrollen funktionieren wie bei der Gitarre.
- Eigene Akkorde gehören zu einem Instrument; Ukulele-Griffe erscheinen nie bei Gitarren-Songs und umgekehrt. Die Akkordbibliothek in den Einstellungen hat einen Umschalter Gitarre/Ukulele.
- Anschlagmuster gelten für beide Instrumente.
- PDF, Leseansicht und Text-Import erkennen das Instrument: Diagramme und Tabs erscheinen mit 4 oder 6 Saiten. Ein Songbook darf beide Instrumente mischen.
- Wechselst du bei einem vorhandenen Song das Instrument, passen sich Diagramme und neue Tabs an. Bereits angelegte Tabs behalten ihre Saitenzahl, damit keine Noten verloren gehen.

**Transponieren und Vereinfachen**
- „⋯ → Transponieren & Vereinfachen …“ im Song verschiebt alle Akkorde um beliebige Halbtöne, wahlweise mit ♯, ♭ oder automatisch passenden Vorzeichen. Das gilt für Akkordfolgen und für Akkorde im Liedtext ([G]).
- „Vereinfachen“ macht aus Cmaj7, Am7, Dsus4 oder G/B einfache Grundakkorde (C, Am, D, G).
- Vor dem Übernehmen zeigt die App eine Vorschau. Danach lässt sich die letzte Änderung rückgängig machen. Beides funktioniert ohne Internet.

**KI-Assistent (optional, Google Gemini)**
- In den Einstellungen unter „KI-Assistent“ trägst du einen eigenen, kostenlosen Gemini-Schlüssel ein (Anleitung unten). Ohne Schlüssel bleibt der Assistent aus, und die App arbeitet wie bisher vollständig offline.
- **KI-Idee:** Im Fenster „Aus Text erstellen“ (Zauberstab) oder im Song unter „⋯ → KI-Assistent …“ beschreibst du, was du brauchst, z. B. „Melancholisches Arpeggio in Am für Ukulele“. Wähle Automatisch, Akkordfolge, Anschlag, Tab oder Ganzer Song. Das Ergebnis erscheint als Vorschau mit Tabs und Anschlagmustern und wird erst nach „Erstellen“ bzw. „Hinzufügen“ gespeichert.
- **Mit KI analysieren:** Unordentliche Notizen oder Tutorials einfügen und „Mit KI analysieren“ antippen. Die KI ordnet alles in Abschnitte mit Akkorden, Liedtext, Tabs und Hinweisen. Ändert man danach den Text, zeigt die Vorschau wieder die lokale Erkennung.
- **Foto & Video:** Im Fenster „Song erstellen“ (Zauberstab) im Reiter „Foto & Video“ oder im Song unter „⋯ → Aus Foto oder Video (KI) …“ wählst du Fotos (Kamera oder Mediathek, bis zu 10) und/oder gibst einen YouTube-Link ein. Ein optionaler Hinweis wie „nur das Intro-Riff“ hilft der KI. Gut geeignet sind Akkordblätter, handschriftliche Notizen, Tab-Screenshots und Tutorials. Neue Fotos werden auf Wunsch im Song gespeichert, der Video-Link steht als Quelle in den Notizen.
- Bereits gespeicherte Fotos lassen sich direkt auswerten: unter „Fotos & Aufnahmen“ mit „Fotos mit KI auswerten“ oder in der Vollbildansicht über das Zauberstab-Symbol.
- **Alternativen vorschlagen:** Unter „Transponieren & Vereinfachen“ schlägt die KI Akkord-Varianten vor, etwa vereinfacht für Anfänger oder voller klingend. Jeder Vorschlag lässt sich mit einem Tipp anwenden. Gesendet wird dabei nur die Akkordliste.
- Ohne Internet oder ohne Schlüssel sind die KI-Knöpfe gesperrt und die App zeigt einen Hinweis. Die lokale Erkennung, das Transponieren und das Vereinfachen funktionieren immer.

**Speichern, Backup, PDF**
- Jede Änderung wird automatisch gespeichert. Die Anzeige oben zeigt „Speichert …“ und, falls etwas schiefgeht, deutlich „Nicht gespeichert“.
- Absturzschutz: Jede Änderung landet sofort zusätzlich in einem kleinen Journal und wird beim nächsten Start wiederhergestellt, falls iOS die App vorher beendet hat.
- Backup als JSON exportieren, wahlweise mit Fotos und Aufnahmen; JSON importieren mit Prüfung, verständlichen Fehlermeldungen und der Wahl zwischen „Zusammenführen“ und „Alles ersetzen“. Bevor Daten überschrieben werden, fragt die App nach.
- Vor jedem Import und jeder Datenmigration legt die App automatisch eine interne Sicherung an (die letzten 5). Sie lässt sich wiederherstellen oder als Datei exportieren.
- PDF-Export für einzelne Songs und als Songbook mit Inhaltsverzeichnis; jeder Song beginnt auf einer neuen Seite. Format A4, mit Akkorddiagrammen, Akkordfolgen, Anschlägen, Tabs und Notizen. Seitenumbrüche werden pro Zeile, Tab-System und Diagrammreihe gesetzt.
- Helles und dunkles Design, automatisch oder fest wählbar.
- Vier Beispiel-Songs (davon einer für Ukulele), deutlich als „Beispiel“ markiert und mit einem Tipp entfernbar.

---

## Projektstruktur

```
guitar-notebook/
  index.html            Einstieg, Meta-Tags für iOS
  manifest.json         Web-App-Manifest (Name, Icons, Vollbild)
  sw.js                 Service Worker: speichert NUR den App-Code für den Offline-Betrieb
  serve.py              Lokaler Testserver für den PC (wird auf dem iPhone nicht benötigt)
  styles/
    main.css            Design-Tokens (Farben, Abstände, Schriften), Listen, Sheets, Dialoge
    editor.css          Songeditor, Akkorde, Akkordfolgen, Anschlagmuster
    tabs.css            Tab-Darstellung und Tab-Tastenleiste
    view.css            Leseansicht, Fotos und Aufnahmen, Recorder, Text-Import, KI-Assistent, Transponieren
  js/
    app.js              Start, Navigation, Startseite, Einstellungen, Updates
    ui.js               Bausteine: DOM-Helfer, Icons, Sheets, Dialoge, Steuerelemente
    storage.js          IndexedDB, Autosave, Absturz-Journal, Migrationen, interne Sicherungen
    songs.js            Song-Datenmodell und -Verwaltung
    editor.js           Songeditor (Abschnitte und Blöcke, Umschalter Bearbeiten/Ansehen)
    songview.js         Kompakte Leseansicht (Akkorde über dem Liedtext)
    importer.js         Text-Import: lokaler Parser für Notizen, Akkordblätter, ChordPro, ASCII-Tabs
    media.js            Fotos, Vollbildansicht, Audio-Recorder und Wiedergabe
    ai.js               Optionaler KI-Assistent: Anfragen an Google Gemini, Schemas und Prompts
    transpose.js        Transponieren, Vereinfachen, KI-Vorschläge zur Reharmonisierung
    chords.js           Akkordbibliotheken (Gitarre, Ukulele), SVG-Diagramme, Diagramm-Editor
    progression.js      Akkordfolgen
    strumming.js        Anschlagmuster
    tabs.js             Tab-Datenmodell und SVG-Darstellung
    tabeditor.js        Tab-Editor mit eigener Tastenleiste
    pdf.js              PDF-Export (Song und Songbook)
    backup.js           JSON-Export/-Import und Validierung
    samples.js          Beispieldaten
  assets/icons/         App-Icons (PNG) und die SVG-Vorlage
  vendor/
    jspdf.umd.min.js    jsPDF 2.5.2 (lokal, MIT-Lizenz, siehe jspdf.LICENSE.txt)
  README.md
  UPDATE.md             Updates ohne Datenverlust
```

**Datenhaltung (IndexedDB „guitar-notebook“)**

| Store | Inhalt |
|---|---|
| `songs` | Songs mit Abschnitten und Blöcken; `instrument`: `guitar` oder `ukulele` (fehlt = Gitarre) |
| `tabs` | Tabulaturen (je Tab ein Datensatz, mit Verweis auf den Song; 6 oder 4 Saiten) |
| `chords` | eigene Akkorde (6 Bundwerte = Gitarre, 4 = Ukulele) |
| `patterns` | eigene Anschlagmuster |
| `media` | Fotos und Audioaufnahmen (Binärdaten, mit Verweis auf den Song) |
| `settings` | Einstellungen (Design, Sortierung, Ansicht, Schriftgröße, zuletzt gewähltes Instrument, KI-Schlüssel und -Modell, Datenformat-Version). Der KI-Schlüssel wird nie in ein Backup exportiert. |
| `backups` | automatische interne Sicherungen |

---

## Auf dem PC testen

Voraussetzung: Python 3 (ist auf deinem PC installiert).

1. In VS Code ein Terminal im Projektordner öffnen.
2. `python serve.py` ausführen.
3. In Chrome oder Edge **http://localhost:8000** öffnen.
4. Für die iPhone-Ansicht F12 drücken, die Geräte-Symbolleiste aktivieren (Strg+Umschalt+M) und z. B. „iPhone SE“ oder „iPhone 14 Pro Max“ wählen.
5. Offline testen: In den Entwicklertools unter **Application → Service Workers** prüfen, ob `sw.js` „activated“ ist. Dann im Tab **Network** „Offline“ wählen und neu laden. Die App muss weiter funktionieren.
6. Daten ansehen: **Application → IndexedDB → guitar-notebook**.
7. Von vorn beginnen: **Application → Storage → Clear site data**. Achtung: Das löscht die Testdaten im Browser.

Hinweise:
- Auf `localhost` funktioniert der Service Worker auch ohne HTTPS. Auf jeder anderen Adresse ist HTTPS nötig (siehe unten).
- Wenn du während der Entwicklung Code änderst, lädt der Service Worker den alten Stand aus dem Cache. Entweder in den Entwicklertools unter **Application → Service Workers** „Update on reload“ aktivieren, oder `VERSION` in `sw.js` erhöhen und den Update-Hinweis in der App bestätigen.

---

## Erstinstallation auf dem iPhone

### Warum nicht einfach ein Server im Heim-WLAN?

Safari aktiviert den Offline-Modus (Service Worker) nur für Seiten, die per **HTTPS** geladen werden; die einzige Ausnahme ist `localhost`. Eine Adresse wie `http://192.168.1.20:8000` aus dem Heim-WLAN ist kein HTTPS. Dort lässt sich die App zwar ansehen, sie wird aber **nicht offline gespeichert**. Ein eigenes HTTPS-Zertifikat im Heimnetz wäre möglich, müsste aber auf dem iPhone als vertrauenswürdig installiert werden. Das ist deutlich aufwendiger.

**Empfohlen: GitHub Pages (kostenlos, HTTPS).** Die Seite wird nur für die Installation und spätere Updates gebraucht; im Alltag läuft die App ohne sie.

### Schritt 1: Dateien auf GitHub Pages bereitstellen (einmalig, etwa 10 Minuten)

1. Auf https://github.com ein kostenloses Konto anlegen.
2. Oben rechts **+ → New repository** wählen, als Namen z. B. `guitar-notebook` eintragen, **Public** auswählen und **Create repository** klicken.
3. Auf der Repository-Seite **„uploading an existing file“** (oder **Add file → Upload files**) wählen.
4. Den **Inhalt** des Projektordners (`index.html`, `manifest.json`, `sw.js` sowie die Ordner `styles`, `js`, `assets` und `vendor`) per Drag & Drop in das Browserfenster ziehen. `README.md`, `UPDATE.md` und `serve.py` dürfen mit hochgeladen werden, werden aber nicht gebraucht.
5. Unten **Commit changes** klicken.
6. Im Repository **Settings → Pages** öffnen. Unter „Build and deployment“ als Source **Deploy from a branch**, als Branch **main** und als Ordner **/ (root)** wählen und **Save** klicken.
7. Nach 1–2 Minuten erscheint dort die Adresse, z. B. `https://DEINNAME.github.io/guitar-notebook/`. Am PC kurz öffnen und prüfen, ob die App lädt.

Hinweis: In einem öffentlichen Repository ist nur der **App-Code** sichtbar. Deine Songs liegen nie dort, sondern ausschließlich auf deinem iPhone.

### Schritt 2: Auf dem iPhone installieren

1. Auf dem iPhone **Safari** öffnen (nicht Chrome oder eine andere App) und die Adresse aus Schritt 1 aufrufen.
2. Warten, bis „Meine Songs“ erscheint, dann etwa 5 Sekunden warten, damit der App-Code im Hintergrund gespeichert wird.
3. Auf das **Teilen-Symbol** tippen (Quadrat mit Pfeil nach oben) und **„Zum Home-Bildschirm“** wählen. Den Namen kannst du anpassen (Vorschlag: „Gitarre“), dann **Hinzufügen** tippen.
4. Die App **über das neue Icon** öffnen. Sie läuft im Vollbild wie eine normale App.
5. Prüfen: **Einstellungen (Regler-Symbol oben rechts) → „Offline verfügbar: Ja“**. Falls dort „Noch nicht“ steht, die App einmal schließen und mit Internet erneut öffnen.
6. Offline testen: Flugmodus einschalten, die App vollständig schließen (vom unteren Rand nach oben wischen und die App wegschieben), wieder öffnen. Alles muss funktionieren.

**Wichtig:** Arbeite immer in der App vom Home-Bildschirm, nicht im Safari-Tab. iOS gibt der Home-Bildschirm-App einen **eigenen Speicher**; Songs aus dem Safari-Tab tauchen dort nicht auf und umgekehrt.

Alternative zu GitHub Pages: Jeder kostenlose statische HTTPS-Hoster funktioniert ebenso, z. B. Netlify Drop (Ordner per Drag & Drop hochladen). Wichtig ist nur, dass du für spätere Updates **dieselbe Adresse** wieder verwendest (siehe UPDATE.md).

---

## Backups

- **Erstellen:** Download-Symbol unten links auf der Startseite oder Einstellungen → **Backup als Datei sichern** → **„Teilen / In Dateien sichern“** → z. B. iCloud Drive, „Auf meinem iPhone“ oder AirDrop an den PC. Erst wenn die Datei wirklich geteilt/geladen wurde, zählt sie als „Letzte Backup-Datei“.
- **Interne Sicherungen** legt die App automatisch an (täglich sowie vor Importen, Wiederherstellungen und KI-Änderungen, die letzten 10). Sie liegen im selben Gerätespeicher und schützen **nicht**, wenn iOS die App-Daten löscht – dafür braucht es die Datei.
- **Importieren / Wiederherstellen:** Einstellungen → **Backup oder Song-Datei importieren …**. Es wird **immer zusammengeführt**: Nichts wird gelöscht, eine Vorschau zeigt neue Songs, vorhandene, Konflikte, mögliche Duplikate, neue Ordner und ungültige Einträge. Konflikte behalten standardmäßig die lokale Version. **Alles ersetzen** gibt es nur als Sonderaktion mit doppelter Bestätigung.
- **PC & andere Geräte:** Einzelne Songs (Song-Menü → „Als Datei exportieren“), Ordner oder alle Songs als JSON exportieren, am PC bearbeiten und wieder importieren. Format und Regeln: [DATENFORMAT.md](DATENFORMAT.md).
- **Apple Notizen:** Notiz öffnen → Text kopieren → **Aus Text erstellen** (Zauberstab unten links) → einfügen. Die App erkennt Titel, Abschnitte, Akkorde, Anschlag und Tabs und zeigt eine Vorschau; gespeichert wird ein **neuer** Song erst nach Bestätigung. Eine direkte Verbindung zu Apple Notizen oder ein Eintrag im iOS-Teilen-Menü ist für Home-Bildschirm-Web-Apps technisch nicht möglich (iOS unterstützt kein „Share Target“ für Web-Apps; Kurzbefehle würden Safari statt der App öffnen, die einen getrennten Speicher hat).
- **Geräte synchronisieren (per Code):** Einstellungen → Import und Export → **Mit anderem Gerät synchronisieren**. Auf einem Gerät „Bereitstellen“, auf dem anderen den 6-stelligen Code eingeben und am ersten Gerät bestätigen. Beide tauschen ihre Daten aus und führen mit Vorschau zusammen (nichts doppelt, nichts gelöscht). Beide Geräte brauchen Internet und die geöffnete App, am besten im selben WLAN. Die Songs gehen verschlüsselt direkt von Gerät zu Gerät (WebRTC); nur der Verbindungsaufbau läuft über den kostenlosen Vermittlungsdienst PeerJS (0.peerjs.com), der keine Songs sieht oder speichert. Klappt die Direktverbindung zwischen verschiedenen Netzen nicht, bleibt der Weg über eine Backup-Datei.
- Tests der Import-Logik: `node tests/merge.test.mjs`

---

## Bedienung auf einen Blick

| Aufgabe | So geht's |
|---|---|
| Neuer Song | Stift-Symbol unten rechts → Titel → Gitarre/Ukulele → Erstellen |
| Instrument ändern | Chips unter dem Künstlernamen antippen → „Instrument“ |
| Transponieren | „⋯“ oben rechts im Song → „Transponieren & Vereinfachen …“ |
| KI-Idee | Zauberstab auf der Startseite → „KI-Idee“ oder im Song „⋯ → KI-Assistent …“ |
| Song aus Foto oder YouTube-Video | Zauberstab → „Foto & Video“ oder im Song „⋯ → Aus Foto oder Video (KI) …“ |
| Abschnitt hinzufügen | Am Ende des Songs auf Intro/Verse/Chorus … tippen |
| Akkorde, Anschlag, Tab, Notiz | Unter einem Abschnitt auf „+ Akkorde“ usw. tippen |
| Block bearbeiten | Block antippen (Notizen direkt hineinschreiben) |
| Block kopieren, verschieben, löschen | „⋯“ rechts neben dem Block |
| Abschnitt umbenennen, verschieben | Abschnittsnamen antippen oder „⋯“ in der Abschnittszeile |
| Capo, Stimmung, Tempo, Taktart | Die grauen Chips unter dem Künstlernamen antippen |
| Lesen / Spielen | 👁 oben in der Mitte des Songs |
| Song aus Text | Zauberstab unten links auf der Startseite |
| Foto / Aufnahme | Unten im Song „+ Foto“ / „+ Aufnahme“ oder „⋯“ |
| PDF | Teilen-Symbol oben im Song; Songbook über Einstellungen → „Songbook als PDF …“ |
| Tab: zweistelliger Bund | Ziffern zügig nacheinander tippen |
| Tab: mehrere Noten | „Auswahl“ antippen, mit Pfeilen oder Tippen erweitern |
| Tab umbenennen | Den Titel oben im Tab-Editor antippen |

---

## KI-Assistent einrichten (optional)

1. Am PC oder iPhone **aistudio.google.com/apikey** öffnen (oder in der App: Einstellungen → KI-Assistent → „Schlüssel erstellen (Google AI Studio)“) und mit einem Google-Konto anmelden.
2. **„Create API key“** wählen. Ein Schlüssel der Form `AIza…` erscheint. Ohne Abrechnungskonto bleibt der Schlüssel im kostenlosen Tarif, es fallen also keine Kosten an.
3. Schlüssel kopieren, in der App unter **Einstellungen → KI-Assistent → Gemini-Schlüssel** einfügen und auf **„Verbindung testen“** tippen.
4. Optional **„Modelle laden“**: Die App fragt bei Google ab, welche Modelle dein Schlüssel nutzen darf, und listet sie unter „Modell“. Voreingestellt ist `gemini-2.5-flash`. Das im Auftrag genannte `gemini-1.5-flash` hat Google 2025 abgeschaltet. Meldet die App „Modell nicht verfügbar“, wähle hier ein anderes Flash-Modell.

Der Schlüssel bleibt in der lokalen Datenbank des iPhones und wird nie exportiert. Anfragen gehen direkt vom iPhone an `generativelanguage.googleapis.com`, ohne eigenen Server. Den Schlüssel kannst du jederzeit unter „Schlüssel entfernen“ löschen oder in Google AI Studio sperren.

---

## Bekannte Einschränkungen

- **Nicht auf einem echten iPhone getestet.** Die Tests liefen in Chrome mit iPhone-Bildschirmgrößen und Touch-Emulation. Safari-spezifisches Verhalten (Teilen-Menü, Datei-Download im Vollbildmodus, Statusleiste, Safe Areas) ist umgesetzt, aber nicht auf echter Hardware geprüft.
- **PDF-Schrift:** Die eingebaute PDF-Schrift kennt nur westeuropäische Zeichen (Latin-1). Umlaute und ß funktionieren; Emojis und z. B. ♯/♭ werden ersetzt („#“, „b“) oder weggelassen.
- **Umsortieren** erfolgt über Menüs und Pfeiltasten, nicht per Drag & Drop.
- **Tabs** speichern Bünde, Techniken und Positionen, aber keine Notenlängen oder Rhythmusnotation. Pro Note gibt es eine Verbindung zur nächsten Note (h, p oder Slide). Bends lassen sich nicht als „Release“ notieren. Vibrato erscheint als Wellenlinie über dem System.
- **Akkorddiagramme** zeigen 5 Bünde ab der gewählten Lage. Barrés entstehen automatisch, wenn derselbe Finger im selben Bund auf mehreren Saiten liegt.
- **Rückgängig** gibt es im Tab-Editor. In den anderen Bereichen schützen Bestätigungsdialoge vor versehentlichem Löschen.
- **Songbook** sortiert alphabetisch nach Titel.
- **Fotos und Aufnahmen** erscheinen nicht im PDF. Sie sind nicht in den automatischen internen Sicherungen enthalten (zu groß), wohl aber im JSON-Backup, sofern der Schalter „Fotos & Aufnahmen einschließen“ aktiv ist. Ein Backup mit vielen Aufnahmen kann groß werden.
- **Audio** wird im Format aufgenommen, das der Browser anbietet (iPhone: AAC/MP4). Das Mikrofon braucht HTTPS, also die Installation über GitHub Pages; iOS fragt beim ersten Mal nach der Erlaubnis. Wechselt die App während einer Aufnahme in den Hintergrund, wird die Aufnahme beendet und kann gesichert werden.
- **Der lokale Text-Import** arbeitet mit Regeln. Ungewöhnlich formatierte Texte landen eventuell als Notiz statt als Akkordfolge; die Vorschau zeigt das vor dem Erstellen. Einzelne Wörter, die wie Akkorde aussehen („A“, „Am“), können in reinen Akkordzeilen als Akkord gelesen werden. Tabs werden mit 6 Zeilen (Gitarre) oder 4 Zeilen (Ukulele, erkannt an A E C G oder an der Zeilenzahl) gelesen; Notenlängen und Abstände werden auf Spalten vereinfacht.
- **Ukulele:** Die Bibliothek geht von Standardstimmung G C E A aus. Für Low-G-Stimmung gelten dieselben Griffe, der Tab zeigt die G-Saite aber nicht als tief an. Bereits vorhandene Tabs werden beim Instrumentwechsel nicht umgerechnet.
- **Der KI-Assistent** braucht Internet und einen eigenen Google-Gemini-Schlüssel. Ergebnisse können musikalisch falsch sein (vor allem Tabs); prüfe die Vorschau, bevor du sie übernimmst. Google kann Liedtexte bekannter Songs aus urheberrechtlichen Gründen zurückhalten.
- **Videos:** Es funktionieren nur öffentliche YouTube-Videos ohne Altersbeschränkung. Andere Webseiten (z. B. Akkord-Seiten) kann die KI nicht öffnen; deren Text kopierst du unter „Text“ hinein. Videos werden in niedriger Auflösung angesehen, um Kontingent zu sparen, daher kann kleiner Text im Bild unlesbar sein. Griffe nur anhand der Hände abzulesen gelingt der KI selten zuverlässig. Liedtexte bekannter Songs schreibt sie aus Videos absichtlich nicht ab. Lange Videos brauchen viel vom kostenlosen Kontingent, und die Auswertung kann einige Minuten dauern.
- **Kostenloses Kontingent:** Google hat die Gratis-Limits 2025/2026 mehrfach gesenkt. Je nach Modell sind es eher einige Dutzend bis wenige Hundert Anfragen pro Tag, nicht 1.500. Die aktuellen Werte zeigt Google AI Studio. Ist das Kontingent erschöpft, meldet die App das verständlich; alles andere funktioniert weiter.
- **Datenschutz im kostenlosen Tarif:** Google darf Eingaben und Antworten zur Verbesserung seiner Dienste verwenden, und Menschen können sie lesen. Sende deshalb keine privaten Daten an den Assistenten. Gesendet wird immer nur, was du ausdrücklich abschickst (Text, Fotos, Video-Link bzw. bei „Mit KI bearbeiten“ der eine gewählte Song), nie deine ganze Bibliothek.
- **KI-Verbrauch:** Die Gemini-API meldet kein verbleibendes Kontingent. Die Einstellungen zeigen deshalb nur lokal gezählte Anfragen und die von Google je Antwort gemeldeten Token; das echte Limit siehst du in Google AI Studio.
- **Statusleiste / Dynamic Island:** Die Farbe der Dynamic Island lässt sich von keiner App ändern. Die App passt Theme-Farbe und Hintergrund unter der Statusleiste an Hell/Dunkel an; die Statusleisten-Darstellung bestimmt iOS.
- **Ordner** sind flach (keine Unterordner).
- **Speicher:** Wird die App vom Home-Bildschirm gelöscht, löscht iOS auch ihre Daten. Deshalb regelmäßig Backups exportieren.
- **Updates** funktionieren nur über dieselbe Adresse (Origin), unter der die App installiert wurde. Bei einer neuen Adresse entsteht eine neue, leere App; die Daten überträgst du dann per JSON-Backup.
- Wenn die App gleichzeitig in mehreren Browserfenstern geöffnet ist (nur am PC möglich), gewinnt die zuletzt gespeicherte Änderung.
