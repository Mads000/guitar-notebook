// Neuigkeiten: was sich in den letzten Versionen geändert hat. Neueste zuerst.
// Nach einem Update erscheint der neue Eintrag einmal von selbst; danach unter Einstellungen → Über Sorell.
import { tr, lang } from './i18n.js';
import * as db from './storage.js';
import { h, sheet, icon } from './ui.js';

export const NEWS = [
  { v: '1.45', date: tr("November 2026"), title: tr("Sorell auf Englisch"), items: [
    tr("Sorell gibt es jetzt auch auf Englisch: Einstellungen → „Sprache · Language“. Beim ersten Start fragt die App, welche Sprache du möchtest."),
    tr("Auf Englisch antwortet auch der KI-Assistent auf Englisch, und der Prompt für ChatGPT, Gemini oder Claude ist englisch."),
  ] },
  { v: '1.44', date: tr("November 2026"), title: tr("Backup per Mail"), items: [
    tr("Neu unter Einstellungen → Backups: „Backup per Mail senden“. Einmal deine Adresse hinterlegen, dann erstellt Sorell das Backup und öffnet das Teilen-Menü mit der Datei – „Mail“ wählen, Betreff und Text sind schon ausgefüllt. So liegt dein Backup in deinem Postfach und ist überall abrufbar."),
    tr("Wahlweise klein (ohne Fotos & Aufnahmen) oder komplett. Ist die Datei für viele Mail-Anbieter zu groß, sagt Sorell das vorher. Der bisherige Weg „Backup als Datei sichern“ bleibt unverändert."),
  ] },
  { v: '1.43', date: tr("November 2026"), title: tr("Schlagworte, Versionen und Songs per Link"), items: [
    tr("Schlagworte: Ein Song kann mehrere haben, z. B. „Lagerfeuer“ und „Zupfen“, zusätzlich zum Ordner. Setzen im Menü eines Songs oder beim Bearbeiten unter dem Titel. Filtern unter „Ordner“ bzw. am PC in der Seitenleiste."),
    tr("Versionen: „Neue Version …“ legt eine Fassung desselben Songs an, z. B. „Capo 2“ oder „vereinfacht“. In der Liste steht der Song nur einmal, im Song wechselst du oben zwischen den Fassungen."),
    tr("Teilen → „Als Link“: Der Song steckt komplett im Link. Wer ihn öffnet, bekommt die übliche Import-Vorschau – ohne Datei und ohne Konto."),
    tr("Der Prompt für ChatGPT, Gemini oder Claude passt jetzt genau zum gewählten Instrument."),
  ] },
  { v: '1.42', date: tr("November 2026"), title: tr("Fotos auswerten ohne eigenen Schlüssel"), items: [
    tr("Neu unter „Song erstellen“ → „Foto & Video“: „Prompt kopieren“. Der Prompt passt genau zum gewählten Instrument, Gitarre oder Ukulele. Gib ihn zusammen mit deinem Foto an ChatGPT, Gemini oder Claude und füge die Antwort mit „Antwort einfügen“ ein. Sorell macht daraus den Song mit Akkordfolgen, Anschlägen, Griffen und Tabs."),
    tr("Die Musiktheorie ist jetzt eine eigene Seite wie ein Song, mit Zurück-Pfeil oben links. Am PC bleibt die Seitenleiste daneben. Aus einem Song heraus geöffnet, kommst du danach wieder genau dorthin zurück, auch ins Bearbeiten."),
    tr("Neue Beispiel-Songs: Backseat, Don’t Look Back in Anger und Heart of Ice (Ukulele). Hinzufügen unter Einstellungen → „Beispiel-Songs hinzufügen“."),
  ] },
  { v: '1.38', date: tr("November 2026"), title: tr("Sorell am PC wird eine richtige Arbeitsfläche"), items: [
    tr("Am PC ist die Songliste jetzt eine Tabelle mit Instrument, Capo und Datum. Suche und „+“ stehen in der Seitenleiste, Filter im Menü „···“."),
    tr("Bearbeiten läuft am PC in zwei Spalten wie die Song-Ansicht."),
    tr("Tab-Editor am PC: Die Bildschirmtastatur lässt sich einklappen, getippt wird direkt auf der Tastatur."),
    tr("Hauptaktionen wie „Fertig“ und „+“ sind wieder kräftig, Weiß markiert nur noch die Auswahl. Die Filter auf der Startseite liegen in einem gemeinsamen Umschalter."),
    tr("Bearbeiten: Foto, Aufnahme und „+ Abschnitt“ liegen in einer gemeinsamen Leiste. In der Musiktheorie sind die Griffbilder größer."),
    tr("Behoben: Die Kopfzeile verwischte auf dem iPhone den Titel."),
  ] },
  { v: '1.37', date: tr("November 2026"), title: tr("Sorell fühlt sich an wie eine App"), items: [
    tr("Die Markierung gleitet: In der Abschnittsleiste, bei den Filtern und in allen Umschaltern wandert sie zum neuen Eintrag."),
    tr("Knöpfe und Zeilen geben beim Drücken nach und federn zurück. Fenster, Schalter und das Auf- und Zuklappen der Abschnitte laufen weich. Mit „Bewegung reduzieren“ im System bleibt es bei kurzen Überblendungen."),
    tr("Bearbeiten: Foto, Aufnahme und „+ Abschnitt“ schweben unten. Das Menü „···“ eines Blocks erscheint erst, wenn du ihn antippst, und öffnet auch durch langes Drücken."),
    tr("„×2“ steht jetzt direkt hinter dem letzten Akkord. Tabs nutzen beim Bearbeiten die ganze Breite."),
    tr("Am PC ist die Seitenleiste auch auf der Startseite da, mit Alle, Favoriten, Ordnern und Setlisten. Abschnitte laufen zeilenweise in zwei Spalten, Griffbilder sind größer."),
    tr("Gefüllte Knöpfe sind wieder deckend, Glas gibt es nur noch dort, wo Inhalt dahinter durchläuft."),
    tr("Griffbilder zeigen überall einheitliche Punkte ohne Fingerzahlen, auch im PDF. Im Griff-Editor wählst du jetzt zwischen Punkt und Barré."),
    tr("Ruhigere Bewegungen, und am PC öffnen die Einstellungen als schwebendes Fenster."),
    tr("Ruhiger Hintergrund ohne Farbverlauf. Im hellen Modus sind die Knöpfe jetzt weiß."),
  ] },
  { v: '1.36', date: tr("November 2026"), title: tr("Sorell wird kompakter und gläsern"), items: [
    tr("Das Sorell-Design hat jetzt dieselben Größen und Abstände wie das klassische Design. So passt mehr auf den Bildschirm."),
    tr("Mehr Liquid Glass: Karten, Knöpfe, Leisten und Menüs sind durchscheinend, der Inhalt läuft unter Kopfzeile und Leisten sichtbar durch."),
    tr("Die Griffleiste im Song kommt ohne die Überschrift „Akkorde“ aus."),
  ] },
  { v: '1.35', date: tr("November 2026"), title: tr("Sorell sieht neu aus"), items: [
    tr("Die ganze App hat ein neues Design: schlicht, viel Weißraum, schwarz-weiß, eigene Schriften, Akkorde und Tabs in Monospace. Hell und Dunkel wie gewohnt."),
    tr("Das bisherige Design ist nicht weg: Unter Einstellungen → Darstellung → Design kannst du jederzeit auf „Klassisch“ zurückschalten."),
    tr("In der Songliste öffnest du das Menü eines Songs jetzt durch langes Drücken. Alle Funktionen sind geblieben."),
    tr("Im Song stehen Favorit und Bearbeiten direkt oben rechts."),
  ] },
  { v: '1.34', date: tr("November 2026"), title: tr("Ein neues App-Symbol"), items: [
    tr("Neues App-Symbol: ein Plektrum aus weißen Balken auf orangem Grund. Die Auswahl unter Einstellungen → Darstellung entfällt, es gibt nur noch dieses eine."),
    tr("Das Orange des Symbols findet sich jetzt auch in der App: beim Plus unten, bei den Ordnern, den Favoriten-Sternen, kleinen Links, dem Metronom und bei „Fertig“ im Bearbeiten-Modus."),
    tr("Die dunklen Knöpfe sind jetzt leichter und leicht durchscheinend."),
    tr("Tab-Editor aufgeräumt: Akkorde in einer eigenen Zeile, Techniken und Anschlag in einem Raster, links die Zahlen, rechts die Pfeile als Kreuz. Alle Funktionen sind geblieben."),
    tr("Neu unter Einstellungen → Darstellung: App-Größe, damit kannst du die ganze App verkleinern oder vergrößern. Backups enthalten jetzt alle Einstellungen, auch solche, die bisher nur auf dem Gerät lagen."),
    tr("iOS übernimmt ein Symbol nur beim Hinzufügen zum Home-Bildschirm. Eine neu hinzugefügte App startet leer: Sichere vorher unbedingt ein Backup und spiele es danach wieder ein."),
  ] },
  { v: '1.33', date: tr("November 2026"), title: tr("Neues App-Symbol"), items: [
    tr("Neues App-Symbol mit Plektrum und Saiten, zur Wahl stehen Schwarz, Metall, Rauch und Glas: unter Einstellungen → Darstellung → App-Symbol."),
    tr("iOS übernimmt ein Symbol nur beim Hinzufügen zum Home-Bildschirm. Eine neu hinzugefügte App startet leer: Sichere vorher unbedingt ein Backup und spiele es danach wieder ein."),
  ] },
  { v: '1.32', date: tr("November 2026"), title: tr("1, 4, 5: in der Box bleiben"), items: [
    tr("Neuer Tab „Box“ in der Musiktheorie: ein Griffmuster der Moll-Pentatonik, in dem die Töne 1, 4 und 5 markiert sind. Dazu ihre Lage, die passenden Akkorde und ein Übungsweg, für Gitarre und Ukulele. Aus einem Song heraus startet er in dessen Tonart."),
  ] },
  { v: '1.31', date: tr("November 2026"), title: tr("Alle Abschnitte und Griffe auf einen Blick"), items: [
    tr("Akkorde stehen jetzt standardmäßig untereinander. Unter Einstellungen → Darstellung kannst du wieder „Nebeneinander“ wählen, einzelne Songs abweichend im Song unter ••• → Darstellung & Tonart."),
    tr("Abschnitts-Leiste: Alle Abschnitte sind immer gleichzeitig zu sehen, seitliches Wischen entfällt. Passen die Namen nicht, stehen dort Kürzel wie St1, Ch oder Br, bei sehr vielen Abschnitten gibt es eine zweite Reihe. So springst du mit einem Tipp vom Ende zum Anfang."),
    tr("Fixierte Griffe brechen jetzt um und werden so weit kleiner, dass alle gleichzeitig zu sehen sind. Antippen zeigt einen Griff weiterhin groß."),
    tr("Vereinfacht anzeigen: Unter ••• → Darstellung & Tonart lassen sich die Akkorde jetzt auch nur für die Anzeige vereinfachen, zusammen mit einer anderen Tonart oder einem anderen Capo. Dort schlägt Sorell auch einen Capo vor, wenn der Song damit leichter zu greifen ist."),
    tr("Wurde ein Song transponiert oder vereinfacht, steht das jetzt in seinen Angaben, zum Beispiel „Transponiert +2 · Vereinfacht“, auch im PDF und beim Teilen als Text. Das gilt auch, solange du es nur anzeigst, und für Akkorde aus KI-Vorschlägen."),
    tr("Nur-Anzeige: Akkorde ohne hinterlegten Griff fehlen nicht mehr in der Griffleiste, dort steht jetzt „kein Griff“."),
    tr("Musiktheorie erklärt deinen Song: Öffnest du sie im Song, zeigt der neue Bereich „Song“ die Tonart, jeden Abschnitt in Stufen (I, V, vi, IV), was jeder Akkord tut und die Solo-Töne am Griffbrett."),
    tr("Musiktheorie für die Ukulele: Tonleitern lassen sich jetzt auch hier einzeln als Griff-Positionen zeigen, und unter „Akkorde“ gibt es Barré- und Powerchords mit A- und G-Form."),
  ] },
  { v: '1.30', date: tr("November 2026"), title: tr("Richtige Tonnamen, mehr Platz beim Spielen"), items: [
    tr("Akkorde nebeneinander: Eine Folge steht jetzt platzsparend in einer Zeile. Unter Einstellungen → Darstellung kannst du wieder „Untereinander“ wählen, einzelne Songs abweichend im Song unter ••• → Darstellung & Tonart."),
    tr("Abschnitte schneller wechseln: In der Leiste unten ist jeder Abschnitt direkt antippbar, der aktuelle ist markiert und rückt in die Mitte. Weite Sprünge gehen sofort."),
    tr("Transponieren nimmt jetzt die Tabs mit: Bünde und Akkordnamen rücken mit. Passt ein Tab nicht mehr aufs Griffbrett, wandert er um eine Oktave. Abschaltbar."),
    tr("Nur anzeigen: Unter ••• → Darstellung & Tonart siehst du den Song in einer anderen Tonart oder mit anderem Capo, ohne ihn zu ändern."),
    tr("Metronom: im Song unter •••, mit Tempo antippen. Die Taktart kommt aus dem Song."),
    tr("Tabs wachsen mit der Textgröße. Der Anschlag über den Akkorden ist besser zu sehen. Im Querformat bleibt mehr Platz für den Song."),
    tr("Akkorde ohne Griff erscheinen als „Griff fehlt“, ein Tipp legt ihn an."),
    tr("Schrift: Unter Einstellungen → Darstellung gibt es jetzt Gemischt (Überschriften in der Systemschrift, Texte in Serif), System und Serif."),
    tr("Musiktheorie korrigiert: Töne heißen jetzt richtig (C E♭ G statt C D♯ G, C♯m statt D♭m, E♯ in F♯-Dur), die Andalusische Folge endet auf Dur, „Blue Note“ steht nur noch beim Blues."),
    tr("Musiktheorie übersichtlicher: feste Grundton-Knöpfe, erst das Griffbrett und dann die Erklärung, Tabellen eingeklappt. Neu: Solo je Abschnitt und, mit Capo, Umschalten zwischen gegriffener und klingender Tonart. Moll steht im Text als „Bm“, damit es nicht mit B♭ verwechselt wird."),
    tr("Weniger Text: Hilfen in den Editoren stehen nur beim ersten Mal da, danach hinter „?“. Viele Hinweise sind kürzer."),
    tr("Behoben: Im Tab-Editor hängt das h für Hammer-on nicht mehr vom Tempo ab. Akkorde in der Akkordfolge reagieren jetzt auch auf Mausklicks. Der Backup-Hinweis verdeckt die Menütaste nicht mehr, die Stimmung im Stimmgerät wird nicht mehr abgeschnitten, und graue Texte sind im hellen Modus besser lesbar."),
  ] },
  { v: '1.29', date: tr("November 2026"), title: tr("Neuer Sync, einheitliches Design"), items: [
    tr("Sync: Geräte einmal per Code koppeln, danach reicht ein Tipp auf „Mit iPad synchronisieren“. Auf dem anderen Gerät muss nur Einstellungen → Sync geöffnet sein. Beim ersten Mal auf dem neuen Stand vergleicht Sorell alles einmal gründlich."),
    tr("Sync versteht jetzt, wer was geändert hat: Hat nur ein Gerät etwas geändert, wird es übernommen. Haben beide am selben Song gearbeitet, werden Titel, Favorit, Ordner und jeder Abschnitt einzeln zusammengeführt. Du wirst nur gefragt, wenn beide denselben Teil verschieden geändert haben. Auch Löschungen kommen jetzt auf dem anderen Gerät an."),
    tr("Zuletzt gelöscht: Gelöschte Songs bleiben 30 Tage wiederherstellbar, und direkt nach dem Löschen gibt es „Rückgängig“. Du findest sie im Menü ••• der Startseite und in den Einstellungen."),
    tr("Beim Spielen: Griffe und Akkorde öffnen sich mit einem einfachen Tipp groß. Die Abschnitts-Leiste ist neu: große Pfeile für voriger und nächster Abschnitt, in der Mitte der aktuelle mit „Weiter: Chorus“. Ein Tipp darauf zeigt alle Abschnitte. In Setlisten sitzt das Blättern zwischen Songs in derselben Leiste."),
    tr("Sorell merkt sich, wo du warst: Die Songliste bleibt beim Zurückkommen an ihrer Stelle, ein Song öffnet dort, wo du aufgehört hast."),
    tr("Teilen als Text oder ChordPro: im Song unter ••• → Teilen, zum Beispiel für die Band."),
    tr("Tab-Editor im Querformat: Tab links, Tasten rechts."),
    tr("Startseite: Ordner als Pillen, mehr Platz für Songs, in den Zeilen Tonart und Capo statt der Uhrzeit."),
    tr("Einheitliches Design nach den Apple-Richtlinien: Bedienelemente stehen jetzt immer in der Systemschrift, Songtitel und Texte in deiner gewählten Schrift. Einstellungen und Backups sind aufgeräumt, Unterseiten gleiten von rechts herein."),
    tr("Behoben: Anschläge und Akkordnamen im Tab gingen beim Import und Wiederherstellen von Backups verloren."),
  ] },
  { v: '1.28', date: tr("November 2026"), title: tr("Akkorde und Anschlag im Tab"), items: [
    tr("Tab-Editor: Über den Zifferntasten steht jetzt eine Akkordleiste – zuerst die Griffe deines Songs, dann gängige Akkorde, mit „…“ die ganze Bibliothek. Antippen setzt den Akkord als Spalte, sein Name steht über dem Tab."),
    tr("Anschlag im Tab: „⊓ ab“ und „V auf“ setzen einen senkrechten Pfeil neben den Akkord (Abschlag zeigt nach oben – von der tiefen Saite unten zur hohen oben), darunter ⊓ bzw. V. Der Griff muss nur einmal im Tab stehen: Anschläge an leeren Stellen schlagen ihn erneut an – z. B. G antippen, dann ab, ab, auf, auf, ab, auf. Beim Abspielen klingt das geschrammt, im PDF steht es mit. ⌫ entfernt einen Anschlag."),
    tr("Rhythmus ist jetzt eine Taste: Sie zeigt den Notenwert der Position, Antippen öffnet die Auswahl (Halbe bis Sechzehntel, automatisch, entfernen)."),
  ] },
  { v: '1.27', date: tr("November 2026"), title: tr("Soli und Akkorde verstehen"), items: [
    tr("Solo über deinen Song: Unter „Tonleitern“ schlägt Sorell die passende Pentatonik vor. Tippe einen Akkord an – seine Zieltöne (Grundton, Terz, Quinte) leuchten, Akkordtöne außerhalb der Tonleiter sind gestrichelt."),
    tr("Geborgte Akkorde: Unter „Tonarten“ steht bei jedem Akkord deines Songs, ob er zur Tonart gehört, geborgt ist (z. B. ♭VII aus Moll) oder eine Zwischendominante ist. Im Quintenzirkel sind sie gestrichelt markiert."),
    tr("Neu „Akkorde“: Akkord-Baukasten mit Formeln (1 3 5, 1 ♭3 5 …), alle Akkordtöne am Hals, Barré- und Powerchords mit E- und A-Form."),
    tr("Alle Modi (Lydisch bis Lokrisch) und „Alle Töne“ am Griffbrett, Töne der Tonart, Capo-Tabelle und CAGED-Tabelle „Form verschieben“."),
    tr("iPad und PC: Abschnitte nebeneinander oder untereinander – einstellbar unter Einstellungen → Darstellung."),
    tr("Griffe zeichnen ohne Namen: Gibt es den gezeichneten Griff schon (z. B. Am), schlägt Sorell ihn vor – „Am verwenden“ übernimmt ihn, ohne einen neuen Griff anzulegen. So kannst du einen neuen Song mit „+ Griff“ beginnen; die Griffe werden dann in den Abschnitten zuerst vorgeschlagen."),
    tr("Akkordfolgen lassen sich benennen (z. B. „Teil A“, „Übergang“) – praktisch, wenn ein Abschnitt mehrere Folgen hat. Beim Bearbeiten im Menü ••• der Akkordfolge → „Benennen …“."),
  ] },
  { v: '1.26', date: tr("November 2026"), title: tr("Musiktheorie"), items: [
    tr("Neu: Musiktheorie – im Song unter ••• → „Tonart & Musiktheorie“ (mit der Tonart deines Songs) oder auf der Startseite unter •••."),
    tr("Quintenzirkel zum Antippen: zeigt die Akkorde einer Tonart als Griffbilder (I–vii°), typische Akkordfolgen („+“ übernimmt sie in den Song) und einen Capo-Rechner, welche leichten Griffe mit welchem Capo passen."),
    tr("Die Tonart deines Songs wird aus den Akkorden erkannt – mit Capo auch, wie er klingt."),
    tr("Tonleitern auf dem Griffbrett: Pentatonik, Blues, Dur, Moll, Modi – mit Stufen oder Tönen, auf der Gitarre auch einzeln als Positionen 1–5."),
    tr("CAGED: die fünf Griffformen jedes Dur- und Moll-Akkords am Hals, für Gitarre und Ukulele."),
  ] },
  { v: '1.25', date: tr("November 2026"), title: tr("Import aus Dateien, aufgeräumtes KI-Menü"), items: [
    tr("Dateien öffnen: ChordPro (.cho, .chopro, .pro), OnSong, Text – auch mehrere auf einmal, jede wird ein eigener Song. Griffe aus ChordPro ({define: …}) werden als eigene Griffe übernommen."),
    tr("Von Ultimate Guitar kopierter Text wird zum Akkord-Sheet: je Abschnitt die Akkordfolge (Wiederholungen als ×2), ohne Liedtext. Griff-Listen wie „G 320033“ werden eigene Griffe des Songs, wenn sie vom Standard abweichen. Liedtext gibt es auf Wunsch unter Optionen."),
    tr("PDFs (Akkordblätter, Songbooks) liest die KI unter „Foto & Video“ aus."),
    tr("Neuer Song / KI-Idee aufgeräumt: erst das Instrument, dann wählen, was entstehen soll (Akkorde, Riff/Tab, ganzer Song, Anschlag), Beschreibung mit Beispielen zum Antippen."),
    tr("Synchronisieren steht jetzt ganz oben in den Einstellungen."),
  ] },
  { v: '1.24', date: tr("November 2026"), title: tr("Besser auf dem iPad"), items: [
    tr("iPad quer: Die Songliste steht links neben dem geöffneten Song – wie bei Apple Notizen. Mit Suche, antippen wechselt direkt den Song. Ein- und ausblenden mit dem Listen-Knopf oben links."),
    tr("Auf dem iPad sind Schrift, Griffbilder und Tabs größer."),
    tr("Zwei Spalten wie in einer Zeitung: links der Reihe nach von oben nach unten, dann rechts weiter – beide Spalten etwa gleich lang, auch mit Seitenleiste, sobald der Platz reicht."),
    tr("Abschnitte mit langem Tab (z. B. Solos) stehen immer über die volle Breite, damit der Tab nicht so klein wird wie am Handy."),
  ] },
  { v: '1.23', date: tr("November 2026"), title: tr("Tabs abspielen, iPad-Ansicht, Let Ring"), items: [
    tr("Tabs abspielen: „Abspielen“ neben jedem Tab. Ein Cursor läuft mit, Tempo aus dem Song, langsamer/schneller (25 % bis 150 %) und Schleife. Hammer-ons, Slides, Bends, Vibrato, Palm Mute und Dead Notes sind zu hören."),
    tr("Im Tab-Editor spielt ▶ ab dem Cursor – mit „Auswahl“ die markierte Stelle in Schleife."),
    tr("iPad quer und PC: Beim Spielen stehen die Abschnitte in zwei Spalten nebeneinander."),
    tr("Neue Technik „Let Ring“ (Taste L.R.): Töne ausklingen lassen, wird über dem Tab angezeigt, im PDF gedruckt und beim Abspielen berücksichtigt."),
    tr("Tipp: Ist kein Ton zu hören, den Stummschalter am iPhone prüfen."),
  ] },
  { v: '1.22', date: tr("Oktober 2026"), title: tr("Rhythmus im Tab"), items: [
    tr("Unter Tabs können jetzt Notenhälse mit Balken stehen – wie in Noten: Viertel, Achtel (ein Balken), Sechzehntel (zwei Balken), Halbe."),
    tr("Tab-Editor: neue Reihe „Rhythmus“. Position wählen und 1/2, 1/4, 1/8 oder 1/16 tippen – danach springt der Cursor zur nächsten Note. Mit „Auswahl“ für mehrere Noten auf einmal."),
    tr("„Auto“ setzt die Notenwerte des Takts aus den Abständen der Noten; für den ganzen Tab unter •••."),
    tr("Der Rhythmus erscheint auch im PDF."),
  ] },
  { v: '1.21', date: tr("Oktober 2026"), title: tr("Noten verschieben, Suche repariert"), items: [
    tr("Tab-Editor: Noten gedrückt halten und an die richtige Stelle ziehen – auf eine andere Saite oder Position. Mit „Auswahl“ verschiebst du mehrere Noten auf einmal. Liegt am Ziel schon eine Note, tauschen beide den Platz."),
    tr("Die Suche in der Songliste bricht nicht mehr nach jedem Buchstaben ab."),
    tr("Browser-Gesten sind aus: kein Zoomen, kein Ziehen zum Neuladen, kein Wischen für Vor/Zurück, kein Kontextmenü bei langem Drücken."),
  ] },
  { v: '1.20', date: tr("Oktober 2026"), title: tr("Nur ausgewählte Songs synchronisieren"), items: [
    tr("Beim Synchronisieren stellst du pro Gerät ein, was gesendet wird: alles, nur ausgewählte Songs oder nichts (nur empfangen)."),
    tr("Direkt senden: in der Mehrfachauswahl „An anderes Gerät senden …“, bei einem Song unter Teilen → „An anderes Gerät (Sync)“."),
    tr("Mitgesendet werden die Tabs, eigenen Griffe und auf Wunsch Fotos und Aufnahmen dieser Songs."),
    tr("Die Abschnitts-Leiste beim Spielen zeigt jetzt immer alle Abschnitte auf einmal (bei vielen in mehreren Reihen) – kein Wischen mehr."),
  ] },
  { v: '1.19', date: tr("Oktober 2026"), title: tr("Tabs übersichtlich, schneller schreiben"), items: [
    tr("Beim Spielen: unten eine Leiste mit allen Abschnitten – antippen springt direkt dorthin. Abschaltbar unter ••• → Schrift- und Griffgröße."),
    tr("Lange Tabs brechen in Zeilen um, statt seitlich zu scrollen. Hammer-on, Pull-off und Slides sind deutlicher, darunter steht, was die Zeichen bedeuten."),
    tr("Die KI schreibt Tabs jetzt Note für Note statt als Textgrafik – dadurch verrutschen keine Töne mehr auf falsche Saiten oder Positionen."),
    tr("Tab-Editor: „Auto →“ springt nach jeder Note weiter, ganze Akkorde als Spalte einfügen, Tabs als Text bearbeiten oder aus dem Internet einfügen (unter •••)."),
    tr("Neuer Song: Gerüst mit einem Tipp (z. B. Verse · Chorus) oder alles als Text schreiben. „+ Abschnitt“ bietet „Wie Chorus“ an – Akkorde und Tabs werden übernommen, Strophen werden durchnummeriert."),
    tr("Versehentliches Zoomen mit zwei Fingern ist gesperrt."),
  ] },
  { v: '1.18', date: tr("Oktober 2026"), title: tr("Weniger Notizen, Backup-Hinweis"), items: [
    tr("Text-Import und KI setzen Hinweise als Funktion um statt als Notiz: „x2“ wird zur Wiederholung, „Chorus x2“, „Strophe 2 wie Strophe 1“, „Refrain wiederholen“ und „wie oben, aber gezupft“ übernehmen Akkorde und Tabs des Vorbilds."),
    tr("Tabs können wiederholt werden („2× spielen“) – im Menü des Tabs."),
    tr("Zeichenerklärungen und „Tab:“-Beschriftungen landen nicht mehr als Notiz, Capo und Tempo aus KI-Notizen kommen in ihre Felder."),
    tr("Backup-Erinnerung, sobald Songs in keiner Backup-Datei stecken. Vor dem Löschen der App: Hinweis in den Einstellungen."),
  ] },
  { v: '1.17', date: tr("Oktober 2026"), title: tr("Aufgeräumte Menüs und Vibration"), items: [
    tr("Das Menü im Song zeigt nur, was gerade passt: beim Ansehen Schriftgröße, Display, Stimmgerät, Transponieren und Teilen – beim Bearbeiten Details, Ergänzen, KI und Löschen."),
    tr("Alle Menüs mit Symbolen und kürzer; Seltenes (Teilen, Import) steckt in kleinen Untermenüs."),
    tr("Kurze Vibration beim Tippen auf Knöpfe, in Menüs und beim Doppeltipp auf Akkorde (iPhone ab iOS 18). Abschaltbar unter Einstellungen → Darstellung."),
    tr("Alte Notizen wie „Spielweise: …“ stehen jetzt als Anschlag über den Akkorden."),
  ] },
  { v: '1.16', date: tr("Oktober 2026"), title: tr("Übersichtlicher und mehr wie eine App"), items: [
    tr("Akkorde stehen immer untereinander – daneben, was bei jedem Akkord gespielt wird."),
    tr("Das eigene Anschlagmuster-Feld ist weg: Der Anschlag steht jetzt als Text über den Akkorden („DDU UDU“). Alte Songs wurden automatisch umgestellt, vorher wurde eine Sicherung angelegt."),
    tr("Wiederholungen je Akkord („×2“) sind ein eigenes Feld statt Text."),
    tr("KI und Text-Import nutzen alle Funktionen: Capo, Wiederholungen, Spielweise, Griffe und Tabs landen im passenden Feld."),
    tr("Aufgeräumte Kopfzeile: nur noch Zurück-Pfeil und ein Menü. Bearbeiten, Darstellung, Display anlassen und Stimmgerät findest du unter •••."),
    tr("Vom linken Rand nach rechts wischen führt zurück zur Songliste."),
    tr("Spürbares Feedback beim Tippen (iPhone ab iOS 18) und weichere Animationen."),
  ] },
  { v: '1.15', date: tr("Oktober 2026"), title: tr("Hit und Mute"), items: [
    tr("Neue Schläge „Hit“ (H) und „Mute“ (M/X)."),
  ] },
  { v: '1.14', date: tr("Oktober 2026"), title: tr("KI liest dein Notizbuch"), items: [
    tr("KI und Text-Import erkennen Spielweisen je Akkord und legen gezeichnete Griffe als eigene Griffe des Songs an."),
    tr("Griffe als Text: „Griff Abm: 4 3 4 2“."),
  ] },
  { v: '1.13', date: tr("Oktober 2026"), title: tr("Spielweise je Akkord"), items: [
    tr("Zu jedem Akkord kannst du notieren, wie er gespielt wird, z. B. „P(1,3,4) – P2“."),
  ] },
  { v: '1.12', date: tr("Oktober 2026"), title: tr("Akkordfolgen direkt bearbeiten"), items: [
    tr("Akkordfolge antippen: ersetzen, verschieben (auch per Ziehen), einfügen und entfernen – ohne extra Fenster."),
    tr("„+“ am Ende eines Abschnitts fügt Akkorde, Tab oder Notiz direkt ein."),
    tr("Doppeltipp auf einen Akkord zeigt das Griffbild groß."),
    tr("Fenster lassen sich nach unten wegwischen, Liquid-Glass-Optik, interaktive Einführung, helles App-Symbol."),
  ] },
];

// Auf Englisch nur die neueren Einträge (ab 1.38) – die ältere Versionsgeschichte gibt es nur auf Deutsch
const shownNews = () => (lang === 'en' ? NEWS.filter((n) => parseFloat(n.v) >= 1.38) : NEWS);

export function openNews() {
  const body = h('div', { class: 'news' }, shownNews().map((n, i) => h('section', { class: 'news-item' + (i === 0 ? ' latest' : '') },
    h('div', { class: 'news-head' }, h('span', { class: 'news-v' }, tr("Version ") + n.v), h('span', { class: 'news-date' }, n.date)),
    h('h3', { class: 'news-title' }, n.title),
    h('ul', { class: 'news-list' }, n.items.map((t) => h('li', null, icon('check', 'small'), h('span', null, t)))))));
  return sheet({ title: tr("Neuigkeiten"), body, full: true, right: { label: tr("Fertig"), bold: true } });
}

// Einmal nach einem Update zeigen; bei der ersten Installation nur merken
export async function showNewsOnce(isFirstRun) {
  const seen = await db.getSetting('newsSeen', null);
  if (seen === NEWS[0].v) return;
  await db.setSetting('newsSeen', NEWS[0].v);
  if (seen || !isFirstRun) openNews();
}
