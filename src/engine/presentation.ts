import type { CameraPreset } from '../core/cameraRig';
import type { LabelDef } from '../core/labels';
import { CYLINDER_X, SPECS } from './specs';
import { CHAIN_X } from './parts/timingChain';

/**
 * Camera presets. Axes: +X flywheel end, +Y up, +Z towards the viewer.
 * "Ön" looks at the long (intake/exhaust-side) face, "Yan" down the crank axis
 * from the flywheel end, "Zincir tarafı" from the timing-chain end (-X).
 */
/** Transverse plane through the rear valves of cylinder 4 (the valve-train view). */
const REAR_VALVES_X = CYLINDER_X[CYLINDER_X.length - 1]! + SPECS.piston.valvePocket.offsetX;

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'show', label: 'Sergi', position: [640, 470, 1180], target: [0, 105, 0] },
  { id: 'front', label: 'Ön', position: [0, 150, 1450], target: [0, 105, 0] },
  { id: 'side', label: 'Yan', position: [1350, 170, 0], target: [0, 105, 0] },
  { id: 'top', label: 'Üst', position: [0, 1500, 60], target: [0, 105, 0] },
  { id: 'chain', label: 'Zincir tarafı', position: [CHAIN_X - 760, 300, 330], target: [CHAIN_X, 150, 0] },
  // framing and the cut itself are filled in by the app (they follow the focused cylinder)
  { id: 'section', label: 'Kesit', title: 'Seçili silindirin kesitine bak', position: [700, 300, 150], target: [0, 180, 0] },
  { id: 'crank', label: 'Krank', position: [330, 40, 560], target: [0, 20, 0], follow: { part: 'crankshaft' } },
  {
    id: 'valves',
    label: 'Supap mekanizması',
    position: [REAR_VALVES_X + 440, 330, 170],
    target: [REAR_VALVES_X, 262, 0],
    follow: { layer: 'valvetrain' },
  },
];

/**
 * Leader labels. Tier 1 = outside of the assembled engine (always shown);
 * tier 2/3 = inner parts, shown once their layer has come out (or, for
 * `reveal`, once that other layer has) or when the section cut exposes them.
 * Per-cylinder parts exist once per cylinder; only one of them is shown —
 * the focused cylinder while cut open, `primary` otherwise.
 */
export interface EngineLabel extends LabelDef {
  cylinder?: number;
  primary?: boolean;
  /** Layer whose removal exposes this part (default: the part's own layer). */
  reveal?: string;
}

const perCylinder = (
  make: (n: number) => Omit<EngineLabel, 'cylinder' | 'primary'>,
  primary: number,
): EngineLabel[] => [1, 2, 3, 4].map((n) => ({ ...make(n), cylinder: n, primary: n === primary }));

export const LABELS: EngineLabel[] = [
  // tier 1: the outside of the assembled engine
  { partId: 'valve-cover', text: 'Supap kapağı', tier: 1, priority: 1, at: [0.75, 0.8, 0.5] },
  { partId: 'cylinder-head', text: 'Silindir kapağı', tier: 1, priority: 2, at: [0.85, 0.35, 0.75] },
  { partId: 'block', text: 'Motor bloğu', tier: 1, priority: 3, at: [0.8, 0.42, 0.97] },
  { partId: 'oil-pan', text: 'Yağ karteri', tier: 1, priority: 4, at: [0.8, 0.6, 0.5] },
  { partId: 'flywheel', text: 'Volan', tier: 1, priority: 5 },
  { partId: 'exhaust-manifold', text: 'Egzoz manifoldu', tier: 1, priority: 6, at: [0.5, 0.35, 0.6] },
  { partId: 'intake-manifold', text: 'Emme manifoldu', tier: 1, priority: 7, at: [0.97, 0.75, 0.22] },
  { partId: 'chain-cover', text: 'Zincir kapağı', tier: 1, priority: 8, at: [0.2, 0.7, 0.92] },
  { partId: 'spark-plugs', text: 'Bujiler ve bobinler', tier: 1, priority: 9, at: [0.9, 0.92, 0.5] },
  // tier 2: main inner parts
  ...perCylinder((n) => ({ partId: `piston-${n}`, text: 'Piston', tier: 2, priority: 1 }), 3),
  ...perCylinder((n) => ({ partId: `rod-${n}`, text: 'Biyel', tier: 2, priority: 2 }), 3),
  { partId: 'crankshaft', text: 'Krank mili', tier: 2, priority: 3 },
  { partId: 'camshaft-exhaust', text: 'Eksantrik mili', tier: 2, priority: 4, at: [0.75, 0.5, 0.5] },
  ...perCylinder((n) => ({ partId: `valves-exhaust-${n}`, text: 'Supaplar', tier: 2, priority: 5 }), 4),
  { partId: 'timing-chain', text: 'Zamanlama zinciri', tier: 2, priority: 6, at: [0.5, 0.25, 0.9] },
  { partId: 'cam-sprocket-exhaust', text: 'Eksantrik dişlisi', tier: 2, priority: 7 },
  { partId: 'crank-sprocket', text: 'Krank zincir dişlisi', tier: 2, priority: 8 },
  ...perCylinder((n) => ({ partId: `springs-exhaust-${n}`, text: 'Supap yayları', tier: 2, priority: 9 }), 4),
  ...perCylinder((n) => ({ partId: `buckets-exhaust-${n}`, text: 'Kovan iticiler', tier: 2, priority: 10 }), 4),
  { partId: 'head-gasket', text: 'Kapak contası', tier: 2, priority: 11 },
  { partId: 'main-cap-3', text: 'Ana yatak kapağı', tier: 2, priority: 12 },
  { partId: 'liner-2', text: 'Silindir gömleği', tier: 2, priority: 13, reveal: 'rods-pistons' },
  { partId: 'injectors', text: 'Enjektörler', tier: 2, priority: 14 },
  // tier 3: details
  ...perCylinder((n) => ({ partId: `piston-pin-${n}`, text: 'Piston pimi', tier: 3, priority: 1 }), 2),
  ...perCylinder((n) => ({ partId: `rings-${n}`, text: 'Segmanlar', tier: 3, priority: 2 }), 2),
  ...perCylinder((n) => ({ partId: `rod-cap-${n}`, text: 'Biyel kapağı', tier: 3, priority: 3 }), 2),
  { partId: 'chain-guides', text: 'Zincir gergisi ve kızaklar', tier: 3, priority: 4 },
  { partId: 'cam-caps-exhaust', text: 'Eksantrik yatak kapakları', tier: 3, priority: 5 },
  ...perCylinder((n) => ({ partId: `retainers-exhaust-${n}`, text: 'Yay tablası ve tırnaklar', tier: 3, priority: 6 }), 4),
  { partId: 'head-bolts', text: 'Kapak cıvataları', tier: 3, priority: 7 },
  { partId: 'ring-gear', text: 'Marş dişlisi', tier: 3, priority: 8 },
];
