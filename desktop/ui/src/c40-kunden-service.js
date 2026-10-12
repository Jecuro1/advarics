
/* ════════════════════════════════════════════════════════════════════
   50 · KUNDEN, KOMMUNIKATION, VERSAND, VERLEIH, ZEITERFASSUNG,
   INVENTUR, EINSTELLUNGEN, SERVICE — Kundenerfassung mit Anrede/Titel/
   Merkmalen, Bonus-Kalkulation, Hotels, WhatsApp/SMS (Chat, Vorlagen,
   Massennachrichten), Versandetiketten mit Tracking, Verleih, Stempel-
   uhr, Inventur-Erfassungspool, Nummernkreise, Prozesskonfiguration,
   Styling, EK-Verschlüsselung und das Service-Menü.
   ════════════════════════════════════════════════════════════════════ */
Object.assign(DEFAULTS, {'bonus.cent_pro_punkt': 1000, 'whatsapp.token': '', 'whatsapp.phone_id': '', 'whatsapp.api': '', 'sms.url': '', 'sms.token': '', 'sms.absender': '', 'nachricht.landesvorwahl': '43',
  'ek.code': '', 'ek.verschluesselt': false, 'inventur.blind': false, 'inventur.nullen': false, 'support.name': '', 'support.telefon': '', 'support.email': '', 'liste.dichte': 'normal', 'liste.zebra': false});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });

/* ── Darstellung Auswahllisten (Styling) ── */
function applyListStyle() { document.body.classList.toggle('list-compact', CFG['liste.dichte'] === 'kompakt'); document.body.classList.toggle('list-zebra', !!CFG['liste.zebra']); }
{ const st = document.createElement('style'); st.textContent = 'body.list-compact .tbl td,body.list-compact .tbl th{padding-top:5px;padding-bottom:5px}body.list-compact .pal-i{height:34px!important}body.list-zebra .tbl tbody tr:nth-child(even){background:var(--surface-2)}'; document.head.appendChild(st); }

/* ── EK-Verschlüsselung: Einkaufspreis als Codewort (z. B. KONTORSALE → K=1 … E=0) ── */
function ekShow(ek) {
  const code = String(CFG['ek.code'] || '').toUpperCase();
  if (!CFG['ek.verschluesselt'] || code.length !== 10 || new Set(code).size !== 10) return eur(ek);
  const digits = String(Math.round((ek || 0) * 100));
  return digits.split('').map(d => code[(+d + 9) % 10]).join('');
}

/* ── Belegarten Versand und Verleih ── */
DK.sendung = {t: 'Versand-Etiketten', one: 'Sendung', ic: 'truck', page: 'versand-etiketten', perm: 'faktura', partner: 'kunde', print: 'Versandetikett',
  sub: 'Pakete an Kund:innen – Etikett drucken, Sendungsnummer erfassen, Zustellung verfolgen',
  head: [{k: 'ref', l: 'Bezug (Rechnung, Lieferschein, Webshop-Bestellung)'}, {k: 'data.spediteur', l: 'Spediteur', t: 'select', get o() { return ['', ...stActive('spediteur').map(s => s.name)]; }}, {k: 'data.pakettyp', l: 'Paket-Typ', t: 'select', get o() { return ['', ...stActive('pakettyp').map(s => s.name)]; }},
    {k: 'data.gewicht', l: 'Gewicht kg', t: 'num'}, {k: 'data.pakete', l: 'Anzahl Pakete', t: 'int'}, {k: 'data.empfaenger', l: 'Empfänger (Name, Straße, PLZ Ort, Land)', t: 'area', full: true}, {k: 'data.telefon', l: 'Telefon für Zusteller'}, {k: 'data.inhalt', l: 'Inhalt'}],
  acts: {erstellt: [['versendet', 'Versendet', 'primary', {ask: [{k: 'tracking', l: 'Sendungsnummer'}]}], ['stornieren', 'Stornieren', 'danger']], versendet: [['zugestellt', 'Zugestellt', 'primary']]}};
DK.verleih = {t: 'Verleih', one: 'Verleih', ic: 'clock', page: 'verleih', perm: 'kasse.verkaufen', partner: 'kunde', price: 'vk', lines: true, print: 'Verleihvertrag',
  sub: 'Rental Service: Leihgeräte ausgeben (bucht aus) und zurücknehmen (bucht ein) – Leihgebühr und Kaution nach Tarif',
  head: [{k: 'date', l: 'Ausgabe', t: 'date'}, {k: 'due', l: 'Rückgabe bis', t: 'date'}, {k: 'data.tarif', l: 'Tarif', t: 'select', get o() { return ['', ...stActive('verleihtarif').map(s => s.name)]; }}, {k: 'data.kaution', l: 'Kaution €', t: 'money'}, {k: 'data.ausweis', l: 'Ausweis / Pfand'}, {k: 'data.z_wert', l: 'Z-Wert / Einstellung'}, {k: 'data.notiz', l: 'Notiz', t: 'area', full: true}],
  acts: {entwurf: [['ausgeben', 'Ausgeben (bucht aus)', 'primary', {confirm: 'Leihgeräte ausgeben? Der Bestand wird reduziert, bis sie zurückkommen.'}], ['stornieren', 'Verwerfen', 'danger']],
    ausgegeben: [['zurueck', 'Rücknahme (bucht ein)', 'primary', {ask: [{k: 'zustand', l: 'Zustand', t: 'select', o: ['in Ordnung', 'verschmutzt', 'beschädigt', 'defekt']}, {k: 'nachzahlung', l: 'Nachzahlung / Schaden €', t: 'money'}]}]]}};
docPage('versand-etiketten', 'sendung', {newLabel: 'Neue Sendung', tabs: [['offen', 'Offen', s => s === 'erstellt'], ['unterwegs', 'Unterwegs', s => s === 'versendet'], ['alle', 'Alle', () => true]],
  kpi: l => [[num(l.filter(d => d.status === 'erstellt').length), 'zu versenden', 'warn'], [num(l.filter(d => d.status === 'versendet').length), 'unterwegs'], [num(l.filter(d => d.status === 'zugestellt').length), 'zugestellt', 'pos']],
  cols: [{l: 'Spediteur', f: d => esc(d.data?.spediteur || '–')}, {l: 'Sendungsnr.', f: d => d.data?.tracking ? `<span class="mono" style="font-size:12px">${esc(d.data.tracking)}</span>` : '–'}]});
docPage('verleih', 'verleih', {newLabel: 'Neuer Verleih', tabs: [['offen', 'Ausgegeben', s => ['entwurf', 'ausgegeben'].includes(s)], ['zurueck', 'Zurück', s => s === 'zurueckgegeben'], ['alle', 'Alle', () => true]],
  kpi: l => [[num(l.filter(d => d.status === 'ausgegeben').length), 'ausgegeben', 'warn'], [num(l.filter(d => d.status === 'ausgegeben' && d.due && d.due < today()).length), 'überfällig', 'neg'], [num(l.filter(d => d.status === 'zurueckgegeben').length), 'zurück']],
  cols: [{l: 'Tarif', f: d => esc(d.data?.tarif || '–')}, {l: 'Rückgabe', f: d => esc(dDate(d.due))}]});
const trackUrl = d => { const s = stActive('spediteur').find(x => x.name === d.data?.spediteur); return s?.tracking && d.data?.tracking ? s.tracking.replace('{nr}', encodeURIComponent(d.data.tracking)) : null; };
DOC_BTNS.sendung = st => st.id ? `<button class="btn btn-secondary" data-vslabel>${ic('printer', 'i-sm')}Etikett A6</button>${trackUrl(st) ? `<button class="btn btn-secondary" data-vstrack>${ic('globe', 'i-sm')}Sendung verfolgen</button>` : ''}` : '';
DOC_CLICK.sendung = async (e, st) => {
  if (e.target.closest('[data-vslabel]')) printShipLabel(st);
  if (e.target.closest('[data-vstrack]')) { const u = trackUrl(st); if (u) invoke('open_url', {url: u}).catch(() => window.open(u, '_blank')); }
};
DOC_BTNS.verleih = st => `<button class="btn btn-secondary" data-vltarif>${ic('cash', 'i-sm')}Tarif berechnen</button>`;
DOC_CLICK.verleih = async (e, st, {render}) => {
  if (!e.target.closest('[data-vltarif]')) return;
  const t = stActive('verleihtarif').find(x => x.name === st.data?.tarif); if (!t) return toast('Erst Tarif wählen', {type: 'warn'});
  const tage = Math.max(1, Math.round((new Date(st.due || today()) - new Date(st.date || today())) / 864e5) + 1);
  const preis = Math.min(tage * (+t.tag || 0), Math.ceil(tage / 7) * (+t.woche || 1e9));
  (st.data.lines || []).forEach(l => { l.price = Math.round(preis * 100 / Math.max(1, (st.data.lines || []).length)); });
  st.data.kaution = Math.round((+t.kaution || 0) * 100);
  toast(`${tage} Tag${tage === 1 ? '' : 'e'} · ${eur(preis)}`, {t2: `Kaution ${eur(+t.kaution || 0)} – Preise in die Positionen übernommen`, icon: 'cash'}); render();
};
function printShipLabel(st) {
  const s = stActive('spediteur').find(x => x.name === st.data?.spediteur), nr = st.data?.tracking || st.no;
  const w = window.open('', '_blank', 'width=520,height=760'); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(st.no)}</title><style>@page{size:105mm 148mm;margin:6mm}body{font:13px system-ui,sans-serif;margin:0;width:93mm}.box{border:2px solid #000;border-radius:6px;padding:10px;margin-bottom:8px}.big{font-size:18px;font-weight:700;white-space:pre-line}.muted{color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.05em}.code{font:700 22px monospace;letter-spacing:2px;text-align:center;border:2px dashed #000;padding:12px;margin-top:8px}</style></head><body>
    <div class="box"><div class="muted">Absender</div><div>${esc(CFG['firma.name'] || '')}<br>${esc(CFG['firma.adresse'] || '')}</div></div>
    <div class="box"><div class="muted">Empfänger</div><div class="big">${esc(st.partner_name || '')}\n${esc(st.data?.empfaenger || '')}</div>${st.data?.telefon ? `<div>Tel. ${esc(st.data.telefon)}</div>` : ''}</div>
    <div class="box" style="display:flex;justify-content:space-between"><div><div class="muted">Spediteur</div><b>${esc(s?.name || st.data?.spediteur || '–')}</b></div><div><div class="muted">Paket</div><b>${esc(st.data?.pakettyp || '–')}</b></div><div><div class="muted">Gewicht</div><b>${st.data?.gewicht ? esc(String(st.data.gewicht)) + ' kg' : '–'}</b></div></div>
    <div class="box"><div class="muted">Sendung · Bezug ${esc(st.ref || '')}</div><div class="code">${esc(nr)}</div><div style="text-align:center;margin-top:6px">${esc(st.data?.inhalt || '')}</div></div>
    <script>setTimeout(()=>print(),250)<\/script></body></html>`);
  w.document.close();
  Hooks.emit('versand.etikett', {sendung: st.no, spediteur: s?.name || null});
}

/* ── Kundenerfassung ── */
const KE = {d: null};
const keBlank = () => ({name: '', vorname: '', anrede: '', titel: '', sprache: 'de', email: '', phone: '', street: '', zip: '', city: '', country: 'AT', consent: false, merkmale: {}, hotel: '', preisgruppe: '', note: ''});
registerPage('kundenerfassung', {title: 'Kundenerfassung', sub: () => 'Neue Kund:innen schnell anlegen', render: async () => {
  const v = $('#view-kundenerfassung'); await loadStamm();
  const d = KE.d ||= keBlank();
  const sel = (k, opts, lbl) => `<label class="field"><span>${lbl}</span><select class="input select" data-ke="${k}"><option value="">–</option>${opts.map(([a, b]) => `<option value="${esc(a)}" ${d[k] === a ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
  const inp = (k, lbl, ph = '') => `<label class="field"><span>${lbl}</span><input class="input" data-ke="${k}" value="${esc(d[k] || '')}" placeholder="${esc(ph)}"></label>`;
  v.innerHTML = `<div class="cv">${pageHead('Kundenerfassung', 'Mit Anrede, Titel, Sprache, Merkmalen, Hotel und Preisgruppe – Einwilligung für Newsletter/WhatsApp direkt erfassen')}
    <div class="card" style="padding:18px"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
      ${sel('anrede', stOpts('anrede'), 'Anrede')}${sel('titel', stOpts('titel'), 'Titel')}${inp('vorname', 'Vorname')}${inp('name', 'Nachname / Firma *')}
      ${inp('email', 'E-Mail')}${inp('phone', 'Mobil (für WhatsApp/SMS)', '+43 664 …')}${sel('sprache', stOpts('sprache'), 'Sprache')}${sel('preisgruppe', stOpts('preisgruppe'), 'Preisgruppe')}
      ${inp('street', 'Straße')}${inp('zip', 'PLZ')}${inp('city', 'Ort')}${sel('country', stOpts('land'), 'Land')}
      ${sel('hotel', stOpts('hotel'), 'Hotel (Gast)')}
      ${stActive('kundenmerkmal').map(m => `<label class="field"><span>${esc(m.name)}</span><select class="input select" data-kem="${esc(m.name)}"><option value="">–</option>${(m.werte || []).map(w => `<option ${d.merkmale[m.name] === w ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select></label>`).join('')}
      <label class="field" style="grid-column:1/-1"><span>Notiz</span><input class="input" data-ke="note" value="${esc(d.note)}"></label>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;grid-column:1/-1"><input type="checkbox" data-kec ${d.consent ? 'checked' : ''}> Einwilligung: Newsletter, WhatsApp und SMS (DSGVO, jederzeit widerrufbar)</label></div>
      <div style="display:flex;gap:8px;margin-top:16px"><span class="sp" style="flex:1"></span><button class="btn btn-secondary" data-kereset>Leeren</button><button class="btn btn-primary" data-kesave>${ic('check', 'i-sm')}Kunde anlegen</button></div></div>
    <div class="card" style="margin-top:14px"><div class="set-row"><div class="set-l">Zuletzt angelegt</div><button class="btn btn-ghost btn-sm" data-goto="kunden">Alle Kunden</button></div><table class="tbl" style="margin:0"><tbody>${CUSTOMERS.slice().sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 8).map(c => `<tr><td style="padding-left:16px"><b>${esc(c.name)}</b></td><td class="mono muted">${esc(c.id)}</td><td>${esc(c.email || '')}</td><td>${esc(c.phone || '')}</td><td class="muted num" style="padding-right:16px">${c.created ? c.created.toLocaleDateString('de-AT') : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  v.oninput = v.onchange = e => { const t = e.target; if (t.dataset.ke) d[t.dataset.ke] = t.value; if (t.dataset.kem) d.merkmale[t.dataset.kem] = t.value; if (t.matches('[data-kec]')) d.consent = t.checked; };
  v.onclick = async e => {
    if (e.target.closest('[data-kereset]')) { KE.d = keBlank(); return PAGES.kundenerfassung.render(); }
    if (!e.target.closest('[data-kesave]')) return;
    if (d.name.trim().length < 2) return toast('Nachname fehlt', {type: 'warn'});
    const full = [stName('titel', d.titel) && !stRows('titel').find(x => x.id === d.titel)?.nachgestellt ? stName('titel', d.titel) : '', d.vorname, d.name, stRows('titel').find(x => x.id === d.titel)?.nachgestellt ? stName('titel', d.titel) : ''].filter(Boolean).join(' ').trim();
    const fields = {...Object.fromEntries(Object.entries(d.merkmale).filter(([, x]) => x)), ...(d.anrede ? {Anrede: stName('anrede', d.anrede)} : {}), ...(d.titel ? {Titel: stName('titel', d.titel)} : {}), ...(d.sprache ? {Sprache: d.sprache} : {}), ...(d.hotel ? {Hotel: stName('hotel', d.hotel)} : {}), ...(d.preisgruppe ? {Preisgruppe: stName('preisgruppe', d.preisgruppe)} : {}), Newsletter: d.consent ? 'ja' : 'nein'};
    const c = {id: '', name: full, email: d.email.trim(), phone: d.phone.trim(), tier: 'Kunde', points: 0, fields, consent: d.consent, note: d.note, street: d.street, zip: d.zip, city: d.city, country: d.country || 'AT'};
    try {
      const saved = DESKTOP ? custFromDb(await invoke('customer_save', {customer: custToDb(c), user: S.user.name})) : {...c, id: 'K-' + Date.now().toString().slice(-5)};
      if (DESKTOP) { replaceCustomers(await invoke('customer_list')); } else CUSTOMERS.push(custFinish(saved));
      Hooks.emit('customer.created', {kunde: saved.id, quelle: 'Kundenerfassung'});
      toast('Kunde angelegt', {t2: `${saved.name} · ${saved.id}`, type: 'pos', icon: 'user-plus'}); KE.d = keBlank(); PAGES.kundenerfassung.render();
    } catch (err) { toast('Nicht angelegt', {t2: String(err), type: 'warn'}); }
  };
}});
VIEW_PERM.kundenerfassung = 'kunden.bearbeiten';

/* ── Bonus Kalkulation ── */
registerPage('bonus-kalkulation', {title: 'Bonus Kalkulation', sub: () => `1 Punkt je ${eur((+CFG['bonus.cent_pro_punkt'] || 1000) / 100)}`, render: async () => {
  const v = $('#view-bonus-kalkulation'); await loadStamm();
  const cpp = +CFG['bonus.cent_pro_punkt'] || 1000, st = stActive('bonusprozent').slice().sort((a, b) => (+a.ab || 0) - (+b.ab || 0));
  v.innerHTML = `<div class="cv">${pageHead('Bonus Kalkulation', 'Wie viele Punkte ein Einkauf bringt – Grundsatz und Umsatzstaffel (Faktor nach Jahresumsatz der letzten 365 Tage)', `<button class="btn btn-secondary" data-goto="st-bonusprozent">${ic('percent', 'i-sm')}Prozentkalkulation (Staffel)</button>`)}
    <div class="card"><div class="set-row"><div><div class="set-l">1 Punkt je … Umsatz</div><div class="set-h">Gilt für Kasse, Faktura und nachträgliche Bon-Zuordnung; Retouren ziehen Punkte anteilig ab</div></div><div class="set-c"><input class="input num" data-bkc value="${esc(num(cpp / 100, 2))}" style="max-width:110px"> €</div></div></div>
    <div class="card" style="margin-top:14px"><div class="set-row"><div class="set-l">Beispiel: Einkauf über € 200</div></div><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Stufe</th><th class="r">ab Jahresumsatz</th><th class="r">Faktor</th><th class="r" style="padding-right:16px">Punkte</th></tr></thead><tbody>${(st.length ? st : [{name: 'Basis', ab: 0, faktor: 1}]).map(s => `<tr><td style="padding-left:16px"><b>${esc(s.name)}</b></td><td class="r num">${eur0(+s.ab || 0)}</td><td class="r num">× ${num(+s.faktor || 1, 2)}</td><td class="r num" style="padding-right:16px;font-weight:650">${Math.floor(Math.floor(20000 / cpp) * (+s.faktor || 1))}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('[data-bkc]', v).onchange = async e => { const c = Math.round(parseAmt(e.target.value) * 100); if (!(c >= 1)) return toast('Ungültiger Betrag', {type: 'warn'}); await saveSettings({'bonus.cent_pro_punkt': c}); PAGES['bonus-kalkulation'].render(); };
}});
VIEW_PERM['bonus-kalkulation'] = 'einstellungen';

/* ── Hotel-Provisionen ── */
const HP = {mon: today().slice(0, 7)};
registerPage('hotel-provision', {title: 'Hotel-Provisionen', sub: () => HP.mon, render: async () => {
  const v = $('#view-hotel-provision');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('building', 'Hotel-Provisionen'); return; }
  await loadStamm();
  let sales = []; try { sales = (await invoke('sales_list', {limit: 20000})).filter(s => s.ts.startsWith(HP.mon) && !s.data?.voided); } catch { /* */ }
  const hotels = stActive('hotel'), by = {};
  for (const s of sales) {
    const c = s.data?.customer?.id ? custById(s.data.customer.id) : null;
    const h = s.data?.zusatz?.Hotel || c?.fields?.Hotel; if (!h) continue;
    const x = by[h] ||= {umsatz: 0, bons: 0}; x.umsatz += (s.kind || 'verkauf') === 'verkauf' ? s.total / 100 : -s.total / 100; x.bons++;
  }
  const rows = hotels.map(h => ({h, ...(by[h.name] || {umsatz: 0, bons: 0})})).concat(Object.keys(by).filter(n => !hotels.some(h => h.name === n)).map(n => ({h: {name: n, provision: 0}, ...by[n]})));
  const tbl = `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Hotel</th><th class="r">Bons</th><th class="r">Umsatz</th><th class="r">Provision %</th><th class="r" style="padding-right:16px">Provision</th></tr></thead><tbody>${rows.map(r => `<tr><td style="padding-left:16px"><b>${esc(r.h.name)}</b><div class="muted" style="font-size:12px">${esc([r.h.ort, r.h.kontakt].filter(Boolean).join(' · '))}</div></td><td class="r num">${r.bons}</td><td class="r num">${eur(r.umsatz)}</td><td class="r num">${num(+r.h.provision || 0, 1)} %</td><td class="r num" style="padding-right:16px;font-weight:650">${eur(r.umsatz * (+r.h.provision || 0) / 100)}</td></tr>`).join('')}</tbody></table>`;
  v.innerHTML = `<div class="cv">${pageHead('Hotel-Provisionen', 'Umsätze von Hotelgästen (Feld „Hotel“ am Kunden oder Beleg-Zusatzinfo „Hotel“) und Provision je Partnerhotel', `<button class="btn btn-secondary" data-goto="st-hotel">${ic('building', 'i-sm')}Hotels</button><button class="btn btn-secondary" data-hpp>${ic('printer', 'i-sm')}Abrechnung drucken</button>`)}
    <div class="filters"><input class="input" type="month" data-hpm value="${HP.mon}" style="width:auto"></div>
    <div class="card" style="overflow:auto">${rows.length ? tbl : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('building')}</div><h3>Keine Hotels</h3><p>Unter Kundenmanagement › Hotels anlegen; an der Kasse über Beleg-Zusatzinformationen „Hotel“ zuordnen.</p></div>`}</div></div>`;
  $('[data-hpm]', v).onchange = e => { HP.mon = e.target.value; PAGES['hotel-provision'].render(); };
  $('[data-hpp]', v).onclick = () => anPrint(`Hotel-Provisionen ${HP.mon}`, tbl);
}});
VIEW_PERM['hotel-provision'] = 'berichte';

/* ── Protokoll Kundenumbuchung ── */
registerPage('kundenumbuchung-protokoll', {title: 'Protokoll Kundenumbuchung', sub: () => 'Nachträgliche Kundenzuordnungen und Punkte', render: async () => {
  const v = $('#view-kundenumbuchung-protokoll');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('history', 'Protokoll'); return; }
  let l = []; try { l = (await invoke('audit_query', {q: null, prefix: null, before: null, limit: 3000})).filter(e => /^(sale\.assign|customer\.(points|merged|updated|deleted)|bon\.)/.test(e.event) || (e.event.startsWith('customer.') && e.payload?.punkte != null)); } catch { /* */ }
  v.innerHTML = `<div class="cv">${pageHead('Protokoll Kundenumbuchung', 'Bon-Zuordnungen, Punktebuchungen und Änderungen an Kundenkonten')}<div class="card">${l.length ? `<table class="tbl" style="margin:0"><tbody>${l.map(e => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(e.ts))}</td><td><b>${esc(e.event)}</b></td><td style="font-size:12.5px">${esc(Object.entries(e.payload || {}).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · '))}</td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:40px 20px"><h3>Noch keine Umbuchungen</h3><p>Bons nachträglich unter Verkauf › Kunden-Bon-Zuordnung zuordnen.</p></div>`}</div></div>`;
}});
VIEW_PERM['kundenumbuchung-protokoll'] = 'kunden.bearbeiten';

/* ── Nachrichten (WhatsApp / SMS) ── */
const custPhone = c => c?.phone || c?.fields?.Telefon || c?.fields?.Mobil || '';
function groupMembers(g) {
  return CUSTOMERS.filter(c => {
    if (g.nur_einwilligung && !c.consent) return false;
    if (g.stufe && !norm(c.tier || '').includes(norm(g.stufe))) return false;
    if (g.ort && !(norm(c.city || '').startsWith(norm(g.ort)) || String(c.zip || '').startsWith(g.ort))) return false;
    if (g.umsatz_ab && (c.revenue || 0) < +g.umsatz_ab) return false;
    if (g.merkmal) { const [k, val] = String(g.merkmal).split('='); if (norm(c.fields?.[k?.trim()] || '') !== norm(val || '')) return false; }
    return true;
  });
}
const fillTpl = (t, c) => String(t || '').replace(/\{vorname\}/g, (c?.name || '').split(' ')[0]).replace(/\{name\}/g, c?.name || '').replace(/\{punkte\}/g, c?.points ?? 0).replace(/\{firma\}/g, CFG['firma.marke'] || CFG['firma.name'] || '');
async function msgSend(kanal, list, text, template) {
  const to = list.filter(c => custPhone(c)).map(c => ({tel: custPhone(c), name: c.name, kunde: null, punkte: c.points || 0}));
  if (!to.length) throw new Error('Keine Empfänger mit Telefonnummer');
  const r = await invoke('msg_send', {kanal, to, text: text.replace(/\{firma\}/g, CFG['firma.marke'] || CFG['firma.name'] || ''), template: template || null, user: S.user.name});
  return r;
}
function showWaLinks(links) {
  const el = openLayer(`<div class="modal" style="width:min(560px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('chat')}</div><div><h2>In WhatsApp öffnen</h2><p>Ohne WhatsApp-Business-API werden Nachrichten vorbereitet – je Empfänger einmal klicken und in WhatsApp senden.</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:6px;max-height:420px;overflow:auto">${links.map(l => `<button class="pal-i" data-walink="${esc(l.link)}" style="height:42px"><span style="flex:1;text-align:left">${esc(l.name)}</span>${ic('arrow-right', 'i-sm')}</button>`).join('')}</div></div>`);
  el.addEventListener('click', e => { const b = e.target.closest('[data-walink]'); if (b) { invoke('open_url', {url: b.dataset.walink}).catch(() => window.open(b.dataset.walink, '_blank')); b.style.opacity = .5; } });
}
const WA_GLOBAL = [
  ['GEBURTSTAG', 'Geburtstag', 'Alles Gute zum Geburtstag, {vorname}! 🎉 Als Dankeschön schenken wir Ihnen diese Woche 10 % auf Ihren Einkauf. Ihr Team von {firma}'],
  ['ABHOLBEREIT', 'Abholbereit', 'Hallo {vorname}, Ihre Bestellung liegt für Sie zur Abholung bereit. Wir freuen uns auf Ihren Besuch! {firma}'],
  ['SERVICE', 'Service fertig', 'Hallo {vorname}, Ihr Ski-Service ist fertig und kann abgeholt werden. {firma}'],
  ['KOLLEKTION', 'Neue Kollektion', 'Hallo {vorname}, die neue Kollektion ist eingetroffen – schauen Sie vorbei! {firma}'],
  ['SALE', 'Sale-Start', 'Hallo {vorname}, ab morgen startet unser Sale mit bis zu 50 % – Stammkund:innen haben heute schon Vorrang. {firma}'],
  ['PUNKTE', 'Bonuspunkte', 'Hallo {vorname}, Sie haben {punkte} Bonuspunkte gesammelt. Lösen Sie sie bei Ihrem nächsten Einkauf ein! {firma}'],
  ['TERMIN', 'Termin-Erinnerung', 'Hallo {vorname}, wir erinnern an Ihren Termin morgen. Bei Verhinderung bitte kurz Bescheid geben. {firma}'],
  ['RESERVIERUNG', 'Reservierung läuft ab', 'Hallo {vorname}, Ihre Reservierung läuft in 2 Tagen ab. Möchten Sie verlängern? {firma}'],
];
registerPage('wa-global', {title: 'Globale Template Vorlagen', sub: () => `${WA_GLOBAL.length} Vorlagen`, render: async () => {
  const v = $('#view-wa-global'); await loadStamm();
  const own = new Set(stRows('watemplate').map(t => t.id));
  v.innerHTML = `<div class="cv">${pageHead('Globale Template Vorlagen', 'Fertige Texte für häufige Anlässe – übernehmen und unter „WhatsApp Templates“ anpassen', `<button class="btn btn-secondary" data-goto="st-watemplate">${ic('chat', 'i-sm')}Eigene Templates</button>`)}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">${WA_GLOBAL.map(([id, n, t]) => `<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px"><b>${esc(n)}</b><div style="font-size:13px;background:var(--surface-2);border-radius:12px;padding:10px 12px;white-space:pre-wrap">${esc(t)}</div><div style="display:flex;justify-content:flex-end">${own.has(id) ? '<span class="pill pos" style="height:24px">übernommen</span>' : `<button class="btn btn-secondary btn-sm" data-wag="${id}">${ic('plus', 'i-sm')}Übernehmen</button>`}</div></div>`).join('')}</div></div>`;
  v.onclick = async e => { const b = e.target.closest('[data-wag]'); if (!b) return; const g = WA_GLOBAL.find(x => x[0] === b.dataset.wag); await stammSave('watemplate', [...stRows('watemplate'), {id: g[0], name: g[1], text: g[2], meta: '', sprache: 'de', _aktiv: true}]); STE.watemplate = null; toast('Vorlage übernommen', {t2: g[1], type: 'pos', icon: 'chat'}); PAGES['wa-global'].render(); };
}});
VIEW_PERM['wa-global'] = 'marketing';

const WAC = {cust: null, q: '', text: '', tpl: ''};
registerPage('wa-chat', {title: 'WhatsApp Chat', sub: () => WAC.cust ? custById(WAC.cust)?.name || '' : 'Kunde wählen', render: () => renderMsgChat('wa-chat', 'whatsapp')});
registerPage('sms-senden', {title: 'SMS senden', sub: () => 'Einzel-SMS an Kund:innen', render: () => renderMsgChat('sms-senden', 'sms')});
VIEW_PERM['wa-chat'] = 'marketing'; VIEW_PERM['sms-senden'] = 'marketing';
async function renderMsgChat(page, kanal) {
  const v = $('#view-' + page); await loadStamm();
  const c = WAC.cust ? custById(WAC.cust) : null, hits = WAC.q ? custHits(WAC.q) : [];
  let hist = []; if (DESKTOP && c) { try { const tel = custPhone(c).replace(/\D/g, '').slice(-8); hist = (await invoke('msg_list', {kanal: null, limit: 3000})).filter(m => m.an.replace(/\D/g, '').endsWith(tel)).reverse(); } catch { /* */ } }
  const tpls = kanal === 'sms' ? stActive('smsvorlage') : stActive('watemplate');
  v.innerHTML = `<div class="cv">${pageHead(kanal === 'sms' ? 'SMS senden' : 'WhatsApp Chat', kanal === 'sms' ? 'Über das eingestellte SMS-Gateway' : CFG['whatsapp.token'] ? 'Über die WhatsApp Business Cloud API' : 'Ohne API-Zugang: Nachricht wird in WhatsApp (Web/Desktop) geöffnet', `<button class="btn btn-secondary" data-goto="nachrichten-einstellungen">${ic('sliders', 'i-sm')}Einstellungen</button>`)}
    <div style="display:grid;grid-template-columns:minmax(240px,320px) minmax(0,1fr);gap:16px;align-items:start">
      <div class="card" style="padding:12px;position:relative"><label class="search-field" style="height:42px">${ic('search')}<input data-wacq value="${esc(WAC.q)}" placeholder="Kunde suchen …" autocomplete="off"></label>
        <div style="margin-top:8px">${(hits.length ? hits : CUSTOMERS.slice().sort((a, b) => !!custPhone(b) - !!custPhone(a)).slice(0, 14)).map(x => `<button class="pal-i" data-wacs="${esc(x.id)}" style="height:46px;${x.id === WAC.cust ? 'background:var(--accent-soft)' : ''}"><span style="flex:1;text-align:left"><b>${esc(x.name)}</b><div class="muted" style="font-size:11.5px">${esc(custPhone(x) || 'keine Nummer')}</div></span>${x.consent ? '' : `<span class="pill warn" style="height:18px;font-size:10.5px">ohne Einwilligung</span>`}</button>`).join('')}</div></div>
      <div class="card" style="display:flex;flex-direction:column;min-height:420px">${c ? `<div class="set-row"><div><div class="set-l">${esc(c.name)}</div><div class="set-h">${esc(custPhone(c) || 'Keine Telefonnummer hinterlegt')} · ${esc(c.tier || '')} · ${num(c.points || 0)} Punkte</div></div></div>
        <div style="flex:1;padding:12px 16px;display:flex;flex-direction:column;gap:8px;max-height:420px;overflow:auto">${hist.length ? hist.map(m => `<div style="align-self:flex-end;max-width:75%;background:${m.kanal === 'whatsapp' ? '#dcf8c6' : 'var(--accent-soft)'};color:#111;border-radius:14px 14px 4px 14px;padding:8px 12px;font-size:13px"><div style="white-space:pre-wrap">${esc(m.text)}</div><div style="font-size:10.5px;opacity:.65;text-align:right;margin-top:3px">${esc(m.kanal === 'whatsapp' ? 'WhatsApp' : 'SMS')} · ${esc(fmtTs(m.ts))} · ${esc(m.status)}</div></div>`).join('') : '<div class="muted" style="margin:auto;font-size:13px">Noch keine Nachrichten</div>'}</div>
        <div style="padding:12px 16px;border-top:1px solid var(--line);display:grid;gap:8px"><select class="input select" data-wact><option value="">Vorlage wählen …</option>${tpls.map(t => `<option value="${esc(t.id)}" ${WAC.tpl === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          <textarea class="input" rows="3" data-wacx style="height:auto;padding:9px 12px" placeholder="Nachricht …">${esc(WAC.text)}</textarea>
          <div style="display:flex;gap:8px;align-items:center"><span class="muted" style="font-size:12px;flex:1">${kanal === 'sms' ? `${WAC.text.length} Zeichen · ${Math.max(1, Math.ceil(WAC.text.length / 160))} SMS` : 'Platzhalter: {vorname} {name} {punkte} {firma}'}</span><button class="btn btn-primary" data-wacsend ${custPhone(c) ? '' : 'disabled'}>${ic('chat', 'i-sm')}Senden</button></div></div>`
        : `<div class="empty" style="margin:auto;padding:48px 20px"><div class="empty-icon">${ic('chat')}</div><h3>Kunde wählen</h3><p>Links suchen oder aus der Liste wählen.</p></div>`}</div></div></div>`;
  const q = $('[data-wacq]', v); q.oninput = () => { WAC.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => renderMsgChat(page, kanal).then(() => { const x = $(`#view-${page} [data-wacq]`); x?.focus(); x?.setSelectionRange(x.value.length, x.value.length); }), 250); };
  v.onclick = async e => {
    const s = e.target.closest('[data-wacs]'); if (s) { WAC.cust = s.dataset.wacs; WAC.q = ''; return renderMsgChat(page, kanal); }
    if (!e.target.closest('[data-wacsend]')) return;
    const text = fillTpl(WAC.text, c).trim(); if (!text) return toast('Nachricht fehlt', {type: 'warn'});
    if (!c.consent && !await confirmBox(`${c.name} hat keine Einwilligung für Nachrichten erfasst. Trotzdem senden (z. B. Servicenachricht)?`)) return;
    const tpl = tpls.find(t => t.id === WAC.tpl);
    try {
      const r = await msgSend(kanal, [c], text, tpl?.meta ? {name: tpl.meta, sprache: tpl.sprache || 'de', parameter: ['{vorname}']} : null);
      if (r.vorbereitet) invoke('open_url', {url: r.links[0].link}).catch(() => window.open(r.links[0].link, '_blank'));
      toast(r.gesendet ? 'Gesendet' : r.vorbereitet ? 'In WhatsApp geöffnet' : 'Nicht gesendet', {t2: r.fehler ? 'Fehler – siehe Protokoll' : '', type: r.fehler ? 'warn' : 'pos', icon: 'chat'});
      WAC.text = ''; WAC.tpl = ''; renderMsgChat(page, kanal);
    } catch (err) { toast('Nicht gesendet', {t2: String(err), type: 'warn'}); }
  };
  v.oninput = e => { if (e.target.matches('[data-wacx]')) WAC.text = e.target.value; };
  v.onchange = e => { if (e.target.matches('[data-wact]')) { WAC.tpl = e.target.value; const t = tpls.find(x => x.id === WAC.tpl); if (t) { WAC.text = t.text || ''; renderMsgChat(page, kanal); } } };
}

/* Massennachrichten / Marketing-Kampagnen */
const MM = {kanal: 'whatsapp', grp: '', tpl: '', text: ''};
registerPage('wa-massen', {title: 'Massennachrichten', sub: () => 'WhatsApp oder SMS an Kundengruppen', render: async () => {
  const v = $('#view-wa-massen'); await loadStamm();
  const g = stActive('kundengruppe').find(x => x.id === MM.grp), list = g ? groupMembers(g) : [], withTel = list.filter(c => custPhone(c));
  const tpls = MM.kanal === 'sms' ? stActive('smsvorlage') : stActive('watemplate');
  v.innerHTML = `<div class="cv">${pageHead('Massennachrichten', 'Eine Nachricht an eine Kundengruppe – nur Kund:innen mit Einwilligung, wenn in der Gruppe so eingestellt', `<button class="btn btn-secondary" data-goto="st-kundengruppe">${ic('users', 'i-sm')}Kundengruppen</button>`)}
    <div class="card" style="padding:18px;display:grid;gap:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><div class="seg" data-mmk>${[['whatsapp', 'WhatsApp'], ['sms', 'SMS']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${MM.kanal === k}">${l}</button>`).join('')}</div>
        <select class="input select" data-mmg style="width:auto"><option value="">Kundengruppe wählen …</option>${stActive('kundengruppe').map(x => `<option value="${esc(x.id)}" ${x.id === MM.grp ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <select class="input select" data-mmt style="width:auto"><option value="">Vorlage …</option>${tpls.map(t => `<option value="${esc(t.id)}" ${MM.tpl === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
      <textarea class="input" rows="4" data-mmx style="height:auto;padding:9px 12px" placeholder="Nachricht – Platzhalter {vorname} {name} {punkte} {firma}">${esc(MM.text)}</textarea>
      ${kpiCards([[num(list.length), 'in der Gruppe'], [num(withTel.length), 'mit Telefonnummer', withTel.length ? 'pos' : 'warn'], [MM.kanal === 'whatsapp' ? (CFG['whatsapp.token'] ? 'Business-API' : 'manuell (wa.me)') : (CFG['sms.url'] ? 'Gateway' : 'nicht eingerichtet'), 'Versandweg']])}
      ${withTel.length ? `<div style="font-size:13px;background:var(--surface-2);border-radius:12px;padding:10px 12px"><span class="muted">Vorschau für ${esc(withTel[0].name)}:</span><div style="white-space:pre-wrap;margin-top:4px">${esc(fillTpl(MM.text, withTel[0]))}</div></div>` : ''}
      <div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" data-mmsend ${withTel.length && MM.text.trim() ? '' : 'disabled'}>${ic('chat', 'i-sm')}An ${num(withTel.length)} senden</button></div></div></div>`;
  initSeg($('[data-mmk]', v), b => { MM.kanal = b.dataset.v; MM.tpl = ''; PAGES['wa-massen'].render(); });
  v.onchange = e => { const t = e.target; if (t.matches('[data-mmg]')) { MM.grp = t.value; PAGES['wa-massen'].render(); } if (t.matches('[data-mmt]')) { MM.tpl = t.value; MM.text = tpls.find(x => x.id === t.value)?.text || MM.text; PAGES['wa-massen'].render(); } };
  v.oninput = e => { if (e.target.matches('[data-mmx]')) MM.text = e.target.value; };
  v.onclick = async e => {
    if (!e.target.closest('[data-mmsend]')) return;
    if (!await confirmBox(`${MM.kanal === 'sms' ? 'SMS' : 'WhatsApp'} an ${withTel.length} Kund:innen senden?`, 'Senden')) return;
    try { await needPerm('marketing', 'Massennachricht'); const tpl = tpls.find(t => t.id === MM.tpl); const r = await msgSend(MM.kanal, withTel, MM.text, tpl?.meta ? {name: tpl.meta, sprache: tpl.sprache || 'de', parameter: ['{vorname}']} : null);
      Hooks.emit('marketing.massennachricht', {kanal: MM.kanal, gruppe: g?.name, gesendet: r.gesendet, vorbereitet: r.vorbereitet, fehler: r.fehler});
      toast(`${r.gesendet} gesendet${r.vorbereitet ? ` · ${r.vorbereitet} vorbereitet` : ''}${r.fehler ? ` · ${r.fehler} Fehler` : ''}`, {type: r.fehler ? 'warn' : 'pos', icon: 'chat'});
      if (r.links?.length) showWaLinks(r.links);
    } catch (err) { toast('Nicht gesendet', {t2: String(err), type: 'warn'}); }
  };
}});
VIEW_PERM['wa-massen'] = 'marketing';
function msgLogPage(id, title, sub, kanal) {
  registerPage(id, {title, sub: () => sub.split(' – ')[0], render: async () => {
    const v = $('#view-' + id);
    if (!DESKTOP) { v.innerHTML = desktopEmpty('chat', title); return; }
    let l = []; try { l = await invoke('msg_list', {kanal, limit: 5000}); } catch { /* */ }
    v.innerHTML = `<div class="cv">${pageHead(title, sub)}${kpiCards([[num(l.length), 'Nachrichten'], [num(l.filter(m => m.status === 'gesendet').length), 'gesendet', 'pos'], [num(l.filter(m => m.status === 'vorbereitet').length), 'vorbereitet'], [num(l.filter(m => m.status === 'fehler').length), 'Fehler', 'neg']])}
      <div class="card" style="overflow:auto">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Kanal</th><th>An</th><th>Text</th><th>Status</th><th style="padding-right:16px">von</th></tr></thead><tbody>${l.slice(0, 1000).map(m => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(m.ts))}</td><td>${esc(m.kanal === 'whatsapp' ? 'WhatsApp' : 'SMS')}</td><td class="mono" style="font-size:12px">${esc(m.an)}</td><td style="max-width:420px;font-size:12.5px">${esc(m.text.slice(0, 160))}</td><td><span class="pill ${m.status === 'gesendet' ? 'pos' : m.status === 'fehler' ? 'neg' : ''}" style="height:20px">${esc(m.status)}</span>${m.status === 'fehler' ? `<div style="font-size:11px;color:var(--neg)">${esc(m.info.slice(0, 120))}</div>` : ''}</td><td style="padding-right:16px">${esc(m.user || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:40px 20px"><h3>Noch keine Nachrichten</h3></div>'}</div></div>`;
  }});
  VIEW_PERM[id] = 'marketing';
}
msgLogPage('kunden-kommunikation', 'Kunden-Kommunikation', 'Alle WhatsApp- und SMS-Nachrichten an Kund:innen – E-Mails stehen im Protokoll', null);
msgLogPage('sms-protokoll', 'Protokoll SMS', 'Versendete SMS mit Status des Gateways', 'sms');
registerPage('wa-kampagnen', {title: 'Marketing-Kampagnen (WhatsApp)', sub: () => 'Versendete Massennachrichten', render: async () => {
  const v = $('#view-wa-kampagnen');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('chat', 'Kampagnen'); return; }
  let l = []; try { l = (await invoke('audit_query', {q: null, prefix: 'marketing.massennachricht', before: null, limit: 500})); } catch { /* */ }
  v.innerHTML = `<div class="cv">${pageHead('Marketing-Kampagnen (WhatsApp)', 'Massennachrichten über WhatsApp und SMS – E-Mail-Kampagnen unter Marketing › Kampagnen', `<button class="btn btn-primary" data-goto="wa-massen">${ic('plus', 'i-sm')}Neue Massennachricht</button><button class="btn btn-secondary" data-goto="kampagnen">${ic('mail', 'i-sm')}E-Mail-Kampagnen</button>`)}
    <div class="card">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Kanal</th><th>Gruppe</th><th class="r">gesendet</th><th class="r">vorbereitet</th><th class="r" style="padding-right:16px">Fehler</th></tr></thead><tbody>${l.map(e => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(e.ts))}</td><td>${esc(e.payload?.kanal || '')}</td><td>${esc(e.payload?.gruppe || '–')}</td><td class="r num">${e.payload?.gesendet ?? 0}</td><td class="r num">${e.payload?.vorbereitet ?? 0}</td><td class="r num" style="padding-right:16px">${e.payload?.fehler ?? 0}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:40px 20px"><h3>Noch keine Kampagnen</h3></div>'}</div></div>`;
}});
VIEW_PERM['wa-kampagnen'] = 'marketing';
registerPage('nachrichten-einstellungen', {title: 'WhatsApp & SMS Einstellungen', sub: () => 'Zugänge für den Versand', render: () => {
  const v = $('#view-nachrichten-einstellungen');
  const f = (k, l, h, type = 'text') => `<div class="set-row"><div><div class="set-l">${l}</div>${h ? `<div class="set-h">${h}</div>` : ''}</div><div class="set-c"><input class="input" type="${type}" data-nset="${k}" value="${esc(CFG[k] || '')}" style="min-width:280px" autocomplete="off"></div></div>`;
  v.innerHTML = `<div class="cv">${pageHead('WhatsApp & SMS Einstellungen', 'Zugangsdaten werden nur lokal in der Kontor-Datenbank gespeichert')}
    <div class="card" style="margin-bottom:14px"><div class="set-row"><div class="set-l">WhatsApp Business (Cloud API von Meta)</div></div>${f('whatsapp.phone_id', 'Telefonnummer-ID', 'aus dem Meta-Business-Konto (WhatsApp › API-Einrichtung)')}${f('whatsapp.token', 'Zugriffstoken', 'Dauerhaftes Token eines Systembenutzers', 'password')}${f('whatsapp.api', 'API-Adresse (optional)', 'Standard: https://graph.facebook.com/v21.0')}
      <div class="set-row"><div class="set-h">Ohne Zugang öffnet Kontor die Nachricht in WhatsApp (wa.me) – Versand dann manuell. Für Werbung außerhalb von 24 h verlangt Meta freigegebene Templates (Feld „Meta-Template-Name“).</div></div></div>
    <div class="card" style="margin-bottom:14px"><div class="set-row"><div class="set-l">SMS-Gateway (HTTP)</div></div>${f('sms.url', 'Gateway-Adresse', 'POST mit JSON {to, from, text} – z. B. Ihr Anbieter oder ein eigener Dienst')}${f('sms.token', 'API-Token', 'wird als „Authorization: Bearer …“ gesendet', 'password')}${f('sms.absender', 'Absender', 'Name oder Nummer, max. 11 Zeichen')}</div>
    <div class="card">${f('nachricht.landesvorwahl', 'Landesvorwahl', 'für Nummern ohne +, z. B. 43 für Österreich')}</div></div>`;
  v.onchange = async e => { const k = e.target.dataset.nset; if (k) await saveSettings({[k]: e.target.value.trim()}); };
}});
VIEW_PERM['nachrichten-einstellungen'] = 'einstellungen';

/* ── Zeiterfassung ── */
const ZE = {von: dIso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), bis: today(), list: []};
const zeDur = z => { if (!z.ende) return null; return Math.max(0, (new Date(z.ende) - new Date(z.start)) / 6e4 - (z.pause || 0)); };
const zeFmt = m => m == null ? 'läuft' : `${Math.floor(m / 60)}:${pad(Math.round(m % 60))} h`;
registerPage('zeiterfassung', {title: 'Zeiterfassung', sub: () => 'Kommen und Gehen', render: async () => {
  const v = $('#view-zeiterfassung');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('clock', 'Zeiterfassung'); return; }
  try { ZE.list = await invoke('zeit_list', {von: ZE.von, bis: ZE.bis}); } catch (e) { ZE.list = []; }
  const mine = ZE.list.find(z => z.user === S.user.name && !z.ende), lead = canApprove(S.user);
  const rows = lead ? ZE.list : ZE.list.filter(z => z.user === S.user.name);
  const sum = {}; rows.forEach(z => { sum[z.user] = (sum[z.user] || 0) + (zeDur(z) || 0); });
  v.innerHTML = `<div class="cv">${pageHead('Zeiterfassung', 'Stempeluhr für alle Mitarbeiter:innen – Leitung kann korrigieren (wird gekennzeichnet)', `${lead ? `<button class="btn btn-secondary" data-zenew>${ic('plus', 'i-sm')}Eintrag nachtragen</button><button class="btn btn-secondary" data-zecsv>${ic('upload', 'i-sm')}CSV</button>` : ''}`)}
    <div class="card" style="padding:22px;display:flex;align-items:center;gap:18px;margin-bottom:14px"><div style="width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:${mine ? 'var(--pos)' : 'var(--surface-2)'};color:${mine ? '#fff' : 'inherit'}">${ic('clock')}</div><div style="flex:1"><div style="font-size:18px;font-weight:650">${esc(S.user.name)}</div><div class="muted">${mine ? `anwesend seit ${new Date(mine.start).toLocaleTimeString('de-AT', {hour: '2-digit', minute: '2-digit'})}` : 'nicht eingestempelt'}</div></div><button class="btn btn-${mine ? 'danger' : 'primary'}" data-zestamp style="height:48px;padding:0 22px">${mine ? 'Gehen' : 'Kommen'}</button></div>
    <div class="filters"><input class="input" type="date" data-zev value="${ZE.von}" style="width:auto"><span class="muted">bis</span><input class="input" type="date" data-zeb value="${ZE.bis}" style="width:auto"></div>
    ${kpiCards(Object.entries(sum).slice(0, 8).map(([u, m]) => [zeFmt(m), u]))}
    <div class="card" style="overflow:auto">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Person</th><th>Tag</th><th>Kommen</th><th>Gehen</th><th class="r">Pause</th><th class="r">Dauer</th><th>Notiz</th><th class="r" style="padding-right:16px"></th></tr></thead><tbody>${rows.map(z => `<tr><td style="padding-left:16px"><b>${esc(z.user)}</b></td><td class="num">${esc(dDate(z.start))}</td><td class="num">${new Date(z.start).toLocaleTimeString('de-AT', {hour: '2-digit', minute: '2-digit'})}</td><td class="num">${z.ende ? new Date(z.ende).toLocaleTimeString('de-AT', {hour: '2-digit', minute: '2-digit'}) : '<span class="pill pos" style="height:20px">anwesend</span>'}</td><td class="r num">${z.pause || 0} min</td><td class="r num" style="font-weight:600">${zeFmt(zeDur(z))}</td><td style="font-size:12px">${esc(z.notiz || '')}${z.geaendert ? `<div class="muted" style="font-size:11px">korrigiert: ${esc(z.geaendert)}</div>` : ''}</td><td class="r" style="padding-right:12px">${lead ? `<button class="btn btn-ghost btn-sm" data-zeedit="${z.id}">${ic('edit', 'i-sm')}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:40px 20px"><h3>Keine Einträge im Zeitraum</h3></div>'}</div></div>`;
  v.onchange = e => { if (e.target.matches('[data-zev]')) { ZE.von = e.target.value; PAGES.zeiterfassung.render(); } if (e.target.matches('[data-zeb]')) { ZE.bis = e.target.value; PAGES.zeiterfassung.render(); } };
  v.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.zestamp != null) { try { const r = await invoke('zeit_stempel', {user: S.user.name}); toast(r.status === 'gekommen' ? 'Eingestempelt' : 'Ausgestempelt', {t2: `${S.user.name} · ${new Date().toLocaleTimeString('de-AT', {hour: '2-digit', minute: '2-digit'})}`, type: 'pos', icon: 'clock'}); PAGES.zeiterfassung.render(); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } return; }
    if (b.dataset.zecsv != null) { const csv = '﻿Person;Kommen;Gehen;Pause min;Dauer min;Notiz\r\n' + rows.map(z => [z.user, z.start, z.ende || '', z.pause || 0, Math.round(zeDur(z) || 0), `"${(z.notiz || '').replace(/"/g, '""')}"`].join(';')).join('\r\n'); try { const p = await invoke('save_text', {name: `Zeiterfassung_${ZE.von}_${ZE.bis}.csv`, content: csv, title: 'Zeiterfassung exportieren'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Export fehlgeschlagen', {t2: String(err), type: 'warn'}); } return; }
    if (b.dataset.zeedit != null || b.dataset.zenew != null) {
      const z = b.dataset.zeedit ? ZE.list.find(x => x.id === +b.dataset.zeedit) : {user: STAFF[0]?.name, start: new Date().toISOString(), ende: null, pause: 0, notiz: ''};
      const loc = s => s ? (() => { const d = new Date(s); return `${dIso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; })() : '';
      const el = openLayer(`<div class="modal" style="width:min(460px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('clock')}</div><div><h2>${z.id ? 'Eintrag korrigieren' : 'Eintrag nachtragen'}</h2><p>Änderungen werden mit Ihrem Namen gekennzeichnet</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
        <div class="m-body" style="display:grid;gap:12px">${z.id ? '' : `<label class="field"><span>Person</span><select class="input select" data-zu>${STAFF.map(s => `<option>${esc(s.name)}</option>`).join('')}</select></label>`}<label class="field"><span>Kommen</span><input class="input" type="datetime-local" data-zs value="${loc(z.start)}"></label><label class="field"><span>Gehen</span><input class="input" type="datetime-local" data-ze value="${loc(z.ende)}"></label><label class="field"><span>Pause (Minuten)</span><input class="input num" data-zp value="${z.pause || 0}"></label><label class="field"><span>Notiz</span><input class="input" data-zn value="${esc(z.notiz || '')}"></label></div>
        <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-zgo>${ic('check', 'i-sm')}Speichern</button></div></div>`);
      $('[data-zgo]', el).onclick = async () => {
        const iso = s => s ? new Date(s).toISOString() : null;
        try { await invoke('zeit_save', {entry: {id: z.id || null, user: z.id ? z.user : $('[data-zu]', el).value, start: iso($('[data-zs]', el).value), ende: iso($('[data-ze]', el).value), pause: +$('[data-zp]', el).value || 0, notiz: $('[data-zn]', el).value}, user: S.user.name}); closeLayer(el); PAGES.zeiterfassung.render(); } catch (err) { toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      };
    }
  };
}});

/* ── Inventur: Protokoll, Erfassungspool, Einstellungen ── */
registerPage('inventur-protokoll', {title: 'Inventur Protokoll', sub: () => 'Alle Inventuren', render: async () => {
  const v = $('#view-inventur-protokoll');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('layers', 'Inventur'); return; }
  let l = [], ev = []; try { [l, ev] = await Promise.all([invoke('inventory_list'), invoke('audit_query', {q: null, prefix: 'inventory.', before: null, limit: 500})]); } catch { /* */ }
  v.innerHTML = `<div class="cv">${pageHead('Inventur Protokoll', 'Abgeschlossene und verworfene Inventuren mit Differenzen', `<button class="btn btn-primary" data-goto="inventur">${ic('layers', 'i-sm')}Zur Inventur</button>`)}
    <div class="card" style="margin-bottom:14px">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Nummer</th><th>von</th><th>Status</th><th>gestartet</th><th style="padding-right:16px">abgeschlossen</th></tr></thead><tbody>${l.map(i => `<tr><td style="padding-left:16px"><b class="mono">${esc(i.no)}</b></td><td>${esc(i.user || '')}</td><td><span class="pill ${i.status === 'abgeschlossen' ? 'pos' : i.status === 'offen' ? 'warn' : ''}" style="height:20px">${esc(i.status)}</span></td><td class="muted num">${esc(fmtTs(i.created_at || ''))}</td><td class="muted num" style="padding-right:16px">${esc(i.closed_at ? fmtTs(i.closed_at) : '–')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:40px 20px"><h3>Noch keine Inventur</h3></div>'}</div>
    <div class="card">${ev.length ? `<table class="tbl" style="margin:0"><tbody>${ev.map(e => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(e.ts))}</td><td><b>${esc(e.event)}</b></td><td style="font-size:12.5px">${esc(Object.entries(e.payload || {}).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · '))}</td></tr>`).join('')}</tbody></table>` : ''}</div></div>`;
}});
const POOL = {ort: '', q: '', items: persist.get('inventurPool', [])};
const poolSave = () => persist.set('inventurPool', POOL.items);
registerPage('inventur-pool', {title: 'Erfassungspool', sub: () => `${POOL.items.length} Zählungen`, render: async () => {
  const v = $('#view-inventur-pool'); await loadStamm();
  const sum = {}; POOL.items.forEach(i => { sum[i.ean] = (sum[i.ean] || 0) + i.qty; });
  v.innerHTML = `<div class="cv">${pageHead('Erfassungspool', 'Zählungen je Inventurort vorab sammeln (z. B. am Abend vorher, mehrere Teams) – dann gesammelt in die offene Inventur übernehmen', `<button class="btn btn-primary" data-pltake ${POOL.items.length ? '' : 'disabled'}>${ic('check', 'i-sm')}In Inventur übernehmen</button>`)}
    <div class="card" style="padding:16px;margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center"><select class="input select" data-plo style="width:auto"><option value="">Inventurort …</option>${stActive('inventurort').map(o => `<option value="${esc(o.id)}" ${POOL.ort === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
      <label class="search-field" style="height:44px;flex:1;min-width:240px">${ic('barcode')}<input data-plq placeholder="EAN scannen (Enter = +1) oder „5*EAN“" autocomplete="off"></label><button class="btn btn-ghost" data-goto="st-inventurort">${ic('grid', 'i-sm')}Orte</button></div>
    ${kpiCards([[num(POOL.items.length), 'Scans'], [num(Object.keys(sum).length), 'Varianten'], [num(Object.values(sum).reduce((s, x) => s + x, 0)), 'Teile']])}
    <div class="card" style="overflow:auto">${POOL.items.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Ort</th><th>EAN</th><th>Artikel</th><th class="r">Menge</th><th class="r" style="padding-right:16px"></th></tr></thead><tbody>${POOL.items.slice().reverse().slice(0, 500).map(i => { const f = findEan(i.ean); return `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(i.ts))}</td><td>${esc(stName('inventurort', i.ort) || '–')}</td><td class="mono">${esc(i.ean)}</td><td>${f ? `${esc(f.a.name)} <span class="muted">${esc(vname(f.v))}</span>` : '<span style="color:var(--neg)">unbekannt</span>'}</td><td class="r num">${i.qty}</td><td class="r" style="padding-right:12px"><button class="btn btn-ghost btn-icon btn-sm" data-pldel="${esc(i.id)}" aria-label="Löschen">${ic('trash', 'i-sm')}</button></td></tr>`; }).join('')}</tbody></table>` : '<div class="empty" style="padding:40px 20px"><div class="empty-icon">' + ic('barcode') + '</div><h3>Noch keine Zählungen</h3><p>Ort wählen und scannen.</p></div>'}</div></div>`;
  const q = $('[data-plq]', v); setTimeout(() => q?.focus(), 50);
  q.onkeydown = e => { if (e.key !== 'Enter') return; const raw = q.value.trim(); if (!raw) return; const m = /^(\d+)\*(\d{8,14})$/.exec(raw); const ean = m ? m[2] : raw, qty = m ? +m[1] : 1; if (!findEan(ean)) toast('EAN unbekannt – trotzdem erfasst', {t2: ean, type: 'warn', icon: 'barcode'}); POOL.items.push({id: uid(), ts: new Date().toISOString(), ort: POOL.ort, ean, qty, user: S.user.name}); poolSave(); PAGES['inventur-pool'].render(); };
  v.onchange = e => { if (e.target.matches('[data-plo]')) { POOL.ort = e.target.value; } };
  v.onclick = async e => {
    const d = e.target.closest('[data-pldel]'); if (d) { POOL.items = POOL.items.filter(i => i.id !== d.dataset.pldel); poolSave(); return PAGES['inventur-pool'].render(); }
    if (!e.target.closest('[data-pltake]')) return;
    if (!DESKTOP) return toast('Nur in der Desktop-App', {type: 'warn'});
    let inv; try { const l = await invoke('inventory_list'); const open = l.find(i => i.status === 'offen'); inv = open ? await invoke('inventory_get', {id: open.id}) : null; } catch { /* */ }
    if (!inv) return toast('Keine offene Inventur', {t2: 'Erst unter Artikel › Bestand › Inventur starten', type: 'warn'});
    let ok = 0, bad = 0; for (const [ean, qty] of Object.entries(sum)) { try { await invoke('inventory_count', {id: inv.id, ean, variantId: null, qty, add: true}); ok++; } catch { bad++; } }
    POOL.items = POOL.items.filter(i => !findEan(i.ean)); poolSave();
    Hooks.emit('inventory.pool', {inventur: inv.no, varianten: ok, fehler: bad});
    toast(`${ok} Varianten übernommen`, {t2: bad ? `${bad} unbekannte EAN bleiben im Pool` : `in ${inv.no}`, type: bad ? 'warn' : 'pos', icon: 'check'}); PAGES['inventur-pool'].render();
  };
}});
registerPage('inventur-einstellungen', {title: 'Inventur Einstellungen', sub: () => 'Zählweise und Bewertung', render: () => {
  const v = $('#view-inventur-einstellungen');
  const sw = (k, l, h) => `<div class="set-row"><div><div class="set-l">${l}</div><div class="set-h">${h}</div></div><div class="set-c"><button class="switch" role="switch" data-ivs="${k}" aria-checked="${!!CFG[k]}"></button></div></div>`;
  v.innerHTML = `<div class="cv">${pageHead('Inventur Einstellungen', 'Vorgaben für Zählung und Abschluss')}<div class="card">${sw('inventur.blind', 'Blindzählung', 'Sollbestand während der Zählung ausblenden – Zähler sehen nur ihre Eingaben')}${sw('inventur.nullen', 'Nicht gezählte Varianten auf 0 setzen (Vorgabe)', 'Beim Abschluss voreingestellt – kann je Inventur geändert werden')}</div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-secondary" data-goto="st-inventurort">${ic('grid', 'i-sm')}Inventurorte</button><button class="btn btn-secondary" data-goto="st-altersbewertung">${ic('percent', 'i-sm')}Altersbewertung Prozentsätze</button><button class="btn btn-secondary" data-goto="altersbewertung">${ic('chart', 'i-sm')}Bewerteter Lagerwert</button></div></div>`;
  v.onclick = async e => { const b = e.target.closest('[data-ivs]'); if (!b) return; const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on); await saveSettings({[b.dataset.ivs]: on}); };
}});
Object.assign(VIEW_PERM, {'inventur-protokoll': 'bestand.buchen', 'inventur-pool': 'bestand.buchen', 'inventur-einstellungen': 'einstellungen'});
// Blindzählung: Sollspalte in der Inventur ausblenden
{ const st = document.createElement('style'); st.textContent = 'body.inv-blind #view-inventur .tbl th:nth-child(3),body.inv-blind #view-inventur .tbl td:nth-child(3),body.inv-blind #view-inventur .tbl th:nth-child(5),body.inv-blind #view-inventur .tbl td:nth-child(5){visibility:hidden}'; document.head.appendChild(st); }

/* ── Einstellungen: Nummernkreise, Buchungsabschluss, Prozesskonfiguration, Styling, EK-Code, ESL ── */
registerPage('nummernkreise', {title: 'Nummernkreise', sub: () => 'Belegnummern je Vorgangsart', render: async () => {
  const v = $('#view-nummernkreise');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('list', 'Nummernkreise'); return; }
  let docs = []; try { docs = await invoke('doc_list', {kinds: Object.keys(DK), status: null, limit: 100000}); } catch { /* */ }
  const by = {}; docs.forEach(d => { const x = by[d.kind] ||= {n: 0, last: ''}; x.n++; if (d.no > x.last) x.last = d.no; });
  v.innerHTML = `<div class="cv">${pageHead('Nummernkreise', 'Fortlaufende, lückenlose Nummern je Vorgangsart (Präfix-Jahr-Zähler) – Kassenbelege laufen über den RKSV-Zähler')}
    <div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Vorgangsart</th><th>Präfix</th><th class="r">Anzahl</th><th style="padding-right:16px">letzte Nummer</th></tr></thead><tbody><tr><td style="padding-left:16px"><b>Kassenbeleg</b></td><td class="mono">–</td><td class="r num">–</td><td class="mono" style="padding-right:16px">${esc(POS.no ? String(POS.no) : '–')} (nächster)</td></tr>${Object.entries(DK).map(([k, K]) => `<tr><td style="padding-left:16px"><b>${esc(K.one)}</b></td><td class="mono">${esc((by[k]?.last || '').split('-')[0] || '–')}</td><td class="r num">${num(by[k]?.n || 0)}</td><td class="mono" style="padding-right:16px">${esc(by[k]?.last || '–')}</td></tr>`).join('')}</tbody></table></div></div>`;
}});
registerPage('buchungsabschluss', {title: 'Buchungsabschluss', sub: () => 'Monatsabschluss', render: async () => {
  const v = $('#view-buchungsabschluss');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('lock', 'Buchungsabschluss'); return; }
  let cl = []; try { cl = await invoke('closings_list'); } catch { /* */ }
  const by = {}; cl.forEach(z => { const m = String(z.ts || z.created_at || '').slice(0, 7); const x = by[m] ||= {n: 0, umsatz: 0, diff: 0}; x.n++; x.umsatz += z.data?.revenue ?? 0; x.diff += z.diff ?? 0; });
  v.innerHTML = `<div class="cv">${pageHead('Buchungsabschluss', 'Monate mit ihren Tagesabschlüssen – Grundlage für FiBu-Export und DEP-Export', `<button class="btn btn-secondary" data-goto="tagesabschluesse">${ic('lock', 'i-sm')}Tagesabschlüsse</button><button class="btn btn-primary" data-goto="buchhaltung">${ic('upload', 'i-sm')}FiBu-Export</button>`)}
    <div class="card">${Object.keys(by).length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Monat</th><th class="r">Tagesabschlüsse</th><th class="r">Umsatz</th><th class="r" style="padding-right:16px">Kassendifferenz</th></tr></thead><tbody>${Object.entries(by).sort((a, b) => b[0].localeCompare(a[0])).map(([m, x]) => `<tr><td style="padding-left:16px"><b>${esc(m)}</b></td><td class="r num">${x.n}</td><td class="r num">${cEur(x.umsatz)}</td><td class="r num" style="padding-right:16px;color:${x.diff ? 'var(--warn)' : 'inherit'}">${cEur(x.diff)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:40px 20px"><h3>Noch keine Tagesabschlüsse</h3></div>'}</div></div>`;
}});
registerPage('prozesskonfiguration', {title: 'Prozesskonfiguration', sub: () => 'Abläufe je Bereich', render: () => {
  const v = $('#view-prozesskonfiguration');
  const P = [['Artikel', 'tag', [['artikel-import', 'Artikel-Import'], ['ean-zuordnung', 'EAN-Zuordnung'], ['st-artikelmerkmal', 'Artikelmerkmale'], ['st-preisrundung', 'Preisrundung'], ['st-groessenschluessel', 'Größenschlüssel']]],
    ['Order', 'truck', [['order-typen', 'Order Typen'], ['order-konfig', 'Vorschlags-Konfiguration'], ['st-orderkategorie', 'Orderkategorie'], ['st-zahlungsbedingung', 'Zahlungsbedingungen']]],
    ['Wareneingang', 'download', [['verteilung-konfig', 'Verteilungs-Konfiguration'], ['we-scanner', 'Scanner Wareneingang'], ['st-etikettentyp', 'Etikettentypen']]],
    ['Faktura', 'idcard', [['st-formular', 'Formulareinstellungen'], ['mahnwesen', 'Mahnwesen'], ['nummernkreise', 'Nummernkreise']]],
    ['Lieferanten', 'building', [['lieferanten', 'Lieferanten'], ['st-edilieferant', 'EDI-Einstellungen'], ['lieferantenbonus', 'Lieferantenbonus']]],
    ['Retouren', 'undo', [['rueckgabegruende', 'Rückgabegründe'], ['st-retourentyp', 'Retourentypen']]],
    ['Kunden', 'users', [['bonus-kalkulation', 'Bonus'], ['st-kundenmerkmal', 'Kundenmerkmale'], ['st-preisgruppe', 'Preisgruppen'], ['nachrichten-einstellungen', 'WhatsApp & SMS']]],
    ['Etikettendruck', 'printer', [['etiketten', 'Etikettendruck'], ['st-etikettendrucker', 'Etikettendrucker'], ['st-esl', 'Elektronische Etiketten']]],
    ['EDI', 'swap', [['edi-verbindung', 'Verbindungs-Verwaltung'], ['st-edijob', 'Hintergrundjobs'], ['st-edimapwg', 'Zuordnung Warengruppen']]],
    ['Umlagerungen', 'swap', [['ul-planung', 'Umlagerungsplanung'], ['nachsort-param', 'Parameter Nachsortierung']]],
    ['Fiskalisierung', 'shield', [['fiskal-kassen', 'Fiskalisierte Kassen'], ['einstellungen', 'RKSV-Einstellungen']]]];
  v.innerHTML = `<div class="cv">${pageHead('Prozesskonfiguration', 'Alle Stellschrauben je Prozess an einem Ort')}<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">${P.map(([t, i, l]) => `<div class="card" style="padding:14px 16px"><div style="display:flex;gap:8px;align-items:center;font-weight:650;margin-bottom:8px">${ic(i, 'i-sm')}${esc(t)}</div>${l.map(([id, n]) => `<button class="pal-i" data-goto="${id}" style="height:36px"><span style="flex:1;text-align:left">${esc(n)}</span>${ic('chevron-right', 'i-sm')}</button>`).join('')}</div>`).join('')}</div></div>`;
}});
registerPage('styling', {title: 'Styling', sub: () => 'Darstellung Auswahllisten', render: () => {
  const v = $('#view-styling');
  v.innerHTML = `<div class="cv">${pageHead('Styling – Darstellung Auswahllisten', 'Wie Listen und Tabellen aussehen – gilt für diesen Arbeitsplatz', `<button class="btn btn-secondary" data-goto="einstellungen">${ic('palette', 'i-sm')}Farben & Design</button>`)}<div class="card">
    <div class="set-row"><div><div class="set-l">Zeilenhöhe</div><div class="set-h">Kompakt zeigt mehr Zeilen auf einmal</div></div><div class="set-c"><div class="seg" data-sty>${[['normal', 'Normal'], ['kompakt', 'Kompakt']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${CFG['liste.dichte'] === k}">${l}</button>`).join('')}</div></div></div>
    <div class="set-row"><div><div class="set-l">Zebra-Streifen</div><div class="set-h">Jede zweite Zeile hinterlegt</div></div><div class="set-c"><button class="switch" role="switch" data-styz aria-checked="${!!CFG['liste.zebra']}"></button></div></div>
    <div class="set-row"><div><div class="set-l">Menü als Akkordeon</div><div class="set-h">Nur der aktuelle Bereich bleibt aufgeklappt</div></div><div class="set-c"><button class="switch" role="switch" data-styacc aria-checked="${prefs.navAkkordeon !== false}"></button></div></div></div>
    <div class="card" style="margin-top:14px"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Vorschau</th><th class="r" style="padding-right:16px">Wert</th></tr></thead><tbody>${['Erste Zeile', 'Zweite Zeile', 'Dritte Zeile', 'Vierte Zeile'].map((x, i) => `<tr><td style="padding-left:16px">${x}</td><td class="r num" style="padding-right:16px">${eur((i + 1) * 49.95)}</td></tr>`).join('')}</tbody></table></div></div>`;
  initSeg($('[data-sty]', v), async b => { await saveSettings({'liste.dichte': b.dataset.v}, true); applyListStyle(); });
  v.onclick = async e => {
    const z = e.target.closest('[data-styz]'); if (z) { const on = z.getAttribute('aria-checked') !== 'true'; z.setAttribute('aria-checked', on); await saveSettings({'liste.zebra': on}, true); applyListStyle(); }
    const a = e.target.closest('[data-styacc]'); if (a) { const on = a.getAttribute('aria-checked') !== 'true'; a.setAttribute('aria-checked', on); prefs.navAkkordeon = on; persist.set('prefs', prefs); }
  };
}});
registerPage('ek-verschluesselung', {title: 'EK Verschlüsselung', sub: () => CFG['ek.verschluesselt'] ? 'aktiv' : 'aus', render: () => {
  const v = $('#view-ek-verschluesselung');
  const code = String(CFG['ek.code'] || ''), ok = code.length === 10 && new Set(code.toUpperCase()).size === 10;
  v.innerHTML = `<div class="cv">${pageHead('EK Verschlüsselung', 'Einkaufspreise vor Kund:innen verbergen: statt Ziffern wird ein Codewort mit 10 verschiedenen Buchstaben angezeigt (1. Buchstabe = 1 … 10. Buchstabe = 0)')}<div class="card">
    <div class="set-row"><div><div class="set-l">Codewort</div><div class="set-h">Genau 10 verschiedene Buchstaben, z. B. KONTRASTIE</div></div><div class="set-c"><input class="input mono" data-ekc value="${esc(code)}" maxlength="10" style="max-width:160px;text-transform:uppercase"></div></div>
    <div class="set-row"><div><div class="set-l">EK verschlüsselt anzeigen</div><div class="set-h">In Artikelinfo und Etiketten</div></div><div class="set-c"><button class="switch" role="switch" data-eks aria-checked="${!!CFG['ek.verschluesselt']}" ${ok ? '' : 'disabled'}></button></div></div>
    <div class="set-row"><div><div class="set-l">Beispiel € 123,45</div></div><div class="set-c"><b class="mono" style="font-size:18px">${esc(ok ? (() => { const c = code.toUpperCase(); return '12345'.split('').map(d => c[(+d + 9) % 10]).join(''); })() : '– Codewort ungültig –')}</b></div></div></div></div>`;
  v.onchange = async e => { if (e.target.matches('[data-ekc]')) { await saveSettings({'ek.code': e.target.value.trim().toUpperCase()}); PAGES['ek-verschluesselung'].render(); } };
  v.onclick = async e => { const b = e.target.closest('[data-eks]'); if (!b || b.disabled) return; const on = b.getAttribute('aria-checked') !== 'true'; await saveSettings({'ek.verschluesselt': on}); PAGES['ek-verschluesselung'].render(); };
}});
{ const _rs3 = renderStamm; renderStamm = async function (kind, page, extra = {}) {
  if (kind === 'esl' && !extra.above) extra = {...extra, above: () => `<div class="card" style="padding:12px 16px;margin-bottom:12px;display:flex;gap:10px;align-items:center">${ic('info', 'i-sm')}<span style="flex:1;font-size:13px">Preis-Export für das ESL-System (CSV: Etikett-ID; Artikel; Name; Preis; Aktionspreis) – nach Preisänderungen erneut exportieren oder als Hintergrundjob über den Ausgangsordner.</span><button class="btn btn-secondary btn-sm" data-eslx>${ic('upload', 'i-sm')}Preise exportieren</button></div>`};
  return _rs3(kind, page, extra);
}; }
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-eslx]')) return;
  const csv = '﻿Etikett;Artikel;Name;Preis;Aktionspreis\r\n' + stActive('esl').map(r => { const a = artById(r.artikel); return [r.name || r.id, r.artikel, `"${(a?.name || '').replace(/"/g, '""')}"`, a ? String(a.price).replace('.', ',') : '', a?.sale ? String(a.sale).replace('.', ',') : ''].join(';'); }).join('\r\n');
  try { const p = CFG['edi.export_dir'] ? await invoke('edi_write', {which: 'export', name: `ESL_${today()}.csv`, content: csv, user: S.user.name}) : await invoke('save_text', {name: `ESL_${today()}.csv`, content: csv, title: 'ESL-Preise exportieren'}); if (p) toast('ESL-Preise exportiert', {t2: p, type: 'pos', icon: 'upload'}); } catch (err) { toast('Export fehlgeschlagen', {t2: String(err), type: 'warn'}); }
});
Object.assign(VIEW_PERM, {nummernkreise: 'einstellungen', buchungsabschluss: 'berichte', prozesskonfiguration: 'einstellungen', 'ek-verschluesselung': 'einstellungen'});

/* Weiterleitungen in die bestehenden Einstellungs-Bereiche */
function settingsLink(id, title, sec) {
  registerPage(id, {title, sub: () => 'Einstellungen', render: () => { const v = $('#view-' + id); v.innerHTML = `<div class="cv">${loadingCard('Öffne Einstellungen')}</div>`; setTimeout(() => { go('einstellungen'); setTimeout(() => $(`[data-sec="${sec}"]`, $('#view-einstellungen'))?.click(), 80); }, 30); }});
}
settingsLink('einst-allgemein', 'Allgemein', 'allgemein'); settingsLink('einst-kassen', 'Kassen', 'kasse'); settingsLink('einst-benutzer', 'Benutzer-Einstellungen', 'benutzer'); settingsLink('einst-update', 'Updateübersicht', 'updates'); settingsLink('einst-zahlungsarten', 'Zahlungsarten', 'kasse'); settingsLink('einst-buchungslogik', 'Buchungslogik', 'bon');

/* ── Kasse: Beleg-Zusatzinformationen, Scanner-Regeln, Artikelservice, Preisgruppen ── */
{ const _op = openPayment; openPayment = function (...args) {
  const fields = stActive('belegzusatz');
  if (!fields.length || !POS.cart.length || POS.zusatz) return _op.apply(this, args);
  const el = openLayer(`<div class="modal" style="width:min(460px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('receipt')}</div><div><h2>Zusatzinformationen zum Beleg</h2><p>Erscheinen auf dem Beleg und in Auswertungen</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:12px">${fields.map(f => `<label class="field"><span>${esc(f.name)}${f.pflicht ? ' *' : ''}</span>${(f.werte || []).length || /hotel/i.test(f.name) ? `<select class="input select" data-bz="${esc(f.name)}"><option value="">–</option>${((f.werte || []).length ? f.werte : stActive('hotel').map(h => h.name)).map(w => `<option>${esc(w)}</option>`).join('')}</select>` : `<input class="input" data-bz="${esc(f.name)}">`}</label>`).join('')}</div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-bzskip>Überspringen</button><button class="btn btn-primary" data-bzgo>${ic('check', 'i-sm')}Weiter zur Zahlung</button></div></div>`, {focus: '[data-bz]'});
  const done = vals => { POS.zusatz = vals; closeLayer(el); _op.apply(this, args); };
  $('[data-bzskip]', el).onclick = () => { if (fields.some(f => f.pflicht)) return toast('Pflichtangaben fehlen', {type: 'warn'}); done({}); };
  $('[data-bzgo]', el).onclick = () => { const vals = {}; $$('[data-bz]', el).forEach(i => { if (i.value.trim()) vals[i.dataset.bz] = i.value.trim(); }); const miss = fields.filter(f => f.pflicht && !vals[f.name]); if (miss.length) return toast(`${miss.map(f => f.name).join(', ')} fehlt`, {type: 'warn'}); done(vals); };
}; }
{ const _rd2 = recData; recData = function (rec) { const d = _rd2(rec); const z = rec.zusatz || POS.zusatz; if (z && Object.keys(z).length) { d.zusatz = z; rec.zusatz = z; } return d; }; }
{ const _ns = newSale; newSale = function (...a) { POS.zusatz = null; return _ns.apply(this, a); }; }
{ const _he = handleEnter; handleEnter = function () {
  const input = $('#posSearch'), raw = input?.value.trim() || '';
  for (const r of typeof stActive === 'function' ? stActive('scannerregel') : []) {
    let m; try { m = new RegExp(r.muster).exec(raw); } catch { continue; }
    if (!m) continue;
    const part = m[+r.gruppe || 0] || raw;
    Hooks.emit('pos.scanner.regel', {regel: r.name, code: raw});
    if (r.aktion === 'artikel') { input.value = part; return _he(); }
    if (r.aktion === 'kunde') { const c = custById(part) || CUSTOMERS.find(x => x.fields?.Kundenkarte === part); if (!c) { toast('Kundenkarte unbekannt', {t2: part, type: 'warn'}); return; } POS.customer = c; input.value = ''; renderCart(); renderTopbar(); toast(`Kunde: ${c.name}`, {t2: `${num(c.points || 0)} Punkte`, icon: 'user', type: 'pos'}); return; }
    if (r.aktion === 'gutschein') { input.value = ''; if (DESKTOP) invoke('voucher_get', {code: part}).then(g => toast(`Gutschein ${g.code}`, {t2: `Restwert ${cEur(g.balance ?? g.remaining ?? 0)} – bei „Zahlen“ als Gutschein einlösen`, icon: 'gift', type: 'accent', dur: 7000})).catch(err => toast('Gutschein unbekannt', {t2: String(err), type: 'warn'})); return; }
    if (r.aktion === 'beleg') { input.value = ''; if (typeof BL === 'object') BL.q = part; go('belege'); return; }
  }
  return _he();
}; }
function applyServices() {
  for (const r of stActive('artikelservice')) { const x = SERVICES.find(s => s.id === 'ST-' + r.id); const o = {id: 'ST-' + r.id, name: r.name || r.id, price: +r.preis || 0, icon: 'wrench'}; if (x) Object.assign(x, o); else SERVICES.push(o); }
}
{ const _as = applyStamm; applyStamm = function () { _as(); applyServices(); applyListStyle(); document.body.classList.toggle('inv-blind', !!CFG['inventur.blind']); }; }
// Preisgruppe des Kunden: Rabatt an der Kasse vorschlagen
Hooks.on('pos.customer.attached', p => {
  const c = POS.customer, pg = c?.fields?.Preisgruppe; if (!pg || POS.billDisc) return;
  const g = stActive('preisgruppe').find(x => x.name === pg || x.id === pg); if (!g || !+g.pct) return;
  toast(`Preisgruppe ${g.name}: ${num(+g.pct)} %`, {t2: 'Als Bonrabatt übernehmen?', icon: 'percent', type: 'accent', dur: 8000, action: {label: 'Übernehmen', run: () => { POS.billDisc = {pct: +g.pct, reason: `Preisgruppe ${g.name}`, rule: true}; renderCart(); }}});
});

/* ── Service ── */
const RELEASES = [
  ['0.14.0', 'Kundenmanagement (Kundenerfassung, Anreden, Titel, Merkmale, Hotels, Bonus-Kalkulation), WhatsApp & SMS, Versand-Etiketten mit Tracking, Verleih, Flexanalyse mit Vorlagen und Zeitsteuerung, EDI (EDIFACT), Webshop-Schnittstelle, Inventur-Erfassungspool, Zeiterfassung, über 60 Stammdaten-Tabellen, Service-Menü'],
  ['0.13.0', 'Akkordeon-Menü, Artikelinfo Plus/Kompakt, Umlagerungen, NOS, Preisänderungen, Nachsortierung, Gutschein-PIN, Faktura-Untermenüs'],
  ['0.12.0', 'Einkauf (Order-Import, Avis, Rechnungsprüfung, SEPA, Retourenmanagement), Verkauf-Untermenüs, Digitales Schaufenster'],
  ['0.11.0', 'Filialverbund, Anmeldewege (Passwort, Windows Hello, QR, SSO), Erweiterungen, eigene Zahlungsarten'],
  ['0.10.0', 'Helles Design, neue Navigation, Dashboard-Widgets'], ['0.9.0', 'REST-API, Regeln, Webhooks, Rechte, Zwei-Faktor, KI, Buchhaltung, ZVT-Terminal'],
];
registerPage('release-notes', {title: 'Release Notes', sub: () => 'Was ist neu', render: () => { $('#view-release-notes').innerHTML = `<div class="cv">${pageHead('Release Notes', `Installiert: Kontor ${esc(S.appVersion || '')} – Updates kommen automatisch über System › Updates`, `<button class="btn btn-secondary" data-goto="einst-update">${ic('download', 'i-sm')}Nach Updates suchen</button>`)}${RELEASES.map(([v, t]) => `<div class="card" style="padding:16px 18px;margin-bottom:10px"><div style="display:flex;gap:10px;align-items:center"><b style="font-size:16px">Version ${v}</b>${v === S.appVersion ? '<span class="pill pos" style="height:22px">installiert</span>' : ''}</div><p style="margin:8px 0 0;font-size:13.5px;line-height:1.55">${esc(t)}</p></div>`).join('')}</div>`; }});
const GUIDES = [
  ['Erster Verkauf', 'register', 'kasse', ['Artikel scannen oder in der Suche tippen', 'Optional Kunde wählen (Punkte, Preisgruppe)', '„Zahlen“ – Bar, Karte oder Gutschein', 'Beleg drucken oder per E-Mail senden']],
  ['Ware einbuchen', 'download', 'avis', ['Lieferavis anlegen oder per EDI (DESADV) empfangen', '„Eingetroffen“ melden', 'Mengen prüfen, „Einbuchen“', 'Etiketten drucken']],
  ['Tagesabschluss', 'lock', 'kassenbuch', ['Kassenbuch öffnen', 'Bargeld zählen und eintragen', 'Abschluss erstellen – Z-Bon wird gedruckt', 'Datensicherung läuft automatisch']],
  ['Inventur', 'layers', 'inventur', ['Inventur starten (alle oder Warengruppe)', 'Zählen per Scanner – auch vorab im Erfassungspool', 'Differenzen prüfen', 'Abschließen mit Freigabe der Leitung']],
  ['WhatsApp an Stammkund:innen', 'chat', 'wa-massen', ['Kundengruppe anlegen (z. B. Umsatz ab € 1.000)', 'Vorlage wählen oder Text schreiben', 'Vorschau prüfen', 'Senden – Ergebnis im Protokoll']],
  ['EDI mit Lieferanten', 'swap', 'edi-verbindung', ['Eigene GLN und Ordner einrichten', 'GLN je Lieferant hinterlegen', 'PRICAT einlesen → Artikel-Import', 'DESADV/INVOIC → Avis und Eingangsrechnung']],
  ['Eigene Auswertung', 'chart', 'flexanalyse', ['Zeitraum wählen', 'Bis zu drei Dimensionen, Kennzahlen', 'Zeile anklicken für Drill-down', 'Als Vorlage speichern, per Mail zeitsteuern']],
];
registerPage('video-hilfe', {title: 'Video-Hilfe', sub: () => 'Schritt-für-Schritt-Anleitungen', render: () => {
  $('#view-video-hilfe').innerHTML = `<div class="cv">${pageHead('Video-Hilfe & Anleitungen', 'Die wichtigsten Abläufe Schritt für Schritt – „Öffnen“ springt direkt an die richtige Stelle')}<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">${GUIDES.map(([t, i, page, steps]) => `<div class="card" style="padding:16px"><div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><div style="width:38px;height:38px;border-radius:10px;background:var(--accent-soft);display:grid;place-items:center">${ic(i)}</div><b style="flex:1">${esc(t)}</b><button class="btn btn-secondary btn-sm" data-goto="${page}">${ic('play', 'i-sm')}Öffnen</button></div><ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.7">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>`).join('')}</div></div>`;
}});
registerPage('webinare', {title: 'Webinare & Anwendertage', sub: () => 'Schulungen', render: () => {
  $('#view-webinare').innerHTML = `<div class="cv">${pageHead('Webinare & Anwendertage', 'Schulungen für Ihr Team – intern mit den Anleitungen oder mit Ihrem Kontor-Ansprechpartner')}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">${[['Kasse kompakt', '45 min', 'Verkauf, Retoure, Gutscheine, Tagesabschluss – für neue Mitarbeiter:innen'], ['Einkauf & Wareneingang', '90 min', 'Order, Avis, EDI, Rechnungsprüfung, Etiketten'], ['Auswertungen', '60 min', 'Flexanalyse, Vorlagen, Zeitsteuerung, Power BI'], ['Kundenbindung', '60 min', 'Bonus, Kampagnen, WhatsApp & SMS, Schaufenster'], ['Jahresinventur', '45 min', 'Vorbereitung, Erfassungspool, Abschluss, Bewertung']].map(([t, d, x]) => `<div class="card" style="padding:16px"><div style="display:flex;justify-content:space-between"><b>${esc(t)}</b><span class="pill" style="height:22px">${d}</span></div><p style="font-size:13px;margin:8px 0 12px">${esc(x)}</p><button class="btn btn-secondary btn-sm" data-goto="ansprechpartner">${ic('calendar', 'i-sm')}Termin anfragen</button></div>`).join('')}</div></div>`;
}});
registerPage('ueber', {title: 'Über Kontor', sub: () => S.appVersion || '', render: () => {
  const i = S.info || {};
  $('#view-ueber').innerHTML = `<div class="cv">${pageHead('Über Kontor', 'Warenwirtschaft und Kasse – lokal, ohne Cloud-Zwang')}<div class="card">
    ${[['Version', S.appVersion || '–'], ['Datenbank', i.db_path || '–'], ['Schema', i.schema != null ? String(i.schema) : '–'], ['Kasse', CFG['kasse.id'] || '–'], ['Firma', CFG['firma.name'] || '–'], ['Artikel', num(ART.length)], ['Kund:innen', num(CUSTOMERS.length)], ['Fiskalisierung', 'RKSV (Österreich)'], ['Technik', 'Tauri 2 · Rust · SQLite · WebView2']].map(([k, x]) => `<div class="set-row"><div class="set-l">${esc(k)}</div><div class="set-c mono" style="font-size:12.5px">${esc(x)}</div></div>`).join('')}</div></div>`;
}});
registerPage('fiskal-kassen', {title: 'Fiskalisierte Kassen', sub: () => 'RKSV-Status', render: async () => {
  const v = $('#view-fiskal-kassen');
  let r = null; if (DESKTOP) { try { r = await invoke('rksv_status'); } catch { /* */ } }
  const kassen = [{id: CFG['kasse.id'], name: CFG['kasse.name'] || 'Diese Kasse', st: r}, ...OTHER_STORES.map(s => ({id: s.id, name: s.name, st: null}))];
  v.innerHTML = `<div class="cv">${pageHead('Fiskalisierte Kassen', 'Registrierkassen mit RKSV-Signatur – Status, Zertifikat und Startbeleg', `<button class="btn btn-secondary" data-goto="einstellungen">${ic('shield', 'i-sm')}RKSV-Einstellungen</button>`)}
    <div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Kasse</th><th>Kassen-ID</th><th>Modus</th><th>Startbeleg</th><th style="padding-right:16px">Status</th></tr></thead><tbody>${kassen.map(k => `<tr><td style="padding-left:16px"><b>${esc(k.name)}</b></td><td class="mono">${esc(k.id || '–')}</td><td>${k.st ? esc(k.st.mode === 'test' ? 'Testmodus' : k.st.mode || '–') : '<span class="muted">in der Filiale prüfen</span>'}</td><td>${k.st ? (k.st.started_at ? `<span class="pill pos" style="height:20px">${esc(dDate(k.st.started_at))}</span>` : '<span class="pill warn" style="height:20px">offen</span>') : '–'}</td><td style="padding-right:16px">${k.st ? `<span class="pill ${k.st.active ? 'pos' : 'warn'}" style="height:20px">${k.st.active ? `in Betrieb · ${num(k.st.receipts || 0)} Belege` : 'nicht initialisiert'}</span>` : '–'}</td></tr>`).join('')}</tbody></table></div>
    <div class="card" style="padding:14px 16px;margin-top:14px;font-size:13px">${ic('info', 'i-sm')} Für den Echtbetrieb wird eine Signaturkarte bzw. ein Cloud-HSM (z. B. A-Trust) und die Registrierung bei FinanzOnline benötigt. Bis dahin signiert Kontor im RKSV-Testmodus.</div></div>`;
}});
registerPage('ansprechpartner', {title: 'Ansprechpartner', sub: () => CFG['support.name'] || 'Support', render: () => {
  const v = $('#view-ansprechpartner');
  const f = (k, l) => `<div class="set-row"><div class="set-l">${l}</div><div class="set-c"><input class="input" data-sup="${k}" value="${esc(CFG[k] || '')}" style="min-width:260px"></div></div>`;
  v.innerHTML = `<div class="cv">${pageHead('Ansprechpartner', 'Ihr Kontakt für Support, Schulung und Einrichtung – erscheint unter Hilfe', CFG['support.email'] ? `<button class="btn btn-primary" data-supmail>${ic('mail', 'i-sm')}E-Mail schreiben</button>` : '')}<div class="card">${f('support.name', 'Name / Firma')}${f('support.telefon', 'Telefon')}${f('support.email', 'E-Mail')}</div></div>`;
  v.onchange = async e => { const k = e.target.dataset.sup; if (k) await saveSettings({[k]: e.target.value.trim()}); };
  v.onclick = e => { if (e.target.closest('[data-supmail]')) invoke('open_url', {url: `mailto:${CFG['support.email']}?subject=${encodeURIComponent('Kontor ' + (S.appVersion || '') + ' – Anfrage')}`}).catch(() => {}); };
}});

function bindKundenService() { bindStamm(); bindAnalyse(); bindEdi(); applyListStyle(); }
