
/* ════════════════════════════════════════════════════════════════════
   18 · KUNDEN — Stammdaten, Bonuspunkte, Kaufhistorie.
   Desktop: lokale Datenbank · Browser: nur im Speicher (Vorschau).
   ════════════════════════════════════════════════════════════════════ */
const TIERS = ['Kunde', 'Gipfel-Club', 'Gipfel-Club Silber', 'Gipfel-Club Gold', 'Mitarbeiter:in'];
const KV = {q: '', f: 'alle'};
const shortDate = d => d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.` : '–';

function custFinish(c) {
  c.hue = hash(c.id) % 360;
  c.last = c.lastVisit ? shortDate(c.lastVisit) : (c.last || '–');
  c.fields ||= {};
  return c;
}
function custFromDb(d) {
  return custFinish({id: d.id, name: d.name, email: d.email || '', phone: d.phone || '', tier: d.tier || 'Kunde', points: d.points || 0,
    club: d.club_name ? {name: d.club_name, pct: d.club_pct || 0} : null, fields: d.fields && typeof d.fields === 'object' ? d.fields : {},
    consent: !!d.consent, note: d.note || '', visits: d.visits || 0, revenue: (d.revenue || 0) / 100,
    lastVisit: d.last_visit ? new Date(d.last_visit) : null, created: d.created_at ? new Date(d.created_at) : null});
}
const custToDb = c => ({id: c.id || '', name: c.name, email: c.email || '', phone: c.phone || '', tier: c.tier || 'Kunde', points: c.points || 0,
  club_name: c.club?.name || null, club_pct: c.club ? +c.club.pct || 0 : null, fields: c.fields || {}, consent: !!c.consent, note: c.note || ''});
function replaceCustomers(list) { CUSTOMERS.length = 0; list.forEach(d => CUSTOMERS.push(custFromDb(d))); }
const custById = id => CUSTOMERS.find(c => c.id === id);

async function loadCustomers() {
  if (!DESKTOP) { CUSTOMERS.forEach(c => { c.consent ??= c.fields?.Newsletter === 'ja'; c.visits ??= 0; c.revenue ??= 0; custFinish(c); }); return; }
  try {
    let list = await invoke('customer_list');
    if (!list.length) {
      // Startdaten übernehmen (Vereinsrabatt als echte Kundendaten statt Testfeld)
      await invoke('customer_seed', {list: CUSTOMERS.map(c => custToDb({...c, consent: c.fields?.Newsletter === 'ja',
        fields: Object.fromEntries(Object.entries(c.fields || {}).filter(([k]) => !['Newsletter', 'Verein', 'Vereinsrabatt'].includes(k)))}))});
      list = await invoke('customer_list');
    }
    replaceCustomers(list);
  } catch (e) { toast('Kunden konnten nicht geladen werden', {t2: String(e), type: 'warn', dur: 8000}); }
}
async function reloadCustomers() { if (DESKTOP) { try { replaceCustomers(await invoke('customer_list')); } catch (e) { console.error(e); } } }

/* ── Liste ── */
function renderKunden() {
  const v = $('#view-kunden');
  const n = CUSTOMERS.length, consent = CUSTOMERS.filter(c => c.consent).length, pts = CUSTOMERS.reduce((s, c) => s + c.points, 0);
  const rev = CUSTOMERS.reduce((s, c) => s + (c.revenue || 0), 0), buyers = CUSTOMERS.filter(c => c.visits > 0).length;
  v.innerHTML = `<div class="cv">
    <div class="cv-head"><div><h2 class="h-title">Kunden</h2><div class="dash-meta" style="margin-top:6px"><span id="kuCount"></span>${DESKTOP ? '' : '<span>·</span><span class="pill warn" style="height:20px">Vorschau – Änderungen werden nicht gespeichert</span>'}</div></div>
      <button class="btn btn-primary" id="kuNew">${ic('user-plus', 'i-sm')}Neuer Kunde</button></div>
    <div class="kpis"><div class="card"><b class="num">${num(n)}</b><span>Kund:innen</span></div><div class="card"><b class="num">${num(consent)}</b><span>mit Newsletter-Einwilligung</span></div>
      <div class="card"><b class="num">${num(pts)}</b><span>offene Bonuspunkte</span></div><div class="card"><b>${eur0(rev)}</b><span>Umsatz mit Kundenkarte</span></div>
      <div class="card"><b>${buyers ? eur(rev / buyers) : '–'}</b><span>Ø je kaufende:r Kund:in</span></div></div>
    <div class="cv-tools"><label class="search-field">${ic('search')}<input id="kuQ" placeholder="Name, Kundennummer, E-Mail oder Telefon …" value="${esc(KV.q)}" autocomplete="off"></label>
      <div class="seg" id="kuSeg">${[['alle', 'Alle'], ['club', 'Gipfel-Club'], ['verein', 'Verein'], ['news', 'Newsletter']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${KV.f === k}">${l}</button>`).join('')}</div></div>
    <div class="card" id="kuTable"></div></div>`;
  initSeg($('#kuSeg', v), b => { KV.f = b.dataset.v; renderKuTable(); });
  renderKuTable();
}
function custMatches(c, toks) { const hay = norm(`${c.name} ${c.id} ${c.email} ${c.phone} ${c.tier} ${c.club?.name || ''}`); return toks.every(t => hay.includes(t)); }
function renderKuTable() {
  const toks = norm(KV.q.trim()).split(/\s+/).filter(Boolean);
  const list = CUSTOMERS.filter(c => custMatches(c, toks) && (KV.f === 'alle' || (KV.f === 'club' && /club/i.test(c.tier)) || (KV.f === 'verein' && c.club) || (KV.f === 'news' && c.consent)));
  $('#kuCount').textContent = `${list.length} von ${CUSTOMERS.length} Kund:innen · ${DESKTOP ? 'lokale Datenbank' : 'Vorschau'}`;
  $('#kuTable').innerHTML = list.length ? `<table class="tbl art-tbl"><thead><tr><th style="padding-left:16px;width:52px"></th><th>Kunde</th><th>Kontakt</th><th>Stufe</th><th class="r">Punkte</th><th class="r">Einkäufe</th><th class="r">Umsatz</th><th>Zuletzt</th><th></th></tr></thead><tbody>${list.map(c => `
    <tr data-cust="${esc(c.id)}"><td style="padding-left:16px"><span class="avatar" style="--h:${c.hue}">${initials(c.name)}</span></td>
      <td><div style="font-weight:600">${esc(c.name)}</div><div class="muted" style="font-size:12px">${esc(c.id)}${c.consent ? " · Newsletter" : ""}</div></td>
      <td class="muted" style="font-size:12.5px">${esc(c.email || '–')}${c.phone ? `<br>${esc(c.phone)}` : ''}</td>
      <td><span class="pill ${/gold/i.test(c.tier) ? 'accent' : ''}" style="height:20px">${esc(c.tier)}</span>${c.club ? ` <span class="pill info" style="height:20px">${ic('flow')}−${c.club.pct} %</span>` : ''}</td>
      <td class="r num"><b>${num(c.points)}</b></td><td class="r num">${num(c.visits || 0)}</td><td class="r"><b>${eur(c.revenue || 0)}</b></td>
      <td class="muted">${esc(c.last)}</td><td class="r" style="padding-right:14px;color:var(--text-3)">${ic('chevron-right', 'i-sm')}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('users')}</div><h3>${CUSTOMERS.length ? 'Kein Treffer' : 'Noch keine Kund:innen'}</h3><p>${CUSTOMERS.length ? 'Suche oder Filter anpassen.' : 'Kund:innen hier oder direkt an der Kasse (F3 → Neu anlegen) erfassen.'}</p></div>`;
}

/* ── Anlegen / Bearbeiten ── */
function openCustomerEditor(c, {prefill = '', onSaved} = {}) {
  const isNew = !c;
  const pre = prefill.trim(), preMail = pre.includes('@');
  const st = c ? {name: c.name, email: c.email, phone: c.phone, tier: c.tier, clubName: c.club?.name || '', clubPct: c.club ? String(c.club.pct) : '', consent: c.consent, note: c.note || '', fields: Object.entries(c.fields || {})}
    : {name: preMail ? '' : pre, email: preMail ? pre : '', phone: '', tier: 'Kunde', clubName: '', clubPct: '', consent: false, note: '', fields: []};
  const el = openLayer(`<div class="drawer-panel" style="width:min(580px,100%)" role="dialog" aria-modal="true" aria-label="${isNew ? 'Neuer Kunde' : 'Kunde bearbeiten'}"><div id="ceHead"></div><div class="drawer-body" id="ceBody"></div>
    <div class="m-foot" style="border-top:1px solid var(--line);padding-top:14px">${isNew ? '' : `<button class="btn btn-danger" id="ceDel">${ic('trash', 'i-sm')}Deaktivieren</button>`}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="ceSave">${ic('check', 'i-sm')}${isNew && onSaved ? 'Anlegen & zuordnen' : 'Speichern'}</button></div></div>`, {cls: 'drawer', focus: st.name ? '[data-f="email"]' : '[data-f="name"]'});
  const collect = () => {
    $$('[data-f]', el).forEach(i => { st[i.dataset.f] = i.value; });
    st.fields = $$('.frow', el).map(r => [$('[data-fk]', r).value.trim(), $('[data-fv]', r).value.trim()]);
  };
  const tiers = TIERS.includes(st.tier) ? TIERS : [st.tier, ...TIERS];
  const render = () => {
    $('#ceHead', el).innerHTML = `<div class="m-head" style="padding-bottom:14px"><span class="avatar lg" style="--h:${c ? c.hue : 26}">${st.name.trim() ? initials(st.name) : ic('user-plus', 'i-sm')}</span><div><h2>${isNew ? 'Neue:r Kund:in' : esc(st.name)}</h2><p>${isNew ? 'Kundennummer wird beim Speichern vergeben' : `${esc(c.id)} · ${num(c.points)} Punkte · ${num(c.visits || 0)} Einkäufe`}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>`;
    $('#ceBody', el).innerHTML = `
      <div class="ed-grid">
        <label class="field full"><span>Name <b class="req">*</b></span><input class="input" data-f="name" value="${esc(st.name)}" placeholder="Vor- und Nachname" autocomplete="off"></label>
        <label class="field"><span>E-Mail</span><input class="input" data-f="email" type="email" value="${esc(st.email)}" placeholder="für digitale Belege" autocomplete="off"></label>
        <label class="field"><span>Telefon</span><input class="input" data-f="phone" value="${esc(st.phone)}" autocomplete="off"></label>
        <label class="field"><span>Kundenstufe</span><select class="input select" data-f="tier">${tiers.map(t => `<option ${t === st.tier ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <div></div>
        <label class="field"><span>Verein</span><input class="input" data-f="clubName" value="${esc(st.clubName)}" placeholder="z. B. SV Inntal"></label>
        <label class="field"><span>Vereinsrabatt %</span><input class="input num" data-f="clubPct" inputmode="numeric" value="${esc(st.clubPct)}" placeholder="0"></label>
        <label class="field full"><span>Notiz</span><textarea class="input" data-f="note" rows="2" style="height:auto;padding-top:9px;resize:vertical">${esc(st.note)}</textarea></label>
      </div>
      <div class="ed-sec"><div class="set-row" style="padding:12px 14px;border:1px solid var(--line);border-radius:12px"><div><div class="set-l">Newsletter & Angebote (Einwilligung)</div><div class="set-h">DSGVO: nur mit ausdrücklicher Zustimmung · jederzeit widerrufbar</div></div><div class="set-c" style="min-width:0"><button type="button" class="switch" role="switch" id="ceConsent" aria-checked="${st.consent}" aria-label="Einwilligung Newsletter"></button></div></div></div>
      <div class="ed-sec"><div class="lab">Eigene Felder <button type="button" class="btn btn-ghost btn-sm" id="ceAddF">${ic('plus', 'i-sm')}Feld</button></div>
        <div>${st.fields.map(([k, val]) => `<div class="frow"><input class="input" data-fk value="${esc(k)}" placeholder="Feld, z. B. Schuhgröße"><input class="input" data-fv value="${esc(val)}" placeholder="Wert"><button type="button" class="btn btn-ghost btn-icon" data-rmf aria-label="Feld entfernen">${ic('x', 'i-sm')}</button></div>`).join('') || '<div class="muted" style="font-size:12.5px">z. B. Schuhgröße, Skilänge, Konfektion – erscheinen an der Kasse beim Zuordnen.</div>'}</div></div>`;
  };
  el.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('#ceAddF')) { collect(); st.fields.push(['', '']); render(); $$('[data-fk]', el).pop()?.focus(); return; }
    const rmf = t.closest('[data-rmf]'); if (rmf) { collect(); st.fields.splice($$('.frow', el).indexOf(rmf.closest('.frow')), 1); return render(); }
    if (t.closest('#ceConsent')) { st.consent = !st.consent; $('#ceConsent', el).setAttribute('aria-checked', st.consent); return; }
    if (t.closest('#ceDel')) {
      try { await stepUp({title: 'Kund:in deaktivieren', text: `${c.name} wird aus Suche und Kasse entfernt. Belege bleiben aus rechtlichen Gründen erhalten.`}); } catch { return; }
      try { if (DESKTOP) await invoke('customer_delete', {id: c.id, user: S.user.name}); } catch (err) { return toast('Fehler', {t2: String(err), type: 'warn'}); }
      CUSTOMERS.splice(CUSTOMERS.indexOf(c), 1); if (POS.customer === c) detachCustomer();
      closeLayer(el); $$('.layer').forEach(l => l.querySelector('[data-cdetail]') && closeLayer(l));
      if (S.view === 'kunden') renderKunden();
      toast('Kund:in deaktiviert', {t2: c.name, icon: 'trash'}); Hooks.emit('customer.deactivated', {kunde: c.id}); return;
    }
    if (t.closest('#ceSave')) {
      collect();
      const fail = msg => toast(msg, {type: 'warn', icon: 'alert'});
      if (st.name.trim().length < 2) return fail('Name fehlt');
      if (st.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(st.email.trim())) return fail('E-Mail-Adresse ist ungültig');
      const pct = st.clubName.trim() ? parseInt(st.clubPct || '0', 10) : null;
      if (st.clubName.trim() && !(pct >= 0 && pct <= 50)) return fail('Vereinsrabatt: 0 bis 50 %');
      const data = {id: c?.id || '', name: st.name.trim(), email: st.email.trim(), phone: st.phone.trim(), tier: st.tier, points: c?.points || 0,
        club: st.clubName.trim() ? {name: st.clubName.trim(), pct} : null, consent: st.consent, note: st.note.trim(), fields: Object.fromEntries(st.fields.filter(([k]) => k))};
      const btn = $('#ceSave', el); btn.disabled = true;
      let saved;
      try {
        if (DESKTOP) saved = custFromDb(await invoke('customer_save', {customer: custToDb(data), user: S.user.name}));
        else saved = custFinish({...(c || {visits: 0, revenue: 0}), ...data, id: c?.id || `K-${11600 + CUSTOMERS.length + 1}`});
      } catch (err) { btn.disabled = false; return fail(String(err)); }
      if (c) { Object.assign(c, saved); saved = c; } else CUSTOMERS.unshift(saved);
      closeLayer(el);
      if (S.view === 'kunden') renderKunden();
      if (POS.customer === saved) renderCart();
      toast(isNew ? 'Kund:in angelegt' : 'Gespeichert', {t2: `${saved.name} · ${saved.id}`, type: 'pos', icon: 'user'});
      Hooks.emit('customer.saved', {kunde: saved.id, neu: isNew});
      onSaved && onSaved(saved);
    }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('#ceSave', el).click(); } });
  render();
}

/* ── Detail: Kaufhistorie & Punkte ── */
async function openCustomerDetail(c) {
  const el = openLayer(`<div class="drawer-panel" style="width:min(660px,100%)" role="dialog" aria-modal="true" aria-label="${esc(c.name)}" data-cdetail><div id="cdBody" style="display:flex;flex-direction:column;min-height:0;flex:1"></div></div>`, {cls: 'drawer'});
  let detail = {sales: MEM.sales.filter(s => s.data?.customer?.id === c.id), points: []};
  const load = async () => {
    if (DESKTOP) {
      try {
        const d = await invoke('customer_detail', {id: c.id});
        Object.assign(c, custFromDb(d.customer)); detail = d;
      } catch (e) { toast('Kundendaten nicht verfügbar', {t2: String(e), type: 'warn'}); }
    }
  };
  const render = () => {
    const box = $('#cdBody', el); if (!box) return;
    const fields = Object.entries(c.fields || {});
    box.innerHTML = `<div class="m-head" style="padding-bottom:12px"><span class="avatar lg" style="--h:${c.hue}">${initials(c.name)}</span><div><h2>${esc(c.name)}</h2><p>${esc(c.id)} · ${esc(c.tier)}${c.club ? ` · ${esc(c.club.name)} −${c.club.pct} %` : ''}${c.created ? ` · seit ${esc(c.created.toLocaleDateString('de-AT'))}` : ''}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="drawer-body" style="display:grid;gap:16px;align-content:start">
        <div class="kpis" style="margin:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr))"><div class="card" style="min-width:0"><b class="num">${num(c.points)}</b><span>Bonuspunkte</span></div><div class="card"><b class="num">${num(c.visits || 0)}</b><span>Einkäufe</span></div><div class="card"><b>${eur(c.revenue || 0)}</b><span>Umsatz gesamt</span></div><div class="card"><b>${esc(c.last)}</b><span>zuletzt</span></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="cdPos">${ic('register', 'i-sm')}An die Kasse</button><button class="btn btn-secondary" id="cdEdit">${ic('sliders', 'i-sm')}Bearbeiten</button><button class="btn btn-secondary" id="cdPts">${ic('star', 'i-sm')}Punkte korrigieren</button></div>
        <div class="card" style="padding:12px 16px;font-size:13px;display:grid;gap:6px">
          <div><span class="muted">E-Mail</span> &nbsp;${esc(c.email || '–')} &nbsp; <span class="muted">Telefon</span> &nbsp;${esc(c.phone || '–')}</div>
          <div><span class="muted">Newsletter</span> &nbsp;${c.consent ? '<span class="pill pos" style="height:20px">Einwilligung erteilt</span>' : '<span class="pill" style="height:20px">keine Einwilligung</span>'}</div>
          ${fields.length ? `<div class="cf" style="display:flex;gap:6px;flex-wrap:wrap">${fields.map(([k, v]) => `<span class="pill plain" style="height:22px">${esc(k)} <b style="color:var(--text)">${esc(v)}</b></span>`).join('')}</div>` : ''}
          ${c.note ? `<div class="muted" style="white-space:pre-line">${esc(c.note)}</div>` : ''}
        </div>
        <div><div class="eyebrow" style="margin-bottom:8px">Kaufhistorie</div><div class="card" style="overflow:hidden">${detail.sales.length ? detail.sales.map(s => `<button class="pal-i" style="height:54px;border-radius:0;border-bottom:1px solid var(--line)" data-sale="${esc(s.no)}"><span class="reg-ic" style="width:30px;height:30px">${ic(s.kind && s.kind !== 'verkauf' ? 'undo' : 'receipt', 'i-sm')}</span><span style="flex:1;min-width:0;text-align:left"><span style="display:block;color:var(--text);font-weight:550">${kindLabel(s)} ${esc(s.no)}${s.voided ? ' <span class="pill neg" style="height:18px">storniert</span>' : ''}</span><span style="display:block;font-size:12px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(fmtTs(s.ts))} · ${esc((s.data?.lines || []).map(l => l.name).join(', '))}</span></span><b class="num" style="color:${s.total < 0 ? 'var(--neg)' : 'var(--text)'}">${eur(s.total / 100)}</b></button>`).join('')
          : '<div class="empty" style="padding:28px 16px"><p>Noch keine Einkäufe mit Kundenkarte.</p></div>'}</div></div>
        <div><div class="eyebrow" style="margin-bottom:8px">Punkteverlauf</div><div class="card" style="overflow:hidden">${detail.points.length ? detail.points.map(p => `<div class="mv"><div><b>${esc(p.reason)}</b>${p.ref ? ` <span class="muted">· Bon ${esc(p.ref)}</span>` : ''}<br><small>${esc(fmtTs(p.ts))}${p.user ? ' · ' + esc(p.user) : ''}</small></div><div><div class="d ${p.delta > 0 ? 'p' : 'm'}">${p.delta > 0 ? '+' : ''}${num(p.delta)}</div><small>Stand ${num(p.balance)}</small></div></div>`).join('')
          : `<div class="empty" style="padding:28px 16px"><p>${DESKTOP ? 'Noch keine Punktebewegungen.' : 'Punkteverlauf nur in der Desktop-App.'}</p></div>`}</div>
          <div class="prompt-hint">${ic('info', 'i-xs')}1 Punkt je volle 10 € Einkauf · Retouren und Stornos ziehen die Punkte anteilig wieder ab.</div></div>
      </div>`;
  };
  el.addEventListener('click', async e => {
    if (e.target.closest('#cdPos')) { closeLayer(el); go('kasse'); attachCustomer(c); return; }
    if (e.target.closest('#cdEdit')) return openCustomerEditor(c, {onSaved: () => render()});
    if (e.target.closest('#cdPts')) return openPointsAdjust(c, async () => { await load(); render(); if (S.view === 'kunden') renderKuTable(); });
    const s = e.target.closest('[data-sale]'); if (s) openSaleView(s.dataset.sale);
  });
  render(); await load(); render();
}
function openPointsAdjust(c, done) {
  if (!DESKTOP) return toast('Nur in der Desktop-App', {t2: 'Punkte werden in der lokalen Datenbank geführt', type: 'warn', icon: 'star'});
  const st = {sign: 1, qty: '', reason: 'Kulanz'};
  const el = openLayer(`<div class="modal" style="width:min(460px,100%)" role="dialog" aria-modal="true" aria-label="Punkte korrigieren"><div id="ptBody"></div></div>`, {focus: '#ptQty'});
  const box = $('#ptBody', el);
  const render = () => {
    const n = parseInt(st.qty, 10) || 0, after = Math.max(0, c.points + st.sign * n);
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('star')}</div><div><h2>Punkte korrigieren</h2><p>${esc(c.name)} · Stand ${num(c.points)}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:16px">
        <div class="seg" id="ptSeg" style="justify-self:start"><button data-v="1" aria-pressed="${st.sign === 1}">Gutschreiben</button><button data-v="-1" aria-pressed="${st.sign === -1}">Abziehen</button></div>
        <div class="amt-field"><label for="ptQty">Punkte</label><div class="amt-input"><span>${st.sign > 0 ? '+' : '−'}</span><input id="ptQty" inputmode="numeric" value="${esc(st.qty)}" placeholder="0" autocomplete="off"></div></div>
        <div><div class="field"><span>Grund · wird protokolliert</span></div><div class="reasons" style="margin-top:6px">${['Kulanz', 'Aktion', 'Nachtrag Einkauf', 'Einlösung', 'Korrektur'].map(r => `<button class="chip" data-r="${r}" aria-pressed="${r === st.reason}">${r}</button>`).join('')}</div></div>
        <div class="preview-box"><span>Neuer Stand</span><b class="num">${num(c.points)} → ${num(after)}</b></div>
        <div class="prompt-hint">${ic('shield', 'i-xs')}Manuelle Korrekturen erfordern eine Freigabe durch die Filialleitung.</div>
      </div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="ptGo" ${n > 0 ? '' : 'disabled'}>${ic('shield', 'i-sm')}Freigeben & buchen</button></div>`;
    initSeg($('#ptSeg', box), b => { st.sign = +b.dataset.v; render(); $('#ptQty', box).focus(); });
  };
  const go2 = async () => {
    const n = parseInt(st.qty, 10); if (!(n > 0)) return;
    let ok; try { ok = await stepUp({title: 'Punkte korrigieren', text: `${st.sign > 0 ? '+' : '−'}${n} Punkte für ${c.name} (${st.reason})`}); } catch { return; }
    try { c.points = await invoke('customer_points', {id: c.id, delta: st.sign * n, reason: st.reason, user: S.user.name, approvedBy: ok.by.name}); }
    catch (e) { return toast('Buchung fehlgeschlagen', {t2: String(e), type: 'warn'}); }
    closeLayer(el); toast('Punkte gebucht', {t2: `${c.name} · neuer Stand ${num(c.points)}`, type: 'pos', icon: 'star'});
    Hooks.emit('loyalty.points.adjusted', {kunde: c.id, punkte: st.sign * n, grund: st.reason});
    done && done();
  };
  box.addEventListener('input', e => { if (e.target.id === 'ptQty') { st.qty = e.target.value.replace(/\D/g, '').slice(0, 6); render(); const i = $('#ptQty', box); i.focus(); i.setSelectionRange(st.qty.length, st.qty.length); } });
  box.addEventListener('click', e => { const r = e.target.closest('[data-r]'); if (r) { st.reason = r.dataset.r; render(); } if (e.target.closest('#ptGo')) go2(); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
  render();
}

function bindCustomers() {
  const v = $('#view-kunden');
  v.addEventListener('input', e => { if (e.target.id === 'kuQ') { KV.q = e.target.value; renderKuTable(); } });
  v.addEventListener('click', e => {
    if (e.target.closest('#kuNew')) return openCustomerEditor(null, {onSaved: c => openCustomerDetail(c)});
    const r = e.target.closest('[data-cust]'); if (r) { const c = custById(r.dataset.cust); c && openCustomerDetail(c); }
  });
}
