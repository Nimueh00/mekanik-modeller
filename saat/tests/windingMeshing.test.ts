import { describe, expect, it } from 'vitest';
import { pinionOutline, wheelOutline } from '../src/watch/geometry/watchGear';
import {
  crownWheelAngle,
  intermediateAngle,
  settingWheelSpin,
  rockerAngle,
  SLIDING_LEAF_CENTRE,
} from '../src/watch/keyless';
import { reductionAngle, reverser1Angle, reverser2Angle, reverserPinionAngle } from '../src/watch/automatic';
import { AXES, KEYLESS, MOTION_WORKS, pitchRadius, tipRadius, WIND_AXES } from '../src/watch/specs';
import { WIND_GEARS, WIND_MESHES, WIND_PHASE, windGear } from '../src/watch/windTrain';
import { densify, depthInto, type P2, Region, transform } from './geom2d';

/** Allowed interpenetration of two meshing profiles, mm (the same tolerance as the train's meshing test). */
const TOL = 0.005;

interface State {
  /** Ratchet / arbor angle (rotY degrees, unwrapped). */
  arbor: number;
  rotor: number;
  /** Cumulative crown rotation in the setting positions. */
  setting: number;
}

/** Body angle of every gear (no tooth phase), from the three independent inputs. */
const ANGLE: Record<string, (s: State) => number> = {
  ratchetGear: (s) => s.arbor,
  crownSpur: (s) => crownWheelAngle(s.arbor),
  reductionPinion: (s) => reductionAngle(s.arbor),
  reductionWheel: (s) => reductionAngle(s.arbor),
  reverser1Pinion: (s) => reverserPinionAngle(s.arbor),
  reverser2Pinion: (s) => reverserPinionAngle(s.arbor),
  reverser1Wheel: (s) => reverser1Angle(s.rotor),
  reverser2Wheel: (s) => reverser2Angle(s.rotor),
  rotorPinion: (s) => s.rotor,
  settingGear: (s) => intermediateAngle(s.setting),
  settingWheel: (s) => settingWheelSpin(s.setting, 0),
};

const outline = (name: string): P2[] => {
  const g = windGear(name);
  return g.pinion ? pinionOutline(g.gear) : wheelOutline(g.gear);
};

/** Only the teeth near the line of centres can touch. */
function nearMate(pts: P2[], at: P2, selfR: number, mateAt: P2, mateTip: number): P2[] {
  const dx = mateAt[0] - at[0];
  const dz = mateAt[1] - at[1];
  const l = Math.hypot(dx, dz);
  const c: P2 = [at[0] + (dx / l) * selfR, at[1] + (dz / l) * selfR];
  return pts.filter((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < mateTip + 0.05);
}

/** Worst interpenetration of two gears at a state, with optional extra phase on the second and optional position overrides. */
function penetrationOf(
  an: string,
  bn: string,
  s: State,
  extra = 0,
  atB?: P2,
  extraAngleB = 0,
): number {
  const a = windGear(an);
  const b = windGear(bn);
  const pb = atB ?? b.at;
  const A = transform(densify(outline(an), 0.002), ANGLE[an]!(s) + WIND_PHASE[an]!, a.at);
  const B = transform(densify(outline(bn), 0.002), ANGLE[bn]!(s) + extraAngleB + WIND_PHASE[bn]! + extra, pb);
  const ra = pitchRadius(a.gear);
  const rb = pitchRadius(b.gear);
  return Math.max(
    depthInto(nearMate(A, a.at, ra, pb, tipRadius(b.gear)), new Region(B), 0.2),
    depthInto(nearMate(B, pb, rb, a.at, tipRadius(a.gear)), new Region(A), 0.2),
  );
}

const STATES: State[] = Array.from({ length: 40 }, (_, i) => ({
  arbor: ((i * 7919.371 + i * i * 13.17) % 5000) - 1000 + (i % 7) / 41,
  rotor: ((i * 6101.77 + i * i * 3.1) % 4000) - 2000 + (i % 5) / 17,
  setting: ((i * 4093.1) % 3000) - 1500 + (i % 3) / 7,
}));

describe('winding trains: layout', () => {
  it('every permanent mesh sits at the sum of the pitch radii (1e-9 mm) and overlaps axially', () => {
    for (const [an, bn] of WIND_MESHES) {
      const a = windGear(an);
      const b = windGear(bn);
      expect(Math.abs(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) - (pitchRadius(a.gear) + pitchRadius(b.gear))), `${an}–${bn}`).toBeLessThan(1e-9);
      const [a0, a1] = a.gear.y as readonly [number, number];
      const [b0, b1] = b.gear.y as readonly [number, number];
      expect(a0 < b1 && b0 < a1, `${an}–${bn} axial`).toBe(true);
    }
  });

  it('a wheel and the pinion it works with are on the same axis in different levels (compound wheels)', () => {
    for (const [w, p] of [['reverser1Wheel', 'reverser1Pinion'], ['reverser2Wheel', 'reverser2Pinion'], ['reductionWheel', 'reductionPinion']] as const) {
      const a = windGear(w);
      const b = windGear(p);
      expect(a.at).toEqual(b.at);
      const [a0, a1] = a.gear.y as readonly [number, number];
      const [b0, b1] = b.gear.y as readonly [number, number];
      expect(a0 < b1 && b0 < a1, `${w}/${p}`).toBe(false); // one level above the other
    }
  });

  it('the setting wheel stays in mesh with the intermediate gear at all rocker stations, and meets the minute wheel and the corrector at theirs', () => {
    const arm = pitchRadius(KEYLESS.settingGear) + pitchRadius(KEYLESS.settingWheel);
    for (const at of [WIND_AXES.rockerTime, WIND_AXES.rockerDate, WIND_AXES.rockerNeutral]) {
      expect(Math.hypot(at[0] - WIND_AXES.intermediate[0], at[1] - WIND_AXES.intermediate[1])).toBeCloseTo(arm, 9);
    }
    const d = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // hands: the setting wheel meshes the minute wheel's 36-tooth wheel
    expect(d(WIND_AXES.rockerTime, AXES.minute)).toBeCloseTo(pitchRadius(KEYLESS.settingWheel) + pitchRadius(MOTION_WORKS.minuteWheel), 9);
    // date: it meshes the corrector
    expect(d(WIND_AXES.rockerDate, WIND_AXES.corrector)).toBeCloseTo(pitchRadius(KEYLESS.settingWheel) + pitchRadius(KEYLESS.corrector), 9);
    // neutral: it meshes neither (clear by more than the tooth height of both)
    expect(d(WIND_AXES.rockerNeutral, AXES.minute)).toBeGreaterThan(tipRadius(KEYLESS.settingWheel) + tipRadius(MOTION_WORKS.minuteWheel));
    expect(d(WIND_AXES.rockerNeutral, WIND_AXES.corrector)).toBeGreaterThan(tipRadius(KEYLESS.settingWheel) + tipRadius(KEYLESS.corrector));
    // the stations are rockerStepDeg apart
    const ang = (p: P2) => Math.atan2(p[1] - WIND_AXES.intermediate[1], p[0] - WIND_AXES.intermediate[0]);
    expect(((ang(WIND_AXES.rockerTime) - ang(WIND_AXES.rockerDate)) * 180) / Math.PI).toBeCloseTo(KEYLESS.rockerStepDeg, 9);
    expect(((ang(WIND_AXES.rockerDate) - ang(WIND_AXES.rockerNeutral)) * 180) / Math.PI).toBeCloseTo(KEYLESS.rockerStepDeg, 9);
  });

  it('contrate pairs: the winding pinion on the contrate’s pitch circle; the sliding pinion’s leaves meet the intermediate only in positions 2 and 3', () => {
    const rc = pitchRadius(KEYLESS.crownContrate);
    expect(WIND_AXES.windingPinion[0] - WIND_AXES.crownWheel[0]).toBeCloseTo(rc, 12);
    expect(WIND_AXES.windingPinion[1]).toBe(WIND_AXES.crownWheel[1]); // the crown wheel's axis meets the stem axis
    // the sliding pinion's leaf section against the intermediate contrate's tooth ring (radial width w, contact at x_i − R)
    const ri = pitchRadius(KEYLESS.settingContrate);
    const contact = WIND_AXES.intermediate[0] - ri;
    const half = (KEYLESS.contrateWidth.intermediate + 0.5) / 2; // ring half width + leaf half length
    const reach = (pull: number) => Math.abs(SLIDING_LEAF_CENTRE + pull - contact) < half;
    expect(reach(KEYLESS.pull[0])).toBe(false);
    expect(reach(KEYLESS.pull[1])).toBe(true);
    expect(reach(KEYLESS.pull[2])).toBe(true);
  });
});

describe('winding trains: meshing in 2-D (tooth phase)', () => {
  for (const [an, bn] of WIND_MESHES) {
    it(`${an} × ${bn}: never interpenetrate by more than ${TOL * 1000} µm over ${STATES.length} states`, () => {
      let worst = 0;
      for (const s of STATES) worst = Math.max(worst, penetrationOf(an, bn, s));
      expect(worst).toBeLessThanOrEqual(TOL);
    });
  }

  it('the check is not vacuous: half a pitch of phase error makes every pair collide', () => {
    for (const [an, bn] of WIND_MESHES) {
      const half = 180 / windGear(bn).gear.teeth;
      expect(penetrationOf(an, bn, STATES[0]!, half), `${an} × ${bn}`).toBeGreaterThan(4 * TOL);
    }
  });

  it('the setting wheel meshes the intermediate gear from any rocker station (it is a planet round it)', () => {
    for (const [k, at] of [[0, WIND_AXES.rockerTime], [1, WIND_AXES.rockerDate], [2, WIND_AXES.rockerNeutral]] as const) {
      const rho = rockerAngle(k);
      let worst = 0;
      for (const s of STATES) {
        // the wheel's absolute angle is its spin relative to the arm plus the arm's own rotation
        worst = Math.max(worst, penetrationOf('settingGear', 'settingWheel', s, 0, at, settingWheelSpin(s.setting, rho) - settingWheelSpin(s.setting, 0) + rho));
      }
      expect(worst, `station ${k}`).toBeLessThanOrEqual(TOL);
    }
  });

  it('every wheel of the P3 trains is a spur gear from the shared tables, with a phase', () => {
    expect(WIND_GEARS.length).toBe(11);
    for (const g of WIND_GEARS) expect(WIND_PHASE[g.name], g.name).toBeGreaterThanOrEqual(0);
  });
});
