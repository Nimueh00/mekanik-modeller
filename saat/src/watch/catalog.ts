import type { LayerDef, PartDef, PartInfo, Vec3 } from '../core/registry';
import type { Body } from './specs';

/**
 * Disassembly layers, in teardown order. Back (bridge side, −Y): the rotor, the
 * winding wheels under it (ratchet with click, crown wheel, reversers), then the
 * balance with its cock, the bridges, the lever, the train wheels, the barrel
 * and the centre wheel, which lies under the barrel. Dial side (+Y): hands,
 * dial, date ring, motion works, then the setting works under the dial (wheels,
 * setting lever, yoke and their springs). The stem with its pinions on the back
 * comes off after them, because the yoke and lever pins reach it through the
 * plate; the plate comes off last.
 */
export const LAYERS = [
  { id: 'rotor', shortTr: 'Rotor', nameTr: 'Otomatik rotor', order: 1 },
  { id: 'winding', shortTr: 'Kurma çarkları', nameTr: 'Kurma çarkları ve yön değiştirici', order: 2 },
  { id: 'balance', shortTr: 'Balans', nameTr: 'Balans köprüsü ve balans', order: 3 },
  { id: 'bridges', shortTr: 'Köprüler', nameTr: 'Köprüler ve vidalar', order: 4 },
  { id: 'lever', shortTr: 'Çatal', nameTr: 'Çatal', order: 5 },
  { id: 'train', shortTr: 'Takım', nameTr: 'Takım çarkları', order: 6 },
  { id: 'barrel', shortTr: 'Zemberek', nameTr: 'Zemberek kutusu ve zemberek', order: 7 },
  { id: 'centre', shortTr: 'Merkez çark', nameTr: 'Merkez çark', order: 8 },
  { id: 'hands', shortTr: 'İbreler', nameTr: 'İbreler', order: 9 },
  { id: 'dial', shortTr: 'Kadran', nameTr: 'Kadran', order: 10 },
  { id: 'date', shortTr: 'Tarih', nameTr: 'Tarih halkası ve atlama yayı', order: 11 },
  { id: 'motion-works', shortTr: 'Akrep-yelkovan', nameTr: 'Akrep-yelkovan takımı', order: 12 },
  { id: 'keyless-dial', shortTr: 'Ayar düzeni', nameTr: 'Ayar düzeni (kadran tarafı)', order: 13 },
  { id: 'keyless', shortTr: 'Kurma kolu', nameTr: 'Kurma kolu ve pinyonları (arka)', order: 14 },
  { id: 'plate', shortTr: 'Plaka', nameTr: 'Ana plaka', order: 15 },
] as const satisfies readonly LayerDef[];

export type WatchLayerId = (typeof LAYERS)[number]['id'];

const def = (
  id: string,
  nameTr: string,
  group: WatchLayerId,
  explodeOffset: Vec3,
  explodeOrder: number,
  info: PartInfo,
): PartDef => ({ id, nameTr, group, explodeOffset, explodeOrder, info });

/*
 * Explode offsets in scene units (1 = 0.1 mm), movement frame: −Y towards the
 * back, +Y towards the dial. Parts that come off earlier end up further out
 * than the parts under them, so that nothing overlaps when fully open. The
 * centre wheel lies partly under the barrel; it also moves out sideways.
 */
export const PARTS = {
  // ------------------------------------------------------------ back
  balanceCock: def('balance-cock', 'Balans köprüsü', 'balance', [0, -595, 0], 0, {
    function: 'Balansın üst pivotunu taşıyan tek ayaklı köprü; spiralin dış ucunu tutan saplama da ona bağlıdır.',
    material: 'Rodyum kaplı pirinç, yakut yatak taşı',
    notes: 'Tek vidayla sabitlenir; servis ve ayar için ilk sökülen parçadır.',
  }),
  hairspring: def('hairspring', 'Spiral yay', 'balance', [0, -565, 0], 1, {
    function: 'Balansı denge konumuna geri çeken yay; balansla birlikte salınımın periyodunu belirler.',
    material: 'Nivarox tipi alaşım (sıcaklıkla esnekliği az değişir)',
    notes:
      'Yaklaşık 13 turluk düz Arşimet spirali: iç ucu balans milindeki kolete, dış ucu saplamaya bağlı. Balans döndükçe sarımlar sıkışıp açılır.',
  }),
  balance: def('balance', 'Balans', 'balance', [0, -545, 0], 2, {
    function: 'Saatin zaman tabanı: spiral yayla birlikte saniyede 3 tam salınım (6 vuruş, 21.600 A/s) yapan çark.',
    material: 'Glucydur (berilyum bronzu) jant, çelik mil, yakut impuls taşı',
    notes:
      'Genlik tam kuruluyken ≈ 300°, rezervin sonunda ≈ 200°. Miline takılı makara tablasındaki impuls taşı her vuruşta çatalın ağzına girer.',
  }),
  bridgeScrews: def('bridge-screws', 'Köprü vidaları', 'bridges', [0, -505, 0], 0, {
    function: 'Köprüleri sütunları üzerinden plakaya bağlar.',
    material: 'Isıl işlemle maviletilmiş çelik',
    notes: 'Mavi renk boya değildir: çelik ≈ 290 °C’ye ısıtılınca oluşan ince oksit tabakasıdır.',
  }),
  barrelBridge: def('barrel-bridge', 'Zemberek kutusu köprüsü', 'bridges', [0, -490, 0], 1, {
    function: 'Zemberek kutusunun milini taşır; iki sütun arasında kutunun üstünü örter.',
    material: 'Rodyum kaplı pirinç',
    notes: 'Cırcır çarkı, tırnak ve taç çarkı bu köprünün üzerinde, rotorun altındaki ince katlarda durur.',
  }),
  trainBridge: def('train-bridge', 'Takım köprüsü', 'bridges', [0, -450, 0], 2, {
    function: 'Merkez (ve saniye), üçüncü ve çıkış çarklarının üst pivotlarını taşır.',
    material: 'Rodyum kaplı pirinç, yakut yatak taşları',
    notes: 'Dalgalı kolu üç pivotun üzerinden geçerek iki sütuna uzanır.',
  }),
  palletBridge: def('pallet-bridge', 'Çatal köprüsü', 'bridges', [0, -410, 0], 3, {
    function: 'Çatalın üst pivotunu taşıyan küçük köprü.',
    material: 'Rodyum kaplı pirinç, yakut yatak taşı',
    notes: 'Çatal ancak bu köprü ve balans söküldükten sonra çıkarılabilir.',
  }),
  lever: def('lever', 'Çatal (palet çatalı)', 'lever', [0, -375, 0], 0, {
    function:
      'Balansla çıkış çarkı arasındaki bağlantı: her vuruşta çarkı yarım diş serbest bırakır ve balansa itme verir.',
    material: 'Çelik gövde, yakut giriş ve çıkış paletleri',
    notes:
      'Paletler 2½ diş aralıklı; çatal iki emniyet pimi arasında ≈ 10° salınır. Emniyet pimi, makaradaki yarımay oyuğu dışında balansın çatalı yanlışlıkla çevirmesini önler.',
  }),
  escapeWheel: def('escape-wheel', 'Çıkış çarkı', 'train', [0, -335, 0], 0, {
    function: 'Takımdan gelen gücü çatala aktaran 15 dişli çark.',
    material: 'Sertleştirilmiş, cilalı çelik; çelik pinyon',
    notes:
      'Ayaklı ("club") dişlerin her birinde ayrı bir kilit yüzü ve impuls yüzü vardır. Vuruş başına 12°, dakikada 12 tur döner.',
  }),
  fourthWheel: def('fourth-wheel', 'Dördüncü çark (saniye çarkı)', 'train', [0, -295, 0], 1, {
    function: 'Dakikada bir tur atar; uzun mili merkez borunun içinden geçerek saniye ibresini taşır.',
    material: 'Yaldızlı pirinç çark, çelik pinyon ve mil',
    notes: '96 diş, çıkış pinyonu 8 yaprak: 12:1.',
  }),
  thirdWheel: def('third-wheel', 'Üçüncü çark', 'train', [0, -230, 0], 2, {
    function: 'Merkez çarktan dördüncü çarka hızı artırır.',
    material: 'Yaldızlı pirinç çark, çelik pinyon',
    notes: '75 diş, 10 yapraklı pinyon. 80/10 × 75/10 = 60: merkez çark saatte, dördüncü çark dakikada bir tur.',
  }),
  centreWheel: def('centre-wheel', 'Merkez çark (yelkovan çarkı)', 'centre', [0, -110, 0], 0, {
    function: 'Saatte bir tur atar; kanon pinyonu üzerinden yelkovanı taşır.',
    material: 'Yaldızlı pirinç çark, çelik pinyon ve boru',
    notes:
      'Zemberek kutusu (100 diş) onu 10 yapraklı pinyonundan sürer: kutu 10 saatte bir tur atar. Kutunun altında kaldığı için söküm sırasında ona en son sıra gelir.',
  }),
  barrel: def('barrel', 'Zemberek kutusu (tambur ve diş jantı)', 'barrel', [0, -125, 0], 3, {
    function: 'Zembereği barındırır; dişli jantı gücü takıma verir, 10 saatte bir tur atar.',
    material: 'Pirinç tambur ve diş jantı',
    notes:
      'Zemberek duvara yaslı dış ucundan tambura bağlıdır; kutu zemberek boşalırken döner, mil (ve cırcır) sabit kalır. 8 etkin tur ≈ 80 saat güç rezervi.',
  }),
  barrelCover: def('barrel-cover', 'Zemberek kutusu kapağı', 'barrel', [0, -200, 0], 0, {
    function: 'Kutuyu köprü tarafından kapatır; zemberek ancak kapak çıkınca görünür.',
    material: 'Pirinç',
    notes: 'Tamburun duvarına geçmeli oturur ve onunla birlikte döner.',
  }),
  mainspring: def('mainspring', 'Zemberek', 'barrel', [0, -190, 0], 1, {
    function: 'Enerjiyi depolayan sarmal şerit: dış ucu tambura, iç ucu mile bağlıdır.',
    material: 'Çelik alaşım şerit (burada okunabilirlik için yaklaşık 3 kat kalın çizildi)',
    notes:
      'Kuruluyken sarımların çoğu mile sıkı sarılıdır; boşalırken şerit duvara yaslanır. Kurulum modeli şerit uzunluğunu sabit tutar: bir tur kurma, içe birkaç sarım ekler, duvardan bir sarım eksiltir. 8 tur kurma ≈ 80 saat.',
  }),
  barrelArbor: def('barrel-arbor', 'Zemberek mili', 'barrel', [0, -155, 0], 2, {
    function: 'Zembereğin iç ucunu tutar; üst ucu cırcır çarkını taşır. Çalışırken tırnak tarafından tutulduğu için dönmez.',
    material: 'Sertleştirilmiş çelik',
    notes: 'Kurulurken mil tamburun dönüş yönünde ileri döner; tırnak dişlerin üzerinden atlar, geri dönmesine izin vermez.',
  }),
  plate: def('plate', 'Ana plaka', 'plate', [0, 0, 0], 0, {
    function:
      'Mekanizmanın taşıyıcı tabanı: pivot delikleri, yakut yataklar, köprü sütunları, emniyet pimleri ve akrep-yelkovan saplamaları bunun üzerindedir.',
    material: 'Rodyum kaplı pirinç',
    notes: 'Ø 25,6 mm (11½ ligne).',
  }),
  // ------------------------------------------------------------ dial side
  secondHand: def('second-hand', 'Saniye ibresi', 'hands', [0, 225, 0], 0, {
    function: 'Merkez saniye: dördüncü çarkın miline takılıdır, saniyede 6 küçük adım atar.',
    material: 'Maviletilmiş çelik',
    notes: 'Kuyruğundaki karşı ağırlık ibreyi mil üzerinde dengeler.',
  }),
  minuteHand: def('minute-hand', 'Yelkovan', 'hands', [0, 215, 0], 1, {
    function: 'Kanon pinyonunun borusuna takılı; saatte bir tur.',
    material: 'Cilalı, rodyum kaplı pirinç',
    notes: 'Kanon pinyonu sürtünmeyle takılı olduğundan yelkovan saat ayarlanırken takımdan bağımsız çevrilebilir.',
  }),
  hourHand: def('hour-hand', 'Akrep', 'hands', [0, 205, 0], 2, {
    function: 'Akrep çarkının borusuna takılı; 12 saatte bir tur.',
    material: 'Cilalı, rodyum kaplı pirinç',
    notes: 'İbreler kadranın üstünde sırayla yükselir: akrep, yelkovan, saniye.',
  }),
  dial: def('dial', 'Kadran', 'dial', [0, 190, 0], 0, {
    function: 'Okuma yüzü: saat işaretleri, dakika taksimatı ve saat 3’te tarih penceresi.',
    material: 'Gümüş kaplamalı pirinç, çakma indeksler',
    notes: 'Saat 3’teki pencerenin altında tarih halkası döner; pencere her an tek bir rakamı gösterir.',
  }),
  hourWheel: def('hour-wheel', 'Akrep çarkı', 'motion-works', [0, 160, 0], 0, {
    function: '12 saatte bir tur atar ve akrebi taşır; tarih sürücüsünü de çevirir.',
    material: 'Yaldızlı pirinç, çelik boru',
    notes: '32 diş, ara pinyon 8 yaprak: 4:1.',
  }),
  dateDriver: def('date-driver', 'Tarih sürücü çarkı', 'motion-works', [0, 145, 0], 1, {
    function: '24 saatte bir tur atar; parmağı her gece tarih halkasını bir diş ilerletir.',
    material: 'Yaldızlı pirinç, çelik parmak',
    notes: '64 diş: akrep çarkının 2 turunda 1 tur. Parmağı 22:00–24:00 arasında halkayı bir diş ilerletir.',
  }),
  minuteWheel: def('minute-wheel', 'Ara çark (dakika çarkı)', 'motion-works', [0, 130, 0], 2, {
    function: 'Kanon pinyonundan akrep çarkına 12:1 indirgemeyi yapan ara çark ve pinyon.',
    material: 'Yaldızlı pirinç çark, çelik pinyon',
    notes: '36/12 × 32/8 = 12.',
  }),
  cannonPinion: def('cannon-pinion', 'Kanon pinyonu', 'motion-works', [0, 25, 0], 3, {
    function: 'Merkez çarkın borusuna sürtünmeyle takılıdır; yelkovanı taşır ve akrep-yelkovan takımını sürer.',
    material: 'Çelik',
    notes: '12 yaprak; borusu yelkovanın oturduğu yerdir.',
  }),
  // ------------------------------------------------------------ rotor, winding wheels
  rotor: def('rotor', 'Otomatik rotor', 'rotor', [0, -685, 0], 0, {
    function: 'Yarım ay biçimli salınım ağırlığı: bileğin hareketiyle her iki yöne de döner ve zembereği kurar.',
    material: 'Rodyum kaplı taban, kalın dış ağırlık segmenti (ağır alaşım), çelik pinyon',
    notes:
      'Merkez eksende bir bilyalı rulmanla döner; altındaki pinyonu iki yön değiştirici çarka bağlıdır. Yaklaşık 72 rotor turu 1 zemberek turu kurar.',
  }),
  rotorBearing: def('rotor-bearing', 'Rotor bilyalı rulmanı', 'rotor', [0, -655, 0], 1, {
    function: 'Rotorun sürtünmesiz dönmesini sağlar: iç bileziği köprüye vidalı saplamadır, bilyalar rotorun göbeğiyle saplama arasında yuvarlanır.',
    material: 'Çelik saplama, çelik bilya ve kafes',
    notes: 'Bilya kafesi rotorun yaklaşık %62’si kadar hızla döner.',
  }),
  ratchetWheel: def('ratchet-wheel', 'Cırcır çarkı', 'winding', [0, -640, 0], 2, {
    function: 'Zemberek milinin üstündedir; taç çarkı ve otomatik kurma onu çevirerek zembereği kurar. Testere dişli halkasını tırnak tutar.',
    material: 'Sertleştirilmiş çelik',
    notes: '64 dişli kurma dişlisi ve 36 testere dişi (her biri 10°). Mil ve cırcır saat çalışırken sabit kalır.',
  }),
  click: def('click', 'Tırnak (click)', 'winding', [0, -655, 0], 1, {
    function: 'Cırcır çarkının geri dönmesini engeller: kurulurken dişlerin eğimli yüzünden kayıp atlar, dik yüze dayanınca tutar.',
    material: 'Çelik',
    notes: 'Köprüye vidalı saplama üzerinde döner; ucu her dişte iner kalkar.',
  }),
  clickSpring: def('click-spring', 'Tırnak yayı', 'winding', [0, -670, 0], 0, {
    function: 'Tırnağı cırcırın testere dişlerine bastırır.',
    material: 'Maviletilmiş çelik tel',
    notes: 'Tırnağın kuyruğuna dayanır; tırnağın salınımı bu yaylanmayla karşılanır.',
  }),
  crownWheel: def('crown-wheel', 'Taç çarkı', 'winding', [0, -625, 0], 3, {
    function: 'Kurma pinyonundan aldığı hareketi cırcır çarkına iletir.',
    material: 'Yaldızlı pirinç çark, çelik kontrat dişlisi ve mil',
    notes: 'Altında kurma pinyonunun yapraklarının girdiği 16 dişli kontrat halkası vardır. Taç oranı: 10/16 · 36/64 ≈ 0,35 cırcır turu / taç turu, yani zemberek turu başına 2,84 taç turu.',
  }),
  reverser1: def('reverser-1', 'Yön değiştirici çark 1', 'winding', [0, -585, 0], 4, {
    function: 'Rotor pinyonuyla doğrudan kavrar; yalnızca rotor tek yönde dönerken pinyonunu sürer.',
    material: 'Yaldızlı pirinç çark, çelik pinyon',
    notes: 'Çark rotora ters yönde döner; üstteki pinyon zemberek yönünde dönebilmek için kendi kavramasını kullanır.',
  }),
  reverser2: def('reverser-2', 'Yön değiştirici çark 2', 'winding', [0, -570, 0], 5, {
    function: 'Birinci çarkla kavrar, bu yüzden rotorla aynı yönde döner; rotor öbür yöne dönünce kurmayı o üstlenir.',
    material: 'Yaldızlı pirinç çark, çelik pinyon',
    notes: 'İki yön değiştirici birlikte rotorun her iki yönünü de zemberek yönüne çevirir.',
  }),
  reductionWheel: def('reduction-wheel', 'Redüksiyon çarkı', 'winding', [0, -555, 0], 6, {
    function: 'Yön değiştirici pinyonlarının hareketini yavaşlatarak cırcıra aktarır.',
    material: 'Yaldızlı pirinç çark, çelik pinyon',
    notes: 'Rotor : cırcır = 14/21 · 8/48 · 8/64 = 1/72.',
  }),
  // ------------------------------------------------------------ keyless works (back)
  settingLever: def('setting-lever', 'Ayar kolu', 'keyless-dial', [0, 50, 0], 6, {
    function: 'Kadran tarafında durur; plakadaki delikten inen pimi kurma kolunun yivlerine oturur ve taç konumunu tutar; konum değişince bir yivden ötekine atlar.',
    material: 'Çelik',
    notes: 'Pres kesim çelik levha; yayı pimini yive bastırır. Konum 3’te saniye durdurma (hack) devreye girer: balans ≈ 0,25 s içinde durur, saniye ibresi ve takım durur; modelde bu kinematik olarak gösterilir, hack kolu ayrıca çizilmedi.',
  }),
  yoke: def('yoke', 'Sürgü (yoke)', 'keyless-dial', [0, 50, 0], 7, {
    function: 'Kadran tarafında plaka ile kadran arasında durur; plakadaki yuvadan geçen çatal pimleri kayar pinyonun yivine oturur ve pinyonu taç konumuna göre kaydırır.',
    material: 'Çelik',
    notes: 'Pres kesim çelik levha (pahlı kenar, delik, pim). Konum 1’de pinyon kurma pinyonuna, konum 2 ve 3’te ayar ara çarkına kavrar; yayı onu yatağında tutar.',
  }),
  windingStem: def('winding-stem', 'Kurma kolu ve taç', 'keyless', [220, 0, 0], 0, {
    function: 'Taçtan aldığı dönmeyi kayar pinyona iletir; eksenel konumu üç konumu belirler: 1 kurma, 2 hızlı tarih, 3 saat ayarı.',
    material: 'Sertleştirilmiş çelik, çelik taç',
    notes: 'Plakanın dışında saat 3’te biter; ayar kolunun yivleri üç konumu işaretler.',
  }),
  slidingPinion: def('sliding-pinion', 'Kayar pinyon', 'keyless', [0, -55, 0], 1, {
    function: 'Kurma kolunun karesine geçmiştir, boyuna kayar. Konum 1’de Breguet dişleriyle kurma pinyonuna tutunur; dışarı çekilince yaprakları ayar ara çarkına kavrar.',
    material: 'Çelik',
    notes: 'Breguet dişleri bir yönde tutar, öbür yönde kayar: bu yüzden taç ters yönde döndürülünce zemberek sökülmez. Taç oranları: bir taç turu = 0,83 yelkovan turu (konum 3).',
  }),
  windingPinion: def('winding-pinion', 'Kurma pinyonu', 'keyless', [0, -25, 0], 2, {
    function: 'Kurma kolunda boşta durur; Breguet dişlerinden aldığı hareketi taç çarkının kontrat dişlisine verir.',
    material: 'Çelik',
    notes: '10 yaprak, kontrat halkasının 16 dişine dik açıyla kavrar.',
  }),
  intermediateContrate: def('intermediate-contrate', 'Ayar ara çarkı (kontrat dişlisi)', 'keyless-dial', [0, -70, 0], 0, {
    function: 'Kayar pinyonun yapraklarını karşılayan kontrat dişli; konum 2 ve 3’te ayar hareketini plakanın içinden kadran tarafına geçirir.',
    material: 'Çelik',
    notes: 'Mile pres geçmiştir; önce bu dişli çıkar, sonra mil kadran tarafından çekilir.',
  }),
  // ------------------------------------------------------------ date
  dateRing: def('date-ring', 'Tarih halkası', 'date', [0, 180, 0], 0, {
    function: '31 iç dişli halka, üst yüzünde 1–31 rakamları; kadrandaki pencereden bugünün rakamı görünür.',
    material: 'Pirinç halka, baskılı rakamlar',
    notes:
      'Her gün 22:00–24:00 arasında sürücü parmağı halkayı bir diş ilerletir (yaklaşık %60), kalanını atlama yayı tamamlar. Halka hiç geri dönmez; 31’den sonra 1’e döner.',
  }),
  dateJumper: def('date-jumper', 'Atlama yayı', 'date', [0, 25, 0], 1, {
    function: 'V şeklindeki ucuyla halkayı diş aralarında tutar ve her adımı tamamlar.',
    material: 'Maviletilmiş çelik',
    notes: 'Halkanın diş tepesinden geçerken yay yaprağı kalkar, bir sonraki boşluğa düşünce halka bir diş ilerlemiş olur.',
  }),
  // ------------------------------------------------------------ keyless works (dial side)
  settingWheel: def('setting-wheel', 'Ayar çarkı', 'keyless-dial', [0, 115, 0], 1, {
    function: 'Ayar ara çarkının çevresinde sallanan bir kol üzerindedir: konum 3’te yelkovan ara çarkına, konum 2’de tarih düzeltme çarkına kavrar, konum 1’de boştadır.',
    material: 'Yaldızlı pirinç çark, çelik kol',
    notes: 'Saat ayarında bir taç turu yelkovanı 50 dakika ilerletir.',
  }),
  dateCorrector: def('date-corrector', 'Tarih düzeltme çarkı', 'keyless-dial', [0, 25, 0], 2, {
    function: 'Konum 2’de ayar çarkından aldığı dönmeyle üç parmaklı yıldızı çevirir; yıldız tarih halkasını hızla ilerletir.',
    material: 'Yaldızlı pirinç çark, çelik yıldız',
    notes: 'Yıldızın her parmağı halkayı bir diş ilerletir: 192° taç dönüşü = 1 gün. Ters yönde döndürülünce parmaklar atlama yayının üstünden kayar, tarih geri gitmez.',
  }),
  intermediateGear: def('intermediate-gear', 'Ayar ara çarkı', 'keyless-dial', [0, 100, 0], 3, {
    function: 'Plakadan geçen mili ile arka taraftaki kontrat dişlisine bağlıdır; kadran tarafındaki dişlisi ayar çarkını çevirir.',
    material: 'Yaldızlı pirinç dişli, çelik mil',
    notes: 'Ayar çarkının sallandığı eksendir.',
  }),
  settingLeverSpring: def('setting-lever-spring', 'Ayar kolu yayı', 'keyless-dial', [0, 65, 0], 4, {
    function: 'Ayar kolunu kurma kolunun yivlerine bastırır.',
    material: 'Maviletilmiş çelik yaprak yay',
    notes: 'Plakaya vidalı sütundan çıkar, ayar kolunun kenarına dayanır.',
  }),
  yokeSpring: def('yoke-spring', 'Sürgü yayı', 'keyless-dial', [0, 65, 0], 5, {
    function: 'Sürgüyü kayar pinyonun yivine karşı yatağında tutar.',
    material: 'Maviletilmiş çelik yaprak yay',
    notes: 'Sürgünün kolunun kenarına dayanır; taç konumu değişirken sürgü yayı yener.',
  }),
} as const satisfies Record<string, PartDef>;

/** Part that turns with each body of the train. */
export const BODY_PART: Readonly<Record<Body, string>> = {
  barrel: PARTS.barrel.id,
  centre: PARTS.centreWheel.id,
  third: PARTS.thirdWheel.id,
  fourth: PARTS.fourthWheel.id,
  escape: PARTS.escapeWheel.id,
  cannon: PARTS.cannonPinion.id,
  minuteWheel: PARTS.minuteWheel.id,
  hourWheel: PARTS.hourWheel.id,
  dateDriver: PARTS.dateDriver.id,
};
