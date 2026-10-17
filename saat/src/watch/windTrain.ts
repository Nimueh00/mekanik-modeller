import { solveMeshPhases } from './meshPhase';
import { AUTOMATIC, AXES, CENTRE, type GearSpec, KEYLESS, type P2, RATCHET, WIND_AXES } from './specs';

/**
 * The spur gears of the P3 mechanisms that stay in mesh, with the plan position
 * of their axes: ratchet and its drives, the rotor's reducing train, the
 * setting gear and the setting wheel (the latter only at the "hands" station of
 * its rocker; the other stations carry it round the intermediate gear, see
 * keyless.ts). Contrate gears (crown wheel and winding pinion, the intermediate
 * contrate and the sliding pinion) mesh at right angles and are not here.
 */
export interface WindGear {
  readonly name: string;
  readonly at: P2;
  readonly gear: GearSpec;
  readonly pinion: boolean;
}

export const WIND_GEARS: readonly WindGear[] = [
  { name: 'ratchetGear', at: AXES.barrel, gear: RATCHET.gear, pinion: false },
  { name: 'crownSpur', at: WIND_AXES.crownWheel, gear: KEYLESS.crownSpur, pinion: false },
  { name: 'reductionPinion', at: WIND_AXES.reduction, gear: AUTOMATIC.reductionPinion, pinion: true },
  { name: 'reductionWheel', at: WIND_AXES.reduction, gear: AUTOMATIC.reductionWheel, pinion: false },
  { name: 'reverser1Pinion', at: WIND_AXES.reverser1, gear: AUTOMATIC.reverserPinion, pinion: true },
  { name: 'reverser1Wheel', at: WIND_AXES.reverser1, gear: AUTOMATIC.reverserWheel, pinion: false },
  { name: 'reverser2Pinion', at: WIND_AXES.reverser2, gear: AUTOMATIC.reverserPinion, pinion: true },
  { name: 'reverser2Wheel', at: WIND_AXES.reverser2, gear: AUTOMATIC.reverserWheel, pinion: false },
  { name: 'rotorPinion', at: CENTRE, gear: AUTOMATIC.rotorPinion, pinion: true },
  { name: 'settingGear', at: WIND_AXES.intermediate, gear: KEYLESS.settingGear, pinion: false },
  { name: 'settingWheel', at: WIND_AXES.rockerTime, gear: KEYLESS.settingWheel, pinion: false },
];

/** Pairs in mesh at all times (driver first). */
export const WIND_MESHES: readonly (readonly [string, string])[] = [
  ['ratchetGear', 'crownSpur'],
  ['ratchetGear', 'reductionPinion'],
  ['reverser1Pinion', 'reductionWheel'],
  ['reverser2Pinion', 'reductionWheel'],
  ['rotorPinion', 'reverser1Wheel'],
  ['reverser1Wheel', 'reverser2Wheel'],
  ['settingGear', 'settingWheel'],
];

export function windGear(name: string): WindGear {
  const g = WIND_GEARS.find((x) => x.name === name);
  if (!g) throw new RangeError(`no gear ${name}`);
  return g;
}

export const WIND_PHASE: Readonly<Record<string, number>> = solveMeshPhases(
  WIND_GEARS.map((g) => ({ name: g.name, at: g.at, teeth: g.gear.teeth })),
  WIND_MESHES,
);
