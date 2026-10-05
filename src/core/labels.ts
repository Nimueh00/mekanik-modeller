import { Box3, type Camera, Vector3 } from 'three';
import type { PartRegistry } from './registry';

export interface LabelDef {
  partId: string;
  text: string;
  /** 1 = main label (shown assembled); 2 and 3 appear as the model opens. */
  tier: 1 | 2 | 3;
  /** Lower wins when two labels compete for the same space. */
  priority?: number;
  /** Anchor inside the part's assembled bounding box, as fractions (default centre). */
  at?: readonly [number, number, number];
}

/**
 * Optional visibility rule supplied by the machine: receives the label and its
 * current anchor (world space). When set it replaces the tier thresholds.
 */
export type LabelFilter = (def: LabelDef, anchor: Vector3) => boolean;

/** Global explode amount at which each tier becomes visible. */
const TIER_THRESHOLD = { 1: 0, 2: 0.12, 3: 0.45 } as const;

interface Entry {
  def: LabelDef;
  rest: Vector3;
  el: HTMLElement;
  dot: SVGCircleElement;
  line: SVGLineElement;
  w: number;
  h: number;
  /** Last accepted placement (index into the candidate list), for stability. */
  slot: number;
  shown: boolean;
  /** Cached line-of-sight result (null = not tested since the label became eligible). */
  seen: boolean | null;
}

const NS = 'http://www.w3.org/2000/svg';

/**
 * Leader-line labels drawn in a DOM/SVG overlay above the canvas
 * (equivalent to a CSS2DRenderer, with a collision pass added).
 * Anchors are stored in assembled world space and follow the part's explode
 * displacement only, so kinematics (a rotating crank, moving pistons) does not
 * make labels jitter.
 */
export class LabelSystem {
  private entries: Entry[] = [];
  private layer = document.createElement('div');
  private svg = document.createElementNS(NS, 'svg');
  private v = new Vector3();
  private anchor = new Vector3();
  enabled = true;
  /** Cap on simultaneously visible labels (lower on small screens). */
  maxVisible = 99;
  /** Region (CSS px) that labels must stay inside; set from the free area next to the panel. */
  area = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  onPick: (partId: string) => void = () => {};
  filter: LabelFilter | null = null;
  /**
   * Optional line-of-sight test (true = the anchor is visible). Results are
   * cached and refreshed round-robin, `occlusionBudget` labels per frame.
   */
  occlusion: ((partId: string, anchor: Vector3) => boolean) | null = null;
  occlusionBudget = 6;
  private rr = 0;

  constructor(
    parent: HTMLElement,
    private registry: PartRegistry,
  ) {
    this.layer.className = 'lbl-layer';
    this.svg.setAttribute('class', 'lbl-svg');
    this.layer.append(this.svg);
    parent.append(this.layer);
  }

  /** Call once, in the assembled pose, after all parts exist. */
  build(defs: readonly LabelDef[]): void {
    const box = new Box3();
    for (const def of defs) {
      let node;
      try {
        node = this.registry.get(def.partId);
      } catch {
        continue; // part not built (yet)
      }
      node.root.updateWorldMatrix(true, true);
      box.setFromObject(node.root);
      const at = def.at ?? [0.5, 0.5, 0.5];
      const rest = new Vector3(
        box.min.x + (box.max.x - box.min.x) * at[0],
        box.min.y + (box.max.y - box.min.y) * at[1],
        box.min.z + (box.max.z - box.min.z) * at[2],
      );
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'lbl';
      el.textContent = def.text;
      el.addEventListener('click', () => this.onPick(def.partId));
      this.layer.append(el);
      const line = document.createElementNS(NS, 'line');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', '3.2');
      this.svg.append(line, dot);
      this.entries.push({ def, rest, el, dot, line, w: 0, h: 0, slot: 0, shown: false, seen: null });
    }
    // Most important first: tier, then priority, then declaration order.
    this.entries.sort((a, b) => a.def.tier - b.def.tier || (a.def.priority ?? 5) - (b.def.priority ?? 5));
    for (const e of this.entries) {
      e.w = e.el.offsetWidth + 6;
      e.h = e.el.offsetHeight + 4;
    }
  }

  /** Re-measure label boxes (e.g. after web fonts load). */
  remeasure(): void {
    for (const e of this.entries) {
      e.w = e.el.offsetWidth + 6;
      e.h = e.el.offsetHeight + 4;
    }
  }

  /** Forget cached line-of-sight results (call when the scene changed, not merely the camera). */
  invalidateOcclusion(): void {
    for (const e of this.entries) e.seen = null;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.layer.classList.toggle('is-off', !on);
  }

  setHighlighted(partId: string | null): void {
    for (const e of this.entries) e.el.classList.toggle('is-selected', e.def.partId === partId);
  }

  update(camera: Camera, explodeAmount: number): void {
    if (!this.enabled) return;
    const W = this.layer.clientWidth;
    const H = this.layer.clientHeight;
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const A = this.area;
    const midX = (A.left + A.right) / 2;

    // refresh a few cached line-of-sight results each frame (round-robin)
    if (this.occlusion && this.entries.length) {
      for (let k = 0; k < this.occlusionBudget; k++) {
        const e = this.entries[(this.rr = (this.rr + 1) % this.entries.length)]!;
        if (e.seen !== null) e.seen = this.occlusion(e.def.partId, this.anchor.copy(e.rest).add(this.registry.get(e.def.partId).root.position));
      }
    }

    for (const e of this.entries) {
      const node = this.registry.get(e.def.partId);
      this.anchor.copy(e.rest).add(node.root.position);
      let ok =
        placed.length < this.maxVisible &&
        node.root.visible &&
        (this.filter ? this.filter(e.def, this.anchor) : explodeAmount >= TIER_THRESHOLD[e.def.tier] - 1e-6);
      if (!ok) e.seen = null;
      else if (this.occlusion) {
        if (e.seen === null) e.seen = this.occlusion(e.def.partId, this.anchor);
        ok = e.seen;
      }
      let sx = 0;
      let sy = 0;
      if (ok) {
        this.v.copy(this.anchor).project(camera);
        sx = (this.v.x * 0.5 + 0.5) * W;
        sy = (-this.v.y * 0.5 + 0.5) * H;
        ok = this.v.z < 1 && sx > A.left + 10 && sx < A.right - 10 && sy > A.top + 10 && sy < A.bottom - 10;
      }
      let slotPos: { x: number; y: number } | null = null;
      if (ok) {
        // Candidate positions: preferred side first, then the other, with growing vertical shifts.
        const side = sx > midX ? -1 : 1;
        const ys = [0, -26, 26, -52, 52, -78, 78, -104, 104];
        const cands: { x: number; y: number }[] = [];
        for (const s of [side, -side]) {
          for (const dy of ys) {
            const x = s > 0 ? sx + 26 : sx - 26 - e.w;
            cands.push({ x, y: sy + dy - e.h / 2 - (dy === 0 ? 0 : 0) });
          }
        }
        const order = [e.slot, ...cands.keys()].filter((v, i, a) => a.indexOf(v) === i);
        for (const i of order) {
          const c = cands[i]!;
          if (c.x < A.left + 4 || c.x + e.w > A.right - 4 || c.y < A.top + 4 || c.y + e.h > A.bottom - 4) continue;
          if (placed.some((p) => c.x < p.x + p.w && c.x + e.w > p.x && c.y < p.y + p.h && c.y + e.h > p.y)) continue;
          // Keep a leader line from crossing another label's dot area: reject if it hides another anchor.
          slotPos = c;
          e.slot = i;
          break;
        }
      }
      if (!slotPos) {
        if (e.shown) {
          e.el.classList.remove('is-visible');
          e.line.style.opacity = '0';
          e.dot.style.opacity = '0';
          e.shown = false;
        }
        continue;
      }
      placed.push({ x: slotPos.x, y: slotPos.y, w: e.w, h: e.h });
      if (!e.shown) {
        e.el.classList.add('is-visible');
        e.line.style.opacity = '1';
        e.dot.style.opacity = '1';
        e.shown = true;
      }
      e.el.style.transform = `translate(${slotPos.x.toFixed(1)}px, ${slotPos.y.toFixed(1)}px)`;
      const onRight = slotPos.x > sx;
      const lx = onRight ? slotPos.x : slotPos.x + e.w - 6;
      e.line.setAttribute('x1', sx.toFixed(1));
      e.line.setAttribute('y1', sy.toFixed(1));
      e.line.setAttribute('x2', (onRight ? lx + 2 : lx).toFixed(1));
      e.line.setAttribute('y2', (slotPos.y + e.h / 2).toFixed(1));
      e.dot.setAttribute('cx', sx.toFixed(1));
      e.dot.setAttribute('cy', sy.toFixed(1));
    }
  }
}
