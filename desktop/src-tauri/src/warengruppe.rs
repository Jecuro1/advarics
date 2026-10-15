//! Warengruppen (Stammdaten › Warengruppen › Warengruppen): eine Zeile je Warengruppe in der Stammdaten-Art „warengruppe“
//! (Schlüssel `adv-<Nr.>`, die Artikel verweisen über `articles.category` darauf).
//!
//!  · Die Prüfungen stehen hier und in der Maske gleich – das Backend entscheidet. Verweise (Abteilung, Schlüssel, Typen,
//!    Kategorien) müssen in ihrer Tabelle vorkommen; Tabellen, die noch keine Zeile haben, werden nicht geprüft.
//!  · Die Nr. ist der Schlüssel und lässt sich nach dem Anlegen nicht mehr ändern (Artikel und Importe verweisen darauf).
//!  · Löschen nur ohne Artikel; sonst die Gruppe in der Maske ausblenden (Inventur/Verkauf bleiben unberührt).
//!  · Gespeichert wird nur, was vom Standard abweicht – bei 11.848 Zeilen bleibt der Abgleich mit den Filialen klein.
//!  · Pflege nur in der Zentrale bzw. am Einzelplatz; Filialkassen bekommen die Zeilen beim Abgleich.

use crate::{db, verbund};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub const KIND: &str = "warengruppe";
/// Steuersätze, die Kasse und RKSV kennen (Normal, ermäßigt 1, ermäßigt 2, Null)
const SAETZE: [i64; 4] = [20, 13, 10, 0];

fn s(v: &Value) -> String {
    match v {
        Value::String(t) => t.trim().to_string(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

/// Nr. in der gespeicherten Form: nur Ziffern (1–6), ohne führende Nullen
pub fn nr_norm(x: &str) -> Option<String> {
    let t = x.trim();
    if t.is_empty() || t.len() > 6 || !t.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let u = t.trim_start_matches('0');
    Some(if u.is_empty() { "0".into() } else { u.into() })
}

/// Zeile der Tabelle `kind` mit dieser Kennung
fn zeile(c: &Connection, kind: &str, id: &str) -> Option<Value> {
    let d: String = c.query_row("SELECT data FROM stamm WHERE kind = ?1 AND id = ?2", params![kind, id], |r| r.get(0)).optional().ok().flatten()?;
    let mut v: Value = serde_json::from_str(&d).unwrap_or(json!({}));
    v["id"] = json!(id);
    Some(v)
}

fn hat_zeilen(c: &Connection, kind: &str) -> bool {
    c.query_row("SELECT 1 FROM stamm WHERE kind = ?1 LIMIT 1", [kind], |_| Ok(())).optional().ok().flatten().is_some()
}

/// Prüft einen Verweis: leer ist erlaubt (die Pflicht prüft der Aufrufer); sonst muss die Zeile da sein, sofern die Tabelle Zeilen hat.
/// Ein Verweis, der gegenüber der gespeicherten Zeile unverändert ist, bleibt gültig (Altbestand).
fn verweis(c: &Connection, kind: &str, id: &str, alt: Option<&str>, wo: &str) -> Result<(), String> {
    if id.is_empty() || alt == Some(id) || !hat_zeilen(c, kind) {
        return Ok(());
    }
    if zeile(c, kind, id).is_none() {
        return Err(format!("{wo}: diese Auswahl gibt es nicht (mehr) – bitte neu wählen"));
    }
    Ok(())
}

/// Auswahlfelder: (Feld, Tabelle, Beschriftung, Pflicht)
const VERWEISE: [(&str, &str, &str, bool); 9] = [
    ("altersbewertung", "altersschluessel", "Altersbewertung", true),
    ("praemienschluessel", "praemienschluessel", "Prämienschlüssel", true),
    ("groessenschluessel", "groessenschluessel", "Größen-Schlüssel", true),
    ("statgroessen", "statgroessenset", "Statistik-Größen-Set", false),
    ("mwsttyp", "mwsttyp", "MwSt.-Typ", true),
    ("preislage", "preislagenschluessel", "Preisl.-Schl.", true),
    ("etikett", "etikettentyp", "Etiketten-Typ", true),
    ("etikett2", "etikettentyp", "Etiketten-Typ2", false),
    ("hierarchie", "wghierarchie", "Warengruppenhierarchie", false),
];

fn zahl(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(t) => {
            let t = t.trim().replace(',', ".");
            if t.is_empty() { None } else { t.parse::<f64>().ok() }
        }
        _ => None,
    }
}

/// Eingabe prüfen und in die gespeicherte Form bringen. Unbekannte Schlüssel der Zeile (Import: `gruppe`, frühere Fassungen) bleiben erhalten.
pub fn pruefen(c: &Connection, row: &Value, alt: Option<&Value>) -> Result<Value, String> {
    // Nr.: neue Gruppen brauchen eine Zahl; Alt-Zeilen ohne Zahl (vom Artikelimport angelegt: Schlüssel adv-<Text>) bleiben mit ihrer bisherigen Nr. speicherbar
    let nr_in = s(&row["nr"]);
    let nr = match nr_norm(&nr_in) {
        Some(n) => n,
        None => {
            let alt_nr = alt.map(|a| s(&a["nr"])).filter(|x| !x.is_empty()).or_else(|| alt.map(|a| s(&a["id"]).trim_start_matches("adv-").to_string()));
            if !nr_in.is_empty() && nr_in.chars().count() <= 40 && alt_nr.as_deref() == Some(nr_in.as_str()) {
                nr_in.clone()
            } else {
                return Err("Nr.: eine ganze Zahl bis 999999 (nur Ziffern)".into());
            }
        }
    };
    let name = s(&row["name"]);
    if name.is_empty() {
        return Err("Name fehlt".into());
    }
    if name.chars().count() > 50 {
        return Err("Name: höchstens 50 Zeichen".into());
    }
    let altv = |k: &str| alt.map(|a| s(&a[k])).filter(|x| !x.is_empty());
    let mut o = alt.and_then(|a| a.as_object().cloned()).unwrap_or_default();
    o.retain(|k, _| !k.starts_with('_') && k != "id");
    for k in ["service", "rabattsperre", "intrastat_nr", "zolltarif", "intrastat_bez", "gewicht", "webkat1", "webkat2", "webkat3", "webkat4", "webkat5", "etikett2", "hierarchie", "statgroessen", "anz_etiketten", "mwst"] {
        o.remove(k);   // optionale Felder werden unten nur gesetzt, wenn sie vom Standard abweichen
    }
    o.insert("nr".into(), json!(nr));
    o.insert("name".into(), json!(name));

    // Hierarchie: nur die Abteilung wird gespeichert (die Ebenen darüber ergeben sich aus der Kette)
    let abt = s(&row["abteilung"]);
    if abt.is_empty() {
        if alt.is_none() || altv("abteilung").is_some() {
            return Err("Abteilung wählen".into());
        }
    } else if altv("abteilung").as_deref() != Some(abt.as_str()) && zeile(c, "abteilung", &abt).is_none() {
        return Err("Abteilung: diese Auswahl gibt es nicht (mehr) – bitte neu wählen".into());
    }
    o.insert("abteilung".into(), json!(abt));

    for (feld, kind, wo, pflicht) in VERWEISE {
        let v = s(&row[feld]);
        if v.is_empty() {
            if pflicht {
                return Err(format!("{wo} wählen"));
            }
            o.remove(feld);
            continue;
        }
        verweis(c, kind, &v, altv(feld).as_deref(), wo)?;
        o.insert(feld.into(), json!(v));
    }
    if s(&row["etikett2"]) == s(&row["etikett"]) && !s(&row["etikett2"]).is_empty() {
        o.remove("etikett2");   // gleicher Typ wie der Haupt-Typ: nichts zu ersetzen
    }

    // MwSt.: der Typ bestimmt den Satz (`ust` bleibt als Zahl für alle, die ihn lesen)
    let mw = zeile(c, "mwsttyp", &s(&row["mwsttyp"]));
    // Ohne verwertbaren Satz im Typ (Typ gelöscht oder ohne Satz) gilt der bisher gespeicherte Satz der Gruppe, nie stillschweigend 20 %
    let bisher = zahl(&row["ust"]).or_else(|| alt.and_then(|a| zahl(&a["ust"]))).unwrap_or(20.0);
    let satz = match &mw {
        Some(m) => zahl(&m["satz"]).unwrap_or(bisher),
        None => match s(&row["mwsttyp"]).as_str() {
            "E" => 10.0,
            "E13" => 13.0,
            "F" => 0.0,
            _ => bisher,
        },
    };
    if (satz - satz.round()).abs() > 1e-9 || !SAETZE.contains(&(satz.round() as i64)) {
        return Err(format!("MwSt.-Typ: der Satz {satz} % wird an der Kasse nicht unterstützt (erlaubt: 20, 13, 10, 0 %)"));
    }
    o.insert("ust".into(), json!(satz.round() as i64));

    // Spanne (Bruchteil des Netto-VK; die Maske zeigt Prozent)
    let sp = if row["spanne"].is_null() || s(&row["spanne"]).is_empty() { 0.0 } else { zahl(&row["spanne"]).ok_or("Vorschl.-Spanne/Kalk.: Zahl angeben")? };
    if !(0.0..1.0).contains(&sp) {
        return Err("Vorschl.-Spanne/Kalk.: zwischen 0 und unter 100 % (Handelsspanne vom Netto-Verkaufspreis)".into());
    }
    o.insert("spanne".into(), json!((sp * 1e6).round() / 1e6));

    o.insert("inventur".into(), json!(row["inventur"].as_bool().unwrap_or(true)));
    for k in ["service", "rabattsperre"] {
        if row[k].as_bool().unwrap_or(false) {
            o.insert(k.into(), json!(true));
        }
    }

    // Intrastat: Punkte, Bindestriche und Leerzeichen sind erlaubt und werden entfernt; ein unveränderter Altwert (früher „Zolltarifnr.“, frei getippt) bleibt speicherbar
    let roh = s(&row["intrastat_nr"]);
    let nrz: String = roh.chars().filter(|ch| !ch.is_whitespace() && *ch != '.' && *ch != '-').collect();
    if !nrz.is_empty() {
        let alt_nr = altv("intrastat_nr").or_else(|| altv("zolltarif"));
        let gueltig = nrz.chars().all(|ch| ch.is_ascii_digit()) && nrz.len() >= 4 && nrz.len() <= 10;
        if gueltig {
            o.insert("intrastat_nr".into(), json!(nrz));
        } else if alt_nr.as_deref() == Some(roh.as_str()) {
            o.insert("intrastat_nr".into(), json!(roh));
        } else {
            return Err("Intrastat-Waren-Nr.: 4 bis 10 Ziffern (Warennummer der Kombinierten Nomenklatur, z. B. 62011290)".into());
        }
    }
    let bez = s(&row["intrastat_bez"]);
    if bez.chars().count() > 120 {
        return Err("Intrastat-Waren-Bez.: höchstens 120 Zeichen".into());
    }
    if !bez.is_empty() {
        o.insert("intrastat_bez".into(), json!(bez));
    }
    if !(row["gewicht"].is_null() || s(&row["gewicht"]).is_empty()) {
        let g = zahl(&row["gewicht"]).ok_or("Durchschnitts Gewicht: Zahl angeben (kg)")?;
        if !(0.0..=10000.0).contains(&g) {
            return Err("Durchschnitts Gewicht: zwischen 0 und 10.000 kg".into());
        }
        if g > 0.0 {
            o.insert("gewicht".into(), json!((g * 1e6).round() / 1e6));
        }
    }

    // WebShop-Kategorien 1–5 (keine Kategorie doppelt)
    let mut gesehen = HashSet::new();
    for i in 1..=5 {
        let k = format!("webkat{i}");
        let v = s(&row[k.as_str()]);
        if v.is_empty() {
            continue;
        }
        if !gesehen.insert(v.clone()) {
            return Err(format!("WebShop-Kategorie {i}: diese Kategorie ist schon eingetragen"));
        }
        verweis(c, "webkategorie", &v, altv(&k).as_deref(), &format!("WebShop-Kategorie {i}"))?;
        o.insert(k, json!(v));
    }

    // Anzahl Etiketten (Standard 1; 0 = kein Etikett)
    if !(row["anz_etiketten"].is_null() || s(&row["anz_etiketten"]).is_empty()) {
        let n = zahl(&row["anz_etiketten"]).ok_or("Anz. Etiketten: ganze Zahl angeben")?;
        if n.fract() != 0.0 || !(0.0..=99.0).contains(&n) {
            return Err("Anz. Etiketten: ganze Zahl von 0 bis 99 (0 = keine automatischen Etiketten)".into());
        }
        if n as i64 != 1 {
            o.insert("anz_etiketten".into(), json!(n as i64));
        }
    }
    Ok(Value::Object(o))
}

/// Anzahl Artikel je Warengruppe (alle, aktive)
pub fn artikel_je_gruppe(c: &Connection) -> HashMap<String, (i64, i64)> {
    let mut m = HashMap::new();
    if let Ok(mut st) = c.prepare("SELECT category, COUNT(*), COALESCE(SUM(active), 0) FROM articles GROUP BY category") {
        if let Ok(rows) = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))) {
            for (k, n, a) in rows.flatten() {
                m.insert(k, (n, a));
            }
        }
    }
    m
}

/// Artikelzahlen für Liste und Maske: { id: [alle, aktiv] }
pub fn zaehler(c: &Connection) -> Value {
    let mut o = serde_json::Map::new();
    for (k, (n, a)) in artikel_je_gruppe(c) {
        o.insert(k, json!([n, a]));
    }
    Value::Object(o)
}

fn schreiben(c: &Connection, id: &str, r: &Value, aktiv: bool) -> Result<(), String> {
    let mut d = r.clone();
    if let Some(o) = d.as_object_mut() {
        o.retain(|k, _| !k.starts_with('_') && k != "id");
    }
    let pos: i64 = c
        .query_row("SELECT pos FROM stamm WHERE kind = ?1 AND id = ?2", params![KIND, id], |x| x.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| c.query_row("SELECT COALESCE(MAX(pos) + 1, 0) FROM stamm WHERE kind = ?1", [KIND], |x| x.get(0)).unwrap_or(0));
    c.execute(
        "INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, active = excluded.active, updated_at = excluded.updated_at",
        params![KIND, id, d.to_string(), pos, aktiv as i64, db::now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Nächste freie Nr. (größte vorhandene + 1)
pub fn naechste_nr(c: &Connection) -> i64 {
    c.query_row("SELECT COALESCE(MAX(CAST(json_extract(data, '$.nr') AS INTEGER)), 0) + 1 FROM stamm WHERE kind = ?1", [KIND], |r| r.get(0)).unwrap_or(1)
}

/// Speichern (neu oder ändern). `row.id` leer = neue Warengruppe. Rückgabe: die gespeicherte Zeile mit `id`.
pub fn save(c: &Connection, row: &Value, by: &str) -> Result<Value, String> {
    if verbund::rolle(c) == "filiale" {
        return Err("Warengruppen pflegt die Zentrale – diese Kasse bekommt die Angaben beim nächsten Abgleich".into());
    }
    let id_in = s(&row["id"]);
    let alt = if id_in.is_empty() { None } else { Some(zeile(c, KIND, &id_in).ok_or("Diese Warengruppe gibt es nicht mehr – bitte die Liste aktualisieren")?) };
    let mut r = pruefen(c, row, alt.as_ref())?;
    let nr = s(&r["nr"]);
    let id = match &alt {
        Some(a) => {
            let alt_nr = Some(s(&a["nr"])).filter(|x| !x.is_empty()).unwrap_or_else(|| s(&a["id"]).trim_start_matches("adv-").to_string());
            if nr_norm(&alt_nr).unwrap_or(alt_nr.clone()) != nr {
                return Err("Die Nr. lässt sich nach dem Anlegen nicht mehr ändern (Artikel und Importe verweisen darauf) – für eine andere Nr. die Warengruppe kopieren".into());
            }
            id_in.clone()
        }
        None => {
            let id = format!("adv-{nr}");
            if zeile(c, KIND, &id).is_some() {
                return Err(format!("Die Nr. {nr} gibt es schon"));
            }
            id
        }
    };
    let aktiv = row["_aktiv"].as_bool().unwrap_or(true);
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    schreiben(&tx, &id, &r, aktiv)?;
    db::audit_append(&tx, "warengruppe.saved", &json!({ "nr": nr, "name": s(&r["name"]), "neu": alt.is_none(), "aktiv": aktiv, "durch": by })).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    r["id"] = json!(id);
    r["_aktiv"] = json!(aktiv);
    Ok(r)
}

/// Löschen: nur ohne Artikel (auch inaktive). Rückgabe: { geloescht: Anzahl, nicht: [Gründe] } – was geht, wird gelöscht, der Rest mit Grund gemeldet.
pub fn delete(c: &Connection, ids: &[String], by: &str) -> Result<Value, String> {
    if verbund::rolle(c) == "filiale" {
        return Err("Warengruppen löscht die Zentrale".into());
    }
    let n = artikel_je_gruppe(c);
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    let (mut weg, mut grund) = (0usize, vec![]);
    for id in ids {
        let Some(r) = zeile(&tx, KIND, id.trim()) else { continue };
        let (alle, aktiv) = n.get(&s(&r["id"])).copied().unwrap_or((0, 0));
        if alle > 0 {
            grund.push(format!("„{}“ hat {alle} Artikel (davon {aktiv} aktiv)", s(&r["name"])));
            continue;
        }
        tx.execute("DELETE FROM stamm WHERE kind = ?1 AND id = ?2", params![KIND, s(&r["id"])]).map_err(|e| e.to_string())?;
        db::audit_append(&tx, "warengruppe.deleted", &json!({ "nr": s(&r["nr"]), "name": s(&r["name"]), "durch": by })).map_err(|e| e.to_string())?;
        weg += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({ "geloescht": weg, "nicht": grund }))
}

/// Standardzeilen, die die Warengruppen-Maske voraussetzt. Fehlt die Tabelle ganz, kommen alle Zeilen hinein, sonst nur die benötigten.
fn grundzeilen() -> Vec<(&'static str, Vec<Value>, Vec<&'static str>)> {
    vec![
        ("etikettentyp",
         vec![
             json!({ "id": "STD", "name": "Standard 50×30", "b": 50, "h": 30, "felder": ["Marke", "Name", "Farbe", "Größe", "Preis", "EAN"] }),
             json!({ "id": "SCHUH", "name": "Schuhkarton 70×40", "b": 70, "h": 40, "felder": ["Marke", "Name", "Größe", "Preis", "EAN"] }),
             json!({ "id": "K50X30", "name": "Klebe 50x30", "b": 50, "h": 30, "felder": ["Marke", "Name", "Farbe", "Größe", "Preis", "EAN"] }),
         ],
         vec!["K50X30"]),
        ("altersschluessel", vec![json!({ "id": "STANDARD", "name": "Standard" }), json!({ "id": "STATISTIK", "name": "Statistik" })], vec!["STANDARD", "STATISTIK"]),
        ("praemienschluessel", vec![json!({ "id": "STANDARD", "name": "Standard", "pct": 0 })], vec!["STANDARD"]),
        ("preislagenschluessel", vec![json!({ "id": "STANDARD", "name": "Standard" })], vec!["STANDARD"]),
        ("wghierarchie",
         vec![
             json!({ "id": "KEINE", "name": "Keine Hierarchie auf dem Etikett", "ebenen": [] }),
             json!({ "id": "ABTEILUNG", "name": "Abteilung", "ebenen": ["abteilung"] }),
             json!({ "id": "PFAD", "name": "Bereich › Haupt-Abteilung › Abteilung", "ebenen": ["bereich", "hauptabteilung", "abteilung"] }),
         ],
         vec![]),
    ]
}

/// Beim Start: die Tabellen anlegen bzw. ergänzen, auf die sich die Warengruppen beziehen
pub fn vorbereiten(c: &Connection) -> Result<(), String> {
    for (kind, alle, noetig) in grundzeilen() {
        let leer = !hat_zeilen(c, kind);
        let mut pos: i64 = c.query_row("SELECT COALESCE(MAX(pos) + 1, 0) FROM stamm WHERE kind = ?1", [kind], |r| r.get(0)).map_err(|e| e.to_string())?;
        for z in alle {
            let id = s(&z["id"]);
            if !(leer || noetig.contains(&id.as_str())) || zeile(c, kind, &id).is_some() {
                continue;
            }
            let mut d = z.clone();
            d.as_object_mut().map(|o| o.remove("id"));
            c.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES (?1,?2,?3,?4,1,?5)", params![kind, id, d.to_string(), pos, db::now()]).map_err(|e| e.to_string())?;
            pos += 1;
        }
    }
    Ok(())
}

/// Warengruppe zu einer Artikel-Kategorie (für Auswirkungen im Kern)
pub fn finden(c: &Connection, kategorie: &str) -> Option<Value> {
    zeile(c, KIND, kategorie)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        c
    }
    fn tabelle(c: &Connection, kind: &str, id: &str, d: Value) {
        c.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES (?1,?2,?3,0,1,'t')", params![kind, id, d.to_string()]).unwrap();
    }
    fn artikel(c: &Connection, id: &str, kat: &str) {
        c.execute("INSERT INTO articles(id, name, brand, category, glyph, price, vat, colors, sizes, fields, prompts, active, created_at, updated_at) VALUES (?1,'x','M',?2,'shirt',100,20,'[]','[]','{}','[]',1,'t','t')", params![id, kat]).unwrap();
    }
    /// Minimaler gültiger Entwurf (alle Pflichtauswahlen gesetzt)
    fn basis(c: &Connection) -> Value {
        vorbereiten(c).unwrap();
        tabelle(c, "abteilung", "adv-a1-0-1", json!({ "name": "Ehrenpreise", "parent": "adv-h1-0" }));
        tabelle(c, "groessenschluessel", "gs-1", json!({ "name": "ohne Gr.", "groessen": [] }));
        tabelle(c, "mwsttyp", "N", json!({ "name": "Normalsatz", "satz": 20 }));
        tabelle(c, "mwsttyp", "E", json!({ "name": "Ermäßigt", "satz": 10 }));
        tabelle(c, "mwsttyp", "X", json!({ "name": "Sonder", "satz": 19 }));
        json!({ "nr": "960100", "name": "Neue Gruppe", "abteilung": "adv-a1-0-1", "altersbewertung": "STATISTIK", "praemienschluessel": "STANDARD", "groessenschluessel": "gs-1", "mwsttyp": "N", "preislage": "STANDARD", "etikett": "K50X30", "inventur": true, "spanne": 0.5 })
    }

    #[test]
    fn nr_form() {
        assert_eq!(nr_norm("0007").unwrap(), "7");
        assert_eq!(nr_norm("0").unwrap(), "0");
        assert!(nr_norm("12a").is_none() && nr_norm("").is_none() && nr_norm("1234567").is_none());
    }

    #[test]
    fn anlegen_pflichtangaben_und_eindeutigkeit() {
        let c = db();
        let b = basis(&c);
        let r = save(&c, &b, "T").unwrap();
        assert_eq!(r["id"], "adv-960100");
        assert_eq!(r["ust"], 20);
        assert!(save(&c, &b, "T").unwrap_err().contains("gibt es schon"));
        for (k, wort) in [("name", "Name"), ("abteilung", "Abteilung"), ("altersbewertung", "Altersbewertung"), ("praemienschluessel", "Prämienschlüssel"), ("groessenschluessel", "Größen-Schlüssel"), ("mwsttyp", "MwSt.-Typ"), ("preislage", "Preisl.-Schl."), ("etikett", "Etiketten-Typ")] {
            let mut x = b.clone();
            x["nr"] = json!("960101");
            x[k] = json!("");
            let e = save(&c, &x, "T").unwrap_err();
            assert!(e.contains(wort), "{k}: {e}");
        }
        let mut x = b.clone();
        x["nr"] = json!("9x");
        assert!(save(&c, &x, "T").is_err());
    }

    #[test]
    fn nr_bleibt_und_unbekannte_felder_bleiben() {
        let c = db();
        let mut b = basis(&c);
        b["nr"] = json!("5");
        let r = save(&c, &b, "T").unwrap();
        // Import-Feld „gruppe“ bleibt beim Speichern erhalten
        c.execute("UPDATE stamm SET data = json_set(data, '$.gruppe', 'Ehren') WHERE kind = 'warengruppe' AND id = 'adv-5'", []).unwrap();
        let mut x = r.clone();
        x["name"] = json!("Anders");
        let r2 = save(&c, &x, "T").unwrap();
        assert_eq!(r2["gruppe"], "Ehren");
        assert_eq!(finden(&c, "adv-5").unwrap()["name"], "Anders");
        x["nr"] = json!("6");
        assert!(save(&c, &x, "T").unwrap_err().contains("nicht mehr ändern"));
        x["id"] = json!("adv-99");
        assert!(save(&c, &x, "T").unwrap_err().contains("nicht mehr"));
    }

    #[test]
    fn verweise_und_satz() {
        let c = db();
        let b = basis(&c);
        let mut x = b.clone();
        x["etikett"] = json!("GIBTS-NICHT");
        assert!(save(&c, &x, "T").unwrap_err().contains("Etiketten-Typ"));
        x = b.clone();
        x["mwsttyp"] = json!("X");
        assert!(save(&c, &x, "T").unwrap_err().contains("nicht unterstützt"));
        x = b.clone();
        x["mwsttyp"] = json!("E");
        assert_eq!(save(&c, &x, "T").unwrap()["ust"], 10);
        x = b.clone();
        x["nr"] = json!("7");
        x["abteilung"] = json!("adv-a9");
        assert!(save(&c, &x, "T").unwrap_err().contains("Abteilung"));
    }

    #[test]
    fn webkategorien_intrastat_spanne_standard_nicht_gespeichert() {
        let c = db();
        let b = basis(&c);
        tabelle(&c, "webkategorie", "W1", json!({ "name": "Ski", "sichtbar": true }));
        tabelle(&c, "webkategorie", "W2", json!({ "name": "Schuhe", "sichtbar": true }));
        let mut x = b.clone();
        x["webkat1"] = json!("W1");
        x["webkat2"] = json!("W1");
        assert!(save(&c, &x, "T").unwrap_err().contains("schon eingetragen"));
        x["webkat2"] = json!("W2");
        x["webkat3"] = json!("W9");
        assert!(save(&c, &x, "T").unwrap_err().contains("WebShop-Kategorie 3"));
        x["webkat3"] = json!("");
        x["intrastat_nr"] = json!("6201 1290");
        x["gewicht"] = json!("0,35");
        x["anz_etiketten"] = json!(2);
        x["spanne"] = json!(0.45);
        let r = save(&c, &x, "T").unwrap();
        assert_eq!((r["webkat1"].clone(), r["webkat2"].clone(), r["intrastat_nr"].clone(), r["gewicht"].clone(), r["anz_etiketten"].clone()), (json!("W1"), json!("W2"), json!("62011290"), json!(0.35), json!(2)));
        // Standardwerte werden nicht gespeichert
        let mut y = b.clone();
        y["nr"] = json!("8");
        y["anz_etiketten"] = json!(1);
        y["gewicht"] = json!(0);
        y["service"] = json!(false);
        let r = save(&c, &y, "T").unwrap();
        for k in ["anz_etiketten", "gewicht", "service", "rabattsperre", "webkat1", "intrastat_nr", "etikett2", "hierarchie"] {
            assert!(r.get(k).is_none(), "{k} sollte fehlen");
        }
        let mut z = b.clone();
        z["nr"] = json!("9");
        z["intrastat_nr"] = json!("12");
        assert!(save(&c, &z, "T").is_err());
        z["intrastat_nr"] = json!("");
        z["spanne"] = json!(1.2);
        assert!(save(&c, &z, "T").is_err());
        z["spanne"] = json!(0.5);
        z["anz_etiketten"] = json!(1.5);
        assert!(save(&c, &z, "T").is_err());
        z["anz_etiketten"] = json!(100);
        assert!(save(&c, &z, "T").is_err());
    }

    #[test]
    fn altbestand_bleibt_speicherbar() {
        let c = db();
        let b = basis(&c);
        // Zeile aus dem Advarics-Import: Klartexte statt Kennungen, keine Abteilung (NA)
        tabelle(&c, "warengruppe", "adv-77", json!({ "nr": "77", "name": "Alt", "abteilung": "", "ust": 20, "etikett": "Klebe 50x30", "altersbewertung": "Statistik", "inventur": true, "spanne": 0.5 }));
        let mut x = b.clone();
        x["id"] = json!("adv-77");
        x["nr"] = json!("77");
        x["name"] = json!("Alt (neu benannt)");
        x["abteilung"] = json!("");
        // Etikett/Altersbewertung wurden in der Maske auf Kennungen gesetzt → gespeichert
        let r = save(&c, &x, "T").unwrap();
        assert_eq!(r["etikett"], "K50X30");
        // ohne Abteilung bleibt es erlaubt, solange die Zeile keine hatte; eine bisher gesetzte darf nicht gelöscht werden
        let n = save(&c, &{ let mut y = b.clone(); y["nr"] = json!("78"); y }, "T").unwrap();
        let mut y = n.clone();
        y["abteilung"] = json!("");
        assert!(save(&c, &y, "T").unwrap_err().contains("Abteilung"));
    }

    #[test]
    fn alt_zeilen_vom_artikelimport_ohne_nr_mit_freiem_zolltarif_und_ohne_typ_satz_bleiben_speicherbar() {
        let c = db();
        let b = basis(&c);
        tabelle(&c, "mwsttyp", "LEER", json!({ "name": "Typ ohne Satz" }));
        // vom Artikelimport angelegt: Schlüssel mit Text, keine Nr., Satz nur als ust, Zolltarif frei getippt
        tabelle(&c, "warengruppe", "adv-skijacken", json!({ "name": "Skijacken", "ust": 10, "zolltarif": "6201 xx", "gruppe": "Ski" }));
        let mut x = b.clone();
        x["id"] = json!("adv-skijacken");
        x["nr"] = json!("skijacken");
        x["name"] = json!("Skijacken neu");
        x["mwsttyp"] = json!("LEER");
        x["intrastat_nr"] = json!("6201 xx");
        let r = save(&c, &x, "T").unwrap();
        assert_eq!((r["nr"].clone(), r["intrastat_nr"].clone(), r["ust"].clone()), (json!("skijacken"), json!("6201 xx"), json!(10)), "bisheriger Satz bleibt, nicht still 20 %");
        assert!(r.get("zolltarif").is_none(), "die Maske führt nur noch intrastat_nr");
        assert_eq!(r["gruppe"], "Ski");
        // eine andere Nr. oder eine neue ungültige Warennummer wird abgelehnt
        let mut y = x.clone();
        y["nr"] = json!("77");
        assert!(save(&c, &y, "T").unwrap_err().contains("nicht mehr ändern"));
        let mut z = x.clone();
        z["intrastat_nr"] = json!("abc");
        assert!(save(&c, &z, "T").is_err());
        // Punkte und Bindestriche sind erlaubt, Leeren wirkt wirklich
        let mut w = x.clone();
        w["intrastat_nr"] = json!("6201.12-90");
        assert_eq!(save(&c, &w, "T").unwrap()["intrastat_nr"], "62011290");
        w["intrastat_nr"] = json!("");
        assert!(save(&c, &w, "T").unwrap().get("intrastat_nr").is_none());
        // neue Gruppen brauchen eine Zahl
        let mut n = b.clone();
        n["nr"] = json!("abc");
        assert!(save(&c, &n, "T").is_err());
    }

    #[test]
    fn loeschen_nur_ohne_artikel_und_filiale_gesperrt() {
        let c = db();
        let b = basis(&c);
        let a = save(&c, &b, "T").unwrap();
        let mut x = b.clone();
        x["nr"] = json!("2");
        let z = save(&c, &x, "T").unwrap();
        artikel(&c, "A1", &s(&a["id"]));
        let r = delete(&c, &[s(&a["id"])], "T").unwrap();
        assert_eq!(r["geloescht"], json!(0));
        assert!(r["nicht"][0].as_str().unwrap().contains("1 Artikel"), "{r}");
        assert!(finden(&c, &s(&a["id"])).is_some());
        // teilweise: eine löschbare, eine mit Artikeln → die eine wird gelöscht, die andere gemeldet
        let r = delete(&c, &[s(&a["id"]), s(&z["id"])], "T").unwrap();
        assert_eq!((r["geloescht"].clone(), r["nicht"].as_array().unwrap().len()), (json!(1), 1));
        let z = save(&c, &{ let mut x = b.clone(); x["nr"] = json!("3"); x }, "T").unwrap();
        assert_eq!(delete(&c, &[s(&z["id"])], "T").unwrap()["geloescht"], json!(1));
        assert!(finden(&c, &s(&z["id"])).is_none());
        let z = zaehler(&c);
        assert_eq!(z["adv-960100"], json!([1, 1]));
        db::setting_set(&c, "verbund.rolle", &json!("filiale")).unwrap();
        assert!(save(&c, &b, "T").is_err());
        assert!(delete(&c, &["adv-960100".into()], "T").is_err());
    }

    #[test]
    fn vorbereiten_ist_wiederholbar_und_schont_vorhandenes() {
        let c = db();
        tabelle(&c, "etikettentyp", "EIGEN", json!({ "name": "Eigen", "b": 40, "h": 20 }));
        vorbereiten(&c).unwrap();
        vorbereiten(&c).unwrap();
        // Tabelle mit eigenen Zeilen: nur die benötigte Zeile kommt dazu
        assert!(zeile(&c, "etikettentyp", "K50X30").is_some() && zeile(&c, "etikettentyp", "STD").is_none());
        // fehlende Tabelle: alle Zeilen
        assert!(zeile(&c, "altersschluessel", "STANDARD").is_some() && zeile(&c, "altersschluessel", "STATISTIK").is_some());
        assert_eq!(naechste_nr(&c), 1);
    }
}
