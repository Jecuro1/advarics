
/* ════════════════════════════════════════════════════════════════════
   49 · EDI & WEBSHOP — EDIFACT lesen und schreiben (PRICAT, DESADV,
   INVOIC, ORDRSP ein; ORDERS, SLSRPT, INVRPT aus), Dateiaustausch über
   eingestellte Ordner, Katalogdaten → Artikel, Zuordnungen, Fehler und
   Konflikte; Webshop-Bestellungen über die REST-API, Service-Suche,
   Kategorien, Filter, Versand, Abfragelog.
   ════════════════════════════════════════════════════════════════════ */
Object.assign(DST, {erstellt: ['erstellt', 'info'], zugestellt: ['zugestellt', 'pos'], zurueckgegeben: ['zurückgegeben', 'pos'], neu: ['neu', 'warn'], in_bearbeitung: ['in Bearbeitung', 'accent'], verarbeitet: ['verarbeitet', 'pos'], fehler: ['Fehler', 'neg'], ignoriert: ['ignoriert', '']});
Object.assign(DEFAULTS, {'edi.import_dir': '', 'edi.export_dir': '', 'edi.gln': '', 'edi.letzter_slsrpt': '', 'shop.filter_ids': []});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });

/* ── EDIFACT ── */
function edifactParse(raw) {
  let s = String(raw || '').replace(/^\ufeff/, '').replace(/\r?\n/g, '');
  let comp = ':', elem = '+', rel = '?', seg = "'";
  if (s.startsWith('UNA')) { comp = s[3]; elem = s[4]; rel = s[6]; seg = s[8]; s = s.slice(9); }
  const segs = [], split = (str, ch) => { const out = []; let cur = ''; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === rel && i + 1 < str.length) { cur += str[++i]; continue; } if (c === ch) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
  // Segmente trennen (Freigabezeichen beachten)
  let cur = '';
  for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === rel && i + 1 < s.length) { cur += c + s[++i]; continue; } if (c === seg) { if (cur.trim()) segs.push(cur.trim()); cur = ''; } else cur += c; }
  if (cur.trim()) segs.push(cur.trim());
  return segs.map(x => { const el = []; let c2 = ''; for (let i = 0; i < x.length; i++) { const c = x[i]; if (c === rel && i + 1 < x.length) { c2 += c + x[++i]; continue; } if (c === elem) { el.push(c2); c2 = ''; } else c2 += c; } el.push(c2); return {tag: el[0], el: el.slice(1).map(e => split(e, comp))}; });
}
const edVal = (s, i, j = 0) => s?.el?.[i]?.[j] ?? '';
const edEsc = v => String(v ?? '').replace(/[?'+:]/g, m => '?' + m);
function edifactBuild(type, ref, body, partner) {
  const now = new Date(), d = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`, t = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const ctrl = String(Date.now()).slice(-9);
  const segs = [`UNH+1+${type}:D:96A:UN:EAN008`, ...body];
  return [`UNA:+.? '`, `UNB+UNOC:3+${edEsc(CFG['edi.gln'] || '9000000000000')}:14+${edEsc(partner || '9000000000000')}:14+${d}:${t}+${ctrl}`, ...segs, `UNT+${segs.length + 1}+1`, `UNZ+1+${ctrl}`].map(x => x.endsWith("'") ? x : x + "'").join('\n').replace(/^UNA:\+\.\? ''/, "UNA:+.? '");
}
/** Inhalt einer EDIFACT-Datei in Felder übersetzen */
function edifactRead(raw) {
  const segs = edifactParse(raw), unh = segs.find(s => s.tag === 'UNH'), typ = edVal(unh, 1) || 'UNBEKANNT';
  const unb = segs.find(s => s.tag === 'UNB');
  const out = {typ, absender: edVal(unb, 1), empfaenger: edVal(unb, 2), nr: edVal(segs.find(s => s.tag === 'BGM'), 1), datum: '', bestellung: '', lieferant_gln: '', positionen: [], summe: null};
  const dt = v => v && v.length >= 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : '';
  let pos = null;
  for (const s of segs) {
    if (s.tag === 'DTM' && ['137', '132', '2', '11'].includes(edVal(s, 0, 0)) && !out.datum) out.datum = dt(edVal(s, 0, 1));
    if (s.tag === 'DTM' && edVal(s, 0, 0) === '2' && pos) pos.liefertermin = dt(edVal(s, 0, 1));
    if (s.tag === 'RFF' && edVal(s, 0, 0) === 'ON') out.bestellung = edVal(s, 0, 1);
    if (s.tag === 'NAD' && edVal(s, 0) === 'SU') out.lieferant_gln = edVal(s, 1);
    if (s.tag === 'NAD' && edVal(s, 0) === 'MF') { if (pos) pos.marke_gln = edVal(s, 1); else out.marke_gln = edVal(s, 1); }
    if (s.tag === 'MOA' && ['77', '86', '39'].includes(edVal(s, 0, 0)) && out.summe == null) out.summe = parseFloat(edVal(s, 0, 1)) || 0;
    if (s.tag === 'LIN') { pos = {ean: edVal(s, 2, 0), menge: 0}; out.positionen.push(pos); }
    if (!pos) continue;
    if (s.tag === 'PIA') { const q = edVal(s, 1, 1); if (q === 'SA') pos.artikelnr = edVal(s, 1, 0); if (q === 'GN') pos.wg = edVal(s, 1, 0); }
    if (s.tag === 'IMD') { const q = edVal(s, 1), txt = edVal(s, 2, 3) || edVal(s, 2, 0); if (q === '35') pos.farbe = txt; else if (q === '98') pos.groesse = txt; else if (q === 'BRN') { pos.marke = txt; pos.marke_code = edVal(s, 2, 0); } else if (!pos.name) pos.name = txt; }
    if (s.tag === 'QTY') { const q = edVal(s, 0, 0); if (['12', '21', '47', '113', '153', '145', '1'].includes(q)) pos.menge = parseFloat(edVal(s, 0, 1)) || 0; }
    if (s.tag === 'PRI') { const q = edVal(s, 0, 0), p = parseFloat(edVal(s, 0, 1)) || 0; if (q === 'AAA' || q === 'AAB') pos.ek = p; if (q === 'AAE' || q === 'INF') pos.vk = p; }
    if (s.tag === 'MOA' && edVal(s, 0, 0) === '203') pos.betrag = parseFloat(edVal(s, 0, 1)) || 0;
  }
  return out;
}
const ED_TYP = {PRICAT: 'Preiskatalog', DESADV: 'Lieferavis', INVOIC: 'Rechnung', ORDRSP: 'Auftragsbestätigung', ORDERS: 'Bestellung', SLSRPT: 'Verkaufsbericht', INVRPT: 'Bestandsmeldung'};
/** GLN des Lieferanten: die Haupt-GLN aus Stammdaten › Lieferanten, ersatzweise die (frühere) Angabe in den EDI-Einstellungen */
const supByGln = gln => { if (!gln) return null; const s = SUPPLIERS.find(x => x.profile?.gln === gln) || SUPPLIERS_ALL.find(x => x.profile?.gln === gln); if (s) return s; const mb = LF.rows.find(r => (r.marken || []).some(m => m.gln === gln && m.gln_src === 'lieferant')); if (mb) return SUPPLIERS.find(x => x.id === mb.id) || SUPPLIERS_ALL.find(x => x.id === mb.id); const m = stActive('edilieferant').find(x => x.gln && x.gln === gln); return m ? SUPPLIERS.find(x => x.id === m.lieferant) : null; };
const supGln = sid => (SUPPLIERS_ALL.find(x => x.id === sid) || SUPPLIERS.find(x => x.id === sid))?.profile?.gln || stActive('edilieferant').find(x => x.lieferant === sid)?.gln || '';
/** Empfänger der Nachricht (UNB): die Empfänger-GLN des Lieferanten (z. B. Clearingstelle), sonst seine Haupt-GLN */
const supEmpfaenger = sid => (SUPPLIERS_ALL.find(x => x.id === sid) || SUPPLIERS.find(x => x.id === sid))?.profile?.empfaenger_gln || supGln(sid);
const EDI = {docs: null};
async function ediDocs(force) { if (!EDI.docs || force) EDI.docs = DESKTOP ? await invoke('doc_list', {kinds: ['edi'], status: null, limit: 5000}) : []; return EDI.docs; }
async function ediCreate(name, raw, richtung = 'ein') {
  try { await lfLoad(); } catch { /* ohne Marken-GLN weiter */ }
  let p; try { p = edifactRead(raw); } catch (e) { p = {typ: 'UNBEKANNT', fehler: String(e), positionen: []}; }
  const sup = supByGln(p.lieferant_gln) || supByGln(p.absender);
  const d = await invoke('doc_save', {doc: {kind: 'edi', partner: sup?.id || null, partner_name: sup?.name || p.lieferant_gln || p.absender || '', ref: name, date: p.datum || today(), data: {typ: p.typ, richtung, datei: name, parsed: p, inhalt: String(raw).slice(0, 400000)}}, user: S.user.name});
  if (!p.positionen.length && !['UNBEKANNT'].includes(p.typ) && richtung === 'ein') await invoke('doc_action', {id: d.id, action: 'fehler', payload: {grund: 'keine Positionen'}, user: S.user.name});
  if (p.typ === 'UNBEKANNT') await invoke('doc_action', {id: d.id, action: 'fehler', payload: {grund: p.fehler || 'kein UNH-Segment'}, user: S.user.name});
  Hooks.emit('edi.empfangen', {typ: p.typ, datei: name, positionen: p.positionen.length});
  return d;
}
/** Eingangsordner einlesen; auto = Hintergrundjob (verarbeitet DESADV/INVOIC, wenn beim Lieferanten eingestellt) */
async function ediImportFolder(auto) {
  if (!DESKTOP || !CFG['edi.import_dir']) return 0;
  await loadSuppliers(); await loadStamm();
  let files = []; try { files = await invoke('edi_files', {which: 'import'}); } catch { return 0; }
  let n = 0;
  for (const f of files) {
    try {
      const raw = await invoke('edi_read', {which: 'import', name: f.name});
      const d = await ediCreate(f.name, raw);
      await invoke('edi_done', {name: f.name}); n++;
      const sup = lfSup(d.partner), cfg = stActive('edilieferant').find(x => x.lieferant === sup?.id);
      if (auto && cfg?.auto && ['DESADV', 'INVOIC', 'ORDRSP', 'PRICAT'].includes(d.data.typ)) { try { await ediProcess(await invoke('doc_get', {id: d.id})); } catch (e) { Hooks.emit('edi.fehler', {no: d.no, fehler: String(e)}); } }
    } catch (e) { Hooks.emit('edi.fehler', {datei: f.name, fehler: String(e)}); }
  }
  if (n) { EDI.docs = null; if (!auto) toast(`${n} EDI-Datei${n === 1 ? '' : 'en'} eingelesen`, {type: 'pos', icon: 'swap'}); }
  const err = (await ediDocs(true)).filter(d => d.status === 'fehler').length; navBadge('edi-fehler', err || 0);
  return n;
}
/** Nachricht verarbeiten: DESADV → Avis, INVOIC → Eingangsrechnung, ORDRSP → bestätigt, PRICAT → Katalog */
async function ediProcess(d) {
  const p = d.data.parsed || {}, sup = lfSup(d.partner);
  const lines = [], unknown = [];
  for (const x of p.positionen || []) { const f = findEan(x.ean); if (f) lines.push({...newLine(DK.avis, f.a, f.v, x.menge || 1), ...(x.ek ? {price: Math.round(x.ek * 100)} : {})}); else unknown.push(x.ean); }
  let info = '';
  if (p.typ === 'DESADV') {
    if (!sup) throw new Error('Lieferant unbekannt – Haupt-GLN im Lieferanten (Stammdaten › Lieferanten) hinterlegen');
    if (unknown.length) throw new Error(`Unbekannte EAN: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ' …' : ''} – erst per PRICAT/Artikel-Import anlegen`);
    const po = EK.pos.find(x => x.no === p.bestellung);
    const a = await invoke('doc_save', {doc: {kind: 'avis', partner: sup.id, partner_name: sup.name, ref: p.nr, date: p.datum || today(), data: {lines, order_id: po?.id || null, spedition: '', edi: d.no}}, user: S.user.name});
    info = `Avis ${a.no}`;
  } else if (p.typ === 'INVOIC') {
    if (!sup) throw new Error('Lieferant unbekannt – Haupt-GLN im Lieferanten (Stammdaten › Lieferanten) hinterlegen');
    const betrag = Math.round((p.summe ?? (p.positionen || []).reduce((s, x) => s + (x.betrag ?? (x.ek || 0) * (x.menge || 0)), 0)) * 100);
    const po = EK.pos.find(x => x.no === p.bestellung);
    // Fälligkeit und Skonto wie bei der von Hand erfassten Rechnung: Valuta/Skonto des Lieferanten, sonst seine Zahlungs-Bed., sonst die erste Zahlungsbedingung
    const sp = sup.profile || {}, zb = stRows('zahlungsbedingung').find(z => z.id === sp.zahlungsbed) || stActive('zahlungsbedingung')[0];
    const valuta = +sp.valuta || +zb?.tage || 30, skonto = +sp.skonto || +zb?.skonto || 0, skTage = +zb?.skonto_tage || 0;
    const r = await invoke('doc_save', {doc: {kind: 'er', partner: sup.id, partner_name: sup.name, ref: p.nr, date: p.datum || today(), due: plusDays(valuta), data: {rechnungsnr: p.nr, betrag, bestellungen: po ? [po.id] : [], notiz: `aus EDI ${d.no}`, ...(skonto ? {skonto_pct: skonto, skonto_bis: skTage ? plusDays(skTage) : ''} : {})}}, user: S.user.name});
    info = `Eingangsrechnung ${r.no}`;
  } else if (p.typ === 'ORDRSP') {
    info = `Bestätigung zu ${p.bestellung || '–'}: ${num((p.positionen || []).reduce((s, x) => s + (x.menge || 0), 0))} Teile`;
  } else if (p.typ === 'PRICAT') {
    info = `${(p.positionen || []).length} Katalogartikel – Übernahme unter „EDI Artikel-Import“`;
  } else throw new Error(`Nachrichtentyp ${p.typ} wird nicht eingelesen`);
  await invoke('doc_action', {id: d.id, action: 'verarbeitet', payload: {ergebnis: info}, user: S.user.name});
  Hooks.emit('edi.verarbeitet', {no: d.no, typ: p.typ, ergebnis: info});
  EDI.docs = null; return info;
}

/* ── Exporte ── */
async function ediExport(type, sid, body, ref) {
  const content = edifactBuild(type, ref, body, supEmpfaenger(sid));
  const name = `${type}_${ref.replace(/\W+/g, '-')}_${Date.now().toString(36)}.edi`;
  let pfad = '';
  if (CFG['edi.export_dir']) pfad = await invoke('edi_write', {which: 'export', name, content, user: S.user.name});
  else { const p = await invoke('save_text', {name, content, title: `${type} speichern`}); if (!p) return null; pfad = p; }
  const sup = lfSup(sid);
  const d = await invoke('doc_save', {doc: {kind: 'edi', partner: sid || null, partner_name: sup?.name || '', ref: name, date: today(), data: {typ: type, richtung: 'aus', datei: name, pfad, parsed: edifactRead(content), inhalt: content}}, user: S.user.name});
  await invoke('doc_action', {id: d.id, action: 'verarbeitet', payload: {ergebnis: pfad}, user: S.user.name});
  EDI.docs = null; toast(`${type} erstellt`, {t2: pfad, type: 'pos', icon: 'upload'}); return d;
}
async function ediOrders(po) {
  const lines = await invoke('po_lines', {id: po.id});
  const body = [`BGM+220+${edEsc(po.no)}+9`, `DTM+137:${today().replace(/-/g, '')}:102`, `NAD+BY+${edEsc(CFG['edi.gln'] || '')}::9`, ...(lfKundenNr(lfSup(po.supplier_id)) ? [`RFF+IT:${edEsc(lfKundenNr(lfSup(po.supplier_id)))}`] : []), `NAD+SU+${edEsc(supGln(po.supplier_id))}::9`, ...lines.flatMap((l, i) => { return [`LIN+${i + 1}++${edEsc(l.ean || '')}:EN`, `QTY+21:${l.qty}`, `PRI+AAA:${((l.cost ?? 0) / 100).toFixed(2)}`]; }), 'UNS+S', `CNT+2:${lines.length}`];
  return ediExport('ORDERS', po.supplier_id, body, po.no);
}
async function ediSalesSince(sid) {
  const since = CFG['edi.letzter_slsrpt'] || '0000';
  const sales = (await invoke('sales_list', {limit: 20000})).filter(s => s.ts > since && !s.data?.voided);
  const agg = {};
  for (const s of sales) { const sign = (s.kind || 'verkauf') === 'verkauf' ? 1 : -1; for (const l of s.data?.lines || []) { const a = artById(l.sku); if (!a || (sid && a.supplierId !== sid)) continue; const v = a.variants.find(x => x.c === l.c && x.s === l.s); const ean = v?.ean || l.ean; if (!ean) continue; const x = agg[ean] ||= {ean, a, v, menge: 0, umsatz: 0}; x.menge += sign * (l.qty || 0); x.umsatz += sign * (l.unit || 0) * (l.qty || 0) * (1 - (l.disc?.pct || 0) / 100); } }
  return {rows: Object.values(agg).filter(x => x.menge), bons: sales.length, since};
}
async function ediSlsrpt(sid) {
  const {rows} = await ediSalesSince(sid); if (!rows.length) { toast('Keine Verkäufe seit dem letzten Export', {type: 'warn'}); return null; }
  const body = [`BGM+73E+SR${Date.now().toString(36).toUpperCase()}+9`, `DTM+137:${today().replace(/-/g, '')}:102`, `NAD+SE+${edEsc(CFG['edi.gln'] || '')}::9`, `NAD+SU+${edEsc(supGln(sid))}::9`, ...rows.flatMap((r, i) => [`LIN+${i + 1}++${edEsc(r.ean)}:EN`, `QTY+153:${r.menge}`, `PRI+AAE:${(r.umsatz / (r.menge || 1)).toFixed(2)}`]), 'UNS+S', `CNT+2:${rows.length}`];
  const d = await ediExport('SLSRPT', sid, body, sid ? supName(sid) : 'alle');
  if (d) await saveSettings({'edi.letzter_slsrpt': new Date().toISOString()}, true);
  return d;
}
async function ediInvrpt(sid) {
  const arts = ART.filter(a => !sid || a.supplierId === sid);
  const vs = arts.flatMap(a => a.variants.map(v => ({a, v})));
  const body = [`BGM+35+IR${Date.now().toString(36).toUpperCase()}+9`, `DTM+137:${today().replace(/-/g, '')}:102`, `NAD+GY+${edEsc(CFG['edi.gln'] || '')}::9`, ...vs.flatMap((x, i) => [`LIN+${i + 1}++${edEsc(x.v.ean)}:EN`, `QTY+145:${x.v.q}`]), 'UNS+S', `CNT+2:${vs.length}`];
  return ediExport('INVRPT', sid, body, sid ? supName(sid) : 'alle');
}

/* ── PRICAT → Artikel ── */
function ediCatalogItems(docs) {
  const out = [];
  for (const d of docs.filter(x => x.data?.typ === 'PRICAT')) for (const x of d.data.parsed?.positionen || []) out.push({...x, marke: lfMarkeEigen(d.partner, x.marke, x.marke_gln || d.data.parsed?.marke_gln, x.marke_code), doc: d.no, sid: d.partner, sup: d.partner_name});
  const by = {}; out.forEach(x => { by[x.ean] = x; }); // jüngste Übermittlung gewinnt
  return Object.values(by).map(x => { const f = findEan(x.ean); const conflict = f && ((f.a.supplierId && x.sid && f.a.supplierId !== x.sid) || (x.artikelnr && f.a.fields?.['Lieferanten-Art.-Nr.'] && f.a.fields['Lieferanten-Art.-Nr.'] !== x.artikelnr)); const preis = f && x.vk && Math.abs((f.a.price || 0) - x.vk) > 0.009; return {...x, known: !!f, art: f?.a, conflict: !!conflict, preis}; });
}
const ediMapWg = (sid, code) => stActive('edimapwg').find(m => m.lieferant === sid && m.code === code)?.warengruppe;
const ediMapCol = (sid, name) => stActive('lieferantenfarbe').find(m => m.lieferant === sid && norm(m.code) === norm(name))?.farbe;
const ediMapSize = (sid, g) => stActive('edimapgr').find(m => m.lieferant === sid && norm(m.code) === norm(g))?.groesse || g;
async function ediArticleImport(items, updatePrices) {
  const groups = {};
  for (const x of items) { const k = `${x.sid || ''}|${x.artikelnr || x.name}`; (groups[k] ||= []).push(x); }
  let neu = 0, upd = 0; const log = [];
  for (const g of Object.values(groups)) {
    const x0 = g[0], known = g.find(x => x.known)?.art;
    if (known) {
      if (!updatePrices) continue;
      if (x0.vk) known.price = x0.vk; if (x0.ek) known.cost = x0.ek;
      await invoke('article_save', {article: artToDb(known), user: S.user.name}); upd++; log.push({art: known.id, aktion: 'Preise'}); continue;
    }
    const colors = [], sizes = [];
    const variants = g.map(x => {
      const ck = ediMapCol(x.sid, x.farbe || '') || norm(x.farbe || 'standard').replace(/[^a-z0-9]+/g, '-') || 'standard';
      if (!COLORS[ck]) COLORS[ck] = [x.farbe || 'Standard', '#8a8a8a'];
      const sz = ediMapSize(x.sid, x.groesse || 'one size');
      if (!colors.includes(ck)) colors.push(ck); if (!sizes.includes(sz)) sizes.push(sz);
      return {c: ck, s: sz, ean: x.ean, q: 0, other: null};
    });
    const a = {id: nextArtId(), name: x0.name || x0.artikelnr || 'EDI-Artikel', brand: x0.marke || x0.sup || '', cat: ediMapWg(x0.sid, x0.wg) || (CATS.find(c => c.id !== 'alle')?.id || 'acc'), g: 'shirt', price: x0.vk || (x0.ek ? roundPrice(x0.ek * 2.2) : 0), vat: 20, pop: 40, colors, sizes, fields: {'Lieferanten-Art.-Nr.': x0.artikelnr || '', Quelle: `EDI ${x0.doc}`}, cost: x0.ek ?? null, supplierId: x0.sid || '', minStock: 1, variants};
    finishArt(a);
    await invoke('article_save', {article: artToDb(a), user: S.user.name}); ART.push(a); neu++; log.push({art: a.id, aktion: 'neu', varianten: variants.length});
  }
  await reloadArt();
  // Übermittlungen, deren Artikel jetzt alle angelegt sind, als verarbeitet markieren
  for (const no of new Set(items.map(x => x.doc))) {
    const d = (await ediDocs(true)).find(x => x.no === no && ['neu', 'fehler'].includes(x.status));
    if (d && (d.data?.parsed?.positionen || []).every(x => findEan(x.ean))) await invoke('doc_action', {id: d.id, action: 'verarbeitet', payload: {ergebnis: `${neu} Artikel angelegt${upd ? `, ${upd} aktualisiert` : ''}`}, user: S.user.name}).catch(() => {});
  }
  EDI.docs = null;
  Hooks.emit('edi.artikelimport', {neu, aktualisiert: upd, artikel: log.slice(0, 200)});
  return {neu, upd};
}

/* ── Seiten ── */
const edPill = d => `${dPill(d.status)} <span class="pill ${d.data?.richtung === 'aus' ? 'accent' : 'info'}" style="height:20px">${d.data?.richtung === 'aus' ? 'Ausgang' : 'Eingang'}</span>`;
function ediListPage(id, title, sub, filter, extra = {}) {
  registerPage(id, {title, sub: () => sub.split(' – ')[0], render: async () => {
    const v = $('#view-' + id);
    if (!DESKTOP) { v.innerHTML = desktopEmpty('swap', title); return; }
    await loadSuppliers(); await loadStamm();
    v.innerHTML = `<div class="cv">${pageHead(title, sub)}${loadingCard('Lade')}</div>`;
    const docs = (await ediDocs(true)).filter(filter);
    const cols = extra.cols || [['Typ', d => `<b>${esc(d.data?.typ || '')}</b> <span class="muted" style="font-size:12px">${esc(ED_TYP[d.data?.typ] || '')}</span>${d.data?.ergebnis && d.data?.richtung !== 'aus' ? `<div class="muted" style="font-size:11.5px">→ ${esc(d.data.ergebnis)}</div>` : ''}`], ['Datei', d => `<span class="mono" style="font-size:12px">${esc(d.ref || '')}</span>`], ['Positionen', d => num(d.data?.parsed?.positionen?.length || 0)]];
    v.innerHTML = `<div class="cv">${pageHead(title, sub, extra.actions || '')}${extra.above ? await extra.above(docs) : ''}
      <div class="card" style="overflow:auto">${docs.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Nummer</th><th>Datum</th><th>Partner</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}<th>Status</th><th class="r" style="padding-right:16px"></th></tr></thead><tbody>${docs.slice(0, 500).map(d => `<tr><td style="padding-left:16px"><b class="mono">${esc(d.no)}</b></td><td class="muted num">${esc(dDate(d.date))}</td><td>${esc(d.partner_name || '–')}</td>${cols.map(c => `<td>${c[1](d)}</td>`).join('')}<td>${edPill(d)}${d.status === 'fehler' ? `<div style="font-size:11.5px;color:var(--neg)">${esc(ediErr(d))}</div>` : ''}</td><td class="r" style="padding-right:12px;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-edshow="${d.id}">${ic('eye', 'i-sm')}Ansehen</button>${d.data?.richtung !== 'aus' && ['neu', 'fehler'].includes(d.status) ? `<button class="btn btn-secondary btn-sm" data-edproc="${d.id}">${ic('play', 'i-sm')}Verarbeiten</button><button class="btn btn-ghost btn-sm" data-edign="${d.id}">Ignorieren</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('swap')}</div><h3>Keine Einträge</h3><p>${esc(extra.empty || 'EDI-Dateien über „EDI-Nachrichten“ einlesen.')}</p></div>`}</div></div>`;
  }});
  VIEW_PERM[id] = 'einkauf';
}
const ediErr = d => d.data?.fehler || 'siehe Verlauf';
ediListPage('edi-nachrichten', 'EDI-Nachrichten', 'Alle ein- und ausgehenden EDIFACT-Nachrichten – einlesen aus dem Eingangsordner oder als Datei öffnen', () => true,
  {actions: `<label class="btn btn-secondary" style="cursor:pointer">${ic('download', 'i-sm')}Datei öffnen<input type="file" accept=".edi,.txt,.edifact,*/*" data-edfile multiple hidden></label><button class="btn btn-primary" data-edimp>${ic('sync', 'i-sm')}Eingangsordner einlesen</button>`,
    above: async docs => kpiCards([[num(docs.filter(d => d.status === 'neu').length), 'neu', 'warn'], [num(docs.filter(d => d.status === 'fehler').length), 'Fehler', 'neg'], [num(docs.filter(d => d.status === 'verarbeitet').length), 'verarbeitet', 'pos'], [esc((CFG['edi.import_dir'] || 'kein Ordner').split(/[\\/]/).filter(Boolean).slice(-2).join('/')), 'Eingangsordner']])});
ediListPage('edi-fehler', 'EDI Import Fehler', 'Nachrichten, die nicht verarbeitet werden konnten – Ursache beheben (GLN, Artikel, Zuordnung) und erneut verarbeiten', d => d.status === 'fehler', {empty: 'Keine fehlerhaften Nachrichten.'});
ediListPage('edi-katalog', 'Preiskataloge – Katalogübermittlungen', 'Empfangene PRICAT-Nachrichten der Lieferanten', d => d.data?.typ === 'PRICAT');
ediListPage('edi-ordrsp', 'ORDRSP Import Daten', 'Auftragsbestätigungen der Lieferanten – bestätigte Mengen und Liefertermine', d => d.data?.typ === 'ORDRSP', {cols: [['Bestellung', d => esc(d.data?.parsed?.bestellung || '–')], ['bestätigt', d => num((d.data?.parsed?.positionen || []).reduce((s, x) => s + (x.menge || 0), 0)) + ' Teile'], ['Liefertermin', d => esc([...new Set((d.data?.parsed?.positionen || []).map(x => x.liefertermin).filter(Boolean))].map(dDate).join(', ') || '–')]]});
ediListPage('edi-invoic', 'INVOIC Import Daten', 'Elektronische Lieferantenrechnungen – Verarbeiten legt die Eingangsrechnung an', d => d.data?.typ === 'INVOIC', {cols: [['Rechnung', d => esc(d.data?.parsed?.nr || '')], ['Bestellung', d => esc(d.data?.parsed?.bestellung || '–')], ['Betrag', d => d.data?.parsed?.summe != null ? eur(d.data.parsed.summe) : '–']]});
ediListPage('edi-desadv', 'DESADV Import Daten', 'Lieferavise – Verarbeiten legt ein Wareneingang-Avis an', d => d.data?.typ === 'DESADV', {cols: [['Lieferschein', d => esc(d.data?.parsed?.nr || '')], ['Bestellung', d => esc(d.data?.parsed?.bestellung || '–')], ['Teile', d => num((d.data?.parsed?.positionen || []).reduce((s, x) => s + (x.menge || 0), 0))]]});
ediListPage('edi-verkaufsberichte', 'Verkaufsberichte', 'Gesendete SLSRPT-Verkaufsberichte an Lieferanten', d => d.data?.typ === 'SLSRPT', {cols: [['Datei', d => `<span class="mono" style="font-size:12px">${esc(d.ref)}</span>`], ['Positionen', d => num(d.data?.parsed?.positionen?.length || 0)]], empty: 'Unter „POS Marktdaten Lieferanten“ erstellen.'});
ediListPage('edi-bestandsmeldungen', 'Bestandsmeldungen', 'Gesendete INVRPT-Bestandsmeldungen', d => d.data?.typ === 'INVRPT', {actions: `<button class="btn btn-primary" data-edinv>${ic('upload', 'i-sm')}Bestandsmeldung erstellen</button>`, empty: 'Bestandsmeldung über den Knopf oben erstellen.'});

registerPage('edi-bestellungen', {title: 'EDI-Bestellungen', sub: () => 'ORDERS an Lieferanten', render: async () => {
  const v = $('#view-edi-bestellungen');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('truck', 'EDI-Bestellungen'); return; }
  await loadPurchasing(); await loadStamm();
  const sent = (await ediDocs(true)).filter(d => d.data?.typ === 'ORDERS'), sentNo = new Set(sent.map(d => d.data?.parsed?.nr));
  const pos = EK.pos.filter(p => p.status !== 'storniert' && p.status !== 'entwurf');
  v.innerHTML = `<div class="cv">${pageHead('EDI-Bestellungen', 'Bestellungen als EDIFACT ORDERS an Lieferanten mit EDI-Anbindung senden (Datei im Ausgangsordner)')}
    <div class="card" style="overflow:auto"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Bestellung</th><th>Lieferant</th><th>GLN</th><th class="r">Teile</th><th>Status</th><th class="r" style="padding-right:16px"></th></tr></thead><tbody>${pos.map(p => `<tr><td style="padding-left:16px"><b class="mono">${esc(p.no)}</b></td><td>${esc(p.supplier || supName(p.supplier_id))}</td><td class="mono" style="font-size:12px">${esc(supGln(p.supplier_id) || '– fehlt –')}</td><td class="r num">${num(p.qty)}</td><td>${sentNo.has(p.no) ? '<span class="pill pos" style="height:20px">per EDI gesendet</span>' : `<span class="pill" style="height:20px">${esc(PO_ST[p.status]?.[0] || p.status)}</span>`}</td><td class="r" style="padding-right:12px"><button class="btn btn-${sentNo.has(p.no) ? 'ghost' : 'primary'} btn-sm" data-edord="${p.id}">${ic('upload', 'i-sm')}${sentNo.has(p.no) ? 'Erneut senden' : 'ORDERS senden'}</button></td></tr>`).join('') || '<tr><td style="padding:24px" colspan="6" class="muted">Keine bestellten Aufträge.</td></tr>'}</tbody></table></div></div>`;
}});
VIEW_PERM['edi-bestellungen'] = 'einkauf';

registerPage('edi-naechster-export', {title: 'Verkäufe im nächsten Export', sub: () => 'Seit dem letzten Verkaufsbericht', render: async () => {
  const v = $('#view-edi-naechster-export');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('swap', 'Export'); return; }
  v.innerHTML = `<div class="cv">${pageHead('Verkäufe im nächsten Export', 'Lade …')}${loadingCard('Lade')}</div>`;
  const {rows, bons, since} = await ediSalesSince(null);
  v.innerHTML = `<div class="cv">${pageHead('Verkäufe im nächsten Export', `Verkäufe seit ${since > '0000' ? fmtTs(since) : 'Beginn'} – gehen mit dem nächsten Verkaufsbericht (SLSRPT) an die Lieferanten`, `<button class="btn btn-primary" data-goto="edi-marktdaten">${ic('upload', 'i-sm')}Zu den Lieferanten-Exporten</button>`)}
    ${kpiCards([[num(bons), 'Bons'], [num(rows.length), 'EANs'], [num(rows.reduce((s, r) => s + r.menge, 0)), 'Teile'], [eur0(rows.reduce((s, r) => s + r.umsatz, 0)), 'Umsatz']])}
    <div class="card" style="overflow:auto"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">EAN</th><th>Artikel</th><th>Lieferant</th><th class="r">Menge</th><th class="r" style="padding-right:16px">Umsatz</th></tr></thead><tbody>${rows.slice(0, 1000).map(r => `<tr><td style="padding-left:16px" class="mono">${esc(r.ean)}</td><td>${esc(r.a.name)} <span class="muted">${r.v ? esc(vname(r.v)) : ''}</span></td><td>${esc(supName(r.a.supplierId))}</td><td class="r num">${r.menge}</td><td class="r num" style="padding-right:16px">${eur(r.umsatz)}</td></tr>`).join('')}</tbody></table></div></div>`;
}});
registerPage('edi-marktdaten', {title: 'POS Marktdaten Lieferanten', sub: () => 'Verkaufsdaten je Lieferant', render: async () => {
  const v = $('#view-edi-marktdaten');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('swap', 'Marktdaten'); return; }
  await loadSuppliers(); await loadStamm();
  const {rows} = await ediSalesSince(null);
  const by = {}; rows.forEach(r => { const x = by[r.a.supplierId || ''] ||= {teile: 0, umsatz: 0, eans: 0}; x.teile += r.menge; x.umsatz += r.umsatz; x.eans++; });
  v.innerHTML = `<div class="cv">${pageHead('POS Marktdaten Lieferanten', 'Abverkaufsdaten (Sell-out) als Verkaufsbericht SLSRPT und Bestand als INVRPT an Lieferanten mit EDI-Vereinbarung')}
    <div class="card" style="overflow:auto"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Lieferant</th><th>GLN</th><th class="r">EANs</th><th class="r">Teile</th><th class="r">Umsatz</th><th class="r" style="padding-right:16px"></th></tr></thead><tbody>${SUPPLIERS.map(s => { const x = by[s.id] || {teile: 0, umsatz: 0, eans: 0}; return `<tr><td style="padding-left:16px"><b>${esc(s.name)}</b></td><td class="mono" style="font-size:12px">${esc(supGln(s.id) || '–')}</td><td class="r num">${x.eans}</td><td class="r num">${num(x.teile)}</td><td class="r num">${eur(x.umsatz)}</td><td class="r" style="padding-right:12px;white-space:nowrap"><button class="btn btn-secondary btn-sm" data-edsls="${esc(s.id)}" ${x.eans ? '' : 'disabled'}>${ic('upload', 'i-sm')}SLSRPT</button><button class="btn btn-ghost btn-sm" data-edinv="${esc(s.id)}">${ic('upload', 'i-sm')}INVRPT</button></td></tr>`; }).join('')}</tbody></table></div></div>`;
}});
VIEW_PERM['edi-naechster-export'] = 'einkauf'; VIEW_PERM['edi-marktdaten'] = 'einkauf';

/* EDI-Stammdaten: Katalogartikel, Konflikte, Artikel-Import */
const EAI = {q: '', f: 'neu', sel: new Set(), upd: false};
function ediCatPage(id, title, sub, mode) {
  registerPage(id, {title, sub: () => sub.split(' – ')[0], render: async () => {
    const v = $('#view-' + id);
    if (!DESKTOP) { v.innerHTML = desktopEmpty('swap', title); return; }
    await loadSuppliers(); await loadStamm(); await Promise.all([lfLoad(), mkLoad()]);
    const all = ediCatalogItems(await ediDocs(true)), n = norm(EAI.q);
    const list = all.filter(x => mode === 'konflikte' ? x.conflict || x.preis : mode === 'import' ? (EAI.f === 'alle' || (EAI.f === 'neu' ? !x.known : x.known)) : true).filter(x => !n || norm(`${x.ean} ${x.name} ${x.artikelnr} ${x.marke} ${x.sup}`).includes(n));
    v.innerHTML = `<div class="cv">${pageHead(title, sub, mode === 'import' ? `<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-eaiu ${EAI.upd ? 'checked' : ''}>Preise bekannter Artikel aktualisieren</label><button class="btn btn-primary" data-eaigo>${ic('download', 'i-sm')}Ausgewählte übernehmen</button>` : '')}
      ${kpiCards([[num(all.length), 'Katalogartikel (EAN)'], [num(all.filter(x => !x.known).length), 'neu'], [num(all.filter(x => x.conflict).length), 'Konflikte', 'neg'], [num(all.filter(x => x.preis).length), 'Preis abweichend', 'warn']])}
      <div class="filters"><input class="input" data-eaiq value="${esc(EAI.q)}" placeholder="EAN, Name, Artikelnummer …" style="max-width:320px">${mode === 'import' ? `<div class="seg" data-eaif>${[['neu', 'Neu'], ['bekannt', 'Bekannt'], ['alle', 'Alle']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${EAI.f === k}">${l}</button>`).join('')}</div>` : ''}</div>
      <div class="card" style="overflow:auto">${list.length ? `<table class="tbl" style="margin:0"><thead><tr>${mode === 'import' ? '<th style="padding-left:16px;width:34px"><input type="checkbox" data-eaiall></th>' : ''}<th style="${mode === 'import' ? '' : 'padding-left:16px'}">EAN</th><th>Artikel</th><th>Farbe / Größe</th><th>Lieferant</th><th class="r">EK</th><th class="r">VK</th><th style="padding-right:16px">Status</th></tr></thead><tbody>${list.slice(0, 800).map(x => `<tr>${mode === 'import' ? `<td style="padding-left:16px"><input type="checkbox" data-eais="${esc(x.ean)}" ${EAI.sel.has(x.ean) ? 'checked' : ''}></td>` : ''}<td class="mono" style="${mode === 'import' ? '' : 'padding-left:16px'};font-size:12px">${esc(x.ean)}</td><td><b>${esc(x.name || '–')}</b><div class="muted" style="font-size:11.5px">${esc([x.marke, x.artikelnr, x.wg ? 'WG ' + x.wg + (ediMapWg(x.sid, x.wg) ? ' → ' + catName(ediMapWg(x.sid, x.wg)) : ' (nicht zugeordnet)') : ''].filter(Boolean).join(' · '))}</div></td><td>${esc(x.farbe || '–')}${ediMapCol(x.sid, x.farbe || '') ? ` <span class="muted">→ ${esc(colorName(ediMapCol(x.sid, x.farbe)))}</span>` : ''} / ${esc(x.groesse || '–')}</td><td>${esc(x.sup || '–')}</td><td class="r num">${x.ek != null ? eur(x.ek) : '–'}</td><td class="r num">${x.vk != null ? eur(x.vk) : '–'}${x.preis ? `<div class="muted" style="font-size:11px">aktuell ${eur(x.art.price)}</div>` : ''}</td><td style="padding-right:16px">${x.conflict ? `<span class="pill neg" style="height:20px">Konflikt: ${esc(x.art.id)}</span>` : x.known ? `<span class="pill pos" style="height:20px">${esc(x.art.id)}</span>` : '<span class="pill warn" style="height:20px">neu</span>'}</td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('list')}</div><h3>${mode === 'konflikte' ? 'Keine Konflikte' : 'Keine Katalogdaten'}</h3><p>PRICAT-Dateien unter EDI › EDI-Nachrichten einlesen.</p></div>`}</div></div>`;
    $('[data-eaiq]', v).onchange = e => { EAI.q = e.target.value; PAGES[id].render(); };
    if (mode === 'import') {
      initSeg($('[data-eaif]', v), b => { EAI.f = b.dataset.v; PAGES[id].render(); });
      $('[data-eaiall]', v) && ($('[data-eaiall]', v).onchange = e => { list.forEach(x => e.target.checked ? EAI.sel.add(x.ean) : EAI.sel.delete(x.ean)); PAGES[id].render(); });
      v.onchange = e => { if (e.target.dataset.eais) e.target.checked ? EAI.sel.add(e.target.dataset.eais) : EAI.sel.delete(e.target.dataset.eais); if (e.target.matches('[data-eaiu]')) EAI.upd = e.target.checked; };
      $('[data-eaigo]', v).onclick = async () => {
        const items = all.filter(x => EAI.sel.has(x.ean)); if (!items.length) return toast('Nichts ausgewählt', {type: 'warn'});
        try { await needPerm('artikel.bearbeiten', 'EDI Artikel-Import'); const r = await ediArticleImport(items, EAI.upd); EAI.sel.clear(); toast('Artikel übernommen', {t2: `${r.neu} neu · ${r.upd} aktualisiert`, type: 'pos', icon: 'download'}); PAGES[id].render(); } catch (err) { toast('Import fehlgeschlagen', {t2: String(err), type: 'warn'}); }
      };
    }
  }});
  VIEW_PERM[id] = 'einkauf';
}
ediCatPage('edi-katalogartikel', 'EAN und Katalogartikel', 'Alle Artikel aus den Preiskatalogen der Lieferanten – mit Zuordnung zu eigenen Artikeln', 'alle');
ediCatPage('edi-konflikte', 'Konflikte', 'EANs, die bereits einem anderen Artikel/Lieferanten gehören oder deren Preis abweicht', 'konflikte');
ediCatPage('edi-artikelimport', 'EDI Artikel-Import', 'Neue Artikel aus PRICAT anlegen – Varianten nach Farbe/Größe, Zuordnung von Warengruppe, Farbe und Größe über die EDI-Zuordnungstabellen', 'import');
registerPage('edi-importprotokoll', {title: 'Protokoll EDI-Artikel-Importe', sub: () => 'Übernommene Katalogartikel', render: async () => {
  const v = $('#view-edi-importprotokoll');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('history', 'Protokoll'); return; }
  let l = []; try { l = await invoke('audit_query', {q: null, prefix: 'edi.', before: null, limit: 500}); } catch { /* */ }
  v.innerHTML = `<div class="cv">${pageHead('Protokoll EDI-Artikel-Importe', 'Alle EDI-Ereignisse: Empfang, Verarbeitung, Artikel-Importe, Exporte')}<div class="card">${l.length ? `<table class="tbl" style="margin:0"><tbody>${l.map(e => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(e.ts))}</td><td><b>${esc(e.event)}</b></td><td style="font-size:12.5px">${esc(Object.entries(e.payload || {}).filter(([k]) => k !== 'artikel').map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · '))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:40px 20px"><h3>Noch keine Einträge</h3></div>'}</div></div>`;
}});

/* Verbindungs-Verwaltung */
registerPage('edi-verbindung', {title: 'Verbindungs-Verwaltung', sub: () => CFG['edi.import_dir'] ? 'Ordner eingestellt' : 'nicht eingerichtet', render: () => {
  const v = $('#view-edi-verbindung');
  v.innerHTML = `<div class="cv">${pageHead('Verbindungs-Verwaltung', 'Eigene GLN und Austauschordner – SFTP/AS2-Clearingstellen (z. B. über ein Sync-Tool) legen Dateien in den Eingangsordner und holen sie aus dem Ausgangsordner')}
    <div class="card">
      <div class="set-row"><div><div class="set-l">Eigene GLN (ILN)</div><div class="set-h">13-stellig – Absender in allen EDIFACT-Nachrichten</div></div><div class="set-c"><input class="input mono" data-edc="edi.gln" value="${esc(CFG['edi.gln'] || '')}" placeholder="9001234000001" style="max-width:200px"></div></div>
      <div class="set-row"><div><div class="set-l">Eingangsordner</div><div class="set-h">Hier eingehende Dateien (PRICAT, DESADV, INVOIC, ORDRSP); verarbeitete wandern nach „verarbeitet“</div></div><div class="set-c"><input class="input mono" data-edc="edi.import_dir" value="${esc(CFG['edi.import_dir'] || '')}" placeholder="C:\\EDI\\in" style="min-width:280px"><button class="btn btn-secondary btn-sm" data-edpick="edi.import_dir">${ic('folder', 'i-sm')}Wählen</button></div></div>
      <div class="set-row"><div><div class="set-l">Ausgangsordner</div><div class="set-h">Hierhin schreibt Kontor ORDERS, SLSRPT und INVRPT</div></div><div class="set-c"><input class="input mono" data-edc="edi.export_dir" value="${esc(CFG['edi.export_dir'] || '')}" placeholder="C:\\EDI\\out" style="min-width:280px"><button class="btn btn-secondary btn-sm" data-edpick="edi.export_dir">${ic('folder', 'i-sm')}Wählen</button></div></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-primary" data-edtest>${ic('check', 'i-sm')}Verbindung testen</button><button class="btn btn-secondary" data-goto="st-edianbindung">${ic('link', 'i-sm')}Anbindungen</button><button class="btn btn-secondary" data-goto="st-edilieferant">${ic('truck', 'i-sm')}Lieferanten EDI-Einstellungen</button><button class="btn btn-secondary" data-goto="st-edijob">${ic('clock', 'i-sm')}Hintergrundjobs</button></div><div data-edtr style="margin-top:12px"></div></div>`;
  v.onchange = async e => { const k = e.target.dataset.edc; if (k) await saveSettings({[k]: e.target.value.trim()}); };
  v.onclick = async e => {
    const p = e.target.closest('[data-edpick]'); if (p) { try { const d = await invoke('pick_folder'); if (d) { await saveSettings({[p.dataset.edpick]: d}); PAGES['edi-verbindung'].render(); } } catch (err) { toast('Ordnerwahl nicht möglich', {t2: String(err), type: 'warn'}); } return; }
    if (e.target.closest('[data-edtest]')) { const box = $('[data-edtr]', v); try { const a = await invoke('edi_files', {which: 'import'}); const b = await invoke('edi_files', {which: 'export'}); box.innerHTML = `<div class="card" style="padding:14px;color:var(--pos)">${ic('check', 'i-sm')} Ordner erreichbar · ${a.length} Datei(en) im Eingang · ${b.length} im Ausgang</div>`; } catch (err) { box.innerHTML = `<div class="card" style="padding:14px;color:var(--neg)">${ic('alert', 'i-sm')} ${esc(String(err))}</div>`; } }
  };
}});
VIEW_PERM['edi-verbindung'] = 'einstellungen';

function ediShow(d) {
  const p = d.data?.parsed || {};
  const el = openLayer(`<div class="drawer-panel" style="width:min(820px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('swap')}</div><div><h2>${esc(d.no)} · ${esc(p.typ || '')} ${esc(ED_TYP[p.typ] || '')}</h2><p>${esc(d.partner_name || '')} · ${esc(d.ref || '')}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="drawer-body" style="display:grid;gap:12px;align-content:start">${kpiCards([[esc(p.nr || '–'), 'Belegnummer'], [esc(p.bestellung || '–'), 'Bestellung'], [p.datum ? dDate(p.datum) : '–', 'Datum'], [num((p.positionen || []).length), 'Positionen']])}
      <div class="card" style="overflow:auto;max-height:340px"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:14px">EAN</th><th>Bezeichnung</th><th>Farbe/Größe</th><th class="r">Menge</th><th class="r" style="padding-right:14px">EK/VK</th></tr></thead><tbody>${(p.positionen || []).slice(0, 500).map(x => `<tr><td style="padding-left:14px" class="mono">${esc(x.ean)}</td><td>${esc(x.name || findEan(x.ean)?.a.name || '–')}</td><td>${esc([x.farbe, x.groesse].filter(Boolean).join(' / ') || '–')}</td><td class="r num">${num(x.menge || 0)}</td><td class="r num" style="padding-right:14px">${[x.ek, x.vk].filter(y => y != null).map(eur).join(' / ') || '–'}</td></tr>`).join('')}</tbody></table></div>
      <details><summary style="cursor:pointer;font-size:13px">Rohdaten</summary><pre class="mono" style="white-space:pre-wrap;font-size:11.5px;max-height:300px;overflow:auto;background:var(--surface-2);padding:10px;border-radius:8px">${esc(String(d.data?.inhalt || '').slice(0, 20000))}</pre></details></div></div>`, {cls: 'drawer'});
  return el;
}
function bindEdi() {
  document.addEventListener('click', async e => {
    if (!e.target.closest('#views')) return;
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.edimp != null) { const n = await ediImportFolder(false); if (!n) toast('Keine neuen Dateien', {t2: CFG['edi.import_dir'] || 'Eingangsordner unter EDI › Verbindungs-Verwaltung einstellen', icon: 'swap'}); return docRefresh(); }
      if (b.dataset.edshow) return ediShow(await invoke('doc_get', {id: +b.dataset.edshow}));
      if (b.dataset.edproc) { await loadPurchasing(); await loadSuppliers(); const d = await invoke('doc_get', {id: +b.dataset.edproc}); try { const r = await ediProcess(d); toast('Verarbeitet', {t2: r, type: 'pos', icon: 'check'}); } catch (err) { await invoke('doc_action', {id: d.id, action: 'fehler', payload: {grund: String(err).slice(0, 300)}, user: S.user.name}).catch(() => {}); toast('Nicht verarbeitet', {t2: String(err), type: 'warn', dur: 8000}); } EDI.docs = null; return docRefresh(); }
      if (b.dataset.edign) { await invoke('doc_action', {id: +b.dataset.edign, action: 'ignorieren', payload: {}, user: S.user.name}); EDI.docs = null; return docRefresh(); }
      if (b.dataset.edord) { await loadPurchasing(); const po = EK.pos.find(p => p.id === +b.dataset.edord); if (!supGln(po.supplier_id) && !await confirmBox(`Für ${po.supplier} ist keine GLN hinterlegt. Trotzdem erstellen?`)) return; await ediOrders(po); return docRefresh(); }
      if (b.dataset.edsls) { await ediSlsrpt(b.dataset.edsls); return docRefresh(); }
      if (b.dataset.edinv != null) { await ediInvrpt(b.dataset.edinv || null); return docRefresh(); }
    } catch (err) { toast('EDI-Fehler', {t2: String(err), type: 'warn', dur: 8000}); }
  });
  const ediFiles = async files => {
    let n = 0; await loadSuppliers(); await loadStamm();
    for (const file of files) { try { await ediCreate(file.name, await file.text()); n++; } catch (err) { toast(file.name, {t2: String(err), type: 'warn'}); } }
    EDI.docs = null; toast(`${n} Datei${n === 1 ? '' : 'en'} eingelesen`, {type: 'pos', icon: 'download'}); docRefresh();
  };
  document.addEventListener('change', e => { const f = e.target.closest('[data-edfile]'); if (f) ediFiles([...f.files]); });
  fileDrop($('#view-edi-nachrichten'), {multiple: true, hint: 'EDI-Dateien hier ablegen', onFiles: ediFiles});
}

/* ════════ Webshop ════════ */
DK.webbestellung = {t: 'Webshop-Bestellungen', one: 'Webshop-Bestellung', ic: 'globe', page: 'webshop-bestellungen', perm: 'faktura', partner: 'kunde', optPartner: true, price: 'vk', lines: true, print: 'Lieferschein',
  sub: 'Bestellungen aus dem Webshop (REST-API POST /api/v1/webshop/bestellungen) – kommissionieren, versenden (bucht aus), abschließen',
  head: [{k: 'ref', l: 'Shop-Bestellnummer'}, {k: 'data.shop', l: 'Shop'}, {k: 'data.zahlung', l: 'Zahlung'}, {k: 'data.versandart', l: 'Versandart', t: 'select', o: ['Standard', 'Express', 'Abholung in der Filiale']}, {k: 'data.lieferadresse', l: 'Lieferadresse', t: 'area', full: true}, {k: 'data.notiz', l: 'Notiz', full: true}],
  acts: {neu: [['bearbeiten', 'In Bearbeitung', 'primary'], ['versenden', 'Versenden (bucht aus)', '', {ask: [{k: 'tracking', l: 'Sendungsnummer'}, {k: 'spediteur', l: 'Spediteur', t: 'select', o: ['Österreichische Post', 'DPD', 'GLS', 'DHL', 'Abholung']}]}], ['stornieren', 'Stornieren', 'danger']],
    in_bearbeitung: [['versenden', 'Versenden (bucht aus)', 'primary', {ask: [{k: 'tracking', l: 'Sendungsnummer'}, {k: 'spediteur', l: 'Spediteur', t: 'select', o: ['Österreichische Post', 'DPD', 'GLS', 'DHL', 'Abholung']}]}], ['stornieren', 'Stornieren', 'danger']], versendet: [['abschliessen', 'Abschließen', 'primary']]}};
docPage('webshop-bestellungen', 'webbestellung', {newLabel: 'Bestellung erfassen', tabs: [['offen', 'Offen', s => ['neu', 'in_bearbeitung'].includes(s)], ['versendet', 'Versendet', s => s === 'versendet'], ['alle', 'Alle', () => true]],
  kpi: l => [[num(l.filter(d => d.status === 'neu').length), 'neu', 'warn'], [num(l.filter(d => d.status === 'in_bearbeitung').length), 'in Bearbeitung'], [num(l.filter(d => d.status === 'versendet').length), 'versendet'], [eur0(l.filter(d => d.status !== 'storniert').reduce((s, d) => s + d.total, 0) / 100), 'Bestellwert']],
  cols: [{l: 'Shop', f: d => esc(d.data?.shop || '–')}, {l: 'Versand', f: d => esc(d.data?.versand?.tracking || d.data?.versandart || '–')}]});

registerPage('webshop-suche', {title: 'Webshop-Service-Suche', sub: () => 'So sieht der Webshop den Artikel', render: () => {
  const v = $('#view-webshop-suche'), q = WSS.q, n = norm(q);
  const hidden = new Set(CFG['shop.ausgeblendet'] || []), cats = CFG['shop.kategorien'] || [];
  const hits = n ? ART.filter(a => a.hay.includes(n) || a.variants.some(x => x.ean === q.trim())).slice(0, 30) : [];
  v.innerHTML = `<div class="cv">${pageHead('Webshop-Service-Suche', 'Artikel so prüfen, wie die Webshop-Schnittstelle sie ausliefert: sichtbar, Preis, Bestand je Filiale')}
    <label class="search-field" style="height:48px;margin-bottom:14px">${ic('search')}<input data-wsq value="${esc(q)}" placeholder="Artikel, Marke, Nummer oder EAN …" autocomplete="off"></label>
    ${hits.map(a => { const why = hidden.has(a.id) ? 'ausgeblendet (Filter/Schaufenster)' : cats.length && !cats.includes(a.cat) ? 'Warengruppe nicht freigegeben' : ''; return `<div class="card" style="padding:14px 16px;margin-bottom:10px"><div style="display:flex;gap:12px;align-items:center"><div style="flex:1"><b>${esc(a.name)}</b> <span class="muted">${esc(a.brand)} · ${esc(a.id)} · ${esc(catName(a.cat))}</span></div><b>${eur(a.sale || a.price)}</b>${why ? `<span class="pill neg" style="height:22px">${esc(why)}</span>` : '<span class="pill pos" style="height:22px">im Webshop</span>'}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${a.variants.map(x => `<span class="chip" style="height:26px">${esc(vname(x))} · <b style="margin-left:4px;color:${x.q > 0 ? 'var(--pos)' : 'var(--neg)'}">${x.q}</b>${x.other ? `<span class="muted" style="margin-left:4px">+${x.other.reduce((s, y) => s + y, 0)}</span>` : ''}</span>`).join('')}</div></div>`; }).join('') || `<div class="card"><div class="empty" style="padding:40px 20px"><div class="empty-icon">${ic('globe')}</div><h3>Artikel suchen</h3></div></div>`}</div>`;
  const i = $('[data-wsq]', v); i.oninput = () => { WSS.q = i.value; clearTimeout(i._t); i._t = setTimeout(() => { PAGES['webshop-suche'].render(); const x = $('[data-wsq]'); x?.focus(); x?.setSelectionRange(x.value.length, x.value.length); }, 250); };
}});
const WSS = {q: ''};

function apiLogPage(id, title, sub, filter) {
  registerPage(id, {title, sub: () => sub.split(' – ')[0], render: async () => {
    const v = $('#view-' + id);
    if (!DESKTOP) { v.innerHTML = desktopEmpty('history', title); return; }
    let l = []; try { l = (await invoke('api_log_list', {limit: 5000})).filter(filter); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:16px">${esc(String(e))}</div></div>`; return; }
    v.innerHTML = `<div class="cv">${pageHead(title, sub)}${kpiCards([[num(l.length), 'Zugriffe'], [num(l.filter(x => x.status >= 400).length), 'Fehler', 'neg'], [num(new Set(l.map(x => x.ip)).size), 'Absender']])}
      <div class="card" style="overflow:auto">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Methode</th><th>Pfad</th><th>Status</th><th>Absender</th><th style="padding-right:16px">Schlüssel</th></tr></thead><tbody>${l.slice(0, 1000).map(x => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(x.ts))}</td><td><b>${esc(x.method)}</b></td><td class="mono" style="font-size:12px">${esc(x.path)}</td><td><span class="pill ${x.status >= 400 ? 'neg' : 'pos'}" style="height:20px">${x.status}</span></td><td class="mono" style="font-size:12px">${esc(x.ip || '–')}</td><td style="padding-right:16px">${esc(x.key || '–')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:40px 20px"><h3>Keine Zugriffe protokolliert</h3><p>Die REST-API protokolliert jeden Aufruf mit Schlüssel und Absender.</p></div>'}</div></div>`;
  }});
  VIEW_PERM[id] = 'einstellungen';
}
apiLogPage('webshop-abfragelog', 'Abfragelog', 'Alle Zugriffe des Webshops auf die Schnittstelle', x => /webshop|artikel|bestand/.test(x.path));
apiLogPage('webshop-importfehler', 'Order-Import-Fehler', 'Abgelehnte Bestellungen aus dem Webshop – z. B. unbekannte EAN oder fehlende Rechte des Schlüssels', x => x.path.includes('webshop') && x.status >= 400);
apiLogPage('api-protokoll', 'Protokoll externe API Zugriffe', 'Jeder Aufruf der REST-API mit Zeit, Pfad, Status, Absender und verwendetem Schlüssel', () => true);

/* Webshop-Filter anwenden: blendet Artikel im Schaufenster aus */
async function applyWebFilter() {
  const rules = stActive('webfilter'), ids = ART.filter(a => rules.some(r => r.feld === 'brand' ? norm(a.brand) === norm(r.wert) : r.feld === 'cat' ? a.cat === r.wert : r.feld === 'id' ? a.id === r.wert : r.feld === 'minbestand' ? a.variants.reduce((s, x) => s + x.q, 0) < (+r.wert || 0) : false)).map(a => a.id);
  const old = new Set(CFG['shop.filter_ids'] || []), hand = (CFG['shop.ausgeblendet'] || []).filter(x => !old.has(x));
  await saveSettings({'shop.ausgeblendet': [...new Set([...hand, ...ids])], 'shop.filter_ids': ids}, true);
  return ids.length;
}
{ const _rs2 = renderStamm; renderStamm = async function (kind, page, extra = {}) {
  if (kind === 'webfilter' && !extra.above) extra = {...extra, above: () => `<div class="card" style="padding:12px 16px;margin-bottom:12px;display:flex;gap:10px;align-items:center">${ic('info', 'i-sm')}<span style="flex:1;font-size:13px">Nach dem Speichern „Filter anwenden“ – passende Artikel werden im Schaufenster/Webshop ausgeblendet (aktuell ${(CFG['shop.filter_ids'] || []).length}).</span><button class="btn btn-secondary btn-sm" data-wfapply>${ic('filter', 'i-sm')}Filter anwenden</button></div>`};
  return _rs2(kind, page, extra);
}; }
document.addEventListener('click', async e => { if (!e.target.closest('[data-wfapply]')) return; const n = await applyWebFilter(); toast(`${n} Artikel ausgeblendet`, {t2: 'Schaufenster und Webshop-Schnittstelle', type: 'pos', icon: 'filter'}); STE.webfilter = null; renderStamm('webfilter', 'st-webfilter'); });

registerPage('webshop-einstellungen', {title: 'Einstellungen Webshop', sub: () => 'Schnittstelle für externe Shops', render: async () => {
  const v = $('#view-webshop-einstellungen');
  let st = null; if (DESKTOP) { try { st = await invoke('api_status'); } catch { /* */ } }
  const ex = JSON.stringify({nr: 'SHOP-10023', shop: 'Shopify', kunde: {name: 'Anna Berger', email: 'anna@example.at', telefon: '+43 664 1234567', adresse: 'Dorfstraße 1, 6580 St. Anton'}, positionen: [{ean: ART[0]?.variants[0]?.ean || '2000000000015', menge: 1, preis: 449.0, ust: 20}], versand: 5.9, zahlung: 'Kreditkarte (bezahlt)'}, null, 2);
  v.innerHTML = `<div class="cv">${pageHead('Einstellungen Webshop', 'Externe Shops (Shopify, WooCommerce, Shopware …) übergeben Bestellungen an Kontor und lesen Artikel/Bestand über die REST-API', `<button class="btn btn-primary" data-goto="anpassen">${ic('braces', 'i-sm')}API & Schlüssel</button>`)}
    ${kpiCards([[st?.running ? 'aktiv' : 'aus', 'REST-API', st?.running ? 'pos' : 'warn'], [num((st?.keys || []).length), 'API-Schlüssel'], [CFG['shop.aktiv'] ? 'online' : 'aus', 'Digitales Schaufenster']])}
    <div class="card" style="padding:16px;margin-bottom:14px"><h3 style="margin:0 0 8px">Bestellungen empfangen</h3><p style="margin:0 0 10px;font-size:13.5px">Der Shop sendet <code>POST /api/v1/webshop/bestellungen</code> mit Schlüssel (Bereich <code>schreiben</code>) als <code>Authorization: Bearer …</code>. Kontor legt eine Webshop-Bestellung an (Status „neu“), prüft die EAN und meldet Fehler mit HTTP 400 – sichtbar unter „Order-Import-Fehler“. Status abfragen: <code>GET /api/v1/webshop/bestellungen?status=versendet</code> (inkl. Sendungsnummer).</p>
      <pre class="mono" style="white-space:pre-wrap;font-size:12px;margin:0;background:var(--surface-2);padding:12px;border-radius:10px">${esc(ex)}</pre></div>
    <div class="card" style="padding:16px;margin-bottom:14px"><h3 style="margin:0 0 8px">Artikel und Bestand liefern</h3><p style="margin:0;font-size:13.5px"><code>GET /api/v1/artikel</code> und <code>GET /api/v1/bestand</code> (Bereich <code>lesen</code>). Ausgeblendete Artikel und nicht freigegebene Warengruppen legen Sie unter Artikel-Filter, Webshop-Kategorie und im Digitalen Schaufenster fest.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-secondary" data-wstest>${ic('plus', 'i-sm')}Testbestellung anlegen</button><button class="btn btn-secondary" data-goto="st-webkategorie">${ic('folder', 'i-sm')}Webshop-Kategorien</button><button class="btn btn-secondary" data-goto="st-webversand">${ic('truck', 'i-sm')}Versand</button><button class="btn btn-secondary" data-goto="st-webfiliale">${ic('store', 'i-sm')}Filialen</button><button class="btn btn-secondary" data-goto="schaufenster">${ic('store', 'i-sm')}Digitales Schaufenster</button></div></div>`;
  v.onclick = async e => {
    if (!e.target.closest('[data-wstest]')) return;
    const a = ART.find(x => x.variants.some(y => y.q > 0)); if (!a) return toast('Kein Artikel mit Bestand', {type: 'warn'});
    const x = a.variants.find(y => y.q > 0);
    try { const d = await invoke('doc_save', {doc: {kind: 'webbestellung', partner: null, partner_name: 'Testkunde Webshop', ref: 'TEST-' + Date.now().toString(36).toUpperCase(), data: {shop: 'Test', zahlung: 'Test', lines: [newLine(DK.webbestellung, a, x, 1)], lieferadresse: 'Teststraße 1, 6020 Innsbruck'}}, user: S.user.name}); toast('Testbestellung angelegt', {t2: d.no, type: 'pos', icon: 'globe'}); go('webshop-bestellungen'); } catch (err) { toast('Nicht angelegt', {t2: String(err), type: 'warn'}); }
  };
}});
VIEW_PERM['webshop-einstellungen'] = 'einstellungen'; VIEW_PERM['webshop-suche'] = 'artikel.bearbeiten';
