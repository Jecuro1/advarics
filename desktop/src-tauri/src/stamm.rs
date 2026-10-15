//! Stammdaten-Tabellen (Marken, Saisons, Größenschlüssel, Spediteure, Hotels, MwSt.-Sets …) in einer
//! gemeinsamen Tabelle, Zeiterfassung und die Flexanalyse über alle Belegpositionen.

use crate::db;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub fn list(c: &Connection, kind: &str) -> Result<Vec<Value>, String> {
    let mut st = c.prepare("SELECT id, data, pos, active, updated_at FROM stamm WHERE kind = ?1 ORDER BY pos, id").map_err(|e| e.to_string())?;
    let rows = st
        .query_map([kind], |r| {
            let mut d: Value = serde_json::from_str(&r.get::<_, String>(1)?).unwrap_or(json!({}));
            d["id"] = json!(r.get::<_, String>(0)?);
            d["_pos"] = json!(r.get::<_, i64>(2)?);
            d["_aktiv"] = json!(r.get::<_, i64>(3)? != 0);
            d["_geaendert"] = json!(r.get::<_, String>(4)?);
            Ok(d)
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn all(c: &Connection) -> Result<Value, String> {
    let mut st = c.prepare("SELECT DISTINCT kind FROM stamm").map_err(|e| e.to_string())?;
    let kinds: Vec<String> = st.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    let mut m = serde_json::Map::new();
    for k in kinds {
        m.insert(k.clone(), json!(list(c, &k)?));
    }
    Ok(Value::Object(m))
}

/// Ganze Tabelle einer Art ersetzen (Reihenfolge = Position). IDs müssen eindeutig sein.
pub fn save(c: &Connection, kind: &str, rows: &[Value]) -> Result<usize, String> {
    if kind.is_empty() || kind.len() > 40 || !kind.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.') {
        return Err("Ungültige Tabelle".into());
    }
    let mut seen = HashSet::new();
    for r in rows {
        let id = r["id"].as_str().unwrap_or("").trim();
        if id.is_empty() {
            return Err("Jede Zeile braucht ein Kürzel / eine ID".into());
        }
        if !seen.insert(id.to_lowercase()) {
            return Err(format!("„{id}“ kommt doppelt vor"));
        }
    }
    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
    write_rows(&tx, kind, rows)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(rows.len())
}

/// Tabellen, die nur am jeweiligen Arbeitsplatz gelten (nicht von der Zentrale übernommen)
pub const LOCAL: [&str; 6] = ["edijob", "reportplan", "etikettendrucker", "esl", "inventurort", "edianbindung"];

/// Zeilen schreiben – ohne eigene Transaktion (für den Filialabgleich)
pub fn write_rows(tx: &Connection, kind: &str, rows: &[Value]) -> Result<(), String> {
    tx.execute("DELETE FROM stamm WHERE kind = ?1", [kind]).map_err(|e| e.to_string())?;
    for (i, r) in rows.iter().enumerate() {
        let mut d = r.clone();
        let id = d["id"].as_str().unwrap_or("").trim().to_string();
        let aktiv = d["_aktiv"].as_bool().unwrap_or(true);
        if let Some(o) = d.as_object_mut() {
            o.retain(|k, _| !k.starts_with('_') && k != "id");
        }
        tx.execute("INSERT INTO stamm(kind, id, data, pos, active, updated_at) VALUES (?1,?2,?3,?4,?5,?6)", params![kind, id, d.to_string(), i as i64, aktiv as i64, db::now()])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/* ── Zeiterfassung ── */

pub fn zeit_stempel(c: &Connection, user: &str) -> Result<Value, String> {
    let open: Option<i64> = c.query_row("SELECT id FROM zeiten WHERE user = ?1 AND ende IS NULL ORDER BY id DESC LIMIT 1", [user], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    match open {
        Some(id) => {
            c.execute("UPDATE zeiten SET ende = ?2 WHERE id = ?1", params![id, db::now()]).map_err(|e| e.to_string())?;
            Ok(json!({ "status": "gegangen", "id": id }))
        }
        None => {
            c.execute("INSERT INTO zeiten(user, start) VALUES (?1, ?2)", params![user, db::now()]).map_err(|e| e.to_string())?;
            Ok(json!({ "status": "gekommen", "id": c.last_insert_rowid() }))
        }
    }
}

pub fn zeit_list(c: &Connection, von: &str, bis: &str) -> Result<Vec<Value>, String> {
    let mut st = c
        .prepare("SELECT id, user, start, ende, pause, notiz, geaendert FROM zeiten WHERE substr(start,1,10) BETWEEN ?1 AND ?2 ORDER BY start DESC")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map(params![von, bis], |r| {
            Ok(json!({ "id": r.get::<_, i64>(0)?, "user": r.get::<_, String>(1)?, "start": r.get::<_, String>(2)?, "ende": r.get::<_, Option<String>>(3)?,
                "pause": r.get::<_, i64>(4)?, "notiz": r.get::<_, String>(5)?, "geaendert": r.get::<_, Option<String>>(6)? }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// Korrektur durch Leitung (wird markiert)
pub fn zeit_save(c: &Connection, e: &Value, by: &str) -> Result<(), String> {
    let s = |k: &str| e[k].as_str().map(str::to_string);
    let start = s("start").ok_or("Beginn fehlt")?;
    if let (Some(a), Some(b)) = (Some(&start), s("ende").as_ref()) {
        if b <= a {
            return Err("Ende muss nach dem Beginn liegen".into());
        }
    }
    let note = format!("{} · {}", by, db::now());
    match e["id"].as_i64() {
        Some(id) => c.execute("UPDATE zeiten SET start = ?2, ende = ?3, pause = ?4, notiz = ?5, geaendert = ?6 WHERE id = ?1", params![id, start, s("ende"), e["pause"].as_i64().unwrap_or(0), s("notiz").unwrap_or_default(), note]),
        None => c.execute("INSERT INTO zeiten(user, start, ende, pause, notiz, geaendert) VALUES (?1,?2,?3,?4,?5,?6)", params![s("user").ok_or("Person fehlt")?, start, s("ende"), e["pause"].as_i64().unwrap_or(0), s("notiz").unwrap_or_default(), note]),
    }
    .map_err(|e| e.to_string())?;
    Ok(())
}

/* ── Flexanalyse ── */

/// Größe vergleichbar machen: ohne Groß/Klein, Leerzeichen zusammengefasst
fn gr_norm(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Zahl aus einer Stammdaten-Zelle (Zahl oder Text mit Komma)
fn zahl(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().replace(',', ".").parse().ok(),
        _ => None,
    }
}

/// Kennung eines Schlüssels (klein geschrieben): die Kennung selbst, sonst der Klartext → Kennung der Zeile; leer = STANDARD
fn schl_id(rows: &[Value], v: &str) -> String {
    let v = v.trim();
    if v.is_empty() {
        return "standard".into();
    }
    let hit = rows
        .iter()
        .find(|r| r["id"].as_str().map_or(false, |i| i.eq_ignore_ascii_case(v)))
        .or_else(|| rows.iter().find(|r| r["name"].as_str().map_or(false, |n| gr_norm(n) == gr_norm(v))));
    hit.and_then(|r| r["id"].as_str()).unwrap_or(v).to_lowercase()
}

/// Euro-Betrag für die Bezeichnung eines Preislagen-Bandes ohne Namen
fn band_eur(x: f64) -> String {
    if (x - x.round()).abs() < 0.005 { format!("{:.0}", x) } else { format!("{:.2}", x).replace('.', ",") }
}

/// Feste Einteilung der Preislage (solange in Stammdaten › Preislagen keine Bänder gepflegt sind)
fn preislage_fest(p: f64) -> String {
    let b = [0.0, 25.0, 50.0, 100.0, 200.0, 400.0, 800.0];
    let i = b.iter().rposition(|x| p >= *x).unwrap_or(0);
    if i + 1 < b.len() { format!("€ {:.0}–{:.0}", b[i], b[i + 1]) } else { format!("ab € {:.0}", b[i]) }
}

/// Einträge „Größe=Statistik-Größe“ eines Statistik-Größen-Sets. Liste: jedes Element ist EINE Zuordnung (Größen dürfen ein Komma
/// enthalten, z. B. „37,5=38“). Text: getrennt an „;“ und Zeilenumbrüchen, nur wenn der Text kein „;“ enthält zusätzlich an „,“ (früheres Verhalten).
fn zuordnungen(v: &Value) -> Vec<String> {
    match v {
        Value::Array(a) => a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect(),
        Value::String(t) => {
            let komma = !t.contains(';');
            t.split(|ch| ch == ';' || ch == '\n' || ch == '\r' || (komma && ch == ',')).map(str::to_string).collect()
        }
        _ => vec![],
    }
}

/// Stammdaten, die einzelne Dimensionen der Flexanalyse brauchen – einmal je Aufruf gelesen, nicht je Position
#[derive(Default)]
struct DimCtx {
    /// Warengruppe (Kategorie des Artikels) → (Preislagen-Schlüssel klein, Statistik-Größen-Set normalisiert; leer = keines)
    wg: HashMap<String, (String, String)>,
    /// Preislagen-Schlüssel (klein) → Bänder (von, bis, Name), aufsteigend nach „von“
    baender: HashMap<String, Vec<(f64, f64, String)>>,
    /// Statistik-Größen-Set (Kennung und Name, normalisiert) → normalisierte Größe → Statistik-Größe
    sets: HashMap<String, HashMap<String, String>>,
}

impl DimCtx {
    /// Warengruppen-Zeilen, Preislagen-Bänder und Größen-Sets aus den Stammdaten lesen
    fn laden(c: &Connection) -> DimCtx {
        let aktiv = |r: &Value| r["_aktiv"].as_bool() != Some(false);
        let schl = list(c, "preislagenschluessel").unwrap_or_default();
        let mut ctx = DimCtx::default();
        for b in list(c, "preislage").unwrap_or_default().iter().filter(|r| aktiv(r)) {
            let (von, bis) = (zahl(&b["von"]).filter(|x| !x.is_nan()), zahl(&b["bis"]).filter(|x| !x.is_nan()));
            if von.is_none() && bis.is_none() {
                continue; // Band ohne Grenzen (weder „von“ noch „bis“ eine Zahl): wie ein inaktives ignorieren, sonst gälte es als 0 bis unendlich und verdrängte alle höheren Bänder
            }
            let (von, bis) = (von.unwrap_or(0.0), bis.unwrap_or(f64::INFINITY));
            ctx.baender.entry(schl_id(&schl, b["schluessel"].as_str().unwrap_or(""))).or_default().push((von, bis, b["name"].as_str().unwrap_or("").trim().to_string()));
        }
        for v in ctx.baender.values_mut() {
            v.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        }
        for s in list(c, "statgroessenset").unwrap_or_default().iter().filter(|r| aktiv(r)) {
            let mut m = HashMap::new();
            for e in zuordnungen(&s["zuordnung"]) {
                if let Some((g, st)) = e.split_once('=') {
                    let (g, st) = (gr_norm(g), st.split_whitespace().collect::<Vec<_>>().join(" "));
                    if !g.is_empty() && !st.is_empty() {
                        m.insert(g, st);
                    }
                }
            }
            for k in [s["id"].as_str().unwrap_or(""), s["name"].as_str().unwrap_or("")] {
                if !k.trim().is_empty() {
                    ctx.sets.insert(gr_norm(k), m.clone());
                }
            }
        }
        for w in list(c, "warengruppe").unwrap_or_default() {
            let (p, st) = (w["preislage"].as_str().unwrap_or("").trim(), w["statgroessen"].as_str().unwrap_or("").trim());
            if p.is_empty() && st.is_empty() {
                continue;
            }
            ctx.wg.insert(w["id"].as_str().unwrap_or("").to_string(), (schl_id(&schl, p), gr_norm(st)));
        }
        ctx
    }

    /// Preislage eines Preises: Bänder des Schlüssels der Warengruppe, sonst die von STANDARD, sonst die feste Einteilung
    fn preislage(&self, cat: &str, p: f64) -> String {
        let key = self.wg.get(cat).map(|w| w.0.as_str()).unwrap_or("standard");
        let own = |k: &str| self.baender.get(k).filter(|v| !v.is_empty());
        match own(key).or_else(|| own("standard")) {
            None => preislage_fest(p),
            Some(b) => {
                let p = (p * 100.0).round() / 100.0;
                match b.iter().find(|x| p >= x.0 && p <= x.1) {
                    Some((_, _, n)) if !n.is_empty() => n.clone(),
                    Some((von, bis, _)) if *bis < 99999.0 => format!("€ {}–{}", band_eur(*von), band_eur(*bis)),
                    Some((von, _, _)) => format!("ab € {}", band_eur(*von)),
                    None => "ohne Preislage".into(),
                }
            }
        }
    }

    /// Statistik-Größe: die Größe über das Set der Warengruppe zusammengefasst; ohne Set oder Zuordnung die Roh-Größe
    fn statgroesse(&self, cat: &str, groesse: &str) -> String {
        let set = match self.wg.get(cat) {
            Some(w) if !w.1.is_empty() => w.1.as_str(),
            _ => return groesse.to_string(),
        };
        self.sets.get(set).and_then(|m| m.get(&gr_norm(groesse))).cloned().unwrap_or_else(|| groesse.to_string())
    }
}

fn dim_value(dim: &str, ts: &str, line: &Value, row: &HashMap<&str, String>, ctx: &DimCtx) -> String {
    let lv = |k: &str| line[k].as_str().unwrap_or("").to_string();
    match dim {
        "warengruppe" => row["cat"].clone(),
        "marke" => row["brand"].clone(),
        "artikel" => format!("{} {}", lv("sku"), lv("name")).trim().to_string(),
        "farbe" => lv("c"),
        "groesse" => lv("s"),
        "statgroesse" => ctx.statgroesse(&row["cat"], &lv("s")),
        "kassier" => row["cashier"].clone(),
        "verkaeufer" => row["seller"].clone(),
        "kunde" => row["customer"].clone(),
        "lieferant" => row["supplier"].clone(),
        "saison" => row["saison"].clone(),
        "filiale" => row["store"].clone(),
        "filialgruppe" => row["fgruppe"].clone(),
        "haustyp" => row["haustyp"].clone(),
        "monat" => ts.get(0..7).unwrap_or("").to_string(),
        "jahr" => ts.get(0..4).unwrap_or("").to_string(),
        "tag" => ts.get(0..10).unwrap_or("").to_string(),
        "stunde" => format!("{} Uhr", ts.get(11..13).unwrap_or("")),
        "wochentag" => chrono::NaiveDate::parse_from_str(ts.get(0..10).unwrap_or(""), "%Y-%m-%d")
            .map(|d| ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][chrono::Datelike::weekday(&d).num_days_from_monday() as usize].to_string())
            .unwrap_or_default(),
        "preislage" => ctx.preislage(&row["cat"], line["unit"].as_f64().unwrap_or(0.0)),
        _ => String::new(),
    }
}

/// Auswertung über alle Belegpositionen: bis zu drei Dimensionen, Kennzahlen Menge, Umsatz, Rabatt,
/// Rohertrag (netto − EK), Bons. Retouren und Stornos werden abgezogen.
pub fn analyse(c: &Connection, p: &Value) -> Result<Value, String> {
    let von = p["von"].as_str().unwrap_or("0000-00-00").to_string();
    let bis = p["bis"].as_str().unwrap_or("9999-99-99").to_string();
    let dims: Vec<String> = p["dims"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).take(3).collect()).unwrap_or_default();
    let filt: Vec<(String, String)> = p["filter"].as_object().map(|m| m.iter().filter_map(|(k, v)| v.as_str().filter(|s| !s.is_empty()).map(|s| (k.clone(), s.to_string()))).collect()).unwrap_or_default();
    // Warengruppen-Zeilen, Preislagen-Bänder und Größen-Sets nur lesen, wenn eine Dimension oder ein Filter sie braucht
    let ctx = if dims.iter().map(String::as_str).chain(filt.iter().map(|(k, _)| k.as_str())).any(|d| d == "preislage" || d == "statgroesse") { DimCtx::laden(c) } else { DimCtx::default() };
    let own = db::setting_get(c, "verbund.filiale").and_then(|v| v.as_str().map(str::to_string)).filter(|s| !s.is_empty()).unwrap_or_else(|| "HIER".into());
    let arts: HashMap<String, (String, String, String, Option<i64>, String)> = {
        let mut st = c.prepare("SELECT id, category, brand, COALESCE(supplier_id,''), cost, fields FROM articles").map_err(|e| e.to_string())?;
        let rows = st
            .query_map([], |r| {
                let f: Value = serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or(json!({}));
                Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, f["Saison"].as_str().unwrap_or("").to_string())))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    let sups: HashMap<String, String> = {
        let mut st = c.prepare("SELECT id, name FROM suppliers").map_err(|e| e.to_string())?;
        let r = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
        r.filter_map(Result::ok).collect()
    };
    // je Filiale: Filialgruppe und Haus-Typ aus Stammdaten › Filialen
    let own_id = crate::verbund::own_store(c);
    let fmeta: HashMap<String, (String, String)> = {
        let gr = list(c, "filialgruppe").unwrap_or_default();
        list(c, "filiale")
            .unwrap_or_default()
            .iter()
            .map(|r| {
                let id = r["id"].as_str().unwrap_or("").to_string();
                let g = gr
                    .iter()
                    .find(|g| g["filialen"].as_array().map(|a| a.iter().any(|x| x.as_str().map(|t| t.eq_ignore_ascii_case(&id)).unwrap_or(false))).unwrap_or(false))
                    .and_then(|g| g["name"].as_str())
                    .unwrap_or("Standard")
                    .to_string();
                (id, (g, r["haustyp"].as_str().unwrap_or("").to_string()))
            })
            .collect()
    };
    let mut src: Vec<(String, String, Option<String>, String, String)> = vec![];
    {
        let mut st = c.prepare("SELECT beleg_no, ts, cashier, data FROM sales WHERE substr(ts,1,10) BETWEEN ?1 AND ?2").map_err(|e| e.to_string())?;
        let r = st.query_map(params![von, bis], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, String>(3)?, own.clone()))).map_err(|e| e.to_string())?;
        src.extend(r.filter_map(Result::ok));
        let mut st = c.prepare("SELECT beleg_no, ts, cashier, data, store FROM store_sales WHERE substr(ts,1,10) BETWEEN ?1 AND ?2 AND store <> ?3").map_err(|e| e.to_string())?;
        let r = st.query_map(params![von, bis, own], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?))).map_err(|e| e.to_string())?;
        src.extend(r.filter_map(Result::ok));
    }
    #[derive(Default)]
    struct Agg { menge: f64, umsatz: f64, rabatt: f64, netto: f64, ek: f64, bons: HashSet<String> }
    let mut agg: HashMap<Vec<String>, Agg> = HashMap::new();
    let mut total = Agg::default();
    for (no, ts, cashier, data, store) in src {
        let d: Value = serde_json::from_str(&data).unwrap_or(json!({}));
        let kind = d["kind"].as_str().unwrap_or("verkauf");
        let sign = if kind == "verkauf" { 1.0 } else { -1.0 };
        if d["voided"].as_bool().unwrap_or(false) {
            continue;
        }
        for l in d["lines"].as_array().cloned().unwrap_or_default() {
            if l["voucher"].as_bool().unwrap_or(false) {
                continue;
            }
            let sku = l["sku"].as_str().unwrap_or("");
            let a = arts.get(sku);
            let mut row: HashMap<&str, String> = HashMap::new();
            row.insert("cat", a.map(|x| x.0.clone()).unwrap_or_else(|| "Dienstleistung".into()));
            row.insert("brand", a.map(|x| x.1.clone()).unwrap_or_default());
            row.insert("supplier", a.map(|x| sups.get(&x.2).cloned().unwrap_or_else(|| x.2.clone())).unwrap_or_default());
            row.insert("saison", a.map(|x| x.4.clone()).unwrap_or_default());
            row.insert("cashier", cashier.clone().unwrap_or_default());
            row.insert("seller", d["seller"].as_str().map(str::to_string).or(cashier.clone()).unwrap_or_default());
            row.insert("customer", d["customer"]["name"].as_str().unwrap_or("ohne Kunde").to_string());
            row.insert("store", store.clone());
            let (fg, ht) = fmeta.get(if store == "HIER" { own_id.as_str() } else { store.as_str() }).cloned().unwrap_or_else(|| ("Standard".to_string(), String::new()));
            row.insert("fgruppe", fg);
            row.insert("haustyp", ht);
            if filt.iter().any(|(k, v)| &dim_value(k, &ts, &l, &row, &ctx) != v) {
                continue;
            }
            let qty = l["qty"].as_f64().unwrap_or(0.0);
            let gross = l["unit"].as_f64().unwrap_or(0.0) * qty;
            let disc = gross * l["disc"]["pct"].as_f64().unwrap_or(0.0) / 100.0;
            let vat = l["vat"].as_f64().unwrap_or(20.0);
            let net = (gross - disc) / (1.0 + vat / 100.0);
            let ek = a.and_then(|x| x.3).map(|c| c as f64 / 100.0 * qty).unwrap_or(0.0);
            let key: Vec<String> = dims.iter().map(|dm| dim_value(dm, &ts, &l, &row, &ctx)).collect();
            for g in [agg.entry(key).or_default(), &mut total] {
                g.menge += sign * qty;
                g.umsatz += sign * (gross - disc);
                g.rabatt += sign * disc;
                g.netto += sign * net;
                g.ek += sign * ek;
                if sign > 0.0 {
                    g.bons.insert(no.clone());
                }
            }
        }
    }
    let out_row = |k: Vec<String>, g: &Agg| json!({ "keys": k, "menge": g.menge, "umsatz": (g.umsatz * 100.0).round() / 100.0, "rabatt": (g.rabatt * 100.0).round() / 100.0,
        "netto": (g.netto * 100.0).round() / 100.0, "ek": (g.ek * 100.0).round() / 100.0, "rohertrag": ((g.netto - g.ek) * 100.0).round() / 100.0, "bons": g.bons.len() });
    let mut rows: Vec<Value> = agg.iter().map(|(k, g)| out_row(k.clone(), g)).collect();
    rows.sort_by(|a, b| b["umsatz"].as_f64().partial_cmp(&a["umsatz"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
    Ok(json!({ "dims": dims, "rows": rows, "summe": out_row(vec![], &total) }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamm_zeiten_analyse() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        save(&c, "marke", &[json!({ "id": "NW", "name": "Nordwand" }), json!({ "id": "FI", "name": "Firn", "_aktiv": false })]).unwrap();
        assert!(save(&c, "marke", &[json!({ "id": "A" }), json!({ "id": "a" })]).is_err());
        let l = list(&c, "marke").unwrap();
        assert_eq!((l.len(), l[1]["_aktiv"].as_bool().unwrap()), (2, false));
        assert_eq!(zeit_stempel(&c, "dh").unwrap()["status"], "gekommen");
        assert_eq!(zeit_stempel(&c, "dh").unwrap()["status"], "gegangen");
        assert_eq!(zeit_list(&c, "0000", "9999").unwrap().len(), 1);
        c.execute("INSERT INTO articles(id, name, category, brand, price, cost, created_at, updated_at) VALUES ('A1','Jacke','jacken','Nordwand',12000,5000,'x','x')", []).unwrap();
        c.execute("INSERT INTO sales(beleg_no, ts, total, cashier, data) VALUES ('1','2026-10-01T10:00:00','12000','Lena', ?1)", [json!({ "lines": [{ "sku": "A1", "name": "Jacke", "qty": 2, "unit": 60.0, "vat": 20 }] }).to_string()]).unwrap();
        c.execute("INSERT INTO sales(beleg_no, ts, total, cashier, data) VALUES ('2','2026-10-02T10:00:00','-6000','Lena', ?1)", [json!({ "kind": "retoure", "lines": [{ "sku": "A1", "name": "Jacke", "qty": 1, "unit": 60.0, "vat": 20 }] }).to_string()]).unwrap();
        let r = analyse(&c, &json!({ "dims": ["marke"], "von": "2026-10-01", "bis": "2026-10-31" })).unwrap();
        assert_eq!(r["rows"][0]["keys"][0], "Nordwand");
        assert_eq!(r["rows"][0]["menge"], 1.0);
        assert_eq!(r["rows"][0]["umsatz"], 60.0);
        assert_eq!(r["rows"][0]["rohertrag"], 0.0);
        // Filialgruppe und Haus-Typ aus Stammdaten › Filialen
        let own = crate::verbund::own_store(&c);
        save(&c, "filiale", &[json!({ "id": own, "name": "Zentrale", "haustyp": "Fachgeschäft" })]).unwrap();
        save(&c, "filialgruppe", &[json!({ "id": "G1", "name": "West", "filialen": [own] })]).unwrap();
        let r = analyse(&c, &json!({ "dims": ["filialgruppe", "haustyp"], "von": "2026-10-01", "bis": "2026-10-31" })).unwrap();
        assert_eq!((r["rows"][0]["keys"][0].as_str(), r["rows"][0]["keys"][1].as_str()), (Some("West"), Some("Fachgeschäft")));
    }

    /// Belege mit je einer Position: (Artikel, Größe, Einzelpreis) → Datenbank mit Warengruppen adv-1 … adv-3
    fn db_mit_positionen(pos: &[(&str, &str, f64)]) -> Connection {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        for (id, cat) in [("A1", "adv-1"), ("A2", "adv-2"), ("A3", "adv-3")] {
            c.execute("INSERT INTO articles(id, name, category, brand, price, cost, created_at, updated_at) VALUES (?1,'Ding',?2,'Nordwand',1000,500,'x','x')", params![id, cat]).unwrap();
        }
        for (i, (sku, groesse, preis)) in pos.iter().enumerate() {
            let data = json!({ "lines": [{ "sku": sku, "name": "Ding", "s": groesse, "qty": 1, "unit": preis, "vat": 20 }] });
            c.execute("INSERT INTO sales(beleg_no, ts, total, cashier, data) VALUES (?1,'2026-10-01T10:00:00','0','Lena', ?2)", params![format!("B{i}"), data.to_string()]).unwrap();
        }
        c
    }

    fn werte(c: &Connection, dim: &str, filter: Value) -> Vec<(String, f64)> {
        let r = analyse(c, &json!({ "dims": [dim], "filter": filter, "von": "2026-10-01", "bis": "2026-10-31" })).unwrap();
        let mut v: Vec<(String, f64)> = r["rows"].as_array().unwrap().iter().map(|x| (x["keys"][0].as_str().unwrap().to_string(), x["menge"].as_f64().unwrap())).collect();
        v.sort_by(|a, b| a.0.cmp(&b.0));
        v
    }

    #[test]
    fn preislage_nach_baendern_des_schluessels_der_warengruppe() {
        let c = db_mit_positionen(&[("A1", "", 8.0), ("A2", "", 60.0), ("A3", "", 20.0), ("A3", "", 150.0), ("A9", "", 12.0)]);
        // ohne Bänder in der Tabelle: feste Einteilung wie bisher
        let fest: Vec<String> = werte(&c, "preislage", json!({})).into_iter().map(|x| x.0).collect();
        assert_eq!(fest, vec!["€ 0–25", "€ 100–200", "€ 50–100"]);
        // Warengruppen: adv-1 Socken (eigener Schlüssel), adv-2 Ski (STANDARD), adv-3 ohne Schlüssel, adv-4 mit Schlüssel ohne eigene Bänder
        save(&c, "preislagenschluessel", &[json!({ "id": "STANDARD", "name": "Standard" }), json!({ "id": "SOCKEN", "name": "Socken" }), json!({ "id": "LEER", "name": "Ohne Bänder" })]).unwrap();
        save(
            &c,
            "warengruppe",
            &[json!({ "id": "adv-1", "name": "Socken", "preislage": "SOCKEN" }), json!({ "id": "adv-2", "name": "Ski", "preislage": "STANDARD" }), json!({ "id": "adv-3", "name": "Mützen" })],
        )
        .unwrap();
        // nur Bänder ohne Schlüssel (= STANDARD): alle Warengruppen nehmen diese; Positionen ohne Artikel (Dienstleistung) ebenfalls
        save(&c, "preislage", &[json!({ "id": "P1", "name": "Einstieg", "von": 0, "bis": 49.99 }), json!({ "id": "P2", "name": "Mitte", "von": 50, "bis": 149.99 }), json!({ "id": "P3", "von": 150, "bis": 99999 })]).unwrap();
        let w = werte(&c, "preislage", json!({}));
        assert_eq!(w, vec![("Einstieg".to_string(), 3.0), ("Mitte".to_string(), 1.0), ("ab € 150".to_string(), 1.0)]);
        // eigene Bänder für SOCKEN (Schlüssel als Kennung); die anderen bleiben bei STANDARD
        save(
            &c,
            "preislage",
            &[
                json!({ "id": "P1", "name": "Einstieg", "von": 0, "bis": 49.99 }),
                json!({ "id": "P2", "name": "Mitte", "von": 50, "bis": 149.99 }),
                json!({ "id": "S1", "name": "Günstig", "von": 0, "bis": 9.99, "schluessel": "SOCKEN" }),
                json!({ "id": "S2", "von": 10, "bis": 19.5, "schluessel": "Socken" }),
                json!({ "id": "X", "name": "gesperrt", "von": 0, "bis": 99999, "schluessel": "SOCKEN", "_aktiv": false }),
            ],
        )
        .unwrap();
        let w = werte(&c, "preislage", json!({}));
        // 8 € Socken → Günstig; 60 € Ski → Mitte; 20 € / 150 € Mützen und 12 € ohne Artikel → STANDARD (150 € liegt über allen Bändern)
        assert_eq!(w, vec![("Einstieg".to_string(), 2.0), ("Günstig".to_string(), 1.0), ("Mitte".to_string(), 1.0), ("ohne Preislage".to_string(), 1.0)]);
        // Filter auf eine Preislage greift mit denselben Bändern
        assert_eq!(werte(&c, "warengruppe", json!({ "preislage": "Günstig" })), vec![("adv-1".to_string(), 1.0)]);
        assert_eq!(werte(&c, "preislage", json!({ "warengruppe": "adv-1" })), vec![("Günstig".to_string(), 1.0)]);
        // ein Band ohne Namen heißt „€ von–bis“ (S2 steht mit dem Klartext „Socken“ statt der Kennung)
        c.execute("UPDATE sales SET data = replace(data, '\"unit\":8.0', '\"unit\":12.5') WHERE beleg_no = 'B0'", []).unwrap();
        assert_eq!(werte(&c, "preislage", json!({ "warengruppe": "adv-1" })), vec![("€ 10–19,50".to_string(), 1.0)]);
        // Schlüssel ohne eigene Bänder und ohne STANDARD-Bänder: feste Einteilung
        save(&c, "preislage", &[json!({ "id": "S1", "name": "Günstig", "von": 0, "bis": 9.99, "schluessel": "SOCKEN" })]).unwrap();
        let w = werte(&c, "preislage", json!({ "warengruppe": "adv-2" }));
        assert_eq!(w, vec![("€ 50–100".to_string(), 1.0)]);
    }

    #[test]
    fn statistik_groesse_ueber_das_set_der_warengruppe() {
        let c = db_mit_positionen(&[("A1", "36 2/3", 50.0), ("A1", "37  1/3", 50.0), ("A1", "38", 50.0), ("A1", "xxl", 50.0), ("A2", "36 2/3", 50.0), ("A3", "36 2/3", 50.0)]);
        // ohne Sets: Roh-Größe
        assert_eq!(werte(&c, "statgroesse", json!({})).len(), 4);
        save(&c, "statgroessenset", &[json!({ "id": "SCHUH", "name": "Schuhe", "zuordnung": ["36 2/3=37", "37 1/3 = 37", "XXL=XL"] }), json!({ "id": "TXT", "name": "Text", "zuordnung": "36 2/3=Kleinschuh; 38=Mittel" })]).unwrap();
        save(
            &c,
            "warengruppe",
            &[json!({ "id": "adv-1", "name": "Schuhe", "statgroessen": "SCHUH" }), json!({ "id": "adv-2", "name": "Boots", "statgroessen": "Text" }), json!({ "id": "adv-3", "name": "Ohne Set" })],
        )
        .unwrap();
        let w = werte(&c, "statgroesse", json!({}));
        // adv-1: 36 2/3 und 37 1/3 → 37 (Leerzeichen/Schreibweise egal), 38 bleibt, xxl → XL; adv-2: Set über den Namen; adv-3: Roh-Größe
        assert_eq!(
            w,
            vec![("36 2/3".to_string(), 1.0), ("37".to_string(), 2.0), ("38".to_string(), 1.0), ("Kleinschuh".to_string(), 1.0), ("XL".to_string(), 1.0)]
        );
        // die Roh-Dimension bleibt erhalten und Filter auf die Statistik-Größe greifen
        assert_eq!(werte(&c, "groesse", json!({})).len(), 4);
        assert_eq!(werte(&c, "warengruppe", json!({ "statgroesse": "37" })), vec![("adv-1".to_string(), 2.0)]);
    }

    #[test]
    fn preislage_band_ohne_von_und_bis_wird_ignoriert() {
        let c = db_mit_positionen(&[("A1", "", 8.0), ("A1", "", 60.0), ("A1", "", 600.0)]);
        save(
            &c,
            "preislage",
            &[
                json!({ "id": "Z1", "name": "Leer" }),                             // weder von noch bis: zählt nicht (sonst 0 bis unendlich)
                json!({ "id": "Z2", "name": "Leerer Text", "von": "", "bis": " " }),
                json!({ "id": "Z3", "name": "Kein Wert", "von": null, "bis": "abc" }),
                json!({ "id": "B1", "name": "Bis 49,99", "bis": "49,99" }),        // nur „bis“: ab 0
                json!({ "id": "P2", "name": "Mitte", "von": 50, "bis": 149.99 }),
                json!({ "id": "P3", "name": "Oben", "von": "150" }),               // nur „von“: nach oben offen
            ],
        )
        .unwrap();
        assert_eq!(werte(&c, "preislage", json!({})), vec![("Bis 49,99".to_string(), 1.0), ("Mitte".to_string(), 1.0), ("Oben".to_string(), 1.0)]);
        // nur Bänder ohne Grenzen: wie keine Bänder (feste Einteilung)
        save(&c, "preislage", &[json!({ "id": "Z1", "name": "Leer" })]).unwrap();
        assert_eq!(werte(&c, "preislage", json!({})).len(), 3);
        assert!(werte(&c, "preislage", json!({})).iter().all(|x| x.0.starts_with('€') || x.0.starts_with("ab €")));
    }

    #[test]
    fn statistik_groesse_mit_komma_in_der_zuordnung() {
        let c = db_mit_positionen(&[("A1", "37,5", 50.0), ("A1", "38", 50.0), ("A2", "37,5", 50.0), ("A2", "36 2/3", 50.0), ("A3", "36 2/3", 50.0), ("A3", "38", 50.0)]);
        save(
            &c,
            "statgroessenset",
            &[
                json!({ "id": "LISTE", "name": "Liste", "zuordnung": ["37,5=38", "36 2/3 = 37"] }),    // Liste: jedes Element ist eine Zuordnung, Komma bleibt Teil der Größe
                json!({ "id": "SEMI", "name": "Semikolon", "zuordnung": "37,5=38;\n36 2/3=37" }),      // Text mit „;“: Komma trennt nicht
                json!({ "id": "ALT", "name": "Altform", "zuordnung": "36 2/3=37, 38=39" }),            // Text ohne „;“: wie bisher auch an „,“
            ],
        )
        .unwrap();
        save(
            &c,
            "warengruppe",
            &[json!({ "id": "adv-1", "name": "Liste", "statgroessen": "LISTE" }), json!({ "id": "adv-2", "name": "Semi", "statgroessen": "SEMI" }), json!({ "id": "adv-3", "name": "Alt", "statgroessen": "ALT" })],
        )
        .unwrap();
        // adv-1: 37,5 und 38 → 38 (2×); adv-2: 37,5 → 38, 36 2/3 → 37; adv-3: 36 2/3 → 37, 38 → 39
        assert_eq!(
            werte(&c, "statgroesse", json!({})),
            vec![("37".to_string(), 2.0), ("38".to_string(), 3.0), ("39".to_string(), 1.0)]
        );
        assert_eq!(werte(&c, "warengruppe", json!({ "statgroesse": "38" })), vec![("adv-1".to_string(), 2.0), ("adv-2".to_string(), 1.0)]);
        // die Zerlegung selbst
        assert_eq!(zuordnungen(&json!(["37,5=38", "a;b"])), vec!["37,5=38", "a;b"]);
        assert_eq!(zuordnungen(&json!("37,5=38;36=37\r\n40=41")), vec!["37,5=38", "36=37", "", "40=41"]);
        assert_eq!(zuordnungen(&json!("36=37,38=39")), vec!["36=37", "38=39"]);
        assert!(zuordnungen(&json!(null)).is_empty());
    }
}
