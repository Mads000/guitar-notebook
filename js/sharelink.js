// Songs per Link teilen: Der Song (mit Tabs und eigenen Griffen) steckt komprimiert im Link hinter dem #.
// Was hinter dem # steht, schickt der Browser nie an einen Server – der Link ist eine Kopie zum Mitnehmen, kein Upload.
// Wer den Link öffnet, sieht die übliche Import-Vorschau (keine Duplikate, nichts wird überschrieben).
import { tr } from './i18n.js';
import { songsPayload } from './backup.js';
import { toast, sx, alertDialog } from './ui.js';

export const LINK_PREFIX = '#/import/';
// z = deflate-komprimiert, j = unkomprimiertes JSON (für Browser ohne CompressionStream)
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

function toB64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

// Nur, was der Empfänger braucht: keine Ordner, Favoriten oder Beispiel-Markierungen des Absenders
async function linkData(songs) {
  const p = await songsPayload(songs);
  p.songs = p.songs.map((s) => ({ ...s, folderId: null, favorite: false, sample: false }));
  p.folders = [];
  delete p.settings;
  return p;
}

export async function encodeSongs(songs) {
  const bytes = new TextEncoder().encode(JSON.stringify(await linkData(songs)));
  return canZip ? 'z' + toB64Url(await pipe(bytes, new CompressionStream('deflate-raw'))) : 'j' + toB64Url(bytes);
}

export async function decodeSongs(data) {
  const kind = data[0], bytes = fromB64Url(data.slice(1));
  if (kind === 'z') {
    if (!canZip) throw new Error(tr("Dieser Browser kann den Link nicht entpacken. Bitte Safari bzw. den Browser aktualisieren."));
    return JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'))));
  }
  if (kind === 'j') return JSON.parse(new TextDecoder().decode(bytes));
  throw new Error(tr("Der Link ist unvollständig oder stammt nicht von Plekto."));
}

export const appBase = () => location.origin + location.pathname;
export const isLocal = () => /^(localhost|127\.|192\.168\.|10\.|\[::1\])/.test(location.hostname) || location.protocol === 'file:';

// Link erzeugen und teilen (Teilen-Menü des Geräts), sonst kopieren
export async function shareSongLink(songs) {
  let url;
  try { url = appBase() + LINK_PREFIX + await encodeSongs(songs); } catch (e) { console.warn(e); toast(tr("Der Link konnte nicht erstellt werden.")); return; }
  if (isLocal()) {
    await alertDialog(tr("Link nur auf diesem Gerät"), sx(tr("Plekto läuft gerade nur auf diesem Computer (localhost). Andere können den Link erst öffnen, wenn Plekto im Internet liegt, z. B. auf GitHub Pages. Der Link wird trotzdem kopiert."), tr("Der Link funktioniert nur, wenn Plekto im Internet liegt. Er wird trotzdem kopiert.")));
  }
  const title = songs.length === 1 ? songs[0].title : tr("{0} Songs", songs.length);
  if (!isLocal() && navigator.share) {
    try { await navigator.share({ title: tr("{0} – Plekto", title), url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast(sx(tr("Link kopiert – zum Beispiel in eine Nachricht einfügen"), tr("Link kopiert"))); } catch { toast(tr("Kopieren ist hier nicht möglich.")); }
}
