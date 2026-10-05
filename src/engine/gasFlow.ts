import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  type CubicBezierCurve3,
  NormalBlending,
  type Plane,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { OVERLAY_LAYER } from '../core/stage';
import { MAX_LIFT } from './camProfile';
import { chamberCeiling, HEAD_FACE_Y, RIDGE_Y, stationPoint, type ValveAxis } from './headLayout';
import { pistonPinHeight } from './kinematics';
import { portCurves } from './parts/cylinderHead';
import { crownHeightAt } from './parts/piston';
import { CYLINDER_X, SPECS } from './specs';
import { burnFraction, fromFiringTdc, gasTemperature, SWEPT_VOLUME, volumeRate } from './thermo';
import { cycleAngle, VALVE_EVENTS, valveLift } from './timing';

/*
 * Gas exchange, visualised with particles.
 *
 * Every cylinder owns a pool of P "charge" particles. Particle i has a fixed
 * place q_i ∈ [0, 1) in the order the charge flows in, and its state is a pure
 * function of the cycle angle — no simulation state — so pausing, stepping
 * ±1° and scrubbing backwards all stay exact.
 *
 * Flow rates (per crank degree, normalised to one charge per cycle):
 *   intake   w_in(φ) = L_in(φ) · (max(0, dV/dφ) + k_i)
 *   exhaust  w_ex(φ) = L_ex(φ) · (max(0, −dV/dφ) + blowdown(φ))
 * where L = valve lift / max lift. The intake is pulled in by the descending
 * piston (dV/dφ) through the opening valve; k_i is a small inertial (ram)
 * term so the charge keeps trickling in after BDC until IVC. The exhaust is
 * the blowdown right after EVO (pressure driven, decaying) plus the
 * displacement by the rising piston. The cumulative integrals A(φ), E(φ)
 * place each particle: particle i enters when A = q_i and leaves when E = q'_i.
 *
 * Particle speed therefore follows valve lift × piston speed, as asked.
 */

const STEP = 0.5;
const N = 720 / STEP;
const IN = VALVE_EVENTS.intake;
const EX = VALVE_EVENTS.exhaust;
const VD = SWEPT_VOLUME;

function liftFrac(kind: 'intake' | 'exhaust', phi: number): number {
  return valveLift(kind, 0, phi) / MAX_LIFT; // cylinder 1: cycle angle = crank angle
}

/** Unnormalised intake flow at cycle angle φ. */
export function intakeFlow(phi: number): number {
  if (phi <= IN.open || phi >= IN.close) return 0;
  return liftFrac('intake', phi) * (Math.max(0, volumeRate(phi)) + 0.06 * (VD / 180));
}

/** Unnormalised exhaust flow at cycle angle φ (φ in [0, 720)). */
export function exhaustFlow(phi: number): number {
  if (phi <= EX.open || phi >= EX.close) return 0;
  const blowdown = 2.2 * (VD / 180) * Math.exp(-(phi - EX.open) / 22);
  return liftFrac('exhaust', phi) * (Math.max(0, -volumeRate(phi)) + blowdown);
}

function cumulative(f: (phi: number) => number): Float64Array {
  const c = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) {
    const a = (i - 1) * STEP;
    c[i] = c[i - 1]! + 0.5 * (f(a) + f(a + STEP)) * STEP;
  }
  const total = c[N]!;
  for (let i = 0; i <= N; i++) c[i] = c[i]! / total;
  return c;
}

/** Normalised cumulative intake (A) and exhaust (E) over one cycle, 0 → 1. */
export const INTAKE_CUM = cumulative(intakeFlow);
export const EXHAUST_CUM = cumulative(exhaustFlow);

export function cumAt(tab: Float64Array, phi: number): number {
  if (phi <= 0) return 0;
  if (phi >= 720) return 1;
  const f = phi / STEP;
  const i = Math.floor(f);
  return tab[i]! + (tab[i + 1]! - tab[i]!) * (f - i);
}

/** Inverse of a cumulative table: the cycle angle where it reaches q. */
export function cumInverse(tab: Float64Array, q: number): number {
  let lo = 0;
  let hi = N;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (tab[m]! < q) lo = m;
    else hi = m;
  }
  const a = tab[lo]!;
  const b = tab[hi]!;
  return (lo + (b > a ? (q - a) / (b - a) : 0)) * STEP;
}

/** A on the extended life axis ψ ∈ [−720, 1440): one charge per cycle. */
function intakeExt(psi: number): number {
  if (psi < 0) return cumAt(INTAKE_CUM, psi + 720) - 1;
  if (psi < 720) return cumAt(INTAKE_CUM, psi);
  return 1 + cumAt(INTAKE_CUM, psi - 720);
}

/**
 * Visual flame-front radius (mm) around the spark gap at cycle angle φ.
 * The burnt gas occupies far more volume than its mass fraction (≈ 4× lower
 * density), so the volume fraction is taken as x_b^0.55; the front then
 * sweeps from the gap to the farthest corner of the gas (bore edge at the
 * crown) as that fraction goes 0 → 1.
 */
export function flameRadius(phi: number): number {
  const xb = burnFraction(fromFiringTdc(phi));
  if (xb <= 0) return 0;
  const crown = pistonPinHeight(((phi % 360) + 360) % 360) + SPECS.piston.compressionHeight;
  const reach = Math.hypot(BORE_R, RIDGE_Y - 2.2 - crown) + 2;
  return (0.04 + 0.96 * Math.cbrt(Math.pow(xb, 0.55))) * reach;
}

/** Spark-gap position of a cylinder. */
export function sparkPoint(cylinder: number, out = new Vector3()): Vector3 {
  return out.set(CYLINDER_X[cylinder]!, RIDGE_Y - 2.2, 0.6);
}

// ------------------------------------------------------------------ paths

/** Arc-length sampled polyline with a radius per sample. */
class Path {
  private pts: Vector3[] = [];
  private rad: number[] = [];
  private len: number[] = [];
  total = 0;

  add(p: Vector3, r: number): void {
    const last = this.pts[this.pts.length - 1];
    if (last && last.distanceToSquared(p) < 1e-6) return;
    this.total += last ? last.distanceTo(p) : 0;
    this.pts.push(p.clone());
    this.rad.push(r);
    this.len.push(this.total);
  }

  addCurve(c: CubicBezierCurve3, radius: (t: number) => number, t0: number, t1: number, n = 16): void {
    for (let k = 0; k <= n; k++) {
      const t = t0 + ((t1 - t0) * k) / n;
      this.add(c.getPoint(t), radius(t));
    }
  }

  /** Point and radius at a fraction s ∈ [0, 1] of the length. */
  at(s: number, out: Vector3): number {
    const d = Math.min(1, Math.max(0, s)) * this.total;
    let lo = 0;
    let hi = this.len.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.len[m]! < d) lo = m;
      else hi = m;
    }
    const span = this.len[hi]! - this.len[lo]! || 1;
    const u = (d - this.len[lo]!) / span;
    out.lerpVectors(this.pts[lo]!, this.pts[hi]!, u);
    return this.rad[lo]! + (this.rad[hi]! - this.rad[lo]!) * u;
  }

  tangent(s: number, out: Vector3): Vector3 {
    const a = new Vector3();
    const b = new Vector3();
    this.at(s - 0.01, a);
    this.at(s + 0.01, b);
    return out.subVectors(b, a).normalize();
  }
}

interface ValvePath {
  valve: ValveAxis;
  /** intake: outside → throat; exhaust: throat → outside. */
  path: Path;
  /** Fraction of the path that lies outside the head (fades in/out there). */
  outside: number;
}

function buildPaths(cylinder: number, kind: 'intake' | 'exhaust'): ValvePath[] {
  const pc = portCurves(cylinder, kind);
  const sign = kind === 'intake' ? -1 : 1;
  const tJoin = 0.18; // where the branches merge into the trunk
  return pc.branches.map((b) => {
    const p = new Path();
    const outerEnd = pc.trunk.getPoint(1);
    const beyond = outerEnd.clone().add(new Vector3(0, 0, sign * (kind === 'intake' ? 30 : 46)));
    if (kind === 'intake') {
      p.add(beyond, pc.trunkRadius(1) + 2);
      p.addCurve(pc.trunk, pc.trunkRadius, 1, tJoin, 10);
      p.addCurve(b.curve, b.radius, 1, 0.12, 18);
      p.add(stationPoint(b.valve, 7), b.radius(0));
    } else {
      p.add(stationPoint(b.valve, 7), b.radius(0));
      p.addCurve(b.curve, b.radius, 0.12, 1, 18);
      p.addCurve(pc.trunk, pc.trunkRadius, tJoin, 1, 10);
      p.add(beyond, pc.trunkRadius(1) + 6);
    }
    const outsideLen = beyond.distanceTo(outerEnd);
    return { valve: b.valve, path: p, outside: outsideLen / p.total };
  });
}

// ------------------------------------------------------------------ rendering

const VERT = /* glsl */ `
  attribute vec3 color;
  attribute float alpha;
  attribute float size;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vColor = color;
    vAlpha = alpha;
    gl_PointSize = size * uScale / max(1.0, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) * 4.0;
    if (r2 > 1.0) discard;
    float soft = 1.0 - r2;
    gl_FragColor = vec4(vColor, vAlpha * soft * soft);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const P = 480; // particles per cylinder
const INCARNATIONS = 3; // previous, current and next charge on the life axis
const L_IN = 4.2; // the intake port holds ≈ 1/4 of a charge
const L_EX = 3.4;

interface Pool {
  cylinder: number;
  q: Float32Array; // entry order
  qx: Float32Array; // exit order
  entry: Float32Array; // ψ of entry (cycle angle)
  exit: Float32Array; // cycle angle of leaving the cylinder
  rr: Float32Array;
  ang: Float32Array;
  h: Float32Array;
  ox: Float32Array; // disc offset inside the port
  oy: Float32Array;
  side: Uint8Array; // front/rear valve
  curtain: Float32Array; // angle around the valve rim
  intake: ValvePath[];
  exhaust: ValvePath[];
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BORE_R = SPECS.bore / 2;
const CH = SPECS.head.chamberHalfX;

/** Gas ceiling above (x, z) of a cylinder: pent roof inside the chamber outline, the head face outside it. */
function ceilingAt(dx: number, z: number): number {
  return Math.abs(dx) <= CH ? chamberCeiling(z) : HEAD_FACE_Y;
}

/**
 * The particle system for all four cylinders (one Points draw call).
 * `update(crankAngle)` recomputes every particle from the engine clock.
 */
export class GasFlow {
  readonly points: Points;
  private pools: Pool[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private material: ShaderMaterial;
  private v = new Vector3();
  private w = new Vector3();
  private t = new Vector3();
  private e1 = new Vector3();
  private e2 = new Vector3();
  private spark = new Vector3();
  private static X = new Vector3(1, 0, 0);

  constructor(clipPlanes: Plane[]) {
    for (let c = 0; c < SPECS.cylinders; c++) this.pools.push(this.makePool(c));
    const n = SPECS.cylinders * P * INCARNATIONS;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('color', new BufferAttribute(this.col, 3));
    g.setAttribute('alpha', new BufferAttribute(this.alpha, 1));
    g.setAttribute('size', new BufferAttribute(this.size, 1));
    this.material = new ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      clipping: true,
    });
    this.material.clippingPlanes = clipPlanes;
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.name = 'gas-flow';
    this.points.layers.set(OVERLAY_LAYER); // drawn normally, but neither a bloom source nor an occluder
  }

  /** Pixel scale for point sizes: drawing-buffer height / (2·tan(fov/2)). */
  setScale(s: number): void {
    this.material.uniforms.uScale!.value = s;
  }

  setAdditive(on: boolean): void {
    this.material.blending = on ? AdditiveBlending : NormalBlending;
  }

  private makePool(cylinder: number): Pool {
    const r = rng(1234 + cylinder * 97);
    const pool: Pool = {
      cylinder,
      q: new Float32Array(P),
      qx: new Float32Array(P),
      entry: new Float32Array(P),
      exit: new Float32Array(P),
      rr: new Float32Array(P),
      ang: new Float32Array(P),
      h: new Float32Array(P),
      ox: new Float32Array(P),
      oy: new Float32Array(P),
      side: new Uint8Array(P),
      curtain: new Float32Array(P),
      intake: buildPaths(cylinder, 'intake'),
      exhaust: buildPaths(cylinder, 'exhaust'),
    };
    for (let i = 0; i < P; i++) {
      pool.q[i] = (i + r()) / P;
      pool.entry[i] = cumInverse(INTAKE_CUM, pool.q[i]!);
      pool.rr[i] = Math.sqrt(r()) * (BORE_R - 2.5);
      pool.ang[i] = r() * Math.PI * 2;
      pool.h[i] = 0.08 + 0.84 * r();
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 0.72;
      pool.ox[i] = Math.cos(a) * d;
      pool.oy[i] = Math.sin(a) * d;
      pool.side[i] = r() < 0.5 ? 0 : 1;
      pool.curtain[i] = (r() - 0.5) * Math.PI * 1.1;
    }
    // exit order: gas nearest the exhaust side (+Z) and the roof leaves first
    const order = Array.from({ length: P }, (_, i) => i).sort((a, b) => {
      const ka = Math.sin(pool.ang[a]!) * pool.rr[a]! / BORE_R + pool.h[a]! * 0.6 + 0.35 * Math.sin(a * 12.9898);
      const kb = Math.sin(pool.ang[b]!) * pool.rr[b]! / BORE_R + pool.h[b]! * 0.6 + 0.35 * Math.sin(b * 12.9898);
      return kb - ka;
    });
    order.forEach((i, k) => {
      pool.qx[i] = (k + 0.5) / P;
      pool.exit[i] = cumInverse(EXHAUST_CUM, pool.qx[i]!);
    });
    return pool;
  }

  update(crankAngleDeg: number): void {
    let k = 0;
    for (const pool of this.pools) {
      const phi = cycleAngle(pool.cylinder, crankAngleDeg);
      const thetaMech = phi % 360;
      const pinY = pistonPinHeight(thetaMech);
      sparkPoint(pool.cylinder, this.spark);
      for (let inc = -1; inc <= 1; inc++) {
        const psi = phi + inc * 720;
        for (let i = 0; i < P; i++, k++) this.particle(pool, i, psi, phi, pinY, k);
      }
    }
    const g = this.points.geometry;
    for (const name of ['position', 'color', 'alpha', 'size']) (g.getAttribute(name) as BufferAttribute).needsUpdate = true;
  }

  private hide(k: number): void {
    this.alpha[k] = 0;
    this.size[k] = 0;
  }

  private set(k: number, p: Vector3, r: number, g: number, b: number, a: number, size: number): void {
    this.pos[k * 3] = p.x;
    this.pos[k * 3 + 1] = p.y;
    this.pos[k * 3 + 2] = p.z;
    this.col[k * 3] = r;
    this.col[k * 3 + 1] = g;
    this.col[k * 3 + 2] = b;
    this.alpha[k] = a;
    this.size[k] = size;
  }

  /** Position inside a port path with the particle's own lateral offset. */
  private inPort(vp: ValvePath, s: number, ox: number, oy: number, out: Vector3): Vector3 {
    const r = vp.path.at(s, out);
    vp.path.tangent(s, this.t);
    this.e1.crossVectors(this.t, GasFlow.X);
    if (this.e1.lengthSq() < 1e-6) this.e1.set(0, 1, 0);
    this.e1.normalize();
    this.e2.crossVectors(this.t, this.e1).normalize();
    return out.addScaledVector(this.e1, ox * r).addScaledVector(this.e2, oy * r);
  }

  /** Where gas passes the open valve: around its rim, below the seat by the lift. */
  private curtainPoint(v: ValveAxis, lift: number, around: number, out: Vector3): Vector3 {
    const cx = CYLINDER_X[v.cylinder]!;
    // direction from the valve towards the cylinder centre, in the horizontal plane
    const toC = Math.atan2(-v.face.z, cx - v.face.x);
    const a = toC + around;
    const R = v.diameter / 2 + 0.8;
    return out.copy(v.face).addScaledVector(v.dir, -Math.max(lift, 0.6) * 0.8).add(this.w.set(Math.cos(a) * R, -0.5, -Math.sin(a) * R));
  }

  /** Slot of a particle inside the cylinder at the current piston position. */
  private slot(pool: Pool, i: number, swirl: number, pinY: number, out: Vector3): Vector3 {
    const cx = CYLINDER_X[pool.cylinder]!;
    const rr = pool.rr[i]!;
    const a = pool.ang[i]! + swirl;
    const dx = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const bottom = pinY + SPECS.piston.compressionHeight + crownHeightAt(rr) + 1.1;
    const top = ceilingAt(dx, z) - 1.1;
    const y = bottom + Math.max(0, top - bottom) * pool.h[i]!;
    return out.set(cx + dx, y, z);
  }

  private particle(pool: Pool, i: number, psi: number, phi: number, pinY: number, k: number): void {
    const v = this.v;
    const q = pool.q[i]!;
    const deficit = q - intakeExt(psi);

    // ---- waiting / flowing in the intake port ----
    if (deficit > 0) {
      const s = 1 - deficit * L_IN;
      const vp = pool.intake[pool.side[i]!]!;
      if (s < 0) return this.hide(k);
      this.inPort(vp, s, pool.ox[i]!, pool.oy[i]!, v);
      const fade = Math.min(1, s / Math.max(vp.outside, 1e-3));
      return this.set(k, v, 0.36, 0.7, 1.55, 0.85 * fade, 5.4);
    }

    // life on this incarnation's axis: entry ∈ [350, 590], leaving ∈ [720 + 130, 720 + 370]
    const entry = pool.entry[i]!;
    const leave = 720 + pool.exit[i]!;
    const swirl = 0.9 * Math.log(1 + Math.max(0, psi - entry) / 40);

    if (psi < leave) {
      this.slot(pool, i, swirl, pinY, v);
      const since = psi - entry;
      if (since < 22) {
        // a short jet: throat → past the valve head (curtain) → out into the cylinder
        const vp = pool.intake[pool.side[i]!]!;
        const lift = valveLift('intake', 0, Math.min(psi, 719.9));
        if (since < 5) {
          const throat = this.inPort(vp, 1, pool.ox[i]! * 0.5, pool.oy[i]! * 0.5, new Vector3());
          this.curtainPoint(vp.valve, lift, pool.curtain[i]!, this.w);
          v.lerpVectors(throat, this.w, since / 5);
        } else {
          const t = (since - 5) / 17;
          this.curtainPoint(vp.valve, lift, pool.curtain[i]!, this.w);
          v.lerpVectors(this.w, v, 1 - (1 - t) * (1 - t));
        }
      }
      return this.colourInCylinder(psi, phi, v, k);
    }

    // ---- leaving: to the exhaust valve, then out through the port ----
    const e = cumAt(EXHAUST_CUM, psi - 720) - pool.qx[i]!;
    const side = Math.cos(pool.ang[i]! + swirl) > 0 ? 1 : 0; // rear valve for gas behind the bore axis
    const vp = pool.exhaust[side]!;
    const lift = valveLift('exhaust', 0, psi - 720);
    const heat = this.heat(psi - 720) * 0.7 + 0.12;
    if (e < 0.05) {
      this.slot(pool, i, swirl, pinY, this.w);
      const from = this.w.clone();
      this.curtainPoint(vp.valve, lift, -pool.curtain[i]!, this.w);
      if (e < 0.03) v.lerpVectors(from, this.w, smooth(e / 0.03));
      else {
        const throat = this.inPort(vp, 0, pool.ox[i]! * 0.5, pool.oy[i]! * 0.5, new Vector3());
        v.lerpVectors(this.w, throat, (e - 0.03) / 0.02);
      }
      return this.set(k, v, ...burnt(heat), 0.88, 5.4);
    }
    const s = (e - 0.05) * L_EX;
    if (s > 1) return this.hide(k);
    this.inPort(vp, s, pool.ox[i]!, pool.oy[i]!, v);
    const out = s > 1 - vp.outside ? 1 - (s - (1 - vp.outside)) / vp.outside : 1;
    const cool = heat * (1 - 0.55 * s);
    return this.set(k, v, ...burnt(cool), 0.85 * out, 5.4 + 3 * Math.max(0, s - 0.8));
  }

  /** 0..1 glow from the gas temperature. */
  private heat(phi: number): number {
    const T = gasTemperature(phi);
    return Math.min(1, Math.max(0, (T - 950) / 1700));
  }

  private colourInCylinder(psi: number, phi: number, p: Vector3, k: number): void {
    // angle from this charge's firing TDC (ignition at −15°)
    const fromTdc = psi - 720;
    if (fromTdc < -15) {
      // fresh charge; a little denser/brighter as it is compressed
      const comp = Math.min(1, Math.max(0, (psi - 600) / 120));
      return this.set(k, p, 0.36 + 0.1 * comp, 0.7 + 0.1 * comp, 1.55 + 0.35 * comp, 0.8 + 0.15 * comp, 5.2);
    }
    const R = flameRadius(phi);
    const d = p.distanceTo(this.spark);
    if (d > R) {
      // unburnt, about to be reached by the flame front
      return this.set(k, p, 0.46, 0.76, 1.8, 0.95, 5.2);
    }
    // burnt: just behind the front it is brightest, then it cools with the gas temperature
    const heat = this.heat(phi);
    const front = Math.max(0, 1 - (R - d) / 14);
    const [r, g, b] = burnt(heat);
    const boost = 1 + 1.8 * front;
    return this.set(k, p, r * boost, g * boost, b * boost, 0.92, 5.4 + front * 1.6);
  }
}

/** Burnt-gas colour (linear, HDR when hot): bright orange → dull orange-grey. */
function burnt(heat: number): [number, number, number] {
  const h = Math.min(1, Math.max(0, heat));
  const glow = h * h * 4.5;
  return [0.5 + 0.55 * h + glow, 0.43 + 0.15 * h + glow * 0.42, 0.4 - 0.2 * h + glow * 0.1];
}

function smooth(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}
