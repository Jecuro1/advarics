/* ═════════════════════════════════════════════════════════════════
   56 · MENÜPUNKTE UND RECHTE
   Wer ein Recht nicht hat – weder über seine Rolle noch über seine Benutzergruppe – sieht die zugehörigen Menüpunkte nicht
   (auch nicht in der Menüsuche, unter „Zuletzt benutzt“ und in der Befehlspalette). Direkt aufgerufen verlangt die Seite eine Freigabe per PIN.
   Die Zuordnung steht je Seite in VIEW_PERM; hier werden die Lücken geschlossen (nur wo noch nichts festgelegt ist)
   und die System-Seiten dem Recht „system“ zugeordnet. Seiten ohne Eintrag sind für alle da (Dashboard, Artikelsuche, Zeiterfassung, Hilfe …).
   ═════════════════════════════════════════════════════════════════ */
{
  const L = (perm, ids) => ids.split(/\s+/).filter(Boolean).forEach(id => { if (!VIEW_PERM[id]) VIEW_PERM[id] = perm; });   // nur Lücken füllen
  const F = (perm, ids) => ids.split(/\s+/).filter(Boolean).forEach(id => { VIEW_PERM[id] = perm; });                         // festlegen (überschreibt)
  // Verkauf
  L('kasse.verkaufen', 'kasse warenkorb-neu warenkoerbe belege reservierungen reservierung-neu auswahl-neu auswahl auswahl-summen gutscheine gutscheine-extern');
  L('kasse.kassenbuch', 'gutschein-buchungen gutschein-protokoll gutscheine-geloescht');
  L('berichte', 'bon-verkaeufer-protokoll');
  L('faktura', 'rechnungen angebote-auftraege lieferscheine kundenbestellungen fremdrechnungen offene-posten mahnwesen versand-etiketten webshop-bestellungen');
  // Artikel und Bestand
  L('bestand.buchen', 'umlagerungen ul-neu ul-protokoll ul-positionen ul-planung ul-anforderung ul-rechnung ul-ungebucht ul-kompakt picklisten umbuchungslog bestandskorrektur');
  L('artikel.bearbeiten', 'nos import-protokoll artikel-import master-artikel advarics-import ean-zuordnung artikelsortierung');
  L('preise.aktionen', 'preis-uebersicht');
  // Seiten, auf denen man nur bearbeitet oder bucht: ohne das Recht wäre bei jedem Schritt eine PIN-Freigabe nötig (zum Nachschlagen gibt es Artikelinfo und Bestandsinfo)
  L('artikel.bearbeiten', 'artikel artikel-edit');
  L('bestand.buchen', 'bestand');
  // Einkauf
  L('einkauf', 'einkauf order-import order-typen order-vorschlag order-konfig avis wareneingang we-scanner we-protokoll reklamationen reklamation-neu lretouren retouren-protokoll rueckgabegruende verteilung-konfig disposition lieferanten nachsortierung nachsort-nos nachsort-liste nachsort-param');
  L('einkauf', 'edi-nachrichten edi-fehler edi-konflikte edi-katalogartikel edi-katalog edi-ordrsp edi-invoic edi-desadv edi-verkaufsberichte edi-naechster-export edi-bestellungen edi-bestandsmeldungen edi-marktdaten edi-artikelimport edi-importprotokoll');
  L('rechnungen', 'er zahlungen lieferantenbonus');
  // Auswertung
  L('berichte', 'an-filialbestand an-nos-filialen an-artikelbericht an-intrastat an-groessen an-preislagen an-artikelliste an-rabatte flaechenproduktivitaet altersbewertung analyse-einstellungen powerbi berichte ki buchhaltung filialumsatz');
  // Kunden
  L('kunden.bearbeiten', 'kunden kundenerfassung bon-kunden bon-kunden-protokoll kunden-kommunikation');
  // Einstellungen, Stammdaten und System
  L('anpassen', 'anpassen erweiterungen');
  F('system', 'set-benutzer set-sso set-sicherung set-updates set-system set-rksv api-protokoll st-zugangsprofil protokoll datensicherung');
  F('system', 'benutzer benutzer-edit rollen st-benutzergruppe benutzergruppe-edit');
  // Seiten, deren Hauptfunktion immer die Freigabe eines Administrators verlangt (Filialverbund, Filialen anlegen, Handy-Zugang)
  F('system', 'set-verbund filialen');
  F('anpassen', 'set-handy');
}

Hooks.on('auth.login', () => permNav());   // auch in der Browser-Vorschau: nach dem Wechsel der Person Menü und Schaltflächen neu bewerten
if (window.KONTOR_UI) window.KONTOR_UI.viewPerm = () => ({...VIEW_PERM});   // nur lesend – für Prüfungen: welches Recht eine Seite verlangt

/* Befehlspalette (Strg+K): Befehle, für die das Recht fehlt oder deren Seite gesperrt ist, erscheinen nicht */
const CMD_PERM = {
  'Berichte': 'berichte', 'Berichte & Abschlüsse': 'berichte', 'Anpassen': 'anpassen', 'Einstellungen': 'einstellungen',
  'Kassenbuch (Einlage/Entnahme)': 'kasse.kassenbuch', 'Tagesabschluss (Z-Bericht)': 'kasse.kassenbuch',
  'Neue Bestellung': 'einkauf', 'Bestellvorschlag': 'einkauf', 'Inventur': 'bestand.buchen', 'Bestand buchen': 'bestand.buchen',
  'Preisaktion anlegen': 'preise.aktionen', 'Retoure / Umtausch': 'kasse.retoure', 'Neuer Kunde': 'kunden.bearbeiten', 'Neuer Artikel': 'artikel.bearbeiten',
  'Bezahlen': 'kasse.verkaufen', 'Gutschein verkaufen': 'kasse.verkaufen', 'Neuer Verkauf': 'kasse.verkaufen',
  'Nach Updates suchen': 'system', 'Update 1.8.0 prüfen & freigeben': 'system', 'Backup jetzt erstellen': 'system', 'RKSV: DEP-Export erstellen': 'system',
  'Ereignis-Inspektor (Hooks & Webhooks)': 'system', 'Kassenablauf bearbeiten': 'einstellungen'
};
const CMD_VIEW = {'Dashboard': 'dashboard', 'Kasse': 'kasse', 'Artikel': 'artikel', 'Bestand': 'bestand', 'Kunden': 'kunden', 'Berichte': 'berichte', 'Anpassen': 'anpassen', 'Einstellungen': 'einstellungen', 'Inventur': 'inventur'};
{
  const _cl = cmdList;
  cmdList = function () {
    return _cl.apply(this, arguments).filter(c => {
      const p = CMD_PERM[c.label], v = c.view || (c.group === 'Navigation' || c.label === 'Inventur' ? CMD_VIEW[c.label] : null);
      return (!p || can(p)) && !(v && (viewBlocked(v) || (VIEW_PERM[v] && !can(VIEW_PERM[v]))));
    });
  };
}
