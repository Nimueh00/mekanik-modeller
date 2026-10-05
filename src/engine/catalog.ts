import type { LayerDef, PartDef, PartInfo, Vec3 } from '../core/registry';

/** Disassembly layers, outermost first (VISION §4). */
export const LAYERS = [
  { id: 'valve-cover', shortTr: 'Supap kapağı', nameTr: 'Supap kapağı', order: 1 },
  { id: 'intake-manifold', shortTr: 'Emme', nameTr: 'Emme manifoldu', order: 2 },
  { id: 'exhaust-manifold', shortTr: 'Egzoz', nameTr: 'Egzoz manifoldu', order: 3 },
  { id: 'plugs-injectors', shortTr: 'Buji/Enjektör', nameTr: 'Bujiler ve enjektörler', order: 4 },
  { id: 'chain-cover', shortTr: 'Zincir kapağı', nameTr: 'Zincir kapağı', order: 5 },
  { id: 'timing-drive', shortTr: 'Zincir/Dişli', nameTr: 'Zincir, dişliler ve gergi', order: 6 },
  { id: 'camshafts', shortTr: 'Eksantrikler', nameTr: 'Eksantrik milleri ve yatak kapakları', order: 7 },
  { id: 'valvetrain', shortTr: 'Supaplar', nameTr: 'Supaplar, yaylar ve itici kovanlar', order: 8 },
  { id: 'cylinder-head', shortTr: 'Silindir kapağı', nameTr: 'Silindir kapağı ve conta', order: 9 },
  { id: 'oil-pan', shortTr: 'Karter', nameTr: 'Yağ karteri', order: 10 },
  { id: 'rods-pistons', shortTr: 'Piston/Biyel', nameTr: 'Biyel kapakları, biyeller ve pistonlar', order: 11 },
  { id: 'main-caps', shortTr: 'Yatak kapakları', nameTr: 'Ana yatak kapakları', order: 12 },
  { id: 'crankshaft', shortTr: 'Krank', nameTr: 'Krank mili', order: 13 },
  { id: 'flywheel', shortTr: 'Volan', nameTr: 'Volan', order: 14 },
  { id: 'block', shortTr: 'Blok', nameTr: 'Motor bloğu', order: 15 },
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
 * Explode offsets (mm, world axes: +X flywheel end, +Y up, +Z towards the viewer).
 * Directions follow the real teardown: pan down, pistons/rods up out of the
 * bores, rod and main caps down, crank down and forward (+Z) clear of the caps,
 * flywheel to the rear (+X), timing drive to the front (-X).
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
    def(`main-cap-${n}`, `Ana yatak kapağı (${ordinal(n)})`, 'main-caps', [0, -210, 0], n, {
      function: 'Krank milinin ana muylularını bloğa bağlayan, yatak zarflarının alt yarısını taşıyan kapak.',
      material: 'Sinterlenmiş çelik / sfero döküm',
      notes:
        'Kapaklar blokla birlikte işlenir (line-boring); bu yüzden yerleri ve yönleri karıştırılamaz. Cıvatalar akma sınırına yakın torklanır.',
    }),
  crankshaft: def('crankshaft', 'Krank mili', 'crankshaft', [-130, -170, 220], 0, {
    function: 'Pistonların doğrusal hareketini biyeller üzerinden dönme hareketine çevirir ve torku volana iletir.',
    material: 'Dövme çelik (ör. 42CrMo4), indüksiyonla sertleştirilmiş muylular',
    notes:
      '5 ana muylu, 4 biyel muylusu: 1-4 muyluları 0°, 2-3 muyluları 180°. Bu düzen 1. ve 2. derece kuvvetleri ve dönen kütle momentlerini sıralı dörtlüde birbirini götürür. 8 karşı ağırlık, dönen kütleleri dengeleyerek ana yatak yüklerini ve titreşimi azaltır (balans). Muylu köşelerindeki radüsler gerilme yığılmasını ve yorulma çatlağını önler; her ana muylunun yanında bir karşı ağırlık bulunduğu için mil yüksek devirde bile eğilmez.',
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
    def(`piston-${n}`, `Piston (${ordinal(n)} silindir)`, 'rods-pistons', [0, 250, 0], n, {
      function: 'Yanma basıncını karşılayıp kuvveti piston pimi üzerinden biyele aktarır.',
      material: 'Alüminyum-silisyum döküm/dövme alaşım',
      notes:
        'Isıl genleşme toleransı: tepe bölgesi en sıcak yer olduğu için en çok genleşir; bu yüzden tepe çapı eteğe göre ~0.3 mm, segman arazileri ~0.15 mm küçük işlenir ve piston çalışma sıcaklığında silindire tam oturur. Segmanlar üç iş yapar: (1) kompresyon segmanı yanma gazını sızdırmaz tutar, (2) ikinci segman kaçağı yakalar ve yağı aşağı sıyırır, (3) yağ segmanı silindir duvarındaki yağ filmini ince tutar. Kubbeli tepedeki cepler supaplara boşluk bırakır.',
    }),
  pistonPin: (n: number) =>
    def(`piston-pin-${n}`, `Piston pimi (${ordinal(n)} silindir)`, 'rods-pistons', [0, 250, 110], n, {
      function: 'Pistonu biyelin küçük ucuna bağlar; biyel bu pim etrafında salınır.',
      material: 'Sementasyon çeliği, taşlanmış',
      notes: 'İçi boştur: eğilme rijitliğini korurken ileri-geri giden kütleyi azaltır.',
    }),
  rings: (n: number) =>
    def(`rings-${n}`, `Segmanlar (${ordinal(n)} silindir)`, 'rods-pistons', [0, 335, 0], n, {
      function: 'Yanma odasını sızdırmaz tutar (kompresyon segmanları) ve silindir duvarındaki fazla yağı sıyırır (yağ segmanı).',
      material: 'Nitrürlenmiş çelik / dökme demir, krom kaplı',
      notes: 'Segman ağızları birbirine göre kaydırılarak yerleştirilir ki gazlar düz bir kaçak yolu bulamasın.',
    }),
  rod: (n: number) =>
    def(`rod-${n}`, `Biyel (${ordinal(n)} silindir)`, 'rods-pistons', [0, 190, 0], n, {
      function: 'Pistonun ileri-geri hareketini krank muylusunun dönme hareketine bağlar.',
      material: 'Dövme çelik',
      notes:
        'I-kesit neden? Biyel gövdesi yanmada basma (burkulma), eylemsizlikte çekme yükü taşır. I profili malzemeyi neutral eksenden uzağa koyarak aynı kütleyle en yüksek eğilme atalet momentini verir; ince gövde ağırlığı düşürür, ileri-geri giden kütle azalır. Merkezden merkeze 133 mm; λ = r/l ≈ 0.295: uzun biyel yanal piston kuvvetini (yan itme) azaltır.',
    }),
  rodCap: (n: number) =>
    def(`rod-cap-${n}`, `Biyel kapağı (${ordinal(n)} silindir)`, 'rods-pistons', [0, -170, 0], n, {
      function: 'Biyelin büyük ucunu krank muylusu etrafında kapatır.',
      material: 'Dövme çelik, cıvatalarla biyele bağlı',
      notes: 'Kapak ve biyel birlikte işlenir; birbirleriyle değiştirilemezler.',
    }),
} as const;
