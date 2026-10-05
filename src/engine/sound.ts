import { type AngleEvent, AngleEventScheduler } from '../core/angleEvents';
import type { MachineClock } from '../core/clock';
import { SPECS } from './specs';
import { IGNITION_PHI } from './thermo';
import { FIRING_TDC } from './timing';

/**
 * Synthesised engine sound (Web Audio, no samples).
 *
 * One pressure pulse per cylinder firing, scheduled at the crank angle of
 * each spark (FIRING_TDC + 705°, i.e. 15° BTDC) by an AngleEventScheduler, so
 * the pulses are locked to the picture: four cylinders → two pulses per
 * crank revolution, 1-3-4-2 order, at whatever speed the clock runs
 * (rpm × time scale). At the real 800–6500 rpm the pulse train fuses into the
 * familiar firing-frequency tone (27–217 Hz); in slow motion every firing is
 * a separate "chuff".
 *
 * Timbre: each pulse is a pre-rendered burst (decaying low thump + filtered
 * noise), slightly different per cylinder. The pulse bus goes through an
 * "exhaust" chain: a low-pass whose cut-off rises with speed, a resonant peak
 * and a short feedback comb (pipe resonance), then a compressor.
 */
export class EngineSound {
  private ctx: AudioContext | null = null;
  private bus!: GainNode;
  private master!: GainNode;
  private lowpass!: BiquadFilterNode;
  private pulses: AudioBuffer[] = [];
  private scheduler: AngleEventScheduler;
  private _on = false;
  /** Overall level (0…1). */
  volume = 0.6;

  constructor(private clock: MachineClock) {
    const events: AngleEvent[] = FIRING_TDC.map((tdc, cyl) => ({ angle: (tdc + IGNITION_PHI) % 720, tag: cyl }));
    this.scheduler = new AngleEventScheduler(clock, events, (e, t) => this.pulse(e.tag, t));
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
    const now = this.ctx.currentTime;
    // brighter exhaust note as the (visible) speed rises
    const rpm = this.clock.paused ? 0 : this.clock.rpm * this.clock.timeScale;
    this.lowpass.frequency.setTargetAtTime(380 + rpm * 0.32, now, 0.08);
    this.scheduler.update(now);
  }

  private create(): void {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    this.master.connect(comp).connect(ctx.destination);

    // exhaust chain: low-pass → resonant peak → (dry + feedback comb) → master
    this.bus = ctx.createGain();
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 600;
    this.lowpass.Q.value = 0.9;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 140;
    peak.Q.value = 2.2;
    peak.gain.value = 7;
    this.bus.connect(this.lowpass).connect(peak);
    peak.connect(this.master);
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 1 / 92; // ≈ quarter-wave of a ~0.9 m pipe
    const feedback = ctx.createGain();
    feedback.gain.value = 0.42;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    peak.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.master);

    // one pre-rendered pulse per cylinder (small differences = a slightly uneven, "real" beat)
    for (let c = 0; c < SPECS.cylinders; c++) this.pulses.push(renderPulse(ctx, c));
  }

  private pulse(cylinder: number, at: number): void {
    const ctx = this.ctx!;
    const t = Math.max(at, ctx.currentTime);
    const rate = this.clock.rpm * this.clock.timeScale;
    // spacing between firings at the visible speed; pulses shorten as they crowd together
    const period = rate > 0 ? 60 / rate / 2 : 0.5;
    const decay = Math.min(0.11, Math.max(0.012, period * 1.5));
    const src = ctx.createBufferSource();
    src.buffer = this.pulses[cylinder]!;
    src.playbackRate.value = 1 + Math.min(0.5, rate / 13000);
    const g = ctx.createGain();
    const amp = 0.55 + 0.25 * Math.min(1, rate / 4000);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    src.connect(g).connect(this.bus);
    src.start(t);
    src.stop(t + decay + 0.01);
  }
}

/** A single combustion/exhaust pressure pulse: low pitched thump with a noisy edge (~120 ms). */
function renderPulse(ctx: AudioContext, variant: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.round(sr * 0.12);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  let seed = 1234 + variant * 977;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const f0 = 78 + variant * 4.5; // Hz, falls during the pulse
  let phase = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t / 0.028) * (1 - Math.exp(-t / 0.0012));
    phase += (2 * Math.PI * (f0 * (1 - 0.35 * Math.min(1, t / 0.06)))) / sr;
    // band-limited noise (one-pole low-pass) for the gas "crack"
    lp += (rnd() - lp) * 0.18;
    const noise = lp * Math.exp(-t / 0.012) * 2.2;
    d[i] = (Math.sin(phase) + 0.35 * Math.sin(2 * phase + 0.6)) * env * 0.8 + noise;
  }
  return buf;
}
