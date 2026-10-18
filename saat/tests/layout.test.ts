import { describe, expect, it } from 'vitest';
import {
  AXES,
  type AxisName,
  centreDistance,
  DATE,
  ESCAPE_TO_PALLET,
  ESCAPEMENT,
  GEARS,
  gearByName,
  MESHES,
  MOTION_WORKS,
  MOVEMENT,
  pitchRadius,
  PLATE_RADIUS,
  tipRadius,
  TRAIN,
} from '../src/watch/specs';

interface Disc {
  name: string;
  /** Rigid body: parts of the same body cannot collide with each other. */
  body: string;
  axis: AxisName;
  r: number;
  y: readonly [number, number];
}

/** Everything round that occupies the plan: toothed parts by tip circle, plus drum, escape wheel and balance. */
const DISCS: Disc[] = [
  ...GEARS.map((g) => ({ name: g.name, body: g.body, axis: g.axis, r: tipRadius(g.gear), y: g.gear.y })),
  { name: 'barrelDrum', body: 'barrel', axis: 'barrel', r: TRAIN.barrel.drum.radius, y: TRAIN.barrel.drum.y },
  { name: 'escapeWheel', body: 'escape', axis: 'escape', r: TRAIN.escape.wheel.tipDiameter / 2, y: TRAIN.escape.wheel.y },
  { name: 'balance', body: 'balance', axis: 'balance', r: ESCAPEMENT.balance.diameter / 2, y: ESCAPEMENT.balance.y },
];

const dist = (a: AxisName, b: AxisName) => Math.hypot(AXES[a][0] - AXES[b][0], AXES[a][1] - AXES[b][1]);
const overlaps = (a: readonly [number, number], b: readonly [number, number]) => a[0] < b[1] && b[0] < a[1];
const isMesh = (a: string, b: string) => MESHES.some(([p, q]) => (p === a && q === b) || (p === b && q === a));

describe('meshing', () => {
  it('every meshing pair sits at r_pitch1 + r_pitch2 (1e-6 mm) and overlaps axially', () => {
    for (const [an, bn] of MESHES) {
      const a = gearByName(an);
      const b = gearByName(bn);
      expect(Math.abs(dist(a.axis, b.axis) - (pitchRadius(a.gear) + pitchRadius(b.gear))), `${an}–${bn}`).toBeLessThan(
        1e-6,
      );
      expect(overlaps(a.gear.y, b.gear.y), `${an}–${bn} axial`).toBe(true);
    }
  });

  it('direct centre seconds: third arbor equidistant from both coaxial meshes (1e-9 mm)', () => {
    const c = TRAIN.centre.wheel;
    const p3 = TRAIN.third.pinion;
    const w3 = TRAIN.third.wheel;
    const p4 = TRAIN.fourth.pinion;
    expect(Math.abs(((c.teeth + p3.teeth) * c.module) / 2 - ((w3.teeth + p4.teeth) * w3.module) / 2)).toBeLessThan(1e-9);
    expect(p3.module).toBe(c.module);
    expect(p4.module).toBe(w3.module);
  });

  it('motion works: minute arbor equidistant from cannon pinion and hour wheel (1e-9 mm)', () => {
    const { cannonPinion: cp, minuteWheel: mw, minutePinion: mp, hourWheel: hw } = MOTION_WORKS;
    expect(Math.abs(centreDistance(cp, mw) - centreDistance(mp, hw))).toBeLessThan(1e-9);
    expect(cp.module).toBe(mw.module);
    expect(mp.module).toBe(hw.module);
    expect(DATE.driver.module).toBe(hw.module);
  });

  it('seconds, minute, hour wheels and cannon pinion are all on the centre arbor', () => {
    for (const n of ['centreWheel', 'fourthWheel', 'cannonPinion', 'hourWheel']) expect(gearByName(n).axis).toBe('centre');
    expect(AXES.centre).toEqual([0, 0]);
  });
});

describe('clearance', () => {
  it('non-meshing parts whose tip circles intersect never share an axial range', () => {
    let crossings = 0;
    for (let i = 0; i < DISCS.length; i++) {
      for (let j = i + 1; j < DISCS.length; j++) {
        const a = DISCS[i]!;
        const b = DISCS[j]!;
        if (a.body === b.body || isMesh(a.name, b.name)) continue;
        if (dist(a.axis, b.axis) < a.r + b.r) {
          crossings++;
          expect(overlaps(a.y, b.y), `${a.name} × ${b.name}`).toBe(false);
        }
      }
    }
    // the plan is crowded (barrel over the centre, balance over the train): the check is not vacuous
    expect(crossings).toBeGreaterThan(10);
  });

  it('no part covers a foreign arbor within that arbor’s axial span', () => {
    const span = new Map<AxisName, [number, number]>();
    for (const d of DISCS) {
      const s = span.get(d.axis) ?? [Infinity, -Infinity];
      span.set(d.axis, [Math.min(s[0], d.y[0]), Math.max(s[1], d.y[1])]);
    }
    span.set('pallet', [...ESCAPEMENT.lever.y]);
    // the balance staff reaches down to the lever (roller table)
    span.set('balance', [ESCAPEMENT.lever.y[0], ESCAPEMENT.balance.y[1]]);
    for (const d of DISCS) {
      for (const [axis, s] of span) {
        if (axis === d.axis || dist(axis, d.axis) < 1e-9) continue;
        if (dist(axis, d.axis) < d.r) expect(overlaps(d.y, s), `${d.name} over ${axis} arbor`).toBe(false);
      }
    }
  });

  it(`every part fits the Ø ${MOVEMENT.diameter} mm plate with ≥ ${MOVEMENT.edgeClearance} mm to the edge`, () => {
    for (const d of DISCS) {
      const reach = Math.hypot(...AXES[d.axis]) + d.r;
      expect(reach, d.name).toBeLessThanOrEqual(PLATE_RADIUS - MOVEMENT.edgeClearance);
    }
    for (const a of Object.keys(AXES) as AxisName[]) expect(Math.hypot(...AXES[a])).toBeLessThan(PLATE_RADIUS);
  });

  it('axially, every part lies in the train cavity or under the dial, within ~5 mm overall', () => {
    const { dialSide, trainCavity, rotor } = MOVEMENT.envelope;
    for (const d of DISCS) {
      const inCavity = d.y[0] >= trainCavity[0] && d.y[1] <= trainCavity[1];
      const inDial = d.y[0] >= dialSide[0] && d.y[1] <= dialSide[1];
      expect(inCavity || inDial, d.name).toBe(true);
      expect(d.y[0]).toBeLessThan(d.y[1]);
    }
    expect(dialSide[1] - rotor[0]).toBeCloseTo(MOVEMENT.height, 9);
  });
});

describe('architecture', () => {
  it('barrel and balance on opposite sides, escape wheel beside the balance', () => {
    const ang = (a: AxisName) => Math.atan2(AXES[a][0], -AXES[a][1]);
    const sep = Math.abs(((ang('barrel') - ang('balance') + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    expect((sep * 180) / Math.PI).toBeGreaterThan(150);
    expect(dist('escape', 'balance')).toBeCloseTo(ESCAPE_TO_PALLET + ESCAPEMENT.palletToBalance, 12);
    expect(dist('escape', 'pallet') + dist('pallet', 'balance')).toBeCloseTo(dist('escape', 'balance'), 12); // straight line
  });
});

describe('usual horological ranges', () => {
  it('modules 0.05–0.25 mm, pinions 6–14 leaves', () => {
    for (const g of GEARS) {
      expect(g.gear.module, g.name).toBeGreaterThanOrEqual(0.05);
      expect(g.gear.module, g.name).toBeLessThanOrEqual(0.25);
      if (g.pinion) {
        expect(g.gear.teeth, g.name).toBeGreaterThanOrEqual(6);
        expect(g.gear.teeth, g.name).toBeLessThanOrEqual(14);
      } else {
        expect(g.gear.teeth, g.name).toBeGreaterThan(14);
      }
    }
  });
});
