import {
  AlwaysStencilFunc,
  BackSide,
  Color,
  DecrementWrapStencilOp,
  FrontSide,
  IncrementWrapStencilOp,
  type InstancedMesh,
  KeepStencilOp,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  type Object3D,
  Plane,
  PlaneGeometry,
  Quaternion,
  type Scene,
  ShaderMaterial,
  Sphere,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { OVERLAY_LAYER } from './stage';

/** How a cut face of one material family is drawn: base tone, hatch lines, hatch angle and pitch (mm). */
export interface CapStyle {
  color: string;
  line: string;
  angleDeg: number;
  spacing: number;
}

interface Tracked {
  mesh: Mesh;
  group: string | null;
  helpers: Mesh[];
  sphere: Sphere;
}

const CAP_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const CAP_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLine;
  uniform vec3 uU;
  uniform vec3 uV;
  uniform float uSpacing;
  varying vec3 vWorld;
  void main() {
    // 45° (or styled) hatch in the plane's own coordinates, anti-aliased with fwidth
    float s = dot(vWorld, uU) / uSpacing;
    float f = abs(fract(s) - 0.5);
    float w = fwidth(s);
    float line = 1.0 - smoothstep(0.09, 0.09 + w * 1.5, f);
    // a faint second, finer tone so large cut faces do not look flat
    float grain = 0.03 * sin(dot(vWorld, uV) * 0.9);
    vec3 col = mix(uColor * (1.0 + grain), uLine, line * 0.85);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Cutaway view with a single clipping plane.
 *
 * Every tracked mesh that is not exempt is clipped by `plane` (via a cached
 * clipped clone of its material). Cut solids are closed with stencil capping
 * (as in three.js' webgl_clipping_stencil example): per cap style, the clipped
 * back faces increment and the front faces decrement the stencil, then one
 * large quad on the plane draws wherever the stencil is non-zero — exactly the
 * inside of the cut solids — with a technical-drawing hatch. Requires closed
 * meshes and a stencil buffer.
 *
 * Machine independent: the caller decides which meshes are exempt (shown
 * whole) and which cap style a mesh uses.
 */
export class SectionView {
  readonly plane = new Plane(new Vector3(0, 0, -1), 0);
  /** Same plane object for every clipped material, so moving it needs no material updates. */
  readonly planes = [this.plane];
  private enabled = false;
  private tracked: Tracked[] = [];
  private clipped = new Map<Material, Material>();
  private baseOfClipped = new Map<Material, Material>();
  private caps = new Map<string, Mesh>();
  private helperMats = new Map<string, { back: Material; front: Material }>();
  private exempt: (partId: string | undefined) => boolean = () => false;
  private listeners: ((on: boolean) => void)[] = [];

  constructor(
    private scene: Scene,
    styles: Record<string, CapStyle>,
    private styleOf: (mesh: Mesh) => string | null,
    size = 2400,
  ) {
    let order = 100;
    for (const [key, st] of Object.entries(styles)) {
      const mk = (side: typeof BackSide | typeof FrontSide, op: typeof IncrementWrapStencilOp | typeof DecrementWrapStencilOp) => {
        const m = new MeshBasicMaterial();
        m.side = side;
        m.colorWrite = false;
        m.depthWrite = false;
        m.depthTest = false;
        m.stencilWrite = true;
        m.stencilFunc = AlwaysStencilFunc;
        m.stencilFail = op;
        m.stencilZFail = op;
        m.stencilZPass = op;
        m.clippingPlanes = this.planes;
        return m;
      };
      this.helperMats.set(key, { back: mk(BackSide, IncrementWrapStencilOp), front: mk(FrontSide, DecrementWrapStencilOp) });

      const a = (st.angleDeg * Math.PI) / 180;
      const capMat = new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(st.color) },
          uLine: { value: new Color(st.line) },
          uU: { value: new Vector3() },
          uV: { value: new Vector3() },
          uSpacing: { value: st.spacing },
        },
        vertexShader: CAP_VERT,
        fragmentShader: CAP_FRAG,
      });
      capMat.userData.angle = a;
      capMat.stencilWrite = true;
      capMat.stencilRef = 0;
      capMat.stencilFunc = NotEqualStencilFunc;
      capMat.stencilFail = KeepStencilOp;
      capMat.stencilZFail = KeepStencilOp;
      capMat.stencilZPass = KeepStencilOp;
      const cap = new Mesh(new PlaneGeometry(size, size), capMat);
      cap.name = `section-cap:${key}`;
      cap.renderOrder = order + 1;
      cap.frustumCulled = false;
      cap.visible = false;
      cap.raycast = () => {};
      cap.layers.set(OVERLAY_LAYER); // not a glow occluder
      // reset the stencil for the next style
      cap.onAfterRender = (r: WebGLRenderer) => r.clearStencil();
      scene.add(cap);
      this.caps.set(key, cap);
      cap.userData.order = order;
      order += 2;
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  onChange(l: (on: boolean) => void): void {
    this.listeners.push(l);
  }

  /** Collect the meshes under `root` (call after the scene is built). */
  track(root: Object3D): void {
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || m.userData.sectionHelper) return;
      const group = (m as InstancedMesh).isInstancedMesh ? null : this.styleOf(m);
      const helpers: Mesh[] = [];
      if (group) {
        const mats = this.helperMats.get(group)!;
        const order = this.caps.get(group)!.userData.order as number;
        for (const mat of [mats.back, mats.front]) {
          const h = new Mesh(m.geometry, mat);
          h.userData.sectionHelper = true;
          h.renderOrder = order;
          h.visible = false;
          h.raycast = () => {};
          h.layers.set(OVERLAY_LAYER);
          m.add(h);
          helpers.push(h);
        }
      }
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      this.tracked.push({ mesh: m, group, helpers, sphere: new Sphere() });
    });
  }

  /** Parts (by part id) that are drawn whole even while the cut is on. */
  setExempt(fn: (partId: string | undefined) => boolean): void {
    this.exempt = fn;
    this.apply();
  }

  /** Turn the cut on/off; always re-applies the materials (callers may have swapped them). */
  setEnabled(on: boolean): void {
    const changed = on !== this.enabled;
    this.enabled = on;
    this.apply();
    if (changed) for (const l of this.listeners) l(on);
  }

  /** Keep the half-space on the side opposite to `normal`: points p with n·(p − point) ≤ 0 survive. */
  setPlane(normal: Vector3, point: Vector3): void {
    const n = normal.clone().normalize();
    this.plane.setFromNormalAndCoplanarPoint(n.clone().negate(), point);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n);
    // a stable in-plane basis for the hatch
    const ref = Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const u0 = new Vector3().crossVectors(ref, n).normalize();
    const v0 = new Vector3().crossVectors(n, u0).normalize();
    for (const cap of this.caps.values()) {
      cap.position.copy(point);
      cap.quaternion.copy(q);
      const mat = cap.material as ShaderMaterial;
      const a = mat.userData.angle as number;
      mat.uniforms.uU!.value.copy(u0).multiplyScalar(Math.cos(a)).addScaledVector(v0, Math.sin(a));
      mat.uniforms.uV!.value.copy(v0).multiplyScalar(Math.cos(a)).addScaledVector(u0, -Math.sin(a));
    }
  }

  /** Material to use on a mesh for the current state (clipped clone or the base). */
  private apply(): void {
    for (const t of this.tracked) {
      const cur = t.mesh.material as Material;
      const base = this.baseOfClipped.get(cur) ?? cur;
      const clip = this.enabled && !this.exempt(t.mesh.userData.partId as string | undefined);
      t.mesh.material = clip ? this.clippedOf(base) : base;
      t.mesh.userData.sectionClipped = clip;
      if (!clip) for (const h of t.helpers) h.visible = false;
    }
    for (const cap of this.caps.values()) cap.visible = this.enabled;
  }

  /** Clipped variant of a material (shared, cached). */
  clippedOf(m: Material): Material {
    if (this.baseOfClipped.has(m)) return m;
    let c = this.clipped.get(m);
    if (!c) {
      c = m.clone();
      c.clippingPlanes = this.planes;
      c.clipShadows = true;
      this.clipped.set(m, c);
      this.baseOfClipped.set(c, m);
    }
    return c;
  }

  /** Is a world point removed by the cut? */
  isCut(p: Vector3): boolean {
    return this.enabled && this.plane.distanceToPoint(p) < 0;
  }

  private m4 = new Matrix4();

  /** Per frame: show stencil helpers only for clipped meshes that actually straddle the plane. */
  update(): void {
    if (!this.enabled) return;
    for (const t of this.tracked) {
      if (!t.helpers.length) continue;
      const on = t.mesh.userData.sectionClipped === true && this.straddles(t);
      for (const h of t.helpers) h.visible = on;
    }
  }

  private straddles(t: Tracked): boolean {
    const bs = t.mesh.geometry.boundingSphere!;
    this.m4.copy(t.mesh.matrixWorld);
    t.sphere.copy(bs).applyMatrix4(this.m4);
    return Math.abs(this.plane.distanceToPoint(t.sphere.center)) < t.sphere.radius;
  }

  dispose(): void {
    for (const cap of this.caps.values()) this.scene.remove(cap);
  }
}
