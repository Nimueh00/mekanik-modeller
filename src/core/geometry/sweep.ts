import { BufferGeometry, type Curve, Float32BufferAttribute, Vector3 } from 'three';

/**
 * Watertight tube swept along a curve: circular cross-section whose radius
 * may vary along the path, both ends closed with flat caps. Suitable as a
 * CSG cutter (e.g. intake/exhaust ports). Frames use parallel transport, so
 * the tube does not twist.
 */
export function sweepTube(
  curve: Curve<Vector3>,
  radius: (t: number) => number,
  tubularSegments = 48,
  radialSegments = 32,
): BufferGeometry {
  const pts: Vector3[] = [];
  const tans: Vector3[] = [];
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    pts.push(curve.getPoint(t));
    tans.push(curve.getTangent(t).normalize());
  }
  // initial normal: any vector perpendicular to the first tangent
  const t0 = tans[0]!;
  const ref = Math.abs(t0.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  let n = new Vector3().crossVectors(t0, ref).normalize();
  const normals: Vector3[] = [];
  const binormals: Vector3[] = [];
  for (let i = 0; i <= tubularSegments; i++) {
    const t = tans[i]!;
    if (i > 0) {
      // parallel transport: remove the tangent component and renormalise
      n = n.clone().addScaledVector(t, -n.dot(t)).normalize();
    }
    normals.push(n);
    binormals.push(new Vector3().crossVectors(t, n).normalize());
  }

  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const ring = radialSegments;
  for (let i = 0; i <= tubularSegments; i++) {
    const r = radius(i / tubularSegments);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const dx = normals[i]!.x * Math.cos(a) + binormals[i]!.x * Math.sin(a);
      const dy = normals[i]!.y * Math.cos(a) + binormals[i]!.y * Math.sin(a);
      const dz = normals[i]!.z * Math.cos(a) + binormals[i]!.z * Math.sin(a);
      pos.push(pts[i]!.x + dx * r, pts[i]!.y + dy * r, pts[i]!.z + dz * r);
      nor.push(dx, dy, dz);
    }
  }
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + j;
      const d = (i + 1) * ring + ((j + 1) % ring);
      idx.push(a, b, c, b, d, c);
    }
  }
  // caps (separate vertices for flat normals)
  for (const end of [0, tubularSegments]) {
    const sign = end === 0 ? -1 : 1;
    const t = tans[end]!;
    const centre = pos.length / 3;
    pos.push(pts[end]!.x, pts[end]!.y, pts[end]!.z);
    nor.push(t.x * sign, t.y * sign, t.z * sign);
    const first = pos.length / 3;
    for (let j = 0; j < ring; j++) {
      const k = (end * ring + j) * 3;
      pos.push(pos[k]!, pos[k + 1]!, pos[k + 2]!);
      nor.push(t.x * sign, t.y * sign, t.z * sign);
    }
    for (let j = 0; j < ring; j++) {
      const a = first + j;
      const b = first + ((j + 1) % ring);
      if (sign < 0) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
