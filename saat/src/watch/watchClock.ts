import { balanceAmplitude } from './escapement';
import { REV_PER_HOUR } from './train';
import { BEATS_PER_SECOND, MAINSPRING } from './specs';

/**
 * Time model of the watch (the motor's MachineClock is rpm / 720° based and
 * does not fit). `t` is the movement's own time in seconds since 12:00:00;
 * everything that moves derives its pose from it through train.ts and
 * escapement.ts.
 *
 * Power: the mainspring holds `windTurns` effective turns and unwinds with the
 * barrel. When it reaches 0 the watch stops: `t` no longer advances, so the
 * balance and every wheel freeze where they are.
 */

/** Above this many beats per frame the beats are invisible: switch to averaged motion. */
export const CONTINUOUS_BEATS_PER_FRAME = 2;

/** Presentation speeds offered to the user. */
export const TIME_SCALES = [1 / 50, 1 / 10, 1, 60, 600, 3600] as const;

/** Mainspring turns consumed per second of running (barrel speed, from the train). */
export const WIND_TURNS_PER_SECOND = Math.abs(REV_PER_HOUR.barrel) / 3600;

export class WatchClock {
  timeScale: number;
  paused = false;
  /** Largest real-time step per frame; avoids huge jumps after a tab switch. */
  maxFrameDt = 0.1;
  /** True when the last frame advanced more than CONTINUOUS_BEATS_PER_FRAME beats. */
  continuous = false;

  private _t: number;
  // Wind is kept as (turns at tRef) rather than decremented per frame, so long
  // runs do not accumulate rounding and the run-out time is exact.
  private windRef: number;
  private tRef: number;

  constructor(opts: { t?: number; timeScale?: number; windTurns?: number } = {}) {
    this._t = opts.t ?? 0;
    this.timeScale = opts.timeScale ?? 1;
    this.windRef = Math.min(Math.max(opts.windTurns ?? MAINSPRING.effectiveTurns, 0), MAINSPRING.effectiveTurns);
    this.tRef = this._t;
  }

  get t(): number {
    return this._t;
  }

  /** Effective mainspring turns left. */
  get windTurns(): number {
    return Math.max(0, this.windRef - (this._t - this.tRef) * WIND_TURNS_PER_SECOND);
  }

  /** Clock time at which the mainspring runs down. */
  get runOutTime(): number {
    return this.tRef + this.windRef / WIND_TURNS_PER_SECOND;
  }

  get running(): boolean {
    return this._t < this.runOutTime;
  }

  /** Balance amplitude for the current state of wind, degrees. */
  get amplitude(): number {
    return balanceAmplitude(this.windTurns);
  }

  /** Add mainspring turns (crown or rotor); the slipping bridle caps it at full. */
  wind(turns: number): void {
    const now = this.windTurns;
    this.windRef = Math.min(MAINSPRING.effectiveTurns, Math.max(0, now + turns));
    this.tRef = this._t;
  }

  /** Advance by real time `dt` seconds (one animation frame). */
  tick(dt: number): void {
    if (this.paused) return;
    const step = Math.min(dt, this.maxFrameDt) * this.timeScale;
    this.continuous = step * BEATS_PER_SECOND > CONTINUOUS_BEATS_PER_FRAME;
    this.advance(step);
  }

  /**
   * Step `n` beats by hand (works while paused). Lands on the locked rest
   * between beats, half a beat after a zero crossing, so each step shows one
   * whole tick of the escape wheel.
   */
  stepBeats(n: number): void {
    if (!Number.isInteger(n) || n < 0) throw new RangeError('stepBeats expects a non-negative integer');
    this.continuous = false;
    // small tolerance: a time already on a rest point must count as that rest
    const rest = Math.floor(this._t * BEATS_PER_SECOND - 0.5 + 1e-9);
    this.advanceTo((rest + n + 0.5) / BEATS_PER_SECOND);
  }

  /** Advance the movement's time by `seconds`, stopping when the spring runs down. */
  advance(seconds: number): void {
    if (seconds > 0) this.advanceTo(this._t + seconds);
  }

  private advanceTo(t: number): void {
    this._t = Math.max(this._t, Math.min(t, this.runOutTime));
  }
}
