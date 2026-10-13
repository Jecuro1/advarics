
/* ════════════════════════════════════════════════════════════════════
   31 · ANPASSEN — eigene Felder (mit Typ, Pflicht, Auswahl) für Artikel,
   Kunden, Lieferanten und eigene Objekte; eigene Objekte mit Datensätzen
   und eigenem Menüpunkt. Felder von Artikeln/Kunden werden unter ihrer
   Bezeichnung gespeichert (so erscheinen sie überall wie bisher), bei
   Lieferanten und eigenen Objekten unter ihrem technischen Namen.
   ════════════════════════════════════════════════════════════════════ */
const CF = {defs: [], ents: [], sup: {}};
const FTYPES = [['text', 'Text'], ['mehrzeilig', 'Mehrzeiliger Text'], ['zahl', 'Zahl'], ['betrag', 'Betrag (€)'], ['datum', 'Datum'], ['auswahl', 'Auswahl'], ['janein', 'Ja / Nein'], ['email', 'E-Mail'], ['telefon', 'Telefon']];
const OBJ_ICONS = ['layers', 'wrench', 'snow', 'calendar', 'tag', 'boxes', 'users', 'truck', 'star', 'clock', 'gift', 'flow', 'receipt', 'building'];
const cfDefs = obj => CF.defs.filter(d => d.object === obj).sort((a, b) => a.pos - b.pos || a.id - b.id);
const cfObjName = o => o === 'artikel' ? 'Artikel' : o === 'kunde' ? 'Kunden' : o === 'lieferant' ? 'Lieferanten' : (CF.ents.find(e => 'obj:' + e.id === o)?.plural || o);
const entById = id => CF.ents.find(e => e.id === id);

async function loadCustom() {
  if (!DESKTOP) return;
  try { [CF.defs, CF.ents, CF.sup] = await Promise.all([invoke('fields_list', {object: null}), invoke('entities_list'), invoke('supplier_fields_get')]); }
  catch (e) { console.error(e); }
  syncObjNav();
}

/* ── Navigation: eigene Objekte als eigene Menüpunkte ── */
function syncObjNav() {
  for (let i = NAV.length - 1; i >= 0; i--) if (NAV[i].obj || NAV[i].g === 'Eigene Objekte') NAV.splice(i, 1);
  const sys = NAV.findIndex(n => n.g === 'System');
  if (CF.ents.length) NAV.splice(sys, 0, {g: 'Eigene Objekte'}, ...CF.ents.map(e => ({id: 'obj-' + e.id, label: e.plural, icon: e.icon || 'layers', obj: true, count: e.count || undefined})));
  Object.keys(TITLES).forEach(k => { if (k.startsWith('obj-')) delete TITLES[k]; });
  CF.ents.forEach(e => { TITLES['obj-' + e.id] = e.plural; });
  if ($('#nav')) { renderNav(); permNav(); $$('.nav-item').forEach(n => n.dataset.view === S.view ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current')); }
}

/* ── Feld-Eingaben ── */
const cfShow = (d, v) => {
  if (v == null || v === '') return '';
  if (d.type === 'janein') return v === true || v === 'ja' || v === 'true' ? 'ja' : 'nein';
  if (d.type === 'betrag' && typeof v === 'number') return eur(v);
  if (d.type === 'zahl' && typeof v === 'number') return num(v, Number.isInteger(v) ? 0 : 2);
  if (d.type === 'datum' && /^\d{4}-\d\d-\d\d$/.test(v)) return new Date(v + 'T12:00').toLocaleDateString('de-AT');
  return String(v);
};
function cfInput(d, v) {
  const a = `data-cf="${esc(d.key)}"`;
  const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  switch (d.type) {
    case 'mehrzeilig': return `<textarea class="input" ${a} rows="2" style="height:auto;padding-top:9px;resize:vertical">${esc(s)}</textarea>`;
    case 'auswahl': return `<select class="input select" ${a}><option value="">–</option>${d.options.map(o => `<option ${o === s ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    case 'janein': { const on = v === true || s === 'ja' || s === 'true'; return `<button type="button" class="switch" role="switch" ${a} data-cfsw aria-checked="${on}" aria-label="${esc(d.label)}"></button>`; }
    case 'datum': return `<input class="input" type="date" ${a} value="${esc(s)}">`;
    case 'zahl': case 'betrag': return `<input class="input num" inputmode="decimal" ${a} value="${esc(s)}" ${d.type === 'betrag' ? 'placeholder="€"' : ''}>`;
    case 'email': return `<input class="input" type="email" ${a} value="${esc(s)}" autocomplete="off">`;
    case 'telefon': return `<input class="input" type="tel" ${a} value="${esc(s)}" autocomplete="off">`;
    default: return `<input class="input" ${a} value="${esc(s)}" autocomplete="off">`;
  }
}
/** Abschnitt mit allen definierten Feldern eines Objekts. byLabel: Werte liegen unter der Bezeichnung */
function cfHTML(obj, vals = {}, byLabel = false, title = 'Felder') {
  const defs = cfDefs(obj); if (!defs.length) return '';
  return `<div class="ed-sec" data-cfobj="${esc(obj)}"><div class="lab">${esc(title)} <span class="muted">unter Anpassen → Felder festgelegt</span></div><div class="ed-grid">${defs.map(d => {
    const v = vals?.[byLabel ? d.label : d.key];
    const lbl = `<span>${esc(d.label)}${d.required ? ' <b class="req">*</b>' : ''}</span>`;
    const help = d.help ? `<small class="muted" style="font-size:11.5px">${esc(d.help)}</small>` : '';
    return d.type === 'janein' ? `<div class="field"><span>${esc(d.label)}</span><div style="display:flex;align-items:center;gap:8px;min-height:36px">${cfInput(d, v)}${help}</div></div>`
      : `<label class="field ${d.type === 'mehrzeilig' ? 'full' : ''}">${lbl}${cfInput(d, v)}${help}</label>`;
  }).join('')}</div></div>`;
}
document.addEventListener('click', e => { const sw = e.target.closest('[data-cfsw]'); if (sw) sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); });
/** Eingaben lesen (Rohwerte, Schlüssel = technischer Name oder Bezeichnung) */
function cfRead(root, obj, byLabel = false) {
  const out = {};
  cfDefs(obj).forEach(d => {
    const i = $(`[data-cfobj="${obj}"] [data-cf="${d.key}"]`, root); if (!i) return;
    out[byLabel ? d.label : d.key] = i.dataset.cfsw != null ? (i.getAttribute('aria-checked') === 'true' ? 'ja' : 'nein') : i.value.trim();
  });
  return out;
}
/** Prüfen (Typ, Pflicht, Auswahl) – in der Desktop-App durch die Datenbank-Schicht. null bei Fehler. */
async function cfCheck(obj, vals, byLabel = false) {
  const defs = cfDefs(obj); if (!defs.length) return {};
  const raw = {}; defs.forEach(d => { const v = vals[byLabel ? d.label : d.key]; if (v != null && v !== '') raw[d.key] = v; });
  let normd;
  try {
    if (DESKTOP) normd = await invoke('fields_validate', {object: obj, values: raw});
    else { const miss = defs.find(d => d.required && d.type !== 'janein' && !raw[d.key]); if (miss) throw new Error(`Pflichtfeld „${miss.label}“ fehlt`); normd = raw; }
  } catch (e) { toast('Bitte Felder prüfen', {t2: String(e.message || e), type: 'warn', icon: 'alert'}); return null; }
  if (!byLabel) return normd;
  const out = {};
  defs.forEach(d => { const v = normd[d.key]; if (v == null || v === '') return; out[d.label] = d.type === 'janein' ? (v ? 'ja' : 'nein') : typeof v === 'number' ? (d.type === 'betrag' ? num(v, 2) : String(v).replace('.', ',')) : String(v); });
  return out;
}
/** Freie Felder von definierten trennen (Artikel/Kunden) */
function cfSplit(obj, fields) {
  const labels = new Set(cfDefs(obj).map(d => d.label)), typed = {}, free = [];
  Object.entries(fields || {}).forEach(([k, v]) => labels.has(k) ? (typed[k] = v) : free.push([k, v]));
  return {typed, free};
}

/* ════ Ansicht „Anpassen“ ════ */
const AP = {tab: 'felder', obj: 'artikel'};
const AP_TABS = [['felder', 'Felder', 'list'], ['objekte', 'Objekte', 'layers'], ['regeln', 'Regeln', 'flow'], ['skripte', 'Skripte', 'code'], ['webhooks', 'Webhooks', 'zap'], ['api', 'REST-API', 'server'], ['pakete', 'Pakete', 'boxes']];
function renderAnpassen() {
  const v = $('#view-anpassen');
  if (!DESKTOP) { v.innerHTML = `<div class="cv"><div class="card"><div class="empty" style="padding:56px 20px"><div class="empty-icon">${ic('puzzle')}</div><h3>Anpassen nur in der Desktop-App</h3><p>Eigene Felder, Objekte, Regeln, Skripte, Webhooks und die REST-API werden in der lokalen Datenbank gespeichert.</p></div></div></div>`; return; }
  v.innerHTML = `<div class="cv">
    <div class="cv-head"><div><h2 class="h-title">Anpassen</h2><div class="dash-meta" style="margin-top:6px"><span>Kontor an Ihren Betrieb anpassen – ohne Programmierung, alles bleibt bei Updates erhalten</span></div></div></div>
    <div class="cv-tools"><div class="reasons" id="apTabs">${AP_TABS.map(([k, l, i]) => `<button class="chip" data-apt="${k}" aria-pressed="${AP.tab === k}">${ic(i, 'i-sm')}${l}</button>`).join('')}</div></div>
    <div id="apBody"></div></div>`;
  renderApBody();
}
function renderApBody() {
  const box = $('#apBody'); if (!box) return;
  $$('#apTabs [data-apt]').forEach(b => b.setAttribute('aria-pressed', b.dataset.apt === AP.tab));
  ({felder: renderApFields, objekte: renderApEntities, regeln: renderApRules, skripte: renderApScripts, webhooks: renderApHooks, api: renderApApi, pakete: renderApPackages})[AP.tab](box);
}

/* ── Felder ── */
function renderApFields(box) {
  const objs = [['artikel', 'Artikel', 'tag'], ['kunde', 'Kunden', 'users'], ['lieferant', 'Lieferanten', 'truck'], ...CF.ents.map(e => ['obj:' + e.id, e.plural, e.icon || 'layers'])];
  if (!objs.some(o => o[0] === AP.obj)) AP.obj = 'artikel';
  const defs = cfDefs(AP.obj);
  box.innerHTML = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><span class="muted" style="font-size:12.5px">Felder für</span>${objs.map(([k, l, i]) => `<button class="chip" data-apo="${esc(k)}" aria-pressed="${AP.obj === k}">${ic(i, 'i-sm')}${esc(l)}</button>`).join('')}<span class="sp" style="flex:1"></span><button class="btn btn-primary btn-sm" id="apFieldNew">${ic('plus', 'i-sm')}Neues Feld</button></div>
    <div class="card">${defs.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Bezeichnung</th><th>Typ</th><th>Technischer Name</th><th>Pflicht</th>${['artikel', 'kunde'].includes(AP.obj) ? '<th>An der Kasse</th>' : ''}<th></th></tr></thead><tbody>${defs.map((d, i) => `<tr data-fdef="${d.id}" ${dndAttr(d.id)} style="cursor:pointer"><td style="padding-left:16px"><b>${esc(d.label)}</b>${d.help ? `<div class="muted" style="font-size:11.5px">${esc(d.help)}</div>` : ''}</td><td>${esc(FTYPES.find(t => t[0] === d.type)?.[1] || d.type)}${d.type === 'auswahl' ? `<div class="muted" style="font-size:11.5px">${esc(d.options.join(' · '))}</div>` : ''}</td><td class="mono" style="font-size:12px">${esc(d.key)}</td><td>${d.required ? '<span class="pill accent">Pflicht</span>' : '–'}</td>${['artikel', 'kunde'].includes(AP.obj) ? `<td>${d.at_pos ? ic('check', 'i-sm') : '–'}</td>` : ''}<td class="r" style="white-space:nowrap;padding-right:12px">${dndGrip('Ziehen zum Sortieren')}<button class="btn btn-ghost btn-sm btn-icon" data-fmove="${d.id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="nach oben"><span style="display:inline-flex;transform:rotate(180deg)">${ic('chevron-down', 'i-sm')}</span></button><button class="btn btn-ghost btn-sm btn-icon" data-fmove="${d.id}" data-dir="1" ${i < defs.length - 1 ? '' : 'disabled'} aria-label="nach unten">${ic('chevron-down', 'i-sm')}</button></td></tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('list')}</div><h3>Noch keine Felder für ${esc(cfObjName(AP.obj))}</h3><p>z. B. „Saison“ (Auswahl), „Garantie bis“ (Datum), „Gewicht in g“ (Zahl) – mit Pflichtangabe und Prüfung. Erscheinen im Editor, in der API und in Regeln.</p></div>`}</div>
    <div class="prompt-hint blk" style="margin-top:10px">${ic('info', 'i-xs')}Felder von Artikeln und Kunden stehen in Regeln als <span class="mono">{{feld.Bezeichnung}}</span> zur Verfügung und werden über die REST-API mitgeliefert.</div>`;
  if (defs.length > 1) dndZone($('tbody', box), 'cf:' + AP.obj, {label: ids => defs.find(d => String(d.id) === ids[0])?.label || '', reorder: (ids, ins) => moveFieldTo(ids, ins)});
}
function openFieldEditor(d) {
  const obj = d?.object || AP.obj;
  const st = d ? {...d, options: d.options.join('\n')} : {object: obj, key: '', label: '', type: 'text', options: '', required: false, at_pos: false, help: '', pos: cfDefs(obj).length};
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Feld"><div id="feBox"></div></div>`, {focus: '#feLabel'});
  const box = $('#feBox', el);
  const collect = () => { st.label = $('#feLabel', el).value.trim(); st.help = $('#feHelp', el).value.trim(); const o = $('#feOpts', el); if (o) st.options = o.value; };
  const render = () => {
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('list')}</div><div><h2>${d ? esc(d.label) : 'Neues Feld'}</h2><p>${esc(cfObjName(obj))}${d ? ` · ${esc(d.key)}` : ' · technischer Name wird aus der Bezeichnung gebildet'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:14px">
        <label class="field"><span>Bezeichnung</span><input class="input" id="feLabel" value="${esc(st.label)}" placeholder="z. B. Saison"></label>
        <div><div class="field"><span>Typ</span></div><div class="reasons" style="margin-top:6px">${FTYPES.map(([k, l]) => `<button class="chip" data-ft="${k}" aria-pressed="${st.type === k}" ${d && d.type !== k && !['text', 'mehrzeilig'].includes(k) ? '' : ''}>${l}</button>`).join('')}</div></div>
        ${st.type === 'auswahl' ? `<label class="field"><span>Auswahlwerte (eine Zeile je Wert)</span><textarea class="input" id="feOpts" rows="4" style="height:auto;padding-top:9px">${esc(st.options)}</textarea></label>` : ''}
        <label class="field"><span>Hilfetext (optional)</span><input class="input" id="feHelp" value="${esc(st.help)}" placeholder="erscheint unter dem Feld"></label>
        <div class="set-row" style="padding:10px 0"><div><div class="set-l">Pflichtfeld</div><div class="set-h">Speichern nur mit Wert</div></div><div class="set-c"><button class="switch" role="switch" id="feReq" aria-checked="${st.required}" aria-label="Pflichtfeld"></button></div></div>
        ${['artikel', 'kunde'].includes(obj) ? `<div class="set-row" style="padding:10px 0;border-bottom:0"><div><div class="set-l">An der Kasse zeigen</div><div class="set-h">${obj === 'kunde' ? 'beim Zuordnen der Kundin / des Kunden' : 'in der Artikelansicht der Kasse'}</div></div><div class="set-c"><button class="switch" role="switch" id="fePos" aria-checked="${st.at_pos}" aria-label="An der Kasse"></button></div></div>` : ''}
      </div>
      <div class="m-foot">${d ? `<button class="btn btn-danger" id="feDel">${ic('trash', 'i-sm')}Löschen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="feSave">${ic('check', 'i-sm')}Speichern</button></div>`;
  };
  el.addEventListener('click', async e => {
    const ft = e.target.closest('[data-ft]'); if (ft) { collect(); st.type = ft.dataset.ft; return render(); }
    if (e.target.closest('#feReq')) { st.required = !st.required; return e.target.closest('#feReq').setAttribute('aria-checked', st.required); }
    if (e.target.closest('#fePos')) { st.at_pos = !st.at_pos; return e.target.closest('#fePos').setAttribute('aria-checked', st.at_pos); }
    if (e.target.closest('#feDel')) {
      try { await needPerm('anpassen', 'Feld löschen', `„${d.label}“ wird entfernt. Bereits gespeicherte Werte bleiben in den Datensätzen erhalten.`); CF.defs = await invoke('field_delete', {id: d.id}); } catch (err) { if (err?.message !== 'abgebrochen') toast('Nicht gelöscht', {t2: String(err), type: 'warn'}); return; }
      closeLayer(el); renderApBody(); Hooks.emit('config.field.deleted', {objekt: obj, feld: d.key}); return;
    }
    if (e.target.closest('#feSave')) {
      collect();
      const field = {id: d?.id ?? null, object: obj, key: d?.key || '', label: st.label, type: st.type, options: st.type === 'auswahl' ? String(st.options).split('\n').map(s => s.trim()).filter(Boolean) : [], required: st.required, at_pos: st.at_pos, help: st.help, pos: st.pos};
      try { CF.defs = await invoke('field_save', {field}); } catch (err) { return toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      closeLayer(el); renderApBody(); toast('Feld gespeichert', {t2: `${st.label} · ${cfObjName(obj)}`, type: 'pos', icon: 'list'}); Hooks.emit('config.field.saved', {objekt: obj, feld: st.label, typ: st.type});
    }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('#feSave', el).click(); } });
  render();
}
/** Feld per Ziehen an eine andere Stelle setzen */
async function moveFieldTo(ids, ins) {
  const a = dndArrange([...cfDefs(AP.obj)], ids, ins, d => d.id);
  try { for (let k = 0; k < a.length; k++) if (a[k].pos !== k) CF.defs = await invoke('field_save', {field: {...a[k], pos: k}}); } catch (e) { toast('Reihenfolge nicht gespeichert', {t2: String(e), type: 'warn'}); }
  renderApBody();
}
async function moveField(id, dir) {
  const defs = cfDefs(AP.obj), i = defs.findIndex(d => d.id === id), j = i + dir; if (i < 0 || j < 0 || j >= defs.length) return;
  [defs[i], defs[j]] = [defs[j], defs[i]];
  try { for (let k = 0; k < defs.length; k++) if (defs[k].pos !== k) CF.defs = await invoke('field_save', {field: {...defs[k], pos: k}}); } catch (e) { toast('Reihenfolge nicht gespeichert', {t2: String(e), type: 'warn'}); }
  renderApBody();
}

/* ── Objekte ── */
function renderApEntities(box) {
  box.innerHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><span class="muted" style="font-size:12.5px">Eigene Objekte bekommen einen Menüpunkt, eigene Felder, Suche, CSV-Export, Regeln und REST-Endpunkte.</span><span class="sp" style="flex:1"></span><button class="btn btn-primary btn-sm" id="apEntNew">${ic('plus', 'i-sm')}Neues Objekt</button></div>
    <div class="card">${CF.ents.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Objekt</th><th>Felder</th><th class="r">Datensätze</th><th>REST-Endpunkt</th><th></th></tr></thead><tbody>${CF.ents.map(e => `<tr data-ent="${esc(e.id)}" style="cursor:pointer"><td style="padding-left:16px"><span style="display:inline-flex;gap:10px;align-items:center"><span class="reg-ic">${ic(e.icon || 'layers', 'i-sm')}</span><span><b>${esc(e.plural)}</b><div class="muted" style="font-size:11.5px">Einzahl: ${esc(e.name)}</div></span></span></td><td>${cfDefs('obj:' + e.id).map(d => esc(d.label)).join(' · ') || '<span class="muted">noch keine</span>'}</td><td class="r num">${num(e.count || 0)}</td><td class="mono" style="font-size:12px">/api/v1/objekte/${esc(e.id)}</td><td class="r" style="white-space:nowrap;padding-right:12px"><button class="btn btn-ghost btn-sm" data-entopen="${esc(e.id)}">Öffnen</button></td></tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('layers')}</div><h3>Noch keine eigenen Objekte</h3><p>Beispiele: Reparaturaufträge, Skiverleih, Kurse & Events, Maßanfertigungen, Leihgeräte. Jedes Objekt bekommt eigene Felder und einen eigenen Menüpunkt.</p><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:8px">${[['Reparaturauftrag', 'Reparaturaufträge', 'wrench'], ['Kurs', 'Kurse & Events', 'calendar']].map(([n, p, i]) => `<button class="btn btn-secondary btn-sm" data-enttpl="${esc(n)}|${esc(p)}|${i}">${ic(i, 'i-sm')}${esc(p)}</button>`).join('')}</div></div>`}</div>`;
}
const ENT_TEMPLATES = {
  'Reparaturauftrag': [['Kunde', 'text', true], ['Telefon', 'telefon'], ['Gegenstand', 'text', true], ['Auftrag', 'mehrzeilig'], ['Status', 'auswahl', true, ['Angenommen', 'In Arbeit', 'Abholbereit', 'Abgeholt']], ['Fertig bis', 'datum'], ['Preis', 'betrag']],
  'Kurs': [['Titel', 'text', true], ['Datum', 'datum', true], ['Plätze', 'zahl'], ['Preis', 'betrag'], ['Leitung', 'text']],
};
function openEntityEditor(ent, tpl) {
  const st = ent ? {...ent} : {id: '', name: tpl?.[0] || '', plural: tpl?.[1] || '', icon: tpl?.[2] || 'layers', title_field: null};
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Objekt"><div id="enBox"></div></div>`, {focus: '#enName'});
  const box = $('#enBox', el);
  const collect = () => { st.name = $('#enName', el).value.trim(); st.plural = $('#enPlural', el).value.trim(); const t = $('#enTitle', el); if (t) st.title_field = t.value || null; };
  const render = () => {
    const defs = ent ? cfDefs('obj:' + ent.id) : [];
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic(st.icon || 'layers')}</div><div><h2>${ent ? esc(ent.plural) : 'Neues Objekt'}</h2><p>${ent ? `Kennung ${esc(ent.id)} · ${num(ent.count || 0)} Datensätze` : tpl ? 'Vorlage mit passenden Feldern' : 'Felder legen Sie danach unter „Felder“ fest'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:14px">
        <div class="ed-grid"><label class="field"><span>Name (Einzahl)</span><input class="input" id="enName" value="${esc(st.name)}" placeholder="z. B. Reparaturauftrag"></label><label class="field"><span>Mehrzahl (Menüpunkt)</span><input class="input" id="enPlural" value="${esc(st.plural)}" placeholder="z. B. Reparaturaufträge"></label></div>
        <div><div class="field"><span>Symbol</span></div><div class="reasons" style="margin-top:6px">${OBJ_ICONS.map(i => `<button class="chip" data-eic="${i}" aria-pressed="${st.icon === i}" aria-label="${i}" style="width:38px;justify-content:center;padding:0">${ic(i, 'i-sm')}</button>`).join('')}</div></div>
        ${defs.length ? `<label class="field"><span>Titelfeld (in Listen fett)</span><select class="input select" id="enTitle"><option value="">automatisch (erstes Feld)</option>${defs.map(d => `<option value="${esc(d.key)}" ${st.title_field === d.key ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>` : ''}
        ${tpl && ENT_TEMPLATES[tpl[0]] ? `<div class="prompt-hint blk">${ic('list', 'i-xs')}Felder: ${ENT_TEMPLATES[tpl[0]].map(f => esc(f[0])).join(' · ')}</div>` : ''}
      </div>
      <div class="m-foot">${ent ? `<button class="btn btn-danger" id="enDel">${ic('trash', 'i-sm')}Löschen</button><button class="btn btn-ghost" id="enFields">${ic('list', 'i-sm')}Felder</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="enSave">${ic('check', 'i-sm')}Speichern</button></div>`;
  };
  el.addEventListener('click', async e => {
    const ei = e.target.closest('[data-eic]'); if (ei) { collect(); st.icon = ei.dataset.eic; return render(); }
    if (e.target.closest('#enFields')) { closeLayer(el); AP.tab = 'felder'; AP.obj = 'obj:' + ent.id; return renderApBody(); }
    if (e.target.closest('#enDel')) {
      try { await needPerm('anpassen', 'Objekt löschen', `${ent.plural} und seine Felddefinitionen werden entfernt.`); CF.ents = await invoke('entity_delete', {id: ent.id}); } catch (err) { if (err?.message !== 'abgebrochen') toast('Nicht gelöscht', {t2: String(err), type: 'warn', dur: 6000}); return; }
      CF.defs = await invoke('fields_list', {object: null}); closeLayer(el); syncObjNav(); renderApBody(); return;
    }
    if (e.target.closest('#enSave')) {
      collect();
      if (!st.name || !st.plural) return toast('Name in Einzahl und Mehrzahl angeben', {type: 'warn'});
      let list; try { list = await invoke('entity_save', {entity: {id: ent?.id || '', name: st.name, plural: st.plural, icon: st.icon, title_field: st.title_field, count: 0}}); } catch (err) { return toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      const created = !ent && list.find(x => !CF.ents.some(o => o.id === x.id));
      CF.ents = list;
      if (created && tpl && ENT_TEMPLATES[tpl[0]]) {
        let pos = 0;
        for (const [label, type, required, options] of ENT_TEMPLATES[tpl[0]]) { try { CF.defs = await invoke('field_save', {field: {id: null, object: 'obj:' + created.id, key: '', label, type, options: options || [], required: !!required, at_pos: false, help: '', pos: pos++}}); } catch (err) { console.error(err); } }
      }
      closeLayer(el); syncObjNav(); renderApBody();
      toast(ent ? 'Objekt gespeichert' : 'Objekt angelegt', {t2: `${st.plural} · eigener Menüpunkt links`, type: 'pos', icon: st.icon, action: created ? {label: 'Öffnen', run: () => go('obj-' + created.id)} : undefined});
      Hooks.emit('config.entity.saved', {objekt: created?.id || ent?.id, name: st.plural});
    }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('#enSave', el).click(); } });
  render();
}

/* ════ Ansicht eines eigenen Objekts ════ */
const OV = {ent: null, q: '', rows: []};
const recTitle = (ent, r) => { const defs = cfDefs('obj:' + ent.id); const k = ent.title_field || defs[0]?.key; return String(r.data?.[k] ?? `#${r.id}`) || `#${r.id}`; };
async function renderObj(id) {
  const v = $('#view-obj'), ent = entById(id);
  if (!ent) { v.innerHTML = `<div class="cv"><div class="card"><div class="empty"><h3>Objekt nicht gefunden</h3></div></div></div>`; return; }
  if (OV.ent !== id) { OV.ent = id; OV.q = ''; }
  const defs = cfDefs('obj:' + id);
  v.innerHTML = `<div class="cv">
    <div class="cv-head"><div><h2 class="h-title">${esc(ent.plural)}</h2><div class="dash-meta" style="margin-top:6px"><span>Eigenes Objekt · ${defs.length} Felder · REST: <span class="mono">/api/v1/objekte/${esc(id)}</span></span></div></div>
      <div style="display:flex;gap:8px"><button class="btn btn-secondary" id="obCsv">${ic('download', 'i-sm')}CSV</button><button class="btn btn-ghost" id="obCfg">${ic('sliders', 'i-sm')}Felder</button><button class="btn btn-primary" id="obNew">${ic('plus', 'i-sm')}${esc(ent.name)} anlegen</button></div></div>
    <div class="cv-tools"><div style="max-width:360px;flex:1"><input class="input" id="obQ" placeholder="Suchen …" value="${esc(OV.q)}" autocomplete="off"></div></div>
    <div class="card" id="obList"><div style="padding:18px" class="thinking"><b>Lade …</b></div></div></div>`;
  await loadObjRows();
}
async function loadObjRows() {
  const ent = entById(OV.ent); if (!ent) return;
  try { OV.rows = await invoke('records_list', {entity: ent.id, q: OV.q || null}); } catch (e) { OV.rows = []; toast('Datensätze nicht geladen', {t2: String(e), type: 'warn'}); }
  const box = $('#obList'); if (!box) return;
  const defs = cfDefs('obj:' + ent.id).slice(0, 6);
  box.innerHTML = OV.rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">#</th>${defs.map(d => `<th class="${['zahl', 'betrag'].includes(d.type) ? 'r' : ''}">${esc(d.label)}</th>`).join('')}<th>Geändert</th></tr></thead><tbody>${OV.rows.map(r => `<tr data-rec="${r.id}" style="cursor:pointer"><td style="padding-left:16px" class="muted num">${r.id}</td>${defs.map((d, i) => `<td class="${['zahl', 'betrag'].includes(d.type) ? 'r num' : ''}" style="${i === 0 || d.key === ent.title_field ? 'font-weight:550' : ''}">${d.type === 'auswahl' && r.data[d.key] ? `<span class="pill">${esc(r.data[d.key])}</span>` : esc(cfShow(d, r.data[d.key]))}</td>`).join('')}<td class="muted" style="font-size:12px">${esc(fmtTs(r.updated_at))}${r.user ? ` · ${esc(r.user)}` : ''}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic(ent.icon || 'layers')}</div><h3>${OV.q ? 'Keine Treffer' : `Noch keine ${esc(ent.plural)}`}</h3><p>${defs.length ? 'Mit „anlegen“ den ersten Datensatz erfassen.' : 'Zuerst unter „Felder“ festlegen, was erfasst wird.'}</p></div>`;
}
function openRecord(ent, rec) {
  const defs = cfDefs('obj:' + ent.id);
  if (!defs.length) { toast('Noch keine Felder', {t2: 'Zuerst unter Anpassen → Felder festlegen', type: 'warn', action: {label: 'Felder', run: () => { AP.tab = 'felder'; AP.obj = 'obj:' + ent.id; go('anpassen'); }}}); return; }
  const el = openLayer(`<div class="drawer-panel" style="width:min(560px,100%)" role="dialog" aria-modal="true" aria-label="${esc(ent.name)}">
    <div class="m-head" style="padding-bottom:14px"><div class="m-ic">${ic(ent.icon || 'layers')}</div><div><h2>${rec ? esc(recTitle(ent, rec)) : `${esc(ent.name)} anlegen`}</h2><p>${rec ? `#${rec.id} · angelegt ${esc(fmtTs(rec.created_at))}${rec.user ? ` · zuletzt ${esc(rec.user)}` : ''}` : esc(ent.plural)}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="drawer-body">${cfHTML('obj:' + ent.id, rec?.data || {}, false, 'Angaben')}</div>
    <div class="m-foot" style="border-top:1px solid var(--line);padding-top:14px">${rec ? `<button class="btn btn-danger" id="rcDel">${ic('trash', 'i-sm')}Löschen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="rcSave">${ic('check', 'i-sm')}Speichern</button></div></div>`, {cls: 'drawer'});
  el.addEventListener('click', async e => {
    if (e.target.closest('#rcDel')) {
      try { await stepUp({title: `${ent.name} löschen`, text: `#${rec.id} „${recTitle(ent, rec)}“ wird endgültig gelöscht.`}); await invoke('record_delete', {entity: ent.id, id: rec.id}); } catch (err) { if (err?.message !== 'abgebrochen') toast('Nicht gelöscht', {t2: String(err), type: 'warn'}); return; }
      closeLayer(el); Hooks.emit(`objekt.${ent.id}.deleted`, {id: rec.id}); await refreshEntCounts(); loadObjRows(); return;
    }
    if (e.target.closest('#rcSave')) {
      const vals = await cfCheck('obj:' + ent.id, cfRead(el, 'obj:' + ent.id)); if (!vals) return;
      let saved; try { saved = await invoke('record_save', {entity: ent.id, id: rec?.id ?? null, data: vals, user: S.user.name}); } catch (err) { return toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      closeLayer(el); toast(rec ? 'Gespeichert' : `${ent.name} angelegt`, {t2: `#${saved.id} · ${recTitle(ent, saved)}`, type: 'pos', icon: ent.icon || 'layers'});
      Hooks.emit(`objekt.${ent.id}.saved`, {id: saved.id, neu: !rec, objekt: ent.id, ...saved.data});
      await refreshEntCounts(); if (S.view === 'obj-' + ent.id) loadObjRows();
    }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('#rcSave', el).click(); } });
}
async function refreshEntCounts() { try { CF.ents = await invoke('entities_list'); syncObjNav(); } catch { /* */ } }
function objCsv() {
  const ent = entById(OV.ent); if (!ent) return;
  const defs = cfDefs('obj:' + ent.id), q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const csv = [['Nr', ...defs.map(d => d.label), 'Angelegt', 'Geändert', 'Benutzer'].map(q).join(';'), ...OV.rows.map(r => [r.id, ...defs.map(d => cfShow(d, r.data[d.key])), fmtTs(r.created_at), fmtTs(r.updated_at), r.user || ''].map(q).join(';'))].join('\r\n');
  invoke('save_text', {name: `Kontor_${ent.plural.replace(/\W+/g, '')}.csv`, content: '﻿' + csv, title: `${ent.plural} exportieren`}).then(p => p && toast('Exportiert', {t2: p, type: 'pos', icon: 'download'})).catch(e => toast('Export fehlgeschlagen', {t2: String(e), type: 'warn'}));
}

function bindCustom() {
  const ap = $('#view-anpassen');
  ap.addEventListener('click', async e => {
    const t = e.target;
    const tab = t.closest('[data-apt]'); if (tab) { AP.tab = tab.dataset.apt; return renderApBody(); }
    const o = t.closest('[data-apo]'); if (o) { AP.obj = o.dataset.apo; return renderApBody(); }
    if (t.closest('#apFieldNew')) return openFieldEditor(null);
    if (t.closest('.dnd-grip')) return;
    const mv = t.closest('[data-fmove]'); if (mv) { e.stopPropagation(); return moveField(+mv.dataset.fmove, +mv.dataset.dir); }
    const fd = t.closest('[data-fdef]'); if (fd) return openFieldEditor(CF.defs.find(d => d.id === +fd.dataset.fdef));
    if (t.closest('#apEntNew')) return openEntityEditor(null);
    const tp = t.closest('[data-enttpl]'); if (tp) return openEntityEditor(null, tp.dataset.enttpl.split('|'));
    const eo = t.closest('[data-entopen]'); if (eo) { e.stopPropagation(); return go('obj-' + eo.dataset.entopen); }
    const en = t.closest('[data-ent]'); if (en) return openEntityEditor(entById(en.dataset.ent));
  });
  const ov = $('#view-obj');
  ov.addEventListener('click', e => {
    const ent = entById(OV.ent); if (!ent) return;
    if (e.target.closest('#obNew')) return openRecord(ent, null);
    if (e.target.closest('#obCsv')) return objCsv();
    if (e.target.closest('#obCfg')) { AP.tab = 'felder'; AP.obj = 'obj:' + ent.id; return go('anpassen'); }
    const r = e.target.closest('[data-rec]'); if (r) return openRecord(ent, OV.rows.find(x => x.id === +r.dataset.rec));
  });
  let tm; ov.addEventListener('input', e => { if (e.target.id === 'obQ') { OV.q = e.target.value.trim(); clearTimeout(tm); tm = setTimeout(loadObjRows, 180); } });
}
