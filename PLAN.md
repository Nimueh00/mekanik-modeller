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
| P0 | İskelet: `saat/` projesi, `core` kopyası, yer tutucu sahne, duman testi | DeepSeek v4.1 flash | — | ✅ |
| P1 | Şartname + kinematik çekirdek: diş sayıları, oranlar, yerleşim, 3 Hz vuruş, merkez saniye, zaman modeli, 80 sa rezerv, testler | Opus 5.5 | P0 | ✅ |
| P2 | Mekanizma geometrisi ve montaj: saat dişlisi profili, plaka ve köprüler, yürüyüş takımı, çıkış (çark, çatal, balans, spiral), akrep-yelkovan takımı, kadran ve ibreler; temel saat malzemeleri (pirinç, rodyum, yakut, mavi çelik); kinematiğe bağlama | Opus 5.5 | P1 | 🔨 |
| P3 | Kurma ve takvim: zemberek kutusu, kurma-ayar mekanizması, otomatik rotor ve yön değiştirici, tarih mekanizması | Sonnet 5.5 | P2 | ⏳ |
| P4 | Arayüz: zaman ölçeği, demontaj katmanları, kamera, etiketler, parça bilgisi, yüzey işlemeleri (perlaj, Cenevre çizgileri), tik-tak sesi | Sonnet 5.5 | P2 | ⏳ |
| P5 | Öğrenme ve bitiş: katalog/tur/sınav metinleri, tur, sınav, URL durumu, mobil, son denetim | Sonnet 5.5 | P3, P4 | ⏳ |

Not: Sahip isteğiyle 12 paket 6'ya indirildi (motor 5 fazda bitmişti). Eski P2+P3+P4 → P2; P5+P5b+P5c → P3; P6+P7 → P4; P8+P9 → P5.

## Denetim kayıtları

### P0 — KABUL (`39d3cac`)
- Bağımsız denetim: `saat` typecheck + test (1 dosya / 2 test) + build yeşil; `motor` 8 / 59 yeşil; `diff -r motor/src/core saat/src/core` boş; commit yalnızca `saat/` altında.
- `package.json`, `package-lock.json`, `index.html` motordan yalnızca ad/başlık satırlarında farklı (kilit `npm ci` ile doğrulanmış — iyi karar).
- Başsız Chromium'da sahne çiziliyor, konsol hatası yok. Kadraj yer tutucu için sıkı; P4'te kamera ön ayarlarıyla düzelecek.
- Yer tutucu çark y = 2…5 (plakanın 0,2 mm üstünde) talimat gereği; gerçek eksenel seviyeler P1'de tanımlanır.
- İşçi notu: DeepSeek v4.1 flash talimata sadık, sapmalarını gerekçeli raporladı → tanımlı mekanik paketlerde kullanılabilir.

### P1 — KABUL (`1a970a5`)
- Bağımsız denetim: `saat` typecheck + test (5 dosya / 41 test) + build yeşil; `motor` 8 / 59 yeşil; `core` kopyası birebir; kapsam yalnızca `saat/src/watch`, `saat/tests`, `saat/src/main.ts`.
- Oranları elle doğruladım: zemberek kutusu 100/10 (10 sa/tur, 8 tur → 80 sa); 80/10 × 75/10 = 60; 96/8 = 12 → 720 tur/sa × 30 = 21.600 A/s. Eş eksen: 90·0,085/2 = 85·0,09/2 = 3,825 mm; akrep-yelkovan takımı 12/36 × 8/32 = 1/12, 48·0,1/2 = 40·0,12/2 = 2,4 mm; tarih sürücü 64/32 → 24 sa.
- Vuruş fazı ±½ vuruş sınırlarında sürekli; çatal ve çıkış çarkı tek fonksiyondan (`beatPhase`).
- Mutasyon denemesi: oran (96→84), eş eksen (modül 0,09→0,092), plakadan taşma (balans Ø 11), rezerv (8→6 tur), eksenel çakışma (balans çıkış çarkı katında) → hepsi testlerde kırmızı.
- P2'ye notlar: balans–çıkış çarkı eksenel boşluğu 0,07 mm (dar; geometri y aralıklarına tam uymalı). Çıkış çarkı yalnızca uç çapıyla tanımlı, diş profili P2'de. Rezerv bitince balans salınım ortasında donuyor; P3'te sıfıra sönümlenmeli.
