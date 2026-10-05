import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { chamberCeiling, HEAD_FACE_Y, VALVES, type ValveAxis } from '../src/engine/headLayout';
import { cylinderCrankAngle, sliderCrankPose } from '../src/engine/kinematics';
import { crownHeightAt, valvePockets } from '../src/engine/parts/piston';
import { CYLINDER_X, PIN_Y_BDC, PIN_Y_TDC, SPECS } from '../src/engine/specs';
import { valveLift } from '../src/engine/timing';

/*
 * Top-end interference checks.
 *
 * The piston crown is represented as a height field in the piston frame
 * (pin centre = origin): the spherical dome, lowered to the floor plane of a
 * valve pocket wherever that floor lies under the point. The valve head is a
 * point cloud on its face, margin and 45° seat. Distances are true Euclidean
 * distances between the two point sets, plus a penetration check of every
 * valve point against the height field.
 */

const P = SPECS.piston;
const VT = SPECS.valveTrain;
const CROWN_R = P.diameter / 2 - 0.3; // top land
const GRID = 0.8;
const pockets = valvePockets();

function crownY(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r > CROWN_R) return -Infinity;
  let y = crownHeightAt(r);
  for (const p of pockets) {
    const ay = Math.cos(p.tiltRad);
    const az = Math.sin(p.tiltRad);
    const yf = p.floor.y - (az * (z - p.floor.z)) / ay;
    const lat = Math.hypot(x - p.floor.x, yf - p.floor.y, z - p.floor.z);
    if (lat < p.radius) y = Math.min(y, yf);
  }
  return y;
}

// Height-field grid of the crown, indexed for neighbourhood queries.
const N = Math.ceil((2 * CROWN_R) / GRID) + 1;
const crown = new Float64Array(N * N).fill(-Infinity);
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) crown[i * N + j] = crownY(-CROWN_R + i * GRID, -CROWN_R + j * GRID);
const crownTop = crownHeightAt(0);

function valvePoints(v: ValveAxis): { s: number; e1: number; e2: number }[] {
  const R = v.diameter / 2;
  const out: { s: number; e1: number; e2: number }[] = [{ s: 0, e1: 0, e2: 0 }];
  for (const [r, s] of [
    [R * 0.33, 0],
    [R * 0.66, 0],
    [R - 0.5, 0],
    [R, 0.4],
    [R, VT.valve.margin],
    [R - VT.valve.seatWidth, VT.valve.margin + VT.valve.seatWidth],
  ] as const) {
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      out.push({ s, e1: r * Math.cos(a), e2: r * Math.sin(a) });
    }
  }
  return out;
}

const E1 = new Vector3(1, 0, 0);

/** Minimum distance valve head ↔ piston crown, and whether any valve point is below the crown surface. */
function valveToPiston(v: ValveAxis, crankDeg: number, best: number): { dist: number; penetrates: boolean } {
  const lift = valveLift(v.kind, v.cylinder, crankDeg);
  const pinY = sliderCrankPose(cylinderCrankAngle(v.cylinder, crankDeg)).pistonY;
  const cx = CYLINDER_X[v.cylinder]!;
  const e2 = new Vector3().crossVectors(v.dir, E1);
  const pts = valvePoints(v).map((q) =>
    v.face
      .clone()
      .addScaledVector(v.dir, q.s - lift)
      .addScaledVector(E1, q.e1)
      .addScaledVector(e2, q.e2)
      .sub(new Vector3(cx, pinY, 0)), // into the piston frame
  );
  let lowest = Infinity;
  for (const p of pts) lowest = Math.min(lowest, p.y);
  if (lowest - crownTop > best) return { dist: lowest - crownTop, penetrates: false }; // slab bound
  let dist = Infinity;
  let penetrates = false;
  const reach = Math.ceil(Math.min(best, 30) / GRID);
  for (const p of pts) {
    const cy = crownY(p.x, p.z);
    if (cy > -Infinity && p.y <= cy) penetrates = true;
    const ci = Math.round((p.x + CROWN_R) / GRID);
    const cj = Math.round((p.z + CROWN_R) / GRID);
    for (let i = Math.max(0, ci - reach); i <= Math.min(N - 1, ci + reach); i++) {
      for (let j = Math.max(0, cj - reach); j <= Math.min(N - 1, cj + reach); j++) {
        const y = crown[i * N + j]!;
        if (y === -Infinity) continue;
        const d = Math.hypot(p.x - (-CROWN_R + i * GRID), p.y - y, p.z - (-CROWN_R + j * GRID));
        if (d < dist) dist = d;
      }
    }
  }
  return { dist, penetrates };
}

describe('valve ↔ piston', () => {
  it('every valve clears its piston over the whole 720° cycle (1° steps)', { timeout: 60000 }, () => {
    const minPer: number[] = [];
    for (let c = 0; c < SPECS.cylinders; c++) {
      let min = Infinity;
      for (const v of VALVES.filter((q) => q.cylinder === c)) {
        for (let a = 0; a < 720; a += 1) {
          const r = valveToPiston(v, a, Math.min(min, 12));
          expect(r.penetrates).toBe(false);
          min = Math.min(min, r.dist);
        }
      }
      minPer.push(min);
    }
    console.info(`valve–piston minimum clearance per cylinder (mm): ${minPer.map((m) => m.toFixed(2)).join(', ')}`);
    for (const m of minPer) expect(m).toBeGreaterThan(0.5);
  });

  it('valve axes coincide with the piston pocket axes', () => {
    for (const v of VALVES) {
      const p = pockets.find((q) => q.kind === v.kind && Math.sign(q.floor.x) === v.side)!;
      expect(p.tiltRad).toBeCloseTo(v.tiltRad, 12);
      // pocket floor centre (piston at TDC) lies on the valve axis
      const floor = new Vector3(CYLINDER_X[v.cylinder]! + p.floor.x, PIN_Y_TDC + p.floor.y, p.floor.z);
      const w = floor.sub(v.face);
      const lateral = w.clone().addScaledVector(v.dir, -w.dot(v.dir)).length();
      expect(lateral).toBeLessThan(1e-9);
      // the valve head (+ margin) fits inside its pocket
      expect(v.diameter / 2).toBeLessThan(p.radius);
    }
  });
});

describe('piston ↔ cylinder head', () => {
  it('crown clears the pent-roof chamber and the head face at TDC', () => {
    let min = Infinity;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const y = crown[i * N + j]!;
        if (y === -Infinity) continue;
        const z = -CROWN_R + j * GRID;
        min = Math.min(min, chamberCeiling(z) - (PIN_Y_TDC + y));
      }
    }
    console.info(`piston–head minimum clearance at TDC (squish): ${min.toFixed(2)} mm`);
    expect(min).toBeGreaterThan(0.8);
  });

  it('gives the specified compression ratio (10.5 ± 0.1)', () => {
    // clearance volume at TDC: everything between crown and chamber inside the gasket bore
    const H = SPECS.head;
    const rg = H.gasketBoreDiameter / 2;
    const step = 0.25;
    let vc = 0;
    for (let x = -rg; x <= rg; x += step) {
      for (let z = -rg; z <= rg; z += step) {
        const r = Math.hypot(x, z);
        if (r > rg) continue;
        const ceil = r <= H.chamberRadius && Math.abs(x) <= H.chamberHalfX ? chamberCeiling(z) : HEAD_FACE_Y;
        const cy = crownY(x, z);
        const floor = r <= CROWN_R ? PIN_Y_TDC + cy : r <= SPECS.bore / 2 ? PIN_Y_TDC + P.compressionHeight : SPECS.block.deckHeight;
        vc += (ceil - floor) * step * step;
      }
    }
    const vs = (Math.PI / 4) * SPECS.bore ** 2 * SPECS.stroke;
    const cr = (vs + vc) / vc;
    console.info(`clearance volume ${(vc / 1000).toFixed(2)} cm³ → compression ratio ${cr.toFixed(2)} : 1`);
    expect(Math.abs(cr - SPECS.compressionRatio)).toBeLessThan(0.1);
    expect(PIN_Y_TDC - PIN_Y_BDC).toBeCloseTo(SPECS.stroke, 9);
  });
});

describe('valve seats', () => {
  it('closed valve heads stay inside the chamber roof (never below the head face)', () => {
    for (const v of VALVES) {
      const R = v.diameter / 2;
      // lowest point of the face rim: tilted disc
      const low = v.face.y - R * Math.abs(v.dir.z);
      expect(low).toBeGreaterThan(HEAD_FACE_Y);
      // and the head stays inside the chamber outline (drum radius, front/rear squish pads)
      const dx = Math.abs(v.face.x - CYLINDER_X[v.cylinder]!);
      expect(dx + R).toBeLessThan(SPECS.head.chamberHalfX - 1);
      let far = 0;
      for (let k = 0; k < 360; k++) {
        const a = (k * Math.PI) / 180;
        far = Math.max(far, Math.hypot(dx + R * Math.cos(a), Math.abs(v.face.z) + R * Math.sin(a) * v.dir.y));
      }
      expect(far).toBeLessThan(SPECS.head.chamberRadius);
    }
  });
});
