import { Group, type Object3D } from 'three';

export type Vec3 = readonly [number, number, number];

/** Layer identifiers are machine specific; the core treats them as opaque strings. */
export type LayerId = string;

export interface LayerDef {
  id: LayerId;
  nameTr: string;
  /** 1 = removed first. Drives the order of the explode timeline. */
  order: number;
}

export interface PartInfo {
  function: string;
  material: string;
  notes: string;
}

export interface PartDef {
  id: string;
  nameTr: string;
  group: LayerId;
  /** Where the part's root moves to when fully exploded (scene units, world axes). */
  explodeOffset: Vec3;
  /** Removal order inside its layer (0 first). */
  explodeOrder: number;
  info: PartInfo;
}

/**
 * Every registered part is wrapped in two nested groups:
 *
 *   root    ← explode transform only (written by the disassembly system)
 *    └ motion ← kinematic transform only (written by the machine each frame)
 *        └ meshes
 *
 * Keeping the two transforms on separate nodes means kinematics keeps running
 * unchanged while a part is exploded, and neither system can clobber the other.
 */
export interface PartNode {
  def: PartDef;
  root: Group;
  motion: Group;
}

export class PartRegistry {
  private parts = new Map<string, PartNode>();
  private layers = new Map<LayerId, LayerDef>();
  readonly root = new Group();

  constructor() {
    this.root.name = 'parts';
  }

  defineLayers(defs: readonly LayerDef[]): void {
    for (const d of defs) this.layers.set(d.id, d);
  }

  /**
   * Register a part. `content` is added under the part's motion node; the
   * caller places it in the motion node's local frame.
   */
  add(def: PartDef, ...content: Object3D[]): PartNode {
    if (this.parts.has(def.id)) throw new Error(`duplicate part id "${def.id}"`);
    if (!this.layers.has(def.group)) throw new Error(`part "${def.id}" uses unknown layer "${def.group}"`);
    const root = new Group();
    root.name = `part:${def.id}`;
    const motion = new Group();
    motion.name = `motion:${def.id}`;
    root.add(motion);
    for (const c of content) {
      c.traverse((o) => {
        o.userData.partId = def.id;
      });
      motion.add(c);
    }
    const node: PartNode = { def, root, motion };
    this.parts.set(def.id, node);
    this.root.add(root);
    return node;
  }

  get(id: string): PartNode {
    const p = this.parts.get(id);
    if (!p) throw new Error(`unknown part "${id}"`);
    return p;
  }

  all(): PartNode[] {
    return [...this.parts.values()];
  }

  inLayer(layer: LayerId): PartNode[] {
    return this.all().filter((p) => p.def.group === layer);
  }

  layerList(): LayerDef[] {
    return [...this.layers.values()].sort((a, b) => a.order - b.order);
  }

  /** Apply an explode amount (0..1) per part; the timeline lives in a later phase. */
  setExplode(amountFor: (p: PartNode) => number): void {
    for (const p of this.parts.values()) {
      const t = amountFor(p);
      const [x, y, z] = p.def.explodeOffset;
      p.root.position.set(x * t, y * t, z * t);
    }
  }

  setLayerVisible(layer: LayerId, visible: boolean): void {
    for (const p of this.inLayer(layer)) p.root.visible = visible;
  }
}
