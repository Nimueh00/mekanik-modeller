import { BoxGeometry, type BufferGeometry, CylinderGeometry } from 'three';
import {
  crease,
  extrudeAlongY,
  flipWinding,
  latheY,
  merge,
  type P2,
  roundCorners,
  shapeFrom,
} from '../../core/geometry/profile';
import { JEWEL, SCENE_PER_MM } from '../specs';

/**
 * Shared drawing helpers for the watch parts. Every builder works in
 * millimetres (the units of specs.ts) in the plan frame (x, z), +Y towards the
 * dial, and converts to scene units once at the end with `toScene`.
 */

/** Scale a geometry built in millimetres to scene units. */
export function toScene(g: BufferGeometry): BufferGeometry {
  g.scale(SCENE_PER_MM, SCENE_PER_MM, SCENE_PER_MM);
  return g;
}

/** Point at radius r in the direction of a rotY angle (degrees): rotY([r, 0], a). */
export function polarY(r: number, deg: number, at: P2 = [0, 0]): P2 {
  const a = (deg * Math.PI) / 180;
  return [at[0] + r * Math.cos(a), at[1] - r * Math.sin(a)];
}

/** Plan direction (rotY degrees) of a clock position (0 = 12 o'clock, clockwise from the dial). */
export const clockToY = (clockDeg: number) => 90 - clockDeg;

/** Solid cylinder along Y between y0 and y1 (either order), centred on (x, z). */
export function cylinderY(r: number, y0: number, y1: number, segs = 32, at: P2 = [0, 0]): BufferGeometry {
  const g = new CylinderGeometry(r, r, Math.abs(y1 - y0), segs);
  g.translate(at[0], (y0 + y1) / 2, at[1]);
  return g;
}

/** Tube along Y (lathe), inner radius ri, outer ro. */
export function tubeY(ri: number, ro: number, y0: number, y1: number, segs = 32): BufferGeometry {
  return latheY(
    [
      [ri, y0],
      [ro, y0],
      [ro, y1],
      [ri, y1],
      [ri, y0],
    ],
    segs,
  );
}

/** Axis-aligned box, centred. */
export function box(sx: number, sy: number, sz: number, at: readonly [number, number, number]): BufferGeometry {
  const g = new BoxGeometry(sx, sy, sz);
  g.translate(at[0], at[1], at[2]);
  return g;
}

/** Circle polygon (counter-clockwise in (x, z) numbers). */
export function circle(r: number, at: P2 = [0, 0], segs = 48): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (2 * Math.PI * i) / segs;
    out.push([at[0] + r * Math.cos(a), at[1] + r * Math.sin(a)]);
  }
  return out;
}

/**
 * Closed centripetal Catmull–Rom curve through control points: organic
 * outlines that pass exactly through hand-placed points.
 */
export function smoothClosed(ctrl: readonly P2[], perSpan = 10): P2[] {
  const n = ctrl.length;
  const out: P2[] = [];
  const P = (i: number) => ctrl[((i % n) + n) % n]!;
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const t = (a: P2, b: P2) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-6;
    const t1 = t(p0, p1);
    const t2 = t1 + t(p1, p2);
    const t3 = t2 + t(p2, p3);
    for (let k = 0; k < perSpan; k++) {
      const u = t1 + ((t2 - t1) * k) / perSpan;
      const lerp = (a: P2, b: P2, ta: number, tb: number): P2 => {
        const w = (u - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
      };
      const A1 = lerp(p0, p1, 0, t1);
      const A2 = lerp(p1, p2, t1, t2);
      const A3 = lerp(p2, p3, t2, t3);
      const B1 = lerp(A1, A2, 0, t2);
      const B2 = lerp(A2, A3, t1, t3);
      out.push(lerp(B1, B2, t1, t2));
    }
  }
  return out;
}

/**
 * Outline of a band of varying width along a smooth open centreline (through
 * `path`), with round ends: the organic arms of bridges and cocks.
 */
export function strokeOutline(path: readonly P2[], widths: readonly number[], perSpan = 12): P2[] {
  // open Catmull–Rom through the path (end points duplicated)
  const ext = [path[0]!, ...path, path[path.length - 1]!];
  const centre: P2[] = [];
  const width: number[] = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1]!, ext[i]!, ext[i + 1]!, ext[i + 2]!];
    for (let k = 0; k < perSpan; k++) {
      const u = k / perSpan;
      const u2 = u * u;
      const u3 = u2 * u;
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * u + (2 * a - 5 * b + 4 * cc - d) * u2 + (-a + 3 * b - 3 * cc + d) * u3);
      centre.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
      width.push(widths[i - 1]! + (widths[i]! - widths[i - 1]!) * (u * u * (3 - 2 * u)));
    }
  }
  centre.push(path[path.length - 1]!);
  width.push(widths[widths.length - 1]!);
  const left: P2[] = [];
  const right: P2[] = [];
  for (let i = 0; i < centre.length; i++) {
    const a = centre[Math.max(0, i - 1)]!;
    const b = centre[Math.min(centre.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    const h = width[i]! / 2;
    left.push([centre[i]![0] + nx * h, centre[i]![1] + nz * h]);
    right.push([centre[i]![0] - nx * h, centre[i]![1] - nz * h]);
  }
  const cap = (c: P2, from: P2, h: number, dir: number): P2[] => {
    const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
    const out: P2[] = [];
    for (let k = 1; k < 10; k++) {
      const a = a0 + (dir * Math.PI * k) / 10;
      out.push([c[0] + h * Math.cos(a), c[1] + h * Math.sin(a)]);
    }
    return out;
  };
  const last = centre.length - 1;
  const endCap = cap(centre[last]!, left[last]!, width[last]! / 2, -1);
  const startCap = cap(centre[0]!, right[0]!, width[0]! / 2, -1);
  return [...left, ...endCap, ...right.reverse(), ...startCap];
}

/**
 * Plate-like part: an outline (with holes) extruded between y0 and y1, edges
 * softened by `bevel`. The faces are re-creased at a tighter angle: the first
 * bevel step is shallow, and smoothing it into the flat face would shade the
 * long cap triangles in streaks.
 */
export function slab(
  outline: readonly P2[],
  holes: readonly (readonly P2[])[],
  y0: number,
  y1: number,
  bevel = 0,
): BufferGeometry {
  const g = extrudeAlongY(shapeFrom(outline, holes), y0, y1, bevel, 6);
  return bevel > 0 ? crease(g, 15) : g;
}

/**
 * Place a part drawn on a surface at y = 0 facing +Y onto a surface at height
 * y facing `facing` (+1: towards the dial, −1: the back). Mirroring keeps the
 * normals outward (winding restored).
 */
export function orient(g: BufferGeometry, y: number, facing: 1 | -1, at: P2 = [0, 0]): BufferGeometry {
  if (facing < 0) {
    g.scale(1, -1, 1);
    flipWinding(g);
  }
  g.translate(at[0], y, at[1]);
  return g;
}

/**
 * A hole jewel set in a surface at height y facing `facing`: the polished
 * sink around it (proud by a few µm), and the domed ruby with its pivot hole
 * (separate, for its material). Lathe profiles run counter-clockwise in
 * (radius, height), i.e. with outward normals.
 */
export function jewel(at: P2, y: number, facing: 1 | -1): { sink: BufferGeometry; ruby: BufferGeometry } {
  const { radius: r, sinkRadius: rs, holeRadius: rh } = JEWEL;
  const sink = latheY(
    [
      [r, -0.02],
      [rs, -0.02],
      [rs, 0.01],
      [rs * 0.9, 0.03],
      [r, 0.012],
      [r, -0.02],
    ],
    40,
  );
  const ruby = latheY(
    roundCorners(
      [
        [rh, -0.05],
        [r, -0.05],
        [r, 0.02],
        [r * 0.7, 0.036],
        [rh * 1.8, 0.016],
        [rh, 0],
        [rh, -0.05],
      ],
      [0, 0, 0, 0.12, 0.04, 0, 0],
      false,
      3,
    ),
    32,
  );
  return { sink: orient(sink, y, facing, at), ruby: orient(ruby, y, facing, at) };
}

/**
 * A screw head proud of a surface at height y facing `facing`: domed and
 * chamfered, with its slot returned separately (dark material).
 */
export function screwHead(
  at: P2,
  y: number,
  facing: 1 | -1,
  r = 0.55,
  h = 0.16,
  slotDeg = 30,
): { head: BufferGeometry; slot: BufferGeometry } {
  const head = latheY(
    roundCorners(
      [
        [0, 0],
        [r, 0],
        [r, h * 0.6],
        [r * 0.7, h],
        [0, h],
      ],
      [0, 0, 0.06, 0.12, 0],
      false,
      3,
    ),
    28,
  );
  const slot = box(2 * r * 0.96, h * 0.5, r * 0.22, [0, h * 0.82, 0]);
  slot.rotateY((slotDeg * Math.PI) / 180);
  return { head: orient(head, y, facing, at), slot: orient(slot, y, facing, at) };
}

export { merge };
