/* ═════════════════════════════════════════════════════════════════
   44 · EINSTELLUNGEN NACH ADVARICS — Einstellungen Allgemein, Buchungslogik
   ═════════════════════════════════════════════════════════════════ */
const EA_MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const EA_SPRACHEN = [['de-AT', 'de-AT'], ['de-DE', 'de-DE'], ['de-CH', 'de-CH'], ['en-GB', 'en-GB'], ['it-IT', 'it-IT'], ['fr-FR', 'fr-FR']];
const eaStamm = (kind, nr = true) => () => stActive(kind).map(r => [r.id, `${r.name || r.id}${nr && r.nr != null && r.nr !== '' ? ` (${r.nr})` : ''}`]);
/* Felder: k = Einstellungsschlüssel, t: text | num | combo | switch | ro | area */
const EA_DEFAULTS = {
  'allg.gln': '', 'allg.startnr': 100000, 'allg.belegservice': true, 'allg.gjmonat': '5', 'allg.reservierung': 'Reservierung', 'allg.storno': false, 'allg.gutscheindruck': false,
  'allg.land': 'AT', 'allg.waehrung': 'EUR', 'allg.sprache1': 'de-AT', 'allg.sprache2': 'de-AT',
  'allg.bestandsfilter': 'alle', 'allg.hausfarbe': '', 'allg.warengruppe': '', 'allg.orderkategorie': '', 'allg.saison': '', 'allg.hauptsaison': '', 'allg.saisonkategorie': '', 'allg.marke': '', 'allg.zentrallager': 'INN', 'allg.spediteur': '', 'allg.mailverbindung': '', 'allg.wgschema': '',
  'allg.hauptabteilung': '', 'allg.abteilung': '', 'allg.hauptbereich': '', 'allg.bereich': '', 'allg.mwst': '', 'allg.groessenschluessel': '', 'allg.preislage': '', 'allg.etikett': '', 'allg.praemienschluessel': '', 'allg.altersbewertung': '',
  'allg.gs_tage': 0, 'allg.gs_scancode': '', 'allg.webapp_ausklappen': false, 'allg.mailfuss': '', 'allg.filialcode': ''
};
const EA_GROUPS = () => [
  {h: 'Allgemein', f: [
    {k: 'allg.gln', l: 'Unternehmens-GLN'}, {k: 'allg.startnr', l: 'Start-Nr. (Gr.,-Schl.)', t: 'num'},
    {l: 'Globaler Domänen-Name', t: 'ro', v: () => (CFG['firma.name'] || 'kontor').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')},
    {k: 'allg.belegservice', l: 'Globalen Belegservice nutzen', t: 'switch'},
    {k: 'allg.gjmonat', l: '1. Monat des Geschäftsjahres', t: 'combo', o: () => EA_MONATE.map((m, i) => [String(i + 1), m]), nolink: true, req: true},
    {k: 'allg.reservierung', l: 'Bezeichn. f. Reservierung / Ausfolgeschein'},
    {k: 'allg.storno', l: 'Verkäufe stornieren mit Gegenbuchung', t: 'switch', dis: true},
    {k: 'allg.gutscheindruck', l: 'Gutscheindruck erlauben', t: 'switch'}]},
  {h: 'Internationalisierung', f: [
    {k: 'allg.land', l: 'Land', t: 'combo', req: true, o: () => { const r = stActive('land').map(x => [x.id, x.name || x.id]); return r.length ? r : [['AT', 'Österreich'], ['DE', 'Deutschland'], ['CH', 'Schweiz'], ['IT', 'Italien']]; }, page: 'st-land'},
    {k: 'allg.waehrung', l: 'Währung', t: 'combo', req: true, o: () => [['EUR', 'Euro (EUR)'], ['CHF', 'Schweizer Franken (CHF)'], ['USD', 'US-Dollar (USD)'], ['GBP', 'Britisches Pfund (GBP)']], nolink: true},
    {k: 'allg.sprache1', l: 'Region und Sprache', t: 'combo', req: true, o: () => EA_SPRACHEN, nolink: true},
    {k: 'allg.sprache2', l: '2. Region und Sprache', t: 'combo', o: () => EA_SPRACHEN, nolink: true}]},
  {h: 'Sonstige Standard-Einstellungen', f: [
    {k: 'allg.bestandsfilter', l: 'Filialfilter Bestandsinfo', t: 'combo', o: () => [['alle', 'Alle Filialen'], ['eigene', 'Eigene Filiale'], ['gruppe', 'Filialgruppe']], nolink: true},
    {k: 'allg.hausfarbe', l: 'Standard-Haus-Farbe', t: 'combo', req: true, o: eaStamm('hausfarbe'), page: 'st-hausfarbe'},
    {k: 'allg.warengruppe', l: 'Standard-Warengruppe', t: 'combo', req: true, o: eaStamm('warengruppe'), page: 'st-warengruppe'},
    {k: 'allg.orderkategorie', l: 'Standard-Order-Kategorie', t: 'combo', req: true, o: eaStamm('orderkategorie'), page: 'st-orderkategorie'},
    {k: 'allg.saison', l: 'Aktuelle Saison', t: 'combo', req: true, o: eaStamm('saison'), page: 'st-saison'},
    {k: 'allg.hauptsaison', l: 'Standard-Haupt-Saison', t: 'combo', o: eaStamm('hauptsaison'), page: 'st-hauptsaison'},
    {k: 'allg.saisonkategorie', l: 'Standard-Saison-Kategorie', t: 'combo', o: eaStamm('saisonkategorie'), page: 'st-saisonkategorie'},
    {k: 'allg.marke', l: 'Standard-Marke', t: 'combo', req: true, o: eaStamm('marke', false), page: 'st-marke'},
    {k: 'allg.zentrallager', l: 'Zentral-Lager-Filiale', t: 'combo', req: true, o: () => STORES.map(s => [s.id, s.name]), nolink: true},
    {k: 'allg.spediteur', l: 'Standard-Spediteur', t: 'combo', o: eaStamm('spediteur', false), page: 'st-spediteur'},
    {k: 'allg.mailverbindung', l: 'Standard-Mail-Verbindung', t: 'combo', o: () => CFG['mail.host'] ? [['smtp', `${CFG['mail.host']} (SMTP)`]] : [], nolink: true},
    {k: 'allg.wgschema', l: 'Warengruppen-Schema', t: 'combo', o: eaStamm('wgschema', false), page: 'st-wgschema'}]},
  {h: 'Standard-Einstellungen f. Warengruppen', f: [
    {k: 'allg.hauptabteilung', l: 'Standard-Haupt-Abteilung', t: 'combo', o: eaStamm('hauptabteilung'), page: 'st-hauptabteilung'},
    {k: 'allg.abteilung', l: 'Standard-Abteilung', t: 'combo', o: eaStamm('abteilung'), page: 'st-abteilung'},
    {k: 'allg.hauptbereich', l: 'Standard-Haupt-Bereich', t: 'combo', o: eaStamm('hauptbereich'), page: 'st-hauptbereich'},
    {k: 'allg.bereich', l: 'Standard-Bereich', t: 'combo', o: eaStamm('bereich'), page: 'st-bereich'},
    {k: 'allg.mwst', l: 'Standard-MwSt.-Satz', t: 'combo', req: true, o: eaStamm('mwsttyp'), page: 'st-mwsttyp'},
    {k: 'allg.groessenschluessel', l: 'Standard-Größenschlüssel', t: 'combo', o: eaStamm('groessenschluessel'), page: 'st-groessenschluessel'},
    {k: 'allg.preislage', l: 'Standard-Preislage', t: 'combo', o: eaStamm('preislage', false), page: 'st-preislage'},
    {k: 'allg.etikett', l: 'Standard-Etikett', t: 'combo', o: eaStamm('etikettentyp', false), page: 'st-etikettentyp'},
    {k: 'allg.praemienschluessel', l: 'Standard-Prämienschlüssel', t: 'combo', o: eaStamm('praemienschluessel'), page: 'st-praemienschluessel'},
    {k: 'allg.altersbewertung', l: 'Standard-Altersbewertung', t: 'combo', o: eaStamm('altersbewertung', false), page: 'st-altersbewertung'}]},
  {h: 'Gutscheine', f: [
    {k: 'allg.gs_tage', l: 'Verlängerung der Gültigkeit um Tage', t: 'num'}, {k: 'allg.gs_scancode', l: 'Länge automatischer Scancode', t: 'num'},
    {l: 'Einzweckgutschein aktiviert von', t: 'ro', v: () => ''}, {l: 'Einzweckgutschein aktiviert am', t: 'ro', v: () => ''}]},
  {h: 'Geräte-Registrierung', f: [{l: 'Anzahl O.P.I Lizenzen', t: 'ro', v: () => '0'}]},
  {h: 'WebApp-Einstellungen', f: [{k: 'allg.webapp_ausklappen', l: 'mobile Liste immer ausklappen', t: 'switch'}]}
];
const EA = {tab: 'allg', draft: null, dirty: false};
const eaLoad = () => { const o = {}; for (const k in EA_DEFAULTS) o[k] = CFG[k] ?? EA_DEFAULTS[k]; return o; };
const eaLabel = (f, v) => { const hit = (f.o() || []).find(x => String(x[0]) === String(v)); return hit ? hit[1] : ''; };

function eaField(f) {
  const D = EA.draft, v = f.k ? D[f.k] : null, rq = f.req ? ' *' : '';
  if (f.t === 'switch') return `<label class="ea-sw ${f.dis ? 'dis' : ''}"><button type="button" class="switch" role="switch" ${f.dis ? 'disabled' : ''} data-ea-sw="${f.k}" aria-checked="${!!v}"></button><span>${esc(f.l)}</span></label>`;
  if (f.t === 'ro') return `<label class="field"><span>${esc(f.l)}</span><input class="input ea-ro" readonly value="${esc(f.v ? f.v() : '')}"></label>`;
  if (f.t === 'num') return `<label class="field"><span>${esc(f.l)}</span><input class="input num" type="number" data-ea="${f.k}" value="${esc(v)}"></label>`;
  if (f.t === 'combo') {
    const lbl = eaLabel(f, v);
    return `<div class="field ea-cmb"><span>${esc(f.l)}${rq}</span><div class="ea-cmb-row"><div class="input ea-pick" tabindex="0" data-ea-pick="${f.k}"><span class="${lbl ? '' : 'ph'}">${esc(lbl || '')}</span>${lbl && !f.req ? `<button type="button" class="ea-x" data-ea-clr="${f.k}" aria-label="Leeren">${ic('x', 'i-xs')}</button>` : ''}${ic('chevron-down', 'i-xs')}</div>${f.nolink ? '' : `<button type="button" class="ea-ib" data-ea-go="${f.page}" title="Öffnen">${ic('edit', 'i-sm')}</button><button type="button" class="ea-ib" data-ea-go="${f.page}" title="Neu anlegen">${ic('plus', 'i-sm')}</button>`}<button type="button" class="ea-ib" data-ea-pick="${f.k}" title="Suchen">${ic('search', 'i-sm')}</button></div></div>`;
  }
  return `<label class="field"><span>${esc(f.l)}</span><input class="input" data-ea="${f.k}" value="${esc(v)}"></label>`;
}
const eaFind = k => EA_GROUPS().flatMap(g => g.f).find(f => f.k === k);

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

function eaMark(el, on) {
  EA.dirty = on;
  $$('[data-ea-a="save"],[data-ea-a="undo"]', el).forEach(b => { b.disabled = !on; });
}
function eaCollect(el) {
  $$('[data-ea]', el).forEach(i => { EA.draft[i.dataset.ea] = i.type === 'number' ? (i.value === '' ? '' : +i.value) : i.value; });
  const ta = $('[data-ea-fuss]', el); if (ta) EA.draft['allg.mailfuss'] = ta.value;
}

function eaRender() {
  const host = $('#view-einst-allgemein'); if (!host) return;
  const el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  const btn = (a, icon, l, dis) => `<button class="ag-btn" data-ea-a="${a}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}<span>${l}</span></button>`;
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Zurück')}${btn('refresh', 'sync', 'Aktualisieren')}${btn('save', 'check', 'Sichern', !EA.dirty)}${btn('undo', 'undo', 'Änderungen zurücknehmen', !EA.dirty)}${btn('trans', 'globe', 'Übersetzungen nachladen')}${btn('code', 'store', 'Filial-Code neu zuweisen')}${btn('codeoff', 'trash', 'Filial-Code zurücksetzen')}</div>
    <div class="ae-tabsw"><div class="ed-tabs"><button type="button" class="ed-tab" data-ea-t="allg" aria-selected="${EA.tab === 'allg'}">Allgemein</button><button type="button" class="ed-tab" data-ea-t="mail" aria-selected="${EA.tab === 'mail'}">E-Mail-Fußzeile</button></div></div>
    <div class="ae-body"><div id="edBody">${EA.tab === 'allg'
      ? `<div class="ea-cols">${EA_GROUPS().map(g => `<div class="ae-card ea-card"><h4>${esc(g.h)}</h4><div class="ea-fields">${g.f.map(eaField).join('')}</div></div>`).join('')}</div>`
      : `<div class="ae-card ea-card" style="flex:1"><h4>E-Mail-Fußzeile</h4><label class="field" style="flex:1"><span>E-Mail-Fußzeile</span><textarea class="input ea-fuss" data-ea-fuss rows="14" placeholder="Text, der unter jede E-Mail aus Kontor gesetzt wird">${esc(EA.draft['allg.mailfuss'])}</textarea></label></div>`}</div></div>`;
  el.addEventListener('input', e => { if (e.target.closest('[data-ea],[data-ea-fuss]')) eaMark(el, true); });
  el.addEventListener('click', async e => {
    const t = e.target, sw = t.closest('[data-ea-sw]'), clr = t.closest('[data-ea-clr]'), pick = t.closest('[data-ea-pick]'), go_ = t.closest('[data-ea-go]'), tab = t.closest('[data-ea-t]'), b = t.closest('[data-ea-a]');
    if (sw && !sw.disabled) { eaCollect(el); EA.draft[sw.dataset.eaSw] = !EA.draft[sw.dataset.eaSw]; EA.dirty = true; return eaRender(); }
    if (clr) { e.stopPropagation(); eaCollect(el); EA.draft[clr.dataset.eaClr] = ''; EA.dirty = true; return eaRender(); }
    if (pick) { const f = eaFind(pick.dataset.eaPick); const v = await eaPick(f); if (v !== undefined) { eaCollect(el); EA.draft[f.k] = v; EA.dirty = true; eaRender(); } return; }
    if (go_) { if (EA.dirty && !await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen')) return; EA.dirty = false; return go(go_.dataset.eaGo); }
    if (tab) { eaCollect(el); EA.tab = tab.dataset.eaT; return eaRender(); }
    if (!b || b.disabled) return;
    const a = b.dataset.eaA; eaCollect(el);
    if (a === 'back') return go('dashboard');
    if (a === 'refresh' || a === 'undo') { await loadStamm(); EA.draft = eaLoad(); EA.dirty = false; return eaRender(); }
    if (a === 'trans') return toast('Übersetzungen sind aktuell', {type: 'pos', icon: 'check'});
    try {
      await needPerm('einstellungen', 'Einstellungen Allgemein');
      if (a === 'save') {
        const miss = EA_GROUPS().flatMap(g => g.f).find(f => f.req && f.t === 'combo' && ['land', 'waehrung', 'sprache1', 'gjmonat'].some(s => f.k === 'allg.' + s) && !EA.draft[f.k]);
        if (miss) return toast(`${miss.l} angeben`, {type: 'warn'});
        await saveSettings({...EA.draft}); EA.dirty = false; return eaRender();
      }
      if (a === 'code') { EA.draft['allg.filialcode'] = Math.random().toString(36).slice(2, 10).toUpperCase(); await saveSettings({'allg.filialcode': EA.draft['allg.filialcode']}, true); toast('Filial-Code neu zugewiesen', {t2: EA.draft['allg.filialcode'], type: 'pos', icon: 'store'}); }
      if (a === 'codeoff') { EA.draft['allg.filialcode'] = ''; await saveSettings({'allg.filialcode': ''}, true); toast('Filial-Code zurückgesetzt', {icon: 'trash'}); }
    } catch (err) { if (err) toast('Nicht möglich', {t2: String(err.message || err), type: 'warn'}); }
  });
}
registerPage('einst-allgemein', {title: 'Einstellungen Allgemein', sub: () => 'Einstellungen', render: async () => { await loadStamm(); if (!EA.draft || !EA.dirty) EA.draft = eaLoad(); eaRender(); }});
VIEW_PERM['einst-allgemein'] = 'einstellungen';

/* ── Buchungslogik (Status) ── */
const blRo = (l, v, cls = '') => `<div class="field"><span>${esc(l)}</span><div class="input ea-ro ${cls}">${v}</div></div>`;
const blSw = (l, on) => `<label class="ea-sw dis"><button type="button" class="switch" disabled role="switch" aria-checked="${on}"></button><span>${esc(l)}</span></label>`;
async function blRender() {
  const host = $('#view-einst-buchungslogik'); if (!host) return;
  let first = '';
  try { const c = await invoke('article_card', {id: ART[0]?.id}); const ds = (c?.moves || []).map(m => String(m.date || m.at || '').slice(0, 10)).filter(Boolean).sort(); first = ds[0] || ''; } catch (e) { }
  const f = d => d ? d.split('-').reverse().join('.') : '–';
  const el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  el.innerHTML = `<div class="ag-bar ae-bar"><button class="ag-btn" data-bl="back">${ic('chevron-left', 'i-sm')}<span>Zurück</span></button><button class="ag-btn" data-bl="refresh">${ic('sync', 'i-sm')}<span>Aktualisieren</span></button></div>
    <div class="ea-cols"><div class="ae-card ea-card"><h4>Einstellungen</h4><div class="ea-fields">
      ${blRo('Buchungs-Logik-Version', '2')}${blRo('Abschluss zum', '')}${blRo('Frühestes Buchungs-Bewertungs-Datum', '01.01.2000')}${blRo('Buchungen bewerten ab', '31.12.2000')}${blRo('Anzahl Details pro Bewertung', '5000', 'r')}${blRo('Letzte Reorganisation', '01.01.1900')}${blRo('Timestamp Bestands-Update', f(today()))}${blSw('Artikelbasispreise mit letzten Filialpreisen aktualisieren', true)}</div></div>
      <div class="ae-card ea-card"><h4>Status</h4><div class="ea-fields">
      ${blRo('Backgroundworker Status', ic('check', 'i-sm') + ' läuft', 'ok')}${blRo('Erster Buchungstag', f(first))}
      <div class="field"><span>Aktualisieren</span><button type="button" class="btn btn-secondary btn-icon" data-bl="refresh" aria-label="Aktualisieren">${ic('sync')}</button></div>${blRo('Anz. nicht bewerteter Buchungen', '0', 'r')}</div></div>
      <div class="ae-card ea-card"><h4>Auswertung</h4><div class="ea-fields">${blRo('KER-Daten: Anz. Jahre rückwärts', '2', 'r')}</div></div>
      <div class="ae-card ea-card" style="flex:1 1 320px"><h4>Prüfung</h4><div class="ea-fields">${blSw('Bewertungs-Voraussetzungen OK', true)}</div></div></div>`;
  el.addEventListener('click', e => { const b = e.target.closest('[data-bl]'); if (!b) return; if (b.dataset.bl === 'back') return go('dashboard'); blRender(); toast('Aktualisiert', {type: 'pos', icon: 'check', dur: 1200}); });
}
registerPage('einst-buchungslogik', {title: 'Buchungslogik', sub: () => 'Einstellungen', render: () => blRender()});
VIEW_PERM['einst-buchungslogik'] = 'einstellungen';
