//! Retouren, Stornos und Auswertungen.
//! Erstattungsbeträge rechnet ausschließlich die Datenbank-Seite aus dem gespeicherten Originalbeleg –
//! die Oberfläche schickt nur „welche Position, wie viele Stück“.

use crate::{catalog, customers, db};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

fn cents(v: &Value) -> i64 {
    (v.as_f64().unwrap_or(0.0) * 100.0).round() as i64
}
fn eur(c: i64) -> f64 {
    c as f64 / 100.0
}

/// Effektiver Betrag einer Belegposition in Cent (nach Positions- und anteiligem Bonrabatt).
fn line_effective(line: &Value, bill_pct: f64) -> i64 {
    let qty = line["qty"].as_i64().unwrap_or(0);
    let gross = (line["unit"].as_f64().unwrap_or(0.0) * 100.0 * qty as f64).round() as i64;
    let ldisc = line["disc"]["pct"].as_f64().map(|p| (gross as f64 * p / 100.0).round() as i64).unwrap_or(0);
    let after = gross - ldisc;
    let vat = line["vat"].as_i64().unwrap_or(20);
    // „nodisc“: Artikel eines Lieferanten mit Rabattsperre – der Bon-Rabatt hat die Position nie erfasst
    let locked = line["nodisc"].as_bool().unwrap_or(false);
    if vat > 0 && bill_pct > 0.0 && !locked {
        after - (after as f64 * bill_pct / 100.0).round() as i64
    } else {
        after
    }
}

struct Orig {
    no: String,
    total: i64,
    kind: String,
    voided: bool,
    customer: Option<String>,
    data: Value,
}

fn load(c: &Connection, no: &str) -> Result<Orig, String> {
    c.query_row("SELECT beleg_no, total, kind, voided, customer_id, data FROM sales WHERE beleg_no = ?1", [no], |r| {
        Ok(Orig {
            no: r.get(0)?,
            total: r.get(1)?,
            kind: r.get(2)?,
            voided: r.get::<_, i64>(3)? != 0,
            customer: r.get(4)?,
            data: serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or(Value::Null),
        })
    })
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Beleg {no} nicht gefunden"))
}

/// Bereits retournierte Stück je Position sowie bereits erstattete Summe (Cent, positiv).
fn returned(c: &Connection, no: &str) -> Result<(HashMap<usize, i64>, i64), String> {
    let mut st = c.prepare("SELECT total, data FROM sales WHERE ref_no = ?1 AND kind IN ('retoure','storno')").map_err(|e| e.to_string())?;
    let rows = st
        .query_map([no], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    let mut sum = 0;
    for row in rows {
        let (total, data) = row.map_err(|e| e.to_string())?;
        sum += -total;
        let d: Value = serde_json::from_str(&data).unwrap_or(Value::Null);
        for l in d["lines"].as_array().into_iter().flatten() {
            if let Some(i) = l["idx"].as_u64() {
                *map.entry(i as usize).or_insert(0) += l["qty"].as_i64().unwrap_or(0);
            }
        }
    }
    Ok((map, sum))
}

/// Beleg mit Retourenstand – für den Retouren-Dialog.
pub fn sale_get(c: &Connection, no: &str) -> Result<Value, String> {
    let row = c
        .query_row(&format!("SELECT {} FROM sales WHERE beleg_no = ?1", catalog::SALE_COLS), [no], catalog::sale_row)
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Beleg {no} nicht gefunden"))?;
    let (map, sum) = returned(c, no)?;
    let bill = row["data"]["billDisc"]["pct"].as_f64().unwrap_or(0.0);
    let eff: Vec<i64> = row["data"]["lines"].as_array().into_iter().flatten().map(|l| line_effective(l, bill)).collect();
    let mut follow = vec![];
    {
        let mut st = c
            .prepare(&format!("SELECT {} FROM sales WHERE ref_no = ?1 ORDER BY id", catalog::SALE_COLS))
            .map_err(|e| e.to_string())?;
        for r in st.query_map([no], catalog::sale_row).map_err(|e| e.to_string())? {
            follow.push(r.map_err(|e| e.to_string())?);
        }
    }
    Ok(json!({ "sale": row, "returned": map, "refunded": sum, "effective": eff, "follow": follow }))
}

#[derive(Deserialize)]
pub struct ReturnLine {
    pub idx: usize,
    pub qty: i64,
}

/// Retoure (Teilmengen) oder Storno (ganzer Beleg). Erzeugt einen neuen Beleg mit negativem Betrag,
/// bucht den Bestand zurück und zieht die Bonuspunkte anteilig ab – alles in einer Transaktion.
pub fn commit_return(tx: &Transaction, orig_no: &str, lines: &[ReturnLine], storno: bool, reason: &str, method: &Value, cashier: &str) -> Result<Value, String> {
    let o = load(tx, orig_no)?;
    if o.kind != "verkauf" {
        return Err("Nur Verkaufsbelege können retourniert werden".into());
    }
    if o.voided {
        return Err(format!("Beleg {} ist bereits storniert", o.no));
    }
    let (done, refunded) = returned(tx, &o.no)?;
    let olines = o.data["lines"].as_array().cloned().unwrap_or_default();
    let bill = o.data["billDisc"]["pct"].as_f64().unwrap_or(0.0);

    // Welche Positionen, wie viele Stück
    let mut take: Vec<(usize, i64)> = vec![];
    if storno {
        if !done.is_empty() {
            return Err("Zu diesem Beleg gibt es bereits Retouren – Storno nicht mehr möglich, bitte Retoure verwenden".into());
        }
        for (i, l) in olines.iter().enumerate() {
            take.push((i, l["qty"].as_i64().unwrap_or(0)));
        }
    } else {
        for rl in lines {
            let l = olines.get(rl.idx).ok_or("Unbekannte Position")?;
            let sold = l["qty"].as_i64().unwrap_or(0);
            let open = sold - done.get(&rl.idx).copied().unwrap_or(0);
            if rl.qty <= 0 {
                continue;
            }
            if rl.qty > open {
                return Err(format!("{}: nur noch {} Stück retournierbar", l["name"].as_str().unwrap_or("Position"), open));
            }
            take.push((rl.idx, rl.qty));
        }
        if take.is_empty() {
            return Err("Keine Position zur Retoure ausgewählt".into());
        }
    }

    // Beträge
    let mut out_lines = vec![];
    let mut refund = 0i64;
    let mut by_rate: HashMap<i64, i64> = HashMap::new();
    for (i, q) in &take {
        let l = &olines[*i];
        let sold = l["qty"].as_i64().unwrap_or(1).max(1);
        let eff = line_effective(l, bill);
        let r = (eff as f64 * *q as f64 / sold as f64).round() as i64;
        refund += r;
        *by_rate.entry(l["vat"].as_i64().unwrap_or(20)).or_insert(0) += r;
        let mut nl = l.clone();
        nl["idx"] = json!(i);
        nl["qty"] = json!(q);
        nl["refund"] = json!(r);
        out_lines.push(nl);
    }
    // Ist danach alles zurück, wird exakt auf den Originalbetrag ausgeglichen (keine Rundungscent übrig).
    let all_back = olines.iter().enumerate().all(|(i, l)| {
        let now: i64 = take.iter().filter(|(j, _)| *j == i).map(|(_, q)| q).sum();
        done.get(&i).copied().unwrap_or(0) + now >= l["qty"].as_i64().unwrap_or(0)
    });
    if all_back {
        let exact = o.total - refunded;
        let diff = exact - refund;
        // Storno gleicht immer auf den bezahlten Betrag aus (auch bei Belegen ohne Sperr-Kennzeichen aus 0.44.0 bis 0.45.0); Retoure nur bei Rundungscent
        if diff != 0 && (storno || diff.abs() <= take.len() as i64 * 2) {
            refund = exact;
            if let Some(nl) = out_lines.last_mut() {
                let r = nl["refund"].as_i64().unwrap_or(0) + diff;
                nl["refund"] = json!(r);
                *by_rate.entry(nl["vat"].as_i64().unwrap_or(20)).or_insert(0) += diff;
            }
        }
    }
    if refund <= 0 {
        return Err("Erstattungsbetrag ist 0".into());
    }

    // Neuer Beleg
    let n: i64 = tx
        .query_row("UPDATE counters SET value = value + 1 WHERE name = 'beleg' RETURNING value", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let no = catalog::format_beleg(n);
    let kind = if storno { "storno" } else { "retoure" };
    let mut rates: Vec<_> = by_rate.into_iter().collect();
    rates.sort_by(|a, b| b.0.cmp(&a.0));
    let vat: Vec<Value> = rates
        .iter()
        .filter(|(r, g)| *r > 0 && *g > 0)
        .map(|(r, g)| {
            let net = (*g as f64 / (1.0 + *r as f64 / 100.0)).round() as i64;
            json!({ "rate": r, "gross": -eur(*g), "net": -eur(net), "tax": -eur(g - net) })
        })
        .collect();
    let zero = rates.iter().find(|(r, _)| *r == 0).map(|(_, g)| -eur(*g)).unwrap_or(0.0);
    let m_id = method["m"].as_str().unwrap_or("bar");
    let m_label = method["label"].as_str().unwrap_or("Bar");
    let ts = chrono::Local::now();

    // Verkaufte Gutscheine zurücknehmen (nur unbenutzte)
    for l in &out_lines {
        if let Some(codes) = l["codes"].as_array() {
            let mut left = l["qty"].as_i64().unwrap_or(0);
            for code in codes.iter().filter_map(|c| c.as_str()) {
                if left == 0 {
                    break;
                }
                let v = crate::vouchers::get(tx, code)?;
                if v["status"] == "storniert" {
                    continue;
                }
                crate::vouchers::void(tx, code, &no, Some(cashier))?;
                left -= 1;
            }
            if left > 0 {
                return Err("Gutschein bereits zurückgenommen".into());
            }
        }
    }
    // Erstattung als neuer Gutschein
    let mut refund_ref = if m_id == "bar" { "Auszahlung Lade 1".to_string() } else { "Erstattung".to_string() };
    let mut refund_code = Value::Null;
    if m_id == "gutschein" {
        let years = db::setting_get(tx, "gutschein.jahre").and_then(|v| v.as_i64()).unwrap_or(3);
        let code = crate::vouchers::issue(tx, refund, &no, o.customer.as_deref(), years, "Erstattung", Some(cashier))?;
        refund_ref = format!("neuer Gutschein {code}");
        refund_code = json!(code);
    }

    // Bestand zurückbuchen
    let mut stocks = vec![];
    for l in &out_lines {
        if l["service"].as_bool().unwrap_or(false) {
            continue;
        }
        let (Some(sku), Some(col), Some(size)) = (l["sku"].as_str(), l["c"].as_str(), l["s"].as_str()) else { continue };
        let v: Option<(i64, String)> = tx
            .query_row("SELECT id, ean FROM variants WHERE article_id = ?1 AND color = ?2 AND size = ?3", params![sku, col, size], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some((vid, ean)) = v {
            let after = catalog::book(tx, vid, l["qty"].as_i64().unwrap_or(0), false, if storno { "Storno" } else { "Kundenretoure" }, Some(&no), Some(cashier))?;
            stocks.push(json!({ "ean": ean, "stock": after }));
        }
    }

    // Bonuspunkte anteilig abziehen (nur was für diesen Beleg tatsächlich gutgeschrieben wurde)
    let mut points = Value::Null;
    if let Some(cid) = &o.customer {
        let (earned, taken): (i64, i64) = tx
            .query_row(
                "SELECT COALESCE(SUM(CASE WHEN reason = 'Einkauf' THEN delta END), 0), COALESCE(-SUM(CASE WHEN reason IN ('Retoure','Storno') THEN delta END), 0)
                 FROM points_log WHERE customer_id = ?1 AND ref = ?2",
                params![cid, o.no],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        let left = (earned - taken).max(0);
        let want = if storno || all_back {
            left
        } else {
            let before = (o.total - refunded).max(0) / customers::cents_per_point(tx);
            let after = (o.total - refunded - refund).max(0) / customers::cents_per_point(tx);
            (before - after).min(left)
        };
        if want > 0 {
            let (delta, balance) = customers::book_points(tx, cid, -want, if storno { "Storno" } else { "Retoure" }, Some(&o.no), Some(cashier))?;
            points = json!({ "delta": delta, "balance": balance });
        }
    }

    let data = json!({
        "kind": kind, "ref": o.no, "reason": reason, "date": ts.to_rfc3339(), "cashier": cashier,
        "customer": o.data["customer"], "lines": out_lines, "billDisc": Value::Null, "change": 0, "offline": false, "sig": format!("{:016X}", (n as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)),
        "t": { "total": -eur(refund), "sub": -eur(refund), "disc": 0, "vat": vat, "zero": zero, "points": 0 },
        "parts": [{ "m": m_id, "label": m_label, "amount": -eur(refund), "ref": refund_ref, "code": refund_code }],
        "points": points
    });
    let mut data = data;
    let signed = crate::rksv::sign(tx, &no, &ts, &data, kind)?;
    if let Some(s) = &signed {
        data["rksv"] = json!({ "qr": s.qr, "test": true });
    }
    tx.execute(
        "INSERT INTO sales(beleg_no, ts, total, cashier, customer_id, data, kind, ref_no, rksv) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![no, ts.to_rfc3339_opts(chrono::SecondsFormat::Secs, false), -refund, cashier, o.customer, data.to_string(), kind, o.no, signed.as_ref().map(|s| s.qr.clone())],
    )
    .map_err(|e| e.to_string())?;
    if storno {
        tx.execute("UPDATE sales SET voided = 1 WHERE beleg_no = ?1", [&o.no]).map_err(|e| e.to_string())?;
    }
    Ok(json!({ "no": no, "number": n, "total": -refund, "data": data, "stocks": stocks, "points": points }))
}

/* ── Auswertungen ── */

#[derive(Deserialize)]
pub struct Range {
    /// lokale Zeit „YYYY-MM-DDTHH:MM:SS“, inklusive
    pub from: String,
    /// exklusive
    pub to: String,
}

/// Kennzahlen für einen Zeitraum. `rows` = [Zeit, Betrag in Cent, Art] für Verläufe und Heatmap,
/// Artikel und Warengruppen nach Umsatz (Retouren abgezogen).
pub fn stats(c: &Connection, r: &Range, detail: bool) -> Result<Value, String> {
    let mut st = c
        .prepare("SELECT substr(ts, 1, 19), total, kind, data FROM sales WHERE substr(ts, 1, 19) >= ?1 AND substr(ts, 1, 19) < ?2 ORDER BY ts")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map(params![r.from, r.to], |x| Ok((x.get::<_, String>(0)?, x.get::<_, i64>(1)?, x.get::<_, String>(2)?, x.get::<_, String>(3)?)))
        .map_err(|e| e.to_string())?;
    let cats: HashMap<String, String> = {
        let mut s2 = c.prepare("SELECT id, category FROM articles").map_err(|e| e.to_string())?;
        let it = s2.query_map([], |x| Ok((x.get(0)?, x.get(1)?))).map_err(|e| e.to_string())?;
        it.filter_map(Result::ok).collect()
    };
    let (mut revenue, mut gross, mut ret_amt, mut sales_n, mut storno_n, mut sold, mut ret_qty) = (0i64, 0i64, 0i64, 0i64, 0i64, 0i64, 0i64);
    let mut out_rows = vec![];
    let mut items: HashMap<String, (String, i64, i64)> = HashMap::new();
    let mut by_cat: HashMap<String, i64> = HashMap::new();
    let mut pay: HashMap<String, (String, i64)> = HashMap::new();
    let mut days: std::collections::BTreeMap<String, (i64, i64, i64)> = std::collections::BTreeMap::new();
    let mut cashiers: HashMap<String, (i64, i64)> = HashMap::new();
    let mut vat_sum: std::collections::BTreeMap<i64, (i64, i64, i64)> = std::collections::BTreeMap::new();
    let mut discounts = 0i64;
    for row in rows {
        let (ts, total, kind, data) = row.map_err(|e| e.to_string())?;
        revenue += total;
        if detail {
            let e = days.entry(ts[..10].to_string()).or_insert((0, 0, 0));
            e.0 += total;
            if kind == "verkauf" {
                e.1 += 1;
            } else if total < 0 {
                e.2 += -total;
            }
        }
        out_rows.push(json!([ts, total, kind]));
        let is_sale = kind == "verkauf";
        match kind.as_str() {
            "verkauf" => {
                gross += total;
                sales_n += 1;
            }
            "storno" => {
                storno_n += 1;
                ret_amt += -total;
            }
            _ => ret_amt += -total,
        }
        if !detail {
            continue;
        }
        let d: Value = serde_json::from_str(&data).unwrap_or(Value::Null);
        let bill = d["billDisc"]["pct"].as_f64().unwrap_or(0.0);
        let ce = cashiers.entry(d["cashier"].as_str().unwrap_or("").to_string()).or_insert((0, 0));
        ce.0 += total;
        if is_sale {
            ce.1 += 1;
            discounts += cents(&d["t"]["disc"]);
        }
        for v in d["t"]["vat"].as_array().into_iter().flatten() {
            let x = vat_sum.entry(v["rate"].as_i64().unwrap_or(20)).or_insert((0, 0, 0));
            x.0 += cents(&v["gross"]);
            x.1 += cents(&v["net"]);
            x.2 += cents(&v["tax"]);
        }
        let z = cents(&d["t"]["zero"]);
        if z != 0 {
            let x = vat_sum.entry(0).or_insert((0, 0, 0));
            x.0 += z;
            x.1 += z;
        }
        for l in d["lines"].as_array().into_iter().flatten() {
            let qty = l["qty"].as_i64().unwrap_or(0);
            let amount = if is_sale { line_effective(l, bill) } else { -l["refund"].as_i64().unwrap_or(0) };
            let q = if is_sale { qty } else { -qty };
            if l["service"].as_bool().unwrap_or(false) {
                continue;
            }
            if is_sale { sold += qty } else { ret_qty += qty }
            if let Some(sku) = l["sku"].as_str() {
                let e = items.entry(sku.to_string()).or_insert((l["name"].as_str().unwrap_or("").to_string(), 0, 0));
                e.1 += q;
                e.2 += amount;
                *by_cat.entry(cats.get(sku).cloned().unwrap_or_else(|| "sonstige".into())).or_insert(0) += amount;
            }
        }
        for p in d["parts"].as_array().into_iter().flatten() {
            let e = pay.entry(p["m"].as_str().unwrap_or("?").to_string()).or_insert((p["label"].as_str().unwrap_or("").to_string(), 0));
            e.1 += cents(&p["amount"]);
        }
    }
    let mut items: Vec<Value> = items.into_iter().map(|(k, (n, q, a))| json!({ "sku": k, "name": n, "qty": q, "rev": a })).collect();
    items.sort_by_key(|v| -v["rev"].as_i64().unwrap_or(0));
    items.truncate(if detail { 500 } else { 30 });
    let mut cats_v: Vec<Value> = by_cat.into_iter().map(|(k, a)| json!({ "cat": k, "rev": a })).collect();
    cats_v.sort_by_key(|v| -v["rev"].as_i64().unwrap_or(0));
    let pay_v: Vec<Value> = pay.into_iter().map(|(k, (l, a))| json!({ "m": k, "label": l, "amount": a })).collect();
    Ok(json!({
        "revenue": revenue, "gross": gross, "returns": ret_amt, "sales": sales_n - storno_n, "stornos": storno_n,
        "sold": sold, "returned": ret_qty, "rows": out_rows, "items": items, "cats": cats_v, "pay": pay_v, "discounts": discounts,
        "days": days.iter().map(|(d, (r, n, x))| json!({ "day": d, "revenue": r, "sales": n, "returns": x })).collect::<Vec<_>>(),
        "cashiers": cashiers.iter().map(|(n, (r, b))| json!({ "name": n, "revenue": r, "sales": b })).collect::<Vec<_>>(),
        "vat": vat_sum.iter().rev().map(|(r, (g, n, t))| json!({ "rate": r, "gross": g, "net": n, "tax": t })).collect::<Vec<_>>()
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let a: catalog::Article = serde_json::from_value(json!({
            "id": "A1", "name": "Jacke", "category": "jacken", "price": 10000, "vat": 20, "colors": ["moos"], "sizes": ["M"],
            "variants": [{ "color": "moos", "size": "M", "ean": "2000000000015" }]
        }))
        .unwrap();
        let tx = c.unchecked_transaction().unwrap();
        catalog::save(&tx, &a).unwrap();
        catalog::book(&tx, 1, 5, true, "Anfang", None, None).unwrap();
        customers::save(&tx, &serde_json::from_value(json!({ "id": "K-1", "name": "Anna Test" })).unwrap()).unwrap();
        tx.commit().unwrap();
        c
    }

    fn sell(c: &mut Connection, qty: i64, bill_pct: Option<f64>) -> String {
        // 3 × 100 € Jacke, optional Bonrabatt, plus Tragetasche 0,50 €
        let unit = 100.0;
        // wie die Kasse: Bonrabatt auf alle steuerpflichtigen Positionen
        let mut total = (unit * qty as f64 * 100.0) as i64 + 50;
        if let Some(p) = bill_pct {
            total -= (total as f64 * p / 100.0).round() as i64;
        }
        let data = json!({
            "billDisc": bill_pct.map(|p| json!({ "pct": p })), "customer": { "id": "K-1" },
            "t": { "total": total as f64 / 100.0 },
            "lines": [
                { "name": "Jacke", "sku": "A1", "c": "moos", "s": "M", "qty": qty, "unit": unit, "vat": 20 },
                { "name": "Tragetasche", "qty": 1, "unit": 0.5, "vat": 20, "service": true }
            ]
        });
        let tx = c.transaction().unwrap();
        let r = catalog::commit_sale(&tx, &[catalog::SaleLine { ean: Some("2000000000015".into()), qty }], total, "Test", Some("K-1"), &data).unwrap();
        tx.commit().unwrap();
        r["no"].as_str().unwrap().to_string()
    }

    fn stock(c: &Connection) -> i64 {
        c.query_row("SELECT stock FROM variants WHERE id = 1", [], |r| r.get(0)).unwrap()
    }
    fn points(c: &Connection) -> i64 {
        c.query_row("SELECT points FROM customers WHERE id = 'K-1'", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn bon_rabatt_erfasst_gesperrte_positionen_nicht() {
        let jacke = json!({ "qty": 1, "unit": 100.0, "vat": 20, "nodisc": true });
        let hose = json!({ "qty": 1, "unit": 100.0, "vat": 20 });
        assert_eq!(line_effective(&jacke, 10.0), 10000);
        assert_eq!(line_effective(&hose, 10.0), 9000);
        // Belege aus früheren Fassungen ohne Kennzeichen rechnen wie bisher
        assert_eq!(line_effective(&json!({ "qty": 1, "unit": 100.0, "vat": 20 }), 10.0), 9000);
    }

    #[test]
    fn retoure_teilweise_dann_rest_gleicht_exakt_aus() {
        let mut c = setup();
        let no = sell(&mut c, 3, Some(10.0)); // (300,00 + 0,50) − 10 % = 270,45 → 27 Punkte
        assert_eq!(stock(&c), 2);
        assert_eq!(points(&c), 27);
        let cash = json!({ "m": "bar", "label": "Bar" });

        let tx = c.transaction().unwrap();
        let r = commit_return(&tx, &no, &[ReturnLine { idx: 0, qty: 1 }], false, "Größe", &cash, "Test").unwrap();
        tx.commit().unwrap();
        assert_eq!(r["total"], json!(-9000));
        assert_eq!(stock(&c), 3);
        assert_eq!(points(&c), 18); // 270,45 → 180,45

        // mehr als verkauft geht nicht
        let tx = c.transaction().unwrap();
        assert!(commit_return(&tx, &no, &[ReturnLine { idx: 0, qty: 3 }], false, "x", &cash, "Test").is_err());
        drop(tx);

        // Storno nach Retoure nicht erlaubt
        let tx = c.transaction().unwrap();
        assert!(commit_return(&tx, &no, &[], true, "x", &cash, "Test").is_err());
        drop(tx);

        // Rest inkl. Tasche → Summe aller Erstattungen = Originalbetrag
        let tx = c.transaction().unwrap();
        let r = commit_return(&tx, &no, &[ReturnLine { idx: 0, qty: 2 }, ReturnLine { idx: 1, qty: 1 }], false, "Größe", &cash, "Test").unwrap();
        tx.commit().unwrap();
        assert_eq!(r["total"], json!(-18045));
        assert_eq!(stock(&c), 5);
        assert_eq!(points(&c), 0);

        let s = stats(&c, &Range { from: "2000-01-01T00:00:00".into(), to: "2999-01-01T00:00:00".into() }, true).unwrap();
        assert_eq!(s["revenue"], json!(0));
        assert_eq!(s["sold"], json!(3));
        assert_eq!(s["returned"], json!(3));
    }

    #[test]
    fn storno_gleicht_auf_den_bezahlten_betrag_aus_auch_ohne_sperrkennzeichen() {
        let mut c = setup();
        // Bon-Rabatt 10 % erfasste die gesperrte Jacke nicht: bezahlt 100 + 90 = 190 €; der Beleg trägt (wie in 0.44.0) kein „nodisc“
        let data = json!({
            "billDisc": { "pct": 10.0 }, "customer": { "id": "K-1" }, "t": { "total": 190.0 },
            "lines": [
                { "name": "Jacke", "sku": "A1", "c": "moos", "s": "M", "qty": 1, "unit": 100.0, "vat": 20 },
                { "name": "Hose", "qty": 1, "unit": 100.0, "vat": 20 }
            ]
        });
        let tx = c.transaction().unwrap();
        let r = catalog::commit_sale(&tx, &[catalog::SaleLine { ean: Some("2000000000015".into()), qty: 1 }], 19000, "Test", Some("K-1"), &data).unwrap();
        tx.commit().unwrap();
        let no = r["no"].as_str().unwrap().to_string();
        let tx = c.transaction().unwrap();
        let st = commit_return(&tx, &no, &[], true, "Test", &json!({ "m": "bar", "label": "Bar" }), "Test").unwrap();
        tx.commit().unwrap();
        assert_eq!(st["total"], json!(-19000));
    }

    #[test]
    fn storno_ganzer_beleg() {
        let mut c = setup();
        let no = sell(&mut c, 2, None);
        let tx = c.transaction().unwrap();
        let r = commit_return(&tx, &no, &[], true, "Fehlbon", &json!({ "m": "bar", "label": "Bar" }), "Test").unwrap();
        tx.commit().unwrap();
        assert_eq!(r["total"], json!(-20050));
        assert_eq!(stock(&c), 5);
        assert_eq!(points(&c), 0);
        let tx = c.transaction().unwrap();
        assert!(commit_return(&tx, &no, &[], true, "x", &json!({}), "Test").is_err(), "zweites Storno muss scheitern");
        drop(tx);
        let g = sale_get(&c, &no).unwrap();
        assert_eq!(g["sale"]["voided"], json!(true));
        assert_eq!(g["follow"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn gutschein_verkauf_einloesung_und_rksv() {
        let mut c = setup();
        crate::rksv::init(&c, "INN-K01", "Test").unwrap();
        // Gutschein über 50 € verkaufen
        let d = json!({ "t": { "total": 50.0, "vat": [], "zero": 50.0 }, "parts": [{ "m": "bar", "label": "Bar", "amount": 50.0 }],
            "lines": [{ "name": "Gutschein", "qty": 1, "unit": 50.0, "vat": 0, "service": true, "voucher": true }] });
        let tx = c.transaction().unwrap();
        let r = catalog::commit_sale(&tx, &[], 5000, "Test", Some("K-1"), &d).unwrap();
        tx.commit().unwrap();
        let code = r["vouchers"][0].as_str().unwrap().to_string();
        assert!(r["data"]["rksv"]["qr"].as_str().unwrap().contains("_0,00_0,00_0,00_50,00_0,00_"));
        assert_eq!(points(&c), 0, "Gutscheinkauf bringt keine Punkte");
        let gs_no = r["no"].as_str().unwrap().to_string();
        // 30 € damit bezahlen
        let d2 = json!({ "t": { "total": 30.0, "vat": [{ "rate": 20, "gross": 30.0 }] }, "parts": [{ "m": "gutschein", "label": "Gutschein", "amount": 30.0, "code": code }],
            "lines": [{ "name": "Mütze", "qty": 1, "unit": 30.0, "vat": 20, "service": true }] });
        let tx = c.transaction().unwrap();
        catalog::commit_sale(&tx, &[], 3000, "Test", None, &d2).unwrap();
        tx.commit().unwrap();
        assert_eq!(crate::vouchers::get(&c, &code).unwrap()["balance"], json!(2000));
        // mehr als Restwert scheitert – und nichts wird gebucht
        let d3 = json!({ "t": { "total": 30.0, "vat": [{ "rate": 20, "gross": 30.0 }] }, "parts": [{ "m": "gutschein", "label": "Gutschein", "amount": 30.0, "code": code }], "lines": [] });
        let tx = c.transaction().unwrap();
        assert!(catalog::commit_sale(&tx, &[], 3000, "Test", None, &d3).is_err());
        drop(tx);
        // angebrochener Gutschein kann nicht retourniert werden
        let tx = c.transaction().unwrap();
        assert!(commit_return(&tx, &gs_no, &[ReturnLine { idx: 0, qty: 1 }], false, "x", &json!({ "m": "bar", "label": "Bar" }), "Test").is_err());
        drop(tx);
        // Jacke kaufen, als Gutschein erstatten
        let no = sell(&mut c, 1, None);
        let tx = c.transaction().unwrap();
        let rr = commit_return(&tx, &no, &[ReturnLine { idx: 0, qty: 1 }], false, "Größe", &json!({ "m": "gutschein", "label": "Gutschein" }), "Test").unwrap();
        tx.commit().unwrap();
        let newc = rr["data"]["parts"][0]["code"].as_str().unwrap();
        assert_eq!(crate::vouchers::get(&c, newc).unwrap()["balance"], json!(10000));
        assert!(rr["data"]["rksv"]["qr"].as_str().unwrap().contains("_-100,00_"));
        let n: i64 = c.query_row("SELECT COUNT(*) FROM dep", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 5, "Start, Gutschein, Mütze, Jacke, Retoure");
    }
}
