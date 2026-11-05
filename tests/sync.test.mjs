// Testet die Sync-Regeln ohne Browser und ohne Netz: node tests/sync.test.mjs
const noop = () => {};
globalThis.document = { addEventListener: noop, createElement: () => ({}), querySelector: () => null, querySelectorAll: () => [] };
globalThis.window = { addEventListener: noop };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, length: 0, key: () => null };
const { buildManifest, wantList, planSync, finalizeSync, agreedIds, buildBase, summarizeSync, needsReview } = await import('../js/syncmerge.js');
const { validateBackup } = await import('../js/backup.js');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails++; };
const day = (d) => new Date(Date.UTC(2026, 0, d)).toISOString();
const sec = (id, name, text = 'x') => ({ id, name, blocks: [{ id: 'b' + id, type: 'notes', text }] });
const song = (id, extra = {}) => ({ id, title: 'Song ' + id, artist: '', instrument: 'guitar', tuning: '', capo: 0, bpm: null, timeSig: '', notes: '', favorite: false, sample: false, folderId: null, createdAt: day(1), updatedAt: day(2), sections: [sec(id + '-v', 'Verse'), sec(id + '-c', 'Chorus')], ...extra });
const device = (songs = [], more = {}) => ({ songs, tabs: [], chords: [], patterns: [], folders: [], setlists: [], tomb: [], base: null, ...more });
const clone = (x) => JSON.parse(JSON.stringify(x));
const edit = (d, id, fn, when = day(10)) => { const s = d.songs.find((x) => x.id === id); fn(s); s.updatedAt = when; };

// Der ganze Ablauf wie im Sync: Manifest → nur Nötiges holen → Plan → Entscheidungen → auf beide Geräte anwenden → Basis
function apply(d, w) {
  for (const [st, id] of w.del) {
    if (st === 'tombstones') d.tomb = d.tomb.filter((t) => t.id !== id);
    else if (st !== 'trash') d[st] = d[st].filter((x) => x.id !== id);
  }
  for (const [st, o] of w.put) { d[st] = d[st].filter((x) => x.id !== o.id); d[st].push(clone(o)); }
  for (const id of w.trash) { d.songs = d.songs.filter((x) => x.id !== id); d.tomb.push({ id, deletedAt: day(11) }); }
  const refs = new Set(d.songs.flatMap((s) => s.sections.flatMap((x) => x.blocks.filter((b) => b.tabId).map((b) => b.tabId))));
  d.tabs = d.tabs.filter((t) => refs.has(t.id));
}
function sync(A, B, { decide, scope } = {}) {
  const la = buildManifest(A, { tombstones: A.tomb }), lb = buildManifest(B, { tombstones: B.tomb });
  const want = wantList(la.manifest, lb.manifest, A.base, scope);
  const names = new Map(B.folders.map((f) => [f.id, f.name]));
  const remote = { songs: B.songs.filter((s) => want.songs.includes(s.id)).map((s) => ({ ...clone(s), _folderName: names.get(s.folderId) || '' })), tabs: clone(B.tabs), chords: B.chords.filter((x) => want.chords.includes(x.id)), patterns: B.patterns.filter((x) => want.patterns.includes(x.id)), folders: B.folders.filter((x) => want.folders.includes(x.id)), setlists: B.setlists.filter((x) => want.setlists.includes(x.id)) };
  const plan = planSync({ local: A, remote, lm: la.manifest, rm: lb.manifest, base: A.base, scope });
  if (decide) decide(plan);
  const sum = summarizeSync(plan), review = needsReview(plan);
  const w = finalizeSync(plan, { local: A, remote, rm: lb.manifest, remoteName: 'iPad' });
  apply(B, w.remote);
  apply(A, w.local);
  const a2 = buildManifest(A, { tombstones: A.tomb }), b2 = buildManifest(B, { tombstones: B.tomb });
  const agreed = agreedIds(a2.manifest, b2.manifest);
  A.base = buildBase(a2.full, agreed, A.base, scope);
  B.base = buildBase(b2.full, agreed, B.base, scope);
  return { plan, sum, review, wanted: want.songs.length, agreed };
}
const pair = (songs) => { const A = device(clone(songs)), B = device(clone(songs)); sync(A, B); return [A, B]; };
const get = (d, id) => d.songs.find((s) => s.id === id);

console.log('Erster Sync: beide Geräte ergänzen sich');
{
  const A = device([song('a')]), B = device([song('b')]);
  const r = sync(A, B);
  ok(A.songs.length === 2 && B.songs.length === 2, `beide haben 2 Songs (${A.songs.length}/${B.songs.length})`);
  ok(!r.review, 'keine Rückfrage');
  ok(sync(A, B).plan.items.length === 0, 'zweiter Sync: nichts zu tun');
}
console.log('Nur das andere Gerät hat geändert');
{
  const [A, B] = pair([song('s')]);
  edit(B, 's', (s) => { s.title = 'Neu'; });
  const r = sync(A, B);
  ok(get(A, 's').title === 'Neu', 'automatisch übernommen');
  ok(!r.review && r.wanted === 1, 'ohne Rückfrage, genau ein Song übertragen');
}
console.log('Nur ich habe geändert');
{
  const [A, B] = pair([song('s'), song('t')]);
  edit(A, 's', (s) => { s.title = 'Mein'; });
  const r = sync(A, B);
  ok(get(A, 's').title === 'Mein' && get(B, 's').title === 'Mein', 'bleibt und geht ans andere Gerät');
  ok(r.wanted === 0, 'nichts wird vom anderen Gerät geholt');
}
console.log('Beide ändern verschiedene Teile: wird ohne Rückfrage zusammengeführt');
{
  const [A, B] = pair([song('s')]);
  edit(A, 's', (s) => { s.title = 'Titel A'; s.sections[0].blocks[0].text = 'Strophe A'; });
  edit(B, 's', (s) => { s.favorite = true; s.sections[1].blocks[0].text = 'Refrain B'; });
  const r = sync(A, B);
  for (const d of [A, B]) {
    const s = get(d, 's');
    ok(s.title === 'Titel A' && s.favorite === true && s.sections[0].blocks[0].text === 'Strophe A' && s.sections[1].blocks[0].text === 'Refrain B', 'alle Änderungen auf ' + (d === A ? 'A' : 'B'));
  }
  ok(!r.review, 'keine Rückfrage');
  ok(sync(A, B).plan.items.length === 0, 'danach sind beide gleich');
}
console.log('Beide ändern denselben Abschnitt: Konflikt');
{
  const [A, B] = pair([song('s')]);
  edit(A, 's', (s) => { s.sections[1].blocks[0].text = 'A'; s.sections[0].blocks[0].text = 'nur A'; }, day(10));
  edit(B, 's', (s) => { s.sections[1].blocks[0].text = 'B'; }, day(12));
  const r = sync(A, B);
  const c = r.plan.conflicts[0];
  ok(r.review && c.parts[0].includes('Chorus'), 'Rückfrage nennt den Abschnitt');
  ok(r.sum.text === '1 Konflikt', `Zusammenfassung: ${r.sum.text}`);
  ok(get(A, 's').sections[1].blocks[0].text === 'B', 'Standard: die neuere Version gewinnt den strittigen Teil');
  ok(get(A, 's').sections[0].blocks[0].text === 'nur A', 'der unstrittige Abschnitt bleibt trotzdem erhalten');
  ok(get(B, 's').sections[0].blocks[0].text === 'nur A', 'auch auf dem anderen Gerät');
}
console.log('Konflikt: Beide behalten');
{
  const [A, B] = pair([song('s')]);
  edit(A, 's', (s) => { s.title = 'A'; });
  edit(B, 's', (s) => { s.title = 'B'; });
  sync(A, B, { decide: (p) => { p.conflicts[0].choice = 'both'; } });
  ok(A.songs.length === 2 && B.songs.length === 2, 'zwei Songs auf beiden Geräten');
  ok(get(A, 's').title === 'A' && A.songs.some((x) => x.title === 'B (iPad)'), 'Original und Kopie');
  ok(sync(A, B).plan.items.length === 0, 'danach gleich');
}
console.log('Löschen wird übertragen');
{
  const [A, B] = pair([song('s'), song('t')]);
  A.songs = A.songs.filter((x) => x.id !== 's');
  A.tomb.push({ id: 's', deletedAt: day(9) });
  const r = sync(A, B);
  ok(!get(B, 's'), 'auf dem anderen Gerät ebenfalls weg');
  ok(r.sum.deleted === 1 && r.review, 'Löschung wird vorher genannt');
  ok(sync(A, B).plan.items.length === 0, 'danach nichts mehr zu tun');
}
console.log('Hier gelöscht, dort geändert: Konflikt, Standard behalten');
{
  const [A, B] = pair([song('s')]);
  A.songs = []; A.tomb.push({ id: 's', deletedAt: day(9) });
  edit(B, 's', (s) => { s.title = 'Geändert'; });
  const r = sync(A, B);
  ok(r.plan.conflicts.length === 1 && r.plan.conflicts[0].kind === 'delRemoteConflict', 'Konflikt erkannt');
  ok(get(A, 's')?.title === 'Geändert', 'Song kommt zurück');
  ok(!A.tomb.length, 'Löschvermerk aufgehoben');
}
console.log('Löschen ohne gemeinsame Basis: der Zeitpunkt entscheidet');
{
  const A = device([]), B = device([song('s', { updatedAt: day(2) })]);
  A.tomb.push({ id: 's', deletedAt: day(5) });
  sync(A, B);
  ok(!get(A, 's') && !get(B, 's'), 'später gelöscht als geändert: bleibt gelöscht');
  const C = device([]), D = device([song('s', { updatedAt: day(8) })]);
  C.tomb.push({ id: 's', deletedAt: day(5) });
  sync(C, D);
  ok(get(C, 's') && get(D, 's'), 'später geändert als gelöscht: bleibt erhalten');
}
console.log('Nie synchronisierte Songs werden nie gelöscht');
{
  const [A, B] = pair([song('s')]);
  A.songs.push(song('neu'));
  sync(A, B);
  ok(get(B, 'neu'), 'neuer Song kommt an statt zu verschwinden');
}
console.log('Gleicher Inhalt mit anderer ID: kein Duplikat und kein Löschen');
{
  const a = song('x'), b = clone(a); b.id = 'y';
  const A = device([a]), B = device([b]);
  sync(A, B);
  ok(A.songs.length === 1 && B.songs.length === 1, 'keine Kopien');
  const r = sync(A, B);
  ok(A.songs.length === 1 && B.songs.length === 1 && !r.plan.items.length, 'auch beim zweiten Sync unverändert');
}
console.log('Ordner: zählen über den Namen, getrennt angelegte werden nicht doppelt');
{
  const A = device([song('s', { folderId: 'fa' })], { folders: [{ id: 'fa', name: 'Band', updatedAt: day(1) }] });
  const B = device([song('s', { folderId: 'fb' })], { folders: [{ id: 'fb', name: 'band', updatedAt: day(1) }] });
  const r = sync(A, B);
  ok(A.folders.length === 1 && B.folders.length === 1, 'je ein Ordner');
  ok(!r.plan.items.length, 'Song gilt als gleich');
  edit(A, 's', (s) => { s.title = 'Neu'; });
  sync(A, B);
  ok(get(B, 's').folderId === 'fb', 'auf dem anderen Gerät bleibt die dortige Ordner-ID');
}
console.log('Ordner: neuer Ordner wandert mit dem Song');
{
  const [A, B] = pair([song('s')]);
  A.folders.push({ id: 'f1', name: 'Neu', updatedAt: day(9) });
  edit(A, 's', (s) => { s.folderId = 'f1'; });
  sync(A, B);
  ok(B.folders.some((f) => f.id === 'f1') && get(B, 's').folderId === 'f1', 'Ordner und Zuordnung kommen an');
}
console.log('Tabs: Änderung am Tab zählt als Änderung am Abschnitt');
{
  const tab = (f) => ({ id: 't1', songId: 's', name: 'Riff', updatedAt: day(2), measures: [{ id: 'm', cols: 1, notes: [[{ f }]], pm: [false] }] });
  const withTab = song('s', { sections: [{ id: 'q', name: 'Intro', blocks: [{ id: 'tb', type: 'tab', tabId: 't1' }] }] });
  const A = device([clone(withTab)], { tabs: [tab(3)] }), B = device([clone(withTab)], { tabs: [tab(3)] });
  sync(A, B);
  B.tabs = [tab(7)];
  sync(A, B);
  ok(A.tabs[0].measures[0].notes[0][0].f === 7, 'neuer Tab kommt an');
  A.songs[0].sections = [];
  sync(A, B);
  ok(!B.tabs.length, 'entfernter Tab verschwindet auch dort');
}
console.log('Abschnitte: hinzufügen, löschen, Reihenfolge');
{
  const [A, B] = pair([song('s')]);
  edit(A, 's', (s) => { s.sections.push(sec('neu-a', 'Bridge')); });
  edit(B, 's', (s) => { s.sections.shift(); s.sections.push(sec('neu-b', 'Outro')); });
  const r = sync(A, B);
  const names = get(A, 's').sections.map((x) => x.name);
  ok(!r.review, 'keine Rückfrage');
  ok(names.includes('Bridge') && names.includes('Outro') && !names.includes('Verse'), `zusammengeführt: ${names.join(', ')}`);
  ok(sync(A, B).plan.items.length === 0, 'danach gleich');
}
console.log('Favorit: die neuere Änderung gewinnt ohne Rückfrage');
{
  const [A, B] = pair([song('s')]);
  edit(A, 's', (s) => { s.favorite = true; s.notes = 'A'; }, day(8));
  edit(B, 's', (s) => { s.artist = 'B'; }, day(9));
  const r = sync(A, B);
  ok(!r.review && get(B, 's').favorite === true, 'übernommen');
}
console.log('Griffe und Setlisten');
{
  const ch = (name, u = day(2)) => ({ id: 'c1', name, frets: [0, 0, 0, 0, 0, 0], updatedAt: u });
  const A = device([], { chords: [ch('X')], setlists: [{ id: 'L', name: 'Gig', songIds: [], updatedAt: day(2) }] });
  const B = device([]);
  sync(A, B);
  ok(B.chords.length === 1 && B.setlists.length === 1, 'kommen an');
  B.chords = [ch('Y', day(9))];
  A.setlists = [];
  const r = sync(A, B);
  ok(A.chords[0].name === 'Y', 'geänderter Griff übernommen');
  ok(!B.setlists.length, 'gelöschte Setlist auch dort gelöscht');
  ok(r.sum.others === 2, 'als weitere Änderungen gezählt');
}
console.log('Nur ausgewählte Songs');
{
  const [A, B] = pair([song('s'), song('t')]);
  edit(A, 's', (x) => { x.title = 'S neu'; });
  edit(A, 't', (x) => { x.title = 'T neu'; });
  edit(B, 't', (x) => { x.notes = 'B'; });
  B.songs = B.songs.filter((x) => x.id !== 't');
  A.songs.push(song('u'));
  const scope = { songs: new Set(['s', 'u']), chords: new Set() };
  sync(A, B, { scope });
  ok(get(B, 's').title === 'S neu' && get(B, 'u'), 'Auswahl kommt an');
  ok(!get(B, 't'), 'nicht ausgewählte Songs bleiben unberührt');
  ok(get(A, 't'), 'im Auswahl-Modus wird nichts gelöscht');
  const r = sync(A, B, { scope: { songs: new Set(['s', 'u']), chords: new Set() } });
  ok(!r.plan.items.length, 'danach gleich');
}
console.log('Abgebrochener Sync richtet keinen Schaden an');
{
  // Das andere Gerät hat die Änderungen schon, dieses Gerät hat Basis und Daten noch nicht aktualisiert
  const [A, B] = pair([song('s')]);
  edit(A, 's', (s) => { s.title = 'A'; });
  edit(B, 's', (s) => { s.notes = 'B'; });
  const merged = clone(get(A, 's'));
  merged.notes = 'B';
  B.songs = [clone(merged)]; // B hat zusammengeführt, A ist danach ausgefallen
  const r = sync(A, B);
  ok(get(A, 's').title === 'A' && get(A, 's').notes === 'B', 'beim nächsten Sync ist alles da');
  ok(!r.review, 'ohne Rückfrage');
}
console.log('Tab: Akkordnamen und Anschläge überstehen Backup und Sync');
{
  const tab = { id: 't', songId: 's', name: 'Riff', measures: [{ id: 'm', cols: 2, notes: Array.from({ length: 6 }, () => [{ f: 1 }, null]), pm: [false, false], st: ['d', 'u'], ch: ['G', ''] }] };
  const out = validateBackup({ app: 'guitar-notebook', format: 3, songs: [song('s')], tabs: [tab] }).data.tabs[0].measures[0];
  ok(out.st.join() === 'd,u' && out.ch[0] === 'G', 'bleiben erhalten');
}
console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(fails ? 1 : 0);
