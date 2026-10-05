import { type BufferGeometry, CylinderGeometry } from 'three';
import { arcPts, extrudeAlongX, latheX, latheY, merge, type P2, roundCorners, shapeFrom } from '../../core/geometry/profile';
import { lobeOutline } from '../camProfile';
import { CAM_JOURNAL_X } from '../headLayout';
import { CYLINDER_X, SPECS } from '../specs';
import { lobeAngleDeg, type ValveKind } from '../timing';
import { CRANK_STATIONS } from './crankshaft';

const C = SPECS.cam;
const DEG = Math.PI / 180;

/** Axial stations of the camshaft (x). */
export const CAM_STATIONS = {
  noseEnd: CRANK_STATIONS.sprocketX - 8,
  /** Cam sprocket centre plane = crank sprocket plane (the chain runs in one plane). */
  sprocketX: CRANK_STATIONS.sprocketX,
  rearEnd: CAM_JOURNAL_X[CAM_JOURNAL_X.length - 1]! + C.journalWidth / 2 + 3,
} as const;

/**
 * Lobe outline as a shape in the (z, y) plane, nose pointing at angle λ
 * about X (direction (y, z) = (cos λ, sin λ)), cam centre at the origin.
 */
export function lobeShapePoints(lambdaDeg: number, segments = 360): P2[] {
  const l = lambdaDeg * DEG;
  const c = Math.cos(l);
  const s = Math.sin(l);
  // 2D lobe frame: u along the nose, v = +90° about X
  return lobeOutline(segments).map(([u, v]) => {
    const y = u * c - v * s;
    const z = u * s + v * c;
    return [z, y] as P2;
  });
}

export interface CamshaftGeometry {
  /** Ground lobes and journals. */
  machined: BufferGeometry;
  /** Cast shaft between them. */
  cast: BufferGeometry;
}

/** One camshaft in its own frame: axis = X through the origin. Lobes phased for `kind`. */
export function buildCamshaft(kind: ValveKind): CamshaftGeometry {
  const jr = C.journalDiameter / 2;
  const jw = C.journalWidth / 2;
  const sr = C.shaftDiameter / 2;
  const s = CAM_STATIONS;
  const machined: BufferGeometry[] = [];

  // shaft: nose (sprocket seat) → front journal → … → rear end
  const prof: P2[] = [
    [0, s.noseEnd],
    [9, s.noseEnd],
    [10, s.noseEnd + 1],
    [10, CAM_JOURNAL_X[0]! - jw - 3],
    [sr, CAM_JOURNAL_X[0]! - jw - 1],
    [sr, s.rearEnd - 1],
    [sr - 1, s.rearEnd],
    [0, s.rearEnd],
  ];
  const cast = latheX(prof, 48);

  for (const jx of CAM_JOURNAL_X) {
    machined.push(
      latheX(
        [
          [0, jx - jw],
          [jr - 0.5, jx - jw],
          [jr, jx - jw + 0.5],
          [jr, jx + jw - 0.5],
          [jr - 0.5, jx + jw],
          [0, jx + jw],
        ],
        64,
      ),
    );
  }

  const off = SPECS.piston.valvePocket.offsetX;
  const hw = C.lobeWidth / 2;
  CYLINDER_X.forEach((cx, i) => {
    const shape = shapeFrom(lobeShapePoints(lobeAngleDeg(kind, i), 144));
    for (const dx of [-off, off]) machined.push(extrudeAlongX(shape, cx + dx - hw, cx + dx + hw, 0.4, 1));
  });

  return { machined: merge(machined), cast };
}

export interface CamCapGeometry {
  cap: BufferGeometry;
  bolts: BufferGeometry;
}

/** One bearing cap, in the camshaft frame (origin = cam centre, parting plane y = 0), at journal x = 0. */
export function buildCamCap(): CamCapGeometry {
  const jr = C.journalDiameter / 2 + 0.05;
  const hw = 24;
  const shoulder = 11;
  const crown = 21;
  const outer: P2[] = [
    [-hw, 0],
    [-hw, shoulder],
    [-15, shoulder],
    [-12, crown],
    [12, crown],
    [15, shoulder],
    [hw, shoulder],
    [hw, 0],
  ];
  const rad = [0, 1.5, 3, 5, 5, 3, 1.5, 0];
  const bore = arcPts(0, 0, jr, 0, Math.PI, 40);
  const pts = [...roundCorners(outer, rad, false, 5), ...bore];
  const w = C.journalWidth / 2 - 0.2;
  const cap = extrudeAlongX(shapeFrom(pts), -w, w, 0.6, 12);

  const bolts: BufferGeometry[] = [];
  for (const zs of [-1, 1]) {
    const z = zs * 19.5;
    const washer = latheY(
      [
        [0, shoulder],
        [5.6, shoulder],
        [5.6, shoulder + 1.2],
        [0, shoulder + 1.2],
      ],
      24,
    );
    washer.translate(0, 0, z);
    const hexR = 5 / Math.cos(Math.PI / 6);
    const hex = new CylinderGeometry(hexR, hexR, 5, 6);
    hex.translate(0, shoulder + 1.2 + 2.5, z);
    bolts.push(washer, hex);
  }
  return { cap, bolts: merge(bolts) };
}
