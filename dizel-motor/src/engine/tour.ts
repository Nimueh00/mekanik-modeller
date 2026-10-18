import { type LearnContext, preset } from './learn';
import { SPECS } from './specs';
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
      `Karşınızda 1.8 litrelik, sıralı dört silindirli Common-Rail doğrudan püskürtmeli bir dizel motor var: çap ${SPECS.bore} mm, strok ${SPECS.stroke} mm, sıkıştırma oranı ${SPECS.compressionRatio} : 1. Silindir kapağında iki eksantrik mili (DOHC), silindir başına dört supap (16V), merkezî Common-Rail enjektörler ve kızdırma bujileri bulunur.`,
      `Her şey tek bir “motor saatinden” türetilir: krank açısı 0–720°. Dört zamanlı dizel motorda her silindir krankın iki turunda (720°) bir kez iş üretir; dört silindir olduğu için her 180°’de bir yanma gerçekleşir. Püskürtme ve yanma sırası ${SPECS.firingOrder.join('-')}.`,
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
      `Gövdeler yarı saydam. Piston silindirde aşağı yukarı gider; yüksek dizel yanma yüklerini karşılamak için kalınlaştırılmış dövme çelik I-biyel (l = ${SPECS.rodLength} mm) bu doğrusal hareketi krank miline iletir. Strok, krank yarıçapının iki katıdır: 2 × ${(SPECS.stroke / 2).toFixed(2)} = ${SPECS.stroke} mm (uzun stroklu / undersquare yapı).`,
      `Piston tepesinde yüksek sıkıştırma (${SPECS.compressionRatio} : 1) ve şiddetli hava girdabı (swirl) oluşturan Omega (ω) yanma çanağı (toroidal bowl) yer alır. Piston konumu tam krank-biyel denklemiyle hesaplanır: x = (r + l) − (r·cosθ + √(l² − r²·sin²θ)), l = ${SPECS.rodLength} mm. Biyel eğik durduğu için piston ÜÖN çevresinde AÖN çevresinden daha hızlıdır.`,
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
      'Kesit 1. silindirden alındı, zaman 1/50’ye yavaşladı. Gaz kelebeği yoktur; mavi parçacıklar silindire kısıntısız emilen saf havayı, turuncu-gri parçacıklar ise yanmış egzoz gazını gösterir.',
      `Çevrim açısı φ (0 = yanma ÜÖN’ü) ile: Genişleme/İş 0–180° (kendiliğinden tutuşan motorin pistonu iter) · Egzoz 180–360° (egzoz supapları açık, piston gazı dışarı süpürür) · Emme 360–540° (emme supapları açık, kelebeksiz saf hava dolar) · Sıkıştırma 540–720° (buji yoktur; saf hava ~40 bar basınca sıkıştırılır, ÜÖN’den 8° önce merkezî 7 delikli Common-Rail enjektörden ω çanağına püskürtülen yakıt 5° BTDC'de kendiliğinden tutuşur). Soğuk ilk çalıştırmada kızdırma bujileri yanma odasını akkor olarak ısıtır.`,
      `Sağdaki Çevrim göstergesi Sabathé dizel çevriminin P-V diyagramını canlı çizer. Döngünün çevrelediği alan bir çevrimde üretilen net iştir (bu modelde ≈ ${Math.round(CYCLE.work)} J; tepe basınç ≈ ${Math.round(CYCLE.peakPressure)} bar).`,
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
      `DOHC 16 supap düzeninde kam lobları kovan iticiler üzerinden supapları doğrudan iter, yaylar kapatır. Emme supapları ÜÖN’den 10° önce açılır, AÖN’den 50° sonra kapanır; egzoz supapları AÖN’den 50° önce açılır, ÜÖN’den 10° sonra kapanır. En büyük lift ${SPECS.valveTrain.maxLift} mm'dir.`,
      'Egzoz zamanının sonunda, ÜÖN çevresindeki 20°’lik binişmede (overlap) iki supap birden açıktır: dışarı akan egzozun süpürme etkisi (scavenging) silindire taze saf havanın dolmasına yardım eder.',
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
      'Turuncu: yağ devresi. Krankın çevirdiği pompa yağı karterden emer ve ana galeriye basar; galeriden krank ana yataklarına, biyel yataklarına, piston altı soğutma jetlerine ve silindir kapağındaki eksantrik yataklarına delikler gider. Basınçlı yağ filmi dizel motorun yüksek yanma yüklerini karşılar ve piston tepesini soğutur.',
      'Mavi: soğutma devresi. Su pompası soğutma sıvısını kapalı tavanlı (closed-deck) dökme demir bloktaki su ceketine basar; sıvı silindir kapağına çıkarak yanma odalarını, Common-Rail enjektör kuyularını ve kızdırma bujisi yuvalarını soğutup termostata gider.',
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
      'Motor gerçek söküm sırasıyla, dıştan içe açılıyor: supap kapağı → manifoldlar → Common-Rail yakıt rayı, enjektörler ve kızdırma bujileri → zincir kapağı → zincir ve dişliler → eksantrik milleri → supaplar → silindir kapağı → karter → pistonlar ve biyeller → ana yatak kapakları → krank mili → volan.',
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
