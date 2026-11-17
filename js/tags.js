// Schlagworte bearbeiten: für einen Song oder mehrere ausgewählte. Jede Änderung wird sofort gespeichert.
import { tr } from './i18n.js';
import * as db from './storage.js';
import { h, fill, sheet, icon, toast } from './ui.js';
import { allTags, setTags, hasTag, cleanTag, touch, MAX_TAGS } from './songs.js';

export async function openTagEditor(songs, { onDone } = {}) {
  await db.flush();
  const known = allTags(await db.getAll('songs')).map((t) => t.name);
  const names = [...known];
  const isOn = (t) => songs.every((s) => hasTag(s, t));
  const input = h('input', { class: 'field', placeholder: tr("Neues Schlagwort, z. B. Lagerfeuer"), 'aria-label': tr("Neues Schlagwort"), maxlength: 30, autocomplete: 'off', enterkeyhint: 'done' });
  const list = h('div', { class: 'pills tag-pills' });

  const change = (tag, on) => {
    for (const s of songs) {
      const cur = (s.tags || []).filter((t) => t.toLowerCase() !== tag.toLowerCase());
      if (on) {
        if (cur.length >= MAX_TAGS) { toast(tr("Höchstens {0} Schlagworte je Song.", MAX_TAGS)); continue; }
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
      : h('p', { class: 'hint' }, tr("Noch keine Schlagworte. Lege oben das erste an.")));
  }
  draw();

  const body = h('div', { class: 'tag-editor' },
    h('div', { class: 'tag-add' }, input, h('button', { class: 'btn', onClick: add }, icon('plus', 'small'), tr("Hinzufügen"))),
    h('div', { class: 'form-label', style: 'margin-top:18px' }, songs.length > 1 ? tr("Für {0} Songs – antippen zum Setzen oder Entfernen", songs.length) : tr("Antippen zum Setzen oder Entfernen")),
    list,
    h('p', { class: 'form-foot' }, tr("Schlagworte gibt es zusätzlich zu Ordnern: Ein Song kann mehrere haben, z. B. „Lagerfeuer“ und „Zupfen“. In der Songliste kannst du danach filtern.")));
  sheet({ title: songs.length > 1 ? tr("Schlagworte") : tr("Schlagworte: {0}", songs[0].title), body, right: { label: tr("Fertig"), bold: true }, onClose: async () => { await db.flush(); onDone?.(); } });
}
