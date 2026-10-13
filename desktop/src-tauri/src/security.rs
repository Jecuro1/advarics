//! Rechte je Rolle (anpassbar) und Zwei-Faktor-Anmeldung mit Authenticator-App (TOTP, RFC 6238).

use crate::db;
use hmac::{Hmac, Mac};
use rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha1::Sha1;

/// (Recht, Beschreibung, Standard je Rolle: kasse, verkauf, leitung, admin)
pub const PERMS: &[(&str, &str, [bool; 4])] = &[
    ("kasse.verkaufen", "An der Kasse verkaufen", [true, true, true, true]),
    ("kasse.retoure", "Retouren buchen", [false, true, true, true]),
    ("kasse.kassenbuch", "Kassenbuch und Tagesabschluss", [true, true, true, true]),
    ("artikel.bearbeiten", "Artikel anlegen und bearbeiten", [false, true, true, true]),
    ("preise.aktionen", "Preisaktionen verwalten", [false, false, true, true]),
    ("bestand.buchen", "Bestand buchen und Inventur", [false, true, true, true]),
    ("einkauf", "Einkauf, Bestellungen, Wareneingang", [false, true, true, true]),
    ("rechnungen", "Eingangsrechnungen und Zahlungen", [false, false, true, true]),
    ("faktura", "Faktura: Angebote, Aufträge, Lieferscheine, Rechnungen", [false, true, true, true]),
    ("marketing", "Kampagnen, Rabattregeln, Sales-Aktionen, Schaufenster", [false, false, true, true]),
    ("kunden.bearbeiten", "Kunden anlegen und bearbeiten", [true, true, true, true]),
    ("berichte", "Berichte, Dashboard-Zahlen, Exporte", [false, false, true, true]),
    ("anpassen", "Felder, Objekte, Regeln, Webhooks, API", [false, false, false, true]),
    ("einstellungen", "Einstellungen ändern", [false, false, true, true]),
    ("system", "Benutzer, Rechte, Sicherung, RKSV, Updates", [false, false, false, true]),
];
const ROLES: [&str; 4] = ["kasse", "verkauf", "leitung", "admin"];

pub fn matrix(c: &Connection) -> Value {
    let mut out = serde_json::Map::new();
    for (ri, role) in ROLES.iter().enumerate() {
        let mut m = serde_json::Map::new();
        for (perm, _, def) in PERMS {
            let v: Option<i64> = c.query_row("SELECT allowed FROM permissions WHERE role = ?1 AND perm = ?2", params![role, perm], |r| r.get(0)).optional().ok().flatten();
            m.insert(perm.to_string(), json!(v.map(|x| x != 0).unwrap_or(def[ri])));
        }
        out.insert(role.to_string(), Value::Object(m));
    }
    json!({ "roles": out, "perms": PERMS.iter().map(|(p, d, _)| json!({ "perm": p, "label": d })).collect::<Vec<_>>() })
}

pub fn set(c: &Connection, role: &str, perm: &str, allowed: bool) -> Result<(), String> {
    if !ROLES.contains(&role) || !PERMS.iter().any(|(p, _, _)| *p == perm) {
        return Err("Unbekannte Rolle oder Recht".into());
    }
    if role == "admin" && (perm == "system" || perm == "einstellungen") && !allowed {
        return Err("Administratoren behalten Systemrechte (sonst sperrt man sich aus)".into());
    }
    c.execute("INSERT INTO permissions(role, perm, allowed) VALUES (?1,?2,?3) ON CONFLICT(role, perm) DO UPDATE SET allowed = excluded.allowed", params![role, perm, allowed as i64])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn allowed(c: &Connection, role: &str, perm: &str) -> bool {
    matrix(c)["roles"][role][perm].as_bool().unwrap_or(false)
}

/// Rechte einer Person: die ihrer Rolle, abgewandelt durch ihre Benutzergruppe (Abweichung „ja“ oder „nein“ je Recht,
/// festgelegt unter Stammdaten › Benutzer › Benutzergruppen). Administratoren behalten immer die Rechte ihrer Rolle –
/// so kann sich niemand über eine Gruppe selbst aussperren.
pub fn allowed_for(c: &Connection, user_id: &str, role: &str, perm: &str) -> bool {
    if role != "admin" {
        if let Some(v) = group_override(c, user_id, perm) {
            return v;
        }
    }
    allowed(c, role, perm)
}

/// Abweichung der Benutzergruppe einer Person für ein Recht (None = „wie Rolle“)
fn group_override(c: &Connection, user_id: &str, perm: &str) -> Option<bool> {
    let name: String = c.query_row("SELECT name FROM users WHERE id = ?1", [user_id], |r| r.get(0)).ok()?;
    let want = name.trim().to_lowercase();
    let is_me = |m: &Value| m.as_str().map(|x| x.trim().to_lowercase() == want).unwrap_or(false);
    let group = crate::stamm::list(c, "benutzergruppe")
        .ok()?
        .into_iter()
        .filter(|g| g["_aktiv"].as_bool().unwrap_or(true))
        .find(|g| g["mitglieder"].as_array().map(|m| m.iter().any(is_me)).unwrap_or(false))?;
    match group["rechte"][perm].as_str() {
        Some("ja") => Some(true),
        Some("nein") => Some(false),
        _ => None,
    }
}

/* ── TOTP ── */

const B32: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

pub fn base32(data: &[u8]) -> String {
    let mut out = String::new();
    let (mut buf, mut bits) = (0u32, 0);
    for b in data {
        buf = (buf << 8) | *b as u32;
        bits += 8;
        while bits >= 5 {
            out.push(B32[((buf >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        out.push(B32[((buf << (5 - bits)) & 31) as usize] as char);
    }
    out
}

pub fn base32_decode(s: &str) -> Option<Vec<u8>> {
    let (mut buf, mut bits, mut out) = (0u32, 0, vec![]);
    for ch in s.trim_end_matches('=').bytes() {
        let v = B32.iter().position(|c| *c == ch.to_ascii_uppercase())? as u32;
        buf = (buf << 5) | v;
        bits += 5;
        if bits >= 8 {
            out.push((buf >> (bits - 8)) as u8);
            bits -= 8;
        }
    }
    Some(out)
}

pub fn totp(secret: &[u8], t: u64) -> u32 {
    let counter = (t / 30).to_be_bytes();
    let mut m = Hmac::<Sha1>::new_from_slice(secret).unwrap();
    m.update(&counter);
    let h = m.finalize().into_bytes();
    let o = (h[19] & 0x0f) as usize;
    let bin = ((h[o] as u32 & 0x7f) << 24) | ((h[o + 1] as u32) << 16) | ((h[o + 2] as u32) << 8) | h[o + 3] as u32;
    bin % 1_000_000
}

fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
}

/// Code prüfen (±30 s Toleranz für ungenaue Uhren)
pub fn totp_check(secret_b32: &str, code: &str) -> bool {
    let Some(sec) = base32_decode(secret_b32) else { return false };
    let Ok(c) = code.trim().replace(' ', "").parse::<u32>() else { return false };
    let t = now_secs();
    [t - 30, t, t + 30].iter().any(|x| totp(&sec, *x) == c)
}

/// Neues Geheimnis erzeugen (noch nicht aktiv) → otpauth-URI für den QR-Code
pub fn totp_new(user: &str, issuer: &str) -> (String, String) {
    let mut b = [0u8; 20];
    OsRng.fill_bytes(&mut b);
    let s = base32(&b);
    let enc = |x: &str| url::form_urlencoded::byte_serialize(x.as_bytes()).collect::<String>().replace('+', "%20");
    let uri = format!("otpauth://totp/{}:{}?secret={s}&issuer={}&digits=6&period=30", enc(issuer), enc(user), enc(issuer));
    (s, uri)
}

pub fn totp_enable(c: &Connection, user_id: &str, secret: &str, code: &str) -> Result<(), String> {
    if !totp_check(secret, code) {
        return Err("Code stimmt nicht – Uhrzeit am Handy prüfen und neuen Code eingeben".into());
    }
    c.execute("UPDATE users SET totp_secret = ?2, updated_at = ?3 WHERE id = ?1", params![user_id, secret, db::now()]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn totp_disable(c: &Connection, user_id: &str) -> Result<(), String> {
    c.execute("UPDATE users SET totp_secret = NULL, updated_at = ?2 WHERE id = ?1", params![user_id, db::now()]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn totp_secret(c: &Connection, user_id: &str) -> Option<String> {
    c.query_row("SELECT totp_secret FROM users WHERE id = ?1", [user_id], |r| r.get::<_, Option<String>>(0)).ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn totp_rfc6238_und_rechte() {
        // Testvektor RFC 6238 (SHA-1, Geheimnis "12345678901234567890"): T=59 → 94287082 → 6-stellig 287082
        assert_eq!(totp(b"12345678901234567890", 59), 287082);
        assert_eq!(totp(b"12345678901234567890", 1111111109), 81804);
        assert_eq!(base32_decode(&base32(b"Hallo Kontor")).unwrap(), b"Hallo Kontor");
        let (s, uri) = totp_new("David Huber", "Kontor");
        assert!(uri.starts_with("otpauth://totp/Kontor:David%20Huber?secret="));
        let code = format!("{:06}", totp(&base32_decode(&s).unwrap(), now_secs()));
        assert!(totp_check(&s, &code));
        assert!(!totp_check(&s, "000000") || code == "000000");
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        assert!(!allowed(&c, "kasse", "berichte"));
        set(&c, "kasse", "berichte", true).unwrap();
        assert!(allowed(&c, "kasse", "berichte"));
        assert!(set(&c, "admin", "system", false).is_err());
    }

    #[test]
    fn gruppenrechte_wandeln_die_rolle_ab() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        crate::users::seed(&c).unwrap();   // lm = Verkauf, dh = Administrator, ms = Kasse
        // ohne Gruppe gilt die Rolle
        assert!(allowed_for(&c, "lm", "verkauf", "artikel.bearbeiten"));
        assert!(!allowed_for(&c, "lm", "verkauf", "rechnungen"));
        let gruppe = json!({ "id": "bg-einkauf", "name": "Einkauf", "rolle": "verkauf", "mitglieder": ["Lena Moser", "David Huber"], "filialen": [],
            "rechte": { "rechnungen": "ja", "artikel.bearbeiten": "nein", "einkauf": "wie" } });
        crate::stamm::save(&c, "benutzergruppe", &[gruppe.clone()]).unwrap();
        // Abweichungen: ja erlaubt zusätzlich, nein sperrt; alles andere (auch unbekannte Werte) bleibt wie die Rolle
        assert!(allowed_for(&c, "lm", "verkauf", "rechnungen"));
        assert!(!allowed_for(&c, "lm", "verkauf", "artikel.bearbeiten"));
        assert!(allowed_for(&c, "lm", "verkauf", "einkauf"));
        assert!(allowed_for(&c, "lm", "verkauf", "kasse.verkaufen"));
        // Administratoren behalten ihre Rolle, auch als Mitglied mit „nein“
        let mut g2 = gruppe.clone();
        g2["rechte"] = json!({ "system": "nein" });
        crate::stamm::save(&c, "benutzergruppe", &[g2]).unwrap();
        assert!(allowed_for(&c, "dh", "admin", "system"));
        // Nicht-Mitglieder sind nicht betroffen; Namen werden ohne Groß-/Kleinschreibung verglichen
        assert!(!allowed_for(&c, "ms", "kasse", "rechnungen"));
        let mut g3 = gruppe;
        g3["mitglieder"] = json!(["  miriam steiner "]);
        crate::stamm::save(&c, "benutzergruppe", &[g3]).unwrap();
        assert!(allowed_for(&c, "ms", "kasse", "rechnungen"));
        assert!(allowed_for(&c, "lm", "verkauf", "artikel.bearbeiten"));
        // eine deaktivierte Gruppe wirkt nicht
        let mut g4 = json!({ "id": "bg-aus", "name": "Aus", "rolle": "kasse", "mitglieder": ["Miriam Steiner"], "rechte": { "berichte": "ja" }, "_aktiv": false });
        crate::stamm::save(&c, "benutzergruppe", &[g4.clone()]).unwrap();
        assert!(!allowed_for(&c, "ms", "kasse", "berichte"));
        g4["_aktiv"] = json!(true);
        crate::stamm::save(&c, "benutzergruppe", &[g4]).unwrap();
        assert!(allowed_for(&c, "ms", "kasse", "berichte"));
    }
}
