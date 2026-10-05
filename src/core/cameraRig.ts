import { Quaternion, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LayerId, PartRegistry, Vec3 } from './registry';

export interface CameraPreset {
  id: string;
  label: string;
  title?: string;
  position: Vec3;
  target: Vec3;
  /** Part or layer whose explode displacement the view should follow. */
  follow?: { part?: string; layer?: LayerId };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Smooth camera presets. The orbit offset is interpolated by direction (slerp)
 * and distance, the target linearly, so a transition never cuts through the
 * subject. A preset may follow a part/layer, so "Krank" keeps framing the
 * crankshaft after it has been exploded.
 */
export class CameraRig {
  private tween: { t: number; dur: number; fromDir: Vector3; toDir: Vector3; fromDist: number; toDist: number; fromTarget: Vector3; toTarget: Vector3 } | null = null;
  private follow: CameraPreset['follow'];
  private followApplied = new Vector3();
  private active: string | null = null;
  private listeners: ((id: string | null) => void)[] = [];

  constructor(
    private camera: PerspectiveCamera,
    private controls: OrbitControls,
    private registry: PartRegistry,
  ) {
    // Any manual orbit/zoom cancels the tween and deselects the preset.
    controls.addEventListener('start', () => {
      this.tween = null;
      this.setActive(null);
    });
  }

  get activeId(): string | null {
    return this.active;
  }

  onActive(l: (id: string | null) => void): void {
    this.listeners.push(l);
  }

  private setActive(id: string | null): void {
    if (this.active === id) return;
    this.active = id;
    for (const l of this.listeners) l(id);
  }

  private followOffset(f: CameraPreset['follow'], out: Vector3): Vector3 {
    out.set(0, 0, 0);
    if (!f) return out;
    if (f.part) {
      out.copy(this.registry.get(f.part).root.position);
    } else if (f.layer) {
      const parts = this.registry.inLayer(f.layer);
      for (const p of parts) out.add(p.root.position);
      if (parts.length) out.multiplyScalar(1 / parts.length);
    }
    return out;
  }

  go(preset: CameraPreset, seconds = 1.3): void {
    const tmp = new Vector3();
    // Compensate the follow displacement we currently carry so presets are expressed in assembled coordinates.
    this.follow = preset.follow;
    const toFollow = this.followOffset(preset.follow, new Vector3());
    const toTarget = new Vector3(...preset.target).add(toFollow);
    const toPos = new Vector3(...preset.position).add(toFollow);
    const toOffset = tmp.copy(toPos).sub(toTarget);
    const fromOffset = new Vector3().copy(this.camera.position).sub(this.controls.target);
    this.tween = {
      t: 0,
      dur: seconds,
      fromDir: fromOffset.clone().normalize(),
      toDir: toOffset.clone().normalize(),
      fromDist: fromOffset.length(),
      toDist: toOffset.length(),
      fromTarget: this.controls.target.clone(),
      toTarget,
    };
    this.followApplied.copy(toFollow);
    this.setActive(preset.id);
  }

  /** Snap without animation (initial framing). */
  jump(preset: CameraPreset): void {
    this.go(preset, 0.0001);
    this.update(1);
  }

  update(dt: number): void {
    const tw = this.tween;
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = ease(tw.t);
      // Retarget the destination as the followed part moves.
      const f = this.followOffset(this.follow, new Vector3());
      const shift = f.clone().sub(this.followApplied);
      tw.toTarget.add(shift);
      this.followApplied.copy(f);
      const q = new Quaternion().setFromUnitVectors(tw.fromDir, tw.toDir);
      const qi = new Quaternion().slerp(q, e);
      const dir = tw.fromDir.clone().applyQuaternion(qi);
      const dist = tw.fromDist + (tw.toDist - tw.fromDist) * e;
      this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
      if (tw.t >= 1) this.tween = null;
      return;
    }
    // Resting on a followed part: carry camera and target along with its explode displacement.
    if (this.follow) {
      const f = this.followOffset(this.follow, new Vector3());
      const d = f.clone().sub(this.followApplied);
      if (d.lengthSq() > 0) {
        this.controls.target.add(d);
        this.camera.position.add(d);
        this.followApplied.copy(f);
      }
    }
  }
}
