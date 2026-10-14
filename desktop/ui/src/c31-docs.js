
/* ════════════════════════════════════════════════════════════════════
   41 · VORGÄNGE — gemeinsame Oberfläche für alle Belegarten außerhalb
   der Kasse: Liste mit Filter, Editor mit Positionen, Statusaktionen,
   A4-Druck, E-Mail, Verlauf. Die Wirkung (Bestand, offene Beträge)
   rechnet die Datenbank in einer Transaktion.
   ════════════════════════════════════════════════════════════════════ */
const DST = {
  angekuendigt: ['angekündigt', 'info'], eingetroffen: ['eingetroffen', 'warn'], gebucht: ['gebucht', 'pos'], storniert: ['storniert', 'neg'],
  offen: ['offen', 'info'], geprueft: ['geprüft', 'accent'], freigegeben: ['freigegeben', 'warn'], teilbezahlt: ['teilbezahlt', 'warn'], bezahlt: ['bezahlt', 'pos'],
  erfasst: ['erfasst', 'info'], exportiert: ['exportiert', 'pos'], pruefung: ['in Prüfung', 'warn'], lieferant: ['beim Lieferanten', 'accent'], erledigt: ['erledigt', 'pos'], abgelehnt: ['abgelehnt', 'neg'],
  versendet: ['versendet', 'accent'], gutgeschrieben: ['gutgeschrieben', 'pos'], uebernommen: ['übernommen', 'pos'], verworfen: ['verworfen', ''],
  angenommen: ['angenommen', 'pos'], geliefert: ['geliefert', 'pos'], entwurf: ['Entwurf', ''], ausgeliefert: ['ausgeliefert', 'accent'], berechnet: ['berechnet', 'pos'],
  angefragt: ['angefragt', 'warn'], reserviert: ['reserviert', 'info'], abholbereit: ['abholbereit', 'accent'], abgeholt: ['abgeholt', 'pos'], verfallen: ['verfallen', ''],
  ausgegeben: ['ausgegeben', 'warn'], abgeschlossen: ['abgeschlossen', 'pos'], aktiv: ['aktiv', 'pos'], beendet: ['beendet', ''], umgelegt: ['umgelegt', 'pos'],
};
const dPill = s => `<span class="pill ${DST[s]?.[1] || ''}" style="height:20px">${esc(DST[s]?.[0] || s)}</span>`;
const cEur = c => eur((c || 0) / 100);
const e2c = s => { const v = parseAmt(s); return isFinite(v) ? Math.round(v * 100) : 0; };
const dDate = s => s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('de-AT') : '–';
const plusDays = n => dIso(new Date(Date.now() + n * 864e5));
const setPath = (o, p, v) => { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach(k => { x[k] = x[k] && typeof x[k] === 'object' ? x[k] : {}; x = x[k]; }); x[ks.at(-1)] = v; };

/** Belegarten: Titel, Partner (lieferant/kunde), Preisbasis (ek/vk), Kopffelder, Aktionen je Status */
const DK = {
  avis: {t: 'Wareneingang Avis', one: 'Avis', ic: 'swap', page: 'avis', perm: 'einkauf', partner: 'lieferant', price: 'ek', lines: true,
    sub: 'Angekündigte Lieferungen – bei Eintreffen prüfen und mit einem Klick einbuchen',
    head: [{k: 'ref', l: 'Lieferschein-Nr. des Lieferanten'}, {k: 'date', l: 'Liefertermin', t: 'date'}, {k: 'data.order_id', l: 'Bestellung', t: 'order'}, {k: 'data.packstuecke', l: 'Packstücke', t: 'int'}, {k: 'data.spedition', l: 'Spedition / Sendungsnr.'}],
    acts: {angekuendigt: [['eingetroffen', 'Eingetroffen'], ['buchen', 'Einbuchen', 'primary', {confirm: 'Alle Positionen jetzt einbuchen?'}], ['stornieren', 'Stornieren', 'danger']], eingetroffen: [['buchen', 'Einbuchen', 'primary', {confirm: 'Alle Positionen jetzt einbuchen?'}], ['stornieren', 'Stornieren', 'danger']]}},
  er: {t: 'Rechnungen', one: 'Eingangsrechnung', ic: 'receipt', page: 'er', perm: 'rechnungen', partner: 'lieferant', amount: true,
    sub: 'Eingangsrechnungen der Lieferanten – erfassen, gegen Wareneingang prüfen, freigeben, bezahlen',
    head: [{k: 'data.rechnungsnr', l: 'Rechnungsnummer', req: true}, {k: 'date', l: 'Rechnungsdatum', t: 'date'}, {k: 'due', l: 'Fällig am', t: 'date'}, {k: 'data.betrag', l: 'Betrag brutto €', t: 'money'}, {k: 'data.netto', l: 'davon netto €', t: 'money'},
      {k: 'data.skonto_pct', l: 'Skonto %', t: 'num'}, {k: 'data.skonto_bis', l: 'Skonto bis', t: 'date'}, {k: 'data.bestellungen', l: 'Zu Bestellungen (Rechnungsprüfung)', t: 'orders', full: true}, {k: 'data.notiz', l: 'Notiz', full: true}],
    acts: {offen: [['pruefen', 'Prüfen'], ['freigeben', 'Freigeben', 'primary'], ['stornieren', 'Stornieren', 'danger']], geprueft: [['pruefen', 'Neu prüfen'], ['freigeben', 'Freigeben', 'primary'], ['stornieren', 'Stornieren', 'danger']], freigegeben: [['stornieren', 'Stornieren', 'danger']]}},
  zahlung: {t: 'Zahlungen', one: 'Zahlung', ic: 'cash', page: 'zahlungen', perm: 'rechnungen', partner: 'lieferant', amount: true, sub: 'Zahlungsausgänge an Lieferanten, Zahlungsvorschlag und SEPA-Überweisungsdatei',
    head: [{k: 'date', l: 'Zahldatum', t: 'date'}, {k: 'data.art', l: 'Zahlungsart', t: 'select', o: ['Überweisung', 'SEPA-Datei', 'Lastschrift', 'Bar', 'Kreditkarte']}, {k: 'ref', l: 'Verwendungszweck', full: true}],
    acts: {erfasst: [['stornieren', 'Stornieren', 'danger', {confirm: 'Zahlung stornieren? Die Rechnungen werden wieder offen.'}]], exportiert: [['stornieren', 'Stornieren', 'danger', {confirm: 'Zahlung stornieren? Die Rechnungen werden wieder offen.'}]]}},
  reklamation: {t: 'Vorerfassung Reklamation', one: 'Reklamation', ic: 'edit', page: 'reklamationen', perm: 'kasse.retoure', partner: 'kunde', price: 'vk', lines: true, single: true,
    sub: 'Reklamationen von Kund:innen aufnehmen, prüfen, an den Lieferanten weitergeben und abschließen',
    head: [{k: 'ref', l: 'Kassenbeleg (Kauf)'}, {k: 'data.kaufdatum', l: 'Kaufdatum', t: 'date'}, {k: 'data.grund', l: 'Rückgabegrund', t: 'grund'}, {k: 'data.zustand', l: 'Zustand', t: 'select', o: ['neuwertig', 'gebraucht', 'beschädigt', 'defekt']},
      {k: 'data.mangel', l: 'Mangel / Beschreibung', t: 'area', full: true, req: true}, {k: 'data.entscheidung', l: 'Lösung', t: 'select', o: ['offen', 'Reparatur', 'Umtausch', 'Gutschrift', 'Geld zurück', 'Lieferantenreklamation', 'abgelehnt']},
      {k: 'due', l: 'Erledigen bis', t: 'date'}, {k: 'data.lieferant', l: 'Lieferant', t: 'supplier'}],
    ext: [{k: 'data.seriennr', l: 'Seriennummer'}, {k: 'data.telefon', l: 'Telefon'}, {k: 'data.email', l: 'E-Mail'}, {k: 'data.kosten', l: 'Kostenvoranschlag €', t: 'money'}, {k: 'data.ersatz', l: 'Leihgerät / Ersatz'}, {k: 'data.intern', l: 'Interne Notiz', t: 'area', full: true}],
    acts: {erfasst: [['pruefen', 'In Prüfung'], ['lieferant', 'An Lieferanten'], ['erledigen', 'Erledigt', 'primary'], ['ablehnen', 'Ablehnen', 'danger']], pruefung: [['lieferant', 'An Lieferanten'], ['erledigen', 'Erledigt', 'primary'], ['ablehnen', 'Ablehnen', 'danger']], lieferant: [['erledigen', 'Erledigt', 'primary'], ['ablehnen', 'Ablehnen', 'danger']], erledigt: [['wiedereroeffnen', 'Wieder öffnen']], abgelehnt: [['wiedereroeffnen', 'Wieder öffnen']]}},
  lretoure: {t: 'Retouren an Lieferanten', one: 'Lieferantenretoure', ic: 'undo', page: 'lretouren', perm: 'einkauf', partner: 'lieferant', price: 'ek', lines: true,
    sub: 'Ware an den Lieferanten zurücksenden – bucht beim Versand aus, Gutschrift erfassen',
    head: [{k: 'ref', l: 'RMA- / Rücksendenummer'}, {k: 'data.grund', l: 'Grund', t: 'grund'}, {k: 'data.versand', l: 'Versand / Sendungsnr.'}, {k: 'data.notiz', l: 'Notiz', full: true}],
    acts: {erfasst: [['versenden', 'Versenden (bucht aus)', 'primary', {confirm: 'Ware als versendet buchen? Der Bestand wird reduziert.'}], ['stornieren', 'Stornieren', 'danger']], versendet: [['gutschrift', 'Gutschrift erhalten', 'primary', {ask: [{k: 'betrag', l: 'Gutschrift brutto €', t: 'money'}, {k: 'beleg', l: 'Gutschrift-Nr.'}, {k: 'datum', l: 'Datum', t: 'date'}]}], ['ablehnen', 'Abgelehnt (bucht zurück)', 'danger', {confirm: 'Lieferant hat abgelehnt – Ware wieder einbuchen?'}]]}},
  warenkorb: {t: 'Warenkörbe', one: 'Warenkorb', ic: 'bag', page: 'warenkoerbe', partner: 'kunde', optPartner: true, price: 'vk', lines: true, sub: 'Vorbereitete Einkäufe – z. B. telefonisch oder am Beratungsplatz erfasst, an der Kasse übernehmen',
    head: [{k: 'due', l: 'Gültig bis', t: 'date'}, {k: 'data.notiz', l: 'Notiz', full: true}],
    acts: {offen: [['uebernehmen', 'An Kasse übernehmen', 'primary'], ['verwerfen', 'Verwerfen', 'danger']], verworfen: [['reaktivieren', 'Wieder öffnen']], uebernommen: [['reaktivieren', 'Wieder öffnen']]}},
  angebot: {t: 'Angebote', one: 'Angebot', ic: 'edit', page: 'angebote', perm: 'faktura', partner: 'kunde', price: 'vk', lines: true, disc: true, free: true, print: 'Angebot', sub: 'Angebote an Firmen- und Vereinskund:innen – annehmen und als Auftrag oder Rechnung weiterführen',
    head: [{k: 'date', l: 'Datum', t: 'date'}, {k: 'due', l: 'Gültig bis', t: 'date'}, {k: 'ref', l: 'Ihre Anfrage / Referenz'}, {k: 'data.text', l: 'Einleitungstext', t: 'area', full: true}],
    acts: {offen: [['annehmen', 'Angenommen', 'primary'], ['ablehnen', 'Abgelehnt', 'danger']], abgelehnt: [['reaktivieren', 'Wieder öffnen']]}, conv: [['auftrag', 'Als Auftrag'], ['rechnung', 'Als Rechnung']]},
  auftrag: {t: 'Aufträge', one: 'Auftrag', ic: 'list', page: 'auftraege', perm: 'faktura', partner: 'kunde', price: 'vk', lines: true, disc: true, free: true, print: 'Auftragsbestätigung', sub: 'Kundenaufträge – liefern per Lieferschein, berechnen per Rechnung',
    head: [{k: 'date', l: 'Datum', t: 'date'}, {k: 'due', l: 'Liefertermin', t: 'date'}, {k: 'ref', l: 'Bestellnummer des Kunden'}, {k: 'data.text', l: 'Text', t: 'area', full: true}],
    acts: {offen: [['stornieren', 'Stornieren', 'danger']]}, conv: [['lieferschein', 'Lieferschein erstellen'], ['rechnung', 'Rechnung erstellen']]},
  lieferschein: {t: 'Lieferscheine', one: 'Lieferschein', ic: 'truck', page: 'lieferscheine', perm: 'faktura', partner: 'kunde', price: 'vk', lines: true, free: true, print: 'Lieferschein', sub: 'Lieferscheine – beim Ausliefern wird der Bestand gebucht',
    head: [{k: 'date', l: 'Lieferdatum', t: 'date'}, {k: 'ref', l: 'Bezug (Auftrag)'}, {k: 'data.text', l: 'Text', t: 'area', full: true}],
    acts: {entwurf: [['ausliefern', 'Ausliefern (bucht Bestand)', 'primary', {confirm: 'Lieferschein ausliefern? Der Bestand wird reduziert.'}], ['stornieren', 'Stornieren', 'danger']], ausliefern: [], ausgeliefert: [['stornieren', 'Stornieren (bucht zurück)', 'danger', {confirm: 'Lieferschein stornieren und Ware wieder einbuchen?'}]]}, conv: [['rechnung', 'Rechnung erstellen']]},
  rechnung: {t: 'Rechnungen (Faktura)', one: 'Rechnung', ic: 'receipt', page: 'rechnungen', perm: 'faktura', partner: 'kunde', price: 'vk', lines: true, disc: true, free: true, print: 'Rechnung', sub: 'Ausgangsrechnungen auf Ziel – Zahlungseingang erfassen, mahnen',
    head: [{k: 'date', l: 'Rechnungsdatum', t: 'date'}, {k: 'data.zahlungsziel', l: 'Zahlungsziel (Tage)', t: 'int'}, {k: 'ref', l: 'Bezug (Auftrag / Lieferschein)'}, {k: 'data.bestand', l: 'Bestand beim Stellen buchen (nicht bei Rechnung aus Lieferschein)', t: 'check', full: true}, {k: 'data.text', l: 'Text', t: 'area', full: true}],
    acts: {entwurf: [['stellen', 'Rechnung stellen', 'primary'], ['stornieren', 'Verwerfen', 'danger']], offen: [['zahlung', 'Zahlung erfassen', 'primary', {ask: [{k: 'betrag', l: 'Betrag €', t: 'money', def: d => num(d.open / 100, 2)}, {k: 'datum', l: 'Datum', t: 'date'}, {k: 'art', l: 'Zahlungsart', t: 'select', o: ['Überweisung', 'Bar (über Kasse)', 'Karte', 'Lastschrift', 'Verrechnung']}]}], ['mahnen', 'Mahnung'], ['stornieren', 'Stornieren', 'danger']],
      teilbezahlt: [['zahlung', 'Zahlung erfassen', 'primary', {ask: [{k: 'betrag', l: 'Betrag €', t: 'money', def: d => num(d.open / 100, 2)}, {k: 'datum', l: 'Datum', t: 'date'}, {k: 'art', l: 'Zahlungsart', t: 'select', o: ['Überweisung', 'Bar (über Kasse)', 'Karte', 'Lastschrift', 'Verrechnung']}]}], ['mahnen', 'Mahnung']]}},
  reservierung: {t: 'Reservierungen', one: 'Reservierung', ic: 'clock', page: 'reservierungen', partner: 'kunde', optPartner: true, price: 'vk', lines: true, print: 'Abholschein', sub: 'Zurückgelegte Ware – aus dem Geschäft, telefonisch oder über das digitale Schaufenster',
    head: [{k: 'due', l: 'Abholen bis', t: 'date'}, {k: 'data.kontakt.telefon', l: 'Telefon'}, {k: 'data.kontakt.email', l: 'E-Mail'}, {k: 'data.quelle', l: 'Quelle', t: 'select', o: ['Geschäft', 'Telefon', 'Schaufenster', 'E-Mail']}, {k: 'data.nachricht', l: 'Nachricht / Notiz', t: 'area', full: true}],
    acts: {angefragt: [['bestaetigen', 'Bestätigen', 'primary'], ['stornieren', 'Ablehnen', 'danger']], reserviert: [['abholbereit', 'Abholbereit melden'], ['abholen', 'Abholung an Kasse', 'primary'], ['verfallen', 'Verfallen'], ['stornieren', 'Stornieren', 'danger']], abholbereit: [['abholen', 'Abholung an Kasse', 'primary'], ['verfallen', 'Verfallen'], ['stornieren', 'Stornieren', 'danger']]}},
  auswahl: {t: 'Auswahlverwaltung', one: 'Auswahl', ic: 'layers', page: 'auswahl', partner: 'kunde', price: 'vk', lines: true, print: 'Auswahlschein', sub: 'Ware zur Ansicht mitgeben – Rücklauf erfassen, gekaufte Teile an der Kasse abrechnen',
    head: [{k: 'due', l: 'Rückgabe bis', t: 'date'}, {k: 'data.pfand', l: 'Kaution / Pfand €', t: 'money'}, {k: 'data.notiz', l: 'Notiz', t: 'area', full: true}],
    acts: {entwurf: [['ausgeben', 'Ausgeben (bucht aus)', 'primary', {confirm: 'Ware ausgeben? Der Bestand wird reduziert, bis die Teile zurückkommen.'}], ['stornieren', 'Verwerfen', 'danger']], ausgegeben: []}},
};
const DOCS = {};      // Listen je Seite
const DOCF = {};      // Filter je Seite {st, q}

async function docLoad(kinds) { return invoke('doc_list', {kinds: Array.isArray(kinds) ? kinds : [kinds], status: null, limit: 3000}); }
const partnerLabel = k => DK[k]?.partner === 'lieferant' ? 'Lieferant' : 'Kunde';

/** Listenansicht einer Belegart (oder mehrerer) als Seite */
function docPage(page, kinds, o = {}) {
  const k0 = Array.isArray(kinds) ? kinds[0] : kinds, K = DK[k0];
  registerPage(page, {title: o.title || K.t, sub: () => o.subShort || K.one + (Array.isArray(kinds) && kinds.length > 1 ? 'e' : ''), render: () => renderDocPage(page, kinds, o)});
  if (K.perm) VIEW_PERM[page] = K.perm;
}
async function renderDocPage(page, kinds, o = {}) {
  const v = $('#view-' + page), k0 = Array.isArray(kinds) ? kinds[0] : kinds, K = DK[k0];
  if (!DESKTOP) { v.innerHTML = desktopEmpty(K.ic, o.title || K.t); return; }
  const f = DOCF[page] ||= {st: o.defTab || 'offen', q: ''};
  if (!DOCS[page]) v.innerHTML = `<div class="cv">${pageHead(o.title || K.t, K.sub)}${loadingCard('Lade')}</div>`;
  try { DOCS[page] = await docLoad(kinds); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  if (K.partner === 'lieferant') await loadSuppliers();
  const list = DOCS[page];
  const tabs = o.tabs || [['offen', 'Offen', s => !['storniert', 'gebucht', 'bezahlt', 'erledigt', 'abgelehnt', 'gutgeschrieben', 'uebernommen', 'verworfen', 'abgeholt', 'verfallen', 'abgeschlossen', 'berechnet', 'geliefert', 'angenommen', 'umgelegt', 'beendet', 'exportiert'].includes(s)], ['alle', 'Alle', () => true]];
  const tabFn = (tabs.find(t => t[0] === f.st) || tabs[0])[2];
  const n = norm(f.q);
  const rows = list.filter(d => tabFn(d.status, d) && (!n || norm(`${d.no} ${d.partner_name} ${d.ref} ${d.data?.rechnungsnr || ''} ${(d.data?.lines || []).map(l => l.name + ' ' + (l.ean || '')).join(' ')}`).includes(n)));
  const kpi = o.kpi ? o.kpi(list) : [[num(list.filter(d => tabs[0][2](d.status, d)).length), tabs[0][1]], [num(list.length), 'insgesamt']];
  const cols = o.cols || [];
  v.innerHTML = `<div class="cv">${pageHead(o.title || K.t, K.sub, `${o.actions || ''}${o.noNew ? '' : `<button class="btn btn-primary" data-dnew="${k0}">${ic('plus', 'i-sm')}${esc(o.newLabel || 'Neu: ' + K.one)}</button>`}`)}
    ${kpiCards(kpi)}
    <div class="filters"><input class="input" data-dq="${page}" placeholder="Nummer, ${partnerLabel(k0)}, Artikel, EAN …" value="${esc(f.q)}" style="flex:1;min-width:220px;max-width:420px">
      <div class="seg" data-dseg="${page}">${tabs.map(([kk, l]) => `<button data-v="${kk}" aria-pressed="${f.st === kk}">${esc(l)}</button>`).join('')}</div></div>
    ${o.above ? o.above(list) : ''}
    <div class="card">${rows.length ? `<table class="tbl art-tbl" style="margin:0"><thead><tr>${o.check ? '<th style="padding-left:16px;width:34px"><input type="checkbox" data-dall></th>' : ''}<th style="${o.check ? '' : 'padding-left:16px'}">Nummer</th><th>Datum</th><th>${o.partnerCol || partnerLabel(k0)}</th>${cols.map(c => `<th class="${c.r ? 'r' : ''}">${esc(c.l)}</th>`).join('')}<th>Status</th><th class="r" style="padding-right:16px">${K.amount || K.price === 'vk' || K.price === 'ek' ? 'Betrag' : ''}</th></tr></thead><tbody>
      ${rows.slice(0, 500).map(d => `<tr data-dopen="${d.id}" style="cursor:pointer">${o.check ? `<td style="padding-left:16px" onclick="event.stopPropagation()"><input type="checkbox" data-dchk="${d.id}"></td>` : ''}<td style="${o.check ? '' : 'padding-left:16px'}"><b class="mono">${esc(d.no)}</b>${Array.isArray(kinds) && kinds.length > 1 ? `<div class="muted" style="font-size:11.5px">${esc(DK[d.kind]?.one || d.kind)}</div>` : ''}</td><td class="muted num">${esc(dDate(d.date))}</td><td>${esc(d.partner_name || '–')}${d.ref ? `<div class="muted" style="font-size:11.5px">${esc(d.ref)}</div>` : ''}</td>${cols.map(c => `<td class="${c.r ? 'r num' : ''}">${c.f(d)}</td>`).join('')}<td>${dPill(d.status)}${d.due && !['bezahlt', 'storniert', 'abgeholt', 'erledigt', 'abgeschlossen', 'gebucht'].includes(d.status) && d.due < today() ? ' <span class="pill neg" style="height:20px">überfällig</span>' : ''}</td><td class="r num" style="padding-right:16px;font-weight:600">${K.amount || K.price ? cEur(d.total) : ''}${(d.kind === 'er' || d.kind === 'rechnung') && d.open && d.open !== d.total ? `<div class="muted" style="font-size:11.5px;font-weight:400">offen ${cEur(d.open)}</div>` : ''}</td></tr>`).join('')}</tbody></table>${rows.length > 500 ? `<div class="muted" style="padding:10px 16px;font-size:12px">${num(rows.length - 500)} weitere – Suche eingrenzen</div>` : ''}`
      : `<div class="empty" style="padding:52px 20px"><div class="empty-icon">${ic(K.ic)}</div><h3>Keine Einträge</h3><p>${esc(o.empty || 'Filter ändern oder neu anlegen.')}</p></div>`}</div></div>`;
  initSeg($(`[data-dseg="${page}"]`, v), b => { f.st = b.dataset.v; renderDocPage(page, kinds, o); });
  const q = $(`[data-dq="${page}"]`, v); q.oninput = () => { f.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { renderDocPage(page, kinds, o).then(() => { const x = $(`[data-dq="${page}"]`); x?.focus(); x?.setSelectionRange(x.value.length, x.value.length); }); }, 250); };
}
const docRefresh = () => { const p = PAGES[S.view]; if (p) p.render(); };

/* ── Partner (Lieferant / Kunde) ── */
function partnerField(K, st, edit) {
  if (K.partner === 'lieferant') return `<label class="field"><span>Lieferant</span><select class="input select" data-dp="sup" ${edit ? '' : 'disabled'}><option value="">– wählen –</option>${SUPPLIERS.map(s => `<option value="${esc(s.id)}" ${s.id === st.partner ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`;
  return `<label class="field" style="position:relative"><span>Kunde${K.optPartner ? ' / Name' : ''}</span><input class="input" data-dp="cust" value="${esc(st.partner_name)}" placeholder="Name, Kundennummer oder E-Mail" autocomplete="off" ${edit ? '' : 'readonly'}>${st.partner ? `<span class="muted" style="font-size:11.5px">${esc(st.partner)}${custById(st.partner)?.email ? ' · ' + esc(custById(st.partner).email) : ''}</span>` : ''}<div data-dpl style="position:absolute;left:0;right:0;top:62px;z-index:6"></div></label>`;
}
function custHits(q) { const n = norm(q.trim()); if (n.length < 2) return []; return CUSTOMERS.filter(c => norm(`${c.name} ${c.id} ${c.email} ${c.phone}`).includes(n)).slice(0, 7); }

/* ── Kopffelder ── */
function headField(f, st, edit, orders) {
  const v = getPath(st, f.k), dis = edit ? '' : 'disabled';
  const lbl = `<span>${esc(f.l)}${f.req ? ' *' : ''}</span>`, cls = `field${f.full ? ' full' : ''}`;
  if (f.t === 'date') return `<label class="${cls}">${lbl}<input class="input" type="date" data-dh="${f.k}" value="${esc(v || '')}" ${dis}></label>`;
  if (f.t === 'money') return `<label class="${cls}">${lbl}<input class="input num" data-dh="${f.k}" data-money value="${v != null && v !== '' ? esc(num(v / 100, 2)) : ''}" inputmode="decimal" placeholder="0,00" ${dis}></label>`;
  if (f.t === 'int' || f.t === 'num') return `<label class="${cls}">${lbl}<input class="input num" data-dh="${f.k}" data-${f.t} value="${esc(v ?? '')}" inputmode="decimal" ${dis}></label>`;
  if (f.t === 'area') return `<label class="${cls}">${lbl}<textarea class="input" rows="3" data-dh="${f.k}" style="height:auto;padding:9px 12px" ${dis}>${esc(v || '')}</textarea></label>`;
  if (f.t === 'check') return `<label class="${cls}" style="flex-direction:row;align-items:center;gap:10px;display:flex"><input type="checkbox" data-dh="${f.k}" data-check ${v ? 'checked' : ''} ${dis}><span style="font-size:13px">${esc(f.l)}</span></label>`;
  if (f.t === 'select' || f.t === 'grund' || f.t === 'supplier') {
    const opts = f.t === 'grund' ? retGruende().map(g => [g.text, g.text]) : f.t === 'supplier' ? [['', '–'], ...SUPPLIERS.map(s => [s.id, s.name])] : f.o.map(x => [x, x]);
    return `<label class="${cls}">${lbl}<select class="input select" data-dh="${f.k}" ${dis}>${f.t === 'grund' ? '<option value="">–</option>' : ''}${opts.map(([a, b]) => `<option value="${esc(a)}" ${String(v ?? '') === a ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
  }
  if (f.t === 'order') return `<label class="${cls}">${lbl}<select class="input select" data-dh="${f.k}" data-int ${dis}><option value="">– ohne Bestellung –</option>${orders.map(p => `<option value="${p.id}" ${+v === p.id ? 'selected' : ''}>${esc(p.no)} · ${esc(PO_ST[p.status]?.[0] || p.status)} · ${num(p.qty - p.received)} offen</option>`).join('')}</select></label>`;
  if (f.t === 'orders') { const sel = new Set(v || []); return `<div class="${cls}">${lbl}<div style="display:flex;flex-wrap:wrap;gap:6px">${orders.length ? orders.map(p => `<label class="chip" style="cursor:pointer"><input type="checkbox" data-dord="${p.id}" ${sel.has(p.id) ? 'checked' : ''} ${dis} style="margin:0 4px 0 0">${esc(p.no)} · ${cEur(p.value)}</label>`).join('') : '<span class="muted" style="font-size:12.5px">Keine Bestellungen dieses Lieferanten</span>'}</div></div>`; }
  return `<label class="${cls}">${lbl}<input class="input" data-dh="${f.k}" value="${esc(v ?? '')}" ${dis}></label>`;
}

/* ── Positionen ── */
const lineName = (a, v) => `${a.name} · ${colorName(v.c)} · ${v.s}`;
function newLine(K, a, v, qty = 1) {
  const price = K.price === 'ek' ? Math.round((a.cost ?? 0) * 100) : Math.round((a.sale || a.price) * 100);
  return {ean: v.ean, sku: a.id, name: lineName(a, v), qty, price, vat: a.vat ?? 20, disc: 0};
}
function linesHTML(K, st, edit) {
  const L = st.data.lines ||= [];
  const hits = () => { const toks = norm((st._q || '').trim()).split(/\s+/).filter(Boolean); if (!toks.length) return []; return ART.flatMap(a => a.variants.map(v => ({a, v}))).filter(({a, v}) => toks.every(t => a.hay.includes(t) || v.ean.startsWith(t) || norm(`${colorName(v.c)} ${v.s}`).includes(t))).slice(0, 8); };
  const sum = L.reduce((s, l) => s + Math.round((+l.qty || 0) * (+l.price || 0) * (1 - (+l.disc || 0) / 100)), 0);
  const showSt = st.kind === 'auswahl' && st.status !== 'entwurf';
  return `${edit && !(K.single && L.length) ? `<div style="position:relative"><label class="search-field" style="height:42px">${ic('search')}<input data-dlq placeholder="Artikel, Farbe, Größe oder EAN (Scanner) …" value="${esc(st._q || '')}" autocomplete="off"></label>
      ${st._q ? `<div class="card" style="position:absolute;left:0;right:0;top:46px;z-index:6;overflow:hidden;box-shadow:var(--shadow-3)">${hits().map(({a, v}) => `<button class="pal-i" style="height:46px;border-radius:0" data-dladd="${esc(v.ean)}"><span style="flex:1;text-align:left"><b>${esc(a.name)}</b> <span class="muted">· ${esc(colorName(v.c))} · ${esc(v.s)} · Bestand ${v.q}</span></span><span class="muted">${K.price === 'ek' ? (a.cost != null ? eur(a.cost) : '') : eur(a.sale || a.price)}</span></button>`).join('') || '<div class="muted" style="padding:12px">Kein Treffer</div>'}</div>` : ''}</div>` : ''}
    <div class="card" style="overflow:hidden">${L.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:14px">Position</th><th class="r">Menge</th>${K.price ? `<th class="r">${K.price === 'ek' ? 'EK netto' : 'Preis'}</th>` : ''}${K.disc ? '<th class="r">Rabatt %</th>' : ''}${showSt ? '<th class="r">zurück</th><th class="r">gekauft</th>' : ''}${K.price ? '<th class="r" style="padding-right:14px">Summe</th>' : ''}${edit ? '<th></th>' : ''}</tr></thead><tbody>
      ${L.map((l, i) => `<tr><td style="padding-left:14px">${edit && !l.ean ? `<input class="input" data-dln="${i}" value="${esc(l.name)}" placeholder="Bezeichnung" style="height:32px">` : `<b>${esc(l.name)}</b>`}${l.ean ? `<div class="muted" style="font-size:11.5px">EAN ${esc(l.ean)}${(() => { const x = findEan(l.ean); return x ? ` · Bestand ${x.v.q}` : ''; })()}</div>` : ''}</td>
        <td class="r">${edit ? `<input class="input num" data-dlqty="${i}" value="${esc(l.qty)}" inputmode="numeric" style="width:64px;height:32px;text-align:right">` : `<span class="num">${l.qty}</span>`}</td>
        ${K.price ? `<td class="r">${edit ? `<input class="input num" data-dlp="${i}" value="${esc(l._p ?? num((l.price || 0) / 100, 2))}" inputmode="decimal" style="width:90px;height:32px;text-align:right">` : cEur(l.price)}</td>` : ''}
        ${K.disc ? `<td class="r">${edit ? `<input class="input num" data-dld="${i}" value="${esc(l.disc || '')}" inputmode="decimal" placeholder="0" style="width:56px;height:32px;text-align:right">` : (l.disc ? l.disc + ' %' : '–')}</td>` : ''}
        ${showSt ? `<td class="r num">${l.zurueck || 0}</td><td class="r num">${l.gekauft || 0}</td>` : ''}
        ${K.price ? `<td class="r num" style="padding-right:14px">${cEur(Math.round((+l.qty || 0) * (+l.price || 0) * (1 - (+l.disc || 0) / 100)))}</td>` : ''}${edit ? `<td><button class="btn btn-ghost btn-icon btn-sm" data-dlx="${i}" aria-label="Entfernen">${ic('x', 'i-sm')}</button></td>` : ''}</tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:22px"><p>${edit ? 'Noch keine Positionen – oben suchen oder scannen.' : 'Keine Positionen'}</p></div>`}</div>
    ${edit && K.free ? `<div><button class="btn btn-ghost btn-sm" data-dlfree>${ic('plus', 'i-sm')}Freie Position (Dienstleistung, Text)</button></div>` : ''}
    ${K.price && L.length ? `<div class="preview-box"><span>Summe ${K.price === 'ek' ? '(EK netto)' : '(brutto)'}<br><span class="muted" style="font-size:12px">${num(L.reduce((s, l) => s + (+l.qty || 0), 0))} Stück</span></span><b data-dsum>${cEur(sum)}</b></div>` : ''}`;
}

/** Editor für einen Vorgang (neu: preset mit Startwerten) */
async function openDoc(kind, id, preset = {}) {
  const K = DK[kind];
  if (K.perm) { try { await needPerm(K.perm, K.one); } catch { return; } }
  let d = null;
  if (id) { try { d = await invoke('doc_get', {id}); } catch (e) { return toast('Nicht verfügbar', {t2: String(e), type: 'warn'}); } kind = d.kind; }
  if (K.partner === 'lieferant') await loadSuppliers();
  const st = d ? JSON.parse(JSON.stringify(d)) : {kind, status: null, partner: preset.partner || null, partner_name: preset.partner_name || '', ref: preset.ref || '', date: preset.date || today(), due: preset.due || null, data: {lines: [], ...(preset.data || {})}};
  if (!d && kind === 'sendung' && CFG['allg.spediteur']) { const sp = stRows('spediteur').find(x => x.id === CFG['allg.spediteur']); if (sp && !st.data.spediteur) st.data.spediteur = sp.name; }
  if (!d && kind === 'reservierung') { st.due ||= plusDays(3); st.data.quelle ||= 'Geschäft'; }
  if (!d && kind === 'warenkorb') st.due ||= plusDays(7);
  if (!d && kind === 'angebot') st.due ||= plusDays(30);
  if (!d && kind === 'er' && st.partner) lfEiVorgabe(st);
  if (!d && kind === 'auswahl') st.due ||= plusDays(3);
  if (!d && kind === 'rechnung') { st.data.zahlungsziel ??= 14; st.data.bestand ??= true; }
  const edit = () => !st.id || (DOC_EDIT[kind] || []).includes(st.status);
  let orders = [];
  const loadOrders = async () => { if (K.head.some(f => f.t === 'order' || f.t === 'orders')) { try { await loadPurchasing(); } catch { /* */ } orders = EK.pos.filter(p => !st.partner || p.supplier_id === st.partner).filter(p => p.status !== 'storniert'); } };
  await loadOrders();
  const el = openLayer(`<div class="drawer-panel" style="width:min(820px,100%)" role="dialog" aria-modal="true" aria-label="${esc(K.one)}"><div data-dbox style="display:flex;flex-direction:column;min-height:0;flex:1"></div></div>`, {cls: 'drawer'});
  const box = $('[data-dbox]', el);
  const showExt = () => K.ext && (st._ext ?? (preset.ext || K.ext.some(f => getPath(st, f.k))));
  const render = () => {
    const E = edit();
    const acts = st.id ? (K.acts[st.status] || []) : [];
    const log = d?.log || [];
    box.innerHTML = `<div class="m-head" style="padding-bottom:12px"><div class="m-ic">${ic(K.ic)}</div><div style="min-width:0"><h2>${st.id ? `${esc(K.one)} ${esc(st.no)}` : 'Neu: ' + esc(K.one)} ${st.status ? dPill(st.status) : ''}</h2><p>${st.id ? `angelegt ${esc(fmtTs(st.created_at))}${st.user ? ' von ' + esc(st.user) : ''}${st.updated_at !== st.created_at ? ` · geändert ${esc(fmtTs(st.updated_at))}` : ''}` : esc(K.sub)}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="drawer-body" style="display:grid;gap:14px;align-content:start">
        ${(kind === 'er' || kind === 'rechnung') && st.id ? kpiCards([[cEur(st.total), 'Betrag'], [cEur(st.open), 'offen', st.open ? 'warn' : 'pos'], [st.due ? dDate(st.due) : '–', 'fällig', st.due && st.due < today() && st.open ? 'neg' : ''], ...(kind === 'rechnung' && st.data.mahnstufe ? [[num(st.data.mahnstufe), 'Mahnstufe', 'neg']] : [])]) : ''}
        <div class="ed-grid">${partnerField(K, st, E)}${K.head.map(f => headField(f, st, E, orders)).join('')}</div>
        ${K.ext ? `<div><button class="btn btn-ghost btn-sm" data-dext>${ic(showExt() ? 'chevron-down' : 'chevron-right', 'i-sm')}Erweiterte Angaben</button></div>${showExt() ? `<div class="ed-grid">${K.ext.map(f => headField(f, st, E, orders)).join('')}</div>` : ''}` : ''}
        ${kind === 'er' && st.data.pruefung ? `<div class="prompt-hint blk" style="color:${st.data.pruefung.ok ? 'var(--pos)' : 'var(--warn)'}">${ic(st.data.pruefung.ok ? 'check' : 'alert', 'i-xs')}Rechnungsprüfung ${esc(fmtTs(st.data.pruefung.zeit))}: erwartet laut Wareneingang ${cEur(st.data.pruefung.erwartet)} netto, Rechnung ${cEur(st.data.pruefung.netto)} – Differenz ${cEur(st.data.pruefung.differenz)}${st.data.pruefung.ok ? ' · in Ordnung' : st.data.bestellungen?.length ? ' · bitte klären' : ' · keine Bestellung zugeordnet'}</div>` : ''}
        ${K.lines ? linesHTML(K, st, E) : ''}
        ${DOC_EXTRA[kind] ? DOC_EXTRA[kind](st, E) : ''}
        ${(st.data.zahlungen || []).length ? `<div class="card"><div class="set-row"><div class="set-l">Zahlungseingänge</div></div><table class="tbl" style="margin:0"><tbody>${st.data.zahlungen.map(z => `<tr><td style="padding-left:16px">${esc(dDate(z.datum))}</td><td>${esc(z.art)}</td><td class="muted">${esc(z.von || '')}</td><td class="r num" style="padding-right:16px">${cEur(z.betrag)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${(st.data.notizen || []).length ? `<div class="card" style="padding:12px 16px;display:grid;gap:6px">${st.data.notizen.map(nn => `<div style="font-size:13px"><span class="muted">${esc(fmtTs(nn.ts))} · ${esc(nn.von)} · ${esc(nn.aktion)}:</span> ${esc(nn.text)}</div>`).join('')}</div>` : ''}
        ${log.length ? `<details class="card" style="padding:12px 16px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Verlauf (${log.length})</summary><div style="display:grid;gap:4px;margin-top:8px">${log.map(x => `<div style="font-size:12.5px"><span class="muted num">${esc(fmtTs(x.ts))}</span> · <b>${esc(x.action)}</b>${x.user ? ' · ' + esc(x.user) : ''}${Object.keys(x.detail || {}).length ? ` <span class="muted">${esc(prText(x.detail))}</span>` : ''}</div>`).join('')}</div></details>` : ''}
      </div>
      <div class="m-foot" style="border-top:1px solid var(--line);padding-top:14px;flex-wrap:wrap;gap:8px">
        ${st.id && K.print ? `<button class="btn btn-ghost" data-dprint>${ic('printer', 'i-sm')}Drucken</button>` : ''}${st.id && K.print && K.partner === 'kunde' ? `<button class="btn btn-ghost" data-dmail>${ic('mail', 'i-sm')}E-Mail</button>` : ''}
        ${st.id && K.conv && !['storniert', 'abgelehnt'].includes(st.status) ? K.conv.map(([to, l]) => `<button class="btn btn-ghost" data-dconv="${to}">${ic('arrow-right', 'i-sm')}${esc(l)}</button>`).join('') : ''}
        ${DOC_BTNS[kind] ? DOC_BTNS[kind](st) : ''}
        <span class="sp"></span>
        ${acts.filter(a => a[2] === 'danger').map(([a, l]) => `<button class="btn btn-danger" data-dact="${a}">${esc(l)}</button>`).join('')}
        ${acts.filter(a => a[2] !== 'danger' && a[2] !== 'primary').map(([a, l]) => `<button class="btn btn-secondary" data-dact="${a}">${esc(l)}</button>`).join('')}
        ${E ? `<button class="btn ${acts.some(a => a[2] === 'primary') ? 'btn-secondary' : 'btn-primary'}" data-dsave>${ic('check', 'i-sm')}Speichern</button>` : ''}
        ${acts.filter(a => a[2] === 'primary').map(([a, l]) => `<button class="btn btn-primary" data-dact="${a}">${esc(l)}</button>`).join('')}</div>`;
    if (st._q != null && st._focusQ) { const q = $('[data-dlq]', box); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  };
  const collect = () => {
    $$('[data-dh]', box).forEach(i => {
      let v = i.value;
      if (i.dataset.check != null) v = i.checked; else if (i.dataset.money != null) v = i.value.trim() === '' ? null : e2c(i.value); else if (i.dataset.int != null) v = i.value === '' ? null : parseInt(i.value, 10); else if (i.dataset.num != null) v = i.value === '' ? null : parseAmt(i.value);
      setPath(st, i.dataset.dh, v);
    });
    if ($$('[data-dord]', box).length) st.data.bestellungen = $$('[data-dord]', box).filter(c => c.checked).map(c => +c.dataset.dord);
    const sp = $('[data-dp="sup"]', box); if (sp) { st.partner = sp.value || null; st.partner_name = SUPPLIERS.find(s => s.id === sp.value)?.name || ''; }
    const cp = $('[data-dp="cust"]', box); if (cp) { if (cp.value.trim() !== st.partner_name) { st.partner = null; } st.partner_name = cp.value.trim(); }
    (st.data.lines || []).forEach((l, i) => { const p = $(`[data-dlp="${i}"]`, box); if (p) { l.price = e2c(p.value); delete l._p; } });
  };
  const save = async () => {
    collect();
    for (const f of [...K.head, ...(K.ext || [])]) if (f.req && !getPath(st, f.k)) { toast(`${f.l} fehlt`, {type: 'warn'}); return null; }
    if (!st.partner_name && !K.optPartner && kind !== 'reklamation') { toast(`${partnerLabel(kind)} fehlt`, {type: 'warn'}); return null; }
    if (kind === 'reklamation' && !st.partner_name) st.partner_name = 'Laufkundschaft';
    const data = JSON.parse(JSON.stringify(st.data)); (data.lines || []).forEach(l => { l.qty = +l.qty || 0; delete l._p; });
    if (kind === 'er' && data.betrag == null) { toast('Betrag fehlt', {type: 'warn'}); return null; }
    try {
      const r = await invoke('doc_save', {doc: {id: st.id || null, kind, partner: st.partner, partner_name: st.partner_name, ref: st.ref || '', date: st.date, due: st.due || null, status: st.status, data}, user: S.user.name});
      Object.assign(st, r); d = await invoke('doc_get', {id: r.id}); Object.assign(st, JSON.parse(JSON.stringify(d)));
      toast(`${K.one} gespeichert`, {t2: r.no, type: 'pos', icon: K.ic}); Hooks.emit(`vorgang.${kind}.gespeichert`, {nr: r.no, betrag: r.total / 100});
      return r;
    } catch (e) { toast('Speichern fehlgeschlagen', {t2: String(e), type: 'warn', dur: 7000}); return null; }
  };
  const act = async (a, opt = {}) => {
    if (opt.confirm && !(await confirmBox(opt.confirm))) return;
    let payload = {};
    if (opt.ask) { payload = await askFields(K.acts[st.status].find(x => x[0] === a)[1], opt.ask, st); if (!payload) return; }
    if (edit() && st.id) { const r = await save(); if (!r) return; }
    try {
      const r = await invoke('doc_action', {id: st.id, action: a, payload, user: S.user.name});
      applyStocks(r.stocks);
      Object.assign(st, r); d = await invoke('doc_get', {id: r.id}); Object.assign(st, JSON.parse(JSON.stringify(d)));
      toast(`${K.one} ${r.no}: ${DST[r.status]?.[0] || r.status}`, {t2: r.stocks?.length ? `${r.stocks.length} Bestandsbuchungen` : '', type: 'pos', icon: K.ic});
      if (DOC_AFTER[kind]?.[a]) await DOC_AFTER[kind][a](st, el);
      if (document.contains(el)) render();
      docRefresh();
    } catch (e) { toast('Nicht möglich', {t2: String(e), type: 'warn', dur: 7000}); }
  };
  const recalc = () => { const s = $('[data-dsum]', box); if (s) s.textContent = cEur((st.data.lines || []).reduce((t, l) => t + Math.round((+l.qty || 0) * (+l.price || 0) * (1 - (+l.disc || 0) / 100)), 0)); };
  box.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('[data-dlq]')) { st._q = t.value; st._focusQ = true; collect(); return render(); }
    if (t.matches('[data-dp="cust"]')) { const l = $('[data-dpl]', box); const hs = custHits(t.value); l.innerHTML = hs.length ? `<div class="card" style="overflow:hidden;box-shadow:var(--shadow-3)">${hs.map(c => `<button class="pal-i" style="height:44px;border-radius:0" data-dpc="${esc(c.id)}"><span style="flex:1;text-align:left"><b>${esc(c.name)}</b> <span class="muted">· ${esc(c.id)}${c.email ? ' · ' + esc(c.email) : ''}</span></span></button>`).join('')}</div>` : ''; return; }
    const L = st.data.lines || [];
    if (t.dataset.dlqty != null) { L[+t.dataset.dlqty].qty = t.value.replace(/[^\d]/g, ''); recalc(); }
    if (t.dataset.dlp != null) { L[+t.dataset.dlp]._p = t.value; L[+t.dataset.dlp].price = e2c(t.value); recalc(); }
    if (t.dataset.dld != null) { L[+t.dataset.dld].disc = Math.min(100, Math.max(0, parseAmt(t.value) || 0)); recalc(); }
    if (t.dataset.dln != null) L[+t.dataset.dln].name = t.value;
  });
  box.addEventListener('keydown', e => {
    if (e.target.matches('[data-dlq]') && e.key === 'Enter') { e.preventDefault(); const x = findEan(e.target.value); if (x) { collect(); addL(x.a, x.v); } else { const b = $('[data-dladd]', box); b?.click(); } }
  });
  box.addEventListener('change', async e => { if (e.target.matches('[data-dp="sup"]')) { collect(); if (kind === 'er' && !st.id) lfEiVorgabe(st); await loadOrders(); render(); } });
  const addL = (a, v) => { const L = st.data.lines; const ex = L.find(l => l.ean === v.ean); if (ex) ex.qty = String((+ex.qty || 0) + 1); else L.push(newLine(K, a, v)); st._q = ''; st._focusQ = true; render(); };
  box.addEventListener('click', async e => {
    const t = e.target;
    const pc = t.closest('[data-dpc]'); if (pc) { collect(); const c = custById(pc.dataset.dpc); st.partner = c.id; st.partner_name = c.name; if (kind === 'reservierung') { st.data.kontakt ||= {}; st.data.kontakt.email ||= c.email; st.data.kontakt.telefon ||= c.phone; } return render(); }
    const ad = t.closest('[data-dladd]'); if (ad) { collect(); const x = findEan(ad.dataset.dladd); if (x) addL(x.a, x.v); return; }
    const rx = t.closest('[data-dlx]'); if (rx) { collect(); st.data.lines.splice(+rx.dataset.dlx, 1); return render(); }
    if (t.closest('[data-dlfree]')) { collect(); st.data.lines.push({ean: '', sku: null, name: '', qty: 1, price: 0, vat: 20, disc: 0}); return render(); }
    if (t.closest('[data-dext]')) { collect(); st._ext = !showExt(); return render(); }
    if (t.closest('[data-dsave]')) { const r = await save(); if (r) { render(); docRefresh(); } return; }
    const ac = t.closest('[data-dact]'); if (ac) { const a = ac.dataset.dact, def = (K.acts[st.status] || []).find(x => x[0] === a); return act(a, def?.[3] || {}); }
    if (t.closest('[data-dprint]')) return docPrint(st);
    if (t.closest('[data-dmail]')) return docMail(st);
    const cv = t.closest('[data-dconv]'); if (cv) { closeLayer(el); return docConvert(st, cv.dataset.dconv); }
    if (DOC_CLICK[kind]) await DOC_CLICK[kind](e, st, {render, save, act, el, collect});
  });
  render();
  if (preset.focusSearch !== false && K.lines && !st.id) setTimeout(() => $('[data-dlq]', box)?.focus(), 80);
  return el;
}
/** Bearbeitbare Status je Art (wie in der Datenbank) */
const DOC_EDIT = {avis: ['angekuendigt', 'eingetroffen'], er: ['offen', 'geprueft'], zahlung: [], reklamation: ['erfasst', 'pruefung', 'lieferant'], lretoure: ['erfasst'], warenkorb: ['offen'], angebot: ['offen'], auftrag: ['offen'], lieferschein: ['entwurf'], rechnung: ['entwurf'], reservierung: ['angefragt', 'reserviert', 'abholbereit'], auswahl: ['entwurf'], kampagne: ['entwurf'], praemie: ['aktiv'], bonus: ['aktiv']};
const DOC_EXTRA = {}, DOC_BTNS = {}, DOC_CLICK = {}, DOC_AFTER = {};

function confirmBox(text, ok = 'Ja, fortfahren') {
  return new Promise(res => {
    const el = openLayer(`<div class="modal" style="width:min(440px,100%)" role="alertdialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('alert')}</div><div><h2>Bitte bestätigen</h2><p>${esc(text)}</p></div></div><div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-cb>${esc(ok)}</button></div></div>`, {onClose: () => res(false)});
    $('[data-cb]', el).onclick = () => { res(true); el._ok = true; closeLayer(el); };
  });
}
function askFields(title, fields, st) {
  return new Promise(res => {
    const el = openLayer(`<div class="modal" style="width:min(480px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('edit')}</div><div><h2>${esc(title)}</h2><p>${esc(st.no || '')}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:12px">${fields.map(f => `<label class="field"><span>${esc(f.l)}</span>${f.t === 'select' ? `<select class="input select" data-af="${f.k}">${f.o.map(o => `<option>${esc(o)}</option>`).join('')}</select>` : `<input class="input ${f.t === 'money' ? 'num' : ''}" data-af="${f.k}" ${f.t === 'date' ? 'type="date"' : ''} value="${esc(f.def ? f.def(st) : f.t === 'date' ? today() : '')}" ${f.t === 'money' ? 'inputmode="decimal"' : ''}>`}</label>`).join('')}
        <label class="field"><span>Notiz (optional)</span><input class="input" data-af="notiz"></label></div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-ago>${ic('check', 'i-sm')}OK</button></div></div>`, {onClose: () => res(null), focus: '[data-af]'});
    $('[data-ago]', el).onclick = () => {
      const out = {}; $$('[data-af]', el).forEach(i => { const f = fields.find(x => x.k === i.dataset.af); out[i.dataset.af] = f?.t === 'money' ? e2c(i.value) : i.value; });
      res(out); closeLayer(el);
    };
  });
}

/* ── Weiterführen: Angebot → Auftrag → Lieferschein → Rechnung ── */
async function docConvert(st, to) {
  const keep = {partner: st.partner, partner_name: st.partner_name, ref: st.no, data: {lines: JSON.parse(JSON.stringify(st.data.lines || [])), text: st.data.text || ''}};
  if (to === 'rechnung') { keep.data.bestand = st.kind !== 'lieferschein'; keep.data.zahlungsziel = 14; }
  if (st.kind === 'angebot' && st.status === 'offen') { try { await invoke('doc_action', {id: st.id, action: 'annehmen', payload: {}, user: S.user.name}); } catch { /* */ } }
  if (st.kind === 'auftrag' && st.status === 'offen' && to === 'lieferschein') { try { await invoke('doc_action', {id: st.id, action: 'liefern', payload: {}, user: S.user.name}); } catch { /* */ } }
  if (st.kind === 'lieferschein' && st.status === 'ausgeliefert') { try { await invoke('doc_action', {id: st.id, action: 'berechnen', payload: {}, user: S.user.name}); } catch { /* */ } }
  docRefresh();
  openDoc(to, null, {...keep, focusSearch: false});
}

/* ── A4-Druck und E-Mail ── */
function docHTML(st) {
  const K = DK[st.kind], c = st.partner ? custById(st.partner) : null, sup = K.partner === 'lieferant' ? (SUPPLIERS.find(s => s.id === st.partner) || SUPPLIERS_ALL.find(s => s.id === st.partner)) : null;
  const rcpt = sup ? lfEmpfaenger(sup, ['er', 'zahlung'].includes(st.kind) ? 'rechn' : 'haupt').map(esc).join('<br>') : c ? custAddr(c) : esc(st.partner_name || '');
  const L = st.data.lines || [], vk = K.price === 'vk';
  const title = st.kind === 'rechnung' && st.data.mahnstufe && st.status !== 'bezahlt' && st._mahnung ? `${st.data.mahnstufe}. Mahnung` : K.print || K.one;
  const meta = [[`${K.one}-Nr.`, st.no], ['Datum', dDate(st.date)], ...(c ? [['Kundennummer', c.id]] : []), ...(sup ? [...(sup.nr ? [['Lieferanten-Nr.', sup.nr]] : []), ...(lfKundenNr(sup) ? [['Unsere Kundennr.', lfKundenNr(sup)]] : []), ...(['er', 'zahlung'].includes(st.kind) && sup.profile?.uid ? [['USt-IdNr. Lieferant', sup.profile.uid]] : [])] : []), ...(st.ref ? [['Bezug', st.ref]] : []), ...(st.due ? [[st.kind === 'angebot' ? 'Gültig bis' : st.kind === 'reservierung' ? 'Abholen bis' : st.kind === 'auswahl' ? 'Rückgabe bis' : 'Fällig', dDate(st.due)]] : [])];
  const rows = L.map((l, i) => { const g = Math.round((+l.qty || 0) * (+l.price || 0)), net = Math.round(g * (1 - (+l.disc || 0) / 100)); return `<tr><td>${i + 1}</td><td><b>${esc(l.name)}</b>${l.ean ? `<br><span class="muted">EAN ${esc(l.ean)}${l.sku ? ' · Art.-Nr. ' + esc(l.sku) : ''}</span>` : ''}${l.disc ? `<br><span class="muted">Rabatt ${l.disc} %</span>` : ''}</td><td class="r">${l.qty}</td>${K.price && st.kind !== 'lieferschein' ? `<td class="r">${num((l.price || 0) / 100, 2)}</td>${vk ? `<td class="r">${l.vat ?? 20} %</td>` : ''}<td class="r">${num(net / 100, 2)}</td>` : ''}</tr>`; }).join('');
  const byVat = {}; L.forEach(l => { const net = Math.round((+l.qty || 0) * (+l.price || 0) * (1 - (+l.disc || 0) / 100)); byVat[l.vat ?? 20] = (byVat[l.vat ?? 20] || 0) + net; });
  const priced = K.price && st.kind !== 'lieferschein';
  const tail = {
    rechnung: `<p style="margin-top:8mm">Zahlbar ohne Abzug bis ${dDate(st.due || plusDays(st.data.zahlungsziel ?? 14))}${CFG['zahlung.iban'] ? ` auf ${esc(CFG['zahlung.empfaenger'] || CFG['firma.name'])}, IBAN ${esc(CFG['zahlung.iban'])}${CFG['zahlung.bic'] ? ', BIC ' + esc(CFG['zahlung.bic']) : ''}` : ''}, Verwendungszweck ${esc(st.no)}. Leistungsdatum = Rechnungsdatum.${st.open && st.open !== st.total ? ` Bereits bezahlt: ${cEur(st.total - st.open)}, offen: ${cEur(st.open)}.` : ''}</p>`,
    angebot: `<p style="margin-top:8mm">Dieses Angebot ist gültig bis ${dDate(st.due)}. Wir freuen uns auf Ihren Auftrag.</p>`,
    auftrag: `<p style="margin-top:8mm">Vielen Dank für Ihren Auftrag. Liefertermin: ${st.due ? dDate(st.due) : 'nach Vereinbarung'}.</p>`,
    lieferschein: `<p style="margin-top:10mm">Ware vollständig und unbeschädigt erhalten:</p><p style="margin-top:14mm">______________________________<br><span class="muted">Datum, Unterschrift</span></p>`,
    reservierung: `<p style="margin-top:8mm">Für Sie reserviert bis ${dDate(st.due)}. Bitte diesen Abholschein oder die Nummer ${esc(st.no)} bei der Abholung nennen.</p>`,
    auswahl: `<p style="margin-top:8mm">Ware zur Ansicht erhalten. Rückgabe bzw. Bezahlung bis ${dDate(st.due)}.${st.data.pfand ? ` Kaution: ${cEur(st.data.pfand)}.` : ''}</p><p style="margin-top:14mm">______________________________<br><span class="muted">Datum, Unterschrift</span></p>`,
  }[st.kind] || '';
  return letterHead(title, rcpt, meta) + (st.data.text ? `<p>${esc(st.data.text).replace(/\n/g, '<br>')}</p>` : '')
    + `<table><thead><tr><th style="width:8mm">#</th><th>Position</th><th class="r">Menge</th>${priced ? `<th class="r">${vk ? 'Einzel €' : 'EK €'}</th>${vk ? '<th class="r">USt</th>' : ''}<th class="r">Gesamt €</th>` : ''}</tr></thead><tbody>${rows}</tbody></table>`
    + (priced ? `<table class="sum" style="width:78mm;margin:5mm 0 0 auto">${vk ? Object.entries(byVat).filter(([r]) => +r > 0).map(([r, g]) => `<tr><td class="muted">Netto ${r} %</td><td class="r">${num(g / (1 + r / 100) / 100, 2)}</td></tr><tr><td class="muted">USt ${r} %</td><td class="r">${num((g - g / (1 + r / 100)) / 100, 2)}</td></tr>`).join('') : ''}<tr class="tot"><td>${vk ? 'Gesamt EUR' : 'Summe netto EUR'}</td><td class="r">${num(st.total / 100, 2)}</td></tr></table>` : '')
    + tail + `<div class="foot">${esc(firmLine())}${fussA4() ? '<br>' + esc(fussA4()).replace(/\n/g, '<br>') : ''}</div>`;
}
function docPrint(st, mahnung = false) {
  const c = /^#[0-9a-f]{6}$/i.test(CFG['a4.farbe'] || '') ? CFG['a4.farbe'] : '#111111';
  printHTML(docHTML({...st, _mahnung: mahnung}), `${DK[st.kind].one} ${st.no}`, `h1{color:${c}}th{color:${c};border-color:${c}}.sum .tot td{border-color:${c};color:${c}}`);
}
async function docMail(st) {
  const c = st.partner ? custById(st.partner) : null;
  const to = c?.email || st.data?.kontakt?.email || '';
  const addr = await askText('Per E-Mail senden', `${DK[st.kind].one} ${st.no} als E-Mail`, to); if (!addr) return;
  try {
    await invoke('mail_send', {to: addr, subject: `${DK[st.kind].print || DK[st.kind].one} ${st.no} – ${CFG['firma.name']}`, html: `<div style="font:14px system-ui,sans-serif;color:#111;max-width:760px">${docHTML(st)}</div>`, text: `${DK[st.kind].one} ${st.no}\nBetrag: ${cEur(st.total)}\n\n${firmLine()}`, qr: null, purpose: st.kind});
    toast('E-Mail gesendet', {t2: addr, type: 'pos', icon: 'mail'}); Hooks.emit('vorgang.mail', {nr: st.no, an: addr});
  } catch (e) { toast('E-Mail nicht gesendet', {t2: String(e), type: 'warn', dur: 8000}); }
}

/* ── Rückgabegründe (für Kasse, Reklamation, Lieferantenretoure) ── */
const RET_DEFAULT = [{code: 'GR', text: 'Passt nicht (Größe)', bestand: true}, {code: 'GE', text: 'Gefällt nicht', bestand: true}, {code: 'DE', text: 'Defekt / Mangel', bestand: false, lieferant: true},
  {code: 'FA', text: 'Falsch geliefert', bestand: true, lieferant: true}, {code: 'TR', text: 'Transportschaden', bestand: false, lieferant: true}, {code: 'UM', text: 'Umtausch', bestand: true}, {code: 'KU', text: 'Kulanz', bestand: true}];
const retGruende = () => Array.isArray(CFG['retoure.gruende']) && CFG['retoure.gruende'].length ? CFG['retoure.gruende'] : RET_DEFAULT;

/* Klicks auf Listen (alle Vorgangsseiten) */
function bindDocs() {
  document.addEventListener('click', e => {
    if (!e.target.closest('#views')) return;
    const n = e.target.closest('[data-dnew]'); if (n) return openDoc(n.dataset.dnew, null);
    const o = e.target.closest('[data-dopen]'); if (o && !e.target.closest('input')) { const page = S.view; const d = (DOCS[page] || []).find(x => x.id === +o.dataset.dopen); return openDoc(d?.kind || Object.keys(DK).find(k => DK[k].page === page), +o.dataset.dopen); }
    const all = e.target.closest('[data-dall]'); if (all) $$('[data-dchk]').forEach(c => { c.checked = all.checked; });
  });
}
