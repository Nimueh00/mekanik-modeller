import { Box3, Vector3 } from 'three';
import { CameraRig } from './core/cameraRig';
import { Disassembly } from './core/disassembly';
import { LabelSystem } from './core/labels';
import { OcclusionProbe } from './core/occlusion';
import { PartRegistry } from './core/registry';
import { Selection } from './core/selection';
import { Stage } from './core/stage';
import { Panel } from './core/ui/panel';
import { applyPlanarUv } from './watch/finishes';
import { WatchMaterials } from './watch/materials';
import { Watch } from './watch/watch';
import { WatchClock } from './watch/watchClock';
import { GhostView } from './ui/ghost';
import { buildOpenUi } from './ui/openUi';
import { WatchSound } from './ui/sound';
import { cameraPresets, labelDefs } from './ui/views';
import { buildWatchUi, type ClockRef } from './ui/watchUi';
import './style.css';

const app = document.getElementById('app')!;

const title = document.createElement('div');
title.className = 'title-block';
title.innerHTML = '<h1>Mekanik Saat</h1><p>Otomatik mekanizma · Ø 25,6 mm · 21.600 A/s</p>';
const loading = document.createElement('div');
loading.className = 'loading';
loading.textContent = 'SAAT HAZIRLANIYOR';
app.append(title, loading);

// Scene unit = 0.1 mm: the Ø 25.6 mm movement is drawn 256 units across. It
// stands on its edge, the back (bridges) towards +Z and 12 o'clock up; the
// default view looks at the back from slightly above and to the side, and
// orbiting half a turn shows the dial.
const stage = new Stage({
  container: app,
  subjectRadius: 150,
  target: new Vector3(0, 0, 0),
  cameraPosition: new Vector3(-190, 120, 500),
  floorY: -142,
  framingAspect: 1.1,
});

/** How often the shadow map is redrawn while the watch runs. */
const SHADOW_HZ = 30;

/** Seconds since 12:00:00 on the local clock (the watch shows local time). */
function localTime(): number {
  const d = new Date();
  return (d.getHours() % 12) * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
}

// Let the loading caption paint before the (synchronous) build starts.
setTimeout(() => {
  const registry = new PartRegistry();
  const watch = new Watch(registry, new WatchMaterials());
  watch.build();
  // movement +Y (dial) → world −Z, movement −Z (12 o'clock) → world +Y
  registry.root.rotation.set(Math.PI / 2, Math.PI, 0, 'YXZ');
  stage.scene.add(registry.root);
  registry.root.updateMatrixWorld(true);
  applyPlanarUv(registry.root); // planar UVs for the finishes (perlage, Côtes de Genève)

  const clock = new WatchClock({ t: localTime() });
  // the clock sits in a holder: "şimdiki saate dön" replaces it
  const ref: ClockRef = { clock };

  const disassembly = new Disassembly(registry);
  disassembly.rebuild();
  const presets = cameraPresets(registry.root);
  const rig = new CameraRig(stage.camera, stage.controls, registry);
  rig.jump(presets[0]!);
  // Half-extents of the scene around the orbit target; the assembled values are the reference framing.
  const fitBox = new Box3();
  const reach = (out: Vector3) => {
    fitBox.setFromObject(registry.root);
    const t = stage.controls.target;
    return out.set(
      Math.max(fitBox.max.x - t.x, t.x - fitBox.min.x),
      Math.max(fitBox.max.y - t.y, t.y - fitBox.min.y),
      Math.max(fitBox.max.z - t.z, t.z - fitBox.min.z),
    );
  };
  const rest = reach(new Vector3());

  const labels = new LabelSystem(app, registry);
  labels.build(labelDefs(registry));
  void document.fonts?.ready.then(() => labels.remeasure());
  // a label belongs to a part: it goes when the part's layer is switched off
  labels.filter = (d) => registry.get(d.partId).root.visible;
  const selection = new Selection(stage.renderer.domElement, stage.camera, registry);

  // Hayalet view: see-through plate, bridges and dial; clicks and sight lines pass through them.
  const ghost = new GhostView(registry, () => selection.releaseMaterials());
  ghost.onChange(() => stage.invalidateShadows());
  selection.filter = (obj) => !ghost.isGhost(obj as never);

  // Line of sight for labels: hide a label whose part is behind another one.
  const probe = new OcclusionProbe(registry.root, stage.camera);
  probe.filter = selection.filter;
  setTimeout(() => {
    probe.prepare((m) => m.userData.partId === 'hairspring'); // the spring changes shape every frame
    labels.occlusion = (id, at) => probe.sees(id, at);
  }, 0);

  const panel = new Panel(document.body, { title: 'KONTROL', hideLabel: 'Gizle', showLabel: 'KONTROL' });
  const sound = new WatchSound(() => ref.clock);
  const ui = buildWatchUi(panel, ref, { sound, ghost });
  buildOpenUi(panel, { disassembly, rig, registry, labels, selection, presets });
  // inner views: see through the bridges if the movement is closed and solid
  presets.find((p) => p.id === 'train')!.onEnter = () => {
    if (ghost.mode === 'solid' && disassembly.amount < 0.05) ui.setView('ghost');
  };

  // Free area for the model: right of the panel (desktop) or above the bottom sheet (phones).
  const syncInset = () => {
    const narrow = window.innerWidth < 760;
    stage.setInsets(panel.occupiedWidth, panel.occupiedHeight);
    labels.maxVisible = narrow ? 4 : 99;
    labels.area = {
      left: 0,
      top: narrow ? 56 : 84,
      right: window.innerWidth - panel.occupiedWidth,
      bottom: window.innerHeight - panel.occupiedHeight,
    };
  };
  panel.onToggle(syncInset);
  window.addEventListener('resize', syncInset);
  syncInset();

  const spread = new Vector3();
  let fit = 1;
  let fitTarget = 1;
  let fitAmount = -1;
  // Shadows are redrawn only when the picture of the casters changes (Stage.invalidateShadows).
  let shadowKey = '';
  let labelScene = '';
  const labelCam = new Vector3();
  let lastAmount = 0;
  stage.onFrame((dt, elapsed) => {
    disassembly.update(dt);
    rig.update(dt);
    const a = disassembly.amount;
    // Zoom out in proportion to how far the parts have actually spread (box only when the spread changed).
    if (a !== fitAmount) {
      fitAmount = a;
      reach(spread);
      const ratio = Math.max(1, spread.y / rest.y, (spread.x / rest.x) * 0.9, (spread.z / rest.z) * 0.2);
      fitTarget = 1 / ratio;
    }
    fit += (fitTarget - fit) * Math.min(1, dt * 6);
    stage.setFit(fit);
    selection.update(elapsed);

    const clock = ref.clock;
    clock.tick(dt);
    watch.update(clock.t, { continuous: clock.continuous, amplitude: clock.amplitude });
    const layers = registry.populatedLayers().map((l) => (registry.inLayer(l.id).every((p) => p.root.visible) ? 1 : 0)).join('');
    const scene = `${ghost.mode}|${layers}`;
    // Moving casters: while the watch runs the balance and the wheels move every frame, so the shadow map is
    // refreshed SHADOW_HZ times a second (a shadow this small does not show the difference); paused, it is
    // redrawn only when the time, the disassembly or the scene changed.
    const running = !clock.paused && clock.running;
    const key = `${running ? Math.floor(elapsed * SHADOW_HZ) : clock.t}|${a}|${scene}`;
    if (key !== shadowKey) {
      shadowKey = key;
      stage.invalidateShadows();
    }
    // labels: re-test every line of sight after a discrete change; while parts fly apart, test more per frame
    const camMoved = stage.camera.position.distanceTo(labelCam) > 0.06 * stage.camera.position.distanceTo(stage.controls.target);
    if (scene !== labelScene || camMoved) {
      labelScene = scene;
      labelCam.copy(stage.camera.position);
      labels.invalidateOcclusion();
    }
    labels.occlusionBudget = a !== lastAmount ? 16 : 6;
    lastAmount = a;

    ui.update(stage.fps);
    sound.update();
  });
  stage.onLateFrame(() => labels.update(stage.camera, disassembly.amount));
  stage.start();
  loading.classList.add('is-done');

  if (import.meta.env.DEV) Object.assign(window, { __app: { stage, ref, watch, registry, disassembly, rig, selection, labels, ghost, ui, sound, probe, presets } });
}, 50);
