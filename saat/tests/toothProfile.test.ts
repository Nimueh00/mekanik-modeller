import { describe, expect, it } from 'vitest';
import { ESCAPE_WHEEL_OUTLINE } from '../src/watch/geometry/escapeGeometry';
import { gearOutline, rootRadius } from '../src/watch/geometry/watchGear';
import { GEARS, tipRadius, TRAIN } from '../src/watch/specs';
import { selfIntersects, signedArea } from './geom2d';

const radius = (p: readonly [number, number]) => Math.hypot(p[0], p[1]);

/** Count teeth as maxima of the radius along the outline (one per tooth tip). */
function countTips(pts: readonly (readonly [number, number])[], rTip: number, tol: number): number {
  let count = 0;
  let inTip = false;
  // start the walk in a gap so that a tip is not split across the wrap
  const start = pts.findIndex((p) => radius(p) < rTip - tol * 4);
  for (let i = 0; i < pts.length; i++) {
    const near = radius(pts[(start + i) % pts.length]!) > rTip - tol;
    if (near && !inTip) count++;
    inTip = near;
  }
  return count;
}

describe('watch tooth profiles', () => {
  for (const g of GEARS) {
    it(`${g.name}: ${g.gear.teeth} ${g.pinion ? 'leaves' : 'teeth'}, inside the tip circle, simple polygon`, () => {
      const o = gearOutline(g);
      const rMax = Math.max(...o.map(radius));
      const rMin = Math.min(...o.map(radius));
      expect(rMax).toBeLessThanOrEqual(tipRadius(g.gear) + 1e-12);
      // the ogive / leaf tip reaches the addendum it was drawn for
      expect(rMax).toBeGreaterThan(tipRadius(g.gear) - (g.pinion ? 0.5 : 0.01) * g.gear.module);
      expect(rMin).toBeGreaterThan(0);
      expect(Math.abs(rMin - rootRadius(g))).toBeLessThan(1e-9);
      expect(countTips(o, rMax, 0.02 * g.gear.module)).toBe(g.gear.teeth);
      expect(selfIntersects(o)).toBe(false);
      expect(signedArea(o)).toBeGreaterThan(0);
    });
  }

  it('escape wheel: 15 club teeth, heels on the tip circle Ø 4.0 mm, simple polygon', () => {
    const o = ESCAPE_WHEEL_OUTLINE;
    const R = TRAIN.escape.wheel.tipDiameter / 2;
    const rMax = Math.max(...o.map(radius));
    expect(rMax).toBeLessThanOrEqual(R + 1e-12);
    expect(rMax).toBeGreaterThan(R - 1e-6);
    expect(Math.min(...o.map(radius))).toBeGreaterThan(0);
    expect(countTips(o, rMax, 1e-4)).toBe(TRAIN.escape.wheel.teeth);
    expect(selfIntersects(o)).toBe(false);
  });
});
