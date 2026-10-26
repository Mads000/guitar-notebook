// Akkorde: eingebaute Bibliothek, eigene Akkorde, SVG-Diagramme, Diagramm-Editor und Akkordauswahl.
// Ein Akkord ist reine Daten: frets[n] (von der linken Saite im Diagramm aus; -1 = gedämpft, 0 = leer),
// fingers[n] (0 = keine Angabe, 1–4, 5 = Daumen) und base (erster angezeigter Bund).
// n = 6 bei Gitarre (E A D G B e), n = 4 bei Ukulele (G C E A). Das Instrument ergibt sich aus der Saitenzahl.
import * as db from './storage.js';
import { h, fill, esc, clone, sheet, segmented, stepper, toggle, toast, confirmDialog, icon } from './ui.js';
import { uid, now, stringsOf, INSTRUMENTS } from './songs.js';

const RAW = [
  ['C', 'x32010', '032010'], ['D', 'xx0232', '000132'], ['E', '022100', '023100'], ['F', '133211', '134211'],
  ['G', '320003', '210003'], ['A', 'x02220', '001230'], ['B', 'x24442', '012341'],
  ['Am', 'x02210', '002310'], ['Bm', 'x24432', '013421'], ['Cm', 'x35543', '013421'], ['Dm', 'xx0231', '000231'],
  ['Em', '022000', '023000'], ['Fm', '133111', '134111'], ['Gm', '355333', '134111'], ['F#m', '244222', '134111'],
  ['C#m', 'x46654', '013421'], ['Bb', 'x13331', '012341'], ['Eb', 'x68886', '012341'], ['Ab', '466544', '134211'],
  ['Db', 'x46664', '012341'], ['A7', 'x02020', '002030'], ['B7', 'x21202', '021304'], ['C7', 'x32310', '032410'],
  ['D7', 'xx0212', '000213'], ['E7', '020100', '020100'], ['G7', '320001', '320001'], ['Am7', 'x02010', '002010'],
  ['Dm7', 'xx0211', '000211'], ['Em7', '020000', '020000'], ['Cmaj7', 'x32000', '032000'], ['Fmaj7', 'xx3210', '003210'],
  ['Dsus2', 'xx0230', '000130'], ['Dsus4', 'xx0233', '000134'], ['Asus2', 'x02200', '001200'], ['Asus4', 'x02230', '001230'],
  ['Esus4', '022200', '023400'], ['Cadd9', 'x32030', '021030'], ['E5', '022xxx', '012000'], ['A5', 'x022xx', '001200'],
  ['G5', '355xxx', '134000'],
];

// Ukulele in Standardstimmung G C E A (Saiten von links: G, C, E, A)
const RAW_UKE = [
  ['C', '0003', '0003'], ['D', '2220', '1230'], ['E', '4442', '2341'], ['F', '2010', '2010'], ['G', '0232', '0132'],
  ['A', '2100', '2100'], ['B', '4322', '3211'], ['Bb', '3211', '3211'], ['Eb', '0331', '0231'], ['Ab', '5343', '3121'], ['Db', '1114', '1114'],
  ['Am', '2000', '2000'], ['Bm', '4222', '3111'], ['Cm', '0333', '0111'], ['Dm', '2210', '2310'], ['Em', '0432', '0321'],
  ['Fm', '1013', '1024'], ['Gm', '0231', '0231'], ['F#m', '2120', '2130'], ['Bbm', '3111', '3111'],
  ['A7', '0100', '0100'], ['B7', '2322', '1211'], ['C7', '0001', '0001'], ['D7', '2223', '1112'], ['E7', '1202', '1203'],
  ['F7', '2313', '2314'], ['G7', '0212', '0213'], ['Am7', '0000', '0000'], ['Bm7', '2222', '1111'], ['Dm7', '2213', '2314'],
  ['Em7', '0202', '0102'], ['Cmaj7', '0002', '0001'], ['Fmaj7', '5500', '2300'], ['Gmaj7', '0222', '0123'],
  ['Asus4', '2200', '1200'], ['Gsus4', '0233', '0123'], ['Cadd9', '0203', '0102'],
];

function autoBase(frets) {
  const fretted = frets.filter((f) => f > 0);
  if (!fretted.length || Math.max(...fretted) <= 4) return 1;
  return Math.min(...fretted);
}

const build = (raw, prefix) => raw.map(([name, f, g]) => {
  const frets = [...f].map((c) => (c === 'x' ? -1 : Number(c)));
  return { id: prefix + name, name, frets, fingers: [...g].map(Number), base: autoBase(frets), showFingers: true, builtin: true };
});
export const BUILTIN = build(RAW, 'b:');
export const BUILTIN_UKE = build(RAW_UKE, 'bu:');
const builtinFor = (inst) => (inst === 'ukulele' ? BUILTIN_UKE : BUILTIN);

export const chordInstrument = (ch) => (ch?.frets?.length === 4 ? 'ukulele' : 'guitar');
const fits = (inst) => (c) => chordInstrument(c) === (inst === 'ukulele' ? 'ukulele' : 'guitar');

const COMMON = {
  guitar: ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'F', 'Bm', 'G7', 'Cadd9'],
  ukulele: ['C', 'G', 'Am', 'F', 'D', 'Em', 'Dm', 'A', 'G7', 'C7', 'E7', 'A7'],
};
export const commonNames = (inst) => COMMON[inst === 'ukulele' ? 'ukulele' : 'guitar'];

let userChords = [];
export async function loadUserChords() { userChords = await db.getAll('chords'); return userChords; }
// Songeigene Akkorde (mit songId) erscheinen nicht in der Bibliothek und ersetzen nie Akkorde anderer Songs.
const isGlobal = (c) => !c.songId;
export const getUserChords = (inst) => (inst ? userChords.filter((c) => isGlobal(c) && fits(inst)(c)) : userChords.filter(isGlobal));
export const allChords = (inst = 'guitar') => [...getUserChords(inst).sort((a, b) => a.name.localeCompare(b.name, 'de')), ...builtinFor(inst)];

// Erkennt Akkordnamen wie G, Am, F#m7, Bb, Cmaj7, Dsus4, Cadd9, G/B, Em7b5, C#m7(b5), Hm.
const CHORD_RE = /^[A-H][#b♯♭]?(?:m(?!aj)|min|maj|M|dim|aug|sus|add|°|ø|\+)?(?:maj|sus|add|dim|aug)?\d{0,2}(?:(?:sus|add|maj|no|b|#)\d{1,2})*(?:\([^()]{1,12}\))?(?:\/[A-H][#b♯♭]?)?$/;
export const isChordName = (t) => CHORD_RE.test(String(t || '').trim());
// Enthält ein Text Akkorde im Stil „[G]Liedtext“?
export const hasInlineChords = (text) => [...String(text || '').matchAll(/\[([^\]\s]{1,14})\]/g)].some((m) => isChordName(m[1]));
// Abschnitte mit Liedtext und Akkorden darüber brauchen in Lese- und PDF-Ansicht keine zusätzliche Akkordzeile.
export const chordsShownInText = (sec) => sec.blocks.some((b) => b.type === 'notes' && hasInlineChords(b.text));

const ENH = { 'C#': 'Db', Db: 'C#', 'D#': 'Eb', Eb: 'D#', 'F#': 'Gb', Gb: 'F#', 'G#': 'Ab', Ab: 'G#', 'A#': 'Bb', Bb: 'A#' };
function nameVariants(name) {
  const n = String(name || '').trim();
  const m = n.match(/^([A-H])([#b]?)(.*)$/);
  if (!m) return [n];
  let root = m[1] + m[2];
  if (m[1] === 'H') root = 'B' + m[2]; // deutsche Schreibweise H = B
  const out = [n, root + m[3]];
  if (ENH[root]) out.push(ENH[root] + m[3]);
  return [...new Set(out)];
}

// Liefert das Diagramm zu einem Akkord für das Instrument: verknüpfter eigener Akkord,
// sonst eigener oder eingebauter Akkord gleichen Namens. Diagramme des anderen Instruments werden nie verwendet.
export function findChord(name, chordId, inst = 'guitar') {
  const ok = fits(inst), builtin = builtinFor(inst);
  if (chordId) {
    const c = userChords.find((x) => x.id === chordId) || builtin.find((x) => x.id === chordId);
    if (c && ok(c)) return c;
  }
  for (const v of nameVariants(name)) {
    const u = userChords.filter((x) => x.name === v && ok(x) && isGlobal(x)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
    if (u) return u;
    const b = builtin.find((x) => x.name === v);
    if (b) return b;
  }
  return null;
}

export async function saveUserChord(ch) {
  ch.updatedAt = now();
  delete ch.builtin;
  const i = userChords.findIndex((x) => x.id === ch.id);
  if (i >= 0) userChords[i] = ch; else userChords.push(ch);
  await db.put('chords', ch);
  return ch;
}

export async function deleteUserChord(id) {
  userChords = userChords.filter((x) => x.id !== id);
  await db.removeNow('chords', id);
}

export function findBarres(ch) {
  const groups = {};
  (ch.frets || []).forEach((f, s) => {
    const fg = ch.fingers?.[s];
    if (f > 0 && fg > 0) (groups[f + ':' + fg] ||= []).push(s);
  });
  return Object.entries(groups).filter(([, ss]) => ss.length > 1).map(([k, ss]) => {
    const [fret, finger] = k.split(':').map(Number);
    return { fret, finger, from: Math.min(...ss), to: Math.max(...ss) };
  });
}

export const fingerLabel = (n) => (n === 5 ? 'T' : String(n));
export const DIAGRAM = { frets: 5, sx: 10, fy: 12, left: 13, right: 5, nameH: 15, markH: 10 };

// Linker Rand des Griffbretts: Ukulele-Diagramme (4 Saiten) stehen mittig in derselben Breite wie Gitarren-Diagramme.
export const diagramLeft = (n) => DIAGRAM.left + (6 - n) * DIAGRAM.sx / 2;

// SVG-Diagramm aus Akkorddaten (4 oder 6 Saiten). Mit hit = true entstehen unsichtbare Tippflächen für den Editor.
export function diagramSVG(ch, { name = true, hit = false } = {}) {
  const { frets: NF, sx: SX, fy: FY, markH: MH } = DIAGRAM;
  const base = ch.base || 1, frets = ch.frets || [], fingers = ch.fingers || [];
  const NS = frets.length === 4 ? 4 : 6, LS = NS - 1;
  const L = diagramLeft(NS);
  const NH = name ? DIAGRAM.nameH : 2;
  const top = NH + MH, W = DIAGRAM.left + SX * 5 + DIAGRAM.right, H = top + FY * NF + 3;
  const X = (s) => L + s * SX, Y = (rel) => top + (rel - 0.5) * FY;
  const show = ch.showFingers !== false;
  let o = `<svg class="chord-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ch.name || 'Akkord')}">`;
  if (name) o += `<text class="cd-name" x="${(X(0) + X(LS)) / 2}" y="11" text-anchor="middle">${esc(ch.name || '?')}</text>`;
  for (let i = 0; i <= NF; i++) o += `<line class="cd-line" x1="${L}" x2="${X(LS)}" y1="${top + i * FY}" y2="${top + i * FY}"/>`;
  for (let s = 0; s < NS; s++) o += `<line class="cd-line" x1="${X(s)}" x2="${X(s)}" y1="${top}" y2="${top + NF * FY}"/>`;
  if (base === 1) o += `<rect class="cd-nut" x="${L - 0.5}" y="${top - 2.6}" width="${SX * LS + 1}" height="2.8" rx=".6"/>`;
  else o += `<text class="cd-base" x="${L - 3}" y="${Y(1) + 2.4}" text-anchor="end">${base}</text>`;
  for (let s = 0; s < NS; s++) {
    const f = frets[s], x = X(s), y = top - 5.4;
    if (f === -1) o += `<path class="cd-mute" d="M${x - 2.1} ${y - 2.1}l4.2 4.2M${x + 2.1} ${y - 2.1}l-4.2 4.2"/>`;
    else if (f === 0) o += `<circle class="cd-open" cx="${x}" cy="${y}" r="2.3"/>`;
  }
  const covered = new Set();
  for (const b of findBarres(ch)) {
    const rel = b.fret - base + 1;
    if (rel < 1 || rel > NF) continue;
    for (let s = b.from; s <= b.to; s++) if (frets[s] === b.fret && fingers[s] === b.finger) covered.add(s);
    const y = Y(rel);
    o += `<rect class="cd-dot" x="${X(b.from) - 3.9}" y="${y - 3.9}" width="${X(b.to) - X(b.from) + 7.8}" height="7.8" rx="3.9"/>`;
    if (show) o += `<text class="cd-num" x="${(X(b.from) + X(b.to)) / 2}" y="${y + 2}" text-anchor="middle">${fingerLabel(b.finger)}</text>`;
  }
  for (let s = 0; s < NS; s++) {
    const f = frets[s];
    if (!(f > 0) || covered.has(s)) continue;
    const rel = f - base + 1;
    if (rel < 1 || rel > NF) continue;
    o += `<circle class="cd-dot" cx="${X(s)}" cy="${Y(rel)}" r="3.9"/>`;
    if (show && fingers[s] > 0) o += `<text class="cd-num" x="${X(s)}" y="${Y(rel) + 2}" text-anchor="middle">${fingerLabel(fingers[s])}</text>`;
  }
  if (hit) {
    for (let s = 0; s < NS; s++) {
      o += `<rect class="cd-hit" data-s="${s}" data-r="0" x="${X(s) - SX / 2}" y="${top - MH}" width="${SX}" height="${MH}"/>`;
      for (let r = 1; r <= NF; r++) o += `<rect class="cd-hit" data-s="${s}" data-r="${r}" x="${X(s) - SX / 2}" y="${top + (r - 1) * FY}" width="${SX}" height="${FY}"/>`;
    }
  }
  return o + '</svg>';
}

export function chordCard(ch, onClick, extraCls = '') {
  return h('button', { class: 'chord-card ' + extraCls, html: diagramSVG(ch), 'aria-label': ch.name, onClick });
}

const emptyChord = (name = '', n = 6) => ({ name, frets: Array(n).fill(0), fingers: Array(n).fill(0), base: 1, showFingers: true });

// ---------- Diagramm-Editor ----------
// chord: vorhandener Akkord (eigener → bearbeiten, eingebauter → Variante) oder null für neu.
// instrument bestimmt die Saitenzahl eines neuen Akkords; ein vorhandener behält seine.
// songId: aus einem Song geöffnet – dann kann der Griff nur für diesen Song gelten (gleicher Name, anderes Muster).
export function openDiagramEditor({ chord = null, name = '', instrument = 'guitar', onSave, onDelete, songId = null } = {}) {
  if (chord && chordInstrument(chord) !== (instrument === 'ukulele' ? 'ukulele' : 'guitar')) chord = null;
  const isUser = !!(chord && !chord.builtin && userChords.some((c) => c.id === chord.id));
  const strings = chord ? chord.frets.length : stringsOf(instrument);
  const instLabel = INSTRUMENTS[strings === 4 ? 'ukulele' : 'guitar'].label;
  const work = chord ? clone(chord) : emptyChord(name, strings);
  delete work.builtin;
  let finger = 1;

  const nameInput = h('input', { class: 'field chord-name-input', value: work.name, placeholder: 'Name, z. B. Am7', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
  nameInput.addEventListener('input', () => { work.name = nameInput.value.trim(); draw(); });
  const stage = h('div', { class: 'diagram-stage' });
  const fingerSeg = segmented(
    [{ value: 0, label: '•' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }, { value: 5, label: 'T' }],
    finger, (v) => { finger = v; });
  const baseStep = stepper({
    value: work.base, min: 1, max: 20, format: (v) => `${v}. Bund`,
    onChange: (v) => {
      const d = v - work.base;
      work.frets = work.frets.map((f) => (f > 0 ? Math.max(1, f + d) : f));
      work.base = v;
      draw();
    },
  });
  const showToggle = toggle(work.showFingers !== false, (v) => { work.showFingers = v; draw(); });
  // Standard aus einem Song: eigener Griff nur für diesen Song (außer man bearbeitet bewusst einen globalen eigenen Akkord)
  let onlySong = !!songId && (!isUser || !!chord?.songId);
  const scopeToggle = songId && toggle(onlySong, (v) => { onlySong = v; });

  function draw() { stage.innerHTML = diagramSVG(work, { hit: true }); }

  stage.addEventListener('click', (e) => {
    const t = e.target.closest('[data-s]');
    if (!t) return;
    const s = Number(t.dataset.s), r = Number(t.dataset.r);
    if (r === 0) {
      work.frets[s] = work.frets[s] === -1 ? 0 : -1;
      work.fingers[s] = 0;
    } else {
      const fret = work.base + r - 1;
      if (work.frets[s] === fret) {
        if (finger && work.fingers[s] !== finger) work.fingers[s] = finger;
        else { work.frets[s] = 0; work.fingers[s] = 0; }
      } else {
        work.frets[s] = fret;
        work.fingers[s] = finger;
      }
    }
    draw();
  });

  async function save(asCopy) {
    if (!work.name) { toast('Bitte gib dem Akkord einen Namen.'); nameInput.focus(); return; }
    const ch = clone(work);
    const scope = songId && onlySong ? songId : null;
    // Neuer Datensatz, wenn ein mitgelieferter Akkord abgewandelt wird oder ein globaler Akkord nur für diesen Song gelten soll
    if (!isUser || asCopy || (scope && !chord?.songId)) { ch.id = 'u' + uid(); ch.createdAt = now(); }
    if (scope) ch.songId = scope; else delete ch.songId;
    await saveUserChord(ch);
    toast(asCopy ? 'Kopie gesichert' : 'Akkord gesichert');
    s.close();
    if (onSave) onSave(ch);
  }

  const body = h('div', { class: 'diagram-editor' },
    nameInput,
    stage,
    h('p', { class: 'hint center' }, 'Tippe auf einen Bund, um einen Finger zu setzen; erneut tippen entfernt ihn. Oben über dem Griffbrett: leer ○ / gedämpft ×.'),
    h('div', { class: 'form-label' }, 'Finger für neue Punkte'),
    fingerSeg,
    h('div', { class: 'form-group', style: 'margin-top:16px' },
      h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Lage', h('small', null, 'verschiebt den ganzen Griff')), baseStep),
      h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Fingerzahlen anzeigen'), showToggle),
      scopeToggle && h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Nur für diesen Song', h('small', null, 'gleicher Name, eigener Griff – andere Songs bleiben unverändert')), scopeToggle)),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onClick: () => { const n = work.name; Object.assign(work, emptyChord(n, strings)); baseStep.set(1); draw(); } }, 'Leeren'),
      isUser && h('button', { class: 'btn', onClick: () => save(true) }, icon('copy', 'small'), 'Als Kopie'),
      isUser && h('button', {
        class: 'btn danger',
        onClick: async () => {
          if (!(await confirmDialog('Akkord löschen?', `„${chord.name}“ wird aus deinen Akkorden entfernt. Songs behalten den Akkordnamen.`, { ok: 'Löschen', destructive: true }))) return;
          await deleteUserChord(chord.id);
          s.close();
          if (onDelete) onDelete(chord);
        },
      }, 'Löschen')));

  const s = sheet({
    title: (isUser ? (chord.songId ? 'Griff in diesem Song' : 'Akkord bearbeiten') : chord ? 'Variante erstellen' : 'Neuer Akkord') + (strings === 4 ? ` (${instLabel})` : ''),
    body, full: true,
    left: { label: 'Abbrechen' },
    right: { label: 'Sichern', bold: true, onClick: () => save(false) },
  });
  draw();
  return s;
}

// ---------- Akkordbibliothek / Auswahl ----------
// Mit onPick wird die Bibliothek zur Auswahl (Tippen übernimmt den Akkord).
// instrument: Gitarre oder Ukulele; ohne Auswahl (Einstellungen) lässt sich das Instrument oben umschalten.
export function openChordLibrary({ onPick, initial = '', instrument = null } = {}) {
  let q = initial, filter = 'all';
  let inst = instrument || 'guitar';
  const search = h('input', { class: 'field', type: 'search', placeholder: onPick ? 'Akkord suchen oder eingeben' : 'Akkord suchen', value: q, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
  const grid = h('div', { class: 'chord-grid' });
  const extra = h('div');

  function render() {
    const query = q.trim().toLowerCase();
    let list = filter === 'mine' ? getUserChords(inst).sort((a, b) => a.name.localeCompare(b.name, 'de')) : allChords(inst);
    if (query) list = list.filter((c) => c.name.toLowerCase().includes(query));
    grid.replaceChildren(...list.map((c) => {
      const card = chordCard(c, () => {
        if (onPick) { s.close(); onPick(c); } else openDiagramEditor({ chord: c, instrument: inst, onSave: render, onDelete: render });
      });
      if (!c.builtin) card.append(h('span', { class: 'chord-card-tag' }, 'Eigen'));
      return card;
    }));
    if (!list.length) grid.append(h('p', { class: 'hint', style: 'grid-column:1/-1;text-align:center;padding:20px 0' }, filter === 'mine' ? 'Noch keine eigenen Akkorde.' : 'Kein Akkord gefunden.'));
    const typed = q.trim();
    fill(extra,
      onPick && typed && !list.some((c) => c.name === typed)
        ? h('button', { class: 'btn block', onClick: () => { s.close(); onPick({ name: typed }); } }, `„${typed}“ ohne Diagramm übernehmen`)
        : null);
  }

  search.addEventListener('input', () => { q = search.value; render(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter' && onPick && q.trim()) { const c = findChord(q.trim(), null, inst); s.close(); onPick(c || { name: q.trim() }); } });

  const body = h('div', null,
    !instrument && h('div', { style: 'margin-bottom:12px' }, segmented(Object.entries(INSTRUMENTS).map(([value, i]) => ({ value, label: i.label })), inst, (v) => { inst = v; render(); })),
    search,
    h('div', { style: 'margin:12px 0' }, segmented([{ value: 'all', label: 'Alle' }, { value: 'mine', label: 'Eigene' }], filter, (v) => { filter = v; render(); })),
    extra,
    grid,
    h('button', {
      class: 'btn block', style: 'margin-top:16px',
      onClick: () => openDiagramEditor({ name: q.trim(), instrument: inst, onSave: (c) => { if (onPick) { s.close(); onPick(c); } else render(); } }),
    }, icon('plus', 'small'), 'Neuer Akkord mit Diagramm'),
    !onPick && h('p', { class: 'hint', style: 'margin-top:12px' }, 'Tippe auf einen eingebauten Akkord, um eine eigene Variante zu erstellen. Eigene Akkorde lassen sich bearbeiten, kopieren und löschen.'));

  const s = sheet({ title: onPick ? (inst === 'ukulele' ? 'Ukulele-Akkord wählen' : 'Akkord wählen') : 'Akkorde', body, full: true, right: { label: onPick ? 'Abbrechen' : 'Fertig', bold: !onPick } });
  render();
  return s;
}
