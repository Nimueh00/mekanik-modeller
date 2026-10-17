# Mekanik Saat — Üretim Planı

Üretim direktörünün takip belgesi: paketler, bağımlılıklar, kararlar, denetim sonuçları.
Kod `saat/src`, testler `saat/tests` altında. `motor/` klasörüne dokunulmaz.

## Temel çizgi

- `motor` @ `988c2dc`: `npm test` 8 dosya / 59 test yeşil, `npm run build` temiz.

## Kararlar

| # | Karar | Gerekçe |
|---|-------|---------|
| K1 | `saat/` bağımsız bir Vite + TS + Three.js uygulaması; `motor/src/core` birebir **kopyalanır** (çatallanır), ortak paket yapılmaz. Kopyanın kaynağı `988c2dc`. | `motor/` dokunulmaz; göreli içe aktarma iki ayrı `three` kopyası (instanceof hataları) riski taşır. Çatal, saatin `core`'u gerektiğinde kendi başına genişletmesine izin verir. |
| K2 | Sahne birimi: **1 birim = 0,1 mm** (saat 10× büyütülmüş çizilir). Şartname (`specs`) mm cinsinden yazılır, dönüşüm tek bir sabitle yapılır. | `core` yardımcıları mm ölçeğine ayarlı (örn. `gear.ts` taban yarıçapı ≥ 1, kesit tarama sıklığı, `extrude` en küçük derinliği 0,01). 0,1 mm birimiyle saat parçaları motor parçalarıyla aynı sayısal aralığa düşer. |
| K3 | `saat/src/core` değişikliği yalnızca bir paketin prompt'unda açıkça izin verilirse yapılır ve buraya kaydedilir. | Çatalın izlenebilir kalması. |
| K4 | Saat tipi: **onay bekliyor** — öneri: Unitas 6497 benzeri elle kurmalı cep saati mekanizması, küçük saniye (saat 9'da), 18.000 A/s (2,5 Hz), İsviçre tipi çatal (lever) çıkış. | Büyük, okunaklı parçalar; otomatik modül karmaşası yok; küçük saniye dördüncü çarkı doğrudan gösterir. |

## Paketler

Durum: ⏳ bekliyor · 🔨 işçide · 🔍 denetimde · ✅ kabul · ❌ ret

| Paket | İçerik | İşçi | Bağımlı olduğu | Durum |
|-------|--------|------|----------------|-------|
| P0 | İskelet: `saat/` projesi, `core` kopyası, yer tutucu sahne, duman testi | DeepSeek v4.1 flash | — | 🔨 |
| P1 | Şartname + kinematik çekirdek: diş sayıları, oranlar, vuruş hızı, zaman modeli (gerçek / yavaş / hızlı), çark açıları, testler | Opus 5.5 | P0, K4 | ⏳ |
| P2 | Saat dişlisi geometrisi (sikloidal/ogival yaklaşık profil, pinyon, kol/göbek) + ana plaka ve köprüler | Sonnet 5.5 | P1 | ⏳ |
| P3 | Çıkış mekanizması: çıkış çarkı, çatal (palet taşları), balans çarkı, spiral yay, makara/impuls taşı; geometri + animasyon | Opus 5.5 | P1, P2 | ⏳ |
| P4 | Montaj: dişli takımı, akrep-yelkovan takımı (motion works), kadran ve ibreler; kinematiğe bağlama | Sonnet 5.5 | P2, P3 | ⏳ |
| P5 | Kurma-ayar mekanizması (kurgu kolu, kayar pinyon, taç ve cırcır çarkı, tırnak), zemberek kutusu ve güç rezervi | Sonnet 5.5 | P4 | ⏳ |
| P6 | Arayüz: zaman ölçeği, demontaj katmanları, kamera ön ayarları, etiketler, parça bilgisi; saat malzemeleri (pirinç, rodyum, yakut, mavi çelik) | Sonnet 5.5 (+ Gemini kadran dokusu) | P4 | ⏳ |
| P7 | Ses: vuruşa bağlı tik-tak (Web Audio) | Gemini 4 argon (deneme) | P1 | ⏳ |
| P8 | İçerik: katalog metinleri, tur ve sınav metinleri | DeepSeek / GLM | P4 (parça listesi) | ⏳ |
| P9 | Tur, sınav, URL durumu, mobil, son denetim | Sonnet 5.5 | P6, P8 | ⏳ |

## Denetim kayıtları

_(henüz yok)_
