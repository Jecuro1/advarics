
/* ════════════════════════════════════════════════════════════════════
   43 · VERKAUF — Warenkorb, manuelle und ungebuchte Verkäufe,
   Verkäufer-/Kunden-Bon-Zuordnung, Reservierungen, Auswahlverwaltung,
   Faktura (Angebot → Auftrag → Lieferschein → Rechnung, offene Posten),
   Tagesabschlüsse, Filialumsatz kompakt.
   ════════════════════════════════════════════════════════════════════ */
Object.assign(VIEW_PERM, {manuell: 'kasse.verkaufen', 'bon-verkaeufer': 'berichte', 'bon-kunden': 'kunden.bearbeiten', 'offene-posten': 'faktura', tagesabschluesse: 'kasse.kassenbuch', filialumsatz: 'berichte', ungebucht: 'kasse.verkaufen'});

/** Positionen eines Vorgangs in den Kassen-Warenkorb übernehmen */
function posLoadLines(lines, customerId, ref) {
  go('kasse');
  let n = 0;
  for (const l of lines) {
    const q = Math.max(0, Math.round(+l.qty || 0)); if (!q) continue;
    const x = l.ean ? findEan(l.ean) : null;
    if (x) {
      addLine(x.a, x.v.c, x.v.s, q);
      const cl = POS.cart.find(c => c.key === POS.lastKey);
      if (cl && l.price && Math.abs(cl.unit - l.price / 100) > 0.004) { cl.unit = l.price / 100; cl.was = null; }
      if (cl && l.disc) cl.disc = {pct: +l.disc, reason: ref ? `lt. ${ref}` : 'vereinbart'};
    } else POS.cart.push({key: 'svc|' + uid(), service: true, icon: 'tag', name: l.name || 'Position', unit: (l.price || 0) / 100, vat: l.vat ?? 20, qty: q, meta: ref ? `aus ${ref}` : 'Dienstleistung'});
    n++;
  }
  const c = customerId ? custById(customerId) : null;
  if (c && !POS.customer) attachCustomer(c);
  renderCart();
  toast(`${n} Positionen an der Kasse`, {t2: ref ? `aus ${ref} – jetzt kassieren` : '', type: 'accent', icon: 'register'});
}

/* ── Warenkorb ── */
docPage('warenkoerbe', 'warenkorb', {tabs: [['offen', 'Offen', s => s === 'offen'], ['erledigt', 'Übernommen', s => s === 'uebernommen'], ['alle', 'Alle', () => true]], newLabel: 'Warenkorb erfassen',
  cols: [{l: 'Gültig bis', f: d => esc(dDate(d.due))}, {l: 'Positionen', r: true, f: d => num((d.data.lines || []).length)}],
  kpi: l => [[num(l.filter(d => d.status === 'offen').length), 'offene Warenkörbe'], [eur0(l.filter(d => d.status === 'offen').reduce((s, d) => s + d.total, 0) / 100), 'offener Wert'], [num(l.filter(d => d.status === 'uebernommen').length), 'an der Kasse übernommen', 'pos']]});
registerPage('warenkorb-neu', {title: 'Warenkorb erfassen', sub: () => 'ohne zu kassieren', render: () => {
  $('#view-warenkorb-neu').innerHTML = `<div class="cv">${pageHead('Warenkorb erfassen', 'Einkauf vorbereiten – z. B. am Telefon, am Beratungsplatz oder für eine Abholung. Kassiert wird später an der Kasse.')}<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('bag')}</div><h3>Neuer Warenkorb</h3><p>Artikel scannen oder suchen, optional Kunde zuordnen, speichern. Unter „Warenkörbe“ an der Kasse übernehmen.</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-primary" data-dnew="warenkorb">${ic('plus', 'i-sm')}Warenkorb erfassen</button><button class="btn btn-secondary" data-goto="warenkoerbe">Warenkörbe</button></div></div></div></div>`;
  if (DESKTOP) setTimeout(() => S.view === 'warenkorb-neu' && !$$('.layer [data-dbox]').length && openDoc('warenkorb', null), 150);
}});
DOC_AFTER.warenkorb = {uebernehmen: (st, el) => { closeLayer(el); posLoadLines(st.data.lines, st.partner, st.no); }};
// Kasse: aktuellen Warenkorb als Vorgang speichern (Befehlspalette)
{
  const _cl = cmdList;
  cmdList = function () {
    const extra = navFlat().filter(n => n.id && TITLES[n.id]).map(n => ({group: 'Menü · ' + n.path.filter(Boolean).join(' · '), label: n.label, icon: n.icon, view: n.id, run: () => go(n.id), kw: n.path.join(' ')}));
    extra.push({group: 'Kasse', label: 'Warenkorb als Vorgang speichern', icon: 'bag', kw: 'merken telefon später', run: () => {
      if (!POS.cart.length) return toast('Warenkorb ist leer', {icon: 'bag'});
      const lines = POS.cart.map(l => l.art ? {ean: variant(l.art, l.c, l.s).ean, sku: l.art.id, name: `${l.name} · ${colorName(l.c)} · ${l.s}`, qty: l.qty, price: Math.round(l.unit * 100), vat: l.vat, disc: l.disc?.pct || 0} : {ean: '', name: l.name, qty: l.qty, price: Math.round(l.unit * 100), vat: l.vat});
      openDoc('warenkorb', null, {partner: POS.customer?.id || null, partner_name: POS.customer?.name || '', data: {lines}, focusSearch: false});
    }});
    const seen = new Set(_cl().map(c => c.label));
    return [..._cl(), ...extra.filter(x => !seen.has(x.label) || x.group === 'Kasse')];
  };
}

/* ── Reservierungen ── */
docPage('reservierungen', 'reservierung', {tabs: [['offen', 'Offen', s => ['angefragt', 'reserviert', 'abholbereit'].includes(s)], ['angefragt', 'Anfragen', s => s === 'angefragt'], ['erledigt', 'Erledigt', s => ['abgeholt', 'storniert', 'verfallen'].includes(s)], ['alle', 'Alle', () => true]],
  newLabel: 'Neue Reservierung', partnerCol: 'Kunde',
  cols: [{l: 'Quelle', f: d => d.data.quelle === 'Schaufenster' ? `<span class="pill accent" style="height:20px">${ic('store', 'i-xs')} Schaufenster</span>` : esc(d.data.quelle || '')}, {l: 'Abholen bis', f: d => `<span class="num" style="${d.due && d.due < today() && ['reserviert', 'abholbereit'].includes(d.status) ? 'color:var(--neg);font-weight:600' : ''}">${esc(dDate(d.due))}</span>`}, {l: 'Artikel', f: d => esc((d.data.lines || []).map(l => l.name.split(' · ')[0]).join(', ')).slice(0, 80)}],
  kpi: l => [[num(l.filter(d => d.status === 'angefragt').length), 'neue Anfragen', l.some(d => d.status === 'angefragt') ? 'warn' : ''], [num(l.filter(d => ['reserviert', 'abholbereit'].includes(d.status)).length), 'zurückgelegt'], [num(l.filter(d => ['reserviert', 'abholbereit'].includes(d.status) && d.due && d.due < today()).length), 'Frist abgelaufen', 'neg'], [num(l.filter(d => d.status === 'abgeholt').length), 'abgeholt', 'pos']]});
DOC_AFTER.reservierung = {
  abholen: (st, el) => { closeLayer(el); posLoadLines(st.data.lines, st.partner, st.no); },
  abholbereit: async st => {
    const to = st.data.kontakt?.email || custById(st.partner)?.email; if (!to) return;
    if (!(await confirmBox(`Kund:in per E-Mail (${to}) informieren, dass die Ware abholbereit ist?`, 'E-Mail senden'))) return;
    const txt = `Guten Tag ${st.partner_name},\n\nIhre Reservierung ${st.no} liegt für Sie bereit:\n${st.data.lines.map(l => `· ${l.qty} × ${l.name}`).join('\n')}\n\nWir halten die Ware bis ${dDate(st.due)} für Sie zurück.\n\nIhr Team von ${CFG['firma.name']}\n${CFG['firma.adresse'] || ''}`;
    try { await invoke('mail_send', {to, subject: `Abholbereit: Reservierung ${st.no}`, html: `<div style="font:15px/1.6 system-ui,sans-serif">${esc(txt).replace(/\n/g, '<br>')}</div>`, text: txt, qr: st.no, purpose: 'reservierung'}); toast('Kund:in informiert', {t2: to, type: 'pos', icon: 'mail'}); }
    catch (e) { toast('E-Mail nicht gesendet', {t2: String(e), type: 'warn', dur: 8000}); }
  },
};
// Reservierte Mengen an der Kasse anzeigen und neue Anfragen aus dem Schaufenster melden
const RES = {map: {}, seen: null};
async function pollReservations() {
  if (!DESKTOP) return;
  try {
    RES.map = await invoke('doc_reserved');
    const l = await invoke('doc_list', {kinds: ['reservierung'], status: 'angefragt', limit: 200});
    navBadge('reservierungen', l.length);
    const ids = new Set(l.map(d => d.id));
    if (RES.seen) l.filter(d => !RES.seen.has(d.id)).forEach(d => { toast('Neue Reservierung', {t2: `${d.no} · ${d.partner_name} · ${(d.data.lines || []).length} Artikel${d.data.quelle ? ' · ' + d.data.quelle : ''}`, type: 'accent', icon: 'store', dur: 10000, action: {label: 'Öffnen', run: () => { go('reservierungen'); openDoc('reservierung', d.id); }}}); Hooks.emit('vorgang.reservierung.anfrage', {nr: d.no, kunde: d.partner_name}); });
    RES.seen = ids;
  } catch { /* */ }
}

/* ── Auswahlverwaltung ── */
docPage('auswahl', 'auswahl', {tabs: [['offen', 'Ausgegeben', s => ['entwurf', 'ausgegeben'].includes(s)], ['erledigt', 'Abgeschlossen', s => ['abgeschlossen', 'storniert'].includes(s)], ['alle', 'Alle', () => true]], newLabel: 'Neue Auswahl',
  cols: [{l: 'Rückgabe bis', f: d => `<span class="num" style="${d.due && d.due < today() && d.status === 'ausgegeben' ? 'color:var(--neg);font-weight:600' : ''}">${esc(dDate(d.due))}</span>`}, {l: 'offen', r: true, f: d => num((d.data.lines || []).reduce((s, l) => s + (+l.qty || 0) - (l.zurueck || 0) - (l.gekauft || 0), 0))}],
  kpi: l => { const o = l.filter(d => d.status === 'ausgegeben'); return [[num(o.length), 'Auswahlen unterwegs'], [eur0(o.reduce((s, d) => s + (d.data.lines || []).reduce((t, x) => t + ((+x.qty || 0) - (x.zurueck || 0) - (x.gekauft || 0)) * (x.price || 0), 0), 0) / 100), 'Warenwert außer Haus'], [num(o.filter(d => d.due && d.due < today()).length), 'überfällig', 'neg']]; }});
DOC_BTNS.auswahl = st => st.status === 'ausgegeben' ? `<button class="btn btn-primary" data-asr>${ic('undo', 'i-sm')}Rücklauf / Kauf erfassen</button>` : '';
DOC_CLICK.auswahl = async (e, st, h) => {
  if (!e.target.closest('[data-asr]')) return;
  const L = st.data.lines, open = L.map(l => (+l.qty || 0) - (l.zurueck || 0) - (l.gekauft || 0));
  const el = openLayer(`<div class="modal" style="width:min(640px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('undo')}</div><div><h2>Rücklauf ${esc(st.no)}</h2><p>Zurückgebrachte und gekaufte Teile – gekaufte Teile werden danach an der Kasse kassiert</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body"><table class="tbl" style="margin:0"><thead><tr><th>Artikel</th><th class="r">offen</th><th class="r">zurück</th><th class="r">gekauft</th></tr></thead><tbody>${L.map((l, i) => `<tr><td><b>${esc(l.name)}</b></td><td class="r num">${open[i]}</td><td class="r"><input class="input num" data-arz="${i}" value="${open[i]}" ${open[i] ? '' : 'disabled'} style="width:64px;height:32px;text-align:right"></td><td class="r"><input class="input num" data-arg="${i}" value="0" ${open[i] ? '' : 'disabled'} style="width:64px;height:32px;text-align:right"></td></tr>`).join('')}</tbody></table></div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-argo>${ic('check', 'i-sm')}Buchen</button></div></div>`);
  $('[data-argo]', el).onclick = async () => {
    const lines = L.map((l, i) => ({i, zurueck: parseInt($(`[data-arz="${i}"]`, el).value, 10) || 0, gekauft: parseInt($(`[data-arg="${i}"]`, el).value, 10) || 0})).filter(x => x.zurueck || x.gekauft);
    if (!lines.length) return toast('Keine Menge erfasst', {type: 'warn'});
    try {
      const r = await invoke('doc_action', {id: st.id, action: 'ruecklauf', payload: {lines}, user: S.user.name}); applyStocks(r.stocks); closeLayer(el); closeLayer(h.el); docRefresh();
      const bought = lines.filter(x => x.gekauft).map(x => ({...L[x.i], qty: x.gekauft}));
      toast(`Rücklauf ${r.no} gebucht`, {t2: r.status === 'abgeschlossen' ? 'Auswahl abgeschlossen' : 'noch offen', type: 'pos', icon: 'undo'});
      if (bought.length) posLoadLines(bought, st.partner, st.no);
    } catch (err) { toast('Nicht gebucht', {t2: String(err), type: 'warn', dur: 8000}); }
  };
};

/* ── Faktura ── */
docPage('angebote', 'angebot', {tabs: [['offen', 'Offen', s => s === 'offen'], ['angenommen', 'Angenommen', s => s === 'angenommen'], ['alle', 'Alle', () => true]], cols: [{l: 'Gültig bis', f: d => esc(dDate(d.due))}],
  kpi: l => [[num(l.filter(d => d.status === 'offen').length), 'offene Angebote'], [eur0(l.filter(d => d.status === 'offen').reduce((s, d) => s + d.total, 0) / 100), 'Angebotswert'], [l.length ? Math.round(l.filter(d => d.status === 'angenommen').length / Math.max(1, l.filter(d => d.status !== 'offen').length) * 100) + ' %' : '–', 'Annahmequote', 'pos']]});
docPage('auftraege', 'auftrag', {tabs: [['offen', 'Offen', s => s === 'offen'], ['geliefert', 'Geliefert', s => s === 'geliefert'], ['alle', 'Alle', () => true]], cols: [{l: 'Liefertermin', f: d => esc(dDate(d.due))}]});
docPage('lieferscheine', 'lieferschein', {tabs: [['offen', 'Nicht berechnet', s => ['entwurf', 'ausgeliefert'].includes(s)], ['berechnet', 'Berechnet', s => s === 'berechnet'], ['alle', 'Alle', () => true]]});
docPage('rechnungen', 'rechnung', {title: 'Rechnungen (Faktura)', tabs: [['offen', 'Offen', s => ['entwurf', 'offen', 'teilbezahlt'].includes(s)], ['bezahlt', 'Bezahlt', s => s === 'bezahlt'], ['alle', 'Alle', () => true]],
  cols: [{l: 'Fällig', f: d => `<span class="num" style="${d.due && d.due < today() && d.open ? 'color:var(--neg);font-weight:600' : ''}">${esc(dDate(d.due))}</span>`}, {l: 'Mahnstufe', r: true, f: d => d.data.mahnstufe ? `<span class="pill neg" style="height:20px">${d.data.mahnstufe}</span>` : ''}],
  kpi: l => { const o = l.filter(d => ['offen', 'teilbezahlt'].includes(d.status)); return [[eur0(o.reduce((s, d) => s + d.open, 0) / 100), 'offene Forderungen'], [eur0(o.filter(d => d.due < today()).reduce((s, d) => s + d.open, 0) / 100), 'überfällig', 'neg'], [num(l.filter(d => d.status === 'entwurf').length), 'Entwürfe'], [eur0(l.filter(d => d.status !== 'storniert' && d.date.slice(0, 7) === today().slice(0, 7)).reduce((s, d) => s + d.total, 0) / 100), 'fakturiert diesen Monat', 'pos']]; }});
DOC_AFTER.rechnung = {mahnen: st => docPrint(st, true)};
DOC_BTNS.rechnung = st => st.id && st.data.mahnstufe ? `<button class="btn btn-ghost" data-mprint>${ic('printer', 'i-sm')}Mahnung drucken</button>` : '';
DOC_CLICK.rechnung = (e, st) => { if (e.target.closest('[data-mprint]')) docPrint(st, true); };

registerPage('offene-posten', {title: 'Offene Posten & Mahnungen', sub: () => 'Forderungen aus Faktura', render: renderOP});
async function renderOP() {
  const v = $('#view-offene-posten');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('clock', 'Offene Posten'); return; }
  let l; try { l = (await docLoad('rechnung')).filter(d => ['offen', 'teilbezahlt'].includes(d.status)); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  DOCS['offene-posten'] = l;
  const age = d => d.due ? Math.floor((Date.now() - new Date(d.due + 'T12:00:00')) / 864e5) : 0;
  const bucket = d => age(d) <= 0 ? 'nicht fällig' : age(d) <= 30 ? '1–30 Tage' : age(d) <= 60 ? '31–60 Tage' : 'über 60 Tage';
  const B = ['nicht fällig', '1–30 Tage', '31–60 Tage', 'über 60 Tage'];
  const byCust = {}; l.forEach(d => (byCust[d.partner_name] ||= []).push(d));
  v.innerHTML = `<div class="cv">${pageHead('Offene Posten & Mahnungen', 'Forderungen aus Faktura-Rechnungen nach Fälligkeit – Zahlung erfassen oder Mahnung drucken')}
    ${kpiCards(B.map((b, i) => [eur0(l.filter(d => bucket(d) === b).reduce((s, d) => s + d.open, 0) / 100), b, i ? (i > 1 ? 'neg' : 'warn') : '']))}
    ${Object.keys(byCust).length ? Object.entries(byCust).sort((a, b) => b[1].reduce((s, d) => s + d.open, 0) - a[1].reduce((s, d) => s + d.open, 0)).map(([n, ds]) => `<div class="card" style="margin-bottom:12px"><div class="set-row"><div><div class="set-l">${esc(n)}</div><div class="set-h">${ds.length} Rechnungen · offen ${cEur(ds.reduce((s, d) => s + d.open, 0))}</div></div></div>
      <table class="tbl" style="margin:0"><tbody>${ds.map(d => `<tr data-dopen="${d.id}" style="cursor:pointer"><td style="padding-left:16px"><b class="mono">${esc(d.no)}</b></td><td class="muted num">${esc(dDate(d.date))}</td><td class="num">fällig ${esc(dDate(d.due))}</td><td>${age(d) > 0 ? `<span class="pill ${age(d) > 30 ? 'neg' : 'warn'}" style="height:20px">${age(d)} Tage überfällig</span>` : '<span class="pill" style="height:20px">nicht fällig</span>'}${d.data.mahnstufe ? ` <span class="pill neg" style="height:20px">${d.data.mahnstufe}. Mahnung</span>` : ''}</td><td class="r num">${cEur(d.total)}</td><td class="r num" style="padding-right:16px;font-weight:650">${cEur(d.open)}</td></tr>`).join('')}</tbody></table></div>`).join('')
      : `<div class="card"><div class="empty" style="padding:52px 20px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><h3>Keine offenen Posten</h3><p>Alle Faktura-Rechnungen sind bezahlt.</p></div></div>`}</div>`;
}

/* ── Manuelle Verkäufe (Nacherfassung, z. B. nach Kassenausfall, Messe, Außer-Haus) ── */
const MV = {data: {lines: []}, partner: null, partner_name: '', datum: '', grund: 'Nacherfassung nach Kassenausfall', m: 'bar'};
const MV_K = {price: 'vk', lines: true, disc: true, free: true, partner: 'kunde', optPartner: true};
registerPage('manuell', {title: 'Manuelle Verkäufe', sub: () => 'Nacherfassung', render: renderManuell});
function renderManuell() {
  const v = $('#view-manuell');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('edit', 'Manuelle Verkäufe'); return; }
  MV.datum ||= today();
  const meths = METHODS.filter(m => !m.hidden && m.id !== 'gutschein');
  v.innerHTML = `<div class="cv">${pageHead('Manuelle Verkäufe', 'Verkäufe außerhalb der Kasse nacherfassen (z. B. Notbelege bei Kassenausfall, Messe- und Außer-Haus-Verkäufe). Es entsteht ein regulärer, signierter Beleg mit Hinweis auf das Originaldatum.')}
    <div class="card" style="padding:16px;display:grid;gap:14px">
      <div class="ed-grid"><label class="field"><span>Originaldatum des Verkaufs</span><input class="input" type="date" id="mvDate" value="${esc(MV.datum)}"></label>
        <label class="field"><span>Grund</span><select class="input select" id="mvGrund">${['Nacherfassung nach Kassenausfall', 'Messeverkauf', 'Außer-Haus-Verkauf', 'Notbeleg (Handbeleg)', 'Sonstiges'].map(g => `<option ${g === MV.grund ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="field"><span>Zahlungsart</span><select class="input select" id="mvPay">${meths.map(m => `<option value="${m.id}" ${m.id === MV.m ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
        <label class="field"><span>Notbeleg-Nr. / Notiz</span><input class="input" id="mvNote" value="${esc(MV.note || '')}"></label></div>
      <div class="ed-grid">${partnerField(MV_K, MV, true)}</div>
      <div data-mvl>${linesHTML(MV_K, {...MV, kind: 'manuell'}, true)}</div>
      <div style="display:flex;gap:8px"><span class="sp" style="flex:1"></span><button class="btn btn-ghost" data-mv="leer">Leeren</button><button class="btn btn-primary" data-mv="buchen" ${MV.data.lines.length ? '' : 'disabled'}>${ic('check', 'i-sm')}Verkauf buchen</button></div></div></div>`;
  if (MV._focusQ) { const q = $('[data-dlq]', v); q?.focus(); q?.setSelectionRange(q.value.length, q.value.length); }
}
async function mvBook() {
  const v = $('#view-manuell');
  MV.datum = $('#mvDate', v).value; MV.grund = $('#mvGrund', v).value; MV.m = $('#mvPay', v).value; MV.note = $('#mvNote', v).value;
  const L = MV.data.lines.filter(l => +l.qty > 0); if (!L.length) return;
  try { await needPerm('kasse.verkaufen', 'Manueller Verkauf'); } catch { return; }
  const lines = L.map(l => { const x = l.ean ? findEan(l.ean) : null; return {name: x ? x.a.name : l.name, sku: x?.a.id || null, ean: l.ean || null, glyph: x?.a.g || null, c: x?.v.c || null, s: x?.v.s || null, qty: +l.qty, unit: (l.price || 0) / 100, was: null, vat: l.vat ?? 20, disc: l.disc ? {pct: +l.disc, reason: 'manuell'} : null, service: !x, voucher: false, icon: x ? null : 'tag', meta: x ? null : 'manuell erfasst', vals: null}; });
  let sub = 0, ld = 0; const byRate = {};
  lines.forEach(l => { const g = r2(l.unit * l.qty), d = l.disc ? r2(g * l.disc.pct / 100) : 0; sub += g; ld += d; byRate[l.vat] = (byRate[l.vat] || 0) + g - d; });
  const total = r2(sub - ld), vat = Object.entries(byRate).filter(([k, g]) => +k > 0 && g > 0).map(([k, g]) => ({rate: +k, gross: r2(g), net: r2(g / (1 + k / 100)), tax: r2(g - g / (1 + k / 100))}));
  const m = METHODS.find(x => x.id === MV.m) || METHODS[0], cust = MV.partner ? custById(MV.partner) : null;
  const data = {date: new Date().toISOString(), cashier: S.user.name, offline: false, sig: null, change: 0, billDisc: null, t: {sub: r2(sub), disc: r2(ld), total, vat, zero: r2(byRate[0] || 0), points: Math.floor(total / 10)},
    parts: [{m: m.id, label: m.label, amount: total, ref: null, given: null, change: 0, code: null}], customer: cust ? {id: cust.id, name: cust.name, points: cust.points, email: cust.email} : null, lines,
    manuell: {datum: MV.datum, grund: MV.grund, notiz: MV.note || ''}};
  try {
    const r = await invoke('sale_commit', {lines: L.filter(l => l.ean).map(l => ({ean: l.ean, qty: +l.qty})), total: Math.round(total * 100), cashier: S.user.name, customer: cust?.id || null, data});
    applyStocks(r.stocks); POS.no = await invoke('beleg_peek');
    toast('Verkauf nacherfasst', {t2: `Beleg ${r.no} · ${eur(total)} · Original ${dDate(MV.datum)}`, type: 'pos', icon: 'receipt', action: {label: 'Beleg', run: () => { BL.sel = r.no; go('belege'); }}});
    Hooks.emit('pos.sale.manual', {beleg: r.no, betrag: total, datum: MV.datum, grund: MV.grund});
    Object.assign(MV, {data: {lines: []}, partner: null, partner_name: '', note: ''}); renderManuell();
  } catch (e) { toast('Nicht gebucht', {t2: String(e), type: 'warn', dur: 8000}); }
}

/* ── Ungebuchte Verkäufe ── */
registerPage('ungebucht', {title: 'Ungebuchte Verkäufe', sub: () => 'Offene Vorgänge prüfen', render: renderUngebucht});
async function renderUngebucht() {
  const v = $('#view-ungebucht');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('alert', 'Ungebuchte Verkäufe'); return; }
  let docs = [], vb = null, sales = [];
  try { [docs, vb, sales] = await Promise.all([docLoad(['warenkorb', 'reservierung', 'auswahl', 'rechnung', 'lieferschein']), invoke('verbund_info'), invoke('sales_list', {limit: 400})]); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  DOCS.ungebucht = docs;
  const sec = [];
  const row = (d, why) => `<tr data-dopen="${d.id}" style="cursor:pointer"><td style="padding-left:16px"><b class="mono">${esc(d.no)}</b></td><td>${esc(DK[d.kind].one)}</td><td>${esc(d.partner_name || '–')}</td><td>${dPill(d.status)}</td><td class="muted">${why}</td><td class="r num" style="padding-right:16px">${cEur(d.total)}</td></tr>`;
  if (POS.parked.length) sec.push(['Geparkte Bons an der Kasse', `${POS.parked.length} Bons warten`, `<table class="tbl" style="margin:0"><tbody>${POS.parked.map(p => `<tr><td style="padding-left:16px">${esc(p.customer?.name || 'Geparkter Bon')}</td><td>${p.n} Artikel</td><td class="r num" style="padding-right:16px">${eur(p.total)}</td></tr>`).join('')}</tbody></table>`, `<button class="btn btn-secondary btn-sm" data-goto="kasse">Zur Kasse</button>`]);
  if (vb.rolle === 'filiale' && vb.ungemeldet) sec.push(['Noch nicht an die Zentrale gemeldet', `${vb.ungemeldet} Belege · letzter Abgleich ${vb.status?.zeit ? fmtTs(vb.status.zeit) : 'nie'}${vb.status?.ok === false ? ' · Zentrale nicht erreichbar' : ''}`, '', `<button class="btn btn-secondary btn-sm" data-ug="sync">${ic('sync', 'i-sm')}Jetzt abgleichen</button>`]);
  const wk = docs.filter(d => d.kind === 'warenkorb' && d.status === 'offen');
  if (wk.length) sec.push(['Offene Warenkörbe', `${wk.length} vorbereitete Einkäufe, noch nicht kassiert`, `<table class="tbl" style="margin:0"><tbody>${wk.map(d => row(d, d.due && d.due < today() ? 'abgelaufen' : 'nicht kassiert')).join('')}</tbody></table>`, '']);
  const rs = docs.filter(d => d.kind === 'reservierung' && ['angefragt', 'reserviert', 'abholbereit'].includes(d.status) && (d.status === 'angefragt' || (d.due && d.due < today())));
  if (rs.length) sec.push(['Reservierungen mit Handlungsbedarf', 'Anfragen offen oder Abholfrist abgelaufen', `<table class="tbl" style="margin:0"><tbody>${rs.map(d => row(d, d.status === 'angefragt' ? 'Anfrage bestätigen' : 'Frist abgelaufen')).join('')}</tbody></table>`, '']);
  const as = docs.filter(d => d.kind === 'auswahl' && d.status === 'ausgegeben' && d.due && d.due < today());
  if (as.length) sec.push(['Überfällige Auswahlen', 'Ware beim Kunden, Rückgabefrist abgelaufen', `<table class="tbl" style="margin:0"><tbody>${as.map(d => row(d, 'Rückgabe überfällig')).join('')}</tbody></table>`, '']);
  const fx = docs.filter(d => (d.kind === 'rechnung' && d.status === 'entwurf') || (d.kind === 'lieferschein' && d.status === 'ausgeliefert'));
  if (fx.length) sec.push(['Faktura nicht abgeschlossen', 'Rechnungsentwürfe und ausgelieferte, nicht berechnete Lieferscheine', `<table class="tbl" style="margin:0"><tbody>${fx.map(d => row(d, d.kind === 'rechnung' ? 'Rechnung nicht gestellt' : 'nicht berechnet')).join('')}</tbody></table>`, '']);
  navBadge('ungebucht', sec.length);
  v.innerHTML = `<div class="cv">${pageHead('Ungebuchte Verkäufe', 'Alles, was verkauft oder vorbereitet, aber noch nicht vollständig gebucht ist')}
    ${sec.length ? sec.map(([t, h, body, act]) => `<div class="card" style="margin-bottom:12px"><div class="set-row"><div><div class="set-l">${ic('alert', 'i-xs')} ${esc(t)}</div><div class="set-h">${esc(h)}</div></div><div class="set-c">${act}</div></div>${body}</div>`).join('')
      : `<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><h3>Alles gebucht</h3><p>Keine geparkten Bons, offenen Warenkörbe, überfälligen Reservierungen oder ungemeldeten Belege.</p></div></div>`}</div>`;
}

/* ── Bon-Zuordnung: Verkäufer:in und Kunde ── */
const BZ = {range: '7', q: '', nur: true};
const sellerOf = s => s.data?.seller || s.cashier || '–';
async function bzLoad() { return (await invoke('sales_list', {limit: 3000})).filter(s => (s.kind || 'verkauf') === 'verkauf' && !s.voided); }
registerPage('bon-verkaeufer', {title: 'Verkäufer-Bon-Zuordnung', sub: () => 'Bons Verkäufer:innen zuordnen', render: renderBonVerk});
async function renderBonVerk() {
  const v = $('#view-bon-verkaeufer');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('user', 'Bon-Zuordnung'); return; }
  let l; try { l = await bzLoad(); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  const from = BZ.range === 'alle' ? null : dayStart(+BZ.range), n = norm(BZ.q);
  const f = l.filter(s => (!from || new Date(s.ts) >= from) && (!n || norm(`${s.no} ${sellerOf(s)} ${s.data?.customer?.name || ''}`).includes(n)));
  const per = {}; f.forEach(s => { const k = sellerOf(s); (per[k] ||= {bons: 0, sum: 0}); per[k].bons++; per[k].sum += s.total; });
  v.innerHTML = `<div class="cv">${pageHead('Verkäufer-Bon-Zuordnung', 'Wer hat verkauft? Bons nachträglich der beratenden Person zuordnen – Grundlage für Sales-Aktionen und Provisionen')}
    <div class="ds-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:14px">${Object.entries(per).sort((a, b) => b[1].sum - a[1].sum).map(([k, x]) => `<div class="card" style="padding:14px"><div style="font-weight:650">${esc(k)}</div><div class="muted" style="font-size:12.5px">${num(x.bons)} Bons · Ø ${eur(x.sum / x.bons / 100)}</div><div style="font-size:20px;font-weight:650;margin-top:4px">${eur0(x.sum / 100)}</div></div>`).join('')}</div>
    <div class="filters"><input class="input" id="bzQ" placeholder="Beleg, Person, Kunde …" value="${esc(BZ.q)}" style="flex:1;max-width:360px"><div class="seg" id="bzSeg">${[['0', 'Heute'], ['7', '7 Tage'], ['30', '30 Tage'], ['alle', 'Alle']].map(([k, x]) => `<button data-v="${k}" aria-pressed="${BZ.range === k}">${x}</button>`).join('')}</div></div>
    <div class="card">${f.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Beleg</th><th>Zeit</th><th>Kassier:in</th><th>Verkäufer:in</th><th>Kunde</th><th class="r" style="padding-right:16px">Betrag</th></tr></thead><tbody>${f.slice(0, 400).map(s => `<tr><td style="padding-left:16px" class="mono">${esc(s.no)}</td><td class="muted num">${esc(fmtTs(s.ts))}</td><td>${esc(s.cashier || '')}</td><td><select class="input select" data-bzs="${esc(s.no)}" style="height:30px;width:auto;min-width:150px"><option value="">= Kassier:in</option>${sellers().concat(STAFF.filter(u => u.verkaeufer === false && u.name === s.data?.seller)).map(u => `<option ${s.data?.seller === u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></td><td>${esc(s.data?.customer?.name || '')}</td><td class="r num" style="padding-right:16px;font-weight:600">${eur(s.total / 100)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Keine Bons im Zeitraum.</p></div>'}</div></div>`;
  initSeg($('#bzSeg', v), b => { BZ.range = b.dataset.v; renderBonVerk(); });
  $('#bzQ', v).onchange = e => { BZ.q = e.target.value; renderBonVerk(); };
}
registerPage('bon-kunden', {title: 'Kunden-Bon-Zuordnung', sub: () => 'Bons nachträglich Kunden zuordnen', render: renderBonKunden});
async function renderBonKunden() {
  const v = $('#view-bon-kunden');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('user-plus', 'Bon-Zuordnung'); return; }
  let l; try { l = await bzLoad(); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  const from = BZ.range === 'alle' ? null : dayStart(+BZ.range);
  const f = l.filter(s => (!from || new Date(s.ts) >= from) && (!BZ.nur || !s.data?.customer));
  v.innerHTML = `<div class="cv">${pageHead('Kunden-Bon-Zuordnung', 'Kund:in hat die Kundenkarte vergessen? Bon nachträglich zuordnen – Bonuspunkte werden gutgeschrieben, der Einkauf erscheint in der Kaufhistorie.')}
    ${kpiCards([[num(l.filter(s => !s.data?.customer && (!from || new Date(s.ts) >= from)).length), 'Bons ohne Kunde'], [l.length ? Math.round(l.filter(s => s.data?.customer).length / l.length * 100) + ' %' : '–', 'Kundenquote', 'pos']])}
    <div class="filters"><div class="seg" id="bkSeg">${[['0', 'Heute'], ['7', '7 Tage'], ['30', '30 Tage'], ['alle', 'Alle']].map(([k, x]) => `<button data-v="${k}" aria-pressed="${BZ.range === k}">${x}</button>`).join('')}</div><label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="bkNur" ${BZ.nur ? 'checked' : ''}> nur Bons ohne Kunde</label></div>
    <div class="card">${f.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Beleg</th><th>Zeit</th><th>Kassier:in</th><th>Artikel</th><th>Kunde</th><th class="r" style="padding-right:16px">Betrag</th></tr></thead><tbody>${f.slice(0, 400).map(s => `<tr><td style="padding-left:16px" class="mono">${esc(s.no)}</td><td class="muted num">${esc(fmtTs(s.ts))}</td><td>${esc(s.cashier || '')}</td><td class="muted" style="font-size:12.5px">${esc((s.data?.lines || []).map(x => x.name).join(', ')).slice(0, 70)}</td><td>${s.data?.customer ? `<b>${esc(s.data.customer.name)}</b>${s.data.customer.nachtraeglich ? ' <span class="pill" style="height:18px">nachträglich</span>' : ''}` : `<button class="btn btn-secondary btn-sm" data-bkz="${esc(s.no)}">${ic('user-plus', 'i-sm')}Zuordnen</button>`}</td><td class="r num" style="padding-right:16px;font-weight:600">${eur(s.total / 100)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><div class="empty-icon" style="color:var(--pos)">' + ic('check') + '</div><p>Alle Bons im Zeitraum haben eine Kundin bzw. einen Kunden.</p></div>'}</div></div>`;
  initSeg($('#bkSeg', v), b => { BZ.range = b.dataset.v; renderBonKunden(); });
  $('#bkNur', v).onchange = e => { BZ.nur = e.target.checked; renderBonKunden(); };
}
function bkPick(no) {
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('user-plus')}</div><div><h2>Kunde zuordnen</h2><p>Beleg ${esc(no)} – Bonuspunkte werden nachgebucht</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:8px"><input class="input" data-bkq placeholder="Name, Kundennummer, E-Mail, Telefon …" autocomplete="off"><div data-bkl style="display:grid;gap:4px"></div></div></div>`, {focus: '[data-bkq]'});
  $('[data-bkq]', el).oninput = e => { $('[data-bkl]', el).innerHTML = custHits(e.target.value).map(c => `<button class="pal-i" style="height:46px" data-bkc="${esc(c.id)}"><span style="flex:1;text-align:left"><b>${esc(c.name)}</b> <span class="muted">· ${esc(c.id)}${c.email ? ' · ' + esc(c.email) : ''}</span></span></button>`).join('') || '<div class="muted" style="padding:8px">Kein Treffer</div>'; };
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-bkc]'); if (!b) return;
    const c = custById(b.dataset.bkc);
    try { const r = await invoke('sale_assign', {no, seller: null, customer: {id: c.id, name: c.name, email: c.email}, user: S.user.name}); closeLayer(el); toast(`${c.name} zugeordnet`, {t2: `Beleg ${no}${r.punkte ? ` · +${r.punkte.gutgeschrieben} Punkte (Stand ${r.punkte.stand})` : ''}`, type: 'pos', icon: 'user'}); Hooks.emit('pos.sale.customer.assigned', {beleg: no, kunde: c.id}); c.points = r.punkte?.stand ?? c.points; renderBonKunden(); }
    catch (err) { toast('Nicht möglich', {t2: String(err), type: 'warn'}); }
  });
}

/* ── Tagesabschlüsse ── */
registerPage('tagesabschluesse', {title: 'Tagesabschlüsse', sub: () => 'Z-Berichte', render: renderZList});
async function renderZList() {
  const v = $('#view-tagesabschluesse');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('lock', 'Tagesabschlüsse'); return; }
  let zs; try { zs = await invoke('closings_list'); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  const m = today().slice(0, 7), mz = zs.filter(z => z.ts.slice(0, 7) === m);
  v.innerHTML = `<div class="cv">${pageHead('Tagesabschlüsse', 'Alle Z-Berichte mit Umsatz, gezähltem Bargeld und Differenz – Bericht öffnen und drucken', `<button class="btn btn-primary" data-goto="kassenbuch">${ic('lock', 'i-sm')}Tagesabschluss machen</button>`)}
    ${kpiCards([[num(zs.length), 'Abschlüsse gesamt'], [eur0(mz.reduce((s, z) => s + (z.data?.revenue || 0), 0) / 100), 'Umsatz dieser Monat'], [eur(mz.reduce((s, z) => s + (z.diff || 0), 0) / 100), 'Kassendifferenz Monat', mz.some(z => z.diff) ? 'warn' : 'pos'], [zs[0] ? fmtTs(zs[0].ts) : '–', 'letzter Abschluss']])}
    <div class="card">${zs.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Nr.</th><th>Zeitpunkt</th><th>Benutzer</th><th class="r">Bons</th><th class="r">Umsatz</th><th class="r">Bar erwartet</th><th class="r">Gezählt</th><th class="r" style="padding-right:16px">Differenz</th></tr></thead><tbody>${zs.map((z, i) => `<tr data-kbz="${i}" style="cursor:pointer"><td style="padding-left:16px"><b>${esc(z.no)}</b></td><td class="muted num">${esc(fmtTs(z.ts))}</td><td>${esc(z.user || '')}</td><td class="r num">${num(z.data?.counts?.sales || 0)}</td><td class="r num">${cEur(z.data?.revenue)}</td><td class="r num">${cEur(z.data?.cash?.expected)}</td><td class="r num">${cEur(z.counted)}</td><td class="r num" style="padding-right:16px;color:${z.diff ? 'var(--warn)' : 'var(--pos)'}">${cEur(z.diff)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:44px"><p>Noch kein Tagesabschluss.</p></div>'}</div></div>`;
  $('#view-tagesabschluesse')._z = zs;
}

/* ── Filialumsatz kompakt ── */
const FU = {days: 7};
registerPage('filialumsatz', {title: 'Filialumsatz kompakt', sub: () => `${FU.days} Tage`, render: renderFilialumsatz});
async function renderFilialumsatz() {
  const v = $('#view-filialumsatz');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('chart', 'Filialumsatz'); return; }
  let r; try { r = await invoke('store_revenue', {days: FU.days}); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  const stores = [...new Set(r.map(x => x.store))], days = [...Array(FU.days)].map((_, i) => dIso(dayStart(i))).reverse();
  const own = vbOn() ? vbOwn() : 'HIER', name = id => id === own || id === 'HIER' ? (VB.info?.name || CFG['firma.name'] || 'Diese Filiale') : storeName(id);
  const cell = (s, d) => r.find(x => x.store === s && x.date === d);
  const tot = s => r.filter(x => x.store === s).reduce((a, x) => a + x.umsatz, 0), bons = s => r.filter(x => x.store === s).reduce((a, x) => a + x.bons, 0);
  const sum = r.reduce((a, x) => a + x.umsatz, 0), max = Math.max(1, ...r.map(x => x.umsatz));
  if (!stores.length) stores.push(own);
  v.innerHTML = `<div class="cv">${pageHead('Filialumsatz kompakt', 'Umsatz je Filiale und Tag auf einen Blick (brutto, nach Retouren)', `<div class="seg" id="fuSeg">${[[7, '7 Tage'], [14, '14 Tage'], [31, '31 Tage']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${FU.days === k}">${l}</button>`).join('')}</div>`)}
    ${kpiCards([[eur0(sum / 100), `Umsatz ${FU.days} Tage`], [num(r.reduce((a, x) => a + x.bons, 0)), 'Bons'], [eur(sum / Math.max(1, r.reduce((a, x) => a + x.bons, 0)) / 100), 'Ø Bon'], [num(stores.length), 'Filialen']])}
    <div class="card" style="overflow:auto"><table class="tbl" style="margin:0;min-width:${300 + days.length * 86}px"><thead><tr><th style="padding-left:16px;position:sticky;left:0;background:var(--surface)">Filiale</th>${days.map(d => `<th class="r">${new Date(d + 'T12:00').toLocaleDateString('de-AT', {weekday: 'short', day: '2-digit', month: '2-digit'})}</th>`).join('')}<th class="r">Bons</th><th class="r" style="padding-right:16px">Summe</th></tr></thead><tbody>
      ${stores.map(s => `<tr><td style="padding-left:16px;position:sticky;left:0;background:var(--surface)"><b>${esc(name(s))}</b><div class="muted" style="font-size:11.5px">${esc(s === 'HIER' ? 'Einzelplatz' : s)}</div></td>${days.map(d => { const c = cell(s, d); return `<td class="r num" style="background:${c && c.umsatz > 0 ? `color-mix(in oklab, var(--accent) ${Math.round(6 + c.umsatz / max * 26)}%, transparent)` : 'transparent'}">${c ? eur0(c.umsatz / 100) : '<span class="muted">–</span>'}${c?.retouren ? `<div style="font-size:10.5px;color:var(--neg)">−${eur0(c.retouren / 100)}</div>` : ''}</td>`; }).join('')}<td class="r num">${num(bons(s))}</td><td class="r num" style="padding-right:16px;font-weight:650">${eur0(tot(s) / 100)}</td></tr>`).join('')}
      <tr style="font-weight:650"><td style="padding-left:16px;position:sticky;left:0;background:var(--surface)">Summe</td>${days.map(d => `<td class="r num">${eur0(r.filter(x => x.date === d).reduce((a, x) => a + x.umsatz, 0) / 100)}</td>`).join('')}<td class="r num">${num(r.reduce((a, x) => a + x.bons, 0))}</td><td class="r num" style="padding-right:16px">${eur0(sum / 100)}</td></tr></tbody></table></div></div>`;
  initSeg($('#fuSeg', v), b => { FU.days = +b.dataset.v; renderFilialumsatz(); });
}

function bindVerkauf2() {
  const on = (id, fn) => $('#view-' + id)?.addEventListener('click', fn);
  // Manuelle Verkäufe: Positionen
  const mv = $('#view-manuell');
  mv.addEventListener('input', e => {
    const t = e.target, L = MV.data.lines;
    if (t.matches('[data-dlq]')) { MV._q = t.value; MV._focusQ = true; return mvLines(); }
    if (t.matches('[data-dp="cust"]')) { MV.partner_name = t.value; MV.partner = null; const l = $('[data-dpl]', mv); const hs = custHits(t.value); l.innerHTML = hs.length ? `<div class="card" style="overflow:hidden;box-shadow:var(--shadow-3)">${hs.map(c => `<button class="pal-i" style="height:44px;border-radius:0" data-dpc="${esc(c.id)}"><b>${esc(c.name)}</b>&nbsp;<span class="muted">· ${esc(c.id)}</span></button>`).join('')}</div>` : ''; return; }
    if (t.dataset.dlqty != null) L[+t.dataset.dlqty].qty = t.value.replace(/\D/g, '');
    if (t.dataset.dlp != null) { L[+t.dataset.dlp]._p = t.value; L[+t.dataset.dlp].price = e2c(t.value); }
    if (t.dataset.dld != null) L[+t.dataset.dld].disc = parseAmt(t.value) || 0;
    if (t.dataset.dln != null) L[+t.dataset.dln].name = t.value;
  });
  const mvLines = () => { const box = $('[data-mvl]', mv); MV.data._q = MV._q; box.innerHTML = linesHTML(MV_K, {...MV, _q: MV._q, kind: 'manuell'}, true); const q = $('[data-dlq]', box); if (q && MV._focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } $('[data-mv="buchen"]', mv).disabled = !MV.data.lines.length; };
  mv.addEventListener('keydown', e => { if (e.target.matches('[data-dlq]') && e.key === 'Enter') { e.preventDefault(); const x = findEan(e.target.value); if (x) { mvAdd(x); } else $('[data-dladd]', mv)?.click(); } });
  const mvAdd = x => { const ex = MV.data.lines.find(l => l.ean === x.v.ean); if (ex) ex.qty = String((+ex.qty || 0) + 1); else MV.data.lines.push(newLine(MV_K, x.a, x.v)); MV._q = ''; MV._focusQ = true; mvLines(); };
  mv.addEventListener('click', e => {
    const ad = e.target.closest('[data-dladd]'); if (ad) { const x = findEan(ad.dataset.dladd); if (x) mvAdd(x); return; }
    const rx = e.target.closest('[data-dlx]'); if (rx) { MV.data.lines.splice(+rx.dataset.dlx, 1); return mvLines(); }
    if (e.target.closest('[data-dlfree]')) { MV.data.lines.push({ean: '', name: '', qty: 1, price: 0, vat: 20, disc: 0}); return mvLines(); }
    const pc = e.target.closest('[data-dpc]'); if (pc) { const c = custById(pc.dataset.dpc); MV.partner = c.id; MV.partner_name = c.name; return renderManuell(); }
    const b = e.target.closest('[data-mv]'); if (!b) return;
    if (b.dataset.mv === 'leer') { Object.assign(MV, {data: {lines: []}, partner: null, partner_name: '', note: ''}); renderManuell(); }
    if (b.dataset.mv === 'buchen') mvBook();
  });
  on('ungebucht', async e => { if (e.target.closest('[data-ug="sync"]')) { try { await afterSync(await invoke('verbund_sync')); } catch (err) { toast('Abgleich fehlgeschlagen', {t2: String(err), type: 'warn'}); } renderUngebucht(); } });
  $('#view-bon-verkaeufer').addEventListener('change', async e => {
    const s = e.target.closest('[data-bzs]'); if (!s) return;
    try { await invoke('sale_assign', {no: s.dataset.bzs, seller: s.value, customer: null, user: S.user.name}); toast('Verkäufer:in zugeordnet', {t2: `${s.dataset.bzs} → ${s.value || 'Kassier:in'}`, type: 'pos', icon: 'user'}); Hooks.emit('pos.sale.seller.assigned', {beleg: s.dataset.bzs, verkaeufer: s.value}); renderBonVerk(); }
    catch (err) { toast('Nicht möglich', {t2: String(err), type: 'warn'}); }
  });
  on('bon-kunden', e => { const b = e.target.closest('[data-bkz]'); if (b) bkPick(b.dataset.bkz); });
  on('tagesabschluesse', e => { const r = e.target.closest('[data-kbz]'); if (r) showClosing($('#view-tagesabschluesse')._z[+r.dataset.kbz]); });
  pollReservations(); setInterval(pollReservations, 45000);
}
