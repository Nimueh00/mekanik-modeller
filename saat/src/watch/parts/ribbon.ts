import { BufferAttribute, BufferGeometry } from 'three';
import { SCENE_PER_MM } from '../specs';

/**
 * A flat ribbon along a centre line, whose vertices are rewritten in place
 * (no new geometry per frame): four faces per sample, flat-shaded per face, the
 * same layout as the balance spring. "Outer" is the side away from the origin
 * of the points' frame.
 */
export class Ribbon {
  readonly geometry = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;

  constructor(
    private readonly samples: number,
    private readonly y: readonly [number, number],
    private readonly thickness: number,
  ) {
    this.pos = new Float32Array(samples * 8 * 3);
    this.nor = new Float32Array(samples * 8 * 3);
    const idx: number[] = [];
    for (let i = 0; i < samples - 1; i++) {
      for (let f = 0; f < 4; f++) {
        const a = i * 8 + f * 2;
        const b = a + 1;
        const c = a + 8;
        const d = b + 8;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(this.nor, 3));
    this.geometry.setIndex(idx);
  }

  /** Rewrite the ribbon from (x, z) pairs in mm, one pair per sample. */
  update(points: ArrayLike<number>): void {
    const n = this.samples;
    const [y0, y1] = this.y;
    const h = this.thickness / 2;
    const S = SCENE_PER_MM;
    const P = this.pos;
    const N = this.nor;
    const set = (k: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
      P[k * 3] = x * S;
      P[k * 3 + 1] = y * S;
      P[k * 3 + 2] = z * S;
      N[k * 3] = nx;
      N[k * 3 + 1] = ny;
      N[k * 3 + 2] = nz;
    };
    for (let i = 0; i < n; i++) {
      const px = points[2 * i]!;
      const pz = points[2 * i + 1]!;
      const ax = points[2 * Math.max(0, i - 1)]!;
      const az = points[2 * Math.max(0, i - 1) + 1]!;
      const bx = points[2 * Math.min(n - 1, i + 1)]!;
      const bz = points[2 * Math.min(n - 1, i + 1) + 1]!;
      const tx = bx - ax;
      const tz = bz - az;
      const l = Math.hypot(tx, tz) || 1;
      let nx = -tz / l;
      let nz = tx / l;
      if (nx * px + nz * pz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const ox = px + nx * h;
      const oz = pz + nz * h;
      const ix = px - nx * h;
      const iz = pz - nz * h;
      const k = i * 8;
      set(k, ox, y0, oz, nx, 0, nz);
      set(k + 1, ox, y1, oz, nx, 0, nz);
      set(k + 2, ix, y1, iz, -nx, 0, -nz);
      set(k + 3, ix, y0, iz, -nx, 0, -nz);
      set(k + 4, ox, y1, oz, 0, 1, 0);
      set(k + 5, ix, y1, iz, 0, 1, 0);
      set(k + 6, ix, y0, iz, 0, -1, 0);
      set(k + 7, ox, y0, oz, 0, -1, 0);
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('normal') as BufferAttribute).needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();
  }
}
