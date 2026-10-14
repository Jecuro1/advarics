
/* ════════════════════════════════════════════════════════════════════
   30 · EINSTELLUNGEN PAKET 5 — Bon & Belege, E-Mail, Etiketten,
   Sicherungs-Verschlüsselung · Verbindungen in Kasse, Belege, Einkauf
   ════════════════════════════════════════════════════════════════════ */
const sampleRec = () => ({no: `${YEAR}-000123`, date: new Date(), cashier: S.user.name, kind: 'verkauf', change: 0, offline: false, sig: '0000000000000000', billDisc: null,
  lines: [{name: ART[0]?.name || 'Grat Hardshell Jacke', sku: ART[0]?.id || 'A1001', art: ART[0], c: ART[0]?.colors[0] || 'moos', s: 'M', qty: 1, unit: ART[0]?.price || 449, was: null, vat: 20, disc: null},
    {name: 'Merino Beanie', sku: 'A7001', c: 'glut', s: 'Einheitsgröße', qty: 2, unit: 39.9, was: 49.9, vat: 20, disc: null}],
  t: {total: r2((ART[0]?.price || 449) + 79.8), sub: 0, disc: 0, vat: [{rate: 20, gross: r2((ART[0]?.price || 449) + 79.8), net: r2(((ART[0]?.price || 449) + 79.8) / 1.2), tax: r2(((ART[0]?.price || 449) + 79.8) / 6)}], zero: 0, points: 0},
  parts: [{m: 'bar', label: 'Bar', amount: r2((ART[0]?.price || 449) + 79.8)}], customer: null, rksv: null});

function bonSectionHTML() {
  return `<section class="set-sec" id="sec-bon"><h2>Bon & Belege</h2><p>Logo, Vorlage und Texte für Kassenbons, Rechnungen und Lieferscheine. Das Logo wird auch auf dem Thermodrucker gedruckt (automatisch in Schwarz-Weiß umgerechnet).</p>
    <div class="bon-grid"><div class="card" id="bonBox"></div><div class="card bon-prev"><div class="eyebrow" style="padding:14px 16px 0">Vorschau</div><div id="bonPrev" style="padding:12px 16px 18px"></div></div></div></section>`;
}
function renderBonBox() {
  const box = $('#bonBox'); if (!box) return;
  const u = imgUrl(CFG['bon.logo']);
  const row = (l, h, v) => `<div class="set-row"><div><div class="set-l">${l}</div>${h ? `<div class="set-h">${h}</div>` : ''}</div><div class="set-c" style="min-width:0;gap:6px">${v}</div></div>`;
  box.innerHTML = row('Logo', 'PNG mit transparentem Hintergrund ideal · wird verkleinert gespeichert', `${u ? `<img src="${esc(u)}" alt="" style="max-height:40px;max-width:140px;background:#fff;border-radius:6px;padding:4px">` : ''}<button class="btn btn-secondary btn-sm" id="bonLogo" ${DESKTOP ? '' : 'disabled'}>${ic('edit', 'i-sm')}${u ? 'Ändern' : 'Logo wählen'}</button>${u ? `<button class="btn btn-ghost btn-sm" id="bonLogoRm">${ic('trash', 'i-sm')}</button>` : ''}`)
    + row('Vorlage Kassenbon', 'Gilt für Bildschirm, Belegliste und E-Mail', `<div class="seg" id="bonTpl">${[['classic', 'Klassisch'], ['modern', 'Modern'], ['minimal', 'Minimal']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${(prefs.tpl || 'classic') === k}">${l}</button>`).join('')}</div>`)
    + field('bon.logoDruck', 'Logo auf dem Thermobon drucken', 'Benötigt einen Bondrucker mit Rastergrafik (ESC/POS „GS v 0“)', 'switch')
    + field('bon.ersparnis', '„Sie sparen …“ anzeigen', 'Summe aus Aktionen und Rabatten am Bonende', 'switch')
    + field('bon.artikelnr', 'Artikelnummern auf dem Bon', '', 'switch')
    + field('bon.kopf', 'Zusatzzeile oben', 'z. B. Öffnungszeiten oder Webadresse', 'text')
    + field('kasse.bonFuss', 'Text am Bonende', 'Gilt, solange die Filiale unter Stammdaten › Filialen keinen eigenen Text hat', 'textarea')
    + field('bon.fussA4', 'Fußzeile Rechnung/Lieferschein', 'z. B. Bankverbindung, Firmenbuchnummer, Gerichtsstand · gilt, solange die Filiale unter Stammdaten › Filialen keinen eigenen Text hat', 'textarea');
  initSeg($('#bonTpl', box), b => { prefs.tpl = b.dataset.v; persist.set('prefs', prefs); renderBonPrev(); });
  renderBonPrev();
}
function renderBonPrev() { const p = $('#bonPrev'); if (p) p.innerHTML = `<div class="receipt-wrap" style="padding:0">${receiptHTML(sampleRec(), prefs.tpl || 'classic')}</div>`; }

function mailSectionHTML() {
  return `<section class="set-sec" id="sec-mail"><h2>E-Mail</h2><p>Belege, Rechnungen und Bestellungen per E-Mail – direkt über Ihren eigenen Mailserver (SMTP), ohne Cloud-Dienst dazwischen. Zugangsdaten werden in der lokalen Datenbank gespeichert (bei aktivierter Verschlüsselung auch verschlüsselt gesichert).</p>
    <div class="card" id="mailBox"></div></section>`;
}
function renderMailBox() {
  const box = $('#mailBox'); if (!box) return;
  box.innerHTML = field('mail.host', 'Mailserver (SMTP)', 'z. B. smtp.office365.com, mail.ihre-firma.at', 'text')
    + field('mail.port', 'Port', '587 (STARTTLS) · 465 (TLS) · 25', 'number', 'min="1" max="65535" style="max-width:110px"')
    + `<div class="set-row"><div><div class="set-l">Verschlüsselung</div></div><div class="set-c"><div class="seg" id="mailTls">${[['starttls', 'STARTTLS'], ['tls', 'TLS'], ['keine', 'keine']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${(CFG['mail.tls'] || 'starttls') === k}">${l}</button>`).join('')}</div></div></div>`
    + field('mail.user', 'Benutzername', '', 'text') + field('mail.pass', 'Passwort', '', 'password')
    + field('mail.from', 'Absender', 'z. B. Alpenlicht Sport <kassa@alpenlicht.at>', 'text')
    + `<div class="set-row"><div><div class="set-l">Test</div><div class="set-h">Schickt eine Test-Mail an den Absender</div></div><div class="set-c"><button class="btn btn-secondary btn-sm" id="mailTest" ${DESKTOP ? '' : 'disabled'}>${ic('mail', 'i-sm')}Test-Mail senden</button></div></div>`;
  initSeg($('#mailTls', box), b => saveSettings({'mail.tls': b.dataset.v}, true));
}
function labelSectionHTML() {
  return `<section class="set-sec" id="sec-etikett"><h2>Etiketten</h2><p>Preis- und Barcode-Etiketten (EAN-13). Entweder auf A4-Etikettenbögen über den normalen Druckdialog oder direkt auf einem Etikettendrucker mit ZPL (z. B. Zebra, 50 × 30 mm).</p><div class="card" id="lblBox"></div></section>`;
}
function renderLabelBox() {
  const box = $('#lblBox'); if (!box) return;
  const art = CFG['etikett.art'] || 'a4';
  box.innerHTML = `<div class="set-row"><div><div class="set-l">Drucker</div></div><div class="set-c"><div class="seg" id="lblSeg">${[['a4', 'A4-Bogen'], ['netz', 'ZPL · Netzwerk'], ['windows', `ZPL · ${SYS_PRN}`]].map(([k, l]) => `<button data-v="${k}" aria-pressed="${art === k}">${l}</button>`).join('')}</div></div></div>`
    + (art === 'netz' ? field('etikett.adresse', 'IP-Adresse', 'z. B. 192.168.1.60 (Port 9100)') : '') + (art === 'windows' ? field('etikett.name', `${SYS_OS === 'Mac' ? 'Mac' : 'Windows'}-Druckername`, `genau wie in ${SYS_OS === 'Mac' ? 'Systemeinstellungen › Drucker & Scanner' : 'Windows'} angezeigt`) : '')
    + (art === 'a4' ? `<div class="set-row"><div><div class="set-l">Bogen</div></div><div class="set-c"><select class="input select" data-key="etikett.format">${Object.entries(LABEL_FORMATS).map(([k, f]) => `<option value="${k}" ${k === (CFG['etikett.format'] || '3x8') ? 'selected' : ''}>${f.name}</option>`).join('')}</select></div></div>` : '');
  initSeg($('#lblSeg', box), async b => { await saveSettings({'etikett.art': b.dataset.v}, true); renderLabelBox(); });
}
async function renderBackupCrypt() {
  const box = $('#backupBox'); if (!box || !DESKTOP || $('#bkCrypt')) return;
  let on = false; try { on = await invoke('backup_password_status'); } catch { /* */ }
  const card = $('.card', box); if (!card) return;
  card.insertAdjacentHTML('beforeend', `<div class="set-row" id="bkCrypt"><div><div class="set-l">Verschlüsselung ${on ? '<span class="pill pos" style="height:20px">aktiv</span>' : '<span class="pill warn" style="height:20px">aus</span>'}</div><div class="set-h">AES-256 · Sicherungen enthalten auch Artikelbilder und Logo. Das Passwort bitte getrennt aufbewahren – ohne es ist eine Sicherung auf einem anderen Rechner nicht lesbar.</div></div><div class="set-c" style="gap:6px"><button class="btn btn-secondary btn-sm" id="bkPw">${ic('lock', 'i-sm')}${on ? 'Passwort ändern' : 'Verschlüsselung einrichten'}</button>${on ? `<button class="btn btn-ghost btn-sm" id="bkPwOff">Ausschalten</button>` : ''}</div></div>`);
}
function askPassword(title, text, confirm) {
  return new Promise(resolve => {
    const el = openLayer(`<div class="modal" style="width:min(460px,100%)" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="m-head"><div class="m-ic">${ic('lock')}</div><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
      <div class="m-body" style="display:grid;gap:10px"><label class="field"><span>Passwort</span><input class="input" type="password" id="pw1" autocomplete="new-password"></label>${confirm ? '<label class="field"><span>Wiederholen</span><input class="input" type="password" id="pw2" autocomplete="new-password"></label>' : ''}</div>
      <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" id="pwGo">OK</button></div></div>`, {focus: '#pw1', onClose: () => resolve(null)});
    const go2 = () => { const a = $('#pw1', el).value; if (confirm && a !== $('#pw2', el).value) return toast('Passwörter stimmen nicht überein', {type: 'warn'}); if (confirm && a.length < 8) return toast('Mindestens 8 Zeichen', {type: 'warn'}); resolve(a); closeLayer(el); };
    $('#pwGo', el).onclick = go2; el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
  });
}

function bindP5() {
  const sv = $('#view-einstellungen');
  sv.addEventListener('click', async e => {
    if (e.target.closest('#bonLogo')) { try { const n = await invoke('logo_pick'); if (n) { CFG['bon.logo'] = n; renderBonBox(); toast('Logo übernommen', {type: 'pos', icon: 'check'}); } } catch (err) { toast('Logo nicht übernommen', {t2: String(err), type: 'warn'}); } return; }
    if (e.target.closest('#bonLogoRm')) { await saveSettings({'bon.logo': ''}, true); renderBonBox(); return; }
    if (e.target.closest('#mailTest')) {
      if (!mailReady()) return toast('Bitte Mailserver und Absender eintragen', {type: 'warn'});
      const to = (CFG['mail.from'].match(/<([^>]+)>/) || [, CFG['mail.from']])[1];
      try { await invoke('mail_send', {to, subject: 'Kontor · Test-Mail', html: `<p>Der E-Mail-Versand aus Kontor funktioniert.</p><p style="color:#666">${esc(CFG['firma.name'])} · Kasse ${esc(CFG['kasse.id'])}</p>`, text: 'Der E-Mail-Versand aus Kontor funktioniert.', qr: null, purpose: 'test'}); toast('Test-Mail gesendet', {t2: to, type: 'pos', icon: 'mail'}); }
      catch (err) { toast('Test-Mail fehlgeschlagen', {t2: String(err), type: 'warn', dur: 10000}); }
      return;
    }
    if (e.target.closest('#bkPw')) { try { await stepUp({title: 'Sicherungs-Verschlüsselung', text: 'Passwort für Sicherungen festlegen', admin: true}); } catch { return; } const pw = await askPassword('Sicherungspasswort', 'Mindestens 8 Zeichen · getrennt aufbewahren', true); if (!pw) return; try { await invoke('backup_password_set', {password: pw}); toast('Verschlüsselung aktiv', {t2: 'Ab der nächsten Sicherung', type: 'pos', icon: 'lock'}); } catch (err) { return toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); } renderBackups().then(renderBackupCrypt); return; }
    if (e.target.closest('#bkPwOff')) { try { await stepUp({title: 'Verschlüsselung ausschalten', text: 'Künftige Sicherungen werden unverschlüsselt gespeichert', admin: true}); await invoke('backup_password_set', {password: ''}); } catch { return; } renderBackups().then(renderBackupCrypt); }
  }, true);
  sv.addEventListener('change', e => { if (e.target.dataset.key?.startsWith('bon.') || e.target.dataset.key === 'kasse.bonFuss') setTimeout(renderBonPrev, 50); });
  sv.addEventListener('click', e => { if (e.target.closest('.switch[data-key^="bon."]')) setTimeout(renderBonPrev, 80); });
}
