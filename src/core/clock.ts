/**
 * The one and only machine clock. Everything that moves derives its pose from
 * `crankAngle` (degrees, wrapped to [0, cycleDeg)).
 *
 * Speed model: the machine nominally turns at `rpm`; `timeScale` slows the
 * presentation (1/50×, 1/10×, …). Paused means the angle does not advance,
 * but it can still be stepped by hand.
 */
export type ClockListener = (clock: MachineClock) => void;

export class MachineClock {
  readonly cycleDeg: number;
  private _angle = 0;
  /** Unwrapped angle, useful for continuous rotations (e.g. a 1:2 camshaft). */
  private _total = 0;
  rpm: number;
  timeScale = 1;
  paused = false;
  /** Largest simulated step per frame; avoids huge jumps after a tab switch. */
  maxFrameDt = 0.1;
  private listeners = new Set<ClockListener>();

  constructor(opts: { cycleDeg?: number; rpm: number; timeScale?: number }) {
    this.cycleDeg = opts.cycleDeg ?? 720;
    this.rpm = opts.rpm;
    this.timeScale = opts.timeScale ?? 1;
  }

  get crankAngle(): number {
    return this._angle;
  }

  get totalAngle(): number {
    return this._total;
  }

  /** Degrees per real second at the current rpm and time scale. */
  get degPerSecond(): number {
    return (this.rpm / 60) * 360 * this.timeScale;
  }

  set crankAngle(deg: number) {
    const delta = deg - this._angle;
    this.advance(delta);
  }

  /** Advance by real time `dt` seconds. */
  tick(dt: number): void {
    if (this.paused) return;
    this.advance(this.degPerSecond * Math.min(dt, this.maxFrameDt));
  }

  /** Move the clock by `deltaDeg` regardless of pause state. */
  advance(deltaDeg: number): void {
    if (deltaDeg === 0) return;
    this._total += deltaDeg;
    const w = (this._angle + deltaDeg) % this.cycleDeg;
    this._angle = w < 0 ? w + this.cycleDeg : w;
    for (const l of this.listeners) l(this);
  }

  onChange(l: ClockListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
