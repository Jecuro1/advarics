
/* ════════════════════════════════════════════════════════════════════
   21 · BENUTZER, ANMELDUNG, FREIGABEN
   Desktop: Benutzer und PINs in der lokalen Datenbank (PIN nur als
   gesalzener Hash), Sperre nach Fehlversuchen. Freigaben (Step-up)
   nur durch Filialleitung oder Administrator.
   Browser-Vorschau: Testbenutzer, jede PIN außer 0000.
   ════════════════════════════════════════════════════════════════════ */
const ROLE_NAMES = {kasse: 'Kasse', verkauf: 'Verkauf', leitung: 'Filialleitung', admin: 'Administrator'};
const canApprove = u => ['leitung', 'admin'].includes(u?.roleKey);
/** Foto nur als eingebettetes Bild (data:image) akzeptieren – nie beliebige Adressen */
const fotoOk = f => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(f || '') ? f : '';
function setUsers(list) {
  const cur = S.user?.id;
  STAFF.length = 0;
  list.forEach(u => {
    const p = u.profile || {};
    STAFF.push({id: u.id, name: u.name, role: ROLE_NAMES[u.role] || u.role, roleKey: u.role, hue: hash(u.id) % 360, initials: initials(u.name),
      nr: u.nr || 0, foto: fotoOk(p.foto), bon: String(p.bonname || '').trim(), verkaeufer: p.verkaeufer !== false, filialen: p.filialen || [], email: p.email || '', mobil: p.mobil !== false});
  });
  S.user = STAFF.find(s => s.id === cur) || STAFF[0];
}
/** Runder Avatar: Foto, sonst Initialen */
const avatarHTML = (u, cls = '', style = '') => u?.foto
  ? `<span class="avatar has-photo ${cls}" style="--h:${u.hue};background-image:url('${u.foto}');${style}" role="img" aria-label="${esc(u.name)}"></span>`
  : `<span class="avatar ${cls}" style="--h:${u?.hue ?? 26};${style}">${u?.initials ?? ''}</span>`;
/** Name auf dem Bon: der gewählte Bonname, sonst der Vorname (fullFallback: sonst der ganze Name) */
const bonName = (full, fullFallback = false) => { const u = STAFF.find(s => s.name === full); return u?.bon || (fullFallback ? String(full || '') : String(full || '').split(' ')[0]); };
/** Personen, die als Verkäufer:in gewählt werden können (Standard: alle) */
const sellers = () => STAFF.filter(s => s.verkaeufer !== false);
/** Anmeldung nur an zugeordneten Filialen (Administratoren immer; unbekannte/gelöschte Filialen zählen nicht) */
function userAtThisFiliale(u) {
  if (!u || u.roleKey === 'admin') return true;
  const f = (u.filialen || []).filter(id => STORES.some(s => s.id === id));
  return !f.length || f.includes(S.store);
}
/** Anmeldeliste dieser Kasse (sperrt sich nie ganz aus) */
const lockStaff = () => { const l = STAFF.filter(userAtThisFiliale); return l.length ? l : STAFF.slice(); };
async function loadUsers() {
  if (!DESKTOP) { STAFF.forEach(s => { s.roleKey ||= s.role === 'Filialleitung' ? 'leitung' : 'verkauf'; }); return; }
  try { setUsers(await invoke('users_list')); } catch (e) { toast('Benutzer konnten nicht geladen werden', {t2: String(e), type: 'warn'}); }
}
async function checkPin(user, pin, purpose) {
  if (!DESKTOP) { if (pin === '0000') throw new Error('Falsche PIN'); if (purpose === 'freigabe' && !canApprove(user)) throw new Error(`${user.name} darf keine Freigaben erteilen`); return user; }
  try { await invoke('user_verify', {id: user.id, pin, purpose}); return user; }
  catch (e) {
    if (String(e) !== 'TOTP') throw new Error(String(e));
    // Zwei-Faktor aktiv: zusätzlich Code aus der Authenticator-App
    const code = await askTotp(user); if (!code) throw new Error('Abgebrochen – Code aus der Authenticator-App fehlt');
    try { await invoke('user_verify', {id: user.id, pin, purpose, code}); return user; } catch (e2) { throw new Error(String(e2)); }
  }
}
const pinPad = () => `<div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<span></span><button data-k="0">0</button><button class="fn" data-k="back" aria-label="Löschen">${ic('chevron-left')}</button></div>`;
const shakeEl = el => { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };

/* ── Sperrbildschirm / Anmeldung ── */
function lock() {
  if (S.locked) return;
  closePopover(); [...layers].reverse().forEach(l => { if (!l.el.querySelector('.pay')) closeLayer(l.el); });
  S.locked = true;
  const staff0 = lockStaff();
  let user = staff0.includes(S.user) ? S.user : staff0[0] || S.user, pin = '', busy = false;
  const el = document.createElement('div'); el.className = 'lockscreen'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Kasse gesperrt');
  el.innerHTML = `<div class="lock-in">
    <div class="lock-time" id="lockTime">${clock()}</div>
    <div class="lock-date">${esc(DATE_LONG)} · ${esc(CFG['kasse.name'])} ${esc(CFG['kasse.id'])} ${S.started ? 'gesperrt' : '· Anmeldung'}</div>
    <div class="lock-users">${staff0.map(u => `<button class="lock-user" data-u="${u.id}" aria-pressed="${u.id === user.id}">${avatarHTML(u, 'xl')}${esc(u.name.split(' ')[0])}</button>`).join('')}</div>
    <div class="lock-card" id="lockCard"></div>
    <div class="lock-foot" id="lockFoot">${DESKTOP ? `<span style="display:inline-flex;gap:6px;align-items:center">${ic('shield', 'i-xs')}PIN-Anmeldung · lokal geprüft</span>` : `<span>Vorschau: jede PIN außer 0000</span>`}</div></div>`;
  document.body.appendChild(el);
  if (DESKTOP) invoke('users_default_pins').then(l => { if (l.length && $('#lockFoot', el)) $('#lockFoot', el).insertAdjacentHTML('beforeend', `<span>·</span><span style="color:var(--warn)">Erst-PIN noch aktiv: ${esc(l.join(' · '))} – bitte unter Stammdaten → Benutzer ändern</span>`); }).catch(() => {});
  const card = $('#lockCard', el);
  const renderCard = msg => {
    card.innerHTML = `<div style="text-align:center;font-size:13px;color:var(--text-2)">PIN für <b style="color:var(--text)">${esc(user.name)}</b> · ${esc(user.role)}</div>
      <div class="pin-dots" id="lockDots" style="margin:14px 0 ${msg ? 6 : 16}px"><i></i><i></i><i></i><i></i></div>
      ${msg ? `<div style="text-align:center;font-size:12.5px;color:var(--neg);margin-bottom:10px">${esc(msg)}</div>` : ''}
      ${pinPad()}
      ${DESKTOP ? altAuthHTML(user) : `<div class="or">oder anmelden mit</div>
      <div class="auth-alt"><button class="btn btn-secondary" data-m="hello">${ic('faceid')}Windows Hello</button><button class="btn btn-secondary" data-m="fido">${ic('usbkey')}Sicherheitsschlüssel</button><button class="btn btn-secondary" data-m="nfc">${ic('idcard')}Mitarbeiterkarte</button><button class="btn btn-secondary" data-m="sso">${ic('building')}Entra ID · SSO</button></div>`}`;
  };
  const dots = () => $$('#lockDots i', el).forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const unlock = method => {
    if (typeof accessAllowed === 'function' && !accessAllowed(user.name, user.roleKey)) { Hooks.emit('auth.denied', {benutzer: user.name, grund: 'Zugangsprofil'}); pin = ''; renderCard('Anmeldung zu dieser Zeit nicht erlaubt (Zugangsprofil)'); return; }
    if (!userAtThisFiliale(user)) { Hooks.emit('auth.denied', {benutzer: user.name, grund: 'Filiale'}); pin = ''; renderCard('Keine Anmeldung an dieser Filiale (Zuordnung unter Benutzer › Zugeordnete Filialen)'); return; }
    busy = true; S.user = user; S.locked = false; S.started = true;
    Hooks.emit('auth.login', {benutzer: user.name, rolle: user.role, methode: method, kasse: CFG['kasse.id']});
    el.classList.add('closing'); setTimeout(() => el.remove(), 320);
    renderMe(); renderTopbar(); if (S.view === 'dashboard') renderDashboard();
    toast(`Willkommen, ${user.name.split(' ')[0]}`, {t2: `Angemeldet per ${method} · ${user.role}`, type: 'pos', icon: 'user'});
    setTimeout(() => S.view === 'kasse' && $('#posSearch')?.focus(), 340);
  };
  const waitFor = async (icon, msg, method) => {
    if (busy) return; busy = true;
    card.innerHTML = `<div class="authwait" style="padding:26px 0"><div class="ring">${ic(icon)}</div><p>${esc(msg)}</p></div>`;
    await wait(reduced() ? 200 : 1300); unlock(method);
  };
  const key = async k => {
    if (busy) return;
    if (k === 'back') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
    dots();
    if (pin.length === 4) {
      busy = true;
      try { await checkPin(user, pin, 'anmeldung'); setTimeout(() => unlock('PIN'), 120); }
      catch (e) { busy = false; pin = ''; renderCard(e.message); shakeEl($('#lockDots', el)); Hooks.emit('auth.login.failed', {benutzer: user.name, methode: 'PIN'}); }
    }
  };
  el.addEventListener('click', e => {
    const u = e.target.closest('[data-u]'); if (u && !busy) { user = STAFF.find(s => s.id === u.dataset.u); pin = ''; $$('.lock-user', el).forEach(b => b.setAttribute('aria-pressed', b === u)); renderCard(); return; }
    const k = e.target.closest('[data-k]'); if (k) return key(k.dataset.k);
    const m = e.target.closest('[data-m]'); if (!m) return;
    if (DESKTOP) { if (busy) return; return altAuth(m.dataset.m, user, card, (u, method) => { user = u; unlock(method); }, () => renderCard()); }
    ({hello: () => waitFor('faceid', 'Windows Hello · Gesicht wird erkannt …', 'Windows Hello'), fido: () => waitFor('usbkey', 'Sicherheitsschlüssel einstecken und berühren …', 'FIDO2'),
      nfc: () => waitFor('idcard', 'Mitarbeiterkarte an den Leser halten …', 'NFC-Karte'), sso: () => waitFor('building', 'Weiterleitung an Ihren Identitätsanbieter (OIDC) …', 'Entra ID')})[m.dataset.m]();
  });
  S.lockKey = e => { if (/^\d$/.test(e.key)) { key(e.key); e.preventDefault(); } else if (e.key === 'Backspace') { key('back'); e.preventDefault(); } };
  renderCard();
  Hooks.emit('pos.locked', {kasse: CFG['kasse.id'], benutzer: S.user.name});
}

/* ── Freigabe (Step-up) ── */
function stepUp({title, text, rule, admin = false, roles = null, purpose = 'freigabe'}) {
  return new Promise((resolve, reject) => {
    const approvers = STAFF.filter(u => roles ? roles.includes(u.roleKey) : admin ? u.roleKey === 'admin' : canApprove(u));
    if (!approvers.length) { toast('Keine berechtigte Person', {t2: roles ? 'Keine Person mit diesem Recht angelegt' : admin ? 'Es ist kein Administrator angelegt' : 'Es ist keine Filialleitung angelegt', type: 'warn'}); return reject(new Error('keine Berechtigten')); }
    let done = false, pin = '', busy = false, ap = approvers.find(u => u.id === S.user.id) || approvers[0];
    const el = openLayer(`<div class="modal" style="width:min(440px,100%)" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div id="suBox"></div></div>`, {onClose: () => { if (!done) reject(new Error('abgebrochen')); }});
    const box = $('#suBox', el);
    const render = msg => {
      box.innerHTML = `<div class="m-head"><div class="m-ic" style="color:var(--warn)">${ic('shield')}</div><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div></div>
      <div class="m-body" id="suBody">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${approvers.map(u => `<button class="chip" data-ap="${u.id}" aria-pressed="${u.id === ap.id}" style="height:34px">${avatarHTML(u, '', 'width:22px;height:22px;font-size:9.5px')}${esc(u.name)} · ${esc(u.role)}</button>`).join('')}</div>
        <div class="pin-dots" id="suDots" aria-label="PIN-Eingabe"><i></i><i></i><i></i><i></i></div>
        ${msg ? `<div style="text-align:center;font-size:12.5px;color:var(--neg);margin:-4px 0 10px">${esc(msg)}</div>` : ''}
        ${pinPad().replace('<span></span>', '<button class="fn" data-close>Abbr.</button>')}
        ${rule ? `<div class="prompt-hint" style="margin-top:14px">${ic('flow', 'i-xs')}${esc(rule)}</div>` : ''}
      </div>`;
    };
    const dots = () => $$('#suDots i', el).forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const ok = async () => {
      done = true;
      box.innerHTML = `<div class="m-body"><div class="authwait"><div class="ok-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div><p><b style="color:var(--text)">Freigegeben</b> von ${esc(ap.name)} · PIN</p></div></div>`;
      Hooks.emit('auth.stepup.granted', {von: ap.name, methode: 'PIN', regel: rule || null});
      await wait(reduced() ? 100 : 650); closeLayer(el); resolve({by: ap, method: 'PIN'});
    };
    const key = async k => {
      if (busy || done) return;
      if (k === 'back') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
      dots();
      if (pin.length === 4) {
        busy = true;
        try { await checkPin(ap, pin, purpose); ok(); }
        catch (e) { busy = false; pin = ''; render(e.message); shakeEl($('#suDots', el)); Hooks.emit('auth.stepup.failed', {von: ap.name, methode: 'PIN'}); }
      }
    };
    el.addEventListener('click', e => { const a = e.target.closest('[data-ap]'); if (a && !busy) { ap = approvers.find(u => u.id === a.dataset.ap); pin = ''; render(); return; } const b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); });
    el.addEventListener('keydown', e => { if (done) return; if (/^\d$/.test(e.key)) { key(e.key); e.preventDefault(); } else if (e.key === 'Backspace') { key('back'); e.preventDefault(); } });
    render();
  });
}

/* ── Einstellungen → Benutzer ── */
function usersSectionHTML() {
  return `<section class="set-sec" id="sec-benutzer"><h2>Benutzer & Anmeldung</h2><p>Jede Person meldet sich mit eigener PIN an – auf Wunsch zusätzlich mit Code aus einer Authenticator-App (2FA). Was eine Rolle darf, steht unter „Rechte je Rolle“; fehlt ein Recht, gibt eine berechtigte Person per PIN frei. Rabatt- und Storno-Freigaben erteilen Filialleitung und Administrator. Nach 5 Fehlversuchen ist die PIN 2 Minuten gesperrt.</p>
    <div class="card"><div class="set-row" style="border-bottom:0"><div><div class="set-l">Benutzer, PINs, Zwei-Faktor und Rechte</div><div class="set-h">Eigene Seite: Stammdaten → Benutzer</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-goto="benutzer">${ic('shield', 'i-sm')}Öffnen</button></div></div></div></section>`;
}
