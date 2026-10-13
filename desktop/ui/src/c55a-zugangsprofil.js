/* ═════════════════════════════════════════════════════════════════
   55a · ZUGANGSPROFIL (Stammdaten › Benutzer › Zugangsprofil) – Liste und Maske mit Reitern
   Ein Profil legt fest, WANN und WOHER sich die zugeordneten Personen anmelden dürfen:
   • IP-Bereich ………………… Anmeldung nur von Adressen in diesem Bereich (Handy: Adresse des Geräts, Arbeitsplatz: eigene Netzwerk-Adresse)
   • Arbeitstag (Mo–Fr) ……… erlaubte Zeit von … bis …; 00:00–00:00 = ganztägig; Ende vor Start = über Mitternacht
   • Wochenende (Sa, So) ……… dasselbe für Samstag und Sonntag
   • Zugeordnete User ………… eine Person gehört zu höchstens einem Profil; ohne Profil gilt: jederzeit, von überall
   Administratoren sind ausgenommen (keine Selbstsperre). Die Prüfung gilt am Sperrbildschirm und bei der Handy-Anmeldung.
   ═════════════════════════════════════════════════════════════════ */
const ZPE = {id: null, ids: [], d: null, orig: null, tab: 'allg', dirty: false, show: false};
const ZP_TABS = [['allg', 'Allgemein'], ['user', 'Zugeordnete User']];
const ZP_DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const zpSame = (a, b) => norm(a) === norm(b);
const zpUid = () => Math.random().toString(36).slice(2, 8);

/* ── Prüfung (gleiche Regeln wie im Backend, access.rs) ── */
/** „192.168.1.20“ → Zahl; ungültig → null */
function zpIp(s) {
  const m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(String(s ?? '')); if (!m) return null;
  const o = m.slice(1).map(Number); if (o.some(x => x > 255)) return null;
  return ((o[0] * 256 + o[1]) * 256 + o[2]) * 256 + o[3];
}
/** „08:30“ → Minuten (leer = 00:00); ungültig → null */
function zpHM(s) {
  s = String(s ?? '').trim(); if (!s) return 0;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s); if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}
/** Liegt die Uhrzeit (Minuten) im Fenster? Start = Ende → ganztägig; Ende vor Start → über Mitternacht */
function zpTimeOk(von, bis, now) {
  const a = zpHM(von) ?? 0, b = zpHM(bis) ?? 0;
  return a === b ? true : a < b ? now >= a && now <= b : now >= a || now <= b;
}
/** Wirksame Werte eines Profils; ältere Profile (Wochentage + von/bis) werden übernommen */
function zpEff(p) {
  const tage = (p.tage || []).map(t => norm(t).slice(0, 2));
  const legacy = p.wt_von == null && p.we_von == null && (p.von || p.bis || tage.length);
  const base = {ipVon: p.ip_von || '0.0.0.0', ipBis: p.ip_bis || '255.255.255.255'};
  if (legacy) {
    const has = ds => !tage.length || ds.some(d => tage.includes(d));
    return {...base, wtOk: has(['mo', 'di', 'mi', 'do', 'fr']), wtVon: p.von || '', wtBis: p.bis || '', weOk: has(['sa', 'so']), weVon: p.von || '', weBis: p.bis || ''};
  }
  return {...base, wtOk: p.wt_ok !== false, wtVon: p.wt_von || '', wtBis: p.wt_bis || '', weOk: p.we_ok !== false, weVon: p.we_von || '', weBis: p.we_bis || ''};
}
const zpFull = e => (zpIp(e.ipVon) ?? 0) === 0 && (zpIp(e.ipBis) ?? 4294967295) === 4294967295;
/** Erlaubt ein Profil die Anmeldung zu diesem Zeitpunkt von diesen Adressen? ips leer = Adresse unbekannt → nur die Zeit zählt */
function zpAllows(p, at, ips) {
  const e = zpEff(p), wd = at.getDay(), we = wd === 0 || wd === 6, label = we ? 'am Wochenende' : 'an Arbeitstagen';
  if (!(we ? e.weOk : e.wtOk)) return {ok: false, grund: `Anmeldung ${label} nicht erlaubt (Zugangsprofil)`};
  const von = we ? e.weVon : e.wtVon, bis = we ? e.weBis : e.wtBis;
  if (!zpTimeOk(von, bis, at.getHours() * 60 + at.getMinutes())) return {ok: false, grund: `Anmeldung ${label} nur von ${von || '00:00'} bis ${bis || '00:00'} Uhr erlaubt (Zugangsprofil)`};
  const a = zpIp(e.ipVon) ?? 0, b = zpIp(e.ipBis) ?? 4294967295;
  if (!zpFull(e) && ips.length && !ips.some(ip => { const n = zpIp(ip); return n != null && n >= a && n <= b; })) return {ok: false, grund: 'Anmeldung von dieser Adresse aus nicht erlaubt (Zugangsprofil)'};
  return {ok: true};
}
/** Adressen dieses Arbeitsplatzes (Desktop-App; in der Vorschau unbekannt) */
const ZP_NET = {ips: [], loaded: false};
async function zpNetLoad() {
  if (!DESKTOP) { ZP_NET.loaded = true; return; }
  try { ZP_NET.ips = await invoke('access_ips'); } catch { ZP_NET.ips = []; }
  ZP_NET.loaded = true;
}
/** Darf sich die Person jetzt hier anmelden? Mehrere Profile: ein erlaubendes genügt. Administratoren sind ausgenommen. */
function accessCheck(name, roleKey, at = new Date(), ips = ZP_NET.ips) {
  if (roleKey === 'admin') return {ok: true};
  const ps = stActive('zugangsprofil').filter(p => (p.benutzer || []).some(b => zpSame(b, name)));
  if (!ps.length) return {ok: true};
  const rs = ps.map(p => zpAllows(p, at, ips));
  return rs.find(r => r.ok) || rs[0];
}

/* ── Beschreibungen ── */
const zpIpText = e => {
  if (zpFull(e)) return 'alle Adressen';
  const a = zpIp(e.ipVon), b = zpIp(e.ipBis); if (a == null || b == null) return `${e.ipVon} – ${e.ipBis}`;
  const n = b - a + 1; return `${e.ipVon} – ${e.ipBis}${n > 0 ? ` (${num(n)} ${n === 1 ? 'Adresse' : 'Adressen'})` : ''}`;
};
const zpWinText = (ok, von, bis) => !ok ? 'gesperrt' : (zpHM(von) ?? 0) === (zpHM(bis) ?? 0) ? 'ganztägig' : `${von || '00:00'} – ${bis || '00:00'} Uhr${(zpHM(von) ?? 0) > (zpHM(bis) ?? 0) ? ' (über Mitternacht)' : ''}`;
const zpNames = l => (l || []).filter(Boolean);

/* ── Zustand ── */
const zpRec = p => { const e = zpEff(p); return {id: p.id, name: p.name || '', ip_von: e.ipVon, ip_bis: e.ipBis, wt_ok: e.wtOk, wt_von: e.wtVon || '00:00', wt_bis: e.wtBis || '00:00', we_ok: e.weOk, we_von: e.weVon || '00:00', we_bis: e.weBis || '00:00', benutzer: zpNames(p.benutzer), _aktiv: p._aktiv !== false}; };
const zpNeu = () => ({id: '', name: '', ip_von: '0.0.0.0', ip_bis: '255.255.255.255', wt_ok: true, wt_von: '00:00', wt_bis: '00:00', we_ok: true, we_von: '00:00', we_bis: '00:00', benutzer: [], _aktiv: true});
const zpDraft = id => { const p = id ? stRows('zugangsprofil').find(x => x.id === id) : null; return p ? zpRec(p) : zpNeu(); };
const zpClone = d => JSON.parse(JSON.stringify(d));

/* Fehler je Feld: Pflichtfelder und gültige Angaben */
function zpErrors(d) {
  const m = [], a = zpIp(d.ip_von), b = zpIp(d.ip_bis);
  if (String(d.name).trim().length < 2) m.push({k: 'name', t: 'Name angeben (mindestens 2 Zeichen)'});
  if (a == null) m.push({k: 'ip_von', t: 'IP Bereich von: gültige Adresse eintragen, z. B. 192.168.1.0'});
  if (b == null) m.push({k: 'ip_bis', t: 'IP Bereich bis: gültige Adresse eintragen, z. B. 192.168.1.255'});
  if (a != null && b != null && a > b) m.push({k: 'ip_bis', t: 'IP Bereich bis darf nicht vor „von“ liegen'});
  for (const [k, l] of [['wt_von', 'Arbeitstag-Start-Zeit'], ['wt_bis', 'Arbeitstag-End-Zeit'], ['we_von', 'Wochenend-Start-Zeit'], ['we_bis', 'Wochenend-End-Zeit']]) if (zpHM(d[k]) == null) m.push({k, t: `${l}: Uhrzeit im Format 08:30`});
  return m;
}

/* ── Liste ── */
function zpRows() {
  const usr = new Map(USR.all.map(u => [norm(u.name), u]));
  return stRows('zugangsprofil').map(p => { const e = zpEff(p), l = zpNames(p.benutzer);
    return {id: p.id, name: p.name || p.id, ip: zpIpText(e), wt: zpWinText(e.wtOk, e.wtVon, e.wtBis), we: zpWinText(e.weOk, e.weVon, e.weBis), personen: l.length, benutzer: l.map(n => usr.get(norm(n))?.name || n).join(', ')}; });
}
agridPage('st-zugangsprofil', {
  title: 'Zugangsprofil', rows: zpRows, count: () => stRows('zugangsprofil').length, sort: {k: 'name', dir: 1}, rowH: 44,
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'name', l: 'Name', w: 240}, {k: 'ip', l: 'IP-Bereich', w: 280}, {k: 'wt', l: 'Arbeitstag (Mo–Fr)', w: 190}, {k: 'we', l: 'Wochenende (Sa, So)', w: 190}, {k: 'personen', l: 'Personen', t: 'num', w: 90}, {k: 'benutzer', l: 'Zugeordnete User', w: 300}],
  remove: ids => zpRemove(ids),
  actions: {back: () => e2Back(), refresh: () => PAGES['st-zugangsprofil'].render(true), new: () => zpOpen(null, [])},
  edit: id => zpOpen(id, (AG['st-zugangsprofil'].filtered || []).map(r => r.id)),
});
{ const p = PAGES['st-zugangsprofil'], _r = p.render; p.render = async fresh => { await usrLoad(fresh === true); await _r(); renderTopbar(); }; }
VIEW_PERM['st-zugangsprofil'] = 'system';

/* ── Maske ── */
function zpOpen(id, ids) {
  ZPE.id = id; ZPE.ids = ids?.length ? ids : ZPE.ids; ZPE.d = zpDraft(id); ZPE.orig = zpClone(ZPE.d); ZPE.tab = 'allg'; ZPE.dirty = false;
  if (S.view === 'zugangsprofil-edit') zpRender(); else go('zugangsprofil-edit');
}
registerPage('zugangsprofil-edit', {title: 'Zugangsprofil', sub: () => ZPE.d ? (ZPE.d.name || 'neues Profil') : '', render: async () => {
  if (!ZPE.d) { setTimeout(() => go('st-zugangsprofil'), 0); return; }
  $('#view-zugangsprofil-edit').innerHTML = '<div class="muted" style="padding:24px">Lade …</div>';
  await Promise.all([usrLoad(), zpNetLoad()]); zpRender(); renderTopbar();
}});
VIEW_PERM['zugangsprofil-edit'] = 'system';
NAV_CHILD['zugangsprofil-edit'] = 'st-zugangsprofil';
leaveGuard('zugangsprofil-edit', () => ZPE.dirty, () => { ZPE.dirty = false; ZPE.d = zpDraft(ZPE.id); ZPE.orig = zpClone(ZPE.d); });

const zpErr = k => zpErrors(ZPE.d).find(e => e.k === k);
const zpIn = (k, l, o = {}) => { const er = ZPE.show && zpErr(k); return `<label class="field ${er ? 'zp-bad' : ''}"><span>${esc(l)}</span><input class="input ${o.mono ? 'mono' : ''}" ${o.type ? `type="${o.type}"` : ''} data-zp="${k}" value="${esc(ZPE.d[k] ?? '')}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} autocomplete="off" ${er ? `aria-invalid="true"` : ''}>${er ? `<small class="zp-err">${esc(er.t)}</small>` : o.hint ? `<small class="ea-hint">${esc(o.hint)}</small>` : ''}</label>`; };
const zpSw = (k, l, hint) => `<div class="ue-sw"><label class="ea-sw"><button type="button" class="switch" role="switch" data-zp-sw="${k}" aria-checked="${!!ZPE.d[k]}"></button><span>${esc(l)}</span></label>${hint ? `<small class="ea-hint">${esc(hint)}</small>` : ''}</div>`;
const zpCard = (h, inner, cls = '') => `<div class="ae-card ea-card ${cls}">${h ? `<h4>${esc(h)}</h4>` : ''}${inner}</div>`;

/** Prüfbox: Wäre die Anmeldung zu diesem Zeitpunkt von dieser Adresse erlaubt? (Arbeitsplatz-Adresse und aktuelle Uhrzeit vorbelegt) */
const ZP_TEST = {tag: null, zeit: '', ip: ''};
function zpTestInit() {
  const n = new Date(); if (ZP_TEST.tag == null) ZP_TEST.tag = n.getDay();
  if (!ZP_TEST.zeit) ZP_TEST.zeit = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  if (!ZP_TEST.ip) ZP_TEST.ip = ZP_NET.ips[0] || '';
}
function zpTestResult() {
  const d = ZPE.d; if (zpErrors(d).length) return {ok: null, t: 'Erst die Angaben links vervollständigen'};
  const hm = zpHM(ZP_TEST.zeit); if (hm == null) return {ok: null, t: 'Uhrzeit im Format 08:30 eingeben'};
  const ip = String(ZP_TEST.ip || '').trim(); if (ip && zpIp(ip) == null) return {ok: null, t: 'Adresse im Format 192.168.1.20 eingeben'};
  const at = new Date(2026, 0, 4 + (+ZP_TEST.tag)); at.setHours(Math.floor(hm / 60), hm % 60, 0, 0);   // 4.1.2026 war ein Sonntag
  const r = zpAllows(d, at, ip ? [ip] : []);
  return r.ok ? {ok: true, t: 'Anmeldung erlaubt'} : {ok: false, t: r.grund.replace(' (Zugangsprofil)', '')};
}
function zpTestHTML() {
  zpTestInit(); const r = zpTestResult();
  return `<div class="zp-test"><div class="zp-test-row"><label class="field"><span>Wochentag</span><select class="input select" data-zp-t="tag">${[1, 2, 3, 4, 5, 6, 0].map(i => `<option value="${i}" ${+ZP_TEST.tag === i ? 'selected' : ''}>${['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][i]}</option>`).join('')}</select></label>
    <label class="field"><span>Uhrzeit</span><input class="input" type="time" data-zp-t="zeit" value="${esc(ZP_TEST.zeit)}"></label>
    <label class="field"><span>IP-Adresse</span><input class="input mono" data-zp-t="ip" value="${esc(ZP_TEST.ip)}" placeholder="${DESKTOP ? 'leer = unbekannt' : 'z. B. 192.168.1.20'}" inputmode="decimal" autocomplete="off"></label></div>
    <div class="zp-res ${r.ok === true ? 'ok' : r.ok === false ? 'no' : ''}" data-zp-res>${ic(r.ok === true ? 'check' : r.ok === false ? 'x' : 'info', 'i-sm')}<span>${esc(r.t)}</span></div></div>`;
}
function zpAllg() {
  const D = ZPE.d, e = {ipVon: D.ip_von, ipBis: D.ip_bis}, names = zpNames(D.benutzer), n = zpErrors(D).length;
  const fact = (l, v) => `<div class="ge-fact"><span>${esc(l)}</span><b>${v}</b></div>`;
  const jetzt = (() => { if (n) return null; const r = zpAllows(D, new Date(), ZP_NET.ips); return r; })();
  return {html: `<div class="ue-cols2 ge-2 zp-cols">
    ${zpCard('Zugangsprofil', `<div class="ea-fields ge-one">
      ${zpIn('name', 'Name *', {hint: 'z. B. „Büro“, „Filiale Innsbruck“ oder „Nur Kassenzeiten“.'})}
      ${zpIn('ip_von', 'IP Bereich von *', {mono: true, ph: '0.0.0.0', inputmode: 'decimal'})}${zpIn('ip_bis', 'IP Bereich bis *', {mono: true, ph: '255.255.255.255', inputmode: 'decimal', hint: '0.0.0.0 bis 255.255.255.255 = von überall. Für ein einzelnes Netz z. B. 192.168.1.0 bis 192.168.1.255.'})}
      <div class="zp-grp"><b>Arbeitstag <small>Montag bis Freitag</small></b>${zpSw('wt_ok', 'Anmeldung erlaubt')}<div class="zp-pair">${zpIn('wt_von', 'Arbeitstag-Start-Zeit', {type: 'time'})}${zpIn('wt_bis', 'Arbeitstag-End-Zeit', {type: 'time'})}</div></div>
      <div class="zp-grp"><b>Wochenende <small>Samstag und Sonntag</small></b>${zpSw('we_ok', 'Anmeldung erlaubt')}<div class="zp-pair">${zpIn('we_von', 'Wochenend-Start-Zeit', {type: 'time'})}${zpIn('we_bis', 'Wochenend-End-Zeit', {type: 'time'})}</div></div>
      <small class="ea-hint">Start und Ende gleich (00:00 – 00:00) heißt ganztägig. Liegt das Ende vor dem Start, gilt das Fenster über Mitternacht (22:00 – 06:00).</small></div>`)}
    ${zpCard('Das bewirkt das Profil', `<div class="ge-facts" data-zp-facts>${fact('Personen', names.length ? `${names.length} · ${esc(names.join(', '))}` : 'noch niemand')}${fact('IP-Bereich', esc(zpIpText(zpEff({ip_von: D.ip_von, ip_bis: D.ip_bis}))))}${fact('Arbeitstag', esc(zpWinText(D.wt_ok, D.wt_von, D.wt_bis)))}${fact('Wochenende', esc(zpWinText(D.we_ok, D.we_von, D.we_bis)))}
      ${fact('Jetzt', jetzt ? (jetzt.ok ? '<span class="pill pos" style="height:22px">erlaubt</span>' : `<span class="pill neg" style="height:22px">gesperrt</span> <span class="muted">${esc(jetzt.grund.replace(' (Zugangsprofil)', ''))}</span>`) : '<span class="muted">Angaben unvollständig</span>')}</div>
      <p class="ea-hint">Wer dem Profil zugeordnet ist, kann sich nur so anmelden – am Sperrbildschirm und am Handy. Ohne Profil: jederzeit und von überall. Administratoren sind ausgenommen – so kann sich niemand selbst aussperren.${DESKTOP && !ZP_NET.ips.length ? ' Dieser Arbeitsplatz hat gerade keine Netzwerk-Adresse; die Adresse wird dann nicht geprüft, die Zeit schon.' : ''}</p>
      <h4 style="margin-top:14px">Anmeldung ausprobieren</h4>${zpTestHTML()}`)}
  </div>`};
}

/* Zugeordnete User: zwei Tabellen „Zugeordnet“ / „Nicht zugeordnet“ (Zeilen ziehen oder doppelklicken) */
function zpUserRows(on) {
  const D = ZPE.d, keys = new Set(D.benutzer.map(norm)), other = new Map(), grp = new Map();
  stRows('zugangsprofil').forEach(p => { if (p.id !== D.id) zpNames(p.benutzer).forEach(m => other.set(norm(m), p.name || p.id)); });
  stRows('benutzergruppe').forEach(g => zpNames(g.mitglieder).forEach(m => grp.set(norm(m), g.name || g.id)));
  const rows = USR.all.filter(u => keys.has(norm(u.name)) === on).map(u => { const [vn, nn] = usrSplit(u);
    return {id: u.id, nr: u.nr || '', name: nn || u.name, vorname: vn, aktiv: u.active !== false, gruppe: grp.get(norm(u.name)) || '', anderes: other.get(norm(u.name)) || '', admin: u.role === 'admin'}; });
  if (on) D.benutzer.filter(m => !USR.all.some(u => zpSame(u.name, m))).forEach(m => rows.push({id: 'n:' + m, nr: '', name: m, vorname: '', aktiv: true, gruppe: '', anderes: '', admin: false}));   // Name ohne Person an diesem Standort
  return rows;
}
const zpUserName = id => String(id).startsWith('n:') ? String(id).slice(2) : USR.all.find(u => u.id === id)?.name;
function zpUser() {
  return {html: `<p class="ea-hint ue-note">Eine Person gehört zu höchstens einem Zugangsprofil: Wer hier zugeordnet wird, wird aus dem bisherigen Profil entfernt. Die Zuordnung lässt sich auch in der Maske „Benutzer“ ändern. Administratoren sind von jedem Profil ausgenommen.</p>
    <div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnet</h4><div data-aeg="a"></div></div><div class="ae-card"><h4>Nicht zugeordnet</h4><div data-aeg="b"></div></div></div>`,
    mount: el => {
      const base = [{k: 'nr', l: 'Nr.', t: 'num', w: 60}, {k: 'name', l: 'Name', w: 120}, {k: 'vorname', l: 'Vorname', w: 110}, {k: 'aktiv', l: 'Aktiv', t: 'check', w: 64}, {k: 'gruppe', l: 'Benutzergruppe', w: 140}];
      const colsA = [...base, {k: 'admin', l: 'Hinweis', w: 130, get: r => r.admin ? 'Administrator – ausgenommen' : '', html: r => r.admin ? '<span class="pill" style="height:20px" title="Administratoren sind von Zugangsprofilen ausgenommen">ausgenommen</span>' : ''}];
      const colsB = [...base, {k: 'anderes', l: 'Anderes Profil', w: 140}];
      const mv = (ids, add) => { const s = ZPE.d.benutzer.slice(); ids.map(zpUserName).filter(Boolean).forEach(n => { const i = s.findIndex(x => zpSame(x, n)); if (add && i < 0) s.push(n); if (!add && i >= 0) s.splice(i, 1); }); ZPE.d.benutzer = s; zpDirty(el); zpRender(); };
      const mk = (key, h, cfg) => { AG[key] = agNew({embed: true, sort: {k: 'nr', dir: 1}, ...cfg}); agMount(key, h); };
      const [da, db] = agDual('zp-a', 'zp-b', mv);
      mk('zp-a', $('[data-aeg="a"]', el), {title: 'Zugeordnet', cols: colsA, rows: () => zpUserRows(true), dnd: da, edit: id => mv([id], false), extra: [{k: 'rm', l: 'Entfernen', icon: 'x'}], actions: {rm: () => { const s = [...AG['zp-a'].sel]; if (s.length) mv(s, false); }}});
      mk('zp-b', $('[data-aeg="b"]', el), {title: 'Nicht zugeordnet', cols: colsB, rows: () => zpUserRows(false), dnd: db, edit: id => mv([id], true), extra: [{k: 'add', l: 'Zuordnen', icon: 'plus'}], actions: {add: () => { const s = [...AG['zp-b'].sel]; if (s.length) mv(s, true); }}});
    }};
}

function zpRender() {
  const host = $('#view-zugangsprofil-edit'); if (!host || !ZPE.d) return;
  const D = ZPE.d, pos = ZPE.ids.indexOf(ZPE.id), el = document.createElement('div'); el.className = 'ae ue ge zp'; host.replaceChildren(el);
  const btn = (a, icon, l, dis, text = true) => `<button class="ag-btn" data-zp-a="${a}" title="${esc(l)}" aria-label="${esc(l)}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}${text ? `<span>${l}</span>` : ''}</button>`;
  const miss = zpErrors(D);
  const tab = ([k, l]) => { const n = k === 'allg' ? miss.length : 0; return `<button type="button" class="ed-tab" role="tab" data-zp-tab="${k}" aria-selected="${ZPE.tab === k}">${esc(l)}${n ? ` <span class="ed-badge">${n}</span>` : ''}</button>`; };
  const body = (ZPE.tab === 'user' ? zpUser : zpAllg)();
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Übersicht: Zugangsprofil')}${btn('refresh', 'sync', 'Aktualisieren', !ZPE.id)}${btn('save', 'check', 'Sichern', !ZPE.dirty)}${btn('new', 'plus', 'Neu', !ZPE.id)}${btn('undo', 'undo', 'Änderungen zurücknehmen', !ZPE.dirty)}${btn('del', 'trash', 'Löschen', !ZPE.id)}
      <span class="sp"></span>${ZPE.id && ZPE.ids.length > 1 ? `${btn('prev', 'chevron-left', 'Vorheriges Profil', pos <= 0, false)}<span class="ae-nr">${pos + 1}/${ZPE.ids.length}</span>${btn('next', 'chevron-right', 'Nächstes Profil', pos >= ZPE.ids.length - 1, false)}` : ''}</div>
    <div class="ae-tabsw"><div class="ed-tabs" role="tablist">${ZP_TABS.map(tab).join('')}</div></div>
    <div class="ae-body"><div id="edBody">${body.html}</div></div>`;
  body.mount?.(el);
  el.addEventListener('input', e => {
    const t = e.target.closest('[data-zp]'); if (t) return zpSet(t, el);
    const q = e.target.closest('[data-zp-t]'); if (q) { ZP_TEST[q.dataset.zpT] = q.value; zpTestRefresh(el); }
  });
  el.addEventListener('focusout', e => { const t = e.target.closest('[data-zp]'); if (t) { t.dataset.touched = '1'; zpFields(el); } });
  el.addEventListener('change', e => { const t = e.target.closest('[data-zp]'); if (t) { zpSet(t, el); t.dataset.touched = '1'; zpFields(el); } const q = e.target.closest('[data-zp-t]'); if (q) { ZP_TEST[q.dataset.zpT] = q.value; zpTestRefresh(el); } });
  el.addEventListener('click', async e => {
    const t = e.target, tb = t.closest('[data-zp-tab]'), b = t.closest('[data-zp-a]'), sw = t.closest('[data-zp-sw]');
    if (tb) { ZPE.tab = tb.dataset.zpTab; return zpRender(); }
    if (sw) { const k = sw.dataset.zpSw; ZPE.d[k] = !ZPE.d[k]; zpDirty(el); sw.setAttribute('aria-checked', String(!!ZPE.d[k])); return zpFacts(el); }
    if (!b || b.disabled) return;
    const a = b.dataset.zpA, ask = async () => !ZPE.dirty || await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen');
    if (a === 'back') { if (!await ask()) return; ZPE.dirty = false; return go('st-zugangsprofil'); }
    if (a === 'refresh' || a === 'undo') { if (a === 'refresh' && !await ask()) return; await usrLoad(a === 'refresh'); ZPE.d = zpDraft(ZPE.id); ZPE.orig = zpClone(ZPE.d); ZPE.dirty = false; ZPE.show = false; return zpRender(); }
    if (a === 'new') { if (!await ask()) return; return zpOpen(null, ZPE.ids); }
    if (a === 'prev' || a === 'next') { if (!await ask()) return; const id = ZPE.ids[pos + (a === 'next' ? 1 : -1)]; if (id) zpOpen(id); return; }
    if (a === 'del') return zpRemove([ZPE.id], true);
    if (a === 'save') return zpSave();
  });
}
function zpDirty(el) { ZPE.dirty = true; $$('[data-zp-a="save"],[data-zp-a="undo"]', el).forEach(b => { b.disabled = false; }); }
function zpSet(t, el) {
  const k = t.dataset.zp; ZPE.d[k] = t.value; zpDirty(el);
  if (k === 'name') renderTopbar();
  zpFacts(el); zpBadge(el);
}
/** Die Spalte „Das bewirkt das Profil“ und die Prüfbox nach jeder Eingabe auffrischen (ohne die Felder neu zu zeichnen) */
function zpFacts(el) {
  const f = $('[data-zp-facts]', el); if (!f) return;
  const t = $('.zp-cols', el); if (!t) return;
  const sel = document.activeElement?.dataset?.zp, pos = document.activeElement?.selectionStart;
  const fresh = zpAllg().html, tmp = document.createElement('div'); tmp.innerHTML = fresh;
  const nf = $('[data-zp-facts]', tmp); if (nf) f.innerHTML = nf.innerHTML;
  zpTestRefresh(el);
  if (sel) { const a = $(`[data-zp="${sel}"]`, el); if (a && a !== document.activeElement) { a.focus(); try { a.setSelectionRange(pos, pos); } catch {} } }
}
function zpTestRefresh(el) {
  const r = zpTestResult(), box = $('[data-zp-res]', el); if (!box) return;
  box.className = 'zp-res ' + (r.ok === true ? 'ok' : r.ok === false ? 'no' : ''); box.innerHTML = `${ic(r.ok === true ? 'check' : r.ok === false ? 'x' : 'info', 'i-sm')}<span>${esc(r.t)}</span>`;
}
/** Fehlermarken und der Zähler am Reiter „Allgemein“ */
function zpBadge(el) {
  const n = zpErrors(ZPE.d).length, tb = $('[data-zp-tab="allg"]', el); if (!tb) return;
  let bd = $('.ed-badge', tb); if (!n) { bd?.remove(); return; }
  if (!bd) { bd = document.createElement('span'); bd.className = 'ed-badge'; tb.append(' ', bd); } bd.textContent = n;
}
/** Nach einer fertigen Eingabe (Verlassen des Feldes): Fehlertext je Feld zeigen */
function zpFields(el) {
  if (ZPE.tab !== 'allg') return;
  const er = new Map(zpErrors(ZPE.d).map(e => [e.k, e.t]));
  $$('[data-zp]', el).forEach(inp => {
    const lab = inp.closest('label.field'), k = inp.dataset.zp, bad = (ZPE.show || inp.dataset.touched) && er.has(k);
    lab.classList.toggle('zp-bad', !!bad); let sm = $('small.zp-err', lab);
    if (bad) { if (!sm) { sm = document.createElement('small'); sm.className = 'zp-err'; $('.ea-hint', lab)?.remove(); lab.append(sm); } sm.textContent = er.get(k); } else if (sm) sm.remove();
  });
}

/* ── Sichern ── */
async function zpSave() {
  const D = ZPE.d, O = ZPE.orig, isNew = !ZPE.id, name = String(D.name).trim(), errs = zpErrors(D);
  if (errs.length) { ZPE.tab = 'allg'; ZPE.show = true; zpRender(); return toast(errs[0].t, {t2: 'Pflichtangabe', type: 'warn'}); }
  if (stRows('zugangsprofil').some(p => p.id !== ZPE.id && zpSame(p.name || p.id, name))) { ZPE.tab = 'allg'; zpRender(); return toast('Diesen Profilnamen gibt es schon', {type: 'warn'}); }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), srt = l => [...l].map(norm).sort();
  const sensitive = !same({...D, benutzer: srt(D.benutzer), name: ''}, {...O, benutzer: srt(O.benutzer), name: ''});
  let by = S.user;
  if (sensitive && DESKTOP) { try { by = (await stepUp({title: 'Administrator-Freigabe', text: isNew ? `Neues Zugangsprofil „${name}“ anlegen` : `Zugangsprofil „${name}“ ändern (Zeiten, Adressen, Personen)`, admin: true})).by; } catch { return; } }
  try {
    const id = ZPE.id || ('zp-' + (norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || zpUid()) + '-' + zpUid());
    const rows = stRows('zugangsprofil').map(p => ({...p}));
    rows.forEach(p => { if (p.id !== id && (p.benutzer || []).some(m => D.benutzer.some(x => zpSame(x, m)))) p.benutzer = p.benutzer.filter(m => !D.benutzer.some(x => zpSame(x, m))); });   // eine Person gehört zu höchstens einem Profil
    const old = rows.find(p => p.id === id) || {};
    const {tage, von, bis, ...keep} = old;   // frühere Felder (Wochentage, von/bis) sind jetzt in Arbeitstag und Wochenende enthalten
    const rec = {...keep, id, name, ip_von: D.ip_von.trim(), ip_bis: D.ip_bis.trim(), wt_ok: !!D.wt_ok, wt_von: D.wt_von || '00:00', wt_bis: D.wt_bis || '00:00', we_ok: !!D.we_ok, we_von: D.we_von || '00:00', we_bis: D.we_bis || '00:00', benutzer: [...D.benutzer], _aktiv: true};
    const i = rows.findIndex(p => p.id === id); if (i >= 0) rows[i] = rec; else rows.push(rec);
    await stammSave('zugangsprofil', rows);
    await usrLoad();
    ZPE.id = id; ZPE.d = zpDraft(id); ZPE.orig = zpClone(ZPE.d); ZPE.dirty = false; ZPE.show = false; if (isNew) ZPE.ids = [...ZPE.ids, id];
  } catch (err) { return toast('Speichern fehlgeschlagen', {t2: String(err.message || err), type: 'warn'}); }
  toast(isNew ? 'Profil angelegt' : 'Gespeichert', {t2: `${name} · ${D.benutzer.length} ${D.benutzer.length === 1 ? 'Person' : 'Personen'}`, type: 'pos', icon: 'lock', dur: 2200});
  zpRender();
}

/* ── Löschen ── */
async function zpRemove(ids, fromMask) {
  const pr = ids.map(id => stRows('zugangsprofil').find(p => p.id === id)).filter(Boolean), abort = () => { throw new Error('abgebrochen'); };
  if (!pr.length) abort();
  const wer = pr.length === 1 ? `„${pr[0].name || pr[0].id}“` : `${pr.length} Profile`, n = pr.reduce((t, p) => t + zpNames(p.benutzer).length, 0);
  if (!await confirmBox(`${wer} löschen? ${n ? `${n} ${n === 1 ? 'Person kann' : 'Personen können'} sich danach wieder jederzeit und von überall anmelden.` : 'Niemand ist dem Profil zugeordnet.'}`, 'Löschen')) abort();
  if (DESKTOP) await stepUp({title: 'Administrator-Freigabe', text: `${wer} löschen`, admin: true}).catch(abort);
  try { await stammSave('zugangsprofil', stRows('zugangsprofil').filter(p => !ids.includes(p.id)).map(p => ({...p}))); }
  catch (e) { toast('Löschen nicht möglich', {t2: String(e), type: 'warn'}); return; }
  toast(pr.length === 1 ? 'Profil gelöscht' : `${pr.length} Profile gelöscht`, {t2: pr.map(p => p.name || p.id).join(', '), icon: 'lock', dur: 2400});
  if (fromMask) { ZPE.dirty = false; ZPE.d = null; go('st-zugangsprofil'); }
}
