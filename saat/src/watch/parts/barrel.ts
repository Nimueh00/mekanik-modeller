import type { BufferGeometry } from 'three';
import { latheY, type P2, roundCorners } from '../../core/geometry/profile';
import { SPRING_POINTS, springPolyline } from '../mainspring';
import { MOVEMENT, SPRING, TRAIN, WINDING_LEVELS } from '../specs';
import { toScene } from './common';
import { Ribbon } from './ribbon';
import { arbor, spokedWheel } from './wheels';

/**
 * Barrel, in parts: the drum with its toothed rim (one body), the cover that
 * snaps into the top of the drum wall (a separate part: off, the spring is
 * visible), the arbor, and the mainspring, whose ribbon is rewritten from the
 * state of wind.
 */

const PLATE_BACK = MOVEMENT.plate.y[0];
const BRIDGE_UNDER = MOVEMENT.envelope.bridges[1];

export interface BarrelGeometry {
  /** Drum with its bottom disc and wall. */
  drum: BufferGeometry;
  /** The rim of teeth, 100 at 0.1 mm, on the drum's outside. */
  teeth: BufferGeometry;
  cover: BufferGeometry;
  /** Arbor with the pivot that runs up through the barrel bridge to the ratchet. */
  arbor: BufferGeometry;
}

export function buildBarrelParts(): BarrelGeometry {
  const d = TRAIN.barrel.drum;
  const [yLow, yHigh] = d.y; // −2.85 (bridge side) … −1.52 (plate side)
  const r = d.radius;
  const bore = 0.62;
  // drum: bottom disc on the plate side and the wall, as one section (counter-clockwise in (r, y))
  const drum = latheY(
    roundCorners(
      [
        [bore, yHigh - 0.1],
        [r - 0.2, yHigh - 0.1],
        [r - 0.2, yLow + 0.07],
        [r, yLow + 0.07],
        [r, yHigh],
        [bore, yHigh],
        [bore, yHigh - 0.1],
      ],
      [0, 0, 0, 0.03, 0.04, 0, 0],
      false,
      2,
    ),
    96,
  );
  // cover snapped into the top of the wall, slightly domed, with its arbor hole
  const coverSection: P2[] = [
    [bore, yLow + 0.03],
    [r - 0.21, yLow + 0.07],
    [r - 0.21, yLow + 0.12],
    [r - 0.08, yLow + 0.12],
    [r - 0.04, yLow],
    [r - 0.3, yLow - 0.01],
    [bore + 0.3, yLow - 0.03],
    [bore, yLow - 0.02],
    [bore, yLow + 0.03],
  ];
  const cover = latheY(coverSection.reverse(), 96);
  const teeth = spokedWheel('barrelWheel', { arms: 0, rim: 0, hub: 0, arm: 0 }, r - 0.02);
  const ar = SPRING.coreRadius;
  const arb = arbor([
    [0.25, WINDING_LEVELS.l1[0] + 0.02], // square end in the ratchet's hub
    [0.25, BRIDGE_UNDER + 0.02],
    [ar, yLow - 0.05],
    [ar, yHigh + 0.05],
    [0.3, yHigh + 0.1],
    [0.3, PLATE_BACK + 0.3],
  ]);
  return { drum: toScene(drum), teeth, cover: toScene(cover), arbor: arb };
}

/** The mainspring: a ribbon in the drum's frame whose coils move from the wall to the arbor as it is wound. */
export class MainspringMesh {
  readonly ribbon = new Ribbon(SPRING_POINTS, SPRING.y, SPRING.thickness);
  private readonly points = new Float64Array(2 * SPRING_POINTS);
  private last = Number.NaN;

  constructor() {
    this.update(0);
  }

  get geometry(): BufferGeometry {
    return this.ribbon.geometry;
  }

  /** Redraw for a state of wind; skips the work when the wind has not changed noticeably. */
  update(windTurns: number): void {
    if (Math.abs(windTurns - this.last) < 1e-5) return;
    this.last = windTurns;
    springPolyline(windTurns, this.points);
    this.ribbon.update(this.points);
  }
}
