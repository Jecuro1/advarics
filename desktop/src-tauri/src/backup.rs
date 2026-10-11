//! Datensicherung: konsistente Sicherung über die SQLite-Backup-API (auch im laufenden Betrieb),
//! Prüfsumme (SHA-256) + Integritätsprüfung, Aufbewahrung, geführte Wiederherstellung.
//! Verantwortung für das Sichern liegt beim Betreiber – Kontor stellt die Werkzeuge.

use crate::db;
use rusqlite::{backup::Backup, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const EXT: &str = "kontor-backup";

#[derive(Serialize, Deserialize, Clone)]
pub struct Manifest {
    pub created: String,
    pub app_version: String,
    pub schema: i64,
    pub bytes: u64,
    pub sha256: String,
    pub kind: String,
}

#[derive(Serialize)]
pub struct Entry {
    pub file: String,
    pub path: String,
    pub manifest: Option<Manifest>,
}

#[derive(Serialize)]
pub struct Check {
    pub ok: bool,
    pub hash_ok: bool,
    pub integrity: String,
    pub schema: i64,
    pub message: String,
}

fn manifest_path(p: &Path) -> PathBuf {
    let mut s = p.as_os_str().to_owned();
    s.push(".json");
    PathBuf::from(s)
}

pub fn sha256_file(p: &Path) -> std::io::Result<String> {
    let mut f = fs::File::open(p)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

fn integrity(c: &Connection) -> rusqlite::Result<String> {
    c.query_row("PRAGMA integrity_check", [], |r| r.get(0))
}

/// Sicherung erstellen. `kind`: "manuell", "automatisch", "vor-wiederherstellung".
pub fn create(src: &Connection, dir: &Path, kind: &str, app_version: &str) -> Result<Entry, String> {
    fs::create_dir_all(dir).map_err(|e| format!("Zielordner nicht verfügbar: {e}"))?;
    let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let name = format!("kontor_{stamp}_{kind}.{EXT}");
    let final_path = dir.join(&name);
    let tmp = dir.join(format!("{name}.tmp"));
    let _ = fs::remove_file(&tmp);
    {
        let mut dst = Connection::open(&tmp).map_err(|e| e.to_string())?;
        {
            let b = Backup::new(src, &mut dst).map_err(|e| e.to_string())?;
            b.run_to_completion(512, Duration::from_millis(2), None).map_err(|e| e.to_string())?;
        }
        dst.pragma_update(None, "journal_mode", "DELETE").map_err(|e| e.to_string())?;
        let ic = integrity(&dst).map_err(|e| e.to_string())?;
        if ic != "ok" {
            let _ = fs::remove_file(&tmp);
            return Err(format!("Integritätsprüfung der Sicherung fehlgeschlagen: {ic}"));
        }
    }
    fs::rename(&tmp, &final_path).map_err(|e| e.to_string())?;
    let bytes = fs::metadata(&final_path).map(|m| m.len()).unwrap_or(0);
    let sha = sha256_file(&final_path).map_err(|e| e.to_string())?;
    let manifest = Manifest {
        created: db::now(),
        app_version: app_version.to_string(),
        schema: db::schema_version(),
        bytes,
        sha256: sha,
        kind: kind.to_string(),
    };
    fs::write(manifest_path(&final_path), serde_json::to_vec_pretty(&manifest).unwrap())
        .map_err(|e| e.to_string())?;
    Ok(Entry { file: name, path: final_path.display().to_string(), manifest: Some(manifest) })
}

pub fn list(dir: &Path) -> Vec<Entry> {
    let mut out: Vec<Entry> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == EXT).unwrap_or(false))
        .map(|p| {
            let manifest = fs::read(manifest_path(&p)).ok().and_then(|b| serde_json::from_slice(&b).ok());
            Entry { file: p.file_name().unwrap().to_string_lossy().into_owned(), path: p.display().to_string(), manifest }
        })
        .collect();
    out.sort_by(|a, b| b.file.cmp(&a.file));
    out
}

pub fn verify(p: &Path) -> Check {
    let manifest: Option<Manifest> = fs::read(manifest_path(p)).ok().and_then(|b| serde_json::from_slice(&b).ok());
    let hash = sha256_file(p).unwrap_or_default();
    let hash_ok = manifest.as_ref().map(|m| m.sha256 == hash).unwrap_or(false);
    let (integrity, schema) = match Connection::open_with_flags(p, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(c) => (
            integrity(&c).unwrap_or_else(|e| e.to_string()),
            c.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap_or(0),
        ),
        Err(e) => (e.to_string(), 0),
    };
    let newer = schema > db::schema_version();
    let ok = hash_ok && integrity == "ok" && !newer;
    let message = if ok {
        "Sicherung vollständig und lesbar".into()
    } else if !hash_ok {
        "Prüfsumme stimmt nicht – Datei verändert oder unvollständig".into()
    } else if newer {
        "Sicherung stammt aus einer neueren Kontor-Version".into()
    } else {
        format!("Datenbank beschädigt: {integrity}")
    };
    Check { ok, hash_ok, integrity, schema, message }
}

/// Wiederherstellen in die laufende Datenbank (vorher geprüft, vorher Sicherheitskopie durch Aufrufer).
pub fn restore_into(live: &mut Connection, p: &Path) -> Result<(), String> {
    let src = Connection::open_with_flags(p, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())?;
    {
        let b = Backup::new(&src, live).map_err(|e| e.to_string())?;
        b.run_to_completion(512, Duration::from_millis(2), None).map_err(|e| e.to_string())?;
    }
    live.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
    db::migrate(live).map_err(|e| e.to_string())?;
    Ok(())
}

/// Ältere Sicherungen über `keep` hinaus löschen (nur automatische).
pub fn prune(dir: &Path, keep: usize) -> usize {
    let autos: Vec<Entry> = list(dir).into_iter().filter(|e| e.file.contains("_automatisch.")).collect();
    let mut removed = 0;
    for e in autos.into_iter().skip(keep) {
        let p = PathBuf::from(&e.path);
        if fs::remove_file(&p).is_ok() {
            let _ = fs::remove_file(manifest_path(&p));
            removed += 1;
        }
    }
    removed
}
