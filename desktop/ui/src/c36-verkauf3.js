
/* ════════════════════════════════════════════════════════════════════
   46 · VERKAUF II — Gutscheine (PIN, Buchungen, Löschen, Protokolle,
   externe Gutscheine), Bon-Zuordnungs-Protokolle, Reservierung/Auswahl
   erstellen, Auswahl-Summen, Faktura (Angebote/Aufträge, Kunden-
   Bestellungen, Fremdrechnungen, Mahnwesen), Akkordeon-Einstellung.
   ════════════════════════════════════════════════════════════════════ */
Object.assign(DEFAULTS, {'gutschein.extern': ['Stadtgutschein', 'Verbundgutschein Sport 2000', 'Einkaufsgutschein Einkaufszentrum'], 'mahn.gebuehr': [0, 5, 10], 'mahn.tage': 14});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });
Object.assign(VIEW_PERM, {'gutscheine-loeschen': 'system', 'gutscheine-pin': 'kasse.kassenbuch', mahnwesen: 'faktura', fremdrechnungen: 'faktura', kundenbestellungen: 'faktura', 'angebote-auftraege': 'faktura'});
Object.assign(DST, {gelöscht: ['gelöscht', 'neg'], bestellt: ['bestellt', 'info'], eingetroffen: ['eingetroffen', 'accent']});

/* ── Gutschein mit PIN an der Kasse ── */
{
  const _vp = voucherPay;
  voucherPay = async function (m, rem) {
    const code = ($('#gsCode')?.value || '').trim().toUpperCase();
    if (DESKTOP && code && PAY.vcheck !== code) {
      let v; try { v = await invoke('voucher_get', {code}); } catch { return _vp(m, rem); }
      if (v.pin && PAY.vpinFor !== v.code) {
        const pin = await askText('Gutschein-PIN', `Gutschein ${v.code} ist mit einer PIN geschützt`, ''); if (!pin) return;
        try { await invoke('voucher_check_pin', {code: v.code, pin}); } catch (e) { return toast('PIN falsch', {t2: String(e), type: 'warn'}); }
        PAY.vpin = pin; PAY.vpinFor = v.code;
      }
    }
    return _vp(m, rem);
  };
  const _ap = addPart;
  addPart = function (m, amount, label, extra) { if (extra?.code && PAY.vpinFor === extra.code) extra = {...extra, pin: PAY.vpin}; return _ap(m, amount, label, extra); };
  const _rd = recData;
  recData = function (rec) { const d = _rd(rec); d.parts.forEach((p, i) => { if (rec.parts[i]?.pin) p.pin = rec.parts[i].pin; }); return d; };
}
/* ── Fremdgutschein als Zahlungsart ── */
if (!BASE_METHODS.some(m => m.id === 'fremdgs')) { const f = {id: 'fremdgs', label: 'Fremdgutschein', sub: 'Stadt-/Verbundgutschein', icon: 'gift', kind: 'qr'}; BASE_METHODS.splice(BASE_METHODS.findIndex(m => m.id === 'gutschein') + 1, 0, f); METHODS.splice(METHODS.findIndex(m => m.id === 'gutschein') + 1, 0, {...f}); }
{
  const _rq = runQR;
  runQR = async function (m, amount) {
    if (m.id !== 'fremdgs') return _rq(m, amount);
    const term = $('#term'), list = Array.isArray(CFG['gutschein.extern']) ? CFG['gutschein.extern'] : [];
    term.innerHTML = `<div class="dev">${ic('gift')}</div><h3>${esc(eur(amount))} · Fremdgutschein</h3><div style="display:grid;gap:8px;max-width:340px;margin:8px auto 0;text-align:left"><select class="input select" id="fgA">${list.map(x => `<option>${esc(x)}</option>`).join('')}</select><input class="input" id="fgNr" placeholder="Gutscheinnummer"><input class="input num" id="fgB" value="${num(amount, 2)}" placeholder="Betrag"></div><div style="display:flex;gap:8px;justify-content:center;margin-top:10px"><button class="btn btn-primary" id="fgOk">${ic('check', 'i-sm')}Gutschein annehmen</button></div>`;
    $('#fgOk').onclick = () => { const nr = $('#fgNr').value.trim(), b = Math.min(amount, parseAmt($('#fgB').value) || 0); if (!nr) return shakeEl($('#fgNr')); if (!(b > 0)) return shakeEl($('#fgB')); if (PAY) addPart(m, b, `${$('#fgA').value} ${nr}`, {ref: nr}); };
    setTimeout(() => $('#fgNr')?.focus(), 50);
  };
}

/* ── Gutschein-Seiten ── */
async function gsAll() { return invoke('voucher_list'); }
registerPage('gutscheine-pin', {title: 'Übersicht Gutscheine mit PIN', sub: () => 'geschützte Gutscheine', render: async () => {
  const v = $('#view-gutscheine-pin'); if (!DESKTOP) { v.innerHTML = desktopEmpty('lock', 'Gutscheine'); return; }
  const l = (await gsAll()).filter(g => g.pin);
  v.innerHTML = `<div class="cv">${pageHead('Übersicht Gutscheine mit PIN', 'Gutscheine mit PIN werden an der Kasse nur nach Eingabe der PIN eingelöst – Schutz bei Verlust (z. B. Firmen- und Onlinegutscheine)', `<button class="btn btn-primary" data-gp="neu">${ic('lock', 'i-sm')}PIN vergeben</button>`)}
    ${kpiCards([[num(l.length), 'Gutscheine mit PIN'], [eur0(l.filter(g => g.status === 'aktiv').reduce((s, g) => s + g.balance, 0) / 100), 'offener Wert']])}
    <div class="card">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Code</th><th>Status</th><th class="r">Wert</th><th class="r">Restwert</th><th>gültig bis</th><th></th></tr></thead><tbody>${l.map(g => `<tr><td style="padding-left:16px" class="mono"><b>${esc(g.code)}</b></td><td>${dPill(g.status)}</td><td class="r num">${cEur(g.initial)}</td><td class="r num">${cEur(g.balance)}</td><td>${g.valid_until ? esc(dDate(g.valid_until)) : '–'}</td><td class="r" style="padding-right:12px"><button class="btn btn-ghost btn-sm" data-gpx="${esc(g.code)}">PIN entfernen</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Noch keine Gutscheine mit PIN.</p></div>'}</div></div>`;
}});
registerPage('gutschein-buchungen', {title: 'Buchungen Gutscheine', sub: () => 'Ausgabe, Einlösung, Rücknahme', render: async () => {
  const v = $('#view-gutschein-buchungen'); if (!DESKTOP) { v.innerHTML = desktopEmpty('receipt', 'Buchungen'); return; }
  const l = await invoke('voucher_moves', {limit: 3000}), q = norm(GB.q);
  const f = l.filter(x => !q || norm(`${x.code} ${x.reason} ${x.ref || ''} ${x.user || ''}`).includes(q));
  v.innerHTML = `<div class="cv">${pageHead('Buchungen Gutscheine', 'Jede Bewegung: Ausgabe, Einlösung, Rücknahme, PIN, Löschung – mit Beleg und Benutzer')}
    ${kpiCards([[eur0(l.filter(x => x.delta > 0).reduce((s, x) => s + x.delta, 0) / 100), 'ausgegeben'], [eur0(-l.filter(x => x.reason === 'Einlösung').reduce((s, x) => s + x.delta, 0) / 100), 'eingelöst', 'pos'], [num(l.length), 'Buchungen']])}
    <div class="filters"><input class="input" id="gbQ" value="${esc(GB.q)}" placeholder="Code, Beleg, Benutzer …" style="max-width:320px"></div>
    <div class="card">${f.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Gutschein</th><th>Buchung</th><th>Beleg</th><th>Benutzer</th><th class="r">Betrag</th><th class="r" style="padding-right:16px">Rest</th></tr></thead><tbody>${f.slice(0, 800).map(x => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(x.ts))}</td><td class="mono"><b>${esc(x.code)}</b></td><td>${esc(x.reason)}</td><td class="mono muted">${esc(x.ref || '')}</td><td>${esc(x.user || '')}</td><td class="r num" style="color:var(--${x.delta >= 0 ? 'pos' : 'neg'})">${x.delta ? (x.delta > 0 ? '+' : '') + cEur(x.delta) : ''}</td><td class="r num" style="padding-right:16px">${cEur(x.balance)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Keine Buchungen.</p></div>'}</div></div>`;
  $('#gbQ', v).onchange = e => { GB.q = e.target.value; PAGES['gutschein-buchungen'].render(); };
}});
const GB = {q: ''}, GL = {code: '', v: null};
registerPage('gutscheine-loeschen', {title: 'Gutscheine Löschen', sub: () => 'sperren mit Grund', render: () => {
  const v = $('#view-gutscheine-loeschen'), g = GL.v;
  v.innerHTML = `<div class="cv">${pageHead('Gutscheine Löschen', 'Gutschein sperren (z. B. verloren gemeldet, Missbrauch, Kulanz-Ersatz) – Restwert verfällt, der Vorgang wird mit Grund protokolliert. Freigabe durch Administrator nötig.')}
    <div class="card" style="padding:16px;display:grid;gap:12px"><label class="search-field" style="height:50px">${ic('gift')}<input id="glCode" value="${esc(GL.code)}" placeholder="Gutscheincode scannen oder eingeben und Enter" autocomplete="off"></label>
      ${g ? `<div class="kpis" style="margin:0">${[[g.code, 'Code'], [dPill(g.status), 'Status'], [cEur(g.initial), 'Wert'], [cEur(g.balance), 'Restwert']].map(([a, b]) => `<div class="card"><b>${a}</b><span>${b}</span></div>`).join('')}</div>
        ${g.status === 'gelöscht' ? `<div class="prompt-hint blk">${ic('info', 'i-xs')}Bereits gelöscht: ${esc(g.note || '')}</div>` : `<label class="field"><span>Grund</span><select class="input select" id="glGrund">${['Verloren gemeldet (Ersatz ausgestellt)', 'Missbrauch / Betrugsverdacht', 'Fehlausgabe', 'Kulanz – ersetzt durch neuen Gutschein', 'Sonstiges'].map(x => `<option>${x}</option>`).join('')}</select></label><label class="field"><span>Notiz</span><input class="input" id="glNote" placeholder="z. B. Ersatzgutschein GS-…"></label><div style="display:flex;justify-content:flex-end"><button class="btn btn-danger" data-glgo>${ic('trash', 'i-sm')}Gutschein löschen</button></div>`}` : ''}</div></div>`;
  setTimeout(() => $('#glCode')?.focus(), 60);
}});
registerPage('gutscheine-geloescht', {title: 'Protokoll gelöschter Gutscheine', sub: () => 'mit Grund und Restwert', render: async () => {
  const v = $('#view-gutscheine-geloescht'); if (!DESKTOP) { v.innerHTML = desktopEmpty('history', 'Protokoll'); return; }
  const [l, moves] = await Promise.all([gsAll(), invoke('voucher_moves', {limit: 5000})]); const del = l.filter(g => ['gelöscht', 'storniert'].includes(g.status));
  v.innerHTML = `<div class="cv">${pageHead('Protokoll gelöschter Gutscheine', 'Gelöschte und zurückgenommene Gutscheine mit Grund, verfallenem Restwert, Zeitpunkt und Benutzer')}
    ${kpiCards([[num(del.length), 'gelöscht / storniert'], [eur0(-moves.filter(m => m.reason.startsWith('Löschung')).reduce((s, m) => s + m.delta, 0) / 100), 'verfallener Restwert', 'warn']])}
    <div class="card">${del.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Code</th><th>Status</th><th>Zeit</th><th>Grund</th><th>Benutzer</th><th class="r" style="padding-right:16px">Wert</th></tr></thead><tbody>${del.map(g => { const m = moves.find(x => x.code === g.code && (x.reason.startsWith('Löschung') || x.reason === 'Rücknahme')); return `<tr><td style="padding-left:16px" class="mono"><b>${esc(g.code)}</b></td><td>${dPill(g.status)}</td><td class="muted num">${m ? esc(fmtTs(m.ts)) : ''}</td><td>${esc(m?.reason.replace('Löschung: ', '') || g.note || '')}</td><td>${esc(m?.user || '')}</td><td class="r num" style="padding-right:16px">${cEur(g.initial)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Keine gelöschten Gutscheine.</p></div>'}</div></div>`;
}});
registerPage('gutschein-protokoll', {title: 'Protokoll Gutscheine', sub: () => 'alle Gutschein-Ereignisse', render: async () => {
  const v = $('#view-gutschein-protokoll'); if (!DESKTOP) { v.innerHTML = desktopEmpty('history', 'Protokoll'); return; }
  const l = (await invoke('audit_query', {q: 'gutschein', prefix: null, before: null, limit: 600})).filter(x => !x.event.startsWith('config.'));   // Einstellungs-Änderungen gehören nicht ins Gutschein-Protokoll
  v.innerHTML = `<div class="cv">${pageHead('Protokoll Gutscheine', 'Lückenloses Protokoll: Verkauf, Einlösung, PIN-Änderung, Löschung, Kampagnen-Gutscheine')}<div class="card">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Ereignis</th><th>Details</th></tr></thead><tbody>${l.map(x => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(x.ts))}</td><td class="mono">${esc(x.event)}</td><td class="muted" style="font-size:12.5px;overflow-wrap:anywhere">${esc(prText(x.payload))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Noch keine Einträge.</p></div>'}</div></div>`;
}});
registerPage('gutscheine-extern', {title: 'Buchungen externe Gutscheine', sub: () => 'Fremdgutscheine abrechnen', render: async () => {
  const v = $('#view-gutscheine-extern'); if (!DESKTOP) { v.innerHTML = desktopEmpty('gift', 'Fremdgutscheine'); return; }
  const sales = await invoke('sales_list', {limit: 5000});
  const rows = sales.flatMap(s => (s.data?.parts || []).filter(p => p.m === 'fremdgs').map(p => ({s, p, anb: (CFG['gutschein.extern'] || []).find(x => (p.label || '').startsWith(x)) || 'sonstige'})));
  const by = {}; rows.forEach(r => { (by[r.anb] ||= {n: 0, sum: 0}); by[r.anb].n++; by[r.anb].sum += r.p.amount; });
  v.innerHTML = `<div class="cv">${pageHead('Buchungen externe Gutscheine', 'An der Kasse angenommene Fremdgutscheine (z. B. Stadtgutschein) – zur Abrechnung mit dem Aussteller', `<button class="btn btn-secondary" data-gx="cfg">${ic('sliders', 'i-sm')}Aussteller</button><button class="btn btn-primary" data-gx="csv" ${rows.length ? '' : 'disabled'}>${ic('download', 'i-sm')}Abrechnung (CSV)</button>`)}
    <div class="ds-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:14px">${Object.entries(by).map(([k, x]) => `<div class="card" style="padding:14px"><div style="font-weight:650">${esc(k)}</div><div class="muted" style="font-size:12.5px">${x.n} Gutscheine</div><div style="font-size:20px;font-weight:650;margin-top:4px">${eur(x.sum)}</div></div>`).join('')}</div>
    <div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Beleg</th><th>Zeit</th><th>Aussteller · Nummer</th><th>Kassier:in</th><th class="r" style="padding-right:16px">Betrag</th></tr></thead><tbody>${rows.map(r => `<tr><td style="padding-left:16px" class="mono">${esc(r.s.no)}</td><td class="muted num">${esc(fmtTs(r.s.ts))}</td><td>${esc(r.p.label)}</td><td>${esc(r.s.cashier || '')}</td><td class="r num" style="padding-right:16px;font-weight:600">${eur(r.p.amount)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:44px"><div class="empty-icon">${ic('gift')}</div><p>Noch keine Fremdgutscheine – an der Kasse Zahlungsart „Fremdgutschein“ wählen.</p></div>`}</div></div>`;
  v._rows = rows;
}});

/* ── Bon-Zuordnung: Protokolle ── */
for (const [id, key, title] of [['bon-verkaeufer-protokoll', 'verkaeufer', 'Protokoll Verkäufer-Bon-Zuordnung'], ['bon-kunden-protokoll', 'kunde', 'Protokoll Bon-Zuordnung']]) {
  registerPage(id, {title, sub: () => 'nachträgliche Zuordnungen', render: async () => {
    const v = $('#view-' + id); if (!DESKTOP) { v.innerHTML = desktopEmpty('history', 'Protokoll'); return; }
    const l = (await invoke('audit_query', {q: null, prefix: 'pos.sale.assigned', before: null, limit: 1000})).filter(x => x.payload?.aenderung?.[key]);
    v.innerHTML = `<div class="cv">${pageHead(title, 'Wer hat wann welchen Bon nachträglich zugeordnet')}<div class="card">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Beleg</th><th>Benutzer</th><th>${key === 'kunde' ? 'Kunde' : 'vorher → neu'}</th>${key === 'kunde' ? '<th class="r" style="padding-right:16px">Punkte</th>' : ''}</tr></thead><tbody>${l.map(x => { const a = x.payload.aenderung; return `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(x.ts))}</td><td class="mono">${esc(x.payload.beleg)}</td><td>${esc(x.payload.benutzer || '')}</td><td>${key === 'kunde' ? esc(custById(a.kunde)?.name || a.kunde) : `${esc(a.verkaeufer.vorher || 'Kassier:in')} → <b>${esc(a.verkaeufer.neu || 'Kassier:in')}</b>`}</td>${key === 'kunde' ? `<td class="r num" style="padding-right:16px">+${a.punkte?.gutgeschrieben || 0}</td>` : ''}</tr>`; }).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Noch keine Zuordnungen.</p></div>'}</div></div>`;
  }});
}

/* ── Reservierung / Auswahl erstellen, Auswahl-Summen ── */
for (const [id, kind, title, txt] of [['reservierung-neu', 'reservierung', 'Reservierung erstellen', 'Ware für eine Kundin / einen Kunden zurücklegen'], ['auswahl-neu', 'auswahl', 'Neue Auswahl', 'Ware zur Ansicht mitgeben']]) {
  registerPage(id, {title, sub: () => txt, render: () => {
    $('#view-' + id).innerHTML = `<div class="cv">${pageHead(title, txt)}<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic(DK[kind].ic)}</div><h3>${esc(title)}</h3><p>${esc(DK[kind].sub)}</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-primary" data-dnew="${kind}">${ic('plus', 'i-sm')}${esc(title)}</button><button class="btn btn-secondary" data-goto="${DK[kind].page}">Zur Liste</button></div></div></div></div>`;
    if (DESKTOP) setTimeout(() => S.view === id && !$$('.layer [data-dbox]').length && openDoc(kind, null), 150);
  }});
}
registerPage('auswahl-summen', {title: 'Auswahl-Summen pro Kunde', sub: () => 'Ware außer Haus je Kunde', render: async () => {
  const v = $('#view-auswahl-summen'); if (!DESKTOP) { v.innerHTML = desktopEmpty('users', 'Auswahl-Summen'); return; }
  const l = await docLoad('auswahl'), by = {};
  l.filter(d => d.status !== 'storniert').forEach(d => { const k = d.partner_name || '–'; (by[k] ||= {n: 0, offen: 0, wert: 0, gekauft: 0, zurueck: 0, ueber: 0}); const x = by[k]; x.n++; (d.data.lines || []).forEach(li => { const o = (+li.qty || 0) - (li.zurueck || 0) - (li.gekauft || 0); if (d.status === 'ausgegeben') { x.offen += o; x.wert += o * (li.price || 0); } x.gekauft += li.gekauft || 0; x.zurueck += li.zurueck || 0; }); if (d.status === 'ausgegeben' && d.due < today()) x.ueber++; });
  v.innerHTML = `<div class="cv">${pageHead('Auswahl-Summen pro Kunde', 'Wie viel Ware ist bei wem – und wie oft wird aus Auswahlen gekauft')}<div class="card">${Object.keys(by).length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Kunde</th><th class="r">Auswahlen</th><th class="r">Teile offen</th><th class="r">Wert offen</th><th class="r">gekauft</th><th class="r">zurück</th><th class="r">Kaufquote</th><th class="r" style="padding-right:16px">überfällig</th></tr></thead><tbody>${Object.entries(by).sort((a, b) => b[1].wert - a[1].wert).map(([k, x]) => `<tr><td style="padding-left:16px"><b>${esc(k)}</b></td><td class="r num">${x.n}</td><td class="r num">${x.offen}</td><td class="r num" style="font-weight:600">${cEur(x.wert)}</td><td class="r num">${x.gekauft}</td><td class="r num">${x.zurueck}</td><td class="r num">${x.gekauft + x.zurueck ? Math.round(x.gekauft / (x.gekauft + x.zurueck) * 100) + ' %' : '–'}</td><td class="r num" style="padding-right:16px;color:${x.ueber ? 'var(--neg)' : 'inherit'}">${x.ueber || ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Noch keine Auswahlen.</p></div>'}</div></div>`;
}});

/* ── Faktura ── */
docPage('angebote-auftraege', ['angebot', 'auftrag'], {title: 'Angebote/Aufträge', subShort: 'Angebote und Aufträge', newLabel: 'Neues Angebot', tabs: [['offen', 'Offen', s => s === 'offen'], ['alle', 'Alle', () => true]], actions: `<button class="btn btn-secondary" data-dnew="auftrag">${ic('plus', 'i-sm')}Neuer Auftrag</button>`});
DK.kundenbestellung = {t: 'Kunden-Bestellungen', one: 'Kunden-Bestellung', ic: 'list', page: 'kundenbestellungen', perm: 'faktura', partner: 'kunde', price: 'vk', lines: true, free: true, print: 'Bestellbestätigung',
  sub: 'Sonderbestellungen für Kund:innen (nicht lagernd, andere Größe/Farbe) – beim Lieferanten bestellen, bei Eintreffen informieren, an der Kasse abholen',
  head: [{k: 'due', l: 'voraussichtlich da', t: 'date'}, {k: 'data.anzahlung', l: 'Anzahlung €', t: 'money'}, {k: 'data.lieferant', l: 'Lieferant', t: 'supplier'}, {k: 'data.kontakt', l: 'Telefon / E-Mail'}, {k: 'data.text', l: 'Wunsch / Notiz', t: 'area', full: true}],
  acts: {offen: [['bestellt', 'Als bestellt markieren'], ['eingetroffen', 'Eingetroffen', 'primary'], ['stornieren', 'Stornieren', 'danger']], bestellt: [['eingetroffen', 'Eingetroffen', 'primary'], ['stornieren', 'Stornieren', 'danger']], eingetroffen: [['abholen', 'Abholung an Kasse', 'primary']]}};
DOC_EDIT.kundenbestellung = ['offen'];
docPage('kundenbestellungen', 'kundenbestellung', {tabs: [['offen', 'Offen', s => ['offen', 'bestellt', 'eingetroffen'].includes(s)], ['da', 'Eingetroffen', s => s === 'eingetroffen'], ['alle', 'Alle', () => true]], newLabel: 'Neue Kunden-Bestellung',
  cols: [{l: 'voraussichtlich', f: d => esc(dDate(d.due))}, {l: 'Anzahlung', r: true, f: d => d.data.anzahlung ? cEur(d.data.anzahlung) : ''}]});
DOC_BTNS.kundenbestellung = st => st.id && st.status === 'offen' ? `<button class="btn btn-ghost" data-kbpo>${ic('truck', 'i-sm')}Beim Lieferanten bestellen</button>` : '';
DOC_CLICK.kundenbestellung = async (e, st, h) => {
  if (!e.target.closest('[data-kbpo]')) return;
  const lines = (st.data.lines || []).filter(l => l.ean).map(l => { const x = findEan(l.ean); return x ? {variant_id: x.v.vid, name: x.a.name, color: x.v.c, size: x.v.s, qty: String(l.qty), cost: x.a.cost != null ? Math.round(x.a.cost * 100) : null} : null; }).filter(Boolean);
  if (!lines.length) return toast('Keine Artikel mit EAN', {t2: 'Freie Positionen bitte direkt beim Lieferanten bestellen', type: 'warn'});
  await loadSuppliers(); await invoke('doc_action', {id: st.id, action: 'bestellt', payload: {}, user: S.user.name}); closeLayer(h.el); docRefresh();
  openPO(null, {supplier: st.data.lieferant || findEan(st.data.lines.find(l => l.ean).ean)?.a.supplierId || SUPPLIERS[0]?.id, lines, type: 'Kommission'});
};
DOC_AFTER.kundenbestellung = {
  abholen: (st, el) => { closeLayer(el); posLoadLines(st.data.lines, st.partner, st.no); if (st.data.anzahlung) toast('Anzahlung berücksichtigen', {t2: `${cEur(st.data.anzahlung)} wurden bereits bezahlt – als Rabatt oder Gutschein verrechnen`, icon: 'info', dur: 9000}); },
  eingetroffen: async st => { const to = custById(st.partner)?.email || (st.data.kontakt || '').match(/\S+@\S+/)?.[0]; if (!to || !(await confirmBox(`Kund:in (${to}) informieren, dass die Bestellung da ist?`, 'E-Mail senden'))) return; const txt = `Guten Tag ${st.partner_name},\n\nIhre Bestellung ${st.no} ist eingetroffen und liegt zur Abholung bereit:\n${st.data.lines.map(l => `· ${l.qty} × ${l.name}`).join('\n')}\n\nIhr Team von ${CFG['firma.name']}`; try { await invoke('mail_send', {to, subject: `Ihre Bestellung ${st.no} ist da`, html: `<div style="font:15px/1.6 system-ui,sans-serif">${esc(txt).replace(/\n/g, '<br>')}</div>`, text: txt, qr: null, purpose: 'kundenbestellung'}); toast('Kund:in informiert', {t2: to, type: 'pos', icon: 'mail'}); } catch (err) { toast('E-Mail nicht gesendet', {t2: String(err), type: 'warn'}); } },
};
DK.fremdrechnung = {t: 'Fremdrechnungen', one: 'Fremdrechnung', ic: 'idcard', page: 'fremdrechnungen', perm: 'faktura', partner: 'kunde', amount: true, print: 'Rechnung',
  sub: 'Ausgangsrechnungen aus anderen Systemen (Webshop, Altsystem, Werkstatt) – offene Posten, Zahlungseingang und Mahnung in Kontor',
  head: [{k: 'data.rechnungsnr', l: 'Rechnungsnummer (extern)', req: true}, {k: 'date', l: 'Rechnungsdatum', t: 'date'}, {k: 'due', l: 'Fällig am', t: 'date'}, {k: 'data.betrag', l: 'Betrag brutto €', t: 'money'}, {k: 'data.quelle', l: 'Quelle', t: 'select', o: ['Webshop', 'Altsystem', 'Werkstatt', 'Verleih', 'Sonstiges']}, {k: 'data.text', l: 'Leistung / Notiz', t: 'area', full: true}],
  acts: {offen: DK.rechnung.acts.offen.filter(a => a[0] !== 'stornieren').concat([['stornieren', 'Stornieren', 'danger']]), teilbezahlt: DK.rechnung.acts.teilbezahlt}};
DOC_EDIT.fremdrechnung = ['offen'];
docPage('fremdrechnungen', 'fremdrechnung', {tabs: [['offen', 'Offen', s => ['offen', 'teilbezahlt'].includes(s)], ['bezahlt', 'Bezahlt', s => s === 'bezahlt'], ['alle', 'Alle', () => true]], newLabel: 'Fremdrechnung erfassen',
  cols: [{l: 'Rechnungsnr.', f: d => esc(d.data.rechnungsnr || '')}, {l: 'Quelle', f: d => esc(d.data.quelle || '')}, {l: 'Fällig', f: d => `<span class="num" style="${d.due && d.due < today() && d.open ? 'color:var(--neg);font-weight:600' : ''}">${esc(dDate(d.due))}</span>`}]});
DOC_AFTER.fremdrechnung = {mahnen: st => docPrint(st, true)};
// Druck für Belege ohne Positionen (Fremdrechnung, Mahnung)
{ const _dh = docHTML; docHTML = function (st) { if ((st.data.lines || []).length || !st.total) return _dh(st); return _dh({...st, data: {...st.data, lines: [{name: `${st.kind === 'fremdrechnung' ? 'Rechnung ' + (st.data.rechnungsnr || '') + ' vom ' + dDate(st.date) : DK[st.kind].one}${st.data.text ? ' – ' + st.data.text : ''}`, qty: 1, price: st.total, vat: 20}]}}); }; }
// Mahnung: Mahngebühr und Hinweis im Druck
{ const _dh2 = docHTML; docHTML = function (st) { let h = _dh2(st); if (st._mahnung && st.data.mahnstufe) { const g = (CFG['mahn.gebuehr'] || [])[Math.min(st.data.mahnstufe, 3) - 1] || 0; h = h.replace('<div class="foot">', `<p style="margin-top:6mm"><b>${st.data.mahnstufe}. Mahnung:</b> Leider konnten wir zu dieser Rechnung noch keinen vollständigen Zahlungseingang feststellen. Offen: <b>${cEur(st.open)}</b>${g ? ` zzgl. Mahngebühr ${eur(g)}` : ''}. Bitte überweisen Sie den Betrag innerhalb von ${CFG['mahn.tage'] || 14} Tagen.${CFG['zahlung.iban'] ? ` IBAN ${esc(CFG['zahlung.iban'])}.` : ''} Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.</p><div class="foot">`); } return h; }; }

registerPage('mahnwesen', {title: 'Mahnwesen', sub: () => 'überfällige Rechnungen mahnen', render: renderMahnwesen});
async function renderMahnwesen() {
  const v = $('#view-mahnwesen'); if (!DESKTOP) { v.innerHTML = desktopEmpty('mail', 'Mahnwesen'); return; }
  const l = (await docLoad(['rechnung', 'fremdrechnung'])).filter(d => ['offen', 'teilbezahlt'].includes(d.status) && d.due && d.due < today());
  DOCS.mahnwesen = l;
  const age = d => Math.floor((Date.now() - new Date(d.due + 'T12:00:00')) / 864e5), last = d => (d.data.mahnungen || []).at(-1)?.datum;
  const fae = d => !last(d) || (Date.now() - new Date(last(d) + 'T12:00:00')) / 864e5 >= (CFG['mahn.tage'] || 14);
  v.innerHTML = `<div class="cv">${pageHead('Mahnwesen', `Überfällige Rechnungen – Mahnstufe 1 bis 3, frühestens alle ${CFG['mahn.tage'] || 14} Tage; Mahngebühren ${(CFG['mahn.gebuehr'] || []).map(g => eur(g)).join(' / ')}`, `<button class="btn btn-secondary" data-mw="cfg">${ic('sliders', 'i-sm')}Einstellungen</button><button class="btn btn-primary" data-mw="go" ${l.some(fae) ? '' : 'disabled'}>${ic('mail', 'i-sm')}Ausgewählte mahnen & drucken</button>`)}
    ${kpiCards([[num(l.length), 'überfällige Rechnungen', 'neg'], [eur0(l.reduce((s, d) => s + d.open, 0) / 100), 'überfälliger Betrag'], [num(l.filter(fae).length), 'jetzt mahnbar', 'warn'], [num(l.filter(d => (d.data.mahnstufe || 0) >= 3).length), 'nach 3. Mahnung (Inkasso prüfen)']])}
    <div class="card">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px;width:34px"><input type="checkbox" data-mwall checked></th><th>Rechnung</th><th>Kunde</th><th>fällig seit</th><th>Mahnstufe</th><th>letzte Mahnung</th><th class="r" style="padding-right:16px">offen</th></tr></thead><tbody>${l.map(d => `<tr data-dopen="${d.id}" style="cursor:pointer"><td style="padding-left:16px" onclick="event.stopPropagation()"><input type="checkbox" data-mws="${d.id}" ${fae(d) ? 'checked' : 'disabled'}></td><td><b class="mono">${esc(d.no)}</b><div class="muted" style="font-size:11.5px">${esc(DK[d.kind].one)}${d.data.rechnungsnr ? ' · ' + esc(d.data.rechnungsnr) : ''}</div></td><td>${esc(d.partner_name)}</td><td style="color:var(--neg)">${age(d)} Tagen</td><td>${d.data.mahnstufe ? `<span class="pill neg" style="height:20px">${d.data.mahnstufe}. Mahnung</span>` : '<span class="muted">–</span>'}</td><td class="muted">${last(d) ? esc(dDate(last(d))) : '–'}</td><td class="r num" style="padding-right:16px;font-weight:650">${cEur(d.open)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:52px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><h3>Nichts zu mahnen</h3><p>Keine überfälligen Rechnungen.</p></div>`}</div></div>`;
}
async function mahnGo() {
  const ids = $$('[data-mws]').filter(c => c.checked).map(c => +c.dataset.mws); if (!ids.length) return;
  try { await needPerm('faktura', 'Mahnungen'); } catch { return; }
  const out = [];
  for (const id of ids) { try { out.push(await invoke('doc_action', {id, action: 'mahnen', payload: {}, user: S.user.name})); } catch (e) { toast('Fehler', {t2: String(e), type: 'warn'}); } }
  if (!out.length) return;
  const c = /^#[0-9a-f]{6}$/i.test(CFG['a4.farbe'] || '') ? CFG['a4.farbe'] : '#111111';
  printHTML(out.map(d => docHTML({...d, _mahnung: true})).join('<div style="page-break-after:always"></div>'), `Mahnungen ${today()}`, `h1{color:${c}}th{color:${c};border-color:${c}}.sum .tot td{border-color:${c};color:${c}}`);
  toast(`${out.length} Mahnungen erstellt`, {t2: 'Druckdialog geöffnet', type: 'pos', icon: 'mail'}); Hooks.emit('faktura.mahnlauf', {anzahl: out.length}); renderMahnwesen();
}

/* ── Einstellungen: Menü-Akkordeon ── */
{
  const _rs = renderSettings;
  renderSettings = function () {
    _rs();
    const box = $('#sec-darstellung .card') || $('#sec-kasse .card'); if (!box || $('#navAkk')) return;
    box.insertAdjacentHTML('beforeend', `<div class="set-row"><div><div class="set-l">Menü als Akkordeon</div><div class="set-h">Nur der Bereich der aktuellen Seite ist aufgeklappt – übersichtlicher bei vielen Menüpunkten</div></div><div class="set-c"><button class="switch" role="switch" id="navAkk" aria-checked="${prefs.navAkkordeon !== false}"></button></div></div>`);
  };
}

function bindVerkauf3() {
  document.addEventListener('click', async e => {
    if (!e.target.closest('#views')) return;
    const t = e.target;
    if (t.closest('#navAkk')) { const b = $('#navAkk'), on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on); prefs.navAkkordeon = on; persist.set('prefs', prefs); if (on) navReveal(S.view); return; }
    // Gutscheine
    if (t.closest('[data-gp="neu"]')) {
      const code = await askText('PIN vergeben', 'Gutscheincode', ''); if (!code) return;
      const pin = await askText('PIN vergeben', `4–8 Ziffern für ${code.toUpperCase()}`, String(Math.floor(1000 + Math.random() * 9000))); if (!pin) return;
      try { await needPerm('kasse.kassenbuch', 'Gutschein-PIN'); await invoke('voucher_set_pin', {code, pin, user: S.user.name}); toast('PIN gesetzt', {t2: `${code.toUpperCase()} · PIN ${pin} – der Kundin/dem Kunden mitteilen`, type: 'pos', icon: 'lock', dur: 9000}); PAGES['gutscheine-pin'].render(); } catch (err) { toast('Nicht möglich', {t2: String(err), type: 'warn'}); }
      return;
    }
    const gx = t.closest('[data-gpx]'); if (gx) { try { await invoke('voucher_set_pin', {code: gx.dataset.gpx, pin: null, user: S.user.name}); PAGES['gutscheine-pin'].render(); } catch (err) { toast('Nicht möglich', {t2: String(err), type: 'warn'}); } return; }
    if (t.closest('[data-glgo]')) {
      try { await stepUp({title: 'Gutschein löschen', text: `${GL.v.code} · Restwert ${cEur(GL.v.balance)} verfällt`, admin: true}); } catch { return; }
      try { GL.v = await invoke('voucher_delete', {code: GL.v.code, reason: `${$('#glGrund').value}${$('#glNote').value.trim() ? ' – ' + $('#glNote').value.trim() : ''}`, user: S.user.name}); toast('Gutschein gelöscht', {t2: GL.v.code, type: 'pos', icon: 'trash'}); Hooks.emit('voucher.deleted', {code: GL.v.code}); PAGES['gutscheine-loeschen'].render(); } catch (err) { toast('Nicht möglich', {t2: String(err), type: 'warn'}); }
      return;
    }
    const gxb = t.closest('[data-gx]'); if (gxb) {
      if (gxb.dataset.gx === 'cfg') { const s = await askText('Aussteller externer Gutscheine', 'Durch Komma getrennt', (CFG['gutschein.extern'] || []).join(', ')); if (s != null) { await saveSettings({'gutschein.extern': s.split(',').map(x => x.trim()).filter(Boolean)}); PAGES['gutscheine-extern'].render(); } return; }
      const rows = $('#view-gutscheine-extern')._rows || [];
      const csv = ['Aussteller;Gutschein;Beleg;Datum;Betrag'].concat(rows.map(r => [r.anb, r.p.ref || r.p.label, r.s.no, r.s.ts.slice(0, 10), num(r.p.amount, 2)].join(';'))).join('\r\n');
      try { const p = await invoke('save_text', {name: `Fremdgutscheine_${today()}.csv`, content: csv, title: 'Abrechnung Fremdgutscheine'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); }
      return;
    }
    // Mahnwesen
    const mw = t.closest('[data-mw]'); if (mw) {
      if (mw.dataset.mw === 'go') return mahnGo();
      const g = await askText('Mahngebühren', 'Stufe 1, 2, 3 in € (durch Komma/Strichpunkt getrennt)', (CFG['mahn.gebuehr'] || []).map(x => num(x, 2)).join('; ')); if (g == null) return;
      const tage = await askText('Mahnabstand', 'Tage zwischen zwei Mahnungen', String(CFG['mahn.tage'] || 14)); if (tage == null) return;
      await saveSettings({'mahn.gebuehr': g.split(/[;|]/).map(x => parseAmt(x) || 0).slice(0, 3), 'mahn.tage': Math.max(1, parseInt(tage, 10) || 14)}); return renderMahnwesen();
    }
    const ma = t.closest('[data-mwall]'); if (ma) $$('[data-mws]:not([disabled])').forEach(c => { c.checked = ma.checked; });
  });
  $('#view-gutscheine-loeschen').addEventListener('keydown', async e => {
    if (e.target.id !== 'glCode' || e.key !== 'Enter') return;
    GL.code = e.target.value.trim().toUpperCase();
    try { GL.v = await invoke('voucher_get', {code: GL.code}); } catch (err) { GL.v = null; toast('Gutschein unbekannt', {t2: String(err), type: 'warn'}); }
    PAGES['gutscheine-loeschen'].render();
  });
}
