import { BEATS_PER_SECOND, MAINSPRING, SPRING } from './specs';
import { BEATS_PER_REV, REV_PER_HOUR } from './train';

/**
 * Mainspring kinematics (pure maths; the ribbon mesh is in parts/barrel.ts).
 *
 * Seen in the barrel's own frame the spring is fixed to the drum wall at one
 * end (the hook, at angle 0) and to the arbor at the other. Winding turns the
 * arbor `W` turns forward relative to the drum, which wraps `W` more turns of
 * blade between the two hooks. The blade has a fixed length, so the coils move
 * from the wall to the arbor: an inner stack grows on the arbor, the outer
 * stack against the wall shrinks, and a free span joins them.
 *
 * Bookkeeping, with n_i / n_o the coils of the two stacks and δ the (fixed)
 * sweep of the free span in turns:
 *   n_i + n_o = N0 + W − δ        (turns of blade between the hooks)
 *   L_inner(n_i) + L_span + L_outer(n_o) = L        (blade length)
 * δ = 0.4 turns and N0 = 12 make the free span close the loop for every W:
 * the outer stack always ends at the hook angle and the inner stack ends where
 * the arbor drags it.
 */

/** Sense of the barrel, and so of winding: +1 = rotY positive (counter-clockwise from the dial). */
export const BARREL_SENSE: 1 | -1 = REV_PER_HOUR.barrel > 0 ? 1 : -1;

const T = SPRING.thickness;
const RA = SPRING.coreRadius;
const RW = SPRING.wallRadius;
const SPAN_TURNS = 0.4;
const N0 = 12;
const TWO_PI = 2 * Math.PI;

const innerLength = (n: number) => TWO_PI * n * (RA + (T * n) / 2);
const outerLength = (n: number) => TWO_PI * n * (RW - (T * n) / 2);

/** Free span between the stacks, approximated by its straight-ish arc length. */
function spanLength(ni: number, no: number): number {
  const r1 = RA + T * ni;
  const r2 = RW - T * no;
  const rm = (r1 + r2) / 2;
  return Math.hypot(r2 - r1, rm * SPAN_TURNS * TWO_PI);
}

const LENGTH = (() => {
  const ni = SPRING.innerCoilsUnwound;
  const no = SPRING.outerCoilsUnwound;
  return innerLength(ni) + spanLength(ni, no) + outerLength(no);
})();

/** Inner coils for a given W by bisection on the blade length (monotone in n_i). */
function solveInner(w: number): number {
  const total = N0 - SPAN_TURNS + w;
  const f = (ni: number) => innerLength(ni) + spanLength(ni, total - ni) + outerLength(total - ni) - LENGTH;
  // more coils on the arbor (short) and fewer on the wall (long) shortens the blade
  let lo = 0;
  let hi = total;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const TABLE_STEP = 0.125;
const TABLE = Array.from({ length: Math.round(MAINSPRING.effectiveTurns / TABLE_STEP) + 1 }, (_, i) =>
  solveInner(i * TABLE_STEP),
);

/** Coils on the arbor and on the wall for W effective turns (clamped to the spring's range). */
export function springCoils(windTurns: number): { inner: number; outer: number } {
  const w = Math.min(Math.max(windTurns, 0), MAINSPRING.effectiveTurns);
  const x = w / TABLE_STEP;
  const k = Math.min(TABLE.length - 2, Math.floor(x));
  const inner = TABLE[k]! + (TABLE[k + 1]! - TABLE[k]!) * (x - k);
  return { inner, outer: N0 - SPAN_TURNS + w - inner };
}

export const SPRING_SAMPLES = { inner: 720, span: 24, outer: 480 } as const;
export const SPRING_POINTS = SPRING_SAMPLES.inner + SPRING_SAMPLES.span + SPRING_SAMPLES.outer;

const smooth = (u: number) => u * u * (3 - 2 * u);

/**
 * Centre line of the blade in the drum's frame (mm; x = r cos a, z = −r sin a
 * for rotY angle a), from the arbor hook outwards to the wall hook, into `out`
 * as (x, z) pairs. The arbor hook sits at angle `s·W·360°` (the arbor has
 * been wound W turns relative to the drum), the wall hook at angle 0.
 */
export function springPolyline(windTurns: number, out: Float64Array): void {
  const w = Math.min(Math.max(windTurns, 0), MAINSPRING.effectiveTurns);
  const { inner, outer } = springCoils(w);
  const s = BARREL_SENSE;
  const aArbor = s * w * TWO_PI;
  const put = (k: number, r: number, a: number) => {
    out[2 * k] = r * Math.cos(a);
    out[2 * k + 1] = -r * Math.sin(a);
  };
  let k = 0;
  const ni = SPRING_SAMPLES.inner;
  for (let i = 0; i < ni; i++) {
    const th = (TWO_PI * inner * i) / (ni - 1);
    put(k++, RA + (T * th) / TWO_PI, aArbor - s * th);
  }
  const aEnd = aArbor - s * TWO_PI * inner;
  const r1 = RA + T * inner;
  const r2 = RW - T * outer;
  const nsp = SPRING_SAMPLES.span;
  for (let i = 1; i <= nsp; i++) {
    const u = i / (nsp + 1);
    put(k++, r1 + (r2 - r1) * smooth(u), aEnd - s * SPAN_TURNS * TWO_PI * u);
  }
  const no = SPRING_SAMPLES.outer;
  for (let i = 0; i < no; i++) {
    const ph = TWO_PI * outer * (1 - i / (no - 1));
    put(k++, RW - (T * ph) / TWO_PI, s * ph);
  }
}

/**
 * The drum's angle at clock time t in averaged (beat-free) form, degrees,
 * *not* wrapped: it grows without bound (tens of turns in a month), which keeps
 * everything geared to the arbor continuous.
 */
export const drumUnwrappedDeg = (t: number): number =>
  BARREL_SENSE * 360 * ((t * BEATS_PER_SECOND) / BEATS_PER_REV.barrel);

/**
 * Arbor (and ratchet) angle, degrees, not wrapped: the drum's angle plus the
 * turns wound into the spring. While the watch runs the drum advances exactly
 * as fast as the wound turns fall, so this stays constant; winding moves it
 * forward. The averaged drum angle is used because the arbor is held by the
 * click and does not share the barrel's tiny ticks.
 */
export const arborUnwrappedDeg = (t: number, windTurns: number): number =>
  drumUnwrappedDeg(t) + BARREL_SENSE * windTurns * 360;
