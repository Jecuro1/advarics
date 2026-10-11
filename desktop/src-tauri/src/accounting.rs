//! Buchhaltungsexport: Tageslosungen als Buchungszeilen.
//! Logik: Erlöse je Steuersatz an Kassa; unbare Zahlungen von Kassa auf das Geldtransitkonto der
//! Zahlungsart; Gutscheinverkauf/-einlösung über das Gutscheinkonto; Kassenbuch (Einlage/Entnahme).
//! Formate: Buchungsjournal CSV (für BMD, RZL u. a.) und DATEV-Buchungsstapel (Grundspalten).
//! Konten sind einstellbar – die Kontierung bitte mit der Steuerberatung abstimmen.

use crate::db;
use rusqlite::{params, Connection};
use serde_json::Value;
use std::collections::BTreeMap;

pub struct Accounts {
    pub kasse: String,
    pub transit: String,
    pub gutschein: String,
    pub erloes: BTreeMap<i64, String>,
    pub zahlart: BTreeMap<String, String>,
    pub bank: String,
}

pub fn accounts(c: &Connection) -> Accounts {
    let g = |k: &str, d: &str| db::setting_get(c, k).and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_i64().map(|n| n.to_string()))).filter(|s| !s.is_empty()).unwrap_or_else(|| d.to_string());
    let mut erloes = BTreeMap::new();
    erloes.insert(20, g("fibu.erloes20", "4000"));
    erloes.insert(13, g("fibu.erloes13", "4030"));
    erloes.insert(10, g("fibu.erloes10", "4010"));
    erloes.insert(0, g("fibu.erloes0", "4090"));
    let transit = g("fibu.transit", "2880");
    let mut zahlart = BTreeMap::new();
    for m in ["bankomat", "kredit", "apple", "google", "paypal", "klarna"] {
        zahlart.insert(m.to_string(), g(&format!("fibu.zahlart.{m}"), &transit));
    }
    Accounts { kasse: g("fibu.kasse", "2700"), transit, gutschein: g("fibu.gutschein", "3630"), erloes, zahlart, bank: g("fibu.bank", "2800") }
}

#[derive(Debug, Clone)]
pub struct Line {
    pub date: String,
    pub beleg: String,
    pub soll: String,
    pub haben: String,
    pub betrag: i64,
    pub ust: i64,
    pub steuer: i64,
    pub text: String,
}

fn cents(v: &Value) -> i64 {
    (v.as_f64().unwrap_or(0.0) * 100.0).round() as i64
}

/// Buchungszeilen für einen Zeitraum (Datum JJJJ-MM-TT, einschließlich)
pub fn lines(c: &Connection, von: &str, bis: &str) -> Result<Vec<Line>, String> {
    let acc = accounts(c);
    #[derive(Default)]
    struct Day {
        rev: BTreeMap<i64, (i64, i64)>,
        pay: BTreeMap<String, i64>,
        gs_sold: i64,
        gs_redeemed: i64,
        first: String,
        last: String,
    }
    let mut days: BTreeMap<String, Day> = BTreeMap::new();
    let mut st = c
        .prepare("SELECT substr(ts,1,10), beleg_no, kind, data FROM sales WHERE substr(ts,1,10) >= ?1 AND substr(ts,1,10) <= ?2 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = st.query_map(params![von, bis], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?))).map_err(|e| e.to_string())?;
    for r in rows.flatten() {
        let (d, no, kind, data) = r;
        if !["verkauf", "retoure", "storno"].contains(&kind.as_str()) {
            continue;
        }
        let v: Value = serde_json::from_str(&data).unwrap_or(Value::Null);
        let day = days.entry(d).or_default();
        if day.first.is_empty() {
            day.first = no.clone();
        }
        day.last = no;
        for x in v["t"]["vat"].as_array().into_iter().flatten() {
            let e = day.rev.entry(x["rate"].as_i64().unwrap_or(20)).or_insert((0, 0));
            e.0 += cents(&x["gross"]);
            e.1 += cents(&x["tax"]);
        }
        day.gs_sold += cents(&v["t"]["zero"]);
        for p in v["parts"].as_array().into_iter().flatten() {
            let m = p["m"].as_str().unwrap_or("bar").to_string();
            if m == "bar" {
                continue;
            }
            if m == "gutschein" {
                day.gs_redeemed += cents(&p["amount"]);
            } else {
                *day.pay.entry(m).or_insert(0) += cents(&p["amount"]);
            }
        }
    }
    let mut out = vec![];
    let fmt_day = |d: &str| d.to_string();
    for (d, day) in &days {
        let beleg = if day.first == day.last { day.first.clone() } else { format!("{}–{}", day.first, day.last) };
        for (rate, (gross, tax)) in &day.rev {
            if *gross == 0 {
                continue;
            }
            let konto = acc.erloes.get(rate).cloned().unwrap_or_else(|| acc.erloes[&20].clone());
            out.push(Line { date: fmt_day(d), beleg: beleg.clone(), soll: acc.kasse.clone(), haben: konto, betrag: *gross, ust: *rate, steuer: *tax, text: format!("Tageslosung {rate} %") });
        }
        if day.gs_sold != 0 {
            out.push(Line { date: fmt_day(d), beleg: beleg.clone(), soll: acc.kasse.clone(), haben: acc.gutschein.clone(), betrag: day.gs_sold, ust: 0, steuer: 0, text: "Gutscheinverkauf".into() });
        }
        if day.gs_redeemed != 0 {
            out.push(Line { date: fmt_day(d), beleg: beleg.clone(), soll: acc.gutschein.clone(), haben: acc.kasse.clone(), betrag: day.gs_redeemed, ust: 0, steuer: 0, text: "Gutscheineinlösung".into() });
        }
        for (m, amt) in &day.pay {
            if *amt != 0 {
                out.push(Line { date: fmt_day(d), beleg: beleg.clone(), soll: acc.zahlart.get(m).cloned().unwrap_or_else(|| acc.transit.clone()), haben: acc.kasse.clone(), betrag: *amt, ust: 0, steuer: 0, text: format!("Unbar {m}") });
            }
        }
    }
    // Kassenbuch
    let mut st = c.prepare("SELECT substr(ts,1,10), kind, amount, reason FROM cash_moves WHERE kind IN ('einlage','entnahme') AND substr(ts,1,10) >= ?1 AND substr(ts,1,10) <= ?2 ORDER BY id").map_err(|e| e.to_string())?;
    for r in st.query_map(params![von, bis], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, String>(3)?))).map_err(|e| e.to_string())?.flatten() {
        let (d, kind, amount, reason) = r;
        let (soll, haben) = if kind == "einlage" { (acc.kasse.clone(), acc.bank.clone()) } else { (acc.bank.clone(), acc.kasse.clone()) };
        out.push(Line { date: d, beleg: "Kassenbuch".into(), soll, haben, betrag: amount.abs(), ust: 0, steuer: 0, text: format!("{} {}", if kind == "einlage" { "Einlage" } else { "Entnahme" }, reason) });
    }
    out.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(out)
}

fn de(d: &str) -> String {
    let p: Vec<&str> = d.split('-').collect();
    if p.len() == 3 { format!("{}.{}.{}", p[2], p[1], p[0]) } else { d.into() }
}
fn amt(c: i64) -> String {
    format!("{}{},{:02}", if c < 0 { "-" } else { "" }, c.abs() / 100, c.abs() % 100)
}

/// Buchungsjournal (Semikolon-CSV) – für BMD, RZL und andere Programme mit Spaltenzuordnung
pub fn journal_csv(ls: &[Line]) -> String {
    let mut s = String::from("Belegdatum;Belegnummer;Konto (Soll);Gegenkonto (Haben);Betrag brutto;Steuersatz %;Steuer;Buchungstext\r\n");
    for l in ls {
        s.push_str(&format!("{};{};{};{};{};{};{};{}\r\n", de(&l.date), l.beleg, l.soll, l.haben, amt(l.betrag), l.ust, amt(l.steuer), l.text.replace(';', ",")));
    }
    s
}

/// DATEV-Buchungsstapel (EXTF 700, Grundspalten). Beraternummer/Mandant aus den Einstellungen.
pub fn datev(c: &Connection, ls: &[Line], von: &str, bis: &str) -> String {
    let g = |k: &str, d: &str| db::setting_get(c, k).and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_i64().map(|n| n.to_string()))).filter(|s| !s.is_empty()).unwrap_or_else(|| d.to_string());
    let now = chrono::Local::now().format("%Y%m%d%H%M%S000");
    let wj = format!("{}0101", &von[..4]);
    let mut s = format!(
        "\"EXTF\";700;21;\"Buchungsstapel\";13;{now};;\"KO\";\"Kontor\";\"\";{};{};{wj};4;{};{};\"Kassa {von} bis {bis}\";\"\";1;0;0;\"EUR\";;\"\";;;\"\";;;\"\";\"\"\r\n",
        g("fibu.datev.berater", "0"), g("fibu.datev.mandant", "0"), von.replace('-', ""), bis.replace('-', "")
    );
    s.push_str("Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basis-Umsatz;WKZ Basis-Umsatz;Konto;Gegenkonto (ohne BU-Schlüssel);BU-Schlüssel;Belegdatum;Belegfeld 1;Belegfeld 2;Skonto;Buchungstext\r\n");
    for l in ls {
        let ddmm = { let p: Vec<&str> = l.date.split('-').collect(); format!("{}{}", p[2], p[1]) };
        s.push_str(&format!("{};\"S\";\"EUR\";;;;{};{};\"\";{};\"{}\";\"\";;\"{}\"\r\n", amt(l.betrag), l.soll, l.haben, ddmm, l.beleg.chars().take(36).collect::<String>(), l.text.chars().take(60).collect::<String>()));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn tageslosung_und_formate() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let ins = |no: &str, kind: &str, d: Value| c.execute("INSERT INTO sales(beleg_no, ts, total, kind, data) VALUES (?1,'2026-10-11T10:00:00+02:00',0,?2,?3)", params![no, kind, d.to_string()]).unwrap();
        ins("2026-000001", "verkauf", json!({ "t": { "vat": [{ "rate": 20, "gross": 120.0, "tax": 20.0 }], "zero": 50.0 }, "parts": [{ "m": "bar", "amount": 70.0 }, { "m": "bankomat", "amount": 100.0 }] }));
        ins("2026-000002", "retoure", json!({ "t": { "vat": [{ "rate": 20, "gross": -24.0, "tax": -4.0 }], "zero": 0 }, "parts": [{ "m": "bar", "amount": -24.0 }] }));
        ins("2026-000003", "startbeleg", json!({ "t": { "vat": [] } }));
        let l = lines(&c, "2026-10-11", "2026-10-11").unwrap();
        let rev = l.iter().find(|x| x.haben == "4000").unwrap();
        assert_eq!((rev.betrag, rev.steuer), (9600, 1600), "Erlös 20 % netto der Retoure");
        assert!(l.iter().any(|x| x.haben == "3630" && x.betrag == 5000), "Gutscheinverkauf");
        assert!(l.iter().any(|x| x.soll == "2880" && x.haben == "2700" && x.betrag == 10000), "Bankomat über Geldtransit");
        let csv = journal_csv(&l);
        assert!(csv.contains("11.10.2026;2026-000001–2026-000002;2700;4000;96,00;20;16,00;Tageslosung 20 %"));
        let d = datev(&c, &l, "2026-10-11", "2026-10-11");
        assert!(d.starts_with("\"EXTF\";700;21;\"Buchungsstapel\""));
        assert!(d.contains("96,00;\"S\";\"EUR\";;;;2700;4000;\"\";1110;"));
    }
}
