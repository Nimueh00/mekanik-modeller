import { describe, expect, it } from 'vitest';
import { BASE_RADIUS, camLift, HALF_OPEN, LASH, lobeOutline, MAX_LIFT, valveLiftAtCam } from '../src/engine/camProfile';
import { lobeAngleDeg, camRotationDeg, cycleAngle, FIRING_TDC, LOBE_CENTRE, noseToTappetDeg, strokeOf, VALVE_EVENTS, VALVE_TILT_DEG, valveLift } from '../src/engine/timing';
import { SPECS } from '../src/engine/specs';

const DEG = Math.PI / 180;
const T = SPECS.valveTrain.timing;
const kinds = ['intake', 'exhaust'] as const;

/** Scan the cycle in fine steps and return the cycle angles where the valve leaves / returns to its seat. */
function events(kind: 'intake' | 'exhaust', cyl: number) {
  const step = 0.05;
  let open = NaN;
  let close = NaN;
  // start the scan where the valve is certainly shut (half a cycle away from the lobe centre)
  const start = FIRING_TDC[cyl]! + LOBE_CENTRE[kind] + 360;
  let prev = valveLift(kind, cyl, start);
  expect(prev).toBe(0);
  for (let a = step; a <= 720; a += step) {
    const l = valveLift(kind, cyl, start + a);
    if (prev === 0 && l > 0) open = cycleAngle(cyl, start + a - step);
    if (prev > 0 && l === 0) close = cycleAngle(cyl, start + a);
    prev = l;
  }
  return { open, close };
}

describe('cam profile (single source: camLift)', () => {
  it('lifts the valve exactly maxLift at the nose and nothing on the base circle', () => {
    expect(valveLiftAtCam(0)).toBeCloseTo(MAX_LIFT, 12);
    expect(camLift(0)).toBeCloseTo(MAX_LIFT + LASH, 12);
    for (let d = HALF_OPEN; d <= 180; d += 0.5) expect(valveLiftAtCam(d)).toBe(0);
    for (let d = 100; d <= 180; d += 1) expect(camLift(d)).toBe(0);
  });

  it('is symmetric, monotonic on each flank and continuous in lift, velocity and acceleration', () => {
    let prev = camLift(0);
    const h = 0.01;
    const vel = (d: number) => (camLift(d + h) - camLift(d - h)) / (2 * h);
    const acc = (d: number) => (camLift(d + h) - 2 * camLift(d) + camLift(d - h)) / (h * h);
    for (let d = 0.1; d < 90; d += 0.1) {
      const l = camLift(d);
      expect(l).toBeLessThanOrEqual(prev + 1e-12);
      expect(camLift(-d)).toBeCloseTo(l, 12);
      prev = l;
    }
    // smooth across the joints: ramp ↔ open event, flank ↔ nose, base circle ↔ ramp
    const fe = HALF_OPEN * (1 - SPECS.cam.flankEnd);
    for (const j of [HALF_OPEN, HALF_OPEN + SPECS.cam.rampDeg, fe]) {
      expect(Math.abs(vel(j - 0.05) - vel(j + 0.05))).toBeLessThan(0.002);
      expect(Math.abs(acc(j - 0.2) - acc(j + 0.2))).toBeLessThan(0.01);
    }
  });

  it('lobe outline is the same profile: a flat follower on the outline reads camLift', () => {
    const pts = lobeOutline(3600);
    let worst = 0;
    for (let d = -180; d < 180; d += 0.5) {
      // support function of the polygon in direction d
      const c = Math.cos(d * DEG);
      const s = Math.sin(d * DEG);
      let h = -Infinity;
      for (const [u, v] of pts) h = Math.max(h, u * c + v * s);
      worst = Math.max(worst, Math.abs(h - BASE_RADIUS - camLift(d)));
    }
    expect(worst).toBeLessThan(0.01);
  });

  it('is a valid flat-follower cam: convex everywhere and the contact stays on the bucket face', () => {
    const h = 0.01;
    let minRho = Infinity;
    let maxOffset = 0;
    for (let d = -90; d <= 90; d += 0.05) {
      const hs = BASE_RADIUS + camLift(d);
      const d1 = ((camLift(d + h) - camLift(d - h)) / (2 * h)) / DEG; // mm/rad
      const d2 = ((camLift(d + h) - 2 * camLift(d) + camLift(d - h)) / (h * h)) / (DEG * DEG);
      minRho = Math.min(minRho, hs + d2);
      maxOffset = Math.max(maxOffset, Math.abs(d1));
    }
    expect(minRho).toBeGreaterThan(3); // nose radius, mm
    const faceR = SPECS.valveTrain.bucket.diameter / 2 - 0.5;
    const corner = Math.hypot(maxOffset, SPECS.cam.lobeWidth / 2);
    expect(corner).toBeLessThan(faceR);
  });
});

describe('valve timing', () => {
  it('fires 1-3-4-2 with cylinder 1 at its firing TDC at crank 0°', () => {
    const order = [0, 1, 2, 3].sort((a, b) => FIRING_TDC[a]! - FIRING_TDC[b]!).map((i) => i + 1);
    expect(order).toEqual([1, 3, 4, 2]);
    expect(FIRING_TDC[0]).toBe(0);
    for (let i = 0; i < 4; i++) {
      // at its firing TDC both valves are shut and the stroke is the power stroke
      expect(valveLift('intake', i, FIRING_TDC[i]!)).toBe(0);
      expect(valveLift('exhaust', i, FIRING_TDC[i]!)).toBe(0);
      expect(strokeOf(i, FIRING_TDC[i]! + 1)).toBe('power');
    }
  });

  it('opens and closes every valve at the specified angles (±1°)', () => {
    for (let i = 0; i < SPECS.cylinders; i++) {
      const iv = events('intake', i);
      const ev = events('exhaust', i);
      expect(Math.abs(iv.open - (360 - T.ivoBtdc))).toBeLessThan(1); // IVO 10° BTDC
      expect(Math.abs(iv.close - (540 + T.ivcAbdc))).toBeLessThan(1); // IVC 50° ABDC
      expect(Math.abs(ev.open - (180 - T.evoBbdc))).toBeLessThan(1); // EVO 50° BBDC
      expect(Math.abs(ev.close - (360 + T.evcAtdc))).toBeLessThan(1); // EVC 10° ATDC
    }
  });

  it('reaches exactly 9 mm at the lobe centres, and never more', () => {
    for (let i = 0; i < SPECS.cylinders; i++) {
      for (const kind of kinds) {
        expect(valveLift(kind, i, FIRING_TDC[i]! + LOBE_CENTRE[kind])).toBeCloseTo(SPECS.valveTrain.maxLift, 9);
        let max = 0;
        for (let a = 0; a < 720; a += 0.25) max = Math.max(max, valveLift(kind, i, a));
        expect(max).toBeLessThanOrEqual(SPECS.valveTrain.maxLift + 1e-9);
      }
    }
  });

  it('has a 20° overlap around the exhaust→intake TDC, and only there', () => {
    for (let i = 0; i < SPECS.cylinders; i++) {
      let overlap = 0;
      let first = NaN;
      for (let a = 0; a < 720; a += 0.1) {
        const crank = FIRING_TDC[i]! + a;
        if (valveLift('intake', i, crank) > 0 && valveLift('exhaust', i, crank) > 0) {
          if (Number.isNaN(first)) first = a;
          overlap += 0.1;
        }
      }
      expect(Math.abs(overlap - (T.ivoBtdc + T.evcAtdc))).toBeLessThan(1);
      expect(Math.abs(first - (360 - T.ivoBtdc))).toBeLessThan(1);
    }
  });

  it('turns the camshaft at exactly half crank speed', () => {
    expect(camRotationDeg(720)).toBe(360);
    for (const a of [0, 13.7, 359, 720, 1440.5]) expect(camRotationDeg(a + 2) - camRotationDeg(a)).toBeCloseTo(1, 12);
    // lift pattern repeats every 720° of crank (= 360° of cam), not every 360°
    for (const kind of kinds) {
      for (let a = 0; a < 720; a += 7.3) {
        expect(valveLift(kind, 0, a + 720)).toBeCloseTo(valveLift(kind, 0, a), 9);
      }
      expect(valveLift(kind, 0, LOBE_CENTRE[kind] + 360)).toBe(0);
    }
    expect(SPECS.timingDrive.camTeeth / SPECS.timingDrive.crankTeeth).toBe(2);
  });

  it('phases the lobes 90° apart in firing order, nose on the tappet at the lobe centre', () => {
    for (const kind of kinds) {
      for (let i = 0; i < 4; i++) {
        expect(noseToTappetDeg(kind, i, FIRING_TDC[i]! + LOBE_CENTRE[kind])).toBeCloseTo(0, 9);
      }
      const seq = [1, 3, 4, 2].map((c) => lobeAngleDeg(kind, c - 1));
      for (let k = 1; k < 4; k++) {
        const diff = (((seq[k - 1]! - seq[k]!) % 360) + 360) % 360;
        expect(diff).toBeCloseTo(90, 9);
      }
    }
    expect(VALVE_TILT_DEG.intake).toBe(-21);
    expect(VALVE_EVENTS.intake.open).toBe(350);
  });
});
