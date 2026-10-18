import { angleY } from './geometry/watchGear';
import { BARREL_SENSE } from './mainspring';
import { AXES, circleIntersection, type P2, RATCHET, towardsClock } from './specs';

/**
 * Ratchet wheel and click. The ratchet turns with the barrel arbor in the
 * winding sense `s` (BARREL_SENSE); its sawtooth ring has one steep locking
 * wall and one long ramp per tooth. The click's tip rests on the ring from
 * outside: forward it rides up a ramp and falls over the wall, backwards it
 * would have to climb the wall, so it holds.
 *
 * With u = s·(A − A_seat)/pitch (A the ratchet angle) the tip's contact radius
 * is r(v) = root + (tip − root)·v for v = frac(u): v = 0 is the click seated
 * against a wall, v → 1 the crest of a ramp just before the drop.
 */

export const SAW_PITCH_DEG = 360 / RATCHET.saw.teeth;
const { rootRadius: R_ROOT, tipRadius: R_TIP } = RATCHET.saw;

/** Click pivot (a post on the barrel bridge) in the plan. */
export const CLICK_PIVOT: P2 = towardsClock(AXES.barrel, RATCHET.click.pivotDistance, RATCHET.click.pivotClockDeg);

const rel = (p: P2): P2 => [p[0] - AXES.barrel[0], p[1] - AXES.barrel[1]];
const armLength = RATCHET.click.armLength;

/** Tip of the click for a contact radius r (distance from the barrel axis), on the trailing side of the pivot. */
export function clickTipAt(r: number): P2 {
  const a = circleIntersection(AXES.barrel, r, CLICK_PIVOT, armLength, 0);
  const b = circleIntersection(AXES.barrel, r, CLICK_PIVOT, armLength, 1);
  const s = BARREL_SENSE;
  // the tip lags the pivot in the winding sense (the arm is in tension while it holds)
  const lag = (p: P2) => {
    const d = (((angleY(rel(p)) - angleY(rel(CLICK_PIVOT))) * s + 540) % 360) - 180;
    return d;
  };
  return lag(a) < lag(b) ? a : b;
}

/** Tip of the click seated in a valley, and its direction (rotY degrees) round the barrel axis. */
export const CLICK_TIP_SEATED: P2 = clickTipAt(R_ROOT);
export const CLICK_TIP_ANGLE = angleY(rel(CLICK_TIP_SEATED));

const armAngle = (tip: P2) => angleY([tip[0] - CLICK_PIVOT[0], tip[1] - CLICK_PIVOT[1]]);
const SEATED_ARM = armAngle(CLICK_TIP_SEATED);

/** Fraction of the way up the ramp, 0 ≤ v < 1, for a ratchet angle A (degrees, rotY); 0 = seated. */
export function sawPhase(ratchetDeg: number): number {
  const u = (BARREL_SENSE * ratchetDeg) / SAW_PITCH_DEG;
  return u - Math.floor(u);
}

/** Radius of the sawtooth ring under the click tip (0 ≤ v < 1). */
export const sawRadius = (v: number): number => R_ROOT + (R_TIP - R_ROOT) * v;

/** Rotation (rotY degrees) of the click about its pivot for a ratchet angle A; 0 when seated. */
export function clickAngle(ratchetDeg: number): number {
  return armAngle(clickTipAt(sawRadius(sawPhase(ratchetDeg)))) - SEATED_ARM;
}

/**
 * Local angle (rotY degrees) of the ratchet at which the first locking wall
 * stands, so that the click is seated when the ratchet angle is 0. Walls repeat
 * every SAW_PITCH_DEG.
 */
export const SAW_WALL_ANGLE = CLICK_TIP_ANGLE;
