
/* ════════════════════════════════════════════════════════════════════
   28 · BILDER, ETIKETTEN, A4-DOKUMENTE, E-MAIL
   ════════════════════════════════════════════════════════════════════ */

/* ── Artikelbilder (Datenverzeichnis/bilder, über das Asset-Protokoll) ── */
function imgUrl(name) {
  if (!DESKTOP || !name || !S.info?.data_dir) return null;
  const d = S.info.data_dir, sep = d.includes('\\') ? '\\' : '/';
  try { return window.__TAURI__.core.convertFileSrc(d + sep + 'bilder' + sep + name); } catch { return null; }
}
function artVisual(a, color, cls = '') {
  const u = a && imgUrl(a.image);
  return u ? `<img class="art-img ${cls}" src="${esc(u)}" alt="" loading="lazy" draggable="false">` : glyph(a?.g || 'shirt', color, cls);
}

/* ── Druck über den Systemdialog (A4, Etikettenbögen, PDF) ── */
/** Grundformat der A4-Belege (Druck und Vorschau in Stammdaten › Filialen › Report-Vorschau) */
const PRINT_BASE_CSS = `    @page{size:A4;margin:16mm 16mm 18mm}*{box-sizing:border-box}html{background:#fff;color-scheme:light}body{background:#fff;font:10.5pt/1.45 "Inter","Segoe UI",system-ui,sans-serif;color:#111;margin:0}
    h1{font-size:20pt;margin:0 0 4mm;letter-spacing:-.01em}table{width:100%;border-collapse:collapse}th{font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em;color:#666;text-align:left;border-bottom:1px solid #999;padding:2mm 1.5mm}
    td{padding:1.8mm 1.5mm;border-bottom:1px solid #e3e3e3;vertical-align:top}.r{text-align:right}.muted{color:#666}.sum td{border:0;padding:1mm 1.5mm}.sum .tot td{font-weight:700;font-size:12pt;border-top:1.5px solid #111;padding-top:2mm}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm;margin-bottom:12mm}.addr{font-size:10pt;line-height:1.5}.sender{font-size:7.5pt;color:#666;border-bottom:1px solid #999;margin-bottom:2mm;padding-bottom:.5mm}
    .meta td{border:0;padding:.6mm 0 .6mm 6mm;font-size:9.5pt}.foot{margin-top:12mm;font-size:8.5pt;color:#555;border-top:1px solid #ccc;padding-top:3mm}.logo{max-height:22mm;max-width:70mm}`;
function printHTML(body, title, css = '') {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const doc = f.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    ${PRINT_BASE_CSS}
    ${css}</style></head><body>${body}</body></html>`);
  doc.close();
  const go2 = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
  const imgs = [...doc.images]; if (!imgs.length) setTimeout(go2, 50);
  else Promise.all(imgs.map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(go2, 50));
}
const logoTag = (cls = 'logo') => { const u = imgUrl(CFG['bon.logo']); return u ? `<img class="${cls}" src="${esc(u)}" alt="">` : ''; };
const firmLine = () => [CFG['firma.name'], CFG['firma.adresse'], CFG['firma.uid'] ? 'UID ' + CFG['firma.uid'] : '', CFG['firma.telefon'] ? 'Tel. ' + CFG['firma.telefon'] : '', CFG['firma.email'], CFG['firma.web']].filter(Boolean).join(' · ');
/** Absender-Block der A4-Belege aus den Angaben der Filiale (Stammdaten › Filialen); src = Einstellungen oder ein Entwurf */
function firmaBlockHTML(src = CFG) {
  const g = k => String(src[k] ?? '').trim(), land = g('firma.land').toUpperCase();
  const kontakt = [g('firma.telefon') && 'Tel. ' + g('firma.telefon'), g('firma.fax') && 'Fax ' + g('firma.fax'), g('firma.mobil') && 'Mobil ' + g('firma.mobil')].filter(Boolean).join(' · ');
  return [g('firma.name'), g('firma.adrzeile1'), g('firma.adrzeile2'), g('firma.adresse'), g('firma.postfach') && 'Postfach ' + g('firma.postfach'), land && land !== 'AT' ? land : '', kontakt, g('firma.email'), g('firma.web'), g('firma.inhaber') && 'Inhaber: ' + g('firma.inhaber'), g('firma.uid') && 'UID ' + g('firma.uid'), g('firma.steuernr') && 'St.-Nr. ' + g('firma.steuernr')].filter(Boolean).map(esc).join('<br>');
}
function letterHead(title, recipientHTML, meta) {
  return `<div class="hd"><div style="min-width:0">${logoTag() || `<div style="font-size:16pt;font-weight:700">${esc(CFG['firma.marke'])}</div>`}
      <div style="margin-top:14mm"><div class="sender">${esc(CFG['firma.name'])} · ${esc(CFG['firma.adresse'])}</div><div class="addr">${recipientHTML || '&nbsp;'}</div></div></div>
    <div style="text-align:right"><div style="font-size:9pt" class="muted">${firmaBlockHTML()}</div>
      <table class="meta" style="width:auto;margin-left:auto;margin-top:8mm">${meta.map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td class="r"><b>${esc(v)}</b></td></tr>`).join('')}</table></div></div>
    <h1>${esc(title)}</h1>`;
}
const custAddr = c => c ? [c.name, c.street, [c.zip, c.city].filter(Boolean).join(' '), c.country && c.country !== 'AT' ? c.country : '', c.uid ? 'UID ' + c.uid : ''].filter(Boolean).map(esc).join('<br>') : '';

/* Rechnung bzw. Lieferschein zu einem Beleg (A4) */
function invoiceHTML(rec, kind) {
  const inv = kind === 'rechnung', c = rec.customer ? (custById(rec.customer.id) || rec.customer) : null;
  const dt = rec.date.toLocaleDateString('de-AT');
  const rows = rec.lines.map((l, i) => {
    const g = r2(l.unit * l.qty), d = l.disc ? r2(g * l.disc.pct / 100) : 0;
    const v = l.service ? (l.meta || '') : `${COLORS[l.c]?.[0] || l.c || ''}${l.s && l.s !== 'Einheitsgröße' ? ' · Gr. ' + l.s : ''}`;
    return `<tr><td>${i + 1}</td><td><b>${esc(l.name)}</b>${v ? `<br><span class="muted">${esc(v)}${l.sku ? ' · Art.-Nr. ' + esc(l.sku) : ''}</span>` : ''}${d ? `<br><span class="muted">Rabatt ${l.disc.pct} %</span>` : ''}</td><td class="r">${l.qty}</td>${inv ? `<td class="r">${num(l.unit, 2)}</td><td class="r">${l.vat} %</td><td class="r">${num(g - d, 2)}</td>` : ''}</tr>`;
  }).join('');
  const lineDisc = rec.lines.reduce((s, l) => s + (l.disc ? r2(r2(l.unit * l.qty) * l.disc.pct / 100) : 0), 0), billDisc = r2((rec.t.disc || 0) - lineDisc);
  return letterHead(inv ? 'Rechnung' : 'Lieferschein', custAddr(c), [[inv ? 'Rechnungsnummer' : 'Lieferschein zu', rec.no], ['Datum', dt], ...(c ? [['Kundennummer', c.id]] : []), ['Kasse', CFG['kasse.id']]])
    + `<table><thead><tr><th style="width:8mm">#</th><th>Artikel</th><th class="r">Menge</th>${inv ? '<th class="r">Einzel €</th><th class="r">USt</th><th class="r">Gesamt €</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`
    + (inv ? `<table class="sum" style="width:75mm;margin:5mm 0 0 auto">${billDisc > 0 ? `<tr><td>Bonrabatt ${rec.billDisc?.pct || ''} %</td><td class="r">− ${num(billDisc, 2)}</td></tr>` : ''}
      ${rec.t.vat.map(v => `<tr><td class="muted">Netto ${v.rate} %</td><td class="r">${num(v.net, 2)}</td></tr><tr><td class="muted">USt ${v.rate} %</td><td class="r">${num(v.tax, 2)}</td></tr>`).join('')}
      ${rec.t.zero ? `<tr><td class="muted">steuerfrei (Gutschein)</td><td class="r">${num(rec.t.zero, 2)}</td></tr>` : ''}
      <tr class="tot"><td>Gesamt EUR</td><td class="r">${num(rec.t.total, 2)}</td></tr>
      ${rec.parts.map(p => `<tr><td class="muted">bezahlt: ${esc(p.label)}</td><td class="r">${num(p.amount, 2)}</td></tr>`).join('')}</table>
      <p style="margin-top:8mm">Der Betrag wurde am ${dt} bezahlt. Leistungsdatum = Rechnungsdatum.${rec.rksv ? ' Der zugehörige Kassenbeleg ist RKSV-signiert.' : ''}</p>`
      : `<p style="margin-top:10mm">Ware vollständig erhalten:</p><p style="margin-top:14mm">______________________________<br><span class="muted">Datum, Unterschrift</span></p>`)
    + `<div class="foot">${esc(firmLine())}${fussA4() ? '<br>' + esc(fussA4()).replace(/\n/g, '<br>') : ''}</div>`;
}
function printInvoice(rec, kind = 'rechnung') {
  if (kind === 'rechnung' && !rec.customer) toast('Rechnung ohne Kundenadresse', {t2: 'Für eine Rechnung mit Anschrift den Kunden am Bon zuordnen', icon: 'info'});
  printHTML(invoiceHTML(rec, kind), `${kind === 'rechnung' ? 'Rechnung' : 'Lieferschein'} ${rec.no}`);
}
/* Bestellung an den Lieferanten (A4) */
function poHTML(head, lines, sup) {
  const s = sup || {};
  const rows = lines.map((l, i) => { const x = varById(l.variant_id); const cost = parseAmt(l.costE ?? (l.cost != null ? num(l.cost / 100, 2) : '')); return `<tr><td>${i + 1}</td><td><b>${esc(l.name || x?.a.name || '')}</b><br><span class="muted">${esc(colorName(l.color || x?.v.c))} · ${esc(l.size || x?.v.s)} · EAN ${esc(l.ean || x?.v.ean || '')}</span></td><td class="r">${esc(l.qty)}</td><td class="r">${isFinite(cost) ? num(cost, 2) : '–'}</td><td class="r">${isFinite(cost) ? num(cost * (parseInt(l.qty, 10) || 0), 2) : '–'}</td></tr>`; }).join('');
  const totalC = lines.reduce((t, l) => { const c = parseAmt(l.costE ?? (l.cost != null ? String(l.cost / 100) : '')); return t + (isFinite(c) ? Math.round(c * 100) * (parseInt(l.qty, 10) || 0) : 0); }, 0), total = totalC / 100;   // in Cent, wie der Programmkern
  return letterHead('Bestellung', lfEmpfaenger(s).map(esc).join('<br>'), [['Bestellnummer', head?.no || 'Entwurf'], ['Datum', new Date().toLocaleDateString('de-AT')], ...(s.nr ? [['Lieferanten-Nr.', s.nr]] : []), ...(lfKundenNr(s) ? [['Unsere Kundennr.', lfKundenNr(s)]] : [])])
    + `${(() => { const l = typeof flZusatz === 'function' ? flZusatz('liefer') : null, r = typeof flZusatz === 'function' ? flZusatz('rechnung') : null; return l || r ? `<table class="meta" style="margin:0 0 4mm"><tr>${l ? `<td style="vertical-align:top;padding-right:10mm"><span class="muted">Lieferadresse</span><br>${l.map(esc).join('<br>')}</td>` : ''}${r ? `<td style="vertical-align:top"><span class="muted">Rechnungsadresse</span><br>${r.map(esc).join('<br>')}</td>` : ''}</tr></table>` : ''; })()}<p>Wir bestellen zu den vereinbarten Konditionen:</p><table><thead><tr><th style="width:8mm">#</th><th>Artikel</th><th class="r">Menge</th><th class="r">EK netto €</th><th class="r">Summe €</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="sum" style="width:70mm;margin:5mm 0 0 auto">${(() => { const pc = +head?.disc_pct || 0; if (!(pc > 0)) return `<tr class="tot"><td>Summe netto EUR</td><td class="r">${num(total, 2)}</td></tr>`; const nach = Math.round(totalC * (1 - pc / 100)) / 100; return `<tr><td>Zwischensumme EUR</td><td class="r">${num(total, 2)}</td></tr><tr><td>Rabatt${head.disc_name ? ' ' + esc(head.disc_name) : ''} ${num(pc, 2)} %</td><td class="r">−${num(total - nach, 2)}</td></tr><tr class="tot"><td>Summe netto EUR</td><td class="r">${num(nach, 2)}</td></tr>`; })()}</table>
    ${(() => { const v = [s.profile?.vereinbarung1, s.profile?.vereinbarung2].map(x => String(x || '').trim()).filter(Boolean); return v.length ? `<p><b>Vereinbarungen:</b><br>${v.map(x => esc(x).replace(/\n/g, '<br>')).join('<br>')}</p>` : ''; })()}${head?.note ? `<p><b>Hinweis:</b> ${esc(head.note)}</p>` : ''}<p>Bitte Lieferschein mit Bestellnummer beilegen. Vielen Dank!</p><div class="foot">${esc(firmLine())}${fussA4() ? '<br>' + esc(fussA4()).replace(/\n/g, '<br>') : ''}</div>`;
}

/* ── EAN-13 als SVG ── */
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = EAN_L.map(p => [...p].map(b => b === '0' ? '1' : '0').join(''));
const EAN_P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function ean13SVG(code, h = 30) {
  if (!/^\d{13}$/.test(code)) return `<span style="font:8pt monospace">${esc(code)}</span>`;
  const d = [...code].map(Number), p = EAN_P[d[0]];
  let bits = '101'; for (let i = 1; i <= 6; i++) bits += (p[i - 1] === 'L' ? EAN_L : EAN_G)[d[i]];
  bits += '01010'; for (let i = 7; i <= 12; i++) bits += EAN_R[d[i]]; bits += '101';
  const guard = i => i < 3 || (i >= 45 && i < 50) || i >= 92;
  let rects = ''; [...bits].forEach((b, i) => { if (b === '1') rects += `<rect x="${i + 7}" y="0" width="1" height="${guard(i) ? h + 5 : h}"/>`; });
  return `<svg viewBox="0 0 109 ${h + 12}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%"><g fill="#000">${rects}</g><g font-family="monospace" font-size="9" text-anchor="middle"><text x="3" y="${h + 11}">${d[0]}</text><text x="31" y="${h + 11}">${code.slice(1, 7)}</text><text x="77" y="${h + 11}">${code.slice(7)}</text></g></svg>`;
}

/* ── Etiketten ── */
const LABEL_FORMATS = {'3x8': {cols: 3, rows: 8, w: 70, h: 37, name: 'A4 · 3 × 8 (70 × 37 mm)'}, '2x7': {cols: 2, rows: 7, w: 99.1, h: 38.1, name: 'A4 · 2 × 7 (99 × 38 mm)'}, '4x10': {cols: 4, rows: 10, w: 48.5, h: 25.4, name: 'A4 · 4 × 10 (48 × 25 mm)'}};
/* ── Etiketten und Warengruppe ──────────────────────────────────────────────
   Die Warengruppe des Artikels (wgRaw(a.cat)) steuert den Etikettendruck:
   • etikett = Zeile der Tabelle „etikettentyp“: Größe (mm, 203 dpi) und Inhalt (Marke, Name, Farbe, Größe, Preis, EAN).
     Fehlt der Typ, ist er unbekannt oder gelöscht: 50 × 30 mm mit allen Feldern (wie bisher).
   • etikett2 = Typ für reduzierte Ware (Aktions-/Sale-Preis aktiv oder Preis gesenkt) – ersetzt den Typ; leer (oder gleich etikett) = Typ bleibt.
     Ohne gültigen Typ2 druckt das Programm wie bisher: nur ein Aktionspreis (a.sale) bringt einen Altpreis; der Altpreis aus einer Preisänderung
     (lblPreisPos/alt) und die Markierung „reduziert“ aus einer Preissenkung gelten nur mit Typ2.
   • Gedruckt wird nach Etikettengröße (Breite × Höhe in mm): gleich große Typen teilen sich Druckauftrag und Rolle, die Felder richten sich nach dem Typ des einzelnen Etiketts.
   • anz_etiketten = Etiketten je Stück bei automatisch vorgeschlagenen Mengen (fehlt = 1; 0 = keine automatischen Etiketten).
   • hierarchie = Zeile der Tabelle „wghierarchie“: die gewählten Ebenen der Warengruppe als zusätzliche Textzeile.
   Die Aufrufer von openLabels geben bei automatischen Mengen lblPos(a, v, menge) mit; manuelle Mengen gehen unverändert durch. */
const LBL_ALLE = {Marke: 1, Name: 1, Farbe: 1, 'Größe': 1, Preis: 1, EAN: 1};
const LBL_STD = {id: '', name: 'Standard 50×30', b: 50, h: 30, f: LBL_ALLE, std: true};
const LBL_FELDMAP = {marke: 'Marke', name: 'Name', farbe: 'Farbe', grosse: 'Größe', preis: 'Preis', ean: 'EAN'};
const lblFeldKey = s => norm(s).replace(/ß/g, 'ss').replace(/oe/g, 'o').replace(/[^a-z]/g, '');
const lblMass = t => `${String(t.b).replace('.', ',')} × ${String(t.h).replace('.', ',')} mm`;
/** Etiketten-Typ (Kennung oder Name) → {id, name, b, h, f} oder null (unbekannt/gelöscht); ungültige Maße und leere Inhaltslisten fallen auf 50 × 30 bzw. alle Felder zurück */
function lblTyp(wert) {
  const id = wgKey('etikettentyp', wert), r = id ? stRows('etikettentyp').find(x => String(x.id) === String(id)) : null;
  if (!r) return null;
  const mm = (v, d, lo, hi) => { v = parseFloat(String(v ?? '').replace(',', '.')); return v >= lo && v <= hi ? v : d; };
  const f = {}; for (const x of Array.isArray(r.felder) ? r.felder : String(r.felder || '').split(/[,;]/)) { const k = LBL_FELDMAP[lblFeldKey(x)]; if (k) f[k] = 1; }
  return {id: String(r.id), name: r.name || String(r.id), b: mm(r.b, 50, 20, 200), h: mm(r.h, 30, 12, 300), f: Object.keys(f).length ? f : LBL_ALLE, std: false};
}
/** Anz. Etiketten der Warengruppe: ganze Zahl 0–99 (wie die Maske prüft); fehlt oder ungültig = 1 */
const lblAnzWert = v => { const s = String(v ?? '').trim(); return /^\d{1,2}$/.test(s) ? +s : 1; };
/** Menge × Anz. der Warengruppe (nur für automatisch entstehende Mengen) */
const lblAnz = (a, menge) => { const r = wgRaw(a.cat), q = Math.max(0, +menge || 0); return r ? Math.round(q * lblAnzWert(r.anz_etiketten)) : q; };
/** Position für openLabels mit automatischer Menge: n = Menge × Anz.; m = die Menge davor (der Dialog erklärt damit die Zahl); extra z. B. {alt} */
const lblPos = (a, v, menge, extra) => ({a, v, n: lblAnz(a, menge), m: menge, ...extra});
/** Positionen nach einer Preisänderung (Zeilen {sku, alt, neu} in Cent): Bestand × Anz.; bei gesenktem Preis mit Altpreis – gedruckt wird er (und „reduziert“) nur, wenn die Warengruppe einen Typ2 hat (labelData) */
const lblPreisPos = lines => lines.flatMap(l => { const a = artById(l.sku); return a ? a.variants.filter(v => v.q > 0).map(v => lblPos(a, v, v.q, l.neu < l.alt ? {alt: l.alt / 100} : null)) : []; });
/** Ebenen der Hierarchie-Zeile von oben nach unten als Text „Bereich › Haupt-Abteilung › Abteilung“ */
function lblHierText(wg, h) {
  const k = wgKette(wg.abteilung), sel = Array.isArray(h.ebenen) ? h.ebenen : String(h.ebenen || '').split(/[,;]/).map(x => x.trim());
  return [['hauptbereich', 'x'], ['bereich', 'b'], ['hauptabteilung', 'h'], ['abteilung', 'a']].filter(([e]) => sel.includes(e)).map(([, s]) => k[s]?.name).filter(Boolean).join(' › ');
}
/** Etiketten-Angaben der Warengruppe eines Artikels: {typ, typ2, anz, hier}; cache (Map) spart wiederholtes Nachschlagen */
function lblWg(a, cache) {
  let w = cache?.get(a.cat); if (w) return w;
  const r = wgRaw(a.cat), h = r?.hierarchie ? stRows('wghierarchie').find(x => String(x.id) === String(wgKey('wghierarchie', r.hierarchie))) : null;
  const typ = r?.etikett ? lblTyp(r.etikett) : null, typ2 = r?.etikett2 ? lblTyp(r.etikett2) : null;
  w = {typ, typ2: typ2 && (!typ || typ2.id !== typ.id) ? typ2 : null, anz: r ? lblAnzWert(r.anz_etiketten) : 1, hier: r && h ? lblHierText(r, h) : ''};   // Typ2 gleich Typ: nichts zu ersetzen (wie das Backend)
  cache?.set(a.cat, w); return w;
}
/** Altpreis aus einer Preissenkung: nur wenn er über dem heutigen Preis liegt UND die Warengruppe einen Typ2 hat (w = lblWg); ohne Typ2 druckt das Programm wie bisher (kein Altpreis).
 *  reduziert = Aktions-/Sale-Preis aktiv oder Altpreis aus der Preissenkung. Der Aktionspreis (a.sale) gilt auch ohne Typ2 (Altpreis wie bisher). */
const lblAltPreis = (a, alt, w) => w?.typ2 && alt > a.price + .001 ? alt : null;
const lblReduziert = (a, alt, w) => !!(a.sale && a.sale < a.price - .001) || lblAltPreis(a, alt, w) != null;
/** Titelzeile (Marke, Name) nach den Feldern des Typs */
const lblTitel = (d, sep) => [d.f.Marke && d.brand, d.f.Name && d.name].filter(Boolean).join(sep);
/** Inhalt eines Etiketts; o = {alt: Preis vor der Senkung, wg: lblWg(a)} */
function labelData(a, v, o = {}) {
  const w = o.wg || lblWg(a), alt = lblAltPreis(a, o.alt, w), red = lblReduziert(a, o.alt, w), typ = (red && w.typ2) || w.typ || LBL_STD, f = typ.f;
  const col = colorName(v.c), sz = (v.s !== 'Einheitsgröße' && v.s) || '', variant = `${col}${v.s !== 'Einheitsgröße' ? ' · ' + v.s : ''}`;
  return {name: a.name, brand: a.brand, variant, ean: v.ean, price: a.sale || a.price, was: a.sale ? a.price : alt, sku: a.id,
    typ, f, red, hier: w.hier, col, sz, pvar: f.Farbe && f['Größe'] ? variant : f.Farbe ? col : f['Größe'] ? sz : ''};
}
function labelsA4HTML(items, fmt, skip) {
  const F = LABEL_FORMATS[fmt] || LABEL_FORMATS['3x8'], cells = [...Array(skip).fill(null)];
  items.forEach(it => { for (let i = 0; i < it.n; i++) cells.push(it.d); });
  const per = F.cols * F.rows, pages = Math.max(1, Math.ceil(cells.length / per));
  const gx = (210 - F.cols * F.w) / 2, gy = (297 - F.rows * F.h) / 2;
  let html = '';
  for (let p = 0; p < pages; p++) {
    html += `<div class="pg">${cells.slice(p * per, (p + 1) * per).map((d, i) => { const x = gx + (i % F.cols) * F.w, y = gy + Math.floor(i / F.cols) * F.h; return d ? `<div class="lb" style="left:${x}mm;top:${y}mm;width:${F.w}mm;height:${F.h}mm">${lblZelleHTML(d)}</div>` : ''; }).join('')}</div>`;
  }
  return html;
}
/** Inhalt eines Etiketts auf dem A4-Bogen: nur die Felder des Typs (Bogengröße bleibt), Hierarchie-Zeile, durchgestrichener Altpreis */
function lblZelleHTML(d) {
  const f = d.f, t = lblTitel(d, ' · '), bc = f.EAN ? `<div class="bc">${ean13SVG(d.ean)}</div>` : '', pr = f.Preis ? `<div class="pr"${f.EAN ? '' : ' style="margin-left:auto"'}>${d.was ? `<s>${num(d.was, 2)}</s>` : ''}€ ${num(d.price, 2)}</div>` : '';
  return `${f.Marke || f.Name ? `<div class="t">${esc(t)}</div>` : ''}<div class="v">${esc([d.pvar, d.sku].filter(Boolean).join(' · '))}</div>${d.hier ? `<div class="h">${esc(d.hier)}</div>` : ''}${bc || pr ? `<div class="row">${bc}${pr}</div>` : ''}`;
}
const LABEL_CSS = `@page{size:A4;margin:0}body{margin:0}.pg{position:relative;width:210mm;height:297mm;page-break-after:always;overflow:hidden}.lb{position:absolute;padding:2.5mm 3mm;display:flex;flex-direction:column;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif}
  .lb .t{font-size:8pt;font-weight:700;line-height:1.15;max-height:2.3em;overflow:hidden}.lb .v{font-size:7pt;color:#444;margin-top:.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lb .row{display:flex;align-items:flex-end;gap:2mm;margin-top:auto;min-height:0;flex:1}
  .lb .bc{flex:1;height:100%;max-height:16mm;min-width:0}.lb .pr{font-size:12pt;font-weight:800;white-space:nowrap;text-align:right;line-height:1.1}.lb .pr s{display:block;font-size:7pt;font-weight:400;color:#555}
  .lb .h{font-size:6.5pt;color:#555;margin-top:.3mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
/** Höhe der Klartextzeile unter dem Strichcode (^BE …,Y; Näherung, Punkte) */
const LBL_KLARTEXT = 30;
/** Stufen des ZPL-Layouts, von voll nach knapp: k = Schrift-/Abstandsfaktor, hier = Hierarchiezeile, was = Altpreis, mf = Marke und Farbe, t2 = Titel zweizeilig, gr = Größenzeile, ti = Titel.
 *  Stufe 0 ist das frühere Layout; die nächste Stufe gilt erst, wenn die Stufe davor aus dem Etikett laufen würde (kleine Typen ab 20 × 12 mm). */
const LBL_STUFEN = [{k: 1, hier: 1, was: 1, mf: 1, t2: 1, gr: 1, ti: 1}, {k: 1, hier: 0, was: 1, mf: 1, t2: 1, gr: 1, ti: 1}, {k: 1, hier: 0, was: 0, mf: 1, t2: 1, gr: 1, ti: 1},
  {k: 1, hier: 0, was: 0, mf: 0, t2: 1, gr: 1, ti: 1}, {k: 1, hier: 0, was: 0, mf: 0, t2: 0, gr: 1, ti: 1}, {k: .85, hier: 0, was: 0, mf: 0, t2: 0, gr: 1, ti: 1},
  {k: .7, hier: 0, was: 0, mf: 0, t2: 0, gr: 1, ti: 1}, {k: .85, hier: 0, was: 0, mf: 0, t2: 0, gr: 1, ti: 0}, {k: .7, hier: 0, was: 0, mf: 0, t2: 0, gr: 1, ti: 0}, {k: .7, hier: 0, was: 0, mf: 0, t2: 0, gr: 0, ti: 0}];
/** ZPL-Etikett (203 dpi) in der Größe des Typs mit den Feldern des Typs. 50 × 30 mm mit allen Feldern ergibt genau das frühere Layout (406 × 240 Punkte);
 *  andere Größen skalieren Schrift und Abstände (Faktor 0,8–1,5), die Zeilen rücken nach oben, wenn ein Feld fehlt. ZPL kann nicht durchstreichen:
 *  der Altpreis steht wie bisher als kleine Zeile über dem Preis. Kleine Typen: ^BY1, wenn der Strichcode bei ^BY2 nicht in die Breite passt; passt das Layout nicht in die Höhe,
 *  entfallen zuerst Hierarchie- und Altpreiszeile, dann Marke und Farbe, danach wird der Titel einzeilig und die Schrift kleiner, zuletzt entfällt der Titel, dann die Größenzeile (LBL_STUFEN).
 *  Sonderzeichen im Text: „^“ und „~“ (Befehlszeichen) werden wie in der Vorversion durch Leerzeichen ersetzt, ebenso Steuerzeichen (Zeilenumbruch in Namen). „\“ braucht keine Behandlung:
 *  ohne ^FH ist es ein gewöhnliches Zeichen (in ^FB bedeutet nur „\&“ Zeilenumbruch) und beendet kein Feld. */
function labelZPL(d) {
  const t = s => String(s).replace(/[\^~\x00-\x1f\x7f]/g, ' ').normalize('NFC'), f = d.f || LBL_ALLE, T = d.typ || LBL_STD, pt = mm => Math.round(mm * 203 / 25.4);
  let W = pt(T.b); if (Math.abs(W - 406) <= 8) W = 406;   // 50 mm ≈ 2 Zoll = 406 Punkte (wie bisher)
  const H = pt(T.h), s0 = clamp(Math.min(W / 406, H / 240), .8, 1.5);
  const hier = d.hier ? t(d.hier.replace(/ › /g, ' > ')) : '';   // „›“ ist nicht in jeder Druckerschrift
  const lay = (o, n) => {
    const s = s0 * o.k, px = v => Math.round(v * s), m = px(16), pw = px(160), wb = W - 2 * m, lim = H - px(10), was = o.was && d.was, fb = n ? `^FB${wb},1,0,L` : '';
    let by = s >= 1.45 ? 3 : 2; while (by > 1 && 2 * m + 95 * by > W) by--;   // schmales Etikett: der Strichcode muss in die Breite passen (^BY1)
    const tit = [o.mf && f.Marke && d.brand, f.Name && d.name].filter(Boolean).join(' '), pv = o.mf ? d.pvar : f['Größe'] ? d.sz || '' : '';
    let z = `^XA^CI28^PW${W}^LL${H}`, y = px(14), text = 0, bot = 0;   // text/bot: untere Kante der Textzeilen bzw. des untersten Elements
    if (o.ti && (f.Marke || f.Name) && (o.mf || tit)) { z += `^FO${m},${y}^A0N,${px(26)},${px(24)}^FB${wb},${o.t2 ? 2 : 1},0,L^FD${t(tit)}^FS`; text = y + (o.t2 ? 2 : 1) * px(26); y += px(o.t2 ? 58 : 30); }
    if (o.gr && (o.mf ? f.Farbe || f['Größe'] : pv)) { z += `^FO${m},${y}^A0N,${px(20)},${px(20)}${fb}^FD${t(pv)}^FS`; text = Math.max(text, y + px(20)); y += px(28); }
    if (hier && o.hier) { z += `^FO${m},${y}^A0N,${px(18)},${px(16)}^FB${wb},1,0,L^FD${hier}^FS`; text = Math.max(text, y + px(18)); y += px(24); }
    const aY = H - px(120), pY = H - px(90);
    const preis = `^FO${W - m - pw},${pY}^A0N,${px(44)},${px(40)}^FB${pw},1,0,R^FD${num(d.price, 2)}^FS${was ? `^FO${W - m - pw},${aY}^A0N,${px(22)},${px(20)}^FB${pw},1,0,R^FD${num(d.was, 2)}^FS` : ''}`;
    const daneben = !f.EAN || W - m - pw >= m + 95 * by + 4;   // reicht neben dem Strichcode der Platz für den Preis?
    if (f.Preis && !daneben) {   // schmales Etikett: Preis (links Altpreis) in eigener Zeile über dem Strichcode
      z += `^FO${m},${y}^A0N,${px(44)},${px(40)}^FB${wb},1,0,R^FD${num(d.price, 2)}^FS${was ? `^FO${m},${y + px(8)}^A0N,${px(22)},${px(20)}^FB${wb},1,0,L^FD${num(d.was, 2)}^FS` : ''}`; bot = y + px(44); y += px(48);
    }
    if (f.EAN) {   // Blockhöhe: Strichcode + Klartext müssen in H passen (Strichcode mindestens 30 Punkte, in den knappen Stufen 20)
      const bh = clamp(Math.min(H - px(70), lim - LBL_KLARTEXT) - y, o.k < 1 ? Math.max(20, px(30)) : 30, px(110));
      z += `^FO${m},${y}^BY${by}^BEN,${bh},Y,N^FD${String(d.ean || '').slice(0, 12)}^FS`; bot = Math.max(bot, y + bh + LBL_KLARTEXT);
    }
    if (f.Preis && daneben) { z += preis; bot = Math.max(bot, pY + px(44)); }
    return {z: z + '^XZ', ok: bot <= lim && !(f.Preis && daneben && text > (was ? aY : pY))};
  };
  let r; for (let n = 0; n < LBL_STUFEN.length; n++) { r = lay(LBL_STUFEN[n], n); if (r.ok) break; }
  return r.z;
}
/** Größenschlüssel eines Typs (Breite × Höhe in mm): gleich große Typen liegen auf derselben Rolle */
const lblGKey = t => `${Math.round(t.b * 100) / 100}x${Math.round(t.h * 100) / 100}`;
/** Positionen nach Etikettengröße gruppieren (Reihenfolge des ersten Auftretens): {key, typ (erster Typ), typen (alle Typen dieser Größe), items}.
 *  Ein Druckauftrag und eine Rollenwechsel-Abfrage je Gruppe; die Felder richten sich weiter nach dem Typ des einzelnen Etiketts. */
function lblGruppen(items) {
  const g = new Map();
  for (const it of items) {
    const typ = it.d.typ, k = lblGKey(typ); if (!g.has(k)) g.set(k, {key: k, typ, typen: [], items: []});
    const x = g.get(k); if (!x.typen.some(y => y.id === typ.id)) x.typen.push(typ); x.items.push(it);
  }
  return [...g.values()];
}
/** Größe der Gruppe mit den Typnamen: „50 × 30 mm (Klebe 50x30, Sale rot 50x30)“ */
const lblGTitel = g => `${lblMass(g.typ)} (${g.typen.map(x => x.name).join(', ')})`;
/** Tabellenzeile im Dialog: Artikel (mit „reduziert“ und dem Hinweis auf Menge × Anz.), Typ, EAN, Preis, Anzahl; kopf = Gruppe (lblGruppen), wenn davor ihre Überschriftszeile steht */
function lblZeileHTML(it, i, kopf, zpl) {
  const d = it.d, typ = d.typ, hint = it.m != null && !it.man && it.anz !== 1 ? (it.anz === 0 ? 'Anz. 0: keine automatischen Etiketten' : `Menge × Anz. (${it.anz})`) : '';
  const sum = kopf ? kopf.items.reduce((s, x) => s + (x.n || 0), 0) : 0;
  return `${kopf ? `<tr><td colspan="5" style="padding:7px 14px;background:var(--surface-2);font-size:12px;font-weight:650">${lblMass(kopf.typ)} · ${kopf.typen.length > 1 ? 'Typen' : 'Typ'} ${esc(kopf.typen.map(x => x.name).join(', '))} · <span data-lbgc="${esc(kopf.key)}">${sum}</span> Etiketten${zpl ? ' · eigener Druckauftrag' : ''}</td></tr>` : ''}<tr><td style="padding-left:14px"><b>${esc(d.name)}</b>${d.red ? ' <span class="pill warn" style="height:18px;font-size:10.5px">reduziert</span>' : ''}<div class="muted" style="font-size:12px">${esc(d.variant)}${hint ? `<span data-lbhint="${i}" title="${esc(`${it.m} × ${it.anz} = ${it.n}`)}"> · ${esc(hint)}</span>` : ''}</div></td><td style="font-size:12px" title="${esc('Inhalt: ' + Object.keys(typ.f).join(', '))}">${esc(typ.name)}<div class="muted" style="font-size:11px">${lblMass(typ)}</div></td><td class="mono" style="font-size:12px">${esc(d.ean)}</td><td class="r">${d.was ? `<s class="muted" style="font-size:11.5px">${eur(d.was)}</s> ` : ''}${eur(d.price)}</td><td class="r" style="padding-right:14px"><input class="input num" data-ln="${i}" value="${it.n}" inputmode="numeric" style="width:64px;height:30px;text-align:right"></td></tr>`;
}
/** Vorschau-Karte im Dialog: Größenverhältnis, Felder und Hierarchie-Zeile des Typs, durchgestrichener Altpreis */
function lblKarteHTML(d) {
  const f = d.f, t = lblTitel(d, ' · '), h = d.typ.std ? 112 : clamp(Math.round(210 * d.typ.h / d.typ.b), 64, 240);
  return `<div class="lb-pv"><div class="lb-card" style="height:${h}px;overflow:hidden">${f.Marke || f.Name ? `<div class="t">${esc(t)}</div>` : ''}${f.Farbe || f['Größe'] ? `<div class="v">${esc(d.pvar)}</div>` : ''}${d.hier ? `<div style="font-size:9px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.hier)}</div>` : ''}${f.EAN || f.Preis ? `<div class="row">${f.EAN ? `<div class="bc">${ean13SVG(d.ean)}</div>` : ''}${f.Preis ? `<b${f.EAN ? '' : ' style="margin-left:auto"'}>${d.was ? `<s style="font-size:10px;font-weight:400;color:#777;margin-right:6px">${num(d.was, 2)}</s>` : ''}${eur(d.price)}</b>` : ''}</div>` : ''}</div><div class="muted" style="font-size:11px;margin-top:4px">${esc(d.typ.name)} · ${lblMass(d.typ)}${d.red ? ' · reduziert' : ''}</div></div>`;
}
const lblZplAktiv = () => DESKTOP && ['netz', 'windows'].includes(CFG['etikett.art']);
const lblSenden = data => invoke('label_print', {data});
/** Zuletzt tatsächlich gesendete Etikettengröße (= eingelegte Rolle): gilt über Dialoge hinweg, damit auch der nächste Dialog vor einer anderen Größe nach dem Rollenwechsel fragt */
const LBL_ROLLE = {g: null};
/** Dialog „Etiketten drucken“. list: Positionen {a, v, n, m?, alt?} (bei automatischer Menge mit lblPos(a, v, menge) erzeugen; alt = Preis vor einer Senkung, wirkt nur mit Typ2 der Warengruppe).
 *  o (für Prüfungen): {zpl: ZPL-Rolle statt A4 erzwingen, senden: Sendefunktion statt label_print} */
function openLabels(list, o = {}) {
  const wc = new Map(), items = list.map(x => { const w = lblWg(x.a, wc); return {key: x.v.ean, d: labelData(x.a, x.v, {alt: x.alt, wg: w}), n: x.n ?? 1, m: x.m, anz: w.anz}; });
  { const sortiert = lblGruppen(items).flatMap(g => g.items); items.length = 0; for (const it of sortiert) items.push(it); }   // nach Etikettengröße gruppiert (ohne Spread: auch Listen mit über 100.000 Positionen)
  const st = {fmt: CFG['etikett.format'] || '3x8', skip: 0};
  const zpl = o.zpl ?? lblZplAktiv(); let grp = lblGruppen(items);
  const el = openLayer(`<div class="modal" style="width:min(720px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Etiketten"><div id="lbBody" style="display:flex;flex-direction:column;min-height:0"></div></div>`);
  const box = $('#lbBody', el);
  const render = () => {
    const total = items.reduce((s, i) => s + (i.n || 0), 0); grp = lblGruppen(items);
    const typen = [...items.reduce((m, it) => m.has(it.d.typ.id) ? m : m.set(it.d.typ.id, it), new Map()).values()];   // erstes Etikett je Typ: eine Vorschaukarte je Typ
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('tag')}</div><div><h2>Etiketten drucken</h2><p>${total} Etiketten · ${zpl ? `Etikettendrucker (ZPL) · ${esc(CFG['etikett.art'] === 'netz' ? CFG['etikett.adresse'] : CFG['etikett.name'])}` : 'A4-Bogen über den Druckdialog'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:flex;flex-direction:column;gap:12px;overflow:auto">
        ${zpl ? '' : `<div class="ed-grid"><label class="field"><span>Bogen</span><select class="input select" id="lbFmt">${Object.entries(LABEL_FORMATS).map(([k, f]) => `<option value="${k}" ${k === st.fmt ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label><label class="field"><span>Bereits benutzte Felder überspringen</span><input class="input num" id="lbSkip" inputmode="numeric" value="${st.skip}"></label></div>`}
        ${zpl && grp.length > 1 ? `<div class="muted" style="font-size:12.5px;line-height:1.45">${grp.length} Etikettengrößen: je Größe ein eigener Druckauftrag. Rolle wechseln: ${grp.map(g => esc(g.typen.length > 1 ? lblGTitel(g) : lblMass(g.typ))).join(' → ')}.</div>` : ''}
        <div class="card" style="overflow:hidden;flex:none"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:14px">Artikel</th><th>Typ</th><th>EAN</th><th class="r">Preis</th><th class="r" style="padding-right:14px">Anzahl</th></tr></thead><tbody>${items.map((it, i) => lblZeileHTML(it, i, grp.length > 1 && (i === 0 || lblGKey(items[i - 1].d.typ) !== lblGKey(it.d.typ)) ? grp.find(g => g.key === lblGKey(it.d.typ)) : null, zpl)).join('')}</tbody></table></div>
        <div class="lb-prev">${(typen.length > 1 ? typen.slice(0, 6) : items.slice(0, 3)).map(it => lblKarteHTML(it.d)).join('')}</div>
      </div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="lbGo" ${total ? '' : 'disabled'}>${ic('printer', 'i-sm')}${total} Etiketten drucken</button></div>`;
  };
  box.addEventListener('input', e => {
    const i = e.target.dataset.ln; if (i != null) {
      items[i].n = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0; items[i].man = true; $(`[data-lbhint="${i}"]`, box)?.remove();   // von Hand geändert: kein Hinweis „Menge × Anz.“ mehr
      const summe = items.reduce((s, x) => s + x.n, 0);
      $('#lbGo', box).innerHTML = `${ic('printer', 'i-sm')}${summe} Etiketten drucken`; $('#lbGo', box).disabled = !summe;
      $$('[data-lbgc]', box).forEach(s => { s.textContent = items.filter(x => lblGKey(x.d.typ) === s.dataset.lbgc).reduce((a, x) => a + (x.n || 0), 0); });
    }
    if (e.target.id === 'lbSkip') st.skip = clamp(parseInt(e.target.value, 10) || 0, 0, 39);
  });
  box.addEventListener('change', e => { if (e.target.id === 'lbFmt') { st.fmt = e.target.value; saveSettings({'etikett.format': st.fmt}, true); } });
  let busy = false, zuletzt = LBL_ROLLE.g;   // zuletzt: Größenschlüssel der zuletzt TATSÄCHLICH gesendeten Gruppe (die eingelegte Rolle); gilt für alle Druckversuche dieses Dialogs
  box.addEventListener('click', async e => {
    if (!e.target.closest('#lbGo') || busy) return;
    const use = items.filter(i => i.n > 0);
    if (zpl) {
      /* Rolle: je Etikettengröße ein eigener Druckauftrag; vor jeder Größe, die nicht der zuletzt gesendeten entspricht, die Rolle wechseln lassen – auch bei jedem neuen Versuch nach Abbruch/Fehler.
         Gesendete Positionen verlassen die Liste (kein doppeltes Drucken bei Abbruch/Fehler). */
      const gr = lblGruppen(use), sum = g => g.items.reduce((s, i) => s + i.n, 0); let sent = 0, sentG = 0; busy = true;
      try {
        for (let k = 0; k < gr.length; k++) {
          const g = gr[k];
          if (zuletzt != null && g.key !== zuletzt && !await confirmBox(`Rolle wechseln: ${lblGTitel(g)} – ${sum(g)} Etiketten`, 'Rolle gewechselt – drucken')) { toast('Druck unterbrochen', {t2: `${lblMass(g.typ)}: ${gr.slice(k).reduce((s, x) => s + sum(x), 0)} Etiketten bleiben in der Liste`, icon: 'info', dur: 6000}); break; }
          try { await (o.senden || lblSenden)(g.items.flatMap(i => Array(i.n).fill(labelZPL(i.d))).join('\n')); }
          catch (err) { toast('Etikettendruck fehlgeschlagen', {t2: `${gr.length > 1 || zuletzt != null ? lblMass(g.typ) + ': ' : ''}${err}`, type: 'warn', dur: 7000}); break; }
          zuletzt = LBL_ROLLE.g = g.key; sent += sum(g); sentG++; for (let j = items.length - 1; j >= 0; j--) if (lblGKey(items[j].d.typ) === g.key) items.splice(j, 1);   // auch Zeilen mit 0 dieser Größe: die Größe ist erledigt
        }
      } finally { busy = false; }
      if (sent) { toast('Etiketten gesendet', {t2: `${sent} Stück an den Etikettendrucker${sentG > 1 ? ` · ${sentG} Größen` : ''}`, type: 'pos', icon: 'tag'}); Hooks.emit('device.labels.printed', {anzahl: sent}); }
      if (items.some(i => i.n > 0)) render(); else closeLayer(el);
      return;
    }
    printHTML(labelsA4HTML(use, st.fmt, st.skip), 'Etiketten', LABEL_CSS); closeLayer(el);
    Hooks.emit('device.labels.printed', {anzahl: use.reduce((s, i) => s + i.n, 0)});
  });
  render();
}
if (window.KONTOR_UI) Object.assign(window.KONTOR_UI, {openLabels, labelData, labelZPL, labelsA4HTML, lblWg, lblTyp, lblAnz, lblPos, lblPreisPos, lblGruppen, lblGKey, artById, stRows: k => stRows(k), ART, lblRolleSetzen: g => { LBL_ROLLE.g = g; }});   // nur für Prüfungen

/* ── E-Mail ── */
const mailReady = () => DESKTOP && CFG['mail.host'] && CFG['mail.from'];
function mailReceiptHTML(rec) {
  const m = v => num(v, 2), row = (l, r, b) => `<tr><td style="padding:3px 0;${b ? 'font-weight:700;' : ''}">${l}</td><td style="padding:3px 0;text-align:right;white-space:nowrap;${b ? 'font-weight:700;' : ''}">${r}</td></tr>`;
  const neg = rec.kind === 'retoure' || rec.kind === 'storno';
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:460px;margin:0 auto;color:#111;font-size:14px">
    <h2 style="margin:0 0 4px">${esc(CFG['firma.marke'])}</h2><div style="color:#666;font-size:12px">${esc(CFG['firma.name'])} · ${esc(CFG['firma.adresse'])}${CFG['firma.uid'] ? ' · UID ' + esc(CFG['firma.uid']) : ''}</div>
    <p style="margin:18px 0 6px">${neg ? `${kindLabel(rec)} zu Bon ${esc(rec.ref || '')}` : 'Vielen Dank für Ihren Einkauf!'}</p>
    <div style="color:#666;font-size:12px">Beleg ${esc(rec.no)} · ${esc(rec.date.toLocaleString('de-AT'))} · Kasse ${esc(CFG['kasse.id'])}</div>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;border-top:1px solid #ddd">${rec.lines.map(l => row(`${neg ? '−' : ''}${l.qty} × ${esc(l.name)}${l.service ? (l.meta ? `<br><span style="color:#666;font-size:12px">${esc(l.meta)}</span>` : '') : `<br><span style="color:#666;font-size:12px">${esc(COLORS[l.c]?.[0] || l.c || '')}${l.s && l.s !== 'Einheitsgröße' ? ' · ' + esc(l.s) : ''}</span>`}`, m(neg ? -(l.refund || 0) / 100 : r2(l.unit * l.qty) - (l.disc ? r2(r2(l.unit * l.qty) * l.disc.pct / 100) : 0)))).join('')}
      ${row(neg ? 'Erstattung EUR' : 'Summe EUR', m(rec.t.total), true)}${rec.parts.map(p => row(esc(p.label), m(p.amount))).join('')}${rec.change > 0 ? row('Rückgeld', m(rec.change)) : ''}
      ${rec.t.vat.map(v => row(`<span style="color:#666;font-size:12px">MwSt ${v.rate} % (netto ${m(v.net)})</span>`, `<span style="color:#666;font-size:12px">${m(v.tax)}</span>`)).join('')}</table>
    ${rec.rksv?.qr ? `<div style="text-align:center;margin-top:16px"><img src="cid:qr" width="160" height="160" alt="RKSV-QR-Code"><div style="color:#666;font-size:11px">RKSV · Testmodus</div></div>` : ''}
    <p style="color:#666;font-size:12px;margin-top:18px;white-space:pre-line">${esc(fussBon())}</p></div>`;
}
function mailReceiptText(rec) { return `${CFG['firma.marke']} – Beleg ${rec.no} vom ${rec.date.toLocaleString('de-AT')}\n\n${rec.lines.map(l => `${l.qty} x ${l.name}`).join('\n')}\n\nSumme EUR ${num(rec.t.total, 2)}${fussBon() ? `\n\n${fussBon()}` : ''}\n\n${CFG['firma.name']} · ${CFG['firma.adresse']}`; }
function askEmail(prefill, title) {
  return new Promise(resolve => {
    const el = openLayer(`<div class="modal" style="width:min(460px,100%)" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="m-head"><div class="m-ic">${ic('mail')}</div><div><h2>${esc(title)}</h2><p>über ${esc(CFG['mail.host'] || 'Ihren Mailserver')}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body"><label class="field"><span>E-Mail-Adresse</span><input class="input" id="mlTo" type="email" value="${esc(prefill || '')}" autocomplete="off"></label></div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="mlGo">${ic('mail', 'i-sm')}Senden</button></div></div>`, {focus: '#mlTo', onClose: () => resolve(null)});
    const go2 = () => { const v = $('#mlTo', el).value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return shakeEl($('#mlTo', el)); resolve(v); closeLayer(el); };
    $('#mlGo', el).onclick = go2; el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
  });
}
async function mailReceipt(rec) {
  if (!mailReady()) return toast('E-Mail nicht eingerichtet', {t2: 'Einstellungen → E-Mail: Mailserver eintragen', type: 'warn', icon: 'mail', action: {label: 'Einrichten', run: () => { setGo('mail'); }}});
  const to = await askEmail(rec.customer?.email || custById(rec.customer?.id)?.email, `Beleg ${rec.no} per E-Mail`); if (!to) return;
  toast('Sende …', {icon: 'mail', dur: 1500});
  try { await invoke('mail_send', {to, subject: `Ihr Beleg ${rec.no} – ${CFG['firma.marke']}`, html: mailReceiptHTML(rec), text: mailReceiptText(rec), qr: rec.rksv?.qr || null, purpose: 'beleg'}); toast('Beleg gesendet', {t2: to, type: 'pos', icon: 'mail'}); Hooks.emit('pos.receipt.digital', {beleg: rec.no, kanal: 'email'}); }
  catch (e) { toast('Versand fehlgeschlagen', {t2: String(e), type: 'warn', dur: 9000}); }
}
async function mailPO(head, lines, sup) {
  if (!mailReady()) return toast('E-Mail nicht eingerichtet', {t2: 'Einstellungen → E-Mail', type: 'warn', icon: 'mail'});
  const to = await askEmail(sup?.email, `Bestellung ${head?.no || ''} senden`); if (!to) return;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111">${poHTML(head, lines, sup).replace(/<img[^>]*>/g, '')}</div>`;
  try { await invoke('mail_send', {to, subject: `Bestellung ${head?.no || ''} – ${CFG['firma.name']}`, html, text: `Bestellung ${head?.no || ''}\n\n` + lines.map(l => `${l.qty} x ${l.name || ''} ${l.color || ''} ${l.size || ''} EAN ${l.ean || ''}`).join('\n'), qr: null, purpose: 'bestellung'}); toast('Bestellung gesendet', {t2: to, type: 'pos', icon: 'mail'}); }
  catch (e) { toast('Versand fehlgeschlagen', {t2: String(e), type: 'warn', dur: 9000}); }
}
