import {
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  RepeatWrapping,
  RGBAFormat,
  type Texture,
} from 'three';

/**
 * Tileable value-noise texture (grayscale in RGB), remapped into [lo, hi].
 * Used as a subtle roughness/bump map so cast surfaces don't read as plastic;
 * a narrow range keeps it a texture rather than a pattern.
 */
function noiseTexture(size: number, octaves: number, seed: number, lo = 0, hi = 1): DataTexture {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const data = new Uint8Array(size * size * 4);
  const acc = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    const g = (x: number, y: number) => grid[((y + cells) % cells) * cells + ((x + cells) % cells)]!;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = g(ix, iy) + (g(ix + 1, iy) - g(ix, iy)) * sx;
        const b = g(ix, iy + 1) + (g(ix + 1, iy + 1) - g(ix, iy + 1)) * sx;
        acc[y * size + x]! += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < acc.length; i++) {
    const v = Math.round((lo + (hi - lo) * (acc[i]! / total)) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

let castNoise: Texture | undefined;
let fineNoise: Texture | undefined;

function cast(): Texture {
  if (!castNoise) {
    castNoise = noiseTexture(256, 6, 7, 0.78, 1);
    castNoise.repeat.set(0.02, 0.02); // ≈ 50 mm per tile at 1 unit = 1 mm
  }
  return castNoise;
}

function fine(): Texture {
  if (!fineNoise) {
    fineNoise = noiseTexture(128, 4, 31, 0.85, 1);
    fineNoise.repeat.set(0.12, 0.12);
  }
  return fineNoise;
}

export type MaterialKey =
  | 'castAluminum'
  | 'pistonAluminum'
  | 'forgedSteel'
  | 'machinedSteel'
  | 'chrome'
  | 'darkSteel'
  | 'bronze'
  | 'stampedSteel'
  | 'crinkleBlack'
  | 'blackPlastic'
  | 'guidePolymer'
  | 'ceramic'
  | 'rubber'
  | 'gasket'
  | 'chainSteel';

/**
 * Shared material library. Materials are created once and shared; callers that
 * need per-object variations (transparency, highlight) should `.clone()`.
 */
export class MaterialLibrary {
  private cache = new Map<MaterialKey, MeshPhysicalMaterial>();

  get(key: MaterialKey): MeshPhysicalMaterial {
    let m = this.cache.get(key);
    if (!m) {
      m = this.create(key);
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  private create(key: MaterialKey): MeshPhysicalMaterial {
    switch (key) {
      case 'castAluminum':
        // Sand/die cast: matte, slightly grainy, warm grey.
        return new MeshPhysicalMaterial({
          color: new Color('#a9a7a1'),
          metalness: 0.85,
          roughness: 0.66,
          roughnessMap: cast(),
          bumpMap: cast(),
          bumpScale: 0.25,
          side: DoubleSide,
        });
      case 'pistonAluminum':
        // Machined Al-Si piston: brighter, finer finish than the block.
        return new MeshPhysicalMaterial({
          color: new Color('#c9c8c2'),
          metalness: 0.9,
          roughness: 0.34,
          roughnessMap: fine(),
          bumpMap: fine(),
          bumpScale: 0.15,
        });
      case 'forgedSteel':
        // As-forged, shot-peened surface: dark, low gloss.
        return new MeshPhysicalMaterial({
          color: new Color('#7c7f84'),
          metalness: 0.95,
          roughness: 0.4,
        });
      case 'machinedSteel':
        // Ground journals: bright, tight reflections.
        return new MeshPhysicalMaterial({
          color: new Color('#d4d6d9'),
          metalness: 1,
          roughness: 0.16,
          clearcoat: 0.3,
          clearcoatRoughness: 0.2,
        });
      case 'chrome':
        return new MeshPhysicalMaterial({
          color: new Color('#f2f3f5'),
          metalness: 1,
          roughness: 0.05,
        });
      case 'darkSteel':
        // Black-oxide fasteners / gear teeth.
        return new MeshPhysicalMaterial({
          color: new Color('#3a3b3d'),
          metalness: 0.9,
          roughness: 0.38,
        });
      case 'bronze':
        return new MeshPhysicalMaterial({
          color: new Color('#b08a52'),
          metalness: 1,
          roughness: 0.3,
        });
      case 'stampedSteel':
        // Painted pressed-steel (oil pan): satin black.
        return new MeshPhysicalMaterial({
          color: new Color('#26272a'),
          metalness: 0.3,
          roughness: 0.48,
          clearcoat: 0.6,
          clearcoatRoughness: 0.35,
          side: DoubleSide,
        });
      case 'crinkleBlack':
        // Wrinkle-finish paint (valve cover): black, matte, coarse bump.
        return new MeshPhysicalMaterial({
          color: new Color('#1b1b1d'),
          metalness: 0.15,
          roughness: 0.62,
          roughnessMap: fine(),
          bumpMap: fine(),
          bumpScale: 0.9,
          clearcoat: 0.25,
          clearcoatRoughness: 0.6,
          side: DoubleSide,
        });
      case 'blackPlastic':
        // Glass-filled nylon housings (coils, injectors, connectors).
        return new MeshPhysicalMaterial({
          color: new Color('#161617'),
          metalness: 0,
          roughness: 0.45,
          clearcoat: 0.2,
          clearcoatRoughness: 0.4,
        });
      case 'guidePolymer':
        // PA46 chain guide / tensioner shoe facing: warm amber-brown.
        return new MeshPhysicalMaterial({
          color: new Color('#6b3f1d'),
          metalness: 0,
          roughness: 0.42,
          sheen: 0.3,
          sheenColor: new Color('#a06a3a'),
        });
      case 'ceramic':
        // Spark plug insulator: glazed alumina.
        return new MeshPhysicalMaterial({
          color: new Color('#ecebe6'),
          metalness: 0,
          roughness: 0.18,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
        });
      case 'rubber':
        return new MeshPhysicalMaterial({
          color: new Color('#0f0f10'),
          metalness: 0,
          roughness: 0.8,
        });
      case 'chainSteel':
        // Heat-treated chain plates: dark, blued, but with crisp reflections on the flat faces.
        return new MeshPhysicalMaterial({
          color: new Color('#2b2e33'),
          metalness: 1,
          roughness: 0.24,
          clearcoat: 0.4,
          clearcoatRoughness: 0.25,
        });
      case 'gasket':
        // Multi-layer steel head gasket with an elastomer coating.
        return new MeshPhysicalMaterial({
          color: new Color('#4a4d48'),
          metalness: 0.6,
          roughness: 0.5,
          side: DoubleSide,
        });
    }
  }
}
