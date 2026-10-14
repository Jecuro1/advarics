/* ═════════════════════════════════════════════════════════════════
   55e · LIEFERANTEN (Stammdaten › Lieferanten) – Liste und Maske mit Reitern
   Allgemein (Profil, Liefer-, Finanzeinstellungen, Kontaktdaten, Zusatzinformationen, eigene Felder), Marken (zugeordnete / angelegte Marken per
   Ziehen, „Zuordnen“ oder Dialog), Dateien (Dokumente zum Lieferanten), Haupt-Adresse, Rechnungsadresse, Filial-Kunden-Nummern.
   Wirkung (nichts nur zum Anschauen):
   • Aktiv: inaktive Lieferanten verschwinden aus Auswahllisten, Bestellvorschlag und KI-Nachbestellung; „Order-Vorschläge nutzen“ steuert den Vorschlag je Lieferant
   • Nr., Land, Kunden-Nr., Filial-Kundennummern (die der bestellenden Filiale geht vor), Anschrift, Telefon, Fax und Vereinbarungen stehen auf der Bestellung;
     Haupt-Adresse auch auf Avis und Retoure, Rechnungsadresse auf Eingangsrechnung und Zahlung; Info, Info 2 und Vereinbarungen erscheinen als Hinweis
     beim Bestellen; Min. Auftragssumme/-menge fragen beim Bestellen nach; Skonto, Valuta und Zahlungs-Bed. füllen die Eingangsrechnung vor
   • RMA Code Pflicht (Retoure ohne RMA-Nummer nicht versendbar), RMA Ablauf (Hinweis in der Retoure), Gegenscannen (Avis erst nach dem Scanner-Wareneingang)
   • Marken: neue Artikel einer Marke bekommen den Lieferanten vorgeschlagen; vorhandene Artikel ohne Lieferant lassen sich nachtragen
   • Haupt-GLN / Empfänger-GLN: EDI-Nachrichten (Lieferantenerkennung, Bestellung) – siehe c39-edi-webshop.js; Land: Versendungsland der Intrastat-Meldung
   Pflege nur in der Zentrale (und am Einzelplatz); die Prüfungen stehen hier und in lieferant.rs gleich (das Backend entscheidet).
   ═════════════════════════════════════════════════════════════════ */
const LF = {rows: [], rolle: 'einzel', eigene: '', nr: 1, loaded: false};
const LE = {id: null, ids: [], d: null, orig: null, tab: 'allg', dirty: false, show: false, files: [], filesFor: null, busy: false};
const LF_TABS = [['allg', 'Allgemein'], ['marken', 'Marken'], ['dateien', 'Dateien'], ['haupt', 'Haupt-Adresse'], ['rechn', 'Rechnungsadresse'], ['fk', 'Filial-Kunden-Nummern']];
const LF_ADR = ['adrzeile1', 'adrzeile2', 'strasse', 'hausnr', 'plz', 'ort', 'postfach', 'bundesland'];
const LF_GLN_HERKUNFT = [['hersteller', 'Hersteller'], ['lieferant', 'Lieferant']];
const lfRow = id => LF.rows.find(r => r.id === id);
const lfLocked = () => LF.rolle === 'filiale';
const lfName = r => r?.name || r?.id || '';
function lfGlnOk(x) {
  x = String(x || '').replace(/\s+/g, ''); if (!/^\d{13}$/.test(x)) return false;
  const d = [...x].map(Number), s = d.slice(0, 12).reduce((a, v, i) => a + (i % 2 ? v * 3 : v), 0);
  return (10 - s % 10) % 10 === d[12];
}
const lfEmailOk = x => { x = String(x || '').trim(); const i = x.indexOf('@'); return i > 0 && !/\s/.test(x) && x.slice(i + 1).includes('.') && !x.slice(i + 1).startsWith('.') && !x.endsWith('.') && !x.slice(i + 1).includes('@'); };
const lfCent = t => { const s = String(t ?? '').trim(); if (!s) return 0; const v = parseAmt(s); return isFinite(v) ? Math.round(v * 100) : NaN; };
const lfEuroText = c => c > 0 ? num(c / 100, 2) : '';
const lfPct = t => { const s = String(t ?? '').trim().replace(',', '.'); return s === '' ? 0 : +s; };

/* ── Wirkung an anderen Stellen ── */
/** Eigene Kunden-Nr. beim Lieferanten: die der bestellenden Filiale, sonst die allgemeine */
function lfKundenNr(sup, store) {
  const fk = sup?.profile?.filial_kunden || {}, st = String(store || (typeof FIL !== 'undefined' ? FIL.eigene : '') || '').toUpperCase();
  const k = Object.keys(fk).find(x => x.toUpperCase() === st);
  return (k && String(fk[k]).trim()) || sup?.customer_no || '';
}
/** Anschrift als Zeilen (Adr.-Zeile 1/2, Straße Nr., Postfach, PLZ Ort, Land wenn nicht Österreich) */
function lfAdrLines(a, land) {
  const l = String(land ?? a?.land ?? '').toUpperCase(), t = k => String(a?.[k] || '').trim();
  return [t('adrzeile1'), t('adrzeile2'), [t('strasse'), t('hausnr')].filter(Boolean).join(' '), t('postfach') ? 'Postfach ' + t('postfach') : '', [t('plz'), t('ort')].filter(Boolean).join(' '), t('bundesland'), l && l !== 'AT' ? landName(l) : ''].filter(Boolean);
}
/** Empfängerblock auf Bestellung und Belegen: Name, z. H., Anschrift (Rechnungsadresse bei Rechnungen), Telefon, E-Mail */
function lfEmpfaenger(sup, art = 'haupt') {
  if (!sup) return [];
  const p = sup.profile || {}, r = p.rechnung || {}, rn = art === 'rechn', bill = rn && (r.strasse || r.postfach || r.ort || r.adrzeile1);
  const adr = bill ? lfAdrLines(r, r.land || sup.country) : lfAdrLines(p.adresse || {}, p.adresse?.land || sup.country);
  return [rn && r.name ? r.name : sup.name, sup.contact ? 'z. H. ' + sup.contact : '', ...adr, sup.phone ? 'Tel. ' + sup.phone : '', p.fax ? 'Fax ' + p.fax : '', sup.email].filter(Boolean);
}
/** Hinweise zum Lieferanten (Info, Info 2, Vereinbarungen) beim Bestellen und in Belegen */
function lfHinweis(sup) {
  if (!sup) return '';
  const p = sup.profile || {}, t = [['Info', sup.note], ['Info 2', p.info2], ['Vereinbarung 1', p.vereinbarung1], ['Vereinbarung 2', p.vereinbarung2]].filter(([, v]) => String(v || '').trim());
  return t.length ? `<div class="prompt-hint blk" style="display:grid;gap:4px">${t.map(([l, v]) => `<div><b>${esc(l)}:</b> <span style="white-space:pre-wrap">${esc(v)}</span></div>`).join('')}</div>` : '';
}
/** Neue Artikel einer Marke: der Lieferant, dem genau diese Marke zugeordnet ist (nur wenn eindeutig, nur aktive) */
function lfMarkeSync(marke) {
  const n = mkNorm(marke); if (!n) return '';
  const ids = LF.rows.filter(r => r._aktiv !== false && (r.marken || []).some(m => mkNorm(m.name || mkRow(m.brand_id)?.name) === n)).map(r => r.id);
  return ids.length === 1 ? ids[0] : '';
}
async function lfMarkeVorschlag(marke) { try { await Promise.all([lfLoad(), mkLoad()]); } catch { return ''; } return lfMarkeSync(marke); }
/** PRICAT: Marke des Lieferanten (Markenname oder Marken-Nr. der Nachricht, Hersteller-GLN) → eigene Marke laut Zuordnung am Lieferanten; ohne Treffer bleibt der Text */
function lfMarkeEigen(sid, text, gln, code) {
  const r = lfRow(sid); if (!r) return text;
  const n = mkNorm(text), c = mkNorm(code), g = String(gln || '').replace(/\s+/g, '');
  const m = (r.marken || []).find(x => (n && (mkNorm(x.ext_name) === n || mkNorm(x.edi_name) === n || mkNorm(x.edi_nr) === n)) || (c && (mkNorm(x.edi_nr) === c || mkNorm(x.ext_name) === c || mkNorm(x.edi_name) === c)) || (g && x.gln && x.gln === g && x.gln_src !== 'lieferant'));
  return m ? (m.name || mkRow(m.brand_id)?.name || text) : text;
}
/** Wohin mit „Lieferant öffnen“ aus anderen Seiten */
function openSupplier(s) { lfOeffnen(s?.id || null); }
async function lfOeffnen(id) { await Promise.all([lfLoad(), mkLoad()]); if (id && !lfRow(id)) return toast('Diesen Lieferanten gibt es nicht mehr', {type: 'warn'}); lfOpen(id, LF.rows.map(r => r.id)); }

/* ── Laden ── */
const LF_DEMO = [['Nordwand Outdoor GmbH', 10, ['Nordwand']], ['Firn Sports AG', 14, ['Firn']], ['Talwind Distribution', 7, ['Talwind']], ['Alpin Handelsagentur', 5, ['Lodenwerk', 'Seilschaft', 'Kammlinie']]];
function lfPreviewRows() {
  let l = persist.get('lieferanten', null);
  if (!l) {
    l = LF_DEMO.map(([name, lead, brands], i) => ({id: `L-${String(i + 1).padStart(3, '0')}`, nr: i + 1, name, _aktiv: true, country: 'AT', contact: '', email: '', phone: '', customer_no: '', lead_days: lead, note: '', iban: '', bic: '', profile: lfProfileBlank(), fields: {},
      marken: brands.map(b => ({brand_id: mkFuer(b)?.id || 'mk-' + mkSlug(b), ext_name: '', gln_src: '', gln: '', edi_nr: '', edi_name: '', comment: ''}))}));
    persist.set('lieferanten', l);
  }
  return l;
}
function lfDecorate(r) {
  const n = ART.filter(a => a.supplierId === r.id);
  return {...r, profile: {...lfProfileBlank(), ...(r.profile || {})}, _artikel: n.length, _offen: 0, _dateien: 0, _geaendert: r._geaendert || '',
    marken: (r.marken || []).map(m => { const name = mkRow(m.brand_id)?.name || m.name || ''; return {...m, name, _artikel: n.filter(a => mkNorm(a.brand) === mkNorm(name)).length}; })};
}
/** Browser-Vorschau: die Auswahllisten der übrigen Seiten (SUPPLIERS) aus den gespeicherten Lieferanten füllen */
function lfPreviewSync() {
  const rows = lfPreviewRows().map(r => { const { marken, _geaendert, ...o } = r; return {...o, active: r._aktiv !== false, open_orders: 0, profile: {...lfProfileBlank(), ...(r.profile || {})}}; });
  SUPPLIERS_ALL.length = 0; SUPPLIERS_ALL.push(...rows); SUPPLIERS.length = 0; SUPPLIERS.push(...rows.filter(r => r.active));
}
async function lfLoad(force) {
  if (LF.loaded && !force) return;
  if (DESKTOP) {
    try { const r = await invoke('lieferant_list'); LF.rows = r.zeilen || []; LF.rolle = r.rolle; LF.eigene = r.eigene; LF.nr = r.naechste_nr || 1; } catch (e) { console.error(e); }
  } else {
    await mkLoad(); lfPreviewSync(); LF.rows = lfPreviewRows().map(lfDecorate); LF.rolle = 'zentrale'; LF.eigene = typeof FIL !== 'undefined' ? FIL.eigene : ''; LF.nr = Math.max(0, ...LF.rows.map(r => +r.nr || 0)) + 1;
  }
  LF.loaded = true;
}

/* ── Liste ── */
const lfLandX = iso => landName(iso);
function lfListRows() {
  return LF.rows.map(r => {
    const p = r.profile || {}, a = p.adresse || {};
    return {id: r.id, nr: +r.nr || 0, name: r.name || '', marken: (r.marken || []).map(m => m.name).filter(Boolean).join(', '), land: lfLandX(r.country), strasse: a.strasse || '', hausnr: a.hausnr || '', plz: a.plz || '', ort: a.ort || '',
      tel: r.phone || '', gln: p.gln || '', email: r.email || '', egln: p.empfaenger_gln || '', aktiv: r._aktiv !== false, kundennr: r.customer_no || '', bundesland: a.bundesland || '', web: p.web || '', uid: p.uid || '', kontakte: r.contact || '',
      geaendert: r._geaendert ? fmtTs(r._geaendert) : '', waehrung: 'EUR', artikel: r._artikel || 0, offen: r._offen || 0, dateien: r._dateien || 0};
  });
}
agridPage('lieferanten', {
  title: 'Lieferanten', rows: lfListRows, count: () => LF.rows.length, sort: {k: 'nr', dir: 1}, rowH: 44,
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'nr', l: 'Nr.', t: 'num', w: 70}, {k: 'name', l: 'Name', w: 230}, {k: 'marken', l: 'Marken', w: 200}, {k: 'land', l: 'Land', w: 120}, {k: 'strasse', l: 'Str.', w: 160}, {k: 'hausnr', l: 'Haus-Nr.', w: 80}, {k: 'plz', l: 'PLZ', w: 80}, {k: 'ort', l: 'Ort', w: 130},
    {k: 'tel', l: 'Tel.', w: 130}, {k: 'gln', l: 'GLN', w: 130}, {k: 'email', l: 'E-Mail', w: 200}, {k: 'egln', l: 'Empfänger-GLN', w: 130},
    {k: 'aktiv', l: 'Aktiv', t: 'check', w: 70, show: false}, {k: 'kundennr', l: 'Kunden-Nr.', w: 110}, {k: 'bundesland', l: 'Bundesland/Kanton/Provinz', w: 150, show: false}, {k: 'web', l: 'Webseite', w: 160, show: false}, {k: 'uid', l: 'USt-IdNr.', w: 130, show: false},
    {k: 'kontakte', l: 'Kontakte', w: 150, show: false}, {k: 'geaendert', l: 'Geändert am', w: 140, show: false}, {k: 'waehrung', l: 'Währung', w: 80, show: false},
    {k: 'artikel', l: 'Artikel', t: 'num', w: 80, show: false}, {k: 'offen', l: 'Offene Bestellungen', t: 'num', w: 110, show: false}, {k: 'dateien', l: 'Dokumente', t: 'num', w: 90, show: false}],
  remove: ids => lfRemove(ids),
  actions: {back: () => e2Back(), refresh: () => PAGES.lieferanten.render(true), new: () => lfNeu()},
  edit: id => lfOpen(id, (AG.lieferanten.filtered || []).map(r => r.id)),
});
{ const p = PAGES.lieferanten, _r = p.render; p.render = async fresh => { await Promise.all([loadStamm(fresh === true), mkLoad(true), lfLoad(true), typeof filLoad === 'function' ? filLoad() : null]); await _r(); renderTopbar(); }; }
VIEW_PERM.lieferanten = 'einkauf';
function lfNeu() {
  if (lfLocked()) return toast('Lieferanten pflegt die Zentrale', {t2: 'Diese Kasse bekommt die Angaben beim Abgleich', icon: 'lock'});
  lfOpen(null, LE.ids);
}

/* ── Entwurf ── */
const lfAdrBlank = (land = 'AT') => ({name: '', ...Object.fromEntries(LF_ADR.map(k => [k, ''])), land});
const lfProfileBlank = () => ({fax: '', web: '', steuernr: '', uid: '', gln: '', empfaenger_gln: '', info2: '', vereinbarung1: '', vereinbarung2: '', rma_ablauf: '', rma_pflicht: false, gegenscannen: false, order_vorschlag: true,
  min_summe: 0, min_menge: 0, skonto: 0, valuta: 0, zahlungsbed: '', adresse: lfAdrBlank(), rechnung: lfAdrBlank(''), filial_kunden: {}});
const lfBlank = () => ({id: '', nr: String(LF.nr), name: '', _aktiv: true, country: 'AT', contact: '', email: '', phone: '', customer_no: '', lead_days: '7', note: '', iban: '', bic: '', fields: {}, marken: [],
  profile: {...lfProfileBlank(), min_summe: '', min_menge: '', skonto: '', valuta: '', adresse: lfAdrBlank(), rechnung: lfAdrBlank('')}});
function lfDraft(id) {
  const r = id ? lfRow(id) : null; if (!r) return lfBlank();
  const p = {...lfProfileBlank(), ...mclone(r.profile || {})};
  const adr = (a, land) => ({...lfAdrBlank(land), ...Object.fromEntries(Object.entries(a || {}).map(([k, v]) => [k, String(v ?? '')]))});
  p.adresse = adr(p.adresse, 'AT'); p.rechnung = adr(p.rechnung, ''); p.adresse.land ||= r.country; p.filial_kunden = {...(p.filial_kunden || {})};
  p.min_summe = lfEuroText(p.min_summe); p.min_menge = p.min_menge ? String(p.min_menge) : ''; p.skonto = p.skonto ? String(p.skonto).replace('.', ',') : ''; p.valuta = p.valuta ? String(p.valuta) : '';
  for (const k of ['fax', 'web', 'steuernr', 'uid', 'gln', 'empfaenger_gln', 'info2', 'vereinbarung1', 'vereinbarung2', 'rma_ablauf', 'zahlungsbed']) p[k] = String(p[k] ?? '');
  return {id: r.id, nr: String(r.nr ?? ''), name: String(r.name ?? ''), _aktiv: r._aktiv !== false, country: r.country || 'AT', contact: String(r.contact ?? ''), email: String(r.email ?? ''), phone: String(r.phone ?? ''), customer_no: String(r.customer_no ?? ''),
    lead_days: String(r.lead_days ?? ''), note: String(r.note ?? ''), iban: flFormatIban(r.iban), bic: String(r.bic ?? ''), fields: mclone(r.fields || {}), marken: (r.marken || []).map(m => ({brand_id: m.brand_id, ext_name: m.ext_name || '', gln_src: m.gln_src || '', gln: m.gln || '', edi_nr: m.edi_nr || '', edi_name: m.edi_name || '', comment: m.comment || ''})), profile: p};
}
function lfToRow(d) {
  const t = v => String(v ?? '').trim(), p = d.profile, adr = a => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, t(v)]));
  const prof = {...p, min_summe: lfCent(p.min_summe), min_menge: p.min_menge === '' ? 0 : +p.min_menge, skonto: lfPct(p.skonto), valuta: p.valuta === '' ? 0 : +p.valuta, adresse: adr(p.adresse), rechnung: adr(p.rechnung), filial_kunden: {...p.filial_kunden}};
  prof.adresse.land = t(d.country).toUpperCase(); prof.rechnung.land = t(prof.rechnung.land).toUpperCase();
  for (const k of ['fax', 'web', 'steuernr', 'info2', 'vereinbarung1', 'vereinbarung2', 'rma_ablauf', 'zahlungsbed']) prof[k] = t(prof[k]);
  prof.uid = t(prof.uid).replace(/\s+/g, '').toUpperCase(); prof.gln = t(prof.gln).replace(/\s+/g, ''); prof.empfaenger_gln = t(prof.empfaenger_gln).replace(/\s+/g, '');
  return {id: d.id || '', nr: parseInt(d.nr, 10), name: t(d.name), _aktiv: d._aktiv !== false, country: t(d.country).toUpperCase(), contact: t(d.contact), email: t(d.email), phone: t(d.phone), customer_no: t(d.customer_no),
    lead_days: d.lead_days === '' ? 0 : +d.lead_days, note: t(d.note), iban: t(d.iban).replace(/\s+/g, '').toUpperCase(), bic: t(d.bic).replace(/\s+/g, '').toUpperCase(), fields: d.fields || {}, profile: prof,
    marken: d.marken.map(m => ({brand_id: m.brand_id, ext_name: t(m.ext_name), gln_src: t(m.gln_src), gln: t(m.gln).replace(/\s+/g, ''), edi_nr: t(m.edi_nr), edi_name: t(m.edi_name), comment: t(m.comment)}))};
}
/** Prüfungen wie im Backend (lieferant.rs); k = Pfad des Feldes */
function lfErrors(d) {
  const m = [], add = (k, t) => m.push({k, t}), t = v => String(v ?? '').trim(), p = d.profile;
  const name = t(d.name); if (name.length < 2) add('name', 'Name angeben (mindestens 2 Zeichen)'); else if (name.length > 120) add('name', 'Name: höchstens 120 Zeichen');
  const nr = t(d.nr);
  if (!/^\d+$/.test(nr) || +nr < 1 || +nr > 999999) add('nr', 'Nr.: ganze Zahl ab 1');
  else { const o = LF.rows.find(r => +r.nr === +nr && r.id !== (d.id || '')); if (o) add('nr', `Die Nr. ${nr} hat schon der Lieferant „${lfName(o)}“`); }
  if (!/^[A-Za-z]{2}$/.test(t(d.country))) add('country', 'Land wählen');
  const em = t(d.email); if (em && (!lfEmailOk(em) || em.length > 120)) add('email', 'E-Mail-Adresse wie name@firma.at');
  for (const [k, l, mx] of [['contact', 'Ansprechperson', 80], ['phone', 'Telefon', 60], ['customer_no', 'Kunden-Nr.', 60], ['note', 'Info', 2000], ['profile.fax', 'Fax', 60], ['profile.web', 'Webseite', 120], ['profile.steuernr', 'Steuernummer', 60], ['profile.info2', 'Info 2', 2000], ['profile.vereinbarung1', 'Vereinbarung 1', 2000], ['profile.vereinbarung2', 'Vereinbarung 2', 2000], ['profile.rma_ablauf', 'RMA Ablauf', 2000]]) if (t(mgetp(d, k)).length > mx) add(k, `${l}: höchstens ${mx} Zeichen`);
  if (t(d.lead_days) !== '' && !(/^\d+$/.test(t(d.lead_days)) && +d.lead_days <= 365)) add('lead_days', 'Lieferzeit: Tage von 0 bis 365');
  const uid = t(p.uid).replace(/\s+/g, ''); if (uid && !/^[A-Za-z]{2}[A-Za-z0-9]{2,12}$/.test(uid)) add('profile.uid', 'USt-IdNr.: Länderkennung und Nummer (z. B. ATU12345678)');
  for (const [k, l] of [['gln', 'Haupt-GLN'], ['empfaenger_gln', 'Empfänger-GLN']]) { const g = t(p[k]).replace(/\s+/g, ''); if (g && !lfGlnOk(g)) add(`profile.${k}`, `${l}: 13 Ziffern mit gültiger Prüfziffer`); }
  if (!flIbanOk(d.iban)) add('iban', 'IBAN: Prüfziffer stimmt nicht – bitte Eingabe kontrollieren');
  const bic = t(d.bic).replace(/\s+/g, ''); if (bic && !/^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/.test(bic)) add('bic', 'BIC: 8 oder 11 Zeichen (z. B. BKAUATWW)');
  const ms = lfCent(p.min_summe); if (!isFinite(ms) || ms < 0 || ms > 999999999) add('profile.min_summe', 'Min. Auftragssumme: Betrag von 0 bis 9.999.999,99');
  if (t(p.min_menge) !== '' && !(/^\d+$/.test(t(p.min_menge)) && +p.min_menge <= 9999999)) add('profile.min_menge', 'Min. Auftragsmenge: ganze Zahl von 0 bis 9.999.999');
  if (t(p.zahlungsbed) && !stRows('zahlungsbedingung').some(z => z.id === p.zahlungsbed)) add('profile.zahlungsbed', 'Zahlungs-Bed.: diese Zahlungsbedingung gibt es nicht mehr – bitte neu wählen');
  if (t(p.skonto) !== '' && !(isFinite(lfPct(p.skonto)) && lfPct(p.skonto) >= 0 && lfPct(p.skonto) <= 100)) add('profile.skonto', 'Skonto: Prozentwert von 0 bis 100');
  if (t(p.valuta) !== '' && !(/^\d+$/.test(t(p.valuta)) && +p.valuta <= 365)) add('profile.valuta', 'Valuta: Tage von 0 bis 365');
  for (const [a, wo] of [['adresse', 'Haupt-Adresse'], ['rechnung', 'Rechnungsadresse']]) {
    const v = p[a]; for (const k of LF_ADR) if (t(v[k]).length > 80) add(`profile.${a}.${k}`, 'Höchstens 80 Zeichen');
    if (a === 'rechnung') { if (t(v.name).length > 120) add('profile.rechnung.name', 'Höchstens 120 Zeichen'); const land = t(v.land); if (land && !/^[A-Za-z]{2}$/.test(land)) add('profile.rechnung.land', 'Land als zweistelliger ISO-Code'); }
  }
  return m;
}
const lfTabOf = k => /^profile\.adresse\./.test(k) ? 'haupt' : /^profile\.rechnung\./.test(k) ? 'rechn' : 'allg';

/* ── Maske ── */
const lfNote = () => lfLocked() ? `<div class="zp-note">${ic('lock', 'i-sm')}<span><b>Lieferanten pflegt die Zentrale.</b> Diese Kasse bekommt die Angaben beim Abgleich; hier sind sie nur lesbar.</span></div>` : '';
const LFK = maskeNew({
  page: 'lieferant-edit', list: 'lieferanten', title: 'Lieferanten', perm: 'einkauf', st: LE,
  sub: st => st.id ? `${lfRow(st.id)?.nr ?? ''} ${lfName(lfRow(st.id)) || st.d.name}`.trim() : 'neuer Lieferant',
  load: async () => { await Promise.all([lfLoad(), mkLoad(), loadStamm(), typeof filLoad === 'function' ? filLoad() : null]); await lfLoadFiles(); },
  reload: async () => { await Promise.all([lfLoad(true), mkLoad(true), loadStamm(true), typeof filLoad === 'function' ? filLoad(true) : null]); LE.filesFor = null; await lfLoadFiles(); },
  draft: lfDraft, tabs: () => LF_TABS.map(([k, l]) => [k, l, k === 'marken' && LE.d?.marken.length ? ` <span class="ed-badge" style="background:var(--surface-3);color:var(--text-2)">${LE.d.marken.length}</span>` : k === 'fk' && LE.d && Object.keys(LE.d.profile.filial_kunden).length ? ` <span class="ed-badge" style="background:var(--surface-3);color:var(--text-2)">${Object.keys(LE.d.profile.filial_kunden).length}</span>` : k === 'dateien' && LE.files.length ? ` <span class="ed-badge" style="background:var(--surface-3);color:var(--text-2)">${LE.files.length}</span>` : '']),
  errors: lfErrors, tabOf: lfTabOf, locked: lfLocked,
  can: () => ({new: !lfLocked(), del: !!LE.id && !lfLocked(), refresh: true}),
  bar: () => `<button class="ag-btn" data-mf-a="edi" title="Lieferanten EDI-Einstellungen" aria-label="Lieferanten EDI-Einstellungen" ${LE.id ? '' : 'disabled'}>${ic('truck', 'i-sm')}</button>`,
  body: () => ({allg: lfAllg, marken: lfMarken, dateien: lfDateien, haupt: () => lfAdresse('adresse'), rechn: () => lfAdresse('rechnung'), fk: lfFk}[LE.tab] || lfAllg)(),
  onSet: (k, el) => { if (k === 'name' || k === 'nr') renderTopbar(); if (k === 'profile.zahlungsbed') lfZahlungsbedAnwenden(); if (k === 'name' || k === 'country' || /^profile\.(adresse|rechnung)\./.test(k)) lfPrevAktual(el); },
  rerender: k => k === 'country' || k === 'profile.zahlungsbed',
  save: () => lfSave(), remove: (ids, ausMaske) => lfRemove(ids, ausMaske),
  onOpen: () => lfBeimOeffnen(),
  act: async (a, b, el) => {
    if (a === 'edi') return lfZuEdi();
    if (a === 'zbpage') { if (LE.dirty && !await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen')) return; LE.dirty = false; return go('st-zahlungsbedingung'); }
    if (a === 'adrkopie' && !lfLocked()) { const h = LE.d.profile.adresse; LE.d.profile.rechnung = {...LE.d.profile.rechnung, ...Object.fromEntries(LF_ADR.map(k => [k, h[k]])), land: String(LE.d.country || '').toUpperCase()}; LFK.dirty(el); LFK.render(); }
  },
});
LFK.register();
function lfOpen(id, ids) { LFK.open(id, ids); }
async function lfZuEdi() {
  if (LE.dirty && !await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen')) return;
  LE.dirty = false; STE.edilieferant = {rows: null, q: LE.id || '', dirty: false}; go('st-edilieferant');
}
/** Zahlungs-Bed. gewählt: Skonto und Valuta vorbelegen, wenn noch leer (überschreibbar) */
function lfZahlungsbedAnwenden() {
  const z = stRows('zahlungsbedingung').find(r => r.id === LE.d.profile.zahlungsbed); if (!z) return;
  if (!String(LE.d.profile.valuta).trim() && z.tage) LE.d.profile.valuta = String(z.tage);
  if (!String(LE.d.profile.skonto).trim() && z.skonto) LE.d.profile.skonto = String(z.skonto).replace('.', ',');
}
async function lfLoadFiles() {
  const id = LE.id;
  if (!DESKTOP || !id) { LE.files = []; LE.filesFor = id; return; }
  if (LE.filesFor === id) return;
  let l = []; try { l = await invoke('lieferant_datei_liste', {supplierId: id}); } catch { /* keine Dokumente lesbar */ }
  if (LE.id !== id) return; // inzwischen ist ein anderer Lieferant offen
  LE.files = l; LE.filesFor = id;
}
/** Nach dem Öffnen/Blättern: die Dokumente des vorigen Lieferanten verwerfen und die des neuen nachladen */
function lfBeimOeffnen() {
  LE.files = []; LE.filesFor = null;
  const id = LE.id; if (!DESKTOP || !id) return;
  lfLoadFiles().then(() => { if (LE.id === id && S.view === 'lieferant-edit') LFK.render(); });
}

const lfLandOpts = () => landListe().map(l => [l.id, l.name]);
function lfAllg() {
  const D = LE.d, K = LFK, P = 'profile.', zb = stActive('zahlungsbedingung');
  const zbSel = `<label class="field"><span>Zahlungs-Bed.</span><div class="ea-cmb-row"><select class="input select" data-mf="${P}zahlungsbed" style="flex:1;min-width:0" ${lfLocked() ? 'disabled' : ''}><option value="">–</option>${zb.map(z => `<option value="${esc(z.id)}" ${z.id === D.profile.zahlungsbed ? 'selected' : ''}>${esc(z.name || z.id)}</option>`).join('')}${D.profile.zahlungsbed && !zb.some(z => z.id === D.profile.zahlungsbed) ? `<option value="${esc(D.profile.zahlungsbed)}" selected>${esc(stRows('zahlungsbedingung').find(z => z.id === D.profile.zahlungsbed)?.name || D.profile.zahlungsbed)} (inaktiv oder gelöscht)</option>` : ''}</select><button type="button" class="ea-ib" data-mf-a="zbpage" title="Zahlungsbedingungen bearbeiten oder neu anlegen" aria-label="Zahlungsbedingungen bearbeiten">${ic('edit', 'i-sm')}</button></div><small class="ea-hint">Füllt Valuta und Skonto der Eingangsrechnung vor. Die Bedingungen pflegen Sie unter Stammdaten › Zahlungsbedingungen.</small></label>`;
  const cf = typeof cfDefs === 'function' && cfDefs('lieferant').length ? K.card('Eigene Felder', `<div data-lf-cf>${cfHTML('lieferant', D.fields || {}, false, 'Felder')}</div>`, 'lf-wide') : '';
  return {html: `${lfNote()}<div class="fl-grid lf-allg">
    ${K.card('Profil', `${K.sw('_aktiv', 'Aktiv', 'Inaktive Lieferanten erscheinen nicht mehr in Bestellung, Wareneingang, Rechnungen und Artikelmaske und nicht im Bestellvorschlag; ihre Belege bleiben.')}
      ${K.in('nr', 'Nr. *', {inputmode: 'numeric', hint: 'Lieferantennummer – eindeutig. Die interne Kennung der Belege ändert sich nicht.'})}${K.in('name', 'Name *')}${K.landSel('country', 'Land *', {leer: undefined, hint: 'Versendungsland für die Intrastat-Meldung und Land der Haupt-Adresse.'})}
      ${K.in(`${P}gln`, 'Haupt-GLN', {mono: true, inputmode: 'numeric', max: 13, hint: '13-stellige GLN: erkennt Lieferungen aus EDI-Nachrichten und steht in der Bestellung.'})}${K.in(`${P}empfaenger_gln`, 'Empfänger-GLN', {mono: true, inputmode: 'numeric', max: 13, hint: 'Nur wenn Nachrichten an einen anderen Empfänger gehen (z. B. Clearingstelle); leer = Haupt-GLN.'})}
      ${K.in('customer_no', 'Kunden-Nr.', {hint: 'Unsere Kundennummer beim Lieferanten – steht auf der Bestellung. Je Filiale anders: Reiter „Filial-Kunden-Nummern“.'})}
      ${K.sw(`${P}rma_pflicht`, 'RMA Code Pflicht', 'Retouren an diesen Lieferanten lassen sich nur mit RMA-/Rücksendenummer versenden.')}`)}
    <div class="fl-stack">${K.card('Liefereinstellungen', `${K.sw(`${P}gegenscannen`, 'Gegenscannen bei WE-Avis erforderlich', 'Das Avis lässt sich erst einbuchen, nachdem die Ware im Scanner-Wareneingang gezählt wurde.')}
      ${K.sw(`${P}order_vorschlag`, 'Order-Vorschläge nutzen', 'Aus = Artikel dieses Lieferanten erscheinen nicht im Bestellvorschlag und in der KI-Nachbestellung.')}
      ${K.in('lead_days', 'Lief.-Term. 1 Offset (Tage)', {num: true, inputmode: 'numeric', hint: 'Lieferzeit – Grundlage der KI-Nachbestellung.'})}`)}
      ${K.card('Kontaktdaten', `${K.in('contact', 'Ansprechperson', {hint: 'Steht auf der Bestellung als „z. H.“.'})}${K.in('email', 'E-Mail', {type: 'email', hint: 'Empfänger der Bestellung per E-Mail.'})}${K.in(`${P}web`, 'Webseite')}${K.in('phone', 'Telefon')}${K.in(`${P}fax`, 'Fax')}`)}</div>
    <div class="fl-stack">${K.card('Finanzeinstellungen', `${K.in(`${P}uid`, 'USt-IdNr.', {mono: true, ph: 'ATU12345678', hint: 'Erscheint auf der Eingangsrechnung.'})}${K.in(`${P}steuernr`, 'Steuernummer')}
      ${K.in(`${P}min_summe`, 'Min. Auftragssumme (€)', {num: true, inputmode: 'decimal', hint: 'Beim Bestellen fragt Kontor nach, wenn die Bestellung darunter liegt.'})}${K.in(`${P}min_menge`, 'Min. Auftragsmenge', {num: true, inputmode: 'numeric', hint: 'Stückzahl der ganzen Bestellung.'})}
      <label class="field"><span>Währung</span><select class="input select" disabled><option>EUR – Euro</option></select><small class="ea-hint">Alle Beträge in Kontor sind in Euro.</small></label>
      <div class="zp-pair">${K.in(`${P}skonto`, 'Skonto (%)', {num: true, inputmode: 'decimal'})}${K.in(`${P}valuta`, 'Valuta (Tage)', {num: true, inputmode: 'numeric'})}</div>${zbSel}
      ${K.in('iban', 'IBAN', {mono: true, ph: 'AT61 1904 3002 3457 3201', hint: 'Für die SEPA-Zahlungsdatei. Änderungen verlangen die Freigabe eines Administrators.'})}${K.in('bic', 'BIC', {mono: true, ph: 'BKAUATWW'})}`)}</div>
    ${K.card('Zusatzinformationen', `<div class="lf-zus">${K.area('note', 'Info', 3, 'Interner Hinweis – erscheint beim Bestellen.')}${K.area(`${P}info2`, 'Info 2', 3, 'Zweiter interner Hinweis.')}${K.area(`${P}vereinbarung1`, 'Vereinbarung 1', 3, 'Erscheint beim Bestellen und auf der Bestellung.')}${K.area(`${P}vereinbarung2`, 'Vereinbarung 2', 3, 'Erscheint beim Bestellen und auf der Bestellung.')}${K.area(`${P}rma_ablauf`, 'RMA Ablauf', 3, 'Hinweis zum Ablauf einer Rücksendung – erscheint in der Retoure an diesen Lieferanten.')}</div>`, 'lf-wide')}
    ${cf}
  </div>`, mount: el => {
      const box = $('[data-lf-cf]', el); if (!box) return;
      if (lfLocked()) { box.style.pointerEvents = 'none'; box.style.opacity = '.6'; return; }
      // Eigene Felder in den Entwurf spiegeln: sie überstehen Reiterwechsel, Aktualisieren der Ansicht und Sichern aus anderen Reitern
      const upd = () => { LE.d.fields = cfRead(box, 'lieferant'); LFK.dirty(el); };
      box.addEventListener('input', upd); box.addEventListener('change', upd); box.addEventListener('click', e => { if (e.target.closest('[data-cfsw]')) setTimeout(upd, 0); });
    }};
}

/* ── Haupt-Adresse und Rechnungsadresse ── */
/** Druck-Ansicht des Empfängers (Name + Anschrift) – wird beim Tippen nachgeführt */
function lfPrevHTML(a) {
  const D = LE.d, v = D.profile[a], bill = a === 'rechnung', lines = lfAdrLines(v, bill ? v.land : D.country), nm = bill ? (String(v.name || '').trim() || D.name) : D.name;
  return lines.length || nm ? [`<b>${esc(nm)}</b>`, ...lines.map(esc)].join('<br>') : '<span class="muted">Noch keine Adresse</span>';
}
function lfPrevAktual(el) { const a = LE.tab === 'haupt' ? 'adresse' : LE.tab === 'rechn' ? 'rechnung' : null, f = a && $('.fl-prev', el); if (f) f.innerHTML = lfPrevHTML(a); }
function lfAdresse(a) {
  const D = LE.d, K = LFK, P = `profile.${a}.`, bill = a === 'rechnung';
  const nameFeld = bill ? K.in(`${P}name`, 'Name', {hint: 'Leer = Name des Lieferanten.'}) : `<label class="field"><span>Name</span><input class="input ea-ro" readonly tabindex="-1" value="${esc(D.name)}"><small class="ea-hint">Aus „Name“ (Reiter Allgemein).</small></label>`;
  const landFeld = bill ? K.sel(`${P}land`, 'Land *', lfLandOpts(), {leer: 'wie Haupt-Adresse'}) : K.landSel('country', 'Land *', {leer: undefined, hint: 'Dasselbe Feld wie „Land“ im Reiter Allgemein.'});
  const hint = bill ? 'Anschrift für Eingangsrechnung und Zahlung (Belegkopf). Leer = es gilt die Haupt-Adresse. Bestellung, Avis und Retoure gehen an die Haupt-Adresse.' : 'Anschrift der Bestellung, des Avis und der Retoure (Empfängerblock).';
  return {html: `${lfNote()}<p class="ea-hint ue-note">${esc(hint)}</p><div class="fl-grid fl-2">
    ${K.card(bill ? 'Rechnungsadresse' : 'Haupt-Adresse', `${nameFeld}${K.in(`${P}adrzeile1`, 'Adr.-Zeile 1')}${K.in(`${P}adrzeile2`, 'Adr.-Zeile 2')}<div class="zp-pair">${K.in(`${P}strasse`, 'Straße')}${K.in(`${P}hausnr`, 'Haus-Nr.')}</div><div class="zp-pair">${K.in(`${P}plz`, 'PLZ')}${K.in(`${P}ort`, 'Ort')}</div>${K.in(`${P}postfach`, 'Postfach')}${landFeld}${K.in(`${P}bundesland`, 'Bundesland / Kanton / Provinz')}
      ${bill ? `<button type="button" class="btn btn-secondary" data-mf-a="adrkopie" ${lfLocked() ? 'disabled' : ''}>${ic('copy', 'i-sm')}Von Haupt-Adresse übernehmen</button>` : ''}`)}
    ${K.card('Druck-Ansicht', `<div class="fl-prev">${lfPrevHTML(a)}</div><small class="ea-hint">So steht der Empfänger auf dem Beleg${bill ? ' (Eingangsrechnung, Zahlung)' : ' (Bestellung, Avis, Retoure)'}.</small>`)}
  </div>`};
}

/* ── Filial-Kunden-Nummern ── */
const lfFkRows = () => Object.entries(LE.d.profile.filial_kunden).map(([st, nr]) => { const r = typeof flRow === 'function' ? flRow(st) : null; return {id: st, filiale: r ? `${flName(r)} (${r.nr})` : st, kundennr: nr}; });
function lfFk() {
  return {html: `${lfNote()}<p class="ea-hint ue-note">Hat Ihr Unternehmen bei diesem Lieferanten je Filiale eine eigene Kundennummer, tragen Sie sie hier ein. Bestellt eine Filiale, steht ihre Nummer auf der Bestellung (und in der EDI-Bestellung); ohne Eintrag gilt die „Kunden-Nr.“ aus dem Reiter Allgemein. Jede Filiale bekommt nur ihre eigene Nummer.</p>
    <div class="ae-pane"><div class="ae-card" style="flex:1 1 100%"><h4>Filial-Kundennummern</h4><div data-lf-fk></div></div></div>`,
    mount: el => {
      AG['lf-fk'] = agNew({embed: true, title: 'Filial-Kundennummern', cols: [{k: 'filiale', l: 'Filial-Name (Nr.)', w: 260}, {k: 'kundennr', l: 'Kunden-Nr.', w: 200}], sort: {k: 'filiale', dir: 1}, rows: lfFkRows,
        toolbar: [], extra: lfLocked() ? [] : [{k: 'neu', l: 'Neu', icon: 'plus'}],
        remove: lfLocked() ? undefined : async ids => { ids.forEach(i => delete LE.d.profile.filial_kunden[i]); LFK.dirty(el); LFK.render(); }, reload: () => {},
        edit: id => lfLocked() ? null : lfFkDialog(id), actions: {neu: () => lfFkDialog(null)}});
      agMount('lf-fk', $('[data-lf-fk]', el));
    }};
}
function lfFkDialog(id) {
  const D = LE.d, fil = (typeof FIL !== 'undefined' ? FIL.rows : []).filter(r => r._aktiv !== false), frei = fil.filter(r => id ? flSame(r.id, id) : !Object.keys(D.profile.filial_kunden).some(k => flSame(k, r.id)));
  const cur = id ? D.profile.filial_kunden[id] : '';
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Filial-Kundennummer"><div class="m-head"><div class="m-ic">${ic('store')}</div><div><h2>Filial-Kundennummer</h2><p>Lieferant „${esc(D.name || 'neu')}“</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body"><div class="ed-grid"><label class="field full"><span>Filial-Name (Nr.)</span><select class="input select" id="fkSt" ${id ? 'disabled' : ''}>${id ? '' : '<option value="">– wählen –</option>'}${frei.map(r => `<option value="${esc(r.id)}" ${flSame(r.id, id) ? 'selected' : ''}>${esc(flName(r))} (${esc(r.nr)})</option>`).join('')}</select></label>
      <label class="field full"><span>Kunden-Nr.</span><input class="input" id="fkNr" value="${esc(cur)}" maxlength="40" autocomplete="off"></label></div>${!frei.length && !id ? '<p class="ea-hint">Für alle aktiven Filialen gibt es schon eine Nummer.</p>' : ''}</div>
    <div class="m-foot">${id ? `<button class="btn btn-danger" id="fkDel">${ic('trash', 'i-sm')}Löschen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="fkOk">${ic('check', 'i-sm')}Übernehmen</button></div></div>`, {focus: id ? '#fkNr' : '#fkSt'});
  $('#fkOk', el).onclick = () => {
    const st = id || $('#fkSt', el).value, nr = $('#fkNr', el).value.trim();
    if (!st) return toast('Bitte eine Filiale wählen', {type: 'warn'});
    if (!nr) return toast('Bitte die Kunden-Nr. eintragen', {type: 'warn'});
    D.profile.filial_kunden[st] = nr; closeLayer(el); LE.dirty = true; LFK.render();
  };
  if (id) $('#fkDel', el).onclick = () => { delete D.profile.filial_kunden[id]; closeLayer(el); LE.dirty = true; LFK.render(); };
}

/* ── Marken: zugeordnet (links) und angelegt (rechts) ── */
const lfMarkeName = bid => mkRow(bid)?.name || bid;
function lfMarkenRows(on) {
  const D = LE.d, set = new Set(D.marken.map(m => m.brand_id)), n = ART.filter(a => LE.id && a.supplierId === LE.id);
  if (on) return D.marken.map(m => { const name = lfMarkeName(m.brand_id); return {id: m.brand_id, name, ext: m.ext_name, herkunft: LF_GLN_HERKUNFT.find(h => h[0] === m.gln_src)?.[1] || m.gln_src, gln: m.gln, edinr: m.edi_nr, edinameb: m.edi_name, art: n.filter(a => mkNorm(a.brand) === mkNorm(name)).length, kommentar: m.comment}; });
  return MK.rows.filter(r => !set.has(r.id) && r._aktiv !== false).map(r => ({id: r.id, name: r.name}));
}
function lfMarken() {
  return {html: `${lfNote()}<p class="ea-hint ue-note">Links stehen die Marken, die dieser Lieferant liefert, rechts alle angelegten Marken. Zuordnen per Ziehen, Doppelklick, „Zuordnen“ oder „Neu“ (mit Externem Marken-Namen und EDI-Angaben). Beim Anlegen eines Artikels dieser Marke wird der Lieferant vorgeschlagen; nach dem Sichern lassen sich vorhandene Artikel ohne Lieferant nachtragen. Externer Marken-Name, EDI Marken-Nr. und -Name sowie die GLN (Herkunft „Hersteller“) ordnen beim PRICAT-Import die Marke des Lieferanten Ihrer eigenen Marke zu; eine GLN mit Herkunft „Lieferant“ erkennt den Lieferanten in EDI-Nachrichten. Marken legen Sie unter Stammdaten › Marken an.</p>
    <div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnete Marken</h4><div data-lf-ma="a"></div></div><div class="ae-card"><h4>Angelegte Marken</h4><div data-lf-ma="b"></div></div></div>`,
    mount: el => {
      const locked = lfLocked();
      const mv = (ids, add) => {
        if (locked) return;
        const D = LE.d;
        if (add) ids.forEach(i => { if (!D.marken.some(m => m.brand_id === i)) D.marken.push({brand_id: i, ext_name: '', gln_src: '', gln: '', edi_nr: '', edi_name: '', comment: ''}); });
        else D.marken = D.marken.filter(m => !ids.includes(m.brand_id));
        LFK.dirty(el); LFK.render();
      };
      const [da, db] = agDual('lf-ma-a', 'lf-ma-b', mv);
      AG['lf-ma-a'] = agNew({embed: true, title: 'Zugeordnete Marken', rows: () => lfMarkenRows(true), dnd: locked ? null : da, sort: {k: 'name', dir: 1},
        cols: [{k: 'name', l: 'Marken-Name', w: 150}, {k: 'ext', l: 'Externer Marken-Name', w: 150}, {k: 'herkunft', l: 'GLN-Herkunft', w: 110}, {k: 'gln', l: 'GLN', w: 120}, {k: 'edinr', l: 'EDI Marken-Nr.', w: 110}, {k: 'edinameb', l: 'EDI Marken-Name', w: 130}, {k: 'art', l: 'Anz. Art.', t: 'num', w: 80}, {k: 'kommentar', l: 'Kommentar', w: 160}],
        extra: locked ? [] : [{k: 'neu', l: 'Neu', icon: 'plus'}, {k: 'rm', l: 'Entfernen', icon: 'x'}], edit: id => lfMarkeDialog(id),
        actions: {neu: () => lfMarkeDialog(null), rm: () => { const s = [...AG['lf-ma-a'].sel]; if (s.length) mv(s, false); }}});
      AG['lf-ma-b'] = agNew({embed: true, title: 'Angelegte Marken', rows: () => lfMarkenRows(false), dnd: locked ? null : db, sort: {k: 'name', dir: 1}, cols: [{k: 'name', l: 'Name', w: 200}],
        extra: locked ? [] : [{k: 'neu', l: 'Neu', icon: 'plus'}, {k: 'add', l: 'Zuordnen', icon: 'plus'}], edit: id => locked ? null : mv([id], true),
        actions: {neu: () => go('st-marke'), add: () => { const s = [...AG['lf-ma-b'].sel]; if (s.length) mv(s, true); }}});
      agMount('lf-ma-a', $('[data-lf-ma="a"]', el)); agMount('lf-ma-b', $('[data-lf-ma="b"]', el));
    }};
}
function lfMarkeDialog(id) {
  const D = LE.d, ex = id ? D.marken.find(m => m.brand_id === id) : null;
  if (id && !ex) return;
  const frei = MK.rows.filter(r => r._aktiv !== false && !D.marken.some(m => m.brand_id === r.id));
  const v = ex || {brand_id: '', ext_name: '', gln_src: '', gln: '', edi_nr: '', edi_name: '', comment: ''};
  const ro = lfLocked();
  const el = openLayer(`<div class="modal" style="width:min(560px,100%)" role="dialog" aria-modal="true" aria-label="Marke zuordnen"><div class="m-head"><div class="m-ic">${ic('star')}</div><div><h2>Marke zuordnen</h2><p>Lieferant „${esc(D.name || 'neu')}“</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body"><div class="ed-grid"><label class="field full"><span>Lieferant</span><input class="input ea-ro" readonly tabindex="-1" value="${esc(D.name)}"></label>
      <label class="field full"><span>Marke *</span><select class="input select" id="lmMarke" ${id || ro ? 'disabled' : ''}>${id ? '' : '<option value="">– wählen –</option>'}${(id ? MK.rows.filter(r => r.id === id) : frei).map(r => `<option value="${esc(r.id)}" ${r.id === v.brand_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label class="field full"><span>Externer Marken-Name</span><input class="input" id="lmExt" value="${esc(v.ext_name)}" maxlength="80" ${ro ? 'disabled' : ''}><small class="ea-hint">So nennt der Lieferant die Marke (z. B. in PRICAT-Dateien).</small></label>
      <label class="field"><span>GLN-Herkunft</span><select class="input select" id="lmHk" ${ro ? 'disabled' : ''}><option value="">–</option>${LF_GLN_HERKUNFT.map(([k, l]) => `<option value="${k}" ${k === v.gln_src ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>GLN</span><input class="input mono" id="lmGln" value="${esc(v.gln)}" maxlength="13" inputmode="numeric" ${ro ? 'disabled' : ''}></label>
      <label class="field"><span>EDI Marken-Nr.</span><input class="input" id="lmEn" value="${esc(v.edi_nr)}" maxlength="40" ${ro ? 'disabled' : ''}></label><label class="field"><span>EDI Marken-Name</span><input class="input" id="lmEm" value="${esc(v.edi_name)}" maxlength="80" ${ro ? 'disabled' : ''}></label>
      <label class="field full"><span>Kommentar</span><input class="input" id="lmKo" value="${esc(v.comment)}" maxlength="300" ${ro ? 'disabled' : ''}></label></div>${!id && !frei.length ? '<p class="ea-hint">Alle angelegten Marken sind schon zugeordnet – neue Marken legen Sie unter Stammdaten › Marken an.</p>' : ''}</div>
    <div class="m-foot">${id && !ro ? `<button class="btn btn-danger" id="lmDel">${ic('trash', 'i-sm')}Entfernen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>${ro ? 'Schließen' : 'Abbrechen'}</button>${ro ? '' : `<button class="btn btn-primary" id="lmOk">${ic('check', 'i-sm')}Übernehmen</button>`}</div></div>`, {focus: id ? '#lmExt' : '#lmMarke'});
  if (ro) return;
  $('#lmOk', el).onclick = () => {
    const bid = id || $('#lmMarke', el).value, gln = $('#lmGln', el).value.replace(/\s+/g, '');
    if (!bid) return toast('Bitte eine Marke wählen', {type: 'warn'});
    if (gln && !lfGlnOk(gln)) return toast('GLN: 13 Ziffern mit gültiger Prüfziffer', {type: 'warn'});
    const z = {brand_id: bid, ext_name: $('#lmExt', el).value.trim(), gln_src: $('#lmHk', el).value, gln, edi_nr: $('#lmEn', el).value.trim(), edi_name: $('#lmEm', el).value.trim(), comment: $('#lmKo', el).value.trim()};
    const i = D.marken.findIndex(m => m.brand_id === bid); if (i >= 0) D.marken[i] = z; else D.marken.push(z);
    closeLayer(el); LE.dirty = true; LFK.render();
  };
  if (id) $('#lmDel', el).onclick = () => { D.marken = D.marken.filter(m => m.brand_id !== id); closeLayer(el); LE.dirty = true; LFK.render(); };
}

/* ── Dateien ── */
const lfDateiTyp = n => { const e = String(n).split('.').pop(); return e && e !== n ? e.toUpperCase() : ''; };
const lfFileRows = () => LE.files.map(f => ({id: String(f.id), am: f.uploaded_at, name: f.name, typ: lfDateiTyp(f.name), beschr: f.descr || '', manr: f.user_nr || '', maname: f.user_name || '', groesse: f.size}));
const lfB64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Datei nicht lesbar')); r.readAsDataURL(file); });
function lfDateien() {
  const hint = !DESKTOP ? 'Dokumente lassen sich nur in der Desktop-App ablegen.' : !LE.id ? 'Bitte den Lieferanten zuerst sichern – dann lassen sich Dokumente hochladen.' : lfLocked() ? 'Die Dokumente liegen in der Zentrale.' : '';
  return {html: `${lfNote()}<p class="ea-hint ue-note">Preislisten, Konditionen, RMA-Bedingungen, Zertifikate und andere Unterlagen zum Lieferanten. Die Dateien liegen in der Datenbank dieser Kasse (und damit in der Datensicherung); sie gehen nicht an die Filialen. Erlaubt sind PDF, Bilder, Text/CSV, Excel, Word, OpenDocument und ZIP bis 15 MB. ${esc(hint)}</p>
    <div class="ae-pane"><div class="ae-card" style="flex:1 1 100%"><h4>Dokumente</h4><div data-lf-files></div></div></div>`,
    mount: el => {
      const can = DESKTOP && LE.id && !lfLocked();
      AG['lf-files'] = agNew({embed: true, title: 'Dokumente', rows: lfFileRows, sort: {k: 'am', dir: -1}, toolbar: [],
        cols: [{k: 'am', l: 'Hochgeladen am', w: 150, get: r => r.am, fmt: v => v ? fmtTs(v) : ''}, {k: 'name', l: 'Dateiname', w: 230}, {k: 'typ', l: 'Dateityp', w: 90}, {k: 'beschr', l: 'Beschreibung', w: 240}, {k: 'manr', l: 'Mitarbeiter-Nr.', w: 110}, {k: 'maname', l: 'Mitarbeiter-Name', w: 160}, {k: 'groesse', l: 'Größe', t: 'num', w: 90, fmt: v => v >= 1048576 ? `${num(v / 1048576, 1)} MB` : `${num(Math.max(1, Math.round(v / 1024)))} KB`}],
        extra: [{k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, ...(can ? [{k: 'up', l: 'Hochladen', icon: 'upload'}] : []), {k: 'open', l: 'Öffnen', icon: 'arrow-right'}, {k: 'save', l: 'Speichern unter', icon: 'download'}, ...(can ? [{k: 'descr', l: 'Beschreibung', icon: 'edit'}] : [])],
        remove: can ? async ids => { await lfDateiLoeschen(ids); } : undefined, reload: () => {},
        edit: id => lfDateiOeffnen(id),
        actions: {refresh: async () => { LE.filesFor = null; await lfLoadFiles(); LFK.render(); }, up: () => lfDateiHoch(), open: () => lfDateiAuswahl(lfDateiOeffnen), save: () => lfDateiAuswahl(lfDateiSpeichern), descr: () => lfDateiAuswahl(lfDateiBeschreiben)}});
      agMount('lf-files', $('[data-lf-files]', el));
      if (can) fileDrop($('.ae-card', el), {multiple: true, hint: 'Dokumente hier ablegen', accept: /\.(pdf|jpe?g|png|webp|gif|tiff?|txt|csv|xlsx?|docx?|odt|ods|zip)$/i, onFiles: async files => { for (const f of files) await lfDateiB64Hoch(f); await lfDateiNeu(); }});
    }};
}
async function lfDateiNeu() { LE.filesFor = null; await lfLoadFiles(); LFK.render(); }
function lfDateiAuswahl(fn, mehrere) {
  const s = [...AG['lf-files'].sel]; if (!s.length) return toast('Bitte ein Dokument markieren', {icon: 'info'});
  return mehrere ? fn(s) : fn(s[0]);
}
async function lfDateiHoch() {
  try {
    const r = await invoke('lieferant_datei_hochladen', {supplierId: LE.id, user: S.user.id});
    if (r.fehler?.length) toast('Nicht alle Dokumente übernommen', {t2: r.fehler.join(' · '), type: 'warn', dur: 9000});
    if (r.dateien?.length) toast(r.dateien.length === 1 ? 'Dokument hochgeladen' : `${r.dateien.length} Dokumente hochgeladen`, {t2: r.dateien.map(x => x.name).join(', '), type: 'pos', icon: 'upload', dur: 2400});
  } catch (e) { toast('Hochladen fehlgeschlagen', {t2: String(e.message || e), type: 'warn', dur: 7000}); }
  await lfDateiNeu();
}
async function lfDateiB64Hoch(f) {
  try { const x = await invoke('lieferant_datei_hochladen_b64', {supplierId: LE.id, name: f.name, data: await lfB64(f), user: S.user.id}); toast('Dokument hochgeladen', {t2: x.name, type: 'pos', icon: 'upload', dur: 2000}); }
  catch (e) { toast('Hochladen fehlgeschlagen', {t2: `${f.name}: ${String(e.message || e)}`, type: 'warn', dur: 7000}); }
}
async function lfDateiOeffnen(id) {
  const f = LE.files.find(x => String(x.id) === String(id));
  if (f && /\.(doc|xls)$/i.test(f.name) && !await confirmBox('Dokumente im alten Office-Format (.doc, .xls) können Makros enthalten. Trotzdem öffnen? („Speichern unter“ öffnet nichts.)', 'Öffnen')) return;
  try { await invoke('lieferant_datei_oeffnen', {id: +id, by: S.user.name}); } catch (e) { toast('Öffnen nicht möglich', {t2: String(e.message || e), type: 'warn'}); } }
async function lfDateiSpeichern(id) { try { const p = await invoke('lieferant_datei_speichern', {id: +id, by: S.user.name}); if (p) toast('Gespeichert', {t2: p, type: 'pos', icon: 'download'}); } catch (e) { toast('Speichern nicht möglich', {t2: String(e.message || e), type: 'warn'}); } }
async function lfDateiBeschreiben(id) {
  const f = LE.files.find(x => String(x.id) === String(id)); if (!f) return;
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Beschreibung"><div class="m-head"><div class="m-ic">${ic('edit')}</div><div><h2>Beschreibung</h2><p>${esc(f.name)}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body"><label class="field"><span>Beschreibung</span><input class="input" id="dsT" value="${esc(f.descr || '')}" maxlength="300" autocomplete="off"></label></div><div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="dsOk">${ic('check', 'i-sm')}Übernehmen</button></div></div>`, {focus: '#dsT'});
  $('#dsOk', el).onclick = async () => { try { await invoke('lieferant_datei_beschreiben', {id: +id, descr: $('#dsT', el).value}); closeLayer(el); await lfDateiNeu(); } catch (e) { toast('Nicht möglich', {t2: String(e.message || e), type: 'warn'}); } };
}
async function lfDateiLoeschen(ids) {
  if (!await confirmBox(ids.length === 1 ? 'Dieses Dokument löschen?' : `${ids.length} Dokumente löschen?`, 'Löschen')) return;
  for (const i of ids) { try { await invoke('lieferant_datei_loeschen', {id: +i, by: S.user.name}); } catch (e) { toast('Löschen nicht möglich', {t2: String(e.message || e), type: 'warn'}); } }
  await lfDateiNeu();
}

/* ── Sichern und Löschen ── */
/** Sichern – nie zweimal gleichzeitig (Doppelklick), Eingaben während des Sicherns bleiben erhalten */
async function lfSave() {
  if (LE.busy) return;
  LE.busy = true;
  try { await lfSaveEinmal(); } finally { LE.busy = false; }
}
async function lfSaveEinmal() {
  if (lfLocked()) return;
  const D = LE.d, O = LE.orig, isNew = !LE.id;
  if (!LFK.gate()) return;
  if (typeof cfDefs === 'function' && cfDefs('lieferant').length) { const cfv = await cfCheck('lieferant', D.fields || {}); if (!cfv) return; D.fields = cfv; }
  const row = lfToRow(D), name = row.name, gesendet = JSON.stringify(D);
  const sens = DESKTOP && !isNew && ['iban', 'bic'].some(k => String(D[k]).replace(/\s+/g, '').toUpperCase() !== String(O[k]).replace(/\s+/g, '').toUpperCase());
  if (sens) { try { await stepUp({title: 'Administrator-Freigabe', text: `Bankverbindung des Lieferanten „${name}“ ändern`, admin: true}); } catch { return; } }
  const neuMarken = D.marken.map(m => m.brand_id).filter(b => !O.marken.some(m => m.brand_id === b));
  let saved;
  try {
    if (DESKTOP) saved = await invoke('lieferant_save', {row, by: S.user.name});
    else {
      const l = persist.get('lieferanten', lfPreviewRows()).slice(), i = l.findIndex(r => r.id === row.id);
      const rec = {...row, _geaendert: new Date().toISOString()};
      if (i < 0) { let id = `L-${String(row.nr).padStart(3, '0')}`, k = 1; while (l.some(r => r.id === id)) id = `L-${String(row.nr + 1000 * k++).padStart(3, '0')}`; rec.id = id; l.push(rec); } else l[i] = {...l[i], ...rec};
      persist.set('lieferanten', l); saved = lfDecorate(rec);
    }
  } catch (err) { return toast('Speichern fehlgeschlagen', {t2: String(err.message || err), type: 'warn', dur: 7000}); }
  await Promise.all([lfLoad(true), loadSuppliers()]);
  if (typeof CF !== 'undefined' && saved.id) CF.sup[saved.id] = saved.fields || {};
  const id = saved.id, weitergetippt = JSON.stringify(LE.d) !== gesendet, frisch = lfDraft(id);
  LE.id = id; LE.orig = mclone(frisch); LE.filesFor = null; if (isNew) LE.ids = [...LE.ids, id];
  if (weitergetippt) { LE.d.id = id; } // während des Sicherns weitergetippt: die neuen Eingaben bleiben, ungesichert
  else { LE.d = frisch; LE.dirty = false; LE.show = false; }
  await lfLoadFiles();
  Hooks.emit('lieferant.saved', {lieferant: id, name, neu: isNew});
  toast(isNew ? 'Lieferant angelegt' : 'Gespeichert', {t2: `${row.nr} · ${name}`, type: 'pos', icon: 'building', dur: 2200});
  LFK.render(); renderTopbar();
  if (neuMarken.length) await lfArtikelNachtragen(id, neuMarken, name);
}
/** Artikel der neu zugeordneten Marken ohne Lieferant: dem Lieferanten zuordnen? (nie überschreiben) */
async function lfArtikelNachtragen(id, brandIds, name) {
  let n = 0;
  if (DESKTOP) { try { n = await invoke('lieferant_artikel_offen', {brandIds}); } catch { return; } }
  else { const names = new Set(brandIds.map(b => mkNorm(mkRow(b)?.name))); n = ART.filter(a => !a.supplierId && names.has(mkNorm(a.brand))).length; }
  if (!n || !await confirmBox(`${num(n)} Artikel dieser Marken haben noch keinen Lieferanten. Dem Lieferanten „${name}“ zuordnen? (Artikel mit anderem Lieferanten bleiben unverändert.)`, 'Zuordnen')) return;
  try {
    if (DESKTOP) { const z = await invoke('lieferant_artikel_zuordnen', {supplierId: id, brandIds, by: S.user.name}); replaceCatalog(await invoke('catalog_list')); toast('Artikel zugeordnet', {t2: `${num(z)} Artikel · ${name}`, type: 'pos', icon: 'tag'}); }
    else { const names = new Set(brandIds.map(b => mkNorm(mkRow(b)?.name))); let z = 0; ART.forEach(a => { if (!a.supplierId && names.has(mkNorm(a.brand))) { a.supplierId = id; z++; } }); toast('Artikel zugeordnet', {t2: `${num(z)} Artikel · ${name}`, type: 'pos', icon: 'tag'}); }
    await lfLoad(true); if (!LE.dirty) { LE.d = lfDraft(id); LE.orig = mclone(LE.d); } LFK.render();
  } catch (e) { toast('Nicht möglich', {t2: String(e.message || e), type: 'warn'}); }
}
async function lfRemove(ids, fromMask) {
  const abort = () => { throw new Error('abgebrochen'); };
  if (lfLocked()) { toast('Lieferanten löscht die Zentrale', {icon: 'lock'}); abort(); }
  const rs = ids.map(lfRow).filter(Boolean); if (!rs.length) abort();
  const wer = rs.length === 1 ? `Lieferant „${lfName(rs[0])}“` : `${rs.length} Lieferanten`;
  if (!await confirmBox(`${wer} löschen? Lieferanten mit Bestellungen, Belegen (auch EDI-Nachrichten, Reklamationen) oder Artikeln lassen sich nicht löschen – sie lassen sich nur deaktivieren (Schalter „Aktiv“). Beim Löschen entfallen auch Marken-Zuordnungen, hochgeladene Dokumente und die Einträge des Lieferanten unter EDI-Einstellungen.`, 'Löschen')) abort();
  if (DESKTOP) await stepUp({title: 'Administrator-Freigabe', text: `${wer} löschen`, admin: true}).catch(abort);
  const fehler = [];
  for (const r of rs) {
    try {
      if (DESKTOP) await invoke('lieferant_delete', {id: r.id, by: S.user.name});
      else { if (r._artikel) throw `Zum Lieferanten „${lfName(r)}“ gehören ${r._artikel} Artikel – er lässt sich nicht löschen, aber deaktivieren (Schalter „Aktiv“)`; persist.set('lieferanten', persist.get('lieferanten', []).filter(x => x.id !== r.id)); }
    } catch (e) { fehler.push(String(e.message || e)); }
  }
  await Promise.all([lfLoad(true), loadSuppliers()]);
  if (fehler.length) { toast('Nicht alles gelöscht', {t2: fehler.join(' · '), type: 'warn', dur: 9000}); if (fehler.length === rs.length) abort(); return; }
  toast(rs.length === 1 ? 'Lieferant gelöscht' : `${rs.length} Lieferanten gelöscht`, {t2: rs.map(lfName).join(', '), icon: 'building', dur: 2400});
  if (fromMask) { LE.dirty = false; LE.d = null; go('lieferanten'); }
}

/* ── Wirkung in den Belegen ── */
const lfSup = id => SUPPLIERS_ALL.find(x => x.id === id) || SUPPLIERS.find(x => x.id === id);
/** Lieferanten für Auswahllisten: die aktiven, dazu der aktuell gewählte – auch wenn er inzwischen inaktiv ist („(inaktiv)“), damit er beim Sichern nicht verloren geht */
function lfOptionen(sel) {
  const l = SUPPLIERS.map(s => [s.id, s.name]);
  if (sel && !l.some(x => x[0] === sel)) { const a = SUPPLIERS_ALL.find(s => s.id === sel); if (a) l.push([a.id, `${a.name} (inaktiv)`]); }
  return l;
}
/** Eingangsrechnung: Fälligkeit, Skonto und Skonto-Frist aus Valuta, Skonto und Zahlungs-Bed. des Lieferanten vorbelegen – nur Felder, die leer sind oder noch die frühere Vorgabe tragen */
function lfEiVorgabe(st) {
  const sup = lfSup(st.partner), au = st._auto ||= {};
  if (!sup) return;
  const p = sup.profile || {}, z = stRows('zahlungsbedingung').find(r => r.id === p.zahlungsbed);
  const valuta = +p.valuta || +z?.tage || 0, skonto = +p.skonto || +z?.skonto || 0, skTage = +z?.skonto_tage || 0;
  const base = st.date ? new Date(st.date + 'T12:00:00') : new Date(), add = n => dIso(new Date(base.getTime() + n * 864e5));
  const frei = (cur, k) => cur == null || cur === '' || cur === au[k];
  if (frei(st.due, 'due')) { st.due = valuta ? add(valuta) : null; au.due = st.due; }
  if (frei(st.data.skonto_pct, 'pct')) { st.data.skonto_pct = skonto || ''; au.pct = st.data.skonto_pct; }
  if (frei(st.data.skonto_bis, 'bis')) { st.data.skonto_bis = skonto && skTage ? add(skTage) : ''; au.bis = st.data.skonto_bis; }
}
DOC_EXTRA.lretoure = st => {
  const s = lfSup(st.partner), p = s?.profile || {}; if (!p.rma_pflicht && !p.rma_ablauf) return '';
  return `<div class="prompt-hint blk" style="display:grid;gap:4px">${p.rma_pflicht ? `<div>${ic('alert', 'i-xs')}<b>${esc(s.name)} verlangt einen RMA-Code</b> – bitte oben unter „RMA- / Rücksendenummer“ eintragen; ohne Nummer lässt sich die Retoure nicht versenden.</div>` : ''}${p.rma_ablauf ? `<div><b>RMA Ablauf:</b> <span style="white-space:pre-wrap">${esc(p.rma_ablauf)}</span></div>` : ''}</div>`;
};
DOC_EXTRA.reklamation = st => { const p = lfSup(st.data?.lieferant)?.profile || {}; return p.rma_ablauf ? `<div class="prompt-hint blk"><b>RMA Ablauf des Lieferanten:</b> <span style="white-space:pre-wrap">${esc(p.rma_ablauf)}</span></div>` : ''; };
DOC_EXTRA.avis = st => { const s = lfSup(st.partner); return s?.profile?.gegenscannen && !['gebucht', 'storniert'].includes(st.status) ? `<div class="prompt-hint blk">${ic('barcode', 'i-xs')}<b>${esc(s.name)} verlangt das Gegenscannen:</b> eingebucht wird erst, nachdem die Ware mit „Mit Scanner prüfen“ gezählt wurde.</div>` : ''; };
DOC_EXTRA.er = st => { const s = lfSup(st.partner), ids = s ? [['USt-IdNr.', s.profile?.uid], ['Steuernummer', s.profile?.steuernr]].filter(x => String(x[1] || '').trim()) : []; return s ? `${lfHinweis(s)}${ids.length ? `<div class="muted" style="font-size:12.5px">${ids.map(([l, v]) => `${l} des Lieferanten: ${esc(v)}`).join(' · ')}</div>` : ''}` : ''; };

// nur lesend – für Prüfungen: Empfängerblock und Hinweise zu einem Lieferanten, Kunden-Nr. je Filiale
if (window.KONTOR_UI) Object.assign(window.KONTOR_UI, {lfEmpfaenger: (id, art) => lfEmpfaenger(lfRow(id), art), lfKundenNr: (id, st) => lfKundenNr(lfRow(id), st), lfGlnOk, lfSichtbar: name => ({alle: SUPPLIERS_ALL.some(s => s.name === name), aktiv: SUPPLIERS.some(s => s.name === name)}), lfMarkeSync, lfMarkeEigen, lfOptionen: sel => lfOptionen(sel).map(x => x[1])});
