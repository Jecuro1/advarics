
/* ════════════════════════════════════════════════════════════════════
   29 · PREISAKTIONEN & INVENTUR
   ════════════════════════════════════════════════════════════════════ */
const PROMOS = [];
const today = () => dIso(new Date());
function promoActive(p, d = today()) { return p.active && p.from_date <= d && p.to_date >= d; }
function promoMatches(p, a) {
  if (p.scope === 'alle') return true;
  const v = p.scope_values || [];
  return p.scope === 'warengruppe' ? v.includes(a.cat) : p.scope === 'marke' ? v.includes(a.brand) : v.includes(a.id);
}
/* Bester gültiger Preis: dauerhafter Aktionspreis des Artikels oder laufende Preisaktion. */
function applyPromos() {
  const d = today();
  ART.forEach(a => {
    if (!('baseSale' in a)) a.baseSale = a.sale ?? null;
    let best = a.baseSale || a.price, promo = null;
    PROMOS.filter(p => promoActive(p, d) && promoMatches(p, a)).forEach(p => { const x = r2(a.price * (1 - p.pct / 100)); if (x < best - .001) { best = x; promo = p; } });
    a.sale = best < a.price - .001 ? best : undefined; a.promo = promo ? promo.name : null;
  });
}
async function loadPromos() {
  if (!DESKTOP) return;
  try { const l = await invoke('promotions_list'); PROMOS.length = 0; PROMOS.push(...l); applyPromos(); } catch (e) { console.error(e); }
}
const promoState = p => !p.active ? ['pausiert', ''] : p.to_date < today() ? ['beendet', ''] : p.from_date > today() ? ['geplant', 'info'] : ['läuft', 'pos'];
const scopeText = p => p.scope === 'alle' ? 'gesamtes Sortiment' : p.scope === 'warengruppe' ? p.scope_values.map(catName).join(', ') : p.scope === 'marke' ? p.scope_values.join(', ') : `${p.scope_values.length} Artikel`;

function renderAktionen() {
  const v = $('#view-aktionen');
  const affected = p => ART.filter(a => promoMatches(p, a)).length;
  v.innerHTML = `<div class="cv">
    <div class="cv-head"><div><h2 class="h-title">Preisaktionen</h2><div class="dash-meta" style="margin-top:6px"><span>Prozent-Aktionen mit Zeitraum · die Kasse nimmt automatisch den günstigsten gültigen Preis</span></div></div>
      <button class="btn btn-primary" id="prNew" ${DESKTOP ? '' : 'disabled'}>${ic('plus', 'i-sm')}Neue Aktion</button></div>
    <div class="kpis"><div class="card"><b class="num">${PROMOS.filter(p => promoState(p)[0] === 'läuft').length}</b><span>laufen heute</span></div><div class="card"><b class="num">${PROMOS.filter(p => promoState(p)[0] === 'geplant').length}</b><span>geplant</span></div><div class="card"><b class="num">${ART.filter(a => a.promo).length}</b><span>Artikel derzeit reduziert (Aktion)</span></div></div>
    <div class="card">${PROMOS.length ? `<table class="tbl art-tbl"><thead><tr><th style="padding-left:16px">Aktion</th><th>Status</th><th class="r">Nachlass</th><th>Gilt für</th><th>Zeitraum</th><th class="r">Artikel</th><th></th></tr></thead><tbody>${PROMOS.map(p => { const [t, tone] = promoState(p); return `<tr data-promo="${p.id}"><td style="padding-left:16px"><b>${esc(p.name)}</b></td><td><span class="pill ${tone}" style="height:20px">${t}</span></td><td class="r"><b>−${p.pct} %</b></td><td class="muted">${esc(scopeText(p))}</td><td class="muted">${esc(new Date(p.from_date + 'T12:00').toLocaleDateString('de-AT'))} – ${esc(new Date(p.to_date + 'T12:00').toLocaleDateString('de-AT'))}</td><td class="r num">${affected(p)}</td><td class="r" style="padding-right:14px;color:var(--text-3)">${ic('chevron-right', 'i-sm')}</td></tr>`; }).join('')}</tbody></table>`
      : `<div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('percent')}</div><h3>${DESKTOP ? 'Noch keine Preisaktionen' : 'Preisaktionen nur in der Desktop-App'}</h3><p>z. B. „Winter-Sale −20 % auf Jacken“ vom 1. bis 15. – Preise an der Kasse ändern sich automatisch.</p></div>`}</div></div>`;
}
function openPromo(p) {
  const st = p ? {...p, scope_values: [...p.scope_values]} : {name: '', pct: 20, scope: 'warengruppe', scope_values: [], from_date: today(), to_date: dIso(addDays(new Date(), 14)), active: true};
  let q = '';
  const brands = [...new Set(ART.map(a => a.brand).filter(Boolean))].sort();
  const el = openLayer(`<div class="modal" style="width:min(640px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Preisaktion"><div id="paBody" style="display:flex;flex-direction:column;min-height:0"></div></div>`, {focus: '#paName'});
  const box = $('#paBody', el);
  const preview = () => ART.filter(a => promoMatches(st, a));
  const render = () => {
    const opts = st.scope === 'warengruppe' ? CATS.filter(c => c.id !== 'alle').map(c => [c.id, c.name]) : st.scope === 'marke' ? brands.map(b => [b, b]) : st.scope === 'artikel' ? ART.filter(a => st.scope_values.includes(a.id) || (q && a.hay.includes(norm(q)))).slice(0, 24).map(a => [a.id, a.name]) : [];
    const pv = preview();
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('percent')}</div><div><h2>${p ? esc(p.name) : 'Neue Preisaktion'}</h2><p>${pv.length} Artikel betroffen</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:14px;overflow:auto">
        <div class="ed-grid"><label class="field full"><span>Name (erscheint am Bon)</span><input class="input" id="paName" value="${esc(st.name)}" placeholder="z. B. Winter-Sale Jacken"></label>
          <label class="field"><span>Von</span><input class="input" type="date" id="paFrom" value="${st.from_date}"></label><label class="field"><span>Bis (einschließlich)</span><input class="input" type="date" id="paTo" value="${st.to_date}"></label></div>
        <div><div class="field"><span>Nachlass</span></div><div class="opt-grid" style="margin-top:6px;grid-template-columns:repeat(7,1fr)">${[10, 15, 20, 25, 30, 40, 50].map(x => `<button class="opt" data-pct="${x}" aria-pressed="${x === st.pct}">−${x} %</button>`).join('')}</div></div>
        <div><div class="field"><span>Gilt für</span></div><div class="seg" id="paSeg" style="margin-top:6px">${[['alle', 'Alles'], ['warengruppe', 'Warengruppen'], ['marke', 'Marken'], ['artikel', 'Einzelne Artikel']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${st.scope === k}">${l}</button>`).join('')}</div></div>
        ${st.scope === 'artikel' ? `<label class="search-field" style="height:40px">${ic('search')}<input id="paQ" value="${esc(q)}" placeholder="Artikel suchen …" autocomplete="off"></label>` : ''}
        ${opts.length ? `<div class="reasons">${opts.map(([k, l]) => `<button class="chip" data-sv="${esc(k)}" aria-pressed="${st.scope_values.includes(k)}">${esc(l)}</button>`).join('')}</div>` : ''}
        <div class="set-row" style="padding:10px 12px;border:1px solid var(--line);border-radius:12px"><div><div class="set-l">Aktiv</div><div class="set-h">Ausschalten pausiert die Aktion, ohne sie zu löschen</div></div><div class="set-c" style="min-width:0"><button class="switch" role="switch" id="paAct" aria-checked="${st.active}" aria-label="Aktiv"></button></div></div>
        ${pv.length ? `<div class="prompt-hint">${ic('eye', 'i-xs')}Beispiele: ${pv.slice(0, 4).map(a => `${esc(a.name)} ${eur(a.price)} → <b>${eur(Math.min(a.baseSale || a.price, r2(a.price * (1 - st.pct / 100))))}</b>`).join(' · ')}</div>` : ''}
      </div>
      <div class="m-foot">${p ? `<button class="btn btn-danger" id="paDel">${ic('trash', 'i-sm')}Löschen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="paSave">${ic('check', 'i-sm')}Speichern</button></div>`;
    initSeg($('#paSeg', box), b => { st.scope = b.dataset.v; st.scope_values = []; render(); });
    if (q) { const i = $('#paQ', box); i.focus(); i.setSelectionRange(q.length, q.length); }
  };
  const sync = () => { st.name = $('#paName', box).value; st.from_date = $('#paFrom', box).value; st.to_date = $('#paTo', box).value; };
  box.addEventListener('input', e => { if (e.target.id === 'paQ') { sync(); q = e.target.value; render(); } });
  box.addEventListener('click', async e => {
    const pc = e.target.closest('[data-pct]'); if (pc) { sync(); st.pct = +pc.dataset.pct; return render(); }
    const sv = e.target.closest('[data-sv]'); if (sv) { sync(); const k = sv.dataset.sv, i = st.scope_values.indexOf(k); i >= 0 ? st.scope_values.splice(i, 1) : st.scope_values.push(k); return render(); }
    if (e.target.closest('#paAct')) { st.active = !st.active; e.target.closest('#paAct').setAttribute('aria-checked', st.active); return; }
    if (e.target.closest('#paDel')) { try { await stepUp({title: 'Aktion löschen', text: p.name}); const l = await invoke('promotion_delete', {id: p.id}); PROMOS.length = 0; PROMOS.push(...l); } catch (err) { if (!String(err).includes('abgebrochen')) toast('Nicht möglich', {t2: String(err), type: 'warn'}); return; } applyPromos(); closeLayer(el); renderAktionen(); return toast('Aktion gelöscht', {icon: 'trash'}); }
    if (e.target.closest('#paSave')) {
      sync();
      try { const l = await invoke('promotion_save', {promotion: {...st, id: p?.id ?? null, pct: +st.pct}, user: S.user.name}); PROMOS.length = 0; PROMOS.push(...l); }
      catch (err) { return toast('Speichern fehlgeschlagen', {t2: String(err), type: 'warn'}); }
      applyPromos(); closeLayer(el); renderAktionen();
      toast('Aktion gespeichert', {t2: `${st.name} · −${st.pct} % · ${preview().length} Artikel`, type: 'pos', icon: 'percent'});
      Hooks.emit('pricing.promotion.saved', {name: st.name, prozent: st.pct});
    }
  });
  render();
}

/* ── Inventur ── */
const IV = {cur: null, list: [], f: 'alle', q: ''};
async function loadInventories() {
  if (!DESKTOP) return;
  try { IV.list = await invoke('inventory_list'); const open = IV.list.find(i => i.status === 'offen'); IV.cur = open ? await invoke('inventory_get', {id: open.id}) : null; } catch (e) { toast('Inventur nicht verfügbar', {t2: String(e), type: 'warn'}); }
}
async function renderInventur() {
  const v = $('#view-inventur');
  if (!DESKTOP) { v.innerHTML = `<div class="cv"><div class="card"><div class="empty" style="padding:64px 20px"><div class="empty-icon">${ic('boxes')}</div><h3>Inventur nur in der Desktop-App</h3><p>Zähllisten und Buchungen brauchen die lokale Datenbank.</p></div></div></div>`; return; }
  await loadInventories(); if (S.view !== 'inventur') return;
  const c = IV.cur;
  if (!c) {
    const brands = [...new Set(ART.map(a => a.brand).filter(Boolean))].sort();
    v.innerHTML = `<div class="cv"><div class="cv-head"><div><h2 class="h-title">Inventur</h2><div class="dash-meta" style="margin-top:6px"><span>Zählen per Scanner oder Eingabe · Verkäufe während der Zählung werden berücksichtigt</span></div></div></div>
      <div class="card" style="padding:18px;display:grid;gap:12px;max-width:760px"><div class="set-l">Neue Inventur starten</div>
        <div class="ed-grid"><label class="field"><span>Warengruppe</span><select class="input select" id="ivCat"><option value="">alle</option>${CATS.filter(x => x.id !== 'alle').map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select></label>
          <label class="field"><span>Marke</span><select class="input select" id="ivBrand"><option value="">alle</option>${brands.map(b => `<option>${esc(b)}</option>`).join('')}</select></label></div>
        <div class="prompt-hint">${ic('info', 'i-xs')}Der Sollbestand wird beim Start festgehalten. Abschluss bucht nur die Differenzen (Grund „Inventur“).</div>
        <div><button class="btn btn-primary" id="ivStart">${ic('boxes', 'i-sm')}Inventur starten</button></div></div>
      <div class="card" style="margin-top:14px">${IV.list.length ? `<table class="tbl art-tbl"><thead><tr><th style="padding-left:16px">Inventur</th><th>Status</th><th>Zeitpunkt</th><th class="r">gezählt</th><th class="r">Plus</th><th class="r">Minus</th><th class="r">Differenz VK</th><th class="r" style="padding-right:16px">Differenz EK</th></tr></thead><tbody>${IV.list.map(i => `<tr><td style="padding-left:16px"><b>${esc(i.no)}</b><div class="muted" style="font-size:12px">${esc(i.user || '')}</div></td><td><span class="pill ${i.status === 'abgeschlossen' ? 'pos' : ''}" style="height:20px">${esc(i.status)}</span></td><td class="muted">${esc(fmtTs(i.closed_at || i.created_at))}</td><td class="r num">${i.counted} / ${i.lines}</td><td class="r num">${i.result ? '+' + i.result.plus : '–'}</td><td class="r num">${i.result ? '−' + i.result.minus : '–'}</td><td class="r">${i.result ? eur(i.result.value_vk / 100) : '–'}</td><td class="r" style="padding-right:16px">${i.result ? eur(i.result.value_ek / 100) : '–'}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty" style="padding:40px 20px"><p>Noch keine Inventuren.</p></div>'}</div></div>`;
    return;
  }
  const done = c.lines.filter(l => l.counted != null).length;
  v.innerHTML = `<div class="cv">
    <div class="cv-head"><div><h2 class="h-title">Inventur ${esc(c.no)}</h2><div class="dash-meta" style="margin-top:6px"><span>gestartet ${esc(fmtTs(c.created_at))} · ${esc(c.user || '')}</span>${c.scope?.cat ? `<span>·</span><span>${esc(catName(c.scope.cat))}</span>` : ''}${c.scope?.brand ? `<span>·</span><span>${esc(c.scope.brand)}</span>` : ''}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost" id="ivPrint">${ic('printer', 'i-sm')}Zählliste</button><button class="btn btn-secondary" id="ivDiscard">${ic('x', 'i-sm')}Verwerfen</button><button class="btn btn-primary" id="ivFinish">${ic('check', 'i-sm')}Abschließen</button></div></div>
    <div class="kpis" id="ivKpis"></div>
    <div class="cv-tools"><label class="search-field" style="flex:0 1 420px">${ic('barcode')}<input id="ivScan" placeholder="EAN scannen (+1) oder Artikel suchen …" autocomplete="off" value="${esc(IV.q)}"></label>
      <div class="seg" id="ivSeg">${[['alle', 'Alle'], ['offen', 'Ungezählt'], ['gezaehlt', 'Gezählt'], ['diff', 'Differenzen']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${IV.f === k}">${l}</button>`).join('')}</div>
      <span class="muted" style="font-size:12.5px;margin-left:auto">${done} von ${c.lines.length} gezählt</span></div>
    <div class="card" id="ivList"></div></div>`;
  initSeg($('#ivSeg', v), b => { IV.f = b.dataset.v; renderIvList(); });
  renderIvList(); setTimeout(() => $('#ivScan')?.focus(), 60);
}
function ivKpis() {
  const c = IV.cur, k = $('#ivKpis'); if (!k) return;
  const counted = c.lines.filter(l => l.counted != null), diff = counted.reduce((s, l) => s + (l.counted - l.expected), 0);
  const vk = counted.reduce((s, l) => s + (l.counted - l.expected) * l.price, 0), ek = counted.reduce((s, l) => s + (l.counted - l.expected) * (l.cost || 0), 0);
  k.innerHTML = `<div class="card"><b class="num">${counted.length} / ${c.lines.length}</b><span>Varianten gezählt</span></div><div class="card"><b class="num">${num(counted.reduce((s, l) => s + l.counted, 0))}</b><span>Stück gezählt</span></div><div class="card"><b class="num" style="color:${diff < 0 ? 'var(--neg)' : diff > 0 ? 'var(--pos)' : 'inherit'}">${diff > 0 ? '+' : ''}${num(diff)}</b><span>Differenz Stück (gezählt)</span></div><div class="card"><b>${eur(vk / 100)}</b><span>Differenz VK</span></div><div class="card"><b>${eur(ek / 100)}</b><span>Differenz EK</span></div>`;
}
function renderIvList() {
  const c = IV.cur, box = $('#ivList'); if (!c || !box) return;
  ivKpis();
  const toks = norm(IV.q.trim()).split(/\s+/).filter(t => t && !/^\d{8,13}$/.test(t));
  const rows = c.lines.filter(l => (IV.f === 'alle' || (IV.f === 'offen' && l.counted == null) || (IV.f === 'gezaehlt' && l.counted != null) || (IV.f === 'diff' && l.counted != null && l.counted !== l.expected))
    && toks.every(t => norm(`${l.name} ${l.article_id} ${colorName(l.color)} ${l.size} ${l.ean}`).includes(t)));
  box.innerHTML = rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Artikel</th><th>EAN</th><th class="r">Soll</th><th class="r">Gezählt</th><th class="r" style="padding-right:16px">Differenz</th></tr></thead><tbody>${rows.slice(0, 400).map(l => { const d = l.counted == null ? null : l.counted - l.expected; return `<tr data-ivv="${l.variant_id}"><td style="padding-left:16px"><b>${esc(l.name)}</b><div class="muted" style="font-size:12px">${esc(colorName(l.color))} · ${esc(l.size)}</div></td><td class="mono" style="font-size:12px">${esc(l.ean)}</td><td class="r num">${l.expected}</td><td class="r"><input class="input num" data-ivc="${l.variant_id}" value="${l.counted ?? ''}" placeholder="–" inputmode="numeric" style="width:70px;height:30px;text-align:right"></td><td class="r num" style="padding-right:16px;font-weight:650;color:${d == null ? 'var(--text-3)' : d < 0 ? 'var(--neg)' : d > 0 ? 'var(--pos)' : 'inherit'}">${d == null ? '–' : (d > 0 ? '+' : '') + d}</td></tr>`; }).join('')}</tbody></table>${rows.length > 400 ? `<div class="muted" style="padding:10px 16px">… ${rows.length - 400} weitere – Suche verwenden</div>` : ''}`
    : '<div class="empty" style="padding:40px"><p>Keine Positionen in diesem Filter.</p></div>';
}
async function ivCount(args, quiet) {
  try {
    const r = await invoke('inventory_count', {id: IV.cur.id, ...args});
    const l = IV.cur.lines.find(x => x.variant_id === r.variant_id); if (l) l.counted = r.counted;
    if (!quiet) { renderIvList(); const tr = $(`[data-ivv="${r.variant_id}"]`); tr?.classList.add('flash'); tr?.scrollIntoView({block: 'nearest'}); }
    else ivKpis();
    return r;
  } catch (e) { toast('Nicht gezählt', {t2: String(e), type: 'warn', icon: 'barcode'}); return null; }
}
function bindStockViews() {
  const av = $('#view-aktionen');
  av.addEventListener('click', e => { if (e.target.closest('#prNew')) return openPromo(null); const r = e.target.closest('[data-promo]'); if (r) openPromo(PROMOS.find(p => p.id === +r.dataset.promo)); });
  const iv = $('#view-inventur');
  iv.addEventListener('click', async e => {
    if (e.target.closest('#ivStart')) {
      const scope = {cat: $('#ivCat').value, brand: $('#ivBrand').value};
      try { IV.cur = await invoke('inventory_start', {scope, user: S.user.name}); } catch (err) { return toast('Start nicht möglich', {t2: String(err), type: 'warn'}); }
      toast(`Inventur ${IV.cur.no} gestartet`, {t2: `${IV.cur.lines.length} Varianten in der Zählliste`, type: 'pos', icon: 'boxes'}); Hooks.emit('inventory.started', {inventur: IV.cur.no});
      return renderInventur();
    }
    if (e.target.closest('#ivDiscard')) { try { await stepUp({title: 'Inventur verwerfen', text: `${IV.cur.no} – Zählungen gehen verloren, Bestand bleibt unverändert`}); await invoke('inventory_discard', {id: IV.cur.id}); } catch (err) { if (!String(err).includes('abgebrochen')) toast('Nicht möglich', {t2: String(err), type: 'warn'}); return; } toast('Inventur verworfen', {icon: 'x'}); return renderInventur(); }
    if (e.target.closest('#ivPrint')) {
      const c = IV.cur, rows = c.lines.map(l => `<tr><td>${esc(l.name)}<br><span class="muted">${esc(colorName(l.color))} · ${esc(l.size)}</span></td><td class="muted" style="font-family:monospace">${esc(l.ean)}</td><td class="r">${l.expected}</td><td style="width:22mm;border-bottom:1px solid #999"></td></tr>`).join('');
      return printHTML(`<h1>Zählliste ${esc(c.no)}</h1><p class="muted">${esc(CFG['firma.name'])} · gestartet ${esc(fmtTs(c.created_at))}${c.scope?.cat ? ' · ' + esc(catName(c.scope.cat)) : ''}</p><table><thead><tr><th>Artikel</th><th>EAN</th><th class="r">Soll</th><th>Gezählt</th></tr></thead><tbody>${rows}</tbody></table>`, `Zählliste ${c.no}`);
    }
    if (e.target.closest('#ivFinish')) {
      const c = IV.cur, open = c.lines.filter(l => l.counted == null).length;
      let zero = false;
      const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Inventur abschließen">
        <div class="m-head"><div class="m-ic">${ic('check')}</div><div><h2>Inventur ${esc(c.no)} abschließen</h2><p>${c.lines.length - open} von ${c.lines.length} Varianten gezählt</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
        <div class="m-body" style="display:grid;gap:12px">${open ? `<div class="set-row" style="padding:10px 12px;border:1px solid var(--line);border-radius:12px"><div><div class="set-l">${open} ungezählte Varianten auf 0 setzen</div><div class="set-h">Aus: Bestand bleibt unverändert (Teilinventur)</div></div><div class="set-c" style="min-width:0"><button class="switch" role="switch" id="ivZero" aria-checked="false" aria-label="Ungezählte auf 0"></button></div></div>` : ''}
          <div class="rule-box">${ic('shield')}<div>Die Differenzen werden als Bestandsbuchung „Inventur“ festgeschrieben. Freigabe durch die Filialleitung nötig.</div></div></div>
        <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="ivGo">${ic('shield', 'i-sm')}Freigeben & buchen</button></div></div>`);
      el.addEventListener('click', async ev => {
        if (ev.target.closest('#ivZero')) { zero = !zero; ev.target.closest('#ivZero').setAttribute('aria-checked', zero); return; }
        if (!ev.target.closest('#ivGo')) return;
        let by; try { by = (await stepUp({title: 'Inventur buchen', text: `${c.no}${zero ? ' · Ungezählte auf 0' : ''}`})).by.name; } catch { return; }
        let r; try { r = await invoke('inventory_finish', {id: c.id, zeroUncounted: zero, user: S.user.name, approvedBy: by}); } catch (err) { return toast('Abschluss fehlgeschlagen', {t2: String(err), type: 'warn'}); }
        closeLayer(el); await loadCatalog(); applyPromos();
        toast('Inventur gebucht', {t2: `${r.booked} Varianten korrigiert · +${r.plus} / −${r.minus} Stück · ${eur(r.value_vk / 100)} VK`, type: 'pos', icon: 'boxes', dur: 7000});
        Hooks.emit('inventory.finished', {inventur: c.no, ...r});
        renderInventur();
      });
    }
  });
  iv.addEventListener('keydown', async e => {
    if (e.target.id !== 'ivScan' || e.key !== 'Enter') return;
    e.preventDefault(); const raw = e.target.value.trim();
    if (/^\d{8,13}$/.test(raw)) { const r = await ivCount({ean: raw, qty: 1, add: true}); e.target.value = ''; IV.q = ''; if (r) { const l = IV.cur.lines.find(x => x.variant_id === r.variant_id); toast(`${l.name} · ${colorName(l.color)} ${l.size}`, {t2: `gezählt ${r.counted} · Soll ${r.expected}`, icon: 'barcode', dur: 1600}); } renderIvList(); }
  });
  iv.addEventListener('input', e => { if (e.target.id === 'ivScan') { IV.q = e.target.value; if (!/^\d{8,}$/.test(IV.q.trim())) renderIvList(); } });
  iv.addEventListener('change', e => { const vid = e.target.dataset.ivc; if (vid == null) return; const n = parseInt(e.target.value, 10); if (!Number.isFinite(n) || n < 0) return; ivCount({variantId: +vid, qty: n, add: false}, true).then(r => { if (r) { const tr = e.target.closest('tr'), d = r.counted - r.expected, td = tr.lastElementChild; td.textContent = (d > 0 ? '+' : '') + d; td.style.color = d < 0 ? 'var(--neg)' : d > 0 ? 'var(--pos)' : 'inherit'; } }); });
}
