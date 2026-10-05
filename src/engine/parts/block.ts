import { BoxGeometry, type BufferGeometry, CylinderGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { subtract, union } from '../../core/geometry/csg';
import {
  arcPts,
  extrudeAlongX,
  extrudeAlongY,
  latheX,
  latheY,
  merge,
  mirrorHalf,
  type P2,
  roundCorners,
  shapeFrom,
} from '../../core/geometry/profile';
import { CYLINDER_X, MAIN_X, SPECS } from '../specs';
import { CRANK_STATIONS } from './crankshaft';

const B = SPECS.block;
const MC = SPECS.mainCap;
const OP = SPECS.oilPan;
const DEG = Math.PI / 180;

/** A static part that can be shown whole or cut open along z = 0 (cutaway). */
export interface Sectioned {
  full: BufferGeometry;
  cut: BufferGeometry;
}

/** Removes the +Z half (the side facing the default camera). */
export function sectionCut(g: BufferGeometry, creaseDeg = 35): BufferGeometry {
  const big = 2000;
  const box = new BoxGeometry(big, big, big);
  box.translate(0, 0, big / 2);
  return subtract(g, [box], creaseDeg);
}

const sectioned = (full: BufferGeometry): Sectioned => ({ full, cut: sectionCut(full) });

export const LINER_INNER_R = SPECS.bore / 2;
export const LINER_OUTER_R = SPECS.bore / 2 + B.linerThickness;
const MAIN_BORE_R = SPECS.crank.mainJournalDiameter / 2 + B.mainBoreClearance;

/** Outer (z, y) half-width profile of the block, right half. */
function blockOutline(): { pts: P2[]; radii: number[] } {
  const right: P2[] = [
    [0, B.skirtBottom],
    [B.skirtHalfWidth + 6, B.skirtBottom],
    [B.skirtHalfWidth + 6, B.skirtBottom + 9],
    [B.skirtHalfWidth, B.skirtBottom + 15],
    [B.skirtHalfWidth, B.flareBottom],
    [B.deckHalfWidth, B.flareTop],
    [B.deckHalfWidth, B.deckHeight],
    [0, B.deckHeight],
  ];
  const r = [0, -1, -1, 4, 18, 18, -1.5, 0];
  const pts = mirrorHalf(right);
  const radii = [...r, ...[...r].reverse().slice(1)];
  radii.length = pts.length;
  return { pts, radii };
}

export interface BlockGeometry {
  block: Sectioned;
  liner: Sectioned;
  upperShells: Sectioned;
}

export function buildBlock(): BlockGeometry {
  const L = B.halfLength;
  const o = blockOutline();
  let block = extrudeAlongX(shapeFrom(roundCorners(o.pts, o.radii, true, 8)), -L, L, 2, 16);

  // External bulkhead ribs on the crankcase walls.
  const ribs: BufferGeometry[] = [];
  const rib = shapeFrom(
    roundCorners(
      [
        [B.skirtHalfWidth - 4, B.skirtBottom + 15],
        [B.skirtHalfWidth + 4, B.skirtBottom + 15],
        [B.skirtHalfWidth + 4, B.flareBottom + 2],
        [B.deckHalfWidth + 4, B.flareTop + 14],
        [B.deckHalfWidth - 4, B.flareTop + 14],
        [B.deckHalfWidth - 4, B.flareTop],
        [B.skirtHalfWidth - 4, B.flareBottom],
      ],
      [0, 2, 10, 2, 0, 0, 0],
      true,
      4,
    ),
  );
  const ribL = shapeFrom(
    roundCorners(
      [
        [-(B.skirtHalfWidth - 4), B.skirtBottom + 15],
        [-(B.skirtHalfWidth - 4), B.flareBottom],
        [-(B.deckHalfWidth - 4), B.flareTop],
        [-(B.deckHalfWidth - 4), B.flareTop + 14],
        [-(B.deckHalfWidth + 4), B.flareTop + 14],
        [-(B.skirtHalfWidth + 4), B.flareBottom + 2],
        [-(B.skirtHalfWidth + 4), B.skirtBottom + 15],
      ],
      [0, 0, 0, 0, 2, 10, 2],
      true,
      4,
    ),
  );
  for (const mx of MAIN_X.slice(1, -1)) {
    ribs.push(extrudeAlongX(rib, mx - 4, mx + 4, 1, 8), extrudeAlongX(ribL, mx - 4, mx + 4, 1, 8));
  }
  block = union(block, ribs);

  // Cutters are grouped so each group is a set of disjoint solids that can be
  // merged into one brush (one CSG pass per group instead of one per solid).
  const bays: BufferGeometry[] = [];
  const bores: BufferGeometry[] = [];
  // Crankcase bays between the main bulkheads.
  const cav = shapeFrom(
    roundCorners(
      [
        [-B.crankcaseCavityHalfWidth, B.skirtBottom - 5],
        [B.crankcaseCavityHalfWidth, B.skirtBottom - 5],
        [B.crankcaseCavityHalfWidth, 40],
        [55, B.crankcaseCavityTop],
        [-55, B.crankcaseCavityTop],
        [-B.crankcaseCavityHalfWidth, 40],
      ],
      [0, 0, 14, 10, 10, 14],
      true,
      6,
    ),
  );
  for (let i = 0; i < MAIN_X.length - 1; i++) {
    bays.push(extrudeAlongX(cav, MAIN_X[i]! + B.bulkheadWidth / 2, MAIN_X[i + 1]! - B.bulkheadWidth / 2, 0, 16));
  }
  // Main-cap seats below the crank centreline, and the main bearing bore.
  const seat = new BoxGeometry(2 * L - 2 * 10, -B.skirtBottom + 2, 2 * MC.halfWidth + 0.4);
  seat.translate(0, B.skirtBottom / 2 - 1, 0);
  const bore = new CylinderGeometry(MAIN_BORE_R, MAIN_BORE_R, 2 * L + 10, 72);
  bore.rotateZ(Math.PI / 2);
  // Rear crank-seal bore.
  const seal = new CylinderGeometry(38, 38, 30, 64);
  seal.rotateZ(Math.PI / 2);
  seal.translate(CRANK_STATIONS.rear + 15, 0, 0);
  // Cylinder bores (liner seats).
  for (const cx of CYLINDER_X) {
    const c = new CylinderGeometry(LINER_OUTER_R, LINER_OUTER_R, B.deckHeight - 60 + 10, 96);
    c.translate(cx, (B.deckHeight + 60) / 2 + 5, 0);
    bores.push(c);
  }
  // Closed-deck water jacket around the siamesed bores, with transfer holes in the deck.
  const jacket = waterJacket();
  const wj = B.waterJacket;
  const holeZ = (wj.innerRadius + wj.outerOffset) / 2;
  for (const cx of CYLINDER_X) {
    for (const zs of [-1, 1]) {
      for (const dx of [-14, 14]) {
        const h = new CylinderGeometry(3, 3, B.deckHeight - wj.top + 4, 20);
        h.translate(cx + dx, (B.deckHeight + wj.top) / 2, zs * Math.sqrt(holeZ * holeZ - dx * dx));
        bores.push(h);
      }
    }
  }
  block = subtract(block, [merge(bays), seat, bore, seal, merge(bores), jacket], 35);

  // Cylinder liner (one, instanced at each bore by the caller).
  const linerProfile: P2[] = [
    [LINER_OUTER_R, B.linerBottom],
    [LINER_OUTER_R, B.deckHeight],
    [LINER_INNER_R + 0.6, B.deckHeight],
    [LINER_INNER_R, B.deckHeight - 0.6],
    [LINER_INNER_R, B.linerBottom + 2],
    [LINER_INNER_R + 1.2, B.linerBottom],
    [LINER_OUTER_R, B.linerBottom],
  ];
  const lin = latheY(linerProfile, 128);

  // Upper main-bearing shells (in the block), all five merged.
  const shells: BufferGeometry[] = [];
  for (const mx of MAIN_X) shells.push(halfShell(mx, true));

  return {
    block: sectioned(block),
    liner: sectioned(lin),
    upperShells: sectioned(merge(shells)),
  };
}

function waterJacket(): BufferGeometry {
  const wj = B.waterJacket;
  const x0 = CYLINDER_X[0]! - wj.outerOffset;
  const x1 = CYLINDER_X[CYLINDER_X.length - 1]! + wj.outerOffset;
  const r = wj.outerOffset;
  const stadium: P2[] = [
    ...arcPts(x1 - r, 0, r, -90 * DEG, 90 * DEG, 24),
    ...arcPts(x0 + r, 0, r, 90 * DEG, 270 * DEG, 24),
  ];
  const outer = extrudeAlongY(shapeFrom(stadium), wj.bottom, wj.top, 3, 16);
  const cores = CYLINDER_X.map((cx) => {
    const c = new CylinderGeometry(wj.innerRadius, wj.innerRadius, wj.top - wj.bottom + 20, 96);
    c.translate(cx, (wj.top + wj.bottom) / 2, 0);
    return c;
  });
  return subtract(outer, cores);
}

/** Half of a main bearing shell at axial station `x`. */
function halfShell(x: number, upper: boolean): BufferGeometry {
  const ri = SPECS.crank.mainJournalDiameter / 2 + 0.03;
  const ro = MAIN_BORE_R - 0.02;
  const hw = B.bulkheadWidth / 2 - 0.4;
  const g = latheX(
    [
      [ri, -hw],
      [ro, -hw],
      [ro, hw],
      [ri, hw],
      [ri, -hw],
    ],
    64,
  );
  g.translate(x, 0, 0);
  const box = new BoxGeometry(60, 60, 80);
  box.translate(x, upper ? -30 : 30, 0);
  return subtract(g, [box]);
}

// ---------------------------------------------------------------- main caps

export interface MainCapGeometry {
  cap: Sectioned;
  hardware: Sectioned;
}

/** One main bearing cap at x = 0 (the caller positions each of the five). */
export function buildMainCap(): MainCapGeometry {
  const hw = MC.halfWidth;
  const right: P2[] = [
    [MAIN_BORE_R, 0],
    [hw, 0],
    [hw, -27],
    [31, -27],
    [24, -MC.depth],
    [0, -MC.depth],
  ];
  const r = [0, -1, 2.5, 3, 6, 0];
  // Build the closed outline: right outer edge, mirrored left edge, then the bore arc on top.
  const left = [...right].reverse().map(([z, y]) => [-z, y] as P2);
  const leftR = [...r].reverse();
  const pts: P2[] = [...right, ...left.slice(1)];
  const rad: number[] = [...r, ...leftR.slice(1)];
  // pts ends at (−MAIN_BORE_R, 0); close with the bore arc cut down into the cap (through y = −R).
  const borePts = arcPts(0, 0, MAIN_BORE_R, Math.PI, 2 * Math.PI, 36).slice(1, -1);
  const all = [...pts, ...borePts];
  const allR = [...rad, ...borePts.map(() => 0)];
  const w = MC.width / 2;
  const cap = extrudeAlongX(shapeFrom(roundCorners(all, allR, true, 6)), -w, w, 1, 16);

  const hw2: BufferGeometry[] = [halfShell(0, false)];
  for (const zs of [-1, 1]) {
    const z = zs * MC.boltOffset;
    const head = new CylinderGeometry(MC.boltHeadDiameter / 2 / Math.cos(Math.PI / 6), MC.boltHeadDiameter / 2 / Math.cos(Math.PI / 6), MC.boltHeadHeight, 6);
    head.translate(0, -27 - MC.boltHeadHeight / 2 - 1.2, z);
    const washer = new CylinderGeometry(MC.boltHeadDiameter / 2 + 1.5, MC.boltHeadDiameter / 2 + 1.5, 1.2, 32);
    washer.translate(0, -27 - 0.6, z);
    hw2.push(head, washer);
  }
  return { cap: sectioned(cap), hardware: sectioned(merge(hw2)) };
}

// ---------------------------------------------------------------- oil pan

export function buildOilPan(): Sectioned {
  const L = B.halfLength - 4;
  const W = B.skirtHalfWidth + 2;
  const top = OP.railY;
  const wall = OP.wall;
  const depth = top - OP.shallowBottom;
  const outerMain = new RoundedBoxGeometry(2 * L, depth + 20, 2 * W, 4, 14);
  outerMain.translate(0, top - (depth + 20) / 2 + 20, 0);
  const sumpL = B.halfLength - 10 - OP.sumpStartX;
  const sumpDepth = top - OP.sumpBottom;
  const outerSump = new RoundedBoxGeometry(sumpL, sumpDepth + 20, 2 * (W - 20), 4, 14);
  outerSump.translate(OP.sumpStartX + sumpL / 2, top - (sumpDepth + 20) / 2 + 20, 0);
  let solid = union(outerMain, [outerSump]);

  const innerMain = new RoundedBoxGeometry(2 * (L - wall), depth + 20, 2 * (W - wall), 4, 14 - wall);
  innerMain.translate(0, top - (depth + 20) / 2 + 20 + wall, 0);
  const innerSump = new RoundedBoxGeometry(sumpL - 2 * wall, sumpDepth + 20, 2 * (W - 20 - wall), 4, 14 - wall);
  innerSump.translate(OP.sumpStartX + sumpL / 2, top - (sumpDepth + 20) / 2 + 20 + wall, 0);
  const lid = new BoxGeometry(3 * L, 200, 3 * W);
  lid.translate(0, top + 100, 0);
  solid = subtract(solid, [innerMain, innerSump, lid]);

  // Mounting flange matching the block's pan rail.
  const fw = B.skirtHalfWidth + 6;
  const flangeOuter = new RoundedBoxGeometry(2 * (B.halfLength - 1), OP.flangeThickness, 2 * fw, 2, 1.5);
  flangeOuter.translate(0, top - OP.flangeThickness / 2, 0);
  const flangeHole = new RoundedBoxGeometry(2 * (L - wall), OP.flangeThickness + 4, 2 * (W - wall), 2, 1);
  flangeHole.translate(0, top - OP.flangeThickness / 2, 0);
  const flange = subtract(flangeOuter, [flangeHole]);

  // Drain plug on the sump's rear wall.
  const plugX = B.halfLength - 10 - wall;
  const boss = new CylinderGeometry(11, 11, 6, 32);
  boss.rotateZ(Math.PI / 2);
  boss.translate(plugX + 3, OP.sumpBottom + 22, 0);
  const plug = new CylinderGeometry(9.2, 9.2, 7, 6);
  plug.rotateZ(Math.PI / 2);
  plug.translate(plugX + 9.5, OP.sumpBottom + 22, 0);

  return sectioned(union(solid, [flange, boss, plug], 35));
}
