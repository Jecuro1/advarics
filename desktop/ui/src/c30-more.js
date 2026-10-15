
/* ════════════════════════════════════════════════════════════════════
   40 · ZAHLUNGSARTEN, DESIGNS, SCHNELLWAHL, DRUCKLAYOUT, KI-WIDGETS
   ════════════════════════════════════════════════════════════════════ */
Object.assign(DEFAULTS, {'zahlung.aus': [], 'zahlung.eigene': [], 'zahlung.paypalme': '', 'zahlung.iban': '', 'zahlung.bic': '', 'zahlung.empfaenger': '', 'kasse.schnellwahl': null, 'design.vorlagen': [], 'a4.farbe': '#1f6fd1', 'etikett.felder': ['marke', 'name', 'variante', 'preis']});
Object.keys(DEFAULTS).forEach(k => { if (!(k in CFG)) CFG[k] = DEFAULTS[k]; });
const plain = s => String(s ?? '').replace(/[<>"]/g, '').trim();

/* ── Zahlungsarten ── */
if (!METHODS.some(m => m.id === 'ueberweisung')) METHODS.splice(METHODS.findIndex(m => m.id === 'gutschein'), 0, {id: 'ueberweisung', label: 'Überweisung', sub: 'SEPA-QR · Banking-App', icon: 'qr', kind: 'qr'});
const BASE_METHODS = METHODS.map(m => ({...m}));
function applyMethods() {
  const aus = new Set(Array.isArray(CFG['zahlung.aus']) ? CFG['zahlung.aus'] : []);
  METHODS.length = 0;
  BASE_METHODS.forEach(m => METHODS.push({...m, hidden: aus.has(m.id) || (m.id === 'ueberweisung' && !CFG['zahlung.iban'])}));
  (Array.isArray(CFG['zahlung.eigene']) ? CFG['zahlung.eigene'] : []).forEach(m => METHODS.splice(METHODS.findIndex(x => x.id === 'gutschein'), 0, {id: m.id, label: plain(m.label), sub: plain(m.sub || (m.link ? 'QR-Code' : 'extern bestätigen')), icon: m.link ? 'qr' : 'card', kind: 'qr', link: m.link || '', custom: true, hidden: aus.has(m.id)}));
  const ord = Array.isArray(CFG['zahlung.reihenfolge']) ? CFG['zahlung.reihenfolge'] : [];   // vom Betreiber per Ziehen festgelegt
  if (ord.length) METHODS.sort((a, b) => { const i = ord.indexOf(a.id), j = ord.indexOf(b.id); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j); });
  const p = METHODS.find(m => m.id === 'paypal'); if (p && CFG['zahlung.paypalme']) p.sub = 'paypal.me/' + plain(CFG['zahlung.paypalme']);
}
{ const _as = applySettings; applySettings = function (...a) { const r = _as.apply(this, a); applyMethods(); return r; }; }
/** EPC-QR (SEPA „Girocode“, von österreichischen Banking-Apps lesbar) */
const epcPayload = (amount, ref) => ['BCD', '002', '1', 'SCT', plain(CFG['zahlung.bic']).toUpperCase(), plain(CFG['zahlung.empfaenger'] || CFG['firma.name']).slice(0, 70), plain(CFG['zahlung.iban']).replace(/\s/g, '').toUpperCase(), 'EUR' + amount.toFixed(2), '', '', plain(ref).slice(0, 140)].join('\n');
function qrFor(m, amount) {
  if (m.id === 'paypal' && CFG['zahlung.paypalme']) return `https://paypal.me/${encodeURIComponent(plain(CFG['zahlung.paypalme']))}/${amount.toFixed(2)}EUR`;
  if (m.id === 'ueberweisung' && CFG['zahlung.iban']) return epcPayload(amount, `${CFG['firma.marke'] || 'Kontor'} Beleg ${belegNo()}`);
  if (m.link) return m.link.replace(/\{betrag\}/g, amount.toFixed(2)).replace(/\{beleg\}/g, belegNo());
  return null;
}
const _runQRSim = runQR;
runQR = async function (m, amount) {
  if (!DESKTOP) return _runQRSim(m, amount);
  PAY.busy = true;
  const term = $('#term'); $('#payGo').disabled = true; $('#payAmtIn').disabled = true;
  const reset = msg => { if (!PAY) return; PAY.busy = false; $('#payGo').disabled = false; $('#payAmtIn').disabled = false; if (msg) term.innerHTML = msg; };
  const data = qrFor(m, amount);
  let svg = ''; if (data) { try { svg = await invoke('qr_svg', {text: data}); } catch { /* */ } }
  if (!PAY) return;
  term.innerHTML = `${svg ? `<div class="qr-box" style="margin-bottom:10px">${svg.replace('<svg', '<svg width="150" height="150"')}</div>` : `<div class="dev">${ic(m.icon)}</div>`}<h3>${esc(eur(amount))} · ${esc(m.label)}</h3><p>${svg ? (m.id === 'ueberweisung' ? 'Mit der Banking-App scannen – Betrag und Empfänger sind ausgefüllt' : 'Kund:in scannt den Code und bezahlt am Handy') : 'Zahlung beim Anbieter durchführen'} · danach bestätigen</p><div style="display:flex;gap:8px;justify-content:center;margin-top:10px"><button class="btn btn-secondary" id="qrNo">Abbrechen</button><button class="btn btn-primary" id="qrOk">${ic('check', 'i-sm')}Zahlung erhalten</button></div>`;
  Hooks.emit('pos.payment.qr', {beleg: belegNo(), art: m.id, betrag: r2(amount)});
  $('#qrOk').onclick = () => { if (PAY) addPart(m, amount, `${m.label} · bestätigt`); };
  $('#qrNo').onclick = () => reset(`<div class="dev">${ic(m.icon)}</div><h3>Abgebrochen</h3><p>Andere Zahlungsart wählen oder erneut versuchen.</p>`);
};
SET_SECTIONS.splice(SET_SECTIONS.findIndex(s => s[0] === 'terminal'), 0, ['zahlung', 'Zahlungsarten', 'card']);
function renderZahlBox() {
  const box = $('#zahlBox'); if (!box) return;
  const aus = new Set(CFG['zahlung.aus'] || []), ord = Array.isArray(CFG['zahlung.reihenfolge']) ? CFG['zahlung.reihenfolge'] : [];
  const all = BASE_METHODS.concat((CFG['zahlung.eigene'] || []).map(m => ({...m, icon: m.link ? 'qr' : 'card'}))).sort((a, b) => { const i = ord.indexOf(a.id), j = ord.indexOf(b.id); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j); });
  box.innerHTML = `<div class="set-row"><div><div class="set-l">An der Kasse anbieten</div><div class="set-h">Reihenfolge = Tasten 1–8 im Bezahlen-Dialog · zum Ändern ziehen</div></div><div class="set-c" id="zahlChips" style="flex-wrap:wrap;justify-content:flex-end;gap:6px;max-width:460px">${all.map(m => `<button class="chip" data-zm="${esc(m.id)}" ${dndAttr(m.id)} aria-pressed="${!aus.has(m.id)}">${ic(m.icon, 'i-sm')}${esc(plain(m.label))}</button>`).join('')}</div></div>
    ${field('zahlung.paypalme', 'PayPal.me-Name', 'z. B. alpenlichtsport → QR-Code mit Betrag (paypal.me/…/49.90EUR)')}
    ${fieldFil('zahlung.iban', 'IBAN für Überweisung per QR', 'aktiviert „Überweisung“ mit SEPA-QR (EPC-Girocode)')}
    ${fieldFil('zahlung.bic', 'BIC', 'optional')}
    ${field('zahlung.empfaenger', 'Empfänger', 'leer = Firmenname')}
    <div class="set-row" style="border-bottom:0"><div><div class="set-l">Eigene Zahlungsarten</div><div class="set-h">${(CFG['zahlung.eigene'] || []).map(m => `${esc(plain(m.label))}${m.link ? ' (QR)' : ''} <button class="btn btn-ghost btn-sm" data-zdel="${esc(m.id)}" style="height:22px">${ic('x', 'i-xs')}</button>`).join(' · ') || 'z. B. Rechnung, Firmenkonto, Twint, Bluecode – mit oder ohne QR-Link'}</div></div><div class="set-c"><button class="btn btn-secondary btn-sm" data-z="neu">${ic('plus', 'i-sm')}Zahlungsart</button></div></div>`;
  // Reihenfolge der Zahlungsarten im Bezahlen-Dialog per Ziehen festlegen
  dndZone($('#zahlChips', box), 'zahlung-reihenfolge', {axis: 'x', ghost: 'clone', reorder: async (ids, ins) => {
    await saveSettings({'zahlung.reihenfolge': dndArrange(all.map(m => m.id), ids, ins)}, true);
    applyMethods(); renderZahlBox();
  }});
}
function openOwnMethod() {
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="Zahlungsart"><div class="m-head"><div class="m-ic">${ic('card')}</div><div><h2>Eigene Zahlungsart</h2><p>Erscheint im Bezahlen-Dialog; wird am Bon und im Bericht ausgewiesen</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:12px"><label class="field"><span>Bezeichnung</span><input class="input" id="omL" placeholder="z. B. Bluecode"></label><label class="field"><span>Zusatz</span><input class="input" id="omS" placeholder="z. B. App · QR"></label>
      <label class="field"><span>Zahlungslink für QR-Code (optional)</span><input class="input mono" id="omLink" placeholder="https://… {betrag} … {beleg}"></label><div class="prompt-hint blk">${ic('info', 'i-xs')}Platzhalter <span class="mono">{betrag}</span> (z. B. 49.90) und <span class="mono">{beleg}</span>. Ohne Link wird die Zahlung nur bestätigt.</div></div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="omGo">${ic('check', 'i-sm')}Hinzufügen</button></div></div>`, {focus: '#omL'});
  $('#omGo', el).onclick = async () => {
    const label = plain($('#omL', el).value); if (label.length < 2) return toast('Bezeichnung fehlt', {type: 'warn'});
    const list = [...(CFG['zahlung.eigene'] || []), {id: 'x-' + norm(label).replace(/[^a-z0-9]/g, '').slice(0, 16) + '-' + uid().slice(0, 3), label, sub: plain($('#omS', el).value), link: $('#omLink', el).value.trim()}];
    await saveSettings({'zahlung.eigene': list}); closeLayer(el); renderZahlBox();
  };
}

/* ── Design-Vorlagen: weitere mitgelieferte und eigene ── */
Object.assign(ACCENTS, {koralle: {h: 8, s: 70, name: 'Koralle'}, wald: {h: 152, s: 36, name: 'Wald'}, beere: {h: 336, s: 50, name: 'Beere'}, violett: {h: 262, s: 48, name: 'Violett'}});
function extendPresets() {
  if (THEME_PRESETS.some(p => p.id === 'ozean')) return;
  THEME_PRESETS.unshift({id: 'ozean', name: 'Ozean · Hell', d: 'Standard ab 0.10 – klar, freundlich, hell.', theme: 'light', accent: 'ozean', density: 'comfort', radius: 'soft'}, {id: 'ozean-nacht', name: 'Ozean · Nacht', d: 'Dunkel mit kühlem Blau – ruhig am Abend.', theme: 'dark', accent: 'ozean', density: 'comfort', radius: 'soft'});
  THEME_PRESETS.push({id: 'koralle', name: 'Koralle', d: 'Warm und lebendig – Mode & Lifestyle.', theme: 'light', accent: 'koralle', density: 'comfort', radius: 'soft'}, {id: 'wald', name: 'Wald', d: 'Natürlich, grün – Outdoor & Bio.', theme: 'light', accent: 'wald', density: 'comfort', radius: 'soft'},
    {id: 'beere-nacht', name: 'Beere · Nacht', d: 'Edel und dunkel – Boutique.', theme: 'dark', accent: 'beere', density: 'comfort', radius: 'soft'}, {id: 'violett', name: 'Violett · Touch', d: 'Große Bedienflächen, kräftiger Akzent.', theme: 'light', accent: 'violett', density: 'touch', radius: 'soft'});
}
const designs = () => Array.isArray(CFG['design.vorlagen']) ? CFG['design.vorlagen'] : [];
function askText(title, text, value = '') {
  return new Promise(resolve => {
    const el = openLayer(`<div class="modal" style="width:min(440px,100%)" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="m-head"><div class="m-ic">${ic('edit')}</div><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div></div><div class="m-body"><input class="input" id="atIn" value="${esc(value)}"></div><div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="atGo">OK</button></div></div>`, {focus: '#atIn', onClose: () => resolve(null)});
    const go2 = () => { const v = $('#atIn', el).value.trim(); if (!v) return; resolve(v); closeLayer(el); };
    $('#atGo', el).onclick = go2; el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
  });
}
async function saveDesign() {
  const name = await askText('Design-Vorlage speichern', 'Name der Vorlage – für alle Benutzer dieser Kasse verfügbar', `Eigene ${designs().length + 1}`); if (!name) return;
  const d = {name: plain(name), theme: prefs.theme, accent: prefs.accent, custom: prefs.custom, density: prefs.density, radius: prefs.radius, motion: prefs.motion, tpl: prefs.tpl};
  await saveSettings({'design.vorlagen': [...designs().filter(x => x.name !== d.name), d]}, true);
  toast('Design-Vorlage gespeichert', {t2: `„${d.name}“ – unter Designsystem → Design-Vorlagen`, type: 'pos', icon: 'palette'});
  Hooks.emit('config.theme.saved', {vorlage: d.name, modus: d.theme, akzent: d.accent});
  if (S.view === 'designsystem') renderDesign();
}
function applyDesign(d) { Object.assign(prefs, {theme: d.theme, accent: d.accent, custom: d.custom || null, density: d.density, radius: d.radius, motion: d.motion || 'full', tpl: d.tpl || prefs.tpl}); applyPrefs(true); toast(`Vorlage „${d.name}“ angewendet`, {icon: 'palette'}); }
// Designsystem-Seite: eigene Vorlagen anzeigen, exportieren, importieren
function decorateDesign() {
  const grid = $('#view-designsystem [data-preset="_own"]')?.parentElement; if (!grid || $('#ownDesigns')) return;
  const own = designs();
  grid.insertAdjacentHTML('afterend', `<div id="ownDesigns" style="margin-top:14px"><div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><b style="font-size:14px">Eigene Vorlagen</b><span class="sp" style="flex:1"></span><button class="btn btn-secondary btn-sm" data-dsx="save">${ic('plus', 'i-sm')}Aktuelle Darstellung speichern</button><button class="btn btn-ghost btn-sm" data-dsx="export" ${own.length ? '' : 'disabled'}>${ic('download', 'i-sm')}Exportieren</button><button class="btn btn-ghost btn-sm" data-dsx="import">Importieren …</button></div>
    ${own.length ? `<div class="ds-grid ds-cols-4">${own.map((d, i) => `<div class="card preset" style="position:relative"><button style="all:unset;display:block;cursor:pointer;width:100%" data-dsown="${i}">${presetPreview({...d, accent: ACCENTS[d.accent] ? d.accent : 'ozean'})}<div class="meta"><div class="t1">${esc(d.name)}</div><div class="t2">${esc(d.theme === 'dark' ? 'Dunkel' : d.theme === 'light' ? 'Hell' : 'System')} · ${esc(ACCENTS[d.accent]?.name || 'eigene Farbe')}</div></div></button><button class="btn btn-ghost btn-sm btn-icon" data-dsdel="${i}" style="position:absolute;top:8px;right:8px" aria-label="Löschen">${ic('trash', 'i-sm')}</button></div>`).join('')}</div>` : '<div class="muted" style="font-size:13px">Noch keine – Darstellung oben rechts (Paletten-Symbol) einstellen und hier speichern.</div>'}</div>`);
}
{ const _rd = renderDesign; renderDesign = function (...a) { extendPresets(); const r = _rd.apply(this, a); decorateDesign(); return r; }; }

/* ── Schnellwahl-Tasten an der Kasse ── */
const SVC_DEFAULT = SERVICES.map(s => ({...s}));
function applyQuick() {
  const list = Array.isArray(CFG['kasse.schnellwahl']) ? CFG['kasse.schnellwahl'] : null; if (!list) return;
  SERVICES.length = 0;
  list.forEach(s => SERVICES.push({id: s.id, name: plain(s.name), price: s.price == null ? null : +s.price, icon: s.icon || 'tag', vat: s.vat ?? 20}));
  if (!SERVICES.some(s => s.id === 'GS')) SERVICES.push(SVC_DEFAULT.find(s => s.id === 'GS'));
}
{ const _as2 = applySettings; applySettings = function (...a) { const r = _as2.apply(this, a); applyQuick(); return r; }; }
function openQuickEditor() {
  const st = SERVICES.filter(s => s.id !== 'GS').map(s => ({...s, price: s.price == null ? '' : num(s.price, 2)}));
  const icons = ['bag', 'wrench', 'snow', 'sliders', 'tag', 'gift', 'star', 'clock', 'boxes', 'percent', 'truck', 'receipt'];
  const el = openLayer(`<div class="modal" style="width:min(640px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Schnellwahl"><div id="qeBox" style="display:flex;flex-direction:column;min-height:0"></div></div>`);
  const box = $('#qeBox', el);
  const collect = () => $$('[data-qe]', el).forEach(i => { st[+i.dataset.qi][i.dataset.qe] = i.value; });
  const render = () => {
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('grid')}</div><div><h2>Schnellwahl-Tasten</h2><p>Dienstleistungen und häufige Positionen ohne Artikelnummer · „Gutschein verkaufen“ bleibt immer</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="overflow:auto;display:grid;gap:8px">${st.map((s, i) => `<div class="frow" style="grid-template-columns:44px 1fr 110px 90px 36px"><select class="input select" data-qe="icon" data-qi="${i}" style="padding:0 6px">${icons.map(x => `<option ${x === s.icon ? 'selected' : ''}>${x}</option>`).join('')}</select><input class="input" data-qe="name" data-qi="${i}" value="${esc(s.name)}" placeholder="Bezeichnung"><input class="input num" data-qe="price" data-qi="${i}" value="${esc(s.price)}" placeholder="Preis €"><select class="input select" data-qe="vat" data-qi="${i}">${[20, 13, 10, 0].map(v => `<option value="${v}" ${+s.vat === v ? 'selected' : ''}>${v} %</option>`).join('')}</select><button class="btn btn-ghost btn-icon" data-qrm="${i}" aria-label="Entfernen">${ic('x', 'i-sm')}</button></div>`).join('')}
        <div><button class="btn btn-ghost btn-sm" id="qeAdd">${ic('plus', 'i-sm')}Taste hinzufügen</button></div></div>
      <div class="m-foot"><button class="btn btn-ghost" id="qeReset">Standard</button><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="qeSave">${ic('check', 'i-sm')}Speichern</button></div>`;
  };
  el.addEventListener('click', async e => {
    if (e.target.closest('#qeAdd')) { collect(); st.push({id: 'Q' + uid().slice(0, 4).toUpperCase(), name: '', price: '', icon: 'tag', vat: 20}); return render(); }
    const rm = e.target.closest('[data-qrm]'); if (rm) { collect(); st.splice(+rm.dataset.qrm, 1); return render(); }
    if (e.target.closest('#qeReset')) { await saveSettings({'kasse.schnellwahl': SVC_DEFAULT.filter(s => s.id !== 'GS')}, true); SERVICES.length = 0; SVC_DEFAULT.forEach(s => SERVICES.push({...s})); closeLayer(el); return toast('Schnellwahl zurückgesetzt', {icon: 'grid'}); }
    if (e.target.closest('#qeSave')) {
      collect();
      const list = st.filter(s => plain(s.name)).map(s => ({id: s.id, name: plain(s.name), price: String(s.price).trim() ? r2(parseAmt(s.price)) : null, icon: s.icon, vat: +s.vat}));
      if (list.some(s => s.price != null && !(s.price >= 0))) return toast('Preis ungültig', {type: 'warn'});
      await saveSettings({'kasse.schnellwahl': list}); closeLayer(el);
      if (S.view === 'kasse') { S.view = null; go('kasse'); }
    }
  });
  render();
}

/* ── Drucklayout: Farbe der A4-Belege, Inhalt der Etiketten ── */
{ const _pi = printInvoice; printInvoice = function (rec, kind) { const c = /^#[0-9a-f]{6}$/i.test(CFG['a4.farbe'] || '') ? CFG['a4.farbe'] : '#111111'; const _ph = printHTML; printHTML = (body, title, css = '') => _ph(body, title, css + `h1{color:${c}}th{color:${c};border-color:${c}}.sum .tot td{border-color:${c};color:${c}}`); try { return _pi(rec, kind); } finally { printHTML = _ph; } }; }

/* ── KI-Antworten als Dashboard-Widget anheften ── */
const aiPins = () => persist.get('aiPins', []);
function registerAiPins() {
  Object.keys(W).filter(k => k.startsWith('ai.pin:')).forEach(k => delete W[k]);
  aiPins().forEach(p => {
    W['ai.pin:' + p.id] = {title: p.title || p.q, cat: 'KI', icon: 'sparkle', desc: `Gespeicherte Frage: „${p.q}“`, sizes: ['wide', 'tall'], sub: () => 'KI · lokal', tools: () => `<span class="ai-chip"><span class="dot live"></span>aktuell</span>`,
      body: it => { const c = AI_PIN_DATA[p.id]; if (!c || Date.now() - c.t > 120000) refreshPin(p, it); if (!c) return `<div class="empty" style="flex:1"><span class="thinking"><b>Werte aus …</b></span></div>`; const a = c.a;
        return a.rows?.length ? `<div style="overflow:auto;flex:1"><table class="tbl" style="margin:0"><thead><tr>${a.cols.slice(0, 4).map((x, i) => `<th class="${a.num?.includes(i) ? 'r' : ''}">${esc(x)}</th>`).join('')}</tr></thead><tbody>${a.rows.slice(0, 6).map(r => `<tr>${r.slice(0, 4).map((x, i) => `<td class="${a.num?.includes(i) ? 'r num' : ''}" style="${i ? '' : 'font-weight:550'}">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p style="font-size:13px;color:var(--text-2)">${esc(a.text)}</p>`; }};
  });
}
const AI_PIN_DATA = {};
async function refreshPin(p) {
  if (AI_PIN_DATA[p.id]?.busy) return; AI_PIN_DATA[p.id] = {...(AI_PIN_DATA[p.id] || {}), busy: true};
  try { AI_PIN_DATA[p.id] = {a: await realAnswer(p.q), t: Date.now()}; } catch (e) { AI_PIN_DATA[p.id] = {a: {text: String(e)}, t: Date.now()}; }
  (Dash.layout || []).filter(it => it.t === 'ai.pin:' + p.id).forEach(it => rerenderWidget(it.id));
}
function pinQuestion(q, title) {
  const p = {id: uid(), q, title: title || q};
  persist.set('aiPins', [...aiPins(), p]); registerAiPins();
  Dash.layout.unshift({id: uid(), t: 'ai.pin:' + p.id, s: 'wide'}); Dash.preset = 'eigene'; saveLayout(); if (S.view === 'dashboard') renderWidgets(false);
  toast('Als Widget angeheftet', {t2: `„${p.title}“ – aktualisiert sich selbst`, type: 'pos', icon: 'layout'});
  Hooks.emit('dashboard.widget.added', {widget: 'ai.pin', frage: q});
}
// Knopf „Anheften“ an KI-Antworten (Dashboard und KI-Analyse)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pinq]'); if (b) { e.stopPropagation(); pinQuestion(b.dataset.pinq, b.dataset.pint); }
}, true);
const pinObserver = new MutationObserver(() => {
  const foot = $('#answerSlot .answer-foot'); const q = $('#askInput')?.value.trim();
  if (DESKTOP && foot && q && !$('[data-pinq]', foot) && foot.children.length) foot.lastElementChild?.insertAdjacentHTML?.('beforeend', `<button class="btn btn-secondary btn-sm" data-pinq="${esc(q)}" data-pint="${esc($('#answerSlot .answer-head h3')?.textContent || q)}">${ic('layout', 'i-sm')}Als Widget</button>`);
  const ka = $('#kiAns .set-row'); const kq = $('#kiQ')?.value.trim();
  if (ka && kq && !$('[data-pinq]', ka)) ka.insertAdjacentHTML('beforeend', `<div class="set-c"><button class="btn btn-ghost btn-sm" data-pinq="${esc(kq)}" data-pint="${esc($('#kiAns .set-l')?.textContent.trim() || kq)}">${ic('layout', 'i-sm')}Als Widget</button></div>`);
});
setTimeout(() => ['#view-dashboard', '#view-ki'].forEach(id => { const n = $(id); n && pinObserver.observe(n, {childList: true, subtree: true}); }), 0);

/* ── Einstellungen: Abschnitte für Zahlungsarten, Schnellwahl, Drucklayout ── */
{
  const _rs = renderSettings;
  renderSettings = function () {
    _rs();
    const a = $('#sec-terminal');
    if (a) a.insertAdjacentHTML('beforebegin', `<section class="set-sec" id="sec-zahlung"><h2>Zahlungsarten</h2><p>Welche Zahlungsarten an der Kasse erscheinen, PayPal und Überweisung per QR-Code, eigene Zahlungsarten.</p><div class="card" id="zahlBox"></div></section>`);
    const k = $('#sec-kasse .card');
    if (k) k.insertAdjacentHTML('beforeend', `<div class="set-row"><div><div class="set-l">Schnellwahl-Tasten</div><div class="set-h">${esc(SERVICES.filter(s => s.id !== 'GS').map(s => s.name).join(' · '))}</div></div><div class="set-c"><button class="btn btn-secondary btn-sm" data-qe-open>${ic('grid', 'i-sm')}Bearbeiten</button></div></div>`);
    const b = $('#bonBox');
    if (b) b.insertAdjacentHTML('beforeend', `<div class="set-row"><div><div class="set-l">Akzentfarbe Rechnung/Lieferschein</div><div class="set-h">Überschrift, Tabellenkopf und Summe</div></div><div class="set-c"><input type="color" data-key="a4.farbe" value="${esc(CFG['a4.farbe'] || '#1f6fd1')}" style="width:44px;height:30px;border:0;background:none"></div></div>`);
    renderZahlBox();
  };
}
function bindMore() {
  const sv = $('#view-einstellungen');
  sv.addEventListener('click', async e => {
    const zm = e.target.closest('[data-zm]');
    if (zm) { const aus = new Set(CFG['zahlung.aus'] || []); aus.has(zm.dataset.zm) ? aus.delete(zm.dataset.zm) : aus.add(zm.dataset.zm); if (aus.has('bar')) { aus.delete('bar'); toast('Bar bleibt immer verfügbar', {icon: 'cash'}); } await saveSettings({'zahlung.aus': [...aus]}, true); return renderZahlBox(); }
    if (e.target.closest('[data-z="neu"]')) return openOwnMethod();
    const zd = e.target.closest('[data-zdel]'); if (zd) { await saveSettings({'zahlung.eigene': (CFG['zahlung.eigene'] || []).filter(m => m.id !== zd.dataset.zdel)}); return renderZahlBox(); }
    if (e.target.closest('[data-qe-open]')) return openQuickEditor();
  });
  sv.addEventListener('change', e => { if (['zahlung.iban', 'zahlung.paypalme'].includes(e.target.dataset.key)) setTimeout(() => { applyMethods(); renderZahlBox(); }, 100); });
  $('#view-designsystem').addEventListener('click', async e => {
    const t = e.target;
    const o = t.closest('[data-dsown]'); if (o) return applyDesign(designs()[+o.dataset.dsown]);
    const d = t.closest('[data-dsdel]'); if (d) { const l = designs().slice(); l.splice(+d.dataset.dsdel, 1); await saveSettings({'design.vorlagen': l}, true); return renderDesign(); }
    const x = t.closest('[data-dsx]'); if (!x) return;
    if (x.dataset.dsx === 'save') return saveDesign();
    if (x.dataset.dsx === 'export') { try { const p = await invoke('save_text', {name: 'Kontor_Designs.json', content: JSON.stringify({format: 'kontor.designs/v1', vorlagen: designs()}, null, 2), title: 'Design-Vorlagen exportieren'}); if (p) toast('Exportiert', {t2: p, type: 'pos', icon: 'download'}); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } }
    if (x.dataset.dsx === 'import') {
      let txt; try { txt = await invoke('open_text', {title: 'Design-Vorlagen importieren', ext: 'json'}); } catch (err) { return toast('Datei nicht lesbar', {t2: String(err), type: 'warn'}); }
      if (!txt) return; let j; try { j = JSON.parse(txt); } catch { return toast('Ungültige Datei', {type: 'warn'}); }
      const add = (j.vorlagen || []).filter(v => v && v.name && v.theme).map(v => ({...v, name: plain(v.name)}));
      await saveSettings({'design.vorlagen': [...designs().filter(v => !add.some(a => a.name === v.name)), ...add]}, true); renderDesign(); toast(`${add.length} Vorlagen importiert`, {type: 'pos', icon: 'palette'});
    }
  }, true);
  // „Als Design-Vorlage speichern“ im Darstellungs-Menü speichert jetzt wirklich
  document.addEventListener('click', e => { if (e.target.closest('#apSave')) { e.stopPropagation(); closePopover(); saveDesign(); } }, true);
}

/* ── Eigene Dashboard-Widgets: SQL-Abfrage (nur lesend) + Darstellung ── */
DEFAULTS['dash.eigene'] = []; if (!('dash.eigene' in CFG)) CFG['dash.eigene'] = [];
const ownWidgets = () => Array.isArray(CFG['dash.eigene']) ? CFG['dash.eigene'] : [];
const OW_VORLAGEN = [
  ['Umsatz heute', 'kennzahl', "SELECT printf('€ %.2f', COALESCE(SUM(total),0)/100.0) AS wert FROM sales WHERE substr(ts,1,10) = date('now','localtime')", 'brutto'],
  ['Bons je Stunde (heute)', 'tabelle', "SELECT substr(ts,12,2) || ' Uhr' AS Stunde, COUNT(*) AS Bons, printf('€ %.2f', SUM(total)/100.0) AS Umsatz FROM sales WHERE kind = 'verkauf' AND substr(ts,1,10) = date('now','localtime') GROUP BY 1 ORDER BY 1", ''],
  ['Unter Mindestbestand', 'liste', "SELECT a.name AS Artikel, v.stock || ' / ' || a.min_stock AS Bestand, v.ean AS EAN FROM variants v JOIN articles a ON a.id = v.article_id LEFT JOIN stamm w ON w.kind = 'warengruppe' AND w.id = a.category WHERE a.min_stock > 0 AND v.stock < a.min_stock AND COALESCE(json_extract(w.data, '$.service'), 0) = 0 ORDER BY v.stock LIMIT 20", ''],
  ['Neue Kund:innen (30 Tage)', 'kennzahl', "SELECT COUNT(*) AS wert FROM customers WHERE created_at >= date('now','-30 days')", 'Kund:innen'],
];
function registerOwnWidgets() {
  Object.keys(W).filter(k => k.startsWith('own:')).forEach(k => delete W[k]);
  ownWidgets().forEach(o => {
    const key = 'own:' + o.id, w = {typ: o.typ, quelle: {abfrage: o.sql}, einheit: o.einheit, leer: 'Keine Treffer'};
    W[key] = {title: o.titel, cat: 'Erweiterungen', icon: o.typ === 'kennzahl' ? 'chart' : o.typ === 'tabelle' ? 'grid' : 'list', desc: `Eigene Abfrage · ${o.typ === 'kennzahl' ? 'Kennzahl' : o.typ === 'tabelle' ? 'Tabelle' : 'Liste'}`, sizes: o.typ === 'kennzahl' ? ['s', 'm'] : ['tall', 'wide'], plugin: 'Eigenes Widget', sub: () => 'Eigene Abfrage', body: () => extWidgetBody(key, w)};
  });
}
{ const _as3 = applySettings; applySettings = function (...a) { const r = _as3.apply(this, a); if (DESKTOP) registerOwnWidgets(); return r; }; }
function openWidgetBuilder(edit) {
  const o = edit ? {...edit} : {id: uid().slice(0, 8), titel: '', typ: 'kennzahl', sql: '', einheit: ''};
  const el = openLayer(`<div class="modal" style="width:min(720px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Eigenes Widget"><div class="m-head"><div class="m-ic">${ic('code')}</div><div><h2>Eigenes Widget</h2><p>Abfrage auf die lokale Datenbank (nur lesend) – als Kennzahl, Liste oder Tabelle</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="overflow:auto;display:grid;gap:12px">
      <div><div class="muted" style="font-size:12px;margin-bottom:6px">Vorlagen</div><div style="display:flex;flex-wrap:wrap;gap:6px">${OW_VORLAGEN.map((v, i) => `<button class="chip" data-owv="${i}">${esc(v[0])}</button>`).join('')}</div></div>
      <div class="ed-grid"><label class="field"><span>Titel</span><input class="input" id="owT" value="${esc(o.titel)}" placeholder="z. B. Umsatz heute"></label><label class="field"><span>Einheit / Zusatz (Kennzahl)</span><input class="input" id="owE" value="${esc(o.einheit || '')}" placeholder="z. B. Bons"></label></div>
      <div class="field"><span>Darstellung</span><div class="seg" id="owSeg">${[['kennzahl', 'Kennzahl'], ['liste', 'Liste'], ['tabelle', 'Tabelle']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${o.typ === k}">${l}</button>`).join('')}</div></div>
      <label class="field"><span>Abfrage (SQL, SELECT)</span><textarea class="input mono" id="owS" rows="5" style="height:auto;padding-top:9px;font-size:12.5px" placeholder="SELECT COUNT(*) AS wert FROM sales WHERE …">${esc(o.sql)}</textarea></label>
      <div class="prompt-hint blk">${ic('info', 'i-xs')}Tabellen u. a.: <span class="mono">sales</span> (ts, kind, total in Cent, cashier, customer_id, data), <span class="mono">articles</span>, <span class="mono">variants</span> (ean, stock), <span class="mono">customers</span>, <span class="mono">transfers</span>. Kennzahl: erste Spalte der ersten Zeile. Liste: Spalte 1 = Titel, 2 = Wert, 3 = Unterzeile.</div>
      <div id="owPrev"></div>
      ${ownWidgets().length && !edit ? `<div><div class="muted" style="font-size:12px;margin-bottom:6px">Vorhandene eigene Widgets</div>${ownWidgets().map(x => `<div class="set-row"><div class="set-l">${esc(x.titel)} <span class="muted" style="font-weight:400">· ${esc(x.typ)}</span></div><div class="set-c" style="gap:6px"><button class="btn btn-ghost btn-sm" data-owedit="${esc(x.id)}">${ic('edit', 'i-sm')}Bearbeiten</button><button class="btn btn-ghost btn-sm btn-icon" data-owdel="${esc(x.id)}" aria-label="Löschen">${ic('trash', 'i-sm')}</button></div></div>`).join('')}</div>` : ''}
    </div>
    <div class="m-foot"><button class="btn btn-secondary" id="owTest">${ic('zap', 'i-sm')}Vorschau</button><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="owGo">${ic('check', 'i-sm')}${edit ? 'Speichern' : 'Zum Dashboard hinzufügen'}</button></div></div>`, {focus: '#owT'});
  initSeg($('#owSeg', el), b => { o.typ = b.dataset.v; });
  const read = () => { o.titel = plain($('#owT', el).value); o.einheit = plain($('#owE', el).value); o.sql = $('#owS', el).value.trim(); };
  const preview = async () => {
    read(); const box = $('#owPrev', el);
    try {
      const rows = await invoke('api_query_test', {sql: o.sql, args: {}});
      const k = 'own:_vorschau'; EXT.data[k] = {rows, t: Date.now()};
      box.innerHTML = `<div class="card" style="padding:14px;display:flex;flex-direction:column;min-height:120px;max-height:260px;overflow:auto"><div class="muted" style="font-size:12px;margin-bottom:6px">Vorschau · ${num(rows.length)} Zeile${rows.length === 1 ? '' : 'n'}</div>${extWidgetBody(k, {typ: o.typ, einheit: o.einheit, leer: 'Keine Treffer'})}</div>`;
      return true;
    } catch (e) { box.innerHTML = `<div class="prompt-hint blk" style="color:var(--neg)">${ic('alert', 'i-xs')}${esc(String(e))}</div>`; return false; }
  };
  el.addEventListener('click', async e => {
    const v = e.target.closest('[data-owv]'); if (v) { const [t, typ, sql, ein] = OW_VORLAGEN[+v.dataset.owv]; $('#owT', el).value = t; $('#owS', el).value = sql; $('#owE', el).value = ein; $(`#owSeg [data-v="${typ}"]`, el).click(); return preview(); }
    if (e.target.closest('#owTest')) return preview();
    const ed = e.target.closest('[data-owedit]'); if (ed) { closeLayer(el); return openWidgetBuilder(ownWidgets().find(x => x.id === ed.dataset.owedit)); }
    const dl = e.target.closest('[data-owdel]'); if (dl) {
      await saveSettings({'dash.eigene': ownWidgets().filter(x => x.id !== dl.dataset.owdel)}, true);
      Dash.layout = Dash.layout.filter(it => it.t !== 'own:' + dl.dataset.owdel); saveLayout(); registerOwnWidgets(); if (S.view === 'dashboard') renderWidgets(false);
      closeLayer(el); return toast('Widget gelöscht', {icon: 'trash'});
    }
    if (e.target.closest('#owGo')) {
      read(); if (o.titel.length < 2) return toast('Titel fehlt', {type: 'warn'});
      if (!(await preview())) return toast('Abfrage fehlerhaft', {t2: 'Vorschau prüfen', type: 'warn'});
      await saveSettings({'dash.eigene': [...ownWidgets().filter(x => x.id !== o.id), o]}, true);
      registerOwnWidgets(); delete EXT.data['own:' + o.id];
      if (!edit) { Dash.layout.unshift({id: uid(), t: 'own:' + o.id, s: W['own:' + o.id].sizes[0]}); Dash.preset = 'eigene'; saveLayout(); }
      closeLayer(el); $$('.layer').forEach(l => { if ($('#libList', l)) closeLayer(l); });
      if (S.view === 'dashboard') renderWidgets(false); else go('dashboard');
      toast(edit ? 'Widget gespeichert' : `„${o.titel}“ hinzugefügt`, {type: 'pos', icon: 'layout'});
      Hooks.emit('dashboard.widget.added', {widget: 'own', titel: o.titel});
    }
  });
}
document.addEventListener('click', e => { if (DESKTOP && e.target.closest('#libCustom')) { e.stopPropagation(); openWidgetBuilder(); } }, true);
