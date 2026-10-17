import type { BufferGeometry } from 'three';
import { latheY, type P2, roundCorners } from '../../core/geometry/profile';
import { gearOutline, rootRadius } from '../geometry/watchGear';
import { GEAR_PHASE } from '../meshPhase';
import { FINGER_LOCAL_DEG } from '../dateWork';
import { DATE, DATE_RING, gearByName, MOTION_WORKS, TRAIN } from '../specs';
import { circle, slab, toScene, tubeY } from './common';

/** Crossing (spoke) style of a wheel, mm. */
export interface Crossing {
  arms: number;
  /** Rim width below the root circle, mm. */
  rim: number;
  /** Hub radius, mm. */
  hub: number;
  /** Arm width, mm. */
  arm: number;
}

/**
 * The windows between the arms of a wheel ("crossings"), as hole outlines:
 * each bounded by the rim's inner circle, the hub and two straight arms of
 * constant width, corners rounded like a milled crossing.
 */
export function crossingHoles(rimInner: number, c: Crossing): P2[][] {
  const holes: P2[][] = [];
  const hw = c.arm / 2;
  const rh = c.hub;
  if (rimInner - rh < 3 * hw) return holes;
  const step = (2 * Math.PI) / c.arms;
  const fillet = Math.min(0.12, (rimInner - rh) * 0.2);
  for (let k = 0; k < c.arms; k++) {
    const a0 = k * step + Math.PI / 2; // first arm on +Z (6 o'clock), purely cosmetic
    const a1 = a0 + step;
    const dOut = Math.asin(hw / rimInner);
    const dIn = Math.asin(Math.min(0.99, hw / rh));
    const pts: P2[] = [];
    const segs = Math.max(4, Math.round((step * rimInner) / 0.15));
    for (let i = 0; i <= segs; i++) {
      const a = a0 + dOut + ((a1 - a0 - 2 * dOut) * i) / segs;
      pts.push([rimInner * Math.cos(a), rimInner * Math.sin(a)]);
    }
    const segsIn = Math.max(2, Math.round(segs / 3));
    for (let i = 0; i <= segsIn; i++) {
      const a = a1 - dIn - ((a1 - a0 - 2 * dIn) * i) / segsIn;
      pts.push([rh * Math.cos(a), rh * Math.sin(a)]);
    }
    const round = pts.map((_, i) => (i === 0 || i === segs || i === segs + 1 || i === pts.length - 1 ? fillet : 0));
    holes.push(roundCorners(pts, round, true, 3));
  }
  return holes;
}

/** A toothed wheel with crossings, between y0 and y1, teeth phased, in scene units. */
export function spokedWheel(name: string, c: Crossing, bore = 0): BufferGeometry {
  const tg = gearByName(name);
  const holes = crossingHoles(rootRadius(tg) - c.rim, c);
  if (bore > 0) holes.push(circle(bore, [0, 0], 32).reverse());
  const g = slab(gearOutline(tg), holes, tg.gear.y[0], tg.gear.y[1]);
  g.rotateY((GEAR_PHASE[name]! * Math.PI) / 180);
  return toScene(g);
}

/** A pinion's leaves between its y range, phased, with an optional bore, in scene units. */
export function pinion(name: string, bore = 0): BufferGeometry {
  const tg = gearByName(name);
  const g = slab(gearOutline(tg), bore > 0 ? [circle(bore, [0, 0], 24).reverse()] : [], tg.gear.y[0], tg.gear.y[1]);
  g.rotateY((GEAR_PHASE[name]! * Math.PI) / 180);
  return toScene(g);
}

/**
 * Arbor as a solid of revolution through its outside stations [radius, y]
 * (any order), closed on the axis at both ends, in scene units.
 */
export function arbor(stations: readonly P2[]): BufferGeometry {
  // walking the outside upwards (low y first) gives outward normals
  const outside = [...stations].sort((a, b) => a[1] - b[1]);
  const prof: P2[] = [[0, outside[0]![1]]];
  for (const p of outside) prof.push(p);
  prof.push([0, outside[outside.length - 1]![1]]);
  return toScene(latheY(prof, 20));
}

/** Arbor with pivots: radius r between y0 (bridge side) and y1 (plate side), pivots of radius rp sticking out by `pivot`. */
export function pivotedArbor(r: number, y0: number, y1: number, rp = 0.07, pivot = 0.25): BufferGeometry {
  return arbor([
    [rp, y0 - pivot],
    [rp, y0 + 0.02],
    [r * 0.8, y0 + 0.04],
    [r, y0 + 0.1],
    [r, y1 - 0.1],
    [r * 0.8, y1 - 0.04],
    [rp, y1 - 0.02],
    [rp, y1 + pivot],
  ]);
}

export interface BodyGeometry {
  /** Gilt brass parts (wheels). */
  brass: BufferGeometry[];
  /** Polished steel parts (pinions, arbors, escape wheel). */
  steel: BufferGeometry[];
}

const PLATE_BACK = -1.2;
const BRIDGE_UNDER = -3.3;

/** Centre wheel and pinion on the hollow centre tube (minute arbor). */
export function buildCentre(): BodyGeometry {
  return {
    brass: [spokedWheel('centreWheel', { arms: 4, rim: 0.32, hub: 0.6, arm: 0.34 }, 0.26)],
    steel: [
      pinion('centrePinion', 0.15),
      toScene(tubeY(0.15, 0.26, -1.92, 0.52, 28)),
      toScene(tubeY(0.26, 0.6, -1.44, -1.42, 32)),
    ],
  };
}

/** Third wheel and pinion. */
export function buildThird(): BodyGeometry {
  return {
    brass: [spokedWheel('thirdWheel', { arms: 4, rim: 0.3, hub: 0.55, arm: 0.32 })],
    steel: [pinion('thirdPinion'), pivotedArbor(0.15, BRIDGE_UNDER, PLATE_BACK)],
  };
}

/** Fourth (seconds) wheel: its long arbor runs through the centre tube to the seconds hand. */
export function buildFourth(): BodyGeometry {
  const [y0] = TRAIN.fourth.wheel.y;
  return {
    brass: [spokedWheel('fourthWheel', { arms: 5, rim: 0.3, hub: 0.5, arm: 0.3 })],
    steel: [
      pinion('fourthPinion'),
      arbor([
        [0.07, BRIDGE_UNDER - 0.25],
        [0.07, BRIDGE_UNDER + 0.02],
        [0.12, y0 - 0.05],
        [0.12, 1.79],
        [0.09, 1.82],
        [0.0, 1.83],
      ]),
    ],
  };
}

/** Escape pinion and arbor (the club-tooth wheel is drawn with the escapement). */
export function buildEscapeArbor(): BufferGeometry[] {
  return [pinion('escapePinion'), pivotedArbor(0.12, BRIDGE_UNDER, PLATE_BACK)];
}

/** Cannon pinion: leaves, and the pipe that carries the minute hand. */
export function buildCannon(): BodyGeometry {
  const [, top] = MOTION_WORKS.cannonPinion.y;
  return {
    brass: [],
    steel: [pinion('cannonPinion', 0.26), toScene(tubeY(0.26, 0.36, top, 1.6, 28))],
  };
}

/** Minute wheel and its pinion (they turn on a stud set in the plate). */
export function buildMinuteWheel(): BodyGeometry {
  return {
    brass: [spokedWheel('minuteWheel', { arms: 4, rim: 0.2, hub: 0.45, arm: 0.22 }, 0.2)],
    steel: [
      pinion('minutePinion', 0.2),
      toScene(tubeY(0.2, 0.32, MOTION_WORKS.minuteWheel.y[1], MOTION_WORKS.minutePinion.y[0], 20)),
    ],
  };
}

/** Hour wheel and its pipe (hour hand seat). */
export function buildHourWheel(): BodyGeometry {
  const [, top] = MOTION_WORKS.hourWheel.y;
  return {
    brass: [spokedWheel('hourWheel', { arms: 4, rim: 0.22, hub: 0.65, arm: 0.24 }, 0.38)],
    steel: [toScene(tubeY(0.38, 0.5, top - 0.02, 1.45, 28))],
  };
}

/** Date driver: 64-tooth wheel with its finger, which steps the date ring one tooth a day (dateWork.ts). */
export function buildDateDriver(): BodyGeometry {
  const [, top] = DATE.driver.y;
  const reach = DATE_RING.finger.length;
  // finger on the top face, built pointing along +X of the wheel's frame and turned to where it must stand at 23:00
  const finger = slab(
    roundCorners(
      [
        [0.3, -0.2],
        [reach - 0.2, -0.13],
        [reach, 0],
        [reach - 0.2, 0.13],
        [0.3, 0.2],
      ],
      [0, 0.04, 0.05, 0.04, 0],
      true,
      2,
    ),
    [],
    DATE_RING.finger.y[0],
    DATE_RING.finger.y[1],
  );
  finger.rotateY((FINGER_LOCAL_DEG * Math.PI) / 180);
  return {
    brass: [spokedWheel('dateDriver', { arms: 5, rim: 0.28, hub: 0.55, arm: 0.28 }, 0.2)],
    steel: [toScene(finger), toScene(tubeY(0.2, 0.42, top, top + 0.12, 24))],
  };
}
