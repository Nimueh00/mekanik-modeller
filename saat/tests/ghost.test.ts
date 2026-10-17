import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { PartRegistry, type PartDef } from '../src/core/registry';
import { GhostView } from '../src/ui/ghost';

const part = (id: string, group: string): PartDef => ({
  id,
  nameTr: id,
  group,
  explodeOffset: [0, 0, 0],
  explodeOrder: 0,
  info: { function: '', material: '', notes: '' },
});

const mat = (name: string) => Object.assign(new MeshStandardMaterial(), { name });

function box(material: MeshStandardMaterial): Mesh {
  const m = new Mesh(new BoxGeometry(1, 1, 1), material);
  m.castShadow = true;
  return m;
}

describe('Hayalet görünüm', () => {
  const rhodium = mat('rhodium');
  const plate = mat('plate');
  const dial = mat('dial');
  const steel = mat('polishedSteel');
  const ruby = mat('ruby');
  let registry: PartRegistry;
  let swaps: number;
  let ghost: GhostView;
  const meshes: Record<string, Mesh> = {};

  beforeEach(() => {
    registry = new PartRegistry();
    registry.defineLayers([
      { id: 'rotor', nameTr: 'Rotor', order: 1 },
      { id: 'bridges', nameTr: 'Köprüler', order: 2 },
      { id: 'train', nameTr: 'Takım', order: 3 },
      { id: 'dial', nameTr: 'Kadran', order: 4 },
      { id: 'plate', nameTr: 'Plaka', order: 5 },
    ]);
    meshes.bridge = box(rhodium);
    meshes.jewel = box(ruby);
    meshes.screw = box(steel);
    meshes.cock = box(rhodium); // another layer, same material
    meshes.rotor = box(rhodium); // a later part (the rotor) in rhodium
    meshes.wheel = box(steel);
    meshes.plate = box(plate);
    meshes.dial = box(dial);
    registry.add(part('bridge', 'bridges'), meshes.bridge, meshes.jewel, meshes.screw);
    registry.add(part('cock', 'train'), meshes.cock);
    registry.add(part('rotor', 'rotor'), meshes.rotor);
    registry.add(part('wheel', 'train'), meshes.wheel);
    registry.add(part('plate', 'plate'), meshes.plate);
    registry.add(part('dial', 'dial'), meshes.dial);
    swaps = 0;
    ghost = new GhostView(registry, () => swaps++);
  });

  it('başlangıçta katı: hiçbir malzeme değişmez', () => {
    expect(ghost.mode).toBe('solid');
    expect(meshes.bridge!.material).toBe(rhodium);
    expect(ghost.isGhost(meshes.bridge!)).toBe(false);
  });

  it('plaka, köprüler ve kadran yarı saydam olur; takım, taşlar ve çelik katı kalır', () => {
    ghost.set('ghost');
    for (const k of ['bridge', 'plate', 'dial']) {
      const m = meshes[k]!.material as MeshStandardMaterial;
      expect(m.transparent).toBe(true);
      expect(m.opacity).toBeLessThan(0.3);
      expect(m.opacity).toBeGreaterThan(0.05);
      expect(m.depthWrite).toBe(false);
      expect(ghost.isGhost(meshes[k]!)).toBe(true);
    }
    for (const k of ['jewel', 'screw', 'wheel']) {
      expect((meshes[k]!.material as MeshStandardMaterial).transparent).toBe(false);
      expect(ghost.isGhost(meshes[k]!)).toBe(false);
    }
  });

  it('aynı malzemeyi paylaşan öteki parçalar (balans köprüsü, rotor) da ona uyar', () => {
    ghost.set('ghost');
    expect(meshes.cock!.material).toBe(meshes.bridge!.material);
    expect(meshes.rotor!.material).toBe(meshes.bridge!.material);
    expect(ghost.isGhost(meshes.rotor!)).toBe(true);
  });

  it('gölge düşürmez; katıya dönünce eski malzeme ve gölge geri gelir, paylaşılan malzemeler değişmez', () => {
    ghost.set('ghost');
    expect(meshes.bridge!.castShadow).toBe(false);
    expect(meshes.wheel!.castShadow).toBe(true);
    expect(rhodium.transparent).toBe(false);
    expect(rhodium.opacity).toBe(1);
    ghost.set('solid');
    expect(meshes.bridge!.material).toBe(rhodium);
    expect(meshes.plate!.material).toBe(plate);
    expect(meshes.bridge!.castShadow).toBe(true);
    expect(ghost.isGhost(meshes.bridge!)).toBe(false);
  });

  it('seçim vurgusunu malzeme değişiminden önce bırakır ve değişimi bildirir', () => {
    let notified = 0;
    ghost.onChange(() => notified++);
    ghost.set('ghost');
    ghost.set('ghost'); // no-op
    ghost.set('solid');
    expect(swaps).toBe(2);
    expect(notified).toBe(2);
  });

  it('iki kez hayalete geçmek malzeme yığmaz', () => {
    ghost.set('ghost');
    const first = meshes.bridge!.material;
    ghost.set('solid');
    ghost.set('ghost');
    expect(meshes.bridge!.material).toBe(first);
  });

  it('bir seçim vurgusu klonu araya girse de kaybolan özgün malzeme geri yüklenir', () => {
    ghost.set('ghost');
    meshes.bridge!.material = (meshes.bridge!.material as MeshStandardMaterial).clone(); // selection highlight
    expect(ghost.isGhost(meshes.bridge!)).toBe(true);
    ghost.set('solid');
    expect(meshes.bridge!.material).toBe(rhodium);
  });

  it('yeni parça eklenirse (rotor gibi) hayalet yeniden hesaplanır', () => {
    const late = new Group();
    const lateMesh = box(rhodium);
    late.add(lateMesh);
    registry.add(part('late', 'rotor'), lateMesh);
    ghost.set('ghost');
    expect(ghost.isGhost(lateMesh)).toBe(true);
  });
});
