# WP1 — Saat özellikleri ve veri modeli (`saat/src/engine/specs.ts`)

Bağlam: `mekanik-modeller` deposunda `motor/` içten yanmalı motorun 3D modelidir; `motor/src/engine/specs.ts` ve `motor/src/engine/timing.ts` dosyaları okunup üslup örneği alınmalı. `saat/` altında mekanik otomatik bir saat kuruluyor (ayrı bir işçi iskeleti kuruyor, sen sadece aşağıdaki dosyaları yaz; `saat/package.json` yoksa testi yazıp kendi geçici ortamında çalıştırmak için motorun vitest ayarını kullan, ama `saat/` kurulum dosyalarını commit'leme).

## Saat
Otomatik (rotorlu) kurmalı, 3 ibreli (saat, dakika, merkez saniye), 28.800 vuruş/saat (4 Hz) denge çarkı, İsviçre çapa çıkışı, yaklaşık 40 saat güç rezervi. Tarih/komplikasyon yok. Türkçe etiket/ad kullan, kod ve sembol adları İngilizce.

## Yap
`saat/src/engine/specs.ts` (+ gerekirse `saat/src/engine/gearTrain.ts`) yaz:
1. **Dişli zinciri:** yay kutusu → merkez (dakika) çarkı → üçüncü çark → dördüncü (saniye) çarkı → çıkış çarkı. Her çark için diş sayısı, pinyon yaprak sayısı, modül/yarıçap (mm, gerçekçi: ~28–30 mm gövde), dönüş hızı. Sayıları **sen hesaplayıp seç**: merkez çarkı 1 dev/saat, dördüncü çark 1 dev/dakika, çıkış çarkı 15 dişli ise 28.800 vph'de 16 dev/dk. Yay kutusu devri güç rezervinden çıkmalı.
2. **Hareket işleri:** kanon pinyonu → dakika çarkı → saat çarkı; saat ibresi dakika ibresinin tam 1/12'si hızında olmalı. Diş sayıları verilsin.
3. **Kurma:** otomatik kurma zinciri (rotor → redüktör → mandal çarkı) ve elle kurma (taç → kurma mili → taç çarkı → mandal çarkı) için diş sayıları ve oranlar. Ana yay modeli: tur sayısı, tam kuruluda tork, torkun azalma eğrisi (basit doğrusal-olmayan, belgeli), tam boşalma süresi = ~40 saat.
4. **Çıkış:** çıkış çarkı diş sayısı, çapa açıları, denge çarkı atalet momenti ve saç yay sertliği: salınım frekansı 4 Hz (T = 0,25 s) olacak şekilde tutarlı; genlik ~300°.
5. Her sabitin yanına birim ve kısa yorum (neden bu değer). Tüm geometrik boyutlar mm; ekranda ölçek ayrı belirlenecek.

## Kabul kriterleri
`saat/tests/specs.test.ts` ile **hepsi test edilmiş**: (a) merkez çarkı 1 dev/saat, (b) dördüncü çark 1 dev/dk, (c) çıkış çarkı dakikada 16 dev ve saatte tam 28.800 vuruş, (d) saat ibresi/dakika ibresi oranı 1/12, (e) güç rezervi 38–44 saat, (f) denge salınımı T=0,25 s ±%1, (g) dişli çiftlerinde eksenler arası mesafe tutarlı (iki çarkın pitch yarıçapları toplamı), (h) tüm dişli çiftlerinin modülleri uyumlu.
Yanıtında oranları kısa bir tablo olarak ver ve her seçimin gerekçesini bir cümleyle yaz.

## Dokunma
`motor/` içindeki dosyalar ve `saat/` kurulum dosyaları (package.json, vite.config, tsconfig, main.ts).
