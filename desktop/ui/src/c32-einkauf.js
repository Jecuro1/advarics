
/* ════════════════════════════════════════════════════════════════════
   42 · EINKAUF — Order (Import, Typen, Vorschläge, Konfiguration),
   Wareneingang (Avis, Scanner, Änderungsprotokoll), Rechnungs-Management
   (Eingangsrechnungen, Zahlungen, SEPA), Retourenmanagement,
   Wareneingangs-Verteilung, Umlage Lieferantenbonus.
   ════════════════════════════════════════════════════════════════════ */
Object.assign(DEFAULTS, {'order.typen': null, 'order.vorschlag': {tage: 28, reichweite: 0, faktor: 1, runden: 1, ohne: [], nur_lieferant: false}, 'retoure.gruende': null, 'verteilung.schluessel': {modus: 'umsatz', anteile: {}, zentrale: 0, min: 0}});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });
const ORDER_TYPES_DEFAULT = [{name: 'Vororder', kuerzel: 'VO', tage: 120, text: 'Saisonbestellung mit langer Vorlaufzeit'}, {name: 'Nachorder', kuerzel: 'NO', tage: 14, text: 'Nachschub während der Saison'},
  {name: 'Sofortorder', kuerzel: 'SO', tage: 3, text: 'Eilige Einzelbestellung'}, {name: 'Kommission', kuerzel: 'KO', tage: 10, text: 'Für eine Kundin / einen Kunden bestellt'}, {name: 'Streckengeschäft', kuerzel: 'ST', tage: 10, text: 'Lieferung direkt an den Kunden'}];
const orderTypes = () => Array.isArray(CFG['order.typen']) && CFG['order.typen'].length ? CFG['order.typen'] : ORDER_TYPES_DEFAULT;
Object.assign(VIEW_PERM, {'order-import': 'einkauf', 'order-typen': 'einkauf', 'order-vorschlag': 'einkauf', 'order-konfig': 'einkauf', 'we-scanner': 'einkauf', 'we-protokoll': 'einkauf', 'retouren-protokoll': 'einkauf', rueckgabegruende: 'einstellungen', 'verteilung-konfig': 'einkauf', disposition: 'einkauf', lieferantenbonus: 'rechnungen', zahlungen: 'rechnungen', 'reklamation-neu': 'kasse.retoure'});
DK.lretoure.print = 'Rücksendung';
// Kasse: Rückgabegründe aus den Einstellungen
{ const _as = applySettings; applySettings = function (...a) { const r = _as.apply(this, a); RETURN_REASONS.splice(0, RETURN_REASONS.length, ...retGruende().map(g => g.text)); return r; }; }

/* ── Order: Typen ── */
registerPage('order-typen', {title: 'Order Typen', sub: () => `${orderTypes().length} Typen`, render: renderOrderTypen});
function renderOrderTypen() {
  const v = $('#view-order-typen'), l = orderTypes().map(t => ({...t}));
  const counts = {}; (EK.pos || []).forEach(p => { counts[p.order_type] = (counts[p.order_type] || 0) + 1; });
  v.innerHTML = `<div class="cv">${pageHead('Order Typen', 'Bestellarten mit Kürzel und üblicher Lieferzeit – wählbar in jeder Bestellung, auswertbar in der Order-Liste')}
    <div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Bezeichnung</th><th>Kürzel</th><th class="r">Lieferzeit (Tage)</th><th>Beschreibung</th><th class="r">Bestellungen</th><th></th></tr></thead><tbody>
      ${l.map((t, i) => `<tr><td style="padding-left:16px"><input class="input" data-ot="${i}" data-k="name" value="${esc(t.name)}" style="height:32px"></td><td><input class="input" data-ot="${i}" data-k="kuerzel" value="${esc(t.kuerzel || '')}" style="height:32px;width:70px"></td><td class="r"><input class="input num" data-ot="${i}" data-k="tage" value="${esc(t.tage ?? '')}" style="height:32px;width:80px;text-align:right"></td><td><input class="input" data-ot="${i}" data-k="text" value="${esc(t.text || '')}" style="height:32px"></td><td class="r num">${num(counts[t.name] || 0)}</td><td><button class="btn btn-ghost btn-icon btn-sm" data-otx="${i}" aria-label="Entfernen">${ic('x', 'i-sm')}</button></td></tr>`).join('')}</tbody></table>
      <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--line)"><button class="btn btn-ghost btn-sm" data-ota>${ic('plus', 'i-sm')}Typ hinzufügen</button><span class="sp" style="flex:1"></span><button class="btn btn-ghost btn-sm" data-otr>Standard</button><button class="btn btn-primary btn-sm" data-ots>${ic('check', 'i-sm')}Speichern</button></div></div></div>`;
  const read = () => { $$('[data-ot]', v).forEach(i => { const t = l[+i.dataset.ot]; t[i.dataset.k] = i.dataset.k === 'tage' ? (parseInt(i.value, 10) || 0) : i.value.trim(); }); return l.filter(t => t.name); };
  v.onclick = async e => {
    if (e.target.closest('[data-ota]')) { CFG['order.typen'] = [...read(), {name: '', kuerzel: '', tage: 7, text: ''}]; return renderOrderTypen(); }
    const x = e.target.closest('[data-otx]'); if (x) { const r = read(); r.splice(+x.dataset.otx, 1); CFG['order.typen'] = r; return renderOrderTypen(); }
    if (e.target.closest('[data-otr]')) { await saveSettings({'order.typen': null}); return renderOrderTypen(); }
    if (e.target.closest('[data-ots]')) { await saveSettings({'order.typen': read()}); Hooks.emit('config.order.typen', {anzahl: read().length}); renderOrderTypen(); }
  };
}

/* ── Order: Import (CSV/Excel-Export des Lieferanten → Bestellentwurf) ── */
const OI = {text: '', sup: '', type: '', res: null};
registerPage('order-import', {title: 'Order Import', sub: () => 'Bestellung aus Datei übernehmen', render: renderOrderImport});
async function renderOrderImport() {
  const v = $('#view-order-import');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('download', 'Order Import'); return; }
  await loadSuppliers();
  OI.sup ||= SUPPLIERS[0]?.id || ''; OI.type ||= orderTypes()[0]?.name || '';
  const r = OI.res;
  v.innerHTML = `<div class="cv">${pageHead('Order Import', 'Bestellpositionen aus einer Datei (CSV, aus Excel gespeichert) oder per Einfügen übernehmen – Spalten EAN bzw. Artikelnummer, Menge und optional EK')}
    <div class="card" style="padding:16px;display:grid;gap:12px">
      <div class="ed-grid"><label class="field"><span>Lieferant</span><select class="input select" id="oiSup">${SUPPLIERS.map(s => `<option value="${esc(s.id)}" ${s.id === OI.sup ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Order-Typ</span><select class="input select" id="oiType">${orderTypes().map(t => `<option ${t.name === OI.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label></div>
      <label class="field"><span>Inhalt (Kopfzeile + eine Zeile je Position, Trennzeichen ; , oder Tab)</span><textarea class="input mono" id="oiText" rows="7" style="height:auto;padding:10px 12px;font-size:12.5px" placeholder="EAN;Menge;EK&#10;2000000000015;5;39,90">${esc(OI.text)}</textarea></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-secondary" data-oi="datei">${ic('download', 'i-sm')}Datei öffnen …</button><button class="btn btn-secondary" data-oi="pruefen">${ic('check', 'i-sm')}Prüfen</button>${r?.ok.length ? `<button class="btn btn-primary" data-oi="anlegen">${ic('truck', 'i-sm')}Bestellentwurf mit ${r.ok.length} Positionen anlegen</button>` : ''}</div></div>
    ${r ? `${kpiCards([[num(r.ok.length), 'Positionen erkannt', 'pos'], [num(r.ok.reduce((s, x) => s + x.qty, 0)), 'Stück'], [eur(r.ok.reduce((s, x) => s + (x.cost || 0) * x.qty, 0) / 100), 'Bestellwert EK'], [num(r.bad.length), 'nicht zugeordnet', r.bad.length ? 'warn' : '']])}
      <div class="card">${r.ok.length || r.bad.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeile</th><th>Artikel</th><th>EAN</th><th class="r">Menge</th><th class="r" style="padding-right:16px">EK</th></tr></thead><tbody>${r.ok.map(x => `<tr><td style="padding-left:16px" class="muted">${x.row}</td><td><b>${esc(x.a.name)}</b><div class="muted" style="font-size:12px">${esc(colorName(x.v.c))} · ${esc(x.v.s)}</div></td><td class="mono">${esc(x.v.ean)}</td><td class="r num">${x.qty}</td><td class="r num" style="padding-right:16px">${x.cost != null ? cEur(x.cost) : '–'}</td></tr>`).join('')}${r.bad.map(x => `<tr style="color:var(--neg)"><td style="padding-left:16px">${x.row}</td><td colspan="4">${esc(x.why)} · ${esc(x.raw)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:30px"><p>Keine Daten erkannt.</p></div>'}</div>` : ''}</div>`;
}
function parseOrderText(text) {
  const rows = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (!rows.length) return {ok: [], bad: []};
  const sep = [';', '\t', ','].sort((a, b) => rows[0].split(b).length - rows[0].split(a).length)[0];
  const head = rows[0].split(sep).map(h => norm(h.replace(/"/g, '')));
  const has = head.some(h => /ean|gtin|artikel|menge|anzahl|qty|ek|preis/.test(h));
  const col = re => head.findIndex(h => re.test(h));
  const ci = has ? {ean: col(/ean|gtin|barcode/), art: col(/art.*nr|artikelnummer|sku|^artikel$/), qty: col(/menge|anzahl|qty|stuck|stück/), ek: col(/ek|einkauf|preis|netto/)} : {ean: 0, art: -1, qty: 1, ek: 2};
  const ok = [], bad = [];
  rows.slice(has ? 1 : 0).forEach((line, i) => {
    const c = line.split(sep).map(x => x.replace(/^"|"$/g, '').trim()), row = i + (has ? 2 : 1);
    const ean = ci.ean >= 0 ? c[ci.ean] : '', qty = parseInt(c[ci.qty], 10);
    let hit = ean ? findEan(ean) : null;
    if (!hit && ci.art >= 0 && c[ci.art]) { const a = artById(c[ci.art]); if (a && a.variants.length === 1) hit = {a, v: a.variants[0]}; }
    if (!hit) return bad.push({row, raw: line, why: ean ? `EAN ${ean} unbekannt` : 'keine EAN'});
    if (!(qty > 0)) return bad.push({row, raw: line, why: 'Menge fehlt'});
    const ek = ci.ek >= 0 && c[ci.ek] ? e2c(c[ci.ek]) : (hit.a.cost != null ? Math.round(hit.a.cost * 100) : null);
    const ex = ok.find(x => x.v.ean === hit.v.ean); if (ex) ex.qty += qty; else ok.push({row, a: hit.a, v: hit.v, qty, cost: ek});
  });
  return {ok, bad};
}

/* ── Order: Vorschläge ── */
registerPage('order-vorschlag', {title: 'Order Vorschläge', sub: () => 'Nachschub je Lieferant', render: renderOrderVorschlag});
async function renderOrderVorschlag() {
  const v = $('#view-order-vorschlag');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('sparkle', 'Order Vorschläge'); return; }
  v.innerHTML = `<div class="cv">${pageHead('Order Vorschläge', '…')}${loadingCard('Berechne Vorschläge')}</div>`;
  await loadPurchasing();
  const cfg = CFG['order.vorschlag'] || {}, groups = {}; EK.sug.forEach(s => (groups[s.supplier_id || ''] ||= []).push(s));
  const val = EK.sug.reduce((s, x) => s + (x.cost || 0) * x.qty, 0);
  v.innerHTML = `<div class="cv">${pageHead('Order Vorschläge', `Bedarf = Mindestbestand + Abverkauf ${cfg.tage || 28} Tage${cfg.reichweite ? ` (hochgerechnet auf ${cfg.reichweite} Tage Reichweite)` : ''}${cfg.faktor && cfg.faktor !== 1 ? ` × ${num(cfg.faktor, 2)}` : ''} − Bestand − offene Bestellungen${cfg.runden > 1 ? `, gerundet auf ${cfg.runden} Stück` : ''}`, `<button class="btn btn-secondary" data-goto="order-konfig">${ic('sliders', 'i-sm')}Konfiguration</button>${Object.keys(groups).filter(Boolean).length ? `<button class="btn btn-primary" data-ov="alle">${ic('truck', 'i-sm')}Für alle Lieferanten Entwürfe anlegen</button>` : ''}`)}
    ${kpiCards([[num(EK.sug.length), 'Varianten mit Bedarf', EK.sug.length ? 'warn' : 'pos'], [num(EK.sug.filter(x => x.stock <= 0).length), 'ausverkauft', 'neg'], [num(Object.keys(groups).length), 'Lieferanten'], [eur0(val / 100), 'Vorschlagswert (EK)']])}
    ${Object.keys(groups).length ? Object.entries(groups).map(([sid, rows]) => `<div class="card" style="margin-bottom:12px" data-ovg="${esc(sid)}"><div class="set-row"><div><div class="set-l">${esc(supName(sid))}</div><div class="set-h">${rows.length} Varianten · ${eur((rows.reduce((s, x) => s + (x.cost || 0) * x.qty, 0)) / 100)} EK</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-ovs="${esc(sid)}" ${sid ? '' : 'disabled title="Lieferant im Artikel hinterlegen"'}>${ic('plus', 'i-sm')}Bestellung anlegen</button></div></div>
      <table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px;width:36px"></th><th>Artikel</th><th>Grund</th><th class="r">Bestand</th><th class="r">Min.</th><th class="r">offen</th><th class="r">verk. ${rows[0].tage || 28} T</th><th class="r">Ziel</th><th class="r" style="padding-right:16px">Menge</th></tr></thead><tbody>${rows.map(r => `<tr><td style="padding-left:16px"><input type="checkbox" checked data-ovv="${r.variant_id}"></td><td><b>${esc(r.name)}</b><div class="muted" style="font-size:12px">${esc(colorName(r.color))} · ${esc(r.size)}</div></td><td><span class="pill ${r.grund === 'ausverkauft' ? 'neg' : r.grund === 'unter Mindestbestand' ? 'warn' : 'info'}" style="height:20px">${esc(r.grund || '')}</span></td><td class="r num">${r.stock}</td><td class="r num">${r.min}</td><td class="r num">${r.open}</td><td class="r num">${r.sold ?? r.sold28}</td><td class="r num">${r.ziel ?? '–'}</td><td class="r" style="padding-right:16px"><input class="input num" data-ovq="${r.variant_id}" value="${r.qty}" inputmode="numeric" style="width:70px;height:32px;text-align:right"></td></tr>`).join('')}</tbody></table></div>`).join('')
      : `<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><h3>Kein Nachschub nötig</h3><p>Alle Varianten sind ausreichend versorgt.</p></div></div>`}</div>`;
}
const ovLines = card => $$('[data-ovv]', card).filter(c => c.checked).map(c => { const vid = +c.dataset.ovv, r = EK.sug.find(s => s.variant_id === vid); return {variant_id: vid, name: r.name, color: r.color, size: r.size, qty: $(`[data-ovq="${vid}"]`, card).value, cost: r.cost}; });

/* ── Order: Vorschlags-Konfiguration ── */
registerPage('order-konfig', {title: 'Order Vorschlags-Konfiguration', sub: () => 'Regeln für den Bestellvorschlag', render: renderOrderKonfig});
function renderOrderKonfig() {
  const v = $('#view-order-konfig'), c = {tage: 28, reichweite: 0, faktor: 1, runden: 1, ohne: [], nur_lieferant: false, ...(CFG['order.vorschlag'] || {})};
  const row = (l, h, ctl) => `<div class="set-row"><div><div class="set-l">${l}</div><div class="set-h">${h}</div></div><div class="set-c">${ctl}</div></div>`;
  v.innerHTML = `<div class="cv">${pageHead('Order Vorschlags-Konfiguration', 'Wie Kontor den Nachschub berechnet – gilt für Order Vorschläge, Einkauf und KI-Nachbestellung; im Filialverbund für alle Filialen', `<button class="btn btn-primary" data-ok="save">${ic('check', 'i-sm')}Speichern & Vorschlag anzeigen</button>`)}
    <div class="card">
      ${row('Betrachtungszeitraum', 'Abverkauf der letzten … Tage', `<input class="input num" id="okTage" value="${c.tage}" style="width:90px;text-align:right"> Tage`)}
      ${row('Reichweite', 'Bedarf hochrechnen auf … Tage (0 = wie Betrachtungszeitraum). Mit Reichweite wird auch vor Erreichen des Mindestbestands nachbestellt.', `<input class="input num" id="okReich" value="${c.reichweite}" style="width:90px;text-align:right"> Tage`)}
      ${row('Sicherheitsfaktor', 'Bedarf × Faktor (z. B. 1,2 = 20 % Puffer)', `<input class="input num" id="okFaktor" value="${num(c.faktor, 2)}" style="width:90px;text-align:right">`)}
      ${row('Packeinheit', 'Mengen auf Vielfache runden (1 = keine Rundung)', `<input class="input num" id="okRund" value="${c.runden}" style="width:90px;text-align:right"> Stück`)}
      ${row('Nur Artikel mit Lieferant', 'Artikel ohne hinterlegten Lieferanten nicht vorschlagen', `<button class="switch" role="switch" id="okLief" aria-checked="${!!c.nur_lieferant}"></button>`)}
      <div class="set-row" style="border-bottom:0"><div><div class="set-l">Warengruppen ausschließen</div><div class="set-h">z. B. Auslaufware oder Saisonartikel ohne Nachbestellung</div></div><div class="set-c" style="flex-wrap:wrap;justify-content:flex-end;gap:6px;max-width:520px">${catsInUse(c.ohne).map(x => `<button class="chip" data-okc="${esc(x.id)}" aria-pressed="${c.ohne.includes(x.id)}">${esc(x.name)}</button>`).join('')}</div></div></div></div>`;
  v.onclick = async e => {
    const ch = e.target.closest('[data-okc]'); if (ch) { ch.setAttribute('aria-pressed', ch.getAttribute('aria-pressed') !== 'true'); return; }
    const sw = e.target.closest('#okLief'); if (sw) { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); return; }
    if (e.target.closest('[data-ok="save"]')) {
      const cfg = {tage: Math.max(7, parseInt($('#okTage').value, 10) || 28), reichweite: Math.max(0, parseInt($('#okReich').value, 10) || 0), faktor: Math.max(0.1, parseAmt($('#okFaktor').value) || 1), runden: Math.max(1, parseInt($('#okRund').value, 10) || 1), nur_lieferant: $('#okLief').getAttribute('aria-checked') === 'true', ohne: $$('[data-okc]', v).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.okc)};
      await saveSettings({'order.vorschlag': cfg}); Hooks.emit('config.order.vorschlag', cfg); go('order-vorschlag');
    }
  };
}

/* ── Wareneingang Avis ── */
docPage('avis', 'avis', {tabs: [['offen', 'Offen', s => ['angekuendigt', 'eingetroffen'].includes(s)], ['gebucht', 'Gebucht', s => s === 'gebucht'], ['alle', 'Alle', () => true]],
  cols: [{l: 'Liefertermin', f: d => `<span class="num ${d.date < today() && d.status === 'angekuendigt' ? 'neg' : ''}">${esc(dDate(d.date))}</span>`}, {l: 'Stück', r: true, f: d => num((d.data.lines || []).reduce((s, l) => s + (+l.qty || 0), 0))}],
  kpi: l => [[num(l.filter(d => d.status === 'angekuendigt').length), 'angekündigt'], [num(l.filter(d => d.status === 'eingetroffen').length), 'eingetroffen, nicht gebucht', 'warn'], [num(l.filter(d => d.status === 'angekuendigt' && d.date <= today()).length), 'heute oder überfällig'], [num(l.filter(d => d.status === 'gebucht').length), 'gebucht']],
  actions: `<button class="btn btn-secondary" data-avis="po">${ic('truck', 'i-sm')}Aus Bestellung</button><button class="btn btn-secondary" data-avis="datei">${ic('download', 'i-sm')}Avis-Datei importieren</button>`});
DOC_BTNS.avis = st => st.id && ['angekuendigt', 'eingetroffen'].includes(st.status) ? `<button class="btn btn-ghost" data-avscan>${ic('barcode', 'i-sm')}Mit Scanner prüfen</button>` : '';
DOC_CLICK.avis = (e, st, h) => { if (e.target.closest('[data-avscan]')) { closeLayer(h.el); WS.avis = st.id; go('we-scanner'); } };
async function avisFromPO() {
  await loadPurchasing();
  const open = EK.pos.filter(p => ['bestellt', 'teilgeliefert'].includes(p.status));
  if (!open.length) return toast('Keine offenen Bestellungen', {icon: 'truck'});
  const el = openLayer(`<div class="modal" style="width:min(560px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('truck')}</div><div><h2>Avis aus Bestellung</h2><p>Offene Mengen der Bestellung werden übernommen</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:6px;max-height:60vh;overflow:auto">${open.map(p => `<button class="pal-i" style="height:52px" data-avpo="${p.id}"><span style="flex:1;text-align:left"><b>${esc(p.no)}</b> <span class="muted">· ${esc(p.supplier)} · ${num(p.qty - p.received)} Stück offen</span></span>${ic('chevron-right', 'i-sm')}</button>`).join('')}</div></div>`);
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-avpo]'); if (!b) return;
    const p = open.find(x => x.id === +b.dataset.avpo), lines = await invoke('po_lines', {id: p.id});
    closeLayer(el);
    openDoc('avis', null, {partner: p.supplier_id, partner_name: p.supplier, date: plusDays(1), data: {order_id: p.id, lines: lines.filter(l => l.qty > l.received).map(l => ({ean: l.ean, sku: l.article_id, name: `${l.name} · ${colorName(l.color)} · ${l.size}`, qty: l.qty - l.received, price: l.cost || 0, vat: 20}))}, focusSearch: false});
  });
}
async function avisFromFile() {
  await loadSuppliers();
  let txt; try { txt = await invoke('open_text', {title: 'Avis-Datei (CSV) öffnen', ext: 'csv'}); } catch (e) { return toast('Datei nicht lesbar', {t2: String(e), type: 'warn'}); }
  if (!txt) return;
  const r = parseOrderText(txt);
  if (!r.ok.length) return toast('Keine Positionen erkannt', {t2: r.bad[0]?.why || 'Spalten EAN und Menge nötig', type: 'warn'});
  if (r.bad.length) toast(`${r.bad.length} Zeilen nicht zugeordnet`, {t2: r.bad.slice(0, 3).map(b => b.why).join(' · '), type: 'warn', dur: 8000});
  const sup = SUPPLIERS.find(s => s.id === r.ok[0].a.supplierId);
  openDoc('avis', null, {partner: sup?.id || null, partner_name: sup?.name || '', date: plusDays(1), data: {lines: r.ok.map(x => ({ean: x.v.ean, sku: x.a.id, name: lineName(x.a, x.v), qty: x.qty, price: x.cost || 0, vat: x.a.vat ?? 20}))}, focusSearch: false});
}

/* ── Scanner Wareneingang ── */
const WS = {avis: null, po: null, items: [], log: []};
registerPage('we-scanner', {title: 'Scanner Wareneingang', sub: () => 'Scannen, zählen, einbuchen', render: renderWeScanner});
async function renderWeScanner() {
  const v = $('#view-we-scanner');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('barcode', 'Scanner Wareneingang'); return; }
  await loadPurchasing();
  let avis = null; if (WS.avis) { try { avis = await invoke('doc_get', {id: WS.avis}); } catch { WS.avis = null; } }
  const exp = {}; (avis?.data.lines || []).forEach(l => { exp[l.ean] = (exp[l.ean] || 0) + (+l.qty || 0); });
  const open = EK.pos.filter(p => ['bestellt', 'teilgeliefert'].includes(p.status));
  let poLines = []; if (WS.po && !avis) { try { poLines = await invoke('po_lines', {id: WS.po}); poLines.forEach(l => { exp[l.ean] = (exp[l.ean] || 0) + Math.max(0, l.qty - l.received); }); } catch { WS.po = null; } }
  const cnt = {}; WS.items.forEach(x => { cnt[x.ean] = (cnt[x.ean] || 0) + x.qty; });
  const eans = [...new Set([...Object.keys(exp), ...Object.keys(cnt)])];
  const diff = eans.filter(e => (cnt[e] || 0) !== (exp[e] || 0)).length;
  v.innerHTML = `<div class="cv">${pageHead('Scanner Wareneingang', 'Jede Einheit scannen – Kontor zählt mit und vergleicht mit Avis oder Bestellung. Erst „Einbuchen“ bucht den Bestand.', `<button class="btn btn-ghost" data-ws="reset">${ic('trash', 'i-sm')}Neu beginnen</button><button class="btn btn-primary" data-ws="book" ${WS.items.length ? '' : 'disabled'}>${ic('check', 'i-sm')}Einbuchen (${num(WS.items.reduce((s, x) => s + x.qty, 0))} Stück)</button>`)}
    <div class="card" style="padding:16px;display:grid;gap:12px">
      <div class="ed-grid"><label class="field"><span>Abgleich gegen</span><select class="input select" id="wsRef"><option value="">– freier Zugang ohne Beleg –</option>${open.map(p => `<option value="po:${p.id}" ${WS.po === p.id && !avis ? 'selected' : ''}>Bestellung ${esc(p.no)} · ${esc(p.supplier)}</option>`).join('')}${avis ? `<option value="avis:${avis.id}" selected>Avis ${esc(avis.no)} · ${esc(avis.partner_name)}</option>` : ''}</select></label>
        <label class="field"><span>Menge je Scan</span><input class="input num" id="wsQty" value="1" inputmode="numeric"></label></div>
      <label class="search-field" style="height:56px;font-size:18px">${ic('barcode')}<input id="wsEan" placeholder="EAN scannen …" autocomplete="off" style="font-size:18px"></label><div id="wsHit" class="muted" style="min-height:18px;font-size:13px"></div></div>
    ${kpiCards([[num(WS.items.reduce((s, x) => s + x.qty, 0)), 'gescannt'], [num(Object.values(exp).reduce((s, x) => s + x, 0)), 'erwartet'], [num(eans.length), 'Varianten'], [num(diff), 'Abweichungen', diff ? 'warn' : 'pos']])}
    <div class="card">${eans.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Artikel</th><th>EAN</th><th class="r">erwartet</th><th class="r">gezählt</th><th class="r">Differenz</th><th></th></tr></thead><tbody>${eans.map(e => { const x = findEan(e), d = (cnt[e] || 0) - (exp[e] || 0); return `<tr><td style="padding-left:16px"><b>${esc(x ? x.a.name : 'unbekannt')}</b>${x ? `<div class="muted" style="font-size:12px">${esc(colorName(x.v.c))} · ${esc(x.v.s)} · Bestand ${x.v.q}</div>` : ''}</td><td class="mono">${esc(e)}</td><td class="r num">${exp[e] || 0}</td><td class="r num"><b>${cnt[e] || 0}</b></td><td class="r num" style="color:${d ? (d > 0 ? 'var(--warn)' : 'var(--neg)') : 'var(--pos)'}">${d > 0 ? '+' : ''}${d}</td><td class="r" style="padding-right:10px">${cnt[e] ? `<button class="btn btn-ghost btn-sm btn-icon" data-wsm="${esc(e)}" aria-label="Eins weniger">${ic('minus', 'i-sm')}</button>` : ''}</td></tr>`; }).join('')}</tbody></table>`
      : '<div class="empty" style="padding:40px"><div class="empty-icon">' + ic('barcode') + '</div><p>Noch nichts gescannt.</p></div>'}</div></div>`;
  setTimeout(() => $('#wsEan')?.focus(), 60);
}
async function wsBook() {
  if (!WS.items.length) return;
  try { await needPerm('bestand.buchen', 'Wareneingang buchen'); } catch { return; }
  const cnt = {}; WS.items.forEach(x => { cnt[x.ean] = (cnt[x.ean] || 0) + x.qty; });
  try {
    if (WS.avis) {
      const a = await invoke('doc_get', {id: WS.avis});
      const lines = Object.entries(cnt).map(([ean, qty]) => { const x = findEan(ean); const old = a.data.lines.find(l => l.ean === ean); return {ean, sku: x?.a.id, name: old?.name || (x ? lineName(x.a, x.v) : ean), qty, price: old?.price || 0, vat: old?.vat ?? 20}; });
      await invoke('doc_save', {doc: {...a, data: {...a.data, lines, gezaehlt: true}}, user: S.user.name});
      const r = await invoke('doc_action', {id: a.id, action: 'buchen', payload: {}, user: S.user.name}); applyStocks(r.stocks);
      toast('Avis eingebucht', {t2: `${a.no} · ${WS.items.reduce((s, x) => s + x.qty, 0)} Stück`, type: 'pos', icon: 'boxes'});
    } else if (WS.po) {
      const lines = await invoke('po_lines', {id: WS.po}), items = [], rest = [];
      Object.entries(cnt).forEach(([ean, qty]) => { const l = lines.find(x => x.ean === ean); if (l) items.push({line_id: l.id, qty}); else rest.push([ean, qty]); });
      if (items.length) applyStocks(await invoke('po_receive', {id: WS.po, items, user: S.user.name}));
      for (const [ean, qty] of rest) { const x = findEan(ean); if (x) await bookStock(x.a, x.v, qty, false, 'Wareneingang (ohne Bestellposition)'); }
      toast('Wareneingang gebucht', {t2: `${items.length} Bestellpositionen${rest.length ? ` · ${rest.length} zusätzlich` : ''}`, type: 'pos', icon: 'boxes'});
    } else {
      for (const [ean, qty] of Object.entries(cnt)) { const x = findEan(ean); if (x) await bookStock(x.a, x.v, qty, false, 'Wareneingang (Scanner)'); }
      toast('Zugang gebucht', {t2: `${Object.keys(cnt).length} Varianten`, type: 'pos', icon: 'boxes'});
    }
    Hooks.emit('purchasing.goods.received', {quelle: 'Scanner', stueck: WS.items.reduce((s, x) => s + x.qty, 0)});
    const lbl = Object.entries(cnt).map(([ean, n]) => { const x = findEan(ean); return x ? {a: x.a, v: x.v, n} : null; }).filter(Boolean);
    WS.items = []; WS.avis = null; WS.po = null; renderWeScanner();
    toast('Etiketten drucken?', {t2: `${lbl.length} Varianten`, icon: 'barcode', action: {label: 'Etiketten', run: () => openLabels(lbl)}, dur: 8000});
  } catch (e) { toast('Nicht gebucht', {t2: String(e), type: 'warn', dur: 8000}); }
}

/* ── Wareneingang Änderungsprotokoll ── */
const WP = {q: '', days: '30'};
registerPage('we-protokoll', {title: 'Wareneingang Änderungsprotokoll', sub: () => 'Buchungen und Korrekturen', render: renderWeProtokoll});
async function renderWeProtokoll() {
  const v = $('#view-we-protokoll');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('history', 'Änderungsprotokoll'); return; }
  let moves = [], logs = [];
  try { [moves, logs] = await Promise.all([invoke('stock_moves', {articleId: null, limit: 6000}), invoke('doc_log', {kinds: ['avis'], limit: 500})]); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  const from = WP.days === 'alle' ? '' : dIso(dayStart(+WP.days)), n = norm(WP.q);
  const rows = moves.filter(m => /^(Wareneingang|Korrektur Wareneingang|Lieferantenretoure)/.test(m.reason) && m.ts.slice(0, 10) >= from && (!n || norm(`${m.name} ${m.ref || ''} ${m.reason} ${m.user || ''}`).includes(n)));
  const corr = rows.filter(m => m.reason.startsWith('Korrektur')).length;
  v.innerHTML = `<div class="cv">${pageHead('Wareneingang Änderungsprotokoll', 'Jede Wareneingangs-Buchung mit Beleg, Benutzer und Zeit – Fehlbuchungen hier korrigieren (wird als Korrektur protokolliert)')}
    ${kpiCards([[num(rows.filter(m => m.delta > 0).length), 'Zugänge'], [num(rows.reduce((s, m) => s + Math.max(0, m.delta), 0)), 'Stück eingebucht'], [num(corr), 'Korrekturen', corr ? 'warn' : ''], [num(logs.length), 'Avis-Ereignisse']])}
    <div class="filters"><input class="input" id="wpQ" placeholder="Artikel, Beleg, Benutzer …" value="${esc(WP.q)}" style="flex:1;max-width:380px"><div class="seg" id="wpSeg">${[['7', '7 Tage'], ['30', '30 Tage'], ['365', '1 Jahr'], ['alle', 'Alle']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${WP.days === k}">${l}</button>`).join('')}</div></div>
    <div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Artikel</th><th>Buchung</th><th>Beleg</th><th>Benutzer</th><th class="r">Menge</th><th class="r">Bestand danach</th><th></th></tr></thead><tbody>${rows.slice(0, 600).map((m, i) => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(m.ts))}</td><td><b>${esc(m.name)}</b><div class="muted" style="font-size:12px">${esc(colorName(m.color))} · ${esc(m.size)}</div></td><td>${m.reason.startsWith('Korrektur') ? `<span class="pill warn" style="height:20px">${esc(m.reason)}</span>` : esc(m.reason)}</td><td class="mono">${esc(m.ref || '–')}</td><td>${esc(m.user || '')}</td><td class="r num" style="color:var(--${m.delta >= 0 ? 'pos' : 'neg'})">${m.delta > 0 ? '+' : ''}${m.delta}</td><td class="r num">${m.stock_after}</td><td class="r" style="padding-right:10px">${m.reason.startsWith('Wareneingang') ? `<button class="btn btn-ghost btn-sm" data-wpk="${i}">Korrigieren</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty" style="padding:44px"><p>Keine Wareneingangs-Buchungen im Zeitraum.</p></div>'}</div></div>`;
  initSeg($('#wpSeg', v), b => { WP.days = b.dataset.v; renderWeProtokoll(); });
  $('#wpQ', v).onchange = e => { WP.q = e.target.value; renderWeProtokoll(); };
  v._rows = rows;
}
async function wpCorrect(m) {
  const x = varById(m.variant_id); if (!x) return;
  const r = await askFields(`Korrektur · ${m.name} ${colorName(m.color)} ${m.size}`, [{k: 'menge', l: `Korrekturmenge (gebucht: +${m.delta}; z. B. −2 wenn 2 zu viel gebucht)`}, {k: 'grund', l: 'Grund'}], {no: m.ref || ''}); if (!r) return;
  const q = parseInt(String(r.menge).replace('−', '-'), 10); if (!q) return toast('Menge fehlt', {type: 'warn'});
  try { await needPerm('bestand.buchen', 'Wareneingang korrigieren'); await bookStock(x.a, x.v, q, false, `Korrektur Wareneingang${m.ref ? ' ' + m.ref : ''}${r.grund ? ': ' + r.grund : ''}`); toast('Korrektur gebucht', {t2: `${q > 0 ? '+' : ''}${q} · Bestand ${x.v.q}`, type: 'pos', icon: 'history'}); renderWeProtokoll(); }
  catch (e) { if (String(e).includes('abgebrochen')) return; toast('Nicht gebucht', {t2: String(e), type: 'warn'}); }
}

/* ── Rechnungs-Management: Eingangsrechnungen ── */
docPage('er', 'er', {title: 'Rechnungen', newLabel: 'Rechnung erfassen',
  tabs: [['offen', 'Zu prüfen', s => ['offen', 'geprueft'].includes(s)], ['zahlung', 'Zur Zahlung', s => ['freigegeben', 'teilbezahlt'].includes(s)], ['bezahlt', 'Bezahlt', s => s === 'bezahlt'], ['alle', 'Alle', () => true]],
  cols: [{l: 'Rechnungsnr.', f: d => esc(d.data.rechnungsnr || '')}, {l: 'Fällig', f: d => `<span class="num" style="${d.due && d.due < today() && d.open ? 'color:var(--neg);font-weight:600' : ''}">${esc(dDate(d.due))}</span>`}, {l: 'Prüfung', f: d => d.data.pruefung ? (d.data.pruefung.ok ? `<span style="color:var(--pos)">${ic('check', 'i-xs')} ok</span>` : `<span style="color:var(--warn)">${ic('alert', 'i-xs')} ${cEur(d.data.pruefung.differenz)}</span>`) : '<span class="muted">–</span>'}],
  kpi: l => { const o = l.filter(d => !['bezahlt', 'storniert'].includes(d.status)); return [[eur0(o.reduce((s, d) => s + d.open, 0) / 100), 'offen gesamt'], [eur0(o.filter(d => d.due && d.due < today()).reduce((s, d) => s + d.open, 0) / 100), 'überfällig', 'neg'], [eur0(o.filter(d => d.due && d.due >= today() && d.due <= plusDays(7)).reduce((s, d) => s + d.open, 0) / 100), 'fällig in 7 Tagen', 'warn'], [num(l.filter(d => d.status === 'offen').length), 'noch nicht geprüft']]; },
  actions: `<button class="btn btn-secondary" data-goto="zahlungen">${ic('cash', 'i-sm')}Zahlungen</button>`});
DOC_BTNS.er = st => st.id && ['freigegeben', 'teilbezahlt', 'geprueft', 'offen'].includes(st.status) && st.open > 0 ? `<button class="btn btn-ghost" data-erpay>${ic('cash', 'i-sm')}Bezahlen</button>` : '';
DOC_CLICK.er = (e, st, h) => { if (e.target.closest('[data-erpay]')) { closeLayer(h.el); openSupplierPayment(st.partner, [st.id]); } };

/* ── Zahlungen (Zahlungsvorschlag, Zahlung erfassen, SEPA-Datei) ── */
const ZP = {tage: 7};
registerPage('zahlungen', {title: 'Zahlungen', sub: () => 'Zahlungsausgänge und SEPA', render: renderZahlungen});
async function renderZahlungen() {
  const v = $('#view-zahlungen');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('cash', 'Zahlungen'); return; }
  let ers, zs; try { [ers, zs] = await Promise.all([docLoad('er'), docLoad('zahlung')]); await loadSuppliers(); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  DOCS.zahlungen = zs;
  const lim = plusDays(ZP.tage), due = ers.filter(d => ['freigegeben', 'teilbezahlt'].includes(d.status) && d.open > 0 && (!d.due || d.due <= lim || (d.data.skonto_bis && d.data.skonto_bis <= lim)));
  const skonto = d => d.data.skonto_pct && d.data.skonto_bis && d.data.skonto_bis >= today() && d.open === d.total ? Math.round(d.total * d.data.skonto_pct / 100) : 0;
  const notExp = zs.filter(z => z.status === 'erfasst');
  v.innerHTML = `<div class="cv">${pageHead('Zahlungen', 'Zahlungsvorschlag aus freigegebenen Rechnungen (mit Skonto), Zahlung erfassen, SEPA-Überweisungsdatei (pain.001) für das Online-Banking', `<button class="btn btn-secondary" data-zp="neu">${ic('plus', 'i-sm')}Zahlung erfassen</button>${notExp.length ? `<button class="btn btn-primary" data-zp="sepa">${ic('download', 'i-sm')}SEPA-Datei (${notExp.length})</button>` : ''}`)}
    ${kpiCards([[eur0(due.reduce((s, d) => s + d.open - skonto(d), 0) / 100), `Vorschlag (fällig in ${ZP.tage} Tagen)`], [eur0(due.reduce((s, d) => s + skonto(d), 0) / 100), 'Skonto möglich', 'pos'], [num(notExp.length), 'Zahlungen nicht exportiert', notExp.length ? 'warn' : ''], [eur0(zs.filter(z => z.status !== 'storniert' && z.date.slice(0, 7) === today().slice(0, 7)).reduce((s, z) => s + z.total, 0) / 100), 'bezahlt diesen Monat']])}
    <div class="card" style="margin-bottom:16px"><div class="set-row"><div><div class="set-l">Zahlungsvorschlag</div><div class="set-h">Freigegebene Rechnungen, fällig bzw. Skontofrist innerhalb von <select class="input select" id="zpTage" style="height:28px;width:auto;display:inline-block;padding:0 26px 0 8px">${[3, 7, 14, 30, 60].map(t => `<option ${t === ZP.tage ? 'selected' : ''}>${t}</option>`).join('')}</select> Tagen</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-zp="lauf" ${due.length ? '' : 'disabled'}>${ic('check', 'i-sm')}Ausgewählte bezahlen</button></div></div>
      ${due.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px;width:34px"></th><th>Rechnung</th><th>Lieferant</th><th>Fällig</th><th class="r">offen</th><th class="r">Skonto</th><th class="r" style="padding-right:16px">Zahlbetrag</th></tr></thead><tbody>${due.map(d => `<tr><td style="padding-left:16px"><input type="checkbox" checked data-zpe="${d.id}"></td><td><b class="mono">${esc(d.no)}</b><div class="muted" style="font-size:11.5px">${esc(d.data.rechnungsnr || '')}</div></td><td>${esc(d.partner_name)}${SUPPLIERS.find(s => s.id === d.partner)?.iban ? '' : ' <span class="pill warn" style="height:18px">IBAN fehlt</span>'}</td><td class="num">${esc(dDate(d.due))}</td><td class="r num">${cEur(d.open)}</td><td class="r num" style="color:var(--pos)">${skonto(d) ? cEur(skonto(d)) : '–'}</td><td class="r num" style="padding-right:16px;font-weight:600">${cEur(d.open - skonto(d))}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty" style="padding:28px"><p>Nichts fällig – Rechnungen müssen freigegeben sein.</p></div>'}</div>
    <div class="card">${zs.length ? `<table class="tbl art-tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zahlung</th><th>Datum</th><th>Lieferant</th><th>Rechnungen</th><th>Art</th><th>Status</th><th class="r" style="padding-right:16px">Betrag</th></tr></thead><tbody>${zs.map(z => `<tr data-dopen="${z.id}" style="cursor:pointer"><td style="padding-left:16px"><b class="mono">${esc(z.no)}</b></td><td class="num muted">${esc(dDate(z.date))}</td><td>${esc(z.partner_name)}</td><td class="muted" style="font-size:12.5px">${esc((z.data.zuordnung || []).map(a => ers.find(e => e.id === a.er)?.no || a.er).join(', '))}</td><td>${esc(z.data.art || '')}</td><td>${dPill(z.status)}</td><td class="r num" style="padding-right:16px;font-weight:600">${cEur(z.total)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:40px"><div class="empty-icon">${ic('cash')}</div><p>Noch keine Zahlungen erfasst.</p></div>`}</div></div>`;
  v._due = due; v._skonto = skonto;
}
async function openSupplierPayment(sup, preIds = []) {
  const ers = (await docLoad('er')).filter(d => d.open > 0 && !['storniert', 'bezahlt'].includes(d.status)); await loadSuppliers();
  const st = {sup: sup || ers.find(d => preIds.includes(d.id))?.partner || ers[0]?.partner || '', sel: new Set(preIds), art: 'Überweisung', date: today()};
  const el = openLayer(`<div class="modal" style="width:min(680px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true"><div data-zbox style="display:flex;flex-direction:column;min-height:0"></div></div>`);
  const box = $('[data-zbox]', el);
  const sk = d => d.data.skonto_pct && d.data.skonto_bis && d.data.skonto_bis >= st.date && d.open === d.total ? Math.round(d.total * d.data.skonto_pct / 100) : 0;
  const render = () => {
    const list = ers.filter(d => d.partner === st.sup);
    const sum = list.filter(d => st.sel.has(d.id)).reduce((s, d) => s + d.open - sk(d), 0);
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('cash')}</div><div><h2>Zahlung erfassen</h2><p>Offene Eingangsrechnungen eines Lieferanten auswählen</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="overflow:auto;display:grid;gap:12px"><div class="ed-grid"><label class="field"><span>Lieferant</span><select class="input select" data-zs>${[...new Set(ers.map(d => d.partner))].map(p => `<option value="${esc(p)}" ${p === st.sup ? 'selected' : ''}>${esc(ers.find(d => d.partner === p).partner_name)}</option>`).join('')}</select></label>
        <label class="field"><span>Zahldatum</span><input class="input" type="date" data-zd value="${st.date}"></label><label class="field"><span>Zahlungsart</span><select class="input select" data-za>${['Überweisung', 'SEPA-Datei', 'Lastschrift', 'Bar', 'Kreditkarte'].map(a => `<option ${a === st.art ? 'selected' : ''}>${a}</option>`).join('')}</select></label></div>
        <div class="card">${list.length ? `<table class="tbl" style="margin:0"><tbody>${list.map(d => `<tr><td style="padding-left:14px;width:30px"><input type="checkbox" data-zc="${d.id}" ${st.sel.has(d.id) ? 'checked' : ''}></td><td><b class="mono">${esc(d.no)}</b> <span class="muted">${esc(d.data.rechnungsnr || '')} · fällig ${esc(dDate(d.due))}</span>${d.status !== 'freigegeben' && d.status !== 'teilbezahlt' ? ` <span class="pill warn" style="height:18px">${esc(DST[d.status][0])}</span>` : ''}</td><td class="r num">${cEur(d.open)}</td><td class="r num" style="color:var(--pos);padding-right:14px">${sk(d) ? '− ' + cEur(sk(d)) + ' Skonto' : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:24px"><p>Keine offenen Rechnungen.</p></div>'}</div>
        <div class="preview-box"><span>Zahlbetrag</span><b>${cEur(sum)}</b></div></div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-zgo ${sum > 0 ? '' : 'disabled'}>${ic('check', 'i-sm')}Zahlung buchen</button></div>`;
  };
  box.addEventListener('change', e => {
    if (e.target.matches('[data-zs]')) { st.sup = e.target.value; st.sel.clear(); }
    if (e.target.matches('[data-zd]')) st.date = e.target.value;
    if (e.target.matches('[data-za]')) st.art = e.target.value;
    const c = e.target.closest('[data-zc]'); if (c) c.checked ? st.sel.add(+c.dataset.zc) : st.sel.delete(+c.dataset.zc);
    render();
  });
  box.addEventListener('click', async e => {
    if (!e.target.closest('[data-zgo]')) return;
    const list = ers.filter(d => st.sel.has(d.id));
    try { await needPerm('rechnungen', 'Zahlung buchen'); } catch { return; }
    const zuordnung = list.map(d => ({er: d.id, betrag: d.open - sk(d), skonto: sk(d)}));
    try {
      const r = await invoke('doc_save', {doc: {kind: 'zahlung', partner: st.sup, partner_name: list[0].partner_name, ref: list.map(d => d.data.rechnungsnr || d.no).join(', ').slice(0, 140), date: st.date, data: {betrag: zuordnung.reduce((s, a) => s + a.betrag, 0), zuordnung, art: st.art}}, user: S.user.name});
      closeLayer(el); toast('Zahlung gebucht', {t2: `${r.no} · ${cEur(r.total)}`, type: 'pos', icon: 'cash'}); Hooks.emit('vorgang.zahlung.gebucht', {nr: r.no, betrag: r.total / 100}); docRefresh();
    } catch (err) { toast('Nicht gebucht', {t2: String(err), type: 'warn', dur: 8000}); }
  });
  render();
}
async function zahlungslauf(v) {
  const ids = $$('[data-zpe]', v).filter(c => c.checked).map(c => +c.dataset.zpe), due = v._due.filter(d => ids.includes(d.id));
  if (!due.length) return;
  try { await needPerm('rechnungen', 'Zahlungslauf'); } catch { return; }
  const by = {}; due.forEach(d => (by[d.partner] ||= []).push(d));
  let n = 0;
  for (const [sup, l] of Object.entries(by)) {
    const zuordnung = l.map(d => ({er: d.id, betrag: d.open - v._skonto(d), skonto: v._skonto(d)}));
    try { await invoke('doc_save', {doc: {kind: 'zahlung', partner: sup, partner_name: l[0].partner_name, ref: l.map(d => d.data.rechnungsnr || d.no).join(', ').slice(0, 140), date: today(), data: {betrag: zuordnung.reduce((s, a) => s + a.betrag, 0), zuordnung, art: 'SEPA-Datei'}}, user: S.user.name}); n++; }
    catch (e) { toast(`Zahlung an ${l[0].partner_name} nicht gebucht`, {t2: String(e), type: 'warn', dur: 8000}); }
  }
  toast(`${n} Zahlungen gebucht`, {t2: 'Jetzt „SEPA-Datei“ für das Online-Banking erstellen', type: 'pos', icon: 'cash'}); renderZahlungen();
}
/** SEPA-Überweisungsdatei pain.001.001.03 (von österreichischen und deutschen Banken akzeptiert) */
async function sepaExport() {
  const zs = (await docLoad('zahlung')).filter(z => z.status === 'erfasst'); await loadSuppliers();
  const iban = (CFG['zahlung.iban'] || '').replace(/\s/g, '').toUpperCase(), bic = (CFG['zahlung.bic'] || '').trim().toUpperCase();
  if (!iban) { toast('Eigene IBAN fehlt', {t2: 'Einstellungen → Zahlungsarten → IBAN', type: 'warn'}); return setGo('zahlung'); }
  const miss = zs.filter(z => !SUPPLIERS.find(s => s.id === z.partner)?.iban);
  if (miss.length) return toast('IBAN der Lieferanten fehlt', {t2: miss.map(z => z.partner_name).join(', ') + ' – unter Lieferanten ergänzen', type: 'warn', dur: 9000});
  const x = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c])).replace(/[^\x20-\x7EÄÖÜäöüß]/g, ' ');
  const sum = zs.reduce((s, z) => s + z.total, 0), id = 'KONTOR-' + Date.now(), when = zs.map(z => z.date).sort()[0] < today() ? today() : zs.map(z => z.date).sort()[0];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn>
<GrpHdr><MsgId>${id}</MsgId><CreDtTm>${new Date().toISOString().slice(0, 19)}</CreDtTm><NbOfTxs>${zs.length}</NbOfTxs><CtrlSum>${(sum / 100).toFixed(2)}</CtrlSum><InitgPty><Nm>${x(CFG['firma.name']).slice(0, 70)}</Nm></InitgPty></GrpHdr>
<PmtInf><PmtInfId>${id}-1</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>${zs.length}</NbOfTxs><CtrlSum>${(sum / 100).toFixed(2)}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf><ReqdExctnDt>${when}</ReqdExctnDt>
<Dbtr><Nm>${x(CFG['zahlung.empfaenger'] || CFG['firma.name']).slice(0, 70)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${iban}</IBAN></Id></DbtrAcct><DbtrAgt><FinInstnId>${bic ? `<BIC>${bic}</BIC>` : '<Othr><Id>NOTPROVIDED</Id></Othr>'}</FinInstnId></DbtrAgt><ChrgBr>SLEV</ChrgBr>
${zs.map(z => { const s = SUPPLIERS.find(y => y.id === z.partner); return `<CdtTrfTxInf><PmtId><EndToEndId>${x(z.no)}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">${(z.total / 100).toFixed(2)}</InstdAmt></Amt>${s.bic ? `<CdtrAgt><FinInstnId><BIC>${x(s.bic)}</BIC></FinInstnId></CdtrAgt>` : ''}<Cdtr><Nm>${x(s.name).slice(0, 70)}</Nm></Cdtr><CdtrAcct><Id><IBAN>${x(s.iban)}</IBAN></Id></CdtrAcct><RmtInf><Ustrd>${x(z.ref || z.no).slice(0, 140)}</Ustrd></RmtInf></CdtTrfTxInf>`; }).join('\n')}
</PmtInf></CstmrCdtTrfInitn></Document>`;
  try {
    const p = await invoke('save_text', {name: `SEPA_${today()}.xml`, content: xml, title: 'SEPA-Überweisungsdatei speichern'}); if (!p) return;
    for (const z of zs) await invoke('doc_action', {id: z.id, action: 'exportieren', payload: {}, user: S.user.name});
    toast('SEPA-Datei erstellt', {t2: `${zs.length} Überweisungen · ${cEur(sum)} · im Online-Banking hochladen`, type: 'pos', icon: 'download', dur: 8000}); Hooks.emit('vorgang.zahlung.sepa', {anzahl: zs.length, betrag: sum / 100}); renderZahlungen();
  } catch (e) { toast('Export fehlgeschlagen', {t2: String(e), type: 'warn'}); }
}

/* ── Retourenmanagement ── */
docPage('reklamationen', 'reklamation', {title: 'Vorerfassung Reklamation', tabs: [['offen', 'Offen', s => ['erfasst', 'pruefung', 'lieferant'].includes(s)], ['lieferant', 'Beim Lieferanten', s => s === 'lieferant'], ['erledigt', 'Erledigt', s => ['erledigt', 'abgelehnt'].includes(s)], ['alle', 'Alle', () => true]],
  cols: [{l: 'Artikel', f: d => esc(d.data.lines?.[0]?.name || '–')}, {l: 'Grund', f: d => esc(d.data.grund || '')}, {l: 'Lösung', f: d => esc(d.data.entscheidung || 'offen')}],
  kpi: l => [[num(l.filter(d => d.status === 'erfasst').length), 'neu erfasst'], [num(l.filter(d => d.status === 'pruefung').length), 'in Prüfung', 'warn'], [num(l.filter(d => d.status === 'lieferant').length), 'beim Lieferanten'], [num(l.filter(d => d.due && d.due < today() && !['erledigt', 'abgelehnt'].includes(d.status)).length), 'Frist überschritten', 'neg']],
  newLabel: 'Reklamation erfassen'});
registerPage('reklamation-neu', {title: 'Reklamation erfassen (erweitert)', sub: () => 'mit allen Angaben', render: () => {
  const v = $('#view-reklamation-neu');
  v.innerHTML = `<div class="cv">${pageHead('Reklamation erfassen (erweitert)', 'Mit Seriennummer, Kontakt, Kostenvoranschlag, Leihgerät und interner Notiz')}<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('edit')}</div><h3>Neue Reklamation</h3><p>Kunde, Artikel (scannen), Mangel und Lösung erfassen. Die Reklamation erscheint danach unter „Vorerfassung Reklamation“.</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-primary" data-rkn>${ic('plus', 'i-sm')}Reklamation erfassen</button><button class="btn btn-secondary" data-goto="reklamationen">Zur Liste</button></div></div></div></div>`;
  if (DESKTOP) setTimeout(() => S.view === 'reklamation-neu' && !$$('.layer [data-dbox]').length && openDoc('reklamation', null, {ext: true}), 150);
}});
DOC_BTNS.reklamation = st => st.id && st.data.lines?.length && !['erledigt', 'abgelehnt'].includes(st.status) ? `<button class="btn btn-ghost" data-rklr>${ic('undo', 'i-sm')}Lieferantenretoure</button>` : '';
DOC_CLICK.reklamation = async (e, st, h) => {
  if (!e.target.closest('[data-rklr]')) return;
  h.collect();
  const l = st.data.lines[0], x = l.ean ? findEan(l.ean) : null, sid = st.data.lieferant || x?.a.supplierId || '';
  await loadSuppliers();
  if (st.status !== 'lieferant') { try { await invoke('doc_action', {id: st.id, action: 'lieferant', payload: {}, user: S.user.name}); } catch { /* */ } }
  closeLayer(h.el); docRefresh();
  openDoc('lretoure', null, {partner: sid || null, partner_name: SUPPLIERS.find(s => s.id === sid)?.name || '', ref: st.no, data: {grund: st.data.grund || 'Defekt / Mangel', notiz: `Reklamation ${st.no}: ${st.data.mangel || ''}`, lines: [{...l, qty: l.qty || 1, price: x?.a.cost != null ? Math.round(x.a.cost * 100) : 0}]}, focusSearch: false});
};
docPage('lretouren', 'lretoure', {title: 'Retouren', newLabel: 'Neue Lieferantenretoure', tabs: [['offen', 'Offen', s => ['erfasst', 'versendet'].includes(s)], ['erledigt', 'Erledigt', s => ['gutgeschrieben', 'abgelehnt', 'storniert'].includes(s)], ['alle', 'Alle', () => true]],
  cols: [{l: 'Grund', f: d => esc(d.data.grund || '')}, {l: 'Stück', r: true, f: d => num((d.data.lines || []).reduce((s, l) => s + (+l.qty || 0), 0))}, {l: 'Gutschrift', r: true, f: d => d.data.gutschrift ? cEur(d.data.gutschrift.betrag) : '–'}],
  kpi: l => [[num(l.filter(d => d.status === 'erfasst').length), 'zu versenden'], [num(l.filter(d => d.status === 'versendet').length), 'unterwegs / Gutschrift offen', 'warn'], [eur0(l.filter(d => d.status === 'versendet').reduce((s, d) => s + d.total, 0) / 100), 'offener Gutschriftswert (EK)'], [eur0(l.filter(d => d.status === 'gutgeschrieben').reduce((s, d) => s + (d.data.gutschrift?.betrag || 0), 0) / 100), 'gutgeschrieben', 'pos']]});

const RPQ = {q: ''};
registerPage('retouren-protokoll', {title: 'Protokoll Retourenmanagement', sub: () => 'Reklamationen, Lieferanten- und Kundenretouren', render: renderRetProtokoll});
async function renderRetProtokoll() {
  const v = $('#view-retouren-protokoll');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('history', 'Protokoll'); return; }
  let log = [], sales = [];
  try { [log, sales] = await Promise.all([invoke('doc_log', {kinds: ['reklamation', 'lretoure'], limit: 2000}), invoke('sales_list', {limit: 3000})]); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  const ret = sales.filter(s => ['retoure', 'storno'].includes(s.kind || s.data?.kind)).map(s => ({ts: s.ts, kind: s.kind || s.data?.kind, no: s.no, user: s.cashier, action: s.kind === 'storno' ? 'Storno an der Kasse' : 'Kundenretoure an der Kasse', detail: {zu: s.ref_no || s.data?.ref || '', grund: s.data?.reason || s.data?.grund || '', betrag: cEur(-s.total)}}));
  const n = norm(RPQ.q);
  const all = [...log.map(l => ({...l, action: ({angelegt: 'angelegt', geaendert: 'geändert'})[l.action] || l.action})), ...ret].filter(x => !n || norm(`${x.no} ${x.user || ''} ${x.action} ${prText(x.detail)}`).includes(n)).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  const grund = {}; sales.filter(s => s.kind === 'retoure').forEach(s => { const g = s.data?.reason || s.data?.grund || '–'; grund[g] = (grund[g] || 0) + 1; });
  v.innerHTML = `<div class="cv">${pageHead('Protokoll Retourenmanagement', 'Lückenloser Verlauf: Reklamationen, Lieferantenretouren sowie Retouren und Stornos an der Kasse')}
    ${kpiCards([[num(log.filter(l => l.kind === 'reklamation' && l.action === 'angelegt').length), 'Reklamationen'], [num(log.filter(l => l.kind === 'lretoure' && l.action === 'versenden').length), 'an Lieferanten versendet'], [num(ret.length), 'Kassenretouren & Stornos'], [esc(Object.entries(grund).sort((a, b) => b[1] - a[1])[0]?.[0] || '–'), 'häufigster Rückgabegrund']])}
    <div class="filters"><input class="input" id="rpQ" placeholder="Nummer, Aktion, Benutzer …" value="${esc(RPQ.q)}" style="flex:1;max-width:380px"></div>
    <div class="card">${all.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Vorgang</th><th>Art</th><th>Aktion</th><th>Benutzer</th><th>Details</th></tr></thead><tbody>${all.slice(0, 800).map(x => `<tr ${x.doc_id ? `data-rpo="${x.doc_id}" data-rpk="${x.kind}" style="cursor:pointer"` : ''}><td style="padding-left:16px" class="muted num">${esc(fmtTs(x.ts))}</td><td class="mono"><b>${esc(x.no)}</b></td><td>${esc(DK[x.kind]?.one || (x.kind === 'storno' ? 'Storno' : 'Kassenretoure'))}</td><td>${esc(x.action)}</td><td>${esc(x.user || '')}</td><td class="muted" style="font-size:12.5px;overflow-wrap:anywhere">${esc(prText(x.detail))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Noch keine Einträge.</p></div>'}</div></div>`;
  $('#rpQ', v).onchange = e => { RPQ.q = e.target.value; renderRetProtokoll(); };
}

registerPage('rueckgabegruende', {title: 'Rückgabegrund', sub: () => `${retGruende().length} Gründe`, render: renderGruende});
function renderGruende() {
  const v = $('#view-rueckgabegruende'), l = retGruende().map(g => ({...g}));
  v.innerHTML = `<div class="cv">${pageHead('Rückgabegrund', 'Gründe für Retouren an der Kasse, Reklamationen und Lieferantenretouren – mit Wirkung auf Bestand und Folgeprozess. Im Filialverbund gelten die Gründe der Zentrale.')}
    <div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Code</th><th>Bezeichnung</th><th>Wieder verkaufbar</th><th>Lieferantenretoure vorschlagen</th><th></th></tr></thead><tbody>
      ${l.map((g, i) => `<tr><td style="padding-left:16px"><input class="input" data-rg="${i}" data-k="code" value="${esc(g.code || '')}" style="width:70px;height:32px"></td><td><input class="input" data-rg="${i}" data-k="text" value="${esc(g.text)}" style="height:32px"></td><td><button class="switch" role="switch" data-rgs="${i}" data-k="bestand" aria-checked="${!!g.bestand}"></button></td><td><button class="switch" role="switch" data-rgs="${i}" data-k="lieferant" aria-checked="${!!g.lieferant}"></button></td><td><button class="btn btn-ghost btn-icon btn-sm" data-rgx="${i}" aria-label="Entfernen">${ic('x', 'i-sm')}</button></td></tr>`).join('')}</tbody></table>
      <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--line)"><button class="btn btn-ghost btn-sm" data-rga>${ic('plus', 'i-sm')}Grund hinzufügen</button><span class="sp" style="flex:1"></span><button class="btn btn-ghost btn-sm" data-rgr>Standard</button><button class="btn btn-primary btn-sm" data-rgsave>${ic('check', 'i-sm')}Speichern</button></div></div></div>`;
  const read = () => { $$('[data-rg]', v).forEach(i => { l[+i.dataset.rg][i.dataset.k] = i.value.trim(); }); $$('[data-rgs]', v).forEach(b => { l[+b.dataset.rgs][b.dataset.k] = b.getAttribute('aria-checked') === 'true'; }); return l.filter(g => g.text); };
  v.onclick = async e => {
    const sw = e.target.closest('[data-rgs]'); if (sw) { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); return; }
    if (e.target.closest('[data-rga]')) { CFG['retoure.gruende'] = [...read(), {code: '', text: 'Neuer Grund', bestand: true}]; return renderGruende(); }
    const x = e.target.closest('[data-rgx]'); if (x) { const r = read(); r.splice(+x.dataset.rgx, 1); CFG['retoure.gruende'] = r; return renderGruende(); }
    if (e.target.closest('[data-rgr]')) { await saveSettings({'retoure.gruende': null}); return renderGruende(); }
    if (e.target.closest('[data-rgsave]')) { await saveSettings({'retoure.gruende': read()}); renderGruende(); }
  };
}

/* ── Wareneingangs-Verteilung (Filialverbund) ── */
registerPage('verteilung-konfig', {title: 'Wareneingangs-Verteilungs-Konfiguration', sub: () => 'Verteilschlüssel für die Filialen', render: renderVerteilKonfig});
const vtCfg = () => ({modus: 'umsatz', anteile: {}, zentrale: 0, min: 0, ...(CFG['verteilung.schluessel'] || {})});
const vtStores = () => (VB.info?.stores || []).filter(s => s.id !== vbOwn() && s.active !== false);
function renderVerteilKonfig() {
  const v = $('#view-verteilung-konfig'), c = vtCfg(), stores = vtStores();
  if (!vbOn() || vbRole() !== 'zentrale') { v.innerHTML = `<div class="cv">${pageHead('Wareneingangs-Verteilungs-Konfiguration', 'Zentral eingekaufte Ware auf die Filialen verteilen')}<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('swap')}</div><h3>Nur in der Zentrale</h3><p>Die Verteilung von Wareneingängen auf Filialen gibt es, wenn diese Installation als Zentrale im Filialverbund arbeitet.</p><button class="btn btn-primary" data-goto="filialen">Filialverbund</button></div></div></div>`; return; }
  const sum = stores.reduce((s, x) => s + (+c.anteile[x.id] || 0), 0);
  v.innerHTML = `<div class="cv">${pageHead('Wareneingangs-Verteilungs-Konfiguration', 'Nach welchem Schlüssel zentral eingegangene Ware auf die Filialen verteilt wird (Vorschlag in der Wareneingangs-Disposition, dort änderbar)', `<button class="btn btn-primary" data-vk="save">${ic('check', 'i-sm')}Speichern</button>`)}
    <div class="card">
      <div class="set-row"><div><div class="set-l">Verteilschlüssel</div><div class="set-h">${({umsatz: 'Anteil am Umsatz der letzten 30 Tage je Filiale', bedarf: 'Auffüllen auf Mindestbestand je Filiale, Rest nach Umsatz', fest: 'Feste Prozentanteile je Filiale'})[c.modus]}</div></div><div class="set-c"><div class="seg" id="vkSeg">${[['umsatz', 'nach Umsatz'], ['bedarf', 'nach Bedarf'], ['fest', 'feste Anteile']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${c.modus === k}">${l}</button>`).join('')}</div></div></div>
      <div class="set-row"><div><div class="set-l">In der Zentrale behalten</div><div class="set-h">Prozent jeder Lieferung, das nicht verteilt wird</div></div><div class="set-c"><input class="input num" id="vkZen" value="${c.zentrale}" style="width:80px;text-align:right"> %</div></div>
      <div class="set-row"><div><div class="set-l">Mindestmenge je Filiale</div><div class="set-h">Jede Filiale bekommt mindestens … Stück je Variante (sofern genug geliefert)</div></div><div class="set-c"><input class="input num" id="vkMin" value="${c.min}" style="width:80px;text-align:right"> Stück</div></div>
      ${c.modus === 'fest' ? `<div class="set-row" style="border-bottom:0;display:block"><div class="set-l" style="margin-bottom:8px">Anteile je Filiale <span class="muted" style="font-weight:400">(Summe ${num(sum)} %)</span></div>${stores.length ? stores.map(s => `<div style="display:flex;align-items:center;gap:10px;margin:6px 0"><span style="flex:1">${esc(s.name)} <span class="muted">· ${esc(s.id)}</span></span><input class="input num" data-vka="${esc(s.id)}" value="${esc(c.anteile[s.id] ?? '')}" style="width:80px;text-align:right"> %</div>`).join('') : '<p class="muted">Noch keine Filialen angelegt.</p>'}</div>` : ''}</div></div>`;
  initSeg($('#vkSeg', v), b => { CFG['verteilung.schluessel'] = {...vtCfg(), modus: b.dataset.v}; renderVerteilKonfig(); });
  v.onclick = async e => {
    if (!e.target.closest('[data-vk="save"]')) return;
    const an = {}; $$('[data-vka]', v).forEach(i => { an[i.dataset.vka] = parseAmt(i.value) || 0; });
    await saveSettings({'verteilung.schluessel': {...vtCfg(), anteile: c.modus === 'fest' ? an : c.anteile, zentrale: Math.min(100, Math.max(0, parseAmt($('#vkZen').value) || 0)), min: Math.max(0, parseInt($('#vkMin').value, 10) || 0)}});
  };
}
/** Verteilung einer Menge auf Filialen nach Schlüssel */
async function vtDistribute(lines) {
  const c = vtCfg(), stores = vtStores();
  let w = {};
  if (c.modus === 'fest') stores.forEach(s => { w[s.id] = +c.anteile[s.id] || 0; });
  else { try { const r = await invoke('store_revenue', {days: 30}); stores.forEach(s => { w[s.id] = r.filter(x => x.store === s.id).reduce((a, x) => a + Math.max(0, x.umsatz), 0); }); } catch { /* */ } }
  if (!Object.values(w).some(x => x > 0)) stores.forEach(s => { w[s.id] = 1; });
  const tot = Object.values(w).reduce((a, b) => a + b, 0);
  return lines.map(l => {
    const avail = Math.floor(l.qty * (100 - c.zentrale) / 100), out = {};
    let rest = avail;
    if (c.modus === 'bedarf') { const x = findEan(l.ean); stores.forEach(s => { const have = VB.stock?.[s.id]?.[l.ean] ?? 0, need = Math.max(0, (x?.a.minStock ?? 2) - have); const g = Math.min(need, rest); out[s.id] = g; rest -= g; }); }
    else stores.forEach(s => { out[s.id] = 0; });
    if (c.min) stores.forEach(s => { const g = Math.min(Math.max(0, c.min - out[s.id]), rest); out[s.id] += g; rest -= g; });
    // Rest nach Gewicht (größter Rest zuerst)
    const share = stores.map(s => ({id: s.id, x: rest * (w[s.id] || 0) / (tot || 1)}));
    share.forEach(sh => { const g = Math.floor(sh.x); out[sh.id] += g; });
    let left = rest - share.reduce((a, sh) => a + Math.floor(sh.x), 0);
    share.sort((a, b) => (b.x % 1) - (a.x % 1)).forEach(sh => { if (left > 0 && (w[sh.id] || 0) > 0) { out[sh.id]++; left--; } });
    return {...l, verteilung: out};
  });
}
const DP = {src: '', rows: null};
registerPage('disposition', {title: 'Wareneingangs-Disposition', sub: () => 'Ware auf Filialen verteilen', render: renderDisposition});
async function renderDisposition() {
  const v = $('#view-disposition');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('swap', 'Disposition'); return; }
  if (!vbOn() || vbRole() !== 'zentrale') { v.innerHTML = `<div class="cv">${pageHead('Wareneingangs-Disposition', 'Zentral eingegangene Ware auf Filialen verteilen')}<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('swap')}</div><h3>Nur in der Zentrale</h3><p>Diese Funktion steht zur Verfügung, wenn diese Installation die Zentrale im Filialverbund ist.</p><button class="btn btn-primary" data-goto="filialen">Filialverbund</button></div></div></div>`; return; }
  await loadPurchasing(); await loadVerbund();
  const done = new Set(Array.isArray(CFG['dispo.erledigt']) ? CFG['dispo.erledigt'] : []);
  const pos = EK.pos.filter(p => ['geliefert', 'teilgeliefert'].includes(p.status) && p.received > 0);
  const stores = vtStores();
  v.innerHTML = `<div class="cv">${pageHead('Wareneingangs-Disposition', 'Gelieferte Bestellung wählen, Vorschlag nach Verteilschlüssel prüfen und als Umlagerungen an die Filialen versenden', `<button class="btn btn-secondary" data-goto="verteilung-konfig">${ic('sliders', 'i-sm')}Verteilschlüssel</button>`)}
    <div class="card" style="padding:16px;margin-bottom:14px"><label class="field"><span>Wareneingang</span><select class="input select" id="dpSrc"><option value="">– Bestellung wählen –</option>${pos.map(p => `<option value="${p.id}" ${String(p.id) === DP.src ? 'selected' : ''}>${esc(p.no)} · ${esc(p.supplier)} · ${num(p.received)} Stück geliefert${done.has(p.id) ? ' · bereits verteilt' : ''}</option>`).join('')}</select></label></div>
    ${DP.rows ? `<div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Artikel</th><th class="r">geliefert</th>${stores.map(s => `<th class="r">${esc(s.name)}</th>`).join('')}<th class="r" style="padding-right:16px">bleibt Zentrale</th></tr></thead><tbody>
      ${DP.rows.map((r, i) => { const sumS = stores.reduce((a, s) => a + (+r.verteilung[s.id] || 0), 0); return `<tr><td style="padding-left:16px"><b>${esc(r.name)}</b><div class="muted" style="font-size:12px">${esc(r.ean)}</div></td><td class="r num">${r.qty}</td>${stores.map(s => `<td class="r"><input class="input num" data-dpq="${i}" data-st="${esc(s.id)}" value="${r.verteilung[s.id] || 0}" style="width:64px;height:32px;text-align:right"></td>`).join('')}<td class="r num" style="padding-right:16px;color:${r.qty - sumS < 0 ? 'var(--neg)' : 'inherit'}">${r.qty - sumS}</td></tr>`; }).join('')}</tbody></table>
      <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--line)"><span class="muted" style="font-size:12.5px;align-self:center">Je Filiale wird eine Umlagerung angelegt und sofort als versendet gebucht (Bestand der Zentrale sinkt); die Filiale bucht beim Empfang ein.</span><span class="sp" style="flex:1"></span><button class="btn btn-primary" data-dp="go">${ic('truck', 'i-sm')}Umlagerungen anlegen</button></div></div>` : ''}</div>`;
}
async function dpLoad(id) {
  DP.src = String(id); DP.rows = null;
  if (id) { const lines = await invoke('po_lines', {id: +id}); DP.rows = await vtDistribute(lines.filter(l => l.received > 0).map(l => ({ean: l.ean, name: `${l.name} · ${colorName(l.color)} · ${l.size}`, qty: l.received}))); }
  renderDisposition();
}
async function dpGo() {
  const stores = vtStores(); $$('[data-dpq]').forEach(i => { DP.rows[+i.dataset.dpq].verteilung[i.dataset.st] = Math.max(0, parseInt(i.value, 10) || 0); });
  if (DP.rows.some(r => stores.reduce((a, s) => a + (r.verteilung[s.id] || 0), 0) > r.qty)) return toast('Mehr verteilt als geliefert', {type: 'warn'});
  try { await needPerm('einkauf', 'Disposition'); } catch { return; }
  let n = 0;
  for (const s of stores) {
    const lines = DP.rows.filter(r => r.verteilung[s.id] > 0).map(r => ({ean: r.ean, qty: r.verteilung[s.id], name: r.name}));
    if (!lines.length) continue;
    try { const t = await invoke('verbund_transfer_create', {from: vbOwn(), to: s.id, lines, note: `Disposition ${EK.pos.find(p => p.id === +DP.src)?.no || ''}`, user: S.user.name}); await invoke('verbund_transfer_status', {no: t.no, status: 'versendet', user: S.user.name}); n++; }
    catch (e) { toast(`Umlagerung an ${s.name} fehlgeschlagen`, {t2: String(e), type: 'warn', dur: 8000}); }
  }
  await saveSettings({'dispo.erledigt': [...new Set([...(CFG['dispo.erledigt'] || []), +DP.src])]}, true);
  toast(`${n} Umlagerungen versendet`, {t2: 'Die Filialen sehen sie unter Umlagerungen', type: 'pos', icon: 'truck'}); Hooks.emit('verbund.disposition', {bestellung: DP.src, filialen: n});
  await loadCatalog(); DP.rows = null; DP.src = ''; renderDisposition();
}

/* ── Umlage Lieferantenbonus ── */
const LB = {year: new Date().getFullYear()};
registerPage('lieferantenbonus', {title: 'Umlage Lieferantenbonus', sub: () => `Jahr ${LB.year}`, render: renderBonus});
async function renderBonus() {
  const v = $('#view-lieferantenbonus');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('percent', 'Lieferantenbonus'); return; }
  let vol, docs; try { [vol, docs] = await Promise.all([invoke('purchase_volume', {year: LB.year}), docLoad('bonus')]); await loadSuppliers(); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  const agr = sid => docs.find(d => d.partner === sid && d.data.jahr === LB.year && d.status !== 'storniert');
  const bySup = {}; vol.forEach(r => { (bySup[r.lieferant] ||= {wert: 0, wg: {}}); bySup[r.lieferant].wert += r.wert; bySup[r.lieferant].wg[r.warengruppe] = (bySup[r.lieferant].wg[r.warengruppe] || 0) + r.wert; });
  const pct = (a, w) => { const st = (a?.data.staffel || []).slice().sort((x, y) => y.ab - x.ab).find(s => w >= s.ab); return st ? +st.pct : 0; };
  const rows = SUPPLIERS.map(s => { const a = agr(s.id), w = bySup[s.id]?.wert || 0, p = pct(a, w); return {s, a, w, p, bonus: Math.round(w * p / 100)}; }).filter(r => r.a || r.w);
  const catN = id => CATS.find(c => c.id === id)?.name || id;
  v.innerHTML = `<div class="cv">${pageHead('Umlage Lieferantenbonus', 'Bonusvereinbarungen (Staffel nach Einkaufsvolumen) – Bonus berechnen und auf Warengruppen umlegen (mindert den Wareneinsatz)', `<select class="input select" id="lbYear" style="width:auto">${[0, 1, 2].map(i => new Date().getFullYear() - i).map(y => `<option ${y === LB.year ? 'selected' : ''}>${y}</option>`).join('')}</select><button class="btn btn-primary" data-lb="neu">${ic('plus', 'i-sm')}Vereinbarung</button>`)}
    ${kpiCards([[eur0(vol.reduce((s, r) => s + r.wert, 0) / 100), `Einkaufsvolumen ${LB.year} (EK)`], [num(rows.filter(r => r.a).length), 'Vereinbarungen'], [eur0(rows.reduce((s, r) => s + r.bonus, 0) / 100), 'erwarteter Bonus', 'pos'], [num(rows.filter(r => r.a?.status === 'umgelegt').length), 'bereits umgelegt']])}
    <div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Lieferant</th><th>Staffel</th><th class="r">Volumen</th><th class="r">Bonus %</th><th class="r">Bonus</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td style="padding-left:16px"><b>${esc(r.s.name)}</b></td><td class="muted" style="font-size:12.5px">${r.a ? (r.a.data.staffel || []).map(s => `ab ${eur0(s.ab / 100)}: ${num(s.pct, 1)} %`).join(' · ') : '<span class="muted">keine Vereinbarung</span>'}</td><td class="r num">${cEur(r.w)}</td><td class="r num">${r.p ? num(r.p, 1) + ' %' : '–'}</td><td class="r num" style="font-weight:600;color:var(--pos)">${r.bonus ? cEur(r.bonus) : '–'}</td><td>${r.a ? dPill(r.a.status) : ''}</td><td class="r" style="padding-right:12px;white-space:nowrap">${r.a ? `<button class="btn btn-ghost btn-sm" data-lbe="${r.a.id}">Bearbeiten</button>` : `<button class="btn btn-ghost btn-sm" data-lbn="${esc(r.s.id)}">Anlegen</button>`}${r.bonus && r.a?.status === 'aktiv' ? `<button class="btn btn-secondary btn-sm" data-lbu="${r.a.id}">Umlegen</button>` : ''}</td></tr>
      ${r.bonus ? `<tr><td></td><td colspan="6" style="padding-top:0"><div style="display:flex;flex-wrap:wrap;gap:6px">${Object.entries(bySup[r.s.id].wg).map(([wg, x]) => `<span class="pill" style="height:22px">${esc(catN(wg))}: ${cEur(Math.round(r.bonus * x / r.w))}</span>`).join('')}</div></td></tr>` : ''}`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('percent')}</div><h3>Noch kein Einkaufsvolumen</h3><p>Das Volumen ergibt sich aus Wareneingängen gegen Bestellungen.</p></div>`}</div></div>`;
  v._rows = rows; v._bySup = bySup;
}
function openBonus(doc, sid) {
  const st = doc ? JSON.parse(JSON.stringify(doc)) : {kind: 'bonus', partner: sid, partner_name: SUPPLIERS.find(s => s.id === sid)?.name || '', data: {jahr: LB.year, staffel: [{ab: 0, pct: 1}, {ab: 2000000, pct: 2}, {ab: 5000000, pct: 3}]}};
  const el = openLayer(`<div class="modal" style="width:min(560px,100%)" role="dialog" aria-modal="true"><div data-lbb></div></div>`);
  const box = $('[data-lbb]', el);
  const render = () => { box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('percent')}</div><div><h2>Bonusvereinbarung ${esc(st.partner_name)}</h2><p>Jahr ${st.data.jahr} · Staffel nach Einkaufsvolumen (EK netto)</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:8px">${st.data.staffel.map((s, i) => `<div style="display:flex;gap:8px;align-items:center">ab <input class="input num" data-lbs="${i}" data-k="ab" value="${num(s.ab / 100, 0)}" style="width:130px;text-align:right"> € → <input class="input num" data-lbs="${i}" data-k="pct" value="${num(s.pct, 1)}" style="width:80px;text-align:right"> % <button class="btn btn-ghost btn-icon btn-sm" data-lbx="${i}">${ic('x', 'i-sm')}</button></div>`).join('')}<div><button class="btn btn-ghost btn-sm" data-lba>${ic('plus', 'i-sm')}Stufe</button></div></div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-lbsave>${ic('check', 'i-sm')}Speichern</button></div>`; };
  const read = () => $$('[data-lbs]', box).forEach(i => { st.data.staffel[+i.dataset.lbs][i.dataset.k] = i.dataset.k === 'ab' ? e2c(i.value) : parseAmt(i.value) || 0; });
  box.addEventListener('click', async e => {
    if (e.target.closest('[data-lba]')) { read(); st.data.staffel.push({ab: 0, pct: 0}); return render(); }
    const x = e.target.closest('[data-lbx]'); if (x) { read(); st.data.staffel.splice(+x.dataset.lbx, 1); return render(); }
    if (e.target.closest('[data-lbsave]')) { read(); try { await invoke('doc_save', {doc: {...st, data: {...st.data, titel: 'Bonus ' + st.data.jahr}}, user: S.user.name}); closeLayer(el); toast('Vereinbarung gespeichert', {type: 'pos', icon: 'percent'}); renderBonus(); } catch (err) { toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); } }
  });
  render();
}
async function bonusUmlegen(id) {
  const v = $('#view-lieferantenbonus'), r = v._rows.find(x => x.a?.id === id); if (!r) return;
  const wg = Object.entries(v._bySup[r.s.id].wg).map(([k, x]) => ({warengruppe: k, volumen: x, bonus: Math.round(r.bonus * x / r.w)}));
  if (!(await confirmBox(`Bonus ${cEur(r.bonus)} von ${r.s.name} auf ${wg.length} Warengruppen umlegen und als CSV exportieren?`))) return;
  try {
    await invoke('doc_action', {id, action: 'umlegen', payload: {bonus: r.bonus, pct: r.p, volumen: r.w, warengruppen: wg, jahr: LB.year}, user: S.user.name});
    const csv = ['Lieferant;Jahr;Warengruppe;Volumen EK;Bonus'].concat(wg.map(x => [r.s.name, LB.year, CATS.find(c => c.id === x.warengruppe)?.name || x.warengruppe, num(x.volumen / 100, 2), num(x.bonus / 100, 2)].join(';'))).join('\r\n');
    await invoke('save_text', {name: `Bonus_${r.s.name.replace(/\W+/g, '-')}_${LB.year}.csv`, content: csv, title: 'Bonusumlage exportieren'});
    toast('Bonus umgelegt', {t2: `${cEur(r.bonus)} · ${wg.length} Warengruppen`, type: 'pos', icon: 'percent'}); renderBonus();
  } catch (e) { toast('Nicht möglich', {t2: String(e), type: 'warn'}); }
}

/* ── Lieferant: Bankdaten im Formular ── */
{
  const _os = openSupplier;
  openSupplier = function (s) {
    _os(s);
    const g = $('.ed-grid', $$('.layer').pop() || document); if (!g || $('[data-sf="iban"]', g)) return;
    g.insertAdjacentHTML('beforeend', `<label class="field"><span>IBAN (für SEPA-Zahlungen)</span><input class="input mono" data-sf="iban" value="${esc(s?.iban || '')}"></label><label class="field"><span>BIC</span><input class="input mono" data-sf="bic" value="${esc(s?.bic || '')}"></label>`);
  };
}

function bindEinkauf2() {
  const on = (id, fn) => $('#view-' + id)?.addEventListener('click', fn);
  fileDrop($('#view-order-import'), {accept: /\.(csv|txt)$/i, hint: 'Bestelldatei hier ablegen', onFiles: async ([f]) => {
    const t = await f.text(), s = $('#oiSup'); if (s) { OI.sup = s.value; OI.type = $('#oiType').value; }
    OI.text = t; OI.res = parseOrderText(t); renderOrderImport();
  }});
  on('order-import', async e => {
    const b = e.target.closest('[data-oi]'); if (!b) return;
    const sync = () => { OI.sup = $('#oiSup').value; OI.type = $('#oiType').value; OI.text = $('#oiText').value; };
    sync();
    if (b.dataset.oi === 'datei') { try { const t = await invoke('open_text', {title: 'Bestelldatei öffnen (CSV)', ext: 'csv'}); if (t) { OI.text = t; OI.res = parseOrderText(t); renderOrderImport(); } } catch (err) { toast('Datei nicht lesbar', {t2: String(err), type: 'warn'}); } }
    if (b.dataset.oi === 'pruefen') { OI.res = parseOrderText(OI.text); renderOrderImport(); }
    if (b.dataset.oi === 'anlegen') {
      try { const id = await invoke('po_save', {id: null, supplier: OI.sup, note: 'Order Import', lines: OI.res.ok.map(x => ({variant_id: x.v.vid, qty: x.qty, cost: x.cost})), user: S.user.name}); await invoke('po_set_type', {id, orderType: OI.type}); await loadPurchasing();
        toast('Bestellentwurf angelegt', {t2: `${EK.pos.find(p => p.id === id)?.no} · ${OI.res.ok.length} Positionen`, type: 'pos', icon: 'truck'}); Hooks.emit('purchasing.order.imported', {positionen: OI.res.ok.length}); OI.res = null; OI.text = ''; go('einkauf'); openPO(id);
      } catch (err) { toast('Nicht angelegt', {t2: String(err), type: 'warn'}); }
    }
  });
  on('order-vorschlag', async e => {
    const s = e.target.closest('[data-ovs]'); if (s) { const lines = ovLines(e.target.closest('[data-ovg]')); if (!lines.length) return toast('Keine Position ausgewählt', {type: 'warn'}); return openPO(null, {supplier: s.dataset.ovs, lines, type: 'Nachorder'}); }
    if (e.target.closest('[data-ov="alle"]')) {
      let n = 0;
      for (const card of $$('[data-ovg]')) { const sid = card.dataset.ovg; if (!sid) continue; const ls = ovLines(card).map(l => ({variant_id: l.variant_id, qty: parseInt(l.qty, 10) || 0, cost: l.cost})).filter(l => l.qty > 0); if (!ls.length) continue; try { const id = await invoke('po_save', {id: null, supplier: sid, note: 'aus Order Vorschlag', lines: ls, user: S.user.name}); await invoke('po_set_type', {id, orderType: 'Nachorder'}); n++; } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } }
      EK.loaded = false; toast(`${n} Bestellentwürfe angelegt`, {t2: 'Unter Order prüfen und bestellen', type: 'pos', icon: 'truck'}); go('einkauf');
    }
  });
  on('avis', e => { const b = e.target.closest('[data-avis]'); if (!b) return; if (b.dataset.avis === 'po') avisFromPO(); else avisFromFile(); });
  const ws = $('#view-we-scanner');
  ws.addEventListener('keydown', e => {
    if (e.target.id !== 'wsEan' || e.key !== 'Enter') return;
    const ean = e.target.value.trim(), x = findEan(ean), q = Math.max(1, parseInt($('#wsQty').value, 10) || 1);
    if (!x) { shakeEl(e.target); $('#wsHit').innerHTML = `<span style="color:var(--neg)">EAN ${esc(ean)} unbekannt</span>`; e.target.select(); return; }
    WS.items.push({ean, qty: q}); try { beep?.(); } catch { /* */ } renderWeScanner().then(() => { $('#wsHit').textContent = `+${q} · ${x.a.name} · ${colorName(x.v.c)} · ${x.v.s}`; });
  });
  ws.addEventListener('change', e => { if (e.target.id === 'wsRef') { const [t, id] = e.target.value.split(':'); WS.avis = t === 'avis' ? +id : null; WS.po = t === 'po' ? +id : null; renderWeScanner(); } });
  ws.addEventListener('click', e => {
    const m = e.target.closest('[data-wsm]'); if (m) { const i = WS.items.map(x => x.ean).lastIndexOf(m.dataset.wsm); if (i >= 0) { WS.items[i].qty--; if (WS.items[i].qty <= 0) WS.items.splice(i, 1); } return renderWeScanner(); }
    const b = e.target.closest('[data-ws]'); if (!b) return;
    if (b.dataset.ws === 'reset') { WS.items = []; WS.avis = null; WS.po = null; renderWeScanner(); }
    if (b.dataset.ws === 'book') wsBook();
  });
  on('we-protokoll', e => { const k = e.target.closest('[data-wpk]'); if (k) wpCorrect($('#view-we-protokoll')._rows[+k.dataset.wpk]); });
  on('zahlungen', e => { const b = e.target.closest('[data-zp]'); if (!b) return; if (b.dataset.zp === 'neu') openSupplierPayment(); if (b.dataset.zp === 'sepa') sepaExport(); if (b.dataset.zp === 'lauf') zahlungslauf($('#view-zahlungen')); });
  $('#view-zahlungen').addEventListener('change', e => { if (e.target.id === 'zpTage') { ZP.tage = +e.target.value; renderZahlungen(); } });
  on('reklamation-neu', e => { if (e.target.closest('[data-rkn]')) openDoc('reklamation', null, {ext: true}); });
  on('retouren-protokoll', e => { const r = e.target.closest('[data-rpo]'); if (r) openDoc(r.dataset.rpk, +r.dataset.rpo); });
  $('#view-disposition').addEventListener('change', e => { if (e.target.id === 'dpSrc') dpLoad(e.target.value); });
  on('disposition', e => { if (e.target.closest('[data-dp="go"]')) dpGo(); });
  on('lieferantenbonus', e => {
    if (e.target.closest('[data-lb="neu"]')) { const free = SUPPLIERS.find(s => !$('#view-lieferantenbonus')._rows.some(r => r.s.id === s.id && r.a)); return openBonus(null, free?.id || SUPPLIERS[0]?.id); }
    const n = e.target.closest('[data-lbn]'); if (n) return openBonus(null, n.dataset.lbn);
    const ed = e.target.closest('[data-lbe]'); if (ed) return invoke('doc_get', {id: +ed.dataset.lbe}).then(d => openBonus(d));
    const u = e.target.closest('[data-lbu]'); if (u) return bonusUmlegen(+u.dataset.lbu);
  });
  $('#view-lieferantenbonus').addEventListener('change', e => { if (e.target.id === 'lbYear') { LB.year = +e.target.value; renderBonus(); } });
}
