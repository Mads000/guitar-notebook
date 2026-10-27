// KI-Bearbeitung vorhandener Songs: Ziel wählen → Vorschlag → Vorher/Nachher-Vergleich → gezielt übernehmen.
// Die KI überschreibt nie still: Übernommen wird nur, was der Nutzer auswählt, und vorher entsteht eine interne Sicherung.
import * as db from './storage.js';
import { h, sheet, toggle, toast, alertDialog, icon, clone } from './ui.js';
import { instrumentOf, songTuning, newSection, newBlock, now, tabIdsOf } from './songs.js';
import { stringLabels, noteText } from './tabs.js';
import { fromAi, buildSections, saveShapes } from './importer.js';
import { aiUnavailable, generateJSON, SONG_SCHEMA } from './ai.js';
import { songChords, diagramSVG } from './chords.js';

const SCOPES = [
  { key: 'structure', label: 'Struktur & Abschnittsnamen', hint: 'Reihenfolge und Bezeichnungen der Abschnitte' },
  { key: 'chords', label: 'Akkordfolgen', hint: 'Akkorde neu ordnen oder auf Wunsch verändern' },
  { key: 'strum', label: 'Anschlagmuster' },
  { key: 'tabs', label: 'Tabs', hint: 'Aus: Tabs bleiben unverändert erhalten' },
  { key: 'notes', label: 'Notizen & Texte aufräumen' },
];
const PRESETS = [
  ['Struktur verbessern', 'Verbessere die Songstruktur: sinnvolle Abschnitte, klare Reihenfolge, fehlende Struktur aus den vorhandenen Angaben ableiten.', ['structure']],
  ['Abschnittsnamen', 'Vereinheitliche und verbessere die Abschnittsbezeichnungen (Intro, Verse 1, Chorus …).', ['structure']],
  ['Notizen aufräumen', 'Räume die Notizen und Hinweistexte auf: kürzer, klar gegliedert, nichts Inhaltliches weglassen.', ['notes']],
  ['Übersichtlich formatieren', 'Bringe den Song in ein übersichtlicheres Format, ohne Inhalte zu verlieren.', ['structure', 'notes']],
];

// ---------- Song → Text (für die KI und für den Vergleich) ----------
const strumText = (b) => b.strokes.map((s) => (s.a ? '>' : '') + (s.k === 'R' ? '-' : s.k)).join(' ');
function tabText(tab, tuning) {
  const n = tab.measures[0]?.notes?.length || 6;
  const labels = stringLabels(tuning, n);
  return labels.map((l, s) => l.padEnd(2) + '|' + tab.measures.map((m) => Array.from({ length: m.cols }, (_, c) => {
    const t = noteText(m.notes[s]?.[c]);
    return (t || '-').padEnd(3, '-');
  }).join('')).join('|') + '|').join('\n');
}

export function sectionsText(song, tabsById, refs) {
  return song.sections.map((sec) => [`[${sec.name}]`, ...sec.blocks.map((b) => {
    if (b.type === 'chords') {
      const rep = b.repeat > 1 ? ` (×${b.repeat})` : '';
      if (b.items.some((i) => i.note)) return `Akkorde mit Spielweise${rep}:\n${b.items.map((i) => `  ${i.name}${i.note ? ' – ' + i.note : ''}`).join('\n')}`;
      return `Akkorde: ${b.items.map((i) => i.name).join(' ')}${rep}`;
    }
    if (b.type === 'strum') return `Anschlag: ${strumText(b)}`;
    if (b.type === 'tab') {
      const t = tabsById.get(b.tabId);
      const ref = refs ? ` ${refs.get(b.tabId)}` : '';
      return t ? `Tab${ref} „${t.name}“:\n${tabText(t, songTuning(song))}` : `Tab${ref} (leer)`;
    }
    return b.text;
  })].join('\n')).join('\n\n');
}
const metaOf = (s) => ({ Titel: s.title, Künstler: s.artist, Capo: s.capo ? String(s.capo) : '', BPM: s.bpm ? String(s.bpm) : '', Taktart: s.timeSig });

// ---------- Einfacher Zeilenvergleich (LCS) ----------
function lineDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  if (A.length * B.length > 250000) return [...A.map((t) => ['-', t]), ...B.map((t) => ['+', t])];
  const L = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', A[i++]]); else out.push(['+', B[j++]]);
  }
  while (i < A.length) out.push(['-', A[i++]]);
  while (j < B.length) out.push(['+', B[j++]]);
  return out;
}
const diffView = (a, b) => h('pre', { class: 'diff' }, lineDiff(a, b).map(([k, t]) => h('div', { class: k === '-' ? 'del' : k === '+' ? 'ins' : '' }, (k === ' ' ? '  ' : k + ' ') + t)));

// ---------- Ablauf ----------
export async function openAiEdit(songId, { onDone } = {}) {
  await db.flush();
  const song = await db.get('songs', songId);
  if (!song) return;
  const tabsById = new Map();
  for (const id of tabIdsOf(song)) { const t = await db.get('tabs', id); if (t) tabsById.set(id, t); }
  const refs = new Map([...tabsById.keys()].map((id, i) => [id, `TAB-${i + 1}`]));
  const scopes = new Set(['structure', 'notes']);
  const goal = h('textarea', { class: 'field', rows: 3, placeholder: 'Bearbeitungsziel, z. B. „Akkorde für Anfänger vereinfachen“ oder „Chorus nach dem zweiten Verse wiederholen“' });
  const state = h('div', { class: 'ai-state' });
  const unavailable = aiUnavailable();

  const body = h('div', null,
    h('p', { class: 'hint' }, `Song: „${song.title}“. Die KI macht einen Vorschlag – übernommen wird erst nach deiner Auswahl. Vorher wird eine Sicherung angelegt.`),
    unavailable && h('div', { class: 'banner-inline warn' }, `KI nicht verfügbar: ${unavailable}`),
    h('div', { class: 'form-label' }, 'Schnellaktionen'),
    h('div', { class: 'pills' }, PRESETS.map(([label, text, sc]) => h('button', { class: 'pill', onClick: () => { goal.value = text; sc.forEach((k) => scopes.add(k)); drawScopes(); } }, label))),
    h('div', { class: 'form-label' }, 'Ziel'),
    goal,
    h('div', { class: 'form-label' }, 'Was darf die KI verändern?'),
    h('div', { class: 'form-group scope-list' }),
    state);
  const scopeList = body.querySelector('.scope-list');
  function drawScopes() {
    scopeList.replaceChildren(...SCOPES.map((sc) => h('div', { class: 'form-row' },
      h('span', { class: 'lbl' }, sc.label, sc.hint && h('small', null, sc.hint)),
      toggle(scopes.has(sc.key), (v) => { if (v) scopes.add(sc.key); else scopes.delete(sc.key); }))));
  }
  drawScopes();

  let busy = false;
  const s = sheet({
    title: 'Mit KI bearbeiten', body, full: true, left: { label: 'Abbrechen' },
    right: { label: 'Vorschlag', bold: true, onClick: async () => {
      if (busy) return;
      const why = aiUnavailable();
      if (why) { await alertDialog('KI nicht verfügbar', `${why}\n\nDie übrige App funktioniert ohne KI unverändert.`); return; }
      if (!goal.value.trim()) { toast('Bitte ein Ziel eingeben oder eine Schnellaktion wählen.'); return; }
      if (!scopes.size) { toast('Bitte mindestens einen Bereich freigeben.'); return; }
      busy = true;
      state.replaceChildren(h('div', { class: 'spinner' }), 'Die KI arbeitet …');
      try {
        const res = await generateJSON(editPrompt(song, tabsById, refs, goal.value.trim(), scopes));
        const proposal = buildProposal(song, res, tabsById, refs, scopes);
        s.close();
        showPreview(song, tabsById, proposal, onDone);
      } catch (e) {
        state.replaceChildren(h('p', { class: 'form-foot warn' }, String(e.message || e)));
      } finally { busy = false; }
    } },
  });
}

const EDIT_SCHEMA = clone(SONG_SCHEMA);
EDIT_SCHEMA.properties.sections.items.properties.tabRefs = { type: 'ARRAY', items: { type: 'STRING' } };

function editPrompt(song, tabsById, refs, goal, scopes) {
  const inst = instrumentOf(song);
  const allowed = SCOPES.filter((x) => scopes.has(x.key)).map((x) => x.label).join(', ');
  const locked = SCOPES.filter((x) => !scopes.has(x.key)).map((x) => x.label).join(', ') || '–';
  return {
    schema: EDIT_SCHEMA,
    temperature: 0.3,
    system: `Du überarbeitest einen vorhandenen Song für ${inst === 'ukulele' ? 'Ukulele (4 Saiten)' : 'Gitarre (6 Saiten)'}.
Erlaubt zu ändern: ${allowed}. NICHT ändern (exakt übernehmen): ${locked}.
Gib den vollständigen Song zurück – auch alle unveränderten Inhalte. Erfinde keine Liedtexte und lasse nichts weg, was nicht ausdrücklich geändert werden soll.
Vorhandene Tabs sind mit Kennungen wie TAB-1 markiert. ${scopes.has('tabs') ? 'Willst du einen Tab unverändert lassen, gib nur seine Kennung in "tabRefs" an. Geänderte Tabs gibst du als ASCII in "tab" aus.' : 'Tabs dürfen nicht verändert werden: Gib für jeden Tab nur seine Kennung in "tabRefs" des passenden Abschnitts an, nie ASCII in "tab".'}
Freie Texte und Liedtexte eines Abschnitts kommen in "lyrics" (Zeilen mit \\n), Hinweise in "comment". Allgemeine Song-Notizen in "notes".
Anschlagmuster: Zeichen durch Leerzeichen getrennt, D = Ab, U = Auf, - = Pause, X = gedämpft, > = Akzent.
Akkorde mit Spielweise gibst du als "steps" zurück ({chord, play}); vorhandene Spielweisen übernimmst du unverändert, außer das Ziel verlangt etwas anderes. Du darfst auch neue Spielweisen ergänzen, wenn das Ziel danach fragt.
Neue Griffbilder nur für diesen Song (z. B. leichtere Variante, andere Lage) gibst du in "shapes" an: name, frets je Saite von tief nach hoch mit Leerzeichen (x = nicht gespielt), optional fingers. Vorhandene eigene Griffe nicht erneut angeben.`,
    prompt: `Ziel: ${goal}

Titel: ${song.title}
Künstler: ${song.artist || ''}
Capo: ${song.capo || 0}  BPM: ${song.bpm || ''}  Taktart: ${song.timeSig || ''}
Notizen:
${song.notes || ''}

Abschnitte:
${sectionsText(song, tabsById, refs)}${ownShapes(song)}`,
  };
}

// Bereits angelegte songeigene Griffe, damit die KI sie kennt und nicht doppelt anlegt
function ownShapes(song) {
  const list = songChords(song.id, instrumentOf(song));
  if (!list.length) return '';
  return `\n\nEigene Griffe in diesem Song (tief → hoch):\n${list.map((c) => `  ${c.name}: ${c.frets.map((f) => (f < 0 ? 'x' : f)).join(' ')}`).join('\n')}`;
}

function buildProposal(song, res, tabsById, refs, scopes) {
  const inst = instrumentOf(song);
  const byRef = new Map([...refs].map(([id, r]) => [r, id]));
  const used = new Set();
  const sections = [], newTabs = [];
  for (const raw of Array.isArray(res?.sections) ? res.sections : []) {
    if (!raw || typeof raw !== 'object') continue;
    const parsed = fromAi({ sections: [{ ...raw, tab: scopes.has('tabs') ? raw.tab : undefined }] }, inst);
    const built = parsed.sections.length ? buildSections(parsed, song.id, { lyrics: true, inline: true }) : { sections: [newSection(String(raw.name || 'Abschnitt').slice(0, 40))], tabs: [] };
    const sec = built.sections[0];
    newTabs.push(...built.tabs);
    const keep = (Array.isArray(raw.tabRefs) ? raw.tabRefs : []).map((r) => byRef.get(String(r).trim())).filter((id) => id && !used.has(id));
    keep.forEach((id) => used.add(id));
    const at = sec.blocks.map((b) => b.type).lastIndexOf('notes'); // Tabs vor den Liedtext
    const tabBlocks = keep.map((id) => newBlock('tab', { tabId: id }));
    if (at > 0) sec.blocks.splice(at, 0, ...tabBlocks); else sec.blocks.push(...tabBlocks);
    sections.push(sec);
  }
  // Tabs, die die KI nicht zugeordnet hat, gehen nie verloren, solange Tabs nicht freigegeben sind
  const missing = [...tabsById.keys()].filter((id) => !used.has(id));
  if (missing.length && !scopes.has('tabs')) {
    const sec = newSection('Tabs');
    sec.blocks.push(...missing.map((id) => newBlock('tab', { tabId: id })));
    sections.push(sec);
  }
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const meta = {
    title: str(res?.title) || song.title,
    artist: res?.artist != null ? str(res.artist) : song.artist,
    capo: Number.isInteger(res?.capo) && res.capo >= 0 && res.capo <= 12 ? res.capo : song.capo,
    bpm: Number.isInteger(res?.bpm) && res.bpm >= 30 && res.bpm <= 300 ? res.bpm : song.bpm,
    timeSig: /^\d{1,2}\/\d{1,2}$/.test(str(res?.timeSig)) ? str(res.timeSig) : song.timeSig,
  };
  const notes = res?.notes != null ? String(res.notes).trim() : song.notes;
  const allTabs = new Map([...tabsById, ...newTabs.map((t) => [t.id, t])]);
  const shapes = fromAi({ sections: [], shapes: res?.shapes }, inst).shapes;
  return { meta, notes, sections, newTabs, allTabs, shapes, dropTabs: missing.filter(() => scopes.has('tabs')) };
}

function showPreview(song, tabsById, p, onDone) {
  const before = metaOf(song), after = metaOf({ ...song, ...p.meta });
  const metaChanges = Object.keys(before).filter((k) => (before[k] || '') !== (after[k] || ''));
  const secBefore = sectionsText(song, tabsById), secAfter = sectionsText({ ...song, sections: p.sections }, p.allTabs);
  const groups = [
    metaChanges.length && { key: 'meta', label: 'Titel & Angaben', view: h('div', { class: 'diff' }, metaChanges.map((k) => h('div', null, h('b', null, k + ': '), h('span', { class: 'del-i' }, before[k] || '–'), ' → ', h('span', { class: 'ins-i' }, after[k] || '–')))) },
    (song.notes || '') !== p.notes && { key: 'notes', label: 'Notizen', view: diffView(song.notes || '', p.notes) },
    secBefore !== secAfter && p.sections.length > 0 && { key: 'sections', label: 'Abschnitte, Akkorde, Anschlag & Tabs', view: diffView(secBefore, secAfter) },
    p.shapes.length > 0 && { key: 'shapes', label: 'Neue Griffe für diesen Song', view: h('div', { class: 'ip-shapes' }, p.shapes.map((c) => h('div', { class: 'chord-card mini', html: diagramSVG(c) }))) },
  ].filter(Boolean);
  const pick = new Set(groups.map((g) => g.key));
  const body = h('div', null,
    h('div', { class: 'ai-badge' }, icon('magic', 'small'), 'Vorschlag der KI – bitte prüfen'),
    groups.length ? h('p', { class: 'hint' }, 'Rot = Original, Grün = Vorschlag. Wähle, was übernommen werden soll. Nicht gewählte Bereiche bleiben unverändert.')
      : h('p', { class: 'hint' }, 'Die KI hat keine Änderungen vorgeschlagen.'),
    groups.map((g) => h('section', { class: 'ipl-sec' },
      h('div', { class: 'form-row' }, h('span', { class: 'lbl' }, g.label), toggle(true, (v) => { if (v) pick.add(g.key); else pick.delete(g.key); })),
      g.view)));
  const s = sheet({
    title: 'Änderungsvorschau', body, full: true, left: { label: 'Verwerfen' },
    right: { label: 'Übernehmen', bold: true, onClick: async () => {
      if (!pick.size) { s.close(); return; }
      try {
        await db.flush();
        const fresh = await db.get('songs', song.id);
        if (!fresh) throw new Error('Song nicht mehr vorhanden.');
        await db.addBackup(`Vor KI-Bearbeitung: ${fresh.title}`);
        const next = clone(fresh);
        if (pick.has('meta')) Object.assign(next, p.meta);
        if (pick.has('notes')) next.notes = p.notes;
        const writes = [];
        if (pick.has('sections')) {
          next.sections = p.sections;
          const refs = new Set(tabIdsOf(next));
          for (const t of p.newTabs) if (refs.has(t.id)) writes.push(['tabs', { ...t, songId: next.id, createdAt: now(), updatedAt: now() }]);
        }
        if (pick.has('shapes')) await saveShapes(p.shapes, next.id, next.sections);
        const own = new Map(songChords(next.id, instrumentOf(next)).map((c) => [c.name, c.id]));
        for (const sec of next.sections) for (const b of sec.blocks) if (b.type === 'chords') for (const it of b.items) if (!it.chordId && own.has(it.name)) it.chordId = own.get(it.name);
        next.updatedAt = now();
        writes.push(['songs', next]);
        await db.putMany(writes);
        // Nicht mehr verwendete Original-Tabs nur entfernen, wenn Tabs freigegeben waren (Sicherung liegt vor)
        if (pick.has('sections')) {
          const still = new Set(tabIdsOf(next));
          const gone = tabIdsOf(fresh).filter((id) => !still.has(id) && p.dropTabs.includes(id));
          if (gone.length) await db.deleteMany(gone.map((id) => ['tabs', id]));
        }
        s.close();
        toast('Änderungen übernommen – Sicherung angelegt', 2800);
        if (onDone) onDone(next);
      } catch (e) {
        alertDialog('Übernehmen fehlgeschlagen', `${e.message || e}\nDer Song ist unverändert.`);
      }
    } },
  });
}

