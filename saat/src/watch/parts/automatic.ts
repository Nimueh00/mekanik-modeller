import type { BufferGeometry } from 'three';
import { SphereGeometry } from 'three';
import type { P2 } from '../../core/geometry/profile';
import { AUTOMATIC, MOVEMENT } from '../specs';
import { circle, cylinderY, merge, slab, toScene, tubeY } from './common';
import { windGearMm } from './gears';

/**
 * Automatic winding, rotor side: the half-moon oscillating weight on its ball
 * bearing at the centre. The base plate (rhodium, like the bridges) is thin;
 * the weight is a thick segment on its outer edge. All of it lies in
 * MOVEMENT.envelope.rotor, above the winding levels. At rest (angle 0) the
 * weight hangs towards 6 o'clock (+Z).
 */

const R = AUTOMATIC.rotor;
const BEARING = AUTOMATIC.bearing;
const BRIDGE_TOP = MOVEMENT.envelope.bridges[0];

/** Points on an arc in the plan numbers, from angle a0 to a1 (degrees, (cos, sin) convention) at radius r. */
function arc(r: number, a0: number, a1: number, steps: number): P2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)] as P2;
  });
}

export interface RotorGeometry {
  /** Half-moon base plate and hub (rhodium-plated). */
  base: BufferGeometry;
  /** The thick outer weight segment. */
  weight: BufferGeometry;
  /** Pinion that drives the reversers, under the hub (steel). */
  pinion: BufferGeometry;
}

export function buildRotor(): RotorGeometry {
  const [b0, b1] = R.baseY;
  const [w0, w1] = R.weightY;
  const centre = 90; // 6 o'clock in the (cos, sin) numbers: +Z
  // half-moon: outer arc over 170°, back along the chord through a hub circle
  const half = 85;
  const outline: P2[] = [...arc(R.outerRadius - 0.4, centre - half, centre + half, 40), ...arc(2.4, centre + half, centre - half, 12)];
  const holes: P2[][] = [];
  // three lightening openings between hub and weight
  for (const da of [-48, 0, 48]) {
    const a = ((centre + da) * Math.PI) / 180;
    holes.push(circle(1.6, [5.9 * Math.cos(a), 5.9 * Math.sin(a)], 28).reverse());
  }
  const plate = slab(outline, holes, b0, b1, 0.02);
  const hubRing = slab(circle(2.1, [0, 0], 48), [circle(BEARING.outerRadius, [0, 0], 32).reverse()], R.weightY[0], b1, 0.02);
  // the weight: annular sector on the rim
  const span = R.weightSpanDeg / 2;
  const weightOutline: P2[] = [...arc(R.outerRadius, centre - span, centre + span, 40), ...arc(R.weightInner, centre + span, centre - span, 40)];
  const weight = slab(weightOutline, [], w0, w1, 0.03);
  // bearing nut ring on top of the hub
  const nut = tubeY(BEARING.innerRadius + 0.05, 1.1, w0, w0 + 0.03, 32);
  // pinion: leaves in level 2 under a tube from the hub
  const tube = tubeY(0.46, 0.62, b1 - 0.002, AUTOMATIC.rotorPinion.y[0] + 0.0, 24);
  const pinion = merge([windGearMm('rotorPinion', undefined, 0.46), tube]);
  return { base: toScene(merge([plate, hubRing, nut])), weight: toScene(weight), pinion: toScene(pinion) };
}

export interface BearingGeometry {
  /** Fixed inner race: the stud screwed into the train bridge (steel). */
  stud: BufferGeometry;
  /** Balls and cage, which orbit at CAGE_RATIO of the rotor's speed. */
  balls: BufferGeometry;
}

export function buildBearing(): BearingGeometry {
  const [y0, y1] = BEARING.y;
  const ym = (y0 + y1) / 2;
  const pitchRadius = (BEARING.innerRadius + BEARING.outerRadius) / 2;
  const ballRadius = (BEARING.outerRadius - BEARING.innerRadius) / 2 - 0.01;
  const stud = merge([
    cylinderY(BEARING.innerRadius, BRIDGE_TOP - 0.02, AUTOMATIC.rotor.weightY[0], 28),
    cylinderY(BEARING.innerRadius + 0.14, y1 - 0.01, y0 + 0.01, 28), // inner race shoulder
  ]);
  const balls: BufferGeometry[] = [];
  for (let k = 0; k < BEARING.balls; k++) {
    const a = (2 * Math.PI * k) / BEARING.balls;
    const ball = new SphereGeometry(ballRadius, 14, 10);
    ball.translate(pitchRadius * Math.cos(a), ym, pitchRadius * Math.sin(a));
    balls.push(ball);
  }
  const cage = tubeY(pitchRadius - 0.02, pitchRadius + 0.02, ym - 0.012, ym + 0.012, 28);
  return { stud: toScene(stud), balls: toScene(merge([...balls, cage])) };
}
