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
| K6 | `saat/src/core/labels.ts` çatal değişikliği (K3 izniyle, P4 revizyonu): etiket çapası, döndürülmüş `registry.root` altında parça kökü konumunu ebeveyn dönüşümüyle dünyaya taşır. | Saatte `registry.root` döndürülmüş; `rest + root.position` demontajda etiketi yanlış eksende kaydırıyor. Motorda kök döndürülmediği için motor davranışı aynı kalır. |

## Paketler

Durum: ⏳ bekliyor · 🔨 işçide · 🔁 revizyonda · 🔍 denetimde · ✅ kabul · ❌ ret

| Paket | İçerik | İşçi | Bağımlı olduğu | Durum |
|-------|--------|------|----------------|-------|
| P0 | İskelet: `saat/` projesi, `core` kopyası, yer tutucu sahne, duman testi | DeepSeek v4.1 flash | — | ✅ |
| P1 | Şartname + kinematik çekirdek: diş sayıları, oranlar, yerleşim, 3 Hz vuruş, merkez saniye, zaman modeli, 80 sa rezerv, testler | Opus 5.5 | P0 | ✅ |
| P2 | Mekanizma geometrisi ve montaj: saat dişlisi profili, plaka ve köprüler, yürüyüş takımı, çıkış (çark, çatal, balans, spiral), akrep-yelkovan takımı, kadran ve ibreler; temel saat malzemeleri (pirinç, rodyum, yakut, mavi çelik); kinematiğe bağlama | Opus 5.5 | P1 | ✅ |
| P3 | Kurma ve takvim: zemberek ve cırcır, kurma-ayar mekanizması (taç konumları, ibre ayarı, durdurma), otomatik rotor ve yön değiştirici, tarih mekanizması, rezerv bitince balansın sönümlenmesi, demontaj sırası düzeltmesi | Sonnet 5.5 | P2 | 🔁 revizyon |
| P4 | Arayüz: panel, zaman ölçeği, demontaj, hayalet görünüm, kamera ön ayarları, etiketler, parça seçimi, yüzey işlemeleri (perlaj, Cenevre çizgileri), tik-tak sesi, gölge performansı | Sonnet 5.5 | P2 | 🔁 revizyon |
| P5 | Öğrenme ve bitiş: taç/rotor kontrollerinin panele bağlanması, katalog/tur/sınav metinleri, tur, sınav, URL durumu, mobil, son denetim | Sonnet 5.5 | P3, P4 | ⏳ |

Not: Sahip isteğiyle 12 paket 6'ya indirildi (motor 5 fazda bitmişti). Eski P2+P3+P4 → P2; P5+P5b+P5c → P3; P6+P7 → P4; P8+P9 → P5.
P3 ve P4 aynı dalda paralel: dosya ayrımı — P3 `watch.ts`, `catalog.ts`, `parts/`, `train.ts`, `watchClock.ts`; P4 `main.ts`, `materials.ts`, yeni `ui/` dosyaları. `main.ts`'te P3 yalnızca başlangıç zamanı satırını değiştirir.

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

### P2 — KABUL (`6af7533`, `9847f6b`)
- Bağımsız denetim: `saat` typecheck + test (10 dosya / 81 test; P1'in 4 test dosyası değişmemiş) + build yeşil; `motor` 8 / 59 yeşil; `core` birebir; `specs.ts`'te yalnızca ekleme.
- Mutasyon: üçüncü pinyon fazı +9° → dişli geçiş testi kırmızı; çıkış ilerlemesi eski doğrusal eşlemeye döndürülünce iç içe geçme ve impuls teması testleri kırmızı.
- Görsel (başsız Chromium): arka görünüm, yakın plan, yan profil, çıkış yakın planı; konsol temiz. Köprüler organik, yakut yataklar, spiral ve stud doğru yerde.
- Kabul edilen sapmalar: sıfır düşme (P1'in vuruş merkezleme koşulunun sonucu; bu ölçekte görünmez), club yüzü %85, kilit ~4° teğetten sapma, yakut opak.
- Açık: gerçek GPU'da fps ölçülmedi (P4 fps göstergesi ekler, sahip yerelde doğrular). Her karede gölge yenileme → P4. Demontajda merkez çark zemberek kutusundan geçiyor → P3. İşçi ek olarak oturum dalına da push etti (zararsız; sonraki prompt'larda yasak).

### P3 + P4 — REVİZYON (`8b2cd03`, `ac699d6`, `5658448`)
- Bağımsız denetim (birleşik): `saat` typecheck + test (24 dosya / 203 test; P1/P2 test dosyaları değişmemiş) + build yeşil; `motor` 8 / 59; `core` birebir; dosya ayrımına iki paket de uydu.
- P3 mutasyon: rotor tek yönde kurma, yön değiştirici ters, tarih penceresi 1 diş kaymış → hepsi kırmızı.
- Görsel: panel, hayalet görünüm, kadran (bugünün tarihi ve yerel saat doğru), telefon alt sayfası iyi; konsol temiz.
- P3 revizyon: ayar kolu ve sürgü arka yüzde, kaba düz şekiller; ETA mimarisine uygun olarak kadran tarafına taşınmalı.
- P4 revizyon: (1) etiketler döndürülmüş kökte demontajı izlemiyor (K6); (2) iç görünüm ön ayarlarında rotor görüşü kapatıyor; (3) demontajda parçalar kadrajdan/panelin altına taşıyor; (4) `main.ts` `clock.pose`'u `watch.update`'e aktarmıyor (rotor, taç, ibre ayarı, rezerv sonu uygulamada devre dışı).
- fps hâlâ gerçek GPU'da ölçülmedi; sahibin yerel ölçümü bekleniyor.
