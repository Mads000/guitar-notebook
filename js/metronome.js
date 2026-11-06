// Metronom als schwebende Leiste beim Spielen: Start/Stopp, Tempo, Tempo antippen. Die Klicks plant Web Audio im Voraus,
// damit sie auch dann gleichmäßig bleiben, wenn die Seite gerade beschäftigt ist.
import { h, icon, haptic } from './ui.js';

const MIN = 30, MAX = 300;
const clampBpm = (v) => Math.max(MIN, Math.min(MAX, Math.round(v)));
const LOOKAHEAD = 0.12; // Sekunden im Voraus planen

let current = null;
export function closeMetronome() { current?.close(); current = null; }

// beatsOf('3/4') = 3; ohne Taktart 4
const beatsOf = (timeSig) => { const n = parseInt(timeSig, 10); return n >= 2 && n <= 12 ? n : 4; };

export function openMetronome({ host = document.body, bpm, timeSig } = {}) {
  closeMetronome();
  let tempo = clampBpm(bpm || 90), ctx = null, timer = 0, running = false, nextAt = 0, beat = 0;
  const beats = beatsOf(timeSig), pending = new Set();
  const taps = [];
  const playBtn = h('button', { class: 'tp-btn main', 'aria-label': 'Metronom starten' });
  const value = h('b', { class: 'mt-bpm' });
  const dots = h('div', { class: 'mt-dots', 'aria-hidden': 'true' }, Array.from({ length: beats }, (_, i) => h('span', { class: i === 0 ? 'first' : '' })));

  const draw = () => {
    playBtn.replaceChildren(icon(running ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', running ? 'Metronom anhalten' : 'Metronom starten');
    value.textContent = String(tempo);
    if (!running) [...dots.children].forEach((d) => d.classList.remove('on'));
  };
  const click = (at, strong) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = strong ? 1650 : 1050;
    g.gain.setValueAtTime(strong ? 0.5 : 0.32, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + 0.06);
  };
  const light = (i, at) => {
    const t = setTimeout(() => {
      pending.delete(t);
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    }, Math.max(0, (at - ctx.currentTime) * 1000));
    pending.add(t);
  };
  const schedule = () => {
    while (nextAt < ctx.currentTime + LOOKAHEAD) {
      click(nextAt, beat === 0);
      light(beat, nextAt);
      beat = (beat + 1) % beats;
      nextAt += 60 / tempo;
    }
  };
  const start = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    running = true;
    beat = 0;
    nextAt = ctx.currentTime + 0.06;
    schedule();
    timer = setInterval(schedule, 30);
    draw();
  };
  const stop = () => {
    running = false;
    clearInterval(timer);
    pending.forEach(clearTimeout);
    pending.clear();
    draw();
  };
  const setTempo = (v) => { tempo = clampBpm(v); draw(); };

  // Gedrückt halten ändert das Tempo fortlaufend
  const stepBtn = (label, aria, d) => {
    let hold = 0, rep = 0;
    const end = () => { clearTimeout(hold); clearInterval(rep); };
    return h('button', {
      class: 'tp-btn', 'aria-label': aria,
      onClick: () => setTempo(tempo + d),
      onPointerdown: () => { hold = setTimeout(() => { rep = setInterval(() => setTempo(tempo + d * 2), 90); }, 380); },
      onPointerup: end, onPointercancel: end, onPointerleave: end,
    }, label);
  };
  // Tempo antippen: Mittel der letzten Abstände; eine lange Pause beginnt von vorn
  const tap = () => {
    const t = performance.now();
    if (taps.length && t - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(t);
    if (taps.length > 6) taps.shift();
    haptic();
    if (taps.length >= 2) setTempo(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
  };

  playBtn.addEventListener('click', () => { haptic(); if (running) stop(); else start(); });
  const bar = h('div', { class: 'tab-player metronome', role: 'toolbar', 'aria-label': 'Metronom' },
    playBtn,
    stepBtn('−', 'Langsamer', -1),
    h('div', { class: 'mt-val' }, value, dots),
    stepBtn('+', 'Schneller', 1),
    h('button', { class: 'tp-btn mt-tap', 'aria-label': 'Tempo antippen', onClick: tap }, 'Tap'),
    h('button', { class: 'tp-btn', 'aria-label': 'Schließen', onClick: () => closeMetronome() }, icon('close', 'small')));
  host.append(bar);
  draw();
  current = { close: () => { stop(); bar.remove(); ctx?.close().catch(() => {}); ctx = null; } };
  return current;
}
