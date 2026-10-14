//! Eigenes Installer-Fenster für Updates (Windows).
//!
//! Unter Windows kann das Programm sich nicht selbst ersetzen, solange es läuft: der Installer muss es beenden. Damit die
//! Animation trotzdem ohne Bruch weiterläuft, übergibt das Programm nach dem (signaturgeprüften) Download an eine Kopie seiner
//! selbst („KontorUpdater.exe“ im Temp-Ordner), die genau das Fenster des Programms übernimmt, den Installer unsichtbar ausführt,
//! das aktualisierte Programm startet und sich dann schließt. Die Kopie öffnet weder die Datenbank noch sonst etwas vom Programm –
//! nur dieses eine Fenster mit der Installer-Ansicht (`window.__KONTOR_UPDATER__`).
//!
//! Ablauf: `handover` (im alten Programm) → `run` (Hilfsprozess) → Installer `/S /UPDATE` → neues Programm → `ready` → Fenster zu.
//! Scheitert eine Stelle vor der Übergabe, installiert das Programm wie bisher selbst; scheitert der Installer, startet der Hilfsprozess
//! die bisherige Version wieder und zeigt den Fehler an.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, State};

/// Aufrufmarke des Hilfsprozesses: `kontor --kontor-updater <Ordner>`
pub const FLAG: &str = "--kontor-updater";
const DIR_NAME: &str = "kontor-update";
/// Längste Wartezeit auf das Beenden des alten Programms / auf den Installer / auf den Start des neuen Programms
const WAIT_EXIT: Duration = Duration::from_secs(40);
const WAIT_INSTALL: Duration = Duration::from_secs(600);
const WAIT_START: Duration = Duration::from_secs(30);

#[derive(Serialize, Deserialize, Clone, Default)]
struct Info {
    setup: String,
    sha: String,
    app: String,
    from: String,
    to: String,
    notes: String,
    /// x, y, Breite, Höhe des bisherigen Hauptfensters in Bildschirmpixeln (leer = maximiert öffnen)
    rect: Vec<i64>,
}

#[derive(Serialize, Clone, Default)]
pub struct HState {
    phase: String,
    from: String,
    to: String,
    notes: String,
    error: String,
    ms: u64,
}

struct Shared {
    st: Mutex<HState>,
    t0: Instant,
    dir: PathBuf,
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn temp_dir() -> PathBuf {
    std::env::temp_dir().join(DIR_NAME)
}

/// Ordner aus der Kommandozeile – nur wenn der Hilfsprozess gemeint ist
pub fn argument() -> Option<PathBuf> {
    let mut a = std::env::args().skip(1);
    if a.next().as_deref() != Some(FLAG) {
        return None;
    }
    a.next().map(PathBuf::from)
}

/// Der Ordner muss der Update-Ordner des Benutzers sein (Entwicklungs-Builds dürfen abweichen, damit sich der Ablauf testen lässt)
fn dir_ok(dir: &Path) -> bool {
    cfg!(debug_assertions) || dir == temp_dir()
}

fn log(dir: &Path, msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("updater.log")) {
        let _ = writeln!(f, "{} {msg}", chrono::Local::now().format("%H:%M:%S%.3f"));
    }
}

// ───────────────────────── altes Programm: Übergabe ─────────────────────────

/// Legt Installer und Kopie des Programms ab, startet das Hilfsfenster und wartet, bis es steht.
/// Danach beendet sich der Aufrufer (Fenster verstecken, `app.exit`). Bei `Err` ist nichts übergeben worden.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn handover(app: &tauri::AppHandle, bytes: &[u8], from: &str, to: &str, notes: &str) -> Result<(), String> {
    let e = |x: std::io::Error| x.to_string();

    let dir = temp_dir();
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(e)?;
    let exe = std::env::current_exe().map_err(e)?;
    let setup = dir.join(format!("Kontor-{to}-setup.exe"));
    std::fs::write(&setup, bytes).map_err(e)?;
    let helper = dir.join("KontorUpdater.exe");
    std::fs::copy(&exe, &helper).map_err(e)?;

    let rect = app
        .get_webview_window("main")
        .filter(|w| !w.is_minimized().unwrap_or(true))
        .and_then(|w| Some((w.outer_position().ok()?, w.outer_size().ok()?)))
        .filter(|(p, s)| s.width > 200 && s.height > 200 && p.x > -10000 && p.y > -10000)
        .map(|(p, s)| vec![p.x as i64, p.y as i64, s.width as i64, s.height as i64])
        .unwrap_or_default();
    let info = Info { setup: setup.to_string_lossy().into(), sha: hex(&Sha256::digest(bytes)), app: exe.to_string_lossy().into(), from: from.into(), to: to.into(), notes: notes.into(), rect };
    std::fs::write(dir.join("info.json"), serde_json::to_vec(&info).map_err(|x| x.to_string())?).map_err(e)?;

    // Sperrdatei: solange dieses Programm läuft, bleibt sie belegt – der Hilfsprozess wartet damit auf unser Ende
    let mut lock = std::fs::OpenOptions::new();
    lock.write(true).create(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        lock.share_mode(0);
    }
    std::mem::forget(lock.open(dir.join("app.lock")).map_err(e)?);

    let mut cmd = Command::new(&helper);
    cmd.arg(FLAG).arg(&dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0000_0008 | 0x0000_0200); // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    }
    let mut child = cmd.spawn().map_err(|x| format!("Hilfsfenster nicht gestartet: {x}"))?;
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(12) {
        if dir.join("ready").exists() {
            return Ok(());
        }
        if let Ok(Some(s)) = child.try_wait() {
            return Err(format!("Hilfsfenster vorzeitig beendet ({s})"));
        }
        std::thread::sleep(Duration::from_millis(80));
    }
    let _ = child.kill();
    Err("Hilfsfenster wurde nicht rechtzeitig bereit".into())
}

/// Das neu gestartete Programm meldet sich: der Hilfsprozess darf sein Fenster schließen. Räumt den Ordner später auf.
pub fn started() {
    let dir = temp_dir();
    if !dir.join("info.json").exists() {
        return;
    }
    let _ = std::fs::write(dir.join("started"), b"1");
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(45));
        let _ = std::fs::remove_dir_all(&dir);
    });
}

// ───────────────────────── Hilfsprozess ─────────────────────────

fn set(sh: &Shared, phase: &str, error: &str) {
    let mut s = sh.st.lock().unwrap();
    s.phase = phase.into();
    s.error = error.into();
    log(&sh.dir, &format!("phase {phase} {error}"));
}

#[tauri::command]
fn helper_state(sh: State<'_, Arc<Shared>>) -> HState {
    let mut s = sh.st.lock().unwrap().clone();
    s.ms = sh.t0.elapsed().as_millis() as u64;
    s
}

/// Die Oberfläche steht → Fenster an die Stelle des bisherigen Programms setzen und zeigen; meldet dem alten Programm „bereit“
#[tauri::command]
fn helper_ready(app: tauri::AppHandle, sh: State<'_, Arc<Shared>>) {
    if let Some(w) = app.get_webview_window("updater") {
        let rect: Vec<i64> = std::fs::read(sh.dir.join("info.json")).ok().and_then(|b| serde_json::from_slice::<Info>(&b).ok()).map(|i| i.rect).unwrap_or_default();
        if rect.len() == 4 {
            let _ = w.set_position(tauri::PhysicalPosition::new(rect[0] as i32, rect[1] as i32));
            let _ = w.set_size(tauri::PhysicalSize::new(rect[2] as u32, rect[3] as u32));
        } else {
            let _ = w.maximize();
        }
        let _ = w.show();
        let _ = w.set_focus();
    }
    let _ = std::fs::write(sh.dir.join("ready"), b"1");
    log(&sh.dir, "ready");
}

fn spawn_app(path: &str) -> std::io::Result<std::process::Child> {
    let mut c = Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0000_0008 | 0x0000_0200);
    }
    c.spawn()
}

/// Wartet, bis das alte Programm beendet ist (Sperrdatei frei)
fn wait_old_app(dir: &Path) {
    let lock = dir.join("app.lock");
    if !lock.exists() {
        return;
    }
    let t0 = Instant::now();
    while t0.elapsed() < WAIT_EXIT {
        #[cfg(windows)]
        let free = {
            use std::os::windows::fs::OpenOptionsExt;
            std::fs::OpenOptions::new().write(true).share_mode(0).open(&lock).is_ok()
        };
        #[cfg(not(windows))]
        let free = true;
        if free {
            return;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

fn worker(app: tauri::AppHandle, sh: Arc<Shared>, info: Info) {
    let dir = sh.dir.clone();
    let min_show = |t: Instant, ms: u64| {
        let need = Duration::from_millis(ms);
        if t.elapsed() < need {
            std::thread::sleep(need - t.elapsed());
        }
    };
    // Die Oberfläche braucht einen Moment, bis sie sich meldet – der Installer startet erst danach (die Animation läuft dann von Anfang an)
    let t = Instant::now();
    while !dir.join("ready").exists() && t.elapsed() < Duration::from_secs(20) {
        std::thread::sleep(Duration::from_millis(50));
    }
    set(&sh, "install", "");
    wait_old_app(&dir);
    let started = Instant::now();

    let result: Result<(), String> = (|| {
        let bytes = std::fs::read(&info.setup).map_err(|e| format!("Installer nicht lesbar: {e}"))?;
        if hex(&Sha256::digest(&bytes)) != info.sha {
            return Err("Installer wurde verändert – Installation abgebrochen".into());
        }
        let mut cmd = Command::new(&info.setup);
        cmd.args(["/S", "/UPDATE"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let mut child = cmd.spawn().map_err(|e| format!("Installer konnte nicht gestartet werden: {e}"))?;
        let t0 = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(s)) if s.success() => return Ok(()),
                Ok(Some(s)) => return Err(format!("Der Installer meldet einen Fehler ({s})")),
                Ok(None) if t0.elapsed() > WAIT_INSTALL => {
                    let _ = child.kill();
                    return Err("Die Installation dauert ungewöhnlich lange und wurde abgebrochen".into());
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(200)),
                Err(e) => return Err(e.to_string()),
            }
        }
    })();

    match result {
        Ok(()) => {
            min_show(started, 3200);
            let _ = std::fs::remove_file(&info.setup);
            set(&sh, "restart", "");
            match spawn_app(&info.app) {
                Ok(_) => {
                    let t = Instant::now();
                    while !dir.join("started").exists() && t.elapsed() < WAIT_START {
                        std::thread::sleep(Duration::from_millis(150));
                    }
                    set(&sh, "close", "");
                    std::thread::sleep(Duration::from_millis(1800));
                }
                Err(e) => {
                    set(&sh, "error", &format!("Kontor wurde installiert, konnte aber nicht automatisch gestartet werden ({e}). Bitte Kontor über das Startmenü öffnen."));
                    std::thread::sleep(Duration::from_secs(12));
                }
            }
        }
        Err(msg) => {
            min_show(started, 1500);
            set(&sh, "error", &msg);
            std::thread::sleep(Duration::from_secs(9));
            let _ = spawn_app(&info.app);
            std::thread::sleep(Duration::from_millis(1200));
        }
    }
    app.exit(0);
}

/// Einstieg des Hilfsprozesses (aus `main`, mit dem Kontext des Programms)
pub fn run(dir: PathBuf, mut context: tauri::Context) {
    if !dir_ok(&dir) {
        return;
    }
    let info: Info = match std::fs::read(dir.join("info.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()) {
        Some(i) => i,
        None => return,
    };
    // Das Hauptfenster aus der Konfiguration wird hier nicht gebraucht
    context.config_mut().app.windows.clear();
    let sh = Arc::new(Shared {
        st: Mutex::new(HState { phase: "start".into(), from: info.from.clone(), to: info.to.clone(), notes: info.notes.clone(), error: String::new(), ms: 0 }),
        t0: Instant::now(),
        dir: dir.clone(),
    });
    let sh2 = sh.clone();
    let res = tauri::Builder::default()
        .manage(sh)
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(app, "updater", tauri::WebviewUrl::App("index.html".into()))
                .title("Kontor – Update")
                .initialization_script("window.__KONTOR_UPDATER__ = true;")
                .decorations(false)
                .resizable(false)
                .always_on_top(true)
                .visible(false)
                .inner_size(960.0, 640.0)
                .center()
                .background_color(tauri::window::Color(6, 8, 15, 255))
                .data_directory(sh2.dir.join("webview"))
                .build()?;
            let handle = app.handle().clone();
            let (sh3, info) = (sh2.clone(), info.clone());
            std::thread::spawn(move || worker(handle, sh3, info));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![helper_state, helper_ready])
        .run(context);
    if let Err(e) = res {
        log(&dir, &format!("Fenster-Fehler: {e}"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_ist_klein_und_zweistellig() {
        assert_eq!(hex(&[0, 15, 255]), "000fff");
    }

    #[test]
    fn info_rundreise_und_unvollstaendig() {
        let i = Info { setup: "a".into(), sha: "b".into(), app: "c".into(), from: "1".into(), to: "2".into(), notes: "n".into(), rect: vec![1, 2, 3, 4] };
        let j: Info = serde_json::from_slice(&serde_json::to_vec(&i).unwrap()).unwrap();
        assert_eq!((j.setup, j.rect), ("a".to_string(), vec![1, 2, 3, 4]));
        assert!(serde_json::from_str::<Info>("{\"setup\":\"x\"}").is_err());
    }

    #[test]
    fn nur_der_update_ordner_ist_erlaubt() {
        assert!(dir_ok(&temp_dir()));
        assert_eq!(dir_ok(Path::new("/irgendwo")), cfg!(debug_assertions));
    }

    #[test]
    fn started_ohne_ordner_tut_nichts() {
        let _ = std::fs::remove_dir_all(temp_dir());
        started();
        assert!(!temp_dir().join("started").exists());
    }
}
