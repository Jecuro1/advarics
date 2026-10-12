
/* ════════════════════════════════════════════════════════════════════
   45 · ARTIKEL — Artikelinfo (Plus, Kompakt), Bestandsinfo, Umbuchungs-
   Log, Umlagerungen (Pool, Planung, Anforderung, Filial-Rechnung …),
   NOS-Sortimente, Bestandskorrektur, Picklisten, Preisänderungen,
   Nachsortierung, Artikelpflege (Import, EAN, Sortierung, Master).
   ════════════════════════════════════════════════════════════════════ */
Object.assign(DEFAULTS, {'nos.sortimente': [], 'nachsort.param': {tage: 1, quelle: 'lager', min: 1, feld: 'Lagerplatz', nos: true}, 'ul.berechnet': []});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });
Object.assign(VIEW_PERM, {bestandskorrektur: 'bestand.buchen', preisaenderung: 'artikel.bearbeiten', 'preis-geplant': 'artikel.bearbeiten', 'ean-zuordnung': 'artikel.bearbeiten', artikelsortierung: 'artikel.bearbeiten', 'master-artikel': 'artikel.bearbeiten', 'artikel-import': 'artikel.bearbeiten', 'ul-rechnung': 'faktura', 'ul-planung': 'einkauf'});
const vname = v => `${colorName(v.c)} · ${v.s}`;
const lagerplatz = a => { const f = (CFG['nachsort.param'] || {}).feld || 'Lagerplatz'; return a?.fields?.[f] || ''; };
const reloadArt = async () => { if (DESKTOP) { try { replaceCatalog(await invoke('catalog_list')); } catch { /* */ } } };

/* ── Artikelsuche (für Info-Seiten) ── */
function artPicker(id, q) {
  const hits = q ? ART.filter(a => a.hay.includes(norm(q)) || a.variants.some(v => v.ean === q.trim())).slice(0, 8) : [];
  return `<div style="position:relative"><label class="search-field" style="height:48px">${ic('search')}<input data-apq="${id}" value="${esc(q || '')}" placeholder="Artikel, Marke, Artikelnummer oder EAN scannen …" autocomplete="off"></label>
    ${hits.length ? `<div class="card" style="position:absolute;left:0;right:0;top:52px;z-index:6;overflow:hidden;box-shadow:var(--shadow-3)">${hits.map(a => `<button class="pal-i" style="height:46px;border-radius:0" data-apk="${esc(a.id)}"><span style="flex:1;text-align:left"><b>${esc(a.name)}</b> <span class="muted">· ${esc(a.brand)} · ${esc(a.id)}</span></span><span class="muted">${a.stock} Stk.</span></button>`).join('')}</div>` : ''}</div>`;
}
const AIF = {sel: null, q: '', data: {}};
async function aiData(a) {
  if (AIF.data[a.id] && Date.now() - AIF.data[a.id].t < 30000) return AIF.data[a.id];
  const d = {t: Date.now(), moves: [], sales: [], open: 0, res: {}};
  if (DESKTOP) {
    try { d.moves = await invoke('stock_moves', {articleId: a.id, limit: 200}); } catch { /* */ }
    try { d.sales = (await invoke('sales_list', {limit: 3000})).filter(s => (s.kind || 'verkauf') === 'verkauf' && (s.data?.lines || []).some(l => l.sku === a.id)); } catch { /* */ }
    try { d.res = await invoke('doc_reserved'); } catch { /* */ }
    try { await loadPurchasing(); for (const p of EK.pos.filter(p => ['bestellt', 'teilgeliefert'].includes(p.status))) { const ls = await invoke('po_lines', {id: p.id}); ls.filter(l => l.article_id === a.id).forEach(l => { d.open += l.qty - l.received; }); } } catch { /* */ }
  }
  AIF.data[a.id] = d; return d;
}
function soldIn(d, a, days) { const from = Date.now() - days * 864e5; return d.sales.filter(s => new Date(s.ts) >= from).reduce((n, s) => n + s.data.lines.filter(l => l.sku === a.id).reduce((m, l) => m + l.qty, 0), 0); }
function matrixHTML(a, d, big) {
  const cols = a.colors, rows = a.sizes;
  const cell = (c, s) => { const v = a.variants.find(x => x.c === c && x.s === s); if (!v) return '<td class="muted">–</td>'; const r = d?.res?.[v.ean] || 0; const o = v.other ? v.other.reduce((x, y) => x + y, 0) : null; return `<td class="r num" style="${big ? 'font-size:18px;' : ''}${v.q <= 0 ? 'color:var(--neg);' : v.q <= (a.minStock ?? 2) ? 'color:var(--warn);' : ''}font-weight:600">${v.q}${r ? `<div class="muted" style="font-size:11px;font-weight:400">${r} res.</div>` : ''}${o != null ? `<div class="muted" style="font-size:11px;font-weight:400">${o} andere</div>` : ''}</td>`; };
  return `<div style="overflow:auto"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Größe</th>${cols.map(c => `<th class="r"><span class="dot" style="background:${COLORS[c]?.[1] || '#999'};width:10px;height:10px;display:inline-block;border-radius:50%;margin-right:6px"></span>${esc(colorName(c))}</th>`).join('')}<th class="r" style="padding-right:16px">Summe</th></tr></thead><tbody>${rows.map(s => `<tr><td style="padding-left:16px"><b>${esc(s)}</b></td>${cols.map(c => cell(c, s)).join('')}<td class="r num" style="padding-right:16px">${a.variants.filter(v => v.s === s).reduce((n, v) => n + v.q, 0)}</td></tr>`).join('')}</tbody></table></div>`;
}
for (const [id, mode, title] of [['artikelinfo', 'info', 'Artikelinfo'], ['artikelinfo-plus', 'plus', 'Artikel-Info Plus'], ['artikelinfo-kompakt', 'kompakt', 'Artikelinfo Kompakt']]) {
  registerPage(id, {title, sub: () => AIF.sel ? artById(AIF.sel)?.name || '' : 'Artikel suchen oder scannen', render: () => renderArtInfo(id, mode, title)});
}
async function renderArtInfo(id, mode, title) {
  const v = $('#view-' + id), a = AIF.sel ? artById(AIF.sel) : null;
  v.innerHTML = `<div class="cv">${pageHead(title, mode === 'kompakt' ? 'Schnell scannen – Bestand je Farbe und Größe auf einen Blick' : mode === 'plus' ? 'Mit Abverkauf, Reichweite, Marge, Lagerwert und Umschlag' : 'Preise, Bestände je Variante und Filiale, Reservierungen, offene Bestellungen, letzte Buchungen')}
    ${artPicker(id, AIF.q)}<div data-aib style="margin-top:16px">${a ? loadingCard('Lade') : `<div class="card"><div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('barcode')}</div><h3>Artikel scannen oder suchen</h3><p>EAN scannen und Enter – oder Namen tippen.</p></div></div>`}</div></div>`;
  if (!a) { setTimeout(() => $(`[data-apq="${id}"]`)?.focus(), 60); return; }
  const d = await aiData(a), box = $('[data-aib]', v); if (!box) return;
  const stock = a.variants.reduce((n, x) => n + x.q, 0), res = a.variants.reduce((n, x) => n + (d.res[x.ean] || 0), 0);
  const vk = a.sale || a.price, ek = a.cost, marge = ek != null ? (vk / 1.2 - ek) / (vk / 1.2) * 100 : null;
  const s30 = soldIn(d, a, 30), s90 = soldIn(d, a, 90), reich = s30 ? Math.round(stock / (s30 / 30)) : null;
  const head = `<div class="card" style="padding:16px;display:flex;gap:16px;align-items:center;margin-bottom:14px"><div style="width:${mode === 'kompakt' ? 64 : 92}px;height:${mode === 'kompakt' ? 64 : 92}px;flex:none;border-radius:14px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center">${artVisual(a, COLORS[a.colors[0]]?.[1] || '#888')}</div>
    <div style="min-width:0;flex:1"><div class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">${esc(a.brand)} · ${esc(a.id)} · ${esc(CATS.find(c => c.id === a.cat)?.name || a.cat)}</div><div style="font-size:20px;font-weight:650">${esc(a.name)}</div><div class="muted" style="font-size:13px">${[a.supplierId ? esc(supName(a.supplierId)) : '', lagerplatz(a) ? 'Lagerplatz ' + esc(lagerplatz(a)) : ''].filter(Boolean).join(' · ')}</div></div>
    <div style="text-align:right"><div style="font-size:22px;font-weight:700;${a.sale ? 'color:var(--accent)' : ''}">${eur(vk)}</div>${a.sale ? `<div class="muted" style="text-decoration:line-through">${eur(a.price)}</div>` : ''}${mode !== 'kompakt' && ek != null ? `<div class="muted" style="font-size:12.5px">EK ${ekShow(ek)}</div>` : ''}</div>
    ${mode !== 'kompakt' ? `<button class="btn btn-secondary btn-sm" data-aied="${esc(a.id)}">${ic('edit', 'i-sm')}Bearbeiten</button>` : ''}</div>`;
  if (mode === 'kompakt') { box.innerHTML = head + `<div class="card">${matrixHTML(a, d, true)}</div>`; return; }
  const kpi = mode === 'plus' ? kpiCards([[num(stock), 'Bestand'], [num(res), 'reserviert', res ? 'warn' : ''], [num(d.open), 'offen bestellt'], [num(s30), 'verkauft 30 Tage'], [num(s90), 'verkauft 90 Tage'], [s30 + stock ? Math.round(s30 / (s30 + stock) * 100) + ' %' : '–', 'Abverkaufsquote 30 T'], [reich != null ? reich + ' Tage' : '–', 'Reichweite', reich != null && reich < 14 ? 'warn' : ''], [marge != null ? num(marge, 1) + ' %' : '–', 'Marge (netto)'], [ek != null ? eur0(stock * ek) : '–', 'Lagerwert EK'], [eur0(stock * vk), 'Lagerwert VK'], [ek != null && stock ? num(s90 * 4 / Math.max(1, stock), 1) : '–', 'Umschlag p. a.']])
    : kpiCards([[num(stock), 'Bestand gesamt'], [num(res), 'davon reserviert', res ? 'warn' : ''], [num(d.open), 'offen bestellt'], [num(s30), 'verkauft 30 Tage']]);
  box.innerHTML = head + kpi + `<div class="card" style="margin-bottom:14px"><div class="set-row"><div class="set-l">Bestand je Variante</div><div class="set-c"><button class="btn btn-ghost btn-sm" data-ailbl="${esc(a.id)}">${ic('printer', 'i-sm')}Etiketten</button><button class="btn btn-ghost btn-sm" data-goto="bestandskorrektur">Bestandskorrektur</button></div></div>${matrixHTML(a, d)}</div>
    <div class="card"><div class="set-row"><div class="set-l">Letzte Bestandsbuchungen</div></div>${d.moves.length ? `<table class="tbl" style="margin:0"><tbody>${d.moves.slice(0, mode === 'plus' ? 30 : 12).map(m => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(m.ts))}</td><td>${esc(colorName(m.color))} · ${esc(m.size)}</td><td>${esc(m.reason)}</td><td class="mono muted">${esc(m.ref || '')}</td><td class="r num" style="color:var(--${m.delta >= 0 ? 'pos' : 'neg'})">${m.delta > 0 ? '+' : ''}${m.delta}</td><td class="r num" style="padding-right:16px">${m.stock_after}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:24px"><p>Noch keine Buchungen.</p></div>'}</div>`;
}

/* ── Bestandsinfo ── */
const BI = {cat: 'alle', f: 'alle', q: ''};
registerPage('bestandsinfo', {title: 'Bestandsinfo', sub: () => `${num(ART.reduce((s, a) => s + a.stock, 0))} Stück`, render: renderBestandsinfo});
function renderBestandsinfo() {
  const v = $('#view-bestandsinfo'), n = norm(BI.q);
  const rows = ART.filter(a => (BI.cat === 'alle' || a.cat === BI.cat) && (!n || a.hay.includes(n))).map(a => ({a, st: a.variants.reduce((s, x) => s + x.q, 0), neg: a.variants.filter(x => x.q < 0).length, low: a.variants.filter(x => x.q <= (a.minStock ?? 2)).length}))
    .filter(r => BI.f === 'alle' || (BI.f === 'leer' && r.a.variants.some(x => x.q <= 0)) || (BI.f === 'min' && r.low) || (BI.f === 'neg' && r.neg));
  const ek = rows.reduce((s, r) => s + r.st * (r.a.cost || 0), 0), vk = rows.reduce((s, r) => s + r.st * (r.a.sale || r.a.price), 0);
  const byCat = {}; rows.forEach(r => { (byCat[r.a.cat] ||= {st: 0, ek: 0}); byCat[r.a.cat].st += r.st; byCat[r.a.cat].ek += r.st * (r.a.cost || 0); });
  v.innerHTML = `<div class="cv">${pageHead('Bestandsinfo', 'Bestand und Lagerwert je Artikel und Warengruppe – Klick öffnet die Artikelinfo')}
    ${kpiCards([[num(rows.reduce((s, r) => s + r.st, 0)), 'Stück'], [eur0(ek), 'Lagerwert EK'], [eur0(vk), 'Lagerwert VK'], [num(rows.filter(r => r.low).length), 'Artikel mit Varianten unter Minimum', 'warn'], [num(rows.filter(r => r.neg).length), 'mit negativem Bestand', 'neg']])}
    <div class="filters"><input class="input" id="biQ" value="${esc(BI.q)}" placeholder="Suchen …" style="max-width:300px"><select class="input select" id="biCat" style="width:auto">${CATS.map(c => `<option value="${c.id}" ${c.id === BI.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><div class="seg" id="biSeg">${[['alle', 'Alle'], ['min', 'unter Minimum'], ['leer', 'ausverkauft'], ['neg', 'negativ']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${BI.f === k}">${l}</button>`).join('')}</div></div>
    <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;align-items:start"><div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Artikel</th><th class="r">Varianten</th><th class="r">Bestand</th><th class="r">unter Min.</th><th class="r" style="padding-right:16px">Wert EK</th></tr></thead><tbody>${rows.slice(0, 400).map(r => `<tr data-aiopen="${esc(r.a.id)}" style="cursor:pointer"><td style="padding-left:16px"><b>${esc(r.a.name)}</b><div class="muted" style="font-size:12px">${esc(r.a.brand)} · ${esc(r.a.id)}</div></td><td class="r num">${r.a.variants.length}</td><td class="r num" style="font-weight:600;${r.neg ? 'color:var(--neg)' : ''}">${r.st}</td><td class="r num" style="color:${r.low ? 'var(--warn)' : 'inherit'}">${r.low || ''}</td><td class="r num" style="padding-right:16px">${r.a.cost != null ? eur0(r.st * r.a.cost) : '–'}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><div class="set-row"><div class="set-l">Je Warengruppe</div></div><table class="tbl" style="margin:0"><tbody>${Object.entries(byCat).map(([c, x]) => `<tr><td style="padding-left:16px">${esc(CATS.find(y => y.id === c)?.name || c)}</td><td class="r num">${num(x.st)}</td><td class="r num" style="padding-right:16px">${eur0(x.ek)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  initSeg($('#biSeg', v), b => { BI.f = b.dataset.v; renderBestandsinfo(); });
  $('#biCat', v).onchange = e => { BI.cat = e.target.value; renderBestandsinfo(); };
  $('#biQ', v).onchange = e => { BI.q = e.target.value; renderBestandsinfo(); };
}

/* ── Artikel-Umbuchungs-Log ── */
const UL = {q: '', r: '', days: '7'};
const UL_REASONS = [['', 'Alle'], ['Verkauf', 'Verkauf'], ['Wareneingang', 'Wareneingang'], ['Korrektur', 'Korrekturen'], ['Umlagerung', 'Umlagerung'], ['Retoure', 'Retouren'], ['Inventur', 'Inventur'], ['Auswahl', 'Auswahl'], ['Lieferschein', 'Lieferschein']];
registerPage('umbuchungslog', {title: 'Artikel-Umbuchungs-Log', sub: () => 'alle Bestandsbewegungen', render: renderUmbLog});
async function renderUmbLog() {
  const v = $('#view-umbuchungslog');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('history', 'Umbuchungs-Log'); return; }
  let m; try { m = await invoke('stock_moves', {articleId: null, limit: 8000}); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  const from = UL.days === 'alle' ? '' : dIso(dayStart(+UL.days)), n = norm(UL.q);
  const rows = m.filter(x => x.ts.slice(0, 10) >= from && (!UL.r || x.reason.includes(UL.r)) && (!n || norm(`${x.name} ${x.article_id} ${x.reason} ${x.ref || ''} ${x.user || ''}`).includes(n)));
  v.innerHTML = `<div class="cv">${pageHead('Artikel-Umbuchungs-Log', 'Jede Bestandsbewegung mit Grund, Beleg, Benutzer und Bestand danach')}
    ${kpiCards([[num(rows.length), 'Buchungen'], [num(rows.filter(x => x.delta > 0).reduce((s, x) => s + x.delta, 0)), 'Stück zu', 'pos'], [num(-rows.filter(x => x.delta < 0).reduce((s, x) => s + x.delta, 0)), 'Stück ab', 'neg']])}
    <div class="filters"><input class="input" id="ulQ" value="${esc(UL.q)}" placeholder="Artikel, Beleg, Benutzer …" style="max-width:300px"><select class="input select" id="ulR" style="width:auto">${UL_REASONS.map(([k, l]) => `<option value="${k}" ${k === UL.r ? 'selected' : ''}>${l}</option>`).join('')}</select><div class="seg" id="ulSeg">${[['0', 'Heute'], ['7', '7 Tage'], ['30', '30 Tage'], ['alle', 'Alle']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${UL.days === k}">${l}</button>`).join('')}</div><button class="btn btn-ghost btn-sm" data-ulcsv>${ic('download', 'i-sm')}CSV</button></div>
    <div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Artikel</th><th>Variante</th><th>Grund</th><th>Beleg</th><th>Benutzer</th><th class="r">Menge</th><th class="r" style="padding-right:16px">Bestand</th></tr></thead><tbody>${rows.slice(0, 700).map(x => `<tr data-aiopen="${esc(x.article_id)}" style="cursor:pointer"><td style="padding-left:16px" class="muted num">${esc(fmtTs(x.ts))}</td><td><b>${esc(x.name)}</b></td><td>${esc(colorName(x.color))} · ${esc(x.size)}</td><td>${esc(x.reason)}</td><td class="mono muted">${esc(x.ref || '')}</td><td>${esc(x.user || '')}</td><td class="r num" style="color:var(--${x.delta >= 0 ? 'pos' : 'neg'})">${x.delta > 0 ? '+' : ''}${x.delta}</td><td class="r num" style="padding-right:16px">${x.stock_after}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Keine Buchungen im Filter.</p></div>'}</div></div>`;
  initSeg($('#ulSeg', v), b => { UL.days = b.dataset.v; renderUmbLog(); });
  $('#ulQ', v).onchange = e => { UL.q = e.target.value; renderUmbLog(); };
  $('#ulR', v).onchange = e => { UL.r = e.target.value; renderUmbLog(); };
  v._rows = rows;
}

/* ── Umlagerungen ── */
const vbHint = (t, s) => `<div class="cv">${pageHead(t, s)}<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('swap')}</div><h3>Nur im Filialverbund</h3><p>Umlagerungen gibt es, sobald mehrere Filialen verbunden sind (Einstellungen → Filialverbund).</p><button class="btn btn-primary" data-goto="filialen">Filialverbund einrichten</button></div></div></div>`;
async function vbLoadTr() { await loadVerbund(); try { VB.transfers = await invoke('verbund_transfers'); } catch { VB.transfers = []; } return VB.transfers; }
const trPill = s => `<span class="pill ${TR_STATE[s]?.[1] || ''}" style="height:20px">${esc(TR_STATE[s]?.[0] || s)}</span>`;
const trVal = t => (t.lines || []).reduce((s, l) => { const x = findEan(l.ean); return s + (l.qty || 0) * (x?.a.cost || 0); }, 0);
registerPage('ul-neu', {title: 'Filialumlagerung', sub: () => 'Ware an eine Filiale senden', render: () => {
  const v = $('#view-ul-neu'); if (!vbOn()) { v.innerHTML = vbHint('Filialumlagerung', 'Ware zwischen Filialen umlagern'); return; }
  v.innerHTML = `<div class="cv">${pageHead('Filialumlagerung', 'Ware aus dieser Filiale an eine andere senden – Bestand wird beim Versand ab- und beim Empfang zugebucht')}<div class="card"><div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('swap')}</div><h3>Neue Umlagerung</h3><div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-primary" data-ulnew>${ic('plus', 'i-sm')}Umlagerung anlegen</button><button class="btn btn-secondary" data-goto="umlagerungen">Umlagerungs-Pool</button></div></div></div></div>`;
  setTimeout(() => S.view === 'ul-neu' && !$('.layer') && openTransferNew(), 150);
}});
registerPage('ul-protokoll', {title: 'Protokoll Umlagerungen', sub: () => 'alle Umlagerungen', render: async () => {
  const v = $('#view-ul-protokoll'); if (!vbOn()) { v.innerHTML = vbHint('Protokoll Umlagerungen', 'Verlauf aller Umlagerungen'); return; }
  const tr = await vbLoadTr();
  v.innerHTML = `<div class="cv">${pageHead('Protokoll Umlagerungen', 'Alle Umlagerungen mit Status, Zeitpunkt und Benutzer')}<div class="card">${tr.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Nummer</th><th>von</th><th>an</th><th>Status</th><th>angelegt</th><th>zuletzt</th><th>Benutzer</th><th class="r">Stück</th><th class="r" style="padding-right:16px">Wert EK</th></tr></thead><tbody>${tr.map(t => `<tr><td style="padding-left:16px" class="mono"><b>${esc(t.no)}</b></td><td>${esc(storeName(t.from))}</td><td>${esc(storeName(t.to))}</td><td>${trPill(t.status)}</td><td class="muted num">${esc(fmtTs(t.created_at))}</td><td class="muted num">${esc(fmtTs(t.updated_at))}</td><td>${esc(t.user || '')}</td><td class="r num">${num(t.lines.reduce((s, l) => s + l.qty, 0))}</td><td class="r num" style="padding-right:16px">${eur0(trVal(t))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Noch keine Umlagerungen.</p></div>'}</div></div>`;
}});
registerPage('ul-positionen', {title: 'Übersicht Umlagerungspositionen', sub: () => 'je Artikel', render: async () => {
  const v = $('#view-ul-positionen'); if (!vbOn()) { v.innerHTML = vbHint('Übersicht Umlagerungspositionen', 'Alle Positionen'); return; }
  const tr = await vbLoadTr(), rows = tr.flatMap(t => t.lines.map(l => ({t, l})));
  v.innerHTML = `<div class="cv">${pageHead('Übersicht Umlagerungspositionen', 'Jede umgelagerte Position einzeln – sortierbar nach Status')}<div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Umlagerung</th><th>Artikel</th><th>EAN</th><th>von → an</th><th>Status</th><th class="r" style="padding-right:16px">Menge</th></tr></thead><tbody>${rows.map(({t, l}) => `<tr><td style="padding-left:16px" class="mono">${esc(t.no)}</td><td><b>${esc(l.name || '')}</b></td><td class="mono muted">${esc(l.ean)}</td><td>${esc(t.from)} → ${esc(t.to)}</td><td>${trPill(t.status)}</td><td class="r num" style="padding-right:16px">${l.qty}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Keine Positionen.</p></div>'}</div></div>`;
}});
const UP = {sel: null, q: '', from: null};
registerPage('ul-planung', {title: 'Manuelle Umlagerungsplanung', sub: () => 'Bestände ausgleichen', render: renderUlPlanung});
async function renderUlPlanung() {
  const v = $('#view-ul-planung'); if (!vbOn()) { v.innerHTML = vbHint('Manuelle Umlagerungsplanung', 'Bestände zwischen Filialen ausgleichen'); return; }
  await loadVerbund();
  const stores = [{id: vbOwn(), name: VB.info?.name || 'Diese Filiale'}, ...OTHER_STORES], a = UP.sel ? artById(UP.sel) : null;
  UP.from ||= vbOwn();
  v.innerHTML = `<div class="cv">${pageHead('Manuelle Umlagerungsplanung', 'Artikel wählen, Bestand je Filiale vergleichen, Mengen eintragen und als Umlagerungen anlegen')}${artPicker('ul-planung', UP.q)}
    ${a ? `<div class="card" style="margin-top:14px"><div class="set-row"><div><div class="set-l">${esc(a.name)}</div><div class="set-h">Quelle: <select class="input select" id="upFrom" style="width:auto;height:28px;display:inline-block">${stores.map(s => `<option value="${esc(s.id)}" ${s.id === UP.from ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-upgo>${ic('truck', 'i-sm')}Umlagerungen anlegen</button></div></div>
      <div style="overflow:auto"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Variante</th>${stores.map(s => `<th class="r">${esc(s.name)}</th>`).join('')}${stores.filter(s => s.id !== UP.from).map(s => `<th class="r">→ ${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${a.variants.map(x => `<tr><td style="padding-left:16px"><b>${esc(vname(x))}</b><div class="muted" style="font-size:11.5px">${esc(x.ean)}</div></td>${stores.map(s => `<td class="r num">${s.id === vbOwn() ? x.q : (VB.stock?.[s.id]?.[x.ean] ?? 0)}</td>`).join('')}${stores.filter(s => s.id !== UP.from).map(s => `<td class="r"><input class="input num" data-upq="${esc(x.ean)}" data-to="${esc(s.id)}" value="" placeholder="0" style="width:60px;height:30px;text-align:right"></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : ''}</div>`;
}
const UA = {sel: null, q: ''};
registerPage('ul-anforderung', {title: 'Umbuchungsanforderung', sub: () => 'Ware aus anderer Filiale anfordern', render: async () => {
  const v = $('#view-ul-anforderung'); if (!vbOn()) { v.innerHTML = vbHint('Umbuchungsanforderung', 'Ware aus einer anderen Filiale anfordern'); return; }
  await loadVerbund(); const a = UA.sel ? artById(UA.sel) : null;
  v.innerHTML = `<div class="cv">${pageHead('Umbuchungsanforderung', 'Ware aus einer anderen Filiale für diese Filiale anfordern – die andere Filiale sieht die Anforderung im Umlagerungs-Pool')}${artPicker('ul-anforderung', UA.q)}
    ${a ? `<div class="card" style="margin-top:14px"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Variante</th><th class="r">hier</th>${OTHER_STORES.map(s => `<th class="r">${esc(s.name)}</th>`).join('')}<th class="r">Menge</th><th>aus Filiale</th></tr></thead><tbody>${a.variants.map(x => { const best = OTHER_STORES.slice().sort((p, q) => (VB.stock?.[q.id]?.[x.ean] ?? 0) - (VB.stock?.[p.id]?.[x.ean] ?? 0))[0]; return `<tr><td style="padding-left:16px"><b>${esc(vname(x))}</b></td><td class="r num">${x.q}</td>${OTHER_STORES.map(s => `<td class="r num">${VB.stock?.[s.id]?.[x.ean] ?? 0}</td>`).join('')}<td class="r"><input class="input num" data-uaq="${esc(x.ean)}" placeholder="0" style="width:60px;height:30px;text-align:right"></td><td><select class="input select" data-uaf="${esc(x.ean)}" style="height:30px;width:auto">${OTHER_STORES.map(s => `<option value="${esc(s.id)}" ${s.id === best?.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody></table>
      <div style="display:flex;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--line)"><button class="btn btn-primary" data-uago>${ic('swap', 'i-sm')}Anfordern</button></div></div>` : ''}</div>`;
}});
registerPage('ul-ungebucht', {title: 'Ungebuchte Fil. Umbuchungen', sub: () => 'offene Umlagerungen', render: async () => {
  const v = $('#view-ul-ungebucht'); if (!vbOn()) { v.innerHTML = vbHint('Ungebuchte Fil. Umbuchungen', 'Offene Umlagerungen'); return; }
  const tr = (await vbLoadTr()).filter(t => ['angefordert', 'versendet'].includes(t.status)), age = t => Math.floor((Date.now() - new Date(t.updated_at)) / 864e5);
  v.innerHTML = `<div class="cv">${pageHead('Ungebuchte Fil. Umbuchungen', 'Angeforderte, noch nicht versendete und versendete, noch nicht empfangene Umlagerungen')}
    ${kpiCards([[num(tr.filter(t => t.status === 'angefordert').length), 'nicht versendet', 'warn'], [num(tr.filter(t => t.status === 'versendet').length), 'unterwegs, nicht empfangen'], [num(tr.filter(t => age(t) >= 2).length), 'älter als 2 Tage', 'neg']])}
    <div class="card">${tr.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Nummer</th><th>von → an</th><th>Status</th><th>seit</th><th class="r">Stück</th><th></th></tr></thead><tbody>${tr.map(t => `<tr><td style="padding-left:16px" class="mono"><b>${esc(t.no)}</b></td><td>${esc(storeName(t.from))} → ${esc(storeName(t.to))}</td><td>${trPill(t.status)}</td><td style="color:${age(t) >= 2 ? 'var(--neg)' : 'inherit'}">${age(t)} Tagen</td><td class="r num">${num(t.lines.reduce((s, l) => s + l.qty, 0))}</td><td class="r" style="padding-right:12px">${t.status === 'angefordert' && t.from === vbOwn() ? `<button class="btn btn-primary btn-sm" data-tst2="versendet" data-no="${esc(t.no)}">Versenden</button>` : ''}${t.status === 'versendet' && t.to === vbOwn() ? `<button class="btn btn-primary btn-sm" data-tst2="empfangen" data-no="${esc(t.no)}">Empfangen</button>` : ''}</td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:44px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><p>Alle Umlagerungen gebucht.</p></div>`}</div></div>`;
}});
registerPage('ul-kompakt', {title: 'Umlagerungen Kompakt', sub: () => 'je Filialpaar', render: async () => {
  const v = $('#view-ul-kompakt'); if (!vbOn()) { v.innerHTML = vbHint('Umlagerungen Kompakt', 'Zusammenfassung'); return; }
  const tr = await vbLoadTr(), m = {};
  tr.filter(t => t.status !== 'storniert').forEach(t => { const k = `${t.from}→${t.to}`; (m[k] ||= {from: t.from, to: t.to, n: 0, st: 0, w: 0, offen: 0}); m[k].n++; m[k].st += t.lines.reduce((s, l) => s + l.qty, 0); m[k].w += trVal(t); if (t.status !== 'empfangen') m[k].offen++; });
  v.innerHTML = `<div class="cv">${pageHead('Umlagerungen Kompakt', 'Umlagerungen je Filialpaar: Anzahl, Stück, Warenwert (EK), offen')}<div class="card">${Object.keys(m).length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">von</th><th>an</th><th class="r">Umlagerungen</th><th class="r">Stück</th><th class="r">Wert EK</th><th class="r" style="padding-right:16px">offen</th></tr></thead><tbody>${Object.values(m).map(x => `<tr><td style="padding-left:16px"><b>${esc(storeName(x.from))}</b></td><td><b>${esc(storeName(x.to))}</b></td><td class="r num">${x.n}</td><td class="r num">${num(x.st)}</td><td class="r num">${eur0(x.w)}</td><td class="r num" style="padding-right:16px;color:${x.offen ? 'var(--warn)' : 'inherit'}">${x.offen}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Noch keine Umlagerungen.</p></div>'}</div></div>`;
}});
registerPage('ul-rechnung', {title: 'Filial-Rechnungsstellung', sub: () => 'Umlagerungen intern verrechnen', render: async () => {
  const v = $('#view-ul-rechnung'); if (!vbOn()) { v.innerHTML = vbHint('Filial-Rechnungsstellung', 'Umlagerungen zwischen Filialen verrechnen'); return; }
  const done = new Set(CFG['ul.berechnet'] || []), tr = (await vbLoadTr()).filter(t => t.status === 'empfangen' && t.from === vbOwn() && !done.has(t.no));
  const by = {}; tr.forEach(t => (by[t.to] ||= []).push(t));
  v.innerHTML = `<div class="cv">${pageHead('Filial-Rechnungsstellung', 'Empfangene Umlagerungen aus dieser Filiale an die empfangende Filiale zu Einstandspreisen verrechnen (Rechnung unter Faktura)')}
    ${Object.keys(by).length ? Object.entries(by).map(([to, l]) => `<div class="card" style="margin-bottom:12px"><div class="set-row"><div><div class="set-l">${esc(storeName(to))}</div><div class="set-h">${l.length} Umlagerungen · ${eur(l.reduce((s, t) => s + trVal(t), 0))} EK netto</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-ulr="${esc(to)}">${ic('receipt', 'i-sm')}Rechnung erstellen</button></div></div><table class="tbl" style="margin:0"><tbody>${l.map(t => `<tr><td style="padding-left:16px" class="mono">${esc(t.no)}</td><td class="muted num">${esc(fmtTs(t.updated_at))}</td><td class="r num">${num(t.lines.reduce((s, x) => s + x.qty, 0))} Stk.</td><td class="r num" style="padding-right:16px">${eur(trVal(t))}</td></tr>`).join('')}</tbody></table></div>`).join('')
      : `<div class="card"><div class="empty" style="padding:48px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><p>Keine offenen Umlagerungen zu verrechnen.</p></div></div>`}</div>`;
  v._by = by;
}});

/* ── NOS-Sortimente (Never out of Stock) ── */
const nosList = () => Array.isArray(CFG['nos.sortimente']) ? CFG['nos.sortimente'] : [];
const nosShort = () => { const out = {}; nosList().filter(n => n.aktiv !== false).forEach(n => (n.items || []).forEach(it => { const x = findEan(it.ean); if (!x) return; const fehl = (+it.soll || 0) - x.v.q; if (fehl > 0) out[it.ean] = Math.max(out[it.ean] || 0, fehl); })); return out; };
registerPage('nos', {title: 'NOS Sortimente', sub: () => `${nosList().length} Sortimente`, render: renderNos});
function renderNos() {
  const v = $('#view-nos'), l = nosList();
  v.innerHTML = `<div class="cv">${pageHead('NOS Sortimente', 'Never-out-of-Stock: Basisartikel mit Sollbestand – Fehlmengen fließen in Nachsortierung und Bestellvorschlag', `<button class="btn btn-primary" data-nos="neu">${ic('plus', 'i-sm')}Neues Sortiment</button>`)}
    ${l.length ? l.map((n, i) => { const items = (n.items || []).map(it => ({it, x: findEan(it.ean)})).filter(r => r.x); const fehl = items.filter(r => r.x.v.q < +r.it.soll); return `<div class="card" style="margin-bottom:12px"><div class="set-row"><div><div class="set-l">${esc(n.name)} ${n.aktiv === false ? '<span class="pill" style="height:20px">inaktiv</span>' : ''}</div><div class="set-h">${items.length} Varianten · ${fehl.length ? `<span style="color:var(--warn)">${fehl.length} unter Soll (${num(fehl.reduce((s, r) => s + (+r.it.soll - r.x.v.q), 0))} Stück)</span>` : 'alles auf Soll'}</div></div><div class="set-c" style="gap:6px"><button class="btn btn-ghost btn-sm" data-nose="${i}">${ic('edit', 'i-sm')}Bearbeiten</button>${fehl.length ? `<button class="btn btn-primary btn-sm" data-goto="nachsort-nos">Nachsortieren</button>` : ''}</div></div>
      <table class="tbl" style="margin:0"><tbody>${items.slice(0, 40).map(r => `<tr><td style="padding-left:16px"><b>${esc(r.x.a.name)}</b> <span class="muted">${esc(vname(r.x.v))}</span></td><td class="r num">Soll ${r.it.soll}</td><td class="r num" style="padding-right:16px;font-weight:600;color:${r.x.v.q < +r.it.soll ? 'var(--warn)' : 'var(--pos)'}">Ist ${r.x.v.q}</td></tr>`).join('')}</tbody></table></div>`; }).join('')
      : `<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('star')}</div><h3>Noch kein NOS-Sortiment</h3><p>Z. B. Basic-Socken, Merino-Shirts in allen Größen: Sollbestand festlegen – Kontor schlägt automatisch Nachschub vor.</p><button class="btn btn-primary" data-nos="neu">${ic('plus', 'i-sm')}Sortiment anlegen</button></div></div>`}</div>`;
}
function openNos(i) {
  const n = i == null ? {id: uid(), name: '', aktiv: true, items: []} : JSON.parse(JSON.stringify(nosList()[i]));
  const el = openLayer(`<div class="drawer-panel" style="width:min(680px,100%)" role="dialog" aria-modal="true"><div data-nb2 style="display:flex;flex-direction:column;min-height:0;flex:1"></div></div>`, {cls: 'drawer'});
  const box = $('[data-nb2]', el); let q = '';
  const render = () => {
    const hits = q ? ART.filter(a => a.hay.includes(norm(q)) || a.variants.some(x => x.ean === q.trim())).slice(0, 6) : [];
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('star')}</div><div><h2>${i == null ? 'Neues NOS-Sortiment' : esc(n.name)}</h2><p>Sollbestand je Variante</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="drawer-body" style="display:grid;gap:12px;align-content:start"><label class="field"><span>Name</span><input class="input" data-nn value="${esc(n.name)}" placeholder="z. B. Merino Basics"></label>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" data-na ${n.aktiv !== false ? 'checked' : ''}> aktiv</label>
        <div style="position:relative"><label class="search-field" style="height:42px">${ic('search')}<input data-nq value="${esc(q)}" placeholder="Artikel hinzufügen (alle Varianten) …" autocomplete="off"></label>${hits.length ? `<div class="card" style="position:absolute;left:0;right:0;top:46px;z-index:6;overflow:hidden;box-shadow:var(--shadow-3)">${hits.map(a => `<button class="pal-i" style="height:44px;border-radius:0" data-nadd="${esc(a.id)}"><b>${esc(a.name)}</b>&nbsp;<span class="muted">· ${a.variants.length} Varianten</span></button>`).join('')}</div>` : ''}</div>
        <div class="card">${n.items.length ? `<table class="tbl" style="margin:0"><tbody>${n.items.map((it, k) => { const x = findEan(it.ean); return `<tr><td style="padding-left:14px"><b>${esc(x?.a.name || it.ean)}</b> <span class="muted">${x ? esc(vname(x.v)) : ''}</span></td><td class="r num">Ist ${x?.v.q ?? '–'}</td><td class="r">Soll <input class="input num" data-ns="${k}" value="${esc(it.soll)}" style="width:60px;height:30px;text-align:right"></td><td><button class="btn btn-ghost btn-icon btn-sm" data-nx="${k}">${ic('x', 'i-sm')}</button></td></tr>`; }).join('')}</tbody></table>` : '<div class="empty" style="padding:22px"><p>Artikel oben suchen.</p></div>'}</div></div>
      <div class="m-foot" style="border-top:1px solid var(--line);padding-top:14px">${i != null ? `<button class="btn btn-danger" data-ndel>${ic('trash', 'i-sm')}Löschen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-nsave>${ic('check', 'i-sm')}Speichern</button></div>`;
    if (q) { const x = $('[data-nq]', box); x.focus(); x.setSelectionRange(q.length, q.length); }
  };
  const read = () => { n.name = $('[data-nn]', box).value.trim(); n.aktiv = $('[data-na]', box).checked; $$('[data-ns]', box).forEach(x => { n.items[+x.dataset.ns].soll = Math.max(0, parseInt(x.value, 10) || 0); }); };
  box.addEventListener('input', e => { if (e.target.matches('[data-nq]')) { read(); q = e.target.value; render(); } });
  box.addEventListener('click', async e => {
    const ad = e.target.closest('[data-nadd]'); if (ad) { read(); const a = artById(ad.dataset.nadd); a.variants.forEach(x => { if (!n.items.some(it => it.ean === x.ean)) n.items.push({ean: x.ean, soll: Math.max(2, a.minStock ?? 2)}); }); q = ''; return render(); }
    const x = e.target.closest('[data-nx]'); if (x) { read(); n.items.splice(+x.dataset.nx, 1); return render(); }
    if (e.target.closest('[data-ndel]')) { const l = nosList().slice(); l.splice(i, 1); await saveSettings({'nos.sortimente': l}); closeLayer(el); return renderNos(); }
    if (e.target.closest('[data-nsave]')) { read(); if (n.name.length < 2) return toast('Name fehlt', {type: 'warn'}); const l = nosList().slice(); if (i == null) l.push(n); else l[i] = n; await saveSettings({'nos.sortimente': l}); closeLayer(el); renderNos(); }
  });
  render();
}

/* ── Bestandskorrektur ── */
const BK = {ean: '', log: []};
const BK_GRUENDE = ['Zählfehler', 'Bruch / Beschädigung', 'Diebstahl / Schwund', 'Eigenverbrauch', 'Musterteil / Deko', 'Fehlbuchung', 'Sonstiges'];
registerPage('bestandskorrektur', {title: 'Bestandskorrektur', sub: () => 'mit Grund und Protokoll', render: renderBestKorr});
async function renderBestKorr() {
  const v = $('#view-bestandskorrektur'), x = BK.ean ? findEan(BK.ean) : null;
  let log = []; if (DESKTOP) { try { log = (await invoke('stock_moves', {articleId: null, limit: 3000})).filter(m => m.reason.startsWith('Bestandskorrektur')).slice(0, 60); } catch { /* */ } }
  v.innerHTML = `<div class="cv">${pageHead('Bestandskorrektur', 'Bestand einer Variante berichtigen – Zugang, Abgang oder gezählter Bestand, immer mit Grund (protokolliert, auswertbar)')}
    <div class="card" style="padding:16px;display:grid;gap:12px"><label class="search-field" style="height:52px">${ic('barcode')}<input id="bkEan" value="${esc(BK.ean)}" placeholder="EAN scannen und Enter" autocomplete="off"></label>
      ${x ? `<div style="display:flex;gap:12px;align-items:center"><div style="flex:1"><b>${esc(x.a.name)}</b> <span class="muted">· ${esc(vname(x.v))}</span><div class="muted" style="font-size:12.5px">aktueller Bestand <b style="color:var(--text)">${x.v.q}</b></div></div></div>
        <div class="ed-grid"><label class="field"><span>Art</span><select class="input select" id="bkArt"><option value="ab">Abgang (−)</option><option value="zu">Zugang (+)</option><option value="ist">Gezählter Bestand (setzen)</option></select></label><label class="field"><span>Menge</span><input class="input num" id="bkQty" value="1" inputmode="numeric"></label>
          <label class="field"><span>Grund</span><select class="input select" id="bkGrund">${BK_GRUENDE.map(g => `<option>${g}</option>`).join('')}</select></label><label class="field"><span>Notiz</span><input class="input" id="bkNote" placeholder="optional"></label></div>
        <div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" data-bkgo>${ic('check', 'i-sm')}Korrektur buchen</button></div>` : BK.ean ? `<div style="color:var(--neg)">EAN ${esc(BK.ean)} unbekannt</div>` : ''}</div>
    <div class="card" style="margin-top:14px"><div class="set-row"><div class="set-l">Letzte Korrekturen</div><div class="set-h">${num(log.length)}</div></div>${log.length ? `<table class="tbl" style="margin:0"><tbody>${log.map(m => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(m.ts))}</td><td><b>${esc(m.name)}</b> <span class="muted">${esc(colorName(m.color))} · ${esc(m.size)}</span></td><td>${esc(m.reason.replace('Bestandskorrektur: ', ''))}</td><td>${esc(m.user || '')}</td><td class="r num" style="color:var(--${m.delta >= 0 ? 'pos' : 'neg'})">${m.delta > 0 ? '+' : ''}${m.delta}</td><td class="r num" style="padding-right:16px">${m.stock_after}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:24px"><p>Noch keine Korrekturen.</p></div>'}</div></div>`;
  setTimeout(() => (x ? $('#bkQty') : $('#bkEan'))?.focus(), 60);
}

/* ── Picklisten ── */
DK.pickliste = {t: 'Übersicht Picklisten', one: 'Pickliste', ic: 'list', page: 'picklisten', partner: 'kunde', optPartner: true, lines: true, print: 'Pickliste', sub: 'Ware für Umlagerungen, Lieferscheine, Reservierungen und Nachsortierung zusammenstellen',
  head: [{k: 'data.zweck', l: 'Zweck', t: 'select', o: ['Nachsortierung', 'Umlagerung', 'Lieferschein', 'Reservierung', 'Auswahl', 'Sonstiges']}, {k: 'data.notiz', l: 'Notiz', full: true}],
  acts: {offen: [['erledigen', 'Erledigt', 'primary'], ['stornieren', 'Verwerfen', 'danger']]}};
DOC_EDIT.pickliste = ['offen'];
Object.assign(DST, {durchgefuehrt: ['durchgeführt', 'pos'], geplant: ['geplant', 'info']});
docPage('picklisten', 'pickliste', {tabs: [['offen', 'Offen', s => s === 'offen'], ['erledigt', 'Erledigt', s => s === 'erledigt'], ['alle', 'Alle', () => true]], newLabel: 'Leere Pickliste', actions: `<button class="btn btn-secondary" data-pl="auto">${ic('sparkle', 'i-sm')}Pickliste aus offenen Vorgängen</button>`,
  cols: [{l: 'Zweck', f: d => esc(d.data.zweck || '')}, {l: 'Positionen', r: true, f: d => num((d.data.lines || []).length)}, {l: 'Stück', r: true, f: d => num((d.data.lines || []).reduce((s, l) => s + (+l.qty || 0), 0))}]});
async function picklistAuto() {
  const src = {};
  const add = (ean, qty, q) => { if (!ean || !(qty > 0)) return; const x = findEan(ean); (src[ean] ||= {ean, qty: 0, quellen: new Set(), x}); src[ean].qty += qty; src[ean].quellen.add(q); };
  try {
    const docs = await docLoad(['lieferschein', 'reservierung', 'auswahl']);
    docs.filter(d => (d.kind === 'lieferschein' && d.status === 'entwurf') || (d.kind === 'reservierung' && ['angefragt', 'reserviert'].includes(d.status)) || (d.kind === 'auswahl' && d.status === 'entwurf')).forEach(d => (d.data.lines || []).forEach(l => add(l.ean, +l.qty, d.no)));
    if (vbOn()) (await vbLoadTr()).filter(t => t.status === 'angefordert' && t.from === vbOwn()).forEach(t => t.lines.forEach(l => add(l.ean, l.qty, t.no)));
  } catch (e) { return toast('Nicht möglich', {t2: String(e), type: 'warn'}); }
  const lines = Object.values(src).sort((a, b) => lagerplatz(a.x?.a).localeCompare(lagerplatz(b.x?.a))).map(r => ({ean: r.ean, sku: r.x?.a.id, name: `${r.x ? lineName(r.x.a, r.x.v) : r.ean}${lagerplatz(r.x?.a) ? ' · Platz ' + lagerplatz(r.x.a) : ''} · für ${[...r.quellen].join(', ')}`, qty: r.qty, price: 0, vat: 20}));
  if (!lines.length) return toast('Nichts zu picken', {t2: 'Keine offenen Lieferscheine, Reservierungen, Auswahlen oder Umlagerungen', icon: 'check'});
  openDoc('pickliste', null, {partner_name: 'Lager', data: {zweck: 'Sonstiges', lines}, focusSearch: false});
}

/* ── Preisänderungen ── */
DK.preis = {t: 'Preisänderungen', one: 'Preisänderung', ic: 'tag', page: 'preis-uebersicht', perm: 'artikel.bearbeiten', partner: 'kunde', optPartner: true, lines: true, price: 'vk', sub: 'Verkaufspreise ändern – sofort oder geplant zu einem Datum',
  head: [{k: 'date', l: 'Gültig ab', t: 'date'}, {k: 'data.grund', l: 'Grund', t: 'select', o: ['Preisanpassung Lieferant', 'Saisonwechsel', 'Abverkauf', 'Wettbewerb', 'Sonstiges']}],
  acts: {geplant: [['durchfuehren', 'Jetzt durchführen', 'primary', {confirm: 'Preise jetzt ändern?'}], ['stornieren', 'Verwerfen', 'danger']]}};
DOC_EDIT.preis = ['geplant'];
DOC_AFTER.preis = {durchfuehren: async st => { await reloadArt(); toast('Preise geändert', {t2: `${st.data.lines.length} Artikel – Etiketten drucken?`, icon: 'tag', action: {label: 'Etiketten', run: () => openLabels(st.data.lines.map(l => artById(l.sku)).filter(Boolean).flatMap(a => a.variants.filter(v => v.q > 0).map(v => ({a, v, n: v.q}))))}}); }};
docPage('preis-uebersicht', 'preis', {title: 'Übersicht Preisänderungen', tabs: [['alle', 'Alle', () => true], ['durch', 'Durchgeführt', s => s === 'durchgefuehrt']], defTab: 'alle', noNew: true, actions: `<button class="btn btn-primary" data-goto="preisaenderung">${ic('plus', 'i-sm')}Preisänderung</button>`,
  cols: [{l: 'Gültig ab', f: d => esc(dDate(d.date))}, {l: 'Artikel', r: true, f: d => num((d.data.lines || []).length)}, {l: 'Grund', f: d => esc(d.data.grund || '')}]});
docPage('preis-geplant', 'preis', {title: 'Geplante Preisänderungen', tabs: [['geplant', 'Geplant', s => s === 'geplant']], defTab: 'geplant', noNew: true, actions: `<button class="btn btn-primary" data-goto="preisaenderung">${ic('plus', 'i-sm')}Preisänderung</button>`,
  cols: [{l: 'Gültig ab', f: d => `<b>${esc(dDate(d.date))}</b>`}, {l: 'Artikel', r: true, f: d => num((d.data.lines || []).length)}]});
const PC = {cat: 'alle', brand: '', q: '', sel: new Set(), modus: 'prozent', wert: '', runden: '90', ab: '', grund: 'Saisonwechsel'};
registerPage('preisaenderung', {title: 'Preisänderung', sub: () => 'mehrere Artikel auf einmal', render: renderPreisAend});
const pcNew = a => { const w = parseAmt(PC.wert); if (!isFinite(w) || PC.wert === '') return null; let p = PC.modus === 'prozent' ? a.price * (1 + w / 100) : PC.modus === 'betrag' ? a.price + w : w; if (p <= 0) return null; if (PC.runden !== 'kein') { const c = +PC.runden / 100; p = Math.floor(p) + c; if (p < (PC.modus === 'prozent' ? a.price * (1 + w / 100) : p) - 0.5) p += 1; } return r2(p); };
function renderPreisAend() {
  const v = $('#view-preisaenderung'), n = norm(PC.q);
  const list = ART.filter(a => (PC.cat === 'alle' || a.cat === PC.cat) && (!PC.brand || a.brand === PC.brand) && (!n || a.hay.includes(n)));
  v.innerHTML = `<div class="cv">${pageHead('Preisänderung', 'Artikel auswählen, neuen Preis festlegen (Prozent, Betrag oder fix, mit Preisschwelle), sofort oder ab Datum', `<button class="btn btn-secondary" data-goto="preis-geplant">${ic('clock', 'i-sm')}Geplante</button>`)}
    <div class="card" style="padding:16px;display:grid;gap:12px;margin-bottom:14px"><div class="ed-grid">
      <label class="field"><span>Änderung</span><select class="input select" id="pcModus"><option value="prozent" ${PC.modus === 'prozent' ? 'selected' : ''}>um Prozent (+/−)</option><option value="betrag" ${PC.modus === 'betrag' ? 'selected' : ''}>um Betrag € (+/−)</option><option value="fix" ${PC.modus === 'fix' ? 'selected' : ''}>neuer Preis €</option></select></label>
      <label class="field"><span>Wert</span><input class="input num" id="pcWert" value="${esc(PC.wert)}" placeholder="z. B. 5 oder −10"></label>
      <label class="field"><span>Preisschwelle</span><select class="input select" id="pcRund">${[['kein', 'keine Rundung'], ['90', ',90'], ['95', ',95'], ['99', ',99'], ['0', ',00']].map(([k, l]) => `<option value="${k}" ${PC.runden === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Gültig ab (leer = sofort)</span><input class="input" type="date" id="pcAb" value="${esc(PC.ab)}"></label></div></div>
    <div class="filters"><input class="input" id="pcQ" value="${esc(PC.q)}" placeholder="Suchen …" style="max-width:260px"><select class="input select" id="pcCat" style="width:auto">${CATS.map(c => `<option value="${c.id}" ${c.id === PC.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><select class="input select" id="pcBrand" style="width:auto"><option value="">alle Marken</option>${[...new Set(ART.map(a => a.brand))].sort().map(b => `<option ${b === PC.brand ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" data-pc="alle">alle wählen</button><span class="sp" style="flex:1"></span><button class="btn btn-primary" data-pc="go" ${PC.sel.size ? '' : 'disabled'}>${ic('check', 'i-sm')}${PC.sel.size} Artikel ${PC.ab && PC.ab > today() ? 'planen' : 'ändern'}</button></div>
    <div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px;width:34px"></th><th>Artikel</th><th class="r">EK</th><th class="r">VK alt</th><th class="r">VK neu</th><th class="r" style="padding-right:16px">Marge neu</th></tr></thead><tbody>${list.slice(0, 300).map(a => { const np = pcNew(a); return `<tr><td style="padding-left:16px"><input type="checkbox" data-pcs="${esc(a.id)}" ${PC.sel.has(a.id) ? 'checked' : ''}></td><td><b>${esc(a.name)}</b> <span class="muted">· ${esc(a.brand)}</span></td><td class="r num">${a.cost != null ? eur(a.cost) : '–'}</td><td class="r num">${eur(a.price)}</td><td class="r num" style="font-weight:650;color:${np == null ? 'inherit' : np > a.price ? 'var(--pos)' : 'var(--neg)'}">${np != null ? eur(np) : '–'}</td><td class="r num" style="padding-right:16px">${np != null && a.cost != null ? num((np / 1.2 - a.cost) / (np / 1.2) * 100, 1) + ' %' : '–'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
}
async function preisGo() {
  const lines = [...PC.sel].map(id => artById(id)).filter(Boolean).map(a => ({sku: a.id, name: a.name, alt: Math.round(a.price * 100), neu: Math.round((pcNew(a) || 0) * 100), qty: 1, price: Math.round((pcNew(a) || 0) * 100), vat: a.vat ?? 20})).filter(l => l.neu > 0);
  if (!lines.length) return toast('Wert eingeben', {type: 'warn'});
  try { await needPerm('artikel.bearbeiten', 'Preisänderung'); } catch { return; }
  try {
    const d = await invoke('doc_save', {doc: {kind: 'preis', partner_name: 'Preisänderung', date: PC.ab || today(), data: {lines, grund: PC.grund, modus: PC.modus, wert: PC.wert}}, user: S.user.name});
    if (!PC.ab || PC.ab <= today()) { await invoke('doc_action', {id: d.id, action: 'durchfuehren', payload: {}, user: S.user.name}); await reloadArt(); toast('Preise geändert', {t2: `${lines.length} Artikel · ${d.no}`, type: 'pos', icon: 'tag', action: {label: 'Etiketten', run: () => openLabels(lines.map(l => artById(l.sku)).filter(Boolean).flatMap(a => a.variants.filter(v => v.q > 0).map(v => ({a, v, n: v.q}))))}}); }
    else toast('Preisänderung geplant', {t2: `${lines.length} Artikel ab ${dDate(PC.ab)} · ${d.no}`, type: 'pos', icon: 'clock'});
    Hooks.emit('pricing.change', {nr: d.no, artikel: lines.length, ab: PC.ab || today()}); PC.sel.clear(); renderPreisAend();
  } catch (e) { toast('Nicht möglich', {t2: String(e), type: 'warn'}); }
}
// geplante Preisänderungen fällig → durchführen (beim Start und jede Minute)
async function runDuePrices() {
  if (!DESKTOP) return;
  try { const l = (await invoke('doc_list', {kinds: ['preis'], status: 'geplant', limit: 100})).filter(d => d.date <= today()); for (const d of l) { await invoke('doc_action', {id: d.id, action: 'durchfuehren', payload: {}, user: 'Zeitplan'}); toast('Geplante Preisänderung durchgeführt', {t2: `${d.no} · ${d.data.lines.length} Artikel`, icon: 'tag', type: 'accent'}); } if (l.length) await reloadArt(); } catch { /* */ }
}

/* ── Nachsortierung ── */
const nsParam = () => ({tage: 1, quelle: 'lager', min: 1, feld: 'Lagerplatz', nos: true, ...(CFG['nachsort.param'] || {})});
async function nsRows(withNos) {
  const p = nsParam(), since = dayStart(Math.max(0, p.tage - 1)), sold = {};
  if (DESKTOP) { try { (await invoke('stock_moves', {articleId: null, limit: 8000})).filter(m => m.reason === 'Verkauf' && new Date(m.ts) >= since).forEach(m => { const a = artById(m.article_id), v = a?.variants.find(x => x.vid === m.variant_id); if (v) sold[v.ean] = (sold[v.ean] || 0) - m.delta; }); } catch { /* */ } }
  const nos = withNos ? nosShort() : {};
  const eans = new Set([...Object.keys(sold), ...Object.keys(nos)]);
  return [...eans].map(ean => { const x = findEan(ean); const q = Math.max(sold[ean] || 0, nos[ean] || 0); return x && q >= p.min ? {x, ean, verkauft: sold[ean] || 0, nos: nos[ean] || 0, menge: q, platz: lagerplatz(x.a)} : null; }).filter(Boolean).sort((a, b) => a.platz.localeCompare(b.platz) || a.x.a.name.localeCompare(b.x.a.name));
}
for (const [id, nos, title] of [['nachsortierung', false, 'Nachsortierung'], ['nachsort-nos', true, 'Nachsortierung aus NOS und Verkauf']]) {
  registerPage(id, {title, sub: () => 'Nachschub für die Verkaufsfläche', render: async () => {
    const v = $('#view-' + id), p = nsParam(), rows = await nsRows(nos);
    v.innerHTML = `<div class="cv">${pageHead(title, `${nos ? 'NOS-Fehlmengen und ' : ''}Verkäufe der letzten ${p.tage} Tag(e) nachfüllen – aus dem Lager (Pickliste), per Umlagerung oder Bestellung`, `<button class="btn btn-secondary" data-goto="nachsort-param">${ic('sliders', 'i-sm')}Parameter</button><button class="btn btn-secondary" data-ns="liste">${ic('printer', 'i-sm')}Lagerliste drucken</button><button class="btn btn-secondary" data-ns="pick" ${rows.length ? '' : 'disabled'}>${ic('list', 'i-sm')}Pickliste</button>${vbOn() && vbRole() === 'filiale' ? `<button class="btn btn-secondary" data-ns="ul" ${rows.length ? '' : 'disabled'}>${ic('swap', 'i-sm')}Bei Zentrale anfordern</button>` : ''}<button class="btn btn-primary" data-ns="po" ${rows.length ? '' : 'disabled'}>${ic('truck', 'i-sm')}Bestellentwürfe</button>`)}
      ${kpiCards([[num(rows.length), 'Varianten'], [num(rows.reduce((s, r) => s + r.menge, 0)), 'Stück nachzusortieren'], [num(rows.filter(r => r.x.v.q <= 0).length), 'im Lager nicht vorrätig', 'warn']])}
      <div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Lagerplatz</th><th>Artikel</th><th>Variante</th><th class="r">verkauft</th>${nos ? '<th class="r">NOS-Fehl</th>' : ''}<th class="r">Bestand</th><th class="r" style="padding-right:16px">Menge</th></tr></thead><tbody>${rows.map(r => `<tr><td style="padding-left:16px" class="mono">${esc(r.platz || '–')}</td><td><b>${esc(r.x.a.name)}</b></td><td>${esc(vname(r.x.v))}</td><td class="r num">${r.verkauft}</td>${nos ? `<td class="r num">${r.nos || ''}</td>` : ''}<td class="r num" style="color:${r.x.v.q <= 0 ? 'var(--neg)' : 'inherit'}">${r.x.v.q}</td><td class="r num" style="padding-right:16px;font-weight:650">${r.menge}</td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:48px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><p>Nichts nachzusortieren.</p></div>`}</div></div>`;
    v._rows = rows;
  }});
}
registerPage('nachsort-liste', {title: 'Nachsortier-Lagerliste', sub: () => 'nach Lagerplatz', render: async () => {
  const v = $('#view-nachsort-liste'), rows = await nsRows(nsParam().nos);
  v.innerHTML = `<div class="cv">${pageHead('Nachsortier-Lagerliste', `Sortiert nach Lagerplatz (Artikelfeld „${esc(nsParam().feld)}“) – zum Ausdrucken und Abhaken im Lager`, `<button class="btn btn-primary" data-ns="liste">${ic('printer', 'i-sm')}Drucken</button>`)}<div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px;width:40px">✓</th><th>Lagerplatz</th><th>Artikel</th><th>Variante</th><th>EAN</th><th class="r" style="padding-right:16px">Menge</th></tr></thead><tbody>${rows.map(r => `<tr><td style="padding-left:16px">☐</td><td class="mono"><b>${esc(r.platz || '–')}</b></td><td>${esc(r.x.a.name)}</td><td>${esc(vname(r.x.v))}</td><td class="mono muted">${esc(r.ean)}</td><td class="r num" style="padding-right:16px;font-weight:650">${r.menge}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:48px"><p>Nichts nachzusortieren.</p></div>'}</div></div>`;
  v._rows = rows;
}});
function nsPrint(rows) {
  printHTML(letterHead('Nachsortier-Lagerliste', '', [['Datum', new Date().toLocaleString('de-AT')], ['Positionen', String(rows.length)]]) + `<table><thead><tr><th style="width:8mm">✓</th><th>Lagerplatz</th><th>Artikel</th><th>Variante</th><th>EAN</th><th class="r">Menge</th></tr></thead><tbody>${rows.map(r => `<tr><td>☐</td><td><b>${esc(r.platz || '–')}</b></td><td>${esc(r.x.a.name)}</td><td>${esc(vname(r.x.v))}</td><td>${esc(r.ean)}</td><td class="r"><b>${r.menge}</b></td></tr>`).join('')}</tbody></table>`, 'Nachsortier-Lagerliste');
}
registerPage('nachsort-param', {title: 'Parameter für Nachsortierung', sub: () => 'Zeitraum, Mindestmenge, Lagerplatz', render: () => {
  const v = $('#view-nachsort-param'), p = nsParam();
  v.innerHTML = `<div class="cv">${pageHead('Parameter für Nachsortierung', 'Wie Kontor den Nachschub für die Verkaufsfläche berechnet', `<button class="btn btn-primary" data-ns="param">${ic('check', 'i-sm')}Speichern</button>`)}<div class="card">
    <div class="set-row"><div><div class="set-l">Verkäufe der letzten</div><div class="set-h">1 = heute, 2 = heute und gestern …</div></div><div class="set-c"><input class="input num" id="npTage" value="${p.tage}" style="width:80px;text-align:right"> Tage</div></div>
    <div class="set-row"><div><div class="set-l">Mindestmenge</div><div class="set-h">kleinere Mengen werden nicht vorgeschlagen</div></div><div class="set-c"><input class="input num" id="npMin" value="${p.min}" style="width:80px;text-align:right"> Stück</div></div>
    <div class="set-row"><div><div class="set-l">Feld für Lagerplatz</div><div class="set-h">Artikelfeld, nach dem Lagerliste und Pickliste sortiert werden (z. B. „Lagerplatz“ mit Werten wie R2-04)</div></div><div class="set-c"><input class="input" id="npFeld" value="${esc(p.feld)}" style="width:180px"></div></div>
    <div class="set-row" style="border-bottom:0"><div><div class="set-l">NOS-Fehlmengen in die Lagerliste</div><div class="set-h">Sollbestände aus den NOS-Sortimenten berücksichtigen</div></div><div class="set-c"><button class="switch" role="switch" id="npNos" aria-checked="${!!p.nos}"></button></div></div></div></div>`;
}});

/* ── Artikelpflege ── */
registerPage('artikel-import', {title: 'Artikel-Import', sub: () => 'aus Excel/CSV', render: () => {
  $('#view-artikel-import').innerHTML = `<div class="cv">${pageHead('Artikel-Import', 'Artikel aus Excel (als CSV gespeichert) übernehmen – eine Zeile je Variante, mit Spaltenzuordnung, Vorschau und Prüfung')}<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('download')}</div><h3>Artikel importieren</h3><p>Neue Farben und Warengruppen werden automatisch angelegt. Alles oder nichts – bei Fehlern wird nichts übernommen.</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-primary" data-imp="artikel">${ic('download', 'i-sm')}Datei wählen …</button><button class="btn btn-secondary" data-imp="bestand">Bestände importieren</button><button class="btn btn-secondary" data-goto="import-protokoll">Protokoll</button></div></div></div></div>`;
}});
registerPage('import-protokoll', {title: 'Protokoll Artikel-Importe', sub: () => 'alle Importe', render: async () => {
  const v = $('#view-import-protokoll'); let l = [];
  if (DESKTOP) { try { l = await invoke('audit_query', {q: null, prefix: 'catalog.import', before: null, limit: 500}); } catch { /* */ } }
  v.innerHTML = `<div class="cv">${pageHead('Protokoll Artikel-Importe', 'Wann wurde was von wem importiert')}<div class="card">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Benutzer</th><th class="r">Artikel</th><th class="r" style="padding-right:16px">Bestände</th></tr></thead><tbody>${l.map(x => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(x.ts))}</td><td>${esc(x.payload?.benutzer || '')}</td><td class="r num">${num(x.payload?.artikel || 0)}</td><td class="r num" style="padding-right:16px">${num(x.payload?.bestaende || 0)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Noch keine Importe.</p></div>'}</div></div>`;
}});
const EZ = {sel: null, q: ''};
const eanOk = e => /^\d{13}$/.test(e) && ean13(e.slice(0, 12)) === e || /^\d{8}$/.test(e) || /^\d{12}$/.test(e) || /^\d{14}$/.test(e);
registerPage('ean-zuordnung', {title: 'Artikel-EAN/GTIN-Zuordnung', sub: () => 'Barcodes pflegen', render: () => {
  const v = $('#view-ean-zuordnung'), a = EZ.sel ? artById(EZ.sel) : null;
  v.innerHTML = `<div class="cv">${pageHead('Artikel-EAN/GTIN-Zuordnung', 'Hersteller-Barcodes (EAN/GTIN) den Varianten zuordnen – mit Prüfziffernkontrolle; eigene Kontor-EANs bleiben möglich')}${artPicker('ean-zuordnung', EZ.q)}
    ${a ? `<div class="card" style="margin-top:14px"><div class="set-row"><div class="set-l">${esc(a.name)}</div><div class="set-c"><button class="btn btn-primary btn-sm" data-ezsave>${ic('check', 'i-sm')}Speichern</button></div></div><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Variante</th><th>EAN / GTIN</th><th>Prüfung</th></tr></thead><tbody>${a.variants.map(x => `<tr><td style="padding-left:16px"><b>${esc(vname(x))}</b></td><td><input class="input mono" data-ez="${x.vid}" value="${esc(x.ean)}" style="height:32px;width:220px"></td><td data-ezc="${x.vid}">${eanOk(x.ean) ? `<span style="color:var(--pos)">${ic('check', 'i-xs')} gültig</span>` : `<span style="color:var(--warn)">${ic('alert', 'i-xs')} Prüfziffer?</span>`}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
}});
const AS = {cat: ''};
registerPage('artikelsortierung', {title: 'Manuelle Artikelsortierung', sub: () => 'Reihenfolge an der Kasse', render: () => {
  const v = $('#view-artikelsortierung'); AS.cat ||= CATS[1]?.id || 'alle';
  const l = ART.filter(a => AS.cat === 'alle' || a.cat === AS.cat).sort((a, b) => b.pop - a.pop);
  v.innerHTML = `<div class="cv">${pageHead('Manuelle Artikelsortierung', 'Reihenfolge der Kacheln an der Kasse festlegen (je Warengruppe) – oben = zuerst', `<button class="btn btn-primary" data-as="save">${ic('check', 'i-sm')}Reihenfolge speichern</button>`)}
    <div class="filters"><div class="seg" id="asSeg">${CATS.map(c => `<button data-v="${c.id}" aria-pressed="${AS.cat === c.id}">${esc(c.name)}</button>`).join('')}</div></div>
    <div class="card"><div id="asList">${l.map((a, i) => `<div class="set-row" data-asi="${esc(a.id)}" draggable="true" style="cursor:grab"><div style="display:flex;gap:12px;align-items:center"><span class="muted num" style="width:26px">${i + 1}</span><div style="width:40px;height:40px;border-radius:10px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center">${artVisual(a, COLORS[a.colors[0]]?.[1] || '#888')}</div><div><b>${esc(a.name)}</b><div class="muted" style="font-size:12px">${esc(a.brand)} · ${eur(a.sale || a.price)}</div></div></div><div class="set-c" style="gap:4px"><button class="btn btn-ghost btn-icon btn-sm" data-asu="${esc(a.id)}" aria-label="nach oben">${ic('up', 'i-sm')}</button><button class="btn btn-ghost btn-icon btn-sm" data-asd="${esc(a.id)}" aria-label="nach unten">${ic('down', 'i-sm')}</button></div></div>`).join('')}</div></div></div>`;
  initSeg($('#asSeg', v), b => { AS.cat = b.dataset.v; PAGES.artikelsortierung.render(); });
}});
registerPage('master-artikel', {title: 'Master-Artikel', sub: () => 'Vorlagen für neue Artikel', render: () => {
  const v = $('#view-master-artikel'), masters = ART.filter(a => a.fields?.['Master'] === 'ja');
  v.innerHTML = `<div class="cv">${pageHead('Master-Artikel', 'Artikel als Vorlage markieren und daraus neue Artikel (z. B. neue Saison, neues Modell) mit allen Feldern, Farben und Größen anlegen – neue EANs werden vergeben')}${artPicker('master-artikel', MA.q)}
    <div class="card" style="margin-top:14px">${masters.length ? masters.map(a => `<div class="set-row"><div style="display:flex;gap:12px;align-items:center"><div style="width:40px;height:40px;border-radius:10px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center">${artVisual(a, COLORS[a.colors[0]]?.[1] || '#888')}</div><div><b>${esc(a.name)}</b><div class="muted" style="font-size:12px">${esc(a.id)} · ${a.colors.length} Farben × ${a.sizes.length} Größen · ${eur(a.price)}</div></div></div><div class="set-c" style="gap:6px"><button class="btn btn-secondary btn-sm" data-maneu="${esc(a.id)}">${ic('copy', 'i-sm')}Neuer Artikel daraus</button><button class="btn btn-ghost btn-sm" data-maoff="${esc(a.id)}">Kein Master</button></div></div>`).join('') : '<div class="empty" style="padding:40px"><p>Noch kein Master-Artikel – oben einen Artikel suchen und als Master markieren.</p></div>'}</div></div>`;
}});
const MA = {q: ''};
async function artSave(a) { replaceCatalog(await invoke('article_save', {article: artToDb(a), user: S.user.name})); }

function bindArtikel() {
  // Artikelsuche in allen Info-/Planungsseiten
  const pickers = {artikelinfo: AIF, 'artikelinfo-plus': AIF, 'artikelinfo-kompakt': AIF, 'ul-planung': UP, 'ul-anforderung': UA, 'ean-zuordnung': EZ, 'master-artikel': MA};
  document.addEventListener('input', e => {
    const q = e.target.closest?.('[data-apq]'); if (!q) return;
    const st = pickers[q.dataset.apq]; st.q = q.value; clearTimeout(q._t);
    q._t = setTimeout(() => { const host = q.closest('div[style*="position:relative"]'); host.outerHTML = artPicker(q.dataset.apq, st.q); const n = $(`[data-apq="${q.dataset.apq}"]`); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 120);
  });
  document.addEventListener('keydown', e => {
    const q = e.target.closest?.('[data-apq]'); if (!q || e.key !== 'Enter') return;
    const x = findEan(q.value.trim()), st = pickers[q.dataset.apq], a = x?.a || ART.find(y => y.hay.includes(norm(q.value)));
    if (!a) return shakeEl(q);
    if (st === MA) { a.fields = {...a.fields, Master: 'ja'}; artSave(a).then(() => { MA.q = ''; PAGES['master-artikel'].render(); toast(`${a.name} ist Master-Artikel`, {icon: 'copy', type: 'pos'}); }); return; }
    st.sel = a.id; st.q = ''; PAGES[S.view].render();
  });
  document.addEventListener('click', async e => {
    if (!e.target.closest('#views')) return;
    const k = e.target.closest('[data-apk]'); if (k) { const p = k.closest('[style*="position:relative"]').querySelector('[data-apq]').dataset.apq, st = pickers[p]; if (st === MA) { const a = artById(k.dataset.apk); a.fields = {...a.fields, Master: 'ja'}; await artSave(a); MA.q = ''; return PAGES['master-artikel'].render(); } st.sel = k.dataset.apk; st.q = ''; return PAGES[S.view].render(); }
    const ao = e.target.closest('[data-aiopen]'); if (ao) { AIF.sel = ao.dataset.aiopen; return go('artikelinfo'); }
    const ed = e.target.closest('[data-aied]'); if (ed) return openEditor(artById(ed.dataset.aied));
    const lb = e.target.closest('[data-ailbl]'); if (lb) { const a = artById(lb.dataset.ailbl); return openLabels(a.variants.filter(v => v.q > 0).map(v => ({a, v, n: v.q}))); }
    // Umlagerungen
    if (e.target.closest('[data-ulnew]')) return openTransferNew();
    const ts = e.target.closest('[data-tst2]'); if (ts) { await transferStatus(ts.dataset.no, ts.dataset.tst2); return PAGES[S.view].render(); }
    if (e.target.closest('[data-upgo]')) {
      const by = {}; $$('[data-upq]').forEach(i => { const q = parseInt(i.value, 10) || 0; if (q > 0) { const x = findEan(i.dataset.upq); (by[i.dataset.to] ||= []).push({ean: i.dataset.upq, qty: q, name: x ? lineName(x.a, x.v) : ''}); } });
      if (!Object.keys(by).length) return toast('Mengen eintragen', {type: 'warn'});
      let n = 0; for (const [to, lines] of Object.entries(by)) { try { await invoke('verbund_transfer_create', {from: UP.from, to, lines, note: 'Umlagerungsplanung', user: S.user.name}); n++; } catch (err) { toast('Fehler', {t2: String(err), type: 'warn', dur: 8000}); } }
      toast(`${n} Umlagerungen angelegt`, {t2: 'im Umlagerungs-Pool', type: 'pos', icon: 'swap'}); Hooks.emit('verbund.transfer.planned', {anzahl: n}); return renderUlPlanung();
    }
    if (e.target.closest('[data-uago]')) {
      const by = {}; $$('[data-uaq]').forEach(i => { const q = parseInt(i.value, 10) || 0; if (q > 0) { const from = $(`[data-uaf="${i.dataset.uaq}"]`).value, x = findEan(i.dataset.uaq); (by[from] ||= []).push({ean: i.dataset.uaq, qty: q, name: x ? lineName(x.a, x.v) : ''}); } });
      if (!Object.keys(by).length) return toast('Mengen eintragen', {type: 'warn'});
      for (const [from, lines] of Object.entries(by)) { try { const t = await invoke('verbund_transfer_create', {from, to: vbOwn(), lines, note: 'Umbuchungsanforderung', user: S.user.name}); toast('Angefordert', {t2: `${t.no} aus ${storeName(from)}`, type: 'pos', icon: 'swap'}); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn', dur: 8000}); } }
      UA.sel = null; return PAGES['ul-anforderung'].render();
    }
    const ur = e.target.closest('[data-ulr]'); if (ur) {
      const l = $('#view-ul-rechnung')._by[ur.dataset.ulr]; const agg = {};
      l.forEach(t => t.lines.forEach(x => { const f = findEan(x.ean); (agg[x.ean] ||= {ean: x.ean, sku: f?.a.id, name: f ? lineName(f.a, f.v) : x.name, qty: 0, price: Math.round((f?.a.cost || 0) * 120), vat: 20}).qty += x.qty; }));
      await saveSettings({'ul.berechnet': [...(CFG['ul.berechnet'] || []), ...l.map(t => t.no)]}, true);
      openDoc('rechnung', null, {partner_name: `Filiale ${storeName(ur.dataset.ulr)}`, ref: l.map(t => t.no).join(', ').slice(0, 140), data: {bestand: false, zahlungsziel: 30, text: 'Interne Verrechnung der Umlagerungen zu Einstandspreisen (EK zzgl. USt).', lines: Object.values(agg)}, focusSearch: false});
      return;
    }
    // NOS
    if (e.target.closest('[data-nos="neu"]')) return openNos(null);
    const ne = e.target.closest('[data-nose]'); if (ne) return openNos(+ne.dataset.nose);
    // Bestandskorrektur
    if (e.target.closest('[data-bkgo]')) {
      const x = findEan(BK.ean); if (!x) return;
      const art = $('#bkArt').value, q = parseInt($('#bkQty').value, 10); if (!(q >= 0) || (art !== 'ist' && !q)) return shakeEl($('#bkQty'));
      try { await needPerm('bestand.buchen', 'Bestandskorrektur'); } catch { return; }
      const reason = `Bestandskorrektur: ${$('#bkGrund').value}${$('#bkNote').value.trim() ? ' – ' + $('#bkNote').value.trim() : ''}`;
      try { await bookStock(x.a, x.v, art === 'ab' ? -q : q, art === 'ist', reason); toast('Korrektur gebucht', {t2: `${x.a.name} · ${vname(x.v)} · Bestand ${x.v.q}`, type: 'pos', icon: 'edit'}); BK.ean = ''; renderBestKorr(); } catch (err) { toast('Nicht gebucht', {t2: String(err), type: 'warn'}); }
      return;
    }
    if (e.target.closest('[data-pl="auto"]')) return picklistAuto();
    // Preisänderung
    const pcs = e.target.closest('[data-pcs]'); if (pcs) { pcs.checked ? PC.sel.add(pcs.dataset.pcs) : PC.sel.delete(pcs.dataset.pcs); const b = $('[data-pc="go"]'); b.disabled = !PC.sel.size; b.lastChild.textContent = `${PC.sel.size} Artikel ${PC.ab && PC.ab > today() ? 'planen' : 'ändern'}`; return; }
    if (e.target.closest('[data-pc="alle"]')) { $$('[data-pcs]').forEach(c => PC.sel.add(c.dataset.pcs)); return renderPreisAend(); }
    if (e.target.closest('[data-pc="go"]')) return preisGo();
    // Nachsortierung
    const ns = e.target.closest('[data-ns]'); if (ns) {
      const rows = $('#view-' + S.view)?._rows || await nsRows(nsParam().nos);
      if (ns.dataset.ns === 'liste') return nsPrint(rows);
      if (ns.dataset.ns === 'pick') return openDoc('pickliste', null, {partner_name: 'Verkaufsfläche', data: {zweck: 'Nachsortierung', lines: rows.map(r => ({ean: r.ean, sku: r.x.a.id, name: `${lineName(r.x.a, r.x.v)}${r.platz ? ' · Platz ' + r.platz : ''}`, qty: r.menge, price: 0, vat: 20}))}, focusSearch: false});
      if (ns.dataset.ns === 'ul') { try { const t = await invoke('verbund_transfer_create', {from: (VB.info?.stores || []).find(s => s.id !== vbOwn())?.id || 'ZEN', to: vbOwn(), lines: rows.map(r => ({ean: r.ean, qty: r.menge, name: lineName(r.x.a, r.x.v)})), note: 'Nachsortierung', user: S.user.name}); toast('Bei der Zentrale angefordert', {t2: t.no, type: 'pos', icon: 'swap'}); } catch (err) { toast('Nicht möglich', {t2: String(err), type: 'warn'}); } return; }
      if (ns.dataset.ns === 'po') { await loadPurchasing(); const by = {}; rows.forEach(r => (by[r.x.a.supplierId || ''] ||= []).push(r)); let n = 0; for (const [sid, l] of Object.entries(by)) { if (!sid) continue; try { const id = await invoke('po_save', {id: null, supplier: sid, note: 'aus Nachsortierung', lines: l.map(r => ({variant_id: r.x.v.vid, qty: r.menge, cost: r.x.a.cost != null ? Math.round(r.x.a.cost * 100) : null})), user: S.user.name}); await invoke('po_set_type', {id, orderType: 'Nachorder'}); n++; } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } } EK.loaded = false; toast(`${n} Bestellentwürfe angelegt`, {t2: by[''] ? `${by[''].length} Varianten ohne Lieferant übersprungen` : 'unter Order prüfen', type: 'pos', icon: 'truck'}); return; }
      if (ns.dataset.ns === 'param') { await saveSettings({'nachsort.param': {tage: Math.max(1, parseInt($('#npTage').value, 10) || 1), min: Math.max(1, parseInt($('#npMin').value, 10) || 1), feld: $('#npFeld').value.trim() || 'Lagerplatz', nos: $('#npNos').getAttribute('aria-checked') === 'true', quelle: 'lager'}}); return; }
    }
    const sw = e.target.closest('#npNos'); if (sw) sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true');
    // Artikelpflege
    const imp = e.target.closest('[data-imp]'); if (imp) return openImport(imp.dataset.imp);
    if (e.target.closest('[data-ezsave]')) {
      const a = artById(EZ.sel), vals = $$('[data-ez]').map(i => ({vid: +i.dataset.ez, ean: i.value.trim()}));
      const all = new Set(ART.flatMap(x => x.variants.filter(v => !vals.some(y => y.vid === v.vid)).map(v => v.ean)));
      const dup = vals.find(x => all.has(x.ean) || vals.filter(y => y.ean === x.ean).length > 1); if (dup) return toast(`EAN ${dup.ean} ist bereits vergeben`, {type: 'warn'});
      if (vals.some(x => !/^\d{8,14}$/.test(x.ean))) return toast('EAN: 8 bis 14 Ziffern', {type: 'warn'});
      try { await needPerm('artikel.bearbeiten', 'EAN ändern'); vals.forEach(x => { a.variants.find(v => v.vid === x.vid).ean = x.ean; }); await artSave(a); toast('EANs gespeichert', {t2: a.name, type: 'pos', icon: 'barcode'}); Hooks.emit('catalog.ean.changed', {sku: a.id}); } catch (err) { toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      return;
    }
    const au = e.target.closest('[data-asu]'), ad = e.target.closest('[data-asd]');
    if (au || ad) { const row = $(`[data-asi="${CSS.escape((au || ad).dataset[au ? 'asu' : 'asd'])}"]`), sib = au ? row.previousElementSibling : row.nextElementSibling; if (sib) au ? sib.before(row) : sib.after(row); return; }
    if (e.target.closest('[data-as="save"]')) {
      const ids = $$('[data-asi]').map(r => r.dataset.asi), top = Math.max(...ART.map(a => a.pop || 0), 100) + ids.length;
      try { await needPerm('artikel.bearbeiten', 'Artikelsortierung'); for (const [i, id] of ids.entries()) { const a = artById(id), p = top - i; if (a.pop !== p) { a.pop = p; await invoke('article_save', {article: artToDb(a), user: S.user.name}); } } await reloadArt(); toast('Reihenfolge gespeichert', {t2: 'gilt an der Kasse', type: 'pos', icon: 'list'}); } catch (err) { toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      return;
    }
    const mn = e.target.closest('[data-maneu]'); if (mn) {
      const m = artById(mn.dataset.maneu), used = new Set(ART.flatMap(x => x.variants.map(v => v.ean))), id = nextArtId();
      const copy = {...JSON.parse(JSON.stringify({...m, variants: []})), id, name: m.name + ' (neu)', fields: {...m.fields, Master: 'nein', 'Master-Artikel': m.id}, pop: 50, image: m.image};
      copy.variants = m.variants.map(v => { const ean = newEan(id, used); used.add(ean); return {c: v.c, s: v.s, ean, q: 0, other: null}; });
      finishArt(copy);
      try { await artSave(copy); toast('Artikel angelegt', {t2: `${copy.id} aus Master ${m.id} – jetzt anpassen`, type: 'pos', icon: 'copy'}); openEditor(artById(id)); } catch (err) { toast('Nicht angelegt', {t2: String(err), type: 'warn'}); }
      return;
    }
    const mo = e.target.closest('[data-maoff]'); if (mo) { const a = artById(mo.dataset.maoff); a.fields = {...a.fields, Master: 'nein'}; await artSave(a); return PAGES['master-artikel'].render(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'upFrom') { UP.from = e.target.value; renderUlPlanung(); }
    if (['pcModus', 'pcWert', 'pcRund', 'pcAb', 'pcQ', 'pcCat', 'pcBrand'].includes(e.target.id)) { PC.modus = $('#pcModus').value; PC.wert = $('#pcWert').value; PC.runden = $('#pcRund').value; PC.ab = $('#pcAb').value; PC.q = $('#pcQ').value; PC.cat = $('#pcCat').value; PC.brand = $('#pcBrand').value; renderPreisAend(); }
    const ez = e.target.closest?.('[data-ez]'); if (ez) { const c = $(`[data-ezc="${ez.dataset.ez}"]`); c.innerHTML = eanOk(ez.value.trim()) ? `<span style="color:var(--pos)">${ic('check', 'i-xs')} gültig</span>` : `<span style="color:var(--warn)">${ic('alert', 'i-xs')} Prüfziffer?</span>`; }
  });
  $('#view-bestandskorrektur').addEventListener('keydown', e => { if (e.target.id === 'bkEan' && e.key === 'Enter') { BK.ean = e.target.value.trim(); renderBestKorr(); } });
  $('#view-umbuchungslog').addEventListener('click', async e => {
    if (!e.target.closest('[data-ulcsv]')) return;
    const rows = $('#view-umbuchungslog')._rows || [];
    const csv = ['Zeit;Artikel;Farbe;Größe;Grund;Beleg;Benutzer;Menge;Bestand'].concat(rows.map(x => [x.ts, x.name, colorName(x.color), x.size, x.reason, x.ref || '', x.user || '', x.delta, x.stock_after].join(';'))).join('\r\n');
    try { const p = await invoke('save_text', {name: `Umbuchungs-Log_${today()}.csv`, content: csv, title: 'Umbuchungs-Log exportieren'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); }
  });
  // Drag & Drop in der Artikelsortierung
  let drag = null;
  document.addEventListener('dragstart', e => { const r = e.target.closest?.('[data-asi]'); if (r) { drag = r; r.style.opacity = '.4'; } });
  document.addEventListener('dragend', () => { if (drag) drag.style.opacity = ''; drag = null; });
  document.addEventListener('dragover', e => { const r = e.target.closest?.('[data-asi]'); if (drag && r && r !== drag) { e.preventDefault(); const b = r.getBoundingClientRect(); e.clientY < b.top + b.height / 2 ? r.before(drag) : r.after(drag); } });
  runDuePrices(); setInterval(runDuePrices, 60000);
}
