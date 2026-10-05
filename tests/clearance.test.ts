import { describe, expect, it } from 'vitest';
import { cylinderCrankAngle, sliderCrankPose } from '../src/engine/kinematics';
import { rodEnvelope } from '../src/engine/parts/connectingRod';
import { webOutline } from '../src/engine/parts/crankshaft';
import { crownHeightAt, valvePockets } from '../src/engine/parts/piston';
import { MAIN_X, PIN_Y_BDC, PIN_Y_TDC, SPECS } from '../src/engine/specs';

/*
 * Interference checks for the moving bottom end, swept through a full cycle in
 * 0.5° steps. Each check works on the true part outlines in the plane of
 * motion (the parts are prismatic along X inside their own axial slots, which
 * are checked separately).
 */

const B = SPECS.block;
const P = SPECS.piston;
const BORE_R = SPECS.bore / 2;
const SKIRT_INNER_R = P.diameter / 2 - 3;
const PAN_INNER_BOTTOM = SPECS.oilPan.shallowBottom + SPECS.oilPan.wall;
const STEP = 0.5;

/** Half-width of the crankcase bay at height y (matches block.ts cavity profile). */
function cavityHalfWidth(y: number): number {
  if (y <= 40) return B.crankcaseCavityHalfWidth;
  if (y >= B.crankcaseCavityTop) return 55;
  const t = (y - 40) / (B.crankcaseCavityTop - 40);
  return B.crankcaseCavityHalfWidth + (55 - B.crankcaseCavityHalfWidth) * t;
}

function rotX(z: number, y: number, a: number): [number, number] {
  // R_x(a) acting on (y, z)
  return [y * Math.sin(a) + z * Math.cos(a), y * Math.cos(a) - z * Math.sin(a)];
}

const rod = rodEnvelope();

describe('connecting rod sweep', () => {
  it('stays inside the bore, the piston skirt and the crankcase bay', () => {
    let minBore = Infinity;
    let minSkirt = Infinity;
    let minBay = Infinity;
    let minPan = Infinity;
    for (let a = 0; a < 360; a += STEP) {
      const pose = sliderCrankPose(a);
      const skirtBottom = pose.pistonY - P.skirtBelowPin;
      for (const [z0, y0] of rod) {
        const [dz, dy] = rotX(z0, y0, pose.rodAngle);
        const z = Math.abs(pose.pinZ + dz);
        const y = pose.pinY + dy;
        if (y >= B.linerBottom) minBore = Math.min(minBore, BORE_R - z);
        if (y >= skirtBottom) minSkirt = Math.min(minSkirt, SKIRT_INNER_R - z);
        minBay = Math.min(minBay, cavityHalfWidth(y) - z);
        minPan = Math.min(minPan, y - PAN_INNER_BOTTOM);
      }
    }
    expect(minBore).toBeGreaterThan(1);
    expect(minSkirt).toBeGreaterThan(1);
    expect(minBay).toBeGreaterThan(2);
    expect(minPan).toBeGreaterThan(5);
  });

  it('fits axially between the crank webs and the piston pin bosses', () => {
    expect(SPECS.rod.bigEndWidth).toBeLessThan(SPECS.crank.pinWidth);
    expect(SPECS.rod.bigEndWidth).toBeLessThan(P.pinBossGap);
  });
});

describe('crank web / counterweight sweep', () => {
  it('clears every piston skirt, the crankcase bay and the oil pan', () => {
    let minSkirt = Infinity;
    let minBay = Infinity;
    let minPan = Infinity;
    for (let i = 0; i < SPECS.cylinders; i++) {
      const web = webOutline(SPECS.crankThrowDeg[i]!);
      for (let a = 0; a < 720; a += STEP) {
        const crank = (a * Math.PI) / 180;
        const pistonY = sliderCrankPose(cylinderCrankAngle(i, a)).pistonY;
        const skirtBottom = pistonY - P.skirtBelowPin;
        for (const [z0, y0] of web) {
          const [z, y] = rotX(z0, y0, crank);
          if (Math.abs(z) < BORE_R) minSkirt = Math.min(minSkirt, skirtBottom - y);
          minBay = Math.min(minBay, cavityHalfWidth(y) - Math.abs(z));
          minPan = Math.min(minPan, y - PAN_INNER_BOTTOM);
        }
      }
    }
    expect(minSkirt).toBeGreaterThan(3);
    expect(minBay).toBeGreaterThan(2);
    expect(minPan).toBeGreaterThan(5);
  });

  it('webs do not run into the main bearing caps or bulkheads', () => {
    const half = SPECS.crank.mainJournalWidth / 2;
    expect(half).toBeGreaterThan(SPECS.mainCap.width / 2);
    expect(half).toBeGreaterThan(B.bulkheadWidth / 2);
    // and every web lies between two bulkheads
    expect(MAIN_X.length).toBe(SPECS.cylinders + 1);
  });
});

describe('piston in the bore', () => {
  it('crown edge stays below the deck at TDC', () => {
    const crownEdgeTdc = PIN_Y_TDC + P.compressionHeight;
    expect(crownEdgeTdc).toBeLessThanOrEqual(B.deckHeight);
    // Dome centre may rise into the (phase-2) pent-roof chamber, but only slightly.
    expect(PIN_Y_TDC + crownHeightAt(0) - B.deckHeight).toBeLessThan(1.5);
  });

  it('keeps all rings inside the liner at BDC', () => {
    const lowestRing = P.rings[P.rings.length - 1]!;
    const ringBottomBdc = PIN_Y_BDC + P.compressionHeight - lowestRing.y - lowestRing.h / 2;
    expect(ringBottomBdc).toBeGreaterThan(B.linerBottom + 10);
  });

  it('valve pockets are separate and stay inside the crown edge', () => {
    const v = valvePockets();
    expect(v).toHaveLength(4);
    for (const a of v) {
      expect(Math.hypot(a.floor.x, a.floor.z) + a.radius).toBeLessThan(P.diameter / 2 - 0.3);
      for (const b of v) {
        if (a === b) continue;
        const d = Math.hypot(a.floor.x - b.floor.x, a.floor.z - b.floor.z);
        expect(d - a.radius - b.radius).toBeGreaterThan(0.3);
      }
    }
  });

  it('small end sits below the crown underside', () => {
    expect(SPECS.rod.smallEndOuterDiameter / 2).toBeLessThan(P.compressionHeight - 7);
  });
});
