import type { LayerDef, PartDef, PartInfo, Vec3 } from '../core/registry';
import type { Body } from './specs';

/**
 * Disassembly layers, in teardown order. Back (bridge side, −Y): the rotor's
 * place is kept for the automatic package, then the balance with its cock,
 * the bridges, the lever, the train wheels, the barrel. Dial side (+Y): hands,
 * dial, motion works. The plate comes off last.
 */
export const LAYERS = [
  { id: 'rotor', shortTr: 'Rotor', nameTr: 'Otomatik rotor', order: 1 },
  { id: 'balance', shortTr: 'Balans', nameTr: 'Balans köprüsü ve balans', order: 2 },
  { id: 'bridges', shortTr: 'Köprüler', nameTr: 'Köprüler ve vidalar', order: 3 },
  { id: 'lever', shortTr: 'Çatal', nameTr: 'Çatal', order: 4 },
  { id: 'train', shortTr: 'Takım', nameTr: 'Takım çarkları', order: 5 },
  { id: 'barrel', shortTr: 'Zemberek', nameTr: 'Zemberek kutusu', order: 6 },
  { id: 'hands', shortTr: 'İbreler', nameTr: 'İbreler', order: 7 },
  { id: 'dial', shortTr: 'Kadran', nameTr: 'Kadran', order: 8 },
  { id: 'motion-works', shortTr: 'Akrep-yelkovan', nameTr: 'Akrep-yelkovan takımı', order: 9 },
  { id: 'plate', shortTr: 'Plaka', nameTr: 'Ana plaka', order: 10 },
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
  balanceCock: def('balance-cock', 'Balans köprüsü', 'balance', [0, -430, 0], 0, {
    function: 'Balansın üst pivotunu taşıyan tek ayaklı köprü; spiralin dış ucunu tutan saplama da ona bağlıdır.',
    material: 'Rodyum kaplı pirinç, yakut yatak taşı',
    notes: 'Tek vidayla sabitlenir; servis ve ayar için ilk sökülen parçadır.',
  }),
  hairspring: def('hairspring', 'Spiral yay', 'balance', [0, -390, 0], 1, {
    function: 'Balansı denge konumuna geri çeken yay; balansla birlikte salınımın periyodunu belirler.',
    material: 'Nivarox tipi alaşım (sıcaklıkla esnekliği az değişir)',
    notes:
      'Yaklaşık 13 turluk düz Arşimet spirali: iç ucu balans milindeki kolete, dış ucu saplamaya bağlı. Balans döndükçe sarımlar sıkışıp açılır.',
  }),
  balance: def('balance', 'Balans', 'balance', [0, -350, 0], 2, {
    function: 'Saatin zaman tabanı: spiral yayla birlikte saniyede 3 tam salınım (6 vuruş, 21.600 A/s) yapan çark.',
    material: 'Glucydur (berilyum bronzu) jant, çelik mil, yakut impuls taşı',
    notes:
      'Genlik tam kuruluyken ≈ 300°, rezervin sonunda ≈ 200°. Miline takılı makara tablasındaki impuls taşı her vuruşta çatalın ağzına girer.',
  }),
  bridgeScrews: def('bridge-screws', 'Köprü vidaları', 'bridges', [0, -310, 0], 0, {
    function: 'Köprüleri sütunları üzerinden plakaya bağlar.',
    material: 'Isıl işlemle maviletilmiş çelik',
    notes: 'Mavi renk boya değildir: çelik ≈ 290 °C’ye ısıtılınca oluşan ince oksit tabakasıdır.',
  }),
  barrelBridge: def('barrel-bridge', 'Zemberek kutusu köprüsü', 'bridges', [0, -260, 0], 1, {
    function: 'Zemberek kutusunun milini taşır; iki sütun arasında kutunun üstünü örter.',
    material: 'Rodyum kaplı pirinç',
    notes: 'Kurma çarkları ve otomatik kurma düzeni sonraki pakette bu köprünün üzerine gelir.',
  }),
  trainBridge: def('train-bridge', 'Takım köprüsü', 'bridges', [0, -260, 0], 2, {
    function: 'Merkez (ve saniye), üçüncü ve çıkış çarklarının üst pivotlarını taşır.',
    material: 'Rodyum kaplı pirinç, yakut yatak taşları',
    notes: 'Dalgalı kolu üç pivotun üzerinden geçerek iki sütuna uzanır.',
  }),
  palletBridge: def('pallet-bridge', 'Çatal köprüsü', 'bridges', [0, -260, 0], 3, {
    function: 'Çatalın üst pivotunu taşıyan küçük köprü.',
    material: 'Rodyum kaplı pirinç, yakut yatak taşı',
    notes: 'Çatal ancak bu köprü ve balans söküldükten sonra çıkarılabilir.',
  }),
  lever: def('lever', 'Çatal (palet çatalı)', 'lever', [0, -210, 0], 0, {
    function:
      'Balansla çıkış çarkı arasındaki bağlantı: her vuruşta çarkı yarım diş serbest bırakır ve balansa itme verir.',
    material: 'Çelik gövde, yakut giriş ve çıkış paletleri',
    notes:
      'Paletler 2½ diş aralıklı; çatal iki emniyet pimi arasında ≈ 10° salınır. Emniyet pimi, makaradaki yarımay oyuğu dışında balansın çatalı yanlışlıkla çevirmesini önler.',
  }),
  escapeWheel: def('escape-wheel', 'Çıkış çarkı', 'train', [0, -170, 0], 0, {
    function: 'Takımdan gelen gücü çatala aktaran 15 dişli çark.',
    material: 'Sertleştirilmiş, cilalı çelik; çelik pinyon',
    notes:
      'Ayaklı ("club") dişlerin her birinde ayrı bir kilit yüzü ve impuls yüzü vardır. Vuruş başına 12°, dakikada 12 tur döner.',
  }),
  fourthWheel: def('fourth-wheel', 'Dördüncü çark (saniye çarkı)', 'train', [0, -160, 0], 1, {
    function: 'Dakikada bir tur atar; uzun mili merkez borunun içinden geçerek saniye ibresini taşır.',
    material: 'Yaldızlı pirinç çark, çelik pinyon ve mil',
    notes: '96 diş, çıkış pinyonu 8 yaprak: 12:1.',
  }),
  thirdWheel: def('third-wheel', 'Üçüncü çark', 'train', [0, -130, 0], 2, {
    function: 'Merkez çarktan dördüncü çarka hızı artırır.',
    material: 'Yaldızlı pirinç çark, çelik pinyon',
    notes: '75 diş, 10 yapraklı pinyon. 80/10 × 75/10 = 60: merkez çark saatte, dördüncü çark dakikada bir tur.',
  }),
  centreWheel: def('centre-wheel', 'Merkez çark (yelkovan çarkı)', 'train', [70, -100, 50], 3, {
    function: 'Saatte bir tur atar; kanon pinyonu üzerinden yelkovanı taşır.',
    material: 'Yaldızlı pirinç çark, çelik pinyon ve boru',
    notes: 'Zemberek kutusu (100 diş) onu 10 yapraklı pinyonundan sürer: kutu 10 saatte bir tur atar.',
  }),
  barrel: def('barrel', 'Zemberek kutusu', 'barrel', [0, -90, 0], 0, {
    function: 'Kurulu zembereği barındırır, gücü dişli jantıyla takıma verir.',
    material: 'Pirinç tambur ve kapak, çelik mil',
    notes:
      'Bu pakette dıştan kapalı bir tambur olarak çizildi; zemberek ve kurma düzeni sonraki pakette. 8 etkin tur ≈ 80 saat güç rezervi.',
  }),
  plate: def('plate', 'Ana plaka', 'plate', [0, 0, 0], 0, {
    function:
      'Mekanizmanın taşıyıcı tabanı: pivot delikleri, yakut yataklar, köprü sütunları, emniyet pimleri ve akrep-yelkovan saplamaları bunun üzerindedir.',
    material: 'Rodyum kaplı pirinç',
    notes: 'Ø 25,6 mm (11½ ligne).',
  }),
  // ------------------------------------------------------------ dial side
  secondHand: def('second-hand', 'Saniye ibresi', 'hands', [0, 320, 0], 0, {
    function: 'Merkez saniye: dördüncü çarkın miline takılıdır, saniyede 6 küçük adım atar.',
    material: 'Maviletilmiş çelik',
    notes: 'Kuyruğundaki karşı ağırlık ibreyi mil üzerinde dengeler.',
  }),
  minuteHand: def('minute-hand', 'Yelkovan', 'hands', [0, 285, 0], 1, {
    function: 'Kanon pinyonunun borusuna takılı; saatte bir tur.',
    material: 'Cilalı, rodyum kaplı pirinç',
    notes: 'Kanon pinyonu sürtünmeyle takılı olduğundan yelkovan saat ayarlanırken takımdan bağımsız çevrilebilir.',
  }),
  hourHand: def('hour-hand', 'Akrep', 'hands', [0, 250, 0], 2, {
    function: 'Akrep çarkının borusuna takılı; 12 saatte bir tur.',
    material: 'Cilalı, rodyum kaplı pirinç',
    notes: 'İbreler kadranın üstünde sırayla yükselir: akrep, yelkovan, saniye.',
  }),
  dial: def('dial', 'Kadran', 'dial', [0, 200, 0], 0, {
    function: 'Okuma yüzü: saat işaretleri, dakika taksimatı ve saat 3’te tarih penceresi.',
    material: 'Gümüş kaplamalı pirinç, çakma indeksler',
    notes: 'Tarih halkası sonraki pakette; pencerenin arkası şimdilik boş.',
  }),
  hourWheel: def('hour-wheel', 'Akrep çarkı', 'motion-works', [0, 165, 0], 0, {
    function: '12 saatte bir tur atar ve akrebi taşır; tarih sürücüsünü de çevirir.',
    material: 'Yaldızlı pirinç, çelik boru',
    notes: '32 diş, ara pinyon 8 yaprak: 4:1.',
  }),
  dateDriver: def('date-driver', 'Tarih sürücü çarkı', 'motion-works', [0, 150, 0], 1, {
    function: '24 saatte bir tur atar; parmağı her gece tarih halkasını bir diş ilerletir.',
    material: 'Yaldızlı pirinç, çelik parmak',
    notes: '64 diş: akrep çarkının 2 turunda 1 tur. Tarih halkası (31 diş) sonraki pakette.',
  }),
  minuteWheel: def('minute-wheel', 'Ara çark (dakika çarkı)', 'motion-works', [0, 130, 0], 2, {
    function: 'Kanon pinyonundan akrep çarkına 12:1 indirgemeyi yapan ara çark ve pinyon.',
    material: 'Yaldızlı pirinç çark, çelik pinyon',
    notes: '36/12 × 32/8 = 12.',
  }),
  cannonPinion: def('cannon-pinion', 'Kanon pinyonu', 'motion-works', [0, 110, 0], 3, {
    function: 'Merkez çarkın borusuna sürtünmeyle takılıdır; yelkovanı taşır ve akrep-yelkovan takımını sürer.',
    material: 'Çelik',
    notes: '12 yaprak; borusu yelkovanın oturduğu yerdir.',
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
