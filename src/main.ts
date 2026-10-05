import { Vector3 } from 'three';
import { MachineClock } from './core/clock';
import { MaterialLibrary } from './core/materials';
import { PartRegistry } from './core/registry';
import { Stage } from './core/stage';
import { Panel } from './core/ui/panel';
import { Engine } from './engine/engine';
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

  const panel = new Panel(document.body, { title: 'KONTROL', hideLabel: 'Gizle', showLabel: 'KONTROL' });
  const updateUi = buildEngineUi(panel, clock, engine);
  const syncInset = () => stage.setInsets(panel.occupiedWidth, panel.occupiedHeight);
  panel.onToggle(syncInset);
  window.addEventListener('resize', syncInset);
  syncInset();

  stage.onFrame((dt) => {
    clock.tick(dt);
    engine.update(clock.crankAngle);
    updateUi(stage.fps);
  });
  stage.start();
  loading.classList.add('is-done');

  if (import.meta.env.DEV) Object.assign(window, { __app: { stage, clock, engine, registry } });
}, 50);
