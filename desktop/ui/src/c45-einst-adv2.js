/* ═════════════════════════════════════════════════════════════════
   45 · KASSEN (Liste) UND BUCHUNGSABSCHLUSS
   ═════════════════════════════════════════════════════════════════ */
const e2Back = () => history.length > 1 ? history.back() : go('dashboard');
const e2Date = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '';

/* ── Kassen ── */
STAMM_DEF.kasse = {t: 'Kassen', ic: 'register', sub: 'Kassen je Filiale', cols: [{k: 'bez', l: 'Kassen-Bez'}],
  seed: [{id: 'K1', lokal: true, filname: 'Innsbruck', nr: 1, bez: 'Kasse 1'}]};
const kaLokal = r => !!r.lokal || (r.id === 'K1' && !stRows('kasse').some(x => x.lokal));
const kaRows = () => stRows('kasse').map(r => ({id: r.id, nr: +r.nr || 0, bez: kaLokal(r) ? (CFG['kasse.name'] || r.bez) : r.bez, filname: r.filname || '', kid: kaLokal(r) ? (CFG['kasse.id'] || '') : '', lokal: kaLokal(r)}));
agridPage('einst-kassen', {
  title: 'Kassen', rows: kaRows, count: () => stRows('kasse').length, sort: {k: 'nr', dir: 1},
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'nr', l: 'Kassen-Nr.', t: 'num', w: 120}, {k: 'bez', l: 'Kassen-Bez', w: 220}, {k: 'filname', l: 'Filiale', w: 180}, {k: 'kid', l: 'Kassen-ID (RKSV)', w: 200}, {k: 'lokal', l: 'Dieser Arbeitsplatz', t: 'check', w: 170}],
  actions: {back: e2Back, refresh: async () => { await loadStamm(true); PAGES['einst-kassen'].render(); }, new: () => kaeOpen(null, [])},
  edit: id => kaeOpen(id, (AG['einst-kassen'].filtered || []).map(r => r.id)),
  remove: async ids => { if (!await confirmBox(`${num(ids.length)} Kasse${ids.length > 1 ? 'n' : ''} löschen?`, 'Löschen')) throw new Error('abgebrochen'); await needPerm('einstellungen', 'Kassen'); const s = new Set(ids), rest = stRows('kasse').filter(r => !s.has(r.id)); if (rest.length === stRows('kasse').length - ids.length && stRows('kasse').filter(r => s.has(r.id)).some(kaLokal)) throw new Error('Die Kasse dieses Arbeitsplatzes kann nicht gelöscht werden'); await stammSave('kasse', rest.map(r => ({...r}))); },
});
VIEW_PERM['einst-kassen'] = 'einstellungen';

/* ── Buchungsabschluss ── */
STAMM_DEF.buchungsabschluss = {t: 'Buchungsabschluss', ic: 'lock', sub: 'Abschlüsse der Buchungen', cols: [{k: 'abschluss', l: 'Abschluss zum'}]};
const baRows = () => stRows('buchungsabschluss').map(r => ({id: r.id, erstellt: r.erstellt || '', abschluss: r.abschluss || '', usernr: r.usernr || '', user: r.user || ''}));
function baRender() {
  const host = $('#view-buchungsabschluss'); if (!host) return;
  const rows = stRows('buchungsabschluss'), last = rows.map(r => r.abschluss).sort().pop() || '';
  const el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  el.innerHTML = `<div class="ag-bar ae-bar"><button class="ag-btn" data-ba="back">${ic('chevron-left', 'i-sm')}<span>Zurück</span></button><button class="ag-btn" data-ba="refresh">${ic('sync', 'i-sm')}<span>Aktualisieren</span></button><button class="ag-btn" data-ba="save" disabled>${ic('check', 'i-sm')}<span>Abschließen</span></button><button class="ag-btn" data-ba="undo" disabled>${ic('undo', 'i-sm')}<span>Änderungen zurücknehmen</span></button></div>
    <div class="ae-card ea-card" style="max-width:none;flex:none"><h4>Einstellungen</h4><label class="field" style="max-width:340px"><span>Abschluss zum</span><input class="input" type="date" data-ba-d value="${esc(last)}" max="${today()}"><small class="ea-hint">Belege mit Datum bis einschließlich diesem Tag können nicht mehr angelegt oder geändert werden. Kassenbons bleiben unverändert (RKSV).</small></label></div>
    <div class="ba-grid" style="flex:1;display:flex;flex-direction:column;min-height:360px"></div>`;
  AG['ba-grid'] = agNew({embed: true, title: 'Buchungsabschluss', rows: baRows, sort: {k: 'erstellt', dir: -1},
    cols: [{k: 'erstellt', l: 'Erstellt am', w: 190, fmt: v => v ? `${e2Date(v)} ${String(v).slice(11, 16)}` : ''}, {k: 'abschluss', l: 'Abschluss zum', w: 170, fmt: e2Date}, {k: 'usernr', l: 'User-Nr.', w: 110}, {k: 'user', l: 'User', w: 220}],
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
      if (!await confirmBox(`Buchungen bis ${e2Date(d)} abschließen? Belege bis zu diesem Tag sind danach gesperrt.`, 'Abschließen')) return;
      const now = new Date(), p = n => String(n).padStart(2, '0'), ts = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}`;
      await stammSave('buchungsabschluss', [...rows.map(r => ({...r})), {id: 'ba-' + aeUid(), _aktiv: true, erstellt: ts, abschluss: d, usernr: S.user.id || '', user: S.user.name}]);
      await saveSettings({'buchung.abschluss': d}, true); toast('Buchungsabschluss gespeichert', {t2: `Belege bis ${e2Date(d)} sind gesperrt`, type: 'pos', icon: 'lock'}); baRefresh();
    } catch (err) { if (err && String(err.message || err) !== 'abgebrochen') toast('Nicht gespeichert', {t2: String(err.message || err), type: 'warn'}); }
  });
}
async function baRefresh() { await loadStamm(true); baRender(); }
registerPage('buchungsabschluss', {title: 'Buchungsabschluss', sub: () => 'Einstellungen', render: async () => { await loadStamm(); baRender(); }});
VIEW_PERM.buchungsabschluss = 'einstellungen';
/* Wirkung: Belege (Rechnung, Lieferschein, Bestellung …) bis zum Abschlussdatum sind gesperrt */
INVOKE_HOOKS.doc_save = a => {
  const ab = CFG['buchung.abschluss'], d = a?.doc?.date; if (ab && d && String(d).slice(0, 10) <= ab) throw new Error(`Buchungszeitraum bis ${e2Date(ab)} ist abgeschlossen – Beleg mit Datum ${e2Date(d)} kann nicht gespeichert werden`);
  return a;
};
