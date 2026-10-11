// Kontor – Desktop-Client (Windows).
// Ohne Konsolenfenster im Release-Build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
struct AppInfo {
    version: String,
    os: String,
    data_dir: String,
}

/// Version und lokales Datenverzeichnis – Grundlage für Datenbank, Belege und Backups.
#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    let data_dir = app
        .path()
        .app_data_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
        data_dir,
    }
}

/// Vollbild / Kassen-Kiosk ein- oder ausschalten.
#[tauri::command]
fn set_fullscreen(window: tauri::WebviewWindow, on: bool) -> Result<bool, String> {
    window.set_fullscreen(on).map_err(|e| e.to_string())?;
    Ok(on)
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
        .invoke_handler(tauri::generate_handler![app_info, set_fullscreen])
        .setup(|app| {
            // Datenverzeichnis früh anlegen (später: lokale Datenbank, Offline-Warteschlange).
            if let Ok(dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(dir);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Kontor konnte nicht gestartet werden");
}
