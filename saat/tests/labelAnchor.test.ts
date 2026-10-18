import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { worldOffset } from '../src/core/labels';
import { PartRegistry, type PartDef } from '../src/core/registry';
import { partCorners, viewExtents, zoomToFit } from '../src/ui/fit';

const def = (id: string, offset: [number, number, number]): PartDef => ({
  id,
  nameTr: id,
  group: 'g',
  explodeOffset: offset,
  explodeOrder: 0,
  info: { function: '', material: '', notes: '' },
});

/** A registry whose root is stood up the way main.ts does it, with one box part at (−20, 5, 12) in the movement frame. */
function setup(rotated: boolean) {
  const registry = new PartRegistry();
  registry.defineLayers([{ id: 'g', nameTr: 'g', order: 1 }]);
  const mesh = new Mesh(new BoxGeometry(4, 2, 6), new MeshBasicMaterial());
  mesh.position.set(-20, 5, 12);
  const node = registry.add(def('p', [0, -300, 40]), mesh);
  if (rotated) registry.root.rotation.set(Math.PI / 2, Math.PI, 0, 'YXZ');
  registry.root.updateMatrixWorld(true);
  return { registry, node };
}

const centre = (o: Group) => new Box3().setFromObject(o).getCenter(new Vector3());

describe('etiket çapası (K6)', () => {
  it('döndürülmüş kökte açılmış parçanın çapası, parçanın dünya kutusunun içinde kalır', () => {
    const { registry, node } = setup(true);
    const rest = new Box3().setFromObject(node.root);
    const anchorAtRest = rest.getCenter(new Vector3()); // LabelSystem.build keeps this as `rest`
    for (const t of [0, 0.25, 0.5, 1]) {
      registry.setExplode(() => t);
      registry.root.updateMatrixWorld(true);
      const box = new Box3().setFromObject(node.root);
      const anchor = anchorAtRest.clone().add(worldOffset(node.root, new Vector3()));
      expect(box.expandByScalar(1e-6).containsPoint(anchor)).toBe(true);
      expect(anchor.distanceTo(centre(node.root))).toBeLessThan(1e-6);
    }
  });

  it('eski hesap (dünya = rest + root.position) döndürülmüş kökte parçanın dışına düşerdi', () => {
    const { registry, node } = setup(true);
    const rest = new Box3().setFromObject(node.root).getCenter(new Vector3());
    registry.setExplode(() => 1);
    registry.root.updateMatrixWorld(true);
    const naive = rest.clone().add(node.root.position);
    expect(new Box3().setFromObject(node.root).containsPoint(naive)).toBe(false);
  });

  it('kök döndürülmemişse sonuç root.position ile birebir aynı', () => {
    const { registry, node } = setup(false);
    registry.setExplode(() => 0.37);
    registry.root.updateMatrixWorld(true);
    const out = worldOffset(node.root, new Vector3());
    expect(out.toArray()).toEqual(node.root.position.toArray());
  });

  it('kökün ötelemesi etkilemez, ölçeği taşır', () => {
    const { registry, node } = setup(false);
    registry.root.position.set(100, 200, 300);
    registry.root.scale.setScalar(2);
    registry.setExplode(() => 1);
    registry.root.updateMatrixWorld(true);
    expect(worldOffset(node.root, new Vector3()).toArray()).toEqual([0, -600, 80]);
  });
});

describe('demontaj kadrajı', () => {
  const camera = new PerspectiveCamera(32, 1.5, 4.5, 6000);
  camera.position.set(0, 0, 500);
  camera.lookAt(0, 0, 0);

  it('uzantı: eksen dışına uzak nokta daha büyük uzantı verir; derinlik küçültür', () => {
    const near = viewExtents(camera, [new Vector3(50, 0, 0)]);
    const far = viewExtents(camera, [new Vector3(50, 0, -400)]);
    expect(near.x).toBeGreaterThan(far.x);
    expect(near.y).toBe(0);
    expect(viewExtents(camera, [new Vector3(0, 80, 0)]).y).toBeGreaterThan(0);
  });

  it('zoomToFit: bu zoomla noktalar serbest alanın yüzde 90’ında biter', () => {
    const pts = [new Vector3(120, -60, 200), new Vector3(-90, 100, -300), new Vector3(30, -140, 380)];
    const ext = viewExtents(camera, pts);
    const freeW = 0.7;
    const freeH = 0.5;
    const z = zoomToFit(ext, freeW, freeH);
    const c = camera.clone();
    c.zoom = z;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    let mx = 0;
    let my = 0;
    for (const p of pts) {
      const n = p.clone().project(c);
      mx = Math.max(mx, Math.abs(n.x));
      my = Math.max(my, Math.abs(n.y));
    }
    expect(Math.max(mx / freeW, my / freeH)).toBeCloseTo(0.9, 6);
  });

  it('açılmış, döndürülmüş saatte tüm parçalar serbest alanda kalır', () => {
    const { registry } = setup(true);
    for (const t of [0.5, 1]) {
      registry.setExplode(() => t);
      registry.root.updateMatrixWorld(true);
      const corners = partCorners(registry.all().map((p) => p.root));
      const z = zoomToFit(viewExtents(camera, corners), 0.8, 0.8);
      const c = camera.clone();
      c.zoom = z;
      c.updateProjectionMatrix();
      c.updateMatrixWorld();
      for (const p of corners) {
        const n = p.clone().project(c);
        expect(Math.abs(n.x)).toBeLessThanOrEqual(0.8 + 1e-9);
        expect(Math.abs(n.y)).toBeLessThanOrEqual(0.8 + 1e-9);
      }
    }
  });

  it('görünmeyen parçalar kadrajı etkilemez', () => {
    const { registry, node } = setup(true);
    registry.setExplode(() => 1);
    node.root.visible = false;
    expect(partCorners(registry.all().map((p) => p.root))).toHaveLength(0);
  });
});
