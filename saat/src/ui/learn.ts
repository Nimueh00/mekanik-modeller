import type { WatchClock } from '../watch/watchClock';
import type { CrownPosition } from '../watch/pose';
import type { WatchView } from './ghost';

/**
 * What the guided tour and the quiz drive, and how they put everything back.
 *
 * `LearnEnv` is the narrow set of controls they need (clock, view, teardown,
 * camera, labels, selection, layers). main.ts implements it with the real
 * objects; the tests implement it with a few variables, which is what makes
 * "the tour restores the state it found" checkable without a browser.
 */

/** A camera placement as the rig takes it. */
export interface CameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

export interface LearnEnv {
  getClock(): WatchClock;
  /** Replace the clock (the tour's date demonstration runs on a clock of its own). */
  setClock(c: WatchClock): void;
  /** Speed (one of TIME_SCALES); also resumes a paused clock. */
  setSpeed(scale: number): void;
  setPaused(paused: boolean): void;
  getView(): WatchView;
  setView(v: WatchView): void;
  /** Disassembly amount 0–1 now, and an animated move to a new one. */
  getOpen(): number;
  openTo(amount: number): void;
  cameraPose(): CameraPose;
  /** The camera preset the camera is still at (null once it was moved by hand, or for a shared-link view). */
  activePreset(): string | null;
  goPreset(id: string, seconds?: number): void;
  goPose(pose: CameraPose, seconds?: number): void;
  labelsOn(): boolean;
  setLabels(on: boolean): void;
  selected(): string | null;
  select(id: string | null): void;
  /** Called whenever the selection changes (a click in the model, or `select`). */
  onSelect(listener: (id: string | null) => void): void;
  /** Layer visibility by layer id, and a switch. */
  layers(): Record<string, boolean>;
  setLayer(id: string, on: boolean): void;
}

/** Everything a tour or quiz can change and must give back. */
export interface LearnSnapshot {
  clock: WatchClock;
  timeScale: number;
  paused: boolean;
  crown: CrownPosition;
  wrist: boolean;
  windTurns: number;
  view: WatchView;
  open: number;
  camera: CameraPose;
  cameraPreset: string | null;
  labels: boolean;
  selected: string | null;
  layers: Record<string, boolean>;
}

export function capture(env: LearnEnv): LearnSnapshot {
  const c = env.getClock();
  return {
    clock: c,
    timeScale: c.timeScale,
    paused: c.paused,
    crown: c.crownPosition,
    wrist: c.wrist.enabled,
    windTurns: c.windTurns,
    view: env.getView(),
    open: env.getOpen(),
    camera: env.cameraPose(),
    cameraPreset: env.activePreset(),
    labels: env.labelsOn(),
    selected: env.selected(),
    layers: { ...env.layers() },
  };
}

/**
 * Put everything back. `ownClock` is a clock the tour or quiz put in itself:
 * it is replaced by the user's own clock again, unless the user has replaced
 * it meanwhile ("şimdiki saate dön"), in which case their new clock is kept
 * and only the settings are returned to it.
 */
export function restore(env: LearnEnv, s: LearnSnapshot, ownClock: WatchClock | null = null): void {
  // the camera first: a preset's side effects (an inner view hides the rotor, the train view goes ghost) are overruled below
  if (s.cameraPreset) env.goPreset(s.cameraPreset);
  else env.goPose(s.camera);
  if (ownClock && env.getClock() === ownClock) env.setClock(s.clock);
  const c = env.getClock();
  env.setSpeed(s.timeScale);
  env.setPaused(s.paused);
  c.setCrownPosition(s.crown);
  c.wrist.enabled = s.wrist;
  const wind = s.windTurns - c.windTurns;
  if (Math.abs(wind) > 1e-9) c.wind(wind);
  for (const [id, on] of Object.entries(s.layers)) env.setLayer(id, on);
  env.setView(s.view);
  env.openTo(s.open);
  env.setLabels(s.labels);
  env.select(s.selected);
}

/** Shuffle a copy (Fisher–Yates). */
export function shuffled<T>(a: readonly T[], rnd: () => number = Math.random): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
