import { DataTexture, LinearFilter, LinearMipmapLinearFilter, type Material, type Mesh, RepeatWrapping, RGBAFormat, UnsignedByteType, Float32BufferAttribute } from 'three';
import { SCENE_PER_MM } from './specs';

/**
 * Procedural surface finishes of the watch, as height fields turned into
 * data textures (used as bump and roughness maps; the colour stays the
 * metal's own):
 *
 *   perlage        the main plate: overlapping circles of about 1 mm, each
 *                  brushed with its own set of concentric rings
 *   Côtes de Genève  the bridges: parallel, slightly wavy stripes about
 *                  1.75 mm wide
 *
 * Sizes are real: the textures are laid on the part by a planar mapping in
 * scene units (`applyPlanarUv`, 10 units to the mm) and a tile covers a known
 * number of millimetres.
 */

/** Edge of a perlage tile, mm (5 × 5 cells of 0.8 mm). */
export const PERLAGE_TILE_MM = 4;
/** Diameter of one perlage circle, mm. */
export const PERLAGE_CIRCLE_MM = 1.08;
/** Width of one Genève stripe, mm. */
export const GENEVA_STRIPE_MM = 1.75;
/** Stripes per tile (the tile is stripes × width mm square). */
export const GENEVA_STRIPES = 4;
export const GENEVA_TILE_MM = GENEVA_STRIPE_MM * GENEVA_STRIPES;

/** Small deterministic generator (same one as the motor's noise textures). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Perlage height field, `size`² values in 0…1, tileable. Circles are placed
 * on a jittered 5 × 5 grid and painted in random order, so later ones cut into
 * earlier ones; each carries concentric brush rings whose centre sits a little
 * off the circle's centre (as the rotating peg wanders), a ring pitch of about
 * 0.06 mm and a darker rim where the circle ends.
 */
export function perlageHeights(size: number, seed = 11): Float32Array {
  const rand = rng(seed);
  const h = new Float32Array(size * size).fill(0.5);
  const pxPerMm = size / PERLAGE_TILE_MM;
  const cells = 5;
  const cell = size / cells;
  const radius = (PERLAGE_CIRCLE_MM / 2) * pxPerMm;
  const pitch = 0.06 * pxPerMm;
  const circles: { x: number; y: number; ox: number; oy: number; phase: number; tone: number }[] = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      circles.push({
        x: (i + 0.5 + (rand() - 0.5) * 0.45) * cell,
        y: (j + 0.5 + (rand() - 0.5) * 0.45) * cell,
        ox: (rand() - 0.5) * radius * 0.35,
        oy: (rand() - 0.5) * radius * 0.35,
        phase: rand() * Math.PI * 2,
        tone: 0.42 + rand() * 0.2,
      });
    }
  }
  // random painting order
  for (let i = circles.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [circles[i], circles[j]] = [circles[j]!, circles[i]!];
  }
  const reach = Math.ceil(radius) + 1;
  for (const c of circles) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > radius) continue;
        const ring = Math.hypot(dx - c.ox, dy - c.oy);
        const brush = 0.5 + 0.5 * Math.cos((ring / pitch) * Math.PI * 2 + c.phase);
        // a darker rim where the circle ends, gently lifted towards the middle
        const rim = smooth(radius * 0.78, radius, d);
        const v = c.tone + 0.38 * brush * (1 - 0.55 * rim) - 0.22 * rim;
        const px = (((Math.round(c.x) + dx) % size) + size) % size;
        const py = (((Math.round(c.y) + dy) % size) + size) % size;
        h[py * size + px] = Math.min(1, Math.max(0, v));
      }
    }
  }
  return h;
}

/**
 * Côtes de Genève height field, `size`² values in 0…1, tileable. Stripes run
 * along x; each is a soft ridge with a sharp valley between it and the next,
 * the whole set swings slightly (one wave per tile), and a fine brushing grain
 * runs along the stripes.
 */
export function genevaHeights(size: number, seed = 5): Float32Array {
  const rand = rng(seed);
  const h = new Float32Array(size * size);
  const grain = Array.from({ length: size }, () => rand());
  const stripe = size / GENEVA_STRIPES;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = 0.04 * size * Math.sin((x / size) * Math.PI * 2);
      const v = (((y + wave) % size) + size) % size;
      const p = (v % stripe) / stripe; // 0…1 across one stripe
      // asymmetric ridge: rises slowly, falls into the valley quickly
      const ridge = Math.pow(Math.sin(Math.PI * Math.pow(p, 0.8)), 0.7);
      h[y * size + x] = Math.min(1, Math.max(0, 0.18 + 0.7 * ridge + 0.03 * (grain[y]! - 0.5)));
    }
  }
  return h;
}

/**
 * Wrap a height field as a data texture: grey RGBA, mapped to 0.35…1 so that
 * used as a roughness map (which scales the material's roughness) it only
 * ever roughens a little, and as a bump map it keeps the full relief.
 * The part UVs are plan coordinates in mm, so one tile of `tileMm` is a repeat of 1 / tileMm.
 */
export function heightTexture(heights: Float32Array, size: number, tileMm: number, rotationDeg = 0): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < heights.length; i++) {
    const v = Math.round((0.35 + 0.65 * heights[i]!) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.repeat.set(1 / tileMm, 1 / tileMm);
  tex.rotation = (rotationDeg * Math.PI) / 180;
  tex.center.set(0, 0);
  tex.needsUpdate = true;
  return tex;
}

let perlageTex: DataTexture | undefined;
let genevaTex: DataTexture | undefined;

/** Shared textures, built on first use. */
export function perlageTexture(): DataTexture {
  return (perlageTex ??= heightTexture(perlageHeights(512), 512, PERLAGE_TILE_MM));
}

/** Stripes tilted a little against the movement's axes, as they run across a bridge. */
export function genevaTexture(): DataTexture {
  return (genevaTex ??= heightTexture(genevaHeights(512), 512, GENEVA_TILE_MM, -28));
}

export type Finish = 'perlage' | 'geneva';

/**
 * Give every mesh whose material carries a finish (`userData.finish`) a
 * planar UV from its plan position (x, z of the geometry, scene units, scaled
 * by the material's `userData.uvPerUnit` so that a tile has its real size), which
 * the part geometries do not have of their own. Meshes that share a material
 * with a finish — a rotor in rhodium, say — are covered without being listed.
 * Call after the parts are built; meshes that already have UVs are left alone.
 */
export function applyPlanarUv(root: { traverse(cb: (o: unknown) => void): void }): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || m.geometry.getAttribute('uv')) return;
    if ((m.material as Material).userData.finish === undefined) return;
    const pos = m.geometry.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / SCENE_PER_MM;
      uv[i * 2 + 1] = pos.getZ(i) / SCENE_PER_MM;
    }
    m.geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    n++;
  });
  return n;
}
