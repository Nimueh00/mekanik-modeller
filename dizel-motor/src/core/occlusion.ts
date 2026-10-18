import { BufferGeometry, type Camera, Mesh, type Object3D, Raycaster, Vector3 } from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// BVH-accelerated raycasting for every Mesh (selection clicks and label occlusion tests).
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

/**
 * Line-of-sight test for screen overlays (labels): is a world point on a part
 * actually visible, or is another part in front of it?
 *
 * Builds a bounding-volume hierarchy for each static geometry once
 * (`prepare`), so a test costs a few microseconds instead of a brute-force
 * triangle loop. Geometries that deform every frame are left out (they fall
 * back to the plain raycast) via `skip`.
 */
export class OcclusionProbe {
  private ray = new Raycaster();
  private dir = new Vector3();
  private origin = new Vector3();
  /** Optional hit filter (e.g. ignore geometry removed by a section plane). */
  filter?: (object: Object3D, point: Vector3) => boolean;

  constructor(
    private root: Object3D,
    private camera: Camera,
  ) {
    this.ray.firstHitOnly = true;
  }

  /** Build the BVHs (call once after the scene is built; ~0.1–0.5 s for a large model). */
  prepare(skip: (mesh: Mesh) => boolean = () => false): void {
    this.root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh || m.userData.sectionHelper || skip(m)) return;
      if (!m.geometry.boundsTree) m.geometry.computeBoundsTree();
    });
  }

  /**
   * True if the first surface the camera ray meets on the way to `point`
   * belongs to `partId` (or nothing is in front of the point at all).
   */
  sees(partId: string, point: Vector3): boolean {
    this.camera.getWorldPosition(this.origin);
    const dist = this.dir.subVectors(point, this.origin).length();
    this.dir.multiplyScalar(1 / dist);
    this.ray.set(this.origin, this.dir);
    this.ray.near = 0;
    this.ray.far = dist - 0.5;
    const hits = this.ray.intersectObject(this.root, true);
    for (const h of hits) {
      if (!visible(h.object)) continue;
      if (this.filter && !this.filter(h.object, h.point)) continue;
      return h.object.userData.partId === partId;
    }
    return true;
  }
}

function visible(o: Object3D | null): boolean {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}
