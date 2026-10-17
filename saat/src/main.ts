import { CylinderGeometry, MathUtils, Mesh, Vector3 } from 'three';
import { MaterialLibrary } from './core/materials';
import { Stage } from './core/stage';
import { involuteGearOutline } from './core/geometry/gear';
import { extrudeAlongY, shapeFrom } from './core/geometry/profile';
import { bodyAngle } from './watch/train';
import { WatchClock } from './watch/watchClock';
import './style.css';

const app = document.getElementById('app')!;

const title = document.createElement('div');
title.className = 'title-block';
title.innerHTML = '<h1>Mekanik Saat</h1><p>Otomatik mekanizma · yapım aşamasında</p>';
const loading = document.createElement('div');
loading.className = 'loading';
loading.textContent = 'SAAT HAZIRLANIYOR';
app.append(title, loading);

const stage = new Stage({
  container: app,
  subjectRadius: 160,
  target: new Vector3(0, 0, 0),
  cameraPosition: new Vector3(0, 240, 240),
  floorY: -30,
  framingAspect: 1.15,
});

// Scene unit = 0.1 mm, so the watch is drawn ten times its real size.
const PLATE_RADIUS = 128; // Ø 25.6 mm

// Let the loading caption paint before the (synchronous) build starts.
setTimeout(() => {
  const materials = new MaterialLibrary();

  const plateGeo = new CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS, 25, 128);
  plateGeo.translate(0, -12.5, 0);
  const plate = new Mesh(plateGeo, materials.get('machinedSteel'));

  const gearShape = shapeFrom(involuteGearOutline({ teeth: 80, module: 1.2 }));
  const gear = new Mesh(extrudeAlongY(gearShape, 2, 5), materials.get('bronze'));

  for (const mesh of [plate, gear]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  stage.scene.add(plate, gear);

  // Placeholder wheel shows the fourth (seconds) wheel: real time, beating.
  const clock = new WatchClock();
  stage.onFrame((dt) => {
    clock.tick(dt);
    const opts = { continuous: clock.continuous, amplitude: clock.amplitude };
    gear.rotation.y = MathUtils.degToRad(bodyAngle('fourth', clock.t, opts));
    stage.invalidateShadows(); // the spinning gear is a shadow caster that moves every frame
  });
  stage.start();
  loading.classList.add('is-done');
}, 50);
