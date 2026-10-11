
/* ════════════════════════════════════════════════════════════════════
   16 · EINSTELLUNGEN — gespeichert in der lokalen Datenbank (Desktop)
   bzw. im Browser-Speicher (Vorschau). Wirken sofort.
   ════════════════════════════════════════════════════════════════════ */
const DEFAULTS = {
  'firma.name': 'Alpenlicht Sport GmbH', 'firma.marke': 'Alpenlicht', 'firma.zusatz': 'Sport & Mode',
  'firma.adresse': 'Maria-Theresien-Str. 18, 6020 Innsbruck', 'firma.uid': 'ATU00000000', 'firma.telefon': '0512 000000',
  'kasse.id': 'INN-K01', 'kasse.name': 'Kasse 1', 'kasse.freigabe': true, 'kasse.rabattGrenze': 20,
  'kasse.vereinsregel': true, 'kasse.retoureGrenze': 100, 'ziel.tag': 2500, 'kasse.pflichtfelder': true, 'kasse.bonFuss': 'Danke für Ihren Einkauf! Umtausch innerhalb von 30 Tagen mit Beleg.',
  'anzeige.zoom': 1, 'backup.dir': '', 'backup.auto': true, 'backup.keep': 14, 'update.kanal': 'stable', 'update.auto': true, 'update.freigabe': null,
  'drucker.art': 'aus', 'drucker.adresse': '', 'drucker.name': '', 'drucker.breite': 48, 'drucker.auto': false, 'drucker.lade': false, 'gutschein.jahre': 3,
};
const CFG = {...DEFAULTS};
async function loadSettings() {
  try { Object.assign(CFG, DESKTOP ? await invoke('settings_get') : persist.get('settings', {})); } catch (e) { console.error(e); }
  applySettings();
}
async function saveSettings(values, quiet) {
  Object.assign(CFG, values);
  try {
    if (DESKTOP) await invoke('settings_set', {values});
    else { const cur = persist.get('settings', {}); persist.set('settings', Object.assign(cur, values)); }
    if (!quiet) toast('Gespeichert', {t2: DESKTOP ? 'In der lokalen Datenbank' : 'Im Browser (Vorschau)', type: 'pos', icon: 'check', dur: 1800});
  } catch (e) { toast('Speichern fehlgeschlagen', {t2: String(e), type: 'warn'}); }
  applySettings();
}
function applySettings() {
  POS.flow.clubRule = !!CFG['kasse.vereinsregel'];
  POS.flow.prompts = !!CFG['kasse.pflichtfelder'];
  POS.flow.approval = !!CFG['kasse.freigabe'];
  POS.flow.approvalPct = clamp(+CFG['kasse.rabattGrenze'] || 20, 0, 100);
  const t = $('.brand-tenant'); if (t) t.textContent = CFG['firma.name'];
  applyZoom(+CFG['anzeige.zoom'] || 1);
  if (S.view) renderTopbar();
}
function applyZoom(f) {
  f = clamp(Math.round(f * 100) / 100, .7, 2);
  if (DESKTOP) invoke('set_zoom', {factor: f}).catch(() => {});
  else { document.documentElement.style.zoom = f === 1 ? '' : f; document.documentElement.style.setProperty('--zoom', f); }
}
function stepZoom(dir) {
  const steps = [.8, .9, 1, 1.1, 1.25, 1.4, 1.5, 1.75];
  const cur = +CFG['anzeige.zoom'] || 1, i = steps.findIndex(s => s >= cur - .001);
  const next = dir === 0 ? 1 : steps[clamp((i < 0 ? 2 : i) + dir, 0, steps.length - 1)];
  saveSettings({'anzeige.zoom': next}, true); toast(`Anzeigegröße ${Math.round(next * 100)} %`, {icon: 'eye', dur: 1400});
  if (S.view === 'einstellungen') $$('#zoomSeg button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === next));
}

/* ── Systeminfo & Datensicherung ── */
async function refreshInfo() {
  if (!DESKTOP) return null;
  try {
    const i = await invoke('app_info');
    S.info = i; S.appVersion = i.version;
    S.backupH = i.last_backup ? Math.max(0, Math.floor((Date.now() - new Date(i.last_backup)) / 36e5)) : Infinity;
    renderStatus(); return i;
  } catch (e) { console.error(e); return null; }
}
const backupLabel = () => S.backupH === Infinity ? 'Noch keine Sicherung' : S.backupH ? `Backup vor ${S.backupH} h` : 'Backup gerade eben';
const fmtBytes = b => b >= 1048576 ? `${num(b / 1048576, 1)} MB` : `${num(Math.max(1, Math.round(b / 1024)))} KB`;
const fmtTs = ts => { const d = new Date(ts); return isNaN(d) ? ts : d.toLocaleString('de-AT', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}); };
async function realBackup(kind = 'manuell', quiet) {
  if (!quiet) toast('Sicherung läuft …', {t2: 'Konsistenter Stand der Datenbank', icon: 'database', dur: 1500});
  try {
    const e = await invoke('backup_create', {kind});
    await refreshInfo(); refreshDashboard(['ops.system']);
    if (S.view === 'einstellungen') renderBackups();
    if (!quiet || kind !== 'automatisch') toast('Sicherung erstellt', {t2: `${e.file} · ${fmtBytes(e.manifest.bytes)} · geprüft`, type: 'pos', icon: 'database'});
    return e;
  } catch (e) { toast('Sicherung fehlgeschlagen', {t2: String(e), type: 'warn', icon: 'database', dur: 7000}); await refreshInfo(); return null; }
}
async function autoBackupCheck() {
  if (!DESKTOP || !CFG['backup.auto']) return;
  if (S.backupH === Infinity || S.backupH >= 24) { const e = await realBackup('automatisch', true); if (e) toast('Automatische Sicherung erstellt', {t2: e.file, icon: 'database', type: 'pos'}); }
}

/* ── Ansicht ── */
const SET_SECTIONS = [['allgemein', 'Firma & Filiale', 'store'], ['kasse', 'Kasse', 'register'], ['benutzer', 'Benutzer', 'users'], ['drucker', 'Drucker & Lade', 'printer'], ['rksv', 'RKSV', 'shield'], ['anzeige', 'Darstellung', 'palette'], ['sicherung', 'Datensicherung', 'database'], ['updates', 'Updates', 'download'], ['system', 'System & Protokoll', 'server']];
function field(key, label, help, type = 'text', extra = '') {
  const v = CFG[key];
  let ctl;
  if (type === 'switch') ctl = `<button class="switch" role="switch" data-key="${key}" aria-checked="${!!v}" aria-label="${esc(label)}"></button>`;
  else if (type === 'textarea') ctl = `<textarea class="input" data-key="${key}" rows="2" style="height:auto;padding:9px 12px;resize:vertical">${esc(v)}</textarea>`;
  else ctl = `<input class="input" data-key="${key}" type="${type}" value="${esc(v)}" ${extra}>`;
  return `<div class="set-row"><div><div class="set-l">${esc(label)}</div>${help ? `<div class="set-h">${esc(help)}</div>` : ''}</div><div class="set-c">${ctl}</div></div>`;
}
function renderSettings() {
  const v = $('#view-einstellungen');
  const zoom = +CFG['anzeige.zoom'] || 1;
  const segRow = (lbl, help, key, opts) => `<div class="set-row"><div><div class="set-l">${lbl}</div><div class="set-h">${help}</div></div><div class="set-c"><div class="seg" data-pref="${key}">${opts.map(([val, l]) => `<button data-v="${val}" aria-pressed="${prefs[key] === val}">${l}</button>`).join('')}</div></div></div>`;
  v.innerHTML = `<div class="set">
    <nav class="set-nav" aria-label="Bereiche">${SET_SECTIONS.map(([id, l, i]) => `<button data-sec="${id}">${ic(i, 'i-sm')}${l}</button>`).join('')}
      <div class="set-note">${DESKTOP ? `${ic('database', 'i-xs')}Gespeichert in der lokalen Datenbank` : `${ic('info', 'i-xs')}Vorschau im Browser – Werte nur in diesem Browser`}</div></nav>
    <div class="set-main">
      <section class="set-sec" id="sec-allgemein"><h2>Firma & Filiale</h2><p>Erscheint auf Belegen, in der Seitenleiste und in Exporten.</p><div class="card">
        ${field('firma.name', 'Firmenname', 'Rechtlicher Name des Unternehmens')}
        ${field('firma.marke', 'Markenname auf dem Bon', 'Kurzform für Bonkopf und Kundendisplay')}
        ${field('firma.zusatz', 'Zusatz', 'z. B. „Sport & Mode“')}
        ${field('firma.adresse', 'Adresse der Filiale', '')}
        ${field('firma.uid', 'UID-Nummer', 'Pflichtangabe auf Belegen ab € 400')}
        ${field('firma.telefon', 'Telefon', '')}
      </div></section>
      <section class="set-sec" id="sec-kasse"><h2>Kasse</h2><p>Gilt für diese Kasse. Änderungen wirken sofort und werden protokolliert.</p><div class="card">
        ${field('kasse.name', 'Bezeichnung', 'Anzeige in der Kopfzeile')}
        ${field('kasse.id', 'Kassen-ID (RKSV)', 'Eindeutige Kennung je Registrierkasse – wird mit der RKSV-Registrierung verbindlich')}
        ${field('kasse.freigabe', 'Rabatte freigeben lassen', 'Rabatte über der Grenze erfordern Filialleitung (Step-up)', 'switch')}
        ${field('kasse.rabattGrenze', 'Rabattgrenze ohne Freigabe (%)', '', 'number', 'min="0" max="100" step="1" style="max-width:120px"')}
        ${field('kasse.retoureGrenze', 'Erstattung ohne Freigabe bis (€)', 'Retouren darüber und alle Stornos erfordern die Filialleitung (Step-up)', 'number', 'min="0" max="10000" step="10" style="max-width:120px"')}
        ${field('ziel.tag', 'Umsatzziel je Verkaufstag (€)', 'Grundlage für Tages-, Wochen- und Monatsziel im Dashboard', 'number', 'min="0" step="100" style="max-width:140px"')}
        ${field('gutschein.jahre', 'Gutscheine gültig (Jahre nach Ausgabejahr)', 'Ablaufdatum = 31.12. des Ausgabejahres plus diese Anzahl Jahre', 'number', 'min="1" max="30" step="1" style="max-width:100px"')}
        ${field('kasse.vereinsregel', 'Vereinsrabatt automatisch', 'Regel greift beim Zuordnen von Vereinsmitgliedern', 'switch')}
        ${field('kasse.pflichtfelder', 'Pflichtfelder je Warengruppe', 'z. B. Z-Wert und Seriennummer beim Skiverkauf', 'switch')}
        ${field('kasse.bonFuss', 'Text am Bonende', '', 'textarea')}
      </div></section>
      ${usersSectionHTML()}${printerSectionHTML()}${rksvSectionHTML()}
      <section class="set-sec" id="sec-anzeige"><h2>Darstellung</h2><p>Gilt für den angemeldeten Benutzer. Anzeigegröße auch mit <span class="kbd">Strg</span> <span class="kbd">+</span> / <span class="kbd">−</span> / <span class="kbd">0</span>.</p><div class="card">
        <div class="set-row"><div><div class="set-l">Anzeigegröße</div><div class="set-h">Für große Bildschirme oder Touch-Kassen</div></div><div class="set-c"><div class="seg" id="zoomSeg">${[.8, .9, 1, 1.1, 1.25, 1.5].map(z => `<button data-v="${z}" aria-pressed="${Math.abs(z - zoom) < .001}">${Math.round(z * 100)} %</button>`).join('')}</div></div></div>
        ${segRow('Modus', 'Hell, Dunkel oder wie Windows', 'theme', [['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'System']])}
        <div class="set-row"><div><div class="set-l">Akzentfarbe</div><div class="set-h">Oder eigene Markenfarbe</div></div><div class="set-c"><div class="swatch-row">${Object.entries(ACCENTS).map(([k, a]) => `<button class="swb" data-acc="${k}" aria-pressed="${prefs.accent === k}" style="--sw:hsl(${a.h} ${a.s}% 55%)" title="${a.name}" aria-label="${a.name}"></button>`).join('')}<label class="swb custom" title="Eigene Farbe" aria-pressed="${prefs.accent === 'custom'}"><input type="color" id="setAccCustom" value="#c98a5a" aria-label="Eigene Akzentfarbe"></label></div></div></div>
        ${segRow('Dichte', 'Touch vergrößert alle Bedienflächen', 'density', [['compact', 'Kompakt'], ['comfort', 'Komfort'], ['touch', 'Touch']])}
        ${segRow('Ecken', '', 'radius', [['sharp', 'Präzise'], ['soft', 'Weich']])}
        ${segRow('Bewegung', 'Animationen reduzieren', 'motion', [['full', 'Voll'], ['reduced', 'Reduziert']])}
      </div></section>
      <section class="set-sec" id="sec-sicherung"><h2>Datensicherung</h2><p>Die Verantwortung für regelmäßige Sicherungen liegt beim Betreiber. Kontor stellt die Werkzeuge: konsistente Sicherung im laufenden Betrieb, Prüfsumme, Integritätsprüfung und geführte Wiederherstellung.</p>
        <div id="backupBox">${DESKTOP ? '<div class="card" style="padding:18px"><span class="thinking"><b>Lade Sicherungen …</b></span></div>' : `<div class="card"><div class="empty"><div class="empty-icon">${ic('database')}</div><h3>Nur in der Desktop-App</h3><p>In der Browser-Vorschau gibt es keine Datenbank zum Sichern.</p></div></div>`}</div></section>
      <section class="set-sec" id="sec-updates"><h2>Updates</h2><p>Signierte Updates direkt im Programm. Jedes Update wird erst nach Ihrer Freigabe installiert – vorher wird automatisch gesichert.</p><div class="card" id="updBox"></div></section>
      <section class="set-sec" id="sec-system"><h2>System & Protokoll</h2><p>Jede Änderung und jede Kassenaktion wird lokal protokolliert.</p><div class="card" id="sysBox">${DESKTOP ? '<div style="padding:18px" class="thinking"><b>Lade …</b></div>' : `<div class="set-row"><div><div class="set-l">Betriebsart</div><div class="set-h">Browser-Vorschau ohne Datenbank</div></div><div class="set-c"><span class="pill">Vorschau</span></div></div>`}</div>
        <div class="card" style="margin-top:12px"><div class="set-row" style="border-bottom:0"><div><div class="set-l">Protokoll</div><div class="set-h">Letzte 60 Einträge</div></div><div class="set-c"><button class="btn btn-secondary btn-sm" id="auditReload">${ic('sync', 'i-sm')}Aktualisieren</button></div></div><div id="auditBox" style="max-height:420px;overflow:auto"></div></div>
      </section>
    </div></div>`;
  $$('.seg', v).forEach(s => initSeg(s, b => {
    if (s.id === 'zoomSeg') return saveSettings({'anzeige.zoom': +b.dataset.v}, true);
    if (s.id === 'chanSeg') return saveSettings({'update.kanal': b.dataset.v});
    if (s.dataset.pref) { prefs[s.dataset.pref] = b.dataset.v; applyPrefs(s.dataset.pref === 'theme'); }
  }));
  if (DESKTOP) { renderBackups(); renderSys(); }
  renderUpdSection(); renderAudit(); renderUsersBox(); renderPrinterBox(); renderRksvBox().then(renderSettingsKasseLock);
}
async function renderSys() {
  const i = await refreshInfo(); const box = $('#sysBox'); if (!i || !box) return;
  const row = (l, h, val) => `<div class="set-row"><div><div class="set-l">${l}</div>${h ? `<div class="set-h">${h}</div>` : ''}</div><div class="set-c" style="min-width:0">${val}</div></div>`;
  box.innerHTML = row('Version', '', `<b class="num">${esc(i.version)}</b>`)
    + row('Datenbank', `Schema ${i.schema} · ${num(i.settings)} Einstellungen · ${num(i.audit_entries)} Protokolleinträge`, `<span class="mono set-path" title="${esc(i.db_path)}">${esc(i.db_path)}</span><span class="pill" style="margin-left:8px">${fmtBytes(i.db_bytes)}</span>`)
    + row('Datenordner', '', `<button class="btn btn-secondary btn-sm" data-open="${esc(i.data_dir)}">${ic('boxes', 'i-sm')}Ordner öffnen</button>`);
}
async function renderBackups() {
  const box = $('#backupBox'); if (!box) return;
  const i = S.info || await refreshInfo(); let list = [];
  try { list = await invoke('backup_list'); } catch (e) { console.error(e); }
  if (!$('#backupBox')) return;
  box.innerHTML = `<div class="card">
    <div class="set-row"><div><div class="set-l">Zielordner</div><div class="set-h">Lokaler Pfad, Netzlaufwerk oder NAS (z. B. \\\\NAS-01\\kontor)</div></div><div class="set-c" style="min-width:0;gap:6px"><span class="mono set-path" title="${esc(i?.backup_dir || '')}"><bdi>${esc(i?.backup_dir || '')}</bdi></span><button class="btn btn-secondary btn-sm" id="bkPick">Ändern …</button><button class="btn btn-ghost btn-sm btn-icon" data-open="${esc(i?.backup_dir || '')}" aria-label="Ordner öffnen" data-tip="Ordner öffnen">${ic('boxes', 'i-sm')}</button></div></div>
    ${field('backup.auto', 'Automatisch täglich sichern', 'Beim Start und stündlich geprüft: Sicherung, wenn die letzte älter als 24 h ist', 'switch')}
    ${field('backup.keep', 'Automatische Sicherungen behalten', 'Ältere automatische Sicherungen werden gelöscht – manuelle nie', 'number', 'min="1" max="365" step="1" style="max-width:120px"')}
    <div class="set-row"><div><div class="set-l">${esc(backupLabel())}</div><div class="set-h">${i?.last_backup ? 'Letzte erfolgreiche Sicherung: ' + esc(fmtTs(i.last_backup)) : 'Es wurde noch keine Sicherung erstellt'}</div></div><div class="set-c"><button class="btn btn-primary" id="bkNow">${ic('database', 'i-sm')}Jetzt sichern</button></div></div>
  </div>
  <div class="card" style="margin-top:12px">${list.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:18px">Sicherung</th><th>Art</th><th class="r">Größe</th><th>Status</th><th></th></tr></thead><tbody>${list.map(e => `<tr data-path="${esc(e.path)}"><td style="padding-left:18px"><div style="font-weight:550">${esc(e.manifest ? fmtTs(e.manifest.created) : e.file)}</div><div class="muted mono" style="font-size:11px">${esc(e.file)}</div></td><td>${esc(e.manifest?.kind || '–')}</td><td class="r">${e.manifest ? fmtBytes(e.manifest.bytes) : '–'}</td><td class="bk-st"><span class="pill">ungeprüft</span></td><td class="r" style="white-space:nowrap;padding-right:14px"><button class="btn btn-ghost btn-sm" data-bk="verify">Prüfen</button><button class="btn btn-secondary btn-sm" data-bk="restore">Wiederherstellen</button></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty"><div class="empty-icon">${ic('database')}</div><h3>Noch keine Sicherungen</h3><p>Erstellen Sie jetzt die erste Sicherung – sie erscheint dann hier.</p></div>`}</div>`;
}
async function renderAudit() {
  const box = $('#auditBox'); if (!box) return;
  let rows = [];
  if (DESKTOP) { try { rows = await invoke('audit_recent', {limit: 60}); } catch (e) { console.error(e); } }
  else rows = Hooks.log.slice(0, 60).map(e => ({ts: e.t.toISOString(), event: e.evt, payload: e.payload}));
  if (!$('#auditBox')) return;
  box.innerHTML = rows.length ? rows.map(r => `<div class="ev"><span class="t">${esc(fmtTs(r.ts).split(', ').pop())}</span><div><span class="n ${evClass(r.event)}">${esc(r.event)}</span><pre>${esc(JSON.stringify(r.payload).replace(/"([^"]+)":/g, '$1: '))}</pre></div></div>`).join('')
    : '<div class="empty"><p>Noch keine Einträge.</p></div>';
}
async function restoreFlow(path, tr) {
  const st = $('.bk-st', tr); st.innerHTML = '<span class="pill">prüfe …</span>';
  const chk = await invoke('backup_verify', {path});
  st.innerHTML = `<span class="pill ${chk.ok ? 'pos' : 'neg'}">${ic(chk.ok ? 'check' : 'alert')}${chk.ok ? 'in Ordnung' : 'fehlerhaft'}</span>`;
  if (!chk.ok) return toast('Wiederherstellung nicht möglich', {t2: chk.message, type: 'warn', dur: 7000});
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Wiederherstellen">
    <div class="m-head"><div class="m-ic" style="color:var(--warn)">${ic('alert')}</div><div><h2>Sicherung wiederherstellen?</h2><p>Der aktuelle Datenstand wird durch die Sicherung ersetzt.</p></div></div>
    <div class="m-body"><div class="rule-box">${ic('shield')}<div>Vorher wird automatisch eine <b style="color:var(--text)">Sicherheitskopie des aktuellen Stands</b> angelegt – der Schritt lässt sich damit rückgängig machen.<br><span class="muted">${esc(path)}</span></div></div></div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="rsGo">${ic('shield', 'i-sm')}Wiederherstellen</button></div></div>`);
  $('#rsGo', el).onclick = async () => {
    closeLayer(el);
    try { await stepUp({title: 'Administrator-Freigabe', text: 'Datenstand aus einer Sicherung wiederherstellen.', rule: 'Wiederherstellungen erfordern Step-up-Authentifizierung'}); } catch { return; }
    toast('Stelle wieder her …', {icon: 'database', dur: 1500});
    try { const r = await invoke('backup_restore', {path}); toast('Wiederherstellung abgeschlossen', {t2: 'Kontor lädt die Daten neu …', type: 'pos', icon: 'database'}); setTimeout(() => location.reload(), 1600); }
    catch (e) { toast('Wiederherstellung fehlgeschlagen', {t2: String(e), type: 'warn', dur: 8000}); }
  };
}
function bindSettings() {
  const v = $('#view-einstellungen');
  v.addEventListener('change', e => {
    const k = e.target.dataset.key; if (!k) return;
    const val = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    if (e.target.type === 'number' && !isFinite(val)) return;
    saveSettings({[k]: val});
    if (k === 'ziel.tag') ST.cache = {};
  });
  v.addEventListener('input', e => { if (e.target.id === 'setAccCustom') { prefs.custom = hexToHS(e.target.value); prefs.accent = 'custom'; applyPrefs(); } });
  v.addEventListener('click', async e => {
    const t = e.target;
    const sec = t.closest('[data-sec]'); if (sec) { $('#sec-' + sec.dataset.sec)?.scrollIntoView({behavior: reduced() ? 'auto' : 'smooth', block: 'start'}); return; }
    const sw = t.closest('.switch[data-key]'); if (sw) { const on = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', on); return saveSettings({[sw.dataset.key]: on}); }
    const acc = t.closest('[data-acc]'); if (acc) { prefs.accent = acc.dataset.acc; applyPrefs(true); $$('[data-acc],.swb.custom', v).forEach(b => b.setAttribute('aria-pressed', b === acc)); return; }
    const op = t.closest('[data-open]'); if (op) return invoke('open_folder', {path: op.dataset.open}).catch(err => toast('Ordner nicht verfügbar', {t2: String(err), type: 'warn'}));
    if (t.closest('#bkNow')) return realBackup('manuell');
    if (t.closest('#auditReload')) return renderAudit();
    if (t.closest('#bkPick')) { const dir = await invoke('pick_folder'); if (dir) { await saveSettings({'backup.dir': dir}); await refreshInfo(); renderBackups(); } return; }
    const bk = t.closest('[data-bk]');
    if (bk) {
      const tr = bk.closest('tr'), path = tr.dataset.path;
      if (bk.dataset.bk === 'verify') { const st = $('.bk-st', tr); st.innerHTML = '<span class="pill">prüfe …</span>'; const c = await invoke('backup_verify', {path}); st.innerHTML = `<span class="pill ${c.ok ? 'pos' : 'neg'}" title="${esc(c.message)}">${ic(c.ok ? 'check' : 'alert')}${c.ok ? 'in Ordnung' : 'fehlerhaft'}</span>`; toast(c.ok ? 'Sicherung in Ordnung' : 'Sicherung fehlerhaft', {t2: c.message, type: c.ok ? 'pos' : 'warn'}); }
      else restoreFlow(path, tr);
    }
  });
}
