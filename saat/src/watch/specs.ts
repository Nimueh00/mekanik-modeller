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

/**
 * Escapement drawing (P2): club teeth and pallet stones, in the plane of the
 * escape wheel. Only the free design choices are listed; the impulse faces of
 * the stones and the clubs of the teeth are generated from the motion
 * (escapeGeometry.ts).
 */
export const PALLETS = {
  /**
   * Mean lock (incl. run) of the two pallets: lever angle from the banking to
   * the unlocking point. Assumption: usual Swiss values are ≈ 1.5° lock + ½°
   * run; the entry/exit split is solved with the rest of the geometry.
   */
  lockDeg: 1.8,
  /** Share of the wheel's step taken on the pallet stone's impulse face; the rest is on the club. */
  palletShare: 0.65,
  /** Fraction of the traced club rise that is kept (see escapeGeometry.ts). */
  clubRelief: 0.85,
  /** Ruby pallet stones: length out of the pallet frame, mm (their width follows from the impulse). */
  stoneLength: 0.8,
  teeth: {
    /** Tip circle → root circle. */
    depth: 0.5,
    /** Locking face leans forward of the radius by this angle. */
    lockingLeanDeg: 24,
    rootFillet: 0.03,
    /** Where the concave back meets the root, degrees behind the locking corner. */
    backAngleDeg: 16,
    backBulge: 0.2,
  },
} as const;

/** Hole jewels (P2 drawing): ruby radius, the polished sink (olive) around it, and the pivot hole. */
export const JEWEL = { radius: 0.48, sinkRadius: 0.7, holeRadius: 0.07 } as const;

/**
 * Balance spring (P2 drawing): a flat Archimedean spiral, inner end pinned to
 * the collet on the balance staff, outer end in the stud on the cock.
 */
export const HAIRSPRING = {
  turns: 13,
  innerRadius: 0.48,
  outerRadius: 1.95,
  /** Radial thickness and height of the blade, mm. */
  thickness: 0.035,
  y: [-3.0, -2.88] as const,
  /** Direction of the stud from the balance staff, clock degrees. */
  studClockDeg: 95,
} as const;

/** Dial and hands (P2 drawing). Hands are stacked above the dial: hour < minute < seconds. */
export const DIAL = {
  y: [0.9, 1.3] as const,
  radius: 12.8,
  /** Date window at 3 o'clock: centre distance and size, mm. */
  window: { centre: 9.6, radial: 1.45, tangential: 1.2 },
  /** Applied hour indices: inner and outer radius. */
  indices: { inner: 9.7, outer: 11.6 },
} as const;

export const HANDS = {
  hour: { length: 6.4, width: 0.75, y: [1.42, 1.47] as const },
  minute: { length: 9.8, width: 0.6, y: [1.58, 1.63] as const },
  second: { length: 11.0, tail: 2.6, width: 0.12, y: [1.76, 1.79] as const },
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

export const CENTRE: P2 = [0, 0];

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

// =====================================================================
// P3: mainspring and ratchet, keyless works, automatic winding, date
// =====================================================================

/**
 * Winding wheels live in two thin levels between the bridges (top at −3.7) and
 * the rotor weight (bottom at −3.9), i.e. inside `MOVEMENT.envelope.rotor`.
 * A compound wheel needs both levels (wheel in one, pinion in the other), which
 * is why the plan is arranged so that a wheel and the pinion of its neighbour
 * never share a level. Level 1 is the outer one (towards the rotor).
 */
export const WINDING_LEVELS = { l1: [-3.895, -3.805] as const, l2: [-3.795, -3.705] as const };

/**
 * Mainspring in its barrel (P3 drawing). The blade is drawn about three times
 * thicker than a real one (0.05 mm) so that the coils can be told apart. The
 * length (≈ 268 mm, a plausible figure) follows from the coil counts below; it
 * moves the same 8 effective turns.
 *
 * Unwound the spring lies against the drum wall (`outerCoilsUnwound` coils)
 * with just a short tail wrapped on the arbor; winding transfers coils from the
 * wall to the arbor (see mainspring.ts for the length-conserving transfer).
 */
export const SPRING = {
  thickness: 0.15,
  /** Axial extent inside the drum (between the cover and the bottom disc). */
  y: [-2.62, -1.72] as const,
  /** Arbor core radius the inner coils are wound on. */
  coreRadius: 0.5,
  /** Inside radius of the drum wall. */
  wallRadius: 4.6,
  innerCoilsUnwound: 0.6,
  outerCoilsUnwound: 11,
} as const;

/**
 * Ratchet wheel (cırcır) on the barrel arbor, above the barrel bridge. Its gear
 * (level 2) is driven by the crown wheel and by the automatic reduction; the
 * sawtooth ring on top (level 1) is held by the click. 64 teeth at 0.12 mm
 * make it as large as the barrel, which is what pushes the crown wheel far
 * enough from the centre to clear the train; 36 saw teeth give a visible 10°
 * click pitch.
 */
export const RATCHET = {
  gear: { teeth: 64, module: 0.12, y: WINDING_LEVELS.l2 } as GearSpec,
  saw: { teeth: 36, rootRadius: 1.75, tipRadius: 2.05, y: WINDING_LEVELS.l1 },
  hubRadius: 0.6,
  click: {
    /** Pivot post: distance from the barrel axis and direction (clock degrees). */
    pivotDistance: 4.3,
    pivotClockDeg: 320,
    armLength: 3.0,
    y: WINDING_LEVELS.l1,
  },
} as const;

/** Where the keyless works sit: stem axis, 2.5 mm above the 3 o'clock line (the line is blocked by a bridge pillar). */
const STEM_Z = -2.5;

/**
 * Keyless works. The stem runs along +X at (y, z) = (−2.99, −2.5), i.e. on the
 * bridge side, in the free strip beside the train (see tests/windingLayout.test.ts).
 *
 * Gearing (all teeth counts are our own design):
 *   crown → stem → sliding pinion (Breguet teeth) → winding pinion (10)
 *   → crown wheel contrate (16) → crown wheel spur (36) → ratchet (64):
 *   ratchet turns per crown turn = 10/16 · 36/64 = 0.3516, i.e. 2.84 crown
 *   turns per spring turn and 22.7 turns for the 8 effective turns, within
 *   the usual 20–40.
 *   Hand setting: sliding pinion (10) → intermediate contrate (16) →
 *   intermediate gear (16) → setting wheel (32) → minute wheel (36) → cannon
 *   pinion (12): 10/16 · 16/32 · 32/36 · 36/12 = 10/12, i.e. 0.833 minute-hand
 *   turns (50 min) per crown turn, 8⅓ s of hands per degree.
 *   Quick date: … → setting wheel (32) → date corrector (16), whose 3-finger
 *   star moves the ring one tooth per finger: 10/16 · 16/32 · 32/16 = 0.625
 *   star turns per crown turn = 1.875 teeth, i.e. 192° of crown per day.
 */
export const KEYLESS = {
  stemZ: STEM_Z,
  stemY: -2.99,
  stemRadius: 0.2,
  /** Axial pull of the stem (mm) for crown positions 1, 2, 3. */
  pull: [0, 0.9, 1.6] as const,
  /** The sliding pinion follows the yoke one for one. */
  slidingPinion: { breguetTeeth: 12, leafTeeth: 10, leafModule: 0.1 },
  windingPinion: { teeth: 10, module: 0.1 } as GearSpec,
  crownContrate: { teeth: 16, module: 0.1 } as GearSpec,
  crownSpur: { teeth: 36, module: 0.12, y: WINDING_LEVELS.l2 } as GearSpec,
  settingContrate: { teeth: 16, module: 0.1 } as GearSpec,
  settingGear: { teeth: 16, module: 0.1, y: [0.2, 0.32] } as GearSpec,
  settingWheel: { teeth: 32, module: 0.1, y: [0.2, 0.32] } as GearSpec,
  corrector: { teeth: 16, module: 0.1, y: [0.2, 0.32] } as GearSpec,
  correctorFingers: 3,
  /** Reach of the corrector's star fingers from its axis. */
  starLength: 1.45,
  /** Axial stations (mm) of the bridge-side keyless parts. */
  contrateY: [-3.705, -3.37] as const,
  /** x of the intermediate contrate wheel, and the rocker steps between the three setting-wheel stations (degrees). */
  settingX: 7.4,
  /** The intermediate's axle runs 0.6 mm beside the stem (towards 12 o'clock): the stem must not pass through it. */
  settingOffsetZ: -0.6,
  rockerStepDeg: 40,
  /** Radial width of the contrate teeth rings (mm); the intermediate's is wider so that pulls 2 and 3 both mesh. */
  contrateWidth: { crown: 0.35, intermediate: 0.6 },
  /** Yoke stud, and the setting lever's stud and the x its tip rests at on the stem (pulled in). */
  yokePivot: [5.5, -4.7] as readonly [number, number],
  leverPivot: [10.9, -5.0] as readonly [number, number],
  leverTipX: 10.0,
  /** The yoke and the setting lever are pressed steel plates on the dial side, between plate and dial; their pins reach down through the plate to the stem. */
  dialLeverY: [0.03, 0.15] as const,
  /** Posts of the springs that load them (plan, mm). */
  yokeSpringPost: [4.3, -5.6] as readonly [number, number],
  leverSpringPost: [11.5, -3.3] as readonly [number, number],
  /** Crown outside the plate: x of the crown's inner face when the stem is pushed in, and its size. */
  crown: { x: 13.4, length: 2.0, radius: 1.5 },
} as const;

/**
 * Automatic winding: a half-moon rotor on a ball bearing at the centre drives,
 * through two reverser wheels (one of them turns the other, so they always
 * turn opposite ways), a reduction wheel into the ratchet. Each reverser wheel
 * drives its pinion only in the winding direction; the pawl of the other one
 * slips. Rotor : ratchet = 14/21 · 8/48 · 8/64 = 1/72 (about 72 rotor turns per
 * spring turn; the usual range for automatics is 1/50 … 1/200).
 */
export const AUTOMATIC = {
  /** The rotor weight, bottom of the bridge envelope: thin base plate + thick weight segment. */
  rotor: { baseY: [-4.0, -3.9] as const, weightY: [-4.1, -3.9] as const, outerRadius: 12.0, weightInner: 9.2, weightSpanDeg: 150 },
  /** Ball bearing: inner race is a fixed stud, balls run between it and the rotor hub. */
  bearing: { innerRadius: 0.4, outerRadius: 0.8, balls: 7, y: [-4.08, -3.92] as const },
  rotorPinion: { teeth: 14, module: 0.1, y: WINDING_LEVELS.l2 } as GearSpec,
  reverserWheel: { teeth: 21, module: 0.1, y: WINDING_LEVELS.l2 } as GearSpec,
  reverserPinion: { teeth: 8, module: 0.08, y: WINDING_LEVELS.l1 } as GearSpec,
  reductionWheel: { teeth: 48, module: 0.08, y: WINDING_LEVELS.l1 } as GearSpec,
  reductionPinion: { teeth: 8, module: 0.12, y: WINDING_LEVELS.l2 } as GearSpec,
  /** Direction of the reduction wheel from the barrel axis (clock degrees). */
  reductionClockDeg: 182,
} as const;

/**
 * Date mechanism. The 31-tooth ring has internal teeth (tips at `tipRadius`,
 * roots at `rootRadius`) and the numerals on top, read through the window at
 * 3 o'clock; it lies above the driver wheel (which passes under it).
 * The driver's finger moves it during 22:00–24:00 (it pushes about 60 % of a
 * tooth, the jumper snaps the rest); the jumper holds it between the steps.
 */
export const DATE_RING = {
  y: [0.64, 0.84] as const,
  /** Tooth zone is the lower part of the ring. */
  teethY: [0.64, 0.72] as const,
  tipRadius: 7.5,
  rootRadius: 7.95,
  outerRadius: 10.7,
  /** Radius the numerals are centred on (the window centre). */
  numeralRadius: DIAL.window.centre,
  /** The ring steps from 22:00 to 24:00 (seconds of the day). */
  stepStart: 22 * 3600,
  stepEnd: 24 * 3600,
  finger: { length: 1.8, y: [0.6, 0.7] as const },
  /**
   * Jumper spring: the tip rests in a gap of the ring at `tipClockDeg`; the arm
   * (length `armLength`, mid-height of the teeth) hangs from a stud inside the
   * ring, `pivotSwingDeg` away from the radial direction.
   */
  jumper: { tipClockDeg: 320, armLength: 3.0, pivotSwingDeg: 55, y: [0.64, 0.72] as const },
} as const;

// ---------- derived layout of the P3 parts ----------

const sub2 = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const len2 = (a: P2) => Math.hypot(a[0], a[1]);

/** One of the two intersections of circle (c0, r0) and circle (c1, r1); `pick` chooses the side. */
export function circleIntersection(c0: P2, r0: number, c1: P2, r1: number, pick: 0 | 1): P2 {
  const d = len2(sub2(c1, c0));
  const a = (d * d + r0 * r0 - r1 * r1) / (2 * d);
  const h2 = r0 * r0 - a * a;
  if (h2 < 0) throw new RangeError('circles do not intersect');
  const h = Math.sqrt(h2) * (pick === 0 ? 1 : -1);
  const u: P2 = [(c1[0] - c0[0]) / d, (c1[1] - c0[1]) / d];
  return [c0[0] + u[0] * a - u[1] * h, c0[1] + u[1] * a + u[0] * h];
}

/**
 * Plan positions of the P3 axes, each placed from the axis it meshes with at
 * exactly the pitch-circle distance (checked again in tests/windingMeshing.test.ts).
 */
export const WIND_AXES = (() => {
  const barrel = AXES.barrel;
  // crown wheel: on the stem line, meshing the ratchet
  const dz = STEM_Z - barrel[1];
  const spurDist = pitchRadius(RATCHET.gear) + pitchRadius(KEYLESS.crownSpur);
  const crownWheel: P2 = [barrel[0] + Math.sqrt(spurDist * spurDist - dz * dz), STEM_Z];
  // winding pinion sits on the stem at the contrate's pitch radius
  const windingPinion: P2 = [crownWheel[0] + pitchRadius(KEYLESS.crownContrate), STEM_Z];
  // automatic works
  const reduction = towardsClock(
    barrel,
    pitchRadius(RATCHET.gear) + pitchRadius(AUTOMATIC.reductionPinion),
    AUTOMATIC.reductionClockDeg,
  );
  const rp = AUTOMATIC.rotorPinion;
  const rw = AUTOMATIC.reverserWheel;
  const reverser1 = circleIntersection(
    CENTRE,
    pitchRadius(rp) + pitchRadius(rw),
    reduction,
    pitchRadius(AUTOMATIC.reverserPinion) + pitchRadius(AUTOMATIC.reductionWheel),
    1,
  );
  const reverser2 = circleIntersection(
    reverser1,
    2 * pitchRadius(rw),
    reduction,
    pitchRadius(AUTOMATIC.reverserPinion) + pitchRadius(AUTOMATIC.reductionWheel),
    1,
  );
  // setting works: intermediate beside the stem line; the rocker carries the setting wheel round it
  const intermediate: P2 = [KEYLESS.settingX, STEM_Z + KEYLESS.settingOffsetZ];
  const arm = pitchRadius(KEYLESS.settingGear) + pitchRadius(KEYLESS.settingWheel);
  const need = pitchRadius(MOTION_WORKS.minuteWheel) + pitchRadius(KEYLESS.settingWheel);
  const rockerTime = circleIntersection(intermediate, arm, AXES.minute, need, 1);
  const base = Math.atan2(rockerTime[1] - intermediate[1], rockerTime[0] - intermediate[0]);
  const rockerAt = (k: number): P2 => {
    const a = base - (k * KEYLESS.rockerStepDeg * Math.PI) / 180;
    return [intermediate[0] + arm * Math.cos(a), intermediate[1] + arm * Math.sin(a)];
  };
  const rockerDate = rockerAt(1);
  const rockerNeutral = rockerAt(2);
  const corrector = circleIntersection(
    rockerDate,
    pitchRadius(KEYLESS.settingWheel) + pitchRadius(KEYLESS.corrector),
    CENTRE,
    DATE_RING.tipRadius + 0.12 - KEYLESS.starLength,
    1,
  );
  return {
    crownWheel,
    windingPinion,
    reduction,
    reverser1,
    reverser2,
    intermediate,
    rockerTime,
    rockerDate,
    rockerNeutral,
    corrector,
  } as const;
})();
