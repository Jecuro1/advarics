/* ═════════════════════════════════════════════════════════════════
   45 · EINSTELLUNGEN NACH ADVARICS (2) — Kassen, Buchungsabschluss, Bonus Systeme
   ═════════════════════════════════════════════════════════════════ */
const e2Back = () => history.length > 1 ? history.back() : go('dashboard');
const e2Date = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '';

/* ── Kassen ── */
STAMM_DEF.kasse = {t: 'Kassen', ic: 'register', sub: 'Kassen je Filiale', cols: [{k: 'bez', l: 'Kassen-Bez'}],
  seed: [{id: 'K1', filnr: '1', filname: 'Innsbruck', filgrp: '', land: 'Österreich', nr: 1, bez: 'Kasse 1', konfig: 'Standard', sync: true, core: true, inaktiv: false, kdStart: 1, kdEnde: 99999, reStart: 1, reEnde: 99999, letzteSync: '', mac: '', syncname: '', paket: '', langsam: false, region: 'de-AT', design: 'Kontor', ws: ''}]};
const KA_FELDER = [
  {k: 'filnr', l: 'Fil.-Nr.', t: 'num'}, {k: 'filname', l: 'Fil.-Name', t: 'select', o: () => STORES.map(s => [s.name, s.name])}, {k: 'filgrp', l: 'Fil.-Grp.'}, {k: 'land', l: 'Land'},
  {k: 'nr', l: 'Kassen-Nr.', t: 'num', req: true}, {k: 'bez', l: 'Kassen-Bez', req: true}, {k: 'konfig', l: 'Kassen-Konfiguration'},
  {k: 'sync', l: 'Synchronisiert', t: 'check'}, {k: 'core', l: 'Core Kasse aktiv', t: 'check'}, {k: 'inaktiv', l: 'Nicht aktiv', t: 'check'},
  {k: 'kdStart', l: 'StartNummerKunden', t: 'num'}, {k: 'kdEnde', l: 'EndeNummerKunden', t: 'num'}, {k: 'reStart', l: 'StartNummerRechnung', t: 'num'}, {k: 'reEnde', l: 'EndeNummerRechnung', t: 'num'},
  {k: 'mac', l: 'MAC-Adresse'}, {k: 'syncname', l: 'Sync-Name'}, {k: 'paket', l: 'Update-Kasse Paket'}, {k: 'langsam', l: 'Langsamer Sync-Speed', t: 'check'},
  {k: 'region', l: 'Region und Sprache'}, {k: 'design', l: 'Aktives Design'}, {k: 'ws', l: 'Intersport Workstation-Nr.'}];
const kaRows = () => stRows('kasse').map(r => ({...r, id: r.id}));
async function kaEdit(id, done) {
  const all = stRows('kasse'), r = id ? all.find(x => x.id === id) : null;
  const base = r || {filnr: '1', filname: STORES[0].name, land: 'Österreich', nr: Math.max(0, ...all.map(x => +x.nr || 0)) + 1, kdStart: 1, kdEnde: 99999, reStart: 1, reEnde: 99999, region: 'de-AT', design: 'Kontor', sync: false, core: false, inaktiv: false, langsam: false};
  const o = await aeForm(r ? 'Kasse bearbeiten' : 'Neue Kasse', KA_FELDER, base, {del: !!r}); if (!o) return;
  try {
    await needPerm('einstellungen', 'Kassen');
    let list = all.map(x => ({...x}));
    if (o._del) { if (list.length < 2) return toast('Die letzte Kasse kann nicht gelöscht werden', {type: 'warn'}); list = list.filter(x => x.id !== id); }
    else {
      const d = {...o}; ['nr', 'kdStart', 'kdEnde', 'reStart', 'reEnde'].forEach(k => { d[k] = parseInt(d[k], 10) || 0; });
      if (r) list = list.map(x => x.id === id ? {...x, ...d} : x); else list.push({id: 'ka-' + aeUid(), _aktiv: true, ...d});
    }
    await stammSave('kasse', list); done();
  } catch (err) { if (String(err.message || err) !== 'abgebrochen') toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
}
agridPage('einst-kassen', {
  title: 'Kassen', rows: kaRows, count: () => stRows('kasse').length, sort: {k: 'bez', dir: 1},
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'filnr', l: 'Fil.-Nr.', t: 'num', w: 90}, {k: 'filname', l: 'Fil.-Name', w: 160}, {k: 'land', l: 'Land', w: 130}, {k: 'nr', l: 'Kassen-Nr.', t: 'num', w: 110}, {k: 'bez', l: 'Kassen-Bez', w: 170}, {k: 'konfig', l: 'Kassen-Konfiguration', w: 190}, {k: 'inaktiv', l: 'Nicht aktiv', t: 'check', w: 120}, {k: 'region', l: 'Region und Sprache', w: 150}, {k: 'design', l: 'Aktives Design', w: 140}],
  actions: {back: e2Back, refresh: async () => { await loadStamm(true); PAGES['einst-kassen'].render(); }, new: () => kaEdit(null, () => PAGES['einst-kassen'].render())},
  edit: (id, done) => kaEdit(id, done),
  remove: async ids => { if (!await confirmBox(`${num(ids.length)} Kasse${ids.length > 1 ? 'n' : ''} löschen?`, 'Löschen')) throw new Error('abgebrochen'); await needPerm('einstellungen', 'Kassen'); const s = new Set(ids), rest = stRows('kasse').filter(r => !s.has(r.id)); if (!rest.length) throw new Error('Die letzte Kasse kann nicht gelöscht werden'); await stammSave('kasse', rest.map(r => ({...r}))); },
});
VIEW_PERM['einst-kassen'] = 'einstellungen';

/* ── Buchungsabschluss ── */
STAMM_DEF.buchungsabschluss = {t: 'Buchungsabschluss', ic: 'lock', sub: 'Abschlüsse der Buchungen', cols: [{k: 'abschluss', l: 'Abschluss zum'}]};
const baRows = () => stRows('buchungsabschluss').map(r => ({id: r.id, erstellt: r.erstellt || '', abschluss: r.abschluss || '', usernr: r.usernr || '', user: r.user || ''}));
function baRender() {
  const host = $('#view-buchungsabschluss'); if (!host) return;
  const rows = stRows('buchungsabschluss'), last = rows.map(r => r.abschluss).sort().pop() || '';
  const el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  el.innerHTML = `<div class="ag-bar ae-bar"><button class="ag-btn" data-ba="back">${ic('chevron-left', 'i-sm')}<span>Zurück</span></button><button class="ag-btn" data-ba="refresh">${ic('sync', 'i-sm')}<span>Aktualisieren</span></button><button class="ag-btn" data-ba="save" disabled>${ic('check', 'i-sm')}<span>Sichern</span></button><button class="ag-btn" data-ba="undo" disabled>${ic('undo', 'i-sm')}<span>Änderungen zurücknehmen</span></button></div>
    <div class="ae-card ea-card" style="max-width:none"><h4>Einstellungen</h4><label class="field" style="max-width:340px"><span>Abschluss zum</span><input class="input" type="date" data-ba-d value="${esc(last)}" max="${today()}"></label></div>
    <div class="ba-grid" style="flex:1;display:flex;flex-direction:column;min-height:360px"></div>`;
  AG['ba-grid'] = agNew({embed: true, title: 'Buchungsabschluss', rows: baRows, sort: {k: 'erstellt', dir: -1},
    cols: [{k: 'erstellt', l: 'Erstellt am', w: 190, fmt: v => v ? `${e2Date(v)} ${String(v).slice(11, 16)}` : ''}, {k: 'abschluss', l: 'Abschluss zum', w: 170, fmt: e2Date}, {k: 'usernr', l: 'User-Nr.', t: 'num', w: 110}, {k: 'user', l: 'User', w: 220}],
    extra: [{k: 'refresh', l: 'Aktualisieren', icon: 'sync'}], actions: {refresh: () => baRefresh()}});
  agMount('ba-grid', $('.ba-grid', el));
  const inp = $('[data-ba-d]', el), mark = () => $$('[data-ba="save"],[data-ba="undo"]', el).forEach(b => { b.disabled = inp.value === last; });
  inp.addEventListener('input', mark);
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-ba]'); if (!b || b.disabled) return; const a = b.dataset.ba;
    if (a === 'back') return e2Back();
    if (a === 'refresh' || a === 'undo') return baRefresh();
    try {
      await needPerm('einstellungen', 'Buchungsabschluss');
      const d = inp.value;
      if (!d) return toast('Datum „Abschluss zum“ angeben', {type: 'warn'});
      if (d > today()) return toast('Der Abschluss darf nicht in der Zukunft liegen', {type: 'warn'});
      if (last && d < last) return toast(`Der Abschluss muss nach dem letzten (${e2Date(last)}) liegen`, {type: 'warn'});
      if (!await confirmBox(`Buchungen bis ${e2Date(d)} abschließen?`, 'Abschließen')) return;
      const now = new Date(), p = n => String(n).padStart(2, '0'), ts = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}`;
      await stammSave('buchungsabschluss', [...rows.map(r => ({...r})), {id: 'ba-' + aeUid(), _aktiv: true, erstellt: ts, abschluss: d, usernr: S.user.id || '', user: S.user.name}]);
      await saveSettings({'buchung.abschluss': d}, true); toast('Buchungsabschluss gespeichert', {t2: `bis ${e2Date(d)}`, type: 'pos', icon: 'lock'}); baRefresh();
    } catch (err) { if (err && String(err.message || err) !== 'abgebrochen') toast('Nicht gespeichert', {t2: String(err.message || err), type: 'warn'}); }
  });
}
async function baRefresh() { await loadStamm(true); baRender(); }
registerPage('buchungsabschluss', {title: 'Buchungsabschluss', sub: () => 'Einstellungen', render: async () => { await loadStamm(); baRender(); }});
VIEW_PERM.buchungsabschluss = 'einstellungen';

/* ── Bonus Systeme ── */
STAMM_DEF.bonussystem = {t: 'Bonus Systeme', ic: 'gift', sub: 'Bonus-Systeme mit Filtern und Staffeln', cols: [{k: 'name', l: 'Name'}]};
const BS_TYPEN = [['marke', 'Marke'], ['warengruppe', 'Warengruppe'], ['hauptabteilung', 'Haupt-Abteilung'], ['abteilung', 'Abteilung'], ['hauptbereich', 'Haupt-Bereich'], ['bereich', 'Bereich'], ['saison', 'Saison']];
const bsNeu = () => ({name: '', kundenfilter: false, von: 0, bis: 0, nurReg: false, regulaer: false, reduziert: false, rabattiert: false, maxRabatt: 0, maxEinheit: '%', gutscheintyp: '', tage: 0, filter: [], staffeln: []});
const bsStaffel = () => ({name: '', ab: 0, pLauf: 0, pLaufU: '%', bLauf: 0, pGesp: 0, pGespU: '%', bGesp: 0});
const BS = {id: null, ids: [], draft: null, tab: 'allg', dirty: false};
const bsLoad = id => { const r = id ? stRows('bonussystem').find(x => x.id === id) : null; return r ? JSON.parse(JSON.stringify({...bsNeu(), ...r})) : bsNeu(); };
const bsOpt = kind => kind === 'marke' && !stActive('marke').length ? [...new Set(ART.map(a => a.brand).filter(Boolean))].sort().map(x => [x, x]) : stActive(kind).map(r => [r.id, `${r.name || r.id}${r.nr != null && r.nr !== '' ? ` (${r.nr})` : ''}`]);
const bsLabel = (typ, id) => { const h = bsOpt(typ).find(x => x[0] === id); return h ? h[1] : ''; };
function bsOpen(id, ids) {
  BS.id = id; BS.ids = ids || BS.ids; BS.draft = bsLoad(id); BS.tab = 'allg'; BS.dirty = false;
  if (S.view === 'st-bonussystem-edit') PAGES['st-bonussystem-edit'].render(); else go('st-bonussystem-edit');
}
agridPage('st-bonussystem', {
  title: 'Bonus Systeme', count: () => stRows('bonussystem').length, sort: {k: 'name', dir: 1},
  rows: () => stRows('bonussystem').map(r => ({id: r.id, name: r.name || '', kundenfilter: !!r.kundenfilter, von: +r.von || 0, bis: +r.bis || 0, nurReg: !!r.nurReg, regulaer: !!r.regulaer, reduziert: !!r.reduziert, rabattiert: !!r.rabattiert, maxRabatt: `${num(+r.maxRabatt || 0)} ${r.maxEinheit || '%'}`, gutscheintyp: stName('gutscheintyp', r.gutscheintyp) || '', tage: +r.tage || 0})),
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'name', l: 'Name', w: 220}, {k: 'kundenfilter', l: 'Kunden Filter verwenden', t: 'check', w: 190}, {k: 'von', l: 'Von Kundennummer', t: 'num', w: 160}, {k: 'bis', l: 'Bis Kundennummer', t: 'num', w: 160}, {k: 'nurReg', l: 'Nur für registrierte Kunden', t: 'check', w: 210},
    {k: 'regulaer', l: 'Verwendung bei regulären Waren', t: 'check', w: 230}, {k: 'reduziert', l: 'Verwendung bei reduzierten Waren', t: 'check', w: 240}, {k: 'rabattiert', l: 'Verwendung bei rabattierten Waren', t: 'check', w: 240},
    {k: 'maxRabatt', l: 'Maximaler Belegrabatt', w: 180}, {k: 'gutscheintyp', l: 'Gutscheintyp', w: 170}, {k: 'tage', l: 'Gültigkeit in Tagen', t: 'num', w: 160}],
  actions: {back: e2Back, refresh: async () => { await loadStamm(true); PAGES['st-bonussystem'].render(); }, new: () => bsOpen(null, [])},
  edit: id => bsOpen(id, (AG['st-bonussystem'].filtered || []).map(r => r.id)),
  remove: async ids => { if (!await confirmBox(`${num(ids.length)} Bonus-System${ids.length > 1 ? 'e' : ''} löschen?`, 'Löschen')) throw new Error('abgebrochen'); await needPerm('einstellungen', 'Bonus Systeme'); const s = new Set(ids); await stammSave('bonussystem', stRows('bonussystem').filter(r => !s.has(r.id)).map(r => ({...r}))); },
});
VIEW_PERM['st-bonussystem'] = VIEW_PERM['st-bonussystem-edit'] = 'einstellungen';

/* Pflichtfelder je Reiter → rote Zahl am Reiter */
function bsMissing(D) {
  const a = [], f = [], s = [];
  if (!String(D.name).trim()) a.push('Name');
  if (!D.gutscheintyp) a.push('Gutscheintyp');
  D.filter.forEach((x, i) => { if (!x.wert) f.push(`Filter ${i + 1}`); });
  D.staffeln.forEach((x, i) => { if (!String(x.name).trim()) s.push(`Staffel ${i + 1}: Name`); });
  return {allg: a, filter: f, staffeln: s};
}
const bsSw = (path, l, on) => `<label class="ea-sw"><button type="button" class="switch" role="switch" data-bs-sw="${path}" aria-checked="${!!on}"></button><span>${esc(l)}</span></label>`;
const bsNum = (path, l, v, step = 1) => `<label class="field"><span>${esc(l)}</span><input class="input num" type="number" step="${step}" data-bs="${path}" value="${esc(v)}"></label>`;
const bsUnit = (path, l, v, uv, upath) => `<div class="field"><span>${esc(l)}</span><div class="ea-cmb-row"><input class="input num" type="number" step="0.01" data-bs="${path}" value="${esc(v)}" style="flex:1"><select class="input select" data-bs="${upath}" style="width:84px"><option ${uv === '%' ? 'selected' : ''}>%</option><option ${uv === '€' ? 'selected' : ''}>€</option></select></div></div>`;
function bsCollect(el) {
  $$('[data-bs]', el).forEach(i => {
    const path = i.dataset.bs.split('.'); let o = BS.draft; while (path.length > 1) o = o[path.shift()];
    const k = path[0]; o[k] = i.type === 'number' ? (i.value === '' ? 0 : +i.value) : i.value;
  });
}
function bsRender() {
  const host = $('#view-st-bonussystem-edit'); if (!host) return;
  const D = BS.draft, miss = bsMissing(D), el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  const btn = (a, icon, l, dis) => `<button class="ag-btn" data-bs-a="${a}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}<span>${l}</span></button>`;
  const tab = (k, l) => `<button type="button" class="ed-tab" data-bs-t="${k}" aria-selected="${BS.tab === k}">${l}${miss[k].length ? ` <span class="ed-badge">${miss[k].length}</span>` : ''}</button>`;
  let body = '';
  if (BS.tab === 'allg') body = `<div class="ea-cols"><div class="ae-card ea-card"><h4>Allgemein</h4><div class="ea-fields">
      <label class="field"><span>Name *</span><input class="input" data-bs="name" value="${esc(D.name)}"></label>
      ${bsSw('kundenfilter', 'Kunden Filter verwenden', D.kundenfilter)}${bsNum('von', 'Von Kundennummer *', D.von)}${bsNum('bis', 'Bis Kundennummer *', D.bis)}
      ${bsSw('nurReg', 'Nur für registrierte Kunden', D.nurReg)}${bsSw('regulaer', 'Verwendung bei regulären Waren', D.regulaer)}${bsSw('reduziert', 'Verwendung bei reduzierten Waren', D.reduziert)}${bsSw('rabattiert', 'Verwendung bei rabattierten Waren', D.rabattiert)}
      ${bsUnit('maxRabatt', 'Maximaler Belegrabatt in Prozent *', D.maxRabatt, D.maxEinheit, 'maxEinheit')}
      <div class="field ea-cmb"><span>Gutscheintyp *</span><div class="ea-cmb-row"><div class="input ea-pick ${D.gutscheintyp ? '' : 'bad'}" tabindex="0" data-bs-pick="gt"><span class="${D.gutscheintyp ? '' : 'ph'}">${esc(stName('gutscheintyp', D.gutscheintyp) || '')}</span>${ic('chevron-down', 'i-xs')}</div><button type="button" class="ea-ib" data-bs-go="st-gutscheintyp" title="Öffnen">${ic('edit', 'i-sm')}</button><button type="button" class="ea-ib" data-bs-go="st-gutscheintyp" title="Neu anlegen">${ic('plus', 'i-sm')}</button><button type="button" class="ea-ib" data-bs-pick="gt" title="Suchen">${ic('search', 'i-sm')}</button></div></div>
      ${bsNum('tage', 'Gültigkeit in Tagen', D.tage)}</div></div></div>`;
  else if (BS.tab === 'filter') body = `<div class="ea-cols">${D.filter.map((x, i) => `<div class="ae-card ea-card" style="max-width:340px;flex:0 1 320px"><h4 style="display:flex;justify-content:space-between;align-items:center">${i + 1}<button type="button" class="ea-ib" data-bs-del="filter.${i}" title="Entfernen">${ic('trash', 'i-sm')}</button></h4><div class="ea-fields">
      <label class="field"><span>Filter Typ</span><select class="input select" data-bs-typ="${i}">${BS_TYPEN.map(([k, l]) => `<option value="${k}" ${x.typ === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="field ea-cmb"><span>Filter *</span><div class="ea-cmb-row"><div class="input ea-pick ${x.wert ? '' : 'bad'}" tabindex="0" data-bs-pick="f${i}"><span class="${x.wert ? '' : 'ph'}">${esc(bsLabel(x.typ, x.wert))}</span>${ic('chevron-down', 'i-xs')}</div><button type="button" class="ea-ib" data-bs-pick="f${i}" title="Suchen">${ic('search', 'i-sm')}</button></div></div>
      ${bsSw(`filter.${i}.einschl`, 'Einschließender Filter', x.einschl)}</div></div>`).join('')}<button type="button" class="ea-ib" data-bs-add="filter" title="Filter hinzufügen" style="width:44px;height:44px">${ic('plus')}</button></div>`;
  else body = `<div class="ea-cols">${D.staffeln.map((x, i) => `<div class="ae-card ea-card" style="max-width:340px;flex:0 1 320px"><h4 style="display:flex;justify-content:space-between;align-items:center">${esc(x.name) || i + 1}<button type="button" class="ea-ib" data-bs-del="staffeln.${i}" title="Entfernen">${ic('trash', 'i-sm')}</button></h4><div class="ea-fields">
      <label class="field"><span>Name *</span><input class="input ${x.name ? '' : 'bad'}" data-bs="staffeln.${i}.name" value="${esc(x.name)}"></label>
      ${bsNum(`staffeln.${i}.ab`, 'Ab Betrag *', x.ab, 0.01)}${bsUnit(`staffeln.${i}.pLauf`, 'Prozent Laufkundschaft *', x.pLauf, x.pLaufU, `staffeln.${i}.pLaufU`)}${bsNum(`staffeln.${i}.bLauf`, 'Betrag Laufkundschaft *', x.bLauf, 0.01)}
      ${bsUnit(`staffeln.${i}.pGesp`, 'Prozent gespeicherter Kunde *', x.pGesp, x.pGespU, `staffeln.${i}.pGespU`)}${bsNum(`staffeln.${i}.bGesp`, 'Betrag gespeicherter Kunde', x.bGesp, 0.01)}</div></div>`).join('')}<button type="button" class="ea-ib" data-bs-add="staffeln" title="Staffel hinzufügen" style="width:44px;height:44px">${ic('plus')}</button></div>`;
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Übersicht: Bonus Systeme')}${btn('refresh', 'sync', 'Aktualisieren', !BS.id)}${btn('save', 'check', 'Sichern', !BS.dirty)}${btn('new', 'plus', 'Neu', !BS.id)}${btn('undo', 'undo', 'Änderungen zurücknehmen', !BS.dirty)}${btn('del', 'trash', 'Löschen', !BS.id)}</div>
    <div class="ae-tabsw"><div class="ed-tabs">${tab('allg', 'Allgemein')}${tab('filter', 'Filter')}${tab('staffeln', 'Staffeln')}</div></div>
    <div class="ae-body"><div id="edBody">${body}</div></div>`;
  const dirty = () => { BS.dirty = true; $$('[data-bs-a="save"],[data-bs-a="undo"]', el).forEach(b => { b.disabled = false; }); };
  el.addEventListener('input', e => { if (e.target.closest('[data-bs]')) dirty(); });
  el.addEventListener('change', async e => {
    const t = e.target, ty = t.closest('[data-bs-typ]');
    if (ty) { bsCollect(el); const x = BS.draft.filter[+ty.dataset.bsTyp]; x.typ = ty.value; x.wert = ''; BS.dirty = true; bsRender(); }
    else if (t.closest('select[data-bs]')) { dirty(); }
  });
  el.addEventListener('click', async e => {
    const t = e.target, sw = t.closest('[data-bs-sw]'), pk = t.closest('[data-bs-pick]'), gt = t.closest('[data-bs-go]'), dl = t.closest('[data-bs-del]'), ad = t.closest('[data-bs-add]'), tb = t.closest('[data-bs-t]'), b = t.closest('[data-bs-a]');
    const walk = path => { const p = path.split('.'); let o = BS.draft; while (p.length > 1) o = o[p.shift()]; return [o, p[0]]; };
    if (sw) { bsCollect(el); const [o, k] = walk(sw.dataset.bsSw); o[k] = !o[k]; BS.dirty = true; return bsRender(); }
    if (tb) { bsCollect(el); BS.tab = tb.dataset.bsT; return bsRender(); }
    if (ad) { bsCollect(el); if (ad.dataset.bsAdd === 'filter') BS.draft.filter.push({typ: 'marke', wert: '', einschl: false}); else BS.draft.staffeln.push(bsStaffel()); BS.dirty = true; return bsRender(); }
    if (dl) { bsCollect(el); const [o, k] = walk(dl.dataset.bsDel); o.splice(+k, 1); BS.dirty = true; return bsRender(); }
    if (pk) {
      bsCollect(el); const key = pk.dataset.bsPick;
      if (key === 'gt') { const v = await eaPick({l: 'Gutscheintyp', o: () => bsOpt('gutscheintyp')}); if (v !== undefined) { BS.draft.gutscheintyp = v; BS.dirty = true; bsRender(); } }
      else { const x = BS.draft.filter[+key.slice(1)], l = BS_TYPEN.find(y => y[0] === x.typ)[1]; const v = await eaPick({l, o: () => bsOpt(x.typ)}); if (v !== undefined) { x.wert = v; BS.dirty = true; bsRender(); } }
      return;
    }
    if (gt) { if (BS.dirty && !await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen')) return; BS.dirty = false; return go(gt.dataset.bsGo); }
    if (!b || b.disabled) return;
    const a = b.dataset.bsA; bsCollect(el);
    if (a === 'back') { if (BS.dirty && !await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen')) return; BS.dirty = false; return go('st-bonussystem'); }
    if (a === 'refresh' || a === 'undo') { await loadStamm(true); BS.draft = bsLoad(BS.id); BS.dirty = false; return bsRender(); }
    if (a === 'new') { if (BS.dirty && !await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen')) return; return bsOpen(null, BS.ids); }
    try {
      await needPerm('einstellungen', 'Bonus Systeme');
      const all = stRows('bonussystem').map(x => ({...x}));
      if (a === 'save') {
        const m = bsMissing(BS.draft), first = [...m.allg, ...m.filter, ...m.staffeln][0];
        if (first) { BS.tab = m.allg.length ? 'allg' : m.filter.length ? 'filter' : 'staffeln'; bsRender(); return toast(`${first} angeben`, {t2: 'Pflichtfeld', type: 'warn'}); }
        const row = {...BS.draft}, list = BS.id ? all.map(x => x.id === BS.id ? {...x, ...row} : x) : [...all, {id: 'bs-' + aeUid(), _aktiv: true, ...row}];
        await stammSave('bonussystem', list); BS.dirty = false; if (!BS.id) { BS.id = list[list.length - 1].id; BS.ids = [...BS.ids, BS.id]; }
        toast('Gespeichert', {t2: BS.draft.name, type: 'pos', icon: 'check', dur: 1800}); return bsRender();
      }
      if (a === 'del') { if (!await confirmBox(`Bonus-System „${BS.draft.name}“ löschen?`, 'Löschen')) return; await stammSave('bonussystem', all.filter(x => x.id !== BS.id)); BS.dirty = false; go('st-bonussystem'); }
    } catch (err) { if (err && String(err.message || err) !== 'abgebrochen') toast('Nicht möglich', {t2: String(err.message || err), type: 'warn'}); }
  });
}
registerPage('st-bonussystem-edit', {title: 'Bonus Systeme', sub: () => BS.draft ? (BS.draft.name || 'neu') : '', render: async () => { await loadStamm(); if (!BS.draft) BS.draft = bsLoad(BS.id); bsRender(); }});
