import { Group, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { PartRegistry } from '../src/core/registry';
import { cameraPresets, fractionIn, labelDefs, toScene, VIEW_SPECS } from '../src/ui/views';
import { Box3 } from 'three';
import { WatchMaterials } from '../src/watch/materials';
import { AXES, MOVEMENT, SCENE_PER_MM } from '../src/watch/specs';
import { Watch } from '../src/watch/watch';

/** The movement stood up as main.ts does: dial → −Z, 12 o'clock → +Y. */
function standingRoot(): Group {
  const root = new Group();
  root.rotation.set(Math.PI / 2, Math.PI, 0, 'YXZ');
  return root;
}

const v = (a: readonly number[]) => new Vector3(a[0], a[1], a[2]);

describe('kamera ön ayarları', () => {
  const root = standingRoot();
  const presets = cameraPresets(root);
  const byId = (id: string) => presets.find((p) => p.id === id)!;

  it('beş ön ayar, sırayla: arka genel (varsayılan), çıkış, takım, kadran, profil', () => {
    expect(presets.map((p) => p.id)).toEqual(['back', 'escapement', 'train', 'dial', 'profile']);
    expect(presets.map((p) => p.label)).toEqual(['Arka genel', 'Çıkış mekanizması', 'Dişli takımı', 'Kadran tarafı', 'Profil']);
    expect(presets.map((p) => p.id)).toEqual(VIEW_SPECS.map((s) => s.id));
  });

  it('hedefler, ilgili eksenlerin sahne konumlarına (kök dönüşümü dahil) denk', () => {
    const at = (name: keyof typeof AXES, y: number) => toScene(root, AXES[name], y);
    // single-axis views: exactly the arbor
    expect(v(byId('back').target).distanceTo(at('centre', VIEW_SPECS[0]!.y))).toBeLessThan(1e-6);
    expect(v(byId('dial').target).distanceTo(at('centre', VIEW_SPECS[3]!.y))).toBeLessThan(1e-6);
    expect(v(byId('profile').target).distanceTo(at('centre', VIEW_SPECS[4]!.y))).toBeLessThan(1e-6);
    // escapement: the middle of balance, pallet and escape arbors
    const mid = new Vector3()
      .add(at('balance', 0))
      .add(at('pallet', 0))
      .add(at('escape', 0))
      .multiplyScalar(1 / 3);
    const t = v(byId('escapement').target);
    // plan position (the two scene axes that carry the plan) equal; height is the view's own
    expect(t.x).toBeCloseTo(mid.x, 6);
    expect(t.y).toBeCloseTo(mid.y, 6);
    // train: the middle of barrel, centre, third and escape arbors
    const tm = new Vector3();
    for (const n of ['barrel', 'centre', 'third', 'escape'] as const) tm.add(at(n, 0));
    tm.multiplyScalar(1 / 4);
    const tt = v(byId('train').target);
    expect(tt.x).toBeCloseTo(tm.x, 6);
    expect(tt.y).toBeCloseTo(tm.y, 6);
  });

  it('hedef, kök dönüşümü değişince birlikte hareket eder (sayı gömülü değil)', () => {
    const moved = standingRoot();
    moved.position.set(40, -7, 13);
    const other = cameraPresets(moved);
    for (let i = 0; i < presets.length; i++) {
      const d = v(other[i]!.target).sub(v(presets[i]!.target));
      expect(d.distanceTo(new Vector3(40, -7, 13))).toBeLessThan(1e-6);
      const dp = v(other[i]!.position).sub(v(presets[i]!.position));
      expect(dp.distanceTo(new Vector3(40, -7, 13))).toBeLessThan(1e-6);
    }
  });

  it('düzen: 12 yukarıda, arka +Z’de, kadran −Z’de; kamera doğru yüze bakar', () => {
    // 6 o'clock (the balance sits below the centre) is lower in the scene than the centre
    expect(toScene(root, AXES.balance, 0).y).toBeLessThan(toScene(root, AXES.centre, 0).y);
    for (const id of ['back', 'escapement', 'train']) expect(v(byId(id).position).z).toBeGreaterThan(v(byId(id).target).z);
    expect(v(byId('dial').position).z).toBeLessThan(v(byId('dial').target).z);
    // profile: beside the movement, not in front of it
    const d = v(byId('profile').position).sub(v(byId('profile').target));
    expect(Math.abs(d.x)).toBeGreaterThan(Math.abs(d.z) * 5);
  });

  it('mesafe: tüm mekanizmayı ya da ilgili parçaları sığdırır ve yörünge sınırlarının içinde', () => {
    for (const p of presets) {
      const d = v(p.position).distanceTo(v(p.target));
      expect(d).toBeGreaterThan(150); // Stage minDistance = 0.3 × 150
      expect(d).toBeLessThan(1200); // Stage maxDistance = 8 × 150
    }
    // the general view frames the whole Ø 25.6 mm plate
    const dBack = v(byId('back').position).distanceTo(v(byId('back').target));
    expect(dBack * Math.tan((16 * Math.PI) / 180)).toBeGreaterThan((MOVEMENT.diameter / 2) * SCENE_PER_MM);
  });
});

describe('etiketler', () => {
  let registry: PartRegistry;
  beforeAll(() => {
    registry = new PartRegistry();
    new Watch(registry, new WatchMaterials()).build();
    registry.root.rotation.set(Math.PI / 2, Math.PI, 0, 'YXZ');
    registry.root.updateMatrixWorld(true);
  });

  it('yalnızca kayıtlı parçalar için, kısa Türkçe adlarla', () => {
    const defs = labelDefs(registry);
    const names = defs.map((d) => d.text);
    for (const n of ['Balans', 'Spiral yay', 'Çatal', 'Çıkış çarkı', 'Dördüncü çark', 'Üçüncü çark', 'Merkez çarkı', 'Zemberek kutusu', 'Köprüler', 'Yakut taş', 'İbreler']) {
      expect(names).toContain(n);
    }
    for (const d of defs) {
      expect(() => registry.get(d.partId)).not.toThrow();
      expect(d.text.length).toBeLessThan(20);
    }
    expect(new Set(defs.map((d) => d.partId)).size).toBe(defs.length);
  });

  it('yakut taş etiketi balans yatağının tam üstüne bağlanır', () => {
    const d = labelDefs(registry).find((x) => x.text === 'Yakut taş')!;
    const box = new Box3().setFromObject(registry.get(d.partId).root);
    const at = new Vector3(
      box.min.x + (box.max.x - box.min.x) * d.at![0],
      box.min.y + (box.max.y - box.min.y) * d.at![1],
      box.min.z + (box.max.z - box.min.z) * d.at![2],
    );
    const jewel = toScene(registry.root, AXES.balance, MOVEMENT.envelope.bridges[0]);
    expect(at.distanceTo(jewel)).toBeLessThan(1e-4);
  });

  it('fractionIn, kutu içindeki noktayı oran olarak verir', () => {
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(10, 20, 40));
    expect(fractionIn(box, new Vector3(5, 5, 10))).toEqual([0.5, 0.25, 0.25]);
  });
});
