//! E-Mail-Versand (Belege, Rechnungen, Bestellungen) über den eigenen Mailserver (SMTP) des Betreibers.
//! Keine Cloud dazwischen: Kontor spricht direkt mit dem eingetragenen Server.

use lettre::message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::{Message, SmtpTransport, Transport};
use serde::Deserialize;
use std::time::Duration;

#[derive(Deserialize, Clone, Default)]
pub struct Config {
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub pass: String,
    pub from: String,
    /// "starttls" | "tls" | "keine"
    #[serde(default)]
    pub tls: String,
}

pub struct Mail<'a> {
    pub to: &'a str,
    pub subject: &'a str,
    pub html: &'a str,
    pub text: &'a str,
    /// optionaler QR-Code (Inhalt) – wird als Bild „cid:qr“ eingebettet
    pub qr: Option<&'a str>,
}

fn qr_png(text: &str) -> Result<Vec<u8>, String> {
    let code = qrcode::QrCode::with_error_correction_level(text.as_bytes(), qrcode::EcLevel::M).map_err(|e| e.to_string())?;
    let img = code.render::<image::Luma<u8>>().min_dimensions(240, 240).build();
    let mut out = std::io::Cursor::new(vec![]);
    image::DynamicImage::ImageLuma8(img).write_to(&mut out, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(out.into_inner())
}

pub fn send(cfg: &Config, m: &Mail) -> Result<(), String> {
    if cfg.host.trim().is_empty() || cfg.from.trim().is_empty() {
        return Err("E-Mail-Versand ist nicht eingerichtet (Einstellungen → E-Mail)".into());
    }
    let from: Mailbox = cfg.from.trim().parse().map_err(|_| format!("Absender „{}“ ist keine gültige Adresse", cfg.from))?;
    let to: Mailbox = m.to.trim().parse().map_err(|_| format!("Empfänger „{}“ ist keine gültige Adresse", m.to))?;
    let alt = MultiPart::alternative()
        .singlepart(SinglePart::builder().header(ContentType::TEXT_PLAIN).body(m.text.to_string()))
        .singlepart(SinglePart::builder().header(ContentType::TEXT_HTML).body(m.html.to_string()));
    let body = match m.qr {
        Some(q) => MultiPart::related().multipart(alt).singlepart(Attachment::new_inline("qr".into()).body(qr_png(q)?, ContentType::parse("image/png").unwrap())),
        None => alt,
    };
    let msg = Message::builder().from(from).to(to).subject(m.subject).multipart(body).map_err(|e| e.to_string())?;
    let host = cfg.host.trim();
    let tls = TlsParameters::new(host.into()).map_err(|e| e.to_string())?;
    let mut b = SmtpTransport::builder_dangerous(host).port(if cfg.port == 0 { 587 } else { cfg.port }).timeout(Some(Duration::from_secs(15)));
    b = match cfg.tls.as_str() {
        "tls" => b.tls(Tls::Wrapper(tls)),
        "keine" => b.tls(Tls::None),
        _ => b.tls(Tls::Required(tls)),
    };
    if !cfg.user.is_empty() {
        b = b.credentials(Credentials::new(cfg.user.clone(), cfg.pass.clone()));
    }
    b.build().send(&msg).map_err(|e| format!("Versand fehlgeschlagen: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};

    /// Minimaler SMTP-Empfänger: nimmt genau eine Nachricht an und liefert sie zurück.
    fn sink() -> (u16, std::thread::JoinHandle<String>) {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let h = std::thread::spawn(move || {
            let (s, _) = l.accept().unwrap();
            let mut w = s.try_clone().unwrap();
            let mut r = BufReader::new(s);
            w.write_all(b"220 test ESMTP\r\n").unwrap();
            let mut data = String::new();
            let mut in_data = false;
            loop {
                let mut line = String::new();
                if r.read_line(&mut line).unwrap() == 0 {
                    break;
                }
                if in_data {
                    if line == ".\r\n" {
                        in_data = false;
                        w.write_all(b"250 ok\r\n").unwrap();
                    } else {
                        data.push_str(&line);
                    }
                    continue;
                }
                let up = line.to_uppercase();
                if up.starts_with("EHLO") {
                    w.write_all(b"250 test\r\n").unwrap();
                } else if up.starts_with("DATA") {
                    in_data = true;
                    w.write_all(b"354 go\r\n").unwrap();
                } else if up.starts_with("QUIT") {
                    w.write_all(b"221 bye\r\n").unwrap();
                    break;
                } else {
                    w.write_all(b"250 ok\r\n").unwrap();
                }
            }
            data
        });
        (port, h)
    }

    #[test]
    fn beleg_per_mail_mit_qr() {
        let (port, h) = sink();
        let cfg = Config { host: "127.0.0.1".into(), port, from: "Kassa <kassa@example.at>".into(), tls: "keine".into(), ..Default::default() };
        send(&cfg, &Mail { to: "kunde@example.at", subject: "Ihr Beleg 2026-000001", html: "<p>Größe <img src=\"cid:qr\"></p>", text: "Beleg", qr: Some("_R1-AT0_TEST") }).unwrap();
        let data = h.join().unwrap();
        assert!(data.contains("Subject: Ihr Beleg 2026-000001"));
        assert!(data.contains("Content-ID: <qr>"));
        assert!(data.contains("image/png"));
        assert!(send(&cfg, &Mail { to: "keine-adresse", subject: "x", html: "", text: "", qr: None }).is_err());
    }
}
