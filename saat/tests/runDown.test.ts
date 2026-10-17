import { describe, expect, it } from 'vitest';
import { BANKING_DEG, balanceAngle, beatPhase, leverAngle } from '../src/watch/escapement';
import { balancePose, HACK_SECONDS, RESTART_SECONDS, RUN_DOWN_SECONDS, restAngle, stopBanking } from '../src/watch/runDown';
import { ESCAPEMENT, MAINSPRING } from '../src/watch/specs';
import { trainAngles } from '../src/watch/train';
import { WatchClock } from '../src/watch/watchClock';

/** A clock whose spring has just run out. */
function stopped(t0 = 1000.123): WatchClock {
  const c = new WatchClock({ t: t0, windTurns: 0.002 });
  while (c.moving) c.tick(0.1);
  return c;
}

describe('end of reserve', () => {
  it('time stands still, the balance amplitude dies away to 0 in about two seconds and the lever rests on a banking', () => {
    const c = stopped();
    const t = c.t;
    const A0 = c.amplitude;
    expect(c.windTurns).toBe(0);
    const amps: number[] = [c.balanceAmplitude];
    for (let i = 0; i < 25; i++) {
      c.tick(0.1);
      amps.push(c.balanceAmplitude);
      expect(c.t).toBe(t); // t does not advance
    }
    // the envelope is (1 − age/T)² of the running amplitude, age being the real time since the stop
    expect(RUN_DOWN_SECONDS).toBe(2);
    expect(amps[0]!).toBeLessThanOrEqual(A0);
    let age = c.pose.drive.age;
    expect(age).toBeGreaterThan(RUN_DOWN_SECONDS);
    for (let i = 1; i < amps.length; i++) expect(amps[i]!).toBeLessThanOrEqual(amps[i - 1]! + 1e-12);
    // replay the decay from the start and compare with the closed form
    const d = stopped();
    for (let i = 0; i < 25; i++) {
      d.tick(0.1);
      age = d.pose.drive.age;
      expect(d.balanceAmplitude).toBeCloseTo(A0 * Math.max(0, 1 - age / RUN_DOWN_SECONDS) ** 2, 9);
    }
    expect(amps[25]!).toBe(0);
    // the pose at rest: lever on a banking pin, balance at the pin's resting angle
    const pose = balancePose(c.t, c.amplitude, c.pose.drive);
    expect(Math.abs(pose.lever)).toBeCloseTo(BANKING_DEG, 9);
    expect(pose.balance).toBeCloseTo(restAngle(c.pose.drive.bank), 9);
    expect(Math.abs(pose.balance)).toBeCloseTo(ESCAPEMENT.liftAngleDeg / 2, 9);
    expect(leverAngle(pose.balance)).toBeCloseTo(pose.lever, 9); // consistent with the pin-in-slot relation
    // the going train stays where it stopped
    expect(trainAngles(c.t, { amplitude: c.amplitude })).toEqual(trainAngles(t, { amplitude: A0 }));
  });

  it('the balance swings on with decaying amplitude while the amplitude falls (its angle is bounded by the envelope)', () => {
    const c = stopped(777.7);
    for (let i = 1; i <= 19; i++) {
      c.tick(0.1);
      const drive = c.pose.drive;
      let worst = 0;
      for (let k = 0; k < 40; k++) {
        const p = balancePose(c.t, c.amplitude, { ...drive, age: drive.age + k * 0.02 });
        worst = Math.max(worst, Math.abs(p.balance - (1 - drive.env) * restAngle(drive.bank)));
        expect(Math.abs(p.lever)).toBeLessThanOrEqual(BANKING_DEG + 1e-9);
      }
      expect(worst).toBeLessThanOrEqual(c.amplitude * drive.env + 1e-9);
    }
  });

  it('winding restarts the watch: time runs, the balance regains full amplitude within a fraction of a second', () => {
    const c = stopped();
    for (let i = 0; i < 25; i++) c.tick(0.1);
    expect(c.balanceAmplitude).toBe(0);
    const t = c.t;
    c.wind(1);
    expect(c.moving).toBe(true);
    c.tick(0.1);
    expect(c.t).toBeGreaterThan(t);
    const early = c.balanceAmplitude;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(c.amplitude);
    for (let i = 0; i < Math.ceil(RESTART_SECONDS / 0.1); i++) c.tick(0.1);
    expect(c.balanceAmplitude).toBeCloseTo(c.amplitude, 9);
    // a running balance is plain beatPhase again
    expect(balancePose(c.t, c.amplitude, c.pose.drive)).toEqual({
      balance: beatPhase(c.t, c.amplitude).balance,
      lever: beatPhase(c.t, c.amplitude).lever,
      amplitude: c.amplitude,
    });
  });

  it('without a drive, or at full envelope, balancePose is exactly beatPhase; and it is continuous when the envelope leaves 1', () => {
    for (const t of [0, 0.31, 12.77, 5000.25]) {
      const p = beatPhase(t, 250);
      expect(balancePose(t, 250)).toEqual({ balance: p.balance, lever: p.lever, amplitude: 250 });
      expect(balancePose(t, 250, { env: 1, age: 0, bank: 1 })).toEqual({ balance: p.balance, lever: p.lever, amplitude: 250 });
      const near = balancePose(t, 250, { env: 1 - 1e-9, age: 0, bank: stopBanking(t, 250) });
      expect(near.balance).toBeCloseTo(balanceAngle(t, 250), 5);
    }
  });

  it('the hack uses the same machinery, faster; the amplitude of a running watch is untouched by it', () => {
    expect(HACK_SECONDS).toBeLessThan(RUN_DOWN_SECONDS);
    expect(RESTART_SECONDS).toBeLessThan(RUN_DOWN_SECONDS);
    const c = new WatchClock({ windTurns: MAINSPRING.effectiveTurns });
    for (let i = 0; i < 10; i++) c.tick(0.1);
    expect(c.balanceAmplitude).toBeCloseTo(c.amplitude, 12);
    c.setCrownPosition(3);
    c.tick(0.1);
    expect(c.balanceAmplitude).toBeLessThan(c.amplitude * 0.5);
    c.tick(0.1);
    c.tick(0.1);
    expect(c.balanceAmplitude).toBeLessThan(1e-12);
  });
});
