import { BANKING_DEG, escapeOffset, slotAngle } from './geometry/escapeGeometry';
import { BEATS_PER_SECOND, ESCAPEMENT, MAINSPRING, MOVEMENT } from './specs';

const HALF_LIFT = ESCAPEMENT.liftAngleDeg / 2;

// The pin-in-slot relation, the bankings and the lever → escape map live with
// the escapement geometry they are drawn from.
export { BANKING_DEG, escapeOffset, slotAngle } from './geometry/escapeGeometry';

/** Total lever swing, banking to banking. */
export const LEVER_TOTAL_DEG = 2 * BANKING_DEG;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Lever (pallet fork) angle for a balance angle, degrees. Inside the lift
 * window (|θ| < lift/2) the impulse pin drives the fork; outside it the lever
 * rests on its banking. Clamping θ before the slot relation makes the result
 * a continuous function of θ that is constant outside the window. The lever
 * turns in the opposite sense to the balance, as a pin in a slot does.
 */
export function leverAngle(balanceDeg: number): number {
  return -slotAngle(clamp(balanceDeg, -HALF_LIFT, HALF_LIFT));
}

/**
 * Balance amplitude from the state of wind (fraction of the effective
 * mainspring turns left). Simple linear model between the fully-wound and the
 * end-of-reserve amplitudes; real springs fall off faster near the end.
 */
export function balanceAmplitude(windTurns: number): number {
  const { amplitudeFullDeg: full, amplitudeEmptyDeg: empty } = ESCAPEMENT.balance;
  const w = clamp(windTurns / MAINSPRING.effectiveTurns, 0, 1);
  return empty + (full - empty) * w;
}

/** Inverse of `balanceAmplitude`: the state of wind (turns) that gives an amplitude. */
export function windTurnsForAmplitude(amplitudeDeg: number): number {
  const { amplitudeFullDeg: full, amplitudeEmptyDeg: empty } = ESCAPEMENT.balance;
  return clamp((amplitudeDeg - empty) / (full - empty), 0, 1) * MAINSPRING.effectiveTurns;
}

export const FULL_AMPLITUDE = ESCAPEMENT.balance.amplitudeFullDeg;

export interface BeatPhase {
  /** Index of the nearest beat (balance zero crossing at t = beat / 6 s). Integer. */
  beat: number;
  /**
   * Escape progress relative to that beat, in beats, within [−½, ½]: −½ before
   * the impulse, +½ after it, sweeping in step with the lever during the
   * impulse (see `escapeOffset`). Escape position = beat + offset beats.
   */
  offset: number;
  /** Balance angle, degrees. */
  balance: number;
  /** Lever angle, degrees. */
  lever: number;
}

/**
 * The one beat-phase function shared by the escapement and the train.
 *
 * θ(t) = A·sin(2π f t). Beats are the zero crossings, t_k = k / (2f). Writing
 * 2f·t = k + u with k the nearest integer keeps the phase small at large t:
 *   θ = (−1)^k · A · sin(π u)
 * During beat k the balance swings through the lift window in the direction
 * σ = (−1)^k and the lever crosses from one banking to the other; the escape
 * wheel is unlocked for the middle part of that swing (`escapeOffset`) and
 * sits at ±½ (locked) otherwise. No recoil: it never runs back.
 */
export function beatPhase(t: number, amplitude: number = FULL_AMPLITUDE): BeatPhase {
  const x = t * BEATS_PER_SECOND;
  const beat = Math.round(x);
  const u = x - beat;
  const sigma = beat % 2 === 0 ? 1 : -1;
  const balance = sigma * amplitude * Math.sin(Math.PI * u);
  const lever = leverAngle(balance);
  return { beat, offset: escapeOffset(lever, sigma), balance, lever };
}

/** Balance angle at time t, degrees. */
export function balanceAngle(t: number, amplitude: number = FULL_AMPLITUDE): number {
  return beatPhase(t, amplitude).balance;
}

/** Half-width (s) of the lift window around each beat at a given amplitude. */
export function liftWindowHalfWidth(amplitude: number = FULL_AMPLITUDE): number {
  return Math.asin(HALF_LIFT / amplitude) / (2 * Math.PI * MOVEMENT.frequencyHz);
}
