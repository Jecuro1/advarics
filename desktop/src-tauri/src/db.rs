//! Lokale Datenbank (SQLite) – eine Datei im Datenverzeichnis des Benutzers.
//! Schema-Änderungen laufen über nummerierte Migrationen (PRAGMA user_version).

use rusqlite::{params, Connection};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Db {
    pub conn: Mutex<Connection>,
    pub path: PathBuf,
}

/// Jede Migration genau einmal, in dieser Reihenfolge. Niemals bestehende Einträge ändern – nur anhängen.
const MIGRATIONS: &[&str] = &[
    // 1 · Fundament
    r#"
    CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE audit_log (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      TEXT NOT NULL,
        event   TEXT NOT NULL,
        payload TEXT NOT NULL
    );
    CREATE INDEX audit_log_ts ON audit_log(ts);
    CREATE TABLE backup_log (
        id     INTEGER PRIMARY KEY AUTOINCREMENT,
        ts     TEXT NOT NULL,
        kind   TEXT NOT NULL,
        path   TEXT NOT NULL,
        bytes  INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        ok     INTEGER NOT NULL,
        note   TEXT
    );
    "#,
    // 2 · Artikel, Varianten, Bestand, Belege
    r#"
    CREATE TABLE articles (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        brand       TEXT NOT NULL DEFAULT '',
        category    TEXT NOT NULL,
        glyph       TEXT NOT NULL DEFAULT 'shirt',
        price       INTEGER NOT NULL,
        sale_price  INTEGER,
        vat         INTEGER NOT NULL DEFAULT 20,
        tag         TEXT,
        popularity  INTEGER NOT NULL DEFAULT 0,
        colors      TEXT NOT NULL DEFAULT '[]',
        sizes       TEXT NOT NULL DEFAULT '[]',
        fields      TEXT NOT NULL DEFAULT '{}',
        prompts     TEXT NOT NULL DEFAULT 'null',
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE TABLE variants (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id  TEXT NOT NULL REFERENCES articles(id),
        color       TEXT NOT NULL,
        size        TEXT NOT NULL,
        ean         TEXT NOT NULL UNIQUE,
        stock       INTEGER NOT NULL DEFAULT 0,
        active      INTEGER NOT NULL DEFAULT 1,
        UNIQUE(article_id, color, size)
    );
    CREATE TABLE stock_moves (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts          TEXT NOT NULL,
        variant_id  INTEGER NOT NULL REFERENCES variants(id),
        delta       INTEGER NOT NULL,
        stock_after INTEGER NOT NULL,
        reason      TEXT NOT NULL,
        ref         TEXT,
        user        TEXT
    );
    CREATE INDEX stock_moves_variant ON stock_moves(variant_id, id);
    CREATE TABLE sales (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        beleg_no    TEXT NOT NULL UNIQUE,
        ts          TEXT NOT NULL,
        total       INTEGER NOT NULL,
        cashier     TEXT,
        customer_id TEXT,
        data        TEXT NOT NULL
    );
    CREATE INDEX sales_ts ON sales(ts);
    CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
    INSERT INTO counters(name, value) VALUES ('beleg', 4717);
    "#,
];

pub fn schema_version() -> i64 {
    MIGRATIONS.len() as i64
}

pub fn now() -> String {
    chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let c = Connection::open(path)?;
    c.pragma_update(None, "journal_mode", "WAL")?;
    c.pragma_update(None, "synchronous", "NORMAL")?;
    c.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&c)?;
    Ok(c)
}

pub fn migrate(c: &Connection) -> rusqlite::Result<()> {
    let v: i64 = c.pragma_query_value(None, "user_version", |r| r.get(0))?;
    for (i, m) in MIGRATIONS.iter().enumerate().skip(v.max(0) as usize) {
        let tx = c.unchecked_transaction()?;
        tx.execute_batch(m)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

pub fn settings_all(c: &Connection) -> rusqlite::Result<Map<String, Value>> {
    let mut st = c.prepare("SELECT key, value FROM settings")?;
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut map = Map::new();
    for row in rows {
        let (k, v) = row?;
        map.insert(k, serde_json::from_str(&v).unwrap_or(Value::Null));
    }
    Ok(map)
}

pub fn setting_set(c: &Connection, key: &str, value: &Value) -> rusqlite::Result<()> {
    c.execute(
        "INSERT INTO settings(key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value.to_string(), now()],
    )?;
    Ok(())
}

pub fn setting_get(c: &Connection, key: &str) -> Option<Value> {
    c.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get::<_, String>(0))
        .ok()
        .and_then(|v| serde_json::from_str(&v).ok())
}

pub fn audit_append(c: &Connection, event: &str, payload: &Value) -> rusqlite::Result<()> {
    c.execute(
        "INSERT INTO audit_log(ts, event, payload) VALUES (?1, ?2, ?3)",
        params![now(), event, payload.to_string()],
    )?;
    Ok(())
}

pub fn count(c: &Connection, table: &str) -> i64 {
    // nur interne, feste Tabellennamen
    c.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap_or(0)
}
