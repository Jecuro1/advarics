/* ═════════════════════════════════════════════════════════════════
   55f · WARENGRUPPEN (Stammdaten › Warengruppen › Warengruppen) – Liste und Maske mit fünf Karten
   Eine Zeile je Warengruppe (Stammdaten-Art „warengruppe“, Schlüssel „adv-<Nr.>“; die Artikel verweisen über die Kategorie darauf).
   Karten: Haupt-Abteilung (Nr., Name, Hierarchie, Altersbewertung, Prämienschlüssel, Service, Inventur, Intrastat), WebShop-Kategorien,
   Größeneinstellungen, Finanzeinstellungen (Rabattsperre, MwSt.-Typ, Preislagen-Schlüssel, Spanne), Etiketten.
   Jede Auswahl ist ein Menü mit Stift (bearbeiten), Plus (neu) und Lupe (suchen) auf die jeweilige Stammdaten-Tabelle.
   • Hierarchie: gespeichert wird nur die Abteilung; Haupt-Abteilung, Bereich und Haupt-Bereich ergeben sich aus der Kette (und schränken die Auswahl ein)
   • Nr. ist der Schlüssel (nach dem Anlegen gesperrt); die Prüfungen stehen hier und in warengruppe.rs gleich (das Backend entscheidet)
   • Wirkungen der Felder: siehe die Hilfen ganz unten (wgInfo & Co.) und die Release-Notes
   ═════════════════════════════════════════════════════════════════ */
const WG = {zaehler: {}, naechste: 1, rolle: 'einzel', geladen: false};
const WGE = {id: null, ids: [], d: null, orig: null, tab: 'allg', dirty: false, show: false};
const wgLocked = () => WG.rolle === 'filiale';

/* ── Nachschlagen ── */
const WGI = {src: null, n: -1, map: new Map()};
/** Warengruppen nach Kennung (Index wird nur bei Änderung der Tabelle neu gebaut) */
function wgIdx() {
  const rows = STAMM.data.warengruppe || [];
  if (WGI.src !== rows || WGI.n !== rows.length) { WGI.src = rows; WGI.n = rows.length; WGI.map = new Map(rows.map(r => [r.id, r])); }
  return WGI.map;
}
const wgRaw = id => wgIdx().get(id);
const WGH = {a: null, h: null, b: null, x: null, ab: new Map(), ha: new Map(), be: new Map(), hb: new Map()};
/** Hierarchie-Ebenen nach Kennung: ab = Abteilung (Ebene 3), ha = Haupt-Abteilung (Ebene 2), be = Bereich (Ebene 1), hb = Haupt-Bereich (Ebene 0) */
function wgH() {
  const A = STAMM.data.abteilung || [], Hh = STAMM.data.hauptabteilung || [], B = STAMM.data.bereich || [], X = STAMM.data.hauptbereich || [];
  if (WGH.a !== A || WGH.h !== Hh || WGH.b !== B || WGH.x !== X || WGH.na !== A.length || WGH.nh !== Hh.length || WGH.nb !== B.length || WGH.nx !== X.length) {
    Object.assign(WGH, {a: A, h: Hh, b: B, x: X, na: A.length, nh: Hh.length, nb: B.length, nx: X.length, ab: new Map(A.map(r => [r.id, r])), ha: new Map(Hh.map(r => [r.id, r])), be: new Map(B.map(r => [r.id, r])), hb: new Map(X.map(r => [r.id, r]))});
  }
  return WGH;
}
/** Kennung zu einem Wert aus der Tabelle: die Kennung selbst, sonst der Klartext (früher stand der Name in der Warengruppe) */
function wgKey(kind, v) {
  v = String(v ?? '').trim(); if (!v) return '';
  const rows = stRows(kind);
  return (rows.find(r => String(r.id) === v) || rows.find(r => norm(r.name) === norm(v)))?.id ?? v;
}
const wgNm = (kind, id) => { const r = id ? stRows(kind).find(x => String(x.id) === String(id)) : null; return r ? r.name || r.id : id || ''; };
/** Weg einer Abteilung nach oben: Haupt-Abteilung, Bereich, Haupt-Bereich */
function wgKette(abtId) {
  const H = wgH(), a = H.ab.get(abtId), h = a && H.ha.get(a.parent), b = h && H.be.get(h.parent), x = b && H.hb.get(b.parent);
  return {a, h, b, x};
}
const wgAbtPfad = r => { const H = wgH(), h = H.ha.get(r.parent), b = h && H.be.get(h.parent); return [r.name || r.id, h?.name, b?.name].filter(Boolean).join(' · '); };
const wgHaPfad = r => { const b = wgH().be.get(r.parent); return [r.name || r.id, b?.name].filter(Boolean).join(' · '); };
const wgMwstTyp = ust => { const m = stActive('mwsttyp').find(x => +x.satz === +ust); return m?.id || ({20: 'N', 10: 'E', 13: 'E13', 0: 'F'})[+ust] || 'N'; };
const wgGsStd = () => { const k = CFG['allg.groessenschluessel'], rows = stActive('groessenschluessel'); return rows.some(r => r.id === k) ? k : rows[0]?.id || ''; };
const wgNaechsteNr = () => { let m = 0; for (const r of stRows('warengruppe')) { const n = +r.nr; if (n > m && n < 1e7) m = n; } return m + 1; };

/* ── Laden ── */
async function wgLoadZaehler() {
  if (DESKTOP) {
    try { const r = await invoke('warengruppe_zaehler'); WG.zaehler = r.artikel || {}; WG.naechste = r.naechste_nr || 1; WG.rolle = r.rolle || 'einzel'; } catch (e) { console.error(e); }
  } else {
    const z = {}; for (const a of ART) { const x = z[a.cat] ||= [0, 0]; x[0]++; if (a.active !== false) x[1]++; }
    WG.zaehler = z; WG.naechste = wgNaechsteNr(); WG.rolle = 'zentrale';
  }
  WG.geladen = true;
}
/** Tabelle der Warengruppen frisch holen (nur diese Art, nicht alle Stammdaten) */
async function wgReload() {
  if (DESKTOP) { try { STAMM.data.warengruppe = await invoke('stamm_list', {kind: 'warengruppe'}); } catch (e) { console.error(e); } }
  else STAMM.data.warengruppe = persist.get('stamm', {}).warengruppe || STAMM.data.warengruppe || [];
  applyStamm(); await wgLoadZaehler();
}
const wgArtikel = id => WG.zaehler[id] || [0, 0];

/* ── Liste ── */
function wgRows() {
  const idx = k => new Map(stRows(k).map(r => [r.id, r])), H = wgH();
  const mw = idx('mwsttyp'), et = idx('etikettentyp'), al = idx('altersschluessel'), pr = idx('praemienschluessel'), gs = idx('groessenschluessel'), sg = idx('statgroessenset'), pl = idx('preislagenschluessel'), hi = idx('wghierarchie'), wk = idx('webkategorie');
  const nm = (m, v) => v ? (m.get(v) || m.get(wgKey2(m, v)))?.name ?? v : '';
  const wgKey2 = (m, v) => { for (const r of m.values()) if (norm(r.name) === norm(v)) return r.id; return v; };
  const lvl = r => r ? [r.nr ?? '0', r.name || 'NA'] : ['0', 'NA'];
  return stRows('warengruppe').map(r => {
    const {a, h, b, x} = wgKette(r.abteilung), [e1n, e1] = lvl(b), [e2n, e2] = lvl(h), [e3n, e3] = lvl(a);
    const mt = r.mwsttyp ? mw.get(r.mwsttyp) : null, art = wgArtikel(r.id);
    return {id: r.id, nr: r.nr ?? String(r.id).replace(/^adv-/, ''), name: r.name || r.id, e1n, e1, e2n, e2, e3n, e3, e0: x?.name || '',
      mwst: mt ? mt.name : nm(mw, r.mwsttyp) || (r.mwst || (+r.ust === 10 ? 'Reduziert' : +r.ust === 0 ? 'Ohne MwSt.' : 'Standard')), satz: mt ? +mt.satz : +(r.ust ?? 20),
      etikett: nm(et, r.etikett), etikett2: nm(et, r.etikett2), anz: r.anz_etiketten ?? 1, hier: nm(hi, r.hierarchie),
      inventur: r.inventur !== false, alter: nm(al, r.altersbewertung), praemie: nm(pr, r.praemienschluessel), gschl: nm(gs, r.groessenschluessel), sgs: nm(sg, r.statgroessen), plschl: nm(pl, r.preislage),
      spanne: r.spanne == null || r.spanne === '' ? 0 : Math.round(+r.spanne * 10000) / 100, service: !!r.service, rabattsperre: !!r.rabattsperre,
      web: [1, 2, 3, 4, 5].map(i => r['webkat' + i]).filter(Boolean).map(v => nm(wk, v)).join(', '), inr: r.intrastat_nr || r.zolltarif || '', ibez: r.intrastat_bez || '', gewicht: +r.gewicht || 0, artikel: art[0], aktiv: art[1], _raw: r};
  });
}
agridPage('st-warengruppe', {
  title: 'Warengruppen', rows: wgRows, count: () => stRows('warengruppe').length,
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}, {k: 'fedas', l: 'Fedas Synchronisierung', icon: 'sync'}],
  cols: [
    {k: 'nr', l: 'Nr.', t: 'num', w: 80}, {k: 'name', l: 'Name', w: 240},
    {k: 'e1n', l: 'Hierarchie Ebene1-Nr.', t: 'num', w: 130}, {k: 'e1', l: 'Hierarchie Ebene1-Name', w: 150},
    {k: 'e2n', l: 'Hierarchie Ebene2-Nr.', t: 'num', w: 130}, {k: 'e2', l: 'Hierarchie Ebene2-Name', w: 170},
    {k: 'e3n', l: 'Hierarchie Ebene3-Nr.', t: 'num', w: 130}, {k: 'e3', l: 'Hierarchie Ebene3-Name', w: 170},
    {k: 'mwst', l: 'MwSt.-Typ', w: 100}, {k: 'etikett', l: 'Etiketten-Typ', w: 120}, {k: 'inventur', l: 'Inventur', t: 'check', w: 80},
    {k: 'alter', l: 'Altersbewertung', w: 120}, {k: 'spanne', l: 'Vorschl.-Spanne/Kalk.', t: 'num', w: 140, fmt: v => num(+v || 0, 2) + ' %'},
    {k: 'e0', l: 'Haupt-Bereich', w: 130, show: false}, {k: 'praemie', l: 'Prämienschlüssel', w: 140, show: false}, {k: 'gschl', l: 'Größen-Schlüssel', w: 150, show: false}, {k: 'sgs', l: 'Statistik-Größen-Set', w: 150, show: false},
    {k: 'plschl', l: 'Preisl.-Schl.', w: 120, show: false}, {k: 'etikett2', l: 'Etiketten-Typ2', w: 130, show: false}, {k: 'anz', l: 'Anz. Etiketten', t: 'num', w: 100, show: false}, {k: 'hier', l: 'Warengruppenhierarchie', w: 170, show: false},
    {k: 'service', l: 'Service-Warengruppe', t: 'check', w: 120, show: false}, {k: 'rabattsperre', l: 'Rabattsperre', t: 'check', w: 100, show: false}, {k: 'web', l: 'WebShop-Kategorien', w: 200, show: false},
    {k: 'inr', l: 'Intrastat-Waren-Nr.', w: 140, show: false}, {k: 'ibez', l: 'Intrastat-Waren-Bez.', w: 170, show: false}, {k: 'gewicht', l: 'Durchschnitts Gewicht (kg)', t: 'num', w: 150, show: false, fmt: v => v ? num(+v, 3) : ''},
    {k: 'artikel', l: 'Artikel', t: 'num', w: 80, show: false}, {k: 'aktiv', l: 'davon aktiv', t: 'num', w: 90, show: false},
  ],
  actions: {
    back: () => e2Back(),
    refresh: async () => { await loadStamm(true); await wgLoadZaehler(); PAGES['st-warengruppe'].render(); },
    new: () => wgNeu(),
    fedas: () => go('fedas-sync'),
  },
  edit: id => wgOpen(id, (AG['st-warengruppe'].filtered || []).map(r => r.id)),
  remove: ids => wgRemove(ids),
});
{ const p = PAGES['st-warengruppe'], _r = p.render; p.render = async () => { await Promise.all([loadStamm(), wgLoadZaehler()]); await _r(); renderTopbar(); }; }
VIEW_PERM['st-warengruppe'] = 'einstellungen';
function wgNeu() {
  if (wgLocked()) return toast('Warengruppen pflegt die Zentrale', {t2: 'Diese Kasse bekommt die Angaben beim Abgleich', icon: 'lock'});
  wgOpen(null, WGE.ids);
}

/* ── Entwurf ── */
function wgBlank() {
  return {id: '', _aktiv: true, nr: String(Math.max(WG.naechste, wgNaechsteNr())), name: '', hb: '', be: '', ha: '', abteilung: '', altersbewertung: wgKey('altersschluessel', 'Statistik') || 'STATISTIK', praemienschluessel: 'STANDARD', service: false, inventur: true,
    intrastat_nr: '', intrastat_bez: '', gewicht: '', webkat1: '', webkat2: '', webkat3: '', webkat4: '', webkat5: '', groessenschluessel: wgGsStd(), statgroessen: '',
    rabattsperre: false, mwsttyp: wgMwstTyp(+CFG['allg.mwst'] ? CFG['allg.mwst'] : 20), preislage: 'STANDARD', spanne: '50', etikett: wgKey('etikettentyp', 'Klebe 50x30') || 'K50X30', etikett2: '', anz_etiketten: '1', hierarchie: ''};
}
function wgDraft(id) {
  const r = id ? wgRaw(id) : null; if (!r) return wgBlank();
  const k = wgKette(r.abteilung), pr = stRows('praemienschluessel').find(x => x.warengruppe === r.id);
  const txt = v => v == null || v === '' ? '' : String(v).replace('.', ',');
  const d = {id: r.id, _aktiv: r._aktiv !== false, nr: String(r.nr ?? String(r.id).replace(/^adv-/, '')), name: String(r.name ?? ''), hb: k.x?.id || '', be: k.b?.id || '', ha: k.h?.id || '', abteilung: k.a ? k.a.id : '',
    altersbewertung: wgKey('altersschluessel', r.altersbewertung) || 'STANDARD', praemienschluessel: r.praemienschluessel || pr?.id || 'STANDARD', service: !!r.service, inventur: r.inventur !== false,
    intrastat_nr: String(r.intrastat_nr || r.zolltarif || ''), intrastat_bez: String(r.intrastat_bez || ''), gewicht: txt(r.gewicht),
    groessenschluessel: r.groessenschluessel || wgGsStd(), statgroessen: r.statgroessen || '', rabattsperre: !!r.rabattsperre,
    mwsttyp: r.mwsttyp || wgMwstTyp(r.ust ?? 20), preislage: r.preislage || 'STANDARD', spanne: txt(r.spanne == null || r.spanne === '' ? 0 : Math.round(+r.spanne * 10000) / 100),
    etikett: wgKey('etikettentyp', r.etikett) || 'K50X30', etikett2: r.etikett2 || '', anz_etiketten: String(r.anz_etiketten ?? 1), hierarchie: r.hierarchie || ''};
  for (let i = 1; i <= 5; i++) d['webkat' + i] = r['webkat' + i] || '';
  if (r.abteilung && !k.a) d.abteilung = r.abteilung;   // verweist auf eine Abteilung, die es nicht mehr gibt: sichtbar lassen (Fehler „nicht mehr“)
  return d;
}
const wgTxtNum = t => { t = String(t ?? '').trim(); if (t === '') return 0; const n = parseAmt(t); return isNaN(n) ? t : n; };
/** Zeile für das Backend (Prozent → Bruchteil) */
function wgToRow(d) {
  const sp = wgTxtNum(d.spanne), gw = wgTxtNum(d.gewicht);
  const r = {id: d.id || '', _aktiv: d._aktiv !== false, nr: String(d.nr).trim(), name: String(d.name).trim(), abteilung: d.abteilung || '', spanne: typeof sp === 'number' ? sp / 100 : sp, gewicht: gw, inventur: !!d.inventur, service: !!d.service, rabattsperre: !!d.rabattsperre,
    intrastat_nr: String(d.intrastat_nr).trim(), intrastat_bez: String(d.intrastat_bez).trim(), anz_etiketten: String(d.anz_etiketten).trim()};
  for (const k of ['altersbewertung', 'praemienschluessel', 'groessenschluessel', 'statgroessen', 'mwsttyp', 'preislage', 'etikett', 'etikett2', 'hierarchie', 'webkat1', 'webkat2', 'webkat3', 'webkat4', 'webkat5']) r[k] = d[k] || '';
  return r;
}
const WG_PFLICHT = [['altersbewertung', 'Altersbewertung', 'altersschluessel'], ['praemienschluessel', 'Prämienschlüssel', 'praemienschluessel'], ['groessenschluessel', 'Größen-Schlüssel', 'groessenschluessel'], ['mwsttyp', 'MwSt.-Typ', 'mwsttyp'], ['preislage', 'Preisl.-Schl.', 'preislagenschluessel'], ['etikett', 'Etiketten-Typ', 'etikettentyp']];
const WG_WEITERE = [['statgroessen', 'Statistik-Größen-Set', 'statgroessenset'], ['etikett2', 'Etiketten-Typ2', 'etikettentyp'], ['hierarchie', 'Warengruppenhierarchie', 'wghierarchie']];
/** Prüfungen wie im Backend (warengruppe.rs); k = Feld */
function wgErrors(d) {
  const m = [], add = (k, t) => m.push({k, t}), alt = d.id ? wgRaw(d.id) : null, nr = String(d.nr).trim(), name = String(d.name).trim();
  if (!nr) add('nr', 'Nr. angeben'); else if (!/^\d{1,6}$/.test(nr)) add('nr', 'Nr.: eine ganze Zahl bis 999999 (nur Ziffern)');
  else if (!alt && wgIdx().has('adv-' + String(+nr))) add('nr', `Die Nr. ${+nr} gibt es schon`);
  if (!name) add('name', 'Name angeben'); else if (name.length > 50) add('name', 'Name: höchstens 50 Zeichen');
  const H = wgH();
  if (!d.abteilung) { if (!alt || alt.abteilung) add('abteilung', 'Abteilung wählen'); } else if (!H.ab.has(d.abteilung) && alt?.abteilung !== d.abteilung) add('abteilung', 'Abteilung: diese Auswahl gibt es nicht mehr – bitte neu wählen');
  const gibt = (kind, id, altv) => !id || altv === id || !stRows(kind).length || stRows(kind).some(r => String(r.id) === String(id));
  for (const [k, l, kind] of WG_PFLICHT) { if (!d[k]) add(k, `${l} wählen`); else if (!gibt(kind, d[k], alt?.[k])) add(k, `${l}: diese Auswahl gibt es nicht mehr – bitte neu wählen`); }
  for (const [k, l, kind] of WG_WEITERE) if (d[k] && !gibt(kind, d[k], alt?.[k])) add(k, `${l}: diese Auswahl gibt es nicht mehr – bitte neu wählen`);
  const seen = new Set();
  for (let i = 1; i <= 5; i++) { const v = d['webkat' + i]; if (!v) continue; if (seen.has(v)) add('webkat' + i, 'Diese Kategorie ist schon eingetragen'); else if (!gibt('webkategorie', v, alt?.['webkat' + i])) add('webkat' + i, 'Diese Kategorie gibt es nicht mehr – bitte neu wählen'); seen.add(v); }
  const sp = wgTxtNum(d.spanne); if (typeof sp !== 'number') add('spanne', 'Zahl angeben'); else if (sp < 0 || sp >= 100) add('spanne', 'Zwischen 0 und unter 100 %');
  const gw = wgTxtNum(d.gewicht); if (typeof gw !== 'number') add('gewicht', 'Zahl angeben (kg)'); else if (gw < 0 || gw > 10000) add('gewicht', 'Zwischen 0 und 10.000 kg');
  const ins = String(d.intrastat_nr).replace(/\s/g, ''); if (ins && !/^\d{4,10}$/.test(ins)) add('intrastat_nr', '4 bis 10 Ziffern (Warennummer, z. B. 62011290)');
  if (String(d.intrastat_bez).trim().length > 120) add('intrastat_bez', 'Höchstens 120 Zeichen');
  const an = String(d.anz_etiketten).trim(); if (an === '' || !/^\d{1,2}$/.test(an)) add('anz_etiketten', 'Ganze Zahl von 0 bis 99');
  return m;
}
const wgTabOf = () => 'allg';

/* ── Auswahl-Quellen ── */
/** Auswahl je Ebene: die darüber gewählten Ebenen schränken ein (Haupt-Bereich → Bereich → Haupt-Abteilung → Abteilung) */
const wgRowsAbt = () => { const H = wgH(), d = WGE.d || {}, f = d._f || {}; let l = stActive('abteilung'); if (f.ha && d.ha) l = l.filter(a => a.parent === d.ha); else if (f.be && d.be) l = l.filter(a => H.ha.get(a.parent)?.parent === d.be); else if (f.hb && d.hb) l = l.filter(a => H.be.get(H.ha.get(a.parent)?.parent)?.parent === d.hb); return l; };
const wgRowsHa = () => { const H = wgH(), d = WGE.d || {}, f = d._f || {}; let l = stActive('hauptabteilung'); if (f.be && d.be) l = l.filter(h => h.parent === d.be); else if (f.hb && d.hb) l = l.filter(h => H.be.get(h.parent)?.parent === d.hb); return l; };
const wgRowsBe = () => { const d = WGE.d || {}, f = d._f || {}; let l = stActive('bereich'); if (f.hb && d.hb) l = l.filter(b => b.parent === d.hb || !b.parent); return l; };
/** Ebene wechseln: darüberliegende Ebenen nachziehen, nicht mehr passende darunterliegende leeren.
 *  Nur eine ausdrücklich gewählte Ebene (d._f) schränkt die Auswahl darunter ein; was sich aus der Abteilung ergibt, tut es nicht. */
function wgKetteSetzen(d, k) {
  const H = wgH(); d._f ||= {};
  if (k === 'abteilung') { d._f = {}; const c = wgKette(d.abteilung); if (c.a) { d.ha = c.h?.id || ''; d.be = c.b?.id || ''; d.hb = c.x?.id || ''; } return; }
  if (!['ha', 'be', 'hb'].includes(k)) return;
  if (!d[k]) { d._f[k] = false; if (d.abteilung) wgKetteSetzen(d, 'abteilung'); return; }
  d._f[k] = true;
  if (k === 'ha') {
    const a = H.ab.get(d.abteilung); if (a && a.parent !== d.ha) d.abteilung = '';
    const h = H.ha.get(d.ha); if (h?.parent && H.be.has(h.parent)) { d.be = h.parent; d._f.be = false; }
    const b = H.be.get(d.be); if (b?.parent && H.hb.has(b.parent)) { d.hb = b.parent; d._f.hb = false; }
  } else if (k === 'be') {
    const h = H.ha.get(d.ha); if (h && h.parent !== d.be) { d.ha = ''; d.abteilung = ''; d._f.ha = false; }
    const b = H.be.get(d.be); if (b?.parent && H.hb.has(b.parent)) { d.hb = b.parent; d._f.hb = false; }
  } else {
    const b = H.be.get(d.be); if (b?.parent && b.parent !== d.hb) { d.be = ''; d.ha = ''; d.abteilung = ''; d._f.be = d._f.ha = false; }
  }
}
const wgWebRows = k => () => { const d = WGE.d || {}, used = new Set([1, 2, 3, 4, 5].map(i => 'webkat' + i).filter(x => x !== k).map(x => d[x]).filter(Boolean)); return stActive('webkategorie').filter(r => !used.has(r.id)); };

/* ── Maske ── */
const WGK = maskeNew({
  page: 'warengruppe-edit', list: 'st-warengruppe', title: 'Warengruppen', perm: 'einstellungen', st: WGE,
  sub: st => `${st.d.name || (st.id ? '' : 'neue Warengruppe')} (${st.d.nr})`.trim(),
  load: async () => { await Promise.all([loadStamm(), wgLoadZaehler()]); },
  reload: async () => { await Promise.all([loadStamm(true), wgLoadZaehler()]); },
  draft: wgDraft, tabs: () => [['allg', 'Allgemein']], errors: wgErrors, tabOf: wgTabOf, locked: wgLocked,
  can: () => ({new: !wgLocked(), del: false, hideDel: true, refresh: true}),
  bar: () => `<button class="ag-btn" data-mf-a="copy" title="Kopieren" aria-label="Kopieren" ${WGE.id ? '' : 'disabled'} ${wgLocked() ? 'disabled' : ''}>${ic('copy', 'i-sm')}<span>Kopieren</span></button>`,
  body: () => ({html: wgMaske(), mount: null}),
  onSet: (k, el) => { wgKetteSetzen(WGE.d, k); if (k === 'name' || k === 'nr') renderTopbar(); },
  rerender: k => ['abteilung', 'ha', 'be', 'hb', 'mwsttyp', 'etikett', 'etikett2'].includes(k),
  act: async a => { if (a === 'copy') wgKopieren(); },
  save: () => wgSave(), remove: () => { /* Löschen nur in der Liste */ },
});
WGK.register();
function wgOpen(id, ids) { WGK.open(id, ids); }
function wgKopieren() {
  if (wgLocked() || !WGE.id) return;
  const src = mclone(WGE.d);
  WGK.open(null, WGE.ids);
  Object.assign(WGE.d, src, {id: '', nr: String(Math.max(WG.naechste, wgNaechsteNr())), name: `Kopie von ${src.name}`});
  WGE.dirty = true; WGK.render(); renderTopbar();
}
const wgNote = () => wgLocked() ? `<div class="zp-note">${ic('lock', 'i-sm')}<span><b>Warengruppen pflegt die Zentrale.</b> Diese Kasse bekommt die Angaben beim Abgleich; hier sind sie nur lesbar.</span></div>` : '';
function wgMaske() {
  const D = WGE.d, K = WGK, errs = wgErrors(D);
  const card = (h, keys, inner) => { const n = errs.filter(e => keys.includes(e.k)).length; return `<div class="ae-card ea-card"><h4>${esc(h)}<span class="ed-badge" data-mf-cbd="${keys.join(',')}" ${n ? '' : 'hidden'}>${n}</span></h4><div class="ea-fields ge-one">${inner}</div></div>`; };
  const art = WGE.id ? wgArtikel(WGE.id) : [0, 0];
  const leer = {leer: '–'};
  const c1 = card('Haupt-Abteilung', ['nr', 'name', 'be', 'hb', 'abteilung', 'ha', 'altersbewertung', 'praemienschluessel', 'intrastat_nr', 'intrastat_bez', 'gewicht'], `
    ${K.in('nr', 'Nr. *', {pflicht: true, inputmode: 'numeric', max: 6, dis: !!WGE.id, tip: WGE.id ? 'Die Nr. ist der Schlüssel der Warengruppe und lässt sich nicht mehr ändern – zum Umnummerieren kopieren.' : 'Nächste freie Nr. vorgeschlagen; frei wählbar, bis 999999.'})}
    ${K.in('name', 'Name *', {pflicht: true, max: 50})}
    ${K.ref('be', 'Bereich *', 'bereich', {pflicht: true, rows: wgRowsBe, preset: d => (d.hb ? {parent: d.hb} : null), tip: 'Ebene 1 der Hierarchie – ergibt sich aus der Abteilung.'})}
    ${K.ref('hb', 'Haupt-Bereich', 'hauptbereich', {leer: '–', tip: 'Oberste Ebene – ergibt sich aus dem Bereich (dort zu pflegen).'})}
    ${K.ref('abteilung', 'Abteilung *', 'abteilung', {pflicht: true, rows: wgRowsAbt, label: wgAbtPfad, preset: d => (d.ha ? {parent: d.ha} : null), tip: 'Ebene 3 – gespeichert wird diese Abteilung, die übrigen Ebenen folgen daraus.'})}
    ${K.ref('ha', 'Haupt-Abteilung *', 'hauptabteilung', {pflicht: true, rows: wgRowsHa, label: wgHaPfad, preset: d => (d.be ? {parent: d.be} : null), titel: 'Haupt-Abteilung'})}
    ${K.ref('altersbewertung', 'Altersbewertung *', 'altersschluessel', {pflicht: true, tip: 'Welche Prozentsätze die Altersbewertung des Lagers für diese Gruppe anwendet.'})}
    ${K.ref('praemienschluessel', 'Prämienschlüssel *', 'praemienschluessel', {pflicht: true, label: r => `${r.name || r.id}${r.pct != null && r.pct !== '' ? ` (${num(+r.pct)} %)` : ''}`, tip: 'Prämiensatz der Verkäufer:innen auf den Netto-Umsatz dieser Gruppe.'})}
    ${K.sw('service', 'Service-Warengruppe', '', false, 'Dienstleistung: kein Bestand, nie „ausverkauft“, keine Inventur, kein Bestellvorschlag.')}
    ${K.sw('inventur', 'Inventur', '', false, 'Aus: Artikel dieser Gruppe stehen nicht in der Zählliste.')}
    ${K.in('intrastat_nr', 'Intrastat-Waren-Nr.', {mono: true, inputmode: 'numeric', max: 12, tip: 'Warennummer (KN) für die Intrastat-Auswertung, wenn der Artikel keine eigene hat.'})}
    ${K.in('intrastat_bez', 'Intrastat-Waren-Bez.', {max: 120})}
    ${K.in('gewicht', 'Durchschnitts Gewicht', {num: true, inputmode: 'decimal', suffix: 'kg', tip: 'Eigenmasse je Stück für die Intrastat-Auswertung, wenn der Artikel kein Gewicht hat.'})}
    <p class="wg-facts">${WGE.id ? `${art[0] ? `${num(art[0])} Artikel in dieser Warengruppe${art[1] !== art[0] ? ` (davon ${num(art[1])} aktiv)` : ''}.` : 'Noch kein Artikel in dieser Warengruppe.'}` : 'Neue Warengruppe.'}</p>`);
  const c2 = card('WebShop-Kategorien', [1, 2, 3, 4, 5].map(i => 'webkat' + i), [1, 2, 3, 4, 5].map(i => K.ref('webkat' + i, `WebShop-Kategorie ${i}`, 'webkategorie', {...leer, rows: wgWebRows('webkat' + i), titel: 'WebShop-Kategorie', tip: i === 1 ? 'Im Digitalen Schaufenster und in der Schnittstelle erscheinen die Artikel dieser Gruppe in diesen Kategorien.' : ''})).join(''));
  const c3 = card('Größeneinstellungen', ['groessenschluessel', 'statgroessen'], `
    ${K.ref('groessenschluessel', 'Größen-Schlüssel *', 'groessenschluessel', {pflicht: true, label: r => r.name || r.id, tip: 'Die Größenreihe wird bei neuen Artikeln dieser Gruppe vorbelegt.'})}
    ${K.ref('statgroessen', 'Statistik-Größen-Set', 'statgroessenset', {...leer, tip: 'Fasst Größen in der Größen-Auswertung zusammen.'})}`);
  const c4 = card('Finanzeinstellungen', ['mwsttyp', 'preislage', 'spanne'], `
    ${K.sw('rabattsperre', 'Rabattsperre', '', false, 'An der Kasse kein Rabatt auf Artikel dieser Gruppe (Aktionspreise bleiben).')}
    ${K.ref('mwsttyp', 'MwSt.-Typ *', 'mwsttyp', {pflicht: true, label: r => `${r.name || r.id} (${num(+r.satz || 0)} %)`, tip: 'Steuersatz neuer Artikel dieser Gruppe.'})}
    ${K.ref('preislage', 'Preisl.-Schl. *', 'preislagenschluessel', {pflicht: true, titel: 'Preislagen-Schlüssel', tip: 'Preisstufen der Preislagen-Auswertung für diese Gruppe.'})}
    ${K.in('spanne', 'Vorschl.-Spanne/Kalk.', {num: true, inputmode: 'decimal', suffix: '%', tip: 'Handelsspanne vom Netto-Verkaufspreis: schlägt den Verkaufspreis vor, wenn der Einkaufspreis eingegeben wird.'})}`);
  const c5 = card('Etiketten', ['etikett', 'etikett2', 'anz_etiketten', 'hierarchie'], `
    ${K.ref('etikett', 'Etiketten-Typ *', 'etikettentyp', {pflicht: true, tip: 'Größe und Inhalt des Etiketts dieser Gruppe.'})}
    ${K.ref('etikett2', 'Etiketten-Typ2 (Preisreduzierung)', 'etikettentyp', {...leer, titel: 'Etiketten-Typ', tip: 'Dieser Typ ersetzt den Typ bei reduzierter Ware (Preissenkung, Aktionspreis).'})}
    ${K.in('anz_etiketten', 'Anz. Etiketten', {num: true, inputmode: 'numeric', max: 2, tip: 'Etiketten je Stück bei automatischen Mengen (Wareneingang, Preisänderung); 0 = keine.'})}
    ${K.ref('hierarchie', 'Warengruppenhierarchie', 'wghierarchie', {...leer, tip: 'Welche Ebenen der Hierarchie auf dem Etikett stehen.'})}`);
  return `${wgNote()}<div class="fl-grid wg-grid">${c1}${c2}${c3}${c4}${c5}</div>`;
}

/* ── Sichern, Löschen ── */
async function wgSave() {
  if (wgLocked()) return;
  const isNew = !WGE.id;
  if (!WGK.gate()) return;
  try { await needPerm('einstellungen', 'Warengruppen'); } catch { return; }
  const row = wgToRow(WGE.d);
  let saved;
  try {
    if (DESKTOP) saved = await invoke('warengruppe_save', {row, by: S.user.name});
    else {
      const all = persist.get('stamm', {}).warengruppe || stRows('warengruppe').map(r => ({...r})), nr = String(+row.nr), id = isNew ? 'adv-' + nr : row.id;
      if (isNew && all.some(r => r.id === id)) throw new Error(`Die Nr. ${nr} gibt es schon`);
      const o = {...(all.find(r => r.id === id) || {}), ...row, nr, id, ust: +(stRows('mwsttyp').find(m => m.id === row.mwsttyp)?.satz ?? 20)};
      for (const k of ['service', 'rabattsperre', 'etikett2', 'hierarchie', 'statgroessen', 'intrastat_nr', 'intrastat_bez', 'webkat1', 'webkat2', 'webkat3', 'webkat4', 'webkat5']) if (!o[k]) delete o[k];
      o.intrastat_nr = String(o.intrastat_nr || '').replace(/\s/g, ''); if (!o.intrastat_nr) delete o.intrastat_nr;
      if (!o.gewicht) delete o.gewicht; if (String(o.anz_etiketten) === '1') delete o.anz_etiketten; else o.anz_etiketten = +o.anz_etiketten;
      const i = all.findIndex(r => r.id === id); if (i < 0) all.push(o); else all[i] = o;
      await stammSave('warengruppe', all); saved = o;
    }
  } catch (err) { return toast('Speichern fehlgeschlagen', {t2: String(err.message || err), type: 'warn', dur: 7000}); }
  // nur diese eine Zeile in der Tabelle ersetzen (kein Neuladen von 11.848 Zeilen)
  if (DESKTOP) { const rows = stRows('warengruppe').slice(), i = rows.findIndex(r => r.id === saved.id); if (i < 0) rows.push(saved); else rows[i] = saved; STAMM.data.warengruppe = rows; applyStamm(); }
  await wgLoadZaehler();
  const id = saved.id; WGE.id = id; WGE.d = wgDraft(id); WGE.orig = mclone(WGE.d); WGE.dirty = false; WGE.show = false; if (isNew) WGE.ids = [...WGE.ids, id];
  Hooks.emit('warengruppe.saved', {nr: row.nr, name: row.name, neu: isNew});
  toast(isNew ? 'Warengruppe angelegt' : 'Gespeichert', {t2: `${row.nr} · ${row.name}`, type: 'pos', icon: 'tag', dur: 2200});
  WGK.render(); renderTopbar();
}
async function wgRemove(ids) {
  const abort = () => { throw new Error('abgebrochen'); };
  if (wgLocked()) { toast('Warengruppen löscht die Zentrale', {icon: 'lock'}); abort(); }
  const rs = ids.map(wgRaw).filter(Boolean); if (!rs.length) abort();
  const mit = rs.filter(r => wgArtikel(r.id)[0] > 0);
  const wer = rs.length === 1 ? `Warengruppe „${rs[0].name}“` : `${num(rs.length)} Warengruppen`;
  if (!await confirmBox(`${wer} löschen?${mit.length ? ` ${mit.length === 1 ? 'Eine Gruppe hat' : `${mit.length} Gruppen haben`} Artikel und lässt sich nicht löschen.` : ''}`, 'Löschen')) abort();
  try { await needPerm('einstellungen', 'Warengruppen'); } catch { abort(); }
  let n = 0, fehler = '';
  try {
    if (DESKTOP) n = await invoke('warengruppe_delete', {ids: rs.map(r => r.id), by: S.user.name});
    else { const weg = new Set(rs.filter(r => !wgArtikel(r.id)[0]).map(r => r.id)); n = weg.size; if (n) await stammSave('warengruppe', stRows('warengruppe').filter(r => !weg.has(r.id)).map(r => ({...r}))); if (n < rs.length) throw new Error(`${rs.length - n} Gruppe(n) mit Artikeln nicht gelöscht`); }
  } catch (e) { fehler = String(e.message || e); }
  await wgReload();
  if (fehler) { toast(n ? 'Nicht alles gelöscht' : 'Nicht gelöscht', {t2: fehler, type: 'warn', dur: 9000}); if (!n) abort(); return; }
  toast(n === 1 ? 'Warengruppe gelöscht' : `${num(n)} Warengruppen gelöscht`, {t2: rs.slice(0, 3).map(r => r.name).join(', '), icon: 'tag', dur: 2400});
}

/* ═════════════════════════════════════════════════════════════════
   Auskünfte der Warengruppe für andere Stellen (Kasse, Artikelmaske, Inventur, Auswertungen, Etiketten, Schaufenster).
   Alle lesen dieselbe Zeile (wgRaw) – es gibt keine zweite Wahrheit. Unbekannte Warengruppe (z. B. Kategorie „acc“) = keine Besonderheit.
   ═════════════════════════════════════════════════════════════════ */
/** Dienstleistung: kein Bestand, nie „ausverkauft“, nicht in Inventur und Bestellvorschlag */
const wgService = cat => !!(cat && wgRaw(cat)?.service);
/** Inventur: Artikel der Warengruppe stehen in der Zählliste (ohne Angabe: ja) */
const wgInventur = cat => !cat || wgRaw(cat)?.inventur !== false;
/** Steuersatz in % aus dem MwSt.-Typ der Warengruppe (Rückfall: gespeicherter Satz); null = nicht bekannt */
function wgSatz(cat) {
  const r = cat ? wgRaw(cat) : null; if (!r) return null;
  const m = r.mwsttyp ? stRows('mwsttyp').find(x => x.id === r.mwsttyp) : null, v = m ? +m.satz : r.ust != null && r.ust !== '' ? +r.ust : NaN;
  return isFinite(v) ? v : null;
}
/** Rabattsperre der Warengruppe eines Artikels (art.cat) */
const wgRabattSperre = art => !!(art && art.cat && wgRaw(art.cat)?.rabattsperre);
/** Rabattsperre insgesamt: Lieferant ODER Warengruppe (Kasse, Bon-Rabatt, Rabattregeln, Belegposition „nodisc“) */
const rabattGesperrt = art => lfRabattGesperrt(art) || wgRabattSperre(art);
const rabattSperreGrund = art => lfRabattGesperrt(art) ? `Lieferant ${supName(art.supplierId)}` : wgRabattSperre(art) ? `Warengruppe „${wgNm('warengruppe', art.cat)}“` : '';

// nur lesend / für Prüfungen
if (window.KONTOR_UI) Object.assign(window.KONTOR_UI, {wgDraft, wgErrors, wgToRow, wgRows, wgKette, wgInfo: id => wgRaw(id), wgService, wgInventur, wgSatz, rabattGesperrt});
