import type { BufferGeometry } from 'three';
import type { P2 } from '../../core/geometry/profile';
import { AXES, type AxisName, DATE, MOTION_WORKS, MOVEMENT, PLATE_RADIUS, SCENE_PER_MM, towardsClock } from '../specs';
import { bankingPins, studGeometry } from './escapement';
import { circle, cylinderY, jewel, merge, screwHead, slab, smoothClosed, strokeOutline, toScene } from './common';

/**
 * Main plate and bridges (plan outlines in mm, movement frame). Bridges lie in
 * MOVEMENT.envelope.bridges and stand on pillars that reach down to the plate
 * outside every wheel; each pivot sits in a jewel in a polished sink.
 */

const [BRIDGE_UNDER, BRIDGE_TOP] = [MOVEMENT.envelope.bridges[1], MOVEMENT.envelope.bridges[0]]; // −3.3, −3.7
const PLATE_BACK = MOVEMENT.plate.y[0];
const PLATE_DIAL = MOVEMENT.plate.y[1];

const at = (a: AxisName): P2 => AXES[a];
/** Pillar / screw positions near the plate's edge, by clock position. */
const edge = (clockDeg: number, r = PLATE_RADIUS - 1.25): P2 => towardsClock([0, 0], r, clockDeg);

export interface BridgeDef {
  outline: P2[];
  /** Pillars down to the plate (also the screw positions). */
  posts: P2[];
  /** Jewelled pivots (arbor positions). */
  jewels: P2[];
  /** Plain bushed pivots. */
  bushes?: P2[];
}

const PILLAR_RADIUS = 0.6;

/**
 * Bridge outlines, drawn as smooth curves through hand-placed points (plan as
 * seen from the dial: +X towards 3 o'clock, −Z towards 12). The barrel bridge
 * spans the barrel between two pillars and leaves a waist round the centre;
 * the train bridge carries the centre (fourth), third and escape pivots along
 * a wavy arm; the pallet bridge is a small cock of its own; the balance cock
 * reaches over the balance from a foot near the edge.
 */
export const BRIDGES: Record<'barrel' | 'train' | 'pallet' | 'cock', BridgeDef> = (() => {
  const barrel: BridgeDef = {
    outline: smoothClosed([
      [-2.4, 0.3],
      [-1.2, -1.6],
      [0.6, -2.4],
      [2.2, -3.4],
      [2.6, -6.0],
      [3.4, -8.9],
      [4.6, -10.2],
      [4.4, -11.4],
      [3.1, -11.7],
      [0.5, -10.7],
      [-3.0, -10.15],
      [-6.2, -9.0],
      [-8.4, -7.6],
      [-10.2, -6.9],
      [-10.8, -5.6],
      [-10.1, -4.6],
      [-8.0, -3.0],
      [-6.0, -0.6],
      [-4.0, 0.5],
    ]),
    posts: [edge(300), edge(20)],
    jewels: [],
    bushes: [at('barrel')],
  };
  const trainPosts: P2[] = [
    [-5.6, 1.0],
    [6.4, -1.2],
  ];
  const train: BridgeDef = {
    outline: smoothClosed([
      [-6.45, 0.75],
      [-5.9, 0.15],
      [-4.4, 0.95],
      [-2.9, 1.55],
      [-1.8, 1.0],
      [-1.0, -0.55],
      [0.1, -1.05],
      [1.15, -0.6],
      [2.1, 0.55],
      [3.4, 0.95],
      [4.8, 0.15],
      [6.0, -1.95],
      [7.1, -1.6],
      [6.9, -0.6],
      [4.8, 2.1],
      [3.4, 2.95],
      [2.0, 2.4],
      [1.0, 1.15],
      [-0.2, 1.05],
      [-1.0, 2.6],
      [-2.2, 3.75],
      [-3.5, 3.3],
      [-5.0, 1.95],
      [-6.15, 1.65],
    ]),
    posts: trainPosts,
    jewels: [at('escape'), at('centre'), at('third')],
  };
  const palletPost: P2 = [-4.2, 4.8];
  const pallet: BridgeDef = {
    outline: strokeOutline([at('pallet'), [-2.4, 4.85], palletPost], [1.5, 1.15, 1.45]),
    posts: [palletPost],
    jewels: [at('pallet')],
  };
  const foot: P2 = [9.0, 7.0];
  const b = at('balance');
  const cock: BridgeDef = {
    outline: strokeOutline([foot, [(foot[0] + b[0]) / 2 + 0.3, (foot[1] + b[1]) / 2 + 0.25], b], [2.3, 1.5, 2.7]),
    posts: [foot],
    jewels: [b],
  };
  return { barrel, train, pallet, cock };
})();

export interface FrameGeometry {
  /** Rhodium-plated brass. */
  rhodium: BufferGeometry;
  /** Ruby jewels. */
  ruby: BufferGeometry | null;
  /** Steel details (bushes, studs, pins). */
  steel: BufferGeometry | null;
}

const mergedOrNull = (gs: BufferGeometry[]) => (gs.length ? toScene(merge(gs)) : null);

/** One bridge with its pillars, jewels and sinks (screws are a separate part). */
export function buildBridge(def: BridgeDef): FrameGeometry {
  const body: BufferGeometry[] = [slab(def.outline, [], BRIDGE_TOP, BRIDGE_UNDER, 0.05)];
  // pillars reach into the plate and the bridge so that no end face lies in a visible surface
  for (const p of def.posts) body.push(cylinderY(PILLAR_RADIUS, PLATE_BACK + 0.1, BRIDGE_UNDER - 0.05, 28, p));
  const ruby: BufferGeometry[] = [];
  for (const j of def.jewels) {
    const g = jewel(j, BRIDGE_TOP, -1);
    body.push(g.sink);
    ruby.push(g.ruby);
  }
  const steel: BufferGeometry[] = [];
  for (const p of def.bushes ?? []) steel.push(cylinderY(0.45, BRIDGE_TOP - 0.03, BRIDGE_UNDER, 28, p));
  return { rhodium: toScene(merge(body)), ruby: mergedOrNull(ruby), steel: mergedOrNull(steel) };
}

/** Balance cock: bridge plus the stud carrier holding the spring's outer end. */
export function buildCock(): FrameGeometry {
  const g = buildBridge(BRIDGES.cock);
  const stud = studGeometry();
  stud.translate(AXES.balance[0] * SCENE_PER_MM, 0, AXES.balance[1] * SCENE_PER_MM);
  g.steel = stud;
  return g;
}

/** Blued screws on every bridge pillar, as one part (heads and slots). */
export function buildScrews(): { heads: BufferGeometry; slots: BufferGeometry } {
  const heads: BufferGeometry[] = [];
  const slots: BufferGeometry[] = [];
  let k = 0;
  for (const def of Object.values(BRIDGES)) {
    for (const p of def.posts) {
      const s = screwHead(p, BRIDGE_TOP, -1, 0.55, 0.17, 25 + 47 * k++);
      heads.push(s.head);
      slots.push(s.slot);
    }
  }
  return { heads: toScene(merge(heads)), slots: toScene(merge(slots)) };
}

/**
 * Main plate: Ø 25.6 mm disc with the pivot holes, the dial-side jewels, the
 * studs the minute wheel and date driver turn on, and the banking pins.
 */
export function buildPlate(): FrameGeometry {
  const holes: P2[][] = [];
  const hole = (p: P2, r: number) => holes.push(circle(r, p, 24).reverse());
  hole(at('centre'), 0.3);
  hole(at('barrel'), 0.32);
  for (const a of ['third', 'escape', 'pallet', 'balance'] as const) hole(at(a), 0.12);
  const disc = slab(circle(PLATE_RADIUS, [0, 0], 256), holes, PLATE_BACK, PLATE_DIAL, 0.06);
  const body: BufferGeometry[] = [disc];
  const ruby: BufferGeometry[] = [];
  for (const a of ['third', 'escape', 'pallet', 'balance'] as const) {
    const j = jewel(at(a), PLATE_DIAL, 1);
    body.push(j.sink);
    ruby.push(j.ruby);
  }
  const steel: BufferGeometry[] = [
    // minute wheel and date driver studs (dial side)
    cylinderY(0.2, PLATE_DIAL, MOTION_WORKS.minutePinion.y[1] + 0.04, 20, at('minute')),
    cylinderY(0.2, PLATE_DIAL, DATE.driver.y[1] + 0.16, 20, at('dateDriver')),
    // banking pins (bridge side), from the plate up through the lever's plane
    ...bankingPins().map((p) => cylinderY(0.08, -2.42, PLATE_BACK, 16, [AXES.pallet[0] + p[0], AXES.pallet[1] + p[1]])),
  ];
  return { rhodium: toScene(merge(body)), ruby: mergedOrNull(ruby), steel: mergedOrNull(steel) };
}

/** Every pillar position (for clearance checks). */
export function pillars(): { at: P2; r: number }[] {
  return Object.values(BRIDGES).flatMap((d) => d.posts.map((p) => ({ at: p, r: PILLAR_RADIUS })));
}
