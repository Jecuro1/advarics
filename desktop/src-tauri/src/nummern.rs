//! Nummernkreise je Filiale (Stammdaten › Filialen › Nummernkreise): Start- und End-Nr. für Order, Rechnung, Lieferschein,
//! Angebot, Auftrag und Lieferantenretoure. Die Bereiche stehen in der Filial-Zeile (Feld „nummern“); die Vergabe läuft hier
//! zentral, damit sich Filialen mit eigener Datenbank (auch offline) nie dieselben Nummern geben:
//!  · Zähler = max(Zählerstand, Start − 1) + 1 – der Zähler wird nie gesenkt (Nummern bleiben eindeutig)
//!  · liegt die nächste Nummer über dem Ende, wird nicht vergeben („Nummernkreis erschöpft“) – die Transaktion rollt zurück, es entsteht keine Lücke
//!  · ohne Bereich zählt der Zähler wie bisher unbegrenzt
//! Kassenbons, Retouren/Stornos am Bon und Gutscheine sind ausgenommen (Bon-Nr. = RKSV-Kette, Gutschein-Code = Zufallswert).

use crate::{stamm, verbund};
use rusqlite::Connection;
use serde_json::{json, Value};

/// (Art, Anzeigename, Zählername in der Tabelle „counters“)
pub const ARTEN: [(&str, &str, &str); 6] = [
    ("order", "Order", "bestellung"),
    ("rechnung", "Rechnung", "doc.rechnung"),
    ("lieferschein", "Lieferschein", "doc.lieferschein"),
    ("angebot", "Angebot", "doc.angebot"),
    ("auftrag", "Auftrag", "doc.auftrag"),
    ("lretoure", "Lieferanten-Retoure", "doc.lretoure"),
];

/// Nummernkreis-Art zu einer Vorgangsart („rechnung“ …); None = kein begrenzbarer Kreis
pub fn art_zu_vorgang(kind: &str) -> Option<&'static str> {
    ARTEN.iter().find(|a| a.0 == kind && a.0 != "order").map(|a| a.0)
}

fn zaehler(art: &str) -> Option<(&'static str, &'static str)> {
    ARTEN.iter().find(|a| a.0 == art).map(|a| (a.1, a.2))
}

/// (Start, Ende) der eigenen Filiale für diese Art; 0 = nicht gesetzt
pub fn bereich(c: &Connection, art: &str) -> (i64, i64) {
    let own = verbund::own_store(c);
    let Ok(rows) = stamm::list(c, "filiale") else { return (0, 0) };
    let Some(r) = rows.iter().find(|r| r["id"].as_str().map(|i| i.eq_ignore_ascii_case(&own)).unwrap_or(false)) else { return (0, 0) };
    let b = &r["nummern"][art];
    (b["start"].as_i64().unwrap_or(0).max(0), b["ende"].as_i64().unwrap_or(0).max(0))
}

/// Nächste Nummer der Art vergeben (innerhalb der Transaktion des Aufrufers)
pub fn naechste(c: &Connection, art: &str) -> Result<i64, String> {
    let (label, name) = zaehler(art).ok_or_else(|| format!("Unbekannter Nummernkreis „{art}“"))?;
    let (start, ende) = bereich(c, art);
    c.execute("INSERT OR IGNORE INTO counters(name, value) VALUES (?1, 0)", [name]).map_err(|e| e.to_string())?;
    let cur: i64 = c.query_row("SELECT value FROM counters WHERE name = ?1", [name], |r| r.get(0)).map_err(|e| e.to_string())?;
    let n = cur.max(start - 1) + 1;
    if ende > 0 && n > ende {
        return Err(format!("Nummernkreis {label} erschöpft (Ende {ende}). Bitte unter Stammdaten › Filialen › Nummernkreise einen neuen Bereich eintragen."));
    }
    c.execute("UPDATE counters SET value = ?2 WHERE name = ?1", rusqlite::params![name, n]).map_err(|e| e.to_string())?;
    Ok(n)
}

/// Stand der eigenen Kreise für die Maske: je Art nächste Nummer, Start, Ende, Rest (None = unbegrenzt) – dazu die nächste Bon-Nr.
pub fn stand(c: &Connection) -> Value {
    let wert = |name: &str| c.query_row("SELECT value FROM counters WHERE name = ?1", [name], |r| r.get::<_, i64>(0)).unwrap_or(0);
    let mut o = serde_json::Map::new();
    for (art, _, name) in ARTEN {
        let (start, ende) = bereich(c, art);
        let n = wert(name).max(start - 1) + 1;
        o.insert(art.into(), json!({ "naechste": n, "start": start, "ende": ende, "rest": if ende > 0 { json!((ende - n + 1).max(0)) } else { Value::Null } }));
    }
    json!({ "kreise": o, "bon": wert("beleg") + 1 })
}

/// Bereiche prüfen (Eingabe, wie sie in der Zeile steht) und in die gespeicherte Form bringen: { art: {start, ende} } nur für gesetzte Bereiche
pub fn pruefen(v: &Value) -> Result<Value, String> {
    let mut o = serde_json::Map::new();
    for (art, label, _) in ARTEN {
        let b = &v[art];
        let zahl = |k: &str| -> Result<i64, String> {
            match &b[k] {
                Value::Null => Ok(0),
                Value::String(t) if t.trim().is_empty() => Ok(0),
                x => x.as_i64().or_else(|| x.as_str().and_then(|t| t.trim().parse().ok())).filter(|n| (0..=999_999_999).contains(n)).ok_or_else(|| format!("Nummernkreis {label}: Start-/End-Nr. als ganze Zahl")),
            }
        };
        let (start, ende) = (zahl("start")?, zahl("ende")?);
        if start == 0 && ende == 0 {
            continue;
        }
        if start == 0 {
            return Err(format!("Nummernkreis {label}: Start-Nr. fehlt"));
        }
        if ende > 0 && ende < start {
            return Err(format!("Nummernkreis {label}: End-Nr. liegt vor der Start-Nr."));
        }
        o.insert(art.into(), json!({ "start": start, "ende": ende }));
    }
    Ok(Value::Object(o))
}

/// Überschneiden sich zwei Bereiche? Ende 0 = nach oben offen.
fn ueberschneiden(a: (i64, i64), b: (i64, i64)) -> bool {
    let (ea, eb) = (if a.1 == 0 { i64::MAX } else { a.1 }, if b.1 == 0 { i64::MAX } else { b.1 });
    a.0 <= eb && b.0 <= ea
}

/// Prüft die Bereiche einer Filiale gegen die aller anderen Filialen; Err nennt Art und Filiale
pub fn auf_ueberschneidung(neu: &Value, id: &str, andere: &[Value]) -> Result<(), String> {
    for (art, label, _) in ARTEN {
        let (Some(s), e) = (neu[art]["start"].as_i64(), neu[art]["ende"].as_i64().unwrap_or(0)) else { continue };
        for r in andere.iter().filter(|r| !r["id"].as_str().map(|i| i.eq_ignore_ascii_case(id)).unwrap_or(false)) {
            let b = &r["nummern"][art];
            let (os, oe) = (b["start"].as_i64().unwrap_or(0), b["ende"].as_i64().unwrap_or(0));
            if os > 0 && ueberschneiden((s, e), (os, oe)) {
                return Err(format!("Nummernkreis {label}: der Bereich {s}–{} überschneidet sich mit der Filiale „{}“ ({os}–{})", if e > 0 { e.to_string() } else { "offen".into() }, r["kurz"].as_str().filter(|k| !k.is_empty()).or(r["name"].as_str()).unwrap_or("?"), if oe > 0 { oe.to_string() } else { "offen".into() }));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::migrate(&c).unwrap();
        c
    }
    fn eigene_zeile(c: &Connection, nummern: Value) {
        crate::db::setting_set(c, "verbund.rolle", &json!("zentrale")).unwrap();
        crate::db::setting_set(c, "verbund.filiale", &json!("INN")).unwrap();
        stamm::save(c, "filiale", &[json!({ "id": "INN", "nr": 1, "name": "Zentrale", "nummern": nummern })]).unwrap();
    }

    #[test]
    fn ohne_bereich_zaehlt_wie_bisher() {
        let c = db();
        assert_eq!((naechste(&c, "rechnung").unwrap(), naechste(&c, "rechnung").unwrap(), naechste(&c, "angebot").unwrap()), (1, 2, 1));
        assert!(naechste(&c, "gutschein").is_err(), "nur die begrenzbaren Arten");
    }

    #[test]
    fn start_ende_und_nie_zurueck() {
        let c = db();
        eigene_zeile(&c, json!({ "rechnung": { "start": 20000, "ende": 20002 }, "order": { "start": 5, "ende": 0 } }));
        assert_eq!(naechste(&c, "rechnung").unwrap(), 20000, "springt auf den Start");
        assert_eq!(naechste(&c, "rechnung").unwrap(), 20001);
        assert_eq!(naechste(&c, "rechnung").unwrap(), 20002);
        let e = naechste(&c, "rechnung").unwrap_err();
        assert!(e.contains("erschöpft") && e.contains("20002"), "{e}");
        let z: i64 = c.query_row("SELECT value FROM counters WHERE name = 'doc.rechnung'", [], |r| r.get(0)).unwrap();
        assert_eq!(z, 20002, "der Zähler läuft bei Erschöpfung nicht weiter");
        // Start unter dem Zählerstand wird ignoriert, Ende unter dem Zählerstand sperrt sofort
        eigene_zeile(&c, json!({ "rechnung": { "start": 100, "ende": 30000 } }));
        assert_eq!(naechste(&c, "rechnung").unwrap(), 20003);
        eigene_zeile(&c, json!({ "rechnung": { "start": 100, "ende": 150 } }));
        assert!(naechste(&c, "rechnung").is_err());
        // Order mit offenem Ende
        eigene_zeile(&c, json!({ "order": { "start": 5, "ende": 0 } }));
        assert_eq!(naechste(&c, "order").unwrap(), 5);
        let s = stand(&c);
        assert_eq!((s["kreise"]["order"]["naechste"].as_i64(), s["kreise"]["order"]["rest"].is_null()), (Some(6), true));
        eigene_zeile(&c, json!({ "rechnung": { "start": 100, "ende": 150 } }));
        assert_eq!(stand(&c)["kreise"]["rechnung"]["rest"], 0, "Ende unter dem Zählerstand: nichts mehr frei");
        eigene_zeile(&c, json!({ "rechnung": { "start": 100, "ende": 20010 } }));
        assert_eq!(stand(&c)["kreise"]["rechnung"]["rest"], 7);
    }

    #[test]
    fn eingaben_und_ueberschneidungen() {
        assert_eq!(pruefen(&json!({ "rechnung": { "start": "20000", "ende": "" }, "angebot": { "start": "", "ende": "" } })).unwrap(), json!({ "rechnung": { "start": 20000, "ende": 0 } }));
        assert!(pruefen(&json!({ "rechnung": { "start": 20, "ende": 10 } })).unwrap_err().contains("vor der Start"));
        assert!(pruefen(&json!({ "auftrag": { "start": "", "ende": 10 } })).unwrap_err().contains("Start-Nr. fehlt"));
        assert!(pruefen(&json!({ "order": { "start": "abc" } })).is_err());
        assert!(pruefen(&json!({ "order": { "start": -3 } })).is_err());
        let andere = vec![json!({ "id": "SBG", "name": "Salzburg", "nummern": { "rechnung": { "start": 20000, "ende": 39999 }, "order": { "start": 100, "ende": 0 } } })];
        let ok = json!({ "rechnung": { "start": 40000, "ende": 59999 } });
        assert!(auf_ueberschneidung(&ok, "INN", &andere).is_ok());
        let schlecht = json!({ "rechnung": { "start": 39999, "ende": 50000 } });
        let e = auf_ueberschneidung(&schlecht, "INN", &andere).unwrap_err();
        assert!(e.contains("Rechnung") && e.contains("Salzburg"), "{e}");
        assert!(auf_ueberschneidung(&json!({ "order": { "start": 50, "ende": 0 } }), "INN", &andere).is_err(), "offenes Ende überlappt alles darüber");
        assert!(auf_ueberschneidung(&schlecht, "SBG", &andere).is_ok(), "gegen sich selbst wird nicht geprüft");
        assert!(auf_ueberschneidung(&json!({ "order": { "start": 1, "ende": 99 } }), "INN", &andere).is_ok());
    }

    #[test]
    fn vorgaenge_nutzen_den_kreis() {
        let c = db();
        eigene_zeile(&c, json!({ "rechnung": { "start": 20000, "ende": 20000 }, "order": { "start": 700, "ende": 700 } }));
        let speichern = |d: &Value| {
            let tx = c.unchecked_transaction().unwrap();
            let r = crate::vorgang::save(&tx, d, "T");
            if r.is_ok() {
                tx.commit().unwrap();
            }
            r
        };
        let d = json!({ "kind": "rechnung", "partner_name": "Kunde", "data": { "lines": [{ "name": "Ware", "qty": 1, "unit": 10.0, "vat": 20 }] } });
        let r = speichern(&d).unwrap();
        assert!(r["no"].as_str().unwrap().ends_with("-20000"), "{r}");
        let e = speichern(&d).unwrap_err();
        assert!(e.contains("erschöpft"), "{e}");
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM docs WHERE kind = 'rechnung'", [], |r| r.get(0)).unwrap(), 1, "kein Belegkopf ohne Nummer");
        // Angebote sind nicht begrenzt
        assert!(speichern(&json!({ "kind": "angebot", "partner_name": "K", "data": { "lines": [{ "name": "Ware", "qty": 1, "unit": 10.0, "vat": 20 }] } })).unwrap()["no"].as_str().unwrap().ends_with("-00001"));
    }
}
