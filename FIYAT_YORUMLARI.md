# Fiyatlandırma Yorumları (Unit Economics)

Bu doküman; plan fiyatlarının, kredi sisteminin ve Google Places API maliyetlerinin (tahmini) nasıl dengelendiğini ve “zarara sokmayacak” frenlerin nerede uygulandığını açıklar.

## Planlar ve Aylık Kredi

Plan tanımları: `/Users/semihtekay/Desktop/mapsSass/src/lib/plans.ts` ve fiyat kartları: `/Users/semihtekay/Desktop/mapsSass/src/lib/constants/pricing.ts`.

- **FREE**: `$0` / `50 kredi`
- **STARTER**: `$39` / `500 kredi`
- **GROWTH (PRO)**: `$129` / `2,500 kredi`
- **BUSINESS**: `$349` / `7,500 kredi`

## Kredi Maliyetleri (Aksiyon Bazlı)

Kaynak: `/Users/semihtekay/Desktop/mapsSass/src/lib/constants/pricing.ts`

- Derin arama başlatma: `15 kredi` (`CREDIT_COSTS.SEARCH`)
- Sayfa yükleme (Load more): plan bazlı (`CREDIT_COSTS_BY_TIER.PAGE_LOAD`)
  - FREE `2`, STARTER `1`, PRO `1`, BUSINESS `1`
- Email kilidi açma: `3 kredi / lead` (`CREDIT_COSTS.UNLOCK_CONTACT`)
- Export: CSV/XLSX/JSON `0 kredi`, PNG `3 kredi`, PDF `5 kredi`

Not: Deep pagination artık yeni Google taraması başlatmaz; sadece cache’ten sayfalar (dış API maliyeti eklemez).

## Google Places API Tahmini Maliyet Varsayımı

Kaynak: `/Users/semihtekay/Desktop/mapsSass/src/lib/gateway/google-places.ts`

- Varsayılan “call başı” tahmini maliyet (USD): `GOOGLE_PLACES_ESTIMATED_COST_PER_CALL_USD` (default `0.017`)
- Bu değer faturalandırma değil, **tahmini** guardrail amaçlıdır.

## Arama Başına Google Çağrı Bütçesi (Derin Arama)

Kaynak: `/Users/semihtekay/Desktop/mapsSass/src/app/actions/search-places.ts`

Derin aramanın ilk başlatılmasında, dış API harcamasını sınırlamak için “Google API çağrı bütçesi (cap)” uygulanır:

- FREE: max `8` çağrı
- STARTER: max `10` çağrı
- PRO: max `15` çağrı
- BUSINESS: max `20` çağrı

Bu cap, arama başına worst-case tahmini maliyeti şu şekilde verir:

`maliyet_usd ≈ max_calls * GOOGLE_PLACES_ESTIMATED_COST_PER_CALL_USD`

Örnek (varsayılan `0.017` ile):

- STARTER arama başına: `10 * 0.017 = $0.17`
- PRO arama başına: `15 * 0.017 = $0.255`
- BUSINESS arama başına: `20 * 0.017 = $0.34`

## Plan Bazlı Aylık “Maks $/Ay Google Spend” Hedefi

Kaynak: `/Users/semihtekay/Desktop/mapsSass/src/lib/gateway/google-places.ts`

Her Google Places çağrısı sonrası Redis’te “tahmini spend” biriktirilir ve **çağrıdan önce** limitler kontrol edilir.

Varsayılan per-user aylık limitler (USD):

- `GOOGLE_PLACES_MONTHLY_BUDGET_FREE_USD` (default `2`)
- `GOOGLE_PLACES_MONTHLY_BUDGET_STARTER_USD` (default `10`)
- `GOOGLE_PLACES_MONTHLY_BUDGET_PRO_USD` (default `60`)
- `GOOGLE_PLACES_MONTHLY_BUDGET_BUSINESS_USD` (default `220`)

Global frenler:

- `GOOGLE_PLACES_GLOBAL_DAILY_BUDGET_USD` (fallback: `GOOGLE_PLACES_DAILY_BUDGET`) default `10`
- `GOOGLE_PLACES_GLOBAL_MONTHLY_BUDGET_USD` default `0` (kapalı)

Bu limitler; beklenmeyen otomasyon, bug veya saldırı sonucu oluşabilecek harcama sıçramalarını kesmek içindir.

## Aylık Worst-Case Kârlılık Mantığı (Özet)

Kredi sistemi “kullanıcı aksiyonu” üzerinden kısıt koyar, Google bütçesi “dış maliyet” üstünden ikinci bir fren sağlar.

Arama kapasitesi (teorik):

- STARTER: `500 / 15 ≈ 33` arama
- PRO: `2500 / 15 ≈ 166` arama
- BUSINESS: `7500 / 15 = 500` arama

Worst-case Google çağrısı (derin arama cap’ine göre):

- STARTER: `33 * 10 = 330` çağrı → `330 * 0.017 ≈ $5.61`
- PRO: `166 * 15 = 2,490` çağrı → `2,490 * 0.017 ≈ $42.33`
- BUSINESS: `500 * 20 = 10,000` çağrı → `10,000 * 0.017 = $170.00`

Bu tablo, fiyatların ve cap’lerin “zarar etmeyecek” bantta kalması için referanstır.

## Business API (/api/v1/search) Metering

Kaynak: `/Users/semihtekay/Desktop/mapsSass/src/app/api/v1/search/route.ts`

- API erişimi sadece Business planında açık.
- Cache hit olduğunda bile yüksek hacimli kullanım mümkün olduğu için, cache hit isteklerinde küçük bir ücret kesilir:
  - `API_V1_CACHE_HIT_COST_CREDITS` (default `1`)
  - Transaction type: `API_CACHE_HIT`
- Cache miss durumunda normal arama maliyeti zaten `searchPlacesInternal` içinde düşer (15 kredi + sayfa yükleme vb.).

## Üretim İçin Önerilen Başlangıç Env Seti

```bash
# Google spend guardrails
GOOGLE_PLACES_ESTIMATED_COST_PER_CALL_USD=0.017
GOOGLE_PLACES_GLOBAL_DAILY_BUDGET_USD=10
GOOGLE_PLACES_GLOBAL_MONTHLY_BUDGET_USD=0

GOOGLE_PLACES_MONTHLY_BUDGET_FREE_USD=2
GOOGLE_PLACES_MONTHLY_BUDGET_STARTER_USD=10
GOOGLE_PLACES_MONTHLY_BUDGET_PRO_USD=60
GOOGLE_PLACES_MONTHLY_BUDGET_BUSINESS_USD=220

# API metering
API_V1_CACHE_HIT_COST_CREDITS=1
```

