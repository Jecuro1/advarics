
/* ════════════════════════════════════════════════════════════════════
   22 · KASSENBUCH, X-BERICHT, TAGESABSCHLUSS (Z-BERICHT)
   ════════════════════════════════════════════════════════════════════ */
const c2e = c => (c || 0) / 100;
const MOVE_LBL = {anfang: 'Wechselgeld / Übertrag', einlage: 'Einlage', entnahme: 'Entnahme'};
const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1, .5, .2, .1, .05, .02, .01];
function desktopOnly(what) { if (DESKTOP) return false; toast(`${what} nur in der Desktop-App`, {t2: 'Braucht die lokale Datenbank', type: 'warn', icon: 'database'}); return true; }

function reportBodyHTML(s, {closing} = {}) {
  const row = (l, v, cls = '') => `<div class="trow ${cls}"><span>${l}</span><b class="num">${v}</b></div>`;
  return `<div class="zr">
    <div class="zr-sec"><div class="eyebrow">Zeitraum</div>${row('seit', s.from ? esc(fmtTs(s.from)) : 'Beginn der Aufzeichnung')}${row('Belege', s.first ? `${esc(s.first)} – ${esc(s.last)}` : 'keine')}</div>
    <div class="zr-sec"><div class="eyebrow">Umsatz</div>${row(`Verkäufe (${num(s.counts.sales)})`, eur(c2e(s.gross_sales)))}${row(`Retouren & Stornos (${num(s.counts.returns + s.counts.stornos)})`, '− ' + eur(c2e(s.refunds)))}${row('darin Rabatte', eur(c2e(s.discounts)), 'disc')}${row('Gutscheine verkauft (0 %)', eur(c2e(s.vouchers_sold)))}<div class="tgrand" style="margin-top:6px"><span class="lbl">Umsatz</span><span class="val num" style="font-size:22px">${eur(c2e(s.revenue))}</span></div></div>
    <div class="zr-sec"><div class="eyebrow">Steuern</div>${s.vat.length ? s.vat.map(v => row(`${v.rate} % · netto ${eur(c2e(v.net))}`, `${eur(c2e(v.tax))} von ${eur(c2e(v.gross))}`)).join('') : '<div class="muted" style="font-size:12.5px">keine</div>'}</div>
    <div class="zr-sec"><div class="eyebrow">Zahlungsarten</div>${s.payments.length ? s.payments.map(p => row(`${esc(p.label || p.m)} (${p.count})`, eur(c2e(p.amount)))).join('') : '<div class="muted" style="font-size:12.5px">keine</div>'}</div>
    <div class="zr-sec"><div class="eyebrow">Bargeld</div>${row('Wechselgeld / Übertrag', eur(c2e(s.cash.start)))}${row('Bareinnahmen (netto)', eur(c2e(s.cash.sales)))}${row('Einlagen', eur(c2e(s.cash.deposits)))}${row('Entnahmen', '− ' + eur(c2e(s.cash.withdrawals)))}
      <div class="trow" style="font-weight:650;color:var(--text)"><span>Soll-Bestand Lade</span><b class="num">${eur(c2e(s.cash.expected))}</b></div>
      ${closing ? `${row('gezählt', eur(c2e(s.counted)))}<div class="trow" style="font-weight:650;color:${s.diff === 0 ? 'var(--pos)' : 'var(--neg)'}"><span>Differenz</span><b class="num">${s.diff > 0 ? '+' : ''}${eur(c2e(s.diff))}</b></div>` : ''}</div>
    <div class="zr-sec"><div class="eyebrow">Kassier:innen</div>${s.cashiers.length ? s.cashiers.map(c => row(`${esc(c.name || '–')} (${c.sales})`, eur(c2e(c.revenue)))).join('') : '<div class="muted" style="font-size:12.5px">keine</div>'}</div>
  </div>`;
}

/* ── X-Bericht (Zwischenstand, ohne Abschluss) ── */
async function xReport() {
  if (!DESKTOP) return toast('X-Bericht', {t2: `${num(118 + Dash.session.bons)} Bons · ${eur0(periodData('heute').rev)} · ohne Abschluss`, icon: 'receipt'});
  let s; try { s = await invoke('cash_status'); } catch (e) { return toast('X-Bericht nicht möglich', {t2: String(e), type: 'warn'}); }
  const el = openLayer(`<div class="modal" style="width:min(620px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="X-Bericht">
    <div class="m-head"><div class="m-ic">${ic('receipt')}</div><div><h2>X-Bericht · Zwischenstand</h2><p>Seit dem letzten Tagesabschluss · ändert nichts</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="overflow:auto">${reportBodyHTML(s)}</div>
    <div class="m-foot"><button class="btn btn-ghost" id="xPrint">${ic('printer', 'i-sm')}Drucken</button><span class="sp"></span><button class="btn btn-secondary" data-close>Schließen</button><button class="btn btn-primary" id="xClose">${ic('lock', 'i-sm')}Tagesabschluss …</button></div></div>`);
  el.addEventListener('click', e => {
    if (e.target.closest('#xPrint')) printOps(reportOps(s, 'X-BERICHT'), 'x-bericht');
    if (e.target.closest('#xClose')) { closeLayer(el); setTimeout(openClosing, 80); }
  });
  Hooks.emit('pos.report.x', {umsatz: c2e(s.revenue), bons: s.counts.sales});
}

/* ── Kassenbuch ── */
async function openCashBook() {
  if (desktopOnly('Kassenbuch')) return;
  let s; try { s = await invoke('cash_status'); } catch (e) { return toast('Kassenbuch nicht verfügbar', {t2: String(e), type: 'warn'}); }
  const st = {kind: ['einlage', 'entnahme', 'anfang'].find(k => typeof kkBuchungOk !== 'function' || kkBuchungOk(k)) || 'einlage', amt: '', reason: ''};
  const REASONS = {einlage: ['Wechselgeld', 'Einlage Tresor', 'Korrektur'], entnahme: ['Bank', 'Tresor', 'Barauslage', 'Korrektur'], anfang: ['Wechselgeld Tagesbeginn']};
  const el = openLayer(`<div class="modal" style="width:min(640px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Kassenbuch"><div id="cbBody" style="display:flex;flex-direction:column;min-height:0"></div></div>`, {focus: '#cbAmt'});
  const box = $('#cbBody', el);
  const render = () => {
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('cash')}</div><div><h2>Kassenbuch</h2><p>Soll-Bestand Lade: <b style="color:var(--text)">${eur(c2e(s.cash.expected))}</b> · seit ${s.from ? esc(fmtTs(s.from)) : 'Beginn'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:14px;overflow:auto">
        <div class="seg" id="cbSeg" style="justify-self:start">${['einlage', 'entnahme', 'anfang'].filter(k => typeof kkBuchungOk !== 'function' || kkBuchungOk(k)).map(k => `<button data-v="${k}" aria-pressed="${st.kind === k}">${MOVE_LBL[k]}</button>`).join('')}</div>
        <div class="amt-field"><label for="cbAmt">Betrag</label><div class="amt-input"><span>€</span><input id="cbAmt" inputmode="decimal" value="${esc(st.amt)}" placeholder="0,00" autocomplete="off"></div></div>
        <div><div class="field"><span>Grund</span></div><div class="reasons" style="margin-top:6px">${REASONS[st.kind].map(r => `<button class="chip" data-r="${esc(r)}" aria-pressed="${r === st.reason}">${esc(r)}</button>`).join('')}</div></div>
        ${st.kind === 'entnahme' ? `<div class="rule-box">${ic('shield')}<div>Entnahmen erfordern eine Freigabe durch die Filialleitung.</div></div>` : ''}
        <div><div class="eyebrow" style="margin-bottom:6px">Buchungen seit dem letzten Abschluss</div><div class="card" style="overflow:hidden">${s.moves.length ? s.moves.slice().reverse().map(m => `<div class="mv"><div><b>${esc(MOVE_LBL[m.kind] || m.kind)}</b> · ${esc(m.reason)}<br><small>${esc(fmtTs(m.ts))}${m.user ? ' · ' + esc(m.user) : ''}</small></div><div><div class="d ${m.amount > 0 ? 'p' : 'm'}">${m.amount > 0 ? '+' : ''}${eur(c2e(m.amount))}</div></div></div>`).join('') : '<div class="empty" style="padding:22px"><p>Noch keine Buchungen.</p></div>'}</div></div>
      </div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Schließen</button><button class="btn btn-primary" id="cbGo">${ic('check', 'i-sm')}Buchen<span class="kbd">↵</span></button></div>`;
    initSeg($('#cbSeg', box), b => { st.kind = b.dataset.v; st.reason = REASONS[st.kind][0]; render(); $('#cbAmt', box).focus(); });
  };
  st.reason = REASONS.einlage[0];
  const go2 = async () => {
    st.amt = $('#cbAmt', box).value; const v = parseAmt(st.amt);
    if (!(v > 0)) return shakeEl($('#cbAmt', box).closest('.amt-input'));
    let by = null;
    if (st.kind === 'entnahme') { try { by = (await stepUp({title: 'Entnahme freigeben', text: `${eur(v)} · ${st.reason}`})).by.name; } catch { return; } }
    try { s = await invoke('cash_move', {kind: st.kind, amount: Math.round(v * 100), reason: st.reason, user: S.user.name, approvedBy: by}); }
    catch (e) { return toast('Buchung nicht möglich', {t2: String(e), type: 'warn'}); }
    toast(`${MOVE_LBL[st.kind]} gebucht`, {t2: `${eur(v)} · ${st.reason} · Soll-Bestand ${eur(c2e(s.cash.expected))}`, type: 'pos', icon: 'cash'});
    Hooks.emit('cash.moved', {art: st.kind, betrag: v, grund: st.reason});
    if (typeof kkLadeBuchung !== 'function' || kkLadeBuchung(st.kind)) openDrawer(MOVE_LBL[st.kind], true);
    st.amt = ''; render();
  };
  box.addEventListener('click', e => { const r = e.target.closest('[data-r]'); if (r) { st.amt = $('#cbAmt', box).value; st.reason = r.dataset.r; render(); } if (e.target.closest('#cbGo')) go2(); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('[data-close]')) { e.preventDefault(); go2(); } });
  render();
}

/* ── Tagesabschluss mit Kassensturz ── */
async function openClosing() {
  if (desktopOnly('Tagesabschluss')) return;
  let s, rk = null;
  try { s = await invoke('cash_status'); rk = await invoke('rksv_status'); } catch (e) { return toast('Abschluss nicht möglich', {t2: String(e), type: 'warn'}); }
  const now = new Date(), lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === now.getDate();
  // Jeder Monat endet mit einem Monatsbeleg: am Monatsende für diesen Monat, sonst (nachträglich) für den Vormonat
  const idx = d => d.getFullYear() * 12 + d.getMonth(), lm = rk?.last_monthly ? new Date(rk.last_monthly) : null;
  const needIdx = lastDay ? idx(now) : idx(now) - 1, needY = Math.floor(needIdx / 12), needM = needIdx % 12;
  const monthMissing = !!rk?.active && needIdx >= idx(new Date(rk.started_at)) && (!lm || idx(lm) < needIdx);
  const st = {count: Object.fromEntries(DENOMS.map(d => [d, ''])), total: '', mode: 'stueck', note: '', monthly: monthMissing};
  const el = openLayer(`<div class="modal" style="width:min(860px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Tagesabschluss"><div id="zBody" style="display:flex;flex-direction:column;min-height:0"></div></div>`, {closeOnScrim: false});
  const box = $('#zBody', el);
  const counted = () => st.mode === 'summe' ? (parseAmt(st.total) || 0) : r2(DENOMS.reduce((a, d) => a + d * (parseInt(st.count[d], 10) || 0), 0));
  const update = () => {
    const c = counted(), diff = r2(c - c2e(s.cash.expected));
    $('#zCounted', box).textContent = eur(c);
    const d = $('#zDiff', box); d.textContent = `${diff > 0 ? '+' : ''}${eur(diff)}`; d.style.color = Math.abs(diff) < .005 ? 'var(--pos)' : 'var(--neg)';
    $('#zNoteReq', box).hidden = Math.abs(diff) < .005;
  };
  const render = () => {
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('lock')}</div><div><h2>Tagesabschluss · Z-Bericht</h2><p>Kassensturz zählen, Differenz prüfen, Zeitraum festschreiben</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;overflow:auto">
        <div>${reportBodyHTML(s)}</div>
        <div style="display:grid;gap:12px;align-content:start">
          <div class="seg" id="zSeg" style="justify-self:start"><button data-v="stueck" aria-pressed="${st.mode === 'stueck'}">Stückelung zählen</button><button data-v="summe" aria-pressed="${st.mode === 'summe'}">Summe eingeben</button></div>
          ${st.mode === 'stueck' ? `<div class="denoms">${DENOMS.map(d => `<label><span>${d >= 1 ? num(d) + ' €' : num(d * 100) + ' ct'}</span><input class="input num" data-den="${d}" inputmode="numeric" value="${esc(st.count[d])}" placeholder="0"></label>`).join('')}</div>`
            : `<div class="amt-field"><label for="zTotal">Gezählter Bargeldbestand</label><div class="amt-input"><span>€</span><input id="zTotal" inputmode="decimal" value="${esc(st.total)}" placeholder="0,00"></div></div>`}
          <div class="preview-box"><span>Gezählt<br><span class="muted" style="font-size:12px">Soll ${eur(c2e(s.cash.expected))}</span></span><b class="num" id="zCounted"></b></div>
          <div class="preview-box"><span>Differenz</span><b class="num" id="zDiff"></b></div>
          <label class="field"><span>Notiz <span id="zNoteReq" class="muted">· bei Differenz bitte begründen</span></span><input class="input" id="zNote" value="${esc(st.note)}" placeholder="z. B. Wechselgeld falsch herausgegeben"></label>
          ${rk?.active ? `<div class="set-row" style="padding:10px 12px;border:1px solid var(--line);border-radius:12px"><div><div class="set-l">RKSV-Monatsbeleg erstellen</div><div class="set-h">${monthMissing ? `<span style="color:var(--warn)">fällig für ${pad(needM + 1)}/${needY}</span>` : 'nicht fällig'}${monthMissing && needM === 11 ? ' · gilt als Jahresbeleg (prüfen und aufbewahren)' : ''}</div></div><div class="set-c" style="min-width:0"><button class="switch" role="switch" id="zMonthly" aria-checked="${st.monthly}" aria-label="Monatsbeleg"></button></div></div>` : ''}
          <div class="prompt-hint">${ic('info', 'i-xs')}Der gezählte Betrag bleibt als Wechselgeld in der Lade (Übertrag). Geld für die Bank vorher im Kassenbuch als Entnahme buchen.</div>
        </div>
      </div>
      <div class="m-foot"><button class="btn btn-ghost" id="zBook">${ic('cash', 'i-sm')}Kassenbuch</button><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="zGo">${ic('lock', 'i-sm')}Abschluss durchführen</button></div>`;
    initSeg($('#zSeg', box), b => { st.mode = b.dataset.v; render(); });
    update();
  };
  box.addEventListener('input', e => {
    if (e.target.dataset.den) { st.count[e.target.dataset.den] = e.target.value.replace(/\D/g, ''); e.target.value = st.count[e.target.dataset.den]; }
    if (e.target.id === 'zTotal') st.total = e.target.value;
    if (e.target.id === 'zNote') st.note = e.target.value;
    update();
  });
  box.addEventListener('click', async e => {
    if (e.target.closest('#zMonthly')) { st.monthly = !st.monthly; e.target.closest('#zMonthly').setAttribute('aria-checked', st.monthly); return; }
    if (e.target.closest('#zBook')) { closeLayer(el); return openCashBook(); }
    if (!e.target.closest('#zGo')) return;
    const c = counted(), diff = r2(c - c2e(s.cash.expected));
    if (Math.abs(diff) >= .005 && st.note.trim().length < 3) { shakeEl($('#zNote', box)); return toast('Differenz bitte begründen', {type: 'warn', icon: 'alert'}); }
    if (Math.abs(diff) >= .005) { try { await stepUp({title: 'Kassendifferenz freigeben', text: `Differenz ${eur(diff)} · ${st.note}`}); } catch { return; } }
    let z;
    try { z = await invoke('closing_create', {counted: Math.round(c * 100), note: st.note.trim(), user: S.user.name}); }
    catch (err) { return toast('Abschluss fehlgeschlagen', {t2: String(err), type: 'warn', dur: 8000}); }
    let mb = null;
    if (st.monthly) { try { mb = await invoke('rksv_null', {label: `${needM === 11 ? 'Jahresbeleg' : 'Monatsbeleg'} ${needY}-${pad(needM + 1)}`, user: S.user.name}); } catch (err) { toast('Monatsbeleg fehlgeschlagen', {t2: String(err), type: 'warn'}); } }
    Hooks.emit('cash.closing', {nr: z.no, umsatz: c2e(z.revenue), differenz: c2e(z.diff)});
    statsInvalidate();
    showZ(el, box, z, mb);
  });
  render();
}
function showZ(el, box, z, mb, viewOnly) {
  box.innerHTML = `<div class="m-head"><div class="m-ic" style="color:var(--pos)">${ic('check')}</div><div><h2>Abschluss Nr. ${z.no} durchgeführt</h2><p>${esc(fmtTs(z.ts))} · ${esc(z.user || '')}${mb ? ` · ${esc(mb.data.label)} ${esc(mb.no)} signiert` : ''}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="overflow:auto">${reportBodyHTML(z, {closing: true})}</div>
    <div class="m-foot"><button class="btn btn-secondary" id="zPrint">${ic('printer', 'i-sm')}Z-Bericht drucken</button><span class="sp"></span><button class="btn btn-primary" data-close>Fertig</button></div>`;
  $('#zPrint', box).onclick = () => printOps(reportOps(z, `Z-BERICHT NR. ${z.no}`), 'z-bericht');
  if (!viewOnly && CFG['drucker.auto'] && CFG['drucker.art'] !== 'aus') printOps(reportOps(z, `Z-BERICHT NR. ${z.no}`), 'z-bericht', true);
}
