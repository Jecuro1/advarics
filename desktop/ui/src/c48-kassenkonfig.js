/* ═════════════════════════════════════════════════════════════════
   48 · KASSEN-KONFIGURATION (Liste und Bearbeiten-Seite mit Reitern)
   Jede Einstellung hier wirkt an der Kasse – siehe c50-kassen-wirkung.js
   ═════════════════════════════════════════════════════════════════ */
const KK_DEFAULTS = {name: '',
  // Prozesse nutzen (Menüpunkte und Kassenfunktionen ein-/ausblenden)
  rechnung: true, auswahl: true, reservierung: true, kundenbest: true, umlagerung: true, bstKorrektur: true, reklamation: true, zeiterfassung: true, kampagnen: true, hilfe: true,
  verkaufParken: true, umtausch: true, gutscheinVerkauf: true, letzterBeleg: true, barEinlage: true, abschoepfung: true, hotItems: true,
  // Allgemein
  inaktivMin: 0, abfrageMenge: 0, ladeBareinlage: true, ladeAbschoepfung: false, ladeZusatz: false, rabLimit: 20,
  // Beleg
  bKopf: '', bSumm: 'Bonrabatt', bPosRabatt: 'Rabatt', rueckgeldText: 'Rückgeld', wechselgeldNicht: false, gesamtTeile: false, vkBelegende: false, alleRabatte: false, agb: '',
  // Zuordnungen
  rabatte: [], zahlungsarten: [], stdZahlart: 'bar',
  // Passwörter (Hash), welches Passwort welche Aktion schützt
  pw1h: '', pw2h: '', pwTagesabschluss: '', pwStorno: '', pwLade: '', pwKassenbuch: '',
  // Listen
  scanRegeln: [], hotcats: [], belegzusatz: [], pflicht: [], aiNull: true};
/* Zahlungsarten der Kasse = die Zahlungsarten, die der Bezahl-Dialog anbietet */
const KK_TYP = {cash: 'Bar', card: 'Karte', wallet: 'Wallet', qr: 'QR / Online', voucher: 'Gutschein'};
STAMM_DEF.kassenzahlart = {t: 'Zahlungsarten (Kasse)', ic: 'card', sub: 'Zahlungsarten der Kasse', cols: [{k: 'name', l: 'Bezeichnung'}],
  get seed() { return (typeof BASE_METHODS !== 'undefined' ? BASE_METHODS : METHODS).map(m => ({id: m.id, name: m.label, typ: KK_TYP[m.kind] || 'Sonstige', lade: m.kind === 'cash'})); }};
const zaRows = () => stRows('kassenzahlart').map(r => ({id: r.id, name: r.name, typ: r.typ || '', lade: !!r.lade, _raw: r}));
const KK_ZA_COLS = [{k: 'name', l: 'Bezeichnung', w: 200}, {k: 'typ', l: 'Typ', w: 150}, {k: 'lade', l: 'Kassenlade öffnen', t: 'check', w: 170}];
STAMM_DEF.kassenkonfig = {t: 'Kassen-Konfiguration', ic: 'register', sub: 'Konfigurationen der Kassen', cols: [{k: 'name', l: 'Name'}], seed: [{id: 'KK1', ...JSON.parse(JSON.stringify({...KK_DEFAULTS, name: 'Standard'}))}]};
const KK = {id: null, ids: [], draft: null, tab: 'prozess', dirty: false};
const KK_TABS = [['prozess', 'Prozesse Nutzen'], ['allg', 'Allgemein'], ['druck', 'Beleg-Druck'], ['beleginfo', 'Beleg Zusatzinformationen'], ['rabatt', 'Feste Rabatte'], ['zahl', 'Zahlungsarten'], ['scan', 'Scan-Regeln'], ['hot', 'Hot Items'], ['pw', 'Passwort-Verwaltung'], ['pflicht', 'Pflichteingaben'], ['artinfo', 'Artikel-Info']];
const kkLoad = id => {
  const r = id ? stRows('kassenkonfig').find(x => x.id === id) : null;
  const d = JSON.parse(JSON.stringify({...KK_DEFAULTS, ...(r || {})}));
  if (!r) d.zahlungsarten = stRows('kassenzahlart').map(x => x.id);
  const valid = new Set(stRows('kassenzahlart').map(x => x.id));
  d.rabatte = d.rabatte || []; d.zahlungsarten = (d.zahlungsarten || []).filter(i => valid.has(i)); if (!d.zahlungsarten.length) d.zahlungsarten = [...valid];
  if (!valid.has(d.stdZahlart)) d.stdZahlart = d.zahlungsarten.includes('bar') ? 'bar' : d.zahlungsarten[0];
  return d;
};
function kkOpen(id, ids) {
  KK.id = id; KK.ids = ids || KK.ids; KK.draft = kkLoad(id); KK.tab = 'prozess'; KK.dirty = false;
  if (S.view === 'einst-kassenkonfig-edit') PAGES['einst-kassenkonfig-edit'].render(); else go('einst-kassenkonfig-edit');
}
const SW = (k, l, hint) => [k, l, 'check', null, hint];
const KK_CARDS = {
  prozess: () => [['Menüs und Seiten', [SW('rechnung', 'Kundenrechnungen', 'Menü Verkauf › Faktura › Kundenrechnungen'), SW('auswahl', 'Auswahlverwaltung', 'Menü Verkauf › Auswahlverwaltung'), SW('reservierung', 'Reservierungen', 'Menü Verkauf › Reservierungen'), SW('kundenbest', 'Kundenbestellungen'), SW('umlagerung', 'Umlagerungen', 'Menü Artikel › Umlagerungen'), SW('bstKorrektur', 'Bestandskorrektur'), SW('reklamation', 'Reklamationen', 'Menü Retourenmanagement › Reklamation'), SW('zeiterfassung', 'Zeiterfassung'), SW('kampagnen', 'Kampagnen', 'Menü Marketing › Kampagnen'), SW('hilfe', 'Hilfe', 'Menü Service › Hilfe')]],
    ['Funktionen an der Kasse', [SW('verkaufParken', 'Verkauf parken', 'Taste F8 und Knöpfe im Warenkorb'), SW('umtausch', 'Umtausch / Retoure', 'Eintrag „Mehr“ an der Kasse'), SW('gutscheinVerkauf', 'Gutschein verkaufen', 'Eintrag „Mehr“ an der Kasse'), SW('letzterBeleg', 'Belegkopie drucken', 'Eintrag „Mehr“ an der Kasse'), SW('barEinlage', 'Bar-Einlage', 'Kassenbuch'), SW('abschoepfung', 'Abschöpfung', 'Kassenbuch'), SW('hotItems', 'Hot Items einblenden', 'Warengruppen-Schnellwahl über dem Artikelraster')]]],
  allg: () => [['Kasse', [['inaktivMin', 'Automatisch sperren nach (Minuten ohne Eingabe)', 'num', null, '0 = nie. Danach ist die PIN erforderlich'], ['abfrageMenge', 'Rückfrage ab Artikelmenge', 'num', null, '0 = nie. Verhindert Tippfehler bei der Stückzahl'], ['rabLimit', 'Rabattgrenze ohne Freigabe (%)', 'num', null, 'Rabatte darüber erfordern die Filialleitung (gilt für diese Konfiguration)']]],
    ['Kassenlade', [SW('ladeBareinlage', 'Bei Bar-Einlage öffnen'), SW('ladeAbschoepfung', 'Bei Abschöpfung öffnen'), SW('ladeZusatz', 'Bei Wechselgeld zu Tagesbeginn öffnen')]]],
  pw: () => [['Passwörter', [['pw1in', 'Passwort 1 ' + (KK.draft.pw1h ? '(gesetzt) – neu eingeben zum Ändern' : '(nicht gesetzt)'), 'pw', 'Neues Passwort', 'Wird nur als Prüfsumme gespeichert'], ['pw2in', 'Passwort 2 ' + (KK.draft.pw2h ? '(gesetzt) – neu eingeben zum Ändern' : '(nicht gesetzt)'), 'pw', 'Neues Passwort']]],
    ['Welche Aktion ist geschützt?', [['pwTagesabschluss', 'Tagesabschluss', 'select', () => KK_PWOPT, 'Vor dem Abschluss wird das Passwort abgefragt'], ['pwStorno', 'Retoure und Bon-Storno', 'select', () => KK_PWOPT], ['pwLade', 'Kassenlade manuell öffnen', 'select', () => KK_PWOPT], ['pwKassenbuch', 'Kassenbuch (Einlage, Entnahme)', 'select', () => KK_PWOPT]]]],
  artinfo: () => [['Artikel-Info', [SW('aiNull', '0-Bestände in der Bestandsmatrix anzeigen', 'Aus: leere Felder statt „0“ in Artikelinfo und Artikelinfo Kompakt')]]],
  druck: () => [['Bezeichnungen auf dem Bon', [['bKopf', 'Bon-Überschrift', 'text', null, 'z. B. „Verkaufs-Beleg“ – leer = keine Überschrift'], ['bSumm', 'Bezeichnung Bonrabatt', 'text'], ['bPosRabatt', 'Bezeichnung Positionsrabatt', 'text'], ['rueckgeldText', 'Bezeichnung Rückgeld', 'text']]],
    ['Inhalt', [SW('gesamtTeile', 'Gesamtzahl der Teile andrucken'), SW('vkBelegende', 'Verkäufer am Belegende drucken'), SW('alleRabatte', 'Alle Rabatte zusammenfassen', 'Eine Summenzeile statt Rabatt unter jeder Position'), SW('wechselgeldNicht', 'Rückgeld nicht andrucken')]],
    ['AGB', [['agb', 'Text am Ende des Bons', 'area', null, 'z. B. Umtausch- und Garantiebedingungen']]]]
};
const KK_PWOPT = [['', 'Kein Passwort'], ['1', 'Passwort 1'], ['2', 'Passwort 2']];
const kkHost = '<div data-kk style="flex:1;min-height:420px;display:flex;flex-direction:column"></div>';
const KK_RABATT_COLS = [{k: 'name', l: 'Bezeichnung', w: 220}, {k: 'pct', l: 'Rabatt %', t: 'num', w: 110, fmt: v => num(v) + ' %'}, {k: 'freigabe', l: 'Freigabe nötig', t: 'check', w: 150}];
function kkRender() {
  const host = $('#view-einst-kassenkonfig-edit'); if (!host) return;
  const D = KK.draft, pos = KK.ids.indexOf(KK.id), el = document.createElement('div'); el.className = 'ae'; host.replaceChildren(el);
  const btn = (a, icon, l, dis) => `<button class="ag-btn" data-kk-a="${a}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}<span>${l}</span></button>`;
  let body = '', mount = null;
  const dirty = () => { KK.dirty = true; $$('[data-kk-a="save"],[data-kk-a="undo"]', el).forEach(b => { b.disabled = false; }); };
  const nameCard = `<div class="ea-cols"><div class="ae-card ea-card"><div class="ea-fields">${fxField(D, ['name', 'Name der Konfiguration *', 'text', null, 'Die Konfiguration wird einer Kasse unter Kassen › Allgemein zugewiesen'])}</div></div></div>`;
  if (KK_CARDS[KK.tab]) body = (KK.tab === 'prozess' ? nameCard : '') + fxCards(D, KK_CARDS[KK.tab]());
  else if (KK.tab === 'rabatt') {
    body = `<p class="ea-hint" style="margin:0 0 8px">An der Kasse stehen nur die zugeordneten festen Rabatte zur Schnellwahl. Ist nichts zugeordnet, stehen alle zur Verfügung.</p>${kkHost}`;
    mount = () => fxPair($('[data-kk]', el), D, 'rabatte', () => stActive('festerrabatt').map(r => ({id: r.id, name: r.name || r.id, pct: +r.pct || 0, freigabe: !!r.freigabe})), KK_RABATT_COLS, dirty, kkRender);
  } else if (KK.tab === 'beleginfo') {
    body = `<p class="ea-hint" style="margin:0 0 8px">Diese Zusatzinformationen werden beim Bezahlen abgefragt. Ist nichts zugeordnet, werden alle abgefragt.</p>${kkHost}`;
    mount = () => fxPair($('[data-kk]', el), D, 'belegzusatz', () => stActive('belegzusatz').map(r => ({id: r.id, name: r.name || r.id, typ: r.typ || '', pflicht: !!r.pflicht})), [{k: 'name', l: 'Zusatzinformation', w: 240}, {k: 'typ', l: 'Art', w: 120}, {k: 'pflicht', l: 'Pflicht', t: 'check', w: 100}], dirty, kkRender);
  } else if (KK.tab === 'hot') {
    body = `<p class="ea-hint" style="margin:0 0 8px">Zugeordnete Warengruppen erscheinen an der Kasse zuerst in der Warengruppen-Leiste (in der Reihenfolge der Zuordnung).</p>${kkHost}`;
    mount = () => fxPair($('[data-kk]', el), D, 'hotcats', () => CATS.filter(c => c.id !== 'alle' && ART.some(a => a.cat === c.id)).map(c => ({id: c.id, name: c.name, n: ART.filter(a => a.cat === c.id).length})), [{k: 'name', l: 'Warengruppe', w: 240}, {k: 'n', l: 'Artikel', t: 'num', w: 100}], dirty, kkRender);
  } else if (KK.tab === 'pflicht') {
    body = `<p class="ea-hint" style="margin:0 0 8px">Zugeordnete Felder sind beim Anlegen und Ändern eines Kunden Pflicht (Verkauf › Kunden).</p>${kkHost}`;
    mount = () => fxPair($('[data-kk]', el), D, 'pflicht', () => KK_PFLICHT, [{k: 'name', l: 'Kundenfeld', w: 240}], dirty, kkRender);
  } else if (KK.tab === 'scan') {
    body = `<p class="ea-hint" style="margin:0 0 8px">Regeln, wie gescannte Codes gelesen werden: Passt die Code-Länge, wird ab „Start Position“ die „Gelesene Länge“ als Artikelcode (EAN) verwendet. Bei höherer Sortierung zuerst.</p>${kkHost}`;
    mount = () => kkSub($('[data-kk]', el), 'scan', dirty);
  } else if (KK.tab === 'zahl') {
    body = `<div class="ea-cols"><div class="ae-card ea-card"><h4>Standard-Zahlungsart</h4><div class="ea-fields"><label class="field"><span>Vorgewählte Zahlungsart *</span><select class="input select" data-fx="stdZahlart">${stRows('kassenzahlart').map(z => `<option value="${esc(z.id)}" ${z.id === D.stdZahlart ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select><small class="ea-hint">Wird beim Bezahlen zuerst gewählt</small></label></div></div></div><p class="ea-hint" style="margin:8px 0">Im Bezahl-Dialog erscheinen nur die zugeordneten Zahlungsarten. „Kassenlade öffnen“ steuert, bei welchen Zahlungsarten die Lade aufspringt (Doppelklick auf eine Zeile).</p>${kkHost}`;
    mount = () => fxPair($('[data-kk]', el), D, 'zahlungsarten', zaRows, KK_ZA_COLS, dirty, kkRender);
  }
  el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', 'Übersicht: Kassen-Konfiguration')}${btn('refresh', 'sync', 'Aktualisieren', !KK.id)}${btn('save', 'check', 'Sichern', !KK.dirty)}${btn('new', 'plus', 'Neu', !KK.id)}${btn('undo', 'undo', 'Änderungen zurücknehmen', !KK.dirty)}${btn('del', 'trash', 'Löschen', !KK.id)}
      <span class="sp"></span>${KK.id ? `${btn('prev', 'chevron-left', '', pos <= 0)}<span class="ae-nr">${pos + 1}/${KK.ids.length}</span>${btn('next', 'chevron-right', '', pos >= KK.ids.length - 1)}` : ''}</div>
    <div class="ae-tabsw"><div class="ed-tabs">${KK_TABS.map(([k, l]) => `<button type="button" class="ed-tab" data-kk-t="${k}" aria-selected="${KK.tab === k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="ae-body"><div id="edBody">${body}</div></div>`;
  fxBind(el, D, dirty);
  if (mount) mount();
  el.addEventListener('click', async e => {
    const tb = e.target.closest('[data-kk-t]'), b = e.target.closest('[data-kk-a]');
    if (tb) { KK.tab = tb.dataset.kkT; return kkRender(); }
    if (!b || b.disabled) return;
    const a = b.dataset.kkA, ask = async () => !KK.dirty || await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen');
    if (a === 'back') { if (!await ask()) return; KK.dirty = false; return go('einst-kassenkonfig'); }
    if (a === 'refresh' || a === 'undo') { await loadStamm(true); KK.draft = kkLoad(KK.id); KK.dirty = false; return kkRender(); }
    if (a === 'new') { if (!await ask()) return; return kkOpen(null, KK.ids); }
    if (a === 'prev' || a === 'next') { if (!await ask()) return; const id = KK.ids[pos + (a === 'next' ? 1 : -1)]; if (id) kkOpen(id); return; }
    try {
      await needPerm('einstellungen', 'Kassen-Konfiguration');
      const all = stRows('kassenkonfig').map(x => ({...x}));
      if (a === 'save') {
        if (!String(D.name).trim()) { KK.tab = 'prozess'; kkRender(); return toast('Name angeben', {t2: 'Pflichtfeld', type: 'warn'}); }
        if (!D.zahlungsarten.length) { KK.tab = 'zahl'; kkRender(); return toast('Mindestens eine Zahlungsart zuordnen', {type: 'warn'}); }
        if (!D.zahlungsarten.includes(D.stdZahlart)) { KK.tab = 'zahl'; kkRender(); return toast('Die Standard-Zahlungsart muss zugeordnet sein', {type: 'warn'}); }
        for (const n of ['1', '2']) { const v = D['pw' + n + 'in']; if (v) D['pw' + n + 'h'] = await kkSha(v); delete D['pw' + n + 'in']; }
        for (const k of ['pwTagesabschluss', 'pwStorno', 'pwLade', 'pwKassenbuch']) if (D[k] && !D['pw' + D[k] + 'h']) { KK.tab = 'pw'; kkRender(); return toast(`Passwort ${D[k]} ist noch nicht gesetzt`, {type: 'warn'}); }
        D.rabLimit = clamp(+D.rabLimit || 0, 0, 100); D.inaktivMin = Math.max(0, +D.inaktivMin || 0); D.abfrageMenge = Math.max(0, +D.abfrageMenge || 0);
        const row = JSON.parse(JSON.stringify(D)), list = KK.id ? all.map(x => x.id === KK.id ? {...x, ...row} : x) : [...all, {id: 'kk-' + aeUid(), _aktiv: true, ...row}];
        await stammSave('kassenkonfig', list); KK.dirty = false; if (!KK.id) { KK.id = list[list.length - 1].id; KK.ids = [...KK.ids, KK.id]; }
        toast('Gespeichert', {t2: D.name, type: 'pos', icon: 'check', dur: 1800}); return kkRender();
      }
      if (a === 'del') {
        if (all.length < 2) return toast('Die letzte Konfiguration kann nicht gelöscht werden', {type: 'warn'});
        if (stRows('kasse').some(k => k.konfig === D.name)) return toast('Konfiguration wird von einer Kasse verwendet', {type: 'warn'});
        if (!await confirmBox(`Kassen-Konfiguration „${D.name}“ löschen?`, 'Löschen')) return; await stammSave('kassenkonfig', all.filter(x => x.id !== KK.id)); KK.dirty = false; go('einst-kassenkonfig');
      }
    } catch (err) { if (err && String(err.message || err) !== 'abgebrochen') toast('Nicht möglich', {t2: String(err.message || err), type: 'warn'}); }
  });
}
agridPage('einst-kassenkonfig', {
  title: 'Kassen-Konfiguration', count: () => stRows('kassenkonfig').length, sort: {k: 'name', dir: 1},
  rows: () => stRows('kassenkonfig').map(r => ({id: r.id, name: r.name || '', kassen: stRows('kasse').filter(k => k.konfig === r.name).length})),
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}, {k: 'new', l: 'Neu', icon: 'plus'}],
  cols: [{k: 'name', l: 'Name', w: 320}, {k: 'kassen', l: 'Anzahl Kassen', t: 'num', w: 150}],
  actions: {back: e2Back, refresh: async () => { await loadStamm(true); PAGES['einst-kassenkonfig'].render(); }, new: () => kkOpen(null, [])},
  edit: id => kkOpen(id, (AG['einst-kassenkonfig'].filtered || []).map(r => r.id)),
  remove: async ids => { if (!await confirmBox(`${num(ids.length)} Konfiguration löschen?`, 'Löschen')) throw new Error('abgebrochen'); await needPerm('einstellungen', 'Kassen-Konfiguration'); const s = new Set(ids), rest = stRows('kassenkonfig').filter(r => !s.has(r.id)); if (!rest.length) throw new Error('Die letzte Konfiguration kann nicht gelöscht werden'); await stammSave('kassenkonfig', rest.map(r => ({...r}))); },
});
registerPage('einst-kassenkonfig-edit', {title: 'Kassen-Konfiguration', sub: () => KK.draft ? (KK.draft.name || 'neu') : '', render: async () => { await loadStamm(); if (!KK.draft) KK.draft = kkLoad(KK.id); kkRender(); }});
VIEW_PERM['einst-kassenkonfig'] = VIEW_PERM['einst-kassenkonfig-edit'] = 'einstellungen';
/* Zahlungsarten als eigene Liste (Menü Einstellungen › Zahlungsarten) */
const KK_PFLICHT = [['name', 'Name'], ['email', 'E-Mail'], ['phone', 'Telefon'], ['street', 'Straße'], ['zip', 'PLZ'], ['city', 'Ort'], ['uid', 'UID-Nummer']].map(([id, name]) => ({id, name}));
const KK_SUBS = {scan: {cols: () => [{k: 'sort', l: 'Sortierung', t: 'num', w: 120}, {k: 'laenge', l: 'Code-Länge', t: 'num', w: 120}, {k: 'start', l: 'Start Position', t: 'num', w: 140}, {k: 'gelesen', l: 'Gelesene Länge', t: 'num', w: 150}], neu: true, del: true, store: 'scanRegeln',
  validate: o => (+o.laenge > 0 && +o.start >= 1 && +o.gelesen > 0 && +o.start + +o.gelesen - 1 <= +o.laenge) ? '' : 'Code-Länge, Start Position (ab 1) und Gelesene Länge müssen zusammenpassen',
  fields: () => [{k: 'sort', l: 'Sortierung', t: 'num'}, {k: 'laenge', l: 'Code-Länge', t: 'num', req: true}, {k: 'start', l: 'Start Position (ab 1)', t: 'num', req: true}, {k: 'gelesen', l: 'Gelesene Länge', t: 'num', req: true}]}};
function kkSub(host, tab, dirty) {
  const D = {...KK_SUBS[tab]}, S = KK.draft, st = D.store; S[st] ||= []; S.sub ||= {}; S.sub[tab] = S[st];
  fxSubGrid(host, S, tab, () => { S[st] = S.sub[tab]; dirty(); }, {[tab]: {...D, template: () => []}});
}
async function zaEdit(id, done) {
  const all = stRows('kassenzahlart'), r = all.find(x => x.id === id); if (!r) return;
  const o = await aeForm(`Zahlungsart [ ${r.name} ]`, [{k: 'name', l: 'Bezeichnung', ro: true}, {k: 'typ', l: 'Typ', ro: true}, {k: 'lade', l: 'Kassenlade öffnen', t: 'check'}], r); if (!o) return;
  try { await needPerm('einstellungen', 'Zahlungsarten'); await stammSave('kassenzahlart', all.map(x => x.id === id ? {...x, lade: !!o.lade} : {...x})); done && done(); } catch (err) { if (err && String(err.message || err) !== 'abgebrochen') toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
}
agridPage('einst-zahlungsarten', {
  title: 'Zahlungsarten & Kassenlade', rows: zaRows, count: () => stRows('kassenzahlart').length, sort: {k: 'name', dir: 1},
  toolbar: [{k: 'back', l: 'Zurück', icon: 'chevron-left'}, {k: 'refresh', l: 'Aktualisieren', icon: 'sync'}], cols: KK_ZA_COLS,
  actions: {back: e2Back, refresh: async () => { await loadStamm(true); PAGES['einst-zahlungsarten'].render(); }},
  edit: (id, done) => zaEdit(id, done)
});
VIEW_PERM['einst-zahlungsarten'] = 'einstellungen';
const kkSha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kontor:' + s)))].map(b => b.toString(16).padStart(2, '0')).join('');
