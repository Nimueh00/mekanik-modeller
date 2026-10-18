import { BEATS_PER_SECOND } from '../watch/specs';

/**
 * Timing of the tick sound. A beat (the balance crossing zero, t = k / 6 s,
 * the instant the lever flips from one banking to the other) is the one place
 * where the watch is audible; `beatPhase(t).beat` is the integer k of the
 * nearest crossing, so tick k happens at k / BEATS_PER_SECOND exactly.
 * Even beats are the entry pallet's, odd beats the exit pallet's.
 */
export interface TickEvent {
  beat: number;
  /** Clock time of the beat, seconds. */
  t: number;
  palette: 'entry' | 'exit';
}

/** From this time scale on the beats are no longer separable: a hum replaces the ticks. */
export const HUM_FROM_SCALE = 60;

export type SoundMode = 'ticks' | 'hum';

export const soundMode = (timeScale: number): SoundMode => (timeScale >= HUM_FROM_SCALE ? 'hum' : 'ticks');

/** Beats whose time lies in (t0, t1], in order. */
export function ticksBetween(t0: number, t1: number): TickEvent[] {
  const out: TickEvent[] = [];
  const first = Math.floor(t0 * BEATS_PER_SECOND + 1e-9) + 1;
  const last = Math.floor(t1 * BEATS_PER_SECOND + 1e-9);
  for (let k = first; k <= last; k++) {
    out.push({ beat: k, t: k / BEATS_PER_SECOND, palette: k % 2 === 0 ? 'entry' : 'exit' });
  }
  return out;
}

/** Sound level for a balance amplitude: falls with the cube of the amplitude ratio (200° of 300° → 0.30). */
export function tickGain(amplitude: number, fullAmplitude: number): number {
  const r = Math.min(1, Math.max(0, amplitude / fullAmplitude));
  return r * r * r;
}

/** Playback rate of a tick: slow motion lowers and stretches it (1 at real speed). */
export function tickRate(timeScale: number): number {
  return Math.min(1, Math.max(0.35, Math.pow(timeScale, 0.3)));
}

export interface ClockView {
  t: number;
  paused: boolean;
  timeScale: number;
}

/**
 * Turns the clock's progress into audio-timed ticks. Every frame `update`
 * looks a little ahead on the clock and reports each beat that will be
 * crossed with the audio time at which it happens, so the sound stays in
 * step with the picture at any speed. A step taken while paused fires what it
 * crossed at once; going backwards, a long jump or a loud-speed hum fire
 * nothing (the cursor just follows).
 */
export class TickScheduler {
  /** Audio scheduling lead (s). */
  lead = 0.04;
  /** How far ahead (s of real time) to schedule each frame. */
  lookahead = 0.06;
  private scheduledTo: number | null = null;
  private lastT = 0;

  constructor(private fire: (e: TickEvent, audioTime: number) => void) {}

  reset(): void {
    this.scheduledTo = null;
  }

  update(audioNow: number, clock: ClockView): void {
    const { t, paused, timeScale } = clock;
    const jump = this.scheduledTo === null || t < this.lastT || t - this.lastT > 2 * this.lookahead * Math.max(1, timeScale) + 1;
    if (jump || soundMode(timeScale) === 'hum') {
      // first frame, stepped back, seeked or too fast to tick: resynchronise without firing what lies behind
      this.scheduledTo = t;
      this.lastT = t;
      return;
    }
    const from = this.scheduledTo!;
    if (paused || timeScale <= 0) {
      // a manual step fires what it crossed, immediately
      if (t > from) for (const e of ticksBetween(from, t)) this.fire(e, audioNow + 0.005);
      this.scheduledTo = Math.max(from, t);
    } else {
      const until = t + this.lookahead * timeScale;
      if (until > from) {
        for (const e of ticksBetween(from, until)) this.fire(e, audioNow + this.lead + Math.max(0, (e.t - t) / timeScale));
        this.scheduledTo = until;
      }
    }
    this.lastT = t;
  }
}
