import { describe, expect, it } from 'vitest';
import { pointAt } from '../src/core/geometry/beltPath';
import { CAM_PITCH_R, camSprocketPhase, CHAIN_LINKS, CHAIN_PATH, chainPins, chainTravel, CRANK_PITCH_R, PATH_INDEX } from '../src/engine/parts/timingChain';
import { SPECS } from '../src/engine/specs';
import { camRotationDeg } from '../src/engine/timing';

const TD = SPECS.timingDrive;
const DEG = Math.PI / 180;

/** Angular distance from `a` to the nearest of `teeth` equally spaced seats at `phase`. */
function seatError(a: number, phase: number, teeth: number): number {
  const pitch = (2 * Math.PI) / teeth;
  let d = (a - phase) % pitch;
  if (d < 0) d += pitch;
  return Math.min(d, pitch - d);
}

describe('timing chain', () => {
  it('has an even number of links and the loop is exactly that many pitches long', () => {
    expect(CHAIN_LINKS % 2).toBe(0);
    expect(CHAIN_PATH.length).toBeCloseTo(CHAIN_LINKS * TD.chainPitch, 6);
  });

  it('keeps the pin spacing at one pitch everywhere on the loop (chordal error < 0.05 mm)', () => {
    for (const crank of [0, 37.3, 211, 555.5]) {
      const pins = chainPins(crank);
      for (let k = 0; k < pins.length; k++) {
        const a = pins[k]!.p;
        const b = pins[(k + 1) % pins.length]!.p;
        expect(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - TD.chainPitch)).toBeLessThan(0.05);
      }
    }
  });

  it('turns the cams at half crank speed through the sprockets (21 : 42)', () => {
    expect(TD.camTeeth).toBe(2 * TD.crankTeeth);
    // chain speed is the same at every sprocket: ω·z·p
    const travel = chainTravel(360); // one crank revolution
    expect(travel).toBeCloseTo(TD.crankTeeth * TD.chainPitch, 9);
    expect(travel / (TD.camTeeth * TD.chainPitch)).toBeCloseTo(0.5, 12);
    expect(camRotationDeg(360)).toBe(180);
    // pitch radii follow from teeth and pitch
    expect(CRANK_PITCH_R).toBeCloseTo(TD.chainPitch / (2 * Math.sin(Math.PI / TD.crankTeeth)), 9);
    expect(CAM_PITCH_R).toBeCloseTo(TD.chainPitch / (2 * Math.sin(Math.PI / TD.camTeeth)), 9);
  });

  it('seats every roller in a tooth gap and moves with the sprockets without slipping', () => {
    let worst = 0;
    let checked = 0;
    for (let crank = 0; crank < 720; crank += 3.7) {
      const theta = crank * DEG; // crank sprocket rotation (rotation.x)
      const psi = camRotationDeg(crank) * DEG; // cam sprocket rotation
      for (const pin of chainPins(crank)) {
        // a rotation.x of a moves features in the (z, y) plane by −a
        if (pin.circle === PATH_INDEX.crank) worst = Math.max(worst, seatError(pin.angle, -theta, TD.crankTeeth));
        else if (pin.circle === PATH_INDEX.exhaust) worst = Math.max(worst, seatError(pin.angle, camSprocketPhase('exhaust') - psi, TD.camTeeth));
        else if (pin.circle === PATH_INDEX.intake) worst = Math.max(worst, seatError(pin.angle, camSprocketPhase('intake') - psi, TD.camTeeth));
        else continue;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(worst).toBeLessThan(1e-9);
  });

  it('wraps enough teeth on every sprocket', () => {
    const wrapTeeth = (circle: number, teeth: number) => {
      const seg = CHAIN_PATH.segments.find((s) => s.kind === 'arc' && s.circle === circle)!;
      return seg.kind === 'arc' ? (Math.abs(seg.sweep) / (2 * Math.PI)) * teeth : 0;
    };
    expect(wrapTeeth(PATH_INDEX.crank, TD.crankTeeth)).toBeGreaterThan(8);
    expect(wrapTeeth(PATH_INDEX.exhaust, TD.camTeeth)).toBeGreaterThan(10);
    expect(wrapTeeth(PATH_INDEX.intake, TD.camTeeth)).toBeGreaterThan(10);
    // the path is continuous
    for (let s = 0; s < CHAIN_PATH.length; s += 0.5) {
      const a = pointAt(CHAIN_PATH, s).p;
      const b = pointAt(CHAIN_PATH, s + 0.5).p;
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.51);
    }
  });
});
