import type { BufferGeometry } from 'three';
import { extrudeAlongX, merge, type P2, shapeFrom } from './profile';

export interface GearSpec {
  teeth: number;
  module: number;
  pressureAngleDeg?: number;
  /** Points per involute flank. */
  flankSegs?: number;
}

/**
 * Outline of an involute spur gear (closed polygon, CCW), centred on the
 * origin. Standard full-depth teeth: addendum = m, dedendum = 1.25 m.
 */
export function involuteGearOutline({ teeth: z, module: m, pressureAngleDeg = 20, flankSegs = 5 }: GearSpec): P2[] {
  const alpha = (pressureAngleDeg * Math.PI) / 180;
  const rp = (m * z) / 2;
  const rb = rp * Math.cos(alpha);
  const ra = rp + m;
  const rf = Math.max(rp - 1.25 * m, 1);
  const inv = (a: number) => Math.tan(a) - a;
  // Half tooth thickness angle at pitch circle (no backlash).
  const halfPitchAngle = Math.PI / (2 * z);
  const invAlpha = inv(alpha);
  const rStart = Math.max(rb, rf);

  const flank: { r: number; phi: number }[] = [];
  for (let i = 0; i <= flankSegs; i++) {
    const r = rStart + ((ra - rStart) * i) / flankSegs;
    const a = Math.acos(Math.min(1, rb / r));
    // Angular offset from tooth centre line
    const phi = halfPitchAngle + invAlpha - inv(a);
    flank.push({ r, phi });
  }

  const out: P2[] = [];
  const step = (Math.PI * 2) / z;
  for (let t = 0; t < z; t++) {
    const c = t * step;
    const rootHalf = step / 2;
    // root (centre of gap before this tooth)
    out.push(polar(rf, c - rootHalf));
    out.push(polar(rf, c - flank[0]!.phi - (rootHalf - flank[0]!.phi) * 0.35));
    // rising flank
    for (let i = 0; i < flank.length; i++) out.push(polar(flank[i]!.r, c - flank[i]!.phi));
    // tip land
    for (let i = flank.length - 1; i >= 0; i--) out.push(polar(flank[i]!.r, c + flank[i]!.phi));
    out.push(polar(rf, c + flank[0]!.phi + (rootHalf - flank[0]!.phi) * 0.35));
  }
  return out;
}

function polar(r: number, a: number): P2 {
  return [Math.cos(a) * r, Math.sin(a) * r];
}

export const gearRadii = (teeth: number, module: number) => ({
  pitch: (teeth * module) / 2,
  tip: (teeth * module) / 2 + module,
  root: (teeth * module) / 2 - 1.25 * module,
});

/**
 * Roller-chain sprocket outline (ISO 606-style seat/tip approximation).
 * Roller seats are centred on the pitch circle; tooth tips sit half a pitch
 * between them.
 */
export function sprocketOutline(teeth: number, pitch: number, rollerDia: number, seatSegs = 8): P2[] {
  const z = teeth;
  const rp = pitch / (2 * Math.sin(Math.PI / z));
  const rs = 0.505 * rollerDia + 0.069; // seating radius
  const ro = (pitch * (0.6 + 1 / Math.tan(Math.PI / z))) / 2; // tip radius
  const out: P2[] = [];
  const seatHalf = (65 * Math.PI) / 180;
  for (let k = 0; k < z; k++) {
    const a = (2 * Math.PI * k) / z;
    const cx = Math.cos(a) * rp;
    const cy = Math.sin(a) * rp;
    // seat arc faces the gear centre: angles around (a + π)
    for (let i = 0; i <= seatSegs; i++) {
      const t = a + Math.PI + seatHalf - (2 * seatHalf * i) / seatSegs;
      out.push([cx + Math.cos(t) * rs, cy + Math.sin(t) * rs]);
    }
    // flank up to a slightly flattened tip
    const at = a + Math.PI / z;
    const tipHalf = (0.12 * Math.PI) / z;
    out.push([Math.cos(at - tipHalf) * ro, Math.sin(at - tipHalf) * ro]);
    out.push([Math.cos(at + tipHalf) * ro, Math.sin(at + tipHalf) * ro]);
  }
  return out;
}

export const sprocketPitchRadius = (teeth: number, pitch: number) => pitch / (2 * Math.sin(Math.PI / teeth));

export interface SprocketOptions {
  teeth: number;
  pitch: number;
  rollerDiameter: number;
  /** Axial width of the toothed rim (must be narrower than the chain's inner width). */
  toothWidth: number;
  /** Centre plane along X. */
  x: number;
  boreRadius: number;
  hub: { radius: number; width: number };
  /** Optional thinner web between hub and rim, with lightening holes. */
  web?: { width: number; holes: number; holeRadius: number };
  /** Rotation of the tooth pattern (radians, in the (z, y) plane). */
  phase?: number;
}

/**
 * Roller-chain sprocket around the X axis: toothed rim (with chamfered tooth
 * flanks), optional lightened web, and a wider hub. Shapes are drawn in the
 * (z, y) plane like every other X-extruded part.
 */
export function buildSprocket(o: SprocketOptions): BufferGeometry {
  const extrude = (pts: P2[], holes: P2[][], x0: number, x1: number, bevel: number) => [
    extrudeAlongX(shapeFrom(pts, holes), x0, x1, bevel, 8),
  ];
  const rp = sprocketPitchRadius(o.teeth, o.pitch);
  const rimInner = o.web ? rp - o.rollerDiameter / 2 - 6 : o.hub.radius - 0.5;
  const ph = o.phase ?? 0;
  const c = Math.cos(ph);
  const s = Math.sin(ph);
  const outline = sprocketOutline(o.teeth, o.pitch, o.rollerDiameter).map(([z, y]) => [z * c - y * s, z * s + y * c] as P2);
  const circle = (r: number, n: number, cx = 0, cy = 0) => {
    const out: P2[] = [];
    for (let i = 0; i < n; i++) {
      const a = (-i / n) * Math.PI * 2;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  };
  const parts: BufferGeometry[] = [];
  const tw = o.toothWidth / 2;
  parts.push(...extrude(outline, [circle(rimInner, 96)], o.x - tw, o.x + tw, Math.min(0.8, tw * 0.4)));
  if (o.web) {
    const holes: P2[][] = [circle(o.hub.radius - 0.5, 64)];
    const rm = (o.hub.radius + rimInner) / 2;
    for (let k = 0; k < o.web.holes; k++) {
      const a = ph + (k / o.web.holes) * Math.PI * 2;
      holes.push(circle(o.web.holeRadius, 32, Math.cos(a) * rm, Math.sin(a) * rm));
    }
    const ww = o.web.width / 2;
    parts.push(...extrude(circle(rimInner + 0.5, 96).reverse(), holes, o.x - ww, o.x + ww, 0.5));
  }
  const hw = o.hub.width / 2;
  parts.push(...extrude(circle(o.hub.radius, 64).reverse(), [circle(o.boreRadius, 48)], o.x - hw, o.x + hw, 0.6));
  return merge(parts);
}
