
/* ════════════════════════════════════════════════════════════════════
   35 · EIGENE SEITEN — Belege, Kassenbuch, Gutscheine, Lieferanten,
   Wareneingang, Etiketten, Buchhaltung, KI-Analyse, Benutzer & Rechte,
   Protokoll, Hilfe. Jede Seite ist ein eigener Menüpunkt.
   ════════════════════════════════════════════════════════════════════ */
Object.assign(VIEW_PERM, {kassenbuch: 'kasse.kassenbuch', wareneingang: 'einkauf', lieferanten: 'einkauf', buchhaltung: 'berichte', ki: 'berichte', benutzer: 'system', protokoll: 'system', datensicherung: 'system'});
const pageHead = (title, sub, actions = '') => `<div class="cv-head"><div><h2 class="h-title">${esc(title)}</h2><div class="dash-meta" style="margin-top:6px"><span>${sub}</span></div></div>${actions ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${actions}</div>` : ''}</div>`;
const kpiCards = list => `<div class="kpis">${list.map(([v, l, tone]) => `<div class="card"><b ${tone ? `style="color:var(--${tone})"` : ''}>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
const desktopEmpty = (icon, t) => `<div class="cv"><div class="card"><div class="empty" style="padding:64px 20px"><div class="empty-icon">${ic(icon)}</div><h3>${esc(t)} nur in der Desktop-App</h3><p>Diese Seite liest die lokale Datenbank.</p></div></div></div>`;
const loadingCard = t => `<div class="card" style="padding:22px"><span class="thinking"><b>${esc(t)} …</b></span></div>`;
const dayStart = (n = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
const payLabels = d => [...new Set((d?.parts || []).map(p => p.label || p.m))].join(', ');

/* ── Belege ── */
const BL = {list: [], q: '', kind: 'alle', range: '7', sel: null};
registerPage('belege', {title: 'Belege', sub: () => 'Journal aller Bons, Retouren und Stornos', render: renderBelege});
async function renderBelege() {
  const v = $('#view-belege');
  v.innerHTML = `<div class="cv">${pageHead('Belege', 'Bons suchen, Kopie drucken, per E-Mail senden, Rechnung erstellen, Retoure oder Storno buchen',
    `<button class="btn btn-secondary" data-bl="ret">${ic('undo', 'i-sm')}Retoure starten</button><button class="btn btn-secondary" data-bl="x">${ic('receipt', 'i-sm')}X-Bericht</button>`)}
    <div id="blKpi"></div>
    <div class="filters"><input class="input" id="blQ" placeholder="Belegnummer, Artikel, Kunde, Kassier:in …" value="${esc(BL.q)}" style="flex:1;min-width:240px;max-width:420px">
      <div class="seg" id="blKind">${[['alle', 'Alle'], ['verkauf', 'Verkäufe'], ['retoure', 'Retouren'], ['storno', 'Stornos']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${BL.kind === k}">${l}</button>`).join('')}</div>
      <div class="seg" id="blRange">${[['0', 'Heute'], ['7', '7 Tage'], ['30', '30 Tage'], ['alle', 'Alle']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${BL.range === k}">${l}</button>`).join('')}</div></div>
    <div class="pg-split"><div class="card" id="blList">${loadingCard('Lade Belege')}</div><div class="card" id="blView"></div></div></div>`;
  initSeg($('#blKind', v), b => { BL.kind = b.dataset.v; renderBlList(); });
  initSeg($('#blRange', v), b => { BL.range = b.dataset.v; renderBlList(); });
  try { BL.list = DESKTOP ? await invoke('sales_list', {limit: 3000}) : MEM.sales.map(s => ({...s, ts: s.ts || new Date().toISOString()})); } catch (e) { BL.list = []; toast('Belege nicht verfügbar', {t2: String(e), type: 'warn'}); }
  renderBlList();
}
function blFiltered() {
  const n = norm(BL.q), from = BL.range === 'alle' ? null : dayStart(+BL.range);
  return BL.list.filter(s => (BL.kind === 'alle' || (s.kind || 'verkauf') === BL.kind) && (!from || new Date(s.ts) >= from)
    && (!n || norm(`${s.no} ${s.cashier || ''} ${s.data?.customer?.name || ''} ${(s.data?.lines || []).map(l => l.name).join(' ')}`).includes(n)));
}
function renderBlList() {
  const box = $('#blList'); if (!box) return;
  const f = blFiltered(), sales = f.filter(s => (s.kind || 'verkauf') === 'verkauf'), sum = f.reduce((a, s) => a + (s.total || 0), 0) / 100;
  $('#blKpi').innerHTML = kpiCards([[num(f.length), 'Belege im Filter'], [eur(sum), 'Summe (netto nach Retouren)'], [sales.length ? eur(sales.reduce((a, s) => a + s.total, 0) / 100 / sales.length) : '–', 'Ø Bon'], [num(f.length - sales.length), 'Retouren & Stornos', f.length - sales.length ? 'warn' : '']]);
  if (!f.some(s => s.no === BL.sel)) BL.sel = f[0]?.no || null;
  box.innerHTML = f.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Beleg</th><th>Zeit</th><th>Art</th><th>Kassier:in</th><th>Kunde</th><th>Zahlung</th><th class="r" style="padding-right:16px">Betrag</th></tr></thead><tbody>${f.slice(0, 400).map(s => { const k = s.kind || 'verkauf'; return `<tr data-bln="${esc(s.no)}" class="${s.no === BL.sel ? 'sel' : ''}" style="cursor:pointer"><td style="padding-left:16px" class="mono">${esc(s.no)}</td><td class="muted num">${esc(fmtTs(s.ts))}</td><td>${k === 'verkauf' ? (s.voided ? '<span class="pill neg">storniert</span>' : 'Verkauf') : `<span class="pill ${k === 'storno' ? 'neg' : 'warn'}">${esc(kindLabel(s))}</span>`}</td><td>${esc(s.cashier || '–')}</td><td>${esc(s.data?.customer?.name || '')}</td><td class="muted" style="font-size:12.5px">${esc(payLabels(s.data))}</td><td class="r num" style="padding-right:16px;font-weight:600;${s.total < 0 ? 'color:var(--neg)' : ''}">${eur(s.total / 100)}</td></tr>`; }).join('')}</tbody></table>${f.length > 400 ? `<div class="muted" style="padding:10px 16px;font-size:12px">${num(f.length - 400)} weitere – Filter eingrenzen</div>` : ''}`
    : `<div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('receipt')}</div><h3>Keine Belege</h3><p>Zeitraum oder Suche anpassen.</p></div>`;
  renderBlView();
}
function renderBlView() {
  const box = $('#blView'); if (!box) return;
  const s = BL.list.find(x => x.no === BL.sel);
  if (!s) { box.innerHTML = `<div class="empty" style="padding:40px"><p>Beleg auswählen</p></div>`; return; }
  const k = s.kind || 'verkauf', can = DESKTOP && k === 'verkauf' && !s.voided;
  box.innerHTML = `<div class="set-row"><div><div class="set-l">${esc(kindLabel(s))} ${esc(s.no)}</div><div class="set-h">${esc(fmtTs(s.ts))} · ${esc(s.cashier || '')}${s.ref_no ? ` · zu ${esc(s.ref_no)}` : ''}</div></div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line)"><button class="btn btn-secondary btn-sm" data-bl="copy">${ic('printer', 'i-sm')}Kopie</button>${DESKTOP ? `<button class="btn btn-secondary btn-sm" data-bl="mail">${ic('mail', 'i-sm')}E-Mail</button>` : ''}${DESKTOP && k === 'verkauf' ? `<button class="btn btn-secondary btn-sm" data-bl="rechnung">${ic('receipt', 'i-sm')}Rechnung</button><button class="btn btn-secondary btn-sm" data-bl="lieferschein">${ic('truck', 'i-sm')}Lieferschein</button>` : ''}${can ? `<button class="btn btn-secondary btn-sm" data-bl="retoure">${ic('undo', 'i-sm')}Retoure</button><button class="btn btn-ghost btn-sm" data-bl="storno" style="color:var(--neg)">${ic('x', 'i-sm')}Storno</button>` : ''}</div>
    <div style="padding:14px;max-height:calc(100dvh - 330px);overflow:auto"><div class="receipt-wrap" style="padding:0">${receiptHTML(recFromData(s.no, {...s.data, kind: k}), prefs.tpl || 'classic')}</div></div>`;
}
async function blAction(a) {
  if (a === 'ret') return openReturnStart();
  if (a === 'x') return xReport();
  const s = BL.list.find(x => x.no === BL.sel); if (!s) return;
  const rec = recFromData(s.no, {...s.data, kind: s.kind || s.data?.kind});
  const after = () => { if (S.view === 'belege') renderBelege(); };
  if (a === 'copy') { Hooks.emit('pos.receipt.copy', {beleg: s.no}); if (DESKTOP) printReceipt(rec, {copy: true}); else toast(`Belegkopie ${s.no}`, {icon: 'printer'}); }
  else if (a === 'mail') mailReceipt(rec);
  else if (a === 'rechnung' || a === 'lieferschein') printInvoice(rec, a);
  else if (a === 'retoure') openReturn(s.no, {onDone: after});
  else if (a === 'storno') openReturn(s.no, {storno: true, onDone: after});
}

/* ── Kassenbuch & Abschluss ── */
registerPage('kassenbuch', {title: 'Kassenbuch & Abschluss', sub: () => 'Bargeld, Einlagen, Entnahmen, Tagesabschlüsse', render: renderKassenbuch});
const KB_MOVE_LBL = {einlage: 'Einlage', entnahme: 'Entnahme', anfang: 'Anfangsbestand', uebertrag: 'Übertrag'};
async function renderKassenbuch() {
  const v = $('#view-kassenbuch');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('cash', 'Kassenbuch'); return; }
  v.innerHTML = `<div class="cv">${pageHead('Kassenbuch & Abschluss', 'Laufender Zeitraum seit dem letzten Tagesabschluss', `<button class="btn btn-secondary" data-kb="move">${ic('cash', 'i-sm')}Einlage / Entnahme</button><button class="btn btn-secondary" data-kb="x">${ic('receipt', 'i-sm')}X-Bericht</button><button class="btn btn-primary" data-kb="z">${ic('lock', 'i-sm')}Tagesabschluss</button>`)}<div id="kbBody">${loadingCard('Lade Kassenbuch')}</div></div>`;
  let s, moves, zs;
  try { [s, moves, zs] = await Promise.all([invoke('cash_status'), invoke('cash_moves_list', {limit: 300}), invoke('closings_list')]); } catch (e) { $('#kbBody').innerHTML = `<div class="card" style="padding:18px">${esc(String(e))}</div>`; return; }
  const e2 = c => eur((c || 0) / 100);
  $('#kbBody').innerHTML = kpiCards([[e2(s.cash.expected), 'Bargeld laut Kassenbuch'], [e2(s.revenue), 'Umsatz seit letztem Abschluss'], [num(s.counts.sales), 'Bons'], [e2(s.cash.deposits), 'Einlagen'], [e2(s.cash.withdrawals), 'Entnahmen']])
    + `<div class="ds-grid" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start">
      <div class="card"><div class="set-row"><div><div class="set-l">Kassenbuch</div><div class="set-h">Alle Bargeldbewegungen außerhalb von Verkäufen</div></div></div>${moves.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Art</th><th>Grund</th><th class="r" style="padding-right:16px">Betrag</th></tr></thead><tbody>${moves.map(m => { const neg = m.amount < 0; return `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(m.ts))}</td><td>${esc(KB_MOVE_LBL[m.kind] || m.kind)}${m.closing_id ? '' : ' <span class="pill accent" style="height:18px">offen</span>'}</td><td>${esc(m.reason)}<div class="muted" style="font-size:11.5px">${esc(m.user || '')}</div></td><td class="r num" style="padding-right:16px;font-weight:600;color:var(--${neg ? 'neg' : 'pos'})">${neg ? '−' : '+'}${e2(Math.abs(m.amount))}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty" style="padding:30px"><p>Noch keine Einlagen oder Entnahmen.</p></div>'}</div>
      <div class="card"><div class="set-row"><div><div class="set-l">Tagesabschlüsse (Z-Berichte)</div><div class="set-h">Klick öffnet den Bericht · Druck jederzeit möglich</div></div></div>${zs.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Nr.</th><th>Zeitpunkt</th><th class="r">Umsatz</th><th class="r">Gezählt</th><th class="r" style="padding-right:16px">Differenz</th></tr></thead><tbody>${zs.map((z, i) => `<tr data-kbz="${i}" style="cursor:pointer"><td style="padding-left:16px"><b>${esc(z.no)}</b></td><td class="muted num">${esc(fmtTs(z.ts))}</td><td class="r num">${e2(z.data?.revenue)}</td><td class="r num">${e2(z.counted)}</td><td class="r num" style="padding-right:16px;color:${z.diff ? 'var(--warn)' : 'inherit'}">${e2(z.diff)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:30px"><p>Noch kein Tagesabschluss.</p></div>'}</div></div>`;
  $('#kbBody')._z = zs;
}
Hooks.on('cash.moved', () => S.view === 'kassenbuch' && setTimeout(renderKassenbuch, 300));
Hooks.on('cash.closing', () => S.view === 'kassenbuch' && setTimeout(renderKassenbuch, 300));

/* ── Gutscheine ── */
const GS = {list: [], f: 'aktiv', q: ''};
registerPage('gutscheine', {title: 'Gutscheine', sub: () => 'Ausgegebene Gutscheine, Restwerte, Ablauf', render: renderGutscheine});
const gsState = g => g.status !== 'aktiv' ? 'eingelöst' : (g.valid_until && g.valid_until < today()) ? 'abgelaufen' : g.balance <= 0 ? 'eingelöst' : 'aktiv';
async function renderGutscheine() {
  const v = $('#view-gutscheine');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('gift', 'Gutscheine'); return; }
  try { GS.list = await invoke('voucher_list'); } catch (e) { GS.list = []; }
  const act = GS.list.filter(g => gsState(g) === 'aktiv'), sum = act.reduce((a, g) => a + g.balance, 0);
  v.innerHTML = `<div class="cv">${pageHead('Gutscheine', 'Jeder Gutschein hat einen eigenen Code und Restwert – einlösbar an der Kasse', `<button class="btn btn-primary" data-gs="neu">${ic('gift', 'i-sm')}Gutschein verkaufen</button>`)}
    ${kpiCards([[num(act.length), 'aktive Gutscheine'], [eur(sum / 100), 'offener Wert (Verbindlichkeit)'], [eur(GS.list.reduce((a, g) => a + g.initial, 0) / 100), 'insgesamt ausgegeben'], [eur(GS.list.reduce((a, g) => a + (g.initial - g.balance), 0) / 100), 'eingelöst']])}
    <div class="filters"><input class="input" id="gsQ" placeholder="Code suchen …" value="${esc(GS.q)}" style="max-width:280px"><div class="seg" id="gsSeg">${[['aktiv', 'Aktiv'], ['eingelöst', 'Eingelöst'], ['abgelaufen', 'Abgelaufen'], ['alle', 'Alle']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${GS.f === k}">${l}</button>`).join('')}</div></div>
    <div class="card" id="gsList"></div></div>`;
  initSeg($('#gsSeg', v), b => { GS.f = b.dataset.v; renderGsList(); });
  renderGsList();
}
function renderGsList() {
  const box = $('#gsList'); if (!box) return;
  const l = GS.list.filter(g => (GS.f === 'alle' || gsState(g) === GS.f) && (!GS.q || g.code.toLowerCase().includes(GS.q.toLowerCase())));
  const tone = {aktiv: 'pos', eingelöst: '', abgelaufen: 'warn'};
  box.innerHTML = l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Code</th><th>Status</th><th class="r">Wert</th><th class="r">Restwert</th><th>gültig bis</th><th>Verkauft mit</th><th>Ausgegeben</th></tr></thead><tbody>${l.map(g => `<tr><td style="padding-left:16px" class="mono"><b>${esc(g.code)}</b></td><td><span class="pill ${tone[gsState(g)]}">${gsState(g)}</span></td><td class="r num">${eur(g.initial / 100)}</td><td class="r num" style="font-weight:600">${eur(g.balance / 100)}</td><td class="num">${g.valid_until ? esc(new Date(g.valid_until).toLocaleDateString('de-AT')) : '–'}</td><td>${g.sale_no ? `<button class="btn btn-ghost btn-sm" data-gssale="${esc(g.sale_no)}">${esc(g.sale_no)}</button>` : '–'}</td><td class="muted">${esc(fmtTs(g.created_at))}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('gift')}</div><h3>Keine Gutscheine</h3><p>Gutscheine verkaufen Sie an der Kasse („Gutschein verkaufen“).</p></div>`;
}

/* ── Lieferanten ── */
registerPage('lieferanten', {title: 'Lieferanten', sub: () => `${SUPPLIERS.length} Lieferanten`, render: renderLieferanten});
async function renderLieferanten() {
  const v = $('#view-lieferanten');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('building', 'Lieferanten'); return; }
  if (!EK.loaded) { v.innerHTML = `<div class="cv">${loadingCard('Lade Lieferanten')}</div>`; await loadPurchasing(); }
  const cfs = cfDefs('lieferant').slice(0, 3);
  const openPos = id => EK.pos.filter(p => p.supplier_id === id && ['bestellt', 'teilgeliefert'].includes(p.status));
  v.innerHTML = `<div class="cv">${pageHead('Lieferanten', 'Kontakte, Lieferzeiten, Sortiment und offene Bestellungen', `<button class="btn btn-secondary" data-lf="po">${ic('truck', 'i-sm')}Neue Bestellung</button><button class="btn btn-primary" data-lf="neu">${ic('plus', 'i-sm')}Neuer Lieferant</button>`)}
    ${kpiCards([[num(SUPPLIERS.length), 'Lieferanten'], [num(EK.pos.filter(p => ['bestellt', 'teilgeliefert'].includes(p.status)).length), 'offene Bestellungen'], [eur0(EK.pos.filter(p => ['bestellt', 'teilgeliefert'].includes(p.status)).reduce((a, p) => a + p.value, 0) / 100), 'offener Bestellwert (EK)'], [num(ART.filter(a => !a.supplierId).length), 'Artikel ohne Lieferant', ART.some(a => !a.supplierId) ? 'warn' : '']])}
    <div class="card">${SUPPLIERS.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Lieferant</th><th>Kontakt</th><th>Kundennr.</th><th class="r">Lieferzeit</th><th class="r">Artikel</th><th class="r">offen</th>${cfs.map(d => `<th>${esc(d.label)}</th>`).join('')}</tr></thead><tbody>${SUPPLIERS.map(s => `<tr data-lfs="${esc(s.id)}" style="cursor:pointer"><td style="padding-left:16px"><b>${esc(s.name)}</b><div class="muted" style="font-size:11.5px">${esc(s.id)}</div></td><td>${esc(s.contact || '')}<div class="muted" style="font-size:12px">${esc([s.email, s.phone].filter(Boolean).join(' · '))}</div></td><td>${esc(s.customer_no || '–')}</td><td class="r num">${num(s.lead_days || 0)} T</td><td class="r num">${num(ART.filter(a => a.supplierId === s.id).length)}</td><td class="r num">${num(openPos(s.id).length)}</td>${cfs.map(d => `<td>${esc(cfShow(d, CF.sup[s.id]?.[d.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('building')}</div><h3>Noch keine Lieferanten</h3><p>Lieferanten im Artikel hinterlegen – dann funktionieren Bestellvorschlag und KI-Nachbestellung je Lieferant.</p></div>`}</div></div>`;
}

/* ── Wareneingang ── */
const WE = {log: []};
registerPage('wareneingang', {title: 'Wareneingang', sub: () => 'Lieferungen einbuchen', render: renderWareneingang});
async function renderWareneingang() {
  const v = $('#view-wareneingang');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('download', 'Wareneingang'); return; }
  await loadPurchasing();
  const open = EK.pos.filter(p => ['bestellt', 'teilgeliefert'].includes(p.status));
  navBadge('wareneingang', open.length);
  v.innerHTML = `<div class="cv">${pageHead('Wareneingang', 'Bestellte Ware einbuchen oder Zugang ohne Bestellung per Scan', `<button class="btn btn-secondary" data-we="etiketten">${ic('barcode', 'i-sm')}Etiketten drucken</button>`)}
    <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:16px;align-items:start">
      <div class="card"><div class="set-row"><div><div class="set-l">Offene Bestellungen</div><div class="set-h">${open.length ? `${open.length} Bestellungen warten auf Lieferung` : 'Keine offenen Bestellungen'}</div></div></div>
        ${open.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Bestellung</th><th>Lieferant</th><th>bestellt</th><th class="r">geliefert</th><th></th></tr></thead><tbody>${open.map(p => `<tr><td style="padding-left:16px"><b>${esc(p.no)}</b><div class="muted" style="font-size:11.5px">${eur(p.value / 100)} EK</div></td><td>${esc(p.supplier)}</td><td class="muted">${esc(p.ordered_at ? fmtTs(p.ordered_at) : '–')}</td><td class="r num">${num(p.received)} / ${num(p.qty)}</td><td class="r" style="padding-right:12px"><button class="btn btn-primary btn-sm" data-wepo="${p.id}">${ic('download', 'i-sm')}Einbuchen</button></td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:36px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><p>Alles geliefert.</p></div>`}</div>
      <div class="card"><div class="set-row"><div><div class="set-l">Zugang ohne Bestellung</div><div class="set-h">EAN scannen, Menge prüfen, Enter – bucht sofort</div></div></div>
        <div style="padding:14px 16px;display:grid;gap:10px"><input class="input" id="weEan" placeholder="EAN scannen oder eingeben" autocomplete="off"><div style="display:flex;gap:8px"><input class="input num" id="weQty" value="1" inputmode="numeric" style="width:90px"><input class="input" id="weReason" placeholder="Grund, z. B. Nachlieferung" style="flex:1"><button class="btn btn-primary" data-we="book">${ic('check', 'i-sm')}Buchen</button></div><div id="weHit" class="muted" style="font-size:12.5px;min-height:18px"></div></div>
        <div id="weLog">${weLogHTML()}</div></div></div></div>`;
  setTimeout(() => $('#weEan')?.focus(), 80);
}
const weLogHTML = () => WE.log.length ? `<table class="tbl" style="margin:0"><tbody>${WE.log.slice(0, 15).map(x => `<tr><td style="padding-left:16px"><b>${esc(x.name)}</b><div class="muted" style="font-size:11.5px">${esc(x.var)} · ${esc(x.ean)}</div></td><td class="r num" style="color:var(--pos)">+${x.qty}</td><td class="r num" style="padding-right:16px">→ ${x.after}</td></tr>`).join('')}</tbody></table>` : '';
const findEan = ean => { for (const a of ART) { const v = a.variants.find(x => x.ean === ean.trim()); if (v) return {a, v}; } return null; };
async function weBook() {
  const ean = $('#weEan').value.trim(), qty = parseInt($('#weQty').value, 10) || 0, hit = findEan(ean);
  if (!hit) { shakeEl($('#weEan')); $('#weHit').textContent = ean ? `EAN ${ean} unbekannt` : ''; return; }
  if (!(qty > 0)) return shakeEl($('#weQty'));
  try { await needPerm('bestand.buchen', 'Bestand buchen'); } catch { return; }
  try {
    const after = await invoke('stock_book', {variantId: hit.v.vid, value: qty, set: false, reason: `Wareneingang${$('#weReason').value.trim() ? ': ' + $('#weReason').value.trim() : ''}`, user: S.user.name});
    hit.v.q = after; finishArt(hit.a);
    WE.log.unshift({name: hit.a.name, var: `${colorName(hit.v.c)} · ${hit.v.s}`, ean, qty, after});
    Hooks.emit('inventory.booked', {sku: hit.a.id, variante: `${colorName(hit.v.c)} / ${hit.v.s}`, menge: qty, bestand: after, grund: 'Wareneingang'});
    $('#weLog').innerHTML = weLogHTML(); $('#weEan').value = ''; $('#weQty').value = '1'; $('#weHit').textContent = `${hit.a.name} · Bestand jetzt ${after}`; $('#weEan').focus();
  } catch (e) { toast('Nicht gebucht', {t2: String(e), type: 'warn'}); }
}
Hooks.on('purchasing.goods.received', () => S.view === 'wareneingang' && setTimeout(renderWareneingang, 400));

/* ── Etiketten ── */
const ET = {q: '', items: []};
registerPage('etiketten', {title: 'Etiketten', sub: () => 'Preis- und Barcode-Etiketten drucken', render: renderEtiketten});
function renderEtiketten() {
  const v = $('#view-etiketten');
  v.innerHTML = `<div class="cv">${pageHead('Etiketten', `Druck auf ${CFG['etikett.art'] === 'a4' || !CFG['etikett.art'] ? 'A4-Bögen' : 'dem Etikettendrucker (ZPL)'} · Einstellungen → Etiketten`, `<button class="btn btn-secondary" data-et="clear" ${ET.items.length ? '' : 'disabled'}>${ic('trash', 'i-sm')}Liste leeren</button><button class="btn btn-primary" data-et="print" ${ET.items.length ? '' : 'disabled'}>${ic('printer', 'i-sm')}${num(ET.items.reduce((a, x) => a + x.n, 0))} Etiketten drucken</button>`)}
    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start">
      <div class="card"><div style="padding:14px 16px"><input class="input" id="etQ" placeholder="Artikel suchen oder EAN scannen …" value="${esc(ET.q)}" autocomplete="off"></div><div id="etRes"></div></div>
      <div class="card"><div class="set-row"><div><div class="set-l">Druckliste</div><div class="set-h">Menge je Etikett anpassen</div></div></div><div id="etList"></div></div></div></div>`;
  renderEtRes(); renderEtList();
}
function renderEtRes() {
  const box = $('#etRes'); if (!box) return;
  const n = norm(ET.q), hits = n ? ART.filter(a => a.hay.includes(n) || a.variants.some(v => v.ean === ET.q.trim())).slice(0, 12) : ART.slice(0, 8);
  box.innerHTML = hits.map(a => `<div style="border-top:1px solid var(--line);padding:10px 16px"><div style="display:flex;align-items:center;gap:10px"><span class="thumb" style="--c:${COLORS[a.colors[0]]?.[1] || '#888'};width:34px;height:34px;border-radius:8px">${artVisual(a, COLORS[a.colors[0]]?.[1] || '#888')}</span><div style="flex:1;min-width:0"><b>${esc(a.name)}</b><div class="muted" style="font-size:12px">${esc(a.id)} · ${eur(a.sale || a.price)} · ${a.variants.length} Varianten</div></div><button class="btn btn-ghost btn-sm" data-etall="${esc(a.id)}">Alle</button><button class="btn btn-ghost btn-sm" data-etstock="${esc(a.id)}">= Bestand</button></div>
    <div class="reasons" style="margin-top:8px">${a.variants.map(v => `<button class="chip" data-etv="${esc(v.ean)}" style="height:28px;font-size:12px">${esc(colorName(v.c))} · ${esc(v.s)}</button>`).join('')}</div></div>`).join('') || '<div class="empty" style="padding:24px"><p>Kein Artikel gefunden.</p></div>';
}
function renderEtList() {
  const box = $('#etList'); if (!box) return;
  box.innerHTML = ET.items.length ? `<table class="tbl" style="margin:0"><tbody>${ET.items.map((x, i) => `<tr><td style="padding-left:16px"><b>${esc(x.a.name)}</b><div class="muted" style="font-size:11.5px">${esc(colorName(x.v.c))} · ${esc(x.v.s)} · ${esc(x.v.ean)}</div></td><td class="r"><input class="input num" data-etn="${i}" value="${x.n}" style="width:70px;height:30px;text-align:right"></td><td class="r" style="padding-right:12px"><button class="btn btn-ghost btn-sm btn-icon" data-etrm="${i}" aria-label="Entfernen">${ic('x', 'i-sm')}</button></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty" style="padding:36px"><div class="empty-icon">${ic('barcode')}</div><p>Links Varianten antippen – oder „Alle“ bzw. „= Bestand“ für ganze Artikel.</p></div>`;
  const pb = $('[data-et="print"]'); if (pb) { pb.disabled = !ET.items.length; pb.innerHTML = `${ic('printer', 'i-sm')}${num(ET.items.reduce((a, x) => a + x.n, 0))} Etiketten drucken`; }
  const cb = $('[data-et="clear"]'); if (cb) cb.disabled = !ET.items.length;
}
function etAdd(a, v, n = 1) { const ex = ET.items.find(x => x.v.ean === v.ean); if (ex) ex.n += n; else ET.items.push({a, v, n}); }

/* ── Buchhaltung ── */
const FB = {p: 'monat', von: '', bis: '', rows: []};
registerPage('buchhaltung', {title: 'Buchhaltung', sub: () => 'Buchungsjournal und DATEV-Export', render: renderBuchhaltung});
function fbRange() {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  const r = {monat: [new Date(y, m, 1), new Date(y, m + 1, 0)], vormonat: [new Date(y, m - 1, 1), new Date(y, m, 0)], quartal: [new Date(y, Math.floor(m / 3) * 3, 1), new Date(y, Math.floor(m / 3) * 3 + 3, 0)], jahr: [new Date(y, 0, 1), new Date(y, 11, 31)]}[FB.p];
  return r ? r.map(dIso) : [FB.von || today(), FB.bis || today()];
}
async function renderBuchhaltung() {
  const v = $('#view-buchhaltung');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('receipt', 'Buchhaltung'); return; }
  const [von, bis] = fbRange();
  v.innerHTML = `<div class="cv">${pageHead('Buchhaltung', `${new Date(von + 'T12:00').toLocaleDateString('de-AT')} – ${new Date(bis + 'T12:00').toLocaleDateString('de-AT')} · tagesweise verdichtet`, `<button class="btn btn-ghost" data-fb="konten">${ic('sliders', 'i-sm')}Konten</button><button class="btn btn-secondary" data-fb="journal">${ic('download', 'i-sm')}Buchungsjournal (CSV)</button><button class="btn btn-primary" data-fb="datev">${ic('download', 'i-sm')}DATEV-Export</button>`)}
    <div class="filters"><div class="seg" id="fbSeg">${[['monat', 'Monat'], ['vormonat', 'Vormonat'], ['quartal', 'Quartal'], ['jahr', 'Jahr'], ['frei', 'Zeitraum']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${FB.p === k}">${l}</button>`).join('')}</div>${FB.p === 'frei' ? `<input type="date" class="input" id="fbVon" value="${von}"> – <input type="date" class="input" id="fbBis" value="${bis}">` : ''}</div>
    <div id="fbBody">${loadingCard('Rechne Buchungen')}</div></div>`;
  initSeg($('#fbSeg', v), b => { FB.p = b.dataset.v; renderBuchhaltung(); });
  try { FB.rows = await invoke('fibu_preview', {von, bis}); } catch (e) { FB.rows = []; toast('Buchungen nicht verfügbar', {t2: String(e), type: 'warn'}); }
  const rows = FB.rows, acc = {};
  rows.forEach(r => { (acc[r.soll] ||= {s: 0, h: 0}).s += r.betrag; (acc[r.haben] ||= {s: 0, h: 0}).h += r.betrag; });
  const sum = rows.reduce((a, r) => a + r.betrag, 0), tax = rows.reduce((a, r) => a + (r.steuer || 0), 0);
  const accName = k => ({[CFG['fibu.kasse']]: 'Kasse', [CFG['fibu.transit']]: 'Geldtransit', [CFG['fibu.bank']]: 'Bank', [CFG['fibu.gutschein']]: 'Gutscheine', [CFG['fibu.erloes20']]: 'Erlöse 20 %', [CFG['fibu.erloes13']]: 'Erlöse 13 %', [CFG['fibu.erloes10']]: 'Erlöse 10 %', [CFG['fibu.erloes0']]: 'Erlöse 0 %'})[k] || '';
  $('#fbBody').innerHTML = kpiCards([[num(rows.length), 'Buchungszeilen'], [eur(sum / 100), 'Summe Buchungen'], [eur(tax / 100), 'davon Umsatzsteuer'], [num(new Set(rows.map(r => r.datum)).size), 'Buchungstage']])
    + `<div style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start"><div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Datum</th><th>Beleg</th><th>Soll</th><th>Haben</th><th class="r">Betrag</th><th class="r">USt</th><th>Buchungstext</th></tr></thead><tbody>${rows.slice(0, 500).map(r => `<tr><td style="padding-left:16px" class="num">${esc(new Date(r.datum + 'T12:00').toLocaleDateString('de-AT'))}</td><td class="mono" style="font-size:12px">${esc(r.beleg)}</td><td class="mono">${esc(r.soll)}</td><td class="mono">${esc(r.haben)}</td><td class="r num">${eur(r.betrag / 100)}</td><td class="r num">${r.ust ? r.ust + ' %' : '–'}</td><td style="font-size:12.5px">${esc(r.text)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:48px"><div class="empty-icon">${ic('receipt')}</div><p>Keine Buchungen im Zeitraum.</p></div>`}</div>
      <div class="card"><div class="set-row"><div><div class="set-l">Konten im Zeitraum</div></div></div><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Konto</th><th class="r">Soll</th><th class="r" style="padding-right:16px">Haben</th></tr></thead><tbody>${Object.entries(acc).sort().map(([k, x]) => `<tr><td style="padding-left:16px"><span class="mono">${esc(k)}</span> <span class="muted" style="font-size:12px">${esc(accName(k))}</span></td><td class="r num">${x.s ? eur(x.s / 100) : ''}</td><td class="r num" style="padding-right:16px">${x.h ? eur(x.h / 100) : ''}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="prompt-hint blk" style="margin-top:10px">${ic('info', 'i-xs')}DATEV-Format „Buchungsstapel“ (EXTF 700), Journal als CSV für BMD, RZL und Excel. Vor der ersten Übergabe Kontenrahmen mit der Steuerberatung abstimmen.</div>`;
}

/* ── KI-Analyse ── */
registerPage('ki', {title: 'KI-Analyse', sub: () => llmReady() ? `Statistik + Sprachmodell ${CFG['ki.modell']}` : 'Lokal berechnet aus Ihren Belegen', render: renderKi});
const sparkSVG = (xs, w = 120, h = 28) => { const m = Math.max(1, ...xs); const pts = xs.map((x, i) => `${(i / Math.max(1, xs.length - 1) * w).toFixed(1)},${(h - 2 - x / m * (h - 4)).toFixed(1)}`).join(' '); return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`; };
async function renderKi() {
  const v = $('#view-ki');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('sparkle', 'KI-Analyse'); return; }
  v.innerHTML = `<div class="cv">${pageHead('KI-Analyse', 'Prognosen, Nachbestellung und Auffälligkeiten – ohne Internet, aus Ihren eigenen Belegen', `<button class="btn btn-secondary" data-ki="ek">${ic('truck', 'i-sm')}Nachbestellvorschlag</button>`)}
    <div class="hero-card" style="margin-bottom:16px"><span class="reg-ic" style="color:var(--accent)">${ic('sparkle')}</span><form id="kiForm" style="flex:1;display:flex;gap:8px"><input class="input" id="kiQ" placeholder="Frage stellen, z. B. „Top-Artikel letzten Monat“" style="flex:1"><button class="btn btn-primary">Fragen</button></form></div>
    <div class="reasons" style="margin:-6px 0 14px">${['Was muss ich nachbestellen?', 'Umsatz diese Woche', 'Top-Artikel diesen Monat', 'Prognose nächste Wochen', 'Auffälligkeiten', 'Beste Kunden'].map(q => `<button class="chip" data-kiq="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div id="kiAns"></div>
    <div style="display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px;align-items:start">
      <div class="card"><div class="set-row"><div><div class="set-l">Absatzprognose · nächste 4 Wochen</div><div class="set-h">Holt-Verfahren auf Wochenabsätzen der letzten 12 Wochen</div></div></div><div id="kiFc">${loadingCard('Berechne Prognose')}</div></div>
      <div class="card"><div class="set-row"><div><div class="set-l">Hinweise</div><div class="set-h">Auffälligkeiten mit Handlungsvorschlag</div></div></div><div id="kiIns">${loadingCard('Werte aus')}</div></div></div></div>`;
  const [fc] = await Promise.all([invoke('ai_forecast').catch(() => []), loadInsights(true)]);
  if (!$('#kiFc')) return;
  $('#kiFc').innerHTML = fc.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Artikel</th><th>12 Wochen</th><th class="r">Erwartet</th><th class="r">Trend</th><th class="r">Bestand</th><th class="r" style="padding-right:16px">Reichweite</th></tr></thead><tbody>${fc.slice(0, 15).map(r => `<tr><td style="padding-left:16px"><b>${esc(r.name)}</b></td><td>${sparkSVG(r.weeks || [])}</td><td class="r num">${num(r.next4, 1)}</td><td class="r num" style="color:var(--${r.trend > 5 ? 'pos' : r.trend < -5 ? 'neg' : 'text-3'})">${pct(r.trend, 0)}</td><td class="r num">${num(r.stock)}</td><td class="r num" style="padding-right:16px;${r.cover_days < 14 ? 'color:var(--warn);font-weight:600' : ''}">${r.cover_days >= 9999 ? '–' : num(r.cover_days) + ' T'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:30px"><p>Für eine Prognose fehlen noch Verkäufe.</p></div>';
  const ins = (AI.ins || []);
  $('#kiIns').innerHTML = ins.length ? ins.map(x => `<div style="padding:12px 16px;border-top:1px solid var(--line)"><div style="display:flex;gap:8px;align-items:center;font-weight:600"><span style="color:var(--${x.tone})">${ic(x.icon, 'i-sm')}</span>${esc(x.title)}<span class="muted" style="margin-left:auto;font-weight:500;font-size:12px">${Math.round(x.confidence)} %</span></div><p style="margin:6px 0 8px;font-size:13px;color:var(--text-2)">${esc(x.text)}</p>${x.action ? `<button class="btn btn-secondary btn-sm" data-kiins="${esc(x.id)}">${esc(x.action.label)}</button>` : ''}</div>`).join('') : `<div class="empty" style="padding:30px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><p>Keine Auffälligkeiten.</p></div>`;
}
async function kiAsk(q) {
  const box = $('#kiAns'); if (!box || !q.trim()) return;
  $('#kiQ').value = q;
  box.innerHTML = `<div class="card" style="margin-bottom:16px">${loadingCard('Werte aus')}</div>`;
  let a; try { a = await realAnswer(q); } catch (e) { a = {title: 'Keine Antwort', text: String(e.message || e)}; }
  Hooks.emit('ai.query', {frage: q, modell: a.model || 'Kontor-Statistik (lokal)'});
  box.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="set-row"><div><div class="set-l">${ic('sparkle', 'i-xs')} ${esc(a.title)}</div><div class="set-h" style="white-space:pre-wrap">${esc(a.text)}</div></div>${a.act ? `<div class="set-c"><button class="btn btn-secondary btn-sm" id="kiAct">${esc(a.act.label)}</button></div>` : ''}</div>
    ${a.rows?.length ? `<table class="tbl" style="margin:0"><thead><tr>${a.cols.map((c, i) => `<th class="${a.num?.includes(i) ? 'r' : ''}" style="${i ? '' : 'padding-left:16px'}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${a.rows.map(r => `<tr>${r.map((c, i) => `<td class="${a.num?.includes(i) ? 'r num' : ''}" style="${i ? '' : 'padding-left:16px;font-weight:550'}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
    ${a.sql ? `<div class="prompt-hint blk" style="padding:0 16px 12px">${ic('code', 'i-xs')}${esc(a.sql)}</div>` : ''}</div>`;
  const b = $('#kiAct'); if (b) b.onclick = () => a.act.run();
}

/* ── Benutzer & Rechte ── */
registerPage('benutzer', {title: 'Benutzer & Rechte', sub: () => `${STAFF.length} Personen`, render: renderBenutzer});
async function renderBenutzer() {
  const v = $('#view-benutzer');
  v.innerHTML = `<div class="cv">${pageHead('Benutzer & Rechte', 'Personen, PINs, Zwei-Faktor-Anmeldung und was jede Rolle darf')}
    <div id="usrWarn"></div><div class="card" id="usrBox"></div>
    <div class="card" style="margin-top:12px"><div class="set-row"><div><div class="set-l">Anmeldemethoden</div><div class="set-h">PIN (4 Ziffern, gesalzen gespeichert, Sperre nach 5 Fehlversuchen) · zusätzlich Authenticator-App (2FA) je Person · Handy-App mit derselben PIN · Freigaben per PIN einer berechtigten Person</div></div></div></div></div>`;
  renderUsersBox();
  if (DESKTOP) invoke('users_default_pins').then(l => { if (l.length && $('#usrWarn')) $('#usrWarn').innerHTML = `<div class="rule-box" style="margin-bottom:12px;background:var(--warn-soft);border-color:transparent">${ic('alert')}<div><b style="color:var(--text)">Erst-PIN noch aktiv:</b> ${esc(l.join(' · '))} – bitte jetzt ändern („Bearbeiten“).</div></div>`; }).catch(() => {});
}

/* ── Protokoll ── */
const PR = {cat: '', q: '', rows: [], more: true};
const PR_CATS = [['', 'Alle'], ['pos.', 'Kasse'], ['auth.', 'Anmeldung'], ['inventory.', 'Bestand'], ['catalog.', 'Artikel'], ['customer.', 'Kunden'], ['cash.', 'Kassenbuch'], ['purchasing.', 'Einkauf'], ['config.', 'Einstellungen'], ['rksv.', 'RKSV'], ['backup.', 'Sicherung'], ['objekt.', 'Objekte'], ['rule.', 'Regeln']];
registerPage('protokoll', {title: 'Protokoll', sub: () => 'Lückenlose Aufzeichnung aller Aktionen', render: renderProtokoll});
async function renderProtokoll() {
  const v = $('#view-protokoll');
  v.innerHTML = `<div class="cv">${pageHead('Protokoll', 'Jede Kassenaktion, Anmeldung, Buchung und Einstellungsänderung – nur lesbar, nicht änderbar', `<button class="btn btn-secondary" data-pr="csv">${ic('download', 'i-sm')}CSV</button>`)}
    <div class="filters"><input class="input" id="prQ" placeholder="Suchen, z. B. Belegnummer, Benutzer, EAN …" value="${esc(PR.q)}" style="flex:1;min-width:240px;max-width:420px"><div class="reasons">${PR_CATS.map(([k, l]) => `<button class="chip" data-prc="${k}" aria-pressed="${PR.cat === k}">${l}</button>`).join('')}</div></div>
    <div class="card" id="prList">${loadingCard('Lade Protokoll')}</div></div>`;
  PR.rows = []; PR.more = true; await prLoad();
}
const prText = p => p && typeof p === 'object' ? Object.entries(p).filter(([, x]) => x != null && x !== '').map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ') : String(p ?? '');
async function prLoad() {
  let l = [];
  if (DESKTOP) { try { l = await invoke('audit_query', {q: PR.q || null, prefix: PR.cat || null, before: PR.rows.at(-1)?.id ?? null, limit: 200}); } catch (e) { toast('Protokoll nicht verfügbar', {t2: String(e), type: 'warn'}); } }
  else l = Hooks.log.filter(e => (!PR.cat || e.evt.startsWith(PR.cat)) && (!PR.q || norm(e.evt + JSON.stringify(e.payload)).includes(norm(PR.q)))).map((e, i) => ({id: i, ts: e.t.toISOString(), event: e.evt, payload: e.payload}));
  PR.rows.push(...l); PR.more = DESKTOP && l.length === 200;
  const box = $('#prList'); if (!box) return;
  box.innerHTML = PR.rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px;width:170px">Zeit</th><th style="width:230px">Ereignis</th><th>Details</th></tr></thead><tbody>${PR.rows.map(r => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(r.ts))}</td><td><span class="mono n ${evClass(r.event)}" style="font-size:12px">${esc(r.event)}</span></td><td style="font-size:12.5px;color:var(--text-2);overflow-wrap:anywhere">${esc(prText(r.payload)).slice(0, 400)}</td></tr>`).join('')}</tbody></table>${PR.more ? `<div style="padding:12px;text-align:center"><button class="btn btn-secondary btn-sm" data-pr="more">Weitere laden</button></div>` : ''}`
    : '<div class="empty" style="padding:40px"><p>Keine Einträge.</p></div>';
}

/* ── Hilfe & Info, Einrichtung ── */
registerPage('hilfe', {title: 'Hilfe & Info', sub: () => `Kontor ${S.appVersion}`, render: renderHilfe});
async function setupChecks() {
  let pins = [], pw = false;
  if (DESKTOP) { try { pins = await invoke('users_default_pins'); pw = await invoke('backup_password_status'); } catch { /* */ } }
  return [
    {id: 'firma', t: 'Firmendaten eintragen', d: 'Name, Adresse und UID erscheinen auf jedem Beleg', ok: CFG['firma.uid'] !== DEFAULTS['firma.uid'] || CFG['firma.name'] !== DEFAULTS['firma.name'], go: () => setGo('allgemein')},
    {id: 'pins', t: 'Erst-PINs ändern', d: pins.length ? `Noch aktiv: ${pins.join(', ')}` : 'Alle Personen haben eigene PINs', ok: !pins.length, go: () => go('benutzer')},
    {id: '2fa', t: 'Zwei-Faktor für Administratoren', d: 'Authenticator-App als zweiter Schutz', ok: STAFF.some(u => u.roleKey === 'admin' && SEC.totp.has(u.id)), go: () => go('benutzer')},
    {id: 'sortiment', t: 'Eigenes Sortiment', d: 'Artikel anlegen oder per CSV importieren', ok: ART.some(a => !RAW.some(r => r.id === a.id)), go: () => openImport('artikel')},
    {id: 'drucker', t: 'Bondrucker einrichten', d: `Netzwerk- oder ${SYS_PRN}, Kassenlade`, ok: CFG['drucker.art'] !== 'aus', go: () => setGo('drucker')},
    {id: 'sicherung', t: 'Datensicherung verschlüsseln', d: 'Tägliche Sicherung mit Passwort, möglichst auf NAS', ok: !!CFG['backup.auto'] && pw, go: () => setGo('sicherung')},
    {id: 'rksv', t: 'RKSV in Betrieb nehmen', d: 'Startbeleg erstellen (derzeit Testmodus)', ok: !!S.rksv?.active, go: () => setGo('rksv')},
    {id: 'mail', t: 'E-Mail-Versand', d: 'Belege und Bestellungen per E-Mail', ok: !!mailReady(), go: () => setGo('mail')},
  ];
}
function setGo(sec) { go('einstellungen'); setTimeout(() => $('#sec-' + sec)?.scrollIntoView({block: 'start'}), 160); }
async function renderHilfe() {
  const v = $('#view-hilfe'), checks = await setupChecks(), done = checks.filter(c => c.ok).length;
  v.innerHTML = `<div class="cv">${pageHead('Hilfe & Info', `Kontor ${esc(S.appVersion)} · ${DESKTOP ? 'Desktop-App' : 'Vorschau im Browser'} · Daten bleiben auf Ihrem Rechner`)}
    <div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;align-items:start">
      <div class="card"><div class="set-row"><div><div class="set-l">Einrichtung · ${done} von ${checks.length} erledigt</div><div class="set-h">Schritt für Schritt zum Echtbetrieb</div></div><div class="set-c" style="min-width:140px"><div class="meter" style="width:140px"><i style="width:${done / checks.length * 100}%"></i></div></div></div>
        <div class="check-list">${checks.map((c, i) => `<div class="check-row ${c.ok ? 'done' : ''}"><span class="ck">${ic(c.ok ? 'check' : 'clock', 'i-xs')}</span><div class="m"><div class="t1">${esc(c.t)}</div><div class="t2">${esc(c.d)}</div></div>${c.ok ? '' : `<button class="btn btn-secondary btn-sm" data-hc="${i}">Erledigen</button>`}</div>`).join('')}</div></div>
      <div style="display:grid;gap:16px">
        <div class="card"><div class="set-row"><div><div class="set-l">Schnellzugriff</div></div></div>
          ${[['import', 'upload', 'Artikel, Kunden oder Bestand importieren (CSV/Excel)'], ['handy', 'phone-pay', 'Handy als Scanner & Lager-App'], ['display', 'layout', 'Kundendisplay öffnen'], ['keys', 'keyboard', 'Tastenkürzel'], ['palette', 'command', 'Befehlspalette (Strg K)'], ['design', 'palette', 'Designsystem'], ['update', 'download', 'Nach Updates suchen']].map(([k, i, l]) => `<button class="pop-i" data-hq="${k}" style="width:100%;padding:10px 16px;border-top:1px solid var(--line);border-radius:0">${ic(i === 'upload' ? 'download' : i)}${esc(l)}</button>`).join('')}</div>
        <div class="card"><div class="set-row"><div><div class="set-l">Neu in ${esc(S.appVersion)}</div></div></div><ul style="margin:0;padding:10px 16px 14px 34px;font-size:13px;color:var(--text-2);line-height:1.7"><li>Helles, aufgeräumtes Design und neue Menüstruktur mit aufklappbaren Bereichen</li><li>Eigene Seiten: Belege, Kassenbuch, Gutscheine, Lieferanten, Wareneingang, Etiketten, Buchhaltung, KI-Analyse, Benutzer & Rechte, Protokoll</li><li>Import von Artikeln, Kunden und Beständen aus CSV/Excel</li><li>Kundendisplay auf zweitem Bildschirm</li><li>Handy-App für Lager und Inventur (im Browser, ohne App-Store)</li></ul></div>
        <div class="card"><div class="set-row" style="border-bottom:0"><div><div class="set-l">Ihre Daten</div><div class="set-h">Alles liegt lokal: Datenbank, Bilder, Sicherungen. Kein Cloud-Zwang, keine Weitergabe.${S.info ? `<br><span class="mono" style="font-size:11.5px">${esc(S.info.db_path)}</span>` : ''}</div></div>${S.info ? `<div class="set-c"><button class="btn btn-secondary btn-sm" data-hq="folder">${ic('boxes', 'i-sm')}Ordner</button></div>` : ''}</div></div>
      </div></div></div>`;
  v._checks = checks;
}

/* ── Startseiten-Hinweis „Einrichtung abschließen“ ── */
{
  const _rd = renderDashboard;
  renderDashboard = function (...a) {
    const r = _rd.apply(this, a);
    if (DESKTOP && !persist.get('setupHidden', false) && canApprove(S.user)) setupChecks().then(cs => {
      const open = cs.filter(c => !c.ok); const anchor = $('#askChips'); if (!open.length || !anchor || $('#setupBanner')) return;
      anchor.insertAdjacentHTML('afterend', `<div class="hero-card" id="setupBanner" style="margin:14px 0 4px"><span class="reg-ic" style="color:var(--accent)">${ic('check')}</span><div style="flex:1"><b>Einrichtung: ${cs.length - open.length} von ${cs.length} erledigt</b><div class="muted" style="font-size:12.5px">Als Nächstes: ${esc(open[0].t)} – ${esc(open[0].d)}</div></div><button class="btn btn-primary btn-sm" data-sb="go">Weiter</button><button class="btn btn-ghost btn-sm btn-icon" data-sb="x" aria-label="Ausblenden">${ic('x', 'i-sm')}</button></div>`);
      $('#setupBanner').onclick = e => { const b = e.target.closest('[data-sb]'); if (!b) return; if (b.dataset.sb === 'x') { persist.set('setupHidden', true); $('#setupBanner').remove(); } else go('hilfe'); };
    });
    return r;
  };
}

/* ── Datensicherung: eigener Menüpunkt, Inhalt in den Einstellungen ── */
{
  const _go0 = go;
  go = function (view) {
    if (view === 'datensicherung') {
      _go0('einstellungen');
      setTimeout(() => { $('#sec-sicherung')?.scrollIntoView({block: 'start'}); $$('.nav-item').forEach(n => n.dataset.view === 'datensicherung' ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current')); }, 160);
      return;
    }
    return _go0(view);
  };
}

function bindPages() {
  const on = (id, fn) => $('#view-' + id)?.addEventListener('click', fn);
  on('belege', e => { const b = e.target.closest('[data-bl]'); if (b) return blAction(b.dataset.bl); const r = e.target.closest('[data-bln]'); if (r) { BL.sel = r.dataset.bln; $$('#blList tr.sel').forEach(x => x.classList.remove('sel')); r.classList.add('sel'); renderBlView(); } });
  $('#view-belege').addEventListener('input', e => { if (e.target.id === 'blQ') { BL.q = e.target.value; renderBlList(); } });
  on('kassenbuch', e => { const b = e.target.closest('[data-kb]'); if (b) return ({move: openCashBook, x: xReport, z: openClosing})[b.dataset.kb](); const z = e.target.closest('[data-kbz]'); if (z) showClosing($('#kbBody')._z[+z.dataset.kbz]); });
  on('gutscheine', e => { if (e.target.closest('[data-gs="neu"]')) { go('kasse'); return setTimeout(openVoucherSale, 120); } const s = e.target.closest('[data-gssale]'); if (s) openSaleView(s.dataset.gssale); });
  $('#view-gutscheine').addEventListener('input', e => { if (e.target.id === 'gsQ') { GS.q = e.target.value; renderGsList(); } });
  on('lieferanten', e => { const b = e.target.closest('[data-lf]'); if (b) return b.dataset.lf === 'neu' ? openSupplier(null) : (go('einkauf'), setTimeout(() => openPO(null), 150)); const r = e.target.closest('[data-lfs]'); if (r) openSupplier(SUPPLIERS.find(s => s.id === r.dataset.lfs)); });
  on('wareneingang', async e => {
    const p = e.target.closest('[data-wepo]');
    if (p) { const head = EK.pos.find(x => x.id === +p.dataset.wepo); try { await needPerm('einkauf', 'Wareneingang'); const lines = await invoke('po_lines', {id: head.id}); openReceive(head, lines); } catch (err) { if (err?.message !== 'abgebrochen') toast('Nicht möglich', {t2: String(err), type: 'warn'}); } return; }
    const b = e.target.closest('[data-we]'); if (!b) return; if (b.dataset.we === 'book') return weBook(); if (b.dataset.we === 'etiketten') { ET.items = []; WE.log.forEach(x => { const h = findEan(x.ean); if (h) etAdd(h.a, h.v, x.qty); }); go('etiketten'); }
  });
  $('#view-wareneingang').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'weEan' || e.target.id === 'weQty')) { e.preventDefault(); if (e.target.id === 'weEan' && findEan(e.target.value)) { const h = findEan(e.target.value); $('#weHit').textContent = `${h.a.name} · ${colorName(h.v.c)} · ${h.v.s} · Bestand ${h.v.q}`; } weBook(); } });
  on('etiketten', e => {
    const t = e.target;
    const vb = t.closest('[data-etv]'); if (vb) { const h = findEan(vb.dataset.etv); if (h) { etAdd(h.a, h.v); renderEtList(); } return; }
    const al = t.closest('[data-etall]'); if (al) { const a = artById(al.dataset.etall); a.variants.forEach(v => etAdd(a, v)); return renderEtList(); }
    const as = t.closest('[data-etstock]'); if (as) { const a = artById(as.dataset.etstock); a.variants.filter(v => v.q > 0).forEach(v => etAdd(a, v, v.q)); return renderEtList(); }
    const rm = t.closest('[data-etrm]'); if (rm) { ET.items.splice(+rm.dataset.etrm, 1); return renderEtList(); }
    const b = t.closest('[data-et]'); if (b?.dataset.et === 'clear') { ET.items = []; return renderEtList(); } if (b?.dataset.et === 'print' && ET.items.length) openLabels(ET.items.map(x => ({...x})));
  });
  $('#view-etiketten').addEventListener('input', e => { if (e.target.id === 'etQ') { ET.q = e.target.value; renderEtRes(); } });
  $('#view-etiketten').addEventListener('change', e => { const i = e.target.dataset.etn; if (i != null) { ET.items[+i].n = Math.max(1, parseInt(e.target.value, 10) || 1); renderEtList(); } });
  $('#view-etiketten').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'etQ') { const h = findEan(e.target.value); if (h) { etAdd(h.a, h.v); e.target.value = ''; ET.q = ''; renderEtList(); renderEtRes(); } } });
  on('buchhaltung', async e => {
    const b = e.target.closest('[data-fb]'); if (!b) return; if (b.dataset.fb === 'konten') return setGo('buchhaltung');
    const [von, bis] = fbRange();
    try { const p = await invoke('fibu_export', {von, bis, format: b.dataset.fb}); if (p) toast(b.dataset.fb === 'datev' ? 'DATEV-Export gespeichert' : 'Buchungsjournal gespeichert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Export nicht möglich', {t2: String(err), type: 'warn'}); }
  });
  $('#view-buchhaltung').addEventListener('change', e => { if (e.target.id === 'fbVon' || e.target.id === 'fbBis') { FB[e.target.id === 'fbVon' ? 'von' : 'bis'] = e.target.value; renderBuchhaltung(); } });
  on('ki', e => { const q = e.target.closest('[data-kiq]'); if (q) return kiAsk(q.dataset.kiq); const i = e.target.closest('[data-kiins]'); if (i) { const x = INSIGHTS.find(y => y.id === i.dataset.kiins); if (x) insightAction(x); } if (e.target.closest('[data-ki="ek"]')) { EK.tab = 'ki'; go('einkauf'); } });
  $('#view-ki').addEventListener('submit', e => { if (e.target.id === 'kiForm') { e.preventDefault(); kiAsk($('#kiQ').value); } });
  on('benutzer', e => { const u = e.target.closest('[data-usr]'); if (u) return openUserEditor(u.dataset.usr ? STAFF.find(s => s.id === u.dataset.usr) : null); const tb = e.target.closest('[data-totp]'); if (tb) return openTotp(STAFF.find(s => s.id === tb.dataset.totp)); const pm = e.target.closest('[data-perm]'); if (pm) permToggle(pm); });
  on('protokoll', async e => {
    const c = e.target.closest('[data-prc]'); if (c) { PR.cat = c.dataset.prc; return renderProtokoll(); }
    const b = e.target.closest('[data-pr]'); if (!b) return;
    if (b.dataset.pr === 'more') return prLoad();
    const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = ['Zeit;Ereignis;Details', ...PR.rows.map(r => [fmtTs(r.ts), r.event, prText(r.payload)].map(q).join(';'))].join('\r\n');
    try { const p = await invoke('save_text', {name: `Kontor_Protokoll_${today()}.csv`, content: '﻿' + csv, title: 'Protokoll exportieren'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Export nicht möglich', {t2: String(err), type: 'warn'}); }
  });
  let prT; $('#view-protokoll').addEventListener('input', e => { if (e.target.id === 'prQ') { PR.q = e.target.value.trim(); clearTimeout(prT); prT = setTimeout(() => { PR.rows = []; prLoad(); }, 250); } });
  on('hilfe', e => {
    const c = e.target.closest('[data-hc]'); if (c) return $('#view-hilfe')._checks[+c.dataset.hc].go();
    const q = e.target.closest('[data-hq]'); if (!q) return;
    ({import: () => openImport(), handy: () => setGo('handy'), display: () => toggleDisplay(true), keys: openShortcuts, palette: () => openPalette(), design: () => go('designsystem'), update: openUpdate, folder: () => invoke('open_folder', {path: S.info.data_dir}).catch(() => {})})[q.dataset.hq]?.();
  });
  document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); });
}
