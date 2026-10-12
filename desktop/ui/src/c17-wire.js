
/* ════════════════════════════════════════════════════════════════════
   27 · VERBINDUNGEN — Gutschein-Zahlung, Einstellungs-Aktionen, Spanne
   ════════════════════════════════════════════════════════════════════ */
async function voucherPay(m, rem) {
  const inp = $('#gsCode'); const code = (inp?.value || '').trim().toUpperCase();
  const term = $('#term');
  if (!code) { shakeEl(inp?.closest('.amt-input')); return; }
  if (PAY.vcheck !== code) {
    let v;
    try { v = await invoke('voucher_get', {code}); }
    catch (e) { term.innerHTML = `<div class="dev" style="color:var(--neg)">${ic('alert')}</div><h3>Gutschein unbekannt</h3><p>${esc(String(e))}</p>`; return; }
    const usedHere = PAY.parts.filter(p => p.code === v.code).reduce((s, p) => s + p.amount, 0);
    const bal = r2(v.balance / 100 - usedHere), use = Math.min(bal, rem);
    if (v.status !== 'aktiv' || v.expired || bal <= 0) {
      term.innerHTML = `<div class="dev" style="color:var(--warn)">${ic('gift')}</div><h3>Nicht einlösbar</h3><p>${esc(v.code)} · ${v.expired ? 'abgelaufen am ' + esc(v.valid_until) : v.status === 'aktiv' ? 'kein Restwert' : esc(v.status)}</p>`; return;
    }
    Object.assign(PAY, {vcheck: code, vcode: v.code, vuse: use, vbal: bal});
    term.innerHTML = `<div class="dev" style="width:auto;height:auto;padding:16px 20px;border-radius:14px;text-align:left;display:block"><div class="eyebrow">Gutschein ${esc(v.code)}</div><div style="font-size:26px;font-weight:650;margin-top:4px">${eur(bal)}</div><div class="muted" style="font-size:12px">Restwert · gültig bis ${esc(v.valid_until ? new Date(v.valid_until).toLocaleDateString('de-AT') : '–')}</div></div><p>Einzulösen: <b style="color:var(--text)">${eur(use)}</b>${bal > use ? ` · Restwert danach ${eur(bal - use)}` : ''}</p>`;
    $('#payGo').innerHTML = `${ic('check', 'i-sm')}${eur(use)} einlösen<span class="kbd">↵</span>`;
    return;
  }
  const {vcode, vuse, vbal} = PAY; PAY.vcheck = null;
  addPart(m, vuse, `${vcode}${vbal > vuse ? ` · Rest ${eur(vbal - vuse)}` : ''}`, {code: vcode});
}

function bindExtraSettings() {
  const v = $('#view-einstellungen');
  v.addEventListener('click', async e => {
    if (e.target.closest('#rkStart')) return rksvStart();
    const rk = e.target.closest('[data-rk]'); if (rk) { try { await stepUp({title: rk.dataset.rk === 'monat' ? 'Monatsbeleg erstellen' : 'Nullbeleg erstellen', text: 'Wird signiert und im DEP gespeichert'}); } catch { return; } return rksvNull(rk.dataset.rk); }
    if (e.target.closest('#rkDep')) return depExport();
    if (e.target.closest('#prnTest')) return printOps(testOps(), 'Testdruck');
    if (e.target.closest('#prnDrawer')) return openDrawer('Test');
    if (e.target.closest('#prnReload')) return renderPrinterBox();
  });
  // Spanne im Artikel-Editor live anzeigen
  document.addEventListener('input', e => {
    const f = e.target.dataset?.f; if (f !== 'cost' && f !== 'price') return;
    const box = e.target.closest('.drawer-panel'); const out = box && $('#edMargin', box); if (!out) return;
    const price = parseAmt($('[data-f="price"]', box)?.value), cost = parseAmt($('[data-f="cost"]', box)?.value), vat = +($('[data-f="vat"]', box)?.value || 20);
    out.textContent = price > 0 && cost > 0 ? `· Spanne ${num((1 - cost / (price / (1 + vat / 100))) * 100, 1)} %` : '';
  });
}
