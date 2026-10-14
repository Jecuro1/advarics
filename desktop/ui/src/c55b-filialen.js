/* ═════════════════════════════════════════════════════════════════
   55b · FILIALEN (Stammdaten › Filialen › Filialen) – Liste und Maske mit Reitern
   Eine Zeile je Standort (Stammdaten-Art „filiale“, Schlüssel = Filial-Kürzel). Sie ist die einzige Quelle für Nummer, Name,
   Farbe, Kontakt, Steuerdaten, Bank und Adressen einer Filiale:
   • Pflege nur in der Zentrale (und die eigene Filiale am Einzelplatz); Filialkassen bekommen die Zeilen beim Abgleich
   • die eigene Zeile gilt für Belege, Bon, Kundendisplay und Schaufenster dieser Kasse (Spiegel in den Einstellungen, filiale.rs)
   • „Aktiv“ aus: die Filiale verschwindet aus Filialauswahl, Umlagerung und Verteilung, der Abgleich wird gesperrt
   • Nr., Kurz-Name, Farbe und Gruppe erscheinen in Filialauswahl, Artikelinfo, Dashboard und Flexanalyse
   Die Prüfungen stehen hier und in filiale.rs gleich (das Backend entscheidet).
   ═════════════════════════════════════════════════════════════════ */
const FIL = {rows: [], eigene: 'ZENTRALE', rolle: 'einzel', loaded: false};
const FE = {id: null, ids: [], d: null, orig: null, tab: 'allg', dirty: false, show: false};
const FL_TABS = [['allg', 'Allgemein'], ['adresse', 'Haupt-Adresse'], ['zusatz', 'Zusätzliche Adresse(n)']];
const FL_ISO3 = {AT: 'AUT', DE: 'DEU', CH: 'CHE', IT: 'ITA', LI: 'LIE', FR: 'FRA', SI: 'SVN', HU: 'HUN', CZ: 'CZE', SK: 'SVK', PL: 'POL', NL: 'NLD', BE: 'BEL', LU: 'LUX', ES: 'ESP', PT: 'PRT', DK: 'DNK', SE: 'SWE', NO: 'NOR', FI: 'FIN', IE: 'IRL', GB: 'GBR', HR: 'HRV', RO: 'ROU', BG: 'BGR', GR: 'GRC', US: 'USA'};
const FL_ART = [['rechnung', 'Rechnungsadresse'], ['liefer', 'Lieferadresse'], ['beide', 'Rechnungs- und Lieferadresse']];
const FL_ADR = ['adrzeile1', 'adrzeile2', 'strasse', 'hausnr', 'plz', 'ort', 'postfach', 'land'];
const flS = v => typeof v === 'string' ? v.trim() : '';
const flSame = (a, b) => flS(a).toUpperCase() === flS(b).toUpperCase();
const flUid = () => Math.random().toString(36).slice(2, 8);
const flName = r => flS(r?.kurz) || flS(r?.name) || r?.id || '';
const flRow = id => FIL.rows.find(r => flSame(r.id, id));
const flNr = id => flRow(id)?.nr ?? '';
const flRO = () => FIL.rolle === 'filiale';
const flIstEigene = id => flSame(id, FIL.eigene);
const flFarbe = id => { const f = flRow(id)?.farbe; return /^#[0-9a-f]{6}$/i.test(f || '') ? f : ''; };
const flDot = id => flFarbe(id) ? `<span class="fl-dot" style="background:${flFarbe(id)}"></span>` : '';
const flBg = id => flFarbe(id) ? `background:${flFarbe(id)}` : '';

/** „Maria-Theresien-Str. 18, 6020 Innsbruck“ → Straße, Hausnr., PLZ, Ort (nur für die erste Übernahme aus den bisherigen Einstellungen) */
function flSplitAdresse(a) {
  a = String(a || '');
  const m = /^\s*(.*?)\s+(\d+[\w/-]*)\s*,\s*(\d{4,5})\s+(.+?)\s*$/.exec(a) || null;
  if (m) return {strasse: m[1], hausnr: m[2], plz: m[3], ort: m[4]};
  const n = /^\s*(.*?)\s*,\s*(\d{4,5})\s+(.+?)\s*$/.exec(a);
  return n ? {strasse: n[1], hausnr: '', plz: n[2], ort: n[3]} : {strasse: a.trim(), hausnr: '', plz: '', ort: ''};
}
/** Bisherige Firmendaten – daraus entsteht die eigene Zeile beim ersten Öffnen */
const flSeed = () => ({name: CFG['firma.name'], kurz: (typeof VB !== 'undefined' && VB.info?.name) || '', ...flSplitAdresse(CFG['firma.adresse']), uid: CFG['firma.uid'], tel: CFG['firma.telefon'], iban: CFG['zahlung.iban'], bic: CFG['zahlung.bic'], bank: CFG['zahlung.bank']});

/** Zeilen laden (Desktop: aus der Datenbank; Vorschau: Browser-Speicher mit den Beispiel-Filialen) */
async function filLoad(force) {
  if (FIL.loaded && !force) return;
  if (DESKTOP) {
    try { const r = await invoke('filiale_list', {seed: flSeed()}); FIL.rows = r.zeilen || []; FIL.eigene = r.eigene; FIL.rolle = r.rolle; }
    catch (e) { console.error(e); }
  } else {
    let l = persist.get('filialen', null);
    if (!l) { l = STORES.map((s, i) => ({id: s.id, nr: i + 1, name: s.id === 'INN' ? CFG['firma.name'] : `Filiale ${s.name}`, kurz: s.name, farbe: ['#1F6FD1', '#C4412F', '#2F6668', '#B54708', '#7D7972'][i % 5], land: 'AT', ...flSplitAdresse(s.addr + ', 6020 ' + s.name), tel: '', iban: '', bic: '', uid: i ? '' : CFG['firma.uid'], zusatz: [], _aktiv: true})); persist.set('filialen', l); }
    FIL.rows = l; FIL.eigene = STORES[0]?.id || 'INN'; FIL.rolle = 'zentrale';
    FIL.loaded = true; if (typeof stRows === 'function') flDecorate(STORES);   // Vorschau: Auswahl zeigt Kurz-Name, Farbe, Gruppe
  }
  FIL.loaded = true;
}
/** Zuordnung zu einer Filialgruppe (die Mitglieder stehen in den Filialgruppen) */
const flGruppe = id => stRows('filialgruppe').find(g => (g.filialen || []).some(x => flSame(x, id)));
/** Filialauswahl, Verbund-Übersicht und Kasse: Anzeigename, Nr., Farbe, Gruppe aus den Filialen übernehmen; abgeschaltete Filialen entfallen */
function flDecorate(list) {
  const out = [];
  for (const s of list) {
    const r = flRow(s.id);
    if (r && r._aktiv === false && !flIstEigene(s.id)) continue;
    if (r) { s.name = flName(r) || s.name; s.nr = r.nr; s.farbe = r.farbe || ''; s.land = r.land || ''; s.gruppe = flGruppe(s.id)?.name || ''; s.haustyp = r.haustyp || ''; const a = flAdrZeile(r); if (a) s.addr = a; }
    out.push(s);
  }
  return out;
}
/** Vorschau (ohne Datenbank): die eigene Zeile in die Einstellungen spiegeln, wie filiale.rs es in der Desktop-App tut */
function flMirrorCfg(r) {
  Object.assign(CFG, {'firma.name': r.name, 'firma.adresse': flAdrZeile(r), 'firma.adrzeile1': r.adrzeile1, 'firma.adrzeile2': r.adrzeile2, 'firma.postfach': r.postfach, 'firma.land': r.land, 'firma.uid': r.uid, 'firma.steuernr': r.steuernr, 'firma.telefon': r.tel, 'firma.fax': r.fax, 'firma.mobil': r.mobil, 'firma.email': r.email, 'firma.web': r.web, 'firma.inhaber': r.inhaber, 'zahlung.iban': r.iban, 'zahlung.bic': r.bic, 'zahlung.bank': r.bank});
}
/** Wurden die Einstellungen am Arbeitsplatz durch den Abgleich verändert (Filialkasse)? Dann neu einlesen. */
async function flSyncCfg() {
  const r = flRow(FIL.eigene); if (!r || !DESKTOP) return;
  const map = {'firma.name': 'name', 'firma.uid': 'uid', 'firma.telefon': 'tel', 'firma.email': 'email', 'zahlung.iban': 'iban'};
  if (Object.entries(map).some(([k, f]) => String(CFG[k] ?? '') !== String(r[f] ?? ''))) { await loadSettings(); if ($('.brand-tenant')) $('.brand-tenant').textContent = CFG['firma.name']; }
}

/* ── Adressen und Beleg-Kopf ── */
const flAdrZeile = r => [[flS(r.strasse), flS(r.hausnr)].filter(Boolean).join(' '), [flS(r.plz), flS(r.ort)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
/** Adressblock wie auf Belegen: Adr.-Zeile 1/2, Straße Nr., Postfach, PLZ Ort, Land (nur wenn nicht Österreich) */
function flAdrLines(r) {
  const land = flS(r.land).toUpperCase();
  return [flS(r.adrzeile1), flS(r.adrzeile2), [flS(r.strasse), flS(r.hausnr)].filter(Boolean).join(' '), flS(r.postfach) ? 'Postfach ' + flS(r.postfach) : '', [flS(r.plz), flS(r.ort)].filter(Boolean).join(' '), land && land !== 'AT' ? land : ''].filter(Boolean);
}
/** Eigene Zusatzadressen dieser Filiale für Bestellungen: {rechnung, liefer} (Zeilen) oder null */
function flZusatz(art) {
  const r = flRow(FIL.eigene); const z = (r?.zusatz || []).find(a => a.typ === art || a.typ === 'beide');
  return z ? flAdrLines(z) : null;
}

/* ── Prüfungen (gleich wie im Backend, filiale.rs) ── */
function flIbanOk(x) {
  const n = String(x || '').replace(/\s+/g, '').toUpperCase(); if (!n) return true;
  if (n.length < 15 || n.length > 34 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(n)) return false;
  let rest = 0; for (const ch of n.slice(4) + n.slice(0, 4)) { const d = /\d/.test(ch) ? +ch : ch.charCodeAt(0) - 55; rest = d >= 10 ? (rest * 100 + d) % 97 : (rest * 10 + d) % 97; }
  return rest === 1;
}
const flFormatIban = x => String(x || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
function flErrors(d) {
  const m = [], add = (k, t) => m.push({k, t}), has = (k, v) => String(d[k] ?? '').trim() === v;
  if (!FE.id) { const id = flS(d.id).toUpperCase(); if (id.length < 2 || id.length > 12 || !/^[A-Z0-9-]+$/.test(id)) add('id', 'Kürzel: 2–12 Zeichen, Buchstaben/Ziffern (z. B. SBG)'); else if (FIL.rows.some(r => flSame(r.id, id))) add('id', 'Dieses Kürzel gibt es schon'); }
  if (has('name', '')) add('name', 'Name angeben');
  const nr = parseInt(d.nr, 10);
  if (!(nr >= 1 && nr <= 99999) || String(nr) !== String(d.nr).trim()) add('nr', 'Nr.: ganze Zahl ab 1');
  else { const o = FIL.rows.find(r => !flSame(r.id, FE.id || d.id) && +r.nr === nr); if (o) add('nr', `Die Nr. ${nr} hat schon die Filiale „${flName(o)}“`); }
  if (d.farbe && !/^#[0-9a-f]{6}$/i.test(d.farbe)) add('farbe', 'Farbwert wie #1F6FD1');
  const em = flS(d.email); if (em && (!em.includes('@') || em.startsWith('@') || em.endsWith('@') || /\s/.test(em))) add('email', 'E-Mail-Adresse wie name@firma.at');
  const uid = flS(d.uid).replace(/\s+/g, ''); if (uid && !/^[A-Za-z]{2}[A-Za-z0-9]{2,12}$/.test(uid)) add('uid', 'USt-IdNr.: Länderkennung und Nummer (z. B. ATU12345678)');
  if (!flIbanOk(d.iban)) add('iban', 'IBAN: Prüfziffer stimmt nicht – bitte Eingabe kontrollieren');
  const bic = flS(d.bic).replace(/\s+/g, ''); if (bic && !/^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/.test(bic)) add('bic', 'BIC: 8 oder 11 Zeichen (z. B. BKAUATWW)');
  if (d.land && !/^[A-Za-z]{2}$/.test(d.land)) add('land', 'Land als zweistelliger ISO-Code');
  (d.zusatz || []).forEach((z, i) => {
    if (!z.ort.trim()) add(`z${i}.ort`, 'Ort angeben');
    if (!z.strasse.trim() && !z.postfach.trim()) add(`z${i}.strasse`, 'Straße (oder Postfach) angeben');
  });
  return m;
}
const flTabOf = k => /^z\d+\./.test(k) ? 'zusatz' : ['adrzeile1', 'adrzeile2', 'strasse', 'hausnr', 'plz', 'ort', 'postfach', 'land'].includes(k) ? 'adresse' : 'allg';

/* ── Zustand ── */
const flBlank = () => ({id: '', nr: String(Math.max(0, ...FIL.rows.map(r => +r.nr || 0)) + 1), name: '', kurz: '', gruppe: '', farbe: '', haustyp: '', tel: '', fax: '', mobil: '', email: '', web: '', inhaber: '', uid: '', steuernr: '', iban: '', bic: '', bank: '',
  adrzeile1: '', adrzeile2: '', strasse: '', hausnr: '', plz: '', ort: '', postfach: '', land: 'AT', zusatz: [], _aktiv: true});
function flDraft(id) {
  const r = id ? flRow(id) : null; if (!r) return flBlank();
  const b = flBlank(), d = {...b};
  for (const k of Object.keys(b)) if (k !== 'zusatz' && k !== 'gruppe' && k !== 'nr' && r[k] != null) d[k] = String(r[k]);
  d.nr = String(r.nr ?? ''); d.iban = flFormatIban(r.iban); d._aktiv = r._aktiv !== false; d.gruppe = flGruppe(r.id)?.id || '';
  d.zusatz = (r.zusatz || []).map(z => ({uid: flUid(), typ: z.typ || 'liefer', ...Object.fromEntries(FL_ADR.map(k => [k, String(z[k] ?? '')]))}));
  return d;
}
const flClone = d => JSON.parse(JSON.stringify(d));
/** Arbeitsstand → Zeile für das Backend */
function flToRow(d) {
  const t = k => String(d[k] ?? '').trim();
  const r = {id: FE.id || t('id').toUpperCase(), nr: parseInt(d.nr, 10), _aktiv: d._aktiv !== false, zusatz: d.zusatz.map(z => ({typ: z.typ, ...Object.fromEntries(FL_ADR.map(k => [k, String(z[k] ?? '').trim()]))}))};
  for (const k of ['name', 'kurz', 'farbe', 'haustyp', 'tel', 'fax', 'mobil', 'email', 'web', 'inhaber', 'uid', 'steuernr', 'iban', 'bic', 'bank', ...FL_ADR]) r[k] = t(k);
  r.iban = r.iban.replace(/\s+/g, '').toUpperCase(); r.uid = r.uid.replace(/\s+/g, '').toUpperCase(); r.bic = r.bic.replace(/\s+/g, '').toUpperCase(); r.land = (r.land || 'AT').toUpperCase();
  return r;
}
const flLocked = () => flRO();

/* ── Liste ── */
function flListRows() {
  return FIL.rows.map(r => {
    const g = flGruppe(r.id); let st = '';
    if (flIstEigene(r.id)) st = FIL.rolle === 'filiale' ? 'diese Kasse' : FIL.rolle === 'zentrale' ? 'Zentrale (diese Kasse)' : 'Einzelplatz';
    else if (FIL.rolle === 'zentrale') st = r._angebunden ? (r._sync ? (Date.now() - new Date(r._sync) < 3 * 6e4 ? 'online' : 'zuletzt ' + fmtTs(r._sync)) : 'noch nicht verbunden') : '–';
    return {id: r.id, nr: +r.nr || 0, aktiv: r._aktiv !== false, kurz: r.kurz || '', name: r.name || '', gruppe: g?.name || 'Standard', land: r.land || '', ort: r.ort || '', farbe: r.farbe || '', haustyp: r.haustyp || '', status: st};
  });
}
agridPage('st-filiale', {
  title: 'Filialen', rows: flListRows, count: () => FIL.rows.length, sort: {k: 'nr', dir: 1}, rowH: 44,
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'nr', l: 'Nr.', t: 'num', w: 70}, {k: 'aktiv', l: 'Aktiv', t: 'check', w: 70}, {k: 'id', l: 'Kürzel', w: 90}, {k: 'kurz', l: 'Kurz-Name', w: 150}, {k: 'name', l: 'Name', w: 240}, {k: 'gruppe', l: 'Filial-Gruppe', w: 150}, {k: 'land', l: 'Land-ISO', w: 90}, {k: 'ort', l: 'Ort', w: 140},
    {k: 'farbe', l: 'Farbe', w: 80, get: r => r.farbe, html: r => r.farbe ? `<span class="fl-sw" style="background:${esc(r.farbe)}" title="${esc(r.farbe)}"></span>` : ''}, {k: 'haustyp', l: 'Haus-Typ', w: 110}, {k: 'status', l: 'Anbindung', w: 190}],
  remove: ids => flRemove(ids),
  actions: {back: () => e2Back(), refresh: () => PAGES['st-filiale'].render(true), new: () => flNeu()},
  edit: id => flOpen(id, (AG['st-filiale'].filtered || []).map(r => r.id)),
});
{ const p = PAGES['st-filiale'], _r = p.render; p.render = async fresh => { await Promise.all([filLoad(true), loadVerbund()]); await _r(); renderTopbar(); }; }
VIEW_PERM['st-filiale'] = 'system';
/** „Neu“: nur die Zentrale legt Filialen an; am Einzelplatz führt der Weg über den Filialverbund */
async function flNeu() {
  if (FIL.rolle === 'filiale') return toast('Filialen pflegt die Zentrale', {t2: 'Diese Kasse bekommt die Angaben beim Abgleich', icon: 'lock'});
  if (FIL.rolle === 'einzel') { if (await confirmBox('Weitere Filialen gibt es im Filialverbund: Diese Kasse wird dazu als Zentrale eingerichtet. Jetzt öffnen?', 'Filialverbund öffnen')) go('set-verbund'); return; }
  flOpen(null, FE.ids);
}

/* ── Maske ── */
function flOpen(id, ids) {
  FE.id = id; FE.ids = ids?.length ? ids : FE.ids; FE.d = flDraft(id); FE.orig = flClone(FE.d); FE.tab = 'allg'; FE.dirty = false; FE.show = false;
  if (S.view === 'filiale-edit') flRender(); else go('filiale-edit');
}
registerPage('filiale-edit', {title: 'Filialen', sub: () => FE.d ? (FE.id ? `${FE.d.nr} ${flName(flRow(FE.id)) || FE.d.name}` : 'neue Filiale') : '', render: async () => {
  if (!FE.d) { setTimeout(() => go('st-filiale'), 0); return; }
  $('#view-filiale-edit').innerHTML = '<div class="muted" style="padding:24px">Lade …</div>';
  await Promise.all([filLoad(), loadStamm()]); flRender(); renderTopbar();
}});
VIEW_PERM['filiale-edit'] = 'system';
NAV_CHILD['filiale-edit'] = 'st-filiale';
leaveGuard('filiale-edit', () => FE.dirty, () => { FE.dirty = false; FE.d = flDraft(FE.id); FE.orig = flClone(FE.d); });

const flErr = k => flErrors(FE.d).find(e => e.k === k);
/** Eingabefeld; o.dis sperrt, o.mono/ph/hint/type/list/num wie üblich, o.k2 = Schlüssel in der Zusatzadresse z{i} */
const flIn = (k, l, o = {}) => {
  const key = o.z != null ? `z${o.z}.${k}` : k, val = o.z != null ? FE.d.zusatz[o.z][k] : FE.d[k];
  const er = FE.show && flErr(key), dis = flLocked() || o.dis;
  return `<label class="field ${er ? 'zp-bad' : ''}"><span>${esc(l)}</span><input class="input ${o.mono ? 'mono' : ''}" ${o.type ? `type="${o.type}"` : ''} data-fl="${key}" value="${esc(val ?? '')}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} ${o.list ? `list="${o.list}"` : ''} autocomplete="off" ${dis ? 'disabled' : ''} ${er ? `aria-invalid="true"` : ''}>${er ? `<small class="zp-err" role="alert">${esc(er.t)}</small>` : o.hint ? `<small class="ea-hint">${esc(o.hint)}</small>` : ''}</label>`;
};
const flLandOpts = cur => { const l = stRows('land').map(x => [x.id, x.name || x.id]); const base = l.length ? l : [['AT', 'Österreich'], ['DE', 'Deutschland'], ['CH', 'Schweiz'], ['IT', 'Italien'], ['LI', 'Liechtenstein']]; return base.some(([id]) => id === cur) || !cur ? base : [[cur, cur], ...base]; };
const flLandSel = (k, o = {}) => {
  const val = o.z != null ? FE.d.zusatz[o.z][k] : FE.d[k], key = o.z != null ? `z${o.z}.${k}` : k;
  return `<label class="field"><span>Land *</span><select class="input select" data-fl="${key}" ${flLocked() ? 'disabled' : ''}>${flLandOpts(val).map(([id, n]) => `<option value="${esc(id)}" ${id === val ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
};
const flCard = (h, inner, cls = '') => `<div class="ae-card ea-card ${cls}">${h ? `<h4>${esc(h)}</h4>` : ''}<div class="ea-fields ge-one">${inner}</div></div>`;
const flSw = (k, l, hint, dis) => `<div class="ue-sw"><label class="ea-sw"><button type="button" class="switch" role="switch" data-fl-sw="${k}" aria-checked="${!!FE.d[k]}" ${flLocked() || dis ? 'disabled' : ''}></button><span>${esc(l)}</span></label>${hint ? `<small class="ea-hint">${esc(hint)}</small>` : ''}</div>`;

/** Beleg-Kopf-Vorschau: so erscheint die Filiale auf A4-Belegen (gleicher Baustein wie die Belege selbst) */
function flPreviewHTML(d) {
  const src = {'firma.name': d.name, 'firma.adrzeile1': d.adrzeile1, 'firma.adrzeile2': d.adrzeile2, 'firma.adresse': flAdrZeile(d), 'firma.postfach': d.postfach, 'firma.land': d.land, 'firma.telefon': d.tel, 'firma.fax': d.fax, 'firma.mobil': d.mobil, 'firma.email': d.email, 'firma.web': d.web, 'firma.uid': d.uid, 'firma.steuernr': d.steuernr, 'firma.inhaber': d.inhaber};
  const html = typeof firmaBlockHTML === 'function' ? firmaBlockHTML(src) : '';
  return `<div class="fl-prev" aria-label="Vorschau Beleg-Kopf">${html || '<span class="muted">Noch keine Angaben</span>'}</div>`;
}
function flAnbindung() {
  const r = FE.id ? flRow(FE.id) : null;
  if (!FE.id) return FIL.rolle === 'zentrale' ? `<p class="ea-hint">Nach dem Sichern erscheint der Verbindungscode für die Filialkasse (Einstellungen › Filialverbund › Filiale).</p>` : '';
  if (flIstEigene(FE.id)) return `<p class="ea-hint">${FIL.rolle === 'zentrale' ? 'Das ist die Zentrale – diese Kasse.' : FIL.rolle === 'filiale' ? 'Das ist diese Filialkasse. Die Angaben kommen von der Zentrale.' : 'Das ist diese Kasse (Einzelplatz).'} Name, Adresse, Steuer- und Bankdaten gelten für Belege, Bon und Kundendisplay.</p>`;
  if (FIL.rolle !== 'zentrale') return `<p class="ea-hint">Die Angaben dieser Filiale pflegt die Zentrale.</p>`;
  const st = r?._angebunden ? (r._sync ? `zuletzt abgeglichen ${fmtTs(r._sync)}` : 'noch nicht verbunden') : 'nicht angebunden';
  return `<div class="ge-facts"><div class="ge-fact"><span>Status</span><b>${esc(st)}</b></div></div>
    <p class="ea-hint">Ist die Filiale deaktiviert, wird ihr Abgleich abgelehnt. Mit einem neuen Verbindungscode wird der bisherige ungültig.</p>
    <button type="button" class="btn btn-secondary" data-fl-a="code" ${flLocked() ? 'disabled' : ''}>${ic('key', 'i-sm')}Verbindungscode erzeugen</button>`;
}
function flAllg() {
  const D = FE.d, gr = stRows('filialgruppe'), typen = [...new Set(FIL.rows.map(r => flS(r.haustyp)).filter(Boolean))];
  const own = FE.id && flIstEigene(FE.id), iso = FL_ISO3[String(D.land).toUpperCase()] || '–';
  const note = flRO() ? `<div class="zp-note">${ic('lock', 'i-sm')}<span><b>Filialen pflegt die Zentrale.</b> Diese Kasse bekommt die Angaben beim Abgleich; hier sind sie nur lesbar.</span></div>` : '';
  const grp = `<label class="field"><span>Filial-Gruppe</span><div class="ea-cmb-row"><select class="input select" data-fl="gruppe" style="flex:1;min-width:0" ${flLocked() ? 'disabled' : ''}><option value="">Standard</option>${gr.map(g => `<option value="${esc(g.id)}" ${g.id === D.gruppe ? 'selected' : ''}>${esc(g.name || g.id)}</option>`).join('')}</select><button type="button" class="ea-ib" data-fl-a="gruppen" title="Filialgruppen bearbeiten oder neu anlegen" aria-label="Filialgruppen bearbeiten">${ic('edit', 'i-sm')}</button></div><small class="ea-hint">Für Analysen (Dimension „Filialgruppe“) und die Filialauswahl. Gruppen legen Sie unter Filialen › Filialengruppe an.</small></label>`;
  const color = `<label class="field ${flErr('farbe') && FE.show ? 'zp-bad' : ''}"><span>Filial-Farbe</span><div class="fl-colorrow"><input type="color" class="fl-color ${D.farbe ? '' : 'none'}" data-fl="farbe" value="${esc(D.farbe || '#888888')}" ${flLocked() ? 'disabled' : ''} aria-label="Filial-Farbe"><span class="muted">${D.farbe ? esc(D.farbe.toUpperCase()) : 'keine Farbe'}</span>${D.farbe && !flLocked() ? `<button type="button" class="ea-ib" data-fl-a="farbex" title="Farbe entfernen" aria-label="Farbe entfernen">${ic('x', 'i-sm')}</button>` : ''}</div><small class="ea-hint">Erscheint in der Filialauswahl, in der Artikelinfo und im Filialvergleich.</small></label>`;
  return {html: `${note}<div class="fl-grid">
    ${flCard('Profil', `${flSw('_aktiv', 'Aktiv', own ? 'Die eigene Filiale ist immer aktiv.' : 'Abgeschaltete Filialen erscheinen nicht mehr in Filialauswahl, Umlagerung und Verteilung; ihr Abgleich wird abgelehnt.', own)}
      ${flIn('id', 'Kürzel *', {mono: true, dis: !!FE.id, ph: 'z. B. SBG', hint: FE.id ? 'Das Kürzel lässt sich nicht mehr ändern (es steckt in Belegen, Beständen und Umlagerungen).' : '2–12 Zeichen. Danach nicht mehr änderbar.'})}
      ${flIn('nr', 'Nr. *', {inputmode: 'numeric', hint: 'Filialnummer – erscheint u. a. im Artikelbestand je Filiale.'})}
      ${flIn('name', 'Name *', {hint: 'Firmenname der Filiale (auf Belegen).'})}${flIn('kurz', 'Kurz-Name', {hint: 'Kurzer Name für Auswahl, Analysen und Formulare (leer = Name).'})}
      ${grp}${color}${flIn('haustyp', 'Haus-Typ', {list: 'fl-typen', hint: 'Für Analysen (Dimension „Haus-Typ“), z. B. Fachgeschäft oder Outlet.'})}<datalist id="fl-typen">${typen.map(t => `<option value="${esc(t)}">`).join('')}</datalist>`)}
    ${flCard('Kontaktdaten', `${flIn('tel', 'Telefon')}${flIn('fax', 'Fax')}${flIn('mobil', 'Mobiltelefon')}${flIn('email', 'E-Mail', {type: 'email', hint: 'Auf A4-Belegen.'})}${flIn('web', 'Website')}${flIn('inhaber', 'Inhabername', {hint: 'Bei Inhaber:innen geführten Unternehmen.'})}`)}
    <div class="fl-stack">${flCard('Finanzeinstellungen', `${flIn('uid', 'USt-IdNr.', {mono: true, ph: 'ATU12345678', hint: 'Pflichtangabe auf Belegen ab € 400.'})}${flIn('steuernr', 'Steuernummer')}<label class="field"><span>ISO</span><input class="input ea-ro" readonly value="${esc(iso)}" tabindex="-1"><small class="ea-hint">Dreistelliger Ländercode, aus dem Land der Haupt-Adresse.</small></label>`)}
      ${flCard('SEPA', `${flIn('iban', 'IBAN', {mono: true, ph: 'AT61 1904 3002 3457 3201', hint: 'Zahlungsempfang auf Rechnungen (EPC-QR) und Belastungskonto der SEPA-Überweisungen.'})}${flIn('bic', 'BIC', {mono: true, ph: 'BKAUATWW'})}${flIn('bank', 'Bank')}`)}</div>
    ${flCard('Anbindung', flAnbindung())}
    ${flCard('Beleg-Kopf', `${flPreviewHTML(D)}<small class="ea-hint">So erscheint die Filiale im Kopf der A4-Belege (Rechnung, Lieferschein, Bestellung).</small>`)}
  </div>`};
}
function flAdresse() {
  const D = FE.d, zeilen = flAdrLines(D);
  return {html: `${flRO() ? `<div class="zp-note">${ic('lock', 'i-sm')}<span><b>Filialen pflegt die Zentrale.</b> Hier nur lesbar.</span></div>` : ''}<div class="fl-grid fl-2">
    ${flCard('Haupt-Adresse', `${flIn('adrzeile1', 'Adr.-Zeile 1', {hint: 'Für weitere Teile des Firmennamens, die unter „Name“ nicht Platz haben.'})}${flIn('adrzeile2', 'Adr.-Zeile 2')}
      <div class="zp-pair">${flIn('strasse', 'Straße')}${flIn('hausnr', 'Haus-Nr.')}</div><div class="zp-pair">${flIn('plz', 'PLZ')}${flIn('ort', 'Ort')}</div>${flIn('postfach', 'Postfach')}${flLandSel('land')}`)}
    ${flCard('Druck-Ansicht', `<div class="fl-prev">${zeilen.length ? [flS(D.name), ...zeilen].filter(Boolean).map(esc).join('<br>') : '<span class="muted">Noch keine Adresse</span>'}</div><small class="ea-hint">So steht die Adresse auf Belegen. Die Einzeilen-Form „${esc(flAdrZeile(D) || '–')}“ gilt für Bon und Kundendisplay.</small>`)}
  </div>`};
}
function flZusatzHTML() {
  const D = FE.d, ro = flLocked();
  const card = (z, i) => `<div class="ae-card ea-card fl-zadr" data-zi="${i}"><h4>Adresse ${i + 1}${ro ? '' : `<button type="button" class="ea-ib" style="float:right" data-fl-a="zdel" data-zi="${i}" title="Adresse entfernen" aria-label="Adresse ${i + 1} entfernen">${ic('trash', 'i-sm')}</button>`}</h4><div class="ea-fields ge-one">
    <label class="field"><span>Art *</span><select class="input select" data-fl="z${i}.typ" ${ro ? 'disabled' : ''}>${FL_ART.map(([v, l]) => `<option value="${v}" ${z.typ === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${flIn('adrzeile1', 'Adr.-Zeile 1', {z: i})}${flIn('adrzeile2', 'Adr.-Zeile 2', {z: i})}<div class="zp-pair">${flIn('strasse', 'Straße', {z: i})}${flIn('hausnr', 'Haus-Nr.', {z: i})}</div><div class="zp-pair">${flIn('plz', 'PLZ', {z: i})}${flIn('ort', 'Ort *', {z: i})}</div>${flIn('postfach', 'Postfach', {z: i})}${flLandSel('land', {z: i})}</div></div>`;
  return {html: `${ro ? `<div class="zp-note">${ic('lock', 'i-sm')}<span><b>Filialen pflegt die Zentrale.</b> Hier nur lesbar.</span></div>` : ''}
    <p class="ea-hint ue-note">Eine Rechnungs- und/oder Lieferadresse der Filiale. Sie erscheinen auf Bestellungen an Lieferanten, wenn diese Filiale bestellt: die Ware kommt an die Lieferadresse, die Rechnung geht an die Rechnungsadresse.</p>
    <div class="fl-grid fl-3">${D.zusatz.map(card).join('')}${ro ? '' : `<button type="button" class="fl-add" data-fl-a="zadd">${ic('plus')}<span>Adresse hinzufügen</span></button>`}</div>
    ${!D.zusatz.length && ro ? '<p class="muted" style="padding:6px 2px">Keine zusätzlichen Adressen.</p>' : ''}`};
}
function flRender() {
  const host = $('#view-filiale-edit'); if (!host || !FE.d) return;
  const D = FE.d, lock = flLocked(), pos = FE.ids.indexOf(FE.id), el = document.createElement('div'); el.className = 'ae ue ge fl'; host.replaceChildren(el);
  const own = FE.id && flIstEigene(FE.id), zentrale = FIL.rolle === 'zentrale';
  const btn = (a, icon, l, dis, text = true) => `<button class="ag-btn" data-fl-a="${a}" title="${esc(l)}" aria-label="${esc(l)}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}${text ? `<span>${l}</span>` : ''}</button>`;
  const errs = flErrors(D), cnt = k => errs.filter(e => flTabOf(e.k) === k).length;
  const tab = ([k, l]) => { const n = cnt(k); return `<button type="button" class="ed-tab" role="tab" data-fl-tab="${k}" aria-selected="${FE.tab === k}">${esc(l)}${k === 'zusatz' && D.zusatz.length ? ` <span class="ed-badge" style="background:var(--surface-3);color:var(--text-2)">${D.zusatz.length}</span>` : ''}${n ? ` <span class="ed-badge">${n}</span>` : ''}</button>`; };
  const body = (FE.tab === 'zusatz' ? flZusatzHTML : FE.tab === 'adresse' ? flAdresse : flAllg)();
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Übersicht: Filialen')}${btn('refresh', 'sync', 'Aktualisieren', !FE.id)}${btn('save', 'check', 'Sichern', lock || !FE.dirty)}${btn('new', 'plus', 'Neu', !zentrale)}${btn('undo', 'undo', 'Änderungen zurücknehmen', lock || !FE.dirty)}${btn('del', 'trash', 'Löschen', !FE.id || !zentrale || own)}
      <span class="sp"></span>${FE.id && FE.ids.length > 1 ? `${btn('prev', 'chevron-left', 'Vorherige Filiale', pos <= 0, false)}<span class="ae-nr">${pos + 1}/${FE.ids.length}</span>${btn('next', 'chevron-right', 'Nächste Filiale', pos >= FE.ids.length - 1, false)}` : ''}</div>
    <div class="ae-tabsw"><div class="ed-tabs" role="tablist">${FL_TABS.map(tab).join('')}</div></div>
    <div class="ae-body"><div id="edBody">${body.html}</div></div>`;
  el.addEventListener('input', e => { const t = e.target.closest('[data-fl]'); if (t && t.type !== 'color' && t.tagName !== 'SELECT') { flSet(t, el); flFields(el); } });
  el.addEventListener('focusout', e => { const t = e.target.closest('[data-fl]'); if (t) { t.dataset.touched = '1'; flFields(el); } });
  el.addEventListener('change', e => { const t = e.target.closest('[data-fl]'); if (t) { flSet(t, el); t.dataset.touched = '1'; if (t.type === 'color' || t.dataset.fl === 'land' || /^z\d+\.(typ|land)$/.test(t.dataset.fl)) flRender(); else flFields(el); } });
  el.addEventListener('click', async e => {
    const t = e.target, tb = t.closest('[data-fl-tab]'), b = t.closest('[data-fl-a]'), sw = t.closest('[data-fl-sw]');
    if (tb) { FE.tab = tb.dataset.flTab; return flRender(); }
    if (sw && !sw.disabled) { const k = sw.dataset.flSw; FE.d[k] = !FE.d[k]; flDirty(el); return flRender(); }
    if (!b || b.disabled) return;
    const a = b.dataset.flA, ask = async () => !FE.dirty || await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen');
    if (a === 'back') { if (!await ask()) return; FE.dirty = false; return go('st-filiale'); }
    if (a === 'refresh' || a === 'undo') { if (a === 'refresh' && !await ask()) return; await Promise.all([filLoad(true), loadStamm(true)]); FE.d = flDraft(FE.id); FE.orig = flClone(FE.d); FE.dirty = false; FE.show = false; return flRender(); }
    if (a === 'new') { if (!await ask()) return; return flOpen(null, FE.ids); }
    if (a === 'prev' || a === 'next') { if (!await ask()) return; const id = FE.ids[pos + (a === 'next' ? 1 : -1)]; if (id) flOpen(id); return; }
    if (a === 'del') return flRemove([FE.id], true);
    if (a === 'save') return flSave();
    if (a === 'farbex') { FE.d.farbe = ''; flDirty(el); return flRender(); }
    if (a === 'gruppen') { if (!await ask()) return; FE.dirty = false; return go('st-filialgruppe'); }
    if (a === 'code') return flCode(FE.id);
    if (a === 'zadd') { FE.d.zusatz.push({uid: flUid(), typ: FE.d.zusatz.some(z => z.typ === 'liefer' || z.typ === 'beide') ? 'rechnung' : 'liefer', adrzeile1: '', adrzeile2: '', strasse: '', hausnr: '', plz: '', ort: '', postfach: '', land: FE.d.land || 'AT'}); flDirty(el); return flRender(); }
    if (a === 'zdel') { FE.d.zusatz.splice(+b.dataset.zi, 1); flDirty(el); return flRender(); }
  });
  body.mount?.(el);
}
function flDirty(el) { FE.dirty = true; $$('[data-fl-a="save"],[data-fl-a="undo"]', el).forEach(b => { b.disabled = flLocked(); }); }
function flSet(t, el) {
  const k = t.dataset.fl, m = /^z(\d+)\.(.+)$/.exec(k);
  if (m) FE.d.zusatz[+m[1]][m[2]] = t.value; else FE.d[k] = t.value;
  flDirty(el);
  if (k === 'name' || k === 'kurz' || k === 'nr') renderTopbar();
  flBadges(el);
  const pv = $('.fl-prev', el); if (pv && FE.tab === 'allg') pv.outerHTML = flPreviewHTML(FE.d);
  if (FE.tab === 'adresse') { const dr = $$('.fl-prev', el)[0]; if (dr) { const z = flAdrLines(FE.d); dr.innerHTML = z.length ? [flS(FE.d.name), ...z].filter(Boolean).map(esc).join('<br>') : '<span class="muted">Noch keine Adresse</span>'; } }
}
/** Zähler an den Reitern */
function flBadges(el) {
  const errs = flErrors(FE.d);
  $$('[data-fl-tab]', el).forEach(tb => {
    const k = tb.dataset.flTab, n = errs.filter(e => flTabOf(e.k) === k).length; let bd = $('.ed-badge:not([style])', tb);
    if (!n) { bd?.remove(); return; }
    if (!bd) { bd = document.createElement('span'); bd.className = 'ed-badge'; tb.append(' ', bd); } bd.textContent = n;
  });
}
/** Nach einer fertigen Eingabe: Fehlertext am Feld zeigen */
function flFields(el) {
  const er = new Map(flErrors(FE.d).map(e => [e.k, e.t]));
  $$('[data-fl]', el).forEach(inp => {
    const lab = inp.closest('label.field'); if (!lab) return; const k = inp.dataset.fl, bad = (FE.show || inp.dataset.touched) && er.has(k);
    lab.classList.toggle('zp-bad', !!bad); let sm = $('small.zp-err', lab);
    if (bad) { if (!sm) { sm = document.createElement('small'); sm.className = 'zp-err'; sm.setAttribute('role', 'alert'); $('.ea-hint', lab)?.remove(); lab.append(sm); } sm.textContent = er.get(k); } else if (sm) sm.remove();
  });
}

/* ── Sichern ── */
async function flSetGroup(id, gid) {
  const rows = stRows('filialgruppe').map(g => ({...g, filialen: [...(g.filialen || [])]})); let ch = false;
  rows.forEach(g => { const n = g.filialen.filter(x => !flSame(x, id)); if (n.length !== g.filialen.length) { g.filialen = n; ch = true; } });
  if (gid) { const g = rows.find(x => x.id === gid); if (g) { g.filialen.push(id); ch = true; } }
  if (ch) await stammSave('filialgruppe', rows);
}
async function flSave() {
  const D = FE.d, O = FE.orig, isNew = !FE.id, errs = flErrors(D);
  if (flLocked()) return;
  if (errs.length) { FE.tab = flTabOf(errs[0].k); FE.show = true; flRender(); return toast(errs[0].t, {t2: 'Angabe prüfen', type: 'warn'}); }
  const row = flToRow(D), name = flName(row);
  const sens = isNew || ['_aktiv', 'nr', 'uid', 'steuernr', 'iban', 'bic', 'name'].some(k => String(D[k]).replace(/\s+/g, '') !== String(O[k]).replace(/\s+/g, ''));
  if (sens && DESKTOP) { try { await stepUp({title: 'Administrator-Freigabe', text: isNew ? `Neue Filiale „${name}“ anlegen` : `Filiale „${name}“ ändern (Name, Nummer, Steuer- oder Bankdaten, Aktiv)`, admin: true}); } catch { return; } }
  let res;
  try {
    if (DESKTOP) res = await invoke('filiale_save', {row, by: S.user.name});
    else { const had = FIL.rows.some(r => flSame(r.id, row.id)), l = FIL.rows.map(r => flSame(r.id, row.id) ? {...r, ...row} : r); if (!had) l.push(row); persist.set('filialen', l); FIL.rows = l; res = {row, code: null}; if (flIstEigene(row.id)) flMirrorCfg(row); }
  } catch (err) { return toast('Speichern fehlgeschlagen', {t2: String(err.message || err), type: 'warn', dur: 7000}); }
  const id = res.row.id;
  try { await flSetGroup(id, D.gruppe); } catch (err) { toast('Gruppe nicht gespeichert', {t2: String(err.message || err), type: 'warn'}); }
  if (DESKTOP) await loadSettings();
  await filLoad(true); await loadVerbund();
  FE.id = id; FE.d = flDraft(id); FE.orig = flClone(FE.d); FE.dirty = false; FE.show = false; if (isNew) FE.ids = [...FE.ids, id];
  Hooks.emit('filiale.saved', {filiale: id, name, neu: isNew});
  toast(isNew ? 'Filiale angelegt' : 'Gespeichert', {t2: `${row.nr} · ${name}`, type: 'pos', icon: 'store', dur: 2200});
  flRender(); renderTopbar();
  if (res.code) flShowCode(res.code, name);
}
/** Verbindungscode der Filialkasse anzeigen (mit QR) */
async function flShowCode(c, name) {
  let qr = ''; try { qr = await invoke('qr_svg', {text: c.code}); } catch { /* */ }
  const el = openLayer(`<div class="modal" style="width:min(560px,100%)" role="dialog" aria-modal="true" aria-label="Verbindungscode"><div class="m-head"><div class="m-ic" style="color:var(--pos)">${ic('check')}</div><div><h2>Verbindungscode für ${esc(name)}</h2><p>An der Filialkasse: Einstellungen → Filialverbund → Filiale → Code einfügen</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:12px"><textarea class="input mono" readonly rows="4" style="height:auto;font-size:11.5px">${esc(c.code)}</textarea><div style="display:flex;gap:14px;align-items:center"><div class="qr-box">${qr.replace('<svg', '<svg width="130" height="130"')}</div><div class="muted" style="font-size:12.5px">Der Code enthält den Schlüssel dieser Filiale und die Adresse der Zentrale (${esc(c.url)}). Nur der Filialkasse geben, nicht weiterleiten.</div></div></div>
    <div class="m-foot"><button class="btn btn-secondary" data-flcopy>${ic('copy', 'i-sm')}Code kopieren</button><span class="sp"></span><button class="btn btn-primary" data-close>Fertig</button></div></div>`);
  $('[data-flcopy]', el).onclick = () => navigator.clipboard?.writeText(c.code).then(() => toast('Kopiert', {type: 'pos', icon: 'copy', dur: 1500}));
}
async function flCode(id) {
  if (!DESKTOP) return toast('Nur in der Desktop-App', {icon: 'info'});
  if (!await confirmBox('Neuen Verbindungscode erzeugen? Der bisherige Code dieser Filiale wird sofort ungültig – die Filialkasse braucht den neuen Code.', 'Neuen Code erzeugen')) return;
  try { await stepUp({title: 'Administrator-Freigabe', text: `Neuer Verbindungscode für Filiale ${id}`, admin: true}); } catch { return; }
  try { const c = await invoke('filiale_code', {id, by: S.user.name}); flShowCode(c, flName(flRow(id))); } catch (e) { toast('Nicht möglich', {t2: String(e), type: 'warn'}); }
}

/* ── Löschen ── */
async function flRemove(ids, fromMask) {
  const abort = () => { throw new Error('abgebrochen'); };
  if (FIL.rolle !== 'zentrale') { toast(FIL.rolle === 'filiale' ? 'Filialen löscht die Zentrale' : 'Am Einzelplatz gibt es nur die eigene Filiale', {icon: 'lock'}); abort(); }
  if (ids.some(i => flIstEigene(i))) { toast('Die eigene Filiale lässt sich nicht löschen', {icon: 'lock'}); if (ids.length === 1) abort(); ids = ids.filter(i => !flIstEigene(i)); }
  const rs = ids.map(flRow).filter(Boolean); if (!rs.length) abort();
  const wer = rs.length === 1 ? `Filiale „${flName(rs[0])}“` : `${rs.length} Filialen`;
  if (!await confirmBox(`${wer} löschen? Filialen mit Belegen oder Umlagerungen lassen sich nicht löschen – sie werden stattdessen deaktiviert (Schalter „Aktiv“).`, 'Löschen')) abort();
  if (DESKTOP) await stepUp({title: 'Administrator-Freigabe', text: `${wer} löschen`, admin: true}).catch(abort);
  const fehler = [];
  for (const r of rs) {
    try {
      if (DESKTOP) await invoke('filiale_delete', {id: r.id, by: S.user.name});
      else { FIL.rows = FIL.rows.filter(x => x.id !== r.id); persist.set('filialen', FIL.rows); await flSetGroup(r.id, ''); }
    } catch (e) { fehler.push(`${flName(r)}: ${e}`); }
  }
  await filLoad(true); if (DESKTOP) await loadStamm(true); await loadVerbund();
  if (fehler.length) { toast('Nicht alles gelöscht', {t2: fehler.join(' · '), type: 'warn', dur: 9000}); if (fehler.length === rs.length) abort(); return; }
  toast(rs.length === 1 ? 'Filiale gelöscht' : `${rs.length} Filialen gelöscht`, {t2: rs.map(flName).join(', '), icon: 'store', dur: 2400});
  if (fromMask) { FE.dirty = false; FE.d = null; go('st-filiale'); }
}

// nur lesend – für Prüfungen: Beleg-Kopf und Bestellung mit den Angaben der eigenen Filiale
if (window.KONTOR_UI) Object.assign(window.KONTOR_UI, {belegKopf: () => letterHead('Rechnung', '', []), bestellung: () => poHTML({no: 'B-TEST'}, [], {name: 'Lieferant'})});
