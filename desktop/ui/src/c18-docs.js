
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
  const total = lines.reduce((t, l) => { const c = parseAmt(l.costE ?? (l.cost != null ? String(l.cost / 100) : '')); return t + (isFinite(c) ? c * (parseInt(l.qty, 10) || 0) : 0); }, 0);
  return letterHead('Bestellung', [s.name, s.contact ? 'z. H. ' + s.contact : '', s.email].filter(Boolean).map(esc).join('<br>'), [['Bestellnummer', head?.no || 'Entwurf'], ['Datum', new Date().toLocaleDateString('de-AT')], ...(s.customer_no ? [['Unsere Kundennr.', s.customer_no]] : [])])
    + `${(() => { const l = typeof flZusatz === 'function' ? flZusatz('liefer') : null, r = typeof flZusatz === 'function' ? flZusatz('rechnung') : null; return l || r ? `<table class="meta" style="margin:0 0 4mm"><tr>${l ? `<td style="vertical-align:top;padding-right:10mm"><span class="muted">Lieferadresse</span><br>${l.map(esc).join('<br>')}</td>` : ''}${r ? `<td style="vertical-align:top"><span class="muted">Rechnungsadresse</span><br>${r.map(esc).join('<br>')}</td>` : ''}</tr></table>` : ''; })()}<p>Wir bestellen zu den vereinbarten Konditionen:</p><table><thead><tr><th style="width:8mm">#</th><th>Artikel</th><th class="r">Menge</th><th class="r">EK netto €</th><th class="r">Summe €</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="sum" style="width:70mm;margin:5mm 0 0 auto"><tr class="tot"><td>Summe netto EUR</td><td class="r">${num(total, 2)}</td></tr></table>
    ${head?.note ? `<p><b>Hinweis:</b> ${esc(head.note)}</p>` : ''}<p>Bitte Lieferschein mit Bestellnummer beilegen. Vielen Dank!</p><div class="foot">${esc(firmLine())}${fussA4() ? '<br>' + esc(fussA4()).replace(/\n/g, '<br>') : ''}</div>`;
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
function labelData(a, v) { return {name: a.name, brand: a.brand, variant: `${colorName(v.c)}${v.s !== 'Einheitsgröße' ? ' · ' + v.s : ''}`, ean: v.ean, price: a.sale || a.price, was: a.sale ? a.price : null, sku: a.id}; }
function labelsA4HTML(items, fmt, skip) {
  const F = LABEL_FORMATS[fmt] || LABEL_FORMATS['3x8'], cells = [...Array(skip).fill(null)];
  items.forEach(it => { for (let i = 0; i < it.n; i++) cells.push(it.d); });
  const per = F.cols * F.rows, pages = Math.max(1, Math.ceil(cells.length / per));
  const gx = (210 - F.cols * F.w) / 2, gy = (297 - F.rows * F.h) / 2;
  let html = '';
  for (let p = 0; p < pages; p++) {
    html += `<div class="pg">${cells.slice(p * per, (p + 1) * per).map((d, i) => { const x = gx + (i % F.cols) * F.w, y = gy + Math.floor(i / F.cols) * F.h; return d ? `<div class="lb" style="left:${x}mm;top:${y}mm;width:${F.w}mm;height:${F.h}mm"><div class="t">${esc(d.brand ? d.brand + ' · ' : '')}${esc(d.name)}</div><div class="v">${esc(d.variant)} · ${esc(d.sku)}</div><div class="row"><div class="bc">${ean13SVG(d.ean)}</div><div class="pr">${d.was ? `<s>${num(d.was, 2)}</s>` : ''}€ ${num(d.price, 2)}</div></div></div>` : ''; }).join('')}</div>`;
  }
  return html;
}
const LABEL_CSS = `@page{size:A4;margin:0}body{margin:0}.pg{position:relative;width:210mm;height:297mm;page-break-after:always;overflow:hidden}.lb{position:absolute;padding:2.5mm 3mm;display:flex;flex-direction:column;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif}
  .lb .t{font-size:8pt;font-weight:700;line-height:1.15;max-height:2.3em;overflow:hidden}.lb .v{font-size:7pt;color:#444;margin-top:.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lb .row{display:flex;align-items:flex-end;gap:2mm;margin-top:auto;min-height:0;flex:1}
  .lb .bc{flex:1;height:100%;max-height:16mm;min-width:0}.lb .pr{font-size:12pt;font-weight:800;white-space:nowrap;text-align:right;line-height:1.1}.lb .pr s{display:block;font-size:7pt;font-weight:400;color:#555}`;
function labelZPL(d) {
  const t = s => String(s).replace(/[\^~]/g, ' ').normalize('NFC');
  return `^XA^CI28^PW406^LL240^FO16,14^A0N,26,24^FB374,2,0,L^FD${t((d.brand ? d.brand + ' ' : '') + d.name)}^FS^FO16,72^A0N,20,20^FD${t(d.variant)}^FS^FO16,100^BY2^BEN,70,Y,N^FD${d.ean.slice(0, 12)}^FS^FO230,150^A0N,44,40^FB160,1,0,R^FD${num(d.price, 2)}^FS${d.was ? `^FO230,120^A0N,22,20^FB160,1,0,R^FD${num(d.was, 2)}^FS` : ''}^XZ`;
}
function openLabels(list) {
  const items = list.map(x => ({key: x.v.ean, d: labelData(x.a, x.v), n: x.n ?? 1}));
  const st = {fmt: CFG['etikett.format'] || '3x8', skip: 0};
  const zpl = DESKTOP && ['netz', 'windows'].includes(CFG['etikett.art']);
  const el = openLayer(`<div class="modal" style="width:min(720px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Etiketten"><div id="lbBody" style="display:flex;flex-direction:column;min-height:0"></div></div>`);
  const box = $('#lbBody', el);
  const render = () => {
    const total = items.reduce((s, i) => s + (i.n || 0), 0);
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('tag')}</div><div><h2>Etiketten drucken</h2><p>${total} Etiketten · ${zpl ? `Etikettendrucker (ZPL) · ${esc(CFG['etikett.art'] === 'netz' ? CFG['etikett.adresse'] : CFG['etikett.name'])}` : 'A4-Bogen über den Druckdialog'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:12px;overflow:auto">
        ${zpl ? '' : `<div class="ed-grid"><label class="field"><span>Bogen</span><select class="input select" id="lbFmt">${Object.entries(LABEL_FORMATS).map(([k, f]) => `<option value="${k}" ${k === st.fmt ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label><label class="field"><span>Bereits benutzte Felder überspringen</span><input class="input num" id="lbSkip" inputmode="numeric" value="${st.skip}"></label></div>`}
        <div class="card" style="overflow:hidden"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:14px">Artikel</th><th>EAN</th><th class="r">Preis</th><th class="r" style="padding-right:14px">Anzahl</th></tr></thead><tbody>${items.map((it, i) => `<tr><td style="padding-left:14px"><b>${esc(it.d.name)}</b><div class="muted" style="font-size:12px">${esc(it.d.variant)}</div></td><td class="mono" style="font-size:12px">${esc(it.d.ean)}</td><td class="r">${eur(it.d.price)}</td><td class="r" style="padding-right:14px"><input class="input num" data-ln="${i}" value="${it.n}" inputmode="numeric" style="width:64px;height:30px;text-align:right"></td></tr>`).join('')}</tbody></table></div>
        <div class="lb-prev">${items.slice(0, 3).map(it => `<div class="lb-card"><div class="t">${esc(it.d.name)}</div><div class="v">${esc(it.d.variant)}</div><div class="row"><div class="bc">${ean13SVG(it.d.ean)}</div><b>${eur(it.d.price)}</b></div></div>`).join('')}</div>
      </div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="lbGo" ${total ? '' : 'disabled'}>${ic('printer', 'i-sm')}${total} Etiketten drucken</button></div>`;
  };
  box.addEventListener('input', e => {
    const i = e.target.dataset.ln; if (i != null) { items[i].n = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0; $('#lbGo', box).innerHTML = `${ic('printer', 'i-sm')}${items.reduce((s, x) => s + x.n, 0)} Etiketten drucken`; }
    if (e.target.id === 'lbSkip') st.skip = clamp(parseInt(e.target.value, 10) || 0, 0, 39);
  });
  box.addEventListener('change', e => { if (e.target.id === 'lbFmt') { st.fmt = e.target.value; saveSettings({'etikett.format': st.fmt}, true); } });
  box.addEventListener('click', async e => {
    if (!e.target.closest('#lbGo')) return;
    const use = items.filter(i => i.n > 0);
    if (zpl) {
      const data = use.flatMap(i => Array(i.n).fill(labelZPL(i.d))).join('\n');
      try { await invoke('label_print', {data}); toast('Etiketten gesendet', {t2: `${use.reduce((s, i) => s + i.n, 0)} Stück an den Etikettendrucker`, type: 'pos', icon: 'tag'}); closeLayer(el); }
      catch (err) { toast('Etikettendruck fehlgeschlagen', {t2: String(err), type: 'warn', dur: 7000}); }
    } else { printHTML(labelsA4HTML(use, st.fmt, st.skip), 'Etiketten', LABEL_CSS); closeLayer(el); }
    Hooks.emit('device.labels.printed', {anzahl: use.reduce((s, i) => s + i.n, 0)});
  });
  render();
}

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
function mailReceiptText(rec) { return `${CFG['firma.marke']} – Beleg ${rec.no} vom ${rec.date.toLocaleString('de-AT')}\n\n${rec.lines.map(l => `${l.qty} x ${l.name}`).join('\n')}\n\nSumme EUR ${num(rec.t.total, 2)}\n\n${CFG['firma.name']} · ${CFG['firma.adresse']}`; }
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
