
/* ════════════════════════════════════════════════════════════════════
   16 · EINSTELLUNGEN — gespeichert in der lokalen Datenbank (Desktop)
   bzw. im Browser-Speicher (Vorschau). Wirken sofort.
   ════════════════════════════════════════════════════════════════════ */
const DEFAULTS = {
  'firma.name': 'Alpenlicht Sport GmbH', 'firma.marke': 'Alpenlicht', 'firma.zusatz': 'Sport & Mode',
  'firma.adresse': 'Maria-Theresien-Str. 18, 6020 Innsbruck', 'firma.uid': 'ATU00000000', 'firma.telefon': '0512 000000',
  'kasse.id': 'INN-K01', 'kasse.name': 'Kasse 1', 'kasse.freigabe': true, 'kasse.rabattGrenze': 20,
  'kasse.vereinsregel': true, 'kasse.retoureGrenze': 100, 'ziel.tag': 2500, 'kasse.pflichtfelder': true, 'kasse.bonFuss': 'Danke für Ihren Einkauf! Umtausch innerhalb von 30 Tagen mit Beleg.',
  'anzeige.zoom': 1.25, 'anzeige.zoom.v2': false, 'anzeige.zoom.auto': true, 'anzeige.zoom.mul': 1, 'anzeige.zoom.v3': false, 'backup.dir': '', 'backup.auto': true, 'backup.keep': 14, 'update.kanal': 'stable', 'update.auto': true, 'update.freigabe': null,
  'drucker.art': 'aus', 'drucker.adresse': '', 'drucker.name': '', 'drucker.breite': 48, 'drucker.auto': false, 'drucker.lade': false, 'gutschein.jahre': 3,
  'bon.logo': '', 'bon.logoDruck': true, 'bon.ersparnis': true, 'bon.artikelnr': false, 'bon.kopf': '', 'bon.fussA4': '',
  'mail.host': '', 'mail.port': 587, 'mail.tls': 'starttls', 'mail.user': '', 'mail.pass': '', 'mail.from': '', 'etikett.art': 'a4', 'etikett.adresse': '', 'etikett.name': '', 'etikett.format': '3x8',
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
  // 0.35.0: Anzeige passt sich stufenlos an Gerät und Bildschirm an (einmalig auf Automatik zurücksetzen)
  if (!CFG['anzeige.zoom.v3']) { CFG['anzeige.zoom.v3'] = true; CFG['anzeige.zoom.auto'] = true; CFG['anzeige.zoom.mul'] = 1; try { saveSettings({'anzeige.zoom.v3': true, 'anzeige.zoom.auto': true, 'anzeige.zoom.mul': 1}, true); } catch { /* */ } }
  uiRefit(true);
  if (S.view) renderTopbar();
}
/* ════════════════════════════════════════════════════════════════════
   Auto-Fit: Die Oberfläche passt sich laufend an Gerät und Bildschirm an.
   • misst die Fenstergröße in CSS-Pixeln bei Zoom 1 (enthält die Windows-Skalierung)
   • wählt daraus stufenlos die Anzeigegröße: Ziel ≈ 920 logische Pixel Höhe, mindestens 1200 Pixel Breite
   • schaltet je Gerät Stufen (phone · tablet · laptop · desktop · wide) für das Layout
   • rechnet bei jeder Fensteränderung neu (Maximieren, Monitorwechsel, Drehen)
   • „Anzeigegröße“ ist nur noch eine Feinjustierung (Multiplikator) auf die Automatik
   ════════════════════════════════════════════════════════════════════ */
const UI = {zoom: 1, lw: 0, lh: 0, dev: '', base: [0, 0]};
const UI_TARGET_H = 920, UI_MIN_W = 1200, UI_MUL_STEPS = [.7, .8, .9, 1, 1.1, 1.2, 1.35, 1.5];
/** reine Rechenfunktion: Wb × Hb = Fenstergröße (CSS-px bei Zoom 1), mul = Feinjustierung → Zoomfaktor */
function uiFit(Wb, Hb, mul = 1) {
  if (!(Wb > 0 && Hb > 0)) return 1;
  if (Wb < 900) return clamp(Math.round(mul * 100) / 100, .8, 1.4);                 // Handy / Tablet hochkant: nativ, Layout wird schmal
  let s = Math.min(Hb / UI_TARGET_H, Wb / UI_MIN_W);
  s = clamp(s, .85, 2.2) * mul;
  s = Math.min(s, Wb / 900);                                                         // logische Breite nie unter 900
  return clamp(Math.round(s * 100) / 100, .6, 2.6);
}
function uiDevice(lw, lh) {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return lw < 720 ? 'phone' : (lw < 1100 || (touch && lw < 1400)) ? 'tablet' : lw < 1500 ? 'laptop' : lw < 2000 ? 'desktop' : 'wide';
}
function uiRefit(force) {
  const emu = window.__UI_EMU;                                                       // Testhaken: „tu so, als wäre das Fenster w × h physisch groß“
  const desktopLike = DESKTOP || !!emu;
  const base = emu ? [emu.w, emu.h] : DESKTOP ? [innerWidth * UI.zoom, innerHeight * UI.zoom] : [innerWidth, innerHeight];
  const manual = CFG['anzeige.zoom.auto'] === false;
  const mul = clamp(+CFG['anzeige.zoom.mul'] || 1, .6, 1.6);
  const f = manual ? clamp(+CFG['anzeige.zoom'] || 1.25, .6, 2.6) : uiFit(base[0], base[1], mul);
  const eff = desktopLike ? f : 1;                                                   // im Browser skaliert der Browser selbst (Strg +/−)
  if (force || Math.abs(eff - UI.zoom) > .004) applyZoom(eff);
  UI.base = base; UI.lw = Math.round(base[0] / eff); UI.lh = Math.round(base[1] / eff);
  const dev = uiDevice(UI.lw, UI.lh);
  const r = document.documentElement;
  if (UI.dev !== dev) { UI.dev = dev; r.dataset.dev = dev; }
  r.style.setProperty('--ui-lw', UI.lw + 'px'); r.style.setProperty('--ui-lh', UI.lh + 'px');
}
function applyZoom(f) {
  f = clamp(Math.round(f * 100) / 100, .6, 2.6);
  UI.zoom = f;
  if (DESKTOP) invoke('set_zoom', {factor: f}).then(r => { if (typeof r === 'number' && r > 0) UI.zoom = r; setTimeout(() => uiRefit(), 160); }).catch(() => { UI.zoom = 1; });
  else if (!window.__UI_EMU) { document.documentElement.style.zoom = f === 1 ? '' : f; document.documentElement.style.setProperty('--zoom', f); }
}
{ let t = 0; const again = () => { clearTimeout(t); t = setTimeout(() => uiRefit(), 120); };
  addEventListener('resize', again); addEventListener('orientationchange', again); }
window.KONTOR_UI = {fit: uiFit, device: uiDevice, state: UI, refit: uiRefit};
function stepZoom(dir) {
  const cur = clamp(+CFG['anzeige.zoom.mul'] || 1, .6, 1.6), i = UI_MUL_STEPS.findIndex(x => x >= cur - .001);
  const next = dir === 0 ? 1 : UI_MUL_STEPS[clamp((i < 0 ? 3 : i) + dir, 0, UI_MUL_STEPS.length - 1)];
  saveSettings({'anzeige.zoom.mul': next, 'anzeige.zoom.auto': true}, true);
  toast(next === 1 ? 'Anzeigegröße: automatisch' : `Anzeigegröße: automatisch ${next > 1 ? '+' : '−'} ${Math.abs(Math.round((next - 1) * 100))} %`, {icon: 'eye', dur: 1400});
  if (inSettings()) $$('#zoomSeg button').forEach(b => b.setAttribute('aria-pressed', Math.abs(+b.dataset.v - next) < .01));
}
const ZOOM_CHOICES = [[.8, 'Kleiner'], [1, 'Automatisch'], [1.15, 'Größer'], [1.3, 'Groß'], [1.5, 'Sehr groß']];

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
    if (inSettings()) renderBackups();
    if (!quiet || kind !== 'automatisch') toast('Sicherung erstellt', {t2: `${e.file} · ${fmtBytes(e.manifest.bytes)} · geprüft`, type: 'pos', icon: 'database'});
    return e;
  } catch (e) { toast('Sicherung fehlgeschlagen', {t2: String(e), type: 'warn', icon: 'database', dur: 7000}); await refreshInfo(); return null; }
}
async function autoBackupCheck() {
  if (!DESKTOP || !CFG['backup.auto']) return;
  if (S.backupH === Infinity || S.backupH >= 24) { const e = await realBackup('automatisch', true); if (e) toast('Automatische Sicherung erstellt', {t2: e.file, icon: 'database', type: 'pos'}); }
}

/* ── Ansicht ── */
/** Läuft gerade eine Einstellungsseite? (jeder Bereich ist eine eigene Seite „set-…“) */
const inSettings = () => S.view === 'einstellungen' || String(S.view || '').startsWith('set-');
const SET = {sec: 'allgemein'};   // welcher Bereich zeigt die Einstellungsansicht gerade
const SET_SECTIONS = [['allgemein', 'Firma & Filiale', 'store'], ['standard', 'Standardwerte', 'sliders'], ['kasse', 'Kasse', 'register'], ['benutzer', 'Benutzer', 'users'], ['bon', 'Bon & Belege', 'receipt'], ['drucker', 'Drucker & Lade', 'printer'], ['etikett', 'Etiketten', 'tag'], ['mail', 'E-Mail', 'mail'], ['rksv', 'RKSV', 'shield'], ['anzeige', 'Darstellung', 'palette'], ['sicherung', 'Datensicherung', 'database'], ['updates', 'Updates', 'download'], ['system', 'System & Protokoll', 'server']];
function field(key, label, help, type = 'text', extra = '') {
  const v = CFG[key];
  let ctl;
  if (type === 'switch') ctl = `<button class="switch" role="switch" data-key="${key}" aria-checked="${!!v}" aria-label="${esc(label)}"></button>`;
  else if (type === 'textarea') ctl = `<textarea class="input" data-key="${key}" rows="2" style="height:auto;padding:9px 12px;resize:vertical">${esc(v)}</textarea>`;
  else ctl = `<input class="input" data-key="${key}" type="${type}" value="${esc(v)}" ${extra}>`;
  return `<div class="set-row"><div><div class="set-l">${esc(label)}</div>${help ? `<div class="set-h">${esc(help)}</div>` : ''}</div><div class="set-c">${ctl}</div></div>`;
}
/** Angaben, die Stammdaten › Filialen pflegt (Name, Adresse, UID, Telefon): nur lesbar, solange die eigene Filial-Zeile existiert */
function fieldFil(key, label, help) {
  if (typeof flRow !== 'function' || !flRow(FIL.eigene)) return field(key, label, help);
  return `<div class="set-row"><div><div class="set-l">${esc(label)}</div><div class="set-h">${esc(help ? help + ' · ' : '')}Wird unter Stammdaten › Filialen › Filialen gepflegt</div></div><div class="set-c"><input class="input" value="${esc(CFG[key])}" readonly tabindex="-1" aria-label="${esc(label)}"><button class="btn btn-secondary btn-sm" data-goto="st-filiale">${ic('store', 'i-sm')}In den Filialen ändern</button></div></div>`;
}
function renderSettings() {
  const v = $('#view-einstellungen');
  const zoomAuto = CFG['anzeige.zoom.auto'] !== false, zoomMul = clamp(+CFG['anzeige.zoom.mul'] || 1, .6, 1.6);
  const segRow = (lbl, help, key, opts) => `<div class="set-row"><div><div class="set-l">${lbl}</div><div class="set-h">${help}</div></div><div class="set-c"><div class="seg" data-pref="${key}">${opts.map(([val, l]) => `<button data-v="${val}" aria-pressed="${prefs[key] === val}">${l}</button>`).join('')}</div></div></div>`;
  v.innerHTML = `<div class="set">
    <nav class="set-nav" aria-label="Bereiche">${SET_SECTIONS.map(([id, l, i]) => `<button data-sec="${id}">${ic(i, 'i-sm')}${l}</button>`).join('')}
      <div class="set-note">${DESKTOP ? `${ic('database', 'i-xs')}Gespeichert in der lokalen Datenbank` : `${ic('info', 'i-xs')}Vorschau im Browser – Werte nur in diesem Browser`}</div></nav>
    <div class="set-main">
      <section class="set-sec" id="sec-allgemein"><h2>Firma & Filiale</h2><p>Erscheint auf Belegen, in der Seitenleiste und in Exporten.</p><div class="card">
        ${fieldFil('firma.name', 'Firmenname', 'Rechtlicher Name des Unternehmens')}
        ${field('firma.marke', 'Markenname auf dem Bon', 'Kurzform für Bonkopf und Kundendisplay')}
        ${field('firma.zusatz', 'Zusatz', 'z. B. „Sport & Mode“')}
        ${fieldFil('firma.adresse', 'Adresse der Filiale', '')}
        ${fieldFil('firma.uid', 'UID-Nummer', 'Pflichtangabe auf Belegen ab € 400')}
        ${fieldFil('firma.telefon', 'Telefon', '')}
      </div></section>
      ${eaSectionHTML()}
      <section class="set-sec" id="sec-kasse"><h2>Kasse</h2><p>Gilt für diese Kasse. Änderungen wirken sofort und werden protokolliert.</p><div class="card">
        ${field('kasse.name', 'Bezeichnung', 'Anzeige in der Kopfzeile')}
        ${field('kasse.id', 'Kassen-ID (RKSV)', 'Eindeutige Kennung je Registrierkasse – wird mit der RKSV-Registrierung verbindlich')}
        ${field('kasse.freigabe', 'Rabatte freigeben lassen', 'Rabatte über der Grenze erfordern Filialleitung (Step-up)', 'switch')}
        ${field('kasse.rabattGrenze', 'Rabattgrenze ohne Freigabe (%)', '', 'number', 'min="0" max="100" step="1" style="max-width:120px"')}
        ${field('kasse.retoureGrenze', 'Erstattung ohne Freigabe bis (€)', 'Retouren darüber und alle Stornos erfordern die Filialleitung (Step-up)', 'number', 'min="0" max="10000" step="10" style="max-width:120px"')}
        ${field('ziel.tag', 'Umsatzziel je Verkaufstag (€)', 'Grundlage für Tages-, Wochen- und Monatsziel im Dashboard', 'number', 'min="0" step="100" style="max-width:140px"')}
        ${field('kasse.vereinsregel', 'Vereinsrabatt automatisch', 'Regel greift beim Zuordnen von Vereinsmitgliedern', 'switch')}
        ${field('kasse.pflichtfelder', 'Pflichtfelder je Warengruppe', 'z. B. Z-Wert und Seriennummer beim Skiverkauf', 'switch')}
        ${field('kasse.bonFuss', 'Text am Bonende', 'Gilt, solange die Filiale unter Stammdaten › Filialen keinen eigenen Text hat', 'textarea')}
      </div></section>
      ${usersSectionHTML()}${bonSectionHTML()}${printerSectionHTML()}${labelSectionHTML()}${mailSectionHTML()}${rksvSectionHTML()}
      <section class="set-sec" id="sec-anzeige"><h2>Darstellung</h2><p>Gilt für den angemeldeten Benutzer. Anzeigegröße auch mit <span class="kbd">Strg</span> <span class="kbd">+</span> / <span class="kbd">−</span> / <span class="kbd">0</span>.</p><div class="card">
        <div class="set-row"><div><div class="set-l">Anzeigegröße</div><div class="set-h" id="zoomInfo">Passt sich automatisch an Bildschirm und Fenster an – hier nur feinjustieren</div></div><div class="set-c"><div class="seg" id="zoomSeg">${ZOOM_CHOICES.map(([m, l]) => `<button data-v="${m}" aria-pressed="${zoomAuto && Math.abs(m - zoomMul) < .08}">${l}</button>`).join('')}</div></div></div>
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
  if (!STAMM.loaded) loadStamm().then(() => { const el = $('#sec-standard'); if (el) el.outerHTML = eaSectionHTML(); });
  $$('.seg', v).forEach(s => initSeg(s, b => {
    if (s.id === 'zoomSeg') return saveSettings({'anzeige.zoom.mul': +b.dataset.v, 'anzeige.zoom.auto': true}, true);
    if (s.id === 'chanSeg') return saveSettings({'update.kanal': b.dataset.v});
    if (s.dataset.pref) { prefs[s.dataset.pref] = b.dataset.v; applyPrefs(s.dataset.pref === 'theme'); }
  }));
  if (DESKTOP) { renderBackups().then(renderBackupCrypt); renderSys(); }
  renderUpdSection(); renderAudit(); renderBonBox(); renderMailBox(); renderLabelBox(); renderPrinterBox(); renderRksvBox().then(renderSettingsKasseLock);
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
    <div class="set-row"><div><div class="set-l">Zielordner</div><div class="set-h">Lokaler Pfad, Netzlaufwerk oder NAS (z. B. ${IS_MAC ? '/Volumes/NAS-01/kontor' : '\\\\NAS-01\\kontor'})</div></div><div class="set-c" style="min-width:0;gap:6px"><span class="mono set-path" title="${esc(i?.backup_dir || '')}"><bdi>${esc(i?.backup_dir || '')}</bdi></span><button class="btn btn-secondary btn-sm" id="bkPick">Ändern …</button><button class="btn btn-ghost btn-sm btn-icon" data-open="${esc(i?.backup_dir || '')}" aria-label="Ordner öffnen" data-tip="Ordner öffnen">${ic('boxes', 'i-sm')}</button></div></div>
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
  let chk = await invoke('backup_verify', {path}), password = null;
  if (chk.needs_password) { password = await askPassword('Sicherung ist verschlüsselt', 'Sicherungspasswort eingeben'); if (password) chk = await invoke('backup_verify', {path, password}); }
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
    try { const r = await invoke('backup_restore', {path, password}); toast('Wiederherstellung abgeschlossen', {t2: 'Kontor lädt die Daten neu …', type: 'pos', icon: 'database'}); setTimeout(() => location.reload(), 1600); }
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
    if (await eaClick(t)) return;
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
      if (bk.dataset.bk === 'verify') { const st = $('.bk-st', tr); st.innerHTML = '<span class="pill">prüfe …</span>'; let c = await invoke('backup_verify', {path}); if (c.needs_password) { const pw = await askPassword('Sicherung ist verschlüsselt', 'Sicherungspasswort eingeben'); if (pw) c = await invoke('backup_verify', {path, password: pw}); } st.innerHTML = `<span class="pill ${c.ok ? 'pos' : 'neg'}" title="${esc(c.message)}">${ic(c.ok ? 'check' : 'alert')}${c.ok ? 'in Ordnung' : 'fehlerhaft'}</span>`; toast(c.ok ? 'Sicherung in Ordnung' : 'Sicherung fehlerhaft', {t2: c.message, type: c.ok ? 'pos' : 'warn'}); }
      else restoreFlow(path, tr);
    }
  });
}
