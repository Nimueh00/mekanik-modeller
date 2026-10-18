import { type Material, type Mesh, type MeshPhysicalMaterial } from 'three';
import type { PartRegistry } from '../core/registry';

/**
 * Surfaces that cover the train, by layer: the material of the layer's body
 * (jewels, screws and steel parts in the same layers stay solid) and how
 * opaque it stays.
 */
export const GHOST_SURFACES: Readonly<Record<string, { material: string; opacity: number }>> = {
  plate: { material: 'plate', opacity: 0.16 },
  bridges: { material: 'rhodium', opacity: 0.2 },
  dial: { material: 'dial', opacity: 0.14 },
};

export type WatchView = 'solid' | 'ghost';

/**
 * "Hayalet" view: the plate, the bridges and the dial turn translucent so the
 * train and the escapement show through.
 *
 * The materials are found through the registry: the body material of each ghost
 * layer is ghosted, and then every other mesh that shares it
 * follows (the balance cock, and later the rotor, are rhodium like the
 * bridges). Ghosting swaps in a transparent clone and puts the original back
 * for the solid view; the shared originals are never edited, so a part keeps
 * its look in every other view and its finish (the clone keeps the maps).
 * Ghosted surfaces stop casting shadows (a see-through bridge would still
 * throw a solid shadow).
 */
export class GhostView {
  private view: WatchView = 'solid';
  /** original material → transparent clone */
  private clones = new Map<Material, MeshPhysicalMaterial>();
  private swapped = new Map<Mesh, { material: Material; cast: boolean }>();
  private listeners: (() => void)[] = [];

  constructor(
    private registry: PartRegistry,
    /** Called before any material is swapped (lets the selection put its highlight clones back). */
    private beforeSwap: () => void,
  ) {}

  get mode(): WatchView {
    return this.view;
  }

  /** Whether a mesh is currently drawn as a ghost (picking and line-of-sight tests skip these). */
  isGhost(mesh: { material?: unknown }): boolean {
    return this.view === 'ghost' && this.clones.has(this.originalOf(mesh as Mesh));
  }

  onChange(l: () => void): void {
    this.listeners.push(l);
  }

  private originalOf(mesh: Mesh): Material {
    return this.swapped.get(mesh)?.material ?? (mesh.material as Material);
  }

  private ghostMaterials(): Map<Material, number> {
    const found = new Map<Material, number>();
    for (const [layer, surface] of Object.entries(GHOST_SURFACES)) {
      for (const part of this.registry.inLayer(layer)) {
        part.motion.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh && (m.material as Material).name === surface.material) found.set(m.material as Material, surface.opacity);
        });
      }
    }
    return found;
  }

  /** Switch the view; recomputes which meshes to ghost each time (the catalogue may have grown). */
  set(view: WatchView): void {
    if (view === this.view && !(view === 'ghost' && this.swapped.size === 0)) return;
    this.beforeSwap();
    this.restore();
    this.view = view;
    if (view === 'ghost') {
      const targets = this.ghostMaterials();
      for (const part of this.registry.all()) {
        part.motion.traverse((o) => {
          const m = o as Mesh;
          const base = m.isMesh ? (m.material as Material) : undefined;
          const opacity = base ? targets.get(base) : undefined;
          if (!base || opacity === undefined) return;
          let g = this.clones.get(base);
          if (!g) {
            g = (base as MeshPhysicalMaterial).clone();
            g.transparent = true;
            g.opacity = opacity;
            g.depthWrite = false;
            this.clones.set(base, g);
          }
          this.swapped.set(m, { material: base, cast: m.castShadow });
          m.material = g;
          m.castShadow = false;
        });
      }
    }
    for (const l of this.listeners) l();
  }

  private restore(): void {
    for (const [m, s] of this.swapped) {
      m.material = s.material;
      m.castShadow = s.cast;
    }
    this.swapped.clear();
  }
}
