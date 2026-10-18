import type { BufferGeometry } from 'three';
import { extrudeAlongX, latheX, type P2, roundCorners, shapeFrom } from '../../core/geometry/profile';
import { pinionOutline, wheelOutline } from '../geometry/watchGear';
import { BREGUET_LENGTH, SLIDING_X0, yokeRestVector } from '../keyless';
import { KEYLESS, MOVEMENT, WIND_AXES } from '../specs';
import { box, circle, cylinderY, merge, slab, strokeOutline, toScene, tubeY } from './common';
import { contrateTeeth } from './winding';
import { windGearGeometry } from './gears';

/**
 * Keyless works. Bridge-side parts (stem, sliding pinion, winding pinion, yoke,
 * setting lever, the intermediate's contrate) lie in the strip under the bridges
 * beside the train; the intermediate's axle runs through the plate to its gear
 * on the dial side, where the setting wheel (on a rocker round it) and the date
 * corrector work. Stem parts are built on the stem axis (origin on the axis,
 * absolute x) so that their node can sit on the axis and turn about x.
 */

const Z = KEYLESS.stemZ;
const PLATE_DIAL = MOVEMENT.plate.y[1];
const X_WINDING = WIND_AXES.windingPinion[0];

/** A saw-tooth ring of `n` wedge-shaped Breguet teeth on a face, pointing in direction `dir` (±1 along x). */
function breguetTeeth(n: number, r0: number, r1: number, xBase: number, dir: 1 | -1): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const a0 = (2 * Math.PI * k) / n;
    const a1 = a0 + (2 * Math.PI) / n;
    // a wedge: radial block whose height ramps along the circumference
    const pts: P2[] = [
      [r0 * Math.cos(a0), r0 * Math.sin(a0)],
      [r1 * Math.cos(a0), r1 * Math.sin(a0)],
      [r1 * Math.cos(a1), r1 * Math.sin(a1)],
      [r0 * Math.cos(a1), r0 * Math.sin(a1)],
    ];
    const tooth = extrudeAlongX(shapeFrom(pts), Math.min(xBase, xBase + dir * BREGUET_LENGTH), Math.max(xBase, xBase + dir * BREGUET_LENGTH));
    out.push(tooth);
  }
  return out;
}

/** A pinion's leaves, extruded along x from x0 to x1, with a gap centred on −y (towards the contrate wheel's teeth). */
function leafPinion(teeth: number, module: number, x0: number, x1: number, bore: number): BufferGeometry {
  const outline = pinionOutline({ teeth, module, y: [0, 0] });
  const gapCentre = 270; // degrees in the (a, b) = (z, y) shape plane
  const turn = ((gapCentre - 180 / teeth) * Math.PI) / 180;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const pts = outline.map(([x, y]) => [x * c - y * s, x * s + y * c] as P2);
  const hole = circle(bore, [0, 0], 20).reverse();
  return extrudeAlongX(shapeFrom(pts, [hole]), x0, x1);
}

export interface StemGeometry {
  /** Stem with its notches, the winding pinion's seat and the crown. */
  stem: BufferGeometry;
}

/** x of the stem's inner end, pushed in, and of the crown's inner face. */
export const STEM_X0 = X_WINDING - 0.3;
export const CROWN_X0 = KEYLESS.crown.x;

/** The winding stem with its crown (kurma kolu ve taç). */
export function buildStem(): StemGeometry {
  const r = KEYLESS.stemRadius;
  const notchAt = (pull: number) => KEYLESS.leverTipX - pull; // stem-local x under the lever tip at that pull
  const prof: P2[] = [[0, STEM_X0], [r, STEM_X0]];
  for (const p of KEYLESS.pull) {
    const x = notchAt(p);
    prof.push([r, x - 0.35], [r * 0.65, x - 0.18], [r * 0.65, x + 0.18], [r, x + 0.35]);
  }
  prof.sort((a, b) => a[1] - b[1]);
  prof.push([r, CROWN_X0 - 0.1], [r * 1.5, CROWN_X0 - 0.1]);
  const crownR = KEYLESS.crown.radius;
  const crownEnd = CROWN_X0 + KEYLESS.crown.length;
  // crown: tube with a rounded top and a knurled-looking flange (ridges as steps)
  prof.push(
    [crownR * 0.7, CROWN_X0],
    [crownR, CROWN_X0 + 0.15],
    [crownR, crownEnd - 0.35],
    [crownR * 0.88, crownEnd - 0.1],
    [crownR * 0.55, crownEnd],
    [0, crownEnd],
  );
  const stem = latheX(prof.filter((p, i) => i === 0 || p[1] >= prof[i - 1]![1] - 1e-9 || p[0] === 0), 28);
  const ridges: BufferGeometry[] = [];
  for (let k = 0; k < 28; k++) {
    const rib = box(KEYLESS.crown.length - 0.7, 0.12, 0.12, [CROWN_X0 + 0.15 + (KEYLESS.crown.length - 0.7) / 2, crownR, 0]);
    rib.rotateX((2 * Math.PI * k) / 28);
    ridges.push(rib);
  }
  return { stem: toScene(merge([stem, ...ridges])) };
}

export interface SlidingPinionGeometry {
  body: BufferGeometry;
}

/**
 * Sliding pinion (kayar pinyon, a "coulant"): Breguet teeth facing the winding
 * pinion, a neck with the groove the yoke's fork sits in, and the leaf section
 * that meshes the intermediate contrate when pulled out.
 */
export function buildSlidingPinion(): SlidingPinionGeometry {
  const x0 = SLIDING_X0;
  const sl = KEYLESS.slidingPinion;
  const bodyProfile: P2[] = [
    [0.18, x0],
    [0.52, x0],
    [0.52, x0 + 0.05],
    [0.34, x0 + 0.05],
    [0.34, x0 + 0.8],
    [0.3, x0 + 0.8],
    [0.3, x0 + 1.35],
    [0.2, x0 + 1.35], // the groove the yoke's pins sit in
    [0.2, x0 + 1.65],
    [0.3, x0 + 1.65],
    [0.3, x0 + 1.9],
    [0.18, x0 + 1.9],
    [0.18, x0],
  ];
  const body = latheX(bodyProfile, 28);
  const teeth = breguetTeeth(sl.breguetTeeth, 0.3, 0.5, x0, -1);
  const leaves = leafPinion(sl.leafTeeth, sl.leafModule, x0 + 0.9, x0 + 1.4, 0.17);
  return { body: toScene(merge([body, ...teeth, leaves])) };
}

/** Winding pinion (kurma pinyonu): leaves meshing the crown wheel's contrate, Breguet teeth on the outboard side. */
export function buildWindingPinion(): BufferGeometry {
  const g = KEYLESS.windingPinion;
  const leaves = leafPinion(g.teeth, g.module, -0.25, 0.25, 0.22);
  const teeth = breguetTeeth(KEYLESS.slidingPinion.breguetTeeth, 0.3, 0.5, 0.25, 1);
  const collar = latheX(
    [[0.22, 0.25], [0.52, 0.25], [0.52, 0.3], [0.22, 0.3], [0.22, 0.25]].map(([a, b]) => [a!, b!] as P2),
    24,
  );
  return toScene(merge([leaves, collar, ...teeth]));
}

const [DY0, DY1] = KEYLESS.dialLeverY;
const CHAMFER = -0.07;

/** A pressed-steel outline: corners chamfered (negative radius) or rounded, as a stamping with a die break. */
function stamping(pts: P2[], round: number[]): P2[] {
  return roundCorners(pts, round, true, 3);
}

/**
 * A pressed lever plate between DY0 and DY1: the outline, its holes, a bevelled
 * edge, and a screw head with a slot over the stud hole (origin = the stud).
 */
function pressedPlate(outline: P2[], holes: P2[][]): BufferGeometry[] {
  const plate = slab(outline, holes, DY0, DY1, 0.012);
  const head = cylinderY(0.3, DY1 - 0.005, DY1 + 0.05, 24);
  const slot = box(0.5, 0.03, 0.09, [0, DY1 + 0.05, 0]);
  const stud = cylinderY(0.13, 0, DY1, 16);
  return [plate, head, slot, stud];
}

/** Rotate a point about the origin by `a` radians in the plan numbers. */
const turnBy = (p: P2, a: number): P2 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

/**
 * The yoke (sürgü): a pressed-steel plate on the dial side, pivoting on a stud
 * in the plate. Its arm reaches over the stem line; two pins at its end go down
 * through the slot in the plate and sit either side of the groove of the sliding
 * pinion. Built in the frame of its stud.
 */
export function buildYoke(): BufferGeometry {
  const v = yokeRestVector(); // stud → groove, mm
  const len = Math.hypot(v[0], v[1]);
  const ang = Math.atan2(v[1], v[0]);
  // outline along the arm (s) and across it (t), then turned onto the arm
  const local: P2[] = [
    [-0.75, -0.3],
    [-0.5, -0.62],
    [0.1, -0.7],
    [0.7, -0.5],
    [len * 0.6, -0.3],
    [len - 0.2, -0.2],
    [len + 0.22, -0.16],
    [len + 0.22, 0.16],
    [len - 0.2, 0.2],
    [len * 0.6, 0.3],
    [0.7, 0.5],
    [0.2, 0.8], // tail the spring presses on
    [-0.45, 0.78],
    [-0.75, 0.3],
  ];
  const outline = stamping(local.map((p) => turnBy(p, ang)), [CHAMFER, 0.1, 0.1, 0, 0, CHAMFER, CHAMFER, CHAMFER, CHAMFER, 0, 0, CHAMFER, 0.1, CHAMFER]);
  const holes: P2[][] = [
    circle(0.14, [0, 0], 24).reverse(),
    circle(0.1, turnBy([len * 0.32, 0], ang), 16).reverse(),
    circle(0.1, turnBy([len * 0.5, 0], ang), 16).reverse(),
  ];
  const parts = pressedPlate(outline, holes);
  const x = KEYLESS.stemY + KEYLESS.stemRadius - 0.01;
  for (const dx of [-0.1, 0.1]) {
    parts.push(cylinderY(0.05, x, DY0 + 0.02, 14, [v[0] + dx, v[1]]));
  }
  return toScene(merge(parts));
}

/**
 * The setting lever (ayar kolu): a pressed-steel detent lever on the dial side;
 * its pin goes down through a hole in the plate and rests in the stem's notches.
 * Built in the frame of its stud.
 */
export function buildSettingLever(): BufferGeometry {
  const tip: P2 = [KEYLESS.leverTipX - KEYLESS.leverPivot[0], tipZ() - KEYLESS.leverPivot[1]];
  const len = Math.hypot(tip[0], tip[1]);
  const ang = Math.atan2(tip[1], tip[0]);
  const local: P2[] = [
    [-0.55, -0.35],
    [-0.2, -0.65],
    [0.5, -0.55],
    [len * 0.55, -0.3],
    [len - 0.1, -0.2],
    [len + 0.2, 0],
    [len - 0.1, 0.2],
    [len * 0.55, 0.3],
    [0.5, 0.45],
    [-0.1, 0.5],
    [-0.9, 0.9], // spring tail
    [-1.4, 0.6],
    [-0.8, 0.1],
  ];
  const outline = stamping(local.map((p) => turnBy(p, ang)), [CHAMFER, 0.12, 0.1, 0, CHAMFER, 0.04, CHAMFER, 0, 0.1, 0, CHAMFER, CHAMFER, 0.06]);
  const holes: P2[][] = [circle(0.14, [0, 0], 24).reverse(), circle(0.11, turnBy([len * 0.4, 0], ang), 16).reverse()];
  const parts = pressedPlate(outline, holes);
  parts.push(cylinderY(0.08, KEYLESS.stemY + KEYLESS.stemRadius - 0.1, DY0 + 0.02, 14, tip));
  return toScene(merge(parts));
}

/** y of the setting lever's tip: just on the 12 o'clock side of the stem axis. */
export function tipZ(): number {
  return Z - KEYLESS.stemRadius * 0.65 - 0.06;
}

/** A leaf spring on the dial side: a thin blade from a post to where it presses on its lever, in the movement frame. */
function leafSpring(path: P2[]): BufferGeometry {
  const y0 = DY0 + 0.04;
  const y1 = DY1 - 0.04;
  const blade = slab(strokeOutline(path, [0.14, 0.1, 0.07], 8), [], y0, y1);
  const post = cylinderY(0.22, 0, y1 + 0.03, 20, path[0]!);
  const screw = cylinderY(0.3, y1, y1 + 0.06, 20, path[0]!);
  return toScene(merge([blade, post, screw]));
}

/** Yoke spring: from a post in the plate to the yoke's arm. */
export function buildYokeSpring(): BufferGeometry {
  const [px, pz] = KEYLESS.yokeSpringPost;
  return leafSpring([[px, pz], [px + 0.2, pz + 1.3], [px + 0.95, pz + 1.9]]);
}

/** Setting lever spring: from a post in the plate to the lever's arm. */
export function buildLeverSpring(): BufferGeometry {
  const [px, pz] = KEYLESS.leverSpringPost;
  return leafSpring([[px, pz], [px - 0.3, pz - 0.7], [px - 0.75, pz - 1.0]]);
}

export interface IntermediateGeometry {
  /** Contrate ring on the bridge side (steel). */
  contrate: BufferGeometry;
  /** Gear on the dial side (gilt brass). */
  gear: BufferGeometry;
  /** Axle from the gear through the plate into the contrate's hub (steel). */
  axle: BufferGeometry;
}

/**
 * The intermediate setting wheel (ayar ara çarkı) is two parts on one axle: a
 * contrate wheel on the bridge side, and, through a hole in the plate, a gear on
 * the dial side whose axle ends in the contrate's hub.
 */
export function buildIntermediate(): IntermediateGeometry {
  const R = (KEYLESS.settingContrate.teeth * KEYLESS.settingContrate.module) / 2;
  const [cy0, cy1] = KEYLESS.contrateY;
  const w = KEYLESS.contrateWidth.intermediate;
  const bodyTop = cy0 + 0.085;
  const body = slab(circle(R + w / 2, [0, 0], 48), [circle(0.15, [0, 0], 20).reverse()], cy0, bodyTop);
  const teeth = contrateTeeth(R, KEYLESS.settingContrate.teeth, w, bodyTop - 0.01, cy1);
  const hub = tubeY(0.15, 0.32, bodyTop, cy1, 20);
  const g1 = KEYLESS.settingGear.y[1];
  const axle = cylinderY(0.15, cy1 - 0.12, g1 + 0.03, 20);
  const collar = cylinderY(0.25, PLATE_DIAL, PLATE_DIAL + 0.08, 20);
  return {
    contrate: toScene(merge([body, ...teeth, hub])),
    gear: windGearGeometry('settingGear', undefined, 0.15),
    axle: toScene(merge([axle, collar])),
  };
}

export interface SettingWheelGeometry {
  /** The rocker arm from the intermediate's axis to the setting wheel's axle (steel); built in the intermediate's frame. */
  arm: BufferGeometry;
  /** The wheel, built round its own axis (gilt brass). */
  wheel: BufferGeometry;
  axle: BufferGeometry;
}

/** The setting wheel (ayar çarkı) on its rocker. */
export function buildSettingWheel(): SettingWheelGeometry {
  const v: P2 = [WIND_AXES.rockerTime[0] - WIND_AXES.intermediate[0], WIND_AXES.rockerTime[1] - WIND_AXES.intermediate[1]];
  const y0 = KEYLESS.settingWheel.y[1] + 0.02;
  const arm = slab(strokeOutline([[0, 0], [v[0] * 0.5, v[1] * 0.5], [v[0], v[1]]], [0.5, 0.42, 0.5], 8), [circle(0.12, [0, 0], 16).reverse()], y0, y0 + 0.07, 0.01);
  const wheel = windGearGeometry('settingWheel', { arms: 5, rim: 0.28, hub: 0.5, arm: 0.28 }, 0.1);
  const axle = cylinderY(0.1, KEYLESS.settingWheel.y[0] - 0.02, y0 + 0.1, 16);
  return { arm: toScene(arm), wheel, axle: toScene(axle) };
}

export interface CorrectorGeometry {
  gear: BufferGeometry;
  /** Three-fingered star (steel) at the height of the ring's teeth. */
  star: BufferGeometry;
}

/** The date corrector (tarih düzeltme çarkı): a small gear below, a three-fingered star above, on one stud. */
export function buildCorrector(): CorrectorGeometry {
  const [y0, y1] = KEYLESS.corrector.y as readonly [number, number];
  // the corrector is not in the shared gear tables (it meshes the setting wheel only at its date station)
  const gear = slab(wheelOutline(KEYLESS.corrector), [circle(0.1, [0, 0], 16).reverse()], y0, y1);
  const sy0 = 0.64;
  const sy1 = 0.72;
  const fingers: BufferGeometry[] = [];
  for (let k = 0; k < KEYLESS.correctorFingers; k++) {
    const a = (2 * Math.PI * k) / KEYLESS.correctorFingers;
    const L = KEYLESS.starLength;
    const pts: P2[] = roundCorners(
      [
        [0.15, -0.28],
        [L - 0.25, -0.17],
        [L, 0],
        [L - 0.25, 0.17],
        [0.15, 0.28],
      ],
      [0, 0.05, 0.06, 0.05, 0],
      true,
      2,
    );
    const finger = slab(pts, [], sy0, sy1, 0.01);
    finger.rotateY(a);
    fingers.push(finger);
  }
  const hub = tubeY(0.1, 0.45, y1, sy1, 20);
  const stud = cylinderY(0.1, PLATE_DIAL, sy1 + 0.04, 16);
  return { gear: toScene(gear), star: toScene(merge([...fingers, hub, stud])) };
}
