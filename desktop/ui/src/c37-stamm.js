
/* ════════════════════════════════════════════════════════════════════
   47 · STAMMDATEN — eine Tabellen-Oberfläche für alle Stammdaten
   (Marken, Saisons, Größenschlüssel, Farben, Zahlungsbedingungen,
   Spediteure, Hotels, Vorlagen, MwSt.-Sets …): Zeilen bearbeiten,
   sortieren, (de)aktivieren, CSV importieren/exportieren. Warengruppen
   und Hausfarben fließen direkt in Artikel und Kasse ein.
   ════════════════════════════════════════════════════════════════════ */
const STAMM = {data: {}, loaded: false};
const stRows = k => STAMM.data[k] || [];
const stActive = k => stRows(k).filter(r => r._aktiv !== false);
const stOpts = (k, lbl = 'name') => stActive(k).map(r => [r.id, r[lbl] || r.id]);
const stName = (k, id) => stRows(k).find(r => r.id === id)?.name || id || '';
const supOpts = () => SUPPLIERS.map(s => [s.id, s.name]);
const catOpts = () => CATS.filter(c => c.id !== 'alle').map(c => [c.id, c.name]);
const colOpts = () => Object.entries(COLORS).map(([k, v]) => [k, v[0]]);
const storeOpts = () => STORES.map(s => [s.id || s.code || s.name, s.name || s.id]);
const userOpts = () => STAFF.map(u => [u.name, u.name]);

/** Tabellen-Definitionen: Titel, Untertitel, Spalten (k, l, t, o, w) und Startwerte */
const STAMM_DEF = {
  // ── Benutzer
  benutzergruppe: {t: 'Benutzergruppen', ic: 'users', sub: 'Gruppen von Personen (Mitglieder werden unter Benutzer zugeordnet) – die Rolle wird beim Zuordnen vorgeschlagen', cols: [{k: 'name', l: 'Gruppe'}, {k: 'beschreibung', l: 'Beschreibung'}, {k: 'rolle', l: 'Rolle', t: 'select', o: () => Object.entries(ROLE_NAMES).map(([k, v]) => [k, v])}, {k: 'mitglieder', l: 'Mitglieder', t: 'list', w: 260}, {k: 'filialen', l: 'Filialen', t: 'list'}],
    seed: [{id: 'KASSE', name: 'Kassenpersonal', rolle: 'verkauf', mitglieder: [], filialen: []}, {id: 'LEITUNG', name: 'Filialleitung', rolle: 'leitung', mitglieder: [], filialen: []}]},
  zugangsprofil: {t: 'Zugangsprofil', ic: 'lock', sub: 'Wann und von wo sich wer anmelden darf – IP-Bereich, Wochentage und Zeiten; außerhalb wird die Anmeldung abgelehnt (Administratoren ausgenommen)', cols: [{k: 'name', l: 'Name'}, {k: 'ip_von', l: 'IP Bereich von'}, {k: 'ip_bis', l: 'IP Bereich bis'}, {k: 'wt_von', l: 'Arbeitstag von', t: 'time'}, {k: 'wt_bis', l: 'Arbeitstag bis', t: 'time'}, {k: 'we_von', l: 'Wochenende von', t: 'time'}, {k: 'we_bis', l: 'Wochenende bis', t: 'time'}, {k: 'benutzer', l: 'Benutzer', t: 'list', w: 220}]},
  meldung: {t: 'Zuordnung Meldungen', ic: 'bell', sub: 'Wer bei welchem Ereignis benachrichtigt wird – Hinweis in Kontor oder E-Mail', cols: [{k: 'ereignis', l: 'Ereignis', t: 'select', o: () => MELD_EVT}, {k: 'empfaenger', l: 'Empfänger (Benutzer)', t: 'select', o: userOpts}, {k: 'email', l: 'E-Mail (leer = E-Mail Firma der Person)'}, {k: 'kanal', l: 'Kanal', t: 'select', o: [['hinweis', 'Hinweis'], ['mail', 'E-Mail'], ['beides', 'Hinweis + E-Mail']]}]},
  // ── Filialen
  filialgruppe: {t: 'Filialengruppe', ic: 'store', sub: 'Filialen gruppieren (Region, Format) – für Auswertungen und Umlagerungen', cols: [{k: 'name', l: 'Gruppe'}, {k: 'filialen', l: 'Filialen (Kürzel)', t: 'list', w: 280}, {k: 'leitung', l: 'Verantwortlich'}]},
  formular: {t: 'Formulareinstellungen', ic: 'receipt', sub: 'Kopf- und Fußtexte je Formular (Rechnung, Lieferschein, Angebot, Abholschein …) – überschreibt die Firmendaten', cols: [{k: 'formular', l: 'Formular', t: 'select', o: [['Rechnung', 'Rechnung'], ['Angebot', 'Angebot'], ['Auftragsbestätigung', 'Auftragsbestätigung'], ['Lieferschein', 'Lieferschein'], ['Abholschein', 'Abholschein'], ['Auswahlschein', 'Auswahlschein'], ['Mahnung', 'Mahnung'], ['Versandetikett', 'Versandetikett'], ['Verleihvertrag', 'Verleihvertrag']]}, {k: 'kopf', l: 'Kopftext', t: 'area', w: 260}, {k: 'fuss', l: 'Fußtext', t: 'area', w: 260}]},
  verkaufsabteilung: {t: 'Verkaufsabteilung', ic: 'grid', sub: 'Abteilungen im Geschäft mit zugeordneten Warengruppen – für Verkäuferprämien und Flächenauswertung', cols: [{k: 'name', l: 'Abteilung'}, {k: 'warengruppen', l: 'Warengruppen', t: 'multi', o: catOpts, w: 280}, {k: 'leitung', l: 'Leitung'}]},
  // ── Artikel-Stammdaten
  marke: {t: 'Marken', ic: 'star', sub: 'Marken mit Lieferant und Herkunft', cols: [{k: 'name', l: 'Marke'}, {k: 'lieferant', l: 'Lieferant', t: 'select', o: supOpts}, {k: 'land', l: 'Land'}, {k: 'web', l: 'Webseite'}]},
  warengruppe: {t: 'Warengruppen', ic: 'tag', sub: 'Warengruppen für Artikel, Kasse und Auswertungen – mit Hierarchie, Steuersatz und Konto', cols: [{k: 'nr', l: 'Nr.', w: 80}, {k: 'name', l: 'Warengruppe', w: 260}, {k: 'abteilung', l: 'Abteilung', t: 'select', o: () => stOpts('abteilung'), w: 200}, {k: 'ust', l: 'USt %', t: 'num', w: 80}, {k: 'konto', l: 'Erlöskonto', w: 100}, {k: 'zolltarif', l: 'Zolltarifnr.', w: 120}, {k: 'etikett', l: 'Etikettentyp', w: 120}, {k: 'inventur', l: 'Inventur', t: 'check'}, {k: 'altersbewertung', l: 'Altersbewertung', w: 120}, {k: 'spanne', l: 'Spanne/Kalk.', t: 'num', w: 90}]},
  abteilung: {t: 'Abteilungen', ic: 'layers', sub: 'Ebene über den Warengruppen', cols: [{k: 'name', l: 'Abteilung'}, {k: 'parent', l: 'Hauptabteilung', t: 'select', o: () => stOpts('hauptabteilung')}]},
  hauptabteilung: {t: 'Hauptabteilungen', ic: 'layers', sub: 'Ebene über den Abteilungen', cols: [{k: 'name', l: 'Hauptabteilung'}, {k: 'parent', l: 'Bereich', t: 'select', o: () => stOpts('bereich')}]},
  bereich: {t: 'Bereiche', ic: 'layers', sub: 'Ebene über den Hauptabteilungen', cols: [{k: 'name', l: 'Bereich'}, {k: 'parent', l: 'Hauptbereich', t: 'select', o: () => stOpts('hauptbereich')}]},
  hauptbereich: {t: 'Hauptbereiche', ic: 'layers', sub: 'Oberste Ebene der Warengruppen-Hierarchie', cols: [{k: 'name', l: 'Hauptbereich'}],
    seed: [{id: 'HW', name: 'Hartware'}, {id: 'SW', name: 'Software (Textil)'}]},
  preislage: {t: 'Preislagen', ic: 'tag', sub: 'Preisstufen für Sortiments- und Größen/Preislagen-Auswertungen', cols: [{k: 'name', l: 'Preislage'}, {k: 'von', l: 'von €', t: 'num'}, {k: 'bis', l: 'bis €', t: 'num'}],
    seed: [{id: 'P1', name: 'Einstieg', von: 0, bis: 49.99}, {id: 'P2', name: 'Mitte', von: 50, bis: 149.99}, {id: 'P3', name: 'Gehoben', von: 150, bis: 399.99}, {id: 'P4', name: 'Premium', von: 400, bis: 99999}]},
  groessenschluessel: {t: 'Größenschlüssel', ic: 'grid', sub: 'Größenläufe für die Artikelanlage (Order, EDI-Import, Artikel-Import)', cols: [{k: 'name', l: 'Größenschlüssel'}, {k: 'groessen', l: 'Größen', t: 'list', w: 340}],
    seed: [{id: 'KONF', name: 'Konfektion', groessen: ['XS', 'S', 'M', 'L', 'XL', 'XXL']}, {id: 'SCHUH', name: 'Schuhe EU', groessen: ['38', '39', '40', '41', '42', '43', '44', '45', '46']}, {id: 'HOSE', name: 'Hosen DE', groessen: ['44', '46', '48', '50', '52', '54', '56']}, {id: 'ONE', name: 'Einheitsgröße', groessen: ['one size']}]},
  groessenfolge: {t: 'Größen sortieren', ic: 'list', sub: 'Reihenfolge, in der Größen in Matrix, Etiketten und Auswertungen erscheinen', cols: [{k: 'name', l: 'Größe'}]},
  flaeche: {t: 'Flächen', ic: 'grid', sub: 'Verkaufsflächen je Filiale in m² – für Flächenproduktivität (Umsatz je m²)', cols: [{k: 'name', l: 'Fläche'}, {k: 'filiale', l: 'Filiale', t: 'select', o: storeOpts}, {k: 'm2', l: 'm²', t: 'num'}, {k: 'warengruppen', l: 'Warengruppen', t: 'multi', o: catOpts, w: 260}]},
  orderkategorie: {t: 'Orderkategorie', ic: 'truck', sub: 'Kategorien für Order und EDI – Vororder, Nachorder, NOS', cols: [{k: 'name', l: 'Kategorie'}, {k: 'edi', l: 'EDI', t: 'check'}, {k: 'nos', l: 'NOS', t: 'check'}, {k: 'lieferzeit', l: 'Lieferzeit (Tage)', t: 'num'}],
    seed: [{id: 'VO', name: 'Vororder', edi: true, nos: false, lieferzeit: 120}, {id: 'NO', name: 'Nachorder', edi: true, nos: false, lieferzeit: 14}, {id: 'NOS', name: 'Never out of Stock', edi: true, nos: true, lieferzeit: 7}]},
  hausfarbe: {t: 'Hausfarben', ic: 'palette', sub: 'Eigene Farbnamen – stehen sofort bei Artikeln, Etiketten und im Schaufenster zur Wahl', cols: [{k: 'name', l: 'Farbe'}, {k: 'hex', l: 'Farbton', t: 'color'}]},
  farbuebersetzung: {t: 'Farben Übersetzung', ic: 'globe', sub: 'Farbnamen in weiteren Sprachen (Bon, Schaufenster, E-Mails)', cols: [{k: 'farbe', l: 'Farbe', t: 'select', o: colOpts}, {k: 'en', l: 'Englisch'}, {k: 'it', l: 'Italienisch'}, {k: 'fr', l: 'Französisch'}]},
  lieferantenfarbe: {t: 'Lieferanten-Farben', ic: 'swap', sub: 'Farbcodes der Lieferanten auf Hausfarben abbilden – genutzt von Order- und EDI-Import', cols: [{k: 'lieferant', l: 'Lieferant', t: 'select', o: supOpts}, {k: 'code', l: 'Code/Name beim Lieferanten'}, {k: 'farbe', l: 'Hausfarbe', t: 'select', o: colOpts}]},
  saison: {t: 'Saisons', ic: 'calendar', sub: 'Saisons mit Zeitraum – Feld „Saison“ am Artikel, Auswertungen und Altersbewertung', cols: [{k: 'name', l: 'Saison'}, {k: 'haupt', l: 'Hauptsaison', t: 'select', o: () => stOpts('hauptsaison')}, {k: 'kategorie', l: 'Kategorie', t: 'select', o: () => stOpts('saisonkategorie')}, {k: 'von', l: 'von', t: 'date'}, {k: 'bis', l: 'bis', t: 'date'}],
    seed: [{id: 'HW 26', name: 'Herbst/Winter 2026', haupt: 'HW', von: '2026-08-01', bis: '2027-02-28'}, {id: 'FS 27', name: 'Frühjahr/Sommer 2027', haupt: 'FS', von: '2027-02-01', bis: '2027-07-31'}]},
  hauptsaison: {t: 'Hauptsaisons', ic: 'calendar', sub: 'Übergeordnete Saisons', cols: [{k: 'name', l: 'Hauptsaison'}], seed: [{id: 'HW', name: 'Herbst/Winter'}, {id: 'FS', name: 'Frühjahr/Sommer'}, {id: 'GJ', name: 'Ganzjährig'}]},
  saisonkategorie: {t: 'Saisonkategorien', ic: 'calendar', sub: 'z. B. Neuheit, Fortführung, Restposten', cols: [{k: 'name', l: 'Kategorie'}], seed: [{id: 'NEU', name: 'Neuheit'}, {id: 'FORT', name: 'Fortführung'}, {id: 'REST', name: 'Restposten'}]},
  zahlungsbedingung: {t: 'Zahlungsbedingungen', ic: 'cash', sub: 'Für Lieferanten (Eingangsrechnungen) und Kund:innen (Faktura)', cols: [{k: 'name', l: 'Bezeichnung'}, {k: 'tage', l: 'Netto Tage', t: 'num'}, {k: 'skonto', l: 'Skonto %', t: 'num'}, {k: 'skonto_tage', l: 'Skonto Tage', t: 'num'}, {k: 'text', l: 'Text auf Beleg', w: 260}],
    seed: [{id: 'N14', name: '14 Tage netto', tage: 14, skonto: 0, skonto_tage: 0, text: 'Zahlbar binnen 14 Tagen ohne Abzug.'}, {id: 'S30', name: '30 Tage, 3 % Skonto 10 Tage', tage: 30, skonto: 3, skonto_tage: 10, text: 'Zahlbar binnen 30 Tagen, bei Zahlung binnen 10 Tagen 3 % Skonto.'}, {id: 'SOFORT', name: 'Sofort', tage: 0, skonto: 0, skonto_tage: 0, text: 'Zahlbar sofort.'}]},
  praemienmonat: {t: 'Verkäuferprämie – Monate', ic: 'calendar', sub: 'Umsatzziel und Prämie je Monat – Abrechnung unter „Prämienabrechnung“', cols: [{k: 'name', l: 'Monat (JJJJ-MM)'}, {k: 'ziel', l: 'Umsatzziel je Person €', t: 'num'}, {k: 'pct', l: 'Prämie % vom Umsatz über Ziel', t: 'num'}]},
  praemienschluessel: {t: 'Prämienschlüssel', ic: 'percent', sub: 'Prämiensatz je Warengruppe (z. B. Ski höher als Accessoires)', cols: [{k: 'name', l: 'Bezeichnung'}, {k: 'warengruppe', l: 'Warengruppe', t: 'select', o: catOpts}, {k: 'pct', l: 'Prämie %', t: 'num'}]},
  preisrundung: {t: 'Preisrundung', ic: 'tag', sub: 'Endungen für Preisänderungen und Kalkulation – z. B. bis € 100 auf ,95, darüber auf volle 9', cols: [{k: 'name', l: 'Regel'}, {k: 'von', l: 'ab €', t: 'num'}, {k: 'bis', l: 'bis €', t: 'num'}, {k: 'endung', l: 'Endung (z. B. 0.95 oder 9)', t: 'num'}],
    seed: [{id: 'R1', name: 'bis 100 → ,95', von: 0, bis: 99.99, endung: 0.95}, {id: 'R2', name: 'ab 100 → 9,–', von: 100, bis: 99999, endung: 9}]},
  preisgruppe: {t: 'Preisgruppen', ic: 'percent', sub: 'Rabattgruppen für Kund:innen (Feld „Preisgruppe“ am Kunden) – wird an der Kasse automatisch angeboten', cols: [{k: 'name', l: 'Preisgruppe'}, {k: 'pct', l: 'Rabatt %', t: 'num'}, {k: 'warengruppen', l: 'nur Warengruppen (leer = alle)', t: 'multi', o: catOpts, w: 240}]},
  artikelmerkmal: {t: 'Artikelmerkmale', ic: 'sliders', sub: 'Zusätzliche Merkmale mit Auswahlwerten – erscheinen als Felder in der Artikelmaske', cols: [{k: 'name', l: 'Merkmal'}, {k: 'werte', l: 'Werte', t: 'list', w: 320}, {k: 'warengruppen', l: 'für Warengruppen', t: 'multi', o: catOpts}]},
  webattribut: {t: 'Webshop Artikelattribute', ic: 'globe', sub: 'Attribute, die das Schaufenster/der Webshop als Filter anzeigt', cols: [{k: 'name', l: 'Attribut'}, {k: 'feld', l: 'Artikelfeld'}, {k: 'filter', l: 'als Filter', t: 'check'}]},
  webuebersetzung: {t: 'Webshop Übersetzung', ic: 'globe', sub: 'Übersetzungen für Kategorien und Attribute', cols: [{k: 'name', l: 'Deutsch'}, {k: 'en', l: 'Englisch'}, {k: 'it', l: 'Italienisch'}]},
  bildkategorie: {t: 'Bilder Kategorien', ic: 'image', sub: 'Bildarten je Artikel (Hauptbild, Detail, Model, Lifestyle)', cols: [{k: 'name', l: 'Kategorie'}, {k: 'shop', l: 'im Schaufenster', t: 'check'}], seed: [{id: 'HAUPT', name: 'Hauptbild', shop: true}, {id: 'DETAIL', name: 'Detail', shop: true}, {id: 'MODEL', name: 'Model', shop: true}]},
  artikeltext: {t: 'Artikeltexte', ic: 'edit', sub: 'Beschreibungstexte je Artikel und Sprache – für Schaufenster und Etiketten', cols: [{k: 'artikel', l: 'Artikel-Nr.'}, {k: 'sprache', l: 'Sprache', t: 'select', o: () => stOpts('sprache').length ? stOpts('sprache') : [['de', 'Deutsch'], ['en', 'Englisch']]}, {k: 'text', l: 'Text', t: 'area', w: 380}]},
  retourentyp: {t: 'Retourentypen', ic: 'undo', sub: 'Arten von Rückgaben – mit oder ohne Wiedereinlagerung', cols: [{k: 'name', l: 'Retourentyp'}, {k: 'bestand', l: 'bucht Bestand zurück', t: 'check'}, {k: 'lieferant', l: 'an Lieferanten', t: 'check'}],
    seed: [{id: 'UMT', name: 'Umtausch', bestand: true}, {id: 'DEF', name: 'Defekt', bestand: false, lieferant: true}, {id: 'FEHL', name: 'Fehlkauf', bestand: true}]},
  bestandsgrund: {t: 'Gründe Bestandsänderung', ic: 'edit', sub: 'Auswahl bei der Bestandskorrektur', cols: [{k: 'name', l: 'Grund'}, {k: 'richtung', l: 'Richtung', t: 'select', o: [['beide', 'Zu- und Abgang'], ['ab', 'nur Abgang'], ['zu', 'nur Zugang']]}],
    seed: [{id: 'BRUCH', name: 'Bruch / Defekt', richtung: 'ab'}, {id: 'DIEB', name: 'Diebstahl', richtung: 'ab'}, {id: 'FUND', name: 'Fund', richtung: 'zu'}, {id: 'EIGEN', name: 'Eigenverbrauch', richtung: 'ab'}, {id: 'ZAEHL', name: 'Zählfehler', richtung: 'beide'}]},
  bonusprozent: {t: 'Bonus Prozentkalkulation', ic: 'percent', sub: 'Umsatzstaffel für den Kundenbonus – ab Jahresumsatz gilt ein höherer Punktesatz (Faktor)', cols: [{k: 'name', l: 'Stufe'}, {k: 'ab', l: 'ab Jahresumsatz €', t: 'num'}, {k: 'faktor', l: 'Punkte-Faktor', t: 'num'}],
    seed: [{id: 'B1', name: 'Basis', ab: 0, faktor: 1}, {id: 'B2', name: 'Silber', ab: 1000, faktor: 1.5}, {id: 'B3', name: 'Gold', ab: 3000, faktor: 2}]},
  statistikfilter: {t: 'Statistikfilter', ic: 'filter', sub: 'Vordefinierte Filter für Flexanalyse und Berichte', cols: [{k: 'name', l: 'Filter'}, {k: 'dimension', l: 'Dimension', t: 'select', o: () => AN_DIMS.map(d => [d[0], d[1]])}, {k: 'wert', l: 'Wert'}],
    seed: [{id: 'F01', name: 'Nur Ski & Touren', dimension: 'warengruppe', wert: 'ski'}, {id: 'F02', name: 'Samstag', dimension: 'wochentag', wert: 'Sa'}]},
  land: {t: 'Länder', ic: 'globe', sub: 'Länder mit ISO-Code, EU-Zugehörigkeit (Intrastat) und Normalsteuersatz', cols: [{k: 'name', l: 'Land'}, {k: 'eu', l: 'EU', t: 'check'}, {k: 'ust', l: 'USt %', t: 'num'}, {k: 'vorwahl', l: 'Vorwahl'}],
    seed: [{id: 'AT', name: 'Österreich', eu: true, ust: 20, vorwahl: '43'}, {id: 'DE', name: 'Deutschland', eu: true, ust: 19, vorwahl: '49'}, {id: 'IT', name: 'Italien', eu: true, ust: 22, vorwahl: '39'}, {id: 'CH', name: 'Schweiz', eu: false, ust: 8.1, vorwahl: '41'}, {id: 'LI', name: 'Liechtenstein', eu: false, ust: 8.1, vorwahl: '423'}, {id: 'SI', name: 'Slowenien', eu: true, ust: 22, vorwahl: '386'}, {id: 'CN', name: 'China', eu: false, ust: 0, vorwahl: '86'}, {id: 'VN', name: 'Vietnam', eu: false, ust: 0, vorwahl: '84'}]},
  // ── Kunden
  titel: {t: 'Titel', ic: 'idcard', sub: 'Akademische Titel für Anschrift und Briefe', cols: [{k: 'name', l: 'Titel'}, {k: 'nachgestellt', l: 'nachgestellt', t: 'check'}], seed: [{id: 'DR', name: 'Dr.'}, {id: 'MAG', name: 'Mag.'}, {id: 'ING', name: 'Ing.'}, {id: 'DI', name: 'DI'}, {id: 'BSC', name: 'BSc', nachgestellt: true}, {id: 'MSC', name: 'MSc', nachgestellt: true}]},
  anrede: {t: 'Anreden', ic: 'user', sub: 'Anrede und Briefanrede', cols: [{k: 'name', l: 'Anrede'}, {k: 'brief', l: 'Briefanrede', w: 260}], seed: [{id: 'FRAU', name: 'Frau', brief: 'Sehr geehrte Frau'}, {id: 'HERR', name: 'Herr', brief: 'Sehr geehrter Herr'}, {id: 'DIV', name: 'Divers', brief: 'Guten Tag'}, {id: 'FIRMA', name: 'Firma', brief: 'Sehr geehrte Damen und Herren'}]},
  sprache: {t: 'Sprachen', ic: 'globe', sub: 'Korrespondenzsprachen für Kund:innen, Belege und Vorlagen', cols: [{k: 'name', l: 'Sprache'}], seed: [{id: 'de', name: 'Deutsch'}, {id: 'en', name: 'Englisch'}, {id: 'it', name: 'Italienisch'}, {id: 'nl', name: 'Niederländisch'}]},
  kundenmerkmal: {t: 'Kundenmerkmale', ic: 'sliders', sub: 'Merkmale mit Auswahlwerten – erscheinen als Felder im Kundenprofil und als Filter für Kampagnen', cols: [{k: 'name', l: 'Merkmal'}, {k: 'werte', l: 'Werte', t: 'list', w: 320}], seed: [{id: 'SKI', name: 'Skifahrer:in', werte: ['Anfänger', 'Fortgeschritten', 'Experte']}, {id: 'INT', name: 'Interessen', werte: ['Skitouren', 'Wandern', 'Klettern', 'Langlauf']}]},
  hotel: {t: 'Hotels', ic: 'building', sub: 'Partnerhotels mit Provision – Gäste beim Verkauf zuordnen (Feld „Hotel“), Abrechnung unter „Hotel-Provisionen“', cols: [{k: 'name', l: 'Hotel'}, {k: 'ort', l: 'Ort'}, {k: 'kontakt', l: 'Kontakt / E-Mail'}, {k: 'provision', l: 'Provision %', t: 'num'}, {k: 'rabatt', l: 'Gästerabatt %', t: 'num'}]},
  ansprechpartner: {t: 'Ansprechpartner', ic: 'users', sub: 'Kontaktpersonen bei Firmen- und Vereinskund:innen', cols: [{k: 'kunde', l: 'Kunde (Nr.)', t: 'select', o: () => CUSTOMERS.map(c => [c.id, `${c.name} · ${c.id}`])}, {k: 'name', l: 'Name'}, {k: 'funktion', l: 'Funktion'}, {k: 'telefon', l: 'Telefon'}, {k: 'email', l: 'E-Mail'}]},
  kundengruppe: {t: 'Kundengruppen', ic: 'users', sub: 'Gruppen für WhatsApp-, SMS- und E-Mail-Kampagnen – nach Stufe, Ort, Merkmal oder Umsatz', cols: [{k: 'name', l: 'Gruppe'}, {k: 'stufe', l: 'Stufe enthält'}, {k: 'ort', l: 'Ort/PLZ beginnt mit'}, {k: 'merkmal', l: 'Merkmal = Wert (z. B. Interessen=Skitouren)'}, {k: 'umsatz_ab', l: 'Umsatz ab €', t: 'num'}, {k: 'nur_einwilligung', l: 'nur mit Einwilligung', t: 'check'}],
    seed: [{id: 'VIP', name: 'Stammkund:innen ab € 1.000', umsatz_ab: 1000, nur_einwilligung: true}, {id: 'CLUB', name: 'Gipfel-Club', stufe: 'Gipfel-Club', nur_einwilligung: true}]},
  watemplate: {t: 'WhatsApp Templates', ic: 'chat', sub: 'Eigene Vorlagen – Platzhalter {vorname}, {name}, {punkte}. Für die Business-API zusätzlich den freigegebenen Template-Namen eintragen', cols: [{k: 'name', l: 'Vorlage'}, {k: 'text', l: 'Text', t: 'area', w: 360}, {k: 'meta', l: 'Meta-Template-Name'}, {k: 'sprache', l: 'Sprache', w: 70}]},
  smsvorlage: {t: 'SMS Vorlagen', ic: 'chat', sub: 'Kurztexte für SMS (max. 160 Zeichen je Teil) – Platzhalter {vorname}, {name}, {punkte}', cols: [{k: 'name', l: 'Vorlage'}, {k: 'text', l: 'Text', t: 'area', w: 380}],
    seed: [{id: 'ABHOL', name: 'Abholbereit', text: 'Hallo {vorname}, Ihre Ware liegt zur Abholung bereit. Ihr Team von {firma}'}, {id: 'SERVICE', name: 'Service fertig', text: 'Hallo {vorname}, Ihr Ski-Service ist fertig. Ihr Team von {firma}'}]},
  // ── Versand
  pakettyp: {t: 'Paket-Typen', ic: 'box', sub: 'Kartongrößen und Gewichtsgrenzen – Vorauswahl beim Versandetikett', cols: [{k: 'name', l: 'Paket-Typ'}, {k: 'l', l: 'L cm', t: 'num', w: 70}, {k: 'b', l: 'B cm', t: 'num', w: 70}, {k: 'h', l: 'H cm', t: 'num', w: 70}, {k: 'kg', l: 'max. kg', t: 'num', w: 80}, {k: 'preis', l: 'Porto €', t: 'num', w: 90}],
    seed: [{id: 'S', name: 'Klein (Schuhkarton)', l: 35, b: 25, h: 15, kg: 2, preis: 4.9}, {id: 'M', name: 'Mittel', l: 60, b: 40, h: 30, kg: 10, preis: 6.9}, {id: 'SKI', name: 'Skisack', l: 200, b: 30, h: 20, kg: 15, preis: 19.9}]},
  spediteur: {t: 'Spediteur', ic: 'truck', sub: 'Paketdienste mit Sendungsverfolgung – {nr} wird durch die Sendungsnummer ersetzt', cols: [{k: 'name', l: 'Spediteur'}, {k: 'tracking', l: 'Tracking-Link', w: 320}, {k: 'kundennr', l: 'Kundennummer'}],
    seed: [{id: 'POST', name: 'Österreichische Post', tracking: 'https://www.post.at/s/sendungsdetails?snr={nr}'}, {id: 'DPD', name: 'DPD', tracking: 'https://tracking.dpd.de/status/de_DE/parcel/{nr}'}, {id: 'GLS', name: 'GLS', tracking: 'https://gls-group.com/AT/de/paketverfolgung?match={nr}'}, {id: 'DHL', name: 'DHL', tracking: 'https://www.dhl.com/at-de/home/tracking.html?tracking-id={nr}'}]},
  // ── Einstellungen
  etikettentyp: {t: 'Etikettentypen', ic: 'tag', sub: 'Formate für Etikettendruck – Größe und Inhalt', cols: [{k: 'name', l: 'Typ'}, {k: 'b', l: 'Breite mm', t: 'num'}, {k: 'h', l: 'Höhe mm', t: 'num'}, {k: 'felder', l: 'Inhalt', t: 'list', w: 260, ph: 'Marke,Name,Größe,Preis,EAN'}], seed: [{id: 'STD', name: 'Standard 50×30', b: 50, h: 30, felder: ['Marke', 'Name', 'Farbe', 'Größe', 'Preis', 'EAN']}, {id: 'SCHUH', name: 'Schuhkarton 70×40', b: 70, h: 40, felder: ['Marke', 'Name', 'Größe', 'Preis', 'EAN']}]},
  etikettendrucker: {t: 'Einstellungen Etikettendrucker', ic: 'printer', sub: 'Etikettendrucker je Arbeitsplatz', cols: [{k: 'name', l: 'Drucker'}, {k: 'typ', l: 'Typ', t: 'select', o: [['zpl', 'ZPL (Zebra)'], ['windows', 'Windows-Drucker'], ['pdf', 'PDF']]}, {k: 'dpi', l: 'DPI', t: 'num'}, {k: 'platz', l: 'Arbeitsplatz'}]},
  esl: {t: 'Elektronische Etiketten', ic: 'tag', sub: 'Regal-Etiketten (ESL) – Zuordnung Etikett ↔ Artikel; Preise werden über den Export an das ESL-System übergeben', cols: [{k: 'name', l: 'Etikett-ID'}, {k: 'artikel', l: 'Artikel-Nr.'}, {k: 'platz', l: 'Platz'}]},
  scannerregel: {t: 'Scanner-Regeln', ic: 'barcode', sub: 'Muster für gescannte Codes (regulärer Ausdruck) – z. B. Gutschein-, Kunden- oder Gewichts-Codes', cols: [{k: 'name', l: 'Regel'}, {k: 'muster', l: 'Muster (RegEx)', w: 220}, {k: 'aktion', l: 'Aktion', t: 'select', o: [['gutschein', 'Gutschein einlösen'], ['kunde', 'Kunde wählen'], ['artikel', 'Artikel (Teil als EAN)'], ['beleg', 'Beleg öffnen']]}, {k: 'gruppe', l: 'Teil (Gruppe)', t: 'num', w: 90}],
    seed: [{id: 'GS', name: 'Gutschein', muster: '^GS-[A-Z0-9-]+$', aktion: 'gutschein', gruppe: 0}, {id: 'KD', name: 'Kundenkarte', muster: '^K-\\d{5}$', aktion: 'kunde', gruppe: 0}]},
  mwsttyp: {t: 'MwSt.-Typen', ic: 'percent', sub: 'Steuersätze mit Kontierung für die FiBu', cols: [{k: 'name', l: 'Bezeichnung'}, {k: 'satz', l: 'Satz %', t: 'num'}, {k: 'konto', l: 'Erlöskonto'}, {k: 'code', l: 'Steuercode'}],
    seed: [{id: 'N', name: 'Normalsatz', satz: 20, konto: '4000', code: '20'}, {id: 'E', name: 'Ermäßigt', satz: 10, konto: '4010', code: '10'}, {id: 'E13', name: 'Ermäßigt 13 %', satz: 13, konto: '4013', code: '13'}, {id: 'F', name: 'Steuerfrei', satz: 0, konto: '4090', code: '0'}]},
  mwstset: {t: 'MwSt.-Set', ic: 'percent', sub: 'Steuersatz-Kombination je Land (Filialen im Ausland, Versand)', cols: [{k: 'name', l: 'Set'}, {k: 'land', l: 'Land', t: 'select', o: () => stOpts('land')}, {k: 'normal', l: 'Normal %', t: 'num'}, {k: 'ermaessigt', l: 'Ermäßigt %', t: 'num'}], seed: [{id: 'AT', name: 'Österreich', land: 'AT', normal: 20, ermaessigt: 10}, {id: 'DE', name: 'Deutschland', land: 'DE', normal: 19, ermaessigt: 7}]},
  artikelservice: {t: 'Artikelservice', ic: 'wrench', sub: 'Dienstleistungen mit Preis und Dauer (Ski-Service, Bindungsmontage, Schuhanpassung) – an der Kasse unter „Service“', cols: [{k: 'name', l: 'Service'}, {k: 'preis', l: 'Preis €', t: 'num'}, {k: 'dauer', l: 'Dauer (min)', t: 'num'}, {k: 'ust', l: 'USt %', t: 'num'}]},
  uebersetzung: {t: 'Übersetzung', ic: 'globe', sub: 'Eigene Texte für Bon und Belege in weiteren Sprachen', cols: [{k: 'name', l: 'Deutsch', w: 220}, {k: 'en', l: 'Englisch', w: 220}, {k: 'it', l: 'Italienisch', w: 220}], seed: [{id: 'DANKE', name: 'Vielen Dank für Ihren Einkauf!', en: 'Thank you for your purchase!', it: 'Grazie per il Suo acquisto!'}, {id: 'UMTAUSCH', name: 'Umtausch binnen 30 Tagen mit Beleg.', en: 'Exchange within 30 days with receipt.', it: 'Cambio entro 30 giorni con scontrino.'}]},
  gutscheintyp: {t: 'Gutscheintypen', ic: 'gift', sub: 'Gutscheinarten mit Gültigkeit und Vorgabewert', cols: [{k: 'name', l: 'Typ'}, {k: 'wert', l: 'Vorgabewert €', t: 'num'}, {k: 'monate', l: 'gültig Monate', t: 'num'}, {k: 'pin', l: 'PIN Pflicht', t: 'check'}],
    seed: [{id: 'WERT', name: 'Wertgutschein', wert: 50, monate: 36}, {id: 'AKTION', name: 'Aktionsgutschein', wert: 10, monate: 3}, {id: 'ERSATZ', name: 'Ersatzgutschein (Retoure)', wert: 0, monate: 36}]},
  extgutscheintyp: {t: 'Externe Gutscheintypen', ic: 'gift', sub: 'Fremdgutscheine (Ort, Region, Verbund) mit Provision – Zahlart „Fremdgutschein“ an der Kasse', cols: [{k: 'name', l: 'Gutschein'}, {k: 'aussteller', l: 'Aussteller'}, {k: 'provision', l: 'Provision %', t: 'num'}, {k: 'konto', l: 'Verrechnungskonto'}]},
  preisgrund: {t: 'Preis Änderungsgründe', ic: 'tag', sub: 'Auswahl bei Preisänderungen', cols: [{k: 'name', l: 'Grund'}], seed: [{id: 'SAISON', name: 'Saisonabschrift'}, {id: 'AKTION', name: 'Aktion'}, {id: 'LIEF', name: 'Lieferantenpreis geändert'}, {id: 'FEHLER', name: 'Korrektur'}]},
  belegzusatz: {t: 'Beleg Zusatzinformationen', ic: 'receipt', sub: 'Zusätzliche Angaben, die an der Kasse zum Beleg erfasst werden (z. B. Hotel, Zimmernummer, Verein)', cols: [{k: 'name', l: 'Feld'}, {k: 'werte', l: 'Auswahlwerte (leer = Freitext)', t: 'list', w: 280}, {k: 'pflicht', l: 'Pflicht', t: 'check'}]},
  festerrabatt: {t: 'Feste Rabatte', ic: 'percent', sub: 'Rabatt-Schnellwahl an der Kasse (Mitarbeiter, Verein, Beschädigt …) – Auswertung unter Analyse', cols: [{k: 'name', l: 'Bezeichnung'}, {k: 'pct', l: 'Rabatt %', t: 'num'}, {k: 'freigabe', l: 'Freigabe nötig', t: 'check'}],
    seed: [{id: 'MA', name: 'Mitarbeiterrabatt', pct: 20, freigabe: true}, {id: 'VEREIN', name: 'Vereinsrabatt', pct: 10}, {id: 'BESCH', name: 'Beschädigte Ware', pct: 30, freigabe: true}]},
  zusatzbuchung: {t: 'Zusatz Buchungstypen', ic: 'cash', sub: 'Eigene Kassenbuch-Buchungen (z. B. Trinkgeld, Porto, Reinigung) mit Konto', cols: [{k: 'name', l: 'Buchungstyp'}, {k: 'richtung', l: 'Richtung', t: 'select', o: [['ein', 'Einlage'], ['aus', 'Entnahme']]}, {k: 'konto', l: 'Konto'}],
    seed: [{id: 'PORTO', name: 'Porto', richtung: 'aus', konto: '7380'}, {id: 'TRINK', name: 'Trinkgeld-Kassa', richtung: 'ein', konto: '3600'}]},
  inventurort: {t: 'Inventurorte', ic: 'grid', sub: 'Zählbereiche (Regale, Lager, Schaufenster) – Zählungen je Ort erfassen', cols: [{k: 'name', l: 'Ort'}, {k: 'filiale', l: 'Filiale', t: 'select', o: storeOpts}, {k: 'bereich', l: 'Bereich'}, {k: 'zaehler', l: 'Zählteam'}]},
  altersbewertung: {t: 'Altersbewertung Prozentsätze', ic: 'percent', sub: 'Abwertung des Lagerwerts nach Alter (Monate seit Wareneingang) – für Inventurbewertung und Bilanz', cols: [{k: 'name', l: 'Stufe'}, {k: 'ab', l: 'ab Monaten', t: 'num'}, {k: 'pct', l: 'Abwertung %', t: 'num'}],
    seed: [{id: 'A1', name: 'bis 6 Monate', ab: 0, pct: 0}, {id: 'A2', name: '6–12 Monate', ab: 6, pct: 20}, {id: 'A3', name: '12–24 Monate', ab: 12, pct: 50}, {id: 'A4', name: 'über 24 Monate', ab: 24, pct: 80}]},
  analysekategorie: {t: 'Flexanalysekategorie', ic: 'folder', sub: 'Ordner für gespeicherte Analysen', cols: [{k: 'name', l: 'Kategorie'}], seed: [{id: 'VK', name: 'Verkauf'}, {id: 'SORT', name: 'Sortiment'}, {id: 'PERS', name: 'Personal'}]},
  indikator: {t: 'Wert-Indikator-Sets', ic: 'target', sub: 'Ampeln für Kennzahlen in der Flexanalyse – grün ab, gelb ab, sonst rot', cols: [{k: 'name', l: 'Set'}, {k: 'kennzahl', l: 'Kennzahl', t: 'select', o: () => AN_MEAS.map(m => [m[0], m[1]])}, {k: 'gruen', l: 'grün ab', t: 'num'}, {k: 'gelb', l: 'gelb ab', t: 'num'}],
    seed: [{id: 'RE', name: 'Rohertrag', kennzahl: 'rohertrag', gruen: 1000, gelb: 200}]},
  // ── EDI / Webshop
  edilieferant: {t: 'Lieferanten EDI-Einstellungen', ic: 'swap', sub: 'Format und Nachrichtentypen je Lieferant (die GLN steht im Lieferanten unter Stammdaten › Lieferanten)', cols: [{k: 'lieferant', l: 'Lieferant', t: 'select', o: supOpts}, {k: 'gln', l: 'GLN (ersatzweise)'}, {k: 'nachrichten', l: 'Nachrichten', t: 'list', ph: 'PRICAT,ORDERS,ORDRSP,DESADV,INVOIC,SLSRPT,INVRPT'}, {k: 'anbindung', l: 'Anbindung', t: 'select', o: () => stOpts('edianbindung')}, {k: 'auto', l: 'automatisch verarbeiten', t: 'check'}]},
  edianbindung: {t: 'Anbindungen', ic: 'link', sub: 'Übertragungswege zu EDI-Partnern und Clearingstellen', cols: [{k: 'name', l: 'Anbindung'}, {k: 'typ', l: 'Typ', t: 'select', o: [['ordner', 'Ordner (Dateiaustausch)'], ['sftp', 'SFTP (über Sync-Tool)'], ['as2', 'AS2 (über Clearing)'], ['api', 'Web-API']]}, {k: 'adresse', l: 'Adresse / Pfad', w: 280}, {k: 'partner', l: 'Clearing / Partner'}],
    seed: [{id: 'ORDNER', name: 'Lokaler EDI-Ordner', typ: 'ordner', adresse: '', partner: ''}]},
  edijob: {t: 'Hintergrundjobs', ic: 'clock', sub: 'Automatische Aufgaben – laufen, solange Kontor geöffnet ist', cols: [{k: 'name', l: 'Job'}, {k: 'typ', l: 'Aufgabe', t: 'select', o: () => JOB_TYPES}, {k: 'minuten', l: 'alle … Minuten', t: 'num'}, {k: 'letzter', l: 'zuletzt', t: 'ro'}],
    seed: [{id: 'EDI-IMPORT', name: 'EDI-Eingang einlesen', typ: 'edi_import', minuten: 30}, {id: 'PREISE', name: 'Geplante Preisänderungen', typ: 'preise', minuten: 60}, {id: 'REPORTS', name: 'Geplante Berichte', typ: 'reports', minuten: 60}]},
  edimapwg: {t: 'Zuordnung Warengruppen', ic: 'swap', sub: 'Warengruppen-Codes der Lieferanten (EDI/PRICAT) auf eigene Warengruppen', cols: [{k: 'lieferant', l: 'Lieferant', t: 'select', o: supOpts}, {k: 'code', l: 'Code des Lieferanten'}, {k: 'warengruppe', l: 'Warengruppe', t: 'select', o: catOpts}]},
  edimapgr: {t: 'Zuordnung Größen', ic: 'swap', sub: 'Größenbezeichnungen der Lieferanten auf eigene Größen', cols: [{k: 'lieferant', l: 'Lieferant', t: 'select', o: supOpts}, {k: 'code', l: 'Größe beim Lieferanten'}, {k: 'groesse', l: 'eigene Größe'}]},
  wgschema: {t: 'Warengruppen Schemas', ic: 'grid', sub: 'Externe Warengruppen-Schemas (z. B. GS1 GPC, Verbands-Schlüssel) je Warengruppe', cols: [{k: 'name', l: 'Schema'}, {k: 'warengruppe', l: 'Warengruppe', t: 'select', o: catOpts}, {k: 'code', l: 'Code im Schema'}]},
  webkategorie: {t: 'Webshop-Kategorie', ic: 'folder', sub: 'Kategorien im Schaufenster/Webshop mit zugeordneten Warengruppen', cols: [{k: 'name', l: 'Kategorie'}, {k: 'warengruppen', l: 'Warengruppen', t: 'multi', o: catOpts, w: 300}, {k: 'sichtbar', l: 'sichtbar', t: 'check'}]},
  webfilter: {t: 'Artikel-Filter (Webshop)', ic: 'filter', sub: 'Artikel vom Webshop ausschließen – nach Marke, Warengruppe, Feld oder Mindestbestand', cols: [{k: 'name', l: 'Regel'}, {k: 'feld', l: 'Feld', t: 'select', o: [['brand', 'Marke'], ['cat', 'Warengruppe'], ['id', 'Artikel-Nr.'], ['minbestand', 'Bestand unter']]}, {k: 'wert', l: 'Wert'}]},
  webversand: {t: 'Versand (Webshop)', ic: 'truck', sub: 'Versandarten und Kosten für Webshop-Bestellungen', cols: [{k: 'name', l: 'Versandart'}, {k: 'preis', l: 'Kosten €', t: 'num'}, {k: 'frei_ab', l: 'versandkostenfrei ab €', t: 'num'}, {k: 'spediteur', l: 'Spediteur', t: 'select', o: () => stOpts('spediteur')}],
    seed: [{id: 'STD', name: 'Standard', preis: 5.9, frei_ab: 100, spediteur: 'POST'}, {id: 'ABH', name: 'Abholung in der Filiale', preis: 0, frei_ab: 0}]},
  webfiliale: {t: 'Webshop-Service Filialen', ic: 'store', sub: 'Welche Filialen Bestand für den Webshop liefern und Bestellungen ausführen', cols: [{k: 'name', l: 'Filiale'}, {k: 'bestand', l: 'liefert Bestand', t: 'check'}, {k: 'versand', l: 'versendet', t: 'check'}, {k: 'abholung', l: 'Abholung', t: 'check'}]},
  reportplan: {t: 'Report Zeitsteuerung', ic: 'clock', sub: 'Gespeicherte Analysen automatisch per E-Mail verschicken (CSV im Anhang als Tabelle)', cols: [{k: 'name', l: 'Bericht'}, {k: 'vorlage', l: 'Analyse-Vorlage', t: 'select', o: () => stOpts('analysevorlage')}, {k: 'intervall', l: 'Intervall', t: 'select', o: [['taeglich', 'täglich'], ['woechentlich', 'wöchentlich (Mo)'], ['monatlich', 'monatlich (1.)']]}, {k: 'empfaenger', l: 'Empfänger (E-Mail)', w: 240}, {k: 'letzter', l: 'zuletzt', t: 'ro'}]},
};
const MELD_EVT = [['avis.eingetroffen', 'Avis eingetroffen'], ['reservierung.angefragt', 'Reservierung über Schaufenster'], ['webbestellung.neu', 'Neue Webshop-Bestellung'], ['bestand.minimum', 'Bestand unter Minimum'], ['rechnung.faellig', 'Eingangsrechnung fällig'], ['edi.fehler', 'EDI-Fehler'], ['tagesabschluss', 'Tagesabschluss erstellt'], ['backup.fehler', 'Datensicherung fehlgeschlagen']];
const JOB_TYPES = [['edi_import', 'EDI-Eingang einlesen'], ['preise', 'Geplante Preisänderungen ausführen'], ['reports', 'Geplante Berichte versenden'], ['webshop', 'Webshop-Bestellungen prüfen'], ['sicherung', 'Datensicherung prüfen']];

async function loadStamm(force) {
  if (STAMM.loaded && !force) return;
  if (DESKTOP) { try { STAMM.data = await invoke('stamm_all'); } catch { STAMM.data = {}; } }
  else STAMM.data = persist.get('stamm', {});
  for (const [k, d] of Object.entries(STAMM_DEF)) if (!STAMM.data[k] && d.seed) STAMM.data[k] = d.seed.map(r => ({...r, _aktiv: true}));
  STAMM.loaded = true; applyStamm();
}
/** Warengruppen und Hausfarben in Artikel/Kasse übernehmen */
function applyStamm() {
  { const idx = new Map(CATS.map(c => [c.id, c])); for (const r of stActive('warengruppe')) { const c = idx.get(r.id); if (c) c.name = r.name || c.name; else { const n = {id: r.id, name: r.name || r.id}; CATS.push(n); idx.set(r.id, n); } } }
  // Sobald Advarics-Warengruppen vorhanden sind, ersetzen sie die Standardliste vollständig
  { const act = stActive('warengruppe'); if (act.some(r => String(r.id).startsWith('adv-'))) { const ids = new Set(act.map(r => r.id)); for (let i = CATS.length - 1; i > 0; i--) if (!ids.has(CATS[i].id)) CATS.splice(i, 1); } }
  for (const r of stActive('hausfarbe')) COLORS[r.id] = [r.name || r.id, r.hex || '#888888'];
  const order = stRows('groessenfolge').map(r => r.name || r.id);
  if (order.length) ART.forEach(a => a.sizes.sort((x, y) => (order.indexOf(x) + 1 || 999) - (order.indexOf(y) + 1 || 999)));
}
async function stammSave(kind, rows) {
  if (DESKTOP) await invoke('stamm_save', {kind, rows, user: S.user.name});
  else { const all = persist.get('stamm', {}); all[kind] = rows; persist.set('stamm', all); }
  STAMM.data[kind] = rows.map(r => ({...r}));
  applyStamm(); Hooks.emit('stamm.saved', {tabelle: kind, zeilen: rows.length});
}

/* ── Tabellen-Editor ── */
const STE = {};   // Bearbeitungsstand je Tabelle {rows, q, dirty}
const stCell = (c, r, i) => {
  const v = r[c.k], a = `data-stc="${c.k}" data-sti="${i}"`, w = c.w ? `style="min-width:${c.w}px"` : '';
  const opts = typeof c.o === 'function' ? c.o() : c.o || [];
  if (c.t === 'check') return `<input type="checkbox" ${a} ${v ? 'checked' : ''}>`;
  if (c.t === 'ro') return `<span class="muted" style="font-size:12px">${esc(v ? fmtTs(v) : '–')}</span>`;
  if (c.t === 'select' && opts.length > 150) { const cur = opts.find(([x]) => String(x) === String(v ?? '')); return `<select class="input select" ${a} ${w} data-lazy><option value="">–</option>${cur ? `<option value="${esc(cur[0])}" selected>${esc(cur[1])}</option>` : ''}</select>`; }
  if (c.t === 'select') return `<select class="input select" ${a} ${w}><option value="">–</option>${opts.map(([x, l]) => `<option value="${esc(x)}" ${String(v ?? '') === String(x) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  if (c.t === 'multi') { const sel = new Set(v || []); return `<div ${w} style="display:flex;flex-wrap:wrap;gap:4px;${c.w ? `min-width:${c.w}px` : ''}">${opts.map(([x, l]) => `<label class="chip" style="cursor:pointer;height:24px;font-size:11.5px"><input type="checkbox" data-stm="${c.k}" data-sti="${i}" value="${esc(x)}" ${sel.has(x) ? 'checked' : ''} style="margin:0 4px 0 0">${esc(l)}</label>`).join('')}</div>`; }
  if (c.t === 'area') return `<textarea class="input" rows="2" ${a} ${w} style="height:auto;padding:6px 10px;${c.w ? `min-width:${c.w}px` : ''}">${esc(v ?? '')}</textarea>`;
  if (c.t === 'color') return `<input type="color" ${a} value="${esc(v || '#888888')}" style="width:44px;height:32px;border:0;background:none">`;
  const type = c.t === 'date' ? 'date' : c.t === 'time' ? 'time' : 'text';
  const val = c.t === 'list' ? (v || []).join(', ') : c.t === 'num' && v != null && v !== '' ? String(v).replace('.', ',') : v ?? '';
  return `<input class="input ${c.t === 'num' ? 'num' : ''}" type="${type}" ${a} value="${esc(val)}" ${c.ph ? `placeholder="${esc(c.ph)}"` : ''} ${w} ${c.t === 'num' ? 'inputmode="decimal" style="max-width:110px"' : ''}>`;
};
function stammPage(kind, page, extra = {}) {
  const D = STAMM_DEF[kind];
  registerPage(page, {title: extra.title || D.t, sub: () => `${stRows(kind).length} Einträge`, render: () => renderStamm(kind, page, extra)});
  VIEW_PERM[page] ||= extra.perm || 'einstellungen';
}
async function renderStamm(kind, page, extra = {}) {
  const v = $('#view-' + page), D = STAMM_DEF[kind];
  await loadStamm();
  const st = STE[kind] ||= {rows: null, q: '', dirty: false};
  if (!st.rows || !st.dirty) st.rows = stRows(kind).map(r => ({...r}));
  const n = norm(st.q);
  const visAll = st.rows.map((r, i) => [r, i]).filter(([r]) => !n || norm(Object.values(r).join(' ')).includes(n));
  const STMAX = 200, vis = visAll.slice(0, STMAX);
  v.innerHTML = `<div class="cv">${pageHead(extra.title || D.t, D.sub, `<button class="btn btn-secondary" data-stimp="${kind}">${ic('download', 'i-sm')}CSV-Import</button><button class="btn btn-secondary" data-stexp="${kind}">${ic('upload', 'i-sm')}CSV-Export</button><button class="btn btn-primary" data-stsave="${kind}" ${st.dirty ? '' : 'disabled'}>${ic('check', 'i-sm')}Speichern</button>`)}
    ${extra.above ? extra.above() : ''}
    <div class="filters"><input class="input" data-stq="${kind}" value="${esc(st.q)}" placeholder="In ${esc(D.t)} suchen …" style="max-width:320px"><span class="sp" style="flex:1"></span>${st.dirty ? `<span class="pill warn" style="height:24px">nicht gespeichert</span>` : ''}<button class="btn btn-secondary" data-stadd="${kind}">${ic('plus', 'i-sm')}Zeile</button></div>
    <div class="card" style="overflow:auto">${st.rows.length ? `<table class="tbl" style="margin:0"><thead><tr><th style="padding-left:16px;width:120px">Kürzel</th>${D.cols.map(c => `<th>${esc(c.l)}</th>`).join('')}<th>aktiv</th><th class="r" style="padding-right:16px"></th></tr></thead><tbody>
      ${vis.map(([r, i]) => `<tr ${dndAttr(i)} style="${r._aktiv === false ? 'opacity:.55' : ''}"><td style="padding-left:16px"><input class="input mono" data-stc="id" data-sti="${i}" value="${esc(r.id || '')}" style="max-width:120px;min-width:104px"></td>${D.cols.map(c => `<td>${stCell(c, r, i)}</td>`).join('')}
        <td><button class="switch" role="switch" data-stakt="${i}" aria-checked="${r._aktiv !== false}" aria-label="aktiv"></button></td>
        <td class="r" style="padding-right:12px;white-space:nowrap">${dndGrip('Ziehen zum Sortieren')}<button class="btn btn-ghost btn-icon btn-sm" data-stmv="${i}" data-d="-1" aria-label="nach oben">${ic('chevron-up', 'i-sm')}</button><button class="btn btn-ghost btn-icon btn-sm" data-stmv="${i}" data-d="1" aria-label="nach unten">${ic('chevron-down', 'i-sm')}</button><button class="btn btn-ghost btn-icon btn-sm" data-stdel="${i}" aria-label="Löschen">${ic('trash', 'i-sm')}</button></td></tr>`).join('')}</tbody></table>`
      : `<div class="empty" style="padding:48px 20px"><div class="empty-icon">${ic(D.ic || 'list')}</div><h3>Noch keine Einträge</h3><p>„Zeile“ hinzufügen oder per CSV importieren.</p></div>`}</div>
    ${visAll.length > STMAX ? `<div class="muted" style="padding:10px 4px;font-size:13px">Angezeigt werden die ersten ${STMAX} von ${num(visAll.length)} Einträgen – zum Eingrenzen die Suche oben verwenden.</div>` : ''}
    ${extra.below ? extra.below() : ''}</div>`;
  // Zeilen per Ziehen sortieren: die ganze Zeile lässt sich greifen (in Textfeldern senkrecht ziehen)
  dndZone($('tbody', v), 'stamm:' + kind, {
    ghost: 'clone', label: ids => { const r = st.rows[+ids[0]]; return r ? (r[D.cols[0]?.k] || r.id || '') : ''; },
    reorder: (ids, ins) => {
      const i = +ids[0]; if (isNaN(i) || i < 0 || i >= st.rows.length) return;
      const j = ins ? +ins.id : st.rows.length - 1, [row] = st.rows.splice(i, 1);
      let at = ins ? (j > i ? j - 1 : j) : st.rows.length; if (ins?.after) at++;
      st.rows.splice(at, 0, row); st.dirty = true; renderStamm(kind, page, extra);
    }
  });
  v.onfocusin = e => { const t = e.target; if (t.dataset?.lazy != null && t.tagName === 'SELECT') { const c = D.cols.find(x => x.k === t.dataset.stc); const cur = t.value; t.removeAttribute('data-lazy'); t.innerHTML = `<option value="">–</option>` + c.o().map(([x, l]) => `<option value="${esc(x)}" ${String(x) === cur ? 'selected' : ''}>${esc(l)}</option>`).join(''); } };
  const mark = () => { st.dirty = true; const b = $(`[data-stsave="${kind}"]`, v); if (b) b.disabled = false; };
  v.oninput = v.onchange = e => {
    const t = e.target, i = +t.dataset.sti;
    if (t.dataset.stq != null) { if (e.type === 'change') { st.q = t.value; renderStamm(kind, page, extra); } return; }
    if (t.dataset.stm) { const r = st.rows[i]; const set = new Set(r[t.dataset.stm] || []); t.checked ? set.add(t.value) : set.delete(t.value); r[t.dataset.stm] = [...set]; mark(); return; }
    if (!t.dataset.stc || isNaN(i)) return;
    const c = D.cols.find(x => x.k === t.dataset.stc) || {k: 'id'};
    st.rows[i][c.k] = c.t === 'check' ? t.checked : c.t === 'num' ? (t.value.trim() === '' ? null : parseAmt(t.value)) : c.t === 'list' ? t.value.split(/[,;]/).map(x => x.trim()).filter(Boolean) : t.value;
    mark();
  };
  v.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.stadd) { const r = {id: '', _aktiv: true}; D.cols.forEach(c => { r[c.k] = c.t === 'list' || c.t === 'multi' ? [] : c.t === 'check' ? false : ''; }); r.id = (kind.slice(0, 3).toUpperCase() + (st.rows.length + 1)).replace(/[^A-Z0-9]/g, ''); while (st.rows.some(x => x.id === r.id)) r.id += 'X'; st.rows.push(r); st.dirty = true; renderStamm(kind, page, extra).then(() => $$(`[data-stc="${D.cols[0].k}"]`, v).at(-1)?.focus()); return; }
    if (b.dataset.stakt != null) { const r = st.rows[+b.dataset.stakt]; r._aktiv = r._aktiv === false; st.dirty = true; renderStamm(kind, page, extra); return; }
    if (b.dataset.stdel != null) { st.rows.splice(+b.dataset.stdel, 1); st.dirty = true; renderStamm(kind, page, extra); return; }
    if (b.dataset.stmv != null) { const i = +b.dataset.stmv, j = i + +b.dataset.d; if (j < 0 || j >= st.rows.length) return; [st.rows[i], st.rows[j]] = [st.rows[j], st.rows[i]]; st.dirty = true; renderStamm(kind, page, extra); return; }
    if (b.dataset.stsave) {
      try {
        await needPerm(VIEW_PERM[page] || 'einstellungen', D.t);
        const rows = st.rows.map(r => ({...r, id: String(r.id || '').trim()}));
        await stammSave(kind, rows); st.dirty = false; toast(`${D.t} gespeichert`, {t2: `${rows.length} Einträge`, type: 'pos', icon: 'check'}); renderStamm(kind, page, extra);
      } catch (err) { toast('Nicht gespeichert', {t2: String(err), type: 'warn'}); }
      return;
    }
    if (b.dataset.stexp) { stammCsvExport(kind); return; }
    if (b.dataset.stimp) { stammCsvImport(kind, page, extra); }
  };
}
function stammCsvExport(kind) {
  const D = STAMM_DEF[kind], cols = [{k: 'id', l: 'Kürzel'}, ...D.cols];
  const cell = (c, r) => { const v = r[c.k]; const s = Array.isArray(v) ? v.join('|') : v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cols.map(c => c.l).join(';'), ...(STE[kind]?.rows || stRows(kind)).map(r => cols.map(c => cell(c, r)).join(';'))].join('\r\n');
  if (!DESKTOP) { toast('Export nur in der Desktop-App'); return; }
  invoke('save_text', {name: `Kontor_${D.t.replace(/\W+/g, '_')}.csv`, content: csv, title: D.t + ' exportieren'}).then(p => p && toast('Exportiert', {t2: p, type: 'pos', icon: 'download'})).catch(e => toast('Export fehlgeschlagen', {t2: String(e), type: 'warn'}));
}
/** CSV mit Kopfzeile (Spaltennamen wie im Export, Trennzeichen ; oder ,) */
function parseCsv(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function stammCsvImport(kind, page, extra) {
  const D = STAMM_DEF[kind], cols = [{k: 'id', l: 'Kürzel'}, ...D.cols];
  const el = openLayer(`<div class="modal" style="width:min(640px,100%)" role="dialog" aria-modal="true"><div class="m-head"><div class="m-ic">${ic('download')}</div><div><h2>${esc(D.t)} importieren</h2><p>Erste Zeile = Spaltennamen: ${esc(cols.map(c => c.l).join('; '))}</p></div><button class="btn btn-ghost btn-icon x" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="m-body" style="display:grid;gap:12px"><input type="file" accept=".csv,text/csv" data-stf><textarea class="input mono" rows="10" data-stt style="height:auto;padding:9px 12px" placeholder="… oder CSV hier einfügen"></textarea>
    <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" data-strep> bestehende Einträge ersetzen (sonst ergänzen/aktualisieren)</label></div>
    <div class="m-foot"><span class="sp"></span><button class="btn btn-secondary" data-close>Abbrechen</button><button class="btn btn-primary" data-stgo>${ic('check', 'i-sm')}Übernehmen</button></div></div>`, {focus: '[data-stt]'});
  $('[data-stf]', el).onchange = async e => { const f = e.target.files[0]; if (f) $('[data-stt]', el).value = await f.text(); };
  fileDrop($('.modal', el), {accept: /\.(csv|txt)$/i, hint: 'CSV-Datei hier ablegen', onFiles: async ([f]) => { $('[data-stt]', el).value = await f.text(); }});
  $('[data-stgo]', el).onclick = () => {
    const rows = parseCsv($('[data-stt]', el).value.replace(/^﻿/, '')); if (rows.length < 2) { toast('Keine Daten erkannt', {type: 'warn'}); return; }
    const head = rows[0].map(h => norm(h.trim())), map = head.map(h => cols.find(c => norm(c.l) === h || norm(c.k) === h));
    const st = STE[kind] ||= {rows: stRows(kind).map(r => ({...r})), q: '', dirty: false};
    if ($('[data-strep]', el).checked) st.rows = [];
    let n = 0;
    rows.slice(1).forEach(r => {
      const o = {_aktiv: true}; map.forEach((c, i) => { if (!c) return; const s = (r[i] || '').trim(); o[c.k] = c.t === 'num' ? (s ? parseAmt(s) : null) : c.t === 'check' ? /^(1|ja|x|true|wahr)$/i.test(s) : c.t === 'list' || c.t === 'multi' ? s.split('|').map(x => x.trim()).filter(Boolean) : s; });
      if (!o.id) o.id = String(o.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || uid().slice(0, 8);
      const ex = st.rows.find(x => String(x.id).toLowerCase() === String(o.id).toLowerCase()); if (ex) Object.assign(ex, o); else st.rows.push(o); n++;
    });
    st.dirty = true; closeLayer(el); toast(`${n} Zeilen übernommen`, {t2: 'Zum Übernehmen „Speichern“ klicken', icon: 'download'}); renderStamm(kind, page, extra);
  };
}

/* ── Seiten: alle Tabellen als eigene Menüpunkte ── */
for (const k of Object.keys(STAMM_DEF)) stammPage(k, 'st-' + k);
Object.assign(VIEW_PERM, {'st-hotel': 'kunden.bearbeiten', 'st-ansprechpartner': 'kunden.bearbeiten', 'st-kundengruppe': 'kunden.bearbeiten', 'st-watemplate': 'marketing', 'st-smsvorlage': 'marketing', 'st-pakettyp': 'faktura', 'st-spediteur': 'faktura', 'st-inventurort': 'bestand.buchen'});

/* ── Preisrundung: wird von Preisänderungen genutzt ── */
function roundPrice(p) {
  const r = stActive('preisrundung').find(x => p >= (+x.von || 0) && p <= (+x.bis || 1e9)); if (!r || r.endung == null || r.endung === '') return Math.round(p * 100) / 100;
  const e = +r.endung;
  if (e < 1) return Math.max(e, Math.floor(p) + e);                       // ,95 → 49,95
  const base = Math.pow(10, Math.ceil(Math.log10(e + 1)));                 // 9 → 10er-Schritte
  return Math.max(e, Math.floor(p / base) * base + e);
}

/* Zugangsprofil: Prüfung der Anmeldung (accessCheck) steht in c55a-zugangsprofil.js */

/* ── Zuordnung Meldungen: Ereignisse an Personen melden ── */
function bindMeldungen() {
  for (const [evt] of MELD_EVT) {
    Hooks.on(evt, payload => {
      for (const m of stActive('meldung').filter(x => x.ereignis === evt)) {
        const txt = `${MELD_EVT.find(x => x[0] === evt)[1]}${payload?.no ? ' · ' + payload.no : ''}`;
        if (m.kanal !== 'mail' && (!m.empfaenger || m.empfaenger === S.user?.name)) toast(txt, {t2: 'Meldung', icon: 'bell', type: 'accent', dur: 7000});
        const to = m.email || STAFF.find(s => s.name === m.empfaenger)?.email;   // keine eigene Adresse angegeben: E-Mail Firma der Person
        if (m.kanal !== 'hinweis' && to && DESKTOP) invoke('mail_send', {to, subject: `Kontor · ${txt}`, html: `<p>${esc(txt)}</p><pre style="font-size:12px">${esc(JSON.stringify(payload || {}, null, 2))}</pre>`, text: txt, qr: null, purpose: 'meldung'}).catch(() => {});
      }
    });
  }
}

/* ── Hintergrundjobs ── */
const JOB_RUN = {
  preise: async () => { if (typeof runDuePrices === 'function') await runDuePrices(); },
  edi_import: async () => { if (typeof ediImportFolder === 'function') await ediImportFolder(true); },
  reports: async () => { if (typeof runReportPlans === 'function') await runReportPlans(); },
  webshop: async () => { if (!DESKTOP) return; const n = (await invoke('doc_list', {kinds: ['webbestellung'], status: 'neu', limit: 500})).length; navBadge('webshop-bestellungen', n || 0); },
  sicherung: async () => { if (typeof autoBackupCheck === 'function') await autoBackupCheck(); },
};
async function runJobs(force) {
  await loadStamm(); let changed = false;
  for (const j of stActive('edijob')) {
    const due = !j.letzter || Date.now() - new Date(j.letzter) >= Math.max(5, +j.minuten || 60) * 6e4;
    if (!due && !force) continue;
    try { await JOB_RUN[j.typ]?.(); j.letzter = new Date().toISOString(); changed = true; Hooks.emit('job.ran', {job: j.id}); } catch (e) { Hooks.emit('job.failed', {job: j.id, fehler: String(e)}); }
  }
  if (changed && DESKTOP) { try { await invoke('stamm_save', {kind: 'edijob', rows: STAMM.data.edijob, user: 'Hintergrundjob'}); } catch { /* */ } }
}

function bindStamm() {
  loadStamm().then(() => { bindMeldungen(); if (DESKTOP) { setTimeout(runJobs, 20000); setInterval(runJobs, 5 * 6e4); } });
}
