import { Vector3 } from 'three';
import type { Vec3 } from '../core/registry';
import type { SectionView } from '../core/section';
import { CYLINDER_X, SPECS } from './specs';

export type CutMode = 'transverse' | 'longitudinal';

/** The cylinder the cycle panel, the cut and the camera are focused on (0-based). */
export class CycleFocus {
  private value = 0;
  private listeners: ((c: number) => void)[] = [];

  get cylinder(): number {
    return this.value;
  }

  set(c: number): void {
    if (c === this.value) return;
    this.value = c;
    for (const l of this.listeners) l(c);
  }

  onChange(l: (c: number) => void): void {
    this.listeners.push(l);
  }
}

/** Plane offset limits (mm). Transverse: along X from the focused bore axis; longitudinal: along Z. */
export const CUT_RANGE: Record<CutMode, { min: number; max: number; initial: number }> = {
  transverse: { min: -42, max: 42, initial: 10 },
  longitudinal: { min: -45, max: 45, initial: 0 },
};

/**
 * Engine-specific placement of the section plane.
 *
 *  - Transverse (default): plane normal to the crankshaft through the focused
 *    cylinder, `offset` mm behind its axis (towards the flywheel). Everything
 *    on the flywheel side is removed, so port, valve, chamber, piston and rod
 *    of that cylinder are seen in profile from +X — the classic cutaway.
 *  - Longitudinal: the plane through all four bore axes (z = offset); the
 *    exhaust (+Z) half is removed.
 *
 * The focused cylinder's moving parts (piston, rings, pin, rod, valves,
 * springs, buckets) stay whole, as in an exhibition cutaway; every other
 * part is cut and capped.
 */
export class Cutaway {
  mode: CutMode = 'transverse';
  offset: Record<CutMode, number> = { transverse: CUT_RANGE.transverse.initial, longitudinal: CUT_RANGE.longitudinal.initial };
  private listeners: (() => void)[] = [];

  constructor(
    private section: SectionView,
    private focus: CycleFocus,
  ) {
    focus.onChange(() => this.apply());
    this.apply();
  }

  onChange(l: () => void): void {
    this.listeners.push(l);
  }

  setMode(m: CutMode): void {
    this.mode = m;
    this.apply();
  }

  setOffset(mm: number): void {
    this.offset[this.mode] = mm;
    this.apply();
  }

  apply(): void {
    const c = this.focus.cylinder;
    const cx = CYLINDER_X[c]!;
    const off = this.offset[this.mode];
    if (this.mode === 'transverse') this.section.setPlane(new Vector3(1, 0, 0), new Vector3(cx + off, 0, 0));
    else this.section.setPlane(new Vector3(0, 0, 1), new Vector3(0, 0, off));
    const n = c + 1;
    const whole = new Set([`piston-${n}`, `piston-pin-${n}`, `rings-${n}`, `rod-${n}`, `rod-cap-${n}`]);
    for (const k of ['intake', 'exhaust']) for (const p of ['valves', 'springs', 'retainers', 'buckets']) whole.add(`${p}-${k}-${n}`);
    this.section.setExempt((id) => id !== undefined && whole.has(id));
    for (const l of this.listeners) l();
  }

  /** Camera for the "Kesit" preset, looking squarely at the cut through the focused cylinder. */
  view(): { position: Vec3; target: Vec3 } {
    const cx = CYLINDER_X[this.focus.cylinder]!;
    const y = SPECS.block.deckHeight - 15;
    if (this.mode === 'transverse') {
      const x = cx + this.offset.transverse;
      return { position: [x + 560, y + 120, 150], target: [x, y, 0] };
    }
    return { position: [cx + 90, y + 110, 600], target: [cx, y, 0] };
  }
}
