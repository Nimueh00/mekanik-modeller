import { type LearnContext, preset } from './learn';
import { CYCLE } from './thermo';

interface TourStep {
  title: string;
  body: string[];
  enter(ctx: LearnContext): void;
}

/** Common starting point of a step: nothing selected, the circuits hidden, the cut on cylinder 1. */
function reset(ctx: LearnContext, opts: { open?: number } = {}): void {
  ctx.selection.select(null);
  ctx.circuits.setVisible(false);
  ctx.disassembly.animateTo(opts.open ?? 0);
}

const STEPS: TourStep[] = [
  {
    title: 'Genel bakış',
    body: [
      'Karşınızda 1.6 litrelik, sıralı dört silindirli bir benzinli motor var: çap 80.5 mm, strok 78.5 mm, sıkıştırma oranı 10.5 : 1. Silindir kapağında iki eksantrik mili (DOHC) ve silindir başına dört supap (16V) bulunur.',
      'Her şey tek bir “motor saatinden” türetilir: krank açısı 0–720°. Dört zamanlı motorda her silindir krankın iki turunda (720°) bir kez ateşlenir; dört silindir olduğu için her 180°’de bir ateşleme olur. Ateşleme sırası 1-3-4-2.',
      'Fareyle sürükleyerek döndürün, tekerlekle yaklaşın. Bir parçaya tıklarsanız sağ panelde ne işe yaradığı görünür.',
    ],
    enter(ctx) {
      reset(ctx);
      ctx.ui.setView('solid');
      ctx.ui.setSpeed('s10');
      ctx.labels.setEnabled(true);
      ctx.rig.go(preset(ctx, 'show'));
    },
  },
  {
    title: 'Krank – biyel – piston',
    body: [
      'Gövdeler yarı saydam. Piston silindirde aşağı yukarı gider; biyel bu doğrusal hareketi krank milinin dönme hareketine çevirir. Strok, krank yarıçapının iki katıdır: 2 × 39.25 = 78.5 mm.',
      'Piston konumu yaklaşık değil, tam krank-biyel denklemiyle hesaplanır: x = r·cosθ + √(l² − r²·sin²θ), l = 133 mm. Biyel eğik durduğu için piston ÜÖN (üst ölü nokta) çevresinde AÖN (alt ölü nokta) çevresinden daha hızlıdır; krank 90° döndüğünde piston strokun yarısından fazlasını inmiştir.',
      '1 ve 4 numaralı pistonlar birlikte, 2 ve 3 numaralılar onlardan 180° farkla hareket eder: krank muylularının açıları 0° ve 180°’dir.',
    ],
    enter(ctx) {
      reset(ctx);
      ctx.ui.setView('ghost');
      ctx.ui.setSpeed('s10');
      ctx.rig.go({ id: 'tour-crank', label: '', position: [430, 120, 820], target: [-20, 70, 0] });
    },
  },
  {
    title: 'Dört zaman',
    body: [
      'Kesit 1. silindirden alındı, zaman 1/50’ye yavaşladı. Mavi parçacıklar taze hava-yakıt karışımı, turuncu-gri olanlar yanmış gazdır.',
      'Çevrim açısı φ (0 = ateşleme ÜÖN’ü) ile: Genişleme/İş 0–180° (yanan gaz pistonu iter) · Egzoz 180–360° (egzoz supabı açık, piston gazı dışarı süpürür) · Emme 360–540° (emme supabı açık, piston inerken karışım dolar) · Sıkıştırma 540–720° (supaplar kapalı; φ = 705°’de, yani ÜÖN’den 15° önce buji çakar).',
      `Sağdaki Çevrim göstergesi aynı silindirin P-V diyagramını canlı çizer. Döngünün çevrelediği alan, bir çevrimde gazın pistona verdiği net iştir (bu modelde ≈ ${Math.round(CYCLE.work)} J; tepe basınç ≈ ${Math.round(CYCLE.peakPressure)} bar).`,
    ],
    enter(ctx) {
      reset(ctx);
      ctx.focus.set(0);
      ctx.cutaway.setMode('transverse');
      ctx.ui.syncCut();
      ctx.ui.setSpeed('s50');
      ctx.rig.go(preset(ctx, 'section')); // switches the view to the cut
      ctx.panel.find('Çevrim göstergesi')?.scrollIntoView();
    },
  },
  {
    title: 'Supap mekanizması ve zamanlama',
    body: [
      'Krank milinin ucundaki 21 dişli dişli zinciri çevirir; eksantrik dişlileri 42 dişlidir. Bu yüzden eksantrik milleri krankın tam yarı hızında döner (1 : 2): her supap 720°’de bir kez açılır.',
      'Loblar kovan iticiler üzerinden supapları doğrudan iter, yaylar supapları kapatır. Emme supabı ÜÖN’den 10° önce açılır, AÖN’den 50° sonra kapanır; egzoz supabı AÖN’den 50° önce açılır, ÜÖN’den 10° sonra kapanır. En büyük lift 9 mm.',
      'Egzoz zamanının sonunda, ÜÖN çevresindeki 20°’lik binişmede (overlap) iki supap birden açıktır: dışarı akan egzozun ataleti taze karışımı içeri çekmeye yardım eder.',
    ],
    enter(ctx) {
      reset(ctx);
      ctx.ui.setView('ghost');
      ctx.ui.setSpeed('s10');
      ctx.rig.go(preset(ctx, 'chain'));
    },
  },
  {
    title: 'Yağlama ve soğutma',
    body: [
      'Turuncu: yağ devresi. Krankın çevirdiği pompa yağı karterden emer ve ana galeriye basar; galeriden her ana yatağa, yukarıda da eksantrik yataklarına delikler gider. Basınçlı yağ filmi yatakları metal-metal temastan korur, yağ sonra kartere geri süzülür.',
      'Mavi: soğutma devresi. Su pompası soğutma sıvısını silindirleri saran su ceketine basar; sıvı üst yüzeydeki deliklerden silindir kapağına çıkar, yanma odalarının çevresinden geçip termostat üzerinden radyatöre gider.',
      'Çizgiler şemadır; bloktaki su ceketi ise modelde gerçekten var (kesit görünümünde silindirleri saran boşluk).',
    ],
    enter(ctx) {
      reset(ctx);
      ctx.ui.setView('ghost');
      ctx.ui.setSpeed('s10');
      ctx.circuits.setVisible(true);
      ctx.rig.go(preset(ctx, 'show'));
    },
  },
  {
    title: 'Tam demontaj',
    body: [
      'Motor gerçek söküm sırasıyla, dıştan içe açılıyor: supap kapağı → manifoldlar → bujiler ve enjektörler → zincir kapağı → zincir ve dişliler → eksantrik milleri → supaplar → silindir kapağı → karter → pistonlar ve biyeller → ana yatak kapakları → krank mili → volan.',
      'Parçalar ayrılırken de çalışmaya devam eder: kinematik, demontajdan bağımsızdır. Bir parçaya ya da etiketine tıklayıp bilgisini okuyun; sağdaki “İçini aç” kaydırıcısıyla kendiniz de açıp kapatabilirsiniz.',
    ],
    enter(ctx) {
      reset(ctx, { open: 1 });
      ctx.ui.setView('solid');
      ctx.ui.setSpeed('s10');
      ctx.labels.setEnabled(true);
      ctx.rig.go(preset(ctx, 'show'), 2.2);
    },
  },
];

/** "Turu başlat": a six-step guided tour that drives the camera, the cut, the speed and the teardown. */
export class Tour {
  private index = -1;
  onEnd: () => void = () => {};

  constructor(private ctx: LearnContext) {}

  get active(): boolean {
    return this.index >= 0;
  }

  start(): void {
    this.go(0);
  }

  stop(): void {
    if (this.index < 0) return;
    this.index = -1;
    this.ctx.circuits.setVisible(false);
    this.ctx.coach.hide();
    this.onEnd();
  }

  private go(i: number): void {
    this.index = i;
    const step = STEPS[i]!;
    step.enter(this.ctx);
    const last = i === STEPS.length - 1;
    this.ctx.coach.show({
      kicker: `Öğrenme turu · ${i + 1} / ${STEPS.length}`,
      title: step.title,
      body: step.body,
      progress: { total: STEPS.length, current: i, onPick: (k) => this.go(k) },
      actions: [
        { label: 'Kapat', quiet: true, onClick: () => this.stop() },
        { label: '◂ Geri', disabled: i === 0, onClick: () => this.go(i - 1) },
        { label: last ? 'Turu bitir' : 'İleri ▸', primary: true, onClick: () => (last ? this.stop() : this.go(i + 1)) },
      ],
    });
  }
}
