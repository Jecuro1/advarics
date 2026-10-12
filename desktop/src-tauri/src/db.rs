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
    // 3 · Kunden, Bonuspunkte, Retouren und Stornos
    r#"
    CREATE TABLE customers (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        email       TEXT NOT NULL DEFAULT '',
        phone       TEXT NOT NULL DEFAULT '',
        tier        TEXT NOT NULL DEFAULT 'Kunde',
        points      INTEGER NOT NULL DEFAULT 0,
        club_name   TEXT,
        club_pct    INTEGER,
        fields      TEXT NOT NULL DEFAULT '{}',
        consent     INTEGER NOT NULL DEFAULT 0,
        note        TEXT NOT NULL DEFAULT '',
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE TABLE points_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts          TEXT NOT NULL,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        delta       INTEGER NOT NULL,
        balance     INTEGER NOT NULL,
        reason      TEXT NOT NULL,
        ref         TEXT,
        user        TEXT
    );
    CREATE INDEX points_log_customer ON points_log(customer_id, id);
    INSERT INTO counters(name, value) VALUES ('kunde', 11600);
    ALTER TABLE sales ADD COLUMN kind TEXT NOT NULL DEFAULT 'verkauf';
    ALTER TABLE sales ADD COLUMN ref_no TEXT;
    ALTER TABLE sales ADD COLUMN voided INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX sales_customer ON sales(customer_id, id);
    CREATE INDEX sales_ref ON sales(ref_no);
    "#,
    // 4 · Benutzer, Gutscheine, Kassenbuch, Tagesabschluss, RKSV, Einkauf
    r#"
    CREATE TABLE users (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        role         TEXT NOT NULL DEFAULT 'kasse',
        pin_hash     TEXT NOT NULL,
        pin_salt     TEXT NOT NULL,
        failed       INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        active       INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
    );
    CREATE TABLE vouchers (
        code        TEXT PRIMARY KEY,
        initial     INTEGER NOT NULL,
        balance     INTEGER NOT NULL,
        status      TEXT NOT NULL DEFAULT 'aktiv',
        sale_no     TEXT,
        customer_id TEXT,
        valid_until TEXT,
        created_at  TEXT NOT NULL
    );
    CREATE TABLE voucher_moves (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      TEXT NOT NULL,
        code    TEXT NOT NULL REFERENCES vouchers(code),
        delta   INTEGER NOT NULL,
        balance INTEGER NOT NULL,
        reason  TEXT NOT NULL,
        ref     TEXT,
        user    TEXT
    );
    CREATE TABLE cash_moves (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ts         TEXT NOT NULL,
        kind       TEXT NOT NULL,
        amount     INTEGER NOT NULL,
        reason     TEXT NOT NULL,
        user       TEXT,
        closing_id INTEGER
    );
    CREATE TABLE closings (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        no       INTEGER NOT NULL UNIQUE,
        ts       TEXT NOT NULL,
        from_ts  TEXT NOT NULL,
        expected INTEGER NOT NULL,
        counted  INTEGER NOT NULL,
        diff     INTEGER NOT NULL,
        user     TEXT,
        data     TEXT NOT NULL
    );
    CREATE TABLE rksv (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        kassen_id   TEXT NOT NULL,
        mode        TEXT NOT NULL,
        aes_key     TEXT NOT NULL,
        sig_key     TEXT NOT NULL,
        public_key  TEXT NOT NULL,
        cert_serial TEXT NOT NULL,
        turnover    INTEGER NOT NULL DEFAULT 0,
        last_jws    TEXT,
        started_at  TEXT NOT NULL
    );
    CREATE TABLE dep (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        beleg_no TEXT NOT NULL,
        ts       TEXT NOT NULL,
        kind     TEXT NOT NULL,
        jws      TEXT NOT NULL
    );
    ALTER TABLE sales ADD COLUMN rksv TEXT;
    CREATE TABLE suppliers (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        contact     TEXT NOT NULL DEFAULT '',
        email       TEXT NOT NULL DEFAULT '',
        phone       TEXT NOT NULL DEFAULT '',
        customer_no TEXT NOT NULL DEFAULT '',
        lead_days   INTEGER NOT NULL DEFAULT 7,
        note        TEXT NOT NULL DEFAULT '',
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE TABLE purchase_orders (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        no          TEXT NOT NULL UNIQUE,
        supplier_id TEXT NOT NULL REFERENCES suppliers(id),
        status      TEXT NOT NULL DEFAULT 'entwurf',
        note        TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        ordered_at  TEXT,
        user        TEXT
    );
    CREATE TABLE po_lines (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        po_id      INTEGER NOT NULL REFERENCES purchase_orders(id),
        variant_id INTEGER NOT NULL REFERENCES variants(id),
        qty        INTEGER NOT NULL,
        received   INTEGER NOT NULL DEFAULT 0,
        cost       INTEGER
    );
    CREATE INDEX po_lines_po ON po_lines(po_id);
    ALTER TABLE articles ADD COLUMN cost INTEGER;
    ALTER TABLE articles ADD COLUMN supplier_id TEXT;
    ALTER TABLE articles ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 2;
    INSERT INTO counters(name, value) VALUES ('bestellung', 0), ('abschluss', 0);
    "#,
    // 5 · Bilder, Kundenadressen, Preisaktionen, Inventur
    r#"
    ALTER TABLE articles ADD COLUMN image TEXT;
    ALTER TABLE customers ADD COLUMN street TEXT NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN zip TEXT NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN city TEXT NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN country TEXT NOT NULL DEFAULT 'AT';
    ALTER TABLE customers ADD COLUMN uid TEXT NOT NULL DEFAULT '';
    CREATE TABLE promotions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        pct         INTEGER NOT NULL,
        scope       TEXT NOT NULL DEFAULT 'alle',
        scope_values TEXT NOT NULL DEFAULT '[]',
        from_date   TEXT NOT NULL,
        to_date     TEXT NOT NULL,
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE TABLE inventories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        no         TEXT NOT NULL UNIQUE,
        status     TEXT NOT NULL DEFAULT 'offen',
        scope      TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        closed_at  TEXT,
        user       TEXT,
        result     TEXT
    );
    CREATE TABLE inventory_lines (
        inv_id     INTEGER NOT NULL REFERENCES inventories(id),
        variant_id INTEGER NOT NULL REFERENCES variants(id),
        expected   INTEGER NOT NULL,
        counted    INTEGER,
        PRIMARY KEY (inv_id, variant_id)
    );
    INSERT INTO counters(name, value) VALUES ('inventur', 0);
    "#,
    // 6 · Anpassbarkeit (Felder, Objekte, Regeln, Skripte, Webhooks, API), Rechte, Zwei-Faktor, Terminal
    r#"
    CREATE TABLE field_defs (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        object   TEXT NOT NULL,
        key      TEXT NOT NULL,
        label    TEXT NOT NULL,
        type     TEXT NOT NULL DEFAULT 'text',
        options  TEXT NOT NULL DEFAULT '[]',
        required INTEGER NOT NULL DEFAULT 0,
        at_pos   INTEGER NOT NULL DEFAULT 0,
        help     TEXT NOT NULL DEFAULT '',
        pos      INTEGER NOT NULL DEFAULT 0,
        UNIQUE(object, key)
    );
    CREATE TABLE entities (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        plural      TEXT NOT NULL,
        icon        TEXT NOT NULL DEFAULT 'layers',
        title_field TEXT,
        created_at  TEXT NOT NULL
    );
    CREATE TABLE records (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        entity     TEXT NOT NULL REFERENCES entities(id),
        data       TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        user       TEXT
    );
    CREATE INDEX records_entity ON records(entity, id);
    CREATE TABLE rules (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        trigger    TEXT NOT NULL,
        conditions TEXT NOT NULL DEFAULT '[]',
        actions    TEXT NOT NULL DEFAULT '[]',
        active     INTEGER NOT NULL DEFAULT 1,
        runs       INTEGER NOT NULL DEFAULT 0,
        last_run   TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE scripts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        code       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE webhooks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        url        TEXT NOT NULL,
        events     TEXT NOT NULL DEFAULT '[]',
        secret     TEXT NOT NULL,
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    );
    CREATE TABLE webhook_queue (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_id  INTEGER NOT NULL,
        event       TEXT NOT NULL,
        payload     TEXT NOT NULL,
        attempts    INTEGER NOT NULL DEFAULT 0,
        next_at     TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'offen',
        last_status INTEGER,
        last_error  TEXT,
        created_at  TEXT NOT NULL,
        done_at     TEXT
    );
    CREATE INDEX webhook_queue_due ON webhook_queue(status, next_at);
    CREATE TABLE api_keys (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        key_hash   TEXT NOT NULL UNIQUE,
        prefix     TEXT NOT NULL,
        scopes     TEXT NOT NULL DEFAULT '["lesen"]',
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        last_used  TEXT
    );
    CREATE TABLE api_endpoints (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        slug       TEXT NOT NULL UNIQUE,
        title      TEXT NOT NULL,
        sql        TEXT NOT NULL,
        params     TEXT NOT NULL DEFAULT '[]',
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    );
    CREATE TABLE permissions (
        role    TEXT NOT NULL,
        perm    TEXT NOT NULL,
        allowed INTEGER NOT NULL,
        PRIMARY KEY (role, perm)
    );
    ALTER TABLE users ADD COLUMN totp_secret TEXT;
    ALTER TABLE suppliers ADD COLUMN fields TEXT NOT NULL DEFAULT '{}';
    CREATE TABLE terminal_log (
        id     INTEGER PRIMARY KEY AUTOINCREMENT,
        ts     TEXT NOT NULL,
        kind   TEXT NOT NULL,
        amount INTEGER NOT NULL,
        ok     INTEGER NOT NULL,
        result TEXT NOT NULL
    );
    "#,
    // 7 · Filialverbund, Erweiterungen, weitere Anmeldemethoden
    r#"
    CREATE TABLE stores (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        addr       TEXT NOT NULL DEFAULT '',
        key_hash   TEXT,
        created_at TEXT NOT NULL,
        last_sync  TEXT,
        last_ip    TEXT,
        info       TEXT NOT NULL DEFAULT '{}',
        active     INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE store_sales (
        store       TEXT NOT NULL,
        beleg_no    TEXT NOT NULL,
        ts          TEXT NOT NULL,
        total       INTEGER NOT NULL,
        kind        TEXT NOT NULL,
        cashier     TEXT,
        customer_id TEXT,
        data        TEXT NOT NULL,
        PRIMARY KEY (store, beleg_no)
    );
    CREATE INDEX store_sales_ts ON store_sales(ts);
    CREATE TABLE store_stock (
        store      TEXT NOT NULL,
        ean        TEXT NOT NULL,
        stock      INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (store, ean)
    );
    CREATE TABLE store_points (store TEXT NOT NULL, log_id INTEGER NOT NULL, PRIMARY KEY (store, log_id));
    CREATE TABLE verbund_pulled (customer_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL);
    CREATE TABLE transfers (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        no         TEXT NOT NULL UNIQUE,
        from_store TEXT NOT NULL,
        to_store   TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'angefordert',
        lines      TEXT NOT NULL DEFAULT '[]',
        note       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        user       TEXT,
        booked_out INTEGER NOT NULL DEFAULT 0,
        booked_in  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE extensions (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        version      TEXT NOT NULL,
        author       TEXT NOT NULL DEFAULT '',
        manifest     TEXT NOT NULL,
        enabled      INTEGER NOT NULL DEFAULT 1,
        installed_at TEXT NOT NULL
    );
    ALTER TABLE users ADD COLUMN login TEXT;
    ALTER TABLE users ADD COLUMN pw_hash TEXT;
    ALTER TABLE users ADD COLUMN pw_salt TEXT;
    ALTER TABLE users ADD COLUMN hello INTEGER NOT NULL DEFAULT 0;
    INSERT INTO counters(name, value) VALUES ('umlagerung', 0);
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Bestehende Datenbank aus 0.5.0 (Schema 2, mit Belegen) wird verlustfrei auf den neuesten Stand gebracht.
    #[test]
    fn migration_von_schema_2() {
        let c = Connection::open_in_memory().unwrap();
        for m in &MIGRATIONS[..2] {
            c.execute_batch(m).unwrap();
        }
        c.pragma_update(None, "user_version", 2).unwrap();
        c.execute("INSERT INTO sales(beleg_no, ts, total, cashier, customer_id, data) VALUES ('2026-004718', '2026-10-11T10:00:00+02:00', 4490, 'Lena', 'K-10234', '{}')", []).unwrap();
        migrate(&c).unwrap();
        let v: i64 = c.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(v, schema_version());
        let (kind, voided): (String, i64) = c.query_row("SELECT kind, voided FROM sales", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((kind.as_str(), voided), ("verkauf", 0));
        assert_eq!(count(&c, "customers"), 0);
    }
}
