import { Color, type Camera, type Material, type Mesh, type MeshPhysicalMaterial, type Object3D, Raycaster, Vector2 } from 'three';
import type { PartNode, PartRegistry } from './registry';

const GOLD = new Color('#ffb347');

/**
 * Click-to-select with an emissive highlight.
 *
 * Materials are shared between parts, so highlighting works on per-material
 * clones that are swapped onto the selected part's meshes. A per-frame check
 * re-applies the swap if another system (e.g. the block view mode) replaced a
 * mesh material in the meantime.
 */
export class Selection {
  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private current: PartNode | null = null;
  private meshes: Mesh[] = [];
  private base = new Map<Mesh, Material>();
  private highlightOf = new Map<Material, MeshPhysicalMaterial>();
  private highlights = new Set<Material>();
  private listeners: ((p: PartNode | null) => void)[] = [];

  constructor(
    private dom: HTMLElement,
    private camera: Camera,
    private registry: PartRegistry,
  ) {
    let down: { x: number; y: number } | null = null;
    dom.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return; // an orbit drag, not a click
      this.pick(e.clientX, e.clientY);
    });
  }

  get selected(): PartNode | null {
    return this.current;
  }

  onChange(l: (p: PartNode | null) => void): void {
    this.listeners.push(l);
  }

  private pick(cx: number, cy: number): void {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.registry.root, true);
    for (const h of hits) {
      if (!isVisible(h.object)) continue;
      const id = h.object.userData.partId as string | undefined;
      if (id) {
        this.select(id);
        return;
      }
    }
    this.select(null);
  }

  select(partId: string | null): void {
    if (this.current?.def.id === partId) return;
    this.restore();
    this.current = partId ? this.registry.get(partId) : null;
    if (this.current) {
      this.current.motion.traverse((o) => {
        if ((o as Mesh).isMesh) this.meshes.push(o as Mesh);
      });
    }
    for (const l of this.listeners) l(this.current);
  }

  private restore(): void {
    for (const [m, mat] of this.base) if (this.highlights.has(m.material as Material)) m.material = mat;
    this.base.clear();
    this.meshes = [];
  }

  private highlightFor(m: Material): MeshPhysicalMaterial {
    let h = this.highlightOf.get(m);
    if (!h) {
      h = (m as MeshPhysicalMaterial).clone();
      h.emissive = GOLD.clone();
      this.highlightOf.set(m, h);
      this.highlights.add(h);
    }
    return h;
  }

  /** Per-frame: keep the highlight applied and pulse it gently. */
  update(time: number): void {
    if (!this.current) return;
    const pulse = 0.2 + 0.1 * Math.sin(time * 3.2);
    for (const m of this.meshes) {
      const mat = m.material as Material;
      if (!this.highlights.has(mat)) {
        this.base.set(m, mat);
        m.material = this.highlightFor(mat);
      }
      (m.material as MeshPhysicalMaterial).emissiveIntensity = pulse;
    }
  }
}

function isVisible(o: Object3D | null): boolean {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}
