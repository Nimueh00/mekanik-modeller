import { BufferAttribute, type BufferGeometry, CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';
import { type P2, roundCorners } from '../../core/geometry/profile';
import {
  GAP_ANGLE,
  JUMPER_PIVOT,
  JUMPER_TIP,
  numeralLayout,
  RING_PITCH_DEG,
  RING_TEETH,
} from '../dateWork';
import { DATE_RING } from '../specs';
import { circle, cylinderY, merge, polarY, slab, toScene } from './common';

/**
 * Date ring and jumper. The ring is a plain slab with internal teeth; the
 * numerals are painted on a canvas (when there is one: tests run without) and
 * mapped on the top by a planar projection, so they stay put on the ring.
 */

const TEXTURE_SIZE = 1024;
const [Y0, Y1] = DATE_RING.y;

/** Inner outline of the ring: teeth pointing inward, gaps at GAP_ANGLE + k·pitch (clockwise in the numbers: a hole). */
export function ringTeethOutline(): P2[] {
  const p = RING_PITCH_DEG;
  const { tipRadius: tip, rootRadius: root } = DATE_RING;
  const pts: P2[] = [];
  for (let k = 0; k < RING_TEETH; k++) {
    const gap = GAP_ANGLE + k * p;
    const tooth = gap + p / 2;
    pts.push(
      polarY(root, gap - 0.15 * p),
      polarY(root, gap + 0.15 * p),
      polarY(tip, tooth - 0.125 * p),
      polarY(tip, tooth + 0.125 * p),
    );
  }
  return pts;
}

export interface DateRingGeometry {
  ring: BufferGeometry;
}

/** The date ring (tarih halkası) in the movement frame, scene units, with UVs for the numeral texture. */
export function buildDateRing(): DateRingGeometry {
  const R = DATE_RING.outerRadius;
  const body = slab(circle(R, [0, 0], 192), [ringTeethOutline()], Y0, Y1, 0.02);
  const g = merge([body]);
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[2 * i] = pos.getX(i) / (2 * R) + 0.5;
    uv[2 * i + 1] = 0.5 - pos.getZ(i) / (2 * R);
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return { ring: toScene(g) };
}

/**
 * Paint the numerals: each stands at its place on the ring, turned so that in
 * the window (at 3 o'clock) it reads upright with 12 o'clock up. Returns null
 * where there is no canvas (tests).
 */
export function createDateTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const k = TEXTURE_SIZE / (2 * DATE_RING.outerRadius);
  const c = TEXTURE_SIZE / 2;
  ctx.fillStyle = '#f2eee3';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  ctx.fillStyle = '#16161a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(1.05 * k)}px Helvetica, Arial, sans-serif`;
  for (const n of numeralLayout()) {
    const a = (n.angle * Math.PI) / 180;
    const x = c + n.radius * Math.cos(a) * k;
    const z = c - n.radius * Math.sin(a) * k;
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-a);
    ctx.fillText(String(n.day), 0, 0.04 * k);
    ctx.restore();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearFilter;
  return tex;
}

/** The jumper (atlama yayı), built in the frame of its stud: a spring arm with a V tip, resting in a gap of the ring. */
export function buildJumper(): BufferGeometry {
  const L: P2 = [JUMPER_TIP[0] - JUMPER_PIVOT[0], JUMPER_TIP[1] - JUMPER_PIVOT[1]];
  const len = Math.hypot(L[0], L[1]);
  const u: P2 = [L[0] / len, L[1] / len];
  const n: P2 = [-u[1], u[0]];
  const at = (s: number, t: number): P2 => [u[0] * s + n[0] * t, u[1] * s + n[1] * t];
  const outline = roundCorners(
    [at(-0.4, -0.3), at(0.2, -0.2), at(len * 0.6, -0.14), at(len - 0.18, -0.12), at(len + 0.05, 0), at(len - 0.18, 0.12), at(len * 0.6, 0.14), at(0.2, 0.2), at(-0.4, 0.3)],
    [0.2, 0.1, 0, 0.03, 0.02, 0.03, 0, 0.1, 0.2],
    true,
    3,
  );
  const arm = slab(outline, [circle(0.15, [0, 0], 16).reverse()], DATE_RING.jumper.y[0], DATE_RING.jumper.y[1], 0.01);
  const stud = cylinderY(0.2, 0, DATE_RING.jumper.y[1] + 0.05, 18);
  return toScene(merge([arm, stud]));
}
