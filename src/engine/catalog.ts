import type { LayerDef, PartDef, PartInfo, Vec3 } from '../core/registry';

/** Disassembly layers, outermost first (VISION §4). */
export const LAYERS = [
  { id: 'valve-cover', nameTr: 'Supap kapağı', order: 1 },
  { id: 'intake-manifold', nameTr: 'Emme manifoldu', order: 2 },
  { id: 'exhaust-manifold', nameTr: 'Egzoz manifoldu', order: 3 },
  { id: 'plugs-injectors', nameTr: 'Bujiler ve enjektörler', order: 4 },
  { id: 'chain-cover', nameTr: 'Zincir kapağı', order: 5 },
  { id: 'timing-drive', nameTr: 'Zincir, dişliler ve gergi', order: 6 },
  { id: 'camshafts', nameTr: 'Eksantrik milleri ve yatak kapakları', order: 7 },
  { id: 'valvetrain', nameTr: 'Supaplar, yaylar ve itici kovanlar', order: 8 },
  { id: 'cylinder-head', nameTr: 'Silindir kapağı ve conta', order: 9 },
  { id: 'oil-pan', nameTr: 'Yağ karteri', order: 10 },
  { id: 'rods-pistons', nameTr: 'Biyel kapakları, biyeller ve pistonlar', order: 11 },
  { id: 'main-caps', nameTr: 'Ana yatak kapakları', order: 12 },
  { id: 'crankshaft', nameTr: 'Krank mili', order: 13 },
  { id: 'flywheel', nameTr: 'Volan', order: 14 },
  { id: 'block', nameTr: 'Motor bloğu', order: 15 },
] as const satisfies readonly LayerDef[];

export type EngineLayerId = (typeof LAYERS)[number]['id'];

const def = (
  id: string,
  nameTr: string,
  group: EngineLayerId,
  explodeOffset: Vec3,
  explodeOrder: number,
  info: PartInfo,
): PartDef => ({ id, nameTr, group, explodeOffset, explodeOrder, info });

const ordinal = (n: number) => `${n}.`;

/*
 * Explode offsets are first drafts (mm, world axes). Phase 3 tunes them and
 * builds the timeline; the directions already follow the real teardown:
 * pan down, pistons/rods up out of the bores, caps down, crank down and forward.
 */
export const PARTS = {
  block: def('block', 'Motor bloğu', 'block', [0, 0, 0], 0, {
    function:
      'Silindirleri, krank yataklarını ve soğutma suyu ceketini taşıyan ana gövde. Yanma basıncını ve krank yataklarındaki kuvvetleri tek bir rijit yapıda kapatır.',
    material: 'Alüminyum döküm (AlSi alaşımı), dökme demir gömlekli',
    notes:
      'Silindirler arası 88 mm, çap 80.5 mm: aralarında yalnızca 7.5 mm et kaldığı için gömlekler “siyam” (birleşik) yapıdadır. Kapalı tavanlı (closed-deck) su ceketi üst yüzeyin rijitliğini artırır.',
  }),
  liner: (n: number) =>
    def(`liner-${n}`, `Silindir gömleği (${ordinal(n)} silindir)`, 'block', [0, 0, 0], n, {
      function: 'Pistonun ve segmanların kaydığı aşınmaya dayanıklı yüzey.',
      material: 'Gri dökme demir, honlanmış iç yüzey',
      notes: 'Honlama izleri (çapraz çizgiler) yağ filmini tutar. Alüminyum bloğa döküm sırasında gömülür (cast-in).',
    }),
  mainCap: (n: number) =>
    def(`main-cap-${n}`, `Ana yatak kapağı (${ordinal(n)})`, 'main-caps', [0, -170, 0], n, {
      function: 'Krank milinin ana muylularını bloğa bağlayan, yatak zarflarının alt yarısını taşıyan kapak.',
      material: 'Sinterlenmiş çelik / sfero döküm',
      notes:
        'Kapaklar blokla birlikte işlenir (line-boring); bu yüzden yerleri ve yönleri karıştırılamaz. Cıvatalar akma sınırına yakın torklanır.',
    }),
  crankshaft: def('crankshaft', 'Krank mili', 'crankshaft', [-60, -260, 0], 0, {
    function: 'Pistonların doğrusal hareketini biyeller üzerinden dönme hareketine çevirir ve torku volana iletir.',
    material: 'Dövme çelik (ör. 42CrMo4), indüksiyonla sertleştirilmiş muylular',
    notes:
      '5 ana muylu, 4 biyel muylusu: 1-4 muyluları 0°, 2-3 muyluları 180°. 8 karşı ağırlık, dönen kütleleri ve ana yatak yüklerini dengeler. Muylu köşelerindeki radüsler gerilme yığılmasını azaltır.',
  }),
  crankSprocket: def('crank-sprocket', 'Krank zincir dişlisi', 'timing-drive', [-140, 0, 0], 0, {
    function: 'Zamanlama zincirini sürer; eksantrik dişlileriyle 1:2 oranındadır.',
    material: 'Sertleştirilmiş çelik',
    notes: '21 diş, 8 mm adım. Eksantrik dişlileri 42 diş olduğunda eksantrik krankın yarı hızında döner.',
  }),
  flywheel: def('flywheel', 'Volan', 'flywheel', [240, 0, 0], 0, {
    function: 'Zamanlar arasındaki tork dalgalanmasını ataletle yumuşatır; kavrama yüzeyini ve marş dişlisini taşır.',
    material: 'Gri dökme demir, işlenmiş kavrama yüzeyi',
    notes: 'Dört zamanlı bir motorda her silindir yalnızca 720°’de bir iş üretir; volan bu boşlukları doldurur.',
  }),
  ringGear: def('ring-gear', 'Marş dişlisi (volan dişlisi)', 'flywheel', [240, 0, 0], 1, {
    function: 'Marş motoru pinyonunun motoru çevirdiği dişli çember.',
    material: 'Sertleştirilmiş çelik, volana sıcak geçirilmiş',
    notes: '132 diş, modül 2.1. Marş pinyonu ~10 diş olduğundan yaklaşık 13:1 redüksiyon sağlar.',
  }),
  oilPan: def('oil-pan', 'Yağ karteri', 'oil-pan', [0, -320, 0], 0, {
    function: 'Motor yağını toplar ve depolar; yağ pompası emişini besler.',
    material: 'Preslenmiş çelik sac, boyalı',
    notes: 'Arka taraftaki derin hazne (sump), ivmelenme ve frenlemede yağ emişinin açıkta kalmamasını sağlar.',
  }),
  piston: (n: number) =>
    def(`piston-${n}`, `Piston (${ordinal(n)} silindir)`, 'rods-pistons', [0, 300, 0], n, {
      function: 'Yanma basıncını karşılayıp kuvveti piston pimi üzerinden biyele aktarır.',
      material: 'Alüminyum-silisyum döküm/dövme alaşım',
      notes:
        'Tepe çapı eteğe göre biraz küçüktür: çalışırken en sıcak bölge en çok genleşir. Kubbeli tepedeki cepler supaplara boşluk bırakır.',
    }),
  pistonPin: (n: number) =>
    def(`piston-pin-${n}`, `Piston pimi (${ordinal(n)} silindir)`, 'rods-pistons', [0, 300, 0], n, {
      function: 'Pistonu biyelin küçük ucuna bağlar; biyel bu pim etrafında salınır.',
      material: 'Sementasyon çeliği, taşlanmış',
      notes: 'İçi boştur: eğilme rijitliğini korurken ileri-geri giden kütleyi azaltır.',
    }),
  rings: (n: number) =>
    def(`rings-${n}`, `Segmanlar (${ordinal(n)} silindir)`, 'rods-pistons', [0, 300, 0], n, {
      function: 'Yanma odasını sızdırmaz tutar (kompresyon segmanları) ve silindir duvarındaki fazla yağı sıyırır (yağ segmanı).',
      material: 'Nitrürlenmiş çelik / dökme demir, krom kaplı',
      notes: 'Segman ağızları birbirine göre kaydırılarak yerleştirilir ki gazlar düz bir kaçak yolu bulamasın.',
    }),
  rod: (n: number) =>
    def(`rod-${n}`, `Biyel (${ordinal(n)} silindir)`, 'rods-pistons', [0, 260, 0], n, {
      function: 'Pistonun ileri-geri hareketini krank muylusunun dönme hareketine bağlar.',
      material: 'Dövme çelik',
      notes: 'I-kesit, aynı kütleyle burkulmaya karşı en yüksek atalet momentini verir. Merkezden merkeze 133 mm; λ = r/l ≈ 0.295.',
    }),
  rodCap: (n: number) =>
    def(`rod-cap-${n}`, `Biyel kapağı (${ordinal(n)} silindir)`, 'rods-pistons', [0, -150, 0], n, {
      function: 'Biyelin büyük ucunu krank muylusu etrafında kapatır.',
      material: 'Dövme çelik, cıvatalarla biyele bağlı',
      notes: 'Kapak ve biyel birlikte işlenir; birbirleriyle değiştirilemezler.',
    }),
} as const;
