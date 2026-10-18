import { describe, expect, it } from 'vitest';
import { PartRegistry } from '../src/core/registry';
import { buildQuestions, CONCEPT_QUESTIONS, formatCount, NUMBER_QUESTIONS, PART_QUESTIONS, type Question, Quiz } from '../src/ui/quiz';
import { LAYERS, PARTS } from '../src/watch/catalog';
import { BEATS_PER_ESCAPE_TURN, BEATS_PER_SECOND, DATE, MAINSPRING, MOTION_WORKS, MOVEMENT, TRAIN } from '../src/watch/specs';
import { BEATS_PER_HOUR, REV_PER_HOUR } from '../src/watch/train';
import { fakeCoach, fakeEnv, seeded } from './learnEnv';

const partIds = new Set<string>(Object.values(PARTS).map((p) => p.id));
const numberQ = (qs: Question[], id: string) => qs.find((q) => q.kind === 'number' && q.id === id);

describe('mini sınav: soru havuzu', () => {
  it('her seferinde 10 soru üretir: 4 parça, 3 sayı, 3 kavram, belirli sırayla', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const qs = buildQuestions(seeded(seed));
      expect(qs).toHaveLength(10);
      expect(qs.map((q) => q.kind)).toEqual(['part', 'number', 'part', 'concept', 'part', 'number', 'concept', 'part', 'number', 'concept']);
      expect(qs.filter((q) => q.kind === 'part')).toHaveLength(4);
      expect(qs.filter((q) => q.kind === 'number')).toHaveLength(3);
      expect(qs.filter((q) => q.kind === 'concept')).toHaveLength(3);
    }
  });

  it('bir sınavda soru tekrarlanmaz', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const qs = buildQuestions(seeded(seed));
      const keys = qs.map((q) => (q.kind === 'part' ? `p:${q.name}` : `${q.kind[0]}:${q.id}`));
      expect(new Set(keys).size).toBe(10);
    }
  });

  it('farklı tohumlar farklı soru kümeleri verir (havuz karıştırılıyor)', () => {
    const sets = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(buildQuestions(seeded(i + 1)).map((q) => (q.kind === 'part' ? q.name : q.text)))));
    expect(sets.size).toBeGreaterThan(10);
  });

  it('“parçayı bul” sorularının tüm kimlikleri katalogda var, taraf geçerli', () => {
    expect(PART_QUESTIONS.length).toBeGreaterThanOrEqual(8);
    for (const p of PART_QUESTIONS) {
      expect(p.name.length).toBeGreaterThan(2);
      expect(p.accept.length).toBeGreaterThan(0);
      for (const id of p.accept) expect(partIds, `${p.name}: ${id}`).toContain(id);
      expect(['back', 'dial']).toContain(p.side);
    }
    expect(new Set(PART_QUESTIONS.map((p) => p.name)).size).toBe(PART_QUESTIONS.length);
  });

  it('dikizlenen taraf, parçanın katmanıyla uyumlu (kadran tarafı katmanları kadran görünümünde sorulur)', () => {
    const dialSide = new Set(['hands', 'dial', 'date', 'motion-works', 'keyless-dial']);
    const all = Object.values(PARTS) as { id: string; group: string }[];
    for (const p of PART_QUESTIONS) {
      const group = all.find((x) => x.id === p.accept[0])!.group;
      expect(p.side, p.name).toBe(dialSide.has(group) ? 'dial' : 'back');
      expect(LAYERS.some((l) => l.id === group)).toBe(true);
    }
  });
});

describe('mini sınav: sayısal cevaplar özelliklerden türetiliyor', () => {
  const answers = Object.fromEntries(NUMBER_QUESTIONS.map((q) => [q.id, q.answer()]));

  it('saatte 21.600 vuruş; saniye çarkı dakikada 1 tur; çıkış çarkı dakikada 12 tur', () => {
    expect(answers['beats-per-hour']).toBe(21600);
    expect(answers['beats-per-hour']).toBe(BEATS_PER_HOUR); // the train's own demand agrees
    expect(answers['beats-per-hour']).toBe(MOVEMENT.frequencyHz * 2 * 3600);
    expect(answers['seconds-wheel-rpm']).toBe(1);
    expect(Math.abs(REV_PER_HOUR.fourth)).toBe(60);
    expect(answers['escape-rpm']).toBe(12);
    expect(answers['escape-rpm']! * BEATS_PER_ESCAPE_TURN).toBe(BEATS_PER_SECOND * 60);
  });

  it('kutu 10 saatte bir tur, 80 saat rezerv, 15 diş, 72 rotor turu, 12:1, 31 diş', () => {
    expect(answers['barrel-hours']).toBe(10);
    expect(answers['barrel-hours']).toBe(TRAIN.barrel.wheel.teeth / TRAIN.centre.pinion.teeth);
    expect(answers['reserve-hours']).toBe(80);
    expect(answers['reserve-hours']).toBe(MAINSPRING.effectiveTurns * answers['barrel-hours']!);
    expect(answers['escape-teeth']).toBe(15);
    expect(answers['rotor-turns']).toBe(72);
    expect(answers['hand-ratio']).toBe(12);
    expect(answers['hand-ratio']).toBe(Math.abs(REV_PER_HOUR.cannon / REV_PER_HOUR.hourWheel));
    expect(answers['hand-ratio']).toBe((MOTION_WORKS.minuteWheel.teeth / MOTION_WORKS.cannonPinion.teeth) * (MOTION_WORKS.hourWheel.teeth / MOTION_WORKS.minutePinion.teeth));
    expect(answers['date-teeth']).toBe(DATE.ringTeeth);
  });

  it('yanlış şıklar doğru cevabı içermez, hepsi farklı; üretilen sorularda 4 şık ve doğru cevap var', () => {
    for (const q of NUMBER_QUESTIONS) {
      expect(q.wrong, q.id).not.toContain(q.answer());
      expect(new Set(q.wrong).size, q.id).toBe(q.wrong.length);
      expect(q.wrong.length, q.id).toBe(3);
      expect(q.text.endsWith('?'), q.id).toBe(true);
      expect(q.why.length).toBeGreaterThan(20);
    }
    for (let seed = 1; seed <= 40; seed++) {
      for (const q of buildQuestions(seeded(seed))) {
        if (q.kind !== 'number') continue;
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options).toContain(q.answer);
        expect(q.answer).toBe(NUMBER_QUESTIONS.find((n) => n.id === q.id)!.answer());
      }
    }
  });

  it('üretilen soruda cevap, sorudaki kimlikle özelliklerden gelir (21.600 ve 1 tur/dk)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 80 && seen < 2; seed++) {
      const qs = buildQuestions(seeded(seed));
      const beats = numberQ(qs, 'beats-per-hour');
      const sec = numberQ(qs, 'seconds-wheel-rpm');
      if (beats?.kind === 'number') {
        expect(beats.answer).toBe(21600);
        seen++;
      }
      if (sec?.kind === 'number') {
        expect(sec.answer).toBe(1);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('formatCount: binlik noktası, ondalık virgülü', () => {
    expect(formatCount(21600)).toBe('21.600');
    expect(formatCount(36000)).toBe('36.000');
    expect(formatCount(1)).toBe('1');
    expect(formatCount(144)).toBe('144');
    expect(formatCount(2.5)).toBe('2,5');
    expect(formatCount(1234567)).toBe('1.234.567');
  });
});

describe('mini sınav: kavram soruları', () => {
  it('taç 3. konumda saniyenin neden durduğu sorusu var', () => {
    expect(CONCEPT_QUESTIONS.some((q) => q.text.includes('Taç 3. konumdayken saniye'))).toBe(true);
  });

  it('her soruda 4 farklı şık, açıklama var; ilk şık doğrudur ve gösterimde karıştırılır', () => {
    for (const q of CONCEPT_QUESTIONS) {
      expect(q.options, q.id).toHaveLength(4);
      expect(new Set(q.options).size, q.id).toBe(4);
      expect(q.why.length, q.id).toBeGreaterThan(40);
    }
    const positions = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      for (const q of buildQuestions(seeded(seed))) {
        if (q.kind !== 'concept') continue;
        expect(q.options).toContain(q.correct);
        expect(q.correct).toBe(CONCEPT_QUESTIONS.find((c) => c.id === q.id)!.options[0]);
        positions.add(q.options.indexOf(q.correct));
      }
    }
    expect(positions.size).toBe(4); // the right answer lands everywhere
  });
});

describe('mini sınav: akış, skor ve geri yükleme', () => {
  // a registry with the catalogue's definitions only (no meshes needed)
  const registry = new PartRegistry();
  registry.defineLayers(LAYERS);
  for (const def of Object.values(PARTS)) registry.add(def);
  const resolve = (id: string) => registry.get(id);

  function play(seed: number, answer: (q: Question, coach: ReturnType<typeof fakeCoach>, env: ReturnType<typeof fakeEnv>) => void) {
    const env = fakeEnv();
    const coach = fakeCoach();
    const quiz = new Quiz(env, coach.card, resolve, seeded(seed));
    const questions = buildQuestions(seeded(seed)); // the same draw the quiz makes
    quiz.start();
    questions.forEach((q, i) => {
      expect(coach.content.kicker).toContain(`Soru ${i + 1} / 10`);
      answer(q, coach, env);
      coach.press(i === 9 ? 'Sonucu gör' : 'Sonraki soru ▸');
    });
    return { env, coach, quiz, questions };
  }

  const right = (q: Question, coach: ReturnType<typeof fakeCoach>, env: ReturnType<typeof fakeEnv>) => {
    if (q.kind === 'part') env.select(q.accept[0]!);
    else if (q.kind === 'number') coach.choose(`${formatCount(q.answer)} ${q.kind === 'number' ? q.unit : ''}`);
    else coach.choose(q.correct);
  };
  const wrong = (q: Question, coach: ReturnType<typeof fakeCoach>, env: ReturnType<typeof fakeEnv>) => {
    if (q.kind === 'part') env.select(q.accept.includes('rotor') ? 'plate' : 'rotor');
    else if (q.kind === 'number') {
      const o = q.options.find((x) => x !== q.answer)!;
      coach.choose(`${formatCount(o)} ${q.unit}`);
    } else coach.choose(q.options.find((x) => x !== q.correct)!);
  };

  it('hepsi doğru: 10 / 10', () => {
    const { coach } = play(7, right);
    expect(coach.content.title).toBe('Skor: 10 / 10');
  });

  it('hepsi yanlış: 0 / 10', () => {
    const { coach } = play(7, wrong);
    expect(coach.content.title).toBe('Skor: 0 / 10');
  });

  it('karışık: skor doğru sayısı kadar; her cevaptan sonra başlıkta güncel skor', () => {
    let n = 0;
    const { coach } = play(11, (q, c, e) => {
      expect(c.content.kicker).toContain(`Skor ${(n + 1) >> 1}`);
      if (n++ % 2 === 0) right(q, c, e);
      else wrong(q, c, e);
    });
    expect(coach.content.title).toBe('Skor: 5 / 10');
  });

  it('bir soru yalnızca bir kez puanlanır; “sonraki” cevaplanmadan açılmaz', () => {
    const env = fakeEnv();
    const coach = fakeCoach();
    const quiz = new Quiz(env, coach.card, resolve, seeded(3));
    const questions = buildQuestions(seeded(3));
    quiz.start();
    expect(coach.content.actions.find((a) => a.label === 'Sonraki soru ▸')!.disabled).toBe(true);
    const q = questions[0]!;
    if (q.kind !== 'part') throw new Error('first question is a part question');
    env.select(q.accept[0]!);
    env.select(null);
    env.select(q.accept[0]!); // the same right part again
    expect(coach.content.feedback!.tone).toBe('good');
    coach.press('Sonraki soru ▸');
    expect(coach.content.kicker).toContain('Skor 1');
  });

  it('parça sorusunda mekanizma tam açılır, etiketler kapanır, kamera doğru yöne bakar', () => {
    const env = fakeEnv();
    const coach = fakeCoach();
    const quiz = new Quiz(env, coach.card, resolve, seeded(5));
    quiz.start();
    expect(env.state.openTarget).toBe(1);
    expect(env.state.labels).toBe(false);
    expect(env.state.view).toBe('solid');
    expect(Object.values(env.state.layers).every(Boolean)).toBe(true);
    const first = buildQuestions(seeded(5))[0]!;
    if (first.kind !== 'part') throw new Error('first question is a part question');
    expect(env.presets.at(-1)).toBe(first.side === 'dial' ? 'dial' : 'back');
  });

  it('yanlış parçaya tıklanınca doğrusu vurgulanır', () => {
    const env = fakeEnv();
    const coach = fakeCoach();
    const quiz = new Quiz(env, coach.card, resolve, seeded(5));
    quiz.start();
    const first = buildQuestions(seeded(5))[0]!;
    if (first.kind !== 'part') throw new Error('first question is a part question');
    env.select(first.accept.includes('plate') ? 'rotor' : 'plate');
    expect(coach.content.feedback!.tone).toBe('bad');
    expect(env.state.selected).toBe(first.accept[0]);
  });

  it('kapatınca her şey sınav öncesi hâle döner', () => {
    const env = fakeEnv();
    const before = JSON.stringify({ ...env.state, clock: null });
    const clock = env.state.clock;
    const coach = fakeCoach();
    const quiz = new Quiz(env, coach.card, resolve, seeded(9));
    quiz.start();
    expect(quiz.active).toBe(true);
    quiz.stop();
    expect(quiz.active).toBe(false);
    expect(coach.visible).toBe(false);
    expect(env.getClock()).toBe(clock);
    expect(clock.timeScale).toBe(600);
    expect(clock.paused).toBe(true);
    expect(JSON.stringify({ ...env.state, clock: null })).toBe(before);
  });

  it('sonuçtan “Tekrar başlat” yeni sınav açar, “Kapat” eski hâle döndürür', () => {
    const initial = JSON.stringify({ ...fakeEnv().state, clock: null }); // every fakeEnv starts the same
    const { env, coach, quiz } = play(7, right);
    coach.press('Tekrar başlat');
    expect(coach.content.kicker).toContain('Soru 1 / 10');
    expect(coach.content.kicker).toContain('Skor 0');
    quiz.stop();
    expect(quiz.active).toBe(false);
    expect(JSON.stringify({ ...env.state, clock: null })).toBe(initial);
  });
});
