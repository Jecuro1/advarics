//! Bondrucker (ESC/POS, z. B. Epson TM-Serie und kompatible) und Kassenlade.
//! Verbindung über Netzwerk (TCP, Port 9100) oder über einen installierten Windows-Drucker (RAW).
//! Die Kassenlade hängt am Drucker und wird über den Drucker-Impuls geöffnet.
//! Die Oberfläche liefert den Beleg als einfache Befehlsliste; hier wird daraus ESC/POS.

use serde::Deserialize;
use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

#[derive(Deserialize, Clone)]
#[serde(tag = "t", rename_all = "lowercase")]
pub enum Op {
    Text {
        s: String,
        #[serde(default)]
        a: Option<String>,
        #[serde(default)]
        b: bool,
        #[serde(default)]
        big: bool,
    },
    Lr {
        l: String,
        r: String,
        #[serde(default)]
        b: bool,
    },
    Line,
    Qr {
        d: String,
    },
    Feed {
        #[serde(default)]
        n: u8,
    },
    Cut,
    Drawer,
    /// Firmenlogo (Rasterbild aus den Einstellungen)
    Logo,
}

#[derive(Deserialize, Clone)]
pub struct Target {
    /// "netz" oder "windows"
    pub kind: String,
    /// IP[:Port] bzw. Druckername
    pub addr: String,
    /// Zeichen je Zeile (48 bei 80 mm, 32 bei 58 mm)
    #[serde(default)]
    pub width: usize,
}

/// Zeichen nach Codepage PC858 (Westeuropa mit €)
fn cp858(s: &str) -> Vec<u8> {
    s.chars()
        .map(|c| match c {
            ' '..='~' => c as u8,
            'ä' => 0x84,
            'ö' => 0x94,
            'ü' => 0x81,
            'Ä' => 0x8E,
            'Ö' => 0x99,
            'Ü' => 0x9A,
            'ß' => 0xE1,
            '€' => 0xD5,
            'é' => 0x82,
            'è' => 0x8A,
            'á' => 0xA0,
            'à' => 0x85,
            '·' => 0xFA,
            '×' => b'x',
            '−' | '–' | '—' => b'-',
            '„' | '“' | '”' => b'"',
            '\u{a0}' | '\u{202f}' => b' ',
            _ => b'?',
        })
        .collect()
}

fn width_of(s: &str) -> usize {
    s.chars().count()
}

fn fit(s: &str, w: usize) -> String {
    s.chars().take(w).collect()
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn encode(ops: &[Op], width: usize) -> Vec<u8> {
    encode_with(ops, width, None)
}

pub fn encode_with(ops: &[Op], width: usize, logo: Option<&[u8]>) -> Vec<u8> {
    let w = if width == 0 { 48 } else { width.clamp(24, 64) };
    let mut out = vec![0x1B, 0x40, 0x1B, 0x74, 0x13]; // Init, Codepage PC858
    for op in ops {
        match op {
            Op::Text { s, a, b, big } => {
                let al = match a.as_deref() {
                    Some("c") => 1,
                    Some("r") => 2,
                    _ => 0,
                };
                out.extend([0x1B, 0x61, al, 0x1B, 0x45, *b as u8, 0x1D, 0x21, if *big { 0x11 } else { 0 }]);
                for line in s.split('\n') {
                    out.extend(cp858(&fit(line, if *big { w / 2 } else { w })));
                    out.push(b'\n');
                }
                out.extend([0x1B, 0x45, 0, 0x1D, 0x21, 0, 0x1B, 0x61, 0]);
            }
            Op::Lr { l, r, b } => {
                let r = fit(r, w);
                let room = w.saturating_sub(width_of(&r) + 1);
                let l = fit(l, room);
                let pad = w - width_of(&l) - width_of(&r);
                out.extend([0x1B, 0x45, *b as u8]);
                out.extend(cp858(&format!("{l}{}{r}", " ".repeat(pad))));
                out.extend([b'\n', 0x1B, 0x45, 0]);
            }
            Op::Line => {
                out.extend(std::iter::repeat(b'-').take(w));
                out.push(b'\n');
            }
            Op::Qr { d } => {
                let data = d.as_bytes();
                let len = data.len() + 3;
                out.extend([0x1B, 0x61, 1]);
                out.extend([0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]); // Modell 2
                out.extend([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x05]); // Modulgröße
                out.extend([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]); // Fehlerkorrektur M
                out.extend([0x1D, 0x28, 0x6B, (len & 0xFF) as u8, (len >> 8) as u8, 0x31, 0x50, 0x30]);
                out.extend(data);
                out.extend([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30, b'\n', 0x1B, 0x61, 0]);
            }
            Op::Feed { n } => out.extend([0x1B, 0x64, (*n).max(1)]),
            Op::Cut => out.extend([0x1D, 0x56, 0x42, 0x03]),
            Op::Drawer => out.extend([0x1B, 0x70, 0x00, 0x19, 0xFA]),
            Op::Logo => {
                if let Some(l) = logo {
                    out.extend(l);
                }
            }
        }
    }
    out
}

fn send_net(addr: &str, bytes: &[u8]) -> Result<(), String> {
    let a = if addr.contains(':') { addr.to_string() } else { format!("{addr}:9100") };
    let sa = a
        .to_socket_addrs()
        .map_err(|e| format!("Adresse {a} ungültig: {e}"))?
        .next()
        .ok_or_else(|| format!("Adresse {a} nicht gefunden"))?;
    let mut s = TcpStream::connect_timeout(&sa, Duration::from_secs(3)).map_err(|e| format!("Drucker {a} nicht erreichbar: {e}"))?;
    s.set_write_timeout(Some(Duration::from_secs(5))).ok();
    s.write_all(bytes).map_err(|e| format!("Senden an {a} fehlgeschlagen: {e}"))?;
    s.flush().ok();
    Ok(())
}

pub fn send(t: &Target, bytes: &[u8]) -> Result<(), String> {
    match t.kind.as_str() {
        "netz" => send_net(t.addr.trim(), bytes),
        "windows" => win::send_raw(t.addr.trim(), bytes),
        _ => Err("Kein Bondrucker eingerichtet (Einstellungen → Drucker)".into()),
    }
}

pub fn list_windows() -> Vec<String> {
    win::list()
}

#[cfg(windows)]
mod win {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS,
        PRINTER_ENUM_LOCAL, PRINTER_INFO_4W,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn send_raw(name: &str, bytes: &[u8]) -> Result<(), String> {
        let n = wide(name);
        let mut doc = wide("Kontor Beleg");
        let mut raw = wide("RAW");
        unsafe {
            let mut h = HANDLE::default();
            OpenPrinterW(PCWSTR(n.as_ptr()), &mut h, None).map_err(|e| format!("Drucker „{name}“ nicht gefunden: {e}"))?;
            let info = DOC_INFO_1W { pDocName: PWSTR(doc.as_mut_ptr()), pOutputFile: PWSTR::null(), pDatatype: PWSTR(raw.as_mut_ptr()) };
            let job = StartDocPrinterW(h, 1, &info);
            if job == 0 {
                let _ = ClosePrinter(h);
                return Err(format!("Druckauftrag an „{name}“ konnte nicht gestartet werden"));
            }
            let _ = StartPagePrinter(h);
            let mut written = 0u32;
            let ok = WritePrinter(h, bytes.as_ptr() as *const _, bytes.len() as u32, &mut written).as_bool();
            let _ = EndPagePrinter(h);
            let _ = EndDocPrinter(h);
            let _ = ClosePrinter(h);
            if !ok || written as usize != bytes.len() {
                return Err(format!("Senden an „{name}“ unvollständig"));
            }
        }
        Ok(())
    }

    pub fn list() -> Vec<String> {
        let mut out = vec![];
        unsafe {
            let (mut need, mut count) = (0u32, 0u32);
            let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
            let _ = EnumPrintersW(flags, PCWSTR::null(), 4, None, &mut need, &mut count);
            if need == 0 {
                return out;
            }
            let mut buf = vec![0u8; need as usize];
            if EnumPrintersW(flags, PCWSTR::null(), 4, Some(&mut buf), &mut need, &mut count).is_err() {
                return out;
            }
            let items = std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_4W, count as usize);
            for it in items {
                if let Ok(s) = it.pPrinterName.to_string() {
                    out.push(s);
                }
            }
        }
        out
    }
}

/// macOS und Linux: Drucker aus dem Systemdruck (CUPS, „Systemeinstellungen › Drucker & Scanner“).
/// Die Bytes (ESC/POS bzw. ZPL) gehen unverändert („raw“) an die Warteschlange – wie `lp -o raw`.
#[cfg(unix)]
mod win {
    use std::io::Write;
    use std::process::{Command, Stdio};

    pub fn send_raw(name: &str, bytes: &[u8]) -> Result<(), String> {
        if name.is_empty() {
            return Err("Kein Drucker gewählt".into());
        }
        let mut child = Command::new("lp")
            .args(["-d", name, "-o", "raw", "-t", "Kontor Beleg"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Druckdienst (lp) nicht verfügbar: {e}"))?;
        let mut stdin = child.stdin.take().ok_or_else(|| "Druckdienst nicht erreichbar".to_string())?;
        stdin.write_all(bytes).map_err(|e| format!("Senden an „{name}“ fehlgeschlagen: {e}"))?;
        drop(stdin);
        let out = child.wait_with_output().map_err(|e| format!("Druckdienst: {e}"))?;
        if out.status.success() {
            Ok(())
        } else {
            let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Err(format!("Drucker „{name}“: {}", if msg.is_empty() { "Auftrag abgelehnt".to_string() } else { msg }))
        }
    }

    /// Ausgabe von `lpstat -e` (Zielnamen) bzw. `lpstat -a` („NAME accepting requests …“): erstes Wort je Zeile.
    pub fn parse_lpstat(text: &str) -> Vec<String> {
        let mut out: Vec<String> = text.lines().filter_map(|l| l.split_whitespace().next()).map(str::to_string).collect();
        out.sort();
        out.dedup();
        out
    }

    pub fn list() -> Vec<String> {
        for arg in ["-e", "-a"] {
            if let Ok(o) = Command::new("lpstat").arg(arg).output() {
                let v = parse_lpstat(&String::from_utf8_lossy(&o.stdout));
                if !v.is_empty() {
                    return v;
                }
            }
        }
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn lpstat_ausgabe_wird_gelesen() {
        let e = "EPSON_TM_T20III\nStar_TSP143\n";
        assert_eq!(win::parse_lpstat(e), vec!["EPSON_TM_T20III".to_string(), "Star_TSP143".to_string()]);
        let a = "Star_TSP143 accepting requests since Mon Oct 12 19:00:00 2026\nEPSON_TM_T20III accepting requests since Mon Oct 12 18:00:00 2026\n\nStar_TSP143 accepting requests since x\n";
        assert_eq!(win::parse_lpstat(a), vec!["EPSON_TM_T20III".to_string(), "Star_TSP143".to_string()]);
        assert!(win::parse_lpstat("").is_empty());
        assert!(win::send_raw("", b"x").is_err());
    }

    #[test]
    fn escpos_netzwerkdruck() {
        let ops = vec![
            Op::Text { s: "Größe".into(), a: Some("c".into()), b: true, big: false },
            Op::Lr { l: "1 x Jacke".into(), r: "449,00 €".into(), b: false },
            Op::Qr { d: "_R1-AT0_TEST".into() },
            Op::Drawer,
            Op::Cut,
        ];
        let bytes = encode(&ops, 32);
        assert!(bytes.windows(5).any(|w| w == [b'G', b'r', 0x94, 0xE1, b'e']), "Umlaute in PC858");
        assert!(bytes.windows(5).any(|w| w == [0x1B, 0x70, 0x00, 0x19, 0xFA]));
        // Lr füllt exakt auf 32 Zeichen
        let line: Vec<u8> = cp858(&format!("1 x Jacke{}449,00 €", " ".repeat(32 - 9 - 8)));
        assert!(bytes.windows(line.len()).any(|w| w == line.as_slice()));
        // echter TCP-Empfänger
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap().to_string();
        let h = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut v = vec![];
            std::io::Read::read_to_end(&mut s, &mut v).unwrap();
            v
        });
        send(&Target { kind: "netz".into(), addr, width: 32 }, &bytes).unwrap();
        assert_eq!(h.join().unwrap(), bytes);
        assert!(send(&Target { kind: "netz".into(), addr: "127.0.0.1:1".into(), width: 32 }, &bytes).is_err());
    }
}
