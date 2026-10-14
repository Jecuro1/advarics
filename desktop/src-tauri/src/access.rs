//! Zugangsprofile (Stammdaten › Benutzer › Zugangsprofil): Anmeldung nur aus einem IP-Bereich und
//! innerhalb der erlaubten Zeiten. Ein Profil gilt für die Personen, die ihm zugeordnet sind;
//! Administratoren sind ausgenommen (so sperrt sich niemand selbst aus). Personen ohne Profil
//! gehören zum Standardprofil: jederzeit und von überall.
//!
//! Tage: Das Profil nennt die erlaubten Wochentage (leer = alle). „Arbeitstag“ ist die Zeit für Montag bis
//! Freitag, „Wochenende“ die Zeit für Samstag und Sonntag.
//! Zeiten: Die Start-Zeit ist die erste erlaubte Minute, die End-Zeit die erste Minute, ab der man sich nicht
//! mehr anmelden darf. Start = Ende (z. B. 00:00–00:00) heißt ganztägig; liegt das Ende vor dem Start, läuft das
//! Fenster über Mitternacht (22:00–06:00) und gehört zum Tag, an dem es beginnt.
//! Maßgeblich ist die Uhr dieses Rechners.

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

/// „08:30“ → Minuten seit Mitternacht (leer = 00:00). Streng: ein- oder zweistellige Stunde, zweistellige Minute.
fn minutes(s: &str) -> Option<u32> {
    let s = s.trim();
    if s.is_empty() {
        return Some(0);
    }
    let (h, m) = s.split_once(':')?;
    if h.is_empty() || h.len() > 2 || m.len() != 2 || !h.bytes().all(|b| b.is_ascii_digit()) || !m.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    if h > 23 || m > 59 {
        return None;
    }
    Some(h * 60 + m)
}

/// Gehört die Minute zum Beginn-Teil des Fensters von…bis? Start = Ende heißt ganztägig. Bei einem Fenster über
/// Mitternacht (Ende vor Start) zählt hier nur der Teil ab dem Start; der Rest gehört zum Folgetag (siehe `carry`).
fn starts_in(von: u32, bis: u32, now: u32) -> bool {
    if von == bis {
        true
    } else if von < bis {
        now >= von && now < bis
    } else {
        now >= von
    }
}

/// Wirksame Werte eines Profils. Ältere Profile (Wochentage + von/bis) werden unverändert übernommen.
struct Eff {
    ip_von: u32,
    ip_bis: u32,
    /// erlaubte Wochentage, Montag = 0 … Sonntag = 6
    days: [bool; 7],
    wt: (u32, u32),
    we: (u32, u32),
    wt_txt: (String, String),
    we_txt: (String, String),
}

fn s(p: &Value, k: &str) -> Option<String> {
    p[k].as_str().map(|x| x.trim().to_string()).filter(|x| !x.is_empty())
}

fn eff(p: &Value) -> Eff {
    let ip_von = s(p, "ip_von").and_then(|x| parse_ip(&x)).unwrap_or(0);
    let ip_bis = s(p, "ip_bis").and_then(|x| parse_ip(&x)).unwrap_or(u32::MAX);
    let mut days = [true; 7];
    let tage: Vec<String> = p["tage"].as_array().map(|t| t.iter().filter_map(|x| x.as_str()).map(|x| x.trim().to_lowercase().chars().take(2).collect()).collect()).unwrap_or_default();
    if !tage.is_empty() {
        const N: [&str; 7] = ["mo", "di", "mi", "do", "fr", "sa", "so"];
        for (i, n) in N.iter().enumerate() {
            days[i] = tage.iter().any(|t| t == n);
        }
    }
    // Schalter der Fassung 0.39.0 („Anmeldung erlaubt“ je Tagesart)
    if p["wt_ok"].as_bool() == Some(false) {
        days[..5].iter_mut().for_each(|d| *d = false);
    }
    if p["we_ok"].as_bool() == Some(false) {
        days[5..].iter_mut().for_each(|d| *d = false);
    }
    let win = |a: &str, b: &str| -> ((u32, u32), (String, String)) {
        let (von, bis) = (s(p, a).or_else(|| s(p, "von")).unwrap_or_default(), s(p, b).or_else(|| s(p, "bis")).unwrap_or_default());
        ((minutes(&von).unwrap_or(0), minutes(&bis).unwrap_or(0)), (von, bis))
    };
    let (wt, wt_txt) = win("wt_von", "wt_bis");
    let (we, we_txt) = win("we_von", "we_bis");
    Eff { ip_von, ip_bis, days, wt, we, wt_txt, we_txt }
}

const TAGE: [&str; 7] = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

/// Erlaubt ein Profil die Anmeldung zu diesem Zeitpunkt von diesen Adressen? Err = Begründung.
/// `ips`: None = Adresse unbekannt und nicht prüfbar (Arbeitsplatz ohne Netzwerk); Some(Liste) = die Adressen des
/// Gegenübers – eine leere Liste (z. B. nicht zuordenbare IPv6-Adresse) gilt bei eingeschränktem Bereich als nicht erlaubt.
pub fn profile_allows(p: &Value, now: NaiveDateTime, ips: Option<&[u32]>) -> Result<(), String> {
    let e = eff(p);
    let wd = now.weekday().num_days_from_monday() as usize;
    let m = now.hour() * 60 + now.minute();
    let win = |d: usize| if d >= 5 { e.we } else { e.wt };
    let label = |d: usize| if d >= 5 { "am Wochenende" } else { "an Arbeitstagen" };
    // Beginn-Teil des heutigen Fensters, oder der Rest eines Fensters über Mitternacht von gestern
    let y = (wd + 6) % 7;
    let heute = e.days[wd] && starts_in(win(wd).0, win(wd).1, m);
    let carry = e.days[y] && win(y).0 > win(y).1 && m < win(y).1;
    if !heute && !carry {
        if !e.days[wd] {
            return Err(format!("Anmeldung am {} nicht erlaubt (Zugangsprofil)", TAGE[wd]));
        }
        let (von, bis) = if wd >= 5 { &e.we_txt } else { &e.wt_txt };
        let show = |x: &String| if x.is_empty() { "00:00".to_string() } else { x.clone() };
        return Err(format!("Anmeldung {} nur von {} bis {} Uhr erlaubt (Zugangsprofil)", label(wd), show(von), show(bis)));
    }
    let full = e.ip_von == 0 && e.ip_bis == u32::MAX;
    if !full {
        if let Some(l) = ips {
            if !l.iter().any(|ip| *ip >= e.ip_von && *ip <= e.ip_bis) {
                return Err("Anmeldung von diesem Netzwerk aus nicht erlaubt (Zugangsprofil)".into());
            }
        }
    }
    Ok(())
}

/// Darf sich die Person jetzt von diesen Adressen aus anmelden? Mehrere Profile: ein erlaubendes genügt.
/// Administratoren sind ausgenommen. Sind die Profile nicht lesbar, wird abgelehnt (kein stilles Öffnen).
pub fn check(c: &Connection, name: &str, role: &str, ips: Option<&[u32]>, now: NaiveDateTime) -> Result<(), String> {
    if role == "admin" {
        return Ok(());
    }
    let want = name.trim().to_lowercase();
    let is_me = |m: &Value| m.as_str().map(|x| x.trim().to_lowercase() == want).unwrap_or(false);
    let all = crate::stamm::list(c, "zugangsprofil").map_err(|_| "Zugangsprofile konnten nicht gelesen werden – bitte später erneut versuchen".to_string())?;
    let profiles: Vec<Value> = all.into_iter().filter(|p| p["id"].as_str() != Some("STANDARD") && p["_aktiv"].as_bool().unwrap_or(true) && p["benutzer"].as_array().map(|b| b.iter().any(is_me)).unwrap_or(false)).collect();
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

/// Adresse des Gegenübers als Zahl (IPv4; „::1“ zählt als 127.0.0.1, andere IPv6-Adressen sind nicht zuordenbar → leere Liste)
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
    fn mo(h: u32, mi: u32) -> NaiveDateTime { at(2026, 10, 12, h, mi) }
    fn di(h: u32, mi: u32) -> NaiveDateTime { at(2026, 10, 13, h, mi) }
    fn fr(h: u32, mi: u32) -> NaiveDateTime { at(2026, 10, 16, h, mi) }
    fn sa(h: u32, mi: u32) -> NaiveDateTime { at(2026, 10, 17, h, mi) }
    fn so(h: u32, mi: u32) -> NaiveDateTime { at(2026, 10, 18, h, mi) }

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
        assert_eq!(minutes("8:30"), Some(510));
        for bad in ["24:00", "12:60", "abc", "8:5", "+8:30", "008:30", "08:030", "08:3", ":30", "08:"] {
            assert_eq!(minutes(bad), None, "{bad}");
        }
    }

    #[test]
    fn end_zeit_gilt_nicht_mehr() {
        // „End-Zeit: ab der man sich nicht mehr anmelden darf“
        let p = json!({ "wt_von": "08:00", "wt_bis": "17:00" });
        assert!(profile_allows(&p, mo(8, 0), None).is_ok(), "Start gilt");
        assert!(profile_allows(&p, mo(16, 59), None).is_ok());
        assert!(profile_allows(&p, mo(17, 0), None).is_err(), "Ende gilt nicht mehr");
        assert!(profile_allows(&p, mo(7, 59), None).is_err());
        // Start = Ende: ganztägig
        let ganz = json!({ "wt_von": "00:00", "wt_bis": "00:00" });
        assert!(profile_allows(&ganz, mo(0, 0), None).is_ok() && profile_allows(&ganz, mo(23, 59), None).is_ok());
        // 08:00 bis 00:00: bis Mitternacht, danach der Rest gehört nicht mehr dazu
        let bis_mitternacht = json!({ "wt_von": "08:00", "wt_bis": "00:00" });
        assert!(profile_allows(&bis_mitternacht, mo(23, 59), None).is_ok());
        assert!(profile_allows(&bis_mitternacht, di(0, 0), None).is_err(), "Dienstag 00:00 liegt vor dem Start von 08:00");
    }

    #[test]
    fn fenster_ueber_mitternacht_gehoert_zum_starttag() {
        // Arbeitstag 22:00–06:00, Wochenende gesperrt (nur Mo–Fr)
        let p = json!({ "tage": ["Mo", "Di", "Mi", "Do", "Fr"], "wt_von": "22:00", "wt_bis": "06:00" });
        assert!(profile_allows(&p, fr(23, 0), None).is_ok(), "Freitag 23:00");
        assert!(profile_allows(&p, sa(3, 0), None).is_ok(), "Samstag 03:00 gehört zur Freitagsschicht");
        assert!(profile_allows(&p, sa(6, 0), None).is_err(), "Ende gilt nicht mehr");
        assert!(profile_allows(&p, sa(23, 0), None).is_err(), "Samstag 23:00 beginnt keine Schicht (Wochenende gesperrt)");
        assert!(profile_allows(&p, so(3, 0), None).is_err(), "Sonntag 03:00: Samstag war keine Schicht");
        assert!(profile_allows(&p, so(23, 0), None).is_err(), "Sonntag 23:00: Wochenende gesperrt");
        assert!(profile_allows(&p, mo(3, 0), None).is_err(), "Montag 03:00: der Sonntag war keine Schicht");
        assert!(profile_allows(&p, mo(23, 0), None).is_ok());
        assert!(profile_allows(&p, di(12, 0), None).is_err());
    }

    #[test]
    fn profil_prueft_zeit_tagesart_und_adresse() {
        let p = json!({ "ip_von": "192.168.1.0", "ip_bis": "192.168.1.255", "wt_von": "08:00", "wt_bis": "18:00", "we_von": "09:00", "we_bis": "13:00" });
        let lan = [parse_ip("192.168.1.20").unwrap()];
        let fremd = [parse_ip("10.0.0.5").unwrap()];
        assert!(profile_allows(&p, mo(9, 0), Some(&lan)).is_ok());
        assert!(profile_allows(&p, mo(19, 0), Some(&lan)).unwrap_err().contains("an Arbeitstagen"));
        assert!(profile_allows(&p, sa(10, 0), Some(&lan)).is_ok());
        assert!(profile_allows(&p, sa(15, 0), Some(&lan)).unwrap_err().contains("am Wochenende"));
        assert!(profile_allows(&p, mo(9, 0), Some(&fremd)).unwrap_err().contains("Netzwerk"));
        assert!(profile_allows(&p, mo(9, 0), None).is_ok(), "Adresse nicht prüfbar (Arbeitsplatz ohne Netzwerk): nur die Zeit zählt");
        assert!(profile_allows(&p, mo(9, 0), Some(&[])).is_err(), "bekannte, aber nicht zuordenbare Adresse: bei eingeschränktem Bereich abgelehnt");
        // Standard (alles offen)
        let std = json!({ "ip_von": "0.0.0.0", "ip_bis": "255.255.255.255", "wt_von": "00:00", "wt_bis": "00:00", "we_von": "00:00", "we_bis": "00:00" });
        assert!(profile_allows(&std, sa(3, 0), Some(&fremd)).is_ok() && profile_allows(&std, sa(3, 0), Some(&[])).is_ok());
        // einzelne feste Adresse: von = bis
        let fix = json!({ "ip_von": "203.0.113.7", "ip_bis": "203.0.113.7" });
        assert!(profile_allows(&fix, mo(9, 0), Some(&[parse_ip("203.0.113.7").unwrap()])).is_ok());
        assert!(profile_allows(&fix, mo(9, 0), Some(&[parse_ip("203.0.113.8").unwrap()])).is_err());
    }

    #[test]
    fn wochentage_einzeln() {
        let nur_mi = json!({ "tage": ["Mi"] });
        assert!(profile_allows(&nur_mi, at(2026, 10, 14, 10, 0), None).is_ok(), "Mittwoch");
        for t in [mo(10, 0), di(10, 0), at(2026, 10, 15, 10, 0), fr(10, 0), sa(10, 0), so(10, 0)] {
            assert!(profile_allows(&nur_mi, t, None).unwrap_err().contains("nicht erlaubt"), "{t}");
        }
        let nur_sa = json!({ "tage": ["Sa"] });
        assert!(profile_allows(&nur_sa, sa(9, 0), None).is_ok() && profile_allows(&nur_sa, so(9, 0), None).is_err() && profile_allows(&nur_sa, mo(9, 0), None).is_err());
        // Schalter der Fassung 0.39.0
        let wt_aus = json!({ "wt_ok": false });
        assert!(profile_allows(&wt_aus, mo(9, 0), None).is_err() && profile_allows(&wt_aus, sa(9, 0), None).is_ok());
        let we_aus = json!({ "we_ok": false });
        assert!(profile_allows(&we_aus, mo(9, 0), None).is_ok() && profile_allows(&we_aus, so(9, 0), None).is_err());
    }

    #[test]
    fn aeltere_profile_mit_wochentagen_und_zeiten_gelten_unveraendert() {
        // frühere Fassung: Wochentage + von/bis für alle genannten Tage
        let p = json!({ "tage": ["Mo", "Di", "Mi", "Do", "Fr"], "von": "08:00", "bis": "17:00" });
        assert!(profile_allows(&p, mo(9, 0), None).is_ok());
        assert!(profile_allows(&p, mo(18, 0), None).is_err());
        assert!(profile_allows(&p, sa(9, 0), None).unwrap_err().contains("Samstag"));
        let mo_di = json!({ "tage": ["Mo", "Di"], "von": "08:00", "bis": "12:00" });
        assert!(profile_allows(&mo_di, di(9, 0), None).is_ok());
        assert!(profile_allows(&mo_di, fr(9, 0), None).is_err());
        let mo_bis_sa = json!({ "tage": ["Mo", "Di", "Mi", "Do", "Fr", "Sa"] });
        assert!(profile_allows(&mo_bis_sa, sa(9, 0), None).is_ok() && profile_allows(&mo_bis_sa, so(9, 0), None).is_err());
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
        assert!(check(&c, "lena moser", "verkauf", Some(&lan), mo(9, 0)).is_ok(), "Namensvergleich ohne Groß-/Kleinschreibung");
        assert!(check(&c, " Lena Moser ", "verkauf", Some(&fremd), mo(9, 0)).is_err(), "Leerzeichen am Rand zählen nicht");
        assert!(check(&c, "Lena Moser", "verkauf", Some(&lan), mo(20, 0)).is_err());
        assert!(check(&c, "Lena Moser", "admin", Some(&fremd), mo(20, 0)).is_ok(), "Administratoren sind ausgenommen");
        assert!(check(&c, "David Huber", "verkauf", Some(&fremd), mo(3, 0)).is_ok(), "ohne Profil: immer erlaubt (Standardprofil)");
        // Profil deaktiviert → gilt nicht
        let mut aus = rows.clone();
        aus[0]["_aktiv"] = json!(false);
        crate::stamm::save(&c, "zugangsprofil", &aus).unwrap();
        assert!(check(&c, "Lena Moser", "verkauf", Some(&fremd), mo(9, 0)).is_ok());
        // Das Standardprofil schränkt nie ein – auch nicht, wenn es (aus einer älteren Fassung) gespeichert ist und strenge Werte trägt
        let std = [json!({ "id": "STANDARD", "name": "Standard", "benutzer": ["Lena Moser"], "ip_von": "10.0.0.1", "ip_bis": "10.0.0.1", "wt_von": "01:00", "wt_bis": "02:00", "_aktiv": true })];
        crate::stamm::save(&c, "zugangsprofil", &std).unwrap();
        assert!(check(&c, "Lena Moser", "verkauf", Some(&fremd), mo(9, 0)).is_ok(), "Standardprofil sperrt nie");
    }

    #[test]
    fn nicht_lesbare_profile_oeffnen_nichts() {
        let c = Connection::open_in_memory().unwrap();   // ohne Tabelle „stamm“
        let r = check(&c, "Lena Moser", "verkauf", None, mo(9, 0));
        assert!(r.unwrap_err().contains("nicht gelesen"), "Lesefehler: ablehnen");
        assert!(check(&c, "David Huber", "admin", None, mo(9, 0)).is_ok(), "Administratoren bleiben ausgenommen");
    }
}
