//! Kunden und Bonuspunkte.
//! Punkte: 1 Punkt je volle 10 € Einkauf (Beträge in Cent). Jede Punktebewegung steht im points_log.

use crate::db;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const CENTS_PER_POINT: i64 = 1000;

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Customer {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub tier: String,
    #[serde(default)]
    pub points: i64,
    #[serde(default)]
    pub club_name: Option<String>,
    #[serde(default)]
    pub club_pct: Option<i64>,
    #[serde(default)]
    pub fields: Value,
    #[serde(default)]
    pub consent: bool,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub street: String,
    #[serde(default)]
    pub zip: String,
    #[serde(default)]
    pub city: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub uid: String,
    // nur lesend – aus den Belegen berechnet
    #[serde(default)]
    pub visits: i64,
    #[serde(default)]
    pub revenue: i64,
    #[serde(default)]
    pub last_visit: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

const SELECT: &str = "SELECT c.id, c.name, c.email, c.phone, c.tier, c.points, c.club_name, c.club_pct, c.fields, c.consent, c.note, c.created_at, c.street, c.zip, c.city, c.country, c.uid,
    (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.kind = 'verkauf' AND s.voided = 0),
    (SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.customer_id = c.id),
    (SELECT MAX(s.ts) FROM sales s WHERE s.customer_id = c.id AND s.kind = 'verkauf')
    FROM customers c";

fn row(r: &rusqlite::Row) -> rusqlite::Result<Customer> {
    Ok(Customer {
        id: r.get(0)?,
        name: r.get(1)?,
        email: r.get(2)?,
        phone: r.get(3)?,
        tier: r.get(4)?,
        points: r.get(5)?,
        club_name: r.get(6)?,
        club_pct: r.get(7)?,
        fields: serde_json::from_str(&r.get::<_, String>(8)?).unwrap_or(json!({})),
        consent: r.get::<_, i64>(9)? != 0,
        note: r.get(10)?,
        created_at: r.get(11)?,
        street: r.get(12)?,
        zip: r.get(13)?,
        city: r.get(14)?,
        country: r.get(15)?,
        uid: r.get(16)?,
        visits: r.get(17)?,
        revenue: r.get(18)?,
        last_visit: r.get(19)?,
    })
}

pub fn list(c: &Connection) -> rusqlite::Result<Vec<Customer>> {
    let mut st = c.prepare(&format!("{SELECT} WHERE c.active = 1 ORDER BY c.name COLLATE NOCASE"))?;
    let rows = st.query_map([], row)?;
    rows.collect()
}

pub fn get(c: &Connection, id: &str) -> rusqlite::Result<Option<Customer>> {
    c.query_row(&format!("{SELECT} WHERE c.id = ?1"), [id], row).optional()
}

fn validate(k: &Customer) -> Result<(), String> {
    if k.name.trim().chars().count() < 2 {
        return Err("Name fehlt".into());
    }
    let e = k.email.trim();
    if !e.is_empty() && (!e.contains('@') || !e.contains('.') || e.contains(' ')) {
        return Err("E-Mail-Adresse ist ungültig".into());
    }
    if let Some(p) = k.club_pct {
        if !(0..=50).contains(&p) {
            return Err("Vereinsrabatt muss zwischen 0 und 50 % liegen".into());
        }
    }
    Ok(())
}

/// Anlegen (ohne id → neue Kundennummer) oder ändern. Punkte werden hier nie verändert.
pub fn save(c: &Connection, k: &Customer) -> Result<String, String> {
    validate(k)?;
    let now = db::now();
    let id = if k.id.trim().is_empty() {
        let n: i64 = c
            .query_row("UPDATE counters SET value = value + 1 WHERE name = 'kunde' RETURNING value", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        format!("K-{n:05}")
    } else {
        k.id.trim().to_string()
    };
    let club = k.club_name.as_deref().map(str::trim).filter(|s| !s.is_empty());
    c.execute(
        "INSERT INTO customers(id, name, email, phone, tier, points, club_name, club_pct, fields, consent, note, active, created_at, updated_at, street, zip, city, country, uid)
         VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,1,?11,?11,?12,?13,?14,?15,?16)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, phone=excluded.phone, tier=excluded.tier,
           club_name=excluded.club_name, club_pct=excluded.club_pct, fields=excluded.fields, consent=excluded.consent,
           note=excluded.note, active=1, updated_at=excluded.updated_at, street=excluded.street, zip=excluded.zip,
           city=excluded.city, country=excluded.country, uid=excluded.uid",
        params![
            id, k.name.trim(), k.email.trim(), k.phone.trim(), if k.tier.trim().is_empty() { "Kunde" } else { k.tier.trim() },
            club, if club.is_some() { k.club_pct } else { None },
            if k.fields.is_object() { k.fields.to_string() } else { "{}".into() }, k.consent as i64, k.note.trim(), now,
            k.street.trim(), k.zip.trim(), k.city.trim(), if k.country.trim().is_empty() { "AT" } else { k.country.trim() }, k.uid.trim()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn deactivate(c: &Connection, id: &str) -> rusqlite::Result<usize> {
    c.execute("UPDATE customers SET active = 0, updated_at = ?2 WHERE id = ?1", params![id, db::now()])
}

/// Punkte buchen. Der Stand fällt nie unter 0 – die tatsächlich gebuchte Änderung wird zurückgegeben.
pub fn book_points(c: &Connection, id: &str, delta: i64, reason: &str, refno: Option<&str>, user: Option<&str>) -> Result<(i64, i64), String> {
    let cur: i64 = c
        .query_row("SELECT points FROM customers WHERE id = ?1", [id], |r| r.get(0))
        .map_err(|_| format!("Kunde {id} nicht gefunden"))?;
    let after = (cur + delta).max(0);
    let real = after - cur;
    if real == 0 {
        return Ok((0, cur));
    }
    c.execute("UPDATE customers SET points = ?2, updated_at = ?3 WHERE id = ?1", params![id, after, db::now()]).map_err(|e| e.to_string())?;
    c.execute(
        "INSERT INTO points_log(ts, customer_id, delta, balance, reason, ref, user) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![db::now(), id, real, after, reason, refno, user],
    )
    .map_err(|e| e.to_string())?;
    Ok((real, after))
}

pub fn points_log(c: &Connection, id: &str, limit: i64) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare("SELECT ts, delta, balance, reason, ref, user FROM points_log WHERE customer_id = ?1 ORDER BY id DESC LIMIT ?2")?;
    let rows = st.query_map(params![id, limit], |r| {
        Ok(json!({ "ts": r.get::<_, String>(0)?, "delta": r.get::<_, i64>(1)?, "balance": r.get::<_, i64>(2)?,
            "reason": r.get::<_, String>(3)?, "ref": r.get::<_, Option<String>>(4)?, "user": r.get::<_, Option<String>>(5)? }))
    })?;
    rows.collect()
}

/// Erstbefüllung (nur wenn noch keine Kunden existieren). Startpunkte werden als „Übernahme“ gebucht.
pub fn seed(c: &Connection, list: &[Customer]) -> Result<usize, String> {
    if db::count(c, "customers") > 0 {
        return Ok(0);
    }
    for k in list {
        let id = save(c, k)?;
        if k.points > 0 {
            book_points(c, &id, k.points, "Übernahme", None, Some("System"))?;
        }
    }
    Ok(list.len())
}
