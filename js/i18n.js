// Sprache der Oberfläche: Deutsch (Quelltexte im Code) oder Englisch (Wörterbuch i18n-en.js).
// Gewählt beim ersten Start oder in den Einstellungen; ein Wechsel lädt die App neu, damit alle Texte passen.
// tr('Text mit {0}', wert): übersetzt den deutschen Text und setzt die Werte ein.
const KEY = 'gn-lang';
let stored = null;
try { stored = localStorage.getItem(KEY); } catch { /* ohne Speicher: Deutsch */ }

export const lang = stored === 'en' ? 'en' : 'de';
// Wurde schon einmal gewählt? (sonst fragt die App beim ersten Start)
export const langChosen = stored === 'en' || stored === 'de';
// Für Datum, Zahlen und Sortierung
try { document.documentElement.lang = lang; } catch { /* ohne DOM */ }
export const LOCALE = lang === 'en' ? 'en-GB' : 'de-DE';
export const COLLATE = lang === 'en' ? 'en' : 'de';

const dict = lang === 'en' ? (await import('./i18n-en.js')).default : null;
const has = Object.prototype.hasOwnProperty;

export function tr(key, ...args) {
  const s = dict && has.call(dict, key) ? dict[key] : key;
  // Wie ein Template-String: jeder Wert wird als Text eingesetzt (auch undefined/null)
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i]) : m)) : s;
}

export function setLang(v) {
  try { localStorage.setItem(KEY, v === 'en' ? 'en' : 'de'); } catch { /* egal */ }
}
// Sprache wechseln: speichern und neu laden
export function switchLang(v) {
  setLang(v);
  location.reload();
}
