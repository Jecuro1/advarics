//! Geführte Inventur: Zählliste mit Sollbestand zum Start, Zählen per Scan oder Eingabe,
//! Differenzen (Stück, Verkaufs- und Einkaufswert), Abschluss bucht die Differenzen.
//! Verkäufe während der Zählung werden berücksichtigt: neuer Bestand = aktueller + (gezählt − Soll beim Start).

use crate::{catalog, db};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::{json, Value};

/// Inventur anlegen. `scope`: {"cat": "...", "brand": "..."} – leer = alles.
pub fn start(tx: &Transaction, scope: &Value, user: &str) -> Result<i64, String> {
    if tx.query_row("SELECT 1 FROM inventories WHERE status = 'offen'", [], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_some() {
        return Err("Es läuft bereits eine Inventur – bitte zuerst abschließen oder verwerfen".into());
    }
    let cat = scope["cat"].as_str().filter(|s| !s.is_empty());
    let brand = scope["brand"].as_str().filter(|s| !s.is_empty());
    // Warengruppen mit „Inventur“ aus oder als Service-Warengruppe stehen nicht in der Zählliste
    if let Some(c) = cat {
        if let Some(grund) = ausgenommen_grund(tx, c) {
            return Err(format!("Die Warengruppe „{}“ {grund} – ihre Artikel werden nicht gezählt (Stammdaten › Warengruppen › Warengruppen)", gruppenname(tx, c)));
        }
    }
    let n: i64 = tx.query_row("UPDATE counters SET value = value + 1 WHERE name = 'inventur' RETURNING value", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let no = format!("INV-{}-{n:03}", chrono::Local::now().format("%Y"));
    tx.execute("INSERT INTO inventories(no, status, scope, created_at, user) VALUES (?1,'offen',?2,?3,?4)", params![no, scope.to_string(), db::now(), user])
        .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    let ausgenommen: i64 = tx
        .query_row(
            &format!("SELECT COUNT(*) FROM variants v JOIN articles a ON a.id = v.article_id JOIN stamm w ON w.kind = 'warengruppe' AND w.id = a.category
             WHERE v.active = 1 AND a.active = 1 AND (?1 IS NULL OR a.category = ?1) AND (?2 IS NULL OR a.brand = ?2) AND {OHNE_INVENTUR}"),
            params![cat, brand],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let k = tx
        .execute(
            &format!("INSERT INTO inventory_lines(inv_id, variant_id, expected)
             SELECT ?1, v.id, v.stock FROM variants v JOIN articles a ON a.id = v.article_id LEFT JOIN stamm w ON w.kind = 'warengruppe' AND w.id = a.category
             WHERE v.active = 1 AND a.active = 1 AND (?2 IS NULL OR a.category = ?2) AND (?3 IS NULL OR a.brand = ?3) AND NOT COALESCE({OHNE_INVENTUR}, 0)"),
            params![id, cat, brand],
        )
        .map_err(|e| e.to_string())?;
    if k == 0 {
        return Err(if ausgenommen > 0 { format!("Keine Artikel zum Zählen in diesem Bereich – {ausgenommen} Varianten gehören zu Warengruppen ohne Inventur bzw. zu Service-Warengruppen") } else { "Keine Artikel in diesem Bereich".into() });
    }
    if ausgenommen > 0 {
        tx.execute("UPDATE inventories SET scope = json_set(scope, '$.ausgenommen', ?2) WHERE id = ?1", params![id, ausgenommen]).map_err(|e| e.to_string())?;
    }
    Ok(id)
}

/// Warengruppen, deren Artikel nicht in die Zählliste kommen: Schalter „Inventur“ aus oder „Service-Warengruppe“ an (Zeile `w` der Stammdaten)
pub const OHNE_INVENTUR: &str = "(COALESCE(json_extract(w.data, '$.inventur'), 1) = 0 OR COALESCE(json_extract(w.data, '$.service'), 0) <> 0)";

fn ausgenommen_grund(c: &Connection, kat: &str) -> Option<&'static str> {
    let d: String = c.query_row("SELECT data FROM stamm WHERE kind = 'warengruppe' AND id = ?1", [kat], |r| r.get(0)).optional().ok().flatten()?;
    let v: Value = serde_json::from_str(&d).ok()?;
    if v["service"].as_bool().unwrap_or(false) {
        Some("ist eine Service-Warengruppe")
    } else if v["inventur"].as_bool() == Some(false) {
        Some("ist von der Inventur ausgenommen")
    } else {
        None
    }
}

fn gruppenname(c: &Connection, kat: &str) -> String {
    c.query_row("SELECT json_extract(data, '$.name') FROM stamm WHERE kind = 'warengruppe' AND id = ?1", [kat], |r| r.get::<_, Option<String>>(0)).optional().ok().flatten().flatten().unwrap_or_else(|| kat.to_string())
}

/// Zählung erfassen: `add` = zur bisherigen Zählung addieren (Scan), sonst Wert setzen.
pub fn count(c: &Connection, id: i64, ean: Option<&str>, variant_id: Option<i64>, qty: i64, add: bool) -> Result<Value, String> {
    let st: String = c.query_row("SELECT status FROM inventories WHERE id = ?1", [id], |r| r.get(0)).map_err(|_| "Inventur nicht gefunden".to_string())?;
    if st != "offen" {
        return Err("Inventur ist abgeschlossen".into());
    }
    let vid = match (variant_id, ean) {
        (Some(v), _) => v,
        (None, Some(e)) => c.query_row("SELECT id FROM variants WHERE ean = ?1", [e.trim()], |r| r.get(0)).map_err(|_| format!("EAN {e} unbekannt"))?,
        _ => return Err("Variante fehlt".into()),
    };
    if qty < 0 && !add {
        return Err("Menge ungültig".into());
    }
    let n = c
        .execute(
            "UPDATE inventory_lines SET counted = CASE WHEN ?4 THEN MAX(COALESCE(counted, 0) + ?3, 0) ELSE ?3 END WHERE inv_id = ?1 AND variant_id = ?2",
            params![id, vid, qty, add],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Artikel gehört nicht zu dieser Inventur".into());
    }
    let (counted, expected): (i64, i64) = c.query_row("SELECT counted, expected FROM inventory_lines WHERE inv_id = ?1 AND variant_id = ?2", params![id, vid], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
    Ok(json!({ "variant_id": vid, "counted": counted, "expected": expected }))
}

pub fn get(c: &Connection, id: i64) -> Result<Value, String> {
    let (no, status, scope, created, closed, user, result): (String, String, String, String, Option<String>, Option<String>, Option<String>) = c
        .query_row("SELECT no, status, scope, created_at, closed_at, user, result FROM inventories WHERE id = ?1", [id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?))
        })
        .map_err(|_| "Inventur nicht gefunden".to_string())?;
    let mut st = c
        .prepare(
            "SELECT l.variant_id, a.id, a.name, a.category, a.glyph, v.color, v.size, v.ean, l.expected, l.counted, v.stock, COALESCE(a.sale_price, a.price), a.cost
             FROM inventory_lines l JOIN variants v ON v.id = l.variant_id JOIN articles a ON a.id = v.article_id WHERE l.inv_id = ?1 ORDER BY a.category, a.name, v.id",
        )
        .map_err(|e| e.to_string())?;
    let lines: Vec<Value> = st
        .query_map([id], |r| {
            Ok(json!({ "variant_id": r.get::<_, i64>(0)?, "article_id": r.get::<_, String>(1)?, "name": r.get::<_, String>(2)?, "category": r.get::<_, String>(3)?,
                "glyph": r.get::<_, String>(4)?, "color": r.get::<_, String>(5)?, "size": r.get::<_, String>(6)?, "ean": r.get::<_, String>(7)?,
                "expected": r.get::<_, i64>(8)?, "counted": r.get::<_, Option<i64>>(9)?, "stock": r.get::<_, i64>(10)?, "price": r.get::<_, i64>(11)?, "cost": r.get::<_, Option<i64>>(12)? }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    Ok(json!({ "id": id, "no": no, "status": status, "scope": serde_json::from_str::<Value>(&scope).unwrap_or(Value::Null), "created_at": created,
        "closed_at": closed, "user": user, "result": result.and_then(|r| serde_json::from_str::<Value>(&r).ok()), "lines": lines }))
}

pub fn list(c: &Connection) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare(
        "SELECT i.id, i.no, i.status, i.created_at, i.closed_at, i.user, i.result, COUNT(l.variant_id), COUNT(l.counted)
         FROM inventories i LEFT JOIN inventory_lines l ON l.inv_id = i.id GROUP BY i.id ORDER BY i.id DESC",
    )?;
    let rows = st.query_map([], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "no": r.get::<_, String>(1)?, "status": r.get::<_, String>(2)?, "created_at": r.get::<_, String>(3)?,
            "closed_at": r.get::<_, Option<String>>(4)?, "user": r.get::<_, Option<String>>(5)?,
            "result": r.get::<_, Option<String>>(6)?.and_then(|x| serde_json::from_str::<Value>(&x).ok()), "lines": r.get::<_, i64>(7)?, "counted": r.get::<_, i64>(8)? }))
    })?;
    rows.collect()
}

/// Abschließen. `zero_uncounted`: nicht gezählte Varianten auf 0 setzen (sonst unverändert lassen).
pub fn finish(tx: &Transaction, id: i64, zero_uncounted: bool, user: &str) -> Result<Value, String> {
    let (no, status): (String, String) = tx.query_row("SELECT no, status FROM inventories WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|_| "Inventur nicht gefunden".to_string())?;
    if status != "offen" {
        return Err("Inventur ist bereits abgeschlossen".into());
    }
    let rows: Vec<(i64, i64, Option<i64>, i64, i64, Option<i64>)> = {
        let mut st = tx
            .prepare("SELECT l.variant_id, l.expected, l.counted, v.stock, COALESCE(a.sale_price, a.price), a.cost FROM inventory_lines l JOIN variants v ON v.id = l.variant_id JOIN articles a ON a.id = v.article_id WHERE l.inv_id = ?1")
            .map_err(|e| e.to_string())?;
        let it = st.query_map([id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))).map_err(|e| e.to_string())?;
        it.filter_map(Result::ok).collect()
    };
    let (mut plus, mut minus, mut val_vk, mut val_ek, mut booked, mut counted_n) = (0i64, 0i64, 0i64, 0i64, 0i64, 0i64);
    for (vid, expected, counted, stock, price, cost) in rows {
        let counted = match counted {
            Some(c) => {
                counted_n += 1;
                c
            }
            None if zero_uncounted => 0,
            None => continue,
        };
        let diff = counted - expected;
        if diff == 0 {
            continue;
        }
        let new = stock + diff;
        catalog::book(tx, vid, new, true, "Inventur", Some(&no), Some(user))?;
        booked += 1;
        if diff > 0 { plus += diff } else { minus += -diff }
        val_vk += diff * price;
        val_ek += diff * cost.unwrap_or(0);
    }
    let result = json!({ "counted": counted_n, "booked": booked, "plus": plus, "minus": minus, "value_vk": val_vk, "value_ek": val_ek, "zero_uncounted": zero_uncounted });
    tx.execute("UPDATE inventories SET status = 'abgeschlossen', closed_at = ?2, result = ?3 WHERE id = ?1", params![id, db::now(), result.to_string()]).map_err(|e| e.to_string())?;
    Ok(result)
}

pub fn discard(c: &Connection, id: i64) -> Result<(), String> {
    let n = c.execute("UPDATE inventories SET status = 'verworfen', closed_at = ?2 WHERE id = ?1 AND status = 'offen'", params![id, db::now()]).map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Nur offene Inventuren können verworfen werden".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inventur_mit_verkauf_waehrend_zaehlung() {
        let mut c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let a: catalog::Article = serde_json::from_value(json!({ "id": "A1", "name": "Jacke", "category": "jacken", "price": 10000, "vat": 20, "cost": 4000,
            "colors": ["moos"], "sizes": ["M", "L"], "variants": [{ "color": "moos", "size": "M", "ean": "2000000000015" }, { "color": "moos", "size": "L", "ean": "2000000000022" }] })).unwrap();
        let tx = c.transaction().unwrap();
        catalog::save(&tx, &a).unwrap();
        catalog::book(&tx, 1, 5, true, "Start", None, None).unwrap();
        catalog::book(&tx, 2, 3, true, "Start", None, None).unwrap();
        let id = start(&tx, &json!({}), "T").unwrap();
        assert!(start(&tx, &json!({}), "T").is_err(), "nur eine offene Inventur");
        tx.commit().unwrap();
        // zwei Scans + manuelle Zählung
        count(&c, id, Some("2000000000015"), None, 1, true).unwrap();
        count(&c, id, Some("2000000000015"), None, 1, true).unwrap();
        assert!(count(&c, id, Some("9999"), None, 1, true).is_err());
        // Verkauf während der Zählung: M 5 → 4
        let tx = c.transaction().unwrap();
        catalog::book(&tx, 1, -1, false, "Verkauf", None, None).unwrap();
        let r = finish(&tx, id, false, "T").unwrap();
        tx.commit().unwrap();
        // M: Soll 5, gezählt 2 → Differenz −3 auf den aktuellen Bestand 4 → 1; L nicht gezählt → bleibt 3
        let m: i64 = c.query_row("SELECT stock FROM variants WHERE id = 1", [], |r| r.get(0)).unwrap();
        let l: i64 = c.query_row("SELECT stock FROM variants WHERE id = 2", [], |r| r.get(0)).unwrap();
        assert_eq!((m, l), (1, 3));
        assert_eq!(r["minus"], json!(3));
        assert_eq!(r["value_ek"], json!(-12000));
        assert!(count(&c, id, None, Some(1), 1, true).is_err(), "abgeschlossen");
    }

    fn artikel(tx: &Transaction, id: &str, kat: &str, ean: &str) {
        let a: catalog::Article = serde_json::from_value(json!({ "id": id, "name": id, "category": kat, "price": 1000, "vat": 20, "cost": 400,
            "colors": ["moos"], "sizes": ["M"], "variants": [{ "color": "moos", "size": "M", "ean": ean }] })).unwrap();
        catalog::save(tx, &a).unwrap();
    }

    #[test]
    fn warengruppen_ohne_inventur_und_service_stehen_nicht_in_der_zaehlliste() {
        let mut c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let tx = c.transaction().unwrap();
        for (kat, data) in [("adv-1", json!({ "name": "Ware", "inventur": true })), ("adv-2", json!({ "name": "Pfand", "inventur": false })), ("adv-3", json!({ "name": "Service", "service": true, "inventur": true })), ("adv-4", json!({ "name": "Alt" }))] {
            tx.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES ('warengruppe', ?1, ?2, 0, 1, 't')", params![kat, data.to_string()]).unwrap();
        }
        artikel(&tx, "W", "adv-1", "2000000000015");
        artikel(&tx, "P", "adv-2", "2000000000022");
        artikel(&tx, "S", "adv-3", "2000000000039");
        artikel(&tx, "A", "adv-4", "2000000000046");
        artikel(&tx, "X", "unbekannt", "2000000000053");
        let id = start(&tx, &json!({}), "T").unwrap();
        let namen: Vec<String> = tx.prepare("SELECT a.id FROM inventory_lines l JOIN variants v ON v.id = l.variant_id JOIN articles a ON a.id = v.article_id WHERE l.inv_id = ?1 ORDER BY a.id").unwrap().query_map([id], |r| r.get(0)).unwrap().filter_map(Result::ok).collect();
        assert_eq!(namen, vec!["A", "W", "X"], "ohne Inventur und Service ausgenommen, Alt-Gruppen ohne Angabe und unbekannte Kategorien gezählt");
        let scope: String = tx.query_row("SELECT scope FROM inventories WHERE id = ?1", [id], |r| r.get(0)).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&scope).unwrap()["ausgenommen"], json!(2));
        tx.execute("UPDATE inventories SET status = 'verworfen'", []).unwrap();
        // ausdrücklich gewählte ausgenommene Gruppe: Fehler mit Grund
        let e = start(&tx, &json!({ "cat": "adv-2" }), "T").unwrap_err();
        assert!(e.contains("Pfand") && e.contains("ausgenommen"), "{e}");
        let e = start(&tx, &json!({ "cat": "adv-3" }), "T").unwrap_err();
        assert!(e.contains("Service-Warengruppe"), "{e}");
        assert!(start(&tx, &json!({ "cat": "adv-1" }), "T").is_ok());
    }
}
