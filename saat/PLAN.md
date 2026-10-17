# Saat — üretim planı

**Hedef:** `motor/` ile aynı çekirdeği kullanan, gerçekten çalışan mekanik otomatik saat (3 ibre, ana yay, dişli takımı, İsviçre çıkışı, denge çarkı, rotor). Referans: patlatılmış saat videosu ekran görüntüsü (katmanlar: kayış · kasa · cam · ibreler · kadran · kadran altı · plaka · dişliler · köprüler · rotor · kasa arkası).

**Mimari karar (direktör):** `saat/` bağımsız Vite uygulamasıdır; `motor/src/core` **taşınmaz**, vite/tsconfig alias'ı `@core` ile içe aktarılır. Motor bozulmaz; ortak pakete çıkarma ileride istenirse ayrı iş.

**Kontroller (referanstan):** İçini aç kaydırıcısı (Kapat/Yarım/Tam aç) · bakış açıları (Sergi, Kadran, Arka, Yan, Mekanizma, Çıkış, Balans, Yay kutusu) · katman aç/kapa · zaman (durdur, 1/50×, 1/10×, 1/4×, gerçek) · ses · taç (çek→zaman ayarı, çevirerek kur) · rotor sallama · yayı doldur/boşalt.

| WP | İş | Bağımlı | Önerilen işçi | Gerekçe |
|----|----|---------|---------------|---------|
| 0 | İskele: `saat/` Vite+TS+vitest, `@core` alias, boş sahne + panel | — | Sonnet 5.5 | Mekanik kurulum, motoru örnek al |
| 1 | Özellikler & veri: diş sayıları, oranlar, ana yay modeli (`specs.ts`) + testler | — | Opus 5.5 | Yanlış oran her şeyi bozar |
| 2 | Kinematik/zaman: dişli zinciri, çıkış tıkı, denge salınımı, ibreler, kurma, taç, rotor (`movement.ts`) | 0,1 | Opus 5.5 | Çekirdek simülasyon |
| 3 | Geometri kütüphanesi: cıvata/çarkçık dişleri, çıkış çarkı, çapa, saç yay (spiral), ratchet | 0 | Sonnet 5.5 | Geometri, CSG |
| 4a | Parçalar: kasa, cam, taç, kayış, kasa arkası | 0,3 | Sonnet 5.5 | |
| 4b | Parçalar: kadran, indeksler, ibreler (+ kanvas doku) | 0 | Gemini 4 argon (dene) / Sonnet | Görsel iş, argon denemesi |
| 4c | Parçalar: ana plaka, köprüler, vidalar, yay kutusu, dişliler, çıkış, denge, rotor | 1,3 | Sonnet 5.5 | En büyük paket; gerekirse ikiye böl |
| 5 | Montaj: `watch.ts`, katman sırası, patlatma, kamera ön ayarları, etiketler | 2,4 | Sonnet 5.5 | |
| 6 | UI: Türkçe altın tema paneli, taç/kurma/zaman kontrolleri | 5 | Gemini 3.8 flash | Standart UI, `motor/engine/ui.ts` örnek |
| 7 | Ses: tik-tak, kurma ratchet'i (WebAudio sentez) | 2 | Gemini 3.8 flash | Küçük, izole |
| 8 | İçerik: etiket metinleri, öğrenme turu, mini sınav | 5 | GLM 5.3 / DeepSeek free | Metin; direktör doğruluk denetler |
| 9 | Bütünleştirme, mobil, URL durumu, cilalama, README | hepsi | Sonnet 5.5 | |

Sıra: **WP0 ∥ WP1** → WP2 ∥ WP3 → WP4a/b/c → WP5 → WP6 ∥ WP7 ∥ WP8 → WP9.
Prompt'lar bağımlılığı kabul edilince yazılır (çıktıya göre uyarlamak için). Şimdilik hazır: WP0, WP1.
