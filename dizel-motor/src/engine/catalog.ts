import type { LayerDef, PartDef, PartInfo, Vec3 } from '../core/registry';
import { SPECS } from './specs';

/** Disassembly layers, outermost first. */
export const LAYERS = [
  { id: 'valve-cover', shortTr: 'Supap kapağı', nameTr: 'Supap kapağı', order: 1 },
  { id: 'intake-manifold', shortTr: 'Emme', nameTr: 'Emme manifoldu', order: 2 },
  { id: 'exhaust-manifold', shortTr: 'Egzoz', nameTr: 'Egzoz manifoldu', order: 3 },
  { id: 'plugs-injectors', shortTr: 'Enjektör/Isıtma', nameTr: 'Common-Rail enjektörler ve kızdırma bujileri', order: 4 },
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

/**
 * Valve-train explode: the pair moves out sideways, clear of the lifted head
 * (intake −Z, exhaust +Z), and each element is then slid `along` mm further
 * up its own (21° tilted) valve axis, so valve → spring → retainer → bucket
 * read as a coaxial stack, as in a workshop-manual exploded drawing.
 */
const VALVE_TILT = (SPECS.valveTrain.includedAngleDeg / 2) * (Math.PI / 180);
function valveStackOffset(kind: 'intake' | 'exhaust', along: number): Vec3 {
  const s = kind === 'intake' ? -1 : 1;
  return [0, 330 + along * Math.cos(VALVE_TILT), s * (240 + along * Math.sin(VALVE_TILT))];
}

/*
 * Explode offsets (mm, world axes: +X flywheel end, +Y up, +Z towards the viewer).
 * Directions follow the real teardown: pan down, pistons/rods up out of the
 * bores, rod and main caps down, crank down and forward (+Z) clear of the caps,
 * flywheel to the rear (+X), timing drive to the front (-X).
 * Top end: every layer that comes off earlier sits further out than the ones
 * under it (cover > cam caps > cams > buckets/springs/valves > bolts > head >
 * gasket > rings > pistons), so no part passes through another when fully
 * open. Manifolds move out sideways, the chain cover forwards.
 */
export const PARTS = {
  block: def('block', 'Motor bloğu', 'block', [0, 0, 0], 0, {
    function:
      `Silindirleri, krank yataklarını ve soğutma suyu ceketini taşıyan ana gövde. Yüksek sıkıştırma (${SPECS.compressionRatio}:1) ve dizel yanma basınçlarını (>70 bar) taşıyan kapalı tavanlı (closed-deck) rijit gövde.`,
    material: 'Gri / sfero dökme demir blok',
    notes:
      `Silindirler arası ${SPECS.cylinderSpacing} mm, çap ${SPECS.bore} mm: aralarında yalnızca ${(SPECS.cylinderSpacing - SPECS.bore).toFixed(1)} mm et kaldığı için gömlekler “siyam” (birleşik) yapıdadır. Kapalı tavanlı (closed-deck) dökme demir gövde yüksek sıkıştırma (${SPECS.compressionRatio}:1) ve 70 bar’ı aşan tepe yanma basınçlarını güvenle taşır.`,
  }),
  liner: (n: number) =>
    def(`liner-${n}`, `Silindir gömleği (${ordinal(n)} silindir)`, 'block', [0, 0, 0], n, {
      function: 'Pistonun ve segmanların kaydığı aşınmaya dayanıklı yüzey.',
      material: 'Gri dökme demir, honlanmış iç yüzey',
      notes: 'Honlama izleri (çapraz çizgiler) yağ filmini tutar. Döküm sırasında blok gövdesine entegre edilir.',
    }),
  mainCap: (n: number) =>
    def(`main-cap-${n}`, `Ana yatak kapağı (${ordinal(n)})`, 'main-caps', [0, -210, 0], n, {
      function: 'Krank milinin ana muylularını bloğa bağlayan, yatak zarflarının alt yarısını taşıyan kapak.',
      material: 'Sinterlenmiş çelik / sfero döküm',
      notes:
        'Kapaklar blokla birlikte işlenir (line-boring); bu yüzden yerleri ve yönleri karıştırılamaz. Cıvatalar akma sınırına yakın torklanır.',
    }),
  crankshaft: def('crankshaft', 'Krank mili', 'crankshaft', [-130, -170, 220], 0, {
    function: `${SPECS.stroke} mm uzun stroklu (undersquare) krank mili; pistonların doğrusal hareketini biyeller üzerinden dönme hareketine çevirir ve yüksek dizel torkunu volana iletir.`,
    material: 'Dövme çelik (ör. 42CrMo4), indüksiyonla sertleştirilmiş muylular',
    notes:
      `${SPECS.stroke} mm uzun stroklu (undersquare) krank mili. 5 ana muylu, 4 biyel muylusu: 1-4 muyluları 0°, 2-3 muyluları 180°. Bu düzende 1. derece (krank hızındaki) serbest kuvvetler ve momentler birbirini götürür; 2. derece (iki kat hızdaki) kuvvetler ise toplanır — sıralı dörtlünün bilinen dikey titreşimi budur. 8 karşı ağırlık dönen kütleleri dengeleyerek ana yatak yüklerini ve milin eğilmesini azaltır. Muylu köşelerindeki radüsler yüksek dizel tepe basınçlarında gerilme yığılmasını ve yorulma çatlağını önler.`,
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
    def(`piston-${n}`, `Piston (${ordinal(n)} silindir)`, 'rods-pistons', [0, 200, 0], n, {
      function: 'Yanma basıncını karşılayıp kuvveti piston pimi üzerinden biyele aktarır.',
      material: 'Omega (ω) yanma çanaklı (toroidal bowl) alüminyum-silisyum piston',
      notes:
        'Omega (ω) yanma çanaklı (toroidal bowl) alüminyum-silisyum piston. Sıkıştırma sonunda dış konik squish halkası havayı hızla merkezdeki ω çanağına iter; oluşan şiddetli girdap (swirl), merkezden püskürtülen yakıt jetleriyle havanın hızla karışmasını sağlar. Segmanlar üç iş yapar: (1) kompresyon segmanı yüksek yanma gazını sızdırmaz tutar, (2) ikinci segman kaçağı yakalar ve yağı aşağı sıyırır, (3) yağ segmanı silindir duvarındaki yağ filmini kontrol eder.',
    }),
  pistonPin: (n: number) =>
    def(`piston-pin-${n}`, `Piston pimi (${ordinal(n)} silindir)`, 'rods-pistons', [0, 200, 110], n, {
      function: 'Pistonu biyelin küçük ucuna bağlar; biyel bu pim etrafında salınır.',
      material: 'Sementasyon çeliği, taşlanmış',
      notes: 'İçi boştur: eğilme rijitliğini korurken ileri-geri giden kütleyi azaltır.',
    }),
  rings: (n: number) =>
    def(`rings-${n}`, `Segmanlar (${ordinal(n)} silindir)`, 'rods-pistons', [0, 260, 0], n, {
      function: 'Yanma odasını sızdırmaz tutar (kompresyon segmanları) ve silindir duvarındaki fazla yağı sıyırır (yağ segmanı).',
      material: 'Nitrürlenmiş çelik / dökme demir, krom kaplı',
      notes: 'Segman ağızları birbirine göre kaydırılarak yerleştirilir ki gazlar düz bir kaçak yolu bulamasın.',
    }),
  rod: (n: number) =>
    def(`rod-${n}`, `Biyel (${ordinal(n)} silindir)`, 'rods-pistons', [0, 140, 0], n, {
      function: 'Pistonun ileri-geri hareketini krank muylusunun dönme hareketine bağlar.',
      material: `Yüksek sıkıştırma/yanma yükleri için kalınlaştırılmış dövme çelik I-biyel (l = ${SPECS.rodLength} mm)`,
      notes:
        `Yüksek sıkıştırma ve yanma yükleri için kalınlaştırılmış dövme çelik I-biyel (l = ${SPECS.rodLength} mm). Biyel gövdesi yanmada basma (burkulma), eylemsizlikte çekme yükü taşır. I profili malzemeyi tarafsız eksenden uzağa koyarak aynı kütleyle en yüksek eğilme atalet momentini verir; ince gövde ağırlığı düşürür, ileri-geri giden kütle azalır. Merkezden merkeze ${SPECS.rodLength} mm; λ = r/l ≈ ${(SPECS.stroke / (2 * SPECS.rodLength)).toFixed(3)}: uzun stroklu dizelde optimize edilmiş biyel boyu yanal piston kuvvetini azaltır.`,
    }),
  rodCap: (n: number) =>
    def(`rod-cap-${n}`, `Biyel kapağı (${ordinal(n)} silindir)`, 'rods-pistons', [0, -170, 0], n, {
      function: 'Biyelin büyük ucunu krank muylusu etrafında kapatır.',
      material: 'Dövme çelik, cıvatalarla biyele bağlı',
      notes: 'Kapak ve biyel birlikte işlenir; birbirleriyle değiştirilemezler.',
    }),
  // ------------------------------------------------------------ top end
  cylinderHead: def('cylinder-head', 'Silindir kapağı', 'cylinder-head', [0, 310, 0], 0, {
    function:
      'Yanma odalarını kapatır; emme ve egzoz kanallarını, supap yuvalarını, supap kılavuzlarını, eksantrik yataklarını, enjektör ve kızdırma bujisi yuvalarını taşır.',
    material: 'Alüminyum döküm (AlSi7Mg), sertleştirilmiş supap yuvaları, bronz kılavuzlar',
    notes:
      'Merkezde dikey Common-Rail enjektör kuyuları ve emme tarafında yanma odasına açılı giren kızdırma bujisi yuvaları bulunan alüminyum döküm silindir kapağı. Düz alt yüzey dizelde yüksek sıkıştırma oranını (15.8:1) elde etmek için yanma odasını tamamen piston tepesindeki ω çanağına bırakır; 4 supap dikey eksene yakın açılandırılmış olup merkezdeki 7 delikli enjektör yakıtı doğrudan bu çanağa püskürtür.',
  }),
  headGasket: def('head-gasket', 'Silindir kapak contası', 'cylinder-head', [0, 280, 0], 1, {
    function: 'Blok ile kapak arasını yanma gazına, soğutma suyuna ve yağa karşı sızdırmaz yapar.',
    material: 'Çok katmanlı çelik (MLS), elastomer kaplı',
    notes:
      'Silindir ağızlarındaki kabartmalı halkalar (stopper) en yüksek yüzey basıncını yanma odası çevresine toplar. Sıkıştırılmış kalınlık (1 mm) sıkıştırma oranını doğrudan etkiler.',
  }),
  headBolts: def('head-bolts', 'Silindir kapak cıvataları', 'cylinder-head', [0, 420, 0], 2, {
    function: 'Kapağı contayla birlikte bloğa sıkıştırır; yanma basıncının kapağı kaldırmasına karşı koyar.',
    material: 'Yüksek mukavemetli çelik (10.9), akma sınırında sıkılan (torque-to-yield)',
    notes:
      'On cıvata, silindirler arasında, eksantriklerin altındadır: bu yüzden kapak ancak eksantrikler söküldükten sonra çıkarılabilir. Sıkma ortadan dışa doğru, spiral sırayla yapılır.',
  }),
  valveGuides: def('valve-guides', 'Supap kılavuzları ve yay tabanları', 'cylinder-head', [0, 310, 0], 3, {
    function: 'Supap sapını eksenel olarak yönlendirir ve supap tablasının ısısını kapağa iletir.',
    material: 'Sinterlenmiş bronz / dökme demir kılavuz, sertleştirilmiş çelik yay tabanı',
    notes: 'Kılavuzun üstündeki lastik keçe, supap sapından yanma odasına yağ sızmasını (yağ yakmayı) önler.',
  }),
  valves: (n: number, kind: 'intake' | 'exhaust') =>
    def(
      `valves-${kind}-${n}`,
      `${kind === 'intake' ? 'Emme' : 'Egzoz'} supapları (${ordinal(n)} silindir)`,
      'valvetrain',
      valveStackOffset(kind, 0),
      n,
      kind === 'intake'
        ? {
            function: 'Emme zamanında açılıp temiz havayı silindire alır; diğer zamanlarda yanma odasını kapatır.',
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
      valveStackOffset(kind, 55),
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
      valveStackOffset(kind, 100),
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
      valveStackOffset(kind, 140),
      n,
      {
        function: 'Kam lobunun itmesini doğrudan supaba iletir; yan kuvvetleri kapaktaki deliğine aktarır, supap sapını korur.',
        material: 'Sementasyon çeliği, taşlanmış üst yüzey',
        notes:
          'Düz tabanlı itici: temas noktası kamın hızıyla (ds/dθ) orantılı olarak merkezden kayar. Bu yüzden itici çapı, en büyük kam hızını karşılayacak kadar büyük seçilir (burada en çok ≈ 13.9 mm kayma, Ø32.5 itici). Kam ile itici arasında 0.25 mm supap boşluğu vardır.',
      },
    ),
  camshaft: (kind: 'intake' | 'exhaust') =>
    def(`camshaft-${kind}`, `${kind === 'intake' ? 'Emme' : 'Egzoz'} eksantrik mili`, 'camshafts', [0, 420, kind === 'intake' ? -40 : 40], kind === 'intake' ? 0 : 1, {
      function: 'Lobları ile supapları doğru anda, doğru süre ve miktarda açar. Krankın yarı hızında döner.',
      material: 'Soğutulmuş dökme demir (chilled cast iron), indüksiyonla sertleştirilmiş loblar',
      notes:
        'Ateşleme sırası 1-3-4-2 olduğu için ardışık silindirlerin lobları 90° arayla dizilir. Lob profili harmonik bir ivme eğrisinden türetilir: rampa supap boşluğunu yavaşça kapatır, ardından supap 60° kam açısında 9 mm’ye ulaşır.',
    }),
  camCaps: (kind: 'intake' | 'exhaust') =>
    def(`cam-caps-${kind}`, `${kind === 'intake' ? 'Emme' : 'Egzoz'} eksantrik yatak kapakları`, 'camshafts', [0, 490, kind === 'intake' ? -40 : 40], 2, {
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
  plugs: def('glow-plugs', 'Kızdırma bujileri', 'plugs-injectors', [0, 150, -180], 1, {
    function:
      'Yanma odasına uzanan akkor ısıtıcı kalem uçları, soğuk motor ilk çalıştırılırken odanın içini 850–1000 °C’ye ısıtarak sıkıştırılan havanın motorini kolayca tutuşturmasına yardım eder.',
    material: 'Seramik / metal akkor ısıtıcı kalem uç, nikel kaplı çelik gövde',
    notes:
      'Yanma odasına uzanan akkor ısıtıcı kalem uçları, soğuk motor ilk çalıştırılırken odanın içini 850–1000 °C’ye ısıtarak sıkıştırılan havanın motorini kolayca tutuşturmasına yardım eder. Emme tarafından açılı girerek sprey jetinin hemen kenarındaki bölgeyi ısıtır ve ilk marş anında beyaz dumanı ve sarsıntıyı önler.',
  }),
  injectors: def('injectors', 'Common-Rail enjektörler ve yakıt rayı', 'plugs-injectors', [0, 390, 0], 0, {
    function:
      'Yakıtı ortak rayda (Common-Rail) yüksek basınçta (1600–2000 bar) depolar ve sıkıştırma sonunda doğrudan pistonun ω çanağına 7 delikli memeden atomize olarak püskürtür.',
    material: 'Dövme çelik yakıt rayı, paslanmaz çelik yüksek basınç boruları, piezo / solenoid Common-Rail enjektörler',
    notes:
      'Yakıtı ortak rayda (Common-Rail) yüksek basınçta (1600–2000 bar) depolar ve sıkıştırma sonunda doğrudan pistonun ω çanağına 7 delikli memeden atomize olarak püskürtür. Çoklu püskürtme (pilot, ana, ardıl enjeksiyon) sayesinde dizel vuruntusu yumuşatılır ve kurum oluşumu en aza indirilir.',
  }),
  valveCover: def('valve-cover', 'Supap kapağı', 'valve-cover', [0, 540, 0], 0, {
    function: 'Eksantrik ve supap mekanizmasını örter, yağın dışarı sızmasını ve kirin girmesini önler.',
    material: 'Alüminyum döküm, siyah krinkle (buruşuk) boya; lastik conta',
    notes:
      'Enjektör kuyuları kapaktan geçer; ortak yakıt rayı ve yüksek basınç boruları kapağın üstünden bağlanır. Kapakta karter havalandırması ve yağ doldurma ağzı bulunur.',
  }),
  // ------------------------------------------------------------ manifolds, chain cover
  intakeManifold: def('intake-manifold', 'Emme manifoldu', 'intake-manifold', [0, 60, -260], 0, {
    function:
      'Gaz kelebeği yoktur! Dizel motor her devirde silindire kısıntısız tam hava alır; tork (yük) havayı kısarak değil, yalnızca püskürtülen yakıt miktarıyla (kalite kontrolü) ayarlanır.',
    material: 'Alüminyum döküm / cam elyaf takviyeli poliamid plenum ve rezonans emme kanalları',
    notes:
      'Gaz kelebeği yoktur! Dizel motor her devirde silindire kısıntısız tam hava alır; tork (yük) havayı kısarak değil, yalnızca püskürtülen yakıt miktarıyla (kalite kontrolü) ayarlanır. Kısma kayıpları olmadığı için dizel çevriminin kısmi yük verimi çok yüksektir. Emiş havası helezonik kanallardan geçerken silindire güçlü bir girdap (swirl) hareketi kazandırır.',
  }),
  exhaustManifold: def('exhaust-manifold', 'Egzoz manifoldu', 'exhaust-manifold', [0, -40, 240], 0, {
    function: 'Dört silindirin egzoz gazını toplayıp tek bir çıkışa (katalitik konvertöre) yönlendirir.',
    material: 'Sfero / silisyum-molibdenli dökme demir (ya da paslanmaz çelik boru), ısıya dayanıklı',
    notes:
      '4’ü 1’e (4-into-1) birleşim: ateşleme sırası 1-3-4-2 olduğu için birleşim noktasına her 180° krank açısında bir darbe gelir. Doğru boru boyunda, bir silindirin egzoz darbesinin arkasındaki düşük basınç dalgası binişme sırasında diğer silindirden yanmış gazı emer (scavenging). Çalışırken 800–900 °C’ye ısınır.',
  }),
  chainCover: def('chain-cover', 'Zincir kapağı', 'chain-cover', [-330, 0, 0], 0, {
    function: 'Zamanlama zincirini, dişlileri ve gergiyi örter; zinciri yağlayan yağı içeride tutar.',
    material: 'Alüminyum döküm (ya da sac/plastik), sıvı conta ile; krank ucunda keçe yuvası',
    notes: 'Zincir motor yağıyla yağlanır ve ömür boyu dayanacak şekilde tasarlanır; triger kayışından farklı olarak periyodik değişim gerektirmez (ama gergi ve kızaklar aşınabilir).',
  }),
} as const;
