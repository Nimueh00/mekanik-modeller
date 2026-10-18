import type { LayerId, PartNode, PartRegistry } from './registry';

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutQuint = (t: number): number => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

interface Slice {
  start: number;
  length: number;
}

/**
 * Machine-independent disassembly timeline.
 *
 * The 0..1 slider is divided into one slice per *populated, moving* layer, in
 * teardown order. Slices overlap by `overlap` of their length so the next layer
 * starts lifting while the previous one is still settling. Inside a layer the
 * parts are staggered by `explodeOrder`. Only the part's root node is written
 * (the registry's explode transform), so kinematics keeps running.
 */
export class Disassembly {
  private slices = new Map<LayerId, Slice>();
  private partRank = new Map<string, number>();
  private _amount = 0;
  private anim: { from: number; to: number; t: number; dur: number } | null = null;
  private listeners: ((amount: number) => void)[] = [];
  /** Slice length relative to the stride between layer starts (1 = no overlap). */
  overlap = 1.9;

  constructor(private registry: PartRegistry) {}

  /** (Re)build the timeline; call after all parts are registered. */
  rebuild(): void {
    this.slices.clear();
    this.partRank.clear();
    const moving = this.registry
      .populatedLayers()
      .filter((l) => this.registry.inLayer(l.id).some((p) => p.def.explodeOffset.some((v) => v !== 0)));
    const n = moving.length;
    const stride = 1 / (n - 1 + this.overlap);
    moving.forEach((l, i) => {
      this.slices.set(l.id, { start: i * stride, length: stride * this.overlap });
      const orders = [...new Set(this.registry.inLayer(l.id).map((p) => p.def.explodeOrder))].sort((a, b) => a - b);
      for (const p of this.registry.inLayer(l.id)) {
        this.partRank.set(p.def.id, orders.length > 1 ? orders.indexOf(p.def.explodeOrder) / orders.length : 0);
      }
    });
    this.apply();
  }

  /** Layers in the timeline, in order. */
  timelineLayers(): LayerId[] {
    return [...this.slices.keys()];
  }

  get amount(): number {
    return this._amount;
  }

  /** Raw linear progress of a layer (0..1), before easing. */
  layerProgress(layer: LayerId): number {
    const s = this.slices.get(layer);
    return s ? clamp01((this._amount - s.start) / s.length) : 0;
  }

  /** Eased explode amount of a single part. */
  partAmount(p: PartNode): number {
    const s = this.slices.get(p.def.group);
    if (!s) return 0;
    const rank = this.partRank.get(p.def.id) ?? 0;
    const spread = 0.4; // fraction of the slice used to stagger parts
    const local = clamp01((this._amount - s.start) / s.length);
    return easeInOutCubic(clamp01((local - rank * spread) / (1 - spread)));
  }

  setAmount(a: number): void {
    this._amount = clamp01(a);
    this.apply();
    for (const l of this.listeners) l(this._amount);
  }

  /** Smoothly move the slider to `target` (0..1). */
  animateTo(target: number, seconds?: number): void {
    const to = clamp01(target);
    const dur = seconds ?? 1.2 + 2.4 * Math.abs(to - this._amount);
    this.anim = { from: this._amount, to, t: 0, dur };
  }

  stopAnimation(): void {
    this.anim = null;
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  update(dt: number): void {
    const a = this.anim;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / a.dur);
    // A gentle ease on the slider itself; the per-layer easing does the rest.
    const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
    this.setAmount(a.from + (a.to - a.from) * e);
    if (a.t >= 1) this.anim = null;
  }

  onChange(l: (amount: number) => void): void {
    this.listeners.push(l);
  }

  private apply(): void {
    this.registry.setExplode((p) => this.partAmount(p));
  }
}
