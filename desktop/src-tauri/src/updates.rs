//! Update-Dienst: signierte Pakete von GitHub Releases. Nichts wird ohne Freigabe installiert.
//! Ablauf: suchen → anzeigen (Version, Hinweise) → Freigabe → Sicherung → Download (Fortschritt) → Installation → Neustart.

use crate::{backup, db};
use serde::Serialize;
use serde_json::json;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct Pending(pub Mutex<Option<Update>>);

#[derive(Serialize)]
pub struct Info {
    pub available: bool,
    pub current: String,
    pub version: Option<String>,
    pub date: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Info, String> {
    let current = app.package_info().version.to_string();
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| format!("Update-Server nicht erreichbar: {e}"))?;
    let info = match &update {
        Some(u) => Info { available: true, current, version: Some(u.version.clone()), date: u.date.map(|d| d.to_string()), notes: u.body.clone() },
        None => Info { available: false, current, version: None, date: None, notes: None },
    };
    *app.state::<Pending>().0.lock().unwrap() = update;
    Ok(info)
}

#[derive(Clone, Serialize)]
struct Progress {
    phase: &'static str,
    done: u64,
    total: Option<u64>,
}

/// Installiert das zuvor gefundene Update. Vorher automatische Datensicherung.
#[tauri::command]
pub async fn update_install(app: AppHandle, user: Option<String>) -> Result<(), String> {
    let update = app
        .state::<Pending>()
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or("Kein Update vorbereitet – bitte erneut suchen")?;
    let version = update.version.clone();

    // 1 · Sicherung vor dem Update
    let _ = app.emit("update-progress", Progress { phase: "backup", done: 0, total: None });
    {
        let dbs = app.state::<db::Db>();
        let dir = crate::backup_dir(&app, &dbs);
        let res = {
            let c = dbs.conn.lock().unwrap();
            backup::create(&c, &dir, "vor-update", &app.package_info().version.to_string())
        };
        crate::log_backup(&dbs, "vor-update", &res);
        res.map_err(|e| format!("Sicherung vor dem Update fehlgeschlagen – Update abgebrochen: {e}"))?;
        let c = dbs.conn.lock().unwrap();
        let _ = db::audit_append(&c, "update.install.started", &json!({ "version": version, "freigabe": user }));
    }

    // 2 · Download + Signaturprüfung + Installation
    let mut done: u64 = 0;
    let app2 = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                done += chunk as u64;
                let _ = app2.emit("update-progress", Progress { phase: "download", done, total });
            },
            {
                let app3 = app.clone();
                move || {
                    let _ = app3.emit("update-progress", Progress { phase: "install", done: 0, total: None });
                }
            },
        )
        .await
        .map_err(|e| format!("Update fehlgeschlagen: {e}"))?;

    // 3 · Neustart (unter Windows beendet der Installer das Programm bereits selbst)
    app.restart();
}
