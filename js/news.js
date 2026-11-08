// Neuigkeiten: was sich in den letzten Versionen geändert hat. Neueste zuerst.
// Nach einem Update erscheint der neue Eintrag einmal von selbst; danach unter Einstellungen → Über Sorell.
import * as db from './storage.js';
import { h, sheet, icon } from './ui.js';

export const NEWS = [
  { v: '1.34', date: 'November 2026', title: 'Ein neues App-Symbol', items: [
    'Neues App-Symbol: ein Plektrum aus weißen Balken auf orangem Grund. Die Auswahl unter Einstellungen → Darstellung entfällt, es gibt nur noch dieses eine.',
    'Das Orange des Symbols findet sich jetzt auch in der App: beim Plus unten, bei „Erstellen“, bei den Ordnern, den Favoriten-Sternen, kleinen Links, dem Metronom und bei „Fertig“ im Bearbeiten-Modus.',
    'Die dunklen Knöpfe sind jetzt leichter und leicht durchscheinend.',
    'iOS übernimmt ein Symbol nur beim Hinzufügen zum Home-Bildschirm. Eine neu hinzugefügte App startet leer: Sichere vorher unbedingt ein Backup und spiele es danach wieder ein.',
  ] },
  { v: '1.33', date: 'November 2026', title: 'Neues App-Symbol', items: [
    'Neues App-Symbol mit Plektrum und Saiten, zur Wahl stehen Schwarz, Metall, Rauch und Glas: unter Einstellungen → Darstellung → App-Symbol.',
    'iOS übernimmt ein Symbol nur beim Hinzufügen zum Home-Bildschirm. Eine neu hinzugefügte App startet leer: Sichere vorher unbedingt ein Backup und spiele es danach wieder ein.',
  ] },
  { v: '1.32', date: 'November 2026', title: '1, 4, 5: in der Box bleiben', items: [
    'Neuer Tab „Box“ in der Musiktheorie: ein Griffmuster der Moll-Pentatonik, in dem die Töne 1, 4 und 5 markiert sind. Dazu ihre Lage, die passenden Akkorde und ein Übungsweg, für Gitarre und Ukulele. Aus einem Song heraus startet er in dessen Tonart.',
  ] },
  { v: '1.31', date: 'November 2026', title: 'Alle Abschnitte und Griffe auf einen Blick', items: [
    'Akkorde stehen jetzt standardmäßig untereinander. Unter Einstellungen → Darstellung kannst du wieder „Nebeneinander“ wählen, einzelne Songs abweichend im Song unter ••• → Darstellung & Tonart.',
    'Abschnitts-Leiste: Alle Abschnitte sind immer gleichzeitig zu sehen, seitliches Wischen entfällt. Passen die Namen nicht, stehen dort Kürzel wie St1, Ch oder Br, bei sehr vielen Abschnitten gibt es eine zweite Reihe. So springst du mit einem Tipp vom Ende zum Anfang.',
    'Fixierte Griffe brechen jetzt um und werden so weit kleiner, dass alle gleichzeitig zu sehen sind. Antippen zeigt einen Griff weiterhin groß.',
    'Vereinfacht anzeigen: Unter ••• → Darstellung & Tonart lassen sich die Akkorde jetzt auch nur für die Anzeige vereinfachen, zusammen mit einer anderen Tonart oder einem anderen Capo. Dort schlägt Sorell auch einen Capo vor, wenn der Song damit leichter zu greifen ist.',
    'Wurde ein Song transponiert oder vereinfacht, steht das jetzt in seinen Angaben, zum Beispiel „Transponiert +2 · Vereinfacht“, auch im PDF und beim Teilen als Text. Das gilt auch, solange du es nur anzeigst, und für Akkorde aus KI-Vorschlägen.',
    'Nur-Anzeige: Akkorde ohne hinterlegten Griff fehlen nicht mehr in der Griffleiste, dort steht jetzt „kein Griff“.',
    'Musiktheorie erklärt deinen Song: Öffnest du sie im Song, zeigt der neue Bereich „Song“ die Tonart, jeden Abschnitt in Stufen (I, V, vi, IV), was jeder Akkord tut und die Solo-Töne am Griffbrett.',
    'Musiktheorie für die Ukulele: Tonleitern lassen sich jetzt auch hier einzeln als Griff-Positionen zeigen, und unter „Akkorde“ gibt es Barré- und Powerchords mit A- und G-Form.',
  ] },
  { v: '1.30', date: 'November 2026', title: 'Richtige Tonnamen, mehr Platz beim Spielen', items: [
    'Akkorde nebeneinander: Eine Folge steht jetzt platzsparend in einer Zeile. Unter Einstellungen → Darstellung kannst du wieder „Untereinander“ wählen, einzelne Songs abweichend im Song unter ••• → Darstellung & Tonart.',
    'Abschnitte schneller wechseln: In der Leiste unten ist jeder Abschnitt direkt antippbar, der aktuelle ist markiert und rückt in die Mitte. Weite Sprünge gehen sofort.',
    'Transponieren nimmt jetzt die Tabs mit: Bünde und Akkordnamen rücken mit. Passt ein Tab nicht mehr aufs Griffbrett, wandert er um eine Oktave. Abschaltbar.',
    'Nur anzeigen: Unter ••• → Darstellung & Tonart siehst du den Song in einer anderen Tonart oder mit anderem Capo, ohne ihn zu ändern.',
    'Metronom: im Song unter •••, mit Tempo antippen. Die Taktart kommt aus dem Song.',
    'Tabs wachsen mit der Textgröße. Der Anschlag über den Akkorden ist besser zu sehen. Im Querformat bleibt mehr Platz für den Song.',
    'Akkorde ohne Griff erscheinen als „Griff fehlt“, ein Tipp legt ihn an.',
    'Schrift: Unter Einstellungen → Darstellung gibt es jetzt Gemischt (Überschriften in der Systemschrift, Texte in Serif), System und Serif.',
    'Musiktheorie korrigiert: Töne heißen jetzt richtig (C E♭ G statt C D♯ G, C♯m statt D♭m, E♯ in F♯-Dur), die Andalusische Folge endet auf Dur, „Blue Note“ steht nur noch beim Blues.',
    'Musiktheorie übersichtlicher: feste Grundton-Knöpfe, erst das Griffbrett und dann die Erklärung, Tabellen eingeklappt. Neu: Solo je Abschnitt und, mit Capo, Umschalten zwischen gegriffener und klingender Tonart. Moll steht im Text als „Bm“, damit es nicht mit B♭ verwechselt wird.',
    'Weniger Text: Hilfen in den Editoren stehen nur beim ersten Mal da, danach hinter „?“. Viele Hinweise sind kürzer.',
    'Behoben: Im Tab-Editor hängt das h für Hammer-on nicht mehr vom Tempo ab. Akkorde in der Akkordfolge reagieren jetzt auch auf Mausklicks. Der Backup-Hinweis verdeckt die Menütaste nicht mehr, die Stimmung im Stimmgerät wird nicht mehr abgeschnitten, und graue Texte sind im hellen Modus besser lesbar.',
  ] },
  { v: '1.29', date: 'November 2026', title: 'Neuer Sync, einheitliches Design', items: [
    'Sync: Geräte einmal per Code koppeln, danach reicht ein Tipp auf „Mit iPad synchronisieren“. Auf dem anderen Gerät muss nur Einstellungen → Sync geöffnet sein. Beim ersten Mal auf dem neuen Stand vergleicht Sorell alles einmal gründlich.',
    'Sync versteht jetzt, wer was geändert hat: Hat nur ein Gerät etwas geändert, wird es übernommen. Haben beide am selben Song gearbeitet, werden Titel, Favorit, Ordner und jeder Abschnitt einzeln zusammengeführt. Du wirst nur gefragt, wenn beide denselben Teil verschieden geändert haben. Auch Löschungen kommen jetzt auf dem anderen Gerät an.',
    'Zuletzt gelöscht: Gelöschte Songs bleiben 30 Tage wiederherstellbar, und direkt nach dem Löschen gibt es „Rückgängig“. Du findest sie im Menü ••• der Startseite und in den Einstellungen.',
    'Beim Spielen: Griffe und Akkorde öffnen sich mit einem einfachen Tipp groß. Die Abschnitts-Leiste ist neu: große Pfeile für voriger und nächster Abschnitt, in der Mitte der aktuelle mit „Weiter: Chorus“. Ein Tipp darauf zeigt alle Abschnitte. In Setlisten sitzt das Blättern zwischen Songs in derselben Leiste.',
    'Sorell merkt sich, wo du warst: Die Songliste bleibt beim Zurückkommen an ihrer Stelle, ein Song öffnet dort, wo du aufgehört hast.',
    'Teilen als Text oder ChordPro: im Song unter ••• → Teilen, zum Beispiel für die Band.',
    'Tab-Editor im Querformat: Tab links, Tasten rechts.',
    'Startseite: Ordner als Pillen, mehr Platz für Songs, in den Zeilen Tonart und Capo statt der Uhrzeit.',
    'Einheitliches Design nach den Apple-Richtlinien: Bedienelemente stehen jetzt immer in der Systemschrift, Songtitel und Texte in deiner gewählten Schrift. Einstellungen und Backups sind aufgeräumt, Unterseiten gleiten von rechts herein.',
    'Behoben: Anschläge und Akkordnamen im Tab gingen beim Import und Wiederherstellen von Backups verloren.',
  ] },
  { v: '1.28', date: 'November 2026', title: 'Akkorde und Anschlag im Tab', items: [
    'Tab-Editor: Über den Zifferntasten steht jetzt eine Akkordleiste – zuerst die Griffe deines Songs, dann gängige Akkorde, mit „…“ die ganze Bibliothek. Antippen setzt den Akkord als Spalte, sein Name steht über dem Tab.',
    'Anschlag im Tab: „⊓ ab“ und „V auf“ setzen einen senkrechten Pfeil neben den Akkord (Abschlag zeigt nach oben – von der tiefen Saite unten zur hohen oben), darunter ⊓ bzw. V. Der Griff muss nur einmal im Tab stehen: Anschläge an leeren Stellen schlagen ihn erneut an – z. B. G antippen, dann ab, ab, auf, auf, ab, auf. Beim Abspielen klingt das geschrammt, im PDF steht es mit. ⌫ entfernt einen Anschlag.',
    'Rhythmus ist jetzt eine Taste: Sie zeigt den Notenwert der Position, Antippen öffnet die Auswahl (Halbe bis Sechzehntel, automatisch, entfernen).',
  ] },
  { v: '1.27', date: 'November 2026', title: 'Soli und Akkorde verstehen', items: [
    'Solo über deinen Song: Unter „Tonleitern“ schlägt Sorell die passende Pentatonik vor. Tippe einen Akkord an – seine Zieltöne (Grundton, Terz, Quinte) leuchten, Akkordtöne außerhalb der Tonleiter sind gestrichelt.',
    'Geborgte Akkorde: Unter „Tonarten“ steht bei jedem Akkord deines Songs, ob er zur Tonart gehört, geborgt ist (z. B. ♭VII aus Moll) oder eine Zwischendominante ist. Im Quintenzirkel sind sie gestrichelt markiert.',
    'Neu „Akkorde“: Akkord-Baukasten mit Formeln (1 3 5, 1 ♭3 5 …), alle Akkordtöne am Hals, Barré- und Powerchords mit E- und A-Form.',
    'Alle Modi (Lydisch bis Lokrisch) und „Alle Töne“ am Griffbrett, Töne der Tonart, Capo-Tabelle und CAGED-Tabelle „Form verschieben“.',
    'iPad und PC: Abschnitte nebeneinander oder untereinander – einstellbar unter Einstellungen → Darstellung.',
    'Griffe zeichnen ohne Namen: Gibt es den gezeichneten Griff schon (z. B. Am), schlägt Sorell ihn vor – „Am verwenden“ übernimmt ihn, ohne einen neuen Griff anzulegen. So kannst du einen neuen Song mit „+ Griff“ beginnen; die Griffe werden dann in den Abschnitten zuerst vorgeschlagen.',
    'Akkordfolgen lassen sich benennen (z. B. „Teil A“, „Übergang“) – praktisch, wenn ein Abschnitt mehrere Folgen hat. Beim Bearbeiten im Menü ••• der Akkordfolge → „Benennen …“.',
  ] },
  { v: '1.26', date: 'November 2026', title: 'Musiktheorie', items: [
    'Neu: Musiktheorie – im Song unter ••• → „Tonart & Musiktheorie“ (mit der Tonart deines Songs) oder auf der Startseite unter •••.',
    'Quintenzirkel zum Antippen: zeigt die Akkorde einer Tonart als Griffbilder (I–vii°), typische Akkordfolgen („+“ übernimmt sie in den Song) und einen Capo-Rechner, welche leichten Griffe mit welchem Capo passen.',
    'Die Tonart deines Songs wird aus den Akkorden erkannt – mit Capo auch, wie er klingt.',
    'Tonleitern auf dem Griffbrett: Pentatonik, Blues, Dur, Moll, Modi – mit Stufen oder Tönen, auf der Gitarre auch einzeln als Positionen 1–5.',
    'CAGED: die fünf Griffformen jedes Dur- und Moll-Akkords am Hals, für Gitarre und Ukulele.',
  ] },
  { v: '1.25', date: 'November 2026', title: 'Import aus Dateien, aufgeräumtes KI-Menü', items: [
    'Dateien öffnen: ChordPro (.cho, .chopro, .pro), OnSong, Text – auch mehrere auf einmal, jede wird ein eigener Song. Griffe aus ChordPro ({define: …}) werden als eigene Griffe übernommen.',
    'Von Ultimate Guitar kopierter Text wird zum Akkord-Sheet: je Abschnitt die Akkordfolge (Wiederholungen als ×2), ohne Liedtext. Griff-Listen wie „G 320033“ werden eigene Griffe des Songs, wenn sie vom Standard abweichen. Liedtext gibt es auf Wunsch unter Optionen.',
    'PDFs (Akkordblätter, Songbooks) liest die KI unter „Foto & Video“ aus.',
    'Neuer Song / KI-Idee aufgeräumt: erst das Instrument, dann wählen, was entstehen soll (Akkorde, Riff/Tab, ganzer Song, Anschlag), Beschreibung mit Beispielen zum Antippen.',
    'Synchronisieren steht jetzt ganz oben in den Einstellungen.',
  ] },
  { v: '1.24', date: 'November 2026', title: 'Besser auf dem iPad', items: [
    'iPad quer: Die Songliste steht links neben dem geöffneten Song – wie bei Apple Notizen. Mit Suche, antippen wechselt direkt den Song. Ein- und ausblenden mit dem Listen-Knopf oben links.',
    'Auf dem iPad sind Schrift, Griffbilder und Tabs größer.',
    'Zwei Spalten wie in einer Zeitung: links der Reihe nach von oben nach unten, dann rechts weiter – beide Spalten etwa gleich lang, auch mit Seitenleiste, sobald der Platz reicht.',
    'Abschnitte mit langem Tab (z. B. Solos) stehen immer über die volle Breite, damit der Tab nicht so klein wird wie am Handy.',
  ] },
  { v: '1.23', date: 'November 2026', title: 'Tabs abspielen, iPad-Ansicht, Let Ring', items: [
    'Tabs abspielen: „Abspielen“ neben jedem Tab. Ein Cursor läuft mit, Tempo aus dem Song, langsamer/schneller (25 % bis 150 %) und Schleife. Hammer-ons, Slides, Bends, Vibrato, Palm Mute und Dead Notes sind zu hören.',
    'Im Tab-Editor spielt ▶ ab dem Cursor – mit „Auswahl“ die markierte Stelle in Schleife.',
    'iPad quer und PC: Beim Spielen stehen die Abschnitte in zwei Spalten nebeneinander.',
    'Neue Technik „Let Ring“ (Taste L.R.): Töne ausklingen lassen, wird über dem Tab angezeigt, im PDF gedruckt und beim Abspielen berücksichtigt.',
    'Tipp: Ist kein Ton zu hören, den Stummschalter am iPhone prüfen.',
  ] },
  { v: '1.22', date: 'Oktober 2026', title: 'Rhythmus im Tab', items: [
    'Unter Tabs können jetzt Notenhälse mit Balken stehen – wie in Noten: Viertel, Achtel (ein Balken), Sechzehntel (zwei Balken), Halbe.',
    'Tab-Editor: neue Reihe „Rhythmus“. Position wählen und 1/2, 1/4, 1/8 oder 1/16 tippen – danach springt der Cursor zur nächsten Note. Mit „Auswahl“ für mehrere Noten auf einmal.',
    '„Auto“ setzt die Notenwerte des Takts aus den Abständen der Noten; für den ganzen Tab unter •••.',
    'Der Rhythmus erscheint auch im PDF.',
  ] },
  { v: '1.21', date: 'Oktober 2026', title: 'Noten verschieben, Suche repariert', items: [
    'Tab-Editor: Noten gedrückt halten und an die richtige Stelle ziehen – auf eine andere Saite oder Position. Mit „Auswahl“ verschiebst du mehrere Noten auf einmal. Liegt am Ziel schon eine Note, tauschen beide den Platz.',
    'Die Suche in der Songliste bricht nicht mehr nach jedem Buchstaben ab.',
    'Browser-Gesten sind aus: kein Zoomen, kein Ziehen zum Neuladen, kein Wischen für Vor/Zurück, kein Kontextmenü bei langem Drücken.',
  ] },
  { v: '1.20', date: 'Oktober 2026', title: 'Nur ausgewählte Songs synchronisieren', items: [
    'Beim Synchronisieren stellst du pro Gerät ein, was gesendet wird: alles, nur ausgewählte Songs oder nichts (nur empfangen).',
    'Direkt senden: in der Mehrfachauswahl „An anderes Gerät senden …“, bei einem Song unter Teilen → „An anderes Gerät (Sync)“.',
    'Mitgesendet werden die Tabs, eigenen Griffe und auf Wunsch Fotos und Aufnahmen dieser Songs.',
    'Die Abschnitts-Leiste beim Spielen zeigt jetzt immer alle Abschnitte auf einmal (bei vielen in mehreren Reihen) – kein Wischen mehr.',
  ] },
  { v: '1.19', date: 'Oktober 2026', title: 'Tabs übersichtlich, schneller schreiben', items: [
    'Beim Spielen: unten eine Leiste mit allen Abschnitten – antippen springt direkt dorthin. Abschaltbar unter ••• → Schrift- und Griffgröße.',
    'Lange Tabs brechen in Zeilen um, statt seitlich zu scrollen. Hammer-on, Pull-off und Slides sind deutlicher, darunter steht, was die Zeichen bedeuten.',
    'Die KI schreibt Tabs jetzt Note für Note statt als Textgrafik – dadurch verrutschen keine Töne mehr auf falsche Saiten oder Positionen.',
    'Tab-Editor: „Auto →“ springt nach jeder Note weiter, ganze Akkorde als Spalte einfügen, Tabs als Text bearbeiten oder aus dem Internet einfügen (unter •••).',
    'Neuer Song: Gerüst mit einem Tipp (z. B. Verse · Chorus) oder alles als Text schreiben. „+ Abschnitt“ bietet „Wie Chorus“ an – Akkorde und Tabs werden übernommen, Strophen werden durchnummeriert.',
    'Versehentliches Zoomen mit zwei Fingern ist gesperrt.',
  ] },
  { v: '1.18', date: 'Oktober 2026', title: 'Weniger Notizen, Backup-Hinweis', items: [
    'Text-Import und KI setzen Hinweise als Funktion um statt als Notiz: „x2“ wird zur Wiederholung, „Chorus x2“, „Strophe 2 wie Strophe 1“, „Refrain wiederholen“ und „wie oben, aber gezupft“ übernehmen Akkorde und Tabs des Vorbilds.',
    'Tabs können wiederholt werden („2× spielen“) – im Menü des Tabs.',
    'Zeichenerklärungen und „Tab:“-Beschriftungen landen nicht mehr als Notiz, Capo und Tempo aus KI-Notizen kommen in ihre Felder.',
    'Backup-Erinnerung, sobald Songs in keiner Backup-Datei stecken. Vor dem Löschen der App: Hinweis in den Einstellungen.',
  ] },
  { v: '1.17', date: 'Oktober 2026', title: 'Aufgeräumte Menüs und Vibration', items: [
    'Das Menü im Song zeigt nur, was gerade passt: beim Ansehen Schriftgröße, Display, Stimmgerät, Transponieren und Teilen – beim Bearbeiten Details, Ergänzen, KI und Löschen.',
    'Alle Menüs mit Symbolen und kürzer; Seltenes (Teilen, Import) steckt in kleinen Untermenüs.',
    'Kurze Vibration beim Tippen auf Knöpfe, in Menüs und beim Doppeltipp auf Akkorde (iPhone ab iOS 18). Abschaltbar unter Einstellungen → Darstellung.',
    'Alte Notizen wie „Spielweise: …“ stehen jetzt als Anschlag über den Akkorden.',
  ] },
  { v: '1.16', date: 'Oktober 2026', title: 'Übersichtlicher und mehr wie eine App', items: [
    'Akkorde stehen immer untereinander – daneben, was bei jedem Akkord gespielt wird.',
    'Das eigene Anschlagmuster-Feld ist weg: Der Anschlag steht jetzt als Text über den Akkorden („DDU UDU“). Alte Songs wurden automatisch umgestellt, vorher wurde eine Sicherung angelegt.',
    'Wiederholungen je Akkord („×2“) sind ein eigenes Feld statt Text.',
    'KI und Text-Import nutzen alle Funktionen: Capo, Wiederholungen, Spielweise, Griffe und Tabs landen im passenden Feld.',
    'Aufgeräumte Kopfzeile: nur noch Zurück-Pfeil und ein Menü. Bearbeiten, Darstellung, Display anlassen und Stimmgerät findest du unter •••.',
    'Vom linken Rand nach rechts wischen führt zurück zur Songliste.',
    'Spürbares Feedback beim Tippen (iPhone ab iOS 18) und weichere Animationen.',
  ] },
  { v: '1.15', date: 'Oktober 2026', title: 'Hit und Mute', items: [
    'Neue Schläge „Hit“ (H) und „Mute“ (M/X).',
  ] },
  { v: '1.14', date: 'Oktober 2026', title: 'KI liest dein Notizbuch', items: [
    'KI und Text-Import erkennen Spielweisen je Akkord und legen gezeichnete Griffe als eigene Griffe des Songs an.',
    'Griffe als Text: „Griff Abm: 4 3 4 2“.',
  ] },
  { v: '1.13', date: 'Oktober 2026', title: 'Spielweise je Akkord', items: [
    'Zu jedem Akkord kannst du notieren, wie er gespielt wird, z. B. „P(1,3,4) – P2“.',
  ] },
  { v: '1.12', date: 'Oktober 2026', title: 'Akkordfolgen direkt bearbeiten', items: [
    'Akkordfolge antippen: ersetzen, verschieben (auch per Ziehen), einfügen und entfernen – ohne extra Fenster.',
    '„+“ am Ende eines Abschnitts fügt Akkorde, Tab oder Notiz direkt ein.',
    'Doppeltipp auf einen Akkord zeigt das Griffbild groß.',
    'Fenster lassen sich nach unten wegwischen, Liquid-Glass-Optik, interaktive Einführung, helles App-Symbol.',
  ] },
];

export function openNews() {
  const body = h('div', { class: 'news' }, NEWS.map((n, i) => h('section', { class: 'news-item' + (i === 0 ? ' latest' : '') },
    h('div', { class: 'news-head' }, h('span', { class: 'news-v' }, 'Version ' + n.v), h('span', { class: 'news-date' }, n.date)),
    h('h3', { class: 'news-title' }, n.title),
    h('ul', { class: 'news-list' }, n.items.map((t) => h('li', null, icon('check', 'small'), h('span', null, t)))))));
  return sheet({ title: 'Neuigkeiten', body, full: true, right: { label: 'Fertig', bold: true } });
}

// Einmal nach einem Update zeigen; bei der ersten Installation nur merken
export async function showNewsOnce(isFirstRun) {
  const seen = await db.getSetting('newsSeen', null);
  if (seen === NEWS[0].v) return;
  await db.setSetting('newsSeen', NEWS[0].v);
  if (seen || !isFirstRun) openNews();
}
