import { Box3, type Object3D, Vector3 } from 'three';
import type { CameraPreset } from '../core/cameraRig';
import type { LabelDef } from '../core/labels';
import type { PartRegistry } from '../core/registry';
import { AXES, type AxisName, MOVEMENT, SCENE_PER_MM } from '../watch/specs';

/**
 * Camera presets and labels, derived from the movement's own geometry: the
 * plan positions of the arbors (specs.AXES, mm in the movement frame) go
 * through the registry root's transform, so nothing here depends on how the
 * movement is stood up in the scene.
 *
 * View directions are given in the scene (12 o'clock is up, the back of the
 * movement faces +Z, the dial −Z, 3 o'clock is on the viewer's left when
 * looking at the back).
 */

/** Plan point (mm) at a height y (mm) of the movement frame → scene (world) position. */
export function toScene(root: Object3D, plan: readonly [number, number], yMm: number, out = new Vector3()): Vector3 {
  root.updateMatrixWorld(true);
  return root.localToWorld(out.set(plan[0] * SCENE_PER_MM, yMm * SCENE_PER_MM, plan[1] * SCENE_PER_MM));
}

/** Height (mm) of the middle of the movement's thickness: the plan view's focus plane. */
const MID_Y = (MOVEMENT.envelope.rotor[0] + MOVEMENT.envelope.dialSide[1]) / 2;
/** Height of the bridge tops: the plane the back-side views focus on. */
const BRIDGE_Y = MOVEMENT.envelope.bridges[0];

const mean = (names: readonly AxisName[]): [number, number] => {
  const sum: [number, number] = [0, 0];
  for (const n of names) {
    sum[0] += AXES[n][0];
    sum[1] += AXES[n][1];
  }
  return [sum[0] / names.length, sum[1] / names.length];
};

/** Largest distance (mm) of any listed axis from a plan point. */
const reach = (names: readonly AxisName[], about: readonly [number, number]) =>
  Math.max(...names.map((n) => Math.hypot(AXES[n][0] - about[0], AXES[n][1] - about[1])));

/** Camera distance (scene units) that frames a circle of radius r (mm) with the stage's 32° lens. */
const framing = (rMm: number) => (rMm * SCENE_PER_MM) / Math.tan((16 * Math.PI) / 180);

const dir = (azimuthDeg: number, elevationDeg: number, side: 1 | -1): Vector3 => {
  // side +1: looking at the back (camera on +Z), −1: at the dial (camera on −Z); azimuth turns towards the viewer's left
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return new Vector3(-Math.sin(az) * Math.cos(el), Math.sin(el), side * Math.cos(az) * Math.cos(el));
};

export interface ViewSpec {
  id: string;
  label: string;
  title: string;
  /** Arbors the view looks at (plan centre of them). */
  axes: readonly AxisName[];
  /** Height of the look-at point, mm of the movement frame. */
  y: number;
  /** Extra radius around the arbors, mm. */
  pad: number;
  azimuth: number;
  elevation: number;
  side: 1 | -1;
  /** Frame at least this radius (mm) around the look-at point. */
  minRadius?: number;
  /** Distance factor (<1 moves the camera closer than the plain fit). */
  tight?: number;
}

export const VIEW_SPECS: readonly ViewSpec[] = [
  { id: 'back', label: 'Arka genel', title: 'Köprü tarafından bütün mekanizma', axes: ['centre'], y: BRIDGE_Y, pad: 3, azimuth: 20, elevation: 14, side: 1, minRadius: 13 },
  { id: 'escapement', label: 'Çıkış mekanizması', title: 'Balans, çatal ve çıkış çarkı yakından', axes: ['balance', 'pallet', 'escape'], y: BRIDGE_Y, pad: 9.5, azimuth: 16, elevation: 24, side: 1 },
  { id: 'train', label: 'Dişli takımı', title: 'Zemberek kutusundan çıkış çarkına dişli takımı (köprüler saydamlaşır)', axes: ['barrel', 'centre', 'third', 'escape'], y: -2.2, pad: 6.5, azimuth: 0, elevation: 18, side: 1 },
  { id: 'dial', label: 'Kadran tarafı', title: 'Saatin yüzü: kadran ve ibreler', axes: ['centre'], y: MOVEMENT.envelope.dialSide[1], pad: 3, azimuth: -14, elevation: 12, side: -1, minRadius: 13 },
  { id: 'profile', label: 'Profil', title: 'Yandan bakış: katmanların kalınlığı', axes: ['centre'], y: MID_Y, pad: 2, azimuth: 90, elevation: 4, side: 1, minRadius: 13, tight: 0.9 },
];

/** Camera presets resolved against the root's current transform (call after the root is in place). */
export function cameraPresets(root: Object3D): CameraPreset[] {
  return VIEW_SPECS.map((v) => {
    const plan = mean(v.axes);
    const r = Math.max(v.minRadius ?? 0, reach(v.axes, plan)) + v.pad;
    const target = toScene(root, plan, v.y);
    const position = target.clone().addScaledVector(dir(v.azimuth, v.elevation, v.side), framing(r) * (v.tight ?? 1));
    return {
      id: v.id,
      label: v.label,
      title: v.title,
      position: [position.x, position.y, position.z] as const,
      target: [target.x, target.y, target.z] as const,
    };
  });
}

/** Anchor of a point as fractions of a part's world bounding box (what LabelDef.at wants). */
export function fractionIn(box: Box3, p: Vector3): [number, number, number] {
  const f = (v: number, lo: number, hi: number) => (hi - lo > 1e-9 ? (v - lo) / (hi - lo) : 0.5);
  return [f(p.x, box.min.x, box.max.x), f(p.y, box.min.y, box.max.y), f(p.z, box.min.z, box.max.z)];
}

interface LabelSpec {
  partId: string;
  text: string;
  priority: number;
  /** Fixed fractions of the part's box, or a movement-frame point (plan mm, height mm) to aim at. */
  at?: readonly [number, number, number];
  point?: { plan: readonly [number, number]; y: number };
}

const LABEL_SPECS: readonly LabelSpec[] = [
  { partId: 'rotor', text: 'Otomatik rotor', priority: 0 },
  { partId: 'balance', text: 'Balans', priority: 1 },
  { partId: 'hairspring', text: 'Spiral yay', priority: 2 },
  { partId: 'lever', text: 'Çatal', priority: 3 },
  { partId: 'escape-wheel', text: 'Çıkış çarkı', priority: 4 },
  { partId: 'fourth-wheel', text: 'Dördüncü çark', priority: 5 },
  { partId: 'third-wheel', text: 'Üçüncü çark', priority: 6 },
  { partId: 'centre-wheel', text: 'Merkez çarkı', priority: 7 },
  { partId: 'barrel', text: 'Zemberek kutusu', priority: 8 },
  { partId: 'barrel-bridge', text: 'Köprüler', priority: 9 },
  // one ruby jewel: the balance's upper bearing, in the cock
  { partId: 'balance-cock', text: 'Yakut taş', priority: 10, point: { plan: AXES.balance, y: BRIDGE_Y } },
  { partId: 'minute-hand', text: 'İbreler', priority: 11 },
];

/**
 * Names for the main parts. Only parts that exist in the registry get a
 * label, so a catalogue without (or with more than) these still works.
 */
export function labelDefs(registry: PartRegistry): LabelDef[] {
  registry.root.updateMatrixWorld(true);
  const box = new Box3();
  const out: LabelDef[] = [];
  for (const s of LABEL_SPECS) {
    if (!registry.all().some((p) => p.def.id === s.partId)) continue;
    let at = s.at;
    if (s.point) {
      box.setFromObject(registry.get(s.partId).root);
      at = fractionIn(box, toScene(registry.root, s.point.plan, s.point.y));
    }
    out.push({ partId: s.partId, text: s.text, tier: 1, priority: s.priority, at });
  }
  return out;
}
