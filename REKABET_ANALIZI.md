# Detaylı Rekabet Analizi ve Stratejik Konumlandırma

Piyasadaki önde gelen rakiplerin güncel fiyatlandırma, limit ve özellik yapıları incelenerek Zakrom Pro'nun avantajları netleştirilmiştir.

## 1. Rakip İncelemesi

### 👻 PhantomBuster
Birçok otomasyon aracı sunsa da Google Maps tarafında "Execution Time" (çalışma süresi) kısıtlaması en büyük darboğazdır.
- **Fiyat:** $56/ay (Starter).
- **Kısıt:** Günde 2 saat, Ayda 20 saat çalışma süresi.
- **Risk:** Kullanıcı aramanın ne kadar süreceğini bilemez. Çalışma süresi biterse işlem yarım kalır.
- **Export:** 500 Email kredisi ile sınırlı.

### 🚀 Apollo.io
B2B database devidir, ancak küçük işletme (Local SMB) verisi Google Maps kadar taze değildir.
- **Fiyat:** $49/ay (Basic) - $79/ay (Professional).
- **Export:** Ayda 1,000 (Basic) veya 2,000 (Pro) export hakkı.
- **Ek Maliyet:** Export limiti dolunca kredi satın almak gerekir ($0.20/kredi). Sınırsız export sadece $119+ paketlerde veya çok kısıtlıdır.

### 📍 Outscraper
"Kullandıkça öde" modeline sahiptir ancak büyük hacimli işlerde çok pahalılaşır.
- **Fiyat:** $3 / 1,000 yer.
- **Maliyet Örneği:** Ayda 10,000 işletme taramak isterseniz **$30** ödersiniz.
- **Zakrom Avantajı:** Business paketimizde 7,500 kredi (~500 arama) ile teorik olarak **10,000 - 20,000 işletme** tarayabilirsiniz. Bu hacim Outscraper'da **$30-$60** bandına denk gelirken, bizde ekstra özelliklerle (Email bulma, CRM) birlikte sunulur.

### 🐙 Apify
Teknik kullanıcılar içindir, "Actor" başına ve sonuç başına ücret alır.
- **Fiyat:** $4 / 1,000 yer + $2 / 1,000 email zenginleştirme.
- **Örnek:** 5,000 işletme bulup emaillerini çekmek: ($4 + $2) x 5 = **$30**.
- **Karmaşıklık:** Proxy ayarı, actor kirası, dataset yönetimi zordur. Son kullanıcı dostu değildir.

---

## 2. Zakrom Pro'nun "Killer" Avantajları

| Özellik | Zakrom Pro | PhantomBuster | Apollo.io | Outscraper | Apify |
|---|---|---|---|---|---|
| **Başlangıç Fiyatı** | **$39** | $56 | $49 | Değişken | Değişken ($30+) |
| **Export Limiti** | **SINIRSIZ ♾️** | Kredili | 1,000/ay | Adet Başı | Adet Başı |
| **Çalışma Mantığı** | **Grid Scan (Kapsamlı)** | Standart Arama | Veritabanı | Grid Scan | Grid Scan |
| **Kullanım Limiti** | **Kredi Bazlı (Net)** | Saat Bazlı (Belirsiz) | Kredi Bazlı | Adet Bazlı | Event Bazlı (Karışık) |
| **Email Bulma** | **Dahili (Pro)** | Ekstra Kredi | Dahili | Ekstra Ücret | Ekstra Ücret |
| **Hedef Kitle** | **KOBİ & Ajans** | Growth Hacker | Kurumsal Satış | Developer | Developer |

---

## 3. Stratejik Konumlandırma Önerileri

### 🛡️ "Kullandığın Kadar Değil, İndirdiğin Kadar Özgürsün"
Rakiplerin (Apollo, Outscraper) en büyük gelir modeli **"Veriyi İndirme"** (Export) aşamasında para istemektir. Biz bu bariyeri kaldırarak kullanıcıya güven veriyoruz: *"Bulduğun veri senindir, dilediğin kadar indir."*

### ⏱️ "Zamanla Değil, Sonuçla Yarış"
PhantomBuster'ın "20 saatlik süre bitti" stresi bizde yok. Kullanıcı 500 kredi ile ne kadar sonuç alacağını bilir.

### 🇹🇷 "Yerel Güç, Global Standart"
Rakiplerin hiçbiri Türkiye'deki;
- **Mahalle/Sokak yapısını**
- **Cep telefonu formatlarını** (+90 53x)
- **Türkçe karakter arama nüanslarını**
bizim kadar iyi yönetmiyor.

### 📉 "Giriş Bariyeri Yok"
- $39 fiyat noktası hem bireysel girişimciler hem de küçük ajanslar için "Dene ve Gör" kararı vermeyi çok kolaylaştırır.
- Rakiplerde anlamlı bir iş yapmak için gereken minimum tutar genelde $50-$60 bandından başlar.

---

## 4. Objektif SWOT Analizi

### ✅ Güçlü Yönler (Avantajlar)
- **Fiyat/Performans:** Giriş seviyesi ($39) rakiplere göre çok daha ulaşılabilir.
- **Export Hakkı:** Sınırsız export, kullanıcıyı sistemde tutan en büyük özellik.
- **Yerel Odak:** Türkiye adres/telefon formatlarını rakiplerden daha iyi işliyor.

### ⚠️ Zayıf Yönler & Riskler (Dezavantajlar)
- **Marka Bilinirliği:** Apollo ve PhantomBuster global devler. Güven sorunu yaşanabilir.
- **Ekosistem:** Rakiplerin binlerce entegrasyonu (Zapier, HubSpot, Salesforce) var. Bizde şu an sınırlı.
- **Veri Kalitesi:** Apollo kendi B2B veritabanına sahip. Biz Google verisine bağımlıyız. Google verisi bazen eski olabilir (kapanan dükkanlar vs.)
- **Teknik Bağımlılık:** Google Places API değişiklikleri bizi doğrudan etkiler.

### 🎯 Fırsatlar
- Yerel pazarda (Türkiye) domine edici bir "Google Maps Scraper" yok.
- KOBİ'lerin dijitalleşme ihtiyacı artıyor, uygun fiyatlı tool arayışı var.

### 🛑 Tehditler
- Google'ın API fiyatlarını artırması veya scraping'i zorlaştırması.
- Rakiplerin Türkiye fiyatlandırması yapması (Düşük ihtimal).

---

## Sonuç
Zakrom Pro; **teknik karmaşıklığı soyutlayarak** (Outscraper/Apify aksine), **export limitlerini kaldırarak** (Apollo aksine) ve **net bir fiyatlandırma sunarak** (PhantomBuster aksine) pazarda **"En Erişilebilir ve Cömert B2B Lead Aracı"** pozisyonunu almalıdır. Ancak **entegrasyon eksikliği** ve **Google bağımlılığı** uzun vadede çözülmesi gereken risklerdir.
