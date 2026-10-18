import { Vector3 } from 'three';
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
import { partCorners, viewExtents, zoomToFit } from './ui/fit';
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

/** Nearest part corner stays this share of the closed viewing distance in front of the camera. */
const MIN_DEPTH_SHARE = 0.7;

/** How often the shadow map is redrawn while the watch runs. */
const SHADOW_HZ = 30;

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

  const clock = WatchClock.fromDate(new Date());
  // the clock sits in a holder: "şimdiki saate dön" replaces it
  const ref: ClockRef = { clock };

  const disassembly = new Disassembly(registry);
  disassembly.rebuild();
  const presets = cameraPresets(registry.root);
  const rig = new CameraRig(stage.camera, stage.controls, registry);
  rig.jump(presets[0]!);
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
  const open = buildOpenUi(panel, { disassembly, rig, registry, labels, selection, presets });
  // Inner views (escapement, train): the rotor covers the balance and the train, and its weight is gilt brass that
  // the ghost view leaves solid, so the rotor layer is switched off on entering them while the movement is closed
  // (and the train view also goes ghost to see through the bridges). The other views bring the rotor back, but only
  // if this hid it: a layer the user switched off stays off.
  let rotorHiddenByView = false;
  const hasRotor = registry.populatedLayers().some((l) => l.id === 'rotor');
  const inner = (ghostToo: boolean) => () => {
    if (disassembly.amount >= 0.05) return;
    if (hasRotor && registry.inLayer('rotor').every((p) => p.root.visible)) {
      open.setLayerVisible('rotor', false);
      rotorHiddenByView = true;
    }
    if (ghostToo && ghost.mode === 'solid') ui.setView('ghost');
  };
  const outer = () => {
    if (!rotorHiddenByView) return;
    rotorHiddenByView = false;
    open.setLayerVisible('rotor', true);
  };
  for (const p of presets) p.onEnter = p.id === 'escapement' ? inner(false) : p.id === 'train' ? inner(true) : outer;

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

  // Disassembly framing: while parts are out, the zoom follows where their boxes really are on screen.
  let fit = 1;
  let fitTarget = 1;
  let fitKey = '';
  const corners: Vector3[] = [];
  const viewDir = new Vector3();
  const fromCam = new Vector3();
  let dolly = 0; // distance the camera has backed off for the open movement
  stage.controls.maxDistance = 6000;
  // Shadows are redrawn only when the picture of the casters changes (Stage.invalidateShadows).
  let shadowKey = '';
  let labelScene = '';
  const labelCam = new Vector3();
  let lastAmount = 0;
  stage.onFrame((dt, elapsed) => {
    disassembly.update(dt);
    rig.update(dt);
    const a = disassembly.amount;
    // Opening the movement pushes parts along the line of sight (towards the viewer, for the back side), and in
    // perspective they would swell and pass the camera. So the camera backs off with the nearest part: it keeps
    // the nearest corner at a fixed share of the closed-up viewing distance, and returns as the movement closes.
    if (a > 1e-4 || dolly > 1e-3) {
      partCorners(registry.all().map((p) => p.root), corners);
      const cam = stage.camera.position;
      viewDir.subVectors(cam, stage.controls.target);
      const dist = viewDir.length();
      viewDir.divideScalar(dist);
      let nearest = Infinity;
      for (const c of corners) nearest = Math.min(nearest, viewDir.dot(fromCam.subVectors(cam, c)));
      const delta = Math.max(-dolly, MIN_DEPTH_SHARE * (dist - dolly) - nearest);
      const step = delta * Math.min(1, dt * 6);
      dolly += step;
      cam.addScaledVector(viewDir, step);
    }
    // Zoom: while parts are out it follows where their boxes really are on screen.
    const camKey = `${a}|${stage.camera.position.toArray().map((v) => v.toFixed(1))}|${stage.controls.target.toArray().map((v) => v.toFixed(1))}|${stage.camera.aspect}`;
    if (camKey !== fitKey) {
      fitKey = camKey;
      if (a < 1e-4) fitTarget = 1;
      else {
        const base = stage.camera.zoom / fit; // zoom the stage uses at fit = 1 (free area, aspect)
        const freeW = 1 - Math.min(panel.occupiedWidth, window.innerWidth * 0.45) / window.innerWidth;
        const freeH = 1 - Math.min(panel.occupiedHeight, window.innerHeight * 0.6) / window.innerHeight;
        const need = zoomToFit(viewExtents(stage.camera, corners), freeW, freeH) / base;
        // fades in over the first few percent so that a close-up preset does not jump the moment it opens
        const k = Math.min(1, a / 0.06);
        fitTarget = 1 + (Math.min(1, need) - 1) * k;
      }
    }
    fit += (fitTarget - fit) * Math.min(1, dt * 6);
    stage.setFit(fit);
    selection.update(elapsed);

    const clock = ref.clock;
    clock.tick(dt);
    // the pose carries what the time alone does not: the rotor, crown, hand setting, date ring and the run-down
    const pose = clock.pose;
    watch.update(clock.t, { ...pose, continuous: clock.continuous, amplitude: clock.amplitude });
    const layers = registry.populatedLayers().map((l) => (registry.inLayer(l.id).every((p) => p.root.visible) ? 1 : 0)).join('');
    const scene = `${ghost.mode}|${layers}`;
    // Moving casters: while anything moves (the watch runs, the balance still swings down after the spring ran out,
    // or the crown and rocker travel) the shadow map is refreshed SHADOW_HZ times a second, a shadow this small
    // does not show the difference. Otherwise it is redrawn only when the time, the pose (rotor, date ring, crown,
    // hand setting, ...), the disassembly or the scene changed.
    const live = !clock.paused && (clock.moving || pose.drive.env > 1e-3);
    const poseKey = live
      ? Math.floor(elapsed * SHADOW_HZ)
      : [clock.t, pose.handOffset, pose.dateRing, pose.crownPull, pose.crownAngle, pose.settingAngle, pose.quickAngle, pose.rocker, pose.rotorAngle, pose.drive.env].join(',');
    const key = `${poseKey}|${a}|${scene}`;
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
