
/* ════════════════════════════════════════════════════════════════════
   17 · ARTIKEL, BESTAND, BELEGE — Datenbank in der Desktop-App,
   im Browser nur im Speicher (Vorschau).
   ════════════════════════════════════════════════════════════════════ */
const GLYPHS = [['jacket', 'Jacke'], ['puffer', 'Daunen-/Steppjacke'], ['vest', 'Weste'], ['pants', 'Hose'], ['boot', 'Bergschuh'], ['shoe', 'Sportschuh'], ['backpack', 'Rucksack'], ['beanie', 'Mütze'], ['glove', 'Handschuh'], ['ski', 'Ski'], ['helmet', 'Helm'], ['shirt', 'Shirt'], ['fleece', 'Fleece'], ['socks', 'Socken'], ['goggles', 'Brille'], ['bottle', 'Flasche']];
const SIZE_PRESETS = [['S – XXL', 'S, M, L, XL, XXL'], ['XS – XL', 'XS, S, M, L, XL'], ['Damen 34 – 42', '34, 36, 38, 40, 42'], ['Herren 46 – 54', '46, 48, 50, 52, 54'], ['Schuhe 39 – 46', '39, 40, 41, 42, 43, 44, 45, 46'], ['Einheitsgröße', 'Einheitsgröße']];
const COLOR_KEYS = Object.keys(COLORS);
const catName = id => (CATS.find(c => c.id === id) || {name: id}).name;
const MEM = {moves: [], sales: []};   // Browser-Vorschau ohne Datenbank

function finishArt(a) {
  a.hay = norm([a.name, a.brand, catName(a.cat), a.id, ...a.colors.map(c => COLORS[c]?.[0] || c), ...a.variants.map(v => v.ean)].join(' '));
  a.stock = a.variants.reduce((s, v) => s + v.q, 0);
  return a;
}
function artFromDb(d) {
  return finishArt({id: d.id, name: d.name, brand: d.brand, cat: d.category, g: d.glyph || 'shirt', price: d.price / 100, sale: d.sale_price ? d.sale_price / 100 : undefined,
    vat: d.vat, tag: d.tag || undefined, pop: d.popularity, colors: d.colors, sizes: d.sizes, fields: d.fields || {}, prompts: Array.isArray(d.prompts) ? d.prompts : undefined,
    cost: d.cost != null ? d.cost / 100 : null, supplierId: d.supplier_id || '', minStock: d.min_stock ?? 2, image: d.image || null, details: d.details && typeof d.details === 'object' ? d.details : {}, media: d.media || [], baseSale: d.sale_price ? d.sale_price / 100 : null,
    variants: d.variants.map(v => ({vid: v.id, c: v.color, s: v.size, ean: v.ean, q: v.stock, other: null}))});
}
const artToDb = a => { const sale = 'baseSale' in a ? a.baseSale : a.sale; return {id: a.id, name: a.name, brand: a.brand || '', category: a.cat, glyph: a.g, price: Math.round(a.price * 100), sale_price: sale ? Math.round(sale * 100) : null,
  vat: a.vat ?? 20, tag: a.tag || null, popularity: a.pop || 0, colors: a.colors, sizes: a.sizes, fields: a.fields || {}, prompts: a.prompts || null,
  cost: a.cost != null ? Math.round(a.cost * 100) : null, supplier_id: a.supplierId || null, min_stock: a.minStock ?? 2, details: a.details || {},
  variants: a.variants.map(v => ({color: v.c, size: v.s, ean: v.ean, stock: v.q || 0}))}; };
function replaceCatalog(list) { ART.length = 0; list.forEach(d => ART.push(artFromDb(d))); applyPromos(); }
async function loadCatalog() {
  if (!DESKTOP) return;
  try {
    let list = await invoke('catalog_list');
    if (!list.length) {
      let n = 0;
      try { const r = await invoke('demo_brands_seed'); n = r.artikel; if (n) setTimeout(() => invoke('media_fetch_pending', {limit: 40}).catch(() => {}), 1500); } catch { /* */ }
      if (!n) n = await invoke('catalog_seed', {articles: ART.map(artToDb)});
      list = await invoke('catalog_list');
      if (n) setTimeout(() => toast('Startsortiment angelegt', {t2: `${n} Artikel mit Varianten und Anfangsbestand – unter „Artikel“ bearbeitbar`, icon: 'tag', type: 'accent', dur: 6000}), 1200);
    }
    try { if (typeof loadStamm === 'function') await loadStamm(true); } catch { /* */ }
    replaceCatalog(list);
    POS.no = await invoke('beleg_peek');
  } catch (e) { toast('Artikel konnten nicht geladen werden', {t2: String(e), type: 'warn', dur: 8000}); }
}
function recData(rec) {
  return {date: rec.date.toISOString(), cashier: rec.cashier, offline: rec.offline, sig: rec.sig, change: rec.change, billDisc: rec.billDisc || null, t: rec.t,
    parts: rec.parts.map(p => ({m: p.m, label: p.label, amount: p.amount, ref: p.ref, given: p.given || null, change: p.change || 0, code: p.code || null})),
    customer: rec.customer ? {id: rec.customer.id, name: rec.customer.name, points: rec.customer.points, email: rec.customer.email} : null,
    lines: rec.lines.map(l => ({name: l.name, sku: l.art?.id || null, ean: l.art && l.art.variants ? variant(l.art, l.c, l.s)?.ean || null : null, glyph: l.art?.g || null, c: l.c || null, s: l.s || null, qty: l.qty, unit: l.unit, was: l.was || null, vat: l.vat, disc: l.disc || null, service: !!l.service, voucher: !!l.voucher, icon: l.icon || null, meta: l.meta || null, vals: l.vals || null, ...(l.art && rabattGesperrt(l.art) ? {nodisc: true} : {})}))};
}
const recFromData = (no, d) => ({...d, no, date: new Date(d.date), lines: d.lines.map(l => ({...l, art: l.sku ? (artById(l.sku) || {g: l.glyph, id: l.sku}) : null}))});
async function commitSale(rec) {
  const data = recData(rec);
  if (!DESKTOP) {
    rec.lines.forEach(l => { if (l.art) { const v = variant(l.art, l.c, l.s); v.q -= l.qty; finishArt(l.art); } });
    MEM.sales.unshift({no: rec.no, ts: new Date().toISOString(), total: Math.round(rec.t.total * 100), cashier: rec.cashier, data});
    return null;
  }
  const lines = rec.lines.filter(l => l.art).map(l => ({ean: variant(l.art, l.c, l.s).ean, qty: l.qty}));
  const r = await invoke('sale_commit', {lines, total: Math.round(rec.t.total * 100), cashier: S.user.name, customer: rec.customer?.id || null, data});
  r.stocks.forEach(({ean, stock}) => { for (const a of ART) { const v = a.variants.find(x => x.ean === ean); if (v) { v.q = stock; finishArt(a); } } });
  return r;
}
async function bookStock(a, v, value, set, reason) {
  if (DESKTOP) v.q = await invoke('stock_book', {variantId: v.vid, value, set, reason, user: S.user.name});
  else { const before = v.q; v.q = set ? value : v.q + value; MEM.moves.unshift({ts: new Date().toISOString(), article_id: a.id, name: a.name, color: v.c, size: v.s, delta: v.q - before, stock_after: v.q, reason, user: S.user.name}); }
  finishArt(a);
  Hooks.emit('inventory.booked', {sku: a.id, variante: `${COLORS[v.c]?.[0] || v.c} / ${v.s}`, bestand: v.q, grund: reason});
  return v.q;
}

/* ── Artikelliste ── */
const AV = {q: '', cat: 'alle'};
function renderArtikel() {
  const v = $('#view-artikel');
  v.innerHTML = `<div class="cv">
    <div class="cv-head"><div><h2 class="h-title">Artikel</h2><div class="dash-meta" style="margin-top:6px"><span id="artCount"></span>${DESKTOP ? '' : '<span>·</span><span class="pill warn" style="height:20px">Vorschau – Änderungen werden nicht gespeichert</span>'}</div></div>
      <button class="btn btn-primary" id="artNew">${ic('plus', 'i-sm')}Neuer Artikel</button></div>
    <div class="cv-tools"><label class="search-field">${ic('search')}<input id="artQ" placeholder="Name, Marke, Artikelnummer oder EAN …" value="${esc(AV.q)}" autocomplete="off"></label>
      ${CATS.length > 16 ? `<select class="input select" id="artCatSel" style="flex:1;min-width:0;max-width:420px">${(() => { const n = {}; ART.forEach(a => { n[a.cat] = (n[a.cat] || 0) + 1; }); return [CATS[0], ...CATS.slice(1).filter(c => n[c.id] || c.id === AV.cat).sort((x, y) => x.name.localeCompare(y.name, 'de'))].map(c => `<option value="${esc(c.id)}" ${AV.cat === c.id ? 'selected' : ''}>${esc(c.name)}${c.id === 'alle' ? ` (${ART.length})` : ` (${n[c.id] || 0})`}</option>`).join(''); })()}</select>` : `<div class="cats" id="artCats" style="flex:1;min-width:0">${CATS.map(c => `<button class="cat" data-acat="${c.id}" aria-pressed="${AV.cat === c.id}">${c.name}</button>`).join('')}</div>`}</div>
    <div class="card" id="artTable"></div></div>`;
  renderArtTable();
}
function renderArtTable() {
  const q = norm(AV.q.trim()), toks = q.split(/\s+/).filter(Boolean);
  const list = ART.filter(a => (AV.cat === 'alle' || a.cat === AV.cat) && toks.every(t => a.hay.includes(t)));
  $('#artCount').textContent = `${list.length} von ${ART.length} Artikeln · ${num(ART.reduce((s, a) => s + a.variants.length, 0))} Varianten`;
  $('#artTable').innerHTML = list.length ? `<table class="tbl art-tbl"><thead><tr><th style="padding-left:16px;width:56px"></th><th>Artikel</th><th>Warengruppe</th><th class="r">Preis</th><th>Varianten</th><th class="r">Bestand</th><th>Eigene Felder</th><th></th></tr></thead><tbody>${list.map(a => {
    const c = COLORS[a.colors[0]]?.[1] || '#888', st = a.stock;
    return `<tr data-art="${esc(a.id)}"><td style="padding-left:16px"><span class="thumb" style="--c:${c}">${artVisual(a, c)}</span></td>
      <td><div style="font-weight:600">${esc(a.name)}${a.tag ? ` <span class="pill accent" style="height:18px;font-size:10.5px">${esc(a.tag)}</span>` : ''}</div><div class="muted" style="font-size:12px">${esc(a.brand)} · ${esc(a.id)}</div></td>
      <td>${esc(catName(a.cat))}</td>
      <td class="r"><b>${eur(a.sale || a.price)}</b>${a.promo ? `<div><span class="pill accent" style="height:17px;font-size:10px">${esc(a.promo)}</span></div>` : ''}${a.sale ? `<div class="muted" style="font-size:11.5px;text-decoration:line-through">${eur(a.price)}</div>` : ''}</td>
      <td><span style="display:inline-flex;gap:3px;vertical-align:middle;margin-right:6px">${a.colors.slice(0, 5).map(k => `<i style="width:10px;height:10px;border-radius:50%;background:${COLORS[k]?.[1]}"></i>`).join('')}</span><span class="muted">${a.colors.length} × ${a.sizes.length}</span></td>
      <td class="r"><span class="stock ${st <= 0 ? 'out' : st <= 6 ? 'low' : 'ok'}" style="justify-content:flex-end"><span class="dot"></span>${num(st)}</span></td>
      <td class="muted">${Object.keys(a.fields || {}).length || '–'}${a.prompts ? ' · Kassen-Pflichtfelder' : ''}</td>
      <td class="r" style="padding-right:14px;color:var(--text-3)">${ic('chevron-right', 'i-sm')}</td></tr>`; }).join('')}</tbody></table>`
    : `<div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('tag')}</div><h3>Keine Artikel gefunden</h3><p>Suche anpassen oder einen neuen Artikel anlegen.</p></div>`;
}
function nextArtId() { const n = Math.max(1000, ...ART.map(a => +(/^A(\d+)$/.exec(a.id)?.[1] || 0))); return 'A' + (n + 1); }
function newEan(artId, used) {
  const num5 = pad(+(artId.replace(/\D/g, '')) % 100000, 5), base = '20' + num5;
  let seq = 0; used.forEach(e => { if (e.startsWith(base)) seq = Math.max(seq, +e.slice(7, 12)); });
  return ean13(base + pad(seq + 1, 5));
}

/* ── Artikel-Editor ── */
function openEditor(a) {
  const isNew = !a;
  const st = a ? {id: a.id, name: a.name, brand: a.brand, cat: a.cat, g: a.g, price: num(a.price, 2), sale: ('baseSale' in a ? a.baseSale : a.sale) ? num('baseSale' in a ? a.baseSale : a.sale, 2) : '', vat: a.vat ?? 20, tag: a.tag || '', colors: [...a.colors], sizes: a.sizes.join(', '), fields: cfSplit('artikel', a.fields).free, cf: cfSplit('artikel', a.fields).typed, ski: !!a.prompts, pop: a.pop || 50, cost: a.cost != null ? num(a.cost, 2) : '', supplierId: a.supplierId || '', minStock: String(a.minStock ?? 2)}
    : {id: nextArtId(), name: '', brand: '', cat: AV.cat !== 'alle' ? AV.cat : 'jacken', g: 'jacket', price: '', sale: '', vat: 20, tag: '', colors: [], sizes: 'S, M, L, XL', fields: [], cf: {}, ski: false, pop: 50, cost: '', supplierId: '', minStock: '2'};
  const el = openLayer(`<div class="drawer-panel" style="width:min(600px,100%)" role="dialog" aria-modal="true" aria-label="Artikel bearbeiten"><div id="edHead"></div><div class="drawer-body" id="edBody"></div>
    <div class="m-foot" style="border-top:1px solid var(--line);padding-top:14px">${isNew ? '' : `<button class="btn btn-danger" id="edDel">${ic('trash', 'i-sm')}Deaktivieren</button>`}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="edSave">${ic('check', 'i-sm')}Speichern</button></div></div>`, {cls: 'drawer', focus: '[data-f="name"]'});
  const collect = () => {
    $$('[data-f]', el).forEach(i => { st[i.dataset.f] = i.value; });
    st.fields = $$('.frow', el).map(r => [$('[data-fk]', r).value.trim(), $('[data-fv]', r).value.trim()]);
    if ($('[data-cfobj="artikel"]', el)) st.cf = cfRead(el, 'artikel', true);
  };
  const sizesArr = () => [...new Set(String(st.sizes).split(',').map(s => s.trim()).filter(Boolean))];
  const render = () => {
    const c = COLORS[st.colors[0]]?.[1] || '#888', sizes = sizesArr();
    $('#edHead', el).innerHTML = `<div class="m-head" style="padding-bottom:14px"><span class="thumb" style="--c:${c};width:46px;height:46px;border-radius:12px">${a ? artVisual(a, c) : glyph(st.g, c)}</span><div><h2>${isNew ? 'Neuer Artikel' : esc(st.name)}</h2><p>${esc(st.id)} · ${st.colors.length * sizes.length} Varianten${isNew ? '' : ` · Bestand ${num(a.stock)}`}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>`;
    $('#edBody', el).innerHTML = `
      <div class="ed-grid">
        <label class="field full"><span>Bezeichnung <b class="req">*</b></span><input class="input" data-f="name" value="${esc(st.name)}" placeholder="z. B. Grat Hardshell Jacke"></label>
        <label class="field"><span>Marke</span><input class="input" data-f="brand" value="${esc(st.brand)}"></label>
        <label class="field"><span>Artikelnummer</span><input class="input" data-f="id" value="${esc(st.id)}" ${isNew ? '' : 'readonly style="opacity:.6"'}></label>
        <label class="field"><span>Warengruppe</span><select class="input select" data-f="cat">${CATS.filter(x => x.id !== 'alle').map(x => `<option value="${x.id}" ${x.id === st.cat ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
        <label class="field"><span>Darstellung</span><select class="input select" data-f="g">${GLYPHS.map(([k, l]) => `<option value="${k}" ${k === st.g ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Verkaufspreis € <b class="req">*</b></span><input class="input num" data-f="price" inputmode="decimal" value="${esc(st.price)}"></label>
        <label class="field"><span>Aktionspreis €</span><input class="input num" data-f="sale" inputmode="decimal" value="${esc(st.sale)}" placeholder="leer = kein Aktionspreis"></label>
        <label class="field"><span>Steuersatz</span><select class="input select" data-f="vat">${[20, 13, 10, 0].map(r => `<option value="${r}" ${+st.vat === r ? 'selected' : ''}>${r} %</option>`).join('')}</select></label>
        <label class="field"><span>Einkaufspreis netto € <span class="muted" id="edMargin"></span></span><input class="input num" data-f="cost" inputmode="decimal" value="${esc(st.cost)}" placeholder="für Spanne & Bestellung"></label>
        <label class="field"><span>Lieferant</span><select class="input select" data-f="supplierId"><option value="">–</option>${lfOptionen(st.supplierId).map(([id, name]) => `<option value="${esc(id)}" ${id === st.supplierId ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
        <label class="field"><span>Mindestbestand je Variante</span><input class="input num" data-f="minStock" inputmode="numeric" value="${esc(st.minStock)}"></label>
        <label class="field"><span>Kennzeichnung</span><select class="input select" data-f="tag"><option value="" ${!st.tag ? 'selected' : ''}>keine</option><option ${st.tag === 'Neu' ? 'selected' : ''}>Neu</option><option ${st.tag === 'Bestseller' ? 'selected' : ''}>Bestseller</option><option ${st.tag === 'Auslauf' ? 'selected' : ''}>Auslauf</option></select></label>
      </div>
      ${DESKTOP ? `<div class="ed-sec"><div class="lab">Bild <span class="muted">JPEG, PNG oder WebP · wird verkleinert gespeichert</span></div>${a ? `<div style="display:flex;gap:12px;align-items:center"><span class="thumb" style="--c:${c};width:84px;height:84px;border-radius:12px">${artVisual(a, c)}</span><button type="button" class="btn btn-secondary btn-sm" id="edImg">${ic('edit', 'i-sm')}${a.image ? 'Bild ändern' : 'Bild wählen …'}</button>${a.image ? `<button type="button" class="btn btn-ghost btn-sm" id="edImgRm">${ic('trash', 'i-sm')}Entfernen</button>` : ''}<span class="sp"></span><button type="button" class="btn btn-secondary btn-sm" id="edLbl">${ic('tag', 'i-sm')}Etiketten</button></div>` : '<div class="muted" style="font-size:12.5px">Nach dem ersten Speichern kann ein Bild gewählt werden.</div>'}</div>` : ''}
      <div class="ed-sec"><div class="lab">Farben <span class="muted">Reihenfolge = Anzeige · erste Farbe = Kachelbild</span></div><div class="cpick">${COLOR_KEYS.map(k => { const i = st.colors.indexOf(k); return `<button type="button" data-col="${k}" aria-pressed="${i >= 0}" style="--sw:${COLORS[k][1]}"><i></i>${COLORS[k][0]}${i >= 0 ? `<span class="ord">${i + 1}</span>` : ''}</button>`; }).join('')}</div></div>
      <div class="ed-sec"><div class="lab">Größen <span class="muted">durch Komma getrennt</span></div><input class="input" data-f="sizes" value="${esc(st.sizes)}"><div class="reasons" style="margin-top:8px">${SIZE_PRESETS.map(([l, val]) => `<button type="button" class="chip" data-sz="${esc(val)}">${l}</button>`).join('')}</div>
        <div class="prompt-hint">${ic('info', 'i-xs')}${st.colors.length * sizes.length} Varianten · EAN werden automatisch vergeben, bestehende bleiben erhalten · neue Varianten starten mit Bestand 0</div></div>
      ${cfHTML('artikel', st.cf, true, 'Felder')}
      <div class="ed-sec"><div class="lab">${cfDefs('artikel').length ? 'Weitere Angaben' : 'Eigene Felder'} <button type="button" class="btn btn-ghost btn-sm" id="edAddF">${ic('plus', 'i-sm')}Feld</button>${DESKTOP ? `<button type="button" class="btn btn-ghost btn-sm" id="edAi">${ic('sparkle', 'i-sm')}Text mit KI</button>` : ''}</div>
        <div id="edFields">${st.fields.map(([k, val]) => `<div class="frow"><input class="input" data-fk value="${esc(k)}" placeholder="Feld, z. B. Wassersäule"><input class="input" data-fv value="${esc(val)}" placeholder="Wert"><button type="button" class="btn btn-ghost btn-icon" data-rmf aria-label="Feld entfernen">${ic('x', 'i-sm')}</button></div>`).join('') || '<div class="muted" style="font-size:12.5px">Noch keine eigenen Felder – z. B. Material, Gewicht, Saison.</div>'}</div></div>
      <div class="ed-sec"><div class="set-row" style="padding:12px 14px;border:1px solid var(--line);border-radius:12px"><div><div class="set-l">Kassen-Pflichtfelder „Skiverkauf“</div><div class="set-h">Z-Wert Bindung (Pflicht) und Seriennummer beim Verkauf abfragen</div></div><div class="set-c" style="min-width:0"><button type="button" class="switch" role="switch" id="edSki" aria-checked="${st.ski}" aria-label="Kassen-Pflichtfelder"></button></div></div></div>`;
  };
  el.addEventListener('click', async e => {
    const t = e.target;
    const col = t.closest('[data-col]'); if (col) { collect(); const k = col.dataset.col, i = st.colors.indexOf(k); i >= 0 ? st.colors.splice(i, 1) : st.colors.push(k); return render(); }
    const sz = t.closest('[data-sz]'); if (sz) { collect(); st.sizes = sz.dataset.sz; return render(); }
    if (t.closest('#edAddF')) { collect(); st.fields.push(['', '']); render(); $$('[data-fk]', el).pop()?.focus(); return; }
    const rmf = t.closest('[data-rmf]'); if (rmf) { collect(); st.fields.splice($$('.frow', el).indexOf(rmf.closest('.frow')), 1); return render(); }
    if (t.closest('#edAi')) { collect(); const txt = await aiArticleText(st); if (txt) { const i = st.fields.findIndex(([k]) => k === 'Beschreibung'); i >= 0 ? (st.fields[i][1] = txt) : st.fields.push(['Beschreibung', txt]); render(); toast('Beschreibung erstellt', {t2: 'Bitte prüfen und bei Bedarf anpassen', type: 'pos', icon: 'sparkle'}); } return; }
    if (t.closest('#edSki')) { st.ski = !st.ski; $('#edSki', el).setAttribute('aria-checked', st.ski); return; }
    if (t.closest('#edImg')) { collect(); try { const n = await invoke('article_image_pick', {id: a.id}); if (n) { a.image = n; render(); renderArtTable(); toast('Bild übernommen', {t2: a.name, type: 'pos', icon: 'check'}); } } catch (err) { toast('Bild nicht übernommen', {t2: String(err), type: 'warn'}); } return; }
    if (t.closest('#edImgRm')) { collect(); try { await invoke('article_image_remove', {id: a.id}); a.image = null; render(); renderArtTable(); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } return; }
    if (t.closest('#edLbl')) return openLabels(a.variants.map(v => ({a, v, n: 1})));
    if (t.closest('#edDel')) {
      try { await stepUp({title: 'Artikel deaktivieren', text: `${a.name} wird aus Kasse und Liste entfernt. Belege und Historie bleiben erhalten.`}); } catch { return; }
      if (DESKTOP) { try { await invoke('article_delete', {id: a.id, user: S.user.name}); } catch (err) { return toast('Fehler', {t2: String(err), type: 'warn'}); } }
      ART.splice(ART.indexOf(a), 1); closeLayer(el); renderArtTable(); renderTopbar();
      toast('Artikel deaktiviert', {t2: a.name, icon: 'trash'}); Hooks.emit('catalog.article.deactivated', {sku: a.id}); return;
    }
    if (t.closest('#edSave')) {
      collect();
      const price = parseAmt(st.price), sale = String(st.sale).trim() ? parseAmt(st.sale) : null, sizes = sizesArr();
      const fail = msg => toast(msg, {type: 'warn', icon: 'alert'});
      if (!st.name.trim()) return fail('Bezeichnung fehlt');
      if (!st.id.trim()) return fail('Artikelnummer fehlt');
      if (isNew && ART.some(x => x.id === st.id.trim())) return fail('Artikelnummer bereits vergeben');
      if (!(price > 0)) return fail('Verkaufspreis fehlt');
      if (sale != null && !(sale > 0 && sale < price)) return fail('Aktionspreis muss unter dem Verkaufspreis liegen');
      if (!st.colors.length) return fail('Mindestens eine Farbe wählen');
      if (!sizes.length) return fail('Mindestens eine Größe angeben');
      const cfv = await cfCheck('artikel', st.cf, true); if (!cfv) return;
      const used = new Set(ART.flatMap(x => x.variants.map(v => v.ean)));
      const variants = [];
      st.colors.forEach(c => sizes.forEach(s => { const ex = a?.variants.find(v => v.c === c && v.s === s); if (ex) variants.push({...ex}); else { const ean = newEan(st.id, used); used.add(ean); variants.push({c, s, ean, q: 0, other: null}); } }));
      const art = finishArt({id: st.id.trim(), name: st.name.trim(), brand: st.brand.trim(), cat: st.cat, g: st.g, price: r2(price), sale: sale ? r2(sale) : undefined, vat: +st.vat, tag: st.tag || undefined, pop: st.pop,
        colors: [...st.colors], sizes, fields: {...Object.fromEntries(st.fields.filter(([k]) => k)), ...cfv}, prompts: st.ski ? SKI_PROMPTS : undefined, variants,
        cost: String(st.cost).trim() && isFinite(parseAmt(st.cost)) ? r2(parseAmt(st.cost)) : null, supplierId: st.supplierId || '', minStock: Math.max(0, parseInt(st.minStock, 10) || 0)});
      const btn = $('#edSave', el); btn.disabled = true;
      try {
        if (DESKTOP) replaceCatalog(await invoke('article_save', {article: artToDb(art), user: S.user.name}));
        else { const i = ART.findIndex(x => x.id === art.id); i >= 0 ? ART.splice(i, 1, art) : ART.unshift(art); }
      } catch (err) { btn.disabled = false; return fail(String(err)); }
      closeLayer(el); renderArtTable(); renderTopbar();
      toast(isNew ? 'Artikel angelegt' : 'Artikel gespeichert', {t2: `${art.name} · ${variants.length} Varianten${isNew ? ' – Bestand unter „Bestand“ buchen' : ''}`, type: 'pos', icon: 'tag', action: isNew ? {label: 'Bestand buchen', run: () => { INV.q = art.id; go('bestand'); }} : undefined});
      Hooks.emit('catalog.article.saved', {sku: art.id, name: art.name, varianten: variants.length, neu: isNew});
    }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('#edSave', el).click(); } });
  render();
}

/* ── Bestand ── */
const INV = {q: '', f: 'alle'};
function renderBestand() {
  const v = $('#view-bestand');
  const vars = ART.flatMap(a => a.variants.map(x => ({a, v: x})));
  const pieces = vars.reduce((s, x) => s + Math.max(0, x.v.q), 0), value = vars.reduce((s, x) => s + Math.max(0, x.v.q) * (x.a.sale || x.a.price), 0);
  const low = vars.filter(x => x.v.q > 0 && x.v.q <= 2).length, out = vars.filter(x => x.v.q <= 0).length;
  v.innerHTML = `<div class="cv">
    <div class="cv-head"><div><h2 class="h-title">Bestand</h2><div class="dash-meta" style="margin-top:6px"><span>Filiale ${esc(storeObj().name)}</span>${DESKTOP ? '' : '<span>·</span><span class="pill warn" style="height:20px">Vorschau – Buchungen werden nicht gespeichert</span>'}</div></div></div>
    <div class="kpis"><div class="card"><b class="num">${num(pieces)}</b><span>Stück lagernd</span></div><div class="card"><b>${eur0(value)}</b><span>Warenwert (VK)</span></div><div class="card"><b class="num">${num(vars.length)}</b><span>Varianten</span></div><div class="card"><b class="num" style="color:var(--warn)">${num(low)}</b><span>knapp (1–2 Stk.)</span></div><div class="card"><b class="num" style="color:var(--neg)">${num(out)}</b><span>ausverkauft</span></div></div>
    <div class="cv-tools"><label class="search-field">${ic('search')}<input id="invQ" placeholder="Artikel, Marke oder EAN …" value="${esc(INV.q)}" autocomplete="off"></label>
      <div class="seg" id="invSeg">${[['alle', 'Alle'], ['knapp', 'Knapp'], ['aus', 'Ausverkauft']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${INV.f === k}">${l}</button>`).join('')}</div>
      <span class="muted" style="font-size:12.5px;margin-left:auto">Zelle anklicken = buchen (Zugang, Abgang, Inventur)</span></div>
    <div class="inv"><div id="invList"></div><aside class="card mv-panel" id="mvPanel"><h3>Letzte Bewegungen</h3><div id="mvList"></div></aside></div></div>`;
  initSeg($('#invSeg', v), b => { INV.f = b.dataset.v; renderInvList(); });
  renderInvList(); renderMoves();
}
function renderInvList() {
  const toks = norm(INV.q.trim()).split(/\s+/).filter(Boolean);
  const list = ART.filter(a => toks.every(t => a.hay.includes(t)) && (INV.f === 'alle' || a.variants.some(x => INV.f === 'aus' ? x.q <= 0 : x.q > 0 && x.q <= 2)));
  $('#invList').innerHTML = list.length ? list.map(a => {
    const c = COLORS[a.colors[0]]?.[1] || '#888';
    return `<div class="card inv-card" data-inv="${esc(a.id)}"><div class="inv-h"><span class="thumb" style="--c:${c}">${artVisual(a, c)}</span><div style="flex:1;min-width:0"><div style="font-weight:600">${esc(a.name)}</div><div class="muted" style="font-size:12px">${esc(a.brand)} · ${esc(a.id)} · ${eur(a.sale || a.price)}</div></div><span class="stock ${a.stock <= 0 ? 'out' : a.stock <= 6 ? 'low' : 'ok'}"><span class="dot"></span>${num(a.stock)} Stk.</span><button class="btn btn-ghost btn-sm btn-icon" data-lbl="${esc(a.id)}" data-tip="Etiketten (Anzahl = Bestand)" aria-label="Etiketten">${ic('tag', 'i-sm')}</button></div>
      <div style="overflow-x:auto"><table class="mx"><thead><tr><th></th>${a.sizes.map(s => `<th>${esc(s === 'Einheitsgröße' ? 'Einheitsgr.' : s)}</th>`).join('')}</tr></thead><tbody>${a.colors.map(col => `<tr><th class="c"><i style="background:${COLORS[col]?.[1]}"></i>${esc(COLORS[col]?.[0] || col)}</th>${a.sizes.map(s => { const x = a.variants.find(v => v.c === col && v.s === s); return x ? `<td><button class="mxc ${x.q <= 0 ? 'out' : x.q <= 2 ? 'low' : ''}" data-vk="${esc(x.ean)}" title="EAN ${esc(x.ean)}">${x.q}</button></td>` : '<td></td>'; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }).join('') : `<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('boxes')}</div><h3>Nichts gefunden</h3><p>${INV.f === 'alle' ? 'Suche anpassen.' : 'Keine Varianten in diesem Filter – gut so.'}</p></div></div>`;
}
async function renderMoves() {
  const box = $('#mvList'); if (!box) return;
  let rows = MEM.moves;
  if (DESKTOP) { try { rows = await invoke('stock_moves', {limit: 40}); } catch (e) { rows = []; } }
  box.innerHTML = rows.length ? rows.slice(0, 40).map(m => `<div class="mv"><div><b>${esc(m.name)}</b><br><small>${esc(COLORS[m.color]?.[0] || m.color)} · ${esc(m.size)} · ${esc(m.reason)}${m.ref ? ' ' + esc(m.ref) : ''}</small></div><div><div class="d ${m.delta > 0 ? 'p' : m.delta < 0 ? 'm' : ''}">${m.delta > 0 ? '+' : ''}${m.delta}</div><small>${esc(fmtTs(m.ts).split(', ').pop())} · ${m.stock_after}</small></div></div>`).join('')
    : '<div class="empty" style="padding:24px 16px"><p>Noch keine Buchungen.</p></div>';
}
function openBooking(a, v) {
  const st = {mode: 'zu', qty: '', reason: 'Wareneingang'};
  const REASONS = {zu: ['Wareneingang', 'Umlagerung Eingang', 'Kundenretoure', 'Korrektur'], ab: ['Schwund', 'Defekt', 'Umlagerung Ausgang', 'Retoure an Lieferant', 'Korrektur'], inv: ['Inventur']};
  const el = openLayer(`<div class="modal" style="width:min(500px,100%)" role="dialog" aria-modal="true" aria-label="Bestand buchen"><div id="bkBody"></div></div>`, {focus: '#bkQty'});
  const box = $('#bkBody', el);
  const render = () => {
    const n = parseInt(st.qty, 10), valid = Number.isFinite(n) && (st.mode === 'inv' ? n >= 0 : n > 0);
    const after = !valid ? v.q : st.mode === 'zu' ? v.q + n : st.mode === 'ab' ? v.q - n : n;
    const c = COLORS[v.c]?.[1] || '#888';
    box.innerHTML = `<div class="m-head"><span class="thumb" style="--c:${c};width:42px;height:42px">${glyph(a.g, c)}</span><div><h2>${esc(a.name)}</h2><p>${esc(COLORS[v.c]?.[0] || v.c)} · ${esc(v.s)} · EAN ${esc(v.ean)}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:16px">
        <div class="seg" id="bkSeg" style="justify-self:start">${[['zu', 'Zugang'], ['ab', 'Abgang'], ['inv', 'Inventur (Zählung)']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${st.mode === k}">${l}</button>`).join('')}</div>
        <div class="amt-field"><label for="bkQty">${st.mode === 'inv' ? 'Gezählter Bestand' : 'Menge'}</label><div class="amt-input"><span>${st.mode === 'zu' ? '+' : st.mode === 'ab' ? '−' : '='}</span><input id="bkQty" inputmode="numeric" value="${esc(st.qty)}" placeholder="0" autocomplete="off"><span style="font-size:14px">Stk.</span></div></div>
        <div><div class="field"><span>Grund</span></div><div class="reasons" style="margin-top:6px">${REASONS[st.mode].map(r => `<button class="chip" data-r="${esc(r)}" aria-pressed="${r === st.reason}">${r}</button>`).join('')}</div></div>
        <div class="preview-box"><span>Bestand<br><span class="muted" style="font-size:12px">aktuell ${v.q}</span></span><b class="num" style="color:${after < 0 ? 'var(--neg)' : 'inherit'}">${v.q} → ${after}</b></div>
      </div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="bkGo" ${valid ? '' : 'disabled'}>${ic('check', 'i-sm')}Buchen<span class="kbd">↵</span></button></div>`;
    initSeg($('#bkSeg', box), b => { st.mode = b.dataset.v; st.reason = REASONS[st.mode][0]; render(); $('#bkQty', box).focus(); });
  };
  const go2 = async () => {
    const n = parseInt(st.qty, 10); if (!Number.isFinite(n) || (st.mode === 'inv' ? n < 0 : n <= 0)) return;
    const value = st.mode === 'zu' ? n : st.mode === 'ab' ? -n : n;
    try { await bookStock(a, v, value, st.mode === 'inv', st.reason); } catch (e) { return toast('Buchung fehlgeschlagen', {t2: String(e), type: 'warn'}); }
    closeLayer(el); toast('Gebucht', {t2: `${a.name} · ${COLORS[v.c]?.[0] || v.c} ${v.s} · neuer Bestand ${v.q}`, type: 'pos', icon: 'boxes'});
    if (S.view === 'bestand') { renderInvList(); renderMoves(); const cell = $(`[data-vk="${CSS.escape(v.ean)}"]`); cell?.classList.add('flash'); renderTopbar(); }
    if (S.view === 'dashboard') refreshDashboard(['stock.low']);
  };
  box.addEventListener('input', e => { if (e.target.id === 'bkQty') { st.qty = e.target.value.replace(/\D/g, ''); const pos = e.target.selectionStart; render(); const i = $('#bkQty', box); i.focus(); i.setSelectionRange(pos, pos); } });
  box.addEventListener('click', e => { const r = e.target.closest('[data-r]'); if (r) { st.reason = r.dataset.r; render(); } if (e.target.closest('#bkGo')) go2(); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
  render();
}

function bindCatalog() {
  const av = $('#view-artikel');
  av.addEventListener('input', e => { if (e.target.id === 'artQ') { AV.q = e.target.value; renderArtTable(); } });
  av.addEventListener('change', e => { if (e.target.id === 'artCatSel') { AV.cat = e.target.value; renderArtTable(); } });
  av.addEventListener('click', e => {
    const c = e.target.closest('[data-acat]'); if (c) { AV.cat = c.dataset.acat; $$('[data-acat]', av).forEach(b => b.setAttribute('aria-pressed', b === c)); return renderArtTable(); }
    if (e.target.closest('#artNew')) return openEditor(null);
    const r = e.target.closest('[data-art]'); if (r) openEditor(artById(r.dataset.art));
  });
  const bv = $('#view-bestand');
  bv.addEventListener('input', e => { if (e.target.id === 'invQ') { INV.q = e.target.value; renderInvList(); } });
  bv.addEventListener('click', e => {
    const lb = e.target.closest('[data-lbl]'); if (lb) { const a = artById(lb.dataset.lbl); return openLabels(a.variants.map(v => ({a, v, n: Math.max(0, v.q)}))); }
    const cell = e.target.closest('[data-vk]'); if (!cell) return;
    for (const a of ART) { const v = a.variants.find(x => x.ean === cell.dataset.vk); if (v) return openBooking(a, v); }
  });
}
