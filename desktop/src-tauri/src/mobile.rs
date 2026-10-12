//! Handy-Web-App unter /mobil: im Browser von Handy oder Tablet im Firmennetz, ohne App-Store.
//! Anmeldung mit Kontor-PIN (und ggf. 2FA-Code), dann Artikel/Bestand suchen, Bestand buchen und
//! in der offenen Inventur zählen. Barcodes per Bluetooth-Scanner, Eingabe oder Foto (Erkennung hier).

use crate::{catalog, db, inventory, security, users};
use rand_core::{OsRng, RngCore};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tiny_http::{Header, Method, Request, Response};

const PAGE: &str = include_str!("mobil.html");
const TTL: Duration = Duration::from_secs(12 * 3600);

struct Sess {
    user: String,
    name: String,
    role: String,
    at: Instant,
}
fn sessions() -> &'static Mutex<HashMap<String, Sess>> {
    static S: OnceLock<Mutex<HashMap<String, Sess>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(HashMap::new()))
}

/* ── Anmeldung an der Kasse per Handy (QR-Code am Sperrbildschirm) ── */
struct Qr {
    user: Option<(String, String)>,
    at: Instant,
}
fn qr_map() -> &'static Mutex<HashMap<String, Qr>> {
    static Q: OnceLock<Mutex<HashMap<String, Qr>>> = OnceLock::new();
    Q.get_or_init(|| Mutex::new(HashMap::new()))
}
pub fn qr_start() -> String {
    let mut b = [0u8; 16];
    OsRng.fill_bytes(&mut b);
    let t: String = b.iter().map(|x| format!("{x:02x}")).collect();
    let mut m = qr_map().lock().unwrap();
    m.retain(|_, v| v.at.elapsed() < Duration::from_secs(300));
    m.insert(t.clone(), Qr { user: None, at: Instant::now() });
    t
}
/// Bestätigt? → Benutzer-ID (Code wird dabei verbraucht)
pub fn qr_status(token: &str) -> Result<Option<String>, String> {
    let mut m = qr_map().lock().unwrap();
    match m.get(token) {
        None => Err("QR-Code abgelaufen".into()),
        Some(q) if q.at.elapsed() > Duration::from_secs(180) => {
            m.remove(token);
            Err("QR-Code abgelaufen".into())
        }
        Some(q) => match &q.user {
            Some((id, _)) => {
                let id = id.clone();
                m.remove(token);
                Ok(Some(id))
            }
            None => Ok(None),
        },
    }
}

fn json_reply(req: Request, code: u16, v: Value) {
    let r = Response::from_string(v.to_string()).with_status_code(code).with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap());
    let _ = req.respond(r);
}

/// EAN/QR aus einem Foto lesen (JPEG/PNG/WebP), auch gedreht.
pub fn decode_photo(bytes: &[u8]) -> Result<String, String> {
    let img = image::load_from_memory(bytes).map_err(|_| "Bild nicht lesbar".to_string())?;
    let img = if img.width().max(img.height()) > 1800 { img.resize(1800, 1800, image::imageops::FilterType::Triangle) } else { img };
    for rot in 0..2 {
        let im = if rot == 0 { img.clone() } else { img.rotate90() };
        let l = im.to_luma8();
        let (w, h) = l.dimensions();
        if let Ok(r) = rxing::helpers::detect_in_luma(l.into_raw(), w, h, None) {
            return Ok(r.getText().to_string());
        }
    }
    Err("Kein Barcode erkannt – näher heran, gerade halten, gutes Licht".into())
}

fn variant_json(a: &catalog::Article, v: &catalog::Variant) -> Value {
    json!({ "variant_id": v.id, "artikel": a.id, "name": a.name, "marke": a.brand, "farbe": v.color, "groesse": v.size, "ean": v.ean, "bestand": v.stock,
        "preis": a.sale_price.unwrap_or(a.price) as f64 / 100.0, "mindest": a.min_stock })
}

fn search(c: &Connection, q: &str) -> Result<Vec<Value>, String> {
    let q = q.trim().to_lowercase();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let list = catalog::list(c).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for a in &list {
        let hay = format!("{} {} {}", a.name, a.brand, a.id).to_lowercase();
        let all = q.split_whitespace().all(|t| hay.contains(t));
        for v in &a.variants {
            if v.ean == q || (all && out.len() < 60) {
                out.push(variant_json(a, v));
            }
        }
    }
    // exakter EAN-Treffer zuerst
    out.sort_by_key(|x| if x["ean"].as_str() == Some(q.as_str()) { 0 } else { 1 });
    Ok(out)
}

pub fn handle(c: &Connection, mut req: Request, path: &str) {
    let method = req.method().clone();
    if path == "/mobil" || path == "/mobil/index.html" {
        let r = Response::from_string(PAGE).with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
        let _ = req.respond(r);
        return;
    }
    let url = req.url().to_string();
    let q = url.split_once('?').map(|(_, q)| url::form_urlencoded::parse(q.as_bytes()).into_owned().collect::<HashMap<String, String>>()).unwrap_or_default();
    let mut body = Vec::new();
    if method != Method::Get {
        let _ = std::io::Read::read_to_end(&mut std::io::Read::take(req.as_reader(), 12 * 1024 * 1024), &mut body);
    }
    let bj: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let s = |k: &str| bj[k].as_str().unwrap_or("").to_string();

    // Öffentlich: Benutzerliste für die Anmeldung, Anmeldung
    match (method.clone(), path) {
        (Method::Get, "/mobil/api/benutzer") => {
            let l = users::list(c).unwrap_or_default();
            let firma = db::setting_get(c, "firma.name").and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
            return json_reply(req, 200, json!({ "firma": firma, "benutzer": l.iter().filter(|u| u.active && users::mobile_allowed(u)).map(|u| json!({ "id": u.id, "name": u.name })).collect::<Vec<_>>() }));
        }
        (Method::Post, "/mobil/api/login") => {
            let code = bj["code"].as_str().filter(|x| !x.is_empty());
            return match users::verify(c, &s("user"), &s("pin"), code) {
                Ok(u) if !users::get(c, &u.id).map(|x| users::mobile_allowed(&x)).unwrap_or(true) => {
                    let _ = db::audit_append(c, "auth.login.failed", &json!({ "benutzer": u.name, "methode": "PIN · Handy", "grund": "Kontor mobil nicht freigegeben" }));
                    json_reply(req, 403, json!({ "fehler": "Für „Kontor mobil“ nicht freigegeben – bitte an die Administration wenden" }))
                }
                Ok(u) => {
                    let mut b = [0u8; 24];
                    OsRng.fill_bytes(&mut b);
                    let tok: String = b.iter().map(|x| format!("{x:02x}")).collect();
                    let mut m = sessions().lock().unwrap();
                    m.retain(|_, v| v.at.elapsed() < TTL);
                    m.insert(tok.clone(), Sess { user: u.id.clone(), name: u.name.clone(), role: u.role.clone(), at: Instant::now() });
                    let _ = db::audit_append(c, "auth.login", &json!({ "benutzer": u.name, "methode": "PIN · Handy" }));
                    json_reply(req, 200, json!({ "token": tok, "name": u.name, "rolle": u.role,
                        "rechte": { "buchen": security::allowed(c, &u.role, "bestand.buchen") } }))
                }
                Err(e) if e == "TOTP" => json_reply(req, 401, json!({ "fehler": "Code aus der Authenticator-App eingeben", "totp": true })),
                Err(e) => {
                    let _ = db::audit_append(c, "auth.login.failed", &json!({ "benutzer": s("user"), "methode": "PIN · Handy" }));
                    json_reply(req, 401, json!({ "fehler": e }))
                }
            };
        }
        _ => {}
    }

    // Ab hier nur mit Sitzung
    let tok = req.headers().iter().find(|h| h.field.equiv("X-Kontor-Sitzung")).map(|h| h.value.as_str().to_string()).unwrap_or_default();
    let sess = {
        let mut m = sessions().lock().unwrap();
        match m.get_mut(&tok) {
            Some(x) if x.at.elapsed() < TTL => {
                x.at = Instant::now();
                Some((x.user.clone(), x.name.clone(), x.role.clone()))
            }
            _ => None,
        }
    };
    let Some((uid, name, role)) = sess else { return json_reply(req, 401, json!({ "fehler": "Bitte neu anmelden" })) };

    let res: Result<Value, (u16, String)> = (|| match (method.clone(), path) {
        (Method::Get, "/mobil/api/suche") => Ok(json!(search(c, q.get("q").map(|s| s.as_str()).unwrap_or("")).map_err(|e| (500, e))?)),
        (Method::Post, "/mobil/api/foto") => {
            let ean = decode_photo(&body).map_err(|e| (422, e))?;
            Ok(json!({ "code": ean, "treffer": search(c, &ean).map_err(|e| (500, e))? }))
        }
        (Method::Post, "/mobil/api/buchung") => {
            if !security::allowed(c, &role, "bestand.buchen") {
                return Err((403, "Keine Berechtigung zum Buchen".into()));
            }
            let ean = s("ean");
            let menge = bj["menge"].as_i64().ok_or((400, "Menge fehlt".to_string()))?;
            let art = s("art");
            let vid: i64 = c.query_row("SELECT id FROM variants WHERE ean = ?1 AND active = 1", [ean.trim()], |r| r.get(0)).map_err(|_| (404, format!("EAN {ean} unbekannt")))?;
            let (value, set, reason) = match art.as_str() {
                "zugang" => (menge.abs(), false, "Zugang (Handy)"),
                "abgang" => (-menge.abs(), false, "Abgang (Handy)"),
                "inventur" => (menge.max(0), true, "Zählung (Handy)"),
                _ => return Err((400, "Art: zugang, abgang oder inventur".into())),
            };
            let grund = s("grund");
            let reason = if grund.is_empty() { reason.to_string() } else { format!("{reason}: {grund}") };
            let tx = c.unchecked_transaction().map_err(|e| (500, e.to_string()))?;
            let after = catalog::book(&tx, vid, value, set, &reason, None, Some(&name)).map_err(|e| (400, e))?;
            let p = json!({ "ean": ean, "art": art, "menge": menge, "bestand": after, "benutzer": name, "quelle": "handy" });
            db::audit_append(&tx, "inventory.booked", &p).map_err(|e| (500, e.to_string()))?;
            tx.commit().map_err(|e| (500, e.to_string()))?;
            crate::automation::dispatch(c, "inventory.booked", &p);
            Ok(json!({ "bestand": after }))
        }
        (Method::Get, "/mobil/api/inventur") => {
            let l = inventory::list(c).map_err(|e| (500, e.to_string()))?;
            Ok(json!(l.into_iter().find(|i| i["status"] == "offen")))
        }
        (Method::Post, "/mobil/api/zaehlen") => {
            let l = inventory::list(c).map_err(|e| (500, e.to_string()))?;
            let inv = l.into_iter().find(|i| i["status"] == "offen").ok_or((404, "Keine offene Inventur – am PC unter Inventur starten".to_string()))?;
            let id = inv["id"].as_i64().unwrap_or(0);
            let r = inventory::count(c, id, Some(&s("ean")), None, bj["menge"].as_i64().unwrap_or(1), bj["dazu"].as_bool().unwrap_or(true)).map_err(|e| (400, e))?;
            Ok(json!({ "inventur": inv["no"], "ergebnis": r }))
        }
        (Method::Post, "/mobil/api/qr") => {
            let t = s("token");
            let mut m = qr_map().lock().unwrap();
            let q = m.get_mut(&t).filter(|q| q.at.elapsed() < Duration::from_secs(180)).ok_or((404, "QR-Code abgelaufen – an der Kasse neu anzeigen".to_string()))?;
            q.user = Some((uid.clone(), name.clone()));
            let _ = db::audit_append(c, "auth.qr.approved", &json!({ "benutzer": name }));
            Ok(json!({ "ok": true }))
        }
        (Method::Post, "/mobil/api/abmelden") => {
            sessions().lock().unwrap().remove(&tok);
            Ok(json!({ "ok": true }))
        }
        _ => Err((404, "Unbekannt".into())),
    })();
    match res {
        Ok(v) => json_reply(req, 200, v),
        Err((code, e)) => json_reply(req, code, json!({ "fehler": e })),
    }
}

/// Lokale IP-Adressen für den QR-Code (ohne Pakete zu senden)
pub fn local_ips() -> Vec<String> {
    let mut v = vec![];
    if let Ok(s) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if s.connect("192.0.2.1:9").is_ok() {
            if let Ok(a) = s.local_addr() {
                if !a.ip().is_loopback() && !a.ip().is_unspecified() {
                    v.push(a.ip().to_string());
                }
            }
        }
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn barcode_aus_foto() {
        // EAN-13 erzeugen (Balkenmuster), als PNG kodieren und wieder erkennen
        let code = "9012000000011";
        let l = [0b0001101u8, 0b0011001, 0b0010011, 0b0111101, 0b0100011, 0b0110001, 0b0101111, 0b0111011, 0b0110111, 0b0001011];
        let g = [0b0100111u8, 0b0110011, 0b0011011, 0b0100001, 0b0011101, 0b0111001, 0b0000101, 0b0010001, 0b0001001, 0b0010111];
        let par = [0u8, 0b001011, 0b001101, 0b001110, 0b010011, 0b011001, 0b011100, 0b010101, 0b010110, 0b011010];
        let d: Vec<usize> = code.bytes().map(|b| (b - b'0') as usize).collect();
        let mut bits = vec![1, 0, 1];
        for i in 1..7 {
            let use_g = par[d[0]] >> (6 - i) & 1 == 1;
            let p = if use_g { g[d[i]] } else { l[d[i]] };
            for k in (0..7).rev() {
                bits.push(p >> k & 1);
            }
        }
        bits.extend([0, 1, 0, 1, 0]);
        for i in 7..13 {
            for k in (0..7).rev() {
                bits.push((!l[d[i]] & 0x7f) >> k & 1);
            }
        }
        bits.extend([1, 0, 1]);
        let (m, q) = (4u32, 40u32);
        let w = bits.len() as u32 * m + 2 * q;
        let img = image::GrayImage::from_fn(w, 160, |x, _| {
            let i = (x as i64 - q as i64) / m as i64;
            image::Luma([if i >= 0 && (i as usize) < bits.len() && bits[i as usize] == 1 { 0 } else { 255 }])
        });
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageLuma8(img).write_to(&mut png, image::ImageFormat::Png).unwrap();
        assert_eq!(decode_photo(png.get_ref()).unwrap(), code);
        assert!(decode_photo(b"kein bild").is_err());
    }
}
