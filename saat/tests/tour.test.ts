import { describe, expect, it, vi } from 'vitest';
import { capture, restore } from '../src/ui/learn';
import { enterStep, Tour, TOUR_STEPS } from '../src/ui/tour';
import { VIEW_SPECS } from '../src/ui/views';
import { LAYERS, PARTS } from '../src/watch/catalog';
import { DATE_RING, MAINSPRING } from '../src/watch/specs';
import { TIME_SCALES, WatchClock } from '../src/watch/watchClock';
import { fakeCoach, fakeEnv } from './learnEnv';

const layerIds = LAYERS.map((l) => l.id as string);
const partIds = Object.values(PARTS).map((p) => p.id as string);

describe('rehberli tur: adım tanımları', () => {
  it('yedi adım, kimlikler benzersiz, başlık ve metin dolu', () => {
    expect(TOUR_STEPS).toHaveLength(7);
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(7);
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.body.length).toBeGreaterThan(0);
      for (const p of s.body) expect(p.trim().length).toBeGreaterThan(20);
    }
  });

  it('her adımın kamera ön ayarı, katmanları, parçası, hızı ve açıklığı geçerli', () => {
    const presets = VIEW_SPECS.map((v) => v.id as string);
    for (const s of TOUR_STEPS) {
      expect(presets, `${s.id}: kamera`).toContain(s.camera);
      expect(['solid', 'ghost'], `${s.id}: görünüm`).toContain(s.view);
      expect(TIME_SCALES as readonly number[], `${s.id}: hız`).toContain(s.speed);
      expect(s.open).toBeGreaterThanOrEqual(0);
      expect(s.open).toBeLessThanOrEqual(1);
      for (const l of s.hide ?? []) expect(layerIds, `${s.id}: katman ${l}`).toContain(l);
      if (s.select) expect(partIds, `${s.id}: parça`).toContain(s.select);
      if (s.crown) expect([1, 2, 3]).toContain(s.crown);
      if (s.reserveAtMost !== undefined) {
        expect(s.reserveAtMost).toBeGreaterThan(0);
        expect(s.reserveAtMost).toBeLessThanOrEqual(1);
      }
      if (s.demoTimeOfDay !== undefined) {
        expect(s.demoTimeOfDay).toBeGreaterThan(0);
        expect(s.demoTimeOfDay).toBeLessThan(86400);
      }
    }
  });

  it('adımlar anlatıldığı sırada: genel bakış → enerji → takım → çıkış → balans → kadran → kurma-ayar', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(['overview', 'energy', 'train', 'escapement', 'balance', 'dial', 'keyless']);
    expect(TOUR_STEPS.map((s) => s.camera)).toEqual(['back', 'back', 'train', 'escapement', 'escapement', 'dial', 'back']);
  });

  it('çıkış adımı 1/50 yavaş, enerji adımı bilek hareketiyle, son adım tam demontajla', () => {
    const by = (id: string) => TOUR_STEPS.find((s) => s.id === id)!;
    expect(by('escapement').speed).toBe(1 / 50);
    expect(by('energy').wrist).toBe(true);
    expect(by('keyless').open).toBe(1);
    expect(by('dial').demoTimeOfDay).toBe(DATE_RING.stepStart - 300);
  });

  it('metinlerdeki sayılar mekanizmanın sayılarıyla uyumlu', () => {
    const text = TOUR_STEPS.flatMap((s) => s.body).join('\n');
    expect(text).toContain('21.600');
    expect(text).toContain('100/10');
    expect(text).toContain('80/10 × üçüncü 75/10 = 60');
    expect(text).toContain('96/8 = 12');
    expect(text).toContain('36/12 × akrep çarkı 32/8 = 12:1');
    expect(text).toContain('→ ibreler →'); // the teardown list is lower-cased the Turkish way (İ → i, not i̇)
    expect(text).toContain(`${MAINSPRING.effectiveTurns} × 10 = 80`);
  });
});

describe('rehberli tur: durumu geri yükleme', () => {
  it('her adım kendi ayarlarını uygular', () => {
    const env = fakeEnv();
    const base = capture(env);
    let demo: WatchClock | null = null;
    for (const step of TOUR_STEPS) {
      demo = enterStep(env, step, base, demo);
      const c = env.getClock();
      expect(env.state.view, step.id).toBe(step.view);
      expect(env.state.openTarget, step.id).toBe(step.open);
      expect(c.timeScale, step.id).toBe(step.speed);
      expect(c.paused, step.id).toBe(false);
      expect(c.wrist.enabled, step.id).toBe(!!step.wrist);
      expect(c.crownPosition, step.id).toBe(step.crown ?? 1);
      expect(env.presets.at(-1), step.id).toBe(step.camera);
      expect(env.state.selected, step.id).toBe(step.select ?? null);
      expect(env.state.labels, step.id).toBe(true);
      for (const id of layerIds) expect(env.state.layers[id], `${step.id}: ${id}`).toBe(!step.hide?.includes(id));
      if (step.reserveAtMost !== undefined) expect(c.windTurns).toBeLessThanOrEqual(step.reserveAtMost * MAINSPRING.effectiveTurns + 1e-9);
    }
  });

  it('enerji adımı rezervi düşürür, kurmayı görünür kılar', () => {
    const env = fakeEnv();
    env.state.clock.wind(8); // full
    const base = capture(env);
    enterStep(env, TOUR_STEPS.find((s) => s.id === 'energy')!, base, null);
    expect(env.getClock().windTurns).toBeCloseTo(4, 6);
  });

  it('tarih gösterimi kendi saatinde çalışır: 21:55, kullanıcının saati yerinde durur', () => {
    const env = fakeEnv();
    const base = capture(env);
    const step = TOUR_STEPS.find((s) => s.id === 'dial')!;
    const demo = enterStep(env, step, base, null);
    expect(demo).not.toBeNull();
    expect(env.getClock()).toBe(demo);
    expect(env.getClock()).not.toBe(base.clock);
    // same day of the month as the user's clock, 21:55
    expect(env.getClock().t).toBe(3 * 86400 + 21 * 3600 + 55 * 60);
    expect(base.clock.t).toBe(3 * 86400 + 11 * 3600 + 7 * 60); // untouched
    // moving on puts the user's clock back
    expect(enterStep(env, TOUR_STEPS.find((s) => s.id === 'keyless')!, base, demo)).toBeNull();
    expect(env.getClock()).toBe(base.clock);
  });

  it('tur sonunda her şey turdan önceki hâle döner', () => {
    const env = fakeEnv();
    const before = JSON.stringify({ ...env.state, clock: null });
    const clock = env.state.clock;
    const clockBefore = { t: clock.t, scale: clock.timeScale, paused: clock.paused, crown: clock.crownPosition, wrist: clock.wrist.enabled, wind: clock.windTurns };
    const coach = fakeCoach();
    const tour = new Tour(env, coach.card);
    const ended = vi.fn();
    tour.onEnd = ended;
    tour.start();
    expect(tour.active).toBe(true);
    expect(coach.visible).toBe(true);
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      expect(coach.content.kicker).toBe(`Öğrenme turu · ${i + 1} / ${TOUR_STEPS.length}`);
      coach.press('İleri ▸');
    }
    expect(coach.content.kicker).toBe(`Öğrenme turu · ${TOUR_STEPS.length} / ${TOUR_STEPS.length}`);
    coach.press('Turu bitir');
    expect(tour.active).toBe(false);
    expect(coach.visible).toBe(false);
    expect(ended).toHaveBeenCalledTimes(1);
    // the same clock object, with its settings given back
    expect(env.getClock()).toBe(clock);
    expect({ t: clock.t, scale: clock.timeScale, paused: clock.paused, crown: clock.crownPosition, wrist: clock.wrist.enabled, wind: clock.windTurns }).toEqual({
      ...clockBefore,
      wind: expect.closeTo(clockBefore.wind, 9),
    });
    expect(JSON.stringify({ ...env.state, clock: null })).toBe(before);
  });

  it('kamera elle çevrilmişse tur sonunda aynı pozuna döner; ön ayardaysa ön ayarına', () => {
    const env = fakeEnv();
    env.state.preset = null;
    env.state.camera = { position: [11, 22, 33], target: [4, 5, 6] };
    const coach = fakeCoach();
    const tour = new Tour(env, coach.card);
    tour.start();
    coach.press('İleri ▸');
    expect(env.state.preset).toBe('back');
    coach.press('Kapat');
    expect(env.state.preset).toBeNull();
    expect(env.state.camera).toEqual({ position: [11, 22, 33], target: [4, 5, 6] });
    env.state.preset = 'escapement';
    tour.start();
    coach.press('Kapat');
    expect(env.state.preset).toBe('escapement');
  });

  it('turu ortasında (tarih gösterimindeyken) kapatmak da geri yükler', () => {
    const env = fakeEnv();
    const clock = env.state.clock;
    const before = JSON.stringify({ ...env.state, clock: null });
    const coach = fakeCoach();
    const tour = new Tour(env, coach.card);
    tour.start();
    for (let i = 0; i < 5; i++) coach.press('İleri ▸'); // → step 6, the date demonstration
    expect(env.getClock()).not.toBe(clock);
    coach.press('Kapat');
    expect(tour.active).toBe(false);
    expect(env.getClock()).toBe(clock);
    expect(clock.timeScale).toBe(600);
    expect(clock.paused).toBe(true);
    expect(JSON.stringify({ ...env.state, clock: null })).toBe(before);
  });

  it('ilerleme noktasıyla atlanan adımlar da geri alınır; geri ve ileri sorunsuz', () => {
    const env = fakeEnv();
    const clock = env.state.clock;
    const coach = fakeCoach();
    const tour = new Tour(env, coach.card);
    tour.start();
    expect(coach.content.actions.find((a) => a.label === '◂ Geri')!.disabled).toBe(true);
    coach.content.progress!.onPick!(5);
    expect(coach.content.title).toContain('Kadran');
    coach.press('◂ Geri');
    expect(coach.content.title).toContain('Balans');
    expect(env.getClock()).toBe(clock); // the demonstration clock is gone again
    coach.content.progress!.onPick!(6);
    tour.stop();
    expect(env.state.view).toBe('ghost');
    expect(env.state.open).toBe(0.4);
  });

  it('kullanıcı turdayken saati değiştirirse (şimdiki saate dön) yeni saat korunur, ayarlar ona geri verilir', () => {
    const env = fakeEnv();
    const base = capture(env);
    const demo = enterStep(env, TOUR_STEPS.find((s) => s.id === 'dial')!, base, null);
    const replaced = new WatchClock({ t: 5, timeScale: 1 });
    env.setClock(replaced);
    restore(env, base, demo);
    expect(env.getClock()).toBe(replaced);
    expect(replaced.timeScale).toBe(600);
    expect(replaced.crownPosition).toBe(2);
    expect(replaced.paused).toBe(true);
  });

  it('turu yeniden başlatmak yeni bir görüntü alır', () => {
    const env = fakeEnv();
    const coach = fakeCoach();
    const tour = new Tour(env, coach.card);
    tour.start();
    coach.press('İleri ▸');
    coach.press('Kapat');
    env.state.view = 'solid';
    tour.start();
    coach.press('Kapat');
    expect(env.state.view).toBe('solid');
  });
});
