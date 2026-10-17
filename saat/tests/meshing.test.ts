import { describe, expect, it } from 'vitest';
import { gearOutline } from '../src/watch/geometry/watchGear';
import { GEAR_PHASE } from '../src/watch/meshPhase';
import { AXES, gearByName, MESHES, pitchRadius, tipRadius, type TrainGear } from '../src/watch/specs';
import { trainAngles } from '../src/watch/train';
import { densify, depthInto, type P2, Region, transform } from './geom2d';

/** Allowed interpenetration of two meshing profiles, mm. */
const TOL = 0.005;

/** Only the teeth near the line of centres can touch: keep the outline points within reach of the mate. */
function nearMate(pts: P2[], self: TrainGear, mate: TrainGear): P2[] {
  const d = pitchRadius(self.gear) + pitchRadius(mate.gear);
  const reach = tipRadius(mate.gear) + 0.05;
  const dir = [AXES[mate.axis][0] - AXES[self.axis][0], AXES[mate.axis][1] - AXES[self.axis][1]] as const;
  const l = Math.hypot(dir[0], dir[1]);
  const c: P2 = [(dir[0] / l) * d, (dir[1] / l) * d];
  return pts.filter((p) => Math.hypot(p[0] - AXES[self.axis][0] - c[0], p[1] - AXES[self.axis][1] - c[1]) < reach);
}

/** Worst interpenetration of a meshing pair at time t (beating mode), with optional extra phase on the driven gear. */
function meshPenetration(an: string, bn: string, t: number, extra = 0): number {
  const a = gearByName(an);
  const b = gearByName(bn);
  const ang = trainAngles(t);
  const pa = transform(densify(gearOutline(a), 0.002), ang[a.body] + GEAR_PHASE[an]!, AXES[a.axis]);
  const pb = transform(densify(gearOutline(b), 0.002), ang[b.body] + GEAR_PHASE[bn]! + extra, AXES[b.axis]);
  return Math.max(
    depthInto(nearMate(pa, a, b), new Region(pb), 0.2),
    depthInto(nearMate(pb, b, a), new Region(pa), 0.2),
  );
}

/** 60 times spread over two days, with fractions that land anywhere within a beat. */
const TIMES = Array.from({ length: 60 }, (_, i) => ((i * 7919.371 + i * i * 13.17) % 172800) + (i % 7) / 41);

describe('meshing in 2-D (tooth phase)', () => {
  for (const [an, bn] of MESHES) {
    it(`${an} × ${bn}: never interpenetrate by more than ${TOL * 1000} µm over ${TIMES.length} beating-mode samples`, () => {
      let worst = 0;
      for (const t of TIMES) worst = Math.max(worst, meshPenetration(an, bn, t));
      expect(worst).toBeLessThanOrEqual(TOL);
    });
  }

  it('the check is not vacuous: half a pitch of phase error makes every pair collide', () => {
    for (const [an, bn] of MESHES) {
      const half = 180 / gearByName(bn).gear.teeth;
      expect(meshPenetration(an, bn, 0, half), `${an} × ${bn}`).toBeGreaterThan(4 * TOL);
    }
  });
});
