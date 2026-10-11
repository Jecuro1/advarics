//! Zahlungsterminal über ZVT (Kassen-Terminal-Schnittstelle, TCP, meist Port 20007).
//! Unterstützt: Anmeldung (06 00), Zahlung/Autorisierung (06 01), Storno (06 30), Kassenschnitt (06 50).
//! Viele Terminals in AT/DE sprechen ZVT (z. B. Ingenico, Verifone, CCV; je nach Netzbetreiber).

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, serde::Serialize, Default)]
pub struct Result {
    pub ok: bool,
    pub code: u8,
    pub message: String,
    pub amount: i64,
    pub trace: Option<String>,
    pub receipt_no: Option<String>,
    pub card: Option<String>,
    pub texts: Vec<String>,
}

fn bcd(n: u64, bytes: usize) -> Vec<u8> {
    let s = format!("{:0width$}", n, width = bytes * 2);
    s.as_bytes().chunks(2).map(|p| ((p[0] - b'0') << 4) | (p[1] - b'0')).collect()
}
fn unbcd(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

fn apdu(cls: u8, ins: u8, data: &[u8]) -> Vec<u8> {
    let mut v = vec![cls, ins];
    if data.len() < 0xFF {
        v.push(data.len() as u8);
    } else {
        v.push(0xFF);
        v.extend((data.len() as u16).to_le_bytes());
    }
    v.extend(data);
    v
}

fn read_apdu(s: &mut TcpStream) -> std::io::Result<(u8, u8, Vec<u8>)> {
    let mut h = [0u8; 3];
    s.read_exact(&mut h)?;
    let len = if h[2] == 0xFF {
        let mut l = [0u8; 2];
        s.read_exact(&mut l)?;
        u16::from_le_bytes(l) as usize
    } else {
        h[2] as usize
    };
    let mut d = vec![0u8; len];
    s.read_exact(&mut d)?;
    Ok((h[0], h[1], d))
}

fn ack(s: &mut TcpStream) -> std::io::Result<()> {
    s.write_all(&[0x80, 0x00, 0x00])
}

/// Bitmaps der Statusmeldung (04 0F) auswerten – bekannte Felder, Rest wird übersprungen, wo möglich.
fn parse_bmps(d: &[u8], r: &mut Result) {
    let mut i = 0;
    while i < d.len() {
        let bmp = d[i];
        i += 1;
        let fixed = |n: usize, i: &mut usize| -> Option<&[u8]> {
            let v = d.get(*i..*i + n)?;
            *i += n;
            Some(v)
        };
        let llvar = |i: &mut usize, digits: usize| -> Option<&[u8]> {
            let l = d.get(*i..*i + digits)?.iter().fold(0usize, |a, b| a * 10 + (b & 0x0F) as usize);
            *i += digits;
            let v = d.get(*i..*i + l)?;
            *i += l;
            Some(v)
        };
        let ok = match bmp {
            0x27 => fixed(1, &mut i).map(|v| r.code = v[0]).is_some(),
            0x04 => fixed(6, &mut i).map(|v| r.amount = unbcd(v).parse().unwrap_or(0)).is_some(),
            0x0B => fixed(3, &mut i).map(|v| r.trace = Some(unbcd(v))).is_some(),
            0x87 => fixed(2, &mut i).map(|v| r.receipt_no = Some(unbcd(v))).is_some(),
            0x8B => llvar(&mut i, 2).map(|v| r.card = Some(String::from_utf8_lossy(v).trim().to_string())).is_some(),
            0x0C | 0x37 | 0x88 => fixed(3, &mut i).is_some(),
            0x0D | 0x0E | 0x17 | 0x49 => fixed(2, &mut i).is_some(),
            0x19 | 0x8A | 0x8C | 0xA0 | 0xD0 => fixed(1, &mut i).is_some(),
            0x29 => fixed(4, &mut i).is_some(),
            0x2A => fixed(15, &mut i).is_some(),
            0x3B => fixed(8, &mut i).is_some(),
            0xBA => fixed(5, &mut i).is_some(),
            0x22 | 0xD1 => llvar(&mut i, 2).is_some(),
            0x3C => llvar(&mut i, 3).is_some(),
            _ => false,
        };
        if !ok {
            break;
        }
    }
}

fn result_text(code: u8) -> &'static str {
    match code {
        0x00 => "Zahlung erfolgreich",
        0x05 => "Karte abgelehnt",
        0x64 => "Karte nicht lesbar",
        0x65 => "Kartendaten ungültig",
        0x6C => "Abbruch durch Kund:in oder Terminal",
        0x6F => "Falsche Währung",
        0x78 => "Karte gesperrt",
        0x9C => "Terminal belegt",
        0xA0 => "Empfänger nicht verfügbar",
        _ => "Zahlung nicht durchgeführt",
    }
}

fn connect(addr: &str) -> std::result::Result<TcpStream, String> {
    let a = if addr.contains(':') { addr.to_string() } else { format!("{addr}:20007") };
    let sa = a.to_socket_addrs().map_err(|e| format!("Terminaladresse {a}: {e}"))?.next().ok_or("Terminal nicht gefunden")?;
    let s = TcpStream::connect_timeout(&sa, Duration::from_secs(4)).map_err(|e| format!("Terminal {a} nicht erreichbar: {e}"))?;
    s.set_read_timeout(Some(Duration::from_secs(5))).ok();
    Ok(s)
}

/// Befehl senden und Dialog bis zum Abschluss führen (Zwischenstände bestätigen).
fn run(addr: &str, cmd: Vec<u8>, timeout: Duration) -> std::result::Result<Result, String> {
    let mut s = connect(addr)?;
    s.write_all(&cmd).map_err(|e| e.to_string())?;
    let started = Instant::now();
    let mut r = Result { code: 0xFF, ..Default::default() };
    loop {
        if started.elapsed() > timeout {
            return Err("Zeitüberschreitung am Terminal".into());
        }
        let (c, i, d) = match read_apdu(&mut s) {
            Ok(x) => x,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => continue,
            Err(e) => return Err(format!("Verbindung zum Terminal unterbrochen: {e}")),
        };
        match (c, i) {
            (0x80, 0x00) => {}
            (0x84, _) => return Err(format!("Terminal lehnt den Befehl ab (Code {:02X})", i)),
            (0x04, 0xFF) => {
                if let Some(t) = d.first() {
                    r.texts.push(format!("Status {:02X}", t));
                }
                ack(&mut s).ok();
            }
            (0x04, 0x0F) => {
                parse_bmps(&d, &mut r);
                ack(&mut s).ok();
            }
            (0x06, 0xD1) | (0x06, 0xD3) => {
                ack(&mut s).ok();
            }
            (0x06, 0x0F) => {
                ack(&mut s).ok();
                if r.code == 0xFF {
                    r.code = 0;
                }
                r.ok = r.code == 0;
                r.message = result_text(r.code).into();
                return Ok(r);
            }
            (0x06, 0x1E) => {
                ack(&mut s).ok();
                r.code = d.first().copied().unwrap_or(0xFF);
                r.ok = false;
                r.message = result_text(r.code).into();
                return Ok(r);
            }
            _ => {
                ack(&mut s).ok();
            }
        }
    }
}

pub fn pay(addr: &str, cents: i64) -> std::result::Result<Result, String> {
    if cents <= 0 {
        return Err("Betrag muss größer als 0 sein".into());
    }
    let mut d = vec![0x04];
    d.extend(bcd(cents as u64, 6));
    d.extend([0x49, 0x09, 0x78]);
    run(addr, apdu(0x06, 0x01, &d), Duration::from_secs(180))
}

pub fn reversal(addr: &str, password: &str, receipt_no: &str) -> std::result::Result<Result, String> {
    let mut d = bcd(password.parse().unwrap_or(0), 3);
    d.push(0x87);
    d.extend(bcd(receipt_no.parse().unwrap_or(0), 2));
    run(addr, apdu(0x06, 0x30, &d), Duration::from_secs(120))
}

pub fn end_of_day(addr: &str, password: &str) -> std::result::Result<Result, String> {
    run(addr, apdu(0x06, 0x50, &bcd(password.parse().unwrap_or(0), 3)), Duration::from_secs(300))
}

pub fn register(addr: &str, password: &str) -> std::result::Result<Result, String> {
    let mut d = bcd(password.parse().unwrap_or(0), 3);
    d.extend([0xBA, 0x09, 0x78]);
    run(addr, apdu(0x06, 0x00, &d), Duration::from_secs(30))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Einfacher Terminal-Simulator: bestätigt, sendet Zwischenstand, Status (Ergebnis, Betrag, Beleg, Karte), Abschluss.
    fn sim(result: u8) -> (String, std::thread::JoinHandle<Vec<u8>>) {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap().to_string();
        let h = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let (c, i, d) = read_apdu(&mut s).unwrap();
            let mut got = vec![c, i];
            got.extend(&d);
            s.write_all(&[0x80, 0x00, 0x00]).unwrap();
            s.write_all(&[0x04, 0xFF, 0x01, 0x0A]).unwrap();
            let mut a = [0u8; 3];
            s.read_exact(&mut a).unwrap();
            if result == 0 {
                let mut st = vec![0x27, 0x00, 0x04];
                st.extend(&d[1..7]);
                st.extend([0x0B, 0x00, 0x12, 0x34, 0x87, 0x00, 0x42, 0x8B, 0xF0, 0xF8]);
                st.extend(b"Maestro ");
                s.write_all(&apdu(0x04, 0x0F, &st)).unwrap();
                s.read_exact(&mut a).unwrap();
                s.write_all(&[0x06, 0x0F, 0x00]).unwrap();
            } else {
                s.write_all(&[0x06, 0x1E, 0x01, result]).unwrap();
            }
            s.read_exact(&mut a).unwrap();
            got
        });
        (addr, h)
    }

    #[test]
    fn zahlung_erfolgreich_und_abgelehnt() {
        assert_eq!(bcd(4490, 6), vec![0, 0, 0, 0, 0x44, 0x90]);
        let (addr, h) = sim(0);
        let r = pay(&addr, 4490).unwrap();
        assert!(r.ok, "{r:?}");
        assert_eq!((r.amount, r.trace.as_deref(), r.receipt_no.as_deref(), r.card.as_deref()), (4490, Some("001234"), Some("0042"), Some("Maestro")));
        assert_eq!(&h.join().unwrap()[..9], &[0x06, 0x01, 0x04, 0, 0, 0, 0, 0x44, 0x90]);
        let (addr, _h) = sim(0x05);
        let r = pay(&addr, 1000).unwrap();
        assert!(!r.ok && r.message.contains("abgelehnt"));
        assert!(pay("127.0.0.1:1", 1000).is_err());
    }
}
