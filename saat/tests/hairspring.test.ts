import { describe, expect, it } from 'vitest';
import { angleY } from '../src/watch/geometry/watchGear';
import { Hairspring, hairspringPoints } from '../src/watch/parts/escapement';
import { ESCAPEMENT, HAIRSPRING } from '../src/watch/specs';

type P2 = readonly [number, number];

/**
 * Smallest clear gap between neighbouring coils, mm: for every point of the
 * centre line, the radial distance to the next coil out at the same polar
 * angle, less the blade's thickness.
 */
function smallestGap(pts: readonly P2[]): number {
  // unwrap the polar angle (rotY sense) along the spiral: it turns monotonically
  const ang: number[] = [];
  let prev = angleY(pts[0]!);
  let acc = prev;
  for (const p of pts) {
    const a = angleY(p);
    let d = a - prev;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    acc += d;
    ang.push(acc);
    prev = a;
  }
  const sense = Math.sign(ang[ang.length - 1]! - ang[0]!);
  const r = pts.map((p) => Math.hypot(p[0], p[1]));
  let best = Infinity;
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    const target = ang[i]! + sense * 360;
    while (j < pts.length - 1 && sense * (ang[j + 1]! - target) < 0) j++;
    if (j >= pts.length - 1) break;
    const w = (target - ang[j]!) / (ang[j + 1]! - ang[j]!);
    if (w < 0 || w > 1) continue;
    const rNext = r[j]! + (r[j + 1]! - r[j]!) * w;
    best = Math.min(best, rNext - r[i]! - HAIRSPRING.thickness);
  }
  return best;
}

describe('balance spring', () => {
  const A = ESCAPEMENT.balance.amplitudeFullDeg;

  it(`neighbouring coils never touch, at rest and at ± full amplitude (${A}°)`, () => {
    for (const theta of [-A, -A / 2, 0, A / 2, A]) {
      const g = smallestGap(hairspringPoints(theta));
      expect(g, `θ = ${theta}°`).toBeGreaterThan(0);
      expect(Number.isFinite(g)).toBe(true);
    }
  });

  it('it breathes: wound one way the coils close up, the other way they open', () => {
    const g0 = smallestGap(hairspringPoints(0));
    const gp = smallestGap(hairspringPoints(A));
    const gm = smallestGap(hairspringPoints(-A));
    expect(Math.min(gp, gm)).toBeLessThan(g0);
    expect(Math.max(gp, gm)).toBeGreaterThan(g0);
  });

  it('the outer end stays in the stud; the inner end turns with the balance', () => {
    const rest = hairspringPoints(0);
    for (const theta of [-A, -77, 0, 123, A]) {
      const p = hairspringPoints(theta);
      const outer = p[p.length - 1]!;
      expect(Math.hypot(outer[0] - rest[rest.length - 1]![0], outer[1] - rest[rest.length - 1]![1])).toBeLessThan(
        1e-12,
      );
      const turned = angleY(p[0]!) - angleY(rest[0]!);
      expect(Math.abs(((turned - theta + 540) % 360) - 180)).toBeLessThan(1e-9);
    }
  });

  it('the ribbon is rewritten in place (no new geometry per frame)', () => {
    const h = new Hairspring();
    const pos = h.geometry.getAttribute('position');
    const before = (pos.array as Float32Array).slice();
    h.update(150);
    expect(h.geometry.getAttribute('position')).toBe(pos);
    expect((pos.array as Float32Array).some((v, i) => v !== before[i])).toBe(true);
  });
});
