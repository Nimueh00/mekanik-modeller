import { Box3, type Object3D, type PerspectiveCamera, Vector3 } from 'three';

/**
 * Keeps an exploded model in the free area of the screen. The stage centres
 * the orbit target in the free area and scales the picture with
 * `camera.zoom`; this works out how much zoom the parts need, from where
 * they really are on screen rather than from the size of the world box (a
 * movement stood on its edge spreads along the line of sight, which a
 * world-axis box cannot tell from a spread across the picture).
 */

const corner = new Vector3();

/**
 * Largest distance of any point from the view axis, as a fraction of the
 * camera's half-extent at zoom 1, separately across and up the picture. The
 * orbit target (on the view axis) is the centre. Points at or behind the near
 * plane count as at the near plane.
 */
export function viewExtents(camera: PerspectiveCamera, points: Iterable<Vector3>): { x: number; y: number } {
  camera.updateMatrixWorld();
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  let x = 0;
  let y = 0;
  for (const p of points) {
    corner.copy(p).applyMatrix4(camera.matrixWorldInverse);
    const depth = Math.max(-corner.z, camera.near);
    x = Math.max(x, Math.abs(corner.x) / depth / (tanHalf * camera.aspect));
    y = Math.max(y, Math.abs(corner.y) / depth / tanHalf);
  }
  return { x, y };
}

/**
 * Zoom at which the points fill `margin` of the free area, which is
 * `freeW` × `freeH` of the full picture (fractions of 1).
 */
export function zoomToFit(ext: { x: number; y: number }, freeW: number, freeH: number, margin = 0.9): number {
  const zx = ext.x > 1e-9 ? (freeW * margin) / ext.x : Infinity;
  const zy = ext.y > 1e-9 ? (freeH * margin) / ext.y : Infinity;
  return Math.min(zx, zy);
}

const box = new Box3();

/** The eight corners of every visible part's world box (matrices brought up to date). */
export function partCorners(roots: Iterable<Object3D>, out: Vector3[] = []): Vector3[] {
  let n = 0;
  for (const r of roots) {
    if (!r.visible) continue;
    r.updateWorldMatrix(true, true);
    box.setFromObject(r);
    if (box.isEmpty()) continue;
    for (let i = 0; i < 8; i++) {
      (out[n] ??= new Vector3()).set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      n++;
    }
  }
  out.length = n;
  return out;
}
