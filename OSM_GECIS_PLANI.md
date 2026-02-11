# 🌍 Google Maps'ten OpenStreetMap'e (OSM) Geçiş Planı

Google bağımlılığını bitirmek için OSM Planet verisini işleyip kendi veritabanımızı kurma stratejisi.

## 1. Altyapı Hazırlığı (PostGIS)
OSM verisi coğrafi sorgular (bu bölgedeki kafeler vb.) gerektirir. Standart PostgreSQL yetmez.
- **Gereken:** PostgreSQL + **PostGIS** eklentisi.
- **Neden:** `ST_DWithin`, `ST_Contains` gibi fonksiyonlarla "bu harita karesindeki işletmeleri getir" sorgusu milisaniyeler sürer.

## 2. Veri İşleme (Pipeline)
Planet dosyası (pbf) çok büyüktür (>70GB). Hepsini açmak yerine sadece işimize yarayanı almalıyız.

### Adım A: Filtreleme (Osmium Tool)
Tüm yolları, evleri, nehirleri atıp sadece **işletmeleri** (POI) alacağız.
```bash
osmium tags-filter planet-latest.osm.pbf \
  n/amenity \
  n/shop \
  n/office \
  n/craft \
  n/tourism \
  -o businesses.osm.pbf
```
*Sonuç: 70GB'lık dosya ~2-5GB'a düşer.*

### Adım B: İçeri Aktarma (osm2pgsql veya Imposm3)
Filtrelenmiş veriyi PostGIS veritabanına aktarma.
- **Araç:** `osm2pgsql` (Standart) veya `imposm3` (Go tabanlı, hızlı schema mapping).
- **Hedef Tablo:** `Place` tablosuna benzer bir yapı.

## 3. Hibrit Model (OSM + Zenginleştirme)
OSM'de "Cafe X"in koordinatı vardır ama **telefonu, web sitesi veya email'i** genellikle eksiktir.

**Strateji:**
1.  **Omurga (OSM):** İşletme adını ve konumunu OSM'den bedavaya al. (Google Search maliyeti = 0)
2.  **Kas (Zenginleştirme):**
    - Bulduğumuz işletme ismini Google'da değil, **kendi scraper'ımızla** web'de veya sosyal medyada arat.
    - Veya Google Places API'yi sadece "Contact Details" için çağır (Search maliyetinden kurtulursun).

## 4. Maliyet Etkisi
| Kalem | Mevcut (Full Google) | Yeni (OSM + Hibrit) |
|---|---|---|
| Arama (Search) | Maliyetli ($$) | **Bedava (0)** |
| Detay (Details) | Maliyetli ($$) | Düşük ($) / Scraper (0) |
| Güncellik | Yüksek | Orta (Topluluk bazlı) |

## 5. Yol Haritası
1.  [ ] PostGIS kurulumu
2.  [ ] Türkiye OSM PBF dosyasını indir (geofabrik.de)
3.  [ ] `osmium` ile sadece işletmeleri filtrele
4.  [ ] Veritabanına import et ve `Settings` sayfasında "Veri Kaynağı: OSM" seçeneği ekle
5.  [ ] Google bağımlılığını `%90` azalt 🚀
