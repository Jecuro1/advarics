
/* ════════════════════════════════════════════════════════════════════
   10 · KASSE (POS)
   Offline-first gedacht: Warenkorb, Signatur (Smartcard) und Beleg
   funktionieren ohne Server; Sync & Webhooks laufen über eine Warteschlange.
   ════════════════════════════════════════════════════════════════════ */
const POS = {cart: [], customer: null, sel: null, cat: 'alle', q: '', kb: -1, list: [], billDisc: null, parked: [], no: 4718, last: null, lastKey: null, lastNew: false, shown: 0,
  flow: {clubRule: true, prompts: true, approval: true, approvalPct: 20}};
const belegNo = (n = POS.no) => `${YEAR}-${pad(n, 6)}`;
const cartCount = () => POS.cart.reduce((s, l) => s + l.qty, 0);
const discOf = a => a.sale ? Math.round((1 - a.sale / a.price) * 100) : 0;

function totals() {
  let sub = 0, ldisc = 0; const byRate = {};
  POS.cart.forEach(l => { const g = r2(l.unit * l.qty), d = l.disc ? r2(g * l.disc.pct / 100) : 0; sub += g; ldisc += d; byRate[l.vat] = (byRate[l.vat] || 0) + g - d; });
  let bdisc = 0;
  if (POS.billDisc) Object.keys(byRate).forEach(k => { if (+k > 0) { const d = r2(byRate[k] * POS.billDisc.pct / 100); byRate[k] -= d; bdisc += d; } });
  const total = r2(sub - ldisc - bdisc);
  const vat = Object.entries(byRate).filter(([k, g]) => +k > 0 && g > 0).map(([k, g]) => ({rate: +k, gross: r2(g), net: r2(g / (1 + k / 100)), tax: r2(g - g / (1 + k / 100))}));
  return {sub: r2(sub), disc: r2(ldisc + bdisc), total, vat, zero: r2(byRate[0] || 0), points: Math.floor(total / 10)};
}

function renderPOS() {
  const v = $('#view-kasse');
  const fk = [['F2', 'Suche', 'focus'], ['F3', 'Kunde', 'cust'], ['F4', 'Rabatt', 'disc'], ['F8', 'Parken', 'park'], ['F9', 'Bezahlen', 'pay'], ['F10', 'Sperren', 'lock']];
  v.innerHTML = `<div class="pos-root ${S.online ? '' : 'is-offline'}" id="pos">
    <div class="pos-main">
      <div class="offline-banner" role="status">${ic('wifi-off')}<p><b>Offline-Modus.</b> Der Verkauf läuft lokal weiter – Belege werden per Smartcard RKSV-signiert und automatisch synchronisiert. <span id="qInfo"></span></p><button class="btn btn-secondary btn-sm" id="reconnect" style="margin-left:auto;flex:none">${ic('sync', 'i-sm')}Verbinden</button></div>
      <div class="pos-head">
        <div class="pos-search">
          <label class="search-field">${ic('search')}<input id="posSearch" placeholder="Artikel suchen oder EAN scannen …" autocomplete="off" spellcheck="false" aria-label="Artikel suchen oder EAN scannen" aria-controls="agrid"><span class="kbd">F2</span><span class="scanline" id="scanline"></span></label>
          <button class="btn btn-secondary" id="scanBtn" style="height:50px;border-radius:12px;padding:0 14px" data-tip="Scanner simulieren" data-tip-pos="down">${ic('barcode')}<span class="hide-sm">Scan</span></button>
          <div class="view-toggle" role="group" aria-label="Darstellung der Artikel"><button data-mode="media" aria-pressed="${prefs.tiles === 'media'}" aria-label="Kacheln mit Bild">${ic('grid')}</button><button data-mode="compact" aria-pressed="${prefs.tiles === 'compact'}" aria-label="Kompakte Kacheln">${ic('list')}</button></div>
        </div>
        <div class="cats" id="cats" role="toolbar" aria-label="Warengruppen"></div>
        <div class="quick" id="quick" aria-label="Schnellwahl"></div>
      </div>
      <div class="grid-meta"><span id="gridInfo"></span><span class="hide-sm">Sortiert nach Beliebtheit · <span class="kbd">↓</span> <span class="kbd">↵</span></span></div>
      <div class="grid-wrap" id="gridWrap"><div class="agrid" id="agrid" role="list"></div></div>
      <div class="fbar">${fk.map(([k, l, a]) => `<button class="fk" data-fk="${a}"><span class="kbd">${k}</span>${l}</button>`).join('')}<button class="fk" data-fk="palette"><span class="kbd">${MOD} K</span>Befehle</button><button class="fk flow" data-fk="flow">${ic('flow', 'i-sm')}Kassenablauf: Standard</button></div>
    </div>
    <aside class="cart" id="cart" aria-label="Warenkorb">
      <div class="cart-head"><h2>Warenkorb</h2><span class="count" id="cartCount">0</span><div class="tools"><button class="btn btn-ghost btn-sm btn-icon" id="parkBtn" data-tip="Parken · F8" data-tip-pos="down" aria-label="Bon parken">${ic('pause', 'i-sm')}</button><button class="btn btn-ghost btn-sm btn-icon" id="clearBtn" data-tip="Leeren" data-tip-pos="down" aria-label="Warenkorb leeren">${ic('trash', 'i-sm')}</button></div></div>
      <div class="cust" id="cust"></div>
      <div class="lines" id="lines" role="list" aria-label="Positionen"></div>
      <div id="totals"></div>
      <div class="cart-acts"><button class="btn btn-secondary" id="discBtn">${ic('percent', 'i-sm')}Rabatt</button><button class="btn btn-secondary" id="park2Btn">${ic('pause', 'i-sm')}Parken</button><button class="btn btn-secondary" id="moreBtn" aria-haspopup="menu">Mehr ${ic('chevron-down', 'i-sm')}</button></div>
      <button class="paybtn" id="payBtn" disabled>${ic('card')}<span>Bezahlen</span><span class="kbd">F9</span><span class="amt" id="payAmt">${eur(0)}</span></button>
    </aside>
    <button class="cart-toggle" id="cartToggle">${ic('bag')}<span id="ctCount">0 Artikel</span><span class="amt num" id="ctAmt">${eur(0)}</span></button>
  </div>`;
  $('#posSearch').value = POS.q;
  POS.shown = totals().total;
  renderCats(); renderQuick(); renderGrid(); renderCart(); updateQueueInfo();
}
function renderCats() {
  const cnt = id => id === 'alle' ? ART.length : ART.filter(a => a.cat === id).length;
  $('#cats').innerHTML = CATS.map(c => `<button class="cat" data-cat="${c.id}" aria-pressed="${!POS.q && POS.cat === c.id}">${c.name}<span class="n">${cnt(c.id)}</span></button>`).join('');
}
function renderQuick() {
  $('#quick').innerHTML = SERVICES.map(s => `<button class="qb" data-svc="${s.id}"><span class="qi">${ic(s.icon, 'i-sm')}</span><span><span class="qn" style="display:block">${s.name}</span><span class="qp" style="display:block">${s.price == null ? 'Betrag wählen' : eur(s.price)}</span></span></button>`).join('')
    + `<button class="qb cfg" data-fk="flow">${ic('plus', 'i-sm')}Schnellwahl anpassen</button>`;
}
function filtered() {
  const q = norm(POS.q.trim());
  if (!q) return POS.cat === 'alle' ? ART : ART.filter(a => a.cat === POS.cat);
  const toks = q.split(/\s+/);
  return ART.filter(a => toks.every(t => a.hay.includes(t)) || a.variants.some(v => v.ean.startsWith(q)));
}
function tileHTML(a, i) {
  const c = COLORS[a.colors[0]][1], st = a.stock;
  const [cls, txt] = st <= 0 ? ['out', 'Ausverkauft'] : st <= 6 ? ['low', `Nur ${st}`] : ['ok', `${st} lagernd`];
  const badge = a.sale ? `<span class="tb sale">−${discOf(a)} %</span>` : a.tag ? `<span class="tb new">${a.tag}</span>` : '<span></span>';
  const sw = a.colors.length > 1 ? `<span class="swatches">${a.colors.slice(0, 4).map(k => `<i style="background:${COLORS[k][1]}"></i>`).join('')}</span>` : '';
  return `<button class="tile ${st <= 0 ? 'out' : ''}" data-id="${a.id}" role="listitem" style="--c:${c};animation-delay:${Math.min(i, 18) * 22}ms" aria-label="${esc(a.name)}, ${esc(eur(a.sale || a.price))}, ${txt}">
    <div class="tile-media"><div class="tile-badges">${badge}${sw}</div>${artVisual(a, c)}</div>
    <div class="tile-body"><span class="tile-brand">${esc(a.brand)}</span><span class="tile-name">${esc(a.name)}</span>
      <span class="tile-foot"><span class="price" ${a.sale ? 'style="color:var(--accent)"' : ''}>${eur(a.sale || a.price)}</span><span class="stock ${cls}"><span class="dot"></span>${txt}</span></span></div></button>`;
}
function renderGrid() {
  const list = filtered(); POS.list = list;
  const g = $('#agrid'); if (!g) return;
  g.className = 'agrid' + (prefs.tiles === 'compact' ? ' compact' : '');
  g.innerHTML = list.length ? list.map(tileHTML).join('')
    : `<div class="empty" style="grid-column:1/-1;padding:64px 20px"><div class="empty-icon">${ic('search')}</div><h3>Keine Treffer für „${esc(POS.q)}“</h3><p>EAN prüfen, anders schreiben – oder den Artikel im gesamten Filialnetz suchen.</p><button class="btn btn-secondary btn-sm" id="searchAll">${ic('store', 'i-sm')}In allen Filialen suchen</button></div>`;
  $('#gridInfo').textContent = POS.q ? `${list.length} Treffer für „${POS.q}“` : `${list.length} Artikel · ${CATS.find(c => c.id === POS.cat).name}`;
  POS.kb = POS.q && list.length ? 0 : -1; markKb();
}
function markKb() {
  $$('#agrid .tile').forEach((t, i) => t.classList.toggle('kb', i === POS.kb));
  const t = $$('#agrid .tile')[POS.kb]; t && t.scrollIntoView({block: 'nearest', behavior: reduced() ? 'auto' : 'smooth'});
}
function gridCols() { const g = $('#agrid'); return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 1; }

/* ── Warenkorb ── */
function lineHTML(l) {
  const c = l.c ? COLORS[l.c][1] : 'var(--text-3)';
  const g = r2(l.unit * l.qty), d = l.disc ? r2(g * l.disc.pct / 100) : 0;
  const varTxt = l.service ? esc(l.meta || 'Dienstleistung') : `<i class="sw" style="background:${c}"></i>${COLORS[l.c][0]}${l.s !== 'Einheitsgröße' ? ` · Gr. ${esc(l.s)}` : ''}`;
  const extra = [l.disc ? `<span class="disc-tag">−${num(l.disc.pct, Number.isInteger(+l.disc.pct) ? 0 : 1)} %${l.disc.auto ? ` · ${esc(l.disc.reason)}` : ''}</span>` : '', l.was && !l.disc ? `<span class="disc-tag">Aktion</span>` : '',
    l.vals ? Object.entries(l.vals).filter(([, v]) => v).map(([k, v]) => `<span class="pill" style="height:18px;font-size:10.5px;padding:0 6px">${esc((SKI_PROMPTS.find(p => p.key === k) || {label: k}).label.split(' ')[0])} ${esc(v)}</span>`).join('') : '',
    l.seller ? `<span class="pill" style="height:18px;font-size:10.5px;padding:0 6px">${ic('user')}${esc(l.seller.split(' ')[0])}</span>` : ''].join('');
  const cls = ['line', POS.sel === l.key ? 'sel' : '', POS.lastKey === l.key ? (POS.lastNew ? 'new' : 'flash') : ''].join(' ');
  return `<div class="${cls}" data-key="${esc(l.key)}" role="listitem" tabindex="0" aria-label="${esc(l.name)}, Menge ${l.qty}, ${esc(eur(g - d))}">
    <span class="thumb" style="--c:${l.service ? 'var(--text-3)' : c}">${l.service ? ic(l.icon) : artVisual(l.art, c)}</span>
    <div style="min-width:0"><div class="line-name">${esc(l.name)}</div><div class="line-var">${varTxt}${extra}</div></div>
    <div class="line-right"><div class="line-total">${eur(g - d)}${d || l.was ? `<s>${eur(l.was ? l.was * l.qty : g)}</s>` : ''}</div>
      <div class="qty"><button data-q="-1" aria-label="Menge verringern">${ic('minus', 'i-xs')}</button><span>${l.qty}</span><button data-q="1" aria-label="Menge erhöhen">${ic('plus', 'i-xs')}</button></div></div>
    <div class="line-acts"><button class="btn btn-secondary btn-sm" data-la="disc">${ic('percent', 'i-sm')}Rabatt</button><button class="btn btn-secondary btn-sm" data-la="seller">${ic('user', 'i-sm')}Verkäufer:in</button>${l.art ? `<button class="btn btn-secondary btn-sm" data-la="variant">${ic('swap', 'i-sm')}Variante</button>` : ''}<button class="btn btn-danger btn-sm btn-icon" data-la="rm" style="margin-left:auto" aria-label="Position entfernen" data-tip="Entfernen · Entf">${ic('trash', 'i-sm')}</button></div>
  </div>`;
}
function renderCustomer() {
  const c = POS.customer, el = $('#cust'); if (!el) return;
  el.innerHTML = c ? `<div class="cust-card"><span class="avatar lg" style="--h:${c.hue}">${initials(c.name)}</span><div class="meta"><div class="t1">${esc(c.name)}</div><div class="t2">${esc(c.tier)} · ${num(c.points)} Punkte · ${esc(c.id)}</div><div class="cf">${Object.entries(c.fields).map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('')}</div></div><button class="btn btn-ghost btn-sm btn-icon" id="custRm" aria-label="Kunde entfernen">${ic('x', 'i-sm')}</button></div>`
    : `<button class="cust-empty" id="custAdd">${ic('user-plus', 'i-sm')}Kunde zuordnen<span class="kbd">F3</span></button>`;
}
function renderCart() {
  updateNavBadge();
  const L = $('#lines'); if (!L) return;
  const t = totals(), n = cartCount();
  const cc = $('#cartCount'); if (cc.textContent !== String(n)) { cc.textContent = n; bump(cc); }
  renderCustomer();
  L.innerHTML = POS.cart.length ? POS.cart.map(lineHTML).join('')
    : `<div class="cart-empty"><div class="empty"><div class="empty-icon">${ic('bag', 'i-lg')}</div><h3>Bereit für den nächsten Verkauf</h3><p>Artikel scannen, suchen oder antippen.<br>Schnellste Wege: <span class="kbd">F2</span> Suche · <span class="kbd">↵</span> übernehmen</p>${POS.last ? `<div class="last-bon">${ic('receipt', 'i-xs')}Letzter Bon ${POS.last.no.slice(-4)} · ${eur(POS.last.total)} · <button id="reprint">Kopie drucken</button></div>` : ''}</div></div>`;
  $('#totals').innerHTML = POS.cart.length ? `<div class="totals">
    <div class="trow"><span>Zwischensumme · ${n} Artikel</span><b>${eur(t.sub)}</b></div>
    ${t.disc > 0 ? `<div class="trow disc"><span>Rabatt${POS.billDisc ? ` · Bon −${POS.billDisc.pct} %${POS.billDisc.rule ? ' (Regel)' : ''}` : ''}</span><b>− ${eur(t.disc)}</b></div>` : ''}
    ${t.vat.map(v => `<div class="trow"><span>enthaltene MwSt ${v.rate} %</span><b>${eur(v.tax)}</b></div>`).join('')}
    ${t.zero ? `<div class="trow"><span>Gutschein (umsatzsteuerfrei)</span><b>${eur(t.zero)}</b></div>` : ''}
    ${POS.customer ? `<div class="trow pts"><span>Gipfel-Punkte für diesen Einkauf</span><span>+${t.points}</span></div>` : ''}
    <div class="tgrand"><span class="lbl">Gesamt</span><span class="val num" id="tval">${eur(POS.shown)}</span></div></div>` : '';
  tweenTotal(t.total);
  $('#payBtn').disabled = !POS.cart.length; $('#payAmt').textContent = eur(t.total);
  $('#ctCount').textContent = `${n} Artikel`; $('#ctAmt').textContent = eur(t.total);
  if (POS.lastKey) { const el = $(`.line[data-key="${CSS.escape(POS.lastKey)}"]`); el && el.scrollIntoView({block: 'nearest', behavior: reduced() ? 'auto' : 'smooth'}); }
  POS.lastKey = null;
}
function tweenTotal(to) {
  const el = $('#tval'), from = POS.shown; POS.shown = to;
  if (!el) return;
  if (reduced() || Math.abs(to - from) < .005) { el.textContent = eur(to); return; }
  const t0 = performance.now(), dur = 380;
  const step = now => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = eur(from + (to - from) * e); if (p < 1 && POS.shown === to) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function bump(el) { if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 340); }
function updateNavBadge() { const b = $('#navCart'); if (!b) return; const n = cartCount(); b.hidden = !n; b.textContent = n; }
function fly(fromEl, color) {
  const target = $('#cartCount');
  if (!fromEl || !target || reduced() || !document.contains(fromEl) || !target.offsetParent) return;
  const src = $('.tile-media svg, .tile-media img', fromEl) || fromEl, a = src.getBoundingClientRect(), b = target.getBoundingClientRect();
  const dot = document.createElement('div'); dot.className = 'fly'; dot.style.background = color;
  dot.style.left = (a.left + a.width / 2 - 9) + 'px'; dot.style.top = (a.top + a.height / 2 - 9) + 'px';
  document.body.appendChild(dot);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  dot.animate([{transform: 'translate(0,0) scale(1.5)', opacity: 1}, {transform: `translate(${dx * .5}px,${dy * .5 - 110}px) scale(1)`, opacity: 1, offset: .5}, {transform: `translate(${dx}px,${dy}px) scale(.35)`, opacity: .4}], {duration: 640, easing: 'cubic-bezier(.45,0,.25,1)'}).onfinish = () => dot.remove();
}

function openArticle(a, fromEl, preset) {
  if (a.variants.length === 1 && !(a.prompts && POS.flow.prompts)) {
    const v = a.variants[0];
    if (v.q <= 0) return openVariant(a, fromEl);
    return addLine(a, v.c, v.s, 1, null, fromEl);
  }
  openVariant(a, fromEl, preset);
}
function addLine(a, c, s, qty = 1, vals = null, fromEl = null) {
  const hasVals = vals && Object.values(vals).some(Boolean);
  const key = `${a.id}|${c}|${s}` + (hasVals ? '|' + uid() : '');
  let l = POS.cart.find(x => x.key === key);
  if (l) { l.qty += qty; POS.lastNew = false; }
  else { l = {key, art: a, name: a.name, c, s, qty, unit: a.sale || a.price, was: a.sale ? a.price : null, vat: a.vat ?? 20, disc: null, vals: hasVals ? vals : null}; POS.cart.push(l); POS.lastNew = true; }
  POS.lastKey = key; POS.sel = null;
  fly(fromEl, COLORS[c][1]);
  renderCart();
  Hooks.emit('pos.line.added', {beleg: belegNo(), sku: a.id, ean: variant(a, c, s).ean, variante: `${COLORS[c][0]} / ${s}`, menge: qty, preis: l.unit, warengruppe: a.cat, felder: hasVals ? vals : undefined});
}
function addService(id, amount, fromEl) {
  const s = SERVICES.find(x => x.id === id);
  if (id === 'GS' && amount == null) return openVoucherSale();
  const isGS = id === 'GS';
  const key = isGS ? 'gs|' + uid() : 'svc|' + id;
  let l = POS.cart.find(x => x.key === key);
  if (l) { l.qty++; POS.lastNew = false; }
  else { l = {key, service: true, voucher: isGS, icon: s.icon, name: isGS ? 'Gutschein (Mehrzweck)' : s.name, unit: isGS ? amount : s.price, vat: isGS ? 0 : 20, qty: 1, meta: isGS ? (DESKTOP ? 'Code wird beim Abschluss vergeben' : `Code GS-${YEAR}-${1000 + Math.floor(Math.random() * 8999)}`) : 'Dienstleistung'}; POS.cart.push(l); POS.lastNew = true; }
  POS.lastKey = key; renderCart();
  Hooks.emit('pos.line.added', {beleg: belegNo(), sku: id, bezeichnung: l.name, preis: l.unit, ust: l.vat});
}
function changeQty(key, delta) {
  const l = POS.cart.find(x => x.key === key); if (!l) return;
  l.qty += delta;
  if (l.qty <= 0) return removeLine(key);
  POS.lastKey = key; POS.lastNew = false; renderCart();
}
function removeLine(key) {
  const i = POS.cart.findIndex(x => x.key === key); if (i < 0) return;
  const el = $(`.line[data-key="${CSS.escape(key)}"]`);
  const [l] = POS.cart.splice(i, 1); if (POS.sel === key) POS.sel = null;
  const done = () => { renderCart(); toast(`${l.name} entfernt`, {icon: 'trash', action: {label: 'Rückgängig', run: () => { POS.cart.splice(i, 0, l); POS.lastKey = l.key; POS.lastNew = true; renderCart(); }}}); };
  Hooks.emit('pos.line.removed', {beleg: belegNo(), bezeichnung: l.name, menge: l.qty});
  if (el && !reduced()) el.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateX(18px)'}], {duration: 180, easing: 'ease-in'}).onfinish = done; else done();
}
function selectLine(key) { POS.sel = POS.sel === key ? null : key; $$('#lines .line').forEach(el => el.classList.toggle('sel', el.dataset.key === POS.sel)); }
function newSale(silent) {
  if (S.view === 'kasse') renderGrid();
  POS.cart = []; POS.customer = null; POS.billDisc = null; POS.sel = null; POS.shown = 0;
  renderCart(); renderTopbar();
  if (!silent) toast('Neuer Verkauf', {t2: `Bon ${belegNo()}`, icon: 'plus'});
  setTimeout(() => $('#posSearch')?.focus(), 50);
}

/* ── Scan, Suche ── */
function simulateScan() {
  const input = $('#posSearch'); if (!input) return;
  const pool = ART.flatMap(a => a.variants.filter(v => v.q > 0).map(v => ({a, v}))), pick = pool[Math.floor(Math.random() * pool.length)];
  input.value = pick.v.ean; POS.q = ''; const sl = $('#scanline'); sl.classList.remove('go'); void sl.offsetWidth; sl.classList.add('go');
  Hooks.emit('device.scanner.read', {geraet: 'Handscanner HS-1 (USB-HID)', ean: pick.v.ean});
  setTimeout(() => { handleEnter(); }, reduced() ? 0 : 280);
}
function handleEnter() {
  const input = $('#posSearch'), raw = input.value.trim();
  if (/^\d{8,13}$/.test(raw)) {
    for (const a of ART) { const v = a.variants.find(x => x.ean === raw); if (v) {
      if (a.prompts && POS.flow.prompts) { openVariant(a, null, {c: v.c, s: v.s}); }
      else addLine(a, v.c, v.s, 1, null, $(`.tile[data-id="${a.id}"]`));
      input.value = ''; POS.q = ''; renderGrid(); renderCats(); return; } }
    toast('EAN nicht gefunden', {t2: raw, type: 'warn', icon: 'barcode'}); input.select(); return;
  }
  const a = POS.list[POS.kb >= 0 ? POS.kb : 0];
  if (a && (POS.kb >= 0 || POS.list.length === 1 || raw)) openArticle(a, $$('#agrid .tile')[POS.kb >= 0 ? POS.kb : 0]);
}

/* ── Variantenwahl ── */
function openVariant(a, fromEl, preset) {
  const oneSize = a.sizes.length === 1;
  const firstAvail = c => (a.variants.find(v => v.c === c && v.q > 0) || a.variants.find(v => v.c === c)).s;
  const st = {c: preset?.c || (a.variants.find(v => v.q > 0) || a.variants[0]).c, s: preset?.s, qty: 1, vals: {}};
  st.s = st.s || firstAvail(st.c);
  const el = openLayer('<div class="modal vp" role="dialog" aria-modal="true"></div>', {focus: '#vpAdd'});
  const box = $('.vp', el); box.setAttribute('aria-label', a.name);
  const prompts = a.prompts && POS.flow.prompts ? a.prompts : null;
  const render = focusSel => {
    const c = COLORS[st.c][1], v = variant(a, st.c, st.s), price = a.sale || a.price;
    box.innerHTML = `<div class="vp-media" style="--c:${c}">${a.sale ? `<span class="tb sale">−${discOf(a)} %${a.promo ? ' · ' + esc(a.promo) : ''}</span>` : a.tag ? `<span class="tb new">${a.tag}</span>` : ''}${artVisual(a, c)}<div class="fields">${Object.entries(a.fields || {}).map(([k, x]) => `<span>${esc(k)} <b>${esc(x)}</b></span>`).join('')}</div></div>
      <div class="vp-main">
        <div style="display:flex;align-items:flex-start;gap:8px"><div style="flex:1;min-width:0"><div class="vp-brand">${esc(a.brand)} · ${a.id}</div><div class="vp-name">${esc(a.name)}</div></div><button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Schließen">${ic('x')}</button></div>
        <div class="vp-price">${eur(price)}${a.sale ? `<s>${eur(a.price)}</s>` : ''}</div>
        ${a.colors.length > 1 ? `<div class="vp-sec"><div class="lab">Farbe <span>${COLORS[st.c][0]} · <span class="kbd">↑</span><span class="kbd">↓</span></span></div><div class="colors">${a.colors.map(k => `<button class="cbtn" data-c="${k}" aria-pressed="${k === st.c}" style="--sw:${COLORS[k][1]}"><i></i>${COLORS[k][0]}</button>`).join('')}</div></div>` : ''}
        ${!oneSize ? `<div class="vp-sec"><div class="lab">Größe <span>Bestand Innsbruck · <span class="kbd">←</span><span class="kbd">→</span></span></div><div class="sizes">${a.sizes.map(s => { const x = variant(a, st.c, s); return `<button class="sbtn ${x.q <= 0 ? 'so' : ''}" data-s="${esc(s)}" aria-pressed="${s === st.s}"><span class="sz">${esc(s)}</span><small class="${x.q > 0 && x.q <= 2 ? 'low' : ''}">${x.q <= 0 ? 'ausverkauft' : x.q + ' Stk.'}</small></button>`; }).join('')}</div></div>` : ''}
        <div class="elsewhere">${ic('store', 'i-xs')}${v.other ? `${oneSize ? `${esc(storeObj().name)} <b style="color:var(--text);margin:0 4px">${v.q}</b> ·` : `Gr. ${esc(st.s)} in`} anderen Filialen: ${OTHER_STORES.map((s, i) => `<span>${s.name} <b>${v.other[i]}</b></span>`).join('')}` : `Bestand hier: <b style="color:var(--text);margin:0 4px">${v.q}</b> · EAN ${esc(v.ean)} · ${DESKTOP ? 'Einzelplatz · Filialverbund unter Einstellungen' : 'andere Filialen sichtbar, sobald der Filial-Server verbunden ist'}`}</div>
        ${prompts ? `<div class="vp-sec"><div class="lab">Kassenablauf „Skiverkauf“ <span>benutzerdefinierte Felder</span></div><div class="prompts">${prompts.map(p => `<label class="field"><span>${esc(p.label)}${p.req ? ' <b class="req">*</b>' : ''}</span><input class="input" data-p="${p.key}" placeholder="${esc(p.ph)}" value="${esc(st.vals[p.key] || '')}" ${p.type === 'number' ? 'inputmode="decimal"' : ''}></label>`).join('')}</div><div class="prompt-hint">${ic('flow', 'i-xs')}Pflichtfelder je Warengruppe – im Kassenablauf konfiguriert, ohne Code.</div></div>` : ''}
        <div class="vp-foot">
          <div class="qty" style="height:48px;border-radius:12px"><button data-q="-1" style="width:44px;height:46px" aria-label="Menge verringern">${ic('minus', 'i-sm')}</button><span style="min-width:28px;font-size:15px">${st.qty}</span><button data-q="1" style="width:44px;height:46px" aria-label="Menge erhöhen">${ic('plus', 'i-sm')}</button></div>
          ${v.q <= 0 ? `<button class="btn btn-secondary" id="vpAdd" style="flex:1;height:48px;border-radius:12px" data-transfer>${ic('swap', 'i-sm')}Umlagerung anfragen</button>` : `<button class="btn btn-primary" id="vpAdd">Hinzufügen · ${eur(price * st.qty)}<span class="kbd">↵</span></button>`}
        </div>
      </div>`;
    const f = focusSel && $(focusSel, box); (f || $('#vpAdd', box)).focus({preventScroll: true});
  };
  const add = () => {
    const v = variant(a, st.c, st.s);
    if (v.q <= 0 && !v.other) { closeLayer(el); toast('Nicht lagernd', {t2: DESKTOP ? 'Bestand unter „Bestand“ oder „Wareneingang“ buchen' : 'Umlagerungen zwischen Filialen folgen mit dem Filial-Server · Bestand unter „Bestand“ buchen', type: 'warn', icon: 'boxes'}); return; }
    if (v.q <= 0) { const best = OTHER_STORES.map((s, i) => [s, v.other[i]]).sort((x, y) => y[1] - x[1])[0]; closeLayer(el); if (DESKTOP) { if (best && best[1] > 0) requestTransfer(a, v, best[0].id); else toast('Nirgends lagernd', {t2: 'Auch in den anderen Filialen kein Bestand', type: 'warn', icon: 'boxes'}); return; } toast('Umlagerung angefragt', {t2: `${a.name} · ${COLORS[st.c][0]} ${st.s} · ${best[0].name} → Innsbruck`, type: 'pos', icon: 'swap'}); Hooks.emit('inventory.transfer.requested', {sku: a.id, von: best[0].id, nach: 'INN', menge: 1}); return; }
    if (prompts) {
      $$('[data-p]', box).forEach(i => { st.vals[i.dataset.p] = i.value.trim(); });
      const miss = prompts.find(p => p.req && !st.vals[p.key]);
      if (miss) { const inp = $(`[data-p="${miss.key}"]`, box); inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.focus(); toast(`Pflichtfeld: ${miss.label}`, {t2: 'Vom Kassenablauf „Skiverkauf“ verlangt', type: 'warn', icon: 'flow'}); return; }
    }
    closeLayer(el); addLine(a, st.c, st.s, st.qty, prompts ? {...st.vals} : null, fromEl);
  };
  box.addEventListener('click', e => {
    const c = e.target.closest('[data-c]'), s = e.target.closest('[data-s]'), q = e.target.closest('[data-q]');
    if (c) { st.c = c.dataset.c; if (variant(a, st.c, st.s).q === 0) st.s = firstAvail(st.c); render(`[data-c="${st.c}"]`); }
    else if (s) { st.s = s.dataset.s; render(`[data-s="${CSS.escape(st.s)}"]`); }
    else if (q) { st.qty = clamp(st.qty + +q.dataset.q, 1, 99); render(`[data-q="${q.dataset.q}"]`); }
    else if (e.target.closest('#vpAdd')) add();
  });
  box.addEventListener('input', e => { const p = e.target.dataset.p; if (p) st.vals[p] = e.target.value; });
  el.addEventListener('keydown', e => {
    const inField = isTyping(e.target);
    if (e.key === 'Enter' && !e.target.closest('[data-close]')) { e.preventDefault(); return add(); }
    if (inField) return;
    const si = a.sizes.indexOf(st.s), ci = a.colors.indexOf(st.c);
    if (e.key === 'ArrowRight' && !oneSize) { st.s = a.sizes[Math.min(a.sizes.length - 1, si + 1)]; render(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && !oneSize) { st.s = a.sizes[Math.max(0, si - 1)]; render(); e.preventDefault(); }
    else if (e.key === 'ArrowDown' && a.colors.length > 1) { st.c = a.colors[(ci + 1) % a.colors.length]; render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && a.colors.length > 1) { st.c = a.colors[(ci - 1 + a.colors.length) % a.colors.length]; render(); e.preventDefault(); }
    else if (e.key === '+') { st.qty = Math.min(99, st.qty + 1); render(); }
    else if (e.key === '-') { st.qty = Math.max(1, st.qty - 1); render(); }
  });
  render(prompts ? '[data-p="z"]' : null);
}

/* ── Kunde ── */
function openCustomers() {
  const el = openLayer(`<div class="modal" style="width:min(560px,100%)" role="dialog" aria-modal="true" aria-label="Kunde zuordnen">
    <div class="m-head"><div class="m-ic">${ic('users')}</div><div><h2>Kunde zuordnen</h2><p>Name, Kundennummer, E-Mail – oder Kundenkarte scannen</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="padding-bottom:6px"><input class="input" id="custQ" placeholder="Suchen …" autocomplete="off" style="height:44px" role="combobox" aria-controls="custList" aria-expanded="true"><div id="custList" role="listbox" style="margin:10px -8px 0;max-height:min(360px,48vh);overflow:auto"></div></div>
    <div class="m-foot"><button class="btn btn-ghost" id="custNew">${ic('user-plus', 'i-sm')}Neu anlegen</button><span class="sp"></span><span class="muted" style="font-size:12px">${num(CUSTOMERS.length)} Kund:innen · ${DESKTOP ? 'lokale Datenbank' : 'Vorschau'}</span></div></div>`, {focus: '#custQ'});
  let sel = 0, list = [];
  const render = () => {
    const toks = norm($('#custQ', el).value.trim()).split(/\s+/).filter(Boolean);
    list = CUSTOMERS.filter(c => custMatches(c, toks)).slice(0, 60); sel = clamp(sel, 0, Math.max(0, list.length - 1));
    $('#custList', el).innerHTML = list.map((c, i) => `<button class="pal-i" style="height:58px" role="option" data-i="${i}" aria-selected="${i === sel}"><span class="avatar" style="--h:${c.hue}">${initials(c.name)}</span><span style="min-width:0;flex:1"><span style="display:block;color:var(--text);font-weight:550">${esc(c.name)}</span><span style="display:block;font-size:12px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.id)} · ${esc(c.email)} · zuletzt ${esc(c.last)}</span></span><span class="hint">${c.club ? `<span class="pill accent" style="height:20px">${ic('flow')}Regel</span>` : ''}<span class="pill" style="height:20px">${esc(c.tier)}</span></span></button>`).join('')
      || `<div class="empty"><p>Kein Treffer – <b>Neu anlegen</b> übernimmt die Eingabe.</p></div>`;
  };
  const pick = i => { const c = list[i]; if (!c) return; closeLayer(el); attachCustomer(c); };
  $('#custQ', el).addEventListener('input', () => { sel = 0; render(); });
  $('#custQ', el).addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); list.length ? pick(sel) : $('#custNew', el).click(); }
  });
  $('#custList', el).addEventListener('click', e => { const b = e.target.closest('[data-i]'); b && pick(+b.dataset.i); });
  $('#custNew', el).onclick = () => { const q = $('#custQ', el).value; closeLayer(el); setTimeout(() => openCustomerEditor(null, {prefill: q, onSaved: attachCustomer}), 60); };
  render();
}
function attachCustomer(c) {
  POS.customer = c;
  if (POS.billDisc?.rule) POS.billDisc = null;
  Hooks.emit('pos.customer.attached', {beleg: belegNo(), kunde: c.id, stufe: c.tier});
  if (c.club && POS.flow.clubRule) {
    POS.billDisc = {pct: c.club.pct, reason: c.club.name, rule: true};
    toast(`Regel angewendet: ${c.club.name}`, {t2: `−${c.club.pct} % auf den Bon · Workflow „Vereinsrabatt“`, icon: 'flow', type: 'accent'});
    Hooks.emit('rule.applied', {regel: 'Vereinsrabatt', prozent: c.club.pct, kunde: c.id});
  } else toast(`${c.name} zugeordnet`, {t2: `${c.tier} · ${num(c.points)} Punkte`, icon: 'user', type: 'pos'});
  renderCart();
}
function detachCustomer() {
  if (!POS.customer) return;
  if (POS.billDisc?.rule) POS.billDisc = null;
  POS.customer = null; renderCart();
}

/* ── Rabatt mit Step-up-Freigabe ── */
function openDiscount() {
  if (!POS.cart.length) return toast('Warenkorb ist leer', {type: 'warn', icon: 'percent'});
  const line = POS.cart.find(l => l.key === POS.sel);
  const st = {target: line ? 'line' : 'bill', pct: (line ? line.disc?.pct : POS.billDisc?.pct) || 10, reason: line?.disc?.reason || 'Kulanz'};
  const limit = POS.flow.approval ? POS.flow.approvalPct : 100;
  const el = openLayer(`<div class="modal" style="width:min(540px,100%)" role="dialog" aria-modal="true" aria-label="Rabatt gewähren"><div id="dBody"></div></div>`);
  const box = $('#dBody', el);
  const preview = () => {
    const saveL = line && line.disc, saveB = POS.billDisc;
    if (st.target === 'line') line.disc = {pct: st.pct}; else POS.billDisc = {pct: st.pct};
    const t = totals(); if (line) line.disc = saveL; POS.billDisc = saveB; return t;
  };
  const render = () => {
    const t = preview(), cur = totals(), needs = st.pct > limit;
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('percent')}</div><div><h2>Rabatt gewähren</h2><p>${st.target === 'line' ? `Position: ${esc(line.name)}` : `Ganzer Bon · ${cartCount()} Artikel`}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:18px">
        ${line ? `<div class="seg" id="dTarget" style="justify-self:start"><button data-t="line" aria-pressed="${st.target === 'line'}">Position</button><button data-t="bill" aria-pressed="${st.target === 'bill'}">Ganzer Bon</button></div>` : ''}
        <div><div class="field"><span>Prozent</span></div><div class="opt-grid" style="margin-top:6px">${[5, 10, 15, 20, 25, 30].map(p => `<button class="opt ${p > limit ? 'lock' : ''}" data-pct="${p}" aria-pressed="${p === st.pct}">${p} %</button>`).join('')}</div></div>
        <div><div class="field"><span>Grund · wird im Beleg und Audit-Log gespeichert</span></div><div class="reasons" style="margin-top:6px">${['Kulanz', 'Mitarbeiterrabatt', 'Mangelware', 'Aktion', 'Stammkunde'].map(r => `<button class="chip" data-r="${r}" aria-pressed="${r === st.reason}">${r}</button>`).join('')}</div></div>
        <div class="preview-box"><span>Neuer Betrag<br><span class="muted" style="font-size:12px">statt ${eur(cur.total)}</span></span><b>${eur(t.total)}</b></div>
        ${needs ? `<div class="rule-box">${ic('shield')}<div>Rabatte über ${limit} % erfordern eine Freigabe durch die Filialleitung.<br><span class="muted">Regel <code>rabatt.freigabe &gt; ${limit} %</code> · Workflow-Designer › Kasse</span></div></div>` : ''}
      </div>
      <div class="m-foot">${(st.target === 'line' ? line?.disc : POS.billDisc) ? `<button class="btn btn-ghost" id="dRemove">${ic('trash', 'i-sm')}Entfernen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="dApply">${needs ? `${ic('shield', 'i-sm')}Freigabe anfordern` : 'Anwenden'}<span class="kbd">↵</span></button></div>`;
    initSeg($('#dTarget', box), b => { st.target = b.dataset.t; render(); });
  };
  const apply = by => {
    const d = {pct: st.pct, reason: st.reason, by};
    if (st.target === 'line') line.disc = d; else POS.billDisc = d;
    closeLayer(el); renderCart();
    toast(`Rabatt ${st.pct} % gewährt`, {t2: `${st.target === 'line' ? line.name : 'Ganzer Bon'} · ${st.reason}${by ? ` · freigegeben von ${by}` : ''}`, type: 'pos', icon: 'percent'});
    Hooks.emit('pos.discount.applied', {beleg: belegNo(), ziel: st.target === 'line' ? line.art?.id || line.name : 'bon', prozent: st.pct, grund: st.reason, freigabe: by || null});
  };
  const go2 = () => {
    if (st.pct > limit) {
      Hooks.emit('pos.discount.requested', {beleg: belegNo(), prozent: st.pct, grenze: limit, regel: 'rabatt.freigabe'});
      stepUp({title: 'Freigabe erforderlich', text: `Rabatt ${st.pct} % (${st.reason}) – über der Grenze von ${limit} %.`, rule: `Regel „rabatt.freigabe > ${limit} %“ · im Workflow-Designer änderbar`}).then(r => apply(r.by.name)).catch(() => {});
    } else apply();
  };
  box.addEventListener('click', e => {
    const p = e.target.closest('[data-pct]'), r = e.target.closest('[data-r]');
    if (p) { st.pct = +p.dataset.pct; render(); $(`[data-pct="${st.pct}"]`, box)?.focus(); }
    else if (r) { st.reason = r.dataset.r; render(); }
    else if (e.target.closest('#dApply')) go2();
    else if (e.target.closest('#dRemove')) { if (st.target === 'line') line.disc = null; else POS.billDisc = null; closeLayer(el); renderCart(); toast('Rabatt entfernt', {icon: 'percent'}); }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('[data-close]') && !e.target.closest('#dRemove')) { e.preventDefault(); go2(); } });
  render();
}
/* ── Parken, Gutschein, Kassenablauf ── */
function park() {
  if (!POS.cart.length) return toast('Nichts zu parken', {type: 'warn', icon: 'pause'});
  POS.parked.push({id: uid(), cart: POS.cart, customer: POS.customer, billDisc: POS.billDisc, total: totals().total, n: cartCount()});
  Hooks.emit('pos.cart.parked', {beleg: belegNo(), positionen: POS.cart.length, summe: totals().total});
  POS.cart = []; POS.customer = null; POS.billDisc = null; POS.sel = null;
  renderCart(); renderParked();
  toast('Bon geparkt', {t2: 'Fortsetzen über die Leiste oben', icon: 'pause'});
}
function renderParked() {
  const el = $('#parked'); if (!el) return;
  el.innerHTML = POS.parked.map(p => `<button class="pchip" data-park="${p.id}" title="Bon fortsetzen">${ic('pause')}${p.customer ? esc(p.customer.name.split(' ')[0]) : 'Geparkt'} · ${p.n} Art. · ${eur(p.total)}</button>`).join('');
}
function resume(id) {
  const i = POS.parked.findIndex(p => p.id === id); if (i < 0) return;
  const [p] = POS.parked.splice(i, 1);
  if (POS.cart.length) POS.parked.push({id: uid(), cart: POS.cart, customer: POS.customer, billDisc: POS.billDisc, total: totals().total, n: cartCount()});
  POS.cart = p.cart; POS.customer = p.customer; POS.billDisc = p.billDisc; POS.sel = null;
  renderCart(); renderParked(); toast('Bon fortgesetzt', {icon: 'undo', type: 'pos'});
}
function openVoucherSale() {
  let amt = 50;
  const el = openLayer(`<div class="modal" style="width:min(460px,100%)" role="dialog" aria-modal="true" aria-label="Gutschein verkaufen">
    <div class="m-head"><div class="m-ic">${ic('gift')}</div><div><h2>Gutschein verkaufen</h2><p>Mehrzweckgutschein · umsatzsteuerfrei bei Ausgabe (RKSV: Satz-Null)</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body"><div class="opt-grid" style="grid-template-columns:repeat(5,1fr)">${[25, 50, 100, 150, 200].map(v => `<button class="opt" data-v="${v}" aria-pressed="${v === amt}">${v} €</button>`).join('')}</div>
      <div class="amt-field" style="margin-top:14px"><label>Eigener Betrag</label><div class="amt-input"><span>€</span><input id="gsAmt" inputmode="decimal" value="50,00"></div></div></div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="gsAdd">Hinzufügen<span class="kbd">↵</span></button></div></div>`, {focus: '#gsAdd'});
  const inp = $('#gsAmt', el);
  const add = () => { const v = parseAmt(inp.value); if (!(v > 0)) { inp.closest('.amt-input').classList.add('shake'); return; } closeLayer(el); addService('GS', r2(v)); };
  el.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { amt = +b.dataset.v; inp.value = num(amt, 2); $$('[data-v]', el).forEach(x => x.setAttribute('aria-pressed', x === b)); } if (e.target.closest('#gsAdd')) add(); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
}
function openFlow() {
  const f = POS.flow;
  const steps = [
    ['barcode', 'Artikel erfassen', 'Scan, Suche, Schnellwahl (5 Kacheln) · Varianten mit Bestand je Filiale', null],
    ['user', 'Kunde', 'Optional · Kundenkarte oder Suche · Regel „Vereinsrabatt“ automatisch anwenden', 'clubRule'],
    ['flow', 'Pflichtfelder je Warengruppe', 'Ski & Touren: Z-Wert Bindung (Pflicht), Seriennummer', 'prompts'],
    ['percent', 'Rabatte', `Bis ${f.approvalPct} % frei, darüber Step-up-Freigabe durch Filialleitung`, 'approval'],
    ['card', 'Zahlung', '8 Zahlungsarten · Teilzahlungen · Terminal T-01 (ZVT)', null],
    ['shield', 'RKSV-Signatur & DEP', 'Gesetzlich vorgeschrieben – nicht abschaltbar', 'lock'],
    ['receipt', 'Beleg', 'Druck, QR oder E-Mail · Vorlage wählbar', null],
  ];
  const el = openLayer(`<div class="modal" style="width:min(620px,100%)" role="dialog" aria-modal="true" aria-label="Kassenablauf">
    <div class="m-head"><div class="m-ic">${ic('flow')}</div><div><h2>Kassenablauf · Standard</h2><p>Gilt für Kasse ${esc(CFG['kasse.id'] || 'INN-K01')} · Version 14 · zuletzt geändert von David Huber</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:8px">${steps.map(([i, t, d, k], n) => `<div class="ops-row" style="padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)"><span class="reg-ic" style="width:30px;height:30px">${ic(i, 'i-sm')}</span><div class="k"><b>${n + 1} · ${t}</b>${d}</div>${k === 'lock' ? `<span class="pill">${ic('lock')}fix</span>` : k ? `<button class="switch" role="switch" data-flow="${k}" aria-checked="${f[k]}" aria-label="${t}"></button>` : '<span class="pill plain">Standard</span>'}</div>`).join('')}
      <div class="prompt-hint" style="margin-top:6px">${ic('braces', 'i-xs')}Jeder Schritt feuert Hooks – eigene Skripte, Regeln und Webhooks können eingreifen.</div></div>
    <div class="m-foot"><button class="btn btn-ghost" id="flowJson">${ic('code', 'i-sm')}Als JSON</button><span class="sp"></span><button class="btn btn-primary" data-close>Fertig</button></div></div>`);
  el.addEventListener('click', e => {
    const s = e.target.closest('[data-flow]');
    if (s) { const k = s.dataset.flow; f[k] = !f[k]; s.setAttribute('aria-checked', f[k]); saveSettings({[{clubRule: 'kasse.vereinsregel', prompts: 'kasse.pflichtfelder', approval: 'kasse.freigabe'}[k]]: f[k]}, true); Hooks.emit('config.flow.changed', {ablauf: 'Standard', schritt: k, aktiv: f[k]}); toast(f[k] ? 'Schritt aktiviert' : 'Schritt deaktiviert', {t2: 'Sofort wirksam an dieser Kasse · versioniert', icon: 'flow'}); }
    if (e.target.closest('#flowJson')) toast('kontor.kassenablauf/v1', {t2: JSON.stringify({kundeRegelVerein: f.clubRule, pflichtfelderSki: f.prompts, rabattFreigabeAb: f.approval ? f.approvalPct : null}), icon: 'code', dur: 6000});
  });
}
function openMore(anchor) {
  const el = openPopover(anchor, `<button class="pop-i" data-m="gs">${ic('gift')}Gutschein verkaufen</button><button class="pop-i" data-m="ret">${ic('undo')}Retoure / Umtausch<span class="r muted" style="font-size:11.5px">mit Beleg</span></button><button class="pop-i" data-m="rcpts">${ic('receipt')}Belege<span class="r muted" style="font-size:11.5px">${DESKTOP ? 'gespeichert' : 'Sitzung'}</span></button><button class="pop-i" data-m="copy">${ic('printer')}Belegkopie drucken</button><button class="pop-i" data-m="drawer">${ic('cash')}Lade öffnen<span class="r muted" style="font-size:11.5px">protokolliert</span></button><button class="pop-i" data-m="book">${ic('cash')}Kassenbuch<span class="r muted" style="font-size:11.5px">Einlage · Entnahme</span></button><button class="pop-i" data-m="x">${ic('receipt')}X-Bericht (Zwischenstand)</button><button class="pop-i" data-m="z">${ic('lock')}Tagesabschluss</button><div class="pop-sep"></div>${DESKTOP ? '' : `<button class="pop-i" data-m="net">${ic(S.online ? 'wifi-off' : 'wifi')}${S.online ? 'Offline-Modus simulieren' : 'Verbindung wiederherstellen'}</button>`}<button class="pop-i" data-m="flow">${ic('flow')}Kassenablauf bearbeiten</button>`, {align: 'right', width: 260});
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return; closePopover();
    ({gs: openVoucherSale, ret: openReturnStart, rcpts: () => openReceipts(), copy: reprint, drawer: () => openDrawer('manuell'), book: openCashBook, z: openClosing,
      x: xReport, net: () => setOnline(!S.online), flow: openFlow})[b.dataset.m]();
  });
}
function reprint() {
  if (!POS.last) return toast('Noch kein Beleg in dieser Sitzung', {type: 'warn', icon: 'receipt'});
  if (DESKTOP && POS.lastRec) { Hooks.emit('pos.receipt.copy', {beleg: POS.last.no}); return printReceipt(POS.lastRec, {copy: true}); }
  toast(`Belegkopie ${POS.last.no}`, {t2: 'Als „KOPIE“ gekennzeichnet · RKSV-konform', icon: 'printer'});
  Hooks.emit('pos.receipt.copy', {beleg: POS.last.no});
}

/* ── Netz / Offline ── */
function updateQueueInfo() { const q = $('#qInfo'); if (q) q.textContent = S.queue ? `${S.queue} Beleg${S.queue > 1 ? 'e' : ''} in der Warteschlange.` : ''; }
function setOnline(on) {
  if (S.online === on) return;
  S.online = on;
  $('#pos')?.classList.toggle('is-offline', !on);
  renderStatus(); updateQueueInfo();
  Hooks.emit(on ? 'net.online' : 'net.offline', {server: 'KONTOR-SRV01', warteschlange: S.queue});
  if (!on) toast('Server nicht erreichbar', {t2: 'Kasse arbeitet offline weiter · Signatur lokal per Smartcard', type: 'warn', icon: 'wifi-off'});
  else if (S.queue) {
    const n = S.queue; toast(`Synchronisiere ${n} Beleg${n > 1 ? 'e' : ''} …`, {icon: 'sync'});
    setTimeout(() => { S.queue = 0; renderStatus(); updateQueueInfo(); refreshDashboard(['ops.registers']); toast(`${n} Beleg${n > 1 ? 'e' : ''} synchronisiert`, {t2: 'DEP, Bestand und Webhooks nachgeholt', type: 'pos', icon: 'sync'}); Hooks.emit('sync.completed', {belege: n}); }, reduced() ? 100 : 1500);
  } else toast('Verbindung wiederhergestellt', {type: 'pos', icon: 'wifi'});
  refreshDashboard(['ops.registers']);
}

/* ════════════════════════════════════════════════════════════════════
   11 · ZAHLUNG, SIGNATUR, BELEG
   Zahlungsarten sind eine Registry – Terminal-, QR- und Gutschein-
   Anbindungen kommen später als Treiber/Erweiterungen dazu.
   ════════════════════════════════════════════════════════════════════ */
const METHODS = [
  {id: 'bar', label: 'Bar', sub: 'Lade 1', icon: 'cash', kind: 'cash'},
  {id: 'bankomat', label: 'Bankomat', sub: 'Debit · Terminal T-01', icon: 'card', kind: 'card'},
  {id: 'kredit', label: 'Kreditkarte', sub: 'Visa · Mastercard · Amex', icon: 'card', kind: 'card'},
  {id: 'apple', label: 'Apple Pay', sub: 'kontaktlos · NFC', icon: 'phone-pay', kind: 'wallet'},
  {id: 'google', label: 'Google Pay', sub: 'kontaktlos · NFC', icon: 'phone-pay', kind: 'wallet'},
  {id: 'paypal', label: 'PayPal', sub: 'QR-Code', icon: 'qr', kind: 'qr', online: true},
  {id: 'klarna', label: 'Klarna', sub: 'Rechnung · Raten', icon: 'calendar', kind: 'qr', online: true},
  {id: 'gutschein', label: 'Gutschein', sub: 'Code oder Scan', icon: 'gift', kind: 'voucher'},
];
let PAY = null;
const paid = () => r2(PAY.parts.reduce((s, p) => s + p.amount, 0));
const remaining = () => Math.max(0, r2(PAY.total - paid()));
function openPayment() {
  if (!POS.cart.length) return toast('Warenkorb ist leer', {type: 'warn', icon: 'card'});
  if (PAY) return;
  const t = totals();
  PAY = {total: t.total, t, parts: [], method: 'bar', busy: false};
  PAY.el = openLayer('<div class="modal pay" role="dialog" aria-modal="true" aria-label="Zahlung"><div class="pay-l" id="payL"></div><div class="pay-r"><div class="methods" id="methods"></div><div class="mpanel" id="mpanel"></div></div></div>',
    {closeOnScrim: false, onClose: () => { if (PAY && !PAY.done && PAY.parts.length) toast('Zahlung abgebrochen', {t2: 'Bereits erfasste Teilzahlungen wurden storniert', type: 'warn', icon: 'card'}); PAY = null; setTimeout(() => $('#posSearch')?.focus(), 30); }, focus: '#payGo'});
  PAY.el.addEventListener('keydown', payKeys);
  PAY.el.addEventListener('click', payClick);
  PAY.el.addEventListener('input', e => { if (e.target.id === 'payAmtIn') updateChange(); });
  renderPayLeft(); renderMethods(); renderMethodPanel();
  Hooks.emit('pos.payment.started', {beleg: belegNo(), betrag: t.total});
}
function renderPayLeft() {
  const rem = remaining(), p = paid();
  $('#payL').innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span class="eyebrow">Zahlung · Bon ${belegNo()}</span><button class="btn btn-ghost btn-sm" data-close style="margin-left:auto">Abbrechen<span class="kbd">Esc</span></button></div>
    <div class="pay-due-l">${PAY.parts.length ? 'Noch offen' : 'Zu zahlen'}</div>
    <div class="pay-due ${rem === 0 ? 'zero' : ''}">${eur(rem)}</div>
    <div class="pay-prog"><i style="width:${Math.min(100, p / PAY.total * 100)}%"></i></div>
    <div class="pay-lines" aria-label="Positionen">${POS.cart.map(l => { const c = l.c ? COLORS[l.c][1] : 'var(--text-3)'; const g = r2(l.unit * l.qty), d = l.disc ? r2(g * l.disc.pct / 100) : 0; return `<div class="wl-row"><span class="thumb" style="--c:${c}">${l.service ? ic(l.icon, 'i-sm') : glyph(l.art.g, c)}</span><div class="wl-main"><div class="wl-t">${l.qty > 1 ? l.qty + ' × ' : ''}${esc(l.name)}</div><div class="wl-s">${l.service ? esc(l.meta || '') : COLORS[l.c][0] + (l.s !== 'Einheitsgröße' ? ' · ' + esc(l.s) : '')}</div></div><div class="wl-v">${eur(g - d)}</div></div>`; }).join('')}</div>
    <div class="pay-parts">${PAY.parts.map(x => `<div class="ppart"><span class="reg-ic">${ic(METHODS.find(m => m.id === x.m)?.icon || 'card', 'i-sm')}</span><span><span style="display:block;font-weight:550">${esc(x.label)}</span><span class="muted" style="font-size:11.5px">${esc(x.ref)}</span></span><b>${eur(x.amount)}</b></div>`).join('')}</div>
    <div class="pay-sum"><div class="trow"><span>${cartCount()} Artikel${POS.customer ? ` · ${esc(POS.customer.name)}` : ''}</span><b>${eur(PAY.total)}</b></div>
      ${PAY.t.disc > 0 ? `<div class="trow disc"><span>darin Rabatt</span><b>− ${eur(PAY.t.disc)}</b></div>` : ''}
      <div class="trow"><span>Bezahlt</span><b>${eur(p)}</b></div>
      ${!S.online ? `<div class="trow" style="color:var(--warn)"><span style="display:flex;gap:6px;align-items:center">${ic('wifi-off', 'i-xs')}Offline – Signatur lokal, Sync folgt</span></div>` : `<div class="trow"><span style="display:flex;gap:6px;align-items:center">${ic('shield', 'i-xs')}${!DESKTOP ? 'RKSV · Signatureinheit bereit' : S.rksv?.active ? `RKSV-Testmodus · ${esc(S.rksv.kassen_id || '')}` : 'Beleg wird gespeichert · RKSV nicht in Betrieb'}</span></div>`}</div>`;
}
function renderMethods() {
  $('#methods').innerHTML = METHODS.filter(m => !m.hidden).map((m, i) => { const dis = m.online && !S.online; return `<button class="mbtn" data-m="${m.id}" aria-pressed="${PAY.method === m.id}" ${dis ? 'disabled' : ''}>${ic(m.icon)}<span><span class="ml" style="display:block">${m.label}</span><span class="ms" style="display:block">${dis ? 'offline nicht verfügbar' : m.sub}</span></span><span class="kbd">${i + 1}</span></button>`; }).join('');
}
function nextNotes(v) { const c = [5, 10, 20, 50, 100].map(s => Math.ceil((v + .001) / s) * s); return [...new Set(c)].filter(x => x > v).slice(0, 3); }
function renderMethodPanel() {
  const m = METHODS.find(x => x.id === PAY.method), rem = remaining(), P = $('#mpanel');
  const amtField = (lbl, val) => `<div class="amt-field"><label for="payAmtIn">${lbl}</label><div class="amt-input"><span>€</span><input id="payAmtIn" inputmode="decimal" autocomplete="off" value="${val}" placeholder="${num(rem, 2)}"></div></div>`;
  if (m.kind === 'cash') {
    P.innerHTML = `<div class="pay-cols"><div style="display:flex;flex-direction:column;min-width:0">${amtField('Erhalten', '')}
      <div class="quickcash"><button class="btn btn-secondary" data-cash="${rem}">Passend</button>${nextNotes(rem).map(v => `<button class="btn btn-secondary" data-cash="${v}">${eur0(v)}</button>`).join('')}</div>
      <div class="change" id="changeBox"><span>Rückgeld</span><b>${eur(0)}</b></div>
      <button class="btn btn-primary btn-lg btn-block" id="payGo" style="margin-top:auto">${ic('cash', 'i-sm')}Bar kassieren<span class="kbd">↵</span></button></div>
      <div class="keypad" id="cashPad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'].map(k => `<button data-pad="${k}" class="${k === 'back' || k === ',' ? 'fn' : ''}" aria-label="${k === 'back' ? 'Löschen' : k}">${k === 'back' ? ic('chevron-left') : k}</button>`).join('')}</div></div>`;
    updateChange();
  } else if (m.kind === 'card' || m.kind === 'wallet') {
    P.innerHTML = `${amtField('Betrag (Teilzahlung möglich)', num(rem, 2))}
      <div class="term" id="term"><div class="dev">${ic('terminal')}</div><h3>Terminal T-01 bereit</h3><p>${m.kind === 'wallet' ? `Kund:in hält Smartphone oder Uhr an das Terminal (${esc(m.label)}).` : 'Betrag wird an das Terminal übertragen. Karte stecken oder kontaktlos vorhalten.'}</p><div class="steps"><i></i><i></i><i></i></div></div>
      <button class="btn btn-primary btn-lg btn-block" id="payGo">${ic('terminal', 'i-sm')}Am Terminal starten<span class="kbd">↵</span></button>`;
  } else if (m.kind === 'qr') {
    P.innerHTML = `${amtField('Betrag', num(rem, 2))}
      <div class="term" id="term"><div class="dev">${ic(m.icon)}</div><h3>${esc(m.label)} per QR-Code</h3><p>Kund:in scannt den Code am Kundendisplay und bestätigt in der App.</p></div>
      <button class="btn btn-primary btn-lg btn-block" id="payGo">${ic('qr', 'i-sm')}QR-Code anzeigen<span class="kbd">↵</span></button>`;
  } else {
    P.innerHTML = `<div class="amt-field"><label for="gsCode">Gutscheincode</label><div class="amt-input" style="font-size:18px"><span>${ic('gift', 'i-sm')}</span><input id="gsCode" placeholder="GS-${YEAR}-1187" autocomplete="off" style="text-transform:uppercase"></div></div>
      <div class="term" id="term"><div class="dev">${ic('gift')}</div><h3>Gutschein prüfen</h3><p>Code eingeben oder scannen. Prüfung ${S.online ? 'gegen den Server' : 'gegen den lokalen Cache (offline)'}.</p></div>
      <button class="btn btn-primary btn-lg btn-block" id="payGo">${ic('search', 'i-sm')}Prüfen<span class="kbd">↵</span></button>`;
  }
}
function focusPay() { requestAnimationFrame(() => { const g = $('#payGo'); if (g && PAY && !PAY.busy && !(document.activeElement && PAY.el.contains(document.activeElement) && isTyping(document.activeElement))) g.focus({preventScroll: true}); }); }
function updateChange() {
  const inp = $('#payAmtIn'), box = $('#changeBox'); if (!inp || !box) return;
  const v = inp.value.trim() ? parseAmt(inp.value) : remaining(), ch = isFinite(v) ? Math.max(0, r2(v - remaining())) : 0;
  box.classList.toggle('has', ch > 0); $('b', box).textContent = eur(ch);
  const go = $('#payGo'); if (go) go.innerHTML = isFinite(v) && v < remaining() && v > 0 ? `${ic('cash', 'i-sm')}Teilzahlung ${eur(v)}<span class="kbd">↵</span>` : `${ic('cash', 'i-sm')}Bar kassieren<span class="kbd">↵</span>`;
}
function addPart(m, amount, ref, extra = {}) {
  PAY.parts.push({m: m.id, label: m.label, amount: r2(amount), ref, ...extra});
  Hooks.emit('pos.payment.authorized', {beleg: belegNo(), art: m.id, betrag: r2(amount), referenz: ref});
  renderPayLeft();
  if (remaining() <= 0) finalizePayment();
  else { PAY.busy = false; renderMethodPanel(); focusPay(); toast(`Teilzahlung ${eur(amount)} erfasst`, {t2: `Offen: ${eur(remaining())}`, icon: 'check', type: 'pos'}); }
}
async function runTerminal(m, amount) {
  PAY.busy = true;
  const term = $('#term'), go = $('#payGo'); go.disabled = true; $('#payAmtIn').disabled = true;
  const steps = m.kind === 'wallet'
    ? [['Verbinde mit Terminal T-01 …', 'Protokoll ZVT · Betrag ' + eur(amount)], ['Gerät an das Terminal halten', 'Warte auf NFC-Token'], ['Bestätigung auf dem Gerät', 'Face ID / Fingerabdruck']]
    : [['Verbinde mit Terminal T-01 …', 'Protokoll ZVT · Betrag ' + eur(amount)], ['Karte stecken oder vorhalten', 'Kontaktlos bis € 50 ohne PIN'], ['PIN-Eingabe am Terminal', 'Bitte Kund:in die PIN eingeben lassen']];
  for (let i = 0; i < steps.length; i++) {
    if (!PAY) return;
    term.innerHTML = `<div class="dev wait">${ic(m.kind === 'wallet' ? 'phone-pay' : 'terminal')}</div><h3>${steps[i][0]}</h3><p>${steps[i][1]}</p><div class="steps">${steps.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div>`;
    await wait(reduced() ? 120 : [750, 1300, 1000][i]);
  }
  if (!PAY) return;
  const auth = 'Auth. ' + (hash(Date.now()) % 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
  term.innerHTML = `<div class="ok-ring" style="width:72px;height:72px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div><h3>Autorisiert</h3><p>${auth} · ${m.label}</p><div class="steps">${steps.map(() => '<i class="done"></i>').join('')}</div>`;
  await wait(reduced() ? 80 : 650);
  if (PAY) addPart(m, amount, `${auth} · T-01`);
}
async function runQR(m, amount) {
  PAY.busy = true;
  const term = $('#term'), go = $('#payGo'); go.disabled = true; $('#payAmtIn').disabled = true;
  term.innerHTML = `<div class="qr">${pseudoQR(`${m.id}|${belegNo()}|${amount}`, 25)}</div><h3>Warte auf Bestätigung …</h3><p>${esc(m.label)} · ${eur(amount)} · Code gültig 5 min</p><div class="steps"><i class="done"></i><i class="on"></i><i></i></div>`;
  await wait(reduced() ? 200 : 2400);
  if (PAY) addPart(m, amount, `${m.label}-ID ${(hash(belegNo() + m.id) % 1e8).toString().padStart(8, '0')}`);
}
function payClick(e) {
  if (!PAY || PAY.done) return;
  const mb = e.target.closest('[data-m]');
  if (mb && !PAY.busy) { PAY.vcheck = null; PAY.method = mb.dataset.m; $$('#methods .mbtn').forEach(b => b.setAttribute('aria-pressed', b === mb)); renderMethodPanel(); focusPay(); return; }
  const cash = e.target.closest('[data-cash]'); if (cash) { $('#payAmtIn').value = num(+cash.dataset.cash, 2); updateChange(); return payGo(); }
  const pd = e.target.closest('[data-pad]');
  if (pd) { const inp = $('#payAmtIn'), k = pd.dataset.pad; inp.value = k === 'back' ? inp.value.slice(0, -1) : (k === ',' && inp.value.includes(',')) ? inp.value : inp.value + k; updateChange(); return; }
  if (e.target.closest('#payGo')) payGo();
}
function payGo() {
  if (!PAY || PAY.busy || PAY.done) return;
  const m = METHODS.find(x => x.id === PAY.method), rem = remaining();
  if (m.kind === 'voucher' && DESKTOP) return voucherPay(m, rem);
  if (m.kind === 'voucher') {
    const code = ($('#gsCode').value.trim() || `GS-${YEAR}-1187`).toUpperCase(), bal = hash(code) % 2 ? 50 : 100, use = Math.min(bal, rem);
    if (!PAY.vcheck) {
      PAY.vcheck = code;
      $('#term').innerHTML = `<div class="dev" style="width:auto;height:auto;padding:16px 20px;border-radius:14px;text-align:left;display:block"><div class="eyebrow">Gutschein ${esc(code)}</div><div style="font-size:26px;font-weight:650;margin-top:4px">${eur(bal)}</div><div class="muted" style="font-size:12px">Restwert · gültig bis 31.12.${YEAR + 2}</div></div><p>Einzulösen: <b style="color:var(--text)">${eur(use)}</b>${bal > use ? ` · Restwert danach ${eur(bal - use)}` : ''}</p>`;
      $('#payGo').innerHTML = `${ic('check', 'i-sm')}${eur(use)} einlösen<span class="kbd">↵</span>`; return;
    }
    PAY.vcheck = null; addPart(m, use, `${code}${bal > use ? ` · Rest ${eur(bal - use)}` : ''}`); return;
  }
  const inp = $('#payAmtIn'); const raw = inp.value.trim(); const v = raw ? parseAmt(raw) : rem;
  if (!isFinite(v) || v <= 0) { inp.closest('.amt-input').classList.remove('shake'); void inp.offsetWidth; inp.closest('.amt-input').classList.add('shake'); return; }
  if (m.kind === 'cash') { const amount = Math.min(v, rem); addPart(m, amount, v > rem ? `gegeben ${eur(v)}` : 'Lade 1', {given: v, change: Math.max(0, r2(v - rem))}); return; }
  const amount = Math.min(v, rem);
  if (m.kind === 'qr') runQR(m, amount); else runTerminal(m, amount);
}
function payKeys(e) {
  if (!PAY || PAY.done) return;
  const inInput = isTyping(e.target);
  if (e.key === 'Enter' && !e.target.closest('[data-close]')) { e.preventDefault(); return payGo(); }
  if (!inInput && /^[1-8]$/.test(e.key) && !PAY.busy) { const m = METHODS.filter(x => !x.hidden)[+e.key - 1]; if (!m) return; if (m.online && !S.online) return; PAY.vcheck = null; PAY.method = m.id; renderMethods(); renderMethodPanel(); focusPay(); e.preventDefault(); }
  if (inInput && e.target.id === 'payAmtIn') setTimeout(updateChange, 0);
}
async function finalizePayment() {
  PAY.busy = true; PAY.done = true;
  const L = $('#payL');
  L.innerHTML = `<div style="flex:1;display:grid;place-items:center;text-align:center"><div class="authwait"><div class="ring">${ic('shield')}</div><p><b style="color:var(--text)">${DESKTOP ? 'Beleg wird gespeichert …' : 'Beleg wird signiert …'}</b><br>${DESKTOP ? (S.rksv?.active ? `RKSV-Testmodus · Kasse ${esc(CFG['kasse.id'])} · Umsatzzähler verschlüsselt` : 'Lokale Datenbank') : `Signatureinheit ${S.online ? 'Smartcard · Kasse ' + esc(CFG['kasse.id']) : 'Smartcard (offline)'} · Umsatzzähler verschlüsselt`}</p></div></div>`;
  await wait(reduced() ? 150 : DESKTOP ? 250 : 1000);
  const t = PAY.t, change = r2(PAY.parts.reduce((s, p) => s + (p.change || 0), 0));
  const rec = {no: belegNo(), date: new Date(), lines: POS.cart.map(l => ({...l})), t, parts: PAY.parts.slice(), change, customer: POS.customer, billDisc: POS.billDisc, cashier: S.user.name, offline: !S.online,
    sig: (hash(belegNo() + t.total) >>> 0).toString(16).toUpperCase().padStart(8, '0') + (hash(String(t.total)) >>> 0).toString(16).toUpperCase().padStart(8, '0')};
  // Festschreiben: Belegnummer, Beleg und Bestandsabbuchung in einer Transaktion
  try {
    const r = await commitSale(rec);
    if (r) {
      rec.no = r.no; POS.no = r.number;
      if (r.data) { rec.rksv = r.data.rksv || null; (r.data.lines || []).forEach((dl, i) => { if (dl.voucher && rec.lines[i]) { rec.lines[i].meta = dl.meta; rec.lines[i].codes = dl.codes; } }); }
      if (rec.customer) {
        if (r.points?.balance != null) { rec.pointsAfter = r.points.balance; rec.pointsEarned = r.points.earned; rec.customer.points = r.points.balance; }
        rec.customer.visits = (rec.customer.visits || 0) + 1; rec.customer.revenue = r2((rec.customer.revenue || 0) + t.total); rec.customer.lastVisit = new Date(); custFinish(rec.customer);
      }
    } else if (rec.customer) { rec.pointsEarned = t.points; rec.pointsAfter = rec.customer.points + t.points; rec.customer.points = rec.pointsAfter; }
    statsInvalidate();
  } catch (e) {
    PAY.busy = false; PAY.done = false;
    L.innerHTML = `<div style="flex:1;display:grid;place-items:center;text-align:center"><div class="authwait"><div class="ring" style="color:var(--neg)">${ic('alert')}</div><p><b style="color:var(--text)">Beleg konnte nicht gespeichert werden</b><br>${esc(String(e))}</p><button class="btn btn-primary" id="payRetry">Erneut versuchen</button></div></div>`;
    $('#payRetry').onclick = () => finalizePayment();
    return;
  }
  POS.last = {no: rec.no, total: t.total}; POS.lastRec = rec;
  if (DESKTOP && CFG['drucker.auto']) printReceipt(rec, {quiet: true});
  if (rec.parts.some(p => p.m === 'bar')) openDrawer('Barzahlung', true);
  Hooks.emit('rksv.receipt.signed', {beleg: rec.no, kassenId: S.rksv?.kassen_id || CFG['kasse.id'] || 'INN-K01', betragSatzNormal: t.vat.find(v => v.rate === 20)?.gross || 0, betragSatzNull: t.zero, signatur: 'ES256 · …' + rec.sig.slice(-8), offline: rec.offline});
  if (!S.online) { S.queue++; renderStatus(); updateQueueInfo(); }
  Dash.session.rev += t.total; Dash.session.bons++;
  Hooks.emit('pos.sale.completed', {beleg: rec.no, summe: t.total, positionen: rec.lines.length, zahlungen: rec.parts.map(p => p.m), kunde: rec.customer?.id || null});
  if (POS.customer) Hooks.emit('loyalty.points.earned', {kunde: POS.customer.id, punkte: t.points});
  showDone(rec);
}
function showDone(rec) {
  const box = $('.pay', PAY.el); box.className = 'modal pay-done';
  const tpl = prefs.tpl || 'classic';
  box.innerHTML = `<div class="done-l">
    <div class="ok-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
    <div class="done-title">Bezahlt · ${eur(rec.t.total)}</div>
    <div class="done-sub">Bon ${rec.no} · ${rec.lines.reduce((s, l) => s + l.qty, 0)} Artikel · ${DESKTOP ? (rec.rksv ? 'RKSV-signiert (Testmodus)' : 'gespeichert') : 'RKSV-signiert'} ${clock(true)}${rec.offline ? ' · offline erfasst, Sync folgt' : ''}</div>
    ${rec.lines.some(l => l.codes?.length) ? `<div class="note" style="margin-top:14px">${ic('gift')}<span>Gutschein-Code: <b style="color:var(--text)" class="mono">${esc(rec.lines.flatMap(l => l.codes || []).join(', '))}</b></span></div>` : ''}
    <div class="pay-parts" style="margin-top:18px">${rec.parts.map(x => `<div class="ppart"><span class="reg-ic">${ic(METHODS.find(m => m.id === x.m)?.icon || 'card', 'i-sm')}</span><span><span style="display:block;font-weight:550">${esc(x.label)}</span><span class="muted" style="font-size:11.5px">${esc(x.ref)}</span></span><b>${eur(x.given || x.amount)}</b></div>`).join('')}</div>
    ${rec.change > 0 ? `<div class="change-big"><div class="l">Rückgeld</div><div class="v">${eur(rec.change)}</div></div>` : ''}
    ${rec.customer ? `<div class="note" style="margin-top:16px">${ic('star')}<span><b style="color:var(--text)">+${num(rec.pointsEarned ?? rec.t.points)} Gipfel-Punkte</b> für ${esc(rec.customer.name)} · neuer Stand ${num(rec.pointsAfter ?? rec.customer.points)}</span></div>` : ''}
    <div class="eyebrow" style="margin-top:26px">Beleg übergeben</div>
    <div class="rcpt-opts"><button class="btn btn-secondary" data-r="print">${ic('printer')}Drucken</button>${DESKTOP ? `<button class="btn btn-secondary" data-r="mail">${ic('mail')}E-Mail</button><button class="btn btn-secondary" data-r="a4">${ic('receipt')}Rechnung A4</button>` : `<button class="btn btn-secondary" data-r="qr">${ic('qr')}Digital (QR)</button><button class="btn btn-secondary" data-r="mail">${ic('mail')}E-Mail</button>`}</div>
    <div class="note" style="margin-top:12px">${ic('shield')}<span>Belegerteilungspflicht: Beleg aushändigen.${DESKTOP ? (rec.rksv ? ' Signatur im DEP gespeichert (Testmodus).' : ' RKSV noch nicht in Betrieb.') : ` Signatur im DEP gespeichert${rec.offline ? ', Übertragung folgt nach Sync' : ''}.`}</span></div>
    <div style="margin-top:auto;display:flex;gap:8px;padding-top:22px"><button class="btn btn-ghost btn-lg" data-close>Schließen</button><button class="btn btn-primary btn-lg" id="newSale" style="flex:1">Neuer Verkauf<span class="kbd">↵</span></button></div>
  </div>
  <div class="done-r"><div class="done-r-head"><span class="eyebrow">Bonvorschau</span><div class="seg" id="rcSeg" style="margin-left:auto">${[['classic', 'Klassisch'], ['modern', 'Modern'], ['minimal', 'Minimal']].map(([k, l]) => `<button data-tpl="${k}" aria-pressed="${k === tpl}">${l}</button>`).join('')}</div></div>
    <div class="done-r-body"><div class="receipt-wrap" id="rcWrap">${receiptHTML(rec, tpl)}</div></div></div>`;
  initSeg($('#rcSeg', box), b => { prefs.tpl = b.dataset.tpl; persist.set('prefs', prefs); $('#rcWrap', box).innerHTML = receiptHTML(rec, prefs.tpl); $('#newSale', box).focus({preventScroll: true}); });
  PAY.el.removeEventListener('keydown', payKeys); PAY.el.removeEventListener('click', payClick);
  const layerEl = PAY.el;
  const next = () => closeLayer(layerEl);
  $('#newSale', box).onclick = next; $('#newSale', box).focus();
  layerEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('[data-r],[data-close]')) { e.preventDefault(); next(); } });
  // Schließen ohne „Neuer Verkauf“ startet ebenfalls einen neuen Bon
  const entry = layers.find(l => l.el === layerEl); if (entry) entry.onClose = () => { PAY = null; POS.no++; newSale(true); };
  box.addEventListener('click', e => {
    const r = e.target.closest('[data-r]'); if (!r) return;
    const k = r.dataset.r;
    if (k === 'print') { if (DESKTOP) printReceipt(rec); else toast('Beleg gedruckt', {t2: `Bondrucker BD-1 · Vorlage „${{classic: 'Klassisch', modern: 'Modern', minimal: 'Minimal'}[prefs.tpl]}“`, type: 'pos', icon: 'printer'}); Hooks.emit('device.printer.receipt', {beleg: rec.no, vorlage: prefs.tpl}); }
    if (k === 'qr') { const w = $('#rcWrap', box); w.innerHTML = `<div style="text-align:center;padding-top:30px"><div class="qr" style="width:220px;height:220px;margin:0 auto">${pseudoQR('beleg|' + rec.no, 29)}</div><p style="margin-top:16px;font-size:13px;color:var(--text-2)">Kund:in scannt den Code am Kundendisplay.<br><span class="muted">Beleg wird über Ihr Kontor-Gateway bereitgestellt (24 h gültig).</span></p></div>`; Hooks.emit('pos.receipt.digital', {beleg: rec.no, kanal: 'qr'}); }
    if (k === 'a4') return printInvoice(rec, 'rechnung');
    if (k === 'mail' && DESKTOP) return mailReceipt(rec);
    if (k === 'mail') { const to = rec.customer?.email; toast(to ? 'Beleg per E-Mail gesendet' : 'E-Mail-Adresse erforderlich', {t2: to || 'Kund:in zuordnen oder Adresse eingeben', type: to ? 'pos' : 'warn', icon: 'mail'}); if (to) Hooks.emit('pos.receipt.digital', {beleg: rec.no, kanal: 'email'}); }
  });
}
function pseudoQR(seed, N = 25) {
  // Visuelle Platzhalter-Matrix (kein echter Code) – Finder, Timing, Datenmodule
  const r = rng(hash(seed)), m = Array.from({length: N}, () => Array(N).fill(0)), res = Array.from({length: N}, () => Array(N).fill(false));
  const finder = (x0, y0) => { for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) { const X = x0 + x, Y = y0 + y; if (X < 0 || Y < 0 || X >= N || Y >= N) continue; res[Y][X] = true; const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3)); m[Y][X] = (x >= 0 && x < 7 && y >= 0 && y < 7 && (ring === 3 || ring <= 1)) ? 1 : 0; } };
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
  for (let i = 8; i < N - 8; i++) { m[6][i] = m[i][6] = i % 2 ? 0 : 1; res[6][i] = res[i][6] = true; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!res[y][x]) m[y][x] = r() > .52 ? 1 : 0;
  let d = ''; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y][x]) d += `M${x} ${y}h1v1h-1z`;
  return `<svg viewBox="-1 -1 ${N + 2} ${N + 2}" shape-rendering="crispEdges" aria-label="Maschinenlesbarer Code (Vorschau)"><rect x="-1" y="-1" width="${N + 2}" height="${N + 2}" fill="#fff"/><path d="${d}" fill="#141414"/></svg>`;
}
function receiptHeadBase(tpl) {
  return tpl === 'modern' ? `<div class="band"></div><div class="logo"><span class="mk"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.5v15"/><path d="M18 4.5 10.5 12 18 19.5"/></svg></span><b>${esc(CFG['firma.marke'])} ${esc(CFG['firma.zusatz'].split(' ')[0])}</b><span class="sm">${esc(CFG['firma.adresse'])}</span></div>`
    : tpl === 'minimal' ? `<div class="logo"><b>${esc(CFG['firma.marke'].toUpperCase())}</b><span class="sm">${esc(CFG['firma.adresse'].split(',').pop().trim())}</span></div>`
    : `<div class="logo"><b>${esc(CFG['firma.marke'].toUpperCase())}</b><span>${esc(CFG['firma.zusatz'])}</span><span class="sm">${esc(CFG['firma.adresse'])}<br>UID ${esc(CFG['firma.uid'])} · Tel. ${esc(CFG['firma.telefon'])}</span></div>`;
}
function receiptHead(tpl) {
  const u = DESKTOP ? imgUrl(CFG['bon.logo']) : null;
  return (u ? `<div class="c" style="margin-bottom:6px"><img src="${esc(u)}" alt="" style="max-width:70%;max-height:64px;filter:grayscale(1)"></div>` : '') + receiptHeadBase(tpl) + (CFG['bon.kopf'] ? `<div class="sm c">${esc(CFG['bon.kopf'])}</div>` : '');
}
const savingsOf = rec => r2((rec.lines || []).reduce((s, l) => s + (l.was && l.was > l.unit ? (l.was - l.unit) * l.qty : 0), 0) + (rec.t?.disc || 0));
function receiptHTML(rec, tpl) {
  if (rec.kind === 'retoure' || rec.kind === 'storno') return returnReceiptHTML(rec, tpl);
  if (['startbeleg', 'nullbeleg', 'monatsbeleg'].includes(rec.kind)) return zeroReceiptHTML(rec, tpl);
  const dt = rec.date, d = `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  const money = v => num(v, 2);
  const lines = rec.lines.map(l => {
    const g = r2(l.unit * l.qty), dd = l.disc ? r2(g * l.disc.pct / 100) : 0;
    const vtxt = l.service ? (l.meta && l.vat === 0 ? l.meta : '') : `${COLORS[l.c][0]}${l.s !== 'Einheitsgröße' ? ' · ' + l.s : ''}`;
    return `<div class="r"><span>${l.qty} × ${esc(l.name)}</span><span>${money(g)}</span></div>${CFG['bon.artikelnr'] && (l.sku || l.art?.id) ? `<div class="sm">&nbsp;&nbsp;Art.-Nr. ${esc(l.sku || l.art.id)}</div>` : ''}${vtxt ? `<div class="sm">&nbsp;&nbsp;${esc(vtxt)}${l.vat === 0 ? ' · 0 %' : ''}</div>` : ''}${l.vals ? `<div class="sm">&nbsp;&nbsp;${Object.entries(l.vals).filter(([, v]) => v).map(([k, v]) => `${k === 'z' ? 'Z-Wert' : 'SN'} ${esc(v)}`).join(' · ')}</div>` : ''}${dd ? `<div class="r sm"><span>&nbsp;&nbsp;Rabatt ${l.disc.pct} % (${esc(l.disc.reason || '')})</span><span>−${money(dd)}</span></div>` : ''}`;
  }).join('');
  const lineDisc = rec.lines.reduce((s, l) => s + (l.disc ? r2(r2(l.unit * l.qty) * l.disc.pct / 100) : 0), 0), billDisc = r2(rec.t.disc - lineDisc);
  const head = receiptHead(tpl);
  return `<div class="receipt ${tpl}">${head}<hr>
    <div class="r"><span>Bon ${rec.no}</span><span>Kasse ${esc(CFG['kasse.id'])}</span></div><div class="r sm"><span>${d}</span><span>${esc(rec.cashier.split(' ')[0])}</span></div><hr>
    ${lines}
    ${billDisc > 0 && rec.billDisc ? `<div class="r sm"><span>Bonrabatt ${rec.billDisc.pct} %${rec.billDisc.reason ? ' · ' + esc(rec.billDisc.reason) : ''}</span><span>−${money(billDisc)}</span></div>` : ''}
    <hr><div class="r tot"><span>SUMME EUR</span><span>${money(rec.t.total)}</span></div><hr>
    ${rec.parts.map(p => `<div class="r"><span>${esc(p.label)}</span><span>${money(p.given || p.amount)}</span></div>`).join('')}
    ${CFG['bon.ersparnis'] && savingsOf(rec) > 0 ? `<div class="r sm" style="font-weight:700"><span>Sie sparen heute</span><span>${money(savingsOf(rec))}</span></div>` : ''}
    ${rec.change > 0 ? `<div class="r"><span>Rückgeld</span><span>${money(rec.change)}</span></div>` : ''}<hr>
    <div class="r sm"><span>MwSt</span><span>Netto · Steuer · Brutto</span></div>
    ${rec.t.vat.map(v => `<div class="r sm"><span>${v.rate} %</span><span>${money(v.net)} · ${money(v.tax)} · ${money(v.gross)}</span></div>`).join('')}
    ${rec.t.zero ? `<div class="r sm"><span>0 %</span><span>${money(rec.t.zero)} · 0,00 · ${money(rec.t.zero)}</span></div>` : ''}
    ${rec.customer ? `<hr><div class="sm c">Kunde ${esc(rec.customer.id)} · +${rec.pointsEarned ?? rec.t.points} Gipfel-Punkte</div>` : ''}${rec.copy ? '<div class="c" style="font-weight:700;margin-top:6px">*** KOPIE ***</div>' : ''}
    ${rksvBlockHTML(rec)}<hr>
    <div class="c" style="font-size:${tpl === 'minimal' ? '11px' : '12px'};white-space:pre-line">${esc(CFG['kasse.bonFuss'])}</div></div>`;
}

function bindPOS() {
  const v = $('#view-kasse');
  v.addEventListener('input', e => {
    if (e.target.id === 'posSearch') { POS.q = e.target.value; if (!/^\d{8,}$/.test(POS.q.trim())) { renderGrid(); renderCats(); } }
  });
  v.addEventListener('click', e => {
    const t = e.target, id = t.closest('[id]')?.id;
    const cat = t.closest('[data-cat]'); if (cat) { POS.cat = cat.dataset.cat; POS.q = ''; $('#posSearch').value = ''; renderCats(); renderGrid(); return; }
    const tile = t.closest('.tile'); if (tile) { openArticle(artById(tile.dataset.id), tile); return; }
    const svc = t.closest('[data-svc]'); if (svc) { addService(svc.dataset.svc, undefined, svc); return; }
    const fk = t.closest('[data-fk]'); if (fk) return runFk(fk.dataset.fk);
    const mode = t.closest('[data-mode]'); if (mode) { prefs.tiles = mode.dataset.mode; persist.set('prefs', prefs); $$('.view-toggle button').forEach(b => b.setAttribute('aria-pressed', b === mode)); renderGrid(); return; }
    const line = t.closest('.line');
    if (line) {
      const key = line.dataset.key, q = t.closest('[data-q]'), la = t.closest('[data-la]');
      if (q) return changeQty(key, +q.dataset.q);
      if (la) {
        const l = POS.cart.find(x => x.key === key);
        if (la.dataset.la === 'rm') return removeLine(key);
        if (la.dataset.la === 'disc') { POS.sel = key; return openDiscount(); }
        if (la.dataset.la === 'seller') { const i = (STAFF.findIndex(s => s.name === l.seller) + 1) % (STAFF.length + 1); l.seller = STAFF[i]?.name || null; renderCart(); selectLine(key); return toast(l.seller ? `Verkäufer:in: ${l.seller}` : 'Verkäufer:in entfernt', {t2: 'Für Provisions- und Leistungsauswertung', icon: 'user'}); }
        if (la.dataset.la === 'variant') { const i = POS.cart.indexOf(l); POS.cart.splice(i, 1); renderCart(); return openVariant(l.art, null, {c: l.c, s: l.s}); }
      }
      return selectLine(key);
    }
    switch (id) {
      case 'scanBtn': return simulateScan();
      case 'custAdd': return openCustomers();
      case 'custRm': return detachCustomer();
      case 'discBtn': return openDiscount();
      case 'park2Btn': case 'parkBtn': return park();
      case 'moreBtn': return openMore($('#moreBtn'));
      case 'clearBtn': if (!POS.cart.length) return; { const snap = {cart: POS.cart, customer: POS.customer, billDisc: POS.billDisc}; POS.cart = []; POS.customer = null; POS.billDisc = null; POS.sel = null; renderCart(); toast('Warenkorb geleert', {icon: 'trash', action: {label: 'Rückgängig', run: () => { Object.assign(POS, snap); renderCart(); }}}); Hooks.emit('pos.cart.cleared', {beleg: belegNo()}); } return;
      case 'payBtn': return openPayment();
      case 'reprint': return reprint();
      case 'reconnect': return setOnline(true);
      case 'searchAll': return toast('Filialübergreifende Suche', {t2: `„${POS.q}“ · 0 Treffer in 5 Filialen – Artikel ggf. neu anlegen`, icon: 'store'});
      case 'cartToggle': return $('#cart').classList.toggle('open');
    }
  });
}
function runFk(a) {
  ({focus: () => $('#posSearch').focus(), cust: openCustomers, disc: openDiscount, park, pay: openPayment, lock, palette: () => openPalette(), flow: openFlow})[a]?.();
}
function posKey(e, typing) {
  const k = e.key, inSearch = e.target.id === 'posSearch';
  const fmap = {F2: () => { $('#posSearch').focus(); $('#posSearch').select(); }, F3: openCustomers, F4: openDiscount, F8: park, F9: openPayment, F10: lock};
  if (fmap[k]) { e.preventDefault(); fmap[k](); return true; }
  if ((e.metaKey || e.ctrlKey) && k === 'Enter') { e.preventDefault(); openPayment(); return true; }
  if (inSearch) {
    const n = POS.list.length, cols = gridCols();
    if (k === 'Enter') { e.preventDefault(); handleEnter(); return true; }
    if (k === 'Escape') { if (e.target.value) { e.target.value = ''; POS.q = ''; renderGrid(); renderCats(); } else e.target.blur(); return true; }
    if (k === 'ArrowDown' && n) { POS.kb = POS.kb < 0 ? 0 : Math.min(n - 1, POS.kb + cols); markKb(); e.preventDefault(); return true; }
    if (k === 'ArrowUp' && POS.kb >= 0) { POS.kb = POS.kb - cols < 0 ? -1 : POS.kb - cols; markKb(); e.preventDefault(); return true; }
    if (k === 'ArrowRight' && POS.kb >= 0 && !e.target.value) { POS.kb = Math.min(n - 1, POS.kb + 1); markKb(); e.preventDefault(); return true; }
    if (k === 'ArrowLeft' && POS.kb > 0 && !e.target.value) { POS.kb--; markKb(); e.preventDefault(); return true; }
  }
  const searchEmpty = !inSearch || !e.target.value;
  if (POS.sel && searchEmpty && (!typing || inSearch)) {
    if (k === '+' || k === '-') { e.preventDefault(); changeQty(POS.sel, k === '+' ? 1 : -1); return true; }
    if (k === 'Delete' || (k === 'Backspace' && searchEmpty)) { e.preventDefault(); removeLine(POS.sel); return true; }
  }
  if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown') && POS.cart.length) {
    const i = POS.cart.findIndex(l => l.key === POS.sel), ni = k === 'ArrowDown' ? Math.min(POS.cart.length - 1, i + 1) : Math.max(0, i < 0 ? POS.cart.length - 1 : i - 1);
    POS.sel = null; selectLine(POS.cart[ni].key); $(`.line[data-key="${CSS.escape(POS.cart[ni].key)}"]`)?.scrollIntoView({block: 'nearest'}); e.preventDefault(); return true;
  }
  if (!typing && k.length === 1 && /[\p{L}\p{N}]/u.test(k) && !e.metaKey && !e.ctrlKey && !e.altKey && k.toLowerCase() !== 'g' && Date.now() - gChord > 900) { $('#posSearch').focus(); return false; }
  return false;
}
