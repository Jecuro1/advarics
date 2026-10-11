//! RKSV (Registrierkassensicherheitsverordnung, Österreich) – Testmodus.
//!
//! Umgesetzt nach der Detailspezifikation: maschinenlesbarer Code (Suite R1), Umsatzzähler
//! AES-256-ICM-verschlüsselt, Signaturkette (SHA-256 des vorigen Belegs), ES256-Signatur als JWS,
//! Start-, Null-, Monats- und Jahresbelege, DEP-Export.
//!
//! TESTMODUS: Statt einer registrierten Signaturerstellungseinheit (Smartcard / Online-HSM eines
//! Vertrauensdiensteanbieters) signiert ein lokal erzeugter Software-Schlüssel. Belege sind damit
//! technisch vollständig, aber NICHT bei FinanzOnline registrierbar. Für den Echtbetrieb wird nur
//! die Signaturquelle ausgetauscht – Format, Kette und DEP bleiben gleich.

use crate::db;
use aes::Aes256;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use chrono::{DateTime, Local};
use ctr::cipher::{KeyIvInit, StreamCipher};
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use p256::pkcs8::EncodePublicKey;
use rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

type AesCtr = ctr::Ctr128BE<Aes256>;
/// Kennung für „keine Zertifizierungsstelle“ (Testbetrieb)
const PREFIX: &str = "R1-AT0";
const JWS_HEADER: &str = r#"{"alg":"ES256"}"#;

struct State {
    kassen_id: String,
    aes_key: [u8; 32],
    sig_key: SigningKey,
    serial: String,
    turnover: i64,
    last_jws: Option<String>,
}

fn load(c: &Connection) -> Result<Option<State>, String> {
    let row: Option<(String, String, String, String, i64, Option<String>)> = c
        .query_row("SELECT kassen_id, aes_key, sig_key, cert_serial, turnover, last_jws FROM rksv WHERE id = 1", [], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((kassen_id, aes, sig, serial, turnover, last_jws)) = row else { return Ok(None) };
    let aes: [u8; 32] = STANDARD.decode(aes).map_err(|e| e.to_string())?.try_into().map_err(|_| "AES-Schlüssel ungültig")?;
    let sk: [u8; 32] = STANDARD.decode(sig).map_err(|e| e.to_string())?.try_into().map_err(|_| "Signaturschlüssel ungültig")?;
    let sig_key = SigningKey::from_bytes(&sk.into()).map_err(|e| e.to_string())?;
    Ok(Some(State { kassen_id, aes_key: aes, sig_key, serial, turnover, last_jws }))
}

pub fn active(c: &Connection) -> bool {
    c.query_row("SELECT 1 FROM rksv WHERE id = 1", [], |_| Ok(())).optional().ok().flatten().is_some()
}

/// Betrag „1234“ Cent → „12,34“ (RKSV-Format, Komma, Minus vorne)
pub fn fmt_amount(c: i64) -> String {
    format!("{}{},{:02}", if c < 0 { "-" } else { "" }, c.abs() / 100, c.abs() % 100)
}

pub fn encrypt_turnover(key: &[u8; 32], kassen_id: &str, beleg_no: &str, turnover: i64) -> String {
    let h = Sha256::digest(format!("{kassen_id}{beleg_no}").as_bytes());
    let iv: [u8; 16] = h[..16].try_into().unwrap();
    let mut buf = turnover.to_be_bytes();
    let mut cipher = AesCtr::new(key.into(), &iv.into());
    cipher.apply_keystream(&mut buf);
    STANDARD.encode(buf)
}

fn chain_value(prev: &str) -> String {
    STANDARD.encode(&Sha256::digest(prev.as_bytes())[..8])
}

/// Beträge je Steuersatz in Cent: [Normal 20 %, Ermäßigt-1 10 %, Ermäßigt-2 13 %, Null 0 %, Besonders 19 %]
pub fn amounts_from(data: &Value) -> [i64; 5] {
    let mut a = [0i64; 5];
    let cents = |v: &Value| (v.as_f64().unwrap_or(0.0) * 100.0).round() as i64;
    for v in data["t"]["vat"].as_array().into_iter().flatten() {
        let i = match v["rate"].as_i64().unwrap_or(20) {
            10 => 1,
            13 => 2,
            0 => 3,
            19 => 4,
            _ => 0,
        };
        a[i] += cents(&v["gross"]);
    }
    a[3] += cents(&data["t"]["zero"]);
    a
}

pub struct Signed {
    pub qr: String,
    #[cfg_attr(not(test), allow(dead_code))]
    pub jws: String,
}

fn sign_inner(c: &Connection, st: &mut State, beleg_no: &str, ts: &DateTime<Local>, amounts: [i64; 5], kind: &str) -> Result<Signed, String> {
    st.turnover += amounts.iter().sum::<i64>();
    let enc = encrypt_turnover(&st.aes_key, &st.kassen_id, beleg_no, st.turnover);
    let chain = chain_value(st.last_jws.as_deref().unwrap_or(&st.kassen_id));
    let code = format!(
        "_{PREFIX}_{}_{}_{}_{}_{}_{}_{}_{}_{}_{}_{}",
        st.kassen_id,
        beleg_no,
        ts.format("%Y-%m-%dT%H:%M:%S"),
        fmt_amount(amounts[0]),
        fmt_amount(amounts[1]),
        fmt_amount(amounts[2]),
        fmt_amount(amounts[3]),
        fmt_amount(amounts[4]),
        enc,
        st.serial,
        chain
    );
    let signing_input = format!("{}.{}", URL_SAFE_NO_PAD.encode(JWS_HEADER), URL_SAFE_NO_PAD.encode(&code));
    let sig: Signature = st.sig_key.sign(signing_input.as_bytes());
    let sig = sig.to_bytes();
    let jws = format!("{signing_input}.{}", URL_SAFE_NO_PAD.encode(sig));
    let qr = format!("{code}_{}", STANDARD.encode(sig));
    c.execute("UPDATE rksv SET turnover = ?1, last_jws = ?2 WHERE id = 1", params![st.turnover, jws]).map_err(|e| e.to_string())?;
    c.execute("INSERT INTO dep(beleg_no, ts, kind, jws) VALUES (?1,?2,?3,?4)", params![beleg_no, ts.to_rfc3339_opts(chrono::SecondsFormat::Secs, false), kind, jws])
        .map_err(|e| e.to_string())?;
    st.last_jws = Some(jws.clone());
    Ok(Signed { qr, jws })
}

/// Beleg signieren, sofern RKSV aktiv ist. Liefert den Inhalt des QR-Codes.
pub fn sign(c: &Connection, beleg_no: &str, ts: &DateTime<Local>, data: &Value, kind: &str) -> Result<Option<Signed>, String> {
    let Some(mut st) = load(c)? else { return Ok(None) };
    sign_inner(c, &mut st, beleg_no, ts, amounts_from(data), kind).map(Some)
}

fn next_beleg(c: &Connection) -> Result<(i64, String), String> {
    let n: i64 = c
        .query_row("UPDATE counters SET value = value + 1 WHERE name = 'beleg' RETURNING value", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok((n, crate::catalog::format_beleg(n)))
}

/// Null-, Start-, Monats- oder Jahresbeleg als eigener Beleg (Betrag 0).
fn zero_receipt(c: &Connection, st: &mut State, kind: &str, label: &str, cashier: &str) -> Result<Value, String> {
    let (n, no) = next_beleg(c)?;
    let ts = Local::now();
    let s = sign_inner(c, st, &no, &ts, [0; 5], kind)?;
    let data = json!({
        "kind": kind, "label": label, "date": ts.to_rfc3339(), "cashier": cashier, "lines": [], "parts": [], "change": 0,
        "t": { "total": 0, "sub": 0, "disc": 0, "vat": [], "zero": 0, "points": 0 },
        "rksv": { "qr": s.qr, "test": true, "turnover": st.turnover }
    });
    c.execute(
        "INSERT INTO sales(beleg_no, ts, total, cashier, data, kind, rksv) VALUES (?1,?2,0,?3,?4,?5,?6)",
        params![no, ts.to_rfc3339_opts(chrono::SecondsFormat::Secs, false), cashier, data.to_string(), kind, s.qr],
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "no": no, "number": n, "data": data }))
}

/// Inbetriebnahme im Testmodus: Schlüssel erzeugen, Startbeleg signieren.
pub fn init(c: &Connection, kassen_id: &str, cashier: &str) -> Result<Value, String> {
    if active(c) {
        return Err("RKSV ist bereits in Betrieb".into());
    }
    let kid = kassen_id.trim();
    if kid.is_empty() || kid.contains('_') || kid.len() > 40 {
        return Err("Kassen-ID ungültig (keine Unterstriche, max. 40 Zeichen)".into());
    }
    let mut aes = [0u8; 32];
    OsRng.fill_bytes(&mut aes);
    let sk = SigningKey::random(&mut OsRng);
    let pk = sk.verifying_key().to_public_key_der().map_err(|e| e.to_string())?;
    let serial = format!("TEST-{:08X}", u32::from_be_bytes(Sha256::digest(pk.as_bytes())[..4].try_into().unwrap()));
    c.execute(
        "INSERT INTO rksv(id, kassen_id, mode, aes_key, sig_key, public_key, cert_serial, turnover, started_at) VALUES (1,?1,'test',?2,?3,?4,?5,0,?6)",
        params![kid, STANDARD.encode(aes), STANDARD.encode(sk.to_bytes()), STANDARD.encode(pk.as_bytes()), serial, db::now()],
    )
    .map_err(|e| e.to_string())?;
    let mut st = load(c)?.unwrap();
    zero_receipt(c, &mut st, "startbeleg", "Startbeleg", cashier)
}

pub fn null_receipt(c: &Connection, label: &str, cashier: &str) -> Result<Value, String> {
    let mut st = load(c)?.ok_or("RKSV ist nicht in Betrieb")?;
    let kind = if label.starts_with("Monat") || label.starts_with("Jahr") { "monatsbeleg" } else { "nullbeleg" };
    zero_receipt(c, &mut st, kind, label, cashier)
}

pub fn status(c: &Connection) -> Result<Value, String> {
    let row: Option<(String, String, String, i64, String, String)> = c
        .query_row("SELECT kassen_id, mode, cert_serial, turnover, started_at, public_key FROM rksv WHERE id = 1", [], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((kid, mode, serial, turnover, started, pk)) = row else { return Ok(json!({ "active": false })) };
    let count: i64 = c.query_row("SELECT COUNT(*) FROM dep", [], |r| r.get(0)).unwrap_or(0);
    let last_month: Option<String> = c
        .query_row("SELECT ts FROM sales WHERE kind = 'monatsbeleg' ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(json!({ "active": true, "kassen_id": kid, "mode": mode, "serial": serial, "turnover": turnover, "started_at": started,
        "receipts": count, "public_key": pk, "last_monthly": last_month }))
}

/// DEP-Export im Format der Detailspezifikation („Belege-Gruppe“).
pub fn dep_export(c: &Connection) -> Result<Value, String> {
    let pk: String = c.query_row("SELECT public_key FROM rksv WHERE id = 1", [], |r| r.get(0)).map_err(|_| "RKSV ist nicht in Betrieb".to_string())?;
    let mut st = c.prepare("SELECT jws FROM dep ORDER BY id").map_err(|e| e.to_string())?;
    let list: Vec<String> = st.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    Ok(json!({ "Belege-Gruppe": [{
        "Signaturzertifikat": "",
        "Zertifizierungsstellen": [],
        "Belege-kompakt": list,
        "Hinweis": "TESTMODUS – Software-Schlüssel, kein registriertes Zertifikat",
        "Oeffentlicher-Schluessel": pk
    }] }))
}

#[cfg(test)]
pub mod tests {
    use super::*;

    pub fn decrypt_turnover(key: &[u8; 32], kassen_id: &str, beleg_no: &str, enc: &str) -> i64 {
        let h = Sha256::digest(format!("{kassen_id}{beleg_no}").as_bytes());
        let iv: [u8; 16] = h[..16].try_into().unwrap();
        let mut buf: [u8; 8] = STANDARD.decode(enc).unwrap().try_into().unwrap();
        AesCtr::new(key.into(), &iv.into()).apply_keystream(&mut buf);
        i64::from_be_bytes(buf)
    }

    #[test]
    fn kette_zaehler_und_signatur() {
        use p256::ecdsa::signature::Verifier;
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let start = init(&c, "INN-K01", "Test").unwrap();
        let qr0 = start["data"]["rksv"]["qr"].as_str().unwrap().to_string();
        assert!(qr0.starts_with("_R1-AT0_INN-K01_2"));
        // Startbeleg: Kette = SHA-256(Kassen-ID)
        assert!(qr0.contains(&chain_value("INN-K01")));
        let st = load(&c).unwrap().unwrap();
        let data = json!({ "t": { "vat": [{ "rate": 20, "gross": 120.0 }, { "rate": 10, "gross": 11.0 }], "zero": 50.0 } });
        let s = sign(&c, "2026-000002", &Local::now(), &data, "beleg").unwrap().unwrap();
        let parts: Vec<&str> = s.qr.split('_').collect();
        assert_eq!(parts[5..10], ["120,00", "11,00", "0,00", "50,00", "0,00"]);
        assert_eq!(decrypt_turnover(&st.aes_key, "INN-K01", "2026-000002", parts[10]), 18100);
        // Kette auf den Startbeleg
        let jws0: String = c.query_row("SELECT jws FROM dep ORDER BY id LIMIT 1", [], |r| r.get(0)).unwrap();
        assert_eq!(parts[12], chain_value(&jws0));
        // Signatur prüfen
        let mut it = s.jws.split('.');
        let (h, p, sg) = (it.next().unwrap(), it.next().unwrap(), it.next().unwrap());
        let sig = Signature::from_slice(&URL_SAFE_NO_PAD.decode(sg).unwrap()).unwrap();
        st.sig_key.verifying_key().verify(format!("{h}.{p}").as_bytes(), &sig).unwrap();
        assert_eq!(String::from_utf8(URL_SAFE_NO_PAD.decode(p).unwrap()).unwrap(), s.qr.rsplit_once('_').unwrap().0);
        // Rückgabe senkt den Zähler
        let ret = json!({ "t": { "vat": [{ "rate": 20, "gross": -20.0 }], "zero": 0 } });
        let r = sign(&c, "2026-000003", &Local::now(), &ret, "beleg").unwrap().unwrap();
        assert_eq!(decrypt_turnover(&st.aes_key, "INN-K01", "2026-000003", r.qr.split('_').nth(10).unwrap()), 16100);
        assert_eq!(fmt_amount(-5), "-0,05");
        assert_eq!(dep_export(&c).unwrap()["Belege-Gruppe"][0]["Belege-kompakt"].as_array().unwrap().len(), 3);
        // Export für die externe Gegenprobe (Python, siehe Tests im Repo)
        if let Ok(p) = std::env::var("KONTOR_RKSV_DUMP") {
            std::fs::write(p, json!({ "aes": STANDARD.encode(st.aes_key), "pk": STANDARD.encode(st.sig_key.verifying_key().to_public_key_der().unwrap().as_bytes()), "qr": s.qr, "jws": s.jws }).to_string()).unwrap();
        }
    }
}
