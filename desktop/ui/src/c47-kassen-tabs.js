/* ═════════════════════════════════════════════════════════════════
   47 · FORMULAR-BAUSTEINE FÜR KASSEN UND KASSEN-KONFIGURATION
   ═════════════════════════════════════════════════════════════════ */
/* Feld: [Schlüssel, Beschriftung, Typ, Optionen/Wert, Hinweis] – Typ: text | num | check | dis | ro | select | area */
function fxField(S, [k, l, t = 'text', o, hint]) {
  const v = S[k], h = hint ? `<small class="ea-hint">${esc(hint)}</small>` : '';
  if (t === 'check') return `<div class="ea-sw2"><label class="ea-sw"><button type="button" class="switch" role="switch" data-fx-sw="${k}" aria-checked="${!!v}"></button><span>${esc(l)}</span></label>${h}</div>`;
  if (t === 'dis') return `<label class="ea-sw dis"><button type="button" class="switch" disabled role="switch" aria-checked="${!!v}"></button><span>${esc(l)}</span></label>`;
  if (t === 'ro') return `<label class="field"><span>${esc(l)}</span><input class="input ea-ro" readonly value="${esc(typeof o === 'function' ? o() : v ?? '')}">${h}</label>`;
  if (t === 'area') return `<label class="field"><span>${esc(l)}</span><textarea class="input" rows="4" data-fx="${k}" style="height:auto">${esc(v ?? '')}</textarea>${h}</label>`;
  if (t === 'select') { const op = o(); return `<label class="field"><span>${esc(l)}</span><select class="input select" data-fx="${k}">${!op.some(x => String(x[0]) === String(v)) ? `<option value="${esc(v ?? '')}" selected>${esc(v ?? '')}</option>` : ''}${op.map(([x, y]) => `<option value="${esc(x)}" ${String(v) === String(x) ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select>${h}</label>`; }
  return `<label class="field"><span>${esc(l)}</span><input class="input ${t === 'num' ? 'num' : ''}" ${t === 'num' ? 'type="number"' : ''} data-fx="${k}" value="${esc(v ?? '')}">${h}</label>`;
}
const fxCards = (S, cards) => `<div class="ea-cols">${cards.map(([h, f]) => `<div class="ae-card ea-card">${h ? `<h4>${esc(h)}</h4>` : ''}<div class="ea-fields">${f.map(x => fxField(S, x)).join('')}</div></div>`).join('')}</div>`;
function fxBind(el, S, dirty) {
  el.addEventListener('input', e => { const i = e.target.closest('[data-fx]'); if (i && i.tagName !== 'SELECT') { S[i.dataset.fx] = i.type === 'number' ? (i.value === '' ? 0 : +i.value) : i.value; dirty(); } });
  el.addEventListener('change', e => { const i = e.target.closest('select[data-fx]'); if (i) { S[i.dataset.fx] = i.value; dirty(); } });
  el.addEventListener('click', e => { const b = e.target.closest('[data-fx-sw]'); if (b && !b.disabled) { const k = b.dataset.fxSw; S[k] = !S[k]; b.setAttribute('aria-checked', String(!!S[k])); dirty(); } });
}
