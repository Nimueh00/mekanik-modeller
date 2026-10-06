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

  valveTrain: {
    intakeValveDiameter: 30,
    exhaustValveDiameter: 26,
    maxLift: 9,
    includedAngleDeg: 42, // pent-roof: angle between intake and exhaust valve axes
    /**
     * Valve events (VISION §3), in crank degrees, measured at the valve
     * seat (lift leaves / returns to exactly 0).
     */
    timing: { ivoBtdc: 10, ivcAbdc: 50, evoBbdc: 50, evcAtdc: 10 },
    /** Valve, stations along the valve axis measured from the valve face (s = 0, valve closed). */
    valve: {
      length: 97, // face to stem tip
      intakeStem: 5.5,
      exhaustStem: 6,
      margin: 1, // cylindrical edge of the head below the 45° seat
      seatWidth: 1.6, // axial height of the 45° seat face
      tulipEnd: 15, // where the head's tulip blends into the stem
      keeperGroove: [91, 93.5] as const,
    },
    spring: {
      seat: 54, // spring seat (head) station
      installedLength: 36, // seat → retainer underside
      meanDiameter: 23,
      wire: 3.2,
      totalCoils: 6,
      deadCoils: 1, // closed, ground coil at each end
    },
    retainer: { bottom: 88.5, top: 96, outerDiameter: 25.4 },
    guide: { from: 22, to: 63, outerDiameter: 10.5 },
    bucket: { diameter: 32.5, height: 24, topThickness: 3.5, wall: 1.5 },
    /** Valve clearance between the cam base circle and the bucket (shim-on-bucket, mechanical). */
    lash: 0.25,
  },

  /**
   * Camshafts (DOHC). The lobe profile itself lives in `camProfile.ts`; these
   * are its parameters. Cam angles are in cam degrees.
   */
  cam: {
    baseCircleRadius: 20,
    /** Half of the valve-open period in cam degrees: 240° crank / 2 / 2. */
    halfOpenDeg: 60,
    /** Length of the clearance (lash) ramp on each side, cam degrees. */
    rampDeg: 20,
    /** Seating velocity at the end of the ramp, as a fraction of maxLift per half-period. */
    rampVelocity: 0.1,
    /** Harmonic profile shape: end of the positive-acceleration pulse / start of the nose. */
    flankEnd: 0.15,
    noseStart: 0.15,
    lobeWidth: 12,
    journalDiameter: 28,
    journalWidth: 18,
    shaftDiameter: 24,
  },

  head: {
    gasketThickness: 1, // compressed MLS gasket
    gasketBoreDiameter: 81.5,
    /** Chamber outline radius in the head (slightly larger than the bore to unshroud the valves). */
    chamberRadius: 40.5,
    /**
     * The roof stops at |x| = chamberHalfX (measured along the crank axis):
     * front and rear squish pads, as in real pent-roof heads. Sets the
     * compression ratio (see tests/headClearance.test.ts).
     */
    chamberHalfX: 36.5,
    /** Distance from the pocket floor (piston at TDC) to the closed valve face, along the valve axis. */
    pocketToFace: 8.8,
    halfLength: 198,
    deckHalfWidth: 64,
    topHalfWidth: 96,
    bolt: { z: 36, diameter: 10, headDiameter: 17, headHeight: 10, seatDepth: 30, threadDepth: 58 },
    camTunnelRadius: 31.5,
    plug: { threadDiameter: 14, reach: 19, wellDiameter: 24 },
  },

  timingDrive: {
    chainPitch: 8,
    rollerDiameter: 5,
    rollerWidth: 4,
    plateDepth: 7.2,
    plateThickness: 1,
    crankTeeth: 21,
    camTeeth: 42,
    toothWidth: 3.4,
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
