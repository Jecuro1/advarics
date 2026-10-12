/* ═════════════════════════════════════════════════════════════════
   53 · EINSTELLUNGEN – jeder Menüpunkt ist eine eigene Seite
   Aufbau und Handler der Bereiche bleiben unverändert (sie werden – auch die von anderen Modulen eingehängten –
   weiter in #view-einstellungen gebaut); sichtbar ist je Seite nur noch EIN Bereich, mit eigenem Titel, eigener
   Adresse (#set-kasse …) und eigenem Platz im Menü.
   ═════════════════════════════════════════════════════════════════ */
const SET_LABEL = {etikett: 'Etiketten-Ausgabe', buchhaltung: 'FiBu Einstellungen'};   // Menü-/Seitentitel, falls abweichend vom Abschnittstitel
const SET_SUB = {
  allgemein: 'Firmendaten für Belege und Exporte', standard: 'EDI, Gutscheine, neue Artikel, E-Mail-Fußzeile', anzeige: 'Größe, Farben, Dichte',
  benutzer: 'Personen, PIN und Rechte', sso: 'Anmeldung mit dem Firmenkonto', kasse: 'Freigaben, Grenzen, Ziele', bon: 'Beleglayout und Texte',
  drucker: 'Bondrucker und Kassenlade', etikett: 'Preis- und Barcode-Etiketten', zahlung: 'Zahlungsarten und IBAN', terminal: 'Kartenterminal',
  display: 'Anzeige für Kund:innen', rksv: 'Registrierkasse und Signatur', verbund: 'Mehrere Standorte', handy: 'Mobile Kasse und Scanner',
  mail: 'Mailserver (SMTP)', buchhaltung: 'Konten und Export', ki: 'Lokales Sprachmodell', sicherung: 'Sicherungen und Wiederherstellung',
  updates: 'Programmupdates', system: 'Version und Protokoll'
};
SET_SECTIONS.forEach(([id, label]) => {
  const pid = 'set-' + id, title = SET_LABEL[id] || label;
  TITLES[pid] = title;
  PAGES[pid] = {title, sub: () => SET_SUB[id] || 'Einstellungen', render: () => { SET.sec = id; renderSettings(); }};
  VIEW_PERM[pid] = 'einstellungen';
});
VIEW_PERM.einstellungen = 'einstellungen';

/* Zuordnung der alten Adressen */
const SET_ALIAS = {einstellungen: 'set-allgemein', 'einst-allgemein': 'set-standard', 'einst-benutzer': 'set-benutzer', 'einst-update': 'set-updates', datensicherung: 'set-sicherung', 'einst-buchungslogik': 'set-bon'};
{ const _go = go;
  go = function (view) {
    const to = SET_ALIAS[view] || view, was = S.view, r = _go.call(this, to);
    // alle Einstellungsseiten teilen sich eine Ansicht: beim Wechsel wieder nach oben (erst jetzt, wenn sie sichtbar ist)
    if (S.view !== was && String(to).startsWith('set-')) { const h = $('#view-einstellungen'); if (h) h.scrollTop = 0; }
    return r;
  };
}

/* Bereich als eigene Seite darstellen: nur der gewählte Abschnitt, Titel und Beschreibung als Seitenkopf */
{ const _rs = renderSettings;
  renderSettings = function () { _rs.apply(this, arguments); settingsPage(SET.sec); };
}
function settingsPage(sec) {
  const host = $('#view-einstellungen'); if (!host) return;
  const sel = SET_SECTIONS.find(s => s[0] === sec) || SET_SECTIONS[0];
  const el = $('#sec-' + sel[0], host); if (!el) return;
  const h2 = el.querySelector(':scope > h2'), p = el.querySelector(':scope > p');
  const title = SET_LABEL[sel[0]] || h2?.textContent || sel[1], desc = p ? p.innerHTML : '';
  h2?.remove(); p?.remove();
  const note = host.querySelector('.set-note');
  const page = document.createElement('div'); page.className = 'cv set-page';
  page.innerHTML = `<div class="cv-head"><div><h2 class="h-title">${esc(title)}</h2>${desc ? `<div class="set-desc">${desc}</div>` : ''}</div></div>`;
  el.classList.add('set-only'); page.append(el);
  if (note) { const n = document.createElement('div'); n.className = 'set-foot'; n.innerHTML = note.innerHTML; page.append(n); }
  host.replaceChildren(page);
}
