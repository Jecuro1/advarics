/* ════════════════════════════════════════════════════════════════════
   Artikel im Advarics-Stil: Artikelliste als Datentabelle und Artikelmaske als eigene Seite
   mit Werkzeugleiste (Übersicht · Aktualisieren · Sichern · Neu · Änderungen zurücknehmen · Löschen ·
   Artikel-Service), Datensatz-Navigation und den Reitern Allgemein, Basispreise, Filial-Preise,
   Scancodes, Bestand, Preisänderungen, Buchungen, Artikel-Karte, Zusätzl. Lieferanten,
   Artikel-Merkmale, Zusatz-Preise, Bilder-Zuordnung, Attribut-/Text-Zuordnung, Übersetzung,
   NOS Monatswerte und Vorgänger-Artikel.
   ════════════════════════════════════════════════════════════════════ */
const AE = {ids: [], args: [null, undefined]};
const AE_TABS = [['stamm', 'Allgemein'], ['basis', 'Basispreise'], ['filial', 'Filial-Preise'], ['scan', 'Scancodes'], ['bestand', 'Bestand'], ['preisaend', 'Preisänderungen'], ['buch', 'Buchungen'], ['karte', 'Artikel-Karte'],
  ['zlief', 'Zusätzl. Lieferanten'], ['merk', 'Artikel-Merkmale'], ['zpreis', 'Zusatz-Preise'], ['bilder', 'Bilder-Zuordnung'], ['attr', 'Attribut-Zuordnung'], ['text', 'Text-Zuordnung'], ['uebers', 'Übersetzung'], ['nos', 'NOS Monatswerte'], ['vorg', 'Vorgänger-Artikel'],
  ['beschreibung', 'Beschreibung'], ['material', 'Material & Pflege'], ['technik', 'Maße & Technik'], ['klass', 'Klassifikation & Zoll'], ['web', 'Webshop'], ['varianten', 'Farben & Größen']];

STAMM_DEF.artikeltext = {t: 'Artikeltexte', ic: 'edit', sub: 'Textbausteine, die Artikeln im Reiter „Text-Zuordnung“ zugeordnet werden', cols: [{k: 'name', l: 'Name'}, {k: 'format', l: 'Format', t: 'select', o: () => [['Text', 'Text'], ['HTML', 'HTML'], ['Markdown', 'Markdown']]}, {k: 'text', l: 'Text', t: 'area', w: 420}]};
stammPage('artikeltext', 'st-artikeltext'); VIEW_PERM['st-artikeltext'] = 'artikel.bearbeiten';
{ const ap = NAV.find(n => n.label === 'Artikel' && false); const g = NAV.findIndex(n => n.g === 'Artikel'); for (let i = g + 1; i < NAV.length && !NAV[i].g; i++) if (NAV[i].label === 'Artikelpflege' && !NAV[i].kids.some(k => k.id === 'st-artikeltext')) NAV[i].kids.push({id: 'st-artikeltext', label: 'Artikeltexte', icon: 'edit'}); void ap; }

const eur0n = v => v == null || v === '' ? '' : eur(+v);
const aeUid = () => Math.random().toString(36).slice(2, 9);
const aeStoreName = () => (typeof storeObj === 'function' ? storeObj().name : 'Filiale 1');

/** Kleines Eingabefenster für Datensätze in den Reitern */
function aeForm(title, fields, vals = {}, {del} = {}) {
  return new Promise(res => {
    const v = {...vals};
    const el = openLayer(`<div class="modal" style="width:min(560px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('edit')}</div><div><h2>${esc(title)}</h2></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:12px;grid-template-columns:1fr 1fr">${fields.map(f => `<label class="field" ${f.w === 'full' ? 'style="grid-column:1/-1"' : ''}><span>${esc(f.l)}${f.req ? ' <b class="req">*</b>' : ''}</span>${f.t === 'select' ? `<select class="input select" data-af="${f.k}"><option value="">–</option>${(typeof f.o === 'function' ? f.o(v) : f.o).map(([x, l]) => `<option value="${esc(x)}" ${String(v[f.k] ?? '') === String(x) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : f.t === 'check' ? `<input type="checkbox" data-af="${f.k}" ${v[f.k] ? 'checked' : ''} style="width:22px;height:22px">` : `<input class="input ${f.t === 'num' ? 'num' : ''}" ${f.t === 'date' ? 'type="date"' : ''} data-af="${f.k}" value="${esc(v[f.k] ?? '')}" ${f.ro ? 'disabled' : ''}>`}</label>`).join('')}</div>
      <div class="m-foot">${del ? `<button class="btn btn-ghost" data-afdel style="color:var(--neg)">${ic('trash', 'i-sm')}Löschen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-afok>${ic('check', 'i-sm')}Übernehmen</button></div></div>`, {onClose: () => res(null)});
    $('[data-afok]', el).onclick = () => {
      const o = {...vals}; $$('[data-af]', el).forEach(i => { o[i.dataset.af] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
      const miss = fields.find(f => f.req && !String(o[f.k] ?? '').trim()); if (miss) { toast(`${miss.l} angeben`, {type: 'warn'}); return; }
      el._done = true; res(o); closeLayer(el);
    };
    const d = $('[data-afdel]', el); if (d) d.onclick = () => { el._done = true; res({_del: true}); closeLayer(el); };
  });
}

/* ── Datenquellen der Reiter ── */
const aeArt = ctx => ctx.a ? ART.find(x => x.id === ctx.a.id) || ctx.a : null;
const aeEk = ctx => { const e = parseAmt(ctx.st.cost); return isFinite(e) && String(ctx.st.cost).trim() ? e : null; };
const aeVk = ctx => { const p = parseAmt(ctx.st.price); return isFinite(p) ? p : null; };
const grNr = s => { const r = stRows('groesse').find(x => String(x.name).toLowerCase() === String(s).toLowerCase()); return r ? +r.nr : null; };
function aeVariantRows(ctx) {
  const a = aeArt(ctx); if (!a) return [];
  const order = a.sizes || [];
  return a.variants.map(v => ({id: v.ean, ean: v.ean, size: v.s, color: colorName(v.c), gsort: grNr(v.s) ?? (order.indexOf(v.s) + 1) * 100, g1: v.s, ek: aeEk(ctx), vk: aeVk(ctx), visu: aeVk(ctx), mwst: +ctx.st.vat === 0 ? 'Ohne MwSt.' : +ctx.st.vat === 10 || +ctx.st.vat === 13 ? 'Reduziert' : 'Standard', item: v.vid ?? '', stock: v.q, vid: v.vid}));
}
const aeList = (ctx, k) => (ctx.st.d[k] ||= []);

const C_MONEY = {t: 'num', fmt: v => eur0n(v)};
const priceCols = [
  {k: 'ean', l: 'EAN/GTIN', w: 150}, {k: 'size', l: 'Größe', w: 90}, {k: 'gsort', l: 'Größensort.-Nr.', t: 'num', w: 120}, {k: 'stat', l: 'Statistik-Größe', w: 120}, {k: 'g1', l: 'Größe 1', w: 90}, {k: 'g2', l: 'Größe 2', w: 90},
  {k: 'ek', l: 'EK', w: 90, ...C_MONEY}, {k: 'vk', l: 'VK', w: 90, ...C_MONEY}, {k: 'visu', l: 'Visu. VK', w: 100, ...C_MONEY}, {k: 'mwst', l: 'MwSt.-Typ', w: 100}, {k: 'item', l: 'Item-ID', t: 'num', w: 90}];

function aeGrundpreis(ctx, row, done) {
  const el = openLayer(`<div class="modal" style="width:min(820px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('tag')}</div><div><h2>Grundpreis</h2><p>${esc(row.ean)} · Größe ${esc(row.size)}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:14px;grid-template-columns:repeat(3,1fr)">
      <div class="ae-card"><h4>Allgemein</h4><label class="field"><span>EAN/GTIN</span><input class="input" value="${esc(row.ean)}" disabled></label><label class="field"><span>Zolltarifnummer</span><input class="input" value="${esc(ctx.st.d.zolltarif || '')}" disabled></label></div>
      <div class="ae-card"><h4>Preis</h4><label class="field"><span>EK</span><input class="input num" data-gp="cost" value="${esc(aeEk(ctx) != null ? num(aeEk(ctx), 2) : '')}"></label><label class="field"><span>VK</span><input class="input num" data-gp="price" value="${esc(String(ctx.st.price))}"></label><label class="field"><span>MwSt.-Typ</span><input class="input" value="${esc(row.mwst)}" disabled></label></div>
      <div class="ae-card"><h4>Größen</h4><label class="field"><span>Größe</span><input class="input" value="${esc(row.size)}" disabled></label><label class="field"><span>Größensort.-Nr.</span><input class="input" value="${esc(row.gsort)}" disabled></label></div></div>
    <div class="m-foot"><span class="muted" style="font-size:12px">Preise gelten für den ganzen Artikel (alle Größen).</span><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-gok>${ic('check', 'i-sm')}Übernehmen</button></div></div>`);
  $('[data-gok]', el).onclick = () => { ctx.st.cost = $('[data-gp="cost"]', el).value; ctx.st.price = $('[data-gp="price"]', el).value; closeLayer(el); done(); toast('Preis übernommen', {t2: 'mit „Sichern“ speichern', type: 'pos'}); };
}

/* ── Raster-Beschreibungen je Reiter ── */
const AE_GRIDS = {
  basis: {
    top: ctx => `<div class="ae-card ae-row"><label class="field" style="min-width:300px"><span>Größenschlüssel*</span><select class="input select" data-aesz><option value="">–</option>${stOpts('groessenschluessel').map(([x, l]) => `<option value="${esc(x)}">${esc(l)}</option>`).join('')}</select></label></div>`,
    cfg: ctx => ({embed: true, title: 'Basispreise', cols: priceCols, rows: () => aeVariantRows(ctx),
      extra: [{k: 'neu', l: 'Neu', icon: 'plus'}, {k: 'alle', l: 'Preis für alle Filial-Preise für alle Größen übernehmen', icon: 'plus'}],
      actions: {neu: async () => { const o = await aeForm('Neue Größe', [{k: 'size', l: 'Größe', req: true}]); if (!o?.size) return; const s = new Set(ctx.sizesArr()); s.add(o.size); ctx.st.sizes = [...s].join(', '); toast('Größe vorgemerkt', {t2: 'mit „Sichern“ werden Variante und EAN angelegt', type: 'pos'}); }, alle: () => toast('Filial-Preise übernehmen den Basispreis', {t2: 'Preise gelten derzeit für alle Filialen gleich', icon: 'info'})},
      edit: (id, done) => { const r = aeVariantRows(ctx).find(x => x.id === id); if (r) aeGrundpreis(ctx, r, () => ctx.setTab('basis')); }}),
    bind: (ctx, root) => { const s = $('[data-aesz]', root); s.onchange = () => { const g = stRows('groessenschluessel').find(x => x.id === s.value); const sizes = g?.groessen || g?.werte || g?.sizes; if (Array.isArray(sizes) && sizes.length) { ctx.st.sizes = sizes.join(', '); toast('Größenlauf übernommen', {t2: 'mit „Sichern“ speichern', type: 'pos'}); } }; },
  },
  filial: {
    card: true,
    cfg: ctx => ({embed: true, title: 'Filial-Preise', cols: [{k: 'filiale', l: 'Filiale', w: 140}, ...priceCols], group: [], rows: () => {
      const fil = new Set([aeStoreName(), ...((ctx.card?.stores) || []).map(s => s.name)]);
      return [...fil].flatMap(f => aeVariantRows(ctx).map(r => ({...r, id: f + r.ean, filiale: f})));
    }, extra: [{k: 'neu', l: 'Neu', icon: 'plus'}, {k: 'alle', l: 'Preis für alle Filial-Preise für alle Größen übernehmen', icon: 'plus'}], actions: {neu: () => toast('Filial-Preise übernehmen den Basispreis', {icon: 'info'}), alle: () => toast('Alle Filialen verwenden den Basispreis', {icon: 'info'})}}),
  },
  scan: {
    cfg: ctx => ({embed: true, title: 'Scancodes', group: ['ean'], cols: [{k: 'ean', l: 'EAN/GTIN', show: false}, {k: 'quelle', l: 'Quelle', w: 160}, {k: 'scan', l: 'Scancode', w: 220}, {k: 'size', l: 'Größe', w: 120}],
      rows: () => [...aeVariantRows(ctx).map(r => ({id: 'i' + r.ean, ean: r.ean, quelle: 'Item', scan: r.ean, size: r.size, _fix: true})), ...aeList(ctx, 'scancodes').map(s => ({id: s.id, ean: s.ean, quelle: 'ScanCode', scan: s.scan, size: s.size}))],
      extra: [{k: 'neu', l: 'Neu', icon: 'plus'}],
      actions: {neu: async () => { const vs = aeVariantRows(ctx); if (!vs.length) return toast('Erst Artikel speichern', {type: 'warn'}); const o = await aeForm('Scancode [-1]', [{k: 'scan', l: 'Scancode', req: true}, {k: 'ean', l: 'Größe / EAN', t: 'select', o: vs.map(v => [v.ean, `${v.size} · ${v.ean}`]), req: true}]); if (!o?.scan) return; const v = vs.find(x => x.ean === o.ean); aeList(ctx, 'scancodes').push({id: aeUid(), scan: o.scan, ean: o.ean, size: v?.size || ''}); ctx.setTab('scan'); }},
      remove: async ids => { const d = ids.filter(i => !String(i).startsWith('i')); ctx.st.d.scancodes = aeList(ctx, 'scancodes').filter(s => !d.includes(s.id)); ctx.setTab('scan'); }}),
  },
  bestand: {
    card: true,
    cfg: ctx => ({embed: true, title: 'Bestand', cols: [{k: 'filiale', l: 'Filial-Kurzname', w: 130}, {k: 'filnr', l: 'Fil.-Nr.', t: 'num', w: 70}, {k: 'size', l: 'Größe', w: 80}, {k: 'gsort', l: 'Größensort.-Nr.', t: 'num', w: 120}, {k: 'g1', l: 'Größe 1', w: 80}, {k: 'g2', l: 'Größe 2', w: 80}, {k: 'stock', l: 'Lagerbestand', t: 'num', w: 110, sum: true}, {k: 'trans', l: 'Transport-Me.', t: 'num', w: 110}, {k: 'order', l: 'allzeit Order-Me.', t: 'num', w: 120}, {k: 'ordrs', l: 'Order-Me. mit Rückstd.', t: 'num', w: 150}, {k: 'rck', l: 'Rck.-Me.', t: 'num', w: 90}, {k: 'ld1', l: '1. Liefer-Datum von', w: 130}, {k: 'ld2', l: '1. Liefer-Datum bis', w: 130}, {k: 'pick', l: 'Picklist.-Von-Me ungeb.', t: 'num', w: 150}],
      rows: () => {
        const own = aeVariantRows(ctx).map(r => ({id: 'o' + r.ean, filiale: aeStoreName(), filnr: flNr(vbOwn()) || 1, size: r.size, gsort: r.gsort, g1: r.g1, g2: '', stock: r.stock, trans: 0, order: 0, ordrs: 0, rck: 0, ld1: '', ld2: '', pick: 0}));
        const ord = new Map(); (ctx.card?.stores || []).forEach(s => ord.set(s.store, (ord.get(s.store) || 0) + 1));
        const nr = new Map([...ord.keys()].map((k, i) => [k, flNr(k) || i + 2]));
        const others = (ctx.card?.stores || []).map(s => ({id: s.store + s.ean, filiale: s.name, filnr: nr.get(s.store), size: s.size, gsort: '', g1: s.size, g2: '', stock: s.stock, trans: 0, order: 0, ordrs: 0, rck: 0, ld1: '', ld2: '', pick: 0}));
        return [...own, ...others];
      }}),
  },
  preisaend: {
    card: true,
    cfg: ctx => ({embed: true, title: 'Preisänderungen', cols: [{k: 'ean', l: 'EAN/GTIN', w: 140}, {k: 'size', l: 'Größe', w: 80}, {k: 'gsort', l: 'Größensort.-Nr.', t: 'num', w: 120}, {k: 'filnr', l: 'Fil.-Nr.', t: 'num', w: 70}, {k: 'filiale', l: 'Filial-Name', w: 140}, {k: 'ts', l: 'geändert', w: 150}, {k: 'aek', l: 'Alter EK', w: 90, ...C_MONEY}, {k: 'nek', l: 'Neuer EK', w: 90, ...C_MONEY}, {k: 'avk', l: 'Alter VK', w: 90, ...C_MONEY}, {k: 'nvk', l: 'Neuer VK', w: 90, ...C_MONEY}, {k: 'avisu', l: 'aktueller visu. VK', w: 130, ...C_MONEY}, {k: 'nvisu', l: 'neuer visu. VK', w: 120, ...C_MONEY}, {k: 'pid', l: 'ID', t: 'num', w: 70}],
      rows: () => (ctx.card?.prices || []).map(p => ({id: 'p' + p.id, ean: 'alle Größen', size: '', gsort: '', filnr: 1, filiale: aeStoreName(), ts: fmtTs ? fmtTs(p.ts) : p.ts, aek: p.alt_ek != null ? p.alt_ek / 100 : null, nek: p.neu_ek != null ? p.neu_ek / 100 : null, avk: p.alt_vk / 100, nvk: p.neu_vk / 100, avisu: p.alt_vk / 100, nvisu: p.neu_vk / 100, pid: p.id}))}),
  },
  buch: {
    card: true,
    cfg: ctx => ({embed: true, title: 'Buchungen', cols: [{k: 'bid', l: 'Buchg.-ID', t: 'num', w: 90}, {k: 'ts', l: 'Buchungs-Datum', w: 150}, {k: 'filiale', l: 'Filial-Name', w: 130}, {k: 'filnr', l: 'Fil.-Nr.', t: 'num', w: 70}, {k: 'size', l: 'Größe', w: 80}, {k: 'gsort', l: 'Größensort.-Nr.', t: 'num', w: 120}, {k: 'g1', l: 'Größe 1', w: 80}, {k: 'g2', l: 'Größe 2', w: 80}, {k: 'typ', l: 'Buchungstyp', w: 150}, {k: 'menge', l: 'Menge', t: 'num', w: 80, sum: true}, {k: 'rest', l: 'Best.-Me.', t: 'num', w: 90}, {k: 'ek', l: 'EK', w: 80, ...C_MONEY}, {k: 'vk', l: 'VK', w: 80, ...C_MONEY}, {k: 'saisonnr', l: 'Saison-Nr.', w: 90}, {k: 'saison', l: 'Saison-Name', w: 130}],
      rows: () => { const sz = aeArt(ctx)?.sizes || []; return (ctx.card?.moves || []).map(m => ({id: 'm' + m.id, bid: m.id, ts: fmtTs ? fmtTs(m.ts) : m.ts, filiale: aeStoreName(), filnr: 1, size: m.size, gsort: (sz.indexOf(m.size) + 1) * 100, g1: m.size, g2: '', typ: m.reason, menge: m.delta, rest: m.after, ek: aeEk(ctx), vk: aeVk(ctx), saisonnr: '', saison: ctx.st.d.saison || ''})); }}),
  },
  zlief: {
    cfg: ctx => ({embed: true, title: 'Zusätzl. Lieferanten', cols: [{k: 'lnr', l: 'Lief.-Nr.', w: 100}, {k: 'lname', l: 'Lief.-Name', w: 240}, {k: 'ext_art', l: 'Ext. Art.-Nr.', w: 180}, {k: 'ext_farb', l: 'Ext. Farb-Nr.', w: 160}],
      rows: () => aeList(ctx, 'zusatz_lieferanten').map(r => { const s = lfSup(r.lid); return s ? {...r, lnr: s.nr != null ? String(s.nr) : r.lnr, lname: s.name || r.lname} : r; }),
      extra: [{k: 'neu', l: 'Neu', icon: 'plus'}],
      actions: {neu: () => aeZlief(ctx, null)}, edit: id => aeZlief(ctx, id),
      remove: async ids => { ctx.st.d.zusatz_lieferanten = aeList(ctx, 'zusatz_lieferanten').filter(x => !ids.includes(x.id)); ctx.setTab('zlief'); }}),
  },
  merk: {
    cfg: ctx => ({embed: true, title: 'Artikel-Merkmale', cols: [{k: 'merkmal', l: 'Merkmal', w: 220}, {k: 'wert', l: 'Wert', w: 260}],
      rows: () => aeList(ctx, 'merkmale'), extra: [{k: 'neu', l: 'Neu', icon: 'plus'}],
      actions: {neu: () => aeMerk(ctx, null)}, edit: id => aeMerk(ctx, id),
      remove: async ids => { ctx.st.d.merkmale = aeList(ctx, 'merkmale').filter(x => !ids.includes(x.id)); ctx.setTab('merk'); }}),
  },
  zpreis: {
    cfg: ctx => ({embed: true, title: 'Zusatz-Preise', cols: [{k: 'ean', l: 'EAN/GTIN', w: 160}, {k: 'size', l: 'Größe', w: 90}, {k: 'gruppe', l: 'Preisgruppe', w: 180}, {k: 'vk', l: 'VK', t: 'num', w: 100, ...C_MONEY}],
      rows: () => aeList(ctx, 'zusatz_preise'), extra: [{k: 'gruppen', l: 'Preise für Gruppen anlegen', icon: 'plus'}],
      actions: {gruppen: () => {
        const vs = aeVariantRows(ctx), gs = stActive('preisgruppe'), vk = aeVk(ctx);
        if (!vs.length || !gs.length || vk == null) return toast('Preisgruppen unter Stammdaten anlegen, Artikel speichern', {type: 'warn'});
        const l = aeList(ctx, 'zusatz_preise'); let n = 0;
        gs.forEach(g => vs.forEach(v => { if (!l.some(x => x.ean === v.ean && x.gruppe === g.name)) { l.push({id: aeUid(), ean: v.ean, size: v.size, gruppe: g.name, vk: Math.round(vk * (1 - (+g.pct || 0) / 100) * 100) / 100}); n++; } }));
        toast(`${n} Preise angelegt`, {t2: 'aus dem Rabatt der Preisgruppe – mit „Sichern“ speichern', type: 'pos'}); ctx.setTab('zpreis');
      }},
      edit: async id => { const r = aeList(ctx, 'zusatz_preise').find(x => x.id === id); if (!r) return; const o = await aeForm('Zusatz-Preis', [{k: 'gruppe', l: 'Preisgruppe', ro: true}, {k: 'vk', l: 'VK', t: 'num'}], {...r, vk: String(r.vk).replace('.', ',')}); if (o) { r.vk = parseAmt(o.vk); ctx.setTab('zpreis'); } },
      remove: async ids => { ctx.st.d.zusatz_preise = aeList(ctx, 'zusatz_preise').filter(x => !ids.includes(x.id)); ctx.setTab('zpreis'); }}),
  },
  uebers: {
    cfg: ctx => ({embed: true, title: 'Übersetzung', cols: [{k: 'sprache', l: 'Sprache', w: 140}, {k: 'iso', l: 'ISO', w: 70}, {k: 'name', l: 'Artikel-Name', w: 280}, {k: 'beschr', l: 'Artikel Beschreibung', w: 480}],
      rows: () => aeList(ctx, 'uebersetzungen'), extra: [{k: 'neu', l: 'Neu', icon: 'plus'}],
      actions: {neu: () => aeUebers(ctx, null)}, edit: id => aeUebers(ctx, id),
      remove: async ids => { ctx.st.d.uebersetzungen = aeList(ctx, 'uebersetzungen').filter(x => !ids.includes(x.id)); ctx.setTab('uebers'); }}),
  },
  nos: {
    cfg: ctx => ({embed: true, title: 'NOS Monatswerte', cols: [{k: 'filnr', l: 'Fil.-Nr.', t: 'num', w: 80}, {k: 'filiale', l: 'Filiale', w: 140}, ...['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'].map((m, i) => ({k: 'm' + (i + 1), l: m, t: 'num', w: 90}))],
      rows: () => aeList(ctx, 'nos'), extra: [{k: 'neu', l: 'Neu', icon: 'plus'}],
      actions: {neu: () => aeNos(ctx, null)}, edit: id => aeNos(ctx, id),
      remove: async ids => { ctx.st.d.nos = aeList(ctx, 'nos').filter(x => !ids.includes(x.id)); ctx.setTab('nos'); }}),
  },
  vorg: {
    top: ctx => { const vid = ctx.st.d.vorgaenger_artikel || ''; return `<div class="ae-card ae-row"><label class="field" style="min-width:360px"><span>Artikel</span><input class="input" data-aevg list="aeVgList" value="${esc(vid ? (artById(vid) ? `${vid} · ${artById(vid).name}` : vid) : '')}" placeholder="Artikelnummer oder Name …"></label><datalist id="aeVgList">${ART.filter(x => x.id !== ctx.a?.id).slice(0, 3000).map(x => `<option value="${esc(x.id + ' · ' + x.name)}">`).join('')}</datalist><label class="ae-sw"><button class="switch" role="switch" data-aevgall aria-checked="${!!ctx.st.d.vorgaenger_alle}"></button> Alle Artikel aller Lieferanten anzeigen</label></div>`; },
    cfg: ctx => ({embed: true, title: 'Vorgänger-Artikel', cols: [{k: 'ean', l: 'EAN/GTIN', w: 150}, {k: 'size', l: 'Größe', w: 80}, {k: 'vean', l: 'Vorgänger-EAN', w: 160}, {k: 'vsize', l: 'Vorgänge-Größe', w: 130}, {k: 'vnr', l: 'Vorgänger-Artikel-Nr.', w: 160}, {k: 'vname', l: 'Vorgänger-Artikel-Name', w: 220}, {k: 'vfarb', l: 'Vorgänger-Lief.-Farb-Nr.', w: 170}, {k: 'vmarke', l: 'Vorgänger-Marke', w: 140}, {k: 'vchg', l: 'Vorgänger-EAN ändern', w: 160}],
      rows: () => { const p = artById(ctx.st.d.vorgaenger_artikel || ''); const map = ctx.st.d.vorgaenger_map || {}; return aeVariantRows(ctx).map(r => { const pv = p?.variants.find(x => x.s === r.size); const vean = map[r.ean] || pv?.ean || ''; const pv2 = p?.variants.find(x => x.ean === vean); return {id: r.ean, ean: r.ean, size: r.size, vean, vsize: pv2?.s || '', vnr: p ? p.id : '', vname: p ? p.name : '', vfarb: pv2 ? colorName(pv2.c) : '', vmarke: p ? p.brand : '', vchg: vean ? '✎' : ''}; }); },
      edit: async id => { const r = aeVariantRows(ctx).find(x => x.id === id); const o = await aeForm('Vorgänger-EAN ändern', [{k: 'ean', l: 'EAN/GTIN', ro: true}, {k: 'vean', l: 'Vorgänger-EAN'}], {ean: id, vean: (ctx.st.d.vorgaenger_map || {})[id] || ''}); if (o) { (ctx.st.d.vorgaenger_map ||= {})[id] = o.vean; ctx.setTab('vorg'); } void r; }}),
    bind: (ctx, root) => {
      const i = $('[data-aevg]', root); i.onchange = () => { const m = /^(.+?) · /.exec(i.value) || [null, i.value.trim()]; ctx.st.d.vorgaenger_artikel = artById(m[1]) ? m[1] : ''; ctx.setTab('vorg'); };
      $('[data-aevgall]', root).onclick = () => { ctx.st.d.vorgaenger_alle = !ctx.st.d.vorgaenger_alle; ctx.setTab('vorg'); };
    },
  },
};

async function aeZlief(ctx, id) {
  const l = aeList(ctx, 'zusatz_lieferanten'), r = id ? l.find(x => x.id === id) : null;
  const o = await aeForm(r ? 'Zusätzl. Lieferanten' : 'Zusätzl. Lieferanten [-1]', [{k: 'lid', l: 'Lieferant', t: 'select', o: lfOptionen(r?.lid), req: true, w: 'full'}, {k: 'ext_art', l: 'Ext. Art.-Nr.'}, {k: 'ext_farb', l: 'Ext. Farb-Nr.'}], r ? {...r} : {}, {del: !!r});
  if (!o) return;
  if (o._del) ctx.st.d.zusatz_lieferanten = l.filter(x => x.id !== id);
  else { const s = lfSup(o.lid); const row = {id: r?.id || aeUid(), lid: o.lid, lnr: s?.nr != null ? String(s.nr) : s?.id || o.lid, lname: s?.name || o.lid, ext_art: o.ext_art || '', ext_farb: o.ext_farb || ''}; if (r) Object.assign(r, row); else l.push(row); }
  ctx.setTab('zlief');
}
async function aeMerk(ctx, id) {
  const l = aeList(ctx, 'merkmale'), r = id ? l.find(x => x.id === id) : null, defs = stActive('artikelmerkmal');
  const o = await aeForm('Artikel-Merkmal', [{k: 'merkmal', l: 'Merkmal', t: 'select', o: defs.map(d => [d.name || d.id, d.name || d.id]), req: true, w: 'full'}, {k: 'wert', l: 'Wert', w: 'full'}], r ? {...r} : {}, {del: !!r});
  if (!o) return;
  if (o._del) ctx.st.d.merkmale = l.filter(x => x.id !== id); else if (r) Object.assign(r, {merkmal: o.merkmal, wert: o.wert || ''}); else l.push({id: aeUid(), merkmal: o.merkmal, wert: o.wert || ''});
  ctx.setTab('merk');
}
async function aeUebers(ctx, id) {
  const l = aeList(ctx, 'uebersetzungen'), r = id ? l.find(x => x.id === id) : null, langs = stActive('sprache').map(s => [s.id, s.name || s.id]);
  const o = await aeForm('Übersetzung', [{k: 'iso', l: 'Sprache', t: 'select', o: langs.length ? langs : [['en', 'Englisch'], ['fr', 'Französisch'], ['it', 'Italienisch']], req: true, w: 'full'}, {k: 'name', l: 'Artikel-Name', w: 'full'}, {k: 'beschr', l: 'Artikel Beschreibung', w: 'full'}], r ? {...r} : {}, {del: !!r});
  if (!o) return;
  if (o._del) ctx.st.d.uebersetzungen = l.filter(x => x.id !== id); else { const lg = (langs.find(x => x[0] === o.iso) || [o.iso, o.iso])[1]; const row = {id: r?.id || aeUid(), iso: o.iso, sprache: lg, name: o.name || '', beschr: o.beschr || ''}; if (r) Object.assign(r, row); else l.push(row); }
  ctx.setTab('uebers');
}
async function aeNos(ctx, id) {
  const l = aeList(ctx, 'nos'), r = id ? l.find(x => x.id === id) : null;
  const mon = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const o = await aeForm('NOS Monatswerte', [{k: 'filnr', l: 'Fil.-Nr.', t: 'num'}, {k: 'filiale', l: 'Filiale'}, ...mon.map((m, i) => ({k: 'm' + (i + 1), l: m, t: 'num'}))], r ? {...r} : {filnr: '1', filiale: aeStoreName()}, {del: !!r});
  if (!o) return;
  if (o._del) ctx.st.d.nos = l.filter(x => x.id !== id); else { const row = {id: r?.id || aeUid(), filnr: o.filnr, filiale: o.filiale}; mon.forEach((m, i) => { row['m' + (i + 1)] = parseInt(o['m' + (i + 1)], 10) || 0; }); if (r) Object.assign(r, row); else l.push(row); }
  ctx.setTab('nos');
}

/* ── Reiter-Inhalte ── */
const AE_GRID_TABS = {};
for (const [k, spec] of Object.entries(AE_GRIDS)) AE_GRID_TABS[k] = ctx => `<div class="ae-pane">${spec.top ? spec.top(ctx) : ''}<div data-aeg="${k}"></div></div>`;
const aeField = (l, v, w) => `<label class="field" ${w ? `style="min-width:${w}px"` : ''}><span>${esc(l)}</span><input class="input" value="${esc(v ?? '')}" disabled></label>`;
AE_GRID_TABS.karte = ctx => {
  const a = aeArt(ctx), st = ctx.st; if (!a) return '<div class="empty" style="padding:40px"><h3>Artikel noch nicht gespeichert</h3></div>';
  const sup = lfSup(st.supplierId), m = (a.media || []).find(x => x.file), img = m ? imgUrl(m.file) : a.image ? imgUrl(a.image) : null;
  const d = st.d, today = new Date().toLocaleDateString('de-DE');
  const sizes = a.sizes.map(s => ({s, q: a.variants.filter(v => v.s === s).reduce((t, v) => t + v.q, 0)}));
  return `<div class="ae-pane"><div class="ae-cards">
    <div class="ae-card"><h4>Artikel-Info</h4>${aeField('Artikel-ID', a.id)}${aeField('Artikel-Nr.', d.hersteller_artikelnr || a.id)}${aeField('Artikel-Name', st.name)}</div>
    <div class="ae-card"><h4>Farben-Info</h4>${aeField('Lief.-Farb-Nr.', a.colors[0] || '')}${aeField('Lief.-Farb-Name', colorName(a.colors[0]))}${aeField('Haus-Farbe', a.colors.map(colorName).join(', '))}</div>
    <div class="ae-card"><h4>Zusatz-Info</h4>${aeField('Marke', st.brand)}${aeField('Hersteller', mkArtikelInfo(st.brand).hersteller)}${mkKarteChip(st.brand)}${aeField('Lieferant', sup?.name || '')}${aeField('Warengruppe', catName(st.cat))}</div>
    <div class="ae-card"><h4>WE Info</h4>${aeField('Letzte WE-Saison-Nr.', '')}${aeField('Letzte WE-Saison-Name', d.saison || '')}${aeField('Datum letzter WE', '')}</div>
    <div class="ae-card"><h4>Bild-URL</h4>${img ? `<img src="${esc(img)}" alt="" style="width:110px;height:110px;object-fit:contain;border-radius:8px;background:var(--surface-2)">` : '<span class="muted">kein Bild</span>'}</div>
    <div class="ae-card"><h4>WE-Datum</h4>${aeField('WE-Datum von', '01.01.1900')}${aeField('WE-Datum bis', today)}</div>
    <div class="ae-card"><h4>VK-Datum</h4>${aeField('VK-Datum von', '01.01.1900')}${aeField('VK-Datum bis', today)}</div>
    <div class="ae-card"><h4>Aktion</h4><button class="btn btn-secondary btn-sm" id="aeKarteRef">${ic('sync', 'i-sm')}Aktualisieren</button></div></div>
    <div class="ae-total"><div class="ae-totalh">Gesamt</div><table class="tbl" style="margin:0"><thead><tr><th>Größe</th><th class="r">Bestand</th></tr></thead><tbody>${sizes.map(x => `<tr><td>${esc(x.s)}</td><td class="r">${num(x.q)}</td></tr>`).join('')}<tr><td><b>Summe</b></td><td class="r"><b>${num(a.stock)}</b></td></tr></tbody></table></div></div>`;
};
for (const [k, label, kind, key, src] of [['attr', 'Attribut', 'Attribut', 'attribute', () => stActive('artikelmerkmal').flatMap(d => (d.werte?.length ? d.werte : ['']).map(w => ({name: d.name || d.id, attribut: w})))], ['text', 'Text', 'Text', 'texte', () => stActive('artikeltext').map(t => ({id: t.id, name: t.name, format: t.format || 'Text', text: String(t.text || '').slice(0, 80)}))]]) {
  AE_GRID_TABS[k] = ctx => `<div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnet</h4><div data-aeg="${k}-a"></div></div><div class="ae-card"><h4>Nicht zugeordnet</h4><div data-aeg="${k}-b"></div></div></div>`;
  AE_GRIDS[k] = {two: true, cfgs: ctx => {
    const all = src().map((r, i) => ({...r, id: k === 'attr' ? `${r.name}|${r.attribut}` : r.id}));
    const mine = aeList(ctx, key); const has = id => mine.some(x => (x.id || `${x.name}|${x.attribut}`) === id);
    const cols = k === 'attr' ? [{k: 'name', l: 'Name', w: 200}, {k: 'attribut', l: 'Attribut', w: 240}] : [{k: 'text', l: 'Text', w: 260}, {k: 'name', l: 'Name', w: 180}, {k: 'format', l: 'Format', w: 100}];
    const mv = (ids, add) => {
      ids.forEach(id => {
        const i = mine.findIndex(x => (x.id || `${x.name}|${x.attribut}`) === id);
        if (i >= 0 && !add) mine.splice(i, 1);
        else if (i < 0 && add) { const r = all.find(x => x.id === id); if (r) mine.push(k === 'attr' ? {name: r.name, attribut: r.attribut} : {id: r.id, name: r.name, format: r.format, text: r.text}); }
      });
      ctx.setTab(k);
    };
    const flip = id => mv([id], !has(id));
    const [da, db] = agDual(`ae-${k}-a`, `ae-${k}-b`, mv);
    return [{embed: true, title: label + ' zugeordnet', cols, rows: () => all.filter(r => has(r.id)), edit: flip, dnd: da}, {embed: true, title: label + ' nicht zugeordnet', cols, rows: () => all.filter(r => !has(r.id)), edit: flip, dnd: db}];
  }};
}

/** Nach dem Zeichnen eines Reiters: Tabellen einhängen, Daten der Reiter laden */
function aeAfter(ctx, tab) {
  const spec = AE_GRIDS[tab];
  if (tab === 'stamm') {
    const calc = () => { const m = $('#edMargin', ctx.el); if (!m) return; const vk = parseAmt($('[data-f="price"]', ctx.el)?.value || ''), ek = parseAmt($('[data-f="cost"]', ctx.el)?.value || ''), vat = +($('[data-f="vat"]', ctx.el)?.value || 20); if (vk > 0 && ek > 0) { const net = vk / (1 + vat / 100); m.textContent = `Spanne ${num((net - ek) / net * 100, 1)} % · Aufschlag ${num((net - ek) / ek * 100, 1)} %`; } else m.textContent = ''; };
    ['price', 'cost', 'vat'].forEach(k => $(`[data-f="${k}"]`, ctx.el)?.addEventListener('input', calc)); calc(); return;
  }
  if (tab === 'karte') { $('#aeKarteRef', ctx.el)?.addEventListener('click', () => ctx.setTab('karte')); $('[data-mk-open]', ctx.el)?.addEventListener('click', e => mkOeffnen(e.currentTarget.dataset.mkOpen)); return; }
  if (!spec) return;
  const mount = () => {
    if (ctx.tab !== tab) return;
    if (spec.two) { const [c1, c2] = spec.cfgs(ctx); ['a', 'b'].forEach((s, i) => { const h = $(`[data-aeg="${tab}-${s}"]`, ctx.el); if (!h) return; const key = `ae-${tab}-${s}`; AG[key] = agNew([c1, c2][i]); agMount(key, h); }); return; }
    const h = $('[data-aeg]', ctx.el); if (!h) return;
    const key = 'ae-' + tab; AG[key] = agNew(spec.cfg(ctx)); AG[key].cfg.reload = () => ctx.setTab(tab); agMount(key, h);
    spec.bind?.(ctx, ctx.el);
  };
  if (spec.card && ctx.a && ctx.cardFor !== ctx.a.id) {
    const h = $('[data-aeg]', ctx.el); if (h) h.innerHTML = '<div class="muted" style="padding:24px">Lade …</div>';
    const fin = c => { ctx.card = c; ctx.cardFor = ctx.a.id; mount(); };
    if (DESKTOP) invoke('article_card', {id: ctx.a.id}).then(fin).catch(() => fin({moves: [], stores: [], prices: []})); else fin({moves: [], stores: [], prices: []});
  } else mount();
}

/** Artikel-Service: häufige Zusatzfunktionen */
function aeService(ctx, anchor) {
  const a = aeArt(ctx);
  const items = [['page', 'globe', 'Aus Produktseite übernehmen …', 'stamm'], ['ai', 'sparkle', 'Beschreibung mit KI erstellen', 'stamm'], ['lbl', 'tag', 'Etiketten drucken', null], ['info', 'info', 'Artikelinfo öffnen', null], ['bild', 'image', 'Bilder hinzufügen …', 'bilder']];
  const el = openPopover(anchor, `<div class="ag-menu">${items.map(([k, i, l]) => `<button class="nav-item" data-sv="${k}" style="--lvl:0;width:100%">${ic(i)}<span class="nav-label">${esc(l)}</span></button>`).join('')}</div>`, {align: 'left', width: 300});
  el?.addEventListener('click', e => {
    const b = e.target.closest('[data-sv]'); if (!b) return; closePopover();
    const k = b.dataset.sv;
    if (k === 'lbl') { if (a) openLabels(a.variants.map(v => ({a, v, n: 1}))); else toast('Erst Artikel speichern', {type: 'warn'}); return; }
    if (k === 'info') { if (a) { AIF.sel = a.id; go('artikelinfo'); } return; }
    const tab = items.find(x => x[0] === k)[3]; ctx.setTab(tab);
    setTimeout(() => $(k === 'page' ? '#edPage' : k === 'ai' ? '#edAi' : '#gAdd', ctx.el)?.click(), 60);
  });
}

/* ── Artikelmaske als Seite ── */
registerPage('artikel-edit', {title: 'Artikel', sub: () => AE.args[0] ? `${AE.args[0].id} · ${AE.args[0].name}` : 'Neuer Artikel', render: () => {
  const host = $('#view-artikel-edit'); if (!host) return;
  artEditorMount(host, AE.args[0], AE.args[1]);
  $$('.nav-item').forEach(n => n.dataset.view === 'artikel' ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current'));
}});
openEditor = function (a, tab0, ids) {
  if (ids) AE.ids = ids;
  AE.args = [a || null, tab0];
  if (S.view === 'artikel-edit') PAGES['artikel-edit'].render(); else go('artikel-edit');
};

/* ── Artikelliste als Datentabelle ── */
/** Große Bildansicht mit Blättern (Pfeiltasten, Esc) */
function openImageViewer(imgs, start = 0, title = '') {
  if (!imgs.length) return;
  let i = Math.max(0, Math.min(start, imgs.length - 1));
  const el = openLayer(`<div class="imgv" role="dialog" aria-modal="true" aria-label="Bildansicht"><div class="imgv-main"><img alt=""><button class="imgv-nav" data-iv="-1" style="left:12px" aria-label="Zurück">‹</button><button class="imgv-nav" data-iv="1" style="right:12px" aria-label="Weiter">›</button></div>
    <div><div class="imgv-cap"><b data-ivt></b><span data-ivn></span><button class="btn btn-secondary btn-sm" data-close>Schließen</button></div><div class="imgv-strip">${imgs.map((m, k) => `<img data-ivs="${k}" src="${esc(m.url)}" alt="">`).join('')}</div></div></div>`, {cls: '', focus: '[data-close]'});
  const show = () => { $('.imgv-main img', el).src = imgs[i].url; $('[data-ivt]', el).textContent = imgs[i].caption || title; $('[data-ivn]', el).textContent = `${i + 1} / ${imgs.length}`; $$('[data-ivs]', el).forEach(x => x.setAttribute('aria-current', +x.dataset.ivs === i)); $$('[data-iv]', el).forEach(b => { b.style.display = imgs.length > 1 ? '' : 'none'; }); };
  const step = d => { i = (i + d + imgs.length) % imgs.length; show(); };
  el.addEventListener('click', e => { const b = e.target.closest('[data-iv]'), s = e.target.closest('[data-ivs]'); if (b) step(+b.dataset.iv); else if (s) { i = +s.dataset.ivs; show(); } });
  el.addEventListener('keydown', e => { if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); });
  show();
}
window.openImageViewer = openImageViewer;
const artImages = a => { const l = (a.media || []).filter(m => m.file).map(m => ({url: imgUrl(m.file), caption: m.caption || ''})); if (!l.length && a.image) l.push({url: imgUrl(a.image), caption: ''}); return l; };
const aeThumb = a => { const m = (a.media || []).find(x => x.file); const f = m?.file || a.image; return f ? `<img class="ag-thumb" data-agimg="${esc(a.id)}" src="${esc(imgUrl(f))}" alt="Bild vergrößern" title="Bild vergrößern">` : `<span class="ag-nothumb">${ic('image', 'i-sm')}</span>`; };
const aeRows = () => ART.map(a => ({id: a.id, a, brand: a.brand, nr: a.details?.hersteller_artikelnr || a.id, name: a.name, fnr: a.colors[0] || '', fname: colorName(a.colors[0]), ek: a.cost, vk: a.price, visu: a.sale || a.price, stock: a.stock, vars: a.variants.length, wg: catName(a.cat), lief: SUPPLIERS.find(s => s.id === a.supplierId)?.name || '', saison: a.details?.saison || '', tag: a.tag || ''}));
agridPage('artikel', {
  title: 'Artikel', rowH: 68,
  onImage: id => { const a = artById(id); if (a) openImageViewer(artImages(a), 0, a.name); },
  rows: aeRows,
  count: () => ART.length,
  toolbar: [{k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}, {k: 'imp', l: 'Import', icon: 'download'}, {k: 'label', l: 'Etiketten', icon: 'tag'}],
  cols: [
    {k: 'img', l: '', w: 80, html: r => aeThumb(r.a), get: () => ''},
    {k: 'brand', l: 'Marke', w: 130}, {k: 'nr', l: 'Artikel-Nr.', w: 120}, {k: 'name', l: 'Artikel-Name', w: 280}, {k: 'fnr', l: 'Lief.-Farb-Nr.', w: 110}, {k: 'fname', l: 'Lief.-Farb-Name', w: 130},
    {k: 'ek', l: 'EK', t: 'num', w: 80, fmt: v => v == null ? '' : eur(v)}, {k: 'vk', l: 'VK', t: 'num', w: 80, fmt: v => eur(v)}, {k: 'visu', l: 'Visu. VK', t: 'num', w: 90, fmt: v => eur(v)},
    {k: 'stock', l: 'Bestand', t: 'num', w: 80, sum: true}, {k: 'vars', l: 'Varianten', t: 'num', w: 80}, {k: 'wg', l: 'Warengruppe', w: 220}, {k: 'lief', l: 'Lieferant', w: 200}, {k: 'saison', l: 'Saison', w: 110}, {k: 'tag', l: 'Kennzeichnung', w: 110, show: false}, {k: 'id', l: 'Intern-ID', w: 130, show: false},
  ],
  actions: {
    refresh: async () => { try { if (DESKTOP) replaceCatalog(await invoke('catalog_list')); } catch { /* */ } PAGES.artikel.render(); },
    new: () => openEditor(null, 'stamm', []),
    imp: () => go('advarics-import'),
    label: () => { const sel = AG.artikel.sel; const l = ART.filter(a => sel.has(a.id)); if (!l.length) return toast('Artikel ankreuzen', {t2: 'für die Etikettenausgabe', icon: 'info'}); openLabels(l.flatMap(a => a.variants.map(v => ({a, v, n: 1})))); },
  },
  edit: id => { const a = artById(id); if (a) openEditor(a, 'stamm', (AG.artikel.filtered || []).map(r => r.id)); },
  remove: async ids => {
    if (!await confirmBox(`${num(ids.length)} Artikel deaktivieren? Belege und Historie bleiben erhalten.`, 'Deaktivieren')) throw new Error('abgebrochen');
    try { await needPerm('artikel.bearbeiten', 'Artikel deaktivieren'); } catch { throw new Error('abgebrochen'); }
    for (const id of ids) { if (DESKTOP) await invoke('article_delete', {id, user: S.user.name}); const i = ART.findIndex(x => x.id === id); if (i >= 0) ART.splice(i, 1); }
    toast('Artikel deaktiviert', {t2: `${ids.length}`, icon: 'trash'});
  },
});
VIEW_PERM.artikel ||= undefined; delete VIEW_PERM.artikel;
renderArtikel = function () { PAGES.artikel.render(); };
renderArtTable = function () { if (S.view === 'artikel') PAGES.artikel.render(); };

/* ── Stammdaten › Größen › Größen (Advarics-Größenliste mit Sortierungsnr.) ── */
STAMM_DEF.groesse = {t: 'Größen', ic: 'grid', sub: 'Alle Größen mit Sortierungsnummer', cols: [{k: 'name', l: 'Größe'}, {k: 'nr', l: 'Sortierungsnr.', t: 'num'}, {k: 'g1', l: 'Größe 1'}, {k: 'g2', l: 'Größe 2'}]};
const grRows = () => stRows('groesse').map(r => ({id: r.id, name: r.name || '', nr: +r.nr || 0, g1: r.g1 || '', g2: r.g2 || '', _raw: r}));
async function grEdit(id, done) {
  const all = stRows('groesse'), r = id ? all.find(x => x.id === id) : null;
  const o = await aeForm(r ? 'Größe bearbeiten' : 'Neue Größe', [{k: 'name', l: 'Größe', req: true, w: 'full'}, {k: 'nr', l: 'Sortierungsnr.', t: 'num', req: true}, {k: 'g1', l: 'Größe 1'}, {k: 'g2', l: 'Größe 2'}],
    r ? {name: r.name, nr: String(r.nr ?? ''), g1: r.g1 || '', g2: r.g2 || ''} : {nr: String(Math.max(0, ...all.map(x => +x.nr || 0)) + 1)}, {del: !!r});
  if (!o) return;
  try {
    await needPerm('einstellungen', 'Größen');
    let list = all.map(x => ({...x}));
    if (o._del) list = list.filter(x => x.id !== id);
    else if (r) list = list.map(x => x.id === id ? {...x, name: o.name, nr: parseInt(o.nr, 10) || 0, g1: o.g1, g2: o.g2} : x);
    else { if (list.some(x => String(x.name).toLowerCase() === o.name.toLowerCase())) return toast(`Größe „${o.name}“ gibt es schon`, {type: 'warn'}); list.push({id: 'gr-' + aeUid(), _aktiv: true, name: o.name, nr: parseInt(o.nr, 10) || 0, g1: o.g1, g2: o.g2}); }
    await stammSave('groesse', list); done();
  } catch (err) { if (String(err.message || err) !== 'abgebrochen') toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
}
agridPage('st-groesse', {
  title: 'Größen', rows: grRows, count: () => stRows('groesse').length, sort: {k: 'nr', dir: 1},
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'name', l: 'Größe', w: 320}, {k: 'nr', l: 'Sortierungsnr.', t: 'num', w: 160}, {k: 'g1', l: 'Größe 1', w: 160}, {k: 'g2', l: 'Größe 2', w: 160}],
  actions: {back: () => history.length > 1 ? history.back() : go('dashboard'), refresh: async () => { await loadStamm(true); PAGES['st-groesse'].render(); }, new: () => grEdit(null, () => PAGES['st-groesse'].render())},
  edit: (id, done) => grEdit(id, done),
  remove: async ids => { if (!await confirmBox(`${num(ids.length)} Größe${ids.length > 1 ? 'n' : ''} löschen?`, 'Löschen')) throw new Error('abgebrochen'); await needPerm('einstellungen', 'Größen'); const s = new Set(ids); await stammSave('groesse', stRows('groesse').filter(r => !s.has(r.id)).map(r => ({...r}))); },
});

/* ── Stammdaten › Größen › Größenschlüssel ── */
delete STAMM_DEF.groessenschluessel.seed;
STAMM_DEF.groessenschluessel.cols = [{k: 'nr', l: 'Nr.', t: 'num'}, {k: 'name', l: 'Name'}, {k: 'sync', l: 'Synchronisiert', t: 'check'}, {k: 'groessen', l: 'Größen', t: 'list'}];
const gsRows = () => stRows('groessenschluessel').map(r => ({id: r.id, nr: +r.nr || 0, name: r.name || '', sync: !!r.sync, anz: (r.groessen || []).length, groessen: (r.groessen || []).join(', '), _raw: r}));
function gsEdit(id, done) {
  const all = stRows('groessenschluessel'), r = id ? all.find(x => x.id === id) : null;
  const sizes = [...stRows('groesse')].sort((a, b) => (+a.nr || 0) - (+b.nr || 0));
  const el = openLayer(`<div class="modal" style="width:min(640px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('grid')}</div><div><h2>${r ? 'Größenschlüssel bearbeiten' : 'Neuer Größenschlüssel'}</h2><p>${r ? esc(r.nr + ' · ' + r.name) : 'Name und Größen in der gewünschten Reihenfolge'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:22px;grid-template-columns:1fr 2fr">
      <label class="field"><span>Nr.</span><input class="input num" data-gs="nr" value="${esc(r ? r.nr : Math.max(0, ...all.map(x => +x.nr || 0)) + 1)}"></label>
      <label class="field"><span>Name *</span><input class="input" data-gs="name" value="${esc(r?.name || '')}"></label>
      <label class="ae-sw2" style="grid-column:1/-1"><input type="checkbox" data-gs="sync" ${r?.sync ? 'checked' : ''}><span>Synchronisiert</span></label>
      <label class="field" style="grid-column:1/-1"><span>Größen (eine je Zeile, in dieser Reihenfolge)</span><textarea class="input" data-gs="groessen" rows="8" style="height:auto">${esc((r?.groessen || []).join('\n'))}</textarea></label>
      <label class="field" style="grid-column:1/-1"><span>Aus der Größenliste hinzufügen</span><input class="input" data-gsadd list="gsList" placeholder="Größe tippen und Enter …"></label><datalist id="gsList">${sizes.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist></div>
    <div class="m-foot">${r ? `<button class="btn btn-ghost" data-gsdel style="color:var(--neg)">${ic('trash', 'i-sm')}Löschen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-gsok>${ic('check', 'i-sm')}Speichern</button></div></div>`, {focus: '[data-gs="name"]'});
  const f = k => $(`[data-gs="${k}"]`, el);
  const add = $('[data-gsadd]', el);
  add.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = add.value.trim(); if (v) { f('groessen').value = (f('groessen').value.trim() ? f('groessen').value.trim() + '\n' : '') + v; add.value = ''; } } });
  const save = async list => { await needPerm('einstellungen', 'Größenschlüssel'); await stammSave('groessenschluessel', list); closeLayer(el); done(); };
  $('[data-gsok]', el).onclick = async () => {
    const name = f('name').value.trim(); if (!name) return toast('Name angeben', {type: 'warn'});
    const data = {name, nr: parseInt(f('nr').value, 10) || 0, sync: f('sync').checked, groessen: f('groessen').value.split('\n').map(x => x.trim()).filter(Boolean)};
    let list = all.map(x => ({...x}));
    if (r) list = list.map(x => x.id === id ? {...x, ...data} : x); else list.push({id: 'gs-' + aeUid(), _aktiv: true, ...data});
    try { await save(list); } catch (err) { if (String(err.message || err) !== 'abgebrochen') toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
  };
  const d = $('[data-gsdel]', el); if (d) d.onclick = async () => { if (!await confirmBox(`Größenschlüssel „${r.name}“ löschen?`, 'Löschen')) return; try { await save(all.filter(x => x.id !== id).map(x => ({...x}))); } catch { /* */ } };
}
agridPage('st-groessenschluessel', {
  title: 'Größenschlüssel', rows: gsRows, count: () => stRows('groessenschluessel').length, sort: {k: 'nr', dir: 1},
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'nr', l: 'Nr.', t: 'num', w: 90}, {k: 'name', l: 'Name', w: 360}, {k: 'sync', l: 'Synchronisiert', t: 'check', w: 150}, {k: 'anz', l: 'Anzahl Größen', t: 'num', w: 130}, {k: 'groessen', l: 'Größen', w: 420, show: false}],
  actions: {back: () => history.length > 1 ? history.back() : go('dashboard'), refresh: async () => { await loadStamm(true); PAGES['st-groessenschluessel'].render(); }, new: () => gseOpen(null, [])},
  edit: id => gseOpen(id, (AG['st-groessenschluessel'].filtered || []).map(r => r.id)),
  remove: async ids => { if (!await confirmBox(`${num(ids.length)} Größenschlüssel löschen?`, 'Löschen')) throw new Error('abgebrochen'); await needPerm('einstellungen', 'Größenschlüssel'); const s = new Set(ids); await stammSave('groessenschluessel', stRows('groessenschluessel').filter(r => !s.has(r.id)).map(r => ({...r}))); },
});

/* ── Größenschlüssel bearbeiten: Allgemein (Zugeordnet / Nicht zugeordnet) und Statistikgrößen ── */
const GSE = {id: null, ids: [], draft: null, tab: 'allg'};
const gseLoad = id => { const r = id ? stRows('groessenschluessel').find(x => x.id === id) : null; return r ? {nr: String(r.nr ?? ''), name: r.name || '', sync: !!r.sync, groessen: [...(r.groessen || [])], stat: {...(r.stat || {})}} : {nr: String(Math.max(0, ...stRows('groessenschluessel').map(x => +x.nr || 0)) + 1), name: '', sync: false, groessen: [], stat: {}}; };
function gseOpen(id, ids) {
  GSE.id = id; GSE.ids = ids || GSE.ids; GSE.draft = gseLoad(id); GSE.tab = 'allg';
  if (S.view === 'st-groessenschluessel-edit') PAGES['st-groessenschluessel-edit'].render(); else go('st-groessenschluessel-edit');
}
const gseInfo = nm => { const g = stRows('groesse').find(x => x.name === nm); return {nr: g ? +g.nr || 0 : 0, g1: g?.g1 || '', g2: g?.g2 || ''}; };
function gseRender() {
  const host = $('#view-st-groessenschluessel-edit'); if (!host) return;
  const D = GSE.draft, isNew = !GSE.id, pos = GSE.ids.indexOf(GSE.id);
  const el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  const total = stRows('groessenschluessel').length;
  el.innerHTML = `<div class="ag-bar ae-bar"><button class="ag-btn" data-g="back">${ic('chevron-left', 'i-sm')}<span>Übersicht: Größenschlüssel</span></button><button class="ag-btn" data-g="refresh">${ic('sync', 'i-sm')}<span>Aktualisieren</span></button><button class="ag-btn" data-g="save">${ic('check', 'i-sm')}<span>Sichern</span></button><button class="ag-btn" data-g="new">${ic('plus', 'i-sm')}<span>Neu</span></button><button class="ag-btn" data-g="undo">${ic('undo', 'i-sm')}<span>Änderungen zurücknehmen</span></button>${isNew ? '' : `<button class="ag-btn" data-g="del">${ic('trash', 'i-sm')}<span>Löschen</span></button>`}<span style="flex:1"></span>${pos >= 0 ? `<span class="ae-nav"><button class="ag-btn" data-g="prev" ${pos <= 0 ? 'disabled' : ''}>${ic('chevron-left', 'i-sm')}</button><b>${pos + 1}/${GSE.ids.length}</b><button class="ag-btn" data-g="next" ${pos >= GSE.ids.length - 1 ? 'disabled' : ''}>${ic('chevron-right', 'i-sm')}</button></span>` : `<span class="ae-nav"><b>${total}</b></span>`}</div>
    <div class="ae-tabsw"><div class="ed-tabs"><button type="button" class="ed-tab" data-gt="allg" aria-selected="${GSE.tab === 'allg'}">Allgemein</button><button type="button" class="ed-tab" data-gt="stat" aria-selected="${GSE.tab === 'stat'}">Statistikgrößen</button></div></div>
    <div class="ae-body"><div id="edBody">${GSE.tab === 'allg'
      ? `<div class="ae-pane"><div class="ae-card"><h4>Allgemein</h4><div style="display:grid;gap:22px;grid-template-columns:140px minmax(240px,420px)"><label class="field"><span>Nr.*</span><input class="input num" data-gf="nr" value="${esc(D.nr)}"></label><label class="field"><span>Bezeichnung</span><input class="input" data-gf="name" value="${esc(D.name)}"></label></div></div>
        <div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnet</h4><div data-gg="a"></div></div><div class="ae-card"><h4>Nicht zugeordnet</h4><div data-gg="b"></div></div></div></div>`
      : `<div class="ae-pane"><div data-gg="s"></div></div>`}</div></div>`;
  const mountAll = () => {
    const assigned = () => D.groessen.map(n => ({id: n, name: n, ...gseInfo(n)})).sort((a, b) => a.nr - b.nr);
    const free = () => { const has = new Set(D.groessen); return stRows('groesse').filter(g => !has.has(g.name)).map(g => ({id: g.name, name: g.name, nr: +g.nr || 0, g1: g.g1 || '', g2: g.g2 || ''})); };
    const cols = [{k: 'name', l: 'Größe', w: 200}, {k: 'nr', l: 'Sortierungsnr.', t: 'num', w: 130}, {k: 'g1', l: 'Größe 1', w: 110}, {k: 'g2', l: 'Größe 2', w: 110}];
    const mv = (names, add) => { const s = new Set(D.groessen); names.forEach(n => add ? s.add(n) : s.delete(n)); D.groessen = [...s]; if (!add) names.forEach(n => delete D.stat[n]); gseCollect(el); gseRender(); };
    const mk = (key, host, cfg) => { if (!host) return; AG[key] = agNew({embed: true, ...cfg}); agMount(key, host); };
    if (GSE.tab === 'allg') {
      const [da, db] = agDual('gse-a', 'gse-b', mv);
      mk('gse-a', $('[data-gg="a"]', el), {title: 'Zugeordnet', cols, rows: assigned, sort: {k: 'nr', dir: 1}, dnd: da, edit: id => mv([id], false), extra: [{k: 'rm', l: 'Entfernen', icon: 'x'}], actions: {rm: () => { const sel = [...AG['gse-a'].sel]; if (sel.length) mv(sel, false); }}});
      mk('gse-b', $('[data-gg="b"]', el), {title: 'Nicht zugeordnet', cols, rows: free, sort: {k: 'nr', dir: 1}, dnd: db, edit: id => mv([id], true), extra: [{k: 'add', l: 'Zuordnen', icon: 'plus'}], actions: {add: () => { const sel = [...AG['gse-b'].sel]; if (sel.length) mv(sel, true); }}});
    } else {
      mk('gse-s', $('[data-gg="s"]', el), {title: 'Statistikgrößen', cols: [{k: 'name', l: 'Größe', w: 260}, {k: 'stat', l: 'Statistik-Größe', w: 260}], rows: () => assigned().map(r => ({id: r.id, name: r.name, stat: D.stat[r.name] || ''})),
        edit: async id => { const o = await aeForm('Statistik-Größe', [{k: 'name', l: 'Größe', ro: true}, {k: 'stat', l: 'Statistik-Größe'}], {name: id, stat: D.stat[id] || ''}); if (o) { if (o.stat) D.stat[id] = o.stat; else delete D.stat[id]; gseRender(); } }});
    }
  };
  mountAll();
  el.addEventListener('click', async e => {
    const t = e.target, b = t.closest('[data-g]'), tb = t.closest('[data-gt]');
    if (tb) { gseCollect(el); GSE.tab = tb.dataset.gt; return gseRender(); }
    if (!b) return;
    const k = b.dataset.g;
    gseCollect(el);
    if (k === 'back') return go('st-groessenschluessel');
    if (k === 'refresh' || k === 'undo') { GSE.draft = gseLoad(GSE.id); return gseRender(); }
    if (k === 'new') { GSE.id = null; GSE.draft = gseLoad(null); GSE.ids = []; return gseRender(); }
    if (k === 'prev' || k === 'next') { const id = GSE.ids[GSE.ids.indexOf(GSE.id) + (k === 'next' ? 1 : -1)]; if (id) { GSE.id = id; GSE.draft = gseLoad(id); GSE.tab = 'allg'; gseRender(); } return; }
    try {
      await needPerm('einstellungen', 'Größenschlüssel');
      const all = stRows('groessenschluessel').map(x => ({...x}));
      if (k === 'save') {
        const nr = parseInt(GSE.draft.nr, 10);
        if (!(nr > 0)) return toast('Nr. angeben', {type: 'warn'});
        if (!GSE.draft.name.trim()) return toast('Bezeichnung angeben', {type: 'warn'});
        if (all.some(x => x.id !== GSE.id && +x.nr === nr)) return toast(`Nr. ${nr} ist schon vergeben`, {type: 'warn'});
        const data = {nr, name: GSE.draft.name.trim(), sync: GSE.draft.sync, groessen: GSE.draft.groessen, stat: GSE.draft.stat};
        if (GSE.id) { const i = all.findIndex(x => x.id === GSE.id); all[i] = {...all[i], ...data}; } else { GSE.id = 'gs-' + aeUid(); all.push({id: GSE.id, _aktiv: true, ...data}); }
        await stammSave('groessenschluessel', all);
        GSE.ids = all.sort((a, b) => (+a.nr || 0) - (+b.nr || 0)).map(x => x.id).filter(id => GSE.ids.includes(id) || id === GSE.id);
        toast('Größenschlüssel gespeichert', {t2: `${data.groessen.length} Größen`, type: 'pos', icon: 'check'}); return gseRender();
      }
      if (k === 'del') { if (!await confirmBox(`Größenschlüssel „${GSE.draft.name}“ löschen?`, 'Löschen')) return; await stammSave('groessenschluessel', all.filter(x => x.id !== GSE.id)); go('st-groessenschluessel'); }
    } catch (err) { if (String(err.message || err) !== 'abgebrochen') toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
  });
}
function gseCollect(el) { const D = GSE.draft; $$('[data-gf]', el).forEach(i => { D[i.dataset.gf] = i.value; }); }
registerPage('st-groessenschluessel-edit', {title: 'Größenschlüssel', sub: () => GSE.draft ? `${GSE.draft.name || 'neu'} (${GSE.draft.nr})` : '', render: () => { if (!GSE.draft) GSE.draft = gseLoad(GSE.id); gseRender(); }});
VIEW_PERM['st-groessenschluessel-edit'] = 'einstellungen';
