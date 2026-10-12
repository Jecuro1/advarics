
/* ════════════════════════════════════════════════════════════════════
   12 · ANMELDUNG — Sperrbildschirm mit PIN, Windows Hello, FIDO2, SSO
   ════════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════
   13 · SYSTEM — Inspektor, Updates, Backup, RKSV, Mitteilungen
   ════════════════════════════════════════════════════════════════════ */
const evClass = n => n.startsWith('pos.') ? 'pos' : n.startsWith('rksv.') ? 'rksv' : n.startsWith('auth.') ? 'auth' : n.startsWith('webhook.') ? 'webhook' : n.startsWith('rule.') ? 'rule' : '';
const evTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
function evHTML(e) {
  const json = JSON.stringify(e.payload, (k, v) => v === undefined ? undefined : v).replace(/"([^"]+)":/g, '$1: ').replace(/,(?=\w)/g, ', ');
  return `<div class="ev"><span class="t">${evTime(e.t)}</span><div><span class="n ${evClass(e.evt)}">${esc(e.evt)}</span><pre>${esc(json)}</pre></div></div>`;
}
function toggleInspector() {
  if (S.inspector) { S.inspector.remove(); S.inspector = null; return; }
  const el = document.createElement('div'); el.className = 'inspector'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Ereignis-Inspektor');
  el.innerHTML = `<div class="insp-h">${ic('braces', 'i-sm')}<h3>Ereignisse & Hooks</h3><div class="seg" id="inspSeg" style="margin-left:8px"><button data-t="live" aria-pressed="true">Live</button><button data-t="bind" aria-pressed="false">Bindungen</button></div><button class="btn btn-ghost btn-sm btn-icon" id="inspX" style="margin-left:auto" aria-label="Schließen">${ic('x', 'i-sm')}</button></div>
    <div class="insp-list" id="inspList"></div>
    <div class="insp-foot">Hooks laufen lokal. Webhooks erreichen nur Ziele, die Sie freigegeben haben.</div>`;
  document.body.appendChild(el); S.inspector = el;
  let tab = 'live';
  const render = () => {
    $('#inspList', el).innerHTML = tab === 'live'
      ? (Hooks.log.length ? Hooks.log.slice(0, 80).map(evHTML).join('') : `<div class="empty"><div class="empty-icon">${ic('braces')}</div><h3>Noch keine Ereignisse</h3><p>Lege einen Artikel in den Warenkorb – jede Aktion erscheint hier live.</p></div>`)
      : BINDINGS.map(b => `<div class="bind"><span class="tg">${b.kind}</span><div style="min-width:0"><code>${esc(b.evt)}</code><div class="muted" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">→ ${esc(b.target)}</div></div><span class="muted" style="font-size:11px">${esc(b.note)}</span></div>`).join('');
  };
  initSeg($('#inspSeg', el), b => { tab = b.dataset.t; render(); });
  $('#inspX', el).onclick = toggleInspector;
  el._push = e => { if (tab !== 'live') return; const list = $('#inspList', el); if ($('.empty', list)) list.innerHTML = ''; list.insertAdjacentHTML('afterbegin', evHTML(e)); if (list.children.length > 80) list.lastElementChild.remove(); };
  render();
}
Hooks.on('*', (p, e) => { S.inspector && S.inspector._push(e); const c = $('#sbHookCount'); if (c) c.textContent = Hooks.count; });
if (!DESKTOP) Hooks.on('pos.sale.completed', p => setTimeout(() => Hooks.emit(S.online ? 'webhook.delivered' : 'webhook.queued', {ziel: BINDINGS[0].target, beleg: p.beleg, status: S.online ? 200 : 'Warteschlange', dauer: S.online ? '38 ms' : undefined}), 450));
Hooks.on('pos.sale.completed', () => refreshDashboard());
Hooks.on('pos.line.added', p => {
  if (p.warengruppe === 'ski' && p.sku === 'A5001' && !POS.cart.some(l => l.key === 'svc|S04'))
    setTimeout(() => toast('Bindung gleich einstellen?', {t2: 'Hinweis aus Skript „skiservice-hinweis.js“', icon: 'code', type: 'accent', dur: 6000, action: {label: 'Hinzufügen', run: () => addService('S04')}}), 350);
});

function openUpdate() {
  if (DESKTOP) return openRealUpdate();
  const scheduled = S.update !== 'pending';
  let channel = 'stable';
  const el = openLayer(`<div class="modal" style="width:min(640px,100%)" role="dialog" aria-modal="true" aria-label="Update freigeben"><div id="uBody"></div></div>`);
  const box = $('#uBody', el);
  const render = () => {
    const beta = channel === 'beta';
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('download')}</div><div style="flex:1"><div class="upd-head"><span class="upd-ver">${beta ? '1.9.0-beta.2' : '1.8.0'}</span><span class="pill ${beta ? 'warn' : 'pos'}">${beta ? 'Beta' : 'Stable'}</span>${beta ? '' : `<span class="pill info">${ic('shield')}enthält Sicherheitskorrektur</span>`}</div><p>Signiert von Kontor Software · Signatur geprüft (Ed25519) · ${beta ? '204' : '182'} MB · aktuell installiert: ${esc(S.appVersion)}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:18px">
        <div class="seg" id="uChan" style="justify-self:start"><button data-c="stable" aria-pressed="${!beta}">Stable-Kanal</button><button data-c="beta" aria-pressed="${beta}">Beta-Kanal</button></div>
        <div class="chg">
          <div><h4>${ic('sparkle', 'i-xs')}Neu</h4><ul>${(beta ? ['Kasse: Retouren mit Belegsuche per QR-Code', 'KI: Umlagerungsvorschläge über alle Filialen', 'Workflow-Designer: Verzweigungen & Zeitsteuerung'] : ['Kasse: Teilzahlungen mit beliebig vielen Zahlungsarten', 'Dashboard: Widgets „Kundenfrequenz“ und „Tagesziel“', 'KI: Nachbestellvorschläge berücksichtigen Lieferzeiten']).map(x => `<li>${x}</li>`).join('')}</ul></div>
          <div><h4>${ic('check', 'i-xs')}Verbessert & behoben</h4><ul><li>Schnellere Artikelsuche bei mehr als 100.000 Varianten</li><li>Bondrucker: Umlaute bei Vorlage „Minimal“</li></ul></div>
          ${beta ? '' : `<div><h4>${ic('shield', 'i-xs')}Sicherheit</h4><ul><li>Härtung der Sitzungsverwaltung für Kassen-Logins (empfohlen)</li></ul></div>`}
        </div>
        <div class="rule-box" style="background:var(--info-soft);border-color:color-mix(in srgb,var(--info) 22%,transparent)">${ic('info')}<div><b style="color:var(--text)">Auswirkungen:</b> Datenbankmigration ca. 4 Minuten. Kassen verkaufen währenddessen offline weiter und synchronisieren danach automatisch. Kein Eingriff in RKSV-Daten.</div></div>
        <label class="check"><input type="checkbox" id="uBackup" ${S.backupH <= 12 ? 'checked' : ''}><span>Aktuelles Backup vorhanden (${S.backupH ? `vor ${S.backupH} h` : 'gerade eben'}, NAS-01, Integrität geprüft). <span class="muted">Die Verantwortung für Backups liegt beim Betreiber.</span> <button class="btn btn-ghost btn-sm" id="uBackupNow" type="button" style="height:24px;padding:0 6px;margin-left:2px">Jetzt sichern</button></span></label>
        <div><div class="field"><span>Installationsfenster</span></div><div class="radio-list" style="margin-top:6px">
          <label class="radio"><input type="radio" name="win" value="heute" checked>Heute 20:00–21:00<small>nach Ladenschluss</small></label>
          <label class="radio"><input type="radio" name="win" value="so">Sonntag 08:00–09:00<small>Filiale geschlossen</small></label>
          <label class="radio"><input type="radio" name="win" value="manuell">Manuell starten<small>durch Administrator</small></label></div></div>
      </div>
      <div class="prompt-hint" style="padding:0 22px">${ic('info', 'i-xs')}Vorschau des Freigabe-Ablaufs – echte Update-Pakete folgen mit dem nächsten Ausbauschritt.</div>
      <div class="m-foot"><button class="btn btn-ghost" data-close>Später</button><span class="sp"></span><button class="btn btn-secondary" id="uReject">Ablehnen</button><button class="btn btn-primary" id="uApprove">${ic('shield', 'i-sm')}Freigeben</button></div>`;
    initSeg($('#uChan', box), b => { channel = b.dataset.c; render(); });
  };
  box.addEventListener('click', e => {
    if (e.target.closest('#uBackupNow')) { backupNow(); setTimeout(() => { const c = $('#uBackup', box); if (c) c.checked = true; }, reduced() ? 50 : 1700); }
    if (e.target.closest('#uReject')) { closeLayer(el); toast('Update abgelehnt', {t2: 'Version 1.8.0 bleibt sichtbar, bis Sie entscheiden', icon: 'x'}); Hooks.emit('update.rejected', {version: '1.8.0'}); }
    if (e.target.closest('#uApprove')) {
      if (!$('#uBackup', box).checked) { toast('Bitte Backup bestätigen', {t2: 'Vor jeder Installation empfohlen – Ihre Entscheidung', type: 'warn', icon: 'database'}); $('.check', box).classList.add('shake'); return; }
      const win = $('input[name="win"]:checked', box).value, ver = channel === 'beta' ? '1.9.0-beta.2' : '1.8.0';
      stepUp({title: 'Administrator-Freigabe', text: `Update ${ver} zur Installation freigeben.`, rule: 'Systemänderungen erfordern Step-up-Authentifizierung'}).then(() => {
        closeLayer(el); S.update = 'scheduled'; renderStatus(); refreshDashboard(['ops.system']);
        toast(`Update ${ver} freigegeben`, {t2: win === 'manuell' ? 'Start manuell durch Administrator' : `Installation ${win === 'heute' ? 'heute 20:00' : 'Sonntag 08:00'} · Kassen arbeiten offline weiter`, type: 'pos', icon: 'download'});
        Hooks.emit('update.approved', {version: ver, kanal: channel, fenster: win, freigabe: STAFF[1].name});
      }).catch(() => {});
    }
  });
  render();
  if (scheduled) toast('Update ist bereits geplant', {t2: 'Sie können die Planung hier ändern', icon: 'clock'});
}
function backupNow() {
  if (DESKTOP) return realBackup('manuell');
  toast('Backup läuft …', {t2: 'Konsistenter Snapshot · Datenbank & Artikelbilder → NAS-01', icon: 'database', dur: 1700});
  Hooks.emit('backup.started', {ziel: '\\\\NAS-01\\kontor-backup', art: 'manuell'});
  setTimeout(() => { S.backupH = 0; renderStatus(); refreshDashboard(['ops.system']); toast('Backup abgeschlossen', {t2: '2,4 GB · AES-256 verschlüsselt · Integrität geprüft', type: 'pos', icon: 'database'}); Hooks.emit('backup.completed', {groesse: '2,4 GB', verschluesselung: 'AES-256', integritaet: 'ok'}); }, reduced() ? 50 : 1700);
}
function openNotifications(anchor) {
  const items = [
    ['download', 'accent', 'Update 1.8.0 wartet auf Freigabe', 'Stable · enthält Sicherheitskorrektur', 'update'],
    ['wifi-off', 'warn', 'Kasse 2 seit 12 Minuten offline', '3 Belege lokal signiert · Sync folgt automatisch', null],
    ['database', 'pos', 'Nächtliches Backup erfolgreich', `02:00 · NAS-01 · 2,4 GB · verifiziert`, null],
    ['swap', 'info', 'Umlagerung eingetroffen', '6 Positionen aus Kufstein · bitte einbuchen', null],
  ];
  const el = openPopover(anchor, `<div class="pop-h" style="display:flex;justify-content:space-between">Mitteilungen<span>4 neu</span></div>${items.map(([i, t, a, b, act]) => `<div class="notif" ${act ? `data-n="${act}" style="cursor:pointer"` : ''}><span class="reg-ic" style="color:var(--${t})">${ic(i, 'i-sm')}</span><div><div class="t1">${a}</div><div class="t2">${b}</div></div></div>`).join('')}`, {width: 340});
  if (!el) return;
  anchor.classList.remove('has-dot');
  el.addEventListener('click', e => { if (e.target.closest('[data-n="update"]')) { closePopover(); openUpdate(); } });
}
function openAppearance(anchor) {
  const segRow = (lbl, key, opts) => `<div class="pop-row"><span>${lbl}</span><div class="seg" data-pref="${key}">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${prefs[key] === v}">${l}</button>`).join('')}</div></div>`;
  const el = openPopover(anchor, `<div class="pop-h">Darstellung · gilt für ${esc(S.user.name)}</div>
    ${segRow('Modus', 'theme', [['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'System']])}
    <div class="pop-row"><span>Akzent</span><div class="swatch-row">${Object.entries(ACCENTS).map(([k, a]) => `<button class="swb" data-acc="${k}" aria-pressed="${prefs.accent === k}" style="--sw:hsl(${a.h} ${a.s}% 55%)" aria-label="${a.name}" title="${a.name}"></button>`).join('')}<label class="swb custom" title="Eigene Markenfarbe" aria-pressed="${prefs.accent === 'custom'}"><input type="color" id="accCustom" value="#c98a5a" aria-label="Eigene Akzentfarbe"></label></div></div>
    ${segRow('Dichte', 'density', [['compact', 'Kompakt'], ['comfort', 'Komfort'], ['touch', 'Touch']])}
    ${segRow('Ecken', 'radius', [['sharp', 'Präzise'], ['soft', 'Weich']])}
    ${segRow('Bewegung', 'motion', [['full', 'Voll'], ['reduced', 'Reduziert']])}
    <div class="pop-sep"></div>
    <button class="pop-i" id="apSave">${ic('layout')}Als Design-Vorlage speichern</button>
    <button class="pop-i" id="apDs">${ic('palette')}Designsystem öffnen</button>`, {width: 400});
  if (!el) return;
  $$('.seg', el).forEach(s => initSeg(s, b => { prefs[s.dataset.pref] = b.dataset.v; applyPrefs(s.dataset.pref === 'theme'); }));
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-acc]');
    if (a) { prefs.accent = a.dataset.acc; applyPrefs(true); $$('[data-acc],.swb.custom', el).forEach(b => b.setAttribute('aria-pressed', b === a)); }
    if (e.target.closest('#apSave')) { closePopover(); toast('Design-Vorlage gespeichert', {t2: '„Alpenlicht · Eigene“ – zuweisbar an Mandant, Filiale oder Rolle', type: 'pos', icon: 'palette'}); Hooks.emit('config.theme.saved', {vorlage: 'Alpenlicht · Eigene', modus: prefs.theme, akzent: prefs.accent}); }
    if (e.target.closest('#apDs')) { closePopover(); go('designsystem'); }
  });
  $('#accCustom', el).addEventListener('input', e => { prefs.custom = hexToHS(e.target.value); prefs.accent = 'custom'; applyPrefs(); $$('[data-acc]', el).forEach(b => b.setAttribute('aria-pressed', 'false')); $('.swb.custom', el).setAttribute('aria-pressed', 'true'); });
}
function hexToHS(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return {h: Math.round((h * 60 + 360) % 360), s: Math.round(clamp(s, .05, .8) * 100), name: 'Eigene'};
}
function openMeMenu(anchor) {
  const el = openPopover(anchor, `<div class="pop-h">${esc(S.user.name)} · ${esc(S.user.role)}</div>
    <button class="pop-i" data-me="lock">${ic('lock')}Kasse sperren<span class="r kbd">F10</span></button>
    <button class="pop-i" data-me="switch">${ic('users')}Benutzer wechseln</button>
    <button class="pop-i" data-me="auth">${ic('usbkey')}Anmeldemethoden<span class="r muted" style="font-size:11.5px">5 aktiv</span></button>
    <button class="pop-i" data-me="keys">${ic('keyboard')}Tastenkürzel<span class="r kbd">?</span></button>
    <div class="pop-sep"></div><button class="pop-i" data-me="out">${ic('logout')}Abmelden</button>`, {align: 'side', width: 260});
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-me]'); if (!b) return; closePopover();
    ({lock, switch: lock, out: lock, keys: openShortcuts, auth: () => toast('Anmeldemethoden', {t2: 'PIN · Passwort + TOTP · Windows Hello · FIDO2/Passkey · Entra ID (OIDC) – je Rolle konfigurierbar', icon: 'usbkey', dur: 6000})})[b.dataset.me]();
  });
}
function openShortcuts() {
  const rows = [['Befehlspalette', [MOD, 'K']], ['Suche / KI-Frage fokussieren', ['/']], ['Seitenleiste', ['[']], ['Dashboard', ['G', 'D']], ['Kasse', ['G', 'K']], ['Designsystem', ['G', 'S']], ['Tastenkürzel', ['?']],
    ['Kasse: Suche', ['F2']], ['Kasse: Kunde', ['F3']], ['Kasse: Rabatt', ['F4']], ['Kasse: Parken', ['F8']], ['Kasse: Bezahlen', ['F9']], ['Kasse: Sperren', ['F10']], ['Artikel wählen', ['↓', '↵']], ['Position: Menge', ['+', '−']], ['Position entfernen', ['Entf']], ['Zahlart wählen', ['1–8']], ['Widget verschieben (Anpassen)', ['Alt', '←→']]];
  openLayer(`<div class="modal" style="width:min(640px,100%)" role="dialog" aria-modal="true" aria-label="Tastenkürzel">
    <div class="m-head"><div class="m-ic">${ic('keyboard')}</div><div><h2>Tastenkürzel</h2><p>Alles ist per Tastatur erreichbar – Kassentastaturen können die F-Tasten frei belegen.</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;grid-template-columns:1fr 1fr;gap:2px 24px">${rows.map(([l, k]) => `<div class="ops-row"><span class="k">${l}</span><span class="kbds">${k.map(x => `<span class="kbd">${x}</span>`).join('')}</span></div>`).join('')}</div></div>`);
}

/* ════════════════════════════════════════════════════════════════════
   14 · DESIGNSYSTEM-SEITE & PLATZHALTER
   ════════════════════════════════════════════════════════════════════ */
const THEME_PRESETS = [
  {id: 'kupfer', name: 'Kupfer · Nacht', d: 'Standard. Dunkel, warmer Akzent.', theme: 'dark', accent: 'kupfer', density: 'comfort', radius: 'soft'},
  {id: 'papier', name: 'Papier', d: 'Hell und ruhig – Backoffice bei Tageslicht.', theme: 'light', accent: 'kupfer', density: 'comfort', radius: 'soft'},
  {id: 'gletscher', name: 'Gletscher', d: 'Kühl und klar – Sport & Outdoor.', theme: 'dark', accent: 'gletscher', density: 'comfort', radius: 'soft'},
  {id: 'salbei', name: 'Salbei', d: 'Natürlich – Lifestyle & Concept Store.', theme: 'light', accent: 'salbei', density: 'comfort', radius: 'soft'},
  {id: 'graphit', name: 'Graphit', d: 'Monochrom, maximale Zurückhaltung.', theme: 'dark', accent: 'graphit', density: 'comfort', radius: 'sharp'},
  {id: 'amber', name: 'Amber · Touch', d: 'Große Ziele für Kassen-Touchscreens.', theme: 'dark', accent: 'amber', density: 'touch', radius: 'soft'},
  {id: 'kompakt', name: 'Kompakt Hell', d: 'Hohe Dichte für Einkauf & Disposition.', theme: 'light', accent: 'gletscher', density: 'compact', radius: 'sharp'},
];
const TOKENS = [['--frame', 'Rahmen'], ['--panel', 'Paneel'], ['--surface', 'Fläche'], ['--surface-2', 'Fläche 2'], ['--surface-3', 'Fläche 3'], ['--line-3', 'Linie'],
  ['--text', 'Text'], ['--text-2', 'Text sekundär'], ['--text-3', 'Text gedämpft'], ['--accent', 'Akzent'], ['--accent-strong', 'Akzent stark'], ['--accent-soft', 'Akzent weich'],
  ['--pos', 'Positiv'], ['--warn', 'Warnung'], ['--neg', 'Negativ'], ['--info', 'Info'], ['--chart-muted', 'Diagramm neutral'], ['--paper', 'Bonpapier']];
function presetPreview(p) {
  const dark = p.theme === 'dark', a = ACCENTS[p.accent], acc = `hsl(${a.h} ${a.s}% ${dark ? 61 : 41}%)`;
  const fr = dark ? '#08080A' : '#E8E6E1', pa = dark ? '#141417' : '#FFFFFF', ln = dark ? '#232328' : '#EFEDE9', r = p.radius === 'sharp' ? 3 : 6;
  return `<div class="pv" style="background:${fr}"><i style="background:${ln};border-radius:${r}px"></i><div style="display:grid;grid-template-rows:14px 1fr 16px;gap:6px;background:${pa};border-radius:${r + 2}px;padding:8px"><i style="background:${ln};width:60%;border-radius:${r}px"></i><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px"><i style="background:${ln};border-radius:${r}px"></i><i style="background:${ln};border-radius:${r}px"></i><i style="background:${ln};border-radius:${r}px"></i></div><i style="background:${acc};width:42%;justify-self:end;border-radius:${r}px"></i></div></div>`;
}
function toHex(c) {
  const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c;
  const [r, g, b, a] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const hx = '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  return a != null && a < 1 ? `${hx} · ${Math.round(a * 100)} %` : hx;
}
function fillSwatches() {
  const probe = document.createElement('div'); document.body.appendChild(probe);
  $$('#swatches [data-tok]').forEach(s => { probe.style.background = `var(${s.dataset.tok})`; $('.t2', s).textContent = `${s.dataset.tok} · ${toHex(getComputedStyle(probe).backgroundColor)}`; });
  probe.remove();
  const tj = $('#tokJson');
  if (tj) { const cs = getComputedStyle(document.documentElement); tj.textContent = JSON.stringify({schema: 'kontor.theme/v1', name: 'Alpenlicht · Eigene', ebene: 'benutzer', basis: prefs.theme === 'system' ? 'system' : resolvedTheme(), akzent: {farbton: +cs.getPropertyValue('--ah'), saettigung: cs.getPropertyValue('--as').trim()}, dichte: prefs.density, ecken: prefs.radius, bewegung: prefs.motion, ueberschreibt: {'--r-lg': cs.getPropertyValue('--r-lg').trim(), '--ctl-h': cs.getPropertyValue('--ctl-h').trim()}}, null, 2); }
}
function renderDesign() {
  const v = $('#view-designsystem');
  const btns = `<button class="btn btn-primary">Primär</button><button class="btn btn-secondary">Sekundär</button><button class="btn btn-ghost">Ghost</button><button class="btn btn-danger">Löschen</button><button class="btn btn-secondary" disabled>Deaktiviert</button><button class="btn btn-secondary btn-icon" aria-label="Icon-Button">${ic('plus')}</button>`;
  v.innerHTML = `<div class="ds">
    <div class="eyebrow">Kontor UI · Designsystem 0.2</div>
    <h2 class="h-title" style="font-size:34px;margin-top:8px;max-width:22ch">Ein System für Kasse, Backoffice und Erweiterungen</h2>
    <p style="color:var(--text-2);font-size:15px;max-width:70ch;margin-top:12px;line-height:1.6">Jede Farbe, jeder Abstand, jeder Radius und jede Bewegung ist ein Token. Kund:innen überschreiben Tokens auf mehreren Ebenen – ohne eine Zeile CSS. Erweiterungen bauen mit denselben Komponenten und sehen dadurch automatisch nativ aus.</p>
    <div class="layers">${['Kontor-Basis', 'Design-Vorlage', 'Mandant', 'Filiale', 'Rolle / Benutzer'].map((l, i) => `<span>${l}</span>${i < 4 ? ic('chevron-right') : ''}`).join('')}</div>

    <section class="ds-sec"><h2>Prinzipien</h2><div class="ds-grid ds-cols-3">
      ${[['target', 'Ruhig, präzise, schnell', 'Der Akzent markiert genau eine Hauptaktion pro Ansicht. Alles andere bleibt neutral – Inhalte und Zahlen sind laut, die Oberfläche nicht.'],
         ['keyboard', 'Tastatur zuerst, Touch gleichwertig', 'Jede Aktion hat ein Kürzel und einen Befehl in ⌘K. In der Touch-Dichte misst jedes Ziel mindestens 44 px.'],
         ['server', 'Betrieb sichtbar, nichts verdeckt', 'Server, Sync, RKSV-Signatur, Backup und Updates sind immer im Blick – die Daten und Entscheidungen gehören dem Kunden.']]
        .map(([i, t, d]) => `<div class="card princ"><span class="reg-ic">${ic(i, 'i-sm')}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div></section>

    <section class="ds-sec"><h2>Design-Vorlagen</h2><p>Mitgelieferte Vorlagen als Ausgangspunkt. Eine Vorlage ist nur ein Satz Token-Werte – speicher-, versionier- und zuweisbar.</p>
      <div class="ds-grid ds-cols-4">${THEME_PRESETS.map(p => `<button class="card preset" data-preset="${p.id}" aria-pressed="${prefs.theme === p.theme && prefs.accent === p.accent && prefs.density === p.density}">${presetPreview(p)}<div class="meta"><div class="t1">${p.name}</div><div class="t2">${p.d}</div></div></button>`).join('')}
        <button class="card preset" data-preset="_own"><div class="pv" style="display:grid;place-items:center;background:var(--surface-2);color:var(--text-3)">${ic('plus', 'i-lg')}</div><div class="meta"><div class="t1">Eigene Vorlage</div><div class="t2">Markenfarbe, Logo, Bonlayout</div></div></button></div></section>

    <section class="ds-sec"><h2>Farb-Tokens <span class="pill" id="modePill">${resolvedTheme() === 'dark' ? 'Dunkel' : 'Hell'} · live</span></h2><p>Semantische Namen statt Farbwerten. Hell und Dunkel sind eigenständig abgestimmte Stufen, kein invertierter Filter. Der Akzent wird aus Farbton und Sättigung je Modus berechnet – so bleibt jede Markenfarbe lesbar.</p>
      <div class="ds-grid ds-cols-6" id="swatches">${TOKENS.map(([t, n]) => `<div class="card sw-card" data-tok="${t}"><div class="sw" style="--v:var(${t})"></div><div class="meta"><div class="t1">${n}</div><div class="t2">${t}</div></div></div>`).join('')}</div></section>

    <section class="ds-sec"><h2>Typografie</h2><p>Eine Sans für alles, inkl. Kennzahlen. Systemschrift als Rückfall, in der Installation lokal ausgeliefert (keine Web-Fonts aus dem Internet).</p>
      <div class="card" style="padding:4px 20px;margin-top:16px">
        ${[['Kennzahl · 52/620', `<span style="font-family:var(--font-display);font-size:52px;font-weight:620;letter-spacing:-.04em;line-height:1">€ 11.482</span>`], ['Display · 34/620', '<span class="h-title" style="font-size:34px">Guten Tag, Lena</span>'], ['Titel · 26/620', '<span class="h-title">Kasse 1</span>'], ['Überschrift · 17/620', '<span style="font-size:17px;font-weight:620;letter-spacing:-.015em">Bestandswarnungen</span>'], ['Text · 14/400', '<span>Belege werden lokal signiert und automatisch synchronisiert.</span>'], ['Klein · 12.5/500', '<span style="font-size:12.5px;color:var(--text-2);font-weight:500">vs. € 10.215 Vorwoche bis 15:40</span>'], ['Mono · 11.5', '<span class="mono" style="font-size:11.5px">pos.sale.completed · 9012000010003</span>']]
          .map(([k, s]) => `<div class="type-row"><span class="k">${k}</span>${s}</div>`).join('')}</div></section>

    <section class="ds-sec"><h2>Abstände & Radien</h2><p>4-px-Raster. Radien wachsen mit der Größe des Elements; die Vorlage „Präzise“ halbiert sie.</p>
      <div class="card" style="margin-top:16px"><div class="space-viz">${[4, 8, 12, 16, 20, 24, 32, 40, 48].map(s => `<div><i style="width:${s}px;height:${s}px"></i>${s}</div>`).join('')}<span style="width:1px;align-self:stretch;background:var(--line);margin:0 8px"></span>${['xs', 'sm', 'md', 'lg', 'xl'].map(r => `<div><i style="width:44px;height:44px;border-radius:var(--r-${r})"></i>r-${r}</div>`).join('')}</div></div></section>

    <section class="ds-sec"><h2>Komponenten</h2><p>Lebende Beispiele – dieselben Bausteine nutzen Kasse, Dashboard und Erweiterungen.</p>
      <div class="card" style="margin-top:16px">
        <div class="comp-row"><span class="lbl">Buttons</span>${btns}</div>
        <div class="comp-row"><span class="lbl">Größen</span><button class="btn btn-secondary btn-sm">Klein</button><button class="btn btn-secondary">Standard</button><button class="btn btn-secondary btn-lg">Groß</button><button class="btn btn-primary btn-lg">Bezahlen<span class="kbd">F9</span></button></div>
        <div class="comp-row"><span class="lbl">Eingaben</span><input class="input" placeholder="Textfeld" style="width:200px"><div class="seg" id="dsSeg"><button aria-pressed="true">Heute</button><button aria-pressed="false">Woche</button><button aria-pressed="false">Monat</button></div><button class="switch" role="switch" aria-checked="true" id="dsSwitch" aria-label="Schalter"></button><button class="chip">Filter-Chip</button></div>
        <div class="comp-row"><span class="lbl">Status</span><span class="pill pos">${ic('check')}Online</span><span class="pill warn">${ic('alert')}Offline</span><span class="pill neg">${ic('alert')}Überfällig</span><span class="pill info">${ic('info')}Info</span><span class="pill accent">${ic('sparkle')}KI</span><span class="pill">Neutral</span><span class="kbds"><span class="kbd">${MOD}</span><span class="kbd">K</span></span></div>
        <div class="comp-row"><span class="lbl">Identität</span>${STAFF.map(s => `<span class="avatar lg" style="--h:${s.hue}">${s.initials}</span>`).join('')}<span class="delta up">${ic('up')}+12,4 %</span><span class="delta down">${ic('down')}−2,1 %</span><div style="width:160px"><div class="meter"><i style="width:72%"></i></div></div></div>
        <div class="comp-row"><span class="lbl">Rückmeldung</span><button class="btn btn-secondary" data-demo="toast">Toast zeigen</button><button class="btn btn-secondary" data-demo="modal">Freigabe-Dialog</button><button class="btn btn-secondary" data-tip="Tooltips erklären, ohne zu stören">Tooltip</button><button class="btn btn-secondary" data-demo="palette">Befehlspalette</button></div>
      </div></section>

    <section class="ds-sec"><h2>Bewegung</h2><p>Kurz, gerichtet, unterbrechbar. Bewegung erklärt Zustandswechsel – sie dekoriert nicht. „Reduziert“ schaltet sie systemweit ab.</p>
      <div class="card motion-demo" style="margin-top:16px">${[['Standard', '--ease-out · 320 ms', 'var(--ease-out)', 320], ['Federnd', '--ease-spring · 480 ms', 'var(--ease-spring)', 480], ['Übergang', '--ease-io · 560 ms', 'var(--ease-io)', 560]].map(([n, k, e, d]) => `<div class="md"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:13px">${n}</b><span class="k">${k}</span></div><button class="trk" data-ease="${e}" data-dur="${d}" aria-label="${n} abspielen" style="display:block;width:100%"><span class="ball"></span></button></div>`).join('')}</div></section>

    <section class="ds-sec"><h2>Vorlage als Konfiguration</h2><p>Die aktuelle Darstellung als JSON – so wird sie gespeichert, verteilt und per API gesetzt.</p><pre class="code" id="tokJson" style="margin-top:16px"></pre></section>
  </div>`;
  initSeg($('#dsSeg', v)); fillSwatches();
}
function bindDesign() {
  $('#view-designsystem').addEventListener('click', e => {
    const p = e.target.closest('[data-preset]');
    if (p) {
      if (p.dataset.preset === '_own') return openAppearance($('#appearBtn'));
      const t = THEME_PRESETS.find(x => x.id === p.dataset.preset);
      Object.assign(prefs, {theme: t.theme, accent: t.accent, density: t.density, radius: t.radius}); applyPrefs(true);
      $$('[data-preset]').forEach(b => b.setAttribute('aria-pressed', b === p)); $('#modePill').textContent = `${resolvedTheme() === 'dark' ? 'Dunkel' : 'Hell'} · live`;
      toast(`Vorlage „${t.name}“ angewendet`, {t2: 'Gilt für Ihren Benutzer · zurück über Darstellung', icon: 'palette'}); return;
    }
    const sw = e.target.closest('#dsSwitch'); if (sw) { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); return; }
    const trk = e.target.closest('[data-ease]');
    if (trk) { const ball = $('.ball', trk), dist = trk.clientWidth - 38; ball.animate([{transform: 'translateX(0)'}, {transform: `translateX(${dist}px)`}, {transform: `translateX(${dist}px)`, offset: .75}, {transform: 'translateX(0)'}], {duration: +trk.dataset.dur * 2.6, easing: 'linear', composite: 'replace'}); ball.animate([{transform: 'translateX(0)'}, {transform: `translateX(${dist}px)`}], {duration: +trk.dataset.dur, easing: getComputedStyle(document.documentElement).getPropertyValue(trk.dataset.ease.slice(4, -1)).trim() || 'ease-out', fill: 'forwards'}).onfinish = function () { this.cancel(); }; return; }
    const d = e.target.closest('[data-demo]');
    if (d) ({toast: () => toast('So sieht eine Rückmeldung aus', {t2: 'Mit Aktion, Fortschritt und Pause bei Hover', type: 'pos', icon: 'check', action: {label: 'Rückgängig', run: () => {}}}), modal: () => stepUp({title: 'Freigabe erforderlich', text: 'Beispiel für Step-up-Authentifizierung.'}).catch(() => {}), palette: () => openPalette()})[d.dataset.demo]();
  });
}
const PH = {
  artikel: {icon: 'tag', t: 'Artikelstamm', d: 'Artikel mit Varianten-Matrix, Bildern, Preisen je Filiale und beliebig vielen benutzerdefinierten Feldern.', li: ['Größen-/Farbmatrix mit Bestand je Filiale – dieselbe Darstellung wie an der Kasse', 'Benutzerdefinierte Felder mit Datentyp, Validierung und Rechten', 'Artikeltexte und Merkmale per lokaler KI vorschlagen'], a: [['Varianten an der Kasse ansehen', 'kasse']]},
  bestand: {icon: 'boxes', t: 'Bestand & Lager', d: 'Bestände je Filiale und Variante, Umlagerungen, Inventur und Reichweiten mit Prognose.', li: ['Bestandsmatrix mit Heatmap je Filiale', 'Umlagerungs- und Nachbestellvorschläge mit Begründung', 'Mobile Inventur mit Scanner-App'], a: [['Bestandswarnungen im Dashboard', 'dashboard']]},
  einkauf: {icon: 'truck', t: 'Einkauf & Disposition', d: 'Vororder, Nachorder und Lieferanten – mit Saisonplanung für Mode und Sport.', li: ['Saison- und Limitplanung', 'EDI/Lieferanten-Schnittstellen über die API', 'Wareneingang per Scan'], a: []},
  kunden: {icon: 'users', t: 'Kunden & Bindung', d: 'Kundenkonten mit Kaufhistorie, Bonusprogramm, Einwilligungen und eigenen Feldern.', li: ['DSGVO-Einwilligungen und Auskunft auf Knopfdruck', 'Bonusstufen und Vereinskonditionen als Regeln', 'Eigene Felder wie Schuhgröße oder Skilänge – auch an der Kasse sichtbar'], a: [['Kunden an der Kasse zuordnen', 'kasse']]},
  berichte: {icon: 'chart', t: 'Berichte', d: 'Auswertungen als Tabellen und Diagramme – jede Auswertung lässt sich als Dashboard-Widget anheften.', li: ['Frei kombinierbare Kennzahlen und Dimensionen', 'Fragen in natürlicher Sprache an die lokale KI', 'Export, Abo per E-Mail, später DATEV'], a: [['KI-Frage im Dashboard stellen', 'dashboard']]},
  erweiterungen: {icon: 'puzzle', t: 'Erweiterungen', d: '4 Erweiterungen aktiv. Erweiterungen bringen eigene Entitäten, Widgets, Kassenschritte, Hooks und API-Endpunkte mit.', li: ['Werkstatt & Service 1.2 – eigene Entität „Reparaturauftrag“', 'Verleih Pro 2.0 – Partner-Erweiterung', 'Frequenzzähler · Skiservice-Hinweis (Skript)'], a: [['Ereignis-Inspektor öffnen', 'inspector']]},
  _einstellungen: {icon: 'sliders', t: 'Einstellungen', d: 'Betrieb in Ihrer Hand: Updates freigeben, Backups einrichten, Anmeldemethoden und Rechte festlegen.', li: ['Updates: Stable/Beta-Kanal, Freigabe und Zeitfenster', 'Backups: Ziele, Zeitplan, Verschlüsselung, Integritätsprüfung', 'Anmeldung: PIN, Passwort + MFA, Windows Hello, FIDO2, Entra ID, AD, OIDC, SAML'], a: [['Update prüfen', 'update'], ['Backup erstellen', 'backup']]},
};
function renderPlaceholder(view) {
  const p = PH[view];
  $('#view-ph').innerHTML = `<div class="ph"><div class="empty"><div class="empty-icon">${ic(p.icon, 'i-lg')}</div><span class="pill accent">Nächste Iteration</span><h3>${p.t}</h3><p>${p.d}</p><ul>${p.li.map(x => `<li>${ic('check')}<span>${x}</span></li>`).join('')}</ul>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:6px">${p.a.map(([l, k], i) => `<button class="btn ${i ? 'btn-secondary' : 'btn-primary'}" data-ph="${k}">${l}</button>`).join('')}<button class="btn btn-ghost" data-ph="palette">${ic('command', 'i-sm')}Befehlspalette<span class="kbd">${MOD} K</span></button></div></div></div>`;
}
function bindPlaceholder() {
  $('#view-ph').addEventListener('click', e => {
    const b = e.target.closest('[data-ph]'); if (!b) return;
    ({kasse: () => go('kasse'), dashboard: () => go('dashboard'), inspector: () => { if (!S.inspector) toggleInspector(); }, update: openUpdate, backup: backupNow, palette: () => openPalette()})[b.dataset.ph]();
  });
}

/* ════════════════════════════════════════════════════════════════════
   15 · TASTATUR & START
   ════════════════════════════════════════════════════════════════════ */
let gChord = 0;
function toggleFullscreen() {
  invoke('set_fullscreen', {on: !S.fullscreen}).then(on => { S.fullscreen = on; toast(on ? 'Vollbild aktiv' : 'Vollbild beendet', {t2: on ? 'Beenden mit F11' : '', icon: 'layout'}); }).catch(e => toast('Vollbild nicht verfügbar', {t2: String(e), type: 'warn'}));
}
// Desktop-App: Browser-Verhalten abschalten (Neu laden, Drucken-Dialog, Kontextmenü, Zoom)
if (DESKTOP) {
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && ['+', '=', '-', '0'].includes(k)) { e.preventDefault(); e.stopPropagation(); return stepZoom(k === '0' ? 0 : k === '-' ? -1 : 1); }
    if (k === 'f5' || (mod && ['r', 'p', 'f', 'g', 'j', 'u'].includes(k))) e.preventDefault();
    if (k === 'f11') { e.preventDefault(); toggleFullscreen(); }
  }, true);
  document.addEventListener('contextmenu', e => { if (!isTyping(e.target)) e.preventDefault(); });
  document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, {passive: false});
}
document.addEventListener('keydown', e => {
  const k = e.key, typing = isTyping(e.target);
  if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'k' && !S.locked) { e.preventDefault(); if (S.paletteOpen) { const t = topLayer(); t && closeLayer(t.el); } else openPalette(); return; }
  if (S.locked && !topLayer()?.el.classList.contains('over-lock')) { S.lockKey && S.lockKey(e); return; }
  if (layers.length) {
    const t = topLayer();
    if (k === 'Escape') { e.preventDefault(); if (t.escClose) closeLayer(t.el); }
    else if (k === 'Tab') trapFocus(e);
    else if (!e.defaultPrevented && e.target.isConnected && !t.el.contains(e.target)) { const fwd = new KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true}); t.el.dispatchEvent(fwd); if (fwd.defaultPrevented) e.preventDefault(); }
    return;
  }
  if (k === 'Escape' && pop) { closePopover(); return; }
  if (k === 'Escape' && Dash.editing && S.view === 'dashboard') { setEditing(false); return; }
  if (S.view === 'kasse' && posKey(e, typing)) return;
  if (typing) { if (k === 'Escape') e.target.blur(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (k === '/') { e.preventDefault(); const f = S.view === 'kasse' ? $('#posSearch') : S.view === 'dashboard' ? $('#askInput') : null; f ? f.focus() : openPalette(); return; }
  if (k === '?') { openShortcuts(); return; }
  if (k === '[') { toggleSidebar(); return; }
  if (Date.now() - gChord < 900) { const v = {d: 'dashboard', k: 'kasse', a: 'artikel', b: 'bestand', s: 'designsystem'}[k.toLowerCase()]; gChord = 0; if (v) { go(v); return; } }
  if (k.toLowerCase() === 'g') gChord = Date.now();
});

function bindShell() {
  $('#navQ').addEventListener('input', e => navSearch(e.target.value));
  $('#navQ').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; navSearch(''); } else if (e.key === 'Enter') { const f = $('#nav .nav-hit'); if (f) { go(f.dataset.view); e.target.value = ''; navSearch(''); } } });
  $('#nav').addEventListener('click', e => {
    const g = e.target.closest('[data-grp]'); if (g) return navGroupToggle(g);
    const pa = e.target.closest('[data-par]'); if (pa) return navToggle(pa);
    const b = e.target.closest('[data-view]'); if (b) { const was = b.classList.contains('nav-hit'); go(b.dataset.view); if (was) { $('#navQ').value = ''; navSearch(''); } }
  });
  $('#paletteBtn').onclick = () => openPalette();
  $('#aiBtn').onclick = () => openPalette('? ');
  $('#themeBtn').onclick = toggleTheme;
  $('#appearBtn').onclick = e => openAppearance(e.currentTarget);
  $('#notifBtn').onclick = e => openNotifications(e.currentTarget);
  $('#collapseBtn').onclick = toggleSidebar;
  $('#menuBtn').onclick = toggleSidebar;
  $('#meBtn').onclick = e => openMeMenu(e.currentTarget);
  $('#storeSwitch').onclick = e => openStoreMenu(e.currentTarget, 'left');
  $('#tbLeft').addEventListener('click', e => { const p = e.target.closest('[data-park]'); p && resume(p.dataset.park); });
  $('#statusbar').addEventListener('click', e => {
    const id = e.target.closest('[id]')?.id;
    ({sbConn: () => setOnline(!S.online), sbVerbund: () => go('filialen'), sbBackup: () => DESKTOP ? (go('einstellungen'), setTimeout(() => $('#sec-sicherung')?.scrollIntoView({block: 'start'}), 120)) : backupNow(), sbUpdate: openUpdate, sbHooks: toggleInspector})[id]?.();
  });
  $('#views').addEventListener('mousedown', e => { if (matchMedia('(max-width: 900px)').matches && !e.target.closest('.sidebar')) $('#app').classList.remove('sb-open'); });
  addEventListener('hashchange', () => go(location.hash.slice(1)));
  setInterval(() => { const c = $('#sbClock'); if (c) c.textContent = clock(); const l = $('#lockTime'); if (l) l.textContent = clock(); }, 1000);
}

async function init() {
  if (window.__KONTOR_DISPLAY__) return runDisplay();   // zweites Fenster: nur Kundendisplay
  applyPrefs();
  await loadSettings();
  await loadCatalog();
  await loadCustomers();
  await loadUsers();
  if (DESKTOP) { await refreshRksv(); await loadSuppliers(); await loadPromos(); setInterval(applyPromos, 30 * 6e4); }
  if (DESKTOP) { await Promise.all([loadCustom(), loadAutomation(), loadSecurity(), loadAuth(), loadExtensions(), loadVerbund()]); installGuards(); }
  extendPresets(); registerAiPins(); renderNavVerbund();
  if (DESKTOP) { await refreshInfo(); Hooks.on('*', (p, e) => { if (!e.evt.startsWith('config.settings')) invoke('audit_append', {event: e.evt, payload: e.payload ?? {}}).catch(() => {}); }); }
  $('#palKbd').innerHTML = `<span class="kbd">${MOD}</span><span class="kbd">K</span>`;
  renderNav(); permNav(); renderMe(); renderStore(); renderStatus();
  bindShell(); bindDashboard(); bindPOS(); bindDesign(); bindPlaceholder(); bindSettings(); bindCatalog(); bindUpdates(); bindCustomers(); bindPurchasing(); bindReports(); bindExtraSettings(); bindStockViews(); bindP5(); bindCustom(); bindAutomation(); bindSecurity(); bindAiFibu(); bindPages(); bindImportDisplay(); bindVerbund(); bindAuth(); bindExtensions(); bindMore(); bindDocs(); bindEinkauf2(); bindVerkauf2(); bindMarketing(); bindArtikel(); bindVerkauf3(); bindKundenService(); bindArtikel2();
  go(location.hash.slice(1) || 'dashboard');
  if (DESKTOP) lock();   // Anmeldung mit PIN beim Start
  if (DESKTOP) { loadPurchasing().then(() => navBadge('wareneingang', EK.pos.filter(p => ['bestellt', 'teilgeliefert'].includes(p.status)).length)).catch(() => {}); if (CFG['display.auto']) setTimeout(() => toggleDisplay(true), 1500); }
  if (DESKTOP) { Hooks.emit('desktop.ready', {version: S.appVersion, datenbank: S.info?.db_path}); setTimeout(autoBackupCheck, 4000); setInterval(autoBackupCheck, 36e5); }
  Hooks.emit('system.ready', {version: S.appVersion, kanal: 'stable', server: 'KONTOR-SRV01', modus: DESKTOP ? 'desktop' : 'vorschau'});
}
init();
})();
