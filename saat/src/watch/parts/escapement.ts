import { BufferAttribute, BufferGeometry } from 'three';
import { latheY, type P2, roundCorners } from '../../core/geometry/profile';
import { BANKING_DEG } from '../escapement';
import {
  ESCAPE_GEOMETRY,
  ESCAPE_WHEEL_OUTLINE,
  ESCAPE_WHEEL_PHASE,
  STONE,
  stonesOnLever,
} from '../geometry/escapeGeometry';
import { angleY, rotY } from '../geometry/watchGear';
import { AXES, ESCAPEMENT, HAIRSPRING, SCENE_PER_MM, TRAIN } from '../specs';
import { circle, clockToY, cylinderY, merge, polarY, slab, strokeOutline, toScene } from './common';
import { crossingHoles, pivotedArbor } from './wheels';

const PLATE_BACK = -1.2;
const BRIDGE_UNDER = -3.3;

// ---------------------------------------------------------------- escape wheel

/** Club-tooth escape wheel (steel) with five crossings, phased on its arbor, in scene units. */
export function buildEscapeWheel(): BufferGeometry {
  const [y0, y1] = TRAIN.escape.wheel.y;
  const rRoot = ESCAPE_GEOMETRY.tipRadius - 0.5;
  const holes = crossingHoles(rRoot - 0.22, { arms: 5, rim: 0, hub: 0.32, arm: 0.2 });
  const g = slab(ESCAPE_WHEEL_OUTLINE, holes, y0, y1);
  g.rotateY((ESCAPE_WHEEL_PHASE * Math.PI) / 180);
  return toScene(g);
}

// ---------------------------------------------------------------- lever

/** Pallet pivot → balance staff, unit vector, and its normal (lever frame at angle 0). */
const O_TO_B: P2 = (() => {
  const d: P2 = [AXES.balance[0] - AXES.pallet[0], AXES.balance[1] - AXES.pallet[1]];
  const l = Math.hypot(d[0], d[1]);
  return [d[0] / l, d[1] / l];
})();
const NORMAL: P2 = [-O_TO_B[1], O_TO_B[0]];
/** Point in the lever frame: `along` towards the balance, `side` across. */
const leverPt = (along: number, side: number): P2 => [
  O_TO_B[0] * along + NORMAL[0] * side,
  O_TO_B[1] * along + NORMAL[1] * side,
];

/** Fork and guard pin dimensions (lever frame, mm). */
export const FORK = {
  /** Impulse pin radius (a round ruby pin here; real ones are D-shaped). */
  pinRadius: 0.09,
  /** Half width of the slot: the pin plus a few µm of shake. */
  slotHalf: 0.1,
  slotBottom: 2.62,
  hornTip: 2.84,
  /** Guard pin tip, distance from the pallet pivot. */
  guardTip: 3.05,
  /** Safety roller radius and the crescent that lets the guard pin pass during the lift. */
  safetyRadius: 0.42,
  crescent: { radius: 0.16, centre: 0.47 },
  /** Lever arm half-width where it meets the banking pins, and their distance from the pivot. */
  armHalf: 0.17,
  bankingAt: 1.55,
  bankingPinRadius: 0.08,
} as const;

const LEVER_Y = ESCAPEMENT.lever.y;

export interface LeverGeometry {
  body: BufferGeometry;
  stones: BufferGeometry;
  arbor: BufferGeometry;
}

/** Radius of the lever's hub round its arbor (it must stay clear of the escape wheel's tip circle). */
const LEVER_HUB = 0.24;

/**
 * Plan outlines of the pallet fork in its own frame (pivot at the origin,
 * lever angle 0: the fork pointing at the balance staff), mm. The pallet arms
 * arch from the hub to the stone holders over the escape wheel's tip circle;
 * the pieces overlap and are drawn as separate slabs.
 */
export function leverOutlines(): { frame: P2[][]; fork: P2[]; stones: Record<'entry' | 'exit', P2[]> } {
  const stones = stonesOnLever();
  const frame: P2[][] = [circle(LEVER_HUB, [0, 0], 32)];
  for (const st of [stones.entry, stones.exit]) {
    // a point t mm out along the stone from the middle of its impulse face
    const c1 = st[0]!;
    const c2 = st[STONE.letOff]!;
    const back = st[st.length - 1]!;
    const l = Math.hypot(back[0] - c1[0], back[1] - c1[1]);
    const d: P2 = [(back[0] - c1[0]) / l, (back[1] - c1[1]) / l];
    const along = (t: number): P2 => [(c1[0] + c2[0]) / 2 + d[0] * t, (c1[1] + c2[1]) / 2 + d[1] * t];
    const width = Math.hypot(c2[0] - c1[0], c2[1] - c1[1]);
    frame.push(strokeOutline([along(0.4), along(0.86)], [width + 0.16, width + 0.12]));
    const h = along(0.62);
    const mid: P2 = [h[0] / 2 + O_TO_B[0] * 0.28, h[1] / 2 + O_TO_B[1] * 0.28];
    frame.push(strokeOutline([[0, 0], mid, h], [0.4, 0.3, 0.34]));
  }
  // lever arm, then the fork head with its slot and horns
  frame.push(strokeOutline([leverPt(0, 0), leverPt(1.2, 0), leverPt(2.3, 0)], [0.42, 0.34, 0.3]));
  const s = FORK.slotHalf;
  const fork: P2[] = roundCorners(
    [
      leverPt(2.25, -0.2),
      leverPt(2.42, -0.36),
      leverPt(FORK.hornTip - 0.05, -0.34),
      leverPt(FORK.hornTip, -0.27),
      leverPt(FORK.hornTip - 0.02, -s - 0.05),
      leverPt(FORK.slotBottom + 0.12, -s),
      leverPt(FORK.slotBottom, -s),
      leverPt(FORK.slotBottom, s),
      leverPt(FORK.slotBottom + 0.12, s),
      leverPt(FORK.hornTip - 0.02, s + 0.05),
      leverPt(FORK.hornTip, 0.27),
      leverPt(FORK.hornTip - 0.05, 0.34),
      leverPt(2.42, 0.36),
      leverPt(2.25, 0.2),
    ],
    [0, 0.08, 0.04, 0.04, 0.02, 0, 0.03, 0.03, 0, 0.02, 0.04, 0.04, 0.08, 0],
    true,
    3,
  );
  return { frame, fork, stones };
}

/** Pallet fork: frame, arm, fork and guard pin (steel), the two ruby stones, the arbor; scene units. */
export function buildLever(): LeverGeometry {
  const [y0, y1] = LEVER_Y;
  const o = leverOutlines();
  const body = [
    ...o.frame.map((f) => slab(f, [], y0 + 0.015, y1 - 0.015)),
    slab(o.fork, [], y0 + 0.01, y1 - 0.01),
    // guard pin (dart) on the fork, at the safety roller's level, pointing at the staff
    slab(
      roundCorners(
        [
          leverPt(2.5, -0.05),
          leverPt(FORK.guardTip - 0.04, -0.03),
          leverPt(FORK.guardTip, 0),
          leverPt(FORK.guardTip - 0.04, 0.03),
          leverPt(2.5, 0.05),
        ],
        [0, 0.01, 0, 0.01, 0],
        true,
        2,
      ),
      [],
      y1 + 0.005,
      y1 + 0.1,
    ),
    // collar round the arbor
    latheY(
      [
        [0.1, y0 - 0.04],
        [LEVER_HUB - 0.04, y0 - 0.04],
        [LEVER_HUB - 0.04, y1 + 0.02],
        [0.1, y1 + 0.02],
        [0.1, y0 - 0.04],
      ],
      28,
    ),
  ];
  const ruby = [slab(o.stones.entry, [], y0 - 0.02, y1 + 0.02), slab(o.stones.exit, [], y0 - 0.02, y1 + 0.02)];
  return {
    body: toScene(merge(body)),
    stones: toScene(merge(ruby)),
    arbor: pivotedArbor(0.1, BRIDGE_UNDER, PLATE_BACK),
  };
}

/**
 * The two banking pins (fixed in the plate): the lever arm rests against them
 * at ±banking. Plan positions relative to the pallet pivot, mm.
 */
export function bankingPins(): P2[] {
  const r = FORK.bankingPinRadius;
  return [1, -1].map((side) => rotY(leverPt(FORK.bankingAt, side * (FORK.armHalf + r)), side * -BANKING_DEG));
}

// ---------------------------------------------------------------- balance

export interface BalanceGeometry {
  /** Glucydur rim, arms and hub. */
  wheel: BufferGeometry;
  /** Staff, rollers, collet (steel). */
  staff: BufferGeometry;
  /** Impulse pin (ruby). */
  pin: BufferGeometry;
}

/** Direction (rotY degrees) from the balance staff to the pallet pivot: the impulse pin points there at balance angle 0. */
export const PIN_DIRECTION = angleY([AXES.pallet[0] - AXES.balance[0], AXES.pallet[1] - AXES.balance[1]]);

/**
 * Balance in its own frame (staff at the origin, angle 0: impulse pin towards
 * the pallet pivot): a smooth Glucydur rim with three arms, the staff with the
 * impulse roller and pin, the safety roller with its crescent, the collet.
 */
export function buildBalance(): BalanceGeometry {
  const B = ESCAPEMENT.balance;
  const [y0, y1] = B.y;
  const ro = B.diameter / 2;
  const ri = ro - 0.32;
  const rim = latheY(
    roundCorners(
      [
        [ri, y0],
        [ro, y0],
        [ro, y1],
        [ri, y1],
        [ri, y0],
      ],
      [0.03, 0.04, 0.04, 0.03, 0],
      false,
      2,
    ),
    160,
  );
  const holes = crossingHoles(ri + 0.02, { arms: 3, rim: 0, hub: 0.55, arm: 0.36 });
  const spokes = slab(
    circle(ri + 0.05, [0, 0], 96),
    holes.concat([circle(0.16, [0, 0], 20).reverse()]),
    y0 + 0.07,
    y0 + 0.19,
  );
  spokes.rotateY((PIN_DIRECTION * Math.PI) / 180 + Math.PI / 6);
  const [ly0, ly1] = LEVER_Y;
  const [hy0, hy1] = HAIRSPRING.y;
  const staff = latheY(
    [
      [0, BRIDGE_UNDER - 0.25],
      [0.05, BRIDGE_UNDER - 0.25],
      [0.05, BRIDGE_UNDER + 0.05],
      [0.12, BRIDGE_UNDER + 0.15],
      [0.16, hy0 - 0.05],
      // collet (hairspring)
      [0.42, hy0 - 0.02],
      [0.42, hy1 + 0.02],
      [0.18, hy1 + 0.04],
      [0.18, y0 + 0.05],
      [0.22, y0 + 0.2],
      [0.18, y1 + 0.02],
      // impulse roller (table)
      [0.75, y1 + 0.03],
      [0.75, ly0 - 0.01],
      [0.2, ly0 - 0.005],
      [0.16, ly1 + 0.02],
      // safety roller is added below; staff down to the lower pivot
      [0.14, ly1 + 0.15],
      [0.1, PLATE_BACK - 0.08],
      [0.05, PLATE_BACK - 0.05],
      [0.05, PLATE_BACK + 0.25],
      [0, PLATE_BACK + 0.25],
    ],
    40,
  );
  // safety roller, its crescent facing the impulse pin
  const safety = slab(safetyRollerOutline(), [circle(0.12, [0, 0], 16).reverse()], ly1 + 0.03, ly1 + 0.11);
  safety.rotateY((PIN_DIRECTION * Math.PI) / 180);
  // impulse pin: from the roller table down into the fork's plane, short of the guard pin's level
  const pin = cylinderY(FORK.pinRadius, y1 + 0.03, ly1 - 0.04, 20, polarY(ESCAPEMENT.impulsePinRadius, PIN_DIRECTION));
  return { wheel: toScene(merge([rim, spokes])), staff: toScene(merge([staff, safety])), pin: toScene(pin) };
}

/**
 * Safety roller outline with its crescent on +X (angle 0): the roller's edge
 * the long way round, then the crescent's arc through the inside of the roller.
 */
export function safetyRollerOutline(): P2[] {
  const R = FORK.safetyRadius;
  const { radius: rc, centre: dc } = FORK.crescent;
  // half-angle, seen from the staff, at which the crescent's circle crosses the edge
  const A = Math.acos((R * R + dc * dc - rc * rc) / (2 * R * dc));
  const out: P2[] = [];
  for (let i = 0; i <= 56; i++) {
    const a = A + ((2 * Math.PI - 2 * A) * i) / 56;
    out.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  const b0 = Math.atan2(-R * Math.sin(A), R * Math.cos(A) - dc);
  const b1 = Math.atan2(R * Math.sin(A), R * Math.cos(A) - dc);
  const sweep = b0 - (b1 - 2 * Math.PI); // from b0 down to b1 through ±180° (towards the staff)
  for (let k = 1; k < 10; k++) {
    const b = b0 - (sweep * k) / 10;
    out.push([dc + rc * Math.cos(b), rc * Math.sin(b)]);
  }
  return out;
}

// ---------------------------------------------------------------- hairspring

/**
 * Centre line of the balance spring in the balance frame (staff at the
 * origin), for a balance angle θ (degrees, rotY sense): a flat Archimedean
 * spiral whose point at parameter s ∈ [0, 1] (inner → outer end) is turned by
 * θ·(1 − s). The inner end turns with the collet, the outer end stays in the
 * stud; the spiral stays Archimedean, only its pitch changes (it "breathes"),
 * by at most θ / total angle (≈ 6 % at 300°).
 */
export function hairspringPoints(thetaDeg: number, n = HAIRSPRING_SAMPLES): P2[] {
  const { turns, innerRadius: r0, outerRadius: r1 } = HAIRSPRING;
  const total = 360 * turns;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    const a = STUD_ANGLE - total * (1 - s) + thetaDeg * (1 - s);
    out.push(polarY(r0 + (r1 - r0) * s, a));
  }
  return out;
}

export const HAIRSPRING_SAMPLES = HAIRSPRING.turns * 72 + 1;

/** Angle (rotY) of the outer end, at the stud. */
export const STUD_ANGLE = clockToY(HAIRSPRING.studClockDeg);

/**
 * The balance spring as a flat ribbon whose vertices are rewritten every frame
 * (no new geometry): four faces per segment, flat-shaded per face.
 */
export class Hairspring {
  readonly geometry = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;

  constructor() {
    const n = HAIRSPRING_SAMPLES;
    // 4 faces × 2 vertices per sample
    this.pos = new Float32Array(n * 8 * 3);
    this.nor = new Float32Array(n * 8 * 3);
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (let f = 0; f < 4; f++) {
        const a = i * 8 + f * 2;
        const b = a + 1;
        const c = a + 8;
        const d = b + 8;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(this.nor, 3));
    this.geometry.setIndex(idx);
    this.update(0);
    this.geometry.computeBoundingSphere();
  }

  /** Rewrite the ribbon for a balance angle (degrees). */
  update(thetaDeg: number): void {
    const pts = hairspringPoints(thetaDeg);
    const [y0, y1] = HAIRSPRING.y;
    const h = HAIRSPRING.thickness / 2;
    const S = SCENE_PER_MM;
    const n = pts.length;
    const P = this.pos;
    const N = this.nor;
    const set = (k: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
      P[k * 3] = x * S;
      P[k * 3 + 1] = y * S;
      P[k * 3 + 2] = z * S;
      N[k * 3] = nx;
      N[k * 3 + 1] = ny;
      N[k * 3 + 2] = nz;
    };
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(n - 1, i + 1)]!;
      const tx = b[0] - a[0];
      const tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      // in-plane normal pointing away from the staff side of the blade
      let nx = -tz / l;
      let nz = tx / l;
      if (nx * p[0] + nz * p[1] < 0) {
        nx = -nx;
        nz = -nz;
      }
      const ox = p[0] + nx * h;
      const oz = p[1] + nz * h;
      const ix = p[0] - nx * h;
      const iz = p[1] - nz * h;
      const k = i * 8;
      // outer side, inner side, top (towards the dial), bottom; winding gives outward faces
      set(k, ox, y0, oz, nx, 0, nz);
      set(k + 1, ox, y1, oz, nx, 0, nz);
      set(k + 2, ix, y1, iz, -nx, 0, -nz);
      set(k + 3, ix, y0, iz, -nx, 0, -nz);
      set(k + 4, ox, y1, oz, 0, 1, 0);
      set(k + 5, ix, y1, iz, 0, 1, 0);
      set(k + 6, ix, y0, iz, 0, -1, 0);
      set(k + 7, ox, y0, oz, 0, -1, 0);
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('normal') as BufferAttribute).needsUpdate = true;
  }
}

/** Stud holding the spring's outer end (static, hangs from the cock), in the balance frame, scene units. */
export function studGeometry(): BufferGeometry {
  const p = polarY(HAIRSPRING.outerRadius + 0.1, STUD_ANGLE);
  return toScene(cylinderY(0.14, HAIRSPRING.y[0] - 0.03, BRIDGE_UNDER, 16, p));
}
