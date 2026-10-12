
/* ════════════════════════════════════════════════════════════════════
   9 · DASHBOARD
   Layout = JSON (Typ + Größe je Widget). Widgets kommen aus einer
   Registry – Kern, Erweiterungen und eigene Abfrage-Widgets gleichrangig.
   ════════════════════════════════════════════════════════════════════ */
const PLBL = {heute: 'heute', woche: 'diese Woche', monat: 'diesen Monat', saison: 'diese Saison'};
const PNAME = {heute: 'Heute', woche: 'Woche', monat: 'Monat', saison: 'Saison'};
const PMULT = {heute: 1, woche: 5.6, monat: 23, saison: 132};
const SIZE_LBL = {s: '¼', tall: '⅓', m: '½', wide: '½', l: '⅔', xl: '1/1'};
const SIZE_ORDER = ['s', 'tall', 'm', 'wide', 'l', 'xl'];
const PRESETS = {
  filialleitung: {name: 'Filialleitung', d: 'Umsatz, KI-Hinweise, Bestand und Betrieb', w: [['sales.revenue', 'm'], ['sales.receipts', 's'], ['sales.basket', 's'], ['sales.chart', 'l'], ['ai.insights', 'tall'], ['sales.top', 'tall'], ['stock.low', 'tall'], ['sales.stores', 'tall'], ['ops.registers', 'tall'], ['ops.system', 'tall'], ['ext.repairs', 'tall']]},
  einkauf: {name: 'Einkauf', d: 'Bestand, Warengruppen und Prognosen', w: [['stock.low', 'wide'], ['ai.insights', 'wide'], ['sales.categories', 'wide'], ['sales.top', 'wide'], ['sales.heatmap', 'xl']]},
  kasse: {name: 'Kassa-Team', d: 'Tagesziel, Frequenz und Kassenstatus', w: [['sales.goal', 'm'], ['sales.receipts', 's'], ['sales.basket', 's'], ['sales.heatmap', 'l'], ['ops.registers', 'tall'], ['sales.top', 'wide'], ['ext.rental', 'wide']]},
};
const fromPreset = k => PRESETS[k].w.map(([t, s]) => ({id: uid(), t, s}));
const Dash = {
  period: 'heute', editing: false, noAnim: false,
  preset: persist.get('preset', 'filialleitung'),
  layout: persist.get('layout', null),
  session: {rev: 0, bons: 0},
  dismissed: new Set(), accepted: new Set(),
};
if (!Array.isArray(Dash.layout) || !Dash.layout.length) Dash.layout = fromPreset('filialleitung');
const saveLayout = () => { persist.set('layout', Dash.layout); persist.set('preset', Dash.preset); };

/* ── Datenerzeugung (Testdaten, deterministisch) ── */
function profile(seed, noise) {
  const r = rng(seed); const w = [];
  for (let i = 0; i < 20; i++) { const t = 9.25 + i * .5; w.push((.55 + 1.15 * Math.exp(-((t - 12.3) ** 2) / 1.5) + 1.45 * Math.exp(-((t - 16.8) ** 2) / 2.1)) * (1 + (r() - .5) * 2 * noise)); }
  const s = w.reduce((a, b) => a + b, 0); return w.map(v => v / s);
}
const cumul = (total, prof) => { const c = [0]; prof.forEach(p => c.push(c[c.length - 1] + p * total)); return c; };
const atT = (c, t) => { const x = (t - 9) / .5; const i = clamp(Math.floor(x), 0, c.length - 2); const f = clamp(x - i, 0, 1); return c[i] + (c[i + 1] - c[i]) * f; };
function interpPts(pts, x) {
  if (!pts.length || x < pts[0].x - 1e-6 || x > pts[pts.length - 1].x + 1e-6) return null;
  for (let i = 1; i < pts.length; i++) if (x <= pts[i].x + 1e-9) { const a = pts[i - 1], b = pts[i]; const f = b.x === a.x ? 1 : (x - a.x) / (b.x - a.x); return a.y + (b.y - a.y) * f; }
  return pts[pts.length - 1].y;
}
const storeFactor = () => S.store === 'ALL' ? STORES.reduce((a, s) => a + s.f, 0) : storeObj().f;
function cumulSeries(vals, upto, frac, extra, fcMul = 1.02) {
  const actual = [{x: 0, y: 0}], fc = []; let acc = 0;
  for (let i = 0; i < upto; i++) { acc += vals[i]; actual.push({x: i + 1, y: acc}); }
  acc += vals[upto] * frac + extra; actual.push({x: upto + frac, y: acc});
  let f = acc; fc.push({x: upto + frac, y: f});
  if (upto < vals.length) { f += vals[upto] * (1 - frac) * fcMul; fc.push({x: upto + 1, y: f}); }
  for (let i = upto + 1; i < vals.length; i++) { f += vals[i] * fcMul; fc.push({x: i + 1, y: f}); }
  return {actual, fc, now: acc, end: f};
}
function prevSeries(vals) { const p = [{x: 0, y: 0}]; let a = 0; vals.forEach((v, i) => { a += v; p.push({x: i + 1, y: a}); }); return p; }
function periodData(p) {
  if (DESKTOP) return realPeriodData(p);
  const F = storeFactor(), sess = Dash.session.rev, dayFrac = clamp((DEMO_H - 9) / 10, 0, 1);
  let d;
  if (p === 'heute') {
    const cA = cumul(15240 * F, profile(11, .2)), cP = cumul(13480 * F, profile(7, .16)), cF = cumul(15240 * F, profile(11, 0));
    const now = DEMO_H, nowV = atT(cA, now) + sess;
    const actual = []; for (let t = 9; t < now - 1e-6; t += .5) actual.push({x: t, y: atT(cA, t)}); actual.push({x: now, y: nowV});
    const fc = [{x: now, y: nowV}]; let acc = nowV, tp = now;
    for (let t = Math.floor(now * 2) / 2 + .5; t <= 19 + 1e-6; t += .5) { acc += atT(cF, t) - atT(cF, tp); fc.push({x: t, y: acc}); tp = t; }
    d = {xMin: 9, xMax: 19, xTicks: [9, 11, 13, 15, 17, 19], fx: x => `${pad(x)}:00`, fxTip: x => `${hhmm(x)} Uhr`, actual, fc, prev: cP.map((y, i) => ({x: 9 + i * .5, y})),
      rev: nowV, prevRev: atT(cP, now), end: acc, goal: 14700 * F, since: `bis ${hhmm(now)}`, cmpLbl: 'Vorwoche', nowLbl: 'Heute', basket: 53.8, prevBasket: 54.9, ret: 3.8, prevRet: 4.4};
  } else if (p === 'woche') {
    const di = Math.min(5, (NOW.getDay() + 6) % 7), wf = [.8, .86, .9, 1, 1.16, 1.42], r = rng(31), base = 13900 * F;
    const vals = wf.map(f => f * base * (1 + (r() - .5) * .12)), prevV = wf.map(f => f * base * .93 * (1 + (r() - .5) * .12));
    const c = cumulSeries(vals, di, dayFrac, sess), prev = prevSeries(prevV);
    const DN = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    d = {xMin: 0, xMax: 6, xTicks: [.5, 1.5, 2.5, 3.5, 4.5, 5.5], fx: x => DN[Math.floor(x)], fxTip: x => x === 0 ? 'Wochenbeginn' : `${DN[Math.min(5, Math.ceil(x) - 1)]}${x % 1 ? ' (laufend)' : ' · Tagesende'}`, actual: c.actual, fc: c.fc, prev,
      rev: c.now, prevRev: interpPts(prev, di + dayFrac), end: c.end, goal: 86000 * F, since: 'bis jetzt', cmpLbl: 'Vorwoche', nowLbl: 'Diese Woche', basket: 55.2, prevBasket: 54.1, ret: 4.1, prevRet: 4.3};
  } else if (p === 'monat') {
    const dim = new Date(YEAR, NOW.getMonth() + 1, 0).getDate(), di = NOW.getDate() - 1, r = rng(41), base = 13900 * F;
    const wd = i => new Date(YEAR, NOW.getMonth(), i + 1).getDay();
    const fac = [0, .8, .86, .9, 1, 1.16, 1.42];
    const vals = Array.from({length: dim}, (_, i) => fac[wd(i)] * base * (1 + (r() - .5) * .14));
    const prevV = Array.from({length: dim}, (_, i) => fac[wd(i)] * base * .94 * (1 + (r() - .5) * .14));
    const c = cumulSeries(vals, di, dayFrac, sess), prev = prevSeries(prevV);
    const mName = NOW.toLocaleDateString('de-AT', {month: 'short'});
    d = {xMin: 0, xMax: dim, xTicks: [1, 5, 10, 15, 20, 25, dim].map(x => x - .5), fx: x => `${Math.round(x + .5)}.`, fxTip: x => x === 0 ? 'Monatsbeginn' : `${Math.ceil(x)}. ${mName}`, actual: c.actual, fc: c.fc, prev,
      rev: c.now, prevRev: interpPts(prev, di + dayFrac), end: c.end, goal: 372000 * F, since: 'bis heute', cmpLbl: 'Vormonat', nowLbl: 'Dieser Monat', basket: 56.4, prevBasket: 55.0, ret: 4.0, prevRet: 4.6};
  } else {
    const MN = ['Sep', 'Okt', 'Nov', 'Dez', 'Jan', 'Feb', 'Mär', 'Apr'];
    const vals = [292, 384, 418, 612, 524, 478, 356, 208].map(v => v * 1000 * F), prevV = [271, 352, 402, 590, 498, 451, 371, 196].map(v => v * 1000 * F);
    const m = NOW.getMonth(), si = m >= 8 ? m - 8 : m <= 3 ? m + 4 : 7;
    const frac = m >= 4 && m <= 7 ? 1 : (NOW.getDate() - 1 + dayFrac) / new Date(YEAR, m + 1, 0).getDate();
    const c = cumulSeries(vals, si, frac, sess, 1.03), prev = prevSeries(prevV);
    d = {xMin: 0, xMax: 8, xTicks: MN.map((_, i) => i + .5), fx: x => MN[Math.floor(x)], fxTip: x => x === 0 ? 'Saisonbeginn' : `${MN[Math.min(7, Math.ceil(x) - 1)]}${x % 1 ? ' (laufend)' : ''}`, actual: c.actual, fc: c.fc, prev,
      rev: c.now, prevRev: interpPts(prev, si + frac), end: c.end, goal: 3240000 * F, since: 'bis heute', cmpLbl: 'Vorsaison', nowLbl: 'Saison 26/27', basket: 61.3, prevBasket: 58.9, ret: 4.4, prevRet: 4.9};
  }
  d.p = p; d.F = F;
  d.bons = Math.round(d.rev / d.basket) + Dash.session.bons;
  d.prevBons = Math.round(d.prevRev / d.prevBasket);
  d.basket = d.rev / d.bons;
  return d;
}
function sparkVals(seed, prev, cur) { const r = rng(seed); const v = Array.from({length: 11}, () => prev * (.86 + r() * .26)); v.push(cur); return v; }
const sparkHTML = vals => { const mx = Math.max(...vals) || 1; return `<span class="spark" aria-hidden="true">${vals.map(v => `<i style="height:${Math.max(12, v / mx * 100)}%"></i>`).join('')}</span>`; };
function axisFmt(v) {
  if (v === 0) return '0';
  if (v >= 1e6) return `${num(v / 1e6, v % 1e6 ? 1 : 0)} Mio.`;
  if (v >= 1e3) return `${num(v / 1e3, v % 1e3 ? 1 : 0)} Tsd.`;
  return num(v);
}
function niceScale(max, count = 4) {
  if (!(max > 0)) return {top: 100, step: 25};
  const raw = max / count, e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  return {top: Math.ceil(max * 1.04 / step) * step, step};
}
function monotone(P) {
  const n = P.length; if (!n) return ''; const f = v => v.toFixed(1);
  if (n < 3) return `M${P.map(p => `${f(p[0])},${f(p[1])}`).join('L')}`;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0]; m[i] = (P[i + 1][1] - P[i][1]) / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const s = 3 / Math.sqrt(h); t[i] = s * a * m[i]; t[i + 1] = s * b * m[i]; }
  }
  let d = `M${f(P[0][0])},${f(P[0][1])}`;
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += `C${f(P[i][0] + h)},${f(P[i][1] + h * t[i])} ${f(P[i + 1][0] - h)},${f(P[i + 1][1] - h * t[i + 1])} ${f(P[i + 1][0])},${f(P[i + 1][1])}`; }
  return d;
}
const dedupe = pts => pts.reduce((o, p) => { if (o.length && Math.abs(o[o.length - 1].x - p.x) < 1e-6) o[o.length - 1] = p; else o.push(p); return o; }, []);

/* ── Liniendiagramm: Ist (Akzent), Prognose (gestrichelt), Vorperiode (neutral) ── */
const chartFns = new WeakMap();
const chartRO = new ResizeObserver(es => es.forEach(e => { const fn = chartFns.get(e.target); fn && fn(); }));
function mountChart(host, fn) { chartFns.set(host, fn); chartRO.observe(host); }
function lineChart(host, d) {
  const W0 = host.clientWidth, H0 = host.clientHeight; if (W0 < 80 || H0 < 70) return;
  host._id ||= uid();
  const m = {t: 18, r: 14, b: 26, l: 58}, iw = W0 - m.l - m.r, ih = H0 - m.t - m.b;
  const act = dedupe(d.actual), fc = dedupe(d.fc), prev = dedupe(d.prev);
  const {top, step} = niceScale(Math.max(...act.map(p => p.y), ...fc.map(p => p.y), ...prev.map(p => p.y)));
  const X = x => m.l + (x - d.xMin) / (d.xMax - d.xMin) * iw, Y = y => m.t + ih - y / top * ih;
  const first = !host._drawn && !Dash.noAnim; host._drawn = true;
  const P = pts => pts.map(p => [X(p.x), Y(p.y)]);
  const aN = act[act.length - 1], a0 = act[0], pAct = monotone(P(act));
  let s = `<svg width="${W0}" height="${H0}" viewBox="0 0 ${W0} ${H0}" role="img" aria-label="Kumulierter Umsatz ${PLBL[d.p]} im Vergleich zur ${d.cmpLbl}"><defs><linearGradient id="ga-${host._id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.2"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>`;
  for (let v = 0; v <= top + 1e-6; v += step) { const y = Math.round(Y(v)) + .5; s += `<line class="gl" x1="${m.l}" x2="${W0 - m.r}" y1="${y}" y2="${y}"/><text class="ax" x="${m.l - 10}" y="${y + 4}" text-anchor="end">${axisFmt(v)}</text>`; }
  d.xTicks.forEach(x => { s += `<text class="ax" x="${X(x).toFixed(1)}" y="${H0 - 6}" text-anchor="middle">${esc(d.fx(x))}</text>`; });
  const anim = first ? 'pathLength="1" class="draw"' : '';
  s += `<path d="${monotone(P(prev))}" fill="none" style="stroke:var(--chart-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${anim}/>`;
  s += `<path d="${pAct}L${X(aN.x).toFixed(1)},${Y(0)}L${X(a0.x).toFixed(1)},${Y(0)}Z" fill="url(#ga-${host._id})" class="${first ? 'fadein' : ''}"/>`;
  s += `<path d="${monotone(P(fc))}" fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round" opacity=".8" class="${first ? 'fadein' : ''}"/>`;
  s += `<path d="${pAct}" fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${anim}/>`;
  const nx = X(aN.x).toFixed(1);
  s += `<line x1="${nx}" x2="${nx}" y1="${m.t}" y2="${m.t + ih}" style="stroke:var(--line-3)" stroke-width="1"/><text class="ax" x="${nx}" y="${m.t - 6}" text-anchor="middle" style="fill:var(--text-2);font-weight:550">jetzt</text>`;
  s += `<circle cx="${nx}" cy="${Y(aN.y).toFixed(1)}" r="4.5" style="fill:var(--accent);stroke:var(--surface)" stroke-width="2" class="${first ? 'fadein' : ''}"/>`;
  s += `<g class="hov" style="opacity:0;transition:opacity .12s"><line class="hx" y1="${m.t}" y2="${m.t + ih}" style="stroke:var(--text-3)" stroke-width="1"/><circle class="h2" r="4" style="fill:var(--chart-muted);stroke:var(--surface)" stroke-width="2"/><circle class="h1" r="4.5" style="fill:var(--accent);stroke:var(--surface)" stroke-width="2"/></g>`;
  s += `<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" tabindex="0" style="outline:none" aria-label="Werte mit Pfeiltasten anzeigen"/></svg><div class="tip" role="tooltip"></div>`;
  host.innerHTML = s;
  const xs = [...new Set([...prev, ...act, ...fc].map(p => +p.x.toFixed(4)))].sort((a, b) => a - b);
  const svg = $('svg', host), hov = $('.hov', svg), tip = $('.tip', host), hit = $('.hit', svg);
  let idx = -1;
  const row = (val, label, key) => {
    const r = document.createElement('div'); r.className = 'tip-r';
    const k = document.createElement('i'); k.className = 'lk' + (key === 'dash' ? ' fc' : ''); k.style.color = key === 'muted' ? 'var(--chart-muted)' : 'var(--accent)';
    const b = document.createElement('b'); b.textContent = eur0(val);
    const sp = document.createElement('span'); sp.textContent = label;
    r.append(k, b, sp); return r;
  };
  const show = i => {
    idx = clamp(i, 0, xs.length - 1); const x = xs[idx];
    const isAct = x <= aN.x + 1e-6, v1 = isAct ? interpPts(act, x) : interpPts(fc, x), v0 = interpPts(prev, x), cx = X(x);
    hov.style.opacity = 1;
    const hx = $('.hx', hov); hx.setAttribute('x1', cx); hx.setAttribute('x2', cx);
    const h1 = $('.h1', hov), h2 = $('.h2', hov);
    h1.setAttribute('cx', cx); h1.setAttribute('cy', Y(v1 ?? 0)); h1.style.display = v1 == null ? 'none' : '';
    h2.setAttribute('cx', cx); h2.setAttribute('cy', Y(v0 ?? 0)); h2.style.display = v0 == null ? 'none' : '';
    tip.replaceChildren();
    const h = document.createElement('div'); h.className = 'tip-h'; h.textContent = d.fxTip(x); tip.append(h);
    if (v1 != null) tip.append(row(v1, isAct ? d.nowLbl : 'Prognose (lokal)', isAct ? 'solid' : 'dash'));
    if (v0 != null) tip.append(row(v0, d.cmpLbl, 'muted'));
    const tw = tip.offsetWidth || 170; tip.style.left = (cx + 14 + tw > W0 ? cx - tw - 14 : cx + 14) + 'px'; tip.style.top = m.t + 'px';
    tip.classList.add('on');
  };
  const hide = () => { hov.style.opacity = 0; tip.classList.remove('on'); };
  hit.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), xv = d.xMin + (e.clientX - r.left - m.l) / iw * (d.xMax - d.xMin);
    let best = 0, bd = Infinity; xs.forEach((x, i) => { const dd = Math.abs(x - xv); if (dd < bd) { bd = dd; best = i; } });
    if (best !== idx || !tip.classList.contains('on')) show(best);
  });
  hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
  hit.addEventListener('focus', () => show(xs.findIndex(x => x >= aN.x - 1e-6)));
  hit.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { show(idx + 1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { show(idx - 1); e.preventDefault(); } });
}

/* ── Widget-Bausteine ── */
function kpiHTML({label, value, delta, goodDown = false, cmp, spark, hero}) {
  const fin = Number.isFinite(delta), good = !fin || Math.abs(delta) < .05 ? 'flat' : (delta > 0) !== goodDown ? 'up' : 'down';
  return `<div class="kpi ${hero ? 'hero' : ''}"><div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="delta ${good}" style="margin-left:auto" title="Veränderung zur Vorperiode">${fin ? ic(delta >= 0 ? 'up' : 'down') + pct(delta) : 'kein Vergleich'}</span></div>
    <div class="kpi-val">${value}</div><div class="kpi-foot"><span class="kpi-cmp">${esc(cmp)}</span>${spark || ''}</div></div>`;
}
const LOW = [
  {id: 'A3001', c: 'fels', s: '42', days: 3, sug: 'Umlagern 4 aus Salzburg', icon: 'swap'},
  {id: 'A1001', c: 'moos', s: 'M', days: 4, sug: 'Nachbestellen 6', icon: 'truck'},
  {id: 'A3002', c: 'gletscher', s: '43', days: 5, sug: 'Nachbestellen 8', icon: 'truck'},
  {id: 'A7001', c: 'glut', s: 'Einheitsgröße', days: 6, sug: 'Nachbestellen 24', icon: 'truck'},
  {id: 'A5002', c: 'nacht', s: 'M', days: 7, sug: 'Umlagern 2 aus Kitzbühel', icon: 'swap'},
];
const INSIGHTS = [
  {id: 'i1', icon: 'swap', tone: 'accent', t: 'Umlagerung empfohlen', conf: 92, p: 'Hochtor GTX in Gr. 42–44 reicht in Innsbruck noch 3 Tage, in Salzburg 41 Tage. 6 Paar umlagern sichert voraussichtlich € 1.380 Umsatz.', a: 'Umlagerung anlegen'},
  {id: 'i2', icon: 'alert', tone: 'warn', t: 'Auffällige Retourenquote', conf: 87, p: 'Talwind Softshell (Schiefer): 18 % Retouren statt Ø 4 %. Häufigster Grund laut Erfassung: „fällt klein aus“.', a: 'Größenhinweis ergänzen'},
  {id: 'i3', icon: 'users', tone: 'info', t: 'Frequenzprognose Samstag', conf: 81, p: '+34 % Kundenfrequenz gegenüber Ø erwartet (Ferienbeginn in Bayern). Zweite Kasse ab 10:00 besetzen.', a: 'Dienstplan öffnen'},
  {id: 'i4', icon: 'tag', tone: 'accent', t: 'Preis prüfen', conf: 74, p: 'Firnlicht Daunenjacke verkauft sich trotz −21 % unter Plan. Der Abverkauf korreliert eher mit der Farbe Beere als mit dem Preis.', a: 'Analyse ansehen'},
];
const REPAIRS = [
  {t: 'Skiservice Komplett', c: 'Anna Gruber', due: 'heute 17:00', st: ['Abholbereit', 'pos']},
  {t: 'Bindung montieren · Tour 88', c: 'Jonas Egger', due: 'morgen', st: ['In Arbeit', 'warn']},
  {t: 'Reißverschluss tauschen', c: 'Sophie Wieser', due: 'Fr', st: ['Angenommen', '']},
  {t: 'Bergschuh neu besohlen', c: 'Markus Hofer', due: '24.10.', st: ['Beim Partner', 'info']},
];
const RENTALS = [
  {t: 'Tourenset Damen · 164', c: 'Familie Rainer', due: '10:00', st: ['Zurück', 'pos']},
  {t: 'Schneeschuhe Gr. 42', c: 'Paul Krismer', due: '12:00', st: ['Überfällig', 'neg']},
  {t: 'Lawinenset LVS', c: 'Bergschule Inntal', due: '16:00', st: ['Offen', '']},
  {t: 'Kinderski 120 + Helm', c: 'Familie Obex', due: '17:30', st: ['Offen', '']},
];
function topRows(d) {
  const ids = ['A1001', 'A3001', 'A7001', 'A1002', 'A3002', 'A6001', 'A2001'], u = [14, 11, 9, 8, 7, 6, 6];
  const rows = ids.filter(id => artById(id)).map((id, i) => { const a = artById(id); const units = Math.max(1, Math.round(u[i] * PMULT[d.p] * d.F)); return {a, units, rev: units * (a.sale || a.price)}; }).sort((x, y) => y.rev - x.rev);
  return rows;
}
function listRows(rows, n) {
  const mx = Math.max(...rows.map(r => r.rev));
  return rows.slice(0, n).map((r, i) => `<div class="wl-row"><span class="wl-rank">${i + 1}</span><span class="thumb" style="--c:${COLORS[r.a.colors[0]][1]}">${glyph(r.a.g, COLORS[r.a.colors[0]][1])}</span><div class="wl-main"><div class="wl-t">${esc(r.a.name)}</div><div class="minibar"><i style="width:${r.rev / mx * 100}%"></i></div></div><div class="wl-v">${eur0(r.rev)}<small>${num(r.units)} Stk.</small></div></div>`).join('');
}
function hbars(rows, me, fmt, sub) {
  const max = Math.max(...rows.map(r => Math.max(r.v, r.goal || 0))) * 1.06;
  return `<div class="hbars">${rows.map((r, i) => `<div class="hb ${me(r) ? 'me' : ''}" tabindex="0" data-tip="${esc(r.name)}: ${esc(fmt(r.v))}${r.goal ? ` · Ziel ${esc(fmt(r.goal))}` : ''}"><span class="lbl">${esc(r.name)}</span><span class="track"><span class="bar" style="width:${(r.v / max * 100).toFixed(1)}%;animation-delay:${i * 50}ms"></span>${r.goal ? `<span class="goal" style="left:${(r.goal / max * 100).toFixed(1)}%"></span>` : ''}</span><span class="v">${esc(fmt(r.v))}${sub ? `<small>${esc(sub(r))}</small>` : ''}</span></div>`).join('')}</div>`;
}
function heatHTML() {
  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], wf = [.75, .8, .85, .95, 1.1, 1.45], r = rng(5);
  const vals = days.map((_, i) => Array.from({length: 10}, (_, h) => { const t = 9.5 + h; return wf[i] * (.5 + 1.1 * Math.exp(-((t - 12.4) ** 2) / 1.6) + 1.3 * Math.exp(-((t - 16.6) ** 2) / 2.2)) * (1 + (r() - .5) * .25); }));
  const max = Math.max(...vals.flat());
  let h = '<div class="heat" role="img" aria-label="Kundenfrequenz nach Wochentag und Stunde">';
  days.forEach((dn, i) => { h += `<span class="hl">${dn}</span>`; vals[i].forEach((v, k) => { const p = v / max; h += `<span class="hc" style="--v:${Math.round(6 + p * 86)}%" data-tip="${dn} ${9 + k}–${10 + k} Uhr · Ø ${Math.round(p * 68)} Besuche"></span>`; }); });
  h += '<span></span>' + Array.from({length: 10}, (_, k) => `<span class="hx">${9 + k}</span>`).join('') + '</div>';
  return h + `<div class="legend" style="margin-top:10px"><span>wenig</span><span style="width:84px;height:6px;border-radius:3px;background:linear-gradient(90deg,color-mix(in oklab,var(--accent) 6%,var(--surface-2)),var(--accent))"></span><span>viel</span><span class="muted" style="margin-left:auto">Ø letzte 4 Wochen · Frequenzzähler Eingang</span></div>`;
}
const statusPill = ([t, tone]) => `<span class="pill ${tone}" style="height:20px">${tone === 'pos' ? ic('check') : tone === 'neg' ? ic('alert') : '<span class="dot"></span>'}${esc(t)}</span>`;
const extRows = rows => rows.map(r => `<div class="wl-row"><div class="wl-main"><div class="wl-t">${esc(r.t)}</div><div class="wl-s">${esc(r.c)} · ${esc(r.due)}</div></div>${statusPill(r.st)}</div>`).join('');

const W = {
  'sales.revenue': {title: 'Umsatz', cat: 'Verkauf', icon: 'chart', desc: 'Umsatz im Zeitraum, Vergleich zur Vorperiode und 12-Perioden-Trend.', sizes: ['m', 's'], bare: true,
    body: (it, d) => kpiHTML({label: `Umsatz ${PLBL[d.p]}`, value: eur0(d.rev), delta: (d.rev / d.prevRev - 1) * 100, hero: it.s === 'm', cmp: it.s === 'm' ? `vs. ${eur0(d.prevRev)} ${d.cmpLbl} ${d.since}` : `${d.cmpLbl}: ${eur0(d.prevRev)}`, spark: sparkHTML(d.sparks?.rev || sparkVals(3, d.prevRev, d.rev))})},
  'sales.receipts': {title: 'Bons', cat: 'Verkauf', icon: 'receipt', desc: 'Anzahl Verkaufsbelege inkl. Vergleich.', sizes: ['s', 'm'], bare: true,
    body: (it, d) => kpiHTML({label: `Bons ${PLBL[d.p]}`, value: num(d.bons), delta: (d.bons / d.prevBons - 1) * 100, cmp: `${d.cmpLbl}: ${num(d.prevBons)}`, spark: sparkHTML(d.sparks?.bons || sparkVals(5, d.prevBons, d.bons))})},
  'sales.basket': {title: 'Ø Bon', cat: 'Verkauf', icon: 'bag', desc: 'Durchschnittlicher Bonwert.', sizes: ['s', 'm'], bare: true,
    body: (it, d) => kpiHTML({label: 'Ø Bonwert', value: eur(d.basket), delta: (d.basket / d.prevBasket - 1) * 100, cmp: `${d.cmpLbl}: ${eur(d.prevBasket)}`, spark: sparkHTML(d.sparks?.basket || sparkVals(9, d.prevBasket, d.basket))})},
  'sales.returns': {title: 'Retourenquote', cat: 'Verkauf', icon: 'return', desc: 'Anteil retournierter Positionen – weniger ist besser.', sizes: ['s', 'm'], bare: true,
    body: (it, d) => kpiHTML({label: 'Retourenquote', value: `${num(d.ret, 1)} %`, delta: (d.ret / d.prevRet - 1) * 100, goodDown: true, cmp: `${d.cmpLbl}: ${num(d.prevRet, 1)} %`, spark: d.real ? '' : sparkHTML(sparkVals(13, d.prevRet, d.ret))})},
  'sales.goal': {title: 'Tagesziel', cat: 'Verkauf', icon: 'target', desc: 'Fortschritt zum Ziel mit Soll-Markierung und Prognose.', sizes: ['m', 's'], bare: true,
    body: (it, d) => {
      const p = d.goal ? d.rev / d.goal : 0, soll = d.sollFrac ?? clamp(d.p === 'heute' ? (DEMO_H - 9) / 10 * 1.02 : .55, 0, 1), reach = d.end >= d.goal;
      return `<div class="kpi"><div class="kpi-top"><span class="kpi-label">Ziel ${PLBL[d.p]}</span><span class="pill ${reach ? 'pos' : 'warn'}" style="margin-left:auto;height:20px">${ic(reach ? 'check' : 'alert')}${reach ? 'wird erreicht' : 'gefährdet'}</span></div>
        <div class="kpi-val">${Math.round(p * 100)} %<span style="font-size:14px;color:var(--text-3);font-weight:500;letter-spacing:0;margin-left:8px">${eur0(d.rev)} von ${eur0(d.goal)}</span></div>
        <div style="margin-top:12px;position:relative"><div class="meter"><i style="width:${clamp(p, 0, 1) * 100}%"></i></div><span style="position:absolute;top:-4px;bottom:-4px;width:2px;border-radius:1px;background:var(--text-2);left:${soll * 100}%" title="Soll zum jetzigen Zeitpunkt"></span></div>
        <div class="kpi-foot"><span class="kpi-cmp">Strich = Soll jetzt · Prognose ${eur0(d.end)}</span></div></div>`;
    }},
  'sales.chart': {title: 'Umsatzverlauf', cat: 'Verkauf', icon: 'chart', desc: 'Kumulierter Umsatz mit lokaler Prognose und Vorperiode.', sizes: ['l', 'wide', 'xl'],
    sub: d => `kumuliert · Prognose ${eur0(d.end)}`,
    tools: d => `<div class="legend"><span><i class="lk" style="color:var(--accent)"></i>${esc(d.nowLbl)}</span><span><i class="lk fc"></i>Prognose</span><span><i class="lk" style="color:var(--chart-muted)"></i>${esc(d.cmpLbl)}</span></div>`,
    body: () => '<div class="chart"></div>',
    mount: (el, it, d) => mountChart($('.chart', el), () => lineChart($('.chart', el), d))},
  'sales.top': {title: 'Topseller', cat: 'Verkauf', icon: 'star', desc: 'Meistverkaufte Artikel nach Umsatz.', sizes: ['tall', 'wide'],
    sub: d => `nach Umsatz · ${PLBL[d.p]}`,
    body: (it, d) => { const rows = d.real ? d.top : topRows(d); return rows.length ? `<div class="wl">${listRows(rows, 5)}</div>` : emptyW('star', d.loading ? 'Lade …' : 'Noch keine Verkäufe', `Topseller ${PLBL[d.p]} erscheinen nach den ersten Verkäufen.`); }},
  'sales.stores': {title: 'Filialvergleich', cat: 'Verkauf', icon: 'store', desc: 'Umsatz je Filiale mit Zielmarke.', sizes: ['tall', 'wide'],
    sub: () => DESKTOP ? 'Strich = Tagesziel × Zeitraum' : 'Strich = Ziel',
    tools: () => DESKTOP ? '' : `<div class="legend"><span><i class="lk box" style="background:var(--accent)"></i>${S.store === 'ALL' ? 'Alle' : 'Ihre Filiale'}</span>${S.store === 'ALL' ? '' : '<span><i class="lk box" style="background:var(--chart-muted)"></i>Andere</span>'}</div>`,
    demo: true,
    body: (it, d) => { if (d.real) return hbars([{id: S.store, name: `${CFG['kasse.name']} (diese Kasse)`, v: Math.max(0, d.rev), goal: d.goal}], () => true, eur0, x => x.goal ? `${Math.round(x.v / x.goal * 100)} % v. Ziel` : '') + `<div class="wl-foot">${ic('server', 'i-xs')} Weitere Filialen erscheinen mit dem Filial-Server</div>`;
      const base = d.rev / d.F; const r = rng(77); const rows = STORES.map(s => ({id: s.id, name: s.name, v: base * s.f, goal: base * s.f / (.86 + r() * .24)})).sort((a, b) => b.v - a.v); return hbars(rows, x => S.store === 'ALL' || x.id === S.store, eur0, x => `${Math.round(x.v / x.goal * 100)} % v. Ziel`); }},
  'sales.categories': {title: 'Warengruppen', cat: 'Verkauf', icon: 'tag', desc: 'Umsatzanteile nach Warengruppe.', sizes: ['wide', 'tall'],
    sub: d => `Anteil am Umsatz ${PLBL[d.p]}`,
    body: (it, d) => { if (d.real) return d.cats.length ? hbars(d.cats, () => true, eur0, x => `${Math.round(x.s * 100)} %`) : emptyW('tag', d.loading ? 'Lade …' : 'Noch keine Verkäufe', 'Anteile je Warengruppe nach den ersten Verkäufen.');
      const sh = [['Jacken & Westen', .31], ['Schuhe', .22], ['Hosen', .14], ['Ski & Touren', .13], ['Shirts & Layer', .09], ['Rucksäcke', .06], ['Accessoires', .05]]; return hbars(sh.map(([name, s]) => ({name, v: d.rev * s, s})), () => true, eur0, x => `${Math.round(x.s * 100)} %`); }},
  'sales.heatmap': {title: 'Kundenfrequenz', cat: 'Verkauf', icon: 'users', desc: 'Besuche nach Wochentag und Stunde.', sizes: ['l', 'xl', 'wide'],
    sub: () => DESKTOP ? 'Bons · letzte 4 Wochen' : 'Wochentag × Stunde', body: () => DESKTOP ? realHeatHTML() : heatHTML()},
  'stock.low': {title: 'Bestandswarnungen', cat: 'Bestand', icon: 'boxes', desc: 'Varianten mit knapper Reichweite und Vorschlag der lokalen KI.', sizes: ['tall', 'wide'],
    sub: () => DESKTOP ? '2 Stück oder weniger' : 'Reichweite < 7 Tage',
    tools: () => DESKTOP ? '' : '<span class="ai-chip">' + ic('sparkle', 'i-xs') + 'KI</span>',
    body: (it) => {
      if (DESKTOP) return realLowHTML(it);
      const rows = LOW.filter(l => artById(l.id) && !Dash.accepted.has(l.id + l.c + l.s));
      if (!rows.length) return `<div class="empty" style="flex:1"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><h3>Alles im grünen Bereich</h3><p>Keine Variante unter 7 Tagen Reichweite.</p></div>`;
      return `<div class="wl">${rows.slice(0, 4).map(l => { const a = artById(l.id), v = variant(a, l.c, l.s); return `<div class="wl-row" data-low="${l.id + l.c + l.s}"><span class="thumb" style="--c:${COLORS[l.c][1]}">${glyph(a.g, COLORS[l.c][1])}</span><div class="wl-main"><div class="wl-t">${esc(a.name)}</div><div class="wl-s">${COLORS[l.c][0]}${l.s !== 'Einheitsgröße' ? ' · ' + esc(l.s) : ''} · Bestand ${v.q} · <span style="color:${l.days <= 4 ? 'var(--warn)' : 'inherit'}">${l.days} Tage</span></div></div><button class="btn btn-secondary btn-sm" data-act="low" data-key="${l.id + l.c + l.s}" title="${esc(l.sug)}">${ic(l.icon, 'i-sm')}${it.s === 'wide' ? esc(l.sug) : esc(l.sug.match(/\d+/)[0])}</button></div>`; }).join('')}</div><div class="wl-foot">${ic('server', 'i-xs')} Vorschläge lokal berechnet · Lieferzeiten berücksichtigt</div>`;
    }},
  'ai.insights': {title: 'KI-Hinweise', cat: 'KI', icon: 'sparkle', desc: 'Anomalien, Prognosen und nächste Schritte – lokal berechnet.', sizes: ['tall', 'wide'], demo: true,
    tools: () => `<span class="ai-chip"><span class="dot live"></span>lokal</span>`,
    body: () => {
      const rows = INSIGHTS.filter(x => !Dash.dismissed.has(x.id));
      if (!rows.length) return `<div class="empty" style="flex:1"><div class="empty-icon">${ic('sparkle')}</div><h3>Keine offenen Hinweise</h3><p>Neue Hinweise erscheinen, sobald das Modell etwas Relevantes erkennt.</p></div>`;
      return `<div class="ins">${rows.map(x => `<div class="in" data-in="${x.id}"><div class="in-h"><span style="color:var(--${x.tone})">${ic(x.icon)}</span>${esc(x.t)}<span class="conf">${x.conf} % sicher</span></div><p>${esc(x.p)}</p><div class="in-a"><button class="btn btn-secondary btn-sm" data-act="ins" data-id="${x.id}">${esc(x.a)}</button><button class="btn btn-ghost btn-sm" data-act="ins-x" data-id="${x.id}">Verwerfen</button></div></div>`).join('')}</div>`;
    }},
  'ops.registers': {title: 'Kassen & RKSV', cat: 'Betrieb', icon: 'register', desc: 'Kassenstatus, Offline-Warteschlangen und RKSV-Fristen.', sizes: ['tall', 'wide'],
    sub: () => DESKTOP ? 'diese Kasse' : '3 Kassen · Filiale',
    body: () => {
      if (DESKTOP) return realRegistersHTML();
      const k1 = S.online ? statusPill(['Online', 'pos']) : statusPill(['Offline', 'warn']);
      return `<div style="flex:1;min-height:0;overflow:auto">
        <div class="reg"><span class="reg-ic">${ic('register', 'i-sm')}</span><div class="wl-main"><div class="wl-t">${esc(CFG['kasse.name'] || 'Kasse 1')} · ${esc(CFG['kasse.id'] || 'INN-K01')}</div><div class="wl-s">${esc(S.user.name)} · ${num(118 + Dash.session.bons)} Bons${S.queue ? ` · ${S.queue} in Warteschlange` : ''}</div></div>${k1}</div>
        <div class="reg"><span class="reg-ic">${ic('register', 'i-sm')}</span><div class="wl-main"><div class="wl-t">Kasse 2 · INN-K02</div><div class="wl-s">Offline seit 12 min · 3 Belege lokal signiert</div></div>${statusPill(['Offline', 'warn'])}</div>
        <div class="reg"><span class="reg-ic">${ic('phone-pay', 'i-sm')}</span><div class="wl-main"><div class="wl-t">Mobile Kasse · INN-M01</div><div class="wl-s">Tablet · Verkaufsfläche</div></div>${statusPill(['Bereit', ''])}</div>
      </div><div class="note" style="margin-top:10px">${ic('shield')}<span>Monatsbeleg Oktober fällig am 31.10. · Signatureinheiten gültig bis 03/2029.</span><button class="btn btn-secondary btn-sm" data-act="dep" style="margin-left:auto;flex:none">DEP-Export</button></div>`;
    }},
  'ops.system': {title: 'Betrieb', cat: 'Betrieb', icon: 'server', desc: 'Server, Backup-Status und Updates – On-Premise-Werkzeuge.', sizes: ['tall', 'wide'],
    sub: () => DESKTOP ? 'Ihr Rechner' : 'KONTOR-SRV01 · Ihre Infrastruktur',
    body: () => DESKTOP ? realSystemHTML() : `<div class="res"><div><b>18 %</b><div class="meter neutral"><i style="width:18%"></i></div><span style="display:block;margin-top:5px">CPU</span></div><div><b>41 %</b><div class="meter neutral"><i style="width:41%"></i></div><span style="display:block;margin-top:5px">RAM</span></div><div><b>62 %</b><div class="meter neutral"><i style="width:62%"></i></div><span style="display:block;margin-top:5px">Speicher</span></div></div>
      <div style="flex:1;min-height:0;overflow:auto">
      <div class="ops-row">${ic('database', 'i-sm')}<div class="k"><b>${esc(backupLabel())}</b>${DESKTOP ? 'Lokale Datenbank · Prüfsumme & Integrität geprüft' : 'NAS-01 · Integrität geprüft'}</div><button class="btn btn-secondary btn-sm" data-act="backup">Jetzt sichern</button></div>
      ${updWidgetRow()}
      <div class="ops-row">${ic('sparkle', 'i-sm')}<div class="k"><b>KI-Modell bereit</b>lokal · GPU 0 · keine Daten verlassen das Haus</div></div>
      </div><div class="wl-foot" style="margin-top:6px">${ic('info', 'i-xs')} Backups liegen in Ihrer Verantwortung – Kontor stellt die Werkzeuge.</div>`},
  'ext.repairs': {title: 'Reparaturaufträge', cat: 'Erweiterungen', icon: 'wrench', desc: 'Eigene Entität aus der Erweiterung „Werkstatt & Service“.', sizes: ['tall', 'wide'], plugin: 'Werkstatt & Service 1.2', demo: true,
    tools: () => `<span class="w-src">${ic('puzzle', 'i-xs')}Erweiterung</span>`,
    body: () => `<div class="wl">${extRows(REPAIRS)}</div><div class="wl-foot">${ic('puzzle', 'i-xs')} Eigene Entität · 7 Felder · 2 Workflows</div>`},
  'ext.rental': {title: 'Verleih · Rückgaben heute', cat: 'Erweiterungen', icon: 'snow', desc: 'Rückgaben und Überfälliges aus „Verleih Pro“.', sizes: ['wide', 'tall'], plugin: 'Verleih Pro 2.0', demo: true,
    tools: () => `<span class="w-src">${ic('puzzle', 'i-xs')}Erweiterung</span>`,
    body: () => `<div class="wl">${extRows(RENTALS)}</div><div class="wl-foot">${ic('puzzle', 'i-xs')} Verleih Pro 2.0 · Partner-Erweiterung</div>`},
};

/* ── Rendern ── */
const emptyW = (icon, h, p) => `<div class="empty" style="flex:1"><div class="empty-icon">${ic(icon)}</div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;
function greeting() { const h = NOW.getHours(); return h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend'; }
function renderDashboard() {
  const v = $('#view-dashboard');
  const st = storeObj();
  v.innerHTML = `<div class="dash ${Dash.editing ? 'editing' : ''}" id="dash">
    <div class="dash-head">
      <div class="dash-greet"><h2 class="h-title">${greeting()}, ${esc(S.user.name.split(' ')[0])}</h2>
        <div class="dash-meta"><span>${esc(DATE_LONG)}</span><span>·</span><span>${esc(st.name)}</span><span>·</span>${DESKTOP ? `<span class="pill pos"><span class="dot live"></span>Stand ${clock()} · lokale Datenbank</span>` : `<span class="pill pos"><span class="dot live"></span>Live · Stand ${hhmm(DEMO_H)}</span>`}</div></div>
      <div class="dash-controls">
        <div class="seg" id="periodSeg" role="group" aria-label="Zeitraum">${Object.keys(PNAME).map(p => `<button data-p="${p}" aria-pressed="${p === Dash.period}">${PNAME[p]}</button>`).join('')}</div>
        <button class="select-btn" id="dashStore" aria-haspopup="menu">${ic('store', 'i-sm')}${esc(st.name)}${ic('chevron-down', 'i-sm')}</button>
        <button class="btn btn-secondary" id="editBtn">${ic('layout', 'i-sm')}Anpassen</button>
      </div>
      <div class="dash-edit-bar">
        <button class="select-btn" id="presetBtn" aria-haspopup="menu">Vorlage: ${esc(PRESETS[Dash.preset]?.name || 'Eigene')}${ic('chevron-down', 'i-sm')}</button>
        <button class="btn btn-ghost" id="exportBtn">${ic('code', 'i-sm')}JSON</button>
        <button class="btn btn-secondary" id="libBtn">${ic('plus', 'i-sm')}Widget hinzufügen</button>
        <button class="btn btn-primary" id="doneBtn">${ic('check', 'i-sm')}Fertig</button>
      </div>
    </div>
    <form class="ask" id="askForm" autocomplete="off">${ic('sparkle', 'spark')}<input id="askInput" aria-label="Frage an die lokale KI" placeholder="Frag Kontor – z. B. „Welche Artikel mit niedrigem Bestand hatten zuletzt hohen Umsatz?“"><span class="pill plain hide-sm">${ic('server', 'i-xs')}läuft lokal</span><span class="kbd">/</span></form>
    <div class="ask-chips" id="askChips">${['Niedriger Bestand, hoher Umsatz', 'Filialen im Vergleich', 'Warum steigen die Retouren?', 'Prognose bis Ladenschluss'].map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div id="answerSlot"></div>
    <div class="dgrid" id="dgrid"></div>
  </div>`;
  initSeg($('#periodSeg'), b => { Dash.period = b.dataset.p; renderWidgets(false, true); });
  renderWidgets(true);
}
function widgetInner(it, d) {
  const def = W[it.t];
  const sizes = def.sizes.length > 1 ? SIZE_ORDER.filter(s => def.sizes.includes(s)).map(s => `<button data-size="${s}" aria-pressed="${s === it.s}" title="Breite ${SIZE_LBL[s]}${['tall', 'wide', 'l', 'xl'].includes(s) ? ' · doppelte Höhe' : ''}" aria-label="Breite ${SIZE_LBL[s]}">${SIZE_LBL[s]}</button>`).join('') : '';
  const edit = `<div class="w-edit">${sizes}<button class="rm" data-rm title="Entfernen" aria-label="Widget entfernen">${ic('x', 'i-xs')}</button></div>`;
  const demo = DESKTOP && def.demo && !(it.t === 'sales.stores') ? `<span class="pill warn" style="height:20px" title="Beispieldaten – Funktion folgt in einem späteren Paket">Vorschau</span>` : '';
  const head = def.bare ? '' : `<header class="w-head"><span class="w-title">${esc(def.title)}</span>${def.sub ? `<span class="w-sub">${esc(def.sub(d))}</span>` : ''}<div class="w-tools">${demo}${def.tools ? def.tools(d) : ''}</div></header>`;
  return `${edit}${head}<div class="w-body">${def.body(it, d)}</div>`;
}
function renderWidgets(animate, dim) {
  const g = $('#dgrid'); if (!g) return;
  Dash.noAnim = !animate && !dim;
  const build = () => {
    const d = periodData(Dash.period);   // erst beim Zeichnen lesen – Daten können inzwischen geladen sein
    g.innerHTML = Dash.layout.filter(it => W[it.t]).map((it, i) => `<article class="w ${it.s} ${animate ? 'enter' : ''}" style="animation-delay:${i * 40}ms" data-uid="${it.id}" tabindex="${Dash.editing ? 0 : -1}" aria-label="${esc(W[it.t].title)}">${widgetInner(it, d)}</article>`).join('')
      + `<button class="add-tile" id="addTile">${ic('plus')}Widget hinzufügen</button>`;
    Dash.layout.forEach(it => { const def = W[it.t]; if (def && def.mount) def.mount($(`.w[data-uid="${it.id}"]`, g), it, d); });
  };
  if (dim && !reduced()) { g.style.transition = 'opacity .14s'; g.style.opacity = '.35'; setTimeout(() => { build(); g.style.opacity = ''; }, 140); }
  else build();
}
function rerenderWidget(id) {
  const it = Dash.layout.find(x => x.id === id), el = $(`.w[data-uid="${id}"]`); if (!it || !el) return;
  Dash.noAnim = true; const d = periodData(Dash.period);
  el.innerHTML = widgetInner(it, d); const def = W[it.t]; def.mount && def.mount(el, it, d);
}
function refreshDashboard(types) {
  if (S.view !== 'dashboard' || Dash.editing) return;
  Dash.layout.forEach(it => { if (!types || types.includes(it.t)) rerenderWidget(it.id); });
}

/* ── Bearbeiten: Ziehen, Größe, Entfernen, Bibliothek, Vorlagen ── */
function setEditing(on, silent) {
  Dash.editing = on;
  const dash = $('#dash'); if (!dash) return;
  dash.classList.toggle('editing', on);
  $$('.w', dash).forEach(w => w.tabIndex = on ? 0 : -1);
  if (!on) { saveLayout(); if (!silent) toast('Layout gespeichert', {t2: `Für ${S.user.name} · Filiale ${storeObj().name}`, type: 'pos', icon: 'layout'}); }
  requestAnimationFrame(() => $('#periodSeg')?._place?.(false));
}
function flip(container, mutate) {
  const items = $$('.w', container), first = new Map(items.map(el => [el, el.getBoundingClientRect()]));
  mutate();
  if (reduced()) return;
  $$('.w', container).forEach(el => { const f = first.get(el); if (!f) return; const l = el.getBoundingClientRect(); const dx = f.left - l.left, dy = f.top - l.top; if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{transform: `translate(${dx}px,${dy}px)`}, {transform: 'none'}], {duration: 320, easing: 'cubic-bezier(.16,1,.3,1)'}); });
}
function commitOrder() {
  const order = $$('#dgrid .w').map(el => el.dataset.uid);
  Dash.layout.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  Dash.preset = 'eigene'; saveLayout(); updatePresetLabel();
}
const updatePresetLabel = () => { const b = $('#presetBtn'); if (b) b.innerHTML = `Vorlage: ${esc(PRESETS[Dash.preset]?.name || 'Eigene')}${ic('chevron-down', 'i-sm')}`; };
function startDrag(w, ev) {
  const r = w.getBoundingClientRect();
  const ghost = w.cloneNode(true); ghost.classList.add('drag-ghost'); ghost.classList.remove('enter');
  Object.assign(ghost.style, {left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px'});
  document.body.appendChild(ghost); w.classList.add('placeholder'); document.body.style.cursor = 'grabbing';
  return {w, ghost, dx: ev.clientX - r.left, dy: ev.clientY - r.top, last: null, t: 0};
}
function moveDrag(d, ev) {
  d.ghost.style.left = (ev.clientX - d.dx) + 'px'; d.ghost.style.top = (ev.clientY - d.dy) + 'px';
  const view = $('#view-dashboard'), vr = view.getBoundingClientRect();
  if (ev.clientY < vr.top + 70) view.scrollTop -= 14; else if (ev.clientY > vr.bottom - 70) view.scrollTop += 14;
  const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#dgrid .w');
  if (!t || t === d.w) { d.last = null; return; }
  const now = performance.now(); if (t === d.last || now - d.t < 140) return;
  d.last = t; d.t = now;
  const g = $('#dgrid'), kids = [...g.children];
  flip(g, () => { kids.indexOf(d.w) < kids.indexOf(t) ? t.after(d.w) : t.before(d.w); });
}
function endDrag(d) {
  const r = d.w.getBoundingClientRect();
  const a = d.ghost.animate([{left: d.ghost.style.left, top: d.ghost.style.top, transform: 'rotate(.8deg) scale(1.015)'}, {left: r.left + 'px', top: r.top + 'px', transform: 'none'}], {duration: reduced() ? 1 : 220, easing: 'cubic-bezier(.16,1,.3,1)'});
  a.onfinish = () => { d.ghost.remove(); d.w.classList.remove('placeholder'); };
  document.body.style.cursor = '';
  commitOrder();
}
function bindDashboard() {
  const v = $('#view-dashboard');
  v.addEventListener('pointerdown', e => {
    if (!Dash.editing || e.button !== 0) return;
    const w = e.target.closest('#dgrid .w'); if (!w || e.target.closest('.w-edit')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY; let drag = null;
    const move = ev => { if (!drag) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return; drag = startDrag(w, ev); } moveDrag(drag, ev); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); if (drag) endDrag(drag); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  v.addEventListener('keydown', e => {
    if (!Dash.editing || !e.altKey) return;
    const w = e.target.closest?.('#dgrid .w'); if (!w) return;
    const g = $('#dgrid');
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { const p = w.previousElementSibling; if (p) { flip(g, () => p.before(w)); commitOrder(); w.focus(); } e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { const n = w.nextElementSibling; if (n && n.classList.contains('w')) { flip(g, () => n.after(w)); commitOrder(); w.focus(); } e.preventDefault(); }
  });
  v.addEventListener('submit', e => { if (e.target.id === 'askForm') { e.preventDefault(); const q = $('#askInput').value.trim(); if (q) askAI(q); } });
  v.addEventListener('click', e => {
    const t = e.target;
    const id = t.closest('[id]')?.id;
    if (id === 'editBtn') return setEditing(true);
    if (id === 'doneBtn') return setEditing(false);
    if (id === 'libBtn' || id === 'addTile') return openLibrary();
    if (id === 'exportBtn') return openExport();
    if (id === 'presetBtn') return openPresetMenu(t.closest('#presetBtn'));
    if (id === 'dashStore') return openStoreMenu(t.closest('#dashStore'), 'right');
    const chip = t.closest('#askChips .chip'); if (chip) { $('#askInput').value = chip.dataset.q; return askAI(chip.dataset.q); }
    const sz = t.closest('[data-size]');
    if (sz) { const w = sz.closest('.w'), it = Dash.layout.find(x => x.id === w.dataset.uid); it.s = sz.dataset.size; flip($('#dgrid'), () => { w.className = `w ${it.s}`; rerenderWidget(it.id); }); Dash.preset = 'eigene'; saveLayout(); updatePresetLabel(); return; }
    const rm = t.closest('[data-rm]');
    if (rm) { const w = rm.closest('.w'), idx = Dash.layout.findIndex(x => x.id === w.dataset.uid); const [it] = Dash.layout.splice(idx, 1);
      w.animate([{opacity: 1, transform: 'scale(1)'}, {opacity: 0, transform: 'scale(.94)'}], {duration: 180, easing: 'ease-in'}).onfinish = () => { flip($('#dgrid'), () => w.remove()); };
      Dash.preset = 'eigene'; saveLayout(); updatePresetLabel();
      toast(`„${W[it.t].title}“ entfernt`, {icon: 'trash', action: {label: 'Rückgängig', run: () => { Dash.layout.splice(idx, 0, it); saveLayout(); renderWidgets(false); }}}); return; }
    const act = t.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'low') {
      const row = act.closest('.wl-row'), l = LOW.find(x => x.id + x.c + x.s === act.dataset.key);
      Dash.accepted.add(act.dataset.key);
      row.animate([{opacity: 1}, {opacity: 0, transform: 'translateX(14px)'}], {duration: 220}).onfinish = () => { $$('.w').forEach(w => { const it = Dash.layout.find(x => x.id === w.dataset.uid); if (it && it.t === 'stock.low') rerenderWidget(it.id); }); };
      toast(l.icon === 'swap' ? 'Umlagerung angelegt' : 'Bestellvorschlag übernommen', {t2: `${artById(l.id).name} · ${l.sug}`, type: 'pos', icon: l.icon});
      Hooks.emit('inventory.suggestion.accepted', {sku: l.id, variante: `${COLORS[l.c][0]} / ${l.s}`, vorschlag: l.sug});
    }
    if (a === 'ins') { const x = INSIGHTS.find(i => i.id === act.dataset.id); toast(x.a, {t2: 'Aktion vorbereitet · Entwurf im Bereich Einkauf', type: 'accent', icon: 'sparkle'}); Hooks.emit('ai.insight.action', {hinweis: x.t}); }
    if (a === 'ins-x') { const card = act.closest('.in'); Dash.dismissed.add(act.dataset.id); card.classList.add('gone'); setTimeout(() => { const w = card.closest('.w'); w && rerenderWidget(w.dataset.uid); }, 220); toast('Hinweis verworfen', {t2: 'Das Modell lernt lokal aus Ihrer Rückmeldung', icon: 'sparkle'}); }
    if (a === 'book') { for (const x of ART) { const v = x.variants.find(q => q.ean === act.dataset.ean); if (v) { openBooking(x, v); break; } } return; }
    if (a === 'backup') backupNow();
    if (a === 'update') DESKTOP && UPD.state !== 'available' ? checkUpdates(true) : openUpdate();
    if (a === 'dep') depExport();
  });
}
function openLibrary() {
  if (!Dash.editing) setEditing(true);
  const groups = ['Verkauf', 'Bestand', 'KI', 'Betrieb', 'Erweiterungen'];
  const el = openLayer(`<div class="drawer-panel" role="dialog" aria-modal="true" aria-label="Widget-Bibliothek">
    <div class="m-head" style="padding-bottom:14px"><div class="m-ic">${ic('layout')}</div><div><h2>Widget-Bibliothek</h2><p>Kern-Widgets, Widgets aus Erweiterungen und eigene Abfragen.</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="drawer-body"><input class="input lib-search" id="libQ" placeholder="Widgets durchsuchen …" style="height:40px"><div id="libList"></div>
      <div class="lib-i" style="border-style:dashed;margin-top:18px"><span class="reg-ic">${ic('code')}</span><div style="min-width:0"><div class="t1">Eigenes Widget</div><div class="t2">Abfrage auf beliebige Entitäten (auch eigene) + Darstellung als Kennzahl, Liste oder Tabelle. Wird als JSON versioniert.</div></div><button class="btn btn-secondary btn-sm" id="libCustom">Erstellen</button></div>
    </div></div>`, {cls: 'drawer', focus: '#libQ'});
  const render = () => {
    const q = norm($('#libQ', el).value.trim()); const used = new Set(Dash.layout.map(x => x.t));
    $('#libList', el).innerHTML = groups.map(g => {
      const ws = Object.entries(W).filter(([, w]) => w.cat === g && (!q || norm(w.title + ' ' + w.desc).includes(q)));
      if (!ws.length) return '';
      return `<div class="lib-g">${g}</div>` + ws.map(([k, w]) => `<div class="lib-i"><span class="reg-ic">${ic(w.icon)}</span><div style="min-width:0"><div class="t1">${esc(w.title)}${w.plugin ? `<span class="w-src">${ic('puzzle', 'i-xs')}${esc(w.plugin)}</span>` : ''}</div><div class="t2">${esc(w.desc)}</div></div>${used.has(k) ? `<button class="btn btn-ghost btn-sm" disabled>${ic('check', 'i-sm')}Aktiv</button>` : `<button class="btn btn-secondary btn-sm" data-add="${k}">${ic('plus', 'i-sm')}Hinzufügen</button>`}</div>`).join('');
    }).join('') || '<div class="empty"><p>Kein Widget gefunden.</p></div>';
  };
  $('#libQ', el).addEventListener('input', render);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-add]');
    if (b) { const t = b.dataset.add, it = {id: uid(), t, s: W[t].sizes[0]}; Dash.layout.push(it); Dash.preset = 'eigene'; saveLayout(); renderWidgets(false); updatePresetLabel(); render();
      const w = $(`.w[data-uid="${it.id}"]`); if (w) { w.classList.add('enter'); w.scrollIntoView({behavior: reduced() ? 'auto' : 'smooth', block: 'center'}); }
      toast(`„${W[t].title}“ hinzugefügt`, {type: 'pos', icon: 'plus'}); Hooks.emit('dashboard.widget.added', {widget: t, quelle: W[t].plugin || 'Kern'}); }
    if (e.target.closest('#libCustom')) toast('Widget-Builder', {t2: 'Abfrage-Editor folgt in einer der nächsten Iterationen', icon: 'code'});
  });
  render();
}
function openPresetMenu(anchor) {
  const el = openPopover(anchor, `<div class="pop-h">Vorlagen</div>${Object.entries(PRESETS).map(([k, p]) => `<button class="pop-i" data-pre="${k}">${ic(k === Dash.preset ? 'check' : 'layout')}<span><span style="display:block;color:var(--text)">${p.name}</span><span style="display:block;font-size:11.5px;color:var(--text-3)">${p.d}</span></span></button>`).join('')}<div class="pop-sep"></div><button class="pop-i" data-pre="_reset">${ic('undo')}Auf Standard zurücksetzen</button>`, {align: 'left', width: 290});
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-pre]'); if (!b) return;
    const k = b.dataset.pre === '_reset' ? 'filialleitung' : b.dataset.pre;
    Dash.layout = fromPreset(k); Dash.preset = k; saveLayout(); closePopover(); renderWidgets(true); updatePresetLabel();
    toast(`Vorlage „${PRESETS[k].name}“ angewendet`, {icon: 'layout'});
  });
}
function openStoreMenu(anchor, align) {
  const el = openPopover(anchor, `<div class="pop-h">Filiale</div>${STORES.map(s => `<button class="pop-i" data-store="${s.id}">${ic(s.id === S.store ? 'check' : 'store')}<span style="flex:1">${s.name}</span><span class="muted" style="font-size:11.5px">${s.addr}</span></button>`).join('')}<div class="pop-sep"></div><button class="pop-i" data-store="ALL">${ic(S.store === 'ALL' ? 'check' : 'layers')}Alle Filialen<span class="r muted" style="font-size:11.5px">konsolidiert</span></button>`, {align, width: 320});
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-store]'); if (!b) return;
    S.store = b.dataset.store; closePopover(); renderStore(); renderTopbar();
    if (S.view === 'dashboard') renderDashboard();
    toast(`Kontext: ${storeObj().name}`, {t2: 'Dashboard und Berichte zeigen diesen Bereich', icon: 'store'});
  });
}
function openExport() {
  const json = {schema: 'kontor.dashboard/v1', besitzer: `benutzer:${S.user.id}`, geltung: `filiale:${S.store}`, zeitraum: Dash.period, vorlage: Dash.preset,
    widgets: Dash.layout.map(it => Object.assign({typ: it.t, groesse: it.s}, W[it.t]?.plugin ? {quelle: W[it.t].plugin} : {}))};
  const src = JSON.stringify(json, null, 2);
  const hlj = esc(src).replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="k">$1</span>$2').replace(/:\s(&quot;.*?&quot;)/g, ': <span class="s">$1</span>').replace(/:\s(\d+)/g, ': <span class="n">$1</span>');
  const el = openLayer(`<div class="modal" style="width:min(620px,100%)" role="dialog" aria-modal="true" aria-label="Layout exportieren">
    <div class="m-head"><div class="m-ic">${ic('code')}</div><div><h2>Dashboard als Konfiguration</h2><p>Layouts sind Daten: versionierbar, je Rolle/Filiale verteilbar, per API setzbar.</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body"><pre class="code">${hlj}</pre></div>
    <div class="m-foot"><span class="muted" style="font-size:12px">PUT /api/v1/dashboards/{benutzer}</span><span class="sp"></span><button class="btn btn-secondary" data-close>Schließen</button><button class="btn btn-primary" id="copyJson">${ic('copy', 'i-sm')}Kopieren</button></div></div>`);
  $('#copyJson', el).onclick = () => { navigator.clipboard?.writeText(src).then(() => toast('In die Zwischenablage kopiert', {type: 'pos', icon: 'copy'}), () => toast('Kopieren nicht erlaubt', {type: 'warn'})); };
}

/* ── Lokale KI: Fragen in natürlicher Sprache ── */
function aiAnswer(q) {
  const n = norm(q);
  if (/bestand|lager|nachbest|niedrig|ausverk|reichweit/.test(n)) return {title: 'Niedriger Bestand bei hohem Umsatz · letzte 14 Tage',
    text: 'Vier Varianten erfüllen beide Bedingungen, zwei davon reichen weniger als eine Woche. Für den Hochtor GTX empfehle ich eine Umlagerung aus Salzburg statt einer Nachbestellung – die Lieferzeit bei Nordwand liegt derzeit bei 21 Tagen.',
    cols: ['Artikel', 'Variante', 'Bestand', 'Umsatz 14 T', 'Reichweite', 'Vorschlag'], num: [2, 3],
    rows: [['Hochtor GTX Bergschuh', 'Fels · 42', '1', eur0(4185), '3 Tage', 'Umlagern 4 aus Salzburg'], ['Grat Hardshell Jacke', 'Moos · M', '1', eur0(5388), '4 Tage', 'Nachbestellen 6'], ['Pace 3 Trailrunner', 'Gletscher · 43', '1', eur0(2226), '5 Tage', 'Nachbestellen 8'], ['Merino Beanie', 'Glut', '2', eur0(1197), '6 Tage', 'Nachbestellen 24']]};
  if (/filial|standort|vergleich|salzburg|kufstein|bregenz/.test(n)) { const d = periodData('heute'), base = d.rev / d.F; return {title: 'Filialen im Vergleich · heute',
    text: `Salzburg liegt mit deutlichem Abstand vorne. Innsbruck erreicht 97 % des Tagesziels und liegt damit im Plan. Kufstein und Bregenz bleiben unter Ziel – beide mit ungewöhnlich wenigen Bons am Vormittag.`,
    cols: ['Filiale', 'Umsatz', 'Bons', 'Ø Bon', 'Ziel'], num: [1, 2, 3, 4],
    rows: STORES.map((s, i) => [s.name, eur0(base * s.f), num(Math.round(base * s.f / 53.8)), eur(53.8 + i * .9), `${[97, 104, 92, 81, 85][i]} %`]).sort((a, b) => parseAmt(b[1]) - parseAmt(a[1]))}; }
  if (/retour|reklam|umtausch|zuruck/.test(n)) return {title: 'Retouren · Ursachenanalyse',
    text: 'Die Gesamtquote sinkt leicht auf 3,8 %. Auffällig ist ein einzelner Artikel: Die Talwind Softshell in Schiefer wird überdurchschnittlich oft mit dem Grund „fällt klein aus“ retourniert. Ein Größenhinweis im Artikelstamm und an der Kasse dürfte den Großteil verhindern.',
    cols: ['Artikel', 'Retourenquote', 'Ø Warengruppe', 'Häufigster Grund'], num: [1, 2],
    rows: [['Talwind Softshell · Schiefer', '18,2 %', '4,1 %', 'fällt klein aus'], ['Firn Skihose Pro · Nacht', '7,9 %', '4,6 %', 'Farbe weicht ab'], ['Pace 3 Trailrunner', '6,3 %', '5,2 %', 'Passform Ferse']]};
  if (/umsatz|verkauf|heute|prognose|ladenschluss|ziel/.test(n)) { const d = periodData('heute'); return {title: 'Umsatz & Prognose bis Ladenschluss',
    text: `Bis ${hhmm(DEMO_H)} wurden ${eur0(d.rev)} umgesetzt – ${pct((d.rev / d.prevRev - 1) * 100)} gegenüber der Vorwoche zur gleichen Zeit. Die lokale Prognose erwartet bis 19:00 ${eur0(d.end)}; das Tagesziel von ${eur0(d.goal)} wird damit ${d.end >= d.goal ? 'voraussichtlich erreicht' : 'knapp verfehlt'}. Der Nachmittags-Peak beginnt erfahrungsgemäß gegen 16:30.`,
    cols: ['Kennzahl', 'Wert', 'Vorwoche'], num: [1, 2], rows: [['Umsatz bis jetzt', eur0(d.rev), eur0(d.prevRev)], ['Bons', num(d.bons), num(d.prevBons)], ['Ø Bon', eur(d.basket), eur(d.prevBasket)], ['Prognose Tagesende', eur0(d.end), eur0(d.prev[d.prev.length - 1].y)]]}; }
  return {title: 'Antwort der lokalen KI',
    text: `Ich habe „${q}“ gegen Artikel, Belege, Bestände und Kunden dieser Installation geprüft. In der Vorschau sind nur Testdaten hinterlegt – im Echtbetrieb übersetze ich die Frage in eine Abfrage, zeige sie zur Kontrolle an und liefere das Ergebnis als Tabelle, Diagramm oder Widget.`, rows: null};
}
async function askAI(q) {
  if (S.view !== 'dashboard') go('dashboard');
  const inp = $('#askInput'); if (inp) inp.value = q;
  const slot = $('#answerSlot'); if (!slot) return;
  Hooks.emit('ai.query', {frage: q, modell: 'kontor-retail-8b-q4 (lokal)'});
  const tok = (S.aiTok = uid());
  slot.innerHTML = `<div class="answer"><div class="answer-head"><span class="ai-chip">${ic('sparkle', 'i-xs')}KI · lokal</span><h3></h3><button class="btn btn-ghost btn-sm btn-icon" id="ansClose" aria-label="Antwort schließen">${ic('x', 'i-sm')}</button></div><div class="answer-text"><span class="thinking">${ic('server', 'i-xs')}<b>Analysiere Belege und Bestände auf KONTOR-SRV01 …</b></span></div><div id="ansTbl"></div><div class="answer-foot"></div></div>`;
  $('#ansClose').onclick = () => { S.aiTok = null; slot.innerHTML = ''; };
  $('#view-dashboard').scrollTo({top: 0, behavior: reduced() ? 'auto' : 'smooth'});
  await wait(reduced() ? 0 : 750);
  if (S.aiTok !== tok) return;
  const a = aiAnswer(q);
  $('.answer-head h3', slot).textContent = a.title;
  const txt = $('.answer-text', slot); txt.textContent = '';
  const cur = document.createElement('span'); cur.className = 'cursor'; txt.append(cur);
  for (const w of a.text.split(/(\s+)/)) { if (S.aiTok !== tok) return; cur.before(document.createTextNode(w)); if (w.trim() && !reduced()) await wait(14 + Math.random() * 26); }
  cur.remove();
  if (a.rows) {
    const t = document.createElement('table'); t.className = 'tbl';
    const th = document.createElement('tr'); a.cols.forEach((c, i) => { const e = document.createElement('th'); e.textContent = c; if (a.num?.includes(i)) e.className = 'r'; th.append(e); });
    const thead = document.createElement('thead'); thead.append(th); t.append(thead);
    const tb = document.createElement('tbody'); a.rows.forEach((r, ri) => { const tr = document.createElement('tr'); tr.style.animationDelay = ri * 60 + 'ms'; r.forEach((c, i) => { const e = document.createElement('td'); e.textContent = c; if (a.num?.includes(i)) e.className = 'r'; if (i === 0) e.style.fontWeight = '550'; tr.append(e); }); tb.append(tr); });
    t.append(tb); $('#ansTbl', slot).append(t);
  }
  $('.answer-foot', slot).innerHTML = `${ic('server', 'i-xs')}<span>kontor-retail-8b-q4 · lokal auf KONTOR-SRV01 · ${num(0.6 + Math.random() * .8, 1)} s · keine Daten verlassen Ihr Netzwerk</span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn btn-ghost btn-sm" data-ans="sql">${ic('code', 'i-sm')}Abfrage zeigen</button><button class="btn btn-secondary btn-sm" data-ans="pin">${ic('layout', 'i-sm')}Als Widget anheften</button></span>`;
  $('.answer-foot', slot).addEventListener('click', e => {
    const b = e.target.closest('[data-ans]'); if (!b) return;
    if (b.dataset.ans === 'pin') toast('Als eigenes Widget gespeichert', {t2: 'Erscheint in der Widget-Bibliothek unter „Eigene“', type: 'pos', icon: 'layout'});
    else toast('Generierte Abfrage', {t2: 'SELECT … FROM verkauf_positionen JOIN bestand … (nur lesend, geprüft)', icon: 'code', dur: 5200});
  });
}
