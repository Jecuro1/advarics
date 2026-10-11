
/* ════════════════════════════════════════════════════════════════════
   19 · BELEGE, RETOUREN, STORNO
   Erstattungsbeträge rechnet die Datenbank aus dem Originalbeleg; die
   Oberfläche wählt nur Positionen und Stückzahlen. Jede Retoure ist ein
   eigener Beleg mit negativem Betrag und Verweis auf das Original.
   ════════════════════════════════════════════════════════════════════ */
const RETURN_REASONS = ['Größe passt nicht', 'Gefällt nicht', 'Defekt / Reklamation', 'Falscher Artikel', 'Kulanz'];
const kindLabel = s => ({retoure: 'Retoure', storno: 'Storno', startbeleg: 'Startbeleg', nullbeleg: 'Nullbeleg', monatsbeleg: 'Monatsbeleg'})[s.kind || s.data?.kind] || 'Bon';
const normBeleg = raw => {
  const s = String(raw).trim().replace(/\s/g, '');
  let m = /^(\d{4})-(\d{1,6})$/.exec(s); if (m) return `${m[1]}-${pad(+m[2], 6)}`;
  m = /^(\d{1,6})$/.exec(s); if (m) return `${YEAR}-${pad(+m[1], 6)}`;
  return s;
};
function applyStocks(stocks) { (stocks || []).forEach(({ean, stock}) => { for (const a of ART) { const v = a.variants.find(x => x.ean === ean); if (v) { v.q = stock; finishArt(a); } } }); }

/* ── Belegliste ── */
async function openReceipts(opts = {}) {
  let list = MEM.sales;
  const load = async () => { if (DESKTOP) list = await invoke('sales_list', {limit: 500}); };
  try { await load(); } catch (e) { return toast('Belege nicht verfügbar', {t2: String(e), type: 'warn'}); }
  let sel = 0, q = opts.q || '';
  const el = openLayer(`<div class="modal rcpts" role="dialog" aria-modal="true" aria-label="Belege"><div class="rcpts-l">
      <div class="m-head" style="padding-bottom:12px"><div class="m-ic">${ic('receipt')}</div><div><h2>Belege</h2><p id="rcSub"></p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div style="padding:0 22px 10px"><input class="input" id="rcQ" placeholder="Belegnummer, Artikel, Kunde oder Kassier:in …" autocomplete="off" value="${esc(q)}"></div>
      <div class="rcpts-list" id="rcList"></div></div>
    <div class="done-r"><div class="done-r-head" id="rcActs"></div><div class="done-r-body"><div id="rcView"></div></div></div></div>`, {focus: '#rcQ'});
  const filtered = () => { const n = norm(q); return list.filter(s => !n || norm(`${s.no} ${s.cashier || ''} ${kindLabel(s)} ${s.data?.customer?.name || ''} ${s.data?.ref || ''} ${(s.data?.lines || []).map(l => l.name).join(' ')}`).includes(n)); };
  const render = () => {
    const f = filtered(); sel = clamp(sel, 0, Math.max(0, f.length - 1));
    $('#rcSub', el).textContent = `${list.length} ${list.length === 1 ? 'Beleg' : 'Belege'} · ${DESKTOP ? 'gespeichert in der Datenbank' : 'nur diese Sitzung (Vorschau)'}`;
    $('#rcList', el).innerHTML = f.length ? f.map((s, i) => {
      const k = s.kind || 'verkauf';
      return `<button class="pal-i" style="height:58px" data-i="${i}" aria-selected="${i === sel}"><span class="reg-ic" style="width:32px;height:32px;${k !== 'verkauf' ? 'color:var(--neg)' : ''}">${ic(k !== 'verkauf' ? 'undo' : 'receipt', 'i-sm')}</span><span style="flex:1;min-width:0"><span style="display:block;color:var(--text);font-weight:550">${kindLabel(s)} ${esc(s.no)}${s.voided ? ' <span class="pill neg" style="height:18px">storniert</span>' : ''}${k !== 'verkauf' && s.ref_no ? ` <span class="muted" style="font-weight:400">zu ${esc(s.ref_no)}</span>` : ''}</span><span style="display:block;font-size:12px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(fmtTs(s.ts))} · ${(s.data?.lines || []).reduce((n, l) => n + l.qty, 0)} Artikel · ${esc((s.data?.parts || []).map(p => p.label).join(' + '))}${s.data?.customer ? ' · ' + esc(s.data.customer.name) : ''} · ${esc(s.cashier || '')}</span></span><span class="hint"><b style="color:${s.total < 0 ? 'var(--neg)' : 'var(--text)'};font-size:13.5px" class="num">${eur(s.total / 100)}</b></span></button>`;
    }).join('')
      : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('receipt')}</div><h3>${list.length ? 'Kein Treffer' : 'Noch keine Belege'}</h3><p>${list.length ? 'Suche anpassen.' : 'Abgeschlossene Verkäufe erscheinen hier.'}</p></div>`;
    const s = f[sel];
    const can = s && DESKTOP && (s.kind || 'verkauf') === 'verkauf' && !s.voided;
    $('#rcActs', el).innerHTML = `<span class="eyebrow">${s ? kindLabel(s) : 'Beleg'}</span><span style="margin-left:auto;display:flex;gap:6px">${can ? `<button class="btn btn-secondary btn-sm" id="rcRet">${ic('undo', 'i-sm')}Retoure</button><button class="btn btn-secondary btn-sm" id="rcVoid">${ic('x', 'i-sm')}Storno</button>` : ''}<button class="btn btn-secondary btn-sm" id="rcCopy" ${s ? '' : 'disabled'}>${ic('printer', 'i-sm')}Kopie</button>${DESKTOP && s ? `<button class="btn btn-secondary btn-sm" id="rcMore" aria-haspopup="menu">${ic('chevron-down', 'i-sm')}</button>` : ''}</span>`;
    $('#rcView', el).innerHTML = s ? `<div class="receipt-wrap">${receiptHTML(recFromData(s.no, {...s.data, kind: s.kind || s.data?.kind}), prefs.tpl || 'classic')}</div>` : '';
    $('[aria-selected="true"]', el)?.scrollIntoView({block: 'nearest'});
  };
  const after = async () => { try { await load(); } catch { /* Liste bleibt */ } if (document.contains(el)) render(); };
  $('#rcQ', el).addEventListener('input', e => { q = e.target.value; sel = 0; render(); });
  $('#rcQ', el).addEventListener('keydown', e => { if (e.key === 'ArrowDown') { sel++; render(); e.preventDefault(); } if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); } });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (b) { sel = +b.dataset.i; render(); }
    const s = filtered()[sel];
    if (e.target.closest('#rcCopy') && s) { Hooks.emit('pos.receipt.copy', {beleg: s.no}); if (DESKTOP) printReceipt(recFromData(s.no, {...s.data, kind: s.kind || s.data?.kind}), {copy: true}); else toast(`Belegkopie ${s.no}`, {t2: 'Als „KOPIE“ gekennzeichnet', icon: 'printer'}); }
    if (e.target.closest('#rcRet') && s) openReturn(s.no, {onDone: after});
    const mb = e.target.closest('#rcMore');
    if (mb && s) { const rec = recFromData(s.no, {...s.data, kind: s.kind || s.data?.kind}); const pe = openPopover(mb, `<button class="pop-i" data-x="mail">${ic('mail')}Per E-Mail senden</button>${(s.kind || 'verkauf') === 'verkauf' ? `<button class="pop-i" data-x="rechnung">${ic('receipt')}Rechnung A4</button><button class="pop-i" data-x="lieferschein">${ic('truck')}Lieferschein A4</button>` : ''}`, {width: 230}); pe && pe.addEventListener('click', ev => { const b = ev.target.closest('[data-x]'); if (!b) return; closePopover(); if (b.dataset.x === 'mail') mailReceipt(rec); else printInvoice(rec, b.dataset.x); }); }
    if (e.target.closest('#rcVoid') && s) openReturn(s.no, {storno: true, onDone: after});
  });
  render();
}
const openSaleView = no => openReceipts({q: no});

/* ── Retoure starten: Beleg suchen ── */
function openReturnStart() {
  if (!DESKTOP) return toast('Retouren nur in der Desktop-App', {t2: 'Erstattungen werden aus dem gespeicherten Originalbeleg gerechnet', type: 'warn', icon: 'undo'});
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Retoure"><div class="m-head"><div class="m-ic">${ic('undo')}</div><div><h2>Retoure / Umtausch</h2><p>Belegnummer eingeben oder vom Bon scannen</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body"><div class="amt-field"><label for="rtNo">Belegnummer</label><div class="amt-input" style="font-size:20px"><span>${ic('receipt', 'i-sm')}</span><input id="rtNo" placeholder="${YEAR}-004718 oder 4718" autocomplete="off"></div></div>
      <div class="eyebrow" style="margin:16px 0 6px">Letzte Verkäufe</div><div id="rtRecent" style="margin:0 -8px;max-height:260px;overflow:auto"><div class="muted" style="padding:8px">Lade …</div></div>
      <div class="prompt-hint">${ic('info', 'i-xs')}Umtausch = Retoure buchen, danach den neuen Artikel normal verkaufen.</div></div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="rtGo">Weiter<span class="kbd">↵</span></button></div></div>`, {focus: '#rtNo'});
  invoke('sales_list', {limit: 40}).then(list => {
    const box = $('#rtRecent', el); if (!box) return;
    const ok = list.filter(s => (s.kind || 'verkauf') === 'verkauf' && !s.voided).slice(0, 12);
    box.innerHTML = ok.length ? ok.map(s => `<button class="pal-i" style="height:50px" data-no="${esc(s.no)}"><span style="flex:1;min-width:0"><span style="display:block;color:var(--text);font-weight:550">Bon ${esc(s.no)}</span><span style="display:block;font-size:12px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(fmtTs(s.ts))} · ${esc((s.data?.lines || []).map(l => l.name).join(', '))}</span></span><b class="num">${eur(s.total / 100)}</b></button>`).join('')
      : '<div class="muted" style="padding:8px">Noch keine Verkäufe.</div>';
  }).catch(() => {});
  const go2 = no => { if (!no) return; closeLayer(el); setTimeout(() => openReturn(normBeleg(no)), 60); };
  el.addEventListener('click', e => { const b = e.target.closest('[data-no]'); if (b) go2(b.dataset.no); if (e.target.closest('#rtGo')) go2($('#rtNo', el).value); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'rtNo') { e.preventDefault(); go2(e.target.value); } });
}

/* ── Retoure / Storno ── */
async function openReturn(no, {storno = false, onDone} = {}) {
  if (!DESKTOP) return openReturnStart();
  let info;
  try { info = await invoke('sale_get', {no}); } catch (e) { return toast('Beleg nicht gefunden', {t2: String(e), type: 'warn', icon: 'receipt'}); }
  const sale = info.sale, d = sale.data || {};
  if ((sale.kind || 'verkauf') !== 'verkauf') return toast(`${kindLabel(sale)} ${sale.no} kann nicht retourniert werden`, {t2: 'Bitte den ursprünglichen Verkaufsbeleg verwenden', type: 'warn'});
  if (sale.voided) return toast(`Bon ${sale.no} ist bereits storniert`, {type: 'warn', icon: 'receipt'});
  const lines = d.lines || [];
  const open = lines.map((l, i) => l.qty - (info.returned[i] || 0));
  if (!open.some(n => n > 0)) return toast(`Bon ${sale.no} ist vollständig retourniert`, {type: 'warn', icon: 'undo'});
  if (storno && Object.keys(info.returned).length) { toast('Storno nicht mehr möglich', {t2: 'Zu diesem Bon gibt es bereits Retouren – restliche Positionen per Retoure', type: 'warn'}); storno = false; }
  const unitEff = lines.map((l, i) => info.effective[i] / Math.max(1, l.qty));
  const methods = [{m: 'bar', label: 'Bar'}];
  (d.parts || []).forEach(p => { if (p.m !== 'bar' && ['bankomat', 'kredit', 'apple', 'google'].includes(p.m) && !methods.some(x => x.m === p.m)) methods.push({m: p.m, label: p.label}); });
  methods.push({m: 'gutschein', label: 'Gutschein (neu)'});
  const st = {mode: storno ? 'storno' : 'retoure', qty: lines.map((l, i) => storno ? open[i] : (open.length === 1 || lines.length === 1 ? open[i] : 0)), reason: storno ? 'Fehlbon' : RETURN_REASONS[0], method: methods[methods.length > 2 && (d.parts || []).length === 1 && methods[1].m === d.parts[0].m ? 1 : 0], busy: false};
  const limit = +CFG['kasse.retoureGrenze'] || 100;
  const el = openLayer(`<div class="modal" style="width:min(720px,100%)" role="dialog" aria-modal="true" aria-label="Retoure"><div id="rtBody" style="display:flex;flex-direction:column;min-height:0;max-height:calc(100dvh - 48px)"></div></div>`, {closeOnScrim: false});
  const box = $('#rtBody', el);
  const refund = () => st.mode === 'storno' ? sale.total / 100 : r2(lines.reduce((s, l, i) => s + unitEff[i] * st.qty[i], 0) / 100);
  const render = () => {
    const sum = refund(), n = st.qty.reduce((a, b) => a + b, 0), needs = st.mode === 'storno' || sum > limit;
    box.innerHTML = `<div class="m-head"><div class="m-ic" style="color:${st.mode === 'storno' ? 'var(--neg)' : 'var(--accent)'}">${ic(st.mode === 'storno' ? 'x' : 'undo')}</div><div><h2>${st.mode === 'storno' ? 'Bon stornieren' : 'Retoure'} · Bon ${esc(sale.no)}</h2><p>${esc(fmtTs(sale.ts))} · ${eur(sale.total / 100)}${d.customer ? ' · ' + esc(d.customer.name) : ''}${info.refunded ? ` · bereits erstattet ${eur(info.refunded / 100)}` : ''}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:16px;overflow:auto">
        ${Object.keys(info.returned).length ? '' : `<div class="seg" id="rtSeg" style="justify-self:start"><button data-v="retoure" aria-pressed="${st.mode === 'retoure'}">Retoure (einzelne Positionen)</button><button data-v="storno" aria-pressed="${st.mode === 'storno'}">Storno (ganzer Bon)</button></div>`}
        <div class="card" style="overflow:hidden">${lines.map((l, i) => {
          const c = l.c ? COLORS[l.c]?.[1] || 'var(--text-3)' : 'var(--text-3)', done = info.returned[i] || 0;
          return `<div class="wl-row" style="padding:10px 14px;border-bottom:1px solid var(--line);${open[i] <= 0 ? 'opacity:.5' : ''}"><span class="thumb" style="--c:${c}">${l.service ? ic(l.icon || 'bag', 'i-sm') : glyph(l.glyph || 'shirt', c)}</span>
            <div class="wl-main"><div class="wl-t">${esc(l.name)}</div><div class="wl-s">${l.service ? esc(l.meta || 'Dienstleistung') : `${esc(COLORS[l.c]?.[0] || l.c || '')}${l.s && l.s !== 'Einheitsgröße' ? ' · ' + esc(l.s) : ''}`} · ${l.qty} verkauft${done ? ` · ${done} bereits retour` : ''} · ${eur(unitEff[i] / 100)}/Stk.</div></div>
            ${st.mode === 'storno' ? `<b class="num">${l.qty} ×</b>` : open[i] > 0 ? `<div class="qty"><button data-rq="${i}" data-d="-1" aria-label="weniger">${ic('minus', 'i-xs')}</button><span>${st.qty[i]}</span><button data-rq="${i}" data-d="1" aria-label="mehr">${ic('plus', 'i-xs')}</button></div>` : '<span class="pill" style="height:20px">retour</span>'}</div>`;
        }).join('')}</div>
        <div><div class="field"><span>Grund · erscheint auf dem Beleg und in der Auswertung</span></div><div class="reasons" style="margin-top:6px">${(st.mode === 'storno' ? ['Fehlbon', 'Falsche Zahlart', 'Kunde verzichtet', 'Test'] : RETURN_REASONS).map(r => `<button class="chip" data-r="${esc(r)}" aria-pressed="${r === st.reason}">${esc(r)}</button>`).join('')}</div></div>
        <div><div class="field"><span>Erstattung über</span></div><div class="reasons" style="margin-top:6px">${methods.map((m, i) => `<button class="chip" data-m="${i}" aria-pressed="${m === st.method}">${ic(m.m === 'bar' ? 'cash' : m.m === 'gutschein' ? 'gift' : 'card', 'i-xs')}${esc(m.label)}${['bar', 'gutschein'].includes(m.m) ? '' : ' (Rückbuchung)'}</button>`).join('')}</div></div>
        <div class="preview-box"><span>${st.mode === 'storno' ? 'Erstattung' : `${n} Artikel retour`}<br><span class="muted" style="font-size:12px">${st.method.m === 'bar' ? 'aus Lade 1 auszahlen' : st.method.m === 'gutschein' ? 'als neuer Gutschein (Code wird vergeben)' : 'auf das Zahlungsmittel zurückbuchen'}${d.customer ? ' · Punkte werden anteilig abgezogen' : ''}</span></span><b style="color:var(--neg)">− ${eur(sum)}</b></div>
        ${needs ? `<div class="rule-box">${ic('shield')}<div>${st.mode === 'storno' ? 'Stornos' : `Erstattungen über ${eur0(limit)}`} erfordern eine Freigabe durch die Filialleitung.</div></div>` : ''}
      </div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn ${st.mode === 'storno' ? 'btn-danger' : 'btn-primary'}" id="rtGo" ${sum > 0 && !st.busy ? '' : 'disabled'}>${needs ? ic('shield', 'i-sm') : ic('check', 'i-sm')}${st.mode === 'storno' ? 'Stornieren' : 'Retoure buchen'} · ${eur(sum)}</button></div>`;
    initSeg($('#rtSeg', box), b => { st.mode = b.dataset.v; st.qty = lines.map((l, i) => st.mode === 'storno' ? open[i] : 0); st.reason = st.mode === 'storno' ? 'Fehlbon' : RETURN_REASONS[0]; render(); });
  };
  const commit = async () => {
    const sum = refund(); if (!(sum > 0) || st.busy) return;
    let by = null;
    if (st.mode === 'storno' || sum > limit) {
      try { by = (await stepUp({title: 'Freigabe erforderlich', text: `${st.mode === 'storno' ? 'Storno' : 'Retoure'} Bon ${sale.no} · ${eur(sum)} (${st.reason})`, rule: st.mode === 'storno' ? 'Stornos immer mit Freigabe' : `Erstattung über ${eur0(limit)}`})).by.name; } catch { return; }
    }
    st.busy = true; render();
    let r;
    try {
      r = await invoke('return_commit', {no: sale.no, lines: st.qty.map((q, idx) => ({idx, qty: q})).filter(x => x.qty > 0), storno: st.mode === 'storno', reason: st.reason, method: st.method, cashier: S.user.name, approvedBy: by});
    } catch (e) { st.busy = false; render(); return toast('Retoure nicht möglich', {t2: String(e), type: 'warn', dur: 7000}); }
    applyStocks(r.stocks);
    const cust = d.customer && custById(d.customer.id); if (cust && r.points?.balance != null) cust.points = r.points.balance;
    if (cust) { cust.revenue = r2((cust.revenue || 0) + r.total / 100); if (st.mode === 'storno') cust.visits = Math.max(0, (cust.visits || 0) - 1); }
    POS.no = r.number + 1; if (S.view === 'kasse') { renderTopbar(); renderGrid(); }
    statsInvalidate();
    Hooks.emit(st.mode === 'storno' ? 'pos.sale.voided' : 'pos.return.completed', {beleg: r.no, zu: sale.no, betrag: r.total / 100, grund: st.reason, erstattung: st.method.m, freigabe: by});
    showReturnDone(el, box, r, sale);
    onDone && onDone(r);
  };
  box.addEventListener('click', e => {
    const q = e.target.closest('[data-rq]'); if (q) { const i = +q.dataset.rq; st.qty[i] = clamp(st.qty[i] + +q.dataset.d, 0, open[i]); return render(); }
    const r = e.target.closest('[data-r]'); if (r) { st.reason = r.dataset.r; return render(); }
    const m = e.target.closest('[data-m]'); if (m) { st.method = methods[+m.dataset.m]; return render(); }
    if (e.target.closest('#rtGo')) commit();
  });
  render();
}
function showReturnDone(el, box, r, sale) {
  const rec = recFromData(r.no, {...r.data, kind: r.data.kind});
  const cash = r.data.parts?.[0]?.m === 'bar';
  box.parentElement.className = 'modal pay-done'; box.parentElement.style.width = '';
  box.parentElement.innerHTML = `<div class="done-l">
    <div class="ok-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
    <div class="done-title">${r.data.kind === 'storno' ? 'Storniert' : 'Retoure gebucht'} · ${eur(-r.total / 100)}</div>
    <div class="done-sub">Beleg ${esc(r.no)} zu Bon ${esc(sale.no)} · ${esc(r.data.reason)} · Bestand zurückgebucht</div>
    <div class="change-big"><div class="l">${cash ? 'Bar auszahlen' : r.data.parts?.[0]?.code ? 'Neuer Gutschein' : `Rückbuchung ${esc(r.data.parts?.[0]?.label || '')}`}</div><div class="v">${eur(-r.total / 100)}</div></div>
    ${r.data.parts?.[0]?.code ? `<div class="note" style="margin-top:12px">${ic('gift')}<span>Gutschein-Code <b class="mono" style="color:var(--text)">${esc(r.data.parts[0].code)}</b></span></div>` : ''}
    ${r.points?.delta ? `<div class="note" style="margin-top:16px">${ic('star')}<span><b style="color:var(--text)">${num(r.points.delta)} Punkte</b> abgezogen · neuer Stand ${num(r.points.balance)}</span></div>` : ''}
    <div class="eyebrow" style="margin-top:26px">Beleg übergeben</div>
    <div class="rcpt-opts"><button class="btn btn-secondary" data-rp>${ic('printer')}Drucken</button></div>
    <div style="margin-top:auto;display:flex;gap:8px;padding-top:22px"><button class="btn btn-primary btn-lg" data-close style="flex:1">Fertig<span class="kbd">↵</span></button></div>
  </div>
  <div class="done-r"><div class="done-r-head"><span class="eyebrow">Beleg ${esc(r.no)}</span></div><div class="done-r-body"><div class="receipt-wrap">${receiptHTML(rec, prefs.tpl || 'classic')}</div></div></div>`;
  const pnl = el.querySelector('.pay-done');
  pnl.addEventListener('click', e => { if (e.target.closest('[data-rp]')) { printReceipt(rec); Hooks.emit('device.printer.receipt', {beleg: r.no}); } });
  if (CFG['drucker.auto']) printReceipt(rec, {quiet: true});
  if (cash) openDrawer('Erstattung bar', true);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('[data-rp]')) { e.preventDefault(); closeLayer(el); } });
  requestAnimationFrame(() => pnl.querySelector('[data-close]')?.focus());
}

/* Bon einer Retoure / eines Stornos */
function returnReceiptHTML(rec, tpl) {
  const dt = rec.date, d = `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  const money = v => num(v, 2);
  const lines = rec.lines.map(l => {
    const vtxt = l.service ? '' : `${COLORS[l.c]?.[0] || l.c || ''}${l.s && l.s !== 'Einheitsgröße' ? ' · ' + l.s : ''}`;
    return `<div class="r"><span>−${l.qty} × ${esc(l.name)}</span><span>−${money((l.refund || 0) / 100)}</span></div>${vtxt ? `<div class="sm">&nbsp;&nbsp;${esc(vtxt)}</div>` : ''}`;
  }).join('');
  return `<div class="receipt ${tpl}">${receiptHead(tpl)}<hr>
    <div class="c" style="font-weight:700;letter-spacing:.08em">${rec.kind === 'storno' ? 'STORNO' : 'RETOURE'}</div><div class="sm c">zu Bon ${esc(rec.ref || '')} · ${esc(rec.reason || '')}</div><hr>
    <div class="r"><span>Beleg ${rec.no}</span><span>Kasse ${esc(CFG['kasse.id'])}</span></div><div class="r sm"><span>${d}</span><span>${esc((rec.cashier || '').split(' ')[0])}</span></div><hr>
    ${lines}
    <hr><div class="r tot"><span>ERSTATTUNG EUR</span><span>${money(rec.t.total)}</span></div><hr>
    ${(rec.parts || []).map(p => `<div class="r"><span>${esc(p.label)}${p.m === 'bar' ? '' : ' (Rückbuchung)'}</span><span>${money(p.amount)}</span></div>`).join('')}<hr>
    <div class="r sm"><span>MwSt</span><span>Netto · Steuer · Brutto</span></div>
    ${(rec.t.vat || []).map(v => `<div class="r sm"><span>${v.rate} %</span><span>${money(v.net)} · ${money(v.tax)} · ${money(v.gross)}</span></div>`).join('')}
    ${rec.t.zero ? `<div class="r sm"><span>0 %</span><span>${money(rec.t.zero)} · 0,00 · ${money(rec.t.zero)}</span></div>` : ''}
    ${rec.customer ? `<hr><div class="sm c">Kunde ${esc(rec.customer.id)}${rec.points?.delta ? ` · ${rec.points.delta} Punkte` : ''}</div>` : ''}
    ${rksvBlockHTML(rec)}<div class="sm c" style="margin-top:6px">Unterschrift Kund:in: ____________________</div></div>`;
}
