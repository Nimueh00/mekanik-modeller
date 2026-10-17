import { describe, expect, it } from 'vitest';
import { handAngles, dialReading, trainAngles } from '../src/watch/train';
import { CONTINUOUS_BEATS_PER_FRAME, TIME_SCALES, WatchClock } from '../src/watch/watchClock';
import { balanceAngle } from '../src/watch/escapement';
import { MAINSPRING, MOVEMENT } from '../src/watch/specs';

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('WatchClock', () => {
  it('advances t by dt × timeScale, capped per frame, and not while paused', () => {
    const c = new WatchClock();
    c.tick(0.05);
    expect(c.t).toBeCloseTo(0.05, 12);
    c.tick(5); // tab switch: capped
    expect(c.t).toBeCloseTo(0.05 + c.maxFrameDt, 12);
    c.paused = true;
    c.tick(0.05);
    expect(c.t).toBeCloseTo(0.05 + c.maxFrameDt, 12);
    c.paused = false;
    c.timeScale = 60;
    c.tick(0.05);
    expect(c.t).toBeCloseTo(3.15, 9);
  });

  it('switches to continuous motion above the beats-per-frame threshold', () => {
    expect(CONTINUOUS_BEATS_PER_FRAME).toBe(2);
    expect(TIME_SCALES).toContain(600);
    const c = new WatchClock();
    c.tick(1 / 60); // 0.1 beat per frame
    expect(c.continuous).toBe(false);
    c.timeScale = 1 / 50;
    c.tick(1 / 60);
    expect(c.continuous).toBe(false);
    c.timeScale = 600; // 60 beats per frame
    c.tick(1 / 60);
    expect(c.continuous).toBe(true);
    c.timeScale = 20; // exactly 2 beats per frame: still beating
    c.tick(1 / 60);
    expect(c.continuous).toBe(false);
  });

  it('stepBeats moves the seconds hand exactly 1° per beat, onto the locked rest', () => {
    const c = new WatchClock();
    c.paused = true;
    c.stepBeats(1);
    expect(angDiff(dialReading(handAngles(c.t).second), 0.5)).toBeLessThan(1e-9);
    for (let i = 1; i <= 12; i++) {
      c.stepBeats(1);
      expect(angDiff(dialReading(handAngles(c.t).second), 0.5 + i)).toBeLessThan(1e-9);
    }
    c.stepBeats(6);
    expect(angDiff(dialReading(handAngles(c.t).second), 18.5)).toBeLessThan(1e-9);
    expect(() => c.stepBeats(-1)).toThrow(RangeError);
  });

  it('a full wind runs 80 ± 3 h, then the watch stops and nothing moves', () => {
    const c = new WatchClock({ timeScale: 3600 });
    expect(c.windTurns).toBe(MAINSPRING.effectiveTurns);
    let frames = 0;
    while (c.running && frames < 1e6) {
      c.tick(0.1);
      frames++;
    }
    const hours = c.t / 3600;
    expect(Math.abs(hours - MOVEMENT.powerReserveTargetH)).toBeLessThanOrEqual(3);
    expect(c.windTurns).toBe(0);
    const t = c.t;
    const before = trainAngles(t, { amplitude: c.amplitude });
    const balance = balanceAngle(t, c.amplitude);
    c.tick(0.1);
    c.advance(1000);
    c.stepBeats(5);
    expect(c.t).toBe(t);
    expect(trainAngles(c.t, { amplitude: c.amplitude })).toEqual(before);
    expect(balanceAngle(c.t, c.amplitude)).toBe(balance);
  });

  it('winding adds turns up to the full spring and restarts a stopped watch', () => {
    const c = new WatchClock({ windTurns: 0 });
    expect(c.running).toBe(false);
    c.tick(0.1);
    expect(c.t).toBe(0);
    c.wind(1);
    expect(c.windTurns).toBe(1);
    c.advance(3600);
    expect(c.windTurns).toBeCloseTo(0.9, 12); // barrel: one turn per 10 h
    c.wind(100);
    expect(c.windTurns).toBe(MAINSPRING.effectiveTurns);
    expect(c.runOutTime - c.t).toBeCloseTo(80 * 3600, 6);
  });

  it('amplitude falls as the spring runs down', () => {
    const c = new WatchClock();
    const full = c.amplitude;
    c.advance(40 * 3600);
    expect(c.amplitude).toBeLessThan(full);
    expect(c.amplitude).toBeCloseTo(250, 9);
  });
});
