import { BoxGeometry, type BufferGeometry, CylinderGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { subtract, union } from '../../core/geometry/csg';
import { latheY, merge } from '../../core/geometry/profile';
import { CAM_JOURNAL_X, HEAD_TOP_Y } from '../headLayout';
import { CYLINDER_X, SPECS } from '../specs';

export const VALVE_COVER = {
  halfLength: SPECS.head.halfLength - 2,
  halfWidth: SPECS.head.topHalfWidth,
  height: 42,
  wall: 3.5,
  plugHoleRadius: 12.6,
} as const;

export interface ValveCoverGeometry {
  cover: BufferGeometry;
  hardware: BufferGeometry;
  filler: BufferGeometry;
}

/** Cam (valve) cover: wrinkle-black cast shell with plug-well tubes, centre bolts and an oil filler cap. */
export function buildValveCover(): ValveCoverGeometry {
  const V = VALVE_COVER;
  const y0 = HEAD_TOP_Y;
  const H = V.height;
  const outer = new RoundedBoxGeometry(2 * V.halfLength, H + 20, 2 * V.halfWidth, 6, 14);
  outer.translate(0, y0 + (H - 20) / 2, 0);
  const inner = new RoundedBoxGeometry(2 * (V.halfLength - V.wall), H + 20, 2 * (V.halfWidth - V.wall), 6, 14 - V.wall);
  inner.translate(0, y0 + (H - 20) / 2 - V.wall, 0);
  const below = new BoxGeometry(3 * V.halfLength, 100, 3 * V.halfWidth);
  below.translate(0, y0 - 50, 0);
  let shell = subtract(outer, [inner]);
  shell = subtract(shell, [below]);

  // Flange lip, longitudinal stiffening ribs and plug-well towers.
  const lip = new RoundedBoxGeometry(2 * V.halfLength + 4, 6, 2 * V.halfWidth + 4, 2, 2);
  lip.translate(0, y0 + 3, 0);
  const lipHole = new BoxGeometry(2 * (V.halfLength - V.wall), 10, 2 * (V.halfWidth - V.wall));
  lipHole.translate(0, y0 + 3, 0);
  const flange = subtract(lip, [lipHole]);
  const adds: BufferGeometry[] = [flange];
  for (const zs of [-1, 1]) {
    const rib = new RoundedBoxGeometry(2 * V.halfLength - 40, 5, 6, 2, 2);
    rib.translate(0, y0 + H + 1.5, zs * 48);
    adds.push(rib);
  }
  for (const cx of CYLINDER_X) {
    const tower = latheY(
      [
        [V.plugHoleRadius, y0 + 1],
        [V.plugHoleRadius + 3, y0 + 1],
        [V.plugHoleRadius + 3, y0 + H - 2],
        [V.plugHoleRadius + 6, y0 + H + 1],
        [V.plugHoleRadius + 6, y0 + H + 3],
        [V.plugHoleRadius, y0 + H + 3],
        [V.plugHoleRadius, y0 + 1],
      ],
      48,
    );
    tower.translate(cx, 0, 0);
    adds.push(tower);
  }
  shell = union(shell, [merge(adds)]);
  const holes = CYLINDER_X.map((cx) => {
    const h = new CylinderGeometry(V.plugHoleRadius, V.plugHoleRadius, H + 20, 40);
    h.translate(cx, y0 + H / 2, 0);
    return h;
  });
  shell = subtract(shell, [merge(holes)], 35);

  // Centre-line bolts with rubber-isolated washers, between the plug wells.
  const hw: BufferGeometry[] = [];
  for (const x of CAM_JOURNAL_X) {
    const washer = latheY(
      [
        [0, y0 + H],
        [9, y0 + H],
        [9, y0 + H + 2.5],
        [0, y0 + H + 2.5],
      ],
      28,
    );
    washer.translate(x, 0, 0);
    const hexR = 6 / Math.cos(Math.PI / 6);
    const hex = new CylinderGeometry(hexR, hexR, 6, 6);
    hex.translate(x, y0 + H + 5.5, 0);
    hw.push(washer, hex);
  }
  const filler = latheY(
    [
      [0, y0 + H],
      [16, y0 + H],
      [17, y0 + H + 2],
      [17, y0 + H + 9],
      [15.5, y0 + H + 10.5],
      [0, y0 + H + 10.5],
    ],
    48,
  );
  const grip = new BoxGeometry(24, 7, 6);
  grip.translate(0, y0 + H + 13, 0);
  const fillerG = merge([filler, grip]);
  fillerG.translate(CYLINDER_X[2]! + 44, 0, -71);

  return { cover: shell, hardware: merge(hw), filler: fillerG };
}
