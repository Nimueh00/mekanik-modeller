import { BoxGeometry, type BufferGeometry, CylinderGeometry } from 'three';
import { intersect } from '../../core/geometry/csg';
import { beltPath, type BeltPath, type PathCircle, pointAt, tangentLine, type V2 } from '../../core/geometry/beltPath';
import { buildSprocket, sprocketPitchRadius } from '../../core/geometry/gear';
import {
  arcPts,
  circlePts,
  convexHull,
  extrudeAlongX,
  latheX,
  merge,
  type P2,
  roundCorners,
  shapeFrom,
} from '../../core/geometry/profile';
import { CAM_CENTRE } from '../headLayout';
import { SPECS } from '../specs';
import { CRANK_STATIONS } from './crankshaft';

/*
 * Timing drive: crank sprocket (21 T) → chain → two cam sprockets (42 T).
 *
 * Everything lives in the chain plane x = CHAIN_X; 2D points are (z, y)
 * (shape coordinates of `extrudeAlongX`), angles are measured from +z
 * towards +y. In that plane the engine turns clockwise (seen from the
 * front), i.e. a part rotated by `rotation.x = a` moves its features by −a.
 *
 * The chain loop (counter-clockwise path order):
 *   crank → fixed guide (tight, exhaust side) → exhaust cam → intake cam
 *   → tensioner shoe (slack, intake side) → crank
 * The chain itself runs the other way (clockwise), so the exhaust-side span
 * is pulled by the crank (tight) and the intake-side span is the slack one.
 */

const TD = SPECS.timingDrive;
const P = TD.chainPitch;
export const CHAIN_X = CRANK_STATIONS.sprocketX;

export const CRANK_PITCH_R = sprocketPitchRadius(TD.crankTeeth, P);
export const CAM_PITCH_R = sprocketPitchRadius(TD.camTeeth, P);
/** Chain travel (mm) per radian of each sprocket: one pitch per tooth. */
const LPR_CRANK = (TD.crankTeeth * P) / (2 * Math.PI);
const LPR_CAM = (TD.camTeeth * P) / (2 * Math.PI);

export const CHAIN_LINKS = 132;
const GUIDE_R = 320; // tight-side guide radius (pitch line)
const GUIDE_PUSH = 26; // how far the fixed guide bows the tight span inwards
const SHOE_R = 240; // tensioner shoe radius (pitch line)

const CRANK_C: V2 = [0, 0];
const EX_C: V2 = [CAM_CENTRE.exhaust.z, CAM_CENTRE.exhaust.y];
const IN_C: V2 = [CAM_CENTRE.intake.z, CAM_CENTRE.intake.y];

const crank: PathCircle = { c: CRANK_C, r: CRANK_PITCH_R, lengthPerRad: LPR_CRANK };
const exCam: PathCircle = { c: EX_C, r: CAM_PITCH_R, lengthPerRad: LPR_CAM };
const inCam: PathCircle = { c: IN_C, r: CAM_PITCH_R, lengthPerRad: LPR_CAM };

/** A guide circle (negative radius) bowing the straight span A→B inwards by `push`, centred at `at` along the span. */
function bowCircle(A: PathCircle, B: PathCircle, R: number, push: number, at: number): PathCircle {
  const { a, b } = tangentLine(A, B);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  // outward = right of travel for a counter-clockwise loop
  const nx = dy / l;
  const ny = -dx / l;
  const mx = a[0] + dx * at;
  const my = a[1] + dy * at;
  return { c: [mx + nx * (R - push), my + ny * (R - push)], r: -R };
}

export function loop(shoePush: number): BeltPath {
  const guide = bowCircle(crank, exCam, GUIDE_R, GUIDE_PUSH, 0.5);
  const shoe = bowCircle(inCam, crank, SHOE_R, shoePush, 0.5);
  return beltPath([crank, guide, exCam, inCam, shoe]);
}

/** Solve the shoe position so the loop is exactly CHAIN_LINKS pitches long (the tensioner's job). */
export const CHAIN_PATH: BeltPath = (() => {
  const target = CHAIN_LINKS * P;
  let lo = 0;
  let hi = 60;
  if (loop(lo).length > target) throw new Error('timing chain: too few links for the sprocket layout');
  const len = (push: number) => {
    try {
      return loop(push).length;
    } catch {
      return Infinity; // shoe pushed so far that the path folds over a sprocket
    }
  };
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (len(mid) < target) lo = mid;
    else hi = mid;
  }
  if (!Number.isFinite(len(lo))) throw new Error('timing chain: shoe cannot take up the slack');
  return loop(lo);
})();

export const PATH_INDEX = { crank: 0, guide: 1, exhaust: 2, intake: 3, shoe: 4 } as const;

function arcOf(circle: number) {
  const g = CHAIN_PATH.segments.find((s) => s.kind === 'arc' && s.circle === circle);
  if (!g || g.kind !== 'arc') throw new Error('no arc');
  return g;
}

/** Chain travel (mm along the path) for a crank angle: one pitch per crank-sprocket tooth. */
export function chainTravel(crankAngleDeg: number): number {
  return ((crankAngleDeg * Math.PI) / 180) * LPR_CRANK;
}

/**
 * Pin k sits at path parameter s_k = S_OFFSET + k·P − travel. S_OFFSET puts a
 * pin exactly on a crank-sprocket tooth seat at crank angle 0 (seats are at
 * angles 2πj/21 − θ).
 */
const S_OFFSET = (() => {
  const a = arcOf(PATH_INDEX.crank);
  return a.s0 - a.from * LPR_CRANK;
})();

/** Tooth phase of a cam sprocket (radians, at cam rotation 0) that seats the rollers on that arc. */
export function camSprocketPhase(kind: 'intake' | 'exhaust'): number {
  const a = arcOf(PATH_INDEX[kind]);
  return a.from + (S_OFFSET - a.s0) / LPR_CAM;
}

export interface ChainPin {
  /** (z, y) in the chain plane. */
  p: [number, number];
  circle: number;
  angle: number;
}

/** Positions of all chain pins at a crank angle. */
export function chainPins(crankAngleDeg: number): ChainPin[] {
  const t = chainTravel(crankAngleDeg);
  const out: ChainPin[] = [];
  for (let k = 0; k < CHAIN_LINKS; k++) out.push(pointAt(CHAIN_PATH, S_OFFSET + k * P - t));
  return out;
}

// ------------------------------------------------------------------ geometry

const W = TD.rollerWidth;
const T = TD.plateThickness;
const INNER_X = W / 2 + T / 2;
const OUTER_X = W / 2 + T + 0.05 + T / 2;

/** Figure-of-eight link plate outline in the (z, y) shape plane: pins at y = 0 and y = P. */
function plateOutline(): P2[] {
  const rho = TD.plateDepth / 2;
  const waist = rho - 0.75;
  const top: P2[] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const y = -rho + ((P + 2 * rho) * i) / n;
    const c0 = Math.abs(y) <= rho ? Math.sqrt(rho * rho - y * y) : 0;
    const c1 = Math.abs(y - P) <= rho ? Math.sqrt(rho * rho - (y - P) * (y - P)) : 0;
    const t = (y - P / 2) / (P / 2);
    const wv = y > 0 && y < P ? waist + (rho - waist) * t * t * t * t : 0;
    top.push([Math.max(c0, c1, wv, 0.001), y]);
  }
  const bottom = [...top].reverse().map(([z, y]) => [-z, y] as P2);
  return [...top, ...bottom.slice(1, -1)];
}

export interface ChainGeometry {
  /** Pair of inner plates (one roller link), local frame: pins on the Y axis at 0 and P. */
  innerPlates: BufferGeometry;
  outerPlates: BufferGeometry;
  /** Roller + riveted pin, centred on a pin. */
  joint: BufferGeometry;
}

export function buildChainLink(): ChainGeometry {
  const plate = shapeFrom(plateOutline());
  const inner = merge([
    extrudeAlongX(plate, -INNER_X - T / 2, -INNER_X + T / 2, 0, 2),
    extrudeAlongX(plate, INNER_X - T / 2, INNER_X + T / 2, 0, 2),
  ]);
  const outer = merge([
    extrudeAlongX(plate, -OUTER_X - T / 2, -OUTER_X + T / 2, 0, 2),
    extrudeAlongX(plate, OUTER_X - T / 2, OUTER_X + T / 2, 0, 2),
  ]);
  const rr = TD.rollerDiameter / 2;
  const roller = latheX(
    [
      [1.6, -W / 2 + 0.05],
      [rr - 0.25, -W / 2 + 0.05],
      [rr, -W / 2 + 0.3],
      [rr, W / 2 - 0.3],
      [rr - 0.25, W / 2 - 0.05],
      [1.6, W / 2 - 0.05],
      [1.6, -W / 2 + 0.05],
    ],
    14,
  );
  const xe = OUTER_X + T / 2;
  const pin = latheX(
    [
      [0, -xe - 0.5],
      [0.9, -xe - 0.5],
      [1.3, -xe - 0.2],
      [1.3, xe + 0.2],
      [0.9, xe + 0.5],
      [0, xe + 0.5],
    ],
    10,
  );
  return { innerPlates: inner, outerPlates: outer, joint: merge([roller, pin]) };
}

export interface SprocketSet {
  crank: BufferGeometry;
  /** Cam sprockets in the cam frame (origin on the cam axis). */
  intake: BufferGeometry;
  exhaust: BufferGeometry;
}

export function buildSprockets(): SprocketSet {
  const base = {
    pitch: P,
    rollerDiameter: TD.rollerDiameter,
    toothWidth: TD.toothWidth,
    x: CHAIN_X,
  };
  const crankS = buildSprocket({
    ...base,
    teeth: TD.crankTeeth,
    boreRadius: SPECS.crank.nose.sprocketSeatDiameter / 2,
    hub: { radius: 21, width: SPECS.crank.sprocket.width },
  });
  const cam = (kind: 'intake' | 'exhaust') => {
    const g = buildSprocket({
      ...base,
      teeth: TD.camTeeth,
      boreRadius: 10,
      hub: { radius: 19, width: 14 },
      web: { width: 5, holes: 5, holeRadius: 9 },
      phase: camSprocketPhase(kind),
    });
    // centre bolt and washer
    const bolt = latheX(
      [
        [0, CHAIN_X - 7 - 6],
        [9, CHAIN_X - 7 - 6],
        [9, CHAIN_X - 7 - 2],
        [13, CHAIN_X - 7 - 2],
        [13, CHAIN_X - 7],
        [0, CHAIN_X - 7],
      ],
      6,
    );
    return merge([g, bolt]);
  };
  return { crank: crankS, intake: cam('intake'), exhaust: cam('exhaust') };
}

export interface GuideGeometry {
  facings: BufferGeometry;
  backing: BufferGeometry;
  tensioner: BufferGeometry;
}

/** Band along a guide circle's contact arc, between radii r0 and r1 from its centre. */
function arcBand(circle: number, r0: number, r1: number, extend: number, x0: number, x1: number): BufferGeometry {
  const a = arcOf(circle);
  const C = CHAIN_PATH.circles[circle]!;
  const R = Math.abs(C.r);
  const ext = extend / R;
  const lo = Math.min(a.from, a.from + a.sweep) - ext;
  const hi = Math.max(a.from, a.from + a.sweep) + ext;
  const outer = arcPts(C.c[0], C.c[1], r1, lo, hi, 48);
  const inner = arcPts(C.c[0], C.c[1], r0, hi, lo, 48);
  return extrudeAlongX(shapeFrom([...outer, ...inner]), x0, x1, 0.4, 2);
}

const SHOE_FACE = TD.plateDepth / 2 + 0.25;
/** Shoe arc parameter (0…1 over the shoe) of the pivot: the end nearer the crank. */
const SHOE_PIVOT_T = arcOf(PATH_INDEX.shoe).sweep < 0 ? 0.08 : 0.92;

/** Point at fraction t along a guide's contact arc (extended 30 mm each way), `off` mm behind its face. */
function alongGuide(circle: number, t: number, off: number): V2 {
  const a = arcOf(circle);
  const C = CHAIN_PATH.circles[circle]!;
  const R = Math.abs(C.r);
  const ext = 30 / R;
  const lo = Math.min(a.from, a.from + a.sweep) - ext;
  const hi = Math.max(a.from, a.from + a.sweep) + ext;
  const ang = lo + (hi - lo) * t;
  const rr = R - SHOE_FACE - off;
  return [C.c[0] + Math.cos(ang) * rr, C.c[1] + Math.sin(ang) * rr];
}

/** Plunger contact on the back of the shoe arm (upper part) and the direction away from the chain. */
function tensionerPlacement(): { at: V2; u: V2 } {
  const t = SHOE_PIVOT_T + (1 - 2 * SHOE_PIVOT_T) * 0.72;
  const at = alongGuide(PATH_INDEX.shoe, t, 11);
  const C = CHAIN_PATH.circles[PATH_INDEX.shoe]!;
  const dx = C.c[0] - at[0];
  const dy = C.c[1] - at[1];
  const l = Math.hypot(dx, dy);
  return { at, u: [dx / l, dy / l] };
}

/** Fixed guide (tight side), tensioner arm with its shoe (slack side), hydraulic tensioner. */
export function buildGuides(): GuideGeometry {
  const face = SHOE_FACE; // pitch line → plate edge clearance
  const fw = 5.5;
  const bw = 4;
  const facings = merge([
    arcBand(PATH_INDEX.guide, GUIDE_R - face - 3.5, GUIDE_R - face, 30, CHAIN_X - fw, CHAIN_X + fw),
    arcBand(PATH_INDEX.shoe, SHOE_R - face - 3.5, SHOE_R - face, 30, CHAIN_X - fw, CHAIN_X + fw),
  ]);
  const backing: BufferGeometry[] = [
    arcBand(PATH_INDEX.guide, GUIDE_R - face - 10, GUIDE_R - face - 3.5, 34, CHAIN_X - bw, CHAIN_X + bw),
    arcBand(PATH_INDEX.shoe, SHOE_R - face - 11, SHOE_R - face - 3.5, 34, CHAIN_X - bw, CHAIN_X + bw),
  ];

  // mounting bosses: two on the fixed guide, the pivot at the lower end of the shoe arm
  const boss = (p: V2, r: number) => {
    const b = new CylinderGeometry(r, r, 14, 24);
    b.rotateZ(Math.PI / 2);
    b.translate(CHAIN_X + 3, p[1], p[0]);
    return b;
  };
  backing.push(boss(alongGuide(PATH_INDEX.guide, 0.12, 13), 6), boss(alongGuide(PATH_INDEX.guide, 0.88, 13), 6));
  // the shoe arm pivots at the end nearer the crank
  backing.push(boss(alongGuide(PATH_INDEX.shoe, SHOE_PIVOT_T, 14), 7.5));

  const { at, u } = tensionerPlacement();
  const tensioner = buildTensioner(at, u);

  return { facings, backing: merge(backing), tensioner };
}

/** Plunger + body with mounting flange; `at` = plunger tip on the shoe arm, `u` = direction away from the chain. */
function buildTensioner(at: V2, u: V2): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const cyl = (r: number, from: number, to: number, segs = 32) => {
    const c = new CylinderGeometry(r, r, to - from, segs);
    c.translate(0, (from + to) / 2, 0);
    return c;
  };
  parts.push(cyl(3.2, 0, 16), cyl(11, 16, 54), cyl(9, 54, 58));
  const ear = new CylinderGeometry(6, 6, 10, 20);
  ear.rotateZ(Math.PI / 2);
  ear.translate(0, 30, 15);
  const ear2 = ear.clone();
  ear2.translate(0, 0, -30);
  parts.push(ear, ear2);
  const g = merge(parts);
  // local +Y → u (in the (z, y) plane), local X stays world X
  const a = Math.atan2(u[0], u[1]); // rotation about X carrying +Y to (y=u[1], z=u[0])
  g.rotateX(a);
  g.translate(CHAIN_X, at[1], at[0]);
  return g;
}

export interface TimingCaseGeometry {
  /** Part cast with the block (below the deck). */
  lower: BufferGeometry;
  /** Part cast with the head. */
  upper: BufferGeometry;
}

/**
 * Rear wall of the timing case: a cast plate on the front faces of the block
 * and head, behind the chain plane. The guides and the tensioner bolt to it.
 * Its outline is the convex hull of the sprockets and the guide backs.
 */
export function buildTimingCase(splitY: number): TimingCaseGeometry {
  const pts: P2[] = [];
  const ring = (c: V2, r: number) => {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
    }
  };
  ring(CRANK_C, 44);
  ring(EX_C, CAM_PITCH_R + 12);
  ring(IN_C, CAM_PITCH_R + 12);
  for (const circle of [PATH_INDEX.guide, PATH_INDEX.shoe]) {
    const a = arcOf(circle);
    const C = CHAIN_PATH.circles[circle]!;
    const R = Math.abs(C.r) - 22;
    const ext = 40 / Math.abs(C.r);
    const lo = Math.min(a.from, a.from + a.sweep) - ext;
    const hi = Math.max(a.from, a.from + a.sweep) + ext;
    for (let i = 0; i <= 12; i++) {
      const t = lo + ((hi - lo) * i) / 12;
      pts.push([C.c[0] + Math.cos(t) * R, C.c[1] + Math.sin(t) * R]);
    }
  }
  const { at, u } = tensionerPlacement();
  for (const s of [16, 58]) for (const w of [-17, 17]) pts.push([at[0] + u[0] * s - u[1] * w, at[1] + u[1] * s + u[0] * w]);
  const hull = convexHull(pts);
  const outline = roundCorners(hull, hull.map(() => 0), true);
  const hole = (c: V2, r: number) => circlePts(c[0], c[1], r, 48, true);
  const x0 = CHAIN_X + 5;
  const x1 = SPECS.block.halfLength * -1 + 0.5;
  const plate = extrudeAlongX(shapeFrom(outline, [hole(CRANK_C, 22), hole(EX_C, 13), hole(IN_C, 13)]), x0, x1, 0.8, 8);
  const lowBox = new BoxGeometry(100, 2000, 2000);
  lowBox.translate((x0 + x1) / 2, splitY - 1000, 0);
  const highBox = new BoxGeometry(100, 2000, 2000);
  highBox.translate((x0 + x1) / 2, splitY + 1000, 0);
  return { lower: intersect(plate, [lowBox], 35), upper: intersect(plate, [highBox], 35) };
}
