/* ═════════════════════════════════════════════════════════════════
   44 · STANDARDWERTE (Einstellungen › Standardwerte) – nur Einstellungen, die tatsächlich wirken
   ═════════════════════════════════════════════════════════════════ */
const EA_DEFAULTS = {'edi.gln': '', 'gutschein.jahre': 3, 'allg.spediteur': '', 'allg.warengruppe': '', 'allg.marke': '', 'allg.mwst': '', 'allg.groessenschluessel': '', 'allg.mailfuss': ''};
const eaMarken = () => mkAuswahl().map(x => [x, x]);
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
const EA = {draft: null};
const eaLoad = () => { const o = {}; for (const k in EA_DEFAULTS) o[k] = CFG[k] ?? EA_DEFAULTS[k]; return o; };
const eaLabel = (f, v) => { const hit = (f.o() || []).find(x => String(x[0]) === String(v)); return hit ? hit[1] : ''; };
const eaFind = k => EA_GROUPS().flatMap(g => g.f).find(f => f.k === k);

/** Auswahlfeld mit Suche (große Listen wie Warengruppen mit über 10.000 Einträgen) */
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
/** Zeile der Einstellungsseite (Einstellungen › Standardwerte): wirkt sofort, ohne extra „Sichern“ */
function eaRow(f) {
  const v = CFG[f.k] ?? EA_DEFAULTS[f.k];
  let ctl;
  if (f.t === 'combo') {
    const lbl = eaLabel(f, v);
    ctl = `<div class="ea-cmb-row"><div class="input ea-pick" tabindex="0" data-ea-pick="${f.k}"><span class="${lbl ? '' : 'ea-ph'}">${esc(lbl || 'Nicht festgelegt')}</span>${lbl ? `<button type="button" class="ea-x" data-ea-clr="${f.k}" aria-label="Leeren">${ic('x', 'i-xs')}</button>` : ''}${ic('chevron-down', 'i-xs')}</div><button type="button" class="ea-ib" data-ea-go="${f.page}" title="Liste öffnen">${ic('edit', 'i-sm')}</button></div>`;
  } else if (f.t === 'num') ctl = `<input class="input" type="number" min="1" max="30" step="1" data-key="${f.k}" value="${esc(v)}" style="max-width:100px">`;
  else ctl = `<input class="input" data-key="${f.k}" value="${esc(v)}">`;
  return `<div class="set-row"><div><div class="set-l">${esc(f.l)}</div>${f.hint ? `<div class="set-h">${esc(f.hint)}</div>` : ''}</div><div class="set-c" style="min-width:0">${ctl}</div></div>`;
}
function eaSectionHTML() {
  return `<section class="set-sec" id="sec-standard"><h2>Standardwerte</h2><p>Gelten für alle Kassen: EDI-Absender, Gutscheine, Sendungen, neue Artikel und die Fußzeile unter jeder E-Mail aus Kontor.</p>
    ${EA_GROUPS().map(g => `<div class="card" style="margin-bottom:12px"><div class="set-row" style="min-height:0"><div class="set-l" style="font-weight:650">${esc(g.h)}</div></div>${g.f.map(eaRow).join('')}</div>`).join('')}
    <div class="card"><div class="set-row" style="align-items:flex-start"><div><div class="set-l">E-Mail-Fußzeile</div><div class="set-h">Text unter jeder E-Mail aus Kontor (Belege, Bestellungen, Mahnungen, Regeln)</div></div><div class="set-c" style="flex:1;min-width:0"><textarea class="input" data-key="allg.mailfuss" rows="4" style="height:auto;padding:9px 12px;resize:vertical;width:100%" placeholder="z. B. Alpenlicht Sport GmbH · Maria-Theresien-Str. 18 · 6020 Innsbruck · UID ATU00000000">${esc(CFG['allg.mailfuss'] || '')}</textarea></div></div></div></section>`;
}
/** Klicks im Abschnitt „Standardwerte“ (von renderSettings aufgerufen) – true, wenn behandelt */
async function eaClick(t) {
  const refresh = () => { const el = $('#sec-standard'); if (el) el.outerHTML = eaSectionHTML(); };
  const clr = t.closest('[data-ea-clr]'); if (clr) { await saveSettings({[clr.dataset.eaClr]: ''}); refresh(); return true; }
  const pick = t.closest('[data-ea-pick]'); if (pick) { const f = eaFind(pick.dataset.eaPick); const v = await eaPick(f); if (v !== undefined) { await saveSettings({[f.k]: v}); refresh(); } return true; }
  const go_ = t.closest('[data-ea-go]'); if (go_) { go(go_.dataset.eaGo); return true; }
  return false;
}

/* ── Wirkung der Einstellungen ── */
/* 1) E-Mail-Fußzeile an jede ausgehende Mail */
INVOKE_HOOKS.mail_send = a => {
  const f = String(CFG['allg.mailfuss'] || '').trim(); if (!f || !a) return a;
  return {...a, html: (a.html || '') + `<hr style="border:0;border-top:1px solid #ddd;margin:18px 0 10px"><div style="font:12px system-ui,sans-serif;color:#666;white-space:pre-wrap">${esc(f)}</div>`, text: (a.text || '') + `\n\n--\n${f}`};
};
/* 2) Standardwerte beim Anlegen eines Artikels (siehe artEditorMount) */
const eaNeuArtikel = st => {
  const wg = CFG['allg.warengruppe']; if (wg && CATS.some(c => c.id === wg) && (typeof AV === 'undefined' || AV.cat === 'alle')) st.cat = wg;
  if (CFG['allg.marke']) { st.brand = CFG['allg.marke']; st.supplierId = st.supplierId || lfMarkeSync(st.brand); }
  const m = stRows('mwsttyp').find(x => x.id === CFG['allg.mwst']); if (m) st.vat = +m.satz || 0;
  const g = stRows('groessenschluessel').find(x => x.id === CFG['allg.groessenschluessel']); if (g?.groessen?.length) st.sizes = g.groessen.join(', ');
  return st;
};
