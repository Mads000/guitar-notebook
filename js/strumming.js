// Anschlagmuster: Symbole, Darstellung, Editor und Musterbibliothek.
// Block: { type: 'strum', name, grid: 8 | 16, strokes: [{ k: 'D' | 'U' | 'R' | 'X', a?: true }], repeat }
// D = Abschlag, U = Aufschlag, R = Pause, X = gedämpfter Schlag; a = Akzent.
import * as db from './storage.js';
import { h, sheet, segmented, stepper, icon, toast, ask, actionSheet, confirmDialog, clone } from './ui.js';
import { uid, now } from './songs.js';

const parse = (s) => s.split(' ').map((t) => ({ k: t[0] === '-' ? 'R' : t[0], ...(t.endsWith('>') ? { a: true } : {}) }));

export const PRESETS = [
  { id: 'p:pop', name: 'Pop / Folk', grid: 8, strokes: parse('D - D U - U D U') },
  { id: 'p:eighths', name: 'Durchgehende Achtel', grid: 8, strokes: parse('D U D U D U D U') },
  { id: 'p:quarters', name: 'Viertel', grid: 8, strokes: parse('D - D - D - D -') },
  { id: 'p:backbeat', name: 'Backbeat (Akzent 2 & 4)', grid: 8, strokes: parse('D - D> U D - D> U') },
  { id: 'p:ballad', name: 'Ballade', grid: 8, strokes: parse('D - - U - U D U') },
  { id: 'p:offbeat', name: 'Offbeat (Reggae)', grid: 8, strokes: parse('- U - U - U - U') },
  { id: 'p:chuck', name: 'Mit Dämpfer', grid: 8, strokes: parse('D - X U - U X U') },
  { id: 'p:waltz', name: 'Walzer 3/4', grid: 8, strokes: parse('D - D U D U') },
  { id: 'p:sixteenth', name: 'Funk 16tel', grid: 16, strokes: parse('D> U D U X U D U D U X U D U D U') },
];

const KIND_LABEL = { D: 'Ab', U: 'Auf', R: 'Pause', X: 'Dämpfer' };

export function countLabel(i, grid) {
  if (grid === 16) { const b = Math.floor(i / 4) + 1; return ['' + b, 'e', '&', 'a'][i % 4]; }
  return i % 2 ? '&' : String(Math.floor(i / 2) + 1);
}

export function strokeSVG(st) {
  const acc = st.a ? '<path class="st-acc" d="M5 2.5 15 5.5 5 8.5"/>' : '';
  let g = '';
  if (st.k === 'D') g = '<path d="M10 12v26M4.5 31.5 10 38.5l5.5-7"/>';
  else if (st.k === 'U') g = '<path d="M10 38V12M4.5 19 10 12l5.5 7"/>';
  else if (st.k === 'X') g = '<path d="M5 20l10 10M15 20 5 30"/>';
  else g = '<path class="st-rest" d="M7 25h6"/>';
  return `<svg class="stroke-svg${st.a ? ' accent' : ''}${st.k === 'R' ? ' rest' : ''}" viewBox="0 0 20 42" aria-hidden="true">${acc}${g}</svg>`;
}

export function strumView(block, { selected = -1, onSelect } = {}) {
  const row = h('div', { class: 'strum-row' });
  if (!block.strokes.length) return h('div', { class: 'strum empty-hint' }, 'Tippen, um ein Anschlagmuster zu erstellen');
  block.strokes.forEach((st, i) => {
    const cell = h(onSelect ? 'button' : 'span', {
      class: 'stroke' + (i === selected ? ' on' : '') + ((block.grid === 16 ? i % 4 === 0 : i % 2 === 0) ? ' beat' : ''),
      'aria-label': KIND_LABEL[st.k] + (st.a ? ' mit Akzent' : ''),
      html: strokeSVG(st),
      onClick: onSelect ? () => onSelect(i) : null,
    });
    cell.append(h('span', { class: 'cnt' }, countLabel(i, block.grid)));
    row.append(cell);
  });
  return h('div', { class: 'strum' },
    block.name && h('div', { class: 'strum-name' }, block.name),
    h('div', { class: 'strum-line' }, row, block.repeat > 1 && h('span', { class: 'repeat-badge' }, '×' + block.repeat)));
}

// ---------- Musterbibliothek ----------
export const listUserPatterns = async () => (await db.getAll('patterns')).sort((a, b) => a.name.localeCompare(b.name, 'de'));

async function saveAsPattern(block) {
  const name = await ask('Muster sichern', { value: block.name || '', placeholder: 'Name des Musters', ok: 'Sichern' });
  if (!name) return;
  const p = { id: 'p' + uid(), name, grid: block.grid, strokes: clone(block.strokes), createdAt: now(), updatedAt: now() };
  await db.put('patterns', p);
  block.name = name;
  toast('Muster gesichert');
}

export async function openPatternPicker(onPick, { manage = false } = {}) {
  const user = await listUserPatterns();
  const list = h('div', { class: 'pattern-list' });
  const render = () => list.replaceChildren(
    ...(user.length ? [h('div', { class: 'form-label' }, 'Eigene Muster')] : []),
    ...user.map((p) => patternRow(p, true)),
    h('div', { class: 'form-label', style: 'margin-top:12px' }, 'Vorlagen'),
    ...PRESETS.map((p) => patternRow(p, false)));
  const patternRow = (p, mine) => h('div', { class: 'pattern-row' },
    h('button', { class: 'pattern-main', onClick: () => { if (manage) return; s.close(); onPick(p); } },
      h('div', { class: 'pattern-title' }, p.name), strumView({ ...p, name: '', repeat: 1 })),
    mine && h('button', {
      class: 'row-more', 'aria-label': 'Optionen', onClick: () => actionSheet(p.name, [
        { label: 'Umbenennen', onClick: async () => { const n = await ask('Muster umbenennen', { value: p.name, ok: 'Sichern' }); if (n) { p.name = n; p.updatedAt = now(); await db.put('patterns', p); render(); } } },
        { label: 'Löschen', destructive: true, onClick: async () => { if (await confirmDialog('Muster löschen?', `„${p.name}“ wird aus der Bibliothek entfernt. Bereits eingefügte Muster bleiben erhalten.`, { ok: 'Löschen', destructive: true })) { await db.removeNow('patterns', p.id); user.splice(user.indexOf(p), 1); render(); } } },
      ]),
    }, icon('more')));
  const s = sheet({ title: manage ? 'Anschlagmuster' : 'Muster wählen', body: list, full: true, right: { label: 'Fertig', bold: true } });
  render();
  return s;
}

// ---------- Editor ----------
export function openStrumEditor(block, onChange) {
  let sel = block.strokes.length - 1;
  const view = h('div', { class: 'strum-stage' });
  const nameInput = h('input', { class: 'field', value: block.name, placeholder: 'Name (optional), z. B. Strophe' });
  nameInput.addEventListener('input', () => { block.name = nameInput.value; onChange(); });

  const changed = () => { onChange(); render(); };
  function render() {
    view.replaceChildren(strumView({ ...block, name: '', repeat: 1 }, { selected: sel, onSelect: (i) => { sel = sel === i ? -1 : i; render(); } }));
    if (!block.strokes.length) view.append(h('p', { class: 'hint center' }, 'Füge mit den Tasten unten Schläge hinzu.'));
    const cur = block.strokes[sel];
    accBtn.classList.toggle('on', !!cur?.a);
    accBtn.disabled = !cur;
    leftBtn.disabled = !cur || sel === 0;
    rightBtn.disabled = !cur || sel === block.strokes.length - 1;
    delBtn.disabled = !block.strokes.length;
    requestAnimationFrame(() => view.querySelector('.stroke.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }
  const add = (k) => { block.strokes.splice(sel + 1, 0, { k }); sel++; changed(); };
  const big = (k, label) => h('button', { class: 'strum-key', onClick: () => add(k), html: strokeSVG({ k }) }, h('span', null, label));
  const accBtn = h('button', { class: 'tool', onClick: () => { const c = block.strokes[sel]; if (!c) return; if (c.a) delete c.a; else c.a = true; changed(); } }, h('b', { class: 'acc-sym' }, '>'), h('span', null, 'Akzent'));
  const leftBtn = h('button', { class: 'tool', 'aria-label': 'Nach links', onClick: () => { const s = block.strokes; [s[sel - 1], s[sel]] = [s[sel], s[sel - 1]]; sel--; changed(); } }, icon('left'));
  const rightBtn = h('button', { class: 'tool', 'aria-label': 'Nach rechts', onClick: () => { const s = block.strokes; [s[sel + 1], s[sel]] = [s[sel], s[sel + 1]]; sel++; changed(); } }, icon('right'));
  const delBtn = h('button', {
    class: 'tool danger', onClick: () => {
      if (!block.strokes.length) return;
      const i = sel >= 0 ? sel : block.strokes.length - 1;
      block.strokes.splice(i, 1);
      sel = Math.min(i, block.strokes.length - 1);
      if (sel < 0 && block.strokes.length) sel = 0;
      changed();
    },
  }, icon('trash'), h('span', null, 'Löschen'));

  const body = h('div', { class: 'strum-editor' },
    nameInput,
    view,
    h('div', { class: 'tool-row' }, leftBtn, rightBtn, accBtn, delBtn),
    h('div', { class: 'strum-keys' }, big('D', 'Ab'), big('U', 'Auf'), big('R', 'Pause'), big('X', 'Dämpfer')),
    h('div', { class: 'form-group', style: 'margin-top:16px' },
      h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Raster'), segmented([{ value: 8, label: 'Achtel' }, { value: 16, label: 'Sechzehntel' }], block.grid, (v) => { block.grid = v; changed(); })),
      h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Wiederholungen'), stepper({ value: block.repeat || 1, min: 1, max: 16, format: (v) => '×' + v, onChange: (v) => { block.repeat = v; onChange(); } }))),
    h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn', onClick: () => openPatternPicker((p) => {
          block.strokes = clone(p.strokes);
          block.grid = p.grid;
          block.name = p.name;
          nameInput.value = p.name;
          sel = block.strokes.length - 1;
          changed();
        }),
      }, icon('music', 'small'), 'Muster laden'),
      h('button', { class: 'btn', onClick: async () => { if (!block.strokes.length) { toast('Das Muster ist noch leer.'); return; } await saveAsPattern(block); nameInput.value = block.name; onChange(); } }, icon('download', 'small'), 'Als Muster sichern')),
    h('p', { class: 'hint', style: 'margin-top:12px' }, 'Neue Schläge werden hinter dem markierten Schlag eingefügt. Gesicherte Muster kannst du in jedem Abschnitt wiederverwenden.'));

  const s = sheet({ title: 'Anschlagmuster', body, full: true, right: { label: 'Fertig', bold: true } });
  render();
  return s;
}
