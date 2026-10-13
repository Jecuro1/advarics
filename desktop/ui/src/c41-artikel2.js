
/* ════════════════════════════════════════════════════════════════════
   51 · ARTIKEL KOMPLETT — mehrteilige Artikelmaske (Beschreibung,
   Material & Pflege, Maße & Technik, Klassifikation & Zoll, Bilder-
   galerie, Web & Dokumente), Übernahme von Produktseiten, FEDAS-Sync
   (Verbindung, täglicher Abgleich, Datei-Import, Protokoll, Klassi-
   fikation) und das Marken-Demosortiment.
   ════════════════════════════════════════════════════════════════════ */
Object.assign(DEFAULTS, {'fedas.quelle': '', 'fedas.url': '', 'fedas.auth': 'basic', 'fedas.user': '', 'fedas.pass': '', 'fedas.header': '', 'fedas.pfad_hersteller': '/manufacturers', 'fedas.pfad_artikel': '/manufacturers/{id}/items', 'fedas.seit_parameter': 'modifiedSince', 'fedas.seitengroesse': 0,
  'fedas.hersteller': [], 'fedas.auto': false, 'fedas.zeit': '03:30', 'fedas.preise': true, 'fedas.letzter_abgleich': '', 'fedas.letztes_ergebnis': null});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });
STAMM_DEF.fedasklasse = {t: 'FEDAS-Klassifikation', ic: 'list', sub: 'Zuordnung des sechsstelligen FEDAS-Produktschlüssels zu Ihren Warengruppen – neue Artikel aus dem FEDAS-Sync landen so in der richtigen Gruppe', cols: [{k: 'name', l: 'Bezeichnung'}, {k: 'warengruppe', l: 'Warengruppe', t: 'select', o: catOpts}, {k: 'zolltarif', l: 'Zolltarifnummer (optional)', w: 150}]};
stammPage('fedasklasse', 'st-fedasklasse'); VIEW_PERM['st-fedasklasse'] = 'artikel.bearbeiten';

/* ── Schema der Artikel-Details ── */
const D_ZIEL = ['Herren', 'Damen', 'Unisex', 'Kinder', 'Junior'];
const DET_TABS = [['stamm', 'Stammdaten', 'tag'], ['beschreibung', 'Beschreibung', 'edit'], ['material', 'Material & Pflege', 'layers'], ['technik', 'Maße & Technik', 'sliders'], ['klass', 'Klassifikation & Zoll', 'globe'], ['bilder', 'Bilder', 'image'], ['web', 'Web & Dokumente', 'store'], ['varianten', 'Farben & Größen', 'grid']];
const DET = {
  beschreibung: [
    {t: 'Produkt', f: [{k: 'kurztext', l: 'Kurztext', w: 'full', ph: 'Ein Satz, der das Produkt beschreibt'}, {k: 'beschreibung', l: 'Beschreibung', t: 'area', rows: 8, w: 'full'}, {k: 'features', l: 'Produktmerkmale (eine Zeile je Merkmal)', t: 'lines', rows: 6, w: 'full'}, {k: 'technologien', l: 'Technologien (z. B. GORE-TEX, PrimaLoft)', t: 'lines', rows: 3, w: 'full'}]},
    {t: 'Einordnung', f: [{k: 'zielgruppe', l: 'Zielgruppe', t: 'select', o: D_ZIEL}, {k: 'einsatz', l: 'Einsatzbereich (z. B. Skitour, Freeride, Trail)', t: 'lines', rows: 3}, {k: 'saison', l: 'Saison / Modelljahr', ph: 'z. B. HW 2025/26'}, {k: 'kollektion', l: 'Kollektion'}, {k: 'modellname', l: 'Modellname'}, {k: 'passform', l: 'Passform', t: 'select', o: ['Slim', 'Regular', 'Relaxed', 'Athletic', 'Weit']}, {k: 'farbbeschreibung', l: 'Farbbezeichnung des Herstellers'}]}],
  material: [
    {t: 'Material', f: [{k: 'mat_ober', l: 'Obermaterial / Außenmaterial'}, {k: 'mat_futter', l: 'Futter'}, {k: 'mat_fuellung', l: 'Füllung / Isolation'}, {k: 'mat_membran', l: 'Membran'}, {k: 'mat_sohle', l: 'Sohle / Laufsohle'}, {k: 'mat_zusammensetzung', l: 'Materialzusammensetzung (Textilkennzeichnung)', t: 'area', rows: 4, w: 'full', ph: 'z. B. 88 % Polyamid, 12 % Elastan'}]},
    {t: 'Pflege', f: [{k: 'pflege', l: 'Pflegehinweise (eine Zeile je Hinweis)', t: 'lines', rows: 5, w: 'full'}, {k: 'pflege_symbole', l: 'Pflegesymbole / Waschtemperatur', ph: 'z. B. 30 °C Schonwaschgang'}]},
    {t: 'Nachhaltigkeit', f: [{k: 'zertifikate', l: 'Zertifikate & Siegel (z. B. bluesign, RDS, Fair Wear)', t: 'lines', rows: 3}, {k: 'nachhaltigkeit', l: 'Nachhaltigkeit / Recyclinganteil', t: 'area', rows: 3, w: 'full'}, {k: 'pfc_frei', l: 'PFC-frei imprägniert', t: 'check'}, {k: 'recycelt', l: 'Recyclingmaterial enthalten', t: 'check'}]}],
  technik: [
    {t: 'Maße & Gewicht', f: [{k: 'gewicht_g', l: 'Gewicht (g)', t: 'num'}, {k: 'gewicht_hinweis', l: 'Gewichtsangabe gilt für', ph: 'z. B. Größe M / 1 Paar'}, {k: 'packmass', l: 'Packmaß', ph: 'cm'}, {k: 'laenge_cm', l: 'Länge (cm)', t: 'num'}, {k: 'volumen_l', l: 'Volumen (Liter)', t: 'num'}, {k: 'ruecken', l: 'Rückenlänge'}, {k: 'groessenhinweis', l: 'Größenhinweis / Größentabelle', t: 'area', rows: 4, w: 'full'}]},
    {t: 'Funktion', f: [{k: 'wassersaeule_mm', l: 'Wassersäule (mm)', t: 'num'}, {k: 'atmungsaktivitaet', l: 'Atmungsaktivität', ph: 'z. B. 20.000 g/m²/24h'}, {k: 'temperatur', l: 'Temperaturbereich / Komfort', ph: 'z. B. -5 bis 10 °C'}, {k: 'isolierung', l: 'Isolation / Füllgewicht'}, {k: 'uv_schutz', l: 'UV-Schutzfaktor'}]},
    {t: 'Schuhe', f: [{k: 'schafthoehe', l: 'Schafthöhe'}, {k: 'sprengung_mm', l: 'Sprengung (mm)', t: 'num'}, {k: 'sohle_typ', l: 'Sohlentyp / Profil'}, {k: 'leisten', l: 'Leisten / Weite'}, {k: 'flex', l: 'Flex-Index', t: 'num'}, {k: 'steigeisen', l: 'Steigeisenfest', t: 'select', o: ['nein', 'semi (B1)', 'ja (B2)', 'voll (B3)']}]},
    {t: 'Ski, Stöcke & Hartware', f: [{k: 'ski_laengen', l: 'Verfügbare Längen'}, {k: 'ski_radius_m', l: 'Radius (m)', t: 'num'}, {k: 'ski_maße', l: 'Maße Schaufel/Taille/Ferse (mm)', ph: '128-98-118'}, {k: 'ski_kern', l: 'Kern / Bauweise'}, {k: 'bindung_norm', l: 'Bindungsnorm / Sohlentyp', ph: 'z. B. ISO 5355'}, {k: 'stock_laenge', l: 'Stocklängen'}, {k: 'schutzklasse', l: 'Schutzklasse / Prüfnorm', ph: 'z. B. EN 1077'}]}],
  klass: [
    {t: 'Klassifikation', f: [{k: 'fedas_code', l: 'FEDAS-Produktschlüssel (6-stellig)', ph: '000000', pattern: /^\d{6}$/}, {k: 'hersteller_artikelnr', l: 'Hersteller-Artikelnummer'}, {k: 'modellnr', l: 'Modell- / Styleno.'}, {k: 'kategorie_hersteller', l: 'Kategorie laut Hersteller'}, {k: 'ean_basis', l: 'GTIN/EAN-Hinweis'}, {k: 'ek_waehrung', l: 'Einkaufswährung', t: 'select', o: ['EUR', 'CHF', 'USD', 'GBP']}]},
    {t: 'Zoll & Herkunft', f: [{k: 'zolltarif', l: 'Zolltarifnummer (KN8/HS)'}, {k: 'herkunft', l: 'Herkunftsland (Made in)'}, {k: 'praeferenz', l: 'Präferenzursprung', t: 'check'}, {k: 'gefahrgut', l: 'Gefahrgut / Versandhinweis', ph: 'z. B. Lawinenairbag-Kartusche'}]}],
  web: [
    {t: 'Webshop & Schaufenster', f: [{k: 'web_titel', l: 'Titel im Shop', w: 'full'}, {k: 'web_beschreibung', l: 'Text im Shop', t: 'area', rows: 6, w: 'full'}, {k: 'schlagwoerter', l: 'Schlagwörter (eine Zeile je Wort)', t: 'lines', rows: 3}, {k: 'web_sichtbar', l: 'Im Schaufenster/Webshop zeigen', t: 'check'}]},
    {t: 'Links & Dokumente', f: [{k: 'quelle_url', l: 'Produktseite des Herstellers', w: 'full'}, {k: 'dokumente', l: 'Dokumente & Links (eine Zeile: Titel | Adresse)', t: 'lines', rows: 4, w: 'full', ph: 'Bedienungsanleitung | https://…'}]}],
};
const detKeys = () => Object.values(DET).flatMap(g => g.flatMap(s => s.f.map(f => f.k)));
const detField = (f, v) => {
  const val = f.t === 'lines' ? (Array.isArray(v) ? v.join('\n') : v || '') : v ?? '';
  const cls = `field${f.w === 'full' ? ' full' : ''}`;
  if (f.t === 'area' || f.t === 'lines') return `<label class="${cls}"><span>${esc(f.l)}</span><textarea class="input" data-d="${f.k}" data-t="${f.t}" rows="${f.rows || 4}" style="height:auto;padding:9px 12px" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>${esc(val)}</textarea></label>`;
  if (f.t === 'select') return `<label class="${cls}"><span>${esc(f.l)}</span><select class="input select" data-d="${f.k}"><option value="">–</option>${f.o.map(o => `<option ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  if (f.t === 'check') return `<label class="${cls}" style="flex-direction:row;display:flex;align-items:center;gap:10px"><input type="checkbox" data-d="${f.k}" data-t="check" ${v ? 'checked' : ''}><span style="font-size:13px">${esc(f.l)}</span></label>`;
  return `<label class="${cls}"><span>${esc(f.l)}</span><input class="input ${f.t === 'num' ? 'num' : ''}" data-d="${f.k}" data-t="${f.t || 'text'}" value="${esc(val)}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}></label>`;
};
function readDetails(root) {
  const out = {};
  $$('[data-d]', root).forEach(i => {
    const k = i.dataset.d, t = i.dataset.t;
    if (t === 'check') { if (i.checked) out[k] = true; return; }
    const v = i.value.trim(); if (!v) return;
    out[k] = t === 'lines' ? v.split('\n').map(x => x.trim()).filter(Boolean) : v;
  });
  return out;
}
const detFilled = d => { const n = detKeys().filter(k => { const v = d?.[k]; return Array.isArray(v) ? v.length : !!v; }).length; return [n, detKeys().length]; };

/* ── Produktseite auslesen und in den Artikel übernehmen ── */
function ldProducts(ld) {
  const out = [];
  const walk = n => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); const t = [].concat(n['@type'] || []); if (t.includes('Product') || t.includes('ProductGroup')) out.push(n); if (n['@graph']) walk(n['@graph']); if (n.hasVariant) walk(n.hasVariant); };
  (ld || []).forEach(walk); return out;
}
const stripHtml = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
function pageToArticle(r) {
  const p = ldProducts(r.jsonld)[0] || {}, m = r.meta || {};
  const imgs = [];
  const addImg = x => { const u = typeof x === 'string' ? x : x?.url || x?.contentUrl; if (u && /^https?:/.test(u) && !imgs.includes(u)) imgs.push(u); };
  [].concat(p.image || []).forEach(addImg); (r.images || []).forEach(addImg);
  const offer = [].concat(p.offers || [])[0] || {}, price = offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price;
  const brand = typeof p.brand === 'string' ? p.brand : p.brand?.name;
  return {name: p.name || m['og:title'] || r.title || '', brand: brand || '', beschreibung: stripHtml(p.description || m['og:description'] || m.description || ''), sku: p.mpn || p.sku || '', price: price != null ? parseAmt(String(price)) : null,
    material: typeof p.material === 'string' ? p.material : p.material?.name || '', color: p.color || '', images: imgs.slice(0, 14), url: r.url, weight: p.weight?.value || ''};
}
function askUrl(title, label) {
  return new Promise(res => {
    const el = openLayer(`<div class="modal" style="width:min(560px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('globe')}</div><div><h2>${esc(title)}</h2><p>${esc(label)}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body"><textarea class="input" data-au rows="4" style="height:auto;padding:9px 12px" placeholder="https://…"></textarea></div><div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-auok>${ic('check', 'i-sm')}OK</button></div></div>`, {onClose: () => res(null), focus: '[data-au]'});
    $('[data-auok]', el).onclick = () => { const v = $('[data-au]', el).value.trim(); res(v); el._ok = true; closeLayer(el); };
  });
}

/* ── Artikel-Editor mit Reitern ── */
const edTabMem = {};
function artEditorMount(host, a, tab0) {
  const isNew = !a;
  const el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  const sale0 = a ? ('baseSale' in a ? a.baseSale : a.sale) : null;
  const st = a ? {id: a.id, name: a.name, brand: a.brand, cat: a.cat, g: a.g, price: num(a.price, 2), sale: sale0 ? num(sale0, 2) : '', vat: a.vat ?? 20, tag: a.tag || '', colors: [...a.colors], sizes: a.sizes.join(', '), fields: cfSplit('artikel', a.fields).free, cf: cfSplit('artikel', a.fields).typed, ski: !!a.prompts, pop: a.pop || 50, cost: a.cost != null ? num(a.cost, 2) : '', supplierId: a.supplierId || '', minStock: String(a.minStock ?? 2), d: JSON.parse(JSON.stringify(a.details || {}))}
    : {id: nextArtId(), name: '', brand: '', cat: AV.cat !== 'alle' ? AV.cat : 'jacken', g: 'jacket', price: '', sale: '', vat: 20, tag: '', colors: [], sizes: 'S, M, L, XL', fields: [], cf: {}, ski: false, pop: 50, cost: '', supplierId: '', minStock: '2', d: {}};
  if (isNew && typeof eaNeuArtikel === 'function') eaNeuArtikel(st);
  st.pending = [];     // Bildadressen, die nach dem ersten Speichern geladen werden
  let tab = tab0 || edTabMem.last || 'stamm';
  const ids = AE.ids || [], pos = a ? ids.indexOf(a.id) : -1;
  el.innerHTML = `<div class="ag-bar ae-bar"><button class="ag-btn" data-close>${ic('chevron-left', 'i-sm')}<span>Übersicht: Artikel</span></button><button class="ag-btn" id="edRefresh">${ic('sync', 'i-sm')}<span>Aktualisieren</span></button><button class="ag-btn" id="edSave">${ic('check', 'i-sm')}<span>Sichern</span></button><button class="ag-btn" id="edNew">${ic('plus', 'i-sm')}<span>Neu</span></button><button class="ag-btn" id="edUndo">${ic('undo', 'i-sm')}<span>Änderungen zurücknehmen</span></button>${isNew ? '' : `<button class="ag-btn" id="edDel">${ic('trash', 'i-sm')}<span>Löschen</span></button>`}<button class="ag-btn" id="edService">${ic('sliders', 'i-sm')}<span>Artikel-Service</span></button><span class="sp" style="flex:1"></span>${pos >= 0 ? `<span class="ae-nav"><button class="ag-btn" id="edPrev" ${pos <= 0 ? 'disabled' : ''}>${ic('chevron-left', 'i-sm')}</button><b>${pos + 1}/${ids.length}</b><button class="ag-btn" id="edNext" ${pos >= ids.length - 1 ? 'disabled' : ''}>${ic('chevron-right', 'i-sm')}</button></span>` : ''}</div>
    <div id="edHead"></div><div class="ae-tabsw"><div id="edTabs" class="ed-tabs"></div></div><div class="ae-body"><div id="edBody"></div></div>`;
  const edClose = () => go('artikel');
  const remount = (art, t) => artEditorMount(host, art, t);
  const collect = () => {
    $$('[data-f]', el).forEach(i => { st[i.dataset.f] = i.value; });
    if ($('.frow', el) || $('#edFields', el)) st.fields = $$('.frow', el).map(r => [$('[data-fk]', r).value.trim(), $('[data-fv]', r).value.trim()]);
    if ($('[data-cfobj="artikel"]', el)) st.cf = cfRead(el, 'artikel', true);
    if ($$('[data-d]', el).length) { const keep = {}; const here = new Set($$('[data-d]', el).map(i => i.dataset.d)); Object.entries(st.d).forEach(([k, v]) => { if (!here.has(k)) keep[k] = v; }); st.d = {...keep, ...readDetails(el)}; }
  };
  const sizesArr = () => [...new Set(String(st.sizes).split(',').map(s => s.trim()).filter(Boolean))];
  const ctx = {st, a, el, host, isNew, sizesArr, get tab() { return tab; }, rerender: () => { collect(); render(); }, setTab: t => { collect(); tab = t; render(); }, collect, card: null, cardFor: null};
  const liveA = () => (a && ART.find(x => x.id === a.id)) || a;
  const media = () => (liveA()?.media || []);
  const refreshMedia = async () => { if (!DESKTOP || !a) return; replaceCatalog(await invoke('catalog_list')); const fresh = ART.find(x => x.id === a.id); if (fresh) { a.media = fresh.media; a.image = fresh.image; } renderArtTable(); };
  const imgTile = (m, i, n) => {
    const u = m.file ? imgUrl(m.file) : null;
    return `<div class="card" style="padding:8px;display:grid;gap:6px;min-width:0" data-mid="${m.id}" ${dndAttr(m.id)}><div style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center">${u ? `<img src="${esc(u)}" alt="" draggable="false" style="width:100%;height:100%;object-fit:contain">` : `<span class="muted" style="font-size:12px;text-align:center;padding:8px">${m.status === 'fehler' ? 'Bild nicht ladbar' : 'lädt …'}</span>`}${i === 0 ? '<span class="pill accent" style="position:absolute;left:6px;top:6px;height:20px">Hauptbild</span>' : ''}</div>
      <select class="input select" data-mcol="${m.id}" style="height:30px;font-size:12px;width:100%;min-width:0"><option value="">alle Farben</option>${st.colors.map(c => `<option value="${esc(c)}" ${m.color === c ? 'selected' : ''}>${esc(colorName(c))}</option>`).join('')}</select>
      <input class="input" data-mcap="${m.id}" value="${esc(m.caption || '')}" placeholder="Beschriftung" style="height:30px;font-size:12px;width:100%;min-width:0">
      <div style="display:flex;gap:0;justify-content:space-between;min-width:0"><button class="btn btn-ghost btn-icon btn-sm" data-mmv="${m.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="nach vorn">${ic('chevron-left', 'i-sm')}</button><button class="btn btn-ghost btn-sm" data-mmain="${m.id}" ${i === 0 ? 'disabled' : ''}>${ic('star', 'i-sm')}Haupt</button><button class="btn btn-ghost btn-icon btn-sm" data-mdel="${m.id}" aria-label="Löschen">${ic('trash', 'i-sm')}</button><button class="btn btn-ghost btn-icon btn-sm" data-mmv="${m.id}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="nach hinten">${ic('chevron-right', 'i-sm')}</button></div></div>`;
  };
  const tabBody = () => {
    if (AE_GRID_TABS[tab]) return AE_GRID_TABS[tab](ctx);
    const c = COLORS[st.colors[0]]?.[1] || '#888';
    if (tab === 'stamm') {
      const catOpt = CATS.filter(x => x.id !== 'alle').map(x => `<option value="${esc(x.id)}" ${x.id === st.cat ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
      const tags = [['', 'keine'], ['Neu', 'Neu'], ['Bestseller', 'Bestseller'], ['Auslauf', 'Auslauf']].map(([v, l]) => `<option value="${esc(v)}" ${(st.tag || '') === v ? 'selected' : ''}>${l}</option>`).join('');
      const nVar = isNew ? st.colors.length * sizesArr().length : a.variants.length;
      return `<div class="ae-cards ae-form">
        <div class="ae-card"><h4>Artikel</h4>
          <label class="field"><span>Artikelnummer</span><input class="input" data-f="id" value="${esc(st.id)}" ${isNew ? '' : 'readonly style="opacity:.65"'}></label>
          <label class="field"><span>Bezeichnung *</span><input class="input" data-f="name" value="${esc(st.name)}" placeholder="z. B. Grat Hardshell Jacke"></label>
          <label class="field"><span>Marke</span><input class="input" data-f="brand" value="${esc(st.brand)}" list="brandList"></label><datalist id="brandList">${[...new Set(ART.map(x => x.brand).filter(Boolean))].map(b => `<option value="${esc(b)}">`).join('')}</datalist>
          <label class="field"><span>Warengruppe</span><select class="input select" data-f="cat">${catOpt}</select></label>
          <label class="field"><span>Kennzeichnung</span><select class="input select" data-f="tag">${tags}</select></label></div>
        <div class="ae-card"><h4>Preis</h4>
          <label class="field"><span>EK netto €</span><input class="input num" data-f="cost" inputmode="decimal" value="${esc(st.cost)}"></label>
          <label class="field"><span>VK (UVP) € *</span><input class="input num" data-f="price" inputmode="decimal" value="${esc(st.price)}"></label>
          <label class="field"><span>Aktionspreis €</span><input class="input num" data-f="sale" inputmode="decimal" value="${esc(st.sale)}" placeholder="leer = kein Aktionspreis"></label>
          <label class="field"><span>MwSt.-Typ</span><select class="input select" data-f="vat">${[[20, 'Standard 20 %'], [13, 'Reduziert 13 %'], [10, 'Reduziert 10 %'], [0, 'Ohne MwSt. 0 %']].map(([r, l]) => `<option value="${r}" ${+st.vat === r ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="muted" id="edMargin" style="font-size:12px"></div></div>
        <div class="ae-card"><h4>Lieferant & Bestand</h4>
          <label class="field"><span>Lieferant</span><select class="input select" data-f="supplierId"><option value="">–</option>${SUPPLIERS.map(x => `<option value="${esc(x.id)}" ${x.id === st.supplierId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Mindestbestand je Variante</span><input class="input num" data-f="minStock" inputmode="numeric" value="${esc(st.minStock)}"></label>
          <label class="field"><span>Darstellung (ohne Bild)</span><select class="input select" data-f="g">${GLYPHS.map(([k, l]) => `<option value="${k}" ${k === st.g ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <div class="ae-card"><h4>Übersicht</h4>
          <div class="ae-kv"><span>Varianten</span><b>${nVar}</b></div>
          <div class="ae-kv"><span>Bestand</span><b>${isNew ? '–' : num(a.stock)}</b></div>
          <div class="ae-kv"><span>Farben</span><b>${st.colors.length}</b></div>
          <div class="ae-kv"><span>Produktdaten</span><b>${detFilled(st.d)[0]} / ${detFilled(st.d)[1]}</b></div></div>
        <div class="ae-card"><h4>Webshop</h4>
          <label class="ae-sw2"><input type="checkbox" data-d="web_sichtbar" data-t="check" ${st.d.web_sichtbar ? 'checked' : ''}><span>Im Webshop und Schaufenster anzeigen</span></label></div>
        <div class="ae-card"><h4>Werkzeuge</h4><div style="display:grid;gap:8px"><button type="button" class="btn btn-secondary btn-sm" id="edPage">${ic('globe', 'i-sm')}Aus Produktseite übernehmen …</button>${DESKTOP ? `<button type="button" class="btn btn-secondary btn-sm" id="edAi">${ic('sparkle', 'i-sm')}Beschreibung mit KI</button>` : ''}${a ? `<button type="button" class="btn btn-secondary btn-sm" id="edLbl">${ic('tag', 'i-sm')}Etiketten</button>` : ''}</div></div></div>`;
    }
    if (tab === 'bilder') {
      if (!DESKTOP) return '<div class="empty" style="padding:40px"><h3>Bilder nur in der Desktop-App</h3></div>';
      const ms = media(), pend = st.pending;
      return `<div class="ed-sec"><div class="lab">Bildergalerie <span class="muted">${ms.length} Bild${ms.length === 1 ? '' : 'er'} · das erste ist das Hauptbild (Kasse, Listen, Schaufenster) · JPEG, PNG oder WebP, wird verkleinert gespeichert</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button type="button" class="btn btn-primary btn-sm" id="gAdd">${ic('plus', 'i-sm')}Bilder wählen …</button><button type="button" class="btn btn-secondary btn-sm" id="gUrl">${ic('globe', 'i-sm')}Von Webadresse laden …</button><button type="button" class="btn btn-secondary btn-sm" id="edPage">${ic('download', 'i-sm')}Alle Bilder einer Produktseite …</button></div>
        ${!a ? `<div class="prompt-hint">${ic('info', 'i-xs')}Der Artikel wird mit „Speichern“ angelegt – danach können Bilder gewählt werden${pend.length ? ` (${pend.length} Adresse${pend.length === 1 ? '' : 'n'} vorgemerkt)` : ''}.</div>` : ms.length ? `<div id="gGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;min-width:0">${ms.map((m, i) => imgTile(m, i, ms.length)).join('')}</div>` : '<div class="empty" style="padding:36px 20px"><div class="empty-icon">' + ic('image') + '</div><h3>Noch keine Bilder</h3><p>Mehrere Ansichten je Farbe hinzufügen – Vorderseite, Rückseite, Detail, Modell.</p></div>'}</div>`;
    }
    if (tab === 'varianten') return `<div class="ed-sec"><div class="lab">Farben <span class="muted">Reihenfolge = Anzeige · erste Farbe = Kachelbild · neue Farben unter Stammdaten › Hausfarben</span></div><div class="cpick">${Object.keys(COLORS).map(k => { const i = st.colors.indexOf(k); return `<button type="button" data-col="${k}" ${i >= 0 ? dndAttr(k) : ''} aria-pressed="${i >= 0}" style="--sw:${COLORS[k][1]}"><i></i>${esc(COLORS[k][0])}${i >= 0 ? `<span class="ord">${i + 1}</span>` : ''}</button>`; }).join('')}</div></div>
      <div class="ed-sec"><div class="lab">Größen <span class="muted">durch Komma getrennt</span></div><input class="input" data-f="sizes" value="${esc(st.sizes)}"><div class="reasons" style="margin-top:8px">${SIZE_PRESETS.map(([l, val]) => `<button type="button" class="chip" data-sz="${esc(val)}">${l}</button>`).join('')}${stActive('groessenschluessel').map(g => `<button type="button" class="chip" data-sz="${esc((g.groessen || []).join(', '))}">${esc(g.name)}</button>`).join('')}</div>
        <div class="prompt-hint">${ic('info', 'i-xs')}${st.colors.length * sizesArr().length} Varianten · EAN werden automatisch vergeben, bestehende bleiben erhalten · neue Varianten starten mit Bestand 0</div></div>
      ${cfHTML('artikel', st.cf, true, 'Felder')}
      <div class="ed-sec"><div class="lab">${cfDefs('artikel').length ? 'Weitere Angaben' : 'Eigene Felder'} <button type="button" class="btn btn-ghost btn-sm" id="edAddF">${ic('plus', 'i-sm')}Feld</button></div>
        <div id="edFields">${st.fields.map(([k, val]) => `<div class="frow"><input class="input" data-fk value="${esc(k)}" placeholder="Feld, z. B. Lagerplatz"><input class="input" data-fv value="${esc(val)}" placeholder="Wert"><button type="button" class="btn btn-ghost btn-icon" data-rmf aria-label="Feld entfernen">${ic('x', 'i-sm')}</button></div>`).join('') || '<div class="muted" style="font-size:12.5px">Noch keine eigenen Felder.</div>'}</div></div>
      <div class="ed-sec"><div class="set-row" style="padding:12px 14px;border:1px solid var(--line);border-radius:12px"><div><div class="set-l">Kassen-Pflichtfelder „Skiverkauf“</div><div class="set-h">Z-Wert Bindung (Pflicht) und Seriennummer beim Verkauf abfragen</div></div><div class="set-c" style="min-width:0"><button type="button" class="switch" role="switch" id="edSki" aria-checked="${st.ski}" aria-label="Kassen-Pflichtfelder"></button></div></div></div>`;
    const groups = DET[tab] || [];
    const fedasName = st.d.fedas_code ? stName('fedasklasse', st.d.fedas_code) : '';
    return groups.map(g => `<div class="ed-sec"><div class="lab">${esc(g.t)}</div><div class="ed-grid">${g.f.map(f => detField(f, st.d[f.k])).join('')}</div>${tab === 'klass' && g.t === 'Klassifikation' && st.d.fedas_code ? `<div class="prompt-hint">${ic('info', 'i-xs')}${fedasName && fedasName !== st.d.fedas_code ? `FEDAS ${esc(st.d.fedas_code)} = ${esc(fedasName)}` : 'Schlüssel noch keiner Warengruppe zugeordnet (FEDAS › Klassifikation)'}</div>` : ''}</div>`).join('');
  };
  const render = () => {
    const c = COLORS[st.colors[0]]?.[1] || '#888', sizes = sizesArr();
    $('#edHead', el).innerHTML = `<div class="m-head" style="padding-bottom:10px"><span class="thumb" style="--c:${c};width:46px;height:46px;border-radius:12px">${a ? artVisual(liveA(), c) : glyph(st.g, c)}</span><div><h2>${isNew ? 'Neuer Artikel' : esc(st.name)}</h2><p>${esc(st.id)}${st.brand ? ' · ' + esc(st.brand) : ''} · ${st.colors.length * sizes.length} Varianten${isNew ? '' : ` · Bestand ${num(a.stock)}`}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>`;
    $('#edTabs', el).innerHTML = AE_TABS.map(([k, l]) => `<button type="button" class="ed-tab" data-tab="${k}" aria-selected="${k === tab}">${esc(l)}${k === 'bilder' && media().length ? `<span class="nav-badge">${media().length}</span>` : ''}</button>`).join('');
    $('#edBody', el).innerHTML = tabBody();
    aeAfter(ctx, tab);
    // Bilder und Farben per Ziehen anordnen (erstes Bild = Hauptbild, erste Farbe = Kachelbild)
    dndZone($('#gGrid', el), 'galerie', {axis: 'x', ghost: 'clone', hint: '', reorder: async (ids, ins) => {
      const items = dndArrange(media().map(m => ({id: m.id, color: m.color, caption: m.caption})), ids, ins, x => x.id);
      await invoke('article_media_update', {id: a.id, items}); await refreshMedia(); render();
    }});
    fileDrop($('#edBody', el), {accept: /\.(jpe?g|png|webp)$/i, multiple: true, hint: 'Bilder hier ablegen', enabled: () => tab === 'bilder' && !!a && DESKTOP, onFiles: async files => {
      const big = files.filter(f => f.size > 15 * 1024 * 1024); if (big.length) toast('Bild zu groß', {t2: `${big.map(f => f.name).join(', ')} – höchstens 15 MB`, type: 'warn'});
      const ok = files.filter(f => f.size <= 15 * 1024 * 1024); if (!ok.length) return;
      collect();
      const data = await Promise.all(ok.map(f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error(f.name + ' nicht lesbar')); r.readAsDataURL(f); })));
      const rr = await invoke('article_media_add_data', {id: a.id, color: null, files: data}); await refreshMedia(); render();
      toast(`${rr.ok} Bild${rr.ok === 1 ? '' : 'er'} hinzugefügt`, {t2: rr.fehler[0] || '', type: rr.fehler.length ? 'warn' : 'pos', icon: 'image'});
    }});
    dndZone($('.cpick', el), 'farben', {axis: 'x', ghost: 'clone', reorder: (ids, ins) => { collect(); st.colors = dndArrange(st.colors, ids, ins); render(); }});
    $('#edTabs .ed-tab[aria-selected="true"]', el)?.scrollIntoView({block: 'nearest', inline: 'center'});
    edTabMem.last = tab;
  };
  const saveMediaOrder = async () => { const items = $$('[data-mid]', el).map(t => ({id: +t.dataset.mid, color: $('[data-mcol]', t).value, caption: $('[data-mcap]', t).value})); await invoke('article_media_update', {id: a.id, items}); };
  const reorder = async (id, mover) => {
    const items = media().map(m => ({id: m.id, color: m.color, caption: m.caption})), i = items.findIndex(x => x.id === id); if (i < 0) return;
    mover(items, i); await invoke('article_media_update', {id: a.id, items}); await refreshMedia(); render();
  };
  el.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-close]')) return edClose();
    if (t.closest('#edNew')) { AE.ids = []; return remount(null, 'stamm'); }
    if (t.closest('#edUndo')) { return remount(a ? ART.find(x => x.id === a.id) || a : null, tab); }
    if (t.closest('#edRefresh')) { try { if (DESKTOP) replaceCatalog(await invoke('catalog_list')); } catch { /* */ } return remount(a ? ART.find(x => x.id === a.id) || a : null, tab); }
    const nv = t.closest('#edPrev, #edNext'); if (nv && !nv.disabled) { const id = (AE.ids || [])[pos + (nv.id === 'edNext' ? 1 : -1)]; const nx = id && ART.find(x => x.id === id); if (nx) return remount(nx, tab); return; }
    if (t.closest('#edService')) { collect(); return aeService(ctx, t.closest('#edService')); }
    const gi = t.closest('[data-mid] img'); if (gi) { const ms = media().filter(m => m.file).map(m => ({url: imgUrl(m.file), caption: m.caption || ''})); const idx = media().filter(m => m.file).findIndex(m => String(m.id) === gi.closest('[data-mid]').dataset.mid); openImageViewer(ms, Math.max(0, idx), st.name); return; }
    const tb = t.closest('[data-tab]'); if (tb) { collect(); tab = tb.dataset.tab; return render(); }
    const col = t.closest('[data-col]'); if (col) { collect(); const k = col.dataset.col, i = st.colors.indexOf(k); i >= 0 ? st.colors.splice(i, 1) : st.colors.push(k); return render(); }
    const sz = t.closest('[data-sz]'); if (sz) { collect(); st.sizes = sz.dataset.sz; return render(); }
    if (t.closest('#edAddF')) { collect(); st.fields.push(['', '']); render(); $$('[data-fk]', el).pop()?.focus(); return; }
    const rmf = t.closest('[data-rmf]'); if (rmf) { collect(); st.fields.splice($$('.frow', el).indexOf(rmf.closest('.frow')), 1); return render(); }
    if (t.closest('#edAi')) { collect(); const txt = await aiArticleText({...st, fields: st.fields}); if (txt) { st.d.beschreibung = txt; tab = 'beschreibung'; render(); toast('Beschreibung erstellt', {t2: 'Bitte prüfen und bei Bedarf anpassen', type: 'pos', icon: 'sparkle'}); } return; }
    if (t.closest('#edSki')) { st.ski = !st.ski; $('#edSki', el).setAttribute('aria-checked', st.ski); return; }
    if (t.closest('#edLbl')) return openLabels(a.variants.map(v => ({a, v, n: 1})));
    if (t.closest('#edPage')) {
      const url = await askUrl('Aus Produktseite übernehmen', 'Adresse der Produktseite (z. B. auf der Webseite der Marke) – Name, Beschreibung, Preis, Material und Bilder werden ausgelesen. Rechte an Texten und Bildern bleiben beim Hersteller.'); if (!url) return;
      try {
        collect(); const r = await invoke('web_read_page', {url}), p = pageToArticle(r);
        if (!p.name && !p.images.length) return toast('Nichts erkannt', {t2: 'Die Seite liefert keine lesbaren Produktdaten (JavaScript-Shop?)', type: 'warn'});
        if (!st.name.trim() && p.name) st.name = p.name; if (!st.brand && p.brand) st.brand = p.brand;
        if (!String(st.price).trim() && p.price) st.price = num(p.price, 2);
        if (!st.d.beschreibung && p.beschreibung) st.d.beschreibung = p.beschreibung;
        if (!st.d.hersteller_artikelnr && p.sku) st.d.hersteller_artikelnr = p.sku; if (!st.d.mat_zusammensetzung && p.material) st.d.mat_zusammensetzung = p.material;
        st.d.quelle_url = p.url;
        if (a && DESKTOP) { const rr = await invoke('article_media_add_url', {id: a.id, urls: p.images, color: ''}); await refreshMedia(); toast(`${rr.ok} Bild${rr.ok === 1 ? '' : 'er'} geladen`, {t2: rr.fehler.length ? `${rr.fehler.length} nicht ladbar` : 'aus der Produktseite', type: rr.ok ? 'pos' : 'warn', icon: 'image'}); }
        else { st.pending.push(...p.images); toast('Daten übernommen', {t2: `${p.images.length} Bilder werden nach dem Speichern geladen`, type: 'pos', icon: 'globe'}); }
        render();
      } catch (err) { toast('Seite nicht lesbar', {t2: String(err), type: 'warn'}); }
      return;
    }
    if (t.closest('#gAdd')) { if (!a) return toast('Erst Artikel speichern', {type: 'warn'}); try { collect(); const n = await invoke('article_media_pick', {id: a.id, color: null}); if (n) { await refreshMedia(); render(); toast(`${n} Bild${n === 1 ? '' : 'er'} hinzugefügt`, {type: 'pos', icon: 'image'}); } } catch (err) { toast('Bilder nicht übernommen', {t2: String(err), type: 'warn'}); } return; }
    if (t.closest('#gUrl')) {
      const txt = await askUrl('Bilder von Webadressen laden', 'Eine Bildadresse je Zeile (Rechtsklick auf das Bild › Bildadresse kopieren)'); if (!txt) return;
      const urls = txt.split(/\s+/).filter(x => /^https?:/.test(x));
      if (!a) { st.pending.push(...urls); return render(); }
      try { const rr = await invoke('article_media_add_url', {id: a.id, urls, color: ''}); await refreshMedia(); render(); toast(`${rr.ok} Bild${rr.ok === 1 ? '' : 'er'} geladen`, {t2: rr.fehler[0] || '', type: rr.fehler.length ? 'warn' : 'pos', icon: 'image'}); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); }
      return;
    }
    const mv = t.closest('[data-mmv]'); if (mv) { return reorder(+mv.dataset.mmv, (it, i) => { const j = i + +mv.dataset.d; if (j >= 0 && j < it.length) [it[i], it[j]] = [it[j], it[i]]; }); }
    const mm = t.closest('[data-mmain]'); if (mm) { return reorder(+mm.dataset.mmain, (it, i) => { it.unshift(it.splice(i, 1)[0]); }); }
    const md = t.closest('[data-mdel]'); if (md) { try { await invoke('article_media_remove', {id: +md.dataset.mdel}); await refreshMedia(); render(); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } return; }
    if (t.closest('#edDel')) {
      try { await stepUp({title: 'Artikel deaktivieren', text: `${a.name} wird aus Kasse und Liste entfernt. Belege und Historie bleiben erhalten.`}); } catch { return; }
      if (DESKTOP) { try { await invoke('article_delete', {id: a.id, user: S.user.name}); } catch (err) { return toast('Fehler', {t2: String(err), type: 'warn'}); } }
      ART.splice(ART.indexOf(a), 1); edClose();
      toast('Artikel deaktiviert', {t2: a.name, icon: 'trash'}); Hooks.emit('catalog.article.deactivated', {sku: a.id}); return;
    }
    if (t.closest('#edSave')) {
      collect();
      const price = parseAmt(st.price), sale = String(st.sale).trim() ? parseAmt(st.sale) : null, sizes = sizesArr();
      const fail = (msg, tb) => { if (tb && tb !== tab) { tab = tb; render(); } toast(msg, {type: 'warn', icon: 'alert'}); };
      if (!st.name.trim()) return fail('Bezeichnung fehlt', 'stamm');
      if (!st.id.trim()) return fail('Artikelnummer fehlt', 'stamm');
      if (isNew && ART.some(x => x.id === st.id.trim())) return fail('Artikelnummer bereits vergeben', 'stamm');
      if (!(price > 0)) return fail('Verkaufspreis fehlt', 'stamm');
      if (sale != null && !(sale > 0 && sale < price)) return fail('Aktionspreis muss unter dem Verkaufspreis liegen', 'stamm');
      if (st.d.fedas_code && !/^\d{6}$/.test(String(st.d.fedas_code))) return fail('FEDAS-Schlüssel hat 6 Ziffern', 'klass');
      if (!st.colors.length) return fail('Mindestens eine Farbe wählen', 'varianten');
      if (!sizes.length) return fail('Mindestens eine Größe angeben', 'varianten');
      const cfv = await cfCheck('artikel', st.cf, true); if (!cfv) return;
      const used = new Set(ART.flatMap(x => x.variants.map(v => v.ean)));
      const variants = [];
      st.colors.forEach(c => sizes.forEach(s => { const ex = a?.variants.find(v => v.c === c && v.s === s); if (ex) variants.push({...ex}); else { const ean = newEan(st.id, used); used.add(ean); variants.push({c, s, ean, q: 0, other: null}); } }));
      const details = {...(a?.details || {}), ...st.d}; detKeys().forEach(k => { if (!(k in st.d)) delete details[k]; });
      const art = finishArt({id: st.id.trim(), name: st.name.trim(), brand: st.brand.trim(), cat: st.cat, g: st.g, price: r2(price), sale: sale ? r2(sale) : undefined, vat: +st.vat, tag: st.tag || undefined, pop: st.pop,
        colors: [...st.colors], sizes, fields: {...Object.fromEntries(st.fields.filter(([k]) => k)), ...cfv}, prompts: st.ski ? SKI_PROMPTS : undefined, variants, details, media: a?.media || [], image: a?.image || null,
        cost: String(st.cost).trim() && isFinite(parseAmt(st.cost)) ? r2(parseAmt(st.cost)) : null, supplierId: st.supplierId || '', minStock: Math.max(0, parseInt(st.minStock, 10) || 0)});
      const btn = $('#edSave', el); btn.disabled = true;
      try {
        if (DESKTOP) replaceCatalog(await invoke('article_save', {article: artToDb(art), user: S.user.name}));
        else { const i = ART.findIndex(x => x.id === art.id); i >= 0 ? ART.splice(i, 1, art) : ART.unshift(art); }
      } catch (err) { btn.disabled = false; return fail(String(err)); }
      if (DESKTOP && st.pending.length) { try { const rr = await invoke('article_media_add_url', {id: art.id, urls: st.pending, color: ''}); replaceCatalog(await invoke('catalog_list')); if (rr.fehler.length) toast(`${rr.fehler.length} Bild${rr.fehler.length === 1 ? '' : 'er'} nicht ladbar`, {t2: rr.fehler[0], type: 'warn'}); } catch { /* */ } }
      remount(ART.find(y => y.id === art.id) || art, tab);
      toast(isNew ? 'Artikel angelegt' : 'Artikel gespeichert', {t2: `${art.name} · ${variants.length} Varianten${isNew ? ' – Bestand unter „Bestand“ buchen' : ''}`, type: 'pos', icon: 'tag', action: isNew ? {label: 'Bilder hinzufügen', run: () => { const x = ART.find(y => y.id === art.id); if (x) openEditor(x, 'bilder'); }} : undefined});
      Hooks.emit('catalog.article.saved', {sku: art.id, name: art.name, varianten: variants.length, neu: isNew});
    }
  });
  el.addEventListener('change', async e => {
    const c = e.target.closest('[data-mcol]'), cap = e.target.closest('[data-mcap]');
    if ((c || cap) && a) { try { await saveMediaOrder(); await refreshMedia(); } catch (err) { toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); } }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('#edSave', el).click(); } });
  render();
};
{ const st = document.createElement('style'); st.textContent = '.ed-tabs{display:flex;gap:4px;padding:0 20px;border-bottom:1px solid var(--line);overflow-x:auto;flex:none}.ed-tab{display:flex;align-items:center;gap:6px;height:40px;padding:0 12px;border:0;background:none;color:var(--text-3);font-weight:600;font-size:13px;border-bottom:2.5px solid transparent;white-space:nowrap;cursor:pointer}.ed-tab:hover{color:var(--text)}.ed-tab[aria-selected="true"]{color:var(--accent-strong,var(--accent));border-bottom-color:var(--accent)}.ed-tab .nav-badge{margin-left:2px}'; document.head.appendChild(st); }

/* Artikelinfo: alle Produktdaten anzeigen */
function detailsHTML(a) {
  const d = a.details || {}, rows = [];
  for (const tab of ['beschreibung', 'material', 'technik', 'klass']) for (const g of DET[tab]) for (const f of g.f) { const v = d[f.k]; if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue; rows.push([g.t, f.l, Array.isArray(v) ? v : v === true ? 'ja' : v, f.t === 'lines' || f.t === 'area']); }
  if (!rows.length) return '';
  const groups = {}; rows.forEach(r => (groups[r[0]] ||= []).push(r));
  return `<div class="card" style="margin-top:14px"><div class="set-row"><div class="set-l">Produktdaten</div><button class="btn btn-ghost btn-sm" data-aied="${esc(a.id)}" data-perm="artikel.bearbeiten">${ic('edit', 'i-sm')}Bearbeiten</button></div><div style="padding:0 16px 16px;display:grid;gap:14px">${Object.entries(groups).map(([t, l]) => `<div><div class="muted" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${esc(t)}</div>${l.map(([, lb, v, long]) => `<div style="display:grid;grid-template-columns:200px 1fr;gap:12px;padding:5px 0;border-top:1px solid var(--line-2);font-size:13px"><span class="muted">${esc(lb.replace(/ \(.*\)/, ''))}</span><span style="white-space:pre-wrap">${Array.isArray(v) ? v.map(x => `<div>• ${esc(x)}</div>`).join('') : esc(v)}</span></div>`).join('')}</div>`).join('')}</div></div>`;
}
{ const _r = renderArtInfo; renderArtInfo = async function (id, mode, title) { await _r(id, mode, title); const a = AIF.sel ? artById(AIF.sel) : null; const box = $('[data-aib]', $('#view-' + id)); if (a && box && mode !== 'kompakt') { box.insertAdjacentHTML('beforeend', detailsHTML(a)); const gal = (a.media || []).filter(m => m.file); if (gal.length) box.insertAdjacentHTML('afterbegin', `<div style="display:flex;gap:8px;overflow:auto;margin-bottom:12px">${gal.map(m => `<img src="${esc(imgUrl(m.file))}" alt="" style="height:${mode === 'plus' ? 150 : 110}px;border-radius:10px;background:var(--surface-2);border:1px solid var(--line)">`).join('')}</div>`); } }; }

/* ── FEDAS ── */
const FED = {log: [], mans: null, busy: false, msg: ''};
const fedProv = () => CFG['fedas.quelle'] || (CFG['fedas.url'] ? 'generisch' : 'outtra');
const fedReady = () => fedProv() === 'outtra' ? !!String(CFG['fedas.pass'] || '').trim() : !!CFG['fedas.url'];
const openExt = u => invoke('open_url', {url: u}).catch(() => window.open(u, '_blank'));
const fedasFresh = async () => { if (DESKTOP) { try { Object.assign(CFG, await invoke('settings_get')); } catch { /* */ } } return CFG; };
const fedasNext = () => { if (!CFG['fedas.auto']) return 'automatisch aus'; const z = CFG['fedas.zeit'] || '03:30', d = new Date(), today = dIso(d), last = String(CFG['fedas.letzter_abgleich'] || '').slice(0, 10); const t = new Date(`${today}T${z}`); if (last !== today && d >= t) return 'heute – wird gleich ausgeführt'; return (last === today || d < t ? (d < t && last !== today ? 'heute' : 'morgen') : 'morgen') + ' um ' + z + ' Uhr'; };
registerPage('fedas-sync', {title: 'FEDAS-Sync', sub: () => fedReady() ? (CFG['fedas.auto'] ? 'täglich automatisch' : 'manuell') : 'nicht eingerichtet', render: async () => {
  const v = $('#view-fedas-sync');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('sync', 'FEDAS-Sync'); return; }
  await fedasFresh(); await loadStamm();
  try { FED.log = await invoke('fedas_log_list', {limit: 60}); } catch { FED.log = []; }
  const res = CFG['fedas.letztes_ergebnis'], cfg = fedReady(), pend = await invoke('media_pending_count').catch(() => 0);
  const fedasArts = ART.filter(a => a.details?.fedas_sync).length, withCode = ART.filter(a => a.details?.fedas_code).length;
  v.innerHTML = `<div class="cv">${pageHead('FEDAS-Sync', 'Artikelstammdaten der Hersteller (FEDAS-Schlüssel, Beschreibung, Material, Preise, Bilder) über den OUTTRA Data & Image Hub – täglich automatisch aktuell', `<button class="btn btn-secondary" data-goto="fedas-verbindung">${ic('sliders', 'i-sm')}Verbindung</button><button class="btn btn-secondary" data-fsync="full" ${cfg && !FED.busy ? '' : 'disabled'}>${ic('sync', 'i-sm')}Vollabgleich</button><button class="btn btn-primary" data-fsync="delta" ${cfg && !FED.busy ? '' : 'disabled'}>${ic('sync', 'i-sm')}${FED.busy ? 'läuft …' : 'Jetzt abgleichen'}</button>`)}
    ${!cfg ? `<div class="card" style="padding:16px 18px;margin-bottom:14px;border-color:var(--warn)">${ic('alert', 'i-sm')} <b>Noch nicht eingerichtet.</b> ${fedProv() === 'outtra' ? 'Für den Abruf der Hersteller-Stammdaten wird ein kostenloser Zugang beim <b>OUTTRA Data &amp; Image Hub</b> und ein Zugriffstoken benötigt – Schritt für Schritt unter <a data-goto="fedas-verbindung" href="#fedas-verbindung">Verbindung</a>.' : 'Adresse und Zugang unter <a data-goto="fedas-verbindung" href="#fedas-verbindung">Verbindung</a> eintragen.'} Bis dahin: <a data-goto="fedas-import" href="#fedas-import">Datei-Import</a> (CSV/JSON).</div>` : ''}
    ${FED.msg ? `<div class="card" style="padding:12px 16px;margin-bottom:14px">${esc(FED.msg)}</div>` : ''}
    ${kpiCards([[cfg ? (CFG['fedas.auto'] ? 'täglich ' + esc(CFG['fedas.zeit'] || '03:30') : 'manuell') : 'aus', 'Abgleich', CFG['fedas.auto'] ? 'pos' : ''], [CFG['fedas.letzter_abgleich'] ? esc(fmtTs(CFG['fedas.letzter_abgleich'])) : '–', 'letzter Abgleich'], [esc(fedasNext()), 'nächster Lauf'], [num(fedasArts), 'Artikel mit FEDAS-Daten'], [num(withCode), 'mit FEDAS-Schlüssel'], [num(pend), 'Bilder in Warteschlange', pend ? 'warn' : '']])}
    ${res ? `<div class="card" style="padding:14px 16px;margin-bottom:14px"><b>Letztes Ergebnis</b> · ${esc(fmtTs(res.zeit))}: ${num(res.neu)} neu · ${num(res.aktualisiert)} aktualisiert · ${num(res.uebersprungen)} unverändert${(res.fehler || []).length ? `<div style="color:var(--neg);font-size:12.5px;margin-top:6px">${res.fehler.map(esc).join('<br>')}</div>` : ''}</div>` : ''}
    <div class="card" style="overflow:auto"><div class="set-row"><div class="set-l">Protokoll</div><button class="btn btn-ghost btn-sm" data-goto="fedas-protokoll">Alle anzeigen</button></div>${FED.log.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Art</th><th>Hersteller</th><th class="r">neu</th><th class="r">aktualisiert</th><th class="r">unverändert</th><th style="padding-right:16px">Fehler</th></tr></thead><tbody>${FED.log.slice(0, 12).map(l => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(l.ts))}</td><td>${esc(l.art)}</td><td>${esc(l.hersteller || '–')}</td><td class="r num">${l.neu}</td><td class="r num">${l.aktualisiert}</td><td class="r num">${l.uebersprungen}</td><td style="padding-right:16px;color:var(--neg);font-size:12px">${esc(l.fehler)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:32px 20px"><h3>Noch kein Abgleich</h3></div>'}</div></div>`;
}});
registerPage('fedas-protokoll', {title: 'FEDAS-Protokoll', sub: () => 'Alle Abgleiche', render: async () => {
  const v = $('#view-fedas-protokoll'); if (!DESKTOP) { v.innerHTML = desktopEmpty('history', 'FEDAS'); return; }
  const l = await invoke('fedas_log_list', {limit: 500}).catch(() => []);
  v.innerHTML = `<div class="cv">${pageHead('FEDAS-Protokoll', 'Abgleiche über die Schnittstelle und Datei-Importe')}<div class="card" style="overflow:auto">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Art</th><th>Hersteller</th><th class="r">neu</th><th class="r">aktualisiert</th><th class="r">unverändert</th><th>von</th><th style="padding-right:16px">Fehler</th></tr></thead><tbody>${l.map(x => `<tr><td style="padding-left:16px" class="muted num">${esc(fmtTs(x.ts))}</td><td>${esc(x.art)}</td><td>${esc(x.hersteller || '–')}</td><td class="r num">${x.neu}</td><td class="r num">${x.aktualisiert}</td><td class="r num">${x.uebersprungen}</td><td>${esc(x.user || '')}</td><td style="padding-right:16px;color:var(--neg);font-size:12px">${esc(x.fehler)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:40px 20px"><h3>Keine Einträge</h3></div>'}</div></div>`;
}});
registerPage('fedas-verbindung', {title: 'FEDAS-Verbindung', sub: () => fedProv() === 'outtra' ? 'OUTTRA Data & Image Hub' : (CFG['fedas.url'] || 'eigene Schnittstelle'), render: async () => {
  const v = $('#view-fedas-verbindung'); await fedasFresh();
  const prov = fedProv();
  const f = (k, l, h, o = {}) => `<div class="set-row"><div><div class="set-l">${l}</div>${h ? `<div class="set-h">${h}</div>` : ''}</div><div class="set-c">${o.sel ? `<select class="input select" data-fk="${k}" style="min-width:220px">${o.sel.map(([a, b]) => `<option value="${a}" ${String(CFG[k]) === a ? 'selected' : ''}>${b}</option>`).join('')}</select>` : `<input class="input ${o.cls || ''}" ${o.type ? `type="${o.type}"` : ''} data-fk="${k}" value="${esc(CFG[k] ?? '')}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} style="min-width:300px" autocomplete="off">`}</div></div>`;
  const sw = (k, l, h) => `<div class="set-row"><div><div class="set-l">${l}</div><div class="set-h">${h}</div></div><div class="set-c"><button class="switch" role="switch" data-fsw="${k}" aria-checked="${!!CFG[k]}"></button></div></div>`;
  const sel = new Set((CFG['fedas.hersteller'] || []).map(x => String(x).toLowerCase()));
  v.innerHTML = `<div class="cv">${pageHead('FEDAS-Verbindung', 'Woher Kontor die Hersteller-Stammdaten bezieht, Marken-Auswahl und automatischer Abgleich', `<button class="btn btn-secondary" data-ftest>${ic('check', 'i-sm')}Verbindung testen</button><button class="btn btn-primary" data-goto="fedas-sync">${ic('sync', 'i-sm')}Zum Abgleich</button>`)}
    <div class="card" style="padding:16px 18px;margin-bottom:14px;font-size:13.5px;line-height:1.6"><b>Wie FEDAS funktioniert:</b> FEDAS ist der einheitliche 6-stellige Produktschlüssel der Sportartikelbranche (gepflegt von SGI-DHO) – keine Schnittstelle zum Abholen. Die Stammdaten der Marken liegen in Datenhubs; der größte für Outdoor, Ski und Bike ist der <b>OUTTRA Data &amp; Image Hub</b> mit dokumentierter Händler-API. Jeder Artikel enthält dort den FEDAS-Schlüssel (und Größen-/Farbcodes), dazu Beschreibung, Material, Preise und Bilder.</div>
    <div class="card" style="padding:14px 16px;margin-bottom:14px"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><b>Datenquelle</b><div class="seg" data-fq>${[['outtra', 'OUTTRA Data & Image Hub'], ['generisch', 'Eigene Schnittstelle']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${prov === k}">${l}</button>`).join('')}</div></div></div>
    ${prov === 'outtra' ? `<div class="card" style="padding:18px;margin-bottom:14px"><h3 style="margin:0 0 10px">So bekommen Sie den Zugang (kostenlos für Händler)</h3>
      <ol style="margin:0;padding-left:20px;line-height:1.9;font-size:13.5px"><li><b>Als Händler registrieren</b> <button class="btn btn-secondary btn-sm" data-fext="https://in.outtra.com/register?lang=de">${ic('globe', 'i-sm')}Registrierung öffnen</button></li>
        <li><b>Marken freischalten:</b> im Data &amp; Image Hub die Marken aktivieren, die Sie führen – die Marke bestätigt Sie als Händler (Salomon, Atomic, Ortovox, Fischer, Deuter, Mammut, Hanwag u. a. nehmen teil).</li>
        <li><b>API-Token anfordern:</b> eine kurze E-Mail an den OUTTRA-Support genügt <button class="btn btn-secondary btn-sm" data-fext="mailto:support-en@outtra.com?subject=${encodeURIComponent('API-Token Data & Image Hub')}&body=${encodeURIComponent('Guten Tag, wir sind Händler (' + (CFG['firma.name'] || '') + ') und möchten die DataHub-API (api.outtra.com) für unsere Warenwirtschaft Kontor nutzen. Bitte um einen Bearer-Token. Danke!')}">${ic('mail', 'i-sm')}E-Mail an OUTTRA</button></li>
        <li><b>Token unten eintragen</b>, „Verbindung testen“, Marken auswählen, „Jetzt abgleichen“.</li></ol>
      <div class="muted" style="font-size:12.5px;margin-top:10px">Technik: <button class="btn btn-ghost btn-sm" data-fext="https://api.outtra.com/docs">API-Dokumentation</button> · Basis https://api.outtra.com · GET /api/v2/datahub/my/brands und /products (30 je Seite, Filter updatedAfter für den täglichen Abgleich) · Anfragen je Minute begrenzt – Kontor wartet automatisch.</div></div>
    <div class="card" style="margin-bottom:14px"><div class="set-row"><div class="set-l">Zugang</div></div>${f('fedas.pass', 'API-Token (Bearer)', 'vom OUTTRA-Support; wird nur lokal in der Kontor-Datenbank gespeichert', {type: 'password'})}</div>`
    : `<div class="card" style="margin-bottom:14px"><div class="set-row"><div class="set-l">Zugang</div></div>
      ${f('fedas.url', 'Adresse der Schnittstelle', 'Basis-Adresse laut Zugangsunterlagen, z. B. https://api.beispiel.eu/v1', {ph: 'https://…'})}
      ${f('fedas.auth', 'Anmeldung', 'wie sich Kontor an der Schnittstelle anmeldet', {sel: [['basic', 'Benutzername + Passwort (Basic)'], ['bearer', 'Zugriffstoken (Bearer)'], ['header', 'API-Schlüssel im Kopfzeilenfeld']]})}
      ${f('fedas.user', 'Benutzername / Kundennummer', '')}${f('fedas.pass', 'Passwort / Token / Schlüssel', 'wird nur lokal gespeichert', {type: 'password'})}${f('fedas.header', 'Name des Kopfzeilenfelds', 'nur bei API-Schlüssel, Standard X-API-Key', {ph: 'X-API-Key'})}</div>
    <div class="card" style="margin-bottom:14px"><div class="set-row"><div><div class="set-l">Abruf</div><div class="set-h">Herstellerliste → Artikel je Hersteller; {id} steht für die Herstellernummer.</div></div></div>
      ${f('fedas.pfad_hersteller', 'Pfad Herstellerliste', '', {cls: 'mono'})}${f('fedas.pfad_artikel', 'Pfad Artikel je Hersteller', '', {cls: 'mono'})}${f('fedas.seit_parameter', 'Parameter „geändert seit“', 'für den täglichen Abgleich', {cls: 'mono'})}${f('fedas.seitengroesse', 'Seitengröße (0 = alles auf einmal)', '', {ph: '0'})}</div>`}
    <div class="card" style="margin-bottom:14px"><div class="set-row"><div class="set-l">Automatik</div></div>
      ${sw('fedas.auto', 'Täglicher Abgleich', 'Kontor holt im Hintergrund jeden Tag die Änderungen ab – solange das Programm läuft; verpasste Läufe werden nachgeholt')}${f('fedas.zeit', 'Uhrzeit', 'frühestens ab dieser Zeit (z. B. nachts)', {type: 'time'})}${sw('fedas.preise', 'Preise (UVP) übernehmen', 'aus: nur Stammdaten, Texte und Bilder; Ihre Preise bleiben unberührt')}</div>
    <div class="card"><div class="set-row"><div><div class="set-l">Marken</div><div class="set-h">Nur diese Marken abgleichen – ohne Auswahl alle für Sie freigeschalteten</div></div><button class="btn btn-secondary btn-sm" data-fman>${ic('download', 'i-sm')}Markenliste laden</button></div>
      <div style="padding:0 16px 16px"><div style="display:flex;flex-wrap:wrap;gap:6px">${(FED.mans || []).map(m => `<label class="chip" style="cursor:pointer"><input type="checkbox" data-fmc="${esc(m.id || m.name)}" ${sel.has(String(m.id).toLowerCase()) || sel.has(String(m.name).toLowerCase()) ? 'checked' : ''} style="margin:0 6px 0 0">${esc(m.name || m.id)}${m.verfuegbar != null ? ` <span class="muted" style="margin-left:4px">${num(m.verfuegbar)}</span>` : ''}</label>`).join('') || `<span class="muted" style="font-size:13px">${sel.size ? esc([...sel].join(', ')) + ' – ' : ''}Markenliste noch nicht geladen</span>`}</div><div style="margin-top:10px"><input class="input" data-fmt placeholder="oder Marken-Nummern/-Namen eintragen, durch Komma getrennt" value="${esc((CFG['fedas.hersteller'] || []).join(', '))}"></div></div></div>
    <div data-ftr style="margin-top:12px"></div></div>`;
  initSeg($('[data-fq]', v), async b => { await saveSettings({'fedas.quelle': b.dataset.v}, true); FED.mans = null; PAGES['fedas-verbindung'].render(); });
}});
registerPage('fedas-import', {title: 'FEDAS Datei-Import', sub: () => 'CSV oder JSON', render: () => {
  const v = $('#view-fedas-import');
  v.innerHTML = `<div class="cv">${pageHead('FEDAS Datei-Import', 'Artikeldaten aus einer Datei Ihres Lieferanten oder Verbands einlesen – neue Artikel werden angelegt, vorhandene (über EAN) ergänzt')}
    <div class="card" style="padding:18px;display:grid;gap:12px"><input type="file" accept=".csv,.json,.txt,text/csv,application/json" data-fif><textarea class="input mono" rows="8" data-fit style="height:auto;padding:9px 12px;font-size:12px" placeholder="… oder Inhalt hier einfügen"></textarea>
      <div style="display:flex;gap:10px;align-items:center"><div class="seg" data-fiseg>${[['csv', 'CSV'], ['json', 'JSON']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${k === (FED.fmt || 'csv')}">${l}</button>`).join('')}</div><span class="sp" style="flex:1"></span><button class="btn btn-primary" data-fiimp>${ic('download', 'i-sm')}Importieren</button></div>
      <div class="prompt-hint">${ic('info', 'i-xs')}Erkannte Spalten (Groß/Klein egal): EAN/GTIN · Artikelnummer · Bezeichnung · Marke · Farbe · Größe · UVP · EK · MwSt · FEDAS-Code · Beschreibung · Material · Herkunft · Zolltarif · Bild-URLs. Unbekannte Spalten werden ignoriert.</div><div data-fir></div></div></div>`;
  initSeg($('[data-fiseg]', v), b => { FED.fmt = b.dataset.v; });
  const fedFile = async f => { $('[data-fit]', v).value = await f.text(); FED.fmt = /\.json$/i.test(f.name) ? 'json' : 'csv'; $$('[data-fiseg] button', v).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === FED.fmt)); };
  $('[data-fif]', v).onchange = async e => { const f = e.target.files[0]; if (f) await fedFile(f); };
  fileDrop($('.card', v), {accept: /\.(csv|json|txt)$/i, hint: 'Datei hier ablegen', onFiles: ([f]) => fedFile(f)});
  $('[data-fiimp]', v).onclick = async () => {
    const txt = $('[data-fit]', v).value; if (!txt.trim()) return toast('Keine Daten', {type: 'warn'});
    try { await needPerm('artikel.bearbeiten', 'FEDAS-Import'); const r = await invoke('fedas_import_file', {content: txt, format: FED.fmt || 'csv', user: S.user.name}); await loadStamm(true); replaceCatalog(await invoke('catalog_list')); $('[data-fir]', v).innerHTML = `<div class="card" style="padding:12px 16px;color:var(--pos)">${ic('check', 'i-sm')} ${r.zeilen} Zeilen gelesen: ${r.neu} Artikel neu · ${r.aktualisiert} aktualisiert · ${r.uebersprungen} unverändert · ${r.bilder} Bilder vorgemerkt</div>`; invoke('media_fetch_pending', {limit: 30}).catch(() => {}); } catch (err) { $('[data-fir]', v).innerHTML = `<div class="card" style="padding:12px 16px;color:var(--neg)">${esc(String(err))}</div>`; }
  };
}});
Object.assign(VIEW_PERM, {'fedas-sync': 'artikel.bearbeiten', 'fedas-verbindung': 'einstellungen', 'fedas-import': 'artikel.bearbeiten', 'fedas-protokoll': 'artikel.bearbeiten'});

/* ── Marken-Demosortiment ── */
const DEMO_BRANDS = ['Salomon', 'Atomic', 'LOWA', 'On', 'Mammut', 'Nike', 'Adidas', 'Puma', 'Oakley', 'McDavid', 'Buff', 'Spyder', 'Head', 'Völkl', 'Fischer', 'Scarpa', 'La Sportiva', 'Leki', 'Deuter', 'Smartwool', 'Falke', 'Odlo', 'Armada', 'POC', 'Dainese', 'Eisbär', 'Reusch', 'Hestra', 'Ortovox'];
registerPage('demo-marken', {title: 'Marken-Demosortiment', sub: () => `${DEMO_BRANDS.length} Marken`, render: async () => {
  const v = $('#view-demo-marken');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('star', 'Demosortiment'); return; }
  const pend = await invoke('media_pending_count').catch(() => 0), have = new Set(ART.map(a => norm(a.brand)));
  v.innerHTML = `<div class="cv">${pageHead('Marken-Demosortiment', 'Echte Artikel von Salomon, Atomic, LOWA, Mammut, Ortovox, Hestra u. a. – mit Beschreibung, Material, Preisen und mehreren Bildern je Farbe', `<button class="btn btn-secondary" data-dmimg>${ic('download', 'i-sm')}Bilder jetzt laden</button><button class="btn btn-primary" data-dmgo>${ic('plus', 'i-sm')}Demo-Artikel anlegen</button>`)}
    ${kpiCards([[num(ART.length), 'Artikel im Sortiment'], [num(DEMO_BRANDS.filter(b => have.has(norm(b))).length) + ' / ' + DEMO_BRANDS.length, 'Marken vorhanden'], [num(ART.reduce((s, a) => s + (a.media || []).filter(m => m.file).length, 0)), 'Bilder gespeichert'], [num(pend), 'Bilder in Warteschlange', pend ? 'warn' : '']])}
    <div class="card" style="padding:16px 18px;margin-bottom:14px;font-size:13.5px;line-height:1.55">Die Artikeldaten (Texte, Preise, Bild-Adressen) stammen von den Webseiten der Marken. <b>Die Bilder werden nicht mit Kontor ausgeliefert</b>, sondern beim Anlegen von den Markenseiten auf diesen Rechner geladen und lokal gespeichert. Rechte an Texten und Bildern liegen bei den Herstellern – für den echten Verkauf die Daten über FEDAS oder die Markenportale beziehen.</div>
    <div class="card" style="padding:16px"><div style="display:flex;flex-wrap:wrap;gap:6px">${DEMO_BRANDS.map(b => `<span class="chip" style="${have.has(norm(b)) ? 'background:var(--accent-soft);color:var(--accent-strong,var(--accent))' : 'opacity:.6'}">${have.has(norm(b)) ? ic('check', 'i-xs') : ''} ${esc(b)}</span>`).join('')}</div></div></div>`;
  v.onclick = async e => {
    if (e.target.closest('[data-dmgo]')) { try { await needPerm('artikel.bearbeiten', 'Demo-Artikel'); const r = await invoke('demo_brands_seed'); await loadStamm(true); replaceCatalog(await invoke('catalog_list')); toast(r.artikel ? `${r.artikel} Artikel angelegt` : 'Alle Demo-Artikel sind schon da', {t2: r.bilder ? `${r.bilder} Bilder werden geladen …` : '', type: 'pos', icon: 'star'}); invoke('media_fetch_pending', {limit: 40}).catch(() => {}); PAGES['demo-marken'].render(); } catch (err) { toast('Nicht angelegt', {t2: String(err), type: 'warn'}); } }
    if (e.target.closest('[data-dmimg]')) { try { const r = await invoke('media_fetch_pending', {limit: 60, retry: true}); replaceCatalog(await invoke('catalog_list')); toast(`${r.geladen} Bilder geladen`, {t2: r.offen ? `${r.offen} noch offen` : r.fehler ? `${r.fehler} nicht ladbar` : 'fertig', type: 'pos', icon: 'image'}); PAGES['demo-marken'].render(); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } }
  };
}});
VIEW_PERM['demo-marken'] = 'artikel.bearbeiten';

function bindArtikel2() {
  document.addEventListener('click', async e => {
    const v = e.target.closest('#view-fedas-sync, #view-fedas-verbindung'); if (!v) return;
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.fsync) {
        await needPerm('artikel.bearbeiten', 'FEDAS-Abgleich'); FED.busy = true; FED.msg = 'Abgleich läuft …'; PAGES['fedas-sync'].render();
        try { const r = await invoke('fedas_sync', {user: S.user.name, full: b.dataset.fsync === 'full'}); FED.msg = `Fertig: ${r.neu} neu · ${r.aktualisiert} aktualisiert · ${r.uebersprungen} unverändert · ${r.bilder} Bilder vorgemerkt`; await loadStamm(true); replaceCatalog(await invoke('catalog_list')); invoke('media_fetch_pending', {limit: 30}).catch(() => {}); } catch (err) { FED.msg = 'Fehler: ' + String(err); }
        FED.busy = false; if (S.view === 'fedas-sync') PAGES['fedas-sync'].render(); return;
      }
      if (b.dataset.ftest != null || b.dataset.fman != null) {
        const box = $('[data-ftr]', v); box.innerHTML = loadingCard('Verbinde');
        try { FED.mans = await invoke('fedas_manufacturers'); box.innerHTML = `<div class="card" style="padding:14px 16px;color:var(--pos)">${ic('check', 'i-sm')} Verbindung steht – ${FED.mans.length} Hersteller verfügbar</div>`; if (b.dataset.fman != null) PAGES['fedas-verbindung'].render(); } catch (err) { box.innerHTML = `<div class="card" style="padding:14px 16px;color:var(--neg)">${ic('alert', 'i-sm')} ${esc(String(err))}</div>`; }
        return;
      }
      if (b.dataset.fext) return openExt(b.dataset.fext);
      const sw = b.dataset.fsw; if (sw) { const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on); await saveSettings({[sw]: on}); }
    } catch (err) { toast('FEDAS', {t2: String(err), type: 'warn'}); }
  });
  document.addEventListener('change', async e => {
    const v = e.target.closest('#view-fedas-verbindung'); if (!v) return;
    const t = e.target;
    if (t.dataset.fk) { const k = t.dataset.fk; await saveSettings({[k]: k === 'fedas.seitengroesse' ? (parseInt(t.value, 10) || 0) : t.value.trim()}, true); return; }
    if (t.dataset.fmc != null) { const l = $$('[data-fmc]', v).filter(c => c.checked).map(c => c.dataset.fmc); await saveSettings({'fedas.hersteller': l}, true); return; }
    if (t.matches('[data-fmt]')) { await saveSettings({'fedas.hersteller': t.value.split(',').map(x => x.trim()).filter(Boolean)}, true); }
  });
  // Bilder aus der Warteschlange nach und nach im Hintergrund laden – Katalog dabei aktualisieren
  if (DESKTOP) { let last = 0; setInterval(async () => { try { const n = await invoke('media_pending_count'); if (n !== last && (last > 0 || n === 0)) { replaceCatalog(await invoke('catalog_list')); if (S.view === 'artikel') renderArtTable(); } last = n; } catch { /* */ } }, 20000); }
}

/* ── Advarics-Import (XLSX) ── */
const ADV = {path: '', pv: null, wg: null, wgres: null, opt: {inaktiv: false, bestand: true, preise: true, bilder: true, demo_weg: true}, busy: false, res: null, timer: null};
/** Datei wählen: Warengruppenliste oder Artikelexport wird automatisch erkannt */
async function advPick() {
  try {
    const p = window.__ADV_TEST_FILE || await invoke('advarics_pick'); if (!p) return;
    ADV.path = p; ADV.pv = null; ADV.wg = null; ADV.wgres = null; ADV.res = null; PAGES['advarics-import'].render();
    const wg = await invoke('advarics_wg_preview', {path: p});
    if (wg) ADV.wg = wg; else ADV.pv = await invoke('advarics_preview', {path: p});
    PAGES['advarics-import'].render();
  } catch (err) { ADV.pv = null; ADV.wg = null; toast('Datei nicht lesbar', {t2: String(err), type: 'warn', dur: 9000}); PAGES['advarics-import'].render(); }
}
registerPage('advarics-import', {title: 'Advarics-Import', sub: () => ADV.pv ? `${num(ADV.pv.artikel)} Artikel in der Datei` : 'Artikelexport als Excel-Datei', render: async () => {
  const v = $('#view-advarics-import');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('download', 'Advarics-Import'); return; }
  if (ADV.path && ADV.wg) {
    const w = ADV.wg, wr = ADV.wgres;
    v.innerHTML = `<div class="cv">${pageHead('Advarics-Import', 'Warengruppenliste aus Advarics: Warengruppen mit Bereich › Hauptabteilung › Abteilung, MwSt., Etikettentyp, Inventur', `<button class="btn btn-secondary" data-advpick ${ADV.busy ? 'disabled' : ''}>${ic('folder', 'i-sm')}Andere Datei …</button>`)}
      <div class="card" style="padding:12px 16px;margin-bottom:14px;font-size:13px">${ic('folder', 'i-sm')} <span class="mono">${esc(ADV.path)}</span></div>
      <div class="card" style="padding:18px 20px;margin-bottom:14px"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">${[['Warengruppen', w.warengruppen], ['Abteilungen', w.abteilungen], ['Hauptabteilungen', w.hauptabteilungen], ['Bereiche', w.bereiche]].map(([l, n]) => `<div><div class="muted" style="font-size:12px">${l}</div><div style="font-size:24px;font-weight:700">${num(n)}</div></div>`).join('')}</div>
      <div class="muted" style="margin-top:12px;font-size:13px">${num(w.ohne_hierarchie)} Warengruppen ohne Hierarchie. Die bisherigen Warengruppen (Demo-Liste und von Hand angelegte) werden ersetzt. Advarics-Warengruppen werden ergänzt, nichts davon geht verloren. Wiederholen ist gefahrlos.</div></div>
      ${wr ? `<div class="card" style="padding:16px 20px;margin-bottom:14px"><b>Import abgeschlossen:</b> ${num(wr.entfernt)} alte Warengruppen ersetzt, ${num(wr.artikel_umgehaengt)} Artikel umgehängt · ${num(wr.warengruppen_neu)} Warengruppen neu, ${num(wr.warengruppen_aktualisiert)} aktualisiert · ${num(wr.abteilungen_neu)} Abteilungen, ${num(wr.hauptabteilungen_neu)} Hauptabteilungen, ${num(wr.bereiche_neu)} Bereiche neu</div>` : ''}
      <button class="btn btn-primary" data-advwg ${ADV.busy ? 'disabled' : ''} style="height:44px;padding:0 22px">${ic('download', 'i-sm')}${ADV.busy ? 'Import läuft …' : `${num(w.warengruppen)} Warengruppen importieren`}</button></div>`;
    v.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.advpick != null) return advPick();
      if (b.dataset.advwg != null) {
        if (!await confirmBox(`${num(w.warengruppen)} Advarics-Warengruppen importieren? Die bisherigen Warengruppen (Demo-Liste) werden dabei ersetzt, vorhandene Artikel werden den passenden Advarics-Gruppen zugeordnet.`, 'Importieren')) return;
        ADV.busy = true; PAGES['advarics-import'].render();
        try { ADV.wgres = await invoke('advarics_wg_import', {path: ADV.path}); await loadStamm(true); toast('Warengruppen importiert', {t2: `${num(ADV.wgres.warengruppen_neu)} neu`, type: 'pos', icon: 'download'}); }
        catch (err) { toast('Import fehlgeschlagen', {t2: String(err), type: 'warn', dur: 9000}); }
        ADV.busy = false; PAGES['advarics-import'].render();
      }
    };
    return;
  }
  const pv = ADV.pv, o = ADV.opt, r = ADV.res;
  const sw = (k, l, h) => `<div class="set-row"><div><div class="set-l">${l}</div><div class="set-h">${h}</div></div><div class="set-c"><button class="switch" role="switch" data-advo="${k}" aria-checked="${!!o[k]}"></button></div></div>`;
  v.innerHTML = `<div class="cv">${pageHead('Advarics-Import', 'Artikelexport aus Advarics (Excel „GridExport“) einlesen: Artikel mit Farben, Preisen, Bestand, Lieferanten, Warengruppen und Bildern', `<button class="btn btn-secondary" data-advpick ${ADV.busy ? 'disabled' : ''}>${ic('folder', 'i-sm')}${ADV.path ? 'Andere Datei …' : 'Datei wählen …'}</button>`)}
    ${!ADV.path ? `<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('download')}</div><h3>Advarics-Export wählen</h3><p>In Advarics die Artikelliste als Excel exportieren (mit Spalten Marke, Artikel-Nr., Artikel-Name, Farbe, EK, VK, Bestand …) und hier auswählen. Eingebettete Bilder und Bild-Links werden mitgenommen.</p><button class="btn btn-primary" data-advpick>${ic('folder', 'i-sm')}Datei wählen …</button></div></div>` : `
    <div class="card" style="padding:12px 16px;margin-bottom:14px;font-size:13px" class="mono">${ic('folder', 'i-sm')} <span class="mono">${esc(ADV.path)}</span></div>
    ${pv ? `${kpiCards([[num(pv.zeilen), 'Zeilen'], [num(pv.artikel), 'Artikel (nach Nr.)'], [num(pv.marken), 'Marken'], [num(pv.lieferanten), 'Lieferanten'], [num(pv.warengruppen), 'Warengruppen'], [num(pv.bestand), 'Stück Bestand'], [num(pv.bilder_eingebettet), 'eingebettete Bilder'], [num(pv.bilder_links), 'Bild-Links']])}
      <div class="card" style="margin-bottom:14px"><div class="set-row"><div class="set-l">Optionen</div></div>
        ${sw('bestand', 'Bestand übernehmen', 'bucht den Bestand je Farbe als „Anfangsbestand (Advarics-Import)“ – Größen sind im Export nicht enthalten (Größe „one size“)')}
        ${sw('preise', 'VK-Preise bereits vorhandener Artikel aktualisieren', 'neue Artikel erhalten immer den VK aus der Datei')}
        ${sw('bilder', 'Bilder übernehmen', 'eingebettete Bilder werden gespeichert, Bild-Links im Hintergrund geladen')}
        ${sw('inaktiv', `Inaktive Artikel mitimportieren (${num(pv.inaktiv)})`, 'sonst werden als inaktiv markierte Artikel übersprungen')}
        ${sw('demo_weg', 'Demo-Artikel vorher deaktivieren', 'das Marken-Demosortiment verschwindet aus Kasse und Liste')}</div>
      <div class="card" style="padding:14px 16px;margin-bottom:14px;font-size:13px;line-height:1.55">${ic('info', 'i-sm')} Zeilen ohne VK-Preis (${num(pv.ohne_vk)}), z. B. Kassenpositionen wie „Anzahlung“, „Service“, „Verleih“ oder Displays, werden nicht als Artikel angelegt und nach dem Import aufgelistet. Mehrere Zeilen mit gleicher Marke und Artikel-Nr. werden zu <b>einem Artikel mit mehreren Farben</b>. Lieferanten und Warengruppen werden angelegt. Ein zweiter Import derselben Datei legt nichts doppelt an. ${pv.negativ ? `<br><b>${pv.negativ}</b> Artikel haben negativen Bestand in Advarics – er wird so übernommen.` : ''}</div>
      <div style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" data-advgo ${ADV.busy ? 'disabled' : ''} style="height:44px;padding:0 22px">${ic('download', 'i-sm')}${ADV.busy ? 'Import läuft …' : `${num(pv.artikel)} Artikel importieren`}</button><span data-advprog class="muted" style="font-size:13px"></span></div>` : loadingCard('Lese Datei')}`}
    ${r ? `<div class="card" style="padding:16px 18px;margin-top:16px;border-color:var(--pos)"><b style="color:var(--pos)">${ic('check', 'i-sm')} Import abgeschlossen</b><div style="margin-top:8px;font-size:13.5px;line-height:1.7">${num(r.neu)} Artikel neu · ${num(r.aktualisiert)} aktualisiert · ${num(r.varianten)} Varianten · ${num(r.lieferanten_neu)} Lieferanten · ${num(r.warengruppen_neu)} Warengruppen · ${num(r.bilder_eingebettet)} Bilder übernommen · ${num(r.bilder_links)} Bild-Links werden im Hintergrund geladen${r.demo_entfernt ? ` · ${num(r.demo_entfernt)} Demo-Artikel deaktiviert` : ''}${r.inaktiv_uebersprungen ? ` · ${num(r.inaktiv_uebersprungen)} inaktive übersprungen` : ''}</div>
      ${(r.ohne_vk || []).length ? `<details style="margin-top:10px"><summary style="cursor:pointer">${r.ohne_vk.length} Zeilen ohne VK-Preis nicht importiert</summary><div class="mono" style="font-size:12px;max-height:200px;overflow:auto;margin-top:6px">${r.ohne_vk.map(esc).join('<br>')}</div></details>` : ''}
      ${(r.fehler || []).length ? `<details open style="margin-top:10px"><summary style="cursor:pointer;color:var(--neg)">${r.fehler.length} Fehler</summary><div class="mono" style="font-size:12px;max-height:200px;overflow:auto;margin-top:6px">${r.fehler.map(esc).join('<br>')}</div></details>` : ''}
      <div style="margin-top:12px"><button class="btn btn-secondary" data-goto="artikel">${ic('tag', 'i-sm')}Zu den Artikeln</button></div></div>` : ''}</div>`;
  const poll = async () => { if (!ADV.busy) return; try { const s = await invoke('settings_get'); const p = s['import.fortschritt']; const el = $('[data-advprog]'); if (el && p) el.textContent = `${{lesen: 'Datei wird gelesen', artikel: 'Artikel', bilder: 'Bilder', fertig: 'fertig'}[p.phase] || p.phase}${p.gesamt ? ` ${num(p.fertig)} / ${num(p.gesamt)}` : ''}`; } catch { /* */ } ADV.timer = setTimeout(poll, 2000); };
  if (ADV.busy) { clearTimeout(ADV.timer); poll(); }
  v.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.advpick != null) {
      return advPick();
      return;
    }
    if (b.dataset.advo) { ADV.opt[b.dataset.advo] = !ADV.opt[b.dataset.advo]; b.setAttribute('aria-checked', ADV.opt[b.dataset.advo]); return; }
    if (b.dataset.advgo != null) {
      try { await needPerm('artikel.bearbeiten', 'Advarics-Import'); } catch { return; }
      if (!await confirmBox(`${num(ADV.pv.artikel)} Artikel aus Advarics importieren? Das kann einige Minuten dauern – Kontor bleibt dabei bedienbar.`, 'Importieren')) return;
      ADV.busy = true; ADV.res = null; PAGES['advarics-import'].render();
      try { ADV.res = await invoke('advarics_import', {path: ADV.path, ...{inaktiv: ADV.opt.inaktiv, bestand: ADV.opt.bestand, preise: ADV.opt.preise, bilder: ADV.opt.bilder, demoWeg: ADV.opt.demo_weg}, user: S.user.name}); await loadStamm(true); replaceCatalog(await invoke('catalog_list')); try { await loadSuppliers(); } catch { /* */ } toast('Import abgeschlossen', {t2: `${ADV.res.neu} Artikel neu`, type: 'pos', icon: 'download'}); Hooks.emit('catalog.advarics.import', {neu: ADV.res.neu, aktualisiert: ADV.res.aktualisiert}); }
      catch (err) { toast('Import fehlgeschlagen', {t2: String(err), type: 'warn', dur: 9000}); }
      ADV.busy = false; clearTimeout(ADV.timer); if (S.view === 'advarics-import') PAGES['advarics-import'].render();
    }
  };
}});
VIEW_PERM['advarics-import'] = 'artikel.bearbeiten';
