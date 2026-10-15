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

/// Artikel mit den Herstellerangaben seiner Marke (GPSR; `hersteller` ist null, solange die Marke keine Angaben hat)
/// und seinen Webshop-Kategorien (`webkategorien`: [{id, name}], leer ohne Zuordnung) – dieselbe Auskunft wie im Schaufenster
fn artikel_json(a: &catalog::Article, her: &std::collections::HashMap<String, Value>, wk: &crate::shop::WebKat) -> Value {
    let mut v = json!(a);
    v["hersteller"] = her.get(&crate::marke::norm(&a.brand)).cloned().unwrap_or(Value::Null);
    v["webkategorien"] = json!(wk.kategorien_json(a));
    v
}

pub fn openapi() -> Value {
    let p = |summary: &str, scope: &str| json!({ "summary": summary, "x-berechtigung": scope });
    json!({
        "openapi": "3.0.3",
        "info": { "title": "Kontor API", "version": VERSION, "description": "Lokale API von Kontor. Authentifizierung: Header „Authorization: Bearer <API-Schlüssel>“." },
        "paths": {
            "/api/v1/artikel": { "get": p("Alle aktiven Artikel (unabhängig von Schaufenster-Einstellungen) mit Varianten, Bestand, Herstellerangaben (GPSR) der Marke und Webshop-Kategorien (webkategorien) (?q=, ?warengruppe=, ?webkategorie=<id>)", "lesen") },
            "/api/v1/artikel/{id}": { "get": p("Ein Artikel (mit Herstellerangaben und Webshop-Kategorien)", "lesen") },
            "/api/v1/webkategorien": { "get": p("Webshop-Kategorien, die aktiv und sichtbar sind, in der Reihenfolge der Tabelle: id, name, artikelzahl", "lesen") },
            "/api/v1/marken": { "get": p("Marken mit Herstellerangaben nach GPSR: Name, Anschrift, elektronische Adresse, Verantwortlicher in der EU", "lesen") },
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
    if path.starts_with("/sync/") {
        let key = req.headers().iter().find(|h| h.field.equiv("X-Kontor-Filiale")).map(|h| h.value.as_str().to_string()).unwrap_or_default();
        let ip = req.remote_addr().map(|a| a.ip().to_string()).unwrap_or_default();
        let mut body = String::new();
        if method != Method::Get {
            let _ = std::io::Read::read_to_string(&mut std::io::Read::take(req.as_reader(), 64 * 1024 * 1024), &mut body);
        }
        let bj: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
        return match crate::verbund::handle(c, if method == Method::Get { "GET" } else { "POST" }, &path, &key, &bj, &ip) {
            Ok(v) => reply(req, 200, v),
            Err((code, e)) => reply(req, code, json!({ "fehler": e })),
        };
    }
    if path == "/mobil" || path.starts_with("/mobil/") {
        return crate::mobile::handle(c, req, &path);
    }
    if path == "/shop" || path.starts_with("/shop/") {
        return crate::shop::handle(c, db_path, req, &path);
    }
    if path.is_empty() {
        let to: &[u8] = if db::setting_get(c, "shop.aktiv").and_then(|v| v.as_bool()).unwrap_or(false) { b"/shop" } else { b"/mobil" };
        let _ = req.respond(Response::empty(302).with_header(Header::from_bytes(&b"Location"[..], to).unwrap()));
        return;
    }
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
                let wkat = arg("webkategorie");
                let list = catalog::list(c).map_err(|e| e500(e.to_string()))?;
                let her = crate::marke::hersteller_json(c);
                let wk = crate::shop::webkat_laden(c).map_err(e500)?;
                Ok(json!(list
                    .into_iter()
                    .filter(|a| q.as_ref().map(|q| a.name.to_lowercase().contains(q) || a.id.to_lowercase() == *q || a.variants.iter().any(|v| v.ean == *q)).unwrap_or(true))
                    .filter(|a| cat.as_ref().map(|k| &a.category == k).unwrap_or(true))
                    .filter(|a| wkat.as_ref().map(|k| wk.kategorien(a).iter().any(|x| &x.id == k)).unwrap_or(true))
                    .map(|a| artikel_json(&a, &her, &wk))
                    .collect::<Vec<_>>()))
            }
            (Method::Get, ["artikel", id]) => {
                let her = crate::marke::hersteller_json(c);
                let wk = crate::shop::webkat_laden(c).map_err(e500)?;
                catalog::list(c).map_err(|e| e500(e.to_string()))?.into_iter().find(|a| a.id == *id).map(|a| artikel_json(&a, &her, &wk)).ok_or((404, "Artikel nicht gefunden".into()))
            }
            (Method::Get, ["webkategorien"]) => {
                let wk = crate::shop::webkat_laden(c).map_err(e500)?;
                let n = wk.artikelzahlen(c).map_err(e500)?;
                Ok(json!(wk.liste.iter().zip(n).map(|(k, n)| json!({ "id": k.id, "name": k.name, "artikelzahl": n })).collect::<Vec<_>>()))
            }
            (Method::Get, ["marken"]) => {
                let her = crate::marke::hersteller_json(c);
                let mut l: Vec<Value> = crate::stamm::list(c, crate::marke::KIND).map_err(e500)?.into_iter().filter(|r| r["_aktiv"].as_bool().unwrap_or(true)).map(|r| {
                    let name = r["name"].as_str().unwrap_or("").to_string();
                    json!({ "name": name, "hersteller": her.get(&crate::marke::norm(&name)) })
                }).collect();
                l.sort_by(|a, b| a["name"].as_str().unwrap_or("").to_lowercase().cmp(&b["name"].as_str().unwrap_or("").to_lowercase()));
                Ok(json!(l))
            }
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
            (Method::Post, ["webshop", "bestellungen"]) => {
                // Bestellung aus einem externen Webshop (Shopware, WooCommerce, Shopify …) übernehmen
                let k = &bj["kunde"];
                let lines: Vec<Value> = bj["positionen"].as_array().cloned().unwrap_or_default().iter().map(|p| {
                    let ean = p["ean"].as_str().unwrap_or("").to_string();
                    let name = c.query_row("SELECT a.name || ' · ' || v.color || ' · ' || v.size, a.id FROM variants v JOIN articles a ON a.id = v.article_id WHERE v.ean = ?1", [&ean], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).ok();
                    json!({ "ean": ean, "sku": name.as_ref().map(|n| n.1.clone()), "name": name.map(|n| n.0).or(p["name"].as_str().map(str::to_string)).unwrap_or_default(), "qty": p["menge"].as_i64().unwrap_or(1), "price": (p["preis"].as_f64().unwrap_or(0.0) * 100.0).round() as i64, "vat": p["ust"].as_i64().unwrap_or(20) })
                }).collect();
                if let Some(u) = lines.iter().find(|l| l["sku"].is_null()) {
                    return Err((400, format!("Unbekannte EAN {}", u["ean"].as_str().unwrap_or(""))));
                }
                if lines.is_empty() {
                    return Err((400, "Keine Positionen".into()));
                }
                let tx = c.unchecked_transaction().map_err(|e| e500(e.to_string()))?;
                let d = crate::vorgang::save(&tx, &json!({ "kind": "webbestellung", "partner_name": k["name"].as_str().unwrap_or("Webshop-Kunde"), "ref": bj["nr"].as_str().unwrap_or(""),
                    "data": { "lines": lines, "kunde": k, "versandart": bj["versand"], "zahlung": bj["zahlung"], "shop": bj["shop"], "quelle": "API" } }), "Webshop").map_err(e400)?;
                tx.commit().map_err(|e| e500(e.to_string()))?;
                Ok(json!({ "nr": d["no"], "status": d["status"] }))
            }
            (Method::Get, ["webshop", "bestellungen"]) => {
                let l = crate::vorgang::list(c, &["webbestellung".to_string()], arg("status").as_deref(), 200).map_err(e500)?;
                Ok(json!(l.iter().map(|d| json!({ "nr": d["no"], "ref": d["ref"], "status": d["status"], "betrag": d["total"].as_i64().unwrap_or(0) as f64 / 100.0, "tracking": d["data"]["versand"]["tracking"] })).collect::<Vec<_>>()))
            }
            _ => Err((404, format!("Unbekannter Pfad {path}"))),
        }
    })();
    let ip = req.remote_addr().map(|a| a.ip().to_string());
    let status = res.as_ref().map(|_| 200).unwrap_or_else(|e| e.0);
    let key = hdr.as_deref().and_then(|h| h.strip_prefix("Bearer ")).map(|k| k.trim().chars().take(8).collect::<String>());
    let _ = c.execute("INSERT INTO api_log(ts, method, path, status, ip, key) VALUES (?1,?2,?3,?4,?5,?6)", params![db::now(), method.to_string(), path, status, ip, key]);
    let _ = c.execute("DELETE FROM api_log WHERE id < (SELECT MAX(id) - 20000 FROM api_log)", []);
    match res {
        Ok(v) => reply(req, 200, v),
        Err((code, msg)) => reply(req, code, json!({ "fehler": msg })),
    }
}

/// Server starten (läuft in eigenen Threads mit eigener Datenbankverbindung). Liefert die Adresse.
pub fn start(state: &ApiState, db_path: PathBuf, lan: bool, port: u16) -> Result<String, String> {
    stop(state);
    let addr = format!("{}:{}", if lan { "0.0.0.0" } else { "127.0.0.1" }, port);
    // Beim Umschalten (z. B. nur lokal → Netzwerk) gibt der alte Server den Port erst nach kurzer Zeit frei
    let mut tries = 0;
    let server = loop {
        match Server::http(&addr) {
            Ok(s) => break Arc::new(s),
            Err(e) if tries < 30 => {
                let _ = e;
                tries += 1;
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => return Err(format!("Port {port} nicht verfügbar: {e}")),
        }
    };
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
        assert!(v[0]["hersteller"].is_null(), "Marke ohne Angaben: hersteller ist null");
        // Herstellerangaben (GPSR) der Marke am Artikel und unter /marken
        c.execute("UPDATE articles SET brand = 'Firn' WHERE id = 'A1'", []).unwrap();
        crate::marke::save(&c, &json!({ "name": "Firn", "lieferant": "L-001", "hersteller": { "name": "Firn Sports AG", "email": "gpsr@firn.ch", "strasse": "Bergstr.", "hausnr": "2", "plz": "8000", "ort": "Zürich", "land": "CH" } }), "T").unwrap();
        let (_, v) = get(port, "/api/v1/artikel/A1", Some(&read));
        assert_eq!((v["hersteller"]["name"].clone(), v["hersteller"]["anschrift"]["stadt"].clone(), v["hersteller"]["gpsr_vollstaendig"].clone()), (json!("Firn Sports AG"), json!("Zürich"), json!(false)));
        let (code, m) = get(port, "/api/v1/marken", Some(&read));
        assert_eq!((code, m[0]["name"].clone(), m[0]["hersteller"]["name"].clone()), (200, json!("Firn"), json!("Firn Sports AG")));
        assert!(!m.to_string().contains("L-001"), "nur die Positivliste geht nach außen");
        // Schreiben mit Leseschlüssel verboten
        let r = ureq::post(&format!("http://127.0.0.1:{port}/api/v1/bestand/buchung")).set("Authorization", &format!("Bearer {read}")).send_json(json!({ "ean": "2000000000015", "menge": 5 }));
        assert!(matches!(r, Err(ureq::Error::Status(403, _))));
        let r = ureq::post(&format!("http://127.0.0.1:{port}/api/v1/bestand/buchung")).set("Authorization", &format!("Bearer {rw}")).send_json(json!({ "ean": "2000000000015", "menge": 5, "art": "zugang" })).unwrap();
        assert_eq!(r.into_json::<Value>().unwrap()["bestand"], json!(5));
        let (_, v) = get(port, "/api/v1/eigene/bestand-nach-ean?ean=2000000000015", Some(&read));
        assert_eq!(v, json!([{ "ean": "2000000000015", "stock": 5 }]));
        assert_eq!(get(port, "/api/v1/openapi.json", None).0, 200);
        // Webshop-Bestellung: unbekannte EAN abgelehnt, gültige angelegt, Status abrufbar, Zugriffe protokolliert
        let url = format!("http://127.0.0.1:{port}/api/v1/webshop/bestellungen");
        let r = ureq::post(&url).set("Authorization", &format!("Bearer {rw}")).send_json(json!({ "nr": "S-1", "positionen": [{ "ean": "999", "menge": 1, "preis": 10.0 }] }));
        assert!(matches!(r, Err(ureq::Error::Status(400, _))));
        let r: Value = ureq::post(&url).set("Authorization", &format!("Bearer {rw}")).send_json(json!({ "nr": "S-2", "shop": "Test", "kunde": { "name": "Anna" }, "positionen": [{ "ean": "2000000000015", "menge": 2, "preis": 100.0, "ust": 20 }] })).unwrap().into_json().unwrap();
        assert_eq!(r["status"], json!("neu"));
        let (_, v) = get(port, "/api/v1/webshop/bestellungen?status=neu", Some(&read));
        assert_eq!((v[0]["ref"].clone(), v[0]["betrag"].clone()), (json!("S-2"), json!(200.0)));
        let n: i64 = c.query_row("SELECT COUNT(*) FROM api_log WHERE path LIKE '%webshop%' AND status = 400", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        stop(&st);
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn rest_api_webkategorien() {
        let p = std::env::temp_dir().join(format!("kontor-api-wk-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&p);
        let c = db::open(&p).unwrap();
        for (i, kat) in ["adv-1", "adv-2", "adv-3"].iter().enumerate() {
            let a: catalog::Article = serde_json::from_value(json!({ "id": format!("A{}", i + 1), "name": format!("Artikel {}", i + 1), "category": kat, "price": 1000, "vat": 20, "colors": ["moos"], "sizes": ["M"], "variants": [{ "color": "moos", "size": "M", "ean": format!("200000000020{i}") }] })).unwrap();
            let tx = c.unchecked_transaction().unwrap();
            catalog::save(&tx, &a).unwrap();
            tx.commit().unwrap();
        }
        let read = key_create(&c, "Webshop", &["lesen".into()]).unwrap();
        let st = ApiState::default();
        let port = 19000 + (std::process::id() % 1000) as u16;
        start(&st, p.clone(), false, port).unwrap();
        // ohne Zuordnung: alles wie bisher, keine Kategorien am Artikel, Liste der Kategorien leer
        let (code, v) = get(port, "/api/v1/artikel", Some(&read));
        assert_eq!((code, v.as_array().unwrap().len(), v[0]["webkategorien"].clone()), (200, 3, json!([])));
        assert_eq!(get(port, "/api/v1/webkategorien", Some(&read)), (200, json!([])));
        assert_eq!(get(port, "/api/v1/webkategorien", None).0, 401);
        // Digitales Schaufenster (öffentlich): ohne Zuordnung alle Artikel, Navigation ohne Webshop-Kategorien
        db::setting_set(&c, "shop.aktiv", &json!(true)).unwrap();
        let (code, info) = get(port, "/shop/api/info", None);
        assert_eq!((code, info["webkategorien"].clone()), (200, json!([])));
        assert_eq!(get(port, "/shop/api/artikel", None).1.as_array().unwrap().len(), 3);
        let ins =|kind: &str, id: &str, pos: i64, d: Value| {
            c.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES (?1,?2,?3,?4,1,'t')", params![kind, id, d.to_string(), pos]).unwrap();
        };
        ins("webkategorie", "W1", 0, json!({ "name": "Ski", "sichtbar": true }));
        ins("webkategorie", "W2", 1, json!({ "name": "Schuhe", "sichtbar": true, "warengruppen": ["adv-1", "adv-2"] }));
        ins("webkategorie", "W3", 2, json!({ "name": "Intern", "sichtbar": false }));
        ins("warengruppe", "adv-1", 0, json!({ "name": "Jacken", "webkat1": "W2", "webkat2": "W1" }));
        ins("warengruppe", "adv-3", 1, json!({ "name": "Intern", "webkat1": "W3" }));
        // die Schnittstelle liefert weiterhin ALLE aktiven Artikel – auch die, die im Schaufenster fehlen
        let (_, v) = get(port, "/api/v1/artikel", Some(&read));
        assert_eq!(v.as_array().unwrap().len(), 3);
        let namen = |a: &Value| a["webkategorien"].as_array().unwrap().iter().map(|k| k["name"].as_str().unwrap().to_string()).collect::<Vec<_>>();
        let von = |id: &str| namen(v.as_array().unwrap().iter().find(|a| a["id"] == id).unwrap());
        assert_eq!((von("A1"), von("A2"), von("A3")), (vec!["Ski".to_string(), "Schuhe".to_string()], vec!["Schuhe".to_string()], vec![]));
        assert_eq!(get(port, "/api/v1/artikel/A2", Some(&read)).1["webkategorien"], json!([{ "id": "W2", "name": "Schuhe" }]));
        // Kategorien: nur aktive, sichtbare, in der Reihenfolge der Tabelle, mit Artikelzahl
        let (code, k) = get(port, "/api/v1/webkategorien", Some(&read));
        assert_eq!((code, k), (200, json!([{ "id": "W1", "name": "Ski", "artikelzahl": 1 }, { "id": "W2", "name": "Schuhe", "artikelzahl": 2 }])));
        // Filter
        let ids = |pfad: &str| get(port, pfad, Some(&read)).1.as_array().unwrap().iter().map(|a| a["id"].as_str().unwrap().to_string()).collect::<Vec<_>>();
        assert_eq!(ids("/api/v1/artikel?webkategorie=W2"), vec!["A1", "A2"]);
        assert_eq!(ids("/api/v1/artikel?webkategorie=W1"), vec!["A1"]);
        assert!(ids("/api/v1/artikel?webkategorie=W3").is_empty(), "unsichtbare und unbekannte Kategorien liefern nichts");
        assert!(ids("/api/v1/artikel?webkategorie=gibtsnicht").is_empty());
        assert_eq!(ids("/api/v1/artikel?webkategorie=W2&warengruppe=adv-2"), vec!["A2"]);
        assert!(get(port, "/api/v1/openapi.json", None).1["paths"]["/api/v1/webkategorien"].is_object());
        // Schaufenster mit Zuordnung: nur Artikel in sichtbaren Kategorien (A3 liegt nur in der unsichtbaren), Navigation in Tabellenreihenfolge –
        // dieselbe Auskunft wie die Schnittstelle, die weiterhin alle drei Artikel liefert
        let (_, info) = get(port, "/shop/api/info", None);
        assert_eq!(info["webkategorien"], json!([{ "id": "W1", "name": "Ski" }, { "id": "W2", "name": "Schuhe" }]));
        let (_, sa) = get(port, "/shop/api/artikel", None);
        let sid: Vec<&str> = sa.as_array().unwrap().iter().map(|a| a["id"].as_str().unwrap()).collect();
        assert_eq!(sid, vec!["A1", "A2"]);
        assert_eq!(sa[0]["webkategorien"], json!([{ "id": "W1", "name": "Ski" }, { "id": "W2", "name": "Schuhe" }]));
        assert_eq!(ids("/api/v1/artikel").len(), 3);
        stop(&st);
        let _ = std::fs::remove_file(&p);
    }
}
