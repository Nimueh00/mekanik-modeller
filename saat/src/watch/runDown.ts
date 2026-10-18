import { BANKING_DEG, beatPhase, FULL_AMPLITUDE, leverAngle } from './escapement';
import type { BalanceDrive } from './pose';
import { BEATS_PER_SECOND, ESCAPEMENT } from './specs';

/**
 * What the balance does when the movement stops (the mainspring is empty or
 * the hack lever presses on the balance). Time `t` stands still, but the
 * balance keeps swinging for a moment with a decaying amplitude, and the
 * lever settles on a banking pin with the escape wheel locked.
 */

/** The amplitude falls to nothing in this many seconds (real time) after the spring runs down. */
export const RUN_DOWN_SECONDS = 2;
/** The hack lever stops the balance much faster. */
export const HACK_SECONDS = 0.25;
/** A stopped watch regains its full amplitude in this time once it is wound / released. */
export const RESTART_SECONDS = 0.3;

const HALF_LIFT = ESCAPEMENT.liftAngleDeg / 2;

/** Banking the lever rests on when the watch stops at time t: the one it is on or moving to. */
export function stopBanking(t: number, amplitude: number = FULL_AMPLITUDE): 1 | -1 {
  const p = beatPhase(t, amplitude);
  if (Math.abs(p.lever) > 1e-9) return p.lever > 0 ? 1 : -1;
  return p.balance > 0 ? -1 : 1; // lever = −slot(θ): a positive balance angle leaves it on the negative banking
}

/** Balance angle (degrees) at which the impulse pin rests against the fork when the lever sits on `bank`. */
export const restAngle = (bank: 1 | -1): number => -bank * HALF_LIFT;

export interface BalancePose {
  balance: number;
  lever: number;
  /** Swing amplitude actually in use, degrees. */
  amplitude: number;
}

/**
 * Balance and lever angles. Without a `drive` (or at full envelope) this is
 * exactly `beatPhase`. While the envelope is below 1 the balance swings with
 * amplitude `env·A`, its phase carried on in real time (`age`) when the
 * movement is stopped, and is drawn towards the rest angle; the lever is
 * blended from the natural pin-in-slot motion to the banking it will rest on.
 */
export function balancePose(t: number, trainAmplitude: number, drive?: BalanceDrive): BalancePose {
  if (!drive || drive.env >= 1) {
    const p = beatPhase(t, trainAmplitude);
    return { balance: p.balance, lever: p.lever, amplitude: trainAmplitude };
  }
  const env = Math.max(0, drive.env);
  const amplitude = trainAmplitude * env;
  // θ = A sin(π·2f·time): the phase runs on in real time while t stands still
  const x = (t + drive.age) * BEATS_PER_SECOND;
  const balance = amplitude * Math.sin(Math.PI * x) + (1 - env) * restAngle(drive.bank);
  const lever = env * leverAngle(balance) + (1 - env) * drive.bank * BANKING_DEG;
  return { balance, lever, amplitude };
}
