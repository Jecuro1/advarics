
/* ════════════════════════════════════════════════════════════════════
   24 · BONDRUCKER & KASSENLADE (ESC/POS)
   Netzwerkdrucker (IP, Port 9100) oder im System installierter Drucker (Windows-Spooler bzw. macOS/CUPS).
   Die Kassenlade hängt am Drucker und öffnet über dessen Impuls.
   ════════════════════════════════════════════════════════════════════ */
const printerOn = () => DESKTOP && CFG['drucker.art'] && CFG['drucker.art'] !== 'aus';
const m2 = v => num(v, 2);
async function printOps(ops, purpose, quiet) {
  if (!DESKTOP) { if (!quiet) toast('Gedruckt (Vorschau)', {t2: 'In der Desktop-App an den Bondrucker', icon: 'printer'}); return true; }
  if (!printerOn()) { if (!quiet) toast('Kein Bondrucker eingerichtet', {t2: 'Einstellungen → Drucker & Kassenlade', type: 'warn', icon: 'printer', action: {label: 'Einrichten', run: () => { setGo('drucker'); }}}); return false; }
  try { await invoke('printer_print', {ops, purpose}); if (!quiet) toast('Gedruckt', {t2: purpose, type: 'pos', icon: 'printer', dur: 1800}); return true; }
  catch (e) { toast('Druck fehlgeschlagen', {t2: String(e), type: 'warn', icon: 'printer', dur: 7000}); return false; }
}
async function openDrawer(reason, auto) {
  Hooks.emit('device.drawer.opened', {kasse: CFG['kasse.id'], benutzer: S.user.name, grund: reason});
  if (!DESKTOP) return toast('Kassenlade geöffnet', {t2: 'Vorschau', icon: 'cash'});
  if (!printerOn() || !CFG['drucker.lade']) { if (!auto) toast('Keine Kassenlade eingerichtet', {t2: 'Einstellungen → Drucker & Kassenlade', type: 'warn', icon: 'cash'}); return; }
  try { await invoke('printer_print', {ops: [{t: 'drawer'}], purpose: 'lade: ' + reason}); if (!auto) toast('Kassenlade geöffnet', {t2: reason, icon: 'cash', dur: 1600}); }
  catch (e) { toast('Kassenlade nicht erreichbar', {t2: String(e), type: 'warn', icon: 'cash'}); }
}
function headOps() {
  return [...(CFG['bon.logo'] && CFG['bon.logoDruck'] ? [{t: 'logo'}] : []), {t: 'text', s: CFG['firma.marke'], a: 'c', b: true, big: true}, {t: 'text', s: CFG['firma.zusatz'], a: 'c'}, {t: 'text', s: [CFG['firma.adresse'], [CFG['firma.uid'] && `UID ${CFG['firma.uid']}`, CFG['firma.telefon'] && `Tel. ${CFG['firma.telefon']}`].filter(Boolean).join(' · ')].filter(Boolean).join('\n'), a: 'c'}, ...(CFG['bon.kopf'] ? [{t: 'text', s: CFG['bon.kopf'], a: 'c'}] : []), {t: 'line'}];
}
function receiptOps(rec) {
  const ops = headOps(), dt = rec.date;
  const d = `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  const kind = rec.kind || 'verkauf';
  if (kind !== 'verkauf') ops.push({t: 'text', s: (rec.label || kindLabel(rec)).toUpperCase(), a: 'c', b: true, big: true}, ...(rec.ref ? [{t: 'text', s: `zu Bon ${rec.ref} · ${rec.reason || ''}`, a: 'c'}] : []));
  if (rec.copy) ops.push({t: 'text', s: '*** KOPIE ***', a: 'c', b: true});
  ops.push({t: 'lr', l: `Bon ${rec.no}`, r: `Kasse ${CFG['kasse.id']}`}, {t: 'lr', l: d, r: bonName(rec.cashier)}, {t: 'line'});
  const neg = kind === 'retoure' || kind === 'storno';
  (rec.lines || []).forEach(l => {
    const amount = neg ? -(l.refund || 0) / 100 : r2(l.unit * l.qty);
    ops.push({t: 'lr', l: `${neg ? '-' : ''}${l.qty} x ${l.name}`, r: m2(amount)});
    const v = l.service ? (l.meta || '') : `${COLORS[l.c]?.[0] || l.c || ''}${l.s && l.s !== 'Einheitsgröße' ? ' · ' + l.s : ''}`;
    if (v) ops.push({t: 'text', s: '  ' + v});
    if (CFG['bon.artikelnr'] && l.sku) ops.push({t: 'text', s: '  Art.-Nr. ' + l.sku});
    if (!neg && l.disc) ops.push({t: 'lr', l: `  Rabatt ${num(l.disc.pct, Number.isInteger(+l.disc.pct) ? 0 : 1)} %${l.disc.reason ? ' ' + l.disc.reason : ''}`, r: '-' + m2(r2(r2(l.unit * l.qty) * l.disc.pct / 100))});
  });
  { const bd = r2(rec.t.disc - (rec.lines || []).reduce((s, l) => s + (l.disc ? r2(r2(l.unit * l.qty) * l.disc.pct / 100) : 0), 0)); if (!neg && rec.billDisc && bd > 0) ops.push({t: 'lr', l: `Bonrabatt ${rec.billDisc.pct} %`, r: '-' + m2(bd)}); }
  ops.push({t: 'line'}, {t: 'lr', l: neg ? 'ERSTATTUNG EUR' : 'SUMME EUR', r: m2(rec.t.total), b: true}, {t: 'line'});
  (rec.parts || []).forEach(p => ops.push({t: 'lr', l: p.label + (p.code ? ' ' + p.code : ''), r: m2(p.given || p.amount)}));
  if (rec.change > 0) ops.push({t: 'lr', l: 'Rückgeld', r: m2(rec.change)});
  if (!neg && CFG['bon.ersparnis'] && savingsOf(rec) > 0) ops.push({t: 'lr', l: 'Sie sparen heute', r: m2(savingsOf(rec)), b: true});
  if ((rec.t.vat || []).length || rec.t.zero) {
    ops.push({t: 'line'}, {t: 'lr', l: 'MwSt', r: 'Netto  Steuer  Brutto'});
    (rec.t.vat || []).forEach(v => ops.push({t: 'lr', l: `${v.rate} %`, r: `${m2(v.net)}  ${m2(v.tax)}  ${m2(v.gross)}`}));
    if (rec.t.zero) ops.push({t: 'lr', l: '0 %', r: `${m2(rec.t.zero)}  0,00  ${m2(rec.t.zero)}`});
  }
  if (rec.customer) ops.push({t: 'line'}, {t: 'text', s: `Kunde ${rec.customer.id}${neg ? '' : ` · +${rec.pointsEarned ?? rec.t.points} Punkte`}`, a: 'c'});
  if (rec.rksv?.qr) ops.push({t: 'feed', n: 1}, {t: 'qr', d: rec.rksv.qr}, {t: 'text', s: 'RKSV Testmodus (nicht registriert)', a: 'c'});
  if (neg) ops.push({t: 'feed', n: 2}, {t: 'text', s: 'Unterschrift: ______________________', a: 'c'});
  else if (kind === 'verkauf') ops.push({t: 'line'}, {t: 'text', s: fussBon(), a: 'c'});
  ops.push({t: 'feed', n: 4}, {t: 'cut'});
  return ops;
}
function reportOps(s, title) {
  const ops = headOps(), e = c => m2((c || 0) / 100);
  ops.push({t: 'text', s: title, a: 'c', b: true, big: true}, {t: 'lr', l: `Kasse ${CFG['kasse.id']}`, r: fmtTs(s.ts || new Date().toISOString())}, {t: 'lr', l: 'seit', r: s.from ? fmtTs(s.from) : 'Beginn'});
  if (s.first) ops.push({t: 'lr', l: 'Belege', r: `${s.first} - ${s.last}`});
  ops.push({t: 'line'}, {t: 'lr', l: `Verkäufe (${s.counts.sales})`, r: e(s.gross_sales)}, {t: 'lr', l: `Retouren/Stornos (${s.counts.returns + s.counts.stornos})`, r: '-' + e(s.refunds)}, {t: 'lr', l: 'darin Rabatte', r: e(s.discounts)}, {t: 'lr', l: 'UMSATZ', r: e(s.revenue), b: true}, {t: 'line'});
  s.vat.forEach(v => ops.push({t: 'lr', l: `MwSt ${v.rate} %`, r: `${e(v.net)}  ${e(v.tax)}  ${e(v.gross)}`}));
  ops.push({t: 'line'}); s.payments.forEach(p => ops.push({t: 'lr', l: `${p.label || p.m} (${p.count})`, r: e(p.amount)}));
  ops.push({t: 'line'}, {t: 'lr', l: 'Wechselgeld/Übertrag', r: e(s.cash.start)}, {t: 'lr', l: 'Bareinnahmen', r: e(s.cash.sales)}, {t: 'lr', l: 'Einlagen', r: e(s.cash.deposits)}, {t: 'lr', l: 'Entnahmen', r: '-' + e(s.cash.withdrawals)}, {t: 'lr', l: 'SOLL-BESTAND', r: e(s.cash.expected), b: true});
  if (s.counted != null) ops.push({t: 'lr', l: 'GEZÄHLT', r: e(s.counted), b: true}, {t: 'lr', l: 'DIFFERENZ', r: e(s.diff), b: true}, ...(s.note ? [{t: 'text', s: 'Notiz: ' + s.note}] : []));
  ops.push({t: 'line'}); s.cashiers.forEach(c => ops.push({t: 'lr', l: `${c.name || '-'} (${c.sales})`, r: e(c.revenue)}));
  if (s.rksv_turnover != null) ops.push({t: 'line'}, {t: 'lr', l: 'RKSV Umsatzzähler', r: e(s.rksv_turnover)});
  ops.push({t: 'feed', n: 4}, {t: 'cut'});
  return ops;
}
const printReceipt = async (rec, opts = {}) => { const n = opts.copy || typeof kkBelegAnzahl !== 'function' ? 1 : kkBelegAnzahl(rec); let r; for (let i = 0; i < n; i++) r = await printOps(receiptOps({...rec, copy: !!opts.copy}), `${kindLabel(rec)} ${rec.no}${opts.copy ? ' (Kopie)' : ''}`, opts.quiet); return r; };

/* ── Einstellungen → Drucker ── */
function printerSectionHTML() {
  return `<section class="set-sec" id="sec-drucker"><h2>Drucker & Kassenlade</h2><p>Bondrucker mit ESC/POS (z. B. Epson TM-T20/T88 und kompatible). Die Kassenlade wird am Drucker angesteckt und über ihn geöffnet. QR-Codes druckt der Drucker selbst.</p>
    <div class="card" id="prnBox"></div></section>`;
}
async function renderPrinterBox() {
  const box = $('#prnBox'); if (!box) return;
  const art = CFG['drucker.art'] || 'aus';
  const row = (l, h, v) => `<div class="set-row"><div><div class="set-l">${l}</div>${h ? `<div class="set-h">${h}</div>` : ''}</div><div class="set-c" style="min-width:0;gap:6px">${v}</div></div>`;
  let printers = [];
  if (DESKTOP && art === 'windows') { try { printers = await invoke('printer_list'); } catch { /* keine */ } }
  if (!$('#prnBox')) return;
  box.innerHTML = row('Anschluss', `Netzwerk: Drucker mit eigener IP · ${SYS_OS}: per USB installierter Drucker (RAW)`, `<div class="seg" id="prnSeg">${[['aus', 'Kein Drucker'], ['netz', 'Netzwerk'], ['windows', SYS_PRN]].map(([k, l]) => `<button data-v="${k}" aria-pressed="${art === k}">${l}</button>`).join('')}</div>`)
    + (art === 'netz' ? field('drucker.adresse', 'IP-Adresse', 'z. B. 192.168.1.50 oder 192.168.1.50:9100') : '')
    + (art === 'windows' ? row('Drucker', printers.length ? `${printers.length} installierte Drucker gefunden` : IS_MAC ? 'Keine Drucker gefunden – unter Systemeinstellungen › Drucker & Scanner hinzufügen und neu laden' : 'Keine Drucker gefunden – Treiber installieren und neu laden', `<select class="input select" data-key="drucker.name" style="max-width:280px"><option value="">bitte wählen</option>${printers.map(p => `<option ${p === CFG['drucker.name'] ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" id="prnReload">${ic('sync', 'i-sm')}</button>`) : '')
    + (art !== 'aus' ? row('Papierbreite', '', `<div class="seg" id="prnWidth">${[[48, '80 mm'], [32, '58 mm']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${(+CFG['drucker.breite'] || 48) === k}">${l}</button>`).join('')}</div>`)
      + field('drucker.auto', 'Beleg automatisch drucken', 'Nach jedem Verkauf, jeder Retoure und jedem Abschluss', 'switch')
      + field('drucker.lade', 'Kassenlade am Drucker', 'Öffnet bei Barzahlung, Rückgeld und Kassenbuch', 'switch')
      + row('Test', '', `<button class="btn btn-secondary btn-sm" id="prnTest">${ic('printer', 'i-sm')}Testdruck</button><button class="btn btn-secondary btn-sm" id="prnDrawer">${ic('cash', 'i-sm')}Lade öffnen</button>`) : '');
  $$('.seg', box).forEach(sg => initSeg(sg, async b => {
    if (sg.id === 'prnSeg') { await saveSettings({'drucker.art': b.dataset.v}, true); renderPrinterBox(); }
    if (sg.id === 'prnWidth') saveSettings({'drucker.breite': +b.dataset.v}, true);
  }));
}
function testOps() {
  return [...headOps(), {t: 'text', s: 'TESTDRUCK', a: 'c', b: true, big: true}, {t: 'lr', l: 'Kasse', r: CFG['kasse.id']}, {t: 'lr', l: 'Umlaute', r: 'ÄÖÜ äöü ß €'}, {t: 'lr', l: 'Breite', r: `${+CFG['drucker.breite'] || 48} Zeichen`}, {t: 'line'}, {t: 'qr', d: 'Kontor Testdruck'}, {t: 'text', s: 'Wenn Sie das lesen können, passt alles.', a: 'c'}, {t: 'feed', n: 4}, {t: 'cut'}];
}
