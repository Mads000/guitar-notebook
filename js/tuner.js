// Stimmgerät über das Mikrofon. Erkennt die Tonhöhe lokal (keine Daten verlassen das Gerät)
// und vergleicht mit den Saiten der gewählten Stimmung (Gitarre oder Ukulele).
import { h, fill, sheet, segmented, toast } from './ui.js';
import { INSTRUMENTS, defaultTuning } from './songs.js';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PC = { C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3, E: 4, F: 5, 'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10, B: 11, H: 11 };
// Lage der Leersaiten in Standardstimmung (MIDI): daraus ergibt sich die Oktave jeder Saite
const REF = { guitar: [40, 45, 50, 55, 59, 64], ukulele: [67, 60, 64, 69], bariton: [50, 55, 59, 64] };
const freq = (m) => 440 * 2 ** ((m - 69) / 12);
const noteName = (m) => NAMES[((Math.round(m) % 12) + 12) % 12];

// "Eb Ab Db Gb Bb Eb" → MIDI-Noten der Leersaiten (tief → hoch); null, wenn nicht lesbar
export function tuningMidi(notes, inst) {
  const tokens = String(notes || '').trim().split(/[\s,]+/).filter(Boolean);
  const ref = inst === 'ukulele' ? (tokens.join(' ').toUpperCase() === 'D G B E' ? REF.bariton : REF.ukulele) : REF.guitar;
  if (tokens.length !== ref.length) return null;
  const out = [];
  for (const [i, t] of tokens.entries()) {
    const pc = PC[t.toUpperCase().replace('♯', '#').replace('♭', 'B')];
    if (pc == null) return null;
    // nächstgelegene Note mit dieser Tonklasse; bei Gleichstand die tiefere
    let m = ref[i] - (((ref[i] - pc) % 12) + 12) % 12;
    if (ref[i] - m > 6) m += 12;
    out.push(m);
  }
  return out;
}

// Tonhöhe per normierter Autokorrelation (McLeod-Verfahren). Gibt Hz oder null zurück.
export function detectPitch(buf, sr) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / n) < 0.006) return null;
  const maxLag = Math.min(Math.floor(sr / 50), n >> 1);
  const nsdf = new Float32Array(maxLag);
  for (let tau = 0; tau < maxLag; tau++) {
    let acf = 0, m = 0;
    for (let i = 0; i < n - tau; i++) { const a = buf[i], b = buf[i + tau]; acf += a * b; m += a * a + b * b; }
    nsdf[tau] = m ? (2 * acf) / m : 0;
  }
  // Höchstwerte zwischen den positiven Nulldurchgängen sammeln, den ersten deutlichen nehmen
  const peaks = [];
  let tau = 1;
  while (tau < maxLag && nsdf[tau] > 0) tau++;
  for (; tau < maxLag - 1; tau++) {
    if (nsdf[tau] <= 0) continue;
    let best = tau;
    while (tau < maxLag - 1 && nsdf[tau] > 0) { if (nsdf[tau] > nsdf[best]) best = tau; tau++; }
    peaks.push(best);
  }
  if (!peaks.length) return null;
  const top = Math.max(...peaks.map((p) => nsdf[p]));
  if (top < 0.6) return null;
  const p = peaks.find((x) => nsdf[x] >= 0.9 * top);
  // Parabel durch die Nachbarwerte für Bruchteile eines Samples
  const a = nsdf[p - 1], b = nsdf[p], c = nsdf[p + 1] ?? b;
  const shift = (a - c) / (2 * (a - 2 * b + c)) || 0;
  const f = sr / (p + Math.max(-0.5, Math.min(0.5, shift)));
  return f >= 55 && f <= 1400 ? f : null;
}

// song: optional – dann sind Instrument und Stimmung des Songs vorausgewählt
export function openTuner({ instrument = 'guitar', tuning = '' } = {}) {
  let inst = instrument === 'ukulele' ? 'ukulele' : 'guitar';
  let notes = tuning || defaultTuning(inst);
  let strings = tuningMidi(notes, inst) || tuningMidi(defaultTuning(inst), inst);
  let locked = -1, active = -1;
  let ctx = null, stream = null, analyser = null, timer = 0, closed = false;
  const recent = [];

  const noteEl = h('div', { class: 'tn-note' }, '–');
  const hzEl = h('div', { class: 'tn-hz' }, ' ');
  const needle = h('div', { class: 'tn-needle' });
  const meter = h('div', { class: 'tn-meter' }, h('div', { class: 'tn-scale' }, ...[-50, -25, 0, 25, 50].map((c) => h('span', { style: `left:${50 + c}%` }))), needle);
  const hint = h('div', { class: 'tn-hint' }, 'Mikrofon wird gestartet …');
  const stringRow = h('div', { class: 'tn-strings' });
  const tuningSel = h('select', { 'aria-label': 'Stimmung' });
  const toneBtn = h('button', { class: 'pill', onClick: () => playTone() }, '♪ Ton abspielen');
  const instSeg = h('div');

  function setTuning(n) {
    const m = tuningMidi(n, inst);
    if (!m) { toast('Diese Stimmung kann das Stimmgerät nicht lesen – es nutzt Standard.'); }
    notes = m ? n : defaultTuning(inst);
    strings = m || tuningMidi(notes, inst);
    locked = -1; active = -1;
    drawStrings();
  }
  function drawTuningSel() {
    const list = INSTRUMENTS[inst].tunings;
    const known = list.some((t) => t.notes === notes);
    tuningSel.replaceChildren(...list.map((t) => h('option', { value: t.notes }, `${t.name} (${t.notes})`)), !known && h('option', { value: notes }, `Song (${notes})`));
    tuningSel.value = notes;
  }
  tuningSel.addEventListener('change', () => setTuning(tuningSel.value));
  function drawInst() {
    fill(instSeg, segmented(Object.entries(INSTRUMENTS).map(([value, i]) => ({ value, label: i.label })), inst, (v) => {
      inst = v; setTuning(defaultTuning(v)); drawTuningSel();
    }));
  }
  function drawStrings() {
    fill(stringRow, strings.map((m, i) => h('button', {
      class: 'tn-str' + (i === active ? ' on' : '') + (i === locked ? ' locked' : ''),
      'aria-pressed': String(i === locked),
      onClick: () => { locked = locked === i ? -1 : i; active = locked; drawStrings(); },
    }, noteName(m), h('small', null, String(Math.floor(m / 12) - 1)))));
    hint.dataset.mode = locked >= 0 ? 'locked' : 'auto';
  }

  function show(f) {
    if (f == null) { needle.classList.add('idle'); return; }
    recent.push(f);
    if (recent.length > 5) recent.shift();
    const med = recent.slice().sort((a, b) => a - b)[recent.length >> 1];
    const midi = 69 + 12 * Math.log2(med / 440);
    let target = locked;
    if (target < 0) target = strings.reduce((best, m, i) => (Math.abs(m - midi) < Math.abs(strings[best] - midi) ? i : best), 0);
    if (target !== active) { active = target; drawStrings(); }
    const cents = Math.round((midi - strings[target]) * 100);
    const shown = Math.max(-50, Math.min(50, cents));
    noteEl.textContent = noteName(midi);
    hzEl.textContent = `${med.toFixed(1)} Hz · Ziel ${noteName(strings[target])} ${freq(strings[target]).toFixed(1)} Hz`;
    needle.classList.remove('idle');
    needle.style.left = `${50 + shown}%`;
    const ok = Math.abs(cents) <= 5;
    meter.classList.toggle('ok', ok);
    noteEl.classList.toggle('ok', ok);
    hint.textContent = ok ? 'Gestimmt ✓'
      : Math.abs(cents) > 300 ? `Weit weg – ${noteName(strings[target])} gesucht`
        : cents < 0 ? `${Math.abs(cents)} Cent zu tief – Saite etwas fester spannen` : `${cents} Cent zu hoch – Saite etwas lockern`;
  }

  async function start() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (closed) { stop(); return; }
      await ctx.resume();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(2048);
      hint.textContent = 'Zupfe eine Saite …';
      let quiet = 0;
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const f = detectPitch(buf, ctx.sampleRate);
        if (f == null) { if (++quiet > 12) { recent.length = 0; show(null); } return; }
        quiet = 0;
        show(f);
      }, 60);
    } catch (e) {
      hint.textContent = e?.name === 'NotAllowedError'
        ? 'Kein Zugriff aufs Mikrofon. iPhone: Einstellungen → Safari → Mikrofon → „Fragen“ oder „Erlauben“, dann das Stimmgerät neu öffnen.'
        : `Mikrofon nicht verfügbar (${e?.message || e}).`;
      hint.classList.add('err');
    }
  }
  function stop() {
    clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
    stream = null;
  }

  // Referenzton der gewählten (oder zuletzt erkannten) Saite
  function playTone() {
    const i = locked >= 0 ? locked : active >= 0 ? active : 0;
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = 'triangle';
    o.frequency.value = freq(strings[i]);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 2.3);
    if (locked < 0) { active = i; drawStrings(); }
  }

  const body = h('div', { class: 'tuner' },
    instSeg,
    h('div', { class: 'form-group', style: 'margin-top:12px' }, h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Stimmung'), tuningSel)),
    h('div', { class: 'tn-display' }, noteEl, hzEl, meter, hint),
    stringRow,
    h('div', { class: 'tn-actions' }, toneBtn),
    h('p', { class: 'form-foot' }, 'Automatisch erkennt das Stimmgerät die nächstgelegene Saite. Tippe auf eine Saite, um gezielt nur diese zu stimmen (nochmal tippen = automatisch). Der Ton wird nur auf diesem Gerät ausgewertet.'));
  drawInst();
  drawTuningSel();
  drawStrings();
  sheet({ title: 'Stimmgerät', body, full: true, right: { label: 'Fertig', bold: true }, onClose: () => { closed = true; stop(); } });
  start();
}
