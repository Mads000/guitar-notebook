// Gerät-zu-Gerät-Synchronisation per Code (WebRTC über PeerJS).
// Ein Gerät stellt bereit und zeigt einen 6-stelligen Code, das andere gibt ihn ein. Die Daten gehen
// verschlüsselt direkt von Gerät zu Gerät; der öffentliche PeerJS-Dienst vermittelt nur den Verbindungsaufbau
// und speichert keine Songs. Beide Seiten führen über den normalen Merge-Import zusammen (mit Vorschau).
import * as db from './storage.js';
import { h, sheet, toast, alertDialog, confirmDialog, ask, toggle, formRow, icon, segmented } from './ui.js';
import { buildBackup, importRaw, songsPayload } from './backup.js';

const PREFIX = 'guitar-notebook-sync-';
const CONNECT_TIMEOUT = 20000;

function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/peerjs.min.js';
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('Sync-Modul fehlt.')));
    s.onerror = () => reject(new Error('Sync-Modul konnte nicht geladen werden.'));
    document.head.append(s);
  });
}

const ERRORS = {
  'peer-unavailable': 'Kein Gerät mit diesem Code gefunden. Ist der Code richtig und das andere Gerät noch auf „Bereitstellen“?',
  network: 'Keine Verbindung zum Vermittlungsdienst. Bitte Internetverbindung prüfen.',
  'server-error': 'Der Vermittlungsdienst ist gerade nicht erreichbar. Bitte später erneut versuchen.',
  'socket-error': 'Die Verbindung wurde unterbrochen.',
  'browser-incompatible': 'Dieser Browser unterstützt keine Direktverbindung (WebRTC).',
  'webrtc': 'Die direkte Verbindung kam nicht zustande. Am zuverlässigsten klappt es, wenn beide Geräte im selben WLAN sind.',
};
const explain = (e) => ERRORS[e?.type] || e?.message || String(e);

// songs: vorausgewählte Songs (z. B. aus der Mehrfachauswahl) – dann werden nur diese gesendet
export async function openSync({ onDone, songs: preset = null } = {}) {
  let peer = null, conn = null, timer = 0, closed = false, withMedia = false;
  // Was dieses Gerät sendet: alles, nur ausgewählte Songs oder nichts (nur empfangen)
  let what = preset?.length ? 'some' : 'all';
  const picked = new Set((preset || []).map((s) => s.id));
  let sent = false, received = null, imported = false;
  const status = h('div', { class: 'sync-status' });
  const codeBox = h('div', { class: 'sync-code' });

  const cleanup = () => {
    clearTimeout(timer);
    try { conn?.close(); } catch { /* egal */ }
    try { peer?.destroy(); } catch { /* egal */ }
    peer = conn = null;
  };
  const setStatus = (text, kind = '') => { status.className = 'sync-status ' + kind; status.replaceChildren(kind === 'busy' ? h('span', { class: 'spinner' }) : '', text); };
  const fail = (e) => { cleanup(); codeBox.replaceChildren(); setStatus(explain(e), 'error'); startBtns.hidden = false; };

  // Beide Seiten senden ihren Stand und führen den empfangenen Stand mit Vorschau zusammen.
  // Das bereitstellende Gerät beginnt erst nach seiner Bestätigung („hello“); das andere sendet erst danach,
  // damit nichts verloren geht, während die Bestätigungsfrage offen ist.
  const sendMine = async (c) => {
    try {
      let data;
      if (what === 'none') data = { kind: 'none' };
      else if (what === 'some') data = await songsPayload((await db.getAll('songs')).filter((s) => picked.has(s.id)), { media: withMedia });
      else data = await buildBackup({ media: withMedia });
      c.send({ type: 'backup', data });
    } catch (e) { fail(e); }
  };
  function exchange(c, host) {
    conn = c;
    clearTimeout(timer);
    setStatus(host ? 'Verbunden – Daten werden ausgetauscht …' : 'Verbunden – warte auf Bestätigung am anderen Gerät …', 'busy');
    c.on('data', async (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'hello' && !host) { setStatus('Verbunden – Daten werden ausgetauscht …', 'busy'); sendMine(c); }
      if (msg.type === 'backup') { received = msg.data; c.send({ type: 'ack' }); maybeImport(); }
      if (msg.type === 'ack') { sent = true; maybeImport(); }
    });
    c.on('close', () => { if (!imported && !closed && !received) setStatus('Das andere Gerät hat die Verbindung beendet.', 'error'); });
    c.on('error', fail);
    if (host) { c.send({ type: 'hello' }); sendMine(c); }
  }

  async function maybeImport() {
    if (!sent || !received || imported) return;
    imported = true;
    if (received.kind === 'none') { setStatus(what === 'none' ? 'Fertig – keines der Geräte hat etwas gesendet.' : 'Gesendet. Das andere Gerät zeigt seine Vorschau; von dort kam nichts zurück.', 'ok'); cleanup(); return; }
    setStatus('Daten empfangen. Bitte prüfe die Vorschau.', 'ok');
    const ok = await importRaw(received, { title: 'Synchronisieren', allowReplace: false });
    setStatus(ok ? 'Synchronisiert. Das andere Gerät zeigt seine eigene Vorschau.' : 'Nicht übernommen – auf diesem Gerät wurde nichts verändert.', ok ? 'ok' : '');
    cleanup();
    if (ok && onDone) onDone();
  }

  const ready = () => { if (what === 'some' && !picked.size) { toast('Wähle zuerst die Songs, die gesendet werden sollen.'); pickSongs(); return false; } return true; };

  async function provide() {
    if (!ready()) return;
    startBtns.hidden = true;
    setStatus('Code wird erstellt …', 'busy');
    try {
      const Peer = await loadPeer();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      peer = new Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => {
        codeBox.replaceChildren(h('div', { class: 'sync-code-label' }, 'Code für das andere Gerät'), h('div', { class: 'sync-code-num' }, code.slice(0, 3) + ' ' + code.slice(3)));
        setStatus('Warte auf das andere Gerät … Dieses Fenster offen lassen.', 'busy');
      });
      peer.on('connection', async (c) => {
        if (conn) { c.close(); return; }
        const okConn = await confirmDialog('Gerät verbinden?', 'Ein Gerät hat deinen Code eingegeben. Nur bestätigen, wenn du das selbst warst.', { ok: 'Verbinden' });
        if (!okConn) { c.close(); return; }
        codeBox.replaceChildren();
        if (c.open) exchange(c, true); else c.on('open', () => exchange(c, true));
      });
      peer.on('error', (e) => { if (e.type === 'unavailable-id') { cleanup(); provide(); } else fail(e); });
    } catch (e) { fail(e); }
  }

  async function join() {
    if (!ready()) return;
    const raw = await ask('Code eingeben', { placeholder: '6-stelliger Code', ok: 'Verbinden', message: 'Der Code steht auf dem Gerät, das „Bereitstellen“ gewählt hat.' });
    const code = (raw || '').replace(/\D/g, '');
    if (!code) return;
    if (code.length !== 6) { toast('Der Code hat 6 Ziffern.'); return; }
    startBtns.hidden = true;
    setStatus('Verbinde …', 'busy');
    try {
      const Peer = await loadPeer();
      peer = new Peer({ debug: 0 });
      peer.on('open', () => {
        const c = peer.connect(PREFIX + code, { reliable: true });
        c.on('open', () => exchange(c, false));
        c.on('error', fail);
        timer = setTimeout(() => fail({ type: 'webrtc' }), CONNECT_TIMEOUT);
      });
      peer.on('error', fail);
    } catch (e) { fail(e); }
  }

  const startBtns = h('div', { class: 'stack' },
    h('button', { class: 'btn primary block', onClick: provide }, icon('share', 'small'), 'Dieses Gerät bereitstellen'),
    h('button', { class: 'btn block', onClick: join }, icon('download', 'small'), 'Code eingeben'));

  // Auswahl der Songs, die dieses Gerät sendet
  const pickRow = h('button', { class: 'form-row action', onClick: () => pickSongs() });
  const drawPick = () => {
    pickRow.hidden = what !== 'some';
    pickRow.replaceChildren(icon('check'), h('span', { class: 'set-title' }, picked.size ? `${picked.size} ${picked.size === 1 ? 'Song' : 'Songs'} ausgewählt` : 'Songs auswählen …'), icon('chevron', 'small chev'));
  };
  async function pickSongs() {
    const all = (await db.getAll('songs')).sort((a, b) => a.title.localeCompare(b.title, 'de'));
    const search = h('input', { class: 'field search-field', type: 'search', placeholder: 'Suchen', autocomplete: 'off' });
    const list = h('ul', { class: 'list' });
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      list.replaceChildren(...all.filter((s) => !q || `${s.title} ${s.artist}`.toLowerCase().includes(q)).map((s) => h('li', { class: 'row selectable' + (picked.has(s.id) ? ' selected' : '') },
        h('button', { class: 'row-main', 'aria-pressed': String(picked.has(s.id)), onClick: () => { if (picked.has(s.id)) picked.delete(s.id); else picked.add(s.id); draw(); drawPick(); } },
          h('span', { class: 'row-check' }, picked.has(s.id) && icon('check', 'small')),
          h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, s.title), s.artist && h('div', { class: 'row-sub' }, s.artist))))));
    };
    search.addEventListener('input', draw);
    draw();
    sheet({ title: 'Songs zum Senden', body: h('div', null, search,
      h('div', { class: 'btn-row', style: 'margin:10px 0' },
        h('button', { class: 'btn small', onClick: () => { all.forEach((s) => picked.add(s.id)); draw(); drawPick(); } }, 'Alle'),
        h('button', { class: 'btn small', onClick: () => { picked.clear(); draw(); drawPick(); } }, 'Keine')),
      list), full: true, right: { label: 'Fertig', bold: true } });
  }
  drawPick();

  const body = h('div', null,
    h('p', { class: 'pane-intro' }, 'Auf einem Gerät „Bereitstellen“ wählen, auf dem anderen den angezeigten Code eingeben. Beide Geräte senden, was jeweils unten eingestellt ist, und führen es zusammen: Neues kommt dazu, Identisches wird übersprungen, nichts wird gelöscht. Bei Konflikten entscheidest du in der Vorschau.'),
    h('div', { class: 'form-label' }, 'Dieses Gerät sendet'),
    h('div', { class: 'seg-block' }, segmented([{ value: 'all', label: 'Alles' }, { value: 'some', label: 'Auswahl' }, { value: 'none', label: 'Nichts' }], what, (v) => { what = v; drawPick(); if (v === 'some' && !picked.size) pickSongs(); })),
    h('div', { class: 'form-group' }, pickRow,
      formRow('Fotos & Aufnahmen mitsenden', toggle(false, (v) => { withMedia = v; }), 'kann bei vielen Dateien lange dauern')),
    h('p', { class: 'form-foot' }, '„Nichts“ = dieses Gerät empfängt nur. Bei „Auswahl“ gehen nur diese Songs mit ihren Tabs und Griffen raus.'),
    h('div', { style: 'margin-top:16px' }, startBtns),
    codeBox,
    status,
    h('p', { class: 'hint', style: 'margin-top:18px' }, 'Beide Geräte brauchen Internet und müssen die App gleichzeitig geöffnet haben; am zuverlässigsten im selben WLAN. Die Songs gehen verschlüsselt direkt von Gerät zu Gerät. Nur der Verbindungsaufbau läuft über den kostenlosen Vermittlungsdienst PeerJS (0.peerjs.com), der keine Songs sieht oder speichert. Vor dem Übernehmen wird automatisch eine interne Sicherung angelegt.'));

  sheet({ title: 'Geräte synchronisieren', body, full: true, right: { label: 'Fertig', bold: true }, onClose: () => { closed = true; cleanup(); } });
  await db.flush();
}
