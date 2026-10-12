/* ═════════════════════════════════════════════════════════════════
   51 · BONUS SYSTEME – Wirkung beim Verkauf
   Nach jedem Verkauf: passende Artikel nach Filter, Staffel nach Summe, Bonus-Gutschein ausstellen.
   ═════════════════════════════════════════════════════════════════ */
function bonusLineOk(sys, l) {
  if (l.service || l.voucher || !l.art) return false;
  const a = l.art, wg = stRows('warengruppe').find(r => r.id === a.cat);
  const ab = wg && stRows('abteilung').find(r => r.id === wg.abteilung), ha = ab && stRows('hauptabteilung').find(r => r.id === ab.parent), be = ha && stRows('bereich').find(r => r.id === ha.parent);
  const val = {marke: a.brand, warengruppe: a.cat, abteilung: ab?.id, hauptabteilung: ha?.id, bereich: be?.id};
  const hit = f => String(val[f.typ] ?? '') === String(f.wert);
  const incl = (sys.filter || []).filter(f => f.einschl), excl = (sys.filter || []).filter(f => !f.einschl);
  if (incl.length && !incl.some(hit)) return false;
  return !excl.some(hit);
}
function bonusFor(sys, rec) {
  const c = rec.customer;
  if (sys.nurReg && !c) return null;
  if (sys.kundenfilter) { const n = parseInt(String(c?.id || '').replace(/\D/g, ''), 10); if (!c || !(n >= +sys.von && n <= +sys.bis)) return null; }
  const base = r2((rec.lines || []).filter(l => bonusLineOk(sys, l)).reduce((s, l) => s + r2(l.unit * l.qty) - (l.disc ? r2(r2(l.unit * l.qty) * l.disc.pct / 100) : 0), 0));
  const st = [...(sys.staffeln || [])].filter(x => +x.ab <= base).sort((a, b) => +b.ab - +a.ab)[0];
  if (!st) return null;
  const [p, pu, b] = c ? [+st.pGesp, st.pGespU, +st.bGesp] : [+st.pLauf, st.pLaufU, +st.bLauf];
  const bonus = r2((pu === '€' ? p : base * p / 100) + (b || 0));
  return bonus > 0 ? {sys, staffel: st, base, bonus} : null;
}
async function kkBonus(rec) {
  if (!DESKTOP || (rec.kind && rec.kind !== 'verkauf')) return;
  const list = stActive('bonussystem'); if (!list.length) return;
  for (const sys of list) {
    const r = bonusFor(sys, rec); if (!r) continue;
    try {
      const o = await invoke('voucher_bonus', {amount: Math.round(r.bonus * 100), refno: rec.no, customer: rec.customer?.id || null, days: +sys.tage || 365, note: `${sys.name}${sys.gutscheintyp ? ' · ' + (stName('gutscheintyp', sys.gutscheintyp) || '') : ''}`, user: S.user.name});
      rec.bonus = {code: o.code, amount: r.bonus, system: sys.name};
      toast(`Bonus-Gutschein ${eur(r.bonus)}`, {t2: `${sys.name} · ${o.code} · gültig ${+sys.tage || 365} Tage`, type: 'pos', icon: 'gift', dur: 14000});
      Hooks.emit('bonus.issued', {beleg: rec.no, system: sys.name, gutschein: o.code, betrag: r.bonus});
      if (CFG['drucker.auto'] && typeof printOps === 'function') printOps([...headOps(), {t: 'text', s: 'BONUS-GUTSCHEIN', a: 'c', b: true, big: true}, {t: 'text', s: eur(r.bonus), a: 'c', b: true, big: true}, {t: 'text', s: o.code, a: 'c', b: true}, {t: 'text', s: `${sys.name} · gültig ${+sys.tage || 365} Tage`, a: 'c'}, {t: 'qr', d: o.code}, {t: 'feed', n: 4}, {t: 'cut'}], 'Bonus-Gutschein ' + o.code, true);
    } catch (e) { toast('Bonus-Gutschein nicht ausgestellt', {t2: String(e), type: 'warn'}); }
  }
}
{ const _sd = showDone; showDone = function (rec) { const r = _sd.apply(this, arguments); kkBonus(rec); return r; }; }
