import { BufferAttribute, type BufferGeometry, CylinderGeometry } from 'three';
import { subtract } from '../../core/geometry/csg';
import {
  arcPts,
  circlePts,
  extrudeAlongX,
  latheX,
  merge,
  mirrorHalf,
  type P2,
  roundCorners,
  shapeFrom,
} from '../../core/geometry/profile';
import { SPECS } from '../specs';

const R = SPECS.rod;
const DEG = Math.PI / 180;

/**
 * Connecting rod, built in its own frame:
 *   origin = big-end (crankpin) centre, +Y = towards the small end (piston pin
 *   at y = rodLength), X = crank axis direction, Z = lateral.
 * The parting line between rod and cap is the plane y = 0.
 */
export interface RodGeometry {
  rod: BufferGeometry;
  cap: BufferGeometry;
  bolts: BufferGeometry;
  shells: { upper: BufferGeometry; lower: BufferGeometry };
  bush: BufferGeometry;
}

const L = SPECS.rodLength;
const Rb = R.bearingOuterRadius; // big-end bore
const Ro = R.bigEndOuterRadius;
const bw = R.bossHalfWidth;
const yBoss = R.bossHeight;
const rSmall = R.smallEndOuterDiameter / 2;
const halfT = R.bigEndWidth / 2;
const aBoss = Math.asin(yBoss / Ro);
const zBossArc = Ro * Math.cos(aBoss);

/** Rod body side outline (z, y) in the rod frame, including the concave big-end bore. */
export function rodBodyOutline(): P2[] {
  // right half (z ≥ 0), walking up from the parting line
  const shankBottom: P2 = [R.beamWidthBottom / 2, 34];
  const shankTop: P2 = [R.beamWidthTop / 2, L - rSmall - 4];
  // Point on the small-end circle where the shank blends in.
  const aSmallStart = -55 * DEG;
  const right: P2[] = [];
  const rr: number[] = [];
  const push = (p: P2, r = 0) => {
    right.push(p);
    rr.push(r);
  };
  push([Rb, 0]);
  push([bw, 0], -1.2);
  push([bw, yBoss], -2);
  push([zBossArc, yBoss], 3);
  for (const p of arcPts(0, 0, Ro, aBoss + 4 * DEG, 52 * DEG, 8)) push(p);
  push(shankBottom, 10);
  push(shankTop, 9);
  for (const p of arcPts(0, L, rSmall, aSmallStart, 90 * DEG, 14)) push(p);
  const body = roundCorners(mirrorHalf(right), mirrorRadii(rr), true, 6);
  // Big-end bore: replace the straight segment between ±Rb by a concave arc over the top.
  return closeBigEnd(body, Rb);
}

/** Rod cap side outline (z, y) in the rod frame. */
export function rodCapOutline(): P2[] {
  const capRight: P2[] = [];
  const cr: number[] = [];
  const cpush = (p: P2, r = 0) => {
    capRight.push(p);
    cr.push(r);
  };
  cpush([0, -Ro]);
  for (const p of arcPts(0, 0, Ro, -90 * DEG, -aBoss - 4 * DEG, 10).slice(1)) cpush(p);
  cpush([zBossArc, -yBoss], 3);
  cpush([bw, -yBoss], -2);
  cpush([bw, 0], -1.2);
  cpush([Rb, 0]);
  // Right outside from the bottom centre up to the bore edge, the concave bore
  // arc across to the left, then the mirrored outside back down.
  const leftOuter = [...capRight].reverse().map(([z, y]) => [-z, y] as P2);
  const leftRadii = [...cr].reverse();
  const borePts = arcPts(0, 0, Rb, 0, -180 * DEG, 24).slice(1, -1);
  const pts = [...capRight.slice(1), ...borePts, ...leftOuter.slice(0, -1), capRight[0]!];
  const rad = [...cr.slice(1), ...borePts.map(() => 0), ...leftRadii.slice(0, -1), 0];
  return roundCorners(pts, rad, true, 6);
}

/**
 * Every outline point of the rod + cap + bolt heads in the rod frame. Used by
 * the clearance tests to sweep the big end through a full cycle.
 */
export function rodEnvelope(): P2[] {
  const headR = R.boltHeadDiameter / 2 / Math.cos(Math.PI / 6);
  const yHead = -yBoss - R.boltHeadHeight;
  const heads: P2[] = [];
  for (const s of [-1, 1]) {
    for (const dz of [-headR, headR]) heads.push([s * R.boltOffset + dz, yHead]);
  }
  return [...rodBodyOutline(), ...rodCapOutline(), ...heads];
}

export function buildConnectingRod(): RodGeometry {
  const bodyPts = rodBodyOutline();
  const bushHole = circlePts(0, L, R.bushOuterRadius, 48, true);
  let rod = extrudeAlongX(shapeFrom(bodyPts, [bushHole]), -halfT, halfT, 0.8, 32);

  // I-beam pockets on both faces.
  const pocket: P2[] = roundCorners(
    [
      [R.beamWidthBottom / 2 - R.flangeThickness - 1, 38],
      [R.beamWidthTop / 2 - R.flangeThickness, L - rSmall - 8],
      [-(R.beamWidthTop / 2 - R.flangeThickness), L - rSmall - 8],
      [-(R.beamWidthBottom / 2 - R.flangeThickness - 1), 38],
    ],
    [6, 4, 4, 6],
    true,
    6,
  );
  const pShape = shapeFrom(pocket);
  const web = R.webThickness / 2;
  rod = subtract(rod, [
    extrudeAlongX(pShape, web, halfT + 4, 1.4, 12),
    extrudeAlongX(pShape, -halfT - 4, -web, 1.4, 12),
  ]);

  // ---- cap ----
  const cap = extrudeAlongX(shapeFrom(rodCapOutline()), -halfT, halfT, 0.8, 32);

  // ---- rod bolts (heads under the cap) ----
  const bolts: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const z = side * R.boltOffset;
    const shank = new CylinderGeometry(R.boltDiameter / 2, R.boltDiameter / 2, 2 * yBoss + 6, 20);
    shank.translate(0, 3, z);
    const head = new CylinderGeometry(R.boltHeadDiameter / 2 / Math.cos(Math.PI / 6), R.boltHeadDiameter / 2 / Math.cos(Math.PI / 6), R.boltHeadHeight, 6);
    head.rotateY(Math.PI / 6);
    head.translate(0, -yBoss - R.boltHeadHeight / 2, z);
    const washerFace = new CylinderGeometry(R.boltHeadDiameter / 2 + 0.6, R.boltHeadDiameter / 2 + 0.6, 1, 28);
    washerFace.translate(0, -yBoss - 0.5, z);
    bolts.push(shank, head, washerFace);
  }

  // ---- bearing shells and small-end bush ----
  const pinR = SPECS.crank.pinDiameter / 2 + 0.03;
  const shell = (upper: boolean) => {
    const g = latheX(
      [
        [pinR, -halfT + 0.6],
        [Rb - 0.02, -halfT + 0.6],
        [Rb - 0.02, halfT - 0.6],
        [pinR, halfT - 0.6],
        [pinR, -halfT + 0.6],
      ],
      48,
    );
    return halfOf(g, upper);
  };
  const bushR = SPECS.piston.pinDiameter / 2 + 0.02;
  const bush = latheX(
    [
      [bushR, -halfT + 0.3],
      [R.bushOuterRadius - 0.02, -halfT + 0.3],
      [R.bushOuterRadius - 0.02, halfT - 0.3],
      [bushR, halfT - 0.3],
      [bushR, -halfT + 0.3],
    ],
    48,
  );
  bush.translate(0, L, 0);

  return {
    rod,
    cap,
    bolts: merge(bolts),
    shells: { upper: shell(true), lower: shell(false) },
    bush,
  };
}

/** Radii array for a mirrored outline produced by mirrorHalf(right). */
function mirrorRadii(rr: number[]): number[] {
  // mirrorHalf drops the duplicated axis point at the join (top of the small end).
  const left = [...rr].reverse();
  return [...rr, ...left.slice(1)];
}

/**
 * The mirrored body outline runs …(−Rb,0) → (Rb,0) along a straight bottom
 * edge. Insert the concave big-end arc between those two points.
 */
function closeBigEnd(pts: P2[], Rb: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    out.push(p);
    const q = pts[(i + 1) % pts.length]!;
    if (Math.abs(p[0] + Rb) < 1e-6 && Math.abs(p[1]) < 1e-6 && Math.abs(q[0] - Rb) < 1e-6 && Math.abs(q[1]) < 1e-6) {
      for (const a of arcPts(0, 0, Rb, Math.PI, 0, 28).slice(1, -1)) out.push(a);
    }
  }
  return out;
}

/** Keep only the triangles of a closed lathe that lie on one side of y = 0. */
function halfOf(g: BufferGeometry, upper: boolean): BufferGeometry {
  const pos = g.getAttribute('position');
  const keep: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    if (upper ? cy > 0 : cy < 0) keep.push(i);
  }
  const out = g.clone();
  for (const name of Object.keys(out.attributes)) {
    const a = out.getAttribute(name);
    const s = a.itemSize;
    const src = a.array as Float32Array;
    const dst = new Float32Array(keep.length * 3 * s);
    keep.forEach((v, k) => dst.set(src.subarray(v * s, (v + 3) * s), k * 3 * s));
    out.setAttribute(name, new BufferAttribute(dst, s));
  }
  return out;
}
