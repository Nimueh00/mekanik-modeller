import { describe, expect, it } from 'vitest';
import {
  BEATS_PER_HOUR,
  BEATS_PER_REV,
  bodyAngle,
  dialReading,
  escapeBeats,
  handAngles,
  REV_PER_HOUR,
  trainAngles,
} from '../src/watch/train';
import { BEATS_PER_SECOND, DATE, gearByName, MESHES, MOVEMENT, TRAIN } from '../src/watch/specs';

const EPS = 1e-9;
/** Smallest difference between two angles, degrees. */
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('beat rate', () => {
  it('3 Hz: 6 beats per second, 21 600 per hour, and the train asks for exactly that', () => {
    expect(MOVEMENT.frequencyHz).toBe(3);
    expect(BEATS_PER_SECOND).toBe(6);
    expect(BEATS_PER_HOUR).toBeCloseTo(21600, 9);
    expect(BEATS_PER_HOUR).toBeCloseTo(3600 * 2 * MOVEMENT.frequencyHz, 9);
  });

  it('one escape turn = 15 teeth × 2 beats', () => {
    expect(TRAIN.escape.wheel.teeth).toBe(15);
    expect(BEATS_PER_REV.escape).toBe(30);
  });
});

describe('train ratios (derived from tooth counts)', () => {
  it('fourth wheel 1 turn/min, centre 1 turn/h, hour wheel 1 turn/12 h, date driver 1 turn/24 h', () => {
    expect(Math.abs(REV_PER_HOUR.fourth)).toBeCloseTo(60, 9);
    expect(Math.abs(REV_PER_HOUR.centre)).toBeCloseTo(1, 12);
    expect(Math.abs(REV_PER_HOUR.cannon)).toBeCloseTo(1, 12);
    expect(Math.abs(REV_PER_HOUR.hourWheel)).toBeCloseTo(1 / 12, 12);
    expect(Math.abs(REV_PER_HOUR.dateDriver)).toBeCloseTo(1 / 24, 12);
    expect(BEATS_PER_REV.fourth).toBe(360);
    expect(BEATS_PER_REV.centre).toBe(21600);
    expect(BEATS_PER_REV.hourWheel).toBe(259200);
    expect(BEATS_PER_REV.dateDriver).toBe(518400);
  });

  it('the date ring advances one of 31 teeth per driver turn', () => {
    expect(DATE.ringTeeth).toBe(31);
    expect(DATE.fingersPerDriverTurn).toBe(1);
  });
});

describe('directions', () => {
  it('seconds, minute and hour turn clockwise seen from the dial (negative about +Y)', () => {
    expect(REV_PER_HOUR.fourth).toBeLessThan(0);
    expect(REV_PER_HOUR.centre).toBeLessThan(0);
    expect(REV_PER_HOUR.hourWheel).toBeLessThan(0);
  });

  it('every mesh reverses the sense, with |ω_driven/ω_driver| = Z_driver/Z_driven', () => {
    for (const [an, bn] of MESHES) {
      const a = gearByName(an);
      const b = gearByName(bn);
      const wa = REV_PER_HOUR[a.body];
      const wb = REV_PER_HOUR[b.body];
      expect(Math.sign(wa) * Math.sign(wb), `${an}→${bn}`).toBe(-1);
      expect(Math.abs(wb / wa)).toBeCloseTo(a.gear.teeth / b.gear.teeth, 12);
    }
  });

  it('the angle of the second hand decreases (clockwise) as time goes on', () => {
    const a0 = bodyAngle('fourth', 10, { continuous: true });
    const a1 = bodyAngle('fourth', 11, { continuous: true });
    expect(angDiff(a1, a0 - 6)).toBeLessThan(EPS);
  });
});

describe('hand angles', () => {
  const cases: [number, number, number, number][] = [
    // t, hour, minute, second (dial reading, clockwise from 12)
    [0, 0, 0, 0],
    [1, 1 / 120, 0.1, 6],
    [59, 59 / 120, 5.9, 354],
    [3599, 3599 / 120, 359.9, 354],
    [43199, 43199 / 120, 359.9, 354],
  ];
  for (const continuous of [false, true]) {
    it(`whole seconds land on the expected angles (${continuous ? 'continuous' : 'beating'})`, () => {
      for (const [t, h, m, s] of cases) {
        const a = handAngles(t, { continuous });
        expect(angDiff(dialReading(a.hour), h), `hour @${t}`).toBeLessThan(1e-9);
        expect(angDiff(dialReading(a.minute), m), `minute @${t}`).toBeLessThan(1e-9);
        expect(angDiff(dialReading(a.second), s), `second @${t}`).toBeLessThan(1e-9);
      }
    });
  }

  it('10:08:37 — hand angles computed by hand, within 1e-6°', () => {
    const t = 10 * 3600 + 8 * 60 + 37;
    const a = handAngles(t, { continuous: true });
    expect(angDiff(dialReading(a.hour), (10 + 8 / 60 + 37 / 3600) * 30)).toBeLessThan(1e-6); // 304.308333°
    expect(angDiff(dialReading(a.minute), (8 + 37 / 60) * 6)).toBeLessThan(1e-6); // 51.7°
    expect(angDiff(dialReading(a.second), 37 * 6)).toBeLessThan(1e-6); // 222°
  });
});

describe('beating motion', () => {
  it('the second hand advances exactly 1° per beat and is locked between beats', () => {
    for (let k = 0; k < 60; k++) {
      const rest = dialReading(handAngles((k + 0.5) / 6).second);
      expect(angDiff(rest, k + 0.5)).toBeLessThan(1e-9);
      // the lock covers most of the beat period; sample it finely
      for (let u = 0.1; u <= 0.9; u += 0.05) {
        expect(angDiff(dialReading(handAngles((k + u) / 6).second), rest)).toBeLessThan(1e-12);
      }
    }
  });

  it('the escape wheel advances 12° per beat and never runs backwards (no recoil)', () => {
    let prev = escapeBeats(0);
    for (let t = 0; t < 2; t += 1e-4) {
      const e = escapeBeats(t);
      const d = e.whole + e.frac - (prev.whole + prev.frac);
      expect(d).toBeGreaterThanOrEqual(-1e-12);
      prev = e;
    }
    const a0 = bodyAngle('escape', 0.5 / 6);
    const a1 = bodyAngle('escape', 1.5 / 6);
    expect(angDiff(a1, a0 + 12)).toBeLessThan(1e-9);
  });

  it('beating and continuous modes agree at beat centres and stay within one beat elsewhere', () => {
    for (let t = 0; t < 3; t += 0.001) {
      const b = escapeBeats(t);
      const c = escapeBeats(t, { continuous: true });
      expect(Math.abs(b.whole + b.frac - (c.whole + c.frac))).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    for (let k = 0; k < 30; k++) {
      expect(angDiff(bodyAngle('fourth', k / 6), bodyAngle('fourth', k / 6, { continuous: true }))).toBeLessThan(1e-9);
    }
  });

  it('31 days: no precision loss, beating and continuous agree within one beat step', () => {
    const T = 31 * 86400; // 2 678 400 s
    for (const dt of [0, 0.01, 1 / 12, 0.123, 0.5, 59.99]) {
      const b = trainAngles(T + dt);
      const c = trainAngles(T + dt, { continuous: true });
      expect(angDiff(b.fourth, c.fourth)).toBeLessThanOrEqual(1 + 1e-6); // 1 beat = 1° of the seconds hand
      expect(angDiff(b.escape, c.escape)).toBeLessThanOrEqual(12 + 1e-6);
      expect(angDiff(b.hourWheel, c.hourWheel)).toBeLessThanOrEqual(360 / 259200 + 1e-9);
    }
    // 31 days is a whole number of 12 h and 24 h turns: everything is back to 12 o'clock
    const a = handAngles(T, { continuous: true });
    expect(angDiff(a.hour, 0)).toBeLessThan(1e-9);
    expect(angDiff(a.minute, 0)).toBeLessThan(1e-9);
    expect(angDiff(a.second, 0)).toBeLessThan(1e-9);
    expect(angDiff(bodyAngle('dateDriver', T), 0)).toBeLessThan(1e-9);
    // and one beat later the seconds hand is still exactly 1° on
    const s = dialReading(handAngles(T + 1 / 6).second);
    expect(angDiff(s, 1)).toBeLessThan(1e-9);
  });
});
