//! Erweiterungen: installierbare Pakete (Format kontor.erweiterung/v1) mit Manifest. Was eine Erweiterung
//! mitbringt (Felder, Objekte, Regeln, Skripte, Endpunkte, Widgets, Befehle), legt die Oberfläche über die
//! normalen Funktionen an; hier wird das Paket selbst gespeichert, aktiviert/deaktiviert und entfernt.

use crate::db;
use rusqlite::{params, Connection};
use serde_json::{json, Value};

pub fn list(c: &Connection) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare("SELECT id, name, version, author, manifest, enabled, installed_at FROM extensions ORDER BY name")?;
    let rows = st.query_map([], |r| {
        Ok(json!({ "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "version": r.get::<_, String>(2)?, "author": r.get::<_, String>(3)?,
            "manifest": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(json!({})), "enabled": r.get::<_, i64>(5)? != 0, "installed_at": r.get::<_, String>(6)? }))
    })?;
    rows.collect()
}

pub fn validate(m: &Value) -> Result<(), String> {
    if m["format"].as_str() != Some("kontor.erweiterung/v1") {
        return Err("Keine Kontor-Erweiterung (format fehlt)".into());
    }
    let id = m["id"].as_str().unwrap_or("");
    if id.len() < 3 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') {
        return Err("Kennung (id) ungültig".into());
    }
    if m["name"].as_str().unwrap_or("").trim().is_empty() || m["version"].as_str().unwrap_or("").is_empty() {
        return Err("Name oder Version fehlt".into());
    }
    let size = m.to_string().len();
    if size > 2_000_000 {
        return Err("Erweiterung zu groß".into());
    }
    Ok(())
}

pub fn install(c: &Connection, m: &Value) -> Result<(), String> {
    validate(m)?;
    c.execute(
        "INSERT INTO extensions(id, name, version, author, manifest, enabled, installed_at) VALUES (?1,?2,?3,?4,?5,1,?6)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, version=excluded.version, author=excluded.author, manifest=excluded.manifest",
        params![m["id"].as_str(), m["name"].as_str(), m["version"].as_str(), m["author"].as_str().unwrap_or(""), m.to_string(), db::now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_enabled(c: &Connection, id: &str, on: bool) -> Result<(), String> {
    c.execute("UPDATE extensions SET enabled = ?2 WHERE id = ?1", params![id, on as i64]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove(c: &Connection, id: &str) -> Result<(), String> {
    c.execute("DELETE FROM extensions WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}
