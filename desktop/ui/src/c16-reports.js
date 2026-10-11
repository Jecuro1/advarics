
/* ════════════════════════════════════════════════════════════════════
   26 · BERICHTE — Auswertungen aus der Datenbank, CSV-Export (Excel)
   ════════════════════════════════════════════════════════════════════ */
const RP = {p: 'monat', from: '', to: '', tab: 'tage', data: null, closings: [], vouchers: []};
const dIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function rpRange() {
  const now = new Date(), sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()), mon = addDays(sod, -((now.getDay() + 6) % 7));
  const r = {
    heute: [sod, addDays(sod, 1)], gestern: [addDays(sod, -1), sod], woche: [mon, addDays(mon, 7)], vorwoche: [addDays(mon, -7), mon],
    monat: [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)],
    vormonat: [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)],
    jahr: [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)],
  }[RP.p];
  if (r) return r;
  const f = RP.from ? new Date(RP.from + 'T00:00:00') : sod, t = RP.to ? addDays(new Date(RP.to + 'T00:00:00'), 1) : addDays(sod, 1);
  return [f, t];
}
const rpLabel = () => { const [f, t] = rpRange(); const e = addDays(t, -1); return dIso(f) === dIso(e) ? f.toLocaleDateString('de-AT') : `${f.toLocaleDateString('de-AT')} – ${e.toLocaleDateString('de-AT')}`; };

async function loadReport() {
  const [f, t] = rpRange();
  try {
    const [cur] = await invoke('stats', {ranges: [{from: isoL(f), to: isoL(t)}], detail: true});
    RP.data = cur;
    [RP.closings, RP.vouchers] = await Promise.all([invoke('closings_list'), invoke('voucher_list')]);
  } catch (e) { RP.data = null; toast('Bericht nicht verfügbar', {t2: String(e), type: 'warn'}); }
}
async function renderBerichte() {
  const v = $('#view-berichte');
  if (!DESKTOP) { v.innerHTML = `<div class="cv"><div class="card"><div class="empty" style="padding:64px 20px"><div class="empty-icon">${ic('chart')}</div><h3>Berichte nur in der Desktop-App</h3><p>Auswertungen lesen die Belege aus der lokalen Datenbank.</p></div></div></div>`; return; }
  v.innerHTML = `<div class="cv">
    <div class="cv-head"><div><h2 class="h-title">Berichte</h2><div class="dash-meta" style="margin-top:6px"><span id="rpLbl">${esc(rpLabel())}</span><span>·</span><span>Retouren und Stornos abgezogen</span></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-secondary" id="rpX">${ic('receipt', 'i-sm')}X-Bericht</button><button class="btn btn-secondary" id="rpZ">${ic('lock', 'i-sm')}Tagesabschluss</button></div></div>
    <div class="cv-tools"><div class="seg" id="rpSeg">${[['heute', 'Heute'], ['gestern', 'Gestern'], ['woche', 'Woche'], ['vorwoche', 'Vorwoche'], ['monat', 'Monat'], ['vormonat', 'Vormonat'], ['jahr', 'Jahr'], ['frei', 'Zeitraum']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${RP.p === k}">${l}</button>`).join('')}</div>
      <span id="rpFree" style="display:${RP.p === 'frei' ? 'inline-flex' : 'none'};gap:6px;align-items:center"><input type="date" class="input" id="rpFrom" value="${RP.from}" style="height:36px"> – <input type="date" class="input" id="rpTo" value="${RP.to}" style="height:36px"></span></div>
    <div id="rpBody"><div class="card" style="padding:24px"><span class="thinking"><b>Rechne …</b></span></div></div></div>`;
  initSeg($('#rpSeg', v), async b => { RP.p = b.dataset.v; $('#rpFree').style.display = RP.p === 'frei' ? 'inline-flex' : 'none'; $('#rpLbl').textContent = rpLabel(); await loadReport(); renderRpBody(); });
  await loadReport(); renderRpBody();
}
const TABS = [['tage', 'Tage'], ['gruppen', 'Warengruppen'], ['artikel', 'Artikel'], ['zahlung', 'Zahlungsarten'], ['steuer', 'Steuern'], ['kassier', 'Kassier:innen'], ['abschluesse', 'Tagesabschlüsse'], ['gutscheine', 'Gutscheine']];
function rpTable() {
  const d = RP.data, e = c => eur((c || 0) / 100);
  const T = (head, rows, foot) => ({head, rows, foot});
  switch (RP.tab) {
    case 'tage': return T(['Tag', 'Bons', 'Retouren', 'Umsatz'], d.days.map(x => [new Date(x.day + 'T12:00').toLocaleDateString('de-AT', {weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'}), x.sales, e(x.returns), e(x.revenue)]), ['Summe', d.sales, e(d.returns), e(d.revenue)]);
    case 'gruppen': return T(['Warengruppe', 'Anteil', 'Umsatz'], d.cats.map(c => [catName(c.cat), d.cats.reduce((s, x) => s + Math.max(0, x.rev), 0) ? `${num(c.rev / d.cats.reduce((s, x) => s + Math.max(0, x.rev), 0) * 100, 1)} %` : '–', e(c.rev)]));
    case 'artikel': return T(['Artikel', 'Nr.', 'Stück (netto)', 'Umsatz'], d.items.map(i => [i.name, i.sku, i.qty, e(i.rev)]));
    case 'zahlung': return T(['Zahlungsart', 'Betrag'], d.pay.map(p => [p.label || p.m, e(p.amount)]), ['Summe', e(d.pay.reduce((s, p) => s + p.amount, 0))]);
    case 'steuer': return T(['Steuersatz', 'Netto', 'Steuer', 'Brutto'], d.vat.map(v => [`${v.rate} %`, e(v.net), e(v.tax), e(v.gross)]), ['Summe', e(d.vat.reduce((s, v) => s + v.net, 0)), e(d.vat.reduce((s, v) => s + v.tax, 0)), e(d.vat.reduce((s, v) => s + v.gross, 0))]);
    case 'kassier': return T(['Kassier:in', 'Bons', 'Umsatz'], d.cashiers.map(c => [c.name || '–', c.sales, e(c.revenue)]));
    case 'abschluesse': return T(['Nr.', 'Zeitpunkt', 'Umsatz', 'Soll', 'Gezählt', 'Differenz', 'durch'], RP.closings.map(z => [z.no, fmtTs(z.ts), e(z.data?.revenue), e(z.expected), e(z.counted), e(z.diff), z.user || '']), null, true);
    case 'gutscheine': { const act = RP.vouchers.filter(x => x.status === 'aktiv'); return T(['Code', 'Status', 'Ausgegeben', 'Restwert', 'gültig bis', 'Beleg'], RP.vouchers.map(x => [x.code, x.status, e(x.initial), e(x.balance), x.valid_until || '', x.sale_no || '']), ['offen', `${act.length} aktiv`, '', e(act.reduce((s, x) => s + x.balance, 0)), '', '']); }
  }
}
function renderRpBody() {
  const b = $('#rpBody'); if (!b) return;
  const d = RP.data;
  if (!d) { b.innerHTML = '<div class="card"><div class="empty"><p>Keine Daten.</p></div></div>'; return; }
  const sales = d.rows.filter(r => r[2] === 'verkauf'), gross = sales.reduce((s, r) => s + r[1], 0);
  const tax = d.vat.reduce((s, v) => s + v.tax, 0);
  const t = rpTable();
  b.innerHTML = `<div class="kpis"><div class="card"><b>${eur(d.revenue / 100)}</b><span>Umsatz (brutto)</span></div><div class="card"><b class="num">${num(d.sales)}</b><span>Bons</span></div><div class="card"><b>${d.sales ? eur(gross / 100 / sales.length) : '–'}</b><span>Ø Bon</span></div>
      <div class="card"><b class="num">${num(d.sold)}</b><span>Artikel verkauft</span></div><div class="card"><b>${eur(d.returns / 100)}</b><span>Retouren & Stornos (${num(d.returned)} Stk.)</span></div><div class="card"><b>${eur(d.discounts / 100)}</b><span>Rabatte</span></div><div class="card"><b>${eur(tax / 100)}</b><span>enthaltene MwSt</span></div></div>
    <div class="cv-tools"><div class="reasons">${TABS.map(([k, l]) => `<button class="chip" data-rt="${k}" aria-pressed="${RP.tab === k}">${l}</button>`).join('')}</div><button class="btn btn-secondary btn-sm" id="rpCsv" style="margin-left:auto">${ic('download', 'i-sm')}CSV für Excel</button></div>
    <div class="card">${t.rows.length ? `<table class="tbl" style="margin:0"><thead><tr>${t.head.map((h, i) => `<th class="${i ? 'r' : ''}" style="${i ? '' : 'padding-left:16px'}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r, ri) => `<tr ${RP.tab === 'abschluesse' ? `data-z="${ri}" style="cursor:pointer"` : ''}>${r.map((c, i) => `<td class="${i ? 'r num' : ''}" style="${i ? '' : 'padding-left:16px;font-weight:550'}">${esc(c)}</td>`).join('')}</tr>`).join('')}
      ${t.foot ? `<tr style="font-weight:650">${t.foot.map((c, i) => `<td class="${i ? 'r num' : ''}" style="${i ? '' : 'padding-left:16px'}">${esc(c)}</td>`).join('')}</tr>` : ''}</tbody></table>`
      : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('chart')}</div><h3>Keine Daten im Zeitraum</h3><p>Zeitraum ändern oder erst verkaufen.</p></div>`}</div>`;
}
async function rpCsv() {
  const t = rpTable(), q = c => /[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c);
  const csv = [t.head, ...t.rows, ...(t.foot ? [t.foot] : [])].map(r => r.map(q).join(';')).join('\r\n');
  const [f, to] = rpRange();
  try { const p = await invoke('save_text', {name: `Kontor_${TABS.find(x => x[0] === RP.tab)[1].replace(/\W+/g, '')}_${dIso(f)}_${dIso(addDays(to, -1))}.csv`, content: csv, title: 'Bericht exportieren'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); }
  catch (e) { toast('Export fehlgeschlagen', {t2: String(e), type: 'warn'}); }
}
function showClosing(z) {
  const s = {...z.data, no: z.no, ts: z.ts, counted: z.counted, diff: z.diff, user: z.user};
  const el = openLayer(`<div class="modal" style="width:min(620px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Z-Bericht"><div id="zvBody" style="display:flex;flex-direction:column;min-height:0"></div></div>`);
  showZ(el, $('#zvBody', el), s, null, true);
}
function bindReports() {
  const v = $('#view-berichte');
  v.addEventListener('click', e => {
    const t = e.target.closest('[data-rt]'); if (t) { RP.tab = t.dataset.rt; return renderRpBody(); }
    if (e.target.closest('#rpCsv')) return rpCsv();
    if (e.target.closest('#rpX')) return xReport();
    if (e.target.closest('#rpZ')) return openClosing();
    const z = e.target.closest('[data-z]'); if (z) showClosing(RP.closings[+z.dataset.z]);
  });
  v.addEventListener('change', async e => { if (e.target.id === 'rpFrom' || e.target.id === 'rpTo') { RP.from = $('#rpFrom').value; RP.to = $('#rpTo').value; $('#rpLbl').textContent = rpLabel(); await loadReport(); renderRpBody(); } });
}
