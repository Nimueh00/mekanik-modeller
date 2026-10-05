import { Box3, Vector3 } from 'three';
import { MachineClock } from './core/clock';
import { MaterialLibrary } from './core/materials';
import { PartRegistry } from './core/registry';
import { Stage } from './core/stage';
import { CameraRig } from './core/cameraRig';
import { Disassembly } from './core/disassembly';
import { LabelSystem } from './core/labels';
import { Selection } from './core/selection';
import { Panel } from './core/ui/panel';
import { Engine } from './engine/engine';
import { buildOpenUi } from './engine/openUi';
import { CAMERA_PRESETS, LABELS } from './engine/presentation';
import { SPECS } from './engine/specs';
import { buildEngineUi } from './engine/ui';
import './style.css';

const app = document.getElementById('app')!;

const title = document.createElement('div');
title.className = 'title-block';
title.innerHTML = '<h1>Dört Zamanlı Benzinli Motor</h1><p>1.6 L · Sıralı 4 silindir · Krank-biyel mekanizması</p>';
const loading = document.createElement('div');
loading.className = 'loading';
loading.textContent = 'MOTOR HAZIRLANIYOR';
app.append(title, loading);

const stage = new Stage({
  container: app,
  subjectRadius: 320,
  target: new Vector3(10, 30, 0),
  cameraPosition: new Vector3(430, 300, 820),
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

  const panel = new Panel(document.body, { title: 'KONTROL', hideLabel: 'Gizle', showLabel: 'KONTROL' });
  buildOpenUi(panel, { disassembly, rig, registry, labels, selection });
  const updateUi = buildEngineUi(panel, clock, engine);
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
    updateUi(stage.fps);
  });
  stage.onLateFrame(() => labels.update(stage.camera, disassembly.amount));
  stage.start();
  loading.classList.add('is-done');

  if (import.meta.env.DEV) Object.assign(window, { __app: { stage, clock, engine, registry, disassembly, rig, selection, labels } });
}, 50);
