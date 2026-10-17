import type { BufferGeometry, Mesh } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { PartRegistry } from '../src/core/registry';
import { BODY_PART, LAYERS } from '../src/watch/catalog';
import { BANKING_DEG, beatPhase } from '../src/watch/escapement';
import { rotY } from '../src/watch/geometry/watchGear';
import { WatchMaterials } from '../src/watch/materials';
import { leverOutlines } from '../src/watch/parts/escapement';
import { BRIDGES, pillars } from '../src/watch/parts/frame';
import {
  AXES,
  type Body,
  DIAL,
  ESCAPEMENT,
  GEARS,
  HANDS,
  MOVEMENT,
  PLATE_RADIUS,
  SCENE_PER_MM,
  tipRadius,
  TRAIN,
} from '../src/watch/specs';
import { trainAngles } from '../src/watch/train';
import { Watch } from '../src/watch/watch';
import { densify, type P2, Region, selfIntersects } from './geom2d';

const DEG = Math.PI / 180;
const BODIES = Object.keys(BODY_PART) as Body[];

function triangles(g: BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

describe('assembly', () => {
  let registry: PartRegistry;
  let watch: Watch;

  beforeAll(() => {
    registry = new PartRegistry();
    watch = new Watch(registry, new WatchMaterials());
    watch.build();
  });

  it('every body of the train, the lever, the balance and its spring is a registered part', () => {
    for (const b of BODIES) {
      const node = watch.bodyPart(b);
      expect(node, b).toBeDefined();
      const axis = GEARS.find((g) => g.body === b)!.axis;
      expect(node.motion.position.x).toBeCloseTo(AXES[axis][0] * SCENE_PER_MM, 9);
      expect(node.motion.position.z).toBeCloseTo(AXES[axis][1] * SCENE_PER_MM, 9);
    }
    for (const id of ['lever', 'balance', 'hairspring', 'plate', 'dial', 'second-hand', 'minute-hand', 'hour-hand']) {
      expect(() => registry.get(id), id).not.toThrow();
    }
  });

  it('every part has a Turkish name and a known layer; explode offsets are finite', () => {
    const layerIds = new Set<string>(LAYERS.map((l) => l.id));
    for (const p of registry.all()) {
      const d = p.def;
      expect(d.nameTr.trim().length, d.id).toBeGreaterThan(2);
      expect(d.nameTr).not.toBe(d.id);
      expect(layerIds.has(d.group), d.id).toBe(true);
      expect(d.explodeOffset.every(Number.isFinite), d.id).toBe(true);
      expect(d.info.function.length, d.id).toBeGreaterThan(10);
    }
    // the layers carry Turkish names too (spot check for Turkish letters across them)
    expect(LAYERS.map((l) => l.nameTr).join(' ')).toMatch(/[çğıöşüÇĞİÖŞÜ]/);
    // back-side parts come off towards −Y, dial-side parts towards +Y
    for (const p of registry.all()) {
      const back = ['balance', 'bridges', 'lever', 'train', 'barrel'].includes(p.def.group);
      const front = ['hands', 'dial', 'motion-works'].includes(p.def.group);
      if (back) expect(p.def.explodeOffset[1], p.def.id).toBeLessThan(0);
      if (front) expect(p.def.explodeOffset[1], p.def.id).toBeGreaterThan(0);
    }
  });

  it('the whole scene stays under 600 000 triangles', () => {
    let total = 0;
    registry.root.traverse((o) => {
      if ((o as Mesh).isMesh) total += triangles((o as Mesh).geometry);
    });
    expect(total).toBeGreaterThan(20000);
    expect(total).toBeLessThan(600000);
  });

  it('update() poses wheels, hands, lever and balance from the kinematics', () => {
    const t = 10 * 3600 + 8 * 60 + 37.1;
    watch.update(t);
    const a = trainAngles(t);
    for (const b of BODIES) expect(watch.bodyPart(b).motion.rotation.y, b).toBeCloseTo(a[b] * DEG, 12);
    expect(registry.get('second-hand').motion.rotation.y).toBeCloseTo(a.fourth * DEG, 12);
    expect(registry.get('minute-hand').motion.rotation.y).toBeCloseTo(a.cannon * DEG, 12);
    expect(registry.get('hour-hand').motion.rotation.y).toBeCloseTo(a.hourWheel * DEG, 12);
    const p = beatPhase(t);
    expect(registry.get('lever').motion.rotation.y).toBeCloseTo(p.lever * DEG, 12);
    expect(registry.get('balance').motion.rotation.y).toBeCloseTo(p.balance * DEG, 12);
  });

  it('hands are stacked above the dial: hour < minute < seconds', () => {
    expect(HANDS.hour.y[0]).toBeGreaterThan(DIAL.y[1]);
    expect(HANDS.minute.y[0]).toBeGreaterThan(HANDS.hour.y[1]);
    expect(HANDS.second.y[0]).toBeGreaterThan(HANDS.minute.y[1]);
  });
});

describe('plate and bridges (plan)', () => {
  const inside = (outline: P2[], p: P2) => new Region(outline).contains(p);

  it('bridges lie on the plate, cover their pivots and do not overlap each other', () => {
    const defs = Object.entries(BRIDGES);
    for (const [name, d] of defs) {
      for (const p of d.outline) expect(Math.hypot(p[0], p[1]), name).toBeLessThan(PLATE_RADIUS - 0.2);
      for (const j of [...d.jewels, ...(d.bushes ?? [])]) expect(inside(d.outline, j), `${name} pivot`).toBe(true);
      for (const p of d.posts) expect(inside(d.outline, p), `${name} pillar`).toBe(true);
      expect(selfIntersects(d.outline), `${name} outline`).toBe(false);
    }
    for (let i = 0; i < defs.length; i++) {
      for (let k = i + 1; k < defs.length; k++) {
        const [na, a] = defs[i]!;
        const [nb, b] = defs[k]!;
        const ra = new Region(a.outline);
        const rb = new Region(b.outline);
        expect(
          densify(a.outline, 0.05).some((p) => rb.contains(p)),
          `${na} × ${nb}`,
        ).toBe(false);
        expect(
          densify(b.outline, 0.05).some((p) => ra.contains(p)),
          `${nb} × ${na}`,
        ).toBe(false);
      }
    }
    // the bridges sit in their axial envelope, above every part of the train
    expect(MOVEMENT.envelope.bridges[1]).toBeLessThanOrEqual(MOVEMENT.envelope.trainCavity[0]);
  });

  it('bridge pillars stand clear of every wheel, the barrel, the balance and the lever', () => {
    const discs: { at: P2; r: number; name: string }[] = [
      ...GEARS.filter((g) => g.gear.y[1] < 0).map((g) => ({ at: AXES[g.axis], r: tipRadius(g.gear), name: g.name })),
      { at: AXES.barrel, r: TRAIN.barrel.drum.radius, name: 'barrel' },
      { at: AXES.escape, r: TRAIN.escape.wheel.tipDiameter / 2, name: 'escape wheel' },
      { at: AXES.balance, r: ESCAPEMENT.balance.diameter / 2, name: 'balance' },
    ];
    const lever = leverOutlines();
    for (const pil of pillars()) {
      for (const d of discs) {
        const gap = Math.hypot(pil.at[0] - d.at[0], pil.at[1] - d.at[1]) - d.r - pil.r;
        expect(gap, d.name).toBeGreaterThan(0.05);
      }
      for (const lever0 of [-BANKING_DEG, 0, BANKING_DEG]) {
        for (const f of [...lever.frame, lever.fork]) {
          for (const q of f) {
            const p = rotY(q, lever0);
            expect(Math.hypot(AXES.pallet[0] + p[0] - pil.at[0], AXES.pallet[1] + p[1] - pil.at[1])).toBeGreaterThan(
              pil.r,
            );
          }
        }
      }
    }
  });
});
