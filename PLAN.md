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
| K4 | Saat tipi (sahip kararı): **güncel otomatik kalibre, Hamilton H-10 / Powermatic 80 ailesinden esinli** (ETA C07 mimarisi): Ø 25,6 mm (11½‴), 21.600 A/s (3 Hz), ~80 saat güç rezervi, merkez saniye, tarih (saat 3), çift yönlü kuran rotor, İsviçre tipi çatal çıkış, antimanyetik spiral. | Sahip güncel Longines / Hamilton mekanizmaları istedi. İkisi de aynı ETA ailesinden; H-10'un 3 Hz'i çıkışı izlemeyi kolaylaştırır. Longines L888 (3,5 Hz, 72 sa, silisyum spiral) ileride bir şartname seçeneği olabilir. |
| K5 | Üreticilerin diş sayıları yayımlanmıyor: dişli takımını **kamuya açık özelliklere uyan, kendimiz tasarladığımız** sayılarla kurarız; her oran testle doğrulanır. Arayüzde marka adı/logosu yok, "… esinli" ifadesi kullanılır. | Uydurma "gerçek" veri yerine doğrulanabilir tutarlılık; marka hakları. |

## Paketler

Durum: ⏳ bekliyor · 🔨 işçide · 🔍 denetimde · ✅ kabul · ❌ ret

| Paket | İçerik | İşçi | Bağımlı olduğu | Durum |
|-------|--------|------|----------------|-------|
| P0 | İskelet: `saat/` projesi, `core` kopyası, yer tutucu sahne, duman testi (K4 sonrası ek not: Ø 25,6 mm, otomatik) | DeepSeek v4.1 flash | — | 🔨 |
| P1 | Şartname + kinematik çekirdek: diş sayıları, oranlar, 3 Hz vuruş, merkez saniye düzeni, zaman modeli (gerçek / yavaş / hızlı), çark açıları, 80 sa rezerv, testler | Opus 5.5 | P0 | ⏳ |
| P2 | Saat dişlisi geometrisi (sikloidal/ogival yaklaşık profil, pinyon, kol/göbek) + ana plaka ve köprüler | Sonnet 5.5 | P1 | ⏳ |
| P3 | Çıkış mekanizması: çıkış çarkı, çatal (palet taşları), balans çarkı, spiral yay, makara/impuls taşı; geometri + animasyon | Opus 5.5 | P1, P2 | ⏳ |
| P4 | Montaj: dişli takımı, akrep-yelkovan takımı (motion works), kadran ve ibreler; kinematiğe bağlama | Sonnet 5.5 | P2, P3 | ⏳ |
| P5 | Kurma-ayar mekanizması (kurgu kolu, kayar pinyon, taç ve cırcır çarkı, tırnak), zemberek kutusu ve güç rezervi | Sonnet 5.5 | P4 | ⏳ |
| P5b | Otomatik kurma modülü: rotor (bilyalı yatak), çift yönlü kurma (yön değiştirici çarklar), redüksiyon takımı | Opus 5.5 | P5 | ⏳ |
| P5c | Tarih mekanizması: tarih halkası, 24 saatlik sürücü çark, tarih atlama | Sonnet 5.5 | P4 | ⏳ |
| P6 | Arayüz: zaman ölçeği, demontaj katmanları, kamera ön ayarları, etiketler, parça bilgisi; saat malzemeleri (pirinç, rodyum, yakut, mavi çelik) | Sonnet 5.5 (+ Gemini kadran dokusu) | P4 | ⏳ |
| P7 | Ses: vuruşa bağlı tik-tak (Web Audio) | Gemini 4 argon (deneme) | P1 | ⏳ |
| P8 | İçerik: katalog metinleri, tur ve sınav metinleri | DeepSeek / GLM | P4 (parça listesi) | ⏳ |
| P9 | Tur, sınav, URL durumu, mobil, son denetim | Sonnet 5.5 | P6, P8 | ⏳ |

## Denetim kayıtları

_(henüz yok)_
