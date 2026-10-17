import { describe, expect, it } from 'vitest';
import {
  BANKING_DEG,
  balanceAmplitude,
  balanceAngle,
  beatPhase,
  LEVER_TOTAL_DEG,
  leverAngle,
  liftWindowHalfWidth,
} from '../src/watch/escapement';
import { ESCAPEMENT, MAINSPRING } from '../src/watch/specs';

const HALF_LIFT = ESCAPEMENT.liftAngleDeg / 2;

describe('balance', () => {
  it('θ(t) = A·sin(2π·3·t): zero at every beat t = k/6, alternating swing direction', () => {
    for (let k = 0; k < 12; k++) {
      expect(Math.abs(balanceAngle(k / 6))).toBeLessThan(1e-9);
      const after = balanceAngle(k / 6 + 0.01);
      expect(Math.sign(after)).toBe(k % 2 === 0 ? 1 : -1);
    }
    for (let t = 0; t < 1; t += 0.0137) {
      expect(balanceAngle(t, 280)).toBeCloseTo(280 * Math.sin(2 * Math.PI * 3 * t), 9);
    }
  });

  it('amplitude ≈ 300° fully wound, ≈ 200° at the end of the reserve', () => {
    expect(balanceAmplitude(MAINSPRING.effectiveTurns)).toBe(300);
    expect(balanceAmplitude(0)).toBe(200);
    expect(balanceAmplitude(MAINSPRING.effectiveTurns / 2)).toBe(250);
  });

  it('the lift window brackets the zero crossing', () => {
    for (const A of [200, 300]) {
      const h = liftWindowHalfWidth(A);
      expect(Math.abs(balanceAngle(h, A))).toBeCloseTo(HALF_LIFT, 9);
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThan(1 / 12);
    }
  });
});

describe('lever', () => {
  it('total swing is a plausible ~10° (derived from lift and pin geometry)', () => {
    expect(LEVER_TOTAL_DEG).toBeGreaterThan(8);
    expect(LEVER_TOTAL_DEG).toBeLessThan(12);
    expect(LEVER_TOTAL_DEG).toBeCloseTo(2 * BANKING_DEG, 12);
  });

  it('is a continuous function of the balance angle (no jumps on a fine sweep)', () => {
    let prev = leverAngle(-320);
    for (let th = -320; th <= 320; th += 0.001) {
      const l = leverAngle(th);
      expect(Math.abs(l - prev)).toBeLessThan(0.001);
      prev = l;
    }
  });

  it('rests on its banking outside the lift window, and turns against the balance inside it', () => {
    for (const th of [HALF_LIFT, 30, 90, 200, 300]) {
      expect(leverAngle(th)).toBeCloseTo(-BANKING_DEG, 12);
      expect(leverAngle(-th)).toBeCloseTo(BANKING_DEG, 12);
    }
    for (const th of [-20, -5, 5, 20]) {
      expect(Math.sign(leverAngle(th))).toBe(-Math.sign(th));
      expect(Math.abs(leverAngle(th))).toBeLessThan(BANKING_DEG);
    }
    expect(leverAngle(0)).toBeCloseTo(0, 12);
  });

  it('is continuous in time across many beats', () => {
    let prev = beatPhase(0).lever;
    for (let t = 0; t < 2; t += 1e-5) {
      const l = beatPhase(t).lever;
      expect(Math.abs(l - prev)).toBeLessThan(0.05);
      prev = l;
    }
  });
});

describe('escape wheel unlocking is tied to the lift window', () => {
  it('locked (offset ±½) outside the window, moving only inside it', () => {
    for (const A of [200, 300]) {
      const h = liftWindowHalfWidth(A);
      for (let k = 0; k < 6; k++) {
        const tk = k / 6;
        expect(beatPhase(tk - h - 1e-6, A).offset).toBeCloseTo(-0.5, 12);
        expect(beatPhase(tk + h + 1e-6, A).offset).toBeCloseTo(0.5, 12);
        expect(beatPhase(tk - 0.07, A).offset).toBeCloseTo(-0.5, 12);
        expect(beatPhase(tk + 0.07, A).offset).toBeCloseTo(0.5, 12);
        expect(Math.abs(beatPhase(tk, A).offset)).toBeLessThan(1e-12);
        const mid = beatPhase(tk + h / 2, A).offset;
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(0.5);
      }
    }
  });

  it('progress moves in one direction whichever way the lever swings', () => {
    for (const k of [0, 1, 2, 3]) {
      let prev = -Infinity;
      for (let u = -0.5; u <= 0.5; u += 0.001) {
        const p = beatPhase((k + u) / 6);
        expect(p.beat + p.offset).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = p.beat + p.offset;
      }
    }
  });
});
