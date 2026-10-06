import { describe, expect, it } from 'vitest';
import { LAYERS, PARTS } from '../src/engine/catalog';
import { SPECS } from '../src/engine/specs';

/*
 * Exploded-view sanity (Phase 5 audit, finding 1): when fully open, a part
 * that comes off earlier must sit further out than the parts under it, or it
 * would pass through them. Assembled heights are from the geometry (mm):
 * head 203–323 (body), cams 290–356, buckets 269–310, valve faces ≈ 205,
 * pistons ≤ 201 at TDC, rings ≤ 195, cover 323–381.
 */
const y = (p: { explodeOffset: readonly number[] }) => p.explodeOffset[1]!;
const z = (p: { explodeOffset: readonly number[] }) => p.explodeOffset[2]!;

describe('exploded view', () => {
  it('top end stacks outward: cover > cam caps > cams > head > gasket > rings > pistons > rods', () => {
    const order = [
      PARTS.valveCover,
      PARTS.camCaps('exhaust'),
      PARTS.camshaft('exhaust'),
      PARTS.cylinderHead,
      PARTS.headGasket,
      PARTS.rings(1),
      PARTS.piston(1),
      PARTS.rod(1),
    ];
    for (let i = 1; i < order.length; i++) expect(y(order[i - 1]!), `${order[i - 1]!.id} above ${order[i]!.id}`).toBeGreaterThan(y(order[i]!));
  });

  it('parts clear each other vertically where they overlap in plan', () => {
    // cover bottom (323 + dy) above the cam caps' top (344 + dy)
    expect(323 + y(PARTS.valveCover)).toBeGreaterThan(344 + y(PARTS.camCaps('intake')) + 10);
    // cam caps above the camshafts (cam top 356)
    expect(323 + y(PARTS.camCaps('intake'))).toBeGreaterThan(356 + y(PARTS.camshaft('intake')) - 40); // caps straddle the journals
    // head bottom above the rings at TDC (195) and the gasket
    expect(203 + y(PARTS.cylinderHead)).toBeGreaterThan(204 + y(PARTS.headGasket) + 10);
    expect(203 + y(PARTS.headGasket)).toBeGreaterThan(195 + y(PARTS.rings(1)) + 10);
    // pistons leave the bores even at BDC (crown ≈ 125 at BDC, deck 203)
    expect(125 - SPECS.piston.compressionHeight - SPECS.piston.skirtBelowPin + y(PARTS.piston(1))).toBeGreaterThan(SPECS.block.deckHeight);
  });

  it('valve stack: valve → spring → retainer → bucket outwards along the axis', () => {
    const stack = (k: 'intake' | 'exhaust') => [PARTS.valves(1, k), PARTS.springs(1, k), PARTS.retainers(1, k), PARTS.buckets(1, k)];
    for (const k of ['intake', 'exhaust'] as const) {
      const s = stack(k);
      for (let i = 1; i < s.length; i++) {
        expect(y(s[i]!)).toBeGreaterThan(y(s[i - 1]!));
        expect(Math.abs(z(s[i]!))).toBeGreaterThan(Math.abs(z(s[i - 1]!)));
      }
      // buckets (|z| ≥ 31 assembled) end up outside the camshafts' plan (|z| ≤ 95 assembled)
      expect(31 + Math.abs(z(PARTS.buckets(1, k)))).toBeGreaterThan(95 + Math.abs(z(PARTS.camshaft(k))) + 20);
    }
  });

  it('valve stacks move out sideways clear of the lifted head (|z| > head half-width 127)', () => {
    for (const kind of ['intake', 'exhaust'] as const) {
      const v = PARTS.valves(1, kind);
      // valve head sits at |z| ≈ 4…67 assembled
      expect(Math.abs(z(v)) + 4).toBeGreaterThan(127);
      expect(Math.sign(z(v))).toBe(kind === 'intake' ? -1 : 1);
    }
  });

  it('every layer in the teardown order has parts, and manifolds/cover go outwards', () => {
    const used = new Set(Object.values(PARTS).flatMap((p) => (typeof p === 'function' ? [] : [p.group])));
    for (const l of ['intake-manifold', 'exhaust-manifold', 'chain-cover']) expect(used.has(l)).toBe(true);
    expect(LAYERS.map((l) => l.order)).toEqual(LAYERS.map((_, i) => i + 1));
    expect(z(PARTS.intakeManifold)).toBeLessThan(-200);
    expect(z(PARTS.exhaustManifold)).toBeGreaterThan(200);
    expect(PARTS.chainCover.explodeOffset[0]).toBeLessThan(PARTS.timingChain.explodeOffset[0]);
  });
});
