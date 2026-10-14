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

/* ── Warengruppen-Export (XLSX „GridExport“ mit Hierarchie Ebene1–3) ── */

#[derive(Default, Clone, Debug)]
pub struct WgRow {
    pub nr: String,
    pub name: String,
    pub e: [(String, String); 3], // (Nr., Name) je Hierarchieebene; leer = „NA“
    pub mwst: String,
    pub etikett: String,
    pub inventur: bool,
    pub alter: String,
    pub spanne: Option<f64>,
}

/// Liest die Warengruppentabelle; `Ok(None)`, wenn die Datei keine Warengruppenliste ist
pub fn wg_read(path: &Path) -> Result<Option<Vec<WgRow>>, String> {
    let mut wb: Xlsx<_> = calamine::open_workbook(path).map_err(|e| format!("Datei nicht lesbar (XLSX erwartet): {e}"))?;
    let range = wb.worksheet_range_at(0).ok_or("Die Datei enthält kein Tabellenblatt")?.map_err(|e| e.to_string())?;
    let mut rows = range.rows();
    let head: Vec<String> = rows.next().ok_or("Tabelle ist leer")?.iter().map(|d| txt(d).to_lowercase()).collect();
    let col = |n: &str| head.iter().position(|h| h == n);
    let (Some(cn), Some(cname), Some(c1)) = (col("nr."), col("name"), col("hierarchie ebene1-nr.")) else { return Ok(None) };
    let (n1, c2, n2, c3, n3) = (col("hierarchie ebene1-name"), col("hierarchie ebene2-nr."), col("hierarchie ebene2-name"), col("hierarchie ebene3-nr."), col("hierarchie ebene3-name"));
    let (cm, ce, ci, ca, cs) = (col("mwst.-typ"), col("etiketten-typ"), col("inventur"), col("altersbewertung"), col("vorschl.-spanne/kalk."));
    let get = |r: &[Data], c: Option<usize>| -> Data { c.and_then(|i| r.get(i)).cloned().unwrap_or(Data::Empty) };
    let lvl = |r: &[Data], nr: Option<usize>, nm: Option<usize>| -> (String, String) {
        let (a, b) = (txt(&get(r, nr)), txt(&get(r, nm)));
        if a.is_empty() || b.is_empty() || b.eq_ignore_ascii_case("na") { (String::new(), String::new()) } else { (a, b) }
    };
    let mut out = vec![];
    for r in rows {
        let (nr, name) = (txt(&r[cn]), txt(&r[cname]));
        if nr.is_empty() || name.is_empty() {
            continue;
        }
        out.push(WgRow {
            nr, name,
            e: [lvl(r, Some(c1), n1), lvl(r, c2, n2), lvl(r, c3, n3)],
            mwst: txt(&get(r, cm)), etikett: txt(&get(r, ce)), inventur: flag(&get(r, ci)), alter: txt(&get(r, ca)), spanne: num(&get(r, cs)),
        });
    }
    Ok(Some(out))
}

pub fn wg_preview(path: &Path) -> Result<Value, String> {
    let Some(rows) = wg_read(path)? else { return Ok(Value::Null) };
    let mut lv: [std::collections::BTreeSet<String>; 3] = Default::default();
    for r in &rows {
        for i in 0..3 {
            if !r.e[i].0.is_empty() {
                lv[i].insert(r.e[..=i].iter().map(|x| x.0.clone()).collect::<Vec<_>>().join("-"));
            }
        }
    }
    let ohne = rows.iter().filter(|r| r.e[0].0.is_empty()).count();
    Ok(json!({
        "warengruppen": rows.len(), "bereiche": lv[0].len(), "hauptabteilungen": lv[1].len(), "abteilungen": lv[2].len(), "ohne_hierarchie": ohne,
        "beispiele": rows.iter().skip(8).take(6).map(|r| json!({ "nr": r.nr, "name": r.name, "pfad": r.e.iter().filter(|x| !x.0.is_empty()).map(|x| x.1.clone()).collect::<Vec<_>>().join(" › ") })).collect::<Vec<_>>(),
    }))
}

fn mwst_satz(t: &str) -> i64 {
    match t.to_lowercase().as_str() {
        "ohne mwst." | "ohne mwst" | "steuerfrei" => 0,
        "reduziert" | "ermäßigt" => 10,
        _ => 20,
    }
}

/// Warengruppen samt Hierarchie in die Stammdaten schreiben (bestehende Einträge werden ergänzt, nichts wird gelöscht)
pub fn wg_import(c: &mut Connection, path: &Path) -> Result<Value, String> {
    let rows = wg_read(path)?.ok_or("Das ist keine Warengruppenliste (Spalten „Nr.“, „Name“, „Hierarchie Ebene1-Nr.“ fehlen)")?;
    wg_apply(c, &rows)
}

const WG_EINGEBAUT: &str = include_str!("../../demo-data/advarics_warengruppen.json");

/// Eingebaute Advarics-Warengruppenliste (11.848 Gruppen mit Hierarchie) beim ersten Start übernehmen
pub fn wg_seed(c: &mut Connection) -> Result<(), String> {
    if db::setting_get(c, "wg.advarics.eingespielt").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Ok(());
    }
    let list: Vec<Value> = serde_json::from_str(WG_EINGEBAUT).map_err(|e| e.to_string())?;
    let lv = |v: &Value| (v[0].as_str().unwrap_or("").to_string(), v[1].as_str().unwrap_or("").to_string());
    let rows: Vec<WgRow> = list.iter().map(|r| WgRow {
        nr: r[0].as_str().unwrap_or("").into(), name: r[1].as_str().unwrap_or("").into(), e: [lv(&r[2]), lv(&r[3]), lv(&r[4])],
        mwst: r[5].as_str().unwrap_or("").into(), etikett: r[6].as_str().unwrap_or("").into(), inventur: r[7].as_bool().unwrap_or(false),
        alter: r[8].as_str().unwrap_or("").into(), spanne: r[9].as_f64(),
    }).collect();
    wg_apply(c, &rows)?;
    db::setting_set(c, "wg.advarics.eingespielt", &json!(true)).map_err(|e| e.to_string())?;
    Ok(())
}

const GR_EINGEBAUT: &str = include_str!("../../demo-data/advarics_groessen.json");

/// Eingebaute Advarics-Größenliste (Stammdaten › Größen › Größen) beim ersten Start übernehmen
pub fn groessen_seed(c: &mut Connection) -> Result<(), String> {
    if db::setting_get(c, "groessen.advarics.eingespielt").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Ok(());
    }
    let list: Vec<Value> = serde_json::from_str(GR_EINGEBAUT).map_err(|e| e.to_string())?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let now = db::now();
    for r in &list {
        let (name, nr) = (r[0].as_str().unwrap_or(""), r[1].as_i64().unwrap_or(0));
        if name.is_empty() { continue; }
        tx.execute("INSERT OR IGNORE INTO stamm(kind, id, data, pos, active, updated_at) VALUES ('groesse', ?1, ?2, ?3, 1, ?4)", params![format!("gr-{nr}"), json!({ "name": name, "nr": nr, "g1": "", "g2": "" }).to_string(), nr, now]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    db::setting_set(c, "groessen.advarics.eingespielt", &json!(true)).map_err(|e| e.to_string())?;
    Ok(())
}

const GS_NAMEN: [&str; 34] = ["ohne Gr.", "Unisex", "Damen", "Herren", "Schuhe Kids EU", "Schuhe Erw. EU", "Schuhe Erw. UK", "Schuhe Erw. Ski MP", "Schuhe Kids Ski MP", "Helme Kids", "Helme Erw.", "Protektoren Kids", "Protektoren Erw.", "Handschuhe Kids / Junior", "Handschuhe Erw.", "Skistöcke Kids", "Skistöcke Erw.", "Snowboardbindungen", "Snowboard Länge Kids", "Snowboard Länge Erw.", "Ski Alpin Länge Kids", "Ski Alpin Länge Erw.", "Socken Kids", "Socken Erw.", "Schuhe Erw. Snowboard MP", "Schuhe Kids Snowboard MP", "Kinder", "Rucksäcke", "Bandagen", "Hosenträger", "Getränke", "Sprays & Pflegemittel", "xxxJKE 3 Sport Holding GmbH", "Sohlen"];

/// Größenschlüssel aus Advarics (Nr. 1–34) beim ersten Start anlegen – nur wenn noch keine vorhanden sind
pub fn groessenschluessel_seed(c: &mut Connection) -> Result<(), String> {
    if db::setting_get(c, "groessenschluessel.advarics.eingespielt").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Ok(());
    }
    let n: i64 = c.query_row("SELECT COUNT(*) FROM stamm WHERE kind = 'groessenschluessel'", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if n == 0 {
        let tx = c.transaction().map_err(|e| e.to_string())?;
        let now = db::now();
        for (i, name) in GS_NAMEN.iter().enumerate() {
            let nr = i as i64 + 1;
            tx.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES ('groessenschluessel', ?1, ?2, ?3, 1, ?4)", params![format!("gs-{nr}"), json!({ "name": name, "nr": nr, "sync": false, "groessen": [] }).to_string(), nr, now]).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }
    db::setting_set(c, "groessenschluessel.advarics.eingespielt", &json!(true)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Zuordnung der Größen zu Advarics-Größenschlüsseln (Schlüssel-Nr., Größen) – füllt nur Schlüssel, die noch leer sind
const GS_ZUORDNUNG: [(i64, &[&str]); 33] = [(34, &["20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31"]), (1, &["*", "One Size", "OneSize", "S", "M", "L", "XL"]), (33, &["2A", "4A", "6A", "8A", "10A", "92", "104", "116", "128", "140"]), (28, &["2 Liter", "12-22 l", "14 Liter", "15 Liter", "16 Liter", "20-35 L", "21 Liter", "23 Liter", "24 Liter", "26 Liter", "34 Liter", "36 Liter", "40+4 Liter", "45-90 L"]), (29, &["Rechts", "REG", "M", "L", "Links", "XL", "XXL", "XXXL"]), (30, &["90cm", "110cm", "120cm"]), (31, &["250 ml"]), (32, &["100 ml", "120 g", "200 ml", "250 ml"]), (24, &["35-38", "36-38", "39-41", "39-42", "42-44", "43-46", "44-46", "45-47", "47-49", "48-50"]), (25, &["220", "225", "230", "235", "240", "245", "250", "255", "260", "265", "270", "275", "280", "285", "290", "295", "300", "305", "310", "315"]), (27, &["14", "16", "18", "20", "42", "44 2/3", "47 1/3", "128", "140", "152", "164", "176"]), (20, &["135", "140", "145", "150", "155", "160", "165", "170", "175"]), (21, &["60", "70", "75", "80", "85", "90", "95", "100", "105", "110", "115", "120", "125", "130", "135", "140"]), (22, &["140", "145", "148", "150", "152", "155", "156", "157", "160", "162", "164", "165", "168", "170", "174", "175", "180", "185", "190"]), (23, &["16-18", "19-21", "22-24", "23-26", "25-27", "27-30", "28-30", "31-33", "31-34", "34-36", "35-38"]), (15, &["5", "6", "6,5", "7", "7,5", "8", "8,5", "9", "9,5", "10", "10,5", "11", "11,5", "12"]), (16, &["60", "65", "70", "75", "80", "85", "90", "95"]), (17, &["100", "105", "105-140", "110", "115", "120", "125", "130", "135", "140"]), (18, &["S", "M", "L", "XL"]), (19, &["90", "95", "100", "105", "110", "115", "120", "125", "130", "135"]), (10, &["XXS", "XS", "S", "M"]), (11, &["48-61", "51-54", "55-58", "59-62", "S", "S/M", "M", "M/L", "L", "XL", "XL/XXL", "XXL"]), (12, &["JS", "JM", "JL", "XXS", "XS", "S", "M"]), (13, &["XS", "S", "M", "L", "XL", "XXL", "XXXL"]), (14, &["1", "1,5", "2", "2,5", "3", "3,5", "4", "4,5", "5", "5,5", "6", "6,5", "7"]), (9, &["18/18.5", "19/19.5", "20/20.5", "21/21.5", "22/22.5", "23/23.5", "24/24.5", "25/25.5", "26/26.5", "27/27.5", "150", "155", "160", "165", "170", "175", "180", "185", "190", "195", "200", "205", "210", "215"]), (8, &["22/22.5", "23/23.5", "24/24.5", "25/25.5", "26/26.5", "27/27.5", "28/28.5", "29/29.5", "30/30.5", "31/31.5", "32/32.5", "220", "225", "230", "235", "240", "245", "250", "255", "260", "265", "270", "275", "280", "285", "290", "295", "300", "305", "310", "315", "320"]), (7, &["3", "3,5", "4", "4,5", "5", "5,5", "6", "6,5", "7,5", "8,5", "9,5", "10,5", "11,5", "12,5", "13", "13,5", "14", "14,5", "40 2/3", "42", "43 1/3", "44 2/3", "46", "47 1/3"]), (6, &["35", "35,5", "36", "36 2/3", "36,5", "36½", "37", "37 1/3", "37,5", "37½", "38", "38 2/3", "38,5", "39", "39 1/3", "39 2/3", "39,5", "39½", "40", "40 2/3", "40,5", "40½", "41", "41 1/3", "41,5", "41½", "42", "42 2/3", "42,5", "42½", "43", "43 1/3", "43,5", "43½", "44", "44 1/3", "44 2/3", "44,5", "44½", "45", "45 1/3", "45,5", "46", "46 2/3", "46,5", "46½", "47", "47 1/3", "47,5", "48", "48 2/3", "48,5", "48½", "49", "49 1/3", "49,5", "49½", "50", "50 2/3", "50½", "51"]), (3, &["32", "33", "34", "35", "36", "37", "38", "40", "42", "44", "46", "48", "50"]), (4, &["39", "40", "41", "42", "43", "44", "45", "46", "48", "50", "52", "54", "56", "58", "60"]), (5, &["16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39"]), (2, &["XXS", "XXS/XS", "XS", "XS/S", "S", "S-M", "S/M", "M", "M/L", "L", "L-XL", "L/XL", "XL", "XL/XXL", "XXL", "XXXL"])];

pub fn groessenschluessel_zuordnung(c: &mut Connection) -> Result<(), String> {
    if db::setting_get(c, "groessenschluessel.zuordnung.v14").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Ok(());
    }
    for (nr, list) in GS_ZUORDNUNG {
        let cur: Option<String> = c.query_row("SELECT data FROM stamm WHERE kind = 'groessenschluessel' AND id = ?1", [format!("gs-{nr}")], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        let Some(cur) = cur else { continue };
        let mut v: Value = serde_json::from_str(&cur).unwrap_or(json!({}));
        if v["groessen"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
            v["groessen"] = json!(list);
            c.execute("UPDATE stamm SET data = ?2, updated_at = ?3 WHERE kind = 'groessenschluessel' AND id = ?1", params![format!("gs-{nr}"), v.to_string(), db::now()]).map_err(|e| e.to_string())?;
        }
    }
    db::setting_set(c, "groessenschluessel.zuordnung.v14", &json!(true)).map_err(|e| e.to_string())?;
    Ok(())
}

/// „Größe 1“ für Halbgrößen (z. B. 36½ → 36 1/2) und „One Size“ ergänzen, wo sie noch leer ist
pub fn groessen_g1(c: &mut Connection) -> Result<(), String> {
    if db::setting_get(c, "groessen.g1.v1").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Ok(());
    }
    let rows: Vec<(String, String)> = {
        let mut st = c.prepare("SELECT id, data FROM stamm WHERE kind = 'groesse'").map_err(|e| e.to_string())?;
        let v: Vec<(String, String)> = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
        v
    };
    let tx = c.transaction().map_err(|e| e.to_string())?;
    for (id, d) in rows {
        let mut v: Value = serde_json::from_str(&d).unwrap_or(json!({}));
        let name = v["name"].as_str().unwrap_or("").to_string();
        let g1 = if name == "One Size" { name.clone() } else if name.contains('½') { name.replace('½', " 1/2") } else { continue };
        if v["g1"].as_str().unwrap_or("").is_empty() {
            v["g1"] = json!(g1);
            tx.execute("UPDATE stamm SET data = ?2 WHERE kind = 'groesse' AND id = ?1", params![id, v.to_string()]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    db::setting_set(c, "groessen.g1.v1", &json!(true)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Artikel mit alten Standard-Warengruppen (Demo) den Advarics-Gruppen zuordnen
pub fn wg_remap(c: &Connection) -> usize {
    let now = db::now();
    let mut n = 0;
    for (alt, neu) in [("jacken", "adv-8000"), ("hosen", "adv-8000"), ("shirts", "adv-8000"), ("schuhe", "adv-8002"), ("ski", "adv-8001"), ("rucksaecke", "adv-8001"), ("acc", "adv-8003")] {
        let da: bool = c.query_row("SELECT 1 FROM stamm WHERE kind = 'warengruppe' AND id = ?1", [neu], |_| Ok(true)).optional().ok().flatten().unwrap_or(false);
        if da {
            n += c.execute("UPDATE articles SET category = ?2, updated_at = ?3 WHERE category = ?1", params![alt, neu, now]).unwrap_or(0);
        }
    }
    n
}

pub fn wg_apply(c: &mut Connection, rows: &[WgRow]) -> Result<Value, String> {
    let rows = rows;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let now = db::now();
    let mut pos: HashMap<&str, i64> = HashMap::new();
    for k in ["warengruppe", "abteilung", "hauptabteilung", "bereich"] {
        pos.insert(k, tx.query_row("SELECT COALESCE(MAX(pos), -1) + 1 FROM stamm WHERE kind = ?1", [k], |r| r.get(0)).map_err(|e| e.to_string())?);
    }
    let (mut neu, mut upd) = ([0usize; 4], [0usize; 4]);
    let mut put = |kind: &'static str, idx: usize, id: &str, add: Value| -> Result<(), String> {
        let cur: Option<String> = tx.query_row("SELECT data FROM stamm WHERE kind = ?1 AND id = ?2", params![kind, id], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        let mut v: Value = cur.as_deref().and_then(|d| serde_json::from_str(d).ok()).unwrap_or(json!({}));
        for (k, x) in add.as_object().unwrap() {
            v[k] = x.clone();
        }
        if cur.is_some() {
            tx.execute("UPDATE stamm SET data = ?3, updated_at = ?4 WHERE kind = ?1 AND id = ?2", params![kind, id, v.to_string(), now]).map_err(|e| e.to_string())?;
            upd[idx] += 1;
        } else {
            let p = pos.get_mut(kind).unwrap();
            tx.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5)", params![kind, id, v.to_string(), *p, now]).map_err(|e| e.to_string())?;
            *p += 1;
            neu[idx] += 1;
        }
        Ok(())
    };
    let mut done: std::collections::HashSet<String> = Default::default();
    for r in rows {
        // Ebene 1 → Bereich, Ebene 2 → Hauptabteilung, Ebene 3 → Abteilung
        let mut parent = String::new();
        let mut pfad = String::new();
        for (i, kind) in [(0usize, "bereich"), (1, "hauptabteilung"), (2, "abteilung")] {
            if r.e[i].0.is_empty() {
                break;
            }
            pfad = if pfad.is_empty() { r.e[i].0.clone() } else { format!("{pfad}-{}", r.e[i].0) };
            let id = format!("adv-{}{pfad}", ["b", "h", "a"][i]);
            if done.insert(id.clone()) {
                let kn: &'static str = kind;
                let mut d = json!({ "name": r.e[i].1, "nr": r.e[i].0 });
                if !parent.is_empty() {
                    d["parent"] = json!(parent);
                }
                put(kn, 3 - i, &id, d)?;
            }
            parent = id;
        }
        let mut d = json!({ "name": r.name, "nr": r.nr, "ust": mwst_satz(&r.mwst), "etikett": r.etikett, "inventur": r.inventur, "altersbewertung": r.alter });
        if let Some(s) = r.spanne {
            d["spanne"] = json!(s);
        }
        if r.e[2].0.is_empty() {
            d["abteilung"] = json!("");
        } else {
            d["abteilung"] = json!(parent);
        }
        d["gruppe"] = json!(r.name.split_whitespace().take(2).collect::<Vec<_>>().join(" "));
        put("warengruppe", 0, &format!("adv-{}", r.nr), d)?;
    }
    // Ersetzen: Warengruppen der Demo-/Standardliste und von Hand angelegte Ebenen entfernen, Artikel auf die Advarics-Gruppen umhängen
    let mut umgehaengt = 0usize;
    for (alt, neu_id) in [("jacken", "adv-8000"), ("hosen", "adv-8000"), ("shirts", "adv-8000"), ("schuhe", "adv-8002"), ("ski", "adv-8001"), ("rucksaecke", "adv-8001"), ("acc", "adv-8003")] {
        let da: bool = tx.query_row("SELECT 1 FROM stamm WHERE kind = 'warengruppe' AND id = ?1", [neu_id], |_| Ok(true)).optional().map_err(|e| e.to_string())?.unwrap_or(false);
        if da {
            umgehaengt += tx.execute("UPDATE articles SET category = ?2, updated_at = ?3 WHERE category = ?1", params![alt, neu_id, now]).map_err(|e| e.to_string())?;
        }
    }
    let mut entfernt = 0usize;
    for k in ["warengruppe", "abteilung", "hauptabteilung", "bereich", "hauptbereich"] {
        entfernt += tx.execute("DELETE FROM stamm WHERE kind = ?1 AND id NOT LIKE 'adv-%'", [k]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({ "entfernt": entfernt, "artikel_umgehaengt": umgehaengt, "warengruppen_neu": neu[0], "warengruppen_aktualisiert": upd[0], "abteilungen_neu": neu[1], "hauptabteilungen_neu": neu[2], "bereiche_neu": neu[3], "zeilen": rows.len() }))
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
    let mut sup_marken: std::collections::HashSet<String> = std::collections::HashSet::new();
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
                        purchasing::supplier_save(&tx, &purchasing::Supplier { id: sid.clone(), name: first.lief.clone(), nr: first.lief_nr.trim().parse().unwrap_or(0), lead_days: 7, ..Default::default() })?;
                        sup_new += 1;
                    }
                    sup_cache.insert(sup_key, sid.clone());
                    sid
                }
            })
        };
        // Marke gehört zu diesem Lieferanten (Reiter „Marken“ des Lieferanten) – je Paar einmal
        if let Some(sid) = &supplier {
            if !first.marke.trim().is_empty() && sup_marken.insert(format!("{sid}|{}", first.marke)) {
                crate::lieferant::marke_zuordnen(&tx, sid, &first.marke);
            }
        }
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

    /// Mit echter Datei: KONTOR_WG=/pfad/Warengruppen.xlsx cargo test warengruppen_echt -- --ignored --nocapture
    #[test]
    #[ignore]
    fn warengruppen_echt() {
        let Ok(p) = std::env::var("KONTOR_WG") else { return };
        let pv = wg_preview(Path::new(&p)).unwrap();
        println!("{pv}");
        let mut c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE stamm (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', pos INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, PRIMARY KEY (kind, id)); CREATE TABLE articles (id TEXT, category TEXT, updated_at TEXT); INSERT INTO stamm(kind,id,data,pos,updated_at) VALUES ('warengruppe','jacken','{}',0,'x'),('warengruppe','ski','{}',1,'x'); INSERT INTO articles VALUES ('A1','jacken','x'),('A2','ski','x');").unwrap();
        let r1 = wg_import(&mut c, Path::new(&p)).unwrap();
        println!("{r1}");
        assert_eq!(r1["entfernt"], 2);
        assert_eq!(r1["artikel_umgehaengt"], 2);
        let cat: String = c.query_row("SELECT category FROM articles WHERE id='A2'", [], |r| r.get(0)).unwrap();
        assert_eq!(cat, "adv-8001");
        let r2 = wg_import(&mut c, Path::new(&p)).unwrap();
        assert_eq!(r2["warengruppen_neu"], 0);
        assert_eq!(r2["abteilungen_neu"], 0);
        let n: i64 = c.query_row("SELECT COUNT(*) FROM stamm WHERE kind='warengruppe'", [], |r| r.get(0)).unwrap();
        assert_eq!(n as u64, r1["warengruppen_neu"].as_u64().unwrap());
        let d: String = c.query_row("SELECT data FROM stamm WHERE kind='warengruppe' AND id='adv-100896'", [], |r| r.get(0)).unwrap();
        println!("{d}");
        let a: String = c.query_row("SELECT data FROM stamm WHERE kind='abteilung' AND id='adv-a1-0-89'", [], |r| r.get(0)).unwrap_or_default();
        println!("{a}");
    }
}
