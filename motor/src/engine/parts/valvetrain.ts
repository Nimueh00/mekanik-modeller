import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three';
import { latheY, merge, type P2 } from '../../core/geometry/profile';
import { SPECS } from '../specs';

/*
 * Valve-train parts, built in the valve frame: origin at the closed valve
 * face (station s = 0), +Y along the valve axis. The assembly places a pair
 * of identical valves (same cylinder, same side) in one geometry; the second
 * copy is offset by `pairDx` along X, which the tilt about X leaves alone.
 */

const VT = SPECS.valveTrain;
const V = VT.valve;
const SP = VT.spring;

function pair(g: BufferGeometry, dx: number): BufferGeometry {
  const b = g.clone();
  b.translate(dx, 0, 0);
  return merge([g, b]);
}

/** Smooth concave blend (quadratic Bézier) between two profile points. */
function blend(a: P2, ctrl: P2, b: P2, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1]]);
  }
  return out;
}

export function valveProfile(diameter: number, stemDiameter: number): P2[] {
  const R = diameter / 2;
  const rs = stemDiameter / 2;
  const m = V.margin;
  const sw = V.seatWidth;
  const [g0, g1] = V.keeperGroove;
  const seatTop: P2 = [R - sw, m + sw];
  const neck: P2 = [rs, V.tulipEnd];
  return [
    [0, 0],
    [R - 0.5, 0],
    [R, 0.4],
    [R, m],
    seatTop,
    // tulip: a generous concave radius from the seat into the stem
    ...blend(seatTop, [rs + 0.6, m + sw + 2.5], neck, 14),
    neck,
    [rs, g0],
    [rs - 0.7, g0 + 0.6],
    [rs - 0.7, g1 - 0.6],
    [rs, g1],
    [rs, V.length - 0.5],
    [rs - 0.5, V.length],
    [0, V.length],
  ];
}

export interface ValvePairGeometry {
  valves: BufferGeometry;
  /** Keepers + retainer. */
  retainers: BufferGeometry;
  buckets: BufferGeometry;
  /** Valve stem seals (on top of the guides): static, part of the guide set. */
  seals: BufferGeometry;
}

export function buildValvePair(kind: 'intake' | 'exhaust', pairDx: number): ValvePairGeometry {
  const d = kind === 'intake' ? VT.intakeValveDiameter : VT.exhaustValveDiameter;
  const stem = kind === 'intake' ? V.intakeStem : V.exhaustStem;
  const rs = stem / 2;
  const valve = latheY(valveProfile(d, stem), 48);

  // Split keepers (two half collets with a gap), tapered outside.
  const [g0, g1] = V.keeperGroove;
  const kIn = rs - 0.65;
  const keeperProf: P2[] = [
    [kIn, g0 - 1.6],
    [rs + 1.5, g0 - 1.6],
    [rs + 2.6, g1 + 1.8],
    [kIn + 0.7, g1 + 1.8],
    [kIn + 0.7, g1 - 0.55],
    [kIn, g1 - 0.6],
    [kIn, g0 - 1.6],
  ];
  const gap = 0.12;
  const k1 = latheY(keeperProf, 20, gap, Math.PI - 2 * gap);
  const k2 = latheY(keeperProf, 20, Math.PI + gap, Math.PI - 2 * gap);
  const r = VT.retainer;
  const springTop = SP.seat + SP.installedLength;
  const springInner = SP.meanDiameter / 2 - SP.wire / 2;
  const retainer = latheY(
    [
      [rs + 1.55, r.bottom],
      [springInner - 0.4, r.bottom],
      [springInner - 0.2, r.bottom + 0.3],
      [springInner - 0.2, springTop],
      [r.outerDiameter / 2, springTop],
      [r.outerDiameter / 2, springTop + 2.4],
      [r.outerDiameter / 2 - 0.8, springTop + 3.2],
      [rs + 4.2, r.top],
      [rs + 2.75, r.top],
      [rs + 1.55, r.bottom],
    ],
    48,
  );

  const b = VT.bucket;
  const R = b.diameter / 2;
  const top = V.length + b.topThickness;
  const bot = top - b.height;
  const Ri = R - b.wall;
  const bucket = latheY(
    [
      [Ri, bot],
      [R - 0.4, bot],
      [R, bot + 0.4],
      [R, top - 0.5],
      [R - 0.5, top],
      [0, top],
      [0, V.length],
      [Ri - 0.6, V.length],
      [Ri, V.length - 0.6],
      [Ri, bot],
    ],
    64,
  );

  const gd = VT.guide;
  const seal = latheY(
    [
      [rs + 0.02, gd.to - 4],
      [gd.outerDiameter / 2 + 1.2, gd.to - 4],
      [gd.outerDiameter / 2 + 1.2, gd.to + 1.5],
      [rs + 1.8, gd.to + 3.5],
      [rs + 0.02, gd.to + 3.5],
      [rs + 0.02, gd.to - 4],
    ],
    28,
  );

  return {
    valves: pair(valve, pairDx),
    retainers: pair(merge([k1, k2, retainer]), pairDx),
    buckets: pair(bucket, pairDx),
    seals: pair(seal, pairDx),
  };
}

/**
 * Valve spring with closed, ground ends whose active coils compress with the
 * valve lift. Vertices keep their offset from the wire centre line, so the
 * wire stays round while the pitch changes. Two springs (a valve pair) per
 * geometry; call `compress(lift)` every frame.
 */
export class ValveSpringPair {
  readonly geometry: BufferGeometry;
  private centreY: Float32Array;
  private offsetY: Float32Array;
  private pos: BufferAttribute;
  private lastLift = NaN;

  constructor(pairDx: number, radialSegs = 8, segsPerTurn = 30) {
    const n = SP.totalCoils;
    const w = SP.wire;
    const L = SP.installedLength;
    const Rm = SP.meanDiameter / 2;
    const rw = w / 2;
    const turns = n * segsPerTurn;
    const pos: number[] = [];
    const nor: number[] = [];
    const cy: number[] = [];
    const oy: number[] = [];
    const idx: number[] = [];
    const activePitch = (L - 3 * w) / (n - 2 * SP.deadCoils);
    const centre = (u: number) => {
      // u = turns from the bottom end
      if (u <= SP.deadCoils) return rw + w * u;
      if (u >= n - SP.deadCoils) return L - rw - w * (n - u);
      return rw + w * SP.deadCoils + activePitch * (u - SP.deadCoils);
    };
    for (const copy of [0, 1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= turns; i++) {
        const u = i / segsPerTurn;
        const th = u * Math.PI * 2;
        const c = Math.cos(th);
        const s = Math.sin(th);
        const y = centre(u);
        for (let j = 0; j < radialSegs; j++) {
          const a = (j / radialSegs) * Math.PI * 2;
          const rr = Rm + rw * Math.cos(a);
          pos.push(copy * pairDx + rr * c, SP.seat + y + rw * Math.sin(a), rr * s);
          nor.push(Math.cos(a) * c, Math.sin(a), Math.cos(a) * s);
          cy.push(y);
          oy.push(rw * Math.sin(a));
        }
      }
      for (let i = 0; i < turns; i++) {
        for (let j = 0; j < radialSegs; j++) {
          const a = base + i * radialSegs + j;
          const b = base + i * radialSegs + ((j + 1) % radialSegs);
          const c = a + radialSegs;
          const d = b + radialSegs;
          idx.push(a, b, c, b, d, c);
        }
      }
    }
    const g = new BufferGeometry();
    this.pos = new Float32BufferAttribute(pos, 3);
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.geometry = g;
    this.centreY = new Float32Array(cy);
    this.offsetY = new Float32Array(oy);
    this.compress(0);
  }

  /** Spring length between seat and retainer = installed length − lift. */
  compress(lift: number): void {
    if (Math.abs(lift - this.lastLift) < 1e-4) return;
    this.lastLift = lift;
    const w = SP.wire;
    const L = SP.installedLength;
    const a0 = w / 2 + w * SP.deadCoils; // top of the bottom dead coil
    const a1 = L - w / 2 - w * SP.deadCoils;
    const k = (a1 - a0 - lift) / (a1 - a0);
    const arr = this.pos.array as Float32Array;
    for (let i = 0; i < this.centreY.length; i++) {
      const y = this.centreY[i]!;
      const yc = y <= a0 ? y : y >= a1 ? y - lift : a0 + (y - a0) * k;
      arr[i * 3 + 1] = SP.seat + Math.min(Math.max(yc + this.offsetY[i]!, 0), L - lift);
    }
    this.pos.needsUpdate = true;
  }
}
