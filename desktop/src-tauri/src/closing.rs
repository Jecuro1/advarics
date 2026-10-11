//! Kassenbuch (Einlage, Entnahme, Wechselgeld) und Tagesabschluss (Z-Bericht mit Kassensturz).
//! Ein Abschluss umfasst alles seit dem vorigen Abschluss. Der gezählte Bargeldbestand wird als
//! Übertrag in den nächsten Zeitraum übernommen.

use crate::db;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

fn cents(v: &Value) -> i64 {
    (v.as_f64().unwrap_or(0.0) * 100.0).round() as i64
}

/// Beginn des laufenden Zeitraums: Zeitpunkt und letzter Beleg (id) des vorigen Abschlusses.
fn period_start(c: &Connection) -> Result<(Option<String>, i64), String> {
    let r: Option<(String, String)> = c.query_row("SELECT ts, data FROM closings ORDER BY id DESC LIMIT 1", [], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|e| e.to_string())?;
    Ok(match r {
        Some((ts, d)) => (Some(ts), serde_json::from_str::<Value>(&d).ok().and_then(|v| v["last_id"].as_i64()).unwrap_or(0)),
        None => (None, 0),
    })
}

pub fn cash_move(c: &Connection, kind: &str, amount: i64, reason: &str, user: Option<&str>) -> Result<i64, String> {
    if !["einlage", "entnahme", "anfang"].contains(&kind) {
        return Err("Unbekannte Buchungsart".into());
    }
    if amount <= 0 {
        return Err("Betrag muss größer als 0 sein".into());
    }
    if reason.trim().is_empty() {
        return Err("Grund fehlt".into());
    }
    let signed = if kind == "entnahme" { -amount } else { amount };
    if kind == "entnahme" {
        let exp = summary(c)?["cash"]["expected"].as_i64().unwrap_or(0);
        if exp + signed < 0 {
            return Err(format!("Entnahme übersteigt den Bargeldbestand ({},{:02} €)", exp / 100, exp % 100));
        }
    }
    c.execute("INSERT INTO cash_moves(ts, kind, amount, reason, user) VALUES (?1,?2,?3,?4,?5)", params![db::now(), kind, signed, reason.trim(), user])
        .map_err(|e| e.to_string())?;
    Ok(c.last_insert_rowid())
}

/// Laufender Zeitraum: Umsätze, Steuern, Zahlungsarten, Kassenbuch, erwarteter Bargeldbestand.
pub fn summary(c: &Connection) -> Result<Value, String> {
    let (from, after_id) = period_start(c)?;
    let mut st = c
        .prepare("SELECT beleg_no, total, kind, cashier, data, id FROM sales WHERE id > ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([after_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, String>(4)?, r.get::<_, i64>(5)?)))
        .map_err(|e| e.to_string())?;
    let mut last_id = after_id;
    let (mut n_sale, mut n_ret, mut n_sto, mut n_zero) = (0i64, 0i64, 0i64, 0i64);
    let (mut revenue, mut gross_sales, mut refunds, mut discounts, mut vouchers_sold, mut vouchers_redeemed) = (0i64, 0i64, 0i64, 0i64, 0i64, 0i64);
    let mut vat: BTreeMap<i64, (i64, i64, i64)> = BTreeMap::new();
    let mut pay: BTreeMap<String, (String, i64, i64)> = BTreeMap::new();
    let mut cashiers: BTreeMap<String, (i64, i64)> = BTreeMap::new();
    let (mut first, mut last) = (None::<String>, None::<String>);
    let mut bar = 0i64;
    for row in rows {
        let (no, total, kind, cashier, data, id) = row.map_err(|e| e.to_string())?;
        last_id = id;
        let d: Value = serde_json::from_str(&data).unwrap_or(Value::Null);
        if first.is_none() {
            first = Some(no.clone());
        }
        last = Some(no.clone());
        match kind.as_str() {
            "verkauf" => {
                n_sale += 1;
                gross_sales += total;
                discounts += cents(&d["t"]["disc"]);
                vouchers_sold += cents(&d["t"]["zero"]);
            }
            "retoure" => {
                n_ret += 1;
                refunds += -total
            }
            "storno" => {
                n_sto += 1;
                refunds += -total
            }
            _ => n_zero += 1,
        }
        revenue += total;
        let e = cashiers.entry(cashier.unwrap_or_default()).or_insert((0, 0));
        e.0 += total;
        if kind == "verkauf" {
            e.1 += 1;
        }
        for v in d["t"]["vat"].as_array().into_iter().flatten() {
            let x = vat.entry(v["rate"].as_i64().unwrap_or(20)).or_insert((0, 0, 0));
            x.0 += cents(&v["gross"]);
            x.1 += cents(&v["net"]);
            x.2 += cents(&v["tax"]);
        }
        let z = cents(&d["t"]["zero"]);
        if z != 0 {
            let x = vat.entry(0).or_insert((0, 0, 0));
            x.0 += z;
            x.1 += z;
        }
        for p in d["parts"].as_array().into_iter().flatten() {
            let m = p["m"].as_str().unwrap_or("?").to_string();
            let amt = cents(&p["amount"]);
            let e = pay.entry(m.clone()).or_insert((p["label"].as_str().unwrap_or("").to_string(), 0, 0));
            e.1 += amt;
            e.2 += 1;
            if m == "bar" {
                bar += amt;
            }
            if m == "gutschein" && kind == "verkauf" {
                vouchers_redeemed += amt;
            }
        }
    }
    let mut moves = vec![];
    let (mut anfang, mut einlagen, mut entnahmen) = (0i64, 0i64, 0i64);
    {
        let mut st = c.prepare("SELECT ts, kind, amount, reason, user FROM cash_moves WHERE closing_id IS NULL ORDER BY id").map_err(|e| e.to_string())?;
        let it = st
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, String>(3)?, r.get::<_, Option<String>>(4)?)))
            .map_err(|e| e.to_string())?;
        for m in it {
            let (ts, kind, amount, reason, user) = m.map_err(|e| e.to_string())?;
            match kind.as_str() {
                "anfang" => anfang += amount,
                "einlage" => einlagen += amount,
                _ => entnahmen += -amount,
            }
            moves.push(json!({ "ts": ts, "kind": kind, "amount": amount, "reason": reason, "user": user }));
        }
    }
    let expected = anfang + einlagen - entnahmen + bar;
    Ok(json!({
        "from": from, "first": first, "last": last, "last_id": last_id,
        "counts": { "sales": n_sale, "returns": n_ret, "stornos": n_sto, "other": n_zero },
        "revenue": revenue, "gross_sales": gross_sales, "refunds": refunds, "discounts": discounts,
        "vouchers_sold": vouchers_sold, "vouchers_redeemed": vouchers_redeemed,
        "vat": vat.iter().rev().map(|(r, (g, n, t))| json!({ "rate": r, "gross": g, "net": n, "tax": t })).collect::<Vec<_>>(),
        "payments": pay.iter().map(|(m, (l, a, n))| json!({ "m": m, "label": l, "amount": a, "count": n })).collect::<Vec<_>>(),
        "cashiers": cashiers.iter().map(|(n, (a, b))| json!({ "name": n, "revenue": a, "sales": b })).collect::<Vec<_>>(),
        "cash": { "start": anfang, "deposits": einlagen, "withdrawals": entnahmen, "sales": bar, "expected": expected },
        "moves": moves
    }))
}

/// Tagesabschluss: Zeitraum festschreiben, Differenz aus Kassensturz, Übertrag für den nächsten Tag.
pub fn close(tx: &Transaction, counted: i64, note: &str, user: Option<&str>) -> Result<Value, String> {
    if counted < 0 {
        return Err("Gezählter Betrag ungültig".into());
    }
    let mut s = summary(tx)?;
    let expected = s["cash"]["expected"].as_i64().unwrap_or(0);
    let no: i64 = tx
        .query_row("UPDATE counters SET value = value + 1 WHERE name = 'abschluss' RETURNING value", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let ts = db::now();
    let turnover: Option<i64> = tx.query_row("SELECT turnover FROM rksv WHERE id = 1", [], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    if let Value::Object(m) = &mut s {
        m.insert("no".into(), json!(no));
        m.insert("ts".into(), json!(ts));
        m.insert("counted".into(), json!(counted));
        m.insert("diff".into(), json!(counted - expected));
        m.insert("note".into(), json!(note));
        m.insert("user".into(), json!(user));
        m.insert("rksv_turnover".into(), json!(turnover));
    }
    let from = s["from"].as_str().map(str::to_string).unwrap_or_else(|| "Beginn".into());
    tx.execute(
        "INSERT INTO closings(no, ts, from_ts, expected, counted, diff, user, data) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![no, ts, from, expected, counted, counted - expected, user, s.to_string()],
    )
    .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    tx.execute("UPDATE cash_moves SET closing_id = ?1 WHERE closing_id IS NULL", [id]).map_err(|e| e.to_string())?;
    if counted > 0 {
        tx.execute("INSERT INTO cash_moves(ts, kind, amount, reason, user) VALUES (?1,'anfang',?2,?3,?4)", params![ts, counted, format!("Übertrag aus Abschluss {no}"), user])
            .map_err(|e| e.to_string())?;
    }
    Ok(s)
}

pub fn list(c: &Connection, limit: i64) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare("SELECT no, ts, from_ts, expected, counted, diff, user, data FROM closings ORDER BY id DESC LIMIT ?1")?;
    let rows = st.query_map([limit], |r| {
        let d: Value = serde_json::from_str(&r.get::<_, String>(7)?).unwrap_or(Value::Null);
        let mut m = Map::new();
        m.insert("no".into(), json!(r.get::<_, i64>(0)?));
        m.insert("ts".into(), json!(r.get::<_, String>(1)?));
        m.insert("from".into(), json!(r.get::<_, String>(2)?));
        m.insert("expected".into(), json!(r.get::<_, i64>(3)?));
        m.insert("counted".into(), json!(r.get::<_, i64>(4)?));
        m.insert("diff".into(), json!(r.get::<_, i64>(5)?));
        m.insert("user".into(), json!(r.get::<_, Option<String>>(6)?));
        m.insert("data".into(), d);
        Ok(Value::Object(m))
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kassensturz_und_uebertrag() {
        let mut c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        cash_move(&c, "anfang", 10000, "Wechselgeld", Some("T")).unwrap();
        c.execute("INSERT INTO sales(beleg_no, ts, total, data) VALUES ('2026-000001', ?1, 2500, ?2)", params![db::now(), json!({ "t": { "vat": [{ "rate": 20, "gross": 25.0, "net": 20.83, "tax": 4.17 }] }, "parts": [{ "m": "bar", "label": "Bar", "amount": 25.0 }] }).to_string()]).unwrap();
        assert!(cash_move(&c, "entnahme", 50000, "Bank", Some("T")).is_err());
        cash_move(&c, "entnahme", 5000, "Bank", Some("T")).unwrap();
        let s = summary(&c).unwrap();
        assert_eq!(s["cash"]["expected"], json!(7500));
        assert_eq!(s["vat"][0]["tax"], json!(417));
        let tx = c.transaction().unwrap();
        let z = close(&tx, 7400, "", Some("T")).unwrap();
        tx.commit().unwrap();
        assert_eq!(z["diff"], json!(-100));
        let s2 = summary(&c).unwrap();
        assert_eq!(s2["cash"]["expected"], json!(7400));
        assert_eq!(s2["counts"]["sales"], json!(0));
    }
}
