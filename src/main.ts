import { Box3, Plane, Vector3 } from 'three';
import { MachineClock } from './core/clock';
import { MaterialLibrary } from './core/materials';
import { PartRegistry } from './core/registry';
import { OCCLUDER_LAYER, Stage } from './core/stage';
import { CameraRig } from './core/cameraRig';
import { Disassembly } from './core/disassembly';
import { LabelSystem } from './core/labels';
import { SectionView } from './core/section';
import { Selection } from './core/selection';
import { Panel } from './core/ui/panel';
import { Combustion } from './engine/combustion';
import { Cutaway, CycleFocus } from './engine/cutaway';
import { CAP_STYLES, capStyleOf, Engine, type BlockView } from './engine/engine';
import { GasFlow } from './engine/gasFlow';
import { buildOpenUi } from './engine/openUi';
import { CAMERA_PRESETS, LABELS } from './engine/presentation';
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
  let requestView: (v: BlockView) => void = () => {};
  const sectionPreset = CAMERA_PRESETS.find((p) => p.id === 'section')!;
  sectionPreset.resolve = () => cutaway.view();
  sectionPreset.onEnter = () => requestView('section');
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
    labels.maxVisible = window.innerWidth < 760 ? 6 : 99;
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
  const fitSize = new Vector3();
  // Assembled extents (mm); constants because the live box also breathes with the crank pose.
  const rest = new Vector3(510, 390, 370);
  let fit = 1;
  const FLOOR_Y = stage.floor.position.y;
  stage.onFrame((dt, elapsed) => {
    disassembly.update(dt);
    rig.update(dt);
    const a = disassembly.amount;
    stage.floor.position.y = FLOOR_Y - 320 * a; // the shadow catcher follows the lowest parts down
    // Zoom out in proportion to how far the parts have actually spread.
    fitBox.setFromObject(registry.root).getSize(fitSize);
    const ratio = Math.max(fitSize.y / rest.y, (fitSize.x / rest.x) * 0.85, (fitSize.z / rest.z) * 0.5);
    fit += (Math.min(1, 1 / Math.pow(ratio, 0.85)) - fit) * Math.min(1, dt * 6);
    stage.setFit(fit);
    selection.update(elapsed);
    clock.tick(dt);
    engine.update(clock.crankAngle);
    // effects live in the assembled engine; hide them once it is opened up
    const fxOn = a < 0.01;
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
