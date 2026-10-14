/* ═════════════════════════════════════════════════════════════════
   55d · MARKEN (Stammdaten › Marken) – Liste und Maske mit Reitern Allgemein, Postanschrift, Postanschrift in EU
   Eine Zeile je Marke (Stammdaten-Art „marke“, stabiler Schlüssel „mk-…“; die Artikel verweisen über den Markennamen). Die Zeile trägt die
   Herstellerangaben nach der Produktsicherheitsverordnung (GPSR): Hersteller, Anschrift, elektronische Adresse und – bei einem Hersteller
   außerhalb der EU – den Verantwortlichen in der EU.
   • Wirkung: Schaufenster (Abschnitt „Hersteller & Produktsicherheit“, optional nur Artikel mit vollständigen Angaben), REST-Schnittstelle
     (Artikel und /api/v1/marken), Artikelliste/CSV, Artikelmaske (Hersteller, Ampel), Liste und Maske (GPSR-Ampel)
   • Umbenennen zieht Artikel, Preisaktionen, Rabattregeln, Sales-Aktionen, Webshop-/Statistikfilter, Bonus-Systeme und die Standard-Marke mit
   • Löschen nur ohne Artikel, sonst „Aktiv“ ausschalten; unbekannte Marken aus den Artikeln werden automatisch angelegt
   • Pflege nur in der Zentrale (und am Einzelplatz); die Prüfungen stehen hier und in marke.rs gleich (das Backend entscheidet)
   ═════════════════════════════════════════════════════════════════ */
const MK = {rows: [], rolle: 'einzel', loaded: false};
const ME = {id: null, ids: [], d: null, orig: null, tab: 'allg', dirty: false, show: false};
const MK_ADR = ['name', 'email', 'adrzeile1', 'adrzeile2', 'strasse', 'hausnr', 'plz', 'ort', 'postfach', 'land', 'region'];
const MK_ANSCHRIFT = ['adrzeile1', 'adrzeile2', 'strasse', 'hausnr', 'plz', 'ort', 'postfach', 'region'];
const MK_TABS = [['allg', 'Allgemein'], ['h', 'Postanschrift'], ['eu', 'Postanschrift in EU']];
const mkNorm = x => String(x || '').replace(/[®™©]/g, '').trim().split(/\s+/).filter(Boolean).join(' ').toLowerCase();
const mkRow = id => MK.rows.find(r => String(r.id).toLowerCase() === String(id).toLowerCase());
const mkLocked = () => MK.rolle === 'filiale';
const mkLand = iso => landName(iso);
/** E-Mail-Adresse oder Web-Adresse (wie marke.rs) */
function mkElektronisch(x) {
  x = String(x || '').trim(); if (!x || /\s/.test(x)) return false;
  if (/^https?:\/\//i.test(x)) return x.length > 8 && x.includes('.');
  const i = x.indexOf('@'); if (i < 1) return false; const b = x.slice(i + 1);
  return b.includes('.') && !b.startsWith('.') && !b.endsWith('.') && !b.includes('@');
}
const mkAnschriftLeer = v => MK_ANSCHRIFT.every(k => !mS(v?.[k]));
/** GPSR-Vollständigkeit wie marke.rs (die Liste kommt fertig vom Backend; das hier gilt für den Entwurf und die Browser-Vorschau) */
function mkGpsr(row) {
  const h = row.hersteller || {}, e = row.eu || {};
  const leer = v => !mS(v.name) && !mS(v.email) && mkAnschriftLeer(v) && !mS(v.land);
  if (leer(h) && leer(e)) return {stufe: 'keine_angaben', fehlt: ['Hersteller']};
  const fehlt = [], strasse = v => !!(mS(v.strasse) || mS(v.adrzeile1)), voll = v => strasse(v) && !!mS(v.plz) && !!mS(v.ort) && !!mS(v.land);
  if (!mS(h.name)) fehlt.push('Name des Herstellers');
  if (!voll(h)) fehlt.push('Anschrift des Herstellers');
  if (!mkElektronisch(mS(h.email))) fehlt.push('Elektronische Adresse des Herstellers');
  const hl = mS(h.land).toUpperCase();
  if (!hl || !landEu(hl)) {
    if (!mS(e.name)) fehlt.push('Verantwortlicher in der EU');
    if (!voll(e)) fehlt.push('Anschrift in der EU'); else if (!landEu(e.land)) fehlt.push('Anschrift in der EU (Land liegt nicht in der EU)');
    if (!mkElektronisch(mS(e.email))) fehlt.push('Elektronische Adresse in der EU');
  }
  return {stufe: fehlt.length ? 'unvollstaendig' : 'ok', fehlt};
}
const mkStufeText = s => s === 'ok' ? 'vollständig' : s === 'unvollstaendig' ? 'unvollständig' : 'keine Angaben';
const mkStufeTon = s => s === 'ok' ? 'pos' : s === 'unvollstaendig' ? 'warn' : '';
/** Anzeige der Anschrift (Hersteller/EU) in Zeilen */
function mkAdrLines(v) {
  return [mS(v?.adrzeile1), mS(v?.adrzeile2), [mS(v?.strasse), mS(v?.hausnr)].filter(Boolean).join(' '), mS(v?.postfach) ? 'Postfach ' + mS(v.postfach) : '', [mS(v?.plz), mS(v?.ort)].filter(Boolean).join(' '), mS(v?.region), mkLand(v?.land)].filter(Boolean);
}

/* ── Laden ── */
const mkSlug = x => { const t = String(x).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); return t ? t.slice(0, 40) : 'marke'; };
function mkVorschauMeta(r) {
  const n = ART.filter(a => mkNorm(a.brand) === mkNorm(r.name)), g = mkGpsr(r);
  return {_artikel: n.length, _artikel_aktiv: n.length, _gpsr: g.stufe, _gpsr_fehlt: g.fehlt};
}
async function mkLoad(force) {
  if (MK.loaded && !force) return;
  if (DESKTOP) {
    try { const r = await invoke('marke_list'); MK.rows = r.zeilen || []; MK.rolle = r.rolle; } catch (e) { console.error(e); }
  } else {
    let l = persist.get('marken', null);
    if (!l) { l = [...new Set(ART.map(a => a.brand).filter(Boolean))].sort().map(b => ({id: 'mk-' + mkSlug(b), name: b, _aktiv: true, hersteller: {}, eu: {}})); persist.set('marken', l); }
    const known = new Set(l.map(r => mkNorm(r.name))), neu = [...new Set(ART.map(a => a.brand).filter(Boolean))].filter(b => !known.has(mkNorm(b)));
    if (neu.length) { l = [...l, ...neu.map(b => ({id: 'mk-' + mkSlug(b), name: b, _aktiv: true, hersteller: {}, eu: {}}))]; persist.set('marken', l); }
    MK.rows = l.map(r => ({...r, ...mkVorschauMeta(r)})); MK.rolle = 'zentrale';
  }
  MK.loaded = true;
  STAMM.data.marke = MK.rows.map(r => ({...r}));   // Auswahl in Artikelmaske, Einstellungen und Bonus nutzt die Stammdaten
}
/** Markennamen für Auswahllisten (Artikelmaske, Standard-Marke, Bonus-Filter): die aktiven Marken; ohne Markentabelle die der Artikel */
const mkAuswahl = () => { const a = stActive('marke').map(r => r.name || r.id).filter(Boolean), l = a.length ? a : ART.map(x => x.brand).filter(Boolean); return [...new Set(l)].sort((x, y) => x.localeCompare(y, 'de')); };
/** Marke zu einem Artikel-Markennamen (nach der Vergleichsform) – aus der Markenliste, sonst aus den Stammdaten */
const MK_IDX = {src: null, map: new Map()};
function mkFuer(brand) {
  const rows = MK.loaded ? MK.rows : stRows('marke');
  if (MK_IDX.src !== rows || MK_IDX.n !== rows.length) { MK_IDX.src = rows; MK_IDX.n = rows.length; MK_IDX.map = new Map(); for (const r of rows) { const k = mkNorm(r.name); if (k && !MK_IDX.map.has(k)) MK_IDX.map.set(k, r); } }
  return MK_IDX.map.get(mkNorm(brand));
}
/** Herstellerangaben und GPSR-Stufe zu einem Artikel-Markennamen (für Artikelliste, Artikelmaske, Schaufenster) */
function mkArtikelInfo(brand) {
  const m = mkFuer(brand), g = mkGpsr(m || {}), h = m?.hersteller || {}, e = m?.eu || {};
  return {marke: m, stufe: mS(brand) ? g.stufe : 'keine_angaben', fehlt: g.fehlt, hersteller: mS(h.name), anschrift: mkAdrLines(h).join(', '), eu: [mS(e.name), mkAdrLines(e).join(', ')].filter(Boolean).join(', ')};
}
/** Artikel, die das Schaufenster mit dem Schalter „nur vollständige Herstellerangaben“ ausblenden würde */
const mkArtikelOhneGpsr = () => ART.filter(a => a.active !== false && mkArtikelInfo(a.brand).stufe !== 'ok');
/** Ampel der Herstellerangaben in der Artikelmaske (mit Sprung zur Marke) */
function mkKarteChip(brand) {
  const i = mkArtikelInfo(brand); if (!mS(brand)) return '';
  return `<div class="field"><span>GPSR-Angaben</span><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="pill ${mkStufeTon(i.stufe)}" style="height:22px" title="${esc(i.fehlt.length && i.stufe !== 'ok' ? 'Es fehlt: ' + i.fehlt.join(', ') : '')}">${mkStufeText(i.stufe)}</span>${i.marke ? `<button type="button" class="btn btn-ghost btn-sm" data-mk-open="${esc(i.marke.id)}">${ic('edit', 'i-sm')}Marke öffnen</button>` : ''}</div></div>`;
}
/** Marke aus der Artikelmaske öffnen */
async function mkOeffnen(id) { await mkLoad(); if (!mkRow(id)) return toast('Diese Marke gibt es nicht mehr', {type: 'warn'}); mkOpen(id, MK.rows.map(r => r.id)); }

/* ── Liste ── */
function mkListRows() {
  return MK.rows.map(r => {
    const h = r.hersteller || {}, e = r.eu || {};
    return {id: r.id, name: r.name || '', aktiv: r._aktiv !== false, artikel: r._artikel || 0, gpsr: r._gpsr || 'keine_angaben', gpsr_fehlt: (r._gpsr_fehlt || []).join(', '),
      hname: mS(h.name), hmail: mS(h.email), hstrasse: mS(h.strasse), hhausnr: mS(h.hausnr), hplz: mS(h.plz), hort: mS(h.ort), hland: mkLand(h.land), hiso: mS(h.land).toUpperCase(),
      ename: mS(e.name), email: mS(e.email), estrasse: mS(e.strasse), ehausnr: mS(e.hausnr), eplz: mS(e.plz), eort: mS(e.ort), eland: mkLand(e.land), eiso: mS(e.land).toUpperCase()};
  });
}
agridPage('st-marke', {
  title: 'Marken', rows: mkListRows, count: () => MK.rows.length, sort: {k: 'name', dir: 1}, rowH: 44,
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'name', l: 'Name', w: 170}, {k: 'hname', l: 'Name des Herstellers', w: 210}, {k: 'hmail', l: 'Elektronische Adresse', w: 200},
    {k: 'hstrasse', l: 'Hersteller Straße', w: 160}, {k: 'hhausnr', l: 'Hersteller Hausnummer', w: 100}, {k: 'hplz', l: 'Hersteller PLZ', w: 90}, {k: 'hort', l: 'Hersteller Stadt', w: 140}, {k: 'hland', l: 'Hersteller Land', w: 140}, {k: 'hiso', l: 'Hersteller Land ISO', w: 100},
    {k: 'ename', l: 'Verantwortlicher in EU', w: 210}, {k: 'email', l: 'Elektronische Adresse in der EU', w: 210},
    {k: 'estrasse', l: 'Verantwortlicher in EU Straße', w: 170}, {k: 'ehausnr', l: 'Verantwortlicher in EU Hausnummer', w: 110}, {k: 'eplz', l: 'Verantwortlicher in EU PLZ', w: 100}, {k: 'eort', l: 'Verantwortlicher in EU Stadt', w: 150}, {k: 'eland', l: 'Verantwortlicher in EU Land', w: 150}, {k: 'eiso', l: 'Verantwortlicher in EU Land ISO', w: 110},
    {k: 'gpsr', l: 'GPSR', w: 130, get: r => mkStufeText(r.gpsr) + (r.gpsr_fehlt ? ` – fehlt: ${r.gpsr_fehlt}` : ''), html: r => `<span class="pill ${mkStufeTon(r.gpsr)}" style="height:22px" title="${esc(r.gpsr_fehlt ? 'Es fehlt: ' + r.gpsr_fehlt : 'Alle Pflichtangaben vorhanden')}">${mkStufeText(r.gpsr)}</span>`},
    {k: 'artikel', l: 'Artikel', t: 'num', w: 80, show: false}, {k: 'aktiv', l: 'Aktiv', t: 'check', w: 70, show: false}],
  remove: ids => mkRemove(ids),
  actions: {back: () => e2Back(), refresh: () => PAGES['st-marke'].render(true), new: () => mkNeu()},
  edit: id => mkOpen(id, (AG['st-marke'].filtered || []).map(r => r.id)),
});
{ const p = PAGES['st-marke'], _r = p.render; p.render = async fresh => { await Promise.all([loadStamm(fresh === true), mkLoad(true)]); await _r(); renderTopbar(); }; }
VIEW_PERM['st-marke'] = 'einstellungen';
/** „Neu“: nur Zentrale und Einzelplatz legen Marken an */
function mkNeu() {
  if (mkLocked()) return toast('Marken pflegt die Zentrale', {t2: 'Diese Kasse bekommt die Angaben beim Abgleich', icon: 'lock'});
  mkOpen(null, ME.ids);
}

/* ── Entwurf ── */
const mkBlankAdr = () => Object.fromEntries(MK_ADR.map(k => [k, '']));
const mkBlank = () => ({id: '', name: '', _aktiv: true, hersteller: mkBlankAdr(), eu: mkBlankAdr()});
function mkDraft(id) {
  const r = id ? mkRow(id) : null; if (!r) return mkBlank();
  const adr = v => Object.fromEntries(MK_ADR.map(k => [k, String(v?.[k] ?? '')]));
  return {id: r.id, name: String(r.name ?? ''), _aktiv: r._aktiv !== false, hersteller: adr(r.hersteller), eu: adr(r.eu)};
}
function mkToRow(d) {
  const adr = v => Object.fromEntries(MK_ADR.map(k => [k, String(v?.[k] ?? '').trim()]));
  const r = {id: d.id || '', name: String(d.name).trim(), _aktiv: d._aktiv !== false, hersteller: adr(d.hersteller), eu: adr(d.eu)};
  r.hersteller.land = r.hersteller.land.toUpperCase(); r.eu.land = r.eu.land.toUpperCase();
  return r;
}
/** Prüfungen wie im Backend (marke.rs); k = Pfad des Feldes */
function mkErrors(d) {
  const m = [], add = (k, t) => m.push({k, t}), name = String(d.name).trim(), alt = d.id ? mkRow(d.id) : null;
  if (!name) add('name', 'Name angeben'); else if (name.length > 120) add('name', 'Name: höchstens 120 Zeichen'); else if (!mkNorm(name)) add('name', 'Name: mindestens ein Buchstabe oder eine Ziffer');
  else if (!(alt && mkNorm(alt.name) === mkNorm(name))) { const o = MK.rows.find(r => mkNorm(r.name) === mkNorm(name) && String(r.id).toLowerCase() !== String(d.id || '').toLowerCase()); if (o) add('name', `Die Marke „${o.name}“ gibt es schon`); }
  for (const [p, wo] of [['hersteller', 'Hersteller'], ['eu', 'Verantwortlicher in der EU']]) {
    const v = d[p];
    for (const k of MK_ADR) { const max = k === 'name' || k === 'email' ? 120 : 80; if (String(v[k] ?? '').trim().length > max) add(`${p}.${k}`, `Höchstens ${max} Zeichen`); }
    const em = mS(v.email); if (em && !mkElektronisch(em)) add(`${p}.email`, 'E-Mail (name@firma.com) oder Web-Adresse (https://…)');
    const land = mS(v.land); if (land && !/^[A-Za-z]{2}$/.test(land)) add(`${p}.land`, 'Land als zweistelliger ISO-Code');
    else if (!land && !mkAnschriftLeer(v)) add(`${p}.land`, 'Land wählen');
  }
  return m;
}
const mkTabOf = k => /^hersteller\.(name|email)$/.test(k) || /^eu\.(name|email)$/.test(k) || k === 'name' ? 'allg' : /^hersteller\./.test(k) ? 'h' : /^eu\./.test(k) ? 'eu' : 'allg';

/* ── Maske ── */
const mkNote = () => mkLocked() ? `<div class="zp-note">${ic('lock', 'i-sm')}<span><b>Marken pflegt die Zentrale.</b> Diese Kasse bekommt die Angaben beim Abgleich; hier sind sie nur lesbar.</span></div>` : '';
const MKK = maskeNew({
  page: 'marke-edit', list: 'st-marke', title: 'Marken', perm: 'einstellungen', st: ME,
  sub: st => st.id ? (mkRow(st.id)?.name || st.d.name) : 'neue Marke',
  load: async () => { await Promise.all([mkLoad(), loadStamm()]); },
  reload: async () => { await Promise.all([mkLoad(true), loadStamm(true)]); },
  draft: mkDraft, tabs: () => MK_TABS.map(([k, l]) => [k, l]), errors: mkErrors, tabOf: mkTabOf, locked: mkLocked,
  can: () => ({new: !mkLocked(), del: !!ME.id && !mkLocked(), refresh: true}),
  body: () => ({html: (ME.tab === 'h' ? mkAnschriftTab('hersteller') : ME.tab === 'eu' ? mkAnschriftTab('eu') : mkAllg()), mount: null}),
  onSet: k => { if (k === 'name' || k === 'hersteller.name' || k === 'eu.name') renderTopbar(); if (ME.tab === 'allg') mkRefreshStatus(); },
  rerender: k => k === 'hersteller.land' || k === 'eu.land',
  save: () => mkSave(), remove: (ids, fromMask) => mkRemove(ids, fromMask),
});
MKK.register();
function mkOpen(id, ids) { MKK.open(id, ids); }

const mkStatusHTML = () => {
  const r = ME.id ? mkRow(ME.id) : null, g = mkGpsr(mkToRow(ME.d)), n = r?._artikel || 0;
  return `<div class="ge-facts"><div class="ge-fact"><span>GPSR-Angaben</span><b><span class="pill ${mkStufeTon(g.stufe)}" style="height:22px">${mkStufeText(g.stufe)}</span></b></div>
    <div class="ge-fact"><span>Artikel</span><b>${n ? `${num(n)} Artikel tragen diese Marke${r?._artikel_aktiv != null && r._artikel_aktiv !== n ? ` (davon ${num(r._artikel_aktiv)} aktiv)` : ''}` : 'noch kein Artikel'}</b></div></div>
    ${g.fehlt.length && g.stufe !== 'ok' ? `<p class="ea-hint" style="margin:8px 0 0">Es fehlt: ${esc(g.fehlt.join(', '))}.</p>` : ''}
    <p class="ea-hint" style="margin:8px 0 0">Online-Angebote brauchen nach der Produktsicherheitsverordnung (GPSR) den Hersteller mit Anschrift und elektronischer Adresse – bei einem Hersteller außerhalb der EU zusätzlich den Verantwortlichen in der EU. Die Angaben erscheinen im Schaufenster (Abschnitt „Hersteller &amp; Produktsicherheit“) und in der Schnittstelle.</p>`;
};
function mkRefreshStatus() { const el = $('[data-mk-status]'); if (el) el.innerHTML = mkStatusHTML(); }
function mkAllg() {
  const D = ME.d, K = MKK, n = ME.id ? mkRow(ME.id)?._artikel || 0 : 0;
  return `${mkNote()}<div class="fl-grid fl-2">
    ${K.card('Allgemein', `${K.in('name', 'Name *', {hint: n ? `Name der Marke an den Artikeln. Umbenennen ändert die ${num(n)} Artikel und alle Aktionen, Regeln und Filter, die die Marke nennen.` : 'Name der Marke an den Artikeln – eindeutig.'})}
      ${K.in('hersteller.name', 'Name des Herstellers', {hint: 'Rechtlicher Hersteller (Firma) – nicht die Marke.'})}${K.in('hersteller.email', 'Elektronische Adresse', {hint: 'E-Mail oder Web-Adresse des Herstellers.'})}
      ${K.in('eu.name', 'Verantwortlicher in EU', {hint: 'Pflicht, wenn der Hersteller außerhalb der EU sitzt.'})}${K.in('eu.email', 'Elektronische Adresse in der EU')}
      ${K.sw('_aktiv', 'Aktiv', 'Inaktive Marken erscheinen nicht mehr in den Auswahllisten (Artikel, Standard-Marke, Bonus-Filter); die Herstellerangaben bleiben für vorhandene Artikel erhalten.')}`)}
    ${K.card('Herstellerangaben (GPSR)', `<div data-mk-status>${mkStatusHTML()}</div>`)}
  </div>`;
}
/** Reiter Postanschrift (Hersteller) und Postanschrift in EU (Verantwortlicher) – gleiche Felder */
function mkAnschriftTab(p) {
  const D = ME.d, K = MKK, v = D[p], eu = p === 'eu', lines = mkAdrLines(v), name = mS(v.name);
  const landOpts = (eu ? landListe().filter(l => l.eu || l.id === mS(v.land).toUpperCase()) : landListe()).map(l => [l.id, l.name]);
  const kopf = eu ? 'Verantwortlicher des Herstellers in der EU' : 'Herstelleradresse';
  const nameFeld = `<label class="field"><span>Name</span><input class="input ea-ro" readonly tabindex="-1" value="${esc(name)}"><small class="ea-hint">Aus „${eu ? 'Verantwortlicher in EU' : 'Name des Herstellers'}“ (Reiter Allgemein).</small></label>`;
  return `${mkNote()}<div class="fl-grid fl-2">
    ${K.card(kopf, `${nameFeld}${K.in(`${p}.adrzeile1`, 'Adr.-Zeile 1')}${K.in(`${p}.adrzeile2`, 'Adr.-Zeile 2')}
      <div class="zp-pair">${K.in(`${p}.strasse`, 'Straße')}${K.in(`${p}.hausnr`, 'Haus-Nr.')}</div><div class="zp-pair">${K.in(`${p}.plz`, 'PLZ')}${K.in(`${p}.ort`, 'Ort')}</div>${K.in(`${p}.postfach`, 'Postfach', {hint: 'Ein Postfach allein genügt als Anschrift nicht – Straße oder Adr.-Zeile 1 ist nötig.'})}
      ${K.sel(`${p}.land`, 'Land *', landOpts, {leer: '–', hint: eu ? 'Der Verantwortliche muss in der EU sitzen.' : ''})}
      <label class="field"><span>Land-ISO</span><input class="input ea-ro mono" readonly tabindex="-1" value="${esc(mS(v.land).toUpperCase())}"><small class="ea-hint">Zweistelliger Code, aus dem Land abgeleitet.</small></label>
      ${K.in(`${p}.region`, 'Bundesland / Kanton / Provinz')}`)}
    ${K.card('Druck-Ansicht', `<div class="fl-prev">${lines.length || name ? [name ? `<b>${esc(name)}</b>` : '', ...lines.map(esc)].filter(Boolean).join('<br>') : '<span class="muted">Noch keine Anschrift</span>'}</div><small class="ea-hint">So steht die Anschrift im Schaufenster unter „Hersteller &amp; Produktsicherheit“ und in der Schnittstelle.</small>`)}
  </div>`;
}

/* ── Sichern und Löschen ── */
async function mkSave() {
  if (mkLocked()) return;
  const D = ME.d, isNew = !ME.id;
  if (!MKK.gate()) return;
  const row = mkToRow(D), alt = ME.id ? mkRow(ME.id) : null, umbenannt = alt && alt.name !== row.name;
  if (umbenannt && DESKTOP) { try { await stepUp({title: 'Administrator-Freigabe', text: `Marke „${alt.name}“ in „${row.name}“ umbenennen (ändert ${num(alt._artikel || 0)} Artikel und alle Verweise)`, admin: true}); } catch { return; } }
  let saved;
  try {
    if (DESKTOP) saved = await invoke('marke_save', {row, by: S.user.name});
    else {
      const l = persist.get('marken', []).slice(), i = l.findIndex(r => r.id === row.id);
      if (i < 0) { let id = 'mk-' + mkSlug(row.name), k = 2; while (l.some(r => r.id === id)) id = `mk-${mkSlug(row.name)}-${k++}`; row.id = id; l.push({...row}); }
      else l[i] = {...l[i], ...row};
      persist.set('marken', l); saved = row;
      if (umbenannt) ART.forEach(a => { if (mkNorm(a.brand) === mkNorm(alt.name)) a.brand = row.name; });
    }
  } catch (err) { return toast('Speichern fehlgeschlagen', {t2: String(err.message || err), type: 'warn', dur: 7000}); }
  if (DESKTOP && umbenannt) { try { replaceCatalog(await invoke('catalog_list')); } catch { /* */ } try { await loadSettings(); } catch { /* */ } try { await loadPromos(); } catch { /* */ } }
  await Promise.all([mkLoad(true), DESKTOP ? loadStamm(true) : Promise.resolve()]);
  const id = saved.id; ME.id = id; ME.d = mkDraft(id); ME.orig = mclone(ME.d); ME.dirty = false; ME.show = false; if (isNew) ME.ids = [...ME.ids, id];
  Hooks.emit('marke.saved', {marke: row.name, neu: isNew});
  toast(isNew ? 'Marke angelegt' : 'Gespeichert', {t2: row.name, type: 'pos', icon: 'star', dur: 2200});
  MKK.render(); renderTopbar();
}
async function mkRemove(ids, fromMask) {
  const abort = () => { throw new Error('abgebrochen'); };
  if (mkLocked()) { toast('Marken löscht die Zentrale', {icon: 'lock'}); abort(); }
  const rs = ids.map(mkRow).filter(Boolean); if (!rs.length) abort();
  const wer = rs.length === 1 ? `Marke „${rs[0].name}“` : `${rs.length} Marken`;
  if (!await confirmBox(`${wer} löschen? Marken mit Artikeln lassen sich nicht löschen – sie lassen sich nur deaktivieren (Schalter „Aktiv“).`, 'Löschen')) abort();
  if (DESKTOP) await stepUp({title: 'Administrator-Freigabe', text: `${wer} löschen`, admin: true}).catch(abort);
  const fehler = [];
  for (const r of rs) {
    try {
      if (DESKTOP) await invoke('marke_delete', {id: r.id, by: S.user.name});
      else { if (r._artikel) throw `Zur Marke „${r.name}“ gehören ${r._artikel} Artikel – sie lässt sich nicht löschen, aber deaktivieren (Schalter „Aktiv“)`; persist.set('marken', persist.get('marken', []).filter(x => x.id !== r.id)); }
    } catch (e) { fehler.push(String(e.message || e)); }
  }
  await Promise.all([mkLoad(true), DESKTOP ? loadStamm(true) : Promise.resolve()]);
  if (fehler.length) { toast('Nicht alles gelöscht', {t2: fehler.join(' · '), type: 'warn', dur: 9000}); if (fehler.length === rs.length) abort(); return; }
  toast(rs.length === 1 ? 'Marke gelöscht' : `${rs.length} Marken gelöscht`, {t2: rs.map(r => r.name).join(', '), icon: 'star', dur: 2400});
  if (fromMask) { ME.dirty = false; ME.d = null; go('st-marke'); }
}

// nur lesend – für Prüfungen: Markennamen der Artikel und Artikelzahl je Marke
if (window.KONTOR_UI) Object.assign(window.KONTOR_UI, {mkGpsr, markenArtikel: () => [...new Set(ART.map(a => a.brand).filter(Boolean))], artikelJeMarke: b => ART.filter(a => a.brand === b).length});
