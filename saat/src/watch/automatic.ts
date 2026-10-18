import { AUTOMATIC, RATCHET } from './specs';

/**
 * Automatic winding. The rotor turns on a ball bearing about the movement
 * centre and its pinion drives reverser wheel 1 directly and reverser wheel 2
 * through wheel 1, so the two turn opposite ways whichever way the rotor goes.
 * Each reverser wheel drives its own pinion only in the winding sense (a pawl;
 * the other one slips). Both pinions mesh the reduction wheel, whose pinion
 * turns the ratchet.
 */

const RP = AUTOMATIC.rotorPinion;
const RW = AUTOMATIC.reverserWheel;
const RPIN = AUTOMATIC.reverserPinion;
const RED_W = AUTOMATIC.reductionWheel;
const RED_P = AUTOMATIC.reductionPinion;

/** Ratchet turns per rotor turn: 14/21 · 8/48 · 8/64 = 1/72. */
export const RATCHET_PER_ROTOR_TURN =
  (RP.teeth / RW.teeth) * (RPIN.teeth / RED_W.teeth) * (RED_P.teeth / RATCHET.gear.teeth);

/** Mainspring turns wound by a rotor movement of `deltaDeg`, either way (the reverser makes both wind). */
export const rotorWindTurns = (deltaDeg: number): number => (Math.abs(deltaDeg) / 360) * RATCHET_PER_ROTOR_TURN;

// ------------------------------------------------------------ poses (rotY degrees)

/** Reverser wheel 1 meshes the rotor pinion: opposite sense. */
export const reverser1Angle = (rotorDeg: number): number => -(RP.teeth / RW.teeth) * rotorDeg;
/** Reverser wheel 2 meshes wheel 1: the rotor's sense. */
export const reverser2Angle = (rotorDeg: number): number => (RP.teeth / RW.teeth) * rotorDeg;

/** Reduction wheel (and its pinion) follow the ratchet: the pinion meshes the ratchet gear. */
export const reductionAngle = (ratchetDeg: number): number => -(RATCHET.gear.teeth / RED_P.teeth) * ratchetDeg;
/** Both reverser pinions mesh the reduction wheel and always turn the same way. */
export const reverserPinionAngle = (ratchetDeg: number): number =>
  -(RED_W.teeth / RPIN.teeth) * reductionAngle(ratchetDeg);

/**
 * Balls of the bearing orbit at the cage speed. The inner race is fixed, so the
 * cage turns at R_out/(R_in + R_out) of the rotor's speed.
 */
export const CAGE_RATIO = AUTOMATIC.bearing.outerRadius / (AUTOMATIC.bearing.innerRadius + AUTOMATIC.bearing.outerRadius);

// ------------------------------------------------------------ the wrist

/**
 * A made-up wrist motion for the demonstration (the rotor of a real watch is
 * swung by the wearer's arm; in the scene the movement itself stands still, so
 * this stands in for gravity acting on a moving wrist). Returns the rotor angle
 * in degrees at "wrist time" tw seconds: swings of 120°–330° at about one swing per 1.7 s, rising and
 * falling with a slower rhythm. Deterministic and continuous.
 */
export function wristMotion(tw: number): number {
  const swell = 0.5 + 0.5 * Math.sin((2 * Math.PI * tw) / 11.3);
  const amplitude = 120 + 210 * swell * (0.6 + 0.4 * Math.sin((2 * Math.PI * tw) / 4.1 + 1));
  return amplitude * Math.sin((2 * Math.PI * tw) / 1.7);
}
