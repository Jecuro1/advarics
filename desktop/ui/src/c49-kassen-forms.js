/* ═════════════════════════════════════════════════════════════════
   49 · KASSEN-FORMULARE (MwSt.-FiBu-Konto, Fiskalisierung) UND „GRÖSSEN SORTIEREN“
   ═════════════════════════════════════════════════════════════════ */
/* MwSt.-FiBu-Konto: Karten wie bei Advarics */
function fxMwstDialog(row, neu, mitWg) {
  return new Promise(res => {
    const D = {...fxAcc0(), ...row}; if (neu) D.mwst = D.mwst || (stActive('mwsttyp')[0]?.id || '');
    const num0 = (k, l) => [k, l, 'num'];
    const typ = stRows('mwsttyp').find(x => x.id === D.mwst) || stRows('mwsttyp').find(x => x.name === D.name);
    const card = [
      ['Allgemein', [...(mitWg ? [['wgnr', 'Warengruppe (Nr.) *'], ['wgname', 'Warengruppen-Name']] : []), ...(neu ? [['mwst', 'MwSt.-Typ *', 'select', () => stOpts('mwsttyp')]] : [['name', 'MwSt.-Typ', 'ro']]), ['_', 'MwSt.-Set', 'ro', () => 'Standard'], ['_', 'MwSt.-Prozent', 'ro', () => `${num(+(typ?.satz ?? D.pct) || 0)} %`]]],
      ['Kasse', [num0('kWaren', 'Konto Waren Ums. Kasse'), num0('gkWaren', 'Gegen Konto Waren Ums. Kasse'), num0('kEinzweck', 'Konto Einzweck-Gutschein'), num0('kEinzweckGs', 'Konto Einzweck-Gutschrift')]],
      ['Wareneingang', [num0('kWE', 'Konto WE'), num0('kWEvor', 'Konto WE Vorsteuer'), num0('kWEeu', 'WE-Konto EU'), num0('kWEdritt', 'Konto WE Drittland')]],
      ['Retoure', [num0('kRet', 'Retouren-Konto'), num0('kRetEU', 'Retouren-Konto EU'), num0('kRetDritt', 'Retouren-Konto Drittland')]],
      ['Zusatz-Info', [num0('kNeben', 'Konto Nebenkosten'), num0('gkNeben', 'Gegen-Konto Nebenkosten'), num0('kProz', 'Konto Prozesskosten'), num0('gkProz', 'Gegen-Konto Prozesskosten'), num0('kFracht', 'Konto Frachtkosten'), num0('gkFracht', 'Gegen-Konto Frachtkosten')]],
      ['Zusatz-Info-EU', [num0('gkEU', 'Gegen Konto (Re.-) Ums. EU'), num0('kNebenEU', 'Konto Nebenkosten EU'), num0('gkNebenEU', 'Gegen-Konto Nebenkosten EU'), num0('kProzEU', 'Konto Prozesskosten EU'), num0('gkProzEU', 'Gegen-Konto Prozesskosten EU'), num0('kFrachtEU', 'Konto Frachtkosten EU'), num0('gkFrachtEU', 'Gegen-Konto Frachtkosten EU')]],
      ['Zusatz-Info-Drittland', [num0('gkDritt', 'Gegen Konto (Re.-) Ums. Drittland'), num0('kNebenDr', 'Konto Nebenkosten Drittland'), num0('gkNebenDr', 'Gegen-Konto Nebenkosten Drittland'), num0('kProzDr', 'Konto Prozesskosten Drittland'), num0('gkProzDr', 'Gegen-Konto Prozesskosten Drittland'), num0('kFrachtDr', 'Konto Frachtkosten Drittland'), num0('gkFrachtDr', 'Gegen-Konto Frachtkosten Drittland')]],
      ['Info', [num0('kTraeger', 'Kostenträger'), num0('kStelle', 'Kostenstelle'), ['bu', 'BU-Schlüssel Lief. Rechnung'], ['steuer', 'Steuerschlüssel G-Satz Lief. Rechnung'], ['uebertrag', 'Übertragung', 'check']]]
    ];
    const el = openLayer(`<div class="modal" style="width:min(1500px,96vw);max-height:92vh;overflow:auto" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('percent')}</div><div><h2>MwSt.-FiBu-Konto${neu ? '' : ` [ ${esc(D.name || '')} ]`}</h2></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body">${fxCards(D, card, 'flex:1 1 260px;max-width:340px')}</div>
      <div class="m-foot">${neu ? '' : (mitWg ? `<button class="btn btn-ghost" data-mx="del" style="color:var(--neg)">${ic('trash', 'i-sm')}Löschen</button>` : '')}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-mx="ok">${ic('check', 'i-sm')}Sichern</button></div></div>`, {onClose: () => res(null)});
    fxBind(el, D, () => {});
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-mx]'); if (!b) return;
      if (b.dataset.mx === 'del') { res({_del: true}); closeLayer(el); return; }
      if (mitWg && !String(D.wgnr || '').trim()) return toast('Warengruppe angeben', {type: 'warn'});
      const out = {...D}; res(out); closeLayer(el);
    });
  });
}

/* Fiskalisierung: Zugangsdaten (FinanzOnline) und Bezeichnung */
async function fiskDialog() {
  const r = S.rksv || {};
  const D = {name: CFG['fisk.name'] || 'Kontor RKSV', typ: 'Österreich-RKSV', benutzer: CFG['fo.benutzer'] || '', teilnehmer: CFG['fo.teilnehmer'] || '', pin: CFG['fo.pin'] || ''};
  const spec = [['Allgemein', [['name', 'Name *'], ['typ', 'Fiskalisierungstyp *', 'select', () => [['Österreich-RKSV', 'Österreich-RKSV']]], ['_', 'Fiscal Provider', 'ro', () => 'N/A'], ['_', 'TSE ist Online', 'dis'], ['_', 'System-Typ', 'ro', () => 'Open'], ['_', 'UID', 'ro', () => CFG['firma.uid'] || ''], ['_', 'Kassen-ID', 'ro', () => r.kassen_id || CFG['kasse.id'] || ''], ['benutzer', 'Benutzer-Identifikation *'], ['teilnehmer', 'Teilnehmer-Identifikation *'], ['pin', 'PIN *']]]];
  return new Promise(res => {
    const el = openLayer(`<div class="modal" style="width:min(640px,96vw)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('shield')}</div><div><h2>Fiskalisierung [ ${esc(D.name)} ]</h2><p>FinanzOnline-Zugangsdaten für die Registrierung der Kasse</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body">${fxCards(D, spec, 'max-width:none;flex:1')}</div><div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-fk="ok">${ic('check', 'i-sm')}Sichern</button></div></div>`, {onClose: () => res(false)});
    fxBind(el, D, () => {});
    $('[data-fk="ok"]', el).onclick = async () => {
      if (!D.name.trim() || !D.benutzer.trim() || !D.teilnehmer.trim() || !String(D.pin).trim()) return toast('Pflichtfelder ausfüllen', {t2: 'Name, Benutzer-, Teilnehmer-Identifikation und PIN', type: 'warn'});
      try { await needPerm('einstellungen', 'Fiskalisierung'); await saveSettings({'fisk.name': D.name, 'fo.benutzer': D.benutzer, 'fo.teilnehmer': D.teilnehmer, 'fo.pin': D.pin}); res(true); closeLayer(el); } catch (err) { if (err) toast('Nicht gespeichert', {t2: String(err.message || err), type: 'warn'}); }
    };
  });
}
{ const f0 = KAE_RENDER.fisk;
  KAE_RENDER.fisk = () => { const r = f0(); r.html = r.html.replace('<h4>Fiskalisierung</h4>', `<h4 style="display:flex;justify-content:space-between;align-items:center">Fiskalisierung<button type="button" class="ea-ib" data-fisk-edit title="Zugangsdaten bearbeiten">${ic('edit', 'i-sm')}</button></h4>`).replace(/Kontor RKSV/, esc(CFG['fisk.name'] || 'Kontor RKSV'));
    r.mount = el => { $('[data-fisk-edit]', el)?.addEventListener('click', async () => { if (await fiskDialog()) kaeRender(); }); }; return r; }; }

/* ── Stammdaten › Größen › Größen sortieren ── */
const GF = {rows: null, sel: null, dirty: false};
const gfLoad = () => { GF.rows = stRows('groesse').map(r => ({id: r.id, name: r.name || '', nr: +r.nr || 0, g1: r.g1 || '', g2: r.g2 || ''})).sort((a, b) => a.nr - b.nr || a.name.localeCompare(b.name, 'de', {numeric: true})); GF.dirty = false; };
const gfNat = (a, b) => { const na = parseFloat(String(a.g1 || a.name).replace(',', '.')), nb = parseFloat(String(b.g1 || b.name).replace(',', '.')); if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb; return String(a.g1 || a.name).localeCompare(String(b.g1 || b.name), 'de', {numeric: true}) || String(a.g2).localeCompare(String(b.g2), 'de', {numeric: true}) || a.name.localeCompare(b.name, 'de', {numeric: true}); };
function gfRender() { const h = $('#view-st-groessenfolge'); if (h) { h.replaceChildren(); PAGES['st-groessenfolge'].render(); } }
async function gfMove(d) {
  const id = [...(AG['st-groessenfolge']?.sel || [])][0]; if (!id) return toast('Zeile auswählen', {type: 'warn'});
  const a = GF.rows, i = a.findIndex(x => x.id === id), j = i + d; if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]]; a.forEach((x, n) => { x.nr = n + 1; }); GF.dirty = true; AG['st-groessenfolge'].sel = new Set([id]); agApply('st-groessenfolge'); gfBar();
}
const gfBar = () => { const s = $('#view-st-groessenfolge [data-ag="save"]'), u = $('#view-st-groessenfolge [data-ag="undo"]'); if (s) s.disabled = !GF.dirty; if (u) u.disabled = !GF.dirty; };
agridPage('st-groessenfolge', {
  title: 'Größen sortieren', rows: () => { if (!GF.rows) gfLoad(); return GF.rows; }, count: () => stRows('groesse').length, sort: {k: 'nr', dir: 1},
  toolbar: [{k: 'save', l: 'Sichern', icon: 'check'}, {k: 'new', l: 'Neu', icon: 'plus'}, {k: 'undo', l: 'Änderungen zurücknehmen', icon: 'undo'}, {k: 'up', l: 'Rauf', icon: 'chevron-up'}, {k: 'dn', l: 'Runter', icon: 'chevron-down'}, {k: 'auto', l: 'Automatisch sortieren', icon: 'sync'}],
  cols: [{k: 'nr', l: 'Sortierungsnr.', t: 'num', w: 150}, {k: 'name', l: 'Größe', w: 220}, {k: 'g1', l: 'Größe 1', w: 160}, {k: 'g2', l: 'Größe 2', w: 160}],
  actions: {
    save: async () => { try { await needPerm('einstellungen', 'Größen sortieren'); const m = new Map(GF.rows.map(r => [r.id, r.nr])); await stammSave('groesse', stRows('groesse').map(r => ({...r, nr: m.get(r.id) ?? r.nr}))); GF.dirty = false; toast('Gespeichert', {t2: `${num(GF.rows.length)} Größen`, type: 'pos', icon: 'check', dur: 1800}); gfBar(); } catch (err) { if (err) toast('Nicht gespeichert', {t2: String(err.message || err), type: 'warn'}); } },
    new: () => go('st-groesse'),
    undo: () => { gfLoad(); agApply('st-groessenfolge'); gfBar(); },
    up: () => gfMove(-1), dn: () => gfMove(1),
    auto: async () => { if (!await confirmBox('Alle Größen automatisch sortieren und neu durchnummerieren?', 'Sortieren')) return; GF.rows.sort(gfNat); GF.rows.forEach((x, n) => { x.nr = n + 1; }); GF.dirty = true; agApply('st-groessenfolge'); gfBar(); }
  }
});
{ const p0 = PAGES['st-groessenfolge'].render; PAGES['st-groessenfolge'].render = async () => { gfLoad(); await p0(); gfBar(); }; }
VIEW_PERM['st-groessenfolge'] = 'einstellungen';
