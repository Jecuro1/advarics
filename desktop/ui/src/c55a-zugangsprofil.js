/* ═════════════════════════════════════════════════════════════════
   55a · ZUGANGSPROFIL (Stammdaten › Benutzer › Zugangsprofil) – Liste und Maske mit Reitern
   Ein Profil legt fest, WANN und WOHER sich die zugeordneten Personen anmelden dürfen:
   • IP-Bereich ………………… Anmeldung nur von Adressen in diesem Bereich (Handy: Adresse des Geräts, Arbeitsplatz: eigene Netzwerk-Adresse)
   • Wochentage ………………… erlaubte Tage (Mo–So); Arbeitstag = Zeit für Mo–Fr, Wochenende = Zeit für Sa und So
   • Start-/End-Zeit ………….. ab der Start-Zeit darf man sich anmelden, ab der End-Zeit nicht mehr; Start = Ende heißt ganztägig;
                                 Ende vor Start = über Mitternacht (gehört zum Tag, an dem es beginnt)
   • Zugeordnete User ………… eine Person gehört zu höchstens einem Profil; wer keinem Profil zugeordnet ist, gehört zum Standardprofil
   Das Standardprofil (jederzeit, von überall) gibt es immer; es lässt sich nicht ändern und nicht löschen.
   Administratoren sind ausgenommen (keine Selbstsperre). Die Prüfung gilt am Sperrbildschirm und bei jeder Handy-Anfrage (access.rs).
   Maßgeblich ist die Uhr dieses Rechners. Die Regeln sind hier und im Backend (access.rs) gleich – bei Änderungen beide anpassen.
   ═════════════════════════════════════════════════════════════════ */
const ZPE = {id: null, ids: [], d: null, orig: null, tab: 'allg', dirty: false, show: false};
const ZP_TABS = [['allg', 'Allgemein'], ['user', 'Zugeordnete User']];
const ZP_STD = 'STANDARD';
const ZP_WD = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
const ZP_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const ZP_TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const zpSame = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();   // wie im Backend: Leerzeichen am Rand und Groß-/Kleinschreibung zählen nicht
const zpUid = () => Math.random().toString(36).slice(2, 8);
const zpArr = v => Array.isArray(v) ? v : [];
const zpStr = v => typeof v === 'string' && v.trim() ? v.trim() : '';

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
/** Wirksame Werte eines Profils; ältere Profile (Wochentage + von/bis) und die Schalter der Fassung 0.39.0 werden unverändert übernommen */
function zpEff(p) {
  const days = Array(7).fill(true), t = zpArr(p.tage).filter(x => typeof x === 'string').map(x => x.trim().toLowerCase().slice(0, 2));
  if (t.length) ZP_WD.forEach((d, i) => { days[i] = t.includes(d); });
  if (p.wt_ok === false) for (let i = 0; i < 5; i++) days[i] = false;
  if (p.we_ok === false) { days[5] = false; days[6] = false; }
  const win = (a, b) => { const von = zpStr(p[a]) || zpStr(p.von), bis = zpStr(p[b]) || zpStr(p.bis); return {min: [zpHM(von) ?? 0, zpHM(bis) ?? 0], txt: [von, bis]}; };
  const wt = win('wt_von', 'wt_bis'), we = win('we_von', 'we_bis');
  const ipVon = zpIp(zpStr(p.ip_von)) ?? 0, ipBis = zpIp(zpStr(p.ip_bis)) ?? 4294967295;
  return {ipVon, ipBis, full: ipVon === 0 && ipBis === 4294967295, days, wt, we};
}
/** Erlaubt ein Profil die Anmeldung zu diesem Zeitpunkt von diesen Adressen? ips: null = Adresse nicht prüfbar (Arbeitsplatz ohne Netzwerk) → nur die Zeit zählt */
function zpAllows(p, at, ips) {
  const e = zpEff(p), wd = (at.getDay() + 6) % 7, m = at.getHours() * 60 + at.getMinutes(), y = (wd + 6) % 7;
  const win = d => d >= 5 ? e.we : e.wt;
  const starts = w => w[0] === w[1] ? true : w[0] < w[1] ? m >= w[0] && m < w[1] : m >= w[0];
  const heute = e.days[wd] && starts(win(wd).min);
  const carry = e.days[y] && win(y).min[0] > win(y).min[1] && m < win(y).min[1];   // Rest eines Fensters über Mitternacht von gestern
  if (!heute && !carry) {
    if (!e.days[wd]) return {ok: false, grund: `Anmeldung am ${ZP_TAGE[wd]} nicht erlaubt (Zugangsprofil)`};
    const [von, bis] = win(wd).txt;
    return {ok: false, grund: `Anmeldung ${wd >= 5 ? 'am Wochenende' : 'an Arbeitstagen'} nur von ${von || '00:00'} bis ${bis || '00:00'} Uhr erlaubt (Zugangsprofil)`};
  }
  if (!e.full && ips && !ips.some(ip => { const n = zpIp(ip); return n != null && n >= e.ipVon && n <= e.ipBis; })) return {ok: false, grund: 'Anmeldung von diesem Netzwerk aus nicht erlaubt (Zugangsprofil)'};
  return {ok: true};
}
/** Adressen dieses Arbeitsplatzes (Desktop-App; in der Vorschau unbekannt) */
const ZP_NET = {ips: [], loaded: false};
async function zpNetLoad() {
  if (!DESKTOP) { ZP_NET.loaded = true; return; }
  try { ZP_NET.ips = await invoke('access_ips'); } catch { ZP_NET.ips = []; }
  ZP_NET.loaded = true;
}
/** Darf sich die Person jetzt hier anmelden? Mehrere Profile: ein erlaubendes genügt. Administratoren sind ausgenommen; das Standardprofil schränkt nie ein. */
function accessCheck(name, roleKey, at = new Date(), ips = ZP_NET.ips.length ? ZP_NET.ips : null) {
  if (roleKey === 'admin') return {ok: true};
  const ps = stActive('zugangsprofil').filter(p => p.id !== ZP_STD && zpArr(p.benutzer).some(b => typeof b === 'string' && zpSame(b, name)));
  if (!ps.length) return {ok: true};
  const rs = ps.map(p => zpAllows(p, at, ips));
  return rs.find(r => r.ok) || rs[0];
}

/* ── Standardprofil: gibt es immer, auch wenn es nicht gespeichert ist ── */
const zpStdRow = () => ({id: ZP_STD, name: 'Standard', ip_von: '0.0.0.0', ip_bis: '255.255.255.255', tage: [], wt_von: '00:00', wt_bis: '00:00', we_von: '00:00', we_bis: '00:00', benutzer: [], _aktiv: true, _std: true});
const zpAll = () => { const l = stRows('zugangsprofil').map(p => p.id === ZP_STD ? {...zpStdRow(), ...{_pos: p._pos}} : p); return l.some(p => p.id === ZP_STD) ? l : [zpStdRow(), ...l]; };
/** Wer gehört (ohne eigenes, wirksames Profil) zum Standardprofil? */
const zpStdMembers = () => { const mine = new Set(); stActive('zugangsprofil').filter(p => p.id !== ZP_STD).forEach(p => zpArr(p.benutzer).forEach(n => mine.add(String(n).trim().toLowerCase()))); return USR.all.filter(u => !mine.has(String(u.name).trim().toLowerCase())); };

/* ── Beschreibungen ── */
const zpIpText = e => {
  if (e.full) return 'alle Adressen';
  const f = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'), n = e.ipBis - e.ipVon + 1;
  return `${f(e.ipVon)} – ${f(e.ipBis)}${n > 0 ? ` (${num(n)} ${n === 1 ? 'Adresse' : 'Adressen'})` : ''}`;
};
/** „Mo Di · 08:00 – 17:00 Uhr“, „ganztägig“ oder „gesperrt“ für die Tage von…bis (0–4 Arbeitstage, 5–6 Wochenende) */
const zpGroupText = (e, from, to) => {
  const on = e.days.slice(from, to).map((x, i) => x ? ZP_KURZ[from + i] : null).filter(Boolean); if (!on.length) return 'gesperrt';
  const w = from >= 5 ? e.we : e.wt, [a, b] = w.min, txt = a === b ? 'ganztägig' : `${w.txt[0] || '00:00'} – ${w.txt[1] || '00:00'} Uhr${a > b ? ' (über Mitternacht)' : ''}`;
  return on.length === to - from ? txt : `${on.join(' ')} · ${txt}`;
};
const zpNames = l => zpArr(l).filter(x => typeof x === 'string' && x.trim());

/* ── Zustand ── */
const zpRec = p => { const e = zpEff(p), n = k => zpStr(p[k]);
  return {id: p.id, std: p.id === ZP_STD, name: p.name || '', ip_von: n('ip_von') || '0.0.0.0', ip_bis: n('ip_bis') || '255.255.255.255', days: [...e.days],
    wt_von: e.wt.txt[0] || '00:00', wt_bis: e.wt.txt[1] || '00:00', we_von: e.we.txt[0] || '00:00', we_bis: e.we.txt[1] || '00:00', benutzer: zpNames(p.benutzer), _aktiv: p._aktiv !== false}; };
const zpNeu = () => ({id: '', std: false, name: '', ip_von: '0.0.0.0', ip_bis: '255.255.255.255', days: Array(7).fill(true), wt_von: '00:00', wt_bis: '00:00', we_von: '00:00', we_bis: '00:00', benutzer: [], _aktiv: true});
const zpDraft = id => { const p = id ? zpAll().find(x => x.id === id) : null; return p ? zpRec(p) : zpNeu(); };
const zpClone = d => JSON.parse(JSON.stringify(d));
/** Arbeitsstand der Maske → Profil in der gespeicherten Form (wie es zpEff/zpAllows und das Backend lesen) */
const zpProf = d => ({ip_von: String(d.ip_von ?? '').trim(), ip_bis: String(d.ip_bis ?? '').trim(), tage: d.days.every(Boolean) ? [] : ZP_KURZ.filter((_, i) => d.days[i]), wt_von: d.wt_von || '00:00', wt_bis: d.wt_bis || '00:00', we_von: d.we_von || '00:00', we_bis: d.we_bis || '00:00'});
const zpLocked = () => !!ZPE.d?.std;

/* Fehler je Feld: Pflichtfelder und gültige Angaben */
function zpErrors(d) {
  if (d.std) return [];
  const m = [], a = zpIp(d.ip_von), b = zpIp(d.ip_bis);
  if (String(d.name).trim().length < 2) m.push({k: 'name', t: 'Name angeben (mindestens 2 Zeichen)'});
  if (a == null) m.push({k: 'ip_von', t: 'IP Bereich von: gültige Adresse eintragen, z. B. 192.168.1.0'});
  if (b == null) m.push({k: 'ip_bis', t: 'IP Bereich bis: gültige Adresse eintragen, z. B. 192.168.1.255'});
  if (a != null && b != null && a > b) m.push({k: 'ip_bis', t: 'IP Bereich bis darf nicht vor „von“ liegen'});
  for (const [k, l] of [['wt_von', 'Arbeitstag-Start-Zeit'], ['wt_bis', 'Arbeitstag-End-Zeit'], ['we_von', 'Wochenend-Start-Zeit'], ['we_bis', 'Wochenend-End-Zeit']]) if (zpHM(d[k]) == null) m.push({k, t: `${l}: Uhrzeit im Format 08:30`});
  if (!d.days.some(Boolean)) m.push({k: 'days', t: 'Mindestens ein Wochentag muss erlaubt sein'});
  return m;
}

/* ── Liste ── */
function zpRows() {
  const usr = new Map(USR.all.map(u => [String(u.name).trim().toLowerCase(), u])), std = zpStdMembers().map(u => u.name);
  return zpAll().map(p => { const e = zpEff(p), std1 = p.id === ZP_STD, l = std1 ? std : zpNames(p.benutzer);
    return {id: p.id, name: p.name || p.id, aktiv: p._aktiv !== false, ip: zpIpText(e), wt: zpGroupText(e, 0, 5), we: zpGroupText(e, 5, 7), personen: l.length, benutzer: l.map(n => usr.get(String(n).trim().toLowerCase())?.name || n).join(', ')}; });
}
agridPage('st-zugangsprofil', {
  title: 'Zugangsprofil', rows: zpRows, count: () => zpAll().length, sort: {k: 'name', dir: 1}, rowH: 44,
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'name', l: 'Name', w: 220}, {k: 'aktiv', l: 'Aktiv', t: 'check', w: 70}, {k: 'ip', l: 'IP-Bereich', w: 280}, {k: 'wt', l: 'Arbeitstage (Mo–Fr)', w: 210}, {k: 'we', l: 'Wochenende (Sa, So)', w: 210}, {k: 'personen', l: 'Personen', t: 'num', w: 90}, {k: 'benutzer', l: 'Zugeordnete User', w: 300}],
  remove: ids => zpRemove(ids),
  actions: {back: () => e2Back(), refresh: () => PAGES['st-zugangsprofil'].render(true), new: () => zpOpen(null, [])},
  edit: id => zpOpen(id, (AG['st-zugangsprofil'].filtered || []).map(r => r.id)),
});
{ const p = PAGES['st-zugangsprofil'], _r = p.render; p.render = async fresh => { await usrLoad(fresh === true); await _r(); renderTopbar(); }; }
VIEW_PERM['st-zugangsprofil'] = 'system';

/* ── Maske ── */
function zpOpen(id, ids) {
  ZPE.id = id; ZPE.ids = ids?.length ? ids : ZPE.ids; ZPE.d = zpDraft(id); ZPE.orig = zpClone(ZPE.d); ZPE.tab = 'allg'; ZPE.dirty = false; ZPE.show = false;
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
const zpIn = (k, l, o = {}) => { const er = ZPE.show && zpErr(k), dis = zpLocked() || o.dis; return `<label class="field ${er ? 'zp-bad' : ''}"><span>${esc(l)}</span><input class="input ${o.mono ? 'mono' : ''}" ${o.type ? `type="${o.type}"` : ''} data-zp="${k}" value="${esc(ZPE.d[k] ?? '')}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} autocomplete="off" ${dis ? 'disabled' : ''} ${er ? `aria-invalid="true" aria-describedby="zp-e-${k}"` : ''}>${er ? `<small class="zp-err" id="zp-e-${k}" role="alert">${esc(er.t)}</small>` : o.hint ? `<small class="ea-hint">${esc(o.hint)}</small>` : ''}</label>`; };
const zpSw = (k, l, hint) => `<div class="ue-sw"><label class="ea-sw"><button type="button" class="switch" role="switch" data-zp-sw="${k}" aria-checked="${!!ZPE.d[k]}" ${zpLocked() ? 'disabled' : ''}></button><span>${esc(l)}</span></label>${hint ? `<small class="ea-hint">${esc(hint)}</small>` : ''}</div>`;
const zpCard = (h, inner, cls = '') => `<div class="ae-card ea-card ${cls}">${h ? `<h4>${esc(h)}</h4>` : ''}${inner}</div>`;
/** Wochentage als Auswahlknöpfe (Gruppe Arbeitstag: 0–4, Wochenende: 5–6) */
const zpDays = (from, to, label) => `<div class="zp-days" role="group" aria-label="${esc(label)}">${ZP_KURZ.slice(from, to).map((t, i) => `<button type="button" class="chip zp-day" data-zp-day="${from + i}" aria-pressed="${!!ZPE.d.days[from + i]}" title="${ZP_TAGE[from + i]}" ${zpLocked() ? 'disabled' : ''}>${t}</button>`).join('')}</div>`;
const zpGrpOff = (from, to) => !ZPE.d.days.slice(from, to).some(Boolean);

/** Prüfbox: Wäre die Anmeldung zu diesem Zeitpunkt von dieser Adresse erlaubt? (Arbeitsplatz-Adresse und aktuelle Uhrzeit vorbelegt) */
const ZP_TEST = {tag: null, zeit: '', ip: ''};
function zpTestInit() {
  const n = new Date(); if (ZP_TEST.tag == null) ZP_TEST.tag = n.getDay();
  if (!ZP_TEST.zeit) ZP_TEST.zeit = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  if (!ZP_TEST.ip) ZP_TEST.ip = ZP_NET.ips[0] || '';
}
function zpTestResult() {
  const d = ZPE.d; if (zpErrors(d).length) return {ok: null, t: 'Erst die Pflichtangaben ausfüllen'};
  const hm = zpHM(ZP_TEST.zeit); if (hm == null) return {ok: null, t: 'Uhrzeit im Format 08:30 eingeben'};
  const ip = String(ZP_TEST.ip || '').trim(); if (ip && zpIp(ip) == null) return {ok: null, t: 'Adresse im Format 192.168.1.20 eingeben'};
  const at = new Date(2026, 0, 4 + (+ZP_TEST.tag)); at.setHours(Math.floor(hm / 60), hm % 60, 0, 0);   // 4.1.2026 war ein Sonntag
  const r = zpAllows(zpProf(d), at, ip ? [ip] : null);
  return r.ok ? {ok: true, t: 'Anmeldung erlaubt'} : {ok: false, t: r.grund.replace(' (Zugangsprofil)', '')};
}
function zpTestHTML() {
  zpTestInit(); const r = zpTestResult();
  return `<div class="zp-test"><div class="zp-test-row"><label class="field"><span>Wochentag</span><select class="input select" data-zp-t="tag">${[1, 2, 3, 4, 5, 6, 0].map(i => `<option value="${i}" ${+ZP_TEST.tag === i ? 'selected' : ''}>${ZP_TAGE[(i + 6) % 7]}</option>`).join('')}</select></label>
    <label class="field"><span>Uhrzeit</span><input class="input" type="time" data-zp-t="zeit" value="${esc(ZP_TEST.zeit)}"></label>
    <label class="field"><span>IP-Adresse</span><input class="input mono" data-zp-t="ip" value="${esc(ZP_TEST.ip)}" placeholder="192.168.1.20" inputmode="decimal" autocomplete="off"></label></div>
    <div class="zp-res ${r.ok === true ? 'ok' : r.ok === false ? 'no' : ''}" data-zp-res role="status" aria-live="polite">${ic(r.ok === true ? 'check' : r.ok === false ? 'x' : 'info', 'i-sm')}<span>${esc(r.t)}</span></div></div>`;
}
function zpAllg() {
  const D = ZPE.d, names = D.std ? zpStdMembers().map(u => u.name) : zpNames(D.benutzer), n = zpErrors(D).length, e = zpEff(zpProf(D));
  const fact = (l, v) => `<div class="ge-fact"><span>${esc(l)}</span><b>${v}</b></div>`;
  const jetzt = n ? null : zpAllows(zpProf(D), new Date(), ZP_NET.ips.length ? ZP_NET.ips : null);
  return {html: `${D.std ? `<div class="zp-note">${ic('lock', 'i-sm')}<span><b>Standardprofil.</b> Es gilt für alle Personen, die keinem anderen Profil zugeordnet sind: jederzeit und von überall. Es lässt sich weder ändern noch löschen.</span></div>` : ''}<div class="ue-cols2 ge-2 zp-cols">
    ${zpCard('Zugangsprofil', `<div class="ea-fields ge-one">
      ${D.std ? '' : zpSw('_aktiv', 'Aktiv', 'Abgeschaltete Profile gelten nicht; ihre Personen gehören dann zum Standardprofil.')}
      ${zpIn('name', 'Name *', {hint: D.std ? '' : 'z. B. „Büro“, „Filiale Innsbruck“ oder „Nur Kassenzeiten“.'})}
      ${zpIn('ip_von', 'IP Bereich von *', {mono: true, ph: '0.0.0.0', inputmode: 'decimal', hint: D.std ? '' : 'Erste erlaubte IPv4-Adresse. Für eine einzelne feste Adresse tragen Sie bei „von“ und „bis“ dieselbe Adresse ein.'})}${zpIn('ip_bis', 'IP Bereich bis *', {mono: true, ph: '255.255.255.255', inputmode: 'decimal', hint: D.std ? '' : 'Letzte erlaubte Adresse. 0.0.0.0 bis 255.255.255.255 = von überall; für ein Netz z. B. 192.168.1.0 bis 192.168.1.255.'})}
      <div class="zp-grp"><b>Arbeitstag <small>Montag bis Freitag</small></b>${zpDays(0, 5, 'Erlaubte Arbeitstage')}<div class="zp-pair">${zpIn('wt_von', 'Arbeitstag-Start-Zeit', {type: 'time', dis: zpGrpOff(0, 5)})}${zpIn('wt_bis', 'Arbeitstag-End-Zeit', {type: 'time', dis: zpGrpOff(0, 5)})}</div></div>
      <div class="zp-grp"><b>Wochenende <small>Samstag und Sonntag</small></b>${zpDays(5, 7, 'Erlaubte Tage am Wochenende')}<div class="zp-pair">${zpIn('we_von', 'Wochenend-Start-Zeit', {type: 'time', dis: zpGrpOff(5, 7)})}${zpIn('we_bis', 'Wochenend-End-Zeit', {type: 'time', dis: zpGrpOff(5, 7)})}</div></div>
      ${ZPE.show && zpErr('days') ? `<small class="zp-err" role="alert">${esc(zpErr('days').t)}</small>` : ''}
      <small class="ea-hint">Start-Zeit: ab dieser Uhrzeit dürfen sich die Personen anmelden. End-Zeit: ab dieser Uhrzeit nicht mehr. Start und Ende gleich (00:00 – 00:00) heißt ganztägig; liegt das Ende vor dem Start, gilt das Fenster über Mitternacht (22:00 – 06:00) und gehört zum Tag, an dem es beginnt.</small></div>`)}
    ${zpCard('Das bewirkt das Profil', `<div class="ge-facts" data-zp-facts>${fact('Personen', names.length ? `${names.length} · ${esc(names.join(', '))}` : 'noch niemand')}${fact('IP-Bereich', esc(zpIpText(e)))}${fact('Arbeitstage', esc(zpGroupText(e, 0, 5)))}${fact('Wochenende', esc(zpGroupText(e, 5, 7)))}
      ${fact('Jetzt', jetzt ? (jetzt.ok ? '<span class="pill pos" style="height:22px">erlaubt</span>' : `<span class="pill neg" style="height:22px">gesperrt</span> <span class="muted">${esc(jetzt.grund.replace(' (Zugangsprofil)', ''))}</span>`) : '<span class="muted">Angaben unvollständig</span>')}</div>
      <p class="ea-hint">Wer dem Profil zugeordnet ist, kann sich nur so anmelden: am Sperrbildschirm und am Handy (dort bei jeder Anfrage). Ohne Profil gilt das Standardprofil. Administratoren sind ausgenommen – so kann sich niemand selbst aussperren. Maßgeblich ist die Uhr dieses Kassen-PCs, nicht die Uhr des Handys.${DESKTOP && !ZP_NET.ips.length ? ' Dieser Arbeitsplatz hat gerade keine Netzwerk-Adresse; die Adresse wird dann nicht geprüft, die Zeit schon.' : ''}</p>
      <p class="ea-hint zp-warn"><b>Mit Vorsicht einsetzen:</b> Wechselt die Adresse (mehrere Internetanschlüsse, WLAN und Mobilfunk beim Handy), sperrt die Adressprüfung Personen aus. Mit „ausprobieren“ lässt sich das vorher testen.</p>
      <h4 style="margin-top:14px">Anmeldung ausprobieren</h4>${zpTestHTML()}`)}
  </div>`};
}

/* Zugeordnete User: zwei Tabellen „Zugeordnet“ / „Nicht zugeordnet“ (Zeilen ziehen oder doppelklicken) */
function zpUserRows(on) {
  const D = ZPE.d, keys = new Set(D.benutzer.map(x => String(x).trim().toLowerCase())), other = new Map(), grp = new Map();
  zpAll().forEach(p => { if (p.id !== D.id && p.id !== ZP_STD && p._aktiv !== false) zpNames(p.benutzer).forEach(m => other.set(String(m).trim().toLowerCase(), p.name || p.id)); });
  stRows('benutzergruppe').forEach(g => zpNames(g.mitglieder).forEach(m => grp.set(String(m).trim().toLowerCase(), g.name || g.id)));
  const mk = u => { const [vn, nn] = usrSplit(u), k = String(u.name).trim().toLowerCase();
    return {id: u.id, nr: u.nr || '', name: nn || u.name, vorname: vn, aktiv: u.active !== false, gruppe: grp.get(k) || '', anderes: other.get(k) || '', admin: u.role === 'admin'}; };
  if (D.std) return on ? zpStdMembers().map(mk) : USR.all.filter(u => !zpStdMembers().includes(u)).map(mk);
  const rows = USR.all.filter(u => keys.has(String(u.name).trim().toLowerCase()) === on).map(mk);
  if (on) D.benutzer.filter(m => !USR.all.some(u => zpSame(u.name, m))).forEach(m => rows.push({id: 'n:' + m, nr: '', name: m, vorname: '', aktiv: true, gruppe: '', anderes: '', admin: false}));   // Name ohne Person an diesem Standort
  return rows;
}
const zpUserName = id => String(id).startsWith('n:') ? String(id).slice(2) : USR.all.find(u => u.id === id)?.name;
function zpUser() {
  const D = ZPE.d;
  if (D.std) return {html: `<p class="ea-hint ue-note">Zum Standardprofil gehört, wer keinem anderen Profil zugeordnet ist. Die Zuordnung ändern Sie im jeweiligen Profil oder in der Maske „Benutzer“ (Feld „Zugangsprofil“).</p>
      <div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnet</h4><div data-aeg="a"></div></div></div>`,
    mount: el => { AG['zp-a'] = agNew({embed: true, sort: {k: 'nr', dir: 1}, title: 'Zugeordnet', cols: zpCols(), rows: () => zpUserRows(true), edit: id => usrOpen(id, [])}); agMount('zp-a', $('[data-aeg="a"]', el)); }};
  return {html: `<p class="ea-hint ue-note">Eine Person gehört zu höchstens einem Zugangsprofil: Wer hier zugeordnet wird, wird aus dem bisherigen Profil entfernt. Wer keinem Profil zugeordnet ist, gehört zum Standardprofil. Die Zuordnung lässt sich auch in der Maske „Benutzer“ ändern. Administratoren sind von jedem Profil ausgenommen.</p>
    <div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnet</h4><div data-aeg="a"></div></div><div class="ae-card"><h4>Nicht zugeordnet</h4><div data-aeg="b"></div></div></div>`,
    mount: el => {
      const mv = (ids, add) => { const s = ZPE.d.benutzer.slice(); ids.map(zpUserName).filter(Boolean).forEach(n => { const i = s.findIndex(x => zpSame(x, n)); if (add && i < 0) s.push(n); if (!add && i >= 0) s.splice(i, 1); }); ZPE.d.benutzer = s; zpDirty(el); zpRender(); };
      const mk = (key, h, cfg) => { AG[key] = agNew({embed: true, sort: {k: 'nr', dir: 1}, ...cfg}); agMount(key, h); };
      const [da, db] = agDual('zp-a', 'zp-b', mv);
      mk('zp-a', $('[data-aeg="a"]', el), {title: 'Zugeordnet', cols: zpCols(), rows: () => zpUserRows(true), dnd: da, edit: id => mv([id], false), extra: [{k: 'rm', l: 'Entfernen', icon: 'x'}], actions: {rm: () => { const s = [...AG['zp-a'].sel]; if (s.length) mv(s, false); }}});
      mk('zp-b', $('[data-aeg="b"]', el), {title: 'Nicht zugeordnet', cols: zpCols('b'), rows: () => zpUserRows(false), dnd: db, edit: id => mv([id], true), extra: [{k: 'add', l: 'Zuordnen', icon: 'plus'}], actions: {add: () => { const s = [...AG['zp-b'].sel]; if (s.length) mv(s, true); }}});
    }};
}
/** Spalten wie im Vorbild (Nr., Name, Vorname, Aktiv, Benutzergruppe); bei „Nicht zugeordnet“ davor das bisherige Profil */
function zpCols(side) {
  const c = [{k: 'nr', l: 'Nr.', t: 'num', w: 52}, {k: 'name', l: 'Name', w: 120, get: r => r.name, html: r => `${esc(r.name)}${r.admin ? ' <span class="pill" style="height:20px" title="Administratoren sind von Zugangsprofilen ausgenommen">ausgenommen</span>' : ''}`}, {k: 'vorname', l: 'Vorname', w: 100}];
  if (side === 'b') c.push({k: 'anderes', l: 'Bisheriges Profil', w: 130, html: r => r.anderes ? `<span class="pill warn" style="height:20px" title="Wird beim Zuordnen aus diesem Profil entfernt">${esc(r.anderes)}</span>` : '', get: r => r.anderes});
  c.push({k: 'aktiv', l: 'Aktiv', t: 'check', w: 56}, {k: 'gruppe', l: 'Benutzergruppe', w: 130});
  return c;
}

function zpRender() {
  const host = $('#view-zugangsprofil-edit'); if (!host || !ZPE.d) return;
  const D = ZPE.d, lock = D.std, pos = ZPE.ids.indexOf(ZPE.id), el = document.createElement('div'); el.className = 'ae ue ge zp'; host.replaceChildren(el);
  const btn = (a, icon, l, dis, text = true) => `<button class="ag-btn" data-zp-a="${a}" title="${esc(l)}" aria-label="${esc(l)}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}${text ? `<span>${l}</span>` : ''}</button>`;
  const miss = zpErrors(D);
  const tab = ([k, l]) => { const n = k === 'allg' ? miss.length : 0; return `<button type="button" class="ed-tab" role="tab" data-zp-tab="${k}" aria-selected="${ZPE.tab === k}">${esc(l)}${n ? ` <span class="ed-badge">${n}</span>` : ''}</button>`; };
  const body = (ZPE.tab === 'user' ? zpUser : zpAllg)();
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Übersicht: Zugangsprofil')}${btn('refresh', 'sync', 'Aktualisieren', !ZPE.id)}${btn('save', 'check', 'Sichern', lock || !ZPE.dirty)}${btn('new', 'plus', 'Neu', !ZPE.id)}${btn('undo', 'undo', 'Änderungen zurücknehmen', lock || !ZPE.dirty)}${btn('del', 'trash', 'Löschen', !ZPE.id || lock)}
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
    const t = e.target, tb = t.closest('[data-zp-tab]'), b = t.closest('[data-zp-a]'), sw = t.closest('[data-zp-sw]'), dy = t.closest('[data-zp-day]');
    if (tb) { ZPE.tab = tb.dataset.zpTab; return zpRender(); }
    if (sw && !sw.disabled) { const k = sw.dataset.zpSw; ZPE.d[k] = !ZPE.d[k]; zpDirty(el); sw.setAttribute('aria-checked', String(!!ZPE.d[k])); return zpFacts(el); }
    if (dy && !dy.disabled) { const i = +dy.dataset.zpDay; ZPE.d.days[i] = !ZPE.d.days[i]; zpDirty(el); zpRender(); return; }
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
  const tmp = document.createElement('div'); tmp.innerHTML = zpAllg().html;
  const nf = $('[data-zp-facts]', tmp); if (nf) f.innerHTML = nf.innerHTML;
  zpTestRefresh(el);
}
function zpTestRefresh(el) {
  const r = zpTestResult(), box = $('[data-zp-res]', el); if (!box) return;
  box.className = 'zp-res ' + (r.ok === true ? 'ok' : r.ok === false ? 'no' : ''); box.innerHTML = `${ic(r.ok === true ? 'check' : r.ok === false ? 'x' : 'info', 'i-sm')}<span>${esc(r.t)}</span>`;
}
/** Zähler am Reiter „Allgemein“ */
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
    if (bad) { if (!sm) { sm = document.createElement('small'); sm.className = 'zp-err'; sm.setAttribute('role', 'alert'); $('.ea-hint', lab)?.remove(); lab.append(sm); } sm.textContent = er.get(k); } else if (sm) sm.remove();
  });
}

/* ── Sichern ── */
async function zpSave() {
  const D = ZPE.d, O = ZPE.orig, isNew = !ZPE.id, name = String(D.name).trim(), errs = zpErrors(D);
  if (D.std) return;
  if (errs.length) { ZPE.tab = 'allg'; ZPE.show = true; zpRender(); return toast(errs[0].t, {t2: 'Angabe prüfen', type: 'warn'}); }
  if (zpAll().some(p => p.id !== ZPE.id && zpSame(p.name || p.id, name))) { ZPE.tab = 'allg'; zpRender(); return toast('Diesen Profilnamen gibt es schon', {type: 'warn'}); }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), srt = l => [...l].map(x => String(x).trim().toLowerCase()).sort();
  const sensitive = !same({...D, benutzer: srt(D.benutzer), name: ''}, {...O, benutzer: srt(O.benutzer), name: ''});
  if (sensitive && DESKTOP) { try { await stepUp({title: 'Administrator-Freigabe', text: isNew ? `Neues Zugangsprofil „${name}“ anlegen` : `Zugangsprofil „${name}“ ändern (Tage, Zeiten, Adressen, Personen)`, admin: true}); } catch { return; } }
  try {
    const id = ZPE.id || ('zp-' + (norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || zpUid()) + '-' + zpUid());
    const rows = stRows('zugangsprofil').map(p => ({...p}));
    rows.forEach(p => { if (p.id !== id && p.id !== ZP_STD && zpArr(p.benutzer).some(m => D.benutzer.some(x => zpSame(x, m)))) p.benutzer = p.benutzer.filter(m => !D.benutzer.some(x => zpSame(x, m))); });   // eine Person gehört zu höchstens einem Profil
    const old = rows.find(p => p.id === id) || {};
    const {tage, von, bis, wt_ok, we_ok, ...keep} = old;   // frühere Felder (Wochentage, von/bis, Schalter) sind jetzt in Tagen und Zeiten enthalten
    const rec = {...keep, id, name, ...zpProf(D), benutzer: [...D.benutzer], _aktiv: D._aktiv !== false};
    const i = rows.findIndex(p => p.id === id); if (i >= 0) rows[i] = rec; else rows.push(rec);
    await stammSave('zugangsprofil', rows);
    await usrLoad();
    ZPE.id = id; ZPE.d = zpDraft(id); ZPE.orig = zpClone(ZPE.d); ZPE.dirty = false; ZPE.show = false; if (isNew) ZPE.ids = [...ZPE.ids, id];
  } catch (err) { return toast('Speichern fehlgeschlagen', {t2: String(err.message || err), type: 'warn'}); }
  toast(isNew ? 'Profil angelegt' : 'Gespeichert', {t2: `${name} · ${D.benutzer.length} ${D.benutzer.length === 1 ? 'Person' : 'Personen'}`, type: 'pos', icon: 'lock', dur: 2200});
  zpRender();
}

/* ── Löschen (das Standardprofil nicht) ── */
async function zpRemove(ids, fromMask) {
  const abort = () => { throw new Error('abgebrochen'); };
  if (ids.includes(ZP_STD)) { toast('Das Standardprofil lässt sich nicht löschen', {t2: 'Es gilt für alle Personen ohne eigenes Profil', icon: 'lock'}); if (ids.length === 1) abort(); ids = ids.filter(i => i !== ZP_STD); }
  const pr = ids.map(id => stRows('zugangsprofil').find(p => p.id === id)).filter(Boolean);
  if (!pr.length) abort();
  const wer = pr.length === 1 ? `„${pr[0].name || pr[0].id}“` : `${pr.length} Profile`, n = pr.reduce((t, p) => t + zpNames(p.benutzer).length, 0);
  if (!await confirmBox(`${wer} löschen? ${n ? `${n} ${n === 1 ? 'Person gehört' : 'Personen gehören'} danach zum Standardprofil (jederzeit, von überall).` : 'Niemand ist dem Profil zugeordnet.'}`, 'Löschen')) abort();
  if (DESKTOP) await stepUp({title: 'Administrator-Freigabe', text: `${wer} löschen`, admin: true}).catch(abort);
  try { await stammSave('zugangsprofil', stRows('zugangsprofil').filter(p => !ids.includes(p.id)).map(p => ({...p}))); }
  catch (e) { toast('Löschen nicht möglich', {t2: String(e), type: 'warn'}); return; }
  toast(pr.length === 1 ? 'Profil gelöscht' : `${pr.length} Profile gelöscht`, {t2: pr.map(p => p.name || p.id).join(', '), icon: 'lock', dur: 2400});
  if (fromMask) { ZPE.dirty = false; ZPE.d = null; go('st-zugangsprofil'); }
}
