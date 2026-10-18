import type { CoachCard } from '../core/ui/coach';
import { LAYERS } from '../watch/catalog';
import { BEATS_PER_ESCAPE_TURN, BEATS_PER_SECOND, DATE, DATE_RING, ESCAPEMENT, MAINSPRING, MOTION_WORKS, TRAIN } from '../watch/specs';
import { REV_PER_HOUR } from '../watch/train';
import { WatchClock } from '../watch/watchClock';
import type { CrownPosition } from '../watch/pose';
import type { WatchView } from './ghost';
import { capture, type LearnEnv, type LearnSnapshot, restore } from './learn';

export interface TourStep {
  id: string;
  title: string;
  body: string[];
  /** Camera preset (views.VIEW_SPECS id). */
  camera: string;
  view: WatchView;
  /** One of TIME_SCALES. */
  speed: number;
  /** Disassembly amount 0–1. */
  open: number;
  /** Layers switched off for this step (everything else is shown). */
  hide?: readonly string[];
  /** Part highlighted during the step. */
  select?: string;
  crown?: CrownPosition;
  wrist?: boolean;
  /** Wind the spring down to at most this share of a full spring (so that winding shows). */
  reserveAtMost?: number;
  /** Run the step on a clock set to this moment before the date changes (seconds of the day). */
  demoTimeOfDay?: number;
  /** Camera travel time, seconds. */
  seconds?: number;
}

const fmt = (n: number) => n.toLocaleString('tr-TR');
const rpm = (body: keyof typeof REV_PER_HOUR) => Math.abs(REV_PER_HOUR[body]) / 60;

const BEATS_PER_HOUR = BEATS_PER_SECOND * 3600;
const RESERVE_HOURS = MAINSPRING.effectiveTurns * (1 / Math.abs(REV_PER_HOUR.barrel));
const TRAIN_RATIO = (TRAIN.centre.wheel.teeth / TRAIN.third.pinion.teeth) * (TRAIN.third.wheel.teeth / TRAIN.fourth.pinion.teeth);
const MOTION_RATIO =
  (MOTION_WORKS.minuteWheel.teeth / MOTION_WORKS.cannonPinion.teeth) * (MOTION_WORKS.hourWheel.teeth / MOTION_WORKS.minutePinion.teeth);
/** The date demonstration starts five minutes before the ring begins to step. */
const DATE_DEMO_START = DATE_RING.stepStart - 5 * 60;
const clock24 = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'overview',
    title: 'Genel bakış',
    body: [
      `Karşınızda Ø 25,6 mm çapında, güncel İsviçre otomatik kalibrelerinden esinli bir mekanizma var: saatte ${fmt(BEATS_PER_HOUR)} vuruş (3 Hz), yaklaşık ${Math.round(RESERVE_HOURS)} saat güç rezervi, merkez saniye, saat 3’te tarih ve çift yönlü kuran rotor.`,
      'Mekanizmanın arka tarafına bakıyorsunuz: üstte yarım ay biçimli otomatik rotor, altında köprüler var. Köprüler çarkları plakaya bağlar ve pivotlarını tutar; köprülerdeki kırmızı noktalar yakut yatak taşlarıdır.',
      'Fareyle sürükleyerek döndürün, tekerlekle yaklaşın. Bir parçaya ya da etiketine tıklarsanız panelde işlevi görünür.',
    ],
    camera: 'back',
    view: 'solid',
    speed: 1,
    open: 0,
  },
  {
    id: 'energy',
    title: 'Enerji: zemberek ve rotor',
    body: [
      `Enerji zemberek kutusunda depolanır. Zemberek ${MAINSPRING.effectiveTurns} etkin tur kurulur; kutu 10 saatte bir tur attığı için rezerv ${MAINSPRING.effectiveTurns} × 10 = ${Math.round(RESERVE_HOURS)} saattir. Rezerv başta yarıya indirildi; panelde “Güç rezervi” okumasını izleyin.`,
      'Bilek hareketi açık: rotor kolun hareketiyle sallanır. Rotorun pinyonu iki yön değiştirici çarka bağlıdır; rotor hangi yöne dönerse dönsün çarklardan biri zembereği hep kurma yönünde sürer. Dişliler rotoru 72 kat yavaşlatır (rotor : cırcır = 1/72): 72 rotor turu 1 zemberek turu kurar.',
      'Kurulan zemberek, zemberek milindeki cırcır çarkı ve tırnak sayesinde geri boşalmaz.',
    ],
    camera: 'back',
    view: 'solid',
    speed: 1,
    open: 0,
    wrist: true,
    reserveAtMost: 0.5,
    select: 'rotor',
  },
  {
    id: 'train',
    title: 'Dişli takımı',
    body: [
      `Gücün yolu: zemberek kutusu (${TRAIN.barrel.wheel.teeth} diş) → merkez çark → üçüncü çark → dördüncü çark → çıkış çarkı. Köprüler hayalet görünümde, rotor gizlendi; hız saniyede bir dakika.`,
      `Kutu merkez pinyonunu ${TRAIN.barrel.wheel.teeth}/${TRAIN.centre.pinion.teeth} oranında çevirir: kutu 10 saatte, merkez çark (yelkovan) saatte bir tur atar. Merkez ${TRAIN.centre.wheel.teeth}/${TRAIN.third.pinion.teeth} × üçüncü ${TRAIN.third.wheel.teeth}/${TRAIN.fourth.pinion.teeth} = ${TRAIN_RATIO}: dördüncü çark, yani saniye çarkı, dakikada bir tur atar (saniye ibresi onun miline takılıdır).`,
      `Dördüncü çark ${TRAIN.fourth.wheel.teeth}/${TRAIN.escape.pinion.teeth} = ${TRAIN.fourth.wheel.teeth / TRAIN.escape.pinion.teeth} oranında çıkış çarkını çevirir: çıkış çarkı dakikada ${rpm('escape')} tur atar.`,
    ],
    camera: 'train',
    view: 'ghost',
    speed: 60,
    open: 0,
    hide: ['rotor'],
  },
  {
    id: 'escapement',
    title: 'Çıkış mekanizması',
    body: [
      `Hız 1/50’ye indi. Çıkış çarkının ${TRAIN.escape.wheel.teeth} dişi sürekli dönmek ister; çatal ve balans onu vuruş vuruş serbest bırakır. Çarkın dişi çatalın yakut palet taşına dayanıp durur (kilit); balansın impuls taşı çatalın ağzına girip çatalı çevirir, öteki palet dişi bırakır ve çark yarım diş ilerler.`,
      'Dişin kaydığı yüzey palet taşına ve çatal aracılığıyla balansa itme verir (impuls); sonra çark yeniden kilitlenir. Kilit → impuls → kilit… Her vuruşta çark 12° döner.',
      `${TRAIN.escape.wheel.teeth} diş × 2 palet = ${BEATS_PER_ESCAPE_TURN} vuruş/tur; çıkış çarkı dakikada ${rpm('escape')} tur attığından ${rpm('escape') * BEATS_PER_ESCAPE_TURN} vuruş/dk = saniyede ${BEATS_PER_SECOND} vuruş = 3 Hz.`,
    ],
    camera: 'escapement',
    view: 'ghost',
    speed: 1 / 50,
    open: 0,
    hide: ['rotor'],
    select: 'lever',
  },
  {
    id: 'balance',
    title: 'Balans ve spiral yay',
    body: [
      'Zamanın kaynağı balanstır: balans ve spiral yay birlikte bir salınım sistemi oluşturur. Spiral yay balansı denge konumuna geri çeker; salınım süresini yayın sertliği ile balansın atalet momenti belirler. Bu yüzden yay, sıcaklıkla esnekliği çok az değişen bir alaşımdır.',
      `Balans saniyede 3 tam salınım yapar (6 vuruş). Genlik, balansın denge konumundan her iki yöne sapma açısıdır: bu modelde tam kuruluyken ≈ ${ESCAPEMENT.balance.amplitudeFullDeg}°, rezervin sonuna doğru ≈ ${ESCAPEMENT.balance.amplitudeEmptyDeg}°. Zemberek gevşedikçe tork düşer ve genlik küçülür; panelde “Balans genliği”ne bakın.`,
    ],
    camera: 'escapement',
    view: 'ghost',
    speed: 1 / 10,
    open: 0,
    hide: ['rotor'],
    select: 'hairspring',
  },
  {
    id: 'dial',
    title: 'Kadran tarafı: ibreler ve tarih',
    body: [
      `Kadran yarı saydam. Kanon pinyonu (${MOTION_WORKS.cannonPinion.teeth} diş) yelkovanı taşır; ara çark ${MOTION_WORKS.minuteWheel.teeth}/${MOTION_WORKS.cannonPinion.teeth} × akrep çarkı ${MOTION_WORKS.hourWheel.teeth}/${MOTION_WORKS.minutePinion.teeth} = ${MOTION_RATIO}:1 indirger. Yelkovan ${MOTION_RATIO} tur atarken akrep 1 tur atar.`,
      `Akrep çarkı tarih sürücüsünü ${DATE.driver.teeth}/${MOTION_WORKS.hourWheel.teeth} oranında çevirir: sürücü 24 saatte bir tur atar ve parmağı ${DATE.ringTeeth} dişli tarih halkasını bir diş ilerletir. İlerleme 22:00–24:00 arasında olur; atlama yayı adımı tamamlar.`,
      `Saat ${clock24(DATE_DEMO_START)}’e getirildi, hız 10 dk/s: yaklaşık 12 saniye içinde tarihin değiştiğini izleyin. Tur bitince saatiniz kaldığı yerden devam eder.`,
    ],
    camera: 'dial',
    view: 'ghost',
    speed: 600,
    open: 0,
    demoTimeOfDay: DATE_DEMO_START,
  },
  {
    id: 'keyless',
    title: 'Kurma-ayar ve demontaj',
    body: [
      'Taç üç konumda çalışır. 1: saat yönünde çevirince zemberek kurulur (ters yönde kayar, kurmaz). 2: tarih hızlıca ilerler (192° = 1 gün). 3: ibreler iki yönde çevrilir (1 taç turu = 50 dakika) ve saniye durdurma devreye girer: balans tutulur, saniye ibresi durur. Panelde “Kurma ve ayar” bölümünden deneyin; modeldeki tacı da sürükleyebilirsiniz.',
      `Şimdi mekanizma gerçek söküm sırasına göre açılıyor: ${LAYERS.map((l) => l.shortTr.toLocaleLowerCase('tr-TR')).join(' → ')}. Parçalar ayrılırken saat çalışmaya devam eder. Bir parçaya tıklayıp bilgisini okuyun ya da panelden “Mini sınav”ı başlatın.`,
    ],
    camera: 'back',
    view: 'solid',
    speed: 1,
    open: 1,
    crown: 1,
    seconds: 2.2,
  },
];

/**
 * Put the watch into the state of a step. `base` is what the user had before
 * the tour; `demo` is the demonstration clock currently in use (or null).
 * Returns the demonstration clock now in use.
 */
export function enterStep(env: LearnEnv, step: TourStep, base: LearnSnapshot, demo: WatchClock | null): WatchClock | null {
  env.select(null);
  // the date demonstration runs on a clock of its own, so the user's clock does not jump
  let own = demo;
  if (step.demoTimeOfDay !== undefined) {
    const day = Math.floor(base.clock.t / 86400) * 86400;
    own = new WatchClock({ t: day + step.demoTimeOfDay, timeScale: step.speed, windTurns: base.clock.windTurns });
    env.setClock(own);
  } else if (own && env.getClock() === own) {
    env.setClock(base.clock);
    own = null;
  }
  for (const id of Object.keys(env.layers())) env.setLayer(id, !step.hide?.includes(id));
  env.setView(step.view);
  env.setLabels(true);
  env.openTo(step.open);
  const clock = env.getClock();
  env.setSpeed(step.speed);
  clock.wrist.enabled = !!step.wrist;
  clock.setCrownPosition(step.crown ?? 1);
  if (step.reserveAtMost !== undefined) {
    const cap = step.reserveAtMost * MAINSPRING.effectiveTurns;
    if (clock.windTurns > cap) clock.wind(cap - clock.windTurns);
  }
  env.goPreset(step.camera, step.seconds);
  if (step.select) env.select(step.select);
  return own;
}

/** "Turu başlat": a guided tour that sets the camera, view, speed and teardown of every step and gives everything back at the end. */
export class Tour {
  private index = -1;
  private snap: LearnSnapshot | null = null;
  private demo: WatchClock | null = null;
  onEnd: () => void = () => {};

  constructor(
    private env: LearnEnv,
    private coach: CoachCard,
  ) {}

  get active(): boolean {
    return this.index >= 0;
  }

  start(): void {
    this.snap = capture(this.env);
    this.go(0);
  }

  stop(): void {
    if (this.index < 0 || !this.snap) return;
    this.index = -1;
    this.coach.hide();
    restore(this.env, this.snap, this.demo);
    this.snap = null;
    this.demo = null;
    this.onEnd();
  }

  private go(i: number): void {
    this.index = i;
    const step = TOUR_STEPS[i]!;
    this.demo = enterStep(this.env, step, this.snap!, this.demo);
    const last = i === TOUR_STEPS.length - 1;
    this.coach.show({
      kicker: `Öğrenme turu · ${i + 1} / ${TOUR_STEPS.length}`,
      title: step.title,
      body: step.body,
      progress: { total: TOUR_STEPS.length, current: i, onPick: (k) => this.go(k) },
      actions: [
        { label: 'Kapat', quiet: true, onClick: () => this.stop() },
        { label: '◂ Geri', disabled: i === 0, onClick: () => this.go(i - 1) },
        { label: last ? 'Turu bitir' : 'İleri ▸', primary: true, onClick: () => (last ? this.stop() : this.go(i + 1)) },
      ],
    });
  }
}
