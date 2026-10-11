
/* ════════════════════════════════════════════════════════════════════
   21 · BENUTZER, ANMELDUNG, FREIGABEN
   Desktop: Benutzer und PINs in der lokalen Datenbank (PIN nur als
   gesalzener Hash), Sperre nach Fehlversuchen. Freigaben (Step-up)
   nur durch Filialleitung oder Administrator.
   Browser-Vorschau: Testbenutzer, jede PIN außer 0000.
   ════════════════════════════════════════════════════════════════════ */
const ROLE_NAMES = {kasse: 'Kasse', verkauf: 'Verkauf', leitung: 'Filialleitung', admin: 'Administrator'};
const canApprove = u => ['leitung', 'admin'].includes(u?.roleKey);
function setUsers(list) {
  const cur = S.user?.id;
  STAFF.length = 0;
  list.forEach(u => STAFF.push({id: u.id, name: u.name, role: ROLE_NAMES[u.role] || u.role, roleKey: u.role, hue: hash(u.id) % 360, initials: initials(u.name)}));
  S.user = STAFF.find(s => s.id === cur) || STAFF[0];
}
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
  let user = S.user, pin = '', busy = false;
  const el = document.createElement('div'); el.className = 'lockscreen'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Kasse gesperrt');
  el.innerHTML = `<div class="lock-in">
    <div class="lock-time" id="lockTime">${clock()}</div>
    <div class="lock-date">${esc(DATE_LONG)} · ${esc(CFG['kasse.name'])} ${esc(CFG['kasse.id'])} ${S.started ? 'gesperrt' : '· Anmeldung'}</div>
    <div class="lock-users">${STAFF.map(u => `<button class="lock-user" data-u="${u.id}" aria-pressed="${u.id === user.id}"><span class="avatar xl" style="--h:${u.hue}">${u.initials}</span>${esc(u.name.split(' ')[0])}</button>`).join('')}</div>
    <div class="lock-card" id="lockCard"></div>
    <div class="lock-foot" id="lockFoot">${DESKTOP ? `<span style="display:inline-flex;gap:6px;align-items:center">${ic('shield', 'i-xs')}PIN-Anmeldung · lokal geprüft</span>` : `<span>Vorschau: jede PIN außer 0000</span>`}</div></div>`;
  document.body.appendChild(el);
  if (DESKTOP) invoke('users_default_pins').then(l => { if (l.length && $('#lockFoot', el)) $('#lockFoot', el).insertAdjacentHTML('beforeend', `<span>·</span><span style="color:var(--warn)">Erst-PIN noch aktiv: ${esc(l.join(' · '))} – bitte unter Einstellungen → Benutzer ändern</span>`); }).catch(() => {});
  const card = $('#lockCard', el);
  const renderCard = msg => {
    card.innerHTML = `<div style="text-align:center;font-size:13px;color:var(--text-2)">PIN für <b style="color:var(--text)">${esc(user.name)}</b> · ${esc(user.role)}</div>
      <div class="pin-dots" id="lockDots" style="margin:14px 0 ${msg ? 6 : 16}px"><i></i><i></i><i></i><i></i></div>
      ${msg ? `<div style="text-align:center;font-size:12.5px;color:var(--neg);margin-bottom:10px">${esc(msg)}</div>` : ''}
      ${pinPad()}
      ${DESKTOP ? '<div class="or" style="margin-top:14px">Windows Hello, Sicherheitsschlüssel und SSO folgen</div>' : `<div class="or">oder anmelden mit</div>
      <div class="auth-alt"><button class="btn btn-secondary" data-m="hello">${ic('faceid')}Windows Hello</button><button class="btn btn-secondary" data-m="fido">${ic('usbkey')}Sicherheitsschlüssel</button><button class="btn btn-secondary" data-m="nfc">${ic('idcard')}Mitarbeiterkarte</button><button class="btn btn-secondary" data-m="sso">${ic('building')}Entra ID · SSO</button></div>`}`;
  };
  const dots = () => $$('#lockDots i', el).forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const unlock = method => {
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
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${approvers.map(u => `<button class="chip" data-ap="${u.id}" aria-pressed="${u.id === ap.id}" style="height:34px"><span class="avatar" style="--h:${u.hue};width:22px;height:22px;font-size:9.5px">${u.initials}</span>${esc(u.name)} · ${esc(u.role)}</button>`).join('')}</div>
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
    <div class="card"><div class="set-row" style="border-bottom:0"><div><div class="set-l">Benutzer, PINs, Zwei-Faktor und Rechte</div><div class="set-h">Eigene Seite: System → Benutzer & Rechte</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-goto="benutzer">${ic('shield', 'i-sm')}Öffnen</button></div></div></div></section>`;
}
function renderUsersBox() {
  const box = $('#usrBox'); if (!box) return;
  box.innerHTML = STAFF.map(u => `<div class="set-row"><div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="--h:${u.hue}">${u.initials}</span><div><div class="set-l">${esc(u.name)}${u.id === S.user.id ? ' <span class="pill accent" style="height:18px">angemeldet</span>' : ''}</div><div class="set-h">${esc(u.role)} · Kennung ${esc(u.id)}</div></div></div>
      <div class="set-c" style="gap:6px"><button class="btn btn-secondary btn-sm" data-usr="${u.id}">${ic('sliders', 'i-sm')}Bearbeiten</button></div></div>`).join('')
    + `<div class="set-row"><div><div class="set-l">Neue Person</div><div class="set-h">${DESKTOP ? 'Name, Rolle und Erst-PIN festlegen' : 'In der Vorschau nicht verfügbar'}</div></div><div class="set-c"><button class="btn btn-primary btn-sm" data-usr="" ${DESKTOP ? '' : 'disabled'}>${ic('user-plus', 'i-sm')}Benutzer anlegen</button></div></div>`;
}
async function openUserEditor(u) {
  if (!DESKTOP) return toast('Nur in der Desktop-App', {type: 'warn'});
  let by; try { by = (await stepUp({title: 'Administrator-Freigabe', text: u ? `${u.name} bearbeiten` : 'Neue Person anlegen', admin: true})).by; } catch { return; }
  const st = {name: u?.name || '', role: u?.roleKey || 'kasse', pin: '', pin2: ''};
  const el = openLayer(`<div class="modal" style="width:min(480px,100%)" role="dialog" aria-modal="true" aria-label="Benutzer"><div id="ueBody"></div></div>`, {focus: '[data-uf="name"]'});
  const box = $('#ueBody', el);
  const render = () => {
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('user')}</div><div><h2>${u ? esc(u.name) : 'Neue Person'}</h2><p>${u ? 'PIN leer lassen, um sie nicht zu ändern' : 'Die PIN gibt die Person beim ersten Mal selbst ein'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:14px">
        <label class="field"><span>Name</span><input class="input" data-uf="name" value="${esc(st.name)}" autocomplete="off"></label>
        <div><div class="field"><span>Rolle</span></div><div class="reasons" style="margin-top:6px">${Object.entries(ROLE_NAMES).map(([k, l]) => `<button class="chip" data-role="${k}" aria-pressed="${k === st.role}">${l}</button>`).join('')}</div>
          <div class="prompt-hint">${ic('info', 'i-xs')}Kasse/Verkauf: verkaufen, retournieren bis zur Grenze · Filialleitung: Freigaben, Abschluss · Administrator: zusätzlich Benutzer, RKSV, Wiederherstellung</div></div>
        <div class="ed-grid"><label class="field"><span>${u ? 'Neue PIN (4 Ziffern)' : 'PIN (4 Ziffern)'}</span><input class="input num" data-uf="pin" type="password" inputmode="numeric" maxlength="4" value="${esc(st.pin)}" autocomplete="new-password"></label>
          <label class="field"><span>PIN wiederholen</span><input class="input num" data-uf="pin2" type="password" inputmode="numeric" maxlength="4" value="${esc(st.pin2)}" autocomplete="new-password"></label></div>
      </div>
      <div class="m-foot">${u ? `<button class="btn btn-danger" id="ueDel">${ic('trash', 'i-sm')}Deaktivieren</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="ueSave">${ic('check', 'i-sm')}Speichern</button></div>`;
  };
  const collect = () => $$('[data-uf]', el).forEach(i => { st[i.dataset.uf] = i.value.trim(); });
  el.addEventListener('click', async e => {
    const r = e.target.closest('[data-role]'); if (r) { collect(); st.role = r.dataset.role; return render(); }
    if (e.target.closest('#ueDel')) {
      if (u.id === S.user.id) return toast('Eigenes Konto kann nicht deaktiviert werden', {type: 'warn'});
      try { setUsers(await invoke('user_delete', {id: u.id, by: by.name})); } catch (err) { return toast('Nicht möglich', {t2: String(err), type: 'warn'}); }
      closeLayer(el); renderUsersBox(); renderMe(); toast('Benutzer deaktiviert', {t2: u.name, icon: 'trash'}); return;
    }
    if (e.target.closest('#ueSave')) {
      collect();
      if (st.name.length < 2) return toast('Name fehlt', {type: 'warn'});
      if ((st.pin || !u) && !/^\d{4}$/.test(st.pin)) return toast('PIN: genau 4 Ziffern', {type: 'warn'});
      if (st.pin !== st.pin2) return toast('PINs stimmen nicht überein', {type: 'warn'});
      try { setUsers(await invoke('user_save', {user: {id: u?.id || '', name: st.name, role: st.role, active: true}, pin: st.pin || null, by: by.name})); }
      catch (err) { return toast('Speichern fehlgeschlagen', {t2: String(err), type: 'warn'}); }
      closeLayer(el); renderUsersBox(); renderMe();
      toast(u ? 'Benutzer gespeichert' : 'Benutzer angelegt', {t2: `${st.name} · ${ROLE_NAMES[st.role]}${st.pin ? ' · neue PIN aktiv' : ''}`, type: 'pos', icon: 'user'});
    }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('#ueSave', el).click(); } });
  render();
}
