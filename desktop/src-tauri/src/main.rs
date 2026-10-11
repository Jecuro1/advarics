// Kontor – Desktop-Client (Windows).
// Ohne Konsolenfenster im Release-Build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup;
mod catalog;
mod customers;
mod db;
mod sales;
mod updates;

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
        backup::create(&c, &dir, &kind, &version(&app))
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
async fn backup_verify(path: String) -> backup::Check {
    backup::verify(&PathBuf::from(path))
}

#[tauri::command]
async fn backup_restore(app: AppHandle, path: String) -> Res<Value> {
    let db = app.state::<db::Db>();
    let p = PathBuf::from(&path);
    let check = backup::verify(&p);
    if !check.ok {
        return Err(format!("Wiederherstellung abgebrochen: {}", check.message));
    }
    // Sicherheitskopie des aktuellen Stands – Rückweg bleibt immer offen.
    // Zielordner VOR dem Sperren der Datenbank ermitteln (backup_dir liest selbst aus der DB).
    let dir = backup_dir(&app, &db);
    let safety = {
        let c = db.conn.lock().unwrap();
        backup::create(&c, &dir, "vor-wiederherstellung", &version(&app))
    };
    log_backup(&db, "vor-wiederherstellung", &safety);
    let safety = safety?;
    {
        let mut c = db.conn.lock().unwrap();
        backup::restore_into(&mut c, &p)?;
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
            updates::update_check,
            updates::update_install
        ])
        .run(tauri::generate_context!())
        .expect("Kontor konnte nicht gestartet werden");
}
