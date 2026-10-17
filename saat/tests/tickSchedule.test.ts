import { describe, expect, it } from 'vitest';
import { beatPhase, FULL_AMPLITUDE } from '../src/watch/escapement';
import { BEATS_PER_SECOND, ESCAPEMENT } from '../src/watch/specs';
import { HUM_FROM_SCALE, soundMode, type TickEvent, TickScheduler, tickGain, ticksBetween, tickRate } from '../src/ui/tickSchedule';
import { TIME_SCALES } from '../src/watch/watchClock';

describe('tık zamanları', () => {
  it('[t0, t1] içindeki tıklar vuruş sınırlarında (k / 6 s) ve sayıları doğru', () => {
    const ev = ticksBetween(0.01, 1.01);
    expect(ev).toHaveLength(6);
    for (const e of ev) {
      expect(e.t).toBeCloseTo(e.beat / BEATS_PER_SECOND, 12);
      expect(e.t).toBeGreaterThan(0.01);
      expect(e.t).toBeLessThanOrEqual(1.01);
    }
    expect(ev.map((e) => e.beat)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('her tık, beatPhase’in vuruş dizini ve balansın sıfır geçişiyle örtüşür', () => {
    for (const e of ticksBetween(100, 103)) {
      const p = beatPhase(e.t);
      expect(p.beat).toBe(e.beat);
      expect(Math.abs(p.balance)).toBeLessThan(1e-9); // balance crosses zero: the lever flips
    }
  });

  it('aralık (t0, t1]: uç noktalar çift sayılmaz, ardışık aralıklar birleşir', () => {
    const a = ticksBetween(0, 0.5);
    const b = ticksBetween(0.5, 1);
    expect(a.map((e) => e.beat)).toEqual([1, 2, 3]); // t = 1/6, 2/6, 3/6 = 0.5 (kapalı uç)
    expect(b.map((e) => e.beat)).toEqual([4, 5, 6]);
    expect([...a, ...b].map((e) => e.beat)).toEqual(ticksBetween(0, 1).map((e) => e.beat));
    expect(ticksBetween(1, 1)).toEqual([]);
    expect(ticksBetween(1, 0.5)).toEqual([]);
  });

  it('giriş ve çıkış paletleri sırayla dönüşür', () => {
    expect(ticksBetween(0, 1).map((e) => e.palette)).toEqual(['exit', 'entry', 'exit', 'entry', 'exit', 'entry']);
  });

  it('bir saatte 21 600 tık, büyük t’de de (ondalık hatası yok)', () => {
    expect(ticksBetween(0, 3600)).toHaveLength(21600);
    const t0 = 86400 * 400;
    expect(ticksBetween(t0, t0 + 3600)).toHaveLength(21600);
    expect(ticksBetween(t0, t0 + 3600)[0]!.beat).toBe(t0 * BEATS_PER_SECOND + 1);
  });
});

describe('ses kipi, seviye, hız', () => {
  it('60× ve üstünde tık yok (vızıltı), altında tık', () => {
    expect(HUM_FROM_SCALE).toBe(60);
    for (const s of TIME_SCALES) expect(soundMode(s)).toBe(s >= 60 ? 'hum' : 'ticks');
  });

  it('genlik düştükçe ses kısılır; tam genlikte 1, monoton', () => {
    expect(tickGain(FULL_AMPLITUDE, FULL_AMPLITUDE)).toBe(1);
    const empty = ESCAPEMENT.balance.amplitudeEmptyDeg;
    expect(tickGain(empty, FULL_AMPLITUDE)).toBeLessThan(tickGain((empty + FULL_AMPLITUDE) / 2, FULL_AMPLITUDE));
    expect(tickGain((empty + FULL_AMPLITUDE) / 2, FULL_AMPLITUDE)).toBeLessThan(1);
    expect(tickGain(0, FULL_AMPLITUDE)).toBe(0);
    expect(tickGain(999, FULL_AMPLITUDE)).toBe(1);
  });

  it('yavaş çekimde tık alçalır ve uzar (çalma hızı < 1), gerçek hızda 1', () => {
    expect(tickRate(1)).toBe(1);
    expect(tickRate(1 / 10)).toBeLessThan(tickRate(1));
    expect(tickRate(1 / 50)).toBeLessThan(tickRate(1 / 10));
    expect(tickRate(1 / 50)).toBeGreaterThanOrEqual(0.35);
  });
});

/** Runs a scheduler over fake animation frames of a clock running at `scale`. */
function run(scale: number, seconds: number, opts: { frame?: number; t0?: number; paused?: boolean } = {}) {
  const fired: { e: TickEvent; at: number }[] = [];
  const s = new TickScheduler((e, at) => fired.push({ e, at }));
  const frame = opts.frame ?? 1 / 60;
  let t = opts.t0 ?? 0;
  let audio = 10;
  for (let i = 0; i < Math.round(seconds / frame); i++) {
    s.update(audio, { t, paused: !!opts.paused, timeScale: scale });
    t += frame * scale;
    audio += frame;
  }
  return { fired, s, t, audio };
}

describe('TickScheduler', () => {
  it('gerçek hızda saniyede 6 tık; her biri bir kez, vuruş sırasıyla', () => {
    const { fired } = run(1, 5);
    expect(fired.length).toBeGreaterThanOrEqual(29);
    expect(fired.length).toBeLessThanOrEqual(32); // lookahead lets the last ones in early
    const beats = fired.map((f) => f.e.beat);
    expect(beats).toEqual([...new Set(beats)]);
    beats.forEach((b, i) => expect(b).toBe(i + 1));
    // ticks are 1/6 s apart in audio time too
    for (let i = 1; i < fired.length; i++) expect(fired[i]!.at - fired[i - 1]!.at).toBeCloseTo(1 / 6, 6);
  });

  it('ses zamanı resim zamanıyla uyumlu: tık, saatin vuruşu geçeceği anda çalar', () => {
    const fired: { e: TickEvent; at: number }[] = [];
    const s = new TickScheduler((e, at) => fired.push({ e, at }));
    // clock at t = 0.1, 1×: the next beat (1/6 s) is 0.0667 s away, beyond the 0.06 look-ahead; the one after the next frame is inside
    s.update(5, { t: 0.1, paused: false, timeScale: 1 });
    expect(fired).toHaveLength(0);
    s.update(5.02, { t: 0.12, paused: false, timeScale: 1 });
    expect(fired).toHaveLength(1);
    expect(fired[0]!.e.beat).toBe(1);
    expect(fired[0]!.at).toBeCloseTo(5.02 + s.lead + (1 / 6 - 0.12), 9);
  });

  it('1/50× yavaş çekimde tıklar 50 kat seyrek: 8,3 s’de bir', () => {
    const { fired } = run(1 / 50, 20);
    expect(fired.length).toBeGreaterThanOrEqual(2);
    expect(fired.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < fired.length; i++) expect(fired[i]!.at - fired[i - 1]!.at).toBeCloseTo(50 / 6, 6);
  });

  it('yüksek hızda (≥ 60×) hiç tık üretilmez', () => {
    for (const scale of [60, 600, 3600]) expect(run(scale, 3).fired).toHaveLength(0);
  });

  it('hızlıdan yavaşa dönünce eski vuruşlar geriden gelmez', () => {
    const { fired, s, t, audio } = run(3600, 1);
    expect(fired).toHaveLength(0);
    s.update(audio, { t, paused: false, timeScale: 1 });
    expect(fired).toHaveLength(0);
  });

  it('duraklatılmışken bir adım, geçtiği tıkı hemen çalar; duraklatılmışken sessiz', () => {
    const fired: { e: TickEvent; at: number }[] = [];
    const s = new TickScheduler((e, at) => fired.push({ e, at }));
    s.update(1, { t: 3.5 / 6, paused: true, timeScale: 1 });
    s.update(1.1, { t: 3.5 / 6, paused: true, timeScale: 1 });
    expect(fired).toHaveLength(0);
    s.update(1.2, { t: 4.5 / 6, paused: true, timeScale: 1 }); // stepBeats(1)
    expect(fired).toHaveLength(1);
    expect(fired[0]!.e.beat).toBe(4);
    expect(fired[0]!.at).toBeCloseTo(1.205, 9);
    s.update(1.3, { t: 4.5 / 6, paused: true, timeScale: 1 });
    expect(fired).toHaveLength(1);
  });

  it('geri sarma ve büyük sıçrama hiçbir şey çaldırmaz', () => {
    const fired: TickEvent[] = [];
    const s = new TickScheduler((e) => fired.push(e));
    s.update(1, { t: 100, paused: false, timeScale: 1 });
    s.update(1.02, { t: 50, paused: false, timeScale: 1 });
    s.update(1.04, { t: 5000, paused: false, timeScale: 1 });
    expect(fired).toHaveLength(0);
  });

  it('reset() sonrası imleç yeniden eşleşir', () => {
    const { fired, s } = run(1, 1);
    const before = fired.length;
    s.reset();
    s.update(99, { t: 777, paused: false, timeScale: 1 });
    expect(fired.length).toBe(before);
  });
});
