import type { PartNode } from '../core/registry';
import { type LearnContext, preset, shuffled } from './learn';
import { SPECS } from './specs';
import { cycleAngle, FIRING_TDC, type Stroke, STROKE_TR, strokeOf } from './timing';

/*
 * "Mini sınav": ten questions of three kinds, score shown throughout.
 *   part   — a part is named, the user clicks it in the (fully opened) model;
 *   stroke — the clock is frozen, "which stroke is cylinder n in?";
 *   fact   — a multiple-choice question about how the engine works.
 * Labels are switched off and the cycle indicator is masked while a question
 * could be answered by reading them.
 */

interface PartQ {
  name: string;
  /** Accepted part ids. */
  match: RegExp;
}

const PART_QUESTIONS: PartQ[] = [
  { name: 'Piston', match: /^piston-\d$/ },
  { name: 'Biyel', match: /^rod-\d$/ },
  { name: 'Krank mili', match: /^crankshaft$/ },
  { name: 'Volan', match: /^(flywheel|ring-gear)$/ },
  { name: 'Eksantrik mili', match: /^camshaft-/ },
  { name: 'Supap yayı', match: /^springs-/ },
  { name: 'Kovan itici', match: /^buckets-/ },
  { name: 'Supap', match: /^valves-/ },
  { name: 'Buji', match: /^spark-plugs$/ },
  { name: 'Silindir kapağı', match: /^cylinder-head$/ },
  { name: 'Yağ karteri', match: /^oil-pan$/ },
  { name: 'Zamanlama zinciri', match: /^timing-chain$/ },
  { name: 'Ana yatak kapağı', match: /^main-cap-\d$/ },
  { name: 'Piston pimi', match: /^piston-pin-\d$/ },
  { name: 'Egzoz manifoldu', match: /^exhaust-manifold$/ },
  { name: 'Emme manifoldu', match: /^intake-manifold$/ },
  { name: 'Eksantrik dişlisi', match: /^cam-sprocket-/ },
  { name: 'Silindir kapak contası', match: /^head-gasket$/ },
  { name: 'Segmanlar', match: /^rings-\d$/ },
  { name: 'Biyel kapağı', match: /^rod-cap-\d$/ },
  { name: 'Enjektörler', match: /^injectors$/ },
  { name: 'Zincir kapağı', match: /^chain-cover$/ },
];

interface FactQ {
  q: string;
  options: string[]; // first is correct (shuffled when shown)
  why: string;
}

const FACT_QUESTIONS: FactQ[] = [
  {
    q: 'Eksantrik milleri krank miline göre hangi hızda döner?',
    options: ['Yarı hızında', 'Aynı hızda', 'İki katı hızında', 'Dörtte bir hızında'],
    why: 'Krank dişlisi 21, eksantrik dişlisi 42 diş (1 : 2). Her supap 720° krank açısında bir kez açılmalıdır.',
  },
  {
    q: 'Bu motorun ateşleme sırası hangisidir?',
    options: ['1-3-4-2', '1-2-3-4', '1-4-2-3', '1-2-4-3'],
    why: '1-3-4-2: ardışık ateşlemeler 180° arayla ve silindirler arasında dengeli dağılır; ateşleme sırasında ardışık silindirlerin eksantrik lobları 90° aralıklıdır.',
  },
  {
    q: 'Dört zamanlı bir motorda bir silindir kaç derece krank açısında bir ateşlenir?',
    options: ['720°', '360°', '180°', '540°'],
    why: 'Dört zaman (emme, sıkıştırma, iş, egzoz) iki krank turu sürer. Dört silindirle motor genelinde her 180°’de bir ateşleme olur.',
  },
  {
    q: 'Supap binişmesi (overlap) ne zaman olur?',
    options: ['Egzozun sonunda, ÜÖN çevresinde', 'Sıkıştırmanın sonunda', 'İş zamanının ortasında', 'Emmenin sonunda, AÖN’de'],
    why: 'Emme supabı ÜÖN’den 10° önce açılır, egzoz supabı ÜÖN’den 10° sonra kapanır: 20° boyunca ikisi birden açıktır.',
  },
  {
    q: 'Buji neden ÜÖN’den 15° önce çakar?',
    options: [
      'Yanma zaman aldığı için; basınç tepesi ÜÖN’den biraz sonra oluşsun diye',
      'Pistonu ÜÖN’de frenlemek için',
      'Egzoz supabı açılmadan gazı soğutmak için',
      'Emme supabını kapatmak için',
    ],
    why: 'Alev cephesinin odayı taraması birkaç milisaniye sürer. Bu modelde basınç tepesi ÜÖN’den ≈ 20° sonra oluşur — pistonu en verimli itebileceği an.',
  },
  {
    q: 'Sıkıştırma oranı 10.5 : 1 ne demektir?',
    options: [
      'Piston AÖN’deyken silindir hacmi, ÜÖN’dekinin 10.5 katıdır',
      'Silindir basıncı 10.5 bar’a çıkar',
      'Strok, çapın 10.5 katıdır',
      'Yakıt-hava oranı 1 : 10.5’tir',
    ],
    why: 'ε = (V_strok + V_yanma) / V_yanma. Bu motorda strok hacmi 399.5 cm³, yanma odası hacmi ≈ 42 cm³.',
  },
  {
    q: 'Biyel neden I-kesitlidir?',
    options: [
      'Aynı kütleyle en yüksek eğilme ve burkulma rijitliği için',
      'Yağın akması için kanal oluşturmak amacıyla',
      'Isıyı daha iyi iletmek için',
      'Dövme işlemini kolaylaştırmak için',
    ],
    why: 'I profili malzemeyi tarafsız eksenden uzağa koyar: ileri-geri giden kütle düşük kalırken burkulmaya karşı rijitlik yüksek olur.',
  },
];

type Question =
  | { kind: 'part'; part: PartQ }
  | { kind: 'stroke'; cylinder: number; angle: number }
  | { kind: 'fact'; fact: FactQ; options: string[] };

const STROKE_ORDER: Stroke[] = ['intake', 'compression', 'power', 'exhaust'];
const N_PART = 5;
const N_STROKE = 3;
const N_FACT = 2;
/** Masked while a stroke question is open (it would show the answer). */
const MASKED = ['Çevrim göstergesi'];

export class Quiz {
  private questions: Question[] = [];
  private index = -1;
  private score = 0;
  private answered = false;
  private labelsWereOn = true;
  onEnd: () => void = () => {};

  constructor(private ctx: LearnContext) {
    ctx.selection.onChange((p) => this.onPick(p));
  }

  get active(): boolean {
    return this.index >= 0;
  }

  start(): void {
    const parts = shuffled(PART_QUESTIONS).slice(0, N_PART);
    const facts = shuffled(FACT_QUESTIONS).slice(0, N_FACT);
    const strokes = Array.from({ length: N_STROKE }, () => this.randomStroke());
    // interleave: P S P F P S P F P S
    const pattern = ['part', 'stroke', 'part', 'fact', 'part', 'stroke', 'part', 'fact', 'part', 'stroke'];
    this.questions = pattern.map((k) => {
      if (k === 'part') return { kind: 'part', part: parts.shift()! };
      if (k === 'stroke') return strokes.shift()!;
      const fact = facts.shift()!;
      return { kind: 'fact', fact, options: shuffled(fact.options) };
    });
    this.score = 0;
    this.labelsWereOn = this.ctx.labels.enabled;
    this.ask(0);
  }

  stop(): void {
    if (this.index < 0) return;
    this.index = -1;
    this.mask(false);
    this.ctx.labels.setEnabled(this.labelsWereOn);
    this.ctx.coach.hide();
    this.onEnd();
  }

  /** A frozen clock angle at least 10° away from any stroke boundary of the asked cylinder. */
  private randomStroke(): Question {
    const cylinder = Math.floor(Math.random() * SPECS.cylinders);
    let angle = 0;
    do angle = Math.round(Math.random() * 719);
    while (cycleAngle(cylinder, angle) % 180 < 10 || cycleAngle(cylinder, angle) % 180 > 170);
    return { kind: 'stroke', cylinder, angle };
  }

  private mask(on: boolean): void {
    for (const t of MASKED) this.ctx.panel.find(t)?.el.classList.toggle('is-masked', on);
  }

  private header(): string {
    return `Mini sınav · Soru ${this.index + 1} / ${this.questions.length} · Skor ${this.score}`;
  }

  private ask(i: number): void {
    const ctx = this.ctx;
    this.index = i;
    this.answered = false;
    const q = this.questions[i]!;
    ctx.selection.select(null);
    this.mask(q.kind === 'stroke');
    ctx.labels.setEnabled(false);
    if (q.kind === 'part') {
      ctx.disassembly.animateTo(1);
      ctx.ui.setView('solid');
      ctx.ui.setSpeed('s10');
      if (i === 0 || this.questions[i - 1]!.kind !== 'part') ctx.rig.go(preset(ctx, 'show'));
    } else if (q.kind === 'stroke') {
      ctx.disassembly.animateTo(0);
      ctx.ui.setSpeed('pause');
      ctx.clock.crankAngle = q.angle;
      ctx.focus.set(q.cylinder);
      ctx.cutaway.setMode('longitudinal');
      ctx.ui.syncCut();
      ctx.ui.setView('section');
      // all four bores in the longitudinal cut, framed to the right of the question card
      const dx = window.innerWidth < 760 ? 0 : -170; // phones: the card is below, not beside the model
      ctx.rig.go({ id: 'quiz-cut', label: '', position: [dx, 260, 1180], target: [dx, 150, 0] });
    }
    this.render();
  }

  private render(feedback?: { text: string; tone: 'good' | 'bad' | 'info' }, picked?: string): void {
    const q = this.questions[this.index]!;
    const last = this.index === this.questions.length - 1;
    const next = { label: last ? 'Sonucu gör' : 'Sonraki soru ▸', primary: true, disabled: !this.answered, onClick: () => (last ? this.finish() : this.ask(this.index + 1)) };
    const close = { label: 'Bitir', quiet: true, onClick: () => this.stop() };
    const progress = { total: this.questions.length, current: this.index };
    if (q.kind === 'part') {
      this.ctx.coach.show({
        kicker: this.header(),
        title: `Modelde bulun: ${q.part.name}`,
        body: ['Motor tamamen açıldı ve etiketler gizlendi. Parçayı modelde bulup üzerine tıklayın (döndürmek için sürükleyin, yaklaşmak için tekerlek).'],
        feedback,
        progress,
        actions: [close, next],
      });
      return;
    }
    if (q.kind === 'stroke') {
      const strokeNow = strokeOf(q.cylinder, this.ctx.clock.crankAngle);
      this.ctx.coach.show({
        kicker: this.header(),
        title: `${q.cylinder + 1}. silindir şu an hangi zamanda?`,
        body: [
          `Motor saati ${q.angle}° (0° = 1. silindirin ateşleme ÜÖN’ü) ve durduruldu. Boyuna kesitte pistonlara ve supaplara bakın; ateşleme sırası 1-3-4-2.`,
        ],
        choices: STROKE_ORDER.map((s) => ({
          label: STROKE_TR[s],
          state: !this.answered ? undefined : s === strokeNow ? 'correct' : s === picked ? 'wrong' : 'dim',
          onClick: this.answered ? undefined : () => this.answerStroke(s),
        })),
        feedback,
        progress,
        actions: [close, next],
      });
      return;
    }
    const correct = q.fact.options[0]!;
    this.ctx.coach.show({
      kicker: this.header(),
      title: q.fact.q,
      body: [],
      choices: q.options.map((o) => ({
        label: o,
        state: !this.answered ? undefined : o === correct ? 'correct' : o === picked ? 'wrong' : 'dim',
        onClick: this.answered ? undefined : () => this.answerFact(o),
      })),
      feedback,
      progress,
      actions: [close, next],
    });
  }

  private onPick(p: PartNode | null): void {
    if (this.index < 0 || this.answered || !p) return;
    const q = this.questions[this.index]!;
    if (q.kind !== 'part') return;
    this.answered = true;
    if (q.part.match.test(p.def.id)) {
      this.score++;
      this.render({ text: `Doğru! ${p.def.nameTr}: ${p.def.info.function}`, tone: 'good' });
      return;
    }
    // show the right one: select (highlight) the first matching part
    const right = this.ctx.registry.all().find((n) => q.part.match.test(n.def.id));
    if (right) this.ctx.selection.select(right.def.id);
    this.render({
      text: `Tıkladığınız: ${p.def.nameTr}. Doğrusu altın renkle vurgulandı${right ? `: ${right.def.nameTr}` : ''}.`,
      tone: 'bad',
    });
  }

  private answerStroke(s: Stroke): void {
    const q = this.questions[this.index]!;
    if (q.kind !== 'stroke') return;
    this.answered = true;
    const phi = cycleAngle(q.cylinder, q.angle);
    const right = strokeOf(q.cylinder, q.angle);
    const ok = s === right;
    if (ok) this.score++;
    this.mask(false);
    this.render(
      {
        text: `${ok ? 'Doğru!' : `Yanlış — doğrusu ${STROKE_TR[right]}.`} ${q.cylinder + 1}. silindirin ateşleme ÜÖN’ü motor saatinde ${FIRING_TDC[q.cylinder]}°; çevrim açısı φ = ${q.angle} − ${FIRING_TDC[q.cylinder]} = ${Math.round(phi)}° (mod 720). 0–180 iş, 180–360 egzoz, 360–540 emme, 540–720 sıkıştırma.`,
        tone: ok ? 'good' : 'bad',
      },
      s,
    );
  }

  private answerFact(o: string): void {
    const q = this.questions[this.index]!;
    if (q.kind !== 'fact') return;
    this.answered = true;
    const ok = o === q.fact.options[0];
    if (ok) this.score++;
    this.render({ text: `${ok ? 'Doğru!' : 'Yanlış.'} ${q.fact.why}`, tone: ok ? 'good' : 'bad' }, o);
  }

  private finish(): void {
    const n = this.questions.length;
    const pct = this.score / n;
    const verdict = pct >= 0.9 ? 'Mükemmel — motoru avucunuzun içi gibi biliyorsunuz.' : pct >= 0.6 ? 'İyi iş! Kaçırdıklarınıza öğrenme turunda göz atabilirsiniz.' : 'Öğrenme turu ile başlayıp tekrar denemeye ne dersiniz?';
    this.mask(false);
    this.ctx.labels.setEnabled(this.labelsWereOn);
    this.ctx.coach.show({
      kicker: 'Mini sınav · Sonuç',
      title: `Skor: ${this.score} / ${n}`,
      body: [verdict],
      actions: [
        { label: 'Kapat', quiet: true, onClick: () => this.stop() },
        { label: 'Tekrar başlat', primary: true, onClick: () => this.start() },
      ],
    });
    this.index = n; // still "active" until closed; no question pending
    this.answered = true;
  }
}
