//! Artikel, Varianten, Bestand und Belege.
//! Beträge in Cent (Integer) – keine Rundungsfehler in der Datenbank.

use crate::db;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone)]
pub struct Variant {
    #[serde(default)]
    pub id: Option<i64>,
    pub color: String,
    pub size: String,
    pub ean: String,
    #[serde(default)]
    pub stock: i64,
}

fn yes() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Article {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub brand: String,
    pub category: String,
    #[serde(default)]
    pub glyph: String,
    pub price: i64,
    #[serde(default)]
    pub sale_price: Option<i64>,
    #[serde(default)]
    pub vat: i64,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub popularity: i64,
    #[serde(default)]
    pub colors: Vec<String>,
    #[serde(default)]
    pub sizes: Vec<String>,
    #[serde(default)]
    pub fields: Value,
    #[serde(default)]
    pub prompts: Value,
    #[serde(default = "yes")]
    pub active: bool,
    #[serde(default)]
    pub variants: Vec<Variant>,
}

pub fn list(c: &Connection) -> rusqlite::Result<Vec<Article>> {
    let mut vs: HashMap<String, Vec<Variant>> = HashMap::new();
    {
        let mut st = c.prepare("SELECT id, article_id, color, size, ean, stock FROM variants WHERE active = 1 ORDER BY id")?;
        let rows = st.query_map([], |r| {
            Ok((r.get::<_, String>(1)?, Variant { id: Some(r.get(0)?), color: r.get(2)?, size: r.get(3)?, ean: r.get(4)?, stock: r.get(5)? }))
        })?;
        for row in rows {
            let (aid, v) = row?;
            vs.entry(aid).or_default().push(v);
        }
    }
    let mut st = c.prepare(
        "SELECT id, name, brand, category, glyph, price, sale_price, vat, tag, popularity, colors, sizes, fields, prompts
         FROM articles WHERE active = 1 ORDER BY popularity DESC, name",
    )?;
    let rows = st.query_map([], |r| {
        let js = |i: usize| -> rusqlite::Result<Value> { Ok(serde_json::from_str(&r.get::<_, String>(i)?).unwrap_or(Value::Null)) };
        Ok(Article {
            id: r.get(0)?,
            name: r.get(1)?,
            brand: r.get(2)?,
            category: r.get(3)?,
            glyph: r.get(4)?,
            price: r.get(5)?,
            sale_price: r.get(6)?,
            vat: r.get(7)?,
            tag: r.get(8)?,
            popularity: r.get(9)?,
            colors: serde_json::from_value(js(10)?).unwrap_or_default(),
            sizes: serde_json::from_value(js(11)?).unwrap_or_default(),
            fields: js(12)?,
            prompts: js(13)?,
            active: true,
            variants: vec![],
        })
    })?;
    let mut out = vec![];
    for a in rows {
        let mut a = a?;
        a.variants = vs.remove(&a.id).unwrap_or_default();
        out.push(a);
    }
    Ok(out)
}

fn validate(a: &Article) -> Result<(), String> {
    if a.id.trim().is_empty() {
        return Err("Artikelnummer fehlt".into());
    }
    if a.name.trim().is_empty() {
        return Err("Bezeichnung fehlt".into());
    }
    if a.price <= 0 {
        return Err("Preis muss größer als 0 sein".into());
    }
    if let Some(s) = a.sale_price {
        if s <= 0 || s >= a.price {
            return Err("Aktionspreis muss unter dem Preis liegen".into());
        }
    }
    if a.variants.is_empty() {
        return Err("Mindestens eine Farbe und eine Größe nötig".into());
    }
    if ![0, 10, 13, 20].contains(&a.vat) {
        return Err("Ungültiger Steuersatz".into());
    }
    Ok(())
}

/// Artikel anlegen oder ändern. Varianten, die wegfallen, werden deaktiviert (Historie bleibt).
pub fn save(tx: &Transaction, a: &Article) -> Result<(), String> {
    validate(a)?;
    let now = db::now();
    tx.execute(
        "INSERT INTO articles(id, name, brand, category, glyph, price, sale_price, vat, tag, popularity, colors, sizes, fields, prompts, active, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,1,?15,?15)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, brand=excluded.brand, category=excluded.category, glyph=excluded.glyph,
           price=excluded.price, sale_price=excluded.sale_price, vat=excluded.vat, tag=excluded.tag, colors=excluded.colors,
           sizes=excluded.sizes, fields=excluded.fields, prompts=excluded.prompts, active=1, updated_at=excluded.updated_at",
        params![
            a.id.trim(), a.name.trim(), a.brand.trim(), a.category, if a.glyph.is_empty() { "shirt" } else { &a.glyph },
            a.price, a.sale_price, a.vat, a.tag, a.popularity,
            serde_json::to_string(&a.colors).unwrap(), serde_json::to_string(&a.sizes).unwrap(),
            if a.fields.is_null() { "{}".to_string() } else { a.fields.to_string() }, a.prompts.to_string(), now
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("UPDATE variants SET active = 0 WHERE article_id = ?1", [&a.id]).map_err(|e| e.to_string())?;
    for v in &a.variants {
        tx.execute(
            "INSERT INTO variants(article_id, color, size, ean, stock, active) VALUES (?1,?2,?3,?4,0,1)
             ON CONFLICT(article_id, color, size) DO UPDATE SET active = 1, ean = excluded.ean",
            params![a.id, v.color, v.size, v.ean],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE constraint failed: variants.ean") {
                format!("EAN {} ist bereits einem anderen Artikel zugeordnet", v.ean)
            } else {
                e.to_string()
            }
        })?;
    }
    Ok(())
}

pub fn deactivate(c: &Connection, id: &str) -> rusqlite::Result<usize> {
    c.execute("UPDATE articles SET active = 0, updated_at = ?2 WHERE id = ?1", params![id, db::now()])
}

fn variant_by_ean(tx: &Connection, ean: &str) -> rusqlite::Result<Option<(i64, i64)>> {
    tx.query_row("SELECT id, stock FROM variants WHERE ean = ?1", [ean], |r| Ok((r.get(0)?, r.get(1)?))).optional()
}

/// Bestandsbuchung. `set = true` → Zählbestand (Inventur), sonst Zu-/Abgang.
pub fn book(tx: &Transaction, variant_id: i64, value: i64, set: bool, reason: &str, refno: Option<&str>, user: Option<&str>) -> Result<i64, String> {
    let cur: i64 = tx
        .query_row("SELECT stock FROM variants WHERE id = ?1", [variant_id], |r| r.get(0))
        .map_err(|_| "Variante nicht gefunden".to_string())?;
    let delta = if set { value - cur } else { value };
    let after = cur + delta;
    tx.execute("UPDATE variants SET stock = ?2 WHERE id = ?1", params![variant_id, after]).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO stock_moves(ts, variant_id, delta, stock_after, reason, ref, user) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![db::now(), variant_id, delta, after, reason, refno, user],
    )
    .map_err(|e| e.to_string())?;
    Ok(after)
}

pub fn moves(c: &Connection, article_id: Option<&str>, limit: i64) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare(
        "SELECT m.ts, a.id, a.name, v.color, v.size, m.delta, m.stock_after, m.reason, m.ref, m.user, v.id
         FROM stock_moves m JOIN variants v ON v.id = m.variant_id JOIN articles a ON a.id = v.article_id
         WHERE (?1 IS NULL OR a.id = ?1) ORDER BY m.id DESC LIMIT ?2",
    )?;
    let rows = st.query_map(params![article_id, limit], |r| {
        Ok(json!({
            "ts": r.get::<_, String>(0)?, "article_id": r.get::<_, String>(1)?, "name": r.get::<_, String>(2)?,
            "color": r.get::<_, String>(3)?, "size": r.get::<_, String>(4)?, "delta": r.get::<_, i64>(5)?,
            "stock_after": r.get::<_, i64>(6)?, "reason": r.get::<_, String>(7)?, "ref": r.get::<_, Option<String>>(8)?,
            "user": r.get::<_, Option<String>>(9)?, "variant_id": r.get::<_, i64>(10)?
        }))
    })?;
    rows.collect()
}

pub fn format_beleg(n: i64) -> String {
    format!("{}-{:06}", chrono::Local::now().format("%Y"), n)
}

pub fn beleg_peek(c: &Connection) -> i64 {
    c.query_row("SELECT value FROM counters WHERE name = 'beleg'", [], |r| r.get::<_, i64>(0)).unwrap_or(0) + 1
}

#[derive(Deserialize)]
pub struct SaleLine {
    pub ean: Option<String>,
    pub qty: i64,
}

/// Verkauf festschreiben: Belegnummer vergeben, Beleg speichern, Bestand abbuchen – alles oder nichts.
pub fn commit_sale(tx: &Transaction, lines: &[SaleLine], total: i64, cashier: &str, customer: Option<&str>, data: &Value) -> Result<Value, String> {
    let n: i64 = tx
        .query_row("UPDATE counters SET value = value + 1 WHERE name = 'beleg' RETURNING value", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let no = format_beleg(n);
    let mut data = data.clone();
    data["no"] = json!(no);
    tx.execute(
        "INSERT INTO sales(beleg_no, ts, total, cashier, customer_id, data) VALUES (?1,?2,?3,?4,?5,?6)",
        params![no, db::now(), total, cashier, customer, data.to_string()],
    )
    .map_err(|e| e.to_string())?;
    let mut stocks = vec![];
    for l in lines {
        if let Some(ean) = &l.ean {
            if let Some((vid, _)) = variant_by_ean(tx, ean).map_err(|e| e.to_string())? {
                let after = book(tx, vid, -l.qty, false, "Verkauf", Some(&no), Some(cashier))?;
                stocks.push(json!({ "ean": ean, "stock": after }));
            }
        }
    }
    Ok(json!({ "no": no, "number": n, "stocks": stocks }))
}

pub fn sales(c: &Connection, limit: i64) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare("SELECT beleg_no, ts, total, cashier, data FROM sales ORDER BY id DESC LIMIT ?1")?;
    let rows = st.query_map([limit], |r| {
        Ok(json!({
            "no": r.get::<_, String>(0)?, "ts": r.get::<_, String>(1)?, "total": r.get::<_, i64>(2)?,
            "cashier": r.get::<_, Option<String>>(3)?,
            "data": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(Value::Null)
        }))
    })?;
    rows.collect()
}
