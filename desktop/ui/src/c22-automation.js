
/* ════════════════════════════════════════════════════════════════════
   32 · AUTOMATISIERUNG — Regeln (Auslöser → Bedingungen → Aktionen),
   Skripte (isoliert in einem Web-Worker ohne Zugriff auf App, Dateien
   oder Netz; Zeitlimit), Webhooks (signiert, mit Warteschlange),
   REST-API (Schlüssel, eigene Endpunkte) und Pakete (Export/Import).
   ════════════════════════════════════════════════════════════════════ */
const AU = {rules: [], scripts: [], hooks: [], queue: [], api: null};
const TRIGGERS = [
  ['pos.sale.completed', 'Verkauf abgeschlossen', ['beleg', 'summe', 'positionen', 'zahlungen', 'kunde']],
  ['pos.return.completed', 'Retoure gebucht', ['beleg', 'zu', 'betrag', 'grund', 'erstattung']],
  ['pos.sale.voided', 'Beleg storniert', ['beleg', 'zu', 'betrag', 'grund']],
  ['pos.customer.attached', 'Kunde an der Kasse zugeordnet', ['kunde', 'stufe']],
  ['pos.discount.applied', 'Rabatt gewährt', ['prozent', 'grund', 'freigabe']],
  ['customer.saved', 'Kunde gespeichert', ['kunde', 'neu']],
  ['catalog.article.saved', 'Artikel gespeichert', ['sku', 'name', 'neu']],
  ['inventory.booked', 'Bestand gebucht', ['sku', 'variante', 'menge', 'bestand']],
  ['inventory.finished', 'Inventur abgeschlossen', ['inventur']],
  ['purchasing.order.placed', 'Bestellung ausgelöst', ['bestellung']],
  ['purchasing.goods.received', 'Wareneingang gebucht', ['bestellung', 'stueck']],
  ['cash.moved', 'Einlage / Entnahme', ['art', 'betrag', 'grund']],
  ['cash.closing', 'Tagesabschluss', ['nr', 'umsatz', 'differenz']],
  ['loyalty.points.earned', 'Punkte gesammelt', ['kunde', 'punkte']],
  ['auth.login', 'Anmeldung', ['benutzer', 'rolle', 'methode']],
  ['auth.login.failed', 'Fehlgeschlagene Anmeldung', ['benutzer']],
  ['zeit.taeglich', 'Täglich zu einer Uhrzeit', ['datum', 'uhrzeit']],
];
const trigName = t => { if (t.startsWith('objekt.')) { const [, e, a] = t.split('.'); return `${entById(e)?.name || e} ${a === 'saved' ? 'gespeichert' : 'gelöscht'}`; } const b = t.split('@')[0]; return (TRIGGERS.find(x => x[0] === b)?.[1] || t) + (t.includes('@') ? ` · ${t.split('@')[1]} Uhr` : ''); };
const allTriggers = () => [...TRIGGERS, ...CF.ents.flatMap(e => [[`objekt.${e.id}.saved`, `${e.name} gespeichert`, ['id', 'neu', ...cfDefs('obj:' + e.id).map(d => d.key)]], [`objekt.${e.id}.deleted`, `${e.name} gelöscht`, ['id']]])];
const OPS = [['=', 'ist'], ['≠', 'ist nicht'], ['>', 'größer als'], ['<', 'kleiner als'], ['≥', 'mindestens'], ['≤', 'höchstens'], ['enthält', 'enthält'], ['leer', 'ist leer'], ['nicht leer', 'ist nicht leer']];
const ACTIONS = [['hinweis', 'Hinweis anzeigen', 'info'], ['mail', 'E-Mail senden', 'mail'], ['webhook', 'Webhook senden', 'zap'], ['punkte', 'Bonuspunkte buchen', 'star'], ['stufe', 'Kundenstufe setzen', 'users'], ['objekt', 'Datensatz anlegen', 'layers'], ['skript', 'Skript ausführen', 'code'], ['protokoll', 'Ins Protokoll schreiben', 'history']];

async function loadAutomation() {
  if (!DESKTOP) return;
  try { [AU.rules, AU.scripts] = await Promise.all([invoke('rules_list'), invoke('scripts_list')]); const w = await invoke('webhooks_list'); AU.hooks = w.hooks; AU.queue = w.queue; }
  catch (e) { console.error(e); }
}

/* ── Kontext & Vorlagen ── */
const getPath = (o, p) => String(p).split('.').reduce((x, k) => x == null ? undefined : x[k], o);
const tmpl = (s, ctx) => String(s ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, p) => { const v = getPath(ctx, p); return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); });
function ruleContext(evt, p) {
  const d = new Date();
  const ctx = {...p, ereignis: evt, datum: d.toLocaleDateString('de-AT'), uhrzeit: clock(), benutzer: S.user?.name, kasse: CFG['kasse.id'], filiale: CFG['firma.name']};
  const cid = typeof p.kunde === 'string' ? p.kunde : null, c = cid && CUSTOMERS.find(x => x.id === cid);
  if (c) Object.assign(ctx, {kunde_name: c.name, kunde_email: c.email, kunde_telefon: c.phone, kunde_stufe: c.tier, kunde_punkte: c.points, kunde_umsatz: c.revenue, feld: {...(c.fields || {})}});
  const a = p.sku && artById(p.sku);
  if (a) Object.assign(ctx, {artikel_name: a.name, artikel_marke: a.brand, artikel_preis: a.sale || a.price, artikel_bestand: a.stock, warengruppe: a.cat, feld: {...(ctx.feld || {}), ...(a.fields || {})}});
  return ctx;
}
function condOk(c, ctx) {
  const raw = getPath(ctx, c.feld), v = raw == null ? '' : String(raw), w = tmpl(c.wert, ctx);
  const n1 = typeof raw === 'number' ? raw : parseAmt(v), n2 = parseAmt(w), numeric = isFinite(n1) && isFinite(n2);
  switch (c.op) {
    case '=': return numeric ? n1 === n2 : norm(v) === norm(w);
    case '≠': return numeric ? n1 !== n2 : norm(v) !== norm(w);
    case '>': return numeric && n1 > n2; case '<': return numeric && n1 < n2;
    case '≥': return numeric && n1 >= n2; case '≤': return numeric && n1 <= n2;
    case 'enthält': return norm(Array.isArray(raw) ? raw.join(' ') : v).includes(norm(w));
    case 'leer': return !v.trim(); case 'nicht leer': return !!v.trim();
    default: return false;
  }
}

/* ── Skript-Sandbox: Web-Worker aus Blob, kein Zugriff auf Fenster, App-Schnittstelle oder Netzwerk ── */
function runScript(code, ereignis, daten, ms = 2000) {
  return new Promise(resolve => {
    const prelude = `"use strict";
const __acts = [], __log = [];
const __s = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const toast = (text, text2) => { __acts.push({typ: 'hinweis', text: __s(text), text2: __s(text2)}); };
const hinweis = toast;
const log = (...a) => { __log.push(a.map(__s).join(' ')); };
const mail = (an, betreff, text) => { __acts.push({typ: 'mail', an: __s(an), betreff: __s(betreff), text: __s(text)}); };
const punkte = (n, grund) => { __acts.push({typ: 'punkte', punkte: Math.round(Number(n) || 0), grund: __s(grund)}); };
const stufe = s => { __acts.push({typ: 'stufe', stufe: __s(s)}); };
const webhook = (id, daten) => { __acts.push({typ: 'webhook', hook: Number(id), daten: daten ?? null}); };
const objekt = (objektId, werte) => { __acts.push({typ: 'objekt', objekt: __s(objektId), werte: werte || {}}); };
const __post = postMessage.bind(self);
self.onmessage = async m => {
  const ereignis = m.data.e, daten = m.data.d;
  try {
    const r = await (async (fetch, XMLHttpRequest, WebSocket, EventSource, importScripts, indexedDB, caches, navigator, self, globalThis, postMessage, close) => {
`;
    const src = prelude + code + `
    })();
    __post({ok: true, actions: __acts, log: __log, result: r === undefined ? null : JSON.parse(JSON.stringify(r))});
  } catch (e) { __post({ok: false, error: String(e && e.message || e), actions: __acts, log: __log}); }
};`;
    let w, url, done = false;
    const fin = r => { if (done) return; done = true; try { w && w.terminate(); } catch { /* */ } url && URL.revokeObjectURL(url); resolve(r); };
    try { url = URL.createObjectURL(new Blob([src], {type: 'text/javascript'})); w = new Worker(url); }
    catch (e) { return fin({ok: false, error: 'Skript konnte nicht gestartet werden: ' + e.message, actions: [], log: []}); }
    w.onmessage = m => fin(m.data);
    w.onerror = e => { e.preventDefault(); fin({ok: false, error: e.message || 'Syntaxfehler im Skript', actions: [], log: []}); };
    setTimeout(() => fin({ok: false, error: `Zeitlimit überschritten (${ms / 1000} s)`, actions: [], log: []}), ms);
    w.postMessage({e: ereignis, d: JSON.parse(JSON.stringify(daten ?? {}))});
  });
}

/* ── Aktionen ausführen ── */
async function doAction(a, ctx, rule) {
  const custId = typeof ctx.kunde === 'string' ? ctx.kunde : null;
  switch (a.typ) {
    case 'hinweis': toast(tmpl(a.text, ctx) || 'Hinweis', {t2: tmpl(a.text2, ctx) || `Regel „${rule.name}“`, type: 'accent', icon: 'flow', dur: 7000}); return;
    case 'protokoll': Hooks.emit('rule.log', {regel: rule.name, text: tmpl(a.text, ctx)}); return;
    case 'mail': {
      const to = tmpl(a.an, ctx).trim(); if (!to) throw new Error('Kein Empfänger');
      if (!mailReady()) throw new Error('E-Mail-Versand nicht eingerichtet');
      const text = tmpl(a.text, ctx);
      await invoke('mail_send', {to, subject: tmpl(a.betreff, ctx) || `Kontor · ${rule.name}`, html: `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${esc(text).replace(/\n/g, '<br>')}</div>`, text, qr: null, purpose: 'regel'}); return;
    }
    case 'webhook': await invoke('webhook_fire', {id: +a.hook, event: ctx.ereignis, payload: a.daten ?? ctx}); return;
    case 'punkte': {
      if (!custId) throw new Error('Ereignis ohne Kunde');
      const n = Math.round(parseAmt(tmpl(a.punkte, ctx))); if (!n) return;
      const bal = await invoke('customer_points', {id: custId, delta: n, reason: tmpl(a.grund, ctx) || `Regel: ${rule.name}`, user: S.user.name, approvedBy: `Regel ${rule.name}`});
      const c = CUSTOMERS.find(x => x.id === custId); if (c) c.points = bal; return;
    }
    case 'stufe': {
      const c = custId && CUSTOMERS.find(x => x.id === custId); if (!c) throw new Error('Ereignis ohne Kunde');
      const tier = tmpl(a.stufe, ctx).trim(); if (!tier || c.tier === tier) return;
      Object.assign(c, custFromDb(await invoke('customer_save', {customer: custToDb({...c, tier}), user: `Regel ${rule.name}`}))); return;
    }
    case 'objekt': {
      const data = {}; Object.entries(a.werte || {}).forEach(([k, v]) => { data[k] = typeof v === 'string' ? tmpl(v, ctx) : v; });
      const r = await invoke('record_save', {entity: a.objekt, id: null, data, user: `Regel ${rule.name}`});
      Hooks.emit(`objekt.${a.objekt}.saved`, {id: r.id, neu: true, objekt: a.objekt, quelle: 'regel', ...r.data}); return;
    }
    case 'skript': {
      const s = AU.scripts.find(x => x.id === +a.skript); if (!s) throw new Error('Skript nicht gefunden');
      const r = await runScript(s.code, ctx.ereignis, ctx);
      for (const x of r.actions || []) await doAction({...x, daten: x.daten}, ctx, rule);
      if (r.log?.length) Hooks.emit('script.log', {skript: s.name, ausgabe: r.log.slice(0, 20)});
      if (!r.ok) throw new Error(`Skript „${s.name}“: ${r.error}`);
      return;
    }
  }
}
let ruleDepth = 0;
async function runRule(rule, evt, payload, {test = false} = {}) {
  const ctx = ruleContext(evt, payload || {});
  const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
  if (!conds.every(c => condOk(c, ctx))) return {matched: false};
  let error = null;
  ruleDepth++;
  try { for (const a of rule.actions || []) await doAction(a, ctx, rule); }
  catch (e) { error = String(e.message || e); toast(`Regel „${rule.name}“: Fehler`, {t2: error, type: 'warn', icon: 'flow', dur: 7000}); }
  finally { ruleDepth--; }
  if (!test && rule.id) { invoke('rule_ran', {id: rule.id, error}).catch(() => {}); rule.runs = (rule.runs || 0) + 1; rule.last_run = new Date().toISOString(); rule.last_error = error; }
  Hooks.emit('rule.applied', {regel: rule.name, ausloeser: evt, fehler: error || undefined});
  return {matched: true, error};
}
Hooks.on('*', (p, e) => {
  if (!DESKTOP || ruleDepth > 2 || /^(rule|config|script|webhook|test)\./.test(e.evt)) return;
  AU.rules.filter(r => r.active && r.trigger === e.evt).forEach(r => runRule(r, e.evt, p));
});
// Zeitgesteuerte Regeln (täglich HH:MM), geprüft jede Minute – einmal je Tag und Regel
setInterval(() => {
  if (!DESKTOP || !AU.rules.length) return;
  const d = new Date(), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`, day = d.toISOString().slice(0, 10), done = persist.get('rulesDaily', {});
  AU.rules.filter(r => r.active && r.trigger === 'zeit.taeglich@' + hm && done[r.id] !== day).forEach(r => { done[r.id] = day; persist.set('rulesDaily', done); runRule(r, 'zeit.taeglich', {datum: d.toLocaleDateString('de-AT'), uhrzeit: hm}); });
}, 30000);

/* ── UI: Regeln ── */
function renderApRules(box) {
  box.innerHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><span class="muted" style="font-size:12.5px">Wenn ein Ereignis eintritt und die Bedingungen erfüllt sind, führt Kontor die Aktionen aus.</span><span class="sp" style="flex:1"></span><button class="btn btn-primary btn-sm" id="apRuleNew">${ic('plus', 'i-sm')}Neue Regel</button></div>
    <div class="card">${AU.rules.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Regel</th><th>Wenn</th><th>Dann</th><th class="r">Ausgeführt</th><th>Aktiv</th></tr></thead><tbody>${AU.rules.map(r => `<tr data-rule="${r.id}" style="cursor:pointer"><td style="padding-left:16px"><b>${esc(r.name)}</b>${r.last_error ? `<div style="font-size:11.5px;color:var(--neg)">${ic('alert', 'i-xs')} ${esc(r.last_error)}</div>` : ''}</td><td>${esc(trigName(r.trigger))}${(r.conditions || []).length ? `<div class="muted" style="font-size:11.5px">${(r.conditions || []).map(c => `${esc(c.feld)} ${esc(OPS.find(o => o[0] === c.op)?.[1] || c.op)} ${['leer', 'nicht leer'].includes(c.op) ? '' : esc(c.wert)}`).join(' · und ')}</div>` : ''}</td><td>${(r.actions || []).map(a => `<span class="pill" style="margin:1px 2px 1px 0">${ic(ACTIONS.find(x => x[0] === a.typ)?.[2] || 'flow')}${esc(ACTIONS.find(x => x[0] === a.typ)?.[1] || a.typ)}</span>`).join('')}</td><td class="r num">${num(r.runs || 0)}${r.last_run ? `<div class="muted" style="font-size:11px">${esc(fmtTs(r.last_run))}</div>` : ''}</td><td><button class="switch" role="switch" data-ruleon="${r.id}" aria-checked="${r.active}" aria-label="Regel aktiv"></button></td></tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('flow')}</div><h3>Noch keine Regeln</h3><p>Beispiele: „Verkauf über € 500 → Dankes-Mail an Kund:in“, „Retoure mit Grund defekt → Mail an Einkauf“, „Täglich 18:00 → Webhook an Warenwirtschaft“.</p><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:8px"><button class="btn btn-secondary btn-sm" data-ruletpl="gross">${ic('star', 'i-sm')}Treuepunkte ab € 500</button><button class="btn btn-secondary btn-sm" data-ruletpl="retoure">${ic('mail', 'i-sm')}Retoure „defekt“ melden</button><button class="btn btn-secondary btn-sm" data-ruletpl="vip">${ic('users', 'i-sm')}VIP ab 5.000 Punkten</button></div></div>`}</div>`;
}
const RULE_TPL = {
  gross: {name: 'Bonuspunkte für große Einkäufe', trigger: 'pos.sale.completed', conditions: [{feld: 'summe', op: '≥', wert: '500'}, {feld: 'kunde', op: 'nicht leer', wert: ''}], actions: [{typ: 'punkte', punkte: '100', grund: 'Bonus Einkauf ab € 500'}, {typ: 'hinweis', text: '{{kunde_name}} erhält 100 Bonuspunkte', text2: 'Einkauf {{beleg}} über € {{summe}}'}]},
  retoure: {name: 'Defekte Ware an Einkauf melden', trigger: 'pos.return.completed', conditions: [{feld: 'grund', op: 'enthält', wert: 'defekt'}], actions: [{typ: 'mail', an: '', betreff: 'Retoure defekt: {{beleg}}', text: 'Retoure {{beleg}} zu Beleg {{zu}} über € {{betrag}}.\nGrund: {{grund}}\nKasse {{kasse}} · {{benutzer}}'}]},
  vip: {name: 'VIP-Stufe ab 5.000 Punkten', trigger: 'loyalty.points.earned', conditions: [{feld: 'kunde_punkte', op: '≥', wert: '5000'}], actions: [{typ: 'stufe', stufe: 'Gipfel-Club Gold'}]},
};
function openRuleEditor(rule, preset) {
  const st = JSON.parse(JSON.stringify(rule || preset || {name: '', trigger: 'pos.sale.completed', conditions: [], actions: [{typ: 'hinweis', text: '', text2: ''}], active: true}));
  if (!Array.isArray(st.conditions)) st.conditions = [];
  let time = st.trigger.startsWith('zeit.taeglich@') ? st.trigger.split('@')[1] : '18:00';
  const el = openLayer(`<div class="drawer-panel" style="width:min(720px,100%)" role="dialog" aria-modal="true" aria-label="Regel"><div id="ruHead"></div><div class="drawer-body" id="ruBody"></div>
    <div class="m-foot" style="border-top:1px solid var(--line);padding-top:14px">${rule ? `<button class="btn btn-danger" id="ruDel">${ic('trash', 'i-sm')}Löschen</button>` : ''}<button class="btn btn-ghost" id="ruTest">${ic('zap', 'i-sm')}Jetzt testen</button><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="ruSave">${ic('check', 'i-sm')}Speichern</button></div></div>`, {cls: 'drawer', focus: '#ruName'});
  const trigBase = () => st.trigger.split('@')[0];
  const vars = () => { const t = allTriggers().find(x => x[0] === trigBase()); return [...(t?.[2] || []), 'benutzer', 'kasse', 'datum', 'uhrzeit', ...(t?.[2] || []).includes('kunde') ? ['kunde_name', 'kunde_email', 'kunde_stufe', 'kunde_punkte', 'feld.<Kundenfeld>'] : [], ...(t?.[2] || []).includes('sku') ? ['artikel_name', 'artikel_preis', 'artikel_bestand', 'warengruppe'] : []]; };
  const actHTML = (a, i) => {
    const ctl = (k, ph, wide) => `<input class="input" data-ak="${k}" data-ai="${i}" value="${esc(a[k] ?? '')}" placeholder="${esc(ph)}" ${wide ? 'style="grid-column:1/-1"' : ''}>`;
    let body = '';
    if (a.typ === 'hinweis') body = ctl('text', 'Text, z. B. {{kunde_name}} hat Geburtstag', true) + ctl('text2', 'Zweite Zeile (optional)', true);
    else if (a.typ === 'protokoll') body = ctl('text', 'Text für das Protokoll', true);
    else if (a.typ === 'mail') body = ctl('an', 'An, z. B. {{kunde_email}} oder einkauf@firma.at') + ctl('betreff', 'Betreff') + `<textarea class="input" data-ak="text" data-ai="${i}" rows="3" style="grid-column:1/-1;height:auto;padding-top:9px" placeholder="Text – Platzhalter wie {{beleg}} möglich">${esc(a.text ?? '')}</textarea>`;
    else if (a.typ === 'webhook') body = `<select class="input select" data-ak="hook" data-ai="${i}">${AU.hooks.length ? AU.hooks.map(h => `<option value="${h.id}" ${+a.hook === h.id ? 'selected' : ''}>${esc(h.name || h.url)}</option>`).join('') : '<option value="">Zuerst unter „Webhooks“ ein Ziel anlegen</option>'}</select>`;
    else if (a.typ === 'punkte') body = ctl('punkte', 'Punkte, z. B. 100 oder -50') + ctl('grund', 'Grund');
    else if (a.typ === 'stufe') body = `<select class="input select" data-ak="stufe" data-ai="${i}">${[...new Set([...TIERS, a.stufe].filter(Boolean))].map(t => `<option ${t === a.stufe ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    else if (a.typ === 'skript') body = `<select class="input select" data-ak="skript" data-ai="${i}">${AU.scripts.length ? AU.scripts.map(s => `<option value="${s.id}" ${+a.skript === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('') : '<option value="">Zuerst unter „Skripte“ ein Skript anlegen</option>'}</select>`;
    else if (a.typ === 'objekt') {
      const ent = entById(a.objekt) || CF.ents[0]; if (ent && !a.objekt) a.objekt = ent.id;
      body = `<select class="input select" data-ak="objekt" data-ai="${i}">${CF.ents.length ? CF.ents.map(e => `<option value="${esc(e.id)}" ${a.objekt === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('') : '<option value="">Zuerst unter „Objekte“ ein Objekt anlegen</option>'}</select><span></span>`
        + (ent ? cfDefs('obj:' + ent.id).map(d => `<label class="field"><span>${esc(d.label)}</span><input class="input" data-aw="${esc(d.key)}" data-ai="${i}" value="${esc(a.werte?.[d.key] ?? '')}" placeholder="Wert oder {{platzhalter}}"></label>`).join('') : '');
    }
    return `<div class="card" style="padding:12px 14px;margin-bottom:8px;box-shadow:none"><div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><span class="reg-ic">${ic(ACTIONS.find(x => x[0] === a.typ)?.[2] || 'flow', 'i-sm')}</span><select class="input select" data-atyp="${i}" style="max-width:240px">${ACTIONS.map(([k, l]) => `<option value="${k}" ${k === a.typ ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="sp" style="flex:1"></span><button class="btn btn-ghost btn-sm btn-icon" data-arm="${i}" aria-label="Aktion entfernen">${ic('x', 'i-sm')}</button></div><div class="ed-grid">${body}</div></div>`;
  };
  const render = () => {
    $('#ruHead', el).innerHTML = `<div class="m-head" style="padding-bottom:14px"><div class="m-ic">${ic('flow')}</div><div><h2>${rule ? esc(rule.name) : 'Neue Regel'}</h2><p>${rule ? `${num(rule.runs || 0)} × ausgeführt${rule.last_run ? ' · zuletzt ' + esc(fmtTs(rule.last_run)) : ''}` : 'Wenn … und … dann …'}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>`;
    $('#ruBody', el).innerHTML = `
      <label class="field"><span>Name</span><input class="input" id="ruName" value="${esc(st.name)}" placeholder="z. B. Dankes-Mail ab € 300"></label>
      <div class="ed-sec"><div class="lab">Wenn</div><div style="display:flex;gap:8px"><select class="input select" id="ruTrig">${allTriggers().map(([k, l]) => `<option value="${esc(k)}" ${k === trigBase() ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${trigBase() === 'zeit.taeglich' ? `<input class="input" type="time" id="ruTime" value="${esc(time)}" style="max-width:130px">` : ''}</div>
        <div class="prompt-hint blk">${ic('braces', 'i-xs')}Ereignis <span class="mono">${esc(trigBase())}</span> · verfügbare Werte: ${vars().map(v => `<span class="mono">${esc(v)}</span>`).join(', ')}</div></div>
      <div class="ed-sec"><div class="lab">Und (alle Bedingungen) <button type="button" class="btn btn-ghost btn-sm" id="ruAddC">${ic('plus', 'i-sm')}Bedingung</button></div>
        ${st.conditions.map((c, i) => `<div class="frow" style="grid-template-columns:1fr 150px 1fr 36px"><input class="input" data-cf2="feld" data-ci="${i}" value="${esc(c.feld)}" placeholder="Wert, z. B. summe" list="ruVars"><select class="input select" data-cf2="op" data-ci="${i}">${OPS.map(([k, l]) => `<option value="${esc(k)}" ${k === c.op ? 'selected' : ''}>${l}</option>`).join('')}</select><input class="input" data-cf2="wert" data-ci="${i}" value="${esc(c.wert)}" placeholder="Vergleichswert" ${['leer', 'nicht leer'].includes(c.op) ? 'disabled' : ''}><button type="button" class="btn btn-ghost btn-icon" data-crm="${i}" aria-label="Bedingung entfernen">${ic('x', 'i-sm')}</button></div>`).join('') || '<div class="muted" style="font-size:12.5px">Ohne Bedingung läuft die Regel bei jedem Ereignis.</div>'}
        <datalist id="ruVars">${vars().filter(v => !v.includes('<')).map(v => `<option value="${esc(v)}">`).join('')}</datalist></div>
      <div class="ed-sec"><div class="lab">Dann <button type="button" class="btn btn-ghost btn-sm" id="ruAddA">${ic('plus', 'i-sm')}Aktion</button></div>${st.actions.map(actHTML).join('')}
        <div class="prompt-hint blk">${ic('info', 'i-xs')}Platzhalter mit doppelten geschweiften Klammern, z. B. <span class="mono">{{kunde_name}}</span>, <span class="mono">{{summe}}</span>, <span class="mono">{{feld.Schuhgröße}}</span>.</div></div>
      <div class="ed-sec"><div class="set-row" style="padding:12px 14px;border:1px solid var(--line);border-radius:12px"><div><div class="set-l">Regel aktiv</div><div class="set-h">Inaktive Regeln bleiben gespeichert</div></div><div class="set-c"><button type="button" class="switch" role="switch" id="ruOn" aria-checked="${st.active}" aria-label="Aktiv"></button></div></div></div>`;
  };
  const collect = () => {
    st.name = $('#ruName', el).value.trim(); const tr = $('#ruTrig', el).value; const tm = $('#ruTime', el); if (tm) time = tm.value || time;
    st.trigger = tr === 'zeit.taeglich' ? `zeit.taeglich@${time}` : tr;
    $$('[data-cf2]', el).forEach(i => { st.conditions[+i.dataset.ci][i.dataset.cf2] = i.value; });
    $$('[data-ak]', el).forEach(i => { st.actions[+i.dataset.ai][i.dataset.ak] = i.value; });
    $$('[data-aw]', el).forEach(i => { const a = st.actions[+i.dataset.ai]; (a.werte ||= {})[i.dataset.aw] = i.value; });
  };
  el.addEventListener('change', e => {
    if (e.target.id === 'ruTrig') { collect(); return render(); }
    const at = e.target.dataset.atyp; if (at != null) { collect(); st.actions[+at] = {typ: e.target.value}; return render(); }
    if (e.target.dataset.cf2 === 'op' || e.target.dataset.ak === 'objekt') { collect(); if (e.target.dataset.ak === 'objekt') st.actions[+e.target.dataset.ai].werte = {}; render(); }
  });
  el.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('#ruAddC')) { collect(); st.conditions.push({feld: '', op: '=', wert: ''}); return render(); }
    const cr = t.closest('[data-crm]'); if (cr) { collect(); st.conditions.splice(+cr.dataset.crm, 1); return render(); }
    if (t.closest('#ruAddA')) { collect(); st.actions.push({typ: 'hinweis', text: ''}); return render(); }
    const ar = t.closest('[data-arm]'); if (ar) { collect(); st.actions.splice(+ar.dataset.arm, 1); return render(); }
    if (t.closest('#ruOn')) { st.active = !st.active; return t.closest('#ruOn').setAttribute('aria-checked', st.active); }
    if (t.closest('#ruTest')) {
      collect();
      const sample = ruleSample(st.trigger.split('@')[0]);
      const ctx = ruleContext(st.trigger.split('@')[0], sample);
      const ok = st.conditions.every(c => condOk(c, ctx));
      const r = await askConfirm('Regel testen', `Beispieldaten: ${JSON.stringify(sample).slice(0, 220)}`, ok ? 'Bedingungen erfüllt – Aktionen jetzt wirklich ausführen?' : 'Bedingungen mit diesen Beispieldaten NICHT erfüllt.', ok ? 'Ausführen' : null);
      if (r) await runRule({...st, name: st.name || 'Test'}, st.trigger.split('@')[0], sample, {test: true});
      return;
    }
    if (t.closest('#ruDel')) {
      try { await needPerm('anpassen', 'Regel löschen', `„${rule.name}“ wird entfernt.`); AU.rules = await invoke('rule_delete', {id: rule.id}); } catch (err) { if (err?.message !== 'abgebrochen') toast('Nicht gelöscht', {t2: String(err), type: 'warn'}); return; }
      closeLayer(el); renderApBody(); return;
    }
    if (t.closest('#ruSave')) {
      collect();
      if (!st.name) return toast('Name fehlt', {type: 'warn'});
      if (!st.actions.length) return toast('Mindestens eine Aktion', {type: 'warn'});
      if (st.conditions.some(c => !c.feld.trim())) return toast('Bedingung ohne Wert-Feld', {type: 'warn'});
      try { AU.rules = await invoke('rule_save', {rule: {id: rule?.id ?? null, name: st.name, trigger: st.trigger, conditions: st.conditions, actions: st.actions, active: st.active, runs: rule?.runs || 0, last_run: rule?.last_run || null, last_error: null}}); }
      catch (err) { return toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      closeLayer(el); renderApBody(); toast('Regel gespeichert', {t2: `${st.name} · ${trigName(st.trigger)}`, type: 'pos', icon: 'flow'});
    }
  });
  render();
}
function ruleSample(trig) {
  const c = CUSTOMERS[0], a = ART[0];
  const s = {
    'pos.sale.completed': {beleg: `${YEAR}-000999`, summe: 549.9, positionen: 2, zahlungen: ['bar'], kunde: c?.id || null},
    'pos.return.completed': {beleg: `${YEAR}-001000`, zu: `${YEAR}-000999`, betrag: 89.9, grund: 'Ware defekt', erstattung: 'bar'},
    'pos.sale.voided': {beleg: `${YEAR}-001001`, zu: `${YEAR}-000999`, betrag: 549.9, grund: 'Fehlbuchung'},
    'pos.customer.attached': {beleg: `${YEAR}-000999`, kunde: c?.id, stufe: c?.tier},
    'customer.saved': {kunde: c?.id, neu: false}, 'loyalty.points.earned': {kunde: c?.id, punkte: 55},
    'catalog.article.saved': {sku: a?.id, name: a?.name, neu: false}, 'inventory.booked': {sku: a?.id, variante: 'Beispiel', menge: 5, bestand: 7},
    'cash.closing': {nr: 'Z-0001', umsatz: 2450, differenz: 0}, 'cash.moved': {art: 'entnahme', betrag: 200, grund: 'Bank'},
    'zeit.taeglich': {datum: new Date().toLocaleDateString('de-AT'), uhrzeit: clock()},
  }[trig];
  if (s) return s;
  if (trig.startsWith('objekt.')) { const id = trig.split('.')[1], o = {id: 1, neu: true, objekt: id}; cfDefs('obj:' + id).forEach(d => { o[d.key] = d.type === 'auswahl' ? d.options[0] : d.type === 'zahl' || d.type === 'betrag' ? 10 : d.type === 'janein' ? false : 'Beispiel'; }); return o; }
  return {beispiel: true};
}
function askConfirm(title, text, q, yes) {
  return new Promise(resolve => {
    const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="m-head"><div class="m-ic">${ic('zap')}</div><div><h2>${esc(title)}</h2><p>${esc(q)}</p></div></div>
      <div class="m-body"><pre class="code" style="white-space:pre-wrap;font-size:11.5px;max-height:200px;overflow:auto">${esc(text)}</pre></div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>${yes ? 'Abbrechen' : 'Schließen'}</button>${yes ? `<button class="btn btn-primary" id="acYes">${esc(yes)}</button>` : ''}</div></div>`, {onClose: () => resolve(false)});
    const b = $('#acYes', el); if (b) b.onclick = () => { resolve(true); closeLayer(el); };
  });
}

/* ── UI: Skripte ── */
const SCRIPT_SAMPLE = `// Läuft isoliert (kein Zugriff auf Dateien, Netzwerk oder die App).
// Verfügbar: ereignis, daten, toast(text, zeile2), mail(an, betreff, text),
// punkte(anzahl, grund), stufe(name), webhook(id, daten), objekt(objektId, werte), log(...)

if (daten.summe >= 300 && daten.kunde_email) {
  mail(daten.kunde_email, 'Danke für Ihren Einkauf', \`Liebe:r \${daten.kunde_name}, danke für Ihren Einkauf über € \${daten.summe}!\`);
}
toast('Skript gelaufen', 'Beleg ' + daten.beleg);
`;
function renderApScripts(box) {
  box.innerHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><span class="muted" style="font-size:12.5px">JavaScript in einer Sandbox (Web-Worker, ohne Netz- und Dateizugriff, max. 2 s). Skripte werden über Regeln ausgelöst.</span><span class="sp" style="flex:1"></span><button class="btn btn-primary btn-sm" id="apScrNew">${ic('plus', 'i-sm')}Neues Skript</button></div>
    <div class="card">${AU.scripts.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Skript</th><th>Verwendet in</th><th class="r">Zeilen</th></tr></thead><tbody>${AU.scripts.map(s => `<tr data-scr="${s.id}" style="cursor:pointer"><td style="padding-left:16px"><b class="mono">${esc(s.name)}</b></td><td>${AU.rules.filter(r => (r.actions || []).some(a => a.typ === 'skript' && +a.skript === s.id)).map(r => esc(r.name)).join(' · ') || '<span class="muted">keiner Regel zugeordnet</span>'}</td><td class="r num">${s.code.split('\n').length}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic('code')}</div><h3>Noch keine Skripte</h3><p>Für alles, was mit Regeln allein nicht geht: Berechnungen, Verzweigungen, mehrere Aktionen abhängig von Werten.</p></div>`}</div>`;
}
function openScriptEditor(s) {
  const st = s ? {...s} : {name: 'mein-skript.js', code: SCRIPT_SAMPLE};
  const el = openLayer(`<div class="drawer-panel" style="width:min(820px,100%)" role="dialog" aria-modal="true" aria-label="Skript">
    <div class="m-head" style="padding-bottom:14px"><div class="m-ic">${ic('code')}</div><div style="flex:1"><input class="input mono" id="scName" value="${esc(st.name)}" style="max-width:320px"></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="drawer-body" style="display:grid;gap:12px;grid-template-rows:1fr auto">
      <textarea class="input mono" id="scCode" spellcheck="false" style="min-height:340px;height:100%;padding:12px;font-size:12.5px;line-height:1.55;resize:vertical;tab-size:2">${esc(st.code)}</textarea>
      <div><div style="display:flex;gap:8px;align-items:center"><select class="input select" id="scEvt" style="max-width:300px">${allTriggers().map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select><button class="btn btn-secondary btn-sm" id="scRun">${ic('zap', 'i-sm')}Probelauf</button><span class="muted" style="font-size:12px">Probelauf führt keine Aktionen aus – zeigt nur, was passieren würde.</span></div>
        <pre class="code" id="scOut" style="margin-top:10px;max-height:200px;overflow:auto;white-space:pre-wrap;font-size:11.5px">–</pre></div></div>
    <div class="m-foot" style="border-top:1px solid var(--line);padding-top:14px">${s ? `<button class="btn btn-danger" id="scDel">${ic('trash', 'i-sm')}Löschen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="scSave">${ic('check', 'i-sm')}Speichern</button></div></div>`, {cls: 'drawer', focus: '#scCode'});
  const ta = $('#scCode', el);
  ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const p = ta.selectionStart; ta.setRangeText('  ', p, ta.selectionEnd, 'end'); } });
  el.addEventListener('click', async e => {
    if (e.target.closest('#scRun')) {
      const evt = $('#scEvt', el).value, ctx = ruleContext(evt, ruleSample(evt)), out = $('#scOut', el);
      out.textContent = 'läuft …';
      const r = await runScript(ta.value, evt, ctx);
      out.textContent = `${r.ok ? '✓ fertig' : '✗ Fehler: ' + r.error}\n\nAktionen (${(r.actions || []).length}):\n${(r.actions || []).map(a => '  · ' + JSON.stringify(a)).join('\n') || '  –'}\n\nAusgabe:\n${(r.log || []).map(l => '  ' + l).join('\n') || '  –'}${r.result != null ? `\n\nRückgabe: ${JSON.stringify(r.result)}` : ''}`;
      return;
    }
    if (e.target.closest('#scDel')) {
      try { await needPerm('anpassen', 'Skript löschen', `„${s.name}“ wird entfernt.`); AU.scripts = await invoke('script_delete', {id: s.id}); } catch (err) { if (err?.message !== 'abgebrochen') toast('Nicht gelöscht', {t2: String(err), type: 'warn'}); return; }
      closeLayer(el); renderApBody(); return;
    }
    if (e.target.closest('#scSave')) {
      const name = $('#scName', el).value.trim();
      try { AU.scripts = await invoke('script_save', {script: {id: s?.id ?? null, name, code: ta.value}}); } catch (err) { return toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      closeLayer(el); renderApBody(); toast('Skript gespeichert', {t2: name, type: 'pos', icon: 'code'});
    }
  });
}

/* ── UI: Webhooks ── */
const QST = {offen: ['wartet', ''], ok: ['zugestellt', 'pos'], zugestellt: ['zugestellt', 'pos'], fehler: ['fehlgeschlagen', 'neg']};
function renderApHooks(box) {
  box.innerHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><span class="muted" style="font-size:12.5px">Kontor sendet Ereignisse als HTTP-POST (JSON) an freigegebene Ziele – signiert mit HMAC-SHA256, bei Fehlern automatisch wiederholt.</span><span class="sp" style="flex:1"></span><button class="btn btn-secondary btn-sm" id="apHookReload">${ic('sync', 'i-sm')}</button><button class="btn btn-primary btn-sm" id="apHookNew">${ic('plus', 'i-sm')}Neues Ziel</button></div>
    <div class="card">${AU.hooks.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Ziel</th><th>Ereignisse</th><th>Aktiv</th></tr></thead><tbody>${AU.hooks.map(h => `<tr data-hook="${h.id}" style="cursor:pointer"><td style="padding-left:16px"><b>${esc(h.name || 'Webhook')}</b><div class="mono muted" style="font-size:11.5px">${esc(h.url)}</div></td><td>${h.events.map(x => `<span class="pill" style="margin:1px 2px 1px 0">${esc(x)}</span>`).join('')}</td><td>${h.active ? '<span class="pill pos">aktiv</span>' : '<span class="pill">pausiert</span>'}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:40px 20px"><div class="empty-icon">${ic('zap')}</div><h3>Noch keine Webhooks</h3><p>z. B. Verkäufe an Ihr ERP, Onlineshop oder ein Automatisierungswerkzeug (n8n, Make, Power Automate) senden.</p></div>`}</div>
    <h3 style="font-size:14px;margin:22px 0 10px">Zustellungen <span class="muted" style="font-weight:400">· letzte 100</span></h3>
    <div class="card">${AU.queue.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Zeit</th><th>Ziel</th><th>Ereignis</th><th>Status</th><th class="r">Versuche</th><th></th></tr></thead><tbody>${AU.queue.map(q => { const [l, tone] = QST[q.status] || [q.status, '']; return `<tr><td style="padding-left:16px;white-space:nowrap" class="muted">${esc(fmtTs(q.created_at))}</td><td>${esc(q.webhook || '–')}</td><td class="mono" style="font-size:12px">${esc(q.event)}</td><td><span class="pill ${tone}" title="${esc(q.last_error || '')}">${l}${q.last_status ? ` · ${q.last_status}` : ''}</span>${q.last_error && q.status !== 'zugestellt' ? `<div class="muted" style="font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(q.last_error)}</div>` : ''}</td><td class="r num">${q.attempts}</td><td class="r" style="padding-right:12px">${q.status === 'fehler' || (q.status === 'offen' && q.attempts) ? `<button class="btn btn-ghost btn-sm" data-qretry="${q.id}">Erneut</button>` : ''}</td></tr>`; }).join('')}</tbody></table>`
      : '<div class="empty" style="padding:24px"><p>Noch keine Zustellungen.</p></div>'}</div>`;
}
async function reloadHooks() { try { const w = await invoke('webhooks_list'); AU.hooks = w.hooks; AU.queue = w.queue; } catch (e) { console.error(e); } if (AP.tab === 'webhooks') renderApBody(); }
function openHookEditor(h) {
  const st = h ? {...h, events: [...h.events]} : {name: '', url: 'https://', events: ['pos.sale.completed'], active: true};
  const el = openLayer(`<div class="modal" style="width:min(620px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column" role="dialog" aria-modal="true" aria-label="Webhook"><div id="whBox" style="display:flex;flex-direction:column;min-height:0"></div></div>`, {focus: '#whName'});
  const box = $('#whBox', el);
  const collect = () => { st.name = $('#whName', el).value.trim(); st.url = $('#whUrl', el).value.trim(); };
  const render = () => {
    const evs = [['*', 'Alle Ereignisse'], ...allTriggers().filter(t => t[0] !== 'zeit.taeglich').map(t => [t[0], t[1]]), ['pos.*', 'Alles an der Kasse'], ['inventory.*', 'Alles zum Bestand']];
    box.innerHTML = `<div class="m-head"><div class="m-ic">${ic('zap')}</div><div><h2>${h ? esc(h.name || 'Webhook') : 'Neues Webhook-Ziel'}</h2><p>POST · JSON · Header X-Kontor-Event und X-Kontor-Signature</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:14px;overflow:auto">
        <div class="ed-grid"><label class="field"><span>Name</span><input class="input" id="whName" value="${esc(st.name)}" placeholder="z. B. ERP"></label><label class="field"><span>Ziel-URL</span><input class="input mono" id="whUrl" value="${esc(st.url)}" placeholder="https://…"></label></div>
        <div><div class="field"><span>Ereignisse</span></div><div class="reasons" style="margin-top:6px">${evs.map(([k, l]) => `<button class="chip" data-wev="${esc(k)}" aria-pressed="${st.events.includes(k)}" title="${esc(k)}">${esc(l)}</button>`).join('')}</div></div>
        ${h ? `<div><div class="field"><span>Geheimnis für die Signatur (HMAC-SHA256 über den Rohtext)</span></div><div style="display:flex;gap:6px;margin-top:6px"><input class="input mono" readonly value="${esc(h.secret)}" id="whSec"><button class="btn btn-secondary btn-sm" id="whCopy">${ic('copy', 'i-sm')}</button></div><div class="prompt-hint blk">${ic('info', 'i-xs')}Prüfung beim Empfänger: <span class="mono">X-Kontor-Signature == "sha256=" + hex(hmac_sha256(geheimnis, body))</span></div></div>` : ''}
        <div class="set-row" style="padding:10px 0;border-bottom:0"><div><div class="set-l">Aktiv</div><div class="set-h">Pausierte Ziele erhalten nichts</div></div><div class="set-c"><button class="switch" role="switch" id="whOn" aria-checked="${st.active}" aria-label="Aktiv"></button></div></div>
      </div>
      <div class="m-foot">${h ? `<button class="btn btn-danger" id="whDel">${ic('trash', 'i-sm')}</button><button class="btn btn-ghost" id="whTest">${ic('zap', 'i-sm')}Test senden</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="whSave">${ic('check', 'i-sm')}Speichern</button></div>`;
  };
  el.addEventListener('click', async e => {
    const ev = e.target.closest('[data-wev]'); if (ev) { collect(); const k = ev.dataset.wev, i = st.events.indexOf(k); i >= 0 ? st.events.splice(i, 1) : st.events.push(k); return render(); }
    if (e.target.closest('#whOn')) { st.active = !st.active; return e.target.closest('#whOn').setAttribute('aria-checked', st.active); }
    if (e.target.closest('#whCopy')) return navigator.clipboard?.writeText(h.secret).then(() => toast('Kopiert', {type: 'pos', icon: 'copy', dur: 1500}));
    if (e.target.closest('#whTest')) { try { await invoke('webhook_test', {id: h.id}); toast('Test eingereiht', {t2: 'Zustellung in wenigen Sekunden – siehe „Zustellungen“', icon: 'zap'}); closeLayer(el); setTimeout(reloadHooks, 6500); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } return; }
    if (e.target.closest('#whDel')) { try { await needPerm('anpassen', 'Webhook löschen', `Ziel ${h.url} wird entfernt.`); await invoke('webhook_delete', {id: h.id}); } catch (err) { if (err?.message !== 'abgebrochen') toast('Nicht gelöscht', {t2: String(err), type: 'warn'}); return; } closeLayer(el); reloadHooks(); return; }
    if (e.target.closest('#whSave')) {
      collect();
      try { const w = await invoke('webhook_save', {hook: {id: h?.id ?? null, name: st.name, url: st.url, events: st.events, secret: '', active: st.active}}); AU.hooks = w.hooks; AU.queue = w.queue; }
      catch (err) { return toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      closeLayer(el); renderApBody(); toast('Webhook gespeichert', {t2: st.url, type: 'pos', icon: 'zap'});
    }
  });
  render();
}

/* ── UI: REST-API ── */
async function renderApApi(box) {
  box.innerHTML = '<div class="card" style="padding:18px"><span class="thinking"><b>Lade …</b></span></div>';
  try { AU.api = await invoke('api_status'); } catch (e) { box.innerHTML = `<div class="card" style="padding:18px">${esc(String(e))}</div>`; return; }
  const a = AU.api, on = !!a.running, port = +CFG['api.port'] || 8787, lan = !!CFG['api.lan'];
  const base = a.running ? `http://${a.running.replace('0.0.0.0', CFG['api.lan'] ? '<IP-dieses-PCs>' : '127.0.0.1')}` : `http://127.0.0.1:${port}`;
  const ex = a.keys.find(k => k.active);
  box.innerHTML = `<div class="card">
      <div class="set-row"><div><div class="set-l">REST-API ${on ? '<span class="pill pos" style="height:20px">läuft</span>' : '<span class="pill" style="height:20px">aus</span>'}</div><div class="set-h">${on ? `Erreichbar unter <span class="mono">${esc(base)}/api/v1</span>` : 'Für Onlineshop, Warenwirtschaft, BI-Werkzeuge, eigene Apps'}</div></div><div class="set-c"><button class="switch" role="switch" id="apiOn" aria-checked="${on}" aria-label="API aktiv"></button></div></div>
      <div class="set-row"><div><div class="set-l">Port</div></div><div class="set-c"><input class="input num" id="apiPort" type="number" min="1024" max="65535" value="${port}" style="max-width:110px"></div></div>
      <div class="set-row" style="border-bottom:0"><div><div class="set-l">Aus dem Netzwerk erreichbar</div><div class="set-h">Aus: nur auf diesem PC (127.0.0.1). Ein: auch von anderen Geräten im Firmennetz – Windows-Firewall-Freigabe nötig, nur mit Schlüssel.</div></div><div class="set-c"><button class="switch" role="switch" id="apiLan" aria-checked="${lan}" aria-label="Netzwerk"></button></div></div></div>
    <h3 style="font-size:14px;margin:22px 0 10px;display:flex;align-items:center">API-Schlüssel<span class="sp" style="flex:1"></span><button class="btn btn-primary btn-sm" id="apiKeyNew">${ic('plus', 'i-sm')}Schlüssel erzeugen</button></h3>
    <div class="card">${a.keys.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Name</th><th>Schlüssel</th><th>Rechte</th><th>Zuletzt benutzt</th><th></th></tr></thead><tbody>${a.keys.map(k => `<tr style="${k.active ? '' : 'opacity:.5'}"><td style="padding-left:16px"><b>${esc(k.name)}</b><div class="muted" style="font-size:11px">${esc(fmtTs(k.created_at))}</div></td><td class="mono" style="font-size:12px">${esc(k.prefix)}…</td><td>${k.scopes.map(s => `<span class="pill">${esc(s)}</span>`).join(' ')}</td><td class="muted" style="font-size:12px">${k.last_used ? esc(fmtTs(k.last_used)) : '–'}</td><td class="r" style="padding-right:12px">${k.active ? `<button class="btn btn-ghost btn-sm" data-krev="${k.id}">Widerrufen</button>` : '<span class="muted" style="font-size:12px">widerrufen</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:24px"><p>Noch kein Schlüssel – jede Anfrage braucht einen.</p></div>'}</div>
    <h3 style="font-size:14px;margin:22px 0 10px;display:flex;align-items:center">Eigene Endpunkte<span class="sp" style="flex:1"></span><button class="btn btn-secondary btn-sm" id="apiEpNew">${ic('plus', 'i-sm')}Endpunkt</button></h3>
    <div class="card">${a.endpoints.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px">Adresse</th><th>Titel</th><th>Parameter</th><th>Aktiv</th></tr></thead><tbody>${a.endpoints.map(p => `<tr data-ep="${p.id}" style="cursor:pointer"><td style="padding-left:16px" class="mono">/api/v1/eigene/${esc(p.slug)}</td><td>${esc(p.title)}</td><td class="mono" style="font-size:12px">${p.params.map(x => '?' + esc(x) + '=').join(' ') || '–'}</td><td>${p.active ? ic('check', 'i-sm') : '–'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:24px"><p>Eigene Endpunkte liefern das Ergebnis einer gespeicherten, schreibgeschützten Abfrage – z. B. Bestand je Marke für den Onlineshop.</p></div>'}</div>
    <h3 style="font-size:14px;margin:22px 0 10px">Schnittstellen</h3>
    <div class="card"><table class="tbl" style="margin:0"><tbody>${Object.entries(a.openapi.paths).flatMap(([p, ms]) => Object.entries(ms).map(([m, d]) => `<tr><td style="padding-left:16px;width:70px"><span class="pill ${m === 'get' ? 'info' : 'accent'}">${m.toUpperCase()}</span></td><td class="mono" style="font-size:12px">${esc(p)}</td><td style="font-size:12.5px">${esc(d.summary)}</td><td class="muted" style="font-size:12px">${esc(d['x-berechtigung'])}</td></tr>`)).join('')}</tbody></table>
      <div style="padding:12px 16px;border-top:1px solid var(--line)"><div class="muted" style="font-size:12px;margin-bottom:6px">Beispiel</div><pre class="code" style="white-space:pre-wrap;font-size:11.5px">curl -H "Authorization: Bearer ${ex ? esc(ex.prefix) + '…' : 'ktr_…'}" ${esc(base)}/api/v1/artikel?q=jacke
curl ${esc(base)}/api/v1/openapi.json   # Beschreibung (OpenAPI 3)</pre></div></div>`;
}
async function apiApply(on) {
  const port = clamp(parseInt($('#apiPort')?.value, 10) || 8787, 1024, 65535), lan = $('#apiLan')?.getAttribute('aria-checked') === 'true';
  try { const r = await invoke('api_toggle', {on, lan, port}); Object.assign(CFG, {'api.aktiv': on, 'api.lan': lan, 'api.port': port}); toast(on ? 'REST-API gestartet' : 'REST-API gestoppt', {t2: r || '', type: on ? 'pos' : '', icon: 'server'}); }
  catch (e) { toast('API nicht gestartet', {t2: String(e), type: 'warn', dur: 7000}); }
  renderApBody();
}
function openKeyCreate() {
  const st = {name: '', scopes: ['lesen']};
  const el = openLayer(`<div class="modal" style="width:min(520px,100%)" role="dialog" aria-modal="true" aria-label="API-Schlüssel"><div id="akBox"></div></div>`, {focus: '#akName'});
  const render = key => {
    $('#akBox', el).innerHTML = key ? `<div class="m-head"><div class="m-ic" style="color:var(--pos)">${ic('check')}</div><div><h2>Schlüssel erzeugt</h2><p>Jetzt kopieren – er wird nur dieses eine Mal angezeigt.</p></div></div>
      <div class="m-body"><div style="display:flex;gap:6px"><input class="input mono" readonly value="${esc(key)}" id="akKey"><button class="btn btn-primary btn-sm" id="akCopy">${ic('copy', 'i-sm')}Kopieren</button></div></div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Fertig</button></div>`
      : `<div class="m-head"><div class="m-ic">${ic('lock')}</div><div><h2>Neuer API-Schlüssel</h2><p>Für jede Anwendung einen eigenen Schlüssel – einzeln widerrufbar</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:14px"><label class="field"><span>Name</span><input class="input" id="akName" placeholder="z. B. Onlineshop"></label>
        <div><div class="field"><span>Rechte</span></div><div class="reasons" style="margin-top:6px"><button class="chip" data-sc="lesen" aria-pressed="${st.scopes.includes('lesen')}">Lesen</button><button class="chip" data-sc="schreiben" aria-pressed="${st.scopes.includes('schreiben')}">Schreiben (Bestand, Kunden, Objekte)</button></div></div></div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="akGo">${ic('check', 'i-sm')}Erzeugen</button></div>`;
  };
  el.addEventListener('click', async e => {
    const sc = e.target.closest('[data-sc]'); if (sc) { st.name = $('#akName', el).value; const k = sc.dataset.sc, i = st.scopes.indexOf(k); i >= 0 ? st.scopes.splice(i, 1) : st.scopes.push(k); render(); $('#akName', el).value = st.name; return; }
    if (e.target.closest('#akCopy')) return navigator.clipboard?.writeText($('#akKey', el).value).then(() => toast('Kopiert', {type: 'pos', icon: 'copy', dur: 1500}));
    if (e.target.closest('#akGo')) {
      st.name = $('#akName', el).value.trim();
      try { await needPerm('anpassen', 'API-Schlüssel erzeugen', `Zugriff „${st.scopes.join(' + ')}“ für ${st.name || '…'}`); const key = await invoke('api_key_create', {name: st.name, scopes: st.scopes}); render(key); renderApBody(); }
      catch (err) { if (err?.message !== 'abgebrochen') toast('Nicht erzeugt', {t2: String(err), type: 'warn'}); }
    }
  });
  render();
}
function openEndpointEditor(p) {
  const st = p ? {...p} : {slug: '', title: '', sql: "SELECT a.brand AS marke, SUM(v.stock) AS bestand\nFROM variants v JOIN articles a ON a.id = v.article_id\nWHERE a.active = 1\nGROUP BY a.brand ORDER BY bestand DESC", active: true};
  const el = openLayer(`<div class="drawer-panel" style="width:min(760px,100%)" role="dialog" aria-modal="true" aria-label="Endpunkt">
    <div class="m-head" style="padding-bottom:14px"><div class="m-ic">${ic('server')}</div><div><h2>${p ? '/api/v1/eigene/' + esc(p.slug) : 'Neuer Endpunkt'}</h2><p>Nur lesende Abfragen (SELECT) · Parameter als <span class="mono">:name</span> → <span class="mono">?name=</span></p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="drawer-body" style="display:grid;gap:12px">
      <div class="ed-grid"><label class="field"><span>Adresse</span><input class="input mono" id="epSlug" value="${esc(st.slug)}" placeholder="bestand-je-marke"></label><label class="field"><span>Titel</span><input class="input" id="epTitle" value="${esc(st.title)}" placeholder="Bestand je Marke"></label></div>
      <label class="field"><span>Abfrage (SQL)</span><textarea class="input mono" id="epSql" spellcheck="false" style="min-height:180px;padding:12px;font-size:12.5px;line-height:1.5;resize:vertical">${esc(st.sql)}</textarea></label>
      <div class="prompt-hint blk">${ic('info', 'i-xs')}Tabellen u. a.: articles, variants, stock_moves, sales, customers, suppliers, purchase_orders, po_lines, vouchers, closings, records (eigene Objekte, Spalte data als JSON – z. B. <span class="mono">json_extract(data,'$.status')</span>)</div>
      <div style="display:flex;gap:8px;align-items:center"><input class="input mono" id="epArgs" placeholder='Testwerte als JSON, z. B. {"ean":"9012…"}' style="flex:1"><button class="btn btn-secondary btn-sm" id="epTest">${ic('zap', 'i-sm')}Testen</button></div>
      <div id="epOut" class="card" style="max-height:260px;overflow:auto;box-shadow:none"></div>
      <div class="set-row" style="padding:10px 0;border-bottom:0"><div><div class="set-l">Aktiv</div></div><div class="set-c"><button class="switch" role="switch" id="epOn" aria-checked="${st.active}" aria-label="Aktiv"></button></div></div></div>
    <div class="m-foot" style="border-top:1px solid var(--line);padding-top:14px">${p ? `<button class="btn btn-danger" id="epDel">${ic('trash', 'i-sm')}Löschen</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="epSave">${ic('check', 'i-sm')}Speichern</button></div></div>`, {cls: 'drawer', focus: '#epSlug'});
  el.addEventListener('click', async e => {
    if (e.target.closest('#epOn')) { st.active = !st.active; return e.target.closest('#epOn').setAttribute('aria-checked', st.active); }
    if (e.target.closest('#epTest')) {
      let args = {}; try { const t = $('#epArgs', el).value.trim(); if (t) args = JSON.parse(t); } catch { return toast('Testwerte: ungültiges JSON', {type: 'warn'}); }
      const out = $('#epOut', el);
      try { const rows = await invoke('api_query_test', {sql: $('#epSql', el).value, args}); const cols = rows.length ? Object.keys(rows[0]) : [];
        out.innerHTML = rows.length ? `<div class="muted" style="font-size:12px;padding:8px 12px">${num(rows.length)} Zeilen</div><table class="tbl" style="margin:0"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 50).map(r => `<tr>${cols.map(c => `<td style="font-size:12.5px">${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div style="padding:12px" class="muted">Keine Zeilen</div>'; }
      catch (err) { out.innerHTML = `<div style="padding:12px;color:var(--neg)">${esc(String(err))}</div>`; }
      return;
    }
    if (e.target.closest('#epDel')) { try { await invoke('api_endpoint_delete', {id: p.id}); } catch (err) { return toast('Fehler', {t2: String(err), type: 'warn'}); } closeLayer(el); renderApBody(); return; }
    if (e.target.closest('#epSave')) {
      try { await invoke('api_endpoint_save', {id: p?.id ?? null, slug: $('#epSlug', el).value, title: $('#epTitle', el).value, sql: $('#epSql', el).value, active: st.active}); }
      catch (err) { return toast('Nicht gespeichert', {t2: String(err), type: 'warn', dur: 7000}); }
      closeLayer(el); renderApBody(); toast('Endpunkt gespeichert', {type: 'pos', icon: 'server'});
    }
  });
}

/* ── UI: Pakete (Anpassungen exportieren / importieren) ── */
function renderApPackages(box) {
  box.innerHTML = `<div class="card">
    <div class="set-row"><div><div class="set-l">Anpassungen exportieren</div><div class="set-h">Felder, Objekte, Regeln, Skripte und Webhook-Ziele (ohne Geheimnisse, ohne Datensätze) als JSON-Paket – zum Sichern, Weitergeben oder Übertragen auf eine andere Kasse.</div></div><div class="set-c"><button class="btn btn-primary btn-sm" id="pkExp">${ic('download', 'i-sm')}Exportieren</button></div></div>
    <div class="set-row" style="border-bottom:0"><div><div class="set-l">Paket importieren</div><div class="set-h">Bestehende Einträge mit gleichem Namen werden aktualisiert, neue ergänzt. Nichts wird gelöscht.</div></div><div class="set-c"><button class="btn btn-secondary btn-sm" id="pkImp">${ic('boxes', 'i-sm')}Importieren …</button></div></div></div>
    <div class="prompt-hint blk" style="margin-top:10px">${ic('info', 'i-xs')}Format <span class="mono">kontor.paket/v1</span> · Pakete sind lesbares JSON und können versioniert werden.</div>`;
}
async function exportPackage() {
  const pkg = {format: 'kontor.paket/v1', erstellt: new Date().toISOString(), version: S.appVersion, firma: CFG['firma.name'],
    objekte: CF.ents.map(({id, name, plural, icon, title_field}) => ({id, name, plural, icon, title_field})),
    felder: CF.defs.map(({object, key, label, type, options, required, at_pos, help, pos}) => ({object, key, label, type, options, required, at_pos, help, pos})),
    regeln: AU.rules.map(({name, trigger, conditions, actions, active}) => ({name, trigger, conditions, actions, active})),
    skripte: AU.scripts.map(({name, code}) => ({name, code})),
    webhooks: AU.hooks.map(({name, url, events, active}) => ({name, url, events, active}))};
  try { const p = await invoke('save_text', {name: `Kontor_Anpassungen_${new Date().toISOString().slice(0, 10)}.json`, content: JSON.stringify(pkg, null, 2), title: 'Anpassungen exportieren'}); if (p) toast('Paket exportiert', {t2: p, type: 'pos', icon: 'download'}); }
  catch (e) { toast('Export fehlgeschlagen', {t2: String(e), type: 'warn'}); }
}
async function importPackage() {
  let txt; try { txt = await invoke('open_text', {title: 'Paket importieren', ext: 'json'}); } catch (e) { return toast('Datei nicht lesbar', {t2: String(e), type: 'warn'}); }
  if (!txt) return;
  let pkg; try { pkg = JSON.parse(txt); if (pkg.format !== 'kontor.paket/v1') throw new Error('Kein Kontor-Paket'); } catch (e) { return toast('Ungültiges Paket', {t2: e.message, type: 'warn'}); }
  try { await needPerm('anpassen', 'Paket importieren', `${(pkg.objekte || []).length} Objekte · ${(pkg.felder || []).length} Felder · ${(pkg.regeln || []).length} Regeln · ${(pkg.skripte || []).length} Skripte · ${(pkg.webhooks || []).length} Webhooks`); } catch { return; }
  const n = {o: 0, f: 0, r: 0, s: 0, w: 0}, errs = [];
  for (const o of pkg.objekte || []) { try { CF.ents = await invoke('entity_save', {entity: {...o, count: 0}}); n.o++; } catch (e) { errs.push(`Objekt ${o.name}: ${e}`); } }
  for (const f of pkg.felder || []) { const ex = CF.defs.find(d => d.object === f.object && d.key === f.key); try { CF.defs = await invoke('field_save', {field: {...f, id: ex?.id ?? null}}); n.f++; } catch (e) { errs.push(`Feld ${f.label}: ${e}`); } }
  for (const s of pkg.skripte || []) { const ex = AU.scripts.find(x => x.name === s.name); try { AU.scripts = await invoke('script_save', {script: {...s, id: ex?.id ?? null}}); n.s++; } catch (e) { errs.push(`Skript ${s.name}: ${e}`); } }
  for (const r of pkg.regeln || []) { const ex = AU.rules.find(x => x.name === r.name); try { AU.rules = await invoke('rule_save', {rule: {...r, id: ex?.id ?? null, runs: ex?.runs || 0, last_run: ex?.last_run || null, last_error: null}}); n.r++; } catch (e) { errs.push(`Regel ${r.name}: ${e}`); } }
  for (const w of pkg.webhooks || []) { const ex = AU.hooks.find(x => x.url === w.url); try { const res = await invoke('webhook_save', {hook: {...w, id: ex?.id ?? null, secret: ''}}); AU.hooks = res.hooks; n.w++; } catch (e) { errs.push(`Webhook ${w.url}: ${e}`); } }
  syncObjNav(); renderApBody();
  toast(errs.length ? 'Paket teilweise importiert' : 'Paket importiert', {t2: `${n.o} Objekte · ${n.f} Felder · ${n.r} Regeln · ${n.s} Skripte · ${n.w} Webhooks${errs.length ? ' · ' + errs[0] : ''}`, type: errs.length ? 'warn' : 'pos', icon: 'boxes', dur: 8000});
  Hooks.emit('config.package.imported', {...n, fehler: errs.length});
}

function bindAutomation() {
  $('#view-anpassen').addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('#apRuleNew')) return openRuleEditor(null);
    const rt = t.closest('[data-ruletpl]'); if (rt) return openRuleEditor(null, RULE_TPL[rt.dataset.ruletpl]);
    const ro = t.closest('[data-ruleon]'); if (ro) { e.stopPropagation(); const r = AU.rules.find(x => x.id === +ro.dataset.ruleon); try { AU.rules = await invoke('rule_save', {rule: {...r, active: !r.active}}); } catch (err) { return toast('Fehler', {t2: String(err), type: 'warn'}); } return renderApBody(); }
    const ru = t.closest('[data-rule]'); if (ru) return openRuleEditor(AU.rules.find(x => x.id === +ru.dataset.rule));
    if (t.closest('#apScrNew')) return openScriptEditor(null);
    const sc = t.closest('[data-scr]'); if (sc) return openScriptEditor(AU.scripts.find(x => x.id === +sc.dataset.scr));
    if (t.closest('#apHookNew')) return openHookEditor(null);
    if (t.closest('#apHookReload')) return reloadHooks();
    const qr = t.closest('[data-qretry]'); if (qr) { try { await invoke('webhook_retry', {id: +qr.dataset.qretry}); toast('Erneut eingereiht', {icon: 'sync'}); setTimeout(reloadHooks, 6000); } catch (err) { toast('Fehler', {t2: String(err), type: 'warn'}); } return; }
    const hk = t.closest('[data-hook]'); if (hk) return openHookEditor(AU.hooks.find(x => x.id === +hk.dataset.hook));
    if (t.closest('#apiOn')) { const on = t.closest('#apiOn').getAttribute('aria-checked') !== 'true'; if (on) { try { await needPerm('anpassen', 'REST-API einschalten', 'Andere Programme können mit einem Schlüssel auf Daten zugreifen.'); } catch { return; } } return apiApply(on); }
    if (t.closest('#apiLan')) { const sw = t.closest('#apiLan'); sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); if (AU.api?.running) apiApply(true); else saveSettings({'api.lan': sw.getAttribute('aria-checked') === 'true'}, true); return; }
    if (t.closest('#apiKeyNew')) return openKeyCreate();
    const kr = t.closest('[data-krev]'); if (kr) { try { await needPerm('anpassen', 'Schlüssel widerrufen', 'Anwendungen mit diesem Schlüssel verlieren sofort den Zugriff.'); await invoke('api_key_revoke', {id: +kr.dataset.krev}); } catch { return; } return renderApBody(); }
    if (t.closest('#apiEpNew')) return openEndpointEditor(null);
    const ep = t.closest('[data-ep]'); if (ep) return openEndpointEditor(AU.api.endpoints.find(x => x.id === +ep.dataset.ep));
    if (t.closest('#pkExp')) return exportPackage();
    if (t.closest('#pkImp')) return importPackage();
  });
  $('#view-anpassen').addEventListener('change', e => { if (e.target.id === 'apiPort') { if (AU.api?.running) apiApply(true); else saveSettings({'api.port': clamp(parseInt(e.target.value, 10) || 8787, 1024, 65535)}, true); } });
}
