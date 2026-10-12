//! Einkauf: Lieferanten, Bestellungen, Wareneingang gegen Bestellung, Bestellvorschläge.
//! Status einer Bestellung: entwurf → bestellt → teilgeliefert → geliefert (oder storniert).

use crate::{catalog, db};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Supplier {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub contact: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub customer_no: String,
    #[serde(default)]
    pub lead_days: i64,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub open_orders: i64,
    #[serde(default)]
    pub iban: String,
    #[serde(default)]
    pub bic: String,
}

pub fn suppliers(c: &Connection) -> rusqlite::Result<Vec<Supplier>> {
    let mut st = c.prepare(
        "SELECT s.id, s.name, s.contact, s.email, s.phone, s.customer_no, s.lead_days, s.note,
          (SELECT COUNT(*) FROM purchase_orders p WHERE p.supplier_id = s.id AND p.status IN ('bestellt','teilgeliefert')), s.iban, s.bic
         FROM suppliers s WHERE s.active = 1 ORDER BY s.name COLLATE NOCASE",
    )?;
    let rows = st.query_map([], |r| {
        Ok(Supplier { id: r.get(0)?, name: r.get(1)?, contact: r.get(2)?, email: r.get(3)?, phone: r.get(4)?, customer_no: r.get(5)?, lead_days: r.get(6)?, note: r.get(7)?, open_orders: r.get(8)?, iban: r.get(9)?, bic: r.get(10)? })
    })?;
    rows.collect()
}

pub fn supplier_save(c: &Connection, s: &Supplier) -> Result<String, String> {
    if s.name.trim().chars().count() < 2 {
        return Err("Name fehlt".into());
    }
    let id = if s.id.trim().is_empty() {
        let n: i64 = c.query_row("SELECT COUNT(*) FROM suppliers", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        let mut k = n + 1;
        loop {
            let id = format!("L-{k:03}");
            if c.query_row("SELECT 1 FROM suppliers WHERE id = ?1", [&id], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_none() {
                break id;
            }
            k += 1;
        }
    } else {
        s.id.trim().to_string()
    };
    c.execute(
        "INSERT INTO suppliers(id, name, contact, email, phone, customer_no, lead_days, note, active, created_at, updated_at, iban, bic) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9,?9,?10,?11)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, contact=excluded.contact, email=excluded.email, phone=excluded.phone,
           customer_no=excluded.customer_no, lead_days=excluded.lead_days, note=excluded.note, active=1, updated_at=excluded.updated_at, iban=excluded.iban, bic=excluded.bic",
        params![id, s.name.trim(), s.contact.trim(), s.email.trim(), s.phone.trim(), s.customer_no.trim(), s.lead_days.clamp(0, 365), s.note.trim(), db::now(),
            s.iban.replace(' ', "").to_uppercase(), s.bic.trim().to_uppercase()],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn supplier_seed(c: &Connection) -> Result<(), String> {
    if db::count(c, "suppliers") > 0 {
        return Ok(());
    }
    for (name, lead, brands) in [("Nordwand Outdoor GmbH", 10, "Nordwand"), ("Firn Sports AG", 14, "Firn"), ("Talwind Distribution", 7, "Talwind"), ("Alpin Handelsagentur", 5, "Lodenwerk, Seilschaft, Kammlinie")] {
        let id = supplier_save(c, &Supplier { name: name.into(), lead_days: lead, note: format!("Marken: {brands}"), ..Default::default() })?;
        for b in brands.split(", ") {
            c.execute("UPDATE articles SET supplier_id = ?1 WHERE brand = ?2 AND supplier_id IS NULL", params![id, b]).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct PoLineIn {
    pub variant_id: i64,
    pub qty: i64,
    #[serde(default)]
    pub cost: Option<i64>,
}

fn po_head(c: &Connection, id: i64) -> Result<(String, String), String> {
    c.query_row("SELECT no, status FROM purchase_orders WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|_| "Bestellung nicht gefunden".to_string())
}

/// Entwurf anlegen oder ändern (nur im Status „entwurf“).
pub fn po_save(tx: &Transaction, id: Option<i64>, supplier: &str, note: &str, lines: &[PoLineIn], user: &str) -> Result<i64, String> {
    if lines.iter().all(|l| l.qty <= 0) {
        return Err("Mindestens eine Position mit Menge".into());
    }
    let id = match id {
        Some(id) => {
            let (_, status) = po_head(tx, id)?;
            if status != "entwurf" {
                return Err("Nur Entwürfe können geändert werden".into());
            }
            tx.execute("UPDATE purchase_orders SET supplier_id = ?2, note = ?3 WHERE id = ?1", params![id, supplier, note]).map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM po_lines WHERE po_id = ?1", [id]).map_err(|e| e.to_string())?;
            id
        }
        None => {
            let n: i64 = tx
                .query_row("UPDATE counters SET value = value + 1 WHERE name = 'bestellung' RETURNING value", [], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            let no = format!("B-{}-{n:04}", chrono::Local::now().format("%Y"));
            tx.execute(
                "INSERT INTO purchase_orders(no, supplier_id, status, note, created_at, user) VALUES (?1,?2,'entwurf',?3,?4,?5)",
                params![no, supplier, note, db::now(), user],
            )
            .map_err(|e| e.to_string())?;
            tx.last_insert_rowid()
        }
    };
    for l in lines.iter().filter(|l| l.qty > 0) {
        tx.execute("INSERT INTO po_lines(po_id, variant_id, qty, cost) VALUES (?1,?2,?3,?4)", params![id, l.variant_id, l.qty, l.cost]).map_err(|e| e.to_string())?;
    }
    Ok(id)
}

pub fn po_status(c: &Connection, id: i64, status: &str) -> Result<(), String> {
    let (_, cur) = po_head(c, id)?;
    let ok = matches!((cur.as_str(), status), ("entwurf", "bestellt") | ("entwurf", "storniert") | ("bestellt", "storniert") | ("teilgeliefert", "geliefert"));
    if !ok {
        return Err(format!("Statuswechsel {cur} → {status} nicht möglich"));
    }
    c.execute(
        "UPDATE purchase_orders SET status = ?2, ordered_at = CASE WHEN ?2 = 'bestellt' THEN ?3 ELSE ordered_at END WHERE id = ?1",
        params![id, status, db::now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Deserialize)]
pub struct Receive {
    pub line_id: i64,
    pub qty: i64,
}

/// Wareneingang zu einer Bestellung: Bestand buchen, gelieferte Mengen fortschreiben, Status setzen.
pub fn po_receive(tx: &Transaction, id: i64, items: &[Receive], user: &str) -> Result<Vec<Value>, String> {
    let (no, status) = po_head(tx, id)?;
    if !["bestellt", "teilgeliefert"].contains(&status.as_str()) {
        return Err("Wareneingang nur für bestellte Ware".into());
    }
    let mut stocks = vec![];
    for it in items.iter().filter(|i| i.qty > 0) {
        let (vid, qty, rec, ean): (i64, i64, i64, String) = tx
            .query_row(
                "SELECT l.variant_id, l.qty, l.received, v.ean FROM po_lines l JOIN variants v ON v.id = l.variant_id WHERE l.id = ?1 AND l.po_id = ?2",
                params![it.line_id, id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .map_err(|_| "Position nicht gefunden".to_string())?;
        if it.qty > (qty - rec) * 2 + 5 {
            return Err(format!("Menge {} deutlich über der Bestellmenge – bitte prüfen", it.qty));
        }
        tx.execute("UPDATE po_lines SET received = received + ?2 WHERE id = ?1", params![it.line_id, it.qty]).map_err(|e| e.to_string())?;
        let after = catalog::book(tx, vid, it.qty, false, "Wareneingang", Some(&no), Some(user))?;
        stocks.push(json!({ "ean": ean, "stock": after }));
    }
    if stocks.is_empty() {
        return Err("Keine Menge erfasst".into());
    }
    let open: i64 = tx.query_row("SELECT COALESCE(SUM(MAX(qty - received, 0)), 0) FROM po_lines WHERE po_id = ?1", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
    tx.execute("UPDATE purchase_orders SET status = ?2 WHERE id = ?1", params![id, if open == 0 { "geliefert" } else { "teilgeliefert" }]).map_err(|e| e.to_string())?;
    Ok(stocks)
}

pub fn po_set_type(c: &Connection, id: i64, t: &str) -> Result<(), String> {
    c.execute("UPDATE purchase_orders SET order_type = ?2 WHERE id = ?1", params![id, t.trim()]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn po_list(c: &Connection) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare(
        "SELECT p.id, p.no, p.supplier_id, s.name, p.status, p.note, p.created_at, p.ordered_at, p.user,
           COALESCE(SUM(l.qty), 0), COALESCE(SUM(l.received), 0), COALESCE(SUM(l.qty * COALESCE(l.cost, 0)), 0), COUNT(l.id), p.order_type
         FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN po_lines l ON l.po_id = p.id
         GROUP BY p.id ORDER BY p.id DESC LIMIT 300",
    )?;
    let rows = st.query_map([], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "no": r.get::<_, String>(1)?, "supplier_id": r.get::<_, String>(2)?, "supplier": r.get::<_, String>(3)?,
            "status": r.get::<_, String>(4)?, "note": r.get::<_, String>(5)?, "created_at": r.get::<_, String>(6)?, "ordered_at": r.get::<_, Option<String>>(7)?,
            "user": r.get::<_, Option<String>>(8)?, "qty": r.get::<_, i64>(9)?, "received": r.get::<_, i64>(10)?, "value": r.get::<_, i64>(11)?, "lines": r.get::<_, i64>(12)?, "order_type": r.get::<_, String>(13)? }))
    })?;
    rows.collect()
}

pub fn po_lines(c: &Connection, id: i64) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare(
        "SELECT l.id, l.variant_id, a.id, a.name, a.glyph, v.color, v.size, v.ean, l.qty, l.received, l.cost, v.stock
         FROM po_lines l JOIN variants v ON v.id = l.variant_id JOIN articles a ON a.id = v.article_id WHERE l.po_id = ?1 ORDER BY a.name, v.id",
    )?;
    let rows = st.query_map([id], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "variant_id": r.get::<_, i64>(1)?, "article_id": r.get::<_, String>(2)?, "name": r.get::<_, String>(3)?,
            "glyph": r.get::<_, String>(4)?, "color": r.get::<_, String>(5)?, "size": r.get::<_, String>(6)?, "ean": r.get::<_, String>(7)?,
            "qty": r.get::<_, i64>(8)?, "received": r.get::<_, i64>(9)?, "cost": r.get::<_, Option<i64>>(10)?, "stock": r.get::<_, i64>(11)? }))
    })?;
    rows.collect()
}

/// Bestellvorschlag: Varianten unter Mindestbestand (abzüglich offener Bestellmengen), aufgefüllt auf
/// Mindestbestand + erwarteten Abverkauf, gruppiert nach Lieferant. Einstellbar unter „order.vorschlag“:
/// tage (Betrachtungszeitraum, 28), reichweite (Tage, 0 = wie Zeitraum), faktor (Sicherheitsfaktor, 1.0),
/// runden (Packeinheit, 1), ohne (Warengruppen ausschließen), nur_lieferant (nur Artikel mit Lieferant).
pub fn suggest(c: &Connection) -> Result<Vec<Value>, String> {
    let cfg = db::setting_get(c, "order.vorschlag").unwrap_or(json!({}));
    let tage = cfg["tage"].as_i64().unwrap_or(28).clamp(7, 365);
    let reichweite = cfg["reichweite"].as_i64().unwrap_or(0).clamp(0, 365);
    let faktor = cfg["faktor"].as_f64().unwrap_or(1.0).clamp(0.1, 5.0);
    let runden = cfg["runden"].as_i64().unwrap_or(1).clamp(1, 1000);
    let ohne: Vec<String> = cfg["ohne"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default();
    let nur_lieferant = cfg["nur_lieferant"].as_bool().unwrap_or(false);
    let since = (chrono::Local::now() - chrono::Duration::days(tage)).format("%Y-%m-%dT%H:%M:%S").to_string();
    let mut sold: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    {
        let mut st = c
            .prepare("SELECT variant_id, -SUM(delta) FROM stock_moves WHERE reason = 'Verkauf' AND substr(ts, 1, 19) >= ?1 GROUP BY variant_id")
            .map_err(|e| e.to_string())?;
        for r in st.query_map([&since], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))).map_err(|e| e.to_string())? {
            let (v, n) = r.map_err(|e| e.to_string())?;
            sold.insert(v, n);
        }
    }
    let mut st = c
        .prepare(
            "SELECT v.id, a.id, a.name, a.glyph, v.color, v.size, v.stock, a.min_stock, a.cost, COALESCE(a.supplier_id, ''),
               (SELECT COALESCE(SUM(l.qty - l.received), 0) FROM po_lines l JOIN purchase_orders p ON p.id = l.po_id WHERE l.variant_id = v.id AND p.status IN ('entwurf','bestellt','teilgeliefert')),
               a.category, v.ean
             FROM variants v JOIN articles a ON a.id = v.article_id WHERE v.active = 1 AND a.active = 1",
        )
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?,
                r.get::<_, i64>(6)?, r.get::<_, i64>(7)?, r.get::<_, Option<i64>>(8)?, r.get::<_, String>(9)?, r.get::<_, i64>(10)?, r.get::<_, String>(11)?, r.get::<_, String>(12)?))
        })
        .map_err(|e| e.to_string())?;
    let mut out = vec![];
    for r in rows {
        let (vid, aid, name, glyph, color, size, stock, min, cost, sup, open, cat, ean) = r.map_err(|e| e.to_string())?;
        if ohne.contains(&cat) || (nur_lieferant && sup.is_empty()) {
            continue;
        }
        let avail = stock + open;
        let s = sold.get(&vid).copied().unwrap_or(0);
        let bedarf = if reichweite > 0 { (s as f64 * reichweite as f64 / tage as f64 * faktor).ceil() as i64 } else { (s as f64 * faktor).ceil() as i64 };
        let ziel = min + bedarf;
        if avail > min && (reichweite == 0 || avail >= ziel) {
            continue;
        }
        let mut qty = (ziel - avail).max(1);
        if runden > 1 {
            qty = (qty + runden - 1) / runden * runden;
        }
        let grund = if avail <= 0 { "ausverkauft" } else if avail <= min { "unter Mindestbestand" } else { "Reichweite zu gering" };
        out.push(json!({ "variant_id": vid, "article_id": aid, "name": name, "glyph": glyph, "color": color, "size": size, "stock": stock, "ean": ean, "category": cat,
            "min": min, "open": open, "sold28": s, "sold": s, "tage": tage, "bedarf": bedarf, "ziel": ziel, "grund": grund, "qty": qty, "cost": cost, "supplier_id": sup }));
    }
    out.sort_by(|a, b| b["sold28"].as_i64().cmp(&a["sold28"].as_i64()).then(a["stock"].as_i64().cmp(&b["stock"].as_i64())));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bestellung_und_wareneingang() {
        let mut c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let a: catalog::Article = serde_json::from_value(json!({ "id": "A1", "name": "Jacke", "brand": "Firn", "category": "jacken", "price": 10000, "vat": 20,
            "colors": ["moos"], "sizes": ["M"], "variants": [{ "color": "moos", "size": "M", "ean": "2000000000015" }] })).unwrap();
        let tx = c.transaction().unwrap();
        catalog::save(&tx, &a).unwrap();
        tx.commit().unwrap();
        supplier_seed(&c).unwrap();
        let sup: String = c.query_row("SELECT supplier_id FROM articles WHERE id = 'A1'", [], |r| r.get(0)).unwrap();
        let sg = suggest(&c).unwrap();
        assert_eq!(sg.len(), 1);
        assert_eq!(sg[0]["supplier_id"], json!(sup));
        let tx = c.transaction().unwrap();
        let id = po_save(&tx, None, &sup, "", &[PoLineIn { variant_id: 1, qty: 5, cost: Some(4000) }], "T").unwrap();
        tx.commit().unwrap();
        assert!(suggest(&c).unwrap().is_empty(), "offene Bestellung deckt den Bedarf");
        let tx = c.transaction().unwrap();
        assert!(po_receive(&tx, id, &[Receive { line_id: 1, qty: 2 }], "T").is_err(), "Entwurf kann nicht geliefert werden");
        drop(tx);
        po_status(&c, id, "bestellt").unwrap();
        let tx = c.transaction().unwrap();
        po_receive(&tx, id, &[Receive { line_id: 1, qty: 2 }], "T").unwrap();
        tx.commit().unwrap();
        assert_eq!(po_list(&c).unwrap()[0]["status"], json!("teilgeliefert"));
        let tx = c.transaction().unwrap();
        po_receive(&tx, id, &[Receive { line_id: 1, qty: 3 }], "T").unwrap();
        tx.commit().unwrap();
        assert_eq!(po_list(&c).unwrap()[0]["status"], json!("geliefert"));
        let stock: i64 = c.query_row("SELECT stock FROM variants WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(stock, 5);
    }
}
