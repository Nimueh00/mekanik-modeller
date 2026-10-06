/**
 * Closed path of a belt or chain around a sequence of circles (sprockets,
 * pulleys, guide shoes), in a 2D plane (a, b).
 *
 * The path is travelled counter-clockwise. A circle with positive radius is
 * wrapped with its centre on the left (a sprocket on the outside of the
 * loop); a negative radius bends the path the other way (a tensioner shoe
 * pushing in from outside). Consecutive circles are joined by their common
 * tangent.
 *
 * Arc "length" can be re-scaled per circle (`lengthPerRad`). For a sprocket
 * we use teeth·pitch/2π, so that one chain pitch along the path is exactly one
 * tooth of rotation: links seated on a sprocket then turn with it without any
 * slip, even though the true pin spacing there is a chord, not an arc.
 */

export type V2 = readonly [number, number];

export interface PathCircle {
  c: V2;
  /** Signed radius of the path (pitch line) around this circle. */
  r: number;
  /** Path length per radian of wrap; default |r|. */
  lengthPerRad?: number;
}

export type PathSegment =
  | { kind: 'line'; s0: number; len: number; a: V2; b: V2 }
  | { kind: 'arc'; s0: number; len: number; circle: number; from: number; sweep: number };

export interface BeltPath {
  circles: PathCircle[];
  segments: PathSegment[];
  length: number;
}

/** Common tangent from circle A to circle B: start point on A, end point on B. */
export function tangentLine(A: PathCircle, B: PathCircle): { a: V2; b: V2 } {
  const dx = B.c[0] - A.c[0];
  const dy = B.c[1] - A.c[1];
  const d = Math.hypot(dx, dy);
  const dr = B.r - A.r;
  if (Math.abs(dr) >= d) throw new Error('belt path: circles too close for a tangent');
  const mu = Math.atan2(dy, dx) - Math.asin(dr / d);
  // left normal of the travel direction
  const nx = -Math.sin(mu);
  const ny = Math.cos(mu);
  return {
    a: [A.c[0] - A.r * nx, A.c[1] - A.r * ny],
    b: [B.c[0] - B.r * nx, B.c[1] - B.r * ny],
  };
}

export function beltPath(circles: PathCircle[]): BeltPath {
  const n = circles.length;
  const lines = circles.map((c, i) => tangentLine(c, circles[(i + 1) % n]!));
  const segments: PathSegment[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const C = circles[i]!;
    const inP = lines[(i - 1 + n) % n]!.b;
    const outP = lines[i]!.a;
    const from = Math.atan2(inP[1] - C.c[1], inP[0] - C.c[0]);
    const to = Math.atan2(outP[1] - C.c[1], outP[0] - C.c[0]);
    const TAU = Math.PI * 2;
    let sweep = C.r > 0 ? (((to - from) % TAU) + TAU) % TAU : -((((from - to) % TAU) + TAU) % TAU);
    if (Math.abs(sweep) < 1e-12) sweep = 0;
    const lpr = C.lengthPerRad ?? Math.abs(C.r);
    const arcLen = Math.abs(sweep) * lpr;
    segments.push({ kind: 'arc', s0: s, len: arcLen, circle: i, from, sweep });
    s += arcLen;
    const L = lines[i]!;
    const len = Math.hypot(L.b[0] - L.a[0], L.b[1] - L.a[1]);
    segments.push({ kind: 'line', s0: s, len, a: L.a, b: L.b });
    s += len;
  }
  return { circles, segments, length: s };
}

export interface PathPoint {
  p: [number, number];
  /** Index of the circle when the point lies on an arc, else −1. */
  circle: number;
  /** Polar angle about that circle's centre (arc points only). */
  angle: number;
}

/** Point at path parameter s (wrapped into [0, length)). */
export function pointAt(path: BeltPath, s: number): PathPoint {
  const L = path.length;
  let t = s % L;
  if (t < 0) t += L;
  // segments are few (≤ 2 per circle): linear scan
  let seg = path.segments[path.segments.length - 1]!;
  for (const g of path.segments) {
    if (t < g.s0 + g.len) {
      seg = g;
      break;
    }
  }
  const u = Math.min(Math.max(t - seg.s0, 0), seg.len);
  if (seg.kind === 'line') {
    const k = seg.len > 0 ? u / seg.len : 0;
    return { p: [seg.a[0] + (seg.b[0] - seg.a[0]) * k, seg.a[1] + (seg.b[1] - seg.a[1]) * k], circle: -1, angle: 0 };
  }
  const C = path.circles[seg.circle]!;
  const lpr = C.lengthPerRad ?? Math.abs(C.r);
  const ang = seg.from + Math.sign(seg.sweep) * (u / lpr);
  const R = Math.abs(C.r);
  return { p: [C.c[0] + Math.cos(ang) * R, C.c[1] + Math.sin(ang) * R], circle: seg.circle, angle: ang };
}
