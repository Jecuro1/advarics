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
cd src-tauri && cargo test   # Tests: Retoure, Storno, Punkte, Datenbank-Migration
```

Voraussetzungen zum Selberbauen: Node.js 22, Rust (stable), unter Windows zusätzlich die
„Microsoft C++ Build Tools“. Nur zum Benutzen ist nichts davon nötig – nur der Installer.

Stand 0.6.0:
- **Echt:** lokale Datenbank, Einstellungen, Anzeigegröße, Datensicherung mit Wiederherstellung, Protokoll;
  **Artikel** (anlegen/bearbeiten, Varianten aus Farben × Größen, automatische EAN, eigene Felder,
  Kassen-Pflichtfelder), **Bestand** (Matrix je Artikel, Zugang/Abgang/Inventur mit Grund, Bewegungsjournal),
  **Kasse** verkauft aus der Datenbank (Belegnummer, Beleg gespeichert, Bestand wird abgebucht), **Belegliste**
  mit Bonansicht (Kasse → Mehr → Belege).
- **Kunden:** anlegen (auch an der Kasse: F3 → Neu anlegen), eigene Felder, Vereinsrabatt, Newsletter-Einwilligung,
  **Bonuspunkte** (1 Punkt je 10 €, Verlauf, Korrektur mit Freigabe), Kaufhistorie.
- **Retoure / Umtausch und Storno:** Kasse → Mehr → Retoure, oder in der Belegliste. Erstattung bar oder per
  Rückbuchung, Bestand und Punkte werden zurückgebucht; Stornos und hohe Erstattungen nur mit Freigabe.
- **Dashboard** mit echten Zahlen: Umsatz, Bons, Ø Bon, Retourenquote, Verlauf mit Vorperiode, Topseller,
  Warengruppen, Kundenfrequenz, Bestandswarnungen; X-Bericht mit Tageszahlen.
- **Update-Dienst:** signierte Updates im Programm mit Freigabe, Zeitfenster und Sicherung vorher.
- **Noch Vorschau** (im Dashboard als „Vorschau“ markiert): KI-Hinweise, Erweiterungs-Widgets, weitere Filialen.
  RKSV-Signatur und Hardware (Drucker, Terminal) folgen.

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
