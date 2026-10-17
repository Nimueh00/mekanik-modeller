import { angleY } from './geometry/watchGear';
import { AXES, GEARS, gearByName, MESHES, type TrainGear } from './specs';

/**
 * Tooth phase of every train gear: the fixed angle (degrees about +Y) of its
 * teeth on the arbor, added to the body angle from `trainAngles`.
 *
 * Tooth 0 of each outline sits on local angle 0, and at t = 0 every body
 * angle is 0. For a gear at angle φ, the line of centres towards its mate (at
 * angle γ) lies n = (γ − φ)·Z/360 pitches past tooth 0. Turning one gear by δ
 * turns its mate by −δ·Z₁/Z₂, which changes n₁ by −δZ₁/360 and n₂ by +δZ₁/360:
 * n₁ + n₂ is invariant. A tooth of one gear centred in a gap of the other on
 * the line of centres means n₁ + n₂ ≡ ½ (mod 1), and then it stays so for all
 * t. Every mesh is solved for that from the layout alone (a wheel and its
 * pinion are separate parts of an arbor, so each gear gets its own phase).
 */
function solvePhases(): Record<string, number> {
  const phase = new Map<string, number>();
  const lineAngle = (from: TrainGear, to: TrainGear) => {
    const a = AXES[from.axis];
    const b = AXES[to.axis];
    return angleY([b[0] - a[0], b[1] - a[1]]);
  };
  const solve = (known: TrainGear, other: TrainGear) => {
    const n = ((lineAngle(known, other) - phase.get(known.name)!) * known.gear.teeth) / 360;
    phase.set(other.name, lineAngle(other, known) - (360 / other.gear.teeth) * (0.5 - n));
  };
  while (phase.size < GEARS.length) {
    let progressed = false;
    for (const [an, bn] of MESHES) {
      const a = gearByName(an);
      const b = gearByName(bn);
      if (phase.has(an) && !phase.has(bn)) solve(a, b);
      else if (phase.has(bn) && !phase.has(an)) solve(b, a);
      else continue;
      progressed = true;
    }
    if (!progressed) {
      // start of a gear chain (barrel wheel, cannon pinion): any phase will do
      const free = GEARS.find((g) => !phase.has(g.name))!;
      phase.set(free.name, 0);
    }
  }
  const out: Record<string, number> = {};
  for (const g of GEARS) out[g.name] = ((phase.get(g.name)! % 360) + 360) % 360;
  return out;
}

export const GEAR_PHASE: Readonly<Record<string, number>> = solvePhases();
