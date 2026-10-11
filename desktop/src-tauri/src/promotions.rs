//! Preisaktionen: prozentualer Nachlass für einen Zeitraum auf alle Artikel, eine Warengruppe,
//! eine Marke oder ausgewählte Artikel. Die Kasse wendet den günstigsten gültigen Preis an.

use crate::db;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Clone)]
pub struct Promotion {
    #[serde(default)]
    pub id: Option<i64>,
    pub name: String,
    pub pct: i64,
    /// "alle" | "warengruppe" | "marke" | "artikel"
    pub scope: String,
    #[serde(default)]
    pub scope_values: Vec<String>,
    pub from_date: String,
    pub to_date: String,
    #[serde(default = "yes")]
    pub active: bool,
}
fn yes() -> bool {
    true
}

pub fn list(c: &Connection) -> rusqlite::Result<Vec<Promotion>> {
    let mut st = c.prepare("SELECT id, name, pct, scope, scope_values, from_date, to_date, active FROM promotions ORDER BY from_date DESC, id DESC")?;
    let rows = st.query_map([], |r| {
        Ok(Promotion {
            id: Some(r.get(0)?),
            name: r.get(1)?,
            pct: r.get(2)?,
            scope: r.get(3)?,
            scope_values: serde_json::from_str::<Value>(&r.get::<_, String>(4)?).ok().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default(),
            from_date: r.get(5)?,
            to_date: r.get(6)?,
            active: r.get::<_, i64>(7)? != 0,
        })
    })?;
    rows.collect()
}

fn valid_date(s: &str) -> bool {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

pub fn save(c: &Connection, p: &Promotion) -> Result<i64, String> {
    if p.name.trim().is_empty() {
        return Err("Name fehlt".into());
    }
    if !(1..=90).contains(&p.pct) {
        return Err("Nachlass zwischen 1 und 90 %".into());
    }
    if !["alle", "warengruppe", "marke", "artikel"].contains(&p.scope.as_str()) {
        return Err("Geltungsbereich ungültig".into());
    }
    if p.scope != "alle" && p.scope_values.is_empty() {
        return Err("Bitte mindestens einen Eintrag für den Geltungsbereich wählen".into());
    }
    if !valid_date(&p.from_date) || !valid_date(&p.to_date) || p.to_date < p.from_date {
        return Err("Zeitraum ungültig".into());
    }
    let vals = serde_json::to_string(&p.scope_values).unwrap();
    let now = db::now();
    match p.id {
        Some(id) => {
            c.execute(
                "UPDATE promotions SET name=?2, pct=?3, scope=?4, scope_values=?5, from_date=?6, to_date=?7, active=?8, updated_at=?9 WHERE id=?1",
                params![id, p.name.trim(), p.pct, p.scope, vals, p.from_date, p.to_date, p.active as i64, now],
            )
            .map_err(|e| e.to_string())?;
            Ok(id)
        }
        None => {
            c.execute(
                "INSERT INTO promotions(name, pct, scope, scope_values, from_date, to_date, active, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",
                params![p.name.trim(), p.pct, p.scope, vals, p.from_date, p.to_date, p.active as i64, now],
            )
            .map_err(|e| e.to_string())?;
            Ok(c.last_insert_rowid())
        }
    }
}

pub fn delete(c: &Connection, id: i64) -> Result<(), String> {
    c.execute("DELETE FROM promotions WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}
