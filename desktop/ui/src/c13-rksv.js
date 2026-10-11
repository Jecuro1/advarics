
/* ════════════════════════════════════════════════════════════════════
   23 · RKSV — Testmodus, Null-/Monatsbelege, DEP-Export, QR-Codes
   ════════════════════════════════════════════════════════════════════ */
async function refreshRksv() {
  if (!DESKTOP) return null;
  try { S.rksv = await invoke('rksv_status'); } catch { S.rksv = null; }
  renderStatus(); return S.rksv;
}
// Echte QR-Codes: jedes Element mit data-qr wird per Rust-Encoder (SVG) befüllt.
const QR_CACHE = new Map();
async function hydrateQR(root = document) {
  if (!DESKTOP) return;
  for (const el of $$('[data-qr]:not([data-qr-done])', root)) {
    el.setAttribute('data-qr-done', '1');
    const t = el.dataset.qr;
    try { if (!QR_CACHE.has(t)) QR_CACHE.set(t, await invoke('qr_svg', {text: t})); el.innerHTML = QR_CACHE.get(t); }
    catch (e) { el.textContent = 'QR nicht verfügbar'; }
  }
}
new MutationObserver(() => { if ($('[data-qr]:not([data-qr-done])')) hydrateQR(); }).observe(document.body, {childList: true, subtree: true});

function rksvBlockHTML(rec) {
  if (rec.rksv?.qr) return `<div class="qrw" data-qr="${esc(rec.rksv.qr)}"></div><div class="sm c">RKSV · TESTMODUS (nicht registriert)<br>Kasse ${esc(rec.rksv.qr.split('_')[2] || '')} · Zert. ${esc(rec.rksv.qr.split('_')[11] || '')}</div>`;
  if (DESKTOP) return `<div class="sm c" style="margin-top:6px">Ohne RKSV-Signatur – Testbetrieb unter Einstellungen → RKSV starten</div>`;
  return `<div class="qrw">${pseudoQR('rksv|' + rec.no + '|' + rec.sig)}</div><div class="sm c">RKSV · Signatur ES256 · Zert. 3D1F8A20<br>Sig. …${(rec.sig || '').slice(-12)}${rec.offline ? '<br>Offline erfasst · Sync ausstehend' : ''}</div>`;
}
function zeroReceiptHTML(rec, tpl) {
  const dt = rec.date, d = `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  return `<div class="receipt ${tpl}">${receiptHead(tpl)}<hr>
    <div class="c" style="font-weight:700;letter-spacing:.08em">${esc((rec.label || kindLabel(rec)).toUpperCase())}</div><hr>
    <div class="r"><span>Beleg ${rec.no}</span><span>Kasse ${esc(CFG['kasse.id'])}</span></div><div class="r sm"><span>${d}</span><span>${esc((rec.cashier || '').split(' ')[0])}</span></div><hr>
    <div class="r tot"><span>SUMME EUR</span><span>0,00</span></div><hr>
    ${rksvBlockHTML(rec)}<div class="sm c" style="margin-top:6px">${rec.kind === 'startbeleg' ? 'Startbeleg prüfen (z. B. BMF Belegcheck-App) und 7 Jahre aufbewahren' : rec.kind === 'monatsbeleg' ? 'Monatsbeleg – Dezember-Beleg = Jahresbeleg: prüfen und aufbewahren' : 'Nullbeleg'}</div></div>`;
}

function rksvSectionHTML() {
  return `<section class="set-sec" id="sec-rksv"><h2>RKSV · Registrierkasse</h2><p>Signatur nach Registrierkassensicherheitsverordnung: Signaturkette, verschlüsselter Umsatzzähler, QR-Code auf jedem Beleg, Datenerfassungsprotokoll (DEP). Im <b>Testmodus</b> signiert ein lokaler Software-Schlüssel – technisch vollständig, aber nicht bei FinanzOnline registrierbar. Für den Echtbetrieb wird später nur die Signaturkarte bzw. der Online-Signaturdienst angeschlossen.</p>
    <div class="card" id="rksvBox"><div style="padding:18px" class="thinking"><b>Lade …</b></div></div></section>`;
}
async function renderRksvBox() {
  const box = $('#rksvBox'); if (!box) return;
  if (!DESKTOP) { box.innerHTML = `<div class="set-row"><div><div class="set-l">Nur in der Desktop-App</div><div class="set-h">Die Browser-Vorschau zeigt Beispiel-Signaturen</div></div><div class="set-c"><span class="pill">Vorschau</span></div></div>`; return; }
  const r = await refreshRksv(); if (!$('#rksvBox')) return;
  const row = (l, h, v) => `<div class="set-row"><div><div class="set-l">${l}</div>${h ? `<div class="set-h">${h}</div>` : ''}</div><div class="set-c" style="min-width:0;gap:6px">${v}</div></div>`;
  if (!r?.active) {
    box.innerHTML = row('Status', 'Belege werden noch nicht signiert', '<span class="pill warn">nicht in Betrieb</span>')
      + row('Testbetrieb starten', `Erzeugt Schlüssel und Startbeleg für Kassen-ID <b>${esc(CFG['kasse.id'])}</b>. Danach ist die Kassen-ID fest. Administrator-Freigabe nötig.`, `<button class="btn btn-primary btn-sm" id="rkStart">${ic('shield', 'i-sm')}Testbetrieb starten</button>`);
    return;
  }
  const lm = r.last_monthly ? fmtTs(r.last_monthly) : 'noch keiner';
  box.innerHTML = row('Status', `seit ${esc(fmtTs(r.started_at))} · ${num(r.receipts)} signierte Belege`, '<span class="pill pos">' + ic('check') + 'Testmodus aktiv</span>')
    + row('Kassen-ID', 'fest seit dem Startbeleg', `<b class="mono">${esc(r.kassen_id)}</b>`)
    + row('Signatur', 'ES256 · Software-Schlüssel (Testmodus)', `<span class="mono">${esc(r.serial)}</span>`)
    + row('Umsatzzähler', 'Summe aller Belege · im Beleg AES-256-verschlüsselt', `<b class="num">${eur(r.turnover / 100)}</b>`)
    + row('Monatsbeleg', `letzter: ${esc(lm)} · wird beim Tagesabschluss am Monatsende vorgeschlagen`, `<button class="btn btn-secondary btn-sm" data-rk="monat">Monatsbeleg</button><button class="btn btn-ghost btn-sm" data-rk="null">Nullbeleg</button>`)
    + row('DEP-Export', 'Datenerfassungsprotokoll als JSON (z. B. für die Finanzprüfung)', `<button class="btn btn-secondary btn-sm" id="rkDep">${ic('download', 'i-sm')}Exportieren …</button>`);
}
async function rksvStart() {
  const kid = String(CFG['kasse.id'] || '').trim();
  if (!kid || kid.includes('_')) return toast('Kassen-ID ungültig', {t2: 'Unter Einstellungen → Kasse festlegen (ohne Unterstrich)', type: 'warn'});
  try { await stepUp({title: 'RKSV-Testbetrieb starten', text: `Kassen-ID ${kid} wird festgelegt, Startbeleg wird signiert.`, admin: true}); } catch { return; }
  let r; try { r = await invoke('rksv_init', {kassenId: kid, user: S.user.name}); } catch (e) { return toast('Start fehlgeschlagen', {t2: String(e), type: 'warn', dur: 8000}); }
  POS.no = r.number + 1; Hooks.emit('rksv.started', {kasse: kid, startbeleg: r.no});
  await renderRksvBox(); renderSettingsKasseLock();
  showZeroReceipt(r, 'Startbeleg signiert');
}
async function rksvNull(kind) {
  const now = new Date(), label = kind === 'monat' ? `${now.getMonth() === 11 ? 'Jahresbeleg' : 'Monatsbeleg'} ${now.getFullYear()}-${pad(now.getMonth() + 1)}` : 'Nullbeleg';
  let r; try { r = await invoke('rksv_null', {label, user: S.user.name}); } catch (e) { return toast('Nicht möglich', {t2: String(e), type: 'warn'}); }
  POS.no = r.number + 1; Hooks.emit('rksv.nullbeleg', {beleg: r.no, art: label});
  renderRksvBox(); showZeroReceipt(r, `${label} signiert`);
}
function showZeroReceipt(r, title) {
  const rec = recFromData(r.no, r.data);
  const el = openLayer(`<div class="modal" style="width:min(460px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="m-head"><div class="m-ic" style="color:var(--pos)">${ic('shield')}</div><div><h2>${esc(title)}</h2><p>Beleg ${esc(r.no)} · im DEP gespeichert</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="overflow:auto;background:var(--surface-2)"><div class="receipt-wrap">${receiptHTML(rec, 'classic')}</div></div>
    <div class="m-foot"><button class="btn btn-secondary" id="zrPrint">${ic('printer', 'i-sm')}Drucken</button><span class="sp"></span><button class="btn btn-primary" data-close>Fertig</button></div></div>`);
  $('#zrPrint', el).onclick = () => printReceipt(rec);
}
async function depExport() {
  if (!DESKTOP) { toast('DEP-Export erstellt', {t2: `RKSV-Datenerfassungsprotokoll (Vorschau)`, type: 'pos', icon: 'shield'}); return; }
  try { const p = await invoke('dep_export'); if (p) { toast('DEP-Export gespeichert', {t2: p, type: 'pos', icon: 'shield', dur: 6000}); Hooks.emit('rksv.dep.exported', {datei: p}); } }
  catch (e) { toast('DEP-Export nicht möglich', {t2: String(e), type: 'warn'}); }
}
function renderSettingsKasseLock() {
  const inp = $('[data-key="kasse.id"]'); if (!inp) return;
  if (S.rksv?.active) { inp.readOnly = true; inp.style.opacity = .6; inp.title = 'Seit dem RKSV-Startbeleg fest'; }
}
