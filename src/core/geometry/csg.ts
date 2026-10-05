import { BufferGeometry, Mesh, MeshBasicMaterial } from 'three';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { crease, normalizeGeometry } from './profile';

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal', 'uv'];
evaluator.useGroups = false;
const dummy = new MeshBasicMaterial();

function brush(g: BufferGeometry): Brush {
  const b = new Brush(normalizeGeometry(g), dummy);
  b.updateMatrixWorld();
  return b;
}

type Op = typeof ADDITION | typeof SUBTRACTION | typeof INTERSECTION;

function run(base: BufferGeometry, others: BufferGeometry[], op: Op, creaseDeg?: number): BufferGeometry {
  let acc = brush(base);
  for (const o of others) {
    const next = evaluator.evaluate(acc, brush(o), op) as Brush;
    next.updateMatrixWorld();
    acc = next;
  }
  const g = (acc as Mesh).geometry;
  g.clearGroups();
  return creaseDeg === undefined ? g : crease(g, creaseDeg);
}

/** base − Σ cutters. Normals from the inputs are kept (smooth where they were smooth). */
export const subtract = (base: BufferGeometry, cutters: BufferGeometry[], creaseDeg?: number) =>
  run(base, cutters, SUBTRACTION, creaseDeg);

export const union = (base: BufferGeometry, others: BufferGeometry[], creaseDeg?: number) =>
  run(base, others, ADDITION, creaseDeg);

export const intersect = (base: BufferGeometry, others: BufferGeometry[], creaseDeg?: number) =>
  run(base, others, INTERSECTION, creaseDeg);
