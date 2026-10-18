import type { TrainOptions } from './train';

/** Positions of the crown: 1 = winding, 2 = quick date, 3 = hand setting (and seconds stop). */
export type CrownPosition = 1 | 2 | 3;

/**
 * How the balance is driven: `env` is the amplitude envelope (1 = running,
 * decaying to 0 within ~2 s after the spring runs down), `age` the real time
 * (s) since the movement stopped. See runDown.ts.
 */
export interface BalanceDrive {
  env: number;
  age: number;
  /** Banking the lever rests on (sign of the lever angle it settles at). */
  bank: 1 | -1;
}

/**
 * The state of the watch beyond the time `t`: everything that depends on its
 * history rather than on the clock alone. `WatchClock.pose` produces it; every
 * field is optional for `Watch.update`, which derives sensible values for the
 * ones that are missing (a freshly started watch with nothing set).
 */
export interface WatchPose {
  /** Seconds the hands have been set ahead of the movement (see TrainOptions.handOffset). */
  handOffset?: number;
  /** Effective mainspring turns left. */
  windTurns?: number;
  /** Position of the date ring in teeth since day 1 (float while it steps). */
  dateRing?: number;
  /** Stem pull (mm) for the animation of the crown, sliding pinion, yoke and setting lever. */
  crownPull?: number;
  /** Cumulative crown rotation, degrees, positive = clockwise seen from the crown (the winding sense). */
  crownAngle?: number;
  /** Cumulative crown rotation made in positions 2 and 3 (drives the setting gears). */
  settingAngle?: number;
  /** Cumulative crown rotation made in position 2 alone (drives the date corrector). */
  quickAngle?: number;
  /** Setting-wheel rocker station: 0 = hands, 1 = date, 2 = neutral (fractions while it moves). */
  rocker?: number;
  /** Rotor angle, degrees (rotY). */
  rotorAngle?: number;
  /** Balance drive; absent means the watch runs normally. */
  drive?: BalanceDrive;
}

/** Everything `Watch.update` accepts. */
export type UpdateOptions = TrainOptions & WatchPose;
