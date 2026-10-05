import type { CameraPreset } from '../core/cameraRig';
import type { LabelDef } from '../core/labels';
import { HEAD_SECTION_X } from './parts/cylinderHead';
import { CHAIN_X } from './parts/timingChain';

/**
 * Camera presets. Axes: +X flywheel end, +Y up, +Z towards the viewer.
 * "Ön" looks at the long (intake/exhaust-side) face, "Yan" down the crank axis
 * from the flywheel end, "Zincir tarafı" from the timing-chain end (-X).
 */
export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'show', label: 'Sergi', position: [640, 470, 1180], target: [0, 105, 0] },
  { id: 'front', label: 'Ön', position: [0, 150, 1450], target: [0, 105, 0] },
  { id: 'side', label: 'Yan', position: [1350, 170, 0], target: [0, 105, 0] },
  { id: 'top', label: 'Üst', position: [0, 1500, 60], target: [0, 105, 0] },
  { id: 'chain', label: 'Zincir tarafı', position: [CHAIN_X - 760, 300, 330], target: [CHAIN_X, 150, 0] },
  { id: 'crank', label: 'Krank', position: [330, 40, 560], target: [0, 20, 0], follow: { part: 'crankshaft' } },
  {
    id: 'valves',
    label: 'Supap mekanizması',
    position: [HEAD_SECTION_X + 440, 330, 170],
    target: [HEAD_SECTION_X, 262, 0],
    follow: { layer: 'valvetrain' },
  },
];

/** Labels: tier 1 shows when assembled, tier 2/3 appear as the engine opens. */
export const LABELS: LabelDef[] = [
  { partId: 'block', text: 'Motor bloğu', tier: 1, priority: 1, at: [0.12, 0.7, 0.5] },
  { partId: 'oil-pan', text: 'Yağ karteri', tier: 1, priority: 2, at: [0.8, 0.6, 0.5] },
  { partId: 'flywheel', text: 'Volan', tier: 1, priority: 3 },
  { partId: 'crankshaft', text: 'Krank mili', tier: 1, priority: 4 },
  { partId: 'piston-3', text: 'Piston', tier: 2, priority: 1 },
  { partId: 'rod-3', text: 'Biyel', tier: 2, priority: 2 },
  { partId: 'crank-sprocket', text: 'Krank zincir dişlisi', tier: 2, priority: 3 },
  { partId: 'main-cap-3', text: 'Ana yatak kapağı', tier: 2, priority: 4 },
  { partId: 'liner-2', text: 'Silindir gömleği', tier: 2, priority: 5 },
  { partId: 'piston-pin-2', text: 'Piston pimi', tier: 3, priority: 1 },
  { partId: 'rings-2', text: 'Segmanlar', tier: 3, priority: 2 },
  { partId: 'rod-cap-2', text: 'Biyel kapağı', tier: 3, priority: 3 },
  { partId: 'ring-gear', text: 'Marş dişlisi', tier: 3, priority: 4 },
];
