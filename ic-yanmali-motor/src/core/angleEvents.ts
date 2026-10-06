import type { MachineClock } from './clock';

export interface AngleEvent {
  /** Angle within the machine cycle (degrees, 0 … cycleDeg). */
  angle: number;
  /** Free tag passed back to the callback (e.g. the cylinder index). */
  tag: number;
}

/**
 * Turns angle-based machine events (a cylinder firing, a gear tooth meshing,
 * an escapement tick…) into precisely timed callbacks for an audio clock.
 *
 * Every frame `update(now)` looks a little ahead on the machine clock's
 * unwrapped angle and reports each event that will be crossed, together with
 * the audio time at which it happens — so sound stays in step with the
 * picture at any speed, from 1/50× slow motion to the red line. Manual
 * stepping while paused triggers the events it crosses right away; stepping
 * backwards or a large jump (seek) triggers nothing.
 *
 * Machine independent: the caller supplies the event list and what to do.
 */
export class AngleEventScheduler {
  /** Audio scheduling lead (s): events are queued this far ahead of the audio clock. */
  lead = 0.05;
  /** How far ahead (s of machine time) to schedule each frame. */
  lookahead = 0.06;
  private scheduledTo: number | null = null;
  private lastTotal = 0;

  constructor(
    private clock: MachineClock,
    private events: readonly AngleEvent[],
    private fire: (e: AngleEvent, audioTime: number) => void,
  ) {}

  /** Forget the scheduling position (e.g. after the sound was switched off and on again). */
  reset(): void {
    this.scheduledTo = null;
  }

  update(audioNow: number): void {
    const total = this.clock.totalAngle;
    const rate = this.clock.paused ? 0 : this.clock.degPerSecond; // deg per second
    const cycle = this.clock.cycleDeg;
    if (this.scheduledTo === null || total < this.lastTotal || total - this.lastTotal > cycle) {
      // first frame, stepped back or jumped: resynchronise without firing what lies behind
      this.scheduledTo = total;
      this.lastTotal = total;
    }
    if (rate <= 0) {
      // paused: a manual step fires what it crossed, immediately
      if (total > this.scheduledTo) this.emit(this.scheduledTo, total, total, 0, audioNow + 0.005);
      this.scheduledTo = Math.max(this.scheduledTo, total);
      this.lastTotal = total;
      return;
    }
    const until = total + rate * this.lookahead;
    if (until > this.scheduledTo) {
      this.emit(this.scheduledTo, until, total, rate, audioNow + this.lead);
      this.scheduledTo = until;
    }
    this.lastTotal = total;
  }

  /** Events with unwrapped angle in (from, to]; time = t0 + (angle − ref) / rate. */
  private emit(from: number, to: number, ref: number, rate: number, t0: number): void {
    const cycle = this.clock.cycleDeg;
    for (const e of this.events) {
      let a = e.angle + cycle * Math.ceil((from - e.angle) / cycle);
      if (a <= from) a += cycle;
      for (; a <= to; a += cycle) {
        const t = rate > 0 ? t0 + Math.max(0, (a - ref) / rate) : t0;
        this.fire(e, t);
      }
    }
  }
}
