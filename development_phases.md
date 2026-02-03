# PazarlamaMaps (ZAKROM PRO) Teknik Mimari ve Geliştirme Süreci

Bu doküman, **PazarlamaMaps** projesinin teknik altyapısını, mimari kararlarını ve geliştirme yaşam döngüsünü (SDLC) 4 ana fazda, mühendislik perspektifiyle (**5N1K Methodolojisi**) detaylandırmaktadır.

---

## 🏗 FAZ 1: Mimari Kurulum ve Veri Katmanı (Core & Data Layer)

**NE (What)?**
Projenin "Backend-for-Frontend" (BFF) mimarisinin kurgulanması ve Google Places API (New) entegrasyonu. Ham veri akışının sağlanması.

**NEDEN (Why)?**
İstemci tarafında (Client-side) API anahtarı güvenliğini sağlamak, CORS sorunlarını aşmak ve veri trafiğini sunucu tarafında optimize etmek (Field Masking) için.

**NASIL (How)?**
*   **Tech Stack:** Next.js 14 (App Router), Server Actions, TypeScript.
*   **API Entegrasyonu:** `places:searchText` endpoint'i kullanıldı. `X-Goog-FieldMask` header'ı ile sadece gerekli alanlar (`displayName`, `location`, `nationalPhoneNumber`, `userRatingCount` vb.) çekilerek payload boyutu %70 oranında düşürüldü.
*   **Tip Güvenliği:** TypeScript interface'leri (`PlaceResult`) ile API yanıtları strict typing işlemine tabi tutuldu.

**NEREDE (Where)?**
`src/app/actions/search-places.ts` (Sunucu Katmanı).

**NE ZAMAN (When)?**
Proje Başlangıcı (Sprint 1 - Altyapı).

**KİM (Who)?**
Backend Architect & Lead Developer.

---

## 🎨 FAZ 2: UI/UX Mühendisliği ve Component Mimarisi

**NE (What)?**
Atomik tasarım prensiplerine uygun, yeniden kullanılabilir UI bileşenlerinin (Components) geliştirilmesi ve "Glassmorphism" tasarım dilinin uygulanması.

**NEDEN (Why)?**
Yüksek etkileşimli (Interactive) bir veri dashboard'u sunmak, CLS (Cumulative Layout Shift) skorlarını optimize etmek ve marka kimliği (ZAKROM PRO) oluşturmak.

**NASIL (How)?**
*   **Styling:** Tailwind CSS Just-in-Time (JIT) modu ile utility-first yaklaşım.
*   **State Management:** React `useState` ve `useMemo` hook'ları ile client-side filtreleme ve sıralama lojiği (`ResultsTable.tsx`).
*   **Performance:** `next/image` ile LCP (Largest Contentful Paint) optimizasyonu sağlandı.
*   **Responsive Design:** CSS Grid ve Flexbox ile mobil-first yaklaşım benimsendi.

**NEREDE (Where)?**
Client Components (`src/components/ResultsTable.tsx`, `Sidebar`).

**NE ZAMAN (When)?**
Sprint 2 - Arayüz ve Deneyim.

**KİM (Who)?**
Frontend Engineer & UI/UX Designer.

---

## 📈 FAZ 3: Veri Görselleştirme ve Coğrafi Analiz (Analytics & GIS)

**NE (What)?**
Toplanan yapısal verinin (Structured Data) iş zekasına (Business Intelligence) dönüştürülmesi. Isı haritaları ve istatistiksel grafikler.

**NEDEN (Why)?**
Kullanıcıya ham liste yerine "karar destek mekanizması" sunmak. Bölgesel yoğunlukları (Cluster) ve kalite metriklerini görselleştirmek.

**NASIL (How)?**
*   **GIS (Coğrafi Bilgi Sistemi):** `@vis.gl/react-google-maps` kütüphanesi ile WebGL tabanlı harita render edildi. `Visualization Library` kullanılarak koordinat verileri `HeatmapLayer`'a dönüştürüldü.
*   **Charting:** `Recharts` kütüphanesi kullanılarak SVG tabanlı, responsive grafikler (Bar, Scatter, Pie) oluşturuldu.
*   **Data Transformation:** Ham veri, grafik kütüphanelerinin beklediği formata (Array of Objects) `reduce` ve `map` fonksiyonları ile client-side'da dönüştürüldü.

**NEREDE (Where)?**
`src/components/AnalyticsView.tsx`, `src/components/AnalyticsMap.tsx`.

**NE ZAMAN (When)?**
Sprint 3 - Feature Implementation.

**KİM (Who)?**
Data Visualization Specialist.

---

## 🚀 FAZ 4: Ölçeklenebilirlik, Optimizasyon ve CI/CD

**NE (What)?**
Sistemin limitlerinin artırılması (Pagination Loop), veri tutarlılığının sağlanması (Persistence) ve Production ortamına (Vercel) dağıtım pipeline'ının kurulması.

**NEDEN (Why)?**
Single-Request limitasyonlarını (20 items) aşmak ve "Enterprise-level" veri ihracı (Export) yeteneği kazanmak.

**NASIL (How)?**
*   **Algorithmic Fetching:** Recursive (veya loop-based) bir yapı ile `nextPageToken` kullanılarak asenkron `fetch` zinciri kuruldu. Tek tetikleme ile ~60 item (3 sayfa) veri çekilip memory'de birleştirildi (`search-places.ts`).
*   **Local Persistence:** `window.localStorage` API ile arama geçmişi durum yönetimi (State Persistence) sağlandı.
*   **Binary Data Processing:** Client-side CSV oluşturma algoritması (`Blob` creation) ile backend'e yük bindirmeden veri dışa aktarımı sağlandı.

**NEREDE (Where)?**
Backend Logic, Browser Storage API, Vercel Edge Network.

**NE ZAMAN (When)?**
Sprint 4 - Release & Optimization.

**KİM (Who)?**
DevOps Engineer & Full-stack Developer.

---

## 🚀 FAZ 5: Canlı Ortam ve Sürekli Entegrasyon (CI/CD) [SÜREÇTE]

**NE (What)?**
Projenin **Vercel** bulut platformuna dağıtılması (Deployment), Git tabanlı versiyon kontrol sistemi ile entegrasyonun sağlanması ve Production ortamı konfigürasyonları.

**NEDEN (Why)?**
Uygulamanın global erişilebilirliğini sağlamak, HTTPS (SSL) güvenliği altına almak ve "Serverless Functions" mimarisiyle sunucu maliyetlerini ortadan kaldırarak ölçeklenebilirliği otomatize etmek.

**NASIL (How)?**
*   **Version Control:** Proje, yerel ortamdan `git remote` komutları ile GitHub reposuna push ediliyor.
*   **Automated Builds:** Vercel pipeline'ı GitHub'daki `main` branch'indeki her değişikliği (commit) algılayıp otomatik build sürecini başlatacak şekilde konfigüre ediliyor.
*   **Environment Management:** API anahtarları (`GOOGLE_MAPS_API_KEY`) kod içerisinden çıkarılarak Vercel üzerindeki şifreli "Environment Variables" alanına taşınıyor.
*   **Edge Network:** Statik assetler CDN (Content Delivery Network) üzerine dağıtılarak global erişim hızı maksimize ediliyor.

**NEREDE (Where)?**
Terminal (`git`), GitHub, Vercel Dashboard.

**NE ZAMAN (When)?**
Şu An (Devam Ediyor).

**KİM (Who)?**
Cloud Architect & Release Manager.
