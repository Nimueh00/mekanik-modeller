import { type GearSpec, pitchRadius, type P2, tipRadius, type TrainGear } from '../specs';

/**
 * Horological tooth forms (plan outlines, mm, centred on the arbor).
 *
 * Watch trains do not use involute teeth: they use an epicycloidal form whose
 * working flank above the pitch circle is, in the NIHS 20-25 practice, drawn
 * as a circular "ogive", with radial (straight, through the centre) flanks
 * below the pitch circle. Pinion leaves have radial flanks and a rounded
 * (semicircular) tip. The ratios below follow NIHS 20-25 in spirit:
 *
 *   wheel   tooth thickness on the pitch circle  s = 1.41 m   (gap 1.73 m)
 *           addendum                            ha = 1.00 m
 *           dedendum                            hf = π/2 m ≈ 1.57 m
 *           root fillet                              0.25 m
 *   pinion  leaf thickness on the pitch circle  s = 1.05 m   (Z ≥ 8)
 *           addendum = the semicircular tip      ≈ 0.53–0.66 m (from s and Z)
 *           dedendum                            hf = 1.40 m   (wheel addendum + 0.4 m)
 *
 * NIHS gives the wheel an addendum of ≈ 1.3–1.4 m. Here it is capped at 1 m:
 * the ogive must stay inside `tipRadius(g)` = pitch radius + m, the circle the
 * layout clearance tests of P1 are based on. The ogive radius is solved so
 * that the two arcs meet exactly on that circle (a pointed arch, ≈ 1.06 m).
 * With 1.41 m teeth in 2.09 m pinion gaps and 1.05 m leaves in 1.73 m wheel
 * gaps there is generous backlash, as in real watch trains (they run dry of
 * conjugate action on purpose, to tolerate dirt and pivot shake).
 */
export const WHEEL_FORM = { thickness: 1.41, addendum: 1.0, dedendum: Math.PI / 2, rootFillet: 0.25 } as const;
export const PINION_FORM = { thickness: 1.05, dedendum: 1.4 } as const;

/**
 * Rotation about +Y applied to a plan point (x, z), the same transform as
 * `Object3D.rotation.y`: x' = x·cos a + z·sin a, z' = −x·sin a + z·cos a.
 */
export function rotY(p: P2, deg: number): P2 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
}

/** Rotation-about-+Y angle (degrees) of the direction of plan vector v: rotY([1, 0], a) ∥ v. */
export function angleY(v: P2): number {
  return (Math.atan2(-v[1], v[0]) * 180) / Math.PI;
}

/** Point at radius r, polar angle a (radians, counter-clockwise in the (x, z) numbers). */
const polar = (r: number, a: number): P2 => [r * Math.cos(a), r * Math.sin(a)];

/** Arc samples from angle a0 to a1 about c (radians), end points included. */
function arc(c: P2, r: number, a0: number, a1: number, segs: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}

/** Repeat one tooth (listed counter-clockwise, centred on angle 0) Z times around the centre. */
function pattern(tooth: readonly P2[], z: number): P2[] {
  const out: P2[] = [];
  for (let k = 0; k < z; k++) {
    const a = (2 * Math.PI * k) / z;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [x, y] of tooth) out.push([x * c - y * s, x * s + y * c]);
  }
  return out;
}

/** Clamp every vertex onto the tip circle at most (guards the tip-radius contract against rounding). */
function clampRadius(pts: P2[], rMax: number): P2[] {
  return pts.map((p) => {
    const r = Math.hypot(p[0], p[1]);
    return r > rMax ? ([(p[0] * rMax) / r, (p[1] * rMax) / r] as P2) : p;
  });
}

export interface OutlineOptions {
  /** Segments per ogive / tip arc. */
  arcSegs?: number;
}

/** Mirror a half tooth (listed from the tooth axis outwards, angle ≥ 0) into a whole tooth, counter-clockwise. */
function wholeTooth(upper: readonly P2[]): P2[] {
  const lower = [...upper].reverse().map(([x, y]) => [x, -y] as P2);
  // the first upper point lies on the axis: do not repeat it; the last one is mid-gap and starts the next tooth
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Wheel outline: radial flanks below the pitch circle, ogival tip above it.
 * Closed polygon, counter-clockwise in (x, z) numbers; tooth 0 is centred on
 * +X (angle 0 for `rotY`).
 */
export function wheelOutline(g: GearSpec, { arcSegs = 5 }: OutlineOptions = {}): P2[] {
  const m = g.module;
  const z = g.teeth;
  const rp = pitchRadius(g);
  const ra = rp + WHEEL_FORM.addendum * m;
  const rf = rp - WHEEL_FORM.dedendum * m;
  const fr = WHEEL_FORM.rootFillet * m;
  const beta = (WHEEL_FORM.thickness * m) / (2 * rp); // half tooth angle on the pitch circle
  const half = Math.PI / z; // half pitch angle

  // Ogive of the upper flank: an arc tangent to the radial flank at the pitch
  // point P, centred on the inward normal n, closing on the tooth axis at ra.
  const P = polar(rp, beta);
  const n: P2 = [Math.sin(beta), -Math.cos(beta)];
  const A = ra - P[0];
  const B = P[1];
  const rho = (A * A + B * B) / (2 * (A * n[0] - B * n[1]));
  const C: P2 = [P[0] + rho * n[0], P[1] + rho * n[1]];
  const ogive = arc(C, rho, Math.atan2(-C[1], ra - C[0]), Math.atan2(P[1] - C[1], P[0] - C[0]), arcSegs); // tip → P
  // Root fillet tangent to the radial flank and to the root circle, then the root arc to mid-gap.
  const t = Math.sqrt((rf + fr) ** 2 - fr * fr);
  const fc: P2 = [t * Math.cos(beta) - fr * Math.sin(beta), t * Math.sin(beta) + fr * Math.cos(beta)];
  const fa0 = Math.atan2(-Math.cos(beta), Math.sin(beta)); // towards the flank
  const fa1 = Math.atan2(-fc[1], -fc[0]); // towards the root circle
  let dfa = fa1 - fa0;
  while (dfa > Math.PI) dfa -= 2 * Math.PI;
  while (dfa < -Math.PI) dfa += 2 * Math.PI;
  const fillet = arc(fc, fr, fa0, fa0 + dfa, 3);
  const rootA = Math.atan2(fc[1], fc[0]);
  const root = arc([0, 0], rf, rootA, half, 2).slice(1);
  const upper: P2[] = [[ra, 0], ...ogive.slice(1), ...fillet, ...root];
  return clampRadius(pattern(wholeTooth(upper), z), tipRadius(g));
}

/**
 * Pinion outline: radial leaf flanks and a semicircular tip tangent to both
 * flanks on the pitch circle; the gap bottom is one round tangent to both
 * flanks of the gap. Same conventions as `wheelOutline` (leaf 0 on +X).
 */
export function pinionOutline(g: GearSpec, { arcSegs = 6 }: OutlineOptions = {}): P2[] {
  const m = g.module;
  const z = g.teeth;
  const rp = pitchRadius(g);
  const rf = rp - PINION_FORM.dedendum * m;
  const beta = (PINION_FORM.thickness * m) / (2 * rp);
  const half = Math.PI / z;
  // Tip circle tangent to both radial flanks, touching them on the pitch circle.
  const cx = rp / Math.cos(beta);
  const rt = rp * Math.tan(beta);
  const tip = arc([cx, 0], rt, 0, Math.PI / 2 + beta, Math.max(2, Math.ceil(arcSegs / 2))); // axis → pitch point
  // Gap round: centre on the mid-gap ray, tangent to the flank, bottom on the root circle.
  const sg = Math.sin(half - beta);
  const rg = (rf * sg) / (1 - sg);
  const gc = polar(rf + rg, half);
  const foot = polar((rf + rg) * Math.cos(half - beta), beta); // tangent point on the flank
  const ga0 = Math.atan2(foot[1] - gc[1], foot[0] - gc[0]);
  const ga1 = half + Math.PI; // gap bottom
  let dga = ga1 - ga0;
  while (dga > Math.PI) dga -= 2 * Math.PI;
  while (dga < -Math.PI) dga += 2 * Math.PI;
  const gap = arc(gc, rg, ga0, ga0 + dga, 3);
  const upper: P2[] = [...tip, ...gap];
  return clampRadius(pattern(wholeTooth(upper), z), tipRadius(g));
}

/** Outline of any train gear, by kind. */
export function gearOutline(tg: TrainGear, opts?: OutlineOptions): P2[] {
  return tg.pinion ? pinionOutline(tg.gear, opts) : wheelOutline(tg.gear, opts);
}

/** Root radius of a train gear (the tooth form's dedendum circle). */
export function rootRadius(tg: TrainGear): number {
  const m = tg.gear.module;
  return pitchRadius(tg.gear) - (tg.pinion ? PINION_FORM.dedendum : WHEEL_FORM.dedendum) * m;
}
