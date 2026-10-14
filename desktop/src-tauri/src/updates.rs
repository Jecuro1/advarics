//! Update-Dienst: signierte Pakete von GitHub Releases. Nichts wird ohne Freigabe installiert.
//! Ablauf: suchen → anzeigen (Version, Hinweise) → Freigabe → Sicherung → Download (Fortschritt) → Signaturprüfung → Installation → Neustart.
//! Die Oberfläche zeigt dazu die Installer-Ansicht (Ereignis `update-progress`). Unter Windows übernimmt nach dem Download ein
//! Hilfsprozess mit demselben Fenster die Installation (siehe `uphelper`), sonst installiert das Programm selbst.

use crate::{backup, db};
use serde::Serialize;
use serde_json::json;
use std::sync::Mutex;
use std::time::{Duration, Instant};
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

/// Stable: neuester regulärer Release. Beta: Feed mit Vorabversionen (enthält auch jede Stable-Version).
const STABLE: &str = "https://github.com/Jecuro1/advarics/releases/latest/download/latest.json";
const BETA: &str = "https://github.com/Jecuro1/advarics/releases/download/beta-feed/latest.json";

#[tauri::command]
pub async fn update_check(app: AppHandle, channel: Option<String>) -> Result<Info, String> {
    let current = app.package_info().version.to_string();
    let url = if channel.as_deref() == Some("beta") { BETA } else { STABLE };
    let update = app
        .updater_builder()
        .endpoints(vec![url::Url::parse(url).map_err(|e| e.to_string())?])
        .map_err(|e| e.to_string())?
        .build()
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

fn emit(app: &AppHandle, phase: &'static str, done: u64, total: Option<u64>) {
    let _ = app.emit("update-progress", Progress { phase, done, total });
}

/// Installiert das zuvor gefundene Update. Vorher automatische Datensicherung.
/// Phasen für die Installer-Ansicht: backup → download (done/total) → verify → install → restart
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
    let notes = update.body.clone().unwrap_or_default();

    // 1 · Sicherung vor dem Update
    emit(&app, "backup", 0, None);
    {
        let dbs = app.state::<db::Db>();
        let dir = crate::backup_dir(&app, &dbs);
        let res = {
            let c = dbs.conn.lock().unwrap();
            backup::create(&c, &dir, "vor-update", &app.package_info().version.to_string(), Some(&crate::data_dir(&dbs)), crate::backup_password(&dbs).as_deref())
        };
        crate::log_backup(&dbs, "vor-update", &res);
        res.map_err(|e| format!("Sicherung vor dem Update fehlgeschlagen – Update abgebrochen: {e}"))?;
        let c = dbs.conn.lock().unwrap();
        let _ = db::audit_append(&c, "update.install.started", &json!({ "version": version, "freigabe": user }));
    }

    // 2 · Download; die Signatur wird unmittelbar nach dem Laden geprüft (schlägt sie fehl, wird nichts installiert)
    let mut done: u64 = 0;
    let mut last: Option<Instant> = None;
    let (app_a, app_b) = (app.clone(), app.clone());
    let mut bytes = update
        .download(
            move |chunk, total| {
                done += chunk as u64;
                // höchstens ~20 Meldungen pro Sekunde – sonst staut sich die Oberfläche bei schnellen Leitungen
                if last.map_or(true, |t| t.elapsed() >= Duration::from_millis(50)) || total == Some(done) {
                    last = Some(Instant::now());
                    emit(&app_a, "download", done, total);
                }
            },
            move || emit(&app_b, "verify", 0, None),
        )
        .await
        .map_err(|e| format!("Update fehlgeschlagen: {e}"))?;

    // 3 · Installation
    emit(&app, "install", 0, None);
    #[cfg(windows)]
    {
        // „MZ“ = Setup-Programm (NSIS). Dann übernimmt der Hilfsprozess mit eigenem Fenster; scheitert die Übergabe, installiert das Programm selbst.
        if bytes.starts_with(b"MZ") {
            let from = app.package_info().version.to_string();
            let shared = std::sync::Arc::new(bytes);
            let res = {
                let (a, b, v, n) = (app.clone(), shared.clone(), version.clone(), notes.clone());
                tauri::async_runtime::spawn_blocking(move || crate::uphelper::handover(&a, &b, &from, &v, &n)).await.map_err(|e| e.to_string())?
            };
            bytes = std::sync::Arc::try_unwrap(shared).unwrap_or_default();
            match res {
                Ok(()) => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.hide();
                    }
                    if let Ok(c) = app.state::<db::Db>().conn.lock() {
                        let _ = db::audit_append(&c, "update.install.handover", &json!({ "version": version }));
                    }
                    app.exit(0);
                    return Ok(());
                }
                Err(e) => {
                    if let Ok(c) = app.state::<db::Db>().conn.lock() {
                        let _ = db::audit_append(&c, "update.install.handover.failed", &json!({ "version": version, "fehler": e }));
                    }
                }
            }
        }
    }
    #[cfg(not(windows))]
    let _ = (&notes, &mut bytes);
    update.install(&bytes).map_err(|e| format!("Update fehlgeschlagen: {e}"))?;

    // 4 · Neustart (unter Windows beendet der Installer das Programm bereits selbst)
    emit(&app, "restart", 0, None);
    pause().await;
    app.restart();
}

/// Kurze Pause, damit die Installer-Ansicht den Schritt „Neustart“ noch zeigt
async fn pause() {
    tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(1400))).await.ok();
}

/// Das (neu gestartete) Programm ist oben: ein eventuell wartendes Installer-Fenster darf sich schließen.
/// Das Protokoll des Hilfsprozesses kommt ins Audit-Log (sonst ginge die Ursache eines Problems verloren).
#[tauri::command]
pub fn update_ready(app: AppHandle) {
    if let Some(log) = crate::uphelper::started() {
        if let Ok(c) = app.state::<db::Db>().conn.lock() {
            let _ = db::audit_append(&c, "update.installer.protokoll", &json!({ "protokoll": log }));
        }
    }
}
