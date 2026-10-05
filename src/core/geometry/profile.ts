import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, LatheGeometry, Path, Shape, Vector2 } from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type P2 = readonly [number, number];

/**
 * Replace corners of a polyline/polygon with circular arcs (fillets) or
 * straight chamfers. `round[i]` > 0 → fillet radius, < 0 → chamfer leg length,
 * 0/undefined → sharp. Works for open polylines (end points are kept sharp)
 * and closed polygons.
 */
export function roundCorners(pts: readonly P2[], round: readonly (number | undefined)[], closed: boolean, arcSegs = 6): P2[] {
  const out: P2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const rad = round[i] ?? 0;
    const isEnd = !closed && (i === 0 || i === n - 1);
    if (rad === 0 || isEnd) {
      out.push(p);
      continue;
    }
    const a = pts[(i - 1 + n) % n]!;
    const b = pts[(i + 1) % n]!;
    const d1x = a[0] - p[0];
    const d1y = a[1] - p[1];
    const d2x = b[0] - p[0];
    const d2y = b[1] - p[1];
    const l1 = Math.hypot(d1x, d1y);
    const l2 = Math.hypot(d2x, d2y);
    const u1x = d1x / l1;
    const u1y = d1y / l1;
    const u2x = d2x / l2;
    const u2y = d2y / l2;
    if (rad < 0) {
      const c = Math.min(-rad, l1 * 0.49, l2 * 0.49);
      out.push([p[0] + u1x * c, p[1] + u1y * c], [p[0] + u2x * c, p[1] + u2y * c]);
      continue;
    }
    const cos = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
    const half = Math.acos(cos) / 2;
    if (half < 1e-4 || Math.abs(half - Math.PI / 2) < 1e-4) {
      out.push(p);
      continue;
    }
    let t = rad / Math.tan(half);
    const tMax = Math.min(l1, l2) * 0.49;
    let r = rad;
    if (t > tMax) {
      t = tMax;
      r = t * Math.tan(half);
    }
    const s: P2 = [p[0] + u1x * t, p[1] + u1y * t];
    const e: P2 = [p[0] + u2x * t, p[1] + u2y * t];
    // centre along the bisector
    let bx = u1x + u2x;
    let by = u1y + u2y;
    const bl = Math.hypot(bx, by);
    bx /= bl;
    by /= bl;
    const cd = r / Math.sin(half);
    const cx = p[0] + bx * cd;
    const cy = p[1] + by * cd;
    const a0 = Math.atan2(s[1] - cy, s[0] - cx);
    const a1 = Math.atan2(e[1] - cy, e[0] - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= arcSegs; k++) {
      const ang = a0 + (da * k) / arcSegs;
      out.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
  }
  return out;
}

/**
 * Lathe around the +X axis. Profile points are [radius, x]. Order the profile
 * so that walking along it the solid is on the left (outer surfaces: from −x
 * to +x at large radius) for outward normals.
 */
export function latheX(profile: readonly P2[], segments = 64): BufferGeometry {
  const pts = profile.map(([r, x]) => new Vector2(Math.max(r, 0), x));
  const g = new LatheGeometry(pts, segments);
  // Lathe axis is +Y; map it onto +X.
  g.rotateZ(-Math.PI / 2);
  return crease(g);
}

/** Same as `latheX`, but around +Y (profile [radius, y]). */
export function latheY(profile: readonly P2[], segments = 64, phiStart = 0, phiLength = Math.PI * 2): BufferGeometry {
  return crease(
    new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(r, 0), y)), segments, phiStart, phiLength),
  );
}

export function shapeFrom(pts: readonly P2[], holes: readonly (readonly P2[])[] = []): Shape {
  const s = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  for (const h of holes) s.holes.push(new Path(h.map(([x, y]) => new Vector2(x, y))));
  return s;
}

export function circlePts(cx: number, cy: number, r: number, segs = 48, clockwise = false): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = ((clockwise ? -1 : 1) * i * Math.PI * 2) / segs;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/**
 * Extrude a 2D shape (drawn in the (z, y) plane, looking along −X) along +X
 * from x0 to x1 with an edge chamfer/round of `bevel` on both faces.
 */
export function extrudeAlongX(shape: Shape, x0: number, x1: number, bevel = 0, curveSegments = 24): BufferGeometry {
  const depth = x1 - x0 - 2 * bevel;
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(depth, 0.01),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: bevel > 0 ? 2 : 0,
    curveSegments,
  });
  // Shape lives in (x=z_world, y=y_world), extrusion along +Z → map: z_local → x_world.
  // rotateY(-90°): (x,y,z) → (-z, y, x)... we want local x → world z, local z → world x.
  g.rotateY(Math.PI / 2); // (x, y, z) → (z, y, -x)
  g.scale(1, 1, -1); //  → (z, y, x)
  flipWinding(g);
  g.translate(x0 + bevel, 0, 0);
  return crease(g);
}

/** Extrude a shape drawn in the (x, z) plane (looking down −Y) along +Y from y0 to y1. */
export function extrudeAlongY(shape: Shape, y0: number, y1: number, bevel = 0, curveSegments = 24): BufferGeometry {
  const depth = y1 - y0 - 2 * bevel;
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(depth, 0.01),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: bevel > 0 ? 2 : 0,
    curveSegments,
  });
  // local (x, y, z) → world (x, z, y): shape-y becomes world z, extrusion becomes world y.
  g.rotateX(-Math.PI / 2); // (x, y, z) → (x, z, -y)
  g.scale(1, 1, -1); // → (x, z, y)
  flipWinding(g);
  g.translate(0, y0 + bevel, 0);
  return crease(g);
}

/**
 * Smooth normals across shallow angles, hard edges above `angleDeg`. Gives
 * crisp chamfers/steps and smooth cylinders from the same mesh.
 */
export function crease(g: BufferGeometry, angleDeg = 32): BufferGeometry {
  const out = toCreasedNormals(g, (angleDeg * Math.PI) / 180);
  g.dispose();
  return out;
}

/** Reverse triangle winding (needed after a mirroring scale). */
export function flipWinding(g: BufferGeometry): void {
  const idx = g.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1]!;
      a[i + 1] = a[i + 2]!;
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const attr = g.getAttribute(name);
      const s = attr.itemSize;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < attr.count; i += 3) {
        for (let k = 0; k < s; k++) {
          const t = arr[(i + 1) * s + k]!;
          arr[(i + 1) * s + k] = arr[(i + 2) * s + k]!;
          arr[(i + 2) * s + k] = t;
        }
      }
      attr.needsUpdate = true;
    }
  }
}

/** Keep only position/normal/uv, de-index, so geometries can be merged or fed to CSG. */
export function normalizeGeometry(g: BufferGeometry): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(ng.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') ng.deleteAttribute(name);
  }
  if (!ng.getAttribute('normal')) ng.computeVertexNormals();
  if (!ng.getAttribute('uv')) {
    const count = ng.getAttribute('position').count;
    ng.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  ng.clearGroups();
  return ng;
}

export function merge(geoms: BufferGeometry[]): BufferGeometry {
  const m = mergeGeometries(geoms.map(normalizeGeometry), false);
  if (!m) throw new Error('mergeGeometries failed');
  return m;
}

/** Points on an arc from a0 to a1 (radians, inclusive). */
export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, segs: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Convex hull (Andrew's monotone chain), CCW. */
export function convexHull(points: readonly P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Mirror a right-half outline (z ≥ 0) into a full closed outline, symmetric about z = 0. */
export function mirrorHalf(right: readonly P2[]): P2[] {
  const left = [...right].reverse().map(([x, y]) => [-x, y] as P2);
  // drop duplicated points on the axis
  const out = [...right];
  for (const p of left) {
    const last = out[out.length - 1]!;
    if (Math.abs(p[0] - last[0]) > 1e-6 || Math.abs(p[1] - last[1]) > 1e-6) out.push(p);
  }
  const first = out[0]!;
  const last = out[out.length - 1]!;
  if (Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) out.pop();
  return out;
}
