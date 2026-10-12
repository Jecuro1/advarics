/* ════════════════════════════════════════════════════════════════════
   Datentabelle im Advarics-Stil (Warengruppen): dunkle Werkzeugleiste, Gruppierleiste,
   Spaltenköpfe mit Filterzeile, Spaltenauswahl, automatische Spaltenbreite, Export,
   Auswahlkästchen und flüssiges Scrollen auch bei über 10.000 Zeilen (virtuelle Zeilen).
   ════════════════════════════════════════════════════════════════════ */
const AGRID_ROW = 40;
const AG = {};   // Zustand je Tabelle

function agNew(cfg) {
  return {cfg, rows: [], view: [], cols: cfg.cols.map(c => ({...c, show: c.show !== false})), sort: cfg.sort || null, filters: {}, q: '', group: [...(cfg.group || [])], collapsed: new Set(), sel: new Set(), filterRow: true};
}
/** Tabelle in einen beliebigen Container zeichnen (Seite oder Reiter) */
function agMount(key, v) {
  const st = AG[key], cfg = st.cfg;
  st.rows = cfg.rows();
  st.cols.forEach(c => { delete c.aw; });
  v.innerHTML = `<div class="datagrid ${cfg.embed ? 'ag-embed' : ''}" id="ag-${key}" style="--agrow:${cfg.rowH || 40}px">
      ${cfg.toolbar?.length ? `<div class="ag-bar">${cfg.toolbar.map(b => `<button class="ag-btn" data-ag="${b.k}">${ic(b.icon, 'i-sm')}<span>${esc(b.l)}</span></button>`).join('')}<button class="ag-btn ag-del" data-ag="del" hidden>${ic(cfg.removeIcon || 'trash', 'i-sm')}<span>${esc(cfg.removeLabel || 'Löschen')}</span></button></div>` : ''}
      <div class="ag-tools"><div class="ag-drop" data-agdrop><span class="ag-ph">Zu gruppierende Spalten hierhin ziehen…</span></div>
        ${(cfg.extra || []).map(b => `<button class="ag-xbtn" data-ag="${b.k}">${ic(b.icon || 'plus', 'i-sm')}${esc(b.l)}</button>`).join('')}
        ${cfg.remove && !cfg.toolbar?.length ? `<button class="ag-xbtn ag-del" data-ag="del" hidden>${ic(cfg.removeIcon || 'trash', 'i-sm')}${esc(cfg.removeLabel || 'Löschen')}</button>` : ''}
        <label class="ag-search">${ic('search', 'i-sm')}<input data-agq placeholder="Suche …" value="${esc(st.q)}"></label>
        <button class="ag-tbtn" data-ag="cols" title="Spalten-Auswahl">${ic('list', 'i-sm')}Spalten</button>
        <button class="ag-tbtn" data-ag="fit" title="Automatische Spaltenbreite">${ic('swap', 'i-sm')}Spaltenbreite</button>
        <button class="ag-tbtn" data-ag="export" title="Exportieren (CSV)">${ic('upload', 'i-sm')}Export</button>
        <button class="ag-tbtn" data-ag="filter" title="Filterzeile ein-/ausblenden">${ic('filter', 'i-sm')}Filter</button></div>
      <div class="ag-scroll" data-agscroll><div class="ag-inner" data-aginner><div class="ag-sticky"><div class="ag-head" data-aghead></div><div class="ag-filt" data-agfilt></div></div><div class="ag-rows" data-agrows></div></div></div>
      <div class="ag-foot"><b data-agcount></b><span class="ag-sel" data-agselinfo></span><span class="ag-sel" data-agsums></span><button class="ag-tbtn ag-fbtn" data-ag="filter">${ic('filter', 'i-sm')}Filter erstellen</button></div></div>`;
  agBind(key, v);
  agApply(key, true);
}
function agridPage(page, cfg) {
  AG[page] = agNew(cfg);
  const render = async () => { await loadStamm(); AG[page] ||= agNew(cfg); agMount(page, $('#view-' + page)); };
  registerPage(page, {title: cfg.title, sub: () => `${num(cfg.count ? cfg.count() : AG[page].rows.length)} Einträge`, render});
  VIEW_PERM[page] ||= 'einstellungen';
}

const agVal = (r, c) => c.get ? c.get(r) : r[c.k];
const agText = (r, c) => { const v = agVal(r, c); return c.fmt ? c.fmt(v, r) : v == null ? '' : String(v); };
const agWidth = c => c.uw || c.aw || Math.round((c.w || 120) * 1.15);
const agFlex = c => !c.uw && !c.html && c.t !== 'num' && c.t !== 'check';
let agCtx = null;
/** Spaltenbreite aus Spaltenkopf und Inhalt messen – kein Kopf wird abgeschnitten, der Rest der Breite wird verteilt */
function agMeasure(page, v, vis) {
  const st = AG[page], todo = vis.filter(c => c.aw == null && !c.uw);
  if (!todo.length) return;
  agCtx ||= document.createElement('canvas').getContext('2d');
  const hl = $('.ag-h .ag-hl', v), host = $('[data-agrows]', v);
  const font = (el, d) => { if (!el) return d; const k = getComputedStyle(el); return `${k.fontStyle} ${k.fontWeight} ${k.fontSize} ${k.fontFamily}`; };   // die Kurzform „font“ liefert nicht jede WebView
  const fh = font(hl, '600 13px sans-serif'), fc = font(host, '400 13.5px sans-serif');
  const cs = getComputedStyle($('.ag-c', v) || host || document.body), pad = (parseFloat(cs.paddingLeft) || 8) + (parseFloat(cs.paddingRight) || 8);
  const sample = st.rows.length > 600 ? st.rows.filter((_, i) => i % Math.ceil(st.rows.length / 600) === 0) : st.rows;
  const mw = t => agCtx.measureText(t).width;
  for (const c of todo) {
    // Inhalt
    let cw = 0;
    if (c.html) cw = Math.round((c.w || 60) * 1.15) - pad;
    else if (c.t === 'check') cw = 40;
    else { agCtx.font = fc; for (const r of sample) { const t = agText(r, c); if (t) { const x = mw(t); if (x > cw) cw = x; } } cw = Math.min(cw, c.t === 'num' ? 200 : 300) + 10; }   // längere Texte: Rest per Tooltip, freie Breite bekommen die Textspalten
    // Kopf: lange Überschriften dürfen zweizeilig werden, wenn der Inhalt schmaler ist
    agCtx.font = fh;
    const words = (c.l || '').split(/\s+/).filter(Boolean);
    let hw = mw(c.l || '');
    if (words.length > 1 && hw > cw) for (let i = 1; i < words.length; i++) hw = Math.min(hw, Math.max(mw(words.slice(0, i).join(' ')), mw(words.slice(i).join(' '))));
    const w = Math.max(Math.ceil(hw) + 2 + pad + (c.l ? 40 : 0), cw + pad, c.t === 'num' || c.t === 'check' ? 64 : 90);   // + Filter-Symbol und Sortierpfeil
    c.aw = Math.ceil(w);
  }
}

function agApply(page, resetScroll) {
  const st = AG[page], v = $('#ag-' + page); if (!v) return;
  const vis = st.cols.filter(c => c.show);
  let rows = st.rows;
  const q = norm(st.q || '');
  if (q) rows = rows.filter(r => vis.some(c => norm(agText(r, c)).includes(q)));
  for (const [k, f] of Object.entries(st.filters)) {
    if (f === '' || f == null) continue;
    const c = st.cols.find(x => x.k === k); if (!c) continue;
    if (c.t === 'check') rows = rows.filter(r => (f === 'ja') === !!agVal(r, c));
    else { const n = norm(f); rows = rows.filter(r => norm(agText(r, c)).includes(n)); }
  }
  if (st.sort) {
    const c = st.cols.find(x => x.k === st.sort.k), d = st.sort.dir;
    if (c) { const num_ = c.t === 'num'; rows = [...rows].sort((a, b) => { const x = agVal(a, c), y = agVal(b, c); const r = num_ ? (+x || 0) - (+y || 0) : String(x ?? '').localeCompare(String(y ?? ''), 'de', {numeric: true}); return d * r; }); }
  }
  // Gruppieren (mehrere Ebenen)
  const flat = [];
  const walk = (list, keys, depth, path) => {
    if (!keys.length) { list.forEach(r => flat.push({r})); return; }
    const c = st.cols.find(x => x.k === keys[0]); const m = new Map();
    list.forEach(r => { const g = agText(r, c) || '(leer)'; (m.get(g) || m.set(g, []).get(g)).push(r); });
    for (const [g, l] of m) {
      const id = path + '|' + keys[0] + '=' + g;
      flat.push({g, c: c.l, n: l.length, depth, id});
      if (!st.collapsed.has(id)) walk(l, keys.slice(1), depth + 1, id);
    }
  };
  walk(rows, st.group, 0, '');
  st.view = flat; st.filtered = rows;
  agHead(page, v, vis);
  $('[data-agcount]', v).textContent = num(rows.length).replace(/\./g, ' ');
  agSelInfo(page, v);
  { const sm = vis.filter(c => c.sum); $('[data-agsums]', v).textContent = sm.map(c => `Σ ${c.l}: ${num(rows.reduce((s, r) => s + (+agVal(r, c) || 0), 0))}`).join('   '); }
  const sc = $('[data-agscroll]', v);
  if (resetScroll) sc.scrollTop = 0;
  agRows(page, v, vis);
  const drop = $('[data-agdrop]', v);
  drop.innerHTML = st.group.length ? st.group.map(k => { const c = st.cols.find(x => x.k === k); return `<span class="ag-chip" data-agung="${k}">${esc(c.l)} ${ic('x', 'i-xs')}</span>`; }).join('') : '<span class="ag-ph">Zu gruppierende Spalten hierhin ziehen…</span>';
}

function agHead(page, v, vis) {
  const st = AG[page];
  const all = st.filtered && st.filtered.length && st.filtered.every(r => st.sel.has(r.id));
  $('[data-aghead]', v).innerHTML = `<div class="ag-c ag-ck"><i class="agchk ${all ? 'on' : ''}" data-agall></i></div>${vis.map(c => `<div class="ag-c ag-h ${c.t === 'num' ? 'r' : ''}" draggable="true" data-agcol="${c.k}"><span class="ag-hl" data-agsort="${c.k}">${esc(c.l)}</span>${c.l ? `<span class="ag-fi" data-agfi="${c.k}">${ic('filter', 'i-xs')}</span>` : ''}${st.sort?.k === c.k ? `<span class="ag-sort">${st.sort.dir > 0 ? '▲' : '▼'}</span>` : ''}<span class="ag-rs" data-agrs="${c.k}"></span></div>`).join('')}`;
  agMeasure(page, v, vis);
  const flex = vis.some(agFlex) ? agFlex : (c => c === vis[vis.length - 1]);
  const inner = $('[data-aginner]', v);
  inner.style.setProperty('--cols', `44px ${vis.map(c => flex(c) ? `minmax(${agWidth(c)}px, ${agWidth(c)}fr)` : `${agWidth(c)}px`).join(' ')}`);
  inner.style.minWidth = (44 + vis.reduce((s, c) => s + agWidth(c), 0)) + 'px';
  const f = $('[data-agfilt]', v);
  f.hidden = !st.filterRow;
  f.innerHTML = `<div class="ag-c ag-ck"></div>${vis.map(c => c.t === 'check'
    ? `<div class="ag-c"><select data-agf="${c.k}"><option value="">(Alle)</option><option value="ja" ${st.filters[c.k] === 'ja' ? 'selected' : ''}>Ja</option><option value="nein" ${st.filters[c.k] === 'nein' ? 'selected' : ''}>Nein</option></select></div>`
    : `<div class="ag-c">${ic('search', 'i-xs')}<input data-agf="${c.k}" value="${esc(st.filters[c.k] || '')}"></div>`).join('')}`;
}

/** Nur die sichtbaren Zeilen zeichnen */
function agRows(page, v, vis) {
  const st = AG[page], sc = $('[data-agscroll]', v), host = $('[data-agrows]', v);
  vis ||= st.cols.filter(c => c.show);
  const n = st.view.length, H = st.cfg.rowH || AGRID_ROW;
  host.style.height = (n * H) + 'px';
  const top = Math.max(0, Math.floor(sc.scrollTop / H) - 10), cnt = Math.ceil(sc.clientHeight / H) + 24, end = Math.min(n, top + cnt);
  let html = '';
  for (let i = top; i < end; i++) {
    const it = st.view[i];
    if (it.g != null) { html += `<div class="ag-row ag-grp" style="top:${i * H}px;padding-left:${8 + it.depth * 16}px" data-aggrp="${esc(it.id)}"><span>${st.collapsed.has(it.id) ? '▸' : '▾'}</span> <b>${esc(it.c)}:</b> ${esc(it.g)} <span class="ag-n">(${num(it.n)})</span></div>`; continue; }
    const r = it.r;
    html += `<div class="ag-row ${st.sel.has(r.id) ? 'sel' : ''} ${i % 2 ? 'alt' : ''}" style="top:${i * H}px" data-agrow="${esc(r.id)}"><div class="ag-c ag-ck"><i class="agchk ${st.sel.has(r.id) ? 'on' : ''}" data-agck="${esc(r.id)}"></i></div>${vis.map(c => c.t === 'check' ? `<div class="ag-c ag-cc"><i class="agchk ${agVal(r, c) ? 'on' : ''} ro"></i></div>` : `<div class="ag-c ${c.t === 'num' ? 'r' : ''}" ${c.html ? '' : `title="${esc(agText(r, c))}"`}>${c.html ? c.html(r) : esc(agText(r, c))}</div>`).join('')}</div>`;
  }
  host.innerHTML = html;
}

function agSelInfo(page, v) {
  const st = AG[page], n = st.sel.size;
  $('[data-agselinfo]', v).textContent = n ? `${num(n)} ausgewählt` : '';
  const d = $('[data-ag="del"]', v); if (d) d.hidden = !n;
}

function agBind(page, v) {
  const st = AG[page], cfg = st.cfg, sc = $('[data-agscroll]', v);
  let raf = 0;
  sc.onscroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; agRows(page, v); }); };
  const refresh = reset => agApply(page, reset);
  v.oninput = e => {
    const t = e.target;
    if (t.dataset.agq != null) { st.q = t.value; clearTimeout(st._t); st._t = setTimeout(() => refresh(true), 160); }
    else if (t.dataset.agf) { st.filters[t.dataset.agf] = t.value; clearTimeout(st._t); st._t = setTimeout(() => { const pos = t.selectionStart; refresh(true); const nx = $(`[data-agf="${t.dataset.agf}"]`, v); if (nx && nx.tagName === 'INPUT') { nx.focus(); try { nx.setSelectionRange(pos, pos); } catch { /* */ } } }, 220); }
  };
  v.onchange = e => { const t = e.target; if (t.tagName === 'SELECT' && t.dataset.agf) { st.filters[t.dataset.agf] = t.value; refresh(true); } };
  v.onclick = async e => {
    const t = e.target;
    const im = t.closest('[data-agimg]'); if (im && cfg.onImage) { e.stopPropagation(); cfg.onImage(im.dataset.agimg); return; }
    const ung = t.closest('[data-agung]'); if (ung) { st.group = st.group.filter(k => k !== ung.dataset.agung); refresh(true); return; }
    const grp = t.closest('[data-aggrp]'); if (grp) { const id = grp.dataset.aggrp; st.collapsed.has(id) ? st.collapsed.delete(id) : st.collapsed.add(id); refresh(false); return; }
    if (t.closest('[data-agall]')) { const all = st.filtered.length && st.filtered.every(r => st.sel.has(r.id)); st.filtered.forEach(r => all ? st.sel.delete(r.id) : st.sel.add(r.id)); agHead(page, v, st.cols.filter(c => c.show)); agRows(page, v); agSelInfo(page, v); return; }
    const ck = t.closest('[data-agck]'); if (ck) { const id = ck.dataset.agck; st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id); agRows(page, v); agSelInfo(page, v); return; }
    const so = t.closest('[data-agsort]'); if (so) { const k = so.dataset.agsort; st.sort = !st.sort || st.sort.k !== k ? {k, dir: 1} : st.sort.dir === 1 ? {k, dir: -1} : null; refresh(true); return; }
    const fi = t.closest('[data-agfi]'); if (fi) { st.filterRow = true; $('[data-agfilt]', v).hidden = false; $(`[data-agf="${fi.dataset.agfi}"]`, v)?.focus(); return; }
    const b = t.closest('[data-ag]'); if (!b) return;
    const k = b.dataset.ag;
    if (k === 'filter') { st.filterRow = !st.filterRow; $('[data-agfilt]', v).hidden = !st.filterRow; return; }
    if (k === 'fit') { agFit(page); refresh(false); return; }
    if (k === 'cols') { agColsMenu(page, b, v); return; }
    if (k === 'export') { agExport(page); return; }
    if (k === 'del') { await cfg.remove?.([...st.sel]).then(() => { st.sel.clear(); return render_(); }).catch(() => { /* abgebrochen */ }); return; }
    const fn = cfg.actions?.[k]; if (fn) { await fn(); }
  };
  const render_ = () => cfg.reload ? cfg.reload() : PAGES[page].render();
  v.ondblclick = e => { const r = e.target.closest('[data-agrow]'); if (r && !e.target.closest('[data-agck]')) cfg.edit?.(r.dataset.agrow, render_); };
  // Spalten ziehen → gruppieren; Spaltenbreite ändern
  v.ondragstart = e => { const h = e.target.closest('[data-agcol]'); if (h) { e.dataTransfer.setData('text/plain', h.dataset.agcol); e.dataTransfer.effectAllowed = 'move'; } };
  const drop = $('[data-agdrop]', v);
  v.ondragover = e => { if (e.target.closest('[data-agdrop]')) { e.preventDefault(); drop.classList.add('over'); } };
  v.ondragleave = () => drop.classList.remove('over');
  v.ondrop = e => { const d = e.target.closest('[data-agdrop]'); drop.classList.remove('over'); if (!d) return; e.preventDefault(); const k = e.dataTransfer.getData('text/plain'); if (k && !st.group.includes(k)) { st.group.push(k); refresh(true); } };
  v.onmousedown = e => {
    const rs = e.target.closest('[data-agrs]'); if (!rs) return;
    e.preventDefault(); e.stopPropagation();
    const c = st.cols.find(x => x.k === rs.dataset.agrs), x0 = e.clientX, w0 = agWidth(c);
    const mv = ev => { c.uw = Math.max(40, w0 + ev.clientX - x0); agHead(page, v, st.cols.filter(z => z.show)); agRows(page, v); };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  };
}

function agFit(page) {
  AG[page].cols.forEach(c => { delete c.uw; delete c.aw; });
}

function agColsMenu(page, anchor, v) {
  const st = AG[page];
  const el = openPopover(anchor, `<div class="ag-menu">${st.cols.map(c => `<label><input type="checkbox" data-agcs="${c.k}" ${c.show ? 'checked' : ''}> ${esc(c.l)}</label>`).join('')}</div>`, {align: 'right', width: 280});
  el?.addEventListener('change', e => { const k = e.target.dataset.agcs; const c = st.cols.find(x => x.k === k); if (c) { c.show = e.target.checked; if (!st.cols.some(x => x.show)) { c.show = true; e.target.checked = true; } agApply(page, false); } });
}

function agExport(page) {
  const st = AG[page], vis = st.cols.filter(c => c.show);
  const cell = s => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const csv = '﻿' + [vis.map(c => cell(c.l)).join(';'), ...st.filtered.map(r => vis.map(c => cell(c.t === 'check' ? (agVal(r, c) ? 'Ja' : 'Nein') : agText(r, c))).join(';'))].join('\r\n');
  if (!DESKTOP) { toast('Export nur in der Desktop-App'); return; }
  invoke('save_text', {name: `Kontor_${st.cfg.title.replace(/\W+/g, '_')}.csv`, content: csv, title: st.cfg.title + ' exportieren'}).then(p => p && toast('Exportiert', {t2: p, type: 'pos', icon: 'download'})).catch(e => toast('Export fehlgeschlagen', {t2: String(e), type: 'warn'}));
}

/* ── Warengruppen ── */
const WG_MWST = [['Standard', 20], ['Reduziert', 10], ['Ohne MwSt.', 0]];
const wgMwstTyp = u => (WG_MWST.find(x => x[1] === +u) || WG_MWST[0])[0];
function wgRows() {
  const idx = k => new Map(stRows(k).map(r => [r.id, r]));
  const ab = idx('abteilung'), ha = idx('hauptabteilung'), be = idx('bereich');
  const lvl = r => r ? [r.nr ?? '0', r.name || 'NA'] : ['0', 'NA'];
  return stRows('warengruppe').map(r => {
    const a = ab.get(r.abteilung), h = a && ha.get(a.parent), b = h && be.get(h.parent);
    const [e1n, e1] = lvl(b), [e2n, e2] = lvl(h), [e3n, e3] = lvl(a);
    return {id: r.id, nr: r.nr ?? String(r.id).replace(/^adv-/, ''), name: r.name || r.id, e1n, e1, e2n, e2, e3n, e3, mwst: r.mwst || wgMwstTyp(r.ust ?? 20), etikett: r.etikett || '', inventur: !!r.inventur, alter: r.altersbewertung || '', spanne: r.spanne == null || r.spanne === '' ? 0 : Math.round(+r.spanne * 10000) / 100, _raw: r};
  });
}
function wgEdit(id, done) {
  const st = AG['st-warengruppe'], row = id ? st.rows.find(r => r.id === id) : null;
  const o = row?._raw || {}, abt = stRows('abteilung');
  const lab = a => { const h = stRows('hauptabteilung').find(x => x.id === a.parent); return `${a.name}${h ? ' · ' + h.name : ''}`; };
  const el = openLayer(`<div class="modal" style="width:min(560px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('tag')}</div><div><h2>${row ? 'Warengruppe bearbeiten' : 'Neue Warengruppe'}</h2><p>${row ? esc(row.nr + ' · ' + row.name) : 'Nr. und Name vergeben'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:12px;grid-template-columns:1fr 2fr">
      <label class="field"><span>Nr.</span><input class="input" data-f="nr" value="${esc(row?.nr || '')}" ${row ? 'disabled' : ''}></label>
      <label class="field"><span>Name</span><input class="input" data-f="name" value="${esc(row?.name || '')}"></label>
      <label class="field" style="grid-column:1/-1"><span>Abteilung (Ebene 3)</span><select class="input select" data-f="abteilung"><option value="">NA</option>${abt.map(a => `<option value="${esc(a.id)}" ${a.id === o.abteilung ? 'selected' : ''}>${esc(lab(a))}</option>`).join('')}</select></label>
      <label class="field"><span>MwSt.-Typ</span><select class="input select" data-f="mwst">${WG_MWST.map(([l]) => `<option ${l === (row?.mwst || 'Standard') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Etiketten-Typ</span><input class="input" data-f="etikett" value="${esc(row?.etikett ?? 'Klebe 50x30')}"></label>
      <label class="field"><span>Altersbewertung</span><select class="input select" data-f="alter">${['Standard', 'Statistik'].map(l => `<option ${l === (row?.alter || 'Statistik') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Vorschl.-Spanne/Kalk. %</span><input class="input num" data-f="spanne" inputmode="decimal" value="${esc(String(row?.spanne ?? 50).replace('.', ','))}"></label>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;grid-column:1/-1"><input type="checkbox" data-f="inventur" ${row ? (row.inventur ? 'checked' : '') : 'checked'}> bei Inventur berücksichtigen</label></div>
    <div class="m-foot">${row ? `<button class="btn btn-ghost" data-del style="color:var(--neg)">${ic('trash', 'i-sm')}Löschen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-ok>${ic('check', 'i-sm')}Speichern</button></div></div>`, {focus: row ? '[data-f="name"]' : '[data-f="nr"]'});
  const f = k => $(`[data-f="${k}"]`, el);
  const save = async list => { await needPerm('einstellungen', 'Warengruppen'); await stammSave('warengruppe', list); closeLayer(el); done(); };
  $('[data-ok]', el).onclick = async () => {
    const nr = f('nr').value.trim(), name = f('name').value.trim();
    if (!nr || !name) { toast('Nr. und Name angeben', {type: 'warn'}); return; }
    const all = stRows('warengruppe').map(r => ({...r}));
    const mw = f('mwst').value, ust = (WG_MWST.find(x => x[0] === mw) || WG_MWST[0])[1];
    const data = {name, nr, abteilung: f('abteilung').value, ust, mwst: mw, etikett: f('etikett').value.trim(), inventur: f('inventur').checked, altersbewertung: f('alter').value, spanne: (parseAmt(f('spanne').value) || 0) / 100};
    try {
      if (row) { const i = all.findIndex(r => r.id === row.id); all[i] = {...all[i], ...data}; }
      else { const nid = 'adv-' + nr; if (all.some(r => r.id === nid)) { toast(`Nr. ${nr} gibt es schon`, {type: 'warn'}); return; } all.push({id: nid, _aktiv: true, ...data}); }
      await save(all);
    } catch (err) { if (String(err.message || err) !== 'abgebrochen') toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
  };
  const del = $('[data-del]', el);
  if (del) del.onclick = async () => { if (!await confirmBox(`Warengruppe „${row.name}“ löschen?`, 'Löschen')) return; try { await save(stRows('warengruppe').filter(r => r.id !== row.id).map(r => ({...r}))); } catch { /* */ } };
}
agridPage('st-warengruppe', {
  title: 'Warengruppen',
  rows: wgRows,
  count: () => stRows('warengruppe').length,
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}, {k: 'fedas', l: 'Fedas Synchronisierung', icon: 'sync'}],
  cols: [
    {k: 'nr', l: 'Nr.', t: 'num', w: 80}, {k: 'name', l: 'Name', w: 240},
    {k: 'e1n', l: 'Hierarchie Ebene1-Nr.', t: 'num', w: 130}, {k: 'e1', l: 'Hierarchie Ebene1-Name', w: 150},
    {k: 'e2n', l: 'Hierarchie Ebene2-Nr.', t: 'num', w: 130}, {k: 'e2', l: 'Hierarchie Ebene2-Name', w: 170},
    {k: 'e3n', l: 'Hierarchie Ebene3-Nr.', t: 'num', w: 130}, {k: 'e3', l: 'Hierarchie Ebene3-Name', w: 170},
    {k: 'mwst', l: 'MwSt.-Typ', w: 100}, {k: 'etikett', l: 'Etiketten-Typ', w: 120}, {k: 'inventur', l: 'Inventur', t: 'check', w: 80},
    {k: 'alter', l: 'Altersbewertung', w: 120}, {k: 'spanne', l: 'Vorschl.-Spanne/Kalk.', t: 'num', w: 140, fmt: v => num(+v || 0, 2) + ' %'},
  ],
  actions: {
    back: () => history.length > 1 ? history.back() : go('dashboard'),
    refresh: async () => { await loadStamm(true); PAGES['st-warengruppe'].render(); },
    new: () => wgEdit(null, () => PAGES['st-warengruppe'].render()),
    fedas: () => go('fedas-sync'),
  },
  edit: (id, done) => wgEdit(id, done),
  remove: async ids => {
    if (!await confirmBox(`${num(ids.length)} Warengruppe${ids.length > 1 ? 'n' : ''} löschen?`, 'Löschen')) throw new Error('abgebrochen');
    await needPerm('einstellungen', 'Warengruppen');
    const s = new Set(ids); await stammSave('warengruppe', stRows('warengruppe').filter(r => !s.has(r.id)).map(r => ({...r})));
  },
});
