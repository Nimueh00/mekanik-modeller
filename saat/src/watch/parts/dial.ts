import type { BufferGeometry } from 'three';
import { latheY, type P2, roundCorners } from '../../core/geometry/profile';
import { DIAL, HANDS } from '../specs';
import { circle, merge, polarY, slab, toScene } from './common';

/**
 * Dial side: the dial with its applied indices, printed minute track and the
 * date window at 3 o'clock; the three hands. Hands are drawn in their own
 * frame pointing at 12 o'clock (−Z) for angle 0, the reading of `trainAngles`.
 */

/** Rectangle with rounded corners, centred on c, `along` × `across` with its long side along direction a (rotY degrees). */
function roundedRect(c: P2, along: number, across: number, a: number, r: number): P2[] {
  const u = polarY(1, a);
  const v: P2 = [-u[1], u[0]];
  const corner = (s: number, t: number): P2 => [
    c[0] + u[0] * s * (along / 2) + v[0] * t * (across / 2),
    c[1] + u[1] * s * (along / 2) + v[1] * t * (across / 2),
  ];
  return roundCorners([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], [r, r, r, r], true, 3);
}

export interface DialGeometry {
  dial: BufferGeometry;
  indices: BufferGeometry;
  print: BufferGeometry;
}

export function buildDial(): DialGeometry {
  const [y0, y1] = DIAL.y;
  const w = DIAL.window;
  const window = roundedRect([w.centre, 0], w.radial, w.tangential, 0, 0.12).reverse();
  const dial = slab(circle(DIAL.radius, [0, 0], 240), [circle(0.62, [0, 0], 32).reverse(), window], y0, y1, 0.05);
  // applied indices: polished bars, doubled at 12, none at 3 (the date window)
  const indices: BufferGeometry[] = [];
  const { inner, outer } = DIAL.indices;
  for (let h = 0; h < 12; h++) {
    if (h === 3) continue;
    const a = 90 - h * 30; // clock → rotY
    const mid = (inner + outer) / 2;
    const bars = h === 0 ? [-0.32, 0.32] : [0];
    for (const off of bars) {
      const c = polarY(mid, a);
      const side: P2 = [-polarY(1, a)[1] * off, polarY(1, a)[0] * off];
      indices.push(
        slab(roundedRect([c[0] + side[0], c[1] + side[1]], outer - inner, 0.42, a, 0.08), [], y1, y1 + 0.12, 0.02),
      );
    }
  }
  // printed minute track: 60 strokes, longer every five minutes
  const print: BufferGeometry[] = [];
  for (let m = 0; m < 60; m++) {
    const a = 90 - m * 6;
    const long = m % 5 === 0;
    const r1 = DIAL.radius - 0.45;
    const len = long ? 0.55 : 0.3;
    print.push(slab(roundedRect(polarY(r1 - len / 2, a), len, long ? 0.09 : 0.05, a, 0.01), [], y1, y1 + 0.006));
  }
  return { dial: toScene(dial), indices: toScene(merge(indices)), print: toScene(merge(print)) };
}

/** Outline of a hand pointing at 12 (−Z): a blade with a round boss, from a list of (distance, half-width) stations. */
function handOutline(stations: readonly [number, number][], boss: number): P2[] {
  const right: P2[] = stations.map(([d, w]) => [w, -d]);
  const left: P2[] = [...stations].reverse().map(([d, w]) => [-w, -d]);
  // the boss closes the outline round the back
  const back: P2[] = [];
  const a0 = Math.atan2(right[0]![1], right[0]![0]);
  const a1 = Math.atan2(left[left.length - 1]![1], left[left.length - 1]![0]) + 2 * Math.PI;
  for (let k = 1; k < 16; k++) {
    const a = a1 - ((a1 - a0) * k) / 16; // from the left side round the back (+Z) to the right side
    back.push([boss * Math.cos(a), boss * Math.sin(a)]);
  }
  return [...left, ...back, ...right];
}

/** A hand (mm): blade with a boss and its collar, pipe hole of radius `bore`. */
function hand(outline: P2[], y: readonly [number, number], bore: number, collar: number): BufferGeometry {
  const blade = slab(outline, [circle(bore, [0, 0], 24).reverse()], y[0], y[1], 0.01);
  const ring = latheY(
    [
      [bore, y[0] - 0.05],
      [collar, y[0] - 0.05],
      [collar, y[1]],
      [bore, y[1]],
      [bore, y[0] - 0.05],
    ],
    28,
  );
  return merge([blade, ring]);
}

export function buildHourHand(): BufferGeometry {
  const H = HANDS.hour;
  const w = H.width / 2;
  return toScene(
    hand(
      handOutline(
        [
          [0.5, 0.34],
          [H.length * 0.72, w],
          [H.length - 0.25, w * 0.7],
          [H.length, 0.02],
        ],
        0.82,
      ),
      H.y,
      0.5,
      0.7,
    ),
  );
}

export function buildMinuteHand(): BufferGeometry {
  const H = HANDS.minute;
  const w = H.width / 2;
  return toScene(
    hand(
      handOutline(
        [
          [0.45, 0.28],
          [H.length * 0.78, w],
          [H.length - 0.25, w * 0.6],
          [H.length, 0.02],
        ],
        0.62,
      ),
      H.y,
      0.36,
      0.52,
    ),
  );
}

/** Centre seconds hand: needle, counterweight tail with a round end. */
export function buildSecondHand(): BufferGeometry {
  const H = HANDS.second;
  const w = H.width / 2;
  const needle = handOutline(
    [
      [0.3, w * 1.4],
      [H.length - 0.6, w],
      [H.length, 0.015],
    ],
    0.32,
  );
  const tail = slab(
    roundCorners(
      [
        [-w * 1.6, 0],
        [w * 1.6, 0],
        [w * 2.2, H.tail - 0.4],
        [-w * 2.2, H.tail - 0.4],
      ],
      [0, 0, 0.05, 0.05],
      true,
      2,
    ),
    [],
    H.y[0],
    H.y[1],
  );
  const weight = slab(
    circle(0.36, [0, H.tail - 0.25], 32),
    [circle(0.2, [0, H.tail - 0.25], 20).reverse()],
    H.y[0],
    H.y[1],
    0.01,
  );
  return toScene(merge([hand(needle, H.y, 0.11, 0.3), tail, weight]));
}
