/* ═════════════════════════════════════════════════════════════════
   46 · KASSE BEARBEITEN – Allgemein, Fiskalisierung (RKSV), Signatureinheit, Kartenterminal
   ═════════════════════════════════════════════════════════════════ */
const KAE = {id: null, ids: [], draft: null, tab: 'allg', dirty: false};
const kaeTabs = () => [['allg', 'Allgemein'], ['fisk', 'Fiskalisierung'], ['sig', 'Signatureinheit'], ...(KAE.draft?.lokal ? [['eft', 'Kartenterminal']] : [])];
const kaeNeu = () => ({nr: Math.max(0, ...stRows('kasse').map(x => +x.nr || 0)) + 1, bez: '', filname: STORES[0].name, lokal: false});
function kaeLoad(id) {
  const r = id ? stRows('kasse').find(x => x.id === id) : null, d = JSON.parse(JSON.stringify(r || kaeNeu())); d.lokal = r ? kaLokal(r) : false;
  if (d.lokal) { d.bez = CFG['kasse.name'] || d.bez; d.termAktiv = CFG['terminal.art'] === 'zvt'; d.termAdresse = CFG['terminal.adresse'] || ''; d.termPass = CFG['terminal.passwort'] || ''; }
  return d;
}
function kaeOpen(id, ids) {
  KAE.id = id; KAE.ids = ids || KAE.ids; KAE.draft = kaeLoad(id); KAE.tab = 'allg'; KAE.dirty = false;
  if (S.view === 'einst-kassen-edit') PAGES['einst-kassen-edit'].render(); else go('einst-kassen-edit');
}
const kaeAllg = () => [['Kasse', [['nr', 'Kassen-Nr. *', 'num'], ['bez', 'Kassen-Bez *', 'text', null, KAE.draft.lokal ? 'Erscheint in der Kopfzeile und auf dem Sperrbildschirm' : ''], ['filname', 'Filiale', 'select', () => STORES.map(s => [s.name, s.name])], ['_', 'Kassen-ID (RKSV)', 'ro', () => KAE.draft.lokal ? (CFG['kasse.id'] || '') : 'wird bei der RKSV-Registrierung vergeben'], ['lokal', 'Kasse dieses Arbeitsplatzes', 'dis']]]];
const kaeEft = () => [['Kartenterminal (ZVT)', [['termAktiv', 'Kartenterminal benutzen', 'check', null, 'Karten- und Wallet-Zahlungen werden direkt am Terminal ausgelöst'], ['termAdresse', 'IP-Adresse des Terminals', 'text', null, 'z. B. 192.168.1.80 (Port 20007) oder 192.168.1.80:5577'], ['termPass', 'Kassenpasswort (ZVT)', 'text', null, 'meist 000000']]]];
function kaeFisk() {
  const r = S.rksv || {}, d = x => x ? String(x).replace('T', ', ').slice(0, 17) : '–';
  const A = {a: 'RKSV Österreich', b: r.active ? (r.mode === 'test' ? 'Testbetrieb' : 'Produktivbetrieb') : 'nicht in Betrieb', c: r.kassen_id || (KAE.draft.lokal ? CFG['kasse.id'] : '') || '–', d: d(r.started_at), e: String(r.receipts ?? 0), f: String(r.turnover ?? 0), g: r.last_monthly ? d(r.last_monthly) : '–'};
  return `<div class="ea-cols"><div class="ae-card ea-card"><h4>Fiskalisierung</h4><div class="ea-fields">${[['a', 'Fiskalisierungstyp'], ['b', 'Betriebsart'], ['c', 'Kassen-ID'], ['d', 'Registrierungsdatum'], ['e', 'Belege im Datenerfassungsprotokoll'], ['f', 'Umsatz-Zähler'], ['g', 'Letzter Monatsbeleg']].map(([k, l]) => fxField(A, [k, l, 'ro'])).join('')}</div><p class="ea-hint" style="margin:6px 0 0">Registrierung, Nullbeleg und DEP-Export finden Sie unter System › RKSV.</p></div></div>`;
}
function kaeSig(host) {
  const r = S.rksv || {};
  AG['kae-sig'] = agNew({embed: true, title: 'Signatureinheit', rows: () => r.active ? [{id: 'AT1', zdald: 'AT1', zert: r.serial || '', datum: r.started_at ? String(r.started_at).replace('T', ', ').slice(0, 17) : '', serie: r.serial || '', key: r.public_key || ''}] : [],
    cols: [{k: 'zdald', l: 'Zdald', w: 90}, {k: 'zert', l: 'Signatur-Zertifikat (Seriennummer)', w: 280}, {k: 'datum', l: 'In Betrieb seit', w: 200}, {k: 'serie', l: 'Seriennummer des Schlüssels', w: 260}, {k: 'key', l: 'Öffentlicher Schlüssel', w: 420}], extra: [{k: 'rf', l: 'Aktualisieren', icon: 'sync'}], actions: {rf: async () => { try { S.rksv = await invoke('rksv_status'); } catch { /* */ } kaeRender(); }}});
  agMount('kae-sig', host);
}
function kaeRender() {
  const host = $('#view-einst-kassen-edit'); if (!host) return;
  const D = KAE.draft, tabs = kaeTabs(); if (!tabs.some(t => t[0] === KAE.tab)) KAE.tab = 'allg';
  const pos = KAE.ids.indexOf(KAE.id), el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  const btn = (a, icon, l, dis) => `<button class="ag-btn" data-ke-a="${a}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}<span>${l}</span></button>`;
  const dirty = () => { KAE.dirty = true; $$('[data-ke-a="save"],[data-ke-a="undo"]', el).forEach(b => { b.disabled = false; }); };
  let body = '', mount = null;
  if (KAE.tab === 'allg') body = fxCards(D, kaeAllg());
  else if (KAE.tab === 'eft') body = fxCards(D, kaeEft());
  else if (KAE.tab === 'fisk') body = kaeFisk();
  else { body = '<div data-kx style="flex:1;min-height:300px;display:flex;flex-direction:column"></div>'; mount = () => kaeSig($('[data-kx]', el)); }
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Übersicht: Kassen')}${btn('refresh', 'sync', 'Aktualisieren', !KAE.id)}${btn('save', 'check', 'Sichern', !KAE.dirty)}${btn('new', 'plus', 'Neu', !KAE.id)}${btn('undo', 'undo', 'Änderungen zurücknehmen', !KAE.dirty)}${btn('del', 'trash', 'Löschen', !KAE.id || D.lokal)}
      <span class="sp"></span>${KAE.id ? `${btn('prev', 'chevron-left', '', pos <= 0)}<span class="ae-nr">${pos + 1}/${KAE.ids.length}</span>${btn('next', 'chevron-right', '', pos >= KAE.ids.length - 1)}` : ''}</div>
    <div class="ae-tabsw"><div class="ed-tabs">${tabs.map(([k, l]) => `<button type="button" class="ed-tab" data-ke-t="${k}" aria-selected="${KAE.tab === k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="ae-body"><div id="edBody">${body}</div></div>`;
  fxBind(el, D, dirty); if (mount) mount();
  el.addEventListener('click', async e => {
    const tb = e.target.closest('[data-ke-t]'), b = e.target.closest('[data-ke-a]');
    if (tb) { KAE.tab = tb.dataset.keT; return kaeRender(); }
    if (!b || b.disabled) return;
    const a = b.dataset.keA, ask = async () => !KAE.dirty || await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen');
    if (a === 'back') { if (!await ask()) return; KAE.dirty = false; return go('einst-kassen'); }
    if (a === 'refresh' || a === 'undo') { await loadStamm(true); KAE.draft = kaeLoad(KAE.id); KAE.dirty = false; return kaeRender(); }
    if (a === 'new') { if (!await ask()) return; return kaeOpen(null, KAE.ids); }
    if (a === 'prev' || a === 'next') { if (!await ask()) return; const id = KAE.ids[pos + (a === 'next' ? 1 : -1)]; if (id) kaeOpen(id); return; }
    try {
      await needPerm('einstellungen', 'Kassen');
      const all = stRows('kasse').map(x => ({...x}));
      if (a === 'save') {
        if (!String(D.bez).trim() || !(+D.nr > 0)) { KAE.tab = 'allg'; kaeRender(); return toast('Kassen-Nr. und Kassen-Bez angeben', {type: 'warn'}); }
        if (all.some(x => x.id !== KAE.id && +x.nr === +D.nr)) return toast(`Kassen-Nr. ${D.nr} ist schon vergeben`, {type: 'warn'});
        const row = {id: KAE.id, lokal: !!D.lokal, nr: +D.nr, bez: D.bez.trim(), filname: D.filname};
        const list = KAE.id ? all.map(x => x.id === KAE.id ? {...x, ...row} : x) : [...all, {...row, id: 'ka-' + aeUid(), _aktiv: true}];
        await stammSave('kasse', list);
        if (D.lokal) await saveSettings({'kasse.name': row.bez, 'terminal.art': D.termAktiv ? 'zvt' : 'aus', 'terminal.adresse': D.termAdresse || '', 'terminal.passwort': D.termPass || ''}, true);
        KAE.dirty = false; if (!KAE.id) { KAE.id = list[list.length - 1].id; KAE.ids = [...KAE.ids, KAE.id]; }
        toast('Gespeichert', {t2: row.bez, type: 'pos', icon: 'check', dur: 1800}); return kaeRender();
      }
      if (a === 'del') { if (!await confirmBox(`Kasse „${D.bez}“ löschen?`, 'Löschen')) return; await stammSave('kasse', all.filter(x => x.id !== KAE.id)); KAE.dirty = false; go('einst-kassen'); }
    } catch (err) { if (err && String(err.message || err) !== 'abgebrochen') toast('Nicht möglich', {t2: String(err.message || err), type: 'warn'}); }
  });
}
registerPage('einst-kassen-edit', {title: 'Kassen', sub: () => KAE.draft ? `${KAE.draft.bez || 'neu'} (${KAE.draft.nr})` : '', render: async () => { await loadStamm(); if (!KAE.draft) KAE.draft = kaeLoad(KAE.id); kaeRender(); }});
VIEW_PERM['einst-kassen-edit'] = 'einstellungen';
