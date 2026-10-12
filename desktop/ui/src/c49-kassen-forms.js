/* ═════════════════════════════════════════════════════════════════
   49 · STAMMDATEN › GRÖSSEN › GRÖSSEN SORTIEREN
   ═════════════════════════════════════════════════════════════════ */
/* ── Stammdaten › Größen › Größen sortieren ── */
const GF = {rows: null, sel: null, dirty: false};
const gfLoad = () => { GF.rows = stRows('groesse').map(r => ({id: r.id, name: r.name || '', nr: +r.nr || 0, g1: r.g1 || '', g2: r.g2 || ''})).sort((a, b) => a.nr - b.nr || a.name.localeCompare(b.name, 'de', {numeric: true})); GF.dirty = false; };
const gfNat = (a, b) => { const na = parseFloat(String(a.g1 || a.name).replace(',', '.')), nb = parseFloat(String(b.g1 || b.name).replace(',', '.')); if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb; return String(a.g1 || a.name).localeCompare(String(b.g1 || b.name), 'de', {numeric: true}) || String(a.g2).localeCompare(String(b.g2), 'de', {numeric: true}) || a.name.localeCompare(b.name, 'de', {numeric: true}); };
function gfRender() { const h = $('#view-st-groessenfolge'); if (h) { h.replaceChildren(); PAGES['st-groessenfolge'].render(); } }
async function gfMove(d) {
  const id = [...(AG['st-groessenfolge']?.sel || [])][0]; if (!id) return toast('Zeile auswählen', {type: 'warn'});
  const a = GF.rows, i = a.findIndex(x => x.id === id), j = i + d; if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]]; a.forEach((x, n) => { x.nr = n + 1; }); GF.dirty = true; AG['st-groessenfolge'].sel = new Set([id]); agApply('st-groessenfolge'); gfBar();
}
const gfBar = () => { const s = $('#view-st-groessenfolge [data-ag="save"]'), u = $('#view-st-groessenfolge [data-ag="undo"]'); if (s) s.disabled = !GF.dirty; if (u) u.disabled = !GF.dirty; };
agridPage('st-groessenfolge', {
  title: 'Größen sortieren', rows: () => { if (!GF.rows) gfLoad(); return GF.rows; }, count: () => stRows('groesse').length, sort: {k: 'nr', dir: 1},
  toolbar: [{k: 'save', l: 'Sichern', icon: 'check'}, {k: 'new', l: 'Neu', icon: 'plus'}, {k: 'undo', l: 'Änderungen zurücknehmen', icon: 'undo'}, {k: 'up', l: 'Rauf', icon: 'chevron-up'}, {k: 'dn', l: 'Runter', icon: 'chevron-down'}, {k: 'auto', l: 'Automatisch sortieren', icon: 'sync'}],
  cols: [{k: 'nr', l: 'Sortierungsnr.', t: 'num', w: 150}, {k: 'name', l: 'Größe', w: 220}, {k: 'g1', l: 'Größe 1', w: 160}, {k: 'g2', l: 'Größe 2', w: 160}],
  actions: {
    save: async () => { try { await needPerm('einstellungen', 'Größen sortieren'); const m = new Map(GF.rows.map(r => [r.id, r.nr])); await stammSave('groesse', stRows('groesse').map(r => ({...r, nr: m.get(r.id) ?? r.nr}))); GF.dirty = false; toast('Gespeichert', {t2: `${num(GF.rows.length)} Größen`, type: 'pos', icon: 'check', dur: 1800}); gfBar(); } catch (err) { if (err) toast('Nicht gespeichert', {t2: String(err.message || err), type: 'warn'}); } },
    new: () => go('st-groesse'),
    undo: () => { gfLoad(); agApply('st-groessenfolge'); gfBar(); },
    up: () => gfMove(-1), dn: () => gfMove(1),
    auto: async () => { if (!await confirmBox('Alle Größen automatisch sortieren und neu durchnummerieren?', 'Sortieren')) return; GF.rows.sort(gfNat); GF.rows.forEach((x, n) => { x.nr = n + 1; }); GF.dirty = true; agApply('st-groessenfolge'); gfBar(); }
  }
});
{ const p0 = PAGES['st-groessenfolge'].render; PAGES['st-groessenfolge'].render = async () => { gfLoad(); await p0(); gfBar(); }; }
VIEW_PERM['st-groessenfolge'] = 'einstellungen';
