import { type BufferGeometry, CylinderGeometry } from 'three';
import { involuteGearOutline } from '../../core/geometry/gear';
import { circlePts, extrudeAlongX, latheX, merge, type P2, roundCorners, shapeFrom } from '../../core/geometry/profile';
import { SPECS } from '../specs';
import { CRANK_STATIONS } from './crankshaft';

const F = SPECS.flywheel;

export interface FlywheelGeometry {
  body: BufferGeometry;
  frictionFace: BufferGeometry;
  ringGear: BufferGeometry;
  bolts: BufferGeometry;
}

/** Flywheel in the crank frame (it is bolted to the crank flange and turns with it). */
export function buildFlywheel(): FlywheelGeometry {
  const x0 = CRANK_STATIONS.flangeFace;
  const x1 = x0 + F.thickness;
  const rimR = F.outerRadius - 8; // ring gear is shrunk onto this seat
  const hubR = F.hubRadius;
  const pilot = SPECS.crank.flange.pilotDiameter / 2 + 1;
  const hubRear = x1 - 6;
  const dishX = x0 + F.dishDepth;
  const faceInner = 72;

  // Section polygon (radius, x); walking with solid on the left gives outward normals.
  const sec: P2[] = [
    [pilot, x0],
    [hubR + 6, x0],
    [hubR + 14, dishX],
    [rimR - 18, dishX],
    [rimR - 10, x0],
    [rimR, x0],
    [rimR, x1 - 0.6],
    [faceInner, x1 - 0.6],
    [faceInner - 6, hubRear],
    [pilot, hubRear],
    [pilot, x0],
  ];
  const rad = [0, 3, 6, 6, 3, -1, -1, 0, 2, -0.8, 0];
  const body = latheX(roundCorners(sec, rad, false, 5), 128);

  const frictionFace = latheX(
    [
      [rimR - 1, x1 - 0.6],
      [rimR - 1, x1 - 0.2],
      [rimR - 1.4, x1],
      [faceInner + 0.4, x1],
      [faceInner, x1 - 0.2],
      [faceInner, x1 - 0.6],
    ],
    128,
  );

  const rg = F.ringGear;
  const gear = involuteGearOutline({ teeth: rg.teeth, module: rg.module, flankSegs: 3 });
  const ringGear = extrudeAlongX(
    shapeFrom(gear, [circlePts(0, 0, rimR - 0.05, 180, true)]),
    x0 + (F.thickness - rg.width) / 2,
    x0 + (F.thickness + rg.width) / 2,
    0.4,
    4,
  );

  const bolts: BufferGeometry[] = [];
  const bc = SPECS.crank.flange.boltCircleDiameter / 2;
  for (let i = 0; i < F.boltCount; i++) {
    const a = (i / F.boltCount) * Math.PI * 2 + Math.PI / F.boltCount;
    const head = new CylinderGeometry(7.5, 7.5, 6, 6);
    head.rotateZ(Math.PI / 2);
    head.translate(hubRear + 3, Math.cos(a) * bc, Math.sin(a) * bc);
    const washer = new CylinderGeometry(8.4, 8.4, 0.8, 24);
    washer.rotateZ(Math.PI / 2);
    washer.translate(hubRear + 0.4, Math.cos(a) * bc, Math.sin(a) * bc);
    bolts.push(head, washer);
  }

  return { body, frictionFace, ringGear, bolts: merge(bolts) };
}
