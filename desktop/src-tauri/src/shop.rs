//! Digitales Schaufenster: öffentliche Seite unter /shop am eingebauten Server. Zeigt das Sortiment mit
//! Bildern, Preisen (inkl. laufender Preisaktionen) und Verfügbarkeit; Kund:innen können Ware zur Abholung
//! reservieren („Click & Reserve“) – die Anfrage landet als Reservierung (Status „angefragt“) in Kontor.

use crate::{catalog, db, images, promotions, vorgang};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tiny_http::{Header, Method, Request, Response};

const PAGE: &str = include_str!("shop.html");

fn cfg(c: &Connection, k: &str) -> Value {
    db::setting_get(c, k).unwrap_or(Value::Null)
}
fn cfg_s(c: &Connection, k: &str) -> String {
    cfg(c, k).as_str().unwrap_or("").to_string()
}

fn reply(req: Request, code: u16, v: Value) {
    let r = Response::from_string(v.to_string())
        .with_status_code(code)
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap())
        .with_header(Header::from_bytes(&b"Cache-Control"[..], &b"no-store"[..]).unwrap());
    let _ = req.respond(r);
}

fn file(req: Request, path: &Path) {
    match std::fs::read(path) {
        Ok(b) => {
            let ct: &[u8] = if path.extension().is_some_and(|e| e == "png") { b"image/png" } else { b"image/jpeg" };
            let _ = req.respond(Response::from_data(b).with_header(Header::from_bytes(&b"Content-Type"[..], ct).unwrap()).with_header(Header::from_bytes(&b"Cache-Control"[..], &b"max-age=300"[..]).unwrap()));
        }
        Err(_) => {
            let _ = req.respond(Response::empty(404));
        }
    }
}

/// Höchster gültiger Aktionsrabatt (%) je Artikel
fn promo_pct(promos: &[promotions::Promotion], a: &catalog::Article, today: &str) -> i64 {
    promos
        .iter()
        .filter(|p| p.active && p.from_date.as_str() <= today && today <= p.to_date.as_str())
        .filter(|p| match p.scope.as_str() {
            "alle" => true,
            "warengruppe" => p.scope_values.contains(&a.category),
            "marke" => p.scope_values.contains(&a.brand),
            "artikel" => p.scope_values.contains(&a.id),
            _ => false,
        })
        .map(|p| p.pct)
        .max()
        .unwrap_or(0)
}

pub fn articles(c: &Connection) -> Result<Vec<Value>, String> {
    let list = catalog::list(c).map_err(|e| e.to_string())?;
    let promos = promotions::list(c).map_err(|e| e.to_string())?;
    let reserved = vorgang::reserved(c)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let cats: Vec<String> = cfg(c, "shop.kategorien").as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default();
    let hidden: Vec<String> = cfg(c, "shop.ausgeblendet").as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default();
    let modus = cfg_s(c, "shop.bestand");
    let nur_lager = cfg(c, "shop.nur_lagernd").as_bool().unwrap_or(false);
    // Herstellerangaben (GPSR) je Marke; optional nur Artikel mit vollständigen Angaben zeigen
    let hersteller = crate::marke::hersteller_json(c);
    let nur_gpsr = cfg(c, "shop.gpsr_ausblenden").as_bool().unwrap_or(false);
    let mut out = vec![];
    for a in list.iter().filter(|a| a.active && (cats.is_empty() || cats.contains(&a.category)) && !hidden.contains(&a.id)) {
        let her = hersteller.get(&crate::marke::norm(&a.brand));
        if nur_gpsr && her.map(|h| h["gpsr_vollstaendig"] != true).unwrap_or(true) {
            continue;
        }
        let base = a.sale_price.unwrap_or(a.price);
        let pct = promo_pct(&promos, a, &today);
        let promo = if pct > 0 { (a.price as f64 * (100 - pct) as f64 / 100.0).round() as i64 } else { i64::MAX };
        let price = base.min(promo);
        let vars: Vec<Value> = a
            .variants
            .iter()
            .map(|v| {
                let free = (v.stock - reserved.get(&v.ean).copied().unwrap_or(0)).max(0);
                let shown = match modus.as_str() {
                    "genau" => json!(free),
                    "aus" => json!(free > 0),
                    _ => json!(if free == 0 { "aus" } else if free <= 2 { "wenig" } else { "da" }),
                };
                json!({ "ean": v.ean, "farbe": v.color, "groesse": v.size, "frei": free > 0, "bestand": shown })
            })
            .collect();
        if nur_lager && !vars.iter().any(|v| v["frei"] == true) {
            continue;
        }
        out.push(json!({ "id": a.id, "name": a.name, "marke": a.brand, "kategorie": a.category, "glyph": a.glyph, "farben": a.colors, "groessen": a.sizes,
            "preis": price, "statt": if price < a.price { Some(a.price) } else { None }, "aktion": pct > 0 && promo <= base, "bild": a.image.is_some(),
            "tag": a.tag, "beliebt": a.popularity, "felder": a.fields, "varianten": vars,
            "galerie": a.media.iter().filter(|m| m["file"].is_string()).map(|m| json!({ "id": m["id"], "farbe": m["color"] })).collect::<Vec<_>>(),
            "kurztext": a.details["kurztext"], "beschreibung": a.details["beschreibung"], "merkmale": a.details["features"], "material": a.details["mat_zusammensetzung"], "pflege": a.details["pflege"],
            "hersteller": her }));
    }
    out.sort_by(|a, b| b["beliebt"].as_i64().cmp(&a["beliebt"].as_i64()));
    Ok(out)
}

fn limiter() -> &'static Mutex<HashMap<String, Vec<Instant>>> {
    static L: OnceLock<Mutex<HashMap<String, Vec<Instant>>>> = OnceLock::new();
    L.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Reservierungsanfrage aus dem Schaufenster prüfen und als Vorgang anlegen.
pub fn reserve(c: &Connection, b: &Value, ip: &str) -> Result<Value, (u16, String)> {
    if !cfg(c, "shop.reservieren").as_bool().unwrap_or(true) {
        return Err((403, "Reservierungen sind derzeit nicht möglich".into()));
    }
    {
        let mut m = limiter().lock().unwrap();
        let e = m.entry(ip.to_string()).or_default();
        e.retain(|t| t.elapsed() < Duration::from_secs(600));
        if e.len() >= 5 {
            return Err((429, "Zu viele Anfragen – bitte später erneut versuchen".into()));
        }
        e.push(Instant::now());
    }
    let s = |k: &str| b[k].as_str().unwrap_or("").trim().chars().take(200).collect::<String>();
    let (name, email, tel) = (s("name"), s("email"), s("telefon"));
    if name.chars().count() < 2 {
        return Err((400, "Bitte Namen angeben".into()));
    }
    if !email.contains('@') && tel.chars().filter(|c| c.is_ascii_digit()).count() < 6 {
        return Err((400, "Bitte E-Mail-Adresse oder Telefonnummer angeben".into()));
    }
    let items = b["artikel"].as_array().cloned().unwrap_or_default();
    if items.is_empty() || items.len() > 10 {
        return Err((400, "1 bis 10 Artikel je Reservierung".into()));
    }
    let arts = articles(c).map_err(|e| (500, e))?;
    let mut lines = vec![];
    for it in &items {
        let ean = it["ean"].as_str().unwrap_or("");
        let qty = it["menge"].as_i64().unwrap_or(1).clamp(1, 5);
        let hit = arts.iter().find_map(|a| a["varianten"].as_array().and_then(|vs| vs.iter().find(|v| v["ean"] == ean)).map(|v| (a, v)));
        let Some((a, v)) = hit else { return Err((400, "Artikel nicht (mehr) im Schaufenster".into())) };
        if v["frei"] != true {
            return Err((409, format!("{} ({} / {}) ist leider nicht mehr verfügbar", a["name"].as_str().unwrap_or(""), v["farbe"].as_str().unwrap_or(""), v["groesse"].as_str().unwrap_or(""))));
        }
        lines.push(json!({ "ean": ean, "sku": a["id"], "name": format!("{} · {} · {}", a["name"].as_str().unwrap_or(""), v["farbe"].as_str().unwrap_or(""), v["groesse"].as_str().unwrap_or("")), "qty": qty, "price": a["preis"] }));
    }
    let tage = cfg(c, "shop.abholtage").as_i64().unwrap_or(3).clamp(1, 30);
    let bis = (chrono::Local::now() + chrono::Duration::days(tage)).format("%Y-%m-%d").to_string();
    let tx = c.unchecked_transaction().map_err(|e| (500, e.to_string()))?;
    let d = vorgang::save(&tx, &json!({ "kind": "reservierung", "status": "angefragt", "partner_name": name, "due": bis,
        "data": { "lines": lines, "quelle": "Schaufenster", "kontakt": { "email": email, "telefon": tel }, "nachricht": s("nachricht"), "ip": ip } }), "Schaufenster").map_err(|e| (400, e))?;
    tx.commit().map_err(|e| (500, e.to_string()))?;
    Ok(json!({ "nr": d["no"], "abholen_bis": bis }))
}

pub fn handle(c: &Connection, db_path: &Path, mut req: Request, path: &str) {
    if !cfg(c, "shop.aktiv").as_bool().unwrap_or(false) {
        let _ = req.respond(Response::from_string("Schaufenster ist nicht aktiv").with_status_code(404));
        return;
    }
    let data_dir = db_path.parent().map(Path::to_path_buf).unwrap_or_default();
    let method = req.method().clone();
    match (method, path) {
        (Method::Get, "/shop") | (Method::Get, "/shop/index.html") => {
            let r = Response::from_string(PAGE).with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
            let _ = req.respond(r);
        }
        (Method::Get, "/shop/api/info") => {
            let keys = ["titel", "text", "farbe", "oeffnung", "kontakt", "hinweis", "bestand", "abholtage"];
            let mut v = json!({ "firma": cfg_s(c, "firma.name"), "adresse": cfg_s(c, "firma.adresse"), "reservieren": cfg(c, "shop.reservieren").as_bool().unwrap_or(true),
                "preise": cfg(c, "shop.preise").as_bool().unwrap_or(true), "meta": cfg(c, "shop.meta"), "logo": !cfg_s(c, "bon.logo").is_empty() });
            for k in keys {
                v[k] = cfg(c, &format!("shop.{k}"));
            }
            reply(req, 200, v)
        }
        (Method::Get, "/shop/api/artikel") => match articles(c) {
            Ok(mut l) => {
                if !cfg(c, "shop.preise").as_bool().unwrap_or(true) {
                    l.iter_mut().for_each(|a| { a["preis"] = Value::Null; a["statt"] = Value::Null; });
                }
                reply(req, 200, json!(l))
            }
            Err(e) => reply(req, 500, json!({ "fehler": e })),
        },
        (Method::Get, "/shop/logo") => {
            let l = cfg_s(c, "bon.logo");
            file(req, &images::dir(&data_dir).join(l));
        }
        (Method::Get, p) if p.starts_with("/shop/bild/") => {
            let rest = &p["/shop/bild/".len()..];
            let (id, mid) = match rest.split_once('/') { Some((a, m)) => (a, m.parse::<i64>().ok()), None => (rest, None) };
            let img: Option<String> = match mid {
                Some(m) => c.query_row("SELECT m.file FROM article_media m JOIN articles a ON a.id = m.article_id WHERE a.id = ?1 AND a.active = 1 AND m.id = ?2", rusqlite::params![id, m], |r| r.get(0)).ok().flatten(),
                None => c.query_row("SELECT image FROM articles WHERE id = ?1 AND active = 1", [id], |r| r.get(0)).ok().flatten(),
            };
            match img.filter(|i| !i.contains("..") && !i.contains('/') && !i.contains('\\')) {
                Some(i) => file(req, &images::dir(&data_dir).join(i)),
                None => {
                    let _ = req.respond(Response::empty(404));
                }
            }
        }
        (Method::Post, "/shop/api/reservieren") => {
            let ip = req.remote_addr().map(|a| a.ip().to_string()).unwrap_or_default();
            let mut body = String::new();
            let _ = std::io::Read::read_to_string(&mut std::io::Read::take(req.as_reader(), 64 * 1024), &mut body);
            let b: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
            match reserve(c, &b, &ip) {
                Ok(v) => reply(req, 200, v),
                Err((code, e)) => reply(req, code, json!({ "fehler": e })),
            }
        }
        _ => {
            let _ = req.respond(Response::empty(404));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schaufenster_reservierung() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        c.execute("INSERT INTO articles(id, name, category, price, created_at, updated_at) VALUES ('A1','Jacke','jacken',10000,'x','x')", []).unwrap();
        c.execute("INSERT INTO variants(article_id, color, size, ean, stock) VALUES ('A1','moos','M','2000000000015', 1)", []).unwrap();
        c.execute("INSERT INTO promotions(name, pct, scope, scope_values, from_date, to_date, active, created_at, updated_at) VALUES ('Herbst', 20, 'warengruppe', '[\"jacken\"]', '2000-01-01', '2999-12-31', 1, 'x', 'x')", []).unwrap();
        let a = articles(&c).unwrap();
        assert_eq!(a[0]["preis"], 8000);
        assert_eq!(a[0]["statt"], 10000);
        assert_eq!(a[0]["varianten"][0]["bestand"], "wenig");
        assert!(reserve(&c, &json!({ "name": "X", "artikel": [] }), "1").is_err());
        let r = reserve(&c, &json!({ "name": "Eva Muster", "email": "eva@example.at", "artikel": [{ "ean": "2000000000015", "menge": 1 }] }), "1.2.3.4").unwrap();
        assert!(r["nr"].as_str().unwrap().starts_with("RS-"));
        // reserviert → nicht mehr verfügbar
        assert_eq!(articles(&c).unwrap()[0]["varianten"][0]["frei"], false);
        assert_eq!(reserve(&c, &json!({ "name": "Max", "telefon": "0664 1234567", "artikel": [{ "ean": "2000000000015" }] }), "1.2.3.4").unwrap_err().0, 409);
        let d = vorgang::list(&c, &["reservierung".into()], None, 10).unwrap();
        assert_eq!(d[0]["status"], "angefragt");
    }

    #[test]
    fn herstellerangaben_im_schaufenster() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        c.execute("INSERT INTO articles(id, name, brand, category, price, created_at, updated_at) VALUES ('A1','Jacke','Firn®','jacken',10000,'x','x')", []).unwrap();
        c.execute("INSERT INTO articles(id, name, brand, category, price, created_at, updated_at) VALUES ('A2','Mütze','Nordwand','jacken',2000,'x','x')", []).unwrap();
        c.execute("INSERT INTO articles(id, name, brand, category, price, created_at, updated_at) VALUES ('A3','Socken','','jacken',500,'x','x')", []).unwrap();
        for (i, a) in ["A1", "A2", "A3"].iter().enumerate() {
            c.execute("INSERT INTO variants(article_id, color, size, ean, stock) VALUES (?1,'moos','M',?2, 5)", rusqlite::params![a, format!("200000000001{i}")]).unwrap();
        }
        let eu = json!({ "name": "Firn EU GmbH", "email": "eu@firn.de", "strasse": "Weg", "hausnr": "1", "plz": "80331", "ort": "München", "land": "DE" });
        let h = json!({ "name": "Firn Sports AG", "email": "gpsr@firn.ch", "strasse": "Bergstr.", "hausnr": "2", "plz": "8000", "ort": "Zürich", "land": "CH" });
        crate::marke::save(&c, &json!({ "name": "Firn", "hersteller": h, "eu": eu, "lieferant": "L-001" }), "T").unwrap();
        crate::marke::save(&c, &json!({ "name": "Nordwand", "hersteller": { "name": "Nordwand GmbH" } }), "T").unwrap();
        let a = articles(&c).unwrap();
        let firn = a.iter().find(|x| x["id"] == "A1").unwrap();
        assert_eq!(firn["hersteller"]["name"], "Firn Sports AG", "Marke mit ® wird über die Vergleichsform gefunden");
        assert_eq!(firn["hersteller"]["eu_verantwortlicher"]["anschrift"]["stadt"], "München");
        assert_eq!(firn["hersteller"]["gpsr_vollstaendig"], true);
        let t = firn.to_string();
        assert!(!t.contains("L-001"), "keine internen Angaben im öffentlichen Schaufenster");
        assert_eq!(a.iter().find(|x| x["id"] == "A2").unwrap()["hersteller"]["gpsr_vollstaendig"], false);
        assert!(a.iter().find(|x| x["id"] == "A3").unwrap()["hersteller"].is_null(), "Artikel ohne Marke: keine Angaben");
        assert_eq!(a.len(), 3, "ohne Schalter bleiben alle Artikel sichtbar");
        // Schalter: nur Artikel mit vollständigen Angaben
        db::setting_set(&c, "shop.gpsr_ausblenden", &json!(true)).unwrap();
        let a = articles(&c).unwrap();
        assert_eq!(a.iter().map(|x| x["id"].as_str().unwrap()).collect::<Vec<_>>(), vec!["A1"]);
    }
}
