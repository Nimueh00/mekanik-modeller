import { angleY } from './geometry/watchGear';
import type { CrownPosition } from './pose';
import { KEYLESS, MOTION_WORKS, type P2, RATCHET, WIND_AXES } from './specs';

/**
 * Keyless works: what turning the crown does in each position, and the poses
 * of the parts that move with the stem. A crown angle is positive when the
 * crown turns clockwise seen from outside (from +X looking in), which is the
 * winding direction; as a rotation about the stem axis (+X) it is negative.
 */

const WINDING = KEYLESS.windingPinion;
const CONTRATE = KEYLESS.crownContrate;
const CROWN_SPUR = KEYLESS.crownSpur;
const SLIDING_LEAF = KEYLESS.slidingPinion.leafTeeth;

/** Ratchet turns per crown turn: winding pinion (10) → contrate (16) → crown wheel spur (36) → ratchet (64). */
export const RATCHET_PER_CROWN = (WINDING.teeth / CONTRATE.teeth) * (CROWN_SPUR.teeth / RATCHET.gear.teeth);
/** Crown turns it takes to wind one full mainspring turn. */
export const CROWN_TURNS_PER_SPRING_TURN = 1 / RATCHET_PER_CROWN;

/** Mainspring turns wound per degree of crown rotation (winding direction). */
export const WIND_TURNS_PER_CROWN_DEG = RATCHET_PER_CROWN / 360;

/**
 * Setting train, crown → sliding pinion (10) → intermediate (16) → its gear
 * (16) → setting wheel (32) → minute wheel (36) → cannon pinion (12). The
 * intermediate contrate turns `leaf/contrate` times as fast as the stem.
 */
export const INTERMEDIATE_PER_CROWN = SLIDING_LEAF / KEYLESS.settingContrate.teeth;
const SETTING_PER_INTERMEDIATE = KEYLESS.settingGear.teeth / KEYLESS.settingWheel.teeth;
/** Minute-hand turns per crown turn. */
export const MINUTE_HAND_PER_CROWN =
  INTERMEDIATE_PER_CROWN *
  SETTING_PER_INTERMEDIATE *
  (KEYLESS.settingWheel.teeth / MOTION_WORKS.minuteWheel.teeth) *
  (MOTION_WORKS.minuteWheel.teeth / MOTION_WORKS.cannonPinion.teeth);
/** Seconds the hands move per degree of crown rotation in position 3 (clockwise crown = hands forward). */
export const HAND_SECONDS_PER_CROWN_DEG = (MINUTE_HAND_PER_CROWN * 3600) / 360;

/** Date ring teeth advanced per crown turn in position 2 (the corrector star has `correctorFingers` fingers). */
export const DATE_TEETH_PER_CROWN =
  INTERMEDIATE_PER_CROWN *
  SETTING_PER_INTERMEDIATE *
  (KEYLESS.settingWheel.teeth / KEYLESS.corrector.teeth) *
  KEYLESS.correctorFingers;
export const DATE_CROWN_DEG_PER_TOOTH = 360 / DATE_TEETH_PER_CROWN;

export interface CrownEffect {
  /** Mainspring turns wound. */
  windTurns: number;
  /** Seconds the hands move (negative: back). */
  handSeconds: number;
  /** Teeth the date ring is advanced. */
  dateTeeth: number;
}

/**
 * Effect of turning the crown by `deg` in a position. Winding and the date star
 * only work one way (the Breguet teeth of the sliding pinion slip backwards,
 * the star's fingers pass over the jumper); the hands can be set both ways.
 */
export function crownEffect(position: CrownPosition, deg: number): CrownEffect {
  switch (position) {
    case 1:
      return { windTurns: Math.max(0, deg) * WIND_TURNS_PER_CROWN_DEG, handSeconds: 0, dateTeeth: 0 };
    case 2:
      return { windTurns: 0, handSeconds: 0, dateTeeth: Math.max(0, deg) / DATE_CROWN_DEG_PER_TOOTH };
    case 3:
      return { windTurns: 0, handSeconds: deg * HAND_SECONDS_PER_CROWN_DEG, dateTeeth: 0 };
  }
}

/** The hack: in position 3 the lever stops the balance (and with it the seconds hand). */
export const stopsBalance = (position: CrownPosition): boolean => position === 3;

/** Stem pull (mm) of a crown position. */
export const pullOf = (position: CrownPosition): number => KEYLESS.pull[position - 1]!;

/** Setting-wheel rocker station of a crown position: 2 neutral (winding), 1 date, 0 hands. */
export const rockerOf = (position: CrownPosition): number => (position === 1 ? 2 : position === 2 ? 1 : 0);

// ------------------------------------------------------------ axial layout of the stem parts (x, mm)

const WINDING_PINION_HALF_WIDTH = 0.25;
export const BREGUET_LENGTH = 0.3;
/** Face of the sliding pinion when pushed in: it meets the tips of the winding pinion's Breguet teeth. */
export const SLIDING_X0 = WIND_AXES.windingPinion[0] + WINDING_PINION_HALF_WIDTH + BREGUET_LENGTH;
/** Middle of the sliding pinion's leaf section when pushed in. */
export const SLIDING_LEAF_CENTRE = SLIDING_X0 + 1.15;
/** Middle of the groove the yoke's fork sits in, when pushed in. */
export const SLIDING_GROOVE_X = SLIDING_X0 + 1.525;

/**
 * Which toothing of the sliding pinion is engaged at a stem pull: the Breguet
 * teeth with the winding pinion while pushed in, the leaf section with the
 * intermediate contrate once it has slid out far enough (pulls of positions 2
 * and 3 both mesh it; the rocker decides where the drive goes).
 */
export function engagement(pull: number): { winding: boolean; intermediate: boolean } {
  const [, p2, p3] = KEYLESS.pull;
  return { winding: pull < p2 * 0.5, intermediate: pull > p2 * 0.5 && pull <= p3 + 0.35 };
}

// ------------------------------------------------------------ poses (rotY degrees unless noted)

/** Intermediate contrate and its gear for a cumulative setting-crown angle. */
export const intermediateAngle = (settingCrownDeg: number): number => INTERMEDIATE_PER_CROWN * settingCrownDeg;

/**
 * Setting wheel's own spin relative to its rocker arm: the wheel is a planet
 * round the intermediate gear, so it turns by −(Z_i/Z_sw)·(I − ρ) where ρ is
 * the rocker's rotation (also rotY degrees) — which keeps it in mesh at every station.
 */
export const settingWheelSpin = (settingCrownDeg: number, rockerDeg: number): number =>
  -SETTING_PER_INTERMEDIATE * (intermediateAngle(settingCrownDeg) - rockerDeg);

/** Rocker rotation (rotY degrees) for a station value 0 (hands), 1 (date), 2 (neutral). */
export const rockerAngle = (station: number): number => station * KEYLESS.rockerStepDeg;

/** Date corrector: driven by the setting wheel (reversing and stepping up); only crown turns made in position 2 count. */
export const correctorAngle = (quickCrownDeg: number): number =>
  (KEYLESS.settingWheel.teeth / KEYLESS.corrector.teeth) * SETTING_PER_INTERMEDIATE * INTERMEDIATE_PER_CROWN * quickCrownDeg;

/** Rotation about +Y of the crown wheel (spur and contrate) when the ratchet is at angle A. */
export const crownWheelAngle = (ratchetDeg: number): number => -(RATCHET.gear.teeth / CROWN_SPUR.teeth) * ratchetDeg;
/** Rotation of the winding pinion about +X for a crown wheel angle: contrate and pinion mesh at the outboard edge. */
export const windingPinionAngle = (crownWheelDeg: number): number => (CONTRATE.teeth / WINDING.teeth) * crownWheelDeg;

/** Rotation about +X of the stem (and the sliding pinion on its square) for a crown angle: clockwise from outside is negative. */
export const stemAngle = (crownDeg: number): number => -crownDeg;

// ------------------------------------------------------------ yoke and setting lever

/** Vector (mm) from the yoke's stud to the groove in the sliding pinion at stem pull `pull`. */
export const yokeGroove = (pull: number): P2 => [
  SLIDING_GROOVE_X + pull - KEYLESS.yokePivot[0],
  KEYLESS.stemZ - KEYLESS.yokePivot[1],
];

/** Yoke arm direction with the stem pushed in. */
export const yokeRestVector = (): P2 => yokeGroove(0);

/**
 * Yoke angle (rotY degrees): its fork follows the groove, so the arm turns to
 * point at the groove wherever the sliding pinion is. 0 with the stem pushed in.
 */
export const yokeAngle = (pull: number): number => angleY(yokeGroove(pull)) - angleY(yokeGroove(0));

/** Notch of the stem under the setting lever's tip: 1 in the bottom of a notch, 0 on a crest. */
export function notchDepth(pull: number): number {
  const notch = (c: number) => {
    const d = Math.abs(pull - c);
    return d >= 0.35 ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / 0.35));
  };
  return Math.min(1, notch(KEYLESS.pull[0]) + notch(KEYLESS.pull[1]) + notch(KEYLESS.pull[2]));
}

/** The lever's tip moves 0.07 mm (a notch's depth) along its arm's perpendicular: ≈ 4.5° on a 2.5 mm arm turned 20° off the stem normal. */
export const SETTING_LEVER_NOTCH_DEG = 4.5;

/** Setting lever angle (rotY degrees, 0 on a crest): it drops into the notch of each crown position. */
export const settingLeverAngle = (pull: number): number => SETTING_LEVER_NOTCH_DEG * notchDepth(pull);
