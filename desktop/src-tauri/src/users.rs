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
    /// Personalnummer; 0 = beim Speichern automatisch die nächste freie vergeben
    #[serde(default)]
    pub nr: i64,
    /// Vorname, Name, Kontaktdaten, Adresse, Foto, Merkmale (Verkäufer:in, Kontor mobil …), Filialen
    #[serde(default)]
    pub profile: serde_json::Value,
    /// Zeitpunkt der letzten Änderung (nur Anzeige, wird beim Speichern ignoriert)
    #[serde(default)]
    pub updated: String,
}
fn yes() -> bool {
    true
}

const COLS: &str = "id, name, role, active, nr, profile, updated_at";
fn from_row(r: &rusqlite::Row) -> rusqlite::Result<User> {
    let p: String = r.get(5)?;
    Ok(User {
        id: r.get(0)?,
        name: r.get(1)?,
        role: r.get(2)?,
        active: r.get::<_, i64>(3)? != 0,
        nr: r.get::<_, Option<i64>>(4)?.unwrap_or(0),
        profile: serde_json::from_str(&p).unwrap_or_else(|_| serde_json::json!({})),
        updated: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
    })
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

/// Aktive Personen (Anmeldung, Auswahllisten)
pub fn list(c: &Connection) -> rusqlite::Result<Vec<User>> {
    let mut st = c.prepare(&format!("SELECT {COLS} FROM users WHERE active = 1 ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'leitung' THEN 1 ELSE 2 END, name"))?;
    let rows = st.query_map([], from_row)?;
    rows.collect()
}

/// Alle Personen, auch deaktivierte (Benutzerliste in den Stammdaten)
pub fn list_all(c: &Connection) -> rusqlite::Result<Vec<User>> {
    let mut st = c.prepare(&format!("SELECT {COLS} FROM users ORDER BY nr, name"))?;
    let rows = st.query_map([], from_row)?;
    rows.collect()
}

pub fn get(c: &Connection, id: &str) -> Option<User> {
    c.query_row(&format!("SELECT {COLS} FROM users WHERE id = ?1"), [id], from_row).optional().ok().flatten()
}

/// Darf sich die Person in „Kontor mobil“ (Handy/Tablet) anmelden? Standard: ja.
pub fn mobile_allowed(u: &User) -> bool {
    u.profile.get("mobil").and_then(|v| v.as_bool()).unwrap_or(true)
}

/// Profil prüfen: muss ein Objekt sein, Foto und Gesamtgröße sind begrenzt
fn clean_profile(p: &serde_json::Value) -> Result<String, String> {
    let obj = match p {
        serde_json::Value::Null => serde_json::json!({}),
        serde_json::Value::Object(_) => p.clone(),
        _ => return Err("Profil ungültig".into()),
    };
    if obj.get("foto").and_then(|v| v.as_str()).map(|f| f.len() > 160_000).unwrap_or(false) {
        return Err("Das Foto ist zu groß (höchstens ca. 120 KB)".into());
    }
    let s = obj.to_string();
    if s.len() > 300_000 {
        return Err("Profil ist zu groß".into());
    }
    Ok(s)
}

/// Personalnummer: gewünschte prüfen (eindeutig), sonst die bisherige behalten, sonst die nächste freie
fn pick_nr(c: &Connection, wanted: i64, id: &str) -> Result<i64, String> {
    if wanted > 0 {
        let taken: Option<String> = c.query_row("SELECT name FROM users WHERE nr = ?1 AND id <> ?2", params![wanted, id], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        return match taken {
            Some(n) => Err(format!("Nr. {wanted} ist schon vergeben ({n})")),
            None => Ok(wanted),
        };
    }
    let own: Option<Option<i64>> = c.query_row("SELECT nr FROM users WHERE id = ?1", [id], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    if let Some(Some(n)) = own {
        return Ok(n);
    }
    let max: i64 = c.query_row("SELECT COALESCE(MAX(nr), 1000) FROM users", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(max + 1)
}

fn admins(c: &Connection) -> i64 {
    c.query_row("SELECT COUNT(*) FROM users WHERE active = 1 AND role = 'admin'", [], |r| r.get(0)).unwrap_or(0)
}

/// Anlegen oder ändern. Neue Benutzer brauchen eine PIN; bei bestehenden ändert eine angegebene PIN sie.
/// Deaktivierte Personen bleiben erhalten (Protokoll, Belege) und können wieder aktiviert werden.
pub fn save(c: &Connection, u: &User, pin: Option<&str>) -> Result<String, String> {
    if u.name.trim().chars().count() < 2 {
        return Err("Name fehlt".into());
    }
    if !ROLES.contains(&u.role.as_str()) {
        return Err("Unbekannte Rolle".into());
    }
    let profile = clean_profile(&u.profile)?;
    let now = db::now();
    let existing: Option<(String, i64)> = if u.id.is_empty() {
        None
    } else {
        c.query_row("SELECT role, active FROM users WHERE id = ?1", [&u.id], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|e| e.to_string())?
    };
    // der letzte aktive Administrator bleibt Administrator und aktiv
    if let Some((role, active)) = &existing {
        if role == "admin" && *active != 0 && (u.role != "admin" || !u.active) && admins(c) <= 1 {
            return Err("Mindestens ein Benutzer muss Administrator bleiben".into());
        }
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
    let nr = pick_nr(c, u.nr, &id)?;
    match (existing.is_some(), pin) {
        (false, None) => return Err("Neue Benutzer brauchen eine PIN".into()),
        (_, Some(p)) => {
            valid_pin(p)?;
            let salt = new_salt();
            let h = hash_pin(&salt, p);
            c.execute(
                "INSERT INTO users(id, name, role, pin_hash, pin_salt, active, nr, profile, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, pin_hash=excluded.pin_hash, pin_salt=excluded.pin_salt,
                   failed=0, locked_until=NULL, active=excluded.active, nr=excluded.nr, profile=excluded.profile, updated_at=excluded.updated_at",
                params![id, u.name.trim(), u.role, h, salt, u.active as i64, nr, profile, now],
            )
            .map_err(|e| e.to_string())?;
        }
        (true, None) => {
            c.execute(
                "UPDATE users SET name = ?2, role = ?3, active = ?4, nr = ?5, profile = ?6, updated_at = ?7 WHERE id = ?1",
                params![id, u.name.trim(), u.role, u.active as i64, nr, profile, now],
            )
            .map_err(|e| e.to_string())?;
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
pub fn verify(c: &Connection, id: &str, pin: &str, code: Option<&str>) -> Result<User, String> {
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
        // Zwei-Faktor: wenn eingerichtet, zusätzlich Code aus der Authenticator-App
        if let Some(sec) = crate::security::totp_secret(c, id) {
            match code {
                None => return Err("TOTP".into()),
                Some(k) if !crate::security::totp_check(&sec, k) => {
                    let _ = c.execute("UPDATE users SET failed = failed + 1 WHERE id = ?1", [id]);
                    return Err("Code aus der Authenticator-App stimmt nicht".into());
                }
                _ => {}
            }
        }
        c.execute("UPDATE users SET failed = 0, locked_until = NULL WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
        return Ok(User { id: id.to_string(), name, role, active: true, ..Default::default() });
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

/// Erst-PIN-Kandidaten lesen (kurz, unter der Datenbank-Sperre) …
pub fn default_pin_candidates(c: &Connection) -> Vec<(String, String, String, &'static str)> {
    let mut out = vec![];
    for (id, pin) in [("lm", "1111"), ("dh", "2222"), ("ms", "3333")] {
        let r: Option<(String, String, String)> = c
            .query_row("SELECT name, pin_hash, pin_salt FROM users WHERE id = ?1 AND active = 1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()
            .ok()
            .flatten();
        if let Some((name, h, salt)) = r {
            out.push((name, h, salt, pin));
        }
    }
    out
}

/// … und die rechenintensive Prüfung (gesalzene Hashes) ohne Sperre ausführen: Benutzer, die noch ihre Erst-PIN verwenden
pub fn default_pins_check(cands: Vec<(String, String, String, &'static str)>) -> Vec<String> {
    cands.into_iter().filter(|(_, h, salt, pin)| hash_pin(salt, pin) == *h).map(|(name, _, _, pin)| format!("{name} {pin}")).collect()
}

/// Benutzer, die noch ihre Erst-PIN verwenden (Hinweis am Sperrbildschirm)
#[allow(dead_code)]
pub fn default_pins(c: &Connection) -> Vec<String> {
    default_pins_check(default_pin_candidates(c))
}

/// Erstbefüllung: drei Benutzer mit Erst-PINs (bitte sofort ändern).
pub fn seed(c: &Connection) -> Result<usize, String> {
    if db::count(c, "users") > 0 {
        return Ok(0);
    }
    for (i, (id, name, role, pin)) in [("lm", "Lena Moser", "verkauf", "1111"), ("dh", "David Huber", "admin", "2222"), ("ms", "Miriam Steiner", "kasse", "3333")].into_iter().enumerate() {
        let salt = new_salt();
        let (first, last) = name.split_once(' ').unwrap_or((name, ""));
        let profile = serde_json::json!({ "vorname": first, "nachname": last, "verkaeufer": true, "mobil": true });
        c.execute(
            "INSERT INTO users(id, name, role, pin_hash, pin_salt, active, nr, profile, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?7,?8,?8)",
            params![id, name, role, hash_pin(&salt, pin), salt, 1001 + i as i64, profile.to_string(), db::now()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(3)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profil_nummer_und_aktiv() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        seed(&c).unwrap();
        let all = list_all(&c).unwrap();
        assert_eq!(all.iter().map(|u| u.nr).collect::<Vec<_>>(), vec![1001, 1002, 1003]);
        // neue Person: nächste Nummer, Profil bleibt erhalten
        let p = serde_json::json!({ "vorname": "Paul", "nachname": "Probe", "email": "paul@firma.at", "mobil": false, "filialen": ["ZEN"] });
        let id = save(&c, &User { name: "Paul Probe".into(), role: "kasse".into(), active: true, profile: p.clone(), ..Default::default() }, Some("4711")).unwrap();
        let u = get(&c, &id).unwrap();
        assert_eq!((u.nr, u.profile["email"].as_str()), (1004, Some("paul@firma.at")));
        assert!(!u.updated.is_empty(), "Zeitpunkt der letzten Änderung fehlt");
        assert!(!mobile_allowed(&u));
        assert!(mobile_allowed(&get(&c, "lm").unwrap()));
        // Nummer ist eindeutig, die eigene darf bleiben
        let dup = save(&c, &User { id: id.clone(), name: "Paul Probe".into(), role: "kasse".into(), active: true, nr: 1001, profile: p.clone(), ..Default::default() }, None);
        assert!(dup.unwrap_err().contains("schon vergeben"));
        save(&c, &User { id: id.clone(), name: "Paul P.".into(), role: "verkauf".into(), active: true, nr: 1004, profile: p.clone(), ..Default::default() }, None).unwrap();
        assert_eq!(get(&c, &id).unwrap().role, "verkauf");
        // deaktivieren: nicht mehr in der Anmeldeliste, aber in der Gesamtliste; wieder aktivieren geht ohne neue PIN
        save(&c, &User { id: id.clone(), name: "Paul P.".into(), role: "verkauf".into(), active: false, nr: 1004, profile: p.clone(), ..Default::default() }, None).unwrap();
        assert!(list(&c).unwrap().iter().all(|x| x.id != id));
        assert!(list_all(&c).unwrap().iter().any(|x| x.id == id && !x.active));
        assert!(verify(&c, &id, "4711", None).is_err());
        save(&c, &User { id: id.clone(), name: "Paul P.".into(), role: "verkauf".into(), active: true, nr: 1004, profile: p, ..Default::default() }, None).unwrap();
        assert!(verify(&c, &id, "4711", None).is_ok());
        // der letzte Administrator bleibt Administrator und aktiv
        assert!(save(&c, &User { id: "dh".into(), name: "David Huber".into(), role: "verkauf".into(), active: true, ..Default::default() }, None).is_err());
        assert!(save(&c, &User { id: "dh".into(), name: "David Huber".into(), role: "admin".into(), active: false, ..Default::default() }, None).is_err());
        // Profil muss ein Objekt sein, zu große Fotos werden abgelehnt
        assert!(save(&c, &User { id: "lm".into(), name: "Lena Moser".into(), role: "verkauf".into(), active: true, profile: serde_json::json!([1]), ..Default::default() }, None).is_err());
        let big = serde_json::json!({ "foto": "x".repeat(170_000) });
        assert!(save(&c, &User { id: "lm".into(), name: "Lena Moser".into(), role: "verkauf".into(), active: true, profile: big, ..Default::default() }, None).is_err());
    }

    #[test]
    fn pin_pruefung_und_sperre() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        seed(&c).unwrap();
        assert_eq!(verify(&c, "dh", "2222", None).unwrap().role, "admin");
        for _ in 0..4 {
            assert!(verify(&c, "dh", "9999", None).is_err());
        }
        let e = verify(&c, "dh", "9999", None).unwrap_err();
        assert!(e.contains("gesperrt"), "{e}");
        assert!(verify(&c, "dh", "2222", None).unwrap_err().contains("gesperrt"));
        // letzter Admin bleibt
        assert!(deactivate(&c, "dh").is_err());
        let id = save(&c, &User { name: "Neu Mensch".into(), role: "kasse".into(), active: true, ..Default::default() }, Some("4711")).unwrap();
        assert_eq!(verify(&c, &id, "4711", None).unwrap().name, "Neu Mensch");
        assert!(save(&c, &User { name: "Ohne Pin".into(), role: "kasse".into(), active: true, ..Default::default() }, None).is_err());
        assert!(save(&c, &User { name: "Pin X".into(), role: "kasse".into(), active: true, ..Default::default() }, Some("12a4")).is_err());
    }
}
