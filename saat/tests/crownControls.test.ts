import { describe, expect, it } from 'vitest';
import {
  CROWN_POSITIONS,
  type CrownClock,
  DRAG_DEG_PER_PX,
  drain,
  DRAIN_RESERVE_HOURS,
  DRAIN_TURNS,
  dragDegrees,
  HOLD_DEG_PER_SECOND,
  holdTurn,
  ineffectiveTurnNote,
  NUDGE_DEG,
  nudge,
  reserveFraction,
  secondsState,
  selectCrownPosition,
  setWrist,
} from '../src/ui/crown';
import { clockAt, clockAtTime } from '../src/ui/watchUi';
import type { CrownPosition } from '../src/watch/pose';
import { MAINSPRING } from '../src/watch/specs';
import { WatchClock } from '../src/watch/watchClock';

/** A clock whose crown and winding calls are recorded instead of acted on. */
function spyClock(position: CrownPosition = 1, windTurns = 8): CrownClock & { calls: string[] } {
  const calls: string[] = [];
  let pos = position;
  return {
    calls,
    get crownPosition() {
      return pos;
    },
    setCrownPosition: (p) => {
      pos = p;
      calls.push(`position ${p}`);
    },
    turnCrown: (deg) => calls.push(`turn ${deg}`),
    windTurns,
    wind: (turns) => calls.push(`wind ${turns}`),
    wrist: { enabled: false },
    hacked: false,
    running: true,
  };
}

describe('taç kontrolleri: düğme mantığı WatchClock API’sini çağırır', () => {
  it('üç konum düğmesi: 1 Kurma, 2 Tarih, 3 Saat ayarı', () => {
    expect(CROWN_POSITIONS.map((p) => [p.id, p.label])).toEqual([
      [1, '1 Kurma'],
      [2, '2 Tarih'],
      [3, '3 Saat ayarı'],
    ]);
    for (const p of CROWN_POSITIONS) expect(p.hint.length).toBeGreaterThan(20);
    const c = spyClock();
    for (const p of [2, 3, 1] as const) selectCrownPosition(c, p);
    expect(c.calls).toEqual(['position 2', 'position 3', 'position 1']);
    expect(c.crownPosition).toBe(1);
  });

  it('basılı tutma: konuma göre derece/saniye, yönüyle işaretli, kare süresiyle orantılı', () => {
    for (const pos of [1, 2, 3] as const) {
      const c = spyClock(pos);
      expect(holdTurn(c, 1, 0.05)).toBeCloseTo(HOLD_DEG_PER_SECOND[pos] * 0.05, 9);
      expect(holdTurn(c, -1, 0.05)).toBeCloseTo(-HOLD_DEG_PER_SECOND[pos] * 0.05, 9);
      expect(c.calls).toHaveLength(2);
      expect(c.calls[0]).toBe(`turn ${HOLD_DEG_PER_SECOND[pos] * 0.05}`);
      expect(c.calls[1]).toBe(`turn ${-HOLD_DEG_PER_SECOND[pos] * 0.05}`);
    }
  });

  it('uzun kare (sekme değişimi) tacı bir anda çok döndürmez; sıfır kare hiçbir şey yapmaz', () => {
    const c = spyClock(1);
    expect(holdTurn(c, 1, 5)).toBeCloseTo(HOLD_DEG_PER_SECOND[1] * 0.1, 9);
    expect(holdTurn(c, 1, 0)).toBe(0);
    expect(holdTurn(c, 1, -1)).toBe(0);
    expect(c.calls).toHaveLength(1);
  });

  it('klavyeyle tek basış: küçük bir dönüş', () => {
    const c = spyClock(3);
    expect(nudge(c, 1)).toBe(NUDGE_DEG);
    expect(nudge(c, -1)).toBe(-NUDGE_DEG);
    expect(c.calls).toEqual([`turn ${NUDGE_DEG}`, `turn ${-NUDGE_DEG}`]);
  });

  it('bilek hareketi: wrist.enabled açılıp kapanır', () => {
    const c = spyClock();
    setWrist(c, true);
    expect(c.wrist.enabled).toBe(true);
    setWrist(c, false);
    expect(c.wrist.enabled).toBe(false);
  });

  it('“Saati boşalt”: rezervi ≈ 2 saate indirmek için wind(−fazla) çağırır; zaten azsa dokunmaz', () => {
    const c = spyClock(1, 8);
    drain(c);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]).toBe(`wind ${-(8 - DRAIN_TURNS)}`);
    const low = spyClock(1, DRAIN_TURNS / 2);
    drain(low);
    expect(low.calls).toEqual([]);
  });

  it('sürükleme: yüzey hareketinin ekran yönüne göre işaretli derece', () => {
    expect(dragDegrees([10, 0], [1, 0])).toBe(-10 * DRAG_DEG_PER_PX);
    expect(dragDegrees([-10, 0], [1, 0])).toBe(10 * DRAG_DEG_PER_PX);
    expect(dragDegrees([0, 7], [1, 0])).toBe(-0); // across the axis: nothing
    expect(Math.abs(dragDegrees([0, 7], [1, 0]))).toBe(0);
    expect(dragDegrees([3, 4], [0.6, 0.8])).toBeCloseTo(-5 * DRAG_DEG_PER_PX, 9);
  });
});

describe('taç kontrolleri: gerçek saatte etkileri', () => {
  const fresh = () => {
    const c = new WatchClock({ t: 5 * 86400 + 10 * 3600, windTurns: 3 });
    return c;
  };

  it('konum 1: saat yönü kurar, ters yön kurmaz', () => {
    const c = fresh();
    c.setCrownPosition(1);
    const w0 = c.windTurns;
    for (let i = 0; i < 10; i++) holdTurn(c, 1, 0.1);
    const w1 = c.windTurns;
    expect(w1).toBeGreaterThan(w0 + 0.1);
    for (let i = 0; i < 10; i++) holdTurn(c, -1, 0.1);
    expect(c.windTurns).toBeCloseTo(w1, 9);
  });

  it('zemberek dolunca kurma tavanda kalır (kayma)', () => {
    const c = fresh();
    for (let i = 0; i < 2000; i++) holdTurn(c, 1, 0.1);
    expect(c.windTurns).toBeCloseTo(MAINSPRING.effectiveTurns, 9);
  });

  it('konum 2: saat yönü tarihi ilerletir, ters yön ilerletmez; ibreler yerinde', () => {
    const c = fresh();
    c.setCrownPosition(2);
    const ring0 = c.dateRing;
    const hands0 = c.handOffset;
    for (let i = 0; i < 10; i++) holdTurn(c, 1, 0.1);
    const ring1 = c.dateRing;
    expect(ring1).toBeGreaterThan(ring0 + 1);
    for (let i = 0; i < 10; i++) holdTurn(c, -1, 0.1);
    expect(c.dateRing).toBeCloseTo(ring1, 9);
    expect(c.handOffset).toBe(hands0);
  });

  it('konum 3: ibreler iki yöne döner, saniye durur (zaman ilerlemez)', () => {
    const c = fresh();
    c.setCrownPosition(3);
    expect(c.hacked).toBe(true);
    const t0 = c.t;
    holdTurn(c, 1, 0.1);
    const fwd = c.handOffset;
    expect(fwd).toBeGreaterThan(0);
    holdTurn(c, -1, 0.1);
    holdTurn(c, -1, 0.1);
    expect(c.handOffset).toBeLessThan(0);
    c.advance(100);
    c.tick(0.1);
    expect(c.t).toBe(t0); // the hack holds the movement
  });

  it('saniye durumu: çalışıyor / durduruldu (konum 3) / durdu (rezerv bitti)', () => {
    const c = fresh();
    expect(secondsState(c)).toEqual({ stopped: false, text: 'Çalışıyor' });
    c.setCrownPosition(3);
    expect(secondsState(c)).toEqual({ stopped: true, text: 'Saniye durduruldu' });
    c.setCrownPosition(1);
    c.advance(1e6);
    expect(c.running).toBe(false);
    expect(secondsState(c)).toEqual({ stopped: true, text: 'Durdu (rezerv bitti)' });
  });

  it('ters yön notları: konum 1 ve 2’de yalnızca ters yön', () => {
    expect(ineffectiveTurnNote(1, 1)).toBeNull();
    expect(ineffectiveTurnNote(2, 1)).toBeNull();
    expect(ineffectiveTurnNote(3, 1)).toBeNull();
    expect(ineffectiveTurnNote(1, -1)).toMatch(/kurmaz/);
    expect(ineffectiveTurnNote(2, -1)).toMatch(/geri gitmez/);
    expect(ineffectiveTurnNote(3, -1)).toBeNull(); // the hands go both ways
  });

  it('bilek hareketi rezervi artırır, kapalıyken artırmaz', () => {
    const c = fresh();
    drain(c);
    const w0 = c.windTurns;
    c.tick(0.1);
    c.tick(0.1);
    expect(c.windTurns).toBeLessThan(w0 + 1e-6); // off: only the spring's own consumption
    setWrist(c, true);
    for (let i = 0; i < 60; i++) c.tick(0.1);
    expect(c.windTurns).toBeGreaterThan(w0 + 0.05);
    expect(c.rotorAngle).not.toBe(0);
  });
});

describe('“Saati boşalt” ve 3600×’te duruş', () => {
  it('rezervi 2 saate indirir (≈ %2,5); bir daha basmak değiştirmez', () => {
    const c = new WatchClock({ t: 100 });
    drain(c);
    expect(c.windTurns).toBeCloseTo(DRAIN_TURNS, 9);
    expect(reserveFraction(c.windTurns)).toBeCloseTo(DRAIN_RESERVE_HOURS / 80, 6);
    drain(c);
    expect(c.windTurns).toBeCloseTo(DRAIN_TURNS, 9);
    expect(c.running).toBe(true);
  });

  it('1 sa/s hızda saat birkaç saniyede durur ve balansın genliği söner', () => {
    const c = new WatchClock({ t: 100, timeScale: 3600 });
    drain(c);
    let frames = 0;
    while (c.running && frames < 1000) {
      c.tick(0.1);
      frames++;
    }
    expect(c.running).toBe(false);
    const stoppedAt = c.t;
    expect(frames * 0.1).toBeLessThan(4); // seconds of real time
    expect(secondsState(c).text).toBe('Durdu (rezerv bitti)');
    // the movement stands still while the balance swings down
    const swing0 = c.balanceAmplitude;
    expect(swing0).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) c.tick(0.1);
    expect(c.t).toBe(stoppedAt);
    expect(c.balanceAmplitude).toBeLessThan(1e-6);
  });

  it('boşalttıktan sonra taçla kurulabilir: saat yeniden çalışır', () => {
    const c = new WatchClock({ t: 100, timeScale: 3600 });
    drain(c);
    while (c.running) c.tick(0.1);
    c.setCrownPosition(1);
    for (let i = 0; i < 20; i++) holdTurn(c, 1, 0.1);
    expect(c.running).toBe(true);
    c.timeScale = 1;
    const t0 = c.t;
    for (let i = 0; i < 10; i++) c.tick(0.1);
    expect(c.t).toBeGreaterThan(t0);
    expect(c.balanceAmplitude).toBeGreaterThan(100); // the balance has restarted
  });

  it('boşalttıktan sonra bilek hareketiyle de kurulabilir', () => {
    const c = new WatchClock({ t: 100, timeScale: 3600 });
    drain(c);
    while (c.running) c.tick(0.1);
    c.timeScale = 1;
    setWrist(c, true);
    for (let i = 0; i < 100 && !c.running; i++) c.tick(0.1);
    expect(c.running).toBe(true);
  });
});

describe('saat değişince taç ve bilek ayarları korunur', () => {
  it('clockAt (şimdiki saate dön): konum, bilek, hız, duraklatma, rezerv korunur', () => {
    const a = new WatchClock({ t: 50, timeScale: 60, windTurns: 4 });
    a.setCrownPosition(2);
    a.wrist.enabled = true;
    a.paused = true;
    const b = clockAt(a, new Date(2026, 4, 17, 13, 5, 9));
    expect(b.crownPosition).toBe(2);
    expect(b.wrist.enabled).toBe(true);
    expect(b.timeScale).toBe(60);
    expect(b.paused).toBe(true);
    expect(b.windTurns).toBeCloseTo(4, 9);
    expect(b.t).toBe(16 * 86400 + 13 * 3600 + 5 * 60 + 9);
  });

  it('clockAtTime (paylaşılan bağlantı): verilen anda, duraklatılmış', () => {
    const a = new WatchClock({ t: 50, timeScale: 600, windTurns: 5 });
    a.setCrownPosition(3);
    const b = clockAtTime(a, 123456);
    expect(b.t).toBe(123456);
    expect(b.paused).toBe(true);
    expect(b.timeScale).toBe(600);
    expect(b.windTurns).toBeCloseTo(5, 9);
    expect(b.crownPosition).toBe(3);
  });
});
