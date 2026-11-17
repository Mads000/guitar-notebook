// Backup per Mail – zusätzlich zum Backup als Datei. Sorell hat keinen Server und kann keine Mail selbst verschicken:
// Es erstellt das Backup und öffnet das Teilen-Menü mit der Datei, Betreff und Text (dort „Mail“ wählen).
// Die hinterlegte Adresse wird dabei in die Zwischenablage kopiert; iOS lässt den Empfänger nicht vorausfüllen.
// Ohne Teilen mit Dateien (manche PC-Browser): Datei herunterladen und das Mail-Programm mit Adresse und Betreff öffnen.
import * as db from './storage.js';
import { h, sheet, icon, toast, ask, actionSheet, confirmDialog, alertDialog, sx } from './ui.js';
import { exportBackupFile, markFileExported, describeCounts } from './backup.js';
import { mediaStats } from './media.js';

export const EMAIL_KEY = 'backupEmail';
// Viele Anbieter nehmen Anhänge bis etwa 20–25 MB an
const MAIL_LIMIT = 20 * 1048576;
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
const mb = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export const getBackupEmail = async () => (await db.getSetting(EMAIL_KEY, '')) || '';

// Adresse hinterlegen oder ändern; leer = entfernen. Gibt die neue Adresse zurück (oder null bei Abbruch).
export async function editBackupEmail() {
  const cur = await getBackupEmail();
  const v = await ask('E-Mail für Backups', {
    value: cur, placeholder: 'name@beispiel.de', ok: 'Sichern', autocapitalize: 'off',
    message: 'An diese Adresse schickst du dir Backups mit „Backup per Mail“. Sie bleibt auf diesem Gerät. Leer lassen, um sie zu entfernen.',
  });
  if (v == null) return null;
  const t = v.trim();
  if (t && !validEmail(t)) { await alertDialog('Adresse prüfen', `„${t}“ sieht nicht wie eine E-Mail-Adresse aus.`); return null; }
  await db.setSetting(EMAIL_KEY, t);
  toast(t ? 'E-Mail für Backups gespeichert' : 'E-Mail für Backups entfernt');
  return t;
}

export async function mailBackup() {
  let email = await getBackupEmail();
  if (!email) {
    email = await editBackupEmail();
    if (!email) return;
  }
  // Mit oder ohne Fotos und Aufnahmen – nur fragen, wenn es welche gibt
  const media = await mediaStats();
  let withMedia = false;
  if (media.count) {
    const pick = await actionSheet('Backup per Mail', [
      { label: 'Klein: ohne Fotos & Aufnahmen', sIcon: 'doc', value: 'small' },
      { label: `Komplett: mit ${media.count} ${media.count === 1 ? 'Foto/Aufnahme' : 'Fotos/Aufnahmen'} (ca. ${mb(media.bytes * 1.37)})`, sIcon: 'photo', value: 'full' },
    ]);
    if (!pick) return;
    withMedia = pick === 'full';
  }
  let file;
  try {
    toast('Backup wird erstellt …', 1200);
    file = await exportBackupFile({ media: withMedia });
  } catch (e) { alertDialog('Backup fehlgeschlagen', sx(`Die Sicherung konnte nicht erstellt werden: ${e.message || e}`, `${e.message || e}`)); return; }
  if (file.blob.size > MAIL_LIMIT) {
    const go = await confirmDialog('Backup ist groß', `Die Datei hat ${mb(file.blob.size)}. Viele Mail-Anbieter nehmen nur Anhänge bis etwa 20–25 MB an.${withMedia ? ' Ohne Fotos & Aufnahmen wird sie deutlich kleiner.' : ''}`, { ok: 'Trotzdem senden' });
    if (!go) return;
  }
  offerMail(file, email);
}

// Zweiter Schritt mit eigenem Knopf: Teilen braucht einen frischen Tipp (iOS), das Erstellen dauert zu lange dafür
function offerMail({ blob, filename, counts }, email) {
  const date = new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const subject = `Sorell-Backup ${date} – ${counts.songs} ${counts.songs === 1 ? 'Song' : 'Songs'}`;
  const text = `Backup von Sorell vom ${date}: ${describeCounts(counts)}.\n\nWiederherstellen: Die angehängte Datei in Sorell öffnen unter Einstellungen → Backups → „Backup oder Song-Datei importieren …“. Importieren führt zusammen und löscht nichts.`;
  const f = new File([blob], filename, { type: 'application/json' });
  let canShare = false;
  try { canShare = !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch { canShare = false; }
  const copyAddr = () => navigator.clipboard?.writeText(email).catch(() => {});
  const done = async () => { await markFileExported(); toast('Backup verschickt bzw. gesichert', 2500); s.close(); };

  const send = () => {
    copyAddr(); // nicht abwarten: Das Teilen muss direkt im Tipp starten
    // Nur Datei und Mailtext: Ein zusätzlicher Titel landet unter iOS als eigene Textdatei („In Dateien sichern“)
    navigator.share({ files: [f], text }).then(done).catch((e) => { if (e?.name !== 'AbortError') toast('Teilen nicht möglich – bitte „Herunterladen“ nutzen.', 3000); });
  };
  const fallback = () => {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text + '\n\n(Bitte die gerade heruntergeladene Datei ' + filename + ' anhängen.)')}`;
    markFileExported();
  };

  const body = h('div', null,
    h('div', { class: 'file-card' }, icon('mail'), h('div', { class: 'file-name' }, filename), h('div', { class: 'file-size' }, mb(blob.size))),
    h('div', { class: 'stack' },
      canShare && h('button', { class: 'btn primary block', onClick: send }, icon('mail'), 'Mail öffnen'),
      h('button', { class: 'btn block' + (canShare ? '' : ' primary'), onClick: fallback }, icon('download'), canShare ? 'Herunterladen und Mail-Programm öffnen' : 'Mail-Programm öffnen')),
    h('p', { class: 'hint', style: 'margin-top:14px;text-align:center' }, canShare
      ? `Im Teilen-Menü „Mail“ wählen. „Mail öffnen“ kopiert auch deine Adresse ${email} – im Feld „An“ einfügen oder aus den Vorschlägen wählen.`
      : `Die Datei wird heruntergeladen und dein Mail-Programm öffnet sich an ${email}. Hänge die Datei dort an.`));
  const s = sheet({ title: 'Backup per Mail', body, right: { label: 'Fertig', bold: true } });
}
