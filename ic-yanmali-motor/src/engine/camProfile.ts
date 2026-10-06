import { SPECS } from './specs';

/**
 * The cam lobe profile — the single source for both the lobe geometry and the
 * valve motion.
 *
 * `camLift(δ)` is the lift of the flat-faced bucket tappet, in mm, as a
 * function of δ = the angle (cam degrees) between the lobe nose and the
 * tappet axis. The profile is symmetric and made of three parts:
 *
 *   |δ| ≥ β + ρ        base circle, lift 0
 *   β ≤ |δ| < β + ρ    clearance ramp: takes up the valve lash. Quintic
 *                      Q(s) = a·s³ + b·s⁴ + c·s⁵ — starts with zero velocity
 *                      and acceleration, ends at `lash` with the seating
 *                      velocity and zero acceleration.
 *   |δ| < β            valve-open event, lift = lash + maxLift·y(u),
 *                      u = 1 − |δ|/β (0 at the seat, 1 at the nose). y is a
 *                      piecewise-harmonic profile defined by its acceleration:
 *                        u ∈ [0, u1]   +A1·sin(π·u/u1)          (flank pulse)
 *                        u ∈ [u1, u2]  0                         (constant velocity)
 *                        u ∈ [u2, 1]   −A2·sin(π/2·(u−u2)/(1−u2)) (nose)
 *                      Acceleration is continuous everywhere (C²-lift), the
 *                      velocity is v0 at the seat and 0 at the nose.
 *
 * The valve itself only moves while the cam is above the lash, so
 *   valve lift = max(0, camLift − lash)
 * is exactly zero outside |δ| < β and exactly maxLift at δ = 0. With
 * β = 60 cam° = 120 crank° each event lasts exactly 240 crank°, matching
 * VISION §3 (IVO 10° BTDC → IVC 50° ABDC, EVO 50° BBDC → EVC 10° ATDC).
 */

const C = SPECS.cam;
export const MAX_LIFT = SPECS.valveTrain.maxLift;
export const LASH = SPECS.valveTrain.lash;
export const BASE_RADIUS = C.baseCircleRadius;
export const HALF_OPEN = C.halfOpenDeg;
export const RAMP = C.rampDeg;

const v0 = C.rampVelocity;
const u1 = C.flankEnd;
const u2 = C.noseStart;
const w = 1 - u2;
// Closed form from v(1) = 0 and y(1) = 1 (see derivation in docs/PROGRESS.md).
const V1 = (1 - (v0 * u1) / 2) / (u2 - u1 / 2 + (2 * w) / Math.PI);
const A1 = ((V1 - v0) * Math.PI) / (2 * u1);
const A2 = (V1 * Math.PI) / (2 * w);
const y1 = v0 * u1 + (A1 * u1 * u1) / Math.PI;
const y2 = y1 + V1 * (u2 - u1);

/** Normalised valve lift y(u), u ∈ [0, 1]; y(0) = 0, y(1) = 1. */
function openProfile(u: number): number {
  if (u <= u1) {
    const k = u1 / Math.PI;
    return v0 * u + A1 * k * (u - k * Math.sin(u / k));
  }
  if (u <= u2) return y1 + V1 * (u - u1);
  const t = u - u2;
  const k = (2 * w) / Math.PI;
  return y2 + V1 * t - A2 * k * (t - k * Math.sin(t / k));
}

// Ramp polynomial: Q(1) = 1, Q'(1) = q1 (velocity match), Q''(1) = 0.
const q1 = (MAX_LIFT * v0 * RAMP) / (HALF_OPEN * LASH);
// Solution of [1 1 1; 3 4 5; 6 12 20]·[a b c] = [1 q1 0]:
const Qc = [10 - 4 * q1, -15 + 7 * q1, 6 - 3 * q1] as const;

function rampProfile(s: number): number {
  return s * s * s * (Qc[0] + s * (Qc[1] + s * Qc[2]));
}

/** Tappet lift (mm) for a nose-to-tappet angle δ in cam degrees. */
export function camLift(deltaDeg: number): number {
  const a = Math.abs(wrap180(deltaDeg));
  if (a >= HALF_OPEN + RAMP) return 0;
  // (clamped so round-off can never lift the valve off its seat on the ramp)
  if (a >= HALF_OPEN) return Math.min(LASH, LASH * rampProfile((HALF_OPEN + RAMP - a) / RAMP));
  return LASH + MAX_LIFT * openProfile(1 - a / HALF_OPEN);
}

/** Valve lift (mm) produced by a tappet lift: the lash is taken up first. */
export function valveLiftFromTappet(tappetLift: number): number {
  return Math.max(0, tappetLift - LASH);
}

/** Valve lift (mm) for a nose-to-tappet angle δ in cam degrees. */
export function valveLiftAtCam(deltaDeg: number): number {
  return valveLiftFromTappet(camLift(deltaDeg));
}

/** Wrap into (−180, 180]. */
export function wrap180(deg: number): number {
  let a = deg % 360;
  if (a <= -180) a += 360;
  else if (a > 180) a -= 360;
  return a;
}

/**
 * Lobe outline for a flat-faced follower, from the support function
 * h(φ) = R_b + camLift(φ): the lobe is the convex body whose supporting line
 * at distance h(φ) in direction φ is exactly the bucket face. Boundary point:
 *   p(φ) = h·n(φ) + h'(φ)·t(φ),   n = (cos φ, sin φ), t = (−sin φ, cos φ)
 * Returned in the lobe's own 2D frame: nose along +first axis.
 */
export function lobeOutline(segments = 360): [number, number][] {
  const out: [number, number][] = [];
  const dd = 0.01; // deg, for the numerical derivative of the (smooth) profile
  for (let i = 0; i < segments; i++) {
    const phiDeg = (i / segments) * 360 - 180;
    const phi = (phiDeg * Math.PI) / 180;
    const h = BASE_RADIUS + camLift(phiDeg);
    const dh = ((camLift(phiDeg + dd) - camLift(phiDeg - dd)) / (2 * dd)) * (180 / Math.PI);
    out.push([h * Math.cos(phi) - dh * Math.sin(phi), h * Math.sin(phi) + dh * Math.cos(phi)]);
  }
  return out;
}
