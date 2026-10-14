//! Vorgänge: alle Belegarten außerhalb der Kasse in einer gemeinsamen Tabelle – Wareneingangs-Avis,
//! Eingangsrechnungen, Zahlungen, Reklamationen, Lieferantenretouren, Warenkörbe, Angebote, Aufträge,
//! Lieferscheine, Rechnungen, Reservierungen, Auswahlen, Kampagnen, Sales-Aktionen, Lieferantenbonus.
//! Statuswechsel mit Bestandswirkung laufen hier in einer Transaktion; jede Änderung wird protokolliert.

use crate::{catalog, db, purchasing};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::{json, Value};
use std::collections::HashMap;

pub struct Kind {
    pub id: &'static str,
    pub prefix: &'static str,
    pub name: &'static str,
    pub initial: &'static str,
    /// Status, in denen Kopf und Positionen noch geändert werden dürfen
    pub edit: &'static [&'static str],
    /// (Aktion, erlaubte Ausgangsstatus, Zielstatus)
    pub actions: &'static [(&'static str, &'static [&'static str], &'static str)],
}

pub const KINDS: &[Kind] = &[
    Kind { id: "avis", prefix: "AV", name: "Wareneingangs-Avis", initial: "angekuendigt", edit: &["angekuendigt", "eingetroffen"],
        actions: &[("eingetroffen", &["angekuendigt"], "eingetroffen"), ("buchen", &["angekuendigt", "eingetroffen"], "gebucht"), ("stornieren", &["angekuendigt", "eingetroffen"], "storniert")] },
    Kind { id: "er", prefix: "ER", name: "Eingangsrechnung", initial: "offen", edit: &["offen", "geprueft"],
        actions: &[("pruefen", &["offen", "geprueft"], "geprueft"), ("freigeben", &["offen", "geprueft"], "freigegeben"), ("stornieren", &["offen", "geprueft", "freigegeben"], "storniert")] },
    Kind { id: "zahlung", prefix: "ZA", name: "Zahlung", initial: "erfasst", edit: &[],
        actions: &[("exportieren", &["erfasst", "exportiert"], "exportiert"), ("stornieren", &["erfasst", "exportiert"], "storniert")] },
    Kind { id: "reklamation", prefix: "RK", name: "Reklamation", initial: "erfasst", edit: &["erfasst", "pruefung", "lieferant"],
        actions: &[("pruefen", &["erfasst"], "pruefung"), ("lieferant", &["erfasst", "pruefung"], "lieferant"), ("erledigen", &["erfasst", "pruefung", "lieferant"], "erledigt"),
            ("ablehnen", &["erfasst", "pruefung", "lieferant"], "abgelehnt"), ("wiedereroeffnen", &["erledigt", "abgelehnt"], "pruefung")] },
    Kind { id: "lretoure", prefix: "LR", name: "Lieferantenretoure", initial: "erfasst", edit: &["erfasst"],
        actions: &[("versenden", &["erfasst"], "versendet"), ("gutschrift", &["versendet"], "gutgeschrieben"), ("ablehnen", &["versendet"], "abgelehnt"), ("stornieren", &["erfasst"], "storniert")] },
    Kind { id: "warenkorb", prefix: "WK", name: "Warenkorb", initial: "offen", edit: &["offen"],
        actions: &[("uebernehmen", &["offen"], "uebernommen"), ("verwerfen", &["offen"], "verworfen"), ("reaktivieren", &["verworfen", "uebernommen"], "offen")] },
    Kind { id: "angebot", prefix: "AN", name: "Angebot", initial: "offen", edit: &["offen"],
        actions: &[("annehmen", &["offen"], "angenommen"), ("ablehnen", &["offen"], "abgelehnt"), ("reaktivieren", &["abgelehnt"], "offen")] },
    Kind { id: "auftrag", prefix: "AU", name: "Auftrag", initial: "offen", edit: &["offen"],
        actions: &[("liefern", &["offen"], "geliefert"), ("stornieren", &["offen"], "storniert")] },
    Kind { id: "lieferschein", prefix: "LS", name: "Lieferschein", initial: "entwurf", edit: &["entwurf"],
        actions: &[("ausliefern", &["entwurf"], "ausgeliefert"), ("berechnen", &["ausgeliefert"], "berechnet"), ("stornieren", &["entwurf", "ausgeliefert"], "storniert")] },
    Kind { id: "rechnung", prefix: "RE", name: "Rechnung", initial: "entwurf", edit: &["entwurf"],
        actions: &[("stellen", &["entwurf"], "offen"), ("zahlung", &["offen", "teilbezahlt"], "*"), ("mahnen", &["offen", "teilbezahlt"], "*"), ("stornieren", &["entwurf", "offen"], "storniert")] },
    Kind { id: "reservierung", prefix: "RS", name: "Reservierung", initial: "reserviert", edit: &["angefragt", "reserviert", "abholbereit"],
        actions: &[("bestaetigen", &["angefragt"], "reserviert"), ("abholbereit", &["reserviert"], "abholbereit"), ("abholen", &["reserviert", "abholbereit"], "abgeholt"),
            ("stornieren", &["angefragt", "reserviert", "abholbereit"], "storniert"), ("verfallen", &["reserviert", "abholbereit"], "verfallen")] },
    Kind { id: "auswahl", prefix: "AS", name: "Auswahl", initial: "entwurf", edit: &["entwurf"],
        actions: &[("ausgeben", &["entwurf"], "ausgegeben"), ("ruecklauf", &["ausgegeben"], "*"), ("stornieren", &["entwurf"], "storniert")] },
    Kind { id: "kampagne", prefix: "KA", name: "Kampagne", initial: "entwurf", edit: &["entwurf"],
        actions: &[("versendet", &["entwurf"], "versendet"), ("abschliessen", &["versendet"], "abgeschlossen")] },
    Kind { id: "praemie", prefix: "SA", name: "Sales-Aktion", initial: "aktiv", edit: &["aktiv"],
        actions: &[("beenden", &["aktiv"], "beendet"), ("reaktivieren", &["beendet"], "aktiv")] },
    Kind { id: "pickliste", prefix: "PL", name: "Pickliste", initial: "offen", edit: &["offen"],
        actions: &[("erledigen", &["offen"], "erledigt"), ("stornieren", &["offen"], "storniert")] },
    Kind { id: "preis", prefix: "PA", name: "Preisänderung", initial: "geplant", edit: &["geplant"],
        actions: &[("durchfuehren", &["geplant"], "durchgefuehrt"), ("stornieren", &["geplant"], "storniert")] },
    Kind { id: "kundenbestellung", prefix: "KB", name: "Kunden-Bestellung", initial: "offen", edit: &["offen"],
        actions: &[("bestellt", &["offen"], "bestellt"), ("eingetroffen", &["offen", "bestellt"], "eingetroffen"), ("abholen", &["eingetroffen"], "abgeholt"), ("stornieren", &["offen", "bestellt"], "storniert")] },
    Kind { id: "fremdrechnung", prefix: "FR", name: "Fremdrechnung", initial: "offen", edit: &["offen"],
        actions: &[("zahlung", &["offen", "teilbezahlt"], "*"), ("mahnen", &["offen", "teilbezahlt"], "*"), ("stornieren", &["offen"], "storniert")] },
    Kind { id: "sendung", prefix: "VS", name: "Sendung", initial: "erstellt", edit: &["erstellt"],
        actions: &[("versendet", &["erstellt"], "versendet"), ("zugestellt", &["versendet"], "zugestellt"), ("stornieren", &["erstellt"], "storniert")] },
    Kind { id: "verleih", prefix: "VL", name: "Verleih", initial: "entwurf", edit: &["entwurf"],
        actions: &[("ausgeben", &["entwurf"], "ausgegeben"), ("zurueck", &["ausgegeben"], "zurueckgegeben"), ("stornieren", &["entwurf"], "storniert")] },
    Kind { id: "webbestellung", prefix: "WB", name: "Webshop-Bestellung", initial: "neu", edit: &["neu", "in_bearbeitung"],
        actions: &[("bearbeiten", &["neu"], "in_bearbeitung"), ("versenden", &["neu", "in_bearbeitung"], "versendet"), ("abschliessen", &["versendet"], "abgeschlossen"), ("stornieren", &["neu", "in_bearbeitung"], "storniert")] },
    Kind { id: "edi", prefix: "ED", name: "EDI-Nachricht", initial: "neu", edit: &["neu", "fehler"],
        actions: &[("verarbeitet", &["neu", "fehler"], "verarbeitet"), ("fehler", &["neu"], "fehler"), ("ignorieren", &["neu", "fehler"], "ignoriert")] },
    Kind { id: "bonus", prefix: "LB", name: "Lieferantenbonus", initial: "aktiv", edit: &["aktiv"],
        actions: &[("umlegen", &["aktiv"], "umgelegt"), ("reaktivieren", &["umgelegt"], "aktiv")] },
];

pub fn kind(id: &str) -> Result<&'static Kind, String> {
    KINDS.iter().find(|k| k.id == id).ok_or_else(|| format!("Unbekannte Vorgangsart „{id}“"))
}

fn cents(v: &Value) -> i64 {
    v.as_i64().unwrap_or_else(|| v.as_f64().map(|f| f.round() as i64).unwrap_or(0))
}

/// Summe der Positionen (Menge × Preis in Cent, abzüglich Positionsrabatt) oder fester Betrag (`betrag`).
fn total_of(data: &Value) -> i64 {
    if data.get("betrag").map(|b| b.is_number()).unwrap_or(false) {
        return cents(&data["betrag"]);
    }
    data["lines"].as_array().map(|ls| {
        ls.iter().map(|l| {
            let g = l["qty"].as_f64().unwrap_or(0.0) * l["price"].as_f64().unwrap_or(0.0);
            (g * (1.0 - l["disc"].as_f64().unwrap_or(0.0) / 100.0)).round() as i64
        }).sum()
    }).unwrap_or(0)
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({ "id": r.get::<_, i64>(0)?, "kind": r.get::<_, String>(1)?, "no": r.get::<_, String>(2)?, "status": r.get::<_, String>(3)?,
        "partner": r.get::<_, Option<String>>(4)?, "partner_name": r.get::<_, String>(5)?, "ref": r.get::<_, String>(6)?, "date": r.get::<_, String>(7)?,
        "due": r.get::<_, Option<String>>(8)?, "total": r.get::<_, i64>(9)?, "open": r.get::<_, i64>(10)?,
        "data": serde_json::from_str::<Value>(&r.get::<_, String>(11)?).unwrap_or(json!({})), "created_at": r.get::<_, String>(12)?,
        "updated_at": r.get::<_, String>(13)?, "user": r.get::<_, Option<String>>(14)? }))
}
const COLS: &str = "id, kind, no, status, partner, partner_name, ref, date, due, total, open, data, created_at, updated_at, user";

pub fn get(c: &Connection, id: i64) -> Result<Value, String> {
    c.query_row(&format!("SELECT {COLS} FROM docs WHERE id = ?1"), [id], row).map_err(|_| "Vorgang nicht gefunden".to_string())
}

pub fn list(c: &Connection, kinds: &[String], status: Option<&str>, limit: i64) -> Result<Vec<Value>, String> {
    let ph = kinds.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect::<Vec<_>>().join(",");
    let mut sql = format!("SELECT {COLS} FROM docs WHERE kind IN ({ph})");
    if status.is_some() {
        sql += &format!(" AND status = ?{}", kinds.len() + 1);
    }
    sql += &format!(" ORDER BY id DESC LIMIT {}", limit.clamp(1, 5000));
    let mut st = c.prepare(&sql).map_err(|e| e.to_string())?;
    let mut args: Vec<&dyn rusqlite::ToSql> = kinds.iter().map(|k| k as &dyn rusqlite::ToSql).collect();
    if let Some(s) = &status {
        args.push(s);
    }
    let rows = st.query_map(args.as_slice(), row).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn log(c: &Connection, d: &Value, action: &str, user: &str, detail: &Value) -> Result<(), String> {
    c.execute(
        "INSERT INTO doc_log(doc_id, kind, no, ts, user, action, detail) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![d["id"].as_i64(), d["kind"].as_str(), d["no"].as_str(), db::now(), user, action, detail.to_string()],
    )
    .map_err(|e| e.to_string())?;
    let _ = db::audit_append(c, &format!("vorgang.{}.{}", d["kind"].as_str().unwrap_or(""), action), &json!({ "nr": d["no"], "status": d["status"], "benutzer": user, "details": detail }));
    crate::automation::dispatch(c, &format!("vorgang.{}.{}", d["kind"].as_str().unwrap_or(""), action), &json!({ "nr": d["no"], "art": d["kind"], "status": d["status"], "betrag": d["total"], "partner": d["partner_name"] }));
    Ok(())
}

pub fn log_list(c: &Connection, kinds: &[String], limit: i64) -> Result<Vec<Value>, String> {
    let ph = kinds.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect::<Vec<_>>().join(",");
    let mut st = c
        .prepare(&format!("SELECT id, doc_id, kind, no, ts, user, action, detail FROM doc_log WHERE kind IN ({ph}) ORDER BY id DESC LIMIT {}", limit.clamp(1, 5000)))
        .map_err(|e| e.to_string())?;
    let args: Vec<&dyn rusqlite::ToSql> = kinds.iter().map(|k| k as &dyn rusqlite::ToSql).collect();
    let rows = st
        .query_map(args.as_slice(), |r| {
            Ok(json!({ "id": r.get::<_, i64>(0)?, "doc_id": r.get::<_, i64>(1)?, "kind": r.get::<_, String>(2)?, "no": r.get::<_, String>(3)?, "ts": r.get::<_, String>(4)?,
                "user": r.get::<_, Option<String>>(5)?, "action": r.get::<_, String>(6)?, "detail": serde_json::from_str::<Value>(&r.get::<_, String>(7)?).unwrap_or(json!({})) }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

fn next_no(tx: &Connection, k: &Kind) -> Result<String, String> {
    // Rechnung, Lieferschein, Angebot, Auftrag und Lieferantenretoure laufen über den Nummernkreis der eigenen Filiale (Start/Ende)
    let n: i64 = if crate::nummern::art_zu_vorgang(k.id).is_some() {
        crate::nummern::naechste(tx, k.id)?
    } else {
        let key = format!("doc.{}", k.id);
        tx.execute("INSERT OR IGNORE INTO counters(name, value) VALUES (?1, 0)", [&key]).map_err(|e| e.to_string())?;
        tx.query_row("UPDATE counters SET value = value + 1 WHERE name = ?1 RETURNING value", [&key], |r| r.get(0)).map_err(|e| e.to_string())?
    };
    Ok(format!("{}-{}-{n:05}", k.prefix, chrono::Local::now().format("%Y")))
}

fn validate(k: &Kind, d: &Value) -> Result<(), String> {
    let lines = d["data"]["lines"].as_array().cloned().unwrap_or_default();
    for (i, l) in lines.iter().enumerate() {
        let q = l["qty"].as_f64().unwrap_or(0.0);
        if q < 0.0 || q > 100000.0 {
            return Err(format!("Position {}: Menge ungültig", i + 1));
        }
        if l["name"].as_str().unwrap_or("").trim().is_empty() && l["ean"].as_str().unwrap_or("").is_empty() {
            return Err(format!("Position {}: Bezeichnung oder EAN fehlt", i + 1));
        }
    }
    let needs_lines = ["avis", "lretoure", "warenkorb", "angebot", "auftrag", "lieferschein", "rechnung", "reservierung", "auswahl", "pickliste", "preis", "kundenbestellung", "verleih", "webbestellung"];
    if needs_lines.contains(&k.id) && !lines.iter().any(|l| l["qty"].as_f64().unwrap_or(0.0) > 0.0) {
        return Err("Mindestens eine Position mit Menge".into());
    }
    let needs_partner = ["avis", "er", "zahlung", "lretoure", "angebot", "auftrag", "lieferschein", "rechnung", "auswahl", "bonus", "kundenbestellung", "fremdrechnung", "sendung", "verleih", "webbestellung"];
    if needs_partner.contains(&k.id) && d["partner_name"].as_str().unwrap_or("").trim().is_empty() {
        return Err(if ["avis", "er", "zahlung", "lretoure", "bonus"].contains(&k.id) { "Lieferant fehlt".into() } else { "Kunde fehlt".into() });
    }
    if k.id == "er" && d["data"]["rechnungsnr"].as_str().unwrap_or("").trim().is_empty() {
        return Err("Rechnungsnummer des Lieferanten fehlt".into());
    }
    if k.id == "reklamation" && d["data"]["mangel"].as_str().unwrap_or("").trim().is_empty() {
        return Err("Mangel / Beschreibung fehlt".into());
    }
    if ["kampagne", "praemie"].contains(&k.id) && d["data"]["titel"].as_str().unwrap_or("").trim().is_empty() {
        return Err("Titel fehlt".into());
    }
    Ok(())
}

/// Anlegen oder ändern. Neue Vorgänge bekommen Nummer und Anfangsstatus (Reservierungen aus dem
/// Schaufenster: „angefragt“). Zahlungen verbuchen sich beim Anlegen auf die Eingangsrechnungen.
pub fn save(tx: &Transaction, d: &Value, user: &str) -> Result<Value, String> {
    let k = kind(d["kind"].as_str().unwrap_or(""))?;
    validate(k, d)?;
    let data = if d["data"].is_object() { d["data"].clone() } else { json!({}) };
    let total = total_of(&data);
    let now = db::now();
    let date = d["date"].as_str().filter(|s| s.len() >= 10).map(str::to_string).unwrap_or_else(|| now[..10].to_string());
    let s = |k: &str| d[k].as_str().unwrap_or("").trim().to_string();
    let due = d["due"].as_str().filter(|s| s.len() >= 10).map(str::to_string);
    let saved = match d["id"].as_i64() {
        Some(id) => {
            let cur = get(tx, id)?;
            let st = cur["status"].as_str().unwrap_or("");
            if !k.edit.contains(&st) {
                return Err(format!("{} {} ist „{st}“ und kann nicht mehr geändert werden", k.name, cur["no"].as_str().unwrap_or("")));
            }
            let open = if ["er", "rechnung", "fremdrechnung"].contains(&k.id) { total - (cur["total"].as_i64().unwrap_or(0) - cur["open"].as_i64().unwrap_or(0)) } else { 0 };
            tx.execute(
                "UPDATE docs SET partner = ?2, partner_name = ?3, ref = ?4, date = ?5, due = ?6, total = ?7, open = ?8, data = ?9, updated_at = ?10 WHERE id = ?1",
                params![id, d["partner"].as_str(), s("partner_name"), s("ref"), date, due, total, open, data.to_string(), now],
            )
            .map_err(|e| e.to_string())?;
            let n = get(tx, id)?;
            log(tx, &n, "geaendert", user, &json!({ "betrag": total }))?;
            n
        }
        None => {
            let no = next_no(tx, k)?;
            let status = if k.id == "reservierung" && d["status"] == "angefragt" { "angefragt" } else { k.initial };
            let open = if k.id == "er" || k.id == "fremdrechnung" { total } else { 0 };
            tx.execute(
                &format!("INSERT INTO docs(kind, no, status, partner, partner_name, ref, date, due, total, open, data, created_at, updated_at, user) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12,?13)"),
                params![k.id, no, status, d["partner"].as_str(), s("partner_name"), s("ref"), date, due, total, open, data.to_string(), now, user],
            )
            .map_err(|e| e.to_string())?;
            let id = tx.last_insert_rowid();
            if k.id == "zahlung" {
                allocate(tx, &data, 1, &no)?;
            }
            let n = get(tx, id)?;
            log(tx, &n, "angelegt", user, &json!({ "betrag": total, "positionen": data["lines"].as_array().map(|l| l.len()).unwrap_or(0) }))?;
            n
        }
    };
    Ok(saved)
}

/// Zahlung auf Eingangsrechnungen verteilen (sign = 1) oder zurücknehmen (sign = −1).
fn allocate(tx: &Transaction, data: &Value, sign: i64, no: &str) -> Result<(), String> {
    for a in data["zuordnung"].as_array().cloned().unwrap_or_default() {
        let id = a["er"].as_i64().ok_or("Rechnung fehlt")?;
        let amount = cents(&a["betrag"]) + cents(&a["skonto"]);
        let er = get(tx, id)?;
        if er["kind"] != "er" {
            return Err("Zuordnung nur zu Eingangsrechnungen".into());
        }
        if sign > 0 && ["storniert", "bezahlt"].contains(&er["status"].as_str().unwrap_or("")) {
            return Err(format!("Rechnung {} ist {}", er["no"].as_str().unwrap_or(""), er["status"].as_str().unwrap_or("")));
        }
        let open = er["open"].as_i64().unwrap_or(0) - sign * amount;
        let status = if open <= 0 { "bezahlt" } else if open < er["total"].as_i64().unwrap_or(0) { "teilbezahlt" } else if er["status"] == "teilbezahlt" || er["status"] == "bezahlt" { "freigegeben" } else { er["status"].as_str().unwrap_or("offen") };
        tx.execute("UPDATE docs SET open = ?2, status = ?3, updated_at = ?4 WHERE id = ?1", params![id, open.max(0), status, db::now()]).map_err(|e| e.to_string())?;
        let n = get(tx, id)?;
        log(tx, &n, if sign > 0 { "bezahlt" } else { "zahlung_storniert" }, "", &json!({ "zahlung": no, "betrag": a["betrag"], "skonto": a["skonto"], "offen": open.max(0) }))?;
    }
    Ok(())
}

/// Bestandsbuchung für alle Positionen mit EAN (sign: +1 Zugang, −1 Abgang).
fn book_lines(tx: &Transaction, lines: &[Value], sign: i64, reason: &str, no: &str, user: &str) -> Result<Vec<Value>, String> {
    let mut out = vec![];
    for l in lines {
        let ean = l["ean"].as_str().unwrap_or("").trim();
        let qty = l["qty"].as_f64().unwrap_or(0.0).round() as i64;
        if ean.is_empty() || qty <= 0 {
            continue;
        }
        let vid: i64 = tx.query_row("SELECT id FROM variants WHERE ean = ?1", [ean], |r| r.get(0)).optional().map_err(|e| e.to_string())?
            .ok_or_else(|| format!("EAN {ean} ist keinem Artikel zugeordnet"))?;
        let after = catalog::book(tx, vid, sign * qty, false, reason, Some(no), Some(user))?;
        out.push(json!({ "ean": ean, "stock": after }));
    }
    Ok(out)
}

/// Statuswechsel mit Wirkung. `payload` je Aktion (z. B. Zahlung: betrag, datum, art).
pub fn action(tx: &Transaction, id: i64, act: &str, payload: &Value, user: &str) -> Result<Value, String> {
    let d = get(tx, id)?;
    let k = kind(d["kind"].as_str().unwrap_or(""))?;
    let cur = d["status"].as_str().unwrap_or("").to_string();
    let (_, from, to) = k.actions.iter().find(|(a, _, _)| *a == act).ok_or_else(|| format!("Aktion „{act}“ gibt es für {} nicht", k.name))?;
    if !from.contains(&cur.as_str()) {
        return Err(format!("{} {} ist „{cur}“ – „{act}“ ist nicht möglich", k.name, d["no"].as_str().unwrap_or("")));
    }
    let no = d["no"].as_str().unwrap_or("").to_string();
    let mut data = d["data"].clone();
    let lines = data["lines"].as_array().cloned().unwrap_or_default();
    let mut to = to.to_string();
    let mut open = d["open"].as_i64().unwrap_or(0);
    let total = d["total"].as_i64().unwrap_or(0);
    let mut stocks = vec![];
    let mut detail = payload.clone();
    match (k.id, act) {
        ("avis", "buchen") => {
            // Lieferant verlangt Gegenscannen (Stammdaten › Lieferanten): nur nach dem Scanner-Wareneingang
            if crate::lieferant::profil(tx, d["partner"].as_str().unwrap_or(""))["gegenscannen"].as_bool().unwrap_or(false) && !data["gezaehlt"].as_bool().unwrap_or(false) {
                return Err("Dieser Lieferant verlangt das Gegenscannen: bitte die Ware im Wareneingang mit dem Scanner prüfen".into());
            }
            // gegen die Bestellung (falls verknüpft) und Rest als freier Zugang
            let mut rest: Vec<Value> = vec![];
            let order = data["order_id"].as_i64();
            let po_ok = order.map(|o| tx.query_row("SELECT status FROM purchase_orders WHERE id = ?1", [o], |r| r.get::<_, String>(0)).optional().ok().flatten())
                .flatten().map(|s| s == "bestellt" || s == "teilgeliefert").unwrap_or(false);
            let mut rec = vec![];
            for l in &lines {
                let ean = l["ean"].as_str().unwrap_or("");
                let qty = l["qty"].as_f64().unwrap_or(0.0).round() as i64;
                if qty <= 0 {
                    continue;
                }
                let line_id: Option<i64> = if po_ok {
                    tx.query_row("SELECT l.id FROM po_lines l JOIN variants v ON v.id = l.variant_id WHERE l.po_id = ?1 AND v.ean = ?2", params![order, ean], |r| r.get(0))
                        .optional().map_err(|e| e.to_string())?
                } else {
                    None
                };
                match line_id {
                    Some(lid) => rec.push(purchasing::Receive { line_id: lid, qty }),
                    None => rest.push(l.clone()),
                }
            }
            if !rec.is_empty() {
                stocks.extend(purchasing::po_receive(tx, order.unwrap(), &rec, user)?);
            }
            stocks.extend(book_lines(tx, &rest, 1, "Wareneingang", &no, user)?);
            detail = json!({ "gegen_bestellung": rec.len(), "ohne_bestellung": rest.len() });
        }
        ("er", "pruefen") => {
            // Rechnungsprüfung gegen gelieferte Mengen × Einkaufspreis der verknüpften Bestellungen
            let mut erwartet = 0i64;
            for o in data["bestellungen"].as_array().cloned().unwrap_or_default() {
                let id = o.as_i64().unwrap_or(0);
                // gelieferte Menge × Einkaufspreis, abzüglich des Rabatts, mit dem bestellt wurde
                let (v, rabatt): (i64, f64) = tx
                    .query_row("SELECT COALESCE(SUM(l.received * COALESCE(l.cost, 0)), 0), COALESCE(MAX(p.disc_pct), 0) FROM po_lines l JOIN purchase_orders p ON p.id = l.po_id WHERE l.po_id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
                    .map_err(|e| e.to_string())?;
                erwartet += (v as f64 * (1.0 - rabatt / 100.0)).round() as i64;
            }
            let netto = cents(&data["netto"]);
            let diff = netto - erwartet;
            let tol = (erwartet.abs() / 100).max(100);
            data["pruefung"] = json!({ "erwartet": erwartet, "netto": netto, "differenz": diff, "ok": data["bestellungen"].as_array().map(|a| !a.is_empty()).unwrap_or(false) && diff.abs() <= tol, "zeit": db::now(), "von": user });
            detail = data["pruefung"].clone();
        }
        ("er", "stornieren") => {
            if open != total {
                return Err("Rechnung hat bereits Zahlungen – zuerst die Zahlung stornieren".into());
            }
            open = 0;
        }
        ("zahlung", "stornieren") => {
            allocate(tx, &data, -1, &no)?;
        }
        ("lretoure", "versenden") => {
            // Lieferant verlangt einen RMA-Code (Stammdaten › Lieferanten): ohne RMA-/Rücksendenummer wird nicht versendet
            if crate::lieferant::profil(tx, d["partner"].as_str().unwrap_or(""))["rma_pflicht"].as_bool().unwrap_or(false) && d["ref"].as_str().map(str::trim).unwrap_or("").is_empty() {
                return Err("Dieser Lieferant verlangt einen RMA-Code – bitte die RMA-/Rücksendenummer im Beleg eintragen".into());
            }
            stocks = book_lines(tx, &lines, -1, "Lieferantenretoure", &no, user)?
        }
        ("lretoure", "ablehnen") => stocks = book_lines(tx, &lines, 1, "Lieferantenretoure abgelehnt", &no, user)?,
        ("lretoure", "gutschrift") => {
            data["gutschrift"] = json!({ "betrag": cents(&payload["betrag"]), "beleg": payload["beleg"], "datum": payload["datum"] });
        }
        ("lieferschein", "ausliefern") => stocks = book_lines(tx, &lines, -1, "Lieferschein", &no, user)?,
        ("lieferschein", "stornieren") if cur == "ausgeliefert" => stocks = book_lines(tx, &lines, 1, "Lieferschein storniert", &no, user)?,
        ("rechnung", "stellen") => {
            if data["bestand"].as_bool().unwrap_or(false) {
                stocks = book_lines(tx, &lines, -1, "Rechnung", &no, user)?;
                data["gebucht"] = json!(true);
            }
            open = total;
            if d["due"].is_null() {
                let tage = data["zahlungsziel"].as_i64().unwrap_or(14);
                let due = (chrono::Local::now() + chrono::Duration::days(tage)).format("%Y-%m-%d").to_string();
                tx.execute("UPDATE docs SET due = ?2 WHERE id = ?1", params![id, due]).map_err(|e| e.to_string())?;
            }
        }
        ("rechnung" | "fremdrechnung", "zahlung") => {
            let b = cents(&payload["betrag"]);
            if b <= 0 || b > open {
                return Err(format!("Betrag muss zwischen 0,01 und {:.2} € liegen", open as f64 / 100.0));
            }
            let mut z = data["zahlungen"].as_array().cloned().unwrap_or_default();
            z.push(json!({ "betrag": b, "datum": payload["datum"].as_str().unwrap_or(&db::now()[..10]), "art": payload["art"].as_str().unwrap_or("Überweisung"), "von": user }));
            data["zahlungen"] = json!(z);
            open -= b;
            to = if open == 0 { "bezahlt".into() } else { "teilbezahlt".into() };
        }
        ("rechnung" | "fremdrechnung", "mahnen") => {
            let st = data["mahnstufe"].as_i64().unwrap_or(0) + 1;
            data["mahnstufe"] = json!(st);
            let mut m = data["mahnungen"].as_array().cloned().unwrap_or_default();
            m.push(json!({ "stufe": st, "datum": &db::now()[..10], "von": user }));
            data["mahnungen"] = json!(m);
            to = cur.clone();
            detail = json!({ "stufe": st });
        }
        ("fremdrechnung", "stornieren") => {
            if open != total {
                return Err("Rechnung hat bereits Zahlungen".into());
            }
            open = 0;
        }
        ("verleih", "ausgeben") => stocks = book_lines(tx, &lines, -1, "Verleih ausgegeben", &no, user)?,
        ("verleih", "zurueck") => {
            stocks = book_lines(tx, &lines, 1, "Verleih zurück", &no, user)?;
            data["rueckgabe"] = json!({ "zeit": db::now(), "von": user, "zustand": payload["zustand"], "nachzahlung": payload["nachzahlung"] });
        }
        ("webbestellung", "versenden") => {
            stocks = book_lines(tx, &lines, -1, "Webshop-Versand", &no, user)?;
            data["versand"] = json!({ "zeit": db::now(), "tracking": payload["tracking"], "spediteur": payload["spediteur"] });
        }
        ("edi", "fehler") => data["fehler"] = payload["grund"].clone(),
        ("edi", "verarbeitet") => {
            data["ergebnis"] = payload["ergebnis"].clone();
            data["fehler"] = Value::Null;
        }
        ("sendung", "versendet") => {
            data["tracking"] = payload["tracking"].clone();
        }
        ("preis", "durchfuehren") => {
            // neue Preise übernehmen (VK; optional Aktionspreis) und vorher/nachher festhalten
            let mut n = 0;
            for l in &lines {
                let Some(sku) = l["sku"].as_str() else { continue };
                let feld = if l["feld"] == "sale_price" { "sale_price" } else { "price" };
                let neu = l["neu"].as_i64();
                if feld == "price" && !neu.is_some_and(|x| x > 0) {
                    return Err(format!("{}: neuer Preis fehlt", l["name"].as_str().unwrap_or(sku)));
                }
                n += tx.execute(&format!("UPDATE articles SET {feld} = ?2, updated_at = ?3 WHERE id = ?1"), params![sku, neu, db::now()]).map_err(|e| e.to_string())?;
            }
            data["durchgefuehrt"] = json!({ "zeit": db::now(), "von": user, "artikel": n });
            detail = json!({ "artikel": n });
        }
        ("rechnung", "stornieren") => {
            if cur == "offen" && open != total {
                return Err("Rechnung hat bereits Zahlungen".into());
            }
            if data["gebucht"].as_bool().unwrap_or(false) {
                stocks = book_lines(tx, &lines, 1, "Rechnung storniert", &no, user)?;
            }
            open = 0;
        }
        ("auswahl", "ausgeben") => stocks = book_lines(tx, &lines, -1, "Auswahl ausgegeben", &no, user)?,
        ("auswahl", "ruecklauf") => {
            // payload.lines: [{i, zurueck, gekauft}] – zurück und gekauft werden wieder eingebucht (gekauft geht danach über die Kasse)
            let mut ls = lines.clone();
            for p in payload["lines"].as_array().cloned().unwrap_or_default() {
                let i = p["i"].as_u64().unwrap_or(u64::MAX) as usize;
                let Some(l) = ls.get_mut(i) else { continue };
                let open_q = l["qty"].as_i64().unwrap_or(0) - l["zurueck"].as_i64().unwrap_or(0) - l["gekauft"].as_i64().unwrap_or(0);
                let (z, g) = (p["zurueck"].as_i64().unwrap_or(0).max(0), p["gekauft"].as_i64().unwrap_or(0).max(0));
                if z + g > open_q {
                    return Err(format!("Position {}: nur noch {open_q} offen", i + 1));
                }
                let back = json!([{ "ean": l["ean"], "qty": z + g }]);
                stocks.extend(book_lines(tx, back.as_array().unwrap(), 1, if g > 0 && z == 0 { "Auswahl gekauft" } else { "Auswahl zurück" }, &no, user)?);
                l["zurueck"] = json!(l["zurueck"].as_i64().unwrap_or(0) + z);
                l["gekauft"] = json!(l["gekauft"].as_i64().unwrap_or(0) + g);
            }
            let done = ls.iter().all(|l| l["qty"].as_i64().unwrap_or(0) <= l["zurueck"].as_i64().unwrap_or(0) + l["gekauft"].as_i64().unwrap_or(0));
            data["lines"] = json!(ls);
            to = if done { "abgeschlossen".into() } else { cur.clone() };
        }
        ("bonus", "umlegen") => {
            data["umlage"] = payload.clone();
            detail = json!({ "bonus": payload["bonus"] });
        }
        _ => {}
    }
    if let Some(n) = payload["notiz"].as_str().filter(|s| !s.trim().is_empty()) {
        let mut h = data["notizen"].as_array().cloned().unwrap_or_default();
        h.push(json!({ "ts": db::now(), "von": user, "text": n, "aktion": act }));
        data["notizen"] = json!(h);
    }
    tx.execute("UPDATE docs SET status = ?2, data = ?3, open = ?4, updated_at = ?5 WHERE id = ?1", params![id, to, data.to_string(), open, db::now()]).map_err(|e| e.to_string())?;
    let mut n = get(tx, id)?;
    let mut det = detail;
    if !stocks.is_empty() {
        det["bestand"] = json!(stocks.len());
    }
    log(tx, &n, act, user, &det)?;
    n["stocks"] = json!(stocks);
    Ok(n)
}

/// Reservierte Mengen je EAN (offene Reservierungen) – mindern den verfügbaren Bestand.
pub fn reserved(c: &Connection) -> Result<HashMap<String, i64>, String> {
    let mut st = c.prepare("SELECT data FROM docs WHERE kind = 'reservierung' AND status IN ('angefragt','reserviert','abholbereit')").map_err(|e| e.to_string())?;
    let rows = st.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut m: HashMap<String, i64> = HashMap::new();
    for r in rows {
        let d: Value = serde_json::from_str(&r.map_err(|e| e.to_string())?).unwrap_or(json!({}));
        for l in d["lines"].as_array().cloned().unwrap_or_default() {
            if let Some(e) = l["ean"].as_str().filter(|e| !e.is_empty()) {
                *m.entry(e.to_string()).or_default() += l["qty"].as_f64().unwrap_or(0.0).round() as i64;
            }
        }
    }
    Ok(m)
}

/// Einkaufsvolumen (gelieferte Menge × EK) je Lieferant und Warengruppe für ein Jahr –
/// Grundlage für Lieferantenbonus und dessen Umlage.
pub fn purchase_volume(c: &Connection, year: i32) -> Result<Vec<Value>, String> {
    let mut st = c
        .prepare(
            "SELECT p.supplier_id, a.category, CAST(ROUND(SUM(m.delta * COALESCE(l.cost, a.cost, 0) * (1 - p.disc_pct / 100.0))) AS INTEGER), SUM(m.delta)
             FROM stock_moves m JOIN purchase_orders p ON p.no = m.ref
             JOIN po_lines l ON l.po_id = p.id AND l.variant_id = m.variant_id
             JOIN variants v ON v.id = m.variant_id JOIN articles a ON a.id = v.article_id
             WHERE m.reason = 'Wareneingang' AND substr(m.ts, 1, 4) = ?1 GROUP BY p.supplier_id, a.category",
        )
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([year.to_string()], |r| Ok(json!({ "lieferant": r.get::<_, String>(0)?, "warengruppe": r.get::<_, String>(1)?, "wert": r.get::<_, i64>(2)?, "stueck": r.get::<_, i64>(3)? })))
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// Nachträgliche Zuordnung von Verkäufer:in und/oder Kunde zu einem Kassenbeleg.
/// Kunde neu zugeordnet → Bonuspunkte werden nachgebucht.
pub fn sale_assign(tx: &Transaction, no: &str, seller: Option<&str>, customer: Option<&Value>, user: &str) -> Result<Value, String> {
    let (data, total, cust_id): (String, i64, Option<String>) = tx
        .query_row("SELECT data, total, customer_id FROM sales WHERE beleg_no = ?1", [no], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|_| format!("Beleg {no} nicht gefunden"))?;
    let mut d: Value = serde_json::from_str(&data).unwrap_or(json!({}));
    let mut out = json!({ "no": no });
    if let Some(s) = seller {
        let before = d["seller"].clone();
        d["seller"] = if s.trim().is_empty() { Value::Null } else { json!(s.trim()) };
        out["verkaeufer"] = json!({ "vorher": before, "neu": d["seller"] });
    }
    if let Some(cu) = customer {
        let id = cu["id"].as_str().ok_or("Kunde fehlt")?;
        if cust_id.as_deref().is_some_and(|x| !x.is_empty()) {
            return Err(format!("Beleg {no} ist bereits einem Kunden zugeordnet"));
        }
        if d["kind"].as_str().is_some_and(|k| k != "verkauf") {
            return Err("Nur Verkäufe können zugeordnet werden".into());
        }
        let exists: bool = tx.query_row("SELECT 1 FROM customers WHERE id = ?1", [id], |_| Ok(true)).optional().map_err(|e| e.to_string())?.unwrap_or(false);
        if !exists {
            return Err("Kunde nicht gefunden".into());
        }
        d["customer"] = json!({ "id": id, "name": cu["name"], "email": cu["email"], "nachtraeglich": true });
        tx.execute("UPDATE sales SET customer_id = ?2 WHERE beleg_no = ?1", params![no, id]).map_err(|e| e.to_string())?;
        let zero = (d["t"]["zero"].as_f64().unwrap_or(0.0) * 100.0).round() as i64;
        let base = total - zero;
        let earned = crate::customers::earn_points(tx, id, base, no);
        let (delta, balance) = crate::customers::book_points(tx, id, earned, "Einkauf (nachträglich zugeordnet)", Some(no), Some(user))?;
        out["punkte"] = json!({ "gutgeschrieben": delta, "stand": balance });
        out["kunde"] = json!(id);
    }
    tx.execute("UPDATE sales SET data = ?2 WHERE beleg_no = ?1", params![no, d.to_string()]).map_err(|e| e.to_string())?;
    db::audit_append(tx, "pos.sale.assigned", &json!({ "beleg": no, "benutzer": user, "aenderung": out })).map_err(|e| e.to_string())?;
    Ok(out)
}

/* ── Kampagnen ── */

/// Zielgruppe einer Kampagne: aktive Kund:innen mit E-Mail (und Einwilligung), optional nach
/// Kundenstufe, Mindestpunkten, Mindestumsatz, Kauf in den letzten n Tagen bzw. seit n Tagen kein Kauf.
pub fn segment(c: &Connection, seg: &Value) -> Result<Vec<crate::customers::Customer>, String> {
    let all = crate::customers::list(c).map_err(|e| e.to_string())?;
    let stufen: Vec<String> = seg["stufen"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default();
    let consent = seg["nur_einwilligung"].as_bool().unwrap_or(true);
    let min_p = seg["min_punkte"].as_i64().unwrap_or(0);
    let min_u = seg["min_umsatz"].as_i64().unwrap_or(0);
    let today = chrono::Local::now();
    let kauf = seg["kauf_tage"].as_i64().filter(|n| *n > 0).map(|n| (today - chrono::Duration::days(n)).format("%Y-%m-%d").to_string());
    let ohne = seg["ohne_kauf_tage"].as_i64().filter(|n| *n > 0).map(|n| (today - chrono::Duration::days(n)).format("%Y-%m-%d").to_string());
    Ok(all
        .into_iter()
        .filter(|k| k.email.contains('@') && (!consent || k.consent))
        .filter(|k| stufen.is_empty() || stufen.contains(&k.tier))
        .filter(|k| k.points >= min_p && k.revenue >= min_u)
        .filter(|k| kauf.as_ref().map(|d| k.last_visit.as_deref().is_some_and(|l| l >= d.as_str())).unwrap_or(true))
        .filter(|k| ohne.as_ref().map(|d| k.last_visit.as_deref().map(|l| l < d.as_str()).unwrap_or(true)).unwrap_or(true))
        .take(5000)
        .collect())
}

fn fill(t: &str, k: &crate::customers::Customer, code: &str, betrag: &str, firma: &str) -> String {
    let vor = k.name.split_whitespace().next().unwrap_or(&k.name);
    t.replace("{{name}}", &k.name).replace("{{vorname}}", vor).replace("{{code}}", code).replace("{{betrag}}", betrag)
        .replace("{{punkte}}", &k.points.to_string()).replace("{{firma}}", firma)
}

/// Kampagne versenden: je Empfänger:in optional ein persönlicher Gutschein, dann E-Mail über den eigenen Mailserver.
pub fn campaign_send(c: &Connection, id: i64, mail: &crate::mail::Config, user: &str) -> Result<Value, String> {
    let d = get(c, id)?;
    if d["kind"] != "kampagne" || d["status"] != "entwurf" {
        return Err("Nur Kampagnen im Entwurf können versendet werden".into());
    }
    let data = d["data"].clone();
    let list = segment(c, &data["segment"])?;
    if list.is_empty() {
        return Err("Keine Empfänger:innen in der Zielgruppe".into());
    }
    let (betreff, text) = (data["betreff"].as_str().unwrap_or("").to_string(), data["text"].as_str().unwrap_or("").to_string());
    if betreff.trim().is_empty() || text.trim().is_empty() {
        return Err("Betreff und Text fehlen".into());
    }
    let firma = db::setting_get(c, "firma.name").and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
    let gs = cents(&data["gutschein"]);
    let bis = data["gutschein_bis"].as_str().filter(|s| s.len() == 10).map(str::to_string);
    let no = d["no"].as_str().unwrap_or("").to_string();
    let mut out = vec![];
    let (mut ok, mut err) = (0, 0);
    for k in &list {
        let code = if gs > 0 {
            let code = crate::vouchers::issue(c, gs, &no, Some(&k.id), 1, "Kampagne", Some(user))?;
            if let Some(b) = &bis {
                let _ = c.execute("UPDATE vouchers SET valid_until = ?2 WHERE code = ?1", params![code, b]);
            }
            code
        } else {
            String::new()
        };
        let betrag = format!("{:.2} €", gs as f64 / 100.0).replace('.', ",");
        let txt = fill(&text, k, &code, &betrag, &firma);
        let html = format!("<div style=\"font:15px/1.6 system-ui,sans-serif;color:#101828;max-width:560px\">{}{}</div>",
            txt.split("\n\n").map(|p| format!("<p>{}</p>", p.replace('&', "&amp;").replace('<', "&lt;").replace('\n', "<br>"))).collect::<String>(),
            if code.is_empty() { String::new() } else { format!("<p style=\"font-size:20px;font-weight:700;letter-spacing:.06em;border:2px dashed #98a2b3;border-radius:10px;padding:12px;text-align:center\">{code}</p>") });
        let r = crate::mail::send(mail, &crate::mail::Mail { to: &k.email, subject: &fill(&betreff, k, &code, &betrag, &firma), html: &html, text: &txt, qr: if code.is_empty() { None } else { Some(&code) } });
        match &r {
            Ok(_) => ok += 1,
            Err(_) => err += 1,
        }
        out.push(json!({ "id": k.id, "name": k.name, "email": k.email, "code": code, "ok": r.is_ok(), "fehler": r.err() }));
        if err >= 5 && ok == 0 {
            break;
        }
    }
    let mut data = data;
    data["empfaenger"] = json!(out);
    data["versand"] = json!({ "zeit": db::now(), "ok": ok, "fehler": err, "von": user });
    c.execute("UPDATE docs SET status = 'versendet', data = ?2, updated_at = ?3 WHERE id = ?1", params![id, data.to_string(), db::now()]).map_err(|e| e.to_string())?;
    let n = get(c, id)?;
    log(c, &n, "versendet", user, &json!({ "gesendet": ok, "fehler": err }))?;
    Ok(n)
}

/// Erfolg einer Kampagne: eingelöste Gutscheine und Umsatz der Empfänger:innen seit dem Versand.
pub fn campaign_stats(c: &Connection, id: i64) -> Result<Value, String> {
    let d = get(c, id)?;
    let no = d["no"].as_str().unwrap_or("");
    let (n, initial, balance): (i64, i64, i64) = c
        .query_row("SELECT COUNT(*), COALESCE(SUM(initial),0), COALESCE(SUM(balance),0) FROM vouchers WHERE sale_no = ?1", [no], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?;
    let used: i64 = c.query_row("SELECT COUNT(*) FROM vouchers WHERE sale_no = ?1 AND balance < initial", [no], |r| r.get(0)).map_err(|e| e.to_string())?;
    let since = d["data"]["versand"]["zeit"].as_str().unwrap_or("9999").to_string();
    let ids: Vec<String> = d["data"]["empfaenger"].as_array().map(|a| a.iter().filter(|x| x["ok"] == true).filter_map(|x| x["id"].as_str().map(str::to_string)).collect()).unwrap_or_default();
    let (mut bons, mut umsatz, mut kaeufer) = (0i64, 0i64, 0i64);
    for cid in &ids {
        let (b, u): (i64, i64) = c
            .query_row("SELECT COUNT(*), COALESCE(SUM(total),0) FROM sales WHERE customer_id = ?1 AND ts >= ?2 AND json_extract(data,'$.kind') IS NOT 'retoure'", params![cid, since], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        if b > 0 {
            kaeufer += 1;
        }
        bons += b;
        umsatz += u;
    }
    Ok(json!({ "gutscheine": n, "eingeloest": used, "einloesewert": initial - balance, "empfaenger": ids.len(), "kaeufer": kaeufer, "bons": bons, "umsatz": umsatz }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        c.execute("INSERT INTO articles(id, name, category, price, created_at, updated_at) VALUES ('A1','Test','acc',1000,'x','x')", []).unwrap();
        c.execute("INSERT INTO variants(article_id, color, size, ean, stock) VALUES ('A1','moos','M','2000000000015', 10)", []).unwrap();
        c
    }
    fn stock(c: &Connection) -> i64 {
        c.query_row("SELECT stock FROM variants WHERE ean = '2000000000015'", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn lieferantenretoure_und_auswahl_buchen() {
        let c = setup();
        let tx = c.unchecked_transaction().unwrap();
        let d = save(&tx, &json!({ "kind": "lretoure", "partner": "L1", "partner_name": "Lieferant", "data": { "lines": [{ "ean": "2000000000015", "name": "Test", "qty": 3, "price": 500 }] } }), "t").unwrap();
        assert_eq!(d["total"], 1500);
        assert!(d["no"].as_str().unwrap().starts_with("LR-"));
        action(&tx, d["id"].as_i64().unwrap(), "versenden", &json!({}), "t").unwrap();
        assert_eq!(stock(&tx), 7);
        assert!(action(&tx, d["id"].as_i64().unwrap(), "versenden", &json!({}), "t").is_err());
        action(&tx, d["id"].as_i64().unwrap(), "ablehnen", &json!({}), "t").unwrap();
        assert_eq!(stock(&tx), 10);
        // Auswahl: 2 raus, 1 zurück, 1 gekauft → abgeschlossen, Bestand wieder 10 (Verkauf läuft über die Kasse)
        let a = save(&tx, &json!({ "kind": "auswahl", "partner": "K1", "partner_name": "Kundin", "data": { "lines": [{ "ean": "2000000000015", "name": "Test", "qty": 2, "price": 1000 }] } }), "t").unwrap();
        let id = a["id"].as_i64().unwrap();
        action(&tx, id, "ausgeben", &json!({}), "t").unwrap();
        assert_eq!(stock(&tx), 8);
        assert!(action(&tx, id, "ruecklauf", &json!({ "lines": [{ "i": 0, "zurueck": 3 }] }), "t").is_err());
        let r = action(&tx, id, "ruecklauf", &json!({ "lines": [{ "i": 0, "zurueck": 1, "gekauft": 1 }] }), "t").unwrap();
        assert_eq!(r["status"], "abgeschlossen");
        assert_eq!(stock(&tx), 10);
        // Protokoll
        assert!(log_list(&tx, &["lretoure".into()], 10).unwrap().len() >= 3);
    }

    #[test]
    fn lieferant_verlangt_rma_code_und_gegenscannen() {
        let c = setup();
        let sup = crate::lieferant::save(&c, &json!({ "name": "Firn Sports", "nr": 1, "country": "AT", "profile": { "rma_pflicht": true, "gegenscannen": true } }), "T").unwrap();
        let sid = sup["id"].as_str().unwrap();
        let tx = c.unchecked_transaction().unwrap();
        // Retoure: ohne RMA-/Rücksendenummer nicht versendet, mit Nummer geht es
        let d = save(&tx, &json!({ "kind": "lretoure", "partner": sid, "partner_name": "Firn", "data": { "lines": [{ "ean": "2000000000015", "name": "Test", "qty": 1, "price": 500 }] } }), "t").unwrap();
        let id = d["id"].as_i64().unwrap();
        assert!(action(&tx, id, "versenden", &json!({}), "t").unwrap_err().contains("RMA-Code"));
        assert_eq!(stock(&tx), 10, "nichts gebucht");
        save(&tx, &json!({ "id": id, "kind": "lretoure", "partner": sid, "partner_name": "Firn", "ref": "RMA-4711", "data": { "lines": [{ "ean": "2000000000015", "name": "Test", "qty": 1, "price": 500 }] } }), "t").unwrap();
        action(&tx, id, "versenden", &json!({}), "t").unwrap();
        assert_eq!(stock(&tx), 9);
        // Avis: ohne Scanner-Prüfung nicht einbuchen
        let a = save(&tx, &json!({ "kind": "avis", "partner": sid, "partner_name": "Firn", "data": { "lines": [{ "ean": "2000000000015", "name": "Test", "qty": 2 }] } }), "t").unwrap();
        let aid = a["id"].as_i64().unwrap();
        assert!(action(&tx, aid, "buchen", &json!({}), "t").unwrap_err().contains("Gegenscannen"));
        assert_eq!(stock(&tx), 9);
        save(&tx, &json!({ "id": aid, "kind": "avis", "partner": sid, "partner_name": "Firn", "data": { "gezaehlt": true, "lines": [{ "ean": "2000000000015", "name": "Test", "qty": 2 }] } }), "t").unwrap();
        action(&tx, aid, "buchen", &json!({}), "t").unwrap();
        assert_eq!(stock(&tx), 11);
    }

    #[test]
    fn eingangsrechnung_und_zahlung() {
        let c = setup();
        let tx = c.unchecked_transaction().unwrap();
        let er = save(&tx, &json!({ "kind": "er", "partner": "L1", "partner_name": "Lieferant", "data": { "rechnungsnr": "R-1", "betrag": 12000, "netto": 10000 } }), "t").unwrap();
        assert_eq!(er["open"], 12000);
        let id = er["id"].as_i64().unwrap();
        let z = save(&tx, &json!({ "kind": "zahlung", "partner": "L1", "partner_name": "Lieferant", "data": { "betrag": 5000, "zuordnung": [{ "er": id, "betrag": 5000 }] } }), "t").unwrap();
        assert_eq!(get(&tx, id).unwrap()["status"], "teilbezahlt");
        assert!(action(&tx, id, "stornieren", &json!({}), "t").is_err());
        save(&tx, &json!({ "kind": "zahlung", "partner": "L1", "partner_name": "Lieferant", "data": { "betrag": 6760, "zuordnung": [{ "er": id, "betrag": 6760, "skonto": 240 }] } }), "t").unwrap();
        assert_eq!(get(&tx, id).unwrap()["status"], "bezahlt");
        assert_eq!(get(&tx, id).unwrap()["open"], 0);
        action(&tx, z["id"].as_i64().unwrap(), "stornieren", &json!({}), "t").unwrap();
        let e = get(&tx, id).unwrap();
        assert_eq!(e["open"], 5000);
        assert_eq!(e["status"], "teilbezahlt");
        // Rechnung an Kunden mit Bestandsbuchung und Teilzahlung
        let re = save(&tx, &json!({ "kind": "rechnung", "partner": "K1", "partner_name": "Firma", "data": { "bestand": true, "lines": [{ "ean": "2000000000015", "name": "Test", "qty": 2, "price": 1000, "disc": 10 }] } }), "t").unwrap();
        assert_eq!(re["total"], 1800);
        let rid = re["id"].as_i64().unwrap();
        action(&tx, rid, "stellen", &json!({}), "t").unwrap();
        assert_eq!(stock(&tx), 8);
        let r = action(&tx, rid, "zahlung", &json!({ "betrag": 800 }), "t").unwrap();
        assert_eq!((r["status"].as_str().unwrap(), r["open"].as_i64().unwrap()), ("teilbezahlt", 1000));
        assert!(action(&tx, rid, "zahlung", &json!({ "betrag": 5000 }), "t").is_err());
        let r = action(&tx, rid, "zahlung", &json!({ "betrag": 1000 }), "t").unwrap();
        assert_eq!(r["status"], "bezahlt");
        // Preisänderung
        let pa = save(&tx, &json!({ "kind": "preis", "partner_name": "Preisänderung", "data": { "lines": [{ "sku": "A1", "name": "Test", "qty": 1, "price": 1290, "alt": 1000, "neu": 1290 }] } }), "t").unwrap();
        assert_eq!(pa["status"], "geplant");
        action(&tx, pa["id"].as_i64().unwrap(), "durchfuehren", &json!({}), "t").unwrap();
        assert_eq!(tx.query_row("SELECT price FROM articles WHERE id = 'A1'", [], |r| r.get::<_, i64>(0)).unwrap(), 1290);
        // Fremdrechnung mit Teilzahlung
        let fr = save(&tx, &json!({ "kind": "fremdrechnung", "partner_name": "Webshop-Kunde", "data": { "betrag": 5000 } }), "t").unwrap();
        assert_eq!(fr["open"], 5000);
        let f = action(&tx, fr["id"].as_i64().unwrap(), "zahlung", &json!({ "betrag": 2000 }), "t").unwrap();
        assert_eq!((f["status"].as_str().unwrap(), f["open"].as_i64().unwrap()), ("teilbezahlt", 3000));
        // Reservierung zählt als reserviert
        save(&tx, &json!({ "kind": "reservierung", "partner_name": "Gast", "data": { "lines": [{ "ean": "2000000000015", "name": "Test", "qty": 2, "price": 1000 }] } }), "t").unwrap();
        assert_eq!(reserved(&tx).unwrap().get("2000000000015"), Some(&2));
    }
}
