# Kontor

On-Premise-Warenwirtschaft und Kassensystem für Mode, Sport, Outdoor und Lifestyle („Kontor“ ist ein Arbeitstitel).
Desktop-Programm für Windows (Tauri). Aktuell: Programm-Hülle mit UI-Vorschau und Testdaten.

## Kontor als Windows-Programm installieren

Kontor ist ein installiertes Programm (kein Browser, kein Web-Server, läuft ohne Internet).

1. Auf GitHub **Actions** → Workflow **„Desktop · Windows-Installer“** → letzten erfolgreichen Lauf öffnen.
2. Unten unter **Artifacts** `Kontor-Windows-Installer` herunterladen und entpacken.
3. `Kontor_0.2.0_x64-setup.exe` doppelklicken → Kontor erscheint im Startmenü und öffnet sich maximiert.
   (Alternativ für Firmen-Verteilung: die `.msi`-Datei.)

Hinweise:
- Der Installer ist noch nicht code-signiert → Windows SmartScreen zeigt „Computer wurde geschützt“:
  „Weitere Informationen“ → „Trotzdem ausführen“.
- `F11` schaltet Vollbild/Kassen-Kiosk um. Es kann nur eine Kontor-Instanz gleichzeitig laufen.

### Entwickeln

```bash
cd desktop
npm install
npm run dev      # startet Kontor als Programm-Fenster
npm run build    # baut den Installer lokal (unter Windows)
```

Voraussetzungen zum Selberbauen: Node.js 22, Rust (stable), unter Windows zusätzlich die
„Microsoft C++ Build Tools“. Nur zum Benutzen ist nichts davon nötig – nur der Installer.

Aktueller Stand: Programm-Hülle mit der UI-Vorschau und Testdaten. Lokale Datenbank, echte Belege,
RKSV-Signatur und Hardware-Anbindung folgen als nächste Schritte.

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
