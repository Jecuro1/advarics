
/* ════════════════════════════════════════════════════════════════════
   44 · MARKETING — Rabattaktionssteuerung (automatische Rabatte an der
   Kasse), Kampagnen (E-Mail mit persönlichem Gutschein), Sales-Aktionen
   (Verkaufsprämien je Verkäufer:in), Digitales Schaufenster.
   ════════════════════════════════════════════════════════════════════ */
Object.assign(DEFAULTS, {'rabatt.regeln': [], 'shop.aktiv': false, 'shop.titel': '', 'shop.text': '', 'shop.farbe': '#1f6fd1', 'shop.kategorien': [], 'shop.ausgeblendet': [], 'shop.preise': true, 'shop.bestand': 'ampel', 'shop.nur_lagernd': false, 'shop.gpsr_ausblenden': false, 'shop.reservieren': true, 'shop.abholtage': 3, 'shop.oeffnung': 'Mo–Fr 9–18 Uhr\nSa 9–17 Uhr', 'shop.kontakt': '', 'shop.hinweis': ''});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });
Object.assign(VIEW_PERM, {rabattregeln: 'preise.aktionen', kampagnen: 'marketing', salesaktionen: 'marketing', schaufenster: 'marketing'});

/* ── Rabattaktionssteuerung ── */
const RR_TYP = {prozent: 'Prozent auf Artikel', menge: 'Mengenrabatt (ab n Stück)', xfuery: 'X für Y (z. B. 3 für 2)', bon: 'Bonrabatt ab Einkaufswert'};
const WDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const rRules = () => Array.isArray(CFG['rabatt.regeln']) ? CFG['rabatt.regeln'] : [];
function rrActive(r, now = new Date()) {
  if (!r.aktiv) return false;
  const d = dIso(now), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (r.von && d < r.von) return false; if (r.bis && d > r.bis) return false;
  if (r.tage?.length && !r.tage.includes(now.getDay())) return false;
  if (r.zeit_von && hm < r.zeit_von) return false; if (r.zeit_bis && hm > r.zeit_bis) return false;
  if (r.kunden === 'stammkunden' && !POS.customer) return false;
  if (r.kunden && !['alle', 'stammkunden'].includes(r.kunden) && POS.customer?.tier !== r.kunden) return false;
  return true;
}
const rrMatch = (r, a) => !a ? false : r.scope === 'alle' || (r.scope === 'warengruppe' && r.werte?.includes(a.cat)) || (r.scope === 'marke' && r.werte?.includes(a.brand)) || (r.scope === 'artikel' && r.werte?.includes(a.id));
/** Automatische Rabatte vor jeder Darstellung des Warenkorbs neu berechnen (manuelle Rabatte bleiben unberührt) */
function applyAutoRules() {
  if (!POS?.cart) return;
  POS.cart.forEach(l => { if (l.disc?.auto) l.disc = null; });
  if (POS.billDisc?.auto) POS.billDisc = null;
  const rules = rRules().filter(r => rrActive(r)); if (!rules.length) return;
  const best = new Map();   // Zeile → {pct, name}
  const put = (l, pct, name) => { if (l.disc || pct <= 0) return; const b = best.get(l); if (!b || pct > b.pct) best.set(l, {pct: Math.min(100, r2(pct)), name}); };
  for (const r of rules) {
    const ls = POS.cart.filter(l => !l.service && !l.voucher && !lfRabattGesperrt(l.art) && rrMatch(r, l.art));
    const n = ls.reduce((s, l) => s + l.qty, 0);
    if (r.typ === 'prozent') ls.forEach(l => put(l, +r.pct, r.name));
    if (r.typ === 'menge' && n >= (+r.ab || 2)) ls.forEach(l => put(l, +r.pct, r.name));
    if (r.typ === 'xfuery' && +r.x > +r.y && n >= +r.x) {
      const units = ls.flatMap(l => Array(l.qty).fill(l)).sort((a, b) => b.unit - a.unit);
      const free = Math.floor(units.length / +r.x) * (+r.x - +r.y), off = new Map();
      units.slice(units.length - free).forEach(l => off.set(l, (off.get(l) || 0) + l.unit));
      off.forEach((amt, l) => put(l, amt / (l.unit * l.qty) * 100, r.name));
    }
  }
  best.forEach((b, l) => { l.disc = {pct: b.pct, reason: b.name, auto: true}; });
  if (!POS.billDisc) {
    const base = POS.cart.filter(l => !l.voucher && !lfRabattGesperrt(l.art)).reduce((s, l) => s + l.unit * l.qty * (1 - (l.disc?.pct || 0) / 100), 0);
    const bon = rules.filter(r => r.typ === 'bon' && base >= (+r.ab_betrag || 0)).sort((a, b) => b.pct - a.pct)[0];
    if (bon) POS.billDisc = {pct: +bon.pct, reason: bon.name, auto: true};
  }
  const names = [...new Set([...best.values()].map(b => b.name).concat(POS.billDisc?.auto ? [POS.billDisc.reason] : []))];
  const key = names.join('|');
  if (key && key !== POS._rrKey) { names.filter(nm => !(POS._rrKey || '').split('|').includes(nm)).forEach(nm => { toast(`Aktion: ${nm}`, {t2: 'automatisch angewendet', icon: 'percent', type: 'accent', dur: 2600}); Hooks.emit('rule.applied', {regel: nm, quelle: 'Rabattaktionssteuerung'}); }); }
  POS._rrKey = key;
}
{ const _rc = renderCart; renderCart = function (...a) { try { applyAutoRules(); } catch (e) { console.error(e); } return _rc.apply(this, a); }; }
// Nach dem Abschluss eines Bons Merker zurücksetzen
Hooks.on('pos.sale.completed', () => { POS._rrKey = ''; });

registerPage('rabattregeln', {title: 'Rabattaktionssteuerung', sub: () => `${rRules().filter(r => r.aktiv).length} aktiv`, render: renderRabattregeln});
function renderRabattregeln() {
  const v = $('#view-rabattregeln'), l = rRules(), now = new Date();
  v.innerHTML = `<div class="cv">${pageHead('Rabattaktionssteuerung', 'Automatische Rabatte an der Kasse: Mengenrabatt, „3 für 2“, Bonrabatt ab Einkaufswert, Happy Hour – nach Warengruppe, Marke, Artikel, Kundengruppe, Wochentag und Uhrzeit. Manuelle Rabatte haben Vorrang.', `<button class="btn btn-secondary" data-goto="aktionen">${ic('percent', 'i-sm')}Preisaktionen</button><button class="btn btn-primary" data-rr="neu">${ic('plus', 'i-sm')}Neue Regel</button>`)}
    ${kpiCards([[num(l.length), 'Regeln'], [num(l.filter(r => rrActive(r, now)).length), 'gerade wirksam', 'pos'], [num(l.filter(r => r.aktiv && r.bis && r.bis < today()).length), 'abgelaufen', 'warn']])}
    <div class="card">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Regel</th><th>Art</th><th>Gilt für</th><th>Wann</th><th>Status</th><th></th></tr></thead><tbody>${l.map((r, i) => `<tr data-rre="${i}" style="cursor:pointer"><td style="padding-left:16px"><b>${esc(r.name)}</b></td><td>${esc(RR_TYP[r.typ])}<div class="muted" style="font-size:12px">${r.typ === 'xfuery' ? `${r.x} für ${r.y}` : r.typ === 'menge' ? `ab ${r.ab} Stück −${num(r.pct, 1)} %` : r.typ === 'bon' ? `ab ${eur0(r.ab_betrag || 0)} −${num(r.pct, 1)} %` : `−${num(r.pct, 1)} %`}</div></td><td>${r.scope === 'alle' ? 'Alle Artikel' : esc((r.werte || []).map(w => r.scope === 'warengruppe' ? CATS.find(c => c.id === w)?.name || w : r.scope === 'artikel' ? artById(w)?.name || w : w).join(', '))}${r.kunden && r.kunden !== 'alle' ? `<div class="muted" style="font-size:12px">nur ${esc(r.kunden === 'stammkunden' ? 'mit Kundenkarte' : r.kunden)}</div>` : ''}</td><td class="muted" style="font-size:12.5px">${[r.von || r.bis ? `${r.von ? dDate(r.von) : '…'} – ${r.bis ? dDate(r.bis) : '…'}` : '', r.tage?.length ? r.tage.map(d => WDAYS[d]).join(' ') : '', r.zeit_von || r.zeit_bis ? `${r.zeit_von || '00:00'}–${r.zeit_bis || '23:59'} Uhr` : ''].filter(Boolean).join(' · ') || 'immer'}</td><td>${rrActive(r, now) ? '<span class="pill pos" style="height:20px">wirksam</span>' : r.aktiv ? '<span class="pill" style="height:20px">geplant</span>' : '<span class="pill" style="height:20px">aus</span>'}</td><td class="r" style="padding-right:14px">${ic('chevron-right', 'i-sm')}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('sliders')}</div><h3>Noch keine Rabattregeln</h3><p>Beispiele: „3 für 2 auf Socken“, „ab 2 Teilen −10 %“, „ab € 300 Einkauf −5 %“, „Happy Hour Sa 16–18 Uhr −15 % auf Accessoires“.</p><button class="btn btn-primary" data-rr="neu">${ic('plus', 'i-sm')}Erste Regel anlegen</button></div>`}</div></div>`;
}
function openRule(i) {
  const isNew = i == null, r = isNew ? {id: uid(), name: '', typ: 'menge', aktiv: true, scope: 'alle', werte: [], pct: 10, ab: 2, x: 3, y: 2, ab_betrag: 200, kunden: 'alle', tage: [], von: today(), bis: ''} : {...rRules()[i], werte: [...(rRules()[i].werte || [])], tage: [...(rRules()[i].tage || [])]};
  const el = openLayer(`<div class="modal" style="width:min(660px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true"><div data-rrb style="display:flex;flex-direction:column;min-height:0"></div></div>`, {focus: '#rrName'});
  const box = $('[data-rrb]', el);
  const vals = () => r.scope === 'warengruppe' ? CATS.filter(c => c.id !== 'alle').map(c => [c.id, c.name]) : r.scope === 'marke' ? [...new Set(ART.map(a => a.brand).filter(Boolean))].sort().map(b => [b, b]) : r.scope === 'artikel' ? ART.slice().sort((a, b) => a.name.localeCompare(b.name)).map(a => [a.id, a.name]) : [];
  const render = () => {
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('sliders')}</div><div><h2>${isNew ? 'Neue Rabattregel' : esc(r.name)}</h2><p>Wird an der Kasse automatisch angewendet</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="overflow:auto;display:grid;gap:12px">
        <div class="ed-grid"><label class="field full"><span>Name (erscheint auf dem Bon)</span><input class="input" id="rrName" value="${esc(r.name)}" placeholder="z. B. 3 für 2 auf Socken"></label>
          <label class="field"><span>Art</span><select class="input select" id="rrTyp">${Object.entries(RR_TYP).map(([k, l]) => `<option value="${k}" ${k === r.typ ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${r.typ === 'xfuery' ? `<label class="field"><span>X für Y</span><span style="display:flex;gap:6px;align-items:center"><input class="input num" id="rrX" value="${r.x}" style="width:70px"> für <input class="input num" id="rrY" value="${r.y}" style="width:70px"></span></label>`
            : `<label class="field"><span>Rabatt %</span><input class="input num" id="rrPct" value="${num(r.pct, 1)}"></label>`}
          ${r.typ === 'menge' ? `<label class="field"><span>ab Stück</span><input class="input num" id="rrAb" value="${r.ab}"></label>` : ''}${r.typ === 'bon' ? `<label class="field"><span>ab Einkaufswert €</span><input class="input num" id="rrAbB" value="${num(r.ab_betrag, 2)}"></label>` : ''}
          <label class="field"><span>Gilt für</span><select class="input select" id="rrScope">${[['alle', 'alle Artikel'], ['warengruppe', 'Warengruppen'], ['marke', 'Marken'], ['artikel', 'einzelne Artikel']].map(([k, l]) => `<option value="${k}" ${k === r.scope ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Kund:innen</span><select class="input select" id="rrKund">${[['alle', 'alle'], ['stammkunden', 'nur mit Kundenkarte'], ...TIERS.map(t => [t, 'nur ' + t])].map(([k, l]) => `<option value="${esc(k)}" ${k === r.kunden ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
        ${r.scope !== 'alle' ? `<div style="display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow:auto">${vals().map(([k, l]) => `<button class="chip" data-rrv="${esc(k)}" aria-pressed="${r.werte.includes(k)}">${esc(l)}</button>`).join('')}</div>` : ''}
        <div class="ed-grid"><label class="field"><span>von</span><input class="input" type="date" id="rrVon" value="${esc(r.von || '')}"></label><label class="field"><span>bis</span><input class="input" type="date" id="rrBis" value="${esc(r.bis || '')}"></label>
          <label class="field"><span>Uhrzeit von</span><input class="input" type="time" id="rrZv" value="${esc(r.zeit_von || '')}"></label><label class="field"><span>Uhrzeit bis</span><input class="input" type="time" id="rrZb" value="${esc(r.zeit_bis || '')}"></label></div>
        <div><div class="muted" style="font-size:12px;margin-bottom:6px">Wochentage (keiner = jeden Tag)</div><div style="display:flex;gap:6px">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button class="chip" data-rrd="${d}" aria-pressed="${r.tage.includes(d)}">${WDAYS[d]}</button>`).join('')}</div></div>
        <label style="display:flex;gap:10px;align-items:center"><button class="switch" role="switch" id="rrAkt" aria-checked="${!!r.aktiv}"></button> Regel aktiv</label></div>
      <div class="m-foot">${isNew ? '' : `<button class="btn btn-danger" data-rrdel>${ic('trash', 'i-sm')}Löschen</button>`}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-rrsave>${ic('check', 'i-sm')}Speichern</button></div>`;
  };
  const read = () => {
    const g = id => $('#' + id, box);
    r.name = g('rrName').value.trim(); r.typ = g('rrTyp').value; r.scope = g('rrScope').value; r.kunden = g('rrKund').value;
    if (g('rrPct')) r.pct = parseAmt(g('rrPct').value) || 0; if (g('rrAb')) r.ab = parseInt(g('rrAb').value, 10) || 2; if (g('rrAbB')) r.ab_betrag = parseAmt(g('rrAbB').value) || 0;
    if (g('rrX')) { r.x = parseInt(g('rrX').value, 10) || 3; r.y = parseInt(g('rrY').value, 10) || 2; }
    r.von = g('rrVon').value; r.bis = g('rrBis').value; r.zeit_von = g('rrZv').value; r.zeit_bis = g('rrZb').value; r.aktiv = g('rrAkt').getAttribute('aria-checked') === 'true';
  };
  box.addEventListener('change', e => { if (['rrTyp', 'rrScope'].includes(e.target.id)) { read(); if (e.target.id === 'rrScope') r.werte = []; render(); } });
  box.addEventListener('click', async e => {
    const t = e.target;
    const vv = t.closest('[data-rrv]'); if (vv) { const k = vv.dataset.rrv; r.werte.includes(k) ? r.werte.splice(r.werte.indexOf(k), 1) : r.werte.push(k); vv.setAttribute('aria-pressed', r.werte.includes(k)); return; }
    const dd = t.closest('[data-rrd]'); if (dd) { const d = +dd.dataset.rrd; r.tage.includes(d) ? r.tage.splice(r.tage.indexOf(d), 1) : r.tage.push(d); dd.setAttribute('aria-pressed', r.tage.includes(d)); return; }
    if (t.closest('#rrAkt')) { const s = $('#rrAkt', box); s.setAttribute('aria-checked', s.getAttribute('aria-checked') !== 'true'); return; }
    if (t.closest('[data-rrdel]')) { if (!(await confirmBox(`Regel „${r.name}“ löschen?`))) return; const l = rRules().slice(); l.splice(i, 1); await saveSettings({'rabatt.regeln': l}); closeLayer(el); return renderRabattregeln(); }
    if (t.closest('[data-rrsave]')) {
      read();
      if (r.name.length < 2) return toast('Name fehlt', {type: 'warn'});
      if (r.scope !== 'alle' && !r.werte.length) return toast('Bitte Warengruppen, Marken oder Artikel wählen', {type: 'warn'});
      if (r.typ !== 'xfuery' && !(r.pct > 0 && r.pct <= 100)) return toast('Rabatt zwischen 0 und 100 %', {type: 'warn'});
      try { await needPerm('preise.aktionen', 'Rabattregel speichern'); } catch { return; }
      const l = rRules().slice(); if (isNew) l.push(r); else l[i] = r;
      await saveSettings({'rabatt.regeln': l}); Hooks.emit('pricing.rule.saved', {regel: r.name, art: r.typ}); closeLayer(el); renderRabattregeln();
    }
  });
  render();
}

/* ── Kampagnen ── */
registerPage('kampagnen', {title: 'Kampagnen', sub: () => 'E-Mail-Aktionen an Kund:innen', render: renderKampagnen});
async function renderKampagnen() {
  const v = $('#view-kampagnen');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('mail', 'Kampagnen'); return; }
  let l; try { l = await docLoad('kampagne'); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  const stats = {}; await Promise.all(l.filter(d => d.status !== 'entwurf').map(async d => { try { stats[d.id] = await invoke('campaign_stats', {id: d.id}); } catch { /* */ } }));
  v.innerHTML = `<div class="cv">${pageHead('Kampagnen', 'Zielgruppe wählen, Text schreiben, optional persönlichen Gutschein mitschicken – versendet über Ihren eigenen Mailserver; Erfolg wird gemessen (eingelöste Gutscheine, Umsatz der Empfänger:innen)', `<button class="btn btn-primary" data-ka="neu">${ic('plus', 'i-sm')}Neue Kampagne</button>`)}
    ${kpiCards([[num(l.length), 'Kampagnen'], [num(l.reduce((s, d) => s + (d.data.versand?.ok || 0), 0)), 'E-Mails versendet'], [num(Object.values(stats).reduce((s, x) => s + x.eingeloest, 0)), 'Gutscheine eingelöst', 'pos'], [eur0(Object.values(stats).reduce((s, x) => s + x.umsatz, 0) / 100), 'Umsatz der Empfänger:innen danach']])}
    <div class="card">${l.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Kampagne</th><th>Status</th><th class="r">Empfänger</th><th class="r">Gutscheine eingelöst</th><th class="r">Käufer:innen</th><th class="r" style="padding-right:16px">Umsatz danach</th></tr></thead><tbody>${l.map(d => { const s = stats[d.id]; return `<tr data-kae="${d.id}" style="cursor:pointer"><td style="padding-left:16px"><b>${esc(d.data.titel)}</b><div class="muted" style="font-size:12px">${esc(d.no)}${d.data.versand ? ' · versendet ' + esc(fmtTs(d.data.versand.zeit)) : ''}</div></td><td>${dPill(d.status)}</td><td class="r num">${num(d.data.versand?.ok || 0)}${d.data.versand?.fehler ? ` <span style="color:var(--neg)">(${d.data.versand.fehler} Fehler)</span>` : ''}</td><td class="r num">${s ? `${s.eingeloest} / ${s.gutscheine}` : '–'}</td><td class="r num">${s ? s.kaeufer : '–'}</td><td class="r num" style="padding-right:16px;font-weight:600">${s ? eur0(s.umsatz / 100) : '–'}</td></tr>`; }).join('')}</tbody></table>`
      : `<div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('mail')}</div><h3>Noch keine Kampagne</h3><p>Zum Beispiel: „Wir vermissen Sie“ mit € 10 Gutschein an alle, die seit 180 Tagen nicht da waren.</p><button class="btn btn-primary" data-ka="neu">${ic('plus', 'i-sm')}Kampagne anlegen</button></div>`}</div></div>`;
}
async function openKampagne(id) {
  let d = id ? await invoke('doc_get', {id}) : null;
  const st = d ? JSON.parse(JSON.stringify(d)) : {kind: 'kampagne', partner_name: 'Kund:innen', data: {titel: '', segment: {stufen: [], nur_einwilligung: true, min_punkte: 0, min_umsatz: 0, kauf_tage: 0, ohne_kauf_tage: 0}, betreff: 'Ein Dankeschön für Sie, {{vorname}}', text: 'Liebe:r {{vorname}},\n\nals Dankeschön für Ihre Treue schenken wir Ihnen einen Gutschein über {{betrag}}.\nEinfach an der Kasse den Code vorzeigen.\n\nWir freuen uns auf Ihren Besuch!\nIhr Team von {{firma}}', gutschein: 1000, gutschein_bis: plusDays(60)}};
  const sent = st.status && st.status !== 'entwurf';
  const el = openLayer(`<div class="drawer-panel" style="width:min(760px,100%)" role="dialog" aria-modal="true"><div data-kab style="display:flex;flex-direction:column;min-height:0;flex:1"></div></div>`, {cls: 'drawer'});
  const box = $('[data-kab]', el);
  let prev = null, stats = sent ? await invoke('campaign_stats', {id: st.id}).catch(() => null) : null;
  const seg = st.data.segment;
  const render = () => {
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('mail')}</div><div><h2>${st.no ? esc(st.data.titel) : 'Neue Kampagne'} ${st.status ? dPill(st.status) : ''}</h2><p>${st.no ? esc(st.no) : 'Platzhalter: {{name}}, {{vorname}}, {{code}}, {{betrag}}, {{punkte}}, {{firma}}'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="drawer-body" style="display:grid;gap:14px;align-content:start">
        ${stats ? kpiCards([[num(stats.empfaenger), 'Empfänger:innen'], [`${stats.eingeloest} / ${stats.gutscheine}`, 'Gutscheine eingelöst', 'pos'], [num(stats.kaeufer), 'kauften danach'], [eur0(stats.umsatz / 100), 'Umsatz danach']]) : ''}
        <label class="field"><span>Titel (intern)</span><input class="input" data-kf="titel" value="${esc(st.data.titel)}" ${sent ? 'disabled' : ''} placeholder="z. B. Herbst-Dankeschön Gipfel-Club"></label>
        <div class="card" style="padding:14px;display:grid;gap:10px"><b style="font-size:13px">Zielgruppe</b>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${TIERS.map(t => `<button class="chip" data-kt="${esc(t)}" aria-pressed="${seg.stufen.includes(t)}" ${sent ? 'disabled' : ''}>${esc(t)}</button>`).join('')}<span class="muted" style="font-size:12px;align-self:center">keine Auswahl = alle Stufen</span></div>
          <div class="ed-grid"><label class="field"><span>mind. Bonuspunkte</span><input class="input num" data-ks="min_punkte" value="${seg.min_punkte || 0}" ${sent ? 'disabled' : ''}></label><label class="field"><span>mind. Umsatz gesamt €</span><input class="input num" data-ks="min_umsatz" data-money value="${num((seg.min_umsatz || 0) / 100, 0)}" ${sent ? 'disabled' : ''}></label>
            <label class="field"><span>Kauf in den letzten … Tagen</span><input class="input num" data-ks="kauf_tage" value="${seg.kauf_tage || 0}" ${sent ? 'disabled' : ''}></label><label class="field"><span>seit … Tagen kein Kauf</span><input class="input num" data-ks="ohne_kauf_tage" value="${seg.ohne_kauf_tage || 0}" ${sent ? 'disabled' : ''}></label></div>
          <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" data-ke ${seg.nur_einwilligung !== false ? 'checked' : ''} ${sent ? 'disabled' : ''}> nur Kund:innen mit Werbe-Einwilligung (DSGVO)</label>
          <div style="display:flex;gap:8px;align-items:center"><button class="btn btn-secondary btn-sm" data-kp ${sent ? 'disabled' : ''}>${ic('users', 'i-sm')}Empfänger:innen zählen</button><span class="muted" style="font-size:12.5px" data-kpr>${prev ? `${prev.anzahl} Empfänger:innen${prev.beispiele.length ? ' – z. B. ' + esc(prev.beispiele.slice(0, 4).map(b => b.name).join(', ')) : ''}` : ''}</span></div></div>
        <label class="field"><span>Betreff</span><input class="input" data-kf="betreff" value="${esc(st.data.betreff)}" ${sent ? 'disabled' : ''}></label>
        <label class="field"><span>Text</span><textarea class="input" data-kf="text" rows="9" style="height:auto;padding:10px 12px" ${sent ? 'disabled' : ''}>${esc(st.data.text)}</textarea></label>
        <div class="ed-grid"><label class="field"><span>Persönlicher Gutschein € (0 = keiner)</span><input class="input num" data-kg value="${num((st.data.gutschein || 0) / 100, 2)}" ${sent ? 'disabled' : ''}></label><label class="field"><span>Gutschein gültig bis</span><input class="input" type="date" data-kgb value="${esc(st.data.gutschein_bis || '')}" ${sent ? 'disabled' : ''}></label></div>
        ${sent && st.data.empfaenger?.length ? `<details class="card" style="padding:12px 16px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Empfänger:innen (${st.data.empfaenger.length})</summary><table class="tbl" style="margin-top:8px"><tbody>${st.data.empfaenger.map(r => `<tr><td>${esc(r.name)}</td><td class="muted">${esc(r.email)}</td><td class="mono">${esc(r.code || '')}</td><td>${r.ok ? '<span style="color:var(--pos)">gesendet</span>' : `<span style="color:var(--neg)">${esc(r.fehler || 'Fehler')}</span>`}</td></tr>`).join('')}</tbody></table></details>` : ''}</div>
      <div class="m-foot" style="border-top:1px solid var(--line);padding-top:14px">${!sent ? `<button class="btn btn-ghost" data-ktest>${ic('mail', 'i-sm')}Testmail an mich</button>` : ''}<span class="sp"></span>${!sent ? `<button class="btn btn-secondary" data-ksave>${ic('check', 'i-sm')}Speichern</button><button class="btn btn-primary" data-ksend>${ic('mail', 'i-sm')}Jetzt versenden</button>` : st.status === 'versendet' ? `<button class="btn btn-secondary" data-kdone>Abschließen</button>` : ''}</div>`;
  };
  const read = () => {
    $$('[data-kf]', box).forEach(i => { st.data[i.dataset.kf] = i.value; });
    $$('[data-ks]', box).forEach(i => { seg[i.dataset.ks] = i.dataset.money != null ? e2c(i.value) : (parseInt(i.value, 10) || 0); });
    const e = $('[data-ke]', box); if (e) seg.nur_einwilligung = e.checked;
    const g = $('[data-kg]', box); if (g) st.data.gutschein = e2c(g.value); const gb = $('[data-kgb]', box); if (gb) st.data.gutschein_bis = gb.value;
  };
  const save = async () => { read(); if (!st.data.titel.trim()) { toast('Titel fehlt', {type: 'warn'}); return null; } try { const r = await invoke('doc_save', {doc: {...st, id: st.id || null}, user: S.user.name}); Object.assign(st, r); return r; } catch (e) { toast('Nicht gespeichert', {t2: String(e), type: 'warn'}); return null; } };
  box.addEventListener('click', async e => {
    const t = e.target;
    const kt = t.closest('[data-kt]'); if (kt && !sent) { const k = kt.dataset.kt; seg.stufen.includes(k) ? seg.stufen.splice(seg.stufen.indexOf(k), 1) : seg.stufen.push(k); kt.setAttribute('aria-pressed', seg.stufen.includes(k)); return; }
    if (t.closest('[data-kp]')) { read(); try { prev = await invoke('campaign_preview', {segment: seg}); } catch (err) { return toast('Nicht möglich', {t2: String(err), type: 'warn'}); } return render(); }
    if (t.closest('[data-ksave]')) { if (await save()) { toast('Kampagne gespeichert', {type: 'pos', icon: 'mail'}); renderKampagnen(); render(); } return; }
    if (t.closest('[data-ktest]')) {
      read(); const to = await askText('Testmail', 'An welche Adresse?', CFG['mail.from'] || ''); if (!to) return;
      const fill = s => s.replace(/\{\{vorname\}\}/g, S.user.name.split(' ')[0]).replace(/\{\{name\}\}/g, S.user.name).replace(/\{\{code\}\}/g, 'TEST-CODE').replace(/\{\{betrag\}\}/g, eur((st.data.gutschein || 0) / 100)).replace(/\{\{punkte\}\}/g, '123').replace(/\{\{firma\}\}/g, CFG['firma.name']);
      try { await invoke('mail_send', {to, subject: '[TEST] ' + fill(st.data.betreff), html: `<div style="font:15px/1.6 system-ui,sans-serif">${esc(fill(st.data.text)).replace(/\n/g, '<br>')}</div>`, text: fill(st.data.text), qr: null, purpose: 'kampagne-test'}); toast('Testmail gesendet', {t2: to, type: 'pos', icon: 'mail'}); } catch (err) { toast('Nicht gesendet', {t2: String(err), type: 'warn', dur: 8000}); }
      return;
    }
    if (t.closest('[data-ksend]')) {
      const r = await save(); if (!r) return;
      let p; try { p = await invoke('campaign_preview', {segment: seg}); } catch (err) { return toast('Nicht möglich', {t2: String(err), type: 'warn'}); }
      if (!p.anzahl) return toast('Keine Empfänger:innen in der Zielgruppe', {type: 'warn'});
      if (!(await confirmBox(`Kampagne jetzt an ${p.anzahl} Kund:innen senden${st.data.gutschein ? ` – mit je einem Gutschein über ${eur(st.data.gutschein / 100)}` : ''}?`, 'Jetzt versenden'))) return;
      try { await needPerm('marketing', 'Kampagne versenden'); } catch { return; }
      toast('Kampagne wird versendet …', {icon: 'mail', dur: 4000});
      try { const x = await invoke('campaign_send', {id: st.id, user: S.user.name}); Hooks.emit('marketing.campaign.sent', {kampagne: x.data.titel, gesendet: x.data.versand.ok, fehler: x.data.versand.fehler}); toast('Kampagne versendet', {t2: `${x.data.versand.ok} gesendet${x.data.versand.fehler ? ` · ${x.data.versand.fehler} Fehler` : ''}`, type: x.data.versand.fehler ? 'warn' : 'pos', icon: 'mail', dur: 8000}); closeLayer(el); renderKampagnen(); }
      catch (err) { toast('Versand fehlgeschlagen', {t2: String(err), type: 'warn', dur: 9000}); }
    }
    if (t.closest('[data-kdone]')) { await invoke('doc_action', {id: st.id, action: 'abschliessen', payload: {}, user: S.user.name}); closeLayer(el); renderKampagnen(); }
  });
  render();
}

/* ── Sales-Aktionen (Verkaufsprämien) ── */
registerPage('salesaktionen', {title: 'Sales-Aktionen', sub: () => 'Verkaufsprämien', render: renderSalesAktionen});
const spMatch = (d, l) => { const a = l.sku ? artById(l.sku) : null; const sc = d.data.scope || 'alle', w = d.data.werte || []; return !l.service && !l.voucher && (sc === 'alle' || (a && ((sc === 'warengruppe' && w.includes(a.cat)) || (sc === 'marke' && w.includes(a.brand)) || (sc === 'artikel' && w.includes(a.id))))); };
function spEval(d, sales) {
  const per = {};
  sales.filter(s => (s.kind || 'verkauf') === 'verkauf' && !s.voided && s.ts.slice(0, 10) >= (d.data.von || '0') && s.ts.slice(0, 10) <= (d.data.bis || '9')).forEach(s => {
    (s.data?.lines || []).filter(l => spMatch(d, l)).forEach(l => {
      const who = s.data?.seller || s.cashier || '–', g = l.unit * l.qty * (1 - (l.disc?.pct || 0) / 100);
      (per[who] ||= {stueck: 0, umsatz: 0}); per[who].stueck += l.qty; per[who].umsatz += g;
    });
  });
  Object.values(per).forEach(x => { x.praemie = d.data.art === 'prozent' ? x.umsatz * (+d.data.wert || 0) / 100 : x.stueck * (+d.data.wert || 0); });
  return per;
}
async function renderSalesAktionen() {
  const v = $('#view-salesaktionen');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('target', 'Sales-Aktionen'); return; }
  let l, sales; try { [l, sales] = await Promise.all([docLoad('praemie'), invoke('sales_list', {limit: 5000})]); } catch (e) { v.innerHTML = `<div class="cv"><div class="card" style="padding:18px">${esc(String(e))}</div></div>`; return; }
  v.innerHTML = `<div class="cv">${pageHead('Sales-Aktionen', 'Verkaufsprämien für das Team: z. B. € 5 je verkaufter Skijacke oder 3 % vom Umsatz einer Marke – ausgewertet je Verkäufer:in (Bon-Zuordnung)', `<button class="btn btn-secondary" data-goto="bon-verkaeufer">${ic('user', 'i-sm')}Verkäufer-Bon-Zuordnung</button><button class="btn btn-primary" data-sp="neu">${ic('plus', 'i-sm')}Neue Sales-Aktion</button>`)}
    ${l.length ? l.map(d => { const per = spEval(d, sales), rows = Object.entries(per).sort((a, b) => b[1].praemie - a[1].praemie); return `<div class="card" style="margin-bottom:12px"><div class="set-row"><div><div class="set-l">${esc(d.data.titel)} ${dPill(d.status)}</div><div class="set-h">${esc(dDate(d.data.von))} – ${esc(dDate(d.data.bis))} · ${d.data.art === 'prozent' ? `${num(d.data.wert, 1)} % vom Umsatz` : `${eur(+d.data.wert || 0)} je Stück`} · ${d.data.scope === 'alle' || !d.data.scope ? 'alle Artikel' : esc((d.data.werte || []).map(w => d.data.scope === 'warengruppe' ? CATS.find(c => c.id === w)?.name || w : d.data.scope === 'artikel' ? artById(w)?.name || w : w).join(', '))}</div></div><div class="set-c" style="gap:6px"><button class="btn btn-ghost btn-sm" data-spcsv="${d.id}">${ic('download', 'i-sm')}CSV</button><button class="btn btn-secondary btn-sm" data-spe="${d.id}">Bearbeiten</button></div></div>
      ${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Verkäufer:in</th><th class="r">Stück</th><th class="r">Umsatz</th><th class="r" style="padding-right:16px">Prämie</th></tr></thead><tbody>${rows.map(([k, x], i) => `<tr><td style="padding-left:16px">${i === 0 ? '🏆 ' : ''}<b>${esc(k)}</b></td><td class="r num">${num(x.stueck)}</td><td class="r num">${eur(x.umsatz)}</td><td class="r num" style="padding-right:16px;font-weight:650;color:var(--pos)">${eur(x.praemie)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:22px"><p>Noch keine passenden Verkäufe im Zeitraum.</p></div>'}</div>`; }).join('')
      : `<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('target')}</div><h3>Noch keine Sales-Aktion</h3><p>Motivation fürs Team – Kontor rechnet die Prämien aus den Bons.</p><button class="btn btn-primary" data-sp="neu">${ic('plus', 'i-sm')}Sales-Aktion anlegen</button></div></div>`}</div>`;
  v._l = l; v._sales = sales;
}
function openSalesAktion(d) {
  const st = d ? JSON.parse(JSON.stringify(d)) : {kind: 'praemie', partner_name: 'Team', data: {titel: '', von: today(), bis: plusDays(30), scope: 'warengruppe', werte: [], art: 'stueck', wert: 5}};
  const el = openLayer(`<div class="modal" style="width:min(620px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true"><div data-spb style="display:flex;flex-direction:column;min-height:0"></div></div>`);
  const box = $('[data-spb]', el);
  const vals = () => st.data.scope === 'warengruppe' ? CATS.filter(c => c.id !== 'alle').map(c => [c.id, c.name]) : st.data.scope === 'marke' ? [...new Set(ART.map(a => a.brand).filter(Boolean))].sort().map(b => [b, b]) : st.data.scope === 'artikel' ? ART.map(a => [a.id, a.name]) : [];
  const render = () => { box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('target')}</div><div><h2>${st.no ? esc(st.data.titel) : 'Neue Sales-Aktion'}</h2><p>Prämie je Verkäufer:in aus den Bons</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="overflow:auto;display:grid;gap:12px"><div class="ed-grid"><label class="field full"><span>Titel</span><input class="input" data-spf="titel" value="${esc(st.data.titel)}" placeholder="z. B. Skijacken-Challenge"></label>
      <label class="field"><span>von</span><input class="input" type="date" data-spf="von" value="${esc(st.data.von)}"></label><label class="field"><span>bis</span><input class="input" type="date" data-spf="bis" value="${esc(st.data.bis)}"></label>
      <label class="field"><span>Prämie</span><select class="input select" data-spf="art"><option value="stueck" ${st.data.art === 'stueck' ? 'selected' : ''}>€ je Stück</option><option value="prozent" ${st.data.art === 'prozent' ? 'selected' : ''}>% vom Umsatz</option></select></label><label class="field"><span>Wert</span><input class="input num" data-spf="wert" value="${num(st.data.wert, 2)}"></label>
      <label class="field"><span>Gilt für</span><select class="input select" data-spf="scope">${[['alle', 'alle Artikel'], ['warengruppe', 'Warengruppen'], ['marke', 'Marken'], ['artikel', 'Artikel']].map(([k, l]) => `<option value="${k}" ${k === st.data.scope ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      ${st.data.scope !== 'alle' ? `<div style="display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow:auto">${vals().map(([k, l]) => `<button class="chip" data-spv="${esc(k)}" aria-pressed="${st.data.werte.includes(k)}">${esc(l)}</button>`).join('')}</div>` : ''}</div>
    <div class="m-foot">${st.id && st.status === 'aktiv' ? '<button class="btn btn-secondary" data-spend>Beenden</button>' : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-spsave>${ic('check', 'i-sm')}Speichern</button></div>`; };
  const read = () => $$('[data-spf]', box).forEach(i => { st.data[i.dataset.spf] = i.dataset.spf === 'wert' ? parseAmt(i.value) || 0 : i.value; });
  box.addEventListener('change', e => { if (e.target.dataset.spf === 'scope') { read(); st.data.werte = []; render(); } });
  box.addEventListener('click', async e => {
    const vv = e.target.closest('[data-spv]'); if (vv) { const k = vv.dataset.spv, w = st.data.werte; w.includes(k) ? w.splice(w.indexOf(k), 1) : w.push(k); vv.setAttribute('aria-pressed', w.includes(k)); return; }
    if (e.target.closest('[data-spend]')) { await invoke('doc_action', {id: st.id, action: 'beenden', payload: {}, user: S.user.name}); closeLayer(el); return renderSalesAktionen(); }
    if (e.target.closest('[data-spsave]')) { read(); try { await invoke('doc_save', {doc: {...st, id: st.id || null}, user: S.user.name}); closeLayer(el); toast('Sales-Aktion gespeichert', {type: 'pos', icon: 'target'}); renderSalesAktionen(); } catch (err) { toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); } }
  });
  render();
}

/* ── Digitales Schaufenster ── */
registerPage('schaufenster', {title: 'Digitales Schaufenster', sub: () => CFG['shop.aktiv'] ? 'online' : 'aus', render: renderSchaufenster});
function shopMeta() {
  const glyphs = {}; new Set(ART.map(a => a.g)).forEach(g => { const s = document.getElementById('g-' + g); if (s) glyphs[g] = s.innerHTML; });
  return {kategorien: Object.fromEntries(CATS.filter(c => c.id !== 'alle').map(c => [c.id, c.name])), farben: Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, [v[0], v[1]]])), glyphs};
}
async function renderSchaufenster() {
  const v = $('#view-schaufenster');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('store', 'Schaufenster'); return; }
  let s; try { s = await invoke('shop_status'); } catch { s = {laeuft: false, urls: []}; }
  // Schaufenster aktiv, Server aber aus (z. B. Port beim Start belegt) → neu starten
  if (CFG['shop.aktiv'] && !s.laeuft) { try { await invoke('api_toggle', {on: true, lan: !!CFG['api.lan'], port: +CFG['api.port'] || 8787}); CFG['api.aktiv'] = true; s = await invoke('shop_status'); } catch (e) { toast('Server für das Schaufenster nicht startbar', {t2: String(e), type: 'warn', dur: 8000}); } }
  const on = !!CFG['shop.aktiv'], url = s.urls[0] || '', local = s.urls.find(u => u.includes('127.0.0.1')) || url;
  let qr = ''; if (on && s.netzwerk && url) { try { qr = await invoke('qr_svg', {text: url}); } catch { /* */ } }
  const sw = (k, l, h) => `<div class="set-row"><div><div class="set-l">${l}</div><div class="set-h">${h}</div></div><div class="set-c"><button class="switch" role="switch" data-shs="${k}" aria-checked="${!!CFG[k]}"></button></div></div>`;
  const tf = (k, l, h, area) => `<div class="set-row" style="display:grid;gap:8px"><div><div class="set-l">${l}</div><div class="set-h">${h}</div></div>${area ? `<textarea class="input" data-shf="${k}" rows="3" style="height:auto;padding:9px 12px;width:100%">${esc(CFG[k] || '')}</textarea>` : `<input class="input" data-shf="${k}" value="${esc(CFG[k] ?? '')}" style="width:100%">`}</div>`;
  const hidden = new Set(CFG['shop.ausgeblendet'] || []), cats = new Set(CFG['shop.kategorien'] || []);
  v.innerHTML = `<div class="cv">${pageHead('Digitales Schaufenster', 'Ihr Sortiment als Webseite – mit Bildern, Preisen (inkl. Aktionen) und Verfügbarkeit. Kund:innen reservieren online und holen im Geschäft ab; Anfragen erscheinen unter Reservierungen.', `${on && url ? `<button class="btn btn-secondary" data-sh="open">${ic('arrow-right', 'i-sm')}Im Browser öffnen</button>` : ''}<button class="btn btn-secondary" data-goto="reservierungen">${ic('clock', 'i-sm')}Reservierungen</button>`)}
    <div style="display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;align-items:start" class="pg-split2">
      <div style="display:grid;gap:16px">
        <div class="card">
          <div class="set-row"><div><div class="set-l">Schaufenster ${on ? '<span class="pill pos" style="height:20px">online</span>' : '<span class="pill" style="height:20px">aus</span>'}</div><div class="set-h">${on ? (s.laeuft ? (s.netzwerk ? 'Erreichbar im Firmennetz – für das Internet Portfreigabe oder Reverse-Proxy (z. B. über Ihren Webhoster) einrichten' : 'Nur auf diesem PC erreichbar') : 'Eingebauter Server ist aus') : 'Einschalten, um die Seite unter /shop zu veröffentlichen'}</div></div><div class="set-c"><button class="switch" role="switch" data-sh="aktiv" aria-checked="${on}"></button></div></div>
          ${on && !s.netzwerk ? `<div class="set-row"><div><div class="set-l">Im Firmennetz freigeben</div><div class="set-h">Damit Kund:innen im WLAN, Tablets im Geschäft oder Ihr Webhoster die Seite erreichen</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-sh="lan">${ic('wifi', 'i-sm')}Freigeben</button></div></div>` : ''}
          ${on ? `<div class="set-row" style="border-bottom:0"><div style="min-width:0"><div class="set-l">Adresse</div><div class="set-h mono" style="word-break:break-all">${s.urls.map(u => esc(u)).join('<br>')}</div></div>${qr ? `<div class="qr-box">${qr.replace('<svg', '<svg width="110" height="110"')}</div>` : ''}</div>` : ''}</div>
        <div class="card">
          ${tf('shop.titel', 'Überschrift', 'z. B. „Neu eingetroffen: Herbst 2026“')}
          ${tf('shop.text', 'Einleitung', 'Ein, zwei Sätze unter der Überschrift', true)}
          <div class="set-row"><div><div class="set-l">Akzentfarbe</div><div class="set-h">Knöpfe, Preise, Aktionen</div></div><div class="set-c"><input type="color" data-shf="shop.farbe" value="${esc(CFG['shop.farbe'] || '#1f6fd1')}" style="width:44px;height:30px;border:0;background:none"></div></div>
          ${sw('shop.preise', 'Preise anzeigen', 'Aus = nur Sortiment und Verfügbarkeit')}
          <div class="set-row"><div><div class="set-l">Verfügbarkeit</div><div class="set-h">Wie genau der Bestand gezeigt wird (reservierte Ware ist abgezogen)</div></div><div class="set-c"><div class="seg" id="shBest">${[['ampel', 'verfügbar / wenige'], ['genau', 'Stückzahl'], ['aus', 'nur ja/nein']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${(CFG['shop.bestand'] || 'ampel') === k}">${l}</button>`).join('')}</div></div></div>
          ${sw('shop.nur_lagernd', 'Nur lagernde Artikel', 'Ausverkaufte Artikel ausblenden')}
          ${sw('shop.gpsr_ausblenden', 'Nur Artikel mit vollständigen Herstellerangaben', `Produktsicherheitsverordnung (GPSR): Artikel, deren Marke keine vollständigen Angaben zu Hersteller und – bei Herstellern außerhalb der EU – Verantwortlichem in der EU hat, werden nicht angezeigt – auch Artikel ohne Marke (aktuell ${num(mkArtikelOhneGpsr().length)} von ${num(ART.length)} Artikeln). Die Angaben pflegen Sie unter Stammdaten › Marken; sonst erscheinen sie im Artikel unter „Hersteller & Produktsicherheit“.`)}
          ${sw('shop.reservieren', 'Online reservieren', 'Click & Reserve – Bezahlung bei Abholung')}
          <div class="set-row"><div><div class="set-l">Reservierung gilt</div><div class="set-h">Tage bis zur Abholung</div></div><div class="set-c"><input class="input num" data-shf="shop.abholtage" value="${esc(CFG['shop.abholtage'] ?? 3)}" style="width:80px;text-align:right"> Tage</div></div>
          ${tf('shop.oeffnung', 'Öffnungszeiten', 'erscheinen in der Fußzeile', true)}
          ${tf('shop.kontakt', 'Kontakt', 'Telefon, E-Mail, Social Media', true)}
          ${tf('shop.hinweis', 'Hinweis', 'z. B. Parkplätze, Anfahrt', true)}
          <div class="set-row" style="border-bottom:0;display:block"><div class="set-l">Warengruppen im Schaufenster</div><div class="set-h" style="margin-bottom:8px">keine Auswahl = alle</div><div style="display:flex;flex-wrap:wrap;gap:6px">${catsInUse([...cats]).map(c => `<button class="chip" data-shc="${esc(c.id)}" aria-pressed="${cats.has(c.id)}">${esc(c.name)}</button>`).join('')}</div></div></div>
        <div class="card"><div class="set-row"><div><div class="set-l">Artikel ausblenden</div><div class="set-h">${hidden.size} ausgeblendet · Klick wechselt</div></div><div class="set-c"><input class="input" id="shQ" placeholder="Suchen …" style="width:200px"></div></div><div id="shArts" style="max-height:340px;overflow:auto"></div></div>
        <div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" data-sh="save">${ic('check', 'i-sm')}Speichern</button></div>
      </div>
      <div class="card" style="position:sticky;top:12px;overflow:hidden">${on && s.laeuft ? `<div class="set-row"><div class="set-l">Vorschau</div><div class="set-c"><button class="btn btn-ghost btn-sm" data-sh="reload">${ic('sync', 'i-sm')}Neu laden</button></div></div><iframe id="shFrame" src="${esc(local)}" title="Vorschau Schaufenster" style="width:100%;height:min(78vh,820px);border:0;background:#f5f7fa"></iframe>` : `<div class="empty" style="padding:60px 20px"><div class="empty-icon">${ic('store')}</div><h3>Vorschau</h3><p>Schaufenster einschalten – dann erscheint hier die Live-Vorschau.</p></div>`}</div></div></div>`;
  initSeg($('#shBest', v), b => { CFG['shop.bestand'] = b.dataset.v; });
  renderShopArts();
}
function renderShopArts() {
  const box = $('#shArts'); if (!box) return;
  const q = norm($('#shQ')?.value || ''), hidden = new Set(CFG['shop.ausgeblendet'] || []);
  box.innerHTML = `<table class="tbl" style="margin:0"><tbody>${ART.filter(a => !q || a.hay.includes(q)).slice(0, 200).map(a => `<tr data-sha="${esc(a.id)}" style="cursor:pointer;${hidden.has(a.id) ? 'opacity:.5' : ''}"><td style="padding-left:16px"><b>${esc(a.name)}</b> <span class="muted">· ${esc(a.brand)}</span></td><td class="r" style="padding-right:16px">${hidden.has(a.id) ? '<span class="pill" style="height:20px">ausgeblendet</span>' : `<span class="pill pos" style="height:20px">sichtbar</span>`}</td></tr>`).join('')}</tbody></table>`;
}
async function shopSave(extra = {}) {
  const v = $('#view-schaufenster'), vals = {...extra};
  $$('[data-shf]', v).forEach(i => { vals[i.dataset.shf] = i.dataset.shf === 'shop.abholtage' ? Math.max(1, parseInt(i.value, 10) || 3) : i.value; });
  $$('[data-shs]', v).forEach(b => { vals[b.dataset.shs] = b.getAttribute('aria-checked') === 'true'; });
  vals['shop.kategorien'] = $$('[data-shc]', v).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.shc);
  vals['shop.bestand'] = CFG['shop.bestand'] || 'ampel'; vals['shop.ausgeblendet'] = CFG['shop.ausgeblendet'] || [];
  vals['shop.meta'] = shopMeta();
  vals['firma.name'] = CFG['firma.name']; vals['firma.adresse'] = CFG['firma.adresse'];  // für Kopf- und Fußzeile des Schaufensters
  await saveSettings(vals, true);
}
function bindMarketing() {
  const on = (id, fn) => $('#view-' + id)?.addEventListener('click', fn);
  on('rabattregeln', e => { if (e.target.closest('[data-rr="neu"]')) return openRule(null); const r = e.target.closest('[data-rre]'); if (r) openRule(+r.dataset.rre); });
  on('kampagnen', e => { if (e.target.closest('[data-ka="neu"]')) return openKampagne(null); const r = e.target.closest('[data-kae]'); if (r) openKampagne(+r.dataset.kae); });
  on('salesaktionen', async e => {
    const v = $('#view-salesaktionen');
    if (e.target.closest('[data-sp="neu"]')) return openSalesAktion(null);
    const ed = e.target.closest('[data-spe]'); if (ed) return openSalesAktion(v._l.find(d => d.id === +ed.dataset.spe));
    const c = e.target.closest('[data-spcsv]'); if (c) { const d = v._l.find(x => x.id === +c.dataset.spcsv), per = spEval(d, v._sales); const csv = ['Verkäufer:in;Stück;Umsatz;Prämie'].concat(Object.entries(per).map(([k, x]) => [k, x.stueck, num(x.umsatz, 2), num(x.praemie, 2)].join(';'))).join('\r\n'); try { const p = await invoke('save_text', {name: `Sales-Aktion_${d.data.titel.replace(/\W+/g, '-')}.csv`, content: csv, title: 'Prämien exportieren'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } }
  });
  const sv = $('#view-schaufenster');
  sv.addEventListener('input', e => { if (e.target.id === 'shQ') renderShopArts(); });
  sv.addEventListener('click', async e => {
    const t = e.target;
    const sw = t.closest('[data-shs]'); if (sw) { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); return; }
    const c = t.closest('[data-shc]'); if (c) { c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'); return; }
    const a = t.closest('[data-sha]'); if (a) { const h = new Set(CFG['shop.ausgeblendet'] || []); h.has(a.dataset.sha) ? h.delete(a.dataset.sha) : h.add(a.dataset.sha); CFG['shop.ausgeblendet'] = [...h]; return renderShopArts(); }
    const b = t.closest('[data-sh]'); if (!b) return;
    const k = b.dataset.sh;
    if (k === 'aktiv') {
      const now = !CFG['shop.aktiv'];
      try { await needPerm('marketing', 'Schaufenster'); } catch { return; }
      if (now && !CFG['api.aktiv']) { try { await invoke('api_toggle', {on: true, lan: !!CFG['api.lan'], port: +CFG['api.port'] || 8787}); Object.assign(CFG, {'api.aktiv': true}); } catch (err) { return toast('Server nicht startbar', {t2: String(err), type: 'warn', dur: 8000}); } }
      await shopSave({'shop.aktiv': now}); Hooks.emit('config.schaufenster', {aktiv: now}); toast(now ? 'Schaufenster ist online' : 'Schaufenster ausgeschaltet', {icon: 'store', type: now ? 'pos' : ''}); return renderSchaufenster();
    }
    if (k === 'lan') { try { await invoke('api_toggle', {on: true, lan: true, port: +CFG['api.port'] || 8787}); Object.assign(CFG, {'api.aktiv': true, 'api.lan': true}); toast('Im Firmennetz freigegeben', {type: 'pos', icon: 'wifi'}); } catch (err) { toast('Nicht möglich', {t2: String(err), type: 'warn'}); } return renderSchaufenster(); }
    if (k === 'save') { await shopSave(); toast('Schaufenster gespeichert', {type: 'pos', icon: 'store'}); Hooks.emit('config.schaufenster', {aktiv: !!CFG['shop.aktiv']}); return renderSchaufenster(); }
    if (k === 'reload') { const f = $('#shFrame'); if (f) f.src = f.src; return; }
    if (k === 'open') { const s = await invoke('shop_status'); try { await invoke('open_url', {url: s.urls[0]}); } catch (err) { toast('Nicht möglich', {t2: String(err), type: 'warn'}); } }
  });
  // Katalog/Farben geändert → Schaufenster-Metadaten aktualisieren
  if (DESKTOP && CFG['shop.aktiv']) setTimeout(() => saveSettings({'shop.meta': shopMeta()}, true), 4000);
}
