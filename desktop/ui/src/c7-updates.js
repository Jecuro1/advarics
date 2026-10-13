
/* ════════════════════════════════════════════════════════════════════
   18 · UPDATE-DIENST — signierte Pakete, Freigabe, Zeitfenster,
   Sicherung vor dem Update, Fortschritt, automatischer Neustart.
   ════════════════════════════════════════════════════════════════════ */
const UPD = {state: 'idle', info: null, error: '', last: null, timer: null};
function updLabel() {
  if (!DESKTOP) return S.update === 'pending' ? 'Update 1.8.0 wartet auf Freigabe' : 'Update 1.8.0 geplant · heute 20:00';
  const ap = CFG['update.freigabe'];
  if (UPD.state === 'available' && ap && ap.version === UPD.info.version) return `Update ${ap.version} freigegeben · ${ap.when === 'abend' ? 'heute 20:00' : 'beim nächsten Start'}`;
  return {available: `Update ${UPD.info?.version} verfügbar`, checking: 'Suche nach Updates …', current: `Aktuell · v${S.appVersion}`, error: 'Update-Suche fehlgeschlagen', idle: `v${S.appVersion}`}[UPD.state];
}
function updWidgetRow() {
  if (!DESKTOP) return `<div class="ops-row">${ic('download', 'i-sm')}<div class="k"><b>${S.update === 'pending' ? 'Update 1.8.0 wartet' : 'Update 1.8.0 geplant'}</b>${S.update === 'pending' ? 'Stable · signiert · Freigabe nötig' : 'Installation heute 20:00'}</div><button class="btn ${S.update === 'pending' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-act="update">${S.update === 'pending' ? 'Prüfen' : 'Details'}</button></div>`;
  const av = UPD.state === 'available';
  return `<div class="ops-row">${ic('download', 'i-sm')}<div class="k"><b>${esc(updLabel())}</b>${av ? 'Signiert · wartet auf Freigabe' : `Installiert: ${esc(S.appVersion)}${UPD.last ? ' · geprüft ' + esc(fmtTs(UPD.last.toISOString()).split(', ').pop()) : ''}`}</div><button class="btn ${av ? 'btn-primary' : 'btn-secondary'} btn-sm" data-act="update">${av ? 'Ansehen' : 'Suchen'}</button></div>`;
}
function renderUpdBits() { renderStatus(); renderUpdSection(); refreshDashboard(['ops.system']); }
async function checkUpdates(manual) {
  if (!DESKTOP || UPD.state === 'checking') return;
  UPD.state = 'checking'; renderUpdBits();
  try {
    const i = await invoke('update_check', {channel: CFG['update.kanal'] || 'stable'});
    UPD.info = i; UPD.last = new Date(); UPD.state = i.available ? 'available' : 'current';
    if (i.available) {
      Hooks.emit('update.available', {version: i.version});
      const ap = CFG['update.freigabe'];
      if (ap && ap.version === i.version) scheduleApproved(ap);
      else if (!manual && can('system')) toast(`Update ${i.version} verfügbar`, {t2: 'Wartet auf Ihre Freigabe', icon: 'download', type: 'accent', dur: 9000, action: {label: 'Ansehen', run: openUpdate}});
      else openUpdate();
    } else if (manual) toast('Kontor ist aktuell', {t2: `Version ${i.current}`, type: 'pos', icon: 'check'});
  } catch (e) {
    UPD.last = new Date();
    if (/valid release JSON|404|Not Found/i.test(String(e))) { UPD.state = 'current'; UPD.info = {available: false, current: S.appVersion}; if (manual) toast('Kontor ist aktuell', {t2: 'Noch keine neuere Version veröffentlicht', type: 'pos', icon: 'check'}); renderUpdBits(); return; }
    UPD.state = 'error'; UPD.error = String(e);
    if (manual) toast('Update-Suche fehlgeschlagen', {t2: UPD.error, type: 'warn', dur: 8000});
  }
  renderUpdBits();
}
/** Die Release-Notes enthalten den ganzen Verlauf („## Neu in x.y.z“) – im Update-Dialog genügt, was seit der installierten Version neu ist */
function updNotesSince(md, cur, next) {
  const parts = String(md || '').split(/^(?=##\s+Neu in\s)/m).filter(p => /^##\s+Neu in\s/.test(p));
  if (!parts.length) return md;
  const v = s => (String(s).match(/\d+(?:\.\d+)*/)?.[0] || '0').split('.').map(Number);
  const cmp = (a, b) => { for (let i = 0; i < 4; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
  const c = v(cur), n = v(next);
  const keep = parts.filter(p => { const x = v(p.match(/^##\s+Neu in\s+(\S+)/)[1]); return cmp(x, c) > 0 && cmp(x, n) <= 0; });
  return (keep.length ? keep : parts.slice(0, 1)).join('\n');
}
function notesHTML(md) {
  if (!md) return '<p class="muted" style="font-size:13px">Keine Hinweise angegeben.</p>';
  let out = /sicherheit/i.test(md) ? `<div class="rule-box" style="margin-bottom:10px">${ic('shield')}<div><b style="color:var(--text)">Sicherheitsupdate</b> – bitte zeitnah freigeben und installieren.</div></div>` : '', list = false;
  md.split(/\r?\n/).forEach(l => {
    const t = l.trim();
    if (/^[-*]\s+/.test(t)) { if (!list) { out += '<ul>'; list = true; } out += `<li>${esc(t.replace(/^[-*]\s+/, '').replace(/\*\*/g, ''))}</li>`; return; }
    if (list) { out += '</ul>'; list = false; }
    if (/^#+\s/.test(t)) out += `<h4>${esc(t.replace(/^#+\s/, ''))}</h4>`;
    else if (t) out += `<p style="font-size:13px;color:var(--text-2);margin:0 0 6px">${esc(t)}</p>`;
  });
  return `<div class="chg">${out}${list ? '</ul>' : ''}</div>`;
}
function openRealUpdate() {
  const i = UPD.info;
  if (UPD.state !== 'available') {
    const el = openLayer(`<div class="modal" style="width:min(480px,100%)" role="dialog" aria-modal="true" aria-label="Updates">
      <div class="m-head"><div class="m-ic" style="color:${UPD.state === 'error' ? 'var(--warn)' : 'var(--pos)'}">${ic(UPD.state === 'error' ? 'alert' : 'check')}</div><div><h2>${UPD.state === 'error' ? 'Update-Suche fehlgeschlagen' : UPD.state === 'checking' ? 'Suche läuft …' : 'Kontor ist aktuell'}</h2><p>Installierte Version ${esc(S.appVersion)}${UPD.last ? ' · zuletzt geprüft ' + esc(fmtTs(UPD.last.toISOString())) : ''}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      ${UPD.state === 'error' ? `<div class="m-body"><div class="note">${ic('info')}<span>${esc(UPD.error)}<br>Ohne Internetverbindung arbeitet Kontor normal weiter – Updates werden später gesucht.</span></div></div>` : ''}
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Schließen</button><button class="btn btn-primary" id="updAgain">${ic('sync', 'i-sm')}Erneut suchen</button></div></div>`);
    $('#updAgain', el).onclick = () => { closeLayer(el); checkUpdates(true); };
    return;
  }
  const el = openLayer(`<div class="modal" style="width:min(620px,100%)" role="dialog" aria-modal="true" aria-label="Update freigeben">
    <div class="m-head"><div class="m-ic">${ic('download')}</div><div style="flex:1"><div class="upd-head"><span class="upd-ver">${esc(i.version)}</span><span class="pill pos">Stable</span><span class="pill">${ic('shield')}signiert</span></div><p>Installiert: ${esc(i.current)}${i.date ? ' · veröffentlicht ' + esc(fmtTs(i.date.replace(' ', 'T').replace(/ \+.*$/, ''))) : ''} · Signatur wird beim Download geprüft</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:16px">
      <div class="upd-notes">${notesHTML(updNotesSince(i.notes, i.current || S.appVersion, i.version))}</div>
      <div class="rule-box" style="background:var(--info-soft);border-color:color-mix(in srgb,var(--info) 22%,transparent)">${ic('info')}<div>Vor der Installation erstellt Kontor <b style="color:var(--text)">automatisch eine Datensicherung</b>. Während der Installation (ca. 1 Minute) wird das Programm beendet und danach neu gestartet. Daten und Einstellungen bleiben erhalten.</div></div>
      <div><div class="field"><span>Wann installieren?</span></div><div class="radio-list" style="margin-top:6px">
        <label class="radio"><input type="radio" name="uw" value="jetzt" checked>Jetzt installieren<small>Programm startet neu</small></label>
        <label class="radio"><input type="radio" name="uw" value="abend">Heute um 20:00<small>nach Ladenschluss, wenn Kontor läuft</small></label>
        <label class="radio"><input type="radio" name="uw" value="start">Beim nächsten Programmstart<small>z. B. morgen früh</small></label></div></div>
    </div>
    <div class="m-foot"><button class="btn btn-ghost" data-close>Später</button><span class="sp"></span><button class="btn btn-primary" id="updGo">${ic('shield', 'i-sm')}Freigeben</button></div></div>`);
  $('#updGo', el).onclick = async () => {
    const when = $('input[name="uw"]:checked', el).value;
    if (when === 'jetzt' && POS.cart.length) return toast('Offener Verkauf', {t2: 'Bitte zuerst den Bon abschließen oder parken', type: 'warn', icon: 'bag'});
    try { await stepUp({title: 'Update freigeben', text: `Kontor ${i.version} installieren.`, rule: 'Updates erfordern eine Freigabe mit PIN oder Sicherheitsschlüssel'}); } catch { return; }
    closeLayer(el);
    Hooks.emit('update.approved', {version: i.version, zeitpunkt: when, freigabe: S.user.name});
    if (when === 'jetzt') return runInstall();
    const ap = {version: i.version, when, by: S.user.name, at: new Date().toISOString()};
    await saveSettings({'update.freigabe': ap}, true);
    scheduleApproved(ap);
    toast(`Update ${i.version} freigegeben`, {t2: when === 'abend' ? 'Installation heute um 20:00' : 'Installation beim nächsten Programmstart', type: 'pos', icon: 'download'});
    renderUpdBits();
  };
}
function scheduleApproved(ap) {
  clearTimeout(UPD.timer);
  if (ap.when === 'start' && new Date(ap.at) < new Date(Date.now() - 60e3)) return runInstall(true);
  if (ap.when === 'abend') {
    const t = new Date(); t.setHours(20, 0, 0, 0);
    if (Date.now() >= t.getTime()) return runInstall(true);
    UPD.timer = setTimeout(() => runInstall(true), t.getTime() - Date.now());
  }
}
async function runInstall(auto) {
  if (auto && POS.cart.length) { UPD.timer = setTimeout(() => runInstall(true), 5 * 60e3); return toast('Update wartet', {t2: 'Offener Verkauf – neuer Versuch in 5 Minuten', icon: 'clock'}); }
  const el = openLayer(`<div class="modal" style="width:min(460px,100%)" role="dialog" aria-modal="true" aria-label="Update wird installiert"><div class="m-body" style="padding:28px 26px">
    <div class="authwait"><div class="ring">${ic('download')}</div><p id="upPhase"><b style="color:var(--text)">Update wird vorbereitet …</b></p></div>
    <div class="pay-prog" style="margin-top:14px"><i id="upBar" style="width:0;background:var(--accent)"></i></div>
    <p class="muted" style="font-size:12px;text-align:center;margin-top:12px">Bitte Kontor nicht schließen. Das Programm startet anschließend automatisch neu.</p></div></div>`, {closeOnScrim: false, esc: false});
  const phase = (t, s) => { $('#upPhase', el).innerHTML = `<b style="color:var(--text)">${esc(t)}</b>${s ? '<br>' + esc(s) : ''}`; };
  let unlisten = null;
  try {
    unlisten = await window.__TAURI__.event.listen('update-progress', ({payload: p}) => {
      if (p.phase === 'backup') phase('Datensicherung …', 'Sicherung vor dem Update');
      if (p.phase === 'download') { const pc = p.total ? Math.min(100, p.done / p.total * 100) : 0; $('#upBar', el).style.width = pc + '%'; phase('Lade Update …', p.total ? `${fmtBytes(p.done)} von ${fmtBytes(p.total)}` : fmtBytes(p.done)); }
      if (p.phase === 'install') { $('#upBar', el).style.width = '100%'; phase('Installiere …', 'Signatur geprüft · Kontor startet gleich neu'); }
    });
    await saveSettings({'update.freigabe': null}, true);
    await invoke('update_install', {user: S.user.name});
  } catch (e) {
    unlisten && unlisten();
    closeLayer(el);
    toast('Update nicht installiert', {t2: String(e), type: 'warn', dur: 10000});
    UPD.state = 'idle'; checkUpdates(false);
  }
}
function renderUpdSection() {
  const box = $('#updBox'); if (!box) return;
  if (!DESKTOP) { box.innerHTML = `<div class="set-row"><div><div class="set-l">Installierte Version</div><div class="set-h">Browser-Vorschau</div></div><div class="set-c"><b class="num">${esc(S.appVersion)}</b></div></div><div class="set-row"><div><div class="set-l">Updates</div><div class="set-h">Nur in der Desktop-App</div></div><div class="set-c"><span class="pill">Vorschau</span></div></div>`; return; }
  const av = UPD.state === 'available', ap = CFG['update.freigabe'];
  box.innerHTML = `<div class="set-row"><div><div class="set-l">Installierte Version</div><div class="set-h">Kontor für Windows</div></div><div class="set-c"><b class="num">${esc(S.appVersion)}</b></div></div>
    <div class="set-row"><div><div class="set-l">${esc(updLabel())}</div><div class="set-h">${UPD.state === 'error' ? esc(UPD.error) : UPD.last ? 'Zuletzt geprüft: ' + esc(fmtTs(UPD.last.toISOString())) : 'Noch nicht geprüft'}${ap && av ? ` · freigegeben von ${esc(ap.by)}` : ''}</div></div><div class="set-c" style="gap:8px">${av ? `<button class="btn btn-primary btn-sm" id="updOpen">${ic('download', 'i-sm')}Ansehen & freigeben</button>` : ''}<button class="btn btn-secondary btn-sm" id="updCheck" ${UPD.state === 'checking' ? 'disabled' : ''}>${ic('sync', 'i-sm')}Jetzt suchen</button></div></div>
    ${field('update.auto', 'Automatisch nach Updates suchen', 'Beim Start und alle 6 Stunden. Installiert wird nie ohne Freigabe.', 'switch')}
    <div class="set-row"><div><div class="set-l">Kanal</div><div class="set-h">Stable: nur geprüfte Versionen · Beta: neue Funktionen früher, für Technik-Begeisterte (enthält auch alle Stable-Versionen)</div></div><div class="set-c"><div class="seg" id="chanSeg2">${[['stable', 'Stable'], ['beta', 'Beta']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${(CFG['update.kanal'] || 'stable') === k}">${l}</button>`).join('')}</div></div></div>`;
  initSeg($('#chanSeg2', box), async b => { await saveSettings({'update.kanal': b.dataset.v}, true); toast(b.dataset.v === 'beta' ? 'Beta-Kanal aktiv' : 'Stable-Kanal aktiv', {t2: 'Suche nach Updates …', icon: 'download'}); UPD.state = 'idle'; checkUpdates(false); });
}
function bindUpdates() {
  $('#view-einstellungen').addEventListener('click', e => { if (e.target.closest('#updCheck')) checkUpdates(true); if (e.target.closest('#updOpen')) openUpdate(); });
  if (!DESKTOP) return;
  setTimeout(() => CFG['update.auto'] !== false || CFG['update.freigabe'] ? checkUpdates(false) : null, 6000);
  setInterval(() => CFG['update.auto'] !== false && checkUpdates(false), 6 * 36e5);
}
