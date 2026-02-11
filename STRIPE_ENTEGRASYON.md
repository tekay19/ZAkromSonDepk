# Stripe Gerçek Entegrasyon Rehberi

Mock modundan gerçek Stripe entegrasyonuna geçiş adımları.

---

## 1. Stripe Hesabı Oluştur

1. [dashboard.stripe.com](https://dashboard.stripe.com) → Hesap aç
2. Hesap doğrulamasını tamamla (banka bilgileri vb.)

## 2. API Anahtarlarını Al

1. **Dashboard → Developers → API Keys**
2. Kopyala:
   - `Secret key` → `sk_test_...` (test) veya `sk_live_...` (canlı)
   - `Publishable key` → `pk_test_...`

## 3. `.env` Güncelle

```env
# Mock'u kapat
NEXT_PUBLIC_ENABLE_STRIPE_MOCK=false

# Stripe anahtarları
STRIPE_SECRET_KEY=sk_test_GERCEK_ANAHTAR
STRIPE_PUBLISHABLE_KEY=pk_test_GERCEK_ANAHTAR
```

## 4. Price ID'leri Oluştur (Otomatik)

```bash
npx tsx scripts/stripe-setup-prices.ts
```

Bu script:
- 3 abonelik planı oluşturur ($39, $129, $349)
- 3 kredi paketi oluşturur ($15, $59, $199)
- `.env`'e Price ID'leri otomatik yazar

> **Manuel oluşturmak istersen:** Dashboard → Products → Add Product → Recurring → Price ID'yi kopyala

## 5. Webhook Kur

1. **Dashboard → Developers → Webhooks → Add endpoint**
2. URL: `https://SENIN-DOMAIN.com/api/webhooks/stripe`
3. Events seç:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Signing secret'ı kopyala:

```env
STRIPE_WEBHOOK_SECRET=whsec_GERCEK_SECRET
```

### Lokalde Webhook Test

```bash
# Stripe CLI kur
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forwarding başlat
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## 6. Mock Dosyalarını Kaldır (Opsiyonel)

Mock kodları `NEXT_PUBLIC_ENABLE_STRIPE_MOCK=false` olduğunda zaten devre dışı kalır. Tamamen kaldırmak istersen:

```bash
# Mock dosyaları
rm src/app/checkout/mock/page.tsx
rm src/app/actions/mock-payment.ts
```

Ayrıca şu dosyalardan mock bloklarını kaldır:
- `src/app/actions/create-checkout.ts` → `if (STRIPE_MOCK)` bloğu
- `src/app/actions/create-topup-checkout.ts` → `if (STRIPE_MOCK)` bloğu
- `src/app/actions/create-portal.ts` → `if (STRIPE_MOCK)` bloğu

## 7. Canlıya Geçiş Checklist

| Adım | Durum |
|---|---|
| Stripe hesap doğrulaması | ☐ |
| `STRIPE_SECRET_KEY` (live) | ☐ |
| `STRIPE_PUBLISHABLE_KEY` (live) | ☐ |
| Price ID'ler oluşturuldu | ☐ |
| Webhook endpoint eklendi | ☐ |
| `STRIPE_WEBHOOK_SECRET` | ☐ |
| `NEXT_PUBLIC_ENABLE_STRIPE_MOCK=false` | ☐ |
| Test ödeme yapıldı (test kartı: 4242...) | ☐ |
| Live anahtarlara geçildi | ☐ |

---

## Fiyat Tablosu (Referans)

| Plan | Fiyat | Kredi | Stripe Ürün |
|---|---|---|---|
| FREE | $0 | 50 | — |
| STARTER | $39/ay | 500 | Recurring |
| PRO (Growth) | $129/ay | 2,500 | Recurring |
| BUSINESS | $349/ay | 7,500 | Recurring |

| Kredi Paketi | Fiyat | Kredi | Stripe Ürün |
|---|---|---|---|
| pack_1000 | $15 | 1,000 | One-time |
| pack_5000 | $59 | 5,000 | One-time |
| pack_20000 | $199 | 20,000 | One-time |
