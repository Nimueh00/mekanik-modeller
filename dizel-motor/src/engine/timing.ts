import { camLift, valveLiftFromTappet, wrap180 } from './camProfile';
import { wrapCycle } from './kinematics';
import { SPECS } from './specs';

/*
 * Valve timing: which lobe points where, and how much each valve is lifted at
 * a given engine-clock angle.
 *
 * Conventions
 *   crankAngle = 0  → cylinder 1 at its *firing* TDC.
 *   Cycle angle φ of a cylinder = crankAngle − firingTdc[cyl], wrapped to
 *   [0, 720): 0 power-stroke TDC, 180 BDC, 360 overlap TDC, 540 BDC.
 *   Angles "about X" use R_x(a)·(0,1,0) = (0, cos a, sin a); the crankshaft
 *   (rotation.x = θ) and the camshafts (rotation.x = θ/2) both turn this way.
 */

export type ValveKind = 'intake' | 'exhaust';

const T = SPECS.valveTrain.timing;
const HALF_INCLUDED = SPECS.valveTrain.includedAngleDeg / 2;

/** Crank angle of each cylinder's firing TDC (index 0 = cylinder 1). 1-3-4-2 → 0, 540, 180, 360. */
export const FIRING_TDC: readonly number[] = (() => {
  const out = new Array<number>(SPECS.cylinders).fill(0);
  SPECS.firingOrder.forEach((cyl, k) => {
    out[cyl - 1] = k * (720 / SPECS.cylinders);
  });
  return out;
})();

/** Cycle angle φ ∈ [0, 720) of cylinder `index` (0 = power-stroke TDC). */
export function cycleAngle(index: number, crankAngleDeg: number): number {
  return wrapCycle(crankAngleDeg - FIRING_TDC[index]!);
}

/** Valve events as cycle angles φ (0 = firing TDC). */
export const VALVE_EVENTS = {
  intake: { open: 360 - T.ivoBtdc, close: 540 + T.ivcAbdc },
  exhaust: { open: 180 - T.evoBbdc, close: 360 + T.evcAtdc },
} as const;

/** Cycle angle of maximum lift (centre of the event). */
export const LOBE_CENTRE = {
  intake: (VALVE_EVENTS.intake.open + VALVE_EVENTS.intake.close) / 2, // 470 → 110° ATDC
  exhaust: (VALVE_EVENTS.exhaust.open + VALVE_EVENTS.exhaust.close) / 2, // 250 → 110° BTDC
} as const;

/**
 * Valve axis tilt about +X: the axis direction is R_x(tilt)·(0,1,0).
 * Intake valves sit on −Z and lean to −Z, exhaust on +Z and lean to +Z
 * (same convention as the piston's `valvePockets()`).
 */
export const VALVE_TILT_DEG: Record<ValveKind, number> = { intake: -HALF_INCLUDED, exhaust: HALF_INCLUDED };

/** Camshaft rotation (degrees about +X) for a crank rotation: exactly half. */
export function camRotationDeg(crankDeg: number): number {
  return crankDeg / 2;
}

/**
 * Angle (about X, in the camshaft's own frame) at which the lobe nose of
 * cylinder `index` points.
 *
 * The tappet lies on the valve axis below the cam, so seen from the cam
 * centre it is in direction (tilt + 180°). Maximum lift needs the nose to
 * point there when the crank is at the lobe centre:
 *   λ + camRotation(firingTdc + lobeCentre) = tilt + 180°
 *   λ = tilt + 180° − (firingTdc + lobeCentre) / 2
 * e.g. cylinder 1 intake: −21 + 180 − 470/2 = −76°; exhaust: 21 + 180 − 250/2 = 76°.
 * Consecutive cylinders in firing order are 90° apart on each camshaft.
 */
export function lobeAngleDeg(kind: ValveKind, index: number): number {
  return wrap180(VALVE_TILT_DEG[kind] + 180 - (FIRING_TDC[index]! + LOBE_CENTRE[kind]) / 2);
}

/** Angle between the lobe nose and the tappet axis (cam degrees). */
export function noseToTappetDeg(kind: ValveKind, index: number, crankAngleDeg: number): number {
  return wrap180(lobeAngleDeg(kind, index) + camRotationDeg(crankAngleDeg) - (VALVE_TILT_DEG[kind] + 180));
}

/** Tappet (bucket follower) lift in mm. */
export function tappetLift(kind: ValveKind, index: number, crankAngleDeg: number): number {
  return camLift(noseToTappetDeg(kind, index, crankAngleDeg));
}

/** Valve lift in mm (0 when seated). */
export function valveLift(kind: ValveKind, index: number, crankAngleDeg: number): number {
  return valveLiftFromTappet(tappetLift(kind, index, crankAngleDeg));
}

export type Stroke = 'intake' | 'compression' | 'power' | 'exhaust';

/** Stroke a cylinder is in, by piston travel (TDC/BDC boundaries). */
export function strokeOf(index: number, crankAngleDeg: number): Stroke {
  const phi = cycleAngle(index, crankAngleDeg);
  if (phi < 180) return 'power';
  if (phi < 360) return 'exhaust';
  if (phi < 540) return 'intake';
  return 'compression';
}

export const STROKE_TR: Record<Stroke, string> = {
  intake: 'Emme',
  compression: 'Sıkıştırma',
  power: 'Genişleme (İş)',
  exhaust: 'Egzoz',
};
