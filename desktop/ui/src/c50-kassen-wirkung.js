/* ═════════════════════════════════════════════════════════════════
   50 · WIRKUNG DER KASSEN-KONFIGURATION
   Die Konfiguration der Kasse dieses Arbeitsplatzes (Kassen › Allgemein) steuert
   Menüs, Kassenfunktionen, Zahlungsarten, Rabatte, Kassenlade und Bon.
   ═════════════════════════════════════════════════════════════════ */
const kkKasse = () => (typeof stRows === 'function' ? stRows('kasse') : []).find(kaLokal) || null;
const kkActive = () => { const all = stRows('kassenkonfig'), k = kkKasse(); return all.find(c => c.name === k?.konfig) || all[0] || null; };
const kkOn = flag => { const c = kkActive(); return !c || !(flag in c) ? !!KK_DEFAULTS[flag] : !!c[flag]; };
const kkVal = (key, d = '') => { const c = kkActive(), v = c?.[key]; return v === undefined || v === null ? (KK_DEFAULTS[key] ?? d) : v; };

/* 1) Menüpunkte je Prozess ein-/ausblenden */
const KK_VIEWFLAG = {};
[['reservierung', 'reservierungen', 'reservierung-neu'], ['auswahl', 'auswahl', 'auswahl-neu', 'auswahl-summen'], ['rechnung', 'rechnungen'], ['kundenbest', 'kundenbestellungen'], ['umlagerung', 'umlagerungen', 'ul-neu', 'ul-protokoll', 'ul-positionen', 'ul-planung', 'ul-anforderung', 'ul-rechnung', 'ul-ungebucht', 'ul-kompakt'], ['bstKorrektur', 'bestandskorrektur'], ['reklamation', 'reklamationen', 'reklamation-neu'], ['zeiterfassung', 'zeiterfassung'], ['kampagnen', 'kampagnen'], ['hilfe', 'hilfe']]
  .forEach(([flag, ...views]) => views.forEach(v => { KK_VIEWFLAG[v] = flag; }));
const kkOff = view => { const f = KK_VIEWFLAG[view]; return !!f && !kkOn(f); };
{ const _pn = permNav;
  permNav = function () {
    _pn.apply(this, arguments);
    const nav = $('#nav'); if (!nav) return;
    $$('.nav-item[data-view]', nav).forEach(n => { if (kkOff(n.dataset.view)) n.classList.add('nav-off'); });
    $$('.nav-kids', nav).reverse().forEach(k => { const any = [...k.children].some(c => (c.matches('[data-view]') || c.matches('.nav-kids')) && !c.classList.contains('nav-off')); if (!any) { k.classList.add('nav-off'); k.previousElementSibling?.classList.add('nav-off'); } });
    $$('.nav-sec', nav).forEach(sec => { if (!sec.querySelector('[data-view]:not(.nav-off)')) sec.classList.add('nav-off'); });
  };
  const _go = go;
  go = function (view) { if (S.started && kkOff(view)) { toast('Funktion ist in der Kassen-Konfiguration deaktiviert', {t2: TITLES[view] || view, type: 'warn'}); return; } return _go.apply(this, arguments); };
}

/* 2) Funktionen an der Kasse */
{ const _om = openMore;
  openMore = function () {
    const r = _om.apply(this, arguments);
    const off = {gs: !kkOn('gutscheinVerkauf'), ret: !(kkOn('umtausch') || kkOn('reklamation')), copy: !kkOn('letzterBeleg'), book: !(kkOn('barEinlage') || kkOn('abschoepfung'))};
    Object.entries(off).forEach(([m, o]) => { if (o) $$(`[data-m="${m}"]`).forEach(b => b.remove()); });
    return r;
  };
  const _park = park;
  park = function () { if (!kkOn('verkaufParken')) return toast('Parken ist in der Kassen-Konfiguration deaktiviert', {type: 'warn'}); return _park.apply(this, arguments); };
  const _rp = renderPOS;
  renderPOS = function () { const r = _rp.apply(this, arguments); if (!kkOn('verkaufParken')) $$('#parkBtn, #park2Btn, [data-fk="park"]').forEach(b => b.remove()); return r; };
}
const kkBuchungOk = kind => kind === 'anfang' || (kind === 'einlage' ? kkOn('barEinlage') : kind === 'entnahme' ? kkOn('abschoepfung') : true);
const kkLadeBuchung = kind => kind === 'einlage' ? kkOn('ladeBareinlage') : kind === 'entnahme' ? kkOn('ladeAbschoepfung') : kkOn('ladeZusatz');

/* 3) Zahlungsarten, Standard-Zahlungsart, Kassenlade je Zahlungsart */
const kkZahlSet = () => { const ok = new Set(stRows('kassenzahlart').map(x => x.id)), z = (kkActive()?.zahlungsarten || []).filter(i => ok.has(i)); return z.length ? new Set(z) : null; };
const kkLade = m => { const z = stRows('kassenzahlart').find(x => x.id === m); return z ? !!z.lade : m === 'bar'; };
{ const _am = applyMethods;
  applyMethods = function () {
    _am.apply(this, arguments);
    const set = kkZahlSet(); if (!set) return;
    METHODS.forEach(m => { if (!set.has(m.id)) m.hidden = true; });
    if (METHODS.every(m => m.hidden)) METHODS.forEach(m => { m.hidden = false; });
  };
  const _op = openPayment;
  openPayment = function () {
    const r = _op.apply(this, arguments);
    const std = kkVal('stdZahlart', 'bar'), m = METHODS.find(x => x.id === std);
    if (PAY && m && !m.hidden && PAY.method !== std && !PAY.parts.length) { PAY.method = std; renderMethods(); renderMethodPanel(); }
    return r;
  };
}

/* 4) Feste Rabatte und Rabattgrenze */
const kkRabattOk = id => { const r = kkActive()?.rabatte; return !r?.length || r.includes(id); };
const kkApplyFlow = () => { const c = kkActive(); if (c && c.rabLimit != null && c.rabLimit !== '') POS.flow.approvalPct = clamp(+c.rabLimit || 0, 0, 100); };

/* 5) Bon: Bezeichnungen und Inhalt */
{ const _ro = receiptOps;
  receiptOps = function (rec) {
    let ops = _ro.apply(this, arguments); if (!kkActive()) return ops;
    const kind = rec.kind || 'verkauf', neg = kind === 'retoure' || kind === 'storno';
    const kopf = String(kkVal('bKopf', '')).trim(), summ = kkVal('bSumm', 'Bonrabatt'), posr = kkVal('bPosRabatt', 'Rabatt'), rg = kkVal('rueckgeldText', 'Rückgeld');
    ops = ops.map(o => {
      if (o.t === 'lr' && /^Bonrabatt /.test(o.l)) return {...o, l: o.l.replace(/^Bonrabatt/, summ)};
      if (o.t === 'lr' && /^ {2}Rabatt /.test(o.l)) return {...o, l: o.l.replace(/^ {2}Rabatt/, '  ' + posr)};
      if (o.t === 'lr' && o.l === 'Rückgeld') return {...o, l: rg};
      return o;
    });
    if (kkOn('wechselgeldNicht')) ops = ops.filter(o => !(o.t === 'lr' && o.l === rg));
    if (kkOn('alleRabatte') && !neg) {
      let sum = 0; const parse = s => parseFloat(String(s).replace('-', '').replace(/\./g, '').replace(',', '.')) || 0;
      ops = ops.filter(o => { if (o.t === 'lr' && (o.l.startsWith('  ' + posr + ' ') || o.l.startsWith(summ + ' '))) { sum += parse(o.r); return false; } return true; });
      if (sum > 0) { const i = ops.findIndex(o => o.t === 'lr' && (o.l === 'SUMME EUR')); if (i > 0) ops.splice(i - 1, 0, {t: 'lr', l: 'Rabatte gesamt', r: '-' + m2(r2(sum))}); }
    }
    if (kopf && kind === 'verkauf') { const i = ops.findIndex(o => o.t === 'lr' && /^Bon /.test(o.l)); if (i >= 0) ops.splice(i, 0, {t: 'text', s: kopf, a: 'c', b: true}); }
    if (kkOn('gesamtTeile') && !neg) { const i = ops.findIndex(o => o.t === 'lr' && o.l === 'SUMME EUR'); const n = (rec.lines || []).reduce((s, l) => s + (+l.qty || 0), 0); if (i >= 0) ops.splice(i + 2, 0, {t: 'lr', l: 'Anzahl Teile', r: String(n)}); }
    if (kkOn('vkBelegende') && rec.cashier && kind === 'verkauf') { const i = ops.findIndex(o => o.t === 'feed' && o.n === 4); if (i >= 0) ops.splice(i, 0, {t: 'text', s: 'Es bediente Sie: ' + rec.cashier, a: 'c'}); }
    const agb = String(kkVal('agb', '')).trim();
    if (agb && kind === 'verkauf') { const i = ops.findIndex(o => o.t === 'feed' && o.n === 4); if (i >= 0) ops.splice(i, 0, {t: 'line'}, {t: 'text', s: agb}); }
    return ops;
  };
}
const kkBelegAnzahl = rec => { const rows = kkKasse()?.sub?.beleg, name = (rec.kind || 'verkauf') === 'verkauf' ? 'Verkaufsbeleg' : 'Standardbeleg'; const n = +(rows || []).find(r => r.name === name)?.anz; return n >= 1 && n <= 5 ? n : 1; };

/* 6) Automatische Sperre und Mengen-Rückfrage */
let kkLast = Date.now();
['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { kkLast = Date.now(); }, {passive: true, capture: true}));
setInterval(() => { const min = +kkVal('inaktivMin', 0); if (min > 0 && S.started && !S.locked && Date.now() - kkLast > min * 60000) lock(); }, 15000);

{ const _cq = changeQty;
  changeQty = async function (key, delta) {
    const n = +kkVal('abfrageMenge', 0), l = POS.cart.find(x => x.key === key);
    if (n > 0 && delta > 0 && l && l.qty + delta >= n && !(await confirmBox(`${l.qty + delta} Stück von „${l.name}“ erfassen?`, 'Ja, erfassen'))) return;
    return _cq.apply(this, arguments);
  };
  const _al = addLine;
  addLine = function (a, c, s, qty = 1, ...rest) {
    const n = +kkVal('abfrageMenge', 0);
    if (n > 0 && qty >= n) { confirmBox(`${qty} Stück von „${a.name}“ erfassen?`, 'Ja, erfassen').then(ok => { if (ok) _al.call(this, a, c, s, qty, ...rest); }); return; }
    return _al.call(this, a, c, s, qty, ...rest);
  };
}
/* Änderungen sofort übernehmen */
{ const _as = applyStamm;
  applyStamm = function () { const r = _as.apply(this, arguments); try { applyMethods(); kkApplyFlow(); permNav(); } catch (e) { /* noch nicht bereit */ } return r; };
  const _st = applySettings;
  applySettings = function () { const r = _st.apply(this, arguments); try { kkApplyFlow(); } catch (e) { /* */ } return r; };
}
