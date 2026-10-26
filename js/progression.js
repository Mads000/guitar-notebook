// Akkordfolgen: Darstellung im Song und Bearbeitungsblatt.
// Block: { type: 'chords', items: [{ id, name, chordId?, dur?: { n, unit: 'beats' | 'bars' } }], repeat }
import { h, sheet, segmented, stepper, icon, clone } from './ui.js';
import { newChordItem, uid, instrumentOf } from './songs.js';
import { findChord, openChordLibrary, openDiagramEditor, commonNames, songChordList, chordLabels, linkChord, diagramSVG } from './chords.js';

export function durLabel(d) {
  if (!d || !d.n) return '';
  if (d.unit === 'bars') return d.n === 1 ? '1 Takt' : `${d.n} Takte`;
  return d.n === 1 ? '1 Schlag' : `${d.n} Schläge`;
}

// labels: optional Map(Griff-ID → „C#m (2)“), damit mehrere Varianten unterscheidbar sind
export function progressionView(block, inst = 'guitar', labels = null) {
  if (!block.items.length) return h('div', { class: 'prog empty-hint' }, 'Tippen, um Akkorde hinzuzufügen');
  const el = h('div', { class: 'prog' });
  block.items.forEach((it, i) => {
    if (i) el.append(h('span', { class: 'prog-arrow', 'aria-hidden': 'true' }, '→'));
    const d = durLabel(it.dur);
    const ch = findChord(it.name, it.chordId, inst);
    el.append(h('span', { class: 'prog-chord' + (ch ? '' : ' nodiagram') }, h('b', null, (ch && labels?.get(ch.id)) || it.name), d && h('small', null, d)));
  });
  if (block.repeat > 1) el.append(h('span', { class: 'repeat-badge' }, '×' + block.repeat));
  return el;
}

// Mehrere Akkorde auf einmal: „G D Em C“, „Fm → Db → Ab“, „Am, F, C“
const splitChords = (text) => text.split(/[\s,;|→]+/).map((t) => t.trim()).filter(Boolean);

export function openProgressionEditor(block, song, onChange) {
  const inst = instrumentOf(song);
  let sel = block.items.length ? block.items.length - 1 : -1;
  const chips = h('div', { class: 'prog-edit' });
  const tools = h('div', { class: 'prog-tools' });
  const quick = h('div', { class: 'quick-chords' });
  const input = h('input', { class: 'field', placeholder: 'Akkord eingeben, z. B. Am oder G D Em C', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });

  const changed = () => { onChange(); render(); };

  function insert(name, chordId) {
    const item = newChordItem(name, chordId);
    block.items.splice(sel + 1, 0, item);
    sel += 1;
  }

  function addFromInput() {
    const names = splitChords(input.value);
    if (!names.length) return;
    names.forEach((n) => insert(n));
    input.value = '';
    changed();
  }

  // Variante für einen Akkord wählen (Standard oder einer der Song-Griffe mit gleichem Namen) oder neu anlegen
  function pickVariant(it) {
    const cur = findChord(it.name, it.chordId, inst);
    const list = songChordList(song, inst).filter((x) => x.name === it.name);
    const def = findChord(it.name, null, inst);
    if (def && !list.some((x) => x.ch.id === def.id)) list.unshift({ ch: def, label: it.name + ' (Standard)' });
    const card = (x) => h('button', {
      class: 'chord-card variant-card' + (cur && x.ch.id === cur.id ? ' on' : ''), html: diagramSVG({ ...x.ch, name: x.label }), 'aria-label': `${x.label} verwenden`,
      onClick: () => { linkChord(it, x.ch); vs.close(); changed(); },
    });
    const body = h('div', null,
      h('p', { class: 'hint' }, `Welcher Griff soll für dieses ${it.name} gelten? Die anderen Stellen im Song bleiben unverändert.`),
      h('div', { class: 'variant-grid' }, list.map(card),
        h('button', { class: 'chord-card variant-card add', onClick: () => {
          vs.close();
          const base = cur ? { ...clone(cur), id: undefined, builtin: false } : null;
          openDiagramEditor({ chord: base, name: it.name, instrument: inst, songId: song.id, onSave: (c) => { linkChord(it, c); changed(); } });
        } }, icon('plus'), h('span', null, 'Neue Variante'))));
    const vs = sheet({ title: `Griff für ${it.name}`, body, right: { label: 'Fertig', bold: true } });
  }

  function render() {
    const labels = chordLabels(song, inst);
    const lbl = (it) => { const ch = findChord(it.name, it.chordId, inst); return (ch && labels.get(ch.id)) || it.name; };
    chips.replaceChildren(...(block.items.length ? block.items.map((it, i) => h('button', {
      class: 'chip' + (i === sel ? ' on' : ''),
      onClick: () => { sel = sel === i ? -1 : i; render(); },
    }, h('b', null, lbl(it)), durLabel(it.dur) && h('small', null, durLabel(it.dur)))) : [h('p', { class: 'hint' }, 'Noch keine Akkorde. Gib unten Akkordnamen ein oder tippe auf einen Vorschlag.')]));

    const it = block.items[sel];
    tools.replaceChildren();
    if (it) {
      const unitSeg = segmented([{ value: '', label: 'Ohne' }, { value: 'beats', label: 'Schläge' }, { value: 'bars', label: 'Takte' }], it.dur?.unit || '', (v) => {
        if (!v) delete it.dur; else it.dur = { n: it.dur?.n || (v === 'bars' ? 1 : 4), unit: v };
        changed();
      });
      tools.append(
        h('div', { class: 'tool-row' },
          h('button', { class: 'tool', 'aria-label': 'Nach links', disabled: sel === 0, onClick: () => { [block.items[sel - 1], block.items[sel]] = [block.items[sel], block.items[sel - 1]]; sel--; changed(); } }, icon('left')),
          h('button', { class: 'tool', 'aria-label': 'Nach rechts', disabled: sel === block.items.length - 1, onClick: () => { [block.items[sel + 1], block.items[sel]] = [block.items[sel], block.items[sel + 1]]; sel++; changed(); } }, icon('right')),
          h('button', { class: 'tool', onClick: () => { const c = { ...it, id: uid() }; if (it.dur) c.dur = { ...it.dur }; block.items.splice(sel + 1, 0, c); sel++; changed(); } }, icon('copy'), h('span', null, 'Duplizieren')),
          h('button', {
            class: 'tool', onClick: () => openDiagramEditor({
              chord: findChord(it.name, it.chordId, inst), name: it.name, instrument: inst, songId: song?.id,
              onSave: (c) => {
                // Gilt für alle Stellen, die genau diesen Griff verwenden – andere Varianten bleiben unberührt
                const oldId = findChord(it.name, it.chordId, inst)?.id;
                const all = song ? song.sections.flatMap((sec) => sec.blocks.filter((b) => b.type === 'chords').flatMap((b) => b.items)) : [];
                for (const x of new Set([it, ...all.filter((x) => oldId && findChord(x.name, x.chordId, inst)?.id === oldId)])) linkChord(x, c);
                changed();
              },
            }),
          }, icon('grid'), h('span', null, 'Diagramm')),
          h('button', { class: 'tool', onClick: () => pickVariant(it) }, icon('copy'), h('span', null, 'Variante')),
          h('button', { class: 'tool danger', onClick: () => { block.items.splice(sel, 1); sel = Math.min(sel, block.items.length - 1); changed(); } }, icon('trash'), h('span', null, 'Entfernen'))),
        h('div', { class: 'tool-row dur-row' },
          h('span', { class: 'tool-label' }, `Dauer von ${it.name}`),
          unitSeg,
          it.dur && stepper({ value: it.dur.n, min: 1, max: 32, onChange: (v) => { it.dur.n = v; changed(); } })));
    }

    // Zuerst die Griffe des Songs (inkl. Varianten), dann gängige Akkorde
    const own = songChordList(song, inst);
    const rest = commonNames(inst).filter((n) => !own.some((x) => x.name === n)).slice(0, Math.max(0, 18 - own.length));
    quick.replaceChildren(
      ...own.map((x) => h('button', { class: 'pill', onClick: () => { insert(x.name, x.ch.builtin ? undefined : x.ch.id); changed(); } }, x.label)),
      ...rest.map((n) => h('button', { class: 'pill', onClick: () => { insert(n); changed(); } }, n)));
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFromInput(); } });

  const repeat = stepper({ value: block.repeat || 1, min: 1, max: 16, format: (v) => '×' + v, onChange: (v) => { block.repeat = v; onChange(); } });

  const body = h('div', null,
    chips,
    tools,
    h('div', { class: 'add-chord-row' },
      input,
      h('button', { class: 'btn primary', 'aria-label': 'Hinzufügen', onClick: addFromInput }, icon('plus')),
      h('button', {
        class: 'btn', 'aria-label': 'Aus Bibliothek', onClick: () => openChordLibrary({
          initial: input.value.trim(), instrument: inst,
          onPick: (c) => { insert(c.name, c.id && !c.builtin ? c.id : undefined); input.value = ''; changed(); },
        }),
      }, icon('grid'))),
    h('div', { class: 'form-label', style: 'margin-top:14px' }, 'Vorschläge'),
    quick,
    h('div', { class: 'form-group', style: 'margin-top:18px' },
      h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, 'Wiederholungen', h('small', null, 'wie oft die Folge gespielt wird')), repeat)),
    h('p', { class: 'hint' }, 'Neue Akkorde werden hinter dem markierten Akkord eingefügt. Tippe einen Akkord an, um ihn zu verschieben, zu kopieren, ihm eine Dauer oder ein eigenes Diagramm zu geben.'));

  const s = sheet({ title: 'Akkordfolge', body, full: true, right: { label: 'Fertig', bold: true } });
  render();
  return s;
}
