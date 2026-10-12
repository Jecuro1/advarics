
/* ════════════════════════════════════════════════════════════════════
   38 · ANMELDEMETHODEN — PIN (Standard), Passwort, Handy-QR (Freigabe
   von einem angemeldeten Handy), Windows Hello, Single Sign-On über
   OpenID Connect (Microsoft Entra ID, Google Workspace, Keycloak …).
   ════════════════════════════════════════════════════════════════════ */
const AUTH = {methods: {}};
const IS_WIN = /Windows/i.test(navigator.userAgent);
Object.assign(DEFAULTS, {'sso.name': 'Microsoft Entra ID', 'sso.issuer': '', 'sso.client_id': '', 'sso.client_secret': ''});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });
async function loadAuth() { if (!DESKTOP) return; try { AUTH.methods = await invoke('auth_methods'); } catch { AUTH.methods = {}; } }
const ssoReady = () => !!(CFG['sso.issuer'] && CFG['sso.client_id']);
const qrReady = () => !!(CFG['api.aktiv'] && CFG['api.lan']);

function altAuthHTML(user) {
  const b = [];
  if (Object.values(AUTH.methods).some(m => m.passwort)) b.push(['pw', 'lock', 'Passwort']);
  if (qrReady()) b.push(['qr', 'qr', 'Mit dem Handy']);
  if (IS_WIN && AUTH.methods[user.id]?.hello) b.push(['hello', 'faceid', 'Windows Hello']);
  if (ssoReady()) b.push(['sso', 'building', CFG['sso.name'] || 'Single Sign-On']);
  return b.length ? `<div class="or">oder anmelden mit</div><div class="auth-alt">${b.map(([k, i, l]) => `<button class="btn btn-secondary" data-m="${k}">${ic(i)}${esc(l)}</button>`).join('')}</div>`
    : `<div class="or" style="margin-top:14px">Weitere Anmeldewege unter Benutzer & Rechte</div>`;
}
async function altAuth(m, user, card, done, back) {
  const fail = e => { back(); toast('Anmeldung nicht möglich', {t2: String(e?.message || e), type: 'warn', dur: 7000}); Hooks.emit('auth.login.failed', {benutzer: user.name, methode: m}); };
  const wait = (icon, msg, extra = '') => { card.innerHTML = `<div class="authwait" style="padding:20px 0"><div class="ring">${ic(icon)}</div><p>${esc(msg)}</p>${extra}<button class="btn btn-ghost btn-sm" data-altback style="margin-top:8px">Zurück zur PIN</button></div>`; };
  card.onclick = e => { if (e.target.closest('[data-altback]')) { card.onclick = null; card._qr = null; back(); } };
  const pick = u => STAFF.find(s => s.id === u.id) || user;
  if (m === 'pw') {
    card.innerHTML = `<form id="pwForm" style="display:grid;gap:10px"><div style="text-align:center;font-size:13px;color:var(--text-2)">Mit Benutzername oder E-Mail anmelden</div>
      <input class="input" id="pwLogin" placeholder="Benutzername / E-Mail" autocomplete="username"><input class="input" id="pwPass" type="password" placeholder="Passwort" autocomplete="current-password">
      <button class="btn btn-primary">${ic('check', 'i-sm')}Anmelden</button><button type="button" class="btn btn-ghost btn-sm" data-altback>Zurück zur PIN</button></form>`;
    setTimeout(() => $('#pwLogin', card)?.focus(), 30);
    $('#pwForm', card).onsubmit = async e => {
      e.preventDefault();
      const login = $('#pwLogin', card).value.trim(), password = $('#pwPass', card).value;
      try { done(pick(await invoke('auth_login_password', {login, password})), 'Passwort'); }
      catch (err) {
        if (String(err) !== 'TOTP') { shakeEl($('#pwForm', card)); toast(String(err), {type: 'warn'}); return; }
        const code = await askTotp({name: login}); if (!code) return;
        try { done(pick(await invoke('auth_login_password', {login, password, code})), 'Passwort + 2FA'); } catch (e2) { toast(String(e2), {type: 'warn'}); }
      }
    };
    return;
  }
  if (m === 'qr') {
    let r; try { r = await invoke('auth_qr_start'); } catch (e) { return fail(e); }
    let svg = ''; try { svg = await invoke('qr_svg', {text: r.url}); } catch { /* */ }
    card.innerHTML = `<div style="display:grid;justify-items:center;gap:10px;padding:6px 0"><div style="font-size:13px;color:var(--text-2);text-align:center">Mit dem Handy scannen, auf dem <b style="color:var(--text)">Kontor mobil</b> angemeldet ist</div><div class="qr-box">${svg.replace('<svg', '<svg width="170" height="170"')}</div><span class="thinking" style="font-size:12px"><b>Warte auf Bestätigung …</b></span><button class="btn btn-ghost btn-sm" data-altback>Zurück zur PIN</button></div>`;
    card._qr = r.token;
    const t0 = Date.now();
    while (card._qr === r.token && document.contains(card)) {
      await new Promise(res => setTimeout(res, 1500));
      if (card._qr !== r.token) return;
      try { const u = await invoke('auth_qr_poll', {token: r.token}); if (u) { card._qr = null; return done(pick(u), 'Handy (QR)'); } }
      catch (e) { card._qr = null; return fail(e); }
      if (Date.now() - t0 > 175000) { card._qr = null; return fail('QR-Code abgelaufen'); }
    }
    return;
  }
  if (m === 'hello') {
    wait('faceid', 'Windows Hello · bitte bestätigen …');
    try { done(pick(await invoke('auth_hello', {user: user.id, enable: false})), 'Windows Hello'); } catch (e) { fail(e); }
    return;
  }
  if (m === 'sso') {
    wait('building', `Anmeldung über ${CFG['sso.name'] || 'Single Sign-On'} im Browser …`, '<p class="muted" style="font-size:12px">Das Browserfenster nach der Anmeldung schließen.</p>');
    try { done(pick(await invoke('auth_sso')), CFG['sso.name'] || 'SSO'); } catch (e) { fail(e); }
  }
}

/* ── Benutzer: Anmeldung je Person (Benutzername/Passwort, Windows Hello) ── */
{
  const _rub = renderUsersBox;
  renderUsersBox = function () {
    _rub();
    const box = $('#usrBox'); if (!box || !DESKTOP) return;
    STAFF.forEach(u => {
      const b = $(`[data-usr="${u.id}"]`, box); if (!b) return;
      const m = AUTH.methods[u.id] || {}, tags = [m.passwort && 'Passwort', m.hello && 'Hello', SEC.totp.has(u.id) && '2FA'].filter(Boolean);
      b.insertAdjacentHTML('beforebegin', `<button class="btn btn-ghost btn-sm" data-login="${u.id}" data-tip="${esc(m.login || 'Benutzername, Passwort, Windows Hello')}">${ic('usbkey', 'i-sm')}Anmeldung${tags.length ? ` <span class="muted" style="font-size:11px">· ${tags.join(' · ')}</span>` : ''}</button>`);
    });
  };
}
async function openLoginEditor(u) {
  const self = u.id === S.user.id;
  let by; try { by = self ? {name: S.user.name} : (await stepUp({title: 'Anmeldung bearbeiten', text: u.name, admin: true})).by; } catch { return; }
  const m = AUTH.methods[u.id] || {};
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Anmeldung"><div class="m-head"><div class="m-ic">${ic('usbkey')}</div><div><h2>Anmeldung · ${esc(u.name)}</h2><p>PIN bleibt immer möglich · zusätzliche Wege</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:14px">
      <label class="field"><span>Benutzername oder E-Mail <span class="muted">(auch für Single Sign-On)</span></span><input class="input" id="leLogin" value="${esc(m.login || '')}" placeholder="z. B. lena.moser@firma.at" autocomplete="off"></label>
      <div class="ed-grid"><label class="field"><span>${m.passwort ? 'Neues Passwort' : 'Passwort (optional)'}</span><input class="input" id="lePw" type="password" autocomplete="new-password" placeholder="mind. 10 Zeichen"></label><label class="field"><span>Wiederholen</span><input class="input" id="lePw2" type="password" autocomplete="new-password"></label></div>
      ${m.passwort ? `<div><button class="btn btn-ghost btn-sm" id="lePwOff">${ic('trash', 'i-sm')}Passwort entfernen</button></div>` : ''}
      <div class="set-row" style="padding:10px 0;border-bottom:0"><div><div class="set-l">Windows Hello ${m.hello ? '<span class="pill pos" style="height:20px">aktiv</span>' : ''}</div><div class="set-h">${IS_WIN ? (self ? 'Gesicht, Fingerabdruck oder Geräte-PIN dieses PCs' : 'Kann nur die Person selbst an ihrem PC einrichten') : 'nur unter Windows'}</div></div><div class="set-c">${m.hello ? `<button class="btn btn-secondary btn-sm" id="leHelloOff">Ausschalten</button>` : `<button class="btn btn-secondary btn-sm" id="leHello" ${IS_WIN && self ? '' : 'disabled'}>${ic('faceid', 'i-sm')}Einrichten</button>`}</div></div>
    </div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="leSave">${ic('check', 'i-sm')}Speichern</button></div></div>`, {focus: '#leLogin'});
  const after = async msg => { await loadAuth(); renderUsersBox(); if (msg) toast(msg, {type: 'pos', icon: 'usbkey', t2: u.name}); };
  el.addEventListener('click', async e => {
    if (e.target.closest('#lePwOff')) { try { await invoke('auth_password_clear', {user: u.id, by: by.name}); } catch (err) { return toast('Fehler', {t2: String(err), type: 'warn'}); } closeLayer(el); return after('Passwort entfernt'); }
    if (e.target.closest('#leHello')) { try { await invoke('auth_hello', {user: u.id, enable: true}); } catch (err) { return toast('Windows Hello nicht eingerichtet', {t2: String(err), type: 'warn', dur: 7000}); } closeLayer(el); return after('Windows Hello eingerichtet'); }
    if (e.target.closest('#leHelloOff')) { try { await invoke('auth_hello_off', {user: u.id}); } catch (err) { return toast('Fehler', {t2: String(err), type: 'warn'}); } closeLayer(el); return after('Windows Hello ausgeschaltet'); }
    if (e.target.closest('#leSave')) {
      const login = $('#leLogin', el).value.trim(), pw = $('#lePw', el).value, pw2 = $('#lePw2', el).value;
      if (pw !== pw2) return toast('Passwörter stimmen nicht überein', {type: 'warn'});
      try { await invoke('auth_password_set', {user: u.id, login, password: pw || null, by: by.name}); } catch (err) { return toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      closeLayer(el); after(pw ? 'Passwort gesetzt' : 'Benutzername gespeichert');
    }
  });
}

/* ── Einstellungen → Single Sign-On ── */
SET_SECTIONS.splice(SET_SECTIONS.findIndex(s => s[0] === 'benutzer') + 1, 0, ['sso', 'Single Sign-On', 'usbkey']);
{
  const _rs = renderSettings;
  renderSettings = function () {
    _rs();
    const a = $('#sec-benutzer'); if (!a) return;
    a.insertAdjacentHTML('afterend', `<section class="set-sec" id="sec-sso"><h2>Single Sign-On</h2><p>Anmeldung mit dem Firmenkonto über OpenID Connect – z. B. <b>Microsoft Entra ID</b> (Azure AD), <b>Google Workspace</b>, Keycloak oder AD FS. Kontor öffnet den Browser, die Person meldet sich beim Anbieter an, Kontor prüft die Signatur und ordnet die E-Mail einem Benutzer zu (Benutzer & Rechte → Anmeldung).</p><div class="card">
      ${field('sso.name', 'Bezeichnung am Anmeldebildschirm', 'z. B. Microsoft Entra ID, Google')}
      ${field('sso.issuer', 'Aussteller (Issuer-URL)', 'Entra ID: https://login.microsoftonline.com/<Mandanten-ID>/v2.0 · Google: https://accounts.google.com')}
      ${field('sso.client_id', 'Client-ID (Anwendungs-ID)', 'aus der App-Registrierung')}
      ${field('sso.client_secret', 'Client-Geheimnis', 'nur falls der Anbieter eines verlangt (Google: ja, Entra „Mobile & Desktop“: nein)', 'password')}
      <div class="set-row" style="border-bottom:0"><div><div class="set-l">Weiterleitungs-URI beim Anbieter</div><div class="set-h"><span class="mono">http://127.0.0.1</span> (Plattform „Mobilgerät und Desktop“ bzw. „Desktop-App“) – Kontor wählt den Port selbst.</div></div><div class="set-c"><button class="btn btn-secondary btn-sm" data-sso="test" ${DESKTOP ? '' : 'disabled'}>${ic('building', 'i-sm')}Testen</button></div></div></div></section>`);
  };
}
function bindAuth() {
  $('#view-einstellungen').addEventListener('click', async e => {
    if (!e.target.closest('[data-sso="test"]')) return;
    if (!ssoReady()) return toast('Aussteller und Client-ID eintragen', {type: 'warn'});
    toast('Browser öffnet sich …', {icon: 'building'});
    try { const u = await invoke('auth_sso'); toast('Single Sign-On funktioniert', {t2: `angemeldet als ${u.name}`, type: 'pos', icon: 'check'}); } catch (err) { toast('Single Sign-On fehlgeschlagen', {t2: String(err), type: 'warn', dur: 9000}); }
  });
  const loginClick = e => { const b = e.target.closest('[data-login]'); if (b) { e.stopPropagation(); openLoginEditor(STAFF.find(s => s.id === b.dataset.login)); } };
  $('#view-einstellungen').addEventListener('click', loginClick, true);
  $('#view-benutzer').addEventListener('click', loginClick, true);
}
