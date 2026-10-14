
/* ════════════════════════════════════════════════════════════════════
   37 · FILIALVERBUND — Zentrale und Filialen. Jede Kasse arbeitet mit
   eigener Datenbank (offline-fähig), der Abgleich läuft im Hintergrund.
   ════════════════════════════════════════════════════════════════════ */
const VB = {info: null, stock: null, transfers: [], sug: [], tab: 'uebersicht', q: ''};
const vbRole = () => VB.info?.rolle || 'einzel';
const vbOn = () => DESKTOP && vbRole() !== 'einzel';
const vbOwn = () => VB.info?.filiale || 'ZENTRALE';
const storeName = id => (VB.info?.stores || []).find(s => s.id === id)?.name || id;
const TR_STATE = {angefordert: ['angefordert', 'warn'], versendet: ['unterwegs', 'info'], empfangen: ['eingegangen', 'pos'], storniert: ['storniert', '']};

async function loadVerbund() {
  if (!DESKTOP) return;
  try { VB.info = await invoke('verbund_info'); } catch (e) { console.error(e); return; }
  // Filialen im Kopf, in der Filialauswahl und an der Kasse (Verfügbarkeit in anderen Filialen) – Name, Nr., Farbe, Gruppe aus Stammdaten › Filialen; abgeschaltete Filialen entfallen
  await filLoad(true); await flSyncCfg();
  const own = {id: vbOwn(), name: VB.info.name || CFG['firma.name'], addr: CFG['firma.adresse'] || '', f: 1};
  STORES.length = 0; OTHER_STORES.length = 0;
  const alle = [own, ...(vbOn() ? (VB.info.stores || []).filter(s => s.id !== own.id && s.active !== false).map(s => ({id: s.id, name: s.name, addr: s.addr || '', f: 1})) : [])];
  flDecorate(alle).forEach((x, i) => { STORES.push(x); if (i) OTHER_STORES.push(x); });
  S.store = own.id;
  if (vbOn()) { try { VB.stock = await invoke('verbund_stock'); } catch { VB.stock = null; } }
  ART.forEach(a => a.variants.forEach(v => { v.other = vbOn() && OTHER_STORES.length ? OTHER_STORES.map(s => VB.stock?.[s.id]?.[v.ean] ?? 0) : null; }));
  if ($('#storeName')) renderStore();
  navBadge('umlagerungen', 0);
  renderStatus();
  if (vbOn()) { try { VB.transfers = await invoke('verbund_transfers'); navBadge('umlagerungen', VB.transfers.filter(t => (t.status === 'angefordert' && t.from === vbOwn()) || (t.status === 'versendet' && t.to === vbOwn())).length); } catch { /* */ } }
}
/** Statusleiste: Rolle und letzter Abgleich (null = Einzelplatz) */
function vbStatus() {
  if (!vbOn()) return null;
  const i = VB.info, st = i.status || {};
  if (vbRole() === 'zentrale') { const n = (i.stores || []).filter(s => s.id !== vbOwn() && s.active !== false).length; return {ok: true, text: `Zentrale ${vbOwn()} · ${n} Filiale${n === 1 ? '' : 'n'}`, tip: 'Klicken: Filialen öffnen'}; }
  const t = st.zeit ? new Date(st.zeit).toLocaleTimeString('de-AT', {hour: '2-digit', minute: '2-digit'}) : '';
  return st.ok === false ? {ok: false, text: `Filiale ${vbOwn()} · Zentrale nicht erreichbar · lokaler Betrieb`, tip: String(st.fehler || 'Abgleich wird automatisch wiederholt')}
    : {ok: true, text: `Filiale ${vbOwn()} · ${t ? 'abgeglichen ' + t : 'verbunden'}`, tip: 'Klicken: Filialen öffnen'};
}
// Verfügbarkeit nach jedem Katalog-Neuladen wieder ergänzen
{ const _rc = replaceCatalog; replaceCatalog = function (list) { _rc(list); if (vbOn()) ART.forEach(a => a.variants.forEach(v => { v.other = OTHER_STORES.length ? OTHER_STORES.map(s => VB.stock?.[s.id]?.[v.ean] ?? 0) : null; })); }; }

/** Kasse: Artikel nicht lagernd → Umlagerung aus der Filiale mit dem meisten Bestand anfordern */
async function requestTransfer(a, v, from) {
  try {
    const t = await invoke('verbund_transfer_create', {from, to: vbOwn(), lines: [{ean: v.ean, qty: 1, name: `${a.name} · ${colorName(v.c)} · ${v.s}`}], note: 'von der Kasse angefordert', user: S.user.name});
    toast('Umlagerung angefordert', {t2: `${t.no} · ${a.name} aus ${storeName(from)}`, type: 'pos', icon: 'swap'});
    Hooks.emit('verbund.transfer.requested', {nr: t.no, von: from, sku: a.id});
    loadVerbund();
  } catch (e) { toast('Umlagerung nicht möglich', {t2: String(e), type: 'warn', dur: 7000}); }
}

/* ── Einstellungen → Filialverbund ── */
SET_SECTIONS.splice(SET_SECTIONS.findIndex(s => s[0] === 'handy'), 0, ['verbund', 'Filialverbund', 'building']);
{
  const _rs = renderSettings;
  renderSettings = function () {
    _rs();
    const a = $('#sec-handy'); if (!a) return;
    a.insertAdjacentHTML('beforebegin', `<section class="set-sec" id="sec-verbund"><h2>Filialverbund</h2><p>Mehrere Filialen bzw. Kassen arbeiten zusammen: Eine Installation ist die <b>Zentrale</b> (Artikel, Preise, Aktionen, Kunden), die anderen sind <b>Filialen</b>. Jede Kasse verkauft mit eigener Datenbank weiter – auch ohne Verbindung – und gleicht sich alle 30 Sekunden mit der Zentrale ab.</p><div class="card" id="vbBox"></div></section>`);
    renderVbBox();
  };
}
async function renderVbBox() {
  const box = $('#vbBox'); if (!box) return;
  if (!DESKTOP) { box.innerHTML = '<div class="empty" style="padding:24px"><p>Nur in der Desktop-App.</p></div>'; return; }
  await loadVerbund();
  const i = VB.info || {}, r = i.rolle || 'einzel', st = i.status || {};
  box.innerHTML = `<div class="set-row"><div><div class="set-l">Rolle dieser Installation</div><div class="set-h">${r === 'einzel' ? 'Einzelplatz – keine Verbindung zu anderen Kassen' : r === 'zentrale' ? `Zentrale · Filialkennung ${esc(i.filiale)}` : `Filiale ${esc(i.filiale)} · verbunden mit ${esc(i.url || '')}`}</div></div><div class="set-c"><div class="seg" id="vbSeg">${[['einzel', 'Einzelplatz'], ['zentrale', 'Zentrale'], ['filiale', 'Filiale']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${r === k}">${l}</button>`).join('')}</div></div></div>
    ${r === 'filiale' ? `<div class="set-row" style="border-bottom:0"><div><div class="set-l">Abgleich ${st.ok ? '<span class="pill pos" style="height:20px">verbunden</span>' : st.fehler ? '<span class="pill neg" style="height:20px">Fehler</span>' : '<span class="pill" style="height:20px">wartet</span>'}</div><div class="set-h">${st.zeit ? `Zuletzt ${esc(fmtTs(st.zeit))} · gesendet ${num(st.gesendet?.belege || 0)} Belege, ${num(st.gesendet?.bestaende || 0)} Bestände · geholt ${num(st.geholt?.artikel || 0)} Artikel, ${num(st.geholt?.kunden || 0)} Kunden` : 'Noch kein Abgleich'}${st.fehler && !st.ok ? `<br><span style="color:var(--neg)">${esc(st.fehler)}</span>` : ''}</div></div><div class="set-c" style="gap:6px"><button class="btn btn-secondary btn-sm" data-vb="test">${ic('wifi', 'i-sm')}Verbindung testen</button><button class="btn btn-primary btn-sm" data-vb="sync">${ic('sync', 'i-sm')}Jetzt abgleichen</button></div></div>` : ''}
    ${r === 'zentrale' ? `<div class="set-row" style="border-bottom:0"><div><div class="set-l">Filialen</div><div class="set-h">${num((i.stores || []).length - 1)} Filialen angebunden · Verwaltung unter Filialen</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-goto="st-filiale">${ic('building', 'i-sm')}Filialen</button></div></div>` : ''}`;
  initSeg($('#vbSeg', box), b => openVbSetup(b.dataset.v));
}
function openVbSetup(rolle) {
  const i = VB.info || {};
  const el = openLayer(`<div class="modal" style="width:min(560px,100%)" role="dialog" aria-modal="true" aria-label="Filialverbund"><div class="m-head"><div class="m-ic">${ic('building')}</div><div><h2>${rolle === 'zentrale' ? 'Als Zentrale einrichten' : rolle === 'filiale' ? 'Mit der Zentrale verbinden' : 'Einzelplatz'}</h2><p>${rolle === 'zentrale' ? 'Diese Installation führt Artikel, Preise und Kunden für alle Filialen' : rolle === 'filiale' ? 'Verbindungscode aus der Zentrale (Filialen → Filiale anlegen) einfügen' : 'Abgleich mit anderen Kassen beenden – lokale Daten bleiben erhalten'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:12px">${rolle === 'einzel' ? '' : `<div class="ed-grid"><label class="field"><span>Filialkennung</span><input class="input" id="vbFil" value="${esc(i.rolle === rolle ? i.filiale : (rolle === 'zentrale' ? 'ZEN' : ''))}" placeholder="z. B. INN" style="text-transform:uppercase"></label>${rolle === 'filiale' ? '' : `<label class="field"><span>Kurz-Name</span><input class="input" id="vbName" value="${esc(i.name || CFG['firma.name'])}"><small class="ea-hint">Weitere Angaben später unter Stammdaten › Filialen › Filialen.</small></label>`}</div>`}
      ${rolle === 'filiale' ? `<label class="field"><span>Verbindungscode</span><textarea class="input mono" id="vbCode" rows="3" style="height:auto;padding-top:9px;font-size:12px" placeholder="eyJ1cmwiOi…"></textarea></label><div class="prompt-hint blk">${ic('info', 'i-xs')}Die Filiale übernimmt danach Artikel, Preise, Aktionen und Kunden der Zentrale. Belege dieser Kasse bleiben hier und werden zusätzlich an die Zentrale gemeldet.</div>` : ''}
      ${rolle === 'zentrale' ? `<div class="prompt-hint blk">${ic('info', 'i-xs')}Der eingebaute Server wird im Firmennetz erreichbar (Port ${esc(CFG['api.port'] || 8787)}). Für Filialen an anderen Standorten: VPN oder Portfreigabe einrichten. Jede Filiale bekommt einen eigenen Schlüssel.</div>` : ''}</div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="vbGo">${ic('check', 'i-sm')}Übernehmen</button></div></div>`, {focus: '#vbFil', onClose: () => renderVbBox()});
  $('#vbGo', el).onclick = async () => {
    let by; try { by = (await stepUp({title: 'Filialverbund ändern', text: 'Rolle dieser Installation festlegen', admin: true})).by; } catch { return; }
    try {
      VB.info = await invoke('verbund_setup', {rolle, filiale: $('#vbFil', el)?.value.trim() || '', name: $('#vbName', el)?.value.trim() || '', code: $('#vbCode', el)?.value.trim() || null, by: by.name});
      closeLayer(el);
      if (rolle === 'filiale') { toast('Mit der Zentrale verbunden', {t2: 'Erster Abgleich läuft …', icon: 'sync', type: 'pos'}); try { const r = await invoke('verbund_sync'); await afterSync(r); } catch (e) { toast('Abgleich fehlgeschlagen', {t2: String(e), type: 'warn', dur: 8000}); } }
      else toast(rolle === 'zentrale' ? 'Zentrale eingerichtet' : 'Einzelplatz', {t2: rolle === 'zentrale' ? 'Jetzt unter Filialen die Filialen anlegen' : '', type: 'pos', icon: 'building'});
      Hooks.emit('config.verbund', {rolle});
      // Kassen-ID der Vorlage durch die Filialkennung ersetzen (Belegnummern/RKSV je Standort eindeutig)
      if (rolle !== 'einzel' && VB.info?.filiale && (!CFG['kasse.id'] || CFG['kasse.id'] === 'INN-K01')) await saveSettings({'kasse.id': VB.info.filiale + '-K01'}, true);
      await loadVerbund(); renderVbBox(); renderNavVerbund();
    } catch (e) { toast('Nicht möglich', {t2: String(e), type: 'warn', dur: 8000}); }
  };
}
async function afterSync(r) {
  try { replaceCatalog(await invoke('catalog_list')); await loadCustomers(); await loadPromos(); await loadSuppliers(); } catch { /* */ }
  await loadVerbund();
  toast('Abgleich abgeschlossen', {t2: `${num(r.gesendet.belege)} Belege gesendet · ${num(r.geholt.artikel)} Artikel, ${num(r.geholt.kunden)} Kunden geholt`, type: 'pos', icon: 'sync'});
}

/* ── Seiten: Filialen, Umlagerungen ── */
function renderNavVerbund() {
  // Filialen stehen unter Stammdaten › Filialen, Umlagerungen unter Artikel › Umlagerungen
  const walk = l => l.forEach(n => { if (n.id === 'filialen') n.label = 'Filial-Übersicht'; if (n.kids) walk(n.kids); });
  walk(NAV);
  if ($('#nav')) { renderNav(); permNav(); $$('.nav-item').forEach(n => n.dataset.view === S.view ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current')); loadVerbund(); }
}
registerPage('filialen', {title: 'Filial-Übersicht', sub: () => vbRole() === 'einzel' ? 'Einzelplatz' : vbRole() === 'zentrale' ? 'Zentrale' : `Filiale ${vbOwn()}`, render: renderFilialen});
registerPage('umlagerungen', {title: 'Umlagerungen', sub: () => 'Ware zwischen Filialen verschieben', render: renderUmlagerungen});
async function renderFilialen() {
  const v = $('#view-filialen');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('building', 'Filialverbund'); return; }
  await loadVerbund();
  if (!vbOn()) { v.innerHTML = `<div class="cv">${pageHead('Filialen', 'Mehrere Standorte und Kassen verbinden')}<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('building')}</div><h3>Diese Kasse arbeitet als Einzelplatz</h3><p>Für mehrere Filialen oder Kassen: eine Installation als Zentrale einrichten, die anderen als Filiale verbinden. Jede Kasse bleibt offline-fähig.</p><button class="btn btn-primary" data-vbset="1">${ic('sliders', 'i-sm')}Filialverbund einrichten</button></div></div></div>`; return; }
  const z = vbRole() === 'zentrale', list = VB.info.stores || [];
  const online = s => s.id === vbOwn() || (s.last_sync && Date.now() - new Date(s.last_sync) < 3 * 6e4);
  if (z) { try { VB.sug = await invoke('verbund_suggestions'); } catch { VB.sug = []; } }
  v.innerHTML = `<div class="cv">${pageHead('Filial-Übersicht', z ? 'Zentrale · Artikel, Preise, Aktionen und Kunden werden an alle Filialen verteilt' : `Filiale ${esc(vbOwn())} · Stammdaten kommen aus der Zentrale`, z ? `<button class="btn btn-primary" data-vb="neu">${ic('plus', 'i-sm')}Filiale anlegen</button>` : `<button class="btn btn-secondary" data-vb="sync">${ic('sync', 'i-sm')}Jetzt abgleichen</button>`)}
    ${kpiCards([[num(list.length), 'Standorte'], [num(list.filter(online).length), 'online'], [eur(list.reduce((a, s) => a + (s.revenue_today || 0), 0) / 100), 'Umsatz heute (alle)'], [eur0(list.reduce((a, s) => a + (s.revenue_month || 0), 0) / 100), 'Umsatz Monat (alle)']])}
    <div class="seg" id="vbTab" style="margin-bottom:12px">${[['uebersicht', 'Übersicht'], ['bestand', 'Bestand je Filiale'], ...(z ? [['vorschlag', `Umlagerungsvorschläge${VB.sug.length ? ` (${VB.sug.length})` : ''}`]] : [])].map(([k, l]) => `<button data-v="${k}" aria-pressed="${VB.tab === k}">${l}</button>`).join('')}</div>
    <div id="vbBody"></div></div>`;
  initSeg($('#vbTab', v), b => { VB.tab = b.dataset.v; renderVbBody(); });
  renderVbBody();
}
function renderVbBody() {
  const box = $('#vbBody'); if (!box) return;
  const list = VB.info.stores || [], z = vbRole() === 'zentrale';
  if (VB.tab === 'uebersicht') {
    const max = Math.max(1, ...list.map(s => s.revenue_today || 0));
    box.innerHTML = `<div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Filiale</th><th>Status</th><th class="r">Bons heute</th><th>Umsatz heute</th><th class="r" style="padding-right:16px">Umsatz Monat</th></tr></thead><tbody>${list.map(s => { const on = s.id === vbOwn() || (s.last_sync && Date.now() - new Date(s.last_sync) < 3 * 6e4); return `<tr><td style="padding-left:16px">${flDot(s.id)}<b>${esc(s.name)}</b><div class="muted" style="font-size:11.5px">${esc(s.id)}${s.id === vbOwn() ? ' · diese Kasse' : ''}${s.info?.version ? ' · v' + esc(s.info.version) : ''}</div></td><td>${s.own ? '<span class="pill accent">Zentrale</span>' : `<span class="pill ${on ? 'pos' : 'warn'}">${on ? 'online' : 'zuletzt ' + (s.last_sync ? esc(fmtTs(s.last_sync)) : 'nie')}</span>`}</td><td class="r num">${num(s.sales_today || 0)}</td><td style="min-width:200px"><div style="display:flex;align-items:center;gap:10px"><div class="meter" style="flex:1"><i style="width:${(s.revenue_today || 0) / max * 100}%;${flBg(s.id)}"></i></div><b class="num" style="min-width:90px;text-align:right">${eur((s.revenue_today || 0) / 100)}</b></div></td><td class="r num" style="padding-right:16px">${eur0((s.revenue_month || 0) / 100)}</td></tr>`; }).join('')}</tbody></table></div>
      ${z ? '' : `<div class="prompt-hint blk" style="margin-top:10px">${ic('info', 'i-xs')}Umsätze der anderen Filialen kommen mit jedem Abgleich aus der Zentrale.</div>`}`;
  } else if (VB.tab === 'bestand') {
    const n = norm(VB.q), arts = (n ? ART.filter(a => a.hay.includes(n)) : ART).slice(0, 6), stores = STORES;
    box.innerHTML = `<div class="filters"><input class="input" id="vbQ" placeholder="Artikel suchen …" value="${esc(VB.q)}" style="max-width:360px"></div>${arts.map(a => `<div class="card" style="margin-bottom:12px"><div class="set-row"><div><div class="set-l">${esc(a.name)}</div><div class="set-h">${esc(a.id)} · ${eur(a.sale || a.price)}</div></div></div><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Variante</th>${stores.map(s => `<th class="r">${esc(s.name)}</th>`).join('')}<th class="r" style="padding-right:16px">Summe</th></tr></thead><tbody>${a.variants.map(v => { const q = stores.map((s, i) => i === 0 ? v.q : (VB.stock?.[s.id]?.[v.ean] ?? 0)); return `<tr><td style="padding-left:16px">${esc(colorName(v.c))} · ${esc(v.s)}</td>${q.map(x => `<td class="r num" style="${x <= 0 ? 'color:var(--text-4)' : x <= 2 ? 'color:var(--warn);font-weight:600' : ''}">${x}</td>`).join('')}<td class="r num" style="padding-right:16px;font-weight:600">${q.reduce((s2, x) => s2 + Math.max(0, x), 0)}</td></tr>`; }).join('')}</tbody></table></div>`).join('')}`;
  } else {
    box.innerHTML = VB.sug.length ? `<div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Artikel</th><th>Von → Nach</th><th class="r">Menge</th><th>Begründung</th><th></th></tr></thead><tbody>${VB.sug.slice(0, 50).map((x, i) => `<tr><td style="padding-left:16px"><b>${esc(x.name)}</b><div class="muted" style="font-size:11.5px">${esc(colorName(x.color))} · ${esc(x.size)}</div></td><td>${esc(storeName(x.from))} → <b>${esc(storeName(x.to))}</b></td><td class="r num">${x.qty}</td><td style="font-size:12px;color:var(--text-2);max-width:420px">${esc(x.reason)}</td><td class="r" style="padding-right:12px"><button class="btn btn-secondary btn-sm" data-vbsug="${i}">Anlegen</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card"><div class="empty" style="padding:48px"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><h3>Keine Umlagerung nötig</h3><p>Vorschläge entstehen, wenn eine Filiale einen gut laufenden Artikel nicht mehr hat und eine andere genug davon.</p></div></div>`;
  }
}
async function renderUmlagerungen() {
  const v = $('#view-umlagerungen');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('swap', 'Umlagerungen'); return; }
  await loadVerbund();
  if (!vbOn()) { v.innerHTML = `<div class="cv">${pageHead('Umlagerungen', 'Ware zwischen Filialen verschieben')}<div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('swap')}</div><h3>Nur im Filialverbund</h3><p>Umlagerungen gibt es, sobald mehrere Filialen verbunden sind.</p><button class="btn btn-primary" data-vbset="1">Filialverbund einrichten</button></div></div></div>`; return; }
  const own = vbOwn(), z = vbRole() === 'zentrale';
  v.innerHTML = `<div class="cv">${pageHead('Umlagerungen', 'Angefordert → versendet (Quelle bucht aus) → eingegangen (Ziel bucht ein)', `<button class="btn btn-primary" data-vb="tneu">${ic('plus', 'i-sm')}Umlagerung anlegen</button>`)}
    <div class="card">${VB.transfers.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Nummer</th><th>Von → Nach</th><th>Positionen</th><th>Status</th><th>Angelegt</th><th></th></tr></thead><tbody>${VB.transfers.map(t => { const [l, tone] = TR_STATE[t.status] || [t.status, '']; const acts = [t.status === 'angefordert' && t.from === own ? `<button class="btn btn-primary btn-sm" data-tst="versendet" data-tno="${esc(t.no)}">Versenden</button>` : '', t.status === 'versendet' && t.to === own ? `<button class="btn btn-primary btn-sm" data-tst="empfangen" data-tno="${esc(t.no)}">Eingang buchen</button>` : '', t.status === 'angefordert' && (z || t.to === own) ? `<button class="btn btn-ghost btn-sm" data-tst="storniert" data-tno="${esc(t.no)}">Stornieren</button>` : ''].join(''); return `<tr><td style="padding-left:16px" class="mono"><b>${esc(t.no)}</b></td><td>${esc(storeName(t.from))} → <b>${esc(storeName(t.to))}</b></td><td style="font-size:12.5px">${t.lines.map(x => `${x.qty} × ${esc(x.name || x.ean)}`).join('<br>')}</td><td><span class="pill ${tone}">${l}</span></td><td class="muted" style="font-size:12px">${esc(fmtTs(t.created_at))}${t.note ? `<br>${esc(t.note)}` : ''}</td><td class="r" style="padding-right:12px;white-space:nowrap">${acts}</td></tr>`; }).join('')}</tbody></table>`
      : `<div class="empty" style="padding:48px"><div class="empty-icon">${ic('swap')}</div><h3>Noch keine Umlagerungen</h3><p>${z ? 'Umlagerungen anlegen oder Vorschläge unter Filialen übernehmen.' : 'An der Kasse bei „nicht lagernd“ direkt aus einer anderen Filiale anfordern.'}</p></div>`}</div></div>`;
}
function openTransferNew(preset) {
  const own = vbOwn(), stores = STORES;
  const st = {from: preset?.from || stores.find(s => s.id !== own)?.id || '', to: preset?.to || own, lines: preset?.lines || [], q: ''};
  const el = openLayer(`<div class="modal" style="width:min(640px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Umlagerung"><div id="tnBox" style="display:flex;flex-direction:column;min-height:0"></div></div>`);
  const box = $('#tnBox', el);
  const render = () => {
    const n = norm(st.q), hits = n ? ART.flatMap(a => a.variants.filter(v => a.hay.includes(n) || v.ean === st.q.trim()).map(v => ({a, v}))).slice(0, 12) : [];
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('swap')}</div><div><h2>Umlagerung anlegen</h2><p>${vbRole() === 'zentrale' ? 'wird sofort an beide Filialen verteilt' : 'wird in der Zentrale angelegt (Verbindung nötig)'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:12px;overflow:auto"><div class="ed-grid"><label class="field"><span>Von</span><select class="input select" id="tnFrom">${stores.map(s => `<option value="${esc(s.id)}" ${s.id === st.from ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label><label class="field"><span>Nach</span><select class="input select" id="tnTo">${stores.map(s => `<option value="${esc(s.id)}" ${s.id === st.to ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>
        <input class="input" id="tnQ" placeholder="Artikel suchen oder EAN scannen …" value="${esc(st.q)}" autocomplete="off">
        ${hits.length ? `<div class="reasons">${hits.map(({a, v}) => `<button class="chip" data-tnadd="${esc(v.ean)}" style="height:30px">${esc(a.name)} · ${esc(colorName(v.c))} · ${esc(v.s)}</button>`).join('')}</div>` : ''}
        <div class="card" style="box-shadow:none">${st.lines.length ? `<table class="tbl" style="margin:0"><tbody>${st.lines.map((l, i) => `<tr><td style="padding-left:14px">${esc(l.name)}<div class="muted mono" style="font-size:11px">${esc(l.ean)}</div></td><td class="r"><input class="input num" data-tnq="${i}" value="${l.qty}" style="width:70px;height:30px;text-align:right"></td><td class="r" style="padding-right:10px"><button class="btn btn-ghost btn-sm btn-icon" data-tnrm="${i}" aria-label="Entfernen">${ic('x', 'i-sm')}</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:22px"><p>Noch keine Positionen.</p></div>'}</div></div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="tnGo" ${st.lines.length ? '' : 'disabled'}>${ic('check', 'i-sm')}Anlegen</button></div>`;
  };
  el.addEventListener('input', e => { if (e.target.id === 'tnQ') { st.q = e.target.value; render(); const q = $('#tnQ', el); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } });
  el.addEventListener('change', e => { if (e.target.id === 'tnFrom') st.from = e.target.value; if (e.target.id === 'tnTo') st.to = e.target.value; const i = e.target.dataset.tnq; if (i != null) st.lines[+i].qty = Math.max(1, parseInt(e.target.value, 10) || 1); });
  el.addEventListener('click', async e => {
    const ad = e.target.closest('[data-tnadd]'); if (ad) { const h = findEan(ad.dataset.tnadd); const ex = st.lines.find(l => l.ean === h.v.ean); ex ? ex.qty++ : st.lines.push({ean: h.v.ean, qty: 1, name: `${h.a.name} · ${colorName(h.v.c)} · ${h.v.s}`}); st.q = ''; return render(); }
    const rm = e.target.closest('[data-tnrm]'); if (rm) { st.lines.splice(+rm.dataset.tnrm, 1); return render(); }
    if (e.target.closest('#tnGo')) {
      try { const t = await invoke('verbund_transfer_create', {from: st.from, to: st.to, lines: st.lines, note: '', user: S.user.name}); closeLayer(el); toast('Umlagerung angelegt', {t2: `${t.no} · ${storeName(t.from)} → ${storeName(t.to)}`, type: 'pos', icon: 'swap'}); await loadVerbund(); if (S.view === 'umlagerungen') renderUmlagerungen(); }
      catch (err) { toast('Nicht angelegt', {t2: String(err), type: 'warn', dur: 7000}); }
    }
  });
  render();
}
async function transferStatus(no, status) {
  const lbl = {versendet: 'Ware versenden – Bestand wird hier ausgebucht', empfangen: 'Wareneingang – Bestand wird hier eingebucht', storniert: 'Umlagerung stornieren'}[status];
  try { await needPerm('bestand.buchen', 'Umlagerung', lbl); } catch { return; }
  try {
    const t = await invoke('verbund_transfer_status', {no, status, user: S.user.name});
    toast(`Umlagerung ${TR_STATE[status][0]}`, {t2: t.no, type: 'pos', icon: 'swap'});
    replaceCatalog(await invoke('catalog_list')); await loadVerbund();
    Hooks.emit('verbund.transfer.' + status, {nr: no});
    if (S.view === 'umlagerungen') renderUmlagerungen();
  } catch (e) { toast('Nicht möglich', {t2: String(e), type: 'warn', dur: 7000}); }
}

/* ── Dashboard: Filialvergleich mit echten Zahlen ── */
if (DESKTOP && W['sales.stores']) {
  const ws = W['sales.stores'];
  ws.sub = () => vbOn() ? 'Umsatz heute je Filiale' : 'Einzelplatz';
  ws.tools = () => '';
  ws.body = () => {
    const list = vbOn() ? (VB.info?.stores || []) : [];
    if (!list.length) return `<div class="empty" style="flex:1"><div class="empty-icon">${ic('building')}</div><h3>Einzelplatz</h3><p>Im Filialverbund erscheinen hier die Umsätze aller Filialen.</p></div>`;
    const max = Math.max(1, ...list.map(s => s.revenue_today || 0));
    return `<div class="wl">${list.slice().sort((a, b) => (b.revenue_today || 0) - (a.revenue_today || 0)).map(s => `<div class="wl-row"><div class="wl-main"><div class="wl-t">${flDot(s.id)}${esc(s.name)}${s.id === vbOwn() ? ' <span class="muted" style="font-weight:400">· hier</span>' : ''}</div><div class="meter" style="margin-top:6px"><i style="width:${(s.revenue_today || 0) / max * 100}%;${flBg(s.id)}"></i></div></div><b class="num">${eur0((s.revenue_today || 0) / 100)}</b></div>`).join('')}</div>`;
  };
}

function bindVerbund() {
  const on = (id, fn) => $('#view-' + id)?.addEventListener('click', fn);
  $('#view-einstellungen').addEventListener('click', async e => {
    const b = e.target.closest('[data-vb]'); if (!b) return;
    if (b.dataset.vb === 'test') { try { const r = await invoke('verbund_test'); toast('Zentrale erreichbar', {t2: `${r.zentrale || 'Zentrale'} · Filiale ${r.filiale}`, type: 'pos', icon: 'wifi'}); } catch (err) { toast('Keine Verbindung', {t2: String(err), type: 'warn', dur: 8000}); } }
    if (b.dataset.vb === 'sync') { try { await afterSync(await invoke('verbund_sync')); } catch (err) { toast('Abgleich fehlgeschlagen', {t2: String(err), type: 'warn', dur: 8000}); } renderVbBox(); }
  });
  on('filialen', async e => {
    if (e.target.closest('[data-vbset]')) return setGo('verbund');
    const b = e.target.closest('[data-vb]');
    if (b?.dataset.vb === 'neu') return flNeu();
    if (b?.dataset.vb === 'sync') { try { await afterSync(await invoke('verbund_sync')); } catch (err) { toast('Abgleich fehlgeschlagen', {t2: String(err), type: 'warn', dur: 8000}); } return renderFilialen(); }
    const sg = e.target.closest('[data-vbsug]'); if (sg) { const x = VB.sug[+sg.dataset.vbsug]; return openTransferNew({from: x.from, to: x.to, lines: [{ean: x.ean, qty: x.qty, name: `${x.name} · ${colorName(x.color)} · ${x.size}`}]}); }
  });
  $('#view-filialen').addEventListener('input', e => { if (e.target.id === 'vbQ') { VB.q = e.target.value; renderVbBody(); const q = $('#vbQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } });
  on('umlagerungen', e => {
    if (e.target.closest('[data-vbset]')) return setGo('verbund');
    if (e.target.closest('[data-vb="tneu"]')) return openTransferNew();
    const s = e.target.closest('[data-tst]'); if (s) transferStatus(s.dataset.tno, s.dataset.tst);
  });
  // regelmäßig Status/Umsätze der Filialen aktualisieren
  setInterval(() => { if (vbOn()) loadVerbund().then(() => { if (S.view === 'filialen' && VB.tab === 'uebersicht') renderVbBody(); }); }, 60000);
}
