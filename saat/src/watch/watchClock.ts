import { rotorWindTurns, wristMotion } from './automatic';
import { ringFloatAt } from './dateWork';
import { balanceAmplitude } from './escapement';
import { crownEffect, pullOf, rockerOf, stopsBalance } from './keyless';
import type { BalanceDrive, CrownPosition, WatchPose } from './pose';
import { HACK_SECONDS, RESTART_SECONDS, RUN_DOWN_SECONDS, stopBanking } from './runDown';
import { REV_PER_HOUR } from './train';
import { BEATS_PER_SECOND, MAINSPRING } from './specs';

/**
 * Time model of the watch (the motor's MachineClock is rpm / 720° based and
 * does not fit). `t` is the movement's own time in seconds since 00:00:00 of
 * the first day of the month, on the local clock (`WatchClock.fromDate`): the
 * hands show `t` mod 12 h, the date ring the day `floor(t / 24 h) + 1`.
 * Everything that moves derives its pose from it through train.ts and
 * escapement.ts.
 *
 * Power: the mainspring holds `windTurns` effective turns and unwinds with the
 * barrel. When it reaches 0 the watch stops: `t` no longer advances, so every
 * wheel freezes where it is, while the balance swings on for ~2 s of real time
 * with falling amplitude and the lever settles on a banking (runDown.ts).
 *
 * Besides `t` the clock keeps what depends on history: the hands' offset from
 * the movement (set with the crown), the date ring, the rotor, the crown's
 * position and the balance's run-down. `pose` bundles it for `Watch.update`.
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

  /** Fake wrist motion for the rotor (off by default: the watch stands still in the scene). */
  wrist = { enabled: false };

  private _t: number;
  // Wind is kept as (turns at tRef) rather than decremented per frame, so long
  // runs do not accumulate rounding and the run-out time is exact.
  private windRef: number;
  private tRef: number;

  private _handOffset = 0;
  private _crown: CrownPosition = 1;
  private _crownAngle = 0;
  private _settingAngle = 0;
  private _quickAngle = 0;
  private _pull = 0;
  private _rocker = rockerOf(1);
  private _ring: number;
  private _rotor = 0;
  private wristTime = 0;
  // balance run-down: x falls linearly to 0 while stopped; the envelope is x²
  private driveX: number;
  private driveAge = 0;
  private driveBank: 1 | -1;
  private wasPowered: boolean;

  constructor(opts: { t?: number; timeScale?: number; windTurns?: number } = {}) {
    this._t = opts.t ?? 0;
    this.timeScale = opts.timeScale ?? 1;
    this.windRef = Math.min(Math.max(opts.windTurns ?? MAINSPRING.effectiveTurns, 0), MAINSPRING.effectiveTurns);
    this.tRef = this._t;
    this._ring = ringFloatAt(this._t);
    this.wasPowered = this.running;
    this.driveX = this.wasPowered ? 1 : 0;
    this.driveBank = stopBanking(this._t, this.amplitude);
  }

  /**
   * A clock set to a calendar moment: `t` = seconds since 00:00 of the first
   * of that month, local time (day of the month and local time of day).
   */
  static fromDate(d: Date, opts: { timeScale?: number; windTurns?: number } = {}): WatchClock {
    const t = (d.getDate() - 1) * 86400 + d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    return new WatchClock({ ...opts, t });
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

  /** True while there is power in the spring (the hack may still hold the balance). */
  get running(): boolean {
    return this._t < this.runOutTime;
  }

  /** Crown pulled to position 3: the hack lever holds the balance, `t` stands still. */
  get hacked(): boolean {
    return stopsBalance(this._crown);
  }

  /** True when time actually passes: powered and not hacked. */
  get moving(): boolean {
    return this.running && !this.hacked;
  }

  /**
   * Balance amplitude the train is drawn with, for the current state of wind,
   * degrees. It stays at its last value when the watch stops; the swing that
   * dies away is `balanceAmplitude`.
   */
  get amplitude(): number {
    return balanceAmplitude(this.windTurns);
  }

  /** Swing amplitude of the balance right now, degrees: `amplitude` while running, falling to 0 within ~2 s of a stop. */
  get balanceAmplitude(): number {
    return this.amplitude * this.driveX * this.driveX;
  }

  // ------------------------------------------------------------ hands, date, crown

  /** Seconds the hands are set ahead of the movement (negative: set back). */
  get handOffset(): number {
    return this._handOffset;
  }

  /** Date ring position in teeth since day 1 (a float while the ring steps). */
  get dateRing(): number {
    return this._ring;
  }

  get crownPosition(): CrownPosition {
    return this._crown;
  }

  /** Cumulative crown rotation, degrees, positive = clockwise seen from the crown (the winding sense). */
  get crownAngle(): number {
    return this._crownAngle;
  }

  /** How far the stem is pulled out right now, mm (eases towards the crown position's pull over ~0.2 s). */
  get crownPull(): number {
    return this._pull;
  }

  get rotorAngle(): number {
    return this._rotor;
  }

  /** Pull the crown to position 1 (winding), 2 (quick date) or 3 (hand setting, hack). */
  setCrownPosition(p: CrownPosition): void {
    this._crown = p;
  }

  /**
   * Turn the crown by `deg` degrees (positive = clockwise seen from the crown,
   * the winding direction). Position 1 winds (one way only), 2 steps the date
   * (one way only), 3 sets the hands (both ways).
   */
  turnCrown(deg: number): void {
    const e = crownEffect(this._crown, deg);
    this._crownAngle += deg;
    if (this._crown >= 2) this._settingAngle += deg;
    if (this._crown === 2) this._quickAngle += deg;
    if (e.windTurns > 0) this.wind(e.windTurns);
    if (e.handSeconds !== 0) this.adjustHands(e.handSeconds);
    if (e.dateTeeth > 0) this._ring += e.dateTeeth;
  }

  /** Move the hands (and the date driver with them) by `seconds`, without the going train. */
  adjustHands(seconds: number): void {
    const before = this._t + this._handOffset;
    this._handOffset += seconds;
    this.syncRing(before, this._t + this._handOffset);
  }

  /** Swing the rotor by `deltaDeg`; either way it winds through the reverser (the spring's bridle caps it). */
  driveRotor(deltaDeg: number): void {
    this._rotor += deltaDeg;
    this.wind(rotorWindTurns(deltaDeg));
  }

  /** The history-dependent state `Watch.update` needs next to `t`. */
  get pose(): Required<WatchPose> {
    const drive: BalanceDrive = { env: this.driveX * this.driveX, age: this.driveAge, bank: this.driveBank };
    return {
      handOffset: this._handOffset,
      windTurns: this.windTurns,
      dateRing: this._ring,
      crownPull: this._pull,
      crownAngle: this._crownAngle,
      settingAngle: this._settingAngle,
      quickAngle: this._quickAngle,
      rocker: this._rocker,
      rotorAngle: this._rotor,
      drive,
    };
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
    const real = Math.min(dt, this.maxFrameDt);
    const step = real * this.timeScale;
    this.continuous = step * BEATS_PER_SECOND > CONTINUOUS_BEATS_PER_FRAME;
    this.advance(step);
    this.animate(real);
  }

  /** Real-time parts of a frame: balance run-down, crown and rocker travel, the wrist. */
  private animate(dt: number): void {
    const powered = this.moving;
    if (powered) {
      this.driveX = Math.min(1, this.driveX + dt / RESTART_SECONDS);
      this.driveAge = 0;
    } else {
      if (this.wasPowered) {
        this.driveBank = stopBanking(this._t, this.amplitude);
        this.driveAge = 0;
      }
      this.driveX = Math.max(0, this.driveX - dt / (this.hacked ? HACK_SECONDS : RUN_DOWN_SECONDS));
      this.driveAge += dt;
    }
    this.wasPowered = powered;
    const toward = (v: number, target: number, rate: number) => v + Math.max(-rate * dt, Math.min(rate * dt, target - v));
    this._pull = toward(this._pull, pullOf(this._crown), 12);
    this._rocker = toward(this._rocker, rockerOf(this._crown), 6);
    if (this.wrist.enabled) {
      this.wristTime += dt;
      const target = wristMotion(this.wristTime);
      this.driveRotor(target - this._rotor);
    }
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
    if (this.hacked) return; // the hack lever holds the balance: no time passes
    const next = Math.max(this._t, Math.min(t, this.runOutTime));
    this.syncRing(this._t + this._handOffset, next + this._handOffset);
    this._t = next;
  }

  /** The date ring only ever moves forward: add the steps the driver's finger makes between two driver times. */
  private syncRing(from: number, to: number): void {
    if (to > from) this._ring += ringFloatAt(to) - ringFloatAt(from);
  }
}
