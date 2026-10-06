import { CRANK_RADIUS, SPECS } from './specs';

const DEG = Math.PI / 180;

/** Wrap any angle into [0, 720). */
export function wrapCycle(deg: number): number {
  const w = deg % 720;
  return w < 0 ? w + 720 : w;
}

/**
 * Mechanical crank angle seen by cylinder `index` (0-based) for a given engine
 * clock angle. Cylinders 1 & 4 share a throw at 0°, 2 & 3 at 180°.
 * Returns degrees in [0, 360).
 */
export function cylinderCrankAngle(index: number, crankAngleDeg: number): number {
  const throwDeg = SPECS.crankThrowDeg[index];
  if (throwDeg === undefined) throw new RangeError(`no cylinder ${index}`);
  const a = (crankAngleDeg + throwDeg) % 360;
  return a < 0 ? a + 360 : a;
}

/**
 * Exact slider-crank solution: height of the piston pin above the crank
 * centreline. θ = 0 is TDC.
 *   x(θ) = r·cosθ + √(l² − r²·sin²θ)
 */
export function pistonPinHeight(thetaDeg: number, r = CRANK_RADIUS, l: number = SPECS.rodLength): number {
  const t = thetaDeg * DEG;
  const s = Math.sin(t);
  return r * Math.cos(t) + Math.sqrt(l * l - r * r * s * s);
}

/** Distance of the piston below TDC (0 at TDC, = stroke at BDC). */
export function pistonDrop(thetaDeg: number): number {
  return pistonPinHeight(0) - pistonPinHeight(thetaDeg);
}

export interface SliderCrankPose {
  /** Crank pin centre, in the cylinder's (y, z) plane. */
  pinY: number;
  pinZ: number;
  /** Piston (gudgeon) pin centre height; it always lies on z = 0. */
  pistonY: number;
  /**
   * Rotation about +X (radians) that turns the rod's local +Y axis
   * (big end → small end) onto the world vector crankpin → piston pin.
   */
  rodAngle: number;
}

/**
 * Full pose of the slider-crank for one cylinder.
 *
 * The crank rotates about +X; a rotation of θ carries the throw from +Y
 * towards +Z, i.e. pin = (r·cosθ, r·sinθ) in (y, z). This matches
 * `Object3D.rotation.x = θ`, so the crankshaft mesh and this function agree by
 * construction.
 */
export function sliderCrankPose(thetaDeg: number, r = CRANK_RADIUS, l: number = SPECS.rodLength): SliderCrankPose {
  const t = thetaDeg * DEG;
  const pinY = r * Math.cos(t);
  const pinZ = r * Math.sin(t);
  const dy = Math.sqrt(l * l - pinZ * pinZ);
  const pistonY = pinY + dy;
  // R_x(φ)·(0,1,0) = (0, cosφ, sinφ) must equal (0, dy, -pinZ)/l
  const rodAngle = Math.atan2(-pinZ, dy);
  return { pinY, pinZ, pistonY, rodAngle };
}
