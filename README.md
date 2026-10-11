# Kontor – UI-Preview

On-Premise-Warenwirtschaft und Kassensystem für Mode, Sport, Outdoor und Lifestyle („Kontor“ ist ein Arbeitstitel).
Diese Preview zeigt die UI-Richtung mit Testdaten, ohne Backend.

## Lokal starten (On-Premise auf deinem Rechner, ohne Installation)

**Windows** (keine Installation, nutzt nur Bordmittel von Windows):
1. Projekt als ZIP herunterladen und entpacken.
2. `kontor-start.bat` doppelklicken → Browser öffnet `http://localhost:8080`.
3. Für Tablets/weitere Kassen im WLAN: `kontor-start-netzwerk.bat` (fragt nach Administratorrechten,
   legt eine Firewall-Regel „Kontor 8080“ nur für private Netzwerke an und zeigt die Netzwerk-Adresse an).

**macOS / Linux:** `kontor-start-mac.command` (benötigt `python3`).

Beenden: Server-Fenster schließen. Alternativ geht auch ein Doppelklick direkt auf `ui-preview/index.html`.

Hinweis: Aktuell ist das die UI-Preview mit Testdaten – jedes Gerät hat seinen eigenen Demo-Stand.
Der echte Server mit Datenbank folgt in den nächsten Schritten und wird über dieselben Startdateien laufen.

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
