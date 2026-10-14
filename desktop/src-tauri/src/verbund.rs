//! Filialverbund: eine Installation ist Zentrale, die anderen sind Filialen. Jede Kasse arbeitet mit
//! ihrer eigenen Datenbank weiter (offline-fähig, eigene RKSV-Signatur) und gleicht sich im Hintergrund
//! mit der Zentrale ab:
//!  · Filiale → Zentrale: Belege, Bestände, Bonuspunkte, neue/geänderte Kunden
//!  · Zentrale → Filiale: Artikel & Preise, Preisaktionen, Lieferanten, Kunden, Bestände der anderen
//!    Filialen, Umlagerungen
//! Stammdaten (Artikel, Preise) pflegt die Zentrale. Umlagerungen werden in der Zentrale geführt.

use crate::{catalog, customers, db};
use rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::Duration;

pub const ROLLEN: [&str; 3] = ["einzel", "zentrale", "filiale"];
/// Einstellungen, die die Zentrale an alle Filialen verteilt
pub const SHARED: [&str; 6] = ["rabatt.regeln", "retoure.gruende", "order.typen", "order.vorschlag", "praemien.regeln", "verteilung.schluessel"];

fn s(c: &Connection, k: &str) -> String {
    db::setting_get(c, k).map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())).unwrap_or_default()
}
fn n(c: &Connection, k: &str) -> i64 {
    db::setting_get(c, k).and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|x| x.parse().ok()))).unwrap_or(0)
}
fn set(c: &Connection, k: &str, v: Value) {
    let _ = db::setting_set(c, k, &v);
}
fn hash(k: &str) -> String {
    Sha256::digest(k.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}
pub fn rolle(c: &Connection) -> String {
    let r = s(c, "verbund.rolle");
    if r.is_empty() { "einzel".into() } else { r }
}
/// Eigene Filialkennung (z. B. „INN“)
pub fn own_store(c: &Connection) -> String {
    let x = s(c, "verbund.filiale");
    if x.is_empty() { "ZENTRALE".into() } else { x }
}

/* ══ Zentrale: Filialen verwalten ══ */

pub fn store_create(c: &Connection, id: &str, name: &str, addr: &str) -> Result<String, String> {
    let id = id.trim().to_uppercase();
    if id.len() < 2 || id.len() > 12 || !id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') {
        return Err("Kennung: 2–12 Zeichen, Buchstaben/Ziffern (z. B. SBG)".into());
    }
    if id == own_store(c) {
        return Err("Diese Kennung hat die Zentrale selbst".into());
    }
    if name.trim().is_empty() {
        return Err("Name fehlt".into());
    }
    let mut b = [0u8; 20];
    OsRng.fill_bytes(&mut b);
    let key = format!("kfil_{}", b.iter().map(|x| format!("{x:02x}")).collect::<String>());
    c.execute(
        "INSERT INTO stores(id, name, addr, key_hash, created_at, active) VALUES (?1,?2,?3,?4,?5,1)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, addr=excluded.addr, key_hash=excluded.key_hash, active=1",
        params![id, name.trim(), addr.trim(), hash(&key), db::now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(key)
}

pub fn stores(c: &Connection) -> rusqlite::Result<Vec<Value>> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut st = c.prepare(
        "SELECT s.id, s.name, s.addr, s.last_sync, s.last_ip, s.info, s.active,
           (SELECT COALESCE(SUM(total),0) FROM store_sales x WHERE x.store = s.id AND substr(x.ts,1,10) = ?1),
           (SELECT COUNT(*) FROM store_sales x WHERE x.store = s.id AND substr(x.ts,1,10) = ?1 AND x.kind = 'verkauf'),
           (SELECT COALESCE(SUM(total),0) FROM store_sales x WHERE x.store = s.id AND substr(x.ts,1,7) = substr(?1,1,7))
         FROM stores s ORDER BY s.name",
    )?;
    let rows = st.query_map([&today], |r| {
        Ok(json!({ "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "addr": r.get::<_, String>(2)?, "last_sync": r.get::<_, Option<String>>(3)?,
            "last_ip": r.get::<_, Option<String>>(4)?, "info": serde_json::from_str::<Value>(&r.get::<_, String>(5)?).unwrap_or(json!({})), "active": r.get::<_, i64>(6)? != 0,
            "revenue_today": r.get::<_, i64>(7)?, "sales_today": r.get::<_, i64>(8)?, "revenue_month": r.get::<_, i64>(9)? }))
    })?;
    rows.collect()
}

/// Übersicht für Zentrale: eigene Filiale + alle angeschlossenen (Umsatz heute/Monat aus Belegen)
pub fn overview(c: &Connection) -> Result<Value, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let own: (i64, i64, i64) = c
        .query_row(
            "SELECT COALESCE(SUM(CASE WHEN substr(ts,1,10)=?1 THEN total END),0), COUNT(CASE WHEN substr(ts,1,10)=?1 AND kind='verkauf' THEN 1 END), COALESCE(SUM(CASE WHEN substr(ts,1,7)=substr(?1,1,7) THEN total END),0) FROM sales",
            [&today],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    let mut list = vec![json!({ "id": own_store(c), "name": s(c, "verbund.name").trim().to_string().chars().take(60).collect::<String>(), "own": true, "active": true, "last_sync": db::now(),
        "revenue_today": own.0, "sales_today": own.1, "revenue_month": own.2 })];
    if list[0]["name"].as_str().unwrap_or("").is_empty() {
        list[0]["name"] = json!("Zentrale");
    }
    list.extend(stores(c).map_err(|e| e.to_string())?);
    Ok(json!({ "rolle": rolle(c), "stores": list }))
}

/// Bestand je Filiale für eine Liste von EANs (eigener Bestand aus der Datenbank)
pub fn stock_matrix(c: &Connection) -> Result<Value, String> {
    let own = own_store(c);
    let mut m = serde_json::Map::new();
    let mut st = c.prepare("SELECT ean, stock FROM variants WHERE active = 1").map_err(|e| e.to_string())?;
    let mine: serde_json::Map<String, Value> = st.query_map([], |r| Ok((r.get::<_, String>(0)?, json!(r.get::<_, i64>(1)?)))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    m.insert(own.clone(), Value::Object(mine));
    let mut st = c.prepare("SELECT store, ean, stock FROM store_stock WHERE store <> ?1").map_err(|e| e.to_string())?;
    for r in st.query_map([&own], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?))).map_err(|e| e.to_string())?.flatten() {
        m.entry(r.0).or_insert_with(|| json!({}))[&r.1] = json!(r.2);
    }
    Ok(Value::Object(m))
}

/* ══ Umlagerungen ══ */

pub fn transfers(c: &Connection, store: Option<&str>) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare("SELECT id, no, from_store, to_store, status, lines, note, created_at, updated_at, user, booked_out, booked_in FROM transfers WHERE (?1 IS NULL OR from_store = ?1 OR to_store = ?1) ORDER BY id DESC LIMIT 300")?;
    let rows = st.query_map([store], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "no": r.get::<_, String>(1)?, "from": r.get::<_, String>(2)?, "to": r.get::<_, String>(3)?, "status": r.get::<_, String>(4)?,
            "lines": serde_json::from_str::<Value>(&r.get::<_, String>(5)?).unwrap_or(json!([])), "note": r.get::<_, String>(6)?, "created_at": r.get::<_, String>(7)?,
            "updated_at": r.get::<_, String>(8)?, "user": r.get::<_, Option<String>>(9)?, "booked_out": r.get::<_, i64>(10)? != 0, "booked_in": r.get::<_, i64>(11)? != 0 }))
    })?;
    rows.collect()
}

/// Neue Umlagerung (nur Zentrale): Zeilen [{ean, qty, name}]
pub fn transfer_create(c: &Connection, from: &str, to: &str, lines: &Value, note: &str, user: &str) -> Result<Value, String> {
    if from == to {
        return Err("Von- und Nach-Filiale sind gleich".into());
    }
    let ls = lines.as_array().filter(|a| !a.is_empty()).ok_or("Keine Positionen")?;
    if ls.iter().any(|l| l["ean"].as_str().unwrap_or("").is_empty() || l["qty"].as_i64().unwrap_or(0) <= 0) {
        return Err("Position ohne EAN oder Menge".into());
    }
    let nr: i64 = c.query_row("UPDATE counters SET value = value + 1 WHERE name = 'umlagerung' RETURNING value", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let no = format!("UL-{}-{nr:05}", chrono::Local::now().format("%Y"));
    c.execute(
        "INSERT INTO transfers(no, from_store, to_store, status, lines, note, created_at, updated_at, user) VALUES (?1,?2,?3,'angefordert',?4,?5,?6,?6,?7)",
        params![no, from, to, Value::Array(ls.clone()).to_string(), note, db::now(), user],
    )
    .map_err(|e| e.to_string())?;
    transfers(c, None).map_err(|e| e.to_string())?.into_iter().find(|t| t["no"] == no).ok_or_else(|| "nicht gefunden".into())
}

/// Status ändern: versendet (Quelle bucht aus), empfangen (Ziel bucht ein), storniert.
/// `actor` ist die Filiale, die die Änderung auslöst; gebucht wird in der Datenbank, in der diese Funktion läuft,
/// nur wenn `local_store` die betroffene Filiale ist.
pub fn transfer_status(c: &Connection, no: &str, status: &str, actor: &str, local_store: &str, user: &str) -> Result<Value, String> {
    let t = transfers(c, None).map_err(|e| e.to_string())?.into_iter().find(|t| t["no"] == no).ok_or("Umlagerung nicht gefunden")?;
    let cur = t["status"].as_str().unwrap_or("");
    let (from, to) = (t["from"].as_str().unwrap_or(""), t["to"].as_str().unwrap_or(""));
    let ok = match (cur, status) {
        ("angefordert", "versendet") => actor == from,
        ("versendet", "empfangen") => actor == to,
        ("angefordert", "storniert") => true,
        _ => false,
    };
    if !ok {
        return Err(format!("Von „{cur}“ nach „{status}“ ist für {actor} nicht möglich"));
    }
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    if (status == "versendet" && local_store == from) || (status == "empfangen" && local_store == to) {
        let sign = if status == "versendet" { -1 } else { 1 };
        for l in t["lines"].as_array().cloned().unwrap_or_default() {
            let ean = l["ean"].as_str().unwrap_or("");
            if let Some(vid) = tx.query_row("SELECT id FROM variants WHERE ean = ?1", [ean], |r| r.get::<_, i64>(0)).optional().map_err(|e| e.to_string())? {
                catalog::book(&tx, vid, sign * l["qty"].as_i64().unwrap_or(0), false, &format!("Umlagerung {no} {}", if sign < 0 { format!("nach {to}") } else { format!("von {from}") }), Some(no), Some(user))?;
            }
        }
        let col = if sign < 0 { "booked_out" } else { "booked_in" };
        tx.execute(&format!("UPDATE transfers SET {col} = 1 WHERE no = ?1"), [no]).map_err(|e| e.to_string())?;
    }
    tx.execute("UPDATE transfers SET status = ?2, updated_at = ?3 WHERE no = ?1", params![no, status, db::now()]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    transfers(c, None).map_err(|e| e.to_string())?.into_iter().find(|t| t["no"] == no).ok_or_else(|| "nicht gefunden".into())
}

/// Umlagerungsvorschläge: Varianten, die in einer Filiale fehlen/knapp sind und anderswo reichlich liegen
pub fn suggestions(c: &Connection) -> Result<Vec<Value>, String> {
    let m = stock_matrix(c)?;
    let stores: Vec<String> = m.as_object().map(|o| o.keys().cloned().collect()).unwrap_or_default();
    // Abverkauf 28 Tage je Filiale und EAN (eigene Belege + empfangene Belege)
    let mut sold: std::collections::HashMap<(String, String), f64> = Default::default();
    let since = (chrono::Local::now() - chrono::Duration::days(28)).format("%Y-%m-%d").to_string();
    let own = own_store(c);
    let mut add = |store: &str, data: &str| {
        if let Ok(d) = serde_json::from_str::<Value>(data) {
            for l in d["lines"].as_array().cloned().unwrap_or_default() {
                if let Some(e) = l["ean"].as_str() {
                    *sold.entry((store.to_string(), e.to_string())).or_default() += l["qty"].as_f64().unwrap_or(0.0);
                }
            }
        }
    };
    {
        let mut st = c.prepare("SELECT data FROM sales WHERE kind = 'verkauf' AND substr(ts,1,10) >= ?1").map_err(|e| e.to_string())?;
        for d in st.query_map([&since], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?.flatten() {
            add(&own, &d);
        }
        let mut st = c.prepare("SELECT store, data FROM store_sales WHERE kind = 'verkauf' AND substr(ts,1,10) >= ?1").map_err(|e| e.to_string())?;
        for (s2, d) in st.query_map([&since], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?.flatten() {
            add(&s2, &d);
        }
    }
    let names: std::collections::HashMap<String, (String, String, String)> = {
        let mut st = c.prepare("SELECT v.ean, a.name, v.color, v.size FROM variants v JOIN articles a ON a.id = v.article_id WHERE v.active = 1 AND a.active = 1").map_err(|e| e.to_string())?;
        let r = st.query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
        r
    };
    let mut out = vec![];
    for (ean, (name, color, size)) in &names {
        for need in &stores {
            let have = m[need][ean].as_i64().unwrap_or(0);
            let daily = sold.get(&(need.clone(), ean.clone())).copied().unwrap_or(0.0) / 28.0;
            if have > 1 || daily <= 0.0 {
                continue;
            }
            // Spender: meister Bestand, geringster eigener Abverkauf
            let best = stores.iter().filter(|x| *x != need).map(|x| (x, m[x][ean].as_i64().unwrap_or(0), sold.get(&(x.clone(), ean.clone())).copied().unwrap_or(0.0) / 28.0)).filter(|(_, st, d)| *st as f64 > d * 21.0 + 2.0).max_by_key(|(_, st, _)| *st);
            if let Some((from, st, d)) = best {
                let qty = ((daily * 14.0).ceil() as i64).clamp(1, (st as f64 - d * 21.0).floor() as i64);
                out.push(json!({ "ean": ean, "name": name, "color": color, "size": size, "from": from, "to": need, "qty": qty, "have": have, "donor_stock": st,
                    "reason": format!("{need}: Bestand {have}, Abverkauf {:.1}/Woche · {from}: Bestand {st}, Abverkauf {:.1}/Woche – {qty} Stk. decken ca. 2 Wochen", daily * 7.0, d * 7.0) }));
            }
        }
    }
    out.sort_by(|a, b| a["have"].as_i64().cmp(&b["have"].as_i64()));
    Ok(out)
}

/* ══ Zentrale: Schnittstelle für Filialen (läuft im eingebauten Server) ══ */

fn auth_store(c: &Connection, key: &str) -> Option<String> {
    c.query_row("SELECT id FROM stores WHERE key_hash = ?1 AND active = 1", [hash(key.trim())], |r| r.get(0)).optional().ok().flatten()
}

/// Antwort auf /sync/v1/... (nur in der Rolle Zentrale)
pub fn handle(c: &Connection, method: &str, path: &str, key: &str, body: &Value, ip: &str) -> Result<Value, (u16, String)> {
    if rolle(c) != "zentrale" {
        return Err((404, "Diese Installation ist keine Zentrale".into()));
    }
    let store = match auth_store(c, key) {
        Some(x) => x,
        None => {
            let aus: bool = c.query_row("SELECT 1 FROM stores WHERE key_hash = ?1 AND active = 0", [hash(key.trim())], |_| Ok(())).optional().map(|x| x.is_some()).unwrap_or(false);
            return Err((if aus { 403 } else { 401 }, if aus { "Diese Filiale ist in der Zentrale deaktiviert" } else { "Filial-Schlüssel ungültig" }.to_string()));
        }
    };
    let e5 = |e: String| (500u16, e);
    let _ = c.execute("UPDATE stores SET last_sync = ?2, last_ip = ?3 WHERE id = ?1", params![store, db::now(), ip]);
    match (method, path) {
        ("GET", "/sync/v1/hallo") => Ok(json!({ "zentrale": s(c, "verbund.name"), "filiale": store, "zeit": db::now() })),
        ("POST", "/sync/v1/push") => {
            let tx = c.unchecked_transaction().map_err(|e| e5(e.to_string()))?;
            let mut n_sales = 0;
            for x in body["sales"].as_array().cloned().unwrap_or_default() {
                n_sales += tx
                    .execute(
                        "INSERT OR IGNORE INTO store_sales(store, beleg_no, ts, total, kind, cashier, customer_id, data) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                        params![store, x["no"].as_str().unwrap_or(""), x["ts"].as_str().unwrap_or(""), x["total"].as_i64().unwrap_or(0), x["kind"].as_str().unwrap_or("verkauf"),
                            x["cashier"].as_str(), x["customer_id"].as_str(), x["data"].to_string()],
                    )
                    .map_err(|e| e5(e.to_string()))?;
            }
            for x in body["stock"].as_array().cloned().unwrap_or_default() {
                tx.execute(
                    "INSERT INTO store_stock(store, ean, stock, updated_at) VALUES (?1,?2,?3,?4) ON CONFLICT(store, ean) DO UPDATE SET stock=excluded.stock, updated_at=excluded.updated_at",
                    params![store, x["ean"].as_str().unwrap_or(""), x["stock"].as_i64().unwrap_or(0), db::now()],
                )
                .map_err(|e| e5(e.to_string()))?;
            }
            for k in body["customers"].as_array().cloned().unwrap_or_default() {
                let Ok(cu) = serde_json::from_value::<customers::Customer>(k.clone()) else { continue };
                let cur: Option<String> = tx.query_row("SELECT updated_at FROM customers WHERE id = ?1", [&cu.id], |r| r.get(0)).optional().map_err(|e| e5(e.to_string()))?;
                let pushed_at = k["updated_at"].as_str().unwrap_or("");
                if cur.as_deref().map(|c2| pushed_at > c2).unwrap_or(true) {
                    customers::save(&tx, &cu).map_err(|e| (400, e))?;
                    tx.execute("UPDATE customers SET updated_at = ?2 WHERE id = ?1", params![cu.id, if pushed_at.is_empty() { db::now() } else { pushed_at.to_string() }]).map_err(|e| e5(e.to_string()))?;
                }
            }
            for p in body["points"].as_array().cloned().unwrap_or_default() {
                let lid = p["id"].as_i64().unwrap_or(0);
                let fresh = tx.execute("INSERT OR IGNORE INTO store_points(store, log_id) VALUES (?1,?2)", params![store, lid]).map_err(|e| e5(e.to_string()))?;
                if fresh == 1 {
                    let _ = customers::book_points(&tx, p["customer"].as_str().unwrap_or(""), p["delta"].as_i64().unwrap_or(0), &format!("{} ({store})", p["reason"].as_str().unwrap_or("")), p["ref"].as_str(), p["user"].as_str());
                }
            }
            if let Some(info) = body.get("info") {
                tx.execute("UPDATE stores SET info = ?2 WHERE id = ?1", params![store, info.to_string()]).map_err(|e| e5(e.to_string()))?;
            }
            db::audit_append(&tx, "verbund.push", &json!({ "filiale": store, "belege": n_sales })).map_err(|e| e5(e.to_string()))?;
            tx.commit().map_err(|e| e5(e.to_string()))?;
            Ok(json!({ "ok": true, "belege": n_sales }))
        }
        ("POST", "/sync/v1/pull") => {
            let since = body["since"].as_str().unwrap_or("");
            let ids: Vec<String> = {
                let mut st = c.prepare("SELECT id FROM articles WHERE updated_at > ?1").map_err(|e| e5(e.to_string()))?;
                let r = st.query_map([since], |r| r.get(0)).map_err(|e| e5(e.to_string()))?.filter_map(Result::ok).collect();
                r
            };
            let arts: Vec<catalog::Article> = catalog::list(c).map_err(|e| e5(e.to_string()))?.into_iter().filter(|a| ids.contains(&a.id)).collect();
            let gone: Vec<String> = {
                let mut st = c.prepare("SELECT id FROM articles WHERE active = 0 AND updated_at > ?1").map_err(|e| e5(e.to_string()))?;
                let r = st.query_map([since], |r| r.get(0)).map_err(|e| e5(e.to_string()))?.filter_map(Result::ok).collect();
                r
            };
            let custs: Vec<Value> = {
                let mut st = c.prepare("SELECT id, points, updated_at FROM customers WHERE updated_at > ?1 AND active = 1").map_err(|e| e5(e.to_string()))?;
                let rows: Vec<(String, i64, String)> = st.query_map([since], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(|e| e5(e.to_string()))?.filter_map(Result::ok).collect();
                rows.into_iter()
                    .filter_map(|(id, pts, up)| customers::get(c, &id).ok().flatten().map(|k| { let mut v = serde_json::to_value(k).unwrap_or(Value::Null); v["points"] = json!(pts); v["updated_at"] = json!(up); v }))
                    .collect()
            };
            let promos: Vec<Value> = {
                let mut st = c.prepare("SELECT id, name, pct, scope, scope_values, from_date, to_date, active FROM promotions").map_err(|e| e5(e.to_string()))?;
                let r = st
                    .query_map([], |r| Ok(json!({ "id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?, "pct": r.get::<_, i64>(2)?, "scope": r.get::<_, String>(3)?, "scope_values": r.get::<_, String>(4)?, "from_date": r.get::<_, String>(5)?, "to_date": r.get::<_, String>(6)?, "active": r.get::<_, i64>(7)? })))
                    .map_err(|e| e5(e.to_string()))?
                    .filter_map(Result::ok)
                    .collect();
                r
            };
            let suppliers = crate::purchasing::suppliers(c).map_err(|e| e5(e.to_string()))?;
            let umsatz = overview(c).map_err(e5)?["stores"].clone();
            let mut stores_list = umsatz.clone();
            if let Some(a) = stores_list.as_array_mut() {
                for x in a.iter_mut() {
                    *x = json!({ "id": x["id"], "name": x["name"], "addr": x["addr"], "active": x["active"] });
                }
            }
            Ok(json!({ "now": db::now(), "articles": arts, "inactive": gone, "customers": custs, "promotions": promos, "suppliers": suppliers,
                "stores": stores_list, "stock": stock_matrix(c).map_err(e5)?, "transfers": transfers(c, Some(&store)).map_err(|e| e5(e.to_string()))?,
                "firma": { "name": s(c, "firma.name") }, "umsatz": umsatz,
                "einstellungen": SHARED.iter().filter_map(|k| db::setting_get(c, k).map(|v| (k.to_string(), v))).collect::<serde_json::Map<String, Value>>(),
                "stammdaten": crate::filiale::all_for(c, &store).map_err(e5)? }))
        }
        ("POST", "/sync/v1/umlagerung") => {
            let t = transfer_create(c, body["from"].as_str().unwrap_or(""), body["to"].as_str().unwrap_or(&store), &body["lines"], body["note"].as_str().unwrap_or(""), body["user"].as_str().unwrap_or(&store)).map_err(|e| (400, e))?;
            let _ = db::audit_append(c, "verbund.transfer.created", &json!({ "nr": t["no"], "filiale": store }));
            Ok(t)
        }
        ("POST", "/sync/v1/umlagerung/status") => {
            let own = own_store(c);
            let t = transfer_status(c, body["no"].as_str().unwrap_or(""), body["status"].as_str().unwrap_or(""), &store, &own, body["user"].as_str().unwrap_or(&store)).map_err(|e| (400, e))?;
            let _ = db::audit_append(c, "verbund.transfer.status", &json!({ "nr": t["no"], "status": t["status"], "filiale": store }));
            Ok(t)
        }
        _ => Err((404, "Unbekannt".into())),
    }
}

/* ══ Filiale: Abgleich mit der Zentrale ══ */

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(Duration::from_secs(25)).build()
}
fn call(c: &Connection, path: &str, body: &Value) -> Result<Value, String> {
    let url = s(c, "verbund.url");
    let key = s(c, "verbund.schluessel");
    if url.is_empty() || key.is_empty() {
        return Err("Zentrale nicht eingerichtet".into());
    }
    let full = format!("{}{}", url.trim_end_matches('/'), path);
    let r = if path.ends_with("hallo") { agent().get(&full).set("X-Kontor-Filiale", &key).call() } else { agent().post(&full).set("X-Kontor-Filiale", &key).send_json(body.clone()) };
    match r {
        Ok(resp) => resp.into_json::<Value>().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, resp)) => Err(resp.into_json::<Value>().ok().and_then(|v| v["fehler"].as_str().map(str::to_string)).unwrap_or_else(|| format!("Zentrale antwortet mit {code}"))),
        Err(e) => Err(format!("Zentrale nicht erreichbar: {e}")),
    }
}

/// Verbindung testen (Filiale)
pub fn hello(c: &Connection) -> Result<Value, String> {
    call(c, "/sync/v1/hallo", &Value::Null)
}

/// Ein Abgleich: erst senden, dann holen. Gibt Zusammenfassung zurück.
pub fn sync_once(c: &Connection) -> Result<Value, String> {
    if rolle(c) != "filiale" {
        return Err("Nur in der Rolle Filiale".into());
    }
    // 1 · senden
    let (sale_cur, pts_cur, move_cur) = (n(c, "verbund.c_sale"), n(c, "verbund.c_points"), n(c, "verbund.c_move"));
    let cust_cur = s(c, "verbund.c_cust");
    let mut sales = vec![];
    let mut last_sale = sale_cur;
    {
        let mut st = c.prepare(&format!("SELECT id, {} FROM sales WHERE id > ?1 ORDER BY id LIMIT 300", catalog::SALE_COLS)).map_err(|e| e.to_string())?;
        let rows = st.query_map([sale_cur], |r| Ok((r.get::<_, i64>(0)?, json!({ "no": r.get::<_, String>(1)?, "ts": r.get::<_, String>(2)?, "total": r.get::<_, i64>(3)?, "cashier": r.get::<_, Option<String>>(4)?,
            "data": serde_json::from_str::<Value>(&r.get::<_, String>(5)?).unwrap_or(Value::Null), "kind": r.get::<_, String>(6)?, "customer_id": r.get::<_, Option<String>>(9)? })))).map_err(|e| e.to_string())?;
        for (id, v) in rows.flatten() {
            last_sale = id;
            sales.push(v);
        }
    }
    let (mut stock, mut last_move) = (vec![], move_cur);
    {
        let max_move: i64 = c.query_row("SELECT COALESCE(MAX(id),0) FROM stock_moves", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        let sql = if move_cur == 0 { "SELECT ean, stock FROM variants WHERE active = 1" } else { "SELECT DISTINCT v.ean, v.stock FROM stock_moves m JOIN variants v ON v.id = m.variant_id WHERE m.id > ?1" };
        let mut st = c.prepare(sql).map_err(|e| e.to_string())?;
        let f = |r: &rusqlite::Row| Ok(json!({ "ean": r.get::<_, String>(0)?, "stock": r.get::<_, i64>(1)? }));
        let rows: Vec<Value> = if move_cur == 0 { st.query_map([], f).map_err(|e| e.to_string())?.flatten().collect() } else { st.query_map([move_cur], f).map_err(|e| e.to_string())?.flatten().collect() };
        stock.extend(rows);
        last_move = last_move.max(max_move);
    }
    let (mut points, mut last_pts) = (vec![], pts_cur);
    {
        let mut st = c.prepare("SELECT id, customer_id, delta, reason, ref, user FROM points_log WHERE id > ?1 ORDER BY id LIMIT 1000").map_err(|e| e.to_string())?;
        let rows = st.query_map([pts_cur], |r| Ok((r.get::<_, i64>(0)?, json!({ "id": r.get::<_, i64>(0)?, "customer": r.get::<_, String>(1)?, "delta": r.get::<_, i64>(2)?, "reason": r.get::<_, String>(3)?, "ref": r.get::<_, Option<String>>(4)?, "user": r.get::<_, Option<String>>(5)? })))).map_err(|e| e.to_string())?;
        for (id, v) in rows.flatten() {
            last_pts = id;
            points.push(v);
        }
    }
    let mut custs = vec![];
    let push_started = db::now();
    {
        let mut st = c.prepare("SELECT id, updated_at FROM customers WHERE updated_at > ?1 AND active = 1 AND updated_at <> COALESCE((SELECT updated_at FROM verbund_pulled WHERE customer_id = customers.id), '')").map_err(|e| e.to_string())?;
        let rows: Vec<(String, String)> = st.query_map([&cust_cur], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
        for (id, up) in rows {
            if let Some(k) = customers::get(c, &id).map_err(|e| e.to_string())? {
                let mut v = serde_json::to_value(k).unwrap_or(Value::Null);
                v["updated_at"] = json!(up);
                custs.push(v);
            }
        }
    }
    let info = json!({ "version": env!("CARGO_PKG_VERSION"), "kasse": s(c, "kasse.id"), "belege_offen": c.query_row("SELECT COUNT(*) FROM sales WHERE id > ?1", [last_sale], |r| r.get::<_, i64>(0)).unwrap_or(0) });
    let pushed = call(c, "/sync/v1/push", &json!({ "sales": sales, "stock": stock, "points": points, "customers": custs, "info": info }))?;
    set(c, "verbund.c_sale", json!(last_sale));
    set(c, "verbund.c_move", json!(last_move));
    set(c, "verbund.c_points", json!(last_pts));
    set(c, "verbund.c_cust", json!(push_started));

    // 2 · holen
    let since = s(c, "verbund.c_pull");
    let p = call(c, "/sync/v1/pull", &json!({ "since": since }))?;
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut n_art = 0;
    for a in p["articles"].as_array().cloned().unwrap_or_default() {
        if let Ok(art) = serde_json::from_value::<catalog::Article>(a) {
            catalog::save(&tx, &art).map_err(|e| format!("Artikel {}: {e}", art.id))?;
            n_art += 1;
        }
    }
    for id in p["inactive"].as_array().cloned().unwrap_or_default() {
        let _ = catalog::deactivate(&tx, id.as_str().unwrap_or(""));
    }
    let mut n_cust = 0;
    for k in p["customers"].as_array().cloned().unwrap_or_default() {
        if let Ok(cu) = serde_json::from_value::<customers::Customer>(k.clone()) {
            customers::save(&tx, &cu).map_err(|e| format!("Kunde {}: {e}", cu.id))?;
            let up = k["updated_at"].as_str().unwrap_or("").to_string();
            tx.execute("UPDATE customers SET points = ?2, updated_at = ?3 WHERE id = ?1", params![cu.id, k["points"].as_i64().unwrap_or(0), up]).map_err(|e| e.to_string())?;
            tx.execute("INSERT OR REPLACE INTO verbund_pulled(customer_id, updated_at) VALUES (?1,?2)", params![cu.id, up]).map_err(|e| e.to_string())?;
            n_cust += 1;
        }
    }
    if let Some(ps) = p["promotions"].as_array() {
        tx.execute("DELETE FROM promotions", []).map_err(|e| e.to_string())?;
        for x in ps {
            tx.execute(
                "INSERT INTO promotions(id, name, pct, scope, scope_values, from_date, to_date, active, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
                params![x["id"].as_i64(), x["name"].as_str(), x["pct"].as_i64(), x["scope"].as_str(), x["scope_values"].as_str(), x["from_date"].as_str(), x["to_date"].as_str(), x["active"].as_i64(), db::now()],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    // gemeinsame Einstellungen der Zentrale (Rabattregeln, Rückgabegründe, Order-Typen …)
    if let Some(m) = p["einstellungen"].as_object() {
        for (k, v) in m.iter().filter(|(k, _)| SHARED.contains(&k.as_str())) {
            db::setting_set(&tx, k, v).map_err(|e| e.to_string())?;
        }
    }
    // Stammdaten-Tabellen der Zentrale (Marken, Saisons, Hausfarben, Vorlagen …) – lokale Tabellen bleiben
    if let Some(m) = p["stammdaten"].as_object() {
        for (k, rows) in m.iter().filter(|(k, _)| !crate::stamm::LOCAL.contains(&k.as_str())) {
            crate::stamm::write_rows(&tx, k, rows.as_array().map(|a| a.as_slice()).unwrap_or(&[]))?;
        }
    }
    // die eigene Filial-Zeile (Name, Adresse, UID, Bank …) gilt ab jetzt für Belege, Bon und Anzeige dieser Kasse
    crate::filiale::apply_own(&tx)?;
    if let Some(sp) = p["suppliers"].as_array() {
        for x in sp {
            if let Ok(su) = serde_json::from_value::<crate::purchasing::Supplier>(x.clone()) {
                let _ = crate::purchasing::supplier_save(&tx, &su);
            }
        }
    }
    if let Some(m) = p["stock"].as_object() {
        let own = own_store(c);
        tx.execute("DELETE FROM store_stock WHERE store <> ?1", [&own]).map_err(|e| e.to_string())?;
        for (store, eans) in m {
            if *store == own {
                continue;
            }
            for (ean, q) in eans.as_object().cloned().unwrap_or_default() {
                tx.execute("INSERT OR REPLACE INTO store_stock(store, ean, stock, updated_at) VALUES (?1,?2,?3,?4)", params![store, ean, q.as_i64().unwrap_or(0), db::now()]).map_err(|e| e.to_string())?;
            }
        }
    }
    if let Some(ts) = p["transfers"].as_array() {
        for t in ts {
            tx.execute(
                "INSERT INTO transfers(no, from_store, to_store, status, lines, note, created_at, updated_at, user) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
                 ON CONFLICT(no) DO UPDATE SET status = excluded.status, lines = excluded.lines, note = excluded.note, updated_at = excluded.updated_at",
                params![t["no"].as_str(), t["from"].as_str(), t["to"].as_str(), t["status"].as_str(), t["lines"].to_string(), t["note"].as_str().unwrap_or(""), t["created_at"].as_str(), t["updated_at"].as_str(), t["user"].as_str()],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    db::setting_set(&tx, "verbund.stores", &p["stores"]).map_err(|e| e.to_string())?;
    db::setting_set(&tx, "verbund.umsatz", &p["umsatz"]).map_err(|e| e.to_string())?;
    db::setting_set(&tx, "verbund.c_pull", &p["now"]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    let summary = json!({ "ok": true, "zeit": db::now(), "gesendet": { "belege": sales.len(), "bestaende": stock.len(), "punkte": points.len(), "kunden": custs.len(), "angenommen": pushed["belege"] },
        "geholt": { "artikel": n_art, "kunden": n_cust } });
    set(c, "verbund.status", summary.clone());
    Ok(summary)
}

/// Filiale: Umlagerung in der Zentrale anfordern / Status melden (online), lokale Buchung danach
pub fn remote_transfer(c: &Connection, body: &Value) -> Result<Value, String> {
    call(c, "/sync/v1/umlagerung", body)
}
pub fn remote_transfer_status(c: &Connection, no: &str, status: &str, user: &str) -> Result<Value, String> {
    let t = call(c, "/sync/v1/umlagerung/status", &json!({ "no": no, "status": status, "user": user }))?;
    // lokal buchen, wenn diese Filiale betroffen ist (Status in der Zentrale ist bereits gesetzt)
    let own = own_store(c);
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO transfers(no, from_store, to_store, status, lines, note, created_at, updated_at, user) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(no) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at",
        params![t["no"].as_str(), t["from"].as_str(), t["to"].as_str(), t["status"].as_str(), t["lines"].to_string(), t["note"].as_str().unwrap_or(""), t["created_at"].as_str(), t["updated_at"].as_str(), t["user"].as_str()],
    )
    .map_err(|e| e.to_string())?;
    let (from, to) = (t["from"].as_str().unwrap_or(""), t["to"].as_str().unwrap_or(""));
    if (status == "versendet" && own == from) || (status == "empfangen" && own == to) {
        let sign = if status == "versendet" { -1 } else { 1 };
        let col = if sign < 0 { "booked_out" } else { "booked_in" };
        let done: i64 = tx.query_row(&format!("SELECT {col} FROM transfers WHERE no = ?1"), [no], |r| r.get(0)).map_err(|e| e.to_string())?;
        if done == 0 {
            for l in t["lines"].as_array().cloned().unwrap_or_default() {
                if let Some(vid) = tx.query_row("SELECT id FROM variants WHERE ean = ?1", [l["ean"].as_str().unwrap_or("")], |r| r.get::<_, i64>(0)).optional().map_err(|e| e.to_string())? {
                    catalog::book(&tx, vid, sign * l["qty"].as_i64().unwrap_or(0), false, &format!("Umlagerung {no}"), Some(no), Some(user))?;
                }
            }
            tx.execute(&format!("UPDATE transfers SET {col} = 1 WHERE no = ?1"), [no]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(t)
}

/// Hintergrund-Dienst der Filiale: alle 30 s abgleichen (eigene Datenbankverbindung)
pub fn start_worker(db_path: PathBuf) {
    std::thread::spawn(move || {
        let Ok(c) = db::open(&db_path) else { return };
        let _ = c.busy_timeout(Duration::from_secs(10));
        loop {
            if rolle(&c) == "filiale" && !s(&c, "verbund.url").is_empty() {
                if let Err(e) = sync_once(&c) {
                    let mut st = db::setting_get(&c, "verbund.status").unwrap_or(json!({}));
                    st["ok"] = json!(false);
                    st["fehler"] = json!(e);
                    st["fehler_zeit"] = json!(db::now());
                    set(&c, "verbund.status", st);
                }
            }
            for _ in 0..30 {
                std::thread::sleep(Duration::from_secs(1));
                if s(&c, "verbund.jetzt") == "1" {
                    set(&c, "verbund.jetzt", json!(""));
                    break;
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn umlagerung_bucht_aus_und_ein() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        db::setting_set(&c, "verbund.rolle", &json!("zentrale")).unwrap();
        db::setting_set(&c, "verbund.filiale", &json!("ZEN")).unwrap();
        let tx = c.unchecked_transaction().unwrap();
        let a = catalog::Article {
            id: "T1".into(), name: "Test".into(), brand: String::new(), category: "acc".into(), glyph: String::new(), price: 1000, sale_price: None, vat: 20, tag: None, popularity: 0,
            colors: vec!["rot".into()], sizes: vec!["M".into()], fields: json!({}), prompts: Value::Null, active: true,
            variants: vec![catalog::Variant { id: None, color: "rot".into(), size: "M".into(), ean: "2000000000015".into(), stock: 0 }], cost: None, supplier_id: None, min_stock: 2, image: None, details: serde_json::Value::Null, media: vec![],
        };
        catalog::save(&tx, &a).unwrap();
        let vid: i64 = tx.query_row("SELECT id FROM variants WHERE ean = '2000000000015'", [], |r| r.get(0)).unwrap();
        catalog::book(&tx, vid, 10, true, "Start", None, None).unwrap();
        tx.commit().unwrap();
        let key = store_create(&c, "sbg", "Salzburg", "").unwrap();
        assert!(key.starts_with("kfil_"));
        assert!(handle(&c, "GET", "/sync/v1/hallo", "falsch", &Value::Null, "").is_err());
        // Filiale meldet Beleg und Bestand
        let r = handle(&c, "POST", "/sync/v1/push", &key, &json!({ "sales": [{ "no": "2026-000001", "ts": db::now(), "total": 1000, "kind": "verkauf", "data": { "lines": [{ "ean": "2000000000015", "qty": 1 }] } }], "stock": [{ "ean": "2000000000015", "stock": 0 }] }), "").unwrap();
        assert_eq!(r["belege"], 1);
        assert_eq!(handle(&c, "POST", "/sync/v1/push", &key, &json!({ "sales": [{ "no": "2026-000001", "ts": db::now(), "total": 1000, "kind": "verkauf", "data": {} }] }), "").unwrap()["belege"], 0);
        let m = stock_matrix(&c).unwrap();
        assert_eq!((m["ZEN"]["2000000000015"].as_i64(), m["SBG"]["2000000000015"].as_i64()), (Some(10), Some(0)));
        let sug = suggestions(&c).unwrap();
        assert_eq!((sug[0]["from"].as_str(), sug[0]["to"].as_str()), (Some("ZEN"), Some("SBG")));
        // Umlagerung Zentrale → Salzburg
        let t = transfer_create(&c, "ZEN", "SBG", &json!([{ "ean": "2000000000015", "qty": 3, "name": "Test" }]), "", "dh").unwrap();
        let no = t["no"].as_str().unwrap().to_string();
        assert!(transfer_status(&c, &no, "empfangen", "SBG", "ZEN", "x").is_err());
        transfer_status(&c, &no, "versendet", "ZEN", "ZEN", "dh").unwrap();
        let st: i64 = c.query_row("SELECT stock FROM variants WHERE id = ?1", [vid], |r| r.get(0)).unwrap();
        assert_eq!(st, 7);
        let t = handle(&c, "POST", "/sync/v1/umlagerung/status", &key, &json!({ "no": no, "status": "empfangen" }), "").unwrap();
        assert_eq!(t["status"], "empfangen");
        let pull = handle(&c, "POST", "/sync/v1/pull", &key, &json!({ "since": "" }), "").unwrap();
        assert_eq!(pull["articles"].as_array().unwrap().len(), 1);
        assert_eq!(pull["transfers"].as_array().unwrap().len(), 1);
    }
}
