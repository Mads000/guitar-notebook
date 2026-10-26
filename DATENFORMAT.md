# Datenformat der Export-Dateien (JSON)

Gilt für Backups (`guitar-notebook-backup-*.json`), Song-Exporte (`guitar-notebook-<titel>.json`) und interne Sicherungen. Die Dateien sind UTF-8-JSON und lassen sich am PC mit jedem Texteditor (z. B. VS Code) bearbeiten.

## Kopf

| Feld | Bedeutung |
|---|---|
| `app` | immer `"guitar-notebook"` – andere Dateien werden abgelehnt |
| `format` | Version des Datenformats (aktuell `1`). Ältere Formate werden beim Import migriert, neuere abgelehnt („App aktualisieren“). |
| `kind` | `"full"` (vollständiges Backup) oder `"songs"` (Teil-Export einzelner Songs) |
| `exportedAt` | Zeitpunkt des Exports (ISO 8601) |
| `songs`, `tabs`, `chords`, `patterns`, `folders` | Datensätze (Listen, dürfen fehlen oder leer sein) |
| `settings` | nur in Voll-Backups; KI-Schlüssel und interne Werte sind nie enthalten |
| `media` | optional, Fotos/Aufnahmen Base64-kodiert |

## Song

```json
{
  "id": "lq2x8k3abc12",          // stabil, ändert sich nie – NICHT bearbeiten
  "title": "Lagerfeuer in G",
  "artist": "",
  "instrument": "guitar",        // "guitar" (6 Saiten) oder "ukulele" (4 Saiten); fehlt = Gitarre
  "folderId": "fabc123",         // Ordner-ID oder null
  "tuning": "", "capo": 0, "bpm": null, "timeSig": "",
  "notes": "",
  "favorite": false,
  "createdAt": "2026-01-01T10:00:00.000Z",
  "updatedAt": "2026-01-02T10:00:00.000Z",   // beim Bearbeiten am PC aktualisieren
  "sections": [
    { "id": "…", "name": "Verse", "blocks": [
      { "id": "…", "type": "chords", "items": [{ "id": "…", "name": "G" }], "repeat": 1 },
      { "id": "…", "type": "strum", "name": "", "grid": 8, "strokes": [{ "k": "D" }, { "k": "R" }], "repeat": 1 },
      { "id": "…", "type": "tab", "tabId": "<ID eines Eintrags in tabs>" },
      { "id": "…", "type": "notes", "text": "Freitext" }
    ] }
  ]
}
```

Anschlag `k`: `D` Ab, `U` Auf, `R` Pause, `X` gedämpft; `"a": true` = Akzent.

## Ordner

```json
{ "id": "fabc123", "name": "Lagerfeuer", "createdAt": "…", "updatedAt": "…" }
```

Ordner sind flach (keine Unterordner). Ein Song liegt in höchstens einem Ordner (`folderId`).

## Tabs, Akkorde, Muster

- **Tab:** `{ id, songId, name, measures: [{ id, cols, notes: [[{ f: 3 } | { x: true } | null, …] je Saite], pm: [bool, …] }] }` – 6 Zeilen (Gitarre, oben hohe e-Saite) oder 4 (Ukulele).
- **Eigener Akkord:** `{ id, name, frets: [-1|0..], fingers: [0..5], base }` – 6 oder 4 Werte.
- **Anschlagmuster:** `{ id, name, grid: 8|16, strokes: [...] }`.

## So importiert die App (immer zusammenführen)

1. **Fehlende Datensätze bedeuten nie „löschen“.** Eine Datei mit nur einem Song lässt alle anderen Songs unverändert.
2. **Gleiche `id`, gleicher Inhalt** → übersprungen (kein Duplikat, auch bei wiederholtem Import).
3. **Gleiche `id`, anderer Inhalt** → Konflikt. Die Vorschau zeigt, welche Version laut `updatedAt` neuer ist. Standard: lokale Version behalten. Wählbar: „Import“ (ersetzen) oder „Beide“ (Import als Kopie).
4. **Neue `id`** → neu angelegt. Hat ein vorhandener Song denselben Titel + Künstler, wird er als „mögliches Duplikat“ angezeigt und standardmäßig übersprungen.
5. **Ohne `id`** (z. B. am PC neu geschrieben) → inhaltlich identische Songs werden erkannt und übersprungen; sonst wie Punkt 4.
6. **Ordner** werden per `id`, sonst per Name zugeordnet – nie doppelt angelegt. Unbekannte `folderId` → Song ohne Ordner.
7. **Ungültige Datensätze** werden einzeln übersprungen und in der Vorschau genannt. Ist nichts Gültiges enthalten, bricht der Import ohne Änderung ab.
8. Vor jedem Import entsteht eine interne Sicherung. „Alles ersetzen“ gibt es nur als ausdrücklich bestätigte Sonderaktion.

**Tipp für die Bearbeitung am PC:** `id`-Felder nicht ändern, bei geänderten Songs `updatedAt` auf die aktuelle Zeit setzen. Neue Songs dürfen ohne `id` angelegt werden.
