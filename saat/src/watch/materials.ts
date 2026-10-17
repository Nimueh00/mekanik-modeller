import { Color, DoubleSide, MeshPhysicalMaterial } from 'three';

export type WatchMaterialKey =
  | 'rhodium'
  | 'plate'
  | 'brass'
  | 'ruby'
  | 'blueSteel'
  | 'polishedSteel'
  | 'darkSteel'
  | 'balance'
  | 'hairspring'
  | 'dial'
  | 'dialPrint'
  | 'hands';

/**
 * Watch materials, same pattern as the core library: created once, shared;
 * callers that need per-object variations should `.clone()`. Surface
 * finishes (perlage, Côtes de Genève) come with the presentation package;
 * these are the plain metals and stones.
 */
export class WatchMaterials {
  private cache = new Map<WatchMaterialKey, MeshPhysicalMaterial>();

  get(key: WatchMaterialKey): MeshPhysicalMaterial {
    let m = this.cache.get(key);
    if (!m) {
      m = this.create(key);
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  private create(key: WatchMaterialKey): MeshPhysicalMaterial {
    switch (key) {
      case 'rhodium':
        // Rhodium-plated brass (plate, bridges): light grey-silver, satin.
        return new MeshPhysicalMaterial({
          color: new Color('#d3d5d8'),
          metalness: 1,
          roughness: 0.3,
          clearcoat: 0.25,
          clearcoatRoughness: 0.3,
        });
      case 'plate':
        // Rhodium-plated main plate: same metal, a duller satin finish so the bridges read on top of it.
        return new MeshPhysicalMaterial({
          color: new Color('#b4b7bb'),
          metalness: 1,
          roughness: 0.46,
        });
      case 'brass':
        // Gilt brass train wheels: warm gold.
        return new MeshPhysicalMaterial({
          color: new Color('#d9b263'),
          metalness: 1,
          roughness: 0.24,
        });
      case 'ruby':
        // Synthetic ruby (jewels, pallet stones, impulse pin): deep red, glassy.
        // Opaque on purpose: a transmissive material would cost a second scene pass.
        return new MeshPhysicalMaterial({
          color: new Color('#a3102f'),
          emissive: new Color('#3a0010'),
          metalness: 0,
          roughness: 0.06,
          clearcoat: 1,
          clearcoatRoughness: 0.02,
          specularIntensity: 1,
          ior: 1.77,
        });
      case 'blueSteel':
        // Heat-blued steel (screws, seconds hand).
        return new MeshPhysicalMaterial({
          color: new Color('#1d3f8f'),
          metalness: 0.85,
          roughness: 0.2,
          clearcoat: 0.6,
          clearcoatRoughness: 0.1,
          iridescence: 0.25,
          iridescenceIOR: 1.6,
        });
      case 'polishedSteel':
        // Polished steel (arbors, pinions, escape wheel, lever).
        return new MeshPhysicalMaterial({
          color: new Color('#e3e5e8'),
          metalness: 1,
          roughness: 0.12,
        });
      case 'darkSteel':
        // Screw slots, pivot holes: shadowed steel.
        return new MeshPhysicalMaterial({
          color: new Color('#2a2c30'),
          metalness: 0.8,
          roughness: 0.45,
        });
      case 'balance':
        // Glucydur (beryllium bronze) balance: pale gold.
        return new MeshPhysicalMaterial({
          color: new Color('#e3c27e'),
          metalness: 1,
          roughness: 0.18,
        });
      case 'hairspring':
        // Nivarox-type alloy: steel grey with a faint warm tint.
        return new MeshPhysicalMaterial({
          color: new Color('#b9b4ad'),
          metalness: 1,
          roughness: 0.22,
          side: DoubleSide,
        });
      case 'dial':
        // Silvered, matte dial.
        return new MeshPhysicalMaterial({
          color: new Color('#e9e8e4'),
          metalness: 0.35,
          roughness: 0.55,
          sheen: 0.4,
          sheenColor: new Color('#ffffff'),
        });
      case 'dialPrint':
        // Printed minute track.
        return new MeshPhysicalMaterial({
          color: new Color('#1b1c1f'),
          metalness: 0,
          roughness: 0.6,
        });
      case 'hands':
        // Polished, rhodium-plated hands and applied indices.
        return new MeshPhysicalMaterial({
          color: new Color('#f1f2f4'),
          metalness: 1,
          roughness: 0.08,
          clearcoat: 0.5,
          clearcoatRoughness: 0.05,
        });
    }
  }
}
