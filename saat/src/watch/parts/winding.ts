import type { BufferGeometry } from 'three';
import { type P2, roundCorners } from '../../core/geometry/profile';
import { BARREL_SENSE } from '../mainspring';
import { CLICK_PIVOT, CLICK_TIP_SEATED, SAW_PITCH_DEG, SAW_WALL_ANGLE } from '../ratchet';
import { KEYLESS, MOVEMENT, RATCHET, WINDING_LEVELS } from '../specs';
import { box, circle, cylinderY, merge, polarY, slab, strokeOutline, toScene, tubeY } from './common';
import { windGearGeometry } from './gears';

/**
 * Winding wheels above the bridges: the ratchet with its click, the crown
 * wheel and the reduction wheel (the reversers are in automatic.ts). Wheels sit
 * in the two levels of WINDING_LEVELS; every part is built in the frame of its
 * own axis.
 */

const [L1a, L1b] = WINDING_LEVELS.l1;
const [L2a, L2b] = WINDING_LEVELS.l2;
const BRIDGE_TOP = MOVEMENT.envelope.bridges[0];
const PLATE_BACK = MOVEMENT.plate.y[1] - 1.2;

/** Number of ramp samples per saw tooth. */
const RAMP_STEPS = 4;

/** Outline of the sawtooth ring, counter-clockwise in (x, z): walls at SAW_WALL_ANGLE + k·pitch. */
export function sawOutline(): P2[] {
  const { teeth, rootRadius: root, tipRadius: tip } = RATCHET.saw;
  const s = BARREL_SENSE;
  const pts: P2[] = [];
  for (let k = 0; k < teeth; k++) {
    const phi0 = SAW_WALL_ANGLE + k * SAW_PITCH_DEG;
    for (let j = 0; j <= RAMP_STEPS; j++) {
      const x = j / RAMP_STEPS;
      const r = s > 0 ? tip - (tip - root) * x : root + (tip - root) * x;
      pts.push(polarY(r, phi0 + x * SAW_PITCH_DEG));
    }
  }
  return pts.reverse(); // polarY runs clockwise in the numbers
}

export interface RatchetGeometry {
  gear: BufferGeometry;
  saw: BufferGeometry;
  hub: BufferGeometry;
}

/** The ratchet wheel: toothed gear in level 2, sawtooth ring in level 1, one hub through both. */
export function buildRatchet(): RatchetGeometry {
  const gear = windGearGeometry('ratchetGear', { arms: 6, rim: 0.4, hub: 1.1, arm: 0.5 }, RATCHET.hubRadius);
  const ring = slab(sawOutline(), [circle(1.3, [0, 0], 48).reverse()], L1a, L1b);
  // four spokes join the ring to the hub
  const spokes: BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const spoke = box(0.5, L1b - L1a, 1.6, [0, (L1a + L1b) / 2, 0]);
    spoke.translate(0, 0, 1.1);
    spoke.rotateY((k * Math.PI) / 2 + Math.PI / 4);
    spokes.push(spoke);
  }
  const hub = tubeY(0.3, RATCHET.hubRadius, L1a, L2b, 32);
  return { gear, saw: toScene(merge([ring, ...spokes])), hub: toScene(hub) };
}

export interface ClickGeometry {
  arm: BufferGeometry;
  /** Static stud the click turns on (stands on the barrel bridge). */
  post: BufferGeometry;
}

/** Rotate a plan point about the origin by `deg` in the (x, z) numbers. */
const rot = (p: P2, deg: number): P2 => {
  const a = (deg * Math.PI) / 180;
  return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
};

/** Direction (degrees, in the plan numbers) from the click pivot to the seated tip, and its length. */
function clickAxis(): { deg: number; length: number } {
  const dx = CLICK_TIP_SEATED[0] - CLICK_PIVOT[0];
  const dz = CLICK_TIP_SEATED[1] - CLICK_PIVOT[1];
  return { deg: (Math.atan2(dz, dx) * 180) / Math.PI, length: Math.hypot(dx, dz) };
}

/**
 * The click (tırnak), in the frame of its pivot: a boss round the stud, a
 * tapering arm ending in a hooked tip that rests on the sawtooth ring, and a
 * short tail the spring presses on.
 */
export function buildClick(): ClickGeometry {
  const { deg, length } = clickAxis();
  // drawn along +x, then turned onto the arm's direction
  const local: P2[] = roundCorners(
    [
      [-0.9, -0.2],
      [-0.1, -0.5],
      [length * 0.55, -0.34],
      [length - 0.25, -0.16],
      [length + 0.05, 0.0], // hooked tip
      [length - 0.35, 0.16],
      [length * 0.55, 0.3],
      [-0.1, 0.5],
      [-0.9, 0.2],
    ],
    [0.05, 0.2, 0, 0.04, 0, 0.04, 0, 0.2, 0.05],
    true,
    3,
  );
  const outline = local.map((p) => rot(p, deg));
  const arm = slab(outline, [circle(0.2, [0, 0], 20).reverse()], L1a, L1b, 0.01);
  const post = cylinderY(0.17, BRIDGE_TOP - 0.02, L1a, 20);
  return { arm: toScene(arm), post: toScene(post) };
}

/** The click spring: a thin blade from a post on the bridge to the click's tail, static, in the movement frame. */
export function buildClickSpring(): BufferGeometry {
  const { deg } = clickAxis();
  const at = (p: P2): P2 => {
    const q = rot(p, deg);
    return [CLICK_PIVOT[0] + q[0], CLICK_PIVOT[1] + q[1]];
  };
  const path: P2[] = [at([-0.75, 0.05]), at([-1.5, 0.9]), at([-1.0, 1.9]), at([0.2, 2.2])];
  const blade = slab(strokeOutline(path, [0.1, 0.1, 0.1, 0.12], 8), [], L1a + 0.03, L1b - 0.03);
  const post = cylinderY(0.2, BRIDGE_TOP - 0.02, L1a, 20, path[path.length - 1]!);
  return toScene(merge([blade, post]));
}

export interface CrownWheelGeometry {
  /** Spur gear in level 2 (gilt brass). */
  spur: BufferGeometry;
  /** Contrate ring and hubs (steel). */
  steel: BufferGeometry;
}

/** Contrate wheel body: a disc with a ring of axial teeth of radial width `width` at the pitch radius, `n` teeth. */
export function contrateTeeth(pitchR: number, n: number, width: number, y0: number, y1: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const pitch = (2 * Math.PI * pitchR) / n;
  for (let k = 0; k < n; k++) {
    const b = box(width, y1 - y0, pitch * 0.45, [pitchR, (y0 + y1) / 2, 0]);
    b.rotateY((2 * Math.PI * k) / n);
    out.push(b);
  }
  return out;
}

/** Crown wheel (taç çarkı): a spur gear in level 2 and, under it, the contrate toothing the winding pinion meshes. */
export function buildCrownWheel(): CrownWheelGeometry {
  const spur = windGearGeometry('crownSpur', { arms: 5, rim: 0.3, hub: 0.7, arm: 0.4 }, 0.3);
  const R = KEYLESS.crownContrate.teeth * KEYLESS.crownContrate.module * 0.5;
  const [cy0, cy1] = KEYLESS.contrateY;
  const bodyTop = cy0 + 0.085;
  const body = slab(circle(R - KEYLESS.contrateWidth.crown / 2, [0, 0], 48), [circle(0.3, [0, 0], 20).reverse()], cy0, bodyTop);
  const teeth = contrateTeeth(R, KEYLESS.crownContrate.teeth, KEYLESS.contrateWidth.crown, bodyTop - 0.01, cy1);
  const hub = tubeY(0.15, 0.42, L2b - 0.01, bodyTop + 0.01, 24);
  // the stud the wheel turns on: from the plate to the contrate
  const axle = cylinderY(0.15, cy1 - 0.02, PLATE_BACK - 0.1, 20);
  return { spur, steel: toScene(merge([body, ...teeth, hub, axle])) };
}

export interface ReductionGeometry {
  wheel: BufferGeometry;
  pinion: BufferGeometry;
  hub: BufferGeometry;
}

/** Reduction wheel of the automatic works: a wheel in level 1 and the pinion under it in level 2, on one hub. */
export function buildReduction(): ReductionGeometry {
  const wheel = windGearGeometry('reductionWheel', { arms: 5, rim: 0.28, hub: 0.55, arm: 0.28 }, 0.2);
  const pinion = windGearGeometry('reductionPinion', undefined, 0.2);
  const hub = toScene(merge([tubeY(0.12, 0.3, L1a, L1b, 20), tubeY(0.12, 0.3, L2a, L2b, 20), cylinderY(0.12, L1a, BRIDGE_TOP - 0.04, 16)]));
  return { wheel, pinion, hub };
}

export interface ReverserGeometry {
  /** Wheel in level 2, turned by the rotor. */
  wheel: BufferGeometry;
  /** Pinion above it in level 1, turned by the reduction wheel. */
  pinion: BufferGeometry;
  /** Pivot stud through both. */
  hub: BufferGeometry;
}

/** One of the two reversers. */
export function buildReverser(n: 1 | 2): ReverserGeometry {
  const wheel = windGearGeometry(`reverser${n}Wheel`, { arms: 4, rim: 0.2, hub: 0.42, arm: 0.2 }, 0.2);
  const pinion = windGearGeometry(`reverser${n}Pinion`, undefined, 0.2);
  const hub = toScene(merge([tubeY(0.12, 0.3, L1a, L2b, 20), cylinderY(0.12, L1a, BRIDGE_TOP - 0.04, 16)]));
  return { wheel, pinion, hub };
}
