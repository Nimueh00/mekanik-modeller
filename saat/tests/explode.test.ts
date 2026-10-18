import { Box3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Disassembly } from '../src/core/disassembly';
import { PartRegistry } from '../src/core/registry';
import { LAYERS } from '../src/watch/catalog';
import { WatchMaterials } from '../src/watch/materials';
import { Watch } from '../src/watch/watch';

/**
 * Fully open (amount = 1) no two part boxes may intersect, and while opening,
 * parts that are stacked on each other keep their order: nothing is drawn
 * through something that has not come off yet. Boxes are axis-aligned, taken
 * over a set of poses (the hands and the wheels turn, the rocker moves).
 */

/** Pairs allowed to intersect fully open, with the reason. */
const EXCEPTIONS: readonly (readonly [string, string, string])[] = [];

/**
 * The bridge screws are one scattered part (its box spans the whole plate, with
 * the screws of every bridge in it), so its box overlaps parts it never touches.
 */
const SCATTERED = new Set(['bridge-screws']);

/**
 * Boxes that overlap only at a corner: the real outlines are clear of each other
 * (winding pinion at 4.4 mm from the centre wheel's axis, the wheel reaches 3.5 mm
 * and the pinion 0.6 mm). The stem group comes off after the dial-side setting
 * works, the centre wheel before it, so the order of the boxes is not a collision.
 */
const CORNER_ONLY: readonly (readonly [string, string])[] = [
  ['sliding-pinion', 'centre-wheel'],
  ['winding-pinion', 'centre-wheel'],
];

const POSES = Array.from({ length: 10 }, (_, i) => ({
  t: i * 4321.7 + i * 0.37,
  o: {
    rotorAngle: (i % 3) * 120,
    crownPull: i % 2 ? 1.9 : 0,
    rocker: i % 3,
    windTurns: i % 4 === 0 ? 0.5 : 8 - i * 0.5,
    crownAngle: i * 70,
    settingAngle: i * 33,
    quickAngle: i * 19,
  },
}));

const EPS = 1e-4;
const intersects = (a: Box3, b: Box3) =>
  a.min.x < b.max.x - EPS &&
  b.min.x < a.max.x - EPS &&
  a.min.y < b.max.y - EPS &&
  b.min.y < a.max.y - EPS &&
  a.min.z < b.max.z - EPS &&
  b.min.z < a.max.z - EPS;
const planOverlap = (a: Box3, b: Box3) => a.min.x < b.max.x && b.min.x < a.max.x && a.min.z < b.max.z && b.min.z < a.max.z;

describe('disassembly', () => {
  let registry: PartRegistry;
  let watch: Watch;
  let dis: Disassembly;

  beforeAll(() => {
    registry = new PartRegistry();
    watch = new Watch(registry, new WatchMaterials());
    watch.build();
    dis = new Disassembly(registry);
    dis.rebuild();
  });

  /** Union over the poses of every part's box at the current explode amount. */
  function boxes(): Map<string, Box3> {
    const out = new Map<string, Box3>();
    for (const { t, o } of POSES) {
      watch.update(t, o);
      registry.root.updateMatrixWorld(true);
      for (const p of registry.all()) {
        const b = new Box3().setFromObject(p.root);
        const u = out.get(p.def.id);
        if (u) u.union(b);
        else out.set(p.def.id, b);
      }
    }
    return out;
  }

  it('fully open, no two parts intersect (axis-aligned boxes, every pose)', () => {
    dis.setAmount(1);
    const b = boxes();
    const ids = [...b.keys()];
    const bad: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (!intersects(b.get(ids[i]!)!, b.get(ids[j]!)!)) continue;
        if (EXCEPTIONS.some(([x, y]) => (x === ids[i] && y === ids[j]) || (x === ids[j] && y === ids[i]))) continue;
        bad.push(`${ids[i]} × ${ids[j]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('a part never passes through one stacked on it: the stacking order of overlapping parts holds all the way open', () => {
    const order = (id: string) => LAYERS.find((l) => l.id === id)!.order;
    dis.setAmount(0);
    const closed = boxes();
    const parts = registry.all();
    // stacked pairs: overlap in plan, disjoint in height when closed (nested ones, like an arbor in a bore, are skipped)
    const pairs: { upper: string; lower: string; sign: 1 | -1 }[] = [];
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i]!;
        const b = parts[j]!;
        if (SCATTERED.has(a.def.id) || SCATTERED.has(b.def.id)) continue;
        if (CORNER_ONLY.some(([x, y]) => (x === a.def.id && y === b.def.id) || (x === b.def.id && y === a.def.id))) continue;
        const A = closed.get(a.def.id)!;
        const B = closed.get(b.def.id)!;
        if (!planOverlap(A, B) || intersects(A, B)) continue;
        if (A.max.y <= B.min.y) pairs.push({ upper: a.def.id, lower: b.def.id, sign: -1 }); // a lies towards the back
        else if (B.max.y <= A.min.y) pairs.push({ upper: b.def.id, lower: a.def.id, sign: -1 });
      }
    }
    expect(pairs.length).toBeGreaterThan(50);
    const bad = new Set<string>();
    for (let k = 0; k <= 40; k++) {
      dis.setAmount(k / 40);
      const b = boxes();
      for (const { upper, lower } of pairs) {
        // `upper` is the one with smaller y: it must stay at smaller y than `lower`
        if (b.get(upper)!.max.y > b.get(lower)!.min.y + EPS) bad.add(`${upper} / ${lower}`);
      }
    }
    void order;
    expect([...bad]).toEqual([]);
  });
});
