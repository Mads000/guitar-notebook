// Akkordfolgen: Darstellung im Song und Bearbeitung direkt an Ort und Stelle.
// Block: { type: 'chords', items: [{ id, name, chordId?, dur?: { n, unit: 'beats' | 'bars' }, note?, rep? }], repeat, play? }
// note: Spielweise je Akkord, z. B. „P(1,3,4) – P2“; rep: wie oft dieser Akkord (mit seiner Spielweise) gespielt wird;
// play: Spielweise/Anschlag für die ganze Folge; repeat: wie oft die ganze Folge gespielt wird.
import { h, sheet, segmented, stepper, icon, clone, haptic } from './ui.js';
import { newChordItem, uid, instrumentOf } from './songs.js';
import { findChord, openChordLibrary, openDiagramEditor, commonNames, songChordList, chordLabels, linkChord, diagramSVG } from './chords.js';

export function durLabel(d) {
  if (!d || !d.n) return '';
  if (d.unit === 'bars') return d.n === 1 ? '1 Takt' : `${d.n} Takte`;
  return d.n === 1 ? '1 Schlag' : `${d.n} Schläge`;
}

// Eine Zeile je Akkord: Name links, daneben die Spielweise und ggf. „×2“ (Wiederholung dieses Akkords).
// Über der Liste steht die Spielweise für die ganze Folge (block.play), z. B. das Anschlagmuster.
// labels: optional Map(Griff-ID → „C#m (2)“), damit mehrere Varianten unterscheidbar sind
export function progressionView(block, inst = 'guitar', labels = null) {
  if (!block.items.length) return h('div', { class: 'prog empty-hint' }, 'Tippen, um Akkorde hinzuzufügen');
  const list = h('div', { class: 'prog-list' }, block.items.map((it) => {
    const ch = findChord(it.name, it.chordId, inst);
    const label = (ch && labels?.get(ch.id)) || it.name;
    const m = label.match(/^(.*) \((\d+)\)$/);
    return h('div', { class: 'pl-row' },
      h('span', { class: 'prog-chord pl-chord' + (ch ? '' : ' nodiagram'), 'data-name': it.name, 'data-chord': ch?.id || null },
        h('b', null, m ? m[1] : label, m && h('sup', { class: 'prog-var', 'aria-label': `Variante ${m[2]}` }, m[2]))),
      h('span', { class: 'pl-note' }, it.note || '', durLabel(it.dur) && h('span', { class: 'pl-dur' }, durLabel(it.dur)), it.rep > 1 && h('span', { class: 'pl-rep' }, '×' + it.rep)));
  }));
  return h('div', { class: 'prog-block' },
    block.play && h('div', { class: 'prog-play' }, block.play),
    h('div', { class: 'prog-wrap' }, list, block.repeat > 1 && h('span', { class: 'repeat-badge', title: 'Ganze Folge wiederholen' }, '×' + block.repeat)));
}

// Mehrere Akkorde auf einmal: „G D Em C“, „Fm → Db → Ab“, „Am, F, C“
const splitChords = (text) => text.split(/[\s,;|→]+/).map((t) => t.trim()).filter(Boolean);
const songItems = (song) => song.sections.flatMap((sec) => sec.blocks.filter((b) => b.type === 'chords').flatMap((b) => b.items));

// Variante für einen Akkord wählen (Standard oder einer der Song-Griffe mit gleichem Namen) oder neu anlegen
function pickVariant(it, song, inst, changed) {
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
      } }, icon('plus'), h('span', null, 'Neue Variante'))),
    h('button', { class: 'btn block', style: 'margin-top:16px', onClick: () => {
      vs.close();
      openDiagramEditor({
        chord: cur, name: it.name, instrument: inst, songId: song.id,
        onSave: (c) => {
          // Gilt für alle Stellen, die genau diesen Griff verwenden – andere Varianten bleiben unberührt
          const oldId = cur?.id;
          for (const x of new Set([it, ...songItems(song).filter((x) => oldId && findChord(x.name, x.chordId, inst)?.id === oldId)])) linkChord(x, c);
          changed();
        },
      });
    } }, icon('pencil', 'small'), 'Diesen Griff bearbeiten'));
  const vs = sheet({ title: `Griff für ${it.name}`, body, right: { label: 'Fertig', bold: true } });
}

// Bearbeitungsmodus direkt im Song: Akkorde antippen (ersetzen, verschieben, entfernen), „+“ fügt ein,
// gedrückt halten und ziehen sortiert um. state ({ sel, at, dur }) überlebt das Neuzeichnen des Editors.
export function progressionEditor(block, song, { state, onChange, onDone }) {
  const inst = instrumentOf(song);
  if (state.at == null || state.at > block.items.length) state.at = block.items.length;
  if (state.sel >= block.items.length) state.sel = -1;
  const chips = h('div', { class: 'pe-chips' });
  const tools = h('div', { class: 'pe-tools' });
  const quick = h('div', { class: 'pe-quick' });
  const input = h('input', { class: 'field pe-input', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Akkordname' });
  const changed = () => { onChange(); render(); };

  // Ein Akkord ausgewählt → Eingabe ersetzt ihn; sonst wird an der „+“-Stelle eingefügt
  function apply(names, chordId) {
    if (!names.length) return;
    const it = block.items[state.sel];
    if (it) {
      it.name = names[0];
      if (chordId) it.chordId = chordId; else delete it.chordId;
      const extra = names.slice(1).map((n) => newChordItem(n));
      block.items.splice(state.sel + 1, 0, ...extra);
      state.sel += extra.length;
    } else {
      block.items.splice(state.at, 0, ...names.map((n, i) => newChordItem(n, i === 0 ? chordId : undefined)));
      state.at += names.length;
    }
    changed();
  }
  function fromInput() {
    const names = splitChords(input.value);
    input.value = '';
    apply(names);
  }
  const select = (i) => { haptic(); state.sel = i; state.dur = false; state.note = !!block.items[i]?.note; render(); };
  const insertAt = (i) => { state.sel = -1; state.at = i; state.dur = false; state.note = false; render(); };
  function move(d) {
    const i = state.sel, j = i + d;
    if (j < 0 || j >= block.items.length) return;
    [block.items[i], block.items[j]] = [block.items[j], block.items[i]];
    state.sel = j;
    changed();
  }

  function render() {
    const labels = chordLabels(song, inst);
    const lbl = (it) => { const ch = findChord(it.name, it.chordId, inst); return (ch && labels.get(ch.id)) || it.name; };
    const plus = (cur) => h('button', { class: 'pe-chip pe-plus' + (cur ? ' on' : ''), 'aria-label': 'Hier einfügen', onClick: () => insertAt(block.items.length) }, icon('plus', 'small'));
    const list = block.items.map((it, i) => h('button', {
      class: 'pe-chip' + (i === state.sel ? ' on' : '') + (it.note ? ' has-note' : ''), 'data-i': i, 'aria-pressed': String(i === state.sel),
      onClick: () => (state.sel === i ? insertAt(block.items.length) : select(i)),
    }, h('b', null, lbl(it)), (durLabel(it.dur) || it.rep > 1) && h('small', null, [durLabel(it.dur), it.rep > 1 && '×' + it.rep].filter(Boolean).join(' · '))));
    // Die Einfügestelle wird als „+“ direkt in der Folge gezeigt
    if (state.sel < 0) list.splice(state.at, 0, plus(true));
    else list.push(plus(false));
    chips.replaceChildren(...list);

    const it = block.items[state.sel];
    tools.replaceChildren();
    if (it) {
      const t = (iconName, label, onClick, cls = '') => h('button', { class: 'pe-tool ' + cls, 'aria-label': label, title: label, onClick }, icon(iconName, 'small'), h('span', null, label));
      tools.append(h('div', { class: 'pe-row' },
        h('button', { class: 'pe-tool icon-only', 'aria-label': 'Nach links', disabled: state.sel === 0, onClick: () => move(-1) }, icon('left', 'small')),
        h('button', { class: 'pe-tool icon-only', 'aria-label': 'Nach rechts', disabled: state.sel === block.items.length - 1, onClick: () => move(1) }, icon('right', 'small')),
        t('plus', 'Danach', () => insertAt(state.sel + 1)),
        t('pick', 'Spielweise', () => { state.note = !state.note; state.dur = false; render(); if (state.note) tools.querySelector('.pe-note')?.focus(); }, state.note || it.note ? 'on' : ''),
        h('span', { class: 'pe-rep-tool' }, stepper({ value: it.rep || 1, min: 1, max: 16, format: (v) => '×' + v, onChange: (v) => { if (v > 1) it.rep = v; else delete it.rep; changed(); } })),
        t('clock', 'Dauer', () => { state.dur = !state.dur; state.note = false; render(); }, state.dur ? 'on' : ''),
        t('grid', 'Griff', () => pickVariant(it, song, inst, changed)),
        h('button', { class: 'pe-tool icon-only', 'aria-label': 'Kopie dahinter', title: 'Kopie dahinter', onClick: () => { const c = { ...it, id: uid() }; if (it.dur) c.dur = { ...it.dur }; block.items.splice(state.sel + 1, 0, c); state.sel++; changed(); } }, icon('copy', 'small')),
        h('button', { class: 'pe-tool icon-only danger', 'aria-label': 'Entfernen', title: 'Entfernen', onClick: () => { block.items.splice(state.sel, 1); state.at = state.sel; state.sel = -1; changed(); } }, icon('trash', 'small'))));
      if (state.note) {
        const ni = h('input', { class: 'field pe-note', value: it.note || '', placeholder: 'z. B. DDU UDU oder P(1,3,4) – P2', autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'done', 'aria-label': `Spielweise für ${it.name}` });
        // Speichern ohne Neuzeichnen, damit die Tastatur offen bleibt; nur die Markierung im Chip nachziehen
        ni.addEventListener('input', () => {
          const v = ni.value.trim();
          if (v) it.note = ni.value; else delete it.note;
          onChange();
          const chip = chips.querySelector(`.pe-chip[data-i="${state.sel}"]`);
          chip?.classList.toggle('has-note', !!v);
        });
        ni.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ni.blur(); state.note = false; render(); } });
        tools.append(h('div', { class: 'pe-row pe-noterow' }, ni,
          h('span', { class: 'pe-note-hint' }, 'Was bei diesem Akkord gespielt wird. Wiederholungen stellst du mit ×1 daneben ein.')));
      }
      if (state.dur) {
        tools.append(h('div', { class: 'pe-row pe-dur' },
          segmented([{ value: '', label: 'Ohne' }, { value: 'beats', label: 'Schläge' }, { value: 'bars', label: 'Takte' }], it.dur?.unit || '', (v) => {
            if (!v) delete it.dur; else it.dur = { n: it.dur?.n || (v === 'bars' ? 1 : 4), unit: v };
            changed();
          }),
          it.dur && stepper({ value: it.dur.n, min: 1, max: 32, onChange: (v) => { it.dur.n = v; changed(); } })));
      }
    }
    input.placeholder = it ? `${it.name} ersetzen durch …` : 'Akkord eingeben, z. B. Am oder G D Em C';

    // Zuerst die Griffe des Songs (inkl. Varianten), dann gängige Akkorde
    const own = songChordList(song, inst);
    const rest = commonNames(inst).filter((n) => !own.some((x) => x.name === n)).slice(0, Math.max(0, 18 - own.length));
    quick.replaceChildren(
      ...own.map((x) => h('button', { class: 'pill', onClick: () => apply([x.name], x.ch.builtin ? undefined : x.ch.id) }, x.label)),
      ...rest.map((n) => h('button', { class: 'pill', onClick: () => apply([n]) }, n)));
  }

  // ---------- Ziehen: gedrückt halten, dann an die neue Stelle schieben ----------
  let drag = null, suppressClick = false;
  chips.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.pe-chip[data-i]');
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const start = { x: e.clientX, y: e.clientY };
    const begin = () => {
      timer = 0;
      drag = { el, start, ox: el.offsetLeft, oy: el.offsetTop };
      el.classList.add('dragging');
      chips.classList.add('sorting');
      haptic();
    };
    let timer = setTimeout(begin, e.pointerType === 'mouse' ? 120 : 260);
    const moveH = (ev) => {
      if (!drag) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 8) cleanup();
        return;
      }
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.pe-chip');
      if (over && over !== el && chips.contains(over)) {
        const r = over.getBoundingClientRect();
        if (!over.classList.contains('pe-plus') && ev.clientX > r.left + r.width / 2) over.after(el); else over.before(el);
      }
      el.style.transform = `translate(${ev.clientX - start.x + drag.ox - el.offsetLeft}px, ${ev.clientY - start.y + drag.oy - el.offsetTop}px)`;
    };
    const up = () => {
      if (drag) {
        suppressClick = true;
        const order = [...chips.querySelectorAll('.pe-chip[data-i]')].map((c) => Number(c.dataset.i));
        const from = Number(el.dataset.i), to = order.indexOf(from);
        if (to !== from) {
          const items = order.map((i) => block.items[i]);
          block.items.splice(0, block.items.length, ...items);
          state.sel = to;
          onChange();
        } else state.sel = from;
      }
      cleanup();
      render();
    };
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('pointermove', moveH);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (drag) { el.classList.remove('dragging'); el.style.transform = ''; chips.classList.remove('sorting'); }
      drag = null;
    }
    window.addEventListener('pointermove', moveH);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  // Während des Ziehens darf die Seite nicht mitscrollen (iOS)
  chips.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  chips.addEventListener('click', (e) => { if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
  chips.addEventListener('contextmenu', (e) => e.preventDefault());

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fromInput(); } });
  const repeat = stepper({ value: block.repeat || 1, min: 1, max: 16, format: (v) => '×' + v, onChange: (v) => { block.repeat = v; onChange(); } });
  // Spielweise für die ganze Folge (z. B. Anschlagmuster) – steht in der Ansicht über den Akkorden
  const play = h('input', { class: 'field pe-play', value: block.play || '', placeholder: 'Anschlag für alle Akkorde, z. B. DDU UDU', autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'done', 'aria-label': 'Spielweise für die ganze Folge' });
  play.addEventListener('input', () => { if (play.value.trim()) block.play = play.value; else delete block.play; onChange(); });
  play.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); play.blur(); } });
  const el = h('div', { class: 'prog-editor' },
    play,
    chips,
    tools,
    h('div', { class: 'pe-add' },
      input,
      h('button', { class: 'pe-go', 'aria-label': 'Übernehmen', onClick: fromInput }, icon('check', 'small')),
      h('button', {
        class: 'pe-go soft', 'aria-label': 'Aus der Akkord-Bibliothek', onClick: () => openChordLibrary({
          initial: input.value.trim(), instrument: inst,
          onPick: (c) => { input.value = ''; apply([c.name], c.id && !c.builtin ? c.id : undefined); },
        }),
      }, icon('grid', 'small'))),
    quick,
    h('div', { class: 'pe-foot' },
      h('span', { class: 'pe-rep' }, 'Ganze Folge', repeat),
      h('button', { class: 'pe-done', onClick: onDone }, icon('check', 'small'), 'Fertig')),
    h('p', { class: 'pe-hint' }, 'Akkord antippen zum Ersetzen oder Verschieben · gedrückt halten und ziehen zum Umsortieren'));
  render();
  el.focusInput = () => input.focus();
  return el;
}
