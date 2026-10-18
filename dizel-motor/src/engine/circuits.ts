import {
  AdditiveBlending,
  BufferAttribute,
  type BufferGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OVERLAY_LAYER } from '../core/stage';
import { CAM_CENTRE, CAM_JOURNAL_X } from './headLayout';
import { CYLINDER_X, MAIN_X, SPECS } from './specs';

/*
 * Schematic lubrication and cooling circuits for the guided tour (step 5).
 *
 * Drawn as glowing tubes with dashes that travel in the flow direction, on
 * top of the (ghosted) housings — an "x-ray" diagram, not modelled drillings.
 * Routes follow where the passages are in a typical DOHC four:
 *   Oil: sump pick-up → crank-driven pump (timing end) → main gallery along
 *   the block → a drilling to every main bearing; a riser to the head →
 *   head gallery → every camshaft journal; drain back to the sump.
 *   Coolant: water pump (timing end) → block water jacket around the bores
 *   (the jacket really is there, see block.ts) → up through the deck holes →
 *   head jacket around the chambers → thermostat housing → radiator.
 */

type P = [number, number, number];

const OIL_SPEED = 55; // mm/s along the line (only the look)
const WATER_SPEED = 70;

const VERT = /* glsl */ `
  attribute float aDist;
  varying float vDist;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vDist = aDist;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uOpacity;
  varying float vDist;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    // travelling dashes (period 26 mm) on a dim continuous core
    float s = fract((vDist - uTime * uSpeed) / 26.0);
    float dash = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.45, 0.6, s));
    float rim = 1.0 - abs(dot(vN, vView));
    float a = (0.28 + 0.72 * dash) * (0.55 + 0.45 * rim);
    gl_FragColor = vec4(uColor * (0.7 + 0.9 * dash), a * uOpacity);
  }
`;

function tube(points: P[], radius: number): BufferGeometry {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(...p)),
    false,
    'catmullrom',
    0.05,
  );
  const len = curve.getLength();
  const segs = Math.max(8, Math.round(len / 6));
  const g = new TubeGeometry(curve, segs, radius, 10, false);
  const uv = g.getAttribute('uv');
  const dist = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) dist[i] = uv.getX(i) * len;
  g.setAttribute('aDist', new BufferAttribute(dist, 1));
  return g;
}

function material(color: string, speed: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uOpacity: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** Oil circuit polylines (flow direction = point order). */
function oilPaths(): P[][] {
  const front = -186;
  const gallery: P = [front, 96, 60];
  const paths: P[][] = [
    // pick-up in the sump → pump → filter boss → main gallery
    [
      [70, -140, 0],
      [70, -100, 0],
      [10, -88, 20],
      [-150, -72, 32],
      [front, -40, 44],
      [front, 30, 58],
      gallery,
    ],
    // main gallery along the block
    [gallery, [190, 96, 60]],
  ];
  // drillings: gallery → each main bearing
  for (const x of MAIN_X) paths.push([[x, 96, 60], [x, 60, 40], [x, 27, 6]]);
  // riser to the head, head gallery, cam journals
  const headY = CAM_CENTRE.intake.y - 34;
  paths.push([gallery, [front - 4, 160, 70], [front - 4, SPECS.block.deckHeight + 10, 66], [front + 2, headY, 0]]);
  paths.push([[front + 2, headY, 0], [178, headY, 0]]);
  for (const x of CAM_JOURNAL_X) {
    for (const k of ['intake', 'exhaust'] as const) {
      const c = CAM_CENTRE[k];
      paths.push([[x, headY, 0], [x, headY + 4, c.z * 0.5], [x, c.y - 15, c.z]]);
    }
  }
  // drain back from the head (rear) to the sump
  paths.push([[188, CAM_CENTRE.intake.y - 10, -40], [192, 200, -70], [192, 40, -90], [150, -80, -60], [90, -135, -20]]);
  return paths;
}

/** Coolant circuit polylines. */
function waterPaths(): P[][] {
  const y0 = 160;
  const z = 50;
  const paths: P[][] = [
    // water pump (timing end, exhaust side) → into the jacket
    [
      [-262, 110, 78],
      [-226, 130, 64],
      [-192, 150, z],
    ],
  ];
  // jacket: down both sides of the bores, weaving between them, rejoining at the rear
  for (const s of [1, -1]) {
    const pts: P[] = [[-192, y0, s * z]];
    for (let i = 0; i < CYLINDER_X.length; i++) {
      const cx = CYLINDER_X[i]!;
      pts.push([cx - 30, y0 + (i % 2 ? 6 : -6), s * (z - 2)], [cx + 30, y0 + (i % 2 ? -6 : 6), s * (z - 2)]);
    }
    pts.push([186, y0, s * z * 0.8], [190, y0, 0]);
    paths.push(s > 0 ? pts : [[-192, y0, z], [-196, y0, 0], ...pts]);
  }
  // up through the deck transfer holes into the head jacket
  for (const cx of CYLINDER_X) for (const s of [1, -1]) paths.push([[cx + 44, y0 + 4, s * 46], [cx + 44, SPECS.block.deckHeight + 30, s * 40]]);
  // head jacket: rear → front around the chambers, out through the thermostat housing
  const hy = SPECS.block.deckHeight + 30;
  paths.push([[176, hy, 40], [0, hy + 6, 44], [-176, hy, 40], [-200, hy + 8, 0]]);
  paths.push([[176, hy, -40], [0, hy + 6, -44], [-176, hy, -40], [-200, hy + 8, 0]]);
  paths.push([[-200, hy + 8, 0], [-232, hy + 26, -30], [-268, hy + 40, -60]]);
  return paths;
}

/**
 * The two circuits as one group (two draw calls). Fade them in/out with
 * `setVisible`; `update(time)` animates the dashes.
 */
export class Circuits {
  readonly root = new Group();
  private oil = material('#f2a33a', OIL_SPEED);
  private water = material('#3fb6e8', WATER_SPEED);
  private target = 0;
  private opacity = 0;

  constructor() {
    const oilMesh = new Mesh(mergeGeometries(oilPaths().map((p) => tube(p, 3.2))), this.oil);
    const waterMesh = new Mesh(mergeGeometries(waterPaths().map((p) => tube(p, 4))), this.water);
    for (const m of [oilMesh, waterMesh]) {
      m.renderOrder = 50;
      m.frustumCulled = false;
      m.raycast = () => {};
      m.layers.set(OVERLAY_LAYER);
      this.root.add(m);
    }
    this.root.visible = false;
    this.root.name = 'circuits';
  }

  get shown(): boolean {
    return this.target > 0;
  }

  setVisible(on: boolean): void {
    this.target = on ? 1 : 0;
    if (on) this.root.visible = true;
  }

  update(dt: number, time: number): void {
    this.opacity += (this.target - this.opacity) * Math.min(1, dt * 5);
    if (this.target === 0 && this.opacity < 0.01) {
      this.opacity = 0;
      this.root.visible = false;
    }
    for (const m of [this.oil, this.water]) {
      m.uniforms.uTime!.value = time;
      m.uniforms.uOpacity!.value = this.opacity;
    }
  }
}
