# Kontor – UI-Preview

On-Premise-Warenwirtschaft und Kassensystem für Mode, Sport, Outdoor und Lifestyle („Kontor“ ist ein Arbeitstitel).
Diese Preview zeigt die UI-Richtung mit Testdaten, ohne Backend.

**Öffnen:** `ui-preview/index.html` direkt im Browser (aktuelles Chrome, Edge, Safari oder Firefox).
Eine Datei, keine Installation, keine externen Abhängigkeiten – läuft vollständig offline.

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
