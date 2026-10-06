import { describe, expect, it } from 'vitest';
import { cumAt, cumInverse, EXHAUST_CUM, flameRadius, INTAKE_CUM } from '../src/engine/gasFlow';
import { pistonPinHeight } from '../src/engine/kinematics';
import { CRANK_RADIUS, SPECS } from '../src/engine/specs';
import {
  burnFraction,
  CLEARANCE_VOLUME,
  CYCLE,
  CYCLE_STEP,
  cylinderPressure,
  cylinderVolume,
  IGNITION_PHI,
  PISTON_AREA,
  SWEPT_VOLUME,
  THERMO,
} from '../src/engine/thermo';
import { VALVE_EVENTS } from '../src/engine/timing';

describe('cylinder volume V(θ)', () => {
  it('V(BDC) / V(TDC) is the compression ratio 10.5', () => {
    const ratio = cylinderVolume(180) / cylinderVolume(0);
    expect(ratio).toBeCloseTo(SPECS.compressionRatio, 9);
    // same at the second TDC/BDC pair of the 720° cycle
    expect(cylinderVolume(540) / cylinderVolume(360)).toBeCloseTo(SPECS.compressionRatio, 9);
  });

  it('comes from the exact slider-crank, not the first-order approximation', () => {
    const l = SPECS.rodLength;
    const r = CRANK_RADIUS;
    for (const th of [30, 60, 90, 120, 150]) {
      const exact = r + l - pistonPinHeight(th);
      expect(cylinderVolume(th)).toBeCloseTo(CLEARANCE_VOLUME + PISTON_AREA * exact, 6);
    }
    // at 90° the piston has travelled more than half the stroke (rod obliquity)
    expect(cylinderVolume(90) - CLEARANCE_VOLUME).toBeGreaterThan(SWEPT_VOLUME / 2 + 1000);
  });

  it('sweeps the specified displacement', () => {
    expect((cylinderVolume(180) - cylinderVolume(0)) / 1000).toBeCloseTo(399.5, 1);
  });
});

describe('Otto cycle', () => {
  it('is closed: the P-V loop returns to its start and has no jumps', () => {
    const n = CYCLE.p.length;
    expect(n * CYCLE_STEP).toBe(720);
    // the last table point connects smoothly back to the first one
    expect(Math.abs(CYCLE.p[n - 1]! - CYCLE.p[0]!)).toBeLessThan(1.5);
    expect(Math.abs(CYCLE.v[n - 1]! - CYCLE.v[0]!)).toBeLessThan(0.05);
    expect(cylinderPressure(720)).toBeCloseTo(cylinderPressure(0), 12);
    // continuity everywhere, including the phase boundaries (IVC, EVO, blowdown, IVO, EVC)
    let maxJump = 0;
    for (let i = 0; i < n; i++) maxJump = Math.max(maxJump, Math.abs(CYCLE.p[(i + 1) % n]! - CYCLE.p[i]!));
    expect(maxJump).toBeLessThan(1.5); // bar per 0.25°, the steepest point is the pressure rise near TDC
  });

  it('produces positive net work (expansion line above the compression line)', () => {
    expect(CYCLE.work).toBeGreaterThan(0);
    // indicated mean effective pressure in a plausible range for a WOT SI engine
    const imep = CYCLE.work / (SWEPT_VOLUME * 1e-9) / 1e5;
    expect(imep).toBeGreaterThan(8);
    expect(imep).toBeLessThan(16);
    for (const a of [30, 60, 90, 120]) expect(cylinderPressure(a)).toBeGreaterThan(cylinderPressure(720 - a));
  });

  it('compresses polytropically (p·Vⁿ = const) between IVC and ignition', () => {
    const n = THERMO.polytropic;
    const ref = cylinderPressure(VALVE_EVENTS.intake.close) * cylinderVolume(VALVE_EVENTS.intake.close) ** n;
    for (let phi = VALVE_EVENTS.intake.close; phi <= IGNITION_PHI; phi += 10) {
      expect(cylinderPressure(phi) * cylinderVolume(phi) ** n / ref).toBeCloseTo(1, 3);
    }
  });

  it('peaks after TDC at a realistic pressure', () => {
    expect(CYCLE.peakPressurePhi).toBeGreaterThan(5);
    expect(CYCLE.peakPressurePhi).toBeLessThan(25);
    expect(CYCLE.peakPressure).toBeGreaterThan(35);
    expect(CYCLE.peakPressure).toBeLessThan(90);
  });

  it('gas exchange runs at about 1 bar', () => {
    for (const phi of [240, 300, 420, 500]) {
      expect(cylinderPressure(phi)).toBeGreaterThan(0.9);
      expect(cylinderPressure(phi)).toBeLessThan(1.1);
    }
  });

  it('releases heat with a Wiebe curve starting at the 15° spark advance', () => {
    expect(burnFraction(-15)).toBe(0);
    expect(burnFraction(-16)).toBe(0);
    expect(burnFraction(-15 + THERMO.burnDurationDeg)).toBeGreaterThan(0.99);
    let prev = 0;
    for (let a = -15; a < 60; a += 1) {
      const x = burnFraction(a);
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
  });
});

describe('gas flow', () => {
  it('moves exactly one charge per cycle, only while the valves are open', () => {
    for (const [tab, ev] of [
      [INTAKE_CUM, VALVE_EVENTS.intake],
      [EXHAUST_CUM, VALVE_EVENTS.exhaust],
    ] as const) {
      expect(cumAt(tab, ev.open - 0.5)).toBe(0);
      expect(cumAt(tab, ev.close + 0.5)).toBeCloseTo(1, 12);
      let prev = 0;
      for (let phi = 0; phi <= 720; phi += 0.5) {
        const c = cumAt(tab, phi);
        expect(c).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = c;
      }
      // the inverse is consistent
      for (const q of [0.1, 0.5, 0.9]) expect(cumAt(tab, cumInverse(tab, q))).toBeCloseTo(q, 6);
    }
  });

  it('flame front starts at the spark and reaches the bore edge as the charge burns out', () => {
    expect(flameRadius(IGNITION_PHI - 1)).toBe(0);
    expect(flameRadius(IGNITION_PHI + 2)).toBeLessThan(15);
    expect(flameRadius(50)).toBeGreaterThan(SPECS.bore / 2);
  });
});
