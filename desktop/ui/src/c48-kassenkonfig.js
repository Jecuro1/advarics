/* ═════════════════════════════════════════════════════════════════
   48 · KASSEN-KONFIGURATION – bündelt die Einstellungen, die die Kasse tatsächlich steuern
   ═════════════════════════════════════════════════════════════════ */
const KK_KEYS = ['kasse.freigabe', 'kasse.rabattGrenze', 'kasse.retoureGrenze', 'kasse.vereinsregel', 'kasse.pflichtfelder', 'kasse.bonFuss', 'bon.logoDruck', 'bon.ersparnis', 'bon.artikelnr', 'bon.kopf', 'bon.fussA4', 'drucker.auto', 'drucker.lade'];
const KK = {draft: null, dirty: false};
const kkLoad = () => Object.fromEntries(KK_KEYS.map(k => [k, CFG[k] ?? DEFAULTS[k] ?? '']));
const kkCards = () => [
  ['Rabatte und Freigaben', [['kasse.freigabe', 'Rabatte freigeben lassen', 'check', null, 'Rabatte über der Grenze erfordern die Filialleitung'], ['kasse.rabattGrenze', 'Rabattgrenze ohne Freigabe (%)', 'num'], ['kasse.retoureGrenze', 'Erstattung ohne Freigabe bis (€)', 'num', null, 'Retouren darüber und alle Stornos erfordern die Filialleitung'], ['kasse.vereinsregel', 'Vereinsrabatt automatisch', 'check', null, 'Greift beim Zuordnen von Vereinsmitgliedern']]],
  ['Verkauf', [['kasse.pflichtfelder', 'Pflichtfelder je Warengruppe abfragen', 'check', null, 'z. B. Z-Wert und Seriennummer beim Skiverkauf']]],
  ['Kassenbon', [['bon.logoDruck', 'Logo auf dem Bon drucken', 'check'], ['bon.ersparnis', 'Ersparnis am Bonende zeigen', 'check'], ['bon.artikelnr', 'Artikelnummer auf dem Bon drucken', 'check'], ['bon.kopf', 'Text am Bonanfang', 'area'], ['kasse.bonFuss', 'Text am Bonende', 'area'], ['bon.fussA4', 'Fußzeile auf A4-Belegen', 'area']]],
  ['Drucker und Kassenlade', [['drucker.auto', 'Bon automatisch drucken', 'check', null, 'Nach jedem Verkauf, ohne Rückfrage'], ['drucker.lade', 'Kassenlade bei Barzahlung öffnen', 'check']]]
];
function kkRender() {
  const host = $('#view-einst-kassenkonfig'); if (!host) return;
  const el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  const btn = (a, icon, l, dis) => `<button class="ag-btn" data-kk-a="${a}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}<span>${l}</span></button>`;
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Zurück')}${btn('refresh', 'sync', 'Aktualisieren')}${btn('save', 'check', 'Sichern', !KK.dirty)}${btn('undo', 'undo', 'Änderungen zurücknehmen', !KK.dirty)}</div>
    <div class="ae-body"><div id="edBody">${fxCards(KK.draft, kkCards())}</div></div>`;
  fxBind(el, KK.draft, () => { KK.dirty = true; $$('[data-kk-a="save"],[data-kk-a="undo"]', el).forEach(b => { b.disabled = false; }); });
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-kk-a]'); if (!b || b.disabled) return; const a = b.dataset.kkA;
    if (a === 'back') return history.length > 1 ? history.back() : go('dashboard');
    if (a === 'refresh' || a === 'undo') { KK.draft = kkLoad(); KK.dirty = false; return kkRender(); }
    try {
      await needPerm('einstellungen', 'Kassen-Konfiguration');
      const v = {...KK.draft}; v['kasse.rabattGrenze'] = clamp(+v['kasse.rabattGrenze'] || 0, 0, 100); v['kasse.retoureGrenze'] = Math.max(0, +v['kasse.retoureGrenze'] || 0);
      await saveSettings(v); KK.draft = kkLoad(); KK.dirty = false; kkRender();
    } catch (err) { if (err) toast('Nicht gespeichert', {t2: String(err.message || err), type: 'warn'}); }
  });
}
registerPage('einst-kassenkonfig', {title: 'Kassen-Konfiguration', sub: () => 'Einstellungen', render: () => { if (!KK.draft || !KK.dirty) KK.draft = kkLoad(); kkRender(); }});
VIEW_PERM['einst-kassenkonfig'] = 'einstellungen';
