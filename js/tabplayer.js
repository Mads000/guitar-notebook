// Tabs abspielen: gezupfte Saiten (Karplus-Strong) über Web Audio, Tempo aus dem Song, Cursor läuft mit.
// Zeit: ein Takt = 4 Schläge (4/4), jede Position eines Takts gleich lang – wie beim automatischen Rhythmus.
// Techniken: Hammer-on/Pull-off leiser angeschlagen, Slides gleiten zur nächsten Note, Bend und Vibrato über
// die Tonhöhe, Palm Mute kurz und dumpf, Dead Note als Klick. Ohne „Let Ring“ endet ein Ton, sobald auf
// derselben Saite die nächste Note kommt; mit „Let Ring“ klingt er aus. Anschlag ↓/↑: Saiten kurz nacheinander (geschrammt);
// ein Anschlag ohne Noten spielt den zuletzt gesetzten Akkord, und jeder Anschlag beendet die Töne davor.
import { h, icon, haptic } from './ui.js';
import { flatCols, noteText, tabStrings, nextOnString, strumAt, chordAt, colHasNotes } from './tabs.js';

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
// Standard-Tonhöhen (MIDI) je Saite von tief nach hoch; Ukulele re-entrant (G oben)
const STD = { 6: [40, 45, 50, 55, 59, 64], 4: [67, 60, 64, 69] };
const DEFAULT_NOTES = { 6: 'E A D G B E', 4: 'G C E A' };
const SPEED_KEY = 'gn-play-speed';

function pitchClass(name) {
  const m = String(name || '').trim().match(/^([A-Ha-h])([#b]?)/);
  if (!m) return null;
  return (PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

// Leersaiten als MIDI, Index wie im Tab (0 = oberste Zeile = höchste Saite)
export function openPitches(tuning, strings, capo = 0) {
  const std = STD[strings] || STD[6];
  let notes = String(tuning || '').split(/\s+/).filter(Boolean);
  if (notes.length !== strings) notes = DEFAULT_NOTES[strings].split(' ');
  const low = notes.map((n, i) => {
    const pc = pitchClass(n);
    if (pc == null) return std[i];
    let best = std[i], bd = 99;
    for (let o = -1; o <= 1; o++) { const base = std[i] - ((std[i] % 12) - pc) + o * 12; const d = Math.abs(base - std[i]); if (d < bd) { bd = d; best = base; } }
    return best + capo;
  });
  return low.reverse();
}

let ctx = null;
const cache = new Map();
function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Gezupfte Saite: Rauschen in einer Verzögerungsschleife, die mit jedem Durchlauf weicher wird
function pluckBuffer(period) {
  if (cache.has(period)) return cache.get(period);
  const sr = ctx.sampleRate, n = Math.floor(sr * 2.6);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[idx], b = ring[(idx + 1) % period];
    const v = 0.996 * 0.5 * (a + b); // Mittelwert = Tiefpass, Faktor = Ausklingen
    d[i] = a * 0.8;
    ring[idx] = v;
    idx = (idx + 1) % period;
  }
  cache.set(period, buf);
  return buf;
}

// Ablaufplan: Startzeit jeder Position (Sekunden ab Position `from`)
function timeline(tab, bpm, speed) {
  const flat = flatCols(tab);
  const times = [];
  let t = 0;
  flat.forEach(([mi]) => { times.push(t); t += (60 / bpm) * 4 / tab.measures[mi].cols / speed; });
  return { flat, times, total: t };
}

/**
 * Spielt Positionen g1..g2 (einschließlich). Gibt { stop } zurück.
 * opts: { tuning, capo, bpm, speed, from, to, loop, onPos(g), onEnd() }
 */
export function playTab(tab, opts = {}) {
  const ac = audio();
  const N = tabStrings(tab);
  const open = openPitches(opts.tuning, N, opts.capo || 0);
  const bpm = Math.max(30, Math.min(300, opts.bpm || 90));
  const { flat, times } = timeline(tab, bpm, opts.speed || 1);
  const g1 = Math.max(0, opts.from || 0), g2 = Math.min(flat.length - 1, opts.to ?? flat.length - 1);
  const note = (g, s) => { const [mi, c] = flat[g]; return tab.measures[mi].notes[s][c]; };
  const flag = (g, key) => { const [mi, c] = flat[g]; return !!tab.measures[mi][key]?.[c]; };

  const master = ac.createGain();
  master.gain.value = 0.55;
  const comp = ac.createDynamicsCompressor();
  master.connect(comp).connect(ac.destination);
  let stopped = false, raf = 0, timer = 0;

  const colOf = (g) => { const [mi, c] = flat[g]; return [tab.measures[mi], c]; };
  const strumOf = (g) => strumAt(...colOf(g));
  // Griff für einen Anschlag ohne Noten: die letzte Position mit Akkordname davor, sonst die letzte mit Noten
  function chordSource(g) {
    for (let k = g - 1; k >= 0; k--) if (chordAt(...colOf(k))) return k;
    for (let k = g - 1; k >= 0; k--) if (colHasNotes(...colOf(k))) return k;
    return -1;
  }
  const nextStrum = (g) => { for (let k = g + 1; k <= g2; k++) if (strumOf(k)) return k; return -1; };

  function scheduleRun(t0) {
    const skip = new Set(); // Zielnoten von Slides werden nicht neu angeschlagen
    for (let g = g1; g <= g2; g++) {
      const at0 = t0 + times[g] - times[g1];
      const strum = strumOf(g), own = colHasNotes(...colOf(g));
      const from = !own && strum ? chordSource(g) : g;
      if (from < 0) continue;
      const ns = nextStrum(g), strumEnd = ns >= 0 ? t0 + times[ns] - times[g1] : null;
      for (let s = 0; s < N; s++) {
        const n0 = note(from, s);
        // wiederholter Akkord: nur Bund bzw. Dead Note, ohne Techniken
        const n = own ? n0 : n0 && (n0.x ? { f: null, x: true } : { f: n0.f });
        if (!noteText(n) || (own && skip.has(`${g}:${s}`))) continue;
        // Abschlag von der tiefen Saite (unten im Tab) nach oben, Aufschlag umgekehrt
        const at = at0 + (strum === 'd' ? N - 1 - s : strum === 'u' ? s : 0) * 0.014;
        // Ende: nächste Note auf derselben Saite (außer Let Ring), Palm Mute kurz
        const nx = nextOnString(tab, flat, g, s);
        const nextAt = nx >= 0 && nx <= g2 ? t0 + times[nx] - times[g1] : null;
        const ring = flag(g, 'lr');
        const pm = flag(g, 'pm');
        let end = pm ? at + 0.16 : !ring && nextAt != null ? nextAt : at + 2.4;
        if (!ring && strumEnd != null && strumEnd < end) end = strumEnd + 0.02;
        if (n.x) { click(at, pm); continue; }
        const midi = open[s] + n.f;
        const freq = 440 * 2 ** ((midi - 69) / 12);
        const period = Math.max(2, Math.round(ac.sampleRate / freq));
        const src = ac.createBufferSource();
        src.buffer = pluckBuffer(period);
        src.playbackRate.value = (freq * period) / ac.sampleRate;
        const prevLink = own ? (() => { for (let k = g - 1; k >= g1; k--) { const p = note(k, s); if (noteText(p)) return p.l; } return null; })() : null;
        const gain = ac.createGain();
        const vol = prevLink === 'h' || prevLink === 'p' ? 0.45 : strum ? (strum === 'u' ? 0.5 : 0.62) : 0.85;
        gain.gain.setValueAtTime(vol, at);
        let out = gain;
        if (pm) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; gain.connect(lp); out = lp; }
        src.connect(gain);
        out.connect(master);
        // Slide: Ton gleitet zur nächsten Note und klingt dort weiter
        if ((n.l === '/' || n.l === '\\') && nextAt != null) {
          const target = note(nx, s);
          if (target && target.f != null) {
            src.detune.setValueAtTime(0, at + (nextAt - at) * 0.3);
            src.detune.linearRampToValueAtTime((target.f - n.f) * 100, nextAt);
            skip.add(`${nx}:${s}`);
            const nn = nextOnString(tab, flat, nx, s);
            end = flag(nx, 'lr') ? nextAt + 2.4 : nn >= 0 && nn <= g2 ? t0 + times[nn] - times[g1] : nextAt + 2.4;
          }
        }
        if (n.b) { src.detune.setValueAtTime(0, at + 0.03); src.detune.linearRampToValueAtTime(n.b * 200, at + 0.18); }
        if (n.v) {
          const lfo = ac.createOscillator(), depth = ac.createGain();
          lfo.frequency.value = 5.5;
          depth.gain.value = 22;
          lfo.connect(depth).connect(src.detune);
          lfo.start(at + 0.12);
          lfo.stop(end + 0.1);
        }
        gain.gain.setTargetAtTime(0, end, 0.02);
        src.start(at);
        src.stop(end + 0.2);
      }
    }
  }
  // Dead Note: kurzer, gedämpfter Klick
  function click(at, pm) {
    const len = Math.floor(ac.sampleRate * 0.05);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const lp = ac.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = pm ? 600 : 1400;
    const g = ac.createGain();
    g.gain.value = 0.7;
    src.connect(lp).connect(g).connect(master);
    src.start(at);
  }

  let start = ac.currentTime + 0.08;
  const runLen = (g2 + 1 < times.length ? times[g2 + 1] : times[g2] + (60 / bpm) * 4 / tab.measures[flat[g2][0]].cols / (opts.speed || 1)) - times[g1];
  scheduleRun(start);

  // Cursor und Wiederholung
  let lastG = -1, nextPlanned = false;
  const tick = () => {
    if (stopped) return;
    let el = ac.currentTime - start;
    // Schleife: nächsten Durchlauf rechtzeitig vorher einplanen, damit kein Ton zu spät kommt
    if (opts.loop && !nextPlanned && el >= runLen - 0.3) { scheduleRun(start + runLen); nextPlanned = true; }
    if (el >= runLen) {
      if (opts.loop) { start += runLen; nextPlanned = false; el = ac.currentTime - start; }
      else { finish(); return; }
    }
    let g = g1;
    while (g < g2 && times[g + 1] - times[g1] <= el) g++;
    if (g !== lastG && el >= 0) { lastG = g; opts.onPos?.(g); }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  function finish() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    const t = ac.currentTime;
    master.gain.setTargetAtTime(0, t, 0.03);
    setTimeout(() => { try { master.disconnect(); comp.disconnect(); } catch { /* egal */ } }, 300);
    opts.onEnd?.();
  }
  return { stop: finish };
}

export const playSpeed = () => { try { return Number(localStorage.getItem(SPEED_KEY)) || 1; } catch { return 1; } };
const saveSpeed = (v) => { try { localStorage.setItem(SPEED_KEY, String(v)); } catch { /* egal */ } };

// Schwebende Abspiel-Leiste (Song-Ansicht): Start/Pause, Tempo, Schleife, Schließen
let current = null;
export function closePlayer() { current?.close(); current = null; }

export function openPlayer(tab, { host = document.body, tuning, capo, bpm, onPos, onStop } = {}) {
  closePlayer();
  let speed = playSpeed(), loop = false, run = null, pos = 0;
  const playBtn = h('button', { class: 'tp-btn main', 'aria-label': 'Abspielen' });
  const speedLbl = h('span', { class: 'tp-speed' });
  const loopBtn = h('button', { class: 'tp-btn', 'aria-label': 'Schleife', 'aria-pressed': 'false' }, icon('undo', 'small'));
  const draw = () => {
    playBtn.replaceChildren(icon(run ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', run ? 'Anhalten' : 'Abspielen');
    speedLbl.textContent = `${Math.round(speed * 100)} %`;
    loopBtn.classList.toggle('on', loop);
    loopBtn.setAttribute('aria-pressed', String(loop));
  };
  const stop = () => { run?.stop(); run = null; draw(); };
  const start = (from = 0) => {
    run?.stop();
    run = playTab(tab, { tuning, capo, bpm, speed, from, loop, onPos: (g) => { pos = g; onPos?.(g); }, onEnd: () => { run = null; pos = 0; onPos?.(null); draw(); } });
    draw();
  };
  const restart = () => { if (run) start(pos); else draw(); };
  playBtn.addEventListener('click', () => (run ? stop() : start(0)));
  loopBtn.addEventListener('click', () => { loop = !loop; restart(); });
  const setSpeed = (d) => { speed = Math.max(0.25, Math.min(1.5, Math.round((speed + d) * 100) / 100)); saveSpeed(speed); restart(); };
  const bar = h('div', { class: 'tab-player', role: 'toolbar', 'aria-label': 'Tab abspielen' },
    playBtn,
    h('div', { class: 'tp-info' }, h('span', { class: 'tp-name' }, tab.name || 'Tab'), h('span', { class: 'tp-bpm' }, `${bpm || 90} BPM`)),
    h('button', { class: 'tp-btn', 'aria-label': 'Langsamer', onClick: () => setSpeed(-0.25) }, '−'),
    speedLbl,
    h('button', { class: 'tp-btn', 'aria-label': 'Schneller', onClick: () => setSpeed(0.25) }, '+'),
    loopBtn,
    h('button', { class: 'tp-btn', 'aria-label': 'Schließen', onClick: () => closePlayer() }, icon('close', 'small')));
  host.append(bar);
  current = { close: () => { run?.stop(); run = null; bar.remove(); onStop?.(); } };
  haptic();
  start(0);
  return current;
}
