Eine Datei je Marke: brands/<marke>.json = Liste von Artikeln (2–4 pro Marke), jeweils:
{
 "brand": "Salomon", "name": "...", "article_no": "Herstellernummer", "gender": "Herren|Damen|Unisex|Kinder",
 "category": "jacken|hosen|schuhe|ski|shirts|rucksaecke|acc",
 "model_year": "2025/26", "price_eur": 199.95 (UVP brutto, von der Markenseite),
 "short": "Kurztext (1 Satz)", "description": "Beschreibung aus der Seite, Deutsch",
 "features": ["..."], "material": {"Obermaterial": "...", "Futter": "...", "Sohle": "..."}, "care": ["..."],
 "weight_g": 000, "origin": "Herstellungsland falls angegeben", "technologies": ["z. B. GORE-TEX"],
 "colors": [{"name": "Schwarz", "images": ["https://…direkte Bild-URLs…"]}],
 "sizes": ["S","M","L"], "source_url": "Produktseite"
}
Nur echte Daten der offiziellen Markenseite. Nichts erfinden. Bild-URLs müssen direkt auf Bilddateien zeigen
(per curl -I geprüft: Content-Type image/*, Status 200), mindestens 3 Bilder je Artikel wenn vorhanden.
