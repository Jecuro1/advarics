
/* ════════════════════════════════════════════════════════════════════
   48 · ANALYSE — Flexanalyse (Designer + Ansicht) über alle Beleg-
   positionen mit bis zu drei Dimensionen, Vorlagen, Kategorien,
   eigenen Spalten, Ampeln und Zeitsteuerung; fertige Auswertungen
   (Größen/Preislagen, Filialbestand, NOS je Filiale, Artikel-Info-
   Bericht, Intrastat, Artikelliste, Feste Rabatte, Prämien, Hotels,
   Altersbewertung, Flächenproduktivität) und Power-BI-Anbindung.
   ════════════════════════════════════════════════════════════════════ */
const AN_DIMS = [['warengruppe', 'Warengruppe'], ['marke', 'Marke'], ['artikel', 'Artikel'], ['farbe', 'Farbe'], ['groesse', 'Größe'], ['preislage', 'Preislage'], ['lieferant', 'Lieferant'], ['saison', 'Saison'],
  ['verkaeufer', 'Verkäufer:in'], ['kassier', 'Kassier:in'], ['kunde', 'Kunde'], ['filiale', 'Filiale'], ['filialgruppe', 'Filialgruppe'], ['haustyp', 'Haus-Typ'], ['jahr', 'Jahr'], ['monat', 'Monat'], ['tag', 'Tag'], ['wochentag', 'Wochentag'], ['stunde', 'Stunde']];
const AN_MEAS = [['menge', 'Menge', 'n'], ['umsatz', 'Umsatz brutto', 'e'], ['rabatt', 'Rabatt', 'e'], ['netto', 'Umsatz netto', 'e'], ['ek', 'Wareneinsatz EK', 'e'], ['rohertrag', 'Rohertrag', 'e'], ['bons', 'Bons', 'n']];
Object.assign(DEFAULTS, {'analyse.zeitraum': 'monat', 'analyse.dims': ['warengruppe'], 'analyse.kennzahlen': ['menge', 'umsatz', 'rohertrag'], 'analyse.anteil': true, 'intrastat.laender': {}, 'intrastat.ware_kg': 0.5});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });

STAMM_DEF.analysespalte = {t: 'Flexanalysespalten', ic: 'list', sub: 'Eigene berechnete Kennzahlen – Formel aus menge, umsatz, rabatt, netto, ek, rohertrag, bons (z. B. „rohertrag / netto * 100“ = Spanne %)', cols: [{k: 'name', l: 'Spalte'}, {k: 'formel', l: 'Formel', w: 300}, {k: 'format', l: 'Format', t: 'select', o: [['n', 'Zahl'], ['e', 'Euro'], ['p', 'Prozent']]}],
  seed: [{id: 'SPANNE', name: 'Spanne %', formel: 'rohertrag / netto * 100', format: 'p'}, {id: 'DBON', name: 'Ø Bon', formel: 'umsatz / bons', format: 'e'}, {id: 'RABQ', name: 'Rabattquote %', formel: 'rabatt / (umsatz + rabatt) * 100', format: 'p'}]};
stammPage('analysespalte', 'st-analysespalte');
VIEW_PERM['st-analysespalte'] = 'berichte'; VIEW_PERM['st-reportplan'] = 'berichte'; VIEW_PERM['st-indikator'] = 'berichte'; VIEW_PERM['st-analysekategorie'] = 'berichte';

const anPeriod = (k, ref = new Date()) => {
  const d = new Date(ref), y = d.getFullYear(), m = d.getMonth();
  if (k === 'heute') return [today(), today()];
  if (k === 'gestern') { const g = new Date(d - 864e5); return [dIso(g), dIso(g)]; }
  if (k === 'woche') { const mo = new Date(d); mo.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [dIso(mo), today()]; }
  if (k === 'vorwoche') { const mo = new Date(d); mo.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); const so = new Date(mo); so.setDate(mo.getDate() + 6); return [dIso(mo), dIso(so)]; }
  if (k === 'monat') return [dIso(new Date(y, m, 1)), today()];
  if (k === 'vormonat') return [dIso(new Date(y, m - 1, 1)), dIso(new Date(y, m, 0))];
  if (k === 'jahr') return [`${y}-01-01`, today()];
  if (k === 'vorjahr') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if (k === '30') return [dIso(new Date(d - 29 * 864e5)), today()];
  if (k === '90') return [dIso(new Date(d - 89 * 864e5)), today()];
  return [`${y}-01-01`, today()];
};
const AN_PER = [['heute', 'Heute'], ['gestern', 'Gestern'], ['woche', 'Woche'], ['vorwoche', 'Vorwoche'], ['monat', 'Monat'], ['vormonat', 'Vormonat'], ['jahr', 'Jahr'], ['vorjahr', 'Vorjahr']];
const anFmt = (v, f) => f === 'e' ? eur(v || 0) : f === 'p' ? (isFinite(v) ? num(v, 1) + ' %' : '–') : num(Math.round((v || 0) * 100) / 100);
/** Formel sicher auswerten – nur Kennzahlen, Zahlen und + − × ÷ ( ) */
function anFormula(f, row) {
  const src = String(f || '').toLowerCase();
  if (!/^[a-z_0-9+\-*/(). ]+$/.test(src)) return NaN;
  const names = AN_MEAS.map(m => m[0]);
  const expr = src.replace(/[a-z_]+/g, w => names.includes(w) ? `(${+row[w] || 0})` : 'NaN');
  try { const v = Function(`"use strict";return (${expr});`)(); return isFinite(v) ? v : NaN; } catch { return NaN; }
}
const anDimLabel = (d, v) => d === 'warengruppe' ? (CATS.find(c => c.id === v)?.name || v) : d === 'farbe' ? colorName(v) : v || '–';
function anIndicator(meas, v) {
  const s = stActive('indikator').find(x => x.kennzahl === meas); if (!s) return '';
  return v >= +s.gruen ? 'color:var(--pos);font-weight:650' : v >= +s.gelb ? 'color:var(--warn);font-weight:650' : 'color:var(--neg);font-weight:650';
}

/* ── Flexanalyse Designer ── */
const AN = {per: CFG['analyse.zeitraum'] || 'monat', von: null, bis: null, dims: (CFG['analyse.dims'] || ['warengruppe']).slice(), meas: (CFG['analyse.kennzahlen'] || ['menge', 'umsatz', 'rohertrag']).slice(), cust: [], filter: {}, res: null, sort: 'umsatz', name: '', busy: false};
registerPage('flexanalyse', {title: 'Flexanalyse Designer', sub: () => AN.name || 'Dimensionen und Kennzahlen frei wählen', render: renderFlex});
VIEW_PERM.flexanalyse = 'berichte';
async function anRun(p) { return invoke('analyse', {params: p}); }
const anParams = () => { if (!AN.von) [AN.von, AN.bis] = anPeriod(AN.per); return {von: AN.von, bis: AN.bis, dims: AN.dims.filter(Boolean), filter: AN.filter}; };
async function renderFlex() {
  const v = $('#view-flexanalyse');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('chart', 'Flexanalyse'); return; }
  await loadStamm();
  if (!AN.von) [AN.von, AN.bis] = anPeriod(AN.per);
  const custCols = stActive('analysespalte');
  const dimSel = i => `<select class="input select" data-and="${i}" style="width:auto"><option value="">${i ? '– keine –' : '– Gesamt –'}</option>${AN_DIMS.map(([k, l]) => `<option value="${k}" ${AN.dims[i] === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const filt = Object.entries(AN.filter);
  v.innerHTML = `<div class="cv">${pageHead('Flexanalyse Designer', 'Bis zu drei Dimensionen, beliebige Kennzahlen, Filter und eigene Spalten – als Vorlage speichern, exportieren oder zeitgesteuert versenden',
    `<button class="btn btn-secondary" data-anx="csv">${ic('upload', 'i-sm')}CSV</button><button class="btn btn-secondary" data-anx="print">${ic('printer', 'i-sm')}Drucken</button><button class="btn btn-secondary" data-anx="save">${ic('star', 'i-sm')}Als Vorlage</button><button class="btn btn-primary" data-anx="run">${ic('play', 'i-sm')}Auswerten</button>`)}
    <div class="card" style="padding:16px;display:grid;gap:14px;margin-bottom:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span class="set-l" style="min-width:110px">Zeitraum</span><div class="seg" data-anper>${AN_PER.map(([k, l]) => `<button data-v="${k}" aria-pressed="${AN.per === k}">${l}</button>`).join('')}</div><input class="input" type="date" data-anv value="${AN.von}" style="width:auto"><span class="muted">bis</span><input class="input" type="date" data-anb value="${AN.bis}" style="width:auto"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span class="set-l" style="min-width:110px">Zeilen</span>${dimSel(0)}${ic('chevron-right', 'i-sm')}${dimSel(1)}${ic('chevron-right', 'i-sm')}${dimSel(2)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="set-l" style="min-width:110px">Kennzahlen</span>${AN_MEAS.map(([k, l]) => `<label class="chip" style="cursor:pointer"><input type="checkbox" data-anm="${k}" ${AN.meas.includes(k) ? 'checked' : ''} style="margin:0 6px 0 0">${l}</label>`).join('')}${custCols.map(c => `<label class="chip" style="cursor:pointer;border-style:dashed"><input type="checkbox" data-anc="${esc(c.id)}" ${AN.cust.includes(c.id) ? 'checked' : ''} style="margin:0 6px 0 0">${esc(c.name)}</label>`).join('')}<button class="btn btn-ghost btn-sm" data-goto="st-analysespalte">${ic('plus', 'i-sm')}Spalte</button></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="set-l" style="min-width:110px">Filter</span>${filt.map(([k, val]) => `<span class="chip">${esc(AN_DIMS.find(d => d[0] === k)?.[1] || k)} = ${esc(anDimLabel(k, val))}<button class="btn btn-ghost btn-icon btn-sm" data-anfx="${k}" aria-label="Filter entfernen" style="height:20px;width:20px">${ic('x', 'i-xs')}</button></span>`).join('')}
        <select class="input select" data-ansf style="width:auto"><option value="">+ Statistikfilter …</option>${stActive('statistikfilter').map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select>
        <select class="input select" data-anfd style="width:auto"><option value="">+ Filter auf …</option>${AN_DIMS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    </div>
    <div data-anres>${AN.busy ? loadingCard('Werte') : AN.res ? anResultHTML(AN.res, AN.dims.filter(Boolean), AN.meas, AN.cust) : `<div class="card"><div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('chart')}</div><h3>Auswertung starten</h3><p>Dimensionen wählen und „Auswerten“ klicken. Ein Klick auf eine Zeile filtert darauf (Drill-down).</p></div></div>`}</div></div>`;
}
function anResultHTML(res, dims, meas, cust, opts = {}) {
  const custCols = stActive('analysespalte').filter(c => cust.includes(c.id));
  const M = AN_MEAS.filter(m => meas.includes(m[0])), tot = res.summe, key0 = M[0]?.[0] || 'umsatz';
  const rows = res.rows.slice().sort((a, b) => (b[AN.sort] ?? b.umsatz) - (a[AN.sort] ?? a.umsatz));
  const max = Math.max(1, ...rows.map(r => Math.abs(r[key0] || 0)));
  const share = CFG['analyse.anteil'] !== false && tot.umsatz;
  const head = `<tr>${dims.length ? dims.map((d, i) => `<th style="${i ? '' : 'padding-left:16px'}">${esc(AN_DIMS.find(x => x[0] === d)?.[1] || d)}</th>`).join('') : '<th style="padding-left:16px">Gesamt</th>'}${M.map(m => `<th class="r" ${opts.noSort ? '' : `data-ansort="${m[0]}" style="cursor:pointer"`}>${m[1]}${AN.sort === m[0] && !opts.noSort ? ' ▾' : ''}</th>`).join('')}${custCols.map(c => `<th class="r">${esc(c.name)}</th>`).join('')}${share ? '<th class="r">Anteil</th>' : ''}<th style="width:140px;padding-right:16px"></th></tr>`;
  const body = rows.slice(0, opts.limit || 1000).map(r => `<tr ${dims.length && !opts.noDrill ? `data-andrill='${esc(JSON.stringify(r.keys))}' style="cursor:pointer"` : ''}>${dims.length ? r.keys.map((k, i) => `<td style="${i ? '' : 'padding-left:16px'}">${i ? '' : '<b>'}${esc(anDimLabel(dims[i], k))}${i ? '' : '</b>'}</td>`).join('') : '<td style="padding-left:16px"><b>Gesamt</b></td>'}
    ${M.map(m => `<td class="r num" style="${anIndicator(m[0], r[m[0]])}">${anFmt(r[m[0]], m[2])}</td>`).join('')}${custCols.map(c => `<td class="r num">${anFmt(anFormula(c.formel, r), c.format)}</td>`).join('')}
    ${share ? `<td class="r num muted">${num(r.umsatz / tot.umsatz * 100, 1)} %</td>` : ''}<td style="padding-right:16px"><div style="height:8px;border-radius:4px;background:var(--surface-2)"><div style="height:8px;border-radius:4px;background:var(--accent);width:${Math.max(1, Math.abs(r[key0] || 0) / max * 100)}%"></div></div></td></tr>`).join('');
  const foot = `<tr style="font-weight:700;border-top:2px solid var(--line)"><td style="padding-left:16px" colspan="${Math.max(1, dims.length)}">Summe</td>${M.map(m => `<td class="r num">${anFmt(tot[m[0]], m[2])}</td>`).join('')}${custCols.map(c => `<td class="r num">${anFmt(anFormula(c.formel, tot), c.format)}</td>`).join('')}${share ? '<td class="r num">100 %</td>' : ''}<td></td></tr>`;
  return `${opts.noKpi ? '' : kpiCards([[eur0(tot.umsatz), 'Umsatz brutto'], [eur0(tot.netto), 'netto'], [eur0(tot.rohertrag), 'Rohertrag', tot.rohertrag < 0 ? 'neg' : 'pos'], [tot.netto ? num(tot.rohertrag / tot.netto * 100, 1) + ' %' : '–', 'Spanne'], [num(tot.menge), 'Stück'], [num(tot.bons), 'Bons'], [tot.bons ? eur(tot.umsatz / tot.bons) : '–', 'Ø Bon']])}
    <div class="card" style="overflow:auto">${rows.length ? `<table class="tbl" style="margin:0" data-antbl><thead>${head}</thead><tbody>${body}${foot}</tbody></table>${rows.length > (opts.limit || 1000) ? `<div class="muted" style="padding:10px 16px;font-size:12px">${num(rows.length - (opts.limit || 1000))} weitere Zeilen – Filter setzen</div>` : ''}` : '<div class="empty" style="padding:40px 20px"><h3>Keine Umsätze im Zeitraum</h3><p>Zeitraum oder Filter ändern.</p></div>'}</div>`;
}
function anCsv(res, dims, meas, cust) {
  const M = AN_MEAS.filter(m => meas.includes(m[0])), C = stActive('analysespalte').filter(c => cust.includes(c.id));
  const f = x => String(x).replace('.', ',');
  const lines = [[...(dims.length ? dims.map(d => AN_DIMS.find(x => x[0] === d)?.[1] || d) : ['Gesamt']), ...M.map(m => m[1]), ...C.map(c => c.name)].join(';')];
  res.rows.forEach(r => lines.push([...(dims.length ? r.keys.map((k, i) => `"${String(anDimLabel(dims[i], k)).replace(/"/g, '""')}"`) : ['Gesamt']), ...M.map(m => f(r[m[0]])), ...C.map(c => f(Math.round(anFormula(c.formel, r) * 100) / 100))].join(';')));
  return '﻿' + lines.join('\r\n');
}
async function anExec() {
  AN.busy = true; renderFlex();
  try { AN.res = await anRun(anParams()); } catch (e) { toast('Auswertung fehlgeschlagen', {t2: String(e), type: 'warn'}); }
  AN.busy = false; if (S.view === 'flexanalyse') renderFlex();
}
function anPrint(title, html) {
  const w = window.open('', '_blank', 'width=1000,height=800'); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:12px system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{padding:5px 8px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.kpis{display:flex;gap:18px;margin:10px 0 16px}.kpis .card{display:flex;flex-direction:column}.kpis b{font-size:16px}h1{font-size:18px;margin:0 0 4px}.muted{color:#777}</style></head><body><h1>${esc(title)}</h1><div class="muted">${esc(CFG['firma.name'] || '')} · erstellt ${new Date().toLocaleString('de-AT')}</div>${html}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}
async function anSaveVorlage(params, meas, cust, name0 = '') {
  await loadStamm();
  const el = openLayer(`<div class="modal" style="width:min(460px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('star')}</div><div><h2>Als Analyse-Vorlage speichern</h2><p>Erscheint unter Analyse › Flexanalyse Ansicht</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:12px"><label class="field"><span>Name</span><input class="input" data-avn value="${esc(name0)}" placeholder="z. B. Umsatz je Marke und Monat"></label>
    <label class="field"><span>Kategorie</span><select class="input select" data-avk>${stActive('analysekategorie').map(k => `<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Zeitraum beim Öffnen</span><select class="input select" data-avp>${[['fix', 'wie gespeichert (fest)'], ...AN_PER].map(([k, l]) => `<option value="${k}" ${k === AN.per ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-avgo>${ic('check', 'i-sm')}Speichern</button></div></div>`, {focus: '[data-avn]'});
  $('[data-avgo]', el).onclick = async () => {
    const name = $('[data-avn]', el).value.trim(); if (name.length < 2) return toast('Name fehlt', {type: 'warn'});
    const rows = stRows('analysevorlage').slice(), id = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 30) || uid().slice(0, 8);
    const r = {id, name, kategorie: $('[data-avk]', el).value, zeitraum: $('[data-avp]', el).value, params, meas, cust, _aktiv: true};
    const i = rows.findIndex(x => x.id === id); if (i >= 0) rows[i] = r; else rows.push(r);
    try { await stammSave('analysevorlage', rows); closeLayer(el); toast('Vorlage gespeichert', {t2: name, type: 'pos', icon: 'star'}); } catch (e) { toast('Nicht gespeichert', {t2: String(e), type: 'warn'}); }
  };
}
function bindFlex() {
  document.addEventListener('click', async e => {
    const v = e.target.closest('#view-flexanalyse'); if (!v) return;
    const b = e.target.closest('button, [data-andrill], th[data-ansort]'); if (!b) return;
    if (b.dataset.anx === 'run') return anExec();
    if (b.dataset.anx === 'save') return anSaveVorlage(anParams(), AN.meas, AN.cust, AN.name);
    if (b.dataset.anx === 'csv') { if (!AN.res) return toast('Erst auswerten', {type: 'warn'}); try { const p = await invoke('save_text', {name: `Flexanalyse_${AN.von}_${AN.bis}.csv`, content: anCsv(AN.res, AN.dims.filter(Boolean), AN.meas, AN.cust), title: 'Analyse exportieren'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Export fehlgeschlagen', {t2: String(err), type: 'warn'}); } return; }
    if (b.dataset.anx === 'print') { if (!AN.res) return toast('Erst auswerten', {type: 'warn'}); return anPrint(`Flexanalyse ${dDate(AN.von)} – ${dDate(AN.bis)}`, anResultHTML(AN.res, AN.dims.filter(Boolean), AN.meas, AN.cust, {noDrill: true, noSort: true})); }
    if (b.dataset.anfx) { delete AN.filter[b.dataset.anfx]; return anExec(); }
    if (b.dataset.ansort) { AN.sort = b.dataset.ansort; return renderFlex(); }
    if (b.dataset.andrill) {
      const keys = JSON.parse(b.dataset.andrill), dims = AN.dims.filter(Boolean);
      dims.forEach((d, i) => { AN.filter[d] = keys[i]; });
      // eine Ebene tiefer: nächste sinnvolle Dimension
      const next = ['warengruppe', 'marke', 'artikel', 'groesse', 'farbe'].find(d => !dims.includes(d) && !AN.filter[d]) || 'tag';
      AN.dims = [next]; return anExec();
    }
  });
  document.addEventListener('change', e => {
    const v = e.target.closest('#view-flexanalyse'); if (!v) return;
    const t = e.target;
    if (t.dataset.and != null) { AN.dims[+t.dataset.and] = t.value; AN.dims = AN.dims.slice(0, 3); return; }
    if (t.dataset.anm) { AN.meas = AN_MEAS.map(m => m[0]).filter(k => k === t.dataset.anm ? t.checked : AN.meas.includes(k)); if (AN.res) renderFlex(); return; }
    if (t.dataset.anc) { AN.cust = t.checked ? [...AN.cust, t.dataset.anc] : AN.cust.filter(x => x !== t.dataset.anc); if (AN.res) renderFlex(); return; }
    if (t.matches('[data-anv]')) { AN.von = t.value; AN.per = 'frei'; return; }
    if (t.matches('[data-anb]')) { AN.bis = t.value; AN.per = 'frei'; return; }
    if (t.matches('[data-ansf]') && t.value) { const f = stRows('statistikfilter').find(x => x.id === t.value); if (f) { AN.filter[f.dimension] = f.wert; anExec(); } return; }
    if (t.matches('[data-anfd]') && t.value) {
      const d = t.value; askFields(`Filter: ${AN_DIMS.find(x => x[0] === d)[1]}`, [{k: 'wert', l: d === 'warengruppe' ? 'Warengruppe (Kürzel, z. B. ski)' : d === 'wochentag' ? 'Wochentag (Mo … So)' : d === 'monat' ? 'Monat (JJJJ-MM)' : 'Wert (genau wie in der Auswertung)'}], {}).then(r => { if (r?.wert) { AN.filter[d] = r.wert.trim(); anExec(); } else renderFlex(); });
    }
  });
  document.addEventListener('click', e => { const s = e.target.closest('#view-flexanalyse [data-anper] button'); if (!s) return; AN.per = s.dataset.v; [AN.von, AN.bis] = anPeriod(AN.per); anExec(); });
}

/* ── Flexanalyse Ansicht & Vorlagen ── */
registerPage('flexanalyse-ansicht', {title: 'Flexanalyse Ansicht', sub: () => `${stRows('analysevorlage').length} gespeicherte Analysen`, render: renderFlexView});
registerPage('analyse-vorlagen', {title: 'Analyse-Vorlagen', sub: () => 'Gespeicherte Analysen verwalten', render: () => renderFlexView('analyse-vorlagen')});
VIEW_PERM['flexanalyse-ansicht'] = 'berichte'; VIEW_PERM['analyse-vorlagen'] = 'berichte';
const FAV = {sel: null, res: null};
const avPresets = [
  {id: '_WG', name: 'Umsatz je Warengruppe', kategorie: 'VK', zeitraum: 'monat', params: {dims: ['warengruppe']}, meas: ['menge', 'umsatz', 'rohertrag'], cust: ['SPANNE']},
  {id: '_MARKE', name: 'Marken nach Monat', kategorie: 'SORT', zeitraum: 'jahr', params: {dims: ['marke', 'monat']}, meas: ['menge', 'umsatz', 'rohertrag'], cust: []},
  {id: '_VK', name: 'Verkäufer:innen', kategorie: 'PERS', zeitraum: 'monat', params: {dims: ['verkaeufer']}, meas: ['umsatz', 'bons', 'rabatt'], cust: ['DBON', 'RABQ']},
  {id: '_STD', name: 'Umsatz je Stunde', kategorie: 'VK', zeitraum: 'monat', params: {dims: ['stunde']}, meas: ['umsatz', 'bons'], cust: ['DBON']},
  {id: '_TAG', name: 'Wochentage', kategorie: 'VK', zeitraum: 'jahr', params: {dims: ['wochentag']}, meas: ['umsatz', 'bons'], cust: ['DBON']},
];
async function renderFlexView(page = 'flexanalyse-ansicht') {
  const v = $('#view-' + page);
  if (!DESKTOP) { v.innerHTML = desktopEmpty('chart', 'Flexanalyse'); return; }
  await loadStamm();
  const own = stRows('analysevorlage'), all = [...own, ...avPresets], cats = stActive('analysekategorie');
  const manage = page === 'analyse-vorlagen';
  const sel = all.find(x => x.id === FAV.sel);
  v.innerHTML = `<div class="cv">${pageHead(manage ? 'Analyse-Vorlagen' : 'Flexanalyse Ansicht', manage ? 'Eigene Vorlagen umbenennen, Kategorie ändern, löschen – Standardvorlagen sind fest' : 'Gespeicherte Analysen mit einem Klick – im Designer anpassen', `<button class="btn btn-primary" data-goto="flexanalyse">${ic('plus', 'i-sm')}Neue Analyse</button>`)}
    <div style="display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);gap:16px;align-items:start">
      <div class="card">${[...cats, {id: '', name: 'Ohne Kategorie'}].map(c => { const l = all.filter(x => (x.kategorie || '') === c.id || (!c.id && !cats.some(k => k.id === x.kategorie))); return l.length ? `<div class="set-row" style="padding:10px 14px"><div class="set-l">${ic('folder', 'i-sm')} ${esc(c.name)}</div></div>${l.map(x => `<div style="display:flex;align-items:center"><button class="pal-i" data-avsel="${esc(x.id)}" aria-pressed="${x.id === FAV.sel}" style="height:40px;border-radius:0;flex:1;${x.id === FAV.sel ? 'background:var(--accent-soft)' : ''}"><span style="flex:1;text-align:left">${esc(x.name)}</span>${x.id.startsWith('_') ? '<span class="muted" style="font-size:11px">Standard</span>' : ''}</button>${manage && !x.id.startsWith('_') ? `<button class="btn btn-ghost btn-icon btn-sm" data-avren="${esc(x.id)}" aria-label="Umbenennen">${ic('edit', 'i-sm')}</button><button class="btn btn-ghost btn-icon btn-sm" data-avdel="${esc(x.id)}" aria-label="Löschen">${ic('trash', 'i-sm')}</button>` : ''}</div>`).join('')}` : ''; }).join('')}</div>
      <div data-avres>${sel ? (FAV.res ? `<div class="card" style="padding:12px 16px;margin-bottom:12px;display:flex;gap:10px;align-items:center"><b style="flex:1">${esc(sel.name)}</b><span class="muted">${dDate(FAV.res._von)} – ${dDate(FAV.res._bis)}</span><button class="btn btn-secondary btn-sm" data-avdes="${esc(sel.id)}">${ic('edit', 'i-sm')}Im Designer</button><button class="btn btn-secondary btn-sm" data-avprint>${ic('printer', 'i-sm')}Drucken</button></div>${anResultHTML(FAV.res, sel.params.dims || [], sel.meas || ['umsatz'], sel.cust || [], {noDrill: true, noSort: true})}` : loadingCard('Werte')) : `<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('chart')}</div><h3>Analyse wählen</h3><p>Links eine gespeicherte Analyse anklicken.</p></div></div>`}</div></div></div>`;
  if (sel && !FAV.res) {
    const [von, bis] = sel.zeitraum && sel.zeitraum !== 'fix' ? anPeriod(sel.zeitraum) : [sel.params.von, sel.params.bis];
    try { FAV.res = await anRun({...sel.params, von, bis}); FAV.res._von = von; FAV.res._bis = bis; } catch (e) { FAV.res = {rows: [], summe: {}, _von: von, _bis: bis}; toast('Auswertung fehlgeschlagen', {t2: String(e), type: 'warn'}); }
    if (S.view === page) renderFlexView(page);
  }
}
function bindFlexView() {
  document.addEventListener('click', async e => {
    const v = e.target.closest('#view-flexanalyse-ansicht, #view-analyse-vorlagen'); if (!v) return;
    const page = v.id.slice(5), b = e.target.closest('button'); if (!b) return;
    const all = [...stRows('analysevorlage'), ...avPresets];
    if (b.dataset.avsel) { FAV.sel = b.dataset.avsel; FAV.res = null; return renderFlexView(page); }
    if (b.dataset.avdes) { const x = all.find(y => y.id === b.dataset.avdes); Object.assign(AN, {dims: [...(x.params.dims || [])], meas: [...(x.meas || [])], cust: [...(x.cust || [])], filter: {...(x.params.filter || {})}, name: x.name, per: x.zeitraum || 'monat', von: null, bis: null, res: null}); go('flexanalyse'); anExec(); return; }
    if (b.dataset.avprint != null) { const x = all.find(y => y.id === FAV.sel); return anPrint(x.name, anResultHTML(FAV.res, x.params.dims || [], x.meas || [], x.cust || [], {noDrill: true, noSort: true})); }
    if (b.dataset.avdel) { if (!await confirmBox('Vorlage löschen?', 'Löschen')) return; await stammSave('analysevorlage', stRows('analysevorlage').filter(x => x.id !== b.dataset.avdel)); return renderFlexView(page); }
    if (b.dataset.avren) { const rows = stRows('analysevorlage').map(x => ({...x})), x = rows.find(y => y.id === b.dataset.avren); const r = await askFields('Vorlage bearbeiten', [{k: 'name', l: 'Name', def: () => x.name}, {k: 'kategorie', l: 'Kategorie', t: 'select', o: stActive('analysekategorie').map(k => k.id)}], {}); if (!r) return; x.name = r.name || x.name; x.kategorie = r.kategorie; await stammSave('analysevorlage', rows); renderFlexView(page); }
  });
}

/* ── Report Zeitsteuerung ── */
async function runReportPlans(force) {
  if (!DESKTOP) return 0;
  await loadStamm();
  const plans = stRows('reportplan').map(r => ({...r})); let n = 0;
  const days = {taeglich: 1, woechentlich: 7, monatlich: 28};
  for (const p of plans.filter(x => x._aktiv !== false)) {
    const last = p.letzter ? new Date(p.letzter) : null;
    if (!force && last && (Date.now() - last) / 864e5 < (days[p.intervall] || 1) - 0.05) continue;
    if (!force && p.intervall === 'woechentlich' && new Date().getDay() !== 1 && last) continue;
    if (!force && p.intervall === 'monatlich' && new Date().getDate() !== 1 && last) continue;
    const t = [...stRows('analysevorlage'), ...avPresets].find(x => x.id === p.vorlage); if (!t || !p.empfaenger) continue;
    const [von, bis] = anPeriod(p.intervall === 'taeglich' ? 'gestern' : p.intervall === 'woechentlich' ? 'vorwoche' : 'vormonat');
    try {
      const res = await anRun({...t.params, von, bis});
      const html = `<div style="font-family:system-ui,sans-serif;font-size:13px"><h2 style="font-size:17px">${esc(t.name)}</h2><p style="color:#666">${dDate(von)} – ${dDate(bis)} · ${esc(CFG['firma.name'] || '')}</p>${anResultHTML(res, t.params.dims || [], t.meas || ['umsatz'], t.cust || [], {noDrill: true, noSort: true}).replace(/class="tbl"/g, 'style="border-collapse:collapse" cellpadding="5" border="1"')}</div>`;
      for (const to of String(p.empfaenger).split(/[,; ]+/).filter(x => x.includes('@'))) await invoke('mail_send', {to, subject: `Kontor-Bericht: ${t.name} (${dDate(von)} – ${dDate(bis)})`, html, text: `${t.name}\n${dDate(von)} – ${dDate(bis)}\nUmsatz ${eur(res.summe.umsatz)} · Rohertrag ${eur(res.summe.rohertrag)}`, qr: null, purpose: 'bericht'});
      p.letzter = new Date().toISOString(); n++; Hooks.emit('report.sent', {bericht: p.name, empfaenger: p.empfaenger});
    } catch (e) { Hooks.emit('report.failed', {bericht: p.name, fehler: String(e)}); }
  }
  if (n) await stammSave('reportplan', plans);
  return n;
}
// „Jetzt senden“ auf der Stammdaten-Seite
{ const _rs = renderStamm; renderStamm = async function (kind, page, extra = {}) {
  if (kind === 'reportplan' && !extra.above) extra = {...extra, above: () => `<div class="card" style="padding:12px 16px;margin-bottom:12px;display:flex;gap:10px;align-items:center">${ic('info', 'i-sm')}<span style="flex:1;font-size:13px">Läuft als Hintergrundjob „Geplante Berichte“ – solange Kontor geöffnet ist. Versand über die E-Mail-Einstellungen.</span><button class="btn btn-secondary btn-sm" data-rpnow>${ic('mail', 'i-sm')}Alle jetzt senden</button></div>`};
  return _rs(kind, page, extra);
}; }
document.addEventListener('click', async e => { if (!e.target.closest('[data-rpnow]')) return; try { const n = await runReportPlans(true); toast(n ? `${n} Bericht${n === 1 ? '' : 'e'} versendet` : 'Nichts versendet', {t2: n ? '' : 'Vorlage und Empfänger prüfen', type: n ? 'pos' : 'warn', icon: 'mail'}); STE.reportplan = null; renderStamm('reportplan', 'st-reportplan'); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } });

/* ── Fertige Auswertungen ── */
function anSimplePage(id, title, sub, dims, meas, cust = [], per = 'jahr') {
  const st = {per, res: null};
  registerPage(id, {title, sub: () => sub, render: async () => {
    const v = $('#view-' + id);
    if (!DESKTOP) { v.innerHTML = desktopEmpty('chart', title); return; }
    await loadStamm();
    const [von, bis] = anPeriod(st.per);
    v.innerHTML = `<div class="cv">${pageHead(title, sub, `<button class="btn btn-secondary" data-asp="${id}">${ic('printer', 'i-sm')}Drucken</button>`)}<div class="filters"><div class="seg" data-asper="${id}">${AN_PER.map(([k, l]) => `<button data-v="${k}" aria-pressed="${st.per === k}">${l}</button>`).join('')}</div><span class="muted">${dDate(von)} – ${dDate(bis)}</span></div><div data-asr>${loadingCard('Werte')}</div></div>`;
    initSeg($(`[data-asper="${id}"]`, v), b => { st.per = b.dataset.v; PAGES[id].render(); });
    try { st.res = await anRun({von, bis, dims}); } catch (e) { $('[data-asr]', v).innerHTML = `<div class="card" style="padding:16px">${esc(String(e))}</div>`; return; }
    const box = $('[data-asr]', v); if (box) box.innerHTML = anResultHTML(st.res, dims, meas, cust, {noDrill: true, noSort: true});
    $(`[data-asp="${id}"]`, v).onclick = () => anPrint(title, anResultHTML(st.res, dims, meas, cust, {noDrill: true, noSort: true}));
  }});
  VIEW_PERM[id] = 'berichte';
}
anSimplePage('an-groessen', 'Größen-Auswertung', 'Abverkauf je Warengruppe und Größe – für die Größenaufteilung in der Order', ['warengruppe', 'groesse'], ['menge', 'umsatz', 'rohertrag']);
anSimplePage('an-preislagen', 'Preislagen-Auswertung', 'Umsatz und Spanne je Preislage – wo liegt der Schwerpunkt des Sortiments?', ['preislage', 'warengruppe'], ['menge', 'umsatz', 'rohertrag'], ['SPANNE']);

/* Artikel Filialmanagement: Bestand je Filiale */
registerPage('an-filialbestand', {title: 'Artikel Filialmanagement', sub: () => `${STORES.length} Filiale${STORES.length === 1 ? '' : 'n'}`, render: renderFilialBestand});
VIEW_PERM['an-filialbestand'] = 'berichte';
const AFB = {q: '', only: 'alle'};
function renderFilialBestand() {
  const v = $('#view-an-filialbestand'), stores = STORES, n = norm(AFB.q);
  const rows = ART.filter(a => !n || a.hay.includes(n)).map(a => {
    const own = a.variants.reduce((s, x) => s + x.q, 0);
    const others = OTHER_STORES.map((s, i) => a.variants.reduce((t, x) => t + (x.other?.[i] || 0), 0));
    return {a, per: [own, ...others], sum: own + others.reduce((x, y) => x + y, 0)};
  }).filter(r => AFB.only === 'alle' || (AFB.only === 'ungleich' && r.per.length > 1 && Math.max(...r.per) > 3 * Math.max(1, Math.min(...r.per))) || (AFB.only === 'fehlt' && r.per.some(x => x <= 0)));
  v.innerHTML = `<div class="cv">${pageHead('Artikel Filialmanagement', stores.length > 1 ? 'Bestand je Artikel und Filiale – Ungleichgewichte erkennen und umlagern' : 'Einzelplatz – mit Filialverbund (System › Filialverbund) erscheinen hier alle Filialen', `<button class="btn btn-secondary" data-goto="ul-planung">${ic('swap', 'i-sm')}Umlagerung planen</button>`)}
    <div class="filters"><input class="input" data-afbq value="${esc(AFB.q)}" placeholder="Artikel suchen …" style="max-width:300px"><div class="seg" data-afbs>${[['alle', 'Alle'], ['ungleich', 'ungleich verteilt'], ['fehlt', 'in einer Filiale ausverkauft']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${AFB.only === k}">${l}</button>`).join('')}</div></div>
    <div class="card" style="overflow:auto"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Artikel</th>${stores.map(s => `<th class="r">${esc(s.name || s.id)}</th>`).join('')}<th class="r" style="padding-right:16px">Summe</th></tr></thead><tbody>${rows.slice(0, 400).map(r => `<tr data-aiopen="${esc(r.a.id)}" style="cursor:pointer"><td style="padding-left:16px"><b>${esc(r.a.name)}</b><div class="muted" style="font-size:12px">${esc(r.a.brand)} · ${esc(r.a.id)}</div></td>${r.per.map(x => `<td class="r num" style="${x <= 0 ? 'color:var(--neg)' : ''}">${x}</td>`).join('')}<td class="r num" style="padding-right:16px;font-weight:650">${r.sum}</td></tr>`).join('')}</tbody></table></div></div>`;
  initSeg($('[data-afbs]', v), b => { AFB.only = b.dataset.v; renderFilialBestand(); });
  $('[data-afbq]', v).onchange = e => { AFB.q = e.target.value; renderFilialBestand(); };
}

/* NOS Filialliste */
registerPage('an-nos-filialen', {title: 'NOS Filialliste', sub: () => `${nosList().length} Sortimente`, render: () => {
  const v = $('#view-an-nos-filialen'), stores = STORES;
  const items = nosList().filter(x => x.aktiv !== false).flatMap(n => (n.items || []).map(it => ({n, it, x: findEan(it.ean)}))).filter(r => r.x);
  v.innerHTML = `<div class="cv">${pageHead('NOS Filialliste', 'Never-out-of-Stock-Artikel mit Soll und Ist je Filiale', `<button class="btn btn-secondary" data-goto="nos">${ic('star', 'i-sm')}NOS Sortimente</button>`)}
    ${items.length ? `<div class="card" style="overflow:auto"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Sortiment</th><th>Artikel</th><th class="r">Soll</th>${stores.map(s => `<th class="r">${esc(s.name || s.id)}</th>`).join('')}</tr></thead><tbody>${items.map(r => { const per = [r.x.v.q, ...(r.x.v.other || [])]; return `<tr><td style="padding-left:16px" class="muted">${esc(r.n.name)}</td><td><b>${esc(r.x.a.name)}</b> <span class="muted">${esc(vname(r.x.v))}</span></td><td class="r num">${r.it.soll}</td>${stores.map((s, i) => `<td class="r num" style="font-weight:600;color:${(per[i] ?? 0) < +r.it.soll ? 'var(--warn)' : 'var(--pos)'}">${per[i] ?? '–'}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>` : `<div class="card"><div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('star')}</div><h3>Keine NOS-Artikel</h3><p>Unter Artikel › Bestand › NOS Sortimente anlegen.</p></div></div>`}</div>`;
}});

/* Artikel-Info-Bericht */
const AIB = {res30: null, res90: null, cat: 'alle', loading: false};
registerPage('an-artikelbericht', {title: 'Artikel-Info-Bericht', sub: () => 'Abverkauf, Reichweite und Spanne je Artikel', render: renderArtBericht});
VIEW_PERM['an-artikelbericht'] = 'berichte';
async function renderArtBericht() {
  const v = $('#view-an-artikelbericht');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('chart', 'Artikel-Info-Bericht'); return; }
  if (!AIB.res30) {
    v.innerHTML = `<div class="cv">${pageHead('Artikel-Info-Bericht', 'Lade Abverkauf …')}${loadingCard('Werte')}</div>`;
    try { [AIB.res30, AIB.res90] = await Promise.all([anRun({von: anPeriod('30')[0], bis: today(), dims: ['artikel']}), anRun({von: anPeriod('90')[0], bis: today(), dims: ['artikel']})]); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:16px">${esc(String(e))}</div></div>`; return; }
  }
  const sold = (res, a) => res.rows.filter(r => r.keys[0].startsWith(a.id + ' ')).reduce((s, r) => s + r.menge, 0);
  const rows = ART.filter(a => AIB.cat === 'alle' || a.cat === AIB.cat).map(a => { const st = a.variants.reduce((s, x) => s + x.q, 0), s30 = sold(AIB.res30, a), s90 = sold(AIB.res90, a), vk = a.sale || a.price; return {a, st, s30, s90, reich: s30 ? Math.round(st / (s30 / 30)) : null, quote: s90 + st ? s90 / (s90 + st) * 100 : 0, spanne: a.cost != null ? (vk / (1 + (a.vat ?? 20) / 100) - a.cost) / (vk / (1 + (a.vat ?? 20) / 100)) * 100 : null}; }).sort((x, y) => y.s90 - x.s90);
  const html = `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Artikel</th><th class="r">VK</th><th class="r">Bestand</th><th class="r">verk. 30 T</th><th class="r">verk. 90 T</th><th class="r">Abverkauf 90 T</th><th class="r">Reichweite</th><th class="r" style="padding-right:16px">Spanne</th></tr></thead><tbody>${rows.map(r => `<tr data-aiopen="${esc(r.a.id)}" style="cursor:pointer"><td style="padding-left:16px"><b>${esc(r.a.name)}</b><div class="muted" style="font-size:12px">${esc(r.a.brand)} · ${esc(r.a.id)}</div></td><td class="r num">${eur(r.a.sale || r.a.price)}</td><td class="r num">${r.st}</td><td class="r num">${num(r.s30)}</td><td class="r num">${num(r.s90)}</td><td class="r num" style="color:${r.quote >= 50 ? 'var(--pos)' : r.quote < 15 ? 'var(--neg)' : 'inherit'}">${num(r.quote, 0)} %</td><td class="r num" style="color:${r.reich != null && r.reich < 14 ? 'var(--warn)' : 'inherit'}">${r.reich != null ? r.reich + ' T' : '–'}</td><td class="r num" style="padding-right:16px">${r.spanne != null ? num(r.spanne, 1) + ' %' : '–'}</td></tr>`).join('')}</tbody></table>`;
  v.innerHTML = `<div class="cv">${pageHead('Artikel-Info-Bericht', 'Abverkauf der letzten 30/90 Tage, Abverkaufsquote, Reichweite und Spanne – Klick öffnet die Artikelinfo', `<button class="btn btn-secondary" data-aibr>${ic('sync', 'i-sm')}Neu berechnen</button><button class="btn btn-secondary" data-aibp>${ic('printer', 'i-sm')}Drucken</button>`)}
    <div class="filters"><select class="input select" data-aibc style="width:auto">${CATS.map(c => `<option value="${c.id}" ${c.id === AIB.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><div class="card" style="overflow:auto">${html}</div></div>`;
  $('[data-aibc]', v).onchange = e => { AIB.cat = e.target.value; renderArtBericht(); };
  $('[data-aibr]', v).onclick = () => { AIB.res30 = null; renderArtBericht(); };
  $('[data-aibp]', v).onclick = () => anPrint('Artikel-Info-Bericht', html);
}

/* Intrastat: Wareneingänge aus EU-Ländern je Zolltarifnummer */
registerPage('an-intrastat', {title: 'Intrastat Auswertung', sub: () => 'Innergemeinschaftliche Wareneingänge', render: renderIntrastat});
VIEW_PERM['an-intrastat'] = 'berichte';
const IS = {mon: dIso(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)).slice(0, 7), data: null};
async function renderIntrastat() {
  const v = $('#view-an-intrastat');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('globe', 'Intrastat'); return; }
  await loadStamm(); await loadSuppliers();
  v.innerHTML = `<div class="cv">${pageHead('Intrastat Auswertung', 'Lade Wareneingänge …')}${loadingCard('Lade')}</div>`;
  let moves = [];
  try { moves = (await invoke('stock_moves', {articleId: null, limit: 50000})).filter(m => m.delta > 0 && /wareneingang|avis|bestellung|einbuch/i.test(m.reason || '') && String(m.ts).startsWith(IS.mon)); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:16px">${esc(String(e))}</div></div>`; return; }
  const lands = CFG['intrastat.laender'] || {}, eu = new Set(stActive('land').filter(l => l.eu).map(l => l.id)), home = 'AT';
  const agg = {};
  for (const m of moves) {
    const a = artById(m.article_id); if (!a) continue;
    const land = SUPPLIERS_ALL.find(x => x.id === a.supplierId)?.country || lands[a.supplierId] || '';
    if (!land || !eu.has(land) || land === home) continue;
    const wg = stRows('warengruppe').find(x => x.id === a.cat);
    const tarif = a.fields?.Zolltarifnummer || a.fields?.Zolltarif || wg?.zolltarif || '–';
    const kg = parseFloat(String(a.fields?.Gewicht || '').replace(',', '.')) / (/kg/i.test(a.fields?.Gewicht || '') ? 1 : 1000) || +CFG['intrastat.ware_kg'] || 0.5;
    const k = `${land}|${tarif}`; const x = agg[k] ||= {land, tarif, menge: 0, wert: 0, kg: 0, arts: new Set()};
    x.menge += m.delta; x.wert += m.delta * (a.cost || 0); x.kg += m.delta * kg; x.arts.add(a.name);
  }
  const rows = Object.values(agg).sort((a, b) => b.wert - a.wert), sum = rows.reduce((s, r) => s + r.wert, 0);
  const tbl = `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Versendungsland</th><th>Warennummer (KN8)</th><th>Art des Geschäfts</th><th class="r">Menge</th><th class="r">Eigenmasse kg</th><th class="r" style="padding-right:16px">Rechnungsbetrag</th></tr></thead><tbody>${rows.map(r => `<tr><td style="padding-left:16px"><b>${esc(r.land)}</b> <span class="muted">${esc(stName('land', r.land))}</span></td><td class="mono">${esc(r.tarif)}<div class="muted" style="font-size:11.5px">${esc([...r.arts].slice(0, 3).join(', '))}</div></td><td>11 (Kauf)</td><td class="r num">${num(r.menge)}</td><td class="r num">${num(Math.round(r.kg * 10) / 10)}</td><td class="r num" style="padding-right:16px">${eur(r.wert)}</td></tr>`).join('')}</tbody></table>`;
  v.innerHTML = `<div class="cv">${pageHead('Intrastat Auswertung', 'Eingänge aus anderen EU-Staaten je Land und Zolltarifnummer (Feld „Zolltarifnummer“ am Artikel oder an der Warengruppe; Gewicht aus Feld „Gewicht“)', `<button class="btn btn-secondary" data-isp>${ic('printer', 'i-sm')}Drucken</button><button class="btn btn-secondary" data-isx>${ic('upload', 'i-sm')}CSV</button>`)}
    <div class="filters"><input class="input" type="month" data-ism value="${IS.mon}" style="width:auto"><span class="muted">${num(moves.length)} Eingangsbuchungen · Schwelle Eingänge AT: € 1.100.000 p. a.</span></div>
    ${kpiCards([[eur0(sum), 'Rechnungsbetrag EU-Eingänge'], [num(rows.length), 'Meldezeilen'], [num(rows.reduce((s, r) => s + r.menge, 0)), 'Stück']])}
    <div class="card" style="margin-bottom:14px"><div class="set-row"><div><div class="set-l">Versendungsland je Lieferant</div><div class="set-h">Das Land des Lieferanten (Stammdaten › Lieferanten › Allgemein) gilt als Versendungsland; Lieferanten aus Österreich und aus Nicht-EU-Ländern werden nicht gemeldet.</div></div><div class="set-c"><button class="btn btn-secondary btn-sm" data-isgo>${ic('building', 'i-sm')}Lieferanten öffnen</button></div></div><div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 14px">${Object.entries(SUPPLIERS_ALL.reduce((m, s) => { const k = s.country || 'AT'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort().map(([k, n]) => `<span class="pill ${eu.has(k) && k !== home ? 'info' : ''}" style="height:24px">${esc(landName(k))}: ${n} ${n === 1 ? 'Lieferant' : 'Lieferanten'}</span>`).join('')}</div></div>
    <div class="card" style="overflow:auto">${rows.length ? tbl : '<div class="empty" style="padding:40px 20px"><h3>Keine meldepflichtigen Eingänge</h3><p>Monat wählen und Versendungsland der Lieferanten festlegen.</p></div>'}</div></div>`;
  $('[data-ism]', v).onchange = e => { IS.mon = e.target.value; renderIntrastat(); };
  $('[data-isgo]', v).onclick = () => go('lieferanten');
  $('[data-isp]', v).onclick = () => anPrint(`Intrastat ${IS.mon}`, tbl);
  $('[data-isx]', v).onclick = async () => { const csv = '﻿Land;Warennummer;Geschäftsart;Menge;Eigenmasse kg;Rechnungsbetrag\r\n' + rows.map(r => [r.land, r.tarif, 11, r.menge, String(Math.round(r.kg * 10) / 10).replace('.', ','), String(Math.round(r.wert * 100) / 100).replace('.', ',')].join(';')).join('\r\n'); try { const p = await invoke('save_text', {name: `Intrastat_${IS.mon}.csv`, content: csv, title: 'Intrastat exportieren'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Export fehlgeschlagen', {t2: String(err), type: 'warn'}); } };
}

/* Artikelliste (Druck/CSV mit wählbaren Spalten) */
const AL = {cols: ['id', 'name', 'brand', 'cat', 'price', 'stock'], cat: 'alle', q: ''};
const AL_COLS = [['id', 'Artikel-Nr.', a => a.id], ['name', 'Bezeichnung', a => a.name], ['brand', 'Marke', a => a.brand], ['cat', 'Warengruppe', a => catName(a.cat)], ['supplier', 'Lieferant', a => supName(a.supplierId)], ['hersteller', 'Hersteller (GPSR)', a => mkArtikelInfo(a.brand).hersteller], ['hersteller_anschrift', 'Herstelleranschrift', a => mkArtikelInfo(a.brand).anschrift], ['eu_verantwortlicher', 'Verantwortlicher in der EU', a => mkArtikelInfo(a.brand).eu], ['gpsr', 'GPSR-Angaben', a => mkStufeText(mkArtikelInfo(a.brand).stufe)], ['price', 'VK', a => eur(a.price)], ['sale', 'Aktionspreis', a => a.sale ? eur(a.sale) : ''], ['cost', 'EK', a => a.cost != null ? eur(a.cost) : ''], ['stock', 'Bestand', a => a.variants.reduce((s, x) => s + x.q, 0)], ['value', 'Lagerwert EK', a => a.cost != null ? eur(a.cost * a.variants.reduce((s, x) => s + x.q, 0)) : ''], ['sizes', 'Größen', a => a.sizes.join(' ')], ['colors', 'Farben', a => a.colors.map(colorName).join(', ')], ['season', 'Saison', a => a.fields?.Saison || ''], ['eans', 'EANs', a => a.variants.length]];
registerPage('an-artikelliste', {title: 'Artikelliste', sub: () => `${ART.length} Artikel`, render: async () => { try { await Promise.all([loadStamm(), mkLoad()]); } catch { /* */ } renderArtListe(); }});
function renderArtListe() {
  const v = $('#view-an-artikelliste'), n = norm(AL.q), C = AL_COLS.filter(c => AL.cols.includes(c[0]));
  const rows = ART.filter(a => (AL.cat === 'alle' || a.cat === AL.cat) && (!n || a.hay.includes(n)));
  const tbl = `<table class="tbl" style="margin:0"><thead><tr>${C.map((c, i) => `<th class="${['price', 'sale', 'cost', 'stock', 'value'].includes(c[0]) ? 'r' : ''}" style="${i ? '' : 'padding-left:16px'}">${c[1]}</th>`).join('')}</tr></thead><tbody>${rows.map(a => `<tr>${C.map((c, i) => `<td class="${['price', 'sale', 'cost', 'stock', 'value'].includes(c[0]) ? 'r num' : ''}" style="${i ? '' : 'padding-left:16px'}">${esc(String(c[2](a)))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  v.innerHTML = `<div class="cv">${pageHead('Artikelliste', 'Spalten wählen, filtern, drucken oder als CSV exportieren', `<button class="btn btn-secondary" data-alp>${ic('printer', 'i-sm')}Drucken</button><button class="btn btn-secondary" data-alx>${ic('upload', 'i-sm')}CSV</button>`)}
    <div class="filters"><input class="input" data-alq value="${esc(AL.q)}" placeholder="Suchen …" style="max-width:260px"><select class="input select" data-alc style="width:auto">${CATS.map(c => `<option value="${c.id}" ${c.id === AL.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${AL_COLS.map(c => `<label class="chip" style="cursor:pointer"><input type="checkbox" data-alcol="${c[0]}" ${AL.cols.includes(c[0]) ? 'checked' : ''} style="margin:0 6px 0 0">${c[1]}</label>`).join('')}</div>
    <div class="card" style="overflow:auto">${tbl}</div></div>`;
  $('[data-alq]', v).onchange = e => { AL.q = e.target.value; renderArtListe(); };
  $('[data-alc]', v).onchange = e => { AL.cat = e.target.value; renderArtListe(); };
  $$('[data-alcol]', v).forEach(c => { c.onchange = () => { AL.cols = AL_COLS.map(x => x[0]).filter(k => k === c.dataset.alcol ? c.checked : AL.cols.includes(k)); renderArtListe(); }; });
  $('[data-alp]', v).onclick = () => anPrint('Artikelliste', tbl);
  $('[data-alx]', v).onclick = async () => { const csv = '﻿' + [C.map(c => c[1]).join(';'), ...rows.map(a => C.map(c => `"${String(c[2](a)).replace(/"/g, '""')}"`).join(';'))].join('\r\n'); try { const p = await invoke('save_text', {name: 'Artikelliste.csv', content: csv, title: 'Artikelliste exportieren'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Export fehlgeschlagen', {t2: String(err), type: 'warn'}); } };
}

/* Feste Rabatte (Auswertung der gewährten Rabatte nach Grund) */
const FRA = {per: 'monat'};
registerPage('an-rabatte', {title: 'Feste Rabatte – Auswertung', sub: () => 'Gewährte Rabatte nach Grund und Person', render: async () => {
  const v = $('#view-an-rabatte');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('percent', 'Rabatt-Auswertung'); return; }
  const [von, bis] = anPeriod(FRA.per);
  v.innerHTML = `<div class="cv">${pageHead('Feste Rabatte – Auswertung', 'Alle Positions- und Bonrabatte im Zeitraum, gruppiert nach Grund (feste Rabatte, Aktionen, manuell)', `<button class="btn btn-secondary" data-goto="st-festerrabatt">${ic('sliders', 'i-sm')}Feste Rabatte pflegen</button>`)}<div class="filters"><div class="seg" data-frap>${AN_PER.map(([k, l]) => `<button data-v="${k}" aria-pressed="${FRA.per === k}">${l}</button>`).join('')}</div></div><div data-frr>${loadingCard('Lade')}</div></div>`;
  initSeg($('[data-frap]', v), b => { FRA.per = b.dataset.v; PAGES['an-rabatte'].render(); });
  let sales = []; try { sales = (await invoke('sales_list', {limit: 20000})).filter(s => (s.kind || 'verkauf') === 'verkauf' && !s.data?.voided && s.ts.slice(0, 10) >= von && s.ts.slice(0, 10) <= bis); } catch { /* */ }
  const g = {};
  for (const s of sales) {
    const d = s.data || {};
    for (const l of d.lines || []) if (l.disc?.pct) { const amt = (l.unit || 0) * (l.qty || 0) * l.disc.pct / 100, k = l.disc.reason || 'ohne Grund'; const x = g[k] ||= {n: 0, amt: 0, by: {}, fix: fixDisc().some(f => f.name === k)}; x.n++; x.amt += amt; x.by[s.cashier || '–'] = (x.by[s.cashier || '–'] || 0) + amt; }
    if (d.billDisc?.pct) { const base = (d.lines || []).reduce((t, l) => t + (l.unit || 0) * (l.qty || 0) * (1 - (l.disc?.pct || 0) / 100), 0), amt = base * d.billDisc.pct / 100, k = d.billDisc.reason || 'Bonrabatt'; const x = g[k] ||= {n: 0, amt: 0, by: {}, fix: fixDisc().some(f => f.name === k)}; x.n++; x.amt += amt; x.by[s.cashier || '–'] = (x.by[s.cashier || '–'] || 0) + amt; }
  }
  const rows = Object.entries(g).sort((a, b) => b[1].amt - a[1].amt), tot = rows.reduce((s, [, x]) => s + x.amt, 0);
  $('[data-frr]', v).innerHTML = `${kpiCards([[eur0(tot), 'Rabatte gesamt'], [num(rows.reduce((s, [, x]) => s + x.n, 0)), 'Rabattierungen'], [num(sales.length), 'Bons im Zeitraum']])}<div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Grund</th><th class="r">Anzahl</th><th class="r">Betrag</th><th>nach Person</th></tr></thead><tbody>${rows.map(([k, x]) => `<tr><td style="padding-left:16px"><b>${esc(k)}</b> ${x.fix ? '<span class="pill accent" style="height:20px">fester Rabatt</span>' : ''}</td><td class="r num">${x.n}</td><td class="r num">${eur(x.amt)}</td><td class="muted" style="font-size:12.5px">${Object.entries(x.by).sort((a, b) => b[1] - a[1]).map(([p, a]) => `${esc(p)} ${eur0(a)}`).join(' · ')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:40px 20px"><h3>Keine Rabatte im Zeitraum</h3></div>'}</div>`;
}});
VIEW_PERM['an-rabatte'] = 'berichte';

/* Verkäuferprämien-Abrechnung */
const PRM = {mon: today().slice(0, 7)};
registerPage('praemien', {title: 'Prämienabrechnung', sub: () => PRM.mon, render: async () => {
  const v = $('#view-praemien');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('target', 'Prämien'); return; }
  await loadStamm();
  const [y, m] = PRM.mon.split('-').map(Number), von = `${PRM.mon}-01`, bis = dIso(new Date(y, m, 0));
  v.innerHTML = `<div class="cv">${pageHead('Prämienabrechnung', 'Verkäuferprämien je Monat aus Prämienschlüsseln (je Warengruppe) und Monatszielen', `<button class="btn btn-secondary" data-goto="st-praemienschluessel">${ic('sliders', 'i-sm')}Prämienschlüssel</button><button class="btn btn-secondary" data-goto="st-praemienmonat">${ic('calendar', 'i-sm')}Monate & Ziele</button>`)}<div class="filters"><input class="input" type="month" data-prmm value="${PRM.mon}" style="width:auto"></div><div data-prmr>${loadingCard('Rechne')}</div></div>`;
  $('[data-prmm]', v).onchange = e => { PRM.mon = e.target.value; PAGES.praemien.render(); };
  let res; try { res = await anRun({von, bis, dims: ['verkaeufer', 'warengruppe']}); } catch (e) { $('[data-prmr]', v).innerHTML = `<div class="card" style="padding:16px">${esc(String(e))}</div>`; return; }
  const keys = stActive('praemienschluessel'), mon = stActive('praemienmonat').find(x => x.name === PRM.mon || x.id === PRM.mon);
  const per = {};
  for (const r of res.rows) { const [p, wg] = r.keys; const x = per[p] ||= {umsatz: 0, praemie: 0, det: []}; x.umsatz += r.umsatz; const k = keys.find(z => z.warengruppe === wg); if (k) { const pr = r.netto * (+k.pct || 0) / 100; x.praemie += pr; x.det.push(`${catName(wg)} ${num(+k.pct)} %`); } }
  Object.values(per).forEach(x => { x.ziel = mon ? +mon.ziel || 0 : 0; x.bonus = mon && x.umsatz > x.ziel ? (x.umsatz - x.ziel) * (+mon.pct || 0) / 100 : 0; });
  const rows = Object.entries(per).sort((a, b) => b[1].umsatz - a[1].umsatz);
  const tbl = `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Verkäufer:in</th><th class="r">Umsatz</th><th class="r">Ziel</th><th class="r">Zielerreichung</th><th class="r">Prämie Warengruppen</th><th class="r">Bonus über Ziel</th><th class="r" style="padding-right:16px">Summe</th></tr></thead><tbody>${rows.map(([p, x]) => `<tr><td style="padding-left:16px"><b>${esc(p || '–')}</b><div class="muted" style="font-size:11.5px">${esc([...new Set(x.det)].join(' · '))}</div></td><td class="r num">${eur(x.umsatz)}</td><td class="r num">${x.ziel ? eur0(x.ziel) : '–'}</td><td class="r num" style="color:${x.ziel && x.umsatz >= x.ziel ? 'var(--pos)' : 'inherit'}">${x.ziel ? num(x.umsatz / x.ziel * 100, 0) + ' %' : '–'}</td><td class="r num">${eur(x.praemie)}</td><td class="r num">${eur(x.bonus)}</td><td class="r num" style="padding-right:16px;font-weight:700">${eur(x.praemie + x.bonus)}</td></tr>`).join('')}</tbody></table>`;
  $('[data-prmr]', v).innerHTML = `${kpiCards([[eur0(rows.reduce((s, [, x]) => s + x.praemie + x.bonus, 0)), 'Prämien gesamt'], [num(rows.length), 'Personen'], [mon ? eur0(+mon.ziel || 0) : 'kein Ziel', 'Monatsziel je Person']])}<div class="card" style="overflow:auto">${rows.length ? tbl : '<div class="empty" style="padding:40px 20px"><h3>Keine Umsätze im Monat</h3></div>'}</div><div style="margin-top:12px"><button class="btn btn-secondary" data-prmp>${ic('printer', 'i-sm')}Drucken</button></div>`;
  $('[data-prmp]', v).onclick = () => anPrint(`Prämienabrechnung ${PRM.mon}`, tbl);
}});
VIEW_PERM.praemien = 'berichte';

/* Altersbewertung des Lagers */
registerPage('altersbewertung', {title: 'Altersbewertung', sub: () => 'Lagerwert nach Alter', render: async () => {
  const v = $('#view-altersbewertung'); await loadStamm();
  const stufen = stActive('altersbewertung').slice().sort((a, b) => (+a.ab || 0) - (+b.ab || 0)), sais = stRows('saison');
  const monthsOf = a => { const s = sais.find(x => x.id === a.fields?.Saison || x.name === a.fields?.Saison); const d = s?.von ? new Date(s.von) : null; return d ? Math.max(0, (Date.now() - d) / (30.4 * 864e5)) : null; };
  const rows = ART.map(a => { const st = a.variants.reduce((s, x) => s + x.q, 0), mo = monthsOf(a), stufe = mo == null ? null : stufen.filter(x => mo >= (+x.ab || 0)).at(-1), wert = st * (a.cost || 0), ab = stufe ? wert * (+stufe.pct || 0) / 100 : 0; return {a, st, mo, stufe, wert, ab}; }).filter(r => r.st > 0);
  const by = {}; rows.forEach(r => { const k = r.stufe?.name || 'Alter unbekannt (Saison am Artikel fehlt)'; const x = by[k] ||= {wert: 0, ab: 0, n: 0}; x.wert += r.wert; x.ab += r.ab; x.n++; });
  const wert = rows.reduce((s, r) => s + r.wert, 0), ab = rows.reduce((s, r) => s + r.ab, 0);
  v.innerHTML = `<div class="cv">${pageHead('Altersbewertung', 'Lagerwert zum EK mit Abwertung nach Alter (Monate seit Saisonbeginn des Artikels) – Grundlage für die Inventurbewertung', `<button class="btn btn-secondary" data-goto="st-altersbewertung">${ic('percent', 'i-sm')}Prozentsätze</button>`)}
    ${kpiCards([[eur0(wert), 'Lagerwert EK'], [eur0(ab), 'Abwertung', 'neg'], [eur0(wert - ab), 'Bewerteter Lagerwert', 'pos']])}
    <div class="card" style="margin-bottom:14px"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Altersstufe</th><th class="r">Artikel</th><th class="r">Lagerwert</th><th class="r" style="padding-right:16px">Abwertung</th></tr></thead><tbody>${Object.entries(by).map(([k, x]) => `<tr><td style="padding-left:16px">${esc(k)}</td><td class="r num">${x.n}</td><td class="r num">${eur(x.wert)}</td><td class="r num" style="padding-right:16px;color:var(--neg)">${eur(x.ab)}</td></tr>`).join('')}</tbody></table></div>
    <div class="card" style="overflow:auto"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Artikel</th><th>Saison</th><th class="r">Alter</th><th class="r">Bestand</th><th class="r">Wert EK</th><th class="r" style="padding-right:16px">bewertet</th></tr></thead><tbody>${rows.sort((x, y) => y.ab - x.ab).slice(0, 300).map(r => `<tr><td style="padding-left:16px"><b>${esc(r.a.name)}</b></td><td>${esc(r.a.fields?.Saison || '–')}</td><td class="r num">${r.mo != null ? Math.floor(r.mo) + ' Mon.' : '–'}</td><td class="r num">${r.st}</td><td class="r num">${eur(r.wert)}</td><td class="r num" style="padding-right:16px">${eur(r.wert - r.ab)}</td></tr>`).join('')}</tbody></table></div></div>`;
}});
VIEW_PERM.altersbewertung = 'berichte';

/* Flächenproduktivität */
registerPage('flaechenproduktivitaet', {title: 'Flächenproduktivität', sub: () => 'Umsatz je m²', render: async () => {
  const v = $('#view-flaechenproduktivitaet');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('grid', 'Flächen'); return; }
  await loadStamm();
  const [von, bis] = anPeriod('jahr'); let res; try { res = await anRun({von, bis, dims: ['warengruppe']}); } catch { res = {rows: []}; }
  const fl = stActive('flaeche'), byWg = Object.fromEntries(res.rows.map(r => [r.keys[0], r]));
  const rows = fl.map(f => { const u = (f.warengruppen || []).reduce((s, w) => s + (byWg[w]?.umsatz || 0), 0), re = (f.warengruppen || []).reduce((s, w) => s + (byWg[w]?.rohertrag || 0), 0); return {f, u, re, qm: +f.m2 || 0}; });
  v.innerHTML = `<div class="cv">${pageHead('Flächenproduktivität', `Umsatz und Rohertrag je m² seit Jahresbeginn (${dDate(von)} – ${dDate(bis)})`, `<button class="btn btn-secondary" data-goto="st-flaeche">${ic('grid', 'i-sm')}Flächen pflegen</button>`)}
    <div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Fläche</th><th class="r">m²</th><th class="r">Umsatz</th><th class="r">Umsatz je m²</th><th class="r" style="padding-right:16px">Rohertrag je m²</th></tr></thead><tbody>${rows.map(r => `<tr><td style="padding-left:16px"><b>${esc(r.f.name)}</b><div class="muted" style="font-size:12px">${esc((r.f.warengruppen || []).map(catName).join(', '))}</div></td><td class="r num">${num(r.qm)}</td><td class="r num">${eur0(r.u)}</td><td class="r num" style="font-weight:650">${r.qm ? eur(r.u / r.qm) : '–'}</td><td class="r num" style="padding-right:16px">${r.qm ? eur(r.re / r.qm) : '–'}</td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('grid')}</div><h3>Noch keine Flächen</h3><p>Unter Stammdaten › Flächen anlegen und Warengruppen zuordnen.</p></div>`}</div></div>`;
}});
VIEW_PERM.flaechenproduktivitaet = 'berichte';

/* Analyseeinstellungen */
registerPage('analyse-einstellungen', {title: 'Analyseeinstellungen', sub: () => 'Vorgaben für Flexanalyse und Berichte', render: () => {
  const v = $('#view-analyse-einstellungen');
  v.innerHTML = `<div class="cv">${pageHead('Analyseeinstellungen', 'Vorgaben für neue Analysen')}<div class="card">
    <div class="set-row"><div><div class="set-l">Standard-Zeitraum</div></div><div class="set-c"><select class="input select" data-ase="analyse.zeitraum" style="width:auto">${AN_PER.map(([k, l]) => `<option value="${k}" ${CFG['analyse.zeitraum'] === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="set-row"><div><div class="set-l">Standard-Dimension</div></div><div class="set-c"><select class="input select" data-ase="analyse.dims" style="width:auto">${AN_DIMS.map(([k, l]) => `<option value="${k}" ${(CFG['analyse.dims'] || [])[0] === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="set-row"><div><div class="set-l">Standard-Kennzahlen</div></div><div class="set-c" style="flex-wrap:wrap;gap:6px">${AN_MEAS.map(([k, l]) => `<label class="chip"><input type="checkbox" data-asek="${k}" ${(CFG['analyse.kennzahlen'] || []).includes(k) ? 'checked' : ''} style="margin:0 6px 0 0">${l}</label>`).join('')}</div></div>
    <div class="set-row"><div><div class="set-l">Anteil-Spalte anzeigen</div><div class="set-h">Prozentanteil am Gesamtumsatz je Zeile</div></div><div class="set-c"><button class="switch" role="switch" data-asea aria-checked="${CFG['analyse.anteil'] !== false}"></button></div></div>
    <div class="set-row"><div><div class="set-l">Gewicht je Teil ohne Angabe (kg)</div><div class="set-h">Für Intrastat, wenn am Artikel kein Feld „Gewicht“ gepflegt ist</div></div><div class="set-c"><input class="input num" data-ase="intrastat.ware_kg" value="${esc(String(CFG['intrastat.ware_kg']).replace('.', ','))}" style="max-width:100px"></div></div>
  </div><div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-secondary" data-goto="st-analysespalte">${ic('list', 'i-sm')}Flexanalysespalten</button><button class="btn btn-secondary" data-goto="st-indikator">${ic('target', 'i-sm')}Wert-Indikator-Sets</button><button class="btn btn-secondary" data-goto="st-statistikfilter">${ic('filter', 'i-sm')}Statistikfilter</button></div></div>`;
  v.onchange = async e => { const t = e.target; if (t.dataset.ase) { const k = t.dataset.ase; await saveSettings({[k]: k === 'analyse.dims' ? [t.value] : k === 'intrastat.ware_kg' ? parseAmt(t.value) : t.value}); if (k === 'analyse.zeitraum') AN.per = t.value; } if (t.dataset.asek) { const l = AN_MEAS.map(m => m[0]).filter(k => k === t.dataset.asek ? t.checked : (CFG['analyse.kennzahlen'] || []).includes(k)); await saveSettings({'analyse.kennzahlen': l}); AN.meas = l.slice(); } };
  v.onclick = async e => { const b = e.target.closest('[data-asea]'); if (!b) return; const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on); await saveSettings({'analyse.anteil': on}); };
}});
VIEW_PERM['analyse-einstellungen'] = 'berichte';

/* Power BI Dashboard: Anbindung über die REST-API */
registerPage('powerbi', {title: 'Power BI Dashboard', sub: () => 'Anbindung über die lokale REST-API', render: async () => {
  const v = $('#view-powerbi');
  let st = null; if (DESKTOP) { try { st = await invoke('api_status'); } catch { /* */ } }
  const base = st?.url || `http://<Kontor-PC>:${CFG['api.port'] || 8787}`;
  const ep = [['/api/v1/umsatz?von=2026-01-01&bis=2026-12-31', 'Umsatz je Tag'], ['/api/v1/belege?von=…&bis=…', 'Belege mit Positionen'], ['/api/v1/artikel', 'Artikel mit Varianten und Bestand'], ['/api/v1/bestand', 'Bestand je EAN'], ['/api/v1/kunden', 'Kunden (ohne Notizen)'], ['/api/v1/webshop/bestellungen', 'Webshop-Bestellungen']];
  v.innerHTML = `<div class="cv">${pageHead('Power BI Dashboard', 'Kontor-Daten in Power BI, Excel (Power Query) oder anderen BI-Werkzeugen – über die lokale REST-API mit Lese-Schlüssel', `<button class="btn btn-primary" data-goto="anpassen">${ic('braces', 'i-sm')}API & Schlüssel verwalten</button>`)}
    ${kpiCards([[st?.running ? 'aktiv' : 'aus', 'REST-API', st?.running ? 'pos' : 'warn'], [esc(base), 'Adresse']])}
    <div class="card" style="padding:18px;margin-bottom:14px"><h3 style="margin:0 0 8px">So verbinden Sie Power BI</h3><ol style="margin:0;padding-left:20px;line-height:1.8;font-size:13.5px"><li>Unter <b>System › Anpassen › REST-API</b> die API einschalten (im LAN freigeben, wenn Power BI auf einem anderen PC läuft) und einen Schlüssel mit Bereich <code>lesen</code> erzeugen.</li><li>Power BI Desktop › <b>Daten abrufen › Web › Erweitert</b>: URL eintragen, als HTTP-Header <code>Authorization</code> = <code>Bearer &lt;Schlüssel&gt;</code>.</li><li>Antwort ist JSON – in Power Query „In Tabelle konvertieren“, Spalten erweitern.</li><li>Für automatische Aktualisierung ein lokales Datengateway auf dem Kontor-PC installieren.</li></ol></div>
    <div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Endpunkt</th><th>Inhalt</th><th class="r" style="padding-right:16px"></th></tr></thead><tbody>${ep.map(([p, l]) => `<tr><td style="padding-left:16px" class="mono">${esc(base + p)}</td><td>${esc(l)}</td><td class="r" style="padding-right:16px"><button class="btn btn-ghost btn-sm" data-pbcopy="${esc(base + p)}">${ic('copy', 'i-sm')}Kopieren</button></td></tr>`).join('')}</tbody></table></div>
    <div class="card" style="padding:16px;margin-top:14px"><div class="set-l" style="margin-bottom:6px">Power Query (M) – Beispiel</div><pre class="mono" style="white-space:pre-wrap;font-size:12px;margin:0;background:var(--surface-2);padding:12px;border-radius:10px">let\n  Quelle = Json.Document(Web.Contents("${esc(base)}/api/v1/umsatz", [Query=[von="2026-01-01", bis="2026-12-31"], Headers=[Authorization="Bearer IHR-SCHLÜSSEL"]])),\n  Tabelle = Table.FromRecords(Quelle)\nin\n  Tabelle</pre></div></div>`;
  v.onclick = e => { const b = e.target.closest('[data-pbcopy]'); if (b) navigator.clipboard?.writeText(b.dataset.pbcopy).then(() => toast('Kopiert', {icon: 'copy'})); };
}});

function bindAnalyse() { bindFlex(); bindFlexView(); }
