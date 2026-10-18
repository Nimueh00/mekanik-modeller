import type { BufferGeometry, Mesh } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { PartRegistry } from '../src/core/registry';
import { LAYERS, PARTS } from '../src/watch/catalog';
import { jumperAngle, ringAngle, ringFloatAt } from '../src/watch/dateWork';
import { windTurnsForAmplitude } from '../src/watch/escapement';
import { WatchMaterials } from '../src/watch/materials';
import { arborUnwrappedDeg } from '../src/watch/mainspring';
import { MAINSPRING } from '../src/watch/specs';
import { handAngles, trainAngles } from '../src/watch/train';
import { Watch } from '../src/watch/watch';
import { WatchClock } from '../src/watch/watchClock';

const DEG = Math.PI / 180;

const NEW_PARTS = [
  'barrel-cover',
  'mainspring',
  'barrel-arbor',
  'rotor',
  'rotor-bearing',
  'ratchet-wheel',
  'click',
  'click-spring',
  'crown-wheel',
  'reverser-1',
  'reverser-2',
  'reduction-wheel',
  'winding-stem',
  'sliding-pinion',
  'winding-pinion',
  'yoke',
  'yoke-spring',
  'setting-lever',
  'setting-lever-spring',
  'intermediate-contrate',
  'intermediate-gear',
  'setting-wheel',
  'date-corrector',
  'date-ring',
  'date-jumper',
];

function triangles(g: BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

describe('P3 assembly', () => {
  let registry: PartRegistry;
  let watch: Watch;
  beforeAll(() => {
    registry = new PartRegistry();
    watch = new Watch(registry, new WatchMaterials());
    watch.build();
  });

  it('the barrel is in parts (drum with teeth, cover, spring, arbor) and every new mechanism is a registered part', () => {
    for (const id of NEW_PARTS) expect(() => registry.get(id), id).not.toThrow();
    expect(registry.get('barrel').def.nameTr).toMatch(/tambur/i);
    // cover and spring follow the drum's motion node angle
    watch.update(1234.5, { continuous: true });
    const drum = watch.bodyPart('barrel').motion.rotation.y;
    expect(registry.get('barrel-cover').motion.rotation.y).toBe(drum);
    expect(registry.get('mainspring').motion.rotation.y).toBe(drum);
  });

  it('every part has Turkish text, a known layer and a finite offset; back-side parts come off towards −Y, dial-side towards +Y, the stem sideways', () => {
    const layers = new Set<string>(LAYERS.map((l) => l.id));
    for (const id of NEW_PARTS) {
      const d = registry.get(id).def;
      expect(layers.has(d.group), id).toBe(true);
      expect(d.nameTr.trim().length, id).toBeGreaterThan(3);
      expect(d.info.function.length, id).toBeGreaterThan(20);
      expect(d.info.material.length, id).toBeGreaterThan(3);
      expect(d.info.notes.length, id).toBeGreaterThan(10);
      expect(d.explodeOffset.every(Number.isFinite)).toBe(true);
    }
    const back = ['rotor', 'winding', 'keyless', 'barrel', 'centre'];
    const dial = ['date', 'keyless-dial'];
    for (const p of registry.all()) {
      if (p.def.id === 'winding-stem' || p.def.id === 'intermediate-contrate') continue; // sideways; back-side part in a dial-side layer
      if (back.includes(p.def.group)) expect(p.def.explodeOffset[1], p.def.id).toBeLessThan(0);
      if (dial.includes(p.def.group)) expect(p.def.explodeOffset[1], p.def.id).toBeGreaterThan(0);
    }
    // the contrate wheel is pressed on the intermediate's axle from the back: it leaves towards −Y before the gear lifts out
    expect(PARTS.intermediateContrate.explodeOffset[1]).toBeLessThan(0);
    // the setting lever, the yoke and their springs are on the dial side
    for (const id of ['setting-lever', 'yoke', 'setting-lever-spring', 'yoke-spring']) {
      expect(registry.get(id).def.group, id).toBe('keyless-dial');
      expect(registry.get(id).def.explodeOffset[1], id).toBeGreaterThan(0);
    }
    expect(PARTS.windingStem.explodeOffset[0]).toBeGreaterThan(100); // out along +X, the way the crown points
    expect(PARTS.windingStem.explodeOffset[1]).toBe(0);
  });

  it('the disassembly order is fixed: the centre wheel no longer passes through the barrel (it comes off after it) and the rotor first', () => {
    const order = (id: string) => LAYERS.find((l) => l.id === id)!.order;
    expect(order('rotor')).toBe(1);
    expect(order('barrel')).toBeLessThan(order('centre'));
    expect(order('train')).toBeLessThan(order('barrel'));
    expect(PARTS.centreWheel.group).toBe('centre');
    // the centre wheel comes off last, so it goes the least distance; it no longer moves sideways
    expect(PARTS.centreWheel.explodeOffset[0]).toBe(0);
    expect(PARTS.centreWheel.explodeOffset[2]).toBe(0);
    expect(Math.abs(PARTS.centreWheel.explodeOffset[1])).toBeLessThan(Math.abs(PARTS.barrel.explodeOffset[1]) + 30);
    // within the barrel: cover, spring, arbor, then the drum
    const barrelOrder = ['barrel-cover', 'mainspring', 'barrel-arbor', 'barrel'].map((id) => registry.get(id).def.explodeOrder);
    expect([...barrelOrder].sort((a, b) => a - b)).toEqual(barrelOrder);
    // the click comes off before the ratchet wheel it holds
    expect(registry.get('click').def.explodeOrder).toBeLessThan(registry.get('ratchet-wheel').def.explodeOrder);
  });

  it('the scene stays under 600 000 triangles (P2 was 115 752)', () => {
    let total = 0;
    registry.root.traverse((o) => {
      if ((o as Mesh).isMesh) total += triangles((o as Mesh).geometry);
    });
    expect(total).toBeGreaterThan(115752);
    expect(total).toBeLessThan(600000);
  });

  it('update() without a pose reads the wind back from the amplitude and the date from t (a plain watch)', () => {
    const t = 16 * 86400 + 10 * 3600 + 500;
    watch.update(t, { continuous: true, amplitude: 250 });
    const arbor = watch.spin.get('arbor')!.rotation.y / DEG;
    const expected = arborUnwrappedDeg(t, windTurnsForAmplitude(250)) % 360;
    expect((((arbor - expected) % 360) + 540) % 360 - 180).toBeCloseTo(0, 6);
    expect(windTurnsForAmplitude(250)).toBeCloseTo(MAINSPRING.effectiveTurns / 2, 9);
    const ring = ringFloatAt(t);
    expect(watch.spin.get('dateRing')!.rotation.y / DEG).toBeCloseTo(ringAngle(ring), 9);
    expect(watch.spin.get('jumper')!.rotation.y / DEG).toBeCloseTo(jumperAngle(ring), 9);
  });

  it('with a pose, the hands, the date driver and the ring follow the hand offset; the going train does not', () => {
    const c = WatchClock.fromDate(new Date(2026, 9, 17, 21, 30, 0));
    c.setCrownPosition(3);
    c.turnCrown(500); // 4167 s of hands
    watch.update(c.t, { continuous: true, amplitude: c.amplitude, ...c.pose });
    const a = trainAngles(c.t, { handOffset: c.handOffset, continuous: true });
    expect(registry.get('minute-hand').motion.rotation.y).toBeCloseTo(a.cannon * DEG, 12);
    expect(registry.get('hour-hand').motion.rotation.y).toBeCloseTo(a.hourWheel * DEG, 12);
    expect(registry.get('second-hand').motion.rotation.y).toBeCloseTo(a.fourth * DEG, 12);
    expect(watch.bodyPart('centre').motion.rotation.y).toBeCloseTo(trainAngles(c.t, { continuous: true }).centre * DEG, 12);
    expect(watch.bodyPart('dateDriver').motion.rotation.y).toBeCloseTo(a.dateDriver * DEG, 12);
    expect(handAngles(c.t, { handOffset: c.handOffset }).minute).toBe(a.cannon);
    // 21:30 + 69.4 min = 22:39: the ring is part-way through its step
    expect(c.dateRing - Math.floor(c.dateRing)).toBeGreaterThan(0.1);
    expect(watch.spin.get('dateRing')!.rotation.y / DEG).toBeCloseTo(ringAngle(c.dateRing), 9);
  });

  it('the stem, crown wheel and winding pinion turn together while the crown winds', () => {
    const c = new WatchClock({ windTurns: 3 });
    c.setCrownPosition(1);
    watch.update(c.t, { continuous: true, amplitude: c.amplitude, ...c.pose });
    const before = watch.spin.get('windingPinion')!.rotation.x;
    c.turnCrown(180);
    watch.update(c.t, { continuous: true, amplitude: c.amplitude, ...c.pose });
    expect(watch.spin.get('stem')!.rotation.x / DEG).toBeCloseTo(-180, 9);
    expect(watch.spin.get('slidingPinion')!.rotation.x / DEG).toBeCloseTo(-180, 9);
    expect(watch.spin.get('windingPinion')!.rotation.x / DEG - before / DEG).toBeCloseTo(-180, 6);
  });
});
