//! Import eines Advarics-Artikelexports (XLSX „GridExport“): Marke, Artikel-Nr., Name, Farbe, EK, VK, Bestand,
//! Hauptlieferant, Warengruppe, Saison, Lagerplatz – inklusive der in der Tabelle eingebetteten Artikelbilder
//! und Bild-Links. Mehrere Zeilen derselben Artikelnummer werden zu einem Artikel mit mehreren Farben.

use crate::{catalog, db, fedas, images, media, purchasing};
use calamine::{Data, Reader, Xlsx};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::path::Path;

#[derive(Default, Clone, Debug)]
pub struct Row {
    pub zeile: usize,
    pub marke: String,
    pub nr: String,
    pub name: String,
    pub farbe_nr: String,
    pub farbe: String,
    pub haus_farbe: String,
    pub ek: Option<i64>,
    pub vk: Option<i64>,
    pub best: i64,
    pub lief_nr: String,
    pub lief: String,
    pub wg: String,
    pub wg_nr: String,
    pub saison: String,
    pub lagerplatz: String,
    pub adv_id: String,
    pub katalog: String,
    pub ext_nr: String,
    pub inaktiv: bool,
    pub rabattsperre: bool,
    pub bild_url: String,
}

fn txt(d: &Data) -> String {
    match d {
        Data::String(s) => s.trim().to_string(),
        Data::Float(f) => if f.fract() == 0.0 { format!("{}", *f as i64) } else { f.to_string() },
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => (if *b { "ja" } else { "nein" }).into(),
        Data::DateTime(_) | Data::DateTimeIso(_) | Data::DurationIso(_) | Data::Error(_) | Data::Empty => String::new(),
    }
}
fn num(d: &Data) -> Option<f64> {
    match d {
        Data::Float(f) => Some(*f),
        Data::Int(i) => Some(*i as f64),
        Data::String(s) => s.trim().replace(',', ".").parse().ok(),
        _ => None,
    }
}
fn flag(d: &Data) -> bool {
    match d {
        Data::Bool(b) => *b,
        Data::String(s) => matches!(s.trim().to_lowercase().as_str(), "ja" | "true" | "1" | "wahr"),
        Data::Int(i) => *i != 0,
        Data::Float(f) => *f != 0.0,
        _ => false,
    }
}
fn cents(v: Option<f64>) -> Option<i64> {
    v.filter(|x| *x > 0.0).map(|x| (x * 100.0).round() as i64)
}

fn marke_clean(m: &str) -> String {
    m.replace(['®', '™', '©'], "").trim().to_string()
}

/// Zeilen aus dem ersten Tabellenblatt lesen (Spalten über die Kopfzeile erkannt)
pub fn read_rows(path: &Path) -> Result<Vec<Row>, String> {
    let mut wb: Xlsx<_> = calamine::open_workbook(path).map_err(|e| format!("Datei nicht lesbar (XLSX erwartet): {e}"))?;
    let range = wb.worksheet_range_at(0).ok_or("Die Datei enthält kein Tabellenblatt")?.map_err(|e| e.to_string())?;
    let (r0, c0) = range.start().unwrap_or((0, 0));
    let mut rows = range.rows();
    let head: Vec<String> = rows.next().ok_or("Tabelle ist leer")?.iter().map(|d| txt(d).to_lowercase()).collect();
    let col = |names: &[&str]| -> Option<usize> { head.iter().position(|h| names.iter().any(|n| h == n)) };
    let (cm, cn, cname) = (col(&["marke"]), col(&["artikel-nr.", "artikelnr.", "artikel-nr", "artikelnummer"]), col(&["artikel-name", "artikelname", "bezeichnung"]));
    let (Some(cm), Some(cn), Some(cname)) = (cm, cn, cname) else {
        return Err("Spalten „Marke“, „Artikel-Nr.“ und „Artikel-Name“ nicht gefunden – ist das ein Advarics-Artikelexport?".into());
    };
    let c_fnr = col(&["lief.-farb-nr.", "lief.-farb-nr"]);
    let c_f = col(&["lief.-farb-name"]);
    let c_hf = col(&["haus-farb-name"]);
    let (c_ek, c_vk, c_visu, c_best) = (col(&["ek"]), col(&["vk"]), col(&["visu. vk"]), col(&["best.", "bestand"]));
    let (c_ln, c_l) = (col(&["hpt. lief. nr.", "hpt. lief. nr"]), col(&["hpt. lief. name"]));
    let (c_wg, c_wgn) = (col(&["warengruppe"]), col(&["warengruppen-nr.", "warengruppen-nr"]));
    let (c_s, c_lp, c_id) = (col(&["letzter we-saison-name", "saison"]), col(&["lagerplatznummer", "lagerplatz"]), col(&["artikel-id"]));
    let (c_kn, c_k, c_ext, c_in, c_rs, c_b) = (col(&["katalog-nr."]), col(&["katalog-name"]), col(&["ext. art.-nr."]), col(&["inaktiv"]), col(&["rabattsperre"]), col(&["bild"]));
    let get = |r: &[Data], c: Option<usize>| -> Data { c.and_then(|i| r.get(i)).cloned().unwrap_or(Data::Empty) };
    let mut out = vec![];
    for (i, r) in rows.enumerate() {
        let (marke, nr, name) = (marke_clean(&txt(&r[cm])), txt(&r[cn]), txt(&r[cname]));
        if nr.is_empty() && name.is_empty() {
            continue; // Leer- und Summenzeilen
        }
        let ek = cents(num(&get(r, c_ek)));
        let vk = cents(num(&get(r, c_vk))).or_else(|| cents(num(&get(r, c_visu))));
        let best = num(&get(r, c_best)).map(|x| x.round() as i64).unwrap_or(0);
        let bild = txt(&get(r, c_b));
        out.push(Row {
            zeile: r0 as usize + i + 1,
            marke, nr, name: name.trim_start_matches('*').trim().to_string(),
            farbe_nr: txt(&get(r, c_fnr)), farbe: txt(&get(r, c_f)), haus_farbe: txt(&get(r, c_hf)),
            ek, vk, best,
            lief_nr: txt(&get(r, c_ln)), lief: txt(&get(r, c_l)), wg: txt(&get(r, c_wg)), wg_nr: txt(&get(r, c_wgn)),
            saison: txt(&get(r, c_s)), lagerplatz: txt(&get(r, c_lp)), adv_id: txt(&get(r, c_id)),
            katalog: [txt(&get(r, c_k)), txt(&get(r, c_kn))].into_iter().find(|x| !x.is_empty()).unwrap_or_default(),
            ext_nr: txt(&get(r, c_ext)),
            inaktiv: flag(&get(r, c_in)), rabattsperre: flag(&get(r, c_rs)),
            bild_url: if bild.starts_with("http") { bild } else { String::new() },
        });
        let _ = c0;
    }
    Ok(out)
}

/* ── Eingebettete Bilder (xl/drawings → xl/media) ── */

fn read_entry(z: &mut zip::ZipArchive<std::io::BufReader<std::fs::File>>, name: &str) -> Option<Vec<u8>> {
    let mut f = z.by_name(name).ok()?;
    let mut b = Vec::with_capacity(f.size().min(64 << 20) as usize);
    f.read_to_end(&mut b).ok()?;
    Some(b)
}

fn attr_of(tag: &str, name: &str) -> Option<String> {
    let k = format!("{name}=\"");
    let i = tag.find(&k)? + k.len();
    Some(tag[i..i + tag[i..].find('"')?].to_string())
}

/// Tabellenzeile (0-basiert, wie in `Row::zeile`) → Pfad des eingebetteten Bildes im Archiv
pub fn embedded_images(path: &Path) -> HashMap<usize, String> {
    let mut out = HashMap::new();
    let Ok(f) = std::fs::File::open(path) else { return out };
    let Ok(mut z) = zip::ZipArchive::new(std::io::BufReader::new(f)) else { return out };
    let Some(rels) = read_entry(&mut z, "xl/worksheets/_rels/sheet1.xml.rels") else { return out };
    let rels = String::from_utf8_lossy(&rels).to_string();
    let drawing = rels.split("<Relationship ").find(|t| t.contains("/drawing")).and_then(|t| attr_of(t, "Target"));
    let Some(drawing) = drawing else { return out };
    let dname = format!("xl/drawings/{}", drawing.rsplit('/').next().unwrap_or(""));
    let (Some(dxml), Some(drels)) = (read_entry(&mut z, &dname), read_entry(&mut z, &format!("xl/drawings/_rels/{}.rels", drawing.rsplit('/').next().unwrap_or("")))) else { return out };
    let (dxml, drels) = (String::from_utf8_lossy(&dxml).to_string(), String::from_utf8_lossy(&drels).to_string());
    let mut target: HashMap<String, String> = HashMap::new();
    for t in drels.split("<Relationship ").skip(1) {
        if let (Some(id), Some(tg)) = (attr_of(t, "Id"), attr_of(t, "Target")) {
            target.insert(id, format!("xl/media/{}", tg.rsplit('/').next().unwrap_or("")));
        }
    }
    for blk in dxml.split("<xdr:from>").skip(1) {
        let Some(row) = blk.split("<xdr:row>").nth(1).and_then(|x| x.split('<').next()).and_then(|x| x.trim().parse::<usize>().ok()) else { continue };
        let Some(emb) = blk.split("r:embed=\"").nth(1).and_then(|x| x.split('"').next()) else { continue };
        if let Some(t) = target.get(emb) {
            out.entry(row).or_insert_with(|| t.clone());
        }
    }
    out
}

/* ── Import ── */

#[derive(Default, Clone)]
pub struct Opts {
    pub inaktiv: bool,
    pub bestand: bool,
    pub preise: bool,
    pub bilder: bool,
    pub demo_weg: bool,
}

fn ean13(prefix12: &str) -> String {
    let sum: u32 = prefix12.chars().enumerate().map(|(i, c)| c.to_digit(10).unwrap_or(0) * if i % 2 == 0 { 1 } else { 3 }).sum();
    format!("{prefix12}{}", (10 - sum % 10) % 10)
}

fn progress(c: &Connection, phase: &str, done: usize, total: usize) {
    let _ = db::setting_set(c, "import.fortschritt", &json!({ "phase": phase, "fertig": done, "gesamt": total, "zeit": db::now() }));
}

fn group<'a>(rows: &'a [Row], o: &Opts) -> (BTreeMap<(String, String), Vec<&'a Row>>, usize) {
    let mut g: BTreeMap<(String, String), Vec<&Row>> = BTreeMap::new();
    let mut inactive = 0;
    for r in rows {
        if r.inaktiv && !o.inaktiv {
            inactive += 1;
            continue;
        }
        g.entry((r.marke.to_lowercase(), r.nr.clone())).or_default().push(r);
    }
    (g, inactive)
}

/// Vorschau ohne Schreiben
pub fn preview(path: &Path) -> Result<Value, String> {
    let rows = read_rows(path)?;
    let imgs = embedded_images(path);
    let o = Opts { inaktiv: true, ..Default::default() };
    let (g, _) = group(&rows, &o);
    let mut brands: BTreeMap<String, usize> = BTreeMap::new();
    rows.iter().for_each(|r| *brands.entry(r.marke.clone()).or_default() += 1);
    let mut top: Vec<_> = brands.iter().collect();
    top.sort_by(|a, b| b.1.cmp(a.1));
    let no_vk: Vec<&Row> = rows.iter().filter(|r| r.vk.is_none()).collect();
    let uniq = |f: &dyn Fn(&Row) -> String| rows.iter().map(f).filter(|x| !x.is_empty()).collect::<std::collections::HashSet<_>>().len();
    Ok(json!({
        "zeilen": rows.len(), "artikel": g.len(), "marken": brands.len(), "lieferanten": uniq(&|r| r.lief.clone()), "warengruppen": uniq(&|r| r.wg.clone()),
        "inaktiv": rows.iter().filter(|r| r.inaktiv).count(), "ohne_vk": no_vk.len(), "ohne_ek": rows.iter().filter(|r| r.ek.is_none()).count(),
        "bestand": rows.iter().map(|r| r.best).sum::<i64>(), "bilder_eingebettet": imgs.len(), "bilder_links": rows.iter().filter(|r| !r.bild_url.is_empty()).count(),
        "negativ": rows.iter().filter(|r| r.best < 0).count(),
        "top_marken": top.iter().take(12).map(|(k, v)| json!([k, v])).collect::<Vec<_>>(),
        "beispiele": rows.iter().take(6).map(|r| json!({ "marke": r.marke, "nr": r.nr, "name": r.name, "farbe": r.farbe, "vk": r.vk, "best": r.best, "gruppe": r.wg })).collect::<Vec<_>>(),
    }))
}

fn merge_details(cur: &str, add: &Map<String, Value>) -> String {
    let mut v: Value = serde_json::from_str(cur).unwrap_or(json!({}));
    if !v.is_object() {
        v = json!({});
    }
    for (k, x) in add {
        v[k] = x.clone();
    }
    v.to_string()
}

pub fn import(c: &mut Connection, data_dir: &Path, path: &Path, o: &Opts, user: &str) -> Result<Value, String> {
    progress(c, "lesen", 0, 0);
    let rows = read_rows(path)?;
    let demo_entfernt = if o.demo_weg { c.execute("UPDATE articles SET active = 0, updated_at = ?1 WHERE active = 1 AND details LIKE '%\"quelle\":\"Demo-Sortiment%'", [db::now()]).map_err(|e| e.to_string())? } else { 0 };
    let imgs = if o.bilder { embedded_images(path) } else { HashMap::new() };
    let (groups, inactive) = group(&rows, o);
    let total = groups.len();
    let (mut neu, mut upd, mut varianten, mut eingebettet, mut urls) = (0usize, 0usize, 0usize, 0usize, 0usize);
    let mut ohne_vk: Vec<String> = vec![];
    let mut fehler: Vec<String> = vec![];
    let mut sup_cache: HashMap<String, String> = HashMap::new();
    let mut wg_new = 0usize;
    let mut sup_new = 0usize;
    let mut pending_imgs: Vec<(String, String, String)> = vec![]; // (Artikel, Farbschlüssel, Archivpfad)
    for (n, (_, list)) in groups.iter().enumerate() {
        if n % 25 == 0 {
            progress(c, "artikel", n, total);
        }
        let first = list[0];
        let Some(price) = list.iter().find_map(|r| r.vk) else {
            ohne_vk.push(format!("{} {}", first.nr, first.name));
            continue;
        };
        let tx = c.transaction().map_err(|e| e.to_string())?;
        let id = {
            let base = format!("{}-{}", fedas::slug(&first.marke).to_uppercase().chars().take(4).collect::<String>(), fedas::slug(&first.nr).to_uppercase());
            let other: Option<String> = tx.query_row("SELECT brand FROM articles WHERE id = ?1", [&base], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
            match other {
                Some(b) if fedas::slug(&b) != fedas::slug(&first.marke) => format!("{base}-{}", first.adv_id),
                _ => base,
            }
        };
        // Lieferant
        let sup_key = format!("{}|{}", first.lief_nr, first.lief);
        let supplier = if first.lief.is_empty() { None } else {
            Some(match sup_cache.get(&sup_key) {
                Some(s) => s.clone(),
                None => {
                    let sid = format!("ADV-{}", if first.lief_nr.is_empty() { fedas::slug(&first.lief).to_uppercase() } else { first.lief_nr.clone() });
                    let exists: bool = tx.query_row("SELECT 1 FROM suppliers WHERE id = ?1", [&sid], |_| Ok(true)).optional().map_err(|e| e.to_string())?.unwrap_or(false);
                    if !exists {
                        purchasing::supplier_save(&tx, &purchasing::Supplier { id: sid.clone(), name: first.lief.clone(), customer_no: first.lief_nr.clone(), lead_days: 7, ..Default::default() })?;
                        sup_new += 1;
                    }
                    sup_cache.insert(sup_key, sid.clone());
                    sid
                }
            })
        };
        // Warengruppe → Stammdaten
        let cat = if first.wg.is_empty() { "acc".to_string() } else {
            let cid = if first.wg_nr.is_empty() || first.wg_nr == "0" { format!("adv-{}", fedas::slug(&first.wg)) } else { format!("adv-{}", first.wg_nr) };
            let ex: bool = tx.query_row("SELECT 1 FROM stamm WHERE kind = 'warengruppe' AND id = ?1", [&cid], |_| Ok(true)).optional().map_err(|e| e.to_string())?.unwrap_or(false);
            if !ex {
                let pos: i64 = tx.query_row("SELECT COALESCE(MAX(pos), -1) + 1 FROM stamm WHERE kind = 'warengruppe'", [], |r| r.get(0)).unwrap_or(0);
                let prefix: String = first.wg.split_whitespace().take(2).collect::<Vec<_>>().join(" ");
                tx.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES ('warengruppe', ?1, ?2, ?3, 1, ?4)", params![cid, json!({ "name": first.wg, "ust": 20, "gruppe": prefix }).to_string(), pos, db::now()]).map_err(|e| e.to_string())?;
                wg_new += 1;
            }
            cid
        };
        // Farben/Varianten
        let mut variants: Vec<(catalog::Variant, &Row)> = vec![];
        let mut seen: HashMap<String, usize> = HashMap::new();
        for r in list {
            let cname = [&r.farbe, &r.haus_farbe].into_iter().find(|x| !x.is_empty() && x.as_str() != "-").cloned().unwrap_or_else(|| if r.farbe_nr.is_empty() || r.farbe_nr == "-" { "Standard".into() } else { format!("Farbe {}", r.farbe_nr) });
            let ck = fedas::ensure_color(&tx, &cname);
            if let Some(&i) = seen.get(&ck) {
                variants[i].0.stock += r.best;
                continue;
            }
            seen.insert(ck.clone(), variants.len());
            let key: u64 = r.adv_id.parse::<u64>().unwrap_or_else(|_| 100_000_000 + r.zeile as u64);
            variants.push((catalog::Variant { id: None, color: ck, size: "one size".into(), ean: ean13(&format!("2{:011}", 800_000_000 + key)), stock: r.best }, r));
        }
        let mut fields = Map::new();
        for (k, v) in [("Saison", &first.saison), ("Lagerplatz", &first.lagerplatz), ("Katalog", &first.katalog), ("Ext. Art.-Nr.", &first.ext_nr)] {
            if !v.is_empty() {
                fields.insert(k.into(), json!(v));
            }
        }
        fields.insert("Quelle".into(), json!("Advarics-Import"));
        if list.iter().any(|r| r.rabattsperre) {
            fields.insert("Rabattsperre".into(), json!("ja"));
        }
        let mut det = Map::new();
        det.insert("hersteller_artikelnr".into(), json!(first.nr));
        det.insert("quelle".into(), json!("Advarics-Import"));
        if !first.saison.is_empty() { det.insert("saison".into(), json!(first.saison)); }
        det.insert("advarics_ids".into(), json!(list.iter().map(|r| r.adv_id.clone()).filter(|x| !x.is_empty()).collect::<Vec<_>>()));
        let cost = list.iter().find_map(|r| r.ek);
        let exists: bool = tx.query_row("SELECT 1 FROM articles WHERE id = ?1", [&id], |_| Ok(true)).optional().map_err(|e| e.to_string())?.unwrap_or(false);
        let res: Result<(), String> = (|| {
            if exists {
                let cur: String = tx.query_row("SELECT details FROM articles WHERE id = ?1", [&id], |r| r.get(0)).map_err(|e| e.to_string())?;
                tx.execute("UPDATE articles SET name = ?2, brand = ?3, category = ?4, cost = COALESCE(?5, cost), supplier_id = COALESCE(?6, supplier_id), details = ?7, updated_at = ?8, active = 1 WHERE id = ?1",
                    params![id, first.name, first.marke, cat, cost, supplier, merge_details(&cur, &det), db::now()]).map_err(|e| e.to_string())?;
                if o.preise {
                    tx.execute("UPDATE articles SET price = ?2 WHERE id = ?1", params![id, price]).map_err(|e| e.to_string())?;
                }
                let (mut colors, mut sizes): (Vec<String>, Vec<String>) = {
                    let r: (String, String) = tx.query_row("SELECT colors, sizes FROM articles WHERE id = ?1", [&id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
                    (serde_json::from_str(&r.0).unwrap_or_default(), serde_json::from_str(&r.1).unwrap_or_default())
                };
                for (v, _) in &variants {
                    let known: bool = tx.query_row("SELECT 1 FROM variants WHERE article_id = ?1 AND color = ?2 AND size = ?3", params![id, v.color, v.size], |_| Ok(true)).optional().map_err(|e| e.to_string())?.unwrap_or(false);
                    if !known {
                        tx.execute("INSERT INTO variants(article_id, color, size, ean, stock, active) VALUES (?1,?2,?3,?4,0,1)", params![id, v.color, v.size, v.ean]).map_err(|e| e.to_string())?;
                        if o.bestand && v.stock != 0 {
                            let vid: i64 = tx.query_row("SELECT id FROM variants WHERE ean = ?1", [&v.ean], |r| r.get(0)).map_err(|e| e.to_string())?;
                            catalog::book(&tx, vid, v.stock, true, "Anfangsbestand (Advarics-Import)", None, Some(user))?;
                        }
                        varianten += 1;
                    }
                    if !colors.contains(&v.color) { colors.push(v.color.clone()); }
                    if !sizes.contains(&v.size) { sizes.push(v.size.clone()); }
                }
                tx.execute("UPDATE articles SET colors = ?2, sizes = ?3 WHERE id = ?1", params![id, serde_json::to_string(&colors).unwrap(), serde_json::to_string(&sizes).unwrap()]).map_err(|e| e.to_string())?;
                upd += 1;
            } else {
                let art = catalog::Article {
                    id: id.clone(), name: first.name.clone(), brand: first.marke.clone(), category: cat.clone(), glyph: "shirt".into(), price, sale_price: None, vat: 20, tag: None,
                    popularity: 40, colors: variants.iter().map(|v| v.0.color.clone()).collect(), sizes: vec!["one size".into()], fields: Value::Object(fields.clone()), prompts: Value::Null,
                    active: true, variants: variants.iter().map(|v| catalog::Variant { stock: 0, ..v.0.clone() }).collect(), cost, supplier_id: supplier.clone(), min_stock: 1,
                    image: None, details: Value::Object(det.clone()), media: vec![],
                };
                catalog::save(&tx, &art)?;
                for (v, _) in &variants {
                    if o.bestand && v.stock != 0 {
                        let vid: i64 = tx.query_row("SELECT id FROM variants WHERE ean = ?1", [&v.ean], |r| r.get(0)).map_err(|e| e.to_string())?;
                        catalog::book(&tx, vid, v.stock, true, "Anfangsbestand (Advarics-Import)", None, Some(user))?;
                    }
                }
                varianten += variants.len();
                neu += 1;
            }
            // Bilder: Links sofort vormerken, eingebettete später aus der Datei lesen
            for (v, r) in &variants {
                if !r.bild_url.is_empty() {
                    media::queue_url_cap(&tx, &id, &r.bild_url, &v.color, "")?;
                    urls += 1;
                }
                if let Some(p) = imgs.get(&r.zeile) {
                    pending_imgs.push((id.clone(), v.color.clone(), p.clone()));
                }
            }
            Ok(())
        })();
        match res {
            Ok(()) => tx.commit().map_err(|e| e.to_string())?,
            Err(e) => {
                fehler.push(format!("{} {}: {e}", first.nr, first.name));
                drop(tx);
            }
        }
    }
    // eingebettete Bilder aus der Datei übernehmen
    if !pending_imgs.is_empty() {
        let mut z = std::fs::File::open(path).ok().and_then(|f| zip::ZipArchive::new(std::io::BufReader::new(f)).ok());
        let total_i = pending_imgs.len();
        for (i, (aid, color, entry)) in pending_imgs.iter().enumerate() {
            if i % 5 == 0 {
                progress(c, "bilder", i, total_i);
            }
            let src = format!("xlsx:{entry}");
            let have: bool = c.query_row("SELECT 1 FROM article_media WHERE article_id = ?1 AND source_url = ?2", params![aid, src], |_| Ok(true)).optional().ok().flatten().unwrap_or(false);
            if have {
                continue;
            }
            let Some(zz) = z.as_mut() else { break };
            let Some(bytes) = read_entry(zz, entry) else { continue };
            match media::add_bytes(c, data_dir, aid, &bytes, color, Some(&src)) {
                Ok(_) => eingebettet += 1,
                Err(e) => fehler.push(format!("Bild {entry}: {e}")),
            }
        }
    }
    let _ = images::dir(data_dir);
    progress(c, "fertig", total, total);
    let res = json!({ "zeilen": rows.len(), "artikel": total, "neu": neu, "aktualisiert": upd, "varianten": varianten, "lieferanten_neu": sup_new, "warengruppen_neu": wg_new,
        "bilder_eingebettet": eingebettet, "bilder_links": urls, "inaktiv_uebersprungen": inactive, "demo_entfernt": demo_entfernt, "ohne_vk": ohne_vk, "fehler": fehler });
    let _ = db::audit_append(c, "catalog.advarics.import", &json!({ "datei": path.file_name().map(|n| n.to_string_lossy().to_string()), "neu": neu, "aktualisiert": upd, "varianten": varianten, "bilder": eingebettet + urls, "benutzer": user }));
    let _ = db::setting_set(c, "import.letztes", &res);
    Ok(res)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mit echter Datei: KONTOR_XLSX=/pfad/GridExport.xlsx cargo test advarics_echt -- --ignored --nocapture
    #[test]
    #[ignore]
    fn advarics_bildzeilen() {
        let Ok(p) = std::env::var("KONTOR_XLSX") else { return };
        let rows = read_rows(Path::new(&p)).unwrap();
        let imgs = embedded_images(Path::new(&p));
        let got: Vec<String> = rows.iter().filter(|r| r.nr == "135605").map(|r| imgs.get(&r.zeile).cloned().unwrap_or_default()).collect();
        println!("{got:?}");
        assert_eq!(got, ["xl/media/image59.png", "xl/media/image60.png", "xl/media/image61.png", "xl/media/image9.png", "xl/media/image28.png"]);
        assert_eq!(rows.iter().filter(|r| r.nr == "135605").map(|r| r.name.as_str()).collect::<Vec<_>>()[0], "ADVENTURE BUCKET HAT BUFF® SOLID");
    }

    #[test]
    #[ignore]
    fn advarics_echt() {
        let Ok(p) = std::env::var("KONTOR_XLSX") else { return };
        let pv = preview(Path::new(&p)).unwrap();
        println!("{}", serde_json::to_string_pretty(&pv).unwrap());
        let dir = std::env::temp_dir().join(format!("kontor-adv-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut c = db::open(&dir.join("k.db")).unwrap();
        let t = std::time::Instant::now();
        let r = import(&mut c, &dir, Path::new(&p), &Opts { inaktiv: false, bestand: true, preise: true, bilder: true, demo_weg: false }, "test").unwrap();
        println!("{:?}s {}", t.elapsed().as_secs(), serde_json::to_string_pretty(&r).unwrap().chars().take(3000).collect::<String>());
        let n: i64 = c.query_row("SELECT COUNT(*) FROM articles", [], |r| r.get(0)).unwrap();
        let st: i64 = c.query_row("SELECT COALESCE(SUM(stock),0) FROM variants", [], |r| r.get(0)).unwrap();
        let m: i64 = c.query_row("SELECT COUNT(*) FROM article_media WHERE file IS NOT NULL", [], |r| r.get(0)).unwrap();
        let q: i64 = c.query_row("SELECT COUNT(*) FROM article_media WHERE file IS NULL", [], |r| r.get(0)).unwrap();
        println!("Artikel {n} · Bestand {st} · Bilder {m} · Links {q}");
        // zweiter Lauf ändert nichts
        let r2 = import(&mut c, &dir, Path::new(&p), &Opts { inaktiv: false, bestand: true, preise: true, bilder: true, demo_weg: false }, "test").unwrap();
        let n2: i64 = c.query_row("SELECT COUNT(*) FROM articles", [], |r| r.get(0)).unwrap();
        let m2: i64 = c.query_row("SELECT COUNT(*) FROM article_media", [], |r| r.get(0)).unwrap();
        println!("2. Lauf: neu {} akt {} · Artikel {n2} · Medien {m2}", r2["neu"], r2["aktualisiert"]);
        assert_eq!(n, n2);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn ean_und_marke() {
        assert_eq!(ean13("200000000001").len(), 13);
        assert_eq!(marke_clean("BUFF®"), "BUFF");
        assert_eq!(cents(Some(29.95)), Some(2995));
        assert_eq!(cents(Some(0.0)), None);
        let a = attr_of("<Relationship Id=\"rId1\" Target=\"../media/image1.jpeg\"/>", "Target");
        assert_eq!(a.as_deref(), Some("../media/image1.jpeg"));
    }
}
