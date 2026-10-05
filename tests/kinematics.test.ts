import { describe, expect, it } from 'vitest';
import {
  cylinderCrankAngle,
  pistonDrop,
  pistonPinHeight,
  sliderCrankPose,
  wrapCycle,
} from '../src/engine/kinematics';
import { CRANK_RADIUS, DISPLACEMENT_CC, PIN_Y_BDC, PIN_Y_TDC, SPECS } from '../src/engine/specs';

const EPS = 1e-9;

describe('slider-crank kinematics', () => {
  it('piston pin is at r + l at TDC (θ = 0)', () => {
    expect(pistonPinHeight(0)).toBeCloseTo(CRANK_RADIUS + SPECS.rodLength, 9);
    expect(PIN_Y_TDC).toBeCloseTo(172.25, 9);
  });

  it('piston pin is at l − r at BDC (θ = 180)', () => {
    expect(pistonPinHeight(180)).toBeCloseTo(SPECS.rodLength - CRANK_RADIUS, 9);
    expect(PIN_Y_BDC).toBeCloseTo(93.75, 9);
  });

  it('TDC and BDC are the true extrema of piston travel', () => {
    let max = -Infinity;
    let min = Infinity;
    for (let a = 0; a < 360; a += 0.01) {
      const y = pistonPinHeight(a);
      max = Math.max(max, y);
      min = Math.min(min, y);
    }
    expect(max).toBeLessThanOrEqual(pistonPinHeight(0) + EPS);
    expect(min).toBeGreaterThanOrEqual(pistonPinHeight(180) - EPS);
  });

  it('stroke is exactly 78.5 mm', () => {
    expect(pistonPinHeight(0) - pistonPinHeight(180)).toBeCloseTo(78.5, 9);
    expect(pistonDrop(180)).toBeCloseTo(78.5, 9);
  });

  it('displacement is ≈ 1598 cc', () => {
    expect(DISPLACEMENT_CC).toBeCloseTo(1598, 0);
  });

  it('uses the exact equation, not the 2-term approximation (piston below mid-stroke at 90°)', () => {
    // With a finite rod the piston has travelled more than half the stroke at 90°.
    const drop90 = pistonDrop(90);
    const exact = CRANK_RADIUS + SPECS.rodLength - Math.sqrt(SPECS.rodLength ** 2 - CRANK_RADIUS ** 2);
    expect(drop90).toBeCloseTo(exact, 12);
    expect(drop90).toBeGreaterThan(SPECS.stroke / 2);
  });

  it('connecting rod ends seat exactly: |crankpin − piston pin| = l for every angle', () => {
    for (let a = 0; a < 720; a += 0.5) {
      const p = sliderCrankPose(a);
      const len = Math.hypot(p.pistonY - p.pinY, 0 - p.pinZ);
      expect(Math.abs(len - SPECS.rodLength)).toBeLessThan(1e-9);
      // rod local +Y rotated by rodAngle about X lands on the piston pin
      const tipY = p.pinY + SPECS.rodLength * Math.cos(p.rodAngle);
      const tipZ = p.pinZ + SPECS.rodLength * Math.sin(p.rodAngle);
      expect(tipY).toBeCloseTo(p.pistonY, 9);
      expect(tipZ).toBeCloseTo(0, 9);
    }
  });
});

describe('crank throw phasing', () => {
  it('cylinders 1 and 4 move in phase', () => {
    for (let a = 0; a < 720; a += 1) {
      const y1 = pistonPinHeight(cylinderCrankAngle(0, a));
      const y4 = pistonPinHeight(cylinderCrankAngle(3, a));
      expect(y1).toBeCloseTo(y4, 12);
    }
  });

  it('cylinders 2 and 3 move in phase, 180° from 1 and 4', () => {
    for (let a = 0; a < 720; a += 1) {
      const c1 = cylinderCrankAngle(0, a);
      const c2 = cylinderCrankAngle(1, a);
      const c3 = cylinderCrankAngle(2, a);
      expect(pistonPinHeight(c2)).toBeCloseTo(pistonPinHeight(c3), 12);
      expect(((c2 - c1 + 360) % 360)).toBeCloseTo(180, 12);
      // 2 and 3 are at the same height as 1/4 would be 180° later
      expect(pistonPinHeight(c2)).toBeCloseTo(pistonPinHeight(c1 + 180), 9);
    }
  });

  it('when 1 and 4 are at TDC, 2 and 3 are at BDC', () => {
    expect(pistonPinHeight(cylinderCrankAngle(0, 0))).toBeCloseTo(PIN_Y_TDC, 9);
    expect(pistonPinHeight(cylinderCrankAngle(3, 0))).toBeCloseTo(PIN_Y_TDC, 9);
    expect(pistonPinHeight(cylinderCrankAngle(1, 0))).toBeCloseTo(PIN_Y_BDC, 9);
    expect(pistonPinHeight(cylinderCrankAngle(2, 0))).toBeCloseTo(PIN_Y_BDC, 9);
  });

  it('wraps the engine clock into [0, 720)', () => {
    expect(wrapCycle(725)).toBe(5);
    expect(wrapCycle(-10)).toBe(710);
    expect(wrapCycle(720)).toBe(0);
  });
});
