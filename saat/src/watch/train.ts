import { beatPhase, FULL_AMPLITUDE } from './escapement';
import { BEATS_PER_ESCAPE_TURN, BEATS_PER_SECOND, type Body, COUPLED, gearByName, MESHES } from './specs';

/**
 * Sign convention: every angle is a right-handed rotation about +Y, the axis
 * that points out through the dial, i.e. what `Object3D.rotation.y` expects.
 * Seen from the dial, clockwise is therefore negative. A mesh reverses the
 * sense; a coaxial coupling keeps it.
 */

const BODIES: readonly Body[] = [
  'barrel',
  'centre',
  'third',
  'fourth',
  'escape',
  'cannon',
  'minuteWheel',
  'hourWheel',
  'dateDriver',
];

/**
 * Signed turns of each body per turn of the centre wheel, propagated through
 * the mesh graph from tooth counts alone. The centre wheel itself is +1 here;
 * the real sense is applied afterwards.
 */
function relativeToCentre(): Record<Body, number> {
  const rel = new Map<Body, number>([['centre', 1]]);
  const edges: { a: Body; b: Body; k: number }[] = []; // ω_b = k·ω_a
  for (const [an, bn] of MESHES) {
    const a = gearByName(an);
    const b = gearByName(bn);
    edges.push({ a: a.body, b: b.body, k: -a.gear.teeth / b.gear.teeth });
  }
  for (const [a, b] of COUPLED) edges.push({ a, b, k: 1 });
  for (let changed = true; changed; ) {
    changed = false;
    for (const { a, b, k } of edges) {
      const wa = rel.get(a);
      const wb = rel.get(b);
      if (wa !== undefined && wb === undefined) {
        rel.set(b, wa * k);
        changed = true;
      } else if (wb !== undefined && wa === undefined) {
        rel.set(a, wb / k);
        changed = true;
      }
    }
  }
  const out = {} as Record<Body, number>;
  for (const body of BODIES) {
    const w = rel.get(body);
    if (w === undefined) throw new Error(`${body} is not connected to the train`);
    out[body] = w;
  }
  return out;
}

const REL = relativeToCentre();

/** The minute hand (centre wheel) turns clockwise seen from the dial: −1 turn per hour. */
const CENTRE_SENSE = -1;

/** Signed revolutions per hour of every body (negative = clockwise from the dial). */
export const REV_PER_HOUR: Readonly<Record<Body, number>> = Object.fromEntries(
  BODIES.map((b) => [b, CENTRE_SENSE * REL[b]]),
) as Record<Body, number>;

/** Beats per hour that the train demands: escape turns per hour × 30. */
export const BEATS_PER_HOUR = Math.abs(REV_PER_HOUR.escape) * BEATS_PER_ESCAPE_TURN;

/** Snap a ratio that is an integer up to float noise (e.g. 21600 / (1/12)). */
const snap = (x: number) => (Math.abs(x - Math.round(x)) < 1e-9 * x ? Math.round(x) : x);

/** Beats per full revolution of every body (unsigned). */
export const BEATS_PER_REV: Readonly<Record<Body, number>> = Object.fromEntries(
  BODIES.map((b) => [b, snap(BEATS_PER_HOUR / Math.abs(REV_PER_HOUR[b]))]),
) as Record<Body, number>;

const SENSE: Readonly<Record<Body, number>> = Object.fromEntries(
  BODIES.map((b) => [b, Math.sign(REV_PER_HOUR[b])]),
) as Record<Body, number>;

/** Wrap any angle into [0, 360). */
export function wrap360(deg: number): number {
  const w = deg % 360;
  return w < 0 ? w + 360 : w;
}

export interface TrainOptions {
  /** Averaged (beat-free) motion for fast-forward. Default false. */
  continuous?: boolean;
  /** Balance amplitude, degrees; shapes the impulse only. Default: fully wound. */
  amplitude?: number;
}

/**
 * Escape wheel position in beats, split into an integer and a small fraction
 * so that 31 days (1.6·10⁷ beats) keep full precision.
 * Beat mode: beat k is centred on the balance zero crossing at t = k/6 s, so
 * both modes agree exactly at every beat centre and differ by at most ½ beat.
 */
export function escapeBeats(t: number, opts: TrainOptions = {}): { whole: number; frac: number } {
  if (opts.continuous) {
    const x = t * BEATS_PER_SECOND;
    const whole = Math.floor(x);
    return { whole, frac: x - whole };
  }
  const p = beatPhase(t, opts.amplitude ?? FULL_AMPLITUDE);
  return { whole: p.beat, frac: p.offset };
}

/** Angle of one body at clock time t (s), degrees in [0, 360). */
export function bodyAngle(body: Body, t: number, opts: TrainOptions = {}): number {
  return angleFromBeats(body, escapeBeats(t, opts));
}

function angleFromBeats(body: Body, e: { whole: number; frac: number }): number {
  const period = BEATS_PER_REV[body];
  // % on doubles is exact, so reducing the integer part first loses nothing.
  return wrap360((SENSE[body] * 360 * ((e.whole % period) + e.frac)) / period);
}

/** Angles of every body at clock time t, from a single escape position. */
export function trainAngles(t: number, opts: TrainOptions = {}): Record<Body, number> {
  const e = escapeBeats(t, opts);
  return Object.fromEntries(BODIES.map((b) => [b, angleFromBeats(b, e)])) as Record<Body, number>;
}

/** Clockwise angle from 12 o'clock as read on the dial, [0, 360). */
export function dialReading(angleDeg: number): number {
  return wrap360(-angleDeg);
}

/** Hands: hour (hour wheel), minute (centre / cannon), seconds (fourth). Rotation-about-+Y degrees. */
export function handAngles(t: number, opts: TrainOptions = {}): { hour: number; minute: number; second: number } {
  const a = trainAngles(t, opts);
  return { hour: a.hourWheel, minute: a.centre, second: a.fourth };
}
