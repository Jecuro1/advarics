/* ═════════════════════════════════════════════════════════════════
   47 · FORMULAR- UND TABELLEN-BAUSTEINE FÜR KASSEN / KASSEN-KONFIGURATION
   ═════════════════════════════════════════════════════════════════ */
/* Feld: [Schlüssel, Beschriftung, Typ, Optionen/Wert, Hinweis] – Typ: text | num | check | dis | ro | select | area */
function fxField(S, [k, l, t = 'text', o, hint]) {
  const v = S[k], h = hint ? `<small class="ea-hint">${esc(hint)}</small>` : '';
  if (t === 'check') return `<div class="ea-sw2"><label class="ea-sw"><button type="button" class="switch" role="switch" data-fx-sw="${k}" aria-checked="${!!v}"></button><span>${esc(l)}</span></label>${h}</div>`;
  if (t === 'dis') return `<label class="ea-sw dis"><button type="button" class="switch" disabled role="switch" aria-checked="${!!v}"></button><span>${esc(l)}</span></label>`;
  if (t === 'ro') return `<label class="field"><span>${esc(l)}</span><input class="input ea-ro" readonly value="${esc(typeof o === 'function' ? o() : v ?? '')}">${h}</label>`;
  if (t === 'pw') return `<label class="field"><span>${esc(l)}</span><input class="input" type="password" autocomplete="new-password" data-fx="${k}" value="" placeholder="${esc(o || '')}">${h}</label>`;
  if (t === 'area') return `<label class="field"><span>${esc(l)}</span><textarea class="input" rows="4" data-fx="${k}" style="height:auto">${esc(v ?? '')}</textarea>${h}</label>`;
  if (t === 'select') { const op = o(); return `<label class="field"><span>${esc(l)}</span><select class="input select" data-fx="${k}">${!op.some(x => String(x[0]) === String(v)) ? `<option value="${esc(v ?? '')}" selected>${esc(v ?? '')}</option>` : ''}${op.map(([x, y]) => `<option value="${esc(x)}" ${String(v) === String(x) ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select>${h}</label>`; }
  return `<label class="field"><span>${esc(l)}</span><input class="input ${t === 'num' ? 'num' : ''}" ${t === 'num' ? 'type="number"' : ''} data-fx="${k}" value="${esc(v ?? '')}">${h}</label>`;
}
const fxCards = (S, cards) => `<div class="ea-cols">${cards.map(([h, f]) => `<div class="ae-card ea-card">${h ? `<h4>${esc(h)}</h4>` : ''}<div class="ea-fields">${f.map(x => fxField(S, x)).join('')}</div></div>`).join('')}</div>`;
function fxBind(el, S, dirty) {
  el.addEventListener('input', e => { const i = e.target.closest('[data-fx]'); if (i && i.tagName !== 'SELECT') { S[i.dataset.fx] = i.type === 'number' ? (i.value === '' ? 0 : +i.value) : i.value; dirty(); } });
  el.addEventListener('change', e => { const i = e.target.closest('select[data-fx]'); if (i) { S[i.dataset.fx] = i.value; dirty(); } });
  el.addEventListener('click', e => { const b = e.target.closest('[data-fx-sw]'); if (b && !b.disabled) { const k = b.dataset.fxSw; S[k] = !S[k]; b.setAttribute('aria-checked', String(!!S[k])); dirty(); } });
}

/* Kleines Bearbeiten-Fenster für Tabellenzeilen */
const fxRowForm = (title, fields, row, del) => aeForm(title, fields, row, {del});

/* Tabellen mit Unterdatensätzen (in S.sub[tab] gespeichert) */
const FX_BELEGE = ['Geschenkbeleg', 'Rechnung', 'Auswahl', 'Gutschein-Verkauf', 'Tageseröffnung', 'Kunden-Bestellung', 'Verkaufsbeleg', 'Datenschutzrichtlinien', 'EFT-Händlerbeleg', 'Umlagerungs-Annahme', 'Bestandskorrektur', 'Reklamation', 'Tagesabschluss', 'Umlagerung', 'Nullbon', 'Standardbeleg'];
const FX_MEHR = [['gs', 'Gutschein verkaufen'], ['ret', 'Retoure / Umtausch'], ['rcpts', 'Belege'], ['copy', 'Belegkopie drucken'], ['drawer', 'Lade öffnen'], ['book', 'Kassenbuch'], ['x', 'X-Bericht (Zwischenstand)'], ['z', 'Tagesabschluss'], ['flow', 'Kassenablauf bearbeiten']];
const FX_ICONS = ['Kunden-Bearbeitung', 'Sperren', 'Journal', 'Parken', 'Löschen', 'Artikel-Info', 'Umtausch', 'Gutsch.-Verk.', 'Umlagerung', 'Bst.korrektur', 'Auswahl', 'Rechnung', 'Reklamation', 'Kd.-Bestellung', '<Ausfolgeschein>', 'ERent Kunden s.', 'Set', 'Loyalty', 'Coupon-Scan', 'Fremdrechng.', 'Nachdruck', 'Nachricht', 'Kass.wechsel', 'Steuerfrei', 'Zusatz-Info', 'RFID', 'Kd.-Filter', 'Hilfe-Menü'];
const FX_POSINFO = ['Artikelnr.', 'Farbe', 'EAN', 'Warengruppe', 'Marke', 'Seriennummer', 'Verkäufer'];
const fxId = () => 'r' + Math.random().toString(36).slice(2, 8);
const FX_SUB = {
  sig: {cols: () => [{k: 'zdald', l: 'Zdald', w: 90}, {k: 'zert', l: 'Steuerliches Signatur-Zertifikat', w: 260}, {k: 'kette', l: 'Steuerliche Bescheinigungskette', w: 260}, {k: 'datum', l: 'Unterzeichnungsdatum der Registrierung', w: 250}, {k: 'ausfall', l: 'Signaturgerät-Ausfalldatum', w: 200}, {k: 'bis', l: 'Gültig bis', w: 160}, {k: 'serie', l: 'Seriennummer des Schlüssels', w: 220}, {k: 'key', l: 'Öffentlicher Schlüssel', w: 360}],
    template: () => S.rksv?.active ? [{id: 'AT1', zdald: 'AT1', zert: S.rksv.serial || '', kette: '', datum: S.rksv.started_at || '', ausfall: '', bis: '', serie: S.rksv.serial || '', key: S.rksv.public_key || ''}] : [], neu: true, fields: () => [{k: 'zdald', l: 'Zdald'}, {k: 'zert', l: 'Steuerliches Signatur-Zertifikat', w: 'full'}, {k: 'kette', l: 'Steuerliche Bescheinigungskette', w: 'full'}, {k: 'datum', l: 'Unterzeichnungsdatum der Registrierung'}, {k: 'ausfall', l: 'Signaturgerät-Ausfalldatum'}, {k: 'bis', l: 'Gültig bis'}, {k: 'serie', l: 'Seriennummer des Schlüssels'}, {k: 'key', l: 'Öffentlicher Schlüssel', w: 'full'}]},
  beleg: {cols: () => [{k: 'name', l: 'Belegtyp', w: 220}, {k: 'anz', l: 'Anzahl Ausdrucke', t: 'num', w: 160}],
    template: () => [{id: fxId(), name: 'Verkaufsbeleg', anz: 1}, {id: fxId(), name: 'Standardbeleg', anz: 1}], neu: true, del: true,
    newRow: o => ({...o}), validate: (o, rows, id) => rows.some(r => r.id !== id && r.name === o.name) ? 'Der Belegtyp ist für diese Kasse schon angelegt.' : (+o.anz >= 1 && +o.anz <= 5 ? '' : 'Anzahl Ausdrucke: 1 bis 5'),
    fields: () => [{k: 'name', l: 'Belegtyp', t: 'select', o: () => [['Verkaufsbeleg', 'Verkaufsbeleg (Kassenbon)'], ['Standardbeleg', 'Standardbeleg (Retoure, Storno)']], req: true}, {k: 'anz', l: 'Anzahl Ausdrucke (1–5)', t: 'num', req: true}]},
  icons: {cols: () => [{k: 'name', l: 'Eintrag im Menü „Mehr“', w: 280}, {k: 'sort', l: 'Sortierungsnr.', t: 'num', w: 140}], template: () => FX_MEHR.map(([id, n], i) => ({id, name: n, sort: i + 1})), order: true, fields: () => [{k: 'name', l: 'Eintrag im Menü „Mehr“', ro: true}, {k: 'sort', l: 'Sortierungsnr.', t: 'num'}]},
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
    const o = D.form ? await D.form(r, false) : await fxRowForm('Bearbeiten', D.fields(), r, !!D.del); if (!o) return;
    if (!o._del && D.validate) { const m = D.validate(o, rows(), id); if (m) return toast(m, {type: 'warn'}); }
    if (o._del) S.sub[tab] = rows().filter(x => x.id !== id); else Object.assign(r, o);
    dirty(); remount();
  };
  const move = d => { const sel = [...AG[key].sel][0]; if (!sel) return; const a = [...rows()].sort((x, y) => x.sort - y.sort), i = a.findIndex(x => x.id === sel), j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; a.forEach((x, n) => { x.sort = n + 1; }); dirty(); remount(); AG[key].sel = new Set([sel]); };
  AG[key] = agNew({embed: true, title: tab, cols: D.cols(), rows, sort: D.order ? {k: 'sort', dir: 1} : undefined, edit, extra,
    remove: D.del ? async ids => { if (!await confirmBox(`${num(ids.length)} Eintrag löschen?`, 'Löschen')) throw new Error('abgebrochen'); const s = new Set(ids); S.sub[tab] = rows().filter(r => !s.has(r.id)); dirty(); } : undefined,
    actions: {rf: remount, up: () => move(-1), dn: () => move(1), neu: async () => { const o = D.form ? await D.form({}, true) : await fxRowForm('Neu', D.fields().filter(f => !f.ro), {}); if (!o) return; if (D.validate) { const m = D.validate(o, rows(), null); if (m) return toast(m, {type: 'warn'}); } S.sub[tab].push({id: fxId(), ...(D.newRow ? D.newRow(o) : o)}); dirty(); remount(); }}});
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
