// Gerät-zu-Gerät-Sync per WebRTC (PeerJS). Die Songs gehen verschlüsselt direkt von Gerät zu Gerät; der öffentliche
// PeerJS-Dienst vermittelt nur den Verbindungsaufbau und sieht keine Songs.
//
// Koppeln: einmal per 6-stelligem Code. Danach kennt jedes Gerät das andere (Geräte-ID, Geheimnis, feste Adresse),
// ein Tipp auf „Mit iPad synchronisieren“ genügt – das andere Gerät muss nur diese Seite geöffnet haben.
//
// Ablauf: Beide tauschen eine Liste aus IDs und Prüfsummen aus (Manifest). Das Gerät, das die Verbindung aufgebaut hat,
// holt nur die Songs, die es braucht, und entscheidet mit dem gemeinsamen letzten Stand (Basis), was wohin gehört (syncmerge.js).
// Nur diese Seite fragt bei Konflikten nach – es gibt eine Zusammenfassung statt zwei Vorschauen.
//
// Gespeichert wird in dieser Reihenfolge, damit ein Abbruch nie schadet:
//   1. Das andere Gerät schreibt, 2. dieses Gerät schreibt und merkt sich die Basis, 3. das andere Gerät merkt sich die Basis.
import * as db from './storage.js';
import { h, fill, sheet, toast, alertDialog, confirmDialog, ask, toggle, formRow, icon, actionSheet, relDay } from './ui.js';
import { normalizeExisting, NORM } from './backup.js';
import { exportOneMedia, normMedia } from './media.js';
import { trashSong, now } from './songs.js';
import { loadUserChords } from './chords.js';
import { buildManifest, wantList, planSync, finalizeSync, summarizeSync, needsReview, agreedIds, buildBase, isConflict, ID_STORES } from './syncmerge.js';

const PREFIX = 'guitar-notebook-sync-';
const PROTOCOL = 2;
const CONNECT_TIMEOUT = 25000;
const DIAL_TIMEOUT = 45000;
const IDLE_TIMEOUT = 30000;
const PING_EVERY = 5000;
const CHUNK = 200 * 1024;

const randomToken = (n = 16) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

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
  'peer-unavailable': 'Kein Gerät mit diesem Code gefunden. Stimmt der Code, und zeigt das andere Gerät ihn noch an?',
  network: 'Keine Internetverbindung zum Verbindungsaufbau. Bitte WLAN prüfen.',
  'server-error': 'Der Vermittlungsdienst ist gerade nicht erreichbar. Bitte später noch einmal versuchen.',
  'socket-error': 'Die Verbindung wurde unterbrochen.',
  'browser-incompatible': 'Dieser Browser unterstützt keine Direktverbindung.',
  webrtc: 'Die direkte Verbindung kam nicht zustande. Am zuverlässigsten klappt es, wenn beide Geräte im selben WLAN sind.',
  lost: 'Die Verbindung ist abgerissen. Es geht nichts verloren – versuche es einfach noch einmal, auf beiden Geräten muss dafür diese Seite offen sein.',
  outdated: 'Das andere Gerät hat eine ältere Version von Sorell. Bitte aktualisiere die App auf beiden Geräten.',
  newer: 'Das andere Gerät hat eine neuere Version von Sorell. Bitte aktualisiere die App auf diesem Gerät.',
  unpaired: 'Dieses Gerät ist nicht mehr gekoppelt. Bitte koppelt es noch einmal per Code.',
  canceled: 'Auf dem anderen Gerät abgebrochen.',
};
const explain = (e) => ERRORS[e?.type] || e?.message || String(e);
const syncError = (type) => Object.assign(new Error(type), { type });

// ---------- Dieses Gerät und seine Partner ----------
function guessDeviceName() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android-Gerät';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'PC';
  return 'Anderes Gerät';
}

async function thisDevice() {
  let me = await db.getSetting('syncDevice', null);
  if (!me) {
    me = { id: randomToken(), inbox: randomToken(), name: guessDeviceName() };
    await db.setSetting('syncDevice', me);
  }
  return me;
}

const partnerKey = (id) => 'syncPartner:' + id;
export async function listPartners() {
  const all = await db.getAll('settings');
  return all.filter((s) => s.key.startsWith('syncPartner:')).map((s) => s.value).sort((a, b) => String(b.lastSyncAt || '').localeCompare(String(a.lastSyncAt || '')));
}
const savePartner = (p) => db.setSetting(partnerKey(p.id), p);
const removePartner = (p) => db.del('settings', partnerKey(p.id));

// „Zuletzt synchronisiert“ für die Einstellungen
export async function syncStatusText() {
  const list = await listPartners();
  const synced = list.find((p) => p.lastSyncAt);
  if (synced) return `${synced.name}: ${relDay(synced.lastSyncAt)}`;
  return list.length ? `Gekoppelt: ${list[0].name}` : '';
}

// ---------- Lokale Daten ----------
async function localState() {
  await db.flush();
  const data = normalizeExisting(await db.snapshot());
  const tombstones = await db.getAll('tombstones');
  const media = (await db.getAll('media')).map((m) => ({ id: m.id, songId: m.songId }));
  return { data, ...buildManifest(data, { tombstones, media }) };
}

// Schreibt die Änderungen eines Sync in einem Zug. Gelöschte Songs landen in „Zuletzt gelöscht“.
async function applyWrites(w, partnerName) {
  if (!w.put.length && !w.del.length && !w.trash.length) return;
  await db.addBackup(`Vor Sync mit ${partnerName}`);
  const songs = new Map((await db.getAll('songs')).map((s) => [s.id, s]));
  for (const id of w.trash) { const s = songs.get(id); if (s) await trashSong(s); }
  await db.applyBatch(w.put, w.del);
  // Tabs, die kein Abschnitt des aktualisierten Songs mehr braucht, entfernen
  const touched = new Set(w.put.filter(([st]) => st === 'songs').map(([, s]) => s.id));
  if (touched.size) {
    const refs = new Set();
    for (const [st, s] of w.put) if (st === 'songs') for (const sec of s.sections) for (const b of sec.blocks) if (b.type === 'tab' && b.tabId) refs.add(b.tabId);
    const stale = (await db.getAll('tabs')).filter((t) => touched.has(t.songId) && !refs.has(t.id)).map((t) => ['tabs', t.id]);
    if (stale.length) await db.deleteMany(stale);
  }
  await loadUserChords();
}

const clean = (st, list) => (list || []).flatMap((x) => { try { const n = NORM[st](x); delete n._genId; return [n]; } catch { return []; } });

// Größere Listen in Häppchen teilen – das erlaubt eine echte Fortschrittsanzeige
function chunks(entries) {
  const out = [];
  let cur = [], size = 0;
  for (const e of entries) {
    const n = JSON.stringify(e).length;
    if (cur.length && size + n > CHUNK) { out.push(cur); cur = []; size = 0; }
    cur.push(e);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ---------- Nachrichten über die Verbindung ----------
// next('typ') wartet auf eine bestimmte Nachricht. Ohne Lebenszeichen vom anderen Gerät bricht der Ablauf ab.
function channel(conn) {
  const waiting = new Map(), inbox = new Map();
  let lastSeen = Date.now(), broken = null;
  const fail = (err) => {
    if (broken) return;
    broken = err;
    clearInterval(timer);
    for (const list of waiting.values()) for (const w of list) w.reject(err);
    waiting.clear();
  };
  const timer = setInterval(() => {
    if (Date.now() - lastSeen > IDLE_TIMEOUT) { fail(syncError('lost')); return; }
    try { if (conn.open) conn.send({ type: 'ping' }); } catch { /* wird über die Zeitgrenze erkannt */ }
  }, PING_EVERY);
  conn.on('data', (msg) => {
    lastSeen = Date.now();
    if (!msg || typeof msg !== 'object' || msg.type === 'ping') return;
    if (msg.type === 'cancel') { fail(syncError('canceled')); return; }
    if (msg.type === 'backup') { fail(syncError('outdated')); return; } // ältere App-Version
    const list = waiting.get(msg.type);
    if (list?.length) list.shift().resolve(msg);
    else { if (!inbox.has(msg.type)) inbox.set(msg.type, []); inbox.get(msg.type).push(msg); }
  });
  conn.on('close', () => fail(syncError('lost')));
  conn.on('error', (e) => fail(e));
  return {
    send: (m) => conn.send(m),
    next(type) {
      if (broken) return Promise.reject(broken);
      const q = inbox.get(type);
      if (q?.length) return Promise.resolve(q.shift());
      return new Promise((resolve, reject) => {
        if (!waiting.has(type)) waiting.set(type, []);
        waiting.get(type).push({ resolve, reject });
      });
    },
    alive: () => !broken,
    close() { fail(syncError('lost')); try { conn.close(); } catch { /* egal */ } },
  };
}

// ---------- Oberfläche ----------
// songs: vorausgewählte Songs (aus dem Song-Menü oder der Mehrfachauswahl) – dann gehen nur diese über die Leitung
export async function openSync({ onDone, songs: preset = null } = {}) {
  await db.flush();
  const me = await thisDevice();
  let partners = await listPartners();
  let picked = new Set((preset || []).map((s) => s.id));
  let withMedia = (await db.getSetting('syncMedia', false)) === true;
  let codePeer = null, inboxPeer = null, dialTimer = 0, connectTimer = 0, closed = false, running = false, ch = null, wake = null, lastAttempt = null, dialing = null, changed = false;

  const body = h('div', { class: 'sync' });

  const stopTimers = () => { clearTimeout(dialTimer); clearTimeout(connectTimer); dialTimer = connectTimer = 0; };
  const destroy = (p) => { try { p?.destroy(); } catch { /* egal */ } };
  const stopCode = () => { destroy(codePeer); codePeer = null; };
  const keepAwake = async (on) => {
    try {
      if (on && !wake && navigator.wakeLock) wake = await navigator.wakeLock.request('screen');
      if (!on && wake) { await wake.release(); wake = null; }
    } catch { /* ohne Wachhalten weiter */ }
  };

  // ---------- Startseite des Sync ----------
  function drawStart(message) {
    running = false;
    const row = (p) => {
      const main = h('button', { class: 'form-row action sync-partner', onClick: () => dial(p) },
        icon('sync'),
        h('span', { class: 'lbl' }, `Mit ${p.name} synchronisieren`, h('small', null, p.lastSyncAt ? `Zuletzt: ${relDay(p.lastSyncAt)}${p.lastSummary ? ` · ${p.lastSummary}` : ''}` : 'Gekoppelt, noch nicht synchronisiert')),
        icon('chevron', 'small chev'));
      return h('div', { class: 'sync-partner-row' }, main,
        h('button', { class: 'row-more', 'aria-label': `Optionen für ${p.name}`, onClick: () => partnerMenu(p) }, icon('more')));
    };
    fill(body,
      message && h('p', { class: 'sync-msg error', role: 'alert' }, message),
      lastAttempt && message && h('button', { class: 'btn primary block', style: 'margin-bottom:16px', onClick: () => lastAttempt() }, 'Noch einmal versuchen'),
      preset?.length > 0 && h('p', { class: 'sync-scope' }, picked.size === 1 ? `Es wird 1 Song abgeglichen.` : `Es werden ${picked.size} Songs abgeglichen.`),
      partners.length > 0 && h('div', { class: 'form-group' }, partners.map(row)),
      partners.length > 0 && h('div', { class: 'form-label' }, 'Neues Gerät koppeln'),
      h('div', { class: 'sync-start' },
        h('button', { class: 'sync-big', onClick: showCode }, icon('eye'), h('b', null, 'Code anzeigen'), h('small', null, 'auf diesem Gerät')),
        h('button', { class: 'sync-big', onClick: enterCode }, icon('pencil'), h('b', null, 'Code eingeben'), h('small', null, 'vom anderen Gerät'))),
      partners.length > 0 && h('p', { class: 'form-foot' }, `Damit das klappt, muss auf dem anderen Gerät ebenfalls diese Seite geöffnet sein.`),
      h('details', { class: 'disclosure' },
        h('summary', null, 'Optionen'),
        h('div', { class: 'form-group' },
          formRow('Fotos & Aufnahmen', toggle(withMedia, (v) => { withMedia = v; db.setSetting('syncMedia', v); }), 'kann bei vielen Dateien dauern'),
          !preset && h('button', { class: 'form-row action', onClick: pickSongs }, h('span', { class: 'action-label' }, picked.size ? `${picked.size} ${picked.size === 1 ? 'Song' : 'Songs'} ausgewählt` : 'Nur bestimmte Songs …'), icon('chevron', 'small chev')))),
      h('details', { class: 'disclosure' },
        h('summary', null, 'Wie funktioniert das?'),
        h('div', { class: 'disclosure-text' },
          h('p', null, 'Beim ersten Mal koppelst du die Geräte einmal per Code. Danach reicht ein Tipp.'),
          h('p', null, 'Hat nur ein Gerät einen Song geändert, gilt diese Version. Haben beide denselben Teil geändert, entscheidest du. Gelöschte Songs bleiben 30 Tage unter „Zuletzt gelöscht“, und vor jeder Übernahme entsteht eine interne Sicherung.'),
          h('p', null, 'Beide Geräte brauchen Internet und müssen die App geöffnet haben, am zuverlässigsten im selben WLAN. Die Songs gehen verschlüsselt direkt von Gerät zu Gerät. Nur der Verbindungsaufbau läuft über den kostenlosen Dienst PeerJS, der keine Songs sieht oder speichert.'))));
  }

  function partnerMenu(p) {
    actionSheet(p.name, [
      { label: 'Umbenennen', icon: 'rename', onClick: async () => {
        const n = await ask('Gerät benennen', { value: p.name, ok: 'Sichern' });
        if (n) { p.name = n.slice(0, 40); await savePartner(p); partners = await listPartners(); drawStart(); }
      } },
      { label: 'Kopplung aufheben', icon: 'close', destructive: true, onClick: async () => {
        if (!(await confirmDialog('Kopplung aufheben?', `${p.name} lässt sich danach nur noch per Code verbinden. Songs werden dabei nicht gelöscht.`, { ok: 'Aufheben', destructive: true }))) return;
        await removePartner(p);
        partners = await listPartners();
        drawStart();
      } },
    ]);
  }

  async function pickSongs() {
    const all = (await db.getAll('songs')).sort((a, b) => a.title.localeCompare(b.title, 'de'));
    const search = h('input', { class: 'field search-field', type: 'search', placeholder: 'Suchen', autocomplete: 'off' });
    const list = h('ul', { class: 'list' });
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      list.replaceChildren(...all.filter((s) => !q || `${s.title} ${s.artist}`.toLowerCase().includes(q)).map((s) => h('li', { class: 'row selectable' + (picked.has(s.id) ? ' selected' : '') },
        h('button', { class: 'row-main', 'aria-pressed': String(picked.has(s.id)), onClick: () => { if (picked.has(s.id)) picked.delete(s.id); else picked.add(s.id); draw(); } },
          h('span', { class: 'row-check' }, picked.has(s.id) && icon('check', 'small')),
          h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, s.title), s.artist && h('div', { class: 'row-sub' }, s.artist))))));
    };
    search.addEventListener('input', draw);
    draw();
    sheet({ title: 'Songs auswählen', body: h('div', null, search,
      h('div', { class: 'btn-row', style: 'margin:10px 0' },
        h('button', { class: 'btn small', onClick: () => { all.forEach((s) => picked.add(s.id)); draw(); } }, 'Alle'),
        h('button', { class: 'btn small', onClick: () => { picked.clear(); draw(); } }, 'Keine')),
      list), full: true, right: { label: 'Fertig', bold: true }, onClose: () => drawStart() });
  }

  // ---------- Feste Schritte: Code · Verbinden · Übertragen · Fertig ----------
  const STEPS = { code: 'Code anzeigen', find: 'Gerät suchen', connect: 'Verbinden', transfer: 'Übertragen', done: 'Fertig' };
  let stepList = [], activeStep = null, stepDetail = '', stepPct = null, extra = null;
  function drawSteps() {
    const i = stepList.indexOf(activeStep);
    const rows = stepList.map((k, n) => {
      const state = n < i || activeStep === 'done' ? 'done' : n === i ? 'active' : 'todo';
      return h('li', { class: 'sync-step ' + state },
        h('span', { class: 'sync-step-mark' }, state === 'done' ? icon('check', 'small') : state === 'active' ? h('span', { class: 'spinner' }) : ''),
        h('div', { class: 'sync-step-text' }, h('b', null, STEPS[k]),
          state === 'active' && stepDetail && h('small', null, stepDetail),
          state === 'active' && stepPct != null && h('div', { class: 'sync-bar', role: 'progressbar', 'aria-valuenow': String(stepPct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { style: `width:${stepPct}%` }))));
    });
    fill(body, extra, h('ol', { class: 'sync-steps' }, rows),
      activeStep !== 'done' && h('button', { class: 'btn block', style: 'margin-top:20px', onClick: cancel }, 'Abbrechen'));
  }
  const setStep = (k, detail = '', pct = null) => { activeStep = k; stepDetail = detail; stepPct = pct; drawSteps(); };
  const setProgress = (pct, detail = stepDetail) => { stepPct = Math.round(pct); stepDetail = detail; drawSteps(); };

  function cancel() {
    lastAttempt = null;
    if (ch) ch.cancelled = true;
    if (ch?.alive()) { try { ch.send({ type: 'cancel' }); } catch { /* egal */ } setTimeout(((x) => () => x.close())(ch), 300); }
    stopCode();
    stopTimers();
    dialing = null;
    ch = null;
    extra = null;
    keepAwake(false);
    drawStart();
    listen();
  }

  function fail(e) {
    if (closed) return;
    console.warn('Sync abgebrochen', e);
    stopTimers();
    stopCode();
    dialing = null;
    ch = null;
    extra = null;
    keepAwake(false);
    drawStart(explain(e));
    listen();
  }

  // ---------- Verbindung ----------
  // Feste Adresse für gekoppelte Geräte: Solange diese Seite offen ist, können sie sich hier melden.
  async function listen() {
    if (closed || inboxPeer || !partners.length) return;
    try {
      const Peer = await loadPeer();
      const open = (attempt = 0) => {
        if (closed) return;
        const p = new Peer(PREFIX + 'in-' + me.inbox, { debug: 0 });
        inboxPeer = p;
        p.on('connection', onInbound);
        p.on('disconnected', () => { if (!p.destroyed && !closed) try { p.reconnect(); } catch { /* egal */ } });
        p.on('error', (e) => {
          // Die Adresse ist kurz nach dem Schließen noch belegt: kurz warten und erneut versuchen
          if (e.type === 'unavailable-id' && attempt < 8) { destroy(p); inboxPeer = null; setTimeout(() => open(attempt + 1), 3000); }
          else if (e.type === 'peer-unavailable') onDialMiss();
        });
      };
      open();
    } catch (e) { console.warn(e); }
  }

  async function onInbound(c) {
    if (running) {
      // Beide haben gleichzeitig getippt: Das Gerät mit der kleineren ID wählt, das andere nimmt an
      if (dialing && c.metadata?.deviceId && me.id > c.metadata.deviceId) { stopTimers(); dialing = null; } else { c.on('open', () => c.close()); return; }
    }
    running = true;
    stepList = ['connect', 'transfer', 'done'];
    extra = null;
    setStep('connect');
    if (c.open) start(c, false); else c.on('open', () => start(c, false));
  }

  let onDialMiss = () => {};
  async function dial(p) {
    lastAttempt = () => dial(p);
    running = true;
    stepList = ['find', 'connect', 'transfer', 'done'];
    extra = null;
    dialing = p.id;
    setStep('find', `Öffne auf ${p.name} Einstellungen → Sync.`);
    keepAwake(true);
    try {
      await loadPeer();
      if (!inboxPeer) await listen();
      const deadline = Date.now() + DIAL_TIMEOUT;
      const tryOnce = () => {
        if (closed || dialing !== p.id) return;
        if (!inboxPeer?.open) { dialTimer = setTimeout(tryOnce, 500); if (Date.now() > deadline) fail(syncError('network')); return; }
        const c = inboxPeer.connect(PREFIX + 'in-' + p.inbox, { reliable: true, metadata: { deviceId: me.id } });
        let opened = false;
        c.on('open', () => {
          if (dialing !== p.id) { c.close(); return; }
          opened = true;
          dialing = null;
          stopTimers();
          setStep('connect');
          start(c, true, p);
        });
        connectTimer = setTimeout(() => { if (!opened) { try { c.close(); } catch { /* egal */ } again(); } }, 8000);
      };
      const again = () => {
        clearTimeout(connectTimer);
        if (dialing !== p.id) return;
        if (Date.now() > deadline) { fail(new Error(`${p.name} wurde nicht gefunden. Ist dort Einstellungen → Sync geöffnet und das Gerät online?`)); return; }
        dialTimer = setTimeout(tryOnce, 3000);
      };
      onDialMiss = again;
      tryOnce();
    } catch (e) { fail(e); }
  }

  async function showCode() {
    running = true;
    lastAttempt = showCode;
    stepList = ['code', 'connect', 'transfer', 'done'];
    const makeExtra = (code) => h('div', { class: 'sync-code' }, h('div', { class: 'sync-code-num', 'aria-label': `Code ${code.split('').join(' ')}` }, code.slice(0, 3) + ' ' + code.slice(3)), h('div', { class: 'sync-code-label' }, 'Auf dem anderen Gerät „Code eingeben“ wählen.'));
    extra = null;
    setStep('code', 'Code wird erstellt …');
    keepAwake(true);
    try {
      const Peer = await loadPeer();
      const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      codePeer = new Peer(PREFIX + code, { debug: 0 });
      codePeer.on('open', () => { extra = makeExtra(code); setStep('code', 'Warte auf das andere Gerät …'); });
      codePeer.on('connection', async (c) => {
        if (ch) { c.on('open', () => c.close()); return; }
        // Sofort mithören: Das andere Gerät sendet schon, während hier die Bestätigung offen ist
        const early = channel(c);
        ch = early;
        const okConn = await confirmDialog('Gerät verbinden?', 'Ein Gerät hat deinen Code eingegeben. Bestätige nur, wenn du das selbst warst.', { ok: 'Verbinden' });
        if (!okConn) { ch = null; early.close(); return; }
        extra = null;
        setStep('connect');
        if (c.open) start(c, false, null, true, early); else c.on('open', () => start(c, false, null, true, early));
      });
      codePeer.on('error', (e) => { if (e.type === 'unavailable-id') { stopCode(); showCode(); } else fail(e); });
    } catch (e) { fail(e); }
  }

  async function enterCode() {
    const raw = await ask('Code eingeben', { placeholder: '6-stelliger Code', ok: 'Verbinden', message: 'Der Code steht auf dem Gerät, das „Code anzeigen“ gewählt hat.' });
    const code = (raw || '').replace(/\D/g, '');
    if (!code) return;
    if (code.length !== 6) { toast('Der Code hat 6 Ziffern.'); return; }
    join(code);
  }

  async function join(code) {
    running = true;
    lastAttempt = () => join(code);
    stepList = ['connect', 'transfer', 'done'];
    extra = null;
    setStep('connect');
    keepAwake(true);
    try {
      const Peer = await loadPeer();
      codePeer = new Peer({ debug: 0 });
      codePeer.on('open', () => {
        const c = codePeer.connect(PREFIX + code, { reliable: true, metadata: { deviceId: me.id } });
        c.on('open', () => { stopTimers(); start(c, true, null, true); });
        c.on('error', fail);
        connectTimer = setTimeout(() => fail({ type: 'webrtc' }), CONNECT_TIMEOUT);
      });
      codePeer.on('error', fail);
    } catch (e) { fail(e); }
  }

  // ---------- Der eigentliche Abgleich ----------
  async function start(conn, dialer, expected = null, viaCode = false, early = null) {
    running = true;
    keepAwake(true);
    const c = early || channel(conn);
    ch = c;
    try {
      const scope = picked.size > 0;
      const known = await db.getSetting(partnerKey(expected?.id || conn.metadata?.deviceId || ''), null);
      const secret = viaCode ? randomToken() : (expected?.secret || known?.secret || '');
      c.send({ type: 'hello', v: PROTOCOL, id: me.id, name: me.name, inbox: me.inbox, secret: viaCode && !dialer ? '' : secret, viaCode, scope, media: withMedia });
      const hello = await c.next('hello');
      if (hello.v == null) throw syncError('outdated');
      if (hello.v > PROTOCOL) throw syncError('newer');
      if (hello.v < PROTOCOL) throw syncError('outdated');
      // Beim Koppeln legt das Gerät, das den Code eingegeben hat, das gemeinsame Geheimnis fest.
      let partner = await db.getSetting(partnerKey(hello.id), null);
      if (viaCode) {
        const shared = dialer ? secret : hello.secret;
        partner = { pairedAt: now(), ...partner, id: hello.id, name: hello.name, inbox: hello.inbox, secret: shared };
        await savePartner(partner);
        partners = await listPartners();
        listen();
      } else if (!partner || hello.secret !== partner.secret) {
        throw syncError('unpaired');
      }
      lastAttempt = () => dial(partner);
      // Das Gerät mit einer Auswahl entscheidet; sonst das, das die Verbindung aufgebaut hat.
      const leads = scope && hello.scope ? dialer : scope ? true : hello.scope ? false : dialer;
      const media = withMedia || hello.media;
      setStep('transfer', 'Änderungen werden gesucht …', 0);
      if (leads) await runLeader(c, partner, media, scope);
      else await runFollower(c, partner);
      keepAwake(false);
    } catch (e) {
      if (c.cancelled) return; // Der Nutzer hat selbst abgebrochen, cancel() hat schon aufgeräumt
      if (e?.type === 'abort') { cancel(); return; }
      c.close();
      fail(e);
    }
  }

  async function sendRecords(c, type, payload, onPct) {
    const entries = Object.entries(payload).flatMap(([st, list]) => (Array.isArray(list) ? list.map((x) => [st, x]) : []));
    const batches = chunks(entries);
    const of = Math.max(1, batches.length);
    for (let i = 0; i < of; i++) {
      c.send({ type, part: i, of, entries: batches[i] || [] });
      onPct?.((i + 1) / of);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  async function receiveRecords(c, type, onPct) {
    const out = {};
    for (let got = 0, of = 1; got < of; got++) {
      const m = await c.next(type);
      of = m.of;
      for (const [st, x] of m.entries) { if (!out[st]) out[st] = []; out[st].push(x); }
      onPct?.((got + 1) / of);
    }
    return out;
  }

  // Fotos und Aufnahmen einzeln, jede wird quittiert – so läuft der Speicher des Empfängers nicht voll
  async function sendMedia(c, ids, onPct) {
    for (let i = 0; i < ids.length; i++) {
      c.send({ type: 'media', m: await exportOneMedia(ids[i]) });
      await c.next('mediaAck');
      onPct?.((i + 1) / ids.length);
    }
  }
  async function receiveMedia(c, count, onPct) {
    const songs = new Set((await db.getAll('songs')).map((s) => s.id));
    for (let i = 0; i < count; i++) {
      const { m } = await c.next('media');
      if (m) { try { const n = normMedia(m); if (songs.has(n.songId)) await db.put('media', n); } catch (e) { console.warn('Medium übersprungen', e); } }
      c.send({ type: 'mediaAck' });
      onPct?.((i + 1) / count);
    }
  }

  async function runLeader(c, partner, media, hasScope) {
    const mine = await localState();
    const scope = hasScope ? scopeOf(mine.data) : null;
    const rm = (await c.next('manifest')).manifest;
    const want = wantList(mine.manifest, rm, partner.base, scope);
    c.send({ type: 'want', want });
    const raw = await receiveRecords(c, 'records', (f) => setProgress(10 + f * 35, 'Änderungen werden geladen …'));
    const remote = { songs: [], tabs: [], chords: [], patterns: [], folders: [], setlists: [] };
    for (const st of Object.keys(remote)) remote[st] = clean(st, raw[st]);
    const folderOf = Object.fromEntries((raw.songFolder || []));
    remote.songs.forEach((s) => { s._folderName = folderOf[s.id] || ''; });
    const plan = planSync({ local: mine.data, remote, lm: mine.manifest, rm, base: partner.base, scope });
    if (needsReview(plan)) {
      setStep('transfer', `Bitte auf ${me.name} bestätigen …`, stepPct);
      c.send({ type: 'status', text: `Bitte auf ${me.name} bestätigen.` });
      const go = await reviewPlan(plan, partner);
      if (!go) throw Object.assign(new Error('abort'), { type: 'abort' });
    }
    setStep('transfer', 'Wird übertragen …', 50);
    const w = finalizeSync(plan, { local: mine.data, remote, rm, remoteName: partner.name });
    const sum = summarizeSync(plan);
    await sendRecords(c, 'apply', { put: w.remote.put, del: w.remote.del, trash: w.remote.trash }, (f) => setProgress(50 + f * 25));
    const applied = await c.next('applied');
    await applyWrites(w.local, partner.name);
    // Fotos und Aufnahmen: nur, was dem anderen Gerät fehlt, und nur für Songs, die dort existieren
    let mediaPlan = { toThem: 0, fromThem: [] }, toThem = [];
    if (media) {
      const after = await localState();
      const haveHere = new Set(after.manifest.media.map((m) => m.id));
      const haveThere = new Set(applied.manifest.media.map((m) => m.id));
      const songsHere = new Set(Object.keys(after.manifest.songs)), songsThere = new Set(Object.keys(applied.manifest.songs));
      const scoped = (id) => !scope || scope.songs.has(id);
      toThem = after.manifest.media.filter((m) => !haveThere.has(m.id) && songsThere.has(m.songId) && scoped(m.songId)).map((m) => m.id);
      const fromThem = applied.manifest.media.filter((m) => !haveHere.has(m.id) && songsHere.has(m.songId) && scoped(m.songId)).map((m) => m.id);
      mediaPlan = { toThem: toThem.length, fromThem };
    }
    c.send({ type: 'mediaPlan', ...mediaPlan });
    await receiveMedia(c, mediaPlan.fromThem.length, (f) => setProgress(75 + f * 10, 'Fotos & Aufnahmen …'));
    await sendMedia(c, toThem, (f) => setProgress(85 + f * 10, 'Fotos & Aufnahmen …'));
    const final = await localState();
    const agreed = agreedIds(final.manifest, applied.manifest);
    const entry = { ...partner, base: buildBase(final.full, agreed, partner.base, scope), lastSyncAt: now(), lastSummary: sum.text };
    await savePartner(entry);
    c.send({ type: 'done', agreed, scope: !!scope, summary: sum.text });
    changed = changed || plan.items.length > 0;
    // Erst schließen, wenn das andere Gerät fertig ist – sonst ginge die letzte Nachricht verloren
    await Promise.race([c.next('bye'), new Promise((r) => setTimeout(r, 5000))]).catch(() => {});
    c.close();
    await finish(entry, sum.text, plan);
  }

  // Bei einer Auswahl: auch die eigenen Griffe, die diese Songs benutzen
  function scopeOf(data) {
    const songs = new Set(picked);
    const chords = new Set(data.chords.filter((x) => songs.has(x.songId)).map((x) => x.id));
    for (const s of data.songs) if (songs.has(s.id)) for (const sec of s.sections) for (const b of sec.blocks) if (b.type === 'chords') for (const i of b.items) if (i.chordId) chords.add(i.chordId);
    return { songs, chords };
  }

  async function runFollower(c, partner) {
    const mine = await localState();
    c.send({ type: 'manifest', manifest: mine.manifest });
    const { want } = await c.next('want');
    const byId = (st, ids) => { const set = new Set(ids); return mine.data[st].filter((x) => set.has(x.id)); };
    const songs = byId('songs', want.songs);
    const tabIds = new Set(songs.flatMap((s) => s.sections.flatMap((sec) => sec.blocks.filter((b) => b.type === 'tab' && b.tabId).map((b) => b.tabId))));
    const names = new Map(mine.data.folders.map((f) => [f.id, f.name]));
    const payload = { songs, tabs: mine.data.tabs.filter((t) => tabIds.has(t.id)), songFolder: songs.map((s) => [s.id, names.get(s.folderId) || '']) };
    for (const st of ID_STORES) payload[st] = byId(st, want[st]);
    await sendRecords(c, 'records', payload, (f) => setProgress(10 + f * 35, 'Änderungen werden gesendet …'));
    setProgress(45, 'Warte auf das andere Gerät …');
    const status = c.next('status').then((m) => { if (m) setStep('transfer', m.text, stepPct); }).catch(() => {});
    const raw = await receiveRecords(c, 'apply', (f) => setProgress(50 + f * 25, 'Wird übertragen …'));
    void status;
    const ALLOWED_DEL = new Set([...db.DATA_STORES, 'tombstones', 'trash']);
    const w = {
      put: (raw.put || []).flatMap(([st, o]) => (['tombstones', 'trash'].includes(st) ? [] : clean(st, [o]).map((x) => [st, x]))),
      del: (raw.del || []).filter(([st]) => ALLOWED_DEL.has(st)),
      trash: raw.trash || [],
    };
    await applyWrites(w, partner.name);
    const after = await localState();
    c.send({ type: 'applied', manifest: after.manifest });
    const mediaPlan = await c.next('mediaPlan');
    await sendMedia(c, mediaPlan.fromThem, (f) => setProgress(75 + f * 10, 'Fotos & Aufnahmen …'));
    await receiveMedia(c, mediaPlan.toThem, (f) => setProgress(85 + f * 10, 'Fotos & Aufnahmen …'));
    const done = await c.next('done');
    const final = await localState();
    const scoped = done.scope;
    const entry = { ...partner, base: buildBase(final.full, done.agreed, partner.base, scoped ? {} : null), lastSyncAt: now(), lastSummary: done.summary };
    await savePartner(entry);
    c.send({ type: 'bye' });
    changed = changed || done.summary !== 'Alles ist aktuell';
    await loadUserChords();
    await new Promise((r) => setTimeout(r, 400)); // „bye“ noch abschicken lassen
    c.close();
    await finish(entry, done.summary, null);
  }

  // Ergebnis: ein Satz, darunter auf Wunsch die betroffenen Songs
  async function finish(partner, summary, plan) {
    ch = null;
    running = false;
    lastAttempt = null;
    stopCode();
    extra = h('div', { class: 'sync-result' },
      h('div', { class: 'sync-result-icon' }, icon('check')),
      h('h2', null, summary),
      h('p', null, `${me.name} und ${partner.name} sind auf dem gleichen Stand.`));
    setStep('done');
    fill(body, extra,
      plan && plan.items.length > 0 && changesList(plan, partner),
      h('button', { class: 'btn primary block', style: 'margin-top:20px', onClick: () => ctl.close() }, 'Fertig'));
    if (changed) { changed = false; onDone?.(); }
  }

  const changesList = (plan, partner) => {
    const here = plan.items.filter((x) => ['pull', 'delLocal', 'merge', 'conflict'].includes(x.kind));
    const there = plan.items.filter((x) => ['push', 'delRemote', 'merge', 'conflict'].includes(x.kind));
    const line = (t, list) => list.length > 0 && h('div', null, h('div', { class: 'form-label' }, t), h('ul', { class: 'list compact' }, list.slice(0, 50).map((x) => h('li', { class: 'row' }, h('div', { class: 'row-main static' }, h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, x.title), h('div', { class: 'row-sub' }, KIND_TEXT[x.kind] || '')))))));
    return h('details', { class: 'disclosure' }, h('summary', null, 'Details'), line(`Auf ${me.name}`, here), line(`Auf ${partner.name}`, there));
  };
  const KIND_TEXT = { pull: 'aktualisiert', push: 'aktualisiert', merge: 'zusammengeführt', conflict: 'zusammengeführt', delLocal: 'gelöscht', delRemote: 'gelöscht' };

  // ---------- Prüfen vor dem Übernehmen ----------
  // Eine Zeile je Konflikt; die Wahl steckt hinter einem Tipp statt hinter drei Knöpfen pro Song.
  function reviewPlan(plan, partner) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); sh.close(); } };
      const list = h('div');
      const choiceLabel = (it) => {
        if (it.kind === 'conflict') return it.choice === 'both' ? 'Beide behalten' : it.choice === 'remote' ? partner.name : me.name;
        return it.choice === 'keep' ? 'Behalten' : 'Löschen';
      };
      const whyText = (it) => {
        if (it.kind === 'delLocalConflict') return `Auf ${partner.name} gelöscht, hier geändert`;
        if (it.kind === 'delRemoteConflict') return `Hier gelöscht, auf ${partner.name} geändert`;
        return `Beide geändert: ${it.parts.join(', ')}`;
      };
      const pick = (it) => {
        const opts = it.kind === 'conflict'
          ? [{ label: `Version von ${me.name}${it.newer === 'local' ? ' (neuer)' : ''}`, value: 'local' }, { label: `Version von ${partner.name}${it.newer === 'remote' ? ' (neuer)' : ''}`, value: 'remote' }, it.store === 'songs' && { label: 'Beide behalten', value: 'both' }]
          : [{ label: 'Behalten', value: 'keep' }, { label: 'Löschen', value: 'delete', destructive: true }];
        actionSheet(it.title, opts).then((v) => { if (v) { it.choice = v; draw(); } });
      };
      const draw = () => {
        const conflicts = plan.items.filter(isConflict);
        const deletions = plan.items.filter((x) => x.kind === 'delLocal' || x.kind === 'delRemote');
        const sum = summarizeSync(plan);
        fill(list,
          h('p', { class: 'sync-summary' }, sum.text),
          conflicts.length > 0 && deletions.length > 0 && h('div', { class: 'form-label' }, 'Konflikte'),
          conflicts.length > 0 && h('div', { class: 'form-group' }, conflicts.map((it) => h('button', { class: 'form-row action review-row', onClick: () => pick(it) },
            h('span', { class: 'lbl' }, it.title, h('small', null, whyText(it))), h('span', { class: 'muted choice' }, choiceLabel(it)), icon('chevron', 'small chev')))),
          conflicts.length > 0 && h('p', { class: 'form-foot' }, 'Vorausgewählt ist die neuere Version. Alles Unstrittige in diesen Songs bleibt von beiden Seiten erhalten.'),
          deletions.length > 0 && h('div', { class: 'form-label' }, 'Wird gelöscht'),
          deletions.length > 0 && h('div', { class: 'form-group' }, deletions.map((it) => h('div', { class: 'form-row' },
            h('span', { class: 'lbl' }, it.title, h('small', null, it.kind === 'delLocal' ? `Auf ${partner.name} gelöscht` : `Hier gelöscht`))))),
          deletions.length > 0 && h('p', { class: 'form-foot' }, 'Gelöschte Songs bleiben 30 Tage unter „Zuletzt gelöscht“.'));
      };
      const sh = sheet({ title: 'Prüfen', body: list, full: true, left: { label: 'Abbrechen', onClick: () => done(false) }, right: { label: 'Übernehmen', bold: true, onClick: () => done(true) }, onClose: () => done(false) });
      draw();
    });
  }

  const ctl = sheet({ title: 'Sync', body, full: true, right: { label: 'Fertig', bold: true }, onClose: () => {
    closed = true;
    if (ch?.alive()) { try { ch.send({ type: 'cancel' }); } catch { /* egal */ } ch.close(); }
    stopTimers();
    stopCode();
    destroy(inboxPeer);
    inboxPeer = null;
    keepAwake(false);
  } });
  drawStart();
  listen();
}
