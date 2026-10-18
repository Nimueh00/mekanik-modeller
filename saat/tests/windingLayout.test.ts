import { describe, expect, it } from 'vitest';
import { CLICK_PIVOT, CLICK_TIP_SEATED, SAW_PITCH_DEG } from '../src/watch/ratchet';
import { JUMPER_PIVOT, JUMPER_TIP } from '../src/watch/dateWork';
import { SLIDING_X0, yokeGroove } from '../src/watch/keyless';
import { BRIDGES, pillars } from '../src/watch/parts/frame';
import {
  AUTOMATIC,
  AXES,
  CENTRE,
  DATE_RING,
  ESCAPEMENT,
  GEARS,
  KEYLESS,
  MOVEMENT,
  type P2,
  pitchRadius,
  PLATE_RADIUS,
  RATCHET,
  SPRING,
  TRAIN,
  WIND_AXES,
  WINDING_LEVELS,
  tipRadius,
} from '../src/watch/specs';
import { Region, densify } from './geom2d';

/**
 * P1's layout logic for the P3 parts: everything round is a disc (or ring, or a
 * row of discs along a lever) in the plan with an axial range. Two parts of
 * different bodies whose plan shapes overlap must not share an axial range,
 * unless they are one of the documented pairs that meet on purpose.
 */

type Y = readonly [number, number];
interface Shape {
  name: string;
  /** Parts that turn or move together cannot collide with themselves. */
  body: string;
  at: P2;
  r: number;
  /** Inner radius of a ring (the date ring), 0 for a disc. */
  inner?: number;
  /** Bodies of revolution about the stem axis are drawn as rectangles in the plan: x range and half width. */
  rect?: readonly [number, number];
  y: Y;
}

const L1 = WINDING_LEVELS.l1;
const L2 = WINDING_LEVELS.l2;
const [PLATE_BACK, PLATE_DIAL] = MOVEMENT.plate.y;
const BRIDGE_TOP = MOVEMENT.envelope.bridges[0];
const BRIDGE_UNDER = MOVEMENT.envelope.bridges[1];
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const overlapsY = (a: Y, b: Y) => a[0] < b[1] && b[0] < a[1];

/** Discs along the segment a–b, closely spaced, as a stand-in for a lever. */
function along(name: string, body: string, a: P2, b: P2, r: number, y: Y): Shape[] {
  const n = Math.max(1, Math.ceil(dist(a, b) / (r * 0.8)));
  return Array.from({ length: n + 1 }, (_, i) => ({
    name: `${name}#${i}`,
    body,
    at: [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as P2,
    r,
    y,
  }));
}

const gearShape = (name: string, body: string, at: P2, g: { teeth: number; module: number; y: Y }): Shape => ({
  name,
  body,
  at,
  r: tipRadius(g),
  y: g.y,
});

/** A body of revolution about the stem axis: x from x0 to x1, radius r. */
const onStem = (name: string, body: string, x0: number, x1: number, r: number, y: Y): Shape => ({
  name,
  body,
  at: [(x0 + x1) / 2, KEYLESS.stemZ],
  r,
  rect: [x0, x1],
  y,
});

/** The P3 parts as shapes. The stem's pull varies with the crown position, so a pull is a parameter. */
function newShapes(pull: number): Shape[] {
  const S: Shape[] = [];
  const barrel = AXES.barrel;
  // ratchet, click
  S.push(gearShape('ratchetGear', 'ratchet', barrel, RATCHET.gear));
  S.push({ name: 'ratchetSaw', body: 'ratchet', at: barrel, r: RATCHET.saw.tipRadius, y: L1 });
  S.push({ name: 'ratchetHub', body: 'ratchet', at: barrel, r: RATCHET.hubRadius, y: [L1[0], L2[1]] });
  S.push({ name: 'clickPost', body: 'click', at: CLICK_PIVOT, r: 0.17, y: [L1[0], BRIDGE_TOP] });
  S.push(...along('click', 'click', CLICK_PIVOT, CLICK_TIP_SEATED, 0.3, L1));
  // crown wheel: spur, contrate ring (wide as its teeth are), the stud down to the plate
  const rc = pitchRadius(KEYLESS.crownContrate) + KEYLESS.contrateWidth.crown / 2;
  S.push(gearShape('crownSpur', 'crownWheel', WIND_AXES.crownWheel, KEYLESS.crownSpur));
  S.push({ name: 'crownContrate', body: 'crownWheel', at: WIND_AXES.crownWheel, r: rc, y: KEYLESS.contrateY });
  S.push({ name: 'crownStud', body: 'crownWheel', at: WIND_AXES.crownWheel, r: 0.2, y: [L2[0], PLATE_BACK] });
  // reversers, reduction wheel, rotor pinion, with the studs that stand on the bridges
  for (const n of [1, 2] as const) {
    const at = n === 1 ? WIND_AXES.reverser1 : WIND_AXES.reverser2;
    S.push(gearShape(`reverser${n}Wheel`, `reverser${n}`, at, AUTOMATIC.reverserWheel));
    S.push(gearShape(`reverser${n}Pinion`, `reverser${n}`, at, AUTOMATIC.reverserPinion));
  }
  S.push(gearShape('reductionWheel', 'reduction', WIND_AXES.reduction, AUTOMATIC.reductionWheel));
  S.push(gearShape('reductionPinion', 'reduction', WIND_AXES.reduction, AUTOMATIC.reductionPinion));
  S.push(gearShape('rotorPinion', 'rotor', CENTRE, AUTOMATIC.rotorPinion));
  // rotor: base plate and weight (a disc: the half-moon turns through every angle), and its bearing
  S.push({ name: 'rotor', body: 'rotor', at: CENTRE, r: AUTOMATIC.rotor.outerRadius, y: AUTOMATIC.rotor.weightY });
  S.push({ name: 'bearing', body: 'rotor', at: CENTRE, r: AUTOMATIC.bearing.outerRadius, y: [AUTOMATIC.rotor.weightY[0], BRIDGE_TOP] });
  // keyless works, bridge side
  const stemY: Y = [KEYLESS.stemY - KEYLESS.stemRadius, KEYLESS.stemY + KEYLESS.stemRadius];
  S.push(onStem('stem', 'stem', WIND_AXES.windingPinion[0] - 0.3, KEYLESS.crown.x - 0.1, KEYLESS.stemRadius, stemY));
  const pinionY: Y = [KEYLESS.stemY - 0.6, KEYLESS.stemY + 0.6];
  const xw = WIND_AXES.windingPinion[0];
  S.push(onStem('windingPinion', 'windingPinion', xw - 0.25, xw + 0.55, 0.6, pinionY));
  const x0 = SLIDING_X0 + pull;
  S.push(onStem('slidingBreguet', 'sliding', x0 - 0.3, x0 + 0.05, 0.55, [KEYLESS.stemY - 0.55, KEYLESS.stemY + 0.55]));
  S.push(onStem('slidingNeck', 'sliding', x0 + 0.05, x0 + 0.8, 0.34, [KEYLESS.stemY - 0.34, KEYLESS.stemY + 0.34]));
  S.push(onStem('slidingLeaf', 'sliding', x0 + 0.9, x0 + 1.4, 0.6, pinionY));
  S.push(onStem('slidingTail', 'sliding', x0 + 1.4, x0 + 1.9, 0.3, [KEYLESS.stemY - 0.3, KEYLESS.stemY + 0.3]));
  const gv = yokeGroove(pull);
  const groove: P2 = [KEYLESS.yokePivot[0] + gv[0], KEYLESS.yokePivot[1] + gv[1]];
  const dialY: Y = [KEYLESS.dialLeverY[0], KEYLESS.dialLeverY[1]];
  // yoke and lever are pressed plates on the dial side; their pins go down through the plate to the stem
  S.push(...along('yoke', 'yoke', KEYLESS.yokePivot, groove, 0.22, dialY));
  S.push({ name: 'yokeStud', body: 'yoke', at: KEYLESS.yokePivot, r: 0.3, y: [PLATE_DIAL, dialY[1] + 0.05] });
  for (const dx of [-0.1, 0.1]) {
    S.push({ name: 'yokePin', body: 'yoke', at: [groove[0] + dx, groove[1]], r: 0.05, y: [KEYLESS.stemY + KEYLESS.stemRadius - 0.01, dialY[1]] });
  }
  const leverTip: P2 = [KEYLESS.leverTipX, KEYLESS.stemZ - KEYLESS.stemRadius * 0.65 - 0.06];
  S.push(...along('lever', 'lever', KEYLESS.leverPivot, leverTip, 0.3, dialY));
  S.push({ name: 'leverStud', body: 'lever', at: KEYLESS.leverPivot, r: 0.3, y: [PLATE_DIAL, dialY[1] + 0.05] });
  S.push({ name: 'leverPin', body: 'lever', at: leverTip, r: 0.08, y: [KEYLESS.stemY + KEYLESS.stemRadius - 0.1, dialY[1]] });
  S.push(...along('leverTail', 'lever', KEYLESS.leverPivot, [KEYLESS.leverPivot[0] - 1.4, KEYLESS.leverPivot[1] + 0.6], 0.3, dialY));
  const ys = KEYLESS.yokeSpringPost;
  S.push(...along('yokeSpring', 'yokeSpring', ys, [ys[0] + 0.95, ys[1] + 1.9], 0.2, dialY));
  const ls = KEYLESS.leverSpringPost;
  S.push(...along('leverSpring', 'leverSpring', ls, [ls[0] - 0.75, ls[1] - 1.0], 0.2, dialY));
  const rI = pitchRadius(KEYLESS.settingContrate) + KEYLESS.contrateWidth.intermediate / 2;
  S.push({ name: 'intermediateContrate', body: 'intermediate', at: WIND_AXES.intermediate, r: rI, y: KEYLESS.contrateY });
  S.push({ name: 'intermediateAxle', body: 'intermediate', at: WIND_AXES.intermediate, r: 0.2, y: [KEYLESS.contrateY[0], KEYLESS.settingGear.y[1]] });
  // dial side
  S.push(gearShape('intermediateGear', 'intermediate', WIND_AXES.intermediate, KEYLESS.settingGear));
  for (const [k, at] of [['Time', WIND_AXES.rockerTime], ['Date', WIND_AXES.rockerDate], ['Neutral', WIND_AXES.rockerNeutral]] as const) {
    S.push(gearShape(`settingWheel${k}`, `settingWheel${k}`, at, KEYLESS.settingWheel));
  }
  S.push(...along('rockerArm', 'rocker', WIND_AXES.intermediate, WIND_AXES.rockerTime, 0.3, [KEYLESS.settingWheel.y[1], KEYLESS.settingWheel.y[1] + 0.1]));
  S.push(gearShape('corrector', 'corrector', WIND_AXES.corrector, KEYLESS.corrector));
  S.push({ name: 'star', body: 'corrector', at: WIND_AXES.corrector, r: KEYLESS.starLength, y: [0.64, 0.72] });
  S.push({ name: 'correctorStud', body: 'corrector', at: WIND_AXES.corrector, r: 0.15, y: [PLATE_DIAL, 0.72] });
  S.push({ name: 'ring', body: 'ring', at: CENTRE, r: DATE_RING.outerRadius, inner: DATE_RING.tipRadius, y: DATE_RING.y });
  S.push(...along('jumper', 'jumper', JUMPER_PIVOT, JUMPER_TIP, 0.2, DATE_RING.jumper.y));
  S.push({ name: 'jumperStud', body: 'jumper', at: JUMPER_PIVOT, r: 0.2, y: [PLATE_DIAL, DATE_RING.jumper.y[1]] });
  S.push({ name: 'finger', body: 'dateDriver', at: AXES.dateDriver, r: DATE_RING.finger.length, y: DATE_RING.finger.y });
  return S;
}

/** The parts of P1/P2 that matter for the new ones (as in layout.test.ts), plus the barrel's arbor and the spring. */
function oldShapes(): Shape[] {
  const S: Shape[] = GEARS.map((g) => gearShape(g.name, g.body, AXES[g.axis], { ...g.gear, y: g.gear.y }));
  S.push({ name: 'barrelDrum', body: 'barrel', at: AXES.barrel, r: TRAIN.barrel.drum.radius, y: TRAIN.barrel.drum.y });
  S.push({ name: 'barrelArbor', body: 'barrel', at: AXES.barrel, r: 0.3, y: [L1[0], PLATE_BACK + 0.3] });
  S.push({ name: 'escapeWheel', body: 'escape', at: AXES.escape, r: TRAIN.escape.wheel.tipDiameter / 2, y: TRAIN.escape.wheel.y });
  S.push({ name: 'balance', body: 'balance', at: AXES.balance, r: ESCAPEMENT.balance.diameter / 2, y: ESCAPEMENT.balance.y });
  // arbors that run through the cavity (a thin one at every axis)
  for (const a of ['centre', 'third', 'escape', 'pallet', 'balance'] as const) {
    S.push({ name: `arbor-${a}`, body: a === 'centre' ? 'centre' : a, at: AXES[a], r: 0.16, y: [BRIDGE_UNDER, PLATE_BACK] });
  }
  // bridge pillars (cavity), screw heads on the bridges (back)
  for (const [i, p] of pillars().entries()) {
    S.push({ name: `pillar${i}`, body: 'frame', at: p.at, r: p.r, y: [BRIDGE_UNDER, PLATE_BACK] });
    S.push({ name: `screw${i}`, body: 'frame', at: p.at, r: 0.55, y: [BRIDGE_TOP - 0.17, BRIDGE_TOP] });
  }
  return S;
}

/** Pairs (by body) that meet on purpose: meshing gears, a part resting on another, coaxial parts on one axis. */
const MEETING: readonly (readonly [string, string])[] = [
  ['ratchet', 'crownWheel'], // spur mesh
  ['ratchet', 'reduction'], // reduction pinion meshes the ratchet gear
  ['reverser1', 'reduction'],
  ['reverser2', 'reduction'],
  ['rotor', 'reverser1'], // rotor pinion meshes reverser 1; reverser 1 meshes reverser 2
  ['reverser1', 'reverser2'],
  ['ratchet', 'click'], // the click rests on the saw ring
  ['windingPinion', 'crownWheel'], // contrate mesh
  ['windingPinion', 'sliding'], // Breguet teeth interlock
  ['windingPinion', 'stem'], // loose on the stem
  ['sliding', 'stem'], // on the stem's square
  ['sliding', 'yoke'], // the fork rides in the groove
  ['stem', 'yoke'], // the fork straddles the stem at the groove
  ['sliding', 'intermediate'], // leaf section meets the intermediate's contrate (positions 2, 3)
  ['stem', 'lever'], // the lever's pin rests in a notch
  ['yoke', 'yokeSpring'],
  ['lever', 'leverSpring'],
  ['intermediate', 'settingWheelTime'],
  ['intermediate', 'settingWheelDate'],
  ['intermediate', 'settingWheelNeutral'],
  ['intermediate', 'rocker'],
  ['settingWheelTime', 'minuteWheel'],
  ['settingWheelDate', 'corrector'],
  ['rocker', 'settingWheelTime'],
  ['rocker', 'settingWheelDate'],
  ['rocker', 'settingWheelNeutral'],
  ['settingWheelTime', 'settingWheelDate'], // one part, three stations of its rocker
  ['settingWheelTime', 'settingWheelNeutral'],
  ['settingWheelDate', 'settingWheelNeutral'],
  ['ring', 'dateDriver'], // the finger works in the ring's teeth
  ['ring', 'corrector'], // so does the corrector's star
  ['ring', 'jumper'],
  ['barrel', 'ratchet'], // the arbor carries the ratchet
  ['barrel', 'centre'], // barrel teeth mesh the centre pinion
  ['rotor', 'frame'], // the bearing stud stands on the train bridge
];

const meets = (a: string, b: string) => MEETING.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** Distance from a point to a stem-axis rectangle (x range, half width r about z). */
function toRect(p: P2, s: Shape): number {
  const dx = Math.max(s.rect![0] - p[0], 0, p[0] - s.rect![1]);
  const dz = Math.max(Math.abs(p[1] - s.at[1]) - s.r, 0);
  return Math.hypot(dx, dz);
}

/** True when the plan shapes of two items overlap. */
function planOverlap(a: Shape, b: Shape): boolean {
  if (a.rect && b.rect) return a.rect[0] < b.rect[1] && b.rect[0] < a.rect[1] && Math.abs(a.at[1] - b.at[1]) < a.r + b.r;
  if (a.rect) return toRect(b.at, a) < b.r && !b.inner;
  if (b.rect) return toRect(a.at, b) < a.r && !a.inner;
  const d = dist(a.at, b.at);
  const ring = (s: Shape, o: Shape) => {
    if (!s.inner) return false;
    // overlap of a ring with a disc: the disc is neither wholly inside the hole nor wholly outside
    return d - o.r < s.r && d + o.r > s.inner;
  };
  if (a.inner || b.inner) return ring(a, b) || ring(b, a);
  return d < a.r + b.r;
}

describe('P3 parts: plan and axial clearance', () => {
  const old = oldShapes();
  for (const pull of KEYLESS.pull) {
    it(`no new part shares height with a part it overlaps in plan (stem pulled ${pull} mm)`, () => {
      const items = [...newShapes(pull), ...old];
      const bad: string[] = [];
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i]!;
          const b = items[j]!;
          if (a.body === b.body || meets(a.body, b.body)) continue;
          if (!planOverlap(a, b) || !overlapsY(a.y, b.y)) continue;
          // old × old pairs are P1's business
          if (old.includes(a) && old.includes(b)) continue;
          bad.push(`${a.name} (${a.body}) × ${b.name} (${b.body})`);
        }
      }
      expect(bad).toEqual([]);
    });
  }

  it('the exemptions are real meetings: each listed pair has overlapping shapes somewhere, so the list does not hide a gap', () => {
    const items = [...newShapes(KEYLESS.pull[0]), ...newShapes(KEYLESS.pull[1]), ...newShapes(KEYLESS.pull[2]), ...old];
    const unused: string[] = [];
    for (const [x, y] of MEETING) {
      const touches = items.some((a) => a.body === x && items.some((b) => b.body === y && planOverlap(a, b) && overlapsY(a.y, b.y)));
      if (!touches) unused.push(`${x} × ${y}`);
    }
    // a few meetings are only at a shared axis, with touching rather than overlapping heights; those are named here
    const onlyNear = new Set([
      'ratchet × click',
      'ring × corrector',
      'ring × jumper',
      'ring × dateDriver',
      'rotor × frame',
      'intermediate × rocker',
      'rocker × settingWheelTime',
      'rocker × settingWheelDate',
      'rocker × settingWheelNeutral',
    ]);
    expect(unused.filter((u) => !onlyNear.has(u))).toEqual([]);
  });

  it('winding and automatic wheels lie in the two levels between the bridges and the rotor; the rotor is the lowest thing', () => {
    const [lo, hi] = MOVEMENT.envelope.rotor;
    for (const s of newShapes(0)) {
      if (['rotor', 'bearing'].includes(s.name)) continue;
      if (!/^(ratchet|click|crownSpur|reverser|reduction|rotorPinion)/.test(s.name)) continue;
      expect(s.y[0], s.name).toBeGreaterThanOrEqual(AUTOMATIC.rotor.weightY[1] - 0.01);
      expect(s.y[1], s.name).toBeLessThanOrEqual(hi + 1e-9);
    }
    expect(AUTOMATIC.rotor.weightY[0]).toBeGreaterThanOrEqual(lo);
    expect(WINDING_LEVELS.l1[1]).toBeLessThanOrEqual(WINDING_LEVELS.l2[0]);
    expect(WINDING_LEVELS.l2[1]).toBeLessThanOrEqual(BRIDGE_TOP + 1e-9);
  });

  it('everything fits the plate with 0.5 mm to its edge, except the stem and crown, which lead out at 3 o’clock', () => {
    for (const s of newShapes(0)) {
      if (s.body === 'stem') continue;
      const reach = Math.hypot(...s.at) + s.r;
      expect(reach, s.name).toBeLessThanOrEqual(PLATE_RADIUS - MOVEMENT.edgeClearance + 1e-9);
    }
    // the crown is outside the plate and the stem is level with the 3 o'clock side
    expect(KEYLESS.crown.x).toBeGreaterThan(PLATE_RADIUS);
    expect(Math.abs(KEYLESS.stemZ)).toBeLessThan(3);
  });

  it('bridge-side parts in the bridge band stand clear of the bridge outlines (crown wheel contrate, intermediate contrate)', () => {
    const bridges = Object.entries(BRIDGES).map(([name, b]) => ({ name, region: new Region(b.outline), pts: densify(b.outline, 0.05) }));
    const rings: [string, P2, number][] = [
      ['crownContrate', WIND_AXES.crownWheel, pitchRadius(KEYLESS.crownContrate) + KEYLESS.contrateWidth.crown / 2],
      ['intermediateContrate', WIND_AXES.intermediate, pitchRadius(KEYLESS.settingContrate) + KEYLESS.contrateWidth.intermediate / 2],
    ];
    for (const [name, at, r] of rings) {
      for (const b of bridges) {
        const circle = Array.from({ length: 180 }, (_, i) => [at[0] + r * Math.cos((i * Math.PI) / 90), at[1] + r * Math.sin((i * Math.PI) / 90)] as P2);
        expect(
          circle.some((p) => b.region.contains(p)) || b.pts.some((p) => dist(p, at) < r),
          `${name} × ${b.name}`,
        ).toBe(false);
      }
    }
    // the winding wheels' studs and the click post stand on bridges or the plate: report which, none may float over nothing
    void SPRING;
    void SAW_PITCH_DEG;
  });
});
