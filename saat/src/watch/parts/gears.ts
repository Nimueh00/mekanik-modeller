import type { BufferGeometry } from 'three';
import { pinionOutline, wheelOutline } from '../geometry/watchGear';
import { PINION_FORM, WHEEL_FORM } from '../geometry/watchGear';
import { pitchRadius } from '../specs';
import { WIND_PHASE, windGear } from '../windTrain';
import { circle, slab, toScene } from './common';
import { type Crossing, crossingHoles } from './wheels';

/** Root radius of one of the P3 spur gears. */
export function windRootRadius(name: string): number {
  const g = windGear(name);
  return pitchRadius(g.gear) - (g.pinion ? PINION_FORM.dedendum : WHEEL_FORM.dedendum) * g.gear.module;
}

/**
 * One of the P3 spur gears (see windTrain.ts) as a slab between its own y range,
 * teeth phased for the mesh, with optional crossings and bore, in millimetres.
 */
export function windGearMm(name: string, crossing?: Crossing, bore = 0): BufferGeometry {
  const g = windGear(name);
  const [y0, y1] = g.gear.y as readonly [number, number];
  const holes = crossing ? crossingHoles(windRootRadius(name) - crossing.rim, crossing) : [];
  if (bore > 0) holes.push(circle(bore, [0, 0], 28).reverse());
  const outline = g.pinion ? pinionOutline(g.gear) : wheelOutline(g.gear);
  const slabbed = slab(outline, holes, y0, y1);
  slabbed.rotateY((WIND_PHASE[name]! * Math.PI) / 180);
  return slabbed;
}

/** The same in scene units. */
export function windGearGeometry(name: string, crossing?: Crossing, bore = 0): BufferGeometry {
  return toScene(windGearMm(name, crossing, bore));
}
