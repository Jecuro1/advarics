
/* ════════════════════════════════════════════════════════════════════
   25 · EINKAUF — Lieferanten, Bestellungen, Wareneingang, Vorschläge
   ════════════════════════════════════════════════════════════════════ */
const SUPPLIERS = [];
const EK = {tab: 'bestellungen', pos: [], sug: [], loaded: false};
const PO_ST = {entwurf: ['Entwurf', ''], bestellt: ['Bestellt', 'info'], teilgeliefert: ['Teilgeliefert', 'warn'], geliefert: ['Geliefert', 'pos'], storniert: ['Storniert', 'neg']};
const SUPPLIERS_ALL = [];   // alle Lieferanten, auch inaktive (Namen alter Belege)
const supName = id => SUPPLIERS.find(s => s.id === id)?.name || SUPPLIERS_ALL.find(s => s.id === id)?.name || 'ohne Lieferant';
const varById = vid => { for (const a of ART) { const v = a.variants.find(x => x.vid === vid); if (v) return {a, v}; } return null; };
const colorName = c => COLORS[c]?.[0] || c;

async function loadSuppliers() {
  if (!DESKTOP) { lfPreviewSync(); return; }
  try { const [l, alle] = await Promise.all([invoke('suppliers_list'), invoke('suppliers_all')]); SUPPLIERS.length = 0; SUPPLIERS.push(...l); SUPPLIERS_ALL.length = 0; SUPPLIERS_ALL.push(...alle); } catch (e) { console.error(e); }
}
async function loadPurchasing() {
  if (!DESKTOP) return;
  try { [EK.pos, EK.sug] = await Promise.all([invoke('po_list'), invoke('po_suggest')]); await loadSuppliers(); EK.loaded = true; }
  catch (e) { toast('Einkauf nicht verfügbar', {t2: String(e), type: 'warn'}); }
}

async function renderEinkauf() {
  const v = $('#view-einkauf');
  if (!DESKTOP) { v.innerHTML = `<div class="cv"><div class="card"><div class="empty" style="padding:64px 20px"><div class="empty-icon">${ic('truck')}</div><h3>Einkauf nur in der Desktop-App</h3><p>Bestellungen und Wareneingang brauchen die lokale Datenbank.</p></div></div></div>`; return; }
  if (!EK.loaded) { v.innerHTML = '<div class="cv"><div class="card" style="padding:24px"><span class="thinking"><b>Lade Einkauf …</b></span></div></div>'; await loadPurchasing(); if (S.view !== 'einkauf') return; }
  const open = EK.pos.filter(p => ['bestellt', 'teilgeliefert'].includes(p.status)), drafts = EK.pos.filter(p => p.status === 'entwurf');
  v.innerHTML = `<div class="cv">
    <div class="cv-head"><div><h2 class="h-title">Einkauf</h2><div class="dash-meta" style="margin-top:6px"><span>Bestellungen, Wareneingang und Nachschub · lokale Datenbank</span></div></div>
      <button class="btn btn-primary" id="poNew">${ic('plus', 'i-sm')}Neue Bestellung</button></div>
    <div class="kpis"><div class="card"><b class="num">${num(open.length)}</b><span>offene Bestellungen</span></div><div class="card"><b>${eur0(open.reduce((s, p) => s + p.value, 0) / 100)}</b><span>offener Bestellwert (EK)</span></div>
      <div class="card"><b class="num">${num(drafts.length)}</b><span>Entwürfe</span></div><div class="card"><b class="num" style="color:${EK.sug.length ? 'var(--warn)' : 'inherit'}">${num(EK.sug.length)}</b><span>Varianten unter Mindestbestand</span></div><div class="card"><b class="num">${num(SUPPLIERS.length)}</b><span>Lieferanten</span></div></div>
    <div class="cv-tools"><div class="seg" id="ekSeg">${[['bestellungen', 'Bestellungen'], ['vorschlag', `Bestellvorschlag${EK.sug.length ? ` (${EK.sug.length})` : ''}`]].map(([k, l]) => `<button data-v="${k}" aria-pressed="${EK.tab === k}">${l}</button>`).join('')}</div></div>
    <div id="ekBody"></div></div>`;
  initSeg($('#ekSeg', v), b => { EK.tab = b.dataset.v; renderEkBody(); });
  renderEkBody();
}
function renderEkBody() {
  const b = $('#ekBody'); if (!b) return;
  if (EK.tab === 'bestellungen') {
    b.innerHTML = `<div class="card">${EK.pos.length ? `<table class="tbl art-tbl"><thead><tr><th style="padding-left:16px">Bestellung</th><th>Typ</th><th>Lieferant</th><th>Status</th><th class="r">Positionen</th><th class="r">Geliefert</th><th class="r">Wert (EK)</th><th>Datum</th><th></th></tr></thead><tbody>${EK.pos.map(p => `<tr data-po="${p.id}"><td style="padding-left:16px"><b>${esc(p.no)}</b>${p.note ? `<div class="muted" style="font-size:12px">${esc(p.note)}</div>` : ''}</td><td>${p.order_type ? `<span class="pill" style="height:20px">${esc(p.order_type)}</span>` : '<span class="muted">–</span>'}</td><td>${esc(p.supplier)}</td><td><span class="pill ${PO_ST[p.status]?.[1] || ''}" style="height:20px">${PO_ST[p.status]?.[0] || p.status}</span></td><td class="r num">${p.lines}</td><td class="r num">${num(p.received)} / ${num(p.qty)}</td><td class="r"><b>${eur(p.value / 100)}</b></td><td class="muted">${esc(fmtTs(p.ordered_at || p.created_at))}</td><td class="r" style="padding-right:14px;color:var(--text-3)">${ic('chevron-right', 'i-sm')}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('truck')}</div><h3>Noch keine Bestellungen</h3><p>Neue Bestellung anlegen oder aus dem Bestellvorschlag übernehmen.</p></div>`}</div>`;
  } else if (EK.tab === 'vorschlag') {
    const groups = {}; EK.sug.forEach(s => (groups[s.supplier_id || ''] ||= []).push(s));
    b.innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([sid, rows]) => `<div class="card" style="margin-bottom:12px" data-sg="${esc(sid)}">
      <div class="set-row"><div><div class="set-l">${esc(supName(sid))}</div><div class="set-h">${rows.length} Varianten · Vorschlag = Mindestbestand + Abverkauf der letzten 4 Wochen − Bestand − offene Bestellungen</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-sgo="${esc(sid)}" ${sid ? '' : 'disabled title="Lieferant im Artikel hinterlegen"'}>${ic('plus', 'i-sm')}Bestellung anlegen</button></div></div>
      <table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px;width:40px"></th><th>Artikel</th><th class="r">Bestand</th><th class="r">Min.</th><th class="r">offen bestellt</th><th class="r">verk. 4 Wo.</th><th class="r" style="padding-right:16px">Menge</th></tr></thead><tbody>${rows.map(r => `<tr><td style="padding-left:16px"><input type="checkbox" checked data-sv="${r.variant_id}"></td><td><b>${esc(r.name)}</b><div class="muted" style="font-size:12px">${esc(colorName(r.color))} · ${esc(r.size)}</div></td><td class="r num" style="color:${r.stock <= 0 ? 'var(--neg)' : 'inherit'}">${r.stock}</td><td class="r num">${r.min}</td><td class="r num">${r.open}</td><td class="r num">${r.sold28}</td><td class="r" style="padding-right:16px"><input class="input num" data-sq="${r.variant_id}" value="${r.qty}" inputmode="numeric" style="width:70px;height:32px;text-align:right"></td></tr>`).join('')}</tbody></table></div>`).join('')
      : `<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><h3>Kein Nachschub nötig</h3><p>Alle Varianten liegen über dem Mindestbestand (inkl. offener Bestellungen).</p></div></div>`;
  }
}

/* ── Bestellung ── */
async function openPO(id, preset) {
  await loadStamm();
  let head = id ? EK.pos.find(p => p.id === id) : null, lines = [];
  if (id) { try { lines = await invoke('po_lines', {id}); } catch (e) { return toast('Bestellung nicht verfügbar', {t2: String(e), type: 'warn'}); } }
  else if (preset) lines = preset.lines;
  const draft = !head || head.status === 'entwurf';
  const st = {supplier: head?.supplier_id || preset?.supplier || SUPPLIERS[0]?.id || '', note: head?.note || '', type: head?.order_type ?? preset?.type ?? (orderTypes()[0]?.name || ''), lines: lines.map(l => ({...l, costE: l.cost != null ? num(l.cost / 100, 2) : ''})), q: '', rabatt: '', rabattWeg: null};
  // Rabatt des Lieferanten (Stammdaten › Lieferanten › Rabatte): beim Entwurf der gewählte, sonst der festgehaltene der Bestellung
  const rabatteVon = sid => stRows('lieferantenrabatt').filter(r => r.lieferant === sid);
  if (head?.disc_name) { const r0 = rabatteVon(st.supplier).find(r => r.name === head.disc_name && Math.abs(r.pct - head.disc_pct) < 0.001); if (r0) st.rabatt = r0.id; else st.rabattWeg = {name: head.disc_name, pct: head.disc_pct}; }
  const el = openLayer(`<div class="drawer-panel" style="width:min(760px,100%)" role="dialog" aria-modal="true" aria-label="Bestellung"><div id="poBody" style="display:flex;flex-direction:column;min-height:0;flex:1"></div></div>`, {cls: 'drawer'});
  const box = $('#poBody', el);
  const total = () => st.lines.reduce((s, l) => s + (parseAmt(l.costE) || 0) * (parseInt(l.qty, 10) || 0), 0);
  const rabattObj = () => draft ? rabatteVon(st.supplier).find(r => r.id === st.rabatt) : head?.disc_name ? {name: head.disc_name, pct: head.disc_pct} : null;
  const rabattPct = () => +rabattObj()?.pct || 0;
  /** Bestellwert nach Rabatt (auf Cent gerundet wie im Programmkern) */
  const netto = () => Math.round(total() * 100 * (1 - rabattPct() / 100)) / 100;
  const sumHTML = () => rabattPct() > 0 ? `<span class="muted" style="font-size:12px;display:block">Zwischensumme ${eur(total())} · Rabatt ${esc(rabattObj().name)} ${num(rabattPct(), 2)} % = −${eur(total() - netto())}</span>` : '';
  const supObj = () => SUPPLIERS_ALL.find(x => x.id === st.supplier) || SUPPLIERS.find(x => x.id === st.supplier);
  /** Mindestauftragssumme/-menge des Lieferanten: Hinweis, solange die Bestellung darunter liegt (die Summe nur, wenn alle Positionen einen Preis haben) */
  const mindestHint = () => {
    const p = supObj()?.profile || {}, menge = st.lines.reduce((a, l) => a + (parseInt(l.qty, 10) || 0), 0), alle = st.lines.length && st.lines.every(l => isFinite(parseAmt(l.costE)));
    const w = []; if (p.min_menge > 0 && menge < p.min_menge) w.push(`Mindestmenge ${num(p.min_menge)} Stück – es fehlen ${num(p.min_menge - menge)}`);
    const cent = Math.round(total() * 100);
    if (p.min_summe > 0 && alle && cent < p.min_summe) w.push(`Mindestauftragssumme ${eur(p.min_summe / 100)} – es fehlen ${eur((p.min_summe - cent) / 100)}`);
    return w.length ? `<div class="prompt-hint blk" style="color:var(--warn)">${ic('alert', 'i-xs')}${esc(w.join(' · '))}</div>` : '';
  };
  const hits = () => { const toks = norm(st.q.trim()).split(/\s+/).filter(Boolean); if (!toks.length) return []; return ART.flatMap(a => a.variants.map(v => ({a, v}))).filter(({a, v}) => toks.every(t => a.hay.includes(t) || v.ean.startsWith(t) || norm(`${colorName(v.c)} ${v.s}`).includes(t))).slice(0, 8); };
  const render = () => {
    box.innerHTML = `<div class="m-head" style="padding-bottom:12px"><div class="m-ic">${ic('truck')}</div><div><h2>${head ? esc(head.no) : 'Neue Bestellung'}</h2><p>${head ? `${PO_ST[head.status][0]} · angelegt ${esc(fmtTs(head.created_at))}${head.user ? ' von ' + esc(head.user) : ''}` : 'Entwurf – wird erst mit „Bestellen“ verbindlich'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="drawer-body" style="display:grid;gap:14px;align-content:start">
        <div class="ed-grid"><label class="field"><span>Lieferant</span><select class="input select" id="poSup" ${draft ? '' : 'disabled'}>${(SUPPLIERS.some(x => x.id === st.supplier) ? SUPPLIERS : [...SUPPLIERS_ALL.filter(x => x.id === st.supplier), ...SUPPLIERS]).map(s => `<option value="${esc(s.id)}" ${s.id === st.supplier ? 'selected' : ''}>${esc(s.name)}${s.active === false ? ' (inaktiv)' : ''}</option>`).join('')}</select></label>
          ${draft ? `<label class="field"><span>Rabatt</span><select class="input select" id="poRab"><option value="">– kein Rabatt –</option>${rabatteVon(st.supplier).map(r => `<option value="${esc(r.id)}" ${r.id === st.rabatt ? 'selected' : ''}>${esc(r.name)} (${num(r.pct, 2)} %)</option>`).join('')}</select>${st.rabattWeg ? `<small class="ea-hint">Der frühere Rabatt „${esc(st.rabattWeg.name)}“ (${num(st.rabattWeg.pct, 2)} %) gibt es nicht mehr – bitte neu wählen.</small>` : ''}</label>` : head?.disc_name ? `<label class="field"><span>Rabatt</span><input class="input ea-ro" readonly tabindex="-1" value="${esc(head.disc_name)} (${num(head.disc_pct, 2)} %)"></label>` : ''}
          <label class="field"><span>Order-Typ</span><select class="input select" id="poType" ${draft ? '' : 'disabled'}><option value="">–</option>${orderTypes().map(t => `<option ${t.name === st.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
          <label class="field full"><span>Notiz</span><input class="input" id="poNote" value="${esc(st.note)}" ${draft ? '' : 'readonly'} placeholder="z. B. Saisonvororder"></label></div>
        ${lfHinweis(supObj())}
        ${draft ? `<div style="position:relative"><label class="search-field" style="height:42px">${ic('search')}<input id="poQ" placeholder="Artikel, Farbe, Größe oder EAN hinzufügen …" value="${esc(st.q)}" autocomplete="off"></label>
          ${st.q ? `<div class="card" style="position:absolute;left:0;right:0;top:46px;z-index:5;overflow:hidden;box-shadow:var(--shadow-3)">${hits().map(({a, v}) => `<button class="pal-i" style="height:46px;border-radius:0" data-addv="${v.vid}"><span style="flex:1;text-align:left"><b>${esc(a.name)}</b> <span class="muted">· ${esc(colorName(v.c))} · ${esc(v.s)} · Bestand ${v.q}</span></span><span class="muted">${a.cost != null ? eur(a.cost) : ''}</span></button>`).join('') || '<div class="muted" style="padding:12px">Kein Treffer</div>'}</div>` : ''}</div>` : ''}
        <div class="card" style="overflow:hidden">${st.lines.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:14px">Artikel</th><th class="r">Bestand</th><th class="r">${draft ? 'Menge' : 'geliefert / bestellt'}</th><th class="r">EK netto</th><th class="r" style="padding-right:14px">Summe</th>${draft ? '<th></th>' : ''}</tr></thead><tbody>${st.lines.map((l, i) => { const x = varById(l.variant_id); return `<tr><td style="padding-left:14px"><b>${esc(l.name || x?.a.name || '')}</b><div class="muted" style="font-size:12px">${esc(colorName(l.color || x?.v.c))} · ${esc(l.size || x?.v.s)}</div></td><td class="r num">${x ? x.v.q : l.stock ?? '–'}</td>
            <td class="r">${draft ? `<input class="input num" data-lq="${i}" value="${esc(l.qty)}" inputmode="numeric" style="width:70px;height:32px;text-align:right">` : `<span class="num" style="color:${l.received >= l.qty ? 'var(--pos)' : 'inherit'}">${l.received} / ${l.qty}</span>`}</td>
            <td class="r">${draft ? `<input class="input num" data-lc="${i}" value="${esc(l.costE)}" inputmode="decimal" placeholder="0,00" style="width:90px;height:32px;text-align:right">` : eur(parseAmt(l.costE) || 0)}</td>
            <td class="r num" style="padding-right:14px">${eur((parseAmt(l.costE) || 0) * (parseInt(l.qty, 10) || 0))}</td>${draft ? `<td><button class="btn btn-ghost btn-icon btn-sm" data-rml="${i}" aria-label="Entfernen">${ic('x', 'i-sm')}</button></td>` : ''}</tr>`; }).join('')}</tbody></table>`
          : '<div class="empty" style="padding:28px"><p>Noch keine Positionen – oben suchen und hinzufügen.</p></div>'}</div>
        <div class="preview-box"><span>Bestellwert (EK netto${rabattPct() > 0 ? ' nach Rabatt' : ''})<br><span class="muted" style="font-size:12px">${st.lines.reduce((s, l) => s + (parseInt(l.qty, 10) || 0), 0)} Stück</span><span id="poDisc">${sumHTML()}</span></span><b id="poTotal">${eur(netto())}</b></div>
        ${draft ? `<div id="poMin">${mindestHint()}</div>` : ''}
      </div>
      <div class="m-foot" style="border-top:1px solid var(--line);padding-top:14px">
        ${head && ['entwurf', 'bestellt'].includes(head.status) ? `<button class="btn btn-danger" id="poCancel">${ic('x', 'i-sm')}Stornieren</button>` : ''}
        ${st.lines.length ? `<button class="btn btn-ghost" id="poCsv">${ic('download', 'i-sm')}CSV</button><button class="btn btn-ghost" id="poPrint">${ic('printer', 'i-sm')}Drucken</button><button class="btn btn-ghost" id="poMail">${ic('mail', 'i-sm')}E-Mail</button>` : ''}<span class="sp"></span>
        ${draft ? `<button class="btn btn-secondary" id="poSave">${ic('check', 'i-sm')}Entwurf speichern</button><button class="btn btn-primary" id="poOrder">${ic('truck', 'i-sm')}Bestellen</button>`
          : ['bestellt', 'teilgeliefert'].includes(head.status) ? `<button class="btn btn-primary" id="poRecv">${ic('boxes', 'i-sm')}Wareneingang buchen</button>` : '<button class="btn btn-secondary" data-close>Schließen</button>'}</div>`;
    if (st.q) { const q = $('#poQ', box); q.focus(); q.setSelectionRange(st.q.length, st.q.length); }
  };
  const sync = () => { const s = $('#poSup', box), n = $('#poNote', box), t = $('#poType', box), r = $('#poRab', box); if (s) st.supplier = s.value; if (n) st.note = n.value; if (t) st.type = t.value; if (r) { st.rabatt = r.value; st.rabattWeg = null; } };
  const save = async () => {
    sync();
    if (!st.supplier) { toast('Lieferant wählen', {type: 'warn'}); return null; }
    const ls = st.lines.map(l => ({variant_id: l.variant_id, qty: parseInt(l.qty, 10) || 0, cost: l.costE !== '' && isFinite(parseAmt(l.costE)) ? Math.round(parseAmt(l.costE) * 100) : null})).filter(l => l.qty > 0);
    if (!ls.length) { toast('Mindestens eine Position mit Menge', {type: 'warn'}); return null; }
    try { const nid = await invoke('po_save', {id: head?.id ?? null, supplier: st.supplier, note: st.note, lines: ls, user: S.user.name, rabatt: st.rabatt || null}); await invoke('po_set_type', {id: nid, orderType: st.type || ''}); await loadPurchasing(); head = EK.pos.find(p => p.id === nid); return nid; }
    catch (e) { toast('Speichern fehlgeschlagen', {t2: String(e), type: 'warn'}); return null; }
  };
  box.addEventListener('input', e => {
    if (e.target.id === 'poNote') { st.note = e.target.value; return; } // sonst ginge die Notiz beim nächsten Neuzeichnen (Artikelsuche) verloren
    if (e.target.id === 'poQ') { st.q = e.target.value; render(); return; }
    const q = e.target.dataset.lq, c = e.target.dataset.lc;
    if (q != null) st.lines[q].qty = e.target.value.replace(/\D/g, '');
    if (c != null) st.lines[c].costE = e.target.value;
    if (q != null || c != null) { $('#poTotal', box).textContent = eur(netto()); $('#poDisc', box).innerHTML = sumHTML(); const mh = $('#poMin', box); if (mh) mh.innerHTML = mindestHint(); }
  });
  box.addEventListener('change', e => { if (e.target.id === 'poSup') { const alt = st.supplier; sync(); if (st.supplier !== alt) { st.rabatt = ''; st.rabattWeg = null; } render(); } else if (e.target.id === 'poRab') { sync(); render(); } });
  box.addEventListener('click', async e => {
    const add = e.target.closest('[data-addv]'); if (add) { sync(); const x = varById(+add.dataset.addv); const ex = st.lines.find(l => l.variant_id === x.v.vid); if (ex) ex.qty = String((parseInt(ex.qty, 10) || 0) + 1); else st.lines.push({variant_id: x.v.vid, name: x.a.name, color: x.v.c, size: x.v.s, qty: '1', costE: x.a.cost != null ? num(x.a.cost, 2) : ''}); st.q = ''; return render(); }
    const rm = e.target.closest('[data-rml]'); if (rm) { sync(); st.lines.splice(+rm.dataset.rml, 1); return render(); }
    if (e.target.closest('#poSave')) { if (await save()) { closeLayer(el); EK.tab = 'bestellungen'; toast('Entwurf gespeichert', {t2: head?.no, type: 'pos', icon: 'truck'}); renderEinkauf(); } return; }
    if (e.target.closest('#poOrder')) {
      const nid = await save(); if (!nid) return;
      try {
        try { await invoke('po_status', {id: nid, status: 'bestellt', user: S.user.name}); }
        catch (err) {
          const m = /^MINDEST\|(.*)$/.exec(String(err)); if (!m) throw err;
          if (!await confirmBox(`${m[1]}. Trotzdem bestellen?`, 'Trotzdem bestellen')) return;
          await invoke('po_status', {id: nid, status: 'bestellt', user: S.user.name, force: true});
        }
      } catch (err) { return toast('Nicht möglich', {t2: String(err), type: 'warn'}); }
      await loadPurchasing(); EK.tab = 'bestellungen'; closeLayer(el); toast('Bestellt', {t2: `${head.no} · ${supName(st.supplier)} · ${eur(netto())}`, type: 'pos', icon: 'truck'}); Hooks.emit('purchasing.order.placed', {bestellung: head.no}); renderEinkauf(); return;
    }
    if (e.target.closest('#poCancel')) {
      try { await stepUp({title: 'Bestellung stornieren', text: head.no}); await invoke('po_status', {id: head.id, status: 'storniert', user: S.user.name}); } catch (err) { if (String(err).includes('abgebrochen')) return; return toast('Nicht möglich', {t2: String(err), type: 'warn'}); }
      await loadPurchasing(); closeLayer(el); toast('Bestellung storniert', {t2: head.no, icon: 'x'}); renderEinkauf(); return;
    }
    if (e.target.closest('#poCsv')) {
      const rp = rabattPct(), nach = c => { const v = parseAmt(c); return isFinite(v) ? num(Math.round(v * 100 * (1 - rp / 100)) / 100, 2) : ''; };
      const csv = [`Artikel;Farbe;Größe;EAN;Menge;EK netto${rp > 0 ? ';Rabatt %;EK nach Rabatt' : ''}`].concat(st.lines.map(l => { const x = varById(l.variant_id); return [l.name || x?.a.name, colorName(l.color || x?.v.c), l.size || x?.v.s, l.ean || x?.v.ean, l.qty, l.costE, ...(rp > 0 ? [num(rp, 2), nach(l.costE)] : [])].join(';'); })).join('\r\n');
      try { const p = await invoke('save_text', {name: `${head?.no || 'Bestellung'}_${supName(st.supplier).replace(/\W+/g, '-')}.csv`, content: csv, title: 'Bestellung exportieren'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Export fehlgeschlagen', {t2: String(err), type: 'warn'}); }
      return;
    }
    if (e.target.closest('#poRecv')) { closeLayer(el); openReceive(head, st.lines); }
    if (e.target.closest('#poPrint')) { sync(); printHTML(poHTML({...(head || {no: 'Entwurf'}), note: st.note, ...(draft ? {disc_name: rabattObj()?.name || '', disc_pct: rabattPct()} : {})}, st.lines, lfSup(st.supplier)), `Bestellung ${head?.no || ''}`); }
    if (e.target.closest('#poMail')) { sync(); mailPO({...(head || {no: 'Entwurf'}), note: st.note, ...(draft ? {disc_name: rabattObj()?.name || '', disc_pct: rabattPct()} : {})}, st.lines, lfSup(st.supplier)); }
  });
  render();
}
function openReceive(head, lines) {
  const open = lines.map(l => Math.max(0, l.qty - l.received));
  const st = open.map(String);
  const el = openLayer(`<div class="modal" style="width:min(640px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Wareneingang">
    <div class="m-head"><div class="m-ic">${ic('boxes')}</div><div><h2>Wareneingang · ${esc(head.no)}</h2><p>${esc(head.supplier)} · gelieferte Menge je Position prüfen</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="overflow:auto"><table class="tbl" style="margin:0"><thead><tr><th>Artikel</th><th class="r">offen</th><th class="r">geliefert</th></tr></thead><tbody>${lines.map((l, i) => `<tr><td><b>${esc(l.name)}</b><div class="muted" style="font-size:12px">${esc(colorName(l.color))} · ${esc(l.size)} · EAN ${esc(l.ean)}</div></td><td class="r num">${open[i]}</td><td class="r"><input class="input num" data-rv="${i}" value="${st[i]}" inputmode="numeric" style="width:70px;height:32px;text-align:right" ${open[i] ? '' : 'disabled'}></td></tr>`).join('')}</tbody></table>
      <div class="prompt-hint">${ic('info', 'i-xs')}Bestand wird sofort gebucht (Grund „Wareneingang“, Beleg ${esc(head.no)}). Teillieferungen sind möglich.</div></div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="rvGo">${ic('check', 'i-sm')}Einbuchen</button></div></div>`);
  el.addEventListener('input', e => { const i = e.target.dataset.rv; if (i != null) st[i] = e.target.value.replace(/\D/g, ''); });
  $('#rvGo', el).onclick = async () => {
    const items = lines.map((l, i) => ({line_id: l.id, qty: parseInt(st[i], 10) || 0})).filter(x => x.qty > 0);
    if (!items.length) return toast('Keine Menge erfasst', {type: 'warn'});
    let r; try { r = await invoke('po_receive', {id: head.id, items, user: S.user.name}); } catch (e) { return toast('Wareneingang fehlgeschlagen', {t2: String(e), type: 'warn', dur: 7000}); }
    applyStocks(r); await loadPurchasing(); closeLayer(el);
    toast('Wareneingang gebucht', {t2: `${head.no} · ${items.reduce((s, x) => s + x.qty, 0)} Stück`, type: 'pos', icon: 'boxes', dur: 8000, action: {label: 'Etiketten', run: () => openLabels(items.map(x => { const l = lines.find(y => y.id === x.line_id), vv = varById(l.variant_id); return vv ? {a: vv.a, v: vv.v, n: x.qty} : null; }).filter(Boolean))}});
    Hooks.emit('purchasing.goods.received', {bestellung: head.no, stueck: items.reduce((s, x) => s + x.qty, 0)});
    if (S.view === 'einkauf') renderEinkauf();
  };
}
function bindPurchasing() {
  const v = $('#view-einkauf');
  v.addEventListener('click', async e => {
    if (e.target.closest('#poNew')) return openPO(null);
    const po = e.target.closest('[data-po]'); if (po) return openPO(+po.dataset.po);
    const sg = e.target.closest('[data-sgo]');
    if (sg) {
      const card = sg.closest('[data-sg]'), sid = sg.dataset.sgo;
      const lines = $$('[data-sv]', card).filter(c => c.checked).map(c => { const vid = +c.dataset.sv, r = EK.sug.find(s => s.variant_id === vid); return {variant_id: vid, name: r.name, color: r.color, size: r.size, qty: $(`[data-sq="${vid}"]`, card).value, cost: r.cost}; });
      if (!lines.length) return toast('Keine Position ausgewählt', {type: 'warn'});
      openPO(null, {supplier: sid, lines});
    }
  });
}
