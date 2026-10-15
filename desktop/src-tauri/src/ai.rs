//! Lokale KI – läuft vollständig auf diesem Rechner, keine Daten verlassen das Haus.
//! 1. Absatzprognose je Artikel (Holt-Verfahren auf Wochenwerten der letzten 12 Wochen)
//! 2. Nachbestellvorschläge mit Begründung (Reichweite vs. Lieferzeit)
//! 3. Auffälligkeiten (Retourenquote, Stornos/Rabatte je Kassier:in, Inventurdifferenzen, Preis unter EK,
//!    Ladenhüter, Bestseller kurz vor Ausverkauf)
//! 4. Optional: lokales Sprachmodell über Ollama (z. B. für Artikeltexte und freie Fragen)

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::HashMap;

const WEEKS: i64 = 12;

fn since(days: i64) -> String {
    (chrono::Local::now() - chrono::Duration::days(days)).format("%Y-%m-%dT%H:%M:%S").to_string()
}

/// Wochenabsatz je Artikel (netto: Verkäufe minus Rückgaben), älteste Woche zuerst.
fn weekly(c: &Connection) -> rusqlite::Result<HashMap<String, Vec<f64>>> {
    let start = chrono::Local::now() - chrono::Duration::days(WEEKS * 7);
    let mut st = c.prepare(
        "SELECT a.id, substr(m.ts,1,19), m.delta, m.reason FROM stock_moves m JOIN variants v ON v.id = m.variant_id JOIN articles a ON a.id = v.article_id
         WHERE m.reason IN ('Verkauf','Kundenretoure','Storno') AND substr(m.ts,1,19) >= ?1",
    )?;
    let rows = st.query_map([start.format("%Y-%m-%dT%H:%M:%S").to_string()], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))?;
    let mut out: HashMap<String, Vec<f64>> = HashMap::new();
    for r in rows.flatten() {
        let (id, ts, delta) = r;
        let Ok(t) = chrono::NaiveDateTime::parse_from_str(&ts, "%Y-%m-%dT%H:%M:%S") else { continue };
        let w = ((t - start.naive_local()).num_days() / 7).clamp(0, WEEKS - 1) as usize;
        out.entry(id).or_insert_with(|| vec![0.0; WEEKS as usize])[w] += -delta as f64;
    }
    Ok(out)
}

/// Holt (doppelte exponentielle Glättung) → Prognose je Woche für die nächsten `h` Wochen.
pub fn holt(xs: &[f64], h: usize) -> Vec<f64> {
    let (a, b) = (0.5, 0.3);
    let mut level = xs.first().copied().unwrap_or(0.0);
    let mut trend = if xs.len() > 1 { xs[1] - xs[0] } else { 0.0 };
    for x in xs.iter().skip(1) {
        let prev = level;
        level = a * x + (1.0 - a) * (level + trend);
        trend = b * (level - prev) + (1.0 - b) * trend;
    }
    (1..=h).map(|k| (level + trend * k as f64).max(0.0)).collect()
}

pub fn forecast(c: &Connection) -> Result<Vec<Value>, String> {
    let w = weekly(c).map_err(|e| e.to_string())?;
    let mut st = c.prepare("SELECT a.id, a.name, COALESCE(SUM(v.stock),0) FROM articles a LEFT JOIN variants v ON v.article_id = a.id AND v.active = 1 LEFT JOIN stamm w ON w.kind = 'warengruppe' AND w.id = a.category WHERE a.active = 1 AND COALESCE(json_extract(w.data, '$.service'), 0) = 0 GROUP BY a.id").map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, i64)> = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    let mut out = vec![];
    for (id, name, stock) in rows {
        let xs = w.get(&id).cloned().unwrap_or_else(|| vec![0.0; WEEKS as usize]);
        let total: f64 = xs.iter().sum();
        if total <= 0.0 {
            continue;
        }
        let f = holt(&xs, 4);
        let next4: f64 = f.iter().sum();
        let recent: f64 = xs[xs.len() - 4..].iter().sum();
        let before: f64 = xs[xs.len() - 8..xs.len() - 4].iter().sum();
        let trend = if before > 0.0 { (recent / before - 1.0) * 100.0 } else { 0.0 };
        let daily = (next4 / 28.0).max(total / (WEEKS as f64 * 7.0) * 0.5);
        out.push(json!({ "id": id, "name": name, "weeks": xs, "next4": (next4 * 10.0).round() / 10.0, "trend": trend.round(), "stock": stock,
            "cover_days": if daily > 0.0 { (stock as f64 / daily).round() } else { 9999.0 }, "daily": daily }));
    }
    out.sort_by(|a, b| b["next4"].as_f64().partial_cmp(&a["next4"].as_f64()).unwrap());
    Ok(out)
}

/// Nachbestellvorschläge je Variante mit Begründung.
pub fn reorder(c: &Connection) -> Result<Vec<Value>, String> {
    let fc = forecast(c)?;
    let by: HashMap<String, &Value> = fc.iter().map(|f| (f["id"].as_str().unwrap().to_string(), f)).collect();
    // Anteil je Variante am Abverkauf (90 Tage), sonst gleich verteilt
    let mut share: HashMap<i64, f64> = HashMap::new();
    {
        let mut st = c.prepare("SELECT variant_id, -SUM(delta) FROM stock_moves WHERE reason = 'Verkauf' AND substr(ts,1,19) >= ?1 GROUP BY variant_id").map_err(|e| e.to_string())?;
        for r in st.query_map([since(90)], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?))).map_err(|e| e.to_string())?.flatten() {
            share.insert(r.0, r.1);
        }
    }
    let mut st = c
        .prepare(
            "SELECT v.id, a.id, a.name, v.color, v.size, v.stock, COALESCE(s.lead_days, 7), COALESCE(a.supplier_id,''),
               (SELECT COALESCE(SUM(l.qty - l.received),0) FROM po_lines l JOIN purchase_orders p ON p.id = l.po_id WHERE l.variant_id = v.id AND p.status IN ('entwurf','bestellt','teilgeliefert'))
             FROM variants v JOIN articles a ON a.id = v.article_id LEFT JOIN suppliers s ON s.id = a.supplier_id LEFT JOIN stamm w ON w.kind = 'warengruppe' AND w.id = a.category
             WHERE v.active = 1 AND a.active = 1 AND COALESCE(s.active, 1) = 1 AND COALESCE(json_extract(s.profile, '$.order_vorschlag'), 1) <> 0
               AND COALESCE(json_extract(w.data, '$.service'), 0) = 0",   // Service-Warengruppen (Dienstleistungen) werden nie nachbestellt
        )
        .map_err(|e| e.to_string())?;
    let vars: Vec<(i64, String, String, String, String, i64, i64, String, i64)> = st
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    let mut per_art: HashMap<String, (f64, usize)> = HashMap::new();
    for v in &vars {
        let e = per_art.entry(v.1.clone()).or_insert((0.0, 0));
        e.0 += share.get(&v.0).copied().unwrap_or(0.0);
        e.1 += 1;
    }
    let mut out = vec![];
    for (vid, aid, name, color, size, stock, lead, sup, open) in vars {
        let Some(f) = by.get(&aid) else { continue };
        let (sum, n) = per_art[&aid];
        let sh = if sum > 0.0 { share.get(&vid).copied().unwrap_or(0.0) / sum } else { 1.0 / n as f64 };
        let daily = f["daily"].as_f64().unwrap_or(0.0) * sh;
        if daily <= 0.0 {
            continue;
        }
        let need_days = lead as f64 + 28.0;
        let avail = (stock + open) as f64;
        let cover = avail / daily;
        if cover >= lead as f64 + 7.0 {
            continue;
        }
        let qty = (daily * need_days - avail).ceil().max(1.0) as i64;
        out.push(json!({ "variant_id": vid, "article_id": aid, "name": name, "color": color, "size": size, "stock": stock, "open": open, "qty": qty, "supplier_id": sup,
            "cover_days": cover.round(), "lead_days": lead,
            "reason": format!("Prognose {:.1} Stk./Woche ({}{} % Trend), Reichweite {} Tage bei {} Tagen Lieferzeit – deckt mit {} Stk. die nächsten {} Tage",
                daily * 7.0, if f["trend"].as_f64().unwrap_or(0.0) >= 0.0 { "+" } else { "" }, f["trend"], cover.round(), lead, qty, need_days) }));
    }
    out.sort_by(|a, b| a["cover_days"].as_f64().partial_cmp(&b["cover_days"].as_f64()).unwrap());
    Ok(out)
}

/// Auffälligkeiten und Hinweise
pub fn insights(c: &Connection) -> Result<Vec<Value>, String> {
    let mut out = vec![];
    let s90 = since(90);
    // 1 · Retourenquote je Artikel
    let mut st = c
        .prepare(
            "SELECT a.id, a.name, SUM(CASE WHEN m.reason='Verkauf' THEN -m.delta ELSE 0 END), SUM(CASE WHEN m.reason IN ('Kundenretoure','Storno') THEN m.delta ELSE 0 END)
             FROM stock_moves m JOIN variants v ON v.id = m.variant_id JOIN articles a ON a.id = v.article_id WHERE substr(m.ts,1,19) >= ?1 GROUP BY a.id",
        )
        .map_err(|e| e.to_string())?;
    let rr: Vec<(String, String, i64, i64)> = st.query_map([&s90], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    let (ts, tr): (i64, i64) = rr.iter().fold((0, 0), |a, r| (a.0 + r.2, a.1 + r.3));
    for (id, name, sold, ret) in &rr {
        if *sold >= 5 {
            let q = *ret as f64 / *sold as f64;
            // Vergleich mit allen anderen Artikeln (ohne diesen); ohne Vergleichsdaten branchenüblich ~4 %
            let base = if ts - sold > 0 { (tr - ret) as f64 / (ts - sold) as f64 } else { 0.04 };
            if q >= 0.15 && q > base * 2.0 {
                let z = (q - base) / ((base.max(0.02) * (1.0 - base.max(0.02))) / *sold as f64).sqrt();
                out.push(json!({ "id": format!("ret-{id}"), "tone": "warn", "icon": "alert", "title": "Auffällige Retourenquote", "confidence": (60.0 + z * 8.0).min(97.0).round(),
                    "text": format!("{name}: {:.0} % Retouren ({ret} von {sold}) in 90 Tagen, Durchschnitt {:.0} %. Retourengründe prüfen (z. B. Größe).", q * 100.0, base * 100.0),
                    "action": { "label": "Artikel öffnen", "kind": "artikel", "ref": id } }));
            }
        }
    }
    // 2 · Stornos/Retouren und Rabatte je Kassier:in
    let mut st = c
        .prepare("SELECT cashier, SUM(kind='verkauf'), SUM(kind IN ('storno','retoure')), AVG(CASE WHEN kind='verkauf' THEN json_extract(data,'$.t.disc') * 1.0 / NULLIF(json_extract(data,'$.t.sub'),0) END) FROM sales WHERE substr(ts,1,19) >= ?1 AND cashier IS NOT NULL GROUP BY cashier")
        .map_err(|e| e.to_string())?;
    let cs: Vec<(String, i64, i64, Option<f64>)> = st.query_map([&s90], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    let tot_s: i64 = cs.iter().map(|x| x.1).sum();
    let tot_r: i64 = cs.iter().map(|x| x.2).sum();
    let avg = if tot_s > 0 { tot_r as f64 / tot_s as f64 } else { 0.0 };
    for (name, s, r, _) in &cs {
        if *r >= 3 && cs.len() > 1 && (*r as f64 / (*s).max(1) as f64) > avg * 2.0 {
            out.push(json!({ "id": format!("sto-{name}"), "tone": "warn", "icon": "shield", "title": "Viele Stornos/Retouren", "confidence": 70,
                "text": format!("{name}: {r} Stornos/Retouren auf {s} Verkäufe (Ø aller {:.0} %). Kann Zufall sein – Protokoll ansehen.", avg * 100.0),
                "action": { "label": "Belege ansehen", "kind": "belege", "ref": name } }));
        }
    }
    // 3 · Inventurdifferenzen
    if let Ok((no, res)) = c.query_row("SELECT no, result FROM inventories WHERE status='abgeschlossen' ORDER BY id DESC LIMIT 1", [], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))) {
        let v: Value = serde_json::from_str(&res).unwrap_or(Value::Null);
        let vk = v["value_vk"].as_i64().unwrap_or(0);
        if vk < -10000 {
            out.push(json!({ "id": format!("inv-{no}"), "tone": "warn", "icon": "boxes", "title": "Inventurdifferenz", "confidence": 90,
                "text": format!("Inventur {no}: {} Stück weniger als erwartet, {:.2} € Verkaufswert. Schwund oder Fehlbuchungen prüfen.", v["minus"], vk as f64 / 100.0),
                "action": { "label": "Inventur ansehen", "kind": "inventur", "ref": no } }));
        }
    }
    // 4 · Preis unter Einkaufspreis
    let mut st = c.prepare("SELECT id, name, COALESCE(sale_price, price), vat, cost FROM articles WHERE active = 1 AND cost IS NOT NULL AND cost > 0").map_err(|e| e.to_string())?;
    for r in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?, r.get::<_, i64>(4)?))).map_err(|e| e.to_string())?.flatten() {
        let net = r.2 as f64 / (1.0 + r.3 as f64 / 100.0);
        if net < r.4 as f64 {
            out.push(json!({ "id": format!("ek-{}", r.0), "tone": "neg", "icon": "tag", "title": "Verkauf unter Einkaufspreis", "confidence": 99,
                "text": format!("{}: netto {:.2} € liegt unter dem EK von {:.2} €.", r.1, net / 100.0, r.4 as f64 / 100.0),
                "action": { "label": "Artikel öffnen", "kind": "artikel", "ref": r.0 } }));
        }
    }
    // 5 · Bestseller kurz vor Ausverkauf · 6 · Ladenhüter
    let fc = forecast(c)?;
    for f in fc.iter().take(30) {
        let cd = f["cover_days"].as_f64().unwrap_or(999.0);
        if cd < 7.0 && f["next4"].as_f64().unwrap_or(0.0) >= 2.0 {
            out.push(json!({ "id": format!("cov-{}", f["id"].as_str().unwrap()), "tone": "accent", "icon": "truck", "title": "Bestseller bald ausverkauft", "confidence": 80,
                "text": format!("{}: Bestand {} reicht laut Prognose nur noch ca. {} Tage ({:.0} Stk. in 4 Wochen erwartet).", f["name"].as_str().unwrap(), f["stock"], cd, f["next4"].as_f64().unwrap()),
                "action": { "label": "Nachbestellen", "kind": "einkauf", "ref": f["id"] } }));
        }
    }
    let mut st = c
        .prepare(
            "SELECT a.id, a.name, SUM(v.stock), SUM(v.stock) * COALESCE(a.sale_price, a.price) FROM articles a JOIN variants v ON v.article_id = a.id LEFT JOIN stamm w ON w.kind = 'warengruppe' AND w.id = a.category
             WHERE a.active = 1 AND v.active = 1 AND COALESCE(json_extract(w.data, '$.service'), 0) = 0 GROUP BY a.id HAVING SUM(v.stock) > 0
             AND NOT EXISTS (SELECT 1 FROM stock_moves m JOIN variants v2 ON v2.id = m.variant_id WHERE v2.article_id = a.id AND m.reason = 'Verkauf' AND substr(m.ts,1,19) >= ?1)
             AND EXISTS (SELECT 1 FROM stock_moves m JOIN variants v3 ON v3.id = m.variant_id WHERE v3.article_id = a.id AND substr(m.ts,1,19) < ?1)
             ORDER BY 4 DESC LIMIT 3",
        )
        .map_err(|e| e.to_string())?;
    for r in st.query_map(params![since(60)], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?))).map_err(|e| e.to_string())?.flatten() {
        out.push(json!({ "id": format!("dead-{}", r.0), "tone": "info", "icon": "clock", "title": "Ladenhüter", "confidence": 75,
            "text": format!("{}: {} Stück ({:.0} € VK) seit 60 Tagen ohne Verkauf. Preisaktion oder Umlagerung erwägen.", r.1, r.2, r.3 as f64 / 100.0),
            "action": { "label": "Preisaktion", "kind": "aktion", "ref": r.0 } }));
    }
    Ok(out)
}

/* ── Lokales Sprachmodell (Ollama) ── */

pub fn llm(url: &str, model: &str, system: &str, prompt: &str) -> Result<String, String> {
    let base = url.trim().trim_end_matches('/');
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(180)).build();
    let r: Value = agent
        .post(&format!("{base}/api/generate"))
        .send_json(json!({ "model": model, "system": system, "prompt": prompt, "stream": false, "options": { "temperature": 0.4 } }))
        .map_err(|e| format!("Lokales KI-Modell nicht erreichbar ({base}): {e}"))?
        .into_json()
        .map_err(|e| e.to_string())?;
    r["response"].as_str().map(|s| s.trim().to_string()).ok_or_else(|| "Keine Antwort vom Modell".into())
}

pub fn llm_models(url: &str) -> Result<Vec<String>, String> {
    let base = url.trim().trim_end_matches('/');
    let r: Value = ureq::get(&format!("{base}/api/tags")).timeout(std::time::Duration::from_secs(5)).call().map_err(|e| format!("Ollama nicht erreichbar: {e}"))?.into_json().map_err(|e| e.to_string())?;
    Ok(r["models"].as_array().into_iter().flatten().filter_map(|m| m["name"].as_str().map(str::to_string)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{catalog, db};

    #[test]
    fn prognose_nachbestellung_auffaelligkeiten() {
        assert_eq!(holt(&[0.0; 12], 4), vec![0.0; 4]);
        let up = holt(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0], 2);
        assert!(up[0] > 8.0 && up[1] > up[0], "steigender Trend wird fortgeschrieben: {up:?}");
        let mut c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let a: catalog::Article = serde_json::from_value(json!({ "id": "A1", "name": "Jacke", "category": "jacken", "price": 12000, "vat": 20, "cost": 11000,
            "colors": ["moos"], "sizes": ["M"], "variants": [{ "color": "moos", "size": "M", "ean": "2000000000015" }] })).unwrap();
        let tx = c.transaction().unwrap();
        catalog::save(&tx, &a).unwrap();
        catalog::book(&tx, 1, 30, true, "Anfang", None, None).unwrap();
        // 12 Wochen lang je 2 Verkäufe, 4 Retouren gesamt
        for w in 0..12 {
            for _ in 0..2 {
                tx.execute("INSERT INTO stock_moves(ts, variant_id, delta, stock_after, reason) VALUES (?1, 1, -1, 0, 'Verkauf')", [(chrono::Local::now() - chrono::Duration::days(w * 7 + 1)).format("%Y-%m-%dT%H:%M:%S").to_string()]).unwrap();
            }
        }
        for _ in 0..6 {
            tx.execute("INSERT INTO stock_moves(ts, variant_id, delta, stock_after, reason) VALUES (?1, 1, 1, 0, 'Kundenretoure')", [since(3)]).unwrap();
        }
        tx.execute("UPDATE variants SET stock = 1", []).unwrap();
        tx.commit().unwrap();
        let f = forecast(&c).unwrap();
        assert_eq!(f[0]["id"], json!("A1"));
        let r = reorder(&c).unwrap();
        assert_eq!(r.len(), 1, "Reichweite kurz → Vorschlag");
        assert!(r[0]["qty"].as_i64().unwrap() > 0 && r[0]["reason"].as_str().unwrap().contains("Lieferzeit"));
        let ins = insights(&c).unwrap();
        let ids: Vec<&str> = ins.iter().map(|i| i["id"].as_str().unwrap()).collect();
        assert!(ids.contains(&"ret-A1"), "{ids:?}");
        assert!(ids.contains(&"ek-A1"), "netto 100 € < EK 110 €: {ids:?}");
    }
}
