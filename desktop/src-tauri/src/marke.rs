//! Marken (Stammdaten › Marken): eine Zeile je Marke in der Stammdaten-Art „marke“ mit den Herstellerangaben nach der
//! Produktsicherheitsverordnung (GPSR, VO (EU) 2023/988): Hersteller, Anschrift, elektronische Adresse und – bei einem
//! Hersteller außerhalb der EU – der Verantwortliche in der EU.
//!
//!  · Der Schlüssel (`id`) ist stabil („mk-…“, vorhandene Schlüssel bleiben); die Artikel verweisen weiter über den
//!    Markennamen (`articles.brand`). Umbenennen zieht deshalb alle namensbasierten Verweise mit (`umbenennen`).
//!  · Der Name ist eindeutig (ohne Groß/Klein, ®™© und Leerzeichen-Unterschiede ignoriert).
//!  · Löschen nur ohne Artikel; sonst „Aktiv“ ausschalten (die Herstellerangaben bleiben für vorhandene Artikel erhalten).
//!  · Pflege nur in der Zentrale bzw. am Einzelplatz; Filialkassen bekommen die Marken beim Abgleich (Stammdaten).
//!  · Unbekannte Marken aus den Artikeln werden automatisch als Marke angelegt (`ensure`).
//!  · Ausgabe nach außen (Schaufenster, REST-Schnittstelle) nur über die Positivliste `hersteller_json`.

use crate::{db, stamm, verbund};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub const KIND: &str = "marke";

/// Mitgliedstaaten der EU (Rückfall, falls die Länder-Tabelle das Land nicht kennt)
const EU27: [&str; 27] = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const ADR: [&str; 11] = ["name", "email", "adrzeile1", "adrzeile2", "strasse", "hausnr", "plz", "ort", "postfach", "land", "region"];

fn s(v: &Value) -> String {
    v.as_str().map(|x| x.trim().to_string()).unwrap_or_default()
}

/// Vergleichsform eines Markennamens: Kleinbuchstaben, ®™© entfernt, Leerzeichen zusammengezogen
pub fn norm(x: &str) -> String {
    x.replace(['®', '™', '©'], "").split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn slug(x: &str) -> String {
    let mut o = String::new();
    for ch in x.to_lowercase().chars() {
        match ch {
            'ä' => o.push_str("ae"),
            'ö' => o.push_str("oe"),
            'ü' => o.push_str("ue"),
            'ß' => o.push_str("ss"),
            c if c.is_ascii_alphanumeric() => o.push(c),
            _ => {
                if !o.ends_with('-') {
                    o.push('-');
                }
            }
        }
    }
    let t = o.trim_matches('-');
    if t.is_empty() { "marke".into() } else { t.chars().take(40).collect() }
}

/// Länder der EU: Länder-Tabelle (Spalte „EU“) vor der eingebauten Liste
pub fn eu_laender(c: &Connection) -> HashSet<String> {
    let mut set: HashSet<String> = EU27.iter().map(|x| x.to_string()).collect();
    if let Ok(rows) = stamm::list(c, "land") {
        for r in rows {
            let id = s(&r["id"]).to_uppercase();
            if id.is_empty() {
                continue;
            }
            if r["eu"].as_bool().unwrap_or(false) {
                set.insert(id);
            } else if !r["eu"].is_null() {
                set.remove(&id);
            }
        }
    }
    set
}

fn adr_pruefen(a: &Value, wo: &str, mit_name: bool) -> Result<Value, String> {
    let mut o = serde_json::Map::new();
    for k in ADR {
        let t = s(&a[k]);
        let max = if k == "name" || k == "email" { 120 } else { 80 };
        if t.chars().count() > max {
            return Err(format!("{wo}: „{k}“ ist zu lang (höchstens {max} Zeichen)"));
        }
        if k == "name" && !mit_name {
            continue;
        }
        o.insert(k.into(), json!(t));
    }
    let email = s(&o["email"]);
    if !email.is_empty() && !elektronisch_ok(&email) {
        return Err(format!("{wo}: Elektronische Adresse als E-Mail (name@firma.com) oder Web-Adresse (https://…)"));
    }
    let land = s(&o["land"]).to_uppercase();
    if !land.is_empty() && !(land.len() == 2 && land.chars().all(|c| c.is_ascii_alphabetic())) {
        return Err(format!("{wo}: Land als zweistelliger ISO-Code (z. B. AT)"));
    }
    o.insert("land".into(), json!(land));
    Ok(Value::Object(o))
}

/// E-Mail-Adresse oder Web-Adresse (http/https)
pub fn elektronisch_ok(x: &str) -> bool {
    let x = x.trim();
    if x.is_empty() || x.chars().any(|c| c.is_whitespace()) {
        return false;
    }
    let l = x.to_lowercase();
    if l.starts_with("http://") || l.starts_with("https://") {
        return l.len() > 8 && l.contains('.');
    }
    match x.split_once('@') {
        Some((a, b)) => !a.is_empty() && b.contains('.') && !b.starts_with('.') && !b.ends_with('.') && !b.contains('@'),
        None => false,
    }
}

fn anschrift_leer(a: &Value) -> bool {
    ["adrzeile1", "adrzeile2", "strasse", "hausnr", "plz", "ort", "postfach", "region"].iter().all(|k| s(&a[k]).is_empty())
}

/// Eingabe prüfen und in die gespeicherte Form bringen. Unbekannte Schlüssel der Zeile (z. B. aus früheren Fassungen) bleiben erhalten.
pub fn pruefen(row: &Value) -> Result<Value, String> {
    let name = s(&row["name"]);
    if name.is_empty() {
        return Err("Name fehlt".into());
    }
    if name.chars().count() > 120 {
        return Err("Name: höchstens 120 Zeichen".into());
    }
    let mut o = row.as_object().cloned().unwrap_or_default();
    o.retain(|k, _| !k.starts_with('_'));
    o.insert("name".into(), json!(name));
    let h = adr_pruefen(&row["hersteller"], "Hersteller", true)?;
    let e = adr_pruefen(&row["eu"], "Verantwortlicher in der EU", true)?;
    for (v, wo) in [(&h, "Postanschrift des Herstellers"), (&e, "Postanschrift in der EU")] {
        if s(&v["land"]).is_empty() && !anschrift_leer(v) {
            return Err(format!("{wo}: Land fehlt"));
        }
    }
    o.insert("hersteller".into(), h);
    o.insert("eu".into(), e);
    Ok(Value::Object(o))
}

/// GPSR-Vollständigkeit einer Marke: Stufe „ok“, „unvollstaendig“ oder „keine_angaben“ und die fehlenden Angaben
pub fn gpsr(row: &Value, eu: &HashSet<String>) -> (&'static str, Vec<String>) {
    let (h, e) = (&row["hersteller"], &row["eu"]);
    let leer = |v: &Value| s(&v["name"]).is_empty() && s(&v["email"]).is_empty() && anschrift_leer(v) && s(&v["land"]).is_empty();
    if leer(h) && leer(e) {
        return ("keine_angaben", vec!["Hersteller".into()]);
    }
    let mut fehlt = vec![];
    let strasse = |v: &Value| !s(&v["strasse"]).is_empty() || !s(&v["adrzeile1"]).is_empty();
    let voll = |v: &Value| strasse(v) && !s(&v["plz"]).is_empty() && !s(&v["ort"]).is_empty() && !s(&v["land"]).is_empty();
    if s(&h["name"]).is_empty() {
        fehlt.push("Name des Herstellers".into());
    }
    if !voll(h) {
        fehlt.push("Anschrift des Herstellers".into());
    }
    if !elektronisch_ok(&s(&h["email"])) {
        fehlt.push("Elektronische Adresse des Herstellers".into());
    }
    let hl = s(&h["land"]).to_uppercase();
    if hl.is_empty() || !eu.contains(&hl) {
        if s(&e["name"]).is_empty() {
            fehlt.push("Verantwortlicher in der EU".into());
        }
        if !voll(e) {
            fehlt.push("Anschrift in der EU".into());
        } else if !eu.contains(&s(&e["land"]).to_uppercase()) {
            fehlt.push("Anschrift in der EU (Land liegt nicht in der EU)".into());
        }
        if !elektronisch_ok(&s(&e["email"])) {
            fehlt.push("Elektronische Adresse in der EU".into());
        }
    }
    (if fehlt.is_empty() { "ok" } else { "unvollstaendig" }, fehlt)
}

/// Anzahl Artikel je Marke (alle, aktive), Schlüssel = Vergleichsform des Namens
pub fn artikel_je_marke(c: &Connection) -> HashMap<String, (i64, i64)> {
    let mut m: HashMap<String, (i64, i64)> = HashMap::new();
    if let Ok(mut st) = c.prepare("SELECT brand, COUNT(*), COALESCE(SUM(active), 0) FROM articles GROUP BY brand") {
        if let Ok(rows) = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))) {
            for (b, n, a) in rows.flatten() {
                let e = m.entry(norm(&b)).or_default();
                e.0 += n;
                e.1 += a;
            }
        }
    }
    m
}

/// Alle Zeilen für die Liste: mit Artikelzahl und GPSR-Stufe
pub fn list(c: &Connection) -> Result<Vec<Value>, String> {
    let mut rows = stamm::list(c, KIND)?;
    let eu = eu_laender(c);
    let n = artikel_je_marke(c);
    for r in rows.iter_mut() {
        let (alle, aktiv) = n.get(&norm(&s(&r["name"]))).copied().unwrap_or((0, 0));
        let (stufe, fehlt) = gpsr(r, &eu);
        r["_artikel"] = json!(alle);
        r["_artikel_aktiv"] = json!(aktiv);
        r["_gpsr"] = json!(stufe);
        r["_gpsr_fehlt"] = json!(fehlt);
    }
    Ok(rows)
}

fn schreiben(c: &Connection, r: &Value) -> Result<(), String> {
    let id = s(&r["id"]);
    let aktiv = r["_aktiv"].as_bool().unwrap_or(true);
    let mut d = r.clone();
    if let Some(o) = d.as_object_mut() {
        o.retain(|k, _| !k.starts_with('_') && k != "id");
    }
    let pos: i64 = c
        .query_row("SELECT pos FROM stamm WHERE kind = ?1 AND id = ?2", params![KIND, id], |x| x.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| c.query_row("SELECT COALESCE(MAX(pos) + 1, 0) FROM stamm WHERE kind = ?1", [KIND], |x| x.get(0)).unwrap_or(0));
    c.execute(
        "INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, active = excluded.active, updated_at = excluded.updated_at",
        params![KIND, id, d.to_string(), pos, aktiv as i64, db::now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn neue_id(c: &Connection, name: &str) -> String {
    let base = format!("mk-{}", slug(name));
    let mut id = base.clone();
    let mut k = 2;
    while c.query_row("SELECT 1 FROM stamm WHERE kind = ?1 AND lower(id) = lower(?2)", params![KIND, id], |_| Ok(())).optional().ok().flatten().is_some() {
        id = format!("{base}-{k}");
        k += 1;
    }
    id
}

/// Marke zu einem Namen finden (Vergleichsform)
pub fn finden(c: &Connection, name: &str) -> Option<Value> {
    let n = norm(name);
    if n.is_empty() {
        return None;
    }
    stamm::list(c, KIND).ok()?.into_iter().find(|r| norm(&s(&r["name"])) == n)
}

/// Marke anlegen, falls es sie noch nicht gibt (aus Artikeln, Importen, Artikelmaske). Nicht auf Filialkassen (dort kommen die Marken von der Zentrale).
pub fn ensure(c: &Connection, brand: &str) {
    let b = brand.trim();
    if b.is_empty() || verbund::rolle(c) == "filiale" {
        return;
    }
    let schnell: Option<i64> = c.query_row("SELECT 1 FROM stamm WHERE kind = ?1 AND json_extract(data, '$.name') = ?2", params![KIND, b], |x| x.get(0)).optional().ok().flatten();
    if schnell.is_some() || finden(c, b).is_some() {
        return;
    }
    let id = neue_id(c, b);
    let _ = schreiben(c, &json!({ "id": id, "name": b, "_aktiv": true }));
}

/// Alle Markennamen der Artikel als Marke anlegen (nach Import, beim Öffnen der Liste)
pub fn ensure_alle(c: &Connection) -> usize {
    if verbund::rolle(c) == "filiale" {
        return 0;
    }
    let brands: Vec<String> = match c.prepare("SELECT DISTINCT brand FROM articles WHERE trim(brand) <> ''") {
        Ok(mut st) => st.query_map([], |r| r.get::<_, String>(0)).map(|r| r.flatten().collect()).unwrap_or_default(),
        Err(_) => return 0,
    };
    let mut kennt: HashSet<String> = stamm::list(c, KIND).unwrap_or_default().iter().map(|r| norm(&s(&r["name"]))).collect();
    let mut neu = 0;
    for b in brands {
        let n = norm(&b);
        if n.is_empty() || kennt.contains(&n) {
            continue;
        }
        let id = neue_id(c, b.trim());
        if schreiben(c, &json!({ "id": id, "name": b.trim(), "_aktiv": true })).is_ok() {
            kennt.insert(n);
            neu += 1;
        }
    }
    neu
}

/// Markenname in allen namensbasierten Verweisen ersetzen: Artikel, Preisaktionen, Rabattregeln, Sales-Aktionen,
/// Webshop-Filter, Statistikfilter, Bonus-Systeme und die Standard-Marke für neue Artikel
fn umbenennen(c: &Connection, alt: &str, neu: &str) -> Result<(), String> {
    let na = norm(alt);
    let gleich = |x: &str| norm(x) == na;
    let now = db::now();
    // Artikel (auch Schreibweisen wie „Marke®“) – updated_at, damit der Filialabgleich die Änderung bekommt
    let brands: Vec<String> = c
        .prepare("SELECT DISTINCT brand FROM articles")
        .and_then(|mut st| st.query_map([], |r| r.get::<_, String>(0)).map(|r| r.flatten().collect()))
        .map_err(|e| e.to_string())?;
    for b in brands.iter().filter(|b| gleich(b) && b.as_str() != neu) {
        c.execute("UPDATE articles SET brand = ?2, updated_at = ?3 WHERE brand = ?1", params![b, neu, now]).map_err(|e| e.to_string())?;
    }
    // Preisaktionen (Gilt für: Marken)
    let promos: Vec<(i64, String)> = c
        .prepare("SELECT id, scope_values FROM promotions WHERE scope = 'marke'")
        .and_then(|mut st| st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))).map(|r| r.flatten().collect()))
        .unwrap_or_default();
    for (id, v) in promos {
        if let Ok(mut l) = serde_json::from_str::<Vec<String>>(&v) {
            if l.iter().any(|x| gleich(x)) {
                l.iter_mut().for_each(|x| if gleich(x) { *x = neu.to_string() });
                c.execute("UPDATE promotions SET scope_values = ?2, updated_at = ?3 WHERE id = ?1", params![id, serde_json::to_string(&l).unwrap(), now]).map_err(|e| e.to_string())?;
            }
        }
    }
    // Rabattregeln (Einstellung, gilt für alle Filialen)
    if let Some(mut regeln) = db::setting_get(c, "rabatt.regeln").filter(|v| v.is_array()) {
        let mut ch = false;
        for r in regeln.as_array_mut().unwrap() {
            if r["scope"] == "marke" {
                if let Some(w) = r["werte"].as_array_mut() {
                    for x in w.iter_mut() {
                        if x.as_str().map(gleich).unwrap_or(false) {
                            *x = json!(neu);
                            ch = true;
                        }
                    }
                }
            }
        }
        if ch {
            db::setting_set(c, "rabatt.regeln", &regeln).map_err(|e| e.to_string())?;
        }
    }
    // Standard-Marke für neue Artikel
    if let Some(v) = db::setting_get(c, "allg.marke") {
        if v.as_str().map(gleich).unwrap_or(false) {
            db::setting_set(c, "allg.marke", &json!(neu)).map_err(|e| e.to_string())?;
        }
    }
    // Sales-Aktionen (Belege der Art „praemie“)
    let docs: Vec<(i64, String)> = c
        .prepare("SELECT id, data FROM docs WHERE kind = 'praemie'")
        .and_then(|mut st| st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))).map(|r| r.flatten().collect()))
        .unwrap_or_default();
    for (id, d) in docs {
        if let Ok(mut v) = serde_json::from_str::<Value>(&d) {
            if v["scope"] == "marke" {
                if let Some(w) = v["werte"].as_array_mut() {
                    let mut ch = false;
                    for x in w.iter_mut() {
                        if x.as_str().map(gleich).unwrap_or(false) {
                            *x = json!(neu);
                            ch = true;
                        }
                    }
                    if ch {
                        c.execute("UPDATE docs SET data = ?2 WHERE id = ?1", params![id, v.to_string()]).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }
    // Stammdaten mit Markenwert: Webshop-Filter, Statistikfilter, Bonus-Systeme (Filter-Zeilen)
    for (kind, feld_k, feld_v, feld_w) in [("webfilter", "feld", "brand", "wert"), ("statistikfilter", "dimension", "marke", "wert")] {
        let mut rows = stamm::list(c, kind)?;
        let mut ch = false;
        for r in rows.iter_mut() {
            if r[feld_k] == feld_v && r[feld_w].as_str().map(gleich).unwrap_or(false) {
                r[feld_w] = json!(neu);
                ch = true;
            }
        }
        if ch {
            stamm::write_rows(c, kind, &rows)?;
        }
    }
    let mut bonus = stamm::list(c, "bonussystem")?;
    let mut ch = false;
    for r in bonus.iter_mut() {
        if let Some(f) = r["filter"].as_array_mut() {
            for z in f.iter_mut() {
                if z["typ"] == "marke" && z["wert"].as_str().map(gleich).unwrap_or(false) {
                    z["wert"] = json!(neu);
                    ch = true;
                }
            }
        }
    }
    if ch {
        stamm::write_rows(c, "bonussystem", &bonus)?;
    }
    Ok(())
}

/// Speichern (neu oder ändern). Rückgabe: die gespeicherte Zeile
pub fn save(c: &Connection, row: &Value, by: &str) -> Result<Value, String> {
    if verbund::rolle(c) == "filiale" {
        return Err("Marken pflegt die Zentrale – diese Kasse bekommt die Angaben beim nächsten Abgleich".into());
    }
    let mut r = pruefen(row)?;
    let name = s(&r["name"]);
    let alle = stamm::list(c, KIND)?;
    let id_in = s(&row["id"]);
    let alt = if id_in.is_empty() { None } else { alle.iter().find(|x| s(&x["id"]).eq_ignore_ascii_case(&id_in)) };
    if let Some(d) = alle.iter().find(|x| norm(&s(&x["name"])) == norm(&name) && !s(&x["id"]).eq_ignore_ascii_case(&id_in)) {
        return Err(format!("Die Marke „{}“ gibt es schon", s(&d["name"])));
    }
    if !id_in.is_empty() && alt.is_none() {
        return Err("Diese Marke gibt es nicht mehr – bitte die Liste aktualisieren".into());
    }
    let id = alt.map(|a| s(&a["id"])).unwrap_or_else(|| neue_id(c, &name));
    r["id"] = json!(id);
    r["_aktiv"] = json!(row["_aktiv"].as_bool().unwrap_or(true));
    // Unbekannte Schlüssel der gespeicherten Zeile (z. B. alte Spalten Lieferant/Land/Web) nicht verlieren
    if let Some(a) = alt {
        if let (Some(ro), Some(ao)) = (r.as_object_mut(), a.as_object()) {
            for (k, v) in ao {
                if !k.starts_with('_') && !ro.contains_key(k) {
                    ro.insert(k.clone(), v.clone());
                }
            }
        }
    }
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    let umbenannt = alt.map(|a| s(&a["name"])).filter(|n| n != &name);
    if let Some(alt_name) = &umbenannt {
        umbenennen(&tx, alt_name, &name)?;
    }
    schreiben(&tx, &r)?;
    db::audit_append(&tx, "marke.saved", &json!({ "marke": name, "neu": alt.is_none(), "umbenannt_von": umbenannt, "aktiv": r["_aktiv"], "durch": by })).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(r)
}

/// Löschen: nur ohne Artikel (auch inaktive) – sonst deaktivieren
pub fn delete(c: &Connection, id: &str, by: &str) -> Result<(), String> {
    if verbund::rolle(c) == "filiale" {
        return Err("Marken löscht die Zentrale".into());
    }
    let r = stamm::list(c, KIND)?.into_iter().find(|x| s(&x["id"]).eq_ignore_ascii_case(id.trim())).ok_or("Diese Marke gibt es nicht mehr")?;
    let name = s(&r["name"]);
    let n = artikel_je_marke(c).get(&norm(&name)).copied().unwrap_or((0, 0));
    if n.0 > 0 {
        return Err(format!("Zur Marke „{name}“ gehören {} Artikel – sie lässt sich nicht löschen, aber deaktivieren (Schalter „Aktiv“)", n.0));
    }
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM stamm WHERE kind = ?1 AND id = ?2", params![KIND, s(&r["id"])]).map_err(|e| e.to_string())?;
    db::audit_append(&tx, "marke.deleted", &json!({ "marke": name, "durch": by })).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

/// Anschrift in der Form für die Ausgabe nach außen
fn anschrift_json(v: &Value) -> Value {
    let iso = s(&v["land"]).to_uppercase();
    json!({ "adresszeile1": s(&v["adrzeile1"]), "adresszeile2": s(&v["adrzeile2"]), "strasse": s(&v["strasse"]), "hausnummer": s(&v["hausnr"]), "plz": s(&v["plz"]),
        "stadt": s(&v["ort"]), "postfach": s(&v["postfach"]), "region": s(&v["region"]), "land_iso": iso })
}

/// Herstellerangaben je Marke für Schaufenster und REST-Schnittstelle (Positivliste, nur Gefülltes). Schlüssel = Vergleichsform des Markennamens.
pub fn hersteller_json(c: &Connection) -> HashMap<String, Value> {
    let eu = eu_laender(c);
    let mut m = HashMap::new();
    for r in stamm::list(c, KIND).unwrap_or_default() {
        let (stufe, _) = gpsr(&r, &eu);
        if stufe == "keine_angaben" {
            continue;
        }
        let (h, e) = (&r["hersteller"], &r["eu"]);
        let mut o = json!({ "name": s(&h["name"]), "elektronische_adresse": s(&h["email"]), "anschrift": anschrift_json(h), "gpsr_vollstaendig": stufe == "ok" });
        if !s(&e["name"]).is_empty() || !s(&e["email"]).is_empty() || !anschrift_leer(e) {
            o["eu_verantwortlicher"] = json!({ "name": s(&e["name"]), "elektronische_adresse": s(&e["email"]), "anschrift": anschrift_json(e) });
        }
        m.insert(norm(&s(&r["name"])), o);
    }
    m
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        c
    }
    fn artikel(c: &Connection, id: &str, brand: &str) {
        c.execute("INSERT INTO articles(id, name, brand, category, glyph, price, vat, colors, sizes, fields, prompts, active, created_at, updated_at) VALUES (?1,'x',?2,'jacken','shirt',100,20,'[]','[]','{}','[]',1,'t','t')", params![id, brand]).unwrap();
    }
    fn voll(land: &str) -> Value {
        json!({ "name": "Amer Sports Austria GmbH", "email": "gpsr@amer.at", "strasse": "Hauptstr.", "hausnr": "1", "plz": "5020", "ort": "Salzburg", "land": land })
    }

    #[test]
    fn name_eindeutig_und_vergleichsform() {
        assert_eq!(norm("  Salomon®  Sport "), "salomon sport");
        let c = db();
        let a = save(&c, &json!({ "name": "Salomon" }), "T").unwrap();
        assert_eq!(a["id"], "mk-salomon");
        assert!(save(&c, &json!({ "name": "SALOMON®" }), "T").is_err(), "gleicher Name mit anderer Schreibweise");
        assert!(save(&c, &json!({ "name": " " }), "T").is_err());
        let b = save(&c, &json!({ "name": "Äpfel" }), "T").unwrap();
        assert_eq!(b["id"], "mk-aepfel");
        // Ändern der eigenen Zeile mit gleichem Namen ist erlaubt
        save(&c, &json!({ "id": "mk-salomon", "name": "Salomon", "hersteller": voll("AT") }), "T").unwrap();
        assert_eq!(stamm::list(&c, KIND).unwrap().len(), 2);
    }

    #[test]
    fn eingaben_werden_geprueft() {
        let c = db();
        assert!(save(&c, &json!({ "name": "A", "hersteller": { "email": "kein-at-zeichen" } }), "T").is_err());
        assert!(save(&c, &json!({ "name": "A", "hersteller": { "email": "https://amer.at/gpsr" } }), "T").is_ok());
        assert!(save(&c, &json!({ "name": "B", "hersteller": { "ort": "Wien" } }), "T").is_err(), "Anschrift ohne Land");
        assert!(save(&c, &json!({ "name": "C", "hersteller": { "ort": "Wien", "land": "Oesterreich" } }), "T").is_err());
        assert!(save(&c, &json!({ "name": "D", "hersteller": { "ort": "Wien", "land": "at" } }), "T").is_ok());
        let d = finden(&c, "D").unwrap();
        assert_eq!(d["hersteller"]["land"], "AT", "Land wird großgeschrieben");
        assert!(elektronisch_ok("a@b.at") && elektronisch_ok("http://x.de") && !elektronisch_ok("a@b") && !elektronisch_ok("a b@c.at") && !elektronisch_ok("javascript:alert(1)"));
    }

    #[test]
    fn gpsr_stufen() {
        let c = db();
        let eu = eu_laender(&c);
        assert_eq!(gpsr(&json!({ "name": "X" }), &eu).0, "keine_angaben");
        let eu_marke = json!({ "name": "X", "hersteller": voll("AT") });
        assert_eq!(gpsr(&eu_marke, &eu).0, "ok", "Hersteller in der EU braucht keinen Verantwortlichen");
        let ch = json!({ "name": "X", "hersteller": voll("CH") });
        let (st, f) = gpsr(&ch, &eu);
        assert_eq!(st, "unvollstaendig");
        assert!(f.iter().any(|x| x.contains("Verantwortlicher in der EU")), "{f:?}");
        let mit_eu = json!({ "name": "X", "hersteller": voll("CH"), "eu": voll("DE") });
        assert_eq!(gpsr(&mit_eu, &eu).0, "ok");
        let eu_aussen = json!({ "name": "X", "hersteller": voll("CH"), "eu": voll("CH") });
        assert!(gpsr(&eu_aussen, &eu).1.iter().any(|x| x.contains("nicht in der EU")));
        let ohne_adr = json!({ "name": "X", "hersteller": { "name": "Y GmbH", "email": "a@b.at", "land": "AT" } });
        assert!(gpsr(&ohne_adr, &eu).1.contains(&"Anschrift des Herstellers".to_string()));
        // Land-Tabelle überschreibt die eingebaute Liste
        stamm::save(&c, "land", &[json!({ "id": "CH", "name": "Schweiz", "eu": true })]).unwrap();
        assert_eq!(gpsr(&ch, &eu_laender(&c)).0, "ok");
    }

    #[test]
    fn marken_aus_artikeln_und_loeschen() {
        let c = db();
        artikel(&c, "A1", "Nordwand");
        artikel(&c, "A2", "nordwand®");
        artikel(&c, "A3", "Firn");
        artikel(&c, "A4", "");
        assert_eq!(ensure_alle(&c), 2, "zwei verschiedene Marken, leere und gleiche Namen zählen nicht");
        assert_eq!(ensure_alle(&c), 0, "idempotent");
        ensure(&c, "Neu");
        ensure(&c, "neu");
        assert_eq!(stamm::list(&c, KIND).unwrap().len(), 3);
        let l = list(&c).unwrap();
        let nw = l.iter().find(|r| r["name"] == "Nordwand").unwrap();
        assert_eq!(nw["_artikel"], 2);
        assert!(delete(&c, "mk-nordwand", "T").unwrap_err().contains("2 Artikel"));
        delete(&c, "mk-neu", "T").unwrap();
        assert_eq!(stamm::list(&c, KIND).unwrap().len(), 2);
        // auf einer Filialkasse wird nichts angelegt, nichts geändert
        db::setting_set(&c, "verbund.rolle", &json!("filiale")).unwrap();
        ensure(&c, "Filialmarke");
        assert!(finden(&c, "Filialmarke").is_none());
        assert!(save(&c, &json!({ "name": "X" }), "T").is_err());
        assert!(delete(&c, "mk-firn", "T").is_err());
    }

    #[test]
    fn umbenennen_zieht_verweise_mit() {
        let c = db();
        artikel(&c, "A1", "Nordwand");
        artikel(&c, "A2", "NORDWAND®");
        artikel(&c, "A3", "Firn");
        ensure_alle(&c);
        c.execute("INSERT INTO promotions(name, pct, scope, scope_values, from_date, to_date, active, created_at, updated_at) VALUES ('Aktion',10,'marke','[\"Nordwand\",\"Firn\"]','2020-01-01','2030-01-01',1,'t','t')", []).unwrap();
        db::setting_set(&c, "rabatt.regeln", &json!([{ "id": "r1", "scope": "marke", "werte": ["Nordwand"] }, { "id": "r2", "scope": "warengruppe", "werte": ["Nordwand"] }])).unwrap();
        db::setting_set(&c, "allg.marke", &json!("Nordwand")).unwrap();
        stamm::write_rows(&c, "webfilter", &[json!({ "id": "w1", "feld": "brand", "wert": "nordwand" }), json!({ "id": "w2", "feld": "cat", "wert": "Nordwand" })]).unwrap();
        stamm::write_rows(&c, "bonussystem", &[json!({ "id": "b1", "filter": [{ "typ": "marke", "wert": "Nordwand" }, { "typ": "warengruppe", "wert": "Nordwand" }] })]).unwrap();
        c.execute("INSERT INTO docs(kind, no, status, partner, partner_name, date, data, created_at, updated_at) VALUES ('praemie','P1','aktiv','','Team','2026-01-01','{\"scope\":\"marke\",\"werte\":[\"Nordwand\"]}','t','t')", []).unwrap();
        let r = save(&c, &json!({ "id": "mk-nordwand", "name": "Nordwand Alpin" }), "T").unwrap();
        assert_eq!(r["id"], "mk-nordwand", "Schlüssel bleibt");
        let b: Vec<String> = c.prepare("SELECT brand FROM articles ORDER BY id").unwrap().query_map([], |x| x.get(0)).unwrap().flatten().collect();
        assert_eq!(b, vec!["Nordwand Alpin", "Nordwand Alpin", "Firn"]);
        let p: String = c.query_row("SELECT scope_values FROM promotions", [], |x| x.get(0)).unwrap();
        assert_eq!(p, "[\"Nordwand Alpin\",\"Firn\"]");
        let rr = db::setting_get(&c, "rabatt.regeln").unwrap();
        assert_eq!(rr[0]["werte"][0], "Nordwand Alpin");
        assert_eq!(rr[1]["werte"][0], "Nordwand", "Warengruppen-Regel bleibt");
        assert_eq!(db::setting_get(&c, "allg.marke").unwrap(), json!("Nordwand Alpin"));
        let w = stamm::list(&c, "webfilter").unwrap();
        assert_eq!(w[0]["wert"], "Nordwand Alpin");
        assert_eq!(w[1]["wert"], "Nordwand");
        let bs = stamm::list(&c, "bonussystem").unwrap();
        assert_eq!(bs[0]["filter"][0]["wert"], "Nordwand Alpin");
        assert_eq!(bs[0]["filter"][1]["wert"], "Nordwand");
        let d: String = c.query_row("SELECT data FROM docs WHERE no = 'P1'", [], |x| x.get(0)).unwrap();
        assert!(d.contains("Nordwand Alpin"), "{d}");
        // Umbenennen auf einen vorhandenen Namen wird abgelehnt
        assert!(save(&c, &json!({ "id": "mk-nordwand", "name": "firn" }), "T").is_err());
    }

    #[test]
    fn ausgabe_nur_mit_positivliste() {
        let c = db();
        save(&c, &json!({ "name": "Salomon", "lieferant": "L-001", "hersteller": voll("AT"), "geheim": "x" }), "T").unwrap();
        save(&c, &json!({ "name": "Leer" }), "T").unwrap();
        let m = hersteller_json(&c);
        assert!(m.get("leer").is_none(), "Marken ohne Angaben erscheinen nicht");
        let s = m.get("salomon").unwrap();
        assert_eq!(s["name"], "Amer Sports Austria GmbH");
        assert_eq!(s["anschrift"]["stadt"], "Salzburg");
        assert_eq!(s["gpsr_vollstaendig"], true);
        let t = s.to_string();
        assert!(!t.contains("L-001") && !t.contains("geheim"), "keine internen Angaben: {t}");
        assert!(s.get("eu_verantwortlicher").is_none());
    }

    #[test]
    fn unbekannte_felder_bleiben() {
        let c = db();
        stamm::write_rows(&c, KIND, &[json!({ "id": "ALT", "name": "Alt", "lieferant": "L-001", "land": "Italien", "web": "alt.it" })]).unwrap();
        save(&c, &json!({ "id": "ALT", "name": "Alt", "_aktiv": false }), "T").unwrap();
        let r = finden(&c, "Alt").unwrap();
        assert_eq!(r["id"], "ALT");
        assert_eq!(r["lieferant"], "L-001");
        assert_eq!(r["web"], "alt.it");
        assert_eq!(r["_aktiv"], false);
    }
}
