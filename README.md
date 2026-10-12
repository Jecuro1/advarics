# Kontor

On-Premise-Warenwirtschaft und Kassensystem für Mode, Sport, Outdoor und Lifestyle („Kontor“ ist ein Arbeitstitel).
Desktop-Programm für Windows (Tauri). Aktuell: Programm-Hülle mit UI-Vorschau und Testdaten.

## Kontor installieren und aktualisieren

**Erstinstallation:** neuesten Release unter https://github.com/Jecuro1/advarics/releases öffnen und
`Kontor_x.y.z_x64-setup.exe` ausführen (SmartScreen: „Weitere Informationen“ → „Trotzdem ausführen“).

**Updates:** direkt im Programm. Kontor sucht beim Start und alle 6 Stunden nach neuen Versionen
(Einstellungen → Updates). Installiert wird nur nach Freigabe mit PIN – sofort, um 20:00 oder beim
nächsten Start. Vorher wird automatisch gesichert. Updates sind signiert; manipulierte Pakete werden abgelehnt.

**Neue Version veröffentlichen (Entwicklung):** Version in `desktop/src-tauri/tauri.conf.json`,
`desktop/src-tauri/Cargo.toml`, `desktop/package.json` und `desktop/ui/src/c1-core.js` (appVersion) erhöhen,
`desktop/RELEASE_NOTES.md` anpassen (erscheint im Programm unter „Was ist neu“),
pushen. GitHub Actions baut, signiert und veröffentlicht. Benötigte Repository-Secrets:
`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

`F11` schaltet Vollbild/Kassen-Kiosk um. Es kann nur eine Kontor-Instanz gleichzeitig laufen.

### Entwickeln

```bash
desktop/ui/build.sh   # baut die Oberfläche aus desktop/ui/src nach ui-preview/index.html
cd desktop
npm install
npm run dev      # startet Kontor als Programm-Fenster
npm run build    # baut den Installer lokal (unter Windows)
cd src-tauri && cargo test   # Tests: Retoure, Storno, Punkte, Gutscheine, RKSV, PIN/2FA, Abschluss, Einkauf, Drucker, API, Webshop, Webhooks, ZVT, Stammdaten, Flexanalyse, EDI-Ordner, Migration
```

Voraussetzungen zum Selberbauen: Node.js 22, Rust (stable), unter Windows zusätzlich die
„Microsoft C++ Build Tools“. Nur zum Benutzen ist nichts davon nötig – nur der Installer.

Stand 0.10.0 – alles mit lokaler Datenbank, ohne Server:
- **Anmeldung & Rechte:** persönliche PIN (Erst-PINs Lena 1111 · David 2222 (Admin) · Miriam 3333 – sofort ändern),
  optional Zwei-Faktor mit Authenticator-App (TOTP), Rollen Kasse/Verkauf/Filialleitung/Administrator mit anpassbarer
  Rechte-Matrix, Freigaben per PIN durch berechtigte Personen, Sperre nach Fehlversuchen.
- **Kasse:** Verkauf aus der Datenbank, Kunden & Bonuspunkte, Rabatte mit Freigabe, Retoure/Umtausch/Storno,
  Gutscheine mit echtem Code und Restwert, Kassenbuch, X-Bericht, Tagesabschluss mit Kassensturz (Z-Bericht).
- **RKSV (Testmodus):** Startbeleg, Signaturkette, AES-verschlüsselter Umsatzzähler, ES256-Signatur, QR-Code,
  Null-/Monats-/Jahresbelege, DEP-Export. Software-Schlüssel statt Signaturkarte – technisch vollständig, aber nicht
  bei FinanzOnline registrierbar. Für den Echtbetrieb wird nur die Signaturquelle getauscht.
- **Hardware:** Bondrucker (ESC/POS) per Netzwerk oder Windows-Drucker, Kassenlade am Drucker, Kartenterminal über
  ZVT (Netzwerk) oder ohne Anbindung mit Bestätigung.
- **Sortiment & Einkauf:** Artikel mit Varianten, Bildern, EK-Preis/Spanne, Lieferant, Mindestbestand; Bestand mit
  Journal; geführte Inventur; Preisaktionen mit Zeitraum; Etiketten (EAN-13, A4 oder ZPL); Lieferanten, Bestellungen,
  Bestellvorschlag, Wareneingang.
- **Belege & Dokumente:** Bon-Designer mit Logo, Rechnung/Lieferschein/Bestellung A4, Versand per E-Mail (eigener SMTP).
- **Auswertung & KI (lokal):** Dashboard mit echten Zahlen, Berichte mit CSV-Export, Absatzprognose, Nachbestellvorschlag
  mit Begründung, Auffälligkeiten (Retouren, Stornos, Inventur, Preis < EK, Ladenhüter), Fragen in normaler Sprache;
  optional lokales Sprachmodell (Ollama) für freie Fragen und Artikeltexte.
- **Buchhaltung:** Buchungsjournal (CSV) und DATEV-Export (EXTF Buchungsstapel), Konten einstellbar.
- **Oberfläche:** helles Standard-Design, Menü mit aufklappbaren Bereichen und eigenen Seiten für Belege, Kassenbuch,
  Gutscheine, Lieferanten, Wareneingang, Etiketten, Buchhaltung, KI-Analyse, Benutzer & Rechte, Protokoll, Hilfe.
- **Import:** Artikel, Kunden und Bestände aus CSV/Excel mit Spaltenzuordnung, Vorschau und Prüfung.
- **Kundendisplay** auf zweitem Bildschirm · **Handy-App** im Browser (`http://<PC>:8787/mobil`) für Lager und Inventur.
- **Anpassen:** eigene Felder mit Typ/Pflicht/Auswahl (Artikel, Kunden, Lieferanten), eigene Objekte mit Menüpunkt
  (z. B. Reparaturaufträge), Regeln (Wenn → Dann), Skripte in einer Sandbox, Webhooks (HMAC-signiert, mit Wiederholung),
  lokale REST-API mit Schlüsseln und eigenen Endpunkten (OpenAPI unter `/api/v1/openapi.json`), Export/Import als Paket.
- **Betrieb:** Datensicherung (optional AES-256-verschlüsselt, inkl. Bilder) mit Prüfung und Wiederherstellung,
  signierte Updates im Programm (Kanal Stable oder Beta), Protokoll.
- **Filialverbund:** Zentrale + Filialen (Verbindung per Code über den eingebauten Server, Port 8787), Abgleich alle
  30 s, Bestand je Filiale, Umlagerungen (angefordert → versendet → empfangen) mit KI-Vorschlägen, jede Kasse offline-fähig.
- **Anmeldung:** PIN, Passwort (+ Zwei-Faktor), Handy-QR, Windows Hello, Single Sign-On per OpenID Connect
  (Entra ID, Google, Keycloak); Rechte je Rolle mit PIN-Freigabe.
- **Erweiterungen** (`kontor.erweiterung/v1`) mit Galerie, eigene Dashboard-Widgets per Abfrage, einstellbare
  Zahlungsarten inkl. PayPal.me- und SEPA-QR, eigene Design-Vorlagen.
- **Warenwirtschaft (0.12):** Order inkl. Import, Typen und Vorschlags-Konfiguration; Wareneingang mit Avis, Scanner und
  Änderungsprotokoll; Eingangsrechnungen mit Rechnungsprüfung, Zahlungen und SEPA-Datei; Retourenmanagement mit
  Reklamationen und Lieferantenretouren; Wareneingangs-Verteilung; Lieferantenbonus; Faktura (Angebot bis Mahnung);
  Reservierungen, Auswahlen, Warenkörbe, Bon-Zuordnung; Rabattaktionssteuerung, Kampagnen, Sales-Aktionen.
- **0.13:** Akkordeon-Menü; Artikelinfo (Plus/Kompakt), Bestandsinfo, Umbuchungs-Log; Umlagerungen (Pool, Planung, Anforderung,
  Filial-Rechnung …); Bestandskorrektur, NOS-Sortimente, Picklisten; geplante Preisänderungen; Nachsortierung; EAN/GTIN-Zuordnung,
  Artikelsortierung, Master-Artikel; Gutscheine mit PIN, Löschen, Protokolle, Fremdgutscheine; Kunden-Bestellungen,
  Fremdrechnungen, Mahnwesen.
- **0.14:** Menübereiche Kunden, Versand, Analyse, EDI, Webshop, Inventur, Stammdaten, Einstellungen, Service; über 60
  Stammdaten-Tabellen (CSV); Kundenerfassung, Bonus-Staffel, Hotels; WhatsApp/SMS; Versand-Etiketten; Verleih; Flexanalyse
  mit Vorlagen und Zeitsteuerung; EDIFACT (PRICAT, DESADV, INVOIC, ORDRSP ein – ORDERS, SLSRPT, INVRPT aus); Webshop-
  Bestellungen per REST-API; Inventur-Erfassungspool; Zeiterfassung; Prozesskonfiguration, Nummernkreise, EK-Verschlüsselung.
- **0.15:** FEDAS-Sync über den OUTTRA Data & Image Hub (täglich automatisch, Datei-Import), komplett neue Artikelmaske mit Reitern und Bildergalerie, Marken-Demosortiment mit Originaldaten, farbige Hauptmenüs.
- **Digitales Schaufenster** unter `/shop` am eingebauten Server (Click & Reserve).
- **Noch offen:** echte RKSV-Signaturkarte bzw. A-Trust, TSE (Deutschland), App-Store-App, FIDO2-Schlüssel,
  Active-Directory/SAML-Anmeldung.

Datenbank: `%APPDATA%\at.kontor.desktop\kontor.db` · Sicherungen standardmäßig: `Dokumente\Kontor-Sicherungen`.
Updates per neuem Installer behalten Datenbank und Einstellungen.

## Iteration 2 – Inhalt

- **Kasse:** Artikelkacheln mit Bestand, Varianten-Matrix (Größe × Farbe, Bestand je Filiale), Scan/EAN, Schnellwahl,
  Kunde mit eigenen Feldern, Rabatt mit Step-up-Freigabe, Parken, Teilzahlungen über 8 Zahlungsarten,
  RKSV-Signatur und Bon in drei Vorlagen, Offline-Modus mit Warteschlange, Sperrbildschirm (PIN, Windows Hello, FIDO2, SSO).
- **Dashboard:** Widgets per Drag & Drop anordnen, Größe ändern, entfernen, Bibliothek inkl. Erweiterungs-Widgets,
  Vorlagen je Rolle, Layout als JSON, Fragen an die lokale KI.
- **Designsystem:** Tokens, Vorlagen (Hell/Dunkel, Akzent, Dichte, Ecken, Bewegung), Komponenten.
- **Architektur sichtbar gemacht:** Ereignis-Inspektor (Hooks, Webhooks), Kassenablauf als Konfiguration,
  Update-Freigabe mit Kanal und Zeitfenster, Backup als Werkzeug in Kundenverantwortung.

## Tastatur

`Strg/⌘ K` Befehlspalette · `/` Suche · `G` dann `D`/`K`/`S` Navigation · `?` alle Kürzel
Kasse: `F2` Suche · `F3` Kunde · `F4` Rabatt · `F8` Parken · `F9` Bezahlen · `F10` Sperren · `1–8` Zahlart

Statusleiste unten: Klick auf den Serverstatus simuliert den Offline-Modus, „Ereignisse“ öffnet den Hook-Inspektor.
In der Vorschau gilt jede 4-stellige PIN außer `0000`.
