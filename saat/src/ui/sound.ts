import type { WatchClock } from '../watch/watchClock';
import { FULL_AMPLITUDE } from '../watch/escapement';
import { soundMode, type TickEvent, TickScheduler, tickGain, tickRate } from './tickSchedule';

/**
 * Synthesised watch sound (Web Audio, no samples), locked to the beats.
 *
 * Ticks (below 60×): one short metallic click per beat, scheduled at the
 * beat's clock time by a TickScheduler, so it falls on the instant the lever
 * flips in the picture at any speed. A tick is a bright transient plus three
 * inharmonic, quickly dying partials (the lever's stones on the escape
 * wheel's teeth) and, a few milliseconds later, a softer, lower "lock"
 * where the next tooth drops onto the other pallet. The entry and exit
 * pallets are tuned apart (the familiar tick–tock). In slow motion the
 * clicks are played lower and longer as well as further apart. The level
 * follows the balance amplitude (cube of its ratio to full wind), so a
 * running-down watch gets quieter.
 *
 * Hum (60× and faster): beats fuse beyond counting, so instead of a click
 * train (a harsh buzz at 360–3600 Hz) a soft band-limited rustle plays,
 * louder with speed. Silent while paused.
 */
export class WatchSound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private humGain!: GainNode;
  private humFilter!: BiquadFilterNode;
  private ticks: Record<TickEvent['palette'], AudioBuffer> | null = null;
  private scheduler: TickScheduler;
  private _on = false;
  /** Overall level (0…1). */
  volume = 0.7;

  constructor(private clock: () => WatchClock) {
    this.scheduler = new TickScheduler((e, at) => this.tick(e, at));
  }

  get on(): boolean {
    return this._on;
  }

  /** Must be called from a user gesture the first time (browser autoplay policy). */
  async setOn(on: boolean): Promise<void> {
    this._on = on;
    if (on) {
      if (!this.ctx) this.create();
      await this.ctx!.resume();
      this.scheduler.reset();
      this.master.gain.setTargetAtTime(this.volume, this.ctx!.currentTime, 0.05);
    } else if (this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      const ctx = this.ctx;
      setTimeout(() => {
        if (!this._on) void ctx.suspend();
      }, 250);
    }
  }

  /** Per frame. */
  update(): void {
    if (!this._on || !this.ctx || this.ctx.state !== 'running') return;
    const clock = this.clock();
    const now = this.ctx.currentTime;
    this.scheduler.update(now, { t: clock.t, paused: clock.paused || !clock.moving, timeScale: clock.timeScale });
    const hum = soundMode(clock.timeScale) === 'hum' && !clock.paused && clock.moving;
    const level = hum ? Math.min(0.1, 0.04 * (1 + Math.log10(clock.timeScale / 60))) * tickGain(clock.amplitude, FULL_AMPLITUDE) : 0;
    this.humGain.gain.setTargetAtTime(level, now, 0.12);
    this.humFilter.frequency.setTargetAtTime(1400 + 500 * Math.log10(Math.max(1, clock.timeScale / 60)), now, 0.2);
  }

  private create(): void {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.001;
    comp.release.value = 0.08;
    this.master.connect(comp).connect(ctx.destination);

    this.ticks = { entry: renderTick(ctx, 'entry'), exit: renderTick(ctx, 'exit') };

    // hum: looped noise → band-pass → gain
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let seed = 99;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = seed / 2147483647 - 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    this.humFilter = ctx.createBiquadFilter();
    this.humFilter.type = 'bandpass';
    this.humFilter.frequency.value = 1400;
    this.humFilter.Q.value = 0.9;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    src.connect(this.humFilter).connect(this.humGain).connect(this.master);
    src.start();
  }

  private tick(e: TickEvent, at: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.ticks) return;
    const clock = this.clock();
    const src = ctx.createBufferSource();
    src.buffer = this.ticks[e.palette];
    src.playbackRate.value = tickRate(clock.timeScale);
    const g = ctx.createGain();
    g.gain.value = tickGain(clock.amplitude, FULL_AMPLITUDE);
    src.connect(g).connect(this.master);
    src.start(Math.max(at, ctx.currentTime));
  }
}

/** One tick, ~70 ms: transient + metallic partials + the softer lock. */
function renderTick(ctx: AudioContext, palette: TickEvent['palette']): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.round(sr * 0.07), sr);
  const d = buf.getChannelData(0);
  const entry = palette === 'entry';
  const partials = entry
    ? [{ f: 3150, a: 1, tau: 0.0075 }, { f: 5240, a: 0.6, tau: 0.0045 }, { f: 7480, a: 0.35, tau: 0.003 }]
    : [{ f: 3620, a: 1, tau: 0.0065 }, { f: 5930, a: 0.55, tau: 0.004 }, { f: 8220, a: 0.3, tau: 0.0028 }];
  const lock = { at: entry ? 0.0095 : 0.0082, f: entry ? 1250 : 1420, tau: 0.006, a: 0.45 };
  let seed = entry ? 17 : 29;
  let lp = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let v = 0;
    for (const p of partials) v += p.a * Math.sin(2 * Math.PI * p.f * t) * Math.exp(-t / p.tau);
    // the very first millisecond: a noisy click
    seed = (seed * 16807) % 2147483647;
    lp += (seed / 2147483647 - 0.5 - lp) * 0.6;
    v += 1.6 * lp * Math.exp(-t / 0.0006);
    const tl = t - lock.at;
    if (tl > 0) v += lock.a * Math.sin(2 * Math.PI * lock.f * tl) * Math.exp(-tl / lock.tau) * (1 - Math.exp(-tl / 0.0008));
    d[i] = v * 0.32;
  }
  return buf;
}
