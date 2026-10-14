/* ═════════════════════════════════════════════════════════════════
   55c · MASKEN-BAUKASTEN – Stammdaten-Masken mit Reitern (Marken, Lieferanten)
   Gemeinsamer Rahmen wie bei den Filialen: Werkzeugleiste (Übersicht, Aktualisieren, Sichern, Neu, Änderungen
   zurücknehmen, Löschen), Reiter mit rotem Zähler für fehlende Pflichtangaben, Felder mit Prüfung und Fehlertext,
   Blättern 1/n, Schutz vor dem Verlassen mit ungesicherten Änderungen. Felder sprechen den Entwurf über Pfade an
   („hersteller.email“). Die Prüfungen liefert die jeweilige Maske (und das Backend entscheidet).
   Dazu die gemeinsame Länderliste (EU-Kennzeichen für GPSR und Intrastat).
   ═════════════════════════════════════════════════════════════════ */
const mgetp = (o, k) => k.split('.').reduce((x, p) => x == null ? undefined : x[p], o);
const msetp = (o, k, v) => { const ps = k.split('.'), l = ps.pop(); let x = o; for (const p of ps) { if (x[p] == null || typeof x[p] !== 'object') x[p] = {}; x = x[p]; } x[l] = v; };
const mclone = d => JSON.parse(JSON.stringify(d));
const mS = v => typeof v === 'string' ? v.trim() : '';

/* ── Länder: Länder-Tabelle (Stammdaten › Länder) vor der eingebauten Liste ── */
const LAENDER_BASIS = [['AT', 'Österreich', 1], ['BE', 'Belgien', 1], ['BG', 'Bulgarien', 1], ['HR', 'Kroatien', 1], ['CY', 'Zypern', 1], ['CZ', 'Tschechien', 1], ['DK', 'Dänemark', 1], ['EE', 'Estland', 1], ['FI', 'Finnland', 1], ['FR', 'Frankreich', 1],
  ['DE', 'Deutschland', 1], ['GR', 'Griechenland', 1], ['HU', 'Ungarn', 1], ['IE', 'Irland', 1], ['IT', 'Italien', 1], ['LV', 'Lettland', 1], ['LT', 'Litauen', 1], ['LU', 'Luxemburg', 1], ['MT', 'Malta', 1], ['NL', 'Niederlande', 1], ['PL', 'Polen', 1], ['PT', 'Portugal', 1],
  ['RO', 'Rumänien', 1], ['SK', 'Slowakei', 1], ['SI', 'Slowenien', 1], ['ES', 'Spanien', 1], ['SE', 'Schweden', 1],
  ['CH', 'Schweiz', 0], ['LI', 'Liechtenstein', 0], ['GB', 'Vereinigtes Königreich', 0], ['NO', 'Norwegen', 0], ['IS', 'Island', 0], ['US', 'USA', 0], ['CA', 'Kanada', 0], ['MX', 'Mexiko', 0], ['BR', 'Brasilien', 0], ['AR', 'Argentinien', 0], ['CL', 'Chile', 0],
  ['CN', 'China', 0], ['HK', 'Hongkong', 0], ['TW', 'Taiwan', 0], ['JP', 'Japan', 0], ['KR', 'Südkorea', 0], ['VN', 'Vietnam', 0], ['TH', 'Thailand', 0], ['ID', 'Indonesien', 0], ['IN', 'Indien', 0], ['BD', 'Bangladesch', 0], ['KH', 'Kambodscha', 0], ['PK', 'Pakistan', 0], ['LK', 'Sri Lanka', 0],
  ['MY', 'Malaysia', 0], ['PH', 'Philippinen', 0], ['SG', 'Singapur', 0], ['TR', 'Türkei', 0], ['IL', 'Israel', 0], ['AE', 'Vereinigte Arabische Emirate', 0], ['RS', 'Serbien', 0], ['BA', 'Bosnien und Herzegowina', 0], ['ME', 'Montenegro', 0], ['MK', 'Nordmazedonien', 0], ['AL', 'Albanien', 0],
  ['UA', 'Ukraine', 0], ['MD', 'Moldau', 0], ['BY', 'Belarus', 0], ['RU', 'Russland', 0], ['MA', 'Marokko', 0], ['TN', 'Tunesien', 0], ['EG', 'Ägypten', 0], ['ZA', 'Südafrika', 0], ['AU', 'Australien', 0], ['NZ', 'Neuseeland', 0]];
/** EU-Kennzeichen einer Länder-Zeile wie im Backend (marke.rs eu_flag): Bool, „ja/true/1“, „nein/false/0“ oder Zahl; sonst undefined */
const euFlag = v => typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : typeof v === 'string' ? (['true', 'ja', '1', 'yes', 'wahr'].includes(v.trim().toLowerCase()) ? true : ['false', 'nein', '0', 'no', 'falsch'].includes(v.trim().toLowerCase()) ? false : undefined) : undefined;
/** Alle Länder als {id (ISO-2), name, eu}; die Länder-Tabelle ergänzt und überschreibt Name und EU-Kennzeichen */
let LAND_CACHE = {src: null, n: -1, list: null};
function landListe() {
  const src = stRows('land'); if (LAND_CACHE.src === src && LAND_CACHE.n === src.length && LAND_CACHE.list) return LAND_CACHE.list;
  const m = new Map(LAENDER_BASIS.map(([id, name, eu]) => [id, {id, name, eu: !!eu}]));
  for (const r of stRows('land')) { const id = String(r.id || '').toUpperCase(); if (!id) continue; const p = m.get(id); m.set(id, {id, name: r.name || p?.name || id, eu: euFlag(r.eu) ?? !!p?.eu}); }
  LAND_CACHE = {src, n: src.length, list: [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))};
  return LAND_CACHE.list;
}
const landName = id => { const x = String(id || '').toUpperCase(); return x ? (landListe().find(l => l.id === x)?.name || x) : ''; };
const landEu = id => !!landListe().find(l => l.id === String(id || '').toUpperCase())?.eu;

/** Maske anlegen. o: page, list, title, perm, st (Zustand {id, ids, d, orig, tab, dirty, show}), sub(st), load(), reload(), draft(id), tabs() → [[k, Titel, Zusatz-HTML]],
 *  body() → {html, mount}, errors(d) → [{k, t}], tabOf(k), locked(), bar() (zusätzliche Knöpfe), can() → {new, del, refresh}, save(), remove(ids, ausMaske), act(a, b, el), onSet(k, el), rerender(k) */
function maskeNew(o) {
  const st = o.st, K = {o};
  const lock = () => !!o.locked?.();
  K.err = k => o.errors(st.d).find(e => e.k === k);
  K.val = k => mgetp(st.d, k);
  const attrs = (op, dis, er) => `${op.ph ? `placeholder="${esc(op.ph)}"` : ''} ${op.inputmode ? `inputmode="${op.inputmode}"` : ''} ${op.list ? `list="${op.list}"` : ''} ${op.max ? `maxlength="${op.max}"` : ''} autocomplete="off" ${dis ? 'disabled' : ''} ${er ? 'aria-invalid="true"' : ''}`;
  const foot = (er, op) => er ? `<small class="zp-err" role="alert">${esc(er.t)}</small>` : op.hint ? `<small class="ea-hint">${esc(op.hint)}</small>` : '';
  /** Eingabefeld; op: mono, num, type, ph, hint, dis, inputmode, list, max */
  K.in = (k, l, op = {}) => {
    const er = st.show && K.err(k), dis = lock() || op.dis;
    return `<label class="field ${er ? 'zp-bad' : ''}"><span>${esc(l)}</span><input class="input ${op.mono ? 'mono' : ''} ${op.num ? 'num' : ''}" ${op.type ? `type="${op.type}"` : ''} data-mf="${k}" value="${esc(K.val(k) ?? '')}" ${attrs(op, dis, er)}>${foot(er, op)}</label>`;
  };
  K.area = (k, l, rows, hint, op = {}) => {
    const er = st.show && K.err(k), dis = lock() || op.dis;
    return `<label class="field ${er ? 'zp-bad' : ''}"><span>${esc(l)}</span><textarea class="input" rows="${rows}" data-mf="${k}" style="height:auto;padding:9px 12px;resize:vertical" ${op.max ? `maxlength="${op.max}"` : ''} ${dis ? 'disabled' : ''}>${esc(K.val(k) ?? '')}</textarea>${foot(er, {hint})}</label>`;
  };
  /** Auswahl; opts [[Wert, Beschriftung]]; op.leer = Beschriftung der leeren Auswahl (ohne = keine leere Zeile) */
  K.sel = (k, l, opts, op = {}) => {
    const er = st.show && K.err(k), dis = lock() || op.dis, cur = String(K.val(k) ?? '');
    const list = cur && !opts.some(([v]) => String(v) === cur) ? [[cur, cur], ...opts] : opts;
    return `<label class="field ${er ? 'zp-bad' : ''}"><span>${esc(l)}</span><select class="input select" data-mf="${k}" ${dis ? 'disabled' : ''}>${op.leer != null ? `<option value="">${esc(op.leer)}</option>` : ''}${list.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${foot(er, op)}</label>`;
  };
  K.sw = (k, l, hint, dis) => `<div class="ue-sw"><label class="ea-sw"><button type="button" class="switch" role="switch" data-mf-sw="${k}" aria-checked="${!!K.val(k)}" ${lock() || dis ? 'disabled' : ''}></button><span>${esc(l)}</span></label>${hint ? `<small class="ea-hint">${esc(hint)}</small>` : ''}</div>`;
  K.card = (h, inner, cls = '') => `<div class="ae-card ea-card ${cls}">${h ? `<h4>${esc(h)}</h4>` : ''}<div class="ea-fields ge-one">${inner}</div></div>`;
  K.landSel = (k, l = 'Land *', op = {}) => K.sel(k, l, landListe().map(x => [x.id, x.name]), {leer: op.leer ?? '–', ...op});
  K.note = h => h ? `<div class="zp-note">${ic('info', 'i-sm')}<span>${h}</span></div>` : '';

  K.dirty = el => { st.dirty = true; $$('[data-mf-a="save"],[data-mf-a="undo"]', el).forEach(b => { b.disabled = lock(); }); };
  K.badges = el => {
    const errs = o.errors(st.d);
    $$('[data-mf-tab]', el).forEach(tb => {
      const k = tb.dataset.mfTab, n = errs.filter(e => o.tabOf(e.k) === k).length; let bd = $('.ed-badge[data-mf-bd]', tb);
      if (!n) { bd?.remove(); return; }
      if (!bd) { bd = document.createElement('span'); bd.className = 'ed-badge'; bd.dataset.mfBd = '1'; tb.append(' ', bd); } bd.textContent = n;
    });
  };
  K.fields = el => {
    const er = new Map(o.errors(st.d).map(e => [e.k, e.t]));
    $$('[data-mf]', el).forEach(inp => {
      const lab = inp.closest('label.field'); if (!lab) return; const k = inp.dataset.mf, bad = (st.show || inp.dataset.touched) && er.has(k);
      lab.classList.toggle('zp-bad', !!bad); let sm = $('small.zp-err', lab);
      if (bad) { if (!sm) { sm = document.createElement('small'); sm.className = 'zp-err'; sm.setAttribute('role', 'alert'); $('.ea-hint', lab)?.remove(); lab.append(sm); } sm.textContent = er.get(k); } else if (sm) sm.remove();
    });
  };
  K.set = (t, el) => { const k = t.dataset.mf; msetp(st.d, k, t.value); K.dirty(el); o.onSet?.(k, el); K.badges(el); };

  K.open = (id, ids) => {
    st.id = id; st.ids = ids?.length ? ids : st.ids; st.d = o.draft(id); st.orig = mclone(st.d); st.tab = o.tabs()[0][0]; st.dirty = false; st.show = false;
    if (S.view === o.page) { K.render(); renderTopbar(); } else go(o.page);
  };
  K.reset = () => { st.d = o.draft(st.id); st.orig = mclone(st.d); st.dirty = false; st.show = false; };
  K.register = () => {
    registerPage(o.page, {title: o.title, sub: () => st.d ? o.sub(st) : '', render: async () => {
      if (!st.d) { setTimeout(() => go(o.list), 0); return; }
      $('#view-' + o.page).innerHTML = '<div class="muted" style="padding:24px">Lade …</div>';
      await o.load(); K.render(); renderTopbar();
    }});
    VIEW_PERM[o.page] = o.perm; NAV_CHILD[o.page] = o.list;
    leaveGuard(o.page, () => st.dirty, () => { st.dirty = false; st.d = o.draft(st.id); st.orig = mclone(st.d); });
  };

  K.render = () => {
    const host = $('#view-' + o.page); if (!host || !st.d) return;
    const pos = st.ids.indexOf(st.id), el = document.createElement('div'); el.className = 'ae ue ge fl'; host.replaceChildren(el);
    const can = {new: true, del: !!st.id, refresh: !!st.id, ...(o.can?.() || {})}, lk = lock();
    const btn = (a, icon, l, dis, text = true, kurz) => `<button class="ag-btn" data-mf-a="${a}" title="${esc(l)}" aria-label="${esc(l)}" ${dis ? 'disabled' : ''}>${ic(icon, 'i-sm')}${text ? `<span>${kurz || l}</span>` : ''}</button>`;
    const errs = o.errors(st.d), cnt = k => errs.filter(e => o.tabOf(e.k) === k).length;
    const tab = ([k, l, extra]) => { const n = cnt(k); return `<button type="button" class="ed-tab" role="tab" data-mf-tab="${k}" aria-selected="${st.tab === k}">${esc(l)}${extra || ''}${n ? ` <span class="ed-badge" data-mf-bd="1">${n}</span>` : ''}</button>`; };
    if (!o.tabs().some(([k]) => k === st.tab)) st.tab = o.tabs()[0][0];
    const body = o.body();
    el.innerHTML = `<div class="ag-bar ae-bar">${btn('back', 'chevron-left', `Übersicht: ${o.title}`)}${btn('refresh', 'sync', 'Aktualisieren', !can.refresh)}${btn('save', 'check', 'Sichern', lk || !st.dirty)}${btn('new', 'plus', 'Neu', !can.new)}${btn('undo', 'undo', 'Änderungen zurücknehmen', lk || !st.dirty)}${btn('del', 'trash', 'Löschen', !can.del)}${o.bar?.() || ''}
      <span class="sp"></span>${st.id && st.ids.length > 1 ? `<span class="ae-nav">${btn('prev', 'chevron-left', 'Vorheriger Eintrag', pos <= 0, false)}<span class="ae-nr">${pos + 1}/${st.ids.length}</span>${btn('next', 'chevron-right', 'Nächster Eintrag', pos >= st.ids.length - 1, false)}</span>` : ''}</div>
      <div class="ae-tabsw"><div class="ed-tabs" role="tablist">${o.tabs().map(tab).join('')}</div></div>
      <div class="ae-body"><div id="edBody">${body.html}</div></div>`;
    el.addEventListener('input', e => { const t = e.target.closest('[data-mf]'); if (t && t.type !== 'color' && t.tagName !== 'SELECT') { K.set(t, el); K.fields(el); } });
    el.addEventListener('focusout', e => { const t = e.target.closest('[data-mf]'); if (t) { t.dataset.touched = '1'; K.fields(el); } });
    el.addEventListener('change', e => { const t = e.target.closest('[data-mf]'); if (t) { K.set(t, el); t.dataset.touched = '1'; if (t.tagName === 'SELECT' || t.type === 'color' || o.rerender?.(t.dataset.mf)) K.render(); else K.fields(el); } });
    el.addEventListener('click', async e => {
      const t = e.target, tb = t.closest('[data-mf-tab]'), b = t.closest('[data-mf-a]'), sw = t.closest('[data-mf-sw]');
      if (tb) { st.tab = tb.dataset.mfTab; return K.render(); }
      if (sw && !sw.disabled) { const k = sw.dataset.mfSw; msetp(st.d, k, !K.val(k)); K.dirty(el); o.onSet?.(k, el); return K.render(); }
      if (!b || b.disabled) return;
      const a = b.dataset.mfA, ask = async () => !st.dirty || await confirmBox('Ungesicherte Änderungen verwerfen?', 'Verwerfen');
      if (a === 'back') { if (!await ask()) return; st.dirty = false; return go(o.list); }
      if (a === 'refresh' || a === 'undo') { if (a === 'refresh' && !await ask()) return; await o.reload(); K.reset(); return K.render(); }
      if (a === 'new') { if (!await ask()) return; return K.open(null, st.ids); }
      if (a === 'prev' || a === 'next') { if (!await ask()) return; const id = st.ids[pos + (a === 'next' ? 1 : -1)]; if (id != null) K.open(id); return; }
      if (a === 'del') { try { await o.remove([st.id], true); } catch (err) { if (!/abgebrochen/.test(String(err?.message || err))) throw err; } return; }
      if (a === 'save') return o.save();
      await o.act?.(a, b, el);
    });
    body.mount?.(el);
  };
  /** Erster Fehler beim Sichern: zum Reiter springen und Fehler zeigen; true = alles in Ordnung */
  K.gate = () => {
    const errs = o.errors(st.d); if (!errs.length) return true;
    st.tab = o.tabOf(errs[0].k); st.show = true; K.render(); toast(errs[0].t, {t2: 'Angabe prüfen', type: 'warn'}); return false;
  };
  return K;
}
