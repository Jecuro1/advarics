/* ═════════════════════════════════════════════════════════════════
   44 · EINSTELLUNGEN ALLGEMEIN – nur Einstellungen, die tatsächlich wirken
   ═════════════════════════════════════════════════════════════════ */
const EA_DEFAULTS = {'edi.gln': '', 'gutschein.jahre': 3, 'allg.spediteur': '', 'allg.warengruppe': '', 'allg.marke': '', 'allg.mwst': '', 'allg.groessenschluessel': '', 'allg.mailfuss': ''};
const eaMarken = () => { const r = stActive('marke'); return r.length ? r.map(x => [x.name || x.id, x.name || x.id]) : [...new Set(ART.map(a => a.brand).filter(Boolean))].sort().map(x => [x, x]); };
const eaOpt = (kind, nr = true) => () => stActive(kind).map(r => [r.id, `${r.name || r.id}${nr && r.nr != null && r.nr !== '' ? ` (${r.nr})` : ''}`]);
/* Feld: k = Einstellungsschlüssel, t = text | num | combo, o = Auswahl, hint = Erklärung */
const EA_GROUPS = () => [
  {h: 'Allgemein', f: [
    {k: 'edi.gln', l: 'Unternehmens-GLN', hint: 'Wird im EDI-Austausch mit Lieferanten verwendet'},
    {k: 'gutschein.jahre', l: 'Gutscheine gültig (Jahre nach Ausgabejahr)', t: 'num', hint: 'Ablaufdatum = 31.12. des Ausgabejahres plus diese Anzahl Jahre'},
    {k: 'allg.spediteur', l: 'Standard-Spediteur', t: 'combo', o: eaOpt('spediteur', false), page: 'st-spediteur', hint: 'Vorbelegung bei neuen Sendungen'}]},
  {h: 'Standardwerte für neue Artikel', f: [
    {k: 'allg.warengruppe', l: 'Warengruppe', t: 'combo', o: eaOpt('warengruppe'), page: 'st-warengruppe', hint: 'Wird beim Anlegen eines Artikels vorgewählt'},
    {k: 'allg.marke', l: 'Marke', t: 'combo', o: eaMarken, page: 'st-marke'},
    {k: 'allg.mwst', l: 'MwSt.-Satz', t: 'combo', o: eaOpt('mwsttyp', false), page: 'st-mwsttyp'},
    {k: 'allg.groessenschluessel', l: 'Größenschlüssel', t: 'combo', o: eaOpt('groessenschluessel'), page: 'st-groessenschluessel', hint: 'Die Größen des Schlüssels werden als Größenreihe vorbelegt'}]}
];
const EA = {tab: 'allg', draft: null, dirty: false};
const eaLoad = () => { const o = {}; for (const k in EA_DEFAULTS) o[k] = CFG[k] ?? EA_DEFAULTS[k]; return o; };
const eaLabel = (f, v) => { const hit = (f.o() || []).find(x => String(x[0]) === String(v)); return hit ? hit[1] : ''; };
const eaFind = k => EA_GROUPS().flatMap(g => g.f).find(f => f.k === k);

function eaField(f) {
  const v = EA.draft[f.k], hint = f.hint ? `<small class="ea-hint">${esc(f.hint)}</small>` : '';
  if (f.t === 'num') return `<label class="field"><span>${esc(f.l)}</span><input class="input num" type="number" data-ea="${f.k}" value="${esc(v)}">${hint}</label>`;
  if (f.t === 'combo') {
    const lbl = eaLabel(f, v);
    return `<div class="field ea-cmb"><span>${esc(f.l)}</span><div class="ea-cmb-row"><div class="input ea-pick" tabindex="0" data-ea-pick="${f.k}"><span class="${lbl ? '' : 'ph'}">${esc(lbl || 'Nicht festgelegt')}</span>${lbl ? `<button type="button" class="ea-x" data-ea-clr="${f.k}" aria-label="Leeren">${ic('x', 'i-xs')}</button>` : ''}${ic('chevron-down', 'i-xs')}</div><button type="button" class="ea-ib" data-ea-go="${f.page}" title="Liste öffnen">${ic('edit', 'i-sm')}</button><button type="button" class="ea-ib" data-ea-pick="${f.k}" title="Suchen">${ic('search', 'i-sm')}</button></div>${hint}</div>`;
  }
  return `<label class="field"><span>${esc(f.l)}</span><input class="input" data-ea="${f.k}" value="${esc(v)}">${hint}</label>`;
}
function eaPick(f) {
  return new Promise(res => {
    const all = (f.o() || []);
    const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('search')}</div><div><h2>${esc(f.l)}</h2><p>${num(all.length)} Einträge</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body"><input class="input" data-pq placeholder="Suchen …" autocomplete="off"><div class="ea-list" data-pl></div></div></div>`, {onClose: () => res(undefined)});
    const draw = () => {
      const q = $('[data-pq]', el).value.trim().toLowerCase();
      const hit = all.filter(x => !q || String(x[1]).toLowerCase().includes(q)).slice(0, 200);
      $('[data-pl]', el).innerHTML = hit.length ? hit.map(x => `<button type="button" class="ea-opt" data-pv="${esc(x[0])}">${esc(x[1])}</button>`).join('') : '<div class="empty" style="padding:18px">Keine Einträge</div>';
    };
    $('[data-pq]', el).oninput = draw; draw(); setTimeout(() => $('[data-pq]', el)?.focus(), 60);
    el.addEventListener('click', e => { const b = e.target.closest('[data-pv]'); if (b) { res(b.dataset.pv); closeLayer(el); } });
  });
}
function eaCollect(el) {
  $$('[data-ea]', el).forEach(i => { EA.draft[i.dataset.ea] = i.type === 'number' ? (i.value === '' ? '' : +i.value) : i.value; });
  const ta = $('[data-ea-fuss]', el); if (ta) EA.draft['allg.mailfuss'] = ta.value;
}
function eaRender() {
  const host = $('#view-einst-allgemein'); if (!host) return;
  const el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  const btn = (a, icon, l, dis) => `<button class="ag-btn" data-ea-a="${a}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}<span>${l}</span></button>`;
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Zurück')}${btn('refresh', 'sync', 'Aktualisieren')}${btn('save', 'check', 'Sichern', !EA.dirty)}${btn('undo', 'undo', 'Änderungen zurücknehmen', !EA.dirty)}</div>
    <div class="ae-tabsw"><div class="ed-tabs"><button type="button" class="ed-tab" data-ea-t="allg" aria-selected="${EA.tab === 'allg'}">Allgemein</button><button type="button" class="ed-tab" data-ea-t="mail" aria-selected="${EA.tab === 'mail'}">E-Mail-Fußzeile</button></div></div>
    <div class="ae-body"><div id="edBody">${EA.tab === 'allg'
      ? `<div class="ea-cols">${EA_GROUPS().map(g => `<div class="ae-card ea-card"><h4>${esc(g.h)}</h4><div class="ea-fields">${g.f.map(eaField).join('')}</div></div>`).join('')}</div>`
      : `<div class="ae-card ea-card" style="flex:1;max-width:none"><h4>E-Mail-Fußzeile</h4><label class="field" style="flex:1"><span>Text unter jeder E-Mail aus Kontor (Belege, Bestellungen, Mahnungen, Regeln)</span><textarea class="input ea-fuss" data-ea-fuss rows="12" placeholder="z. B. Alpenlicht Sport GmbH · Maria-Theresien-Str. 18 · 6020 Innsbruck · UID ATU00000000">${esc(EA.draft['allg.mailfuss'])}</textarea></label></div>`}</div></div>`;
  el.addEventListener('input', e => { if (e.target.closest('[data-ea],[data-ea-fuss]')) { EA.dirty = true; $$('[data-ea-a="save"],[data-ea-a="undo"]', el).forEach(b => { b.disabled = false; }); } });
  el.addEventListener('click', async e => {
    const t = e.target, clr = t.closest('[data-ea-clr]'), pick = t.closest('[data-ea-pick]'), go_ = t.closest('[data-ea-go]'), tab = t.closest('[data-ea-t]'), b = t.closest('[data-ea-a]');
    if (clr) { e.stopPropagation(); eaCollect(el); EA.draft[clr.dataset.eaClr] = ''; EA.dirty = true; return eaRender(); }
    if (pick) { const f = eaFind(pick.dataset.eaPick); const v = await eaPick(f); if (v !== undefined) { eaCollect(el); EA.draft[f.k] = v; EA.dirty = true; eaRender(); } return; }
    if (go_) { if (EA.dirty && !await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen')) return; EA.dirty = false; return go(go_.dataset.eaGo); }
    if (tab) { eaCollect(el); EA.tab = tab.dataset.eaT; return eaRender(); }
    if (!b || b.disabled) return;
    const a = b.dataset.eaA; eaCollect(el);
    if (a === 'back') return history.length > 1 ? history.back() : go('dashboard');
    if (a === 'refresh' || a === 'undo') { await loadStamm(true); EA.draft = eaLoad(); EA.dirty = false; return eaRender(); }
    try { await needPerm('einstellungen', 'Einstellungen Allgemein'); await saveSettings({...EA.draft}); EA.dirty = false; eaRender(); } catch (err) { if (err) toast('Nicht gespeichert', {t2: String(err.message || err), type: 'warn'}); }
  });
}
registerPage('einst-allgemein', {title: 'Einstellungen Allgemein', sub: () => 'Einstellungen', render: async () => { await loadStamm(); if (!EA.draft || !EA.dirty) EA.draft = eaLoad(); eaRender(); }});
VIEW_PERM['einst-allgemein'] = 'einstellungen';

/* ── Wirkung der Einstellungen ── */
/* 1) E-Mail-Fußzeile an jede ausgehende Mail */
INVOKE_HOOKS.mail_send = a => {
  const f = String(CFG['allg.mailfuss'] || '').trim(); if (!f || !a) return a;
  return {...a, html: (a.html || '') + `<hr style="border:0;border-top:1px solid #ddd;margin:18px 0 10px"><div style="font:12px system-ui,sans-serif;color:#666;white-space:pre-wrap">${esc(f)}</div>`, text: (a.text || '') + `\n\n--\n${f}`};
};
/* 2) Standardwerte beim Anlegen eines Artikels (siehe artEditorMount) */
const eaNeuArtikel = st => {
  const wg = CFG['allg.warengruppe']; if (wg && CATS.some(c => c.id === wg) && (typeof AV === 'undefined' || AV.cat === 'alle')) st.cat = wg;
  if (CFG['allg.marke']) st.brand = CFG['allg.marke'];
  const m = stRows('mwsttyp').find(x => x.id === CFG['allg.mwst']); if (m) st.vat = +m.satz || 0;
  const g = stRows('groessenschluessel').find(x => x.id === CFG['allg.groessenschluessel']); if (g?.groessen?.length) st.sizes = g.groessen.join(', ');
  return st;
};
