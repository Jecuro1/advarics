/* ═════════════════════════════════════════════════════════════════
   47 · FORMULAR- UND TABELLEN-BAUSTEINE FÜR KASSEN / KASSEN-KONFIGURATION
   ═════════════════════════════════════════════════════════════════ */
/* Feld: [Schlüssel, Beschriftung, Typ, Optionen] – Typ: text | num | check | dis | ro | select | area */
function fxField(S, [k, l, t = 'text', o]) {
  const v = S[k];
  if (t === 'check') return `<label class="ea-sw"><button type="button" class="switch" role="switch" data-fx-sw="${k}" aria-checked="${!!v}"></button><span>${esc(l)}</span></label>`;
  if (t === 'dis') return `<label class="ea-sw dis"><button type="button" class="switch" disabled role="switch" aria-checked="${!!v}"></button><span>${esc(l)}</span></label>`;
  if (t === 'ro') return `<label class="field"><span>${esc(l)}</span><input class="input ea-ro" readonly value="${esc(typeof o === 'function' ? o() : v ?? '')}"></label>`;
  if (t === 'area') return `<label class="field"><span>${esc(l)}</span><textarea class="input" rows="4" data-fx="${k}" style="height:auto">${esc(v ?? '')}</textarea></label>`;
  if (t === 'select') { const op = o(); return `<label class="field"><span>${esc(l)}</span><select class="input select" data-fx="${k}">${!op.some(x => String(x[0]) === String(v)) ? `<option value="${esc(v ?? '')}" selected>${esc(v ?? '')}</option>` : ''}${op.map(([x, y]) => `<option value="${esc(x)}" ${String(v) === String(x) ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select></label>`; }
  return `<label class="field"><span>${esc(l)}</span><input class="input ${t === 'num' ? 'num' : ''}" ${t === 'num' ? 'type="number"' : ''} data-fx="${k}" value="${esc(v ?? '')}"></label>`;
}
const fxCards = (S, cards, style = '') => `<div class="ea-cols">${cards.map(([h, f]) => `<div class="ae-card ea-card" style="${style}">${h ? `<h4>${esc(h)}</h4>` : ''}<div class="ea-fields">${f.map(x => fxField(S, x)).join('')}</div></div>`).join('')}</div>`;
function fxBind(el, S, dirty) {
  el.addEventListener('input', e => { const i = e.target.closest('[data-fx]'); if (i && i.tagName !== 'SELECT') { S[i.dataset.fx] = i.type === 'number' ? (i.value === '' ? 0 : +i.value) : i.value; dirty(); } });
  el.addEventListener('change', e => { const i = e.target.closest('select[data-fx]'); if (i) { S[i.dataset.fx] = i.value; dirty(); } });
  el.addEventListener('click', e => { const b = e.target.closest('[data-fx-sw]'); if (b && !b.disabled) { const k = b.dataset.fxSw; S[k] = !S[k]; b.setAttribute('aria-checked', String(!!S[k])); dirty(); } });
}
/* Kleines Bearbeiten-Fenster für Tabellenzeilen */
const fxRowForm = (title, fields, row, del) => aeForm(title, fields, row, {del});

/* Tabellen mit Unterdatensätzen (in S.sub[tab] gespeichert) */
const FX_ACC = [['kWaren', 'Konto Waren Ums. Kasse'], ['gkWaren', 'Gegen Konto Waren Ums. Kasse'], ['kEinzweck', 'Konto Einzweck-Gutschein'], ['textWaren', 'Text Waren Ums. Kasse', 'text'], ['kEinzweckGs', 'Konto Einzweck-Gutschrift'], ['uebertrag', 'Übertrag. Waren Ums. Kasse', 'check'], ['gkEU', 'Gegen Konto (Re.-) Ums. EU'], ['gkDritt', 'Gegen Konto (Re.-) Ums. Drittland'], ['kWE', 'Konto WE'], ['kWEvor', 'Konto WE Vorsteuer'], ['kWEeu', 'WE-Konto EU'], ['kWEdritt', 'Konto WE Drittland'], ['kRet', 'Retouren-Konto'], ['kRetEU', 'Retouren-Konto EU'], ['kRetDritt', 'Retouren-Konto Drittland'], ['kTraeger', 'Kostenträger'], ['kStelle', 'Kostenstelle'], ['bu', 'BU-Schlüssel Warenumsatz Kasse', 'text'], ['steuer', 'Steuerschlüssel G-Satz Warenumsatz Kasse', 'text'], ['kGutschein', 'Gutschein-Konto']];
const fxAccCols = () => FX_ACC.map(([k, l, t]) => ({k, l, w: 150, t: t === 'check' ? 'check' : t === 'text' ? undefined : 'num'}));
const fxAccFields = () => FX_ACC.map(([k, l, t]) => ({k, l, t: t === 'check' ? 'check' : t === 'text' ? undefined : 'num'}));
const FX_Z = ['Visa Debit', 'Mastercard Debit', 'Maestro', 'Bank', 'Mobiles Terminal', 'Bankomat', 'Alipay', 'PayPal', 'Gutschrift', 'Gutschein', 'V Pay', 'Visa Electron', 'CUP', 'JCB', 'AMEX', 'Diners', 'Visa', 'MasterCard', 'CHF', 'Bar'];
const FX_SUMMEN = ['Bar-Entnahme', 'Externe Gutscheine Verkauf', 'Externe Gutscheine Einlösung', 'Bezahlte Fremdrechnung', 'Bezahlte Rechnung', 'Kredit-Verkauf / Rechnung', 'Gutschrift-Verkauf', 'Gutschein-Verkauf', 'Bar-Entnahme (Kassenbuch)', 'Abschöpfung', 'Einlage', 'Wechselgeld'];
const FX_BELEGE = ['Geschenkbeleg', 'Rechnung', 'Auswahl', 'Gutschein-Verkauf', 'Tageseröffnung', 'Kunden-Bestellung', 'Verkaufsbeleg', 'Datenschutzrichtlinien', 'EFT-Händlerbeleg', 'Umlagerungs-Annahme', 'Bestandskorrektur', 'Reklamation', 'Tagesabschluss', 'Umlagerung', 'Nullbon', 'Standardbeleg'];
const FX_ICONS = ['Kunden-Bearbeitung', 'Sperren', 'Journal', 'Parken', 'Löschen', 'Artikel-Info', 'Umtausch', 'Gutsch.-Verk.', 'Umlagerung', 'Bst.korrektur', 'Auswahl', 'Rechnung', 'Reklamation', 'Kd.-Bestellung', '<Ausfolgeschein>', 'ERent Kunden s.', 'Set', 'Loyalty', 'Coupon-Scan', 'Fremdrechng.', 'Nachdruck', 'Nachricht', 'Kass.wechsel', 'Steuerfrei', 'Zusatz-Info', 'RFID', 'Kd.-Filter', 'Hilfe-Menü'];
const FX_LAYOUTS = ['Rechnung', 'Kunden-Verkauf', 'Reservierung', 'Retoure', 'Artikel-Info', 'Journal', 'Kassenlayout'];
const FX_POSINFO = ['Artikelname', 'Artikelnr.', 'Farb-Nr.', 'EAN', 'Warengruppe', 'Marke', 'Seriennummer', 'Verkäufer'];
const fxId = () => 'r' + Math.random().toString(36).slice(2, 8);
const fxAcc0 = () => Object.fromEntries(FX_ACC.map(([k, , t]) => [k, t === 'text' ? '' : t === 'check' ? false : 0]));
const FX_SUB = {
  sig: {cols: () => [{k: 'zdald', l: 'Zdald', w: 90}, {k: 'zert', l: 'Steuerliches Signatur-Zertifikat', w: 260}, {k: 'kette', l: 'Steuerliche Bescheinigungskette', w: 260}, {k: 'datum', l: 'Unterzeichnungsdatum der Registrierung', w: 250}, {k: 'ausfall', l: 'Signaturgerät-Ausfalldatum', w: 200}, {k: 'bis', l: 'Gültig bis', w: 160}, {k: 'serie', l: 'Seriennummer des Schlüssels', w: 220}, {k: 'key', l: 'Öffentlicher Schlüssel', w: 360}],
    template: () => S.rksv?.active ? [{id: 'AT1', zdald: 'AT1', zert: S.rksv.serial || '', kette: '', datum: S.rksv.started_at || '', ausfall: '', bis: '', serie: S.rksv.serial || '', key: S.rksv.public_key || ''}] : [], neu: true, fields: () => [{k: 'zdald', l: 'Zdald'}, {k: 'zert', l: 'Steuerliches Signatur-Zertifikat', w: 'full'}, {k: 'kette', l: 'Steuerliche Bescheinigungskette', w: 'full'}, {k: 'datum', l: 'Unterzeichnungsdatum der Registrierung'}, {k: 'ausfall', l: 'Signaturgerät-Ausfalldatum'}, {k: 'bis', l: 'Gültig bis'}, {k: 'serie', l: 'Seriennummer des Schlüssels'}, {k: 'key', l: 'Öffentlicher Schlüssel', w: 'full'}]},
  mwst: {cols: () => [{k: 'nr', l: 'MwSt.-Typ-Nr.', t: 'num', w: 120}, {k: 'name', l: 'MwSt.-Typ-Name', w: 150}, {k: 'set', l: 'MwSt.-Set', w: 110}, {k: 'pct', l: 'MwSt.-Prozent', t: 'num', w: 120, fmt: v => num(v) + ' %'}, ...fxAccCols()],
    template: () => stRows('mwsttyp').map((r, i) => ({id: r.id, nr: i + 1, name: r.name, set: 'Standard', pct: +r.satz || 0, ...fxAcc0()})), fields: () => [{k: 'name', l: 'MwSt.-Typ-Name', ro: true}, {k: 'pct', l: 'MwSt.-Prozent', t: 'num', ro: true}, ...fxAccFields()]},
  zahl: {cols: () => [{k: 'name', l: 'Zahlungsart', w: 170}, ...['konto:Konto', 'gk:Gegen-Konto', 'text:Buchhaltungs-Text', 'bu:BU-Schlüssel', 'steuer:Steuerschlüssel', 'kDiff:Konto-Nr. Diff.', 'gkDiff:Gegen-Konto-Diff.', 'kIst:Konto-Nr. Ist', 'gkIst:Gegen-Konto-Ist', 'traeger:Kostenträger', 'stelle:Kostenstelle'].map(s => { const [k, l] = s.split(':'); return {k, l, w: 140, t: ['text', 'bu', 'steuer'].includes(k) ? undefined : 'num'}; }), {k: 'uebertrag', l: 'Übertragung', t: 'check', w: 120}, {k: 'uebertrag2', l: 'Übertragung 2', t: 'check', w: 130}],
    template: () => FX_Z.map(n => ({id: fxId(), name: n, konto: 0, gk: 0, text: n, bu: '', steuer: '', kDiff: 0, gkDiff: 0, kIst: 0, gkIst: 0, traeger: 0, stelle: 0, uebertrag: false, uebertrag2: false})),
    fields: () => [{k: 'name', l: 'Zahlungsart', ro: true}, {k: 'konto', l: 'Konto', t: 'num'}, {k: 'gk', l: 'Gegen-Konto', t: 'num'}, {k: 'text', l: 'Buchhaltungs-Text'}, {k: 'bu', l: 'BU-Schlüssel'}, {k: 'steuer', l: 'Steuerschlüssel'}, {k: 'kDiff', l: 'Konto-Nr. Diff.', t: 'num'}, {k: 'gkDiff', l: 'Gegen-Konto-Diff.', t: 'num'}, {k: 'kIst', l: 'Konto-Nr. Ist', t: 'num'}, {k: 'gkIst', l: 'Gegen-Konto-Ist', t: 'num'}, {k: 'traeger', l: 'Kostenträger', t: 'num'}, {k: 'stelle', l: 'Kostenstelle', t: 'num'}, {k: 'uebertrag', l: 'Übertragung', t: 'check'}, {k: 'uebertrag2', l: 'Übertragung 2', t: 'check'}]},
  zusatz: {cols: () => [{k: 'nr', l: 'Zus.-Buchg.-Typ', t: 'num', w: 130}, {k: 'name', l: 'Zusatz Buchungstyp', w: 200}, {k: 'konto', l: 'Konto', t: 'num', w: 110}, {k: 'gk', l: 'Gegen-Konto', t: 'num', w: 120}, {k: 'text', l: 'Buchhaltungs-Text', w: 170}, {k: 'bu', l: 'BU-Schlüssel', w: 130}, {k: 'steuer', l: 'Steuerschlüssel', w: 140}, {k: 'traeger', l: 'Kostenträger', t: 'num', w: 120}, {k: 'stelle', l: 'Kostenstelle', t: 'num', w: 120}, {k: 'uebertrag', l: 'Übertragung', t: 'check', w: 120}, {k: 'mKonto', l: 'MwSt-Konto', t: 'num', w: 120}, {k: 'mGk', l: 'MwSt-Gegen-Konto', t: 'num', w: 150}],
    template: () => stRows('zusatzbuchung').map((r, i) => ({id: r.id, nr: i + 1, name: r.name, konto: +r.konto || 0, gk: 0, text: '', bu: '', steuer: '', traeger: 0, stelle: 0, uebertrag: false, mKonto: 0, mGk: 0})),
    fields: () => [{k: 'name', l: 'Zusatz Buchungstyp', ro: true}, {k: 'konto', l: 'Konto', t: 'num'}, {k: 'gk', l: 'Gegen-Konto', t: 'num'}, {k: 'text', l: 'Buchhaltungs-Text'}, {k: 'bu', l: 'BU-Schlüssel'}, {k: 'steuer', l: 'Steuerschlüssel'}, {k: 'traeger', l: 'Kostenträger', t: 'num'}, {k: 'stelle', l: 'Kostenstelle', t: 'num'}, {k: 'uebertrag', l: 'Übertragung', t: 'check'}, {k: 'mKonto', l: 'MwSt-Konto', t: 'num'}, {k: 'mGk', l: 'MwSt-Gegen-Konto', t: 'num'}]},
  summen: {cols: () => [{k: 'name', l: 'Summe Kassen', w: 220}, {k: 'konto', l: 'Konto', t: 'num', w: 110}, {k: 'gk', l: 'Gegen-Konto', t: 'num', w: 120}, {k: 'text', l: 'Buchhaltungs-Text', w: 170}, {k: 'bu', l: 'BU-Schlüssel', w: 130}, {k: 'steuer', l: 'Steuerschlüssel', w: 140}, {k: 'traeger', l: 'Kostenträger', t: 'num', w: 120}, {k: 'stelle', l: 'Kostenstelle', t: 'num', w: 120}, {k: 'uebertrag', l: 'Übertragung', t: 'check', w: 120}, {k: 'umrechnen', l: 'Umrechnen in', t: 'check', w: 130}],
    template: () => FX_SUMMEN.map(n => ({id: fxId(), name: n, konto: 0, gk: 0, text: '', bu: '', steuer: '', traeger: 0, stelle: 0, uebertrag: false, umrechnen: false})),
    fields: () => [{k: 'name', l: 'Summe Kassen', ro: true}, {k: 'konto', l: 'Konto', t: 'num'}, {k: 'gk', l: 'Gegen-Konto', t: 'num'}, {k: 'text', l: 'Buchhaltungs-Text'}, {k: 'bu', l: 'BU-Schlüssel'}, {k: 'steuer', l: 'Steuerschlüssel'}, {k: 'traeger', l: 'Kostenträger', t: 'num'}, {k: 'stelle', l: 'Kostenstelle', t: 'num'}, {k: 'uebertrag', l: 'Übertragung', t: 'check'}, {k: 'umrechnen', l: 'Umrechnen in', t: 'check'}]},
  wgrmwst: {cols: () => [{k: 'wgnr', l: 'Wgr.-Nr.', w: 100}, {k: 'wgname', l: 'Wgr. Name', w: 180}, {k: 'nr', l: 'MwSt.-Typ-Nr.', t: 'num', w: 120}, {k: 'name', l: 'MwSt.-Typ-Name', w: 150}, {k: 'set', l: 'MwSt.-Set', w: 110}, {k: 'pct', l: 'MwSt.-Prozent', t: 'num', w: 120, fmt: v => num(v) + ' %'}, ...fxAccCols()],
    template: () => [], neu: true, newRow: o => { const m = stRows('mwsttyp').find(x => x.id === o.mwst); return {...fxAcc0(), ...o, nr: Math.max(0, ...stRows('mwsttyp').map((x, i) => i)) + 1, name: m?.name || '', set: 'Standard', pct: +m?.satz || 0}; },
    fields: () => [{k: 'wgnr', l: 'Wgr.-Nr.', req: true}, {k: 'wgname', l: 'Wgr. Name'}, {k: 'mwst', l: 'MwSt.-Typ', t: 'select', o: () => stOpts('mwsttyp')}, ...fxAccFields()]},
  beleg: {cols: () => [{k: 'name', l: 'Belegtyp', w: 190}, {k: 'format', l: 'Druckformat', w: 120}, {k: 'drucker', l: 'Drucker-Name', w: 200}, {k: 'report', l: 'Report-Name', w: 180}, {k: 'anz', l: 'Beleg-Anzahl', t: 'num', w: 120}, {k: 'links', l: 'Links', t: 'num', w: 90}, {k: 'rechts', l: 'Rechts', t: 'num', w: 90}, {k: 'oben', l: 'Oben', t: 'num', w: 90}, {k: 'unten', l: 'Unten', t: 'num', w: 90}],
    template: () => FX_BELEGE.map(n => ({id: fxId(), name: n, format: 'Paperroll', drucker: 'EPSON TM-T88VII', report: 'PrintSalesReceipt2', anz: 1, links: 40, rechts: 0, oben: 0, unten: 0})), neu: true, del: true,
    newRow: o => ({...o}), fields: () => [{k: 'name', l: 'Belegtyp', t: 'select', o: () => FX_BELEGE.map(x => [x, x]), req: true}, {k: 'format', l: 'Druckformat', t: 'select', o: () => [['Paperroll', 'Paperroll'], ['DinA4', 'DinA4'], ['DinA5', 'DinA5']], req: true}, {k: 'drucker', l: 'Drucker-Name', req: true}, {k: 'report', l: 'Report-Name'}, {k: 'anz', l: 'Beleg Anzahl', t: 'num'}, {k: 'links', l: 'Links', t: 'num'}, {k: 'rechts', l: 'Rechts', t: 'num'}, {k: 'oben', l: 'Oben', t: 'num'}, {k: 'unten', l: 'Unten', t: 'num'}]},
  layout: {cols: () => [{k: 'name', l: 'Kassen-Layout', w: 260}, {k: 'xml', l: 'Layout', w: 320}], template: () => FX_LAYOUTS.map(n => ({id: fxId(), name: n, xml: 'Kontor-Standard'})), fields: () => [{k: 'name', l: 'Kassen-Layout', ro: true}, {k: 'xml', l: 'Layout'}]},
  icons: {cols: () => [{k: 'name', l: 'Icon-Name', w: 260}, {k: 'sort', l: 'Sortierungsnr.', t: 'num', w: 140}], template: () => FX_ICONS.map((n, i) => ({id: fxId(), name: n, sort: i + 1})), order: true, fields: () => [{k: 'name', l: 'Icon-Name', ro: true}, {k: 'sort', l: 'Sortierungsnr.', t: 'num'}]},
  posinfo: {cols: () => [{k: 'name', l: 'Positionsinformation', w: 240}, {k: 'zeile', l: 'Zeilen-Nr.', t: 'num', w: 120}, {k: 'sort', l: 'Sortierungsnr.', t: 'num', w: 140}], template: () => [], neu: true, del: true, newRow: o => ({...o}),
    fields: () => [{k: 'name', l: 'Positionsinformation', t: 'select', o: () => FX_POSINFO.map(x => [x, x]), req: true}, {k: 'zeile', l: 'Zeilen-Nr.', t: 'num'}, {k: 'sort', l: 'Sortierungsnr.', t: 'num'}]}
};
/* Tabelle mit Aktualisieren / Neu / (Rauf / Runter) für Unterdatensätze */
function fxSubGrid(host, S, tab, dirty, defs = FX_SUB) {
  const D = defs[tab]; S.sub ||= {}; S.sub[tab] ||= D.template().map(r => ({...r}));
  const rows = () => S.sub[tab], key = 'fx-' + tab;
  const extra = [{k: 'rf', l: 'Aktualisieren', icon: 'sync'}];
  if (D.neu) extra.push({k: 'neu', l: 'Neu', icon: 'plus'});
  if (D.order) extra.push({k: 'up', l: 'Rauf', icon: 'chevron-up'}, {k: 'dn', l: 'Runter', icon: 'chevron-down'});
  const remount = () => fxSubGrid(host, S, tab, dirty, defs);
  const edit = async id => {
    const r = rows().find(x => x.id === id); if (!r) return;
    const o = await fxRowForm(D.fields()[0].ro ? 'Bearbeiten' : 'Bearbeiten', D.fields(), r, !!D.del); if (!o) return;
    if (o._del) S.sub[tab] = rows().filter(x => x.id !== id); else Object.assign(r, o);
    dirty(); remount();
  };
  const move = d => { const sel = [...AG[key].sel][0]; if (!sel) return; const a = [...rows()].sort((x, y) => x.sort - y.sort), i = a.findIndex(x => x.id === sel), j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; a.forEach((x, n) => { x.sort = n + 1; }); dirty(); remount(); AG[key].sel = new Set([sel]); };
  AG[key] = agNew({embed: true, title: tab, cols: D.cols(), rows, sort: D.order ? {k: 'sort', dir: 1} : undefined, edit, extra,
    remove: D.del ? async ids => { if (!await confirmBox(`${num(ids.length)} Eintrag löschen?`, 'Löschen')) throw new Error('abgebrochen'); const s = new Set(ids); S.sub[tab] = rows().filter(r => !s.has(r.id)); dirty(); } : undefined,
    actions: {rf: remount, up: () => move(-1), dn: () => move(1), neu: async () => { const o = await fxRowForm('Neu', D.fields().filter(f => !f.ro), {}); if (!o) return; S.sub[tab].push({id: fxId(), ...(D.newRow ? D.newRow(o) : o)}); dirty(); remount(); }}});
  agMount(key, host);
}
/* Paarweise Zuordnung (Zugeordnet / Nicht zugeordnet) */
function fxPair(host, S, key, src, cols, dirty, rerender) {
  const mv = (ids, add) => { const s = new Set(S[key] || []); ids.forEach(i => add ? s.add(i) : s.delete(i)); S[key] = [...s]; dirty(); rerender(); };
  host.innerHTML = `<div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnet</h4><div data-fxp="a"></div></div><div class="ae-card"><h4>Nicht zugeordnet</h4><div data-fxp="b"></div></div></div>`;
  const mk = (id, h, on) => { AG[`fxp-${key}-${id}`] = agNew({embed: true, title: id, cols, rows: () => src().filter(r => (S[key] || []).includes(r.id) === on), edit: i => mv([i], !on), extra: [{k: 'mv', l: on ? 'Entfernen' : 'Zuordnen', icon: on ? 'x' : 'plus'}], actions: {mv: () => { const s = [...AG[`fxp-${key}-${id}`].sel]; if (s.length) mv(s, !on); }}}); agMount(`fxp-${key}-${id}`, h); };
  mk('a', $('[data-fxp="a"]', host), true); mk('b', $('[data-fxp="b"]', host), false);
}

/* ── Kassen: Reiter mit Tabellen und Fiskalisierung ── */
const kxHost = '<div data-kx style="flex:1;min-height:420px;display:flex;flex-direction:column"></div>';
const kxGrid = tab => () => ({html: kxHost, mount: (el, dirty) => fxSubGrid($('[data-kx]', el), KAE.draft, tab, dirty)});
const KAE_RENDER = {
  sig: kxGrid('sig'), mwst: kxGrid('mwst'), zahl: kxGrid('zahl'), zusatz: kxGrid('zusatz'), summen: kxGrid('summen'), wgrmwst: kxGrid('wgrmwst'), beleg: kxGrid('beleg'), layout: kxGrid('layout'), icons: kxGrid('icons'), posinfo: kxGrid('posinfo'),
  fisk: () => {
    const r = S.rksv || {}, d = x => x ? String(x).replace('T', ', ').slice(0, 17) : '';
    const A = {a: 'Kontor RKSV', b: 'Österreich-RKSV', c: !!r.active, d: d(r.started_at), e: d(r.started_at), f: false, g: String(r.turnover ?? 0)};
    const B = {a: 'Kontor GmbH', b: 'Kontor.Kasse', c: r.kassen_id || CFG['kasse.id'] || '', d: r.mode === 'test' ? 'Testbetrieb' : r.active ? 'Produktivbetrieb' : 'nicht in Betrieb', e: false};
    return {html: `<div class="ea-cols"><div class="ae-card ea-card" style="max-width:620px"><h4>Fiskalisierung</h4><div class="ea-fields">${[['a', 'Fiskalisierung'], ['b', 'Fiskalisierungstyp']].map(([k, l]) => fxField(A, [k, l, 'ro'])).join('')}${fxField(A, ['c', 'Registrierkasse-Fiskalisierung aktiv', 'dis'])}${fxField(A, ['d', 'Registrierungsdatum', 'ro'])}${fxField(A, ['e', 'Registrierung des Signaturgeräts', 'ro'])}${fxField(A, ['f', 'Signaturgerät beschädigt', 'dis'])}${fxField(A, ['g', 'Umsatz-Zähler', 'ro'])}</div></div>
      <div class="ae-card ea-card" style="max-width:620px"><h4>Fiskalisierung-Kassen Daten</h4><div class="ea-fields">${fxField(B, ['a', 'Hersteller Kasse', 'ro'])}${fxField(B, ['b', 'Modell Kasse', 'ro'])}${fxField(B, ['c', 'Seriennummer Kasse', 'ro'])}${fxField(B, ['d', 'Betriebsart', 'ro'])}${fxField(B, ['e', 'Netto und Mwst. exportieren', 'dis'])}</div></div></div>`};
  }
};
