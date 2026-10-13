/* ═════════════════════════════════════════════════════════════════
   1a · ZIEHEN UND ABLEGEN (Drag & Drop)
   Eine gemeinsame Funktion für alle Listen und Tabellen: Zeilen zwischen „Zugeordnet“ und „Nicht zugeordnet“ ziehen,
   Reihenfolgen per Ziehen ändern, Spalten anordnen oder gruppieren, Bilder und Farben sortieren.
   Läuft über Zeigerereignisse (Maus, Stift, Finger) und ist dadurch in der Desktop-App und im Browser gleich – ohne die
   eingebaute HTML5-Funktion der Web-Ansicht, die unter Windows von der Fensterverwaltung abgefangen werden kann.

   Aufbau
     • Zone  – Bereich, in dem gezogen und auf den abgelegt wird:   dndZone(element, 'kennung', {…})
     • Item  – ziehbares Element in einer Zone:                    data-dnd-item  data-dnd-id="…"   (dndAttr(id))
               Enthält das Item eine Anfasser-Fläche [data-dnd-handle] (dndGrip()), wird nur dort gegriffen.
   Zone-Optionen
     from     Kennungen anderer Zonen (Liste oder Funktion), aus denen hier abgelegt werden darf
     drop     (ids, vonZone, ins) – Items aus einer anderen Zone wurden abgelegt;  ins = {id, after} oder null
     reorder  (ids, ins)          – Items dieser Zone wurden umsortiert
     ordered  true = auch beim Ablegen von außen die Einfügestelle zeigen
     axis     'y' (Liste, Standard) oder 'x' (Kacheln, Spalten)
     hint     Text am Mauszeiger über dieser Zone („Zuordnen“)
     ids      (itemElement) → Ids, die mitgezogen werden (Standard: nur das Item)
     label    (ids, itemElement) → Text am Mauszeiger
     ghost    'clone' = das Element selbst folgt dem Zeiger (Kacheln, Chips)
     canDrag  (itemElement) → false = nicht ziehbar
     area     Element, das beim Darüberziehen hervorgehoben wird (Standard: die Zone)
   ═════════════════════════════════════════════════════════════════ */
const DND = {zones: new Map(), pre: null, drag: null};
const DND_SKIP = 'input,textarea,select,button,a[href],label.ea-sw,[contenteditable="true"],[data-dnd-no],.switch,[role="switch"]';

/** Zone anmelden (nach jedem Neuzeichnen der Seite erneut aufrufen – gleiche Kennung ersetzt die alte) */
function dndZone(el, id, def = {}) {
  if (!el) return null;
  el.dataset.dndZone = id; el.classList.add('dnd-zone');
  DND.zones.set(id, {...def, id, el});
  return el;
}
/** Attribute für ein ziehbares Element */
const dndAttr = id => `data-dnd-item data-dnd-id="${esc(String(id))}"`;
/** Anfasser (sechs Punkte) – nur hier greift das Ziehen */
const dndGrip = (title = 'Ziehen zum Verschieben') => `<span class="dnd-grip" data-dnd-handle title="${esc(title)}" aria-hidden="true">${ic('grip', 'i-sm')}</span>`;
/**
 * Liste `list` so umsortieren, dass die Einträge `ids` an der Einfügestelle `ins` ({id, after} | null = ans Ende) stehen.
 * Fehlen Einträge in der Liste (Ablegen von außen), werden sie mit `make(id)` neu erzeugt.
 */
function dndArrange(list, ids, ins, key = x => x, make = id => id) {
  const set = new Set(ids.map(String));
  const have = new Map(list.filter(x => set.has(String(key(x)))).map(x => [String(key(x)), x]));
  const rest = list.filter(x => !set.has(String(key(x))));
  const moved = ids.map(String).map(id => have.get(id) ?? make(id)).filter(x => x != null);
  let at = ins && ins.id != null ? rest.findIndex(x => String(key(x)) === String(ins.id)) : -1;
  if (at < 0) at = rest.length; else if (ins.after) at++;
  rest.splice(at, 0, ...moved);
  return rest;
}

const dndAccepts = (z, d) => d.z.id === z.id ? !!z.reorder : !!z.drop && (typeof z.from === 'function' ? !!z.from(d.z.id, d) : (z.from || []).includes(d.z.id));
const dndItems = z => $$('[data-dnd-item]', z.el).filter(it => it.closest('[data-dnd-zone]') === z.el && it.getClientRects().length);

/** Einfügestelle: das nächstgelegene Item und ob davor oder dahinter */
function dndIns(z, d) {
  if (!(z.reorder || z.ordered)) return null;
  const x = z.axis === 'x';
  let best = null, bd = Infinity;
  for (const it of dndItems(z)) {
    const r = it.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dist = x ? Math.hypot(d.x - cx, (d.y - cy) * 2) : Math.abs(d.y - cy);
    if (dist < bd) { bd = dist; best = {it, cx, cy}; }
  }
  if (!best) return null;
  const id = best.it.dataset.dndId;
  return {id, after: x ? d.x > best.cx : d.y > best.cy, el: best.it, self: d.z.id === z.id && d.ids.includes(id)};
}

function dndLabel(z, ids, item) {
  const t = z.label ? z.label(ids, item) : (item.dataset.dndLabel || item.textContent || '');
  return String(t).replace(/\s+/g, ' ').trim().slice(0, 48);
}

function dndStart(p, x, y) {
  clearTimeout(p.timer); DND.pre = null;
  const z = p.z, ids = (z.ids ? z.ids(p.item) : [p.item.dataset.dndId]).map(String).filter(Boolean);
  if (!ids.length) return;
  const g = document.createElement('div'); g.className = 'dnd-ghost';
  if (z.ghost === 'clone') {
    const c = p.item.cloneNode(true), r = p.item.getBoundingClientRect();
    c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id')); c.querySelectorAll('[data-dnd-item]').forEach(n => n.removeAttribute('data-dnd-item')); c.removeAttribute('data-dnd-item');
    c.style.cssText += `;width:${r.width}px;height:${r.height}px;margin:0;opacity:1`;
    // die Stilregeln hängen oft am übergeordneten Element (z. B. „.cpick button“) – dessen Klassen mitgeben
    const w = document.createElement('div'); w.className = p.item.parentElement?.className || ''; w.style.cssText = 'display:block;margin:0;padding:0;border:0;background:none;box-shadow:none;min-width:0';
    w.append(c); g.classList.add('clone'); g.append(w);
  } else g.innerHTML = `<span class="dnd-gl">${esc(dndLabel(z, ids, p.item))}</span>${ids.length > 1 ? `<b class="dnd-gn">${ids.length}</b>` : ''}<span class="dnd-gh"></span>`;
  document.body.append(g);
  const line = document.createElement('div'); line.className = 'dnd-line'; line.hidden = true; document.body.append(line);
  const d = DND.drag = {z, ids, item: p.item, ghost: g, line, x, y, pid: p.id, target: null, marks: [], raf: 0, off: z.ghost === 'clone' ? {x: x - p.item.getBoundingClientRect().left, y: y - p.item.getBoundingClientRect().top} : {x: -14, y: -12}};
  document.body.classList.add('dnd-on');
  try { document.documentElement.setPointerCapture(p.id); } catch { /* kein aktiver Zeiger (z. B. Test) */ }
  try { getSelection()?.removeAllRanges(); } catch { /* */ }
  const idset = new Set(ids);
  dndItems(z).forEach(it => { if (idset.has(it.dataset.dndId)) { it.classList.add('dnd-src'); d.marks.push(it); } });
  // alle Zonen, auf die abgelegt werden darf, zeigen sich dezent
  DND.zones.forEach(zz => { if (zz.id !== z.id && zz.el.isConnected && dndAccepts(zz, d)) (zz.area || zz.el).classList.add('dnd-can'); });
  window.addEventListener('click', dndSwallow, true);
  const tick = () => { if (DND.drag !== d) return; dndPlace(); d.raf = requestAnimationFrame(tick); };
  d.raf = requestAnimationFrame(tick);
  dndPlace();
}
const dndSwallow = e => { e.stopPropagation(); e.preventDefault(); };

/** Zeigerposition auswerten: Zielzone, Einfügestelle, Hervorhebung, Auto-Scrollen */
function dndPlace() {
  const d = DND.drag; if (!d) return;
  d.ghost.style.transform = `translate(${d.x + d.off.x}px,${d.y + d.off.y}px)`;
  const el = document.elementFromPoint(d.x, d.y);
  let target = null;
  for (let n = el?.closest?.('[data-dnd-zone]'); n; n = n.parentElement?.closest?.('[data-dnd-zone]')) {
    const z = DND.zones.get(n.dataset.dndZone);
    if (z && z.el === n && dndAccepts(z, d)) { target = {z, ins: dndIns(z, d)}; break; }
  }
  d.target = target;
  // Hervorhebung der Zone (beim Umsortieren in der eigenen Liste genügt die Einfügelinie)
  const same = !!target && target.z.id === d.z.id, hl = target && !same ? (target.z.area || target.z.el) : null;
  $$('.dnd-over').forEach(n => { if (n !== hl) n.classList.remove('dnd-over'); });
  if (hl) hl.classList.add('dnd-over');
  d.ghost.classList.toggle('ok', !!target);
  const gh = d.ghost.querySelector('.dnd-gh'); if (gh) gh.textContent = (same ? target.z.reorderHint : target?.z.hint) || '';
  document.body.classList.toggle('dnd-no', !target);
  // Einfügelinie
  const L = d.line, ins = target?.ins;
  if (ins && !ins.self && ins.el.isConnected) {
    const r = ins.el.getBoundingClientRect(), c = target.z.el.getBoundingClientRect();
    if (target.z.axis === 'x') { L.style.cssText = `left:${(ins.after ? r.right : r.left) - 1.5}px;top:${Math.max(r.top, c.top)}px;width:3px;height:${Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)}px`; }
    else { const l = Math.max(r.left, c.left), rr = Math.min(r.right, c.right); L.style.cssText = `left:${l}px;top:${(ins.after ? r.bottom : r.top) - 1.5}px;width:${Math.max(0, rr - l)}px;height:3px`; }
    L.hidden = false;
  } else L.hidden = true;
  dndScroll(el, d);
}

/** Am Rand eines scrollbaren Bereichs automatisch weiterscrollen */
function dndScroll(el, d) {
  const E = 52, step = v => Math.sign(v) * Math.min(26, Math.max(4, Math.abs(v) / 2.2));
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const sy = /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1, sx = /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1;
    if (!sy && !sx) continue;
    const r = n.getBoundingClientRect();
    const dy = sy ? (d.y < r.top + E ? d.y - (r.top + E) : d.y > r.bottom - E ? d.y - (r.bottom - E) : 0) : 0;
    const dx = sx ? (d.x < r.left + E ? d.x - (r.left + E) : d.x > r.right - E ? d.x - (r.right - E) : 0) : 0;
    if (dx || dy) { n.scrollBy(dx ? step(dx) : 0, dy ? step(dy) : 0); return; }
  }
}

function dndEnd() {
  const d = DND.drag; DND.drag = null;
  if (!d) return;
  cancelAnimationFrame(d.raf);
  d.ghost.remove(); d.line.remove();
  d.marks.forEach(n => n.classList.remove('dnd-src'));
  $$('.dnd-src,.dnd-can,.dnd-over').forEach(n => n.classList.remove('dnd-src', 'dnd-can', 'dnd-over'));
  document.body.classList.remove('dnd-on', 'dnd-no');
  try { document.documentElement.releasePointerCapture(d.pid); } catch { /* */ }
  setTimeout(() => window.removeEventListener('click', dndSwallow, true), 0);   // der Klick nach dem Loslassen zählt nicht
}
function dndCancel() { if (DND.pre) { clearTimeout(DND.pre.timer); DND.pre = null; } dndEnd(); }

function dndDrop(d, t) {
  const same = d.z.id === t.z.id;
  if (same && t.ins?.self) return;   // auf sich selbst abgelegt
  const ins = t.ins ? {id: t.ins.id, after: t.ins.after} : null;
  Promise.resolve().then(() => same ? t.z.reorder(d.ids, ins) : t.z.drop(d.ids, d.z.id, ins))
    .catch(err => { if (String(err?.message || err) !== 'abgebrochen') toast('Nicht möglich', {t2: String(err?.message || err), type: 'warn'}); });
}

document.addEventListener('pointerdown', e => {
  if (DND.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const t = e.target; if (!(t instanceof Element)) return;
  const item = t.closest('[data-dnd-item]'); if (!item) return;
  const handle = t.closest('[data-dnd-handle]'), inter = t.closest(DND_SKIP);
  if (!handle && inter && inter !== item && item.contains(inter)) return;   // Eingabefelder und Schaltflächen im Item greifen nicht
  if (!handle && item.querySelector('[data-dnd-handle]')) return;   // nur am Anfasser greifen
  const zEl = item.closest('[data-dnd-zone]'), z = zEl && DND.zones.get(zEl.dataset.dndZone);
  if (!z || z.el !== zEl || (z.canDrag && !z.canDrag(item))) return;
  const p = DND.pre = {z, item, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch' && !handle, timer: 0};
  if (p.touch) p.timer = setTimeout(() => { if (DND.pre === p) dndStart(p, p.lx, p.ly); }, 380);   // Finger: erst nach kurzem Halten ziehen, sonst wird gescrollt
}, true);
document.addEventListener('pointermove', e => {
  const d = DND.drag;
  if (d) { d.x = e.clientX; d.y = e.clientY; e.preventDefault(); dndPlace(); return; }
  const p = DND.pre; if (!p || e.pointerId !== p.id) return;
  p.lx = e.clientX; p.ly = e.clientY;
  const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
  if (p.touch) { if (dist > 10) dndCancel(); return; }
  if (dist >= 5) dndStart(p, e.clientX, e.clientY);
}, true);
document.addEventListener('pointerup', e => {
  if (DND.pre) { clearTimeout(DND.pre.timer); DND.pre = null; }
  const d = DND.drag; if (!d) return;
  d.x = e.clientX; d.y = e.clientY; dndPlace();
  const t = d.target;
  dndEnd();
  if (t) dndDrop(d, t);
}, true);
document.addEventListener('pointercancel', () => dndCancel(), true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && (DND.drag || DND.pre)) { e.stopPropagation(); dndCancel(); } }, true);
window.addEventListener('blur', () => dndCancel());
document.addEventListener('touchmove', e => { if (DND.drag) e.preventDefault(); }, {passive: false});
// kein eingebautes Ziehen von Bildern/Links starten, solange wir ziehen
document.addEventListener('dragstart', e => { if ((DND.pre || DND.drag) && e.target instanceof Element && e.target.closest('[data-dnd-item]')) e.preventDefault(); }, true);

/* ── Dateien aus dem Explorer/Finder auf eine Fläche ziehen ──
   fileDrop(element, {accept: /\.csv$/i, multiple, hint, enabled, onFiles(files)})
   Die Web-Ansicht öffnet sonst eine fallen gelassene Datei und ersetzt damit das Programm – deshalb wird das überall abgefangen. */
const FILE_DROP = new WeakMap();
const dndIsFiles = e => !!e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files');
function fileDrop(el, opt) {
  if (!el) return;
  const have = FILE_DROP.get(el); if (have) { Object.assign(have, opt); return; }
  const o = {multiple: false, hint: 'Datei hier ablegen', ...opt, depth: 0, ov: null};
  FILE_DROP.set(el, o);
  const on = e => dndIsFiles(e) && (!o.enabled || o.enabled());
  const show = () => {
    if (o.ov) return; const r = el.getBoundingClientRect(), d = document.createElement('div');
    d.className = 'file-hint'; d.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    d.innerHTML = `<span>${ic('upload', 'i-sm')}${esc(o.hint)}</span>`; document.body.append(d); o.ov = d;
  };
  const hide = () => { o.depth = 0; o.ov?.remove(); o.ov = null; };
  el.addEventListener('dragenter', e => { if (!on(e)) return; e.preventDefault(); e.stopPropagation(); if (o.depth++ === 0) show(); });
  el.addEventListener('dragover', e => { if (!on(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; e._fileDrop = true; });
  el.addEventListener('dragleave', e => { if (!on(e)) return; if (--o.depth <= 0) hide(); });
  el.addEventListener('drop', e => {
    if (!on(e)) return; e.preventDefault(); e.stopPropagation(); hide();
    let files = Array.from(e.dataTransfer.files || []);
    if (o.accept) { const ok = files.filter(f => o.accept.test(f.name)); if (!ok.length && files.length) { toast('Dateityp passt nicht', {t2: files.map(f => f.name).join(', ').slice(0, 80), type: 'warn'}); return; } files = ok; }
    if (!o.multiple) files = files.slice(0, 1);
    if (files.length) Promise.resolve(o.onFiles(files)).catch(err => toast('Datei nicht lesbar', {t2: String(err?.message || err), type: 'warn'}));
  });
}
// nirgends sonst: die Datei nicht öffnen, kein „Ablegen“-Mauszeiger
window.addEventListener('dragover', e => { if (dndIsFiles(e)) { e.preventDefault(); if (!e._fileDrop) e.dataTransfer.dropEffect = 'none'; } });
window.addEventListener('drop', e => { if (dndIsFiles(e)) e.preventDefault(); });
