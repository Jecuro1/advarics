// Kontor – Desktop-Client (Windows).
// Ohne Konsolenfenster im Release-Build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup;
mod catalog;
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

use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
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
    db::audit_append(&db.conn.lock().unwrap(), &event, &payload).map_err(err)
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
    catalog::save(&tx, &article)?;
    db::audit_append(&tx, "catalog.article.saved", &json!({ "artikel": article.id, "name": article.name, "varianten": article.variants.len(), "benutzer": user })).map_err(err)?;
    tx.commit().map_err(err)?;
    catalog::list(&c).map_err(err)
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
fn user_verify(db: State<db::Db>, id: String, pin: String, purpose: Option<String>) -> Res<users::User> {
    let c = db.conn.lock().unwrap();
    let r = users::verify(&c, &id, &pin);
    let _ = db::audit_append(&c, if r.is_ok() { "auth.pin.ok" } else { "auth.pin.failed" }, &json!({ "benutzer": id, "zweck": purpose }));
    let u = r?;
    if purpose.as_deref() == Some("freigabe") && !users::can_approve(&u.role) {
        return Err(format!("{} darf keine Freigaben erteilen", u.name));
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
fn voucher_get(db: State<db::Db>, code: String) -> Res<Value> {
    vouchers::get(&db.conn.lock().unwrap(), &code)
}

#[tauri::command]
fn voucher_list(db: State<db::Db>) -> Res<Vec<Value>> {
    vouchers::list(&db.conn.lock().unwrap(), 500).map_err(err)
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
    tauri::Builder::default()
        // Nur eine Instanz pro Rechner: ein zweiter Start holt das offene Fenster nach vorne.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updates::Pending::default())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let path = dir.join("kontor.db");
            let conn = db::open(&path).map_err(|e| format!("Datenbank konnte nicht geöffnet werden: {e}"))?;
            let _ = db::audit_append(&conn, "system.started", &json!({ "version": app.package_info().version.to_string() }));
            users::seed(&conn).map_err(|e| format!("Benutzer: {e}"))?;
            if db::count(&conn, "articles") > 0 {
                purchasing::supplier_seed(&conn).map_err(|e| format!("Lieferanten: {e}"))?;
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
