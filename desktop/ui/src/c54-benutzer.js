/* ═════════════════════════════════════════════════════════════════
   54 · BENUTZER (Stammdaten › Benutzer › Benutzer) – Liste und Maske mit Reitern
   Jede Angabe hat eine Wirkung im Programm:
   • Foto ………………………… Anmeldebildschirm, Seitenleiste, Freigabe-Fenster, Liste
   • Name auf dem Bon ……… Kassenbon, Bon-Mail (leer = Vorname)
   • Verkäufer:in ………….. Auswahl je Position an der Kasse und bei der Bon-Zuordnung
   • Kontor mobil ………….. Anmeldung am Handy/Tablet (Handy & Tablet)
   • Benutzergruppe, Zugangsprofil, Meldungen … die gleichnamigen Stammdaten-Tabellen (Zuordnung nach Name)
   • Filialen ………………….. Anmeldung nur an zugeordneten Filialen (Administratoren immer)
   • E-Mail Firma …………… Empfänger von E-Mail-Meldungen
   • Rolle ……………………….. Rechte-Matrix (Rollen & Rechte) · PIN, 2FA, Passwort, Windows Hello … Anmeldung
   ═════════════════════════════════════════════════════════════════ */
const USR = {all: [], defaults: new Set(), defaultsOk: false, defaultsBusy: false};
const UE = {id: null, ids: [], d: null, orig: null, tab: 'allg', dirty: false, pin: '', pin2: ''};
const UE_TABS = [['allg', 'Allgemein'], ['adresse', 'Haupt-Adresse'], ['filialen', 'Zugeordnete Filialen'], ['meldungen', 'Benachrichtigungen'], ['rechte', 'Rechte'], ['login', 'Anmeldung']];
const UE_KANAL = [['hinweis', 'Hinweis in Kontor'], ['mail', 'E-Mail'], ['beides', 'Hinweis + E-Mail']];
const usrName = d => `${d.vorname || ''} ${d.nachname || ''}`.replace(/\s+/g, ' ').trim();
/** Vorname/Name: aus dem Profil, sonst aus dem gespeicherten Namen (ein einzelnes Wort gilt als Name) */
const usrSplit = u => {
  const p = u.profile || {}; if (p.vorname || p.nachname) return [p.vorname || '', p.nachname || ''];
  const parts = String(u.name || '').trim().split(/\s+/).filter(Boolean); if (parts.length < 2) return ['', parts[0] || ''];
  return [parts[0], parts.slice(1).join(' ')];
};

async function usrLoad(fresh) {
  if (DESKTOP) {
    try { USR.all = await invoke('users_all'); } catch (e) { USR.all = []; toast('Benutzer konnten nicht geladen werden', {t2: String(e), type: 'warn'}); }
    usrDefaults(fresh);
    await Promise.all([loadSecurity(), loadAuth()]);
  } else USR.all = STAFF.map((s, i) => ({id: s.id, name: s.name, role: s.roleKey || 'verkauf', active: true, nr: 1001 + i, profile: {}}));
  await loadStamm(true);   // Gruppen, Zugangsprofile und Meldungen immer frisch (auch nach Abgleich mit der Zentrale)
}
/** Wer noch die ausgelieferte Erst-PIN hat: rechenintensiv, darum im Hintergrund – nur beim ersten Mal, nach einer PIN-Änderung oder auf Wunsch */
function usrDefaults(fresh) {
  if (!DESKTOP || USR.defaultsBusy || (USR.defaultsOk && !fresh)) return;
  USR.defaultsBusy = true;
  invoke('users_default_pins').then(l => { USR.defaults = new Set(l.map(x => x.replace(/\s+\d+$/, ''))); USR.defaultsOk = true; })
    .catch(() => { USR.defaults = new Set(); USR.defaultsOk = true; })   // kein stilles Dauerfeuer bei Fehlern – erneut nur auf Wunsch (Aktualisieren)
    .finally(() => { USR.defaultsBusy = false; if (S.view === 'benutzer') PAGES.benutzer.render(); else if (S.view === 'benutzer-edit' && UE.tab === 'login') usrRender(); });
}
/** Gespeicherte Person → Arbeitsstand der Maske (Gruppe, Zugangsprofil und Meldungen kommen aus den Stammdaten) */
function usrRec(u) {
  const p = u.profile || {}, [vn, nn] = usrSplit(u), same = m => norm(m) === norm(u.name);
  return {id: u.id, nr: u.nr || 0, vorname: vn, nachname: nn, bonname: p.bonname || '', foto: fotoOk(p.foto), active: u.active !== false, role: u.role || 'kasse', verkaeufer: p.verkaeufer !== false, mobil: p.mobil !== false,
    tel: p.tel || '', handy: p.handy || '', email: p.email || '', telPriv: p.telPriv || '', handyPriv: p.handyPriv || '', emailPriv: p.emailPriv || '',
    strasse: p.strasse || '', hausnr: p.hausnr || '', zusatz: p.zusatz || '', plz: p.plz || '', ort: p.ort || '', bundesland: p.bundesland || '', land: p.land || 'AT',
    filialen: [...(p.filialen || [])],
    gruppe: stRows('benutzergruppe').find(g => (g.mitglieder || []).some(same))?.id || '', zugang: stRows('zugangsprofil').find(z => (z.benutzer || []).some(same))?.id || '',
    meldungen: stRows('meldung').filter(m => m.empfaenger === u.name).map(m => ({id: m.id, ereignis: m.ereignis, kanal: m.kanal || 'hinweis', email: m.email || ''})),
    geaendert: u.updated || '', _name: u.name};
}
const usrNeu = () => ({id: '', nr: Math.max(1000, ...USR.all.map(u => u.nr || 0)) + 1, vorname: '', nachname: '', bonname: '', foto: '', active: true, role: 'kasse', verkaeufer: true, mobil: true,
  tel: '', handy: '', email: '', telPriv: '', handyPriv: '', emailPriv: '', strasse: '', hausnr: '', zusatz: '', plz: '', ort: '', bundesland: '', land: 'AT', filialen: [], gruppe: '', zugang: '', meldungen: [], geaendert: '', _name: ''});
const usrDraft = id => { const u = id ? USR.all.find(x => x.id === id) : null; return u ? usrRec(u) : usrNeu(); };
const usrProfile = d => { const t = k => String(d[k] || '').trim(); return {vorname: t('vorname'), nachname: t('nachname'), bonname: t('bonname'), foto: d.foto || '', verkaeufer: !!d.verkaeufer, mobil: !!d.mobil,
  tel: t('tel'), handy: t('handy'), email: t('email'), telPriv: t('telPriv'), handyPriv: t('handyPriv'), emailPriv: t('emailPriv'),
  strasse: t('strasse'), hausnr: t('hausnr'), zusatz: t('zusatz'), plz: t('plz'), ort: t('ort'), bundesland: t('bundesland'), land: d.land || 'AT', filialen: [...d.filialen]}; };

/* ── Liste ── */
function usrRows() {
  const grp = new Map(); stRows('benutzergruppe').forEach(g => (g.mitglieder || []).forEach(m => grp.set(norm(m), g)));
  const stores = new Map(STORES.map(s => [s.id, s.name]));
  return USR.all.map(u => {
    const p = u.profile || {}, [vn, nn] = usrSplit(u), g = grp.get(norm(u.name)), me = AUTH.methods[u.id] || {}, zf = SEC.totp.has(u.id), er = USR.defaults.has(u.name);
    const fil = (p.filialen || []).map(id => stores.get(id)).filter(Boolean);
    return {id: u.id, nr: u.nr || 0, vorname: vn, nachname: nn, email: p.email || '', rolle: ROLE_NAMES[u.role] || u.role, gruppe: g?.name || '', filialen: fil.length ? fil.join(', ') : 'Alle',
      active: u.active !== false, verkaeufer: p.verkaeufer !== false, mobil: p.mobil !== false, zf, anm: ['PIN', me.passwort && 'Passwort', me.hello && 'Windows Hello', zf && '2FA'].filter(Boolean).join(' · '), er,
      _u: {id: u.id, name: u.name, foto: fotoOk(p.foto), hue: hash(u.id) % 360, initials: initials(u.name)}};
  });
}
agridPage('benutzer', {
  title: 'Benutzer', rows: usrRows, count: () => USR.all.length, sort: {k: 'nr', dir: 1}, rowH: 46,
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [
    {k: 'foto', l: '', w: 70, html: r => `<span class="ue-av">${avatarHTML(r._u, '', 'width:32px;height:32px;font-size:11.5px')}</span>`, get: () => ''},
    {k: 'nr', l: 'Nr.', t: 'num', w: 80}, {k: 'vorname', l: 'Vorname', w: 150}, {k: 'nachname', l: 'Name', w: 170}, {k: 'email', l: 'E-Mail Firma', w: 240},
    {k: 'rolle', l: 'Rolle', w: 130}, {k: 'gruppe', l: 'Benutzergruppe', w: 170}, {k: 'filialen', l: 'Filialen', w: 170, show: false},
    {k: 'active', l: 'Aktiv', t: 'check', w: 80}, {k: 'verkaeufer', l: 'Verkäufer:in', t: 'check', w: 110}, {k: 'mobil', l: 'Kontor mobil', t: 'check', w: 120, show: false},
    {k: 'anm', l: 'Anmeldung', w: 230, get: r => r.anm + (r.er ? ' Erst-PIN' : ''), html: r => `${esc(r.anm)}${r.er ? ' <span class="pill warn" style="height:20px" title="Diese Person verwendet noch die ausgelieferte Erst-PIN – bitte ändern">Erst-PIN</span>' : ''}`}],
  remove: ids => usrRemove(ids), removeLabel: 'Deaktivieren', removeIcon: 'lock',
  actions: {back: () => e2Back(), refresh: () => PAGES.benutzer.render(true), new: () => usrOpen(null, [])},
  edit: id => usrOpen(id, (AG.benutzer.filtered || []).map(r => r.id)),
});
{ const p = PAGES.benutzer, _r = p.render; p.render = async fresh => { await usrLoad(fresh === true); await _r(); renderTopbar(); }; }
VIEW_PERM.benutzer = 'system';

/** Markierte Personen deaktivieren (Personen werden nie gelöscht: Belege und Protokoll verweisen auf sie) */
async function usrRemove(ids) {
  const todo = ids.map(id => USR.all.find(u => u.id === id)).filter(u => u && u.active !== false), abort = () => { throw new Error('abgebrochen'); };
  if (!todo.length) { toast('Schon inaktiv', {t2: 'Die markierten Personen sind bereits deaktiviert', icon: 'user'}); abort(); }
  if (todo.some(u => u.id === S.user?.id)) { toast('Das eigene Konto kann nicht deaktiviert werden', {t2: 'Bitte eine andere Administratorin / einen anderen Administrator bitten', type: 'warn'}); abort(); }
  const wer = todo.length === 1 ? `„${todo[0].name}“` : `${todo.length} Personen`;
  if (!await confirmBox(`${wer} deaktivieren? Die Person kann sich nicht mehr anmelden; Belege und Protokoll bleiben erhalten. Wieder aktivieren: in der Maske unter „Aktiv“.`, 'Deaktivieren')) abort();
  const by = (await stepUp({title: 'Administrator-Freigabe', text: `${wer} deaktivieren`, admin: true}).catch(abort)).by;
  try { for (const u of todo) await invoke('user_delete', {id: u.id, by: by.name}); }
  catch (e) { toast('Deaktivieren nicht möglich', {t2: String(e), type: 'warn'}); await usrLoad(); return; }
  await usrLoad(); renderMe(); renderTopbar();
  toast(todo.length === 1 ? 'Deaktiviert' : `${todo.length} Personen deaktiviert`, {t2: todo.map(u => u.name).join(', '), icon: 'user', dur: 2400});
}

/* ── Maske ── */
function usrOpen(id, ids, preset) {
  UE.id = id; UE.ids = ids?.length ? ids : UE.ids; UE.d = Object.assign(usrDraft(id), preset || {}); UE.orig = JSON.parse(JSON.stringify(UE.d)); UE.tab = 'allg'; UE.dirty = false; UE.pin = UE.pin2 = '';
  if (S.view === 'benutzer-edit') usrRender(); else go('benutzer-edit');
}
registerPage('benutzer-edit', {title: 'Benutzer', sub: () => UE.d ? `${UE.d.nr || 'neu'} · ${usrName(UE.d) || 'Neue Person'}` : '', render: async () => {
  if (!UE.d) { setTimeout(() => go('benutzer'), 0); return; }   // direkt aufgerufen (z. B. nach Neustart): zur Liste, erst nachdem diese Seite fertig geschaltet ist
  $('#view-benutzer-edit').innerHTML = '<div class="muted" style="padding:24px">Lade …</div>';   // nicht kurz die zuvor geöffnete Person zeigen
  await usrLoad(); usrRender(); renderTopbar();
}});
VIEW_PERM['benutzer-edit'] = 'system';
/** Maske verlassen (Menü, Suche, Zurück-Taste) mit ungesicherten Änderungen: erst nachfragen */
function leaveGuard(view, isDirty, clear) {
  const _go = go;
  go = function (v) {
    if (S.view === view && v !== view && isDirty()) {
      confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen').then(ok => {
        if (ok) { clear(); go(v); }
        else if (location.hash.slice(1) !== S.view) history.replaceState(null, '', '#' + S.view);
      });
      return;
    }
    return _go(v);
  };
}
leaveGuard('benutzer-edit', () => UE.dirty, () => { UE.dirty = false; UE.d = usrDraft(UE.id); UE.orig = JSON.parse(JSON.stringify(UE.d)); UE.pin = UE.pin2 = ''; });

const ueIn = (k, l, o = {}) => `<label class="field"><span>${esc(l)}</span><input class="input ${o.num ? 'num' : ''}" ${o.type ? `type="${o.type}"` : ''} data-ue="${k}" value="${esc(UE.d[k] ?? '')}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.attr || ''} autocomplete="off">${o.hint ? `<small class="ea-hint">${esc(o.hint)}</small>` : ''}</label>`;
const ueSw = (k, l, o = {}) => `<div class="ue-sw ${o.dis ? 'dis' : ''}"><label class="ea-sw ${o.dis ? 'dis' : ''}"><button type="button" class="switch" role="switch" ${o.dis ? 'disabled' : `data-ue-sw="${k}"`} aria-checked="${!!UE.d[k]}"></button><span>${esc(l)}</span></label>${o.hint ? `<small class="ea-hint">${esc(o.hint)}</small>` : ''}</div>`;
const ueSel = (k, l, opts, o = {}) => `<div class="field"><span>${esc(l)}</span><div class="ea-cmb-row"><select class="input select" data-ue="${k}" style="flex:1;min-width:0">${o.leer ? `<option value="">${esc(o.leer)}</option>` : ''}${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(UE.d[k]) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${o.go ? `<button type="button" class="ea-ib" data-ue-go="${o.go}" title="Tabelle öffnen">${ic('edit', 'i-sm')}</button>` : ''}</div>${o.hint ? `<small class="ea-hint">${esc(o.hint)}</small>` : ''}</div>`;
const ueCard = (h, inner, cls = '') => `<div class="ae-card ea-card ${cls}">${h ? `<h4>${esc(h)}</h4>` : ''}<div class="ea-fields">${inner}</div></div>`;
const usrMiss = d => { const m = []; if (!String(d.nachname).trim()) m.push(['allg', 'Name']); if (!UE.id && !/^\d{4}$/.test(UE.pin)) m.push(['login', 'PIN (4 Ziffern)']); return m; };
const ueSelf = () => !!UE.id && UE.id === S.user?.id;

function usrAllg() {
  const D = UE.d, gr = stRows('benutzergruppe'), zp = stRows('zugangsprofil'), g = gr.find(x => x.id === D.gruppe);
  const photo = `<div class="ue-photo-col"><div class="ue-photo" data-ue-photo tabindex="0" title="Bild hierher ziehen, mit Strg+V einfügen oder anklicken">${D.foto ? `<img src="${D.foto}" alt="Foto ${esc(usrName(D))}">` : `<div class="ue-ph">${ic('image')}<span>Bild ziehen, einfügen oder anklicken</span></div>`}</div>
      <div class="ue-photo-act"><button type="button" class="ea-ib" data-ue-a="foto" title="Bild wählen" aria-label="Bild wählen">${ic('upload', 'i-sm')}</button><button type="button" class="ea-ib" data-ue-a="fotoz" title="Vergrößern" aria-label="Bild vergrößern" ${D.foto ? '' : 'disabled'}>${ic('eye', 'i-sm')}</button><button type="button" class="ea-ib" data-ue-a="fotox" title="Bild entfernen" aria-label="Bild entfernen" ${D.foto ? '' : 'disabled'}>${ic('trash', 'i-sm')}</button></div>
      <input type="file" accept="image/*" hidden data-ue-file></div>`;
  const rolleHint = g?.rolle && g.rolle !== D.role ? `<small class="ea-hint">Die Gruppe „${esc(g.name)}“ hat die Rolle „${esc(ROLE_NAMES[g.rolle] || g.rolle)}“.</small>` : '';
  const kontakt = (...k) => `<div class="ue-sub">${k.join('')}</div>`;
  return {html: `<div class="ue-cols">
    ${ueCard('Persönliches', `<div class="ue-person">${photo}<div class="ue-pf">${ueIn('nr', 'Nr.', {num: true, attr: 'inputmode="numeric" pattern="[0-9]*"'})}${ueIn('vorname', 'Vorname')}${ueIn('nachname', 'Name *')}${ueIn('bonname', 'Name auf dem Bon', {ph: D.vorname || 'Vorname'})}</div></div>
      <small class="ea-hint">Die Nr. (Personalnummer) wird automatisch vergeben. Der Name auf dem Bon steht auf Kassenbons – leer = Vorname. Das Bild erscheint am Anmeldebildschirm, in der Seitenleiste und bei Freigaben.</small>
      <div class="field"><span>Zuletzt geändert</span><input class="input ea-ro" readonly value="${esc(D.geaendert ? fmtTs(D.geaendert) : '–')}"></div>`, 'ue-one')}
    <div class="ue-stack">
    ${ueCard('Rolle', `<div class="ue-group"><div class="ue-lab">Rolle *</div><div class="reasons ue-roles">${Object.entries(ROLE_NAMES).map(([k, l]) => `<button type="button" class="chip" data-ue-role="${k}" aria-pressed="${D.role === k}">${esc(l)}</button>`).join('')}</div>${rolleHint}
        <small class="ea-hint">Kasse/Verkauf: verkaufen, retournieren bis zur Grenze · Filialleitung: Freigaben, Abschluss · Administrator: zusätzlich Benutzer, RKSV, Wiederherstellung. Details im Reiter „Rechte“.</small></div>
      <div class="ue-sws">${ueSw('active', 'Aktiv', {dis: ueSelf(), hint: ueSelf() ? 'Das eigene Konto kann nicht deaktiviert werden.' : 'Inaktive Personen können sich nicht anmelden; Belege und Protokoll bleiben erhalten.'})}
      ${ueSw('verkaeufer', 'Verkäufer:in', {hint: 'Kann an der Kasse je Position und bei der Bon-Zuordnung als Verkäufer:in gewählt werden.'})}
      ${ueSw('mobil', 'Kontor mobil', {hint: 'Darf sich am Handy/Tablet anmelden (Einstellungen › Handy & Tablet).'})}</div>`, 'ue-one')}
    ${ueCard('Profil', `${ueSel('gruppe', 'Benutzergruppe', gr.map(x => [x.id, x.name || x.id]), {leer: '– keine –', go: 'st-benutzergruppe', hint: 'Beim Zuordnen wird die Rolle der Gruppe vorgeschlagen.'})}
      ${ueSel('zugang', 'Zugangsprofil', zp.map(x => [x.id, x.name || x.id]), {leer: '– jederzeit –', go: 'st-zugangsprofil', hint: 'Legt fest, an welchen Wochentagen und zu welchen Uhrzeiten die Anmeldung möglich ist (Administratoren ausgenommen).'})}`, 'ue-one')}
    </div>
    ${ueCard('Kontaktdaten', `<div class="ue-pair">${kontakt(ueIn('tel', 'Telefon Firma'), ueIn('handy', 'Mobil Firma'), ueIn('email', 'E-Mail Firma', {type: 'email', hint: 'Empfängt E-Mail-Meldungen (Reiter „Benachrichtigungen“).'}))}${kontakt(ueIn('telPriv', 'Telefon privat'), ueIn('handyPriv', 'Mobil privat'), ueIn('emailPriv', 'E-Mail privat', {type: 'email'}))}</div>`, 'ue-kontakt ue-one')}
  </div>`};
}
function usrAdresse() {
  const D = UE.d, lander = stRows('land').map(l => [l.id, l.name || l.id]);
  if (!lander.some(([id]) => id === D.land)) lander.unshift([D.land, D.land]);
  return {html: `<div class="ue-cols2">${ueCard('Adresse', `${ueIn('strasse', 'Straße')}${ueIn('hausnr', 'Haus-Nr.')}${ueIn('zusatz', 'Adresszusatz')}${ueIn('plz', 'PLZ')}${ueIn('ort', 'Ort')}${ueIn('bundesland', 'Bundesland / Kanton / Provinz')}${ueSel('land', 'Land *', lander, {go: 'st-land'})}`, 'ue-wide')}</div>`};
}
const usrStoreRows = on => STORES.filter(s => UE.d.filialen.includes(s.id) === on).map(s => ({id: s.id, kurz: s.id, name: s.name, gruppe: stRows('filialgruppe').find(g => (g.filialen || []).some(f => norm(f) === norm(s.id)))?.name || ''}));
function usrFilialenTab() {
  return {html: `<p class="ea-hint ue-note">Keine Filiale zugeordnet = die Person kann sich an allen Filialen anmelden. Administratoren können sich immer anmelden. ${STORES.length < 2 ? 'Mit dem Filialverbund erscheinen hier alle Standorte.' : ''}</p>
    <div class="ae-pane ae-two"><div class="ae-card"><h4>Zugeordnet</h4><div data-aeg="a"></div></div><div class="ae-card"><h4>Nicht zugeordnet</h4><div data-aeg="b"></div></div></div>`,
    mount: el => {
      const cols = [{k: 'kurz', l: 'Kurz-Name', w: 110}, {k: 'name', l: 'Filiale', w: 220}, {k: 'gruppe', l: 'Filial-Gruppe', w: 160}];
      const mv = (ids, add) => { const s = new Set(UE.d.filialen); ids.forEach(i => add ? s.add(i) : s.delete(i)); UE.d.filialen = [...s]; ueDirty(el); usrRender(); };
      const mk = (key, h, cfg) => { AG[key] = agNew({embed: true, cols, sort: {k: 'kurz', dir: 1}, ...cfg}); agMount(key, h); };
      mk('ue-a', $('[data-aeg="a"]', el), {title: 'Zugeordnet', rows: () => usrStoreRows(true), edit: id => mv([id], false), extra: [{k: 'rm', l: 'Entfernen', icon: 'x'}], actions: {rm: () => { const s = [...AG['ue-a'].sel]; if (s.length) mv(s, false); }}});
      mk('ue-b', $('[data-aeg="b"]', el), {title: 'Nicht zugeordnet', rows: () => usrStoreRows(false), edit: id => mv([id], true), extra: [{k: 'add', l: 'Zuordnen', icon: 'plus'}], actions: {add: () => { const s = [...AG['ue-b'].sel]; if (s.length) mv(s, true); }}});
    }};
}
function usrMeldungen() {
  const D = UE.d, evt = typeof MELD_EVT !== 'undefined' ? MELD_EVT : [];
  const rows = D.meldungen.map((m, i) => `<div class="ue-mrow"><select class="input select" data-ue-m="${i}:ereignis" aria-label="Ereignis">${evt.map(([k, l]) => `<option value="${esc(k)}" ${m.ereignis === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="input select" data-ue-m="${i}:kanal" aria-label="Kanal">${UE_KANAL.map(([k, l]) => `<option value="${k}" ${m.kanal === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input class="input" data-ue-m="${i}:email" value="${esc(m.email)}" placeholder="${esc(D.email || 'E-Mail Firma')}" aria-label="E-Mail" ${m.kanal === 'hinweis' ? 'disabled' : ''}>
      <button type="button" class="ea-ib" data-ue-a="meldx" data-i="${i}" title="Entfernen">${ic('trash', 'i-sm')}</button></div>`).join('');
  return {html: `<div class="ue-cols2"><div class="ae-card ea-card ue-wide"><h4>Meldungen an diese Person</h4>
      <p class="ea-hint">Ereignisse, über die die Person informiert wird – als Hinweis in Kontor oder per E-Mail. Ohne eigene Adresse geht die E-Mail an die „E-Mail Firma“ der Person${D.email ? ` (${esc(D.email)})` : ' – bitte im Reiter „Allgemein“ eintragen'}.</p>
      ${rows ? `<div class="ue-mhead"><span>Ereignis</span><span>Kanal</span><span>E-Mail (optional)</span><span></span></div>${rows}` : '<div class="empty" style="padding:22px 12px"><p>Diese Person erhält keine Meldungen.</p></div>'}
      <div><button type="button" class="btn btn-secondary" data-ue-a="meldplus">${ic('plus', 'i-sm')}Meldung hinzufügen</button></div></div></div>`};
}
function usrRechte() {
  const D = UE.d, perms = SEC.perms || [], ok = p => SEC.roles ? !!SEC.roles[D.role]?.[p] : can(p, {roleKey: D.role});
  const rows = perms.map(p => `<div class="ue-right ${ok(p.perm) ? 'on' : ''}">${ic(ok(p.perm) ? 'check' : 'x', 'i-sm')}<span>${esc(p.label)}</span></div>`).join('');
  return {html: `<div class="ue-cols2">
    <div class="ae-card ea-card ue-wide"><h4>Rolle „${esc(ROLE_NAMES[D.role] || D.role)}“ darf</h4>${rows ? `<div class="ue-rights">${rows}</div>` : '<p class="ea-hint">Die Rechte-Matrix liegt in der Desktop-App.</p>'}
      <p class="ea-hint">${canApprove({roleKey: D.role}) ? 'Diese Rolle darf Freigaben erteilen (Rabatt, Storno, Punkte, Kassenbuch …).' : 'Diese Rolle darf keine Freigaben erteilen – fehlt ein Recht, gibt eine berechtigte Person per PIN frei.'} Die Rolle wird im Reiter „Allgemein“ gewählt.</p>
      <div><button type="button" class="btn btn-secondary" data-ue-go="rollen">${ic('shield', 'i-sm')}Rechte je Rolle bearbeiten</button></div></div></div>`};
}
function usrLogin() {
  const D = UE.d, saved = !!UE.id, m = AUTH.methods[UE.id] || {}, on = SEC.totp.has(UE.id), er = USR.defaults.has(D._name);
  const row = (l, h, c) => `<div class="set-row"><div><div class="set-l">${l}</div>${h ? `<div class="set-h">${h}</div>` : ''}</div><div class="set-c" style="min-width:0;gap:6px">${c}</div></div>`;
  const pill = (t, tone) => `<span class="pill ${tone || ''}" style="height:20px">${t}</span>`;
  const dis = saved ? '' : 'disabled';
  return {html: `<div class="ue-cols2 ue-login">
    ${ueCard('PIN', `${er ? `<div class="rule-box" style="background:var(--warn-soft);border-color:transparent">${ic('alert')}<div><b style="color:var(--text)">Erst-PIN noch aktiv</b> – bitte jetzt eine eigene PIN vergeben.</div></div>` : ''}
      <label class="field"><span>${saved ? 'Neue PIN (4 Ziffern)' : 'PIN (4 Ziffern) *'}</span><input class="input num" data-ue="pin" type="password" inputmode="numeric" maxlength="4" value="${esc(UE.pin)}" autocomplete="new-password"><small class="ea-hint">${saved ? 'Leer lassen, um die PIN nicht zu ändern. ' : ''}Nach 5 Fehlversuchen ist die PIN 2 Minuten gesperrt.</small></label>
      <label class="field"><span>PIN wiederholen</span><input class="input num" data-ue="pin2" type="password" inputmode="numeric" maxlength="4" value="${esc(UE.pin2)}" autocomplete="new-password"></label>`)}
    <div class="ae-card ea-card"><h4>Weitere Anmeldewege</h4>${saved ? '' : '<p class="ea-hint">Erst die Person sichern – danach lassen sich weitere Anmeldewege einrichten.</p>'}
      ${row('Zwei-Faktor (Authenticator-App)', on ? 'Bei jeder PIN-Anmeldung und Freigabe wird zusätzlich der Code abgefragt.' : 'Zusätzlicher Code aus einer Authenticator-App', `${pill(on ? 'aktiv' : 'aus', on ? 'pos' : '')}<button class="btn btn-secondary btn-sm" data-ue-a="totp" ${dis}>${ic('shield', 'i-sm')}${on ? 'Ausschalten' : 'Einrichten'}</button>`)}
      ${row('Benutzername, Passwort, Windows Hello', m.login ? `Benutzername: ${esc(m.login)}` : 'Anmeldung mit Benutzername/E-Mail und Passwort, am PC mit Windows Hello', `${m.passwort ? pill('Passwort', 'pos') : ''}${m.hello ? pill('Windows Hello', 'pos') : ''}<button class="btn btn-secondary btn-sm" data-ue-a="login" ${dis}>${ic('usbkey', 'i-sm')}Bearbeiten …</button>`)}
      ${row('Single Sign-On', ssoReady() ? `Aktiv über ${esc(CFG['sso.name'] || 'Single Sign-On')} – die Person wird über ihren Benutzernamen/ihre E-Mail zugeordnet.` : 'Anmeldung mit dem Firmenkonto (Microsoft Entra ID, Google …)', `${pill(ssoReady() ? 'eingerichtet' : 'nicht eingerichtet', ssoReady() ? 'pos' : '')}<button class="btn btn-ghost btn-sm" data-ue-go="set-sso">${ic('sliders', 'i-sm')}Einstellungen</button>`)}
    </div></div>`};
}

function usrRender() {
  const host = $('#view-benutzer-edit'); if (!host || !UE.d) return;
  const D = UE.d, pos = UE.ids.indexOf(UE.id), el = document.createElement('div'); el.className = 'ae ue'; host.replaceChildren(el);
  const btn = (a, icon, l, dis, text = true) => `<button class="ag-btn" data-ue-a="${a}" title="${esc(l)}" aria-label="${esc(l)}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}${text ? `<span>${l}</span>` : ''}</button>`;
  const miss = usrMiss(D);
  const tab = ([k, l]) => { const n = miss.filter(m => m[0] === k).length; return `<button type="button" class="ed-tab" data-ue-t="${k}" aria-selected="${UE.tab === k}">${esc(l)}${n ? ` <span class="ed-badge">${n}</span>` : ''}</button>`; };
  const body = ({allg: usrAllg, adresse: usrAdresse, filialen: usrFilialenTab, meldungen: usrMeldungen, rechte: usrRechte, login: usrLogin}[UE.tab] || usrAllg)();
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Übersicht: Benutzer')}${btn('refresh', 'sync', 'Aktualisieren', !UE.id)}${btn('save', 'check', 'Sichern', !UE.dirty)}${btn('new', 'plus', 'Neu', !UE.id)}${btn('undo', 'undo', 'Änderungen zurücknehmen', !UE.dirty)}
      <span class="sp"></span>${UE.id && UE.ids.length > 1 ? `${btn('prev', 'chevron-left', 'Vorherige Person', pos <= 0, false)}<span class="ae-nr">${pos + 1}/${UE.ids.length}</span>${btn('next', 'chevron-right', 'Nächste Person', pos >= UE.ids.length - 1, false)}` : ''}</div>
    <div class="ae-tabsw"><div class="ed-tabs" role="tablist">${UE_TABS.map(tab).join('')}</div></div>
    <div class="ae-body"><div id="edBody">${body.html}</div></div>`;
  body.mount?.(el);
  el.addEventListener('input', e => { const t = e.target.closest('[data-ue],[data-ue-m]'); if (t) ueSet(t, el); });
  el.addEventListener('change', async e => {
    const t = e.target.closest('[data-ue],[data-ue-m]'); if (t) { ueSet(t, el); if (t.dataset.ue === 'gruppe') ueGruppe(); if (t.dataset.ueM && /:kanal$/.test(t.dataset.ueM)) usrRender(); if (t.dataset.ue === 'land') usrRender(); return; }
    const f = e.target.closest('[data-ue-file]'); if (f?.files?.[0]) { const file = f.files[0]; f.value = ''; await ueFoto(file, el); }
  });
  const ph = $('[data-ue-photo]', el);
  if (ph) {
    ph.addEventListener('click', () => $('[data-ue-file]', el).click());
    ph.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('[data-ue-file]', el).click(); } });
    ph.addEventListener('dragover', e => { e.preventDefault(); ph.classList.add('over'); });
    ph.addEventListener('dragleave', () => ph.classList.remove('over'));
    ph.addEventListener('drop', async e => { e.preventDefault(); ph.classList.remove('over'); const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/')); if (f) await ueFoto(f, el); });
  }
  el.addEventListener('click', async e => {
    const t = e.target, sw = t.closest('[data-ue-sw]'), tb = t.closest('[data-ue-t]'), rl = t.closest('[data-ue-role]'), go_ = t.closest('[data-ue-go]'), b = t.closest('[data-ue-a]');
    if (sw) { D[sw.dataset.ueSw] = !D[sw.dataset.ueSw]; ueDirty(el); return usrRender(); }
    if (rl) { D.role = rl.dataset.ueRole; ueDirty(el); return usrRender(); }
    if (tb) { UE.tab = tb.dataset.ueT; return usrRender(); }
    const ask = async () => !UE.dirty || await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen');
    if (go_) { if (!await ask()) return; UE.dirty = false; return go(go_.dataset.ueGo); }
    if (!b || b.disabled) return;
    const a = b.dataset.ueA;
    if (a === 'back') { if (!await ask()) return; UE.dirty = false; return go('benutzer'); }
    if (a === 'refresh' || a === 'undo') { if (a === 'refresh' && !await ask()) return; await usrLoad(a === 'refresh'); UE.d = usrDraft(UE.id); UE.orig = JSON.parse(JSON.stringify(UE.d)); UE.dirty = false; UE.pin = UE.pin2 = ''; return usrRender(); }
    if (a === 'new') { if (!await ask()) return; return usrOpen(null, UE.ids); }
    if (a === 'prev' || a === 'next') { if (!await ask()) return; const id = UE.ids[pos + (a === 'next' ? 1 : -1)]; if (id) usrOpen(id); return; }
    if (a === 'foto') return $('[data-ue-file]', el).click();
    if (a === 'fotox') { D.foto = ''; ueDirty(el); return usrRender(); }
    if (a === 'fotoz') return ueZoom(D);
    if (a === 'meldplus') { D.meldungen.push({id: '', ereignis: (typeof MELD_EVT !== 'undefined' && MELD_EVT[0]?.[0]) || '', kanal: 'hinweis', email: ''}); ueDirty(el); return usrRender(); }
    if (a === 'meldx') { D.meldungen.splice(+b.dataset.i, 1); ueDirty(el); return usrRender(); }
    if (a === 'totp') { if (UE.dirty && !await confirmBox('Ungesicherte Änderungen bleiben erhalten – fortfahren?', 'Fortfahren')) return; return openTotp({id: UE.id, name: D._name}); }
    if (a === 'login') return openLoginEditor({id: UE.id, name: D._name});
    if (a === 'save') return usrSave();
  });
}
function ueDirty(el) { UE.dirty = true; $$('[data-ue-a="save"],[data-ue-a="undo"]', el).forEach(b => { b.disabled = false; }); }
/** Eingabefeld → Arbeitsstand */
function ueSet(t, el) {
  const D = UE.d;
  if (t.dataset.ueM) { const [i, f] = t.dataset.ueM.split(':'); if (D.meldungen[+i]) D.meldungen[+i][f] = t.value; }
  else { const k = t.dataset.ue; if (k === 'pin') UE.pin = t.value.replace(/\D/g, ''); else if (k === 'pin2') UE.pin2 = t.value.replace(/\D/g, ''); else D[k] = k === 'nr' ? (t.value === '' ? 0 : Math.max(0, parseInt(t.value, 10) || 0)) : t.value; }
  ueDirty(el);
  if (t.dataset.ue === 'vorname' || t.dataset.ue === 'nachname') { const b = $('[data-ue="bonname"]', el); if (b) b.placeholder = D.vorname || 'Vorname'; renderTopbar(); }
}
/** Gruppe gewählt: deren Rolle wird vorgeschlagen (ein Administrator bleibt Administrator) */
function ueGruppe() {
  const D = UE.d, g = stRows('benutzergruppe').find(x => x.id === D.gruppe);
  if (g?.rolle && ROLE_NAMES[g.rolle] && g.rolle !== D.role && D.role !== 'admin') { D.role = g.rolle; toast('Rolle aus der Gruppe übernommen', {t2: ROLE_NAMES[g.rolle], icon: 'user'}); }
  usrRender();
}
/** Foto → quadratisch zugeschnittenes JPEG (256 px) */
async function usrFotoVon(blob) {
  const bmp = await createImageBitmap(blob), n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const s = Math.min(bmp.width, bmp.height), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, n, n);
  g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, n, n); bmp.close?.();
  return c.toDataURL('image/jpeg', .86);
}
async function ueFoto(blob, el) {
  try { UE.d.foto = await usrFotoVon(blob); } catch { return toast('Bild nicht lesbar', {t2: 'Bitte ein JPEG-, PNG- oder WebP-Bild wählen', type: 'warn'}); }
  ueDirty(el); usrRender();
}
function ueZoom(D) {
  openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Foto"><div class="m-head"><div class="m-ic">${ic('image')}</div><div><h2>${esc(usrName(D) || 'Foto')}</h2></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div><div class="m-body" style="display:grid;place-items:center"><img src="${D.foto}" alt="" style="width:min(100%,380px);aspect-ratio:1;object-fit:cover;border-radius:16px"></div></div>`);
}
/* Bild aus der Zwischenablage (Strg+V) auf dem Reiter „Allgemein“ */
document.addEventListener('paste', e => {
  if (S.view !== 'benutzer-edit' || UE.tab !== 'allg') return;
  const it = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith('image/')); if (!it) return;
  e.preventDefault(); const f = it.getAsFile(); if (f) ueFoto(f, $('#view-benutzer-edit .ae'));
});

/* ── Sichern ── */
async function usrSave() {
  const D = UE.d, isNew = !UE.id, name = usrName(D);
  if (!DESKTOP) return toast('Nur in der Desktop-App', {t2: 'Benutzer werden in der lokalen Datenbank gespeichert', type: 'warn'});
  const miss = usrMiss(D); if (miss.length) { UE.tab = miss[0][0]; usrRender(); return toast(`${miss[0][1]} angeben`, {t2: 'Pflichtfeld', type: 'warn'}); }
  if (name.length < 2) { UE.tab = 'allg'; usrRender(); return toast('Name zu kurz', {type: 'warn'}); }
  if (USR.all.some(x => x.id !== UE.id && norm(x.name) === norm(name))) { UE.tab = 'allg'; usrRender(); return toast('Diesen Namen gibt es schon', {t2: 'Meldungen, Gruppen und Zugangsprofile ordnen Personen über den Namen zu', type: 'warn'}); }
  if (UE.pin && !/^\d{4}$/.test(UE.pin)) { UE.tab = 'login'; usrRender(); return toast('PIN: genau 4 Ziffern', {type: 'warn'}); }
  if (UE.pin !== UE.pin2) { UE.tab = 'login'; usrRender(); return toast('PINs stimmen nicht überein', {type: 'warn'}); }
  if (!D.land) D.land = 'AT';
  const O = UE.orig, sensitive = isNew || D.role !== O.role || D.active !== O.active || !!UE.pin;
  if (ueSelf() && D.role !== O.role && !await confirmBox(`Die eigene Rolle von „${ROLE_NAMES[O.role]}“ auf „${ROLE_NAMES[D.role]}“ ändern? Es können Rechte verloren gehen.`, 'Rolle ändern')) return;
  let by = S.user;
  if (sensitive) { try { by = (await stepUp({title: 'Administrator-Freigabe', text: isNew ? 'Neue Person anlegen' : `${name} ändern (Rolle, Status oder PIN)`, admin: true})).by; } catch { return; } }
  try {
    if (UE.pin) USR.defaultsOk = false;
    setUsers(await invoke('user_save', {user: {id: UE.id || '', name, role: D.role, active: D.active, nr: +D.nr || 0, profile: usrProfile(D)}, pin: UE.pin || null, by: by.name}));
    await usrLoad();
    const saved = USR.all.find(x => (UE.id && x.id === UE.id) || (!UE.id && norm(x.name) === norm(name)));
    if (!saved) throw new Error('Gespeicherte Person nicht gefunden');
    await usrZuordnen(O._name, name, D);
    if (isNew) UE.ids = [...UE.ids, saved.id];
    UE.id = saved.id; UE.d = usrDraft(saved.id); UE.orig = JSON.parse(JSON.stringify(UE.d)); UE.dirty = false; UE.pin = UE.pin2 = '';
  } catch (err) { return toast('Speichern fehlgeschlagen', {t2: String(err.message || err), type: 'warn'}); }
  renderMe(); renderTopbar();
  toast(isNew ? 'Person angelegt' : 'Gespeichert', {t2: `${name} · ${ROLE_NAMES[D.role]}${D.active ? '' : ' · inaktiv'}`, type: 'pos', icon: 'user', dur: 2200});
  usrRender();
}
/** Gruppe, Zugangsprofil und Meldungen in den Stammdaten nachziehen (Zuordnung nach Name; Umbenennung folgt) */
async function usrZuordnen(alt, neu, D) {
  const is = n => m => norm(m) === norm(n), weg = m => !is(alt)(m) && !is(neu)(m), clone = k => stRows(k).map(r => ({...r}));
  const gr = clone('benutzergruppe'); let chG = false;
  gr.forEach(g => { const l = (g.mitglieder || []); const n = l.filter(weg); if (n.length !== l.length) { g.mitglieder = n; chG = true; } });
  if (D.gruppe) { const g = gr.find(x => x.id === D.gruppe); if (g) { g.mitglieder = [...(g.mitglieder || []), neu]; chG = true; } }
  const zp = clone('zugangsprofil'); let chZ = false;
  zp.forEach(z => { const l = (z.benutzer || []); const n = l.filter(weg); if (n.length !== l.length) { z.benutzer = n; chZ = true; } });
  if (D.zugang) { const z = zp.find(x => x.id === D.zugang); if (z) { z.benutzer = [...(z.benutzer || []), neu]; chZ = true; } }
  const ml = clone('meldung').filter(m => !is(alt)(m.empfaenger) && !is(neu)(m.empfaenger));
  const hatte = stRows('meldung').length !== ml.length;
  D.meldungen.forEach(m => ml.push({id: m.id || 'ml-' + aeUid(), _aktiv: true, ereignis: m.ereignis, empfaenger: neu, kanal: m.kanal, email: m.kanal === 'hinweis' ? '' : String(m.email || '').trim()}));
  if (chG) await stammSave('benutzergruppe', gr);
  if (chZ) await stammSave('zugangsprofil', zp);
  if (hatte || D.meldungen.length) await stammSave('meldung', ml);
}

/* ── Rollen & Rechte (Rechte-Matrix) ── */
registerPage('rollen', {title: 'Rollen & Rechte', sub: () => 'Was jede Rolle darf', render: async () => {
  await Promise.all([loadSecurity(), DESKTOP ? usrLoad() : Promise.resolve()]);
  const v = $('#view-rollen'), n = r => STAFF.filter(s => s.roleKey === r).length;
  v.innerHTML = `<div class="cv">${pageHead('Rollen & Rechte', 'Was jede Rolle darf. Fehlt ein Recht, kann eine berechtigte Person die Aktion per PIN freigeben. Änderungen erfordern einen Administrator.', `<button class="btn btn-secondary" data-ue-go="benutzer">${ic('users', 'i-sm')}Zu den Benutzern</button>`)}
    <div class="card"><table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Recht</th>${Object.entries(ROLE_NAMES).map(([r, l]) => `<th style="text-align:center">${esc(l)}<div class="muted" style="font-weight:500;font-size:11.5px">${n(r)} ${n(r) === 1 ? 'Person' : 'Personen'}</div></th>`).join('')}</tr></thead>
      <tbody>${(SEC.perms || []).map(p => `<tr><td style="padding-left:16px">${esc(p.label)}<div class="mono muted" style="font-size:11px">${esc(p.perm)}</div></td>${Object.keys(ROLE_NAMES).map(r => `<td style="text-align:center"><button class="switch" role="switch" data-perm="${esc(p.perm)}" data-role="${r}" aria-checked="${!!SEC.roles?.[r]?.[p.perm]}" aria-label="${esc(ROLE_NAMES[r] + ': ' + p.label)}" ${r === 'admin' && ['system', 'einstellungen'].includes(p.perm) ? 'disabled' : ''}></button></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}});
VIEW_PERM.rollen = 'system';
$('#view-rollen').addEventListener('click', e => { const pm = e.target.closest('[data-perm]'); if (pm) return permToggle(pm); const g = e.target.closest('[data-ue-go]'); if (g) go(g.dataset.ueGo); });

/** Nach Änderungen an Zwei-Faktor/Passwort (c23, c28) die offene Seite auffrischen */
function usrRefresh() { if (S.view === 'benutzer-edit') usrRender(); else if (S.view === 'benutzer') PAGES.benutzer.render(); }
