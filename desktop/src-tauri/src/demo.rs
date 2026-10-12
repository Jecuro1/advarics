//! Demo-Sortiment mit Marken-Artikeln (Salomon, Atomic, LOWA, On, Mammut …): Stammdaten aus dem eingebauten
//! Katalog (Texte und Bild-Adressen der Markenseiten). Die Bilder werden NICHT mitgeliefert, sondern im
//! Hintergrund von den Markenseiten geladen und lokal gespeichert.

use crate::{catalog, db, fedas, media};
use rusqlite::{Connection, Transaction};
use serde_json::{json, Map, Value};

const CATALOG: &str = include_str!("../../demo-data/brand_catalog.json");

fn ean13(prefix12: &str) -> String {
    let sum: u32 = prefix12.chars().enumerate().map(|(i, c)| c.to_digit(10).unwrap_or(0) * if i % 2 == 0 { 1 } else { 3 }).sum();
    format!("{prefix12}{}", (10 - sum % 10) % 10)
}

fn hash(s: &str) -> u64 {
    s.bytes().fold(1469598103934665603u64, |h, b| (h ^ b as u64).wrapping_mul(1099511628211))
}

fn default_sizes(cat: &str) -> Vec<String> {
    match cat {
        "schuhe" => ["39", "40", "41", "42", "43", "44", "45"].iter().map(|s| s.to_string()).collect(),
        "ski" => ["160", "166", "172", "178"].iter().map(|s| s.to_string()).collect(),
        "acc" | "rucksaecke" => vec!["one size".into()],
        _ => ["S", "M", "L", "XL"].iter().map(|s| s.to_string()).collect(),
    }
}

fn text(v: &Value) -> Option<String> {
    v.as_str().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}
fn list(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().filter_map(text).collect()).unwrap_or_default()
}

pub fn count() -> usize {
    serde_json::from_str::<Vec<Value>>(CATALOG).map(|v| v.len()).unwrap_or(0)
}

/// Legt alle Demo-Artikel an (vorhandene Artikel-Nummern werden übersprungen). Liefert (Artikel, Bilder).
pub fn seed(c: &mut Connection) -> Result<(usize, usize), String> {
    let arts: Vec<Value> = serde_json::from_str(CATALOG).map_err(|e| e.to_string())?;
    let (mut n, mut imgs) = (0, 0);
    let mut counter: i64 = c.query_row("SELECT COUNT(*) FROM variants", [], |r| r.get(0)).unwrap_or(0);
    for a in &arts {
        let tx: Transaction = c.transaction().map_err(|e| e.to_string())?;
        let brand = text(&a["brand"]).unwrap_or_default();
        let name = text(&a["name"]).unwrap_or_default();
        let no = text(&a["article_no"]).unwrap_or_else(|| fedas::slug(&name));
        let id = format!("{}-{}", fedas::slug(&brand).to_uppercase().chars().take(4).collect::<String>(), fedas::slug(&no).to_uppercase());
        let price = (a["price_eur"].as_f64().unwrap_or(0.0) * 100.0).round() as i64;
        if name.is_empty() || price <= 0 {
            continue;
        }
        let exists: bool = tx.query_row("SELECT 1 FROM articles WHERE id = ?1", [&id], |_| Ok(true)).unwrap_or(false);
        if exists {
            continue;
        }
        let cat = text(&a["category"]).filter(|k| ["jacken", "hosen", "schuhe", "ski", "shirts", "rucksaecke", "acc"].contains(&k.as_str())).unwrap_or_else(|| "acc".into());
        let mut sizes = list(&a["sizes"]);
        if sizes.is_empty() {
            sizes = default_sizes(&cat);
        }
        let colors_in: Vec<Value> = a["colors"].as_array().cloned().unwrap_or_default();
        let colors_in = if colors_in.is_empty() { vec![json!({ "name": "Standard", "images": [] })] } else { colors_in };
        let mut colors = vec![];
        let mut variants = vec![];
        for col in &colors_in {
            let ck = fedas::ensure_color(&tx, &text(&col["name"]).unwrap_or_else(|| "Standard".into()));
            if colors.contains(&ck) {
                continue;
            }
            colors.push(ck.clone());
            for sz in &sizes {
                counter += 1;
                variants.push(catalog::Variant { id: None, color: ck.clone(), size: sz.clone(), ean: ean13(&format!("2{:011}", 700000000 + counter)), stock: (hash(&format!("{id}{ck}{sz}")) % 7) as i64 });
            }
        }
        let mut d = Map::new();
        let mut put = |k: &str, v: Option<String>| { if let Some(v) = v { d.insert(k.into(), json!(v)); } };
        put("kurztext", text(&a["short"]));
        put("beschreibung", text(&a["description"]));
        put("zielgruppe", text(&a["gender"]));
        put("saison", text(&a["model_year"]));
        put("herkunft", text(&a["origin"]));
        put("hersteller_artikelnr", text(&a["article_no"]));
        put("quelle_url", text(&a["source_url"]));
        put("gewicht_g", a["weight_g"].as_f64().map(|w| format!("{}", w.round() as i64)));
        let mut rest = vec![];
        if let Some(m) = a["material"].as_object() {
            for (k, v) in m {
                let Some(v) = text(v) else { continue };
                match k.to_lowercase().as_str() {
                    "obermaterial" | "oberstoff" | "außenmaterial" | "aussenmaterial" | "schaft" => { d.insert("mat_ober".into(), json!(v)); }
                    "futter" | "innenfutter" => { d.insert("mat_futter".into(), json!(v)); }
                    "füllung" | "fuellung" | "isolation" | "wattierung" => { d.insert("mat_fuellung".into(), json!(v)); }
                    "sohle" | "laufsohle" => { d.insert("mat_sohle".into(), json!(v)); }
                    "membran" => { d.insert("mat_membran".into(), json!(v)); }
                    _ => rest.push(format!("{k}: {v}")),
                }
            }
        } else if let Some(t) = text(&a["material"]) {
            rest.push(t);
        }
        if !rest.is_empty() {
            d.insert("mat_zusammensetzung".into(), json!(rest.join("\n")));
        }
        for (k, src) in [("features", "features"), ("pflege", "care"), ("technologien", "technologies")] {
            let l = list(&a[src]);
            if !l.is_empty() {
                d.insert(k.into(), json!(l));
            }
        }
        d.insert("quelle".into(), json!("Demo-Sortiment (Markenseite)"));
        let art = catalog::Article {
            id: id.clone(), name, brand, category: cat, glyph: "shirt".into(), price, sale_price: None, vat: 20, tag: None,
            popularity: 50 + (hash(&id) % 49) as i64, colors, sizes, fields: json!({ "Saison": text(&a["model_year"]).unwrap_or_default() }), prompts: Value::Null,
            active: true, variants: variants.clone(), cost: Some((price as f64 / 1.2 * 0.5).round() as i64), supplier_id: None, min_stock: 2, image: None,
            details: Value::Object(d), media: vec![],
        };
        catalog::save(&tx, &art)?;
        for v in &variants {
            if v.stock > 0 {
                let vid: i64 = tx.query_row("SELECT id FROM variants WHERE ean = ?1", [&v.ean], |r| r.get(0)).map_err(|e| e.to_string())?;
                catalog::book(&tx, vid, v.stock, true, "Anfangsbestand", None, Some("System"))?;
            }
        }
        for col in &colors_in {
            let ck = fedas::slug(&text(&col["name"]).unwrap_or_default());
            for u in list(&col["images"]).iter().take(8) {
                media::queue_url(&tx, &id, u, &ck)?;
                imgs += 1;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        n += 1;
    }
    let _ = db::audit_append(c, "catalog.demo.marken", &json!({ "artikel": n, "bilder": imgs }));
    Ok((n, imgs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marken_demo_wird_angelegt() {
        let mut c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let (n, imgs) = seed(&mut c).unwrap();
        assert!(n >= 20, "zu wenige Demo-Artikel: {n}");
        assert!(imgs > n, "zu wenige Bilder: {imgs}");
        let brands: i64 = c.query_row("SELECT COUNT(DISTINCT brand) FROM articles", [], |r| r.get(0)).unwrap();
        assert!(brands >= 15);
        let bad: i64 = c.query_row("SELECT COUNT(*) FROM articles a WHERE NOT EXISTS (SELECT 1 FROM variants v WHERE v.article_id = a.id)", [], |r| r.get(0)).unwrap();
        assert_eq!(bad, 0);
        let (again, _) = seed(&mut c).unwrap();
        assert_eq!(again, 0);
        let list = catalog::list(&c).unwrap();
        assert!(list.iter().all(|a| a.details.get("quelle").is_some() && !a.media.is_empty() || a.media.is_empty()));
        assert!(list.iter().filter(|a| a.details["beschreibung"].is_string()).count() > n / 2);
    }
}
