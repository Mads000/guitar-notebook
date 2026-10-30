// Optionaler KI-Assistent über die Google-Gemini-API (Free Tier).
// Die Anfrage geht direkt vom Gerät an Google – ohne eigenen Server, ohne Zwischenspeicher.
// Gesendet wird nur, was der Nutzer ausdrücklich abschickt (Beschreibung, eingefügter Text oder Akkordliste).
// Ohne Schlüssel oder ohne Internet ist der Assistent aus; die App nutzt dann den lokalen Parser.
import * as db from './storage.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const KEY_URL = 'https://aistudio.google.com/apikey';
const TIMEOUT = 60000, TIMEOUT_VIDEO = 180000;

let cfg = { key: '', model: DEFAULT_MODEL };
export async function loadAiConfig() {
  cfg = { key: (await db.getSetting('aiKey', '')) || '', model: (await db.getSetting('aiModel', DEFAULT_MODEL)) || DEFAULT_MODEL };
  return cfg;
}
export const aiConfig = () => ({ ...cfg });
export async function setAiKey(key) { cfg.key = String(key || '').trim(); await db.setSetting('aiKey', cfg.key); }
export async function setAiModel(model) { cfg.model = String(model || '').trim() || DEFAULT_MODEL; await db.setSetting('aiModel', cfg.model); }

// ---------- Verbrauch ----------
// Google liefert pro Antwort die verbrauchten Token (usageMetadata), aber KEIN verbleibendes Kontingent.
// Anfragen werden daher nur lokal auf diesem Gerät gezählt; Token-Summen beruhen auf den Angaben von Google.
let usage = null;
const today = () => new Date().toISOString().slice(0, 10);
export async function loadAiUsage() {
  usage = (await db.getSetting('aiUsage', null)) || {};
  if (usage.day !== today()) Object.assign(usage, { day: today(), requests: 0, tokens: 0 });
  return { ...usage };
}
export const aiUsage = () => ({ ...(usage || {}) });
async function record(res, data, err) {
  if (!usage) await loadAiUsage();
  if (usage.day !== today()) Object.assign(usage, { day: today(), requests: 0, tokens: 0 });
  usage.requests = (usage.requests || 0) + 1;
  usage.totalRequests = (usage.totalRequests || 0) + 1;
  const t = Number(data?.usageMetadata?.totalTokenCount) || 0;
  usage.tokens = (usage.tokens || 0) + t;
  usage.totalTokens = (usage.totalTokens || 0) + t;
  if (res?.ok) { usage.lastOkAt = new Date().toISOString(); usage.lastError = ''; }
  else { usage.lastErrorAt = new Date().toISOString(); usage.lastError = err || `Fehler ${res?.status || ''}`; }
  if (res?.status === 429) usage.rateLimitedAt = new Date().toISOString();
  try { await db.setSetting('aiUsage', usage); } catch { /* Zählung ist nicht kritisch */ }
}

export const hasKey = () => !!cfg.key;
export const isOnline = () => navigator.onLine !== false;
// Grund, warum die KI gerade nicht verfügbar ist (oder null)
export function aiUnavailable() {
  if (!cfg.key) return 'Kein Gemini-Schlüssel eingetragen (Einstellungen → KI-Assistent).';
  if (!isOnline()) return 'Keine Internetverbindung.';
  return null;
}

export class AiError extends Error {}

function explain(status, msg = '') {
  const m = msg.toLowerCase();
  if (status === 400 && /youtube|video|file_uri|fileuri/.test(m)) return 'Das Video konnte nicht abgerufen werden. Es funktionieren nur öffentliche YouTube-Videos ohne Altersbeschränkung.';
  if ((status === 400 || status === 413) && /payload|too large|size/.test(m)) return 'Die Fotos sind zusammen zu groß. Bitte weniger Fotos auf einmal senden.';
  if (status === 400 && m.includes('api key')) return 'Der Gemini-Schlüssel ist ungültig. Bitte prüfe ihn in den Einstellungen.';
  if (status === 401 || status === 403) return 'Der Schlüssel wurde abgelehnt (keine Berechtigung). Bitte prüfe ihn in Google AI Studio.';
  if (status === 404) return `Das Modell „${cfg.model}“ ist nicht verfügbar. Wähle in den Einstellungen unter „Modell“ ein anderes (Modelle laden).`;
  if (status === 429) return 'Das kostenlose Kontingent ist gerade ausgeschöpft. Warte kurz (oder bis morgen) und versuche es erneut.';
  if (status >= 500) return 'Der Gemini-Dienst ist gerade nicht erreichbar. Bitte später erneut versuchen.';
  return msg || `Fehler ${status}`;
}

async function call(path, { method = 'GET', body, key = cfg.key, timeout = TIMEOUT } = {}) {
  if (!key) throw new AiError('Kein Gemini-Schlüssel eingetragen.');
  if (!isOnline()) throw new AiError('Keine Internetverbindung.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  const send = () => fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: body ? JSON.stringify(body) : undefined,
    signal: ctl.signal,
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  let res;
  try {
    try {
      res = await send();
    } catch (e) {
      // Kurze Funkaussetzer (iPhone wechselt WLAN/Mobilfunk): einmal automatisch wiederholen
      if (e.name === 'AbortError') throw e;
      await new Promise((r) => setTimeout(r, 1200));
      res = await send();
    }
  } catch (e) {
    record(null, null, e.name === 'AbortError' ? 'Zeitüberschreitung' : 'Keine Verbindung');
    throw new AiError(e.name === 'AbortError'
      ? 'Die KI hat zu lange gebraucht. Bitte erneut versuchen.'
      : `Keine Verbindung zu Google Gemini (${e.message || e.name}). Prüfe die Internetverbindung oder wähle unter „Modell“ ein anderes, stabiles Modell (ohne „Preview“).`);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* leer */ }
  await record(res, data, res.ok ? '' : explain(res.status, data?.error?.message || ''));
  if (!res.ok) throw new AiError(explain(res.status, data?.error?.message || ''));
  return data;
}

// Strukturierte Antwort (JSON nach Schema) erzeugen.
// media: zusätzliche Teile vor dem Text, z. B. imagePart(...) oder youtubePart(...)
export async function generateJSON({ system, prompt, schema, temperature = 0.4, media = [] }) {
  const video = media.some((p) => p.fileData);
  const generationConfig = { temperature, responseMimeType: 'application/json', responseSchema: schema };
  // Videos in niedriger Auflösung: spart viel vom kostenlosen Kontingent (ca. 100 statt 300 Token pro Sekunde)
  if (video) generationConfig.mediaResolution = 'MEDIA_RESOLUTION_LOW';
  const data = await call(`/models/${encodeURIComponent(cfg.model)}:generateContent`, {
    method: 'POST',
    timeout: video ? TIMEOUT_VIDEO : TIMEOUT,
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [...media, { text: prompt }] }],
      generationConfig,
    },
  });
  if (data?.promptFeedback?.blockReason) throw new AiError('Die Anfrage wurde von Google blockiert. Bitte formuliere sie anders.');
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw new AiError(cand?.finishReason === 'SAFETY' || cand?.finishReason === 'RECITATION'
    ? 'Google hat die Antwort zurückgehalten (z. B. geschützter Liedtext). Bitte formuliere die Anfrage anders.'
    : 'Die KI hat keine Antwort geliefert. Bitte erneut versuchen.');
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AiError('Die Antwort der KI war unvollständig. Bitte erneut versuchen.');
  }
}

// Verfügbare Modelle für den Schlüssel (nur Textmodelle mit generateContent)
export async function listModels(key = cfg.key) {
  const data = await call('/models?pageSize=200', { key });
  const skip = /embed|tts|image|imagen|veo|live|audio|aqa|learnlm|robotics|computer-use/i;
  return (data?.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && !skip.test(m.name))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }))
    .sort((a, b) => modelRank(a.id) - modelRank(b.id) || b.id.localeCompare(a.id, 'en', { numeric: true }));
}
// Reihenfolge: stabile Flash-Modelle zuerst, dann Flash-Lite, dann der Rest; Vorschau-/Testmodelle zuletzt
function modelRank(id) {
  const preview = /preview|exp|experimental|latest/i.test(id) ? 10 : 0;
  const kind = /flash-lite/i.test(id) ? 1 : /flash/i.test(id) ? 0 : 2;
  return preview + kind;
}

// Kurzer Verbindungstest mit minimaler Anfrage
export async function testKey(key) {
  const data = await call(`/models/${encodeURIComponent(cfg.model)}:generateContent`, {
    method: 'POST', key,
    body: { contents: [{ role: 'user', parts: [{ text: 'Antworte nur mit: OK' }] }], generationConfig: { temperature: 0 } },
  });
  return !!data?.candidates?.length;
}

// ---------- Bilder und YouTube-Links ----------
export const imagePart = (base64, mimeType = 'image/jpeg') => ({ inlineData: { mimeType, data: base64 } });
export const youtubePart = (url) => ({ fileData: { fileUri: url } });

// Normalisiert YouTube-Links (watch, youtu.be, shorts, embed, live, mobil) auf https://www.youtube.com/watch?v=ID
export function youtubeUrl(text) {
  let u;
  try { u = new URL(String(text || '').trim()); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = '';
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
    else id = (u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/) || [])[1] || '';
  }
  return /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

// ---------- Schemas und Aufgaben ----------
const S = (type, extra = {}) => ({ type, ...extra });
const STR = S('STRING'), INT = S('INTEGER');

export const SONG_SCHEMA = S('OBJECT', {
  properties: {
    title: STR, artist: STR, key: STR, capo: INT, bpm: INT, timeSig: STR, notes: STR,
    sections: S('ARRAY', {
      items: S('OBJECT', {
        properties: {
          name: STR,
          chords: S('ARRAY', { items: STR }),
          steps: S('ARRAY', { items: S('OBJECT', { properties: { chord: STR, play: STR, repeat: INT }, required: ['chord'] }) }),
          repeat: INT,
          strum: STR,
          lyrics: STR,
          tabName: STR,
          tabBars: S('ARRAY', { items: STR }),
          tab: S('ARRAY', { items: STR }),
          tabRepeat: INT,
          sameAs: STR,
          comment: STR,
        },
        required: ['name'],
      }),
    }),
    shapes: S('ARRAY', { items: S('OBJECT', { properties: { name: STR, frets: STR, fingers: STR }, required: ['name', 'frets'] }) }),
  },
  required: ['sections'],
});

const instText = (inst) => (inst === 'ukulele'
  ? 'Ukulele (4 Saiten, Stimmung G C E A, re-entrant). Im Tab: Saite 1 = A (oberste Zeile), 2 = E, 3 = C, 4 = G (unterste Zeile).'
  : 'Gitarre (6 Saiten, Standardstimmung E A D G B e). Im Tab: Saite 1 = hohe e (oberste Zeile), 2 = B, 3 = G, 4 = D, 5 = A, 6 = tiefe E (unterste Zeile).');

// Tabs gibt die KI als Schritte aus statt als ASCII: Beim ASCII verrutschen Ziffern leicht in eine falsche Spalte oder Zeile.
export const TAB_RULE = `- tabBars: Riffs, Melodien, Fills und Zupfmuster mit Bundangaben IMMER hier als Tab (nicht als Text). Ein Eintrag je Takt. Ein Takt = Zeitschritte in Spielreihenfolge, durch Leerzeichen getrennt; gleichmäßig (4/4 mit Achteln = 8 Schritte, mit Sechzehnteln = 16), gehaltene Töne und Pausen als "-".
  Ein Schritt = alle GLEICHZEITIG gespielten Noten, mit + verbunden. Eine Note = Saite-Bund, z. B. "3-2" = Saite 3, Bund 2. Saitennummern siehe Instrument (1 = oberste Tab-Zeile). x statt Bund = Dead Note.
  Technik direkt hinter dem Bund: h = Hammer-on und p = Pull-off zur NÄCHSTEN Note auf derselben Saite ("3-5h 3-7" = Hammer-on von 5 auf 7), / = Slide hoch, \\ = Slide runter (ebenfalls zur nächsten Note), b = Bend (b½, b, b2), ~ = Vibrato.
  Beispiel Gitarre: ["6-0 - 6-3 - 5-0 5-2h 5-4 -", "4-2+3-2 - 2-3 - 1-0 - - -"].
  Tab aus einer Vorlage ablesen: Gehe Spalte für Spalte von links nach rechts. Ziffern genau übereinander = ein Schritt. Bestimme die Saite durch Abzählen der Linie von oben. Taktstriche | trennen die Einträge. Prüfe zum Schluss jede Note noch einmal gegen die Vorlage.`;

const FORMAT = `Antwortformat (JSON). Nutze IMMER das passende Feld – schreibe nie als Text, was ein Feld abbildet:
- title, artist, capo, bpm, timeSig, key: Angaben wie „Capo 7“, „Tempo 96“, „3/4“, „Tonart Am“ gehören hierhin, nie in Notizen.
- sections: Abschnitte in Spielreihenfolge, name z. B. "Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Riff", "Outro". „Verse / Chorus gleich“ → beide Abschnitte mit gleichem Inhalt.
- sameAs: Wird ein Abschnitt nur wiederholt („Refrain wiederholen“, „Strophe 2 wie Strophe 1“, „Outro wie Intro“), gib ihn als eigenen Abschnitt an mit sameAs = Name des Vorbilds und lass chords/steps/strum/tab weg – die App übernimmt sie. Nur abweichenden Liedtext angeben.
- chords: Akkordfolge des Abschnitts (z. B. ["Am","F","C","G"]). repeat = wie oft die GANZE Folge gespielt wird (statt „×2“ hinter der Folge).
- steps: STATT chords, sobald zu einzelnen Akkorden eine eigene Spielweise gehört (Anschlag wie "DDU UDU", Zupfen wie "P(1,3,4) – P2", Technik). Je Akkord ein Eintrag {chord, play, repeat}: play = Anweisung in der Schreibweise der Vorlage OHNE Wiederholungsangabe; repeat = wie oft dieser Akkord mit seiner Spielweise gespielt wird (aus „×2“, „x2“, „2x“ wird repeat 2, nicht Text). Beispiel: Vorlage „E DDX U ×2“ → {"chord":"E","play":"DDX U","repeat":2}.
- strum: Anschlag bzw. Spielweise, die für ALLE Akkorde des Abschnitts gleich ist, als kurzer Text in der Schreibweise der Vorlage, z. B. "DDU UDU" oder "P(G) D U UDU". Zeichen: D = Abschlag, U = Aufschlag, X oder M = Mute, H = Hit, P = Zupfen, - = Pause, > = Akzent. Gilt ein Muster je Akkord, nimm steps statt strum.
- shapes: Griffbilder nur für diesen Song. NUR angeben, wenn das Material einen Griff zeigt (z. B. gezeichnetes Griffdiagramm) oder einen vom Standard abweichenden Griff beschreibt. name = Akkordname wie in der Folge. frets = Bund je Saite von der tiefsten zur höchsten Saite, mit Leerzeichen getrennt, x = nicht gespielt, 0 = leer (Gitarre 6 Werte E A D G B e, z. B. "x 3 2 0 1 0"; Ukulele 4 Werte G C E A, z. B. "0 0 0 3"). Bei Griffdiagrammen: senkrechte Linien = Saiten (links die tiefste bzw. bei Ukulele G), waagerechte = Bünde, die Ziffern am Rand sind die Bundnummern. fingers optional im selben Format.
${TAB_RULE}
- tab: nur wenn ein ASCII-Tab wörtlich im eingefügten TEXT steht: dessen Zeilen unverändert kopieren (eine Zeile je Saite). Sonst immer tabBars.
- tabRepeat: wie oft der Tab gespielt wird („×2“ hinter dem Tab), statt es als Text zu schreiben.
- lyrics: nur echter Liedtext (mit Akkorden im ChordPro-Stil "[Am]Heute ist [F]der Tag"), Zeilen mit \\n trennen.
- comment und notes: möglichst leer lassen. Nur kurze Hinweise, die in KEIN Feld passen (z. B. „Am Ende ausklingen lassen“). Nie: Wiederholungen („×2“ → repeat/tabRepeat), Verweise („wie Chorus“ → sameAs), Anschlag (→ strum/steps), Capo/Tempo/Tonart (→ Felder), Quellen, Zusammenfassungen oder Erklärungen, was du gemacht hast. Nichts doppelt angeben.
- Leere Felder weglassen. Keine Erklärungen außerhalb des JSON. Deutsche Abschnitts- und Hinweistexte.`;

export function generatePrompt({ description, inst, kind }) {
  const what = {
    auto: 'Erzeuge, was zur Beschreibung passt (Akkordfolge mit Spielweise und/oder Tab).',
    chords: 'Erzeuge vor allem eine passende Akkordfolge (gern mit Anschlag in "strum" oder je Akkord in "steps").',
    strum: 'Erzeuge vor allem eine passende Spielweise bzw. ein Anschlagmuster ("strum" oder "steps") mit einer kurzen Akkordfolge zum Üben.',
    tab: 'Erzeuge vor allem einen spielbaren Tab (Riff, Melodie oder Arpeggio), 2 bis 8 Takte.',
    song: 'Erzeuge eine vollständige Song-Skizze mit mehreren Abschnitten (Intro, Verse, Chorus …), Akkorden und Spielweise.',
  }[kind] || '';
  return {
    system: `Du bist ein erfahrener Gitarren- und Ukulele-Lehrer. Instrument: ${instText(inst)}
Erzeuge einfache, gut spielbare und musikalisch stimmige Ergebnisse. Bundzahlen höchstens 15 (Ukulele) bzw. 17 (Gitarre).
Schreibe keine Liedtexte bekannter Songs ab; bei bekannten Songs höchstens Akkorde und kurze eigene Hinweise.
${FORMAT}`,
    prompt: `${what}\nBeschreibung: ${description}`,
  };
}

export function analyzePrompt({ text, inst }) {
  return {
    system: `Du wandelst unordentliche Notizen, Tutorials, Akkordblätter und Tabs in einen sauber strukturierten Song um. Instrument: ${instText(inst)}
Übernimm vorhandene Liedtexte, Akkorde und Tabs genau (nichts erfinden, nichts weglassen). Ordne alles den richtigen Abschnitten zu.
Erkenne Titel, Künstler, Capo, Tempo (bpm), Taktart, Tonart. Tipps und Hinweise aus dem Text gehören in "comment" des passenden Abschnitts oder in "notes".
Akkorde, die über einer Liedzeile stehen, setzt du im ChordPro-Stil in den Text. Wiederholte Abschnitte (z. B. zweiter Chorus) übernimmst du erneut mit ihrem Inhalt.
${FORMAT}`,
    prompt: `Text:\n"""\n${text.slice(0, 30000)}\n"""`,
  };
}

export function mediaPrompt({ inst, photos, video, hint }) {
  return {
    system: `Du wertest Fotos und/oder ein YouTube-Video aus und machst daraus einen strukturierten Song. Instrument: ${instText(inst)}
Fotos sind z. B. Akkordblätter, handschriftliche Notizen, Tabs, Songbook-Seiten oder Screenshots: Übernimm Akkorde, Tabs und Text genau so, wie sie zu sehen sind. Unleserliches markierst du mit [?], statt zu raten. Mehrere Fotos gehören zu einem Song, in der gegebenen Reihenfolge.
Handschriftliche Notizbuchseiten: Eine Zeile „Akkord + Buchstaben/Anweisung“ (z. B. „Abm DDX D ×2“, „F PPPP“) ist ein Eintrag in steps (mit repeat), „Strumming: DDU UDU“ unter einem Abschnitt ist strum, gezeichnete Griffkästchen sind shapes, gezeichnete Tabs sind tab. „Verse / Chorus“ bedeutet: beide Abschnitte gleich.
Ein Video ist meist ein Tutorial oder eine Aufführung: Notiere gezeigte und erklärte Akkorde, Griffe, Anschlagmuster, Riffs als Tab sowie wichtige Tipps mit Zeitangabe (mm:ss) im "comment" des Abschnitts. Liedtexte bekannter Songs aus Videos schreibst du nicht ab – nur Akkorde, Struktur und Hinweise.
Ist das Material für das andere Instrument (z. B. Gitarren-Tab, aber Ukulele gewählt), überträgst du Akkorde und Tabs sinnvoll und vermerkst das in "notes".
${FORMAT}`,
    prompt: [
      photos ? `${photos} ${photos === 1 ? 'Foto' : 'Fotos'} oben.` : '',
      video ? `YouTube-Video: ${video}` : '',
      hint ? `Hinweis des Nutzers: ${hint}` : '',
      'Erstelle daraus den Song.',
    ].filter(Boolean).join('\n'),
  };
}

export const REHARM_SCHEMA = S('OBJECT', {
  properties: {
    suggestions: S('ARRAY', {
      items: S('OBJECT', {
        properties: {
          title: STR,
          description: STR,
          map: S('ARRAY', { items: S('OBJECT', { properties: { from: STR, to: STR }, required: ['from', 'to'] }) }),
        },
        required: ['title', 'map'],
      }),
    }),
  },
  required: ['suggestions'],
});

export function reharmPrompt({ chords, inst, wish, key }) {
  return {
    system: `Du bist Harmonielehre-Experte für ${inst === 'ukulele' ? 'Ukulele' : 'Gitarre'}. Du schlägst Akkord-Alternativen für einen Song vor.
Jeder Vorschlag ersetzt Akkorde 1:1 über eine Zuordnung "map" (from = Akkord im Song, to = Ersatz). Nur Akkorde verwenden, die im Song vorkommen, als "from".
Liefere 2 bis 4 unterschiedliche Vorschläge, z. B. vereinfacht für Anfänger (offene Griffe, keine Barrés), voller klingend (Septimen, sus, add9) oder eine Variante mit Capo-freundlichen Griffen.
title kurz (max. 5 Wörter), description ein Satz auf Deutsch.`,
    prompt: `Akkorde im Song (Reihenfolge des Auftretens): ${chords.join(', ')}${key ? `\nTonart: ${key}` : ''}${wish ? `\nWunsch: ${wish}` : ''}`,
  };
}
