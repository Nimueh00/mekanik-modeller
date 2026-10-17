/**
 * Small 2-D polygon toolkit for the geometry tests (plan coordinates, mm).
 * Not a test file itself (no `.test.ts`).
 */
export type P2 = readonly [number, number];

export function transform(pts: readonly P2[], deg: number, at: P2): P2[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // rotation about +Y (Object3D.rotation.y), then translation
  return pts.map(([x, z]) => [at[0] + x * c + z * s, at[1] - x * s + z * c] as P2);
}

/** Insert points so that no edge is longer than `step`. */
export function densify(pts: readonly P2[], step: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

export function distToSegment(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Signed area (positive = counter-clockwise in the (x, z) numbers). */
export function signedArea(pts: readonly P2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function segmentsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True if any two non-adjacent edges cross (grid-accelerated). */
export function selfIntersects(pts: readonly P2[]): boolean {
  const n = pts.length;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const cells = Math.max(1, Math.ceil(Math.sqrt(n)));
  const cw = (maxX - minX) / cells || 1;
  const ch = (maxY - minY) / cells || 1;
  const grid = new Map<number, number[]>();
  const cell = (x: number, y: number) => [
    Math.min(cells - 1, Math.floor((x - minX) / cw)),
    Math.min(cells - 1, Math.floor((y - minY) / ch)),
  ];
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const [x0, y0] = cell(Math.min(a[0], b[0]), Math.min(a[1], b[1]));
    const [x1, y1] = cell(Math.max(a[0], b[0]), Math.max(a[1], b[1]));
    for (let gx = x0!; gx <= x1!; gx++) {
      for (let gy = y0!; gy <= y1!; gy++) {
        const k = gx * cells + gy;
        const list = grid.get(k) ?? [];
        list.push(i);
        grid.set(k, list);
      }
    }
  }
  for (const list of grid.values()) {
    for (let p = 0; p < list.length; p++) {
      for (let q = p + 1; q < list.length; q++) {
        const i = list[p]!;
        const j = list[q]!;
        if (Math.abs(i - j) <= 1 || Math.abs(i - j) === n - 1) continue;
        if (segmentsCross(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) return true;
      }
    }
  }
  return false;
}

/**
 * A polygon prepared for fast point queries: edges bucketed by the band of
 * `axisCoord` (z) they span, so a horizontal ray only meets a few of them.
 */
export class Region {
  private readonly buckets: number[][];
  private readonly z0: number;
  private readonly dz: number;
  readonly pts: P2[];

  constructor(pts: readonly P2[], bucketCount = 256) {
    this.pts = [...pts];
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) {
      lo = Math.min(lo, p[1]);
      hi = Math.max(hi, p[1]);
    }
    this.z0 = lo;
    this.dz = (hi - lo) / bucketCount || 1;
    this.buckets = Array.from({ length: bucketCount }, () => []);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const k0 = this.bucket(Math.min(a[1], b[1]));
      const k1 = this.bucket(Math.max(a[1], b[1]));
      for (let k = k0; k <= k1; k++) this.buckets[k]!.push(i);
    }
  }

  private bucket(z: number): number {
    return Math.max(0, Math.min(this.buckets.length - 1, Math.floor((z - this.z0) / this.dz)));
  }

  contains(p: P2): boolean {
    const list = this.buckets[this.bucket(p[1])];
    if (!list || p[1] < this.z0 || p[1] > this.z0 + this.dz * this.buckets.length) return false;
    const n = this.pts.length;
    let inside = false;
    for (const i of list) {
      const a = this.pts[i]!;
      const b = this.pts[(i + 1) % n]!;
      if (a[1] > p[1] !== b[1] > p[1]) {
        const x = a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
        if (x > p[0]) inside = !inside;
      }
    }
    return inside;
  }

  /** Distance from p to the boundary, searching only edges within `reach` (Infinity if none). */
  distance(p: P2, reach: number): number {
    const k0 = this.bucket(p[1] - reach);
    const k1 = this.bucket(p[1] + reach);
    const n = this.pts.length;
    let best = Infinity;
    for (let k = k0; k <= k1; k++) {
      for (const i of this.buckets[k]!) best = Math.min(best, distToSegment(p, this.pts[i]!, this.pts[(i + 1) % n]!));
    }
    return best;
  }
}

/**
 * How deep two polygons are pushed into each other: the largest distance
 * from a vertex of one, lying inside the other, to that other's boundary.
 * Pass densified outlines so that edge-edge crossings are seen through vertices.
 * `reach` bounds the boundary search (deeper overlaps report Infinity).
 */
export function penetration(a: Region, b: Region, reach = 0.1): number {
  return Math.max(depthInto(a.pts, b, reach), depthInto(b.pts, a, reach));
}

/** Largest depth of the given points inside a region (0 if none is inside). */
export function depthInto(points: readonly P2[], region: Region, reach = 0.1): number {
  let worst = 0;
  for (const v of points) if (region.contains(v)) worst = Math.max(worst, region.distance(v, reach));
  return worst;
}

/** Smallest distance between the boundaries of two point sets (vertex to edge, both ways). */
export function gap(a: readonly P2[], b: readonly P2[], closedA = true, closedB = true): number {
  let best = Infinity;
  const edges = (pts: readonly P2[], closed: boolean) => (closed ? pts.length : pts.length - 1);
  for (const [p, q, cq] of [
    [a, b, closedB],
    [b, a, closedA],
  ] as const) {
    for (const v of p) {
      for (let i = 0; i < edges(q, cq); i++) best = Math.min(best, distToSegment(v, q[i]!, q[(i + 1) % q.length]!));
    }
  }
  return best;
}
