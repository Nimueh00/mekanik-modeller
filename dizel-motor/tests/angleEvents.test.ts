import { describe, expect, it } from 'vitest';
import { AngleEventScheduler } from '../src/core/angleEvents';
import { MachineClock } from '../src/core/clock';
import { IGNITION_PHI } from '../src/engine/thermo';
import { FIRING_TDC } from '../src/engine/timing';

/** Run the clock for `seconds` at 60 fps and collect (tag, audio time) of every scheduled event. */
function run(rpm: number, timeScale: number, seconds: number) {
  const clock = new MachineClock({ rpm, timeScale });
  const events = FIRING_TDC.map((tdc, cyl) => ({ angle: (tdc + IGNITION_PHI) % 720, tag: cyl }));
  const fired: { tag: number; t: number }[] = [];
  const s = new AngleEventScheduler(clock, events, (e, t) => fired.push({ tag: e.tag, t }));
  s.lead = 0;
  let now = 0;
  s.update(now);
  for (let f = 0; f < seconds * 60; f++) {
    clock.tick(1 / 60);
    now += 1 / 60;
    s.update(now);
  }
  fired.sort((a, b) => a.t - b.t);
  return { fired, clock };
}

describe('firing-synchronised sound events', () => {
  it('two firings per crank revolution, in 1-3-4-2 order', () => {
    const { fired, clock } = run(1200, 1, 2); // 20 rev/s → 40 rev in 2 s
    const revs = clock.totalAngle / 360;
    expect(Math.abs(fired.length - 2 * revs)).toBeLessThanOrEqual(2); // lookahead may schedule one or two early
    const order = fired.slice(0, 8).map((f) => f.tag + 1);
    // the sequence is a rotation of 1-3-4-2
    const seq = [1, 3, 4, 2];
    const k = seq.indexOf(order[0]!);
    expect(order).toEqual(order.map((_, i) => seq[(k + i) % 4]));
  });

  it('events are evenly spaced in time at the firing interval (180° crank)', () => {
    const rpm = 3000;
    const { fired } = run(rpm, 1, 1);
    const dt = 60 / rpm / 2;
    for (let i = 1; i < fired.length; i++) expect(fired[i]!.t - fired[i - 1]!.t).toBeCloseTo(dt, 6);
  });

  it('slow motion stretches the spacing by the time scale', () => {
    const { fired } = run(800, 1 / 50, 12);
    const dt = (60 / 800 / 2) * 50; // 3.75 s
    expect(fired.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < fired.length; i++) expect(fired[i]!.t - fired[i - 1]!.t).toBeCloseTo(dt, 6);
  });

  it('a manual step that crosses a spark fires it; stepping back does not', () => {
    const clock = new MachineClock({ rpm: 800 });
    clock.paused = true;
    const fired: number[] = [];
    const s = new AngleEventScheduler(clock, [{ angle: 705, tag: 0 }], (e) => fired.push(e.tag));
    clock.crankAngle = 700;
    s.update(0);
    clock.advance(10); // crosses 705
    s.update(0.1);
    expect(fired).toEqual([0]);
    clock.advance(-10);
    s.update(0.2);
    clock.advance(3); // 703: not yet
    s.update(0.3);
    expect(fired).toEqual([0]);
  });
});
