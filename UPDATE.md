# Updates ohne Datenverlust

Diese Anleitung erklärt, wie du eine neue Version der App auf dein iPhone bringst, wie du vorher ein Backup anlegst und warum Code-Updates deine Songs nicht verändern.

---

## Das Grundprinzip: Code und Daten sind getrennt

| | Wo liegt es? | Was passiert bei einem Update? |
|---|---|---|
| **App-Code** (HTML, CSS, JS, Icons, jsPDF) | Cache Storage, verwaltet vom Service Worker (`sw.js`), Cache-Name `gn-app-<VERSION>` | Wird durch die neue Version ersetzt. |
| **Songs, Tabs, eigene Akkorde, Muster, Einstellungen** | IndexedDB-Datenbank `guitar-notebook` | Bleibt unverändert. Der Service Worker greift nie darauf zu. |
| **Fotos und Audioaufnahmen** | IndexedDB, Store `media` (Binärdaten, verknüpft per `songId`) | Bleibt unverändert. |
| **KI-Schlüssel und Einstellungen** | IndexedDB, Store `settings` | Bleibt unverändert. Der Schlüssel ist nicht im JSON-Backup enthalten; nach einem Umzug auf eine neue Adresse musst du ihn neu eintragen. |

Der Service Worker löscht beim Aktivieren ausschließlich Caches, deren Name mit `gn-app-` beginnt und nicht zur aktuellen Version gehört. IndexedDB, localStorage und alle anderen Speicher fasst er nicht an.

---

## 1. So wird die App aktualisiert

### Am PC

1. Änderungen am Code vornehmen und am PC testen (`python serve.py`, siehe README).
2. **In `sw.js` die Versionsnummer erhöhen**, z. B.:
   ```js
   const VERSION = '1.0.1';
   ```
   Ohne geänderte Versionsnummer erkennt das iPhone kein Update.
3. Neue JavaScript-, CSS- oder Bilddateien in die Liste `ASSETS` in `sw.js` eintragen. Sonst fehlen sie offline.
4. Die geänderten Dateien **unter derselben Adresse** veröffentlichen wie bei der Erstinstallation. Bei GitHub Pages: im Repository **Add file → Upload files**, die geänderten Dateien hochladen (gleichnamige werden ersetzt), **Commit changes**, dann 1–2 Minuten warten.

### Auf dem iPhone

5. **Vorher ein Backup exportieren** (siehe Abschnitt 2). Das ist nicht zwingend, aber eine gute Gewohnheit.
6. Die App vom Home-Bildschirm öffnen, **mit Internetverbindung**. Die App prüft beim Öffnen und bei jeder Rückkehr in die App, ob es eine neue Version gibt.
7. Oben erscheint **„Neue Version verfügbar“**. Tippe auf **Aktualisieren**. Die App speichert zuerst alle offenen Änderungen, aktiviert dann die neue Version und lädt neu.
8. Erscheint der Hinweis nicht sofort: die App vollständig schließen (App-Umschalter, nach oben wegwischen), etwa 10 Sekunden warten und erneut öffnen.
9. Kontrolle: **Einstellungen → App-Version** zeigt die neue Versionsnummer.

Danach läuft die neue Version wieder vollständig offline. Die Webseite kann online bleiben oder offline gehen; für den Betrieb wird sie nicht gebraucht.

### Wichtig: dieselbe Adresse verwenden

iOS ordnet Daten einer **Herkunft** (Origin) zu, also Protokoll, Domain und Port, z. B. `https://deinname.github.io`. Lädst du ein Update unter einer **anderen** Adresse hoch, ist das für iOS eine neue App mit leerem Speicher. Dann gilt:

1. In der alten App ein **Backup exportieren**.
2. Die App von der neuen Adresse zum Home-Bildschirm hinzufügen.
3. Dort das **Backup importieren**.

---

## 2. Ein manuelles JSON-Backup erstellen

1. In der App oben rechts auf das **Regler-Symbol** tippen (Einstellungen).
2. **Backup exportieren (JSON)** wählen.
3. **„Teilen / In Dateien sichern“** antippen und z. B. „In Dateien sichern“ → iCloud Drive wählen, oder die Datei per AirDrop an den PC schicken.

Die Datei heißt `guitar-notebook-backup-JJJJ-MM-TT.json`. Sie enthält alle Songs, Tabs, eigenen Akkorde, Anschlagmuster und Einstellungen. Ist der Schalter **„Fotos & Aufnahmen einschließen“** aktiv (Standard), sind auch alle Fotos und Aufnahmen enthalten (Base64-kodiert). Dadurch kann die Datei groß werden. Beim Import werden Medien ergänzt oder aktualisiert, aber nie pauschal gelöscht.

**Wiederherstellen:** Einstellungen → **Backup importieren …** → Datei wählen → **Zusammenführen** oder **Alles ersetzen**. Die App prüft die Datei vorher, nennt Probleme verständlich und legt vor dem Überschreiben automatisch eine interne Sicherung an (Einstellungen → „Automatische Sicherungen“).

---

## 3. So bleiben Songdaten bei Code-Updates sicher

### Was die App automatisch tut

- **Getrennte Speicher:** Der App-Code liegt im Service-Worker-Cache, die Daten liegen in IndexedDB (siehe Tabelle oben).
- **Update erst nach dem Speichern:** Die neue Version wird erst aktiviert, nachdem alle ausstehenden Änderungen geschrieben sind (`flush()` vor `SKIP_WAITING`).
- **Absturzschutz:** Jede Änderung wird sofort zusätzlich in einem Journal in localStorage abgelegt und beim nächsten Start nachgetragen, falls iOS die App vor dem Schreiben beendet hat.
- **Datenbankstruktur:** `DB_VERSION` in `js/storage.js` (aktuell `2`). Ein Upgrade legt nur fehlende Stores an, vorhandene bleiben unangetastet. Version 1.1 hat so den Store `media` hinzugefügt; das Update von 1.0 auf 1.1 wurde mit vorhandenen Songs getestet.
- **Version 1.2 (Gitarre & Ukulele):** Neue Felder sind optional. Ein Song ohne `instrument` gilt als Gitarre, ein Tab ohne Angabe hat 6 Saiten (die Saitenzahl ergibt sich aus den Daten), ein Akkord mit 6 Bundwerten ist ein Gitarrenakkord. Deshalb war weder eine neue `DB_VERSION` noch eine Migration nötig. Das Update von 1.1 auf 1.2 wurde mit vorhandenen Songs, Tabs, eigenen Akkorden und Aufnahmen getestet: Alles blieb Byte für Byte gleich.
- **Versioniertes Datenformat:** Die Datenbank merkt sich in `settings` den Wert `dataVersion`. Die App kennt ihr Format über `DATA_VERSION` in `js/storage.js` (aktuell `1`).
- **Migration mit Sicherung:** Findet eine neue App-Version ältere Daten (`dataVersion < DATA_VERSION`), legt sie **zuerst eine interne Sicherung** des alten Stands an, migriert dann Schritt für Schritt und speichert alles in einer einzigen Transaktion.
- **Neuere Daten, ältere App:** Stammen die Daten aus einer neueren Version als der App-Code, zeigt die App einen Hinweis und migriert nichts zurück.
- **Importe** älterer Backup-Dateien laufen durch dieselben Migrationen.

### Regeln für künftige Code-Änderungen

Wenn du die App weiterentwickelst (selbst oder mit Claude Code), gelten diese Regeln. Dann bleiben die Songs bei jedem Update erhalten:

1. **Datenbankname `guitar-notebook` nie ändern** und **keine Object Stores löschen oder umbenennen** (auch nicht `media`).
2. Neue Stores nur über eine höhere `DB_VERSION` in `storage.js` anlegen. `onupgradeneeded` legt fehlende Stores an und lässt vorhandene unverändert.
3. Neue **optionale** Felder brauchen keine Migration: Der Code muss nur mit fehlenden Feldern umgehen können (z. B. `song.key ?? ''`).
4. Ändert sich die **Bedeutung oder Struktur** vorhandener Felder, wird `DATA_VERSION` um 1 erhöht und in `MIGRATIONS` (in `js/storage.js`) eine Funktion für den Schritt von der alten auf die neue Version ergänzt:
   ```js
   const MIGRATIONS = {
     // Version 1 → 2: Beispiel – Capo als Objekt statt Zahl
     1: (data) => {
       data.songs.forEach((s) => { s.capo = { fret: s.capo || 0 }; });
       return data;
     },
   };
   ```
   Die Funktion erhält alle Daten (`{ songs, tabs, chords, patterns }`) und gibt sie migriert zurück. Die Sicherung vorher legt die App automatisch an.
5. Die Validierung in `js/backup.js` (`normSong`, `normTab` …) an neue Felder anpassen, damit sie beim Import erhalten bleiben.
6. Vor der Veröffentlichung am PC testen: altes Backup importieren, neue Version starten, prüfen, ob alles da ist.
7. Zum Schluss `VERSION` in `sw.js` erhöhen.

### Checkliste vor jedem Update

- [ ] Backup auf dem iPhone exportiert
- [ ] `VERSION` in `sw.js` erhöht
- [ ] neue Dateien in `ASSETS` eingetragen
- [ ] bei Formatänderungen `DATA_VERSION` erhöht und Migration ergänzt
- [ ] am PC getestet (auch offline)
- [ ] unter **derselben Adresse** hochgeladen
