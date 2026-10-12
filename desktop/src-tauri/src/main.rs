// Kontor – Desktop-Client (Windows).
// Ohne Konsolenfenster im Release-Build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod accounting;
mod ai;
mod api;
mod automation;
mod backup;
mod catalog;
mod custom;
mod security;
mod zvt;
mod mobile;
mod verbund;
mod auth;
mod extensions;
mod closing;
mod customers;
mod db;
mod images;
mod inventory;
mod mail;
mod printer;
mod promotions;
mod purchasing;
mod rksv;
mod sales;
mod updates;
mod users;
mod vouchers;
mod vorgang;
mod shop;
mod stamm;
mod media;
mod fedas;
mod demo;
mod advarics;
mod msg;

use base64::Engine as _;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

type Res<T> = Result<T, String>;
fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Serialize)]
struct AppInfo {
    version: String,
    os: String,
    data_dir: String,
    db_path: String,
    db_bytes: u64,
    schema: i64,
    settings: i64,
    audit_entries: i64,
    backup_dir: String,
    last_backup: Option<String>,
}

fn version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

pub(crate) fn backup_dir(app: &AppHandle, db: &db::Db) -> PathBuf {
    let c = db.conn.lock().unwrap();
    if let Some(Value::String(s)) = db::setting_get(&c, "backup.dir") {
        if !s.trim().is_empty() {
            return PathBuf::from(s);
        }
    }
    app.path()
        .document_dir()
        .unwrap_or_else(|_| db.path.parent().unwrap().to_path_buf())
        .join("Kontor-Sicherungen")
}

/// Datenverzeichnis (Datenbank, Bilder, Sicherungspasswort)
pub(crate) fn data_dir(db: &db::Db) -> PathBuf {
    db.path.parent().unwrap().to_path_buf()
}

/// Sicherungspasswort liegt bewusst NICHT in der Datenbank (sonst stünde es in jeder Sicherung),
/// sondern als Datei im Datenverzeichnis dieses Rechners.
pub(crate) fn backup_password(db: &db::Db) -> Option<String> {
    std::fs::read_to_string(data_dir(db).join("backup-passwort")).ok().map(|s| s.trim_end_matches(['\r', '\n']).to_string()).filter(|s| !s.is_empty())
}

#[tauri::command]
fn backup_password_set(db: State<db::Db>, password: String) -> Res<bool> {
    let f = data_dir(&db).join("backup-passwort");
    if password.is_empty() {
        let _ = std::fs::remove_file(&f);
        let _ = db::audit_append(&db.conn.lock().unwrap(), "backup.encryption.off", &json!({}));
        return Ok(false);
    }
    if password.chars().count() < 8 {
        return Err("Passwort: mindestens 8 Zeichen".into());
    }
    std::fs::write(&f, &password).map_err(err)?;
    let _ = db::audit_append(&db.conn.lock().unwrap(), "backup.encryption.on", &json!({}));
    Ok(true)
}

#[tauri::command]
fn backup_password_status(db: State<db::Db>) -> bool {
    backup_password(&db).is_some()
}

#[tauri::command]
fn app_info(app: AppHandle, db: State<db::Db>) -> AppInfo {
    let dir = backup_dir(&app, &db);
    let c = db.conn.lock().unwrap();
    let wal = {
        let mut p = db.path.as_os_str().to_owned();
        p.push("-wal");
        std::fs::metadata(PathBuf::from(p)).map(|m| m.len()).unwrap_or(0)
    };
    AppInfo {
        version: version(&app),
        os: std::env::consts::OS.to_string(),
        data_dir: db.path.parent().map(|p| p.display().to_string()).unwrap_or_default(),
        db_path: db.path.display().to_string(),
        db_bytes: std::fs::metadata(&db.path).map(|m| m.len()).unwrap_or(0) + wal,
        schema: c.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap_or(0),
        settings: db::count(&c, "settings"),
        audit_entries: db::count(&c, "audit_log"),
        backup_dir: dir.display().to_string(),
        last_backup: c
            .query_row("SELECT ts FROM backup_log WHERE ok = 1 ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
            .ok(),
    }
}

#[tauri::command]
fn settings_get(db: State<db::Db>) -> Res<Map<String, Value>> {
    db::settings_all(&db.conn.lock().unwrap()).map_err(err)
}

#[tauri::command]
fn settings_set(db: State<db::Db>, values: Map<String, Value>) -> Res<()> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    for (k, v) in &values {
        db::setting_set(&tx, k, v).map_err(err)?;
    }
    db::audit_append(&tx, "config.settings.changed", &json!({ "schluessel": values.keys().collect::<Vec<_>>() })).map_err(err)?;
    tx.commit().map_err(err)
}

#[tauri::command]
fn audit_append(db: State<db::Db>, event: String, payload: Value) -> Res<()> {
    let c = db.conn.lock().unwrap();
    db::audit_append(&c, &event, &payload).map_err(err)?;
    // Ereignis an passende Webhooks weiterreichen (Zustellung im Hintergrund)
    automation::dispatch(&c, &event, &payload);
    Ok(())
}

#[tauri::command]
fn audit_recent(db: State<db::Db>, limit: Option<i64>) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    let mut st = c
        .prepare("SELECT ts, event, payload FROM audit_log ORDER BY id DESC LIMIT ?1")
        .map_err(err)?;
    let rows = st
        .query_map([limit.unwrap_or(100)], |r| {
            let p: String = r.get(2)?;
            Ok(json!({ "ts": r.get::<_, String>(0)?, "event": r.get::<_, String>(1)?, "payload": serde_json::from_str::<Value>(&p).unwrap_or(Value::Null) }))
        })
        .map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

pub(crate) fn log_backup(db: &db::Db, kind: &str, e: &Result<backup::Entry, String>) {
    let c = db.conn.lock().unwrap();
    let (path, bytes, sha, ok, note) = match e {
        Ok(x) => {
            let m = x.manifest.as_ref();
            (x.path.clone(), m.map(|m| m.bytes).unwrap_or(0) as i64, m.map(|m| m.sha256.clone()).unwrap_or_default(), 1, None)
        }
        Err(msg) => (String::new(), 0, String::new(), 0, Some(msg.clone())),
    };
    let _ = c.execute(
        "INSERT INTO backup_log(ts, kind, path, bytes, sha256, ok, note) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        rusqlite::params![db::now(), kind, path, bytes, sha, ok, note],
    );
    let _ = db::audit_append(&c, if ok == 1 { "backup.completed" } else { "backup.failed" }, &json!({ "art": kind, "datei": path, "fehler": note }));
}

#[tauri::command]
async fn backup_create(app: AppHandle, kind: Option<String>) -> Res<backup::Entry> {
    let db = app.state::<db::Db>();
    let kind = kind.unwrap_or_else(|| "manuell".into());
    let dir = backup_dir(&app, &db);
    let res = {
        let c = db.conn.lock().unwrap();
        backup::create(&c, &dir, &kind, &version(&app), Some(&data_dir(&db)), backup_password(&db).as_deref())
    };
    log_backup(&db, &kind, &res);
    if res.is_ok() && kind == "automatisch" {
        let keep = {
            let c = db.conn.lock().unwrap();
            db::setting_get(&c, "backup.keep").and_then(|v| v.as_u64()).unwrap_or(14) as usize
        };
        backup::prune(&dir, keep.max(1));
    }
    res
}

#[tauri::command]
fn backup_list(app: AppHandle, db: State<db::Db>) -> Vec<backup::Entry> {
    backup::list(&backup_dir(&app, &db))
}

#[tauri::command]
async fn backup_verify(app: AppHandle, path: String, password: Option<String>) -> backup::Check {
    let pw = password.filter(|p| !p.is_empty()).or_else(|| backup_password(&app.state::<db::Db>()));
    backup::verify(&PathBuf::from(path), pw.as_deref())
}

#[tauri::command]
async fn backup_restore(app: AppHandle, path: String, password: Option<String>) -> Res<Value> {
    let db = app.state::<db::Db>();
    let p = PathBuf::from(&path);
    let pw = password.filter(|p| !p.is_empty()).or_else(|| backup_password(&db));
    let check = backup::verify(&p, pw.as_deref());
    if !check.ok {
        return Err(format!("Wiederherstellung abgebrochen: {}", check.message));
    }
    // Sicherheitskopie des aktuellen Stands – Rückweg bleibt immer offen.
    // Zielordner VOR dem Sperren der Datenbank ermitteln (backup_dir liest selbst aus der DB).
    let dir = backup_dir(&app, &db);
    let safety = {
        let c = db.conn.lock().unwrap();
        backup::create(&c, &dir, "vor-wiederherstellung", &version(&app), Some(&data_dir(&db)), backup_password(&db).as_deref())
    };
    log_backup(&db, "vor-wiederherstellung", &safety);
    let safety = safety?;
    {
        let mut c = db.conn.lock().unwrap();
        backup::restore_into(&mut c, &p, pw.as_deref(), Some(&data_dir(&db)))?;
        // Historie nachtragen: die wiederhergestellte DB kennt die Sicherheitskopie noch nicht.
        let m = safety.manifest.as_ref();
        let _ = c.execute(
            "INSERT INTO backup_log(ts, kind, path, bytes, sha256, ok, note) VALUES (?1,'vor-wiederherstellung',?2,?3,?4,1,?5)",
            rusqlite::params![db::now(), safety.path, m.map(|m| m.bytes).unwrap_or(0) as i64, m.map(|m| m.sha256.clone()).unwrap_or_default(), format!("vor Wiederherstellung aus {path}")],
        );
        let _ = db::audit_append(&c, "backup.restored", &json!({ "aus": path, "sicherheitskopie": safety.path }));
    }
    Ok(json!({ "sicherheitskopie": safety.path }))
}

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .set_title("Zielordner für Sicherungen wählen")
        .blocking_pick_folder()
        .and_then(|f| f.into_path().ok())
        .map(|p| p.display().to_string())
}

#[tauri::command]
fn open_folder(path: String) -> Res<()> {
    let p = PathBuf::from(&path);
    std::fs::create_dir_all(&p).map_err(err)?;
    #[cfg(target_os = "windows")]
    let cmd = "explorer";
    #[cfg(target_os = "macos")]
    let cmd = "open";
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let cmd = "xdg-open";
    std::process::Command::new(cmd).arg(&p).spawn().map(|_| ()).map_err(err)
}

/* ── Artikel, Bestand, Belege ── */

#[tauri::command]
fn catalog_list(db: State<db::Db>) -> Res<Vec<catalog::Article>> {
    catalog::list(&db.conn.lock().unwrap()).map_err(err)
}

/// Erstbefüllung mit Startdaten (nur wenn noch keine Artikel existieren).
#[tauri::command]
fn catalog_seed(db: State<db::Db>, articles: Vec<catalog::Article>) -> Res<usize> {
    let mut c = db.conn.lock().unwrap();
    if db::count(&c, "articles") > 0 {
        return Ok(0);
    }
    let tx = c.transaction().map_err(err)?;
    for a in &articles {
        catalog::save(&tx, a)?;
        for v in &a.variants {
            if v.stock != 0 {
                let vid: i64 = tx
                    .query_row("SELECT id FROM variants WHERE ean = ?1", [&v.ean], |r| r.get(0))
                    .map_err(err)?;
                catalog::book(&tx, vid, v.stock, true, "Anfangsbestand", None, Some("System"))?;
            }
        }
    }
    db::audit_append(&tx, "catalog.seeded", &json!({ "artikel": articles.len() })).map_err(err)?;
    purchasing::supplier_seed(&tx)?;
    tx.commit().map_err(err)?;
    Ok(articles.len())
}

#[tauri::command]
fn article_save(db: State<db::Db>, article: catalog::Article, user: Option<String>) -> Res<Vec<catalog::Article>> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let alt: Option<(i64, Option<i64>)> = tx.query_row("SELECT price, cost FROM articles WHERE id = ?1", [&article.id], |r| Ok((r.get(0)?, r.get(1)?))).ok();
    catalog::save(&tx, &article)?;
    if let Some((vk, ek)) = alt {
        if vk != article.price || ek != article.cost {
            db::audit_append(&tx, "catalog.price.changed", &json!({ "artikel": article.id, "alt_vk": vk, "neu_vk": article.price, "alt_ek": ek, "neu_ek": article.cost, "benutzer": user })).map_err(err)?;
        }
    }
    db::audit_append(&tx, "catalog.article.saved", &json!({ "artikel": article.id, "name": article.name, "varianten": article.variants.len(), "benutzer": user })).map_err(err)?;
    tx.commit().map_err(err)?;
    catalog::list(&c).map_err(err)
}

/// Daten für die Reiter der Artikelmaske: Buchungen, Filialbestand, Preisänderungen
#[tauri::command]
fn article_card(db: State<db::Db>, id: String) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    let mut st = c.prepare("SELECT m.id, m.ts, v.size, v.color, v.ean, m.delta, m.stock_after, m.reason, COALESCE(m.user,'') FROM stock_moves m JOIN variants v ON v.id = m.variant_id WHERE v.article_id = ?1 ORDER BY m.id DESC LIMIT 500").map_err(err)?;
    let moves: Vec<Value> = st.query_map([&id], |r| Ok(json!({ "id": r.get::<_, i64>(0)?, "ts": r.get::<_, String>(1)?, "size": r.get::<_, String>(2)?, "color": r.get::<_, String>(3)?, "ean": r.get::<_, String>(4)?, "delta": r.get::<_, i64>(5)?, "after": r.get::<_, i64>(6)?, "reason": r.get::<_, String>(7)?, "user": r.get::<_, String>(8)? }))).map_err(err)?.filter_map(Result::ok).collect();
    let mut st = c.prepare("SELECT s.store, COALESCE(t.name, s.store), v.size, v.color, v.ean, s.stock FROM store_stock s JOIN variants v ON v.ean = s.ean LEFT JOIN stores t ON t.id = s.store WHERE v.article_id = ?1 ORDER BY s.store, v.id").map_err(err)?;
    let stores: Vec<Value> = st.query_map([&id], |r| Ok(json!({ "store": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "size": r.get::<_, String>(2)?, "color": r.get::<_, String>(3)?, "ean": r.get::<_, String>(4)?, "stock": r.get::<_, i64>(5)? }))).map_err(err)?.filter_map(Result::ok).collect();
    let mut st = c.prepare("SELECT id, ts, payload FROM audit_log WHERE event = 'catalog.price.changed' AND json_extract(payload, '$.artikel') = ?1 ORDER BY id DESC LIMIT 200").map_err(err)?;
    let prices: Vec<Value> = st.query_map([&id], |r| { let p: String = r.get(2)?; let mut v: Value = serde_json::from_str(&p).unwrap_or(json!({})); v["id"] = json!(r.get::<_, i64>(0)?); v["ts"] = json!(r.get::<_, String>(1)?); Ok(v) }).map_err(err)?.filter_map(Result::ok).collect();
    Ok(json!({ "moves": moves, "stores": stores, "prices": prices }))
}

#[tauri::command]
fn article_delete(db: State<db::Db>, id: String, user: Option<String>) -> Res<()> {
    let c = db.conn.lock().unwrap();
    catalog::deactivate(&c, &id).map_err(err)?;
    db::audit_append(&c, "catalog.article.deactivated", &json!({ "artikel": id, "benutzer": user })).map_err(err)?;
    Ok(())
}

#[tauri::command]
fn stock_book(db: State<db::Db>, variant_id: i64, value: i64, set: bool, reason: String, user: Option<String>) -> Res<i64> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let after = catalog::book(&tx, variant_id, value, set, &reason, None, user.as_deref())?;
    db::audit_append(&tx, "inventory.booked", &json!({ "variante": variant_id, "wert": value, "inventur": set, "grund": reason, "bestand": after })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(after)
}

#[tauri::command]
fn stock_moves(db: State<db::Db>, article_id: Option<String>, limit: Option<i64>) -> Res<Vec<Value>> {
    catalog::moves(&db.conn.lock().unwrap(), article_id.as_deref(), limit.unwrap_or(50)).map_err(err)
}

#[tauri::command]
fn beleg_peek(db: State<db::Db>) -> i64 {
    catalog::beleg_peek(&db.conn.lock().unwrap())
}

#[tauri::command]
fn sale_commit(db: State<db::Db>, lines: Vec<catalog::SaleLine>, total: i64, cashier: String, customer: Option<String>, data: Value) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let r = catalog::commit_sale(&tx, &lines, total, &cashier, customer.as_deref(), &data)?;
    tx.commit().map_err(err)?;
    Ok(r)
}

#[tauri::command]
fn sales_list(db: State<db::Db>, limit: Option<i64>, customer: Option<String>) -> Res<Vec<Value>> {
    catalog::sales(&db.conn.lock().unwrap(), limit.unwrap_or(100), customer.as_deref()).map_err(err)
}

#[tauri::command]
fn sale_get(db: State<db::Db>, no: String) -> Res<Value> {
    sales::sale_get(&db.conn.lock().unwrap(), no.trim())
}

/// Retoure (einzelne Positionen) oder Storno (ganzer Beleg).
#[tauri::command]
fn return_commit(db: State<db::Db>, no: String, lines: Vec<sales::ReturnLine>, storno: bool, reason: String, method: Value, cashier: String, approved_by: Option<String>) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let r = sales::commit_return(&tx, no.trim(), &lines, storno, &reason, &method, &cashier)?;
    db::audit_append(&tx, if storno { "pos.sale.voided" } else { "pos.return.completed" }, &json!({ "beleg": r["no"], "zu": no, "betrag": r["total"], "grund": reason, "kassier": cashier, "freigabe": approved_by })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(r)
}

#[tauri::command]
fn stats(db: State<db::Db>, ranges: Vec<sales::Range>, detail: Option<bool>) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    ranges.iter().enumerate().map(|(i, r)| sales::stats(&c, r, detail.unwrap_or(true) && i == 0)).collect()
}

/* ── Kunden ── */

#[tauri::command]
fn customer_list(db: State<db::Db>) -> Res<Vec<customers::Customer>> {
    customers::list(&db.conn.lock().unwrap()).map_err(err)
}

#[tauri::command]
fn customer_seed(db: State<db::Db>, list: Vec<customers::Customer>) -> Res<usize> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let n = customers::seed(&tx, &list)?;
    tx.commit().map_err(err)?;
    Ok(n)
}

#[tauri::command]
fn customer_save(db: State<db::Db>, customer: customers::Customer, user: Option<String>) -> Res<customers::Customer> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let id = customers::save(&tx, &customer)?;
    db::audit_append(&tx, "customer.saved", &json!({ "kunde": id, "neu": customer.id.is_empty(), "benutzer": user })).map_err(err)?;
    tx.commit().map_err(err)?;
    customers::get(&c, &id).map_err(err)?.ok_or_else(|| "Kunde nicht gefunden".into())
}

#[tauri::command]
fn customer_delete(db: State<db::Db>, id: String, user: Option<String>) -> Res<()> {
    let c = db.conn.lock().unwrap();
    customers::deactivate(&c, &id).map_err(err)?;
    db::audit_append(&c, "customer.deactivated", &json!({ "kunde": id, "benutzer": user })).map_err(err)?;
    Ok(())
}

#[tauri::command]
fn customer_detail(db: State<db::Db>, id: String) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    let k = customers::get(&c, &id).map_err(err)?.ok_or("Kunde nicht gefunden")?;
    Ok(json!({ "customer": k, "sales": catalog::sales(&c, 200, Some(&id)).map_err(err)?, "points": customers::points_log(&c, &id, 100).map_err(err)? }))
}

#[tauri::command]
fn customer_points(db: State<db::Db>, id: String, delta: i64, reason: String, user: Option<String>, approved_by: Option<String>) -> Res<i64> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let (real, balance) = customers::book_points(&tx, &id, delta, &reason, None, user.as_deref())?;
    db::audit_append(&tx, "loyalty.points.adjusted", &json!({ "kunde": id, "punkte": real, "stand": balance, "grund": reason, "freigabe": approved_by })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(balance)
}

/* ── Benutzer & Anmeldung ── */

#[tauri::command]
fn users_list(db: State<db::Db>) -> Res<Vec<users::User>> {
    users::list(&db.conn.lock().unwrap()).map_err(err)
}

#[tauri::command]
fn users_default_pins(db: State<db::Db>) -> Vec<String> {
    users::default_pins(&db.conn.lock().unwrap())
}

#[tauri::command]
fn user_verify(db: State<db::Db>, id: String, pin: String, purpose: Option<String>, code: Option<String>) -> Res<users::User> {
    let c = db.conn.lock().unwrap();
    let r = users::verify(&c, &id, &pin, code.as_deref());
    if matches!(&r, Err(e) if e == "TOTP") {
        return Err("TOTP".into());
    }
    let _ = db::audit_append(&c, if r.is_ok() { "auth.pin.ok" } else { "auth.pin.failed" }, &json!({ "benutzer": id, "zweck": purpose }));
    let u = r?;
    if purpose.as_deref() == Some("freigabe") && !users::can_approve(&u.role) {
        return Err(format!("{} darf keine Freigaben erteilen", u.name));
    }
    // Freigabe über ein bestimmtes Recht (Rechte-Matrix): die freigebende Person muss es selbst haben
    if let Some(perm) = purpose.as_deref().and_then(|p| p.strip_prefix("recht:")) {
        if !security::allowed(&c, &u.role, perm) {
            return Err(format!("{} hat dieses Recht nicht", u.name));
        }
    }
    Ok(u)
}

#[tauri::command]
fn user_save(db: State<db::Db>, user: users::User, pin: Option<String>, by: Option<String>) -> Res<Vec<users::User>> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let id = users::save(&tx, &user, pin.as_deref().filter(|p| !p.is_empty()))?;
    db::audit_append(&tx, "user.saved", &json!({ "benutzer": id, "rolle": user.role, "pin_geaendert": pin.as_deref().map(|p| !p.is_empty()).unwrap_or(false), "durch": by })).map_err(err)?;
    tx.commit().map_err(err)?;
    users::list(&c).map_err(err)
}

#[tauri::command]
fn user_delete(db: State<db::Db>, id: String, by: Option<String>) -> Res<Vec<users::User>> {
    let c = db.conn.lock().unwrap();
    users::deactivate(&c, &id)?;
    db::audit_append(&c, "user.deactivated", &json!({ "benutzer": id, "durch": by })).map_err(err)?;
    users::list(&c).map_err(err)
}

/* ── Gutscheine ── */

#[tauri::command]
fn voucher_bonus(db: State<db::Db>, amount: i64, refno: String, customer: Option<String>, days: i64, note: String, user: String) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    let code = vouchers::issue_bonus(&c, amount, &refno, customer.as_deref(), days, &note, Some(&user))?;
    let _ = db::audit_append(&c, "voucher.bonus", &json!({ "gutschein": code, "betrag": amount, "beleg": refno, "bonus": note, "benutzer": user }));
    Ok(json!({ "code": code }))
}

#[tauri::command]
fn voucher_get(db: State<db::Db>, code: String) -> Res<Value> {
    vouchers::get(&db.conn.lock().unwrap(), &code)
}

#[tauri::command]
fn voucher_list(db: State<db::Db>) -> Res<Vec<Value>> {
    vouchers::list(&db.conn.lock().unwrap(), 500).map_err(err)
}

#[tauri::command]
fn voucher_set_pin(db: State<db::Db>, code: String, pin: Option<String>, user: String) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    vouchers::set_pin(&c, &code, pin.as_deref(), Some(&user))?;
    let _ = db::audit_append(&c, "voucher.pin", &json!({ "gutschein": code.trim().to_uppercase(), "pin": pin.as_deref().is_some_and(|p| !p.is_empty()), "benutzer": user }));
    vouchers::get(&c, &code)
}
#[tauri::command]
fn voucher_check_pin(db: State<db::Db>, code: String, pin: Option<String>) -> Res<()> {
    vouchers::check_pin(&db.conn.lock().unwrap(), &code, pin.as_deref())
}
#[tauri::command]
fn voucher_delete(db: State<db::Db>, code: String, reason: String, user: String) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    vouchers::delete(&c, &code, &reason, Some(&user))?;
    let _ = db::audit_append(&c, "voucher.deleted", &json!({ "gutschein": code.trim().to_uppercase(), "grund": reason, "benutzer": user }));
    vouchers::get(&c, &code)
}
#[tauri::command]
fn voucher_moves(db: State<db::Db>, limit: Option<i64>) -> Res<Vec<Value>> {
    vouchers::moves(&db.conn.lock().unwrap(), limit.unwrap_or(2000)).map_err(err)
}

/* ── Kassenbuch & Tagesabschluss ── */

#[tauri::command]
fn cash_status(db: State<db::Db>) -> Res<Value> {
    closing::summary(&db.conn.lock().unwrap())
}

#[tauri::command]
fn cash_move(db: State<db::Db>, kind: String, amount: i64, reason: String, user: Option<String>, approved_by: Option<String>) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    closing::cash_move(&c, &kind, amount, &reason, user.as_deref())?;
    db::audit_append(&c, "cash.moved", &json!({ "art": kind, "betrag": amount, "grund": reason, "benutzer": user, "freigabe": approved_by })).map_err(err)?;
    closing::summary(&c)
}

#[tauri::command]
fn closing_create(db: State<db::Db>, counted: i64, note: String, user: Option<String>) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let z = closing::close(&tx, counted, &note, user.as_deref())?;
    db::audit_append(&tx, "cash.closing", &json!({ "nr": z["no"], "umsatz": z["revenue"], "differenz": z["diff"], "benutzer": user })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(z)
}

#[tauri::command]
fn closings_list(db: State<db::Db>) -> Res<Vec<Value>> {
    closing::list(&db.conn.lock().unwrap(), 200).map_err(err)
}

/* ── RKSV ── */

#[tauri::command]
fn rksv_status(db: State<db::Db>) -> Res<Value> {
    rksv::status(&db.conn.lock().unwrap())
}

#[tauri::command]
fn rksv_init(db: State<db::Db>, kassen_id: String, user: String) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let r = rksv::init(&tx, &kassen_id, &user)?;
    db::setting_set(&tx, "kasse.id", &json!(kassen_id.trim())).map_err(err)?;
    db::audit_append(&tx, "rksv.started", &json!({ "kasse": kassen_id, "startbeleg": r["no"], "modus": "test" })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(r)
}

#[tauri::command]
fn rksv_null(db: State<db::Db>, label: String, user: String) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let r = rksv::null_receipt(&tx, &label, &user)?;
    db::audit_append(&tx, "rksv.nullbeleg", &json!({ "beleg": r["no"], "art": label })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(r)
}

#[tauri::command]
async fn dep_export(app: AppHandle) -> Res<Option<String>> {
    let data = {
        let db = app.state::<db::Db>();
        let c = db.conn.lock().unwrap();
        rksv::dep_export(&c)?
    };
    let name = format!("DEP-Export_{}.json", chrono::Local::now().format("%Y-%m-%d"));
    let Some(path) = app.dialog().file().set_title("DEP-Export speichern").set_file_name(&name).add_filter("JSON", &["json"]).blocking_save_file() else { return Ok(None) };
    let p = path.into_path().map_err(err)?;
    std::fs::write(&p, serde_json::to_string_pretty(&data).map_err(err)?).map_err(err)?;
    let db = app.state::<db::Db>();
    let _ = db::audit_append(&db.conn.lock().unwrap(), "rksv.dep.exported", &json!({ "datei": p.display().to_string() }));
    Ok(Some(p.display().to_string()))
}

/// QR-Code als SVG (Belege, Bildschirm)
#[tauri::command]
fn qr_svg(text: String) -> Res<String> {
    use qrcode::{render::svg, EcLevel, QrCode};
    let code = QrCode::with_error_correction_level(text.as_bytes(), EcLevel::M).map_err(err)?;
    Ok(code.render::<svg::Color>().quiet_zone(true).min_dimensions(160, 160).dark_color(svg::Color("#141414")).light_color(svg::Color("#ffffff")).build())
}

/// Textdatei wählen und lesen (Import von Erweiterungspaketen u. Ä.)
#[tauri::command]
async fn open_text(app: AppHandle, title: Option<String>, ext: Option<String>) -> Res<Option<String>> {
    let e = ext.unwrap_or_else(|| "json".into());
    let Some(f) = app.dialog().file().set_title(title.unwrap_or_else(|| "Datei öffnen".into())).add_filter(e.to_uppercase(), &[e.as_str()]).blocking_pick_file() else { return Ok(None) };
    let p = f.into_path().map_err(err)?;
    if std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0) > 20 * 1024 * 1024 {
        return Err("Datei zu groß".into());
    }
    std::fs::read_to_string(&p).map(Some).map_err(|e| format!("Datei nicht lesbar: {e}"))
}

/// Text in eine vom Benutzer gewählte Datei schreiben (CSV-Export u. Ä.)
#[tauri::command]
async fn save_text(app: AppHandle, name: String, content: String, title: Option<String>) -> Res<Option<String>> {
    let ext = name.rsplit('.').next().unwrap_or("txt").to_string();
    let Some(path) = app.dialog().file().set_title(title.unwrap_or_else(|| "Speichern".into())).set_file_name(&name).add_filter(ext.to_uppercase(), &[ext.as_str()]).blocking_save_file() else { return Ok(None) };
    let p = path.into_path().map_err(err)?;
    // BOM, damit Excel Umlaute in CSV richtig liest
    let body = if ext == "csv" { format!("\u{feff}{content}") } else { content };
    std::fs::write(&p, body).map_err(err)?;
    Ok(Some(p.display().to_string()))
}

/* ── Bondrucker & Kassenlade ── */

fn printer_target(c: &rusqlite::Connection) -> printer::Target {
    let g = |k: &str| db::setting_get(c, k);
    let kind = g("drucker.art").and_then(|v| v.as_str().map(str::to_string)).unwrap_or_else(|| "aus".into());
    let addr = if kind == "windows" { g("drucker.name") } else { g("drucker.adresse") }.and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
    let width = g("drucker.breite").and_then(|v| v.as_u64()).unwrap_or(48) as usize;
    printer::Target { kind, addr, width }
}

#[tauri::command]
async fn printer_print(app: AppHandle, ops: Vec<printer::Op>, purpose: Option<String>) -> Res<()> {
    let (t, logo) = {
        let db = app.state::<db::Db>();
        let c = db.conn.lock().unwrap();
        let logo = db::setting_get(&c, "bon.logo").and_then(|v| v.as_str().map(str::to_string)).filter(|s| !s.is_empty());
        (printer_target(&c), logo.map(|l| images::dir(&data_dir(&db)).join(l)))
    };
    let raster = match (&logo, ops.iter().any(|o| matches!(o, printer::Op::Logo))) {
        (Some(p), true) => images::escpos_raster(p, if t.width <= 32 { 384 } else { 512 }).ok(),
        _ => None,
    };
    let bytes = printer::encode_with(&ops, t.width, raster.as_deref());
    let r = printer::send(&t, &bytes);
    let db = app.state::<db::Db>();
    let _ = db::audit_append(&db.conn.lock().unwrap(), if r.is_ok() { "device.printer.printed" } else { "device.printer.failed" }, &json!({ "zweck": purpose, "fehler": r.as_ref().err() }));
    r
}

#[tauri::command]
fn printer_list() -> Vec<String> {
    printer::list_windows()
}

/* ── Etiketten (ZPL über Netzwerk / Windows-Drucker) ── */

#[tauri::command]
async fn label_print(app: AppHandle, data: String) -> Res<()> {
    let t = {
        let db = app.state::<db::Db>();
        let c = db.conn.lock().unwrap();
        let g = |k: &str| db::setting_get(&c, k).and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
        let kind = g("etikett.art");
        printer::Target { addr: if kind == "windows" { g("etikett.name") } else { g("etikett.adresse") }, kind, width: 0 }
    };
    printer::send(&t, data.as_bytes())
}

/* ── Bilder ── */

fn pick_image(app: &AppHandle, title: &str) -> Option<PathBuf> {
    app.dialog().file().set_title(title).add_filter("Bilder", &["jpg", "jpeg", "png", "webp"]).blocking_pick_file().and_then(|f| f.into_path().ok())
}

#[tauri::command]
async fn article_image_pick(app: AppHandle, id: String) -> Res<Option<String>> {
    let Some(src) = pick_image(&app, "Artikelbild wählen") else { return Ok(None) };
    let db = app.state::<db::Db>();
    let dd = data_dir(&db);
    let name = images::import_article(&dd, &id, &src)?;
    let c = db.conn.lock().unwrap();
    let old: Option<String> = c.query_row("SELECT image FROM articles WHERE id = ?1", [&id], |r| r.get(0)).map_err(err)?;
    c.execute("UPDATE articles SET image = ?2, updated_at = ?3 WHERE id = ?1", rusqlite::params![id, name, db::now()]).map_err(err)?;
    if let Some(o) = old {
        images::remove(&dd, &o);
    }
    let _ = db::audit_append(&c, "catalog.article.image", &json!({ "artikel": id, "datei": name }));
    Ok(Some(name))
}

#[tauri::command]
fn article_image_remove(db: State<db::Db>, id: String) -> Res<()> {
    let c = db.conn.lock().unwrap();
    let old: Option<String> = c.query_row("SELECT image FROM articles WHERE id = ?1", [&id], |r| r.get(0)).map_err(err)?;
    c.execute("UPDATE articles SET image = NULL WHERE id = ?1", [&id]).map_err(err)?;
    if let Some(o) = old {
        images::remove(&data_dir(&db), &o);
    }
    Ok(())
}

#[tauri::command]
async fn logo_pick(app: AppHandle) -> Res<Option<String>> {
    let Some(src) = pick_image(&app, "Logo wählen (PNG mit transparentem Hintergrund ideal)") else { return Ok(None) };
    let db = app.state::<db::Db>();
    let dd = data_dir(&db);
    let name = images::import_logo(&dd, &src)?;
    let c = db.conn.lock().unwrap();
    if let Some(serde_json::Value::String(o)) = db::setting_get(&c, "bon.logo") {
        images::remove(&dd, &o);
    }
    db::setting_set(&c, "bon.logo", &json!(name)).map_err(err)?;
    Ok(Some(name))
}

/* ── E-Mail ── */

fn mail_config(c: &rusqlite::Connection) -> mail::Config {
    let g = |k: &str| db::setting_get(c, k).map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())).unwrap_or_default();
    mail::Config { host: g("mail.host"), port: g("mail.port").parse().unwrap_or(587), user: g("mail.user"), pass: g("mail.pass"), from: g("mail.from"), tls: g("mail.tls") }
}

#[tauri::command]
async fn mail_send(app: AppHandle, to: String, subject: String, html: String, text: String, qr: Option<String>, purpose: Option<String>) -> Res<()> {
    let cfg = { mail_config(&app.state::<db::Db>().conn.lock().unwrap()) };
    let (to2, subj2) = (to.clone(), subject.clone());
    let r = tauri::async_runtime::spawn_blocking(move || mail::send(&cfg, &mail::Mail { to: &to, subject: &subject, html: &html, text: &text, qr: qr.as_deref() }))
        .await
        .map_err(err)?;
    let db = app.state::<db::Db>();
    let _ = db::audit_append(&db.conn.lock().unwrap(), if r.is_ok() { "mail.sent" } else { "mail.failed" }, &json!({ "an": to2, "betreff": subj2, "zweck": purpose, "fehler": r.as_ref().err() }));
    r
}

/* ── Inventur ── */

#[tauri::command]
fn inventory_start(db: State<db::Db>, scope: Value, user: String) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let id = inventory::start(&tx, &scope, &user)?;
    db::audit_append(&tx, "inventory.started", &json!({ "inventur": id, "bereich": scope })).map_err(err)?;
    tx.commit().map_err(err)?;
    inventory::get(&c, id)
}

#[tauri::command]
fn inventory_count(db: State<db::Db>, id: i64, ean: Option<String>, variant_id: Option<i64>, qty: i64, add: bool) -> Res<Value> {
    inventory::count(&db.conn.lock().unwrap(), id, ean.as_deref(), variant_id, qty, add)
}

#[tauri::command]
fn inventory_get(db: State<db::Db>, id: i64) -> Res<Value> {
    inventory::get(&db.conn.lock().unwrap(), id)
}

#[tauri::command]
fn inventory_list(db: State<db::Db>) -> Res<Vec<Value>> {
    inventory::list(&db.conn.lock().unwrap()).map_err(err)
}

#[tauri::command]
fn inventory_finish(db: State<db::Db>, id: i64, zero_uncounted: bool, user: String, approved_by: Option<String>) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let r = inventory::finish(&tx, id, zero_uncounted, &user)?;
    db::audit_append(&tx, "inventory.finished", &json!({ "inventur": id, "ergebnis": r, "freigabe": approved_by })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(r)
}

#[tauri::command]
fn inventory_discard(db: State<db::Db>, id: i64) -> Res<()> {
    let c = db.conn.lock().unwrap();
    inventory::discard(&c, id)?;
    let _ = db::audit_append(&c, "inventory.discarded", &json!({ "inventur": id }));
    Ok(())
}

/* ── Preisaktionen ── */

#[tauri::command]
fn promotions_list(db: State<db::Db>) -> Res<Vec<promotions::Promotion>> {
    promotions::list(&db.conn.lock().unwrap()).map_err(err)
}

#[tauri::command]
fn promotion_save(db: State<db::Db>, promotion: promotions::Promotion, user: Option<String>) -> Res<Vec<promotions::Promotion>> {
    let c = db.conn.lock().unwrap();
    let id = promotions::save(&c, &promotion)?;
    db::audit_append(&c, "pricing.promotion.saved", &json!({ "aktion": id, "name": promotion.name, "prozent": promotion.pct, "benutzer": user })).map_err(err)?;
    promotions::list(&c).map_err(err)
}

#[tauri::command]
fn promotion_delete(db: State<db::Db>, id: i64) -> Res<Vec<promotions::Promotion>> {
    let c = db.conn.lock().unwrap();
    promotions::delete(&c, id)?;
    let _ = db::audit_append(&c, "pricing.promotion.deleted", &json!({ "aktion": id }));
    promotions::list(&c).map_err(err)
}

/* ── Einkauf ── */

#[tauri::command]
fn suppliers_list(db: State<db::Db>) -> Res<Vec<purchasing::Supplier>> {
    purchasing::suppliers(&db.conn.lock().unwrap()).map_err(err)
}

#[tauri::command]
fn supplier_save(db: State<db::Db>, supplier: purchasing::Supplier) -> Res<Vec<purchasing::Supplier>> {
    let c = db.conn.lock().unwrap();
    let id = purchasing::supplier_save(&c, &supplier)?;
    db::audit_append(&c, "purchasing.supplier.saved", &json!({ "lieferant": id })).map_err(err)?;
    purchasing::suppliers(&c).map_err(err)
}

#[tauri::command]
fn po_list(db: State<db::Db>) -> Res<Vec<Value>> {
    purchasing::po_list(&db.conn.lock().unwrap()).map_err(err)
}

#[tauri::command]
fn po_lines(db: State<db::Db>, id: i64) -> Res<Vec<Value>> {
    purchasing::po_lines(&db.conn.lock().unwrap(), id).map_err(err)
}

#[tauri::command]
fn po_save(db: State<db::Db>, id: Option<i64>, supplier: String, note: String, lines: Vec<purchasing::PoLineIn>, user: String) -> Res<i64> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let id = purchasing::po_save(&tx, id, &supplier, &note, &lines, &user)?;
    db::audit_append(&tx, "purchasing.order.saved", &json!({ "bestellung": id, "positionen": lines.len() })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(id)
}

#[tauri::command]
fn po_status(db: State<db::Db>, id: i64, status: String, user: Option<String>) -> Res<()> {
    let c = db.conn.lock().unwrap();
    purchasing::po_status(&c, id, &status)?;
    db::audit_append(&c, "purchasing.order.status", &json!({ "bestellung": id, "status": status, "benutzer": user })).map_err(err)?;
    Ok(())
}

#[tauri::command]
fn po_receive(db: State<db::Db>, id: i64, items: Vec<purchasing::Receive>, user: String) -> Res<Vec<Value>> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let r = purchasing::po_receive(&tx, id, &items, &user)?;
    db::audit_append(&tx, "purchasing.goods.received", &json!({ "bestellung": id, "positionen": r.len(), "benutzer": user })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(r)
}

#[tauri::command]
fn po_suggest(db: State<db::Db>) -> Res<Vec<Value>> {
    purchasing::suggest(&db.conn.lock().unwrap())
}

/* ── Anpassbarkeit: Felder, Objekte ── */

#[tauri::command]
fn fields_list(db: State<db::Db>, object: Option<String>) -> Res<Vec<custom::FieldDef>> {
    custom::fields(&db.conn.lock().unwrap(), object.as_deref()).map_err(err)
}
#[tauri::command]
fn field_save(db: State<db::Db>, field: custom::FieldDef) -> Res<Vec<custom::FieldDef>> {
    let c = db.conn.lock().unwrap();
    custom::field_save(&c, &field)?;
    let _ = db::audit_append(&c, "config.field.saved", &json!({ "objekt": field.object, "feld": field.label }));
    custom::fields(&c, None).map_err(err)
}
#[tauri::command]
fn field_delete(db: State<db::Db>, id: i64) -> Res<Vec<custom::FieldDef>> {
    let c = db.conn.lock().unwrap();
    custom::field_delete(&c, id)?;
    custom::fields(&c, None).map_err(err)
}
#[tauri::command]
fn fields_validate(db: State<db::Db>, object: String, values: Value) -> Res<Value> {
    custom::validate(&db.conn.lock().unwrap(), &object, &values)
}
#[tauri::command]
fn entities_list(db: State<db::Db>) -> Res<Vec<custom::Entity>> {
    custom::entities(&db.conn.lock().unwrap()).map_err(err)
}
#[tauri::command]
fn entity_save(db: State<db::Db>, entity: custom::Entity) -> Res<Vec<custom::Entity>> {
    let c = db.conn.lock().unwrap();
    let id = custom::entity_save(&c, &entity)?;
    let _ = db::audit_append(&c, "config.entity.saved", &json!({ "objekt": id }));
    custom::entities(&c).map_err(err)
}
#[tauri::command]
fn entity_delete(db: State<db::Db>, id: String) -> Res<Vec<custom::Entity>> {
    let c = db.conn.lock().unwrap();
    custom::entity_delete(&c, &id)?;
    custom::entities(&c).map_err(err)
}
#[tauri::command]
fn records_list(db: State<db::Db>, entity: String, q: Option<String>) -> Res<Vec<Value>> {
    custom::records(&db.conn.lock().unwrap(), &entity, q.as_deref().filter(|s| !s.is_empty()), 2000).map_err(err)
}
#[tauri::command]
fn record_save(db: State<db::Db>, entity: String, id: Option<i64>, data: Value, user: Option<String>) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    let id = custom::record_save(&c, &entity, id, &data, user.as_deref())?;
    custom::record_get(&c, &entity, id)
}
#[tauri::command]
fn record_delete(db: State<db::Db>, entity: String, id: i64) -> Res<()> {
    let c = db.conn.lock().unwrap();
    custom::record_delete(&c, &entity, id)?;
    Ok(())
}
#[tauri::command]
fn supplier_fields_set(db: State<db::Db>, id: String, fields: Value) -> Res<()> {
    let c = db.conn.lock().unwrap();
    let v = custom::validate(&c, "lieferant", &fields)?;
    c.execute("UPDATE suppliers SET fields = ?2 WHERE id = ?1", rusqlite::params![id, v.to_string()]).map_err(err)?;
    Ok(())
}
#[tauri::command]
fn supplier_fields_get(db: State<db::Db>) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    let mut st = c.prepare("SELECT id, fields FROM suppliers").map_err(err)?;
    let m: serde_json::Map<String, Value> = st.query_map([], |r| Ok((r.get::<_, String>(0)?, serde_json::from_str::<Value>(&r.get::<_, String>(1)?).unwrap_or(json!({}))))).map_err(err)?.filter_map(Result::ok).collect();
    Ok(Value::Object(m))
}

/* ── Regeln, Skripte, Webhooks ── */

#[tauri::command]
fn rules_list(db: State<db::Db>) -> Res<Vec<automation::Rule>> {
    automation::rules(&db.conn.lock().unwrap()).map_err(err)
}
#[tauri::command]
fn rule_save(db: State<db::Db>, rule: automation::Rule) -> Res<Vec<automation::Rule>> {
    let c = db.conn.lock().unwrap();
    automation::rule_save(&c, &rule)?;
    let _ = db::audit_append(&c, "config.rule.saved", &json!({ "regel": rule.name, "ausloeser": rule.trigger }));
    automation::rules(&c).map_err(err)
}
#[tauri::command]
fn rule_delete(db: State<db::Db>, id: i64) -> Res<Vec<automation::Rule>> {
    let c = db.conn.lock().unwrap();
    c.execute("DELETE FROM rules WHERE id = ?1", [id]).map_err(err)?;
    automation::rules(&c).map_err(err)
}
#[tauri::command]
fn rule_ran(db: State<db::Db>, id: i64, error: Option<String>) {
    automation::rule_ran(&db.conn.lock().unwrap(), id, error.as_deref());
}
#[tauri::command]
fn scripts_list(db: State<db::Db>) -> Res<Vec<automation::Script>> {
    automation::scripts(&db.conn.lock().unwrap()).map_err(err)
}
#[tauri::command]
fn script_save(db: State<db::Db>, script: automation::Script) -> Res<Vec<automation::Script>> {
    let c = db.conn.lock().unwrap();
    automation::script_save(&c, &script)?;
    let _ = db::audit_append(&c, "config.script.saved", &json!({ "skript": script.name }));
    automation::scripts(&c).map_err(err)
}
#[tauri::command]
fn script_delete(db: State<db::Db>, id: i64) -> Res<Vec<automation::Script>> {
    let c = db.conn.lock().unwrap();
    c.execute("DELETE FROM scripts WHERE id = ?1", [id]).map_err(err)?;
    automation::scripts(&c).map_err(err)
}
#[tauri::command]
fn webhooks_list(db: State<db::Db>) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    Ok(json!({ "hooks": automation::webhooks(&c).map_err(err)?, "queue": automation::queue(&c, 100).map_err(err)? }))
}
#[tauri::command]
fn webhook_save(db: State<db::Db>, hook: automation::Webhook) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    automation::webhook_save(&c, &hook)?;
    let _ = db::audit_append(&c, "config.webhook.saved", &json!({ "ziel": hook.url }));
    Ok(json!({ "hooks": automation::webhooks(&c).map_err(err)?, "queue": automation::queue(&c, 100).map_err(err)? }))
}
#[tauri::command]
fn webhook_delete(db: State<db::Db>, id: i64) -> Res<()> {
    let c = db.conn.lock().unwrap();
    c.execute("DELETE FROM webhook_queue WHERE webhook_id = ?1 AND status = 'offen'", [id]).map_err(err)?;
    c.execute("DELETE FROM webhooks WHERE id = ?1", [id]).map_err(err)?;
    Ok(())
}
#[tauri::command]
fn webhook_test(db: State<db::Db>, id: i64) -> Res<()> {
    let c = db.conn.lock().unwrap();
    let ev: String = c.query_row("SELECT events FROM webhooks WHERE id = ?1", [id], |r| r.get(0)).map_err(err)?;
    let _ = ev;
    c.execute(
        "INSERT INTO webhook_queue(webhook_id, event, payload, next_at, created_at) VALUES (?1,'test.ping',?2,?3,?3)",
        rusqlite::params![id, json!({ "event": "test.ping", "zeit": db::now(), "daten": { "nachricht": "Testaufruf aus Kontor" } }).to_string(), db::now()],
    )
    .map_err(err)?;
    Ok(())
}
#[tauri::command]
fn webhook_retry(db: State<db::Db>, id: i64) -> Res<()> {
    automation::retry(&db.conn.lock().unwrap(), id)
}
/// Regel-Aktion „Webhook“: an ein bestimmtes Ziel senden
#[tauri::command]
fn webhook_fire(db: State<db::Db>, id: i64, event: String, payload: Value) -> Res<()> {
    let c = db.conn.lock().unwrap();
    c.execute(
        "INSERT INTO webhook_queue(webhook_id, event, payload, next_at, created_at) VALUES (?1,?2,?3,?4,?4)",
        rusqlite::params![id, event, json!({ "event": event, "zeit": db::now(), "daten": payload }).to_string(), db::now()],
    )
    .map_err(err)?;
    Ok(())
}

/* ── REST-API ── */

#[tauri::command]
fn api_status(app: AppHandle) -> Res<Value> {
    let db = app.state::<db::Db>();
    let c = db.conn.lock().unwrap();
    Ok(json!({ "running": api::running(&app.state::<api::ApiState>()), "keys": api::keys(&c).map_err(err)?, "endpoints": api::endpoints(&c).map_err(err)?, "openapi": api::openapi() }))
}
#[tauri::command]
fn api_toggle(app: AppHandle, on: bool, lan: bool, port: u16) -> Res<Option<String>> {
    let db = app.state::<db::Db>();
    {
        let c = db.conn.lock().unwrap();
        db::setting_set(&c, "api.aktiv", &json!(on)).map_err(err)?;
        db::setting_set(&c, "api.lan", &json!(lan)).map_err(err)?;
        db::setting_set(&c, "api.port", &json!(port)).map_err(err)?;
        let _ = db::audit_append(&c, "config.api", &json!({ "aktiv": on, "netzwerk": lan, "port": port }));
    }
    let st = app.state::<api::ApiState>();
    if on { api::start(&st, db.path.clone(), lan, port).map(Some) } else { api::stop(&st); Ok(None) }
}
#[tauri::command]
fn api_key_create(db: State<db::Db>, name: String, scopes: Vec<String>) -> Res<String> {
    let c = db.conn.lock().unwrap();
    let k = api::key_create(&c, &name, &scopes)?;
    let _ = db::audit_append(&c, "config.api.key.created", &json!({ "name": name, "rechte": scopes }));
    Ok(k)
}
#[tauri::command]
fn api_key_revoke(db: State<db::Db>, id: i64) -> Res<()> {
    let c = db.conn.lock().unwrap();
    api::key_revoke(&c, id)?;
    let _ = db::audit_append(&c, "config.api.key.revoked", &json!({ "id": id }));
    Ok(())
}
#[tauri::command]
fn api_endpoint_save(db: State<db::Db>, id: Option<i64>, slug: String, title: String, sql: String, active: bool) -> Res<i64> {
    let c = db.conn.lock().unwrap();
    api::endpoint_save(&c, id, &slug, &title, &sql, active)
}
#[tauri::command]
fn api_endpoint_delete(db: State<db::Db>, id: i64) -> Res<()> {
    db.conn.lock().unwrap().execute("DELETE FROM api_endpoints WHERE id = ?1", [id]).map_err(err)?;
    Ok(())
}
#[tauri::command]
fn api_query_test(db: State<db::Db>, sql: String, args: Value) -> Res<Value> {
    let sql = api::check_sql(&sql)?;
    let a: Vec<(String, String)> = args.as_object().map(|m| m.iter().map(|(k, v)| (k.clone(), v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string()))).collect()).unwrap_or_default();
    api::run_query(&db.path, &sql, &a)
}

/* ── Rechte & Zwei-Faktor ── */

#[tauri::command]
fn permissions_get(db: State<db::Db>) -> Value {
    security::matrix(&db.conn.lock().unwrap())
}
#[tauri::command]
fn permission_set(db: State<db::Db>, role: String, perm: String, allowed: bool, by: Option<String>) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    security::set(&c, &role, &perm, allowed)?;
    let _ = db::audit_append(&c, "config.permission", &json!({ "rolle": role, "recht": perm, "erlaubt": allowed, "durch": by }));
    Ok(security::matrix(&c))
}
#[tauri::command]
fn totp_begin(db: State<db::Db>, user: String) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    let name: String = c.query_row("SELECT name FROM users WHERE id = ?1", [&user], |r| r.get(0)).map_err(err)?;
    let firm = db::setting_get(&c, "firma.marke").and_then(|v| v.as_str().map(str::to_string)).unwrap_or_else(|| "Kontor".into());
    let (secret, uri) = security::totp_new(&name, &format!("Kontor {firm}"));
    Ok(json!({ "secret": secret, "uri": uri }))
}
#[tauri::command]
fn totp_enable(db: State<db::Db>, user: String, secret: String, code: String) -> Res<()> {
    let c = db.conn.lock().unwrap();
    security::totp_enable(&c, &user, &secret, &code)?;
    let _ = db::audit_append(&c, "auth.totp.enabled", &json!({ "benutzer": user }));
    Ok(())
}
#[tauri::command]
fn totp_disable(db: State<db::Db>, user: String, by: Option<String>) -> Res<()> {
    let c = db.conn.lock().unwrap();
    security::totp_disable(&c, &user)?;
    let _ = db::audit_append(&c, "auth.totp.disabled", &json!({ "benutzer": user, "durch": by }));
    Ok(())
}
#[tauri::command]
fn totp_users(db: State<db::Db>) -> Vec<String> {
    let c = db.conn.lock().unwrap();
    let Ok(mut st) = c.prepare("SELECT id FROM users WHERE totp_secret IS NOT NULL") else { return vec![] };
    st.query_map([], |r| r.get(0)).map(|r| r.filter_map(Result::ok).collect()).unwrap_or_default()
}

/* ── Lokale KI ── */

#[tauri::command]
fn ai_forecast(db: State<db::Db>) -> Res<Vec<Value>> {
    ai::forecast(&db.conn.lock().unwrap())
}
#[tauri::command]
fn ai_reorder(db: State<db::Db>) -> Res<Vec<Value>> {
    ai::reorder(&db.conn.lock().unwrap())
}
#[tauri::command]
fn ai_insights(db: State<db::Db>) -> Res<Vec<Value>> {
    ai::insights(&db.conn.lock().unwrap())
}
#[tauri::command]
async fn ai_llm(app: AppHandle, system: String, prompt: String) -> Res<String> {
    let (url, model) = {
        let db = app.state::<db::Db>();
        let c = db.conn.lock().unwrap();
        let g = |k: &str| db::setting_get(&c, k).and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
        (g("ki.url"), g("ki.modell"))
    };
    if url.is_empty() || model.is_empty() {
        return Err("Kein lokales Sprachmodell eingerichtet (Einstellungen → KI)".into());
    }
    tauri::async_runtime::spawn_blocking(move || ai::llm(&url, &model, &system, &prompt)).await.map_err(err)?
}
#[tauri::command]
async fn ai_models(url: String) -> Res<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || ai::llm_models(&url)).await.map_err(err)?
}

/* ── Buchhaltung ── */

#[tauri::command]
async fn fibu_export(app: AppHandle, von: String, bis: String, format: String) -> Res<Option<String>> {
    let (text, n) = {
        let db = app.state::<db::Db>();
        let c = db.conn.lock().unwrap();
        let ls = accounting::lines(&c, &von, &bis)?;
        let t = if format == "datev" { accounting::datev(&c, &ls, &von, &bis) } else { accounting::journal_csv(&ls) };
        (t, ls.len())
    };
    if n == 0 {
        return Err("Keine Buchungen im Zeitraum".into());
    }
    let name = format!("{}_{}_{}.csv", if format == "datev" { "EXTF_Buchungsstapel" } else { "Kontor_Buchungsjournal" }, von, bis);
    let Some(path) = app.dialog().file().set_title("Buchhaltungsexport speichern").set_file_name(&name).add_filter("CSV", &["csv"]).blocking_save_file() else { return Ok(None) };
    let p = path.into_path().map_err(err)?;
    // DATEV erwartet Windows-1252; Journal mit BOM für Excel/BMD
    let bytes: Vec<u8> = if format == "datev" { text.chars().map(|ch| if (ch as u32) < 256 { ch as u8 } else if ch == '€' { 0x80 } else if ch == '–' { b'-' } else { b'?' }).collect() } else { format!("\u{feff}{text}").into_bytes() };
    std::fs::write(&p, bytes).map_err(err)?;
    let db = app.state::<db::Db>();
    let _ = db::audit_append(&db.conn.lock().unwrap(), "fibu.exported", &json!({ "von": von, "bis": bis, "format": format, "zeilen": n }));
    Ok(Some(p.display().to_string()))
}
#[tauri::command]
fn fibu_preview(db: State<db::Db>, von: String, bis: String) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    Ok(accounting::lines(&c, &von, &bis)?
        .into_iter()
        .map(|l| json!({ "datum": l.date, "beleg": l.beleg, "soll": l.soll, "haben": l.haben, "betrag": l.betrag, "ust": l.ust, "steuer": l.steuer, "text": l.text }))
        .collect())
}

/* ── Zahlungsterminal (ZVT) ── */

fn terminal_cfg(c: &rusqlite::Connection) -> (String, String) {
    let g = |k: &str| db::setting_get(c, k).map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())).unwrap_or_default();
    (g("terminal.adresse"), { let p = g("terminal.passwort"); if p.is_empty() { "000000".into() } else { p } })
}
fn terminal_log(app: &AppHandle, kind: &str, amount: i64, r: &Result<zvt::Result, String>) {
    let db = app.state::<db::Db>();
    let c = db.conn.lock().unwrap();
    let ok = matches!(r, Ok(x) if x.ok);
    let _ = c.execute(
        "INSERT INTO terminal_log(ts, kind, amount, ok, result) VALUES (?1,?2,?3,?4,?5)",
        rusqlite::params![db::now(), kind, amount, ok as i64, match r { Ok(x) => serde_json::to_string(x).unwrap(), Err(e) => e.clone() }],
    );
}
#[tauri::command]
async fn terminal_pay(app: AppHandle, amount: i64) -> Res<zvt::Result> {
    let (addr, _) = { terminal_cfg(&app.state::<db::Db>().conn.lock().unwrap()) };
    if addr.is_empty() {
        return Err("Kein Zahlungsterminal eingerichtet".into());
    }
    let r = tauri::async_runtime::spawn_blocking(move || zvt::pay(&addr, amount)).await.map_err(err)?;
    terminal_log(&app, "zahlung", amount, &r);
    r
}
#[tauri::command]
async fn terminal_admin(app: AppHandle, action: String, receipt: Option<String>) -> Res<zvt::Result> {
    let (addr, pw) = { terminal_cfg(&app.state::<db::Db>().conn.lock().unwrap()) };
    if addr.is_empty() {
        return Err("Kein Zahlungsterminal eingerichtet".into());
    }
    let a = action.clone();
    let r = tauri::async_runtime::spawn_blocking(move || match a.as_str() {
        "anmelden" => zvt::register(&addr, &pw),
        "kassenschnitt" => zvt::end_of_day(&addr, &pw),
        "storno" => zvt::reversal(&addr, &pw, receipt.as_deref().unwrap_or("0")),
        _ => Err("Unbekannte Aktion".into()),
    })
    .await
    .map_err(err)?;
    terminal_log(&app, &action, 0, &r);
    r
}

/* ── Paket 7: Protokoll-Suche, Import, Kassenbuch, Kundendisplay, Handy ── */

#[tauri::command]
fn audit_query(db: State<db::Db>, q: Option<String>, prefix: Option<String>, before: Option<i64>, limit: Option<i64>) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    let like = q.filter(|s| !s.trim().is_empty()).map(|s| format!("%{}%", s.trim().to_lowercase()));
    let pre = prefix.filter(|s| !s.is_empty()).map(|s| format!("{s}%"));
    let mut st = c
        .prepare("SELECT id, ts, event, payload FROM audit_log WHERE (?1 IS NULL OR lower(event || ' ' || payload) LIKE ?1) AND (?2 IS NULL OR event LIKE ?2) AND (?3 IS NULL OR id < ?3) AND event NOT LIKE 'test.%' ORDER BY id DESC LIMIT ?4")
        .map_err(err)?;
    let rows = st
        .query_map(rusqlite::params![like, pre, before, limit.unwrap_or(200).clamp(1, 2000)], |r| {
            let p: String = r.get(3)?;
            Ok(json!({ "id": r.get::<_, i64>(0)?, "ts": r.get::<_, String>(1)?, "event": r.get::<_, String>(2)?, "payload": serde_json::from_str::<Value>(&p).unwrap_or(Value::Null) }))
        })
        .map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

/// Artikel (mit Varianten) und optional Bestände in einem Schritt importieren – alles oder nichts.
#[tauri::command]
fn articles_import(db: State<db::Db>, articles: Vec<catalog::Article>, stock: Vec<(String, i64)>, user: Option<String>) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    for a in &articles {
        catalog::save(&tx, a).map_err(|e| format!("Artikel {}: {e}", a.id))?;
    }
    let mut booked = 0;
    for (ean, q) in &stock {
        let vid: i64 = tx.query_row("SELECT id FROM variants WHERE ean = ?1 AND active = 1", [ean.trim()], |r| r.get(0)).map_err(|_| format!("EAN {ean} unbekannt"))?;
        catalog::book(&tx, vid, *q, true, "Import", None, user.as_deref())?;
        booked += 1;
    }
    db::audit_append(&tx, "catalog.imported", &json!({ "artikel": articles.len(), "bestaende": booked, "benutzer": user })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(json!({ "artikel": articles.len(), "bestaende": booked, "list": catalog::list(&c).map_err(err)? }))
}

#[tauri::command]
fn customers_import(db: State<db::Db>, list: Vec<customers::Customer>, user: Option<String>) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    for (i, k) in list.iter().enumerate() {
        customers::save(&tx, k).map_err(|e| format!("Zeile {}: {e}", i + 2))?;
    }
    db::audit_append(&tx, "customer.imported", &json!({ "anzahl": list.len(), "benutzer": user })).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(json!({ "anzahl": list.len(), "list": customers::list(&c).map_err(err)? }))
}

#[tauri::command]
fn cash_moves_list(db: State<db::Db>, limit: Option<i64>) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    let mut st = c.prepare("SELECT id, ts, kind, amount, reason, user, closing_id FROM cash_moves ORDER BY id DESC LIMIT ?1").map_err(err)?;
    let rows = st
        .query_map([limit.unwrap_or(300)], |r| {
            Ok(json!({ "id": r.get::<_, i64>(0)?, "ts": r.get::<_, String>(1)?, "kind": r.get::<_, String>(2)?, "amount": r.get::<_, i64>(3)?, "reason": r.get::<_, String>(4)?, "user": r.get::<_, Option<String>>(5)?, "closing_id": r.get::<_, Option<i64>>(6)? }))
        })
        .map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

/// Kundendisplay: zweites Fenster (auf dem zweiten Bildschirm im Vollbild, falls vorhanden)
#[tauri::command]
async fn display_open(app: AppHandle) -> Res<bool> {
    if let Some(w) = app.get_webview_window("kundendisplay") {
        let _ = w.set_focus();
        return Ok(false);
    }
    let w = tauri::WebviewWindowBuilder::new(&app, "kundendisplay", tauri::WebviewUrl::App("index.html".into()))
        .title("Kontor · Kundendisplay")
        .inner_size(1024.0, 640.0)
        .initialization_script("window.__KONTOR_DISPLAY__ = true;")
        .build()
        .map_err(err)?;
    let primary = app.primary_monitor().ok().flatten();
    let second = app.available_monitors().unwrap_or_default().into_iter().find(|m| primary.as_ref().map(|p| p.position() != m.position()).unwrap_or(false));
    if let Some(m) = second {
        let p = m.position();
        let _ = w.set_position(tauri::PhysicalPosition::new(p.x + 20, p.y + 20));
        let _ = w.set_fullscreen(true);
        return Ok(true);
    }
    Ok(false)
}
#[tauri::command]
fn display_close(app: AppHandle) {
    if let Some(w) = app.get_webview_window("kundendisplay") {
        let _ = w.close();
    }
}
#[tauri::command]
fn display_push(app: AppHandle, payload: Value) {
    if app.get_webview_window("kundendisplay").is_some() {
        let _ = app.emit_to("kundendisplay", "kd", payload);
    }
}
#[tauri::command]
fn display_status(app: AppHandle) -> bool {
    app.get_webview_window("kundendisplay").is_some()
}

#[tauri::command]
fn mobile_info(app: AppHandle) -> Value {
    let db = app.state::<db::Db>();
    let c = db.conn.lock().unwrap();
    let g = |k: &str| db::setting_get(&c, k);
    json!({ "ips": mobile::local_ips(), "running": api::running(&app.state::<api::ApiState>()),
        "lan": g("api.lan").and_then(|v| v.as_bool()).unwrap_or(false), "port": g("api.port").and_then(|v| v.as_u64()).unwrap_or(8787) })
}

/* ── Paket 8: Filialverbund ── */

#[tauri::command]
fn verbund_info(db: State<db::Db>) -> Value {
    let c = db.conn.lock().unwrap();
    let g = |k: &str| db::setting_get(&c, k).unwrap_or(Value::Null);
    let rolle = verbund::rolle(&c);
    json!({ "rolle": rolle, "filiale": verbund::own_store(&c), "name": g("verbund.name"), "url": g("verbund.url"), "verbunden": !g("verbund.schluessel").is_null() && g("verbund.schluessel") != json!(""),
        "ungemeldet": if rolle == "filiale" { c.query_row("SELECT COUNT(*) FROM sales WHERE id > ?1", [g("verbund.c_sale").as_i64().unwrap_or(0)], |r| r.get::<_, i64>(0)).unwrap_or(0) } else { 0 },
        "status": g("verbund.status"), "stores": if rolle == "zentrale" { verbund::overview(&c).map(|o| o["stores"].clone()).unwrap_or(json!([])) } else { g("verbund.umsatz") } })
}
#[tauri::command]
fn verbund_setup(app: AppHandle, rolle: String, filiale: String, name: String, code: Option<String>, by: Option<String>) -> Res<Value> {
    if !verbund::ROLLEN.contains(&rolle.as_str()) {
        return Err("Unbekannte Rolle".into());
    }
    let db = app.state::<db::Db>();
    {
        let c = db.conn.lock().unwrap();
        let fil = filiale.trim().to_uppercase();
        if rolle != "einzel" && (fil.len() < 2 || fil.len() > 12) {
            return Err("Filialkennung: 2–12 Zeichen (z. B. INN)".into());
        }
        db::setting_set(&c, "verbund.rolle", &json!(rolle)).map_err(err)?;
        db::setting_set(&c, "verbund.filiale", &json!(fil)).map_err(err)?;
        db::setting_set(&c, "verbund.name", &json!(name.trim())).map_err(err)?;
        if rolle == "filiale" {
            // Verbindungscode der Zentrale: Base64(JSON {url, schluessel, filiale})
            let raw = code.unwrap_or_default();
            let txt = String::from_utf8(base64::engine::general_purpose::STANDARD.decode(raw.trim()).map_err(|_| "Verbindungscode ungültig".to_string())?).map_err(err)?;
            let v: Value = serde_json::from_str(&txt).map_err(|_| "Verbindungscode ungültig".to_string())?;
            let (url, key) = (v["url"].as_str().unwrap_or(""), v["schluessel"].as_str().unwrap_or(""));
            if url.is_empty() || key.is_empty() {
                return Err("Verbindungscode unvollständig".into());
            }
            if let Some(f) = v["filiale"].as_str() {
                db::setting_set(&c, "verbund.filiale", &json!(f)).map_err(err)?;
            }
            db::setting_set(&c, "verbund.url", &json!(url)).map_err(err)?;
            db::setting_set(&c, "verbund.schluessel", &json!(key)).map_err(err)?;
            for k in ["verbund.c_sale", "verbund.c_move", "verbund.c_points"] {
                db::setting_set(&c, k, &json!(0)).map_err(err)?;
            }
            db::setting_set(&c, "verbund.c_cust", &json!("")).map_err(err)?;
            db::setting_set(&c, "verbund.c_pull", &json!("")).map_err(err)?;
            db::setting_set(&c, "verbund.jetzt", &json!("1")).map_err(err)?;
        }
        let _ = db::audit_append(&c, "config.verbund", &json!({ "rolle": rolle, "filiale": fil, "durch": by }));
    }
    if rolle == "zentrale" {
        let (port, running) = {
            let c = db.conn.lock().unwrap();
            db::setting_set(&c, "api.aktiv", &json!(true)).map_err(err)?;
            db::setting_set(&c, "api.lan", &json!(true)).map_err(err)?;
            (db::setting_get(&c, "api.port").and_then(|v| v.as_u64()).unwrap_or(8787) as u16, api::running(&app.state::<api::ApiState>()))
        };
        if running.as_deref().map(|a| !a.starts_with("0.0.0.0")).unwrap_or(true) {
            api::start(&app.state::<api::ApiState>(), db.path.clone(), true, port)?;
        }
    }
    Ok(verbund_info(db))
}
#[tauri::command]
async fn verbund_test(app: AppHandle) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || { let c = db::open(&p).map_err(err)?; verbund::hello(&c) }).await.map_err(err)?
}
#[tauri::command]
async fn verbund_sync(app: AppHandle) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || { let c = db::open(&p).map_err(err)?; let _ = c.busy_timeout(std::time::Duration::from_secs(10)); verbund::sync_once(&c) }).await.map_err(err)?
}
#[tauri::command]
fn verbund_store_create(db: State<db::Db>, id: String, name: String, addr: String) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    if verbund::rolle(&c) != "zentrale" {
        return Err("Filialen legt die Zentrale an".into());
    }
    let key = verbund::store_create(&c, &id, &name, &addr)?;
    let port = db::setting_get(&c, "api.port").and_then(|v| v.as_u64()).unwrap_or(8787);
    let ip = mobile::local_ips().into_iter().next().unwrap_or_else(|| "127.0.0.1".into());
    let url = format!("http://{ip}:{port}");
    let code = base64::engine::general_purpose::STANDARD.encode(json!({ "url": url, "schluessel": key, "filiale": id.trim().to_uppercase() }).to_string());
    let _ = db::audit_append(&c, "verbund.store.created", &json!({ "filiale": id.trim().to_uppercase(), "name": name }));
    Ok(json!({ "code": code, "url": url }))
}
#[tauri::command]
fn verbund_store_toggle(db: State<db::Db>, id: String, active: bool) -> Res<()> {
    db.conn.lock().unwrap().execute("UPDATE stores SET active = ?2 WHERE id = ?1", rusqlite::params![id, active as i64]).map_err(err)?;
    Ok(())
}
#[tauri::command]
fn verbund_stock(db: State<db::Db>) -> Res<Value> {
    verbund::stock_matrix(&db.conn.lock().unwrap())
}
#[tauri::command]
fn verbund_transfers(db: State<db::Db>) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    let own = verbund::own_store(&c);
    verbund::transfers(&c, if verbund::rolle(&c) == "zentrale" { None } else { Some(&own) }).map_err(err)
}
#[tauri::command]
async fn verbund_transfer_create(app: AppHandle, from: String, to: String, lines: Value, note: String, user: String) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    let r = tauri::async_runtime::spawn_blocking(move || {
        let c = db::open(&p).map_err(err)?;
        if verbund::rolle(&c) == "zentrale" { verbund::transfer_create(&c, &from, &to, &lines, &note, &user) } else { verbund::remote_transfer(&c, &json!({ "from": from, "to": to, "lines": lines, "note": note, "user": user })) }
    })
    .await
    .map_err(err)?;
    if let Ok(t) = &r {
        let _ = db::audit_append(&app.state::<db::Db>().conn.lock().unwrap(), "verbund.transfer.created", &json!({ "nr": t["no"], "von": t["from"], "nach": t["to"] }));
    }
    r
}
#[tauri::command]
async fn verbund_transfer_status(app: AppHandle, no: String, status: String, user: String) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let c = db::open(&p).map_err(err)?;
        let _ = c.busy_timeout(std::time::Duration::from_secs(10));
        let own = verbund::own_store(&c);
        let r = if verbund::rolle(&c) == "zentrale" { verbund::transfer_status(&c, &no, &status, &own, &own, &user) } else { verbund::remote_transfer_status(&c, &no, &status, &user) };
        if let Ok(t) = &r {
            let _ = db::audit_append(&c, "verbund.transfer.status", &json!({ "nr": t["no"], "status": t["status"], "benutzer": user }));
        }
        r
    })
    .await
    .map_err(err)?
}
#[tauri::command]
fn verbund_suggestions(db: State<db::Db>) -> Res<Vec<Value>> {
    verbund::suggestions(&db.conn.lock().unwrap())
}

/* ── Paket 8: Anmeldung ── */

#[tauri::command]
fn auth_methods(db: State<db::Db>) -> Value {
    auth::methods(&db.conn.lock().unwrap())
}
#[tauri::command]
fn auth_password_set(db: State<db::Db>, user: String, login: String, password: Option<String>, by: Option<String>) -> Res<()> {
    let c = db.conn.lock().unwrap();
    auth::password_set(&c, &user, &login, password.as_deref().filter(|p| !p.is_empty()))?;
    let _ = db::audit_append(&c, "auth.password.set", &json!({ "benutzer": user, "durch": by }));
    Ok(())
}
#[tauri::command]
fn auth_password_clear(db: State<db::Db>, user: String, by: Option<String>) -> Res<()> {
    let c = db.conn.lock().unwrap();
    auth::password_clear(&c, &user)?;
    let _ = db::audit_append(&c, "auth.password.cleared", &json!({ "benutzer": user, "durch": by }));
    Ok(())
}
#[tauri::command]
fn auth_login_password(db: State<db::Db>, login: String, password: String, code: Option<String>) -> Res<users::User> {
    let c = db.conn.lock().unwrap();
    let r = auth::password_verify(&c, &login, &password, code.as_deref());
    if matches!(&r, Err(e) if e == "TOTP") {
        return Err("TOTP".into());
    }
    let _ = db::audit_append(&c, if r.is_ok() { "auth.password.ok" } else { "auth.password.failed" }, &json!({ "login": login }));
    let id = r?;
    users::list(&c).map_err(err)?.into_iter().find(|u| u.id == id).ok_or_else(|| "Benutzer nicht gefunden".into())
}
#[tauri::command]
async fn auth_sso(app: AppHandle) -> Res<users::User> {
    let cfg = {
        let db = app.state::<db::Db>();
        let c = db.conn.lock().unwrap();
        let g = |k: &str| db::setting_get(&c, k).and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
        auth::OidcCfg { issuer: g("sso.issuer"), client_id: g("sso.client_id"), client_secret: g("sso.client_secret") }
    };
    let who = tauri::async_runtime::spawn_blocking(move || auth::oidc_login(&cfg)).await.map_err(err)??;
    let db = app.state::<db::Db>();
    let c = db.conn.lock().unwrap();
    let email = who["email"].as_str().unwrap_or("").to_string();
    let Some(id) = auth::user_by_login(&c, &email) else {
        let _ = db::audit_append(&c, "auth.sso.unknown", &json!({ "email": email }));
        return Err(format!("{email} ist keinem Kontor-Benutzer zugeordnet (Benutzer → Anmeldung: E-Mail eintragen)"));
    };
    let _ = db::audit_append(&c, "auth.sso.ok", &json!({ "benutzer": id, "email": email }));
    users::list(&c).map_err(err)?.into_iter().find(|u| u.id == id).ok_or_else(|| "Benutzer nicht gefunden".into())
}
#[tauri::command]
async fn auth_hello(window: tauri::WebviewWindow, app: AppHandle, user: String, enable: bool) -> Res<users::User> {
    #[cfg(windows)]
    let hwnd = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    #[cfg(not(windows))]
    let hwnd = { let _ = &window; 0isize };
    {
        let db = app.state::<db::Db>();
        let c = db.conn.lock().unwrap();
        let on: i64 = c.query_row("SELECT hello FROM users WHERE id = ?1 AND active = 1", [&user], |r| r.get(0)).map_err(|_| "Benutzer nicht gefunden".to_string())?;
        if on == 0 && !enable {
            return Err("Windows Hello ist für diese Person nicht eingerichtet".into());
        }
    }
    let msg = if enable { "Windows Hello für die Kontor-Anmeldung einrichten" } else { "Bei Kontor anmelden" };
    tauri::async_runtime::spawn_blocking(move || auth::hello_verify(hwnd, msg)).await.map_err(err)??;
    let db = app.state::<db::Db>();
    let c = db.conn.lock().unwrap();
    if enable {
        auth::hello_set(&c, &user, true)?;
    }
    let _ = db::audit_append(&c, if enable { "auth.hello.enabled" } else { "auth.hello.ok" }, &json!({ "benutzer": user }));
    users::list(&c).map_err(err)?.into_iter().find(|u| u.id == user).ok_or_else(|| "Benutzer nicht gefunden".into())
}
#[tauri::command]
fn auth_hello_off(db: State<db::Db>, user: String) -> Res<()> {
    auth::hello_set(&db.conn.lock().unwrap(), &user, false)
}
#[tauri::command]
fn auth_qr_start(app: AppHandle) -> Res<Value> {
    let running = api::running(&app.state::<api::ApiState>());
    let Some(addr) = running.filter(|a| a.starts_with("0.0.0.0")) else { return Err("Handy-Zugang ist nicht freigegeben (Einstellungen → Handy & Tablet)".into()) };
    let port = addr.rsplit(':').next().unwrap_or("8787").to_string();
    let ip = mobile::local_ips().into_iter().next().ok_or("Keine Netzwerkverbindung")?;
    let t = mobile::qr_start();
    Ok(json!({ "token": t, "url": format!("http://{ip}:{port}/mobil#qr={t}") }))
}
#[tauri::command]
fn auth_qr_poll(db: State<db::Db>, token: String) -> Res<Option<users::User>> {
    let Some(id) = mobile::qr_status(&token)? else { return Ok(None) };
    let c = db.conn.lock().unwrap();
    let _ = db::audit_append(&c, "auth.qr.login", &json!({ "benutzer": id }));
    Ok(users::list(&c).map_err(err)?.into_iter().find(|u| u.id == id))
}

/* ── Paket 8: Erweiterungen ── */

#[tauri::command]
fn ext_list(db: State<db::Db>) -> Res<Vec<Value>> {
    extensions::list(&db.conn.lock().unwrap()).map_err(err)
}
#[tauri::command]
fn ext_install(db: State<db::Db>, manifest: Value, by: Option<String>) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    extensions::install(&c, &manifest)?;
    let _ = db::audit_append(&c, "config.extension.installed", &json!({ "erweiterung": manifest["id"], "version": manifest["version"], "durch": by }));
    extensions::list(&c).map_err(err)
}
#[tauri::command]
fn ext_enable(db: State<db::Db>, id: String, on: bool) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    extensions::set_enabled(&c, &id, on)?;
    let _ = db::audit_append(&c, "config.extension.enabled", &json!({ "erweiterung": id, "aktiv": on }));
    extensions::list(&c).map_err(err)
}
#[tauri::command]
fn ext_remove(db: State<db::Db>, id: String) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    extensions::remove(&c, &id)?;
    let _ = db::audit_append(&c, "config.extension.removed", &json!({ "erweiterung": id }));
    extensions::list(&c).map_err(err)
}


/* ── Paket 11: Stammdaten, Zeiterfassung, Flexanalyse, Nachrichten, EDI-Dateien, API-Protokoll ── */

#[tauri::command]
fn stamm_list(db: State<db::Db>, kind: String) -> Res<Vec<Value>> {
    stamm::list(&db.conn.lock().unwrap(), &kind)
}
#[tauri::command]
fn stamm_all(db: State<db::Db>) -> Res<Value> {
    stamm::all(&db.conn.lock().unwrap())
}
#[tauri::command]
fn stamm_save(db: State<db::Db>, kind: String, rows: Vec<Value>, user: String) -> Res<usize> {
    let c = db.conn.lock().unwrap();
    let n = stamm::save(&c, &kind, &rows)?;
    let _ = db::audit_append(&c, "stamm.saved", &json!({ "tabelle": kind, "zeilen": n, "benutzer": user }));
    Ok(n)
}
#[tauri::command]
fn zeit_stempel(db: State<db::Db>, user: String) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    let r = stamm::zeit_stempel(&c, &user)?;
    let _ = db::audit_append(&c, "zeit.stempel", &json!({ "benutzer": user, "status": r["status"] }));
    Ok(r)
}
#[tauri::command]
fn zeit_list(db: State<db::Db>, von: String, bis: String) -> Res<Vec<Value>> {
    stamm::zeit_list(&db.conn.lock().unwrap(), &von, &bis)
}
#[tauri::command]
fn zeit_save(db: State<db::Db>, entry: Value, user: String) -> Res<()> {
    let c = db.conn.lock().unwrap();
    stamm::zeit_save(&c, &entry, &user)?;
    let _ = db::audit_append(&c, "zeit.korrigiert", &json!({ "eintrag": entry, "benutzer": user }));
    Ok(())
}
#[tauri::command]
fn analyse(db: State<db::Db>, params: Value) -> Res<Value> {
    stamm::analyse(&db.conn.lock().unwrap(), &params)
}
#[tauri::command]
fn api_log_list(db: State<db::Db>, limit: Option<i64>) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    let mut st = c.prepare("SELECT id, ts, method, path, status, ip, key FROM api_log ORDER BY id DESC LIMIT ?1").map_err(err)?;
    let rows = st
        .query_map([limit.unwrap_or(2000)], |r| {
            Ok(json!({ "id": r.get::<_, i64>(0)?, "ts": r.get::<_, String>(1)?, "method": r.get::<_, String>(2)?, "path": r.get::<_, String>(3)?,
                "status": r.get::<_, i64>(4)?, "ip": r.get::<_, Option<String>>(5)?, "key": r.get::<_, Option<String>>(6)? }))
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(err)
}
#[tauri::command]
async fn msg_send(app: AppHandle, kanal: String, to: Vec<Value>, text: String, template: Option<Value>, user: String) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let cfg = msg::cfg(&app.state::<db::Db>().conn.lock().unwrap(), &kanal);
        let c = db::open(&p).map_err(err)?;
        let (mut ok, mut prep, mut bad, mut links) = (0, 0, 0, vec![]);
        for t in to.iter().take(5000) {
            let nr = t["tel"].as_str().unwrap_or("");
            let name = t["name"].as_str().unwrap_or("");
            let vorname = name.split_whitespace().next().unwrap_or("");
            let body = text.replace("{name}", name).replace("{vorname}", vorname).replace("{punkte}", &t["punkte"].to_string().trim_matches('"').replace("null", "0"));
            let mut tpl = template.clone();
            if let Some(x) = tpl.as_mut() {
                if let Some(a) = x["parameter"].as_array() {
                    x["parameter"] = json!(a.iter().map(|v| v.as_str().unwrap_or("").replace("{name}", name).replace("{vorname}", vorname)).collect::<Vec<_>>());
                }
            }
            let (st, info) = msg::send(&cfg, nr, &body, tpl.as_ref());
            match st.as_str() {
                "gesendet" => ok += 1,
                "vorbereitet" => {
                    prep += 1;
                    links.push(json!({ "name": name, "link": info }));
                }
                _ => bad += 1,
            }
            msg::log(&c, &kanal, nr, t["kunde"].as_i64(), &body, &st, &info, Some(&user))?;
        }
        let _ = db::audit_append(&c, &format!("{kanal}.versand"), &json!({ "gesendet": ok, "vorbereitet": prep, "fehler": bad, "benutzer": user }));
        Ok(json!({ "gesendet": ok, "vorbereitet": prep, "fehler": bad, "links": links }))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
fn msg_list(db: State<db::Db>, kanal: Option<String>, limit: Option<i64>) -> Res<Vec<Value>> {
    msg::list(&db.conn.lock().unwrap(), kanal.as_deref(), limit.unwrap_or(2000))
}
#[tauri::command]
fn edi_files(db: State<db::Db>, which: String) -> Res<Vec<Value>> {
    msg::edi_files(&db.conn.lock().unwrap(), &which)
}
#[tauri::command]
fn edi_read(db: State<db::Db>, which: String, name: String) -> Res<String> {
    msg::edi_read(&db.conn.lock().unwrap(), &which, &name)
}
#[tauri::command]
fn edi_write(db: State<db::Db>, which: String, name: String, content: String, user: String) -> Res<String> {
    let c = db.conn.lock().unwrap();
    let p = msg::edi_write(&c, &which, &name, &content)?;
    let _ = db::audit_append(&c, "edi.export", &json!({ "datei": p, "benutzer": user }));
    Ok(p)
}
#[tauri::command]
fn edi_done(db: State<db::Db>, name: String) -> Res<()> {
    msg::edi_done(&db.conn.lock().unwrap(), &name)
}


/* ── Paket 12: Bildergalerie, Produktseiten, FEDAS, Marken-Demo ── */

#[tauri::command]
fn article_media_list(db: State<db::Db>, id: String) -> Res<Vec<Value>> {
    media::list(&db.conn.lock().unwrap(), &id)
}
#[tauri::command]
async fn article_media_pick(app: AppHandle, id: String, color: Option<String>) -> Res<usize> {
    let Some(files) = app.dialog().file().set_title("Artikelbilder wählen").add_filter("Bilder", &["jpg", "jpeg", "png", "webp"]).blocking_pick_files() else { return Ok(0) };
    let db = app.state::<db::Db>();
    let dd = data_dir(&db);
    let c = db.conn.lock().unwrap();
    let mut n = 0;
    for f in files {
        let Ok(p) = f.into_path() else { continue };
        let bytes = std::fs::read(&p).map_err(err)?;
        media::add_bytes(&c, &dd, &id, &bytes, color.as_deref().unwrap_or(""), None)?;
        n += 1;
    }
    let _ = db::audit_append(&c, "catalog.article.media", &json!({ "artikel": id, "bilder": n }));
    Ok(n)
}
#[tauri::command]
async fn article_media_add_url(app: AppHandle, id: String, urls: Vec<String>, color: Option<String>) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let c = db::open(&p).map_err(err)?;
        let dd = p.parent().unwrap().to_path_buf();
        let (mut ok, mut bad) = (0, vec![]);
        for u in urls.iter().map(|u| u.trim()).filter(|u| !u.is_empty()) {
            match media::download(u, 15 * 1024 * 1024).and_then(|(b, _)| media::add_bytes(&c, &dd, &id, &b, color.as_deref().unwrap_or(""), Some(u))) {
                Ok(_) => ok += 1,
                Err(e) => bad.push(format!("{u}: {e}")),
            }
        }
        let _ = db::audit_append(&c, "catalog.article.media", &json!({ "artikel": id, "bilder": ok, "fehler": bad.len() }));
        Ok(json!({ "ok": ok, "fehler": bad }))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
fn article_media_remove(db: State<db::Db>, id: i64) -> Res<()> {
    let dd = data_dir(&db);
    media::remove(&db.conn.lock().unwrap(), &dd, id)
}
#[tauri::command]
fn article_media_update(db: State<db::Db>, id: String, items: Vec<Value>) -> Res<()> {
    media::update(&db.conn.lock().unwrap(), &id, &items)
}
#[tauri::command]
async fn media_fetch_pending(app: AppHandle, limit: Option<usize>, retry: Option<bool>) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let c = db::open(&p).map_err(err)?;
        let (ok, bad, rest) = media::fetch_pending_retry(&c, p.parent().unwrap(), limit.unwrap_or(12), retry.unwrap_or(false))?;
        Ok(json!({ "geladen": ok, "fehler": bad, "offen": rest }))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
fn media_pending_count(db: State<db::Db>) -> Res<i64> {
    Ok(db.conn.lock().unwrap().query_row("SELECT COUNT(*) FROM article_media WHERE status = 'offen'", [], |r| r.get(0)).unwrap_or(0))
}
#[tauri::command]
async fn web_read_page(url: String) -> Res<Value> {
    tauri::async_runtime::spawn_blocking(move || media::read_page(&url)).await.map_err(err)?
}
#[tauri::command]
fn demo_brands_seed(db: State<db::Db>) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let (n, i) = demo::seed(&mut c)?;
    let _ = advarics::wg_remap(&c);
    Ok(json!({ "artikel": n, "bilder": i, "katalog": demo::count() }))
}
#[tauri::command]
fn fedas_log_list(db: State<db::Db>, limit: Option<i64>) -> Res<Vec<Value>> {
    fedas::log_list(&db.conn.lock().unwrap(), limit.unwrap_or(200))
}
#[tauri::command]
async fn fedas_manufacturers(app: AppHandle) -> Res<Vec<Value>> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || fedas::manufacturers(&db::open(&p).map_err(err)?)).await.map_err(err)?
}
#[tauri::command]
async fn fedas_sync(app: AppHandle, user: String, full: Option<bool>) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut c = db::open(&p).map_err(err)?;
        let st = fedas::sync(&mut c, &user, full.unwrap_or(false))?;
        Ok(json!({ "neu": st.neu, "aktualisiert": st.aktualisiert, "uebersprungen": st.uebersprungen, "bilder": st.bilder }))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
fn fedas_import_file(db: State<db::Db>, content: String, format: String, user: String) -> Res<Value> {
    let v: Value = if format == "csv" { fedas::parse_csv(&content) } else { serde_json::from_str(&content).map_err(|e| format!("Kein gültiges JSON: {e}"))? };
    let items = fedas::parse_items(&v);
    if items.is_empty() {
        return Err("Keine Artikelzeilen mit EAN/GTIN erkannt – Spaltenüberschriften prüfen (EAN, Artikelnummer, Bezeichnung, Marke, Farbe, Größe, UVP)".into());
    }
    let mut c = db.conn.lock().unwrap();
    let preise = db::setting_get(&c, "fedas.preise").and_then(|v| v.as_bool()).unwrap_or(true);
    let n = items.len();
    let st = fedas::apply_items(&mut c, items, preise, &user)?;
    let _ = c.execute("INSERT INTO fedas_log(ts, art, hersteller, neu, aktualisiert, uebersprungen, user) VALUES (?1,'datei','',?2,?3,?4,?5)", rusqlite::params![db::now(), st.neu, st.aktualisiert, st.uebersprungen, user]);
    Ok(json!({ "zeilen": n, "neu": st.neu, "aktualisiert": st.aktualisiert, "uebersprungen": st.uebersprungen, "bilder": st.bilder }))
}


/* ── Advarics-Artikelexport (XLSX) einlesen ── */

#[tauri::command]
async fn advarics_pick(app: AppHandle) -> Res<Option<String>> {
    Ok(app.dialog().file().set_title("Advarics-Artikelexport wählen (XLSX)").add_filter("Excel", &["xlsx"]).blocking_pick_file().and_then(|f| f.into_path().ok()).map(|p| p.display().to_string()))
}
#[tauri::command]
async fn advarics_preview(path: String) -> Res<Value> {
    tauri::async_runtime::spawn_blocking(move || advarics::preview(std::path::Path::new(&path))).await.map_err(err)?
}
#[tauri::command]
async fn advarics_wg_preview(path: String) -> Res<Value> {
    tauri::async_runtime::spawn_blocking(move || advarics::wg_preview(std::path::Path::new(&path))).await.map_err(err)?
}
#[tauri::command]
async fn advarics_wg_import(app: AppHandle, path: String) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut c = db::open(&p).map_err(err)?;
        advarics::wg_import(&mut c, std::path::Path::new(&path))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn advarics_import(app: AppHandle, path: String, inaktiv: bool, bestand: bool, preise: bool, bilder: bool, demo_weg: bool, user: String) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut c = db::open(&p).map_err(err)?;
        advarics::import(&mut c, p.parent().unwrap(), std::path::Path::new(&path), &advarics::Opts { inaktiv, bestand, preise, bilder, demo_weg }, &user)
    })
    .await
    .map_err(err)?
}

/* ── Vorgänge (Einkauf, Faktura, Reklamation, Reservierung, Auswahl, Kampagnen …) ── */

#[tauri::command]
fn doc_list(db: State<db::Db>, kinds: Vec<String>, status: Option<String>, limit: Option<i64>) -> Res<Vec<Value>> {
    vorgang::list(&db.conn.lock().unwrap(), &kinds, status.as_deref(), limit.unwrap_or(1000))
}
#[tauri::command]
fn doc_get(db: State<db::Db>, id: i64) -> Res<Value> {
    let c = db.conn.lock().unwrap();
    let mut d = vorgang::get(&c, id)?;
    d["log"] = json!(vorgang::log_list(&c, &[d["kind"].as_str().unwrap_or("").to_string()], 2000)?.into_iter().filter(|l| l["doc_id"] == d["id"]).collect::<Vec<_>>());
    Ok(d)
}
#[tauri::command]
fn doc_save(db: State<db::Db>, doc: Value, user: String) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let d = vorgang::save(&tx, &doc, &user)?;
    tx.commit().map_err(err)?;
    Ok(d)
}
#[tauri::command]
fn doc_action(db: State<db::Db>, id: i64, action: String, payload: Option<Value>, user: String) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let d = vorgang::action(&tx, id, &action, &payload.unwrap_or(json!({})), &user)?;
    tx.commit().map_err(err)?;
    Ok(d)
}
#[tauri::command]
fn doc_log(db: State<db::Db>, kinds: Vec<String>, limit: Option<i64>) -> Res<Vec<Value>> {
    vorgang::log_list(&db.conn.lock().unwrap(), &kinds, limit.unwrap_or(500))
}
#[tauri::command]
fn doc_reserved(db: State<db::Db>) -> Res<std::collections::HashMap<String, i64>> {
    vorgang::reserved(&db.conn.lock().unwrap())
}
#[tauri::command]
fn sale_assign(db: State<db::Db>, no: String, seller: Option<String>, customer: Option<Value>, user: String) -> Res<Value> {
    let mut c = db.conn.lock().unwrap();
    let tx = c.transaction().map_err(err)?;
    let r = vorgang::sale_assign(&tx, no.trim(), seller.as_deref(), customer.as_ref(), &user)?;
    tx.commit().map_err(err)?;
    Ok(r)
}
#[tauri::command]
fn po_set_type(db: State<db::Db>, id: i64, order_type: String) -> Res<()> {
    purchasing::po_set_type(&db.conn.lock().unwrap(), id, &order_type)
}
#[tauri::command]
fn purchase_volume(db: State<db::Db>, year: i32) -> Res<Vec<Value>> {
    vorgang::purchase_volume(&db.conn.lock().unwrap(), year)
}
#[tauri::command]
fn campaign_preview(db: State<db::Db>, segment: Value) -> Res<Value> {
    let l = vorgang::segment(&db.conn.lock().unwrap(), &segment)?;
    Ok(json!({ "anzahl": l.len(), "beispiele": l.iter().take(8).map(|k| json!({ "name": k.name, "email": k.email, "stufe": k.tier })).collect::<Vec<_>>() }))
}
#[tauri::command]
async fn campaign_send(app: AppHandle, id: i64, user: String) -> Res<Value> {
    let p = app.state::<db::Db>().path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let c = db::open(&p).map_err(err)?;
        let _ = c.busy_timeout(std::time::Duration::from_secs(10));
        let cfg = mail_config(&c);
        vorgang::campaign_send(&c, id, &cfg, &user)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
fn campaign_stats(db: State<db::Db>, id: i64) -> Res<Value> {
    vorgang::campaign_stats(&db.conn.lock().unwrap(), id)
}
/// Umsatz je Tag und Filiale (eigene Belege + gemeldete Belege der Filialen)
#[tauri::command]
fn store_revenue(db: State<db::Db>, days: i64) -> Res<Vec<Value>> {
    let c = db.conn.lock().unwrap();
    let since = (chrono::Local::now() - chrono::Duration::days(days.clamp(1, 400))).format("%Y-%m-%d").to_string();
    let own = db::setting_get(&c, "verbund.filiale").and_then(|v| v.as_str().map(str::to_string)).filter(|s| !s.is_empty()).unwrap_or_else(|| "HIER".into());
    let mut out = vec![];
    let q = |sql: &str, store: Option<&str>| -> Res<Vec<Value>> {
        let mut st = c.prepare(sql).map_err(err)?;
        let rows = st
            .query_map(rusqlite::params![since], |r| {
                Ok(json!({ "store": store.map(str::to_string).unwrap_or(r.get::<_, String>(4)?), "date": r.get::<_, String>(0)?, "bons": r.get::<_, i64>(1)?, "umsatz": r.get::<_, i64>(2)?, "retouren": r.get::<_, i64>(3)? }))
            })
            .map_err(err)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(err)
    };
    out.extend(q("SELECT substr(ts,1,10), SUM(CASE WHEN COALESCE(json_extract(data,'$.kind'),'verkauf') = 'verkauf' THEN 1 ELSE 0 END), SUM(total), SUM(CASE WHEN total < 0 THEN -total ELSE 0 END), '' FROM sales WHERE substr(ts,1,10) >= ?1 GROUP BY 1", Some(&own))?);
    out.extend(q("SELECT substr(ts,1,10), SUM(CASE WHEN kind = 'verkauf' THEN 1 ELSE 0 END), SUM(total), SUM(CASE WHEN total < 0 THEN -total ELSE 0 END), store FROM store_sales WHERE substr(ts,1,10) >= ?1 AND store <> (SELECT COALESCE(json_extract(value,'$'),'') FROM settings WHERE key = 'verbund.filiale') GROUP BY store, 1", None)?);
    Ok(out)
}
/// Adresse im Standardbrowser öffnen (nur http/https)
#[tauri::command]
fn open_url(url: String) -> Res<()> {
    if !(url.starts_with("http://") || url.starts_with("https://") || (url.starts_with("mailto:") && !url.contains(['\n', '\r', ' ']))) {
        return Err("Nur http(s)- und mailto-Adressen".into());
    }
    auth::open_browser(&url)
}
#[tauri::command]
fn shop_status(app: AppHandle) -> Value {
    let running = api::running(&app.state::<api::ApiState>());
    let port = running.as_deref().and_then(|a| a.rsplit(':').next()).unwrap_or("8787").to_string();
    let lan = running.as_deref().is_some_and(|a| a.starts_with("0.0.0.0"));
    let mut urls = vec![format!("http://127.0.0.1:{port}/shop")];
    if lan {
        urls = mobile::local_ips().into_iter().map(|ip| format!("http://{ip}:{port}/shop")).chain(urls).collect();
    }
    json!({ "laeuft": running.is_some(), "netzwerk": lan, "urls": urls })
}

/// Vollbild / Kassen-Kiosk ein- oder ausschalten.
#[tauri::command]
fn set_fullscreen(window: tauri::WebviewWindow, on: bool) -> Res<bool> {
    window.set_fullscreen(on).map_err(err)?;
    Ok(on)
}

/// Anzeigegröße (Zoom der Oberfläche), 0.7 – 2.0.
#[tauri::command]
fn set_zoom(window: tauri::WebviewWindow, factor: f64) -> Res<f64> {
    let f = factor.clamp(0.7, 2.0);
    window.set_zoom(f).map_err(err)?;
    Ok(f)
}

fn main() {
    // Portabler Betrieb / mehrere Kassen auf einem Rechner (z. B. Schulung, Test): eigener Datenordner
    let portable = std::env::var("KONTOR_DATA_DIR").ok().filter(|d| !d.trim().is_empty());
    let mut builder = tauri::Builder::default();
    if portable.is_none() {
        // Nur eine Instanz pro Rechner: ein zweiter Start holt das offene Fenster nach vorne.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updates::Pending::default())
        .manage(api::ApiState::default())
        .setup(move |app| {
            let dir = match &portable { Some(d) => PathBuf::from(d), None => app.path().app_data_dir()? };
            std::fs::create_dir_all(&dir)?;
            // Artikelbilder über das Asset-Protokoll – auch bei abweichendem Datenverzeichnis erlauben
            let _ = app.asset_protocol_scope().allow_directory(dir.join("bilder"), true);
            let path = dir.join("kontor.db");
            let conn = db::open(&path).map_err(|e| format!("Datenbank konnte nicht geöffnet werden: {e}"))?;
            let _ = db::audit_append(&conn, "system.started", &json!({ "version": app.package_info().version.to_string() }));
            users::seed(&conn).map_err(|e| format!("Benutzer: {e}"))?;
            let mut conn = conn;
            if let Err(e) = advarics::wg_seed(&mut conn) { let _ = db::audit_append(&conn, "warengruppen.seed.failed", &json!({ "fehler": e })); }
            let _ = advarics::wg_remap(&conn);
            let _ = advarics::groessenschluessel_seed(&mut conn);
            let _ = advarics::groessenschluessel_zuordnung(&mut conn);
            if let Err(e) = advarics::groessen_seed(&mut conn) { let _ = db::audit_append(&conn, "groessen.seed.failed", &json!({ "fehler": e })); }
            let _ = advarics::groessen_g1(&mut conn);
            if db::count(&conn, "articles") > 0 {
                purchasing::supplier_seed(&conn).map_err(|e| format!("Lieferanten: {e}"))?;
            }
            // Hintergrund-Dienste: Webhook-Zustellung, lokale REST-API (falls eingeschaltet)
            automation::start_worker(path.clone());
            verbund::start_worker(path.clone());
            fedas::start_worker(path.clone());
            let api_cfg = (db::setting_get(&conn, "api.aktiv").and_then(|v| v.as_bool()).unwrap_or(false), db::setting_get(&conn, "api.lan").and_then(|v| v.as_bool()).unwrap_or(false), db::setting_get(&conn, "api.port").and_then(|v| v.as_u64()).unwrap_or(8787) as u16);
            if api_cfg.0 {
                if let Err(e) = api::start(&app.state::<api::ApiState>(), path.clone(), api_cfg.1, api_cfg.2) {
                    let _ = db::audit_append(&conn, "api.start.failed", &json!({ "fehler": e }));
                }
            }
            app.manage(db::Db { conn: Mutex::new(conn), path });
            // Nur Entwicklungs-Builds: automatisierte Oberflächentests (Skript wird nach dem Start im Fenster ausgeführt).
            #[cfg(debug_assertions)]
            if let Ok(p) = std::env::var("KONTOR_TEST_SCRIPT") {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    if let (Ok(js), Some(w)) = (std::fs::read_to_string(&p), handle.get_webview_window("main")) {
                        let _ = w.eval(&js);
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            advarics_pick,
            advarics_preview,
            advarics_import,
            article_card,
            advarics_wg_preview,
            advarics_wg_import,
            article_media_list,
            article_media_pick,
            article_media_add_url,
            article_media_remove,
            article_media_update,
            media_fetch_pending,
            media_pending_count,
            web_read_page,
            demo_brands_seed,
            fedas_log_list,
            fedas_manufacturers,
            fedas_sync,
            fedas_import_file,
            stamm_list,
            stamm_all,
            stamm_save,
            zeit_stempel,
            zeit_list,
            zeit_save,
            analyse,
            api_log_list,
            msg_send,
            msg_list,
            edi_files,
            edi_read,
            edi_write,
            edi_done,
            verbund_info,
            verbund_setup,
            verbund_test,
            verbund_sync,
            verbund_store_create,
            verbund_store_toggle,
            verbund_stock,
            verbund_transfers,
            verbund_transfer_create,
            verbund_transfer_status,
            verbund_suggestions,
            auth_methods,
            auth_password_set,
            auth_password_clear,
            auth_login_password,
            auth_sso,
            auth_hello,
            auth_hello_off,
            auth_qr_start,
            auth_qr_poll,
            ext_list,
            ext_install,
            ext_enable,
            ext_remove,
            doc_list,
            doc_get,
            doc_save,
            doc_action,
            doc_log,
            doc_reserved,
            sale_assign,
            po_set_type,
            purchase_volume,
            campaign_preview,
            campaign_send,
            campaign_stats,
            store_revenue,
            shop_status,
            open_url,
            voucher_set_pin,
            voucher_check_pin,
            voucher_bonus,
            voucher_delete,
            voucher_moves,
            audit_query,
            articles_import,
            customers_import,
            cash_moves_list,
            display_open,
            display_close,
            display_push,
            display_status,
            mobile_info,
            app_info,
            settings_get,
            settings_set,
            audit_append,
            audit_recent,
            backup_create,
            backup_list,
            backup_verify,
            backup_restore,
            backup_password_set,
            backup_password_status,
            label_print,
            article_image_pick,
            article_image_remove,
            logo_pick,
            mail_send,
            inventory_start,
            inventory_count,
            inventory_get,
            inventory_list,
            inventory_finish,
            inventory_discard,
            promotions_list,
            promotion_save,
            promotion_delete,
            fields_list,
            field_save,
            field_delete,
            fields_validate,
            entities_list,
            entity_save,
            entity_delete,
            records_list,
            record_save,
            record_delete,
            supplier_fields_set,
            supplier_fields_get,
            rules_list,
            rule_save,
            rule_delete,
            rule_ran,
            scripts_list,
            script_save,
            script_delete,
            webhooks_list,
            webhook_save,
            webhook_delete,
            webhook_test,
            webhook_retry,
            webhook_fire,
            api_status,
            api_toggle,
            api_key_create,
            api_key_revoke,
            api_endpoint_save,
            api_endpoint_delete,
            api_query_test,
            permissions_get,
            permission_set,
            totp_begin,
            totp_enable,
            totp_disable,
            totp_users,
            ai_forecast,
            ai_reorder,
            ai_insights,
            ai_llm,
            ai_models,
            fibu_export,
            fibu_preview,
            terminal_pay,
            terminal_admin,
            pick_folder,
            open_folder,
            set_fullscreen,
            set_zoom,
            catalog_list,
            catalog_seed,
            article_save,
            article_delete,
            stock_book,
            stock_moves,
            beleg_peek,
            sale_commit,
            sales_list,
            sale_get,
            return_commit,
            stats,
            customer_list,
            customer_seed,
            customer_save,
            customer_delete,
            customer_detail,
            customer_points,
            users_list,
            users_default_pins,
            user_verify,
            user_save,
            user_delete,
            voucher_get,
            voucher_list,
            cash_status,
            cash_move,
            closing_create,
            closings_list,
            rksv_status,
            rksv_init,
            rksv_null,
            dep_export,
            qr_svg,
            save_text,
            open_text,
            printer_print,
            printer_list,
            suppliers_list,
            supplier_save,
            po_list,
            po_lines,
            po_save,
            po_status,
            po_receive,
            po_suggest,
            updates::update_check,
            updates::update_install
        ])
        .run(tauri::generate_context!())
        .expect("Kontor konnte nicht gestartet werden");
}
