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
  // ------------------------------------------------------------ top end (phase 2)
  cylinderHead: def('cylinder-head', 'Silindir kapağı', 'cylinder-head', [0, 420, 0], 0, {
    function:
      'Yanma odalarını kapatır; emme ve egzoz kanallarını, supap yuvalarını, supap kılavuzlarını, eksantrik yataklarını ve buji yuvalarını taşır.',
    material: 'Alüminyum döküm (AlSi7Mg), sertleştirilmiş supap yuvaları, bronz kılavuzlar',
    notes:
      'Çatı (pent-roof) biçimli yanma odası: iki eğik düzlem 42° açıyla buluşur ve supaplar bu düzlemlere dik durur. Buji ortadadır; alev cephesi her yöne kısa yoldan yayılır. Odanın kenarındaki düz bant (squish) sıkıştırma sonunda karışımı merkeze iterek türbülans yaratır.',
  }),
  headGasket: def('head-gasket', 'Silindir kapak contası', 'cylinder-head', [0, 300, 0], 1, {
    function: 'Blok ile kapak arasını yanma gazına, soğutma suyuna ve yağa karşı sızdırmaz yapar.',
    material: 'Çok katmanlı çelik (MLS), elastomer kaplı',
    notes:
      'Silindir ağızlarındaki kabartmalı halkalar (stopper) en yüksek yüzey basıncını yanma odası çevresine toplar. Sıkıştırılmış kalınlık (1 mm) sıkıştırma oranını doğrudan etkiler.',
  }),
  headBolts: def('head-bolts', 'Silindir kapak cıvataları', 'cylinder-head', [0, 520, 0], 2, {
    function: 'Kapağı contayla birlikte bloğa sıkıştırır; yanma basıncının kapağı kaldırmasına karşı koyar.',
    material: 'Yüksek mukavemetli çelik (10.9), akma sınırında sıkılan (torque-to-yield)',
    notes:
      'On cıvata, silindirler arasında, eksantriklerin altındadır: bu yüzden kapak ancak eksantrikler söküldükten sonra çıkarılabilir. Sıkma ortadan dışa doğru, spiral sırayla yapılır.',
  }),
  valveGuides: def('valve-guides', 'Supap kılavuzları ve yay tabanları', 'cylinder-head', [0, 420, 0], 3, {
    function: 'Supap sapını eksenel olarak yönlendirir ve supap tablasının ısısını kapağa iletir.',
    material: 'Sinterlenmiş bronz / dökme demir kılavuz, sertleştirilmiş çelik yay tabanı',
    notes: 'Kılavuzun üstündeki lastik keçe, supap sapından yanma odasına yağ sızmasını (yağ yakmayı) önler.',
  }),
  valves: (n: number, kind: 'intake' | 'exhaust') =>
    def(
      `valves-${kind}-${n}`,
      `${kind === 'intake' ? 'Emme' : 'Egzoz'} supapları (${ordinal(n)} silindir)`,
      'valvetrain',
      [0, 360, kind === 'intake' ? -40 : 40],
      n,
      kind === 'intake'
        ? {
            function: 'Emme zamanında açılıp hava-yakıt karışımını silindire alır; diğer zamanlarda yanma odasını kapatır.',
            material: 'Krom-silisyum çelik, sertleştirilmiş sap ucu, krom kaplı sap',
            notes:
              'Tabla çapı 30 mm, en büyük lift 9 mm. Lift / çap ≈ 0.3: bunun üstünde akış artık neredeyse artmaz. 45° oturma yüzeyi hem sızdırmazlığı hem de ısı geçişini sağlar.',
          }
        : {
            function: 'Egzoz zamanında açılıp yanmış gazları silindirden atar.',
            material: 'Isıya dayanıklı östenitik çelik (ör. 21-4N), Stellite kaplı oturma yüzeyi',
            notes:
              'Egzoz supabı emmeden küçüktür (26 mm): egzoz gazı silindirdeki yüksek basınçla zaten itilir. Tablası 700–800 °C’ye çıkar; ısının çoğunu oturma yüzeyinden kapağa verir.',
          },
    ),
  springs: (n: number, kind: 'intake' | 'exhaust') =>
    def(
      `springs-${kind}-${n}`,
      `${kind === 'intake' ? 'Emme' : 'Egzoz'} supap yayları (${ordinal(n)} silindir)`,
      'valvetrain',
      [0, 330, kind === 'intake' ? -40 : 40],
      n,
      {
        function: 'Supabı kapalı tutar ve yüksek devirde iticinin kam profilini izlemesini sağlar.',
        material: 'Krom-silisyum yay çeliği, bilyeli dövülmüş (shot-peened)',
        notes:
          'Uçlardaki kapalı, taşlanmış sarımlar sıkışmaz; yalnızca aktif sarımlar kısalır. Yay, kamın negatif ivmeli (burun) bölgesinde supabın atalet kuvvetini yenecek kadar sert olmalıdır, yoksa supap “uçar” (valve float).',
      },
    ),
  retainers: (n: number, kind: 'intake' | 'exhaust') =>
    def(
      `retainers-${kind}-${n}`,
      `${kind === 'intake' ? 'Emme' : 'Egzoz'} yay tablaları ve tırnaklar (${ordinal(n)} silindir)`,
      'valvetrain',
      [0, 380, kind === 'intake' ? -40 : 40],
      n,
      {
        function: 'Yay kuvvetini supap sapına aktarır; iki parçalı konik tırnaklar tablayı sapın kanalına kilitler.',
        material: 'Sertleştirilmiş çelik',
        notes: 'Tırnakların koniği, yay kuvveti arttıkça tırnakları sapa daha sıkı bastırır (kendinden kilitleme).',
      },
    ),
  buckets: (n: number, kind: 'intake' | 'exhaust') =>
    def(
      `buckets-${kind}-${n}`,
      `${kind === 'intake' ? 'Emme' : 'Egzoz'} kovan iticileri (${ordinal(n)} silindir)`,
      'valvetrain',
      [0, 400, kind === 'intake' ? -40 : 40],
      n,
      {
        function: 'Kam lobunun itmesini doğrudan supaba iletir; yan kuvvetleri kapaktaki deliğine aktarır, supap sapını korur.',
        material: 'Sementasyon çeliği, taşlanmış üst yüzey',
        notes:
          'Düz tabanlı itici: temas noktası kamın hızıyla (ds/dθ) orantılı olarak merkezden kayar. Bu yüzden itici çapı, en büyük kam hızını karşılayacak kadar büyük seçilir (burada en çok ≈ 13.9 mm kayma, Ø32.5 itici). Kam ile itici arasında 0.25 mm supap boşluğu vardır.',
      },
    ),
  camshaft: (kind: 'intake' | 'exhaust') =>
    def(`camshaft-${kind}`, `${kind === 'intake' ? 'Emme' : 'Egzoz'} eksantrik mili`, 'camshafts', [0, 300, kind === 'intake' ? -70 : 70], kind === 'intake' ? 0 : 1, {
      function: 'Lobları ile supapları doğru anda, doğru süre ve miktarda açar. Krankın yarı hızında döner.',
      material: 'Soğutulmuş dökme demir (chilled cast iron), indüksiyonla sertleştirilmiş loblar',
      notes:
        'Ateşleme sırası 1-3-4-2 olduğu için ardışık silindirlerin lobları 90° arayla dizilir. Lob profili harmonik bir ivme eğrisinden türetilir: rampa supap boşluğunu yavaşça kapatır, ardından supap 60° kam açısında 9 mm’ye ulaşır.',
    }),
  camCaps: (kind: 'intake' | 'exhaust') =>
    def(`cam-caps-${kind}`, `${kind === 'intake' ? 'Emme' : 'Egzoz'} eksantrik yatak kapakları`, 'camshafts', [0, 260, kind === 'intake' ? -50 : 50], 2, {
      function: 'Eksantrik milini kapaktaki yatak yuvalarına bağlar.',
      material: 'Alüminyum döküm (kapakla birlikte işlenir)',
      notes: 'Kapaklar yerinde işlendiği için numaralıdır ve yerleri değiştirilemez. Yağ filmi doğrudan alüminyum üzerinde çalışır (zarf yoktur).',
    }),
  crankSprocket: def('crank-sprocket', 'Krank zincir dişlisi', 'timing-drive', [-140, 0, 0], 0, {
    function: 'Zamanlama zincirini sürer; eksantrik dişlileriyle 1:2 oranındadır.',
    material: 'Sertleştirilmiş çelik',
    notes: '21 diş, 8 mm adım. Eksantrik dişlileri 42 diştir: krank iki tur atarken eksantrik bir tur atar.',
  }),
  camSprocket: (kind: 'intake' | 'exhaust') =>
    def(`cam-sprocket-${kind}`, `${kind === 'intake' ? 'Emme' : 'Egzoz'} eksantrik dişlisi`, 'timing-drive', [-140, 60, kind === 'intake' ? -30 : 30], 1, {
      function: 'Zincirden aldığı hareketi eksantrik miline iletir.',
      material: 'Sinterlenmiş çelik',
      notes: '42 diş: krank dişlisinin tam iki katı. Hafifletme delikleri dönen kütleyi ve atalet momentini azaltır.',
    }),
  timingChain: def('timing-chain', 'Zamanlama zinciri', 'timing-drive', [-180, 0, 0], 2, {
    function: 'Krank milinin dönüşünü eksantrik millerine kaymadan, sabit faz ilişkisiyle aktarır.',
    material: 'Alaşımlı çelik; sertleştirilmiş pimler ve makaralar',
    notes:
      '132 baklalı, 8 mm adımlı makaralı zincir. Çift sayıda bakla gerekir (iç ve dış baklalar sırayla dizilir). Dişli üzerindeki baklalar çokgen (poligon) oluşturur; bu “kordal etki” küçük hız dalgalanmalarına yol açar, az dişli küçük dişlilerde daha belirgindir.',
  }),
  chainGuides: def('chain-guides', 'Zincir kızakları ve gergi', 'timing-drive', [-160, 0, 0], 3, {
    function: 'Sabit kızak gergin tarafı yönlendirir; hidrolik gergi, mafsallı kızağı gevşek tarafa bastırarak zinciri gergin tutar.',
    material: 'Poliamid (PA46) kaplı alüminyum/çelik taşıyıcı; hidrolik gergi pistonu',
    notes:
      'Krank zinciri egzoz tarafından çeker: bu taraf gergindir. Emme tarafı gevşek kalır; gergi, aşınmayla uzayan zinciri motor yağı basıncıyla otomatik olarak telafi eder.',
  }),
  plugs: def('spark-plugs', 'Bujiler ve bobinler', 'plugs-injectors', [0, 320, 0], 0, {
    function: 'Sıkıştırma sonunda elektrotları arasında kıvılcım çakarak karışımı ateşler.',
    material: 'Alüminyum oksit seramik yalıtkan, nikel kaplı çelik gövde, nikel/iridyum elektrot',
    notes:
      'M14 diş, 19 mm diş boyu. Kalem tipi bobin (coil-on-plug) her bujiye ayrı yüksek gerilim (≈ 30 kV) üretir. Ateşleme avansı 15° ÜÖN öncesi: basınç tepesinin ÜÖN’den biraz sonra oluşması için yanma erken başlatılır.',
  }),
  injectors: def('injectors', 'Enjektörler ve yakıt rayı', 'plugs-injectors', [0, 200, -160], 1, {
    function: 'Yakıtı emme kanalına, emme supaplarının arkasına püskürtür (çok noktalı püskürtme).',
    material: 'Paslanmaz çelik iğne ve meme, cam elyaf takviyeli PA gövde, FKM o-ringler',
    notes: 'Supap tablasının sıcak arka yüzüne püskürtülen yakıt kolayca buharlaşır. Yakıt rayı ≈ 3–4 bar basınçla tüm enjektörleri besler.',
  }),
  valveCover: def('valve-cover', 'Supap kapağı', 'valve-cover', [0, 260, 0], 0, {
    function: 'Eksantrik ve supap mekanizmasını örter, yağın dışarı sızmasını ve kirin girmesini önler.',
    material: 'Alüminyum döküm, siyah krinkle (buruşuk) boya; lastik conta',
    notes: 'Buji kuyuları kapaktan geçer; bobinler kapağın üstünden takılır. Kapakta karter havalandırması ve yağ doldurma ağzı bulunur.',
  }),
} as const;
