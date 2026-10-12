//! Gutscheine (Mehrzweckgutscheine): Ausgabe beim Verkauf, Einlösung als Zahlungsart, Restwert.
//! Gültigkeit: bis Jahresende + N Jahre (Einstellung, Standard 3). Ob eine Befristung im Einzelfall
//! zulässig ist, entscheidet der Betreiber – Kontor setzt nur die eingestellte Frist um.

use crate::db;
use rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

fn new_code(c: &Connection) -> Result<String, String> {
    for _ in 0..20 {
        let mut b = [0u8; 6];
        OsRng.fill_bytes(&mut b);
        let s: String = b.iter().map(|x| ALPHABET[(*x as usize) % ALPHABET.len()] as char).collect();
        let code = format!("GS-{}-{}", chrono::Local::now().format("%Y"), s);
        if c.query_row("SELECT 1 FROM vouchers WHERE code = ?1", [&code], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_none() {
            return Ok(code);
        }
    }
    Err("Kein freier Gutscheincode".into())
}

fn move_(c: &Connection, code: &str, delta: i64, balance: i64, reason: &str, refno: Option<&str>, user: Option<&str>) -> Result<(), String> {
    c.execute(
        "INSERT INTO voucher_moves(ts, code, delta, balance, reason, ref, user) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![db::now(), code, delta, balance, reason, refno, user],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Neuen Gutschein ausgeben (Verkauf oder Erstattung als Gutschein).
pub fn issue(c: &Connection, amount: i64, refno: &str, customer: Option<&str>, years: i64, reason: &str, user: Option<&str>) -> Result<String, String> {
    if amount <= 0 {
        return Err("Gutscheinbetrag muss größer als 0 sein".into());
    }
    let code = new_code(c)?;
    let y: i32 = chrono::Local::now().format("%Y").to_string().parse().unwrap_or(2026);
    let valid = format!("{}-12-31", y as i64 + years.max(1));
    c.execute(
        "INSERT INTO vouchers(code, initial, balance, status, sale_no, customer_id, valid_until, created_at) VALUES (?1,?2,?2,'aktiv',?3,?4,?5,?6)",
        params![code, amount, refno, customer, valid, db::now()],
    )
    .map_err(|e| e.to_string())?;
    move_(c, &code, amount, amount, reason, Some(refno), user)?;
    Ok(code)
}

pub fn get(c: &Connection, code: &str) -> Result<Value, String> {
    let code = code.trim().to_uppercase();
    let row: Option<(String, i64, i64, String, Option<String>, Option<String>, String)> = c
        .query_row("SELECT code, initial, balance, status, sale_no, valid_until, created_at FROM vouchers WHERE code = ?1", [&code], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?))
        })
        .optional()
        .map_err(|e| e.to_string())?;
    let (code, initial, balance, status, sale_no, valid, created) = row.ok_or_else(|| format!("Gutschein {code} unbekannt"))?;
    let expired = valid.as_deref().map(|v| v < chrono::Local::now().format("%Y-%m-%d").to_string().as_str()).unwrap_or(false);
    let (pin, note): (Option<String>, Option<String>) = c.query_row("SELECT pin_hash, note FROM vouchers WHERE code = ?1", [&code], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
    Ok(json!({ "code": code, "initial": initial, "balance": balance, "status": status, "sale_no": sale_no, "valid_until": valid, "created_at": created, "expired": expired, "pin": pin.is_some(), "note": note }))
}

fn pin_hash(code: &str, pin: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(format!("kontor-gutschein:{code}:{pin}").as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

/// PIN setzen (4–8 Ziffern) oder entfernen (None).
pub fn set_pin(c: &Connection, code: &str, pin: Option<&str>, user: Option<&str>) -> Result<(), String> {
    let v = get(c, code)?;
    let code = v["code"].as_str().unwrap();
    let h = match pin.map(str::trim).filter(|p| !p.is_empty()) {
        Some(p) if p.len() >= 4 && p.len() <= 8 && p.chars().all(|ch| ch.is_ascii_digit()) => Some(pin_hash(code, p)),
        Some(_) => return Err("PIN: 4 bis 8 Ziffern".into()),
        None => None,
    };
    c.execute("UPDATE vouchers SET pin_hash = ?2 WHERE code = ?1", params![code, h]).map_err(|e| e.to_string())?;
    let bal = v["balance"].as_i64().unwrap_or(0);
    move_(c, code, 0, bal, if h.is_some() { "PIN gesetzt" } else { "PIN entfernt" }, None, user)
}

/// PIN prüfen (nur wenn der Gutschein eine PIN hat).
pub fn check_pin(c: &Connection, code: &str, pin: Option<&str>) -> Result<(), String> {
    let code = code.trim().to_uppercase();
    let h: Option<String> = c.query_row("SELECT pin_hash FROM vouchers WHERE code = ?1", [&code], |r| r.get(0)).optional().map_err(|e| e.to_string())?.flatten();
    match h {
        None => Ok(()),
        Some(h) if pin.map(|p| pin_hash(&code, p.trim()) == h).unwrap_or(false) => Ok(()),
        Some(_) => Err(format!("Gutschein {code}: PIN falsch oder fehlt")),
    }
}

/// Gutschein sperren/löschen (z. B. verloren gemeldet, missbräuchlich) – Restwert verfällt, Grund wird protokolliert.
pub fn delete(c: &Connection, code: &str, reason: &str, user: Option<&str>) -> Result<(), String> {
    let v = get(c, code)?;
    let code = v["code"].as_str().unwrap();
    if v["status"] == "gelöscht" {
        return Err("Gutschein ist bereits gelöscht".into());
    }
    if reason.trim().len() < 3 {
        return Err("Grund angeben".into());
    }
    let bal = v["balance"].as_i64().unwrap_or(0);
    c.execute("UPDATE vouchers SET balance = 0, status = 'gelöscht', note = ?2 WHERE code = ?1", params![code, format!("{} · Restwert {:.2} € · {}", reason.trim(), bal as f64 / 100.0, user.unwrap_or(""))])
        .map_err(|e| e.to_string())?;
    move_(c, code, -bal, 0, &format!("Löschung: {}", reason.trim()), None, user)
}

pub fn moves(c: &Connection, limit: i64) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare("SELECT id, ts, code, delta, balance, reason, ref, user FROM voucher_moves ORDER BY id DESC LIMIT ?1")?;
    let rows = st.query_map([limit], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "ts": r.get::<_, String>(1)?, "code": r.get::<_, String>(2)?, "delta": r.get::<_, i64>(3)?, "balance": r.get::<_, i64>(4)?,
            "reason": r.get::<_, String>(5)?, "ref": r.get::<_, Option<String>>(6)?, "user": r.get::<_, Option<String>>(7)? }))
    })?;
    rows.collect()
}

/// Einlösen (Teilbetrag möglich). Prüft Status, Ablauf und Restwert.
pub fn redeem(c: &Connection, code: &str, amount: i64, refno: &str, user: Option<&str>) -> Result<i64, String> {
    let v = get(c, code)?;
    let code = v["code"].as_str().unwrap();
    if v["status"] != "aktiv" {
        return Err(format!("Gutschein {code} ist {}", v["status"].as_str().unwrap_or("")));
    }
    if v["expired"].as_bool().unwrap_or(false) {
        return Err(format!("Gutschein {code} ist abgelaufen"));
    }
    let bal = v["balance"].as_i64().unwrap_or(0);
    if amount <= 0 || amount > bal {
        return Err(format!("Gutschein {code}: Restwert nur {},{:02} €", bal / 100, bal % 100));
    }
    let after = bal - amount;
    c.execute("UPDATE vouchers SET balance = ?2, status = CASE WHEN ?2 = 0 THEN 'eingelöst' ELSE 'aktiv' END WHERE code = ?1", params![code, after])
        .map_err(|e| e.to_string())?;
    move_(c, code, -amount, after, "Einlösung", Some(refno), user)?;
    Ok(after)
}

/// Verkauften Gutschein zurücknehmen – nur, solange er unbenutzt ist.
pub fn void(c: &Connection, code: &str, refno: &str, user: Option<&str>) -> Result<(), String> {
    let v = get(c, code)?;
    let code = v["code"].as_str().unwrap();
    if v["status"] != "aktiv" || v["balance"] != v["initial"] {
        return Err(format!("Gutschein {code} wurde bereits (teilweise) eingelöst und kann nicht zurückgenommen werden"));
    }
    let bal = v["balance"].as_i64().unwrap_or(0);
    c.execute("UPDATE vouchers SET balance = 0, status = 'storniert' WHERE code = ?1", [code]).map_err(|e| e.to_string())?;
    move_(c, code, -bal, 0, "Rücknahme", Some(refno), user)?;
    Ok(())
}

pub fn list(c: &Connection, limit: i64) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare("SELECT code, initial, balance, status, sale_no, valid_until, created_at, pin_hash IS NOT NULL, note, customer_id FROM vouchers ORDER BY created_at DESC LIMIT ?1")?;
    let rows = st.query_map([limit], |r| {
        Ok(json!({ "code": r.get::<_, String>(0)?, "initial": r.get::<_, i64>(1)?, "balance": r.get::<_, i64>(2)?, "status": r.get::<_, String>(3)?,
            "sale_no": r.get::<_, Option<String>>(4)?, "valid_until": r.get::<_, Option<String>>(5)?, "created_at": r.get::<_, String>(6)?,
            "pin": r.get::<_, bool>(7)?, "note": r.get::<_, Option<String>>(8)?, "customer_id": r.get::<_, Option<String>>(9)? }))
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pin_und_loeschen() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let code = issue(&c, 5000, "B1", None, 1, "Test", None).unwrap();
        assert!(check_pin(&c, &code, None).is_ok());
        assert!(set_pin(&c, &code, Some("12"), None).is_err());
        set_pin(&c, &code, Some("4711"), None).unwrap();
        assert!(get(&c, &code).unwrap()["pin"].as_bool().unwrap());
        assert!(check_pin(&c, &code, Some("0000")).is_err());
        assert!(check_pin(&c, &code, None).is_err());
        check_pin(&c, &code, Some("4711")).unwrap();
        redeem(&c, &code, 1000, "B2", None).unwrap();
        delete(&c, &code, "verloren gemeldet", Some("T")).unwrap();
        let v = get(&c, &code).unwrap();
        assert_eq!((v["status"].as_str().unwrap(), v["balance"].as_i64().unwrap()), ("gelöscht", 0));
        assert!(redeem(&c, &code, 100, "B3", None).is_err());
        assert!(moves(&c, 10).unwrap().len() >= 4);
    }
}
