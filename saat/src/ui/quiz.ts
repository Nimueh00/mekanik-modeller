import type { CoachCard } from '../core/ui/coach';
import type { PartNode } from '../core/registry';
import { PARTS } from '../watch/catalog';
import { BEATS_PER_SECOND, DATE, MAINSPRING, MOTION_WORKS, MOVEMENT, TRAIN } from '../watch/specs';
import { REV_PER_HOUR } from '../watch/train';
import { RATCHET_PER_ROTOR_TURN } from '../watch/automatic';
import { WIND_TURNS_PER_SECOND } from '../watch/watchClock';
import { capture, type LearnEnv, type LearnSnapshot, restore, shuffled } from './learn';

/*
 * "Mini sınav": ten questions of three kinds, score shown throughout.
 *   part    — a part is named, the user clicks it in the (fully opened) model;
 *   number  — "how many …": the answer is computed from specs.ts and train.ts;
 *   concept — a multiple-choice question about how the watch works.
 * The question set is built by buildQuestions(), which is pure, so it can be
 * tested without a browser.
 */

/** Which side of the movement the question looks at (the parts fly out towards the viewer). */
export type QuizSide = 'back' | 'dial';

interface PartQ {
  name: string;
  /** Accepted part ids. */
  accept: readonly string[];
  side: QuizSide;
}

export const PART_QUESTIONS: readonly PartQ[] = [
  { name: 'Balans', accept: [PARTS.balance.id], side: 'back' },
  { name: 'Spiral yay', accept: [PARTS.hairspring.id], side: 'back' },
  { name: 'Çatal', accept: [PARTS.lever.id], side: 'back' },
  { name: 'Çıkış çarkı', accept: [PARTS.escapeWheel.id], side: 'back' },
  { name: 'Zemberek kutusu', accept: [PARTS.barrel.id, PARTS.barrelCover.id], side: 'back' },
  { name: 'Otomatik rotor', accept: [PARTS.rotor.id], side: 'back' },
  { name: 'Cırcır çarkı', accept: [PARTS.ratchetWheel.id], side: 'back' },
  { name: 'Taç çarkı', accept: [PARTS.crownWheel.id], side: 'back' },
  { name: 'Takım köprüsü', accept: [PARTS.trainBridge.id], side: 'back' },
  { name: 'Kurma kolu ve taç', accept: [PARTS.windingStem.id], side: 'back' },
  { name: 'Tarih halkası', accept: [PARTS.dateRing.id], side: 'dial' },
  { name: 'Yelkovan', accept: [PARTS.minuteHand.id], side: 'dial' },
  { name: 'Kadran', accept: [PARTS.dial.id], side: 'dial' },
];

interface NumberQ {
  id: string;
  text: string;
  unit: string;
  /** The right answer, computed from the specs. */
  answer: () => number;
  /** Plausible wrong answers (never equal to the answer; checked by tests). */
  wrong: readonly number[];
  why: string;
}

const turnsPerMinute = (body: keyof typeof REV_PER_HOUR) => Math.abs(REV_PER_HOUR[body]) / 60;

export const NUMBER_QUESTIONS: readonly NumberQ[] = [
  {
    id: 'beats-per-hour',
    text: 'Bu saatin balansı saatte kaç vuruş yapar?',
    unit: 'vuruş/saat',
    answer: () => BEATS_PER_SECOND * 3600,
    wrong: [18000, 28800, 36000],
    why: `Balans saniyede ${MOVEMENT.frequencyHz} tam salınım (${BEATS_PER_SECOND} vuruş) yapar: ${BEATS_PER_SECOND} × 3600 = ${BEATS_PER_SECOND * 3600}. Öteki seçenekler başka kalibrelerin frekanslarıdır.`,
  },
  {
    id: 'seconds-wheel-rpm',
    text: 'Saniye çarkı (dördüncü çark) dakikada kaç tur atar?',
    unit: 'tur/dk',
    answer: () => turnsPerMinute('fourth'),
    wrong: [2, 6, 12],
    why: `Merkez ${TRAIN.centre.wheel.teeth}/${TRAIN.third.pinion.teeth} × üçüncü ${TRAIN.third.wheel.teeth}/${TRAIN.fourth.pinion.teeth} = 60 kat hızlanır: saatte bir tur atan merkez çarkın 60 katı, dakikada bir tur.`,
  },
  {
    id: 'escape-rpm',
    text: 'Çıkış çarkı dakikada kaç tur atar?',
    unit: 'tur/dk',
    answer: () => turnsPerMinute('escape'),
    wrong: [1, 6, 30],
    why: `Dördüncü çark ${TRAIN.fourth.wheel.teeth} diş, çıkış pinyonu ${TRAIN.escape.pinion.teeth} yaprak: ${TRAIN.fourth.wheel.teeth / TRAIN.escape.pinion.teeth} kat hızlanır.`,
  },
  {
    id: 'barrel-hours',
    text: 'Zemberek kutusu kaç saatte bir tur atar?',
    unit: 'saat',
    answer: () => 1 / Math.abs(REV_PER_HOUR.barrel),
    wrong: [1, 8, 24],
    why: `Kutu ${TRAIN.barrel.wheel.teeth} diş, merkez pinyonu ${TRAIN.centre.pinion.teeth} yaprak: ${TRAIN.barrel.wheel.teeth / TRAIN.centre.pinion.teeth} : 1. Merkez çark saatte bir tur atar, kutu on kat yavaş döner.`,
  },
  {
    id: 'escape-teeth',
    text: 'Çıkış çarkının kaç dişi vardır?',
    unit: 'diş',
    answer: () => TRAIN.escape.wheel.teeth,
    wrong: [12, 20, 30],
    why: `${TRAIN.escape.wheel.teeth} diş, iki palet: tur başına ${2 * TRAIN.escape.wheel.teeth} vuruş. 30, bir turdaki vuruş sayısıdır, diş sayısı değil.`,
  },
  {
    id: 'reserve-hours',
    text: 'Tam kurulu saat yaklaşık kaç saat çalışır?',
    unit: 'saat',
    answer: () => Math.round(MAINSPRING.effectiveTurns / WIND_TURNS_PER_SECOND / 3600),
    wrong: [38, 48, 120],
    why: `${MAINSPRING.effectiveTurns} etkin tur × kutunun tur süresi (10 saat) = ${MAINSPRING.effectiveTurns * 10} saat.`,
  },
  {
    id: 'rotor-turns',
    text: 'Zemberekte 1 tur kurmak için rotorun yaklaşık kaç tur dönmesi gerekir?',
    unit: 'tur',
    answer: () => Math.round(1 / RATCHET_PER_ROTOR_TURN),
    wrong: [8, 24, 144],
    why: 'Rotor : cırcır = 14/21 · 8/48 · 8/64 = 1/72. Bu yüzden bilek hareketiyle kurmak yavaş, ama sürekli bir işlemdir.',
  },
  {
    id: 'hand-ratio',
    text: 'Yelkovan kaç tur attığında akrep 1 tur atar?',
    unit: 'tur',
    answer: () => (MOTION_WORKS.minuteWheel.teeth / MOTION_WORKS.cannonPinion.teeth) * (MOTION_WORKS.hourWheel.teeth / MOTION_WORKS.minutePinion.teeth),
    wrong: [4, 6, 24],
    why: `Akrep-yelkovan takımı: ${MOTION_WORKS.minuteWheel.teeth}/${MOTION_WORKS.cannonPinion.teeth} × ${MOTION_WORKS.hourWheel.teeth}/${MOTION_WORKS.minutePinion.teeth} = 3 × 4 = 12.`,
  },
  {
    id: 'date-teeth',
    text: 'Tarih halkasında kaç diş vardır?',
    unit: 'diş',
    answer: () => DATE.ringTeeth,
    wrong: [28, 30, 32],
    why: 'Halka ayın en uzun gününe, 31’e göre yapılır; 30 günlük aylarda tarih elle düzeltilir (konum 2).',
  },
];

interface ConceptQ {
  id: string;
  text: string;
  /** The first option is the right one (the options are shuffled when shown). */
  options: readonly string[];
  why: string;
}

export const CONCEPT_QUESTIONS: readonly ConceptQ[] = [
  {
    id: 'hack',
    text: 'Taç 3. konumdayken saniye ibresi neden durur?',
    options: [
      'Saniye durdurma kolu balansı tutar; balans durunca çıkış ve takım da durur',
      'Zemberek kutusu takımdan ayrılır',
      'Kanon pinyonu takımı keser',
      'Çıkış çarkı çatalı serbest bırakır',
    ],
    why: 'Taç çekilince ayar düzeni bir kol aracılığıyla balansın jantına bastırır. Balans durunca çatal çıkış çarkını kilitler ve tüm takım durur; böylece saati bir referans saate saniyesine kadar eşleyebilirsiniz.',
  },
  {
    id: 'click',
    text: 'Kurulan zemberek taç bırakılınca neden geri boşalmaz?',
    options: [
      'Tırnak cırcır çarkının dişlerine dayanır ve geri dönmesini engeller',
      'Zemberek kutusunun kapağı kilitlenir',
      'Kayar pinyon takıma kavrar',
      'Çatal çıkış çarkını tutar',
    ],
    why: 'Cırcır çarkı zemberek miline bağlıdır. Tırnak testere dişlerinin eğimli yüzünden kayarak atlar, dik yüze dayanınca tutar: mil yalnızca kurma yönünde dönebilir.',
  },
  {
    id: 'reverser',
    text: 'Rotor her iki yöne dönerken de neden zemberek kurulur?',
    options: [
      'İki yön değiştirici çarktan biri hep zembereği kurma yönünde sürer',
      'Rotor yalnızca bir yöne dönebilir',
      'Zemberek her iki yönde de kurulabilir',
      'Rotor ağırlığı taca bağlıdır',
    ],
    why: 'Rotor pinyonu birinci yön değiştiriciyi, o da ikinciyi çevirir: ikisi her zaman zıt yönde döner. Her çark pinyonunu yalnızca kurma yönünde sürer, öbürününki boşta kayar.',
  },
  {
    id: 'jumper',
    text: 'Tarih halkasını diş aralarında tutan ve her adımı tamamlayan parça hangisidir?',
    options: ['Atlama yayı', 'Tarih sürücü çarkı', 'Ayar kolu', 'Kanon pinyonu'],
    why: 'Sürücünün parmağı halkayı yalnızca yaklaşık %60 ilerletir; V uçlu atlama yayı halkayı bir sonraki dişin boşluğuna atlatır ve adımlar arasında yerinde tutar.',
  },
  {
    id: 'escapement',
    text: 'Çıkış mekanizmasının görevi nedir?',
    options: [
      'Takımın sürekli dönüşünü balansın vuruşlarına bölmek ve balansa itme vermek',
      'Zembereğin gücünü artırmak',
      'Tarihi ilerletmek',
      'İbreleri ayar sırasında takımdan ayırmak',
    ],
    why: 'Çıkış çarkı ve çatal, zemberek gücünü vuruş vuruş serbest bırakır (kilit) ve her vuruşta balansa küçük bir itme verir (impuls); böylece balans sönmeden salınır, takım da onun hızında döner.',
  },
  {
    id: 'amplitude',
    text: 'Zemberek gevşedikçe balansın genliği neden küçülür?',
    options: [
      'Takıma ve çıkışa gelen tork azalır, balansa verilen itme küçülür',
      'Spiral yay uzar',
      'Balans ağırlaşır',
      'Rotor frenler',
    ],
    why: 'Genlik, zemberek torkunun balansa verdiği enerjiyle sürtünme kaybı arasındaki dengeden çıkar. Bu modelde genlik tam kuruluyken ≈ 300°, rezerv bitmeye yakın ≈ 200°.',
  },
  {
    id: 'cannon',
    text: 'Taçla ibreler çevrilirken yürüyen takım neden zarar görmez?',
    options: [
      'Kanon pinyonu merkez milinde sürtünmeyle takılıdır ve kayar',
      'Takım ayar sırasında sökülür',
      'Zemberek kutusu serbest kalır',
      'Çıkış çarkı geri döner',
    ],
    why: 'Yelkovan ve akrep takımı kanon pinyonuna bağlıdır; o da merkez milinde yalnızca sürtünmeyle durur. Ayarda kayar, yürüyen takım olduğu gibi kalır.',
  },
];

export type Question =
  | { kind: 'part'; name: string; accept: readonly string[]; side: QuizSide }
  | { kind: 'number'; id: string; text: string; unit: string; answer: number; options: number[]; why: string }
  | { kind: 'concept'; id: string; text: string; correct: string; options: string[]; why: string };

/** Order of the kinds in a quiz: P N P C P N C P N C. */
const PATTERN = ['part', 'number', 'part', 'concept', 'part', 'number', 'concept', 'part', 'number', 'concept'] as const;

/** Ten questions, in the order above, drawn without repeats from the pools. */
export function buildQuestions(rnd: () => number = Math.random): Question[] {
  const parts = shuffled(PART_QUESTIONS, rnd);
  const numbers = shuffled(NUMBER_QUESTIONS, rnd);
  const concepts = shuffled(CONCEPT_QUESTIONS, rnd);
  return PATTERN.map((k): Question => {
    if (k === 'part') {
      const p = parts.shift()!;
      return { kind: 'part', name: p.name, accept: p.accept, side: p.side };
    }
    if (k === 'number') {
      const n = numbers.shift()!;
      const answer = n.answer();
      return { kind: 'number', id: n.id, text: n.text, unit: n.unit, answer, options: shuffled([answer, ...n.wrong], rnd), why: n.why };
    }
    const c = concepts.shift()!;
    return { kind: 'concept', id: c.id, text: c.text, correct: c.options[0]!, options: shuffled(c.options, rnd), why: c.why };
  });
}

/** 21600 → "21.600", 2.5 → "2,5" (the thousands dot and the decimal comma of the interface). */
export function formatCount(n: number): string {
  const [int, frac] = String(n).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac ? `${grouped},${frac}` : grouped;
}

export class Quiz {
  private questions: Question[] = [];
  private index = -1;
  private score = 0;
  private answered = false;
  private snap: LearnSnapshot | null = null;
  onEnd: () => void = () => {};

  constructor(
    private env: LearnEnv,
    private coach: CoachCard,
    private resolve: (id: string) => PartNode,
    private rnd: () => number = Math.random,
  ) {
    env.onSelect((id) => this.onSelect(id));
  }

  get active(): boolean {
    return this.index >= 0;
  }

  start(): void {
    if (this.index >= 0) return;
    this.snap = capture(this.env);
    this.questions = buildQuestions(this.rnd);
    this.score = 0;
    this.ask(0, null);
  }

  stop(): void {
    if (this.index < 0) return;
    this.index = -1;
    this.coach.hide();
    if (this.snap) restore(this.env, this.snap);
    this.snap = null;
    this.onEnd();
  }

  private header(): string {
    return `Mini sınav · Soru ${this.index + 1} / ${this.questions.length} · Skor ${this.score}`;
  }

  private ask(i: number, previous: Question | null): void {
    const env = this.env;
    this.index = i;
    this.answered = false;
    const q = this.questions[i]!;
    env.select(null);
    env.setLabels(false);
    if (q.kind === 'part') {
      // everything shown, fully opened, solid: the part has to be found by its looks
      for (const id of Object.keys(env.layers())) env.setLayer(id, true);
      env.setView('solid');
      env.openTo(1);
      env.setSpeed(1 / 10);
      if (!previous || previous.kind !== 'part' || previous.side !== q.side) env.goPreset(q.side === 'dial' ? 'dial' : 'back', 1.6);
    }
    this.render();
  }

  private render(feedback?: { text: string; tone: 'good' | 'bad' | 'info' }, picked?: string | number): void {
    const q = this.questions[this.index]!;
    const last = this.index === this.questions.length - 1;
    const next = {
      label: last ? 'Sonucu gör' : 'Sonraki soru ▸',
      primary: true,
      disabled: !this.answered,
      onClick: () => (last ? this.finish() : this.ask(this.index + 1, q)),
    };
    const close = { label: 'Bitir', quiet: true, onClick: () => this.stop() };
    const progress = { total: this.questions.length, current: this.index };
    if (q.kind === 'part') {
      this.coach.show({
        kicker: this.header(),
        title: `Modelde bulun: ${q.name}`,
        body: [
          `Mekanizma tamamen açıldı ve etiketler gizlendi. Parçayı ${q.side === 'dial' ? 'kadran tarafında' : 'arka tarafta'} bulup üzerine tıklayın (döndürmek için sürükleyin, yaklaşmak için tekerlek).`,
        ],
        feedback,
        progress,
        actions: [close, next],
      });
      return;
    }
    if (q.kind === 'number') {
      this.coach.show({
        kicker: this.header(),
        title: q.text,
        body: [],
        choices: q.options.map((o) => ({
          label: `${formatCount(o)} ${q.unit}`,
          state: !this.answered ? undefined : o === q.answer ? 'correct' : o === picked ? 'wrong' : 'dim',
          onClick: this.answered ? undefined : () => this.answerNumber(o),
        })),
        feedback,
        progress,
        actions: [close, next],
      });
      return;
    }
    this.coach.show({
      kicker: this.header(),
      title: q.text,
      body: [],
      choices: q.options.map((o) => ({
        label: o,
        state: !this.answered ? undefined : o === q.correct ? 'correct' : o === picked ? 'wrong' : 'dim',
        onClick: this.answered ? undefined : () => this.answerConcept(o),
      })),
      feedback,
      progress,
      actions: [close, next],
    });
  }

  private onSelect(id: string | null): void {
    if (this.index < 0 || this.answered || !id) return;
    const q = this.questions[this.index];
    if (!q || q.kind !== 'part') return;
    this.answered = true;
    const picked = this.resolve(id);
    if (q.accept.includes(id)) {
      this.score++;
      this.render({ text: `Doğru! ${picked.def.nameTr}: ${picked.def.info.function}`, tone: 'good' });
      return;
    }
    // show the right one: select (highlight) the first accepted part
    const right = this.resolve(q.accept[0]!);
    this.env.select(right.def.id);
    this.render({ text: `Tıkladığınız: ${picked.def.nameTr}. Doğrusu altın renkle vurgulandı: ${right.def.nameTr}.`, tone: 'bad' });
  }

  private answerNumber(o: number): void {
    const q = this.questions[this.index]!;
    if (q.kind !== 'number') return;
    this.answered = true;
    const ok = o === q.answer;
    if (ok) this.score++;
    this.render({ text: `${ok ? 'Doğru!' : `Yanlış — doğrusu ${formatCount(q.answer)} ${q.unit}.`} ${q.why}`, tone: ok ? 'good' : 'bad' }, o);
  }

  private answerConcept(o: string): void {
    const q = this.questions[this.index]!;
    if (q.kind !== 'concept') return;
    this.answered = true;
    const ok = o === q.correct;
    if (ok) this.score++;
    this.render({ text: `${ok ? 'Doğru!' : 'Yanlış.'} ${q.why}`, tone: ok ? 'good' : 'bad' }, o);
  }

  private finish(): void {
    const n = this.questions.length;
    const pct = this.score / n;
    const verdict =
      pct >= 0.9
        ? 'Mükemmel — mekanizmayı avucunuzun içi gibi biliyorsunuz.'
        : pct >= 0.6
          ? 'İyi iş! Kaçırdıklarınıza öğrenme turunda göz atabilirsiniz.'
          : 'Öğrenme turu ile başlayıp tekrar denemeye ne dersiniz?';
    this.coach.show({
      kicker: 'Mini sınav · Sonuç',
      title: `Skor: ${this.score} / ${n}`,
      body: [verdict],
      actions: [
        { label: 'Kapat', quiet: true, onClick: () => this.stop() },
        { label: 'Tekrar başlat', primary: true, onClick: () => this.restart() },
      ],
    });
    this.index = n; // still "active" until closed; no question pending
    this.answered = true;
  }

  private restart(): void {
    // keep the snapshot taken at the very start: it is the state the user gave us
    this.index = -1;
    this.questions = buildQuestions(this.rnd);
    this.score = 0;
    this.ask(0, null);
  }
}
