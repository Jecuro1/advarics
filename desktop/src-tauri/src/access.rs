//! Zugangsprofile (Stammdaten › Benutzer › Zugangsprofil): Anmeldung nur aus einem IP-Bereich und
//! innerhalb der erlaubten Zeiten. Ein Profil gilt für die Personen, die ihm zugeordnet sind;
//! Administratoren sind ausgenommen (so sperrt sich niemand selbst aus). Personen ohne Profil
//! können sich jederzeit und von überall anmelden.
//!
//! Zeiten: „Arbeitstag“ gilt Montag bis Freitag, „Wochenende“ Samstag und Sonntag.
//! Start = Ende (z. B. 00:00–00:00) heißt ganztägig; liegt das Ende vor dem Start, läuft das Fenster
//! über Mitternacht (22:00–06:00). Das Ende gilt bis zum Ende der angegebenen Minute.

use chrono::{Datelike, NaiveDateTime, Timelike};
use rusqlite::Connection;
use serde_json::Value;

/// „192.168.1.20“ → Zahl (für Bereichsvergleiche)
pub fn parse_ip(s: &str) -> Option<u32> {
    let p: Vec<&str> = s.trim().split('.').collect();
    if p.len() != 4 {
        return None;
    }
    let mut n: u32 = 0;
    for x in p {
        if x.is_empty() || x.len() > 3 || !x.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        let v: u32 = x.parse().ok()?;
        if v > 255 {
            return None;
        }
        n = (n << 8) | v;
    }
    Some(n)
}

/// „08:30“ → Minuten seit Mitternacht (leer = 00:00)
fn minutes(s: &str) -> Option<u32> {
    let s = s.trim();
    if s.is_empty() {
        return Some(0);
    }
    let (h, m) = s.split_once(':')?;
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    if h > 23 || m > 59 {
        return None;
    }
    Some(h * 60 + m)
}

/// Liegt `now` (Minuten) im Fenster von…bis? Start = Ende heißt ganztägig, Ende vor Start läuft über Mitternacht.
pub fn time_ok(von: &str, bis: &str, now: u32) -> bool {
    let (a, b) = (minutes(von).unwrap_or(0), minutes(bis).unwrap_or(0));
    if a == b {
        true
    } else if a < b {
        now >= a && now <= b
    } else {
        now >= a || now <= b
    }
}

/// Wirksame Werte eines Profils. Ältere Profile (Wochentage + von/bis) werden übernommen.
struct Eff {
    ip_von: u32,
    ip_bis: u32,
    wt_ok: bool,
    wt: (String, String),
    we_ok: bool,
    we: (String, String),
}

fn s(p: &Value, k: &str) -> Option<String> {
    p[k].as_str().map(|x| x.trim().to_string()).filter(|x| !x.is_empty())
}

fn eff(p: &Value) -> Eff {
    let legacy = p["wt_von"].is_null() && p["we_von"].is_null() && (s(p, "von").is_some() || s(p, "bis").is_some() || p["tage"].as_array().map(|t| !t.is_empty()).unwrap_or(false));
    let ip_von = s(p, "ip_von").and_then(|x| parse_ip(&x)).unwrap_or(0);
    let ip_bis = s(p, "ip_bis").and_then(|x| parse_ip(&x)).unwrap_or(u32::MAX);
    if legacy {
        let tage: Vec<String> = p["tage"].as_array().map(|t| t.iter().filter_map(|x| x.as_str()).map(|x| x.trim().to_lowercase().chars().take(2).collect()).collect()).unwrap_or_default();
        let has = |ds: &[&str]| tage.is_empty() || ds.iter().any(|d| tage.iter().any(|t| t == d));
        let (von, bis) = (s(p, "von").unwrap_or_default(), s(p, "bis").unwrap_or_default());
        return Eff { ip_von, ip_bis, wt_ok: has(&["mo", "di", "mi", "do", "fr"]), wt: (von.clone(), bis.clone()), we_ok: has(&["sa", "so"]), we: (von, bis) };
    }
    Eff {
        ip_von,
        ip_bis,
        wt_ok: p["wt_ok"].as_bool().unwrap_or(true),
        wt: (s(p, "wt_von").unwrap_or_default(), s(p, "wt_bis").unwrap_or_default()),
        we_ok: p["we_ok"].as_bool().unwrap_or(true),
        we: (s(p, "we_von").unwrap_or_default(), s(p, "we_bis").unwrap_or_default()),
    }
}

/// Erlaubt ein Profil die Anmeldung zu diesem Zeitpunkt von diesen Adressen? Err = Begründung.
/// `ips` leer = Adresse unbekannt (z. B. Arbeitsplatz ohne Netzwerk): dann gilt nur die Zeit.
pub fn profile_allows(p: &Value, now: NaiveDateTime, ips: &[u32]) -> Result<(), String> {
    let e = eff(p);
    let weekend = now.weekday().number_from_monday() >= 6;
    let (ok, win, label) = if weekend { (e.we_ok, &e.we, "am Wochenende") } else { (e.wt_ok, &e.wt, "an Arbeitstagen") };
    if !ok {
        return Err(format!("Anmeldung {label} nicht erlaubt (Zugangsprofil)"));
    }
    let m = now.hour() * 60 + now.minute();
    if !time_ok(&win.0, &win.1, m) {
        let show = |x: &str| if x.is_empty() { "00:00".to_string() } else { x.to_string() };
        return Err(format!("Anmeldung {label} nur von {} bis {} Uhr erlaubt (Zugangsprofil)", show(&win.0), show(&win.1)));
    }
    let full = e.ip_von == 0 && e.ip_bis == u32::MAX;
    if !full && !ips.is_empty() && !ips.iter().any(|ip| *ip >= e.ip_von && *ip <= e.ip_bis) {
        return Err("Anmeldung von dieser Adresse aus nicht erlaubt (Zugangsprofil)".into());
    }
    Ok(())
}

/// Darf sich die Person jetzt von diesen Adressen aus anmelden? Mehrere Profile: ein erlaubendes genügt.
pub fn check(c: &Connection, name: &str, role: &str, ips: &[u32], now: NaiveDateTime) -> Result<(), String> {
    if role == "admin" {
        return Ok(());
    }
    let want = name.trim().to_lowercase();
    let is_me = |m: &Value| m.as_str().map(|x| x.trim().to_lowercase() == want).unwrap_or(false);
    let profiles: Vec<Value> = crate::stamm::list(c, "zugangsprofil")
        .unwrap_or_default()
        .into_iter()
        .filter(|p| p["_aktiv"].as_bool().unwrap_or(true) && p["benutzer"].as_array().map(|b| b.iter().any(is_me)).unwrap_or(false))
        .collect();
    if profiles.is_empty() {
        return Ok(());
    }
    let mut first = None;
    for p in &profiles {
        match profile_allows(p, now, ips) {
            Ok(()) => return Ok(()),
            Err(e) => {
                first.get_or_insert(e);
            }
        }
    }
    Err(first.unwrap_or_else(|| "Anmeldung nicht erlaubt (Zugangsprofil)".into()))
}

/// Adresse des Gegenübers als Zahl (IPv4; „::1“ zählt als 127.0.0.1, andere IPv6-Adressen sind unbekannt)
pub fn peer_ip(a: Option<std::net::IpAddr>) -> Vec<u32> {
    match a {
        Some(std::net::IpAddr::V4(v)) => vec![u32::from(v)],
        Some(std::net::IpAddr::V6(v)) => match v.to_ipv4_mapped() {
            Some(m) => vec![u32::from(m)],
            None if v.is_loopback() => vec![u32::from(std::net::Ipv4Addr::LOCALHOST)],
            None => vec![],
        },
        None => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn at(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(y, mo, d).unwrap().and_hms_opt(h, mi, 0).unwrap()
    }
    // 2026-10-12 ist ein Montag, 2026-10-17 ein Samstag
    const MO: (i32, u32, u32) = (2026, 10, 12);
    const SA: (i32, u32, u32) = (2026, 10, 17);

    #[test]
    fn adressen_und_zeiten_lesen() {
        assert_eq!(parse_ip("0.0.0.0"), Some(0));
        assert_eq!(parse_ip("255.255.255.255"), Some(u32::MAX));
        assert_eq!(parse_ip(" 192.168.1.20 "), Some(0xC0A8_0114));
        for bad in ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "a.b.c.d", "1..2.3", "1.2.3.-4", "1.2.3.1000"] {
            assert_eq!(parse_ip(bad), None, "{bad}");
        }
        assert_eq!(minutes(""), Some(0));
        assert_eq!(minutes("08:30"), Some(510));
        assert_eq!(minutes("24:00"), None);
        assert_eq!(minutes("12:60"), None);
        assert_eq!(minutes("abc"), None);
    }

    #[test]
    fn zeitfenster() {
        assert!(time_ok("00:00", "00:00", 777), "Start = Ende: ganztägig");
        assert!(time_ok("", "", 0));
        assert!(time_ok("08:00", "17:00", 8 * 60) && time_ok("08:00", "17:00", 17 * 60), "Grenzen gelten");
        assert!(!time_ok("08:00", "17:00", 7 * 60 + 59) && !time_ok("08:00", "17:00", 17 * 60 + 1));
        // über Mitternacht
        assert!(time_ok("22:00", "06:00", 23 * 60) && time_ok("22:00", "06:00", 5 * 60) && !time_ok("22:00", "06:00", 12 * 60));
        // 08:00 bis 00:00 = bis Mitternacht
        assert!(time_ok("08:00", "00:00", 23 * 60 + 59) && time_ok("08:00", "00:00", 0) && !time_ok("08:00", "00:00", 7 * 60));
    }

    #[test]
    fn profil_prueft_zeit_tagesart_und_adresse() {
        let p = json!({ "ip_von": "192.168.1.0", "ip_bis": "192.168.1.255", "wt_von": "08:00", "wt_bis": "18:00", "we_von": "09:00", "we_bis": "13:00" });
        let lan = [parse_ip("192.168.1.20").unwrap()];
        let fremd = [parse_ip("10.0.0.5").unwrap()];
        assert!(profile_allows(&p, at(MO.0, MO.1, MO.2, 9, 0), &lan).is_ok());
        assert!(profile_allows(&p, at(MO.0, MO.1, MO.2, 19, 0), &lan).unwrap_err().contains("an Arbeitstagen"));
        assert!(profile_allows(&p, at(SA.0, SA.1, SA.2, 10, 0), &lan).is_ok());
        assert!(profile_allows(&p, at(SA.0, SA.1, SA.2, 15, 0), &lan).unwrap_err().contains("am Wochenende"));
        assert!(profile_allows(&p, at(MO.0, MO.1, MO.2, 9, 0), &fremd).unwrap_err().contains("Adresse"));
        assert!(profile_allows(&p, at(MO.0, MO.1, MO.2, 9, 0), &[]).is_ok(), "Adresse unbekannt: nur die Zeit zählt");
        // Standard (alles offen)
        let std = json!({ "ip_von": "0.0.0.0", "ip_bis": "255.255.255.255", "wt_von": "00:00", "wt_bis": "00:00", "we_von": "00:00", "we_bis": "00:00" });
        assert!(profile_allows(&std, at(SA.0, SA.1, SA.2, 3, 0), &fremd).is_ok());
        // Tagesart ganz gesperrt
        let nur_werktags = json!({ "wt_ok": true, "we_ok": false, "wt_von": "00:00", "wt_bis": "00:00" });
        assert!(profile_allows(&nur_werktags, at(SA.0, SA.1, SA.2, 10, 0), &lan).is_err());
        assert!(profile_allows(&nur_werktags, at(MO.0, MO.1, MO.2, 10, 0), &lan).is_ok());
    }

    #[test]
    fn aeltere_profile_mit_wochentagen_gelten_weiter() {
        let p = json!({ "tage": ["Mo", "Di", "Mi", "Do", "Fr"], "von": "08:00", "bis": "17:00" });
        assert!(profile_allows(&p, at(MO.0, MO.1, MO.2, 9, 0), &[]).is_ok());
        assert!(profile_allows(&p, at(MO.0, MO.1, MO.2, 18, 0), &[]).is_err());
        assert!(profile_allows(&p, at(SA.0, SA.1, SA.2, 9, 0), &[]).unwrap_err().contains("am Wochenende"));
        let nur_sa = json!({ "tage": ["Sa"] });
        assert!(profile_allows(&nur_sa, at(SA.0, SA.1, SA.2, 9, 0), &[]).is_ok());
        assert!(profile_allows(&nur_sa, at(MO.0, MO.1, MO.2, 9, 0), &[]).unwrap_err().contains("an Arbeitstagen"));
    }

    #[test]
    fn peer_adressen() {
        assert_eq!(peer_ip(Some("192.168.1.5".parse().unwrap())), vec![0xC0A8_0105]);
        assert_eq!(peer_ip(Some("::1".parse().unwrap())), vec![0x7F00_0001]);
        assert_eq!(peer_ip(Some("::ffff:10.0.0.7".parse().unwrap())), vec![0x0A00_0007]);
        assert!(peer_ip(Some("fe80::1".parse().unwrap())).is_empty());
        assert!(peer_ip(None).is_empty());
    }

    #[test]
    fn anmeldung_je_person_mit_profil() {
        let c = Connection::open_in_memory().unwrap();
        crate::db::migrate(&c).unwrap();
        let rows = [json!({ "id": "p1", "name": "Büro", "benutzer": ["Lena Moser"], "ip_von": "192.168.1.0", "ip_bis": "192.168.1.255", "wt_von": "08:00", "wt_bis": "18:00", "we_von": "00:00", "we_bis": "00:00", "_aktiv": true })];
        crate::stamm::save(&c, "zugangsprofil", &rows).unwrap();
        let lan = [parse_ip("192.168.1.20").unwrap()];
        let fremd = [parse_ip("10.0.0.5").unwrap()];
        let mo9 = at(MO.0, MO.1, MO.2, 9, 0);
        assert!(check(&c, "lena moser", "verkauf", &lan, mo9).is_ok(), "Namensvergleich ohne Groß-/Kleinschreibung");
        assert!(check(&c, "Lena Moser", "verkauf", &fremd, mo9).is_err());
        assert!(check(&c, "Lena Moser", "verkauf", &lan, at(MO.0, MO.1, MO.2, 20, 0)).is_err());
        assert!(check(&c, "Lena Moser", "admin", &fremd, at(MO.0, MO.1, MO.2, 20, 0)).is_ok(), "Administratoren sind ausgenommen");
        assert!(check(&c, "David Huber", "verkauf", &fremd, at(MO.0, MO.1, MO.2, 3, 0)).is_ok(), "ohne Profil: immer erlaubt");
        // Profil deaktiviert → gilt nicht
        let mut aus = rows.clone();
        aus[0]["_aktiv"] = json!(false);
        crate::stamm::save(&c, "zugangsprofil", &aus).unwrap();
        assert!(check(&c, "Lena Moser", "verkauf", &fremd, mo9).is_ok());
    }
}
