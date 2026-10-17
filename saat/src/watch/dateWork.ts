import { angleY } from './geometry/watchGear';
import { AXES, CENTRE, DATE, DATE_RING, type P2, towardsClock } from './specs';
import { REV_PER_HOUR } from './train';

/**
 * Date mechanism. The ring has 31 internal teeth and the numerals 1…31 on its
 * top; it turns in the rotY-positive sense, one tooth per day (RING_PITCH_DEG),
 * pushed by the finger of the date driver between 22:00 and 24:00 and held in
 * its gaps by the jumper otherwise. The ring position `p` counts teeth since
 * day 1: p = 0 shows 1, p = 30 shows 31, p = 31 shows 1 again.
 */

export const RING_TEETH = DATE.ringTeeth;
export const RING_PITCH_DEG = 360 / RING_TEETH;
export const DAY_SECONDS = 86400;

const smootherstep = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** Fraction of the day's step already done at a time of day (s): 0 until 22:00, 1 from 24:00. */
export function stepFraction(secondOfDay: number): number {
  return smootherstep((secondOfDay - DATE_RING.stepStart) / (DATE_RING.stepEnd - DATE_RING.stepStart));
}

/**
 * Ring position in teeth for the driver time `tau` seconds since 00:00 of day
 * 1 (the watch's t plus the hand offset): whole days gone by, plus the step in
 * progress. Non-decreasing in tau.
 */
export function ringFloatAt(tau: number): number {
  const day = Math.floor(tau / DAY_SECONDS);
  return day + stepFraction(tau - day * DAY_SECONDS);
}

/** Day of the month (1…31) in the window for a ring position (nearest numeral). */
export function visibleDay(ringPos: number): number {
  const k = Math.round(ringPos) % RING_TEETH;
  return (k < 0 ? k + RING_TEETH : k) + 1;
}

/** Rotation (rotY degrees) of the ring for a ring position. */
export const ringAngle = (ringPos: number): number => ringPos * RING_PITCH_DEG;

/** Ring-local angle (rotY degrees) of the numeral for a day: the ring turns +pitch per day, so numerals run backwards. */
export const numeralAngle = (day: number): number => -(day - 1) * RING_PITCH_DEG;

/** Where the window is, as a rotY angle round the movement centre (the +X axis). */
export const WINDOW_ANGLE = 0;

export interface NumeralPlace {
  day: number;
  /** Ring-local angle, rotY degrees. */
  angle: number;
  radius: number;
}

/**
 * Where each numeral goes on the ring. Geometry only: the CanvasTexture in the
 * part builder paints it, so this can be tested without a canvas. Each numeral
 * stands so that, in the window, it reads upright with the dial's 12 up.
 */
export function numeralLayout(): NumeralPlace[] {
  return Array.from({ length: RING_TEETH }, (_, i) => ({
    day: i + 1,
    angle: numeralAngle(i + 1),
    radius: DATE_RING.numeralRadius,
  }));
}

/** The day whose numeral is nearest to the window when the ring is turned by `angleDeg`. */
export function dayAtWindow(angleDeg: number): number {
  let best = 1;
  let bestDelta = Infinity;
  for (const n of numeralLayout()) {
    const d = Math.abs((((n.angle + angleDeg - WINDOW_ANGLE) % 360) + 540) % 360 - 180);
    if (d < bestDelta) {
      bestDelta = d;
      best = n.day;
    }
  }
  return best;
}

// ------------------------------------------------------------ teeth and jumper

/** Ring-local angle of the centre of the gap that sits under the jumper tip at ring position 0. */
export const JUMPER_TIP_MID_RADIUS = (DATE_RING.tipRadius + DATE_RING.rootRadius) / 2;
export const JUMPER_TIP: P2 = towardsClock(CENTRE, JUMPER_TIP_MID_RADIUS, DATE_RING.jumper.tipClockDeg);
export const JUMPER_TIP_ANGLE = angleY(JUMPER_TIP);
/** The gaps of the ring lie at GAP_ANGLE + k·pitch (ring-local, rotY degrees). */
export const GAP_ANGLE = JUMPER_TIP_ANGLE;

/** Jumper stud: `armLength` from the tip, swung `pivotSwingDeg` off the inward radial. */
export const JUMPER_PIVOT: P2 = (() => {
  const inward: P2 = [-JUMPER_TIP[0] / Math.hypot(...JUMPER_TIP), -JUMPER_TIP[1] / Math.hypot(...JUMPER_TIP)];
  const a = (DATE_RING.jumper.pivotSwingDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const d: P2 = [inward[0] * c - inward[1] * s, inward[0] * s + inward[1] * c];
  return [JUMPER_TIP[0] + d[0] * DATE_RING.jumper.armLength, JUMPER_TIP[1] + d[1] * DATE_RING.jumper.armLength];
})();

/** Radius of the ring's inner edge under the jumper tip at ring position p (a gap at whole p, a tooth crest at half). */
export function jumperRadius(ringPos: number): number {
  const f = ringPos - Math.floor(ringPos);
  const crest = Math.sin(Math.PI * f) ** 2;
  return DATE_RING.rootRadius - (DATE_RING.rootRadius - DATE_RING.tipRadius) * crest;
}

function jumperTipAt(r: number): P2 {
  // tip on the circle of radius r round the centre, `armLength` from the stud: the crossing nearer the seated tip
  const a = circleIntersectionLocal(r, 0);
  const b = circleIntersectionLocal(r, 1);
  const d = (p: P2) => Math.hypot(p[0] - JUMPER_TIP[0], p[1] - JUMPER_TIP[1]);
  return d(a) < d(b) ? a : b;
}

function circleIntersectionLocal(r: number, pick: 0 | 1): P2 {
  const c1 = JUMPER_PIVOT;
  const L = DATE_RING.jumper.armLength;
  const d = Math.hypot(c1[0], c1[1]);
  const a = (d * d + r * r - L * L) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - a * a)) * (pick === 0 ? 1 : -1);
  const u: P2 = [c1[0] / d, c1[1] / d];
  return [u[0] * a - u[1] * h, u[1] * a + u[0] * h];
}

const jumperArmAngle = (r: number) => {
  const t = jumperTipAt(r);
  return angleY([t[0] - JUMPER_PIVOT[0], t[1] - JUMPER_PIVOT[1]]);
};
const JUMPER_GAP_ANGLE = jumperArmAngle(DATE_RING.rootRadius);

/** Rotation (rotY degrees) of the jumper about its stud, 0 when the tip sits in a gap. */
export const jumperAngle = (ringPos: number): number => jumperArmAngle(jumperRadius(ringPos)) - JUMPER_GAP_ANGLE;

// ------------------------------------------------------------ driver finger

/** Sense of the date driver, ±1 (rotY sign). */
export const DRIVER_SENSE = REV_PER_HOUR.dateDriver > 0 ? 1 : -1;

/**
 * Where the finger is built on the driver (rotY degrees from its +X): chosen so
 * that it points straight away from the centre, deepest in the ring's teeth,
 * at 23:00, the middle of the step.
 */
export const FINGER_LOCAL_DEG = (() => {
  const apex = angleY(AXES.dateDriver);
  const driverAt23 = DRIVER_SENSE * 360 * (23 / 24);
  return (((apex - driverAt23) % 360) + 360) % 360;
})();

/** Ring sense: the finger and the corrector star both push it in the rotY-positive sense. */
export const RING_SENSE = 1;
