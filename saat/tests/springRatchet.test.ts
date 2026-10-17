import { describe, expect, it } from 'vitest';
import { PartRegistry } from '../src/core/registry';
import { arborUnwrappedDeg, BARREL_SENSE, drumUnwrappedDeg, SPRING_POINTS, springCoils, springPolyline } from '../src/watch/mainspring';
import { WatchMaterials } from '../src/watch/materials';
import { CLICK_TIP_ANGLE, clickAngle, SAW_PITCH_DEG, sawPhase, sawRadius } from '../src/watch/ratchet';
import { MAINSPRING, RATCHET, SPRING } from '../src/watch/specs';
import { Watch } from '../src/watch/watch';
import { WatchClock } from '../src/watch/watchClock';
import { type P2, Region, transform } from './geom2d';
import { sawOutline } from '../src/watch/parts/winding';

const DEG = Math.PI / 180;
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

describe('mainspring coils', () => {
  it('unwound it lies on the wall (11 coils) with a short tail on the arbor; winding moves coils to the arbor', () => {
    const c0 = springCoils(0);
    expect(c0.inner).toBeCloseTo(SPRING.innerCoilsUnwound, 2);
    expect(c0.outer).toBeCloseTo(SPRING.outerCoilsUnwound, 2);
    let prevInner = -1;
    let prevOuter = Infinity;
    for (let w = 0; w <= MAINSPRING.effectiveTurns; w += 0.5) {
      const c = springCoils(w);
      expect(c.inner).toBeGreaterThan(prevInner);
      expect(c.outer).toBeLessThan(prevOuter);
      prevInner = c.inner;
      prevOuter = c.outer;
      // the stacks never touch: a free span of at least one blade thickness stays between them
      const rInner = SPRING.coreRadius + SPRING.thickness * c.inner;
      const rOuter = SPRING.wallRadius - SPRING.thickness * c.outer;
      expect(rOuter - rInner, `W = ${w}`).toBeGreaterThan(SPRING.thickness);
    }
    const full = springCoils(MAINSPRING.effectiveTurns);
    expect(full.inner).toBeGreaterThan(14); // wound: dense coils on the arbor
    expect(full.outer).toBeLessThan(4); // …and almost nothing left against the wall
    // clamped outside the range
    expect(springCoils(-3)).toEqual(springCoils(0));
    expect(springCoils(99)).toEqual(springCoils(MAINSPRING.effectiveTurns));
  });

  it('the blade has the same length at every state of wind, and its ends stay on the arbor and on the wall', () => {
    const pts = new Float64Array(2 * SPRING_POINTS);
    const length = (): number => {
      let l = 0;
      for (let i = 1; i < SPRING_POINTS; i++) l += Math.hypot(pts[2 * i]! - pts[2 * i - 2]!, pts[2 * i + 1]! - pts[2 * i - 1]!);
      return l;
    };
    springPolyline(0, pts);
    const ref = length();
    for (const w of [1, 2.5, 4, 6, 8]) {
      springPolyline(w, pts);
      expect(Math.abs(length() / ref - 1), `W = ${w}`).toBeLessThan(0.02);
      // arbor end on the core, wall end on the wall at angle 0 (+X)
      expect(Math.hypot(pts[0]!, pts[1]!)).toBeCloseTo(SPRING.coreRadius, 6);
      const last = SPRING_POINTS - 1;
      expect(Math.hypot(pts[2 * last]!, pts[2 * last + 1]!)).toBeCloseTo(SPRING.wallRadius, 6);
      expect(pts[2 * last + 1]!).toBeCloseTo(0, 6);
      // the arbor hook has been turned W turns forward relative to the drum
      const hook = Math.atan2(-pts[1]!, pts[0]!) / DEG; // rotY angle of the arbor end
      expect(wrap180(hook - BARREL_SENSE * w * 360), `hook at W = ${w}`).toBeCloseTo(0, 6);
    }
  });
});

describe('arbor and ratchet', () => {
  it('arbor angle = drum angle + wound turns × 360°: it stays put while the watch runs and moves forward when wound', () => {
    const c = new WatchClock({ t: 100, windTurns: 4 });
    const a0 = arborUnwrappedDeg(c.t, c.windTurns);
    c.advance(6 * 3600);
    expect(drumUnwrappedDeg(c.t) - drumUnwrappedDeg(100)).toBeCloseTo(BARREL_SENSE * 360 * 0.6, 6); // 6 h = 0.6 barrel turn
    expect(c.windTurns).toBeCloseTo(3.4, 9);
    expect(arborUnwrappedDeg(c.t, c.windTurns)).toBeCloseTo(a0, 6);
    // winding: forward by 360° per wound turn, in the sense of the barrel
    const before = arborUnwrappedDeg(c.t, c.windTurns);
    c.wind(0.5);
    expect(arborUnwrappedDeg(c.t, c.windTurns) - before).toBeCloseTo(BARREL_SENSE * 180, 9);
  });

  it('in the assembled watch the arbor and ratchet nodes hold still over hours and turn with the crown', () => {
    const registry = new PartRegistry();
    const watch = new Watch(registry, new WatchMaterials());
    watch.build();
    const c = new WatchClock({ t: 5000, windTurns: 5 });
    const angle = (name: string) => watch.spin.get(name)!.rotation.y / DEG;
    watch.update(c.t, { continuous: true, ...c.pose });
    const arbor = angle('arbor');
    const ratchet = angle('ratchet');
    const drum = watch.bodyPart('barrel').motion.rotation.y / DEG;
    for (let h = 1; h <= 3; h++) {
      c.advance(3600);
      watch.update(c.t, { continuous: true, ...c.pose });
      expect(wrap180(angle('arbor') - arbor), `after ${h} h`).toBeCloseTo(0, 6);
      expect(wrap180(angle('ratchet') - ratchet)).toBeCloseTo(0, 6);
    }
    // the drum moved on meanwhile, in the same sense as winding turns the arbor
    const drum2 = watch.bodyPart('barrel').motion.rotation.y / DEG;
    expect(Math.sign(wrap180(drum2 - drum))).toBe(BARREL_SENSE);
    // cover and spring turn with the drum
    expect(watch.spin.get('barrelCover')!.rotation.y).toBeCloseTo(watch.bodyPart('barrel').motion.rotation.y, 12);
    expect(watch.spin.get('mainspring')!.rotation.y).toBeCloseTo(watch.bodyPart('barrel').motion.rotation.y, 12);
    // crown: the arbor turns forward by 360° · (ratchet turns per crown turn)
    const a1 = angle('arbor');
    c.setCrownPosition(1);
    c.turnCrown(100);
    watch.update(c.t, { continuous: true, ...c.pose });
    const turned = wrap180(angle('arbor') - a1);
    expect(Math.sign(turned)).toBe(BARREL_SENSE);
    expect(Math.abs(turned)).toBeCloseTo(100 * (10 / 16) * (36 / 64), 6);
  });
});

describe('ratchet click', () => {
  it('the saw ring has one steep wall and one ramp per tooth: the click rides up the ramp and drops over the wall', () => {
    expect(SAW_PITCH_DEG).toBeCloseTo(360 / RATCHET.saw.teeth, 12);
    // a ratchet angle of one pitch is one tooth: the phase is periodic
    expect(sawPhase(0)).toBeCloseTo(0, 12);
    expect(sawPhase(BARREL_SENSE * SAW_PITCH_DEG * 7.25)).toBeCloseTo(0.25, 9);
    expect(sawRadius(0)).toBe(RATCHET.saw.rootRadius);
    expect(sawRadius(1)).toBe(RATCHET.saw.tipRadius);
    // the click angle over one tooth: monotone up the ramp …
    let prev = clickAngle(0);
    expect(prev).toBeCloseTo(0, 12);
    let rise = 0;
    for (let k = 1; k < 100; k++) {
      const v = k / 100;
      const a = clickAngle(BARREL_SENSE * SAW_PITCH_DEG * v);
      expect(Math.abs(a)).toBeGreaterThan(Math.abs(prev) - 1e-12);
      expect(Math.sign(a * (prev || a))).toBeGreaterThanOrEqual(0);
      rise = a;
      prev = a;
    }
    // … then the drop at the wall brings it back to seated
    expect(Math.abs(rise)).toBeGreaterThan(2);
    expect(clickAngle(BARREL_SENSE * SAW_PITCH_DEG)).toBeCloseTo(0, 9);
    // and the ramp is long, the wall instantaneous: one pitch of reverse motion from the seat is
    // an instant jump to the crest, not a gradual slope
    expect(Math.abs(clickAngle(-BARREL_SENSE * 1e-6))).toBeGreaterThan(0.99 * Math.abs(rise));
    expect(Math.abs(clickAngle(BARREL_SENSE * 1e-6))).toBeLessThan(0.01 * Math.abs(rise));
  });

  it('winding goes through the teeth one way only: the arbor never turns back, whatever the crown does', () => {
    const c = new WatchClock({ t: 0, windTurns: 3 });
    let last = arborUnwrappedDeg(c.t, c.windTurns) * BARREL_SENSE;
    const seq = [200, -150, 90, -400, 30, 700, -20, 5, -5, 360];
    for (const [i, deg] of seq.entries()) {
      c.setCrownPosition(1);
      c.turnCrown(deg);
      c.advance(900 * (i + 1)); // the watch runs in between
      const now = arborUnwrappedDeg(c.t, c.windTurns) * BARREL_SENSE;
      expect(now, `step ${i}`).toBeGreaterThanOrEqual(last - 1e-9);
      last = now;
    }
  });

  it('the saw ring as drawn matches the profile the click follows: ramp under the tip, a wall on a reverse turn', () => {
    const outline = sawOutline();
    const dense: P2[] = outline.flatMap((p, i) => {
      const q = outline[(i + 1) % outline.length]!;
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.004));
      return Array.from({ length: n }, (_, k) => [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n] as P2);
    });
    const dir = CLICK_TIP_ANGLE * DEG;
    // outer boundary of the ring along the ray through the click tip, with the ring turned by `turn` degrees
    const boundary = (turn: number): number => {
      const region = new Region(transform(dense, turn, [0, 0]));
      let inside = 0;
      for (let r = 1.5; r < 2.3; r += 0.0025) {
        if (region.contains([r * Math.cos(dir), -r * Math.sin(dir)])) inside = r;
      }
      return inside;
    };
    for (const v of [0.01, 0.25, 0.5, 0.9]) {
      expect(boundary(BARREL_SENSE * SAW_PITCH_DEG * v), `v = ${v}`).toBeCloseTo(sawRadius(v), 1);
      expect(Math.abs(boundary(BARREL_SENSE * SAW_PITCH_DEG * v) - sawRadius(v)), `v = ${v}`).toBeLessThan(0.012);
    }
    // a hair backwards and the tip stands before the wall: the ring is at crest height there
    expect(Math.abs(boundary(-BARREL_SENSE * 0.2) - RATCHET.saw.tipRadius)).toBeLessThan(0.012);
  });
});
