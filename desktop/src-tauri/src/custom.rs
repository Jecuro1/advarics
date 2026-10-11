//! Anpassbarkeit: eigene Felder (mit Typ, Pflicht, Auswahlwerten) für Artikel, Kunden, Lieferanten und
//! eigene Objekte – und eigene Objekte selbst (z. B. Reparaturaufträge, Verleih, Events) mit Datensätzen.

use crate::db;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

pub const TYPES: &[&str] = &["text", "mehrzeilig", "zahl", "betrag", "datum", "auswahl", "janein", "email", "telefon"];

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FieldDef {
    #[serde(default)]
    pub id: Option<i64>,
    /// "artikel" | "kunde" | "lieferant" | "obj:<objekt>"
    pub object: String,
    pub key: String,
    pub label: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub at_pos: bool,
    #[serde(default)]
    pub help: String,
    #[serde(default)]
    pub pos: i64,
}

pub fn slug(s: &str) -> String {
    let mut out = String::new();
    for c in s.trim().to_lowercase().chars() {
        let c = match c {
            'ä' => "ae".to_string(),
            'ö' => "oe".to_string(),
            'ü' => "ue".to_string(),
            'ß' => "ss".to_string(),
            c if c.is_ascii_alphanumeric() => c.to_string(),
            _ => "_".to_string(),
        };
        out.push_str(&c);
    }
    let out = out.split('_').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("_");
    out.chars().take(40).collect()
}

pub fn fields(c: &Connection, object: Option<&str>) -> rusqlite::Result<Vec<FieldDef>> {
    let mut st = c.prepare("SELECT id, object, key, label, type, options, required, at_pos, help, pos FROM field_defs WHERE (?1 IS NULL OR object = ?1) ORDER BY object, pos, id")?;
    let rows = st.query_map([object], |r| {
        Ok(FieldDef {
            id: Some(r.get(0)?),
            object: r.get(1)?,
            key: r.get(2)?,
            label: r.get(3)?,
            kind: r.get(4)?,
            options: serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or_default(),
            required: r.get::<_, i64>(6)? != 0,
            at_pos: r.get::<_, i64>(7)? != 0,
            help: r.get(8)?,
            pos: r.get(9)?,
        })
    })?;
    rows.collect()
}

pub fn field_save(c: &Connection, f: &FieldDef) -> Result<i64, String> {
    let valid_obj = ["artikel", "kunde", "lieferant"].contains(&f.object.as_str()) || f.object.strip_prefix("obj:").map(|e| entity_exists(c, e)).unwrap_or(false);
    if !valid_obj {
        return Err("Unbekanntes Objekt".into());
    }
    if f.label.trim().is_empty() {
        return Err("Bezeichnung fehlt".into());
    }
    if !TYPES.contains(&f.kind.as_str()) {
        return Err("Unbekannter Feldtyp".into());
    }
    if f.kind == "auswahl" && f.options.iter().filter(|o| !o.trim().is_empty()).count() < 2 {
        return Err("Auswahlfeld braucht mindestens zwei Werte".into());
    }
    let key = if f.key.trim().is_empty() { slug(&f.label) } else { slug(&f.key) };
    if key.is_empty() {
        return Err("Feldname ungültig".into());
    }
    let opts = serde_json::to_string(&f.options.iter().map(|o| o.trim()).filter(|o| !o.is_empty()).collect::<Vec<_>>()).unwrap();
    match f.id {
        Some(id) => {
            c.execute(
                "UPDATE field_defs SET label=?2, type=?3, options=?4, required=?5, at_pos=?6, help=?7, pos=?8 WHERE id=?1",
                params![id, f.label.trim(), f.kind, opts, f.required as i64, f.at_pos as i64, f.help.trim(), f.pos],
            )
            .map_err(|e| e.to_string())?;
            Ok(id)
        }
        None => {
            c.execute(
                "INSERT INTO field_defs(object, key, label, type, options, required, at_pos, help, pos) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![f.object, key, f.label.trim(), f.kind, opts, f.required as i64, f.at_pos as i64, f.help.trim(), f.pos],
            )
            .map_err(|e| if e.to_string().contains("UNIQUE") { format!("Feld „{key}“ gibt es bereits") } else { e.to_string() })?;
            Ok(c.last_insert_rowid())
        }
    }
}

pub fn field_delete(c: &Connection, id: i64) -> Result<(), String> {
    c.execute("DELETE FROM field_defs WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Werte gegen die Felddefinitionen prüfen und normalisieren (Zahlen als Zahl, Ja/Nein als bool).
pub fn validate(c: &Connection, object: &str, values: &Value) -> Result<Value, String> {
    let defs = fields(c, Some(object)).map_err(|e| e.to_string())?;
    let mut out: Map<String, Value> = values.as_object().cloned().unwrap_or_default();
    for d in &defs {
        let v = out.get(&d.key).cloned().unwrap_or(Value::Null);
        let empty = v.is_null() || v.as_str().map(|s| s.trim().is_empty()).unwrap_or(false);
        if empty {
            if d.required && d.kind != "janein" {
                return Err(format!("Pflichtfeld „{}“ fehlt", d.label));
            }
            out.remove(&d.key);
            continue;
        }
        let s = match &v {
            Value::String(s) => s.trim().to_string(),
            other => other.to_string(),
        };
        let norm = match d.kind.as_str() {
            "zahl" | "betrag" => {
                let n: f64 = s.replace(' ', "").replace(',', ".").parse().map_err(|_| format!("„{}“ muss eine Zahl sein", d.label))?;
                json!(n)
            }
            "datum" => {
                chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").map_err(|_| format!("„{}“ muss ein Datum sein", d.label))?;
                json!(s)
            }
            "auswahl" => {
                if !d.options.contains(&s) {
                    return Err(format!("„{}“: Wert „{s}“ ist nicht vorgesehen", d.label));
                }
                json!(s)
            }
            "janein" => json!(matches!(s.as_str(), "true" | "ja" | "1")),
            "email" => {
                if !s.contains('@') || s.contains(' ') {
                    return Err(format!("„{}“ ist keine E-Mail-Adresse", d.label));
                }
                json!(s)
            }
            _ => json!(s),
        };
        out.insert(d.key.clone(), norm);
    }
    Ok(Value::Object(out))
}

/* ── Eigene Objekte ── */

#[derive(Serialize, Deserialize, Clone)]
pub struct Entity {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub plural: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub title_field: Option<String>,
    #[serde(default)]
    pub count: i64,
}

fn entity_exists(c: &Connection, id: &str) -> bool {
    c.query_row("SELECT 1 FROM entities WHERE id = ?1", [id], |_| Ok(())).optional().ok().flatten().is_some()
}

pub fn entities(c: &Connection) -> rusqlite::Result<Vec<Entity>> {
    let mut st = c.prepare("SELECT e.id, e.name, e.plural, e.icon, e.title_field, (SELECT COUNT(*) FROM records r WHERE r.entity = e.id) FROM entities e ORDER BY e.name")?;
    let rows = st.query_map([], |r| Ok(Entity { id: r.get(0)?, name: r.get(1)?, plural: r.get(2)?, icon: r.get(3)?, title_field: r.get(4)?, count: r.get(5)? }))?;
    rows.collect()
}

pub fn entity_save(c: &Connection, e: &Entity) -> Result<String, String> {
    if e.name.trim().is_empty() || e.plural.trim().is_empty() {
        return Err("Name (Einzahl und Mehrzahl) fehlt".into());
    }
    let id = if e.id.is_empty() { slug(&e.plural) } else { e.id.clone() };
    if id.is_empty() {
        return Err("Name ungültig".into());
    }
    c.execute(
        "INSERT INTO entities(id, name, plural, icon, title_field, created_at) VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, plural=excluded.plural, icon=excluded.icon, title_field=excluded.title_field",
        params![id, e.name.trim(), e.plural.trim(), if e.icon.is_empty() { "layers" } else { &e.icon }, e.title_field, db::now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn entity_delete(c: &Connection, id: &str) -> Result<(), String> {
    let n: i64 = c.query_row("SELECT COUNT(*) FROM records WHERE entity = ?1", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if n > 0 {
        return Err(format!("Es gibt noch {n} Datensätze – zuerst löschen"));
    }
    c.execute("DELETE FROM field_defs WHERE object = ?1", [format!("obj:{id}")]).map_err(|e| e.to_string())?;
    c.execute("DELETE FROM entities WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn records(c: &Connection, entity: &str, q: Option<&str>, limit: i64) -> rusqlite::Result<Vec<Value>> {
    let like = q.map(|q| format!("%{}%", q.to_lowercase()));
    let mut st = c.prepare("SELECT id, data, created_at, updated_at, user FROM records WHERE entity = ?1 AND (?2 IS NULL OR lower(data) LIKE ?2) ORDER BY id DESC LIMIT ?3")?;
    let rows = st.query_map(params![entity, like, limit], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "data": serde_json::from_str::<Value>(&r.get::<_, String>(1)?).unwrap_or(json!({})),
            "created_at": r.get::<_, String>(2)?, "updated_at": r.get::<_, String>(3)?, "user": r.get::<_, Option<String>>(4)? }))
    })?;
    rows.collect()
}

pub fn record_get(c: &Connection, entity: &str, id: i64) -> Result<Value, String> {
    c.query_row("SELECT id, data, created_at, updated_at, user FROM records WHERE entity = ?1 AND id = ?2", params![entity, id], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "data": serde_json::from_str::<Value>(&r.get::<_, String>(1)?).unwrap_or(json!({})),
            "created_at": r.get::<_, String>(2)?, "updated_at": r.get::<_, String>(3)?, "user": r.get::<_, Option<String>>(4)? }))
    })
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Datensatz nicht gefunden".into())
}

pub fn record_save(c: &Connection, entity: &str, id: Option<i64>, data: &Value, user: Option<&str>) -> Result<i64, String> {
    if !entity_exists(c, entity) {
        return Err("Objekt nicht gefunden".into());
    }
    let data = validate(c, &format!("obj:{entity}"), data)?;
    let now = db::now();
    match id {
        Some(id) => {
            let n = c
                .execute("UPDATE records SET data = ?3, updated_at = ?4, user = ?5 WHERE entity = ?1 AND id = ?2", params![entity, id, data.to_string(), now, user])
                .map_err(|e| e.to_string())?;
            if n == 0 {
                return Err("Datensatz nicht gefunden".into());
            }
            Ok(id)
        }
        None => {
            c.execute("INSERT INTO records(entity, data, created_at, updated_at, user) VALUES (?1,?2,?3,?3,?4)", params![entity, data.to_string(), now, user])
                .map_err(|e| e.to_string())?;
            Ok(c.last_insert_rowid())
        }
    }
}

pub fn record_delete(c: &Connection, entity: &str, id: i64) -> Result<(), String> {
    c.execute("DELETE FROM records WHERE entity = ?1 AND id = ?2", params![entity, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn felder_und_objekte() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        assert_eq!(slug("Größe Schuh (EU)"), "groesse_schuh_eu");
        let id = entity_save(&c, &Entity { id: String::new(), name: "Reparaturauftrag".into(), plural: "Reparaturaufträge".into(), icon: "wrench".into(), title_field: Some("titel".into()), count: 0 }).unwrap();
        assert_eq!(id, "reparaturauftraege");
        let f = |key: &str, kind: &str, req: bool, opts: &[&str]| FieldDef { id: None, object: format!("obj:{id}"), key: key.into(), label: key.into(), kind: kind.into(), options: opts.iter().map(|s| s.to_string()).collect(), required: req, at_pos: false, help: String::new(), pos: 0 };
        field_save(&c, &f("titel", "text", true, &[])).unwrap();
        field_save(&c, &f("preis", "betrag", false, &[])).unwrap();
        field_save(&c, &f("status", "auswahl", true, &["offen", "fertig"])).unwrap();
        field_save(&c, &f("abholung", "datum", false, &[])).unwrap();
        assert!(field_save(&c, &f("x", "auswahl", false, &["nur eins"])).is_err());
        assert!(record_save(&c, &id, None, &json!({ "status": "offen" }), None).unwrap_err().contains("titel"));
        assert!(record_save(&c, &id, None, &json!({ "titel": "Ski", "status": "kaputt" }), None).is_err());
        assert!(record_save(&c, &id, None, &json!({ "titel": "Ski", "status": "offen", "abholung": "morgen" }), None).is_err());
        let r = record_save(&c, &id, None, &json!({ "titel": "Skiservice", "status": "offen", "preis": "29,50", "abholung": "2026-10-20" }), Some("T")).unwrap();
        let rec = record_get(&c, &id, r).unwrap();
        assert_eq!(rec["data"]["preis"], json!(29.5));
        assert_eq!(records(&c, &id, Some("SKISERV"), 10).unwrap().len(), 1);
        assert!(entity_delete(&c, &id).is_err(), "Datensätze vorhanden");
        record_delete(&c, &id, r).unwrap();
        entity_delete(&c, &id).unwrap();
        assert!(fields(&c, Some(&format!("obj:{id}"))).unwrap().is_empty());
    }
}
