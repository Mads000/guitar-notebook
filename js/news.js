// Neuigkeiten: was sich in den letzten Versionen geändert hat. Neueste zuerst.
// Nach einem Update erscheint der neue Eintrag einmal von selbst; danach unter Einstellungen → Über Sorell.
import * as db from './storage.js';
import { h, sheet, icon } from './ui.js';

export const NEWS = [
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
