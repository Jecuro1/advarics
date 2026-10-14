//! Filialen (Stammdaten › Filialen › Filialen): eine Zeile je Standort in der Stammdaten-Art „filiale“.
//! Der Schlüssel ist das Filial-Kürzel (wie im Filialverbund, danach unveränderlich). Die Zeile ist die einzige
//! Quelle für alles, was eine Filiale ausmacht – Nummer, Name, Farbe, Kontakt, Steuerdaten, Bank, Adressen.
//!
//!  · Pflege nur in der Zentrale bzw. am Einzelplatz; Filialkassen bekommen die Zeilen beim Abgleich
//!    (andere Filialen nur mit den öffentlichen Feldern – Bank, Steuer und Inhaber bleiben vertraulich).
//!  · Die eigene Zeile wird in die Einstellungen gespiegelt (firma.*, zahlung.*, verbund.name), damit Belege,
//!    Bon, Kundendisplay und Schaufenster ohne weitere Änderung die Angaben dieser Filiale zeigen.
//!  · Die technische Anbindung (Schlüssel, letzter Abgleich) bleibt in der Tabelle „stores“; Name, Adresse und
//!    „aktiv“ werden dorthin gespiegelt.

use crate::{db, stamm, verbund};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

pub const KIND: &str = "filiale";

/// Felder, die andere Filialen sehen dürfen (alles übrige – Bank, UID, Steuernummer, Inhaber, Zusatzadressen – nicht)
const OEFFENTLICH: [&str; 11] = ["nr", "name", "kurz", "farbe", "haustyp", "land", "strasse", "hausnr", "plz", "ort", "tel"];
const TEXT_FELDER: [&str; 23] = [
    "name", "kurz", "haustyp", "tel", "fax", "mobil", "email", "web", "inhaber", "uid", "steuernr", "iban", "bic", "bank", "adrzeile1", "adrzeile2", "strasse", "hausnr", "plz", "ort", "postfach", "land", "farbe",
];

fn s(v: &Value) -> String {
    v.as_str().map(|x| x.trim().to_string()).unwrap_or_default()
}

/// Zeilen so weitergeben, wie die Filiale `store` sie sehen darf: die eigene vollständig, die anderen mit den öffentlichen Feldern
pub fn projekt(rows: &[Value], store: &str) -> Vec<Value> {
    rows.iter()
        .map(|r| {
            if r["id"].as_str().map(|i| i.eq_ignore_ascii_case(store)).unwrap_or(false) {
                return r.clone();
            }
            let mut o = serde_json::Map::new();
            for k in ["id", "_aktiv", "_pos"] {
                if !r[k].is_null() {
                    o.insert(k.into(), r[k].clone());
                }
            }
            for k in OEFFENTLICH {
                if !r[k].is_null() {
                    o.insert(k.into(), r[k].clone());
                }
            }
            Value::Object(o)
        })
        .collect()
}

/// Alle Stammdaten für den Abgleich mit der Filiale `store` (die Tabelle „filiale“ mit Sicht der jeweiligen Filiale)
pub fn all_for(c: &Connection, store: &str) -> Result<Value, String> {
    let mut v = stamm::all(c)?;
    if let Some(rows) = v[KIND].as_array() {
        let p = projekt(rows, store);
        v[KIND] = json!(p);
    }
    Ok(v)
}

/// IBAN ohne Leerzeichen, Großbuchstaben; Prüfziffer nach ISO 7064 (mod 97)
pub fn iban_norm(x: &str) -> Result<String, String> {
    let n: String = x.chars().filter(|c| !c.is_whitespace()).collect::<String>().to_uppercase();
    if n.is_empty() {
        return Ok(n);
    }
    if n.len() < 15 || n.len() > 34 || !n.chars().all(|c| c.is_ascii_alphanumeric()) || !n[..2].chars().all(|c| c.is_ascii_alphabetic()) || !n[2..4].chars().all(|c| c.is_ascii_digit()) {
        return Err("IBAN: 15–34 Zeichen, beginnt mit Länderkennung und Prüfziffer (z. B. AT61 1904 3002 3457 3201)".into());
    }
    let r = format!("{}{}", &n[4..], &n[..4]);
    let mut rest: u32 = 0;
    for ch in r.chars() {
        let d = if ch.is_ascii_digit() { ch.to_digit(10).unwrap() } else { ch as u32 - 'A' as u32 + 10 };
        rest = if d >= 10 { (rest * 100 + d) % 97 } else { (rest * 10 + d) % 97 };
    }
    if rest != 1 {
        return Err("IBAN: Prüfziffer stimmt nicht – bitte Eingabe kontrollieren".into());
    }
    Ok(n)
}

fn kuerzel(x: &str) -> Result<String, String> {
    let id = x.trim().to_uppercase();
    if id.len() < 2 || id.len() > 12 || !id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') {
        return Err("Kürzel: 2–12 Zeichen, Buchstaben/Ziffern (z. B. SBG)".into());
    }
    Ok(id)
}

fn adresse_pruefen(a: &Value, wo: &str) -> Result<Value, String> {
    let mut o = serde_json::Map::new();
    for k in ["adrzeile1", "adrzeile2", "strasse", "hausnr", "plz", "ort", "postfach", "land"] {
        let t = s(&a[k]);
        if t.chars().count() > 80 {
            return Err(format!("{wo}: „{k}“ ist zu lang"));
        }
        o.insert(k.into(), json!(t));
    }
    let land = s(&a["land"]).to_uppercase();
    if !land.is_empty() && !(land.len() == 2 && land.chars().all(|c| c.is_ascii_alphabetic())) {
        return Err(format!("{wo}: Land als zweistelliger ISO-Code (z. B. AT)"));
    }
    o.insert("land".into(), json!(land));
    Ok(Value::Object(o))
}

/// Eingabe prüfen und in die gespeicherte Form bringen (ohne _-Felder)
pub fn pruefen(row: &Value) -> Result<Value, String> {
    let id = kuerzel(row["id"].as_str().unwrap_or(""))?;
    let mut o = serde_json::Map::new();
    o.insert("id".into(), json!(id));
    for k in TEXT_FELDER {
        let t = s(&row[k]);
        if t.chars().count() > 120 {
            return Err(format!("„{k}“ ist zu lang (höchstens 120 Zeichen)"));
        }
        o.insert(k.into(), json!(t));
    }
    if s(&o["name"]).is_empty() {
        return Err("Name fehlt".into());
    }
    let nr = row["nr"].as_i64().or_else(|| row["nr"].as_str().and_then(|x| x.trim().parse().ok())).unwrap_or(0);
    if !(1..=99999).contains(&nr) {
        return Err("Nr.: ganze Zahl ab 1".into());
    }
    o.insert("nr".into(), json!(nr));
    let farbe = s(&o["farbe"]);
    if !farbe.is_empty() && !(farbe.len() == 7 && farbe.starts_with('#') && farbe[1..].chars().all(|c| c.is_ascii_hexdigit())) {
        return Err("Filial-Farbe: Farbwert wie #1F6FD1".into());
    }
    let email = s(&o["email"]);
    if !email.is_empty() && (!email.contains('@') || email.starts_with('@') || email.ends_with('@') || email.contains(' ')) {
        return Err("E-Mail: Adresse wie name@firma.at".into());
    }
    o.insert("iban".into(), json!(iban_norm(&s(&o["iban"]))?));
    let bic: String = s(&o["bic"]).chars().filter(|c| !c.is_whitespace()).collect::<String>().to_uppercase();
    if !bic.is_empty() && !((bic.len() == 8 || bic.len() == 11) && bic.chars().all(|c| c.is_ascii_alphanumeric())) {
        return Err("BIC: 8 oder 11 Zeichen (z. B. BKAUATWW)".into());
    }
    o.insert("bic".into(), json!(bic));
    let uid: String = s(&o["uid"]).chars().filter(|c| !c.is_whitespace()).collect::<String>().to_uppercase();
    if !uid.is_empty() && !(uid.chars().all(|c| c.is_ascii_alphanumeric()) && (4..=14).contains(&uid.len()) && uid.chars().take(2).all(|c| c.is_ascii_alphabetic())) {
        return Err("USt-IdNr.: Länderkennung und Nummer (z. B. ATU12345678)".into());
    }
    o.insert("uid".into(), json!(uid));
    // Haupt-Adresse: Land ist Pflicht (Vorgabe AT)
    let mut main = serde_json::Map::new();
    for k in ["adrzeile1", "adrzeile2", "strasse", "hausnr", "plz", "ort", "postfach", "land"] {
        main.insert(k.into(), o[k].clone());
    }
    let main = adresse_pruefen(&Value::Object(main), "Haupt-Adresse")?;
    for (k, v) in main.as_object().unwrap() {
        o.insert(k.clone(), v.clone());
    }
    if s(&o["land"]).is_empty() {
        o.insert("land".into(), json!("AT"));
    }
    let mut zusatz = vec![];
    for (i, a) in row["zusatz"].as_array().cloned().unwrap_or_default().iter().enumerate() {
        let typ = s(&a["typ"]);
        if !["rechnung", "liefer", "beide"].contains(&typ.as_str()) {
            return Err(format!("Zusätzliche Adresse {}: Art wählen (Rechnungs-, Lieferadresse oder beides)", i + 1));
        }
        let mut z = adresse_pruefen(a, &format!("Zusätzliche Adresse {}", i + 1))?;
        if s(&z["ort"]).is_empty() || (s(&z["strasse"]).is_empty() && s(&z["postfach"]).is_empty()) {
            return Err(format!("Zusätzliche Adresse {}: Straße (oder Postfach) und Ort angeben", i + 1));
        }
        if s(&z["land"]).is_empty() {
            z["land"] = json!("AT");
        }
        z["typ"] = json!(typ);
        zusatz.push(z);
    }
    if zusatz.len() > 10 {
        return Err("Höchstens 10 zusätzliche Adressen".into());
    }
    o.insert("zusatz".into(), json!(zusatz));
    o.insert("nummern".into(), crate::nummern::pruefen(&row["nummern"])?);
    // Fußzeilen der Belege (Klartext, mehrzeilig); leer = Standard der Kasse (Einstellungen › Bon & Belege)
    for (k, l) in [("fuss_a4", "Fußzeile A4-Belege"), ("fuss_bon", "Text am Bonende")] {
        let t = row[k].as_str().unwrap_or("").replace('\r', "").trim().to_string();
        if t.chars().count() > 600 {
            return Err(format!("{l}: höchstens 600 Zeichen"));
        }
        o.insert(k.into(), json!(t));
    }
    o.insert("_aktiv".into(), json!(row["_aktiv"].as_bool().unwrap_or(true)));
    Ok(Value::Object(o))
}

/// „Straße 12, 6020 Innsbruck“ – wie bisher in firma.adresse
pub fn adresse_zeile(r: &Value) -> String {
    let st = format!("{} {}", s(&r["strasse"]), s(&r["hausnr"])).trim().to_string();
    let ort = format!("{} {}", s(&r["plz"]), s(&r["ort"])).trim().to_string();
    [st, ort].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join(", ")
}

fn rows(c: &Connection) -> Result<Vec<Value>, String> {
    stamm::list(c, KIND)
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
        .unwrap_or_else(|| c.query_row("SELECT COALESCE(MAX(pos),-1)+1 FROM stamm WHERE kind = ?1", [KIND], |x| x.get(0)).unwrap_or(0));
    c.execute(
        "INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, active = excluded.active, updated_at = excluded.updated_at",
        params![KIND, id, d.to_string(), pos, aktiv as i64, db::now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Die eigene Zeile gibt es immer (Zentrale und Einzelplatz): fehlt sie, entsteht sie aus den bisherigen Angaben (`seed`:
/// Firmenname, Kurzname, Adresse, UID, Telefon, Bank – so wie die Einstellungen sie heute zeigen). In einer Filiale kommt sie von der Zentrale.
pub fn ensure_own(c: &Connection, seed: &Value) -> Result<(), String> {
    if verbund::rolle(c) == "filiale" {
        return Ok(());
    }
    let own = verbund::own_store(c);
    let all = rows(c)?;
    if all.iter().any(|r| s(&r["id"]).eq_ignore_ascii_case(&own)) {
        return Ok(());
    }
    let nr = all.iter().filter_map(|r| r["nr"].as_i64()).max().unwrap_or(0) + 1;
    let mut r = json!({ "id": own, "nr": if all.is_empty() { 1 } else { nr }, "_aktiv": true, "land": "AT", "zusatz": [] });
    for k in TEXT_FELDER {
        if !seed[k].is_null() {
            r[k] = json!(s(&seed[k]));
        }
    }
    if s(&r["name"]).is_empty() {
        r["name"] = json!(s(&seed["kurz"]).chars().take(60).collect::<String>());
    }
    if s(&r["name"]).is_empty() {
        r["name"] = json!(own);
    }
    // alte Werte nicht lesbar (z. B. IBAN mit Tippfehler)? Schrittweise ohne die fehlerhaften Angaben übernehmen, zuletzt nur Nr. und Name
    let r = match pruefen(&r) {
        Ok(v) => v,
        Err(_) => {
            for k in ["iban", "bic", "uid", "email"] {
                r[k] = json!("");
            }
            match pruefen(&r) {
                Ok(v) => v,
                Err(_) => pruefen(&json!({ "id": own, "nr": r["nr"], "name": s(&r["name"]).chars().take(120).collect::<String>(), "land": "AT", "_aktiv": true }))?,
            }
        }
    };
    schreiben(c, &r)
}

/// Eigene Zeile und – in der Zentrale – die Zeilen der schon angebundenen Filialen sicherstellen
pub fn ensure_all(c: &Connection, seed: &Value) -> Result<(), String> {
    ensure_own(c, seed)?;
    ensure_stores(c)
}

/// „Getreidegasse 31, 5020 Salzburg“ → Straße, Haus-Nr., PLZ, Ort (für Filialen, die vor Stammdaten › Filialen angelegt wurden)
fn adresse_lesen(a: &str) -> (String, String, String, String) {
    let (links, rechts) = match a.rsplit_once(',') {
        Some((l, r)) => (l.trim(), r.trim()),
        None => (a.trim(), ""),
    };
    let (mut plz, mut ort) = (String::new(), rechts.to_string());
    if let Some((p, o)) = rechts.split_once(' ') {
        if p.chars().all(|c| c.is_ascii_digit()) && (4..=5).contains(&p.len()) {
            plz = p.to_string();
            ort = o.trim().to_string();
        }
    }
    let (mut strasse, mut hausnr) = (links.to_string(), String::new());
    if let Some((st, nr)) = links.rsplit_once(' ') {
        if nr.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) && !st.trim().is_empty() {
            strasse = st.trim().to_string();
            hausnr = nr.to_string();
        }
    }
    (strasse, hausnr, plz, ort)
}

/// Angaben, die die Filialkasse beim Abgleich mitschickt (Einstellungen firma.*/zahlung.*) → Felder einer Filial-Zeile (nur nichtleere)
fn aus_info(info: &Value) -> serde_json::Map<String, Value> {
    let f = &info["firma"];
    let mut o = serde_json::Map::new();
    let mut put = |k: &str, v: String| {
        if !v.is_empty() {
            o.insert(k.into(), json!(v));
        }
    };
    put("name", s(&f["name"]));
    let (strasse, hausnr, plz, ort) = adresse_lesen(&s(&f["adresse"]));
    if !ort.is_empty() || !strasse.is_empty() {
        put("strasse", strasse);
        put("hausnr", hausnr);
        put("plz", plz);
        put("ort", ort);
    }
    for (k, q) in [("uid", "uid"), ("steuernr", "steuernr"), ("tel", "telefon"), ("fax", "fax"), ("mobil", "mobil"), ("email", "email"), ("web", "web"), ("inhaber", "inhaber"), ("iban", "iban"), ("bic", "bic"), ("bank", "bank")] {
        put(k, s(&f[q]));
    }
    o
}

/// Filialen, die schon im Filialverbund angelegt sind (Tabelle „stores“), bekommen ihre Zeile in den Stammdaten (Zentrale).
/// Die Zeile ist „vorläufig“, bis die Zentrale sie speichert: sie enthält Name und Adresse aus der Anbindung und – soweit die
/// Filialkasse sie beim Abgleich mitgeschickt hat – deren bisherige Firmen- und Bankdaten. Eine vorläufige Zeile ändert die
/// Einstellungen der Filialkasse nicht (apply_own); fehlende Angaben werden bei jedem Aufruf nachgetragen.
pub fn ensure_stores(c: &Connection) -> Result<(), String> {
    if verbund::rolle(c) != "zentrale" {
        return Ok(());
    }
    let all = rows(c)?;
    let mut nr = all.iter().filter_map(|r| r["nr"].as_i64()).max().unwrap_or(0);
    let mut st = c.prepare("SELECT id, name, addr, active, info FROM stores ORDER BY created_at, id").map_err(|e| e.to_string())?;
    let list: Vec<(String, String, String, bool, Value)> = st
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get::<_, i64>(3)? != 0, serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(json!({})))))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    for (id, name, addr, aktiv, info) in list {
        let extra = aus_info(&info);
        if let Some(alt) = all.iter().find(|r| s(&r["id"]).eq_ignore_ascii_case(&id)) {
            // vorläufige Zeile: leere Felder aus den Angaben der Filialkasse nachtragen
            if alt["vorlaeufig"].as_bool() == Some(true) {
                let mut r = alt.clone();
                let mut ch = false;
                for (k, v) in &extra {
                    if s(&r[k.as_str()]).is_empty() || (k == "name" && s(&r["name"]) == name) {
                        // jedes Feld einzeln prüfen: ein ungültiger Wert (z. B. IBAN mit falscher Prüfziffer) lässt nur dieses Feld weg
                        let mut t = r.clone();
                        t[k.as_str()] = v.clone();
                        if pruefen(&t).is_ok() {
                            r = t;
                            ch = true;
                        }
                    }
                }
                if ch {
                    if let Ok(mut p) = pruefen(&r) {
                        p["vorlaeufig"] = json!(true);
                        schreiben(c, &p)?;
                    }
                }
            }
            continue;
        }
        nr += 1;
        let (strasse, hausnr, plz, ort) = adresse_lesen(&addr);
        let basis = json!({ "id": id, "nr": nr, "name": name, "kurz": name, "strasse": strasse, "hausnr": hausnr, "plz": plz, "ort": ort, "land": "AT", "zusatz": [], "_aktiv": aktiv });
        let mut r = basis.clone();
        for (k, v) in &extra {
            // Angaben der Filialkasse feldweise übernehmen: ein ungültiger Wert lässt nur dieses Feld weg
            let mut t = r.clone();
            t[k.as_str()] = v.clone();
            if pruefen(&t).is_ok() {
                r = t;
            }
        }
        let mut r = match pruefen(&r) {
            Ok(v) => v,
            Err(_) => match pruefen(&basis) {
                Ok(v) => v,
                Err(_) => pruefen(&json!({ "id": id, "nr": nr, "name": if name.trim().is_empty() { id.clone() } else { name }, "land": "AT", "_aktiv": aktiv }))?,
            },
        };
        r["vorlaeufig"] = json!(true);
        schreiben(c, &r)?;
    }
    Ok(())
}

/// Kürzel der eigenen Filiale hat sich geändert (Rolle gewechselt): die Zeile zieht mit
pub fn rekey_own(c: &Connection, alt: &str, neu: &str) -> Result<(), String> {
    let (alt, neu) = (alt.trim().to_uppercase(), neu.trim().to_uppercase());
    if alt == neu || alt.is_empty() || neu.is_empty() {
        return Ok(());
    }
    let has = |id: &str| c.query_row("SELECT 1 FROM stamm WHERE kind = ?1 AND id = ?2", params![KIND, id], |_| Ok(())).optional().map(|x| x.is_some()).unwrap_or(false);
    if has(&alt) && !has(&neu) {
        c.execute("UPDATE stamm SET id = ?3 WHERE kind = ?1 AND id = ?2", params![KIND, alt, neu]).map_err(|e| e.to_string())?;
        // Zuordnungen zu Filialgruppen ziehen mit
        let mut gr = stamm::list(c, "filialgruppe")?;
        let mut ch = false;
        for g in gr.iter_mut() {
            if let Some(l) = g["filialen"].as_array().cloned() {
                let n: Vec<Value> = l.into_iter().map(|x| if x.as_str().map(|t| t.eq_ignore_ascii_case(&alt)).unwrap_or(false) { json!(neu) } else { x }).collect();
                if g["filialen"].as_array().map(|a| a != &n).unwrap_or(false) {
                    g["filialen"] = json!(n);
                    ch = true;
                }
            }
        }
        if ch {
            stamm::save(c, "filialgruppe", &gr)?;
        }
    }
    Ok(())
}

/// Kurz-Name der eigenen Zeile setzen (Eingabe beim Einrichten des Filialverbunds); leer ändert nichts
pub fn kurz_setzen(c: &Connection, name: &str) -> Result<(), String> {
    let name = name.trim();
    let own = verbund::own_store(c);
    if name.is_empty() {
        return Ok(());
    }
    if let Some(mut r) = rows(c)?.into_iter().find(|r| s(&r["id"]).eq_ignore_ascii_case(&own)) {
        if s(&r["kurz"]) != name {
            r["kurz"] = json!(name.chars().take(120).collect::<String>());
            schreiben(c, &r)?;
        }
    }
    Ok(())
}

/// Die eigene Zeile in die Einstellungen übernehmen (Belege, Bon, Kundendisplay, Schaufenster lesen dort)
pub fn apply_own(c: &Connection) -> Result<(), String> {
    let own = verbund::own_store(c);
    let Some(r) = rows(c)?.into_iter().find(|r| s(&r["id"]).eq_ignore_ascii_case(&own)) else { return Ok(()) };
    if r["vorlaeufig"].as_bool() == Some(true) {
        return Ok(());   // noch nicht von der Zentrale bestätigt: die Filialkasse behält ihre eigenen Angaben
    }
    let set = |k: &str, v: String| db::setting_set(c, k, &json!(v)).map_err(|e| e.to_string());
    set("firma.name", s(&r["name"]))?;
    set("firma.adresse", adresse_zeile(&r))?;
    set("firma.adrzeile1", s(&r["adrzeile1"]))?;
    set("firma.adrzeile2", s(&r["adrzeile2"]))?;
    set("firma.postfach", s(&r["postfach"]))?;
    set("firma.land", s(&r["land"]))?;
    set("firma.uid", s(&r["uid"]))?;
    set("firma.steuernr", s(&r["steuernr"]))?;
    set("firma.telefon", s(&r["tel"]))?;
    set("firma.fax", s(&r["fax"]))?;
    set("firma.mobil", s(&r["mobil"]))?;
    set("firma.email", s(&r["email"]))?;
    set("firma.web", s(&r["web"]))?;
    set("firma.inhaber", s(&r["inhaber"]))?;
    set("zahlung.iban", s(&r["iban"]))?;
    set("zahlung.bic", s(&r["bic"]))?;
    set("zahlung.bank", s(&r["bank"]))?;
    let kurz = if s(&r["kurz"]).is_empty() { s(&r["name"]) } else { s(&r["kurz"]) };
    set("verbund.name", kurz)?;
    Ok(())
}

/// Anzeigename einer Filiale: Kurz-Name, sonst Name
pub fn anzeigename(r: &Value) -> String {
    if s(&r["kurz"]).is_empty() { s(&r["name"]) } else { s(&r["kurz"]) }
}

/// Speichern (neu oder ändern). Rückgabe: gespeicherte Zeile und – nur bei einer neuen Filiale in der Zentrale – der Anbindungsschlüssel
pub fn save(c: &Connection, row: &Value, by: &str) -> Result<(Value, Option<String>), String> {
    let rolle = verbund::rolle(c);
    if rolle == "filiale" {
        return Err("Filialen pflegt die Zentrale – diese Kasse bekommt die Angaben beim nächsten Abgleich".into());
    }
    let r = pruefen(row)?;
    let id = s(&r["id"]);
    let own = verbund::own_store(c);
    let is_own = id.eq_ignore_ascii_case(&own);
    let mut all = rows(c)?;
    if rolle == "einzel" {
        // Einzelplatz: Zeilen einer früheren Zentrale sind verborgen (filiale_list) und zählen auch bei den Prüfungen nicht mit
        all.retain(|x| s(&x["id"]).eq_ignore_ascii_case(&own));
    }
    let alt = all.iter().find(|x| s(&x["id"]).eq_ignore_ascii_case(&id));
    if alt.is_none() && !is_own && rolle != "zentrale" {
        return Err("Weitere Filialen legt die Zentrale an – dafür unter Einstellungen › Filialverbund diese Installation als Zentrale einrichten".into());
    }
    if let Some(d) = all.iter().find(|x| !s(&x["id"]).eq_ignore_ascii_case(&id) && x["nr"].as_i64() == r["nr"].as_i64()) {
        return Err(format!("Die Nr. {} hat schon die Filiale „{}“", r["nr"], anzeigename(d)));
    }
    if is_own && !r["_aktiv"].as_bool().unwrap_or(true) {
        return Err("Die eigene Filiale lässt sich nicht deaktivieren".into());
    }
    crate::nummern::auf_ueberschneidung(&r["nummern"], &id, &all)?;
    // Die Zentrale zählt ohne eigenen Bereich unbegrenzt weiter (und hat vielleicht schon viele Nummern vergeben): Bereiche der Filialen gibt es erst,
    // wenn die Zentrale selbst einen Bereich hat – sonst könnte sie in deren Bereich laufen
    if rolle == "zentrale" && !is_own && alt.map(|a| a["nummern"] != r["nummern"]).unwrap_or(true) {
        if let Some(eig) = all.iter().find(|x| s(&x["id"]).eq_ignore_ascii_case(&own)) {
            let stand = crate::nummern::stand(c);
            for (art, label, _) in crate::nummern::ARTEN {
                if r["nummern"][art]["start"].as_i64().unwrap_or(0) > 0 && eig["nummern"][art]["start"].as_i64().unwrap_or(0) == 0 {
                    let n = stand["kreise"][art]["naechste"].as_i64().unwrap_or(1);
                    return Err(format!("Nummernkreis {label}: Die Zentrale vergibt diese Nummern noch ohne Bereich fortlaufend (nächste Nr. {n}) und könnte in den Bereich der Filiale laufen – bitte zuerst für die Zentrale einen Bereich eintragen (z. B. 1–19999)"));
                }
            }
        }
    }
    let mut key = None;
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    schreiben(&tx, &r)?;
    if rolle == "zentrale" && !is_own {
        let addr = adresse_zeile(&r);
        let name = anzeigename(&r);
        let da: i64 = tx.query_row("SELECT COUNT(*) FROM stores WHERE id = ?1", [&id], |x| x.get(0)).map_err(|e| e.to_string())?;
        if da == 0 {
            key = Some(verbund::store_create(&tx, &id, &name, &addr)?);
        }
        tx.execute("UPDATE stores SET name = ?2, addr = ?3, active = ?4 WHERE id = ?1", params![id, name, addr, r["_aktiv"].as_bool().unwrap_or(true) as i64]).map_err(|e| e.to_string())?;
    }
    if is_own {
        apply_own(&tx)?;
    }
    db::audit_append(&tx, "filiale.saved", &json!({ "filiale": id, "name": s(&r["name"]), "neu": alt.is_none(), "aktiv": r["_aktiv"], "durch": by })).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok((r, key))
}

/// Fußzeile(n) für alle Filialen übernehmen (nur Zentrale). `None` lässt das jeweilige Feld unverändert.
pub fn fuss_fuer_alle(c: &Connection, a4: Option<&str>, bon: Option<&str>, by: &str) -> Result<usize, String> {
    if verbund::rolle(c) != "zentrale" {
        return Err("Fußzeilen für alle Filialen setzt die Zentrale".into());
    }
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    let all = rows(&tx)?;
    for mut r in all.clone() {
        for (k, v) in [("fuss_a4", a4), ("fuss_bon", bon)] {
            if let Some(t) = v {
                let t = t.replace('\r', "").trim().to_string();
                if t.chars().count() > 600 {
                    return Err("Höchstens 600 Zeichen".into());
                }
                r[k] = json!(t);
            }
        }
        schreiben(&tx, &r)?;
    }
    apply_own(&tx)?;
    db::audit_append(&tx, "filiale.fuss", &json!({ "filialen": all.len(), "a4": a4.is_some(), "bon": bon.is_some(), "durch": by })).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(all.len())
}

/// Löschen (nur Zentrale, nicht die eigene, nur ohne Belege und Umlagerungen – sonst deaktivieren)
pub fn delete(c: &Connection, id: &str, by: &str) -> Result<(), String> {
    if verbund::rolle(c) != "zentrale" {
        return Err("Filialen löscht die Zentrale".into());
    }
    let id = id.trim().to_uppercase();
    if id.eq_ignore_ascii_case(&verbund::own_store(c)) {
        return Err("Die eigene Filiale lässt sich nicht löschen".into());
    }
    let n = |q: &str| c.query_row(q, [&id], |x| x.get::<_, i64>(0)).unwrap_or(0);
    let belege = n("SELECT COUNT(*) FROM store_sales WHERE store = ?1");
    let umlag = n("SELECT COUNT(*) FROM transfers WHERE from_store = ?1 OR to_store = ?1");
    if belege > 0 || umlag > 0 {
        return Err(format!("Diese Filiale hat {belege} Belege und {umlag} Umlagerungen – sie lässt sich nicht löschen, aber deaktivieren (Schalter „Aktiv“)"));
    }
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM stamm WHERE kind = ?1 AND id = ?2", params![KIND, id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM stores WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM store_stock WHERE store = ?1", [&id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM store_points WHERE store = ?1", [&id]).map_err(|e| e.to_string())?;
    // aus den Filialgruppen entfernen
    let mut gr = stamm::list(&tx, "filialgruppe")?;
    let mut ch = false;
    for g in gr.iter_mut() {
        if let Some(l) = g["filialen"].as_array().cloned() {
            let n: Vec<Value> = l.iter().filter(|x| !x.as_str().map(|t| t.eq_ignore_ascii_case(&id)).unwrap_or(false)).cloned().collect();
            if n.len() != l.len() {
                g["filialen"] = json!(n);
                ch = true;
            }
        }
    }
    if ch {
        stamm::write_rows(&tx, "filialgruppe", &gr)?;
    }
    db::audit_append(&tx, "filiale.deleted", &json!({ "filiale": id, "durch": by })).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

/// Neuen Anbindungsschlüssel für eine vorhandene Filiale (der alte Verbindungscode wird ungültig)
pub fn neuer_schluessel(c: &Connection, id: &str, by: &str) -> Result<String, String> {
    if verbund::rolle(c) != "zentrale" {
        return Err("Verbindungscodes erzeugt die Zentrale".into());
    }
    let id = id.trim().to_uppercase();
    let (name, addr): (String, String) = c.query_row("SELECT name, addr FROM stores WHERE id = ?1", [&id], |x| Ok((x.get(0)?, x.get(1)?))).optional().map_err(|e| e.to_string())?.ok_or("Diese Filiale ist noch nicht angebunden")?;
    let active: i64 = c.query_row("SELECT active FROM stores WHERE id = ?1", [&id], |x| x.get(0)).unwrap_or(1);
    let key = verbund::store_create(c, &id, &name, &addr)?;
    c.execute("UPDATE stores SET active = ?2 WHERE id = ?1", params![id, active]).map_err(|e| e.to_string())?;
    db::audit_append(c, "filiale.code", &json!({ "filiale": id, "durch": by })).map_err(|e| e.to_string())?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        c
    }
    fn zentrale(c: &Connection) {
        db::setting_set(c, "verbund.rolle", &json!("zentrale")).unwrap();
        db::setting_set(c, "verbund.filiale", &json!("INN")).unwrap();
    }
    fn zeile(id: &str, nr: i64, name: &str) -> Value {
        json!({ "id": id, "nr": nr, "name": name, "land": "AT", "_aktiv": true })
    }

    #[test]
    fn iban_pruefziffer() {
        assert_eq!(iban_norm("at61 1904 3002 3457 3201").unwrap(), "AT611904300234573201");
        assert!(iban_norm("AT62 1904 3002 3457 3201").is_err(), "falsche Prüfziffer");
        assert!(iban_norm("AT61").is_err());
        assert_eq!(iban_norm("  ").unwrap(), "");
    }

    #[test]
    fn eingaben_werden_geprueft() {
        assert!(pruefen(&zeile("A", 1, "x")).is_err(), "Kürzel zu kurz");
        assert!(pruefen(&zeile("SBG", 0, "x")).is_err(), "Nr. ab 1");
        assert!(pruefen(&zeile("SBG", 1, " ")).is_err(), "Name fehlt");
        let mut r = zeile("sbg", 3, " Salzburg ");
        r["farbe"] = json!("rot");
        assert!(pruefen(&r).unwrap_err().contains("Farbe"));
        r["farbe"] = json!("#1F6FD1");
        r["email"] = json!("kein-at");
        assert!(pruefen(&r).unwrap_err().contains("E-Mail"));
        r["email"] = json!("sbg@firma.at");
        r["uid"] = json!("atu 1234 5678");
        r["bic"] = json!("bkauatww");
        r["land"] = json!("");
        let p = pruefen(&r).unwrap();
        assert_eq!(p["id"], "SBG");
        assert_eq!(p["name"], "Salzburg");
        assert_eq!(p["uid"], "ATU12345678");
        assert_eq!(p["bic"], "BKAUATWW");
        assert_eq!(p["land"], "AT", "Vorgabe Österreich");
        r["zusatz"] = json!([{ "typ": "post", "strasse": "x", "ort": "y" }]);
        assert!(pruefen(&r).unwrap_err().contains("Art wählen"));
        r["zusatz"] = json!([{ "typ": "liefer", "strasse": "Lager 1", "ort": "" }]);
        assert!(pruefen(&r).unwrap_err().contains("Ort"));
        r["zusatz"] = json!([{ "typ": "beide", "strasse": "Lager 1", "plz": "6020", "ort": "Innsbruck" }]);
        assert_eq!(pruefen(&r).unwrap()["zusatz"][0]["land"], "AT");
    }

    #[test]
    fn eigene_zeile_entsteht_einmal_und_zieht_mit() {
        let c = db();
        zentrale(&c);
        ensure_own(&c, &json!({ "name": "Alpenlicht Sport GmbH", "kurz": "Innsbruck", "strasse": "Maria-Theresien-Str.", "hausnr": "18", "plz": "6020", "ort": "Innsbruck", "uid": "ATU00000000" })).unwrap();
        ensure_own(&c, &json!({ "name": "anderer Name" })).unwrap();
        let l = rows(&c).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!((l[0]["id"].as_str(), l[0]["nr"].as_i64(), l[0]["name"].as_str()), (Some("INN"), Some(1), Some("Alpenlicht Sport GmbH")));
        rekey_own(&c, "INN", "ZEN").unwrap();
        assert_eq!(rows(&c).unwrap()[0]["id"], "ZEN");
        // in einer Filiale entsteht nichts
        let f = db();
        db::setting_set(&f, "verbund.rolle", &json!("filiale")).unwrap();
        db::setting_set(&f, "verbund.filiale", &json!("SBG")).unwrap();
        ensure_own(&f, &json!({ "name": "x" })).unwrap();
        assert!(rows(&f).unwrap().is_empty());
    }

    #[test]
    fn speichern_spiegelt_in_einstellungen_und_anbindung() {
        let c = db();
        zentrale(&c);
        ensure_own(&c, &json!({ "name": "Alpenlicht Sport GmbH" })).unwrap();
        // eigene Zeile ändern → Einstellungen
        let mut me = rows(&c).unwrap().remove(0);
        me["kurz"] = json!("Innsbruck");
        me["strasse"] = json!("Maria-Theresien-Str.");
        me["hausnr"] = json!("18");
        me["plz"] = json!("6020");
        me["ort"] = json!("Innsbruck");
        me["tel"] = json!("0512 1234");
        me["iban"] = json!("AT61 1904 3002 3457 3201");
        me["email"] = json!("info@alpenlicht.at");
        let (saved, key) = save(&c, &me, "Test").unwrap();
        assert!(key.is_none(), "eigene Filiale braucht keinen Schlüssel");
        assert_eq!(saved["iban"], "AT611904300234573201");
        let g = |k: &str| db::setting_get(&c, k).and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
        assert_eq!(g("firma.name"), "Alpenlicht Sport GmbH");
        assert_eq!(g("firma.adresse"), "Maria-Theresien-Str. 18, 6020 Innsbruck");
        assert_eq!(g("firma.telefon"), "0512 1234");
        assert_eq!(g("firma.email"), "info@alpenlicht.at");
        assert_eq!(g("zahlung.iban"), "AT611904300234573201");
        assert_eq!(g("verbund.name"), "Innsbruck", "Kurz-Name ist der Anzeigename");
        // neue Filiale: Zeile + Anbindung + Schlüssel
        let (_, key) = save(&c, &zeile("sbg", 2, "Salzburg"), "Test").unwrap();
        assert!(key.unwrap().starts_with("kfil_"));
        let st: (String, i64) = c.query_row("SELECT name, active FROM stores WHERE id = 'SBG'", [], |x| Ok((x.get(0)?, x.get(1)?))).unwrap();
        assert_eq!(st, ("Salzburg".to_string(), 1));
        // ändern: Name wandert in die Anbindung, kein neuer Schlüssel
        let mut sbg = rows(&c).unwrap().into_iter().find(|r| r["id"] == "SBG").unwrap();
        sbg["kurz"] = json!("SBG-City");
        assert!(save(&c, &sbg, "Test").unwrap().1.is_none());
        let n: String = c.query_row("SELECT name FROM stores WHERE id = 'SBG'", [], |x| x.get(0)).unwrap();
        assert_eq!(n, "SBG-City");
        // deaktivieren sperrt den Abgleich
        let key_hash_vorher: String = c.query_row("SELECT key_hash FROM stores WHERE id = 'SBG'", [], |x| x.get(0)).unwrap();
        sbg["_aktiv"] = json!(false);
        save(&c, &sbg, "Test").unwrap();
        let (a, h): (i64, String) = c.query_row("SELECT active, key_hash FROM stores WHERE id = 'SBG'", [], |x| Ok((x.get(0)?, x.get(1)?))).unwrap();
        assert_eq!((a, h), (0, key_hash_vorher), "deaktiviert, Schlüssel unverändert");
        // Nr. doppelt, eigene Filiale nicht deaktivierbar
        assert!(save(&c, &zeile("lz", 2, "Lienz"), "Test").unwrap_err().contains("Nr. 2"));
        let mut me = rows(&c).unwrap().into_iter().find(|r| r["id"] == "INN").unwrap();
        me["_aktiv"] = json!(false);
        assert!(save(&c, &me, "Test").unwrap_err().contains("eigene Filiale"));
    }

    #[test]
    fn nur_die_zentrale_legt_an_und_filialen_pflegen_nichts() {
        let e = db();
        ensure_own(&e, &json!({ "name": "Einzelplatz GmbH" })).unwrap();
        assert!(save(&e, &zeile("SBG", 2, "Salzburg"), "T").unwrap_err().contains("Zentrale"));
        let own = rows(&e).unwrap().remove(0);
        assert!(save(&e, &own, "T").is_ok(), "die eigene Zeile pflegt auch der Einzelplatz");
        let f = db();
        db::setting_set(&f, "verbund.rolle", &json!("filiale")).unwrap();
        assert!(save(&f, &zeile("SBG", 2, "Salzburg"), "T").unwrap_err().contains("pflegt die Zentrale"));
        assert!(delete(&f, "SBG", "T").is_err());
    }

    #[test]
    fn andere_filialen_sehen_nur_oeffentliche_felder() {
        let c = db();
        zentrale(&c);
        ensure_own(&c, &json!({ "name": "Zentrale GmbH", "uid": "ATU11111111", "iban": "AT611904300234573201" })).unwrap();
        let mut s1 = zeile("sbg", 2, "Salzburg");
        s1["iban"] = json!("AT611904300234573201");
        s1["uid"] = json!("ATU22222222");
        s1["inhaber"] = json!("Max Muster");
        s1["tel"] = json!("0662 1");
        save(&c, &s1, "T").unwrap();
        save(&c, &zeile("lz", 3, "Lienz"), "T").unwrap();
        let v = all_for(&c, "SBG").unwrap();
        let l = v["filiale"].as_array().unwrap();
        let sbg = l.iter().find(|r| r["id"] == "SBG").unwrap();
        assert_eq!(sbg["iban"], "AT611904300234573201", "die eigene Zeile vollständig");
        assert_eq!(sbg["inhaber"], "Max Muster");
        for r in l.iter().filter(|r| r["id"] != "SBG") {
            for k in ["iban", "uid", "steuernr", "inhaber", "bic", "bank", "zusatz", "email", "mobil"] {
                assert!(r[k].is_null(), "{} sieht {k} von {}", "SBG", r["id"]);
            }
            assert!(r["name"].is_string() && r["nr"].is_number(), "öffentlich bleibt sichtbar");
        }
        assert_eq!(l.iter().find(|r| r["id"] == "LZ").unwrap()["_aktiv"], true);
    }

    #[test]
    fn loeschen_nur_ohne_belege() {
        let c = db();
        zentrale(&c);
        ensure_own(&c, &json!({ "name": "Zentrale GmbH" })).unwrap();
        save(&c, &zeile("sbg", 2, "Salzburg"), "T").unwrap();
        save(&c, &zeile("lz", 3, "Lienz"), "T").unwrap();
        let mut g = vec![json!({ "id": "G1", "name": "West", "filialen": ["SBG", "LZ", "INN"] })];
        stamm::save(&c, "filialgruppe", &g).unwrap();
        assert!(delete(&c, "INN", "T").unwrap_err().contains("eigene"));
        c.execute("INSERT INTO store_sales(store, beleg_no, ts, total, kind, data) VALUES ('LZ','1','2026-01-01T10:00:00',100,'verkauf','{}')", []).unwrap();
        assert!(delete(&c, "LZ", "T").unwrap_err().contains("deaktivieren"));
        delete(&c, "SBG", "T").unwrap();
        assert!(rows(&c).unwrap().iter().all(|r| r["id"] != "SBG"));
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM stores WHERE id='SBG'", [], |x| x.get(0)).unwrap(), 0);
        g = stamm::list(&c, "filialgruppe").unwrap();
        assert_eq!(g[0]["filialen"], json!(["LZ", "INN"]), "aus der Gruppe entfernt");
    }

    #[test]
    fn schon_angebundene_filialen_bekommen_ihre_zeile() {
        let c = db();
        zentrale(&c);
        verbund::store_create(&c, "sbg", "Salzburg", "Getreidegasse 31, 5020 Salzburg").unwrap();
        verbund::store_create(&c, "kit", "Kitzbühel", "Vorderstadt").unwrap();
        c.execute("UPDATE stores SET active = 0 WHERE id = 'KIT'", []).unwrap();
        ensure_all(&c, &json!({ "name": "Zentrale GmbH" })).unwrap();
        ensure_all(&c, &json!({ "name": "anderer Name" })).unwrap();
        let l = rows(&c).unwrap();
        assert_eq!(l.len(), 3, "eigene Zeile und zwei Filialen, nichts doppelt");
        let sbg = l.iter().find(|r| r["id"] == "SBG").unwrap();
        assert_eq!((sbg["strasse"].as_str(), sbg["hausnr"].as_str(), sbg["plz"].as_str(), sbg["ort"].as_str(), sbg["name"].as_str()), (Some("Getreidegasse"), Some("31"), Some("5020"), Some("Salzburg"), Some("Salzburg")));
        assert_eq!(l.iter().find(|r| r["id"] == "KIT").unwrap()["_aktiv"], false, "deaktivierte Filiale bleibt deaktiviert");
        let mut nrs: Vec<i64> = l.iter().map(|r| r["nr"].as_i64().unwrap()).collect();
        nrs.sort();
        assert_eq!(nrs, vec![1, 2, 3]);
        assert_eq!(adresse_lesen("Vorderstadt"), ("Vorderstadt".into(), "".into(), "".into(), "".into()));
        assert_eq!(adresse_lesen("Weg 4a, 6020 Innsbruck"), ("Weg".into(), "4a".into(), "6020".into(), "Innsbruck".into()));
    }

    #[test]
    fn neuer_schluessel_macht_den_alten_ungueltig() {
        let c = db();
        zentrale(&c);
        ensure_own(&c, &json!({ "name": "Zentrale GmbH" })).unwrap();
        let (_, k1) = save(&c, &zeile("sbg", 2, "Salzburg"), "T").unwrap();
        let k2 = neuer_schluessel(&c, "sbg", "T").unwrap();
        assert_ne!(k1.unwrap(), k2);
        assert!(neuer_schluessel(&c, "XXX", "T").is_err());
        // eine deaktivierte Filiale bleibt deaktiviert
        let mut sbg = rows(&c).unwrap().into_iter().find(|r| r["id"] == "SBG").unwrap();
        sbg["_aktiv"] = json!(false);
        save(&c, &sbg, "T").unwrap();
        neuer_schluessel(&c, "SBG", "T").unwrap();
        assert_eq!(c.query_row::<i64, _, _>("SELECT active FROM stores WHERE id='SBG'", [], |x| x.get(0)).unwrap(), 0);
    }

    #[test]
    fn abgleich_zentrale_zu_filiale_mit_sicht_der_filiale() {
        let z = db();
        zentrale(&z);
        ensure_own(&z, &json!({ "name": "Zentrale GmbH", "iban": "AT611904300234573201", "uid": "ATU11111111" })).unwrap();
        let mut s1 = zeile("sbg", 2, "Alpenlicht Salzburg GmbH");
        s1["kurz"] = json!("Salzburg");
        s1["strasse"] = json!("Getreidegasse");
        s1["hausnr"] = json!("31");
        s1["plz"] = json!("5020");
        s1["ort"] = json!("Salzburg");
        s1["tel"] = json!("0662 123");
        s1["iban"] = json!("AT611904300234573201");
        s1["uid"] = json!("ATU22222222");
        s1["email"] = json!("sbg@alpenlicht.at");
        let (_, key) = save(&z, &s1, "T").unwrap();
        let key = key.unwrap();
        // Zentrale beantwortet den Abgleich der Filiale
        let r = verbund::handle(&z, "POST", "/sync/v1/pull", &key, &json!({}), "10.0.0.5").unwrap();
        let rows: Vec<Value> = r["stammdaten"]["filiale"].as_array().unwrap().clone();
        let inn = rows.iter().find(|x| x["id"] == "INN").unwrap();
        assert!(inn["iban"].is_null() && inn["uid"].is_null(), "die Zentrale zeigt der Filiale keine Bank- und Steuerdaten");
        assert_eq!(inn["name"], "Zentrale GmbH");
        let stores = r["stores"].as_array().unwrap();
        assert!(stores.iter().all(|x| !x["active"].is_null()), "Filialliste trägt „aktiv“");
        // Filialkasse übernimmt: Stammdaten ersetzen, eigene Zeile gilt für Belege
        let f = db();
        db::setting_set(&f, "verbund.rolle", &json!("filiale")).unwrap();
        db::setting_set(&f, "verbund.filiale", &json!("SBG")).unwrap();
        stamm::write_rows(&f, KIND, &rows).unwrap();
        apply_own(&f).unwrap();
        let g = |k: &str| db::setting_get(&f, k).and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
        assert_eq!(g("firma.name"), "Alpenlicht Salzburg GmbH");
        assert_eq!(g("firma.adresse"), "Getreidegasse 31, 5020 Salzburg");
        assert_eq!(g("firma.uid"), "ATU22222222");
        assert_eq!(g("firma.email"), "sbg@alpenlicht.at");
        assert_eq!(g("zahlung.iban"), "AT611904300234573201");
        assert_eq!(g("verbund.name"), "Salzburg");
        // deaktiviert: der Abgleich wird mit eigenem Hinweis abgelehnt
        let mut sbg = rows.iter().find(|x| x["id"] == "SBG").unwrap().clone();
        sbg["_aktiv"] = json!(false);
        save(&z, &sbg, "T").unwrap();
        let e = verbund::handle(&z, "POST", "/sync/v1/pull", &key, &json!({}), "10.0.0.5").unwrap_err();
        assert_eq!(e.0, 403);
        assert!(e.1.contains("deaktiviert"));
        let e = verbund::handle(&z, "POST", "/sync/v1/pull", "kfil_falsch", &json!({}), "10.0.0.5").unwrap_err();
        assert_eq!(e.0, 401, "unbekannter Schlüssel bleibt ein Anmeldefehler");
    }

    #[test]
    fn vorlaeufige_zeile_aendert_die_filialkasse_nicht() {
        let z = db();
        zentrale(&z);
        verbund::store_create(&z, "sbg", "Salzburg", "Getreidegasse 31, 5020 Salzburg").unwrap();
        ensure_all(&z, &json!({ "name": "Zentrale GmbH" })).unwrap();
        let sbg = |c: &Connection| rows(c).unwrap().into_iter().find(|r| r["id"] == "SBG").unwrap();
        assert_eq!(sbg(&z)["vorlaeufig"], true);
        assert!(sbg(&z)["uid"].as_str().unwrap().is_empty(), "noch keine Angaben der Filialkasse");
        // die Filialkasse schickt beim nächsten Abgleich ihre bisherigen Angaben mit
        let info = json!({ "version": "0.40.1", "firma": { "name": "Alpenlicht Salzburg GmbH", "adresse": "Getreidegasse 31, 5020 Salzburg", "uid": "ATU22222222", "telefon": "0662 123", "iban": "AT611904300234573201", "bic": "BKAUATWW", "bank": "UniCredit" } });
        z.execute("UPDATE stores SET info = ?1 WHERE id = 'SBG'", [info.to_string()]).unwrap();
        ensure_all(&z, &json!({})).unwrap();
        let v = sbg(&z);
        assert_eq!((v["name"].as_str(), v["uid"].as_str(), v["tel"].as_str(), v["iban"].as_str(), v["kurz"].as_str()), (Some("Alpenlicht Salzburg GmbH"), Some("ATU22222222"), Some("0662 123"), Some("AT611904300234573201"), Some("Salzburg")));
        assert_eq!(v["vorlaeufig"], true, "bleibt vorläufig, bis die Zentrale speichert");
        // Filialkasse: eigene Angaben bleiben, solange die Zeile vorläufig ist
        let f = db();
        db::setting_set(&f, "verbund.rolle", &json!("filiale")).unwrap();
        db::setting_set(&f, "verbund.filiale", &json!("SBG")).unwrap();
        db::setting_set(&f, "firma.uid", &json!("ATU99999999")).unwrap();
        db::setting_set(&f, "zahlung.iban", &json!("AT611904300234573201")).unwrap();
        let r = all_for(&z, "SBG").unwrap();
        stamm::write_rows(&f, KIND, r["filiale"].as_array().unwrap()).unwrap();
        apply_own(&f).unwrap();
        let g = |c: &Connection, k: &str| db::setting_get(c, k).and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
        assert_eq!(g(&f, "firma.uid"), "ATU99999999");
        assert_eq!(g(&f, "zahlung.iban"), "AT611904300234573201");
        // Die Zentrale bestätigt (speichert) → gilt auf der Filialkasse
        let mut bestaetigt = sbg(&z);
        bestaetigt["uid"] = json!("ATU22222222");
        save(&z, &bestaetigt, "T").unwrap();
        assert!(sbg(&z)["vorlaeufig"].is_null(), "nach dem Speichern nicht mehr vorläufig");
        let r = all_for(&z, "SBG").unwrap();
        stamm::write_rows(&f, KIND, r["filiale"].as_array().unwrap()).unwrap();
        apply_own(&f).unwrap();
        assert_eq!(g(&f, "firma.uid"), "ATU22222222");
    }

    #[test]
    fn abgeschaltete_und_geloeschte_filialen_zaehlen_nicht_mehr() {
        let c = db();
        zentrale(&c);
        ensure_all(&c, &json!({ "name": "Zentrale GmbH" })).unwrap();
        save(&c, &zeile("sbg", 2, "Salzburg"), "T").unwrap();
        save(&c, &zeile("kit", 3, "Kitzbühel"), "T").unwrap();
        for st in ["SBG", "KIT"] {
            c.execute("INSERT INTO store_stock(store, ean, stock, updated_at) VALUES (?1,'111',5,'x')", [st]).unwrap();
        }
        c.execute("INSERT INTO store_points(store, log_id) VALUES ('KIT', 1)", []).unwrap();
        let m = verbund::stock_matrix(&c).unwrap();
        assert!(m["SBG"].is_object() && m["KIT"].is_object());
        let lines = json!([{ "ean": "111", "qty": 1, "name": "x" }]);
        assert!(verbund::transfer_create(&c, "SBG", "INN", &lines, "", "T").is_ok());
        let mut sbg = rows(&c).unwrap().into_iter().find(|r| r["id"] == "SBG").unwrap();
        sbg["_aktiv"] = json!(false);
        save(&c, &sbg, "T").unwrap();
        let m = verbund::stock_matrix(&c).unwrap();
        assert!(m["SBG"].is_null() && m["KIT"].is_object(), "abgeschaltete Filiale fehlt in der Bestandsmatrix");
        assert!(verbund::transfer_create(&c, "SBG", "INN", &lines, "", "T").unwrap_err().contains("deaktiviert"));
        assert!(verbund::transfer_create(&c, "INN", "XXX", &lines, "", "T").is_err(), "unbekannte Filiale");
        // Löschen räumt Bestand und Bonuspunkte der Filiale auf
        delete(&c, "KIT", "T").unwrap();
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM store_stock WHERE store='KIT'", [], |x| x.get(0)).unwrap(), 0);
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM store_points WHERE store='KIT'", [], |x| x.get(0)).unwrap(), 0);
    }

    #[test]
    fn ungewoehnliche_eingaben_stuerzen_nicht_ab() {
        let mut r = zeile("sbg", 2, "Salzburg");
        r["uid"] = json!("ÄÖ1234567");
        assert!(pruefen(&r).unwrap_err().contains("USt-IdNr"), "Umlaute in der UID: Fehler statt Absturz");
        r["uid"] = json!("");
        r["iban"] = json!("ÄÖ611904300234573201");
        assert!(pruefen(&r).is_err());
        // ein fehlerhafter alter Wert (E-Mail) verhindert die eigene Zeile nicht
        let c = db();
        zentrale(&c);
        ensure_all(&c, &json!({ "name": "Zentrale GmbH", "email": "kein-at", "iban": "falsch", "uid": "ÄÖ" })).unwrap();
        let me = rows(&c).unwrap().remove(0);
        assert_eq!((me["id"].as_str(), me["name"].as_str(), me["email"].as_str()), (Some("INN"), Some("Zentrale GmbH"), Some("")));
    }

    #[test]
    fn fusszeilen_je_filiale_und_fuer_alle() {
        let c = db();
        zentrale(&c);
        ensure_all(&c, &json!({ "name": "Zentrale GmbH" })).unwrap();
        save(&c, &zeile("sbg", 2, "Salzburg"), "T").unwrap();
        let mut me = rows(&c).unwrap().remove(0);
        me["fuss_a4"] = json!("  Bank: UniCredit\r\nFN 12345a  ");
        let (p, _) = save(&c, &me, "T").unwrap();
        assert_eq!(p["fuss_a4"], "Bank: UniCredit\nFN 12345a", "mehrzeilig, ohne Randleerzeichen");
        me["fuss_bon"] = json!("x".repeat(601));
        assert!(save(&c, &me, "T").unwrap_err().contains("600"));
        assert_eq!(fuss_fuer_alle(&c, Some("Gerichtsstand Innsbruck"), None, "T").unwrap(), 2);
        let l = rows(&c).unwrap();
        assert!(l.iter().all(|r| r["fuss_a4"] == "Gerichtsstand Innsbruck"), "alle Filialen");
        assert!(l.iter().all(|r| r["fuss_bon"].as_str().unwrap_or("").is_empty()), "Bon-Text unverändert");
        assert!(fuss_fuer_alle(&db(), Some("x"), None, "T").is_err(), "nur die Zentrale");
        // andere Filialen sehen die Fußzeile der Nachbarn nicht
        let v = all_for(&c, "SBG").unwrap();
        let inn = v["filiale"].as_array().unwrap().iter().find(|r| r["id"] == "INN").unwrap().clone();
        assert!(inn["fuss_a4"].is_null());
    }

    #[test]
    fn zentrale_braucht_zuerst_einen_eigenen_bereich() {
        let c = db();
        zentrale(&c);
        ensure_own(&c, &json!({ "name": "Zentrale GmbH" })).unwrap();
        c.execute("INSERT INTO counters(name, value) VALUES ('doc.rechnung', 1500)", []).unwrap();
        let mut sbg = zeile("sbg", 2, "Salzburg");
        sbg["nummern"] = json!({ "rechnung": { "start": 1000, "ende": 1999 } });
        let e = save(&c, &sbg, "T").unwrap_err();
        assert!(e.contains("Rechnung") && e.contains("1501") && e.contains("Zentrale"), "{e}");
        // Zentrale bekommt einen eigenen Bereich → danach geht der Bereich der Filiale
        let mut me = rows(&c).unwrap().remove(0);
        me["nummern"] = json!({ "rechnung": { "start": 1, "ende": 999 } });
        save(&c, &me, "T").unwrap();
        sbg["nummern"] = json!({ "rechnung": { "start": 1000, "ende": 1999 } });
        save(&c, &sbg, "T").unwrap();
        // Bereich der Filiale verändern, der sich mit dem der Zentrale überschneidet, bleibt abgelehnt
        sbg["nummern"] = json!({ "rechnung": { "start": 900, "ende": 1999 } });
        assert!(save(&c, &sbg, "T").unwrap_err().contains("überschneidet"));
        // Filiale ohne Bereiche braucht keinen Bereich der Zentrale
        assert!(save(&c, &zeile("lz", 3, "Lienz"), "T").is_ok());
        // spätere Änderungen an anderen Feldern der Filiale scheitern nicht, auch wenn die Zentrale ihren Bereich wieder entfernt
        let mut me = rows(&c).unwrap().into_iter().find(|r| r["id"] == "INN").unwrap();
        me["nummern"] = json!({});
        save(&c, &me, "T").unwrap();
        let mut sbg = rows(&c).unwrap().into_iter().find(|r| r["id"] == "SBG").unwrap();
        sbg["tel"] = json!("0662 1");
        assert!(save(&c, &sbg, "T").is_ok(), "Bereiche unverändert: keine neue Prüfung");
    }

    #[test]
    fn einzelplatz_ignoriert_verborgene_zeilen_einer_fruheren_zentrale() {
        let c = db();
        zentrale(&c);
        ensure_own(&c, &json!({ "name": "Zentrale GmbH" })).unwrap();
        let mut me = rows(&c).unwrap().remove(0);
        me["nummern"] = json!({ "rechnung": { "start": 1, "ende": 19999 } });
        save(&c, &me, "T").unwrap();
        let mut sbg = zeile("sbg", 2, "Salzburg");
        sbg["nummern"] = json!({ "rechnung": { "start": 20000, "ende": 39999 } });
        save(&c, &sbg, "T").unwrap();
        // zurück zum Einzelplatz (eigenes Kürzel wird ZENTRALE)
        db::setting_set(&c, "verbund.rolle", &json!("einzel")).unwrap();
        db::setting_set(&c, "verbund.filiale", &json!("")).unwrap();
        rekey_own(&c, "INN", "ZENTRALE").unwrap();
        let mut me = rows(&c).unwrap().into_iter().find(|r| r["id"] == "ZENTRALE").unwrap();
        me["nr"] = json!(2);
        me["nummern"] = json!({ "rechnung": { "start": 25000, "ende": 26000 } });
        assert!(save(&c, &me, "T").is_ok(), "verborgene Filiale Salzburg blockiert weder Nr. noch Nummernkreis");
    }

    #[test]
    fn vorlaeufige_zeile_uebernimmt_gueltige_angaben_trotz_einer_ungueltigen() {
        let c = db();
        zentrale(&c);
        verbund::store_create(&c, "sbg", "Salzburg", "Getreidegasse 31, 5020 Salzburg").unwrap();
        let info = json!({ "firma": { "name": "Alpenlicht Salzburg GmbH", "iban": "AT00 0000 0000 0000 0000", "uid": "ATU12345678", "telefon": "0662 123", "steuernr": "12-345/6789" } });
        c.execute("UPDATE stores SET info = ?1 WHERE id = 'SBG'", [info.to_string()]).unwrap();
        ensure_all(&c, &json!({ "name": "Zentrale GmbH" })).unwrap();
        let sbg = rows(&c).unwrap().into_iter().find(|r| r["id"] == "SBG").unwrap();
        assert_eq!(sbg["vorlaeufig"], true);
        assert_eq!(sbg["iban"], "", "die ungültige IBAN fällt weg");
        assert_eq!((sbg["name"].as_str(), sbg["uid"].as_str(), sbg["tel"].as_str(), sbg["steuernr"].as_str()), (Some("Alpenlicht Salzburg GmbH"), Some("ATU12345678"), Some("0662 123"), Some("12-345/6789")), "alle gültigen Angaben bleiben");
        // nachträglich: Name der Filialkasse erscheint erst später, die IBAN ist weiter ungültig
        c.execute("UPDATE stores SET info = ?1 WHERE id = 'SBG'", [json!({ "firma": { "iban": "AT00 0000", "bic": "BKAUATWW", "email": "sbg@alpenlicht.at" } }).to_string()]).unwrap();
        ensure_all(&c, &json!({})).unwrap();
        let sbg = rows(&c).unwrap().into_iter().find(|r| r["id"] == "SBG").unwrap();
        assert_eq!((sbg["bic"].as_str(), sbg["email"].as_str(), sbg["iban"].as_str()), (Some("BKAUATWW"), Some("sbg@alpenlicht.at"), Some("")));
    }

    #[test]
    fn filialkasse_sieht_von_anderen_nur_umsatz_und_version() {
        let z = db();
        zentrale(&z);
        ensure_own(&z, &json!({ "name": "Zentrale GmbH" })).unwrap();
        let (_, k_sbg) = save(&z, &zeile("sbg", 2, "Salzburg"), "T").unwrap();
        let (_, k_kit) = save(&z, &zeile("kit", 3, "Kitzbühel"), "T").unwrap();
        let push = json!({ "info": { "version": "0.41.0", "kasse": "SBG-K01", "firma": { "name": "Alpenlicht Salzburg", "iban": "AT611904300234573201", "uid": "ATU22222222", "steuernr": "12-345", "inhaber": "Max Muster", "bank": "Sparkasse" } } });
        verbund::handle(&z, "POST", "/sync/v1/push", &k_sbg.unwrap(), &push, "10.0.0.5").unwrap();
        let pull = verbund::handle(&z, "POST", "/sync/v1/pull", &k_kit.unwrap(), &json!({ "since": "" }), "10.0.0.6").unwrap();
        let t = pull["umsatz"].to_string();
        for geheim in ["AT611904300234573201", "ATU22222222", "12-345", "Max Muster", "Sparkasse", "10.0.0.5", "SBG-K01"] {
            assert!(!t.contains(geheim), "„{geheim}“ darf nicht an andere Filialkassen gehen: {t}");
        }
        let sbg = pull["umsatz"].as_array().unwrap().iter().find(|x| x["id"] == "SBG").unwrap();
        assert_eq!(sbg["info"]["version"], "0.41.0", "die Version bleibt sichtbar");
        assert!(sbg["revenue_today"].is_number());
        // die Zentrale selbst sieht weiter alles
        let eig = verbund::overview(&z).unwrap();
        assert!(eig["stores"].to_string().contains("AT611904300234573201"));
    }
}
