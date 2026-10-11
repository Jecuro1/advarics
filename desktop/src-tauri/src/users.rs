//! Benutzer, Rollen und PIN-Anmeldung.
//! PINs werden nie gespeichert – nur ein gesalzener, vielfach gehashter Wert. Nach 5 Fehlversuchen
//! ist der Benutzer 2 Minuten gesperrt.

use crate::db;
use rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const ROLES: &[&str] = &["kasse", "verkauf", "leitung", "admin"];
const ROUNDS: u32 = 60_000;
const MAX_FAILED: i64 = 5;
const LOCK_MINUTES: i64 = 2;

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct User {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub role: String,
    #[serde(default = "yes")]
    pub active: bool,
}
fn yes() -> bool {
    true
}

/// Darf Freigaben erteilen (Rabatt, Storno, Punkte, Kassenbuch …)
pub fn can_approve(role: &str) -> bool {
    role == "leitung" || role == "admin"
}

fn hash_pin(salt: &str, pin: &str) -> String {
    let mut h = Sha256::digest(format!("{salt}:{pin}").as_bytes());
    for _ in 0..ROUNDS {
        let mut d = Sha256::new();
        d.update(salt.as_bytes());
        d.update(h);
        h = d.finalize();
    }
    h.iter().map(|b| format!("{b:02x}")).collect()
}

fn new_salt() -> String {
    let mut b = [0u8; 16];
    OsRng.fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn valid_pin(pin: &str) -> Result<(), String> {
    if pin.len() < 4 || pin.len() > 8 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN muss aus 4 bis 8 Ziffern bestehen".into());
    }
    if pin.chars().all(|c| Some(c) == pin.chars().next()) {
        return Err("PIN darf nicht nur aus derselben Ziffer bestehen".into());
    }
    Ok(())
}

pub fn list(c: &Connection) -> rusqlite::Result<Vec<User>> {
    let mut st = c.prepare("SELECT id, name, role, active FROM users WHERE active = 1 ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'leitung' THEN 1 ELSE 2 END, name")?;
    let rows = st.query_map([], |r| Ok(User { id: r.get(0)?, name: r.get(1)?, role: r.get(2)?, active: r.get::<_, i64>(3)? != 0 }))?;
    rows.collect()
}

fn admins(c: &Connection) -> i64 {
    c.query_row("SELECT COUNT(*) FROM users WHERE active = 1 AND role = 'admin'", [], |r| r.get(0)).unwrap_or(0)
}

/// Anlegen oder ändern. Neue Benutzer brauchen eine PIN; bei bestehenden ändert eine angegebene PIN sie.
pub fn save(c: &Connection, u: &User, pin: Option<&str>) -> Result<String, String> {
    if u.name.trim().chars().count() < 2 {
        return Err("Name fehlt".into());
    }
    if !ROLES.contains(&u.role.as_str()) {
        return Err("Unbekannte Rolle".into());
    }
    let now = db::now();
    let existing: Option<String> = if u.id.is_empty() {
        None
    } else {
        c.query_row("SELECT role FROM users WHERE id = ?1", [&u.id], |r| r.get(0)).optional().map_err(|e| e.to_string())?
    };
    if existing.as_deref() == Some("admin") && u.role != "admin" && admins(c) <= 1 {
        return Err("Mindestens ein Benutzer muss Administrator bleiben".into());
    }
    let id = if existing.is_some() {
        u.id.clone()
    } else {
        let base: String = u.name.split_whitespace().filter_map(|p| p.chars().next()).take(2).collect::<String>().to_lowercase();
        let mut id = if base.is_empty() { "u".to_string() } else { base };
        let mut n = 1;
        while c.query_row("SELECT 1 FROM users WHERE id = ?1", [&id], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_some() {
            n += 1;
            id = format!("{}{}", id.trim_end_matches(char::is_numeric), n);
        }
        id
    };
    match (existing.is_some(), pin) {
        (false, None) => return Err("Neue Benutzer brauchen eine PIN".into()),
        (_, Some(p)) => {
            valid_pin(p)?;
            let salt = new_salt();
            let h = hash_pin(&salt, p);
            c.execute(
                "INSERT INTO users(id, name, role, pin_hash, pin_salt, active, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, pin_hash=excluded.pin_hash, pin_salt=excluded.pin_salt,
                   failed=0, locked_until=NULL, active=1, updated_at=excluded.updated_at",
                params![id, u.name.trim(), u.role, h, salt, now],
            )
            .map_err(|e| e.to_string())?;
        }
        (true, None) => {
            c.execute("UPDATE users SET name = ?2, role = ?3, updated_at = ?4 WHERE id = ?1", params![id, u.name.trim(), u.role, now]).map_err(|e| e.to_string())?;
        }
    }
    Ok(id)
}

pub fn deactivate(c: &Connection, id: &str) -> Result<(), String> {
    let role: String = c.query_row("SELECT role FROM users WHERE id = ?1", [id], |r| r.get(0)).map_err(|_| "Benutzer nicht gefunden".to_string())?;
    if role == "admin" && admins(c) <= 1 {
        return Err("Der letzte Administrator kann nicht deaktiviert werden".into());
    }
    c.execute("UPDATE users SET active = 0, updated_at = ?2 WHERE id = ?1", params![id, db::now()]).map_err(|e| e.to_string())?;
    Ok(())
}

/// PIN prüfen. Liefert den Benutzer oder eine verständliche Fehlermeldung (inkl. Sperre).
pub fn verify(c: &Connection, id: &str, pin: &str) -> Result<User, String> {
    let row: Option<(String, String, String, String, i64, Option<String>)> = c
        .query_row("SELECT name, role, pin_hash, pin_salt, failed, locked_until FROM users WHERE id = ?1 AND active = 1", [id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })
        .optional()
        .map_err(|e| e.to_string())?;
    let (name, role, h, salt, failed, locked) = row.ok_or("Benutzer nicht gefunden")?;
    let now = chrono::Local::now();
    if let Some(l) = locked.and_then(|l| chrono::DateTime::parse_from_rfc3339(&l).ok()) {
        if l > now {
            let secs = (l.timestamp() - now.timestamp()).max(1);
            return Err(format!("Zu viele Fehlversuche – gesperrt für {} s", secs));
        }
    }
    if hash_pin(&salt, pin) == h {
        c.execute("UPDATE users SET failed = 0, locked_until = NULL WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
        return Ok(User { id: id.to_string(), name, role, active: true });
    }
    let failed = failed + 1;
    let until = if failed >= MAX_FAILED {
        Some((now + chrono::Duration::minutes(LOCK_MINUTES)).to_rfc3339_opts(chrono::SecondsFormat::Secs, false))
    } else {
        None
    };
    c.execute("UPDATE users SET failed = ?2, locked_until = ?3 WHERE id = ?1", params![id, if until.is_some() { 0 } else { failed }, until])
        .map_err(|e| e.to_string())?;
    Err(if until.is_some() { format!("Falsche PIN – {LOCK_MINUTES} Minuten gesperrt") } else { format!("Falsche PIN ({} von {MAX_FAILED} Versuchen)", failed) })
}

/// Benutzer, die noch ihre Erst-PIN verwenden (Hinweis am Sperrbildschirm)
pub fn default_pins(c: &Connection) -> Vec<String> {
    let mut out = vec![];
    for (id, pin) in [("lm", "1111"), ("dh", "2222"), ("ms", "3333")] {
        let r: Option<(String, String, String)> = c
            .query_row("SELECT name, pin_hash, pin_salt FROM users WHERE id = ?1 AND active = 1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()
            .ok()
            .flatten();
        if let Some((name, h, salt)) = r {
            if hash_pin(&salt, pin) == h {
                out.push(format!("{name} {pin}"));
            }
        }
    }
    out
}

/// Erstbefüllung: drei Benutzer mit Erst-PINs (bitte sofort ändern).
pub fn seed(c: &Connection) -> Result<usize, String> {
    if db::count(c, "users") > 0 {
        return Ok(0);
    }
    for (id, name, role, pin) in [("lm", "Lena Moser", "verkauf", "1111"), ("dh", "David Huber", "admin", "2222"), ("ms", "Miriam Steiner", "kasse", "3333")] {
        let salt = new_salt();
        c.execute(
            "INSERT INTO users(id, name, role, pin_hash, pin_salt, active, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
            params![id, name, role, hash_pin(&salt, pin), salt, db::now()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(3)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pin_pruefung_und_sperre() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        seed(&c).unwrap();
        assert_eq!(verify(&c, "dh", "2222").unwrap().role, "admin");
        for _ in 0..4 {
            assert!(verify(&c, "dh", "9999").is_err());
        }
        let e = verify(&c, "dh", "9999").unwrap_err();
        assert!(e.contains("gesperrt"), "{e}");
        assert!(verify(&c, "dh", "2222").unwrap_err().contains("gesperrt"));
        // letzter Admin bleibt
        assert!(deactivate(&c, "dh").is_err());
        let id = save(&c, &User { id: String::new(), name: "Neu Mensch".into(), role: "kasse".into(), active: true }, Some("4711")).unwrap();
        assert_eq!(verify(&c, &id, "4711").unwrap().name, "Neu Mensch");
        assert!(save(&c, &User { id: String::new(), name: "Ohne Pin".into(), role: "kasse".into(), active: true }, None).is_err());
        assert!(save(&c, &User { id: String::new(), name: "Pin X".into(), role: "kasse".into(), active: true }, Some("12a4")).is_err());
    }
}
