/* ═════════════════════════════════════════════════════════════════
   46 · KASSEN BEARBEITEN (Advarics: Reiter Allgemein … Positionsinfo Sortieren)
   ═════════════════════════════════════════════════════════════════ */
const KAE_TABS_ALL = [['allg', 'Allgemein'], ['fisk', 'Fiskalisierung'], ['sig', 'Signatureinheit'], ['rabatt', 'Feste Rabatte'], ['eft', 'Kartenterminal'], ['mwst', 'MwSt.-Sätze'], ['zahl', 'Zahlungsarten'], ['zusatz', 'Zusatz-Buchung'], ['summen', 'Kassen-Summen'], ['wgrmwst', 'WGR.-MwSt.-Einstellungen'], ['beleg', 'Beleg-Konfiguration'], ['icons', 'Kassen-Icon Sortierung'], ['posinfo', 'Positionsinfo Sortieren']];
const kaeTabs = () => KAE_TABS_ALL.filter(t => t[0] !== 'eft' || KAE.draft?.lokal);
const KAE_NEU = () => { const all = stRows('kasse'); return {filnr: '1', filname: STORES[0].name, filgrp: '', land: 'Österreich', nr: Math.max(0, ...all.map(x => +x.nr || 0)) + 1, bez: '', konfig: 'Standard', sync: false, core: false, inaktiv: false, kdStart: 1, kdEnde: 99999, reStart: 1, reEnde: 99999, letzteSync: '', mac: '', syncname: '', paket: '', langsam: false, region: 'de-AT', design: 'Kontor', ws: '', timer: 20, core: false, pw1: '', pw2: '', vfCode: '', extNr: '', sub: {}, rabatte: [], rfidUser: '', rfidPort: '', kostenstelle: 0, eftAktiv: false, eftConnector: 'PepperV2', eftTerminalTyp: 0, eftCom: 0, eftIp: '', eftSprache: 'German', eftOperator: '', eftCbEvent: 0, eftCbOption: 0, eftDevice: '', eftTimeout: 120, eftTid: '', eftMerchant: '', eftPass: '', eftConfigByte: 0, eftBaud: 0, eftTimeoutMs: 0, eftTrack: 0, eftKey: '', eftVorher: false}; };
const KAE = {id: null, ids: [], draft: null, tab: 'allg', dirty: false};
const kaeLoad = id => {
  const r = id ? stRows('kasse').find(x => x.id === id) : null, d = JSON.parse(JSON.stringify({...KAE_NEU(), ...(r || {})})); d.lokal = r ? kaLokal(r) : false;
  if (d.lokal) { d.bez = CFG['kasse.name'] || d.bez; d.termAktiv = CFG['terminal.art'] === 'zvt'; d.termAdresse = CFG['terminal.adresse'] || ''; d.termPass = CFG['terminal.passwort'] || ''; }
  return d;
};
function kaeOpen(id, ids) {
  KAE.id = id; KAE.ids = ids || KAE.ids; KAE.draft = kaeLoad(id); KAE.tab = 'allg'; KAE.dirty = false;
  if (S.view === 'einst-kassen-edit') PAGES['einst-kassen-edit'].render(); else go('einst-kassen-edit');
}
/* Feldbeschreibungen je Reiter: t = text | num | check | select | ro */
const KAE_FELDER = {
  allg: [['', [['nr', 'Kassen-Nr. *', 'num'], ['bez', 'Kassen-Bez *', 'text', null, 'Die Bezeichnung der eigenen Kasse erscheint in der Kopfzeile und auf dem Sperrbildschirm'], ['filname', 'Filiale *', 'select', () => STORES.map(s => [s.name, s.name])], ['konfig', 'Kassen-Konfiguration *', 'select', () => stActive('kassenkonfig').map(r => [r.name, r.name]), 'Die Konfiguration der eigenen Kasse steuert Menüs, Zahlungsarten, Rabatte und Beleg an dieser Kasse'], ['_', 'Kassen-ID (RKSV)', 'ro', () => KAE.draft.lokal ? (CFG['kasse.id'] || '') : 'wird bei der RKSV-Registrierung vergeben'], ['lokal', 'Kasse dieses Arbeitsplatzes', 'dis']]]],
  eft: [['Kartenterminal (ZVT)', [['termAktiv', 'Kartenterminal benutzen', 'check', null, 'Karten- und Wallet-Zahlungen werden direkt am Terminal ausgelöst'], ['termAdresse', 'IP-Adresse des Terminals', 'text', null, 'z. B. 192.168.1.80 (Port 20007) oder 192.168.1.80:5577'], ['termPass', 'Kassenpasswort (ZVT)', 'text', null, 'meist 000000']]]]
};
function kaeField([k, l, t, o, hint]) {
  const D = KAE.draft, v = D[k];
  if (hint && (t === undefined || t === 'text' || t === 'select' || t === 'check')) return kaeField([k, l, t, o]).replace(/<\/label>$|<\/div>$/, m => `<small class="ea-hint">${esc(hint)}</small>${m}`);
  if (t === 'check') return `<label class="ea-sw"><button type="button" class="switch" role="switch" data-ke-sw="${k}" aria-checked="${!!v}"></button><span>${esc(l)}</span></label>`;
  if (t === 'dis') return `<label class="ea-sw dis"><button type="button" class="switch" disabled role="switch" aria-checked="${!!v}"></button><span>${esc(l)}</span></label>`;
  if (t === 'check-off') return `<label class="ea-sw dis"><button type="button" class="switch" disabled role="switch" aria-checked="${k === 'hatBelege' ? 'true' : 'false'}"></button><span>${esc(l)}</span></label>`;
  if (t === 'ro') return `<label class="field"><span>${esc(l)}</span><input class="input ea-ro" readonly value="${esc(o ? o() : v ?? '')}"></label>`;
  if (t === 'select') return `<label class="field"><span>${esc(l)}</span><select class="input select" data-ke="${k}">${o().map(([x, y]) => `<option value="${esc(x)}" ${String(v) === String(x) ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select></label>`;
  return `<label class="field"><span>${esc(l)}</span><input class="input ${t === 'num' ? 'num' : ''}" ${t === 'num' ? 'type="number"' : ''} data-ke="${k}" value="${esc(v ?? '')}"></label>`;
}
const kaeCards = list => `<div class="ea-cols">${list.map(([h, f]) => `<div class="ae-card ea-card">${h ? `<h4>${esc(h)}</h4>` : ''}<div class="ea-fields">${f.map(kaeField).join('')}</div></div>`).join('')}</div>`;
const kaeRabattRows = on => stActive('festerrabatt').filter(r => KAE.draft.rabatte.includes(r.id) === on).map((r, i) => ({id: r.id, pct: +r.pct || 0, wert: +r.wert || 0, alsWert: !!r.alsWert, typ: r.typ || 'Rabatt', von: r.von || '', bis: r.bis || '', sort: +r.sort || i + 1, modus: r.modus || 'Beide Ebenen aktiv'}));
const kaeMiss = D => { const m = []; if (!String(D.bez).trim()) m.push('Kassen-Bez'); if (!(+D.nr > 0)) m.push('Kassen-Nr.'); return m; };

function kaeRender() {
  const host = $('#view-einst-kassen-edit'); if (!host) return;
  const D = KAE.draft, pos = KAE.ids.indexOf(KAE.id), el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  const btn = (a, icon, l, dis) => `<button class="ag-btn" data-ke-a="${a}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}<span>${l}</span></button>`;
  let body, extraMount;
  if (KAE.tab === 'allg') body = kaeCards(KAE_FELDER.allg);
  else if (KAE_FELDER[KAE.tab]) body = kaeCards(KAE_FELDER[KAE.tab]);
  else if (KAE.tab === 'rabatt') body = `<div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnet</h4><div data-kg="a"></div></div><div class="ae-card"><h4>Nicht zugeordnet</h4><div data-kg="b"></div></div></div>`;
  else if (KAE.tab === 'sync') {
    const ts = '–', ro = (l, v) => `<label class="field"><span>${esc(l)}</span><input class="input ea-ro" readonly value="${esc(v)}"></label>`, ctl = (l, on, dis, k) => `<label class="ea-sw ${dis ? 'dis' : ''}"><button type="button" class="switch" role="switch" ${dis ? 'disabled' : `data-ke-sw="${k}"`} aria-checked="${!!on}"></button><span>${esc(l)}</span></label>`;
    body = `<div class="ea-cols"><div class="ae-card ea-card"><h4>Synchronisation-Info</h4><div class="ea-fields">${['Stammdaten', 'Artikel', 'Kunden', 'Gutscheine'].map(x => ro('TimeStamp ' + x, ts)).join('')}</div></div>
      <div class="ae-card ea-card"><h4>Synchronisation-Info</h4><div class="ea-fields">${['Auswahlen', 'Rechnungen', 'Gutschein Gelöscht Sync-Zeitstempel', 'Artikel/Größen Umbuchung'].map(x => ro(x.startsWith('Gut') || x.startsWith('Art') ? 'TimeStamp ' + x : 'TimeStamp ' + x, ts)).join('')}</div></div>
      <div class="ae-card ea-card"><h4>Synchronisation-Info</h4><div class="ea-fields">${['Artikel', 'Kunden', 'Gutscheine', 'Auswahlen', 'Rechnungen'].map(x => ro('Max-Id ' + x, '0')).join('')}</div></div>
      <div class="ae-card ea-card" style="flex:1 1 320px"><h4>Synchronisation-Info</h4><div class="ea-fields">${ctl('Langsamer Sync-Speed', D.langsam, false, 'langsam')}${ctl('Reorg Wenn Sync', false, true)}${ctl('Kassen-Reorganisation', false, true)}</div></div></div>
      <div data-kg="s" style="flex:1;min-height:200px;display:flex;flex-direction:column"></div>`;
  } else if (KAE_RENDER[KAE.tab]) { const r = KAE_RENDER[KAE.tab](); body = r.html; extraMount = r.mount; }
  else body = '';
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Übersicht: Kassen')}${btn('refresh', 'sync', 'Aktualisieren', !KAE.id)}${btn('save', 'check', 'Sichern', !KAE.dirty)}${btn('new', 'plus', 'Neu', !KAE.id)}${btn('undo', 'undo', 'Änderungen zurücknehmen', !KAE.dirty)}${btn('del', 'trash', 'Löschen', !KAE.id)}
      <span class="sp"></span>${KAE.id ? `${btn('prev', 'chevron-left', '', pos <= 0)}<span class="ae-nr">${pos + 1}/${KAE.ids.length}</span>${btn('next', 'chevron-right', '', pos >= KAE.ids.length - 1)}` : ''}</div>
    <div class="ae-tabsw"><div class="ed-tabs" style="flex-wrap:wrap">${kaeTabs().map(([k, l]) => `<button type="button" class="ed-tab" data-ke-t="${k}" aria-selected="${KAE.tab === k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="ae-body"><div id="edBody">${body}</div></div>`;
  const mk = (key, h, cfg) => { if (!h) return; AG[key] = agNew({embed: true, ...cfg}); agMount(key, h); };
  const rc = [{k: 'pct', l: 'Rabatt %', t: 'num', w: 100, fmt: v => num(v) + ' %'}, {k: 'wert', l: 'Rabatt-Wert', t: 'num', w: 110, fmt: v => eur(Math.round(v * 100))}, {k: 'alsWert', l: 'Als Wert nutzen', t: 'check', w: 130}, {k: 'typ', l: 'Rabatt-Typ', w: 110}, {k: 'von', l: 'Gültig von', w: 110, fmt: e2Date}, {k: 'bis', l: 'Gültig bis', w: 110, fmt: e2Date}, {k: 'sort', l: 'Sortierung', t: 'num', w: 100}, {k: 'modus', l: 'Rabatt-Modus', w: 160}];
  const mv = (ids, add) => { const s = new Set(D.rabatte); ids.forEach(i => add ? s.add(i) : s.delete(i)); D.rabatte = [...s]; KAE.dirty = true; kaeCollect(el); kaeRender(); };
  if (KAE.tab === 'rabatt') {
    mk('ke-a', $('[data-kg="a"]', el), {title: 'Zugeordnet', cols: rc, rows: () => kaeRabattRows(true), sort: {k: 'sort', dir: 1}, edit: id => mv([id], false), extra: [{k: 'rm', l: 'Entfernen', icon: 'x'}], actions: {rm: () => { const s = [...AG['ke-a'].sel]; if (s.length) mv(s, false); }}});
    mk('ke-b', $('[data-kg="b"]', el), {title: 'Nicht zugeordnet', cols: rc, rows: () => kaeRabattRows(false), sort: {k: 'sort', dir: 1}, edit: id => mv([id], true), extra: [{k: 'add', l: 'Zuordnen', icon: 'plus'}], actions: {add: () => { const s = [...AG['ke-b'].sel]; if (s.length) mv(s, true); }}});
  }
  if (extraMount) extraMount(el, () => kaeDirty(el));
  if (KAE.tab === 'sync') mk('ke-s', $('[data-kg="s"]', el), {title: 'Sync', cols: [{k: 'a', l: 'Artikel', w: 180}, {k: 'g', l: 'Gutscheine', w: 160}, {k: 'k', l: 'Kunde', w: 160}, {k: 'au', l: 'Auswahlen', w: 160}, {k: 'r', l: 'Rechnungen', w: 160}], rows: () => [{id: 1, a: `Geladen: 0 von ${num(ART.length)}`, g: 'Geladen: 0 von 0', k: 'Geladen: 0 von 0', au: 'Geladen: 0 von 0', r: 'Geladen: 0 von 0'}], extra: [{k: 'rf', l: 'Aktualisieren', icon: 'sync'}], actions: {rf: () => kaeRender()}});
  el.addEventListener('input', e => { if (e.target.closest('[data-ke]')) { KAE.dirty = true; $$('[data-ke-a="save"],[data-ke-a="undo"]', el).forEach(b => { b.disabled = false; }); } });
  el.addEventListener('click', async e => {
    const t = e.target, sw = t.closest('[data-ke-sw]'), tb = t.closest('[data-ke-t]'), b = t.closest('[data-ke-a]');
    if (sw) { kaeCollect(el); D[sw.dataset.keSw] = !D[sw.dataset.keSw]; KAE.dirty = true; return kaeRender(); }
    if (tb) { kaeCollect(el); KAE.tab = tb.dataset.keT; return kaeRender(); }
    if (!b || b.disabled) return;
    const a = b.dataset.keA; kaeCollect(el);
    const ask = async () => !KAE.dirty || await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen');
    if (a === 'back') { if (!await ask()) return; KAE.dirty = false; return go('einst-kassen'); }
    if (a === 'refresh' || a === 'undo') { await loadStamm(true); KAE.draft = kaeLoad(KAE.id); KAE.dirty = false; return kaeRender(); }
    if (a === 'new') { if (!await ask()) return; return kaeOpen(null, KAE.ids); }
    if (a === 'prev' || a === 'next') { if (!await ask()) return; const id = KAE.ids[pos + (a === 'next' ? 1 : -1)]; if (id) kaeOpen(id); return; }
    try {
      await needPerm('einstellungen', 'Kassen');
      const all = stRows('kasse').map(x => ({...x}));
      if (a === 'save') {
        const m = kaeMiss(KAE.draft); if (m.length) { KAE.tab = 'allg'; kaeRender(); return toast(`${m[0]} angeben`, {t2: 'Pflichtfeld', type: 'warn'}); }
        const row = {...KAE.draft}; delete row.termAktiv; delete row.termAdresse; delete row.termPass; row.lokal = !!KAE.draft.lokal; const tmp = KAE.draft; ['nr', 'kdStart', 'kdEnde', 'reStart', 'reEnde', 'kostenstelle', 'eftTerminalTyp', 'eftCom', 'eftCbEvent', 'eftCbOption', 'eftTimeout', 'eftConfigByte', 'eftBaud', 'eftTimeoutMs', 'eftTrack'].forEach(k => { row[k] = parseInt(row[k], 10) || 0; });
        const list = KAE.id ? all.map(x => x.id === KAE.id ? {...x, ...row} : x) : [...all, {id: 'ka-' + aeUid(), _aktiv: true, ...row}];
        await stammSave('kasse', list);
        if (row.lokal) await saveSettings({'kasse.name': String(row.bez).trim(), 'terminal.art': tmp.termAktiv ? 'zvt' : 'aus', 'terminal.adresse': tmp.termAdresse || '', 'terminal.passwort': tmp.termPass || ''}, true);
        KAE.dirty = false; if (!KAE.id) { KAE.id = list[list.length - 1].id; KAE.ids = [...KAE.ids, KAE.id]; }
        toast('Gespeichert', {t2: row.bez, type: 'pos', icon: 'check', dur: 1800}); return kaeRender();
      }
      if (a === 'del') {
        if (all.length < 2 || KAE.draft.lokal) return toast('Die Kasse dieses Arbeitsplatzes kann nicht gelöscht werden', {type: 'warn'});
        if (!await confirmBox(`Kasse „${KAE.draft.bez}“ löschen?`, 'Löschen')) return; await stammSave('kasse', all.filter(x => x.id !== KAE.id)); KAE.dirty = false; go('einst-kassen');
      }
    } catch (err) { if (err && String(err.message || err) !== 'abgebrochen') toast('Nicht möglich', {t2: String(err.message || err), type: 'warn'}); }
  });
}
const kaeDirty = el => { KAE.dirty = true; $$('[data-ke-a="save"],[data-ke-a="undo"]', el).forEach(b => { b.disabled = false; }); };
function kaeCollect(el) {
  $$('[data-ke]', el).forEach(i => { KAE.draft[i.dataset.ke] = i.type === 'number' ? (i.value === '' ? 0 : +i.value) : i.value; });
}
registerPage('einst-kassen-edit', {title: 'Kassen', sub: () => KAE.draft ? `${KAE.draft.bez || 'neu'} (${KAE.draft.nr})` : '', render: async () => { await loadStamm(); if (!KAE.draft) KAE.draft = kaeLoad(KAE.id); kaeRender(); }});
VIEW_PERM['einst-kassen-edit'] = 'einstellungen';
/* Liste: Doppelklick/Neu öffnet die Bearbeiten-Seite statt des Dialogs */
{ const cfg = AG['einst-kassen'].cfg;
  cfg.edit = id => kaeOpen(id, (AG['einst-kassen'].filtered || []).map(r => r.id));
  cfg.actions.new = () => kaeOpen(null, []); }
