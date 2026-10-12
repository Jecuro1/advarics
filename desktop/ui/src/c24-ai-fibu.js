
/* ════════════════════════════════════════════════════════════════════
   34 · LOKALE KI, BUCHHALTUNG, ZAHLUNGSTERMINAL
   KI: Prognosen, Nachbestellvorschläge mit Begründung und Hinweise
   rechnet Kontor selbst (Statistik auf den eigenen Belegen) – ohne
   Internet. Optional ein lokales Sprachmodell (Ollama) für freie Fragen
   und Artikeltexte. Buchhaltung: Buchungsjournal und DATEV-Export.
   Terminal: ZVT über das Netzwerk oder externes Terminal mit Bestätigung.
   ════════════════════════════════════════════════════════════════════ */
Object.assign(DEFAULTS, {'ki.url': 'http://127.0.0.1:11434', 'ki.modell': '', 'terminal.art': 'aus', 'terminal.adresse': '', 'terminal.passwort': '',
  'fibu.kasse': '2700', 'fibu.transit': '2880', 'fibu.bank': '2800', 'fibu.gutschein': '3630', 'fibu.erloes20': '4000', 'fibu.erloes13': '4030', 'fibu.erloes10': '4010', 'fibu.erloes0': '4090', 'fibu.datev.berater': '', 'fibu.datev.mandant': ''});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });
const AI = {ins: null, t: 0, busy: false, reorder: null};
const llmReady = () => DESKTOP && CFG['ki.url'] && CFG['ki.modell'];

/* ── KI-Hinweise im Dashboard (echt, lokal berechnet) ── */
async function loadInsights(force) {
  if (!DESKTOP || AI.busy || (!force && AI.ins && Date.now() - AI.t < 10 * 6e4)) return;
  AI.busy = true;
  try {
    const l = await invoke('ai_insights');
    AI.ins = l; AI.t = Date.now();
    INSIGHTS.length = 0;
    l.forEach(x => INSIGHTS.push({id: x.id, icon: x.icon, tone: x.tone, t: x.title, conf: Math.round(x.confidence), p: x.text, a: x.action?.label || 'Ansehen', act: x.action}));
  } catch (e) { console.error(e); AI.ins = AI.ins || []; }
  AI.busy = false;
  (Dash.layout || []).filter(it => it.t === 'ai.insights').forEach(it => rerenderWidget(it.id));
}
if (DESKTOP) {
  const wi = W['ai.insights']; wi.demo = false;
  wi.desc = 'Auffälligkeiten aus Ihren Belegen: Retourenquoten, Stornos, Inventurdifferenzen, Preise unter EK, Bestseller mit knapper Reichweite, Ladenhüter.';
  wi.tools = () => `<span class="ai-chip"><span class="dot live"></span>lokal berechnet</span>`;
  const body0 = wi.body;
  wi.body = it => { if (!AI.ins) { loadInsights(); return `<div class="empty" style="flex:1"><span class="thinking"><b>Werte Belege aus …</b></span></div>`; } return body0(it); };
  let tmI; Hooks.on('pos.sale.completed', () => { clearTimeout(tmI); tmI = setTimeout(() => loadInsights(true), 4000); });
  Hooks.on('inventory.finished', () => loadInsights(true));
}
function insightAction(x) {
  const a = x.act; if (!a) return;
  Hooks.emit('ai.insight.action', {hinweis: x.t, aktion: a.kind});
  if (a.kind === 'artikel') { go('artikel'); setTimeout(() => { const art = artById(a.ref); art ? openEditor(art) : toast('Artikel nicht gefunden', {type: 'warn'}); }, 120); }
  else if (a.kind === 'belege') openReceipts();
  else if (a.kind === 'inventur') go('inventur');
  else if (a.kind === 'einkauf') { EK.tab = 'ki'; go('einkauf'); }
  else if (a.kind === 'aktion') { const art = artById(a.ref); go('aktionen'); setTimeout(() => openPromo({name: `Abverkauf ${art?.name || ''}`.trim(), pct: 20, scope: 'artikel', scope_values: [a.ref], from_date: today(), to_date: dIso(addDays(new Date(), 14)), active: true}), 140); }
}

/* ── Fragen in natürlicher Sprache: echte Zahlen, optional Sprachmodell ── */
function aiPeriod(n) {
  const now = new Date(), sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/gestern/.test(n)) return ['gestern', addDays(sod, -1), sod];
  if (/vorwoche|letzte woche/.test(n)) { const mon = addDays(sod, -((now.getDay() + 6) % 7)); return ['letzte Woche', addDays(mon, -7), mon]; }
  if (/woche/.test(n)) { const mon = addDays(sod, -((now.getDay() + 6) % 7)); return ['diese Woche', mon, addDays(mon, 7)]; }
  if (/vormonat|letzte[nm]? monat/.test(n)) return ['letzter Monat', new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
  if (/monat/.test(n)) return ['dieser Monat', new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  if (/jahr/.test(n)) return ['dieses Jahr', new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)];
  if (/30 tage|letzte.*tage/.test(n)) return ['letzte 30 Tage', addDays(sod, -29), addDays(sod, 1)];
  return ['heute', sod, addDays(sod, 1)];
}
async function aiStats(f, t) { const [s] = await invoke('stats', {ranges: [{from: isoL(f), to: isoL(t)}], detail: true}); return s; }
async function realAnswer(q) {
  const n = norm(q), e = c => eur((c || 0) / 100);
  if (/nachbest|bestell|reichweit|ausverk|knapp|niedrig|lager|bestand/.test(n)) {
    const l = await invoke('ai_reorder');
    return {title: 'Nachbestellvorschlag · Prognose aus den letzten 12 Wochen', sql: 'ai.reorder: Holt-Prognose je Artikel × Variantenanteil, Lieferzeit des Lieferanten, offene Bestellungen',
      text: l.length ? `${l.length === 1 ? 'Eine Variante reicht' : `${l.length} Varianten reichen`} nicht bis zur nächsten Lieferung plus eine Woche Puffer.${l.length > 10 ? ' Die dringendsten 10:' : ''}` : 'Keine Variante unterschreitet die Reichweite bis zur nächsten Lieferung – kein Nachschub nötig.',
      cols: ['Artikel', 'Variante', 'Bestand', 'Reichweite', 'Vorschlag', 'Begründung'], num: [2, 3, 4], rows: l.slice(0, 10).map(r => [r.name, `${COLORS[r.color]?.[0] || r.color} · ${r.size}`, num(r.stock), `${num(r.cover_days)} T`, `${num(r.qty)} Stk.`, r.reason]), act: l.length ? {label: 'Im Einkauf öffnen', run: () => { EK.tab = 'ki'; go('einkauf'); }} : null};
  }
  if (/prognos|vorhers|erwart|naechste|kommende/.test(n)) {
    const l = await invoke('ai_forecast');
    return {title: 'Absatzprognose · nächste 4 Wochen', sql: 'ai.forecast: Holt (doppelte exponentielle Glättung) auf Wochenabsätzen der letzten 12 Wochen',
      text: l.length ? `Erwarteter Absatz der Top-Artikel in den nächsten 4 Wochen, mit Trend gegenüber den Wochen davor und Reichweite des aktuellen Bestands.` : 'Für eine Prognose fehlen noch Verkäufe.',
      cols: ['Artikel', 'Erwartet 4 Wo.', 'Trend', 'Bestand', 'Reichweite'], num: [1, 2, 3, 4], rows: l.slice(0, 12).map(r => [r.name, `${num(r.next4, 1)} Stk.`, pct(r.trend, 0), num(r.stock), r.cover_days >= 9999 ? '–' : `${num(r.cover_days)} T`])};
  }
  if (/hinweis|auffaell|anomal|problem|retour/.test(n)) {
    await loadInsights(true); const l = AI.ins || [];
    return {title: 'Auffälligkeiten', sql: 'ai.insights: Retourenquote, Stornos je Kassier:in, Inventurdifferenzen, Preis < EK, Reichweite, Ladenhüter',
      text: l.length ? `${l.length} Hinweise aus Ihren Daten:` : 'Derzeit keine Auffälligkeiten.', cols: ['Hinweis', 'Sicherheit', 'Details'], num: [1], rows: l.map(x => [x.title, `${Math.round(x.confidence)} %`, x.text])};
  }
  if (/kunde|stammk|treu/.test(n)) {
    const l = [...CUSTOMERS].sort((a, b) => (b.revenue || 0) - (a.revenue || 0)).slice(0, 10);
    return {title: 'Kund:innen nach Umsatz', text: `${num(CUSTOMERS.length)} Kund:innen gespeichert. Die umsatzstärksten:`, cols: ['Kund:in', 'Stufe', 'Einkäufe', 'Punkte', 'Umsatz'], num: [2, 3, 4], rows: l.map(c => [c.name, c.tier, num(c.visits || 0), num(c.points || 0), eur(c.revenue || 0)])};
  }
  const [lbl, f, t] = aiPeriod(n);
  if (/top|best|meist|renner|artikel|verkauf/.test(n) && !/umsatz/.test(n)) {
    const s = await aiStats(f, t), items = [...s.items].sort((a, b) => b.rev - a.rev).slice(0, 10);
    return {title: `Meistverkaufte Artikel · ${lbl}`, sql: `stats(${dIso(f)} … ${dIso(addDays(t, -1))}): Positionen nach Umsatz, Retouren abgezogen`, text: items.length ? `${num(s.sold)} Artikel in ${num(s.sales)} Bons verkauft. Nach Umsatz:` : `Im Zeitraum (${lbl}) wurde noch nichts verkauft.`,
      cols: ['Artikel', 'Nr.', 'Stück', 'Umsatz'], num: [2, 3], rows: items.map(i => [i.name, i.sku, num(i.qty), e(i.rev)])};
  }
  if (/umsatz|verdien|einnahm|wie laeuft|wie lief|bons|kasse/.test(n)) {
    const s = await aiStats(f, t);
    return {title: `Umsatz · ${lbl}`, sql: `stats(${dIso(f)} … ${dIso(addDays(t, -1))})`, text: `${lbl[0].toUpperCase() + lbl.slice(1)}: ${e(s.revenue)} Umsatz in ${num(s.sales)} Bons${s.sales ? ` (Ø ${e(s.revenue / s.sales)})` : ''}, ${num(s.sold)} Artikel. Retouren/Stornos: ${e(s.returns)}.`,
      cols: ['Tag', 'Bons', 'Umsatz'], num: [1, 2], rows: s.days.map(d => [new Date(d.day + 'T12:00').toLocaleDateString('de-AT', {weekday: 'short', day: '2-digit', month: '2-digit'}), num(d.sales), e(d.revenue)])};
  }
  if (llmReady()) {
    const now = new Date(), sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [d30, rec] = await Promise.all([aiStats(addDays(sod, -29), addDays(sod, 1)), invoke('ai_reorder').catch(() => [])]);
    const ctx = `Firma: ${CFG['firma.name']}. Heute: ${now.toLocaleDateString('de-AT')}.\nLetzte 30 Tage: Umsatz ${e(d30.revenue)}, ${d30.sales} Bons, ${d30.sold} Artikel, Retouren ${e(d30.returns)}.\nTop-Artikel: ${[...d30.items].sort((a, b) => b.rev - a.rev).slice(0, 8).map(i => `${i.name} (${i.qty} Stk., ${e(i.rev)})`).join('; ')}.\nKnapper Bestand: ${rec.slice(0, 6).map(r => `${r.name} ${r.color}/${r.size}: ${r.stock} Stk., Reichweite ${r.cover_days} T`).join('; ') || 'keiner'}.\nArtikel gesamt: ${ART.length}, Kunden: ${CUSTOMERS.length}.`;
    const txt = await invoke('ai_llm', {system: 'Du bist der Assistent einer Warenwirtschaft im Einzelhandel in Österreich. Antworte kurz, sachlich und auf Deutsch. Verwende nur die gegebenen Daten; wenn sie nicht reichen, sag das.', prompt: `Daten:\n${ctx}\n\nFrage: ${q}`});
    return {title: 'Antwort des lokalen Sprachmodells', text: txt.trim(), sql: `Sprachmodell ${CFG['ki.modell']} über ${CFG['ki.url']} · Kontext: Kennzahlen der letzten 30 Tage`, model: CFG['ki.modell']};
  }
  return {title: 'Das kann ich beantworten', text: 'Fragen Sie z. B. nach „Umsatz diese Woche“, „Top-Artikel letzten Monat“, „Was muss ich nachbestellen?“, „Prognose nächste Wochen“, „Auffälligkeiten“ oder „beste Kunden“. Für frei formulierte Fragen kann unter Einstellungen → Lokale KI ein Sprachmodell (Ollama) auf diesem PC oder im Firmennetz eingebunden werden – Ihre Daten verlassen das Netzwerk nicht.', rows: null};
}
if (DESKTOP) askAI = async function (q) {
  if (S.view !== 'dashboard') go('dashboard');
  const inp = $('#askInput'); if (inp) inp.value = q;
  const slot = $('#answerSlot'); if (!slot) return;
  const tok = (S.aiTok = uid()), t0 = performance.now();
  Hooks.emit('ai.query', {frage: q, modell: llmReady() ? CFG['ki.modell'] : 'Kontor-Statistik (lokal)'});
  slot.innerHTML = `<div class="answer"><div class="answer-head"><span class="ai-chip">${ic('sparkle', 'i-xs')}KI · lokal</span><h3>…</h3><button class="btn btn-ghost btn-sm btn-icon" id="ansClose" aria-label="Antwort schließen">${ic('x', 'i-sm')}</button></div><div class="answer-text"><span class="thinking">${ic('database', 'i-xs')}<b>Werte die lokale Datenbank aus …</b></span></div><div id="ansTbl"></div><div class="answer-foot"></div></div>`;
  $('#ansClose').onclick = () => { S.aiTok = null; slot.innerHTML = ''; };
  let a; try { a = await realAnswer(q); } catch (e) { a = {title: 'Keine Antwort', text: String(e.message || e)}; }
  if (S.aiTok !== tok || !$('.answer', slot)) return;
  $('.answer-head h3', slot).textContent = a.title;
  $('.answer-text', slot).textContent = a.text;
  if (a.rows?.length) {
    $('#ansTbl', slot).innerHTML = `<table class="tbl"><thead><tr>${a.cols.map((c, i) => `<th class="${a.num?.includes(i) ? 'r' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${a.rows.map(r => `<tr>${r.map((c, i) => `<td class="${a.num?.includes(i) ? 'r num' : ''}" style="${i === 0 ? 'font-weight:550' : ''}${i === r.length - 1 && String(c).length > 60 ? ';font-size:12px;color:var(--text-2);white-space:normal' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  $('.answer-foot', slot).innerHTML = `${ic('server', 'i-xs')}<span>${esc(a.model ? `${a.model} · lokal` : 'Kontor-Statistik · lokal')} · ${num((performance.now() - t0) / 1000, 1)} s · keine Daten verlassen Ihr Netzwerk</span><span style="margin-left:auto;display:flex;gap:6px">${a.sql ? `<button class="btn btn-ghost btn-sm" data-ans2="sql">${ic('code', 'i-sm')}Herleitung</button>` : ''}${a.act ? `<button class="btn btn-secondary btn-sm" data-ans2="act">${esc(a.act.label)}</button>` : ''}</span>`;
  $('.answer-foot', slot).onclick = e => { const b = e.target.closest('[data-ans2]'); if (!b) return; if (b.dataset.ans2 === 'act') a.act.run(); else toast('So wurde gerechnet', {t2: a.sql, icon: 'code', dur: 7000}); };
};

// Beispielfragen passend zu dem, was die lokale Auswertung beantworten kann
if (DESKTOP) {
  const _renderDashboard = renderDashboard;
  renderDashboard = function (...a) {
    const r = _renderDashboard.apply(this, a);
    const c = $('#askChips'); if (c) c.innerHTML = ['Was muss ich nachbestellen?', 'Umsatz diese Woche', 'Top-Artikel diesen Monat', 'Prognose nächste Wochen', 'Auffälligkeiten'].map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('');
    return r;
  };
}

/* ── Artikeltext mit KI ── */
async function aiArticleText(st) {
  if (!llmReady()) { toast('Kein lokales Sprachmodell eingerichtet', {t2: 'Einstellungen → Lokale KI', type: 'warn', action: {label: 'Einrichten', run: () => setGo('ki')}}); return null; }
  toast('Text wird erstellt …', {t2: CFG['ki.modell'], icon: 'sparkle', dur: 2500});
  const facts = [`Artikel: ${st.name}`, st.brand && `Marke: ${st.brand}`, `Warengruppe: ${CATS.find(c => c.id === st.cat)?.name || st.cat}`, st.colors?.length && `Farben: ${st.colors.map(c => COLORS[c]?.[0] || c).join(', ')}`, st.sizes && `Größen: ${st.sizes}`, ...(st.fields || []).filter(([k, v]) => k && v && k !== 'Beschreibung').map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');
  try { return (await invoke('ai_llm', {system: 'Du schreibst Produkttexte für einen Sport- und Modehändler in Österreich. Deutsch, sachlich, 2–3 Sätze, keine erfundenen technischen Daten, keine Superlative.', prompt: `Schreibe einen kurzen Produkttext:\n${facts}`})).trim(); }
  catch (e) { toast('KI nicht erreichbar', {t2: String(e), type: 'warn', dur: 7000}); return null; }
}

/* ── Einkauf: Tab „KI-Vorschlag“ ── */
const _renderEinkauf = renderEinkauf;
renderEinkauf = async function () {
  await _renderEinkauf();
  const seg = $('#ekSeg'); if (!seg || !DESKTOP || $('[data-v="ki"]', seg)) return;
  seg.insertAdjacentHTML('beforeend', `<button data-v="ki" aria-pressed="${EK.tab === 'ki'}">${ic('sparkle', 'i-xs')} KI-Prognose</button>`);
  if (EK.tab === 'ki') $$('button', seg).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === 'ki'));
  requestAnimationFrame(() => seg._place && seg._place(false));
  if (EK.tab === 'ki') renderEkBody();
};
const _renderEkBody = renderEkBody;
renderEkBody = function () {
  if (EK.tab !== 'ki') return _renderEkBody();
  const b = $('#ekBody'); if (!b) return;
  b.innerHTML = '<div class="card" style="padding:24px"><span class="thinking"><b>Berechne Prognose aus den Verkäufen der letzten 12 Wochen …</b></span></div>';
  invoke('ai_reorder').then(l => {
    AI.reorder = l; if (!$('#ekBody') || EK.tab !== 'ki') return;
    const groups = {}; l.forEach(r => (groups[r.supplier_id || ''] ||= []).push(r));
    b.innerHTML = l.length ? `<div class="prompt-hint blk" style="margin:0 0 12px">${ic('sparkle', 'i-xs')}Prognose je Artikel (Holt-Verfahren auf Wochenabsätzen), aufgeteilt nach Variantenanteil · berücksichtigt Lieferzeit, offene Bestellungen und Trend · Menge deckt Lieferzeit + 3 Wochen</div>` + Object.entries(groups).map(([sid, rows]) => `<div class="card" style="margin-bottom:12px" data-kg="${esc(sid)}">
      <div class="set-row"><div><div class="set-l">${esc(supName(sid))}</div><div class="set-h">${rows.length} Varianten · Lieferzeit ${rows[0].lead_days} Tage</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-kgo="${esc(sid)}" ${sid ? '' : 'disabled title="Lieferant im Artikel hinterlegen"'}>${ic('plus', 'i-sm')}Bestellung anlegen</button></div></div>
      <table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px;width:40px"></th><th>Artikel</th><th class="r">Bestand</th><th class="r">offen</th><th class="r">Reichweite</th><th>Begründung</th><th class="r" style="padding-right:16px">Menge</th></tr></thead><tbody>${rows.map(r => `<tr><td style="padding-left:16px"><input type="checkbox" data-kv="${r.variant_id}" checked></td><td><b>${esc(r.name)}</b><div class="muted" style="font-size:11.5px">${esc(COLORS[r.color]?.[0] || r.color)} · ${esc(r.size)}</div></td><td class="r num">${num(r.stock)}</td><td class="r num">${num(r.open)}</td><td class="r num" style="color:${r.cover_days < r.lead_days ? 'var(--neg)' : 'var(--warn)'}">${num(r.cover_days)} T</td><td style="font-size:12px;color:var(--text-2);max-width:380px">${esc(r.reason)}</td><td class="r" style="padding-right:16px"><input class="input num" data-kq="${r.variant_id}" value="${r.qty}" style="width:70px;height:30px;text-align:right"></td></tr>`).join('')}</tbody></table></div>`).join('')
      : `<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><h3>Keine Engpässe absehbar</h3><p>Laut Prognose reicht der Bestand aller Varianten über die Lieferzeit hinaus. Grundlage sind die Verkäufe der letzten 12 Wochen.</p></div></div>`;
  }).catch(e => { b.innerHTML = `<div class="card" style="padding:18px">${esc(String(e))}</div>`; });
};

/* ── Berichte: Tab „Buchhaltung“ ── */
TABS.push(['fibu', 'Buchhaltung']);
const _renderRpBody = renderRpBody;
renderRpBody = async function () {
  if (RP.tab !== 'fibu') return _renderRpBody();
  const b = $('#rpBody'); if (!b) return;
  const [f, t] = rpRange(), von = dIso(f), bis = dIso(addDays(t, -1));
  let rows = []; try { rows = await invoke('fibu_preview', {von, bis}); } catch (e) { toast('Buchungen nicht verfügbar', {t2: String(e), type: 'warn'}); }
  if (!$('#rpBody') || RP.tab !== 'fibu') return;
  const sum = rows.reduce((s, r) => s + r.betrag, 0), tax = rows.reduce((s, r) => s + (r.steuer || 0), 0);
  b.innerHTML = `<div class="kpis"><div class="card"><b class="num">${num(rows.length)}</b><span>Buchungszeilen</span></div><div class="card"><b>${eur(sum / 100)}</b><span>Summe Buchungen</span></div><div class="card"><b>${eur(tax / 100)}</b><span>davon Umsatzsteuer</span></div><div class="card"><b class="num">${esc(CFG['fibu.kasse'])}</b><span>Kassenkonto</span></div></div>
    <div class="cv-tools"><div class="reasons">${TABS.map(([k, l]) => `<button class="chip" data-rt="${k}" aria-pressed="${RP.tab === k}">${l}</button>`).join('')}</div><span style="margin-left:auto;display:flex;gap:6px"><button class="btn btn-secondary btn-sm" data-fibu="journal">${ic('download', 'i-sm')}Buchungsjournal (CSV)</button><button class="btn btn-primary btn-sm" data-fibu="datev">${ic('download', 'i-sm')}DATEV-Export</button></span></div>
    <div class="card">${rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Datum</th><th>Beleg</th><th>Soll</th><th>Haben</th><th class="r">Betrag</th><th class="r">USt</th><th>Buchungstext</th></tr></thead><tbody>${rows.slice(0, 400).map(r => `<tr><td style="padding-left:16px" class="num">${esc(new Date(r.datum + 'T12:00').toLocaleDateString('de-AT'))}</td><td class="mono" style="font-size:12px">${esc(r.beleg)}</td><td class="mono">${esc(r.soll)}</td><td class="mono">${esc(r.haben)}</td><td class="r num">${eur(r.betrag / 100)}</td><td class="r num">${r.ust ? r.ust + ' %' : '–'}</td><td style="font-size:12.5px">${esc(r.text)}</td></tr>`).join('')}</tbody></table>${rows.length > 400 ? `<div class="muted" style="padding:10px 16px;font-size:12px">… ${num(rows.length - 400)} weitere Zeilen im Export</div>` : ''}`
      : '<div class="empty" style="padding:40px"><p>Keine Buchungen im Zeitraum.</p></div>'}</div>
    <div class="prompt-hint blk" style="margin-top:10px">${ic('info', 'i-xs')}Tagesweise verdichtet: Erlöse je Steuersatz, Zahlungsarten, Gutscheine, Kassenbewegungen. Konten unter Einstellungen → Buchhaltung. DATEV-Format „Buchungsstapel“ (EXTF 700) – vor der ersten Übergabe mit der Steuerberatung abstimmen.</div>`;
};
async function fibuExport(format) {
  const [f, t] = rpRange();
  try { const p = await invoke('fibu_export', {von: dIso(f), bis: dIso(addDays(t, -1)), format}); if (p) toast(format === 'datev' ? 'DATEV-Export gespeichert' : 'Buchungsjournal gespeichert', {t2: p, type: 'pos', icon: 'download'}); }
  catch (e) { toast('Export nicht möglich', {t2: String(e), type: 'warn'}); }
}

/* ── Zahlungsterminal ── */
const _runTerminalSim = runTerminal;
runTerminal = async function (m, amount) {
  if (!DESKTOP) return _runTerminalSim(m, amount);
  PAY.busy = true;
  const term = $('#term'), go2 = $('#payGo'); go2.disabled = true; $('#payAmtIn').disabled = true;
  const reset = msg => { if (!PAY) return; PAY.busy = false; go2.disabled = false; $('#payAmtIn').disabled = false; if (msg) term.innerHTML = msg; };
  if (CFG['terminal.art'] === 'zvt' && CFG['terminal.adresse']) {
    term.innerHTML = `<div class="dev wait">${ic(m.kind === 'wallet' ? 'phone-pay' : 'terminal')}</div><h3>Bitte am Terminal bezahlen</h3><p>${eur(amount)} · ${esc(m.label)} · ZVT ${esc(CFG['terminal.adresse'])}</p><div class="steps"><i class="done"></i><i class="on"></i><i></i></div>`;
    Hooks.emit('device.terminal.started', {betrag: r2(amount), art: m.id});
    let r; try { r = await invoke('terminal_pay', {amount: Math.round(amount * 100)}); } catch (e) { r = {ok: false, message: String(e)}; }
    if (!PAY) return;
    if (r.ok) {
      term.innerHTML = `<div class="ok-ring" style="width:72px;height:72px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div><h3>Zahlung erfolgreich</h3><p>${esc(r.card || m.label)}${r.receipt_no ? ` · Beleg ${esc(r.receipt_no)}` : ''}${r.trace ? ` · Trace ${esc(r.trace)}` : ''}</p>`;
      await wait(reduced() ? 80 : 600);
      if (PAY) addPart(m, amount, `${r.card || m.label}${r.receipt_no ? ' · TB ' + r.receipt_no : ''}`, {terminal: {receipt: r.receipt_no, trace: r.trace, card: r.card}});
      return;
    }
    reset(`<div class="dev" style="color:var(--neg)">${ic('alert')}</div><h3>${esc(r.message || 'Zahlung nicht durchgeführt')}</h3><p>Erneut versuchen oder andere Zahlungsart wählen.</p>`);
    Hooks.emit('device.terminal.failed', {betrag: r2(amount), grund: r.message});
    return;
  }
  // Externes Terminal ohne Anbindung: Betrag am Gerät eingeben, Erfolg bestätigen
  term.innerHTML = `<div class="dev">${ic('terminal')}</div><h3>${eur(amount)} am Kartenterminal eingeben</h3><p>Terminal ohne Kassenanbindung · nach erfolgreicher Zahlung bestätigen</p><div style="display:flex;gap:8px;justify-content:center;margin-top:12px"><button class="btn btn-secondary" id="extNo">Abgebrochen</button><button class="btn btn-primary" id="extOk">${ic('check', 'i-sm')}Zahlung erfolgreich</button></div>`;
  $('#extOk').onclick = () => { if (PAY) addPart(m, amount, 'externes Terminal'); };
  $('#extNo').onclick = () => reset(`<div class="dev">${ic('card')}</div><h3>Zahlung abgebrochen</h3><p>Andere Zahlungsart wählen oder erneut versuchen.</p>`);
  $('#extOk').focus();
};

/* ── Einstellungen: Lokale KI, Buchhaltung, Zahlungsterminal ── */
SET_SECTIONS.splice(SET_SECTIONS.findIndex(s => s[0] === 'rksv'), 0, ['terminal', 'Zahlungsterminal', 'card'], ['buchhaltung', 'Buchhaltung', 'receipt'], ['ki', 'Lokale KI', 'sparkle']);
const _renderSettings = renderSettings;
renderSettings = function () {
  _renderSettings();
  const anchor = $('#sec-rksv'); if (!anchor) return;
  anchor.insertAdjacentHTML('beforebegin', `
    <section class="set-sec" id="sec-terminal"><h2>Zahlungsterminal</h2><p>Kartenzahlung direkt aus der Kasse: Betrag geht automatisch ans Terminal, das Ergebnis zurück (ZVT-Protokoll über das Netzwerk, z. B. Ingenico, Verifone, CCV – je nach Netzbetreiber freischalten lassen). Ohne Anbindung wird der Betrag am Terminal eingetippt und an der Kasse bestätigt.</p><div class="card" id="termBox"></div></section>
    <section class="set-sec" id="sec-buchhaltung"><h2>Buchhaltung</h2><p>Konten für Buchungsjournal und DATEV-Export (Berichte → Buchhaltung). Vorgaben nach Einheitskontenrahmen – mit Ihrer Steuerberatung abstimmen.</p><div class="card" id="fibuBox"></div></section>
    <section class="set-sec" id="sec-ki"><h2>Lokale KI</h2><p>Prognosen, Nachbestellvorschläge und Hinweise rechnet Kontor selbst aus Ihren Belegen – ohne Internet. Für frei formulierte Fragen und Artikeltexte kann zusätzlich ein Sprachmodell eingebunden werden, das auf diesem PC oder im Firmennetz läuft (Ollama). Daten verlassen Ihr Netzwerk nicht.</p><div class="card" id="kiBox"></div></section>`);
  renderTermBox(); renderFibuBox(); renderKiBox();
};
function renderTermBox() {
  const box = $('#termBox'); if (!box) return;
  const art = CFG['terminal.art'] || 'aus';
  box.innerHTML = `<div class="set-row"><div><div class="set-l">Anbindung</div></div><div class="set-c"><div class="seg" id="termSeg">${[['aus', 'Ohne Anbindung'], ['zvt', 'ZVT · Netzwerk']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${art === k}">${l}</button>`).join('')}</div></div></div>`
    + (art === 'zvt' ? field('terminal.adresse', 'IP-Adresse des Terminals', 'z. B. 192.168.1.80 (Port 20007) oder 192.168.1.80:5577') + field('terminal.passwort', 'Kassenpasswort (ZVT)', 'meist 000000 – vom Netzbetreiber', 'password', 'style="max-width:140px"')
      + `<div class="set-row" style="border-bottom:0"><div><div class="set-l">Terminal</div><div class="set-h">Anmelden nach Einrichtung · Kassenschnitt (Tagesabschluss am Terminal) täglich</div></div><div class="set-c" style="gap:6px"><button class="btn btn-secondary btn-sm" data-term="anmelden">${ic('wifi', 'i-sm')}Anmelden</button><button class="btn btn-secondary btn-sm" data-term="kassenschnitt">${ic('receipt', 'i-sm')}Kassenschnitt</button></div></div>` : '');
  initSeg($('#termSeg', box), async b => { await saveSettings({'terminal.art': b.dataset.v}, true); renderTermBox(); });
}
function renderFibuBox() {
  const box = $('#fibuBox'); if (!box) return;
  const f = (k, l, h) => field(k, l, h, 'text', 'style="max-width:120px"');
  box.innerHTML = f('fibu.kasse', 'Kasse', 'Bargeld') + f('fibu.transit', 'Geldtransit / Kartenzahlungen', 'Standard für alle unbaren Zahlarten') + f('fibu.bank', 'Bank', 'Entnahmen zur Bank')
    + f('fibu.gutschein', 'Gutscheine (Verbindlichkeit)', 'Verkauf und Einlösung') + f('fibu.erloes20', 'Erlöse 20 %', '') + f('fibu.erloes13', 'Erlöse 13 %', '') + f('fibu.erloes10', 'Erlöse 10 %', '') + f('fibu.erloes0', 'Erlöse 0 %', '')
    + f('fibu.datev.berater', 'DATEV Beraternummer', 'nur für DATEV-Export') + f('fibu.datev.mandant', 'DATEV Mandantennummer', '');
}
async function renderKiBox() {
  const box = $('#kiBox'); if (!box) return;
  box.innerHTML = field('ki.url', 'Adresse des Sprachmodell-Servers', 'Ollama: http://127.0.0.1:11434 (dieser PC) oder http://<server>:11434', 'text')
    + `<div class="set-row"><div><div class="set-l">Modell</div><div class="set-h">z. B. llama3.1:8b, mistral, qwen2.5 – vorher mit „ollama pull“ laden</div></div><div class="set-c" style="gap:6px"><select class="input select" id="kiModel" style="max-width:240px"><option value="">${CFG['ki.modell'] ? esc(CFG['ki.modell']) : '– keines –'}</option></select><button class="btn btn-secondary btn-sm" id="kiLoad">${ic('sync', 'i-sm')}Modelle laden</button></div></div>`
    + `<div class="set-row" style="border-bottom:0"><div><div class="set-l">Test</div><div class="set-h" id="kiState">${llmReady() ? `Eingerichtet: ${esc(CFG['ki.modell'])}` : 'Ohne Sprachmodell funktionieren Prognosen, Vorschläge, Hinweise und Standardfragen trotzdem.'}</div></div><div class="set-c"><button class="btn btn-secondary btn-sm" id="kiTest" ${llmReady() ? '' : 'disabled'}>${ic('sparkle', 'i-sm')}Testfrage</button></div></div>`;
  if (CFG['ki.modell']) $('#kiModel', box).firstElementChild.value = CFG['ki.modell'];
}
function bindAiFibu() {
  $('#view-dashboard').addEventListener('click', e => {
    if (!DESKTOP) return;
    const b = e.target.closest('[data-act="ins"]'); if (!b) return;
    e.stopPropagation(); const x = INSIGHTS.find(i => i.id === b.dataset.id); if (x) insightAction(x);
  }, true);
  $('#view-einkauf').addEventListener('click', e => {
    const k = e.target.closest('[data-kgo]'); if (!k) return;
    const card = k.closest('[data-kg]'), sid = k.dataset.kgo;
    const lines = $$('[data-kv]', card).filter(c => c.checked).map(c => { const vid = +c.dataset.kv, r = AI.reorder.find(s => s.variant_id === vid), a = artById(r.article_id); return {variant_id: vid, name: r.name, color: r.color, size: r.size, qty: $(`[data-kq="${vid}"]`, card).value, cost: a?.cost != null ? Math.round(a.cost * 100) : null}; });
    if (!lines.length) return toast('Keine Position ausgewählt', {type: 'warn'});
    openPO(null, {supplier: sid, lines});
  });
  $('#view-berichte').addEventListener('click', e => { const f = e.target.closest('[data-fibu]'); if (f) fibuExport(f.dataset.fibu); });
  const sv = $('#view-einstellungen');
  sv.addEventListener('click', async e => {
    const tb = e.target.closest('[data-term]');
    if (tb) {
      toast(tb.dataset.term === 'anmelden' ? 'Anmeldung am Terminal …' : 'Kassenschnitt läuft …', {icon: 'terminal', dur: 2500});
      try { const r = await invoke('terminal_admin', {action: tb.dataset.term, receipt: null}); toast(r.ok ? 'Terminal: erledigt' : 'Terminal meldet einen Fehler', {t2: r.message, type: r.ok ? 'pos' : 'warn'}); }
      catch (err) { toast('Terminal nicht erreichbar', {t2: String(err), type: 'warn', dur: 7000}); }
      return;
    }
    if (e.target.closest('#kiLoad')) {
      try { const l = await invoke('ai_models', {url: CFG['ki.url']}); const sel = $('#kiModel'); sel.innerHTML = `<option value="">– keines –</option>${l.map(m => `<option ${m === CFG['ki.modell'] ? 'selected' : ''}>${esc(m)}</option>`).join('')}`; toast(`${l.length} Modelle gefunden`, {icon: 'sparkle'}); }
      catch (err) { toast('Server nicht erreichbar', {t2: String(err), type: 'warn', dur: 7000}); }
      return;
    }
    if (e.target.closest('#kiTest')) {
      $('#kiState').textContent = 'frage …';
      try { const a = await invoke('ai_llm', {system: 'Antworte in einem kurzen deutschen Satz.', prompt: 'Sag Hallo an das Team im Geschäft.'}); $('#kiState').textContent = `Antwort: ${a.trim()}`; }
      catch (err) { $('#kiState').textContent = String(err); }
    }
  });
  sv.addEventListener('change', async e => { if (e.target.id === 'kiModel') { await saveSettings({'ki.modell': e.target.value}); renderKiBox(); } });
}
