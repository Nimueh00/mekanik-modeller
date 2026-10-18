import { type Camera, type Intersection, type Object3D, Raycaster, Vector2, Vector3 } from 'three';
import type { PartRegistry } from '../core/registry';
import { PARTS } from '../watch/catalog';
import { KEYLESS, SCENE_PER_MM } from '../watch/specs';
import { dragDegrees } from './crown';

/** Hits on the stem this far (scene units) outside the crown's inner face count as the crown. */
const CROWN_FROM_X = (KEYLESS.crown.x - 0.1) * SCENE_PER_MM;

const isVisible = (o: Object3D | null): boolean => {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
};

export interface CrownDragOptions {
  /** Parent of the canvas: the press is caught here, before the orbit controls see it. */
  container: HTMLElement;
  canvas: HTMLElement;
  camera: Camera;
  registry: PartRegistry;
  /** Same hit filter as the selection's (ghost surfaces are not hit). */
  filter?: (object: Object3D) => boolean;
  /** Called with the crown rotation for each pointer move, degrees (positive = winding sense). */
  onTurn: (deg: number) => void;
  /** A press on the crown that never moved: a click on the stem (select it). */
  onClick: () => void;
}

/**
 * Turn the crown by dragging it in the model. A press on the crown is taken
 * away from the orbit controls; the drag moves the crown's surface under the
 * pointer (the crown turns the way the pointer pushes the side facing the
 * viewer), and any drag elsewhere orbits as usual. A press that does not move
 * is still a click (the selection never sees it, so `onClick` stands in).
 */
export function attachCrownDrag(o: CrownDragOptions): void {
  const ray = new Raycaster();
  const ndc = new Vector2();
  const axisWorld = new Vector3();
  const origin = new Vector3();
  const tangent = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const stem = () => o.registry.get(PARTS.windingStem.id);

  /** The crown under the pointer, or null (something else in front, hidden, not the crown). */
  const crownHit = (cx: number, cy: number): Intersection | null => {
    const r = o.canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, o.camera);
    // cheap test first: only the stem, so that a pointer moving over the model costs next to nothing
    const own = ray.intersectObject(stem().root, true).find((h) => isVisible(h.object) && (!o.filter || o.filter(h.object)));
    if (!own || own.object.worldToLocal(own.point.clone()).x < CROWN_FROM_X) return null;
    // then make sure no other visible part is in front of it
    for (const h of ray.intersectObject(o.registry.root, true)) {
      if (!isVisible(h.object) || (o.filter && !o.filter(h.object))) continue;
      return h.object.userData.partId === PARTS.windingStem.id && h.distance <= own.distance + 1e-6 ? own : null;
    }
    return null;
  };

  /** Unit screen direction in which the surface point facing the viewer moves for a turn against the winding sense. */
  const screenAxis = (hit: Intersection): [number, number] | null => {
    const root = o.registry.root;
    root.updateMatrixWorld(true);
    // the outward stem axis (+X of the movement frame) and a point on it
    axisWorld.set(1, 0, 0).transformDirection(root.matrixWorld);
    hit.object.localToWorld(origin.set(0, 0, 0));
    // a right-handed turn about the outward axis moves a surface point by axis × radius vector
    tangent.crossVectors(axisWorld, a.copy(hit.point).sub(origin));
    if (tangent.lengthSq() < 1e-12) return null;
    tangent.normalize();
    const r = o.canvas.getBoundingClientRect();
    const project = (p: Vector3, out: Vector2) => {
      const v = b.copy(p).project(o.camera);
      return out.set((v.x * r.width) / 2, (-v.y * r.height) / 2);
    };
    const p0 = project(hit.point, new Vector2());
    const p1 = project(a.copy(hit.point).addScaledVector(tangent, 0.5), new Vector2());
    const d = p1.sub(p0);
    const len = d.length();
    return len < 1e-6 ? null : [d.x / len, d.y / len];
  };

  o.container.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target !== o.canvas || e.button !== 0) return;
      const hit = crownHit(e.clientX, e.clientY);
      const axis = hit && screenAxis(hit);
      if (!axis) return;
      // keep the orbit controls (and the selection) out of it
      e.stopPropagation();
      o.canvas.setPointerCapture(e.pointerId);
      let last: [number, number] = [e.clientX, e.clientY];
      let moved = false;
      const move = (m: PointerEvent) => {
        if (m.pointerId !== e.pointerId) return;
        const delta: [number, number] = [m.clientX - last[0], m.clientY - last[1]];
        last = [m.clientX, m.clientY];
        moved = true;
        o.onTurn(dragDegrees(delta, axis));
      };
      const end = (u: PointerEvent) => {
        if (u.pointerId !== e.pointerId) return;
        o.canvas.removeEventListener('pointermove', move);
        o.canvas.removeEventListener('pointerup', end);
        o.canvas.removeEventListener('pointercancel', end);
        o.canvas.style.cursor = '';
        if (!moved) o.onClick();
      };
      o.canvas.style.cursor = 'grabbing';
      o.canvas.addEventListener('pointermove', move);
      o.canvas.addEventListener('pointerup', end);
      o.canvas.addEventListener('pointercancel', end);
    },
    true,
  );

  // a hand cursor over the crown
  let hoverAt = 0;
  o.canvas.addEventListener('pointermove', (e) => {
    if (e.buttons !== 0) return;
    const now = performance.now();
    if (now - hoverAt < 80) return;
    hoverAt = now;
    o.canvas.style.cursor = crownHit(e.clientX, e.clientY) ? 'grab' : '';
  });
}
