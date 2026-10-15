
/* ════════════════════════════════════════════════════════════════════
   20 · AUSWERTUNGEN — echte Zahlen aus der lokalen Datenbank.
   Die Desktop-App ersetzt die Testdaten des Dashboards: Umsatz, Bons,
   Ø Bon, Retourenquote, Verlauf mit Vorperiode, Topseller, Warengruppen,
   Kundenfrequenz und Bestandswarnungen. Prognose = Verlauf der Vorperiode,
   skaliert auf den bisherigen Stand (keine Fantasiewerte).
   ════════════════════════════════════════════════════════════════════ */
const ST = {cache: {}, pending: {}, d28: null, d28p: null};
function statsInvalidate() { ST.cache = {}; ST.d28 = null; if (S.view === 'dashboard' && !Dash.editing) setTimeout(() => renderWidgets(false), 50); }
const isoL = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
if (DESKTOP) { PNAME.saison = 'Jahr'; PLBL.saison = 'dieses Jahr'; }

function periodSpec(p) {
  const now = new Date(), sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const DN = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], MN = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  if (p === 'heute') {
    const xOf = (ts, base) => (new Date(ts) - base) / 36e5;
    return {cur: [sod, addDays(sod, 1)], prev: [addDays(sod, -7), addDays(sod, -6)], xOf, step: .25, nowX: xOf(now, sod), xMax: 24, cmpLbl: 'Vorwoche', nowLbl: 'Heute',
      fx: x => `${pad(Math.round(x))}:00`, fxTip: x => `${hhmm(x)} Uhr`, ticks: (a, b) => { const out = [], st = b - a > 10 ? 3 : 2; for (let x = Math.ceil(a / st) * st; x <= b; x += st) out.push(x); return out; }, goalDays: 1};
  }
  if (p === 'woche') {
    const mon = addDays(sod, -((now.getDay() + 6) % 7)), xOf = (ts, base) => (new Date(ts) - base) / 864e5;
    return {cur: [mon, addDays(mon, 7)], prev: [addDays(mon, -7), mon], xOf, step: 1 / 8, nowX: xOf(now, mon), xMin: 0, xMax: 7, cmpLbl: 'Vorwoche', nowLbl: 'Diese Woche',
      fx: x => DN[Math.floor(x)], fxTip: x => x === 0 ? 'Wochenbeginn' : `${DN[Math.min(6, Math.ceil(x) - 1)]}${x % 1 ? ' ' + hhmm((x % 1) * 24) : ' · Tagesende'}`, ticks: () => DN.map((_, i) => i + .5), goalDays: 6};
  }
  if (p === 'monat') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1), next = new Date(now.getFullYear(), now.getMonth() + 1, 1), prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const dim = Math.round((next - first) / 864e5), xOf = (ts, base) => (new Date(ts) - base) / 864e5;
    const work = Array.from({length: dim}, (_, i) => new Date(now.getFullYear(), now.getMonth(), i + 1).getDay()).filter(d => d !== 0).length;
    const mName = now.toLocaleDateString('de-AT', {month: 'short'});
    return {cur: [first, next], prev: [prevFirst, first], xOf, step: .25, nowX: xOf(now, first), xMin: 0, xMax: dim, cmpLbl: 'Vormonat', nowLbl: 'Dieser Monat',
      fx: x => `${Math.round(x + .5)}.`, fxTip: x => x === 0 ? 'Monatsbeginn' : `${Math.ceil(x)}. ${mName}`, ticks: () => [1, 5, 10, 15, 20, 25, dim].map(x => x - .5), goalDays: work};
  }
  const jan = new Date(now.getFullYear(), 0, 1), nextJan = new Date(now.getFullYear() + 1, 0, 1), prevJan = new Date(now.getFullYear() - 1, 0, 1);
  const xOf = (ts, base) => { const d = new Date(ts), y0 = base.getFullYear(); const m = (d.getFullYear() - y0) * 12 + d.getMonth(); const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return m + (d.getDate() - 1 + d.getHours() / 24) / dim; };
  return {cur: [jan, nextJan], prev: [prevJan, jan], xOf, step: 1 / 4, nowX: xOf(now, jan), xMin: 0, xMax: 12, cmpLbl: 'Vorjahr', nowLbl: `Jahr ${now.getFullYear()}`,
    fx: x => MN[Math.floor(x)], fxTip: x => x === 0 ? 'Jahresbeginn' : `${MN[Math.min(11, Math.ceil(x) - 1)]}${x % 1 ? ' (laufend)' : ''}`, ticks: () => MN.map((_, i) => i + .5).filter((_, i) => i % 2 === 0), goalDays: 306};
}

function fetchPeriod(p) {
  if (ST.pending[p]) return;
  const sp = periodSpec(p);
  ST.pending[p] = invoke('stats', {ranges: [{from: isoL(sp.cur[0]), to: isoL(sp.cur[1])}, {from: isoL(sp.prev[0]), to: isoL(sp.prev[1])}], detail: true})
    .then(([a, b]) => { ST.cache[p] = buildPeriod(p, sp, a, b); })
    .catch(e => { ST.cache[p] = {...emptyPeriod(p, sp), error: String(e)}; })
    .finally(() => { delete ST.pending[p]; if (S.view === 'dashboard' && !Dash.editing && Dash.period === p) renderWidgets(false); });
}
function fetch28() {
  if (ST.d28p) return;
  const end = addDays(new Date(), 1), start = addDays(end, -29);
  ST.d28p = invoke('stats', {ranges: [{from: isoL(start), to: isoL(end)}], detail: true})
    .then(([a]) => { ST.d28 = a; }).catch(() => { ST.d28 = {rows: [], items: []}; })
    .finally(() => { ST.d28p = null; refreshDashboard(['sales.heatmap', 'stock.low']); });
}

/* Kumulierte Reihe aus Belegzeilen, gebündelt in Schritte */
function cumPoints(rows, xOf, base, from, to, step) {
  const pts = [{x: from, y: 0}]; let acc = 0, i = 0;
  const sorted = rows.map(r => ({x: xOf(r[0], base), v: r[1] / 100})).sort((a, b) => a.x - b.x);
  const pre = sorted.filter(r => r.x < from).reduce((s, r) => s + r.v, 0); acc = pre; pts[0].y = acc;
  while (i < sorted.length && sorted[i].x < from) i++;
  for (let x = from + step; x < to + 1e-9; x += step) {
    while (i < sorted.length && sorted[i].x <= x) acc += sorted[i++].v;
    pts.push({x: Math.min(x, to), y: acc});
  }
  if (pts[pts.length - 1].x < to - 1e-9) { while (i < sorted.length && sorted[i].x <= to) acc += sorted[i++].v; pts.push({x: to, y: acc}); }
  return pts;
}
const countUntil = (rows, xOf, base, x) => rows.filter(r => xOf(r[0], base) <= x);
function sums(rows) {
  let sale = 0, ret = 0, n = 0, storno = 0;
  rows.forEach(([, t, k]) => { if (k === 'verkauf') { sale += t; n++; } else { ret += -t; if (k === 'storno') storno++; } });
  return {sale: sale / 100, ret: ret / 100, bons: n - storno, rev: (sale - ret) / 100};
}
function emptyPeriod(p, sp) {
  return {p, F: 1, real: true, loading: false, xMin: sp.xMin ?? 8, xMax: sp.xMax === 24 ? 20 : sp.xMax, xTicks: sp.ticks(sp.xMin ?? 8, sp.xMax === 24 ? 20 : sp.xMax), fx: sp.fx, fxTip: sp.fxTip,
    actual: [{x: sp.xMin ?? 8, y: 0}, {x: Math.max(sp.xMin ?? 8, sp.nowX), y: 0}], fc: [], prev: [{x: sp.xMin ?? 8, y: 0}], rev: 0, prevRev: 0, end: 0,
    goal: (+CFG['ziel.tag'] || 2500) * sp.goalDays, since: 'bis jetzt', cmpLbl: sp.cmpLbl, nowLbl: sp.nowLbl, basket: 0, prevBasket: 0, ret: 0, prevRet: 0, bons: 0, prevBons: 0,
    top: [], cats: [], sparks: {rev: [0], bons: [0], basket: [0], ret: [0]}, sollFrac: .5};
}
function buildPeriod(p, sp, a, b) {
  const base = sp.cur[0], pbase = sp.prev[0], nowX = sp.nowX;
  let xMin = sp.xMin, xMax = sp.xMax;
  if (p === 'heute') {
    // Achse = Öffnungszeit, erweitert um tatsächliche Belegzeiten und „jetzt“
    const xs = [...a.rows.map(r => sp.xOf(r[0], base)), ...b.rows.map(r => sp.xOf(r[0], pbase))];
    xMin = Math.max(0, Math.floor(Math.min(8, ...xs))); xMax = Math.min(24, Math.ceil(Math.max(20, nowX, ...xs.map(x => x + .01))));
  }
  const cur = cumPoints(a.rows, sp.xOf, base, xMin, Math.min(xMax, Math.max(xMin, nowX)), sp.step);
  const prev = cumPoints(b.rows, sp.xOf, pbase, xMin, xMax, sp.step);
  const curNow = cur[cur.length - 1].y, prevNow = interpPts(prev, Math.min(nowX, xMax)) ?? 0, prevEnd = prev[prev.length - 1].y;
  const scale = prevNow > 0 ? clamp(curNow / prevNow, .3, 3) : 1;
  const fc = [{x: Math.max(xMin, nowX), y: curNow}];
  if (prevEnd > prevNow && nowX < xMax) prev.filter(q => q.x > nowX).forEach(q => fc.push({x: q.x, y: curNow + (q.y - prevNow) * scale}));
  const end = fc[fc.length - 1].y;
  const A = sums(a.rows), B = sums(countUntil(b.rows, sp.xOf, pbase, nowX));
  // Sparklines: 12 Abschnitte des bisherigen Zeitraums
  const bins = 12, span = Math.max(.001, Math.min(nowX, xMax) - xMin);
  const sp12 = key => { const v = Array(bins).fill(0), c = Array(bins).fill(0); a.rows.forEach(r => { const i = clamp(Math.floor((sp.xOf(r[0], base) - xMin) / span * bins), 0, bins - 1); if (key === 'rev') v[i] += r[1] / 100; else if (r[2] === 'verkauf') { v[i] += r[1] / 100; c[i]++; } }); return key === 'bons' ? c : key === 'basket' ? v.map((x, i) => c[i] ? x / c[i] : 0) : v; };
  const top = (a.items || []).filter(i => i.qty > 0 || i.rev > 0).map(i => {
    const art = artById(i.sku) || {name: i.name, g: 'shirt', colors: [COLOR_KEYS[0]]};
    return {a: {...art, name: art.name || i.name}, units: i.qty, rev: i.rev / 100};
  });
  const totalCat = (a.cats || []).reduce((s, c) => s + Math.max(0, c.rev), 0) || 1;
  return {p, F: 1, real: true, xMin, xMax, xTicks: sp.ticks(xMin, xMax), fx: sp.fx, fxTip: sp.fxTip, actual: cur, fc, prev,
    rev: A.rev, prevRev: B.rev, end, goal: (+CFG['ziel.tag'] || 2500) * sp.goalDays, since: 'bis jetzt', cmpLbl: sp.cmpLbl, nowLbl: sp.nowLbl,
    bons: A.bons, prevBons: B.bons, basket: A.bons ? (A.sale - (a.rows.filter(r => r[2] === 'storno').reduce((s, r) => s - r[1], 0)) / 100) / A.bons : 0,
    prevBasket: B.bons ? B.sale / B.bons : 0, ret: A.sale ? A.ret / A.sale * 100 : 0, prevRet: B.sale ? B.ret / B.sale * 100 : 0,
    top, cats: (a.cats || []).filter(c => c.rev > 0).map(c => ({name: catName(c.cat), v: c.rev / 100, s: c.rev / totalCat})),
    pay: a.pay || [], sold: a.sold, returned: a.returned, sparks: {rev: sp12('rev'), bons: sp12('bons'), basket: sp12('basket')},
    sollFrac: clamp((nowX - xMin) / Math.max(.001, xMax - xMin), 0, 1)};
}
function realPeriodData(p) {
  const c = ST.cache[p]; if (c) return c;
  fetchPeriod(p);
  return {...emptyPeriod(p, periodSpec(p)), loading: true};
}

/* ── Echte Widget-Inhalte ── */
function realHeatHTML() {
  if (!ST.d28) { fetch28(); return '<div class="empty" style="flex:1"><p class="thinking"><b>Lade Frequenz …</b></p></div>'; }
  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], cnt = days.map(() => Array(24).fill(0));
  ST.d28.rows.forEach(r => { if (r[2] !== 'verkauf') return; const d = new Date(r[0]); cnt[(d.getDay() + 6) % 7][d.getHours()]++; });
  if (!ST.d28.rows.length) return `<div class="empty" style="flex:1"><div class="empty-icon">${ic('users')}</div><h3>Noch keine Verkäufe</h3><p>Die Frequenz ergibt sich aus den Belegen der letzten 4 Wochen.</p></div>`;
  const used = cnt.flatMap(d => d.map((v, h) => v ? h : null)).filter(h => h != null);
  let h0 = Math.min(9, ...used); h0 = Math.min(h0, 24 - 10); const hrs = Array.from({length: 10}, (_, i) => h0 + i);
  const showDays = cnt[6].some(Boolean) ? days : days.slice(0, 6);
  const max = Math.max(1, ...showDays.flatMap((_, i) => hrs.map(h => cnt[i][h])));
  let h = '<div class="heat" role="img" aria-label="Verkäufe nach Wochentag und Stunde, letzte 4 Wochen">';
  showDays.forEach((dn, i) => { h += `<span class="hl">${dn}</span>`; hrs.forEach(hr => { const v = cnt[i][hr], p = v / max; h += `<span class="hc" style="--v:${Math.round(6 + p * 86)}%" data-tip="${dn} ${hr}–${hr + 1} Uhr · ${v} ${v === 1 ? 'Bon' : 'Bons'}"></span>`; }); });
  h += '<span></span>' + hrs.map(hr => `<span class="hx">${hr}</span>`).join('') + '</div>';
  return h + `<div class="legend" style="margin-top:10px"><span>wenig</span><span style="width:84px;height:6px;border-radius:3px;background:linear-gradient(90deg,color-mix(in oklab,var(--accent) 6%,var(--surface-2)),var(--accent))"></span><span>viel</span><span class="muted" style="margin-left:auto">Bons der letzten 4 Wochen · lokale Datenbank</span></div>`;
}
function realLowRows() {
  const sold = {}; (ST.d28?.items || []).forEach(i => { sold[i.sku] = i.qty; });
  return ART.filter(a => !wgService(a.cat)).flatMap(a => a.variants.filter(v => v.q <= 2).map(v => ({a, v, s: sold[a.id] || 0})))   // Dienstleistungen haben keinen Bestand
    .sort((x, y) => (y.s - x.s) || (x.v.q - y.v.q) || (y.a.pop || 0) - (x.a.pop || 0));
}
function realLowHTML(it) {
  if (!ST.d28) fetch28();
  const rows = realLowRows();
  if (!rows.length) return `<div class="empty" style="flex:1"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><h3>Alles im grünen Bereich</h3><p>Keine Variante mit 2 Stück oder weniger.</p></div>`;
  return `<div class="wl">${rows.slice(0, it.s === 'wide' ? 4 : 5).map(({a, v, s}) => { const c = COLORS[v.c]?.[1] || '#888'; return `<div class="wl-row"><span class="thumb" style="--c:${c}">${glyph(a.g, c)}</span><div class="wl-main"><div class="wl-t">${esc(a.name)}</div><div class="wl-s">${esc(COLORS[v.c]?.[0] || v.c)}${v.s !== 'Einheitsgröße' ? ' · ' + esc(v.s) : ''} · <span style="color:${v.q <= 0 ? 'var(--neg)' : 'var(--warn)'}">${v.q <= 0 ? 'ausverkauft' : `noch ${v.q}`}</span>${s ? ` · ${s} verk. in 4 Wo.` : ''}</div></div><button class="btn btn-secondary btn-sm" data-act="book" data-perm="bestand.buchen" data-ean="${esc(v.ean)}">${ic('boxes', 'i-sm')}${it.s === 'wide' ? 'Zugang buchen' : 'Buchen'}</button></div>`; }).join('')}</div><div class="wl-foot">${ic('database', 'i-xs')} ${rows.length} Varianten knapp · sortiert nach Abverkauf der letzten 4 Wochen</div>`;
}
function realRegistersHTML() {
  const d = ST.cache.heute;
  return `<div style="flex:1;min-height:0;overflow:auto">
    <div class="reg"><span class="reg-ic">${ic('register', 'i-sm')}</span><div class="wl-main"><div class="wl-t">${esc(CFG['kasse.name'])} · ${esc(CFG['kasse.id'])}</div><div class="wl-s">${esc(S.user.name)} · heute ${d ? num(d.bons) : '…'} Bons · ${d ? eur0(d.rev) : '…'}</div></div>${statusPill(['Diese Kasse', 'pos'])}</div>
    ${typeof vbOn === 'function' && vbOn() ? (VB.info?.stores || []).filter(x => x.id !== vbOwn()).map(x => { const ago = x.last_sync ? (Date.now() - new Date(x.last_sync)) / 60000 : Infinity; return `<div class="reg"><span class="reg-ic">${ic('store', 'i-sm')}</span><div class="wl-main"><div class="wl-t">${esc(x.name)} · ${esc(x.id)}</div><div class="wl-s">${x.last_sync ? `heute ${num(x.sales_today || 0)} Bons · ${eur0((x.revenue_today || 0) / 100)} · Abgleich ${esc(fmtTs(x.last_sync))}` : 'noch nicht verbunden'}</div></div>${statusPill(x.active === false ? ['inaktiv', ''] : ago < 3 ? ['online', 'pos'] : x.last_sync ? ['offline', 'warn'] : ['wartet', ''])}</div>`; }).join('') || '<div class="muted" style="font-size:12.5px;padding:8px 2px">Noch keine Filiale angelegt – unter Filialen.</div>'
      : `<div class="reg" style="opacity:.75"><span class="reg-ic">${ic('server', 'i-sm')}</span><div class="wl-main"><div class="wl-t">Weitere Kassen</div><div class="wl-s">Einzelplatz · Filialverbund unter Einstellungen</div></div><button class="btn btn-ghost btn-sm" data-goto="einstellungen">Einrichten</button></div>`}
  </div><div class="note" style="margin-top:10px">${ic('shield')}<span>${S.rksv?.active ? `RKSV-Testmodus aktiv · Kassen-ID ${esc(S.rksv.kassen_id)} · Software-Schlüssel (nicht registrierbar)` : 'RKSV nicht in Betrieb – Einstellungen → RKSV → Testbetrieb starten'}</span>${S.rksv?.active ? `<button class="btn btn-secondary btn-sm" data-act="dep" style="margin-left:auto;flex:none">DEP-Export</button>` : ''}</div>`;
}
function realSystemHTML() {
  const i = S.info || {};
  return `<div style="flex:1;min-height:0;overflow:auto">
    <div class="ops-row">${ic('database', 'i-sm')}<div class="k"><b>${esc(backupLabel())}</b>Datenbank ${i.db_bytes ? fmtBytes(i.db_bytes) : ''} · Prüfsumme & Integrität bei jeder Sicherung</div><button class="btn btn-secondary btn-sm" data-act="backup">Jetzt sichern</button></div>
    ${updWidgetRow()}
    <div class="ops-row">${ic('server', 'i-sm')}<div class="k"><b>${typeof vbStatus === 'function' && vbStatus() ? esc(vbStatus().text) : 'Einzelplatz'}</b>${esc(i.data_dir || 'lokales Datenverzeichnis')}</div></div>
    <div class="ops-row" style="opacity:.6">${ic('sparkle', 'i-sm')}<div class="k"><b>KI lokal</b>Vorschau – Modell wird in einem späteren Paket angebunden</div></div>
  </div><div class="wl-foot" style="margin-top:6px">${ic('info', 'i-xs')} Backups liegen in Ihrer Verantwortung – Kontor stellt die Werkzeuge.</div>`;
}
