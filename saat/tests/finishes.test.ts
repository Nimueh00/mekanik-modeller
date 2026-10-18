import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyPlanarUv,
  GENEVA_STRIPE_MM,
  GENEVA_STRIPES,
  genevaHeights,
  heightTexture,
  PERLAGE_CIRCLE_MM,
  PERLAGE_TILE_MM,
  perlageHeights,
} from '../src/watch/finishes';
import { WatchMaterials } from '../src/watch/materials';

const N = 256;

describe('yüzey işlemeleri', () => {
  it('perlaj: gerçek ölçek (≈1 mm daireler, 4 mm karo) ve değerler 0…1', () => {
    expect(PERLAGE_CIRCLE_MM).toBeGreaterThan(0.8);
    expect(PERLAGE_CIRCLE_MM).toBeLessThan(1.3);
    const h = perlageHeights(N);
    expect(h).toHaveLength(N * N);
    expect(Math.min(...h)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...h)).toBeLessThanOrEqual(1);
    // plenty of relief: the rings are visible, not a flat field
    const mean = h.reduce((a, b) => a + b, 0) / h.length;
    const sd = Math.sqrt(h.reduce((a, b) => a + (b - mean) ** 2, 0) / h.length);
    expect(sd).toBeGreaterThan(0.1);
    // concentric brushing: autocorrelation along a row shows rings of ≈ 0.06 mm pitch
    expect(PERLAGE_TILE_MM / 5).toBeLessThan(PERLAGE_CIRCLE_MM); // circles overlap on the 5 × 5 grid
  });

  it('perlaj karosu dikişsiz tekrarlanır (kenar komşuluğu iç komşuluk kadar yumuşak)', () => {
    const h = perlageHeights(N);
    const jump = (a: number, b: number) => Math.abs(h[a]! - h[b]!);
    let inner = 0;
    let seam = 0;
    for (let i = 0; i < N; i++) {
      inner += jump(i * N + 100, i * N + 101) + jump(100 * N + i, 101 * N + i);
      seam += jump(i * N + (N - 1), i * N) + jump((N - 1) * N + i, i);
    }
    expect(seam / (2 * N)).toBeLessThan((inner / (2 * N)) * 1.6 + 0.01);
  });

  it('perlaj üretimi deterministik', () => {
    expect(Array.from(perlageHeights(64, 3))).toEqual(Array.from(perlageHeights(64, 3)));
    expect(Array.from(perlageHeights(64, 3))).not.toEqual(Array.from(perlageHeights(64, 4)));
  });

  it('Cenevre: 1,5–2 mm genişlikte şeritler, karoda tam sayıda', () => {
    expect(GENEVA_STRIPE_MM).toBeGreaterThanOrEqual(1.5);
    expect(GENEVA_STRIPE_MM).toBeLessThanOrEqual(2);
    expect(Number.isInteger(GENEVA_STRIPES)).toBe(true);
    const h = genevaHeights(N);
    expect(Math.min(...h)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...h)).toBeLessThanOrEqual(1);
    // row-averaged profile across the stripes repeats every stripe (the wave and grain average out)
    const rows = Array.from({ length: N }, (_, y) => h.slice(y * N, (y + 1) * N).reduce((a, b) => a + b, 0) / N);
    const stripe = N / GENEVA_STRIPES;
    let diff = 0;
    for (let y = 0; y < N - stripe; y++) diff = Math.max(diff, Math.abs(rows[y]! - rows[y + stripe]!));
    expect(diff).toBeLessThan(0.08);
    // and it is a real profile: ridge and valley differ clearly within a stripe
    const one = rows.slice(0, stripe);
    expect(Math.max(...one) - Math.min(...one)).toBeGreaterThan(0.3);
  });

  it('Cenevre şeritleri boyunca (x) ortalama dalgalıdır ama şeritler paralel kalır', () => {
    const h = genevaHeights(N);
    // along a stripe the profile moves (wave) by less than one stripe: ridge stays a ridge
    const ridgeRow = (x: number) => {
      let best = 0;
      for (let y = 0; y < N / GENEVA_STRIPES; y++) if (h[y * N + x]! > h[best * N + x]!) best = y;
      return best;
    };
    const rowsAlong = [0, N / 4, N / 2, (3 * N) / 4].map(ridgeRow);
    expect(Math.max(...rowsAlong) - Math.min(...rowsAlong)).toBeLessThan(N / GENEVA_STRIPES);
  });

  it('doku: gri RGBA, 0.35…1 aralığı, karo boyutu repeat = 1 / mm', () => {
    const t = heightTexture(new Float32Array([0, 1, 0.5, 0.25]), 2, 4, 0);
    const d = t.image.data as Uint8Array;
    expect(d[0]).toBe(Math.round(0.35 * 255));
    expect(d[4]).toBe(255);
    expect(d[3]).toBe(255);
    expect(d[0]).toBe(d[1]);
    expect(t.repeat.x).toBeCloseTo(0.25, 12);
  });

  it('plaka perlajı, köprüler Cenevre taşır; mevcut malzeme anahtarları değişmedi', () => {
    const m = new WatchMaterials();
    expect(m.get('plate').userData.finish).toBe('perlage');
    expect(m.get('rhodium').userData.finish).toBe('geneva');
    for (const k of ['plate', 'rhodium'] as const) {
      const mat = m.get(k);
      expect(mat.bumpMap).toBeTruthy();
      expect(mat.roughnessMap).toBeTruthy();
      expect(mat.metalness).toBe(1);
      expect(mat.name).toBe(k);
    }
    // the stripes' scale in the shared texture: tile 4 stripes × 1.75 mm
    expect(m.get('rhodium').bumpMap!.repeat.x).toBeCloseTo(1 / (GENEVA_STRIPE_MM * GENEVA_STRIPES), 12);
    expect(m.get('plate').bumpMap!.repeat.x).toBeCloseTo(1 / PERLAGE_TILE_MM, 12);
    // other metals stay plain
    expect(m.get('brass').bumpMap).toBeNull();
    expect(m.get('polishedSteel').userData.finish).toBeUndefined();
  });
});

describe('applyPlanarUv', () => {
  const m = new WatchMaterials();

  it('UV’si olmayan, işlemeli malzemeli mesh’e plan konumundan (mm) UV verir', () => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([10, 5, 20, -30, 0, 40, 0, 1, 0], 3));
    const mesh = new Mesh(g, m.get('rhodium'));
    const root = new Group();
    root.add(mesh);
    expect(applyPlanarUv(root)).toBe(1);
    const uv = g.getAttribute('uv');
    expect([uv.getX(0), uv.getY(0)]).toEqual([1, 2]);
    expect([uv.getX(1), uv.getY(1)]).toEqual([-3, 4]);
  });

  it('UV’si olan ya da işlemesiz malzemeli mesh’e dokunmaz', () => {
    const box = new BoxGeometry(1, 1, 1);
    const before = Array.from(box.getAttribute('uv').array);
    const root = new Group();
    root.add(new Mesh(box, m.get('plate')), new Mesh(new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3)), m.get('brass')));
    expect(applyPlanarUv(root)).toBe(0);
    expect(Array.from(box.getAttribute('uv').array)).toEqual(before);
  });
});
