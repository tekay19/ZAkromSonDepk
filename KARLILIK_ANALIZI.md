# Üyelik Sistemi ve Kârlılık Analizi

Yeni fiyatlandırma yapısının, Google Places API maliyetleri ve kullanıcı limitleri baz alınarak yapılan detaylı kârlılık analizidir.

## Özet Tablo

| Paket | Fiyat | Kredi | Tahmini Kâr Marjı | Risk Seviyesi |
|---|---|---|---|---|
| **STARTER** | $39 | 500 | **~85%** | Çok Düşük |
| **PRO** | $129 | 2,500 | **~67%** | Düşük |
| **BUSINESS** | $349 | 7,500 | **~51%** | Orta |

---

## Detaylı Analiz

### 1. Starter Paketi ($39 / Ay)
- **Kredi:** 500
- **Arama Kapasitesi:** ~33 Arama (15 kredi/arama)
- **API Limiti:** Arama başına maks. 10 API çağrısı
- **Maksimum Maliyet Senaryosu:**
  - 33 arama × 10 API çağrısı = 330 Çağrı
  - 1000 çağrı maliyeti ortalama $17 (Text Search + Details)
  - Toplam Maliyet: **~$5.61**
- **Net Kâr:** $39 - $5.61 = **$33.39**

### 2. Pro (Growth) Paketi ($129 / Ay)
- **Kredi:** 2,500
- **Arama Kapasitesi:** ~166 Arama
- **API Limiti:** Arama başına maks. 15 API çağrısı
- **Maksimum Maliyet Senaryosu:**
  - 166 arama × 15 API çağrısı = 2,490 Çağrı
  - Maliyet: ($17 × 2.49) = **~$42.33**
- **Net Kâr:** $129 - $42.33 = **$86.67**

### 3. Business Paketi ($349 / Ay)
- **Kredi:** 7,500
- **Arama Kapasitesi:** ~500 Arama
- **API Limiti:** Arama başına maks. 20 API çağrısı
- **Maksimum Maliyet Senaryosu:**
  - 500 arama × 20 API çağrısı = 10,000 Çağrı
  - Maliyet: ($17 × 10) = **~$170.00**
- **Net Kâr:** $349 - $170 = **$179.00**

---

## Teknik Güvenlik Önlemleri (Doğrulandı ✅)

Sistemdeki kodlar incelendi ve maliyet kaçaklarını önleyen şu mekanizmalar doğrulandı:

1. **Arama Başına Google Çağrı Bütçesi (Cap):**
   - `/Users/semihtekay/Desktop/mapsSass/src/app/actions/search-places.ts` içinde derin arama başlatılırken plan bazlı “Google API çağrı bütçesi” uygulanır:
     - STARTER: 10 çağrı
     - PRO: 15 çağrı
     - BUSINESS: 20 çağrı
   - Bu cap; arama başına worst-case maliyeti hesaplanabilir ve kontrol altında tutar.

2. **Deep Pagination “Cache-Only” Yapı:**
   - “Daha fazla” (deep pagination) artık yeni Google taraması tetiklemez; sadece cache’ten sayfalar.
   - Böylece düşük kredi karşılığında yüksek dış API harcaması (zarar riski) oluşmaz.

3. **Plan Bazlı Aylık Spend Guardrail (USD):**
   - `/Users/semihtekay/Desktop/mapsSass/src/lib/gateway/google-places.ts` içinde her çağrı sonrası tahmini spend Redis’te biriktirilir.
   - Plan bazlı kullanıcı-ay limitleri aşılınca çağrı **fetch’e gitmeden** bloklanır.
   - Varsayılan hedefler için `/Users/semihtekay/Desktop/mapsSass/FIYAT_YORUMLARI.md` bakınız.

4. **Önbellekleme (Caching):**
   - Aynı aramayı tekrar yapan kullanıcılar API'ye gitmiyor, Redis/DB cache'ten yanıt alıyor. Bu durum kâr marjını daha da yukarı çeker.

## Sonuç
Mevcut fiyatlandırma ve kredi yapısı **sürdürülebilir ve kârlıdır**.
- En kötü senaryoda bile (kullanıcı tüm kredilerini en pahalı arama türüyle bitirse bile) **%50'nin üzerinde** brüt kâr bırakmaktadır.
- Ortalama kullanımda (tekrar aramalar, basit aramalar dahil) kâr marjı **%70-80** bandına çıkacaktır.
