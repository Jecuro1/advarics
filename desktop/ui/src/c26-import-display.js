
/* ════════════════════════════════════════════════════════════════════
   36 · IMPORT, KUNDENDISPLAY, HANDY-APP
   Import: CSV aus Excel/Warenwirtschaft mit Spaltenzuordnung, Vorschau
   und Prüfung – Artikel (eine Zeile je Variante), Kunden, Bestände.
   Kundendisplay: zweites Fenster, das Warenkorb und Summe zeigt.
   Handy-App: Lager & Inventur im Browser des Handys (über die API).
   ════════════════════════════════════════════════════════════════════ */
const COLOR_WORDS = {schwarz: '#22252B', weiss: '#EDEDEA', grau: '#8A8F98', anthrazit: '#3B3F46', silber: '#BFC3C8', dunkelblau: '#24345E', navy: '#22325A', hellblau: '#8DB7E0', blau: '#3567B5', tuerkis: '#2B9E9A', petrol: '#2F6668', gruen: '#4E7D4A', oliv: '#6B6B3A', khaki: '#9A8F62', gelb: '#E2B93B', senf: '#C99B2F', orange: '#E07A2E', rot: '#C4412F', bordeaux: '#6E2335', weinrot: '#7A2638', rosa: '#E6A3B4', pink: '#D9568A', lila: '#7B5AA6', violett: '#6E4FA0', braun: '#7A5338', cognac: '#9A5B2E', beige: '#D8C4A2', sand: '#C4A67E', creme: '#EDE3CC', natur: '#DCCFB4', gold: '#C9A24A', bunt: '#B05AA0'};
const colorFor = name => { const n = norm(name).replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'); const w = Object.keys(COLOR_WORDS).find(k => n.includes(k)); return w ? COLOR_WORDS[w] : `hsl(${hash(name) % 360} 32% 52%)`; };
/** Farbe aus freiem Namen: bekannte Farbe (Schlüssel oder Bezeichnung) oder neu anlegen */
function ensureColor(name) {
  name = String(name || '').trim() || 'Standard';
  if (COLORS[name]) return name;
  const n = norm(name), hit = Object.entries(COLORS).find(([k, v]) => k === n || norm(v[0]) === n);
  if (hit) return hit[0];
  COLORS[name] = [name, colorFor(name)]; return name;
}
function ensureCat(name) {
  name = String(name || '').trim(); if (!name) return 'acc';
  const n = norm(name), hit = CATS.find(c => c.id === name || norm(c.name) === n || c.id === n);
  if (hit) return hit.id;
  CATS.push({id: name, name}); return name;
}
// Gespeicherte Artikel mit eigenen Farben/Warengruppen (z. B. aus dem Import) anzeigbar machen
{
  const _afd = artFromDb;
  artFromDb = function (d) { (d.colors || []).forEach(c => { if (!COLORS[c]) COLORS[c] = [c, colorFor(c)]; }); if (d.category && !CATS.some(c => c.id === d.category)) CATS.push({id: d.category, name: d.category}); return _afd(d); };
}

/* ── CSV ── */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = [';', '\t', ','].map(s => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return {sep, head: (rows.shift() || []).map(h => h.trim()), rows};
}
const IMP_DEF = {
  artikel: {title: 'Artikel', icon: 'tag', fields: [['id', 'Artikelnummer', true, 'artikelnummer artnr art-nr sku nummer'], ['name', 'Bezeichnung', true, 'bezeichnung name artikel produkt titel'], ['brand', 'Marke', false, 'marke hersteller brand'], ['cat', 'Warengruppe', false, 'warengruppe kategorie gruppe category'], ['color', 'Farbe', false, 'farbe color colour'], ['size', 'Größe', false, 'groesse grosse size'], ['ean', 'EAN / Barcode', false, 'ean barcode gtin strichcode'], ['price', 'Verkaufspreis', true, 'vk verkaufspreis preis price brutto'], ['sale', 'Aktionspreis', false, 'aktionspreis sale angebot'], ['cost', 'Einkaufspreis netto', false, 'ek einkaufspreis cost'], ['vat', 'MwSt %', false, 'mwst ust steuer vat'], ['stock', 'Bestand', false, 'bestand menge lager stock'], ['supplier', 'Lieferant', false, 'lieferant supplier'], ['min', 'Mindestbestand', false, 'mindestbestand meldebestand min']],
    template: 'Artikelnummer;Bezeichnung;Marke;Warengruppe;Farbe;Größe;EAN;Verkaufspreis;Aktionspreis;Einkaufspreis;MwSt;Bestand;Lieferant\r\nB2001;Trail Jacke;Bergwerk;Jacken & Westen;Dunkelblau;M;;199,00;;89,50;20;4;\r\nB2001;Trail Jacke;Bergwerk;Jacken & Westen;Dunkelblau;L;;199,00;;89,50;20;3;\r\n'},
  kunde: {title: 'Kunden', icon: 'users', fields: [['name', 'Name', true, 'name kunde vorname nachname'], ['email', 'E-Mail', false, 'email e-mail mail'], ['phone', 'Telefon', false, 'telefon tel phone mobil handy'], ['street', 'Straße', false, 'strasse adresse street'], ['zip', 'PLZ', false, 'plz postleitzahl zip'], ['city', 'Ort', false, 'ort stadt city'], ['country', 'Land', false, 'land country'], ['uid', 'UID', false, 'uid ust-id'], ['tier', 'Kundenstufe', false, 'stufe kundenstufe tier'], ['points', 'Punkte', false, 'punkte bonuspunkte points'], ['consent', 'Newsletter (ja/nein)', false, 'newsletter einwilligung consent'], ['note', 'Notiz', false, 'notiz bemerkung note']],
    template: 'Name;E-Mail;Telefon;Straße;PLZ;Ort;Kundenstufe;Punkte;Newsletter\r\nMaria Muster;maria@example.at;0660 123456;Hauptplatz 1;6020;Innsbruck;Kunde;0;ja\r\n'},
  bestand: {title: 'Bestände', icon: 'boxes', fields: [['ean', 'EAN / Barcode', true, 'ean barcode gtin'], ['stock', 'Bestand (neu)', true, 'bestand menge stock anzahl']],
    template: 'EAN;Bestand\r\n'},
};
const IMP_PERM = {artikel: 'artikel.bearbeiten', kunde: 'kunden.bearbeiten', bestand: 'bestand.buchen'};   // Recht je Importart – das Übernehmen verlangt es
function openImport(kind = 'artikel') {
  if (!DESKTOP) return toast('Import nur in der Desktop-App', {type: 'warn'});
  if (!can(IMP_PERM[kind])) kind = Object.keys(IMP_DEF).find(k => can(IMP_PERM[k])) || kind;   // nur Importarten anbieten, die ohne Freigabe möglich sind
  const st = {kind, csv: null, map: {}, extra: {}, check: null};
  const el = openLayer(`<div class="modal" style="width:min(900px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Import"><div id="imBox" style="display:flex;flex-direction:column;min-height:0"></div></div>`);
  const box = $('#imBox', el);
  const fields = () => [...IMP_DEF[st.kind].fields, ...(st.kind === 'bestand' ? [] : cfDefs(st.kind).map(d => ['cf:' + d.label, d.label + ' (Feld)', d.required, norm(d.label)]))];
  const automap = () => {
    st.map = {}; const used = new Set();
    const key = x => norm(String(x).replace(/ß/g, 'ss').replace(/ä/gi, 'ae').replace(/ö/gi, 'oe').replace(/ü/gi, 'ue')).replace(/[^a-z0-9]/g, '');
    const score = (h, keys) => Math.max(0, ...keys.map(w => key(h) === w ? 3 : key(h).startsWith(w) && w.length > 2 ? 2 : w.length > 3 && key(h).includes(w) ? 1 : 0));
    // erst eindeutige Treffer (exakt), dann Anfang, dann enthalten – so landet „Einkaufspreis“ nicht beim Verkaufspreis
    for (const lvl of [3, 2, 1]) fields().forEach(([k, , , kw]) => { if (st.map[k] != null) return; const keys = String(kw).split(' ').map(key).filter(Boolean); const i = st.csv.head.findIndex((h, j) => !used.has(j) && score(h, keys) === lvl); if (i >= 0) { st.map[k] = i; used.add(i); } });
  };
  const val = (r, k) => st.map[k] != null ? String(r[st.map[k]] ?? '').trim() : '';
  const money = s => { const v = parseAmt(s); return isFinite(v) ? v : NaN; };
  const build = () => {
    const errs = [], rows = st.csv.rows;
    if (st.kind === 'bestand') {
      const stock = []; rows.forEach((r, i) => { const ean = val(r, 'ean'), q = parseInt(val(r, 'stock'), 10); if (!ean) return; if (!findEan(ean)) errs.push(`Zeile ${i + 2}: EAN ${ean} unbekannt`); else if (!isFinite(q)) errs.push(`Zeile ${i + 2}: Bestand fehlt`); else stock.push([ean, q]); });
      return {errs, stock, articles: [], summary: `${stock.length} Bestände werden gesetzt`};
    }
    if (st.kind === 'kunde') {
      const list = [];
      rows.forEach((r, i) => {
        const name = val(r, 'name'); if (!name) { errs.push(`Zeile ${i + 2}: Name fehlt`); return; }
        const email = val(r, 'email'), ex = email && CUSTOMERS.find(c => c.email && c.email.toLowerCase() === email.toLowerCase());
        const fields = {...(ex?.fields || {})}; Object.keys(st.map).filter(k => k.startsWith('cf:')).forEach(k => { const x = val(r, k); if (x) fields[k.slice(3)] = x; });
        Object.entries(st.extra).forEach(([j, lbl]) => { const x = String(r[+j] ?? '').trim(); if (x && lbl) fields[lbl] = x; });
        list.push(custToDb({...(ex || {}), id: ex?.id || '', name, email, phone: val(r, 'phone') || ex?.phone || '', street: val(r, 'street') || ex?.street || '', zip: val(r, 'zip') || ex?.zip || '', city: val(r, 'city') || ex?.city || '', country: val(r, 'country') || ex?.country || 'AT', uid: val(r, 'uid') || ex?.uid || '',
          tier: val(r, 'tier') || ex?.tier || 'Kunde', points: parseInt(val(r, 'points'), 10) || ex?.points || 0, consent: /^(ja|j|1|x|yes|true)$/i.test(val(r, 'consent')) || !!ex?.consent, note: val(r, 'note') || ex?.note || '', club: ex?.club || null, fields}));
      });
      return {errs, list, summary: `${list.length} Kund:innen (${list.filter(c => c.id).length} aktualisiert, ${list.filter(c => !c.id).length} neu)`};
    }
    const by = new Map(), used = new Set(ART.flatMap(a => a.variants.map(v => v.ean))), stock = [];
    rows.forEach((r, i) => {
      const id = val(r, 'id'), name = val(r, 'name'), price = money(val(r, 'price'));
      if (!id) return errs.push(`Zeile ${i + 2}: Artikelnummer fehlt`);
      let a = by.get(id);
      if (!a) {
        if (!name) return errs.push(`Zeile ${i + 2}: Bezeichnung fehlt`);
        if (!(price > 0)) return errs.push(`Zeile ${i + 2}: Verkaufspreis fehlt oder ungültig`);
        const ex = artById(id), sale = money(val(r, 'sale')), cost = money(val(r, 'cost')), vat = parseInt(val(r, 'vat'), 10);
        const supTxt = val(r, 'supplier'), sup = supTxt ? SUPPLIERS.find(s => s.id === supTxt || norm(s.name) === norm(supTxt)) : null;
        if (supTxt && !sup) errs.push(`Zeile ${i + 2}: Lieferant „${supTxt}“ unbekannt – wird ohne Lieferant angelegt`);
        const cat = ensureCat(val(r, 'cat') || (ex ? ex.cat : 'acc'));
        const fields = {...(ex?.fields || {})}; Object.keys(st.map).filter(k => k.startsWith('cf:')).forEach(k => { const x = val(r, k); if (x) fields[k.slice(3)] = x; });
        Object.entries(st.extra).forEach(([j, lbl]) => { const x = String(r[+j] ?? '').trim(); if (x && lbl) fields[lbl] = x; });
        a = {id, name, brand: val(r, 'brand') || ex?.brand || '', cat, g: ex?.g || ({jacken: 'jacket', hosen: 'pants', schuhe: 'shoe', ski: 'ski', shirts: 'shirt', rucksaecke: 'backpack', acc: 'beanie'})[cat] || 'shirt', price: r2(price), sale: sale > 0 && sale < price ? r2(sale) : undefined, vat: [20, 13, 10, 0].includes(vat) ? vat : ex ? (ex.vat ?? 20) : (aeWgSatz(cat) ?? 20),   // ohne Angabe in der Datei: bestehender Artikel behält seinen Satz, neuer bekommt den der Warengruppe
          cost: cost > 0 ? r2(cost) : (ex?.cost ?? null), supplierId: sup?.id || ex?.supplierId || '', minStock: parseInt(val(r, 'min'), 10) >= 0 ? parseInt(val(r, 'min'), 10) : (ex?.minStock ?? 2), pop: ex?.pop || 50, tag: ex?.tag, prompts: ex?.prompts, fields, colors: [], sizes: [], combos: new Map(), ex};
        by.set(id, a);
      }
      const c = ensureColor(val(r, 'color') || 'Standard'), s = val(r, 'size') || 'Einheitsgröße';
      if (!a.colors.includes(c)) a.colors.push(c); if (!a.sizes.includes(s)) a.sizes.push(s);
      let ean = val(r, 'ean').replace(/\s/g, '');
      if (ean && !/^\d{8,14}$/.test(ean)) { errs.push(`Zeile ${i + 2}: EAN „${ean}“ ungültig – wird neu vergeben`); ean = ''; }
      a.combos.set(c + '|' + s, {ean, stock: val(r, 'stock') !== '' ? parseInt(val(r, 'stock'), 10) : null});
    });
    const articles = [...by.values()].map(a => {
      const variants = [];
      a.colors.forEach(c => a.sizes.forEach(s => {
        const want = a.combos.get(c + '|' + s), ex = a.ex?.variants.find(v => v.c === c && v.s === s);
        let ean = want?.ean || ex?.ean;
        if (!ean || (!ex && used.has(ean) && !a.ex?.variants.some(v => v.ean === ean))) { if (want?.ean) errs.push(`EAN ${want.ean} gibt es schon – ${a.id} ${c}/${s} bekommt eine neue`); ean = newEan(a.id, used); }
        used.add(ean); variants.push({c, s, ean, q: ex?.q || 0});
        if (want && want.stock != null && isFinite(want.stock)) stock.push([ean, want.stock]);
      }));
      // bestehende Varianten behalten, die nicht in der Datei stehen
      a.ex?.variants.forEach(v => { if (!variants.some(x => x.c === v.c && x.s === v.s)) { variants.push({...v}); if (!a.colors.includes(v.c)) a.colors.push(v.c); if (!a.sizes.includes(v.s)) a.sizes.push(v.s); } });
      const {combos, ex, ...rest} = a; return artToDb({...rest, variants});
    });
    return {errs, articles, stock, summary: `${articles.length} Artikel (${articles.filter(a => artById(a.id)).length} aktualisiert, ${articles.filter(a => !artById(a.id)).length} neu) · ${articles.reduce((n, a) => n + a.variants.length, 0)} Varianten · ${stock.length} Bestände`};
  };
  const render = () => {
    const d = IMP_DEF[st.kind];
    if (!st.csv) {
      box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('download')}</div><div><h2>Daten importieren</h2><p>CSV-Datei aus Excel, der bisherigen Warenwirtschaft oder vom Lieferanten</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
        <div class="m-body" style="display:grid;gap:16px"><div class="opt-grid" style="grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)">${Object.entries(IMP_DEF).map(([k, x]) => `<button class="opt" data-ik="${k}" data-perm="${IMP_PERM[k]}" aria-pressed="${st.kind === k}" style="height:auto;padding:16px;display:grid;gap:6px;justify-items:start">${ic(x.icon)}<b>${x.title}</b><span class="muted" style="font-size:12px;text-align:left">${k === 'artikel' ? 'eine Zeile je Variante (Farbe/Größe)' : k === 'kunde' ? 'gleiche E-Mail = bestehende Kundin aktualisieren' : 'Bestand je EAN setzen (z. B. Zählliste)'}</span></button>`).join('')}</div>
          <div class="rule-box" style="background:var(--info-soft);border-color:transparent">${ic('info')}<div>In Excel: <b style="color:var(--text)">Datei → Speichern unter → „CSV (Trennzeichen-getrennt)“</b>. Spalten ordnen Sie im nächsten Schritt zu – Reihenfolge und Überschriften sind egal. Vor dem Import wird alles geprüft; es wird erst gespeichert, wenn Sie bestätigen.</div></div></div>
        <div class="m-foot"><button class="btn btn-ghost" id="imTpl">${ic('download', 'i-sm')}Vorlage speichern</button><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="imFile">${ic('boxes', 'i-sm')}CSV-Datei wählen …</button></div>`;
      return;
    }
    const chk = st.check = build(), f = fields();
    const unmapped = st.csv.head.map((h, j) => j).filter(j => !Object.values(st.map).includes(j));
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic(d.icon)}</div><div><h2>${d.title} importieren</h2><p>${num(st.csv.rows.length)} Zeilen · Trennzeichen „${st.csv.sep === '\t' ? 'Tab' : st.csv.sep}“ · ${esc(chk.summary)}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:14px;overflow:auto">
        <div><div class="lab" style="font-size:12.5px;font-weight:600;margin-bottom:8px">Spalten zuordnen</div><div class="ed-grid">${f.map(([k, l, req]) => `<label class="field"><span>${esc(l)}${req ? ' <b class="req">*</b>' : ''}</span><select class="input select" data-im="${esc(k)}"><option value="">– nicht importieren –</option>${st.csv.head.map((h, j) => `<option value="${j}" ${st.map[k] === j ? 'selected' : ''}>${esc(h || 'Spalte ' + (j + 1))}</option>`).join('')}</select></label>`).join('')}</div></div>
        ${st.kind !== 'bestand' && unmapped.length ? `<div><div class="lab" style="font-size:12.5px;font-weight:600;margin-bottom:6px">Weitere Spalten als freie Felder übernehmen</div><div class="reasons">${unmapped.map(j => `<button class="chip" data-ix="${j}" aria-pressed="${st.extra[j] != null}">${esc(st.csv.head[j] || 'Spalte ' + (j + 1))}</button>`).join('')}</div></div>` : ''}
        <div><div class="lab" style="font-size:12.5px;font-weight:600;margin-bottom:6px">Vorschau</div><div class="card" style="overflow:auto;box-shadow:none"><table class="tbl" style="margin:0"><thead><tr>${st.csv.head.map(h => `<th style="white-space:nowrap">${esc(h)}</th>`).join('')}</tr></thead><tbody>${st.csv.rows.slice(0, 6).map(r => `<tr>${st.csv.head.map((_, j) => `<td style="font-size:12.5px;white-space:nowrap">${esc(r[j] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
        ${chk.errs.length ? `<div class="rule-box" style="background:var(--warn-soft);border-color:transparent">${ic('alert')}<div><b style="color:var(--text)">${chk.errs.length} Hinweise</b><ul style="margin:6px 0 0;padding-left:18px;font-size:12.5px">${chk.errs.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}${chk.errs.length > 8 ? `<li>… ${chk.errs.length - 8} weitere</li>` : ''}</ul></div></div>` : `<div class="rule-box" style="background:var(--pos-soft);border-color:transparent">${ic('check')}<div>Alles geprüft – bereit zum Import.</div></div>`}
      </div>
      <div class="m-foot"><button class="btn btn-ghost" id="imBack">Andere Datei</button><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="imGo" ${(chk.articles?.length || chk.list?.length || chk.stock?.length) ? '' : 'disabled'}>${ic('check', 'i-sm')}Jetzt importieren</button></div>`;
  };
  const loadCsv = txt => { st.csv = parseCSV(txt); if (!st.csv.rows.length) { st.csv = null; return toast('Datei enthält keine Zeilen', {type: 'warn'}); } automap(); render(); };
  fileDrop($('.modal', el), {accept: /\.(csv|txt)$/i, hint: 'CSV-Datei hier ablegen', onFiles: async ([f]) => loadCsv(await f.text())});
  el.addEventListener('change', e => { const k = e.target.dataset.im; if (k != null) { if (e.target.value === '') delete st.map[k]; else st.map[k] = +e.target.value; render(); } });
  el.addEventListener('click', async e => {
    const k = e.target.closest('[data-ik]'); if (k) { st.kind = k.dataset.ik; return render(); }
    const x = e.target.closest('[data-ix]'); if (x) { const j = +x.dataset.ix; if (st.extra[j] != null) delete st.extra[j]; else st.extra[j] = st.csv.head[j] || `Spalte ${j + 1}`; return render(); }
    if (e.target.closest('#imBack')) { st.csv = null; return render(); }
    if (e.target.closest('#imTpl')) { try { const p = await invoke('save_text', {name: `Kontor_Vorlage_${IMP_DEF[st.kind].title}.csv`, content: '﻿' + IMP_DEF[st.kind].template, title: 'Vorlage speichern'}); if (p) toast('Vorlage gespeichert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); } return; }
    if (e.target.closest('#imFile')) {
      let txt; try { txt = await invoke('open_text', {title: 'CSV-Datei wählen', ext: 'csv'}); } catch (err) { return toast('Datei nicht lesbar', {t2: String(err), type: 'warn'}); }
      if (!txt) return;
      return loadCsv(txt);
    }
    if (e.target.closest('#imGo')) {
      const c = st.check, perm = st.kind === 'kunde' ? 'kunden.bearbeiten' : st.kind === 'bestand' ? 'bestand.buchen' : 'artikel.bearbeiten';
      try { await needPerm(perm, 'Import bestätigen', c.summary); } catch { return; }
      const btn = $('#imGo', el); btn.disabled = true; btn.innerHTML = 'Importiere …';
      try {
        if (st.kind === 'kunde') { const r = await invoke('customers_import', {list: c.list, user: S.user.name}); CUSTOMERS.length = 0; r.list.forEach(d => CUSTOMERS.push(custFromDb(d))); toast('Kunden importiert', {t2: `${r.anzahl} Datensätze`, type: 'pos', icon: 'users'}); Hooks.emit('customer.imported', {anzahl: r.anzahl}); if (S.view === 'kunden') renderKunden(); }
        else { const r = await invoke('articles_import', {articles: c.articles, stock: c.stock, user: S.user.name}); replaceCatalog(r.list); toast(st.kind === 'bestand' ? 'Bestände übernommen' : 'Artikel importiert', {t2: `${r.artikel} Artikel · ${r.bestaende} Bestände`, type: 'pos', icon: 'tag'}); Hooks.emit('catalog.imported', {artikel: r.artikel, bestaende: r.bestaende}); if (['artikel', 'bestand', 'kasse'].includes(S.view)) { const v = S.view; S.view = null; go(v); } }
        closeLayer(el);
      } catch (err) { btn.disabled = false; btn.innerHTML = `${ic('check', 'i-sm')}Jetzt importieren`; toast('Import abgebrochen – nichts gespeichert', {t2: String(err), type: 'warn', dur: 9000}); }
    }
  });
  render();
}
// Import-Knöpfe in Artikel, Kunden und Bestand
for (const [fn, kind, anchor] of [['renderArtikel', 'artikel', '#artNew'], ['renderKunden', 'kunde', '#kuNew']]) {
  const orig = {renderArtikel, renderKunden}[fn];
  const wrapped = function (...a) { const r = orig.apply(this, a); const b = $(anchor); if (DESKTOP && b && !b.previousElementSibling?.matches('[data-imp]')) b.insertAdjacentHTML('beforebegin', `<button class="btn btn-secondary" data-imp="${kind}" style="margin-right:8px">${ic('download', 'i-sm')}Import</button>`); return r; };
  if (fn === 'renderArtikel') renderArtikel = wrapped; else renderKunden = wrapped;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-imp]'); if (b) openImport(b.dataset.imp); });

/* ════ Kundendisplay ════ */
Object.assign(DEFAULTS, {'display.auto': false}); if (!('display.auto' in CFG)) CFG['display.auto'] = false;
const KD = {on: false, last: null};
async function toggleDisplay(force) {
  if (!DESKTOP) return toast('Kundendisplay nur in der Desktop-App', {type: 'warn'});
  try {
    const open = await invoke('display_status');
    if (open && force !== true) { await invoke('display_close'); KD.on = false; toast('Kundendisplay geschlossen', {icon: 'layout'}); }
    else { KD.last = null; const second = await invoke('display_open'); KD.on = true; toast('Kundendisplay geöffnet', {t2: second ? 'Auf dem zweiten Bildschirm im Vollbild' : 'Kein zweiter Bildschirm erkannt – Fenster frei verschiebbar', icon: 'layout', type: 'pos'}); setTimeout(kdPush, 1500); }
  } catch (e) { toast('Kundendisplay nicht möglich', {t2: String(e), type: 'warn'}); }
}
function kdState() {
  if (S.view === 'kasse' && typeof PAY !== 'undefined' && PAY?.done) return {state: 'paid', total: PAY.total, change: PAY.parts?.reduce((a, p) => a + (p.change || 0), 0) || 0};
  if (!POS.cart.length) return {state: 'idle'};
  const t = totals();
  return {state: typeof PAY !== 'undefined' && PAY && !PAY.done ? 'pay' : 'cart', total: t.total, savings: typeof savingsOf === 'function' ? savingsOf({lines: POS.cart, t}) : 0, customer: POS.customer?.name || null, points: POS.customer?.points ?? null,
    lines: POS.cart.slice(-8).map(l => ({name: l.name, var: [l.c ? colorName(l.c) : '', l.s && l.s !== 'Einheitsgröße' ? l.s : ''].filter(Boolean).join(' · '), qty: l.qty, total: r2(l.unit * l.qty * (1 - (l.disc?.pct || 0) / 100)), was: l.was || null}))};
}
let kdT;
function kdPush() {
  if (!DESKTOP || window.__KONTOR_DISPLAY__) return;
  clearTimeout(kdT);
  kdT = setTimeout(() => { const s = kdState(), j = JSON.stringify(s); if (j === KD.last) return; KD.last = j; invoke('display_push', {payload: s}).catch(() => {}); }, 60);
}
if (DESKTOP && !window.__KONTOR_DISPLAY__) {
  const _rc = renderCart; renderCart = function (...a) { const r = _rc.apply(this, a); kdPush(); return r; };
  ['pos.payment.started', 'pos.sale.completed', 'pos.cart.cleared', 'pos.customer.attached'].forEach(ev => Hooks.on(ev, () => setTimeout(kdPush, 120)));
  setInterval(kdPush, 2000);
  // Display meldet sich nach dem Laden – dann aktuellen Stand senden
  window.__TAURI__.event.listen('kd-ready', () => { KD.last = null; kdPush(); }).catch(() => {});
}
/** Im Display-Fenster: nur die Anzeige für Kund:innen */
async function runDisplay() {
  try { Object.assign(CFG, await invoke('settings_get')); } catch { /* */ }
  applyPrefs(); document.documentElement.dataset.theme = 'light';
  document.body.innerHTML = `<div class="kd"><div class="kd-l"><div class="kd-brand">${CFG['bon.logo'] ? `<img src="${esc(imgUrl(CFG['bon.logo']))}" alt="">` : `<div class="brand-mark" style="width:56px;height:56px;border-radius:16px;font-size:24px">K</div>`}<b>${esc(CFG['firma.marke'] || CFG['firma.name'] || 'Kontor')}</b></div><div class="kd-lines" id="kdLines"></div></div><div class="kd-r" id="kdR"></div></div>`;
  const render = s => {
    const L = $('#kdLines'), R = $('#kdR');
    if (!s || s.state === 'idle') { L.innerHTML = ''; R.innerHTML = `<div class="kd-msg">Herzlich willkommen!</div><div style="color:var(--text-2);font-size:20px">${esc(CFG['firma.zusatz'] || '')}</div>${CFG['bon.kopf'] ? `<div style="color:var(--text-3);font-size:17px">${esc(CFG['bon.kopf'])}</div>` : ''}`; return; }
    if (s.state === 'paid') { R.innerHTML = `<div class="ok-ring" style="width:84px;height:84px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div><div class="kd-msg">Vielen Dank für Ihren Einkauf!</div>${s.change ? `<div style="font-size:26px">Rückgeld <b>${eur(s.change)}</b></div>` : ''}`; return; }
    L.innerHTML = (s.lines || []).map(l => `<div class="kd-line"><div class="n"><b>${l.qty > 1 ? l.qty + ' × ' : ''}${esc(l.name)}</b><span>${esc(l.var)}</span></div><div class="p">${l.was ? `<s style="color:var(--text-3);font-size:15px;font-weight:400;margin-right:8px">${eur(l.was * l.qty)}</s>` : ''}${eur(l.total)}</div></div>`).join('');
    R.innerHTML = `${s.customer ? `<div style="font-size:20px;color:var(--text-2)">Hallo ${esc(s.customer.split(' ')[0])}!${s.points != null ? ` · ${num(s.points)} Bonuspunkte` : ''}</div>` : ''}<div style="font-size:22px;color:var(--text-2)">${s.state === 'pay' ? 'Zu bezahlen' : 'Summe'}</div><div class="kd-total">${eur(s.total)}</div>${s.savings > 0.005 ? `<div style="font-size:22px;color:var(--pos);font-weight:600">Sie sparen ${eur(s.savings)}</div>` : ''}${s.state === 'pay' ? '<div style="font-size:20px;color:var(--text-2)">Bitte am Terminal bezahlen oder bar an der Kasse</div>' : ''}`;
  };
  render(null);
  await window.__TAURI__.event.listen('kd', e => render(e.payload));
  window.__TAURI__.event.emit('kd-ready', {}).catch(() => {});
}

/* ════ Handy-App: Einstellungen ════ */
SET_SECTIONS.splice(SET_SECTIONS.findIndex(s => s[0] === 'terminal'), 0, ['handy', 'Handy & Tablet', 'phone-pay'], ['display', 'Kundendisplay', 'layout']);
{
  const _rs = renderSettings;
  renderSettings = function () {
    _rs();
    const a = $('#sec-terminal'); if (!a) return;
    a.insertAdjacentHTML('beforebegin', `<section class="set-sec" id="sec-handy"><h2>Handy & Tablet</h2><p>Bestand prüfen, Ware zu- und abbuchen und Inventur zählen – im Browser jedes Handys oder Tablets im Firmennetz, ohne App-Store. Anmeldung mit der Kassen-PIN. Barcodes per Bluetooth-Scanner, Eingabe oder Foto.</p><div class="card" id="handyBox"></div></section>
      <section class="set-sec" id="sec-display"><h2>Kundendisplay</h2><p>Zweiter Bildschirm für Kund:innen: Artikel, Preise, Ersparnis, Summe und Dankeschön – mit Ihrem Logo. Ist ein zweiter Bildschirm angeschlossen, öffnet sich die Anzeige dort im Vollbild.</p><div class="card">
        ${field('display.auto', 'Beim Start automatisch öffnen', '', 'switch')}
        <div class="set-row" style="border-bottom:0"><div><div class="set-l">Anzeige</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-kd="toggle" ${DESKTOP ? '' : 'disabled'}>${ic('layout', 'i-sm')}Öffnen / Schließen</button></div></div></div></section>`);
    renderHandyBox();
  };
}
async function renderHandyBox() {
  const box = $('#handyBox'); if (!box) return;
  if (!DESKTOP) { box.innerHTML = '<div class="empty" style="padding:24px"><p>Nur in der Desktop-App.</p></div>'; return; }
  let i; try { i = await invoke('mobile_info'); } catch (e) { box.innerHTML = `<div style="padding:16px">${esc(String(e))}</div>`; return; }
  const ready = i.running && i.lan && i.ips.length, url = i.ips.length ? `http://${i.ips[0]}:${i.port}/mobil` : '';
  let qr = ''; if (ready) { try { qr = await invoke('qr_svg', {text: url}); } catch { /* */ } }
  box.innerHTML = ready ? `<div class="set-row" style="border-bottom:0;align-items:center"><div><div class="set-l">Bereit <span class="pill pos" style="height:20px">läuft</span></div><div class="set-h">QR-Code mit der Handy-Kamera scannen oder Adresse eingeben:<br><b class="mono" style="font-size:14px;color:var(--text)">${esc(url)}</b><br>Tipp: Danach „Zum Startbildschirm hinzufügen“ – dann startet Kontor mobil wie eine App.</div></div><div class="set-c"><div class="qr-box">${qr.replace('<svg', '<svg width="150" height="150"')}</div></div></div>`
    : `<div class="set-row" style="border-bottom:0"><div><div class="set-l">Noch nicht freigegeben</div><div class="set-h">Dafür läuft der eingebaute Server (REST-API) und ist im Firmennetz erreichbar. Beim ersten Mal fragt Windows nach der Firewall-Freigabe – bitte „Privates Netzwerk“ erlauben.${i.ips.length ? '' : '<br><b style="color:var(--warn)">Keine Netzwerkverbindung erkannt.</b>'}</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-handy="on">${ic('wifi', 'i-sm')}Für Handys freigeben</button></div></div>`;
}
function bindImportDisplay() {
  $('#view-einstellungen').addEventListener('click', async e => {
    if (e.target.closest('[data-kd="toggle"]')) return toggleDisplay();
    if (e.target.closest('[data-handy="on"]')) {
      try { await needPerm('anpassen', 'Handy-Zugang freigeben', 'Der eingebaute Server wird im Firmennetz erreichbar (Anmeldung nur mit PIN bzw. API-Schlüssel).'); } catch { return; }
      try { await invoke('api_toggle', {on: true, lan: true, port: +CFG['api.port'] || 8787}); Object.assign(CFG, {'api.aktiv': true, 'api.lan': true}); toast('Handy-Zugang freigegeben', {type: 'pos', icon: 'wifi'}); } catch (err) { toast('Nicht möglich', {t2: String(err), type: 'warn', dur: 8000}); }
      renderHandyBox();
    }
  });
}
