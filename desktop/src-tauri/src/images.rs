//! Bilder: Artikelbilder und Firmenlogo im Datenverzeichnis (Unterordner „bilder“).
//! Beim Import wird verkleinert (max. 900 px) und als JPEG bzw. PNG (Logo, mit Transparenz) gespeichert.
//! Für den Bondrucker wird das Logo in ein 1-Bit-Rasterbild (ESC/POS „GS v 0“) umgerechnet.

use image::{imageops::FilterType, DynamicImage, ImageFormat};
use std::fs;
use std::path::{Path, PathBuf};

pub fn dir(data_dir: &Path) -> PathBuf {
    data_dir.join("bilder")
}

fn safe(id: &str) -> String {
    id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' }).collect()
}

fn load(src: &Path) -> Result<DynamicImage, String> {
    let meta = fs::metadata(src).map_err(|e| format!("Datei nicht lesbar: {e}"))?;
    if meta.len() > 25 * 1024 * 1024 {
        return Err("Bild ist größer als 25 MB".into());
    }
    image::ImageReader::open(src)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| format!("Kein unterstütztes Bild (JPEG, PNG, WebP): {e}"))
}

/// Artikelbild übernehmen. Liefert den neuen Dateinamen (relativ zum Bilderordner).
pub fn import_article(data_dir: &Path, article_id: &str, src: &Path) -> Result<String, String> {
    let img = load(src)?;
    let img = if img.width() > 900 || img.height() > 900 { img.resize(900, 900, FilterType::Lanczos3) } else { img };
    let d = dir(data_dir);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let name = format!("{}-{}.jpg", safe(article_id), chrono::Local::now().format("%Y%m%d%H%M%S"));
    let rgb = DynamicImage::ImageRgb8(flatten_white(&img));
    let mut f = fs::File::create(d.join(&name)).map_err(|e| e.to_string())?;
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut f, 85);
    enc.encode_image(&rgb).map_err(|e| e.to_string())?;
    Ok(name)
}

/// Logo übernehmen (PNG, Transparenz bleibt).
pub fn import_logo(data_dir: &Path, src: &Path) -> Result<String, String> {
    let img = load(src)?;
    let img = if img.width() > 1200 || img.height() > 600 { img.resize(1200, 600, FilterType::Lanczos3) } else { img };
    let d = dir(data_dir);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let name = format!("logo-{}.png", chrono::Local::now().format("%Y%m%d%H%M%S"));
    img.save_with_format(d.join(&name), ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(name)
}

pub fn remove(data_dir: &Path, name: &str) {
    if !name.contains('/') && !name.contains('\\') && !name.contains("..") {
        let _ = fs::remove_file(dir(data_dir).join(name));
    }
}

fn flatten_white(img: &DynamicImage) -> image::RgbImage {
    let rgba = img.to_rgba8();
    image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        let p = rgba.get_pixel(x, y).0;
        let a = p[3] as u32;
        let mix = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
        image::Rgb([mix(p[0]), mix(p[1]), mix(p[2])])
    })
}

/// Logo als ESC/POS-Rasterbild (GS v 0) mit Floyd-Steinberg-Dithering. `max_dots`: 384 (58 mm) bzw. 512 (80 mm).
pub fn escpos_raster(path: &Path, max_dots: u32) -> Result<Vec<u8>, String> {
    let img = load(path)?;
    let w = img.width().min(max_dots).max(8);
    let img = img.resize(w, (w * 3).min(600), FilterType::Lanczos3);
    let rgb = flatten_white(&img);
    let (w, h) = rgb.dimensions();
    let mut gray: Vec<f32> = rgb.pixels().map(|p| 0.299 * p.0[0] as f32 + 0.587 * p.0[1] as f32 + 0.114 * p.0[2] as f32).collect();
    let bw = w.div_ceil(8);
    let mut bits = vec![0u8; (bw * h) as usize];
    for y in 0..h {
        for x in 0..w {
            let i = (y * w + x) as usize;
            let old = gray[i];
            let new = if old < 128.0 { 0.0 } else { 255.0 };
            if new == 0.0 {
                bits[(y * bw + x / 8) as usize] |= 0x80 >> (x % 8);
            }
            let err = old - new;
            let mut spread = |dx: i64, dy: i64, f: f32| {
                let (nx, ny) = (x as i64 + dx, y as i64 + dy);
                if nx >= 0 && nx < w as i64 && ny < h as i64 {
                    gray[(ny as u32 * w + nx as u32) as usize] += err * f;
                }
            };
            spread(1, 0, 7.0 / 16.0);
            spread(-1, 1, 3.0 / 16.0);
            spread(0, 1, 5.0 / 16.0);
            spread(1, 1, 1.0 / 16.0);
        }
    }
    let mut out = vec![0x1B, 0x61, 1, 0x1D, 0x76, 0x30, 0x00, (bw & 0xFF) as u8, (bw >> 8) as u8, (h & 0xFF) as u8, (h >> 8) as u8];
    out.extend(bits);
    out.extend([b'\n', 0x1B, 0x61, 0]);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    use image::GenericImageView;

    #[test]
    fn bild_und_logo_raster() {
        let tmp = std::env::temp_dir().join(format!("kontor-img-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let src = tmp.join("in.png");
        // 1600×800, links schwarz, rechts transparent
        let img = image::RgbaImage::from_fn(1600, 800, |x, _| if x < 800 { image::Rgba([0, 0, 0, 255]) } else { image::Rgba([0, 0, 0, 0]) });
        img.save(&src).unwrap();
        let name = import_article(&tmp, "A1/../x", &src).unwrap();
        assert!(name.starts_with("A1____x-") && name.ends_with(".jpg"), "{name}");
        let saved = image::open(dir(&tmp).join(&name)).unwrap();
        assert_eq!(saved.dimensions(), (900, 450));
        let r = escpos_raster(&src, 384).unwrap();
        assert_eq!(&r[3..7], &[0x1D, 0x76, 0x30, 0x00]);
        let bw = r[7] as usize | (r[8] as usize) << 8;
        assert_eq!(bw, 48);
        let row0 = &r[11..11 + bw];
        assert!(row0[..23].iter().all(|b| *b == 0xFF), "linke Hälfte schwarz");
        assert!(row0[25..].iter().all(|b| *b == 0), "rechte Hälfte (transparent) weiß");
        let _ = fs::remove_dir_all(&tmp);
    }
}
