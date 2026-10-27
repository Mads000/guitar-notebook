// Setlisten: Songs für einen Auftritt in eine Reihenfolge bringen und in der Spielansicht nacheinander spielen.
// Eine Setlist speichert nur Verweise (songIds) – Löschen einer Setlist löscht nie einen Song.
import * as db from './storage.js';
import { h, fill, icon, sheet, actionSheet, ask, confirmDialog, alertDialog, toast, dragSort, offerFile } from './ui.js';
import { uid, now, SORTS, instrumentOf } from './songs.js';
import { exportSongsPDF } from './pdf.js';

export const listSetlists = async () => (await db.getAll('setlists')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const save = (sl) => { sl.updatedAt = now(); return db.put('setlists', sl); };

export async function createSetlist(name, songIds = []) {
  const t = now();
  const sl = { id: uid(), name: name.trim() || 'Setlist', songIds: [...new Set(songIds)], createdAt: t, updatedAt: t };
  await db.put('setlists', sl);
  return sl;
}

export const playHash = (sl, i = 0) => `#/set/${encodeURIComponent(sl.id)}/${i}`;
// Nur vorhandene Songs in Setlist-Reihenfolge
export const setlistSongs = (sl, songs) => { const byId = new Map(songs.map((s) => [s.id, s])); return sl.songIds.map((id) => byId.get(id)).filter(Boolean); };

// Songs zu einer (neuen) Setlist hinzufügen – aus dem Song-Menü oder der Mehrfachauswahl
export async function addToSetlist(picked) {
  const lists = await listSetlists();
  const label = picked.length === 1 ? `„${picked[0].title}“` : `${picked.length} Songs`;
  const target = await actionSheet(`${label} zu Setlist hinzufügen`, [
    ...lists.map((sl) => ({ label: `${sl.name} (${sl.songIds.length})`, value: sl.id })),
    { label: '+ Neue Setlist …', value: '$new' },
  ]);
  if (!target) return;
  if (target === '$new') {
    const name = await ask('Neue Setlist', { placeholder: 'Name, z. B. Konzert Samstag', ok: 'Erstellen' });
    if (!name) return;
    const sl = await createSetlist(name, picked.map((s) => s.id));
    toast(`Setlist „${sl.name}“ mit ${label} erstellt`);
    return;
  }
  const sl = lists.find((x) => x.id === target);
  const fresh = picked.filter((s) => !sl.songIds.includes(s.id));
  if (!fresh.length) { toast('Schon in dieser Setlist'); return; }
  sl.songIds.push(...fresh.map((s) => s.id));
  await save(sl);
  toast(`Zu „${sl.name}“ hinzugefügt`);
}

async function askNew() {
  const name = await ask('Neue Setlist', { placeholder: 'Name, z. B. Konzert Samstag', ok: 'Erstellen' });
  return name ? createSetlist(name) : null;
}

// Neue Setlist direkt anlegen und gleich Songs auswählen (z. B. aus dem „+“-Menü der Startseite)
export async function newSetlist() {
  const sl = await askNew();
  if (sl) openSetlist(sl, { pickNow: true });
}

// Übersicht aller Setlisten
export async function openSetlists() {
  const list = h('div');
  const opts = (more = {}) => ({ onChange: draw, closeParent: () => ov.close(), ...more });
  const draw = async () => {
    const lists = await listSetlists();
    fill(list,
      lists.length
        ? h('ul', { class: 'list' }, lists.map((sl) => h('li', { class: 'row' },
          h('button', { class: 'row-main', onClick: () => openSetlist(sl, opts()) },
            h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, sl.name), h('div', { class: 'row-sub' }, sl.songIds.length === 1 ? '1 Song' : `${sl.songIds.length} Songs`)),
            icon('chevron', 'small chev')))))
        : h('div', { class: 'empty small' }, h('p', null, 'Noch keine Setlisten. Eine Setlist ist die Reihenfolge der Songs für einen Abend – in der Spielansicht blätterst du dann mit ‹ › weiter.')),
      h('div', { class: 'stack', style: 'margin-top:16px' }, h('button', { class: 'btn primary block', onClick: async () => {
        const sl = await askNew();
        if (!sl) return;
        await draw();
        openSetlist(sl, opts({ pickNow: true }));
      } }, icon('plus', 'small'), 'Neue Setlist')));
  };
  const ov = sheet({ title: 'Setlisten', body: list, full: true, right: { label: 'Fertig', bold: true } });
  await draw();
}

// Eine Setlist: Reihenfolge ändern, Songs hinzufügen/entfernen, spielen
export async function openSetlist(sl, { onChange = () => {}, closeParent, pickNow = false } = {}) {
  const songs = await db.getAll('songs');
  const ul = h('ul', { class: 'list reorder setlist' });
  const info = h('p', { class: 'form-foot' });
  const commit = async () => { await save(sl); draw(); onChange(); };
  dragSort(ul, (from, to) => { const [x] = sl.songIds.splice(from, 1); sl.songIds.splice(to, 0, x); commit(); });
  const byId = () => new Map(songs.map((s) => [s.id, s]));
  function draw() {
    const map = byId();
    fill(ul, sl.songIds.map((id, i) => {
      const s = map.get(id);
      return h('li', { class: 'row' },
        h('span', { class: 'drag-handle', 'aria-label': 'Ziehen zum Verschieben' }, icon('reorder', 'small')),
        h('button', { class: 'row-main', disabled: !s, onClick: () => play(i) },
          h('span', { class: 'sl-num' }, String(i + 1)),
          h('div', { class: 'row-text' },
            h('div', { class: 'row-title' }, s ? s.title : 'Song nicht mehr vorhanden'),
            h('div', { class: 'row-sub' }, s ? [s.artist, instrumentOf(s) === 'ukulele' && 'Ukulele', s.capo && `Capo ${s.capo}`].filter(Boolean).join('  ·  ') || ' ' : 'wird beim Spielen übersprungen'))),
        h('button', { class: 'row-more', 'aria-label': 'Aus Setlist entfernen', onClick: () => { sl.songIds.splice(i, 1); commit(); toast('Aus der Setlist entfernt – der Song bleibt erhalten', 1800); } }, icon('close', 'small')));
    }));
    if (!sl.songIds.length) ul.append(h('li', { class: 'empty small' }, h('p', null, 'Noch keine Songs. Tippe auf „Songs hinzufügen“.')));
    info.textContent = sl.songIds.length ? 'Am Griff ziehen ändert die Reihenfolge. Tippe auf einen Song, um ab dort zu spielen.' : '';
  }
  function play(i = 0) {
    const map = byId();
    let start = i;
    while (start < sl.songIds.length && !map.has(sl.songIds[start])) start++;
    if (start >= sl.songIds.length) { toast('Keine Songs zum Spielen'); return; }
    closeAll();
    // Position unter den vorhandenen Songs (gelöschte werden übersprungen)
    location.hash = playHash(sl, sl.songIds.slice(0, start).filter((id) => map.has(id)).length);
  }
  async function pick() {
    const all = songs.slice().sort(SORTS.title.fn);
    if (!all.length) { toast('Noch keine Songs vorhanden.'); return; }
    const chosen = [];
    const q = h('input', { type: 'search', class: 'field', placeholder: 'Suchen', autocomplete: 'off' });
    const pl = h('ul', { class: 'list' });
    const drawPick = () => {
      const t = q.value.trim().toLowerCase();
      fill(pl, all.filter((s) => !t || `${s.title} ${s.artist}`.toLowerCase().includes(t)).map((s) => {
        const inList = sl.songIds.includes(s.id), on = chosen.includes(s.id);
        return h('li', { class: 'row selectable' + (on ? ' selected' : '') },
          h('button', { class: 'row-main', disabled: inList, 'aria-pressed': String(on), onClick: () => { if (on) chosen.splice(chosen.indexOf(s.id), 1); else chosen.push(s.id); drawPick(); } },
            h('span', { class: 'row-check' }, (on || inList) && icon('check', 'small')),
            h('div', { class: 'row-text' }, h('div', { class: 'row-title' }, s.title), h('div', { class: 'row-sub' }, inList ? 'bereits in der Setlist' : s.artist || ' '))));
      }));
      ps.setTitle(chosen.length ? `${chosen.length} ausgewählt` : 'Songs hinzufügen');
    };
    q.addEventListener('input', drawPick);
    const ps = sheet({ title: 'Songs hinzufügen', body: h('div', null, q, h('div', { style: 'height:10px' }), pl), full: true, left: { label: 'Abbrechen' },
      right: { label: 'Hinzufügen', bold: true, onClick: async () => { ps.close(); if (!chosen.length) return; sl.songIds.push(...chosen); await commit(); } } });
    drawPick();
  }
  async function menu() {
    actionSheet(sl.name, [
      { label: 'Umbenennen', onClick: async () => { const n = await ask('Setlist umbenennen', { value: sl.name, ok: 'Sichern' }); if (n) { sl.name = n.trim(); s.setTitle(sl.name); commit(); } } },
      { label: 'Als PDF exportieren', disabled: !sl.songIds.length, onClick: async () => {
        try {
          toast('PDF wird erstellt …', 1200);
          const { blob, filename } = await exportSongsPDF(setlistSongs(sl, songs), { title: sl.name });
          offerFile(blob, filename, { title: 'PDF bereit', openable: true });
        } catch (e) { alertDialog('PDF-Export fehlgeschlagen', String(e.message || e)); }
      } },
      { label: 'Setlist löschen …', destructive: true, onClick: async () => {
        if (!(await confirmDialog('Setlist löschen?', `Nur die Setlist „${sl.name}“ wird entfernt. Die Songs bleiben alle erhalten.`, { ok: 'Löschen', destructive: true }))) return;
        await db.removeNow('setlists', sl.id);
        closeSelf();
        onChange();
        toast('Setlist gelöscht – Songs bleiben erhalten');
      } },
    ]);
  }
  const body = h('div', null,
    h('div', { class: 'btn-row sl-actions' },
      h('button', { class: 'btn primary', onClick: () => play(0) }, icon('play', 'small'), 'Spielen'),
      h('button', { class: 'btn', onClick: pick }, icon('plus', 'small'), 'Hinzufügen'),
      h('button', { class: 'btn icon-only', 'aria-label': 'Weitere Aktionen', onClick: menu }, icon('more', 'small'))),
    ul, info);
  const s = sheet({ title: sl.name, body, full: true, left: { label: 'Zurück' }, right: { label: 'Fertig', bold: true, onClick: () => closeAll() } });
  const closeSelf = () => s.close();
  // „Fertig“ und „Spielen“ schließen auch die Übersicht darunter
  function closeAll() { s.close(); closeParent?.(); }
  draw();
  if (pickNow) pick();
}
