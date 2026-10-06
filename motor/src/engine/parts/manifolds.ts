import { type BufferGeometry, CubicBezierCurve3, CylinderGeometry, LineCurve3, Vector3 } from 'three';
import { subtract, union } from '../../core/geometry/csg';
import { extrudeAlongZ, latheX, merge, type P2, roundCorners, shapeFrom } from '../../core/geometry/profile';
import { sweepTube } from '../../core/geometry/sweep';
import { CYLINDER_X, SPECS } from '../specs';
import { PORT } from './cylinderHead';

/*
 * Intake and exhaust manifolds, bolted to the port faces of the head.
 *
 *   Intake (−Z): flange → four curved runners rising to a plenum along the
 *   engine, throttle body at the timing end. Cast aluminium.
 *   Exhaust (+Z): flange → four primaries sweeping down and together into a
 *   single collector (4-into-1), outlet flange underneath. Cast iron.
 *
 * Both are hollow (CSG), so the section view shows the passages. The centre
 * lines are exported for the gas-flow particles (gasFlow.ts).
 */

const SIDE = SPECS.head.topHalfWidth; // port face of the head, |z|
const FLANGE_T = 10;

export const MANIFOLD = {
  intake: { wall: 3, innerR: 15, plenum: { y: 336, z: -240, r: 40, x0: -168, x1: 166 }, throttle: { r: 27, length: 46 } },
  exhaust: { wall: 3.2, innerR: 13, collector: { x: 24, z: 180, top: 172, bottom: 44, r: 24 } },
} as const;

/** Intake runner centre line of a cylinder: t = 0 at the flange face, t = 1 inside the plenum. */
export function intakeRunner(cylinder: number): CubicBezierCurve3 {
  const cx = CYLINDER_X[cylinder]!;
  const P = MANIFOLD.intake.plenum;
  const y0 = PORT.intake.exitY;
  return new CubicBezierCurve3(
    new Vector3(cx, y0, -SIDE - 2),
    new Vector3(cx, y0, -SIDE - 72),
    new Vector3(cx, y0 + 30, P.z + 26),
    new Vector3(cx * 0.94, P.y - 4, P.z),
  );
}

/** Exhaust primary centre line of a cylinder: t = 0 at the flange face, t = 1 inside the collector. */
export function exhaustPrimary(cylinder: number): CubicBezierCurve3 {
  const cx = CYLINDER_X[cylinder]!;
  const C = MANIFOLD.exhaust.collector;
  const y0 = PORT.exhaust.exitY;
  const k = cylinder - (SPECS.cylinders - 1) / 2; // −1.5 … 1.5
  return new CubicBezierCurve3(
    new Vector3(cx, y0, SIDE + 2),
    new Vector3(cx, y0, SIDE + 58),
    new Vector3(cx * 0.55 + C.x * 0.45, y0 - 40, C.z + 6),
    new Vector3(C.x + k * 9, C.top - 14, C.z + Math.abs(k) * 2 - 2),
  );
}

export interface ManifoldGeometry {
  body: BufferGeometry;
  hardware: BufferGeometry;
}

/** Flange plate on a port face, with one port hole per cylinder. */
function flange(sign: 1 | -1, y: number, holeR: number): { plate: BufferGeometry; holes: BufferGeometry[]; nuts: BufferGeometry[] } {
  const half = SPECS.cylinderSpacing * 1.5 + 30;
  const h = 26;
  const outline: P2[] = roundCorners(
    [
      [-half, y - h],
      [half, y - h],
      [half, y + h],
      [-half, y + h],
    ],
    [8, 8, 8, 8],
    true,
  );
  const z0 = sign > 0 ? SIDE + 0.2 : -SIDE - FLANGE_T - 0.2;
  const plate = extrudeAlongZ(shapeFrom(outline), z0, z0 + FLANGE_T, 0.8, 6);
  const holes: BufferGeometry[] = [];
  const nuts: BufferGeometry[] = [];
  for (const cx of CYLINDER_X) {
    const hole = new CylinderGeometry(holeR, holeR, 40, 40);
    hole.rotateX(Math.PI / 2);
    hole.translate(cx, y, sign * (SIDE + 5));
    holes.push(hole);
    // two studs + nuts per port, above and below
    for (const dy of [-19, 19]) {
      const nut = new CylinderGeometry(6.5, 6.5, 7, 6);
      nut.rotateX(Math.PI / 2);
      nut.translate(cx + (dy > 0 ? 22 : -22), y + dy, sign * (SIDE + FLANGE_T + 3.7));
      nuts.push(nut);
    }
  }
  return { plate, holes, nuts };
}

export function buildIntakeManifold(): ManifoldGeometry {
  const M = MANIFOLD.intake;
  const P = M.plenum;
  const outerR = M.innerR + M.wall;
  const f = flange(-1, PORT.intake.exitY, M.innerR);
  const runners = CYLINDER_X.map((_, i) => sweepTube(intakeRunner(i), () => outerR, 40, 28));
  const innerRunners = CYLINDER_X.map((_, i) => sweepTube(intakeRunner(i), () => M.innerR, 40, 28));

  // plenum: a horizontal drum with domed ends (lathe about X)
  const drum = (r: number, x0: number, x1: number): BufferGeometry => {
    const prof: P2[] = []; // [radius, x], axis to axis
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      prof.push([r * Math.sin(a), x0 - r * 0.35 * Math.cos(a)]);
    }
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      prof.push([r * Math.cos(a), x1 + r * 0.35 * Math.sin(a)]);
    }
    const g = latheX(prof, 48);
    g.translate(0, P.y, P.z);
    return g;
  };
  const plenum = drum(P.r, P.x0, P.x1);
  const plenumIn = drum(P.r - M.wall, P.x0 + 1, P.x1 - 1);

  // throttle body at the timing end (−X), with its mounting flange
  const T = M.throttle;
  const tb = new CylinderGeometry(T.r + 3, T.r + 3, T.length, 48);
  tb.rotateZ(Math.PI / 2);
  tb.translate(P.x0 - P.r * 0.2 - T.length / 2, P.y, P.z);
  const tbFlange = new CylinderGeometry(T.r + 9, T.r + 9, 7, 48);
  tbFlange.rotateZ(Math.PI / 2);
  tbFlange.translate(P.x0 - P.r * 0.2 - T.length + 3.5, P.y, P.z);
  const tbBore = new CylinderGeometry(T.r, T.r, T.length + 60, 48);
  tbBore.rotateZ(Math.PI / 2);
  tbBore.translate(P.x0 - T.length / 2, P.y, P.z);
  // throttle plate (butterfly) and shaft, part open
  const plate = new CylinderGeometry(T.r - 0.6, T.r - 0.6, 1.4, 40);
  plate.rotateZ(Math.PI / 2);
  plate.rotateY(0.45);
  plate.translate(P.x0 - P.r * 0.2 - T.length / 2, P.y, P.z);
  const shaft = new CylinderGeometry(2.2, 2.2, 2 * T.r + 14, 16);
  shaft.translate(P.x0 - P.r * 0.2 - T.length / 2, P.y, P.z);

  const solid = union(f.plate, [...runners, plenum, tb, tbFlange]);
  const body = subtract(solid, [...f.holes, ...innerRunners, plenumIn, tbBore], 35);
  return { body, hardware: merge([...f.nuts, plate, shaft]) };
}

export function buildExhaustManifold(): ManifoldGeometry {
  const M = MANIFOLD.exhaust;
  const C = M.collector;
  const outerR = M.innerR + M.wall;
  const f = flange(1, PORT.exhaust.exitY, M.innerR);
  const prim = CYLINDER_X.map((_, i) => sweepTube(exhaustPrimary(i), () => outerR, 40, 28));
  const primIn = CYLINDER_X.map((_, i) => sweepTube(exhaustPrimary(i), () => M.innerR, 40, 28));

  const coll = sweepTube(new LineCurve3(new Vector3(C.x, C.top, C.z), new Vector3(C.x, C.bottom, C.z + 4)), (t) => C.r + 4 * t, 4, 40);
  const collIn = sweepTube(
    new LineCurve3(new Vector3(C.x, C.top - 6, C.z), new Vector3(C.x, C.bottom - 20, C.z + 4.6)),
    (t) => C.r - M.wall + 4 * t,
    4,
    40,
  );
  const outlet = new CylinderGeometry(C.r + 16, C.r + 16, 8, 48);
  outlet.translate(C.x, C.bottom + 4, C.z + 4);

  const solid = union(f.plate, [...prim, coll, outlet]);
  const body = subtract(solid, [...f.holes, ...primIn, collIn], 35);
  // outlet flange studs
  const studs: BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    const n = new CylinderGeometry(6, 6, 7, 6);
    n.translate(C.x + Math.cos(a) * (C.r + 10), C.bottom - 3.5, C.z + 4 + Math.sin(a) * (C.r + 10));
    studs.push(n);
  }
  return { body, hardware: merge([...f.nuts, ...studs]) };
}
