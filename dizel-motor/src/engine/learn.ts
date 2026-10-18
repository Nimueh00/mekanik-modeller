import type { CameraPreset, CameraRig } from '../core/cameraRig';
import type { MachineClock } from '../core/clock';
import type { Disassembly } from '../core/disassembly';
import type { LabelSystem } from '../core/labels';
import type { PartRegistry } from '../core/registry';
import type { Selection } from '../core/selection';
import type { CoachCard } from '../core/ui/coach';
import type { Panel } from '../core/ui/panel';
import type { Circuits } from './circuits';
import type { Cutaway, CycleFocus } from './cutaway';
import type { Engine } from './engine';
import type { EngineUiApi } from './ui';

/** Everything the guided tour and the quiz drive. */
export interface LearnContext {
  coach: CoachCard;
  panel: Panel;
  clock: MachineClock;
  engine: Engine;
  ui: EngineUiApi;
  disassembly: Disassembly;
  rig: CameraRig;
  presets: readonly CameraPreset[];
  focus: CycleFocus;
  cutaway: Cutaway;
  labels: LabelSystem;
  selection: Selection;
  registry: PartRegistry;
  circuits: Circuits;
}

export const preset = (ctx: LearnContext, id: string): CameraPreset => ctx.presets.find((p) => p.id === id)!;

/** Shuffle a copy (Fisher–Yates). */
export function shuffled<T>(a: readonly T[], rnd: () => number = Math.random): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
