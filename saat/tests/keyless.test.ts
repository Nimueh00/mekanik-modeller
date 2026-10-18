import { describe, expect, it } from 'vitest';
import { PartRegistry } from '../src/core/registry';
import {
  DATE_CROWN_DEG_PER_TOOTH,
  engagement,
  HAND_SECONDS_PER_CROWN_DEG,
  intermediateAngle,
  pullOf,
  RATCHET_PER_CROWN,
  rockerOf,
  settingLeverAngle,
  settingWheelSpin,
  stemAngle,
  windingPinionAngle,
  crownWheelAngle,
  yokeAngle,
} from '../src/watch/keyless';
import { WatchMaterials } from '../src/watch/materials';
import { KEYLESS, MAINSPRING, MOTION_WORKS, PLATE_RADIUS, RATCHET, WIND_AXES } from '../src/watch/specs';
import { dialReading, handAngles, trainAngles, wrap360 } from '../src/watch/train';
import { Watch } from '../src/watch/watch';
import { WatchClock } from '../src/watch/watchClock';

const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

describe('crown position 1: winding', () => {
  it('turns the ratchet by 10/16 · 36/64 per crown turn, derived from the tooth counts', () => {
    const ratio = (KEYLESS.windingPinion.teeth / KEYLESS.crownContrate.teeth) * (KEYLESS.crownSpur.teeth / RATCHET.gear.teeth);
    expect(RATCHET_PER_CROWN).toBeCloseTo(ratio, 12);
    expect(ratio).toBeCloseTo(0.3515625, 12);
    // 20–40 crown turns to wind the 8 effective turns from empty
    const turnsFull = MAINSPRING.effectiveTurns / ratio;
    expect(turnsFull).toBeGreaterThan(20);
    expect(turnsFull).toBeLessThan(40);
    const c = new WatchClock({ windTurns: 2 });
    c.setCrownPosition(1);
    c.turnCrown(360); // one turn, winding direction
    expect(c.windTurns).toBeCloseTo(2 + ratio, 12);
    c.turnCrown(720);
    expect(c.windTurns).toBeCloseTo(2 + 3 * ratio, 12);
  });

  it('the other way the sliding pinion slips: the crown turns, nothing is wound', () => {
    const c = new WatchClock({ windTurns: 3 });
    c.setCrownPosition(1);
    c.turnCrown(-720);
    expect(c.windTurns).toBe(3);
    expect(c.crownAngle).toBe(-720); // the stem did turn
    expect(c.handOffset).toBe(0);
    // and it never winds past a full spring
    c.turnCrown(100000);
    expect(c.windTurns).toBe(MAINSPRING.effectiveTurns);
  });

  it('the stem, the winding pinion and the crown wheel agree: a crown turn turns the pinion by the same angle', () => {
    for (const crown of [10, 90, 400]) {
      const ratchetDeg = 360 * (crown / 360) * RATCHET_PER_CROWN; // in the winding sense (+ for this barrel)
      const pinion = windingPinionAngle(crownWheelAngle(ratchetDeg));
      expect(pinion).toBeCloseTo(stemAngle(crown), 9); // both about +X: clockwise from outside is negative
    }
  });
});

describe('crown position 3: hand setting and the hack', () => {
  it('the second hand and the balance stop, time stands still, the hands move at 8⅓ s per degree', () => {
    const c = WatchClock.fromDate(new Date(2026, 9, 17, 10, 8, 37));
    for (let i = 0; i < 20; i++) c.tick(0.1);
    const t0 = c.t;
    expect(c.moving).toBe(true);
    c.setCrownPosition(3);
    expect(c.hacked).toBe(true);
    expect(c.running).toBe(true); // there is power, the lever holds the balance
    for (let i = 0; i < 12; i++) c.tick(0.1); // 1.2 s real time, 50× would be 60 s of movement time
    c.advance(100);
    c.stepBeats(3);
    expect(c.t).toBe(t0);
    expect(c.balanceAmplitude).toBeLessThan(1e-6); // the hack stops the balance within a fraction of a second
    const second = handAngles(c.t, { handOffset: c.handOffset }).second;
    const centre = trainAngles(c.t).centre;
    const windBefore = c.windTurns;
    c.turnCrown(360); // one turn clockwise
    expect(c.handOffset).toBeCloseTo(360 * HAND_SECONDS_PER_CROWN_DEG, 9);
    expect(c.handOffset).toBeCloseTo(3000, 9); // 50 minutes
    const a = trainAngles(c.t, { handOffset: c.handOffset });
    expect(handAngles(c.t, { handOffset: c.handOffset }).second).toBe(second); // seconds hand unmoved
    expect(a.centre).toBe(centre); // the going train does not move
    expect(a.fourth).toBe(trainAngles(c.t).fourth);
    expect(c.windTurns).toBe(windBefore); // the spring is not consumed while the balance is held
    // the minute hand has gone forward 50 minutes, the hour hand 5/6 hour
    const minute = dialReading(handAngles(c.t, { handOffset: c.handOffset }).minute);
    const minute0 = dialReading(handAngles(c.t).minute);
    expect(wrap360(minute - minute0)).toBeCloseTo(300, 6);
    // and backwards: the other way round sets the hands back
    c.turnCrown(-720);
    expect(c.handOffset).toBeCloseTo(-3000, 9);
    // releasing the crown (back to 1) restarts the balance and time runs on from where it stopped
    c.setCrownPosition(1);
    for (let i = 0; i < 10; i++) c.tick(0.1);
    expect(c.t).toBeGreaterThan(t0);
    expect(c.balanceAmplitude).toBeCloseTo(c.amplitude, 6);
  });

  it('the setting gears, the minute wheel and the hand offset agree: the setting train is consistent with the hands', () => {
    const c = new WatchClock({ t: 1234.5 });
    c.setCrownPosition(3);
    const base = trainAngles(c.t);
    const crown = 137;
    c.turnCrown(crown);
    const moved = trainAngles(c.t, { handOffset: c.handOffset });
    // rotY degrees: intermediate → setting wheel (reverses) → minute wheel (reverses)
    const inter = intermediateAngle(crown);
    const settingAbs = -(KEYLESS.settingGear.teeth / KEYLESS.settingWheel.teeth) * inter; // rocker at the hands station: ρ = 0
    expect(settingWheelSpin(crown, 0)).toBeCloseTo(settingAbs, 9);
    const minuteWheel = -(KEYLESS.settingWheel.teeth / MOTION_WORKS.minuteWheel.teeth) * settingAbs;
    expect(wrap180(moved.minuteWheel - base.minuteWheel)).toBeCloseTo(wrap180(minuteWheel), 6);
    // the cannon pinion follows the minute wheel (36/12 the other way round)
    const cannon = -(MOTION_WORKS.minuteWheel.teeth / MOTION_WORKS.cannonPinion.teeth) * minuteWheel;
    expect(wrap180(moved.cannon - base.cannon)).toBeCloseTo(wrap180(cannon), 6);
    // the hour wheel is driven by the minute wheel's pinion: 1/12 of the cannon
    expect(wrap180(moved.hourWheel - base.hourWheel)).toBeCloseTo(wrap180(cannon / 12), 6);
  });
});

describe('crown position 2: quick date', () => {
  it('a crown turn of DATE_CROWN_DEG_PER_TOOTH moves the ring one tooth, the hands and the train stay', () => {
    expect(DATE_CROWN_DEG_PER_TOOTH).toBeCloseTo(192, 9); // 10/16 · 16/32 · 32/16 star turns per crown turn, 3 fingers
    const c = WatchClock.fromDate(new Date(2026, 9, 17, 10, 0, 0));
    const ring0 = c.dateRing;
    const t0 = c.t;
    c.setCrownPosition(2);
    c.turnCrown(DATE_CROWN_DEG_PER_TOOTH);
    expect(c.dateRing - ring0).toBeCloseTo(1, 12);
    expect(c.handOffset).toBe(0);
    expect(c.t).toBe(t0);
    expect(trainAngles(c.t, { handOffset: c.handOffset })).toEqual(trainAngles(t0));
    // a second day, a third
    c.turnCrown(2 * DATE_CROWN_DEG_PER_TOOTH);
    expect(c.dateRing - ring0).toBeCloseTo(3, 12);
    // backwards the star slips over the jumper: the date does not go back
    c.turnCrown(-1000);
    expect(c.dateRing - ring0).toBeCloseTo(3, 12);
    // the balance keeps running in this position (no hack)
    c.tick(0.1);
    expect(c.hacked).toBe(false);
    expect(c.t).toBeGreaterThan(t0);
  });
});

describe('P1 compatibility', () => {
  it('handOffset = 0 (or absent) leaves every angle of the train exactly as before', () => {
    for (const t of [0, 1.234, 3600.5, 43200 + 0.1, 86400 * 3 + 12345.678, 2.4e6]) {
      for (const continuous of [false, true]) {
        const plain = trainAngles(t, { continuous });
        expect(trainAngles(t, { continuous, handOffset: 0 })).toEqual(plain);
        expect(handAngles(t, { continuous, handOffset: 0 })).toEqual(handAngles(t, { continuous }));
      }
    }
    // the minute hand is the cannon pinion, which is the centre wheel's until the hands are set
    expect(handAngles(777.7).minute).toBe(trainAngles(777.7).centre);
  });

  it('a hand offset moves only the cannon pinion, minute wheel, hour wheel and date driver', () => {
    const t = 5000.3;
    const base = trainAngles(t);
    const moved = trainAngles(t, { handOffset: 900 });
    for (const b of ['barrel', 'centre', 'third', 'fourth', 'escape'] as const) expect(moved[b], b).toBe(base[b]);
    for (const b of ['cannon', 'minuteWheel', 'hourWheel', 'dateDriver'] as const) expect(moved[b], b).not.toBe(base[b]);
    // 900 s = a quarter hour: minute hand 90°, hour hand 7.5°
    expect(wrap360(dialReading(moved.cannon) - dialReading(base.cannon))).toBeCloseTo(90, 9);
    expect(wrap360(dialReading(moved.hourWheel) - dialReading(base.hourWheel))).toBeCloseTo(7.5, 9);
  });
});

describe('stem parts', () => {
  it('pulls of the three positions, the sliding pinion engaged with the winding pinion in 1 and with the intermediate in 2 and 3', () => {
    expect([pullOf(1), pullOf(2), pullOf(3)]).toEqual([0, 0.9, 1.6]);
    expect(engagement(pullOf(1))).toEqual({ winding: true, intermediate: false });
    expect(engagement(pullOf(2))).toEqual({ winding: false, intermediate: true });
    expect(engagement(pullOf(3))).toEqual({ winding: false, intermediate: true });
    expect([rockerOf(1), rockerOf(2), rockerOf(3)]).toEqual([2, 1, 0]);
  });

  it('the yoke turns with the pull, the setting lever drops into a notch at each position and rests on a crest between', () => {
    expect(yokeAngle(0)).toBe(0);
    expect(yokeAngle(0.9)).not.toBe(0);
    expect(Math.sign(yokeAngle(0.9))).toBe(Math.sign(yokeAngle(1.6)));
    expect(Math.abs(yokeAngle(1.6))).toBeGreaterThan(Math.abs(yokeAngle(0.9)));
    for (const p of [0, 0.9, 1.6]) expect(settingLeverAngle(p)).toBeCloseTo(4.5, 9);
    expect(settingLeverAngle(0.45)).toBeLessThan(0.1);
    expect(settingLeverAngle(1.25)).toBeLessThan(0.1);
  });

  it('the stem sits outside the plate at 3 o’clock and the crown pulls out with the positions', () => {
    const registry = new PartRegistry();
    const watch = new Watch(registry, new WatchMaterials());
    watch.build();
    const c = new WatchClock();
    // the stem axis (the crown's outer end) lies beyond the plate edge
    expect(KEYLESS.crown.x).toBeGreaterThan(PLATE_RADIUS);
    for (const pos of [1, 2, 3] as const) {
      c.setCrownPosition(pos);
      for (let i = 0; i < 20; i++) c.tick(0.1);
      watch.update(c.t, { ...c.pose, amplitude: c.amplitude });
      expect(watch.spin.get('stem')!.position.x / 10).toBeCloseTo(pullOf(pos), 6);
      expect(watch.spin.get('slidingPinion')!.position.x / 10).toBeCloseTo(pullOf(pos), 6);
      expect(watch.spin.get('rocker')!.rotation.y).toBeCloseTo((rockerOf(pos) * KEYLESS.rockerStepDeg * Math.PI) / 180, 6);
    }
    expect(WIND_AXES.intermediate[0]).toBeGreaterThan(5);
  });
});
