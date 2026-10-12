(() => {
'use strict';

/* ════════════════════════════════════════════════════════════════════
   1 · HILFSFUNKTIONEN
   ════════════════════════════════════════════════════════════════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const ic = (n, c = '') => `<svg class="i ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const glyph = (g, color, cls = '') => `<svg class="glyph ${cls}" viewBox="0 0 64 64" style="color:${color}" aria-hidden="true"><use href="#g-${g}"/></svg>`;
const EUR = new Intl.NumberFormat('de-AT', {style: 'currency', currency: 'EUR'});
const EUR0 = new Intl.NumberFormat('de-AT', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0});
const eur = v => EUR.format(Math.abs(v) < .005 ? 0 : v);
const eur0 = v => EUR0.format(v);
const NF = {};
const num = (v, d = 0) => (NF[d] ||= new Intl.NumberFormat('de-DE', {minimumFractionDigits: d, maximumFractionDigits: d})).format(v);
const pct = (v, d = 1) => `${v > 0.049 ? '+' : v < -0.049 ? '−' : '±'}${num(Math.abs(v), d)} %`;
const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = (n, l = 2) => String(n).padStart(l, '0');
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const wait = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 9);
const initials = n => n.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const reduced = () => document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const persist = {
  get(k, d) { try { const v = localStorage.getItem('kontor.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kontor.' + k, JSON.stringify(v)); } catch { /* privat / blockiert */ } },
};
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Strg';
const parseAmt = s => { const v = parseFloat(String(s).trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isFinite(v) ? v : NaN; };
const DESKTOP = !!(window.__TAURI__ && window.__TAURI__.core);
const invoke = (cmd, args) => DESKTOP ? window.__TAURI__.core.invoke(cmd, args) : Promise.reject(new Error('Nur in der Desktop-App'));
const isTyping = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

const NOW = new Date();
const NOW_H = NOW.getHours() + NOW.getMinutes() / 60;
const DEMO_H = NOW_H >= 10 && NOW_H < 18.9 ? NOW_H : 15 + 40 / 60;   // Testdaten: „Stand“ während Öffnungszeit
const hhmm = h => { const hh = Math.floor(h); const mm = Math.floor((h - hh) * 60 + 1e-6); return `${pad(hh)}:${pad(mm)}`; };
const DATE_LONG = NOW.toLocaleDateString('de-AT', {weekday: 'long', day: 'numeric', month: 'long'});
const YEAR = NOW.getFullYear();
const clock = (secs = false) => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}${secs ? ':' + pad(d.getSeconds()) : ''}`; };

/* ════════════════════════════════════════════════════════════════════
   2 · HOOKS — lokaler Ereignisbus
   Jede fachliche Aktion feuert ein Ereignis. Regeln, Skripte (Sandbox),
   Workflows und Webhooks hängen sich daran – die Oberfläche selbst ist
   nur ein weiterer Abonnent.
   ════════════════════════════════════════════════════════════════════ */
const Hooks = {
  map: {}, log: [], count: 0,
  on(evt, fn) { (this.map[evt] ||= []).push(fn); },
  emit(evt, payload = {}) {
    const e = {t: new Date(), evt, payload};
    this.count++; this.log.unshift(e); if (this.log.length > 200) this.log.pop();
    [...(this.map[evt] || []), ...(this.map['*'] || [])].forEach(fn => { try { fn(payload, e); } catch (err) { console.error(err); } });
  },
};
const BINDINGS = [
  {evt: 'pos.sale.completed', kind: 'Webhook', target: 'POST https://erp.alpenlicht.local/hooks/sale', note: 'Ziel freigegeben'},
  {evt: 'pos.line.added', kind: 'Skript', target: 'skiservice-hinweis.js', note: 'Sandbox · ≤ 5 ms'},
  {evt: 'pos.discount.requested', kind: 'Regel', target: 'Rabattfreigabe über 20 %', note: 'Workflow-Designer'},
  {evt: 'pos.customer.attached', kind: 'Regel', target: 'Vereinsrabatt anwenden', note: 'Workflow-Designer'},
  {evt: 'rksv.receipt.signed', kind: 'System', target: 'DEP · Datenerfassungsprotokoll', note: 'gesetzlich · fix'},
  {evt: 'inventory.low', kind: 'Workflow', target: 'Nachbestellvorschlag → Einkauf', note: 'täglich 06:00'},
];

/* ════════════════════════════════════════════════════════════════════
   3 · DARSTELLUNG — Benutzer-Ebene der Token-Kaskade
   ════════════════════════════════════════════════════════════════════ */
const ACCENTS = {
  ozean: {h: 214, s: 74, name: 'Ozean'},
  kupfer: {h: 26, s: 52, name: 'Kupfer'},
  amber: {h: 37, s: 70, name: 'Amber'},
  salbei: {h: 150, s: 20, name: 'Salbei'},
  gletscher: {h: 205, s: 42, name: 'Gletscher'},
  graphit: {h: 240, s: 4, name: 'Graphit'},
};
const prefs = Object.assign({theme: 'light', accent: 'ozean', custom: null, density: 'comfort', radius: 'soft', motion: 'full', sidebar: false, tiles: 'media', tpl: 'classic'}, persist.get('prefs', {}));
// 0.10: neues helles Standard-Design einmalig übernehmen (danach gilt wieder die eigene Wahl)
if ((prefs.v || 1) < 2) { prefs.theme = 'light'; prefs.accent = 'ozean'; prefs.v = 2; }
const resolvedTheme = () => prefs.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : prefs.theme;
function applyPrefs(animate) {
  const run = () => {
    const r = document.documentElement;
    r.dataset.theme = resolvedTheme(); r.dataset.density = prefs.density; r.dataset.radius = prefs.radius; r.dataset.motion = prefs.motion;
    const a = prefs.accent === 'custom' && prefs.custom ? prefs.custom : (ACCENTS[prefs.accent] || ACCENTS.ozean);
    r.style.setProperty('--ah', a.h); r.style.setProperty('--as', a.s + '%');
    const tb = $('#themeBtn use'); if (tb) tb.setAttribute('href', resolvedTheme() === 'dark' ? '#i-sun' : '#i-moon');
    persist.set('prefs', prefs);
  };
  if (animate && document.startViewTransition && !reduced()) document.startViewTransition(run); else run();
  requestAnimationFrame(() => { $$('.seg').forEach(s => s._place && s._place(false)); if (S.view === 'designsystem') fillSwatches(); });
}
function toggleTheme() { prefs.theme = resolvedTheme() === 'dark' ? 'light' : 'dark'; applyPrefs(true); }
function setAccent(k) { prefs.accent = k; applyPrefs(true); toast(`Akzentfarbe: ${ACCENTS[k].name}`, {icon: 'palette', type: 'accent'}); }
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => prefs.theme === 'system' && applyPrefs(true));

/* ════════════════════════════════════════════════════════════════════
   4 · TESTDATEN
   ════════════════════════════════════════════════════════════════════ */
const COLORS = {
  moos: ['Moos', '#5A7550'], schiefer: ['Schiefer', '#4D586A'], glut: ['Glut', '#B9582F'], gletscher: ['Gletscher', '#7097B3'],
  sand: ['Sand', '#C4A67E'], nacht: ['Nacht', '#2E3340'], senf: ['Senf', '#C99B2F'], beere: ['Beere', '#8E3D52'],
  fels: ['Fels', '#7D7972'], creme: ['Creme', '#E2D9C6'], petrol: ['Petrol', '#2F6668'], rot: ['Signalrot', '#C4412F'], weiss: ['Schnee', '#E6E6E3'],
};
const STORES = [
  {id: 'INN', name: 'Innsbruck', addr: 'Maria-Theresien-Str. 18', f: 1},
  {id: 'SBG', name: 'Salzburg', addr: 'Getreidegasse 31', f: 1.21},
  {id: 'KIT', name: 'Kitzbühel', addr: 'Vorderstadt 9', f: .86},
  {id: 'KUF', name: 'Kufstein', addr: 'Unterer Stadtplatz 4', f: .54},
  {id: 'BRE', name: 'Bregenz', addr: 'Kaiserstraße 12', f: .5},
];
const STAFF = [
  {id: 'lm', name: 'Lena Moser', role: 'Verkauf', hue: 26, initials: 'LM'},
  {id: 'dh', name: 'David Huber', role: 'Filialleitung', hue: 205, initials: 'DH'},
  {id: 'ms', name: 'Miriam Steiner', role: 'Kasse', hue: 150, initials: 'MS'},
];
const CUSTOMERS = [
  {id: 'K-10234', name: 'Anna Gruber', tier: 'Gipfel-Club Gold', points: 2340, hue: 340, email: 'anna.gruber@example.at', last: '12.09. · Hochtor GTX', fields: {'Schuhgröße': '39', 'Skilänge': '164 cm', 'Interesse': 'Skitouren'}},
  {id: 'K-11002', name: 'Sophie Wieser', tier: 'Gipfel-Club Silber', points: 1420, hue: 280, email: 's.wieser@example.at', last: '28.09. · Merino 200', fields: {'Konfektion': 'S', 'Newsletter': 'ja'}},
  {id: 'K-10871', name: 'Markus Hofer', tier: 'Gipfel-Club', points: 860, hue: 205, email: 'm.hofer@example.at', last: '03.10. · Approach Low', fields: {'Schuhgröße': '44', 'Konfektion': 'L'}},
  {id: 'K-08820', name: 'Jonas Egger', tier: 'Verein · SV Inntal', points: 540, hue: 150, email: 'jonas.egger@example.at', last: '21.08. · Tour 88', club: {name: 'Vereinsrabatt SV Inntal', pct: 10}, fields: {'Verein': 'SV Inntal', 'Vereinsrabatt': '10 %'}},
  {id: 'K-09412', name: 'Thomas Pichler', tier: 'Gipfel-Club', points: 310, hue: 40, email: 't.pichler@example.at', last: '30.09. · Skihelm', fields: {'Kopfumfang': '58 cm'}},
  {id: 'K-11590', name: 'Elena Brandstätter', tier: 'Neukundin', points: 0, hue: 15, email: 'elena.b@example.at', last: '–', fields: {'Newsletter': 'nein'}},
];
const CATS = [
  {id: 'alle', name: 'Alle'}, {id: 'jacken', name: 'Jacken & Westen'}, {id: 'hosen', name: 'Hosen'}, {id: 'schuhe', name: 'Schuhe'},
  {id: 'ski', name: 'Ski & Touren'}, {id: 'shirts', name: 'Shirts & Layer'}, {id: 'rucksaecke', name: 'Rucksäcke'}, {id: 'acc', name: 'Accessoires'},
];
const SKI_PROMPTS = [
  {key: 'z', label: 'Z-Wert Bindung', type: 'number', req: true, ph: 'z. B. 6,5'},
  {key: 'sn', label: 'Seriennummer', type: 'text', req: false, ph: 'scannen oder eingeben'},
];
const RAW = [
  {id: 'A1001', name: 'Grat Hardshell Jacke', brand: 'Nordwand', cat: 'jacken', g: 'jacket', price: 449, colors: ['moos', 'schiefer', 'glut'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], tag: 'Neu', pop: 99, fields: {'Wassersäule': '28.000 mm', 'Gewicht': '420 g', 'Saison': 'HW 26'}},
  {id: 'A3001', name: 'Hochtor GTX Bergschuh', brand: 'Nordwand', cat: 'schuhe', g: 'boot', price: 279, colors: ['fels', 'glut'], sizes: ['39', '40', '41', '42', '43', '44', '45', '46'], pop: 96, fields: {'Membran': 'GTX', 'Sohle': 'Vibram', 'Kategorie': 'B'}},
  {id: 'A1002', name: 'Firnlicht Daunenjacke', brand: 'Firn', cat: 'jacken', g: 'puffer', price: 329, sale: 259, colors: ['beere', 'nacht', 'creme'], sizes: ['XS', 'S', 'M', 'L', 'XL'], pop: 94, fields: {'Füllung': '800 cuin · RDS', 'Gewicht': '510 g'}},
  {id: 'A7001', name: 'Merino Beanie', brand: 'Lodenwerk', cat: 'acc', g: 'beanie', price: 39.9, colors: ['glut', 'senf', 'moos', 'schiefer'], sizes: ['Einheitsgröße'], pop: 93, fields: {'Material': '100 % Merino'}},
  {id: 'A3002', name: 'Pace 3 Trailrunner', brand: 'Talwind', cat: 'schuhe', g: 'shoe', price: 159, colors: ['gletscher', 'glut', 'schiefer'], sizes: ['38', '39', '40', '41', '42', '43', '44', '45'], tag: 'Neu', pop: 91, fields: {'Sprengung': '6 mm', 'Gewicht': '290 g'}},
  {id: 'A5001', name: 'Tour 88 Ski', brand: 'Firn', cat: 'ski', g: 'ski', price: 649, colors: ['glut'], sizes: ['164', '171', '178', '185'], pop: 88, prompts: SKI_PROMPTS, fields: {'Taillierung': '128-88-112', 'Radius': '18 m'}},
  {id: 'A6001', name: 'Merino Langarmshirt 200', brand: 'Lodenwerk', cat: 'shirts', g: 'shirt', price: 89.9, colors: ['creme', 'schiefer', 'beere'], sizes: ['S', 'M', 'L', 'XL'], pop: 87, fields: {'Material': 'Merino 200 g/m²'}},
  {id: 'A2001', name: 'Seilschaft Tourenhose', brand: 'Seilschaft', cat: 'hosen', g: 'pants', price: 169, colors: ['fels', 'nacht'], sizes: ['46', '48', '50', '52', '54'], pop: 85, fields: {'Material': 'Softshell, 4-Wege-Stretch'}},
  {id: 'A5002', name: 'Aero MIPS Skihelm', brand: 'Kammlinie', cat: 'ski', g: 'helmet', price: 179, colors: ['weiss', 'nacht', 'gletscher'], sizes: ['S', 'M', 'L'], pop: 84, fields: {'Norm': 'EN 1077', 'Gewicht': '450 g'}},
  {id: 'A1003', name: 'Talwind Softshell', brand: 'Talwind', cat: 'jacken', g: 'jacket', price: 189, colors: ['schiefer', 'petrol'], sizes: ['S', 'M', 'L', 'XL'], pop: 82, fields: {'Winddicht': 'ja'}},
  {id: 'A4001', name: 'Gipfel 32 Tourenrucksack', brand: 'Kammlinie', cat: 'rucksaecke', g: 'backpack', price: 159, colors: ['glut', 'schiefer'], sizes: ['Einheitsgröße'], pop: 80, fields: {'Volumen': '32 l', 'Gewicht': '1.050 g'}},
  {id: 'A7002', name: 'Grip Pro Handschuh', brand: 'Nordwand', cat: 'acc', g: 'glove', price: 69, colors: ['nacht', 'glut'], sizes: ['S', 'M', 'L', 'XL'], pop: 78, fields: {'Isolation': 'Primaloft'}},
  {id: 'A1004', name: 'Kamm Primaloft Weste', brand: 'Kammlinie', cat: 'jacken', g: 'vest', price: 149, colors: ['senf', 'fels', 'nacht'], sizes: ['S', 'M', 'L', 'XL'], pop: 76, fields: {'Isolation': 'Primaloft Gold'}},
  {id: 'A6002', name: 'Polar Fleece Midlayer', brand: 'Talwind', cat: 'shirts', g: 'fleece', price: 99, colors: ['senf', 'moos'], sizes: ['S', 'M', 'L', 'XL'], pop: 74, fields: {'Material': 'Recycling-Fleece'}},
  {id: 'A2003', name: 'Firn Skihose Pro', brand: 'Firn', cat: 'hosen', g: 'pants', price: 279, sale: 223, colors: ['nacht', 'rot'], sizes: ['S', 'M', 'L', 'XL'], pop: 72, fields: {'Wassersäule': '20.000 mm'}},
  {id: 'A5003', name: 'Horizon Skibrille', brand: 'Firn', cat: 'ski', g: 'goggles', price: 129, colors: ['nacht', 'weiss'], sizes: ['Einheitsgröße'], pop: 70, fields: {'Scheibe': 'photochrom S1–S3'}},
  {id: 'A3003', name: 'Steig Approach Low', brand: 'Seilschaft', cat: 'schuhe', g: 'shoe', price: 139, colors: ['sand', 'moos'], sizes: ['40', '41', '42', '43', '44', '45'], pop: 68, fields: {'Sohle': 'Climbing Zone'}},
  {id: 'A1005', name: 'Alpenrose Steppjacke', brand: 'Lodenwerk', cat: 'jacken', g: 'puffer', price: 229, colors: ['creme', 'moos'], sizes: ['34', '36', '38', '40', '42'], pop: 66, fields: {'Schnitt': 'Damen, tailliert'}},
  {id: 'A4002', name: 'Steig 22 Daypack', brand: 'Firn', cat: 'rucksaecke', g: 'backpack', price: 99, colors: ['petrol', 'senf'], sizes: ['Einheitsgröße'], pop: 64, fields: {'Volumen': '22 l'}},
  {id: 'A6003', name: 'Grat Funktionsshirt', brand: 'Nordwand', cat: 'shirts', g: 'shirt', price: 49.9, sale: 39.9, colors: ['gletscher', 'glut'], sizes: ['S', 'M', 'L', 'XL'], pop: 62, fields: {'Material': 'Polyester recycelt'}},
  {id: 'A2002', name: 'Loden Wanderhose', brand: 'Lodenwerk', cat: 'hosen', g: 'pants', price: 139, colors: ['moos', 'sand'], sizes: ['46', '48', '50', '52'], pop: 60, fields: {'Material': 'Schurwoll-Loden'}},
  {id: 'A7003', name: 'Merino Wandersocken', brand: 'Seilschaft', cat: 'acc', g: 'socks', price: 24.9, colors: ['fels', 'glut'], sizes: ['35–38', '39–42', '43–46'], pop: 58, fields: {'Polsterung': 'mittel'}},
  {id: 'A7004', name: 'Isolierflasche 0,75 l', brand: 'Kammlinie', cat: 'acc', g: 'bottle', price: 34.9, colors: ['petrol', 'glut', 'creme'], sizes: ['Einheitsgröße'], pop: 55, fields: {'Warmhaltend': '12 h'}},
];
const OTHER_STORES = STORES.slice(1);
function ean13(d12) { let s = 0; for (let i = 0; i < 12; i++) s += (+d12[i]) * (i % 2 ? 3 : 1); return d12 + ((10 - s % 10) % 10); }
const ART = RAW.map((a, ai) => {
  const r = rng(1000 + ai * 7);
  const variants = [];
  a.colors.forEach((c, ci) => a.sizes.forEach((s, si) => {
    let q = Math.floor(r() * 8);
    if (r() < .12) q = 0;
    if (Math.abs(si - (a.sizes.length - 1) / 2) < 1.1 && q < 2 && r() < .6) q += 3;
    if (a.sizes.length === 1) q += 4;
    variants.push({c, s, q, other: OTHER_STORES.map(() => r() < .22 ? 0 : 1 + Math.floor(r() * 6)), ean: ean13('9012' + pad(ai, 3) + pad(ci, 2) + pad(si, 3))});
  }));
  const catName = CATS.find(c => c.id === a.cat).name;
  return {...a, variants, hay: norm([a.name, a.brand, catName, a.id, ...a.colors.map(c => COLORS[c][0])].join(' '))};
});
const artById = id => ART.find(a => a.id === id);
const variant = (a, c, s) => a.variants.find(v => v.c === c && v.s === s) || a.variants[0];
// Bestand so setzen, dass Dashboard-Warnungen und Kasse übereinstimmen
[['A3001', 'fels', '42', 1], ['A3001', 'fels', '43', 2], ['A3001', 'fels', '44', 0], ['A1001', 'moos', 'M', 1], ['A3002', 'gletscher', '43', 1], ['A7001', 'glut', 'Einheitsgröße', 2], ['A5002', 'nacht', 'M', 1], ['A1001', 'moos', 'L', 4]]
  .forEach(([id, c, s, q]) => { const v = variant(artById(id), c, s); v.q = q; });
ART.forEach(a => { a.stock = a.variants.reduce((s, v) => s + v.q, 0); });
const SERVICES = [
  {id: 'S01', name: 'Tragetasche', price: .5, icon: 'bag'},
  {id: 'S02', name: 'Skiservice Basic', price: 29, icon: 'wrench'},
  {id: 'S03', name: 'Kantenschliff', price: 19, icon: 'snow'},
  {id: 'S04', name: 'Bindung einstellen', price: 15, icon: 'sliders'},
  {id: 'GS', name: 'Gutschein verkaufen', price: null, icon: 'gift'},
];

/* ════════════════════════════════════════════════════════════════════
   5 · SITZUNG
   ════════════════════════════════════════════════════════════════════ */
const S = {appVersion: '0.11.0', fullscreen: false, view: null, user: STAFF[0], store: 'INN', online: true, queue: 0, update: 'pending', backupH: 9, paletteOpen: false, locked: false, posSidebar: false, inspector: null};
const storeObj = () => STORES.find(s => s.id === S.store) || {id: 'ALL', name: 'Alle Filialen', addr: '5 Standorte'};

/* ════════════════════════════════════════════════════════════════════
   6 · EBENEN, POPOVER, TOASTS, SEGMENTE
   ════════════════════════════════════════════════════════════════════ */
const layers = [];
function openLayer(inner, {cls = '', onClose, closeOnScrim = true, focus, esc: escClose = true} = {}) {
  closePopover();
  const el = document.createElement('div');
  el.className = 'layer ' + cls;
  el.innerHTML = inner;
  document.body.appendChild(el);
  const entry = {el, onClose, prevFocus: document.activeElement, escClose};
  layers.push(entry);
  document.body.classList.add('has-layer');
  el.addEventListener('mousedown', e => { if (closeOnScrim && e.target === el) closeLayer(el); });
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeLayer(el); });
  requestAnimationFrame(() => {
    const f = (focus && $(focus, el)) || $('input:not([type=hidden]),button:not([data-close]),[tabindex="0"]', el);
    f && f.focus({preventScroll: true});
  });
  return el;
}
function closeLayer(el) {
  const i = layers.findIndex(l => l.el === el); if (i < 0) return;
  const [entry] = layers.splice(i, 1);
  if (!layers.length) document.body.classList.remove('has-layer');
  el.classList.add('closing');
  setTimeout(() => el.remove(), 190);
  entry.onClose && entry.onClose();
  if (entry.prevFocus && document.contains(entry.prevFocus)) entry.prevFocus.focus({preventScroll: true});
}
const topLayer = () => layers[layers.length - 1];
function trapFocus(e) {
  const t = topLayer(); if (!t) return;
  const f = $$('button:not(:disabled),input:not(:disabled),[tabindex="0"]', t.el).filter(x => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  else if (!t.el.contains(document.activeElement)) { first.focus(); e.preventDefault(); }
}

let pop = null;
function openPopover(anchor, html, {align = 'right', width} = {}) {
  const same = pop && pop.anchor === anchor; closePopover(); if (same) return null;
  const el = document.createElement('div');
  el.className = 'popover'; el.innerHTML = html; if (width) el.style.width = width + 'px';
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let left = align === 'right' ? r.right - w : r.left;
  left = clamp(left, 8, innerWidth - w - 8);
  let top = r.bottom + 8; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8);
  if (align === 'side') { left = r.right + 10; top = clamp(r.bottom - h, 8, innerHeight - h - 8); el.style.transformOrigin = 'bottom left'; }
  el.style.left = left + 'px'; el.style.top = top + 'px';
  pop = {el, anchor};
  setTimeout(() => document.addEventListener('mousedown', popOutside), 0);
  return el;
}
function popOutside(e) { if (pop && !pop.el.contains(e.target) && !pop.anchor.contains(e.target)) closePopover(); }
function closePopover() {
  if (!pop) return; const el = pop.el; pop = null;
  el.classList.add('closing'); setTimeout(() => el.remove(), 130);
  document.removeEventListener('mousedown', popOutside);
}

function toast(t1, {t2 = '', type = '', icon, action, dur = 3800} = {}) {
  const wrap = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="ti">${ic(icon || (type === 'pos' ? 'check' : type === 'warn' ? 'alert' : 'info'), 'i-sm')}</span><div style="min-width:0"><div class="t1"></div>${t2 ? '<div class="t2"></div>' : ''}</div>${action ? `<button class="btn btn-secondary btn-sm ta"></button>` : ''}<span class="tp" style="animation-duration:${dur}ms"></span>`;
  $('.t1', el).textContent = t1; if (t2) $('.t2', el).textContent = t2;
  wrap.appendChild(el);
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  let tm = setTimeout(kill, dur);
  if (action) { const b = $('.ta', el); b.textContent = action.label; b.onclick = () => { clearTimeout(tm); action.run(); kill(); }; }
  el.addEventListener('mouseenter', () => clearTimeout(tm));
  el.addEventListener('mouseleave', () => { tm = setTimeout(kill, 1600); });
  const all = $$('.toast', wrap); if (all.length > 4) all[0].remove();
}

function initSeg(seg, onChange) {
  if (!seg) return;
  if (!$('.seg-thumb', seg)) seg.insertAdjacentHTML('afterbegin', '<span class="seg-thumb"></span>');
  const thumb = $('.seg-thumb', seg);
  const place = (anim = true) => {
    const b = $('button[aria-pressed="true"]', seg);
    if (!b || !b.offsetWidth) { thumb.style.width = '0'; return; }
    if (!anim) thumb.style.transition = 'none';
    thumb.style.width = b.offsetWidth + 'px'; thumb.style.transform = `translateX(${b.offsetLeft}px)`;
    if (!anim) { void thumb.offsetWidth; thumb.style.transition = ''; }
  };
  seg._place = place;
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !seg.contains(b) || b.getAttribute('aria-pressed') === 'true') return;
    $$('button', seg).forEach(x => x.setAttribute('aria-pressed', x === b));
    place(); onChange && onChange(b);
  });
  place(false); requestAnimationFrame(() => place(false));
}

/* ════════════════════════════════════════════════════════════════════
   7 · SHELL — Navigation, Router, Kopf- und Statusleiste
   ════════════════════════════════════════════════════════════════════ */
const NAV = [
  {g: 'Verkauf'},
  {id: 'dashboard', label: 'Dashboard', icon: 'dashboard'},
  {id: 'kasse', label: 'Kasse', icon: 'register', cart: true},
  {id: 'belege', label: 'Belege', icon: 'receipt'},
  {id: 'kassenbuch', label: 'Kassenbuch & Abschluss', icon: 'cash'},
  {g: 'Sortiment'},
  {id: 'artikel', label: 'Artikel', icon: 'tag'},
  {id: 'bestand', label: 'Bestand', icon: 'boxes'},
  {id: 'inventur', label: 'Inventur', icon: 'layers'},
  {id: 'aktionen', label: 'Preisaktionen', icon: 'percent'},
  {id: 'etiketten', label: 'Etiketten', icon: 'barcode'},
  {g: 'Einkauf'},
  {id: 'einkauf', label: 'Bestellungen', icon: 'truck'},
  {id: 'wareneingang', label: 'Wareneingang', icon: 'download'},
  {id: 'lieferanten', label: 'Lieferanten', icon: 'building'},
  {g: 'Kunden'},
  {id: 'kunden', label: 'Kunden', icon: 'users'},
  {id: 'gutscheine', label: 'Gutscheine', icon: 'gift'},
  {g: 'Auswertung'},
  {id: 'berichte', label: 'Berichte', icon: 'chart'},
  {id: 'buchhaltung', label: 'Buchhaltung', icon: 'receipt'},
  {id: 'ki', label: 'KI-Analyse', icon: 'sparkle'},
  {g: 'System'},
  {id: 'anpassen', label: 'Anpassen', icon: 'puzzle'},
  {id: 'benutzer', label: 'Benutzer & Rechte', icon: 'shield'},
  {id: 'datensicherung', label: 'Datensicherung', icon: 'database'},
  {id: 'protokoll', label: 'Protokoll', icon: 'history'},
  {id: 'einstellungen', label: 'Einstellungen', icon: 'sliders'},
  {id: 'hilfe', label: 'Hilfe & Info', icon: 'info'},
];
const TITLES = {dashboard: 'Dashboard', kasse: 'Kasse', artikel: 'Artikel', bestand: 'Bestand', inventur: 'Inventur', aktionen: 'Preisaktionen', einkauf: 'Bestellungen', kunden: 'Kunden', berichte: 'Berichte', anpassen: 'Anpassen', erweiterungen: 'Erweiterungen', designsystem: 'Designsystem', einstellungen: 'Einstellungen'};
const PH_VIEWS = ['erweiterungen'];
/** Seiten-Register: Module melden eigene Ansichten an (Titel, Untertitel, Darstellung). */
const PAGES = {};
function registerPage(id, def) {
  PAGES[id] = def; TITLES[id] = def.title;
  if (!document.getElementById('view-' + id)) document.getElementById('views')?.insertAdjacentHTML('beforeend', `<section class="view" id="view-${id}" aria-label="${def.title}"></section>`);
}
const navClosed = new Set(persist.get('navClosed', []));
const navGroupOf = id => { let g = null; for (const n of NAV) { if (n.g) g = n.g; else if (n.id === id) return g; } return null; };

function renderNav() {
  let html = '', open = false;
  NAV.forEach(n => {
    if (n.g) {
      if (open) html += '</div>';
      html += `<div class="nav-sec" data-sec="${esc(n.g)}" ${navClosed.has(n.g) ? 'data-closed' : ''}><button class="nav-group" data-grp="${esc(n.g)}" aria-expanded="${!navClosed.has(n.g)}">${esc(n.g)}${ic('chevron-down', 'i-xs chev')}</button>`;
      open = true; return;
    }
    html += `<button class="nav-item" data-view="${n.id}" data-tip="${esc(n.label)}" data-tip-pos="right">${ic(n.icon)}<span class="nav-label fade-label">${esc(n.label)}</span>${n.cart ? '<span class="nav-badge accent" id="navCart" hidden></span>' : ''}${n.count ? `<span class="nav-badge">${n.count}</span>` : ''}<span class="nav-badge" data-nb="${n.id}" hidden></span></button>`;
  });
  if (open) html += '</div>';
  $('#nav').innerHTML = html;
}
/** Zähler an Menüpunkten (z. B. offene Bestellungen) */
function navBadge(id, n) { const b = $(`[data-nb="${id}"]`); if (!b) return; b.hidden = !n; b.textContent = n > 99 ? '99+' : n; }
function renderMe() {
  $('#meBtn').innerHTML = `<span class="avatar" style="--h:${S.user.hue}">${S.user.initials}</span><span class="meta fade-label" style="min-width:0"><span class="t1" style="display:block">${esc(S.user.name)}</span><span class="t2" style="display:block">${esc(S.user.role)} · Kasse 1</span></span>`;
}
function renderStore() {
  const s = storeObj();
  $('#storeName').textContent = s.name; $('#storeAddr').textContent = s.addr;
}
function applySidebar() {
  const collapsed = S.view === 'kasse' ? !S.posSidebar : prefs.sidebar;
  $('#app').classList.toggle('sb-collapsed', collapsed);
}
function toggleSidebar() {
  if (matchMedia('(max-width: 900px)').matches) { $('#app').classList.toggle('sb-open'); return; }
  if (S.view === 'kasse') S.posSidebar = !S.posSidebar; else { prefs.sidebar = !prefs.sidebar; persist.set('prefs', prefs); }
  applySidebar();
}

function go(view) {
  if (!TITLES[view]) view = 'dashboard';
  if (S.view === view) return;
  if (S.view === 'dashboard' && Dash.editing) setEditing(false, true);
  S.view = view;
  closePopover();
  $$('.view').forEach(v => v.classList.remove('active'));
  if (view === 'dashboard') renderDashboard();
  else if (view === 'kasse') renderPOS();
  else if (view === 'designsystem') renderDesign();
  else if (view === 'einstellungen') renderSettings();
  else if (view === 'artikel') renderArtikel();
  else if (view === 'bestand') renderBestand();
  else if (view === 'kunden') renderKunden();
  else if (view === 'einkauf') renderEinkauf();
  else if (view === 'inventur') renderInventur();
  else if (view === 'aktionen') renderAktionen();
  else if (view === 'berichte') renderBerichte();
  else if (view === 'anpassen') renderAnpassen();
  else if (PAGES[view]) PAGES[view].render();
  else if (view.startsWith('obj-')) renderObj(view.slice(4));
  else renderPlaceholder(view);
  const vEl = PH_VIEWS.includes(view) ? $('#view-ph') : view.startsWith('obj-') ? $('#view-obj') : $('#view-' + view); void vEl.offsetWidth; vEl.classList.add('active');
  $$('.nav-item').forEach(n => n.dataset.view === view ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current'));
  renderTopbar(); applySidebar();
  document.body.classList.forEach(c => c.startsWith('at-') && document.body.classList.remove(c)); document.body.classList.add('at-' + view);
  $('#app').classList.remove('sb-open');
  if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
  if (view === 'kasse') setTimeout(() => { const s = $('#posSearch'); s && !layers.length && s.focus({preventScroll: true}); }, 80);
}

function renderTopbar() {
  const L = $('#tbLeft');
  if (S.view === 'kasse') {
    L.innerHTML = `<div class="tb-title"><h1>${esc(CFG['kasse.name'])}</h1><span class="tb-sub">${esc(CFG['kasse.id'])} · Bon ${belegNo()} · ${esc(S.user.name)}</span></div><div class="parked" id="parked"></div>`;
    renderParked();
  } else {
    const sub = {dashboard: `Filiale ${storeObj().name}`, designsystem: 'Tokens · Komponenten · Muster', einstellungen: DESKTOP ? 'Lokale Datenbank' : 'Vorschau', artikel: `${ART.length} Artikel · ${DESKTOP ? 'Datenbank' : 'Vorschau, nicht gespeichert'}`, bestand: `${num(ART.reduce((s, a) => s + a.stock, 0))} Stück · ${DESKTOP ? 'Datenbank' : 'Vorschau'}`, kunden: `${num(CUSTOMERS.length)} Kund:innen · ${DESKTOP ? 'Datenbank' : 'Vorschau'}`, einkauf: 'Bestellungen & Wareneingang', berichte: 'Auswertungen & Abschlüsse', inventur: 'Zählen & Differenzen buchen', aktionen: 'Zeitlich begrenzte Nachlässe', anpassen: 'Felder · Objekte · Regeln · Webhooks · API'}[S.view] || (S.view.startsWith('obj-') ? 'Eigenes Objekt' : 'In Vorbereitung');
    const grp = navGroupOf(S.view), sub2 = PAGES[S.view]?.sub ? PAGES[S.view].sub() : sub;
    L.innerHTML = `<div class="tb-title">${grp ? `<span class="tb-sub" style="font-size:13px">${esc(grp)}</span><span class="tb-sub" style="opacity:.5">/</span>` : ''}<h1>${esc(TITLES[S.view])}</h1><span class="tb-sub">${esc(sub2)}</span></div>`;
  }
}

function renderStatus() {
  const off = !S.online;
  $('#statusbar').innerHTML = `
    ${DESKTOP ? `${(() => { const v = typeof vbStatus === 'function' ? vbStatus() : null; return v ? `<button class="sbi ${v.ok ? 'ok' : 'off'}" id="sbVerbund" data-tip="${esc(v.tip)}"><span class="dot ${v.ok ? 'live' : ''}"></span>${esc(v.text)}</button>` : '<span class="sbi ok"><span class="dot live"></span>Einzelplatz · lokale Datenbank</span>'; })()}
    <span class="sb-sep"></span>
    <span class="sbi hide-sm ${S.rksv?.active ? '' : 'off'}">${ic('shield')}${S.rksv?.active ? `RKSV-Testmodus · ${esc(S.rksv.kassen_id)}` : 'RKSV nicht in Betrieb'}</span>` : `<button class="sbi ${off ? 'off' : 'ok'}" id="sbConn" data-tip="${off ? 'Klicken: Verbindung wiederherstellen' : 'Klicken: Offline-Modus simulieren'}"><span class="dot ${off ? '' : 'live'}"></span>${off ? 'Server nicht erreichbar · lokaler Betrieb' : 'KONTOR-SRV01 · lokal · 4 ms'}</button>
    <span class="sb-sep"></span>
    <span class="sbi ${S.queue ? 'accent' : ''}">${ic('sync')}${S.queue ? `${S.queue} Beleg${S.queue > 1 ? 'e' : ''} in Warteschlange` : 'Synchron'}</span>
    <span class="sbi hide-sm">${ic('shield')}RKSV · Signatureinheit aktiv</span>`}
    <button class="sbi hide-sm ${S.backupH === Infinity || S.backupH >= 48 ? 'off' : ''}" id="sbBackup" data-tip="${DESKTOP ? 'Klicken: Datensicherung öffnen' : 'Backup-Werkzeuge'}">${ic('database')}${backupLabel()}${DESKTOP ? '' : ' · NAS-01'}</button>
    <button class="sbi ${!DESKTOP || UPD.state === 'available' ? 'accent' : ''} hide-sm" id="sbUpdate">${ic('download')}${esc(updLabel())}</button>
    <span class="sb-spacer"></span>
    <button class="sbi" id="sbHooks" data-tip="Ereignis-Inspektor · Hooks & Webhooks" data-tip-pos="up-left">${ic('braces')}Ereignisse <b class="num" id="sbHookCount" style="font-weight:600;color:var(--text-2)">${Hooks.count}</b></button>
    ${DESKTOP ? '' : `<span class="sbi hide-md">${ic('sparkle')}KI lokal · bereit</span>`}
    <span class="sbi hide-md">${DESKTOP ? `Desktop-App v${S.appVersion}` : 'Vorschau im Browser'}</span>
    <span class="sbi num" id="sbClock">${clock()}</span>`;
}

/* ════════════════════════════════════════════════════════════════════
   8 · BEFEHLSPALETTE (⌘K)
   Befehle sind Daten – Erweiterungen registrieren eigene Einträge.
   ════════════════════════════════════════════════════════════════════ */
function cmdList() {
  const c = (group, label, icon, run, x = {}) => ({group, label, icon, run, ...x});
  const dark = resolvedTheme() === 'dark';
  return [
    c('Navigation', 'Dashboard', 'dashboard', () => go('dashboard'), {keys: ['G', 'D']}),
    c('Navigation', 'Kasse', 'register', () => go('kasse'), {keys: ['G', 'K']}),
    c('Navigation', 'Artikel', 'tag', () => go('artikel'), {keys: ['G', 'A']}),
    c('Navigation', 'Bestand', 'boxes', () => go('bestand'), {keys: ['G', 'B']}),
    c('Navigation', 'Kunden', 'users', () => go('kunden')),
    c('Navigation', 'Berichte', 'chart', () => go('berichte')),
    c('Navigation', 'Anpassen', 'puzzle', () => go('anpassen'), {kw: 'felder objekte regeln skripte webhooks api plugins erweiterungen'}),
    ...(typeof CF !== 'undefined' ? CF.ents.map(e => c('Eigene Objekte', e.plural, e.icon || 'layers', () => go('obj-' + e.id), {kw: e.name})) : []),
    c('Navigation', 'Designsystem', 'palette', () => go('designsystem'), {keys: ['G', 'S'], kw: 'tokens komponenten'}),
    c('Navigation', 'Einstellungen', 'sliders', () => go('einstellungen')),
    c('Kasse', 'Neuer Verkauf', 'plus', () => { go('kasse'); newSale(); }),
    c('Kasse', 'Belege anzeigen', 'receipt', () => openReceipts(), {kw: 'bon beleg journal kopie'}),
    c('Kasse', 'Kassenbuch (Einlage/Entnahme)', 'cash', openCashBook, {kw: 'einlage entnahme wechselgeld bank'}),
    c('Kasse', 'X-Bericht (Zwischenstand)', 'receipt', xReport, {kw: 'bericht tag'}),
    c('Kasse', 'Tagesabschluss (Z-Bericht)', 'lock', openClosing, {kw: 'kassensturz abschluss z bericht'}),
    c('Einkauf', 'Neue Bestellung', 'truck', () => { go('einkauf'); setTimeout(() => openPO(null), 120); }, {kw: 'bestellen lieferant'}),
    c('Sortiment', 'Inventur', 'layers', () => go('inventur'), {kw: 'zählen inventur bestand'}),
    c('Sortiment', 'Preisaktion anlegen', 'percent', () => { go('aktionen'); setTimeout(() => openPromo(null), 120); }, {kw: 'sale rabatt aktion'}),
    c('Einkauf', 'Bestellvorschlag', 'truck', () => { EK.tab = 'vorschlag'; go('einkauf'); }, {kw: 'nachbestellen mindestbestand'}),
    c('Navigation', 'Berichte & Abschlüsse', 'chart', () => go('berichte'), {kw: 'umsatz auswertung csv excel'}),
    c('System', 'Benutzer wechseln', 'user', lock, {kw: 'abmelden anmelden pin'}),
    c('Kasse', 'Retoure / Umtausch', 'undo', () => { go('kasse'); setTimeout(openReturnStart, 80); }, {kw: 'rückgabe storno erstattung umtausch'}),
    c('Kunden', 'Neuer Kunde', 'user-plus', () => { go('kunden'); setTimeout(() => openCustomerEditor(null, {onSaved: c => openCustomerDetail(c)}), 80); }, {kw: 'kundin anlegen kundenkarte'}),
    c('Sortiment', 'Neuer Artikel', 'tag', () => { go('artikel'); setTimeout(() => openEditor(null), 80); }, {kw: 'anlegen artikel'}),
    c('Sortiment', 'Bestand buchen', 'boxes', () => go('bestand'), {kw: 'wareneingang inventur'}),
    c('Kasse', 'Bezahlen', 'card', () => { go('kasse'); openPayment(); }, {keys: ['F9'], hint: () => POS.cart.length ? eur(totals().total) : 'Warenkorb leer'}),
    c('Kasse', 'Kunde zuordnen', 'user-plus', () => { go('kasse'); openCustomers(); }, {keys: ['F3']}),
    c('Kasse', 'Rabatt gewähren', 'percent', () => { go('kasse'); openDiscount(); }, {keys: ['F4']}),
    c('Kasse', 'Bon parken', 'pause', () => { go('kasse'); park(); }, {keys: ['F8']}),
    c('Kasse', 'Gutschein verkaufen', 'gift', () => { go('kasse'); openVoucherSale(); }),
    c('Kasse', 'Scanner simulieren', 'barcode', () => { go('kasse'); setTimeout(simulateScan, 120); }, {kw: 'ean barcode'}),
    c('Kasse', 'Kasse sperren', 'lock', lock, {keys: ['F10'], kw: 'pin abmelden'}),
    c('Kasse', S.online ? 'Offline-Modus simulieren' : 'Verbindung wiederherstellen', S.online ? 'wifi-off' : 'wifi', () => setOnline(!S.online), {kw: 'netzwerk offline online'}),
    c('Kasse', 'Kassenablauf bearbeiten', 'flow', openFlow, {kw: 'workflow prozess schnellwahl'}),
    c('Dashboard', 'Dashboard anpassen', 'layout', () => { go('dashboard'); setEditing(true); }, {kw: 'widgets layout'}),
    c('Dashboard', 'Widget hinzufügen …', 'plus', () => { go('dashboard'); setEditing(true); openLibrary(); }),
    c('Dashboard', 'Layout als JSON exportieren', 'code', () => { go('dashboard'); openExport(); }),
    c('Darstellung', dark ? 'Heller Modus' : 'Dunkler Modus', dark ? 'sun' : 'moon', toggleTheme, {kw: 'theme light dark'}),
    ...Object.entries(ACCENTS).map(([k, a]) => c('Darstellung', `Akzentfarbe: ${a.name}`, 'palette', () => setAccent(k), {kw: 'farbe'})),
    ...[['compact', 'Kompakt'], ['comfort', 'Komfort'], ['touch', 'Touch']].map(([k, l]) => c('Darstellung', `Dichte: ${l}`, 'sliders', () => { prefs.density = k; applyPrefs(); toast(`Dichte: ${l}`, {icon: 'sliders'}); })),
    c('System', DESKTOP ? 'Nach Updates suchen' : 'Update 1.8.0 prüfen & freigeben', 'download', openUpdate, {kw: 'version changelog beta stable'}),
    c('System', 'Backup jetzt erstellen', 'database', backupNow, {kw: 'sicherung'}),
    c('System', 'Ereignis-Inspektor (Hooks & Webhooks)', 'braces', toggleInspector, {kw: 'events entwickler'}),
    c('System', 'RKSV: DEP-Export erstellen', 'shield', depExport, {kw: 'finanz prüfung datenerfassungsprotokoll'}),
    ...(DESKTOP ? [c('System', S.fullscreen ? 'Vollbild beenden' : 'Vollbild / Kassen-Kiosk', 'layout', toggleFullscreen, {keys: ['F11'], kw: 'kiosk vollbild'})] : []),
    c('Hilfe', 'Tastenkürzel anzeigen', 'keyboard', openShortcuts, {keys: ['?']}),
  ];
}
function hl(label, q) {
  const toks = norm(q.replace(/^\?/, '')).split(/\s+/).filter(Boolean); if (!toks.length) return esc(label);
  const nl = norm(label); const marks = new Array(label.length).fill(false);
  toks.forEach(t => { const i = nl.indexOf(t); if (i >= 0) for (let j = i; j < i + t.length && j < label.length; j++) marks[j] = true; });
  let out = '', open = false;
  for (let i = 0; i < label.length; i++) {
    if (marks[i] && !open) { out += '<mark>'; open = true; }
    if (!marks[i] && open) { out += '</mark>'; open = false; }
    out += esc(label[i]);
  }
  return out + (open ? '</mark>' : '');
}
function openPalette(prefill = '') {
  if (S.paletteOpen) return;
  S.paletteOpen = true;
  const el = openLayer(`<div class="palette" role="dialog" aria-modal="true" aria-label="Befehlspalette">
    <div class="pal-in">${ic('search')}<input id="palIn" placeholder="Suchen, springen oder Befehl eingeben …" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palList"><span class="kbd">Esc</span></div>
    <div class="pal-list" id="palList" role="listbox"></div>
    <div class="pal-foot"><span><span class="kbd">↑</span><span class="kbd">↓</span> wählen</span><span><span class="kbd">↵</span> ausführen</span><span class="r">${ic('sparkle', 'i-xs')} „?“ vorne fragt die lokale KI</span></div>
  </div>`, {cls: 'top', focus: '#palIn', onClose: () => { S.paletteOpen = false; }});
  const input = $('#palIn', el), listEl = $('#palList', el);
  let items = [], sel = 0;
  const build = () => {
    const q = input.value.trim(); const ask = q.replace(/^\?\s*/, ''); const nq = norm(ask);
    const res = [];
    if (q.startsWith('?') && ask) res.push({group: 'KI · lokal', label: `Fragen: „${ask}“`, icon: 'sparkle', ai: true, run: () => askAI(ask)});
    const cmds = cmdList();
    if (!nq) res.push(...cmds);
    else {
      const toks = nq.split(/\s+/);
      cmds.map(cmd => {
        const hay = norm(`${cmd.label} ${cmd.kw || ''} ${cmd.group}`);
        if (!toks.every(t => hay.includes(t))) return null;
        const L = norm(cmd.label); return {...cmd, sc: L.startsWith(toks[0]) ? 3 : L.includes(' ' + toks[0]) ? 2 : 1};
      }).filter(Boolean).sort((a, b) => b.sc - a.sc).forEach(x => res.push(x));
      ART.filter(a => toks.every(t => a.hay.includes(t)) || a.variants.some(v => v.ean.startsWith(nq))).slice(0, 5)
        .forEach(a => res.push({group: 'Artikel', label: a.name, sub: `${a.brand} · ${eur(a.sale || a.price)}`, art: a, hint: 'zur Kasse', run: () => { go('kasse'); setTimeout(() => openArticle(a), 80); }}));
      CUSTOMERS.filter(c => toks.every(t => norm(`${c.name} ${c.id} ${c.email}`).includes(t))).slice(0, 3)
        .forEach(c => res.push({group: 'Kunden', label: c.name, sub: `${c.tier} · ${num(c.points)} Punkte`, cust: c, hint: 'Kundenkarte', run: () => { go('kunden'); setTimeout(() => openCustomerDetail(c), 80); }}));
      if (!q.startsWith('?')) res.push({group: 'KI · lokal', label: `Fragen: „${ask}“`, icon: 'sparkle', ai: true, run: () => askAI(ask)});
    }
    items = res; sel = 0; render();
  };
  const render = () => {
    let html = '', g = null;
    items.forEach((it, i) => {
      if (it.group !== g) { g = it.group; html += `<div class="pal-g">${esc(g)}</div>`; }
      const lead = it.art ? `<span class="thumb" style="--c:${COLORS[it.art.colors[0]][1]}">${glyph(it.art.g, COLORS[it.art.colors[0]][1])}</span>`
        : it.cust ? `<span class="avatar" style="--h:${it.cust.hue};width:26px;height:26px;font-size:10px">${initials(it.cust.name)}</span>` : ic(it.icon);
      const keys = it.keys ? `<span class="kbds">${it.keys.map(k => `<span class="kbd">${k}</span>`).join('')}</span>` : '';
      const h2 = typeof it.hint === 'function' ? it.hint() : it.hint;
      html += `<button class="pal-i ${it.ai ? 'ai' : ''}" role="option" data-i="${i}" aria-selected="${i === sel}">${lead}<span class="lbl">${hl(it.label, input.value)}${it.sub ? ` <span class="muted">· ${esc(it.sub)}</span>` : ''}</span><span class="hint">${h2 ? esc(h2) : ''}${keys}</span></button>`;
    });
    listEl.innerHTML = html || '<div class="empty"><p>Keine Treffer</p></div>';
    const cur = $('[aria-selected="true"]', listEl); cur && cur.scrollIntoView({block: 'nearest'});
  };
  const run = i => { const it = items[i]; if (!it) return; closeLayer(el); setTimeout(() => it.run(), 60); };
  input.addEventListener('input', build);
  input.addEventListener('keydown', e => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { sel = (sel + 1) % items.length; render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = (sel - 1 + items.length) % items.length; render(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  });
  listEl.addEventListener('mousemove', e => {
    const b = e.target.closest('.pal-i'); if (!b || +b.dataset.i === sel) return;
    sel = +b.dataset.i; $$('.pal-i', listEl).forEach(x => x.setAttribute('aria-selected', +x.dataset.i === sel));
  });
  listEl.addEventListener('click', e => { const b = e.target.closest('.pal-i'); if (b) run(+b.dataset.i); });
  input.value = prefill; build();
}
