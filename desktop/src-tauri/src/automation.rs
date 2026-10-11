//! Automatisierung: Regeln (Auslöser → Bedingungen → Aktionen), Skripte (laufen isoliert in der
//! Oberfläche), Webhooks (HTTP-POST an freigegebene Ziele, HMAC-SHA256-signiert, mit Warteschlange
//! und Wiederholung bei Fehlern).

use crate::db;
use hmac::{Hmac, Mac};
use rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use std::path::PathBuf;
use std::time::Duration;

/* ── Regeln & Skripte (Ausführung in der Oberfläche, Speicherung hier) ── */

#[derive(Serialize, Deserialize, Clone)]
pub struct Rule {
    #[serde(default)]
    pub id: Option<i64>,
    pub name: String,
    pub trigger: String,
    #[serde(default)]
    pub conditions: Value,
    #[serde(default)]
    pub actions: Value,
    #[serde(default = "yes")]
    pub active: bool,
    #[serde(default)]
    pub runs: i64,
    #[serde(default)]
    pub last_run: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
}
fn yes() -> bool {
    true
}

pub fn rules(c: &Connection) -> rusqlite::Result<Vec<Rule>> {
    let mut st = c.prepare("SELECT id, name, trigger, conditions, actions, active, runs, last_run, last_error FROM rules ORDER BY id")?;
    let rows = st.query_map([], |r| {
        Ok(Rule {
            id: Some(r.get(0)?),
            name: r.get(1)?,
            trigger: r.get(2)?,
            conditions: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or(json!([])),
            actions: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or(json!([])),
            active: r.get::<_, i64>(5)? != 0,
            runs: r.get(6)?,
            last_run: r.get(7)?,
            last_error: r.get(8)?,
        })
    })?;
    rows.collect()
}

pub fn rule_save(c: &Connection, r: &Rule) -> Result<i64, String> {
    if r.name.trim().is_empty() || r.trigger.trim().is_empty() {
        return Err("Name und Auslöser fehlen".into());
    }
    if !r.actions.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
        return Err("Mindestens eine Aktion".into());
    }
    let now = db::now();
    let cond = if r.conditions.is_array() { r.conditions.to_string() } else { "[]".into() };
    match r.id {
        Some(id) => {
            c.execute(
                "UPDATE rules SET name=?2, trigger=?3, conditions=?4, actions=?5, active=?6, updated_at=?7 WHERE id=?1",
                params![id, r.name.trim(), r.trigger.trim(), cond, r.actions.to_string(), r.active as i64, now],
            )
            .map_err(|e| e.to_string())?;
            Ok(id)
        }
        None => {
            c.execute(
                "INSERT INTO rules(name, trigger, conditions, actions, active, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)",
                params![r.name.trim(), r.trigger.trim(), cond, r.actions.to_string(), r.active as i64, now],
            )
            .map_err(|e| e.to_string())?;
            Ok(c.last_insert_rowid())
        }
    }
}

pub fn rule_ran(c: &Connection, id: i64, error: Option<&str>) {
    let _ = c.execute("UPDATE rules SET runs = runs + 1, last_run = ?2, last_error = ?3 WHERE id = ?1", params![id, db::now(), error]);
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Script {
    #[serde(default)]
    pub id: Option<i64>,
    pub name: String,
    pub code: String,
}

pub fn scripts(c: &Connection) -> rusqlite::Result<Vec<Script>> {
    let mut st = c.prepare("SELECT id, name, code FROM scripts ORDER BY name")?;
    let rows = st.query_map([], |r| Ok(Script { id: Some(r.get(0)?), name: r.get(1)?, code: r.get(2)? }))?;
    rows.collect()
}

pub fn script_save(c: &Connection, s: &Script) -> Result<i64, String> {
    if s.name.trim().is_empty() {
        return Err("Name fehlt".into());
    }
    if s.code.len() > 100_000 {
        return Err("Skript zu groß".into());
    }
    let now = db::now();
    match s.id {
        Some(id) => {
            c.execute("UPDATE scripts SET name=?2, code=?3, updated_at=?4 WHERE id=?1", params![id, s.name.trim(), s.code, now]).map_err(|e| e.to_string())?;
            Ok(id)
        }
        None => {
            c.execute("INSERT INTO scripts(name, code, created_at, updated_at) VALUES (?1,?2,?3,?3)", params![s.name.trim(), s.code, now]).map_err(|e| e.to_string())?;
            Ok(c.last_insert_rowid())
        }
    }
}

/* ── Webhooks ── */

#[derive(Serialize, Deserialize, Clone)]
pub struct Webhook {
    #[serde(default)]
    pub id: Option<i64>,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub events: Vec<String>,
    #[serde(default)]
    pub secret: String,
    #[serde(default = "yes")]
    pub active: bool,
}

pub fn webhooks(c: &Connection) -> rusqlite::Result<Vec<Webhook>> {
    let mut st = c.prepare("SELECT id, name, url, events, secret, active FROM webhooks ORDER BY id")?;
    let rows = st.query_map([], |r| {
        Ok(Webhook { id: Some(r.get(0)?), name: r.get(1)?, url: r.get(2)?, events: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(), secret: r.get(4)?, active: r.get::<_, i64>(5)? != 0 })
    })?;
    rows.collect()
}

pub fn webhook_save(c: &Connection, w: &Webhook) -> Result<i64, String> {
    let u = url::Url::parse(w.url.trim()).map_err(|_| "URL ungültig".to_string())?;
    if !["http", "https"].contains(&u.scheme()) {
        return Err("Nur http(s)-Ziele".into());
    }
    if w.events.is_empty() {
        return Err("Mindestens ein Ereignis wählen".into());
    }
    let ev = serde_json::to_string(&w.events).unwrap();
    match w.id {
        Some(id) => {
            c.execute("UPDATE webhooks SET name=?2, url=?3, events=?4, active=?5 WHERE id=?1", params![id, w.name.trim(), w.url.trim(), ev, w.active as i64]).map_err(|e| e.to_string())?;
            Ok(id)
        }
        None => {
            let mut b = [0u8; 24];
            OsRng.fill_bytes(&mut b);
            let secret: String = b.iter().map(|x| format!("{x:02x}")).collect();
            c.execute(
                "INSERT INTO webhooks(name, url, events, secret, active, created_at) VALUES (?1,?2,?3,?4,?5,?6)",
                params![w.name.trim(), w.url.trim(), ev, secret, w.active as i64, db::now()],
            )
            .map_err(|e| e.to_string())?;
            Ok(c.last_insert_rowid())
        }
    }
}

fn event_matches(patterns: &[String], event: &str) -> bool {
    patterns.iter().any(|p| p == "*" || p == event || (p.ends_with(".*") && event.starts_with(&p[..p.len() - 1])))
}

/// Ereignis an alle passenden, aktiven Webhooks in die Warteschlange stellen.
pub fn dispatch(c: &Connection, event: &str, payload: &Value) -> usize {
    if event.starts_with("webhook.") || event.starts_with("test.") {
        return 0;
    }
    let Ok(list) = webhooks(c) else { return 0 };
    let mut n = 0;
    for w in list.into_iter().filter(|w| w.active && event_matches(&w.events, event)) {
        let body = json!({ "event": event, "zeit": db::now(), "daten": payload });
        if c.execute(
            "INSERT INTO webhook_queue(webhook_id, event, payload, next_at, created_at) VALUES (?1,?2,?3,?4,?4)",
            params![w.id, event, body.to_string(), db::now()],
        )
        .is_ok()
        {
            n += 1;
        }
    }
    n
}

pub fn sign(secret: &str, body: &str) -> String {
    let mut m = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    m.update(body.as_bytes());
    m.finalize().into_bytes().iter().map(|b| format!("{b:02x}")).collect()
}

fn post(url: &str, secret: &str, event: &str, body: &str) -> Result<u16, String> {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(10)).build();
    match agent
        .post(url)
        .set("Content-Type", "application/json")
        .set("User-Agent", "Kontor-Webhook/1")
        .set("X-Kontor-Event", event)
        .set("X-Kontor-Signature", &format!("sha256={}", sign(secret, body)))
        .send_string(body)
    {
        Ok(r) => Ok(r.status()),
        Err(ureq::Error::Status(code, _)) => Err(format!("HTTP {code}")),
        Err(e) => Err(e.to_string()),
    }
}

const BACKOFF_MIN: [i64; 5] = [1, 5, 30, 120, 720];

/// Fällige Zustellungen abarbeiten (vom Hintergrund-Dienst alle paar Sekunden aufgerufen).
pub fn deliver_due(c: &Connection) -> usize {
    let now = db::now();
    let due: Vec<(i64, String, String, String, String, i64)> = {
        let Ok(mut st) = c.prepare(
            "SELECT q.id, w.url, w.secret, q.event, q.payload, q.attempts FROM webhook_queue q JOIN webhooks w ON w.id = q.webhook_id
             WHERE q.status = 'offen' AND q.next_at <= ?1 ORDER BY q.id LIMIT 20",
        ) else {
            return 0;
        };
        let Ok(rows) = st.query_map([&now], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))) else { return 0 };
        rows.filter_map(Result::ok).collect()
    };
    let n = due.len();
    for (id, url, secret, event, body, attempts) in due {
        match post(&url, &secret, &event, &body) {
            Ok(code) if (200..300).contains(&code) => {
                let _ = c.execute("UPDATE webhook_queue SET status='ok', attempts=attempts+1, last_status=?2, done_at=?3, last_error=NULL WHERE id=?1", params![id, code, db::now()]);
            }
            res => {
                let err = match res {
                    Ok(code) => format!("HTTP {code}"),
                    Err(e) => e,
                };
                let a = attempts + 1;
                if a as usize > BACKOFF_MIN.len() {
                    let _ = c.execute("UPDATE webhook_queue SET status='fehler', attempts=?2, last_error=?3, done_at=?4 WHERE id=?1", params![id, a, err, db::now()]);
                } else {
                    let next = (chrono::Local::now() + chrono::Duration::minutes(BACKOFF_MIN[a as usize - 1])).to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
                    let _ = c.execute("UPDATE webhook_queue SET attempts=?2, last_error=?3, next_at=?4 WHERE id=?1", params![id, a, err, next]);
                }
            }
        }
    }
    n
}

pub fn queue(c: &Connection, limit: i64) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare(
        "SELECT q.id, w.name, q.event, q.status, q.attempts, q.last_status, q.last_error, q.created_at, q.done_at, q.next_at
         FROM webhook_queue q LEFT JOIN webhooks w ON w.id = q.webhook_id ORDER BY q.id DESC LIMIT ?1",
    )?;
    let rows = st.query_map([limit], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "webhook": r.get::<_, Option<String>>(1)?, "event": r.get::<_, String>(2)?, "status": r.get::<_, String>(3)?,
            "attempts": r.get::<_, i64>(4)?, "last_status": r.get::<_, Option<i64>>(5)?, "last_error": r.get::<_, Option<String>>(6)?,
            "created_at": r.get::<_, String>(7)?, "done_at": r.get::<_, Option<String>>(8)?, "next_at": r.get::<_, String>(9)? }))
    })?;
    rows.collect()
}

/// Erneut versuchen (fehlgeschlagene sofort wieder einreihen)
pub fn retry(c: &Connection, id: i64) -> Result<(), String> {
    c.execute("UPDATE webhook_queue SET status='offen', next_at=?2 WHERE id=?1", params![id, db::now()]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Hintergrund-Dienst: eigene Datenbankverbindung, stellt alle 5 s zu.
pub fn start_worker(db_path: PathBuf) {
    std::thread::spawn(move || {
        let Ok(c) = db::open(&db_path) else { return };
        let _ = c.busy_timeout(Duration::from_secs(5));
        loop {
            deliver_due(&c);
            std::thread::sleep(Duration::from_secs(5));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn webhook_zustellung_signatur_und_wiederholung() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let h = std::thread::spawn(move || {
            let mut got = vec![];
            for i in 0..2 {
                let (mut s, _) = l.accept().unwrap();
                let mut buf = vec![0u8; 65536];
                let mut req = String::new();
                loop {
                    let n = s.read(&mut buf).unwrap();
                    req.push_str(&String::from_utf8_lossy(&buf[..n]));
                    if let Some(p) = req.find("\r\n\r\n") {
                        let len: usize = req.lines().find_map(|l| l.to_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse().unwrap())).unwrap_or(0);
                        if req.len() >= p + 4 + len {
                            break;
                        }
                    }
                }
                // erster Versuch: Fehler 500, zweiter: OK
                let resp = if i == 0 { "HTTP/1.1 500 Fehler\r\nContent-Length: 0\r\n\r\n" } else { "HTTP/1.1 204 No Content\r\n\r\n" };
                s.write_all(resp.as_bytes()).unwrap();
                got.push(req);
            }
            got
        });
        let id = webhook_save(&c, &Webhook { id: None, name: "ERP".into(), url: format!("http://127.0.0.1:{port}/hook"), events: vec!["pos.sale.*".into()], secret: String::new(), active: true }).unwrap();
        assert!(webhook_save(&c, &Webhook { id: None, name: "x".into(), url: "ftp://x".into(), events: vec!["*".into()], secret: String::new(), active: true }).is_err());
        assert_eq!(dispatch(&c, "pos.sale.completed", &json!({ "beleg": "2026-000001", "summe": 49.9 })), 1);
        assert_eq!(dispatch(&c, "customer.saved", &json!({})), 0);
        assert_eq!(deliver_due(&c), 1);
        assert_eq!(queue(&c, 10).unwrap()[0]["status"], json!("offen"), "nach Fehler erneut eingereiht");
        retry(&c, 1).unwrap();
        assert_eq!(deliver_due(&c), 1);
        let q = &queue(&c, 10).unwrap()[0];
        assert_eq!(q["status"], json!("ok"));
        assert_eq!(q["last_status"], json!(204));
        let reqs = h.join().unwrap();
        let secret: String = c.query_row("SELECT secret FROM webhooks WHERE id = ?1", [id], |r| r.get(0)).unwrap();
        let body = &reqs[1][reqs[1].find("\r\n\r\n").unwrap() + 4..];
        assert!(reqs[1].to_lowercase().contains(&format!("x-kontor-signature: sha256={}", sign(&secret, body))));
        assert!(body.contains("\"beleg\":\"2026-000001\""));
    }
}
