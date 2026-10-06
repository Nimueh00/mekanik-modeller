import { type BufferGeometry, CylinderGeometry, Matrix4, Vector3 } from 'three';
import { subtract, union } from '../../core/geometry/csg';
import {
  circlePts,
  convexHull,
  extrudeAlongX,
  latheX,
  latheY,
  merge,
  type P2,
  roundCorners,
  shapeFrom,
} from '../../core/geometry/profile';
import { SPECS } from '../specs';

const P = SPECS.piston;
const DEG = Math.PI / 180;

/** Bore radius; ring faces run on this. */
const BORE_R = SPECS.bore / 2;

/**
 * Piston geometry in its own frame: origin = piston-pin centre, +Y = crown,
 * X = pin axis (parallel to the crank). Intake side is −Z, exhaust side +Z.
 */
export interface PistonGeometry {
  body: BufferGeometry;
  pin: BufferGeometry;
  rings: { compression: BufferGeometry; oil: BufferGeometry };
}

/** Crown height above the pin centre at radius r (spherical-cap dome). */
export function crownHeightAt(r: number): number {
  const c = P.diameter / 2 - 1.2; // dome footprint radius
  const h = P.crownDome;
  const Rs = (c * c + h * h) / (2 * h);
  const rr = Math.min(r, c);
  return P.compressionHeight + h - (Rs - Math.sqrt(Rs * Rs - rr * rr));
}

export function buildPiston(): PistonGeometry {
  const Rsk = P.diameter / 2;
  const Rland = Rsk - 0.15; // ring lands run slightly smaller than the skirt
  const Rtop = Rsk - 0.3; // top land is hottest → most clearance
  const H = P.compressionHeight;
  const yBot = -P.skirtBelowPin;
  const crownUnder = H - 7;
  const RiSkirt = Rsk - 3;

  // Grooves, top to bottom, as [yLow, yHigh, depth]
  const grooves = P.rings.map((g) => [H - g.y - g.h / 2, H - g.y + g.h / 2, g.depth] as const);
  const [g1, g2, g3] = grooves as unknown as [typeof grooves[0], typeof grooves[0], typeof grooves[0]];

  // ---- turned body: walk inner top → under crown → inner wall → bottom → outer wall up → dome ----
  const inner: P2[] = [
    [0, crownUnder],
    [32, crownUnder],
    [32, g3[0] - 4],
    [RiSkirt, g3[0] - 11],
    [RiSkirt, yBot],
  ];
  const innerR = [0, 5, 4, 4, 0];
  const outer: P2[] = [
    [Rsk, yBot],
    [Rsk, g3[0] - 2],
    [Rland, g3[0] - 1.5],
    [Rland, g3[0]],
    [Rsk - g3[2], g3[0]],
    [Rsk - g3[2], g3[1]],
    [Rland, g3[1]],
    [Rland, g2[0]],
    [Rsk - g2[2], g2[0]],
    [Rsk - g2[2], g2[1]],
    [Rland, g2[1]],
    [Rland, g1[0]],
    [Rsk - g1[2], g1[0]],
    [Rsk - g1[2], g1[1]],
    [Rtop, g1[1]],
    [Rtop, H - 0.7],
    [Rtop - 0.7, H],
  ];
  const outerR = outer.map((_, i) => (i === 0 ? -0.6 : 0));
  const dome: P2[] = [];
  const c = Rsk - 1.2;
  for (let i = 0; i <= 16; i++) {
    const r = c * (1 - i / 16);
    dome.push([r, crownHeightAt(r)]);
  }
  const profile = [...inner, ...outer, ...dome];
  const radii = [...innerR, ...outerR, ...dome.map(() => 0)];
  // corner where inner wall meets the skirt bottom, and skirt bottom outer edge
  radii[inner.length - 1] = -0.5;
  let body = latheY(roundCorners(profile, radii, false, 4), 112);

  // ---- pin bosses (inside the skirt, either side of the small end) ----
  const bossPts: P2[] = convexHull([...circlePts(0, 0, 14.5, 32), [-12.5, crownUnder + 1], [12.5, crownUnder + 1]]);
  const bossShape = shapeFrom(roundCorners(bossPts, bossPts.map(() => 3), true, 3));
  const gap = P.pinBossGap / 2;
  body = union(body, [extrudeAlongX(bossShape, gap, RiSkirt + 1.5, 0.8, 24), extrudeAlongX(bossShape, -RiSkirt - 1.5, -gap, 0.8, 24)]);

  // ---- cuts: pin bore, slipper-skirt reliefs, valve pockets, oil-drain holes ----
  const cutters: BufferGeometry[] = [];
  const pinBore = new CylinderGeometry(P.pinDiameter / 2 + 0.01, P.pinDiameter / 2 + 0.01, 2 * Rsk + 10, 48);
  pinBore.rotateZ(Math.PI / 2);
  cutters.push(pinBore);

  for (const side of [-1, 1]) {
    const relief = shapeFrom(
      roundCorners(
        [
          [-60, yBot - 5],
          [60, yBot - 5],
          [60, -12],
          [-60, -12],
        ],
        [0, 0, 0, 0],
        true,
      ),
    );
    const x0 = side > 0 ? Rsk - 7.4 : -Rsk - 10;
    const x1 = side > 0 ? Rsk + 10 : -Rsk + 7.4;
    cutters.push(extrudeAlongX(relief, x0, x1, 0, 4));
  }

  for (const v of valvePockets()) {
    const len = 40;
    const cyl = new CylinderGeometry(v.radius, v.radius, len, 56);
    cyl.translate(0, len / 2, 0);
    const m = new Matrix4().makeRotationX(v.tiltRad);
    cyl.applyMatrix4(m);
    cyl.translate(v.floor.x, v.floor.y, v.floor.z);
    cutters.push(cyl);
  }

  for (let k = 0; k < 8; k++) {
    // oil-drain holes in the oil-ring groove, avoiding the pin axis
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const hole = new CylinderGeometry(1.3, 1.3, 10, 12);
    hole.rotateZ(Math.PI / 2);
    hole.translate(Rsk - g3[2] - 2, (g3[0] + g3[1]) / 2, 0);
    hole.rotateY(a);
    cutters.push(hole);
  }
  // All cutters are mutually disjoint, so one merged brush does the job in a single CSG pass.
  body = subtract(body, [merge(cutters)], 35);

  // ---- piston pin (hollow, chamfered) ----
  const pr = P.pinDiameter / 2;
  const pi = P.pinBoreInner / 2;
  const hl = P.pinLength / 2;
  const pin = latheX(
    [
      [pi, -hl + 0.6],
      [pi + 0.6, -hl],
      [pr - 0.6, -hl],
      [pr, -hl + 0.6],
      [pr, hl - 0.6],
      [pr - 0.6, hl],
      [pi + 0.6, hl],
      [pi, hl - 0.6],
      [pi, -hl + 0.6],
    ],
    40,
  );

  // ---- rings (with a small end gap, like the real thing) ----
  const ringGeom = (yLow: number, yHigh: number, depth: number) => {
    const ri = Rsk - depth + 0.35;
    const ro = BORE_R - 0.02;
    const e = 0.15;
    const prof: P2[] = [
      [ri, yLow + 0.03 + e],
      [ri + e, yLow + 0.03],
      [ro - e, yLow + 0.03],
      [ro, yLow + 0.03 + e],
      [ro, yHigh - 0.03 - e],
      [ro - e, yHigh - 0.03],
      [ri + e, yHigh - 0.03],
      [ri, yHigh - 0.03 - e],
      [ri, yLow + 0.03 + e],
    ];
    const gapRad = 0.5 / BORE_R;
    // Gap placed on the −X side, away from the viewer and off the thrust faces.
    return latheY(prof, 128, -Math.PI / 2 + gapRad / 2, Math.PI * 2 - gapRad);
  };
  const r1 = ringGeom(g1[0], g1[1], g1[2]);
  const r2 = ringGeom(g2[0], g2[1], g2[2]);
  const r3 = ringGeom(g3[0], g3[1], g3[2]);
  r2.rotateY(Math.PI * 0.66); // stagger the gaps
  r3.rotateY(-Math.PI * 0.66);
  const compression = merge([r1, r2]);

  return { body, pin, rings: { compression, oil: r3 } };
}


export interface ValvePocket {
  kind: 'intake' | 'exhaust';
  /** Centre of the pocket floor in the piston frame. */
  floor: Vector3;
  radius: number;
  /** Rotation about +X giving the valve axis direction from +Y. */
  tiltRad: number;
}

/** Valve-relief pockets, shared with phase 2 so the valves line up with them. */
export function valvePockets(): ValvePocket[] {
  const vp = P.valvePocket;
  const halfAngle = SPECS.valveTrain.includedAngleDeg / 2;
  const out: ValvePocket[] = [];
  for (const kind of ['intake', 'exhaust'] as const) {
    const zSign = kind === 'intake' ? -1 : 1;
    const d = kind === 'intake' ? vp.intakeDiameter : vp.exhaustDiameter;
    for (const xs of [-1, 1]) {
      const x = xs * vp.offsetX;
      const z = zSign * vp.offsetZ;
      const y = crownHeightAt(Math.hypot(x, z)) - vp.depth;
      // R_x(α)·(0,1,0) = (0, cosα, sinα): intake (−Z side) leans to −Z, exhaust to +Z.
      out.push({ kind, floor: new Vector3(x, y, z), radius: d / 2, tiltRad: zSign * halfAngle * DEG });
    }
  }
  return out;
}
