import { describe, expect, it } from 'vitest';
import {
  DAY_SECONDS,
  dayAtWindow,
  DRIVER_SENSE,
  FINGER_LOCAL_DEG,
  GAP_ANGLE,
  JUMPER_TIP_ANGLE,
  jumperAngle,
  jumperRadius,
  numeralLayout,
  RING_PITCH_DEG,
  RING_TEETH,
  ringAngle,
  ringFloatAt,
  stepFraction,
  visibleDay,
} from '../src/watch/dateWork';
import { angleY } from '../src/watch/geometry/watchGear';
import { AXES, DATE, DATE_RING, DIAL, towardsClock } from '../src/watch/specs';
import { dialReading, handAngles, trainAngles } from '../src/watch/train';
import { WatchClock } from '../src/watch/watchClock';

const H = 3600;

describe('date ring kinematics', () => {
  it('steps one tooth per 24 hours, entirely between 22:00 and 24:00, and never back', () => {
    expect(RING_TEETH).toBe(31);
    expect(DATE.ringTeeth).toBe(31);
    // nothing moves until 22:00; the step ends at midnight
    for (const s of [0, 3 * H, 12 * H, 21 * H, 21.99 * H]) expect(ringFloatAt(s)).toBe(0);
    expect(stepFraction(22 * H)).toBe(0);
    expect(ringFloatAt(23 * H)).toBeCloseTo(0.5, 12);
    expect(ringFloatAt(24 * H)).toBeCloseTo(1, 12);
    expect(ringFloatAt(24 * H + 1)).toBeCloseTo(1, 12);
    // monotone, and exactly +1 over any 24 hours
    let prev = ringFloatAt(-3 * DAY_SECONDS);
    for (let s = -3 * DAY_SECONDS; s < 40 * DAY_SECONDS; s += 137.3) {
      const p = ringFloatAt(s);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    for (const s0 of [0, 5 * H, 22.5 * H, 100 * H]) expect(ringFloatAt(s0 + DAY_SECONDS) - ringFloatAt(s0)).toBeCloseTo(1, 12);
  });

  it('the ring turns by 360/31 degrees per tooth; after day 31 it comes back to 1', () => {
    expect(ringAngle(1)).toBeCloseTo(360 / 31, 12);
    expect(ringAngle(31)).toBeCloseTo(360, 12);
    expect(RING_PITCH_DEG).toBeCloseTo(360 / 31, 12);
    expect(visibleDay(0)).toBe(1);
    expect(visibleDay(16)).toBe(17);
    expect(visibleDay(30)).toBe(31);
    expect(visibleDay(31)).toBe(1);
    expect(visibleDay(61)).toBe(31);
    expect(visibleDay(62)).toBe(1);
  });

  it('the numeral in the window is the right day: ring angle and numeral layout agree', () => {
    const layout = numeralLayout();
    expect(layout).toHaveLength(31);
    expect(layout.every((n) => n.radius === DIAL.window.centre)).toBe(true);
    for (const [i, n] of layout.entries()) {
      expect(n.day).toBe(i + 1);
      expect(n.angle).toBeCloseTo(-i * RING_PITCH_DEG, 9); // the ring turns +pitch per day: numerals run the other way
    }
    for (let p = 0; p < 62; p++) expect(dayAtWindow(ringAngle(p))).toBe(visibleDay(p));
    for (const d of [1, 2, 9, 17, 30, 31]) expect(dayAtWindow(ringAngle(d - 1))).toBe(d);
  });

  it('the jumper rests in a gap at whole ring positions, on a tooth crest at half positions', () => {
    expect(jumperRadius(0)).toBe(DATE_RING.rootRadius);
    expect(jumperRadius(7)).toBeCloseTo(DATE_RING.rootRadius, 12);
    expect(jumperRadius(0.5)).toBeCloseTo(DATE_RING.tipRadius, 12);
    expect(jumperRadius(3.25)).toBeCloseTo(jumperRadius(0.25), 12);
    expect(jumperAngle(0)).toBeCloseTo(0, 12);
    expect(jumperAngle(5)).toBeCloseTo(0, 9);
    expect(Math.abs(jumperAngle(0.5))).toBeGreaterThan(0.5); // lifted over the crest
    // the gaps of the ring lie at GAP_ANGLE + k·pitch: one of them is under the tip at every whole position
    for (const p of [0, 1, 2, 30]) {
      const local = JUMPER_TIP_ANGLE - ringAngle(p) - GAP_ANGLE;
      const k = local / RING_PITCH_DEG;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
    }
  });
});

describe('the finger of the date driver', () => {
  const D = AXES.dateDriver;
  /** Finger tip in the plan at driver time tau (seconds since 00:00), mm. */
  const tip = (tau: number) => {
    const a = trainAngles(tau, { continuous: true }).dateDriver + FINGER_LOCAL_DEG;
    const r = DATE_RING.finger.length;
    const rad = (a * Math.PI) / 180;
    return [D[0] + r * Math.cos(rad), D[1] - r * Math.sin(rad)] as const;
  };

  it('points straight away from the centre at 23:00, in the ring’s teeth only during the step window, and pushes the ring’s way', () => {
    const radius = (tau: number) => Math.hypot(...tip(tau));
    // deepest at 23:00
    expect(radius(23 * H)).toBeCloseTo(Math.hypot(...D) + DATE_RING.finger.length, 9);
    for (const dh of [0.25, 0.5, 1, 2]) {
      expect(radius(23 * H - dh * H)).toBeLessThan(radius(23 * H));
      expect(radius(23 * H + dh * H)).toBeLessThan(radius(23 * H));
    }
    // in the tooth zone (tip radius … root radius) around the step, clear of it long before and after
    expect(radius(23 * H)).toBeGreaterThan(DATE_RING.tipRadius);
    expect(radius(23 * H)).toBeLessThan(DATE_RING.rootRadius);
    expect(radius(20 * H)).toBeLessThan(DATE_RING.tipRadius);
    expect(radius(26 * H)).toBeLessThan(DATE_RING.tipRadius);
    // it enters the teeth within an hour of 22:00 and leaves within an hour after 24:00
    expect(radius(21.2 * H)).toBeLessThan(DATE_RING.tipRadius);
    expect(radius(24.8 * H)).toBeLessThan(DATE_RING.tipRadius);
    // its tip moves round the centre in the ring's sense (rotY positive) at 23:00
    const ang = (tau: number) => angleY([tip(tau)[0], tip(tau)[1]]);
    const d = ((ang(23 * H + 60) - ang(23 * H - 60) + 540) % 360) - 180;
    expect(Math.sign(d)).toBe(1);
    expect(DRIVER_SENSE).toBe(1);
  });
});

describe('WatchClock with the date', () => {
  it('fromDate gives the day of the month and the local time (t = seconds since 00:00 of the 1st)', () => {
    const d = new Date(2026, 9, 17, 10, 8, 37, 500);
    const c = WatchClock.fromDate(d);
    expect(c.t).toBeCloseTo(16 * DAY_SECONDS + 10 * H + 8 * 60 + 37.5, 9);
    expect(Math.floor(c.t / DAY_SECONDS) + 1).toBe(17);
    expect(visibleDay(c.dateRing)).toBe(17);
    // the hands read the local time (12-hour dial)
    const hands = handAngles(c.t);
    expect(dialReading(hands.hour)).toBeCloseTo(((10 * H + 8 * 60 + 37.5) / (12 * H)) * 360, 6);
    expect(dialReading(hands.minute)).toBeCloseTo(((8 * 60 + 37.5) / H) * 360, 6);
    // afternoon: 15:00 is 3 o'clock on the 12-hour dial
    const pm = WatchClock.fromDate(new Date(2026, 0, 1, 15, 0, 0));
    expect(pm.t).toBe(15 * H);
    expect(dialReading(handAngles(pm.t).hour)).toBeCloseTo(90, 9);
    expect(visibleDay(pm.dateRing)).toBe(1);
    // the last of a long month, and a first just after midnight
    expect(visibleDay(WatchClock.fromDate(new Date(2026, 9, 31, 8, 0, 0)).dateRing)).toBe(31);
    expect(visibleDay(WatchClock.fromDate(new Date(2026, 10, 1, 0, 0, 1)).dateRing)).toBe(1);
  });

  it('the ring steps once in 24 h of running, inside 22:00–24:00, and the window shows the date from 00:00 to 21:59', () => {
    const c = WatchClock.fromDate(new Date(2026, 9, 17, 0, 0, 0));
    const start = c.dateRing;
    expect(visibleDay(start)).toBe(17);
    const seen: { sec: number; ring: number }[] = [];
    for (let h = 0; h < 24 * 4; h++) {
      c.advance(900); // a quarter of an hour
      seen.push({ sec: (h + 1) * 900, ring: c.dateRing - start });
    }
    expect(seen[seen.length - 1]!.ring).toBeCloseTo(1, 12);
    for (const { sec, ring } of seen) {
      if (sec <= 22 * H) expect(ring, `${sec} s`).toBe(0);
      else expect(ring).toBeGreaterThan(0);
      if (sec < 24 * H) expect(ring).toBeLessThan(1);
      if (sec < 22 * H) expect(visibleDay(start + ring)).toBe(17);
    }
    expect(visibleDay(c.dateRing)).toBe(18);
  });

  it('31 → 1 in the clock: the ring goes round', () => {
    const c = WatchClock.fromDate(new Date(2026, 9, 31, 12, 0, 0));
    expect(visibleDay(c.dateRing)).toBe(31);
    c.advance(13 * H); // past midnight (the spring holds 80 h)
    expect(visibleDay(c.dateRing)).toBe(1);
  });

  it('the ring never goes back when the hands are set back; each forward pass of the finger steps it once more', () => {
    const c = WatchClock.fromDate(new Date(2026, 9, 17, 10, 0, 0));
    const r0 = c.dateRing;
    c.setCrownPosition(3);
    c.adjustHands(-12 * H); // back to 22:00 of the day before: the ring stays
    expect(c.dateRing).toBe(r0);
    c.adjustHands(+12 * H); // forward over yesterday's midnight to 10:00: the finger passes the teeth again
    expect(c.dateRing - r0).toBeCloseTo(1, 12);
    c.adjustHands(-6 * H); // back to 04:00: no step is undone
    c.adjustHands(+6 * H); // and forward again over no midnight: no step
    expect(c.dateRing - r0).toBeCloseTo(1, 12);
    c.adjustHands(+14 * H); // forward over today's midnight to 00:00 tomorrow
    expect(c.dateRing - r0).toBeCloseTo(2, 12);
    // the ring moves only in whole steps at 22:00–24:00: at 23:00 it is half way
    const d = WatchClock.fromDate(new Date(2026, 9, 17, 12, 0, 0));
    d.setCrownPosition(3);
    d.adjustHands(11 * H); // 23:00
    expect(d.dateRing - Math.floor(d.dateRing)).toBeCloseTo(0.5, 9);
  });

  it('without a clock, Watch.update derives the ring from t and the hand offset (see assembly tests)', () => {
    expect(towardsClock([0, 0], 1, 90)[0]).toBeCloseTo(1, 12);
  });
});
