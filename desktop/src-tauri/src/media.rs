//! Bildergalerie je Artikel (mehrere Bilder, je Farbe, Reihenfolge), Bilder von Webadressen laden
//! und Produktseiten (JSON-LD / Open Graph) auslesen, um Artikeldaten zu übernehmen.

use crate::{db, images};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::io::Read;
use std::path::Path;
use std::time::Duration;

/// Proxy aus der Umgebung (HTTPS_PROXY) nutzen – außer für lokale Adressen und Einträge aus NO_PROXY
pub fn skip_proxy(url: &str) -> bool {
    let host = url::Url::parse(url).ok().and_then(|u| u.host_str().map(str::to_lowercase)).unwrap_or_default();
    let no = std::env::var("NO_PROXY").or_else(|_| std::env::var("no_proxy")).unwrap_or_default();
    host == "localhost" || host.starts_with("127.") || host == "::1" || host.ends_with(".local")
        || no.split(',').map(|x| x.trim().trim_start_matches('.').to_lowercase()).filter(|x| !x.is_empty() && x != "*").any(|x| host == x || host.ends_with(&format!(".{x}")))
}

pub fn agent_for(url: &str) -> ureq::Agent {
    ureq::AgentBuilder::new().try_proxy_from_env(!skip_proxy(url)).timeout(Duration::from_secs(25)).user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Kontor/1.0").build()
}

fn check_url(url: &str) -> Result<(), String> {
    let u = url::Url::parse(url.trim()).map_err(|_| "Ungültige Webadresse".to_string())?;
    if !["http", "https"].contains(&u.scheme()) {
        return Err("Nur http(s)-Adressen".into());
    }
    Ok(())
}

pub fn download(url: &str, max: usize) -> Result<(Vec<u8>, String), String> {
    check_url(url)?;
    let r = agent_for(url.trim()).get(url.trim()).call().map_err(|e| format!("{e}"))?;
    let ct = r.content_type().to_string();
    let mut buf = vec![];
    r.into_reader().take(max as u64 + 1).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    if buf.len() > max {
        return Err("Datei zu groß".into());
    }
    Ok((buf, ct))
}

pub fn list(c: &Connection, article_id: &str) -> Result<Vec<Value>, String> {
    let mut st = c.prepare("SELECT id, file, color, caption, source_url, status FROM article_media WHERE article_id = ?1 ORDER BY pos, id").map_err(|e| e.to_string())?;
    let rows = st
        .query_map([article_id], |r| {
            Ok(json!({ "id": r.get::<_, i64>(0)?, "file": r.get::<_, Option<String>>(1)?, "color": r.get::<_, String>(2)?, "caption": r.get::<_, String>(3)?, "url": r.get::<_, Option<String>>(4)?, "status": r.get::<_, String>(5)? }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// Hauptbild = erstes Bild der Galerie (für Kasse, Listen und Schaufenster)
pub fn sync_primary(c: &Connection, article_id: &str) -> Result<(), String> {
    let f: Option<String> = c
        .query_row("SELECT file FROM article_media WHERE article_id = ?1 AND file IS NOT NULL ORDER BY pos, id LIMIT 1", [article_id], |r| r.get(0))
        .ok();
    c.execute("UPDATE articles SET image = ?2 WHERE id = ?1", params![article_id, f]).map_err(|e| e.to_string())?;
    Ok(())
}

fn next_pos(c: &Connection, article_id: &str) -> i64 {
    c.query_row("SELECT COALESCE(MAX(pos), -1) + 1 FROM article_media WHERE article_id = ?1", [article_id], |r| r.get(0)).unwrap_or(0)
}

pub fn add_bytes(c: &Connection, data_dir: &Path, article_id: &str, bytes: &[u8], color: &str, source: Option<&str>) -> Result<i64, String> {
    let n = next_pos(c, article_id);
    let name = images::import_bytes(data_dir, article_id, bytes, n as usize)?;
    c.execute(
        "INSERT INTO article_media(article_id, pos, file, color, source_url, status, created_at) VALUES (?1,?2,?3,?4,?5,'ok',?6)",
        params![article_id, n, name, color, source, db::now()],
    )
    .map_err(|e| e.to_string())?;
    let id = c.last_insert_rowid();
    sync_primary(c, article_id)?;
    Ok(id)
}

/// Bild-URL ohne Download vormerken (wird im Hintergrund geladen)
pub fn queue_url(c: &Connection, article_id: &str, url: &str, color: &str) -> Result<(), String> {
    queue_url_cap(c, article_id, url, color, "")
}

pub fn queue_url_cap(c: &Connection, article_id: &str, url: &str, color: &str, caption: &str) -> Result<(), String> {
    let exists: bool = c.query_row("SELECT 1 FROM article_media WHERE article_id = ?1 AND source_url = ?2", params![article_id, url], |_| Ok(true)).unwrap_or(false);
    if exists {
        return Ok(());
    }
    c.execute(
        "INSERT INTO article_media(article_id, pos, file, color, caption, source_url, status, created_at) VALUES (?1,?2,NULL,?3,?6,?4,'offen',?5)",
        params![article_id, next_pos(c, article_id), color, url, db::now(), caption],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Vorgemerkte Bilder laden. Liefert (geladen, fehlgeschlagen, verbleibend).
pub fn fetch_pending(c: &Connection, data_dir: &Path, limit: usize) -> Result<(usize, usize, i64), String> {
    fetch_pending_retry(c, data_dir, limit, false)
}

pub fn fetch_pending_retry(c: &Connection, data_dir: &Path, limit: usize, retry: bool) -> Result<(usize, usize, i64), String> {
    if retry {
        c.execute("UPDATE article_media SET status = 'offen' WHERE status = 'fehler' AND file IS NULL AND source_url IS NOT NULL", []).map_err(|e| e.to_string())?;
    }
    // Zuerst je Artikel das erste Bild (Hauptbild), dann die weiteren – mit mehreren Verbindungen gleichzeitig
    let todo: Vec<(i64, String, String)> = {
        let mut st = c.prepare("SELECT id, article_id, source_url FROM article_media WHERE status = 'offen' AND file IS NULL ORDER BY pos, id LIMIT ?1").map_err(|e| e.to_string())?;
        let rows = st.query_map([limit as i64], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    let results: Vec<(i64, String, Result<String, String>)> = std::thread::scope(|sc| {
        let workers = 4usize.min(todo.len().max(1));
        let handles: Vec<_> = (0..workers)
            .map(|w| {
                let part: Vec<_> = todo.iter().enumerate().filter(|(i, _)| i % workers == w).map(|(_, t)| t.clone()).collect();
                sc.spawn(move || {
                    part.into_iter()
                        .map(|(id, aid, url)| {
                            let res = download(&url, 15 * 1024 * 1024).and_then(|(b, _)| images::import_bytes(data_dir, &aid, &b, id as usize));
                            (id, aid, res)
                        })
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        handles.into_iter().flat_map(|h| h.join().unwrap_or_default()).collect()
    });
    let (mut ok, mut bad) = (0, 0);
    for (id, aid, res) in results {
        match res {
            Ok(name) => {
                c.execute("UPDATE article_media SET file = ?2, status = 'ok' WHERE id = ?1", params![id, name]).map_err(|e| e.to_string())?;
                sync_primary(c, &aid)?;
                ok += 1;
            }
            Err(_) => {
                c.execute("UPDATE article_media SET status = 'fehler' WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
                bad += 1;
            }
        }
    }
    let rest: i64 = c.query_row("SELECT COUNT(*) FROM article_media WHERE status = 'offen'", [], |r| r.get(0)).unwrap_or(0);
    Ok((ok, bad, rest))
}

pub fn remove(c: &Connection, data_dir: &Path, id: i64) -> Result<(), String> {
    let (aid, file): (String, Option<String>) = c.query_row("SELECT article_id, file FROM article_media WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|_| "Bild nicht gefunden".to_string())?;
    c.execute("DELETE FROM article_media WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    if let Some(f) = file {
        images::remove(data_dir, &f);
    }
    sync_primary(c, &aid)
}

/// Reihenfolge, Farbzuordnung und Beschriftung speichern: items = [{id, color, caption}] in neuer Reihenfolge
pub fn update(c: &Connection, article_id: &str, items: &[Value]) -> Result<(), String> {
    for (i, it) in items.iter().enumerate() {
        c.execute(
            "UPDATE article_media SET pos = ?2, color = ?3, caption = ?4 WHERE id = ?1 AND article_id = ?5",
            params![it["id"].as_i64(), i as i64, it["color"].as_str().unwrap_or(""), it["caption"].as_str().unwrap_or(""), article_id],
        )
        .map_err(|e| e.to_string())?;
    }
    sync_primary(c, article_id)
}

/* ── Produktseite auslesen ── */

fn between<'a>(s: &'a str, a: &str, b: &str, from: usize) -> Option<(&'a str, usize)> {
    let i = s[from..].find(a)? + from + a.len();
    let j = s[i..].find(b)? + i;
    Some((&s[i..j], j + b.len()))
}

fn attr(tag: &str, name: &str) -> Option<String> {
    for q in ['"', '\''] {
        let k = format!("{name}={q}");
        if let Some(i) = tag.find(&k) {
            let r = &tag[i + k.len()..];
            if let Some(j) = r.find(q) {
                return Some(html_decode(&r[..j]));
            }
        }
    }
    None
}

fn html_decode(s: &str) -> String {
    s.replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&#x27;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")
}

/// Lädt eine Produktseite und liefert JSON-LD-Blöcke, Meta-Angaben und Bildadressen.
pub fn read_page(url: &str) -> Result<Value, String> {
    let (bytes, _) = download(url, 6 * 1024 * 1024)?;
    let html = String::from_utf8_lossy(&bytes).to_string();
    let base = url::Url::parse(url.trim()).map_err(|e| e.to_string())?;
    let abs = |u: &str| base.join(u).map(|x| x.to_string()).unwrap_or_else(|_| u.to_string());
    let mut jsonld = vec![];
    let mut pos = 0;
    while let Some((blk, next)) = between(&html, "application/ld+json", "</script>", pos) {
        if let Some(i) = blk.find('>') {
            if let Ok(v) = serde_json::from_str::<Value>(blk[i + 1..].trim()) {
                jsonld.push(v);
            }
        }
        pos = next;
    }
    let mut meta = serde_json::Map::new();
    let mut imgs: Vec<String> = vec![];
    let mut p = 0;
    while let Some(i) = html[p..].find("<meta ") {
        let st = p + i;
        let en = html[st..].find('>').map(|e| st + e).unwrap_or(html.len());
        let tag = &html[st..en];
        let key = attr(tag, "property").or_else(|| attr(tag, "name"));
        if let (Some(k), Some(v)) = (key, attr(tag, "content")) {
            if k == "og:image" || k == "twitter:image" {
                imgs.push(abs(&v));
            }
            meta.entry(k).or_insert(json!(v));
        }
        p = en;
    }
    let title = between(&html, "<title>", "</title>", 0).map(|x| html_decode(x.0.trim()));
    Ok(json!({ "url": url, "title": title, "jsonld": jsonld, "meta": meta, "images": imgs }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn galerie_reihenfolge_und_hauptbild() {
        let c = Connection::open_in_memory().unwrap();
        db::migrate(&c).unwrap();
        let tmp = std::env::temp_dir().join(format!("kontor-media-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        c.execute("INSERT INTO articles(id, name, category, price, created_at, updated_at) VALUES ('A1','x','ski',100,'t','t')", []).unwrap();
        let mut png = vec![];
        image::DynamicImage::new_rgb8(40, 30).write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png).unwrap();
        let a = add_bytes(&c, &tmp, "A1", &png, "rot", Some("http://x/1.png")).unwrap();
        let b = add_bytes(&c, &tmp, "A1", &png, "", None).unwrap();
        assert_eq!(list(&c, "A1").unwrap().len(), 2);
        update(&c, "A1", &[json!({ "id": b, "color": "blau", "caption": "Seite" }), json!({ "id": a, "color": "rot", "caption": "" })]).unwrap();
        let l = list(&c, "A1").unwrap();
        assert_eq!((l[0]["id"].as_i64(), l[0]["color"].as_str()), (Some(b), Some("blau")));
        let first: String = c.query_row("SELECT image FROM articles WHERE id='A1'", [], |r| r.get(0)).unwrap();
        assert_eq!(Some(first.as_str()), l[0]["file"].as_str());
        remove(&c, &tmp, b).unwrap();
        assert_eq!(list(&c, "A1").unwrap().len(), 1);
        queue_url(&c, "A1", "http://x/2.jpg", "").unwrap();
        queue_url(&c, "A1", "http://x/2.jpg", "").unwrap();
        assert_eq!(list(&c, "A1").unwrap().len(), 2);
        assert!(check_url("file:///etc/passwd").is_err());
        let _ = std::fs::remove_dir_all(tmp);
    }
}
