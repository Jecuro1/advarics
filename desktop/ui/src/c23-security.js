
/* ════════════════════════════════════════════════════════════════════
   33 · RECHTE & ZWEI-FAKTOR — Rechte je Rolle (anpassbar, in der
   Datenbank), Prüfung vor sensiblen Aktionen mit Freigabe durch eine
   berechtigte Person; Authenticator-App (TOTP) je Benutzer.
   ════════════════════════════════════════════════════════════════════ */
const SEC = {roles: null, perms: [], totp: new Set()};
const PERM_DEFAULT = {kasse: ['kasse.verkaufen', 'kasse.kassenbuch', 'kunden.bearbeiten'], verkauf: ['kasse.verkaufen', 'kasse.retoure', 'kasse.kassenbuch', 'artikel.bearbeiten', 'bestand.buchen', 'einkauf', 'kunden.bearbeiten']};
async function loadSecurity() {
  if (!DESKTOP) return;
  try { const m = await invoke('permissions_get'); SEC.roles = m.roles; SEC.perms = m.perms; SEC.totp = new Set(await invoke('totp_users')); } catch (e) { console.error(e); }
}
function can(perm, u = S.user) {
  const role = u?.roleKey; if (!role) return false;
  if (!SEC.roles) return role === 'admin' || role === 'leitung' || (PERM_DEFAULT[role] || []).includes(perm);
  return !!SEC.roles[role]?.[perm];
}
const permLabel = p => SEC.perms.find(x => x.perm === p)?.label || p;
const rolesWith = perm => Object.keys(ROLE_NAMES).filter(r => SEC.roles ? SEC.roles[r]?.[perm] : can(perm, {roleKey: r}));
/** Recht prüfen; fehlt es, gibt eine berechtigte Person per PIN frei. Wirft „abgebrochen“. */
async function needPerm(perm, title, text) {
  if (can(perm)) return {by: S.user};
  const g = SEC.grant?.[perm]; if (g && g.user === S.user.id && Date.now() - g.t < 90e3) return {by: g.by};   // eben freigegeben: nicht doppelt fragen
  try { const r = await stepUp({title: title || 'Freigabe erforderlich', text: text || `${S.user.name} (${S.user.role}) fehlt das Recht „${permLabel(perm)}“.`, rule: `Recht „${permLabel(perm)}“ · festgelegt unter Einstellungen → Benutzer → Rechte`, roles: rolesWith(perm), purpose: DESKTOP ? 'recht:' + perm : 'freigabe'}); (SEC.grant ||= {})[perm] = {user: S.user.id, by: r.by, t: Date.now()}; return r; }
  catch (e) { throw new Error('abgebrochen'); }
}
function guard(perm, fn, title) {
  return async function (...args) {
    try { await needPerm(perm, title); } catch { return; }
    return fn.apply(this, args);
  };
}

/* ── Code aus der Authenticator-App abfragen (auch über dem Sperrbildschirm) ── */
function askTotp(user) {
  return new Promise(resolve => {
    let done = false;
    const el = openLayer(`<div class="modal" style="width:min(400px,100%)" role="dialog" aria-modal="true" aria-label="Zwei-Faktor-Code">
      <div class="m-head"><div class="m-ic">${ic('shield')}</div><div><h2>Bestätigungscode</h2><p>${esc(user.name)} · 6-stelliger Code aus der Authenticator-App</p></div></div>
      <div class="m-body"><input class="input num" id="totpIn" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000" style="font-size:26px;height:56px;text-align:center;letter-spacing:.2em"></div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="totpGo">${ic('check', 'i-sm')}Bestätigen</button></div></div>`, {cls: 'over-lock', focus: '#totpIn', onClose: () => { if (!done) resolve(null); }});
    const inp = $('#totpIn', el);
    const go2 = () => { const c = inp.value.replace(/\D/g, ''); if (c.length !== 6) return shakeEl(inp); done = true; resolve(c); closeLayer(el); };
    $('#totpGo', el).onclick = go2;
    inp.addEventListener('input', () => { if (inp.value.replace(/\D/g, '').length === 6) go2(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
  });
}
async function openTotp(u) {
  if (!DESKTOP) return;
  const on = SEC.totp.has(u.id);
  try { if (u.id !== S.user.id || on) await needPerm('system', on ? 'Zwei-Faktor ausschalten' : 'Zwei-Faktor einrichten', `${u.name} · Authenticator-App`); } catch { return; }
  if (on) {
    try { await invoke('totp_disable', {user: u.id, by: S.user.name}); SEC.totp.delete(u.id); } catch (e) { return toast('Fehler', {t2: String(e), type: 'warn'}); }
    renderUsersBox(); toast('Zwei-Faktor ausgeschaltet', {t2: u.name, icon: 'shield'}); return;
  }
  let t, svg;
  try { t = await invoke('totp_begin', {user: u.id}); svg = await invoke('qr_svg', {text: t.uri}); } catch (e) { return toast('Fehler', {t2: String(e), type: 'warn'}); }
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Zwei-Faktor einrichten">
    <div class="m-head"><div class="m-ic">${ic('shield')}</div><div><h2>Authenticator-App verbinden</h2><p>${esc(u.name)} · z. B. Microsoft Authenticator, Google Authenticator, 1Password</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;grid-template-columns:180px 1fr;gap:18px;align-items:start">
      <div style="background:#fff;border-radius:12px;padding:6px;line-height:0" id="totpQr">${svg}</div>
      <div style="display:grid;gap:12px"><div style="font-size:13px;color:var(--text-2)">1. QR-Code mit der App scannen<br>2. Den angezeigten 6-stelligen Code eingeben</div>
        <div><div class="muted" style="font-size:11.5px">Oder Schlüssel manuell eingeben</div><div class="mono" style="font-size:12.5px;word-break:break-all;margin-top:4px">${esc(t.secret.match(/.{1,4}/g).join(' '))}</div></div>
        <input class="input num" id="totpCode" inputmode="numeric" maxlength="7" placeholder="000 000" style="font-size:20px;text-align:center;letter-spacing:.2em"></div></div>
    <div class="prompt-hint blk" style="padding:0 22px">${ic('info', 'i-xs')}Danach wird bei jeder PIN-Anmeldung und Freigabe dieser Person zusätzlich der Code abgefragt.</div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="totpOk">${ic('check', 'i-sm')}Aktivieren</button></div></div>`, {focus: '#totpCode'});
  const svgEl = $('#totpQr svg', el); if (svgEl) { svgEl.setAttribute('width', '168'); svgEl.setAttribute('height', '168'); }
  const ok = async () => {
    const code = $('#totpCode', el).value.replace(/\D/g, '');
    try { await invoke('totp_enable', {user: u.id, secret: t.secret, code}); } catch (e) { shakeEl($('#totpCode', el)); return toast('Code stimmt nicht', {t2: String(e), type: 'warn'}); }
    SEC.totp.add(u.id); closeLayer(el); renderUsersBox(); toast('Zwei-Faktor aktiv', {t2: `${u.name} · ab der nächsten Anmeldung`, type: 'pos', icon: 'shield'});
  };
  $('#totpOk', el).onclick = ok;
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
}

/* ── Einstellungen → Benutzer: 2FA je Person und Rechte-Matrix ── */
const _renderUsersBox = renderUsersBox;
renderUsersBox = function () {
  _renderUsersBox();
  const box = $('#usrBox'); if (!box || !DESKTOP) return;
  STAFF.forEach(u => {
    const b = $(`[data-usr="${u.id}"]`, box); if (!b) return;
    const on = SEC.totp.has(u.id);
    b.insertAdjacentHTML('beforebegin', `<button class="btn ${on ? 'btn-secondary' : 'btn-ghost'} btn-sm" data-totp="${u.id}" data-tip="${on ? 'Zwei-Faktor ist aktiv – klicken zum Ausschalten' : 'Authenticator-App als zweiten Faktor einrichten'}">${ic('shield', 'i-sm')}${on ? '2FA aktiv' : '2FA'}</button>`);
  });
  $('#permBox')?.remove();
  box.insertAdjacentHTML('afterend', `<div class="card" id="permBox" style="margin-top:12px"><div class="set-row"><div><div class="set-l">Rechte je Rolle</div><div class="set-h">Fehlt ein Recht, kann eine berechtigte Person die Aktion per PIN freigeben. Änderungen erfordern einen Administrator.</div></div></div>
    <table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Recht</th>${Object.values(ROLE_NAMES).map(n => `<th style="text-align:center">${esc(n)}</th>`).join('')}</tr></thead><tbody>${SEC.perms.map(p => `<tr><td style="padding-left:16px">${esc(p.label)}<div class="mono muted" style="font-size:11px">${esc(p.perm)}</div></td>${Object.keys(ROLE_NAMES).map(r => `<td style="text-align:center"><button class="switch" role="switch" data-perm="${esc(p.perm)}" data-role="${r}" aria-checked="${!!SEC.roles?.[r]?.[p.perm]}" aria-label="${esc(ROLE_NAMES[r] + ': ' + p.label)}" ${r === 'admin' && ['system', 'einstellungen'].includes(p.perm) ? 'disabled' : ''}></button></td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
};
function bindSecurity() {
  $('#view-einstellungen').addEventListener('click', async e => {
    const tb = e.target.closest('[data-totp]'); if (tb) { e.stopPropagation(); return openTotp(STAFF.find(s => s.id === tb.dataset.totp)); }
    const pm = e.target.closest('[data-perm]'); if (!pm) return;
    e.stopPropagation(); permToggle(pm);
  }, true);
}
async function permToggle(pm) {
  {
    const allowed = pm.getAttribute('aria-checked') !== 'true';
    let by; try { by = (await stepUp({title: 'Rechte ändern', text: `${ROLE_NAMES[pm.dataset.role]}: „${permLabel(pm.dataset.perm)}“ ${allowed ? 'erlauben' : 'entziehen'}`, admin: true})).by; } catch { return; }
    try { const m = await invoke('permission_set', {role: pm.dataset.role, perm: pm.dataset.perm, allowed, by: by.name}); SEC.roles = m.roles; } catch (err) { return toast('Nicht geändert', {t2: String(err), type: 'warn'}); }
    pm.setAttribute('aria-checked', allowed); permNav();
    toast('Recht geändert', {t2: `${ROLE_NAMES[pm.dataset.role]} · ${permLabel(pm.dataset.perm)}: ${allowed ? 'erlaubt' : 'nicht erlaubt'}`, type: 'pos', icon: 'shield'});
  }
}

/* ── Rechte an den Einstiegspunkten ── */
const VIEW_PERM = {berichte: 'berichte', anpassen: 'anpassen', einstellungen: 'einstellungen', einkauf: 'einkauf', aktionen: 'preise.aktionen', inventur: 'bestand.buchen'};
function permNav() {
  // Menüpunkte ohne Berechtigung werden ausgeblendet – samt leeren Untermenüs und Bereichen
  const nav = $('#nav'); if (!nav) return;
  $$('.nav-item[data-view]', nav).forEach(n => { const p = VIEW_PERM[n.dataset.view]; n.classList.toggle('nav-off', !!p && !can(p)); n.classList.remove('nav-locked'); });
  $$('.nav-kids', nav).reverse().forEach(k => {
    const any = [...k.children].some(c => (c.matches('[data-view]') || c.matches('.nav-kids')) && !c.classList.contains('nav-off'));
    k.classList.toggle('nav-off', !any); k.previousElementSibling?.classList.toggle('nav-off', !any);
  });
  $$('.nav-sec', nav).forEach(sec => sec.classList.toggle('nav-off', !sec.querySelector('[data-view]:not(.nav-off)')));
}
function installGuards() {
  if (!DESKTOP) return;
  const _go = go;
  go = function (view) {
    const p = VIEW_PERM[view === 'erweiterungen' ? 'anpassen' : view];
    if (p && !can(p) && S.view !== view) {
      if (!S.started) return _go('dashboard');
      return needPerm(p, `${TITLES[view] || view} öffnen`).then(() => _go(view)).catch(() => { if (location.hash.slice(1) !== S.view) history.replaceState(null, '', '#' + S.view); });
    }
    return _go(view);
  };
  openReturnStart = guard('kasse.retoure', openReturnStart, 'Retoure / Storno');
  openReturn = guard('kasse.retoure', openReturn, 'Retoure / Storno');
  openEditor = guard('artikel.bearbeiten', openEditor, 'Artikel bearbeiten');
  openBooking = guard('bestand.buchen', openBooking, 'Bestand buchen');
  openCashBook = guard('kasse.kassenbuch', openCashBook, 'Kassenbuch');
  openClosing = guard('kasse.kassenbuch', openClosing, 'Tagesabschluss');
  openPromo = guard('preise.aktionen', openPromo, 'Preisaktion');
  openPO = guard('einkauf', openPO, 'Bestellung');
  openSupplier = guard('einkauf', openSupplier, 'Lieferant');
  openCustomerEditor = guard('kunden.bearbeiten', openCustomerEditor, 'Kunde bearbeiten');
  openPayment = guard('kasse.verkaufen', openPayment, 'Verkaufen');
  Hooks.on('auth.login', () => {
    SEC.grant = {}; permNav();
    const p = VIEW_PERM[S.view]; if (p && !can(p)) { S.view = null; go('dashboard'); }
  });
}
