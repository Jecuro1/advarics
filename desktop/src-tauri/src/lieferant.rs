//! Lieferanten (Stammdaten › Lieferanten): Tabelle `suppliers` (Schlüssel `id` bleibt unveränderlich – Artikel, Bestellungen und Belege hängen daran)
//! mit Lieferanten-Nr., Land, Grunddaten und einem Profil (JSON) für Einstellungen, Adressen und Filial-Kundennummern; dazu
//! `supplier_brands` (Marken je Lieferant) und `supplier_files` (Dokumente).
//!
//!  · Pflege nur in der Zentrale bzw. am Einzelplatz; Filialkassen bekommen die Lieferanten beim Abgleich (Filial-Kundennummern nur die der eigenen Filiale,
//!    Dokumente bleiben in der Zentrale). Ein in der Zentrale gelöschter Lieferant verschwindet in den Filialen, wenn dort nichts an ihm hängt.
//!  · Löschen nur ohne Bestellungen, Belege und Artikel – sonst „Aktiv“ ausschalten (inaktive Lieferanten verschwinden aus den Auswahllisten und
//!    aus Bestellvorschlag und KI-Nachbestellung, ihre Belege behalten den Namen).
//!  · Die Prüfungen stehen hier und in der Maske (c55e-lieferanten.js) gleich – das Backend entscheidet.

use crate::{db, filiale, marke, purchasing::{self, Supplier}, stamm, verbund};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

/// Größe eines Dokuments, Anzahl je Lieferant
pub const DATEI_MAX: usize = 15 * 1024 * 1024;
pub const DATEIEN_JE_LIEFERANT: i64 = 100;
/// Erlaubte Dateiendungen (nichts Ausführbares, keine Skripte, kein Makro-Office, kein SVG/HTML)
const DATEI_ENDUNGEN: [(&str, &str); 17] = [
    ("pdf", "application/pdf"), ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("png", "image/png"), ("webp", "image/webp"), ("gif", "image/gif"), ("tif", "image/tiff"), ("tiff", "image/tiff"),
    ("txt", "text/plain"), ("csv", "text/csv"), ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), ("xls", "application/vnd.ms-excel"),
    ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), ("doc", "application/msword"), ("odt", "application/vnd.oasis.opendocument.text"), ("ods", "application/vnd.oasis.opendocument.spreadsheet"), ("zip", "application/zip"),
];

fn s(v: &Value) -> String {
    v.as_str().map(|x| x.trim().to_string()).unwrap_or_default()
}
fn zahl(v: &Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str().and_then(|x| x.trim().replace(',', ".").parse().ok()))
}
fn ganz(v: &Value) -> Option<i64> {
    v.as_i64().or_else(|| zahl(v).filter(|x| x.fract() == 0.0).map(|x| x as i64))
}

/// E-Mail-Adresse: genau ein @, Text davor, Punkt in der Domain, keine Leerzeichen
pub fn email_ok(x: &str) -> bool {
    let x = x.trim();
    match x.split_once('@') {
        Some((a, b)) => !a.is_empty() && !x.chars().any(char::is_whitespace) && b.contains('.') && !b.starts_with('.') && !b.ends_with('.') && !b.contains('@'),
        None => false,
    }
}

/// GLN: 13 Ziffern mit GS1-Prüfziffer
pub fn gln_ok(x: &str) -> bool {
    if x.len() != 13 || !x.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    let d: Vec<u32> = x.chars().map(|c| c.to_digit(10).unwrap()).collect();
    let sum: u32 = d[..12].iter().enumerate().map(|(i, v)| if i % 2 == 0 { *v } else { v * 3 }).sum();
    (10 - sum % 10) % 10 == d[12]
}

fn text(o: &mut serde_json::Map<String, Value>, src: &Value, k: &str, max: usize, label: &str) -> Result<String, String> {
    let t = s(&src[k]);
    if t.chars().count() > max {
        return Err(format!("{label}: höchstens {max} Zeichen"));
    }
    o.insert(k.into(), json!(t));
    Ok(t)
}

/// Adresse prüfen und in die gespeicherte Form bringen (Adr.-Zeile 1/2, Straße, Haus-Nr., PLZ, Ort, Postfach, Land, Bundesland; Rechnungsadresse zusätzlich Name)
fn adresse(a: &Value, wo: &str, mit_name: bool) -> Result<Value, String> {
    let mut o = serde_json::Map::new();
    if mit_name {
        text(&mut o, a, "name", 120, &format!("{wo}: Name"))?;
    }
    for k in ["adrzeile1", "adrzeile2", "strasse", "hausnr", "plz", "ort", "postfach", "bundesland"] {
        text(&mut o, a, k, 80, &format!("{wo}: {k}"))?;
    }
    let land = s(&a["land"]).to_uppercase();
    if !land.is_empty() && !(land.len() == 2 && land.chars().all(|c| c.is_ascii_alphabetic())) {
        return Err(format!("{wo}: Land als zweistelliger ISO-Code (z. B. AT)"));
    }
    o.insert("land".into(), json!(land));
    Ok(Value::Object(o))
}

/// Profil (Einstellungen, Adressen, Filial-Kundennummern) prüfen: nur bekannte Felder, mit Typ und Grenzen
pub fn profil_pruefen(c: &Connection, p: &Value) -> Result<Value, String> {
    let mut o = serde_json::Map::new();
    for (k, max, l) in [("fax", 60, "Fax"), ("web", 120, "Webseite"), ("steuernr", 60, "Steuernummer"), ("info2", 2000, "Info 2"), ("vereinbarung1", 2000, "Vereinbarung 1"), ("vereinbarung2", 2000, "Vereinbarung 2"), ("rma_ablauf", 2000, "RMA Ablauf")] {
        text(&mut o, p, k, max, l)?;
    }
    let uid = s(&p["uid"]).replace(' ', "").to_uppercase();
    if !uid.is_empty() && !(uid.len() >= 4 && uid.len() <= 14 && uid[..2].chars().all(|c| c.is_ascii_alphabetic()) && uid.chars().all(|c| c.is_ascii_alphanumeric())) {
        return Err("USt-IdNr.: Länderkennung und Nummer (z. B. ATU12345678)".into());
    }
    o.insert("uid".into(), json!(uid));
    for (k, l) in [("gln", "Haupt-GLN"), ("empfaenger_gln", "Empfänger-GLN")] {
        let g = s(&p[k]).replace(' ', "");
        if !g.is_empty() && !gln_ok(&g) {
            return Err(format!("{l}: 13 Ziffern mit gültiger Prüfziffer"));
        }
        o.insert(k.into(), json!(g));
    }
    let zb = s(&p["zahlungsbed"]);
    if !zb.is_empty() && !stamm::list(c, "zahlungsbedingung")?.iter().any(|r| s(&r["id"]) == zb) {
        return Err("Zahlungs-Bed.: diese Zahlungsbedingung gibt es nicht mehr".into());
    }
    o.insert("zahlungsbed".into(), json!(zb));
    for k in ["rma_pflicht", "gegenscannen"] {
        o.insert(k.into(), json!(p[k].as_bool().unwrap_or(false)));
    }
    o.insert("order_vorschlag".into(), json!(p["order_vorschlag"].as_bool().unwrap_or(true)));
    let min_summe = if p["min_summe"].is_null() || s(&p["min_summe"]).is_empty() && p["min_summe"].is_string() { 0 } else { ganz(&p["min_summe"]).filter(|n| (0..=999_999_999).contains(n)).ok_or("Min. Auftragssumme: Betrag ab 0")? };
    let min_menge = if p["min_menge"].is_null() || s(&p["min_menge"]).is_empty() && p["min_menge"].is_string() { 0 } else { ganz(&p["min_menge"]).filter(|n| (0..=9_999_999).contains(n)).ok_or("Min. Auftragsmenge: ganze Zahl ab 0")? };
    o.insert("min_summe".into(), json!(min_summe));
    o.insert("min_menge".into(), json!(min_menge));
    let skonto = if p["skonto"].is_null() || p["skonto"].is_string() && s(&p["skonto"]).is_empty() { 0.0 } else { zahl(&p["skonto"]).filter(|x| (0.0..=100.0).contains(x)).ok_or("Skonto: Prozentwert von 0 bis 100")? };
    o.insert("skonto".into(), json!((skonto * 100.0).round() / 100.0));
    let valuta = if p["valuta"].is_null() || p["valuta"].is_string() && s(&p["valuta"]).is_empty() { 0 } else { ganz(&p["valuta"]).filter(|n| (0..=365).contains(n)).ok_or("Valuta: Tage von 0 bis 365")? };
    o.insert("valuta".into(), json!(valuta));
    o.insert("adresse".into(), adresse(&p["adresse"], "Haupt-Adresse", false)?);
    o.insert("rechnung".into(), adresse(&p["rechnung"], "Rechnungsadresse", true)?);
    // Filial-Kundennummern: je Filiale eine Nummer
    let mut fk = serde_json::Map::new();
    if let Some(m) = p["filial_kunden"].as_object() {
        for (st, v) in m {
            let st = st.trim().to_uppercase();
            let nr = s(v);
            if nr.is_empty() {
                continue;
            }
            if st.len() < 2 || st.len() > 12 || !st.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') {
                return Err("Filial-Kundennummer: ungültiges Filial-Kürzel".into());
            }
            if nr.chars().count() > 40 {
                return Err("Filial-Kundennummer: höchstens 40 Zeichen".into());
            }
            fk.insert(st, json!(nr));
        }
    }
    o.insert("filial_kunden".into(), Value::Object(fk));
    Ok(Value::Object(o))
}

/// Marken-Zuordnungen prüfen: jede Marke höchstens einmal, nur vorhandene Marken
fn marken_pruefen(c: &Connection, list: &Value) -> Result<Vec<Value>, String> {
    let bekannt: HashSet<String> = stamm::list(c, marke::KIND)?.iter().map(|r| s(&r["id"])).collect();
    let mut seen = HashSet::new();
    let mut out = vec![];
    for z in list.as_array().cloned().unwrap_or_default() {
        let id = s(&z["brand_id"]);
        if id.is_empty() {
            return Err("Marken: Marke fehlt".into());
        }
        if !bekannt.contains(&id) {
            return Err(format!("Marken: die Marke „{id}“ gibt es nicht mehr – bitte die Liste aktualisieren"));
        }
        if !seen.insert(id.clone()) {
            return Err("Marken: eine Marke kann nur einmal zugeordnet werden".into());
        }
        let mut o = serde_json::Map::new();
        o.insert("brand_id".into(), json!(id));
        for (k, max, l) in [("ext_name", 80, "Externer Marken-Name"), ("gln_src", 40, "GLN-Herkunft"), ("edi_nr", 40, "EDI Marken-Nr."), ("edi_name", 80, "EDI Marken-Name"), ("comment", 300, "Kommentar")] {
            text(&mut o, &z, k, max, &format!("Marken: {l}"))?;
        }
        let g = s(&z["gln"]).replace(' ', "");
        if !g.is_empty() && !gln_ok(&g) {
            return Err("Marken: GLN mit 13 Ziffern und gültiger Prüfziffer".into());
        }
        o.insert("gln".into(), json!(g));
        out.push(Value::Object(o));
    }
    Ok(out)
}

fn marken_laden(c: &Connection, sid: &str) -> Vec<Value> {
    let Ok(mut st) = c.prepare("SELECT brand_id, ext_name, gln_src, gln, edi_nr, edi_name, comment FROM supplier_brands WHERE supplier_id = ?1 ORDER BY rowid") else { return vec![] };
    st.query_map([sid], |r| Ok(json!({ "brand_id": r.get::<_, String>(0)?, "ext_name": r.get::<_, String>(1)?, "gln_src": r.get::<_, String>(2)?, "gln": r.get::<_, String>(3)?, "edi_nr": r.get::<_, String>(4)?, "edi_name": r.get::<_, String>(5)?, "comment": r.get::<_, String>(6)? })))
        .map(|r| r.flatten().collect())
        .unwrap_or_default()
}

/// Marke (nach Name) dem Lieferanten zuordnen, falls noch nicht geschehen – für Import und Demo-Daten
pub fn marke_zuordnen(c: &Connection, sid: &str, brand: &str) {
    marke::ensure(c, brand);
    if let Some(m) = marke::finden(c, brand) {
        let _ = c.execute("INSERT OR IGNORE INTO supplier_brands(supplier_id, brand_id) VALUES (?1,?2)", params![sid, s(&m["id"])]);
    }
}

fn zeile(sup: &Supplier, marken: Vec<Value>, fields: Value) -> Value {
    json!({ "id": sup.id, "nr": sup.nr, "name": sup.name, "_aktiv": sup.active, "country": sup.country, "contact": sup.contact, "email": sup.email, "phone": sup.phone, "customer_no": sup.customer_no,
        "lead_days": sup.lead_days, "note": sup.note, "iban": sup.iban, "bic": sup.bic, "profile": sup.profile, "marken": marken, "fields": fields, "_geaendert": sup.updated_at, "_offen": sup.open_orders })
}

fn felder(c: &Connection) -> HashMap<String, Value> {
    let Ok(mut st) = c.prepare("SELECT id, fields FROM suppliers") else { return HashMap::new() };
    st.query_map([], |r| Ok((r.get::<_, String>(0)?, serde_json::from_str::<Value>(&r.get::<_, String>(1)?).unwrap_or(json!({})))))
        .map(|r| r.flatten().collect())
        .unwrap_or_default()
}

/// Alle Lieferanten für Liste und Maske: mit Marken (und Artikelzahl je Marke), Dokumentzahl, offenen Bestellungen
pub fn list(c: &Connection) -> Result<Vec<Value>, String> {
    let sups = purchasing::suppliers_alle(c).map_err(|e| e.to_string())?;
    let fields = felder(c);
    let mut art: HashMap<(String, String), i64> = HashMap::new();
    let mut art_ges: HashMap<String, i64> = HashMap::new();
    if let Ok(mut st) = c.prepare("SELECT COALESCE(supplier_id,''), brand, COUNT(*) FROM articles GROUP BY supplier_id, brand") {
        for (sid, b, n) in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?))).map_err(|e| e.to_string())?.flatten() {
            *art.entry((sid.clone(), marke::norm(&b))).or_default() += n;
            *art_ges.entry(sid).or_default() += n;
        }
    }
    let namen: HashMap<String, String> = stamm::list(c, marke::KIND)?.iter().map(|r| (s(&r["id"]), s(&r["name"]))).collect();
    let mut dateien: HashMap<String, i64> = HashMap::new();
    if let Ok(mut st) = c.prepare("SELECT supplier_id, COUNT(*) FROM supplier_files GROUP BY supplier_id") {
        for (sid, n) in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))).map_err(|e| e.to_string())?.flatten() {
            dateien.insert(sid, n);
        }
    }
    let mut out = vec![];
    for sup in sups {
        let mut marken = marken_laden(c, &sup.id);
        for m in marken.iter_mut() {
            let name = namen.get(&s(&m["brand_id"])).cloned().unwrap_or_default();
            m["name"] = json!(name);
            m["_artikel"] = json!(art.get(&(sup.id.clone(), marke::norm(&name))).copied().unwrap_or(0));
        }
        let (id, f) = (sup.id.clone(), fields.get(&sup.id).cloned().unwrap_or(json!({})));
        let mut z = zeile(&sup, marken, f);
        z["_artikel"] = json!(art_ges.get(&id).copied().unwrap_or(0));
        z["_dateien"] = json!(dateien.get(&id).copied().unwrap_or(0));
        out.push(z);
    }
    Ok(out)
}

/// Zeile prüfen und in die gespeicherte Form bringen
pub fn pruefen(c: &Connection, row: &Value) -> Result<(Supplier, Vec<Value>, Value), String> {
    let name = s(&row["name"]);
    if name.chars().count() < 2 {
        return Err("Name fehlt (mindestens 2 Zeichen)".into());
    }
    if name.chars().count() > 120 {
        return Err("Name: höchstens 120 Zeichen".into());
    }
    let nr = ganz(&row["nr"]).filter(|n| (1..=999_999).contains(n)).ok_or("Nr.: ganze Zahl ab 1")?;
    let country = s(&row["country"]).to_uppercase();
    if country.len() != 2 || !country.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err("Land: bitte ein Land wählen".into());
    }
    let mut sup = Supplier { id: s(&row["id"]), name, nr, country, active: row["_aktiv"].as_bool().unwrap_or(true), ..Default::default() };
    for (k, max, l) in [("contact", 80, "Ansprechperson"), ("phone", 60, "Telefon"), ("customer_no", 60, "Kunden-Nr."), ("note", 2000, "Info")] {
        let t = s(&row[k]);
        if t.chars().count() > max {
            return Err(format!("{l}: höchstens {max} Zeichen"));
        }
        match k {
            "contact" => sup.contact = t,
            "phone" => sup.phone = t,
            "customer_no" => sup.customer_no = t,
            _ => sup.note = t,
        }
    }
    sup.email = s(&row["email"]);
    if !sup.email.is_empty() && (!email_ok(&sup.email) || sup.email.chars().count() > 120) {
        return Err("E-Mail: Adresse wie name@firma.at".into());
    }
    sup.lead_days = if row["lead_days"].is_null() || row["lead_days"].is_string() && s(&row["lead_days"]).is_empty() { 0 } else { ganz(&row["lead_days"]).filter(|n| (0..=365).contains(n)).ok_or("Lieferzeit: Tage von 0 bis 365")? };
    sup.iban = filiale::iban_norm(&s(&row["iban"]))?;
    let bic = s(&row["bic"]).replace(' ', "").to_uppercase();
    if !bic.is_empty() && !((bic.len() == 8 || bic.len() == 11) && bic.chars().all(|c| c.is_ascii_alphanumeric())) {
        return Err("BIC: 8 oder 11 Zeichen (z. B. BKAUATWW)".into());
    }
    sup.bic = bic;
    sup.profile = profil_pruefen(c, &row["profile"])?;
    let marken = marken_pruefen(c, &row["marken"])?;
    let fields = if row["fields"].is_object() { row["fields"].clone() } else { json!({}) };
    if fields.to_string().len() > 20_000 {
        return Err("Eigene Felder: zu viele Angaben".into());
    }
    Ok((sup, marken, fields))
}

fn geaendert(alt: &Supplier, neu: &Supplier) -> Vec<&'static str> {
    let mut v = vec![];
    macro_rules! d { ($f:ident, $l:expr) => { if alt.$f != neu.$f { v.push($l); } }; }
    d!(name, "name"); d!(nr, "nr"); d!(country, "land"); d!(contact, "ansprechperson"); d!(email, "email"); d!(phone, "telefon"); d!(customer_no, "kunden_nr"); d!(lead_days, "lieferzeit");
    d!(note, "info"); d!(iban, "iban"); d!(bic, "bic"); d!(active, "aktiv");
    if alt.profile != neu.profile {
        v.push("profil");
    }
    v
}

/// Speichern (neu oder ändern). Rückgabe: die gespeicherte Zeile (mit Marken und Eigenen Feldern)
pub fn save(c: &Connection, row: &Value, by: &str) -> Result<Value, String> {
    if verbund::rolle(c) == "filiale" {
        return Err("Lieferanten pflegt die Zentrale – diese Kasse bekommt die Angaben beim nächsten Abgleich".into());
    }
    let (mut sup, marken, fields) = pruefen(c, row)?;
    let alle = purchasing::suppliers_alle(c).map_err(|e| e.to_string())?;
    let alt = if sup.id.is_empty() { None } else { Some(alle.iter().find(|x| x.id == sup.id).ok_or("Diesen Lieferanten gibt es nicht mehr – bitte die Liste aktualisieren")?.clone()) };
    if let Some(o) = alle.iter().find(|x| x.nr == sup.nr && x.id != sup.id) {
        return Err(format!("Die Nr. {} hat schon der Lieferant „{}“", sup.nr, o.name));
    }
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    let neu = alt.is_none();
    if neu {
        let mut k = sup.nr;
        sup.id = loop {
            let id = format!("L-{k:03}");
            if tx.query_row("SELECT 1 FROM suppliers WHERE id = ?1", [&id], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_none() {
                break id;
            }
            k += 1000;
        };
        tx.execute("INSERT INTO suppliers(id, name, active, created_at, updated_at) VALUES (?1,?2,1,?3,?3)", params![sup.id, sup.name, db::now()]).map_err(|e| e.to_string())?;
    }
    tx.execute(
        "UPDATE suppliers SET name=?2, contact=?3, email=?4, phone=?5, customer_no=?6, lead_days=?7, note=?8, active=?9, updated_at=?10, iban=?11, bic=?12, nr=?13, country=?14, profile=?15, fields=?16 WHERE id = ?1",
        params![sup.id, sup.name, sup.contact, sup.email, sup.phone, sup.customer_no, sup.lead_days, sup.note, sup.active as i64, db::now(), sup.iban, sup.bic, sup.nr, sup.country, sup.profile.to_string(), fields.to_string()],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM supplier_brands WHERE supplier_id = ?1", [&sup.id]).map_err(|e| e.to_string())?;
    for m in &marken {
        tx.execute(
            "INSERT INTO supplier_brands(supplier_id, brand_id, ext_name, gln_src, gln, edi_nr, edi_name, comment) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![sup.id, s(&m["brand_id"]), s(&m["ext_name"]), s(&m["gln_src"]), s(&m["gln"]), s(&m["edi_nr"]), s(&m["edi_name"]), s(&m["comment"])],
        )
        .map_err(|e| e.to_string())?;
    }
    let was = alt.as_ref().map(|a| geaendert(a, &sup)).unwrap_or_default();
    db::audit_append(&tx, "lieferant.saved", &json!({ "lieferant": sup.id, "nr": sup.nr, "name": sup.name, "neu": neu, "geaendert": was, "marken": marken.len(), "durch": by })).map_err(|e| e.to_string())?;
    if was.contains(&"iban") || was.contains(&"bic") {
        let mask = |x: &str| if x.len() > 8 { format!("{}…{}", &x[..4], &x[x.len() - 4..]) } else { x.to_string() };
        db::audit_append(&tx, "lieferant.bank", &json!({ "lieferant": sup.id, "iban_alt": alt.as_ref().map(|a| mask(&a.iban)), "iban_neu": mask(&sup.iban), "durch": by })).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    let r = list(c)?.into_iter().find(|x| x["id"] == json!(sup.id)).ok_or("Lieferant nicht gefunden")?;
    Ok(r)
}

/// Verweise auf einen Lieferanten: (Bestellungen, Belege, Artikel)
pub fn verweise(c: &Connection, id: &str) -> (i64, i64, i64) {
    let n = |q: &str| c.query_row(q, [id], |x| x.get::<_, i64>(0)).unwrap_or(0);
    (
        n("SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = ?1"),
        n("SELECT COUNT(*) FROM docs WHERE partner = ?1 AND kind IN ('avis','er','zahlung','lretoure','reklamation','bonus')"),
        n("SELECT COUNT(*) FROM articles WHERE supplier_id = ?1"),
    )
}

/// Löschen: nur Zentrale/Einzelplatz und nur ohne Bestellungen, Belege und Artikel – sonst deaktivieren
pub fn delete(c: &Connection, id: &str, by: &str) -> Result<(), String> {
    if verbund::rolle(c) == "filiale" {
        return Err("Lieferanten löscht die Zentrale".into());
    }
    let sup = purchasing::suppliers_alle(c).map_err(|e| e.to_string())?.into_iter().find(|x| x.id == id).ok_or("Diesen Lieferanten gibt es nicht mehr")?;
    let (po, docs, art) = verweise(c, id);
    if po + docs + art > 0 {
        return Err(format!("Zum Lieferanten „{}“ gehören {po} Bestellungen, {docs} Belege und {art} Artikel – er lässt sich nicht löschen, aber deaktivieren (Schalter „Aktiv“)", sup.name));
    }
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    entfernen(&tx, id)?;
    db::audit_append(&tx, "lieferant.deleted", &json!({ "lieferant": id, "nr": sup.nr, "name": sup.name, "durch": by })).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

/// Lieferant samt Marken-Zuordnungen, Dokumenten und Konfigurationszeilen entfernen (nur wenn nichts mehr an ihm hängt)
fn entfernen(tx: &Connection, id: &str) -> Result<(), String> {
    for q in ["DELETE FROM supplier_brands WHERE supplier_id = ?1", "DELETE FROM supplier_files WHERE supplier_id = ?1", "DELETE FROM suppliers WHERE id = ?1"] {
        tx.execute(q, [id]).map_err(|e| e.to_string())?;
    }
    // Konfigurationszeilen der EDI-Einstellungen, die diesen Lieferanten nennen
    for kind in ["edilieferant", "edimapwg", "edimapgr", "lieferantenfarbe"] {
        let rows = stamm::list(tx, kind)?;
        let rest: Vec<Value> = rows.iter().filter(|r| s(&r["lieferant"]) != id).cloned().collect();
        if rest.len() != rows.len() {
            stamm::write_rows(tx, kind, &rest)?;
        }
    }
    Ok(())
}

/// Wie viele Artikel dieser Marken haben noch keinen Lieferanten?
pub fn artikel_offen(c: &Connection, brand_ids: &[String]) -> i64 {
    let namen: HashSet<String> = stamm::list(c, marke::KIND).unwrap_or_default().iter().filter(|r| brand_ids.contains(&s(&r["id"]))).map(|r| marke::norm(&s(&r["name"]))).collect();
    let Ok(mut st) = c.prepare("SELECT brand FROM articles WHERE supplier_id IS NULL OR supplier_id = ''") else { return 0 };
    st.query_map([], |r| r.get::<_, String>(0)).map(|r| r.flatten().filter(|b| namen.contains(&marke::norm(b))).count() as i64).unwrap_or(0)
}

/// Artikel der Marken, die noch keinen Lieferanten haben, dem Lieferanten zuordnen (nie überschreiben). Rückgabe: Anzahl
pub fn artikel_zuordnen(c: &Connection, sid: &str, brand_ids: &[String], by: &str) -> Result<i64, String> {
    if verbund::rolle(c) == "filiale" {
        return Err("Lieferanten pflegt die Zentrale".into());
    }
    if c.query_row("SELECT 1 FROM suppliers WHERE id = ?1", [sid], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_none() {
        return Err("Diesen Lieferanten gibt es nicht mehr".into());
    }
    let namen: HashSet<String> = stamm::list(c, marke::KIND)?.iter().filter(|r| brand_ids.contains(&s(&r["id"]))).map(|r| marke::norm(&s(&r["name"]))).collect();
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    let ids: Vec<(String, String)> = tx
        .prepare("SELECT id, brand FROM articles WHERE supplier_id IS NULL OR supplier_id = ''")
        .map_err(|e| e.to_string())?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    let mut n = 0;
    for (aid, _) in ids.iter().filter(|(_, b)| namen.contains(&marke::norm(b))) {
        n += tx.execute("UPDATE articles SET supplier_id = ?2, updated_at = ?3 WHERE id = ?1", params![aid, sid, db::now()]).map_err(|e| e.to_string())? as i64;
    }
    db::audit_append(&tx, "lieferant.artikel", &json!({ "lieferant": sid, "artikel": n, "durch": by })).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(n)
}

/* ══ Abgleich Zentrale → Filialkasse ══ */

/// Lieferanten für die Filiale `store`: alle (auch inaktive), Profil mit den Filial-Kundennummern nur dieser Filiale; dazu alle Marken-Zuordnungen und die Liste aller Kennungen
pub fn fuer_abgleich(c: &Connection, store: &str) -> Result<(Vec<Value>, Vec<Value>, Vec<String>), String> {
    let sups = purchasing::suppliers_alle(c).map_err(|e| e.to_string())?;
    let fields = felder(c);
    let ids = sups.iter().map(|x| x.id.clone()).collect();
    let mut out = vec![];
    for mut sup in sups {
        if let Some(fk) = sup.profile["filial_kunden"].as_object().cloned() {
            let eigene: serde_json::Map<String, Value> = fk.into_iter().filter(|(k, _)| k.eq_ignore_ascii_case(store)).collect();
            sup.profile["filial_kunden"] = Value::Object(eigene);
        }
        let f = fields.get(&sup.id).cloned().unwrap_or(json!({}));
        let mut z = serde_json::to_value(&sup).map_err(|e| e.to_string())?;
        z["fields"] = f;
        out.push(z);
    }
    let mut brands = vec![];
    if let Ok(mut st) = c.prepare("SELECT supplier_id, brand_id, ext_name, gln_src, gln, edi_nr, edi_name, comment FROM supplier_brands") {
        for r in st.query_map([], |r| Ok(json!({ "supplier_id": r.get::<_, String>(0)?, "brand_id": r.get::<_, String>(1)?, "ext_name": r.get::<_, String>(2)?, "gln_src": r.get::<_, String>(3)?, "gln": r.get::<_, String>(4)?, "edi_nr": r.get::<_, String>(5)?, "edi_name": r.get::<_, String>(6)?, "comment": r.get::<_, String>(7)? }))).map_err(|e| e.to_string())?.flatten() {
            brands.push(r);
        }
    }
    Ok((out, brands, ids))
}

/// Lieferanten der Zentrale übernehmen (Filialkasse): Grunddaten, Profil, Aktiv-Schalter und Änderungszeit wie in der Zentrale; Marken-Zuordnungen ersetzen;
/// Lieferanten, die es in der Zentrale nicht mehr gibt, entfallen – hängt hier noch etwas an ihnen, werden sie nur deaktiviert
pub fn uebernehmen(tx: &Connection, suppliers: &[Value], brands: Option<&Vec<Value>>, ids: Option<&Vec<Value>>) -> Result<(), String> {
    for x in suppliers {
        let Ok(su) = serde_json::from_value::<Supplier>(x.clone()) else { continue };
        if su.id.trim().is_empty() || su.name.trim().is_empty() {
            continue;
        }
        // gleiche Nr. bei einem anderen Lieferanten (lokaler Altbestand): dort die Nr. freigeben, die Zentrale gilt
        if su.nr > 0 {
            let _ = tx.execute("UPDATE suppliers SET nr = NULL WHERE nr = ?1 AND id <> ?2", params![su.nr, su.id]);
        }
        let nr: Option<i64> = if su.nr > 0 { Some(su.nr) } else { None };
        let fields = if x["fields"].is_object() { x["fields"].to_string() } else { "{}".into() };
        let ts = if su.updated_at.is_empty() { db::now() } else { su.updated_at.clone() };
        tx.execute(
            "INSERT INTO suppliers(id, name, contact, email, phone, customer_no, lead_days, note, active, created_at, updated_at, iban, bic, nr, country, profile, fields) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,?11,?12,?13,?14,?15,?16)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, contact=excluded.contact, email=excluded.email, phone=excluded.phone, customer_no=excluded.customer_no, lead_days=excluded.lead_days, note=excluded.note,
               active=excluded.active, updated_at=excluded.updated_at, iban=excluded.iban, bic=excluded.bic, nr=excluded.nr, country=excluded.country, profile=excluded.profile, fields=excluded.fields",
            params![su.id, su.name.trim(), su.contact, su.email, su.phone, su.customer_no, su.lead_days.clamp(0, 365), su.note, su.active as i64, ts, su.iban, su.bic, nr, su.country, su.profile.to_string(), fields],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(b) = brands {
        tx.execute("DELETE FROM supplier_brands", []).map_err(|e| e.to_string())?;
        for m in b {
            let (sid, bid) = (s(&m["supplier_id"]), s(&m["brand_id"]));
            if sid.is_empty() || bid.is_empty() {
                continue;
            }
            tx.execute(
                "INSERT OR REPLACE INTO supplier_brands(supplier_id, brand_id, ext_name, gln_src, gln, edi_nr, edi_name, comment) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![sid, bid, s(&m["ext_name"]), s(&m["gln_src"]), s(&m["gln"]), s(&m["edi_nr"]), s(&m["edi_name"]), s(&m["comment"])],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    if let Some(ids) = ids {
        let da: HashSet<String> = ids.iter().filter_map(|v| v.as_str().map(str::to_string)).collect();
        let lokal: Vec<String> = tx.prepare("SELECT id FROM suppliers").map_err(|e| e.to_string())?.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?.flatten().collect();
        for id in lokal.into_iter().filter(|i| !da.contains(i)) {
            let (po, docs, art) = verweise(tx, &id);
            if po + docs + art == 0 {
                entfernen(tx, &id)?;
            } else {
                tx.execute("UPDATE suppliers SET active = 0 WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

/// Eigenes Filial-Kürzel hat sich geändert (Rolle gewechselt): die Filial-Kundennummern ziehen mit
pub fn filiale_umbenannt(c: &Connection, alt: &str, neu: &str) -> Result<(), String> {
    let (alt, neu) = (alt.trim().to_uppercase(), neu.trim().to_uppercase());
    if alt == neu || alt.is_empty() || neu.is_empty() {
        return Ok(());
    }
    for (id, p) in lesen_profile(c)? {
        let mut p = p;
        if let Some(fk) = p["filial_kunden"].as_object_mut() {
            if let Some(v) = fk.remove(&alt) {
                fk.entry(neu.clone()).or_insert(v);
                c.execute("UPDATE suppliers SET profile = ?2 WHERE id = ?1", params![id, p.to_string()]).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

/// Eine gelöschte Filiale hinterlässt keine Kundennummern
pub fn filiale_entfernt(c: &Connection, id: &str) -> Result<(), String> {
    let id = id.trim().to_uppercase();
    for (sid, p) in lesen_profile(c)? {
        let mut p = p;
        if let Some(fk) = p["filial_kunden"].as_object_mut() {
            if fk.remove(&id).is_some() {
                c.execute("UPDATE suppliers SET profile = ?2 WHERE id = ?1", params![sid, p.to_string()]).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn lesen_profile(c: &Connection) -> Result<Vec<(String, Value)>, String> {
    let mut st = c.prepare("SELECT id, profile FROM suppliers").map_err(|e| e.to_string())?;
    let r = st.query_map([], |r| Ok((r.get::<_, String>(0)?, serde_json::from_str::<Value>(&r.get::<_, String>(1)?).unwrap_or(json!({}))))).map_err(|e| e.to_string())?.flatten().collect();
    Ok(r)
}

/// Profil des Lieferanten (leer, wenn es ihn nicht gibt) – für Prüfungen im Einkauf
pub fn profil(c: &Connection, id: &str) -> Value {
    c.query_row("SELECT profile FROM suppliers WHERE id = ?1", [id], |r| r.get::<_, String>(0)).ok().and_then(|p| serde_json::from_str(&p).ok()).unwrap_or(json!({}))
}

/// Kunden-Nr. beim Lieferanten für die Filiale `store`: die der Filiale, sonst die allgemeine Kunden-Nr.
#[cfg_attr(not(test), allow(dead_code))]
pub fn kundennr(sup: &Supplier, store: &str) -> String {
    let fk = sup.profile["filial_kunden"].as_object().and_then(|m| m.iter().find(|(k, _)| k.eq_ignore_ascii_case(store)).map(|(_, v)| s(v))).unwrap_or_default();
    if fk.is_empty() { sup.customer_no.clone() } else { fk }
}

/* ══ Einmalige Übernahme früherer Angaben ══ */

/// Einmal beim Start: Demo-Notizen „Marken: …“, die Spalte „Lieferant“ der alten Markentabelle und das Versendungsland je Lieferant (Intrastat) in die neuen
/// Felder übernehmen; Lieferanten-Nr. der Advarics-Lieferanten („ADV-4711“) übernehmen. Nur ergänzen, nie überschreiben.
pub fn migrieren(c: &Connection) -> Result<(), String> {
    if db::setting_get(c, "lieferant.migriert").is_some() {
        return Ok(());
    }
    let _ = db::setting_set(c, "lieferant.migriert", &json!(1));
    marke::ensure_alle(c);
    let sups = purchasing::suppliers_alle(c).map_err(|e| e.to_string())?;
    let hat: HashSet<String> = c.prepare("SELECT DISTINCT supplier_id FROM supplier_brands").map_err(|e| e.to_string())?.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?.flatten().collect();
    for sup in &sups {
        // Notiz „Marken: A, B“ (frühere Demodaten) → Marken-Zuordnung
        if let Some(rest) = sup.note.strip_prefix("Marken: ") {
            if !hat.contains(&sup.id) {
                for b in rest.split(',').map(str::trim).filter(|b| !b.is_empty()) {
                    if marke::finden(c, b).is_some() {
                        marke_zuordnen(c, &sup.id, b);
                    }
                }
                c.execute("UPDATE suppliers SET note = '' WHERE id = ?1", [&sup.id]).map_err(|e| e.to_string())?;
            }
        }
        // Advarics-Lieferanten: Nr. aus der Kennung, wenn frei; die damals dort abgelegte Nummer ist keine Kundennummer
        if let Some(n) = sup.id.strip_prefix("ADV-").and_then(|x| x.parse::<i64>().ok()).filter(|n| *n > 0) {
            let frei = c.query_row("SELECT 1 FROM suppliers WHERE nr = ?1 AND id <> ?2", params![n, sup.id], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_none();
            if frei && sup.nr != n {
                c.execute("UPDATE suppliers SET nr = ?2 WHERE id = ?1", params![sup.id, n]).map_err(|e| e.to_string())?;
            }
            if sup.customer_no == n.to_string() {
                c.execute("UPDATE suppliers SET customer_no = '' WHERE id = ?1", [&sup.id]).map_err(|e| e.to_string())?;
            }
        }
    }
    // alte Markentabelle: Spalte „Lieferant“
    for m in stamm::list(c, marke::KIND)? {
        let sid = s(&m["lieferant"]);
        if !sid.is_empty() && sups.iter().any(|x| x.id == sid) {
            c.execute("INSERT OR IGNORE INTO supplier_brands(supplier_id, brand_id) VALUES (?1,?2)", params![sid, s(&m["id"])]).map_err(|e| e.to_string())?;
        }
    }
    // GLN aus den EDI-Einstellungen → Haupt-GLN des Lieferanten (nur wenn dort noch keine steht und die GLN gültig ist)
    for r in stamm::list(c, "edilieferant")? {
        let (sid, gln) = (s(&r["lieferant"]), s(&r["gln"]).replace(' ', ""));
        if sid.is_empty() || !gln_ok(&gln) {
            continue;
        }
        if !sups.iter().any(|x| x.id == sid) {
            continue;
        }
        let mut p = profil(c, &sid);
        if !p.is_object() {
            p = json!({});
        }
        if s(&p["gln"]).is_empty() {
            p["gln"] = json!(gln);
            c.execute("UPDATE suppliers SET profile = ?2 WHERE id = ?1", params![sid, p.to_string()]).map_err(|e| e.to_string())?;
        }
    }
    // Versendungsland je Lieferant (Intrastat) → Land des Lieferanten
    if let Some(map) = db::setting_get(c, "intrastat.laender").and_then(|v| v.as_object().cloned()) {
        for (sid, iso) in map {
            let iso = s(&iso).to_uppercase();
            if iso.len() == 2 && iso.chars().all(|ch| ch.is_ascii_alphabetic()) {
                c.execute("UPDATE suppliers SET country = ?2 WHERE id = ?1", params![sid, iso]).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

/* ══ Dokumente ══ */

fn endung(name: &str) -> String {
    name.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_default()
}

/// Dateiname ohne Pfad und Steuerzeichen
fn dateiname(name: &str) -> String {
    let n = name.rsplit(['/', '\\']).next().unwrap_or("").chars().filter(|c| !c.is_control()).collect::<String>();
    n.trim().trim_start_matches('.').chars().take(120).collect()
}

/// Dokument prüfen (Endung, Größe, Dateikopf) – Rückgabe (Name, Typ)
pub fn datei_pruefen(name: &str, bytes: &[u8]) -> Result<(String, String), String> {
    let n = dateiname(name);
    if n.is_empty() {
        return Err("Dateiname fehlt".into());
    }
    let e = endung(&n);
    let Some((_, mime)) = DATEI_ENDUNGEN.iter().find(|(x, _)| *x == e) else {
        return Err(format!("Dateityp „.{e}“ ist nicht erlaubt (erlaubt: PDF, Bilder, Text/CSV, Excel, Word, OpenDocument, ZIP)"));
    };
    if bytes.is_empty() {
        return Err("Die Datei ist leer".into());
    }
    if bytes.len() > DATEI_MAX {
        return Err(format!("Die Datei ist größer als {} MB", DATEI_MAX / 1024 / 1024));
    }
    let kopf_ok = match e.as_str() {
        "pdf" => bytes.starts_with(b"%PDF"),
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G']),
        "jpg" | "jpeg" => bytes.starts_with(&[0xFF, 0xD8]),
        "gif" => bytes.starts_with(b"GIF8"),
        "webp" => bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        "xlsx" | "docx" | "odt" | "ods" | "zip" => bytes.starts_with(b"PK"),
        "doc" | "xls" => bytes.starts_with(&[0xD0, 0xCF, 0x11, 0xE0]),
        "tif" | "tiff" => bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*"),
        _ => true,
    };
    if !kopf_ok {
        return Err(format!("Der Inhalt passt nicht zur Endung „.{e}“"));
    }
    Ok((n, mime.to_string()))
}

pub fn datei_add(c: &Connection, sid: &str, name: &str, bytes: &[u8], user_id: &str) -> Result<Value, String> {
    if verbund::rolle(c) == "filiale" {
        return Err("Dokumente liegen in der Zentrale – hier lassen sich keine hochladen".into());
    }
    if c.query_row("SELECT 1 FROM suppliers WHERE id = ?1", [sid], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_none() {
        return Err("Bitte den Lieferanten zuerst sichern".into());
    }
    let (n, mime) = datei_pruefen(name, bytes)?;
    let anzahl: i64 = c.query_row("SELECT COUNT(*) FROM supplier_files WHERE supplier_id = ?1", [sid], |r| r.get(0)).unwrap_or(0);
    if anzahl >= DATEIEN_JE_LIEFERANT {
        return Err(format!("Höchstens {DATEIEN_JE_LIEFERANT} Dokumente je Lieferant"));
    }
    let sha: String = Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect();
    let (unr, uname): (String, String) = c
        .query_row("SELECT COALESCE(CAST(nr AS TEXT), ''), name FROM users WHERE id = ?1", [user_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| (String::new(), user_id.to_string()));
    c.execute(
        "INSERT INTO supplier_files(supplier_id, name, mime, size, uploaded_at, user_id, user_nr, user_name, sha256, data) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![sid, n, mime, bytes.len() as i64, db::now(), user_id, unr, uname, sha, bytes],
    )
    .map_err(|e| e.to_string())?;
    let id = c.last_insert_rowid();
    db::audit_append(c, "lieferant.datei.added", &json!({ "lieferant": sid, "datei": n, "groesse": bytes.len(), "sha256": sha, "durch": uname })).map_err(|e| e.to_string())?;
    Ok(json!({ "id": id, "name": n, "mime": mime, "size": bytes.len(), "descr": "", "uploaded_at": db::now(), "user_nr": unr, "user_name": uname }))
}

pub fn datei_liste(c: &Connection, sid: &str) -> Result<Vec<Value>, String> {
    let mut st = c.prepare("SELECT id, name, mime, size, descr, uploaded_at, user_nr, user_name FROM supplier_files WHERE supplier_id = ?1 ORDER BY id DESC").map_err(|e| e.to_string())?;
    let r = st
        .query_map([sid], |r| Ok(json!({ "id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?, "mime": r.get::<_, String>(2)?, "size": r.get::<_, i64>(3)?, "descr": r.get::<_, String>(4)?, "uploaded_at": r.get::<_, String>(5)?, "user_nr": r.get::<_, String>(6)?, "user_name": r.get::<_, String>(7)? })))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(r)
}

/// Dokument lesen: (Name, Inhalt)
pub fn datei_lesen(c: &Connection, id: i64) -> Result<(String, Vec<u8>), String> {
    c.query_row("SELECT name, data FROM supplier_files WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|e| e.to_string())?.ok_or_else(|| "Dokument nicht gefunden".to_string())
}

pub fn datei_beschreiben(c: &Connection, id: i64, descr: &str) -> Result<(), String> {
    if verbund::rolle(c) == "filiale" {
        return Err("Dokumente pflegt die Zentrale".into());
    }
    let t = descr.trim();
    if t.chars().count() > 300 {
        return Err("Beschreibung: höchstens 300 Zeichen".into());
    }
    let n = c.execute("UPDATE supplier_files SET descr = ?2 WHERE id = ?1", params![id, t]).map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Dokument nicht gefunden".into());
    }
    Ok(())
}

pub fn datei_loeschen(c: &Connection, id: i64, by: &str) -> Result<(), String> {
    if verbund::rolle(c) == "filiale" {
        return Err("Dokumente löscht die Zentrale".into());
    }
    let (sid, name): (String, String) = c.query_row("SELECT supplier_id, name FROM supplier_files WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|e| e.to_string())?.ok_or("Dokument nicht gefunden")?;
    c.execute("DELETE FROM supplier_files WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    db::audit_append(c, "lieferant.datei.deleted", &json!({ "lieferant": sid, "datei": name, "durch": by })).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        c
    }
    fn zeile(name: &str, nr: i64) -> Value {
        json!({ "name": name, "nr": nr, "country": "AT", "_aktiv": true, "lead_days": 7, "profile": {} })
    }
    fn artikel(c: &Connection, id: &str, brand: &str, sup: Option<&str>) {
        c.execute("INSERT INTO articles(id, name, brand, category, glyph, price, vat, colors, sizes, fields, prompts, active, created_at, updated_at, supplier_id) VALUES (?1,'x',?2,'jacken','shirt',100,20,'[]','[]','{}','[]',1,'t','t',?3)", params![id, brand, sup]).unwrap();
    }

    #[test]
    fn gln_und_adressen_werden_geprueft() {
        assert!(gln_ok("4006381333931"), "GS1-Beispiel");
        assert!(!gln_ok("4006381333932") && !gln_ok("123") && !gln_ok("40063813339a1"));
        assert!(email_ok("a@b.at") && !email_ok("a@b") && !email_ok("a b@c.at") && !email_ok("@c.at") && !email_ok("a@@c.at"));
        let c = db();
        let mut r = zeile("Nordwand", 5);
        r["email"] = json!("kein-at");
        assert!(save(&c, &r, "T").unwrap_err().contains("E-Mail"));
        r["email"] = json!("einkauf@nordwand.at");
        r["iban"] = json!("AT62 1904 3002 3457 3201");
        assert!(save(&c, &r, "T").unwrap_err().contains("IBAN"));
        r["iban"] = json!("at61 1904 3002 3457 3201");
        r["bic"] = json!("xx");
        assert!(save(&c, &r, "T").unwrap_err().contains("BIC"));
        r["bic"] = json!("bkauatww");
        r["profile"] = json!({ "uid": "ATU 1234 5678", "gln": "4006381333932" });
        assert!(save(&c, &r, "T").unwrap_err().contains("GLN"));
        r["profile"] = json!({ "uid": "ATU 1234 5678", "gln": "4006381333931", "skonto": "2,5", "valuta": 30, "min_summe": 50000, "adresse": { "strasse": "Weg", "land": "oesterreich" } });
        assert!(save(&c, &r, "T").unwrap_err().contains("ISO-Code"));
        r["profile"]["adresse"]["land"] = json!("at");
        let g = save(&c, &r, "T").unwrap();
        assert_eq!(g["id"], "L-005");
        assert_eq!((g["iban"].as_str(), g["bic"].as_str()), (Some("AT611904300234573201"), Some("BKAUATWW")));
        assert_eq!((g["profile"]["uid"].as_str(), g["profile"]["skonto"].as_f64(), g["profile"]["valuta"].as_i64(), g["profile"]["adresse"]["land"].as_str()), (Some("ATU12345678"), Some(2.5), Some(30), Some("AT")));
        assert_eq!(g["profile"]["order_vorschlag"], true, "Order-Vorschläge nutzen: Vorgabe ja");
        for (k, v) in [("skonto", json!(101)), ("valuta", json!(400)), ("min_summe", json!(-5)), ("min_menge", json!("x"))] {
            let mut x = zeile("Firn", 6);
            x["profile"] = json!({ k: v });
            assert!(save(&c, &x, "T").is_err(), "{k}");
        }
        assert!(save(&c, &zeile("X", 7), "T").is_err(), "Name zu kurz");
        assert!(save(&c, &zeile("Firn", 0), "T").is_err(), "Nr. ab 1");
        let mut x = zeile("Firn", 6);
        x["country"] = json!("");
        assert!(save(&c, &x, "T").is_err(), "Land fehlt");
    }

    #[test]
    fn nr_eindeutig_schluessel_stabil_und_unbekannte_felder_fallen_weg() {
        let c = db();
        let a = save(&c, &zeile("Nordwand", 43), "T").unwrap();
        assert_eq!((a["id"].as_str(), a["nr"].as_i64()), (Some("L-043"), Some(43)));
        assert!(save(&c, &zeile("Firn", 43), "T").unwrap_err().contains("Nr. 43"));
        let mut b = save(&c, &zeile("Firn", 44), "T").unwrap();
        b["nr"] = json!(45);
        b["profile"]["geheim"] = json!("x");
        let b2 = save(&c, &b, "T").unwrap();
        assert_eq!((b2["id"].as_str(), b2["nr"].as_i64()), (Some("L-044"), Some(45)), "Schlüssel bleibt, wenn die Nr. geändert wird");
        assert!(b2["profile"].get("geheim").is_none(), "nur bekannte Profilfelder");
        assert_eq!(purchasing::naechste_nr(&c), 46);
        let mut gone = zeile("Weg", 50);
        gone["id"] = json!("L-999");
        assert!(save(&c, &gone, "T").unwrap_err().contains("nicht mehr"));
    }

    #[test]
    fn aktiv_wirkt_auf_auswahllisten_und_bestellvorschlag() {
        let c = db();
        let a = save(&c, &zeile("Nordwand", 1), "T").unwrap();
        let id = a["id"].as_str().unwrap().to_string();
        artikel(&c, "A1", "Nordwand", Some(&id));
        c.execute("INSERT INTO variants(article_id, color, size, ean, stock) VALUES ('A1','moos','M','2000000000015', 0)", []).unwrap();
        assert_eq!(purchasing::suggest(&c).unwrap().len(), 1);
        let mut x = a.clone();
        x["_aktiv"] = json!(false);
        save(&c, &x, "T").unwrap();
        assert!(purchasing::suppliers(&c).unwrap().is_empty(), "inaktiv: nicht in den Auswahllisten");
        assert_eq!(purchasing::suppliers_alle(&c).unwrap().len(), 1);
        assert!(purchasing::suggest(&c).unwrap().is_empty(), "inaktiv: kein Bestellvorschlag");
        x["_aktiv"] = json!(true);
        x["profile"]["order_vorschlag"] = json!(false);
        save(&c, &x, "T").unwrap();
        assert!(purchasing::suggest(&c).unwrap().is_empty(), "Order-Vorschläge nutzen aus");
        x["profile"]["order_vorschlag"] = json!(true);
        save(&c, &x, "T").unwrap();
        assert_eq!(purchasing::suggest(&c).unwrap().len(), 1);
    }

    #[test]
    fn marken_je_lieferant_und_artikel_zuordnen() {
        let c = db();
        artikel(&c, "A1", "Nordwand", None);
        artikel(&c, "A2", "Nordwand", None);
        artikel(&c, "A3", "Nordwand", Some("L-777"));
        artikel(&c, "A4", "Firn", None);
        marke::ensure_alle(&c);
        let mut r = zeile("Nordwand Outdoor", 1);
        r["marken"] = json!([{ "brand_id": "mk-nordwand", "ext_name": "NORDWAND Alpin", "gln": "4006381333931", "edi_nr": "77" }]);
        let g = save(&c, &r, "T").unwrap();
        assert_eq!(g["marken"][0]["name"], "Nordwand");
        assert_eq!(g["marken"][0]["_artikel"], 0, "Anzahl Artikel: nur Artikel dieses Lieferanten");
        r["id"] = g["id"].clone();
        r["marken"] = json!([{ "brand_id": "mk-gibtsnicht" }]);
        assert!(save(&c, &r, "T").unwrap_err().contains("gibt es nicht mehr"));
        r["marken"] = json!([{ "brand_id": "mk-nordwand" }, { "brand_id": "mk-nordwand" }]);
        assert!(save(&c, &r, "T").unwrap_err().contains("nur einmal"));
        r["marken"] = json!([{ "brand_id": "mk-nordwand", "gln": "123" }]);
        assert!(save(&c, &r, "T").unwrap_err().contains("GLN"));
        r["marken"] = json!([{ "brand_id": "mk-nordwand" }, { "brand_id": "mk-firn", "comment": "Direkt" }]);
        save(&c, &r, "T").unwrap();
        // Artikel ohne Lieferant bekommen ihn, vorhandene Zuordnungen bleiben
        let id = g["id"].as_str().unwrap();
        assert_eq!(artikel_zuordnen(&c, id, &["mk-nordwand".into()], "T").unwrap(), 2);
        let sup = |a: &str| c.query_row("SELECT COALESCE(supplier_id,'') FROM articles WHERE id = ?1", [a], |x| x.get::<_, String>(0)).unwrap();
        assert_eq!((sup("A1"), sup("A2"), sup("A3"), sup("A4")), (id.to_string(), id.to_string(), "L-777".to_string(), String::new()));
        let l = list(&c).unwrap();
        assert_eq!(l[0]["marken"][0]["_artikel"], 2);
        assert_eq!(artikel_zuordnen(&c, id, &["mk-nordwand".into()], "T").unwrap(), 0, "idempotent");
    }

    #[test]
    fn loeschen_nur_ohne_verweise() {
        let c = db();
        let a = save(&c, &zeile("Nordwand", 1), "T").unwrap();
        let b = save(&c, &zeile("Firn", 2), "T").unwrap();
        let (ia, ib) = (a["id"].as_str().unwrap().to_string(), b["id"].as_str().unwrap().to_string());
        artikel(&c, "A1", "Nordwand", Some(&ia));
        assert!(delete(&c, &ia, "T").unwrap_err().contains("1 Artikel"));
        c.execute("INSERT INTO purchase_orders(no, supplier_id, status, created_at) VALUES ('B-1', ?1, 'entwurf', 't')", [&ib]).unwrap();
        assert!(delete(&c, &ib, "T").unwrap_err().contains("1 Bestellungen"));
        let d = save(&c, &zeile("Leer", 3), "T").unwrap();
        let id = d["id"].as_str().unwrap();
        stamm::write_rows(&c, "edilieferant", &[json!({ "id": "E1", "lieferant": id, "gln": "x" }), json!({ "id": "E2", "lieferant": ia })]).unwrap();
        datei_add(&c, id, "preise.pdf", b"%PDF-1.4 x", "").unwrap();
        delete(&c, id, "T").unwrap();
        assert_eq!(purchasing::suppliers_alle(&c).unwrap().len(), 2);
        assert_eq!(stamm::list(&c, "edilieferant").unwrap().len(), 1, "Konfigurationszeile des gelöschten Lieferanten entfällt");
        assert_eq!(db::count(&c, "supplier_files"), 0);
        db::setting_set(&c, "verbund.rolle", &json!("filiale")).unwrap();
        assert!(delete(&c, &ia, "T").is_err() && save(&c, &zeile("X-Neu", 9), "T").is_err());
    }

    #[test]
    fn abgleich_mit_filial_kundennummern_nur_der_eigenen_filiale() {
        let z = db();
        db::setting_set(&z, "verbund.rolle", &json!("zentrale")).unwrap();
        db::setting_set(&z, "verbund.filiale", &json!("INN")).unwrap();
        artikel(&z, "A1", "Nordwand", None);
        marke::ensure_alle(&z);
        let mut r = zeile("Nordwand Outdoor", 7);
        r["customer_no"] = json!("K-100");
        r["profile"] = json!({ "filial_kunden": { "sbg": "S-77", "kit": "K-88" }, "info2": "intern", "rma_pflicht": true });
        r["marken"] = json!([{ "brand_id": "mk-nordwand", "edi_nr": "4711" }]);
        r["fields"] = json!({ "eigen": "wert" });
        let g = save(&z, &r, "T").unwrap();
        let mut zwei = zeile("Firn", 8);
        zwei["_aktiv"] = json!(false);
        save(&z, &zwei, "T").unwrap();
        let (sups, brands, ids) = fuer_abgleich(&z, "SBG").unwrap();
        assert_eq!(sups.len(), 2, "auch inaktive Lieferanten gehen mit");
        let n = sups.iter().find(|x| x["id"] == g["id"]).unwrap();
        assert_eq!(n["profile"]["filial_kunden"], json!({ "SBG": "S-77" }), "nur die Nummer der anfragenden Filiale");
        assert!(!sups.to_vec().iter().any(|x| x.to_string().contains("K-88")), "Kundennummer von KIT bleibt in der Zentrale");
        assert_eq!(brands.len(), 1);
        // Filialkasse übernimmt
        let f = db();
        db::setting_set(&f, "verbund.rolle", &json!("filiale")).unwrap();
        db::setting_set(&f, "verbund.filiale", &json!("SBG")).unwrap();
        f.execute("INSERT INTO suppliers(id, name, active, created_at, updated_at, nr) VALUES ('L-LOKAL','Nur lokal',1,'t','t',7)", []).unwrap();
        f.execute("INSERT INTO suppliers(id, name, active, created_at, updated_at, nr) VALUES ('L-BELEG','Mit Beleg',1,'t','t',99)", []).unwrap();
        f.execute("INSERT INTO purchase_orders(no, supplier_id, status, created_at) VALUES ('B-1','L-BELEG','entwurf','t')", []).unwrap();
        let tx = f.unchecked_transaction().unwrap();
        uebernehmen(&tx, &sups, Some(&brands), Some(&ids.iter().map(|i| json!(i)).collect::<Vec<Value>>())).unwrap();
        tx.commit().unwrap();
        let l = list(&f).unwrap();
        let mine = l.iter().find(|x| x["id"] == g["id"]).unwrap();
        assert_eq!((mine["nr"].as_i64(), mine["customer_no"].as_str(), mine["fields"]["eigen"].as_str()), (Some(7), Some("K-100"), Some("wert")));
        assert_eq!(kundennr(&purchasing::suppliers_alle(&f).unwrap().into_iter().find(|x| x.id == g["id"].as_str().unwrap()).unwrap(), "SBG"), "S-77", "Filial-Kundennummer vor der allgemeinen");
        assert_eq!(l.iter().find(|x| x["name"] == "Firn").unwrap()["_aktiv"], false, "Aktiv-Schalter der Zentrale gilt");
        assert!(l.iter().all(|x| x["id"] != "L-LOKAL"), "lokaler Lieferant ohne Verweise entfällt");
        assert_eq!(l.iter().find(|x| x["id"] == "L-BELEG").unwrap()["_aktiv"], false, "mit Beleg: nur deaktiviert");
        assert_eq!(mine["marken"][0]["edi_nr"], "4711");
        // Zeitstempel der Zentrale bleibt (kein „geändert“ bei jedem Abgleich)
        let t1 = mine["_geaendert"].clone();
        let tx = f.unchecked_transaction().unwrap();
        uebernehmen(&tx, &sups, Some(&brands), Some(&ids.iter().map(|i| json!(i)).collect::<Vec<Value>>())).unwrap();
        tx.commit().unwrap();
        assert_eq!(list(&f).unwrap().iter().find(|x| x["id"] == g["id"]).unwrap()["_geaendert"], t1);
        // Kürzel-Wechsel und Löschen einer Filiale
        let mut p = purchasing::suppliers_alle(&z).unwrap().into_iter().find(|x| x.id == g["id"].as_str().unwrap()).unwrap();
        assert_eq!(p.profile["filial_kunden"].as_object().unwrap().len(), 2);
        filiale_umbenannt(&z, "sbg", "SZG").unwrap();
        filiale_entfernt(&z, "kit").unwrap();
        p = purchasing::suppliers_alle(&z).unwrap().into_iter().find(|x| x.id == g["id"].as_str().unwrap()).unwrap();
        assert_eq!(p.profile["filial_kunden"], json!({ "SZG": "S-77" }));
    }

    #[test]
    fn dokumente_pruefen_speichern_loeschen() {
        let c = db();
        let a = save(&c, &zeile("Nordwand", 1), "T").unwrap();
        let id = a["id"].as_str().unwrap();
        c.execute("INSERT INTO users(id, name, role, pin_hash, pin_salt, created_at, updated_at, nr) VALUES ('u1','Lena Moser','verkauf','x','y','t','t',1001)", []).unwrap();
        assert!(datei_add(&c, id, "virus.exe", b"MZ", "u1").unwrap_err().contains("nicht erlaubt"));
        assert!(datei_add(&c, id, "skript.html", b"<script>", "u1").is_err() && datei_add(&c, id, "bild.svg", b"<svg>", "u1").is_err());
        assert!(datei_add(&c, id, "falsch.pdf", b"MZ\x90", "u1").unwrap_err().contains("passt nicht"));
        assert!(datei_add(&c, id, "leer.pdf", b"", "u1").is_err());
        assert!(datei_add(&c, "L-XXX", "a.pdf", b"%PDF", "u1").unwrap_err().contains("zuerst sichern"));
        let d = datei_add(&c, id, "../../etc/Preisliste Herbst.PDF", b"%PDF-1.7 daten", "u1").unwrap();
        assert_eq!((d["name"].as_str(), d["user_name"].as_str(), d["user_nr"].as_str()), (Some("Preisliste Herbst.PDF"), Some("Lena Moser"), Some("1001")), "Pfad entfernt, Mitarbeiter-Nr. und -Name vermerkt");
        let did = d["id"].as_i64().unwrap();
        datei_beschreiben(&c, did, "Preisliste Herbst 2026").unwrap();
        let l = datei_liste(&c, id).unwrap();
        assert_eq!((l.len(), l[0]["descr"].as_str(), l[0]["size"].as_i64()), (1, Some("Preisliste Herbst 2026"), Some(14)));
        assert_eq!(datei_lesen(&c, did).unwrap().1, b"%PDF-1.7 daten");
        assert!(list(&c).unwrap()[0]["_dateien"] == 1);
        assert!(datei_add(&c, id, "gross.pdf", &vec![b'%'; DATEI_MAX + 1], "u1").is_err());
        datei_loeschen(&c, did, "T").unwrap();
        assert!(datei_liste(&c, id).unwrap().is_empty() && datei_lesen(&c, did).is_err());
        db::setting_set(&c, "verbund.rolle", &json!("filiale")).unwrap();
        assert!(datei_add(&c, id, "a.pdf", b"%PDF", "u1").is_err());
    }

    #[test]
    fn demo_nur_einmal_und_alte_angaben_werden_uebernommen() {
        let c = db();
        artikel(&c, "A1", "Nordwand", None);
        purchasing::supplier_seed(&c).unwrap();
        let n = purchasing::suppliers_alle(&c).unwrap().len();
        assert_eq!(n, 4);
        let sup: String = c.query_row("SELECT supplier_id FROM articles WHERE id = 'A1'", [], |r| r.get(0)).unwrap();
        assert!(!sup.is_empty());
        let l = list(&c).unwrap();
        assert!(l.iter().any(|x| x["marken"].as_array().map(|m| m.iter().any(|b| b["name"] == "Nordwand")).unwrap_or(false)), "Demo-Lieferanten tragen ihre Marken");
        assert!(l.iter().all(|x| !x["note"].as_str().unwrap_or("").starts_with("Marken:")));
        // nach dem Löschen entstehen sie nicht neu
        c.execute("UPDATE articles SET supplier_id = NULL", []).unwrap();
        for x in &l {
            delete(&c, x["id"].as_str().unwrap(), "T").unwrap();
        }
        purchasing::supplier_seed(&c).unwrap();
        assert!(purchasing::suppliers_alle(&c).unwrap().is_empty());
        // alte Fassung: Notiz, Advarics-Nr., alte Markentabelle, Intrastat-Land
        let c = db();
        artikel(&c, "A1", "Firn", None);
        marke::ensure_alle(&c);
        c.execute("INSERT INTO suppliers(id, name, note, customer_no, active, created_at, updated_at, nr) VALUES ('L-001','Firn Sports','Marken: Firn',  '', 1,'t','t',1)", []).unwrap();
        c.execute("INSERT INTO suppliers(id, name, note, customer_no, active, created_at, updated_at, nr) VALUES ('ADV-4711','Advarics Lief','', '4711', 1,'t','t',2)", []).unwrap();
        db::setting_set(&c, "intrastat.laender", &json!({ "ADV-4711": "IT" })).unwrap();
        stamm::write_rows(&c, "edilieferant", &[json!({ "id": "E1", "lieferant": "ADV-4711", "gln": "4006381333931" }), json!({ "id": "E2", "lieferant": "L-001", "gln": "123" })]).unwrap();
        migrieren(&c).unwrap();
        let l = list(&c).unwrap();
        let firn = l.iter().find(|x| x["id"] == "L-001").unwrap();
        assert_eq!((firn["marken"][0]["name"].as_str(), firn["note"].as_str()), (Some("Firn"), Some("")));
        let adv = l.iter().find(|x| x["id"] == "ADV-4711").unwrap();
        assert_eq!((adv["nr"].as_i64(), adv["customer_no"].as_str(), adv["country"].as_str()), (Some(4711), Some(""), Some("IT")));
        assert_eq!(adv["profile"]["gln"], "4006381333931", "GLN aus den EDI-Einstellungen übernommen");
        assert!(firn["profile"].get("gln").map(|g| g.as_str().unwrap_or("").is_empty()).unwrap_or(true), "ungültige GLN wird nicht übernommen");
        migrieren(&c).unwrap();   // zweiter Lauf ändert nichts
    }
}
