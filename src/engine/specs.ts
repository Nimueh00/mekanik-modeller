/**
 * Single source of truth for every engine dimension.
 *
 * Units: 1 scene unit = 1 mm. Angles in degrees unless the name says otherwise.
 *
 * World frame:
 *   +X  crankshaft axis, pointing from the timing (front, cylinder 1) end
 *       towards the flywheel (rear, cylinder 4) end.
 *   +Y  cylinder axis, up. y = 0 is the crankshaft centreline.
 *   +Z  completes a right-handed frame (towards the viewer in the default
 *       "side" view; the block cutaway removes the +Z half).
 */

export const SPECS = {
  cylinders: 4,
  bore: 80.5,
  stroke: 78.5,
  rodLength: 133, // centre-to-centre
  compressionRatio: 10.5,
  cylinderSpacing: 88,
  /** Crank throw angle per cylinder (index 0 = cylinder 1). */
  crankThrowDeg: [0, 180, 180, 0] as const,
  firingOrder: [1, 3, 4, 2] as const,

  crank: {
    mainJournalDiameter: 50,
    mainJournalWidth: 22,
    pinDiameter: 42,
    pinWidth: 24,
    /** Fillet radius where journals meet webs. */
    filletRadius: 2.2,
    webPinBossRadius: 30,
    /** Half-width of the web where it necks down between counterweight and pin boss. */
    webNeckHalfWidth: 31,
    counterweightRadius: 62,
    /** Half-angle of the counterweight arc, measured from the anti-pin direction. */
    counterweightHalfAngleDeg: 56,
    webChamfer: 1.6,
    /** Front nose (timing end). */
    nose: {
      sealDiameter: 40,
      sealLength: 16,
      sprocketSeatDiameter: 32,
      sprocketSeatLength: 30,
      pulleySeatDiameter: 28,
      pulleySeatLength: 26,
      boltBossDiameter: 14,
      keyWidth: 5,
    },
    /** Timing-chain drive sprocket (chain itself arrives in phase 2). */
    sprocket: {
      teeth: 21,
      chainPitch: 8,
      rollerDiameter: 5,
      width: 9,
    },
    /** Rear flange that carries the flywheel. */
    flange: {
      diameter: 84,
      thickness: 12,
      neckDiameter: 60,
      neckLength: 10,
      boltCount: 6,
      boltCircleDiameter: 62,
      pilotDiameter: 30,
    },
  },

  rod: {
    smallEndOuterDiameter: 28,
    smallEndWidth: 20,
    bigEndOuterRadius: 29.5,
    bigEndWidth: 22,
    beamWidthTop: 18, // across the I flanges, small-end side
    beamWidthBottom: 26, // big-end side
    flangeThickness: 3.5,
    webThickness: 5,
    boltOffset: 28.5, // from big-end centre, along the rod's lateral axis
    bossHalfWidth: 36,
    bossHeight: 11, // above/below the parting line
    bearingOuterRadius: 22.5, // big-end shell OD / 2
    bushOuterRadius: 11.5,
    boltDiameter: 8,
    boltHeadDiameter: 12,
    boltHeadHeight: 7,
    capDepth: 31, // below the parting line
  },

  piston: {
    /** Skirt diameter (bore minus running clearance). */
    diameter: 80.42,
    compressionHeight: 30, // pin centre to crown edge
    skirtBelowPin: 24,
    crownDome: 1.6, // centre rise of the dome above the crown edge
    crownLandHeight: 4.5,
    rings: [
      // y = centre of groove below the crown edge, h = axial height, depth = radial groove depth
      { name: '1. kompresyon segmanı', y: 5.25, h: 1.2, depth: 3.4 },
      { name: '2. kompresyon segmanı', y: 9.0, h: 1.5, depth: 3.6 },
      { name: 'Yağ segmanı', y: 13.25, h: 2.5, depth: 3.8 },
    ],
    pinDiameter: 20,
    pinLength: 64,
    pinBoreInner: 11, // hollow pin wall
    wallThickness: 3.5,
    pinBossGap: 23, // clear width between the pin bosses (rod small end lives here)
    valvePocket: {
      // Pocket = valve head + ~1 mm radial clearance. Spacing keeps all four
      // pockets disjoint (≥ 0.5 mm webs) and inside the crown edge.
      intakeDiameter: 32,
      exhaustDiameter: 28,
      depth: 1.6,
      /** Pocket centre offset from bore axis (along X, along Z). */
      offsetX: 17.5,
      offsetZ: 15.5,
    },
  },

  /** Only what phase 1 needs to stay consistent with the valve pockets; phase 2 owns the rest. */
  valveTrain: {
    intakeValveDiameter: 30,
    exhaustValveDiameter: 26,
    maxLift: 9,
    includedAngleDeg: 42, // pent-roof: angle between intake and exhaust valve axes
  },

  block: {
    deckHeight: 203, // crank centreline to deck face
    linerThickness: 2.5,
    linerBottom: 80,
    halfLength: 198,
    deckHalfWidth: 62,
    skirtHalfWidth: 98,
    skirtBottom: -20,
    flareTop: 112,
    flareBottom: 42,
    waterJacket: { outerOffset: 54, innerRadius: 46.5, top: 196, bottom: 118 },
    crankcaseCavityHalfWidth: 90,
    crankcaseCavityTop: 86,
    bulkheadWidth: 20,
    mainBoreClearance: 1.8, // bearing shell thickness
  },

  mainCap: {
    halfWidth: 46,
    depth: 38,
    width: 20,
    boltOffset: 36,
    boltDiameter: 10,
    boltHeadDiameter: 16,
    boltHeadHeight: 8,
  },

  oilPan: {
    railY: -20,
    wall: 3,
    shallowBottom: -102,
    sumpBottom: -158,
    sumpStartX: -10,
    flangeWidth: 12,
    flangeThickness: 4,
  },

  flywheel: {
    /** Gap between crank flange face and flywheel (none: bolted face to face). */
    outerRadius: 136,
    thickness: 26,
    hubRadius: 44,
    dishDepth: 8,
    ringGear: { teeth: 132, module: 2.1, width: 14 },
    boltCount: 6,
  },

  speed: {
    idleRpm: 800,
    redlineRpm: 6500,
    defaultRpm: 800,
  },
} as const;

// ---------- derived values ----------
export const CRANK_RADIUS = SPECS.stroke / 2;

/** X coordinate of each cylinder axis (cylinder 1 at the front, -X). */
export const CYLINDER_X: readonly number[] = Array.from(
  { length: SPECS.cylinders },
  (_, i) => (i - (SPECS.cylinders - 1) / 2) * SPECS.cylinderSpacing,
);

/** X coordinate of each main journal (one more than cylinders). */
export const MAIN_X: readonly number[] = Array.from(
  { length: SPECS.cylinders + 1 },
  (_, i) => (i - SPECS.cylinders / 2) * SPECS.cylinderSpacing,
);

export const DISPLACEMENT_CC =
  (Math.PI / 4) * SPECS.bore ** 2 * SPECS.stroke * SPECS.cylinders / 1000;

/** Piston pin height above crank centreline at TDC and BDC. */
export const PIN_Y_TDC = CRANK_RADIUS + SPECS.rodLength;
export const PIN_Y_BDC = SPECS.rodLength - CRANK_RADIUS;
