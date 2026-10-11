//! Datensicherung: konsistente Sicherung über die SQLite-Backup-API (auch im laufenden Betrieb),
//! samt Artikelbildern und Logo, optional verschlüsselt (AES-256-GCM, Schlüssel per PBKDF2 aus dem
//! Sicherungspasswort). Prüfsumme (SHA-256) + Integritätsprüfung, Aufbewahrung, geführte Wiederherstellung.
//! Verantwortung für das Sichern liegt beim Betreiber – Kontor stellt die Werkzeuge.
//!
//! Dateiformat 2: "KONTORBK2\n" · u32 Kopflänge · Kopf (JSON) · Inhalt (ggf. verschlüsselt).
//! Inhalt = Folge von Einträgen [u16 Namenslänge, Name, u64 Länge, Daten]: "kontor.db", "bilder/…".
//! Format 1 (reine SQLite-Datei, bis 0.7) wird weiterhin gelesen.

use crate::db;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use rand_core::{OsRng, RngCore};
use rusqlite::{backup::Backup, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const EXT: &str = "kontor-backup";
const MAGIC: &[u8] = b"KONTORBK2\n";
const ITER: u32 = 200_000;

#[derive(Serialize, Deserialize, Clone)]
pub struct Manifest {
    pub created: String,
    pub app_version: String,
    pub schema: i64,
    pub bytes: u64,
    pub sha256: String,
    pub kind: String,
    #[serde(default)]
    pub encrypted: bool,
    #[serde(default)]
    pub images: usize,
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
    #[serde(default)]
    pub needs_password: bool,
}

#[derive(Serialize, Deserialize)]
struct Header {
    format: u32,
    encrypted: bool,
    #[serde(default)]
    salt: String,
    #[serde(default)]
    nonce: String,
    #[serde(default)]
    iterations: u32,
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

fn key(password: &str, salt: &[u8], iter: u32) -> [u8; 32] {
    let mut k = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, iter, &mut k);
    k
}

fn pack(entries: &[(String, Vec<u8>)]) -> Vec<u8> {
    let mut out = vec![];
    for (n, d) in entries {
        out.extend((n.len() as u16).to_le_bytes());
        out.extend(n.as_bytes());
        out.extend((d.len() as u64).to_le_bytes());
        out.extend(d);
    }
    out
}

fn unpack(mut b: &[u8]) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut out = vec![];
    while !b.is_empty() {
        if b.len() < 2 {
            return Err("Archiv beschädigt".into());
        }
        let nl = u16::from_le_bytes([b[0], b[1]]) as usize;
        if b.len() < 2 + nl + 8 {
            return Err("Archiv beschädigt".into());
        }
        let name = String::from_utf8(b[2..2 + nl].to_vec()).map_err(|_| "Archiv beschädigt")?;
        let dl = u64::from_le_bytes(b[2 + nl..10 + nl].try_into().unwrap()) as usize;
        if b.len() < 10 + nl + dl {
            return Err("Archiv unvollständig".into());
        }
        out.push((name, b[10 + nl..10 + nl + dl].to_vec()));
        b = &b[10 + nl + dl..];
    }
    Ok(out)
}

/// Konsistente Momentaufnahme der Datenbank als Bytes (über eine Temporärdatei).
fn snapshot(src: &Connection, tmp: &Path) -> Result<Vec<u8>, String> {
    let _ = fs::remove_file(tmp);
    {
        let mut dst = Connection::open(tmp).map_err(|e| e.to_string())?;
        {
            let b = Backup::new(src, &mut dst).map_err(|e| e.to_string())?;
            b.run_to_completion(512, Duration::from_millis(2), None).map_err(|e| e.to_string())?;
        }
        dst.pragma_update(None, "journal_mode", "DELETE").map_err(|e| e.to_string())?;
        let ic = integrity(&dst).map_err(|e| e.to_string())?;
        if ic != "ok" {
            let _ = fs::remove_file(tmp);
            return Err(format!("Integritätsprüfung der Sicherung fehlgeschlagen: {ic}"));
        }
    }
    let bytes = fs::read(tmp).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(tmp);
    Ok(bytes)
}

/// Sicherung erstellen. `kind`: "manuell", "automatisch", "vor-wiederherstellung", "vor-update".
/// `data_dir`: Datenverzeichnis (für Bilder); `password`: verschlüsseln, wenn gesetzt.
pub fn create(src: &Connection, dir: &Path, kind: &str, app_version: &str, data_dir: Option<&Path>, password: Option<&str>) -> Result<Entry, String> {
    fs::create_dir_all(dir).map_err(|e| format!("Zielordner nicht verfügbar: {e}"))?;
    let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let name = format!("kontor_{stamp}_{kind}.{EXT}");
    let final_path = dir.join(&name);
    let tmp = dir.join(format!("{name}.tmp"));
    let mut entries = vec![("kontor.db".to_string(), snapshot(src, &dir.join(format!("{name}.db.tmp")))?)];
    if let Some(d) = data_dir {
        for e in fs::read_dir(crate::images::dir(d)).into_iter().flatten().flatten() {
            if e.path().is_file() {
                if let Ok(b) = fs::read(e.path()) {
                    entries.push((format!("bilder/{}", e.file_name().to_string_lossy()), b));
                }
            }
        }
    }
    let images = entries.len() - 1;
    let plain = pack(&entries);
    let pw = password.filter(|p| !p.is_empty());
    let (header, payload) = match pw {
        Some(pw) => {
            let mut salt = [0u8; 16];
            let mut nonce = [0u8; 12];
            OsRng.fill_bytes(&mut salt);
            OsRng.fill_bytes(&mut nonce);
            let k = key(pw, &salt, ITER);
            let c = Aes256Gcm::new_from_slice(&k).unwrap().encrypt(Nonce::from_slice(&nonce), plain.as_slice()).map_err(|_| "Verschlüsselung fehlgeschlagen")?;
            (Header { format: 2, encrypted: true, salt: STANDARD.encode(salt), nonce: STANDARD.encode(nonce), iterations: ITER }, c)
        }
        None => (Header { format: 2, encrypted: false, salt: String::new(), nonce: String::new(), iterations: 0 }, plain),
    };
    let hj = serde_json::to_vec(&header).unwrap();
    let mut file = MAGIC.to_vec();
    file.extend((hj.len() as u32).to_le_bytes());
    file.extend(hj);
    file.extend(payload);
    fs::write(&tmp, &file).map_err(|e| format!("Schreiben fehlgeschlagen: {e}"))?;
    fs::rename(&tmp, &final_path).map_err(|e| e.to_string())?;
    let sha = sha256_file(&final_path).map_err(|e| e.to_string())?;
    let manifest = Manifest {
        created: db::now(),
        app_version: app_version.to_string(),
        schema: db::schema_version(),
        bytes: file.len() as u64,
        sha256: sha,
        kind: kind.to_string(),
        encrypted: pw.is_some(),
        images,
    };
    fs::write(manifest_path(&final_path), serde_json::to_vec_pretty(&manifest).unwrap()).map_err(|e| e.to_string())?;
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

/// Sicherung öffnen: liefert die Einträge (Format 1: nur die Datenbank).
/// Fehler „PASSWORT“ = verschlüsselt und kein/falsches Passwort.
pub fn open(p: &Path, password: Option<&str>) -> Result<Vec<(String, Vec<u8>)>, String> {
    let b = fs::read(p).map_err(|e| format!("Datei nicht lesbar: {e}"))?;
    if b.starts_with(b"SQLite format 3\0") {
        return Ok(vec![("kontor.db".into(), b)]);
    }
    if !b.starts_with(MAGIC) || b.len() < MAGIC.len() + 4 {
        return Err("Keine Kontor-Sicherung".into());
    }
    let hl = u32::from_le_bytes(b[MAGIC.len()..MAGIC.len() + 4].try_into().unwrap()) as usize;
    let hs = MAGIC.len() + 4;
    let h: Header = serde_json::from_slice(b.get(hs..hs + hl).ok_or("Kopf beschädigt")?).map_err(|_| "Kopf beschädigt")?;
    let payload = &b[hs + hl..];
    if !h.encrypted {
        return unpack(payload);
    }
    let pw = password.filter(|p| !p.is_empty()).ok_or("PASSWORT")?;
    let salt = STANDARD.decode(&h.salt).map_err(|_| "Kopf beschädigt")?;
    let nonce = STANDARD.decode(&h.nonce).map_err(|_| "Kopf beschädigt")?;
    let k = key(pw, &salt, h.iterations);
    let plain = Aes256Gcm::new_from_slice(&k).unwrap().decrypt(Nonce::from_slice(&nonce), payload).map_err(|_| "PASSWORT")?;
    unpack(&plain)
}

fn db_check(bytes: &[u8]) -> (String, i64) {
    let tmp = std::env::temp_dir().join(format!("kontor-verify-{}-{}.db", std::process::id(), OsRng.next_u32()));
    if fs::write(&tmp, bytes).is_err() {
        return ("Temporärdatei nicht schreibbar".into(), 0);
    }
    let r = match Connection::open_with_flags(&tmp, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(c) => (integrity(&c).unwrap_or_else(|e| e.to_string()), c.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap_or(0)),
        Err(e) => (e.to_string(), 0),
    };
    let _ = fs::remove_file(&tmp);
    r
}

pub fn verify(p: &Path, password: Option<&str>) -> Check {
    let manifest: Option<Manifest> = fs::read(manifest_path(p)).ok().and_then(|b| serde_json::from_slice(&b).ok());
    let hash = sha256_file(p).unwrap_or_default();
    let hash_ok = manifest.as_ref().map(|m| m.sha256 == hash).unwrap_or(false);
    let entries = match open(p, password) {
        Ok(e) => e,
        Err(e) if e == "PASSWORT" => {
            return Check { ok: false, hash_ok, integrity: String::new(), schema: 0, needs_password: true, message: "Verschlüsselt – Sicherungspasswort fehlt oder ist falsch".into() }
        }
        Err(e) => return Check { ok: false, hash_ok, integrity: e.clone(), schema: 0, needs_password: false, message: e },
    };
    let Some((_, dbb)) = entries.iter().find(|(n, _)| n == "kontor.db") else {
        return Check { ok: false, hash_ok, integrity: "keine Datenbank".into(), schema: 0, needs_password: false, message: "Sicherung enthält keine Datenbank".into() };
    };
    let (integrity, schema) = db_check(dbb);
    let newer = schema > db::schema_version();
    let ok = hash_ok && integrity == "ok" && !newer;
    let images = entries.len() - 1;
    let message = if ok {
        format!("Sicherung vollständig und lesbar{}", if images > 0 { format!(" · {images} Bilder") } else { String::new() })
    } else if !hash_ok {
        "Prüfsumme stimmt nicht – Datei verändert oder unvollständig".into()
    } else if newer {
        "Sicherung stammt aus einer neueren Kontor-Version".into()
    } else {
        format!("Datenbank beschädigt: {integrity}")
    };
    Check { ok, hash_ok, integrity, schema, message, needs_password: false }
}

/// Wiederherstellen in die laufende Datenbank (vorher geprüft, vorher Sicherheitskopie durch Aufrufer).
/// Bilder der Sicherung ersetzen den Bilderordner.
pub fn restore_into(live: &mut Connection, p: &Path, password: Option<&str>, data_dir: Option<&Path>) -> Result<(), String> {
    let entries = open(p, password).map_err(|e| if e == "PASSWORT" { "Sicherungspasswort fehlt oder ist falsch".to_string() } else { e })?;
    let dbb = entries.iter().find(|(n, _)| n == "kontor.db").map(|(_, b)| b).ok_or("Sicherung enthält keine Datenbank")?;
    let tmp = std::env::temp_dir().join(format!("kontor-restore-{}-{}.db", std::process::id(), OsRng.next_u32()));
    fs::write(&tmp, dbb).map_err(|e| e.to_string())?;
    {
        let src = Connection::open_with_flags(&tmp, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())?;
        let b = Backup::new(&src, live).map_err(|e| e.to_string())?;
        b.run_to_completion(512, Duration::from_millis(2), None).map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_file(&tmp);
    live.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
    db::migrate(live).map_err(|e| e.to_string())?;
    if let Some(d) = data_dir {
        let imgs: Vec<_> = entries.iter().filter(|(n, _)| n.starts_with("bilder/")).collect();
        if !imgs.is_empty() {
            let bd = crate::images::dir(d);
            let _ = fs::create_dir_all(&bd);
            for e in fs::read_dir(&bd).into_iter().flatten().flatten() {
                let _ = fs::remove_file(e.path());
            }
            for (n, b) in imgs {
                let file = &n["bilder/".len()..];
                if !file.contains('/') && !file.contains('\\') && !file.contains("..") {
                    fs::write(bd.join(file), b).map_err(|e| e.to_string())?;
                }
            }
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verschluesselte_sicherung_mit_bildern() {
        let tmp = std::env::temp_dir().join(format!("kontor-bk-{}", std::process::id()));
        let data = tmp.join("data");
        fs::create_dir_all(crate::images::dir(&data)).unwrap();
        fs::write(crate::images::dir(&data).join("A1-1.jpg"), b"BILD").unwrap();
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        db::setting_set(&c, "test", &serde_json::json!("vorher")).unwrap();
        let e = create(&c, &tmp.join("bk"), "manuell", "0.8.0", Some(&data), Some("geheim 123")).unwrap();
        let p = PathBuf::from(&e.path);
        assert!(e.manifest.as_ref().unwrap().encrypted);
        assert_eq!(e.manifest.as_ref().unwrap().images, 1);
        assert!(!fs::read(&p).unwrap().windows(4).any(|w| w == b"BILD"), "Inhalt muss verschlüsselt sein");
        assert!(verify(&p, None).needs_password);
        assert!(!verify(&p, Some("falsch")).ok);
        assert!(verify(&p, Some("geheim 123")).ok);
        // Wiederherstellen ersetzt Daten und Bilder
        let mut live = Connection::open_in_memory().unwrap();
        db::migrate(&live).unwrap();
        db::setting_set(&live, "test", &serde_json::json!("nachher")).unwrap();
        fs::remove_file(crate::images::dir(&data).join("A1-1.jpg")).unwrap();
        assert!(restore_into(&mut live, &p, Some("falsch"), Some(&data)).is_err());
        restore_into(&mut live, &p, Some("geheim 123"), Some(&data)).unwrap();
        assert_eq!(db::setting_get(&live, "test"), Some(serde_json::json!("vorher")));
        assert_eq!(fs::read(crate::images::dir(&data).join("A1-1.jpg")).unwrap(), b"BILD");
        // unverschlüsselt + altes Format 1 lesbar
        let e2 = create(&c, &tmp.join("bk"), "automatisch", "0.8.0", None, None).unwrap();
        assert!(verify(&PathBuf::from(&e2.path), None).ok);
        let v1 = tmp.join("alt.kontor-backup");
        c.execute_batch(&format!("VACUUM INTO '{}'", v1.display())).unwrap();
        assert_eq!(open(&v1, None).unwrap()[0].0, "kontor.db");
        let _ = fs::remove_dir_all(&tmp);
    }
}
