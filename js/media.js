// Fotos und Audioaufnahmen je Song – lokal in IndexedDB (Store „media“), getrennt vom App-Code.
// Datensatz: { id, songId, kind: 'image' | 'audio', type, name, data: ArrayBuffer, thumb?: ArrayBuffer,
//              width?, height?, duration?, createdAt }
import * as db from './storage.js';
import { h, fill, icon, sheet, actionSheet, confirmDialog, alertDialog, ask, toast, offerFile } from './ui.js';
import { uid, now } from './songs.js';

export const listMedia = async (songId) => (await db.getAllByIndex('media', 'songId', songId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export const mediaBlob = (m, thumb = false) => new Blob([thumb ? m.thumb : m.data], { type: thumb ? 'image/jpeg' : m.type });

const toBuffer = (blob) => (blob.arrayBuffer ? blob.arrayBuffer() : new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsArrayBuffer(blob);
}));

export function formatTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// ---------- Fotos ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Das Bild konnte nicht gelesen werden.')); };
    img.src = url;
  });
}

// Foto für den KI-Assistenten: verkleinert (lesbar, aber sparsam) als Base64-JPEG
export async function fileToAiImage(file) {
  const img = await loadImage(file);
  const { blob } = await toJpeg(img, 1600, 0.85);
  return toB64(await toBuffer(blob));
}
export const mediaToAiImage = (m) => toB64(m.data);

// Verkleinert auf maximal `max` Pixel Kantenlänge und speichert als JPEG (spart Speicher auf dem iPhone).
function toJpeg(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve({ blob: b, w: c.width, h: c.height }) : reject(new Error('Bild konnte nicht umgewandelt werden.'))), 'image/jpeg', quality));
}

export async function addImages(songId, files) {
  let n = 0;
  for (const file of files) {
    try {
      const img = await loadImage(file);
      const full = await toJpeg(img, 2048, 0.85);
      const thumb = await toJpeg(img, 360, 0.75);
      await db.put('media', {
        id: 'm' + uid(), songId, kind: 'image', type: 'image/jpeg', name: (file.name || 'Foto').replace(/\.[^.]+$/, ''),
        data: await toBuffer(full.blob), thumb: await toBuffer(thumb.blob), width: full.w, height: full.h, createdAt: now(),
      });
      n++;
    } catch (e) {
      console.error(e);
      await alertDialog('Foto nicht gespeichert', `${file.name || 'Das Foto'}: ${e.message || e}`);
    }
  }
  return n;
}

// Öffnet Kamera oder Mediathek. Muss direkt aus einem Tippen heraus aufgerufen werden (iOS).
export function pickPhotos(songId, { camera = false } = {}, onDone) {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'hidden', multiple: !camera, capture: camera ? 'environment' : null });
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.remove();
    if (!files.length) return;
    toast(files.length > 1 ? `${files.length} Fotos werden gespeichert …` : 'Foto wird gespeichert …', 1500);
    const n = await addImages(songId, files);
    if (n) toast(n === 1 ? 'Foto hinzugefügt' : `${n} Fotos hinzugefügt`);
    onDone();
  });
  document.body.append(input);
  input.click();
}

export function addPhotoMenu(songId, onDone) {
  actionSheet('Foto hinzufügen', [
    { label: 'Foto aufnehmen', onClick: () => pickPhotos(songId, { camera: true }, onDone) },
    { label: 'Aus Mediathek wählen', onClick: () => pickPhotos(songId, {}, onDone) },
  ]);
}

// Vollbildansicht mit Blättern, Zoom (Doppeltippen oder Lupe), Teilen und Löschen.
export function openLightbox(images, index, { editable = false, onChange, onAnalyze } = {}) {
  let i = index, zoom = false, url = null;
  const img = h('img', { class: 'lb-img', alt: '' });
  const stage = h('div', { class: 'lb-stage' }, img);
  const counter = h('span', { class: 'lb-count' });
  const show = () => {
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(mediaBlob(images[i]));
    img.src = url;
    zoom = false;
    wrap.classList.remove('zoomed');
    counter.textContent = images.length > 1 ? `${i + 1} / ${images.length}` : '';
    prev.disabled = i === 0;
    next.disabled = i === images.length - 1;
  };
  const toggleZoom = () => { zoom = !zoom; wrap.classList.toggle('zoomed', zoom); };
  const close = () => { if (url) URL.revokeObjectURL(url); wrap.remove(); document.removeEventListener('keydown', onKey); };
  const prev = h('button', { class: 'lb-btn lb-prev', 'aria-label': 'Vorheriges Foto', onClick: () => { if (i > 0) { i--; show(); } } }, icon('back'));
  const next = h('button', { class: 'lb-btn lb-next', 'aria-label': 'Nächstes Foto', onClick: () => { if (i < images.length - 1) { i++; show(); } } }, icon('chevron'));
  const wrap = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Foto' },
    h('div', { class: 'lb-bar' },
      h('button', { class: 'lb-btn', 'aria-label': 'Schließen', onClick: close }, icon('close')),
      counter,
      h('span', { class: 'lb-spacer' }),
      onAnalyze && h('button', { class: 'lb-btn', 'aria-label': 'Mit KI auswerten', onClick: () => { const m = images[i]; close(); onAnalyze([m]); } }, icon('magic')),
      h('button', { class: 'lb-btn', 'aria-label': 'Zoomen', onClick: toggleZoom }, icon('search')),
      h('button', { class: 'lb-btn', 'aria-label': 'Teilen oder sichern', onClick: () => offerFile(mediaBlob(images[i]), `${images[i].name || 'Foto'}.jpg`, { title: 'Foto', openable: true }) }, icon('share')),
      editable && h('button', {
        class: 'lb-btn', 'aria-label': 'Foto löschen',
        onClick: async () => {
          if (!(await confirmDialog('Foto löschen?', 'Das Foto wird aus diesem Song entfernt.', { ok: 'Löschen', destructive: true }))) return;
          await db.del('media', images[i].id);
          images.splice(i, 1);
          if (onChange) onChange();
          if (!images.length) { close(); return; }
          i = Math.min(i, images.length - 1);
          show();
        },
      }, icon('trash'))),
    stage, prev, next);
  stage.addEventListener('dblclick', toggleZoom);
  let x0 = null;
  stage.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (x0 == null || zoom) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (dx > 60) prev.click(); else if (dx < -60) next.click();
  });
  const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') prev.click(); if (e.key === 'ArrowRight') next.click(); };
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  show();
}

// ---------- Audio ----------
const AUDIO_TYPES = ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
const extFor = (type) => (/mp4|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm');

export async function openRecorder(songId, onSaved) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    alertDialog('Aufnahme nicht möglich', 'Dieser Browser unterstützt keine Audioaufnahme. Auf dem iPhone ist iOS 14.3 oder neuer nötig, und die App muss über HTTPS installiert sein.');
    return;
  }
  const existing = (await listMedia(songId)).filter((m) => m.kind === 'audio').length;
  let stream = null, rec = null, chunks = [], t0 = 0, timer = null, blob = null, duration = 0, saved = false;
  let actx = null, analyser = null, raf = 0, previewUrl = null;
  const mime = AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';

  const time = h('div', { class: 'rec-time' }, '0:00');
  const level = h('div', { class: 'rec-level' }, h('span'));
  const hint = h('p', { class: 'hint center' }, 'Tippe auf den roten Knopf, um die Aufnahme zu starten.');
  const recBtn = h('button', { class: 'rec-btn', 'aria-label': 'Aufnahme starten' }, h('span'));
  const nameInput = h('input', { class: 'field', value: `Aufnahme ${existing + 1}`, placeholder: 'Name der Aufnahme' });
  const player = h('audio', { controls: true, class: 'rec-player hidden', preload: 'metadata' });
  const after = h('div', { class: 'stack hidden' },
    nameInput,
    player,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn danger', onClick: () => { blob = null; s.close(); } }, 'Verwerfen'),
      h('button', { class: 'btn primary', onClick: () => s.close() }, 'Sichern')));

  function meter() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
    level.firstChild.style.transform = `scaleX(${Math.min(1, peak / 90)})`;
    raf = requestAnimationFrame(meter);
  }

  function release() {
    cancelAnimationFrame(raf);
    clearInterval(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (actx) actx.close().catch(() => {});
    actx = analyser = null;
  }

  async function start() {
    try {
      // Ohne Rauschunterdrückung/Automatik – klingt bei Gitarre natürlicher.
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      alertDialog('Kein Zugriff auf das Mikrofon', 'Bitte erlaube den Mikrofonzugriff (iPhone: Einstellungen → Safari → Mikrofon) und versuche es erneut.');
      return;
    }
    chunks = [];
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      duration = (Date.now() - t0) / 1000;
      blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/mp4' });
      release();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      player.src = previewUrl;
      player.classList.remove('hidden');
      after.classList.remove('hidden');
      recBtn.classList.add('hidden');
      level.classList.add('hidden');
      hint.textContent = 'Anhören, benennen und sichern.';
    };
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        actx = new AC();
        analyser = actx.createAnalyser();
        analyser.fftSize = 512;
        actx.createMediaStreamSource(stream).connect(analyser);
        meter();
      }
    } catch { /* Pegelanzeige ist optional */ }
    rec.start(1000);
    t0 = Date.now();
    timer = setInterval(() => { time.textContent = formatTime((Date.now() - t0) / 1000); }, 250);
    recBtn.classList.add('recording');
    recBtn.setAttribute('aria-label', 'Aufnahme stoppen');
    hint.textContent = 'Aufnahme läuft … Tippe erneut, um zu stoppen.';
  }

  function stop() { if (rec && rec.state !== 'inactive') rec.stop(); }

  recBtn.addEventListener('click', () => (rec && rec.state === 'recording' ? stop() : start()));
  const onHide = () => { if (document.visibilityState === 'hidden') stop(); };
  document.addEventListener('visibilitychange', onHide);

  // Schließen sichert eine vorhandene Aufnahme automatisch – nur „Verwerfen“ verwirft.
  async function finish() {
    document.removeEventListener('visibilitychange', onHide);
    if (rec && rec.state === 'recording') {
      await new Promise((r) => { rec.addEventListener('stop', r, { once: true }); rec.stop(); });
    }
    release();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!blob || saved) return;
    saved = true;
    try {
      await db.put('media', {
        id: 'm' + uid(), songId, kind: 'audio', type: blob.type, name: nameInput.value.trim() || `Aufnahme ${existing + 1}`,
        data: await toBuffer(blob), duration, createdAt: now(),
      });
      toast('Aufnahme gesichert');
      onSaved();
    } catch (e) {
      alertDialog('Aufnahme nicht gespeichert', String(e.message || e));
    }
  }

  const s = sheet({
    title: 'Aufnahme', body: h('div', { class: 'recorder' }, time, level, recBtn, hint, after),
    right: { label: 'Fertig', bold: true }, onClose: finish,
  });
}

let playing = null; // { audio, url, id, btn }
function stopPlayback() {
  if (!playing) return;
  playing.audio.pause();
  URL.revokeObjectURL(playing.url);
  playing.btn.replaceChildren(icon('play'));
  playing.btn.classList.remove('on');
  playing = null;
}

function audioRow(m, editable, refresh) {
  const btn = h('button', { class: 'play-btn', 'aria-label': `${m.name} abspielen` }, icon('play'));
  const prog = h('span', { class: 'audio-time' }, formatTime(m.duration));
  btn.addEventListener('click', () => {
    if (playing && playing.id === m.id) { stopPlayback(); return; }
    stopPlayback();
    const url = URL.createObjectURL(mediaBlob(m));
    const audio = new Audio(url);
    playing = { audio, url, id: m.id, btn };
    btn.replaceChildren(icon('pause'));
    btn.classList.add('on');
    audio.ontimeupdate = () => { prog.textContent = `${formatTime(audio.currentTime)} / ${formatTime(m.duration || audio.duration)}`; };
    audio.onended = () => { stopPlayback(); prog.textContent = formatTime(m.duration); };
    audio.play().catch(() => { stopPlayback(); toast('Wiedergabe nicht möglich'); });
  });
  const menu = () => actionSheet(m.name, [
    { label: 'Umbenennen', onClick: async () => { const n = await ask('Aufnahme benennen', { value: m.name, ok: 'Sichern' }); if (n) { m.name = n; await db.put('media', m); refresh(); } } },
    { label: 'Teilen / Sichern', onClick: () => offerFile(mediaBlob(m), `${m.name}.${extFor(m.type)}`, { title: 'Aufnahme', openable: true }) },
    { label: 'Löschen', destructive: true, onClick: async () => {
      if (!(await confirmDialog('Aufnahme löschen?', `„${m.name}“ wird endgültig gelöscht.`, { ok: 'Löschen', destructive: true }))) return;
      if (playing?.id === m.id) stopPlayback();
      await db.del('media', m.id);
      refresh();
    } },
  ]);
  return h('div', { class: 'audio-row' }, btn,
    h('div', { class: 'audio-text' }, h('div', { class: 'audio-name' }, m.name), prog),
    editable && h('button', { class: 'icon-btn', 'aria-label': `Optionen für ${m.name}`, onClick: menu }, icon('more')));
}

// Bereich „Fotos & Aufnahmen“ für Editor und Leseansicht. Bleibt über Neuzeichnen hinweg bestehen.
// onAnalyze(images): Fotos an den KI-Assistenten geben (nur im Bearbeiten-Modus angeboten)
export function mediaSection(song, { onAnalyze } = {}) {
  const el = h('section', { class: 'media-sec' });
  let editable = true, items = [], urls = [];
  const refresh = async () => { items = await listMedia(song.id); render(); };
  function render() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    const images = items.filter((m) => m.kind === 'image');
    const audios = items.filter((m) => m.kind === 'audio');
    el.classList.toggle('hidden', !editable && !items.length);
    fill(el,
      h('div', { class: 'sec-head' }, h('span', { class: 'media-title' }, 'Fotos & Aufnahmen'), h('span', { class: 'sec-rule' })),
      images.length ? h('div', { class: 'thumbs' }, images.map((m, i) => {
        const u = URL.createObjectURL(mediaBlob(m, !!m.thumb));
        urls.push(u);
        return h('button', { class: 'thumb', 'aria-label': `Foto ${i + 1} vergrößern`, onClick: () => openLightbox(images, i, { editable, onChange: refresh, onAnalyze: editable ? onAnalyze : null }) }, h('img', { src: u, alt: '' }));
      })) : null,
      audios.map((m) => audioRow(m, editable, refresh)),
      editable ? h('div', { class: 'add-row' },
        h('button', { class: 'pill', onClick: () => addPhotoMenu(song.id, refresh) }, icon('camera', 'small'), 'Foto'),
        h('button', { class: 'pill', onClick: () => openRecorder(song.id, refresh) }, icon('mic', 'small'), 'Aufnahme'),
        onAnalyze && images.length > 0 && h('button', { class: 'pill accent', onClick: () => onAnalyze(images) }, icon('magic', 'small'), images.length === 1 ? 'Foto mit KI auswerten' : 'Fotos mit KI auswerten')) : null,
      editable && !items.length ? h('p', { class: 'hint' }, 'Handschriftliche Zettel, Notenblätter oder ein kurzer Riff – alles bleibt nur auf diesem Gerät.') : null);
  }
  el.setEditable = (v) => { editable = v; render(); };
  el.refresh = refresh;
  el.dispose = () => { stopPlayback(); urls.forEach((u) => URL.revokeObjectURL(u)); };
  refresh();
  return el;
}

// ---------- Backup-Unterstützung ----------
function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function exportMedia() {
  return (await db.getAll('media')).map((m) => ({ ...m, data: toB64(m.data), thumb: m.thumb ? toB64(m.thumb) : undefined }));
}

export function normMedia(m) {
  if (!m || typeof m !== 'object' || !['image', 'audio'].includes(m.kind)) throw new Error('unbekannte Medienart');
  if (typeof m.songId !== 'string' || typeof m.data !== 'string') throw new Error('unvollständiger Datensatz');
  let data, thumb;
  try { data = fromB64(m.data); thumb = typeof m.thumb === 'string' ? fromB64(m.thumb) : undefined; } catch { throw new Error('beschädigte Datei'); }
  const out = {
    id: typeof m.id === 'string' && m.id ? m.id : 'm' + uid(), songId: m.songId, kind: m.kind,
    type: typeof m.type === 'string' ? m.type.slice(0, 60) : m.kind === 'image' ? 'image/jpeg' : 'audio/mp4',
    name: String(m.name || (m.kind === 'image' ? 'Foto' : 'Aufnahme')).slice(0, 120), data,
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : now(),
  };
  if (thumb) out.thumb = thumb;
  for (const k of ['width', 'height', 'duration']) if (Number.isFinite(m[k])) out[k] = m[k];
  return out;
}

export async function mediaStats() {
  const all = await db.getAll('media');
  const songs = new Set((await db.getAll('songs')).map((s) => s.id));
  const orphans = all.filter((m) => !songs.has(m.songId));
  const bytes = all.reduce((a, m) => a + (m.data?.byteLength || 0) + (m.thumb?.byteLength || 0), 0);
  return { count: all.length, bytes, orphans };
}
