
/* ════════════════════════════════════════════════════════════════════
   39 · ERWEITERUNGEN — installierbare Pakete (kontor.erweiterung/v1).
   Eine Erweiterung bringt Objekte, Felder, Regeln, Skripte, API-Endpunkte,
   Dashboard-Widgets und Befehle mit. Widgets werden von Kontor selbst
   gezeichnet (Liste, Kennzahl, Tabelle) – fremder Code läuft nur in der
   Skript-Sandbox, nie im Programm selbst.
   ════════════════════════════════════════════════════════════════════ */
const EXT = {list: [], data: {}, busy: {}};
const EXT_GALERIE = [
  {format: 'kontor.erweiterung/v1', id: 'kontor.werkstatt', name: 'Werkstatt & Service', version: '1.0.0', author: 'Kontor', icon: 'wrench',
    beschreibung: 'Reparatur- und Serviceaufträge mit Status, Abholtermin und Preis. Automatische E-Mail, sobald ein Auftrag abholbereit ist. Dashboard-Widget „Offene Aufträge“.',
    objekte: [{name: 'Reparaturauftrag', plural: 'Reparaturaufträge', icon: 'wrench', felder: [['Kunde', 'text', true], ['Telefon', 'telefon'], ['E-Mail', 'email'], ['Gegenstand', 'text', true], ['Auftrag', 'mehrzeilig'], ['Status', 'auswahl', true, ['Angenommen', 'In Arbeit', 'Abholbereit', 'Abgeholt']], ['Fertig bis', 'datum'], ['Preis', 'betrag']]}],
    regeln: [{name: 'Abholbereit → Kunde informieren', trigger: 'objekt.reparaturauftraege.saved', conditions: [{feld: 'status', op: '=', wert: 'Abholbereit'}, {feld: 'e_mail', op: 'nicht leer', wert: ''}], actions: [{typ: 'mail', an: '{{e_mail}}', betreff: 'Ihr Auftrag ist abholbereit', text: 'Guten Tag {{kunde}},\n\nIhr Auftrag „{{gegenstand}}“ ist fertig und kann abgeholt werden.\n\nIhr Team von {{filiale}}'}, {typ: 'hinweis', text: 'Kund:in informiert: {{kunde}}', text2: '{{gegenstand}} ist abholbereit'}]}],
    widgets: [{id: 'offen', titel: 'Offene Reparaturen', typ: 'liste', icon: 'wrench', quelle: {objekt: 'reparaturauftraege', filter: {feld: 'status', op: '≠', wert: 'Abgeholt'}}, felder: {titel: 'gegenstand', untertitel: 'kunde', wert: 'status'}, leer: 'Keine offenen Aufträge'}],
    befehle: [{titel: 'Neuer Reparaturauftrag', icon: 'wrench', oeffnen: 'obj-reparaturauftraege'}]},
  {format: 'kontor.erweiterung/v1', id: 'kontor.kennzahlen', name: 'Kassen-Kennzahlen', version: '1.0.0', author: 'Kontor', icon: 'chart',
    beschreibung: 'Widgets für Bons heute, Umsatz je Kassier:in und meistverkaufte Artikel der Woche – direkt aus den Belegen.',
    widgets: [
      {id: 'bons', titel: 'Bons heute', typ: 'kennzahl', icon: 'receipt', groesse: ['s', 'm'], quelle: {abfrage: "SELECT COUNT(*) AS wert FROM sales WHERE kind = 'verkauf' AND substr(ts,1,10) = date('now','localtime')"}, einheit: 'Bons'},
      {id: 'kassier', titel: 'Umsatz je Kassier:in heute', typ: 'tabelle', icon: 'users', quelle: {abfrage: "SELECT COALESCE(cashier,'–') AS \"Kassier:in\", COUNT(*) AS Bons, printf('€ %.2f', SUM(total)/100.0) AS Umsatz FROM sales WHERE substr(ts,1,10) = date('now','localtime') GROUP BY cashier ORDER BY SUM(total) DESC"}, leer: 'Heute noch kein Umsatz'},
      {id: 'woche', titel: 'Renner der Woche', typ: 'liste', icon: 'star', quelle: {abfrage: "SELECT json_extract(l.value,'$.name') AS titel, SUM(json_extract(l.value,'$.qty')) || ' Stück' AS wert FROM sales s, json_each(s.data,'$.lines') l WHERE s.kind = 'verkauf' AND s.ts >= date('now','-7 days') AND json_extract(l.value,'$.service') = 0 GROUP BY titel ORDER BY SUM(json_extract(l.value,'$.qty')) DESC LIMIT 6"}, felder: {titel: 'titel', wert: 'wert'}, leer: 'Noch keine Verkäufe diese Woche'}]},
  {format: 'kontor.erweiterung/v1', id: 'kontor.geburtstag', name: 'Geburtstags-Bonus', version: '1.0.0', author: 'Kontor', icon: 'gift',
    beschreibung: 'Feld „Geburtstag“ bei Kund:innen. Wird am Geburtstag eine Kundin an der Kasse zugeordnet, erscheint ein Hinweis und es werden 100 Bonuspunkte gebucht.',
    felder: [{object: 'kunde', label: 'Geburtstag', type: 'datum', at_pos: true}],
    skripte: [{name: 'geburtstag.js', code: "const g = daten.feld && daten.feld['Geburtstag'];\nconst heute = new Date();\nconst md = String(heute.getMonth() + 1).padStart(2, '0') + '-' + String(heute.getDate()).padStart(2, '0');\nif (g && String(g).slice(5, 10) === md) {\n  toast('Heute Geburtstag: ' + daten.kunde_name, 'Herzlichen Glückwunsch – 100 Bonuspunkte gebucht');\n  punkte(100, 'Geburtstagsbonus');\n}\n"}],
    regeln: [{name: 'Geburtstag an der Kasse', trigger: 'pos.customer.attached', conditions: [], actions: [{typ: 'skript', skriptName: 'geburtstag.js'}]}]},
];
const pl = (n, w) => `${n} ${n === 1 ? w : ({Objekt: 'Objekte', Feld: 'Felder', Regel: 'Regeln', Skript: 'Skripte', Endpunkt: 'Endpunkte', Widget: 'Widgets', Befehl: 'Befehle'})[w] || w}`;
const extTag = m => ` [${m.name}]`;
const extOn = () => EXT.list.filter(e => e.enabled);
async function loadExtensions() {
  if (!DESKTOP) return;
  try { EXT.list = await invoke('ext_list'); } catch { EXT.list = []; }
  registerExtWidgets();
}

/* ── Installation: Bestandteile über die normalen Funktionen anlegen ── */
async function extApply(m) {
  const log = [];
  for (const o of m.objekte || []) {
    let ent = CF.ents.find(e => e.plural === o.plural || e.name === o.name);
    if (!ent) { CF.ents = await invoke('entity_save', {entity: {id: '', name: o.name, plural: o.plural, icon: o.icon || 'layers', title_field: null, count: 0}}); ent = CF.ents.find(e => e.plural === o.plural); log.push(`Objekt ${o.plural}`); }
    let pos = cfDefs('obj:' + ent.id).length;
    for (const [label, type, required, options] of o.felder || []) {
      if (cfDefs('obj:' + ent.id).some(d => d.label === label)) continue;
      try { CF.defs = await invoke('field_save', {field: {id: null, object: 'obj:' + ent.id, key: '', label, type, options: options || [], required: !!required, at_pos: false, help: '', pos: pos++}}); } catch (e) { console.warn(e); }
    }
  }
  for (const f of m.felder || []) {
    if (cfDefs(f.object).some(d => d.label === f.label)) continue;
    try { CF.defs = await invoke('field_save', {field: {id: null, object: f.object, key: '', label: f.label, type: f.type || 'text', options: f.options || [], required: !!f.required, at_pos: !!f.at_pos, help: f.help || '', pos: cfDefs(f.object).length}}); log.push(`Feld ${f.label}`); } catch (e) { console.warn(e); }
  }
  for (const sc of m.skripte || []) { const ex = AU.scripts.find(x => x.name === sc.name); AU.scripts = await invoke('script_save', {script: {id: ex?.id ?? null, name: sc.name, code: sc.code}}); }
  for (const r of m.regeln || []) {
    const name = r.name + extTag(m), ex = AU.rules.find(x => x.name === name);
    const actions = (r.actions || []).map(a => a.skriptName ? {typ: 'skript', skript: AU.scripts.find(s => s.name === a.skriptName)?.id} : a);
    AU.rules = await invoke('rule_save', {rule: {id: ex?.id ?? null, name, trigger: r.trigger, conditions: r.conditions || [], actions, active: true, runs: ex?.runs || 0, last_run: ex?.last_run || null, last_error: null}});
    log.push(`Regel ${r.name}`);
  }
  for (const p of m.endpunkte || []) { try { await invoke('api_endpoint_save', {id: null, slug: p.slug, title: p.title || p.slug, sql: p.sql, active: true}); log.push(`Endpunkt ${p.slug}`); } catch (e) { console.warn(e); } }
  syncObjNav();
  return log;
}
async function extInstall(m, src = 'Galerie') {
  try { await needPerm('anpassen', `Erweiterung installieren`, `${m.name} ${m.version} von ${m.author || 'unbekannt'}`); } catch { return; }
  try {
    EXT.list = await invoke('ext_install', {manifest: m, by: S.user.name});
    const log = await extApply(m);
    registerExtWidgets();
    toast(`${m.name} installiert`, {t2: [...log, (m.widgets || []).length ? `${pl(m.widgets.length, 'Widget')} in der Bibliothek` : ''].filter(Boolean).join(' · ') || 'bereit', type: 'pos', icon: m.icon || 'puzzle', dur: 7000});
    Hooks.emit('extension.installed', {erweiterung: m.id, version: m.version, quelle: src});
  } catch (e) { toast('Installation fehlgeschlagen', {t2: String(e), type: 'warn', dur: 8000}); }
  if (S.view === 'erweiterungen') renderErweiterungen();
}
async function extToggle(id, on) {
  try { EXT.list = await invoke('ext_enable', {id, on}); } catch (e) { return toast('Fehler', {t2: String(e), type: 'warn'}); }
  const m = EXT.list.find(e => e.id === id)?.manifest;
  for (const r of AU.rules.filter(r => m && r.name.endsWith(extTag(m)))) { try { AU.rules = await invoke('rule_save', {rule: {...r, active: on}}); } catch { /* */ } }
  registerExtWidgets(); renderErweiterungen();
}
async function extRemove(id) {
  const e = EXT.list.find(x => x.id === id), m = e?.manifest || {};
  try { await needPerm('anpassen', 'Erweiterung entfernen', `${e.name}: Regeln, Skripte, Widgets und Befehle werden entfernt. Eigene Objekte, Felder und deren Daten bleiben erhalten.`); } catch { return; }
  for (const r of AU.rules.filter(r => r.name.endsWith(extTag(m)))) { try { AU.rules = await invoke('rule_delete', {id: r.id}); } catch { /* */ } }
  for (const sc of m.skripte || []) { const x = AU.scripts.find(s => s.name === sc.name); if (x) { try { AU.scripts = await invoke('script_delete', {id: x.id}); } catch { /* */ } } }
  try { EXT.list = await invoke('ext_remove', {id}); } catch (err) { return toast('Fehler', {t2: String(err), type: 'warn'}); }
  registerExtWidgets(); toast('Erweiterung entfernt', {t2: e.name, icon: 'trash'}); Hooks.emit('extension.removed', {erweiterung: id});
  renderErweiterungen();
}

/* ── Widgets der Erweiterungen (von Kontor gezeichnet) ── */
function registerExtWidgets() {
  Object.keys(W).filter(k => k.startsWith('x:')).forEach(k => delete W[k]);
  for (const e of extOn()) for (const w of e.manifest.widgets || []) {
    const key = `x:${e.id}:${w.id}`;
    W[key] = {title: w.titel, cat: 'Erweiterungen', icon: w.icon || e.manifest.icon || 'puzzle', desc: `${e.name} · ${w.typ === 'kennzahl' ? 'Kennzahl' : w.typ === 'tabelle' ? 'Tabelle' : 'Liste'}`, sizes: w.groesse || (w.typ === 'kennzahl' ? ['s', 'm'] : ['tall', 'wide']), plugin: `${e.name} ${e.version}`,
      sub: () => e.name, body: () => extWidgetBody(key, w)};
  }
}
async function extFetch(key, w) {
  if (EXT.busy[key]) return; EXT.busy[key] = true;
  let rows = [];
  try {
    if (w.quelle?.objekt) {
      rows = (await invoke('records_list', {entity: w.quelle.objekt, q: null})).map(r => ({id: r.id, ...r.data}));
      const f = w.quelle.filter; if (f) rows = rows.filter(r => condOk({feld: f.feld, op: f.op, wert: f.wert}, r));
    } else if (w.quelle?.abfrage) rows = await invoke('api_query_test', {sql: w.quelle.abfrage, args: {}});
  } catch (e) { rows = {fehler: String(e)}; }
  EXT.data[key] = {rows, t: Date.now()}; EXT.busy[key] = false;
  (Dash.layout || []).filter(it => it.t === key).forEach(it => rerenderWidget(it.id));
}
function extWidgetBody(key, w) {
  const d = EXT.data[key];
  if (!d || Date.now() - d.t > 60000) extFetch(key, w);
  if (!d) return `<div class="empty" style="flex:1"><span class="thinking"><b>Lade …</b></span></div>`;
  if (d.rows?.fehler) return `<div class="empty" style="flex:1"><p style="color:var(--neg)">${esc(d.rows.fehler)}</p></div>`;
  const rows = d.rows || [];
  if (!rows.length) return `<div class="empty" style="flex:1"><div class="empty-icon" style="color:var(--pos)">${ic('check')}</div><p>${esc(w.leer || 'Keine Einträge')}</p></div>`;
  if (w.typ === 'kennzahl') { const v = Object.values(rows[0])[0]; return `<div style="display:flex;flex-direction:column;justify-content:center;flex:1;padding:4px 2px"><div class="kpi-v" style="font-size:40px;font-weight:650;letter-spacing:-.03em">${esc(typeof v === 'number' ? num(v) : v)}</div><div class="muted" style="font-size:12.5px">${esc(w.einheit || '')}</div></div>`; }
  if (w.typ === 'tabelle') { const cols = Object.keys(rows[0]); return `<div style="overflow:auto;flex:1"><table class="tbl" style="margin:0"><thead><tr>${cols.map((c, i) => `<th class="${i ? 'r' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 12).map(r => `<tr>${cols.map((c, i) => `<td class="${i ? 'r num' : ''}" style="${i ? '' : 'font-weight:550'}">${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
  const f = w.felder || (k => ({titel: k[0], wert: k[1], untertitel: k[2]}))(Object.keys(rows[0]));
  return `<div class="wl">${rows.slice(0, 6).map(r => `<div class="wl-row"><div class="wl-main"><div class="wl-t">${esc(r[f.titel] ?? '')}</div>${f.untertitel ? `<div class="wl-s">${esc(r[f.untertitel] ?? '')}</div>` : ''}</div>${f.wert ? `<span class="pill">${esc(r[f.wert] ?? '')}</span>` : ''}</div>`).join('')}${rows.length > 6 ? `<div class="muted" style="font-size:12px;padding:6px 2px">+ ${rows.length - 6} weitere</div>` : ''}</div>`;
}
// Vorschau-Widgets der Browser-Demo durch echte Erweiterungen ersetzen
if (DESKTOP) { delete W['ext.repairs']; }

/* ── Befehle in der Befehlspalette ── */
{
  const _cl = cmdList;
  cmdList = function () {
    const extra = [{group: 'Navigation', label: 'Erweiterungen', icon: 'puzzle', view: 'erweiterungen', run: () => go('erweiterungen'), kw: 'plugins installieren galerie'}];
    for (const e of extOn()) for (const b of e.manifest.befehle || []) extra.push({group: e.name, label: b.titel, icon: b.icon || 'puzzle', kw: 'erweiterung', run: () => runExtCommand(e, b)});
    return [..._cl(), ...extra];
  };
}
async function runExtCommand(e, b) {
  if (b.oeffnen) return go(b.oeffnen);
  if (b.skript) {
    const ctx = ruleContext('befehl', {benutzer: S.user.name});
    const r = await runScript(b.skript, 'befehl', ctx);
    for (const a of r.actions || []) { try { await doAction(a, ctx, {name: e.name}); } catch (err) { toast('Befehl: Fehler', {t2: String(err), type: 'warn'}); } }
    if (!r.ok) toast(`${e.name}: ${r.error}`, {type: 'warn'});
  }
}

/* ── Seite „Erweiterungen“ ── */
for (let i = PH_VIEWS.length - 1; i >= 0; i--) if (PH_VIEWS[i] === 'erweiterungen') PH_VIEWS.splice(i, 1);
NAV.splice(NAV.findIndex(n => n.id === 'anpassen') + 1, 0, {id: 'erweiterungen', label: 'Erweiterungen', icon: 'puzzle'});
registerPage('erweiterungen', {title: 'Erweiterungen', sub: () => `${EXT.list.length} installiert`, render: renderErweiterungen});
function renderErweiterungen() {
  const v = $('#view-erweiterungen');
  if (!DESKTOP) { v.innerHTML = desktopEmpty('puzzle', 'Erweiterungen'); return; }
  const inst = id => EXT.list.find(e => e.id === id);
  const parts = m => [(m.objekte || []).length && pl(m.objekte.length, 'Objekt'), (m.felder || []).length && pl(m.felder.length, 'Feld'), (m.regeln || []).length && pl(m.regeln.length, 'Regel'), (m.skripte || []).length && pl(m.skripte.length, 'Skript'), (m.endpunkte || []).length && pl(m.endpunkte.length, 'Endpunkt'), (m.widgets || []).length && pl(m.widgets.length, 'Widget'), (m.befehle || []).length && pl(m.befehle.length, 'Befehl')].filter(Boolean).join(' · ');
  v.innerHTML = `<div class="cv">${pageHead('Erweiterungen', 'Zusätzliche Funktionen installieren – Objekte, Regeln, Widgets und Befehle in einem Paket', `<button class="btn btn-secondary" data-ex="datei">${ic('download', 'i-sm')}Aus Datei installieren …</button>`)}
    <h3 style="font-size:14px;margin:4px 0 10px">Installiert</h3>
    <div class="card">${EXT.list.length ? EXT.list.map(e => `<div class="set-row"><div style="display:flex;gap:12px;align-items:center;min-width:0"><span class="reg-ic">${ic(e.manifest.icon || 'puzzle', 'i-sm')}</span><div style="min-width:0"><div class="set-l">${esc(e.name)} <span class="muted" style="font-weight:400">${esc(e.version)} · ${esc(e.author || '')}</span></div><div class="set-h">${esc(parts(e.manifest))}</div></div></div><div class="set-c" style="gap:8px"><button class="switch" role="switch" data-exon="${esc(e.id)}" aria-checked="${e.enabled}" aria-label="aktiv"></button><button class="btn btn-ghost btn-sm" data-exrm="${esc(e.id)}">${ic('trash', 'i-sm')}</button></div></div>`).join('')
      : '<div class="empty" style="padding:28px"><p>Noch keine Erweiterung installiert.</p></div>'}</div>
    <h3 style="font-size:14px;margin:22px 0 10px">Galerie</h3>
    <div class="ds-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">${EXT_GALERIE.map(m => `<div class="card" style="padding:18px;display:flex;flex-direction:column;gap:10px"><div style="display:flex;gap:12px;align-items:center"><span class="reg-ic" style="color:var(--accent)">${ic(m.icon, 'i-sm')}</span><div><b>${esc(m.name)}</b><div class="muted" style="font-size:12px">${esc(m.version)} · ${esc(m.author)}</div></div></div><p style="margin:0;font-size:13px;color:var(--text-2);flex:1">${esc(m.beschreibung)}</p><div class="muted" style="font-size:12px">${esc(parts(m))}</div><div>${inst(m.id) ? `<span class="pill pos">${ic('check')}installiert</span>${inst(m.id).version !== m.version ? ` <button class="btn btn-secondary btn-sm" data-exg="${esc(m.id)}">Aktualisieren</button>` : ''}` : `<button class="btn btn-primary btn-sm" data-exg="${esc(m.id)}">${ic('download', 'i-sm')}Installieren</button>`}</div></div>`).join('')}</div>
    <div class="prompt-hint blk" style="margin-top:14px">${ic('info', 'i-xs')}Eigene Erweiterungen sind JSON-Dateien im Format <span class="mono">kontor.erweiterung/v1</span> (Objekte, Felder, Regeln, Skripte, Endpunkte, Widgets, Befehle). Skripte laufen in der Sandbox ohne Datei- und Netzwerkzugriff; Abfragen sind nur lesend.</div></div>`;
}
function bindExtensions() {
  $('#view-erweiterungen').addEventListener('click', async e => {
    const g = e.target.closest('[data-exg]'); if (g) return extInstall(EXT_GALERIE.find(m => m.id === g.dataset.exg));
    const on = e.target.closest('[data-exon]'); if (on) return extToggle(on.dataset.exon, on.getAttribute('aria-checked') !== 'true');
    const rm = e.target.closest('[data-exrm]'); if (rm) return extRemove(rm.dataset.exrm);
    if (e.target.closest('[data-ex="datei"]')) {
      let txt; try { txt = await invoke('open_text', {title: 'Erweiterung installieren', ext: 'json'}); } catch (err) { return toast('Datei nicht lesbar', {t2: String(err), type: 'warn'}); }
      if (!txt) return;
      let m; try { m = JSON.parse(txt); } catch { return toast('Keine gültige Erweiterung', {type: 'warn'}); }
      if (m.format !== 'kontor.erweiterung/v1') return toast('Keine Kontor-Erweiterung', {t2: 'format „kontor.erweiterung/v1“ fehlt', type: 'warn'});
      extInstall(m, 'Datei');
    }
  });
}
