//! Stammdaten-Tabellen (Marken, Saisons, Größenschlüssel, Spediteure, Hotels, MwSt.-Sets …) in einer
//! gemeinsamen Tabelle, Zeiterfassung und die Flexanalyse über alle Belegpositionen.

use crate::db;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub fn list(c: &Connection, kind: &str) -> Result<Vec<Value>, String> {
    let mut st = c.prepare("SELECT id, data, pos, active, updated_at FROM stamm WHERE kind = ?1 ORDER BY pos, id").map_err(|e| e.to_string())?;
    let rows = st
        .query_map([kind], |r| {
            let mut d: Value = serde_json::from_str(&r.get::<_, String>(1)?).unwrap_or(json!({}));
            d["id"] = json!(r.get::<_, String>(0)?);
            d["_pos"] = json!(r.get::<_, i64>(2)?);
            d["_aktiv"] = json!(r.get::<_, i64>(3)? != 0);
            d["_geaendert"] = json!(r.get::<_, String>(4)?);
            Ok(d)
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn all(c: &Connection) -> Result<Value, String> {
    let mut st = c.prepare("SELECT DISTINCT kind FROM stamm").map_err(|e| e.to_string())?;
    let kinds: Vec<String> = st.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    let mut m = serde_json::Map::new();
    for k in kinds {
        m.insert(k.clone(), json!(list(c, &k)?));
    }
    Ok(Value::Object(m))
}

/// Ganze Tabelle einer Art ersetzen (Reihenfolge = Position). IDs müssen eindeutig sein.
pub fn save(c: &Connection, kind: &str, rows: &[Value]) -> Result<usize, String> {
    if kind.is_empty() || kind.len() > 40 || !kind.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.') {
        return Err("Ungültige Tabelle".into());
    }
    let mut seen = HashSet::new();
    for r in rows {
        let id = r["id"].as_str().unwrap_or("").trim();
        if id.is_empty() {
            return Err("Jede Zeile braucht ein Kürzel / eine ID".into());
        }
        if !seen.insert(id.to_lowercase()) {
            return Err(format!("„{id}“ kommt doppelt vor"));
        }
    }
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    write_rows(&tx, kind, rows)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(rows.len())
}

/// Tabellen, die nur am jeweiligen Arbeitsplatz gelten (nicht von der Zentrale übernommen)
pub const LOCAL: [&str; 6] = ["edijob", "reportplan", "etikettendrucker", "esl", "inventurort", "edianbindung"];

/// Zeilen schreiben – ohne eigene Transaktion (für den Filialabgleich)
pub fn write_rows(tx: &Connection, kind: &str, rows: &[Value]) -> Result<(), String> {
    tx.execute("DELETE FROM stamm WHERE kind = ?1", [kind]).map_err(|e| e.to_string())?;
    for (i, r) in rows.iter().enumerate() {
        let mut d = r.clone();
        let id = d["id"].as_str().unwrap_or("").trim().to_string();
        let aktiv = d["_aktiv"].as_bool().unwrap_or(true);
        if let Some(o) = d.as_object_mut() {
            o.retain(|k, _| !k.starts_with('_') && k != "id");
        }
        tx.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES (?1,?2,?3,?4,?5,?6)", params![kind, id, d.to_string(), i as i64, aktiv as i64, db::now()])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/* ── Zeiterfassung ── */

pub fn zeit_stempel(c: &Connection, user: &str) -> Result<Value, String> {
    let open: Option<i64> = c.query_row("SELECT id FROM zeiten WHERE user = ?1 AND ende IS NULL ORDER BY id DESC LIMIT 1", [user], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    match open {
        Some(id) => {
            c.execute("UPDATE zeiten SET ende = ?2 WHERE id = ?1", params![id, db::now()]).map_err(|e| e.to_string())?;
            Ok(json!({ "status": "gegangen", "id": id }))
        }
        None => {
            c.execute("INSERT INTO zeiten(user, start) VALUES (?1, ?2)", params![user, db::now()]).map_err(|e| e.to_string())?;
            Ok(json!({ "status": "gekommen", "id": c.last_insert_rowid() }))
        }
    }
}

pub fn zeit_list(c: &Connection, von: &str, bis: &str) -> Result<Vec<Value>, String> {
    let mut st = c
        .prepare("SELECT id, user, start, ende, pause, notiz, geaendert FROM zeiten WHERE substr(start,1,10) BETWEEN ?1 AND ?2 ORDER BY start DESC")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map(params![von, bis], |r| {
            Ok(json!({ "id": r.get::<_, i64>(0)?, "user": r.get::<_, String>(1)?, "start": r.get::<_, String>(2)?, "ende": r.get::<_, Option<String>>(3)?,
                "pause": r.get::<_, i64>(4)?, "notiz": r.get::<_, String>(5)?, "geaendert": r.get::<_, Option<String>>(6)? }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// Korrektur durch Leitung (wird markiert)
pub fn zeit_save(c: &Connection, e: &Value, by: &str) -> Result<(), String> {
    let s = |k: &str| e[k].as_str().map(str::to_string);
    let start = s("start").ok_or("Beginn fehlt")?;
    if let (Some(a), Some(b)) = (Some(&start), s("ende").as_ref()) {
        if b <= a {
            return Err("Ende muss nach dem Beginn liegen".into());
        }
    }
    let note = format!("{} · {}", by, db::now());
    match e["id"].as_i64() {
        Some(id) => c.execute("UPDATE zeiten SET start = ?2, ende = ?3, pause = ?4, notiz = ?5, geaendert = ?6 WHERE id = ?1", params![id, start, s("ende"), e["pause"].as_i64().unwrap_or(0), s("notiz").unwrap_or_default(), note]),
        None => c.execute("INSERT INTO zeiten(user, start, ende, pause, notiz, geaendert) VALUES (?1,?2,?3,?4,?5,?6)", params![s("user").ok_or("Person fehlt")?, start, s("ende"), e["pause"].as_i64().unwrap_or(0), s("notiz").unwrap_or_default(), note]),
    }
    .map_err(|e| e.to_string())?;
    Ok(())
}

/* ── Flexanalyse ── */

fn dim_value(dim: &str, ts: &str, line: &Value, row: &HashMap<&str, String>) -> String {
    let lv = |k: &str| line[k].as_str().unwrap_or("").to_string();
    match dim {
        "warengruppe" => row["cat"].clone(),
        "marke" => row["brand"].clone(),
        "artikel" => format!("{} {}", lv("sku"), lv("name")).trim().to_string(),
        "farbe" => lv("c"),
        "groesse" => lv("s"),
        "kassier" => row["cashier"].clone(),
        "verkaeufer" => row["seller"].clone(),
        "kunde" => row["customer"].clone(),
        "lieferant" => row["supplier"].clone(),
        "saison" => row["saison"].clone(),
        "filiale" => row["store"].clone(),
        "filialgruppe" => row["fgruppe"].clone(),
        "haustyp" => row["haustyp"].clone(),
        "monat" => ts.get(0..7).unwrap_or("").to_string(),
        "jahr" => ts.get(0..4).unwrap_or("").to_string(),
        "tag" => ts.get(0..10).unwrap_or("").to_string(),
        "stunde" => format!("{} Uhr", ts.get(11..13).unwrap_or("")),
        "wochentag" => chrono::NaiveDate::parse_from_str(ts.get(0..10).unwrap_or(""), "%Y-%m-%d")
            .map(|d| ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][chrono::Datelike::weekday(&d).num_days_from_monday() as usize].to_string())
            .unwrap_or_default(),
        "preislage" => {
            let p = line["unit"].as_f64().unwrap_or(0.0);
            let b = [0.0, 25.0, 50.0, 100.0, 200.0, 400.0, 800.0];
            let i = b.iter().rposition(|x| p >= *x).unwrap_or(0);
            if i + 1 < b.len() { format!("€ {:.0}–{:.0}", b[i], b[i + 1]) } else { format!("ab € {:.0}", b[i]) }
        }
        _ => String::new(),
    }
}

/// Auswertung über alle Belegpositionen: bis zu drei Dimensionen, Kennzahlen Menge, Umsatz, Rabatt,
/// Rohertrag (netto − EK), Bons. Retouren und Stornos werden abgezogen.
pub fn analyse(c: &Connection, p: &Value) -> Result<Value, String> {
    let von = p["von"].as_str().unwrap_or("0000-00-00").to_string();
    let bis = p["bis"].as_str().unwrap_or("9999-99-99").to_string();
    let dims: Vec<String> = p["dims"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).take(3).collect()).unwrap_or_default();
    let filt: Vec<(String, String)> = p["filter"].as_object().map(|m| m.iter().filter_map(|(k, v)| v.as_str().filter(|s| !s.is_empty()).map(|s| (k.clone(), s.to_string()))).collect()).unwrap_or_default();
    let own = db::setting_get(c, "verbund.filiale").and_then(|v| v.as_str().map(str::to_string)).filter(|s| !s.is_empty()).unwrap_or_else(|| "HIER".into());
    let arts: HashMap<String, (String, String, String, Option<i64>, String)> = {
        let mut st = c.prepare("SELECT id, category, brand, COALESCE(supplier_id,''), cost, fields FROM articles").map_err(|e| e.to_string())?;
        let rows = st
            .query_map([], |r| {
                let f: Value = serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or(json!({}));
                Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, f["Saison"].as_str().unwrap_or("").to_string())))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    let sups: HashMap<String, String> = {
        let mut st = c.prepare("SELECT id, name FROM suppliers").map_err(|e| e.to_string())?;
        let r = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
        r.filter_map(Result::ok).collect()
    };
    // je Filiale: Filialgruppe und Haus-Typ aus Stammdaten › Filialen
    let own_id = crate::verbund::own_store(c);
    let fmeta: HashMap<String, (String, String)> = {
        let gr = list(c, "filialgruppe").unwrap_or_default();
        list(c, "filiale")
            .unwrap_or_default()
            .iter()
            .map(|r| {
                let id = r["id"].as_str().unwrap_or("").to_string();
                let g = gr
                    .iter()
                    .find(|g| g["filialen"].as_array().map(|a| a.iter().any(|x| x.as_str().map(|t| t.eq_ignore_ascii_case(&id)).unwrap_or(false))).unwrap_or(false))
                    .and_then(|g| g["name"].as_str())
                    .unwrap_or("Standard")
                    .to_string();
                (id, (g, r["haustyp"].as_str().unwrap_or("").to_string()))
            })
            .collect()
    };
    let mut src: Vec<(String, String, Option<String>, String, String)> = vec![];
    {
        let mut st = c.prepare("SELECT beleg_no, ts, cashier, data FROM sales WHERE substr(ts,1,10) BETWEEN ?1 AND ?2").map_err(|e| e.to_string())?;
        let r = st.query_map(params![von, bis], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, String>(3)?, own.clone()))).map_err(|e| e.to_string())?;
        src.extend(r.filter_map(Result::ok));
        let mut st = c.prepare("SELECT beleg_no, ts, cashier, data, store FROM store_sales WHERE substr(ts,1,10) BETWEEN ?1 AND ?2 AND store <> ?3").map_err(|e| e.to_string())?;
        let r = st.query_map(params![von, bis, own], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?))).map_err(|e| e.to_string())?;
        src.extend(r.filter_map(Result::ok));
    }
    #[derive(Default)]
    struct Agg { menge: f64, umsatz: f64, rabatt: f64, netto: f64, ek: f64, bons: HashSet<String> }
    let mut agg: HashMap<Vec<String>, Agg> = HashMap::new();
    let mut total = Agg::default();
    for (no, ts, cashier, data, store) in src {
        let d: Value = serde_json::from_str(&data).unwrap_or(json!({}));
        let kind = d["kind"].as_str().unwrap_or("verkauf");
        let sign = if kind == "verkauf" { 1.0 } else { -1.0 };
        if d["voided"].as_bool().unwrap_or(false) {
            continue;
        }
        for l in d["lines"].as_array().cloned().unwrap_or_default() {
            if l["voucher"].as_bool().unwrap_or(false) {
                continue;
            }
            let sku = l["sku"].as_str().unwrap_or("");
            let a = arts.get(sku);
            let mut row: HashMap<&str, String> = HashMap::new();
            row.insert("cat", a.map(|x| x.0.clone()).unwrap_or_else(|| "Dienstleistung".into()));
            row.insert("brand", a.map(|x| x.1.clone()).unwrap_or_default());
            row.insert("supplier", a.map(|x| sups.get(&x.2).cloned().unwrap_or_else(|| x.2.clone())).unwrap_or_default());
            row.insert("saison", a.map(|x| x.4.clone()).unwrap_or_default());
            row.insert("cashier", cashier.clone().unwrap_or_default());
            row.insert("seller", d["seller"].as_str().map(str::to_string).or(cashier.clone()).unwrap_or_default());
            row.insert("customer", d["customer"]["name"].as_str().unwrap_or("ohne Kunde").to_string());
            row.insert("store", store.clone());
            let (fg, ht) = fmeta.get(if store == "HIER" { own_id.as_str() } else { store.as_str() }).cloned().unwrap_or_else(|| ("Standard".to_string(), String::new()));
            row.insert("fgruppe", fg);
            row.insert("haustyp", ht);
            if filt.iter().any(|(k, v)| &dim_value(k, &ts, &l, &row) != v) {
                continue;
            }
            let qty = l["qty"].as_f64().unwrap_or(0.0);
            let gross = l["unit"].as_f64().unwrap_or(0.0) * qty;
            let disc = gross * l["disc"]["pct"].as_f64().unwrap_or(0.0) / 100.0;
            let vat = l["vat"].as_f64().unwrap_or(20.0);
            let net = (gross - disc) / (1.0 + vat / 100.0);
            let ek = a.and_then(|x| x.3).map(|c| c as f64 / 100.0 * qty).unwrap_or(0.0);
            let key: Vec<String> = dims.iter().map(|dm| dim_value(dm, &ts, &l, &row)).collect();
            for g in [agg.entry(key).or_default(), &mut total] {
                g.menge += sign * qty;
                g.umsatz += sign * (gross - disc);
                g.rabatt += sign * disc;
                g.netto += sign * net;
                g.ek += sign * ek;
                if sign > 0.0 {
                    g.bons.insert(no.clone());
                }
            }
        }
    }
    let out_row = |k: Vec<String>, g: &Agg| json!({ "keys": k, "menge": g.menge, "umsatz": (g.umsatz * 100.0).round() / 100.0, "rabatt": (g.rabatt * 100.0).round() / 100.0,
        "netto": (g.netto * 100.0).round() / 100.0, "ek": (g.ek * 100.0).round() / 100.0, "rohertrag": ((g.netto - g.ek) * 100.0).round() / 100.0, "bons": g.bons.len() });
    let mut rows: Vec<Value> = agg.iter().map(|(k, g)| out_row(k.clone(), g)).collect();
    rows.sort_by(|a, b| b["umsatz"].as_f64().partial_cmp(&a["umsatz"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
    Ok(json!({ "dims": dims, "rows": rows, "summe": out_row(vec![], &total) }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamm_zeiten_analyse() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        save(&c, "marke", &[json!({ "id": "NW", "name": "Nordwand" }), json!({ "id": "FI", "name": "Firn", "_aktiv": false })]).unwrap();
        assert!(save(&c, "marke", &[json!({ "id": "A" }), json!({ "id": "a" })]).is_err());
        let l = list(&c, "marke").unwrap();
        assert_eq!((l.len(), l[1]["_aktiv"].as_bool().unwrap()), (2, false));
        assert_eq!(zeit_stempel(&c, "dh").unwrap()["status"], "gekommen");
        assert_eq!(zeit_stempel(&c, "dh").unwrap()["status"], "gegangen");
        assert_eq!(zeit_list(&c, "0000", "9999").unwrap().len(), 1);
        c.execute("INSERT INTO articles(id, name, category, brand, price, cost, created_at, updated_at) VALUES ('A1','Jacke','jacken','Nordwand',12000,5000,'x','x')", []).unwrap();
        c.execute("INSERT INTO sales(beleg_no, ts, total, cashier, data) VALUES ('1','2026-10-01T10:00:00','12000','Lena', ?1)", [json!({ "lines": [{ "sku": "A1", "name": "Jacke", "qty": 2, "unit": 60.0, "vat": 20 }] }).to_string()]).unwrap();
        c.execute("INSERT INTO sales(beleg_no, ts, total, cashier, data) VALUES ('2','2026-10-02T10:00:00','-6000','Lena', ?1)", [json!({ "kind": "retoure", "lines": [{ "sku": "A1", "name": "Jacke", "qty": 1, "unit": 60.0, "vat": 20 }] }).to_string()]).unwrap();
        let r = analyse(&c, &json!({ "dims": ["marke"], "von": "2026-10-01", "bis": "2026-10-31" })).unwrap();
        assert_eq!(r["rows"][0]["keys"][0], "Nordwand");
        assert_eq!(r["rows"][0]["menge"], 1.0);
        assert_eq!(r["rows"][0]["umsatz"], 60.0);
        assert_eq!(r["rows"][0]["rohertrag"], 0.0);
        // Filialgruppe und Haus-Typ aus Stammdaten › Filialen
        let own = crate::verbund::own_store(&c);
        save(&c, "filiale", &[json!({ "id": own, "name": "Zentrale", "haustyp": "Fachgeschäft" })]).unwrap();
        save(&c, "filialgruppe", &[json!({ "id": "G1", "name": "West", "filialen": [own] })]).unwrap();
        let r = analyse(&c, &json!({ "dims": ["filialgruppe", "haustyp"], "von": "2026-10-01", "bis": "2026-10-31" })).unwrap();
        assert_eq!((r["rows"][0]["keys"][0].as_str(), r["rows"][0]["keys"][1].as_str()), (Some("West"), Some("Fachgeschäft")));
    }
}
