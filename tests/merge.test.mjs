// Testet den Merge-Import (Fälle A–G) ohne Browser: node tests/merge.test.mjs
const noop = () => {};
globalThis.document = { addEventListener: noop, createElement: () => ({}), querySelector: () => null, querySelectorAll: () => [] };
globalThis.window = { addEventListener: noop };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, length: 0, key: () => null };
const { validateBackup, normalizeExisting } = await import('../js/backup.js');
const { planMerge, applyPlan, summarize } = await import('../js/merge.js');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails++; };
const day = (d) => new Date(Date.UTC(2026, 0, d)).toISOString();
const song = (i, extra = {}) => ({ id: 's' + i, title: 'Song ' + i, artist: 'A', instrument: 'guitar', createdAt: day(1), updatedAt: day(2),
  sections: [{ id: 'sec' + i, name: 'Verse', blocks: [{ id: 'b' + i, type: 'chords', items: [{ id: 'i' + i, name: 'G' }], repeat: 1 }] }], ...extra });
const file = (songs, more = {}) => ({ app: 'guitar-notebook', format: 1, exportedAt: day(3), songs, tabs: [], chords: [], patterns: [], ...more });
const local = (songs, more = {}) => validateBackup(file(songs, more)).data;
// Import simulieren: Plan → Schreibvorgänge → In-Memory-Bestand
function merge(ex, raw, decide) {
  const res = validateBackup(raw);
  const plan = planMerge(ex, res.data);
  if (decide) decide(plan);
  const { writes, stats } = applyPlan(plan, new Set(ex.tabs.map((t) => t.id)));
  const out = Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, new Map(v.map((x) => [x.id, x]))]));
  for (const [st, o] of writes) out[st].set(o.id, o);
  return { plan, stats, sum: summarize(plan), data: Object.fromEntries(Object.entries(out).map(([k, m]) => [k, [...m.values()]])) };
}
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

console.log('A: 100 lokal, Backup mit 80 älteren');
{
  const ex = local(range(0, 100).map((i) => song(i, { updatedAt: day(10) })));
  const r = merge(ex, file(range(0, 80).map((i) => song(i, { updatedAt: day(5), notes: 'alt' }))));
  ok(r.data.songs.length === 100, `100 Songs bleiben (${r.data.songs.length})`);
  ok(r.data.songs.filter((s) => s.notes === 'alt').length === 0, 'neuere lokale Versionen nicht überschrieben');
}
console.log('B: 100 lokal, Backup mit 80 davon + 5 neuen');
{
  const ex = local(range(0, 100).map((i) => song(i)));
  const r = merge(ex, file([...range(0, 80), ...range(100, 105)].map((i) => song(i))));
  ok(r.data.songs.length === 105, `105 Songs (${r.data.songs.length})`);
  ok(r.sum.newSongs === 5 && r.sum.sameSongs === 80, `5 neu, 80 identisch (${r.sum.newSongs}/${r.sum.sameSongs})`);
}
console.log('C: dasselbe Backup zweimal (mit und ohne IDs)');
{
  const ex = local(range(0, 10).map((i) => song(i)));
  const raw = file(range(10, 15).map((i) => song(i)));
  const r1 = merge(ex, raw);
  const r2 = merge(r1.data, raw);
  ok(r2.data.songs.length === 15, `kein Duplikat mit IDs (${r2.data.songs.length})`);
  const noIds = file(range(20, 23).map((i) => { const s = song(i); delete s.id; return s; }));
  const r3 = merge(r2.data, noIds);
  const r4 = merge(r3.data, noIds);
  ok(r3.data.songs.length === 18 && r4.data.songs.length === 18, `kein Duplikat ohne IDs (${r3.data.songs.length}/${r4.data.songs.length})`);
}
console.log('D: lokal neuer, Import älter');
{
  const ex = local([song(1, { notes: 'neu lokal', updatedAt: day(20) })]);
  const r = merge(ex, file([song(1, { notes: 'alt', updatedAt: day(5) })]));
  ok(r.plan.songs[0].kind === 'conflict' && r.plan.songs[0].newer === 'local', 'Konflikt erkannt, lokal neuer');
  ok(r.data.songs[0].notes === 'neu lokal', 'lokale Version bleibt');
}
console.log('E: unabhängig bearbeitet');
{
  const ex = local([song(1, { notes: 'iPhone', updatedAt: day(10) })]);
  const raw = () => file([song(1, { notes: 'PC', updatedAt: day(11) })]);
  const r = merge(ex, raw());
  ok(r.sum.conflicts === 1 && r.plan.songs[0].newer === 'import', 'Konflikt erkannt, Import als neuer markiert');
  ok(r.data.songs[0].notes === 'iPhone', 'ohne Entscheidung nichts überschrieben');
  const both = merge(ex, raw(), (p) => { p.songs[0].action = 'copy'; });
  ok(both.data.songs.length === 2 && both.data.songs.some((s) => s.notes === 'PC') && both.data.songs.some((s) => s.notes === 'iPhone'), '„Beide behalten“ verliert nichts');
  const take = merge(ex, raw(), (p) => { p.songs[0].action = 'import'; });
  ok(take.data.songs.length === 1 && take.data.songs[0].notes === 'PC', '„Import übernehmen“ ersetzt bewusst');
}
console.log('F: Backup mit neuem Ordner');
{
  const ex = local([song(1, { folderId: 'f1' })], { folders: [{ id: 'f1', name: 'Lagerfeuer' }] });
  const r = merge(ex, file([song(1, { folderId: 'f1' }), song(2, { folderId: 'f2' }), song(3, { folderId: 'fx' })], { folders: [{ id: 'f1', name: 'Lagerfeuer' }, { id: 'f2', name: 'Neu' }, { id: 'fx', name: 'lagerfeuer' }] }));
  ok(r.data.folders.length === 2, `2 Ordner, keine Duplikate (${r.data.folders.length})`);
  ok(r.data.songs.find((s) => s.id === 's3').folderId === 'f1', 'gleichnamiger Ordner wird zugeordnet statt dupliziert');
  ok(r.data.songs.find((s) => s.id === 's1').folderId === 'f1', 'vorhandener Song unverändert');
  const r2 = merge(ex, file([song(4, { folderId: 'gibtsnicht' })]));
  ok(r2.data.songs.find((s) => s.id === 's4').folderId === null, 'ungültige Ordnerreferenz wird entfernt');
}
console.log('G: ungültige Datensätze');
{
  const ex = local([song(1)]);
  const r = merge(ex, file([song(2), { title: 'kaputt' }, 'Unsinn', null]));
  ok(r.data.songs.length === 2, `gültiger Song importiert, ungültige übersprungen (${r.data.songs.length})`);
  let threw = false;
  try { validateBackup(file([{ x: 1 }])); } catch { threw = true; }
  ok(threw, 'nur ungültige Datensätze → verständlicher Abbruch');
  threw = false;
  try { validateBackup({ app: 'anders' }); } catch { threw = true; }
  ok(threw, 'fremde Datei wird abgelehnt');
}
console.log('Tabs: neuer Song mit kollidierender Tab-ID');
{
  const tab = (id, f) => ({ id, songId: 'x', name: 'Riff', measures: [{ id: 'm', cols: 1, notes: Array.from({ length: 6 }, () => [{ f }]), pm: [false] }] });
  const withTab = (i, tid) => song(i, { sections: [{ id: 'q' + i, name: 'Intro', blocks: [{ id: 'tb' + i, type: 'tab', tabId: tid }] }] });
  const ex = local([withTab(1, 't1')], { tabs: [tab('t1', 3)] });
  const r = merge(ex, file([withTab(2, 't1')], { tabs: [tab('t1', 5)] }));
  ok(r.data.tabs.find((t) => t.id === 't1').measures[0].notes[0][0].f === 3, 'lokaler Tab bleibt unverändert');
  ok(r.data.tabs.length === 2, 'Tab des neuen Songs bekommt eigene ID');
}
console.log('Ältere lokale Datensätze (ohne folderId/instrument)');
{
  const raw = (i) => { const s = song(i); delete s.instrument; return s; };
  const ex = normalizeExisting({ songs: [raw(1), raw(2)], tabs: [], chords: [], patterns: [], folders: [] });
  const r = merge(ex, file([song(1), song(2)]));
  ok(r.sum.sameSongs === 2 && r.sum.conflicts === 0, `als identisch erkannt (${r.sum.sameSongs} gleich, ${r.sum.conflicts} Konflikte)`);
}
console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(fails ? 1 : 0);
