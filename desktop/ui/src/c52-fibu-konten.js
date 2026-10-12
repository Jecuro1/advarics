/* ═════════════════════════════════════════════════════════════════
   52 · KASSEN › FIBU-KONTEN – wirken auf Buchungsjournal und DATEV-Export (Berichte › Buchhaltung)
   ═════════════════════════════════════════════════════════════════ */
const FK_DEF = {
  mwst: {titel: 'Erlöskonten je MwSt.-Satz', kopf: 'MwSt.-Satz', rows: () => [['fibu.erloes20', 'Normalsatz 20 %', '4000'], ['fibu.erloes13', 'Ermäßigt 13 %', '4030'], ['fibu.erloes10', 'Ermäßigt 10 %', '4010'], ['fibu.erloes0', 'Steuerfrei 0 %', '4090']]},
  zahl: {titel: 'Konten je Zahlungsart', kopf: 'Zahlungsart', rows: () => [['fibu.kasse', 'Bar (Kasse)', '2700'], ...[['bankomat', 'Bankomat'], ['kredit', 'Kreditkarte'], ['apple', 'Apple Pay'], ['google', 'Google Pay'], ['paypal', 'PayPal'], ['klarna', 'Klarna']].map(([id, n]) => ['fibu.zahlart.' + id, n, CFG['fibu.transit'] || '2880']), ['fibu.gutschein', 'Gutschein (Verbindlichkeit)', '3630']]},
  summen: {titel: 'Sammelkonten', kopf: 'Sammelkonto', rows: () => [['fibu.transit', 'Geldtransit / Kartenzahlungen (Standard für alle unbaren Zahlarten)', '2880'], ['fibu.bank', 'Bank (Entnahmen zur Bank)', '2800']]}
};
function fkRender(tab) {
  const D = FK_DEF[tab];
  const rows = () => D.rows().map(([k, name, d]) => ({id: k, name, konto: String(CFG[k] || '') || d, standard: !CFG[k]}));
  return {html: `<p class="ea-hint" style="margin:0 0 8px">${esc(D.titel)} für Buchungsjournal und DATEV-Export. Die Konten gelten für alle Kassen. Doppelklick auf eine Zeile zum Ändern; Vorgaben nach Einheitskontenrahmen mit der Steuerberatung abstimmen.</p><div data-kx style="flex:1;min-height:260px;display:flex;flex-direction:column"></div>`,
    mount: el => {
      const key = 'fk-' + tab;
      AG[key] = agNew({embed: true, title: D.titel, rows, sort: undefined,
        cols: [{k: 'name', l: D.kopf, w: 420}, {k: 'konto', l: 'Konto', w: 140}, {k: 'standard', l: 'Vorgabe', t: 'check', w: 110}],
        edit: async id => {
          const r = rows().find(x => x.id === id); if (!r) return;
          const o = await aeForm(r.name, [{k: 'konto', l: 'Konto', req: true}], {konto: r.konto}); if (!o) return;
          if (!/^\d{3,9}$/.test(o.konto)) return toast('Konto: 3 bis 9 Ziffern', {type: 'warn'});
          try { await needPerm('einstellungen', 'FiBu-Konten'); await saveSettings({[id]: o.konto}, true); toast('Konto gespeichert', {t2: `${r.name} · ${o.konto}`, type: 'pos', icon: 'check', dur: 1800}); AG[key].rows = rows(); kaeRender(); } catch (err) { if (err && String(err.message || err) !== 'abgebrochen') toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
        }});
      agMount(key, $('[data-kx]', el));
    }};
}
KAE_RENDER.mwst = () => fkRender('mwst'); KAE_RENDER.zahl = () => fkRender('zahl'); KAE_RENDER.summen = () => fkRender('summen');
