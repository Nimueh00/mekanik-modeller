/**
 * Single source of truth for every watch dimension and tooth count.
 *
 * A Swiss automatic calibre in the spirit of the current 80-hour ETA family
 * (inspired by the Hamilton H-10 / Tissot Powermatic 80). The public
 * specifications (diameter, height, 21 600 A/h, ~80 h reserve, centre seconds,
 * date at 3, 15-tooth Swiss lever escapement) are followed; manufacturers do
 * not publish tooth counts, so the gear train below is our own design, chosen
 * to meet those specifications with values in the usual horological ranges.
 *
 * Units: millimetres, degrees, seconds. Scene geometry multiplies by
 * `SCENE_PER_MM`; the numbers here always stay in mm.
 *
 * Movement frame (same axes as the scene):
 *   +X  towards 3 o'clock.
 *   −Z  towards 12 o'clock.
 *   +Y  towards the dial. y = 0 is the dial-side face of the main plate; the
 *       going train lives on the back (bridge) side at y < 0, the motion works
 *       and date under the dial at y > 0.
 * Plan positions are (x, z) with the movement centre at the origin.
 */

/** Scene units per millimetre (1 scene unit = 0.1 mm). */
export const SCENE_PER_MM = 10;

/** A toothed wheel or pinion: involute stand-in, tip radius = pitch radius + m (see core gearRadii). */
export interface GearSpec {
  readonly teeth: number;
  readonly module: number;
  /** Axial extent of the toothed part, mm. */
  readonly y: readonly [number, number];
}

export const MOVEMENT = {
  diameter: 25.6, // 11½ lignes
  lignes: 11.5,
  height: 5.0, // approximate, public
  frequencyHz: 3, // 21 600 A/h
  powerReserveTargetH: 80,
  /** Assumption: typical for this family; not used by any calculation. */
  jewelsApprox: 25,
  /** Minimum gap between any part and the plate edge (plan). */
  edgeClearance: 0.5,
  plate: { y: [-1.2, 0] as const },
  /**
   * Axial budget (design choice) that adds up to the 5 mm height: dial-side
   * motion works and date, main plate, train cavity, bridges, rotor.
   */
  envelope: {
    dialSide: [0, 0.9] as const,
    trainCavity: [-3.3, -1.2] as const,
    bridges: [-3.7, -3.3] as const,
    rotor: [-4.1, -3.7] as const,
  },
} as const;

/**
 * Mainspring. 8 effective turns is mid-range for a wrist-watch spring (6–10)
 * and, through the 10 : 1 barrel → centre ratio, gives exactly 80 h.
 */
export const MAINSPRING = {
  effectiveTurns: 8,
} as const;

/**
 * Going train: barrel → centre (minute) → third → fourth (seconds) → escape.
 *
 * Ratio choices:
 *  - barrel 100 / centre pinion 10 = 10: one barrel turn every 10 h, so 8
 *    spring turns last 80 h.
 *  - centre 80 / third pinion 10 = 8 and third 75 / fourth pinion 10 = 7.5:
 *    8 × 7.5 = 60, fourth wheel one turn per minute. Fourth and centre are
 *    coaxial (direct centre seconds): (80 + 10)·0.085 = (75 + 10)·0.09 = 7.65,
 *    so both meshes sit at the same 3.825 mm centre distance.
 *  - fourth 96 / escape pinion 8 = 12: 12 escape turns/min × 30 beats = 360
 *    beats/min = 6 beats/s = 3 Hz. 96 rather than 84 / 7 pushes the escape
 *    arbor (3.64 mm out) clear of the centre wheel's tip circle (3.485 mm).
 * Modules: larger near the barrel (torque), smaller towards the escapement.
 */
export const TRAIN = {
  barrel: {
    wheel: { teeth: 100, module: 0.1, y: [-1.75, -1.55] } as GearSpec,
    /** Drum body under the teeth (one rigid body with the wheel). */
    drum: { radius: 4.8, y: [-2.85, -1.52] as const },
    clockDeg: 330, // ~11 o'clock, opposite the balance
  },
  centre: {
    wheel: { teeth: 80, module: 0.085, y: [-1.42, -1.3] } as GearSpec,
    pinion: { teeth: 10, module: 0.1, y: [-1.9, -1.5] } as GearSpec,
  },
  third: {
    wheel: { teeth: 75, module: 0.09, y: [-2.18, -2.05] } as GearSpec,
    pinion: { teeth: 10, module: 0.085, y: [-1.47, -1.25] } as GearSpec,
    clockDeg: 120,
  },
  fourth: {
    wheel: { teeth: 96, module: 0.07, y: [-3.08, -2.95] } as GearSpec,
    pinion: { teeth: 10, module: 0.09, y: [-2.4, -1.95] } as GearSpec,
  },
  escape: {
    pinion: { teeth: 8, module: 0.07, y: [-3.15, -2.85] } as GearSpec,
    /** Club-tooth escape wheel: not an involute gear, so it is given by its tip diameter. */
    wheel: { teeth: 15, tipDiameter: 4.0, y: [-2.38, -2.25] as const },
    clockDeg: 220, // beside the balance
  },
} as const;

/**
 * Motion works under the dial: cannon pinion (friction-fit on the centre
 * arbor, 1 turn/h) → minute wheel / minute pinion → hour wheel (1 turn/12 h).
 * 36/12 × 32/8 = 3 × 4 = 12. Hour wheel coaxial with the cannon pinion:
 * (12 + 36)·0.1 = (8 + 32)·0.12 = 4.8, centre distance 2.4 mm.
 */
export const MOTION_WORKS = {
  cannonPinion: { teeth: 12, module: 0.1, y: [0.1, 0.45] } as GearSpec,
  minuteWheel: { teeth: 36, module: 0.1, y: [0.2, 0.32] } as GearSpec,
  minutePinion: { teeth: 8, module: 0.12, y: [0.36, 0.62] } as GearSpec,
  hourWheel: { teeth: 32, module: 0.12, y: [0.48, 0.6] } as GearSpec,
  minuteClockDeg: 60, // towards the crown, where the setting wheel will engage it
} as const;

/**
 * Date drive: a 64-tooth wheel driven by the hour wheel (64/32 = 2) turns once
 * in 24 h; its finger moves the 31-tooth date ring one tooth per turn. The
 * ring and finger geometry come with the date mechanism package.
 */
export const DATE = {
  driver: { teeth: 64, module: 0.12, y: [0.48, 0.6] } as GearSpec,
  driverClockDeg: 160,
  ringTeeth: 31,
  fingersPerDriverTurn: 1,
} as const;

/**
 * Swiss lever escapement and balance.
 *
 * Lever: the impulse pin (radius `impulsePinRadius` on the roller) works in
 * the fork slot; the lever angle is the exact pin-in-slot relation, so the
 * banking angle follows from the lift angle and the two radii (see
 * escapement.ts). 0.6 / 3.4 mm gives ≈ 10° total lever swing.
 */
export const ESCAPEMENT = {
  /** Assumption (no citable source): ETA family lift angle is quoted around 50°. */
  liftAngleDeg: 50,
  /** Teeth embraced by the pallets (design choice, usual Swiss value). */
  palletSpanTeeth: 2.5,
  /** Lever pivot → balance staff, along the straight-line layout. */
  palletToBalance: 3.4,
  impulsePinRadius: 0.6,
  /** Direction of the escape → pallet → balance line, clock degrees. */
  lineClockDeg: 135,
  lever: { y: [-2.38, -2.25] as const },
  balance: {
    /** Assumption: plausible for an 11½‴ movement. */
    diameter: 8.8,
    y: [-2.75, -2.45] as const,
    /** Amplitude fully wound and towards the end of the reserve (assumption: typical values). */
    amplitudeFullDeg: 300,
    amplitudeEmptyDeg: 200,
  },
} as const;

// ---------- derived values ----------

export const PLATE_RADIUS = MOVEMENT.diameter / 2;
export const BEATS_PER_SECOND = 2 * MOVEMENT.frequencyHz;
/** Two beats per escape tooth (one per pallet). */
export const BEATS_PER_ESCAPE_TURN = 2 * TRAIN.escape.wheel.teeth;
export const ESCAPE_DEG_PER_BEAT = 360 / BEATS_PER_ESCAPE_TURN;

export const pitchRadius = (g: GearSpec) => (g.teeth * g.module) / 2;
export const tipRadius = (g: GearSpec) => pitchRadius(g) + g.module;
export const centreDistance = (a: GearSpec, b: GearSpec) => pitchRadius(a) + pitchRadius(b);

export type P2 = readonly [number, number];

/** Point `distance` from `from` in the direction of clock position `clockDeg` (0 = 12 o'clock, clockwise from the dial). */
export function towardsClock(from: P2, distance: number, clockDeg: number): P2 {
  const a = (clockDeg * Math.PI) / 180;
  return [from[0] + distance * Math.sin(a), from[1] - distance * Math.cos(a)];
}

const CENTRE: P2 = [0, 0];

/** Escape wheel tip radius → pallet pivot distance for tangential locking. */
export const ESCAPE_TO_PALLET =
  TRAIN.escape.wheel.tipDiameter / 2 / Math.cos((Math.PI * ESCAPEMENT.palletSpanTeeth) / TRAIN.escape.wheel.teeth);

/**
 * Plan position of every arbor. Each one is placed from the arbor it meshes
 * with at exactly the pitch-circle centre distance, so meshing is exact by
 * construction (and checked again in tests/layout.test.ts).
 */
export const AXES = (() => {
  const barrel = towardsClock(CENTRE, centreDistance(TRAIN.barrel.wheel, TRAIN.centre.pinion), TRAIN.barrel.clockDeg);
  const third = towardsClock(CENTRE, centreDistance(TRAIN.centre.wheel, TRAIN.third.pinion), TRAIN.third.clockDeg);
  const escape = towardsClock(CENTRE, centreDistance(TRAIN.fourth.wheel, TRAIN.escape.pinion), TRAIN.escape.clockDeg);
  const pallet = towardsClock(escape, ESCAPE_TO_PALLET, ESCAPEMENT.lineClockDeg);
  const balance = towardsClock(pallet, ESCAPEMENT.palletToBalance, ESCAPEMENT.lineClockDeg);
  const minute = towardsClock(
    CENTRE,
    centreDistance(MOTION_WORKS.cannonPinion, MOTION_WORKS.minuteWheel),
    MOTION_WORKS.minuteClockDeg,
  );
  const dateDriver = towardsClock(CENTRE, centreDistance(MOTION_WORKS.hourWheel, DATE.driver), DATE.driverClockDeg);
  return { centre: CENTRE, barrel, third, escape, pallet, balance, minute, dateDriver } as const;
})();

export type AxisName = keyof typeof AXES;

/** Rigid rotating bodies of the train (a wheel and its pinion turn together). */
export type Body =
  | 'barrel'
  | 'centre'
  | 'third'
  | 'fourth'
  | 'escape'
  | 'cannon'
  | 'minuteWheel'
  | 'hourWheel'
  | 'dateDriver';

export interface TrainGear {
  readonly name: string;
  readonly body: Body;
  readonly axis: AxisName;
  readonly gear: GearSpec;
  readonly pinion: boolean;
}

/** Every involute wheel and pinion, with the body it belongs to. */
export const GEARS: readonly TrainGear[] = [
  { name: 'barrelWheel', body: 'barrel', axis: 'barrel', gear: TRAIN.barrel.wheel, pinion: false },
  { name: 'centreWheel', body: 'centre', axis: 'centre', gear: TRAIN.centre.wheel, pinion: false },
  { name: 'centrePinion', body: 'centre', axis: 'centre', gear: TRAIN.centre.pinion, pinion: true },
  { name: 'thirdWheel', body: 'third', axis: 'third', gear: TRAIN.third.wheel, pinion: false },
  { name: 'thirdPinion', body: 'third', axis: 'third', gear: TRAIN.third.pinion, pinion: true },
  { name: 'fourthWheel', body: 'fourth', axis: 'centre', gear: TRAIN.fourth.wheel, pinion: false },
  { name: 'fourthPinion', body: 'fourth', axis: 'centre', gear: TRAIN.fourth.pinion, pinion: true },
  { name: 'escapePinion', body: 'escape', axis: 'escape', gear: TRAIN.escape.pinion, pinion: true },
  { name: 'cannonPinion', body: 'cannon', axis: 'centre', gear: MOTION_WORKS.cannonPinion, pinion: true },
  { name: 'minuteWheel', body: 'minuteWheel', axis: 'minute', gear: MOTION_WORKS.minuteWheel, pinion: false },
  { name: 'minutePinion', body: 'minuteWheel', axis: 'minute', gear: MOTION_WORKS.minutePinion, pinion: true },
  { name: 'hourWheel', body: 'hourWheel', axis: 'centre', gear: MOTION_WORKS.hourWheel, pinion: false },
  { name: 'dateDriver', body: 'dateDriver', axis: 'dateDriver', gear: DATE.driver, pinion: false },
];

/** Meshing pairs, driver first (power flows barrel → escape, cannon → date). */
export const MESHES: readonly (readonly [string, string])[] = [
  ['barrelWheel', 'centrePinion'],
  ['centreWheel', 'thirdPinion'],
  ['thirdWheel', 'fourthPinion'],
  ['fourthWheel', 'escapePinion'],
  ['cannonPinion', 'minuteWheel'],
  ['minutePinion', 'hourWheel'],
  ['hourWheel', 'dateDriver'],
];

/** The cannon pinion is friction-fitted on the centre arbor and turns with it. */
export const COUPLED: readonly (readonly [Body, Body])[] = [['centre', 'cannon']];

export function gearByName(name: string): TrainGear {
  const g = GEARS.find((x) => x.name === name);
  if (!g) throw new RangeError(`no gear ${name}`);
  return g;
}
