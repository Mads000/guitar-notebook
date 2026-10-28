// Interaktive Einführung: legt einen Übungssong an und führt Schritt für Schritt durch die wichtigsten
// Handgriffe. Jeder Schritt hebt ein echtes Bedienelement hervor und geht weiter, sobald man es benutzt.
import * as db from './storage.js';
import { h, fill, icon, toast } from './ui.js';
import { newSong, newSection, newBlock, newChordItem, deleteSong } from './songs.js';

const $ = (sel) => (sel ? document.querySelector(sel) : null);

function practiceSong() {
  const s = newSong('Einführung: Mein erster Song');
  const sec = newSection('Strophe');
  const items = ['D', 'Dmaj7', 'D7', 'G'].map((n) => newChordItem(n));
  items[3].note = 'DD UU DU';
  items[3].rep = 2;
  sec.blocks = [
    newBlock('chords', { items, play: 'DDU UDU' }),
    newBlock('notes', { text: 'Ruhig anschlagen, beim G etwas lauter.' }),
  ];
  const ref = newSection('Refrain');
  ref.blocks = [newBlock('chords', { items: ['G', 'A', 'D'].map((n) => newChordItem(n)) })];
  Object.assign(s, { artist: 'Übung', sample: true, sections: [sec, ref] });
  return s;
}

// target: was hervorgehoben wird · done: Bedingung, mit der es automatisch weitergeht (sonst „Weiter“)
const STEPS = [
  { text: 'Willkommen bei Sorell! Diese kurze Einführung zeigt dir an einem Übungssong, wie alles funktioniert. Du probierst jeden Schritt direkt aus.' },
  { target: '.sv-chords', text: 'Oben stehen alle Griffe des Songs. Tippe zweimal schnell auf einen Griff, um ihn groß zu sehen.', done: () => !!$('.chord-zoom') },
  { target: '.cz-card', text: 'Mit ‹ › oder Wischen blätterst du durch die Griffe. Tippe neben die Karte, um sie zu schließen.', done: () => !$('.chord-zoom') },
  { target: '.song-view .sv-sec', text: 'Darunter die Abschnitte: oben der Anschlag für alle Akkorde, dann jeder Akkord mit seiner Spielweise und „×2“, wenn er wiederholt wird. Doppeltipp geht auch auf Akkordnamen.' },
  { target: '.song-nav .nav-more', text: 'Alles Weitere steckt im Menü oben rechts. Tippe auf •••.', done: () => !!$('.action-sheet') },
  { target: '.action-sheet .as-btn', text: 'Tippe auf „Bearbeiten“. Hier findest du auch Darstellung, „Display anlassen“ und das Stimmgerät.', done: () => !!$('.editor:not(.viewing) .sec') },
  { target: '.block-chords .block-main', text: 'Tippe auf die Akkordfolge – sie wechselt in den Bearbeitungsmodus.', done: () => !!$('.block.active') },
  { target: '.pe-chip[data-i="1"]', text: 'Tippe auf „Dmaj7“, um diesen Akkord auszuwählen.', done: () => !!$('.pe-chip.on[data-i]') },
  { target: '.pe-quick', text: 'Tippe einen Vorschlag an, z. B. „A“ – er ersetzt den markierten Akkord. Du kannst den Namen auch oben eintippen.', clickInside: true },
  { target: '.pe-tools', text: 'Mit ← → verschiebst du den markierten Akkord – oder gedrückt halten und ziehen. „Spielweise“ ist, was bei diesem Akkord gespielt wird (z. B. „DDU UDU“), mit ×1 daneben stellst du ein, wie oft er gespielt wird.' },
  { target: '.pe-plus', text: 'Das „+“ zeigt, wo neue Akkorde eingefügt werden. Tippe es an und wähle dann einen Vorschlag.', clickInside: true },
  { target: '.pe-done', text: 'Tippe auf „Fertig“, wenn die Folge stimmt. Jede Änderung ist sofort gespeichert.', done: () => !$('.block.active') },
  { target: '.add-block-btn', text: 'Mit dem „+“ am Ende eines Abschnitts fügst du direkt etwas hinzu. Tippe es an.', done: () => !!$('.pop-menu') },
  { target: '.pop-menu', text: 'Wähle „Notiz“ – der neue Block erscheint sofort im Song.', done: () => !$('.pop-menu') },
  { target: '.song-nav .nav-right', text: '↶ macht die letzte Änderung rückgängig. Unter ••• findest du Transponieren, PDF-Export und mehr.' },
  { target: '.nav-done', text: 'Mit „Fertig“ kommst du zurück zur ruhigen Ansicht zum Spielen. Tipp: Vom linken Bildschirmrand nach rechts wischen führt zurück zur Songliste.' },
  { text: 'Geschafft! Den Übungssong kannst du behalten oder gleich wieder löschen. Die Einführung findest du jederzeit in den Einstellungen.', last: true },
];

export async function startTour() {
  const song = practiceSong();
  await db.put('songs', song);
  location.hash = '#/song/' + encodeURIComponent(song.id);
  const hash = location.hash;

  let i = 0, raf = 0, clicked = false;
  const spot = h('div', { class: 'tour-spot' });
  const text = h('p', { class: 'tour-text' });
  const count = h('span', { class: 'tour-count' });
  const btns = h('div', { class: 'tour-btns' });
  const bubble = h('div', { class: 'tour-bubble', role: 'dialog', 'aria-live': 'polite' },
    h('div', { class: 'tour-top' }, count, h('button', { class: 'tour-x', 'aria-label': 'Einführung beenden', onClick: () => end() }, icon('close', 'small'))),
    text, btns);
  const layer = h('div', { class: 'tour' }, spot, bubble);
  // Tipps innerhalb des hervorgehobenen Elements zählen als „erledigt“
  const onClick = (e) => { const t = $(STEPS[i]?.target); if (t && t.contains(e.target)) clicked = true; };
  document.addEventListener('click', onClick, true);

  function show() {
    const st = STEPS[i];
    clicked = false;
    text.textContent = st.text;
    count.textContent = `${i + 1} / ${STEPS.length}`;
    const auto = st.done || st.clickInside;
    fill(btns,
      st.last && h('button', { class: 'tour-btn', onClick: async () => { await deleteSong(song); end(); location.hash = '#/'; toast('Übungssong gelöscht'); } }, 'Song löschen'),
      h('button', { class: 'tour-btn' + (auto ? '' : ' main'), onClick: () => (st.last ? end() : next()) }, st.last ? 'Behalten' : auto ? 'Überspringen' : 'Weiter'));
  }
  const next = () => { i++; if (i >= STEPS.length) end(); else show(); };

  // Jeden Frame: Ziel neu suchen (der Editor zeichnet sich oft neu), Licht und Sprechblase ausrichten
  function frame() {
    if (location.hash !== hash) { end(); return; }
    const st = STEPS[i];
    if ((st.done && st.done()) || (st.clickInside && clicked)) next();
    const t = $(STEPS[i]?.target);
    const vh = window.innerHeight, vw = window.innerWidth;
    if (t) {
      const r = t.getBoundingClientRect();
      if (r.bottom < 60 || r.top > vh - 60) t.scrollIntoView({ block: 'center' });
      Object.assign(spot.style, { display: 'block', left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
      const bh = bubble.offsetHeight;
      const below = r.bottom + 14 + bh < vh - 16;
      bubble.style.top = `${below ? r.bottom + 14 : Math.max(16, r.top - bh - 14)}px`;
    } else {
      spot.style.display = 'none';
      bubble.style.top = `${Math.max(16, (vh - bubble.offsetHeight) / 2)}px`;
    }
    bubble.style.left = `${Math.max(12, (vw - bubble.offsetWidth) / 2)}px`;
    layer.classList.toggle('dim', !t);
    raf = requestAnimationFrame(frame);
  }
  function end() {
    cancelAnimationFrame(raf);
    document.removeEventListener('click', onClick, true);
    layer.remove();
  }
  // Kurz warten, bis der Song geöffnet ist
  setTimeout(() => { document.body.append(layer); show(); raf = requestAnimationFrame(frame); }, 500);
}
