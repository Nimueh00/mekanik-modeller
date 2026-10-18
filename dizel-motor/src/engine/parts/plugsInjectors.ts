import { BoxGeometry, type BufferGeometry, CubicBezierCurve3, CylinderGeometry, Vector3 } from 'three';
import { latheY, merge } from '../../core/geometry/profile';
import { sweepTube } from '../../core/geometry/sweep';
import { HEAD_TOP_Y, RIDGE_Y } from '../headLayout';
import { CYLINDER_X, SPECS } from '../specs';
import { alignY, glowPlugAxis } from './cylinderHead';
import { VALVE_COVER } from './valveCover';

const PL = SPECS.head.plug;

/** Seat face of the central injector step in the head. */
export const PLUG_SEAT_Y = RIDGE_Y + PL.reach + 1;

/** Common-rail position in world space (clear of intake runners and valve cover). */
export const RAIL_POS = { y: 308, z: -132, radius: 9 } as const;

/** High-pressure fuel line centre curve from the Common-Rail to cylinder `c`'s central injector top. */
export function highPressurePipeCurve(cylinder: number): CubicBezierCurve3 {
  const cx = CYLINDER_X[cylinder]!;
  const coverTop = HEAD_TOP_Y + VALVE_COVER.height;
  return new CubicBezierCurve3(
    new Vector3(cx, RAIL_POS.y, RAIL_POS.z),
    new Vector3(cx, coverTop + 28, RAIL_POS.z + 10),
    new Vector3(cx, coverTop + 32, -38),
    new Vector3(cx, coverTop + 18, 0),
  );
}

export interface PlugGeometry {
  shell: BufferGeometry;
  insulator: BufferGeometry;
  metal: BufferGeometry;
  coils: BufferGeometry;
}

/** Four angled diesel glow plugs (pencil heater tip + hex shell + terminal + busbar), in world space. */
export function buildPlugs(): PlugGeometry {
  const heater = latheY(
    [
      [0, 0],
      [1.4, 0],
      [1.9, 2],
      [1.9, 48],
      [0, 48],
    ],
    20,
  );
  const shellBody = latheY(
    [
      [0, 48],
      [3.8, 48],
      [3.8, 78],
      [4.6, 79],
      [4.6, 86],
      [0, 86],
    ],
    24,
  );
  const hexR = 4.8 / Math.cos(Math.PI / 6);
  const hex = new CylinderGeometry(hexR, hexR, 6, 6);
  hex.translate(0, 82, 0);
  const shellLocal = merge([shellBody, hex]);

  const insulatorLocal = latheY(
    [
      [0, 86],
      [3.1, 86],
      [3.1, 90.5],
      [0, 90.5],
    ],
    20,
  );
  const terminalLocal = latheY(
    [
      [0, 90.5],
      [2.0, 90.5],
      [2.0, 96],
      [2.8, 96.5],
      [2.8, 98.5],
      [0, 98.5],
    ],
    16,
  );
  const metalLocal = merge([heater, terminalLocal]);

  const shells: BufferGeometry[] = [];
  const ins: BufferGeometry[] = [];
  const metal: BufferGeometry[] = [];
  const busbar: BufferGeometry[] = [];
  let termPos: Vector3 | undefined;

  for (let c = 0; c < SPECS.cylinders; c++) {
    const { tip, dir } = glowPlugAxis(c);
    const up = dir.clone().negate();
    shells.push(alignY(shellLocal.clone(), up, tip));
    ins.push(alignY(insulatorLocal.clone(), up, tip));
    metal.push(alignY(metalLocal.clone(), up, tip));
    termPos = tip.clone().addScaledVector(up, 95);
    const cap = new CylinderGeometry(4.2, 4.2, 4, 16);
    alignY(cap, up, tip.clone().addScaledVector(up, 93));
    busbar.push(cap);
  }
  const x0 = CYLINDER_X[0]! - 6;
  const x1 = CYLINDER_X[CYLINDER_X.length - 1]! + 6;
  const railBar = new BoxGeometry(x1 - x0, 4.5, 6.5);
  railBar.translate((x0 + x1) / 2, termPos!.y + 2, termPos!.z - 2);
  busbar.push(railBar);

  return { shell: merge(shells), insulator: merge(ins), metal: merge(metal), coils: merge(busbar) };
}

export interface InjectorGeometry {
  nozzles: BufferGeometry;
  bodies: BufferGeometry;
  rail: BufferGeometry;
}

/** Four central Common-Rail direct injectors, common fuel rail and high-pressure fuel lines. */
export function buildInjectors(): InjectorGeometry {
  const y0 = PLUG_SEAT_Y;
  const coverTop = HEAD_TOP_Y + VALVE_COVER.height;

  // Lower nozzle protruding into the combustion chamber centre + lower barrel in the head well
  const nozzleLocal = latheY(
    [
      [0, RIDGE_Y - 2.2],
      [1.8, RIDGE_Y - 2.2],
      [2.2, RIDGE_Y - 1.0],
      [3.6, RIDGE_Y],
      [3.6, y0 - PL.reach],
      [6.6, y0 - PL.reach + 1.5],
      [6.6, y0],
      [0, y0],
    ],
    28,
  );

  // Upper injector body rising through the head & valve-cover tower, plus solenoid head and hold-down clamp
  const bodyTurned = latheY(
    [
      [0, y0],
      [8.2, y0],
      [8.2, coverTop - 4],
      [9.4, coverTop - 2],
      [9.4, coverTop + 8],
      [7.2, coverTop + 9],
      [7.2, coverTop + 15],
      [0, coverTop + 15],
    ],
    32,
  );
  const clamp = new BoxGeometry(14, 6, 28);
  clamp.translate(0, coverTop + 4, 8);
  const connector = new BoxGeometry(12, 9, 16);
  connector.translate(0, coverTop + 11, 11);
  const bodyLocal = merge([bodyTurned, clamp, connector]);

  // High-pressure inlet fitting nut on top of the injector
  const topNut = new CylinderGeometry(5.5, 5.5, 6, 6);
  topNut.translate(0, coverTop + 17, 0);

  const nozzles: BufferGeometry[] = [];
  const bodies: BufferGeometry[] = [];
  const railParts: BufferGeometry[] = [];

  for (let c = 0; c < SPECS.cylinders; c++) {
    const cx = CYLINDER_X[c]!;
    const atX = (g: BufferGeometry) => {
      const cl = g.clone();
      cl.translate(cx, 0, 0);
      return cl;
    };
    nozzles.push(atX(nozzleLocal));
    bodies.push(atX(bodyLocal));
    railParts.push(atX(topNut));

    const curve = highPressurePipeCurve(c);
    railParts.push(sweepTube(curve, () => 2.8, 28, 16));

    const railNut = new CylinderGeometry(5.2, 5.2, 6, 6);
    railNut.translate(cx, RAIL_POS.y + RAIL_POS.radius + 2, RAIL_POS.z);
    railParts.push(railNut);
  }

  const x0 = CYLINDER_X[0]! - 38;
  const x1 = CYLINDER_X[CYLINDER_X.length - 1]! + 38;
  const mainRail = new CylinderGeometry(RAIL_POS.radius, RAIL_POS.radius, x1 - x0, 32);
  mainRail.rotateZ(Math.PI / 2);
  mainRail.translate((x0 + x1) / 2, RAIL_POS.y, RAIL_POS.z);

  const sensorL = new CylinderGeometry(10.5, 10.5, 14, 24);
  sensorL.rotateZ(Math.PI / 2);
  sensorL.translate(x0 - 6, RAIL_POS.y, RAIL_POS.z);
  const regR = sensorL.clone();
  regR.translate(x1 - x0 + 12, 0, 0);
  railParts.push(mainRail, sensorL, regR);

  return { nozzles: merge(nozzles), bodies: merge(bodies), rail: merge(railParts) };
}
