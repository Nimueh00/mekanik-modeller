import { Vector3 } from 'three';
import { BASE_RADIUS, LASH } from './camProfile';
import { valvePockets } from './parts/piston';
import { CYLINDER_X, PIN_Y_TDC, SPECS } from './specs';
import { VALVE_TILT_DEG, type ValveKind } from './timing';

/*
 * Cylinder-head layout, derived from the piston's valve pockets (phase-1
 * decision 10: the valve axes coincide with the pocket axes).
 *
 * Every valve has an axis line with unit direction d (pointing up, away
 * from the chamber) and a station coordinate s along it, measured from the
 * closed valve's face (s = 0). Everything stacked on the valve — guide,
 * spring, retainer, bucket, cam centre — is placed at fixed stations.
 */

const DEG = Math.PI / 180;
const VT = SPECS.valveTrain;
const H = SPECS.head;

/** Head bottom face. */
export const HEAD_FACE_Y = SPECS.block.deckHeight + H.gasketThickness;

export interface ValveAxis {
  kind: ValveKind;
  cylinder: number; // 0-based
  /** −1 front (towards the chain), +1 rear. */
  side: -1 | 1;
  /** Closed valve face centre. */
  face: Vector3;
  /** Unit axis direction, up. */
  dir: Vector3;
  tiltRad: number;
  diameter: number;
}

export function axisDir(kind: ValveKind): Vector3 {
  const a = VALVE_TILT_DEG[kind] * DEG;
  return new Vector3(0, Math.cos(a), Math.sin(a));
}

/** Point at station s on a valve axis. */
export function stationPoint(v: ValveAxis, s: number): Vector3 {
  return v.face.clone().addScaledVector(v.dir, s);
}

/** All 16 valve axes, ordered cylinder → intake (front, rear) → exhaust (front, rear). */
export const VALVES: readonly ValveAxis[] = (() => {
  const out: ValveAxis[] = [];
  const pockets = valvePockets();
  CYLINDER_X.forEach((cx, cylinder) => {
    for (const kind of ['intake', 'exhaust'] as const) {
      for (const p of pockets.filter((q) => q.kind === kind).sort((a, b) => a.floor.x - b.floor.x)) {
        const dir = axisDir(kind);
        // pocket floor centre with the piston at TDC, in world space
        const floor = new Vector3(cx + p.floor.x, PIN_Y_TDC + p.floor.y, p.floor.z);
        const face = floor.addScaledVector(dir, H.pocketToFace);
        out.push({
          kind,
          cylinder,
          side: p.floor.x < 0 ? -1 : 1,
          face,
          dir,
          tiltRad: p.tiltRad,
          diameter: kind === 'intake' ? VT.intakeValveDiameter : VT.exhaustValveDiameter,
        });
      }
    }
  });
  return out;
})();

/** Valve-axis stations (mm from the closed valve face). */
export const STATION = {
  tip: VT.valve.length,
  bucketTop: VT.valve.length + VT.bucket.topThickness,
  bucketBottom: VT.valve.length + VT.bucket.topThickness - VT.bucket.height,
  /** Cam centre: bucket top + lash + base-circle radius. */
  cam: VT.valve.length + VT.bucket.topThickness + LASH + BASE_RADIUS,
} as const;

/** The pent-roof plane of each side passes through the valve faces, normal to the valve axis. */
export function roofHeight(kind: ValveKind, z: number): number {
  const v = VALVES.find((q) => q.kind === kind)!;
  // d·(p − face) = 0 → dy·(y − fy) + dz·(z − fz) = 0
  return v.face.y - (v.dir.z * (z - v.face.z)) / v.dir.y;
}

/** Ceiling of the combustion chamber above (x, z) relative to a bore axis (pent roof, clipped to the head face). */
export function chamberCeiling(z: number): number {
  return Math.max(HEAD_FACE_Y, Math.min(roofHeight('intake', z), roofHeight('exhaust', z)));
}

/** z where each roof plane meets the head face (edge of the squish band). */
export const SQUISH_EDGE_Z = (() => {
  const v = VALVES.find((q) => q.kind === 'exhaust')!;
  // roofHeight = HEAD_FACE_Y
  return v.face.z + ((v.face.y - HEAD_FACE_Y) * v.dir.y) / v.dir.z;
})();

export const RIDGE_Y = roofHeight('intake', 0);

/** Camshaft centre lines (y, z); x runs along the engine. */
export const CAM_CENTRE: Record<ValveKind, { y: number; z: number }> = (() => {
  const c = (kind: ValveKind) => {
    const v = VALVES.find((q) => q.kind === kind)!;
    const p = stationPoint(v, STATION.cam);
    return { y: p.y, z: p.z };
  };
  return { intake: c('intake'), exhaust: c('exhaust') };
})();

/** Head top (cam-cap parting plane) — at the camshaft centre line. */
export const HEAD_TOP_Y = CAM_CENTRE.intake.y;

/** Camshaft journal stations along X: between the cylinders and at both ends. */
export const CAM_JOURNAL_X: readonly number[] = Array.from(
  { length: SPECS.cylinders + 1 },
  (_, i) => (i - SPECS.cylinders / 2) * SPECS.cylinderSpacing,
);

/** Head bolt positions (x, z): between the cylinders, inboard of the cam journals. */
export const HEAD_BOLTS: readonly { x: number; z: number }[] = CAM_JOURNAL_X.flatMap((x) => [
  { x, z: -H.bolt.z },
  { x, z: H.bolt.z },
]);
