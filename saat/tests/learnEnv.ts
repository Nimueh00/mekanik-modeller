import type { CoachCard, CoachContent } from '../src/core/ui/coach';
import type { WatchView } from '../src/ui/ghost';
import type { CameraPose, LearnEnv } from '../src/ui/learn';
import { VIEW_SPECS } from '../src/ui/views';
import { LAYERS } from '../src/watch/catalog';
import { WatchClock } from '../src/watch/watchClock';

/** A fake app for the tour and the quiz: plain variables behind the LearnEnv interface. */
export interface FakeEnv extends LearnEnv {
  state: {
    clock: WatchClock;
    view: WatchView;
    open: number;
    openTarget: number;
    camera: CameraPose;
    /** Preset the camera is at, or null after a manual move. */
    preset: string | null;
    labels: boolean;
    selected: string | null;
    layers: Record<string, boolean>;
  };
  /** Every preset id the tour or quiz asked the camera for. */
  presets: string[];
}

/** A user's own settings, all of them away from the defaults so that a missed restore shows. */
export function fakeEnv(): FakeEnv {
  const clock = new WatchClock({ t: 3 * 86400 + 11 * 3600 + 7 * 60, timeScale: 600, windTurns: 3.3 });
  clock.paused = true;
  clock.setCrownPosition(2);
  const layers = Object.fromEntries(LAYERS.map((l) => [l.id, true]));
  layers.date = false;
  const state: FakeEnv['state'] = {
    clock,
    view: 'ghost',
    open: 0.4,
    openTarget: 0.4,
    camera: { position: [100, 200, 300], target: [1, 2, 3] },
    preset: 'train',
    labels: false,
    selected: 'balance',
    layers,
  };
  const listeners: ((id: string | null) => void)[] = [];
  const presets: string[] = [];
  const env: FakeEnv = {
    state,
    presets,
    getClock: () => state.clock,
    setClock: (c) => {
      state.clock = c;
    },
    setSpeed: (scale) => {
      state.clock.timeScale = scale;
      state.clock.paused = false;
    },
    setPaused: (p) => {
      state.clock.paused = p;
    },
    getView: () => state.view,
    setView: (v) => {
      state.view = v;
    },
    getOpen: () => state.open,
    openTo: (a) => {
      state.openTarget = a;
      state.open = a; // the animation is the app's business: the fake arrives at once
    },
    cameraPose: () => state.camera,
    activePreset: () => state.preset,
    goPreset: (id) => {
      if (!VIEW_SPECS.some((v) => v.id === id)) throw new Error(`unknown camera preset ${id}`);
      presets.push(id);
      state.preset = id;
    },
    goPose: (pose) => {
      state.camera = pose;
      state.preset = null;
    },
    labelsOn: () => state.labels,
    setLabels: (on) => {
      state.labels = on;
    },
    selected: () => state.selected,
    select: (id) => {
      if (id === state.selected) return;
      state.selected = id;
      for (const l of listeners) l(id);
    },
    onSelect: (l) => {
      listeners.push(l);
    },
    layers: () => state.layers,
    setLayer: (id, on) => {
      state.layers[id] = on;
    },
  };
  return env;
}

/** A coach card that only remembers what it was told to show. */
export function fakeCoach() {
  let content: CoachContent | null = null;
  let hidden = true;
  const card = {
    show: (c: CoachContent) => {
      content = c;
      hidden = false;
    },
    hide: () => {
      hidden = true;
    },
  };
  return {
    card: card as unknown as CoachCard,
    get content() {
      return content!;
    },
    get visible() {
      return !hidden;
    },
    /** Press the card's action with this label. */
    press(label: string) {
      const a = content!.actions.find((x) => x.label === label);
      if (!a) throw new Error(`no action "${label}" on the card (has ${content!.actions.map((x) => x.label).join(', ')})`);
      a.onClick();
    },
    /** Click the choice with this label. */
    choose(label: string) {
      const c = content!.choices?.find((x) => x.label === label);
      if (!c?.onClick) throw new Error(`no clickable choice "${label}"`);
      c.onClick();
    },
  };
}

/** Deterministic random numbers for repeatable quizzes. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
