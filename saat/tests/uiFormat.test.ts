import { describe, expect, it } from 'vitest';
import { DIAL_SECONDS, formatAmplitude, formatDialTime, formatReserve, reserveOf, secondsOnDial } from '../src/ui/format';
import { SPEED_OPTIONS, speedIndex } from '../src/ui/speeds';
import { clockAt } from '../src/ui/watchUi';
import { MAINSPRING } from '../src/watch/specs';
import { TIME_SCALES, WatchClock } from '../src/watch/watchClock';

describe('zaman göstergesi', () => {
  it('t = 0 on saat 12:00:00 gösterir; 12 saatlik kadran', () => {
    expect(formatDialTime(0)).toBe('12:00:00');
    expect(formatDialTime(1)).toBe('12:00:01');
    expect(formatDialTime(59.999)).toBe('12:00:59');
    expect(formatDialTime(3600)).toBe('01:00:00');
    expect(formatDialTime(11 * 3600 + 59 * 60 + 59)).toBe('11:59:59');
    expect(formatDialTime(12 * 3600)).toBe('12:00:00');
    expect(formatDialTime(13 * 3600 + 5 * 60 + 7)).toBe('01:05:07');
  });

  it('t çok büyükken kadrana indirgenir (günler süren hızlı ileri sarma)', () => {
    const t = 1000 * DIAL_SECONDS + 4 * 3600 + 30 * 60 + 15;
    expect(formatDialTime(t)).toBe('04:30:15');
    expect(formatDialTime(1e9)).toBe(formatDialTime(1e9 % DIAL_SECONDS));
    // 1e9 = 23148 × 43200 + 6400 s → 1 sa 46 dk 40 sn
    expect(formatDialTime(1e9)).toBe('01:46:40');
  });

  it('saniyenin kesri aşağı yuvarlanır; ikili kayan nokta hatası bir saniye atlatmaz', () => {
    expect(formatDialTime(0.1 + 0.2 + 2.7)).toBe('12:00:03'); // 3.0000000000000004
    expect(formatDialTime(3 - 1e-12)).toBe('12:00:03');
    expect(formatDialTime(2.9)).toBe('12:00:02');
  });

  it('negatif zaman da kadrana oturur', () => {
    expect(formatDialTime(-1)).toBe('11:59:59');
  });

  it('duvar saati → kadran saniyesi', () => {
    expect(secondsOnDial(new Date(2025, 0, 1, 15, 4, 5, 500))).toBeCloseTo(3 * 3600 + 4 * 60 + 5.5, 9);
    expect(secondsOnDial(new Date(2025, 0, 1, 0, 0, 0, 0))).toBe(0);
    expect(formatDialTime(secondsOnDial(new Date(2025, 0, 1, 12, 0, 0, 0)))).toBe('12:00:00');
  });

  it('"şimdiki saate dön" hızı, duraklatmayı ve zemberek durumunu korur', () => {
    const old = new WatchClock({ t: 1234, timeScale: 600, windTurns: 3 });
    old.paused = true;
    const next = clockAt(old, new Date(2025, 5, 1, 9, 41, 7, 0));
    expect(formatDialTime(next.t)).toBe('09:41:07');
    expect(next.timeScale).toBe(600);
    expect(next.paused).toBe(true);
    expect(next.windTurns).toBeCloseTo(3, 9);
  });

  it('güç rezervi: tam kurulu 80 saat, %100; yarısı 40 saat, %50; bitince 0', () => {
    expect(reserveOf(MAINSPRING.effectiveTurns).hours).toBeCloseTo(80, 6);
    expect(reserveOf(MAINSPRING.effectiveTurns / 2)).toMatchObject({ fraction: 0.5 });
    expect(reserveOf(MAINSPRING.effectiveTurns / 2).hours).toBeCloseTo(40, 6);
    expect(reserveOf(0)).toEqual({ hours: 0, fraction: 0 });
    expect(reserveOf(-3).hours).toBe(0);
    expect(reserveOf(99).fraction).toBe(1);
    expect(formatReserve(MAINSPRING.effectiveTurns)).toBe('80,0 sa · %100');
    expect(formatReserve(0)).toBe('0,0 sa · %0');
  });

  it('genlik derece olarak yuvarlanır', () => {
    expect(formatAmplitude(299.6)).toBe('300°');
    expect(formatAmplitude(200)).toBe('200°');
  });
});

describe('hız düğmeleri', () => {
  it('her TIME_SCALES girdisi için sırayla bir düğme var', () => {
    expect(SPEED_OPTIONS.map((s) => s.scale)).toEqual([...TIME_SCALES]);
  });

  it('etiketler Türkçe, anlaşılır ve benzersiz', () => {
    expect(SPEED_OPTIONS.map((s) => s.label)).toEqual(['1/50 yavaş', '1/10 yavaş', 'Gerçek', '1 dk/s', '10 dk/s', '1 sa/s']);
    expect(new Set(SPEED_OPTIONS.map((s) => s.label)).size).toBe(TIME_SCALES.length);
    for (const s of SPEED_OPTIONS) expect(s.title.length).toBeGreaterThan(5);
  });

  it('etiketler gösterdikleri hızla tutarlı: dk/s ve sa/s, saatin saniyede ilerlettiği süre', () => {
    const at = (label: string) => SPEED_OPTIONS.find((s) => s.label === label)!.scale;
    expect(at('Gerçek')).toBe(1);
    expect(at('1 dk/s')).toBe(60);
    expect(at('10 dk/s')).toBe(600);
    expect(at('1 sa/s')).toBe(3600);
  });

  it('geçerli hız → düğme dizini; ön ayar dışı hızda −1', () => {
    TIME_SCALES.forEach((s, i) => expect(speedIndex(s)).toBe(i));
    expect(speedIndex(1 / 50 + 1e-12)).toBe(0);
    expect(speedIndex(7)).toBe(-1);
  });
});
