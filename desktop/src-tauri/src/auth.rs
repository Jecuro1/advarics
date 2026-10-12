//! Weitere Anmeldemethoden neben der PIN:
//!  · Benutzername/E-Mail + Passwort (PBKDF2-SHA256)
//!  · Single Sign-On über OpenID Connect (Microsoft Entra ID, Google Workspace, Keycloak, AD FS …)
//!    – Autorisierungscode mit PKCE im Standard-Browser, Rückmeldung an einen lokalen Port,
//!    Prüfung der ID-Token-Signatur (RS256/ES256) über die Schlüssel des Anbieters
//!  · Windows Hello (Gesicht, Fingerabdruck, Geräte-PIN) – nur unter Windows
//! Die Freigabe per Handy-QR liegt in mobile.rs.

use crate::db;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;

const PW_ROUNDS: u32 = 120_000;

fn rand_hex(n: usize) -> String {
    let mut b = vec![0u8; n];
    OsRng.fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}
fn pw_hash(salt: &str, pw: &str) -> String {
    let mut out = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(pw.as_bytes(), salt.as_bytes(), PW_ROUNDS, &mut out);
    out.iter().map(|b| format!("{b:02x}")).collect()
}

/* ── Passwort ── */

pub fn password_set(c: &Connection, user: &str, login: &str, pw: Option<&str>) -> Result<(), String> {
    let login = login.trim().to_lowercase();
    if login.len() < 3 {
        return Err("Benutzername/E-Mail zu kurz".into());
    }
    if c.query_row("SELECT 1 FROM users WHERE lower(login) = ?1 AND id <> ?2 AND active = 1", params![login, user], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_some() {
        return Err("Diesen Benutzernamen hat bereits jemand".into());
    }
    match pw {
        Some(p) => {
            if p.chars().count() < 10 || !p.chars().any(|c| c.is_ascii_digit()) || !p.chars().any(|c| c.is_alphabetic()) {
                return Err("Passwort: mindestens 10 Zeichen mit Buchstaben und Ziffern".into());
            }
            let salt = rand_hex(16);
            c.execute("UPDATE users SET login = ?2, pw_hash = ?3, pw_salt = ?4, updated_at = ?5 WHERE id = ?1", params![user, login, pw_hash(&salt, p), salt, db::now()]).map_err(|e| e.to_string())?;
        }
        None => {
            c.execute("UPDATE users SET login = ?2, updated_at = ?3 WHERE id = ?1", params![user, login, db::now()]).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn password_clear(c: &Connection, user: &str) -> Result<(), String> {
    c.execute("UPDATE users SET pw_hash = NULL, pw_salt = NULL, updated_at = ?2 WHERE id = ?1", params![user, db::now()]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Anmeldung mit Benutzername/E-Mail + Passwort; liefert die Benutzer-ID (Sperre nach Fehlversuchen wie bei der PIN)
pub fn password_verify(c: &Connection, login: &str, pw: &str, code: Option<&str>) -> Result<String, String> {
    let row: Option<(String, Option<String>, Option<String>, Option<String>)> = c
        .query_row("SELECT id, pw_hash, pw_salt, locked_until FROM users WHERE lower(login) = ?1 AND active = 1", [login.trim().to_lowercase()], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((id, Some(h), Some(salt), locked)) = row else { return Err("Benutzername oder Passwort falsch".into()) };
    if let Some(l) = locked.and_then(|l| chrono::DateTime::parse_from_rfc3339(&l).ok()) {
        if l > chrono::Local::now() {
            return Err("Zu viele Fehlversuche – bitte kurz warten".into());
        }
    }
    if pw_hash(&salt, pw) != h {
        let failed: i64 = c.query_row("UPDATE users SET failed = failed + 1 WHERE id = ?1 RETURNING failed", [&id], |r| r.get(0)).unwrap_or(0);
        if failed >= 5 {
            let until = (chrono::Local::now() + chrono::Duration::minutes(2)).to_rfc3339();
            let _ = c.execute("UPDATE users SET locked_until = ?2, failed = 0 WHERE id = ?1", params![id, until]);
        }
        return Err("Benutzername oder Passwort falsch".into());
    }
    if let Some(sec) = crate::security::totp_secret(c, &id) {
        match code {
            None => return Err("TOTP".into()),
            Some(k) if !crate::security::totp_check(&sec, k) => return Err("Code aus der Authenticator-App stimmt nicht".into()),
            _ => {}
        }
    }
    let _ = c.execute("UPDATE users SET failed = 0, locked_until = NULL WHERE id = ?1", [&id]);
    Ok(id)
}

pub fn methods(c: &Connection) -> Value {
    let mut st = match c.prepare("SELECT id, login, pw_hash IS NOT NULL, hello FROM users WHERE active = 1") {
        Ok(s) => s,
        Err(_) => return json!({}),
    };
    let m: serde_json::Map<String, Value> = st
        .query_map([], |r| Ok((r.get::<_, String>(0)?, json!({ "login": r.get::<_, Option<String>>(1)?, "passwort": r.get::<_, i64>(2)? != 0, "hello": r.get::<_, i64>(3)? != 0 }))))
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default();
    Value::Object(m)
}

pub fn user_by_login(c: &Connection, login: &str) -> Option<String> {
    c.query_row("SELECT id FROM users WHERE lower(login) = ?1 AND active = 1", [login.trim().to_lowercase()], |r| r.get(0)).optional().ok().flatten()
}

/* ── OpenID Connect ── */

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).build()
}

/// Browser öffnen (Windows: Standard-Browser; Linux/macOS: xdg-open/open). Für automatisierte Tests kann
/// KONTOR_TEST_BROWSER=1 gesetzt werden: dann ruft Kontor die Adresse selbst auf (folgt Weiterleitungen).
pub fn open_browser(url: &str) -> Result<(), String> {
    if std::env::var("KONTOR_TEST_BROWSER").is_ok() {
        let u = url.to_string();
        std::thread::spawn(move || {
            let _ = agent().get(&u).call();
        });
        return Ok(());
    }
    #[cfg(windows)]
    let r = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(url).spawn();
    r.map(|_| ()).map_err(|e| format!("Browser konnte nicht geöffnet werden: {e}"))
}

fn jwt_parts(t: &str) -> Result<(Value, Value, Vec<u8>, String), String> {
    let mut it = t.split('.');
    let (h, p, sig) = (it.next().ok_or("Token unvollständig")?, it.next().ok_or("Token unvollständig")?, it.next().ok_or("Token unvollständig")?);
    let dec = |x: &str| B64.decode(x.trim_end_matches('=')).map_err(|_| "Token nicht lesbar".to_string());
    let header: Value = serde_json::from_slice(&dec(h)?).map_err(|e| e.to_string())?;
    let payload: Value = serde_json::from_slice(&dec(p)?).map_err(|e| e.to_string())?;
    Ok((header, payload, dec(sig)?, format!("{h}.{p}")))
}

/// Signatur eines ID-Tokens mit dem passenden Schlüssel (JWKS) prüfen
pub fn verify_jwt(token: &str, jwks: &Value) -> Result<Value, String> {
    let (h, payload, sig, signed) = jwt_parts(token)?;
    let alg = h["alg"].as_str().unwrap_or("");
    let kid = h["kid"].as_str();
    let keys = jwks["keys"].as_array().ok_or("Schlüssel des Anbieters fehlen")?;
    let key = keys.iter().find(|k| kid.map(|i| k["kid"].as_str() == Some(i)).unwrap_or(true) && (k["alg"].as_str().map(|a| a == alg).unwrap_or(true))).ok_or("Passender Schlüssel nicht gefunden")?;
    let dec = |x: &Value| B64.decode(x.as_str().unwrap_or("").trim_end_matches('=')).map_err(|_| "Schlüssel nicht lesbar".to_string());
    match alg {
        "RS256" => {
            use rsa::{pkcs1v15::Signature, pkcs1v15::VerifyingKey, signature::Verifier, BigUint, RsaPublicKey};
            let pk = RsaPublicKey::new(BigUint::from_bytes_be(&dec(&key["n"])?), BigUint::from_bytes_be(&dec(&key["e"])?)).map_err(|e| e.to_string())?;
            let vk = VerifyingKey::<Sha256>::new(pk);
            let s = Signature::try_from(sig.as_slice()).map_err(|e| e.to_string())?;
            vk.verify(signed.as_bytes(), &s).map_err(|_| "Signatur des Anbieters ungültig".to_string())?;
        }
        "ES256" => {
            use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
            let mut pt = vec![4u8];
            pt.extend(dec(&key["x"])?);
            pt.extend(dec(&key["y"])?);
            let vk = VerifyingKey::from_sec1_bytes(&pt).map_err(|e| e.to_string())?;
            let s = Signature::from_slice(&sig).map_err(|e| e.to_string())?;
            vk.verify(signed.as_bytes(), &s).map_err(|_| "Signatur des Anbieters ungültig".to_string())?;
        }
        _ => return Err(format!("Signaturverfahren {alg} nicht unterstützt")),
    }
    Ok(payload)
}

pub struct OidcCfg {
    pub issuer: String,
    pub client_id: String,
    pub client_secret: String,
}

/// Kompletter Anmeldeablauf; liefert {sub, email, name}
pub fn oidc_login(cfg: &OidcCfg) -> Result<Value, String> {
    let issuer = cfg.issuer.trim().trim_end_matches('/');
    if issuer.is_empty() || cfg.client_id.trim().is_empty() {
        return Err("Single Sign-On ist nicht eingerichtet".into());
    }
    let disc: Value = agent().get(&format!("{issuer}/.well-known/openid-configuration")).call().map_err(|e| format!("Anbieter nicht erreichbar: {e}"))?.into_json().map_err(|e| e.to_string())?;
    let (auth_ep, token_ep, jwks_uri) = (disc["authorization_endpoint"].as_str().ok_or("authorization_endpoint fehlt")?, disc["token_endpoint"].as_str().ok_or("token_endpoint fehlt")?, disc["jwks_uri"].as_str().ok_or("jwks_uri fehlt")?);
    // lokaler Rückkanal auf freiem Port
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("Port")?;
    let redirect = format!("http://127.0.0.1:{port}/anmeldung");
    let (state, nonce, verifier) = (rand_hex(16), rand_hex(16), rand_hex(32));
    let challenge = B64.encode(Sha256::digest(verifier.as_bytes()));
    let mut u = url::Url::parse(auth_ep).map_err(|e| e.to_string())?;
    u.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", cfg.client_id.trim())
        .append_pair("redirect_uri", &redirect)
        .append_pair("scope", "openid email profile")
        .append_pair("state", &state)
        .append_pair("nonce", &nonce)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");
    open_browser(u.as_str())?;
    let started = std::time::Instant::now();
    let code = loop {
        if started.elapsed() > Duration::from_secs(180) {
            return Err("Zeitüberschreitung – Anmeldung im Browser nicht abgeschlossen".into());
        }
        let Ok(Some(req)) = server.recv_timeout(Duration::from_millis(500)) else { continue };
        let q: std::collections::HashMap<String, String> = url::Url::parse(&format!("http://x{}", req.url())).map(|u| u.query_pairs().into_owned().collect()).unwrap_or_default();
        let page = |t: &str| tiny_http::Response::from_string(format!("<!doctype html><meta charset=utf-8><title>Kontor</title><body style=\"font:16px system-ui;display:grid;place-items:center;height:90vh;color:#101828\"><div><h2>{t}</h2><p>Sie können dieses Fenster schließen und zu Kontor zurückkehren.</p></div>")).with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
        if let Some(e) = q.get("error") {
            let _ = req.respond(page("Anmeldung abgebrochen"));
            return Err(format!("Anbieter meldet: {}", q.get("error_description").unwrap_or(e)));
        }
        if q.get("state") != Some(&state) {
            let _ = req.respond(page("Ungültige Anfrage"));
            continue;
        }
        let _ = req.respond(page("Angemeldet ✓"));
        break q.get("code").cloned().ok_or("Code fehlt")?;
    };
    let mut form = vec![("grant_type", "authorization_code"), ("code", code.as_str()), ("redirect_uri", redirect.as_str()), ("client_id", cfg.client_id.trim()), ("code_verifier", verifier.as_str())];
    if !cfg.client_secret.is_empty() {
        form.push(("client_secret", cfg.client_secret.as_str()));
    }
    let tok: Value = match agent().post(token_ep).send_form(&form) {
        Ok(r) => r.into_json().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(_, r)) => return Err(format!("Anbieter lehnt ab: {}", r.into_string().unwrap_or_default().chars().take(200).collect::<String>())),
        Err(e) => return Err(e.to_string()),
    };
    let idt = tok["id_token"].as_str().ok_or("Kein ID-Token erhalten")?;
    let jwks: Value = agent().get(jwks_uri).call().map_err(|e| e.to_string())?.into_json().map_err(|e| e.to_string())?;
    let p = verify_jwt(idt, &jwks)?;
    let now = chrono::Utc::now().timestamp();
    if p["iss"].as_str().map(|i| i.trim_end_matches('/')) != Some(issuer) && !issuer.contains("{tenantid}") {
        return Err("Token stammt nicht vom eingerichteten Anbieter".into());
    }
    let aud_ok = p["aud"].as_str() == Some(cfg.client_id.trim()) || p["aud"].as_array().map(|a| a.iter().any(|x| x.as_str() == Some(cfg.client_id.trim()))).unwrap_or(false);
    if !aud_ok {
        return Err("Token ist nicht für Kontor ausgestellt".into());
    }
    if p["exp"].as_i64().unwrap_or(0) < now - 60 {
        return Err("Token abgelaufen".into());
    }
    if p["nonce"].as_str() != Some(nonce.as_str()) {
        return Err("Token passt nicht zur Anfrage".into());
    }
    let email = p["email"].as_str().or(p["preferred_username"].as_str()).or(p["upn"].as_str()).unwrap_or("").to_lowercase();
    Ok(json!({ "sub": p["sub"], "email": email, "name": p["name"] }))
}

/* ── Windows Hello ── */

#[cfg(windows)]
pub fn hello_verify(hwnd: isize, message: &str) -> Result<(), String> {
    use windows::core::{factory, HSTRING};
    use windows::Foundation::IAsyncOperation;
    use windows::Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::IUserConsentVerifierInterop;
    let avail = UserConsentVerifier::CheckAvailabilityAsync().and_then(|op| op.get()).map_err(|e| e.message().to_string())?;
    if avail != UserConsentVerifierAvailability::Available {
        return Err("Windows Hello ist auf diesem Gerät nicht eingerichtet".into());
    }
    let interop = factory::<UserConsentVerifier, IUserConsentVerifierInterop>().map_err(|e| e.message().to_string())?;
    let op: IAsyncOperation<UserConsentVerificationResult> = unsafe { interop.RequestVerificationForWindowAsync(HWND(hwnd as _), &HSTRING::from(message)) }.map_err(|e| e.message().to_string())?;
    match op.get().map_err(|e| e.message().to_string())? {
        UserConsentVerificationResult::Verified => Ok(()),
        UserConsentVerificationResult::Canceled => Err("Abgebrochen".into()),
        _ => Err("Windows Hello hat die Person nicht bestätigt".into()),
    }
}
#[cfg(not(windows))]
pub fn hello_verify(_hwnd: isize, _message: &str) -> Result<(), String> {
    Err("Windows Hello gibt es nur unter Windows".into())
}

pub fn hello_set(c: &Connection, user: &str, on: bool) -> Result<(), String> {
    c.execute("UPDATE users SET hello = ?2 WHERE id = ?1", params![user, on as i64]).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passwort_und_token() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        crate::users::seed(&c).unwrap();
        assert!(password_set(&c, "dh", "david@firma.at", Some("kurz")).is_err());
        password_set(&c, "dh", "David@Firma.at", Some("Sicher-Passwort-2026")).unwrap();
        assert_eq!(password_verify(&c, "david@firma.at", "Sicher-Passwort-2026", None).unwrap(), "dh");
        assert!(password_verify(&c, "david@firma.at", "falsch", None).is_err());
        assert!(password_set(&c, "lm", "DAVID@firma.at", None).is_err());
        assert_eq!(user_by_login(&c, "DAVID@FIRMA.AT").as_deref(), Some("dh"));
        // ES256-Token mit eigenem Schlüssel signieren und prüfen
        use p256::ecdsa::{signature::Signer, Signature, SigningKey};
        let sk = SigningKey::random(&mut OsRng);
        let pt = sk.verifying_key().to_encoded_point(false);
        let jwks = json!({ "keys": [{ "kty": "EC", "kid": "k1", "alg": "ES256", "x": B64.encode(pt.x().unwrap()), "y": B64.encode(pt.y().unwrap()) }] });
        let h = B64.encode(br#"{"alg":"ES256","kid":"k1"}"#);
        let p = B64.encode(br#"{"sub":"1","email":"a@b.at"}"#);
        let sig: Signature = sk.sign(format!("{h}.{p}").as_bytes());
        let t = format!("{h}.{p}.{}", B64.encode(sig.to_bytes()));
        assert_eq!(verify_jwt(&t, &jwks).unwrap()["email"], "a@b.at");
        let bad = format!("{h}.{}.{}", B64.encode(br#"{"sub":"2"}"#), B64.encode(sig.to_bytes()));
        assert!(verify_jwt(&bad, &jwks).is_err());
    }
}
