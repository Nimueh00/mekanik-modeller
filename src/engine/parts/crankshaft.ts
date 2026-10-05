import { BoxGeometry, type BufferGeometry, CylinderGeometry } from 'three';
import { sprocketOutline } from '../../core/geometry/gear';
import {
  arcPts,
  circlePts,
  extrudeAlongX,
  latheX,
  merge,
  type P2,
  roundCorners,
  shapeFrom,
} from '../../core/geometry/profile';
import { CRANK_RADIUS, CYLINDER_X, MAIN_X, SPECS } from '../specs';

const C = SPECS.crank;
const DEG = Math.PI / 180;

/** Axial positions derived from the specs (shared with later phases, e.g. the chain drive). */
export const CRANK_STATIONS = (() => {
  const front = MAIN_X[0]! - C.mainJournalWidth / 2;
  const rear = MAIN_X[MAIN_X.length - 1]! + C.mainJournalWidth / 2;
  const n = C.nose;
  const sealEnd = front - n.sealLength;
  const sprocketSeatEnd = sealEnd - n.sprocketSeatLength;
  const noseEnd = sprocketSeatEnd - n.pulleySeatLength;
  const f = C.flange;
  const rearSealEnd = rear + 12;
  const flangeFace = rearSealEnd + f.thickness;
  return {
    front,
    rear,
    sealEnd,
    sprocketSeatEnd,
    noseEnd,
    /** Centre of the timing sprocket along X. */
    sprocketX: sealEnd - 2 - C.sprocket.width / 2,
    rearSealEnd,
    /** Rear face of the flywheel flange: the flywheel bolts on here. */
    flangeFace,
  };
})();

/** Journal or crankpin as a turned profile with root fillets at both ends. */
function journalProfile(R: number, x0: number, x1: number, f: number): P2[] {
  const pts: P2[] = [[0, x0], [R + f, x0]];
  for (const [r, x] of arcPts(R + f, x0 + f, f, -90 * DEG, -180 * DEG, 5).slice(1)) pts.push([r, x]);
  for (const [r, x] of arcPts(R + f, x1 - f, f, 180 * DEG, 90 * DEG, 5)) pts.push([r, x]);
  pts.push([0, x1]);
  return pts;
}

/**
 * Crank web outline in the (z, y) plane for a throw at angle 0 (pin on +Y):
 * a counterweight sector below the main axis, straight shoulders running in
 * to a narrower neck, and the pin boss on top. Corners are filleted, the neck
 * corners concave — the classic "pear" web of a forged 8-counterweight crank.
 */
export function webOutline(throwDeg: number): P2[] {
  const r = CRANK_RADIUS;
  const Rc = C.counterweightRadius;
  const half = C.counterweightHalfAngleDeg;
  const neck = C.webNeckHalfWidth;
  const pinBoss = C.webPinBossRadius;
  const pts: P2[] = [];
  const rad: number[] = [];
  const add = (p: P2, f = 0) => {
    pts.push(p);
    rad.push(f);
  };
  // counterweight arc, left → right across the bottom
  const arc = arcPts(0, 0, Rc, (-90 - half) * DEG, (-90 + half) * DEG, 40);
  arc.forEach((p, i) => add(p, i === 0 || i === arc.length - 1 ? 6 : 0));
  // right shoulder → neck (concave) → pin boss
  add([neck, -2], 12);
  const a0 = Math.acos(Math.min(1, neck / pinBoss));
  const top = arcPts(0, r, pinBoss, -a0 + 0.35, Math.PI + a0 - 0.35, 36);
  add([neck, r - 4], 6);
  for (const p of top) add(p);
  add([-neck, r - 4], 6);
  add([-neck, -2], 12);
  const rounded = roundCorners(pts, rad, true, 6);
  const c = Math.cos(throwDeg * DEG);
  const s = Math.sin(throwDeg * DEG);
  // Rotate the throw: shape x = world z, shape y = world y; pin at (z, y) = (r sinθ, r cosθ).
  return rounded.map(([z, y]) => [z * c + y * s, -z * s + y * c] as P2);
}

export interface CrankGeometry {
  machined: BufferGeometry;
  forged: BufferGeometry;
  hardware: BufferGeometry;
  sprocket: BufferGeometry;
}

export function buildCrankshaft(): CrankGeometry {
  const f = C.filletRadius;
  const machined: BufferGeometry[] = [];
  const forged: BufferGeometry[] = [];
  const hardware: BufferGeometry[] = [];

  // Main journals
  for (const mx of MAIN_X) {
    machined.push(latheX(journalProfile(C.mainJournalDiameter / 2, mx - C.mainJournalWidth / 2, mx + C.mainJournalWidth / 2, f), 72));
  }

  // Crank pins + webs
  CYLINDER_X.forEach((cx, i) => {
    const throwDeg = SPECS.crankThrowDeg[i]!;
    const pin = latheX(journalProfile(C.pinDiameter / 2, cx - C.pinWidth / 2, cx + C.pinWidth / 2, f), 64);
    pin.translate(0, CRANK_RADIUS * Math.cos(throwDeg * DEG), CRANK_RADIUS * Math.sin(throwDeg * DEG));
    machined.push(pin);

    const shape = shapeFrom(webOutline(throwDeg));
    const half = SPECS.cylinderSpacing / 2;
    const w0 = cx - half + C.mainJournalWidth / 2;
    const w1 = cx - C.pinWidth / 2;
    forged.push(extrudeAlongX(shape, w0, w1, C.webChamfer, 12));
    forged.push(extrudeAlongX(shape, cx + C.pinWidth / 2, cx + half - C.mainJournalWidth / 2, C.webChamfer, 12));
  });

  // Front nose: seal land, sprocket seat, pulley seat, chamfered end.
  const s = CRANK_STATIONS;
  const n = C.nose;
  const rs = n.sealDiameter / 2;
  const rk = n.sprocketSeatDiameter / 2;
  const rp = n.pulleySeatDiameter / 2;
  machined.push(
    latheX(
      [
        [0, s.noseEnd],
        [rp - 1, s.noseEnd],
        [rp, s.noseEnd + 1],
        [rp, s.sprocketSeatEnd - 0.6],
        [rp + 0.6, s.sprocketSeatEnd],
        [rk - 0.6, s.sprocketSeatEnd],
        [rk, s.sprocketSeatEnd + 0.6],
        [rk, s.sealEnd - 0.8],
        [rk + 0.8, s.sealEnd],
        [rs - 0.8, s.sealEnd],
        [rs, s.sealEnd + 0.8],
        [rs, s.front + 0.5],
        [0, s.front + 0.5],
      ],
      64,
    ),
  );
  // Woodruff key along the seats
  const key = new BoxGeometry(s.sealEnd - s.noseEnd - 4, 4, n.keyWidth);
  key.translate((s.sealEnd + s.noseEnd) / 2, rp + 1, 0);
  hardware.push(key);
  // Nose bolt + washer
  const washer = new CylinderGeometry(11, 11, 3, 40);
  washer.rotateZ(Math.PI / 2);
  washer.translate(s.noseEnd - 1.5, 0, 0);
  const head = new CylinderGeometry(9.2, 9.2, 8, 6);
  head.rotateZ(Math.PI / 2);
  head.translate(s.noseEnd - 3 - 4, 0, 0);
  hardware.push(washer, head);

  // Rear: oil-seal land and flywheel flange with a pilot bore.
  const fl = C.flange;
  const R = fl.diameter / 2;
  const seal = fl.neckDiameter / 2 + 6;
  machined.push(
    latheX(
      [
        [0, s.rear - 0.5],
        [seal - 1.5, s.rear - 0.5],
        [seal - 1.5, s.rear + 0.5],
        [seal, s.rear + 2],
        [seal, s.rearSealEnd - 1.5],
        [seal + 1.5, s.rearSealEnd],
        [R - 1.5, s.rearSealEnd],
        [R, s.rearSealEnd + 1.5],
        [R, s.flangeFace - 1.5],
        [R - 1.5, s.flangeFace],
        [fl.pilotDiameter / 2 + 1, s.flangeFace],
        [fl.pilotDiameter / 2, s.flangeFace - 1],
        [fl.pilotDiameter / 2, s.flangeFace - 10],
        [0, s.flangeFace - 10],
      ],
      72,
    ),
  );

  // Timing sprocket (separate part, rotates with the crank).
  const sp = C.sprocket;
  const outline = sprocketOutline(sp.teeth, sp.chainPitch, sp.rollerDiameter);
  const bore = circlePts(0, 0, rk, 48, true);
  const sprocket = extrudeAlongX(shapeFrom(outline, [bore]), s.sprocketX - sp.width / 2, s.sprocketX + sp.width / 2, 0.5, 8);

  return {
    machined: merge(machined),
    forged: merge(forged),
    hardware: merge(hardware),
    sprocket,
  };
}
