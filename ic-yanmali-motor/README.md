# İnteraktif 3D İçten Yanmalı Motor

Tarayıcıda çalışan, mühendislik açısından doğru, **çalışan** bir 4 zamanlı benzinli motor modeli: 1.6 L, sıralı 4 silindir, DOHC 16 supap. Tüm geometri kodla (prosedürel) üretilir; harici model dosyası yoktur.

- Krank → biyel → piston tam krank-biyel denklemiyle, eksantrikler zincirle 1 : 2 oranında, supaplar gerçek bir kam profiliyle hareket eder. Her şey tek bir motor saatinden (0–720°) türetilir.
- **İçini aç:** 15 katman gerçek söküm sırasıyla (dıştan içe) ayrılır; parçalar patlatılmışken de çalışmaya devam eder.
- **Kesit görünümü** (enine/boyuna, taralı kesit yüzeyleri), **saydam** ve **katı** görünüm; kamera ön ayarları.
- **Çevrim göstergesi:** seçili silindirin zamanı, 720° faz çarkı, canlı **P-V diyagramı**, basınç, sıcaklık, supap lifti.
- Yanma (kıvılcım, alev cephesi), emme/egzoz gaz parçacıkları; yağlama ve soğutma devreleri (şematik).
- **Motor sesi:** ateşlemelerle senkron, Web Audio ile sentezlenir (varsayılan kapalı).
- **Öğrenme turu** (6 adım) ve **mini sınav** (10 soru, skor).
- **Paylaşılabilir bağlantı:** açıklık oranı, kamera, seçili parça, görünüm ve zaman URL'de tutulur.

Arayüz Türkçedir.

## Çalıştırma

Gereken: **Node.js 22.12+** (Vite 8 ve Vitest 5 bunu ister) ve npm. Komutlar bu klasörde (`ic-yanmali-motor/`) çalıştırılır.

```bash
cd ic-yanmali-motor
npm install
npm run dev          # http://localhost:5173
```

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu (anında yenileme) |
| `npm test` | Birim testleri (Vitest): kinematik, supap zamanlaması, çakışma, zincir, termodinamik, patlatma sırası, ses senkronu |
| `npm run typecheck` | TypeScript (strict) tip denetimi |
| `npm run build` | Tip denetimi + üretim derlemesi → `dist/` |
| `npm run preview` | `dist/` klasörünü yerel olarak sunar (yayından önce son kontrol) |

Açılışta geometri (CSG dahil) tarayıcıda üretilir: orta seviye bir bilgisayarda 1–3 s sürer, bu sırada “MOTOR HAZIRLANIYOR” yazısı görünür.

### Kullanım

- **Sürükle:** döndür · **tekerlek / iki parmak:** yaklaş · **sağ tık sürükle:** kaydır
- **Parçaya ya da etiketine tıkla:** parça vurgulanır, panelde işlevi, malzemesi ve mühendislik notu görünür
- **Boşluk:** durdur/oynat · **← / →:** ±1° krank (Shift ile ±10°) · **Esc:** turu/sınavı kapat
- Sağdaki **KONTROL** paneli: Öğrenme (tur, sınav, devreler) · İçini aç · Bakış açısı (+ bağlantı kopyala) · Katmanlar · Parça bilgisi · Zaman (+ ses) · Devir · Krank açısı · Çevrim göstergesi · Kesit görünümü. Telefonda panel alttan açılan bir sayfadır.

### Bağlantıdaki durum (URL)

Durum adresin `#` kısmına yazılır ve sayfa açılırken geri yüklenir; “🔗 Bu görünümün bağlantısını kopyala” düğmesi aynısını panoya kopyalar.

| Anahtar | Anlamı | Örnek |
|---|---|---|
| `a` | Açıklık oranı (0–1) | `a=0.500` |
| `cam` | Kamera konumu ve hedefi, mm: `x,y,z,hx,hy,hz` | `cam=640,470,1180,0,105,0` |
| `p` | Seçili parça kimliği | `p=piston-3` |
| `v` | Görünüm: `section` (kesit) / `ghost` (saydam); yoksa katı | `v=section` |
| `c` | Çevrim göstergesi / kesitin silindiri (1–4) | `c=3` |
| `k`, `x` | Kesit yönü (`boyuna`; yoksa enine) ve düzlem konumu (mm) | `k=boyuna&x=10.0` |
| `t` | Durdurulmuş motor saati (0–720°); yoksa motor çalışır | `t=705.0` |
| `rpm` | Devir (800–6500) | `rpm=3000` |

Örnek: `…/#a=0.000&v=section&c=1&t=705.0` → 1. silindir kesitte, kıvılcım anında durdurulmuş.

## Yayınlama (statik site)

`npm run build` çıktısı (`dist/`) sunucu tarafı kod gerektirmeyen düz bir statik sitedir: `index.html` + `assets/`. Varlık yolları göreli (`base: './'`) ve durum adresin `#` kısmında tutulduğu için **herhangi bir klasörde** (alt dizin dahil) yönlendirme kuralı olmadan çalışır.

```bash
npm run build
npm run preview      # isteğe bağlı: http://localhost:4173 üzerinden dene
```

Ardından `dist/` klasörünün **içeriğini** herhangi bir statik barındırıcıya yükleyin:

- **GitHub Pages (Actions ile):** depoda *Settings → Pages → Source: GitHub Actions* seçin ve şu iş akışını `.github/workflows/pages.yml` olarak ekleyin:

  ```yaml
  name: Pages
  on:
    push:
      branches: [main]
  permissions:
    contents: read
    pages: write
    id-token: write
  jobs:
    deploy:
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: ic-yanmali-motor
      environment:
        name: github-pages
        url: ${{ steps.deployment.outputs.page_url }}
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22
            cache: npm
            cache-dependency-path: ic-yanmali-motor/package-lock.json
        - run: npm ci
        - run: npm test
        - run: npm run build
        - uses: actions/upload-pages-artifact@v3
          with:
            path: ic-yanmali-motor/dist
        - id: deployment
          uses: actions/deploy-pages@v4
  ```

  Site `https://<kullanıcı>.github.io/<depo>/` adresinde yayınlanır.
- **Netlify / Vercel / Cloudflare Pages:** kök klasör `ic-yanmali-motor`, derleme komutu `npm run build`, yayın klasörü `dist`.
- **Kendi sunucunuz (nginx, Apache, S3…):** `dist/` içeriğini kopyalamanız yeterli. Örnek: `npx serve dist` ya da `python3 -m http.server -d dist 8080`.

> `dist/index.html` dosyasını çift tıklayarak (`file://`) açmak çalışmaz: tarayıcılar ES modüllerini yerel dosyadan yüklemeyi engeller. Basit bir yerel sunucu kullanın.

Yazı tipleri (Cormorant Garamond, Inter) Google Fonts'tan yüklenir; çevrimdışıyken sistem yazı tiplerine düşülür.

## Proje yapısı

```
src/
  core/      makineden bağımsız altyapı (saat, parça kaydı, demontaj, kamera, etiketler, kesit,
             seçim, sahne, panel, rehber kartı, URL durumu, açı olayı zamanlayıcısı, geometri yardımcıları)
  engine/    bu motora özgü: ölçüler, kinematik, kam profili, zamanlama, termodinamik, parçalar,
             katalog (Türkçe bilgi metinleri), sunum, ses, tur, sınav, devreler
  main.ts    hepsini birbirine bağlar
tests/       Vitest birim testleri
docs/ekran/  ekran görüntüleri
```

`src/core/` altındaki altyapı başka makineler (mekanik saat, şanzıman…) için yeniden kullanılmak üzere tasarlandı.
