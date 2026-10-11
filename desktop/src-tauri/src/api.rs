//! Lokale REST-API (HTTP, JSON) für Integrationen: Webshop, ERP, eigene Programme.
//! Zugriff nur mit API-Schlüssel (Bearer) und Berechtigung „lesen“ bzw. „schreiben“.
//! Eigene Endpunkte = gespeicherte, schreibgeschützte Abfragen (SELECT), die als GET bereitstehen.

use crate::{catalog, custom, customers, db, sales};
use rand_core::{OsRng, RngCore};
use rusqlite::{params, types::ValueRef, Connection, OpenFlags, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tiny_http::{Header, Method, Request, Response, Server};

pub const VERSION: &str = "v1";

/* ── Schlüssel ── */

fn hash(k: &str) -> String {
    Sha256::digest(k.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn key_create(c: &Connection, name: &str, scopes: &[String]) -> Result<String, String> {
    if name.trim().is_empty() {
        return Err("Name fehlt".into());
    }
    let sc: Vec<&String> = scopes.iter().filter(|s| ["lesen", "schreiben"].contains(&s.as_str())).collect();
    if sc.is_empty() {
        return Err("Mindestens eine Berechtigung".into());
    }
    let mut b = [0u8; 20];
    OsRng.fill_bytes(&mut b);
    let key = format!("ktr_{}", b.iter().map(|x| format!("{x:02x}")).collect::<String>());
    c.execute(
        "INSERT INTO api_keys(name, key_hash, prefix, scopes, active, created_at) VALUES (?1,?2,?3,?4,1,?5)",
        params![name.trim(), hash(&key), &key[..12], serde_json::to_string(&sc).unwrap(), db::now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(key)
}

pub fn keys(c: &Connection) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare("SELECT id, name, prefix, scopes, active, created_at, last_used FROM api_keys ORDER BY id DESC")?;
    let rows = st.query_map([], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?, "prefix": r.get::<_, String>(2)?, "scopes": serde_json::from_str::<Value>(&r.get::<_, String>(3)?).unwrap_or(json!([])),
            "active": r.get::<_, i64>(4)? != 0, "created_at": r.get::<_, String>(5)?, "last_used": r.get::<_, Option<String>>(6)? }))
    })?;
    rows.collect()
}

pub fn key_revoke(c: &Connection, id: i64) -> Result<(), String> {
    c.execute("UPDATE api_keys SET active = 0 WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

fn auth(c: &Connection, header: Option<&str>) -> Option<Vec<String>> {
    let k = header?.strip_prefix("Bearer ")?.trim();
    let (id, scopes): (i64, String) = c.query_row("SELECT id, scopes FROM api_keys WHERE key_hash = ?1 AND active = 1", [hash(k)], |r| Ok((r.get(0)?, r.get(1)?))).optional().ok()??;
    let _ = c.execute("UPDATE api_keys SET last_used = ?2 WHERE id = ?1", params![id, db::now()]);
    serde_json::from_str(&scopes).ok()
}

/* ── Eigene Endpunkte ── */

pub fn check_sql(sql: &str) -> Result<String, String> {
    let s = sql.trim().trim_end_matches(';').trim();
    let low = s.to_lowercase();
    if !(low.starts_with("select") || low.starts_with("with")) {
        return Err("Nur Abfragen (SELECT) sind erlaubt".into());
    }
    if s.contains(';') {
        return Err("Nur eine einzelne Abfrage".into());
    }
    Ok(s.to_string())
}

pub fn endpoints(c: &Connection) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare("SELECT id, slug, title, sql, params, active FROM api_endpoints ORDER BY slug")?;
    let rows = st.query_map([], |r| {
        Ok(json!({ "id": r.get::<_, i64>(0)?, "slug": r.get::<_, String>(1)?, "title": r.get::<_, String>(2)?, "sql": r.get::<_, String>(3)?,
            "params": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(json!([])), "active": r.get::<_, i64>(5)? != 0 }))
    })?;
    rows.collect()
}

pub fn endpoint_save(c: &Connection, id: Option<i64>, slug: &str, title: &str, sql: &str, active: bool) -> Result<i64, String> {
    let slug = custom::slug(slug).replace('_', "-");
    if slug.is_empty() {
        return Err("Name (Adresse) fehlt".into());
    }
    let sql = check_sql(sql)?;
    // Parameter :name aus der Abfrage lesen
    let mut ps: Vec<String> = vec![];
    let b = sql.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b':' && i + 1 < b.len() && (b[i + 1] as char).is_ascii_alphabetic() {
            let st = i + 1;
            let mut e = st;
            while e < b.len() && ((b[e] as char).is_ascii_alphanumeric() || b[e] == b'_') {
                e += 1;
            }
            let p = sql[st..e].to_string();
            if !ps.contains(&p) {
                ps.push(p);
            }
            i = e;
        } else {
            i += 1;
        }
    }
    // Probelauf (schreibgeschützt, ohne Ergebnis)
    {
        let ro = Connection::open_with_flags(c.path().ok_or("Datenbankpfad unbekannt")?, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())?;
        ro.prepare(&sql).map_err(|e| format!("Abfrage fehlerhaft: {e}"))?;
    }
    let pj = serde_json::to_string(&ps).unwrap();
    match id {
        Some(id) => {
            c.execute("UPDATE api_endpoints SET slug=?2, title=?3, sql=?4, params=?5, active=?6 WHERE id=?1", params![id, slug, title.trim(), sql, pj, active as i64]).map_err(|e| e.to_string())?;
            Ok(id)
        }
        None => {
            c.execute("INSERT INTO api_endpoints(slug, title, sql, params, active, created_at) VALUES (?1,?2,?3,?4,?5,?6)", params![slug, title.trim(), sql, pj, active as i64, db::now()])
                .map_err(|e| if e.to_string().contains("UNIQUE") { "Adresse bereits vergeben".to_string() } else { e.to_string() })?;
            Ok(c.last_insert_rowid())
        }
    }
}

pub fn run_query(db_path: &Path, sql: &str, args: &[(String, String)]) -> Result<Value, String> {
    let ro = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())?;
    let mut st = ro.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = st.column_names().iter().map(|s| s.to_string()).collect();
    for (k, v) in args {
        if let Ok(Some(i)) = st.parameter_index(&format!(":{k}")) {
            st.raw_bind_parameter(i, v).map_err(|e| e.to_string())?;
        }
    }
    let mut rows = st.raw_query();
    let mut out = vec![];
    while let Some(r) = rows.next().map_err(|e| e.to_string())? {
        let mut o = serde_json::Map::new();
        for (i, n) in names.iter().enumerate() {
            let v = match r.get_ref(i).map_err(|e| e.to_string())? {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(x) => json!(x),
                ValueRef::Real(x) => json!(x),
                ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
                ValueRef::Blob(_) => json!("(binär)"),
            };
            o.insert(n.clone(), v);
        }
        out.push(Value::Object(o));
        if out.len() >= 5000 {
            break;
        }
    }
    Ok(json!(out))
}

/* ── Server ── */

#[derive(Default)]
pub struct ApiState(pub Mutex<Option<(Arc<Server>, String)>>);

fn reply(req: Request, code: u16, body: Value) {
    let s = serde_json::to_string_pretty(&body).unwrap();
    let r = Response::from_string(s).with_status_code(code).with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap());
    let _ = req.respond(r);
}

fn query_args(url: &str) -> Vec<(String, String)> {
    url.split_once('?')
        .map(|(_, q)| url::form_urlencoded::parse(q.as_bytes()).map(|(k, v)| (k.into_owned(), v.into_owned())).collect())
        .unwrap_or_default()
}

pub fn openapi() -> Value {
    let p = |summary: &str, scope: &str| json!({ "summary": summary, "x-berechtigung": scope });
    json!({
        "openapi": "3.0.3",
        "info": { "title": "Kontor API", "version": VERSION, "description": "Lokale API von Kontor. Authentifizierung: Header „Authorization: Bearer <API-Schlüssel>“." },
        "paths": {
            "/api/v1/artikel": { "get": p("Artikel mit Varianten und Bestand (?q=, ?warengruppe=)", "lesen") },
            "/api/v1/artikel/{id}": { "get": p("Ein Artikel", "lesen") },
            "/api/v1/bestand": { "get": p("Bestand je Variante (?ean=)", "lesen") },
            "/api/v1/bestand/buchung": { "post": p("Bestand buchen: {ean, menge, art: zugang|abgang|inventur, grund}", "schreiben") },
            "/api/v1/kunden": { "get": p("Kunden (?q=)", "lesen"), "post": p("Kunde anlegen/ändern", "schreiben") },
            "/api/v1/kunden/{id}": { "get": p("Ein Kunde", "lesen") },
            "/api/v1/belege": { "get": p("Belege (?von=JJJJ-MM-TT&bis=JJJJ-MM-TT)", "lesen") },
            "/api/v1/belege/{nr}": { "get": p("Ein Beleg mit Retourenstand", "lesen") },
            "/api/v1/umsatz": { "get": p("Kennzahlen (?von=&bis=)", "lesen") },
            "/api/v1/objekte": { "get": p("Eigene Objekte", "lesen") },
            "/api/v1/objekte/{objekt}": { "get": p("Datensätze (?q=)", "lesen"), "post": p("Datensatz anlegen", "schreiben") },
            "/api/v1/objekte/{objekt}/{id}": { "get": p("Ein Datensatz", "lesen"), "put": p("Datensatz ändern", "schreiben") },
            "/api/v1/eigene/{adresse}": { "get": p("Eigener Endpunkt (gespeicherte Abfrage, Parameter als ?name=)", "lesen") }
        }
    })
}

fn handle(c: &Connection, db_path: &Path, mut req: Request) {
    let method = req.method().clone();
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("").trim_end_matches('/').to_string();
    let args = query_args(&url);
    let arg = |k: &str| args.iter().find(|(a, _)| a == k).map(|(_, v)| v.clone());
    if path == "/api/v1" || path == "/api/v1/openapi.json" {
        return reply(req, 200, if path.ends_with(".json") { openapi() } else { json!({ "name": "Kontor API", "version": VERSION, "doku": "/api/v1/openapi.json" }) });
    }
    let hdr = req.headers().iter().find(|h| h.field.equiv("Authorization")).map(|h| h.value.as_str().to_string());
    let Some(scopes) = auth(c, hdr.as_deref()) else { return reply(req, 401, json!({ "fehler": "API-Schlüssel fehlt oder ungültig" })) };
    let write = method != Method::Get;
    let need = if write { "schreiben" } else { "lesen" };
    if !scopes.iter().any(|s| s == need) {
        return reply(req, 403, json!({ "fehler": format!("Berechtigung „{need}“ fehlt") }));
    }
    let mut body = String::new();
    if write {
        let _ = std::io::Read::read_to_string(req.as_reader(), &mut body);
    }
    let bj: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
    let seg: Vec<&str> = path.trim_start_matches("/api/v1/").split('/').filter(|s| !s.is_empty()).collect();
    let res: Result<Value, (u16, String)> = (|| {
        let e500 = |e: String| (500u16, e);
        let e400 = |e: String| (400u16, e);
        match (method.clone(), seg.as_slice()) {
            (Method::Get, ["artikel"]) => {
                let q = arg("q").map(|s| s.to_lowercase());
                let cat = arg("warengruppe");
                let list = catalog::list(c).map_err(|e| e500(e.to_string()))?;
                Ok(json!(list
                    .into_iter()
                    .filter(|a| q.as_ref().map(|q| a.name.to_lowercase().contains(q) || a.id.to_lowercase() == *q || a.variants.iter().any(|v| v.ean == *q)).unwrap_or(true))
                    .filter(|a| cat.as_ref().map(|k| &a.category == k).unwrap_or(true))
                    .collect::<Vec<_>>()))
            }
            (Method::Get, ["artikel", id]) => catalog::list(c).map_err(|e| e500(e.to_string()))?.into_iter().find(|a| a.id == *id).map(|a| json!(a)).ok_or((404, "Artikel nicht gefunden".into())),
            (Method::Get, ["bestand"]) => {
                let ean = arg("ean");
                let mut st = c
                    .prepare("SELECT v.ean, a.id, a.name, v.color, v.size, v.stock FROM variants v JOIN articles a ON a.id = v.article_id WHERE v.active = 1 AND a.active = 1 AND (?1 IS NULL OR v.ean = ?1) ORDER BY a.name")
                    .map_err(|e| e500(e.to_string()))?;
                let rows = st
                    .query_map([ean], |r| Ok(json!({ "ean": r.get::<_, String>(0)?, "artikel": r.get::<_, String>(1)?, "name": r.get::<_, String>(2)?, "farbe": r.get::<_, String>(3)?, "groesse": r.get::<_, String>(4)?, "bestand": r.get::<_, i64>(5)? })))
                    .map_err(|e| e500(e.to_string()))?;
                Ok(json!(rows.filter_map(Result::ok).collect::<Vec<_>>()))
            }
            (Method::Post, ["bestand", "buchung"]) => {
                let ean = bj["ean"].as_str().ok_or((400, "ean fehlt".into()))?;
                let n = bj["menge"].as_i64().ok_or((400, "menge fehlt".into()))?;
                let art = bj["art"].as_str().unwrap_or("zugang");
                let vid: i64 = c.query_row("SELECT id FROM variants WHERE ean = ?1", [ean], |r| r.get(0)).map_err(|_| (404u16, format!("EAN {ean} unbekannt")))?;
                let (value, set) = match art {
                    "zugang" => (n.abs(), false),
                    "abgang" => (-n.abs(), false),
                    "inventur" => (n, true),
                    _ => return Err((400, "art: zugang | abgang | inventur".into())),
                };
                let tx = c.unchecked_transaction().map_err(|e| e500(e.to_string()))?;
                let after = catalog::book(&tx, vid, value, set, bj["grund"].as_str().unwrap_or("API"), None, Some("API")).map_err(e400)?;
                db::audit_append(&tx, "api.inventory.booked", &json!({ "ean": ean, "menge": n, "art": art })).map_err(|e| e500(e.to_string()))?;
                tx.commit().map_err(|e| e500(e.to_string()))?;
                crate::automation::dispatch(c, "inventory.booked", &json!({ "ean": ean, "bestand": after, "quelle": "api" }));
                Ok(json!({ "ean": ean, "bestand": after }))
            }
            (Method::Get, ["kunden"]) => {
                let q = arg("q").map(|s| s.to_lowercase());
                Ok(json!(customers::list(c)
                    .map_err(|e| e500(e.to_string()))?
                    .into_iter()
                    .filter(|k| q.as_ref().map(|q| k.name.to_lowercase().contains(q) || k.email.to_lowercase().contains(q) || k.id.to_lowercase() == *q).unwrap_or(true))
                    .collect::<Vec<_>>()))
            }
            (Method::Get, ["kunden", id]) => customers::get(c, id).map_err(|e| e500(e.to_string()))?.map(|k| json!(k)).ok_or((404, "Kunde nicht gefunden".into())),
            (Method::Post, ["kunden"]) => {
                let k: customers::Customer = serde_json::from_value(bj.clone()).map_err(|e| (400u16, format!("Daten ungültig: {e}")))?;
                let id = customers::save(c, &k).map_err(e400)?;
                let _ = db::audit_append(c, "api.customer.saved", &json!({ "kunde": id }));
                crate::automation::dispatch(c, "customer.saved", &json!({ "kunde": id, "quelle": "api" }));
                Ok(json!(customers::get(c, &id).map_err(|e| e500(e.to_string()))?))
            }
            (Method::Get, ["belege"]) => {
                let von = arg("von").unwrap_or_else(|| "0000-01-01".into());
                let bis = arg("bis").unwrap_or_else(|| "9999-12-31".into());
                let mut st = c
                    .prepare(&format!("SELECT {} FROM sales WHERE substr(ts,1,10) >= ?1 AND substr(ts,1,10) <= ?2 ORDER BY id LIMIT 5000", catalog::SALE_COLS))
                    .map_err(|e| e500(e.to_string()))?;
                let rows = st.query_map(params![von, bis], catalog::sale_row).map_err(|e| e500(e.to_string()))?;
                Ok(json!(rows.filter_map(Result::ok).collect::<Vec<_>>()))
            }
            (Method::Get, ["belege", nr]) => sales::sale_get(c, nr).map_err(|e| (404u16, e)),
            (Method::Get, ["umsatz"]) => {
                let von = arg("von").unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
                let bis = arg("bis").unwrap_or_else(|| von.clone());
                let mut s = sales::stats(c, &sales::Range { from: format!("{von}T00:00:00"), to: format!("{bis}T23:59:59") }, true).map_err(e500)?;
                if let Value::Object(m) = &mut s {
                    m.remove("rows");
                }
                Ok(s)
            }
            (Method::Get, ["objekte"]) => Ok(json!(custom::entities(c).map_err(|e| e500(e.to_string()))?)),
            (Method::Get, ["objekte", ent]) => Ok(json!(custom::records(c, ent, arg("q").as_deref(), 1000).map_err(|e| e500(e.to_string()))?)),
            (Method::Get, ["objekte", ent, id]) => custom::record_get(c, ent, id.parse().map_err(|_| (400u16, "id ungültig".to_string()))?).map_err(|e| (404u16, e)),
            (Method::Post, ["objekte", ent]) => {
                let id = custom::record_save(c, ent, None, &bj, Some("API")).map_err(e400)?;
                crate::automation::dispatch(c, &format!("objekt.{ent}.saved"), &json!({ "id": id, "quelle": "api" }));
                custom::record_get(c, ent, id).map_err(e500)
            }
            (Method::Put, ["objekte", ent, id]) => {
                let id: i64 = id.parse().map_err(|_| (400u16, "id ungültig".to_string()))?;
                custom::record_save(c, ent, Some(id), &bj, Some("API")).map_err(e400)?;
                crate::automation::dispatch(c, &format!("objekt.{ent}.saved"), &json!({ "id": id, "quelle": "api" }));
                custom::record_get(c, ent, id).map_err(e500)
            }
            (Method::Get, ["eigene", slug]) => {
                let sql: String = c
                    .query_row("SELECT sql FROM api_endpoints WHERE slug = ?1 AND active = 1", [slug], |r| r.get(0))
                    .optional()
                    .map_err(|e| e500(e.to_string()))?
                    .ok_or((404, "Eigener Endpunkt nicht gefunden".into()))?;
                run_query(db_path, &sql, &args).map_err(e400)
            }
            _ => Err((404, format!("Unbekannter Pfad {path}"))),
        }
    })();
    match res {
        Ok(v) => reply(req, 200, v),
        Err((code, msg)) => reply(req, code, json!({ "fehler": msg })),
    }
}

/// Server starten (läuft in eigenen Threads mit eigener Datenbankverbindung). Liefert die Adresse.
pub fn start(state: &ApiState, db_path: PathBuf, lan: bool, port: u16) -> Result<String, String> {
    stop(state);
    let addr = format!("{}:{}", if lan { "0.0.0.0" } else { "127.0.0.1" }, port);
    let server = Arc::new(Server::http(&addr).map_err(|e| format!("Port {port} nicht verfügbar: {e}"))?);
    for _ in 0..2 {
        let s = server.clone();
        let p = db_path.clone();
        std::thread::spawn(move || {
            let Ok(c) = db::open(&p) else { return };
            let _ = c.busy_timeout(std::time::Duration::from_secs(5));
            for req in s.incoming_requests() {
                handle(&c, &p, req);
            }
        });
    }
    *state.0.lock().unwrap() = Some((server, addr.clone()));
    Ok(addr)
}

pub fn stop(state: &ApiState) {
    if let Some((s, _)) = state.0.lock().unwrap().take() {
        s.unblock();
        s.unblock();
    }
}

pub fn running(state: &ApiState) -> Option<String> {
    state.0.lock().unwrap().as_ref().map(|(_, a)| a.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(port: u16, path: &str, key: Option<&str>) -> (u16, Value) {
        let mut r = ureq::get(&format!("http://127.0.0.1:{port}{path}"));
        if let Some(k) = key {
            r = r.set("Authorization", &format!("Bearer {k}"));
        }
        match r.call() {
            Ok(x) => (x.status(), x.into_json().unwrap()),
            Err(ureq::Error::Status(c, x)) => (c, x.into_json().unwrap_or(Value::Null)),
            Err(e) => panic!("{e}"),
        }
    }

    #[test]
    fn rest_api_mit_schluessel_und_eigenem_endpunkt() {
        let p = std::env::temp_dir().join(format!("kontor-api-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&p);
        let c = db::open(&p).unwrap();
        let a: catalog::Article = serde_json::from_value(json!({ "id": "A1", "name": "Jacke", "category": "jacken", "price": 10000, "vat": 20, "colors": ["moos"], "sizes": ["M"], "variants": [{ "color": "moos", "size": "M", "ean": "2000000000015" }] })).unwrap();
        let tx = c.unchecked_transaction().unwrap();
        catalog::save(&tx, &a).unwrap();
        tx.commit().unwrap();
        let read = key_create(&c, "Webshop", &["lesen".into()]).unwrap();
        let rw = key_create(&c, "ERP", &["lesen".into(), "schreiben".into()]).unwrap();
        assert!(endpoint_save(&c, None, "loeschen", "x", "DELETE FROM articles", true).is_err());
        assert!(endpoint_save(&c, None, "zwei", "x", "SELECT 1; DELETE FROM articles", true).is_err());
        endpoint_save(&c, None, "bestand-nach-ean", "Bestand", "SELECT ean, stock FROM variants WHERE ean = :ean", true).unwrap();
        let st = ApiState::default();
        let port = 18000 + (std::process::id() % 1000) as u16;
        start(&st, p.clone(), false, port).unwrap();
        assert_eq!(get(port, "/api/v1/artikel", None).0, 401);
        assert_eq!(get(port, "/api/v1/artikel", Some("ktr_falsch")).0, 401);
        let (code, v) = get(port, "/api/v1/artikel", Some(&read));
        assert_eq!((code, v[0]["id"].clone()), (200, json!("A1")));
        // Schreiben mit Leseschlüssel verboten
        let r = ureq::post(&format!("http://127.0.0.1:{port}/api/v1/bestand/buchung")).set("Authorization", &format!("Bearer {read}")).send_json(json!({ "ean": "2000000000015", "menge": 5 }));
        assert!(matches!(r, Err(ureq::Error::Status(403, _))));
        let r = ureq::post(&format!("http://127.0.0.1:{port}/api/v1/bestand/buchung")).set("Authorization", &format!("Bearer {rw}")).send_json(json!({ "ean": "2000000000015", "menge": 5, "art": "zugang" })).unwrap();
        assert_eq!(r.into_json::<Value>().unwrap()["bestand"], json!(5));
        let (_, v) = get(port, "/api/v1/eigene/bestand-nach-ean?ean=2000000000015", Some(&read));
        assert_eq!(v, json!([{ "ean": "2000000000015", "stock": 5 }]));
        assert_eq!(get(port, "/api/v1/openapi.json", None).0, 200);
        stop(&st);
        let _ = std::fs::remove_file(&p);
    }
}
