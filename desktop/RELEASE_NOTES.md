## Neu in 0.14.0
- **Neue Menübereiche:** Kunden, Versand, Analyse, EDI, Webshop, Inventur, Stammdaten, Einstellungen und Service – alle als Akkordeon mit Unterpunkten
- **Stammdaten:** über 60 pflegbare Tabellen mit CSV-Import/-Export, Sortierung und Aktiv-Schalter – Benutzergruppen, Zugangsprofil (Anmeldung nur zu erlaubten Zeiten), Zuordnung Meldungen, Filialengruppen, Formulareinstellungen, Verkaufsabteilungen, Marken, Warengruppen mit Hierarchie (Abteilungen bis Hauptbereiche), Preislagen, Größenschlüssel und Größenreihenfolge, Flächen, Orderkategorien, Hausfarben (sofort an Artikeln wählbar), Farbübersetzungen, Lieferantenfarben, Saisons, Zahlungsbedingungen, Verkäuferprämien, Preisrundung, Preisgruppen, Artikelmerkmale, Webshop-Infos, Retourentypen, Gründe Bestandsänderung, Statistikfilter, Länder
- **Kundenmanagement:** Kundenerfassung mit Anrede, Titel, Sprache, Merkmalen, Hotel und Preisgruppe; Bonus-Kalkulation (Punkte je Euro und Umsatzstaffel – wird bei jedem Einkauf angewendet); Hotels mit Provisionsabrechnung; Ansprechpartner; Protokoll Kundenumbuchung
- **WhatsApp & SMS:** Chat je Kunde, eigene und globale Vorlagen, Massennachrichten an Kundengruppen, Kampagnen-Übersicht, Protokoll. Versand über WhatsApp Business (Cloud API) bzw. ein SMS-Gateway – ohne Zugang wird die Nachricht in WhatsApp geöffnet
- **Versand:** Versand-Etiketten (A6-Druck), Paket-Typen, Spediteure mit Sendungsverfolgung
- **Verleih (Rental Service):** Leihgeräte ausgeben (bucht aus) und zurücknehmen (bucht ein), Tarife je Tag/Woche mit Kaution
- **Analyse:** Flexanalyse-Designer mit bis zu drei Dimensionen (Warengruppe, Marke, Artikel, Farbe, Größe, Preislage, Lieferant, Saison, Verkäufer:in, Kunde, Filiale, Zeit), Drill-down, eigenen Formelspalten, Ampeln, Statistikfiltern, Vorlagen und Kategorien; Report-Zeitsteuerung per E-Mail; Artikel-Filialmanagement, NOS-Filialliste, Artikel-Info-Bericht, Intrastat, Größen- und Preislagen-Auswertung, Artikelliste, Rabatt-Auswertung, Prämienabrechnung, Flächenproduktivität, Altersbewertung, Power-BI-Anbindung
- **EDI:** EDIFACT lesen (PRICAT, DESADV, INVOIC, ORDRSP) und schreiben (ORDERS, SLSRPT, INVRPT) über Ein-/Ausgangsordner; Preiskatalog → Artikel-Import mit Zuordnung von Warengruppen, Farben und Größen; DESADV → Wareneingang-Avis, INVOIC → Eingangsrechnung; Fehler, Konflikte, Hintergrundjobs, Protokoll
- **Webshop:** Bestellungen über die REST-API (POST /api/v1/webshop/bestellungen, Status abrufbar), Versand bucht den Bestand aus; Service-Suche, Kategorien, Artikel-Filter (blendet Artikel im Schaufenster aus), Versandarten, Abfragelog und Order-Import-Fehler
- **Inventur:** Erfassungspool (vorab je Inventurort scannen, gesammelt übernehmen), Inventurorte, Protokoll, Blindzählung, Altersbewertung
- **Zeiterfassung:** Kommen/Gehen per Klick, Korrekturen durch die Leitung (gekennzeichnet), Summen und CSV-Export
- **Kasse:** feste Rabatte als Schnellwahl (mit Freigabe), Beleg-Zusatzinformationen (z. B. Hotel), Scanner-Regeln (Kundenkarte, Gutschein, Beleg), Artikelservices, Preisgruppen-Rabatt
- **Einstellungen:** Prozesskonfiguration, Nummernkreise, Buchungsabschluss, Etikettentypen und -drucker, elektronische Etiketten (Preis-Export), MwSt.-Typen und -Sets, Styling der Listen, EK-Verschlüsselung, Übersetzungen, Gutscheintypen, Preis-Änderungsgründe, Zusatz-Buchungstypen, Protokoll externer API-Zugriffe
- **Service:** Anleitungen, Release Notes, Schulungen, Über Kontor, Fiskalisierte Kassen, Ansprechpartner

## Neu in 0.13.0
- **Aufgeräumtes Menü (Akkordeon):** Nur der Bereich der aktuellen Seite ist aufgeklappt, Unterpunkte sind gruppiert – über 100 Funktionen, trotzdem übersichtlich (abschaltbar unter Einstellungen → Kasse)
- **Artikel:** Artikelinfo, Artikel-Info Plus (Abverkauf, Reichweite, Marge, Lagerwert, Umschlag), Artikelinfo Kompakt zum Scannen, Bestandsinfo mit Lagerwert je Warengruppe, Artikel-Umbuchungs-Log mit CSV-Export
- **Umlagerungen:** Umlagerungs-Pool, Filialumlagerung, Protokoll, Übersicht Umlagerungspositionen, manuelle Umlagerungsplanung (Bestand je Filiale vergleichen), Umbuchungsanforderung, Filial-Rechnungsstellung zu Einstandspreisen, ungebuchte Filial-Umbuchungen, Umlagerungen kompakt
- **Bestand:** Bestandskorrektur mit Grund (Bruch, Schwund, Zählfehler …), NOS-Sortimente mit Sollbestand, Übersicht Picklisten (automatisch aus offenen Lieferscheinen, Reservierungen, Auswahlen, Umlagerungen)
- **Preisänderungen:** mehrere Artikel auf einmal (Prozent, Betrag oder fix, Preisschwelle ,90/,95/,99), sofort oder geplant zu einem Datum – geplante Änderungen werden automatisch durchgeführt; Übersicht und Etikettendruck
- **Nachsortierung:** aus Verkäufen und NOS-Fehlmengen, Lagerliste nach Lagerplatz zum Drucken, Pickliste, Anforderung bei der Zentrale oder Bestellentwürfe; Parameter einstellbar
- **Artikelpflege:** Artikel-Import mit Protokoll, EAN/GTIN-Zuordnung mit Prüfziffernkontrolle, manuelle Artikelsortierung für die Kasse (Ziehen oder Pfeile), Master-Artikel als Vorlage für neue Artikel
- **Gutscheine:** Übersicht, Gutscheine mit PIN (Einlösung an der Kasse nur mit PIN), Buchungen, Gutscheine löschen mit Grund und Freigabe, Protokoll gelöschter Gutscheine, Protokoll, externe Gutscheine (neue Zahlungsart „Fremdgutschein“ mit Abrechnung je Aussteller)
- **Verkauf:** Protokolle für Verkäufer- und Kunden-Bon-Zuordnung, Reservierung erstellen, Neue Auswahl, Auswahl-Summen pro Kunde
- **Faktura:** Kundenrechnungen, Angebote/Aufträge, Kunden-Bestellungen (Sonderbestellungen mit Anzahlung, Bestellung beim Lieferanten, Benachrichtigung, Abholung an der Kasse), Fremdrechnungen (z. B. aus dem Webshop), Mahnwesen mit Mahnstufen, Mahngebühren und Sammeldruck

## Neu in 0.12.0
- **Neue Menüstruktur mit Unterpunkten** (aufklappbar wie gewohnt aus der Warenwirtschaft): Verkauf, Marketing, Sortiment, Einkauf, Kunden, Auswertung, System – über 60 Menüpunkte, alle auch über die Befehlspalette (Strg K) erreichbar
- **Order:** Order (Bestellungen mit Order-Typ), Order Import (Datei/Einfügen → Bestellentwurf), Order Typen, Order Vorschläge und Order Vorschlags-Konfiguration (Zeitraum, Reichweite, Sicherheitsfaktor, Packeinheit, Warengruppen)
- **Wareneingang:** Wareneingang Avis (aus Bestellung oder Avis-Datei, mit einem Klick einbuchen), Scanner Wareneingang mit Soll/Ist-Abgleich, Etikettendruck, Änderungsprotokoll mit Korrekturbuchung
- **Rechnungs-Management:** Eingangsrechnungen mit Rechnungsprüfung gegen den Wareneingang, Freigabe, Skonto; Zahlungen mit Zahlungsvorschlag und SEPA-Überweisungsdatei (pain.001) für das Online-Banking; IBAN/BIC je Lieferant
- **Retourenmanagement:** Vorerfassung Reklamation (auch erweitert mit Seriennummer, Kostenvoranschlag, Leihgerät), Lieferantenretouren (bucht beim Versand aus, Gutschrift erfassen), Protokoll, frei einstellbare Rückgabegründe (auch an der Kasse)
- **Wareneingangs-Verteilung** im Filialverbund: Verteilschlüssel (nach Umsatz, Bedarf oder festen Anteilen) und Disposition – gelieferte Ware mit einem Klick als Umlagerungen an die Filialen
- **Umlage Lieferantenbonus:** Bonusstaffeln je Lieferant, Bonus aus dem Einkaufsvolumen, Umlage auf Warengruppen mit CSV-Export
- **Verkauf:** Warenkorb erfassen und an der Kasse übernehmen, Kassenbelege, manuelle Verkäufe (Nacherfassung mit Originaldatum), ungebuchte Verkäufe, Verkäufer- und Kunden-Bon-Zuordnung (Bonuspunkte werden nachgebucht), Reservierungen, Auswahlverwaltung (Ware zur Ansicht), Tagesabschlüsse, Filialumsatz kompakt
- **Faktura:** Angebot → Auftrag → Lieferschein → Rechnung mit Positionsrabatt, A4-Druck und E-Mail, Zahlungseingang, Mahnungen, offene Posten nach Fälligkeit
- **Marketing:** Rabattaktionssteuerung (Mengenrabatt, 3 für 2, Bonrabatt ab Einkaufswert, Happy Hour nach Wochentag/Uhrzeit und Kundengruppe – automatisch an der Kasse), Kampagnen per E-Mail mit persönlichem Gutschein und Erfolgsmessung, Sales-Aktionen (Prämien je Verkäufer:in)
- **Digitales Schaufenster:** Ihr Sortiment als Webseite mit Bildern, Aktionspreisen und Verfügbarkeit – Kund:innen reservieren online und holen im Geschäft ab; Anfragen erscheinen sofort unter Reservierungen
- Neue Rechte: Eingangsrechnungen, Faktura, Marketing

## Neu in 0.11.0
- **Filialverbund:** eine Installation als Zentrale, weitere Kassen als Filialen – Verbindung per Code. Artikel, Preise, Aktionen, Lieferanten und Kunden kommen von der Zentrale; Belege, Bestände und Bonuspunkte der Filialen werden alle 30 Sekunden gemeldet. Jede Kasse verkauft auch ohne Verbindung weiter
- **Neue Seiten „Filialen“ und „Umlagerungen“:** Umsatz und Status je Filiale, Bestand je Artikel in allen Filialen, Umlagerungen anfordern → versenden (bucht aus) → empfangen (bucht ein), KI-Vorschläge für Umlagerungen
- **An der Kasse:** Verfügbarkeit in den anderen Filialen; nicht lagernde Ware direkt per Umlagerung aus der Filiale mit dem meisten Bestand anfordern
- **Weitere Anmeldewege:** Benutzername/E-Mail + Passwort (auch mit Zwei-Faktor), mit dem Handy (QR-Code an der Kasse, Bestätigung in Kontor mobil), Windows Hello, Single Sign-On über OpenID Connect (Microsoft Entra ID, Google Workspace, Keycloak …)
- **Erweiterungen:** Pakete mit Objekten, Feldern, Regeln, Skripten, Endpunkten, Widgets und Befehlen – aus der Galerie (Werkstatt & Service, Kassen-Kennzahlen, Geburtstags-Bonus) oder als Datei; ein-/ausschalten und entfernen
- **Eigene Dashboard-Widgets:** Abfrage auf die lokale Datenbank (nur lesend) als Kennzahl, Liste oder Tabelle – mit Vorlagen und Vorschau
- **Zahlungsarten einstellbar:** welche an der Kasse erscheinen, PayPal per QR-Code mit Betrag (PayPal.me), Überweisung per SEPA-QR (Girocode) für Banking-Apps, eigene Zahlungsarten mit oder ohne Zahlungslink
- **Schnellwahl-Tasten** der Kasse frei bearbeiten (Bezeichnung, Preis, Steuersatz, Symbol)
- **Eigene Design-Vorlagen** speichern, exportieren und importieren; neue Vorlagen Koralle, Wald, Beere · Nacht, Violett · Touch
- **KI-Antworten als Widget** ans Dashboard anheften – aktualisieren sich selbst
- Akzentfarbe für Rechnung und Lieferschein (A4)
- Statusleiste zeigt Rolle und letzten Abgleich im Filialverbund; Kassen-ID folgt der Filialkennung

## Neu in 0.10.0
- **Neues helles Design** als Standard: klarer, freundlicher, mit neuer Akzentfarbe „Ozean“ (Dunkel und andere Farben weiter unter Darstellung wählbar)
- **Neue Menüstruktur** mit aufklappbaren Bereichen: Verkauf, Sortiment, Einkauf, Kunden, Auswertung, System
- **Neue Seiten:** Belege (Journal mit Kopie, E-Mail, Rechnung, Retoure, Storno), Kassenbuch & Abschluss, Gutscheine, Lieferanten, Wareneingang (auch per Scan ohne Bestellung), Etiketten, Buchhaltung, KI-Analyse mit Prognose-Verläufen, Benutzer & Rechte, Protokoll mit Suche und Filter, Hilfe & Info
- **Import aus Excel/CSV:** Artikel (eine Zeile je Variante, neue Farben und Warengruppen werden angelegt), Kunden und Bestände – mit Spaltenzuordnung, Vorschau und Prüfung, alles-oder-nichts
- **Kundendisplay** auf einem zweiten Bildschirm: Artikel, Ersparnis, Summe und Dankeschön mit Ihrem Logo
- **Handy & Tablet:** Bestand prüfen, buchen und Inventur zählen im Browser des Handys – Anmeldung mit Kassen-PIN, Barcode per Bluetooth-Scanner, Eingabe oder Foto
- **Einrichtungs-Checkliste** (Hilfe & Info und Hinweis im Dashboard): Schritt für Schritt zum Echtbetrieb

## Neu in 0.9.0
- **Anpassen** (neuer Bereich im Menü): eigene Felder mit Typ (Text, Zahl, Betrag, Datum, Auswahl, Ja/Nein, E-Mail, Telefon), Pflichtangabe und Prüfung – für Artikel, Kunden und Lieferanten
- **Eigene Objekte** mit eigenem Menüpunkt, Suche und CSV-Export – z. B. Reparaturaufträge, Verleih oder Kurse (Vorlagen dabei)
- **Regeln** „Wenn … und … dann …“: z. B. Bonuspunkte ab € 500, Mail bei defekter Retoure, VIP-Stufe ab 5.000 Punkten, täglich zur Uhrzeit; Aktionen: Hinweis, E-Mail, Webhook, Punkte, Kundenstufe, Datensatz, Skript
- **Skripte** in einer abgeschotteten Sandbox mit Probelauf
- **Webhooks** an Ihr ERP, Onlineshop oder n8n/Make – signiert (HMAC-SHA256), mit Warteschlange und automatischer Wiederholung
- **REST-API** für andere Programme: Artikel, Bestand, Kunden, Belege, Umsatz, eigene Objekte und eigene Abfragen – nur mit API-Schlüssel, wahlweise nur auf diesem PC oder im Firmennetz
- **Rechte je Rolle** frei einstellbar; fehlt ein Recht, gibt eine berechtigte Person per PIN frei
- **Zwei-Faktor-Anmeldung** mit Authenticator-App (Microsoft/Google Authenticator, 1Password …)
- **Lokale KI**: Absatzprognose, Nachbestellvorschlag mit Begründung (neuer Tab im Einkauf), echte KI-Hinweise im Dashboard, Fragen wie „Was muss ich nachbestellen?“ oder „Umsatz diese Woche“ – ohne Internet; optional eigenes Sprachmodell (Ollama) für freie Fragen und Artikeltexte
- **Buchhaltung**: Buchungsjournal und DATEV-Export unter Berichte → Buchhaltung, Konten in den Einstellungen
- **Kartenterminal** über ZVT (Netzwerk): Betrag geht automatisch ans Terminal; ohne Anbindung Bestätigung an der Kasse
- Pakete: alle Anpassungen als Datei exportieren und auf einer anderen Kasse importieren
- Behoben: Beim Speichern eines Artikels während einer Preisaktion wurde der Aktionspreis als fester Preis übernommen

## Neu in 0.8.0
- Artikelbilder: im Artikel „Bild wählen …“ – erscheinen in Kasse, Artikelliste und Bestand
- Preisaktionen mit Zeitraum (z. B. −20 % auf Jacken vom 1. bis 15.): die Kasse nimmt automatisch den günstigsten Preis, Bon zeigt „Sie sparen heute“
- Geführte Inventur: Zählliste je Warengruppe/Marke, Zählen per Scanner, Differenzen in Stück, VK und EK, Abschluss mit Freigabe – Verkäufe während der Zählung werden berücksichtigt
- Etiketten mit EAN-13-Barcode: A4-Bögen über den Druckdialog oder Etikettendrucker (ZPL, z. B. Zebra); nach dem Wareneingang direkt drucken
- Rechnung und Lieferschein im A4-Format zu jedem Beleg, Bestellung als A4 für den Lieferanten
- Beleg, Rechnung und Bestellung per E-Mail über den eigenen Mailserver (inkl. RKSV-QR-Code)
- Bon & Belege: eigenes Logo (auch auf dem Thermodrucker), Vorlage, Zusatzzeile, Fußzeilen, Artikelnummern
- Datensicherung jetzt verschlüsselt möglich (AES-256) und inklusive Artikelbilder und Logo
- Update-Kanal wählbar: Stable oder Beta; Sicherheitsupdates werden hervorgehoben
- Kunden mit Anschrift und UID für Rechnungen
