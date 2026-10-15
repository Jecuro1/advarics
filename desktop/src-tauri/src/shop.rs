//! Digitales Schaufenster: öffentliche Seite unter /shop am eingebauten Server. Zeigt das Sortiment mit
//! Bildern, Preisen (inkl. laufender Preisaktionen) und Verfügbarkeit; Kund:innen können Ware zur Abholung
//! reservieren („Click & Reserve“) – die Anfrage landet als Reservierung (Status „angefragt“) in Kontor.
//! Die Webshop-Kategorien (Tabelle „webkategorie“, Zuordnung durch die Warengruppe) entscheiden mit, welche Artikel
//! erscheinen (`WebKat`); dieselbe Auskunft nutzt die REST-Schnittstelle (api.rs) – es gibt nur eine Wahrheit.

use crate::{catalog, db, images, promotions, vorgang};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap};
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

/* ── Webshop-Kategorien ── */

/// Eine Webshop-Kategorie, wie der Shop sie zeigt (aktiv und sichtbar)
#[derive(Clone, Debug)]
pub struct WebKategorie {
    pub id: String,
    pub name: String,
}

impl WebKategorie {
    pub fn json(&self) -> Value {
        json!({ "id": self.id, "name": self.name })
    }
}

/// Zuordnung Warengruppe → Webshop-Kategorien, einmal je Anfrage aus den Stammdaten gelesen.
/// Die Kategorien einer Warengruppe sind die Vereinigung aus `webkat1`–`webkat5` ihrer Zeile (Stammdaten-Art „warengruppe“)
/// und allen Kategorien, deren frühere Liste „warengruppen“ sie enthält – entdoppelt, in der Reihenfolge der Tabelle;
/// unbekannte und leere Kennungen zählen nicht.
pub struct WebKat {
    /// Aktive, sichtbare Kategorien in der Reihenfolge der Tabelle
    pub liste: Vec<WebKategorie>,
    /// Warengruppe → Stellen in `liste` (aufsteigend); nur Warengruppen mit mindestens einer gezeigten Kategorie
    nach_wg: HashMap<String, Vec<usize>>,
    /// Gibt es mindestens eine aktive, sichtbare Kategorie mit Warengruppen? Nein → nichts wird ausgeblendet, alles wie bisher
    pub zugeordnet: bool,
}

pub fn webkat_laden(c: &Connection) -> Result<WebKat, String> {
    let tab = crate::stamm::list(c, "webkategorie")?;
    let stelle: HashMap<&str, usize> = tab.iter().enumerate().filter_map(|(i, r)| r["id"].as_str().map(|id| (id, i))).collect();
    let mut zu: HashMap<String, BTreeSet<usize>> = HashMap::new();
    // frühere Mehrfachzuordnung in der Kategorie
    for (i, r) in tab.iter().enumerate() {
        for wg in r["warengruppen"].as_array().into_iter().flatten().filter_map(Value::as_str).map(str::trim).filter(|w| !w.is_empty()) {
            zu.entry(wg.to_string()).or_default().insert(i);
        }
    }
    // Zuordnung in der Warengruppe: nur Zeilen lesen, die überhaupt webkat-Felder tragen (es gibt über 10.000 Warengruppen)
    {
        let mut st = c.prepare("SELECT id, data FROM stamm WHERE kind = 'warengruppe' AND instr(data, 'webkat') > 0").map_err(|e| e.to_string())?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
        for row in rows {
            let (id, data) = row.map_err(|e| e.to_string())?;
            let Ok(d) = serde_json::from_str::<Value>(&data) else { continue };
            for k in 1..=5 {
                if let Some(&i) = d[format!("webkat{k}").as_str()].as_str().and_then(|v| stelle.get(v.trim())) {
                    zu.entry(id.clone()).or_default().insert(i);
                }
            }
        }
    }
    let mut liste = vec![];
    let mut in_liste: HashMap<usize, usize> = HashMap::new();
    for (i, r) in tab.iter().enumerate() {
        if r["_aktiv"].as_bool() == Some(false) || r["sichtbar"].as_bool() != Some(true) {
            continue;
        }
        let id = r["id"].as_str().unwrap_or("").to_string();
        let name = r["name"].as_str().map(str::trim).filter(|n| !n.is_empty()).unwrap_or(&id).to_string();
        in_liste.insert(i, liste.len());
        liste.push(WebKategorie { id, name });
    }
    let nach_wg: HashMap<String, Vec<usize>> = zu
        .iter()
        .filter_map(|(wg, s)| {
            let v: Vec<usize> = s.iter().filter_map(|i| in_liste.get(i).copied()).collect();
            (!v.is_empty()).then(|| (wg.clone(), v))
        })
        .collect();
    // Der Filter gilt erst, wenn mindestens eine aktive, SICHTBARE Kategorie Warengruppen hat: alte Zeilen ohne „sichtbar“ (bisher wirkungslos) und Zuordnungen nur zu
    // unsichtbaren Kategorien schalten ihn nicht ein – sonst verschwänden beim Update still alle Artikel
    let zugeordnet = !nach_wg.is_empty();
    Ok(WebKat { liste, nach_wg, zugeordnet })
}

impl WebKat {
    /// Webshop-Kategorien eines Artikels (aktiv und sichtbar, in der Reihenfolge der Tabelle)
    pub fn kategorien(&self, a: &catalog::Article) -> Vec<&WebKategorie> {
        self.nach_wg.get(&a.category).map(|v| v.iter().map(|&i| &self.liste[i]).collect()).unwrap_or_default()
    }

    /// `[{id, name}]` der Kategorien eines Artikels – für Schaufenster und Schnittstelle
    pub fn kategorien_json(&self, a: &catalog::Article) -> Vec<Value> {
        self.kategorien(a).iter().map(|k| k.json()).collect()
    }

    /// Ist der Artikel im Shop sichtbar? Solange keine aktive, sichtbare Webshop-Kategorie Warengruppen enthält: ja (bestehende Installationen bleiben unverändert);
    /// sonst nur, wenn seine Warengruppe in mindestens einer aktiven, sichtbaren Webshop-Kategorie liegt.
    pub fn sichtbar(&self, a: &catalog::Article) -> bool {
        !self.zugeordnet || self.nach_wg.contains_key(&a.category)
    }

    /// Anzahl aktiver Artikel je Kategorie in `liste` (gleiche Reihenfolge)
    pub fn artikelzahlen(&self, c: &Connection) -> Result<Vec<i64>, String> {
        let mut n = vec![0i64; self.liste.len()];
        let mut st = c.prepare("SELECT category, COUNT(*) FROM articles WHERE active = 1 GROUP BY category").map_err(|e| e.to_string())?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))).map_err(|e| e.to_string())?;
        for row in rows {
            let (kat, anzahl) = row.map_err(|e| e.to_string())?;
            for &i in self.nach_wg.get(&kat).into_iter().flatten() {
                n[i] += anzahl;
            }
        }
        Ok(n)
    }
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
    // Webshop-Kategorien: gibt es Zuordnungen, erscheinen nur Artikel in mindestens einer aktiven, sichtbaren Kategorie (zusätzlich zu den Einstellungen)
    let wk = webkat_laden(c)?;
    let mut out = vec![];
    for a in list.iter().filter(|a| a.active && (cats.is_empty() || cats.contains(&a.category)) && !hidden.contains(&a.id) && wk.sichtbar(a)) {
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
            "tag": a.tag, "beliebt": a.popularity, "felder": a.fields, "varianten": vars, "webkategorien": wk.kategorien_json(a),
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
            // Navigation: die Webshop-Kategorien in der Reihenfolge der Tabelle; ohne jede Zuordnung leer (dann gelten die Warengruppen)
            v["webkategorien"] = match webkat_laden(c) {
                Ok(wk) if wk.zugeordnet => json!(wk.liste.iter().map(WebKategorie::json).collect::<Vec<_>>()),
                _ => json!([]),
            };
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

    fn stamm_zeile(c: &Connection, kind: &str, id: &str, pos: i64, aktiv: bool, d: Value) {
        c.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES (?1,?2,?3,?4,?5,'t')", rusqlite::params![kind, id, d.to_string(), pos, aktiv as i64]).unwrap();
    }
    fn wk_artikel(c: &Connection, id: &str, kat: &str, ean: &str) {
        c.execute("INSERT INTO articles(id, name, category, price, created_at, updated_at) VALUES (?1,?1,?2,1000,'x','x')", rusqlite::params![id, kat]).unwrap();
        c.execute("INSERT INTO variants(article_id, color, size, ean, stock) VALUES (?1,'moos','M',?2, 5)", rusqlite::params![id, ean]).unwrap();
    }
    fn sichtbare(c: &Connection) -> Vec<String> {
        let mut v: Vec<String> = articles(c).unwrap().iter().map(|x| x["id"].as_str().unwrap().to_string()).collect();
        v.sort();
        v
    }
    fn kat_namen(c: &Connection, id: &str) -> Vec<String> {
        articles(c).unwrap().iter().find(|x| x["id"] == id).map(|x| x["webkategorien"].as_array().unwrap().iter().map(|k| k["name"].as_str().unwrap().to_string()).collect()).unwrap_or_default()
    }

    #[test]
    fn nur_alte_oder_unsichtbare_zuordnungen_schalten_den_filter_nicht_ein() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        wk_artikel(&c, "A1", "adv-1", "2000000000015");
        wk_artikel(&c, "A2", "adv-2", "2000000000022");
        // aus 0.45: Kategorie nur mit der alten Liste, „sichtbar“ nie gesetzt (damals ohne Wirkung)
        stamm_zeile(&c, "webkategorie", "W1", 0, true, json!({ "name": "Ski", "warengruppen": ["adv-1"] }));
        // Zuordnung in der Warengruppe, aber nur zu einer unsichtbaren Kategorie
        stamm_zeile(&c, "webkategorie", "W2", 1, true, json!({ "name": "Intern", "sichtbar": false }));
        stamm_zeile(&c, "warengruppe", "adv-2", 1, true, json!({ "name": "Hosen", "webkat1": "W2" }));
        assert!(!webkat_laden(&c).unwrap().zugeordnet);
        assert_eq!(sichtbare(&c), vec!["A1", "A2"], "beim Update verschwindet kein Artikel");
        // sobald eine sichtbare Kategorie Warengruppen hat, gilt der Filter – die Gruppe in der unsichtbaren Kategorie ist dann ausgeblendet
        c.execute("UPDATE stamm SET data = ?1 WHERE kind = 'webkategorie' AND id = 'W1'", [json!({ "name": "Ski", "sichtbar": true, "warengruppen": ["adv-1"] }).to_string()]).unwrap();
        assert_eq!(sichtbare(&c), vec!["A1"]);
    }

    #[test]
    fn webkategorien_ohne_zuordnung_aendern_nichts() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        wk_artikel(&c, "A1", "adv-1", "2000000000015");
        wk_artikel(&c, "A2", "adv-2", "2000000000022");
        assert!(!webkat_laden(&c).unwrap().zugeordnet);
        assert_eq!(sichtbare(&c), vec!["A1", "A2"]);
        // Kategorien ohne jede Zuordnung (auch unsichtbare) und Warengruppen mit leeren oder unbekannten Kennungen: weiterhin alles sichtbar
        stamm_zeile(&c, "webkategorie", "W1", 0, true, json!({ "name": "Ski", "sichtbar": true, "warengruppen": [] }));
        stamm_zeile(&c, "webkategorie", "W2", 1, true, json!({ "name": "Intern", "sichtbar": false }));
        stamm_zeile(&c, "warengruppe", "adv-1", 0, true, json!({ "nr": "1", "name": "Jacken", "webkat1": "", "webkat2": "X9" }));
        stamm_zeile(&c, "warengruppe", "adv-2", 1, true, json!({ "nr": "2", "name": "Hosen" }));
        // wie im Echtbetrieb: über 11.000 Warengruppen ohne Web-Felder werden nicht gelesen und stören nicht
        let tx = c.unchecked_transaction().unwrap();
        for i in 100..11_950 {
            tx.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES ('warengruppe', ?1, ?2, ?3, 1, 't')", rusqlite::params![format!("adv-{i}"), json!({ "nr": i.to_string(), "name": format!("Gruppe {i}"), "ust": 20 }).to_string(), i]).unwrap();
        }
        tx.commit().unwrap();
        let wk = webkat_laden(&c).unwrap();
        assert!(!wk.zugeordnet, "unbekannte und leere Kennungen sind keine Zuordnung");
        assert_eq!(sichtbare(&c), vec!["A1", "A2"]);
        assert!(kat_namen(&c, "A1").is_empty());
        assert_eq!(wk.liste.iter().map(|k| k.id.as_str()).collect::<Vec<_>>(), vec!["W1"], "nur aktive, sichtbare Kategorien");
    }

    #[test]
    fn webkategorien_sichtbarkeit_reihenfolge_und_alte_listen() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        stamm_zeile(&c, "webkategorie", "W1", 0, true, json!({ "name": "Ski", "sichtbar": true, "warengruppen": [] }));
        stamm_zeile(&c, "webkategorie", "W2", 1, true, json!({ "name": "Schuhe", "sichtbar": true }));
        stamm_zeile(&c, "webkategorie", "W3", 2, true, json!({ "name": "Intern", "sichtbar": false }));
        stamm_zeile(&c, "webkategorie", "W4", 3, false, json!({ "name": "Alt", "sichtbar": true }));
        stamm_zeile(&c, "webkategorie", "W5", 4, true, json!({ "name": "Outlet", "sichtbar": true, "warengruppen": ["adv-4", "adv-1", " ", ""] }));
        stamm_zeile(&c, "webkategorie", "W6", 5, true, json!({ "name": "Neu" }));   // frisch angelegt: „sichtbar“ ist nicht gesetzt = unsichtbar
        // adv-1: Reihenfolge der Tabelle (nicht der Felder), doppelte und unbekannte Kennungen zählen nicht, dazu die frühere Liste von W5
        stamm_zeile(&c, "warengruppe", "adv-1", 0, true, json!({ "name": "Jacken", "webkat1": "W2", "webkat2": "W1", "webkat3": "W1", "webkat4": "X9", "webkat5": "" }));
        stamm_zeile(&c, "warengruppe", "adv-2", 1, true, json!({ "name": "Intern", "webkat1": "W3", "webkat2": "W6" }));   // nur unsichtbare Kategorien
        stamm_zeile(&c, "warengruppe", "adv-3", 2, true, json!({ "name": "Ohne" }));
        stamm_zeile(&c, "warengruppe", "adv-4", 3, true, json!({ "name": "Nur alte Liste" }));
        stamm_zeile(&c, "warengruppe", "adv-5", 4, true, json!({ "name": "Inaktive Kategorie", "webkat1": "W4" }));
        c.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES ('warengruppe','adv-6','{kaputt webkat',5,1,'t')", []).unwrap();
        for (i, k) in ["adv-1", "adv-2", "adv-3", "adv-4", "adv-5", "adv-6", "adv-7"].iter().enumerate() {
            wk_artikel(&c, &format!("A{}", i + 1), k, &format!("200000000010{i}"));
        }
        let wk = webkat_laden(&c).unwrap();
        assert!(wk.zugeordnet);
        assert_eq!(sichtbare(&c), vec!["A1", "A4"], "nur Artikel in mindestens einer aktiven, sichtbaren Kategorie");
        assert_eq!(kat_namen(&c, "A1"), vec!["Ski", "Schuhe", "Outlet"]);
        assert_eq!(kat_namen(&c, "A4"), vec!["Outlet"]);
        assert_eq!(wk.artikelzahlen(&c).unwrap(), vec![1, 1, 2], "Artikelzahl je Kategorie: Ski, Schuhe, Outlet");
        // die bestehenden Einstellungen gelten zusätzlich (UND)
        db::setting_set(&c, "shop.kategorien", &json!(["adv-4", "adv-2"])).unwrap();
        assert_eq!(sichtbare(&c), vec!["A4"]);
        db::setting_set(&c, "shop.ausgeblendet", &json!(["A4"])).unwrap();
        assert!(sichtbare(&c).is_empty());
        db::setting_set(&c, "shop.kategorien", &json!([])).unwrap();
        db::setting_set(&c, "shop.ausgeblendet", &json!([])).unwrap();
        // Reservieren: ein Artikel ohne sichtbare Kategorie ist „nicht (mehr) im Schaufenster“
        let nein = reserve(&c, &json!({ "name": "Eva Muster", "email": "eva@example.at", "artikel": [{ "ean": "2000000000101" }] }), "9.9.9.9").unwrap_err();
        assert_eq!(nein.0, 400);
        assert!(reserve(&c, &json!({ "name": "Eva Muster", "email": "eva@example.at", "artikel": [{ "ean": "2000000000100" }] }), "9.9.9.9").is_ok());
        // Kategorie deaktivieren: ihre Artikel verschwinden, die Zuordnungen bleiben bestehen (die übrigen Kategorien gelten weiter)
        c.execute("UPDATE stamm SET active = 0 WHERE kind = 'webkategorie' AND id = 'W5'", []).unwrap();
        assert_eq!(sichtbare(&c), vec!["A1"]);
        assert_eq!(kat_namen(&c, "A1"), vec!["Ski", "Schuhe"]);
        // sichtbar einschalten
        c.execute("UPDATE stamm SET data = ?1 WHERE kind = 'webkategorie' AND id = 'W3'", [json!({ "name": "Intern", "sichtbar": true }).to_string()]).unwrap();
        assert_eq!(sichtbare(&c), vec!["A1", "A2"]);
    }
}
