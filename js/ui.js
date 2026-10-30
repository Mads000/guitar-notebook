// UI-Helfer: DOM-Erzeugung, Icons, Sheets, Dialoge, Toasts und kleine Steuerelemente.
import { onSaveStatus, lastError } from './storage.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') value = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}

// Ersetzt den Inhalt; null/false werden wie bei h() übersprungen (replaceChildren würde sie als Text einfügen).
export function fill(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : String(k));
  }
}

// Kurze Vibration („Tick“) als Rückmeldung. Android: vibrate(); iPhone (ab iOS 18): Safari erlaubt keine
// Vibration, quittiert aber das Umschalten eines iOS-Schalters (<input switch>) mit einem Tick – dafür wird
// kurz ein unsichtbarer Schalter angelegt und „angetippt“. Funktioniert nur direkt aus einem Tipp heraus.
// Abschaltbar unter Einstellungen → Darstellung.
let hapticsOn = true;
try { hapticsOn = localStorage.getItem('gn-haptics') !== 'off'; } catch { /* Standard: an */ }
export const hapticsEnabled = () => hapticsOn;
export function setHaptics(on) {
  hapticsOn = !!on;
  try { if (on) localStorage.removeItem('gn-haptics'); else localStorage.setItem('gn-haptics', 'off'); } catch { /* egal */ }
}
let lastHaptic = 0;
export function haptic() {
  if (!hapticsOn) return;
  const t = Date.now();
  if (t - lastHaptic < 60) return; // nicht doppelt, wenn mehrere Stellen dieselbe Berührung melden
  lastHaptic = t;
  try {
    if (navigator.vibrate) { navigator.vibrate(10); return; }
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.append(input);
    document.head.append(label);
    label.click();
    label.remove();
  } catch { /* ohne Rückmeldung weiter */ }
}

// Tick bei wichtigen Knöpfen: Zurück, Fertig, Plus, Werkzeuge im Akkord-Editor, Tasten in Editoren, Dialoge
const HAPTIC_SEL = '.glass-btn, .sj-btn, .qs-tpl, .tab-auto, .nav-btn, .sheet-btn, .dlg-btn, .add-block-btn, .add-sec-btn, .pe-tool, .pe-go, .pe-done, .pe-plus, .strum-key, .tab-key, .tool, .btn, .pills .pill, .stage-btn, .cz-nav, .play-btn';
document.addEventListener('click', (e) => { if (e.isTrusted && e.target.closest?.(HAPTIC_SEL)) haptic(); }, true);
// Kein versehentliches Zoomen mit zwei Fingern (verschiebt sonst die ganze Seite) – außer in der Foto-Ansicht.
// Größer stellen geht über ••• → Schrift- und Griffgröße.
document.addEventListener('gesturestart', (e) => { if (!e.target.closest?.('.lightbox')) e.preventDefault(); });

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- Icons (eigene, schlichte Linien-Icons) ----------
const ICONS = {
  back: '<path d="M15 4.5 7.5 12l7.5 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  star: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.6 15.6 4.6 4.6"/>',
  compose: '<path d="M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13"/><path d="M17.8 3.9a1.9 1.9 0 0 1 2.7 2.7l-8.3 8.3-3.6.9.9-3.6z"/>',
  share: '<path d="M12 3.5v11.5M8 7.5l4-4 4 4"/><path d="M8.5 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.9 12.6a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.6"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  sort: '<path d="M7.5 4.5v15M4 16l3.5 3.5L11 16M16.5 19.5v-15M13 8l3.5-3.5L20 8"/>',
  undo: '<path d="M9 13.5 4.5 9 9 4.5"/><path d="M4.5 9h10a5 5 0 0 1 0 10H11"/>',
  redo: '<path d="m15 13.5 4.5-4.5L15 4.5"/><path d="M19.5 9h-10a5 5 0 0 0 0 10H13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevron: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  doc: '<path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
  music: '<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  grid: '<path d="M6 4v16M10 4v16M14 4v16M18 4v16M6 4h12M6 8h12M6 12h12M6 16h12"/>',
  strings: '<path d="M3.5 6h17M3.5 9.6h17M3.5 13.2h17M3.5 16.8h17"/><path d="M8 4v15M15 4v15" stroke-opacity=".45"/>',
  wave: '<path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>',
  note: '<path d="M5 5.5h14M5 10h14M5 14.5h9"/>',
  reorder: '<path d="M5 8h14M5 12h14M5 16h14"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  open: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10v3z"/><path d="m14 8 3 3"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9 5h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.4"/>',
  photo: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-5 4 4 2.5-2.5L20 18"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3"/>',
  magic: '<path d="m4.5 19.5 10-10M13 8l1.5-1.5 3 3L16 11"/><path d="M17.5 3v3M16 4.5h3M20.5 9v2M19.5 10h2M8 3.5v2M7 4.5h2"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2.2h7.2a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  filter: '<path d="M4.5 7h15M7.5 12h9M10.5 17h3"/>',
  pin: '<path d="M9 4.5h6M10 4.5v5.2L7.2 13h9.6L14 9.7V4.5M12 13v6.5"/>',
  text: '<path d="M4 18 8.5 6.5 13 18M5.6 14h5.8M14.5 18l3-7.5 3 7.5M15.3 16h4.4"/>',
  list: '<path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10"/><path d="M4.8 6.5h.01M4.8 12h.01M4.8 17.5h.01" stroke-width="2.8"/>',
  fork: '<path d="M8.5 3.5v6.5a3.5 3.5 0 0 0 7 0V3.5M12 13.5v7"/>',
  pick: '<path d="M12 21c-3.5-3.2-7-8.7-7-12.2C5 5.7 8.1 3.5 12 3.5s7 2.2 7 5.3c0 3.5-3.5 9-7 12.2z"/>',
  guitar: '<path d="m13.8 10.2 5.7-5.7M18 3.2l2.8 2.8"/><path d="M10.4 8.8c-1.4-.9-3.2-.6-4.2.6-.7.8-.6 1.8-1.7 2.4-1.4.7-2.3 1.4-2.3 3 0 2.6 2.4 5.1 5 5.1 1.7 0 2.4-1 3-2.3.6-1.1 1.6-1 2.4-1.7 1.2-1 1.5-2.8.6-4.2z"/><circle cx="8.6" cy="15.4" r="1.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  heart: '<path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 6.8a4.2 4.2 0 0 1 7.5 2.7c0 5.4-7.5 10-7.5 10z"/>',
  zoom: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.6 15.6 4.6 4.6M10.8 8.3v5M8.3 10.8h5"/>',
  paste: '<rect x="5.5" y="5" width="13" height="15.5" rx="2"/><path d="M9 5V3.8h6V5M9 11h6M9 14.5h4"/>',
  rename: '<path d="M4 7.5h9M4 12h6M4 16.5h4"/><path d="M13.5 19.5h2l5-5a1.4 1.4 0 0 0-2-2l-5 5z"/>',
  fold: '<path d="m7 9 5 5 5-5"/>',
  key: '<circle cx="8" cy="15" r="3.8"/><path d="m10.8 12.3 8.2-8.2M16 7l2.5 2.5M13.8 9.3l2 2"/>',
  storage: '<ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v11c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-11M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
  app: '<rect x="4.5" y="4.5" width="15" height="15" rx="4.5"/><path d="M9.5 14.5c1.6-3.6 3.4-5 5-5"/>',
  tag: '<path d="M4 12.5V5.5A1.5 1.5 0 0 1 5.5 4h7l7.5 7.5-8 8z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
};

export function icon(name, cls = '') {
  const s = document.createElement('span');
  s.className = 'icon' + (cls ? ' ' + cls : '');
  s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return s;
}

export function navBtn(iconName, onClick, { label, text, cls = '' } = {}) {
  return h('button', { class: 'nav-btn ' + cls, 'aria-label': label || text || iconName, onClick },
    iconName && icon(iconName), text);
}

// ---------- Sheets (von unten einfahrende Ebenen) ----------
let zTop = 100;
const openSheets = [];

export function sheet({ title = '', body, left, right, full = false, cls = '', onClose } = {}) {
  const z = (zTop += 3);
  const backdrop = h('div', { class: 'sheet-backdrop', style: `z-index:${z}` });
  const titleEl = h('div', { class: 'sheet-title' }, title);
  const content = h('div', { class: 'sheet-body' });
  const mk = (b, side) => b
    ? h('button', { class: `sheet-btn ${side}${b.bold ? ' bold' : ''}`, onClick: () => (b.onClick ? b.onClick(ctl) : ctl.close()) }, b.label)
    : h('span');
  const panel = h('div', { class: `sheet ${full ? 'sheet-full' : ''} ${cls}`, style: `z-index:${z + 1}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grabber' }),
    h('div', { class: 'sheet-head' }, mk(left, 'left'), titleEl, mk(right, 'right')),
    content);
  if (body) append(content, [body]);
  let closed = false;
  const ctl = {
    el: panel,
    body: content,
    setTitle(t) { titleEl.textContent = t; },
    close() {
      if (closed) return;
      closed = true;
      openSheets.splice(openSheets.indexOf(ctl), 1);
      panel.classList.remove('open');
      backdrop.classList.remove('open');
      setTimeout(() => { panel.remove(); backdrop.remove(); }, 320);
      if (onClose) onClose();
    },
  };
  backdrop.addEventListener('click', () => ctl.close());
  swipeToClose(panel, content, backdrop, () => ctl.close());
  document.body.append(backdrop, panel);
  openSheets.push(ctl);
  requestAnimationFrame(() => requestAnimationFrame(() => { backdrop.classList.add('open'); panel.classList.add('open'); }));
  return ctl;
}

// Wie bei iOS: Fenster nach unten wischen schließt es. Am Kopf geht das immer, im Inhalt nur,
// wenn er ganz oben steht – sonst wird normal gescrollt. Eingabefelder und Regler bleiben unberührt.
const NO_SWIPE = 'input, textarea, select, .slider, .drag-handle, .pe-chips, .diagram-stage';
function swipeToClose(panel, body, backdrop, close) {
  let start = null, dy = 0, dragging = false;
  panel.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest(NO_SWIPE)) { start = null; return; }
    const inBody = body.contains(e.target);
    if (inBody && body.scrollTop > 0) { start = null; return; }
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY, time: Date.now() };
    dy = 0; dragging = false;
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (!start) return;
    const t = e.touches[0];
    const mx = t.clientX - start.x, my = t.clientY - start.y;
    if (!dragging) {
      // Erst ab einer klaren Bewegung nach unten; seitliches Wischen (z. B. im Tab) bleibt frei
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) { start = null; return; }
      if (my < 8 || (body.contains(e.target) && body.scrollTop > 0)) return;
      dragging = true;
      panel.style.transition = 'none';
      backdrop.style.transition = 'none';
    }
    e.preventDefault();
    dy = Math.max(0, my);
    panel.style.transform = `translateY(${dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / (panel.offsetHeight || 1)));
  }, { passive: false });
  const end = () => {
    if (!start) return;
    const fast = dy / Math.max(1, Date.now() - start.time) > 0.6;
    start = null;
    if (!dragging) return;
    dragging = false;
    panel.style.transition = '';
    backdrop.style.transition = '';
    panel.style.transform = '';
    const shut = dy > Math.min(140, panel.offsetHeight * 0.3) || (fast && dy > 40);
    backdrop.style.opacity = shut ? '0' : '';
    if (shut) { haptic(); close(); }
  };
  panel.addEventListener('touchend', end);
  panel.addEventListener('touchcancel', end);
}

export const topSheet = () => openSheets[openSheets.length - 1];
export const anyOverlayOpen = () => openSheets.length > 0 || !!document.querySelector('.dlg-wrap, .action-sheet');

// ---------- Aktionsblatt ----------
export function actionSheet(title, items) {
  return new Promise((resolve) => {
    const z = (zTop += 3);
    const backdrop = h('div', { class: 'sheet-backdrop', style: `z-index:${z}` });
    let done = false;
    const close = (v) => {
      if (done) return;
      done = true;
      panel.classList.remove('open');
      backdrop.classList.remove('open');
      setTimeout(() => { panel.remove(); backdrop.remove(); }, 300);
      resolve(v);
    };
    // { section: 'Name' } erzeugt eine Zwischenüberschrift; lange Menüs werden kompakt und scrollbar
    const list = items.filter(Boolean);
    const compact = list.length > 7;
    // Mit Symbolen: linksbündige Zeilen wie im iOS-Kontextmenü
    const withIcons = list.some((it) => it.icon);
    const btns = list.map((it) => (it.section ? h('div', { class: 'as-section' + (it.section.trim() ? '' : ' gap') }, it.section.trim()) : h('button', {
      class: 'as-btn' + (it.destructive ? ' danger' : ''),
      disabled: it.disabled,
      onClick: () => { haptic(); close(it.value ?? true); if (it.onClick) it.onClick(); },
    }, withIcons && icon(it.icon || 'blank', 'as-icon'), h('span', { class: 'as-label' }, it.label))));
    const panel = h('div', { class: 'action-sheet', style: `z-index:${z + 1}`, role: 'dialog' },
      title && h('div', { class: 'as-title-bar' }, title), h('div', { class: 'as-group' + (compact ? ' compact' : '') + (withIcons ? ' with-icons' : '') + (title ? ' has-title' : '') }, btns),
      h('button', { class: 'as-btn as-cancel', onClick: () => close(null) }, 'Abbrechen'));
    backdrop.addEventListener('click', () => close(null));
    document.body.append(backdrop, panel);
    requestAnimationFrame(() => requestAnimationFrame(() => { backdrop.classList.add('open'); panel.classList.add('open'); }));
  });
}

// ---------- Kompaktes Menü direkt am Knopf (z. B. „+“ am Ende eines Abschnitts) ----------
export function popMenu(anchor, items) {
  const z = (zTop += 3);
  const shade = h('div', { class: 'pop-shade', style: `z-index:${z}` });
  const close = () => { menu.classList.remove('open'); shade.remove(); setTimeout(() => menu.remove(), 180); };
  const menu = h('div', { class: 'pop-menu', role: 'menu', style: `z-index:${z + 1}` },
    items.filter(Boolean).map((it) => (it.section ? h('div', { class: 'pop-sec' }, it.section) : h('button', { class: 'pop-item', role: 'menuitem', onClick: () => { haptic(); close(); it.onClick(); } },
      icon(it.icon, 'small'), h('span', null, it.label)))));
  shade.addEventListener('click', close);
  document.body.append(shade, menu);
  const r = anchor.getBoundingClientRect();
  const mh = menu.offsetHeight, mw = menu.offsetWidth;
  const below = r.bottom + 6 + mh < window.innerHeight - 20;
  menu.style.top = `${Math.max(10, Math.min(window.innerHeight - mh - 10, below ? r.bottom + 6 : r.top - mh - 6))}px`;
  menu.style.left = `${Math.max(10, Math.min(r.left, window.innerWidth - mw - 10))}px`;
  menu.style.transformOrigin = below ? 'top left' : 'bottom left';
  requestAnimationFrame(() => menu.classList.add('open'));
  return close;
}

// ---------- Dialoge ----------
export function dialog({ title, message, input, extra, buttons, stacked = false }) {
  return new Promise((resolve) => {
    const field = input ? h('input', {
      class: 'dlg-input', type: 'text', value: input.value || '', placeholder: input.placeholder || '',
      autocapitalize: input.autocapitalize || 'sentences', autocomplete: 'off', enterkeyhint: 'done',
    }) : null;
    const wrap = h('div', { class: 'dlg-wrap', style: `z-index:${(zTop += 3)}` });
    const done = (v) => { wrap.remove(); resolve(v); };
    const btns = buttons.map((b) => h('button', {
      class: 'dlg-btn ' + (b.style || ''),
      onClick: () => done(b.value === '$input' ? field.value : b.value),
    }, b.label));
    if (field) {
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); btns[btns.length - 1].click(); }
        if (e.key === 'Escape') btns[0].click();
      });
    }
    wrap.append(h('div', { class: 'dlg', role: 'alertdialog' },
      h('div', { class: 'dlg-text' }, h('div', { class: 'dlg-title' }, title), message && h('div', { class: 'dlg-msg' }, message), field, extra),
      h('div', { class: 'dlg-btns' + (stacked || buttons.length > 2 ? ' stacked' : '') }, btns)));
    document.body.append(wrap);
    if (field) { field.focus(); field.select(); }
  });
}

export function ask(title, { value = '', placeholder = '', ok = 'OK', message, autocapitalize, extra } = {}) {
  return dialog({
    title, message, input: { value, placeholder, autocapitalize }, extra,
    buttons: [{ label: 'Abbrechen', value: null }, { label: ok, value: '$input', style: 'bold' }],
  }).then((v) => (v == null ? null : v.trim()));
}

export function confirmDialog(title, message, { ok = 'OK', destructive = false } = {}) {
  return dialog({ title, message, buttons: [{ label: 'Abbrechen', value: false }, { label: ok, value: true, style: destructive ? 'danger bold' : 'bold' }] });
}

export function alertDialog(title, message) {
  return dialog({ title, message, buttons: [{ label: 'OK', value: true, style: 'bold' }] });
}

// ---------- Toast & Banner ----------
let toastEl, toastTimer;
export function toast(msg, ms = 2200) {
  if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status' }); document.body.append(toastEl); }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

export function banner(text, sub, actionLabel, onAction) {
  document.querySelectorAll('.banner').forEach((b) => b.remove());
  const el = h('div', { class: 'banner', role: 'alert' },
    h('div', { class: 'txt' }, text, sub && h('small', null, sub)),
    actionLabel && h('button', { class: 'btn small primary', onClick: () => { el.remove(); onAction(); } }, actionLabel),
    h('button', { class: 'nav-btn', 'aria-label': 'Schließen', onClick: () => el.remove() }, icon('close', 'small')));
  document.body.append(el);
  return el;
}

// ---------- Steuerelemente ----------
export function segmented(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'radiogroup' });
  const render = () => el.replaceChildren(...options.map((o) => h('button', {
    class: 'seg-btn' + (o.value === value ? ' on' : ''), role: 'radio', 'aria-checked': String(o.value === value),
    onClick: () => { if (value === o.value) return; haptic(); value = o.value; render(); onChange(value); },
  }, o.label)));
  render();
  el.set = (v) => { value = v; render(); };
  return el;
}

export function stepper({ value, min = 0, max = 99, step = 1, format = (v) => String(v), onChange }) {
  const out = h('span', { class: 'stp-val' }, format(value));
  const set = (v) => {
    v = Math.max(min, Math.min(max, v));
    if (v === value) return;
    haptic();
    value = v;
    out.textContent = format(v);
    onChange(v);
  };
  const el = h('div', { class: 'stepper' },
    h('button', { class: 'stp-btn', 'aria-label': 'Weniger', onClick: () => set(value - step) }, '−'),
    out,
    h('button', { class: 'stp-btn', 'aria-label': 'Mehr', onClick: () => set(value + step) }, '+'));
  el.set = (v) => { value = v; out.textContent = format(v); };
  return el;
}

export function toggle(checked, onChange) {
  const i = h('input', { type: 'checkbox', class: 'switch', role: 'switch' });
  i.checked = !!checked;
  i.addEventListener('change', () => { haptic(); onChange(i.checked); });
  return i;
}

export const formRow = (label, control, sub, iconName) => h('div', { class: 'form-row' }, iconName && icon(iconName, 'row-icon'), h('span', { class: 'lbl' }, label, sub && h('small', null, sub)), control);

export function actionRow(label, onClick, { danger = false, iconName } = {}) {
  return h('button', { class: 'form-row action' + (danger ? ' danger' : ''), onClick },
    iconName && icon(iconName, 'row-icon'), h('span', { class: 'action-label' }, label), !danger && icon('chevron', 'small chev'));
}

export function autogrow(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return ta;
}

// Speicherstatus-Anzeige: zeigt deutlich, wenn eine Änderung noch nicht sicher gespeichert ist.
export function saveIndicator() {
  const label = h('span', { class: 'label' });
  const el = h('button', {
    class: 'save-state', 'aria-live': 'polite',
    onClick: () => {
      const e = lastError();
      if (e) alertDialog('Nicht gespeichert', `Die letzte Änderung konnte noch nicht in der Datenbank gesichert werden (${e.message || e}).
Sie ist zwischengespeichert; die App versucht es automatisch erneut. Bitte schließe die App erst, wenn hier wieder „Gespeichert“ steht.`);
    },
  }, h('span', { class: 'dot' }), label);
  let timer;
  const dispose = onSaveStatus((st) => {
    el.className = 'save-state ' + st;
    label.textContent = st === 'saving' ? 'Speichert…' : st === 'error' ? 'Nicht gespeichert' : 'Gespeichert';
    if (st === 'saved') { el.classList.add('just-saved'); clearTimeout(timer); timer = setTimeout(() => el.classList.remove('just-saved'), 1600); }
  });
  return { el, dispose };
}

// ---------- Datum ----------
export function relDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const t = d.getTime();
  if (t >= today) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (t >= today - 864e5) return 'Gestern';
  if (t >= today - 6 * 864e5) return d.toLocaleDateString('de-DE', { weekday: 'long' });
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export const fullDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '–' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ---------- Dateien ausgeben (Teilen, Sichern, Öffnen) ----------
// Langes Drücken (Touch) bzw. Rechtsklick öffnet ein Kontextmenü. Bewegung/Scrollen bricht ab,
// ein normaler Tipp bleibt ein normaler Tipp.
export function longPress(el, fn, ms = 450) {
  let timer = 0, x = 0, y = 0, fired = false;
  const cancel = () => { clearTimeout(timer); timer = 0; el.classList.remove('pressing'); };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    fired = false; x = e.clientX; y = e.clientY;
    el.classList.add('pressing');
    timer = setTimeout(() => { timer = 0; fired = true; el.classList.remove('pressing'); haptic(); fn(e); }, ms);
  });
  el.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 8) cancel(); }, { passive: true });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, cancel);
  el.addEventListener('click', (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!fired && e.button === 2) fn(e); });
}

// Listen per Ziehen am Griff (.drag-handle) umsortieren. onMove(from, to) erhält die Indizes.
export function dragSort(ul, onMove) {
  ul.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || !ul.contains(handle)) return;
    const li = handle.closest('li');
    const items = [...ul.children];
    const from = items.indexOf(li);
    const step = li.offsetHeight;
    const startY = e.clientY;
    let to = from;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    li.classList.add('dragging');
    const move = (ev) => {
      const dy = ev.clientY - startY;
      li.style.transform = `translateY(${dy}px)`;
      to = Math.max(0, Math.min(items.length - 1, from + Math.round(dy / step)));
      items.forEach((it, i) => {
        if (it === li) return;
        const shift = from < to && i > from && i <= to ? -step : from > to && i < from && i >= to ? step : 0;
        it.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      items.forEach((it) => { it.style.transform = ''; });
      li.classList.remove('dragging');
      if (to !== from) onMove(from, to);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

// onSaved wird nur aufgerufen, wenn die Datei tatsächlich geteilt/gesichert oder heruntergeladen wurde.
export function offerFile(blob, filename, { title = 'Datei bereit', openable = false, onSaved } = {}) {
  const file = new File([blob], filename, { type: blob.type });
  const url = URL.createObjectURL(blob);
  let canShare = false;
  try { canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch { canShare = false; }
  const kb = blob.size < 1024 * 1024 ? Math.max(1, Math.round(blob.size / 1024)) + ' KB' : (blob.size / 1048576).toFixed(1) + ' MB';
  const download = () => {
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    if (onSaved) onSaved('download');
  };
  const body = h('div', null,
    h('div', { class: 'file-card' }, icon('doc'), h('div', { class: 'file-name' }, filename), h('div', { class: 'file-size' }, kb)),
    h('div', { class: 'stack' },
      canShare && h('button', { class: 'btn primary block', onClick: () => navigator.share({ files: [file], title: filename }).then(() => onSaved && onSaved('share')).catch(() => {}) }, icon('share'), 'Teilen / In Dateien sichern'),
      openable && h('button', { class: 'btn block', onClick: () => window.open(url, '_blank') }, icon('open'), 'Öffnen'),
      h('button', { class: 'btn block' + (canShare ? '' : ' primary'), onClick: download }, icon('download'), 'Herunterladen')),
    h('p', { class: 'hint', style: 'margin-top:14px;text-align:center' }, canShare
      ? 'Über „Teilen“ kannst du die Datei in der Dateien-App sichern, drucken oder versenden.'
      : 'Die Datei wird im Download-Ordner gespeichert.'));
  const s = sheet({ title, body, right: { label: 'Fertig', bold: true }, onClose: () => setTimeout(() => URL.revokeObjectURL(url), 60000) });
  return s;
}

// Escape schließt die oberste Ebene (für die Bedienung am PC)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const dlg = document.querySelector('.dlg-wrap:last-of-type .dlg-btn');
  if (dlg) return;
  const t = topSheet();
  if (t) t.close();
});

// iOS zeigt :active-Zustände (Drücken-Animation) nur, wenn irgendwo ein touchstart-Listener hängt
document.addEventListener('touchstart', () => {}, { passive: true });

// Breite der Bildlaufleiste (PC), damit fest positionierte Leisten genau über dem Inhalt stehen
try {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:-999px;width:100px;height:100px;overflow:scroll';
  document.documentElement.append(probe);
  document.documentElement.style.setProperty('--sbw', `${probe.offsetWidth - probe.clientWidth}px`);
  probe.remove();
} catch { /* ohne Ausgleich */ }
