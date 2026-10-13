/* ═════════════════════════════════════════════════════════════════
   55 · BENUTZERGRUPPEN (Stammdaten › Benutzer › Benutzergruppen) – Liste und Maske mit Reitern
   Eine Gruppe wirkt auf ihre Mitglieder:
   • Rolle ……………………………… Grundrechte (Rollen & Rechte); wird beim Zuordnen gesetzt
   • Sonderberechtigungen / Kassenberechtigungen … je Recht „wie Rolle“, „erlaubt“ oder „gesperrt“
   • Rechte-Verwaltung ………….. Menüpunkte, die die Mitglieder nicht sehen und nicht öffnen können
   • Benutzer ………………………… Mitglieder (eine Person gehört zu höchstens einer Gruppe), neue Person direkt in der Gruppe anlegen
   • Filialen ………………………… Anmeldung nur an diesen Filialen (eigene Zuordnung der Person geht vor)
   Administratoren sind von Abweichungen und Sperren ausgenommen (keine Selbstsperre).
   ═════════════════════════════════════════════════════════════════ */
const GE = {id: null, ids: [], d: null, orig: null, tab: 'allg', dirty: false, open: new Set(), q: ''};
const GE_TABS = [['allg', 'Allgemein'], ['bereiche', 'Rechte-Verwaltung'], ['sonder', 'Sonderberechtigungen'], ['kasse', 'Kassenberechtigungen'], ['personen', 'Benutzer'], ['filialen', 'Filialen']];
/** Rechte mit Beschriftung (Rückfall für die Vorschau; in der Desktop-App kommen sie aus der Datenbank) */
const GE_PERMS = [['kasse.verkaufen', 'An der Kasse verkaufen'], ['kasse.retoure', 'Retouren buchen'], ['kasse.kassenbuch', 'Kassenbuch und Tagesabschluss'], ['artikel.bearbeiten', 'Artikel anlegen und bearbeiten'], ['preise.aktionen', 'Preisaktionen verwalten'],
  ['bestand.buchen', 'Bestand buchen und Inventur'], ['einkauf', 'Einkauf, Bestellungen, Wareneingang'], ['rechnungen', 'Eingangsrechnungen und Zahlungen'], ['faktura', 'Faktura: Angebote, Aufträge, Lieferscheine, Rechnungen'],
  ['marketing', 'Kampagnen, Rabattregeln, Sales-Aktionen, Schaufenster'], ['kunden.bearbeiten', 'Kunden anlegen und bearbeiten'], ['berichte', 'Berichte, Dashboard-Zahlen, Exporte'], ['anpassen', 'Felder, Objekte, Regeln, Webhooks, API'],
  ['einstellungen', 'Einstellungen ändern'], ['system', 'Benutzer, Rechte, Sicherung, RKSV, Updates']];
const gePerms = () => SEC.perms?.length ? SEC.perms.map(p => [p.perm, p.label]) : GE_PERMS;
const GE_KASSE = ['kasse.verkaufen', 'kasse.retoure', 'kasse.kassenbuch'];
const GE_SONDER = [['Waren & Einkauf', ['artikel.bearbeiten', 'preise.aktionen', 'bestand.buchen', 'einkauf', 'rechnungen', 'faktura']], ['Kunden & Marketing', ['kunden.bearbeiten', 'marketing']], ['Auswertung & System', ['berichte', 'anpassen', 'einstellungen', 'system']]];
const geBase = (perm, role) => SEC.roles ? !!SEC.roles[role]?.[perm] : (role === 'admin' || role === 'leitung' || (PERM_DEFAULT[role] || []).includes(perm));
const geNames = l => (l || []).filter(Boolean);
const geSame = (a, b) => norm(a) === norm(b);
const geUid = () => Math.random().toString(36).slice(2, 8);

/* ── Zustand ── */
const geRec = g => ({id: g.id, name: g.name || '', beschreibung: g.beschreibung || '', rolle: ROLE_NAMES[g.rolle] ? g.rolle : 'verkauf',
  rechte: Object.fromEntries(Object.entries(g.rechte || {}).filter(([, v]) => v === 'ja' || v === 'nein')), gesperrt: [...(g.gesperrt || [])], mitglieder: geNames(g.mitglieder), filialen: geNames(g.filialen), _aktiv: g._aktiv !== false});
const geNeu = () => ({id: '', name: '', beschreibung: '', rolle: 'verkauf', rechte: {}, gesperrt: [], mitglieder: [], filialen: [], _aktiv: true});
const geDraft = id => { const g = id ? stRows('benutzergruppe').find(x => x.id === id) : null; return g ? geRec(g) : geNeu(); };
const geClone = d => JSON.parse(JSON.stringify(d));
const geAbw = d => { const v = Object.values(d.rechte || {}); return {ja: v.filter(x => x === 'ja').length, nein: v.filter(x => x === 'nein').length}; };
const geAbwText = d => { const a = geAbw(d); return [a.ja && `${a.ja} erlaubt`, a.nein && `${a.nein} gesperrt`].filter(Boolean).join(' · ') || 'wie Rolle'; };
const geStoreNames = d => { const n = (d.filialen || []).map(id => STORES.find(s => s.id === id)?.name).filter(Boolean); return n.length ? n.join(', ') : 'Alle'; };

/* ── Liste ── */
function geRows() {
  return stRows('benutzergruppe').map(g => ({id: g.id, name: g.name || g.id, beschreibung: g.beschreibung || '', rolle: ROLE_NAMES[g.rolle] || g.rolle || '', personen: geNames(g.mitglieder).length, mitglieder: geNames(g.mitglieder).join(', '),
    filialen: geStoreNames(g), rechte: geAbwText(g), menues: (g.gesperrt || []).length ? `${g.gesperrt.length} gesperrt` : 'alle'}));
}
agridPage('st-benutzergruppe', {
  title: 'Benutzergruppen', rows: geRows, count: () => stRows('benutzergruppe').length, sort: {k: 'name', dir: 1}, rowH: 44,
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'name', l: 'Name', w: 200}, {k: 'beschreibung', l: 'Beschreibung', w: 260}, {k: 'rolle', l: 'Rolle', w: 140}, {k: 'personen', l: 'Personen', t: 'num', w: 90}, {k: 'mitglieder', l: 'Mitglieder', w: 280},
    {k: 'filialen', l: 'Filialen', w: 170}, {k: 'rechte', l: 'Rechte', w: 170}, {k: 'menues', l: 'Menüpunkte', w: 130}],
  remove: ids => geRemove(ids),
  actions: {back: () => e2Back(), refresh: () => PAGES['st-benutzergruppe'].render(true), new: () => geOpen(null, [])},
  edit: id => geOpen(id, (AG['st-benutzergruppe'].filtered || []).map(r => r.id)),
});
{ const p = PAGES['st-benutzergruppe'], _r = p.render; p.render = async fresh => { await usrLoad(fresh === true); await _r(); renderTopbar(); }; }
VIEW_PERM['st-benutzergruppe'] = 'system';

/* ── Maske ── */
function geOpen(id, ids) {
  GE.id = id; GE.ids = ids?.length ? ids : GE.ids; GE.d = geDraft(id); GE.orig = geClone(GE.d); GE.tab = 'allg'; GE.dirty = false; GE.q = '';
  if (S.view === 'benutzergruppe-edit') geRender(); else go('benutzergruppe-edit');
}
registerPage('benutzergruppe-edit', {title: 'Benutzergruppen', sub: () => GE.d ? (GE.d.name || 'neue Gruppe') : '', render: async () => {
  if (!GE.d) { setTimeout(() => go('st-benutzergruppe'), 0); return; }
  $('#view-benutzergruppe-edit').innerHTML = '<div class="muted" style="padding:24px">Lade …</div>';
  await usrLoad(); geRender(); renderTopbar();
}});
VIEW_PERM['benutzergruppe-edit'] = 'system';
NAV_CHILD['benutzergruppe-edit'] = 'st-benutzergruppe';
leaveGuard('benutzergruppe-edit', () => GE.dirty, () => { GE.dirty = false; GE.d = geDraft(GE.id); GE.orig = geClone(GE.d); });

const geIn = (k, l, o = {}) => `<label class="field"><span>${esc(l)}</span>${o.area ? `<textarea class="input" data-ge="${k}" rows="${o.rows || 5}" autocomplete="off">${esc(GE.d[k] ?? '')}</textarea>` : `<input class="input" data-ge="${k}" value="${esc(GE.d[k] ?? '')}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} autocomplete="off">`}${o.hint ? `<small class="ea-hint">${esc(o.hint)}</small>` : ''}</label>`;
const geCard = (h, inner, cls = '') => `<div class="ae-card ea-card ${cls}">${h ? `<h4>${esc(h)}</h4>` : ''}${inner}</div>`;
const geMiss = d => { const m = []; if (String(d.name).trim().length < 2) m.push(['allg', 'Name']); return m; };

function geAllg() {
  const D = GE.d, a = geAbw(D), mit = geNames(D.mitglieder);
  const fact = (l, v) => `<div class="ge-fact"><span>${esc(l)}</span><b>${v}</b></div>`;
  return {html: `<div class="ue-cols2 ge-2">
    ${geCard('Benutzergruppe', `<div class="ea-fields ge-one">${geIn('name', 'Name *', {hint: 'Eindeutiger Name, z. B. „Kassenpersonal“ oder „Einkauf“.'})}${geIn('beschreibung', 'Beschreibung', {area: true})}
      <div class="field"><span>Rolle *</span><select class="input select" data-ge="rolle">${Object.entries(ROLE_NAMES).map(([k, l]) => `<option value="${k}" ${D.rolle === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <small class="ea-hint">Grundrechte der Mitglieder (siehe „Rollen & Rechte“). Wer der Gruppe zugeordnet wird, bekommt diese Rolle. Einzelne Rechte lassen sich auf den Reitern „Sonderberechtigungen“ und „Kassenberechtigungen“ abwandeln.</small></div></div>`)}
    ${geCard('Das bewirkt die Gruppe', `<div class="ge-facts">${fact('Personen', mit.length ? `${mit.length} · ${esc(mit.join(', '))}` : 'noch niemand')}${fact('Rolle', esc(ROLE_NAMES[D.rolle]))}
      ${fact('Rechte', a.ja || a.nein ? `${a.ja ? `${a.ja} zusätzlich erlaubt` : ''}${a.ja && a.nein ? ', ' : ''}${a.nein ? `${a.nein} gesperrt` : ''}` : 'wie die Rolle')}${fact('Menüpunkte', D.gesperrt.length ? `${D.gesperrt.length} gesperrt` : 'alle zugänglich')}${fact('Anmeldung an', esc(geStoreNames(D)))}</div>
      <p class="ea-hint">Administratoren sind von Abweichungen und Sperren ausgenommen – so kann sich niemand selbst aussperren.</p>`)}
  </div>`};
}

/* Rechte-Verwaltung: Menüpunkte je Bereich (Baum mit Häkchen „Zugeordnet“) */
function geTree() {
  const areas = []; let cur = null;
  const mk = (n, path) => n.kids ? (kids => ({key: path + '/' + n.label, label: n.label, icon: n.icon, kids, ids: kids.flatMap(k => k.ids)}))(n.kids.map(k => mk(k, path + '/' + n.label))) : {key: n.id, label: n.label, icon: n.icon, kids: null, ids: [n.id]};
  for (const n of NAV) {
    if (n.g) { cur = {key: 'a:' + n.g, label: n.g, icon: (NAV_GROUP_STYLE[n.g] || ['folder'])[0], kids: [], ids: []}; areas.push(cur); continue; }
    if (!cur || (!n.kids && !n.id)) continue;
    const node = mk(n, cur.label); cur.kids.push(node); cur.ids.push(...node.ids);
  }
  return areas;
}
const geState = node => { const off = node.ids.filter(id => GE.d.gesperrt.includes(id)).length; return off === 0 ? 'true' : off === node.ids.length ? 'false' : 'mixed'; };
function geSetNode(node, on) {
  const s = new Set(GE.d.gesperrt);
  node.ids.forEach(id => on ? s.delete(id) : s.add(id));
  GE.d.gesperrt = [...s];
}
function geTreeHTML() {
  const q = norm(GE.q || '').trim(), rows = [];
  const hit = n => !q || norm(n.label).includes(q) || (n.kids || []).some(hit);
  const walk = (n, depth) => {
    if (!hit(n)) return;
    const node = !!n.kids, open = q ? true : GE.open.has(n.key), st = geState(n), on = n.ids.length - n.ids.filter(id => GE.d.gesperrt.includes(id)).length;
    rows.push(`<div class="ge-row ${node ? 'node' : ''} ${depth === 0 ? 'area' : ''}" role="treeitem" ${node ? `aria-expanded="${open}"` : ''} style="--d:${depth}" data-gt-row="${esc(n.key)}">
      <span class="ge-lab">${node ? `<button type="button" class="ge-caret" data-gt-open="${esc(n.key)}" aria-label="${open ? 'Zuklappen' : 'Aufklappen'}">${ic(open ? 'chevron-down' : 'chevron-right', 'i-xs')}</button>` : '<span class="ge-caret"></span>'}${ic(n.icon || 'folder', 'i-sm')}<span class="ge-t">${esc(n.label)}</span></span>
      <span class="ge-n">${node ? `${on} von ${n.ids.length}` : ''}</span>
      <button type="button" class="ge-chk" role="checkbox" aria-checked="${st}" data-gt-chk="${esc(n.key)}" aria-label="${esc(n.label)} zugeordnet"></button></div>`);
    if (node && open) n.kids.forEach(k => walk(k, depth + 1));
  };
  geTree().forEach(a => walk(a, 0));
  return rows.join('') || '<div class="empty" style="padding:22px 12px"><p>Kein Menüpunkt gefunden.</p></div>';
}
const geFind = key => { let r = null; const walk = n => { if (n.key === key) r = n; else (n.kids || []).forEach(walk); }; geTree().forEach(walk); return r; };
function geBereiche() {
  return {html: `<div class="ue-cols2"><div class="ae-card ea-card ge-treecard">
    <p class="ea-hint">Angehakte Menüpunkte sehen und öffnen die Mitglieder. Nicht angehakte sind für sie ausgeblendet und gesperrt. Zusätzlich gelten weiterhin die Rechte der Rolle (z. B. „Einstellungen ändern“) – siehe Sonderberechtigungen. Administratoren sind ausgenommen.</p>
    <div class="ge-tools"><label class="ag-search">${ic('search', 'i-sm')}<input data-ge-q placeholder="Menüpunkt suchen …" value="${esc(GE.q)}"></label>
      <button type="button" class="btn btn-secondary btn-sm" data-ge-a="alle">${ic('check', 'i-sm')}Alle zuordnen</button><button type="button" class="btn btn-secondary btn-sm" data-ge-a="keine">${ic('x', 'i-sm')}Keine zuordnen</button>
      <button type="button" class="btn btn-ghost btn-sm" data-ge-a="auf">Alles aufklappen</button><button type="button" class="btn btn-ghost btn-sm" data-ge-a="zu">Zuklappen</button>
      <span class="sp"></span><span class="ge-count" data-ge-count></span></div>
    <div class="ge-th"><span>Ansicht</span><span></span><span>Zugeordnet</span></div>
    <div class="ge-tree" role="tree" data-ge-tree>${geTreeHTML()}</div></div></div>`, mount: el => geTreeCount(el)};
}
function geTreeCount(el) {
  const all = new Set(geTree().flatMap(a => a.ids)).size, off = GE.d.gesperrt.length, c = $('[data-ge-count]', el); if (c) c.textContent = `${all - off} von ${all} Menüpunkten zugeordnet`;
}
function geTreeRefresh(el) {
  const t = $('[data-ge-tree]', el); if (!t) return; const top = t.scrollTop; t.innerHTML = geTreeHTML(); t.scrollTop = top; geTreeCount(el);
}

/* Sonderberechtigungen und Kassenberechtigungen: je Recht „wie Rolle“ / „erlaubt“ / „gesperrt“ */
function gePermRow([perm, label]) {
  const D = GE.d, v = D.rechte[perm] || '', base = geBase(perm, D.rolle), seg = (val, l, cls) => `<button type="button" class="${cls}" data-gr="${esc(perm)}:${val}" aria-pressed="${v === val}">${l}</button>`;
  return `<div class="ge-perm ${v}"><div class="ge-pl"><b>${esc(label)}</b><small>Rolle „${esc(ROLE_NAMES[D.rolle])}“: ${base ? 'erlaubt' : 'nicht erlaubt'}${v === 'ja' ? ' → für die Gruppe erlaubt' : v === 'nein' ? ' → für die Gruppe gesperrt' : ''}</small></div>
    <div class="ge-seg" role="group" aria-label="${esc(label)}">${seg('', 'Wie Rolle', 'wie')}${seg('ja', 'Erlaubt', 'ja')}${seg('nein', 'Gesperrt', 'nein')}</div></div>`;
}
const GE_INTRO = '<p class="ea-hint">Hier wird die Rolle für die Mitglieder abgewandelt: „Erlaubt“ gewährt ein Recht zusätzlich, „Gesperrt“ nimmt es weg, „Wie Rolle“ lässt die Rolle entscheiden. Administratoren sind ausgenommen. Fehlt jemandem ein Recht, kann eine berechtigte Person die Aktion per PIN freigeben.</p>';
function geSonder() {
  const all = gePerms(), known = new Set([...GE_KASSE, ...GE_SONDER.flatMap(g => g[1])]), lbl = p => all.find(x => x[0] === p)?.[1] || p;
  const groups = GE_SONDER.map(([h, l]) => [h, l.filter(p => all.some(x => x[0] === p))]);
  const rest = all.filter(([p]) => !known.has(p)).map(x => x[0]); if (rest.length) groups.push(['Weitere', rest]);
  return {html: `${GE_INTRO}<div class="ue-cols2 ge-perms">${groups.map(([h, l]) => geCard(h, `<div class="ge-permlist">${l.map(p => gePermRow([p, lbl(p)])).join('')}</div>`)).join('')}</div>`};
}
function geKasse() {
  const all = gePerms(), lbl = p => all.find(x => x[0] === p)?.[1] || p;
  return {html: `${GE_INTRO}<div class="ue-cols2 ge-perms">${geCard('An der Kasse', `<div class="ge-permlist">${GE_KASSE.filter(p => all.some(x => x[0] === p)).map(p => gePermRow([p, lbl(p)])).join('')}</div>`)}</div>`};
}

/* Personen und Filialen: zwei Tabellen „Zugeordnet“ / „Nicht zugeordnet“ */
function geMemberRows(on) {
  const D = GE.d, keys = new Set(D.mitglieder.map(norm)), other = new Map();
  stRows('benutzergruppe').forEach(g => { if (g.id !== D.id) geNames(g.mitglieder).forEach(m => other.set(norm(m), g.name || g.id)); });
  const rows = USR.all.filter(u => keys.has(norm(u.name)) === on).map(u => ({id: u.id, nr: u.nr || '', name: u.name, rolle: ROLE_NAMES[u.role] || u.role, abw: on && u.role !== 'admin' && u.role !== D.rolle, gruppe: other.get(norm(u.name)) || '', aktiv: u.active !== false}));
  if (on) D.mitglieder.filter(m => !USR.all.some(u => geSame(u.name, m))).forEach(m => rows.push({id: 'n:' + m, nr: '', name: m, rolle: '–', abw: false, gruppe: '', aktiv: true}));   // Name ohne Person an diesem Standort
  return rows;
}
const geMemberName = id => String(id).startsWith('n:') ? String(id).slice(2) : USR.all.find(u => u.id === id)?.name;
function gePersonen() {
  return {html: `<p class="ea-hint ue-note">Eine Person gehört zu höchstens einer Gruppe: Wer hier zugeordnet wird, wird aus der bisherigen Gruppe entfernt. Beim Sichern wird neuen Mitgliedern die Rolle der Gruppe gesetzt (Administratoren behalten ihre Rolle). „Rolle setzen“ gleicht (markierte) Mitglieder an die Rolle der Gruppe an.</p>
    <div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnet</h4><div data-aeg="a"></div></div><div class="ae-card"><h4>Nicht zugeordnet</h4><div data-aeg="b"></div></div></div>`,
    mount: el => {
      const cols = [{k: 'nr', l: 'Nr.', t: 'num', w: 70}, {k: 'name', l: 'Name', w: 190}, {k: 'rolle', l: 'Rolle', w: 140, html: r => `${esc(r.rolle)}${r.abw ? ` <span class="pill warn" style="height:20px" title="Weicht von der Rolle der Gruppe ab">≠ Gruppe</span>` : ''}`, get: r => r.rolle}, {k: 'aktiv', l: 'Aktiv', t: 'check', w: 70}, {k: 'gruppe', l: 'Andere Gruppe', w: 160}];
      const mv = (ids, add) => { const s = GE.d.mitglieder.slice(); ids.map(geMemberName).filter(Boolean).forEach(n => { const i = s.findIndex(x => geSame(x, n)); if (add && i < 0) s.push(n); if (!add && i >= 0) s.splice(i, 1); }); GE.d.mitglieder = s; geDirty(el); geRender(); };
      const mk = (key, h, cfg) => { AG[key] = agNew({embed: true, cols, sort: {k: 'name', dir: 1}, ...cfg}); agMount(key, h); };
      mk('ge-a', $('[data-aeg="a"]', el), {title: 'Zugeordnet', rows: () => geMemberRows(true), edit: id => mv([id], false), extra: [{k: 'neu', l: 'Neu', icon: 'plus'}, {k: 'rm', l: 'Entfernen', icon: 'x'}, {k: 'rolle', l: 'Rolle setzen', icon: 'shield'}],
        actions: {neu: () => geNeuePerson(), rm: () => { const s = [...AG['ge-a'].sel]; if (s.length) mv(s, false); }, rolle: () => geRolleSetzen([...AG['ge-a'].sel])}});
      mk('ge-b', $('[data-aeg="b"]', el), {title: 'Nicht zugeordnet', rows: () => geMemberRows(false), edit: id => mv([id], true), extra: [{k: 'add', l: 'Zuordnen', icon: 'plus'}], actions: {add: () => { const s = [...AG['ge-b'].sel]; if (s.length) mv(s, true); }}});
    }};
}
const geStoreRows = on => STORES.filter(s => GE.d.filialen.includes(s.id) === on).map(s => ({id: s.id, kurz: s.id, name: s.name, gruppe: stRows('filialgruppe').find(g => (g.filialen || []).some(f => geSame(f, s.id)))?.name || ''}));
function geFilialen() {
  return {html: `<p class="ea-hint ue-note">Keine Filiale zugeordnet = die Mitglieder können sich an allen Filialen anmelden. Eine eigene Zuordnung der Person (Benutzer › Zugeordnete Filialen) geht der Gruppe vor. Administratoren können sich immer anmelden. ${STORES.length < 2 ? 'Mit dem Filialverbund erscheinen hier alle Standorte.' : ''}</p>
    <div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnet</h4><div data-aeg="a"></div></div><div class="ae-card"><h4>Nicht zugeordnet</h4><div data-aeg="b"></div></div></div>`,
    mount: el => {
      const cols = [{k: 'kurz', l: 'Kurz-Name', w: 110}, {k: 'name', l: 'Filiale', w: 220}, {k: 'gruppe', l: 'Filial-Gruppe', w: 160}];
      const mv = (ids, add) => { const s = new Set(GE.d.filialen); ids.forEach(i => add ? s.add(i) : s.delete(i)); GE.d.filialen = [...s]; geDirty(el); geRender(); };
      const mk = (key, h, cfg) => { AG[key] = agNew({embed: true, cols, sort: {k: 'kurz', dir: 1}, ...cfg}); agMount(key, h); };
      mk('ge-a', $('[data-aeg="a"]', el), {title: 'Zugeordnet', rows: () => geStoreRows(true), edit: id => mv([id], false), extra: [{k: 'rm', l: 'Entfernen', icon: 'x'}], actions: {rm: () => { const s = [...AG['ge-a'].sel]; if (s.length) mv(s, false); }}});
      mk('ge-b', $('[data-aeg="b"]', el), {title: 'Nicht zugeordnet', rows: () => geStoreRows(false), edit: id => mv([id], true), extra: [{k: 'add', l: 'Zuordnen', icon: 'plus'}], actions: {add: () => { const s = [...AG['ge-b'].sel]; if (s.length) mv(s, true); }}});
    }};
}

function geRender() {
  const host = $('#view-benutzergruppe-edit'); if (!host || !GE.d) return;
  const D = GE.d, pos = GE.ids.indexOf(GE.id), el = document.createElement('div'); el.className = 'ae ue ge'; host.replaceChildren(el);
  const btn = (a, icon, l, dis, text = true) => `<button class="ag-btn" data-ge-a="${a}" title="${esc(l)}" aria-label="${esc(l)}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}${text ? `<span>${l}</span>` : ''}</button>`;
  const miss = geMiss(D);
  const tab = ([k, l]) => { const n = miss.filter(m => m[0] === k).length; return `<button type="button" class="ed-tab" role="tab" data-ge-t="${k}" aria-selected="${GE.tab === k}">${esc(l)}${n ? ` <span class="ed-badge">${n}</span>` : ''}</button>`; };
  const body = ({allg: geAllg, bereiche: geBereiche, sonder: geSonder, kasse: geKasse, personen: gePersonen, filialen: geFilialen}[GE.tab] || geAllg)();
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Übersicht: Benutzergruppen')}${btn('refresh', 'sync', 'Aktualisieren', !GE.id)}${btn('save', 'check', 'Sichern', !GE.dirty)}${btn('new', 'plus', 'Neu', !GE.id)}${btn('undo', 'undo', 'Änderungen zurücknehmen', !GE.dirty)}${btn('del', 'trash', 'Löschen', !GE.id)}
      <span class="sp"></span>${GE.id && GE.ids.length > 1 ? `${btn('prev', 'chevron-left', 'Vorherige Gruppe', pos <= 0, false)}<span class="ae-nr">${pos + 1}/${GE.ids.length}</span>${btn('next', 'chevron-right', 'Nächste Gruppe', pos >= GE.ids.length - 1, false)}` : ''}</div>
    <div class="ae-tabsw"><div class="ed-tabs" role="tablist">${GE_TABS.map(tab).join('')}</div></div>
    <div class="ae-body"><div id="edBody">${body.html}</div></div>`;
  body.mount?.(el);
  el.addEventListener('input', e => {
    const q = e.target.closest('[data-ge-q]'); if (q) { GE.q = q.value; return geTreeRefresh(el); }
    const t = e.target.closest('[data-ge]'); if (t) geSet(t, el);
  });
  el.addEventListener('change', e => { const t = e.target.closest('[data-ge]'); if (t) { geSet(t, el); if (t.dataset.ge === 'rolle') geRender(); } });
  el.addEventListener('click', async e => {
    const t = e.target, tb = t.closest('[data-ge-t]'), b = t.closest('[data-ge-a]'), gr = t.closest('[data-gr]'), chk = t.closest('[data-gt-chk]'), cr = t.closest('[data-gt-open]'), row = t.closest('[data-gt-row]');
    if (tb) { GE.tab = tb.dataset.geT; return geRender(); }
    if (gr) { const [perm, val] = gr.dataset.gr.split(':'); if (val) GE.d.rechte[perm] = val; else delete GE.d.rechte[perm]; geDirty(el); const r = gr.closest('.ge-perm'); const fresh = document.createElement('div'); fresh.innerHTML = gePermRow([perm, gePerms().find(x => x[0] === perm)?.[1] || perm]); r.replaceWith(fresh.firstElementChild); return; }
    if (chk) { const n = geFind(chk.dataset.gtChk); if (n) { geSetNode(n, geState(n) !== 'true'); geDirty(el); geTreeRefresh(el); } return; }
    if (cr || row) { const key = (cr || row).dataset.gtOpen || row?.dataset.gtRow; const n = geFind(key); if (!n) return; if (n.kids) { GE.open.has(key) ? GE.open.delete(key) : GE.open.add(key); } else { geSetNode(n, geState(n) !== 'true'); geDirty(el); } return geTreeRefresh(el); }
    if (!b || b.disabled) return;
    const a = b.dataset.geA, ask = async () => !GE.dirty || await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen');
    if (a === 'back') { if (!await ask()) return; GE.dirty = false; return go('st-benutzergruppe'); }
    if (a === 'refresh' || a === 'undo') { if (a === 'refresh' && !await ask()) return; await usrLoad(a === 'refresh'); GE.d = geDraft(GE.id); GE.orig = geClone(GE.d); GE.dirty = false; return geRender(); }
    if (a === 'new') { if (!await ask()) return; return geOpen(null, GE.ids); }
    if (a === 'prev' || a === 'next') { if (!await ask()) return; const id = GE.ids[pos + (a === 'next' ? 1 : -1)]; if (id) geOpen(id); return; }
    if (a === 'alle' || a === 'keine') { GE.d.gesperrt = a === 'alle' ? [] : geTree().flatMap(x => x.ids); geDirty(el); return geTreeRefresh(el); }
    if (a === 'auf' || a === 'zu') { GE.open = a === 'zu' ? new Set() : new Set(geTree().flatMap(function walk(n) { return n.kids ? [n.key, ...n.kids.flatMap(walk)] : []; })); return geTreeRefresh(el); }
    if (a === 'del') return geRemove([GE.id], true);
    if (a === 'save') return geSave();
  });
}
function geDirty(el) { GE.dirty = true; $$('[data-ge-a="save"],[data-ge-a="undo"]', el).forEach(b => { b.disabled = false; }); }
function geSet(t, el) {
  GE.d[t.dataset.ge] = t.value; geDirty(el);
  if (t.dataset.ge === 'name') { renderTopbar(); const n = $$('[data-ge-t="allg"] .ed-badge', el); if (n.length && String(t.value).trim().length >= 2) n.forEach(x => x.remove()); }
}

/* ── Sichern ── */
async function geSave() {
  const D = GE.d, O = GE.orig, isNew = !GE.id, name = String(D.name).trim();
  const miss = geMiss(D); if (miss.length) { GE.tab = miss[0][0]; geRender(); return toast(`${miss[0][1]} angeben (mindestens 2 Zeichen)`, {t2: 'Pflichtfeld', type: 'warn'}); }
  if (stRows('benutzergruppe').some(g => g.id !== GE.id && geSame(g.name || g.id, name))) { GE.tab = 'allg'; geRender(); return toast('Diesen Gruppennamen gibt es schon', {type: 'warn'}); }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), srt = l => [...l].sort();
  const sensitive = D.rolle !== O.rolle || !same(D.rechte, O.rechte) || !same(srt(D.gesperrt), srt(O.gesperrt)) || !same(srt(D.mitglieder.map(norm)), srt(O.mitglieder.map(norm))) || !same(srt(D.filialen), srt(O.filialen));
  // neue Mitglieder bekommen die Rolle der Gruppe (Administratoren behalten ihre)
  const neu = D.mitglieder.filter(m => !O.mitglieder.some(o => geSame(o, m))), wechsel = neu.map(m => USR.all.find(u => geSame(u.name, m))).filter(u => u && u.role !== 'admin' && u.role !== D.rolle);
  if (wechsel.length && !DESKTOP) return toast('Rollen setzen nur in der Desktop-App', {t2: 'Mitglieder bitte erst dort zuordnen', type: 'warn'});
  if (wechsel.length && !await confirmBox(`Neue Mitglieder bekommen die Rolle „${ROLE_NAMES[D.rolle]}“: ${wechsel.map(u => `${u.name} (${ROLE_NAMES[u.role]})`).join(', ')}.`, 'Rollen setzen')) return;
  let by = S.user;
  if (sensitive && (DESKTOP || wechsel.length)) { try { by = (await stepUp({title: 'Administrator-Freigabe', text: isNew ? `Neue Gruppe „${name}“ anlegen` : `Gruppe „${name}“ ändern (Rechte, Sperren, Mitglieder, Filialen)`, admin: true})).by; } catch { return; } }
  try {
    const id = GE.id || ('bg-' + (norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || geUid()) + '-' + geUid());
    const rows = stRows('benutzergruppe').map(g => ({...g}));
    // eine Person gehört zu höchstens einer Gruppe
    rows.forEach(g => { if (g.id !== id && (g.mitglieder || []).some(m => D.mitglieder.some(x => geSame(x, m)))) g.mitglieder = g.mitglieder.filter(m => !D.mitglieder.some(x => geSame(x, m))); });
    const rec = {...(rows.find(g => g.id === id) || {}), id, name, beschreibung: String(D.beschreibung || '').trim(), rolle: D.rolle, rechte: {...D.rechte}, gesperrt: [...D.gesperrt], mitglieder: [...D.mitglieder], filialen: [...D.filialen], _aktiv: true};
    const i = rows.findIndex(g => g.id === id); if (i >= 0) rows[i] = rec; else rows.push(rec);
    await stammSave('benutzergruppe', rows);
    for (const u of wechsel) await invoke('user_save', {user: {id: u.id, name: u.name, role: D.rolle, active: u.active !== false, nr: u.nr || 0, profile: u.profile || {}}, pin: null, by: by.name});
    await usrLoad();
    GE.id = id; GE.d = geDraft(id); GE.orig = geClone(GE.d); GE.dirty = false; if (isNew) GE.ids = [...GE.ids, id];
  } catch (err) { return toast('Speichern fehlgeschlagen', {t2: String(err.message || err), type: 'warn'}); }
  geWirkung();
  toast(isNew ? 'Gruppe angelegt' : 'Gespeichert', {t2: `${name} · ${ROLE_NAMES[D.rolle]} · ${D.mitglieder.length} ${D.mitglieder.length === 1 ? 'Person' : 'Personen'}`, type: 'pos', icon: 'users', dur: 2200});
  geRender();
}
/** Nach Änderungen an Gruppen: Menü, Anmeldeliste und die offene Seite an die neuen Rechte anpassen */
function geWirkung() {
  renderMe(); permNav();
  if (S.view && viewBlocked(S.view)) { S.view = null; go(firstAllowedView()); }
}

/* ── Neue Person direkt in dieser Gruppe anlegen (Maske „Benutzer“ mit Gruppe und Rolle vorbelegt) ── */
async function geNeuePerson() {
  if (!GE.id) return toast('Gruppe zuerst sichern', {t2: 'Danach lässt sich eine neue Person direkt in der Gruppe anlegen', type: 'warn'});
  if (GE.dirty && !await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen')) return;
  GE.dirty = false; usrOpen(null, [], {gruppe: GE.id, role: GE.d.rolle});
}

/* ── Rolle der Gruppe für Mitglieder setzen ── */
async function geRolleSetzen(sel) {
  const D = GE.d;
  if (!DESKTOP) return toast('Nur in der Desktop-App', {t2: 'Rollen werden in der lokalen Datenbank gespeichert', type: 'warn'});
  const users = USR.all.filter(u => D.mitglieder.some(m => geSame(m, u.name)) && (!sel.length || sel.includes(u.id)) && u.role !== 'admin' && u.role !== D.rolle);
  if (!users.length) return toast('Nichts zu ändern', {t2: 'Alle (markierten) Mitglieder haben schon die Rolle der Gruppe oder sind Administratoren', icon: 'users'});
  if (!await confirmBox(`Rolle „${ROLE_NAMES[D.rolle]}“ setzen für: ${users.map(u => `${u.name} (${ROLE_NAMES[u.role]})`).join(', ')}?`, 'Rolle setzen')) return;
  let by; try { by = (await stepUp({title: 'Administrator-Freigabe', text: `Rolle „${ROLE_NAMES[D.rolle]}“ für ${users.length} ${users.length === 1 ? 'Person' : 'Personen'} setzen`, admin: true})).by; } catch { return; }
  try { for (const u of users) await invoke('user_save', {user: {id: u.id, name: u.name, role: D.rolle, active: u.active !== false, nr: u.nr || 0, profile: u.profile || {}}, pin: null, by: by.name}); }
  catch (e) { toast('Rolle setzen nicht möglich', {t2: String(e), type: 'warn'}); }
  await usrLoad(); geWirkung(); geRender();
  toast('Rolle gesetzt', {t2: `${ROLE_NAMES[D.rolle]}: ${users.map(u => u.name).join(', ')}`, type: 'pos', icon: 'users', dur: 2400});
}

/* ── Löschen ── */
async function geRemove(ids, fromMask) {
  const gr = ids.map(id => stRows('benutzergruppe').find(g => g.id === id)).filter(Boolean), abort = () => { throw new Error('abgebrochen'); };
  if (!gr.length) abort();
  const wer = gr.length === 1 ? `„${gr[0].name || gr[0].id}“` : `${gr.length} Gruppen`, n = gr.reduce((t, g) => t + geNames(g.mitglieder).length, 0);
  if (!await confirmBox(`${wer} löschen? ${n ? `${n} ${n === 1 ? 'Mitglied behält' : 'Mitglieder behalten'} die Rolle, Abweichungen und Sperren der Gruppe entfallen.` : 'Die Gruppe hat keine Mitglieder.'}`, 'Löschen')) abort();
  if (DESKTOP) await stepUp({title: 'Administrator-Freigabe', text: `${wer} löschen`, admin: true}).catch(abort);
  try { await stammSave('benutzergruppe', stRows('benutzergruppe').filter(g => !ids.includes(g.id)).map(g => ({...g}))); }
  catch (e) { toast('Löschen nicht möglich', {t2: String(e), type: 'warn'}); return; }
  geWirkung();
  toast(gr.length === 1 ? 'Gruppe gelöscht' : `${gr.length} Gruppen gelöscht`, {t2: gr.map(g => g.name || g.id).join(', '), icon: 'users', dur: 2400});
  if (fromMask) { GE.dirty = false; GE.d = null; go('st-benutzergruppe'); }
}
