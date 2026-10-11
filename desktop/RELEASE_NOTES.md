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
