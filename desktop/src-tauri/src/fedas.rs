//! FEDAS-Sync: Artikelstammdaten der Hersteller (FEDAS Data Repository bzw. kompatible Feeds) abholen und
//! in den Katalog übernehmen – Hersteller → Artikel → Varianten mit Preisen, Beschreibung, Material,
//! FEDAS-Klassifikation und Bildern. Läuft auf Wunsch täglich automatisch im Hintergrund.
//!
//! Die Schnittstelle ist bewusst konfigurierbar (Adresse, Anmeldung, Pfade) und der Normalisierer liest
//! Felder unter mehreren gängigen Namen. Dieselbe Verarbeitung dient dem Dateiimport (CSV/JSON).

use crate::{catalog, db, media};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::time::Duration;

fn s(c: &Connection, k: &str) -> String {
    db::setting_get(c, k).and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default()
}
fn b(c: &Connection, k: &str, def: bool) -> bool {
    db::setting_get(c, k).and_then(|v| v.as_bool()).unwrap_or(def)
}

fn norm_key(k: &str) -> String {
    k.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase()
}

/// Wert unter einem von mehreren möglichen Feldnamen finden
fn pick<'a>(m: &'a Map<String, Value>, names: &[&str]) -> Option<&'a Value> {
    let idx: HashMap<String, &Value> = m.iter().map(|(k, v)| (norm_key(k), v)).collect();
    names.iter().find_map(|n| idx.get(*n).copied().filter(|v| !v.is_null() && v.as_str() != Some("")))
}
fn pick_s(m: &Map<String, Value>, names: &[&str]) -> Option<String> {
    pick(m, names).map(|v| match v {
        Value::String(x) => x.trim().to_string(),
        Value::Number(n) => n.to_string(),
        Value::Object(o) => o.get("name").or(o.get("value")).or(o.get("text")).and_then(|x| x.as_str()).unwrap_or("").to_string(),
        Value::Array(a) => a.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", "),
        _ => v.to_string(),
    })
}
fn pick_list(m: &Map<String, Value>, names: &[&str]) -> Vec<String> {
    match pick(m, names) {
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str().map(str::to_string).or_else(|| x.get("text").and_then(|t| t.as_str()).map(str::to_string))).collect(),
        Some(Value::String(x)) => x.split(['\n', ';', '|']).map(|y| y.trim().to_string()).filter(|y| !y.is_empty()).collect(),
        _ => vec![],
    }
}
fn money(v: &str) -> Option<i64> {
    let t: String = v.chars().filter(|c| c.is_ascii_digit() || *c == ',' || *c == '.').collect();
    if t.is_empty() {
        return None;
    }
    let t = if t.contains(',') { t.replace('.', "").replace(',', ".") } else { t };
    t.parse::<f64>().ok().map(|x| (x * 100.0).round() as i64)
}

pub fn color_hex(name: &str) -> &'static str {
    let n = name.to_lowercase();
    let table: [(&[&str], &str); 18] = [
        (&["schwarz", "black", "noir", "nero", "phantom", "carbon"], "#22252b"), (&["weiß", "weiss", "white", "bianco", "snow"], "#e9e9e6"), (&["rot", "red", "rosso", "fiery"], "#c4412f"),
        (&["blau", "blue", "bleu", "navy", "marine", "azur"], "#3d6aa3"), (&["grün", "gruen", "green", "oliv", "olive", "moss", "forest"], "#5a7550"), (&["gelb", "yellow", "lime", "senf"], "#d2aa2c"),
        (&["orange", "arancio", "burnt"], "#d9702f"), (&["grau", "gray", "grey", "grigio", "anthrazit", "slate", "stone"], "#80838a"), (&["braun", "brown", "bark", "coffee", "tabak"], "#7a5a3f"),
        (&["beige", "sand", "creme", "cream", "natural", "natur"], "#cdb996"), (&["pink", "rosa", "magenta", "fuchsia"], "#cf5b8e"), (&["lila", "violet", "purple", "plum", "beere"], "#7a4c8c"),
        (&["türkis", "turquoise", "teal", "petrol", "aqua"], "#2f8a8c"), (&["silber", "silver"], "#b9bcc2"), (&["gold"], "#c9a24a"), (&["bordeaux", "wine", "burgundy"], "#6f2433"),
        (&["khaki", "tan", "coyote"], "#a08a5a"), (&["camo", "multi", "bunt"], "#6b7a58"),
    ];
    for (keys, hex) in table {
        if keys.iter().any(|k| n.contains(k)) {
            return hex;
        }
    }
    "#8a8f98"
}

pub fn slug(s: &str) -> String {
    let mut o = String::new();
    let mut last = '-';
    for ch in s.to_lowercase().chars() {
        let ch = match ch { 'ä' => 'a', 'ö' => 'o', 'ü' => 'u', 'ß' => 's', c => c };
        if ch.is_ascii_alphanumeric() {
            o.push(ch);
            last = ch;
        } else if last != '-' {
            o.push('-');
            last = '-';
        }
    }
    o.trim_matches('-').chars().take(40).collect()
}

/// Farbname → Farbschlüssel; legt die Hausfarbe an, falls sie noch fehlt
pub fn ensure_color(c: &Connection, name: &str) -> String {
    let key = {
        let k = slug(name);
        if k.is_empty() { "standard".to_string() } else { k }
    };
    let exists: bool = c.query_row("SELECT 1 FROM stamm WHERE kind = 'hausfarbe' AND id = ?1", [&key], |_| Ok(true)).optional().ok().flatten().unwrap_or(false);
    if !exists {
        let pos: i64 = c.query_row("SELECT COALESCE(MAX(pos), -1) + 1 FROM stamm WHERE kind = 'hausfarbe'", [], |r| r.get(0)).unwrap_or(0);
        let _ = c.execute(
            "INSERT OR IGNORE INTO stamm(kind, id, data, pos, active, updated_at) VALUES ('hausfarbe', ?1, ?2, ?3, 1, ?4)",
            params![key, json!({ "name": name.trim(), "hex": color_hex(name) }).to_string(), pos, db::now()],
        );
    }
    key
}

#[derive(Default, Clone, Debug)]
pub struct Item {
    pub gtin: String,
    pub style: String,
    pub name: String,
    pub brand: String,
    pub color: String,
    pub size: String,
    pub price: Option<i64>,
    pub cost: Option<i64>,
    pub vat: Option<i64>,
    pub details: Map<String, Value>,
    pub images: Vec<String>,
    pub captions: Vec<String>,
}

fn find_array(v: &Value) -> Vec<Value> {
    match v {
        Value::Array(a) => a.clone(),
        Value::Object(o) => {
            for k in ["items", "data", "results", "products", "articles", "manufacturers", "brands", "content", "records"] {
                if let Some(x) = o.iter().find(|(kk, _)| norm_key(kk) == k).map(|(_, x)| x) {
                    let r = find_array(x);
                    if !r.is_empty() {
                        return r;
                    }
                }
            }
            o.values().find_map(|x| if x.is_array() { Some(find_array(x)) } else { None }).unwrap_or_default()
        }
        _ => vec![],
    }
}

const CHILD_KEYS: [&str; 6] = ["variants", "skus", "sizes", "colors", "colours", "items"];

/// Einen Eintrag (ggf. mit untergeordneten Varianten) in flache Artikelzeilen auflösen
fn flatten(v: &Value, parent: &Map<String, Value>, out: &mut Vec<Map<String, Value>>) {
    let Some(m) = v.as_object() else { return };
    let mut merged = parent.clone();
    let mut kids: Vec<&Value> = vec![];
    for (k, x) in m {
        if CHILD_KEYS.contains(&norm_key(k).as_str()) && x.as_array().is_some_and(|a| a.iter().any(|y| y.is_object())) {
            kids.extend(x.as_array().unwrap());
        } else {
            merged.insert(k.clone(), x.clone());
        }
    }
    if kids.is_empty() {
        out.push(merged);
    } else {
        for k in kids {
            flatten(k, &merged, out);
        }
    }
}

pub fn parse_items(v: &Value) -> Vec<Item> {
    let mut rows = vec![];
    for e in find_array(v) {
        flatten(&e, &Map::new(), &mut rows);
    }
    rows.iter().filter_map(normalize).collect()
}

fn normalize(m: &Map<String, Value>) -> Option<Item> {
    let gtin: String = pick_s(m, &["gtin", "ean", "eancode", "barcode", "ean13", "gtin13", "upc"])?.chars().filter(|c| c.is_ascii_digit()).collect();
    if gtin.len() < 8 {
        return None;
    }
    let style = pick_s(m, &["itemnumber", "articlenumber", "artikelnummer", "stylenumber", "styleno", "style", "modelnumber", "productnumber", "supplieritemnumber", "sku"]).unwrap_or_else(|| gtin.clone());
    let mut it = Item { gtin, style, ..Default::default() };
    it.name = pick_s(m, &["name", "itemname", "productname", "title", "bezeichnung", "artikelbezeichnung", "modelname"]).unwrap_or_default();
    it.brand = pick_s(m, &["brand", "brandname", "manufacturer", "manufacturername", "marke", "hersteller"]).unwrap_or_default();
    it.color = pick_s(m, &["color", "colour", "colorname", "colourname", "farbe", "colordescription"]).unwrap_or_else(|| "Standard".into());
    it.size = pick_s(m, &["size", "sizename", "groesse", "größe", "sizelabel"]).unwrap_or_else(|| "one size".into());
    it.price = pick_s(m, &["retailprice", "rrp", "msrp", "uvp", "consumerprice", "recommendedretailprice", "price"]).and_then(|x| money(&x)).filter(|x| *x > 0);
    it.cost = pick_s(m, &["wholesaleprice", "purchaseprice", "ek", "dealerprice", "netprice", "cost"]).and_then(|x| money(&x)).filter(|x| *x > 0);
    it.vat = pick_s(m, &["vatrate", "vat", "mwst", "ust", "taxrate"]).and_then(|x| x.replace(',', ".").trim_end_matches('%').parse::<f64>().ok()).map(|x| x.round() as i64);
    let mut d = Map::new();
    let mut put = |k: &str, v: Option<String>| {
        if let Some(v) = v.filter(|x| !x.is_empty()) {
            d.insert(k.into(), json!(v));
        }
    };
    put("fedas_code", pick_s(m, &["fedascode", "fedasclassification", "fedasclass", "productclassification", "classification", "fedaskey", "fedas"]));
    put("beschreibung", pick_s(m, &["longdescription", "description", "beschreibung", "marketingtext", "text"]));
    put("kurztext", pick_s(m, &["shortdescription", "kurzbeschreibung", "subtitle", "teaser"]));
    put("mat_zusammensetzung", pick_s(m, &["material", "materials", "composition", "zusammensetzung", "outermaterial"]));
    put("zielgruppe", pick_s(m, &["gender", "geschlecht", "targetgroup", "zielgruppe"]));
    put("saison", pick_s(m, &["season", "saison", "collection", "modelyear"]));
    put("herkunft", pick_s(m, &["countryoforigin", "origin", "herkunftsland", "madein"]));
    put("zolltarif", pick_s(m, &["customstariffnumber", "hscode", "zolltarif", "commoditycode", "intrastat"]));
    put("gewicht_g", pick_s(m, &["weightgrams", "weight", "gewicht"]));
    put("hersteller_artikelnr", Some(it.style.clone()));
    for (k, names) in [("features", &["features", "bulletpoints", "usp", "highlights"][..]), ("pflege", &["care", "careinstructions", "pflege", "pflegehinweise"][..]), ("technologien", &["technologies", "technologien"][..])] {
        let l = pick_list(m, names);
        if !l.is_empty() {
            d.insert(k.into(), json!(l));
        }
    }
    match pick(m, &["images", "imageurls", "pictures", "media", "image", "imageurl", "picture", "photos"]) {
        Some(Value::String(u)) => it.images.push(u.clone()),
        Some(Value::Array(a)) => {
            for x in a {
                if let Some(u) = x.as_str().or_else(|| x.get("url").and_then(|u| u.as_str())).or_else(|| x.get("src").and_then(|u| u.as_str())) {
                    it.images.push(u.to_string());
                }
            }
        }
        _ => {}
    }
    it.images.retain(|u| u.starts_with("http"));
    it.details = d;
    Some(it)
}

/// CSV (Trennzeichen ; , oder Tab) → Liste von Objekten
pub fn parse_csv(text: &str) -> Value {
    let text = text.trim_start_matches('\u{feff}');
    let first = text.lines().next().unwrap_or("");
    let sep = [';', ',', '\t'].into_iter().max_by_key(|c| first.matches(*c).count()).unwrap_or(';');
    let mut rows: Vec<Vec<String>> = vec![];
    let (mut row, mut cur, mut q) = (vec![], String::new(), false);
    let ch: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < ch.len() {
        let c = ch[i];
        if q {
            if c == '"' && ch.get(i + 1) == Some(&'"') {
                cur.push('"');
                i += 1;
            } else if c == '"' {
                q = false;
            } else {
                cur.push(c);
            }
        } else if c == '"' {
            q = true;
        } else if c == sep {
            row.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            row.push(std::mem::take(&mut cur).trim_end_matches('\r').to_string());
            rows.push(std::mem::take(&mut row));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    if !cur.is_empty() || !row.is_empty() {
        row.push(cur.trim_end_matches('\r').to_string());
        rows.push(row);
    }
    let head = rows.first().cloned().unwrap_or_default();
    json!(rows.iter().skip(1).filter(|r| r.iter().any(|x| !x.trim().is_empty())).map(|r| {
        let mut o = Map::new();
        for (k, v) in head.iter().zip(r) {
            o.insert(k.clone(), json!(v));
        }
        Value::Object(o)
    }).collect::<Vec<_>>())
}

fn guess_category(c: &Connection, code: &str, name: &str) -> String {
    if !code.is_empty() {
        if let Ok(d) = c.query_row("SELECT data FROM stamm WHERE kind = 'fedasklasse' AND id = ?1 AND active = 1", [code], |r| r.get::<_, String>(0)) {
            if let Some(k) = serde_json::from_str::<Value>(&d).ok().and_then(|v| v["warengruppe"].as_str().map(str::to_string)).filter(|x| !x.is_empty()) {
                return k;
            }
        }
    }
    let n = name.to_lowercase();
    let map: [(&[&str], &str); 7] = [
        (&["jacke", "jacket", "weste", "parka", "mantel", "shell"], "jacken"), (&["hose", "pants", "tight", "short"], "hosen"), (&["schuh", "shoe", "boot", "stiefel", "sneaker", "sandal"], "schuhe"),
        (&["ski", "board", "tour", "skischuh", "binding", "bindung"], "ski"), (&["shirt", "top", "longsleeve", "hemd", "pullover", "hoodie", "base layer", "unterwäsche"], "shirts"),
        (&["rucksack", "pack", "bag", "tasche"], "rucksaecke"), (&["handschuh", "glove", "mütze", "cap", "socke", "sock", "helm", "brille", "stock", "pole", "buff", "tuch"], "acc"),
    ];
    for (keys, cat) in map {
        if keys.iter().any(|k| n.contains(k)) {
            return cat.to_string();
        }
    }
    "acc".into()
}

#[derive(Default, Debug, Clone)]
pub struct Stats {
    pub neu: i64,
    pub aktualisiert: i64,
    pub uebersprungen: i64,
    pub bilder: i64,
}

/// Artikel anlegen/aktualisieren. `preise` = UVP und Mehrwertsteuer von FEDAS übernehmen.
pub fn apply_items(c: &mut Connection, items: Vec<Item>, preise: bool, user: &str) -> Result<Stats, String> {
    let mut groups: BTreeMap<(String, String), Vec<Item>> = BTreeMap::new();
    for it in items {
        groups.entry((it.brand.to_lowercase(), it.style.clone())).or_default().push(it);
    }
    let mut st = Stats::default();
    for (_, list) in groups {
        let first = list[0].clone();
        let tx = c.transaction().map_err(|e| e.to_string())?;
        // vorhandenen Artikel über irgendeine EAN finden
        let mut existing: Option<String> = None;
        for it in &list {
            if let Some(a) = tx.query_row("SELECT article_id FROM variants WHERE ean = ?1", [&it.gtin], |r| r.get::<_, String>(0)).optional().map_err(|e| e.to_string())? {
                existing = Some(a);
                break;
            }
        }
        let mut det = Map::new();
        for it in &list {
            for (k, v) in &it.details {
                det.entry(k.clone()).or_insert(v.clone());
            }
        }
        let price = list.iter().find_map(|i| i.price);
        match existing {
            Some(aid) => {
                let mut changed = false;
                // Details zusammenführen (FEDAS-Felder überschreiben, eigene bleiben)
                let cur: String = tx.query_row("SELECT details FROM articles WHERE id = ?1", [&aid], |r| r.get(0)).map_err(|e| e.to_string())?;
                let mut cur: Value = serde_json::from_str(&cur).unwrap_or(json!({}));
                if !cur.is_object() {
                    cur = json!({});
                }
                for (k, v) in &det {
                    if cur[k] != *v {
                        cur[k] = v.clone();
                        changed = true;
                    }
                }
                cur["fedas_sync"] = json!(db::now());
                tx.execute("UPDATE articles SET details = ?2, updated_at = ?3 WHERE id = ?1", params![aid, cur.to_string(), db::now()]).map_err(|e| e.to_string())?;
                if preise {
                    if let Some(p) = price {
                        let old: i64 = tx.query_row("SELECT price FROM articles WHERE id = ?1", [&aid], |r| r.get(0)).map_err(|e| e.to_string())?;
                        if old != p {
                            tx.execute("UPDATE articles SET price = ?2, sale_price = CASE WHEN sale_price >= ?2 THEN NULL ELSE sale_price END WHERE id = ?1", params![aid, p]).map_err(|e| e.to_string())?;
                            changed = true;
                        }
                    }
                    if let Some(co) = list.iter().find_map(|i| i.cost) {
                        tx.execute("UPDATE articles SET cost = ?2 WHERE id = ?1", params![aid, co]).map_err(|e| e.to_string())?;
                    }
                }
                // neue Varianten ergänzen (Bestand bleibt unberührt)
                let (mut colors, mut sizes): (Vec<String>, Vec<String>) = {
                    let r: (String, String) = tx.query_row("SELECT colors, sizes FROM articles WHERE id = ?1", [&aid], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
                    (serde_json::from_str(&r.0).unwrap_or_default(), serde_json::from_str(&r.1).unwrap_or_default())
                };
                for it in &list {
                    let ck = ensure_color(&tx, &it.color);
                    let known: bool = tx.query_row("SELECT 1 FROM variants WHERE ean = ?1", [&it.gtin], |_| Ok(true)).optional().map_err(|e| e.to_string())?.unwrap_or(false);
                    if !known {
                        let r = tx.execute("INSERT OR IGNORE INTO variants(article_id, color, size, ean, stock, active) VALUES (?1,?2,?3,?4,0,1)", params![aid, ck, it.size, it.gtin]).map_err(|e| e.to_string())?;
                        if r > 0 {
                            changed = true;
                            if !colors.contains(&ck) { colors.push(ck.clone()); }
                            if !sizes.contains(&it.size) { sizes.push(it.size.clone()); }
                        }
                    }
                    for (ui, u) in it.images.iter().enumerate() {
                        let before: i64 = tx.query_row("SELECT COUNT(*) FROM article_media WHERE article_id = ?1", [&aid], |r| r.get(0)).unwrap_or(0);
                        media::queue_url_cap(&tx, &aid, u, &ck, it.captions.get(ui).map(String::as_str).unwrap_or(""))?;
                        let after: i64 = tx.query_row("SELECT COUNT(*) FROM article_media WHERE article_id = ?1", [&aid], |r| r.get(0)).unwrap_or(0);
                        st.bilder += after - before;
                    }
                }
                tx.execute("UPDATE articles SET colors = ?2, sizes = ?3 WHERE id = ?1", params![aid, serde_json::to_string(&colors).unwrap(), serde_json::to_string(&sizes).unwrap()]).map_err(|e| e.to_string())?;
                if changed { st.aktualisiert += 1 } else { st.uebersprungen += 1 }
            }
            None => {
                let Some(price) = price else {
                    st.uebersprungen += 1;
                    continue;
                };
                let id = format!("F-{}", slug(&format!("{} {}", first.brand, first.style)).to_uppercase());
                let id = if id.len() < 3 { format!("F-{}", first.gtin) } else { id };
                let mut colors: Vec<String> = vec![];
                let mut sizes: Vec<String> = vec![];
                let mut variants = vec![];
                let mut seen = std::collections::HashSet::new();
                for it in &list {
                    let ck = ensure_color(&tx, &it.color);
                    if !seen.insert((ck.clone(), it.size.clone())) {
                        continue;
                    }
                    if !colors.contains(&ck) { colors.push(ck.clone()); }
                    if !sizes.contains(&it.size) { sizes.push(it.size.clone()); }
                    variants.push(catalog::Variant { id: None, color: ck, size: it.size.clone(), ean: it.gtin.clone(), stock: 0 });
                }
                let name = if first.name.is_empty() { first.style.clone() } else { first.name.clone() };
                let cat = guess_category(&tx, det.get("fedas_code").and_then(|v| v.as_str()).unwrap_or(""), &format!("{} {}", name, det.get("kategorie_hersteller").and_then(|v| v.as_str()).unwrap_or("")));
                let mut dv = Value::Object(det.clone());
                dv["fedas_sync"] = json!(db::now());
                let a = catalog::Article {
                    id: id.clone(), name, brand: first.brand.clone(), category: cat, glyph: "shirt".into(), price, sale_price: None,
                    vat: first.vat.filter(|v| [0, 10, 13, 20].contains(v)).unwrap_or(20), tag: None, popularity: 40, colors, sizes,
                    fields: json!({ "Quelle": "FEDAS" }), prompts: Value::Null, active: true, variants, cost: list.iter().find_map(|i| i.cost),
                    supplier_id: None, min_stock: 1, image: None, details: dv, media: vec![],
                };
                catalog::save(&tx, &a).map_err(|e| format!("{}: {e}", a.id))?;
                for it in &list {
                    let ck = ensure_color(&tx, &it.color);
                    for (ui, u) in it.images.iter().enumerate() {
                        media::queue_url_cap(&tx, &id, u, &ck, it.captions.get(ui).map(String::as_str).unwrap_or(""))?;
                        st.bilder += 1;
                    }
                }
                st.neu += 1;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
    }
    let _ = db::audit_append(c, "fedas.import", &json!({ "neu": st.neu, "aktualisiert": st.aktualisiert, "uebersprungen": st.uebersprungen, "bilder": st.bilder, "benutzer": user }));
    Ok(st)
}

/* ── Abruf über die Schnittstelle ── */

/// Datenquelle: „outtra“ (OUTTRA Data & Image Hub, dokumentierte Händler-API) oder „generisch“ (eigene Schnittstelle)
pub fn provider(c: &Connection) -> &'static str {
    match s(c, "fedas.quelle").as_str() {
        "generisch" => "generisch",
        "outtra" => "outtra",
        _ => if s(c, "fedas.url").trim().is_empty() { "outtra" } else { "generisch" },
    }
}
pub const OUTTRA_BASE: &str = "https://api.outtra.com";

fn auth(c: &Connection, mut r: ureq::Request) -> ureq::Request {
    let (user, pass) = (s(c, "fedas.user"), s(c, "fedas.pass"));
    let mode = if provider(c) == "outtra" { "bearer".to_string() } else { s(c, "fedas.auth") };
    match mode.as_str() {
        "bearer" => r = r.set("Authorization", &format!("Bearer {}", pass.trim())),
        "header" => r = r.set(&{ let h = s(c, "fedas.header"); if h.is_empty() { "X-API-Key".to_string() } else { h } }, &pass),
        "basic" | "" => {
            use base64::Engine;
            if !user.is_empty() || !pass.is_empty() {
                r = r.set("Authorization", &format!("Basic {}", base64::engine::general_purpose::STANDARD.encode(format!("{user}:{pass}"))));
            }
        }
        _ => {}
    }
    r.set("Accept", "application/json")
}

fn get_json(c: &Connection, url: &str) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new().try_proxy_from_env(!media::skip_proxy(url)).timeout(Duration::from_secs(90)).build();
    for attempt in 0..4 {
        match auth(c, agent.get(url)).call() {
            Ok(r) => return r.into_json::<Value>().map_err(|e| format!("Antwort ist kein JSON: {e}")),
            // OUTTRA begrenzt die Anfragen je Minute (HTTP 429) – kurz warten und erneut versuchen
            Err(ureq::Error::Status(429, _)) if attempt < 3 => std::thread::sleep(Duration::from_secs(if cfg!(test) { 0 } else { 20 })),
            Err(ureq::Error::Status(401, _)) => return Err("Anmeldung abgelehnt (HTTP 401) – Zugriffstoken prüfen".into()),
            Err(ureq::Error::Status(code, r)) => {
                let body = r.into_string().unwrap_or_default();
                let msg = serde_json::from_str::<Value>(&body).ok().and_then(|v| v["message"].as_str().map(str::to_string)).unwrap_or_else(|| body.chars().take(200).collect());
                return Err(format!("HTTP {code}: {msg}"));
            }
            Err(e) => return Err(format!("{url}: {e}")),
        }
    }
    Err("Zu viele Anfragen (HTTP 429) – später erneut versuchen".into())
}

pub fn configured(c: &Connection) -> bool {
    if provider(c) == "outtra" { !s(c, "fedas.pass").trim().is_empty() } else { !s(c, "fedas.url").trim().is_empty() }
}

fn base(c: &Connection) -> String {
    let u = s(c, "fedas.url").trim().trim_end_matches('/').to_string();
    if provider(c) == "outtra" && u.is_empty() { OUTTRA_BASE.to_string() } else { u }
}

/* ── OUTTRA Data & Image Hub (https://api.outtra.com/docs, OpenAPI siehe docs/outtra-datahub-openapi.yaml) ── */

fn enc(v: &str) -> String {
    url::form_urlencoded::byte_serialize(v.as_bytes()).collect()
}

/// Marken, für die der Händler freigeschaltet ist (GET /api/v2/datahub/my/brands, seitenweise)
fn outtra_brands(c: &Connection) -> Result<Vec<Value>, String> {
    let mut out = vec![];
    let mut url = format!("{}/api/v2/datahub/my/brands", base(c));
    for _ in 0..50 {
        let v = get_json(c, &url)?;
        for b in v["data"].as_array().cloned().unwrap_or_default() {
            let a = &b["attributes"];
            if a["permissions"]["dataAccess"] == json!(false) {
                continue;
            }
            out.push(json!({ "id": b["id"].as_str().map(str::to_string).unwrap_or_else(|| b["id"].to_string()), "name": a["name"], "verfuegbar": a["products"]["available"], "stand": a["products"]["updated"], "bilder": a["permissions"]["imageAccess"] }));
        }
        match v["links"]["next"].as_str() {
            Some(n) if !n.is_empty() => url = n.to_string(),
            _ => break,
        }
    }
    Ok(out)
}

fn de_zielgruppe(a: &Value) -> Option<String> {
    if a["kids"] == json!(true) || a["age_group"].as_str() == Some("kids") {
        return Some("Kinder".into());
    }
    match a["sex"].as_str().map(str::to_lowercase).as_deref() {
        Some("male") => Some("Herren".into()),
        Some("female") => Some("Damen".into()),
        Some("unisex") => Some("Unisex".into()),
        _ => None,
    }
}

fn split_list(v: &Value) -> Vec<String> {
    v.as_str().map(|x| x.split(['\n', ';', '|', ',']).map(|y| y.trim().to_string()).filter(|y| !y.is_empty()).collect()).unwrap_or_default()
}

/// Eine OUTTRA-Variante (GTIN) in eine Artikelzeile übersetzen
pub fn outtra_item(v: &Value) -> Option<Item> {
    let a = &v["attributes"];
    let gtin: String = v["gtin"].as_str()?.chars().filter(|c| c.is_ascii_digit()).collect();
    // GTIN-14 mit führender Null = EAN-13
    let gtin = if gtin.len() == 14 && gtin.starts_with('0') { gtin[1..].to_string() } else { gtin };
    if gtin.len() < 8 {
        return None;
    }
    let t = |k: &str| a[k].as_str().map(|x| x.trim().to_string()).filter(|x| !x.is_empty());
    let mut it = Item { gtin, style: t("product_identifier").unwrap_or_default(), ..Default::default() };
    if it.style.is_empty() {
        it.style = t("sku_supplier").unwrap_or_else(|| it.gtin.clone());
    }
    it.name = t("product_short_description").unwrap_or_default();
    it.brand = a["brand"]["name"].as_str().unwrap_or("").to_string();
    it.color = t("manufacturer_color").or_else(|| t("base_color")).unwrap_or_else(|| "Standard".into());
    it.size = match (t("size_description"), t("size_description_2")) { (Some(x), Some(y)) => format!("{x}/{y}"), (Some(x), None) => x, _ => t("manufacturer_size_code").unwrap_or_else(|| "one size".into()) };
    it.price = t("rrp").and_then(|x| money(&x)).filter(|x| *x > 0);
    it.cost = t("wholesale_price").and_then(|x| money(&x)).filter(|x| *x > 0);
    let mut d = Map::new();
    let mut put = |k: &str, val: Option<String>| { if let Some(val) = val.filter(|x| !x.is_empty()) { d.insert(k.into(), json!(val)); } };
    put("fedas_code", t("fedas_code"));
    put("beschreibung", t("product_longtext"));
    put("zielgruppe", de_zielgruppe(a));
    put("saison", t("seasons"));
    put("herkunft", t("country_of_origin"));
    put("zolltarif", a["customs_tariff_eu"].as_i64().filter(|x| *x > 0).map(|x| x.to_string()).or_else(|| t("customs_tariff_eu")));
    put("hersteller_artikelnr", Some(it.style.clone()));
    put("farbbeschreibung", t("manufacturer_color"));
    put("mat_zusammensetzung", t("material"));
    put("mat_ober", t("outer_material").or_else(|| t("main_material")));
    put("mat_futter", t("inner_material").or_else(|| t("liner_material")));
    put("mat_fuellung", t("filling_material"));
    put("mat_sohle", t("sole"));
    put("groessenhinweis", t("size_range").map(|x| format!("Größenrahmen: {x}")));
    put("volumen_l", t("volume"));
    put("nachhaltigkeit", t("sustainability"));
    put("kategorie_hersteller", Some([t("category_level_1"), t("category_level_2")].into_iter().flatten().collect::<Vec<_>>().join(" › ")));
    put("pflege_symbole", t("textile_care_washing"));
    if let (Some(w), unit) = (a["weight"].as_f64().filter(|x| *x > 0.0), t("weight_unit").unwrap_or_else(|| "g".into())) {
        let g = if unit.eq_ignore_ascii_case("kg") { w * 1000.0 } else { w };
        put("gewicht_g", Some(format!("{}", g.round() as i64)));
        put("gewicht_hinweis", t("weight_info").map(|x| format!("Größe {x}")));
    }
    let mut feats = split_list(&a["usps"]);
    for f in split_list(&a["features"]) {
        if !feats.contains(&f) {
            feats.push(f);
        }
    }
    if !feats.is_empty() { d.insert("features".into(), json!(feats)); }
    let care = if a["care_instructions"].as_str().is_some_and(|x| !x.trim().is_empty()) { split_list(&a["care_instructions"]) } else {
        ["textile_care_washing", "textile_care_bleaching", "textile_care_drying", "textile_care_ironing", "textile_professional_textile_care"].iter().filter_map(|k| t(k)).collect()
    };
    if !care.is_empty() { d.insert("pflege".into(), json!(care)); }
    let mut tech = vec![];
    if a["goretex"] == json!(true) { tech.push("GORE-TEX".to_string()); }
    if a["vegan"] == json!(true) { tech.push("vegan".to_string()); }
    if !tech.is_empty() { d.insert("technologien".into(), json!(tech)); }
    if let Some(act) = t("activity") { d.insert("einsatz".into(), json!(split_list(&json!(act)))); }
    let mut docs = vec![];
    for (k, l) in [("product_instructions_url", "Bedienungsanleitung"), ("hazard_note", "Gefahrenhinweis"), ("size_table_shoes", "Größentabelle Schuhe"), ("size_table_men_url", "Größentabelle Herren"), ("size_table_women_url", "Größentabelle Damen"), ("size_table_kids_url", "Größentabelle Kinder"), ("hang_tag_url", "Hangtag")] {
        if let Some(u) = t(k).filter(|u| u.starts_with("http")) { docs.push(format!("{l} | {u}")); }
    }
    if !docs.is_empty() { d.insert("dokumente".into(), json!(docs)); }
    d.insert("outtra".into(), json!({ "product_set_id": v["outtra_product_set_id"], "color_set_id": v["outtra_color_set_id"], "aktualisiert": t("updated_at") }));
    it.details = d;
    let mut imgs: Vec<(i64, String, String)> = a["media"]["images"].as_array().cloned().unwrap_or_default().iter().filter_map(|i| {
        let u = i["url"].as_str()?.to_string();
        let cap = [i["shootType"].as_str(), i["productView"].as_str()].iter().flatten().filter(|x| !["unknown", "other", ""].contains(x)).map(|x| *x).collect::<Vec<_>>().join(" · ");
        Some((i["position"].as_i64().unwrap_or(999), u, cap))
    }).collect();
    imgs.sort_by_key(|x| x.0);
    for (_, u, cap) in imgs {
        it.images.push(u);
        it.captions.push(cap);
    }
    Some(it)
}

/// Alle Varianten einer Marke seitenweise abrufen (max. 30 je Seite), optional nur Änderungen seit einem Datum
fn outtra_items(c: &Connection, brand: &str, since: Option<&str>) -> Result<Vec<Item>, String> {
    let mut items = vec![];
    let mut url = format!("{}/api/v2/datahub/products?language=de&page%5Bsize%5D=30&page%5Bnumber%5D=1&filter%5Bbrand%5D={}", base(c), enc(brand));
    if let Some(d) = since {
        url.push_str(&format!("&filter%5BupdatedAfter%5D={}", enc(d)));
    }
    for _ in 0..3000 {
        let v = get_json(c, &url)?;
        let data = v["data"].as_array().cloned().unwrap_or_default();
        items.extend(data.iter().filter_map(outtra_item));
        match v["links"]["next"].as_str() {
            Some(n) if !n.is_empty() && !data.is_empty() => url = n.to_string(),
            _ => break,
        }
    }
    Ok(items)
}

pub fn manufacturers(c: &Connection) -> Result<Vec<Value>, String> {
    if !configured(c) {
        return Err(if provider(c) == "outtra" { "OUTTRA-Zugriffstoken fehlt (FEDAS › Verbindung)".into() } else { "Adresse der Schnittstelle ist nicht eingestellt (FEDAS › Verbindung)".into() });
    }
    if provider(c) == "outtra" {
        return outtra_brands(c);
    }
    let path = { let p = s(c, "fedas.pfad_hersteller"); if p.is_empty() { "/manufacturers".to_string() } else { p } };
    let v = get_json(c, &format!("{}{}", base(c), path))?;
    Ok(find_array(&v).into_iter().map(|m| {
        if let Some(o) = m.as_object() {
            json!({ "id": pick_s(o, &["id", "manufacturerid", "code", "herstellerid", "number"]).unwrap_or_default(), "name": pick_s(o, &["name", "manufacturername", "brand", "brandname", "hersteller"]).unwrap_or_default() })
        } else {
            json!({ "id": m.as_str().unwrap_or(""), "name": m.as_str().unwrap_or("") })
        }
    }).collect())
}

/// Gesamter Abgleich: gewählte Hersteller (oder alle) → Artikel → Katalog. Netzwerk ohne Datenbanksperre ist
/// Aufgabe des Aufrufers (eigene Verbindung).
pub fn sync(c: &mut Connection, user: &str, full: bool) -> Result<Stats, String> {
    let mans = manufacturers(c)?;
    let wanted: Vec<String> = db::setting_get(c, "fedas.hersteller").and_then(|v| v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(|y| y.to_lowercase())).collect())).unwrap_or_default();
    let sel: Vec<&Value> = mans.iter().filter(|m| wanted.is_empty() || wanted.contains(&m["id"].as_str().unwrap_or("").to_lowercase()) || wanted.contains(&m["name"].as_str().unwrap_or("").to_lowercase())).collect();
    if sel.is_empty() {
        return Err("Keine Hersteller gewählt bzw. gefunden".into());
    }
    let path = { let p = s(c, "fedas.pfad_artikel"); if p.is_empty() { "/manufacturers/{id}/items".to_string() } else { p } };
    let since_param = { let p = s(c, "fedas.seit_parameter"); if p.is_empty() { "modifiedSince".to_string() } else { p } };
    let last = s(c, "fedas.letzter_abgleich");
    let preise = b(c, "fedas.preise", true);
    let page_size = db::setting_get(c, "fedas.seitengroesse").and_then(|v| v.as_i64()).unwrap_or(0);
    let mut total = Stats::default();
    let mut errors = vec![];
    for m in sel {
        let id = m["id"].as_str().unwrap_or("");
        let name = m["name"].as_str().unwrap_or(id);
        let mut items: Vec<Item> = vec![];
        let mut page = 1;
        let outtra_mode = provider(c) == "outtra";
        let res: Result<(), String> = (|| {
            if outtra_mode {
                let since = if !full && !last.is_empty() { last.get(0..10) } else { None };
                items = outtra_items(c, id, since)?;
                return Ok(());
            }
            loop {
                let mut url = format!("{}{}", base(c), path.replace("{id}", id));
                let mut q = vec![];
                if !full && !last.is_empty() {
                    q.push(format!("{since_param}={}", last.get(0..10).unwrap_or("")));
                }
                if page_size > 0 {
                    q.push(format!("page={page}&pageSize={page_size}"));
                }
                if !q.is_empty() {
                    url.push(if url.contains('?') { '&' } else { '?' });
                    url.push_str(&q.join("&"));
                }
                let v = get_json(c, &url)?;
                let got = parse_items(&v);
                let n = got.len();
                items.extend(got.into_iter().map(|mut i| { if i.brand.is_empty() { i.brand = name.to_string(); } i }));
                if page_size == 0 || n == 0 || (n as i64) < page_size || page >= 200 {
                    return Ok(());
                }
                page += 1;
            }
        })();
        match res {
            Ok(()) => {
                let n_items = items.len();
                let r = apply_items(c, items, preise, user);
                match r {
                    Ok(s2) => {
                        let _ = c.execute("INSERT INTO fedas_log(ts, art, hersteller, neu, aktualisiert, uebersprungen, fehler, user) VALUES (?1,'abgleich',?2,?3,?4,?5,'',?6)", params![db::now(), name, s2.neu, s2.aktualisiert, s2.uebersprungen, user]);
                        total.neu += s2.neu; total.aktualisiert += s2.aktualisiert; total.uebersprungen += s2.uebersprungen; total.bilder += s2.bilder;
                        let _ = n_items;
                    }
                    Err(e) => { let _ = c.execute("INSERT INTO fedas_log(ts, art, hersteller, fehler, user) VALUES (?1,'abgleich',?2,?3,?4)", params![db::now(), name, e, user]); errors.push(format!("{name}: {e}")); }
                }
            }
            Err(e) => {
                let _ = c.execute("INSERT INTO fedas_log(ts, art, hersteller, fehler, user) VALUES (?1,'abgleich',?2,?3,?4)", params![db::now(), name, e, user]);
                errors.push(format!("{name}: {e}"));
            }
        }
    }
    let _ = db::setting_set(c, "fedas.letzter_abgleich", &json!(db::now()));
    let _ = db::setting_set(c, "fedas.letztes_ergebnis", &json!({ "zeit": db::now(), "neu": total.neu, "aktualisiert": total.aktualisiert, "uebersprungen": total.uebersprungen, "fehler": errors }));
    if !errors.is_empty() && total.neu + total.aktualisiert + total.uebersprungen == 0 {
        return Err(errors.join(" · "));
    }
    Ok(total)
}

pub fn log_list(c: &Connection, limit: i64) -> Result<Vec<Value>, String> {
    let mut st = c.prepare("SELECT id, ts, art, hersteller, neu, aktualisiert, uebersprungen, fehler, user FROM fedas_log ORDER BY id DESC LIMIT ?1").map_err(|e| e.to_string())?;
    let rows = st.query_map([limit], |r| Ok(json!({ "id": r.get::<_, i64>(0)?, "ts": r.get::<_, String>(1)?, "art": r.get::<_, String>(2)?, "hersteller": r.get::<_, String>(3)?, "neu": r.get::<_, i64>(4)?, "aktualisiert": r.get::<_, i64>(5)?, "uebersprungen": r.get::<_, i64>(6)?, "fehler": r.get::<_, String>(7)?, "user": r.get::<_, Option<String>>(8)? }))).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// Hintergrund-Dienst: täglicher Abgleich zur eingestellten Uhrzeit und Nachladen vorgemerkter Bilder
pub fn start_worker(db_path: std::path::PathBuf) {
    std::thread::spawn(move || {
        let Ok(mut c) = db::open(&db_path) else { return };
        let _ = c.busy_timeout(Duration::from_secs(10));
        let dd = db_path.parent().map(Path::to_path_buf).unwrap_or_default();
        let check_every = match std::env::var("KONTOR_FEDAS_TICK").ok().and_then(|v| v.parse::<u64>().ok()) { Some(t) if t > 0 => Duration::from_secs(t), _ => Duration::from_secs(300) };
        let mut last_check = std::time::Instant::now() - check_every;
        loop {
            // 1) FEDAS fällig? (zuerst, damit lange Bilder-Läufe den Abgleich nicht aufhalten)
            if last_check.elapsed() >= check_every {
                last_check = std::time::Instant::now();
                if b(&c, "fedas.auto", false) && configured(&c) {
                    let now = chrono::Local::now();
                    let zeit = { let z = s(&c, "fedas.zeit"); if z.len() == 5 { z } else { "03:30".to_string() } };
                    let today = now.format("%Y-%m-%d").to_string();
                    let last = s(&c, "fedas.letzter_abgleich");
                    let due = last.get(0..10) != Some(today.as_str()) && now.format("%H:%M").to_string() >= zeit;
                    // nach einem Fehlschlag frühestens nach einer Stunde erneut
                    let retry_ok = s(&c, "fedas.letzter_versuch").get(0..13).map(|x| x != now.format("%Y-%m-%dT%H").to_string()).unwrap_or(true);
                    if due && retry_ok {
                        let _ = db::setting_set(&c, "fedas.letzter_versuch", &json!(db::now()));
                        match sync(&mut c, "Automatik", false) {
                            Ok(st) => { let _ = db::audit_append(&c, "fedas.auto", &json!({ "neu": st.neu, "aktualisiert": st.aktualisiert })); }
                            Err(e) => { let _ = db::audit_append(&c, "fedas.auto.fehler", &json!({ "fehler": e })); }
                        }
                    }
                }
            }
            // 2) Bilder-Warteschlange abarbeiten (kurze Läufe, damit Punkt 1 regelmäßig drankommt)
            let mut busy = false;
            for _ in 0..3 {
                match media::fetch_pending(&c, &dd, 8) {
                    Ok((ok, bad, rest)) => {
                        let _ = db::setting_set(&c, "medien.offen", &json!(rest));
                        busy = ok + bad > 0 && rest > 0;
                        if !busy { break; }
                    }
                    Err(_) => break,
                }
            }
            std::thread::sleep(Duration::from_secs(if busy { 1 } else { 10 }));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outtra_antwort_wird_uebernommen() {
        // Aufbau laut https://api.outtra.com/docs (GET /api/v2/datahub/products)
        let v = json!({ "data": [
            { "type": "variant", "gtin": "01234567891234", "outtra_product_set_id": 123456, "outtra_color_set_id": 1, "attributes": {
                "gln": "supplier-1", "product_identifier": "784544", "product_short_description": "Men's Rain Jacket", "brand": { "id": "845", "name": "Example Brand" },
                "media": { "images": [
                    { "url": "http://x/b.jpg", "position": 2, "shootType": "model", "productView": "front" },
                    { "url": "http://x/a.png", "position": 1, "shootType": "hollow", "productView": "front" } ] },
                "fedas_code": "201042", "category_level_1": "Clothing", "category_level_2": "Jackets", "sex": "Male", "kids": false,
                "country_of_origin": "VN", "customs_tariff_eu": 62011290, "product_longtext": "Wasserdicht.", "usps": "Atmungsaktiv; Verschweißte Nähte", "activity": "Hiking",
                "goretex": true, "material": "80% Cotton|20% Polyester", "outer_material": "100% Polyamid", "care_instructions": "Wash at 30°C, Do not bleach",
                "manufacturer_color": "green moss", "base_color": "green", "seasons": "Autumn / Winter 2023", "size_description": "L", "size_description_2": "32",
                "weight": 0.38, "weight_unit": "kg", "wholesale_price": "85,00", "rrp": "199,99", "rrp_unit": "EUR", "product_instructions_url": "https://x/manual.pdf" } },
            { "type": "variant", "gtin": "123", "attributes": {} } ]});
        let items: Vec<Item> = v["data"].as_array().unwrap().iter().filter_map(outtra_item).collect();
        assert_eq!(items.len(), 1);
        let it = &items[0];
        assert_eq!((it.gtin.as_str(), it.style.as_str(), it.color.as_str(), it.size.as_str(), it.price, it.cost), ("1234567891234", "784544", "green moss", "L/32", Some(19999), Some(8500)));
        assert_eq!(it.images, vec!["http://x/a.png", "http://x/b.jpg"]);
        assert_eq!(it.captions[0], "hollow · front");
        assert_eq!(it.details["zielgruppe"], json!("Herren"));
        assert_eq!(it.details["gewicht_g"], json!("380"));
        assert_eq!(it.details["technologien"], json!(["GORE-TEX"]));
        assert_eq!(it.details["features"], json!(["Atmungsaktiv", "Verschweißte Nähte"]));
        assert_eq!(it.details["pflege"], json!(["Wash at 30°C", "Do not bleach"]));
        assert_eq!(it.details["dokumente"], json!(["Bedienungsanleitung | https://x/manual.pdf"]));
        assert_eq!(it.details["zolltarif"], json!("62011290"));
        let mut c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let st = apply_items(&mut c, items, true, "t").unwrap();
        assert_eq!((st.neu, st.bilder), (1, 2));
        let cat: String = c.query_row("SELECT category FROM articles", [], |r| r.get(0)).unwrap();
        assert_eq!(cat, "jacken");
        let cap: String = c.query_row("SELECT caption FROM article_media ORDER BY pos LIMIT 1", [], |r| r.get(0)).unwrap();
        assert_eq!(cap, "hollow · front");
        assert_eq!(provider(&c), "outtra");
    }

    #[test]
    fn normalisieren_und_uebernehmen() {
        let mut c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let v = json!({ "items": [
            { "ItemNumber": "L47000", "Name": "Alpha Jacke", "Brand": "Nordwand", "FedasCode": "010203", "RetailPrice": "299,90", "Description": "Leicht.", "Features": ["Wasserdicht", "Atmungsaktiv"], "Images": ["http://x/a.jpg"],
              "Variants": [ { "EAN": "4000000000011", "Colour": "Schwarz", "Size": "M" }, { "EAN": "4000000000028", "Colour": "Schwarz", "Size": "L" }, { "EAN": "4000000000035", "Colour": "Rot", "Size": "M" } ] },
            { "gtin": "123", "name": "kaputt" }
        ]});
        let items = parse_items(&v);
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].price, Some(29990));
        let s1 = apply_items(&mut c, items.clone(), true, "t").unwrap();
        assert_eq!((s1.neu, s1.bilder), (1, 3));
        let n: i64 = c.query_row("SELECT COUNT(*) FROM variants", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 3);
        let col: String = c.query_row("SELECT data FROM stamm WHERE kind='hausfarbe' AND id='schwarz'", [], |r| r.get(0)).unwrap();
        assert!(col.contains("Schwarz") && col.contains("#22252b"));
        // zweiter Lauf: Preis geändert, neue Variante
        let mut v2 = v.clone();
        v2["items"][0]["RetailPrice"] = json!("279,90");
        v2["items"][0]["Variants"].as_array_mut().unwrap().push(json!({ "EAN": "4000000000042", "Colour": "Rot", "Size": "L" }));
        let s2 = apply_items(&mut c, parse_items(&v2), true, "t").unwrap();
        assert_eq!((s2.neu, s2.aktualisiert), (0, 1));
        let (p, nv): (i64, i64) = (c.query_row("SELECT price FROM articles", [], |r| r.get(0)).unwrap(), c.query_row("SELECT COUNT(*) FROM variants", [], |r| r.get(0)).unwrap());
        assert_eq!((p, nv), (27990, 4));
        // ohne Preisübernahme bleibt der Preis
        v2["items"][0]["RetailPrice"] = json!("199,90");
        apply_items(&mut c, parse_items(&v2), false, "t").unwrap();
        assert_eq!(c.query_row("SELECT price FROM articles", [], |r| r.get::<_, i64>(0)).unwrap(), 27990);
        let d: String = c.query_row("SELECT details FROM articles", [], |r| r.get(0)).unwrap();
        assert!(d.contains("010203") && d.contains("Wasserdicht"));
        // CSV
        let csv = parse_csv("EAN;Artikelnummer;Bezeichnung;Marke;Farbe;Größe;UVP\n4000000000059;X1;Test;Nordwand;Blau;42;99,95\n");
        let it = parse_items(&csv);
        assert_eq!((it.len(), it[0].price, it[0].size.as_str()), (1, Some(9995), "42"));
        assert_eq!(slug("Blau/Grün Ä"), "blau-grun-a");
    }
}
