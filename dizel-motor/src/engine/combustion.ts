import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  type Plane,
  PointLight,
  ShaderMaterial,
  Vector3,
} from 'three';
import { GLOW_LAYER, OVERLAY_LAYER } from '../core/stage';
import { HEAD_FACE_Y, RIDGE_Y } from './headLayout';
import { flameRadius, sparkPoint } from './gasFlow';
import { pistonPinHeight } from './kinematics';
import { CYLINDER_X, SPECS } from './specs';
import { burnFraction, cylinderPressure, fromFiringTdc, gasTemperature, INJECTION_PHI } from './thermo';
import { cycleAngle } from './timing';

/*
 * Spark, flame front and glowing cylinder gas.
 *
 *  - Spark: from ignition (15° BTDC) for 9 crank degrees, a flickering arc and
 *    a hot point at the plug gap.
 *  - Flame front: a sphere centred on the gap whose radius follows the Wiebe
 *    burn fraction (gasFlow.flameRadius). Fragments outside the gas volume
 *    (bore, piston crown, pent roof) are discarded, so the front looks
 *    quenched where it reaches the walls. Seen face-on it is blue (the thin
 *    premixed reaction zone looks blue), at grazing angles orange.
 *  - Gas volume: a cylinder of gas from the crown to the roof, tinted by state
 *    (fresh blue, burning orange) with an opacity that grows with pressure;
 *    its glow decays with the gas temperature through the expansion stroke.
 *  - One point light follows the brightest combustion.
 *  All of these are HDR, so only they pass the bloom threshold.
 */

const VOLUME_CLIP = /* glsl */ `
  uniform float uAxisX;
  uniform float uBoreR;
  uniform float uFloorY;
  uniform float uHeadY;
  uniform float uRidgeY;
  uniform float uRoofSlope;
  uniform float uChamberHalfX;
  float crownSurfaceY(float r) {
    float pinY = uFloorY - 30.0;
    float yCone = 30.9 + max(0.0, 31.05 - r) * uRoofSlope;
    if (r >= 16.5) return pinY + yCone;
    float yLip = 30.9 + (31.05 - 16.5) * uRoofSlope;
    if (r <= 11.0) {
      float u = r / 11.0;
      return pinY + 30.5 - (30.5 - 24.5) * (3.0 * u * u - 2.0 * u * u * u);
    }
    float u = (r - 11.0) / (16.5 - 11.0);
    return pinY + 24.5 + (yLip - 24.5) * (3.0 * u * u - 2.0 * u * u * u);
  }
  bool outsideGas(vec3 p) {
    float dx = p.x - uAxisX;
    float r2 = dx * dx + p.z * p.z;
    if (r2 > uBoreR * uBoreR) return true;
    float r = sqrt(r2);
    if (p.y < crownSurfaceY(r)) return true;
    float ceil = abs(dx) <= uChamberHalfX ? max(uHeadY, uRidgeY - uRoofSlope * abs(p.z)) : uHeadY;
    return p.y > ceil;
  }
`;

const FLAME_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const FLAME_FRAG = /* glsl */ `
  uniform float uIntensity;
  uniform vec3 uCore;
  uniform vec3 uFront;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  ${VOLUME_CLIP}
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    if (outsideGas(vWorld)) discard;
    vec3 v = normalize(cameraPosition - vWorld);
    float facing = abs(dot(normalize(vNormalW), v));
    float rim = pow(1.0 - facing, 1.6);
    // wrinkled front: cheap 3D ripple so the sphere does not look like a ball
    float ripple = 0.75 + 0.25 * sin(vWorld.x * 0.55 + vWorld.y * 0.7) * sin(vWorld.z * 0.6 - vWorld.y * 0.4);
    vec3 col = mix(uCore * 0.55, uFront, rim) * ripple * uIntensity;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const GAS_VERT = FLAME_VERT;

const GAS_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  ${VOLUME_CLIP}
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    if (outsideGas(vWorld)) discard;
    vec3 v = normalize(cameraPosition - vWorld);
    float facing = abs(dot(normalize(vNormalW), v));
    // thicker-looking towards the silhouette, like a volume
    float a = uAlpha * (0.55 + 0.45 * (1.0 - facing));
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SPRAY_TIME = 28; // crank degrees
const ROOF_SLOPE = Math.tan((SPECS.valveTrain.includedAngleDeg / 2) * (Math.PI / 180));

interface CylFx {
  index: number;
  group: Group;
  flame: Mesh;
  flameMat: ShaderMaterial;
  gas: Mesh;
  gasMat: ShaderMaterial;
  spark: Mesh;
  arc: LineSegments;
  arcGeo: BufferGeometry;
  /** current combustion brightness (0..1+), for light and bloom */
  glow: number;
}

function volumeUniforms(cylinder: number) {
  return {
    uAxisX: { value: CYLINDER_X[cylinder]! },
    uBoreR: { value: SPECS.bore / 2 - 0.2 },
    uFloorY: { value: 0 },
    uHeadY: { value: HEAD_FACE_Y },
    uRidgeY: { value: RIDGE_Y },
    uRoofSlope: { value: ROOF_SLOPE },
    uChamberHalfX: { value: SPECS.head.chamberHalfX },
  };
}

export class Combustion {
  readonly root = new Group();
  readonly light: PointLight;
  private fx: CylFx[] = [];
  /** Highest glow of any cylinder in the last update (drives bloom). */
  glow = 0;
  private tmp = new Vector3();

  constructor(clipPlanes: Plane[]) {
    this.root.name = 'combustion';
    // Always present (intensity 0 when idle) so adding it never recompiles the scene's shaders.
    this.light = new PointLight(new Color('#ff8a3a'), 0, 260, 2);
    this.light.castShadow = false;
    this.root.add(this.light);

    const sphere = new IcosahedronGeometry(1, 4);
    const gasGeo = new CylinderGeometry(1, 1, 1, 48, 1, false);
    gasGeo.translate(0, 0.5, 0);
    const sparkGeo = new IcosahedronGeometry(1.1, 1);

    for (let c = 0; c < SPECS.cylinders; c++) {
      const group = new Group();
      const flameMat = new ShaderMaterial({
        uniforms: {
          ...volumeUniforms(c),
          uIntensity: { value: 0 },
          uCore: { value: new Color(4.5, 3.2, 0.9) },
          uFront: { value: new Color(8.5, 2.4, 0.35) },
        },
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        clipping: true,
      });
      flameMat.clippingPlanes = clipPlanes;
      const flame = new Mesh(sphere, flameMat);
      flame.renderOrder = 22;
      flame.frustumCulled = false;

      const gasMat = new ShaderMaterial({
        uniforms: { ...volumeUniforms(c), uColor: { value: new Color() }, uAlpha: { value: 0 } },
        vertexShader: GAS_VERT,
        fragmentShader: GAS_FRAG,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        side: DoubleSide,
        clipping: true,
      });
      gasMat.clippingPlanes = clipPlanes;
      const gas = new Mesh(gasGeo, gasMat);
      gas.renderOrder = 18;
      gas.frustumCulled = false;

      const sparkMat = new MeshBasicMaterial({ color: new Color(8, 6, 2.5), transparent: true, depthWrite: false, blending: AdditiveBlending });
      sparkMat.clippingPlanes = clipPlanes;
      const spark = new Mesh(sparkGeo, sparkMat);
      spark.renderOrder = 24;
      const arcGeo = new BufferGeometry();
      arcGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(7 * 4 * 3), 3));
      const arcMat = new LineBasicMaterial({ color: new Color(7, 5.5, 2.2), transparent: true, depthWrite: false, blending: AdditiveBlending });
      arcMat.clippingPlanes = clipPlanes;
      const arc = new LineSegments(arcGeo, arcMat);
      arc.renderOrder = 24;
      arc.frustumCulled = false;

      for (const o of [flame, gas, spark, arc]) {
        o.raycast = () => {};
        o.layers.set(GLOW_LAYER);
      }
      group.add(gas, flame, spark, arc);
      this.root.add(group);
      this.fx.push({ index: c, group, flame, flameMat, gas, gasMat, spark, arc, arcGeo, glow: 0 });
    }
  }

  /** Combustion brightness of one cylinder (0 when nothing glows). */
  glowOf(cylinder: number): number {
    return this.fx[cylinder]?.glow ?? 0;
  }

  update(crankAngleDeg: number, timeSec: number): void {
    let best: CylFx | null = null;
    this.glow = 0;
    for (const f of this.fx) {
      this.updateCylinder(f, crankAngleDeg, timeSec);
      if (!best || f.glow > best.glow) best = f;
      this.glow = Math.max(this.glow, f.glow);
    }
    if (best && best.glow > 0.01) {
      sparkPoint(best.index, this.light.position);
      this.light.position.y -= 14;
      this.light.intensity = 5000 * best.glow;
    } else {
      this.light.intensity = 0;
    }
  }

  private updateCylinder(f: CylFx, crankAngleDeg: number, timeSec: number): void {
    const phi = cycleAngle(f.index, crankAngleDeg);
    const a = fromFiringTdc(phi); // −15 at ignition
    const crownY = pistonPinHeight(phi % 360) + SPECS.piston.compressionHeight;
    const T = gasTemperature(phi);
    const p = cylinderPressure(phi);
    const sp = sparkPoint(f.index, this.tmp);

    // ---- spark ----
    const sinceSpark = ((phi - INJECTION_PHI) % 720 + 720) % 720;
    const sparkOn = sinceSpark < SPRAY_TIME;
    f.spark.visible = sparkOn;
    f.arc.visible = sparkOn;
    if (sparkOn) {
      const k = 1 - sinceSpark / SPRAY_TIME;
      const flicker = 0.7 + 0.3 * Math.sin(timeSec * 90 + f.index);
      f.spark.position.copy(sp);
      f.spark.scale.setScalar(0.8 + 1.4 * k * flicker);
      (f.spark.material as MeshBasicMaterial).opacity = Math.min(1, 0.4 + k);
      this.zigzag(f, sp, timeSec);
      (f.arc.material as LineBasicMaterial).opacity = k;
    }

    // ---- flame front ----
    const R = flameRadius(phi);
    const xb = burnFraction(a);
    const burning = a >= -5 && a < 75 && R > 0;
    f.flame.visible = burning;
    if (burning) {
      f.flame.position.copy(sp);
      f.flame.scale.setScalar(Math.max(R, 0.5));
      // bright while the front is young, fading out as the charge burns out
      const fade = 1 - xb * xb * xb;
      f.flameMat.uniforms.uIntensity!.value = 1.6 * fade;
      f.flameMat.uniforms.uFloorY!.value = crownY;
    }

    // ---- gas volume ----
    const heat = Math.min(1, Math.max(0, (T - 1000) / 1700));
    const burnt = a >= -5 && phi < 380; // from ignition until the exhaust is out
    const col = f.gasMat.uniforms.uColor!.value as Color;
    if (burnt) {
      const glow = heat * heat;
      col.setRGB(0.55 + 6.5 * glow, 0.38 + 2.4 * glow, 0.3 + 0.35 * glow);
    } else {
      col.setRGB(0.28, 0.5, 1.0);
    }
    const density = Math.min(1, Math.log10(Math.max(1, p)) / Math.log10(50));
    f.gasMat.uniforms.uAlpha!.value = 0.05 + 0.2 * density + (burnt ? 0.3 * heat : 0);
    f.gasMat.uniforms.uFloorY!.value = crownY;
    const bowlFloorY = crownY - 5.5;
    f.gas.position.set(CYLINDER_X[f.index]!, bowlFloorY, 0);
    f.gas.scale.set(SPECS.bore / 2 - 0.3, Math.max(0.5, RIDGE_Y + 0.5 - bowlFloorY), SPECS.bore / 2 - 0.3);

    // the hot gas is a bloom source only while it glows; fresh charge is not
    f.gas.layers.set(burnt && heat > 0.15 ? GLOW_LAYER : OVERLAY_LAYER);

    f.glow = (sparkOn ? 0.35 : 0) + (burning ? 0.6 * (1 - xb * xb * xb) : 0) + (burnt ? 0.9 * heat * heat : 0);
  }

  private zigzag(f: CylFx, sp: Vector3, t: number, reachFrac = 1): void {
    const pos = f.arcGeo.getAttribute('position') as Float32BufferAttribute;
    const jets = 7;
    const len = 15.5 * Math.min(1, reachFrac * 2.5);
    for (let j = 0; j < jets; j++) {
      const a = (j / jets) * Math.PI * 2 + 0.15;
      const flutter = (hash(Math.floor(t * 60) + j * 17 + f.index * 7) - 0.5) * 0.9;
      const dx = Math.cos(a) * len * 0.92;
      const dz = Math.sin(a) * len * 0.92;
      const dy = -len * 0.39 + flutter * 0.4;
      // Ana sprey ekseni + hafif açılan yan tüy çizgisi
      pos.setXYZ(j * 4, sp.x, sp.y, sp.z);
      pos.setXYZ(j * 4 + 1, sp.x + dx, sp.y + dy, sp.z + dz);
      pos.setXYZ(j * 4 + 2, sp.x + dx * 0.35, sp.y + dy * 0.35, sp.z + dz * 0.35);
      pos.setXYZ(j * 4 + 3, sp.x + dx * 0.95 - dz * 0.08, sp.y + dy - 0.8, sp.z + dz * 0.95 + dx * 0.08);
    }
    pos.needsUpdate = true;
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
