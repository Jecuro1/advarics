//! Kunden-Kommunikation: WhatsApp (Business Cloud API) und SMS (HTTP-Gateway), Protokoll aller
//! Nachrichten sowie Dateiaustausch für EDI (EDIFACT-Dateien in fest eingestellten Ordnern).

use crate::db;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

fn setting_str(c: &Connection, key: &str) -> String {
    db::setting_get(c, key).and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default()
}

/// Telefonnummer in internationales Format ohne „+“ (für WhatsApp/SMS-Gateways)
pub fn norm_phone(p: &str, cc: &str) -> String {
    let d: String = p.chars().filter(|c| c.is_ascii_digit() || *c == '+').collect();
    if let Some(x) = d.strip_prefix('+') {
        x.to_string()
    } else if let Some(x) = d.strip_prefix("00") {
        x.to_string()
    } else if let Some(x) = d.strip_prefix('0') {
        format!("{cc}{x}")
    } else {
        d
    }
}

pub fn log(c: &Connection, kanal: &str, an: &str, kunde: Option<i64>, text: &str, status: &str, info: &str, user: Option<&str>) -> Result<i64, String> {
    c.execute(
        "INSERT INTO nachrichten(ts, kanal, an, kunde, text, status, info, user) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![db::now(), kanal, an, kunde, text, status, info, user],
    )
    .map_err(|e| e.to_string())?;
    Ok(c.last_insert_rowid())
}

pub fn list(c: &Connection, kanal: Option<&str>, limit: i64) -> Result<Vec<Value>, String> {
    let mut st = c
        .prepare("SELECT id, ts, kanal, an, kunde, text, status, info, user FROM nachrichten WHERE (?1 IS NULL OR kanal = ?1) ORDER BY id DESC LIMIT ?2")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map(params![kanal, limit], |r| {
            Ok(json!({ "id": r.get::<_, i64>(0)?, "ts": r.get::<_, String>(1)?, "kanal": r.get::<_, String>(2)?, "an": r.get::<_, String>(3)?,
                "kunde": r.get::<_, Option<i64>>(4)?, "text": r.get::<_, String>(5)?, "status": r.get::<_, String>(6)?, "info": r.get::<_, String>(7)?, "user": r.get::<_, Option<String>>(8)? }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub struct Cfg {
    pub kanal: String,
    pub cc: String,
    pub wa_token: String,
    pub wa_phone_id: String,
    pub wa_api: String,
    pub sms_url: String,
    pub sms_token: String,
    pub sms_from: String,
}

pub fn cfg(c: &Connection, kanal: &str) -> Cfg {
    let cc = setting_str(c, "nachricht.landesvorwahl");
    Cfg {
        kanal: kanal.to_string(),
        cc: if cc.is_empty() { "43".into() } else { cc.trim_start_matches('+').to_string() },
        wa_token: setting_str(c, "whatsapp.token"),
        wa_phone_id: setting_str(c, "whatsapp.phone_id"),
        wa_api: {
            let a = setting_str(c, "whatsapp.api");
            if a.is_empty() { "https://graph.facebook.com/v21.0".into() } else { a.trim_end_matches('/').to_string() }
        },
        sms_url: setting_str(c, "sms.url"),
        sms_token: setting_str(c, "sms.token"),
        sms_from: setting_str(c, "sms.absender"),
    }
}

/// Versendet eine Nachricht – ohne Datenbanksperre (Netzwerk). Ergebnis: (Status, Info)
pub fn send(cfg: &Cfg, to: &str, text: &str, template: Option<&Value>) -> (String, String) {
    let to = norm_phone(to, &cfg.cc);
    if to.len() < 7 {
        return ("fehler".into(), "Telefonnummer ungültig".into());
    }
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).build();
    let res = match cfg.kanal.as_str() {
        "whatsapp" => {
            if cfg.wa_token.is_empty() || cfg.wa_phone_id.is_empty() {
                return ("vorbereitet".into(), format!("https://wa.me/{to}?text={}", url::form_urlencoded::byte_serialize(text.as_bytes()).collect::<String>()));
            }
            let body = match template {
                Some(t) if t["name"].as_str().is_some_and(|n| !n.is_empty()) => json!({ "messaging_product": "whatsapp", "to": to, "type": "template",
                    "template": { "name": t["name"], "language": { "code": t["sprache"].as_str().unwrap_or("de") },
                        "components": [{ "type": "body", "parameters": t["parameter"].as_array().cloned().unwrap_or_default().into_iter().map(|p| json!({ "type": "text", "text": p })).collect::<Vec<_>>() }] } }),
                _ => json!({ "messaging_product": "whatsapp", "to": to, "type": "text", "text": { "body": text } }),
            };
            agent.post(&format!("{}/{}/messages", cfg.wa_api, cfg.wa_phone_id)).set("Authorization", &format!("Bearer {}", cfg.wa_token)).send_json(body)
        }
        _ => {
            if cfg.sms_url.is_empty() {
                return ("fehler".into(), "Kein SMS-Gateway eingestellt (Einstellungen › SMS)".into());
            }
            let mut r = agent.post(&cfg.sms_url);
            if !cfg.sms_token.is_empty() {
                r = r.set("Authorization", &format!("Bearer {}", cfg.sms_token));
            }
            r.send_json(json!({ "to": format!("+{to}"), "from": cfg.sms_from, "text": text, "message": text }))
        }
    };
    match res {
        Ok(r) => {
            let v: Value = r.into_json().unwrap_or(Value::Null);
            let id = v["messages"][0]["id"].as_str().or(v["id"].as_str()).or(v["message_id"].as_str()).unwrap_or("").to_string();
            ("gesendet".into(), id)
        }
        Err(ureq::Error::Status(code, r)) => ("fehler".into(), format!("HTTP {code}: {}", r.into_string().unwrap_or_default().chars().take(300).collect::<String>())),
        Err(e) => ("fehler".into(), e.to_string()),
    }
}

/* ── EDI-Dateiaustausch: nur in den eingestellten Ordnern ── */

fn edi_dir(c: &Connection, which: &str) -> Result<PathBuf, String> {
    let key = if which == "export" { "edi.export_dir" } else { "edi.import_dir" };
    let d = setting_str(c, key);
    if d.trim().is_empty() {
        return Err(format!("Kein {}-Ordner eingestellt (EDI › Verbindungs-Verwaltung)", if which == "export" { "Export" } else { "Import" }));
    }
    let p = PathBuf::from(d.trim());
    std::fs::create_dir_all(&p).map_err(|e| format!("Ordner {}: {e}", p.display()))?;
    Ok(p)
}

fn safe_name(n: &str) -> Result<&str, String> {
    if n.is_empty() || n.contains('/') || n.contains('\\') || n.contains("..") || Path::new(n).is_absolute() {
        return Err("Ungültiger Dateiname".into());
    }
    Ok(n)
}

pub fn edi_files(c: &Connection, which: &str) -> Result<Vec<Value>, String> {
    let d = edi_dir(c, which)?;
    let mut out = vec![];
    for e in std::fs::read_dir(&d).map_err(|e| e.to_string())?.flatten() {
        let m = match e.metadata() {
            Ok(m) if m.is_file() => m,
            _ => continue,
        };
        let ts = m.modified().ok().map(|t| chrono::DateTime::<chrono::Local>::from(t).to_rfc3339_opts(chrono::SecondsFormat::Secs, false));
        out.push(json!({ "name": e.file_name().to_string_lossy(), "groesse": m.len(), "ts": ts }));
    }
    out.sort_by(|a, b| b["ts"].as_str().cmp(&a["ts"].as_str()));
    Ok(out)
}

pub fn edi_read(c: &Connection, which: &str, name: &str) -> Result<String, String> {
    let p = edi_dir(c, which)?.join(safe_name(name)?);
    let b = std::fs::read(&p).map_err(|e| format!("{}: {e}", p.display()))?;
    if b.len() > 20 * 1024 * 1024 {
        return Err("Datei zu groß (max. 20 MB)".into());
    }
    Ok(String::from_utf8(b.clone()).unwrap_or_else(|_| b.iter().map(|&x| x as char).collect()))
}

pub fn edi_write(c: &Connection, which: &str, name: &str, content: &str) -> Result<String, String> {
    let p = edi_dir(c, which)?.join(safe_name(name)?);
    std::fs::write(&p, content).map_err(|e| format!("{}: {e}", p.display()))?;
    Ok(p.display().to_string())
}

/// Verarbeitete Importdatei in Unterordner „verarbeitet“ verschieben
pub fn edi_done(c: &Connection, name: &str) -> Result<(), String> {
    let d = edi_dir(c, "import")?;
    let n = safe_name(name)?;
    let t = d.join("verarbeitet");
    std::fs::create_dir_all(&t).map_err(|e| e.to_string())?;
    std::fs::rename(d.join(n), t.join(n)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phone_and_edi_dir() {
        assert_eq!(norm_phone("0664 123 45 67", "43"), "436641234567");
        assert_eq!(norm_phone("+49 171 1234567", "43"), "491711234567");
        assert_eq!(norm_phone("0041 79 1234567", "43"), "41791234567");
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        assert!(edi_files(&c, "import").is_err());
        let dir = std::env::temp_dir().join(format!("kontor-edi-{}", std::process::id()));
        db::setting_set(&c, "edi.import_dir", &json!(dir.display().to_string())).unwrap();
        db::setting_set(&c, "edi.export_dir", &json!(dir.display().to_string())).unwrap();
        edi_write(&c, "export", "a.edi", "UNA:+.? 'UNB+UNOC:3'").unwrap();
        assert!(edi_write(&c, "export", "../x.edi", "x").is_err());
        assert_eq!(edi_files(&c, "import").unwrap().len(), 1);
        assert!(edi_read(&c, "import", "a.edi").unwrap().starts_with("UNA"));
        edi_done(&c, "a.edi").unwrap();
        assert_eq!(edi_files(&c, "import").unwrap().len(), 0);
        log(&c, "sms", "43664", None, "Hallo", "fehler", "x", Some("t")).unwrap();
        assert_eq!(list(&c, Some("sms"), 10).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
