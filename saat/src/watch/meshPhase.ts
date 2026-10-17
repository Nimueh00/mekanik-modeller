import { angleY } from './geometry/watchGear';
import { AXES, GEARS, MESHES, type P2 } from './specs';

/** A gear for the phase solver: where its axis is and how many teeth it has. */
export interface PhaseGear {
  name: string;
  at: P2;
  teeth: number;
}

/**
 * Tooth phase of every gear: the fixed angle (degrees about +Y) of its
 * teeth on the arbor, added to the body angle.
 *
 * Tooth 0 of each outline sits on local angle 0, and at the reference pose
 * every body angle is 0. For a gear at angle φ, the line of centres towards its
 * mate (at angle γ) lies n = (γ − φ)·Z/360 pitches past tooth 0. Turning one
 * gear by δ turns its mate by −δ·Z₁/Z₂, which changes n₁ by −δZ₁/360 and n₂ by
 * +δZ₁/360: n₁ + n₂ is invariant. A tooth of one gear centred in a gap of the
 * other on the line of centres means n₁ + n₂ ≡ ½ (mod 1), and then it stays so
 * for all poses. Every mesh is solved for that from the layout alone (a wheel
 * and its pinion are separate parts of an arbor, so each gear gets its own phase).
 *
 * `meshes` lists pairs (driver, driven); every gear must turn as
 * ω_driven = −ω_driver·Z_driver/Z_driven and be at angle 0 in the reference pose.
 */
export function solveMeshPhases(
  gears: readonly PhaseGear[],
  meshes: readonly (readonly [string, string])[],
): Record<string, number> {
  const byName = new Map(gears.map((g) => [g.name, g]));
  const get = (n: string) => {
    const g = byName.get(n);
    if (!g) throw new RangeError(`no gear ${n}`);
    return g;
  };
  const phase = new Map<string, number>();
  const lineAngle = (from: PhaseGear, to: PhaseGear) => angleY([to.at[0] - from.at[0], to.at[1] - from.at[1]]);
  const solve = (known: PhaseGear, other: PhaseGear) => {
    const n = ((lineAngle(known, other) - phase.get(known.name)!) * known.teeth) / 360;
    phase.set(other.name, lineAngle(other, known) - (360 / other.teeth) * (0.5 - n));
  };
  while (phase.size < gears.length) {
    let progressed = false;
    for (const [an, bn] of meshes) {
      const a = get(an);
      const b = get(bn);
      if (phase.has(an) && !phase.has(bn)) solve(a, b);
      else if (phase.has(bn) && !phase.has(an)) solve(b, a);
      else continue;
      progressed = true;
    }
    if (!progressed) {
      // start of a gear chain (barrel wheel, cannon pinion): any phase will do
      const free = gears.find((g) => !phase.has(g.name))!;
      phase.set(free.name, 0);
    }
  }
  const out: Record<string, number> = {};
  for (const g of gears) out[g.name] = ((phase.get(g.name)! % 360) + 360) % 360;
  return out;
}

/** Tooth phase of every gear of the going train and motion works. */
export const GEAR_PHASE: Readonly<Record<string, number>> = solveMeshPhases(
  GEARS.map((g) => ({ name: g.name, at: AXES[g.axis], teeth: g.gear.teeth })),
  MESHES,
);
