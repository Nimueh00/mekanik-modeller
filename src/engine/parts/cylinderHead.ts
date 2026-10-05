import { type BufferGeometry, CubicBezierCurve3, CylinderGeometry, Matrix4, Vector3 } from 'three';
import { intersect, subtract, union } from '../../core/geometry/csg';
import {
  circlePts,
  extrudeAlongX,
  extrudeAlongY,
  latheX,
  latheY,
  merge,
  mirrorHalf,
  type P2,
  roundCorners,
  shapeFrom,
} from '../../core/geometry/profile';
import { sweepTube } from '../../core/geometry/sweep';
import { crease } from '../../core/geometry/profile';
import {
  CAM_CENTRE,
  CAM_JOURNAL_X,
  HEAD_BOLTS,
  HEAD_FACE_Y,
  HEAD_TOP_Y,
  RIDGE_Y,
  SQUISH_EDGE_Z,
  stationPoint,
  VALVES,
  type ValveAxis,
} from '../headLayout';
import { CYLINDER_X, SPECS } from '../specs';

const H = SPECS.head;
const VT = SPECS.valveTrain;
const CAM = SPECS.cam;
const DEG = Math.PI / 180;

/** Geometry built along +Y (lathe), placed on a valve axis with its origin at station 0. */
export function onValveAxis(g: BufferGeometry, v: ValveAxis): BufferGeometry {
  g.applyMatrix4(new Matrix4().makeRotationX(v.tiltRad));
  g.translate(v.face.x, v.face.y, v.face.z);
  return g;
}

/** Injector axis for a cylinder: tip in the intake-port roof, aimed at the backs of the two intake valves. */
export function injectorAxis(cylinder: number): { tip: Vector3; dir: Vector3 } {
  const cx = CYLINDER_X[cylinder]!;
  const iv = VALVES.find((v) => v.kind === 'intake')!;
  const tip = new Vector3(cx, PORT.intake.exitY + 13, -74);
  const target = new Vector3(cx, iv.face.y + 6, iv.face.z - 2);
  return { tip, dir: target.sub(tip).normalize() };
}

/** Port layout: exit height on the side face, trunk / branch / throat radii. */
export const PORT = {
  intake: { exitY: 240, trunkR: 15.5, branchR: 12.5, sign: -1 },
  exhaust: { exitY: 236, trunkR: 13.5, branchR: 11, sign: 1 },
} as const;

export interface PortCurves {
  /** Siamesed trunk, from inside the head (z = ±56) out to the side face. */
  trunk: CubicBezierCurve3;
  trunkRadius: (t: number) => number;
  /** One branch per valve (front, rear), from just below the valve seat to the trunk. */
  branches: { valve: ValveAxis; curve: CubicBezierCurve3; radius: (t: number) => number }[];
}

/** Centre lines of a cylinder's port (shared by the CSG cutter and the gas-flow particles). */
export function portCurves(cylinder: number, kind: 'intake' | 'exhaust'): PortCurves {
  const P = PORT[kind];
  const cx = CYLINDER_X[cylinder]!;
  const zFace = P.sign * (H.topHalfWidth + 6);
  const trunk = new CubicBezierCurve3(
    new Vector3(cx, P.exitY, P.sign * 56),
    new Vector3(cx, P.exitY, P.sign * 70),
    new Vector3(cx, P.exitY, P.sign * 85),
    new Vector3(cx, P.exitY, zFace),
  );
  const branches = VALVES.filter((v) => v.cylinder === cylinder && v.kind === kind).map((v) => {
    const throatR = v.diameter / 2 - 2.5;
    const p0 = stationPoint(v, -2);
    const p1 = stationPoint(v, 20);
    const p2 = new Vector3(v.face.x * 0.7 + cx * 0.3, P.exitY - 1, P.sign * 46);
    const p3 = new Vector3(v.face.x * 0.45 + cx * 0.55, P.exitY, P.sign * 66);
    return {
      valve: v,
      curve: new CubicBezierCurve3(p0, p1, p2, p3),
      radius: (t: number) => throatR + (P.branchR - throatR) * Math.min(1, t * 1.6),
    };
  });
  return { trunk, trunkRadius: (t) => P.trunkR - 1.5 * (1 - t), branches };
}

/** Siamesed port for one cylinder and side: one trunk at the flange, one branch per valve. */
function portCutter(cylinder: number, kind: 'intake' | 'exhaust'): BufferGeometry {
  const pc = portCurves(cylinder, kind);
  const trunk = sweepTube(pc.trunk, pc.trunkRadius, 6, 28);
  const branches = pc.branches.map((b) => sweepTube(b.curve, b.radius, 24, 28));
  return union(trunk, branches);
}

export interface HeadGeometry {
  head: BufferGeometry;
  /** Valve guides (bronze) and hardened spring-seat washers. */
  guides: BufferGeometry;
  gasket: BufferGeometry;
  bolts: BufferGeometry;
}

export function buildCylinderHead(): HeadGeometry {
  const L = H.halfLength;
  const top = HEAD_TOP_Y;
  // ---- body: cross-section (z, y), extruded along the engine ----
  const right: P2[] = [
    [0, HEAD_FACE_Y],
    [H.deckHalfWidth, HEAD_FACE_Y],
    [H.deckHalfWidth, HEAD_FACE_Y + 8],
    [H.topHalfWidth, HEAD_FACE_Y + 30],
    [H.topHalfWidth, top],
    [0, top],
  ];
  const r = [0, -0.8, 6, 6, -1.2, 0];
  const pts = mirrorHalf(right);
  const radii = [...r, ...[...r].reverse().slice(1)];
  radii.length = pts.length;
  let head = extrudeAlongX(shapeFrom(roundCorners(pts, radii, true, 6)), -L, L, 1.5, 16);

  // Injector bosses on the intake wall.
  const bosses: BufferGeometry[] = [];
  for (let c = 0; c < SPECS.cylinders; c++) {
    const { tip, dir } = injectorAxis(c);
    const b = new CylinderGeometry(11, 11, 26, 40);
    b.translate(0, 26, 0); // s = 13 … 39 from the tip, along −dir
    alignY(b, dir.clone().negate(), tip);
    bosses.push(b);
  }
  head = union(head, [merge(bosses)]);

  // ---- G1: combustion chambers, bucket bores / spring wells, head-bolt holes ----
  const ext = 3 / Math.tan(VT.includedAngleDeg / 2 * DEG);
  const tri = shapeFrom([
    [-(SQUISH_EDGE_Z + ext), HEAD_FACE_Y - 3],
    [SQUISH_EDGE_Z + ext, HEAD_FACE_Y - 3],
    [0, RIDGE_Y],
  ]);
  const prisms: BufferGeometry[] = [];
  const drums: BufferGeometry[] = [];
  for (const cx of CYLINDER_X) {
    prisms.push(extrudeAlongX(tri, cx - H.chamberHalfX, cx + H.chamberHalfX, 0, 1));
    const d = new CylinderGeometry(H.chamberRadius, H.chamberRadius, RIDGE_Y - HEAD_FACE_Y + 10, 72);
    d.translate(cx, (RIDGE_Y + HEAD_FACE_Y) / 2, 0);
    drums.push(d);
  }
  const chambers = intersect(merge(prisms), [merge(drums)]);

  const g1: BufferGeometry[] = [chambers];
  const sp = VT.spring;
  const bucketR = VT.bucket.diameter / 2 + 0.05;
  for (const v of VALVES) {
    const well = latheY(
      [
        [0, sp.seat - 1],
        [sp.meanDiameter / 2 + sp.wire / 2 + 1.2, sp.seat - 1],
        [sp.meanDiameter / 2 + sp.wire / 2 + 1.2, 64],
        [bucketR, 64],
        [bucketR, 150],
        [0, 150],
      ],
      40,
    );
    g1.push(onValveAxis(well, v));
  }
  const hb = H.bolt;
  const seatY = top - hb.seatDepth;
  for (const b of HEAD_BOLTS) {
    const hole = latheY(
      [
        [0, HEAD_FACE_Y - 2],
        [hb.diameter / 2 + 0.5, HEAD_FACE_Y - 2],
        [hb.diameter / 2 + 0.5, seatY],
        [hb.headDiameter / 2 + 1, seatY],
        [hb.headDiameter / 2 + 1, top + 5],
        [0, top + 5],
      ],
      28,
    );
    hole.translate(b.x, 0, b.z);
    g1.push(hole);
  }

  // ---- G2: camshaft tunnels (lobe clearance + journal bores) and spark-plug wells ----
  const g2: BufferGeometry[] = [];
  const jr = CAM.journalDiameter / 2 + 0.05;
  const jw = CAM.journalWidth / 2;
  for (const kind of ['intake', 'exhaust'] as const) {
    // Journal bore through the front wall and every bearing saddle; full lobe clearance between saddles.
    const prof: P2[] = [[0, -L - 10], [jr, -L - 10]];
    CAM_JOURNAL_X.forEach((jx, i) => {
      if (i > 0) prof.push([H.camTunnelRadius, jx - jw], [jr, jx - jw]);
      prof.push([jr, jx + jw]);
      if (i < CAM_JOURNAL_X.length - 1) prof.push([H.camTunnelRadius, jx + jw]);
    });
    prof.push([jr, L - 6], [0, L - 6]);
    const t = latheX(prof, 48);
    t.translate(0, CAM_CENTRE[kind].y, CAM_CENTRE[kind].z);
    g2.push(t);
  }
  const pl = H.plug;
  for (const cx of CYLINDER_X) {
    const well = latheY(
      [
        [0, RIDGE_Y - 8],
        [pl.threadDiameter / 2, RIDGE_Y - 8],
        [pl.threadDiameter / 2, RIDGE_Y + pl.reach],
        [pl.threadDiameter / 2 + 2.5, RIDGE_Y + pl.reach + 1],
        [pl.wellDiameter / 2, RIDGE_Y + pl.reach + 1],
        [pl.wellDiameter / 2, top + 5],
        [0, top + 5],
      ],
      40,
    );
    well.translate(cx, 0, 0);
    g2.push(well);
  }

  // ---- G3: ports ----
  const g3: BufferGeometry[] = [];
  for (let c = 0; c < SPECS.cylinders; c++) g3.push(portCutter(c, 'intake'), portCutter(c, 'exhaust'));

  // ---- G4: valve seats, guide bores, injector bores ----
  const g4: BufferGeometry[] = [];
  const gd = VT.guide;
  for (const v of VALVES) {
    const R = v.diameter / 2;
    const m = VT.valve.margin;
    const seat = latheY(
      [
        [0, -6],
        [R + 0.05, -6],
        [R + 0.05, m],
        [R - VT.valve.seatWidth + 0.05, m + VT.valve.seatWidth],
        [R - 2.5, m + VT.valve.seatWidth + 1],
        [R - 2.5, 10],
        [0, 10],
      ],
      40,
    );
    g4.push(onValveAxis(seat, v));
    const guide = new CylinderGeometry(gd.outerDiameter / 2, gd.outerDiameter / 2, sp.seat - gd.from, 24);
    guide.translate(0, (sp.seat + gd.from) / 2, 0);
    g4.push(onValveAxis(guide, v));
  }
  for (let c = 0; c < SPECS.cylinders; c++) {
    const { tip, dir } = injectorAxis(c);
    const bore = latheY(
      [
        [0, -6],
        [4, -6],
        [4, 9],
        [7.2, 10],
        [7.2, 60],
        [0, 60],
      ],
      28,
    );
    alignY(bore, dir.clone().negate(), tip);
    g4.push(bore);
  }

  head = subtract(head, [merge(g1)]);
  // G2 and G4 are mutually disjoint, so they share one CSG pass.
  head = subtract(head, [merge([...g2, ...g4])]);
  head = subtract(head, [merge(g3)]);
  head = crease(head, 35);

  // ---- valve guides (protrude into the port and above the spring seat) + spring-seat washers ----
  const guideParts: BufferGeometry[] = [];
  for (const v of VALVES) {
    const stemR = (v.kind === 'intake' ? VT.valve.intakeStem : VT.valve.exhaustStem) / 2 + 0.03;
    const g = latheY(
      [
        [stemR, gd.from - 4],
        [gd.outerDiameter / 2 - 0.6, gd.from - 4],
        [gd.outerDiameter / 2, gd.from - 3.4],
        [gd.outerDiameter / 2, gd.to - 0.6],
        [gd.outerDiameter / 2 - 0.6, gd.to],
        [stemR, gd.to],
        [stemR, gd.from - 4],
      ],
      24,
    );
    const washerR = sp.meanDiameter / 2 + sp.wire / 2 + 0.6;
    const washer = latheY(
      [
        [gd.outerDiameter / 2 + 0.05, sp.seat - 1],
        [washerR, sp.seat - 1],
        [washerR, sp.seat],
        [gd.outerDiameter / 2 + 0.05, sp.seat],
        [gd.outerDiameter / 2 + 0.05, sp.seat - 1],
      ],
      40,
    );
    guideParts.push(onValveAxis(g, v), onValveAxis(washer, v));
  }

  // ---- head gasket (MLS) ----
  const gOutline = roundCorners(
    [
      [-L + 1, -SPECS.block.deckHalfWidth],
      [L - 1, -SPECS.block.deckHalfWidth],
      [L - 1, SPECS.block.deckHalfWidth],
      [-L + 1, SPECS.block.deckHalfWidth],
    ],
    [6, 6, 6, 6],
    true,
    4,
  );
  const holes: P2[][] = [];
  for (const cx of CYLINDER_X) {
    holes.push(circlePts(cx, 0, H.gasketBoreDiameter / 2, 96));
    const wj = SPECS.block.waterJacket;
    const hz = (wj.innerRadius + wj.outerOffset) / 2;
    for (const zs of [-1, 1]) for (const dx of [-14, 14]) holes.push(circlePts(cx + dx, zs * Math.sqrt(hz * hz - dx * dx), 3.5, 16));
  }
  for (const b of HEAD_BOLTS) holes.push(circlePts(b.x, b.z, hb.diameter / 2 + 0.6, 20));
  const gasketFlat = extrudeAlongY(shapeFrom(gOutline, holes), SPECS.block.deckHeight, HEAD_FACE_Y, 0, 8);
  // fire rings (embossed stopper beads around each bore)
  const rings: BufferGeometry[] = [];
  for (const cx of CYLINDER_X) {
    const ri = H.gasketBoreDiameter / 2;
    const ring = latheY(
      [
        [ri, SPECS.block.deckHeight - 0.15],
        [ri + 2.4, SPECS.block.deckHeight - 0.15],
        [ri + 2.4, HEAD_FACE_Y + 0.0],
        [ri, HEAD_FACE_Y + 0.0],
        [ri, SPECS.block.deckHeight - 0.15],
      ],
      96,
    );
    ring.translate(cx, 0, 0);
    rings.push(ring);
  }

  // ---- head bolts (flanged hex head, sitting in the counterbores) ----
  const bolts: BufferGeometry[] = [];
  for (const b of HEAD_BOLTS) {
    const shaft = new CylinderGeometry(hb.diameter / 2, hb.diameter / 2, seatY - (SPECS.block.deckHeight - hb.threadDepth + 4), 20);
    shaft.translate(b.x, (seatY + SPECS.block.deckHeight - hb.threadDepth + 4) / 2, b.z);
    const flange = latheY(
      [
        [0, seatY],
        [hb.headDiameter / 2 + 0.4, seatY],
        [hb.headDiameter / 2 + 0.4, seatY + 1.6],
        [0, seatY + 1.6],
      ],
      32,
    );
    flange.translate(b.x, 0, b.z);
    const hexR = hb.headDiameter / 2 / Math.cos(Math.PI / 6) - 1.2;
    const hex = new CylinderGeometry(hexR, hexR, hb.headHeight - 1.6, 6);
    hex.translate(b.x, seatY + 1.6 + (hb.headHeight - 1.6) / 2, b.z);
    bolts.push(shaft, flange, hex);
  }

  return {
    head,
    guides: merge(guideParts),
    gasket: merge([gasketFlat, ...rings]),
    bolts: merge(bolts),
  };
}

/** Rotate a +Y-built geometry so +Y points along `dir`, then move its origin to `at`. */
export function alignY(g: BufferGeometry, dir: Vector3, at: Vector3): BufferGeometry {
  const q = new Matrix4().makeBasis(...basisFromY(dir));
  g.applyMatrix4(q);
  g.translate(at.x, at.y, at.z);
  return g;
}

function basisFromY(y: Vector3): [Vector3, Vector3, Vector3] {
  const yy = y.clone().normalize();
  const ref = Math.abs(yy.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
  const z = new Vector3().crossVectors(ref, yy).normalize();
  const x = new Vector3().crossVectors(yy, z).normalize();
  return [x, yy, z];
}
