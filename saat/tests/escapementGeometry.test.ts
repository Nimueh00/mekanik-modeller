import { describe, expect, it } from 'vitest';
import { BANKING_DEG, beatPhase, FULL_AMPLITUDE } from '../src/watch/escapement';
import {
  ESCAPE_GEOMETRY,
  ESCAPE_TOOTH,
  ESCAPE_WHEEL_OUTLINE,
  ESCAPE_WHEEL_PHASE,
  type PalletName,
  stonesAt,
} from '../src/watch/geometry/escapeGeometry';
import { rotY } from '../src/watch/geometry/watchGear';
import { FORK, leverOutlines, PIN_DIRECTION, safetyRollerOutline } from '../src/watch/parts/escapement';
import { AXES, ESCAPEMENT, TRAIN } from '../src/watch/specs';
import { REV_PER_HOUR, trainAngles } from '../src/watch/train';
import { densify, depthInto, distToSegment, gap, type P2, Region, transform } from './geom2d';

/** Allowed interpenetration, and the contact distance of a lock, mm. */
const TOL = 0.005;
const CONTACT = 0.02;
const R = ESCAPE_GEOMETRY.tipRadius;
const O = ESCAPE_GEOMETRY.O;
const TEETH = TRAIN.escape.wheel.teeth;

/** Escape wheel outline at clock time t, relative to its arbor. */
const wheelAt = (t: number) => transform(ESCAPE_WHEEL_OUTLINE, trainAngles(t).escape + ESCAPE_WHEEL_PHASE, [0, 0]);
/** Locking faces of all teeth (root → locking corner). */
const lockingFaces = (wheel: P2[]) =>
  Array.from(
    { length: TEETH },
    (_, j) => [wheel[j * ESCAPE_TOOTH.points]!, wheel[j * ESCAPE_TOOTH.points + ESCAPE_TOOTH.corner]!] as const,
  );

/** Four beats (two of each direction), 400 samples each, covering lock, impulse, drop and run. */
const SAMPLES: number[] = [];
for (let k = 0; k < 4; k++) for (let i = 0; i < 400; i++) SAMPLES.push((k - 0.5 + (i + 0.5) / 400) / 6);

describe('escapement in the plane of the escape wheel', () => {
  it('assumption of the geometry: the escape wheel turns positively about +Y', () => {
    expect(REV_PER_HOUR.escape).toBeGreaterThan(0);
  });

  it(`stones and teeth never interpenetrate by more than ${TOL * 1000} µm (${SAMPLES.length} samples)`, () => {
    let worst = 0;
    for (const t of SAMPLES) {
      const wheel = densify(wheelAt(t), 0.002);
      const wheelRegion = new Region(wheel, 512);
      const st = stonesAt(beatPhase(t).lever);
      for (const s of [st.entry, st.exit]) {
        const d = densify(s, 0.002);
        // only wheel points inside the stone's bounding box can be inside the stone
        const xs = d.map((p) => p[0]);
        const zs = d.map((p) => p[1]);
        const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
        const near = wheel.filter((p) => p[0] >= x0 && p[0] <= x1 && p[1] >= z0 && p[1] <= z1);
        worst = Math.max(worst, depthInto(d, wheelRegion, 0.2), depthInto(near, new Region(d), 0.2));
      }
    }
    expect(worst).toBeLessThanOrEqual(TOL);
  }, 60000);

  it(`in every lock exactly one stone touches a tooth's locking face (≤ ${CONTACT * 1000} µm), with its own locking face`, () => {
    let locks = 0;
    const plus = ESCAPE_GEOMETRY.plusBanking;
    const minus: PalletName = plus === 'entry' ? 'exit' : 'entry';
    for (const t of SAMPLES) {
      const p = beatPhase(t);
      if (Math.abs(p.offset) !== 0.5) continue;
      locks++;
      const wheel = wheelAt(t);
      const faces = lockingFaces(wheel);
      const st = stonesAt(p.lever);
      const near = (s: P2[]) => Math.min(...faces.map(([a, b]) => gap(s, [a, b], true, false)));
      const touching = (['entry', 'exit'] as const).filter((n) => near(st[n]) <= CONTACT);
      expect(touching.length, `t = ${t}`).toBe(1);
      // −½: still on the stone that started the beat; +½: on the other one
      const even = p.beat % 2 === 0;
      const expected = p.offset < 0 === even ? plus : minus;
      expect(touching[0]).toBe(expected);
      // the tooth's locking corner rests on that stone's locking face (last point → C1)
      const s = st[expected];
      const corner = Math.min(...faces.map(([, k]) => distToSegment(k, s[s.length - 1]!, s[0]!)));
      expect(corner).toBeLessThanOrEqual(CONTACT);
    }
    expect(locks).toBeGreaterThan(SAMPLES.length / 2);
  });

  it('during the impulse the tooth and the driving stone stay in sliding contact', () => {
    let impulses = 0;
    const plus = ESCAPE_GEOMETRY.plusBanking;
    for (const t of SAMPLES) {
      const p = beatPhase(t);
      if (Math.abs(p.offset) > 0.5 - 1e-9) continue;
      impulses++;
      const start: PalletName = p.beat % 2 === 0 ? plus : plus === 'entry' ? 'exit' : 'entry';
      expect(gap(stonesAt(p.lever)[start], wheelAt(t))).toBeLessThan(0.01);
    }
    expect(impulses).toBeGreaterThan(20);
  });

  it('the pallet fork (frame, arms, fork) stays clear of the tip circle at every lever angle', () => {
    const o = leverOutlines();
    for (let i = 0; i <= 40; i++) {
      const lever = -BANKING_DEG + (2 * BANKING_DEG * i) / 40;
      for (const f of [...o.frame, o.fork]) {
        for (const q of densify(f, 0.01)) {
          const p = rotY(q, lever);
          expect(Math.hypot(O[0] + p[0], O[1] + p[1])).toBeGreaterThan(R + 0.03);
        }
      }
    }
  });

  it('the guard pin never runs into the safety roller (it passes through the crescent during the lift)', () => {
    const roller = safetyRollerOutline();
    const B: P2 = [AXES.balance[0] - AXES.pallet[0], AXES.balance[1] - AXES.pallet[1]];
    const u: P2 = [B[0] / Math.hypot(...B), B[1] / Math.hypot(...B)];
    let closest = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const t = (i / 2000) * (2 / 6); // two beats, both directions
      const p = beatPhase(t, FULL_AMPLITUDE);
      const tip = rotY([u[0] * FORK.guardTip, u[1] * FORK.guardTip], p.lever);
      const rel: P2 = [tip[0] - B[0], tip[1] - B[1]];
      const r = new Region(transform(roller, PIN_DIRECTION + p.balance, [0, 0]));
      expect(r.contains(rel), `t = ${t}`).toBe(false);
      closest = Math.min(closest, r.distance(rel, 1));
    }
    expect(closest).toBeGreaterThan(0.005);
    // and it is a safety: on the banking it sits close to the roller's edge
    const tipOnBanking = rotY([u[0] * FORK.guardTip, u[1] * FORK.guardTip], BANKING_DEG);
    const d = Math.hypot(tipOnBanking[0] - B[0], tipOnBanking[1] - B[1]) - FORK.safetyRadius;
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.08);
  });

  it('the impulse pin sits in the fork slot whenever it drives the lever', () => {
    // inside the lift window the slot passes through the pin's centre (escapement.ts): check the slot's depth and width
    expect(ESCAPEMENT.palletToBalance - ESCAPEMENT.impulsePinRadius - FORK.pinRadius).toBeGreaterThan(FORK.slotBottom);
    expect(FORK.slotHalf).toBeGreaterThan(FORK.pinRadius);
  });
});
