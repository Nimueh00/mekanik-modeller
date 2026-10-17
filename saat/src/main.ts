import { Vector3 } from 'three';
import { PartRegistry } from './core/registry';
import { Stage } from './core/stage';
import { WatchMaterials } from './watch/materials';
import { Watch } from './watch/watch';
import { WatchClock } from './watch/watchClock';
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

  const clock = new WatchClock({ t: localTime() });
  stage.onFrame((dt) => {
    clock.tick(dt);
    watch.update(clock.t, { continuous: clock.continuous, amplitude: clock.amplitude });
    stage.invalidateShadows(); // wheels, balance and hands cast shadows and move every frame
  });
  stage.start();
  loading.classList.add('is-done');
}, 50);
