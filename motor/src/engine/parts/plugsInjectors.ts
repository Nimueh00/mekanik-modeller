import { BoxGeometry, type BufferGeometry, CylinderGeometry, Vector3 } from 'three';
import { latheY, merge, type P2 } from '../../core/geometry/profile';
import { HEAD_TOP_Y, RIDGE_Y } from '../headLayout';
import { CYLINDER_X, SPECS } from '../specs';
import { alignY, injectorAxis } from './cylinderHead';
import { VALVE_COVER } from './valveCover';

const PL = SPECS.head.plug;

/** Seat face of the spark plug in the head (top of the threaded hole). */
export const PLUG_SEAT_Y = RIDGE_Y + PL.reach + 1;

export interface PlugGeometry {
  shell: BufferGeometry;
  insulator: BufferGeometry;
  metal: BufferGeometry;
  coils: BufferGeometry;
}

/** Four spark plugs (M14, 19 mm reach) and their pencil coils, in world space. */
export function buildPlugs(): PlugGeometry {
  const y0 = PLUG_SEAT_Y;
  const tr = PL.threadDiameter / 2 - 0.1;
  // steel shell: threads (as fine grooves) → sealing washer → hex → crimp
  const shellProf: P2[] = [[4.6, y0 - PL.reach]];
  shellProf.push([tr - 0.6, y0 - PL.reach], [tr, y0 - PL.reach + 0.6]);
  for (let y = y0 - PL.reach + 1.5; y < y0 - 1.5; y += 1.5) shellProf.push([tr, y], [tr - 0.45, y + 0.75]);
  shellProf.push([tr, y0 - 1], [tr, y0]);
  shellProf.push([9.4, y0], [9.4, y0 + 1.6], [8.2, y0 + 2.4], [8.2, y0 + 3]);
  const hexBottom = y0 + 3;
  const hexTop = hexBottom + 10;
  shellProf.push([7.6, hexTop + 0.6], [7.6, hexTop + 3], [6.2, hexTop + 4.2], [5.6, hexTop + 4.2], [4.6, y0 - PL.reach]);
  const shellTurned = latheY(shellProf, 40);
  const hexR = 8 / Math.cos(Math.PI / 6);
  const hex = new CylinderGeometry(hexR, hexR, 10, 6);
  hex.translate(0, hexBottom + 5, 0);

  // ceramic: nose inside the shell, ribbed barrel above it
  const insProf: P2[] = [
    [0.9, y0 - PL.reach + 2],
    [3.2, y0 - PL.reach + 2.5],
    [4.5, y0 - 4],
    [5.5, hexTop + 4.2],
  ];
  const top = hexTop + 40;
  for (let y = hexTop + 7; y < top - 6; y += 4.5) insProf.push([5.5, y], [6.2, y + 1.2], [6.2, y + 2.4], [5.5, y + 3.6]);
  insProf.push([5.5, top - 2], [4.6, top], [1.5, top], [1.5, y0 - PL.reach + 2], [0.9, y0 - PL.reach + 2]);
  const insulator = latheY(insProf, 36);

  // terminal + centre and ground electrodes
  const term = latheY(
    [
      [0, top],
      [3.4, top],
      [3.4, top + 3],
      [2, top + 3.8],
      [2, top + 5],
      [3.6, top + 5.6],
      [3.6, top + 9],
      [0, top + 9.5],
    ],
    20,
  );
  const centre = new CylinderGeometry(1.1, 1.1, 4, 12);
  centre.translate(0, y0 - PL.reach - 1, 0);
  const gStrap = new BoxGeometry(2.6, 3.4, 1.3);
  gStrap.translate(0, y0 - PL.reach - 1.4, 4.2);
  const gTip = new BoxGeometry(2.6, 1.3, 4.6);
  gTip.translate(0, y0 - PL.reach - 3.3 + 0.65, 2.2);

  // pencil coil: rubber boot in the well, body through the cover, head with connector
  const coverTop = HEAD_TOP_Y + VALVE_COVER.height;
  const coil = latheY(
    [
      [0, top - 6],
      [8.2, top - 6],
      [9.6, top + 4],
      [9.6, coverTop - 8],
      [11, coverTop - 6],
      [11, coverTop + 4],
      [0, coverTop + 4],
    ],
    32,
  );
  const coilHead = new BoxGeometry(30, 16, 40);
  coilHead.translate(0, coverTop + 11, -6);
  const plug = new BoxGeometry(16, 12, 14);
  plug.translate(0, coverTop + 11, -30);

  const shells: BufferGeometry[] = [];
  const ins: BufferGeometry[] = [];
  const metal: BufferGeometry[] = [];
  const coils: BufferGeometry[] = [];
  for (const cx of CYLINDER_X) {
    const at = (g: BufferGeometry) => {
      const c = g.clone();
      c.translate(cx, 0, 0);
      return c;
    };
    shells.push(at(shellTurned), at(hex));
    ins.push(at(insulator));
    metal.push(at(term), at(centre), at(gStrap), at(gTip));
    coils.push(at(coil), at(coilHead), at(plug));
  }
  return { shell: merge(shells), insulator: merge(ins), metal: merge(metal), coils: merge(coils) };
}

export interface InjectorGeometry {
  nozzles: BufferGeometry;
  bodies: BufferGeometry;
  rail: BufferGeometry;
}

/** Port fuel injectors, seated in the head's bosses, and the fuel rail on their top cups. */
export function buildInjectors(): InjectorGeometry {
  const nozzle = latheY(
    [
      [0, -2],
      [2.6, -2],
      [3.6, -1],
      [3.6, 10],
      [0, 10],
    ],
    24,
  );
  const body = latheY(
    [
      [0, 10],
      [5, 10],
      [7.1, 11], // lower O-ring
      [7.1, 13.5],
      [6.2, 14.5],
      [6.6, 16],
      [6.8, 38],
      [8.6, 40],
      [8.6, 50],
      [6.4, 52],
      [6.4, 53.5],
      [7, 54], // upper O-ring
      [7, 56.5],
      [5.6, 57.5],
      [0, 57.5],
    ],
    32,
  );
  const conn = new BoxGeometry(12, 10, 16);
  conn.translate(0, 45, 10);
  const cup = latheY(
    [
      [6.5, 52],
      [9.5, 52],
      [9.5, 64],
      [0, 64],
      [0, 60],
      [6.5, 60],
      [6.5, 52],
    ],
    32,
  );

  const nozzles: BufferGeometry[] = [];
  const bodies: BufferGeometry[] = [];
  const rail: BufferGeometry[] = [];
  let railAt: Vector3 | undefined;
  for (let c = 0; c < SPECS.cylinders; c++) {
    const { tip, dir } = injectorAxis(c);
    const up = dir.clone().negate();
    nozzles.push(alignY(nozzle.clone(), up, tip));
    bodies.push(alignY(body.clone(), up, tip), alignY(conn.clone(), up, tip));
    rail.push(alignY(cup.clone(), up, tip));
    railAt = tip.clone().addScaledVector(up, 64 + 7);
  }
  const x0 = CYLINDER_X[0]! - 40;
  const x1 = CYLINDER_X[CYLINDER_X.length - 1]! + 40;
  const tube = new CylinderGeometry(9, 9, x1 - x0, 32);
  tube.rotateZ(Math.PI / 2);
  tube.translate((x0 + x1) / 2, railAt!.y, railAt!.z);
  const capL = new CylinderGeometry(10, 10, 4, 32);
  capL.rotateZ(Math.PI / 2);
  capL.translate(x0 - 2, railAt!.y, railAt!.z);
  const capR = capL.clone();
  capR.translate(x1 - x0 + 4, 0, 0);
  rail.push(tube, capL, capR);
  return { nozzles: merge(nozzles), bodies: merge(bodies), rail: merge(rail) };
}
