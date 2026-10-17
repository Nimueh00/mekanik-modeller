# WP0 — Saat projesi iskeleti

Depo: `mekanik-modeller`. İçinde `motor/` adlı bir TypeScript + Vite + Three.js uygulaması var (içten yanmalı motorun 3D eğitim modeli). Şimdi yanına `saat/` adlı, aynı çekirdeği kullanan yeni bir uygulama kuruyoruz (mekanik saat). Bu iş sadece **iskelet**.

## Yap
1. `saat/` altında Vite + TypeScript + vitest projesi kur: `package.json` (ad `saat-3d`; script'ler motorla aynı: dev, build, test, typecheck), `tsconfig.json`, `vite.config.ts`, `index.html`. `motor/` içindeki aynı dosyaları örnek al; sürümler aynı olsun. `motor/vite.config.ts` içindeki three-bvh-csg alias/inline ayarı da gerekli.
2. `motor/src/core` klasörünü **taşıma ve kopyalama**; `@core` alias'ıyla (`saat/vite.config.ts` + `saat/tsconfig.json` paths + vitest alias) `../motor/src/core` yoluna bağla. `import { Stage } from '@core/stage'` çalışmalı.
3. `saat/src/main.ts`: motordaki `main.ts` yapısını örnek alarak `Stage`, `PartRegistry`, `MaterialLibrary`, `MachineClock`, `Panel` ile **boş** bir sahne aç: başlık "Mekanik Otomatik Saat", yükleme yazısı "SAAT HAZIRLANIYOR", zemin ve ışıklar, orta noktada geçici bir kutu/silindir (WP4'te silinecek). Altın/siyah tema için `saat/src/style.css` oluştur (motorun stilini temel al, renk değişkenlerini altın vurgulu yap). Motora özel hiçbir şey (`engine/*`) içe aktarma.
4. `saat/tests/smoke.test.ts`: `@core/clock` ve `@core/registry` alias'ıyla içe aktarılıp temel bir şey doğrulansın (alias çalışıyor kanıtı).
5. Kök `.gitignore` zaten `node_modules`, `dist` kapsıyor; gerekirse güncelle.

## Dokunma
`motor/` içinde hiçbir dosyayı değiştirme.

## Kabul kriterleri (hepsi çalıştırılıp çıktı gösterilecek)
- `cd saat && npm install && npm run typecheck && npm test && npm run build` hatasız.
- `cd motor && npm test && npm run typecheck` hâlâ hatasız.
- `npm run dev` ile sahne açılıyor (Playwright/Chromium ile ekran görüntüsü alıp bakabilirsin; kurulu).

## Çıktı formatı
Branch'e commit'le. Yanıtında: değişen dosyalar listesi, çalıştırdığın komutların son satırları, karşılaştığın ve çözdüğün sorunlar, sapmalar.
