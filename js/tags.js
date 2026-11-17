// Schlagworte bearbeiten: für einen Song oder mehrere ausgewählte. Jede Änderung wird sofort gespeichert.
import * as db from './storage.js';
import { h, fill, sheet, icon, toast } from './ui.js';
import { allTags, setTags, hasTag, cleanTag, touch, MAX_TAGS } from './songs.js';

export async function openTagEditor(songs, { onDone } = {}) {
  await db.flush();
  const known = allTags(await db.getAll('songs')).map((t) => t.name);
  const names = [...known];
  const isOn = (t) => songs.every((s) => hasTag(s, t));
  const input = h('input', { class: 'field', placeholder: 'Neues Schlagwort, z. B. Lagerfeuer', 'aria-label': 'Neues Schlagwort', maxlength: 30, autocomplete: 'off', enterkeyhint: 'done' });
  const list = h('div', { class: 'pills tag-pills' });

  const change = (tag, on) => {
    for (const s of songs) {
      const cur = (s.tags || []).filter((t) => t.toLowerCase() !== tag.toLowerCase());
      if (on) {
        if (cur.length >= MAX_TAGS) { toast(`Höchstens ${MAX_TAGS} Schlagworte je Song.`); continue; }
        cur.push(tag);
      }
      setTags(s, cur);
      touch(s);
    }
    draw();
  };
  const add = () => {
    const t = cleanTag(input.value);
    if (!t) return;
    const same = names.find((n) => n.toLowerCase() === t.toLowerCase());
    if (!same) names.push(t);
    input.value = '';
    change(same || t, true);
    input.focus();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

  function draw() {
    names.sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    fill(list, names.length
      ? names.map((t) => {
        const on = isOn(t);
        return h('button', { class: 'pill' + (on ? ' accent' : ''), 'aria-pressed': String(on), onClick: () => change(t, !on) }, on && icon('check', 'small'), t);
      })
      : h('p', { class: 'hint' }, 'Noch keine Schlagworte. Lege oben das erste an.'));
  }
  draw();

  const body = h('div', { class: 'tag-editor' },
    h('div', { class: 'tag-add' }, input, h('button', { class: 'btn', onClick: add }, icon('plus', 'small'), 'Hinzufügen')),
    h('div', { class: 'form-label', style: 'margin-top:18px' }, songs.length > 1 ? `Für ${songs.length} Songs – antippen zum Setzen oder Entfernen` : 'Antippen zum Setzen oder Entfernen'),
    list,
    h('p', { class: 'form-foot' }, 'Schlagworte gibt es zusätzlich zu Ordnern: Ein Song kann mehrere haben, z. B. „Lagerfeuer“ und „Zupfen“. In der Songliste kannst du danach filtern.'));
  sheet({ title: songs.length > 1 ? 'Schlagworte' : `Schlagworte: ${songs[0].title}`, body, right: { label: 'Fertig', bold: true }, onClose: async () => { await db.flush(); onDone?.(); } });
}
