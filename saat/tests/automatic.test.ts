import { describe, expect, it } from 'vitest';
import { PartRegistry } from '../src/core/registry';
import {
  CAGE_RATIO,
  RATCHET_PER_ROTOR_TURN,
  reductionAngle,
  reverser1Angle,
  reverser2Angle,
  reverserPinionAngle,
  rotorWindTurns,
  wristMotion,
} from '../src/watch/automatic';
import { arborUnwrappedDeg, BARREL_SENSE } from '../src/watch/mainspring';
import { WatchMaterials } from '../src/watch/materials';
import { AUTOMATIC, MAINSPRING, MOVEMENT, RATCHET } from '../src/watch/specs';
import { Watch } from '../src/watch/watch';
import { WatchClock } from '../src/watch/watchClock';

const DEG = Math.PI / 180;

describe('automatic winding', () => {
  it('rotor : ratchet = 14/21 · 8/48 · 8/64 = 1/72, in the usual range of 1/50 … 1/200', () => {
    expect(RATCHET_PER_ROTOR_TURN).toBeCloseTo(
      (AUTOMATIC.rotorPinion.teeth / AUTOMATIC.reverserWheel.teeth) *
        (AUTOMATIC.reverserPinion.teeth / AUTOMATIC.reductionWheel.teeth) *
        (AUTOMATIC.reductionPinion.teeth / RATCHET.gear.teeth),
      14,
    );
    expect(1 / RATCHET_PER_ROTOR_TURN).toBeCloseTo(72, 9);
    expect(1 / RATCHET_PER_ROTOR_TURN).toBeGreaterThan(50);
    expect(1 / RATCHET_PER_ROTOR_TURN).toBeLessThan(200);
  });

  it('winds in both directions of the rotor, by the same amount, and not at all past a full spring', () => {
    for (const dir of [1, -1]) {
      const c = new WatchClock({ windTurns: 4 });
      c.driveRotor(dir * 720); // two rotor turns
      expect(c.windTurns - 4, `direction ${dir}`).toBeCloseTo(2 * RATCHET_PER_ROTOR_TURN, 12);
      expect(c.rotorAngle).toBe(dir * 720);
    }
    // back and forth: both strokes wind
    const c = new WatchClock({ windTurns: 1 });
    c.driveRotor(300);
    c.driveRotor(-300);
    c.driveRotor(150);
    expect(c.windTurns - 1).toBeCloseTo((750 / 360) * RATCHET_PER_ROTOR_TURN, 12);
    // full: the bridle slips, the spring does not exceed its 8 turns
    const full = new WatchClock();
    expect(full.windTurns).toBe(MAINSPRING.effectiveTurns);
    full.driveRotor(100000);
    full.driveRotor(-100000);
    expect(full.windTurns).toBe(MAINSPRING.effectiveTurns);
    expect(rotorWindTurns(-360)).toBeCloseTo(RATCHET_PER_ROTOR_TURN, 14);
  });

  it('the reversers turn opposite ways whichever way the rotor goes, the pinions always the same way as each other', () => {
    for (const rotor of [-500, -90, 0, 33, 270, 1000]) {
      expect(reverser1Angle(rotor)).toBeCloseTo(-reverser2Angle(rotor), 12);
      expect(Math.abs(reverser1Angle(rotor))).toBeCloseTo((14 / 21) * Math.abs(rotor), 12);
      if (rotor !== 0) expect(Math.sign(reverser1Angle(rotor))).toBe(-Math.sign(rotor));
    }
    // reduction wheel and its pinion follow the ratchet (mesh reverses); the pinions follow the reduction wheel
    const ratchet = 123;
    expect(reductionAngle(ratchet)).toBeCloseTo(-(64 / 8) * ratchet, 12);
    expect(reverserPinionAngle(ratchet)).toBeCloseTo(-(48 / 8) * reductionAngle(ratchet), 12);
    expect(Math.sign(reverserPinionAngle(ratchet))).toBe(Math.sign(ratchet));
  });

  it('the driving reverser pinion turns exactly like its wheel: the wheels, the pawls and the ratchet agree', () => {
    for (const rotorStroke of [+200, -200]) {
      const c = new WatchClock({ t: 0, windTurns: 3 });
      const rotor0 = c.rotorAngle;
      const arbor0 = arborUnwrappedDeg(c.t, c.windTurns);
      c.driveRotor(rotorStroke);
      const dArbor = arborUnwrappedDeg(c.t, c.windTurns) - arbor0;
      expect(Math.sign(dArbor)).toBe(BARREL_SENSE); // the ratchet always goes the winding way
      // wheel 2 drives for a positive rotor stroke, wheel 1 for a negative one: either way the driving wheel's
      // angle change equals the pinions' angle change
      const dPinion = reverserPinionAngle(arborUnwrappedDeg(c.t, c.windTurns)) - reverserPinionAngle(arbor0);
      const dWheel = rotorStroke > 0 ? reverser2Angle(c.rotorAngle) - reverser2Angle(rotor0) : reverser1Angle(c.rotorAngle) - reverser1Angle(rotor0);
      expect(dPinion, `stroke ${rotorStroke}`).toBeCloseTo(dWheel, 9);
    }
  });

  it('rotor, bearing and reversers are posed from the rotor angle; the rotor lies in its envelope', () => {
    const registry = new PartRegistry();
    const watch = new Watch(registry, new WatchMaterials());
    watch.build();
    const c = new WatchClock();
    c.driveRotor(210);
    watch.update(c.t, { ...c.pose, amplitude: c.amplitude });
    const angle = (n: string) => watch.spin.get(n)!.rotation.y / DEG;
    expect(angle('rotor')).toBeCloseTo(210, 9);
    expect(angle('cage')).toBeCloseTo(210 * CAGE_RATIO, 9);
    expect(angle('reverser1Wheel')).toBeCloseTo(reverser1Angle(210), 9);
    expect(angle('reverser2Wheel')).toBeCloseTo(reverser2Angle(210), 9);
    // the rotor weight is the lowest part: its box stays within MOVEMENT.envelope.rotor
    const [lo, hi] = MOVEMENT.envelope.rotor;
    expect(AUTOMATIC.rotor.weightY[0]).toBeGreaterThanOrEqual(lo);
    expect(AUTOMATIC.rotor.baseY[1]).toBeLessThanOrEqual(hi);
    expect(AUTOMATIC.rotor.outerRadius).toBeLessThanOrEqual(MOVEMENT.diameter / 2 - MOVEMENT.edgeClearance);
  });
});

describe('wrist model', () => {
  it('is off by default; switched on it swings the rotor and winds the spring, switched off the rotor stays', () => {
    const c = new WatchClock({ windTurns: 2 });
    expect(c.wrist.enabled).toBe(false);
    for (let i = 0; i < 50; i++) c.tick(0.1);
    expect(c.rotorAngle).toBe(0);
    const w0 = c.windTurns;
    c.wrist.enabled = true;
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < 300; i++) {
      c.tick(0.1);
      lo = Math.min(lo, c.rotorAngle);
      hi = Math.max(hi, c.rotorAngle);
    }
    expect(lo).toBeLessThan(-100); // swings both ways
    expect(hi).toBeGreaterThan(100);
    expect(c.windTurns).toBeGreaterThan(w0 + 0.02); // 30 s of swinging winds well beyond the 30 s of running
    c.wrist.enabled = false;
    const rotor = c.rotorAngle;
    c.tick(0.1);
    expect(c.rotorAngle).toBe(rotor);
    // continuous
    for (let tw = 0; tw < 20; tw += 0.01) expect(Math.abs(wristMotion(tw + 0.01) - wristMotion(tw))).toBeLessThan(15);
  });
});
