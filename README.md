# PazarlamaMaps (ZAKROM PRO)

**PazarlamaMaps**, işletmeleri keşfetmek, analiz etmek ve potansiyel müşteri (lead) listeleri oluşturmak için geliştirilmiş modern bir web uygulamasıdır. Google Maps Places API (New) gücünü kullanarak detaylı işletme verilerine erişim sağlar.

## 🚀 Proje Hakkında

Bu uygulama, pazarlama profesyonelleri ve satış ekipleri için tasarlanmıştır. Kullanıcılar belirli bir bölgedeki işletmeleri (örneğin "İstanbul'daki spor salonları") arayabilir, bu işletmelerin iletişim bilgilerini, puanlarını ve yorum sayılarını görüntüleyebilir, harita üzerinde yoğunluk analizi yapabilir ve sonuçları Excel/CSV formatında indirebilir.

## 🛠 Kullanılan Teknolojiler ve Mimari

Proje, performans ve ölçeklenebilirlik odaklı modern web teknolojileri ile geliştirilmiştir:

*   **Framework:** [Next.js 14](https://nextjs.org/) (App Directory) - React tabanlı full-stack framework.
*   **Dil:** [TypeScript](https://www.typescriptlang.org/) - Tip güvenliği ve daha iyi geliştirme deneyimi için.
*   **Stil:** [Tailwind CSS](https://tailwindcss.com/) - Hızlı ve özelleştirilebilir UI tasarımı.
*   **API Entegrasyonu:** Google Places API (New) - İşletme verileri için (`places:searchText` endpoint'i kullanıldı).
*   **Haritalama:** `@vis.gl/react-google-maps` - Google Maps entegrasyonu ve Isı Haritası (Heatmap) görselleştirmesi.
*   **Grafikler:** `recharts` - Veri analizi ve görselleştirme grafikleri.
*   **Ülke/Şehir Verisi:** `country-state-city` - Dinamik konum filtreleme.
*   **İkonlar:** `lucide-react` - Modern ikon seti.

## ✨ Öne Çıkan Özellikler

1.  **Gelişmiş İşletme Arama:**
    *   Kıta, Ülke, İl ve İlçe bazlı detaylı filtreleme.
    *   Anahtar kelime ile hedefli arama.
    *   Sayfalama desteği (Tek seferde ~50-60 sonuç çekebilen akıllı fetch yapısı).

2.  **Veri Tablosu ve Sıralama:**
    *   İşletme adı, puanı, yorum sayısı ve kategoriye göre sıralanabilir tablo.
    *   İşletme detaylarına (adres, telefon, web sitesi, çalışma saatleri) hızlı erişim.
    *   "Açık" veya "Kapalı" durum göstergeleri.

3.  **Görsel Analiz Paneli:**
    *   **Puan Dağılımı Grafiği:** Bölgedeki kalite seviyesini gösterir.
    *   **Kalite Matrisi:** Yorum sayısı ile puan arasındaki ilişkiyi analiz eder (Yıldız İşletmeler vs. Düşük Performans).
    *   **Kategori Dağılımı:** Bölgedeki baskın sektörleri pasta grafikle sunar.
    *   **Isı Haritası (Heatmap):** İşletmelerin harita üzerindeki yoğunluğunu görselleştirir.

4.  **Arama Geçmişi:**
    *   Son yapılan aramalar `localStorage` üzerinde tutulur ve sidebar/arama altında listelenir.
    *   Tek tıkla eski aramalara dönme imkanı.

5.  **Veri İhracı (Export):**
    *   Filtrelenmiş veya tüm sonuçları `.csv` formatında indirebilme özelliği.

## 📂 Proje Yapısı

```
/src
  /app
    /actions    # Server Actions (API istekleri burada güvenli şekilde yapılır)
      - search-places.ts  # Google API ile iletişim kuran ana fonksiyon
    page.tsx    # Ana uygulama sayfası ve navigasyon yapısı
    layout.tsx  # Genel layout ve font ayarları
  
  /components
    ResultsTable.tsx   # Sonuçların listelendiği ana tablo bileşeni
    SearchForm.tsx     # Arama formu, filtreler ve geçmiş bileşeni
    AnalyticsView.tsx  # Grafikler ve analiz paneli
    AnalyticsMap.tsx   # Isı haritası bileşeni
    PlaceDetailModal.tsx # İşletme detaylarını gösteren modal
    
  /lib
    utils.ts       # Yardımcı fonksiyonlar (cn, vb.)
    continents.ts  # Kıta haritalaması için statik veri
```

## ⚙️ Kurulum ve Çalıştırma

### 🪟 Windows Hızlı Kurulum
Projeyi Windows üzerinde hızlıca ayağa kaldırmak için hazırlanan PowerShell scriptini kullanabilirsiniz.
*Gereksinimler: Node.js ve Docker Desktop kurulu olmalıdır.*

1.  Repoyu klonlayın ve dizine gidin.
2.  PowerShell'de şu komutu çalıştırın:
    ```powershell
    .\setup_windows.ps1
    ```
    Bu script otomatik olarak:
    - Bağımlılıkları yükler (`npm install`)
    - Docker konteynerlerini (Postgres & Redis) başlatır
    - Veritabanı şemasını oluşturur (`prisma db push`)
    - Admin kullanıcısını oluşturur

3.  Uygulamayı başlatın:
    ```bash
    npm run dev
    ```

### 🍎 Mac/Linux Manuel Kurulum


1.  Repoyu klonlayın:
    ```bash
    git clone https://github.com/tekay19/PazarlamaMaps.git
    cd PazarlamaMaps
    ```
2.  Bağımlılıkları yükleyin:
    ```bash
    npm install
    ```
3.  Çevresel değişkenleri ayarlayın:
    *   `.env.local` dosyası oluşturun ve Google Maps API anahtarınızı ekleyin.
    ```env
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...
    GOOGLE_MAPS_API_KEY=AIzaSy...
    ```
    *   (Opsiyonel) Ölçekleme ve trafik kontrolü için:
    ```env
    GOOGLE_PLACES_MAX_CONCURRENCY=40
    GOOGLE_PLACES_GLOBAL_RPM=0
    GOOGLE_PLACES_USER_RPM=0
    GOOGLE_PLACES_FETCH_TIMEOUT_MS=10000
    REDIS_URL=redis://localhost:6379
    ```
4.  Geliştirme sunucusunu başlatın:
    ```bash
    npm run dev
    ```

## 🚀 Deployment (Vercel)

Proje Vercel üzerinde çalışmaya hazırdır. GitHub reponuzu Vercel'e bağlayıp, Environment Variables kısmına API anahtarlarınızı eklemeniz yeterlidir.

---
*Geliştirici: Semih Tekay | ZAKROM PRO*
