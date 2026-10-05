import { Box3, Plane, Vector3 } from 'three';
import { MachineClock } from './core/clock';
import { MaterialLibrary } from './core/materials';
import { PartRegistry } from './core/registry';
import { OCCLUDER_LAYER, Stage } from './core/stage';
import { CameraRig } from './core/cameraRig';
import { Disassembly } from './core/disassembly';
import { LabelSystem } from './core/labels';
import { OcclusionProbe } from './core/occlusion';
import { SectionView } from './core/section';
import { Selection } from './core/selection';
import { Panel } from './core/ui/panel';
import { Combustion } from './engine/combustion';
import { Cutaway, CycleFocus } from './engine/cutaway';
import { CAP_STYLES, capStyleOf, Engine, type BlockView } from './engine/engine';
import { GasFlow } from './engine/gasFlow';
import { buildOpenUi } from './engine/openUi';
import { CAMERA_PRESETS, type EngineLabel, LABELS } from './engine/presentation';
import { SPECS } from './engine/specs';
import { buildEngineUi } from './engine/ui';
import './style.css';

const app = document.getElementById('app')!;

const title = document.createElement('div');
title.className = 'title-block';
title.innerHTML = '<h1>Dört Zamanlı Benzinli Motor</h1><p>1.6 L · Sıralı 4 silindir · DOHC 16 supap</p>';
const loading = document.createElement('div');
loading.className = 'loading';
loading.textContent = 'MOTOR HAZIRLANIYOR';
app.append(title, loading);

const stage = new Stage({
  container: app,
  subjectRadius: 380,
  target: new Vector3(...CAMERA_PRESETS[0]!.target),
  cameraPosition: new Vector3(...CAMERA_PRESETS[0]!.position),
  floorY: -168,
  framingAspect: 1.15,
});

const clock = new MachineClock({ rpm: SPECS.speed.defaultRpm });
const registry = new PartRegistry();
const engine = new Engine(registry, new MaterialLibrary());

// Let the loading caption paint before the (synchronous) CSG work starts.
setTimeout(() => {
  engine.build();
  stage.scene.add(registry.root);

  const disassembly = new Disassembly(registry);
  disassembly.rebuild();
  const rig = new CameraRig(stage.camera, stage.controls, registry);
  rig.jump(CAMERA_PRESETS[0]!);
  const labels = new LabelSystem(app, registry);
  labels.build(LABELS);
  void document.fonts?.ready.then(() => labels.remeasure());
  const selection = new Selection(stage.renderer.domElement, stage.camera, registry);

  // ---- Phase 4: cut-away, gas flow, combustion ----
  const section = new SectionView(stage.scene, CAP_STYLES, capStyleOf);
  section.track(registry.root);
  engine.section = section;
  const focus = new CycleFocus();
  const cutaway = new Cutaway(section, focus);
  selection.filter = (obj, point) => !(obj.userData.sectionClipped && section.isCut(point));
  // Effects clip against their own plane: a copy of the cut while it is on, a no-op otherwise.
  const fxPlane = new Plane(new Vector3(0, 0, -1), 1e6);
  const gas = new GasFlow([fxPlane]);
  const combustion = new Combustion([fxPlane]);
  stage.scene.add(gas.points, combustion.root);
  stage.setGlowOccluderClipping([fxPlane]);
  // Only what surrounds the combustion chambers can hide a flame.
  const occluding = new Set(['block', 'cylinder-head', 'rods-pistons', 'valvetrain', 'valve-cover', 'plugs-injectors']);
  for (const part of registry.all()) {
    if (!occluding.has(part.def.group)) continue;
    part.motion.traverse((o) => {
      if (!o.userData.sectionHelper) o.layers.enable(OCCLUDER_LAYER);
    });
  }
  // Labels: outside parts always; inner parts once their layer is out or the cut exposes them;
  // never for geometry the cut has removed. One label per per-cylinder part (focused cylinder while cut).
  labels.filter = (d, anchor) => {
    const def = d as EngineLabel;
    const part = registry.get(def.partId);
    const cutOpen = section.isEnabled && disassembly.amount < 0.02;
    if (def.cylinder !== undefined && def.cylinder !== (cutOpen ? focus.cylinder + 1 : def.primary ? def.cylinder : -1)) return false;
    if (section.clipsPart(def.partId) && section.isCut(anchor)) return false;
    if (def.tier === 1) return true;
    if (cutOpen && !section.clipsPart(def.partId)) return true; // whole part inside an open cut
    return disassembly.layerProgress(def.reveal ?? part.def.group) > 0.6;
  };

  // Line of sight for labels: hide a label whose part is behind another one.
  const probe = new OcclusionProbe(registry.root, stage.camera);
  probe.filter = selection.filter;
  setTimeout(() => {
    probe.prepare((m) => String(m.userData.partId).startsWith('springs-')); // springs deform every frame
    labels.occlusion = (id, at) => probe.sees(id, at);
  }, 0);

  let requestView: (v: BlockView) => void = () => {};
  const sectionPreset = CAMERA_PRESETS.find((p) => p.id === 'section')!;
  sectionPreset.resolve = () => cutaway.view();
  sectionPreset.onEnter = () => requestView('section');
  // Views of parts that live inside the housings: see through them if the engine is closed and solid.
  for (const id of ['chain', 'crank', 'valves']) {
    CAMERA_PRESETS.find((p) => p.id === id)!.onEnter = () => {
      if (engine.view === 'solid' && disassembly.amount < 0.05) requestView('ghost');
    };
  }
  engine.setView(engine.view);

  const panel = new Panel(document.body, { title: 'KONTROL', hideLabel: 'Gizle', showLabel: 'KONTROL' });
  buildOpenUi(panel, { disassembly, rig, registry, labels, selection });
  const updateUi = buildEngineUi(panel, clock, engine, {
    focus,
    cutaway,
    beforeMaterialSwap: () => selection.releaseMaterials(),
    onViewRequest: (l) => {
      requestView = l;
    },
  });
  cutaway.onChange(() => selection.releaseMaterials());
  const syncInset = () => {
    stage.setInsets(panel.occupiedWidth, panel.occupiedHeight);
    labels.maxVisible = window.innerWidth < 760 ? 4 : 99;
    labels.area = {
      left: 0,
      top: window.innerWidth < 760 ? 56 : 84,
      right: window.innerWidth - panel.occupiedWidth,
      bottom: window.innerHeight - panel.occupiedHeight,
    };
  };
  panel.onToggle(syncInset);
  window.addEventListener('resize', syncInset);
  syncInset();

  const fitBox = new Box3();
  // Half-extents of the scene around the orbit target; the assembled values are the reference framing.
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
  const spread = new Vector3();
  let fit = 1;
  let fitTarget = 1;
  let fitAmount = -1;
  const FLOOR_Y = stage.floor.position.y;
  // Shadows are redrawn only when the picture of the casters changes (Stage.invalidateShadows).
  let shadowKey = '';
  let labelScene = '';
  const labelCam = new Vector3();
  let lastAmount = 0;
  stage.onFrame((dt, elapsed) => {
    disassembly.update(dt);
    rig.update(dt);
    const a = disassembly.amount;
    stage.floor.position.y = FLOOR_Y - 320 * a; // the shadow catcher follows the lowest parts down
    // Zoom out in proportion to how far the parts have actually spread (box only when the spread changed).
    if (a !== fitAmount) {
      fitAmount = a;
      reach(spread);
      const ratio = Math.max(1, spread.y / rest.y, (spread.x / rest.x) * 0.9, (spread.z / rest.z) * 0.6);
      fitTarget = 1 / ratio;
    }
    fit += (fitTarget - fit) * Math.min(1, dt * 6);
    stage.setFit(fit);
    selection.update(elapsed);
    clock.tick(dt);
    engine.update(clock.crankAngle);
    // Inside a closed, solid engine the moving parts' shadows can never be seen: skip them in the shadow pass.
    const allShown = registry.populatedLayers().every((l) => registry.inLayer(l.id).every((p) => p.root.visible));
    engine.setInteriorShadows(!(engine.view === 'solid' && a < 1e-4 && allShown));
    const p = section.plane;
    const scene = `${engine.view}|${section.isEnabled ? `${p.normal.x},${p.normal.z},${p.constant},${focus.cylinder}` : '-'}|${allShown}`;
    const key = `${clock.crankAngle}|${a}|${scene}`;
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
    // effects live in the assembled engine and can only be seen into it (cut or ghost); hide them otherwise
    const fxOn = a < 0.01 && engine.view !== 'solid';
    gas.points.visible = fxOn;
    combustion.root.visible = fxOn;
    if (fxOn) {
      if (section.isEnabled) fxPlane.copy(section.plane);
      else fxPlane.set(new Vector3(0, 0, -1), 1e6);
      gas.setScale(stage.renderer.domElement.height / (2 * Math.tan((stage.camera.fov * Math.PI) / 360)) * stage.camera.zoom);
      gas.update(clock.crankAngle);
      combustion.update(clock.crankAngle, elapsed);
    }
    // bloom only while a flame or spark can actually be seen: not in the solid view, and in the
    // transverse cut only for the focused cylinder (the others are cut away or hidden)
    const seen = engine.view === 'solid' ? 0 : section.isEnabled && cutaway.mode === 'transverse' ? combustion.glowOf(focus.cylinder) : combustion.glow;
    stage.setBloom(fxOn && seen > 0.02, 0.85);
    updateUi(stage.fps);
  });
  stage.onLateFrame(() => {
    section.update();
    labels.update(stage.camera, disassembly.amount);
  });
  stage.start();
  loading.classList.add('is-done');

  if (import.meta.env.DEV) Object.assign(window, { __app: { stage, clock, engine, registry, disassembly, rig, selection, labels, section, cutaway, focus, gas, combustion } });
}, 50);
