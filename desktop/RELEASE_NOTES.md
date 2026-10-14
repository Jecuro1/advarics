## Neu in 0.45.1

- **Lieferanten – Nachbesserungen nach unabhängiger Prüfung der Fassungen 0.43.1 und 0.44.0:**
  - **Rabattsperre bei Retoure, Storno und Auswertung:** Der Bon-Rabatt wurde bei der Rückrechnung auch auf Positionen mit Rabattsperre verteilt – Retoure und Storno erstatteten dann zu wenig, Umsatz je Artikel und Warengruppe wichen ab. Der Beleg hält jetzt je Position fest, dass sie gesperrt war; ältere Belege rechnen wie bisher.
  - **Bon-Rabatt ohne Wirkung:** Liegen im Warenkorb nur Artikel mit Rabattsperre, lässt sich kein Bon-Rabatt mehr gewähren (Hinweis statt „Rabatt gewährt“). Ein Bon-Rabatt, der nichts bewirkt, wird nicht im Beleg gespeichert und nicht als „−0,00“ gedruckt.
  - **Filialkassen:** Der zuletzt in der Zentrale gelöschte Lieferantenrabatt blieb in den Filialen stehen und wirkte dort weiter – die Tabelle wird jetzt auch leer abgeglichen. Rabatte, Rabattsperre und Lieferanten aus dem Hintergrund-Abgleich erscheinen ohne Neustart; nach dem Löschen eines Lieferanten verschwinden auch seine Rabatte aus der Anzeige.
  - **Bestellung:** Ein gespeicherter Entwurf behält seinen Rabatt, auch wenn er in den Stammdaten geändert oder gelöscht wurde (Auswahl „… – wie gespeichert“). Der Order-Typ ging beim Suchen eines Artikels verloren – behoben. Der Bestellwert im Dialog rechnet wie der Programmkern in Cent.
  - **Scanner-Wareneingang:** Scheitert das Einbuchen eines Avis, behält es seine angekündigten Positionen und Mengen (bisher wurden sie durch den Zählstand ersetzt).
  - **EDI:** Ein erneut verarbeitetes oder doppelt eingelesenes Lieferavis wird nicht noch einmal angelegt und eingebucht. Beim erneuten Verarbeiten wird die GLN der Nachricht ausgewertet (z. B. nachdem sie im Lieferanten hinterlegt wurde). Bestellungen außerhalb der letzten 300 werden dem Avis und der Rechnung zugeordnet. Positionen ohne Menge werden nicht automatisch eingebucht. Eingangsrechnung: Fälligkeit und Skonto zählen ab Rechnungsdatum; ohne Angaben des Lieferanten gelten 30 Tage ohne Skonto.
  - **Kleinigkeiten:** Rabatt unter 0,005 % wird abgelehnt (wurde als 0,00 % gespeichert); Doppelklick auf „Sichern“ im Rabatt-Dialog; Land in der Druck-Ansicht der Rechnungsadresse; Kopien geöffneter Dokumente werden spätestens etwa zehn Minuten nach Ablauf der zwei Stunden entfernt (nicht erst beim nächsten Öffnen oder Start); Hinweistexte zu „DESADV automatisch verbuchen“ und zum Kalkulationsfaktor präzisiert; die Auswertung „Feste Rabatte“ rechnet den Bon-Rabatt aus dem gespeicherten Beleg; Storno gleicht immer auf den bezahlten Betrag aus (auch für Belege mit Rabattsperre aus 0.44.0/0.45.0).

## Neu in 0.45.0

- **Eigener Update-Installer im Kontor-Design.** Ein Update läuft jetzt in einer eigenen Vollbild-Ansicht statt im kleinen Dialog:
  - **Fünf Schritte** – Sicherung, Download, Prüfung, Installation, Neustart – mit echtem Fortschritt (Prozent, Tempo in MB/s, geladene Menge, Restzeit), Schritt-Leiste, Live-Protokoll und dem Karussell „Das ist neu“ aus den Release-Notes.
  - **Animationen:** fließender Shader-Hintergrund, ein Warp-Tunnel, der mit der Download-Geschwindigkeit schneller wird, Hex-Ströme bei der Signaturprüfung, das Kontor-Logo setzt sich bei der Installation aus Partikeln zusammen, Schockwellen und Lichtblitze bei jedem Schritt, ein 3D-Ring, der sich zur Maus neigt, Titel, die sich „entschlüsseln“, und Konfetti zum Schluss. Auf schwächeren Rechnern schaltet sich der Aufwand von selbst herunter; bei „Animationen reduzieren“ (Windows-Einstellung) bleibt die Ansicht ruhig.
  - **Windows:** Während der eigentlichen Installation übernimmt ein Hilfsfenster nahtlos dieselbe Ansicht (Kontor selbst ist dabei beendet, der Installer läuft unsichtbar). Danach startet Kontor neu. Schlägt der Installer fehl, startet die bisherige Version wieder und der Fehler wird angezeigt; scheitert schon die Übergabe, installiert Kontor wie bisher.
  - **Willkommen-Seite:** Nach dem ersten Start der neuen Version zeigt Kontor nach der Anmeldung „Willkommen in Kontor x“ mit den Neuerungen. Läuft danach noch die alte Version, meldet Kontor, dass das Update nicht abgeschlossen wurde.
  - **Vorschau:** Einstellungen › Updates › „Installer-Ansicht ansehen“ spielt den Ablauf mit simulierten Daten ab – es wird nichts installiert.
  - Freigabe mit PIN, Sicherung vor dem Update und Signaturprüfung sind unverändert. Die neue Ansicht erscheint beim Update **von** 0.45.0 auf die nächste Version; das Update auf 0.45.0 selbst läuft noch mit dem bisherigen Installer.
- **Setup-Programm (Erstinstallation)** mit Kontor-Grafik: Kopf- und Seitenbild des Windows-Installers im Kontor-Design.

## Neu in 0.44.1

- **Windows: die Anzeige zuckte (wechselte ständig minimal die Größe).** Die automatische Anzeigegröße rechnete die Fenstergröße aus der Seitengröße und dem eingestellten Zoom zurück. Unter Windows (Skalierung 125 %/150 %, Seitengröße in ganzen Pixeln) landete diese Rechnung bei manchen Fenstergrößen genau auf der Grenze zwischen zwei Stufen: die Anzeige sprang dann dauernd zwischen zwei Größen hin und her. Jetzt liefert das Programm die tatsächliche Fenstergröße (Pixel ÷ Windows-Skalierung) – sie hängt nicht vom Zoom ab, eine Rückkopplung ist nicht mehr möglich. Zusätzlich bleibt die Größe stehen, wenn sie sich trotz gleichem Fenster mehrfach in wenigen Sekunden ändern wollte. Die Stufen und die Einstellung „Anzeigegröße“ bleiben unverändert.

## Neu in 0.44.0

- **Stammdaten › Lieferanten › Rabatte** und weitere Einstellungen des Lieferanten mit Wirkung in Bestellung, Kasse und EDI.
  - **Reiter „Rabatte“:** Liste der Rabatte des Lieferanten (Bezeichnung, Rabatt %) mit Neu und Löschen; ein Doppelklick öffnet die Maske „Rabatt“ mit Lieferant, Bezeichnung, Prozentsatz und den Knöpfen Aktualisieren, Sichern, Neu, Änderungen zurücknehmen und Löschen (gesichert wird sofort, unabhängig vom Sichern des Lieferanten). Bezeichnung je Lieferant eindeutig, Prozentsatz größer 0 bis 100, nur die Zentrale pflegt sie (Filialkassen bekommen sie beim Abgleich); sie entfallen mit dem Lieferanten.
  - **Wirkung:** In der Bestellung wählen Sie einen Rabatt des Lieferanten. Er mindert den **Bestellwert** (Bestellsumme im Dialog und in der Liste, dort mit „nach x % Rabatt“), steht auf dem **A4-Beleg** (Zwischensumme, Rabatt, Summe netto) und im **CSV** (Spalten „Rabatt %“ und „EK nach Rabatt“). Die **Rechnungsprüfung** der Eingangsrechnung erwartet den Betrag nach Rabatt, das **Einkaufsvolumen für den Lieferantenbonus** rechnet netto, und das **Avis aus der Bestellung** trägt die Preise nach Rabatt. Bezeichnung und Prozentsatz werden mit der Bestellung festgehalten – ein späteres Ändern oder Löschen des Rabatts betrifft nur neue Bestellungen. Die Mindestauftragssumme gilt vor Rabatt. In der EDI-Bestellung (ORDERS) steht der Rabatt nicht.
  - **Rabattsperre (Kasse):** Für Artikel eines Lieferanten mit Rabattsperre gibt es an der Kasse keinen Rabatt: nicht auf die Position, der Bon-Rabatt erfasst sie nicht, und Rabatt-Regeln (auch Bon-Regeln) lassen sie aus; Aktionspreise bleiben. Die Position trägt den Hinweis „ohne Rabatt“. In der Liste ist „Rabattsperre“ eine zuschaltbare Spalte.
  - **Lief.-Term. 2 Offset:** Die Bestellliste zeigt für offene Bestellungen „Liefertermin 1“ (Bestelldatum + Lief.-Term. 1 Offset) und „Liefertermin 2“ (Bestelldatum + Lief.-Term. 2 Offset); überfällige sind rot markiert.
  - **DESADV automatisch verbuchen:** Ein eingelesenes Lieferavis des Lieferanten wird sofort als Wareneingang eingebucht (nicht bei „Gegenscannen“ – dann bleibt das Avis zum Scannen offen; scheitert das Einbuchen, bleibt das Avis offen und die Meldung nennt den Grund). **EK-Preise aus PRICAT übernehmen:** Beim Verarbeiten eines Preiskatalogs bekommen vorhandene Artikel des Lieferanten (oder ohne Lieferant) den neuen Einkaufspreis; der Verkaufspreis bleibt.
  - **Kalkulationsfaktor (EK → VK)** und **Warengruppen-Schema:** Neue Artikel aus dem EDI-Artikel-Import ohne Verkaufspreis bekommen EK × Faktor (leer = 2,2) als Vorschlag; mit Schema „FEDAS“ gilt die Warengruppe der Nachricht als FEDAS-Schlüssel (6 Ziffern) und wird beim neuen Artikel eingetragen.
  - **Maske:** Die Karte „EDI und Kalkulation“ ist neu; Kontaktdaten und Zusatzinformationen stehen in einer eigenen Zeile unter den Karten.
  - **Noch nicht enthalten:** Art.-Farb-Trennzeichen, Konsignation, Dienstleister (DSFinV-K), Artikel-Service, Standard-Art.-Merkmal, Zusätzliche Adresse(n), Statistik-Größen, FiBu und Kataloge des Lieferanten – sie erscheinen, sobald sie wirken.
  - **Bestellung:** Eine in der Bestellmaske getippte Notiz ging verloren, wenn man danach im Suchfeld einen Artikel suchte – behoben.

## Neu in 0.43.1

- **Lieferanten – Nachbesserungen nach unabhängiger Prüfung der Fassung 0.43.0:**
  - **Eigene Felder** des Lieferanten gingen verloren, wenn man nach dem Eintippen den Reiter wechselte oder aus einem anderen Reiter sicherte (die Werte wurden dabei geleert); eine Änderung nur an einem Eigenen Feld machte „Sichern“ nicht verfügbar. Jetzt gehören sie zum Entwurf; auf Filialkassen sind sie gesperrt. Der Programmkern prüft sie jetzt ebenfalls gegen ihre Definition (Pflichtfeld, Zahl, Auswahl).
  - **Dokumente und Filial-Kundennummern löschen:** „Löschen“ tat bisher nichts. Es markiert und löscht jetzt (Dokumente mit Rückfrage). Beim Blättern oder „Neu“ blieb die Dokumentliste des vorherigen Lieferanten stehen und „Öffnen“, „Speichern unter“ und „Beschreibung“ wirkten auf deren Dateien – jetzt zeigt jeder Lieferant seine eigenen.
  - **Inaktive Lieferanten:** Artikel und offene Belege (Avis, Eingangsrechnung, Retoure) eines Lieferanten, der inaktiv wird, verloren in Artikelmaske und Belegmaske den Lieferanten („Lieferant fehlt“ beim Einbuchen oder Freigeben); Bestellung drucken oder mailen ließ Empfängerblock, Kunden-Nr. und Vereinbarungen weg; die SEPA-Datei brach mit „IBAN fehlt“ ab. Jetzt steht der Lieferant mit „(inaktiv)“ in der Auswahl, Druck, Mail, SEPA, Bonus und EDI-Verarbeitung kennen ihn weiter.
  - **EDI-Eingangsrechnung (INVOIC)** nutzt jetzt Valuta, Skonto und Zahlungs-Bed. des Lieferanten für Fälligkeit und Skonto (bisher die erste Zahlungsbedingung bzw. 30 Tage). Die Fehlermeldung „Lieferant unbekannt“ nennt die Haupt-GLN im Lieferanten (die GLN unter EDI-Einstellungen heißt „GLN (ersatzweise)“).
  - **Empfängerblock:** Der Name der Rechnungsadresse gilt auch ohne Anschrift (dann mit der Haupt-Adresse); die Rechnungsadresse ist nicht mehr mit „AT“ vorbelegt (leer = wie Haupt-Adresse); **Bundesland/Kanton/Provinz** steht jetzt im Empfängerblock und in der Druck-Ansicht, die **Steuernummer** als Hinweis in der Eingangsrechnung.
  - **Sichern** lässt sich nicht mehr doppelt auslösen (Doppelklick auf einen neuen Lieferanten meldete „Nr. schon vergeben“), und was man während des Sicherns weitertippt, geht nicht mehr verloren. Obergrenzen für Min. Auftragssumme/-menge und eine nicht mehr vorhandene Zahlungsbedingung meldet jetzt schon die Maske am Feld. Der Hinweis „Mindestauftragssumme“ rechnet in Cent (kein falscher Hinweis bei genau erreichter Summe).
  - **Zusätzliche Lieferanten** in der Artikelmaske zeigen immer die aktuelle Nr. und den aktuellen Namen des Lieferanten.
  - **Lieferantennummern (Nr.):** Advarics-Lieferanten behalten ihre Lieferantennummer aus Advarics auch dann, wenn die Nummer beim Update schon an einen anderen Lieferanten vergeben war (die anderen rücken auf; die früher als Kundennummer abgelegte Nummer entfällt, sobald sie als Nr. übernommen ist); Nummern über 999 999 aus Importdateien werden nicht übernommen, die nächste freie Nr. bleibt im erlaubten Bereich. Die Übernahme früherer Angaben läuft ganz oder gar nicht (bisher blieb sie bei einem Abbruch halb fertig); Namen aus „Marken: …“ ohne passende Marke gehen nicht mehr verloren.
  - **Import aus Advarics:** Schlägt ein Artikel fehl, bleiben seine Lieferanten- und Marken-Zuordnung nicht fälschlich im Zwischenspeicher (spätere Artikel derselben Marke bekamen sonst keine Zuordnung).
  - **Löschen:** Reklamationen und Kundenbestellungen, die den Lieferanten nennen, und EDI-Nachrichten des Lieferanten zählen jetzt als Belege; die Rückfrage nennt, was mit dem Lieferanten verschwindet.
  - **Dokumente:** Die Kopie eines geöffneten Dokuments liegt in einem eigenen, nur für Sie lesbaren Ordner und wird nach zwei Stunden, beim Löschen des Dokuments und beim Programmstart entfernt; Dokumente im alten Office-Format (.doc, .xls) fragen vor dem Öffnen wegen möglicher Makros nach; lange Dateinamen behalten ihre Endung.
  - **Robuster:** Eine USt-IdNr. mit Umlaut oder Sonderzeichen und ein Bankwert mit Sonderzeichen im Protokoll führten zu einem Absturz – beides behoben. Marken ohne Namen lassen sich keinem Lieferanten zuordnen und ordnen keine Artikel zu. Ein Fehler beim Übernehmen der Lieferanten in einer Filialkasse macht nur diesen Teil rückgängig und steht im Protokoll; entfernte Lieferanten samt Dokumenten werden dort vermerkt. Ein abgebrochenes Einbuchen nach dem Gegenscannen behält den Zählstand nicht mehr bei. Die ungenutzte Schnittstelle „supplier_fields_set“ ist entfernt.
  - Die Hinweise zu 0.43.0 sind berichtigt (inaktive Lieferanten, Reklamation, GLN, Mindestauftrag, Skonto, Löschen, Marken, Bestehende Daten).

## Neu in 0.43.0

- **Stammdaten › Lieferanten – Liste und Maske nach dem Advarics-Vorbild, mit Wirkung in Bestellung, Belegen, Artikelmaske und EDI.** Der Menüpunkt wandert von Einkauf nach **Stammdaten** (hinter „Filialen“).
  - **Liste:** Nr., Name, Marken, Land, Str., Haus-Nr., PLZ, Ort, Tel., GLN, E-Mail, Empfänger-GLN und Kunden-Nr. sind sichtbar; zuschaltbar sind Aktiv, Bundesland/Kanton/Provinz, Webseite, USt-IdNr., Kontakte, Geändert am, Währung sowie Artikel, Offene Bestellungen und Dokumente. Zurück, Aktualisieren, Neu, Gruppierleiste, Suche, Spalten-Auswahl, Export und Filter.
  - **Maske:** Übersicht, Aktualisieren, Sichern, Neu, Änderungen zurücknehmen, Löschen, Blättern, Knopf „Lieferanten EDI-Einstellungen“ und die Reiter **Allgemein** (Karten Profil, Liefereinstellungen, Finanzeinstellungen, Kontaktdaten, Zusatzinformationen, dazu Ihre eigenen Felder), **Marken**, **Dateien**, **Haupt-Adresse**, **Rechnungsadresse** und **Filial-Kunden-Nummern**. Die Prüfungen (Name, eindeutige Nr., E-Mail, GLN mit Prüfziffer, USt-IdNr., IBAN mit Prüfziffer, BIC, Beträge, Längen) stehen in der Maske und im Programmkern gleich (der Programmkern entscheidet); fehlerhafte Felder und Reiter werden rot markiert.
  - **Wirkung der Felder:**
    - **Nr.** (eindeutig, 1 bis 999 999, frei vergebbar) steht auf der Bestellung und in Artikelmaske › Zusätzliche Lieferanten als Lieferanten-Nr.; die interne Kennung der Belege bleibt unverändert. Beim Anlegen schlägt Kontor die nächste freie Nr. vor.
    - **Aktiv:** Inaktive Lieferanten verschwinden aus den Auswahllisten für Neues (Bestellung, Wareneingang, Rechnungen, Artikelmaske) und aus Bestellvorschlag und KI-Nachbestellung; ihre bisherigen Belege, Artikel und Zahlungen behalten Namen und Angaben (in Artikelmaske und Belegen steht der Lieferant dann mit „(inaktiv)“, bis Sie einen anderen wählen). **Order-Vorschläge nutzen** schaltet den Bestellvorschlag und die KI-Nachbestellung nur für diesen Lieferanten ab. **Lief.-Term. 1 Offset (Tage)** ist die Lieferzeit der KI-Nachbestellung.
    - **Haupt-Adresse, Ansprechperson, Telefon, Fax, E-Mail:** stehen im Empfängerblock der Bestellung, der Retoure und des Avis (die Reklamation ist ein Kundenbeleg und zeigt nur den Hinweis „RMA Ablauf“). **Kunden-Nr. und Vereinbarung 1/2** stehen ebenfalls auf der Bestellung. Die **Rechnungsadresse** steht auf Eingangsrechnung und Zahlung (leer = Haupt-Adresse). **Info, Info 2 und die Vereinbarungen** erscheinen als Hinweis beim Bestellen und in der Eingangsrechnung. **Land** ist das Versendungsland der Intrastat-Meldung.
    - **Filial-Kunden-Nummern:** Hat Ihr Unternehmen je Filiale eine eigene Kundennummer beim Lieferanten, steht beim Bestellen die Nummer der bestellenden Filiale auf der Bestellung und in der EDI-Bestellung; ohne Eintrag gilt die allgemeine Kunden-Nr. Jede Filialkasse bekommt vom Abgleich nur ihre eigene Nummer.
    - **Min. Auftragssumme / Min. Auftragsmenge:** Liegt eine Bestellung beim Bestellen unter der Mindestmenge oder – wenn alle Positionen einen Einkaufspreis haben – unter der Mindestsumme (netto, zu EK), fragt Kontor nach; Bestellen trotzdem ist möglich und wird protokolliert.
    - **Skonto, Valuta, Zahlungs-Bed.:** füllen Fälligkeit und Skonto der Eingangsrechnung vor (überschreibbar; die Skonto-Frist nur, wenn die Zahlungs-Bed. Skonto-Tage hat). **USt-IdNr. und Steuernummer** stehen als Hinweis in der Eingangsrechnung, **IBAN/BIC** in der SEPA-Zahlungsdatei – ihre Änderung verlangt in der Oberfläche die Freigabe eines Administrators. Die **Webseite** erscheint nur als Spalte der Liste.
    - **RMA Code Pflicht:** Eine Retoure an diesen Lieferanten lässt sich ohne RMA-/Rücksendenummer nicht versenden; **RMA Ablauf** erscheint als Hinweis in Retoure und Reklamation. **Gegenscannen bei WE-Avis erforderlich:** Das Avis lässt sich erst einbuchen, nachdem die Ware im Scanner-Wareneingang gezählt wurde.
    - **Haupt-GLN / Empfänger-GLN:** Die Haupt-GLN erkennt den Lieferanten in EDI-Nachrichten und steht als Lieferant in der EDI-Bestellung. Die Empfänger-GLN ist die Empfängeradresse aller ausgehenden EDI-Nachrichten (z. B. Clearingstelle), sonst die Haupt-GLN. Die GLN unter EDI-Einstellungen gilt nur noch ersatzweise.
  - **Marken:** Links stehen die Marken des Lieferanten, rechts alle angelegten Marken (Spalten links: Marken-Name, Externer Marken-Name, GLN-Herkunft, GLN, EDI Marken-Nr., EDI Marken-Name, Anz. Art., Kommentar). Zuordnen per Ziehen, Doppelklick, „Zuordnen“ oder „Neu“ (Dialog mit vorbelegtem Lieferanten, Marke, Externem Marken-Namen, GLN-Herkunft, GLN, EDI Marken-Nr., EDI Marken-Name und Kommentar). Rechts stehen die noch nicht zugeordneten, aktiven Marken. Wirkung: Beim Anlegen eines Artikels mit dieser Marke und beim Wechsel der Marke eines Artikels ohne Lieferant schlägt Kontor den Lieferanten vor (nur wenn genau ein aktiver Lieferant die Marke hat); beim Sichern fragt Kontor für die neu zugeordneten Marken, ob vorhandene Artikel **ohne** Lieferant nachgetragen werden sollen (andere Lieferanten werden nie überschrieben). Im **PRICAT-Import** ordnen Externer Marken-Name, EDI Marken-Nr., EDI Marken-Name (verglichen mit Markenname und Markennummer der Nachricht) und die GLN des Herstellers (Herkunft „Hersteller“ oder leer) die Marke des Lieferanten Ihrer eigenen Marke zu; eine GLN mit Herkunft „Lieferant“ erkennt den Lieferanten in EDI-Nachrichten.
  - **Dateien (nur Desktop-App, erst nach dem ersten Sichern des Lieferanten):** Preislisten, Konditionen und Zertifikate je Lieferant hochladen (Dateiauswahl oder Ablegen), öffnen, speichern unter, beschreiben und löschen. Spalten: Hochgeladen am, Dateiname, Dateityp, Beschreibung, Mitarbeiter-Nr., Mitarbeiter-Name, Größe. Erlaubt sind PDF, Bilder (jpg, png, webp, gif, tif), Text/CSV, Excel (xls, xlsx), Word (doc, docx), OpenDocument (odt, ods) und ZIP bis 15 MB, höchstens 100 je Lieferant. Die Dateien liegen in der Datenbank der Kasse (also in der Datensicherung) und gehen nicht an die Filialen.
  - **Pflege nur in der Zentrale** (am Einzelplatz selbst): Filialkassen bekommen die Lieferanten beim Abgleich und sehen sie nur lesbar. **Löschen** geht nur ohne Bestellungen, Belege (auch EDI-Nachrichten und Reklamationen, die den Lieferanten nennen) und Artikel (sonst „Aktiv“ ausschalten) und verlangt in der Oberfläche die Freigabe eines Administrators; es entfernt auch die Marken-Zuordnungen, die hochgeladenen Dokumente und die Einträge des Lieferanten unter EDI-Einstellungen.
  - **Bestehende Daten:** Beim ersten Start nach dem Update werden die bisherigen Lieferanten übernommen: Nr. (Advarics-Lieferanten behalten ihre Lieferantennummer aus Advarics, die übrigen rücken in ihrer Reihenfolge auf die freien Nummern), Marken aus dem Notizfeld „Marken: …“ (Namen ohne passende Marke bleiben in der Notiz stehen) und aus der Markenzuordnung, Haupt-GLN aus „EDI-Einstellungen › Lieferanten“ (sofern gültig), Land aus der Intrastat-Zuordnung. Die Lieferantennummer des Advarics-Imports ist jetzt die **Nr.**, nicht mehr die Kunden-Nr., und der Import ordnet jedem Lieferanten die Marken seiner Artikel zu. Der Menüpunkt und Reiter „Lieferanten“ im Einkauf sowie der Schnelldialog entfallen.
  - **Noch nicht enthalten** (folgt, sobald es wirkt): Rabatte, Zusätzliche Adresse(n), Statistik-Größen, FiBu, Kataloge, Lief.-Term. 2, Vorschlags-Kalkulation, Rabattsperre, Art.-Farb-Trennzeichen, Warengruppen-Schema (FEDAS), Konsignation, Dienstleister (DSFinV-K), Artikel-Service und Standard-Art.-Merkmal. Die Währung ist fest Euro.
- **Marken – Nachbesserungen nach unabhängiger Prüfung der Fassung 0.42.0:** Namen ohne Buchstaben oder Ziffern (z. B. nur „®“) werden abgelehnt, und Altzeilen ohne Namen ziehen beim Umbenennen keine markenlosen Artikel mehr mit; Umbenennen prüft den Namen nur noch bei Änderung auf Doppelte; die Löschmeldung nennt, wie viele der Artikel aktiv sind; beim Löschen entfallen auch die Zuordnungen zu Lieferanten. Gespeicherte Bonus-Filter mit Marken-Kennung werden automatisch erkannt.

## Neu in 0.42.0

- **Stammdaten › Marken – Liste und Maske nach dem Advarics-Vorbild, mit Herstellerangaben nach der Produktsicherheitsverordnung (GPSR).**
  - **Liste:** Name, Name des Herstellers, Elektronische Adresse, Hersteller Straße/Hausnummer/PLZ/Stadt/Land/Land ISO, Verantwortlicher in EU, Elektronische Adresse in der EU und dessen Straße/Hausnummer/PLZ/Stadt/Land/Land ISO – dazu die Spalte „GPSR“ (Ampel) und die zuschaltbaren Spalten „Artikel“ und „Aktiv“. Zurück, Aktualisieren, Neu, Gruppierleiste, Suche, Spalten-Auswahl, Export und Filter.
  - **Maske:** Übersicht, Aktualisieren, Sichern, Neu, Änderungen zurücknehmen, Löschen, Blättern und die Reiter **Allgemein** (Name, Name des Herstellers, Elektronische Adresse, Verantwortlicher in EU, Elektronische Adresse in der EU, Aktiv, GPSR-Stand), **Postanschrift** (Adr.-Zeile 1/2, Straße, Haus-Nr., PLZ, Ort, Postfach, Land, Land-ISO, Bundesland/Kanton/Provinz, Druck-Ansicht) und **Postanschrift in EU** (gleiche Felder; nur Länder der EU zur Auswahl). Land-ISO wird aus dem Land abgeleitet; die Länderliste ist erweitert (EU und wichtige Herstellerländer) und folgt den Angaben unter Stammdaten › Länder.
  - **Wirkung der Herstellerangaben:** Im **Schaufenster** zeigt jeder Artikel, dessen Marke Angaben hat, unter „Hersteller & Produktsicherheit“ Hersteller, Anschrift, elektronische Adresse und – falls vorhanden – den Verantwortlichen in der EU (mit anklickbarer E-Mail bzw. Web-Adresse). Optionaler Schalter im Schaufenster: **nur Artikel mit vollständigen Herstellerangaben anzeigen** (mit der Zahl der betroffenen Artikel). In der **REST-Schnittstelle** liefert jeder Artikel das Feld `hersteller`, dazu neu `GET /api/v1/marken`. In der **Artikelliste** (Druck/CSV) gibt es die wählbaren Spalten Hersteller, Herstelleranschrift, Verantwortlicher in der EU und GPSR-Angaben; die **Artikelmaske** zeigt Hersteller und Ampel mit Sprung zur Marke. Nach außen geht nur eine feste Auswahl der Angaben – keine Lieferanten oder internen Notizen.
  - **GPSR-Ampel:** vollständig = Name, Anschrift (Straße oder Adr.-Zeile 1, PLZ, Ort, Land) und elektronische Adresse; sitzt der Hersteller außerhalb der EU (oder fehlt das Land), braucht es zusätzlich Name, Anschrift in der EU und elektronische Adresse des Verantwortlichen. Unvollständige Angaben blockieren das Sichern nicht – sie zeigen nur die Ampel (nur eine Anschrift ohne Land und eine ungültige elektronische Adresse werden abgelehnt). Die Regel steht im Backend (Liste, Schaufenster, Schnittstelle) und in der Maske gleich.
  - **Umbenennen zieht alles mit:** Artikel, Preisaktionen, Rabattregeln, Sales-Aktionen, Webshop- und Statistikfilter, gespeicherte Analyse-Vorlagen, Bonus-Systeme und die Standard-Marke für neue Artikel (mit Administrator-Freigabe). Sales-Aktionen und Standard-Marke gelten je Kasse: in Filialkassen mit eigenen Aktionen bitte dort anpassen. **Löschen** nur ohne Artikel (sonst „Aktiv“ ausschalten – die Herstellerangaben bleiben für vorhandene Artikel erhalten). Der Name ist eindeutig (Groß/Klein, ®™© und Leerzeichen zählen nicht).
  - **Marken entstehen automatisch** aus den Artikeln (auch bei Import und beim Anlegen eines Artikels mit neuer Marke); Herstellerdaten pflegen Sie danach in der Maske. Die Zentrale pflegt, Filialkassen bekommen die Marken beim Abgleich (nur lesbar).
  - Behoben: Der Bonus-Filter „Marke“ speicherte die Kennung statt des Namens und traf deshalb nie (bereits gespeicherte Filter mit Kennung bitte neu wählen).

## Neu in 0.41.1

- **Filialen – Nachbesserungen nach unabhängiger Prüfung der Fassungen 0.40.1 und 0.41.0:**
  - **Bank-, Steuer- und Firmenangaben bleiben in der Zentrale.** Seit 0.40.1 schickte die Zentrale jeder Filialkasse beim Abgleich auch die Firmen-, Bank- und Steuerangaben (IBAN, UID, Steuernummer, Inhaber) der *anderen* Filialkassen mit. Jetzt bekommt eine Filialkasse von den anderen Filialen nur Umsatzzahlen, Abgleichzeit und Programmversion – keine IP-Adressen, keine Firmen- oder Bankangaben. Bitte alle Kassen aktualisieren.
  - **Nummernkreise:** Die Zentrale zählt ohne eigenen Bereich unbegrenzt weiter und könnte in den Bereich einer Filiale laufen. Deshalb nimmt sie einen Bereich einer Filiale erst an, wenn die Zentrale selbst einen Bereich für diese Art hat (z. B. 1–19999) – die Meldung nennt die nächste Nummer der Zentrale. Die Maske prüft Überschneidungen jetzt auch bei offenem Ende, noch vor der Administrator-Freigabe. Filialen ohne Bereich kann die Zentrale nicht prüfen (ihr Zähler liegt in deren Datenbank); der Hinweis im Reiter sagt das.
  - **Einzelplatz:** Zeilen einer früheren Zentrale blockieren Nr. und Nummernkreise nicht mehr.
  - **Vorläufige Zeilen:** Ein einziger ungültiger Wert der Filialkasse (z. B. IBAN mit falscher Prüfziffer) verwirft nicht mehr alle mitgeschickten Angaben – nur dieses Feld bleibt leer. Eine vorläufige Zeile lässt sich auch ohne Änderung sichern („Angaben der Filialkasse übernehmen“, mit Administrator-Freigabe); der Hinweis sagt, dass leere Felder dort die bisherigen Angaben löschen.
  - **Thermodruck:** Der Text am Bonende (und jede andere Textzeile) wird wortweise umgebrochen statt abgeschnitten – auf 80 mm Papier 48, auf 58 mm 32 Zeichen je Zeile. Der Text am Bonende steht auch in der E-Mail-Fassung des Belegs.
  - **Kleinigkeiten:** „Fußzeilen für alle Filialen übernehmen“ lässt die Maske nicht mehr als ungesichert stehen; Einstellungen und Hinweise nennen den Vorrang der Filial-Fußzeile; kein ständiges Neuladen der Einstellungen in Zentrale und Einzelplatz; Name und Adresse im Filialwähler des Dashboards werden maskiert.
  - Die Hinweise zu 0.40.0, 0.40.1 und 0.41.0 sind berichtigt (Bon, Bonuspunkte, ein Fehler, den es in keiner ausgelieferten Fassung gab).

## Neu in 0.41.0

- **Stammdaten › Filialen › Filialen: Reiter „Nummernkreise“ und „Report-Vorschau“.**
  - **Nummernkreise:** Start- und End-Nr. je Filiale für Order, Rechnung, Lieferschein, Angebot, Auftrag und Lieferanten-Retoure. Jede Filiale hat eine eigene Datenbank – mit eigenen Bereichen geben sich zwei Filialen nie dieselbe Rechnungs- oder Bestellnummer. Die Vergabe läuft zentral im Programm: Liegt der Zähler unter der Start-Nr., springt die nächste Nummer auf die Start-Nr.; der Zähler wird nie zurückgesetzt. Ist die End-Nr. erreicht, lässt sich kein Beleg dieser Art mehr anlegen („Nummernkreis erschöpft“), und es entsteht keine Lücke. Leer = fortlaufend wie bisher. Für die eigene Kasse zeigt die Maske nächste Nummer, wie viel noch frei ist und „wird knapp“ unter 10 %. Die Zentrale prüft beim Sichern, dass sich Bereiche verschiedener Filialen nicht überschneiden. Kassenbons (RKSV-Kette) und Gutscheincodes (Zufallswerte) haben bewusst keinen Bereich.
  - **Report-Vorschau:** Fußzeile der A4-Belege (mehrzeilig) und Text am Bonende je Filiale – sie stehen auf Rechnung, Lieferschein, Angebot und Bestellung bzw. am Bonende (Bildschirm, Thermodruck, E-Mail-Beleg); leer = Standard der Kasse aus Einstellungen › Bon & Belege. Daneben eine Live-Vorschau von A4-Beleg und Kassenbon mit den Angaben der Filiale; „Fußzeilen für alle Filialen übernehmen“ setzt die Texte bei allen Filialen. Bestellungen tragen jetzt ebenfalls die Fußzeile.
  - Änderungen an den Nummernkreisen verlangen die Freigabe eines Administrators.
- **Menü Stammdaten › Filialen** zeigt nur noch „Filialen“. Filial-Übersicht, Filialengruppe, Formulareinstellungen und Verkaufsabteilung sind aus dem Menü genommen; ihre Daten bleiben erhalten (Filialgruppen legen Sie über den Stift am Feld „Filial-Gruppe“ an, die Übersicht öffnet die Statusleiste „Verbund“).

## Neu in 0.40.1

- **Filialen – Nachbesserungen nach unabhängiger Prüfung der Fassung 0.40.0:**
  - **Schon angebundene Filialkassen verlieren ihre Angaben nicht mehr.** Beim ersten Abgleich nach dem Update hätten Firmenname, UID, Telefon und Bankdaten einer Filialkasse durch leere Angaben ersetzt werden können. Jetzt legt die Zentrale für schon angebundene Filialen eine **vorläufige** Zeile an: aus Name und Adresse der Anbindung und den Angaben, die die Filialkasse beim Abgleich mitschickt. Eine vorläufige Zeile ändert die Filialkasse nicht; erst wenn die Zentrale sie speichert, gelten die Angaben dort. Die Maske weist darauf hin, die Liste zeigt „vorläufig“.
  - **Einstellungen › Zahlungsarten:** IBAN und BIC sind – wie Name, Adresse, UID und Telefon – nur noch lesbar (sie kommen aus den Filialen und wären sonst beim nächsten Abgleich überschrieben worden).
  - **Abgeschaltete und gelöschte Filialen** erscheinen nicht mehr im Bestand je Filiale und in den Umlagerungsvorschlägen; Umlagerungen sind nur noch zwischen der eigenen und aktiven, angebundenen Filialen möglich. Beim Löschen einer Filiale werden auch ihre Bestände und die Abgleichmarken der Bonuspunkte entfernt (die Kundenpunkte bleiben).
  - **Filialkasse:** Änderungen der Zentrale (alle Angaben, nicht nur Name, UID, Telefon, E-Mail, IBAN) kommen auf der Kasse an; die Statusleiste meldet eine in der Zentrale deaktivierte Filiale ausdrücklich.
  - **Bon:** keine leeren Beschriftungen „UID · Tel.“ mehr, wenn Angaben fehlen.
  - **Maske:** „Filial-Code erzeugen“ steht auch in der Leiste (wie in der Vorlage); die Kopfzeile folgt beim Blättern; die Filial-Gruppe wird nur noch geändert, wenn sie geändert wurde (eine Filiale in mehreren Gruppen bleibt es); Längen und höchstens zehn Zusatzadressen werden schon in der Maske geprüft; Einzelplatz zeigt nur die eigene Filiale.
  - **Robuster:** Eine UID mit Sonderzeichen führte zu einem Absturz; ein fehlerhafter alter Wert (z. B. E-Mail) verhinderte die eigene Filial-Zeile – beides behoben.
  - Die Hinweise zu 0.40.0 sind berichtigt: Die Bankverbindung steht im Zahlungshinweis der Rechnung (nicht im Briefkopf), das Kundendisplay zeigt weiter den Markennamen aus „Bon & Belege“, es gibt bis zu zehn Zusatzadressen.

## Neu in 0.40.0

- **Stammdaten › Filialen › Filialen – Liste und Maske nach dem Advarics-Vorbild.** Die Liste (Nr., Aktiv, Kürzel, Kurz-Name, Name, Filial-Gruppe, Land-ISO, Ort, Farbe, Haus-Typ, Anbindung) hat Zurück, Aktualisieren, Neu, Gruppierleiste, Suche, Spalten-Auswahl, Export und Filter. Die Maske „Filialen“ hat Übersicht, Aktualisieren, Sichern, Neu, Änderungen zurücknehmen, Löschen, Blättern (1/5) und die Reiter **Allgemein**, **Haupt-Adresse** und **Zusätzliche Adresse(n)**. Der bisherige Menüpunkt „Filialen“ (Umsatz, Bestand, Umlagerungsvorschläge) heißt jetzt **Filial-Übersicht**.
  - **Allgemein:** Profil (Aktiv, Kürzel, Nr., Name, Kurz-Name, Filial-Gruppe, Filial-Farbe, Haus-Typ), Kontaktdaten (Telefon, Fax, Mobiltelefon, E-Mail, Website, Inhabername), Finanzeinstellungen (USt-IdNr., Steuernummer, ISO), SEPA (IBAN mit Prüfziffer, BIC, Bank), Anbindung (Status, Verbindungscode) und eine Vorschau des Beleg-Kopfs.
  - **Haupt-Adresse:** Adr.-Zeile 1 und 2, Straße, Haus-Nr., PLZ, Ort, Postfach, Land – mit Druck-Ansicht, so wie die Adresse auf Belegen steht. **Zusätzliche Adresse(n):** Rechnungs- und/oder Lieferadresse, bis zu zehn.
  - **Wirkung:** Die eigene Filiale gilt für Belege, Bon und Schaufenster: Name, Adresse, UID, Steuernummer, Telefon, Fax, Mobil, E-Mail, Website und Inhaber stehen im Kopf der A4-Belege (Rechnung, Lieferschein, Bestellung), die Adresse auf dem Bon, UID und Telefon nur in der Vorlage „classic“ und im Thermodruck (der Bon zeigt den Markennamen aus „Bon & Belege“, nicht den Filialnamen); die Bankverbindung steht im Zahlungshinweis der Rechnung und im EPC-QR. Unter Einstellungen › Firma & Filiale sind Name, Adresse, UID und Telefon deshalb nur noch lesbar (mit Sprung in die Filialen). Die zusätzlichen Adressen erscheinen auf Bestellungen an Lieferanten (Lieferadresse und Rechnungsadresse).
  - **Aktiv aus** nimmt eine Filiale aus Filialauswahl, Umlagerung und Verteilung heraus und lehnt ihren Abgleich mit dem Hinweis „in der Zentrale deaktiviert“ ab; die eigene Filiale lässt sich nicht deaktivieren. **Nr.** steht im Artikelbestand je Filiale, **Kurz-Name** in Auswahl, Analysen und Formularen, **Farbe** in Filialauswahl, Filial-Übersicht und Dashboard-Vergleich, **Filial-Gruppe** und **Haus-Typ** sind neue Dimensionen der Flexanalyse.
  - **Pflege nur in der Zentrale:** Die Zentrale legt Filialen an (danach erscheint der Verbindungscode mit QR; ein neuer Code macht den alten ungültig), ändert, deaktiviert und löscht sie (Löschen nur ohne Belege und Umlagerungen). Filialkassen bekommen die Angaben beim Abgleich; andere Filialen sehen nur Nr., Name, Farbe, Haus-Typ, Adresse und Telefon – Bank-, Steuer- und Inhaberdaten bleiben in der Zentrale. Am Einzelplatz gibt es nur die eigene Filiale; „Neu“ führt zum Einrichten des Filialverbunds. Schon angebundene Filialen und die bisherigen Firmendaten werden beim ersten Öffnen übernommen. Änderungen verlangen die Freigabe eines Administrators.
  - Die übrigen Reiter der Vorlage (Report-Vorschau, Nummernkreise, FiBu, MwSt.-Einstellungen, Zahlungsarten, Zusatz-Buchungen, Kassen-Summen, WGr.-MwSt.-Einstellungen, Filial-Pickliste) und die Felder zu EDI, Umlagerungen und NOS folgen in den nächsten Fassungen – sie erscheinen erst, wenn sie wirken.

## Neu in 0.39.1

- **Zugangsprofil nach der Advarics-Beschreibung ausgerichtet.** Wochentage, Start-/End-Zeit und Standardprofil verhalten sich wie dort erklärt:
  - **Wochentage einzeln:** In der Maske lassen sich Mo bis Fr (Arbeitstag) und Sa, So (Wochenende) einzeln erlauben. Die frühere Schaltfläche „Anmeldung erlaubt“ je Tagesart entfällt, ein Profil braucht mindestens einen erlaubten Tag.
  - **Start-Zeit gilt, End-Zeit nicht mehr:** Ab der Start-Zeit ist die Anmeldung möglich, ab der End-Zeit nicht mehr (bisher war die End-Minute noch erlaubt). Start gleich Ende (00:00 – 00:00) heißt ganztägig; liegt das Ende vor dem Start, gilt das Fenster über Mitternacht und gehört zum Tag, an dem es beginnt.
  - **Standardprofil:** Es gibt immer ein Profil „Standard“ (jederzeit, von überall). Es lässt sich weder ändern noch löschen. Wer keinem anderen Profil zugeordnet ist, gehört dazu; in der Maske „Benutzer“ steht dafür „Standard“ im Feld Zugangsprofil.
  - **Profil abschalten:** Ein abgeschaltetes Profil gilt nicht mehr, seine Personen gehören dann zum Standardprofil (Schalter „Aktiv“).
  - **Hinweise aus der Beschreibung:** einzelne feste Adresse = „von“ und „bis“ gleich; maßgeblich ist die Uhr des Kassen-PCs; Vorsicht bei wechselnden Adressen (mehrere Internetanschlüsse, WLAN und Mobilfunk).
- **Fehler behoben (Fassung 0.39.0):**
  - Ältere Profile mit einzelnen Wochentagen (z. B. nur Samstag) hätten sich plötzlich an allen Tagen anmelden lassen. Sie gelten wieder genau wie zuvor.
  - Namen werden am Sperrbildschirm und am Handy gleich verglichen (Groß-/Kleinschreibung und Leerzeichen am Rand zählen nicht).
  - Abgeschaltete Profile wurden beim Sichern wieder eingeschaltet.
  - Am Handy wird das Profil jetzt bei jeder Anfrage geprüft, nicht nur bei der Anmeldung: Ändert sich das Profil oder läuft das Zeitfenster ab, endet die Sitzung mit einem Hinweis zur neuen Anmeldung. Das Protokoll nennt dazu die Adresse des Geräts.
  - Die Anzeige „Jetzt“ und die Prüfbox in der Maske berücksichtigen die gewählten Wochentage.
  - „1 Einträge“ in der Seitenkopfzeile heißt jetzt „1 Eintrag“.

## Neu in 0.39.0

- **Stammdaten › Benutzer › Zugangsprofil – Liste und Maske nach dem Advarics-Vorbild.** Die Liste hat Zurück, Aktualisieren, Neu, Gruppierleiste, Suche, Spalten-Auswahl, automatische Spaltenbreite, Export und Filter. Die Maske „Zugangsprofil“ hat die Leisten Übersicht, Aktualisieren, Sichern, Neu, Änderungen zurücknehmen und Löschen und die Reiter **Allgemein** und **Zugeordnete User**.
  - **Allgemein:** Name, IP Bereich von/bis, Arbeitstag-Start/-End-Zeit, Wochenend-Start/-End-Zeit (Pflichtangaben mit Fehlermeldung am Feld und Zähler am Reiter). Zusätzlich je Tagesart ein Schalter „Anmeldung erlaubt“. Rechts steht, was das Profil bewirkt, mit dem Ergebnis für „jetzt“, und eine Prüfbox: Wochentag, Uhrzeit und Adresse eingeben und sehen, ob die Anmeldung erlaubt wäre.
  - **Zugeordnete User:** Spalten Nr., Name, Vorname, Aktiv, Benutzergruppe; zwei Listen „Zugeordnet / Nicht zugeordnet“, Zeilen ziehen oder doppelklicken. Eine Person gehört zu höchstens einem Profil.
  - **Wirkung:** Wer einem Profil zugeordnet ist, kann sich nur aus dem IP-Bereich und in den Zeitfenstern anmelden – am Sperrbildschirm (Adresse dieses Arbeitsplatzes) und am Handy (Adresse des Geräts). 00:00–00:00 heißt ganztägig, ein Ende vor dem Start läuft über Mitternacht. Administratoren sind ausgenommen. Ohne Netzwerk-Adresse am Arbeitsplatz gilt nur die Zeit, damit ein Netzausfall niemanden aussperrt. Die Ablehnung nennt den Grund und steht im Protokoll.
  - Bisherige Profile (Wochentage und von/bis) werden übernommen. Änderungen verlangen die Freigabe eines Administrators.
- **Sperrbildschirm:** Nach einer abgelehnten Anmeldung (Zugangsprofil oder Filiale) ließ sich keine andere Person mehr anmelden, der Bildschirm reagierte nicht mehr. Behoben.
- **Zuordnungslisten auf schmalen Bildschirmen:** „Zugeordnet“ und „Nicht zugeordnet“ stehen unter 760 Pixel Breite untereinander statt winzig nebeneinander (gilt für alle Masken mit Zuordnungslisten).

## Neu in 0.38.5

- **Auch außerhalb des Menüs nur, was ohne PIN-Freigabe geht.** Weitere Einstiege, die bisher erst nach einer Freigabe etwas geöffnet hätten, erscheinen nur noch mit dem passenden Recht (Rolle und Benutzergruppe zählen, Administratoren sehen alles):
  - **Statusleiste unten:** „Verbund“ und „Datensicherung“ sind ohne das Recht „System“ nur noch eine Anzeige – ein Klick darauf führte vorher zu einer gesperrten Seite. „Ereignisse“ (Ereignis-Inspektor) gibt es nur mit „System“, wie in der Befehlspalette.
  - **Hilfe & Info:** „Erledigen“ steht nur bei den Einrichtungsschritten, die die Person selbst ausführen darf (z. B. „Firmendaten“ mit dem Recht „Einstellungen“, „Eigenes Sortiment“ mit „Artikel bearbeiten“). Im Schnellzugriff erscheinen „Handy als Scanner“ nur mit „Anpassen“ und „Nach Updates suchen“ nur mit „System“. „Daten importieren“ bietet nur die Arten an, für die das Recht vorhanden ist (Artikel, Kunden, Bestände). Der Hinweis „Einrichtung“ am Dashboard nennt nur Schritte, die die Person selbst erledigen darf.
  - **Mitteilungen und Dashboard:** Der Update-Hinweis in den Mitteilungen und die Update-Zeile im Betriebs-Widget erscheinen nur mit „System“.
  - **KI-Hinweise (Dashboard und KI-Analyse):** Die Aktion eines Hinweises („Artikel öffnen“, „Inventur ansehen“, „Nachbestellen“, „Preisaktion“, „Im Einkauf öffnen“, „Nachbestellvorschlag“) steht nur da, wenn die Person das passende Recht hat. Der Hinweis selbst bleibt sichtbar.

## Neu in 0.38.4

- **Nur Menüpunkte, für die keine PIN-Freigabe nötig ist.** Was eine angemeldete Person nur mit der Freigabe einer anderen Person benutzen könnte, wird ihr gar nicht mehr angezeigt (Rolle und Benutzergruppe zählen, Administratoren sehen alles):
  - **Seitenmenü:** „Artikel“ (Bearbeiten) nur mit dem Recht „Artikel bearbeiten“ und „Bestand“ (Buchen) nur mit „Bestand buchen“ – zum Nachschlagen bleiben Artikelinfo, Artikelinfo Plus/Kompakt und Bestandsinfo für alle da. „Filialen“ und „Filialverbund“ nur für Administratoren, „Kontor mobil“ nur mit dem Recht „Anpassen“.
  - **„Mehr“-Menü an der Kasse:** „Retoure / Umtausch“ nur mit „Retouren buchen“, „Kassenbuch“ und „Tagesabschluss“ nur mit „Kassenbuch und Tagesabschluss“, „Kassenablauf bearbeiten“ nur mit „Einstellungen“.
  - **Schaltflächen:** „Retoure“ und „Storno“ bei den Belegen, „Bearbeiten“ in der Artikelinfo, „Buchen“ im Dashboard-Widget, der Kassenablauf-Knopf an der Kasse und der Update-Hinweis in der Statusleiste erscheinen nur noch, wenn das Recht vorhanden ist.
  - Der Kassenablauf ließ sich bisher von jeder Person ändern – jetzt nur noch mit dem Recht „Einstellungen“.
  - Auch Verweise innerhalb von Seiten („zu Einstellungen“, „zu Artikel“ …) erscheinen nur, wenn die Zielseite ohne Freigabe geöffnet werden kann.
  - Gilt auch für die Befehlspalette (Strg+K) und die Menüsuche.

## Neu in 0.38.2

- **Drag & Drop: die ganze Zeile lässt sich greifen und ziehen** – es braucht keinen Anfasser mehr. In den Zuordnungslisten (Zugeordnet / Nicht zugeordnet), in den Stammdaten-Tabellen, bei den eigenen Feldern, in der Spalten-Auswahl und in der Artikelsortierung genügt es, die Zeile irgendwo anzufassen. Nur Schaltflächen, Auswahllisten und Schalter in der Zeile bleiben bedienbar wie bisher. In Stammdaten-Tabellen mit Textfeldern greift senkrechtes Ziehen die Zeile; waagerechtes Ziehen im Textfeld markiert wie gewohnt Text.
- **Die ganze Zeile folgt dem Mauszeiger** – mit allen Spalten (nicht nur dem Namen), bei mehreren markierten Zeilen gestapelt und mit Anzahl. Oben an der Zeile steht, was passiert („Zuordnen“, „Entfernen“).
- Über den Zuordnungslisten steht der Hinweis „Zeilen ziehen oder doppelklicken“.

## Neu in 0.38.1

- **Ziehen und Ablegen (Drag & Drop) – überall, wo etwas zugeordnet oder sortiert wird.** Mit Maus, Stift und Finger (Finger: kurz halten, dann ziehen). Beim Ziehen zeigt eine Linie die Einfügestelle und eine Beschriftung am Zeiger, was passiert („Zuordnen“, „Entfernen“); am Rand scrollt die Liste von selbst mit, Esc bricht ab. Die bisherigen Schaltflächen („Zuordnen“, „Entfernen“) und der Doppelklick funktionieren weiter.
  - **Zugeordnet ↔ Nicht zugeordnet:** Zeilen einfach in die andere Liste ziehen – auch mehrere markierte auf einmal. Bei Benutzergruppen (Benutzer, Filialen), Benutzer (Zugeordnete Filialen), Kassen (Rabatte), Kassen-Konfiguration (Rabatte, Zusatzinformationen, Hot Items, Zahlungsarten, Pflichtangaben), Größenschlüssel und in der Artikelmaske (Attribute, Texte).
  - **Reihenfolgen:** Zeilen ziehen in „Größen sortieren“, im Mehr-Menü der Kasse, bei den Hot Items (so ist die Reihenfolge der Warengruppen-Leiste an der Kasse), bei den Zahlungsarten (Einstellungen › Zahlungsarten – so ist die Reihenfolge im Bezahlen-Dialog), in der Manuellen Artikelsortierung, bei den eigenen Feldern (Anpassen › Felder) und in allen Stammdaten-Tabellen (Anfasser rechts in der Zeile). Im Artikel lassen sich Bilder (das erste ist das Hauptbild) und Farben (die erste ist das Kachelbild) per Ziehen anordnen.
  - **Spalten:** Spaltenköpfe in jeder Tabelle ziehen, um sie umzuordnen; auf die Gruppierleiste ziehen = gruppieren. Auch in der Spalten-Auswahl lässt sich die Reihenfolge ziehen.
  - **Dateien aus dem Explorer/Finder:** Bilder auf die Bildergalerie eines Artikels ziehen, CSV-Dateien in die Import-Fenster (Daten importieren, Stammdaten-CSV, FEDAS), auf den Order-Import und auf die EDI-Nachrichten. Eine nirgends abgelegte Datei öffnet sich nicht mehr im Programmfenster.
  - Unter Windows hat das Fenster das Ziehen bisher selbst abgefangen – das ist abgestellt, Ziehen funktioniert in der App wie im Browser.
- **Menüpunkte ohne Recht sind ausgeblendet.** Wer ein Recht weder über die Rolle noch über die Benutzergruppe hat, sieht die zugehörigen Menüpunkte nicht mehr – im Menü, in der Menüsuche, unter „Zuletzt benutzt“ und in der Befehlspalette (Strg+K); leere Untermenüs und Bereiche verschwinden mit. Neu zugeordnet sind u. a. Kasse, Belege, Reservierungen, Auswahl und Gutscheine (An der Kasse verkaufen), Kassenbuch-Protokolle, Faktura (Rechnungen, Angebote, Lieferscheine, Versand-Etiketten, Webshop-Bestellungen), Umlagerungen und Bestandskorrektur, Nachsortierung und Artikel-Import, Einkauf mit EDI und Lieferanten, Eingangsrechnungen, Auswertungen und Power BI, Filialen und Erweiterungen. Die System-Seiten (Benutzer, Rollen & Rechte, Zugangsprofil, Sicherung, Updates, RKSV, Protokolle) sind nur für Administratoren sichtbar. Wer eine Seite direkt aufruft, bekommt weiter die PIN-Freigabe einer berechtigten Person.
- **Dialoge: Schaltflächen immer sichtbar.** Titel oben und Schaltflächen unten (z. B. „Später“ und „Freigeben“ beim Update) bleiben stehen, gescrollt wird nur der Inhalt – man muss nicht mehr bis ganz nach unten scrollen. Das Update-Fenster zeigt nur noch, was seit der installierten Version neu ist, in einem eigenen scrollbaren Feld.

## Neu in 0.37.0

- **Stammdaten › Benutzer › Benutzergruppen – neu nach dem Vorbild von Advarics.** Die Liste zeigt Name, Beschreibung, Rolle, Personen, Mitglieder, Filialen, Rechte und Menüpunkte (mit Suche, Filter, Sortierung, Gruppierung und CSV-Export). Doppelklick oder „Neu“ öffnet die Maske mit den Reitern **Allgemein · Rechte-Verwaltung · Sonderberechtigungen · Kassenberechtigungen · Benutzer · Filialen**. Oben: Übersicht · Aktualisieren · Sichern · Neu · Änderungen zurücknehmen · Löschen und Blättern zwischen den Gruppen.
- **Die Gruppe wirkt wirklich auf ihre Mitglieder:**
  - **Rolle:** Grundrechte der Gruppe (siehe Rollen & Rechte). Wer der Gruppe zugeordnet wird, bekommt diese Rolle (Administratoren behalten ihre).
  - **Rechte-Verwaltung:** Menü-Baum mit Häkchen „Zugeordnet“ – einzelne Menüpunkte oder ganze Bereiche abwählen. Abgewählte Punkte sind für die Mitglieder ausgeblendet und gesperrt: im Menü, in der Suche, unter „Zuletzt benutzt“ und beim direkten Aufruf („Kein Zugriff“).
  - **Sonderberechtigungen und Kassenberechtigungen:** je Recht „Wie Rolle“, „Erlaubt“ oder „Gesperrt“ (Artikel bearbeiten, Preisaktionen, Bestand buchen, Einkauf, Rechnungen, Faktura, Marketing, Kunden, Berichte, Anpassen, Einstellungen, System; An der Kasse verkaufen, Retouren, Kassenbuch und Tagesabschluss). Das gilt auch für Freigaben per PIN (nur wer das Recht hat, darf freigeben) und am Handy („Bestand buchen“).
  - **Benutzer:** Mitglieder zuordnen und entfernen (eine Person gehört zu höchstens einer Gruppe), „Neu“ legt eine Person direkt in der Gruppe an, „Rolle setzen“ gleicht bestehende Mitglieder an die Rolle der Gruppe an.
  - **Filialen:** Mitglieder können sich nur an diesen Filialen anmelden (eine eigene Zuordnung der Person geht vor).
  - Administratoren sind von Abweichungen und Sperren ausgenommen – so kann sich niemand über eine Gruppe selbst aussperren.
- **Sicherheit:** Änderungen an Rolle, Rechten, Sperren, Mitgliedern und Filialen sowie das Löschen einer Gruppe verlangen die Freigabe eines Administrators. Ungesicherte Änderungen werden beim Verlassen der Maske abgefragt.
- Der Hinweis bei fehlenden Rechten nennt jetzt auch die Benutzergruppen. In den Stammdaten-Tabellen gibt es eine Spalte „Beschreibung“ für Benutzergruppen.
- Nicht übernommen (im lokalen Kassensystem ohne Gegenstück): „Rolle für Benannte Einstellungen“, „Layout von“, „Endkunden-Ansicht“, „Kann alle WhatsApp Chats sehen“ und die mobilen Menüpunkte des Advarics-Handys. Offen zur Entscheidung: „EK anzeigen“ (Einkaufspreise ausblenden), „WE-Avis Berechtigung“ und einzelne Kassen-Vorgänge (Tagesabschluss, Stornierung, Kasseneinlage, Abschöpfung) getrennt sperren.

## Neu in 0.36.1

- Einstellungen › Benutzer & Anmeldung verweist jetzt auf die neuen Seiten **Stammdaten › Benutzer › Benutzer** und **Rollen & Rechte** (zwei Schaltflächen „Öffnen“); der Hinweis bei einer fehlenden Berechtigung nennt den neuen Ort der Rechte-Matrix.

## Neu in 0.36.0

- **Stammdaten › Benutzer › Benutzer – neu nach dem Vorbild von Advarics.** Die Benutzerliste ist jetzt eine Tabelle mit Bild, Nr., Vorname, Name, E-Mail Firma, Rolle, Benutzergruppe, Aktiv, Verkäufer:in und Anmeldung (Filialen und „Kontor mobil“ lassen sich über „Spalten“ zuschalten) – mit Suche, Filter, Sortierung, Gruppierung und CSV-Export. Doppelklick oder „Neu“ öffnet die Benutzer-Maske mit den Reitern **Allgemein · Haupt-Adresse · Zugeordnete Filialen · Benachrichtigungen · Rechte · Anmeldung**. Oben: Übersicht · Aktualisieren · Sichern · Neu · Änderungen zurücknehmen und Blättern zwischen den Personen. Pflichtfelder sind markiert, ein roter Zähler am Reiter zeigt, wo etwas fehlt.
- **Jede Angabe hat eine Wirkung** (nichts ist nur Deko):
  - **Bild** (ziehen, mit Strg + V einfügen oder anklicken; wird auf 256 × 256 zugeschnitten): Anmeldebildschirm, Seitenleiste, Freigabe-Fenster, Liste.
  - **Name auf dem Bon** steht auf dem Kassenbon und in der Bon-Mail (leer = Vorname). **Verkäufer:in** schaltet, ob die Person an der Kasse je Position und bei der Bon-Zuordnung gewählt werden kann. **Kontor mobil** erlaubt oder sperrt die Anmeldung am Handy/Tablet.
  - **Benutzergruppe** und **Zugangsprofil** sind die gleichnamigen Stammdaten-Tabellen – die Auswahl in der Maske trägt die Person dort ein (die Rolle der Gruppe wird vorgeschlagen). **Zugeordnete Filialen:** die Person kann sich nur an diesen Filialen anmelden (Administratoren überall). **Benachrichtigungen:** Ereignisse, über die die Person als Hinweis oder per E-Mail informiert wird (Zuordnung Meldungen). **E-Mail Firma** ist der Empfänger.
  - **Rechte:** zeigt, was die gewählte Rolle darf; die Rechte-Matrix selbst steht jetzt als eigene Seite **Rollen & Rechte** im Menü Benutzer. **Anmeldung:** PIN, Zwei-Faktor, Benutzername/Passwort/Windows Hello und Single Sign-On.
  - Beim Umbenennen folgen Gruppe, Zugangsprofil und Meldungen dem neuen Namen. Personalnummer (automatisch, änderbar) und „Zuletzt geändert“ gehören dazu.
- **Deaktivieren statt Löschen:** Personen werden nie gelöscht (Belege und Protokoll verweisen auf sie). In der Liste markieren und „Deaktivieren“, in der Maske mit dem Schalter „Aktiv“ wieder zurück. Das eigene Konto und der letzte Administrator sind geschützt.
- **Sicherheit:** Neue Personen, Rollen-, Status- und PIN-Änderungen verlangen die Freigabe einer Administratorin / eines Administrators; Kontaktdaten, Bild, Adresse oder Zuordnungen ändern geht ohne Zusatz-PIN. Ungesicherte Änderungen werden beim Verlassen der Maske abgefragt. Wer noch die Erst-PIN hat, ist in der Liste und im Reiter „Anmeldung“ markiert (die Prüfung läuft im Hintergrund).
- **Bewusst weggelassen**, weil ohne Wirkung in einem lokalen Kassen- und Warenwirtschaftssystem: Stil, Titel, Geburtstag, Region/Sprache, Verkaufs-Abteilung, Analyse-Manager, „Ist Kassierer/Einkäufer“, „Gesendete/Empfangene Benachrichtigungen“ und die Dokumenten-Archivierung. Sie lassen sich bei Bedarf nachrüsten, sobald es eine Funktion dazu gibt.
- Intern: Die Prüfung auf Erst-PINs blockiert die Datenbank nicht mehr; Tabellen können ihre „Löschen“-Schaltfläche umbenennen (hier „Deaktivieren“).

## Neu in 0.35.0

- **Jede Einstellung ist jetzt eine eigene Seite.** Die lange Sammelseite „Kontor-Einstellungen“ mit über 20 Abschnitten zum Scrollen gibt es nicht mehr. Im Menü unter Einstellungen gibt es vier Gruppen, jeder Punkt öffnet seine eigene Seite mit eigenem Titel und eigener Adresse:
  - **Allgemein:** Firma & Filiale · Standardwerte · Darstellung · Benutzer · Single Sign-On
  - **Kasse & Beleg:** Kasse · Bon & Belege · Drucker & Lade · Etiketten-Ausgabe · Zahlungsarten · Zahlungsterminal · Kundendisplay · RKSV
  - **Geräte & Verbund:** Filialverbund · Handy & Tablet · E-Mail
  - **Daten & System:** Lokale KI · Datensicherung · Updates · System & Protokoll
  - Die Buchhaltungs-Konten stehen unter **FiBu › FiBu Einstellungen**.
- Alle Verknüpfungen (Einrichtungs-Assistent, Meldungen wie „Kein Bondrucker eingerichtet“, Statuszeile „Backup“, Suche mit Strg K, alte Lesezeichen) führen direkt auf die richtige Seite.
- **Keine doppelten Menüpunkte mehr:** „Updateübersicht“ (gleiche Seite wie „Updates“), „Datensicherung“ unter System (gleiche Seite wie unter Einstellungen) und die wirkungslose Tabelle „FiBu Einstellungen – Konten“ (die echten Konten stehen jetzt dort) sind entfernt. Die Zahlungsarten-Liste mit den Kassenlade-Einstellungen heißt jetzt „Zahlungsarten & Kassenlade“, damit sie nicht mit „Zahlungsarten“ (Anbieten, PayPal, IBAN) verwechselt wird.
- Beim Wechsel zwischen Einstellungsseiten springt die Ansicht wieder nach oben.
- Intern: Die Oberfläche wird beim Bauen atomar geschrieben (keine halbfertige Datei mehr).

## Neu in 0.34.5

- **Nur noch eine Einstellungsseite:** „Einstellungen Allgemein“ und „Kontor-Einstellungen“ gab es doppelt. Jetzt gibt es im Menü unter Einstellungen genau einen Eintrag „Allgemein“. Die Felder der bisherigen Seite stehen als Abschnitt **Standardwerte** (zweiter Punkt links) in dieser Seite: Unternehmens-GLN, Gutscheine gültig (Jahre), Standard-Spediteur, Standardwerte für neue Artikel (Warengruppe, Marke, MwSt.-Satz, Größenschlüssel) und E-Mail-Fußzeile. Änderungen wirken sofort – ein extra „Sichern“ ist nicht mehr nötig.
- Das Feld „Gutscheine gültig (Jahre nach Ausgabejahr)“ war zusätzlich bei „Kasse“ vorhanden – es gibt es jetzt nur noch einmal (bei Standardwerten).
- „Benutzer-Einstellungen“ ist aus dem Menü verschwunden (öffnete dieselbe Seite); die Benutzer-Einstellungen stehen weiter in der Seite „Allgemein“ im Bereich „Benutzer“. Alte Verknüpfungen leiten auf die neue Seite um.

## Neu in 0.34.4

- **Kontor für macOS:** Es gibt jetzt einen Mac-Client wie unter Windows – ein Installationsabbild (`Kontor_x.y.z_universal.dmg`) im Release, nativ für Apple Silicon (M1–M4) und Intel-Macs (macOS 11 oder neuer). Updates kommen wie bisher im Programm (Einstellungen › Updates), mit Freigabe und vorheriger Sicherung. Hinweis zum ersten Start (Programm ist nicht notarisiert): Rechtsklick auf Kontor › Öffnen. Ausführliche Anleitung in der README.
- **Bondrucker und Etikettendrucker am Mac:** Drucker, die im Mac-Drucksystem eingerichtet sind (Systemeinstellungen › Drucker & Scanner), erscheinen unter Einstellungen › Drucker & Lade als „Mac-Drucker“ – ESC/POS und ZPL gehen unverändert („raw“) an die Warteschlange. Netzwerkdrucker (IP, Port 9100) funktionieren auf beiden Systemen identisch.
- Windows Hello wird nur unter Windows angeboten. Anzeige-Hinweise (Druckernamen, Backup-Pfad) passen sich dem System an.
- Auto-Fit: Der Zoom-Bereich der Desktop-App wurde erweitert (0,5–3,0) und die Oberfläche übernimmt den tatsächlich gesetzten Wert – wichtig für 4K-Monitore, auf denen die Automatik mehr als 200 % wählt.
- Der Build läuft jetzt in einem gemeinsamen Ablauf (`desktop.yml`): erst Windows, dann macOS, beide in demselben Release mit gemeinsamem Update-Feed.

## Neu in 0.34.3

- Die Anzeige passt sich jetzt stufenlos und laufend an Gerät und Bildschirm an (Auto-Fit): Kontor misst die tatsächliche Fenstergröße samt Windows-Skalierung und wählt daraus die Anzeigegröße – Ziel sind etwa 920 logische Pixel Höhe bei mindestens 1200 Pixel Breite. Beim Maximieren, Fenster-Verkleinern, Monitorwechsel oder Drehen eines Tablets wird sofort neu berechnet; vorher wurde nur einmal beim Start in groben Stufen entschieden.
- Geräte-Stufen für das Layout: Handy, Tablet, Laptop, Desktop und Wide (als Attribut an der Seite und als Variablen `--ui-lw`/`--ui-lh`).
- „Anzeigegröße“ ist jetzt eine Feinjustierung auf die Automatik (Kleiner · Automatisch · Größer · Groß · Sehr groß). Strg + / Strg − / Strg 0 funktionieren wie bisher. Frühere feste Prozentwerte werden einmalig auf „Automatisch“ zurückgesetzt.

## Neu in 0.34.2

- Fehler behoben: Seit 0.34.1 stand das Dashboard in einer einzigen Spalte (die Tabellen-Stile haben das Kachelraster überschrieben). Die Kacheln stehen wieder nebeneinander und nutzen breite Bildschirme bis 2400 px.
- Tabellen messen ihre Spalten jetzt nach Überschrift und Inhalt: keine abgeschnittenen Spaltenköpfe mehr, lange Überschriften (z. B. „Hierarchie Ebene1-Nr.“) brechen zweizeilig um, die freie Breite bekommen die Textspalten. „Spaltenbreite“ setzt eigene Breiten zurück.
- Einstellungs-Masken (Einstellungen Allgemein, Kassen, Kassen-Konfiguration, Bonus Systeme): Karten teilen sich die Breite, Felder stehen auf breiten Bildschirmen nebeneinander. Filter- und Staffel-Kacheln füllen die Zeile.
- Darstellung › Anzeigegröße: neue Wahl „Automatisch“ (passend zum Bildschirm, z. B. 150 % bei 3440 px). Die automatische Größe wird einmal beim Start bestimmt und springt nicht mehr.
- Manuelle Artikelsortierung: nur Warengruppen mit Artikeln (mit Anzahl) statt aller importierten Gruppen; Pfeile rauf/runter statt schräger Symbole.
- Order Vorschlags-Konfiguration und Digitales Schaufenster: Warengruppen-Auswahl zeigt nur Gruppen mit Artikeln (bereits gewählte bleiben sichtbar).
- Protokoll Gutscheine: lange Details brechen um statt die Seite zu verbreitern; Einstellungs-Änderungen erscheinen dort nicht mehr.
- Bonus Systeme › Filter: Hinweis, dass ohne Filter alle Artikel zählen.
- Breitere Seiten für Einstellungen und Listen auf großen Bildschirmen.

## Neu in 0.34.1

- Layout: Das Artikelraster der Kasse wurde auf breiten Bildschirmen (z. B. 3440 × 1440) von den Tabellen-Stilen überlagert – behoben.
- Tabellen und Listen (Artikel, Kassen, Bonus Systeme …) füllen jetzt die gesamte Breite, Spalten werden nicht mehr abgeschnitten.
- Die Anzeigegröße passt sich automatisch an große Bildschirme an. Wer A−/A+ benutzt, schaltet damit auf feste Größe um.
- Einstellungs-Karten verteilen sich auf mehrere Spalten statt rechts leer zu bleiben.

## Neu in 0.34.0

- Kassen › MwSt.-Sätze, Zahlungsarten, Kassen-Summen: die FiBu-Konten für Erlöse je Steuersatz, Bar, Karten/Wallets, Gutscheine, Geldtransit und Bank sind hier einstellbar und werden im Buchungsjournal und im DATEV-Export (Berichte › Buchhaltung) verwendet – auch die Konten je Zahlungsart, die es bisher nirgends zu einstellen gab.
- Fehler behoben: Kleine Bearbeiten-Fenster (z. B. Größe bearbeiten, Tabellenzeilen) haben beim Übernehmen die Eingabe verworfen. Jetzt wird sie gespeichert.

## Neu in 0.33.0

- Bonus Systeme wirken beim Verkauf: Nach jedem Kassenverkauf werden die passenden Artikel nach Filter (Marke, Warengruppe, Abteilung, Haupt-Abteilung, Bereich; einschließend/ausschließend) und Kundenbedingungen (Kundennummer von/bis, nur registrierte Kunden) geprüft, die Staffel nach Summe gewählt und ein Bonus-Gutschein (Prozent oder Betrag, getrennt für Laufkundschaft und gespeicherte Kunden) mit der eingestellten Gültigkeit ausgestellt und – bei automatischem Druck – gedruckt.
- Entfernt aus Bonus Systeme: Verwendungs-Schalter und Belegrabatt-Grenze (ohne Wirkung).

## Neu in 0.32.0

- Kassen-Konfiguration, weitere Reiter mit Wirkung:
  - Passwort-Verwaltung: Passwort 1/2 (nur als Prüfsumme gespeichert) schützen Tagesabschluss, Retoure/Storno, manuelles Öffnen der Lade und Kassenbuch.
  - Hot Items: zugeordnete Warengruppen stehen an der Kasse zuerst.
  - Scan-Regeln: Code-Länge, Start Position und Gelesene Länge bestimmen, wie gescannte Codes gelesen werden.
  - Pflichteingaben: Kundenfelder, die beim Speichern eines Kunden ausgefüllt sein müssen.
  - Beleg Zusatzinformationen: nur zugeordnete werden beim Bezahlen abgefragt.
  - Artikel-Info: 0-Bestände in der Bestandsmatrix ein-/ausblenden.
- Kassen: „Menü Mehr sortieren“ ordnet die Einträge des Menüs „Mehr“ an der Kasse; „Positionsinfo Sortieren“ zeigt Zusatzinfos (Artikelnr., Farbe, EAN, Warengruppe, Marke, Seriennr., Verkäufer) unter jeder Warenkorbposition.

## Neu in 0.31.0

- Kassen-Konfiguration wirkt jetzt an der Kasse (Konfiguration der Kasse dieses Arbeitsplatzes unter Kassen › Allgemein):
  - Prozesse nutzen: Menüpunkte (Reservierungen, Auswahl, Rechnungen, Umlagerungen, Reklamationen, Zeiterfassung, Kampagnen, Hilfe …) und Kassenfunktionen (Parken, Retoure/Umtausch, Gutschein verkaufen, Belegkopie, Kassenbuch-Buchungen) werden ein- oder ausgeblendet.
  - Zahlungsarten: nur zugeordnete erscheinen im Bezahl-Dialog; Standard-Zahlungsart wird vorgewählt; die Kassenlade öffnet je Zahlungsart.
  - Feste Rabatte: nur zugeordnete stehen zur Schnellwahl; Rabattgrenze der Konfiguration gilt.
  - Kassenlade bei Bar-Einlage/Abschöpfung/Wechselgeld, automatische Sperre nach Inaktivität, Rückfrage ab Artikelmenge.
  - Bon: Überschrift, Bezeichnungen, Rückgeld ausblenden, Teilezahl, Verkäufer am Ende, Rabatte zusammenfassen, AGB-Text, Anzahl Ausdrucke je Belegtyp.
- Nicht wirksame Felder wurden aus den Reitern genommen und kommen erst zurück, wenn sie etwas bewirken.

## Neu in 0.30.1

- Bonus Systeme, Kassen-Reiter (Feste Rabatte, MwSt., Zahlungsarten, Zusatz-Buchung, Kassen-Summen, WGR.-MwSt., Beleg-Konfiguration, Icon-Sortierung, Positionsinfo) und die Kassen-Konfiguration sind wieder da. Sie werden Schritt für Schritt an die Kasse angebunden.
- Die Kasse dieses Arbeitsplatzes: Name (Kopfzeile) und Kartenterminal (ZVT) wirken sofort.

## Neu in 0.30.0

- Nur noch Funktionen, die wirklich etwas bewirken. Entfernt: Bonus Systeme, Kassen-Konfiguration mit 100 Schaltern, Zahlungsarten-/MwSt.-/FiBu-Tabellen je Kasse, Beleg-Konfiguration, Icon-Sortierung, Positionsinfo, FinanzOnline-Zugangsdaten, Währung/Land/Sprache.
- Einstellungen Allgemein: GLN (EDI), Gutschein-Gültigkeit, Standard-Spediteur (Vorbelegung bei neuen Sendungen), Standardwerte für neue Artikel (Warengruppe, Marke, MwSt., Größenreihe aus dem Größenschlüssel) und E-Mail-Fußzeile (wird an jede ausgehende Mail angehängt).
- Buchungsabschluss sperrt jetzt wirklich: Belege mit Datum bis zum Abschlusstag können nicht mehr angelegt oder geändert werden.
- Kassen: Name der eigenen Kasse (Kopfzeile), Fiskalisierung und Signatureinheit (echte RKSV-Daten), Kartenterminal (ZVT) – alles mit Wirkung.
- Kassen-Konfiguration: bündelt die Kassen-Einstellungen (Rabattfreigabe, Retourengrenze, Vereinsrabatt, Pflichtfelder, Bon, Drucker/Lade) an einem Ort.
- Größen sortieren bleibt (Rauf/Runter/Automatisch).

## Neu in 0.29.3

- Aufgeräumt: Nur noch, was für ein On-Premise-System Sinn ergibt. Entfernt wurden die Advarics-Cloud-Teile: Buchungslogik (interner Bewertungs-Dienst), Filial-Code und Geräte-Registrierung, Globaler Domänen-Name/Belegservice, WebApp-Einstellungen, Kassen-Synchronisierung (Sync-Name, MAC, Update-Paket, Zeitstempel), RFID, Kassen-Layouts (XML), Self-Checkout, EasyRent, Loyalty, Unterschriften-Pad, Externe Zahlungsart, Kd.-Filter sowie der EFT-Treiber-Block.
- Kassen-Liste und Kassen-Maske zeigen nur noch Fil.-Nr., Filiale, Land, Kassen-Nr., Bezeichnung, Konfiguration, Aktiv, Region/Sprache und Design.

## Neu in 0.29.2

- Stammdaten › Größen › Größen sortieren wie bei Advarics: Sichern, Neu, Änderungen zurücknehmen, Rauf, Runter, Automatisch sortieren.
- Kassen › MwSt.-Sätze und WGR.-MwSt.-Einstellungen: Bearbeiten-Fenster „MwSt.-FiBu-Konto“ mit allen Karten (Kasse, Wareneingang, Retoure, Zusatz-Info, EU, Drittland, Info).
- Kassen › Fiskalisierung: Bearbeiten der FinanzOnline-Zugangsdaten (Name, Benutzer-, Teilnehmer-Identifikation, PIN).
- Kassen › Beleg-Konfiguration: Belegtyp muss je Kasse einmalig sein.
- Menü Einstellungen: Reihenfolge wie bei Advarics (Hintergrundjobs, Etikettentypen, Benutzer-Einstellungen, elekt. Etiketten, Prozesskonfiguration, Nummernkreise, Warengruppen Schemas, Scanner-Regeln, MwSt.-Einstellungen, Einstellungen Etikettendrucker, Artikelservice).

## Neu in 0.29.1

- Kassen-Konfiguration: die letzten Reiter sind jetzt befüllt – Synchronisierung, Pflichteingaben (Zuordnung der Kundenfelder), Tax-Free Dienste und Kd.-Filter. Zusatz-Buchungen und Beleg Zusatzinformationen sind zuordenbare Listen.

## Neu in 0.29.0

- Einstellungen › Kassen › Kassen: Bearbeiten-Seite mit allen Reitern. Neu befüllt: Allgemein (wie Advarics), Fiskalisierung (echte RKSV-Daten), Signatureinheit, MwSt.-Sätze, Zahlungsarten, Zusatz-Buchung, Kassen-Summen, WGR.-MwSt.-Einstellungen, Beleg-Konfiguration, Kassen-Layouts, Kassen-Icon Sortierung (Rauf/Runter), Positionsinfo Sortieren.
- Einstellungen › Kassen › Kassen-Konfiguration (neu): Liste und Bearbeiten-Seite mit den Reitern Prozesse Nutzen, Allgemein, Beleg-Druck, Beleg-Druck Info, Unterschriften-Pad, Währung, Feste Rabatte, Zahlungsarten (mit Zahlungsart-Detail), Externe Zahlungsart, Scan-Regeln (mit „Automatische Scan-Regeln“), Hot Items, Passwort-Verwaltung, EFT-Kartentyp zuordnen und Artikel-Info.
- Einstellungen › Zahlungsarten: Liste der 20 Zahlungsarten mit Bearbeiten-Fenster.
- Noch ohne Inhalt: Kassen › Rabatt/Synchronisierung-Zeitstempel sind Platzhalter; Kassen-Konfiguration › Zusatz-Buchungen, Beleg Zusatzinformationen, Synchronisierung, Pflichteingaben, Tax-Free Dienste, Kd.-Filter.
- Die Einstellungen der Kassen-Konfiguration werden gespeichert, wirken aber noch nicht an der Kasse.

## Neu in 0.28.0

- Einstellungen › Buchungsabschluss wie bei Advarics: Feld „Abschluss zum“ mit Sichern und Liste der Abschlüsse (Erstellt am, Abschluss zum, User-Nr., User). Datum darf nicht in der Zukunft und nicht vor dem letzten Abschluss liegen.
- Einstellungen › Bonus Systeme: Liste und Bearbeiten-Seite mit den Reitern Allgemein, Filter und Staffeln (Pflichtfeld-Zähler am Reiter).
- Einstellungen › Kassen: Liste mit allen 22 Spalten und Bearbeiten-Seite mit den Reitern Allgemein, Fiskalisierung, Signatureinheit, Rabatt (zugeordnet / nicht zugeordnet), Synchronisierung, RFID, EFT, FiBu und den weiteren Advarics-Reitern (noch ohne Inhalt: Fiskalisierung, Signatureinheit, MwSt.-Sätze, Zahlungsarten, Zusatz-Buchung, Kassen-Summen, WGR.-MwSt.-Einstellungen, Beleg-Konfiguration, Kassen-Layouts, Kassen-Icon Sortierung, Positionsinfo Sortieren).
- Marken-Auswahl nutzt die Marken der Artikel, solange keine Marken-Stammdaten angelegt sind.

## Neu in 0.27.0

- Einstellungen › Einstellungen Allgemein wie bei Advarics: Reiter Allgemein und E-Mail-Fußzeile, Karten Allgemein, Internationalisierung, Sonstige Standard-Einstellungen, Standard-Einstellungen f. Warengruppen, Gutscheine, Geräte-Registrierung und WebApp-Einstellungen. Auswahlfelder mit Suche, Löschen, Öffnen und Neu anlegen. Sichern und Änderungen zurücknehmen.
- Einstellungen › Buchungslogik (Status-Seite mit Einstellungen, Status, Auswertung, Prüfung).
- Menü Einstellungen: Reihenfolge wie bei Advarics beginnt mit Einstellungen Allgemein, Buchungslogik, Buchungsabschluss; die bisherigen Kontor-Einstellungen heißen „Kontor-Einstellungen“.

## Neu in 0.26.3

- Tabellen füllen jetzt die ganze Arbeitsfläche bis unten (vorher blieb unter der Tabelle leerer Platz).
- Kompakterer Tabellenkopf: Gruppieren, Suche und Knöpfe in einer Zeile, „Filter erstellen“ in der Fußzeile.

## Neu in 0.26.2

- Verleih / Rental Service komplett entfernt (Belegart, Tarife, Dashboard-Baustein, Vorlage).

## Neu in 0.26.1

- Menüpunkt „Verleih (Rental Service)“ und „Stammdaten › Rental Service“ entfernt – wird nicht gebraucht.

## Neu in 0.26.0

- Artikelbilder direkt anklicken: In der Artikelliste sind die Bilder jetzt groß (Zeilen höher), ein Klick öffnet die große Bildansicht mit Blättern (Pfeile, Pfeiltasten, Vorschaustreifen, Esc). Auch in der Artikelmaske (Reiter Bilder-Zuordnung) öffnet ein Klick auf ein Bild die große Ansicht.
- Schnell größer/kleiner: Knöpfe „A−“ und „A+“ oben rechts neben der Palette (zusätzlich Strg + / Strg −).

## Neu in 0.25.2

- Alles größer und besser lesbar: Standard-Anzeigegröße jetzt 125 % (einmalig übernommen), Schrift etwas kräftiger. Die Anzeigegröße lässt sich jederzeit ändern: Darstellung-Menü (Palette oben rechts) mit 100–160 %, Einstellungen oder Strg + / Strg - / Strg 0.

## Neu in 0.25.1

- Bessere Erkennbarkeit in der Arbeitsfläche: deutlich dunklere Schrift und Beschriftungen, kräftigere Rahmen und Trennlinien, stärker abgesetzte Karten, dunklerer Hintergrund hinter den Karten, fettere Spaltenköpfe, größere Feldbeschriftungen.

## Neu in 0.25.0

- Neues Farbdesign: dunkles Seitenmenü (Anthrazit) mit hellen Texten, helle neutrale Arbeitsfläche ohne Blaustich, Akzentfarbe Orange (Kontor-Orange) für aktive Punkte, Knöpfe, Reiter und Diagramme. Wird einmalig als Standard übernommen; unter Darstellung bleibt jede andere Akzentfarbe wählbar.

## Neu in 0.24.0

- Größenschlüssel 34 Sohlen mit seinen 12 Größen (20 bis 31) – damit sind alle 34 von Hand angelegten Advarics-Größenschlüssel übernommen.
- Datentabellen und Artikelmasken großzügiger und ruhiger: größere Zeilen und Schrift, mehr Abstand, runde Karten und Leisten, aufgeräumte Zuordnungs-Tabellen.

## Neu in 0.23.13

- Größenschlüssel 1 ohne Gr. mit seinen 7 Advarics-Größen (*, One Size, OneSize, S, M, L, XL).

## Neu in 0.23.12

- Größenschlüssel 33 xxxJKE 3 Sport Holding GmbH mit seinen 10 Advarics-Größen (2A, 4A, 6A, 8A, 10A, 92, 104, 116, 128, 140).

## Neu in 0.23.11

- Größenschlüssel 28 Rucksäcke (14), 29 Bandagen (8), 30 Hosenträger (3), 31 Getränke (1) und 32 Sprays & Pflegemittel (4) mit ihren Advarics-Größen.

## Neu in 0.23.10

- Größenschlüssel 24 Socken Erw. (10), 25 Schuhe Erw. Snowboard MP (20) und 27 Kinder (12) mit ihren Advarics-Größen; 26 Schuhe Kids Snowboard MP ist wie in Advarics leer.

## Neu in 0.23.9

- Größenschlüssel 20 Snowboard Länge Erw. (9), 21 Ski Alpin Länge Kids (16), 22 Ski Alpin Länge Erw. (19) und 23 Socken Kids (11) mit ihren Advarics-Größen.

## Neu in 0.23.8

- Größenschlüssel 15 Handschuhe Erw. (14), 16 Skistöcke Kids (8), 17 Skistöcke Erw. (10), 18 Snowboardbindungen (4) und 19 Snowboard Länge Kids (10) mit ihren Advarics-Größen.

## Neu in 0.23.7

- Größenschlüssel 10 Helme Kids (4), 11 Helme Erw. (12), 12 Protektoren Kids (7), 13 Protektoren Erw. (7) und 14 Handschuhe Kids / Junior (13) mit ihren Advarics-Größen.

## Neu in 0.23.6

- Größenschlüssel „9 Schuhe Kids Ski MP“ mit seinen 24 Größen (18/18.5 bis 27/27.5 und 150 bis 215 in 5er-Schritten).

## Neu in 0.23.5

- Größenschlüssel „8 Schuhe Erw. Ski MP“ mit seinen 32 Größen (22/22.5 bis 32/32.5 und 220 bis 320 in 5er-Schritten).

## Neu in 0.23.4

- Größenschlüssel „7 Schuhe Erw. UK“ mit seinen 24 Größen (3 bis 14,5 sowie 40 2/3, 42, 43 1/3, 44 2/3, 46, 47 1/3).

## Neu in 0.23.3

- Größenschlüssel „6 Schuhe Erw. EU“ mit seinen 61 Größen (35 bis 51 inkl. Drittel- und Halbgrößen). Bei Halbgrößen (36½ …) und „One Size“ ist „Größe 1“ jetzt ausgefüllt (36 1/2 …).

## Neu in 0.23.2

- Größenschlüssel Damen (13 Größen 32–50), Herren (15 Größen 39–60) und Schuhe Kids EU (24 Größen 16–39) haben ihre Advarics-Größen; leere Schlüssel werden beim Start befüllt.

## Neu in 0.23.1

- Größenschlüssel „2 Unisex“ hat jetzt seine 16 Advarics-Größen (XXS … XXXL); leere Schlüssel werden beim Start damit befüllt, bereits bearbeitete bleiben unberührt.

## Neu in 0.23.0

- Größenschlüssel bearbeiten wie in Advarics: eigene Seite mit Werkzeugleiste (Übersicht, Aktualisieren, Sichern, Neu, Änderungen zurücknehmen, Löschen), Navigation durch alle Schlüssel und den Reitern Allgemein (Nr., Bezeichnung, Zugeordnet / Nicht zugeordnet mit Größe, Sortierungsnr., Größe 1/2 – Doppelklick ordnet zu oder entfernt) und Statistikgrößen (Statistik-Größe je Größe).

## Neu in 0.22.1

- Stammdaten › Größen › Größenschlüssel als Datentabelle mit Nr., Name, Synchronisiert (+ Anzahl Größen). Die 34 Advarics-Größenschlüssel (ohne Gr., Unisex, Damen, Herren, Schuhe Kids EU … Sohlen) werden beim ersten Start angelegt. Doppelklick: Größen je Schlüssel in der gewünschten Reihenfolge zuordnen (auch aus der Größenliste).

## Neu in 0.22.0

- Stammdaten › Größen › Größen: die Advarics-Größenliste (1.023 Größen) ist eingebaut und wird beim ersten Start übernommen, mit Sortierungsnr. 1 bis 1.023 in logischer Reihenfolge (Bekleidung, Zahlen, Text, Gewichte). Datentabelle mit Größe, Sortierungsnr., Größe 1, Größe 2; Neu, Bearbeiten, Löschen. Die Sortierungsnr. dient als Größensort.-Nr. in der Artikelmaske.

## Neu in 0.21.2

- Artikelmaske moderner: Karten mit großzügigem Abstand (Artikel, Preis, Lieferant & Bestand, Übersicht, Webshop, Werkzeuge), Felder mit Beschriftung am Rand, logische Gruppierung (EK/VK/MwSt. zusammen mit Spannenanzeige). Gilt für alle Reiter.

## Neu in 0.21.1

- Datentabellen (Warengruppen, Artikel) und Artikelmaske im eigenen Kontor-Stil: helle Werkzeugleiste und Reiter in der Designfarbe statt dunkelblau/orange. Alle Funktionen bleiben.

## Neu in 0.21.0

- Artikel im Advarics-Stil: Artikelliste als Datentabelle (Gruppieren, Spaltenfilter, Spalten-Auswahl, Export, Auswahl, Etiketten) und Artikelmaske als eigene Seite mit Werkzeugleiste (Übersicht, Aktualisieren, Sichern, Neu, Änderungen zurücknehmen, Löschen, Artikel-Service), Datensatz-Navigation und den Reitern Allgemein, Basispreise, Filial-Preise, Scancodes, Bestand, Preisänderungen, Buchungen, Artikel-Karte, Zusätzl. Lieferanten, Artikel-Merkmale, Zusatz-Preise, Bilder-Zuordnung, Attribut-Zuordnung, Text-Zuordnung, Übersetzung, NOS Monatswerte, Vorgänger-Artikel – dazu die bisherigen Reiter Beschreibung, Material, Technik, Klassifikation, Webshop, Farben & Größen.
- Preisänderungen werden protokolliert (Reiter „Preisänderungen“), Bestand je Filiale und Buchungen je Artikel.
- Neu: Stammdaten › Artikeltexte (Textbausteine für die Text-Zuordnung).

## Neu in 0.20.0

- Warengruppen als Datentabelle im Advarics-Stil: Werkzeugleiste (Zurück, Aktualisieren, Neu, Fedas Synchronisierung), Gruppierleiste (Spalten hineinziehen), Suche, Spalten-Auswahl, automatische Spaltenbreite, Export, Filterzeile je Spalte, Sortierung, Auswahlkästchen, Spalten Hierarchie Ebene1–3 (Nr./Name), MwSt.-Typ, Etiketten-Typ, Inventur, Altersbewertung, Vorschl.-Spanne/Kalk. Doppelklick bearbeitet, flüssig auch mit 11.848 Zeilen.

## Neu in 0.19.2

- Die Advarics-Warengruppen sind fest eingebaut (11.848 Gruppen mit Bereich › Hauptabteilung › Abteilung, MwSt., Etikettentyp, Inventur …) und werden beim ersten Start automatisch übernommen. Die bisherige Standardliste wird dabei ersetzt, Artikel werden zugeordnet. Kein Dateiimport mehr nötig.

## Neu in 0.19.1

- Warengruppen-Import ersetzt die bisherigen Warengruppen komplett: Demo-Liste (Jacken & Westen, Hosen, Schuhe …) und von Hand angelegte Ebenen werden entfernt, vorhandene Artikel werden den passenden Advarics-Gruppen zugeordnet (Textil, Hartware, Schuhe, Accessories). Kasse und Auswahllisten zeigen danach nur noch die Advarics-Warengruppen.

## Neu in 0.19.0

- Leichter zurechtfinden: Suchfeld „Menü durchsuchen“ über dem Menü (Treffer mit Pfad, Enter öffnet den ersten), Bereich „Zuletzt benutzt“ mit den letzten Seiten, Untermenüs mit nur einem Punkt sind direkte Menüpunkte.

## Neu in 0.18.1

- Menüdesign wieder wie in 0.16.1 (freigegeben): Bereichstitel mit kleinem Farbsymbol. Ausblenden nach Rechten und FEDAS unter Stammdaten › Warengruppen bleiben.

## Neu in 0.18.0

- Menü komplett neu gestaltet: ruhige, flache Liste ohne Farben und Symbolleisten, schlichte Bereichstitel, nur der aktive Punkt ist hervorgehoben.
- Menüpunkte ohne Berechtigung werden ausgeblendet (samt leerer Untermenüs und Bereiche) statt nur ausgegraut.
- FEDAS ist kein eigener Bereich mehr, sondern liegt unter Stammdaten › Warengruppen › FEDAS. Das Marken-Demosortiment steht unter Stammdaten neben Marken.

## Neu in 0.17.0

- Warengruppen-Import aus Advarics (XLSX): Im Advarics-Import wird die Datei automatisch als Warengruppenliste erkannt. Importiert Warengruppen samt Hierarchie (Bereich › Hauptabteilung › Abteilung), MwSt.-Typ, Etikettentyp, Inventur, Altersbewertung und Spanne. Wiederholbar, löscht nichts.
- Stammdaten-Tabellen zeigen bei großen Listen die ersten 200 Treffer (Suche eingrenzen); lange Auswahllisten laden erst beim Öffnen. Die Kasse zeigt nur Warengruppen mit Artikeln.

## Neu in 0.16.1

- Ruhigeres linkes Menü: schlichte Bereichstitel statt farbiger Leisten, beim ersten Start alle Bereiche eingeklappt (nur der aktuelle ist offen), kompaktere Abstände.

## Neu in 0.16.0
- **Advarics-Import (Artikel → Artikelpflege):** Artikelexport aus Advarics (Excel „GridExport“) einlesen – Vorschau mit Zahlen, dann Import mit Fortschrittsanzeige. Marke, Artikel-Nr., Name, Farben, EK, VK, Bestand, Hauptlieferant, Warengruppe, Saison und Lagerplatz werden übernommen; mehrere Zeilen derselben Artikelnummer werden zu einem Artikel mit mehreren Farben
- **Bilder:** in der Tabelle eingebettete Bilder werden gespeichert, Bild-Links (z. B. Bildserver des Verbands) im Hintergrund geladen
- Lieferanten und Warengruppen werden automatisch angelegt; Kassenpositionen wie „Anzahlung“ oder „Service“ (ohne VK) werden nicht als Artikel importiert und aufgelistet; ein zweiter Import legt nichts doppelt an
- Option, das Demo-Sortiment vorher zu deaktivieren
- Artikelliste: bei vielen Warengruppen eine Auswahlliste mit Anzahl statt Kacheln

## Neu in 0.15.1
- **Echte Datenquelle für FEDAS-Daten: OUTTRA Data & Image Hub.** FEDAS ist der einheitliche 6-stellige Produktschlüssel der Sportartikelbranche – die Stammdaten der Marken liegen in Datenhubs. Kontor spricht jetzt die dokumentierte Händler-API von OUTTRA (api.outtra.com): freigeschaltete Marken laden, Varianten seitenweise abrufen, täglich nur Änderungen (updatedAfter), automatisches Warten bei Anfragelimit
- Übernommen werden FEDAS-Schlüssel, Beschreibung, Merkmale, Material (außen/innen/Futter/Füllung/Sohle), Pflege, Herkunft, Zolltarif, Gewicht, Größen, UVP und Einkaufspreis, Dokumente (Anleitung, Größentabellen) und alle Bilder mit Ansicht (Front, Rück, Detail, Model) in der Reihenfolge des Herstellers
- Schritt-für-Schritt-Anleitung für den kostenlosen Händlerzugang in der App (Registrierung, Marken freischalten, Token anfordern); eigene Schnittstelle bleibt als zweite Quelle wählbar
- Mailto-Links (E-Mail an Support) funktionieren

## Neu in 0.15.0
- **FEDAS-Sync:** Artikelstammdaten der Hersteller über FEDAS abholen – Herstellerliste, Artikel je Hersteller mit Varianten (EAN, Farbe, Größe), UVP und Mehrwertsteuer, Beschreibung, Material, Herkunft, Zolltarif, FEDAS-Produktschlüssel und Bilder. Neue Artikel werden angelegt, vorhandene über die EAN ergänzt (Bestand bleibt unberührt, eigene Felder bleiben erhalten)
- **Täglicher Automatik-Abgleich:** auf Wunsch jeden Tag zur eingestellten Uhrzeit im Hintergrund, nur Änderungen seit dem letzten Lauf; verpasste Läufe werden nachgeholt; Protokoll mit Zahlen und Fehlern. Zugang (Adresse, Anmeldung, Pfade) frei einstellbar – dazu Datei-Import (CSV/JSON) und FEDAS-Klassifikation → Warengruppe
- **Artikelmaske komplett neu:** Reiter Stammdaten, Beschreibung (Kurztext, Langtext, Merkmale, Technologien, Zielgruppe, Einsatz, Passform), Material & Pflege (Obermaterial, Futter, Füllung, Membran, Sohle, Zusammensetzung, Pflege, Zertifikate, Nachhaltigkeit), Maße & Technik (Gewicht, Volumen, Wassersäule, Schuh- und Skidaten …), Klassifikation & Zoll, Bilder, Web & Dokumente, Farben & Größen
- **Bildergalerie:** mehrere Bilder je Artikel und Farbe, Reihenfolge ändern, Hauptbild bestimmen, Beschriftung, von Datei, Webadresse oder ganzer Produktseite laden – Name, Beschreibung, Preis und Bilder einer Produktseite werden direkt übernommen
- **Marken-Demosortiment:** echte Artikel von Salomon, Atomic, LOWA, On, Mammut, Nike, Puma, McDavid, Spyder, Völkl, Fischer, Scarpa, Leki, Deuter, Smartwool, Falke, Odlo, Armada, POC, Dainese, Eisbär, Reusch, Hestra und Ortovox mit Beschreibung, Material und mehreren Bildern. Die Bilder werden im Hintergrund von den Markenseiten geladen (nicht mit Kontor ausgeliefert)
- **Digitales Schaufenster:** Bildergalerie je Farbe, Beschreibung, Merkmale und Material
- **Hauptmenü:** Bereiche als farbige Leisten mit Symbol – auf einen Blick unterscheidbar, auch bei eingeklappter Seitenleiste
- Artikelinfo zeigt alle Produktdaten und die Galerie

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
