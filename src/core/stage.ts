import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  type Plane,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  ShadowMaterial,
  SpotLight,
  SRGBColorSpace,
  HalfFloatType,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface StageOptions {
  container: HTMLElement;
  /** Approximate size of the subject in scene units; drives camera/light/shadow extents. */
  subjectRadius: number;
  target: Vector3;
  cameraPosition: Vector3;
  floorY: number;
  /** Width/height of the default framing; narrower free areas zoom out to keep it in view. */
  framingAspect: number;
}

/** Layer of bloom sources (emissive effects). */
export const GLOW_LAYER = 1;
/** Layer of helper geometry that is drawn normally but never in the glow pass (stencil passes, section caps). */
export const OVERLAY_LAYER = 2;
/**
 * Objects that can hide a bloom source (drawn black in the glow pass). Only
 * meshes the app puts on this layer are re-rendered there, which keeps the
 * glow pass much cheaper than a second full scene render.
 */
export const OCCLUDER_LAYER = 3;

export type FrameCallback = (dt: number, elapsed: number) => void;

/**
 * Machine-independent "exhibition" stage: renderer, camera, orbit controls,
 * image-based lighting, a warm key light with soft shadows and a shadow-catcher
 * floor. The look is dark and warm, like a museum display case.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly keyLight: DirectionalLight;
  readonly floor: Mesh;
  /** Extra zoom-out factor (0..1] applied on top of the panel-aware fit; used while exploded. */
  private fit = 1;
  private callbacks: FrameCallback[] = [];
  private lateCallbacks: FrameCallback[] = [];
  private timer = new Timer();
  private rightInset = 0;
  private bottomInset = 0;
  private frameTimes: number[] = [];
  fps = 0;
  /** Adaptive resolution: drop the pixel ratio when frames are slow, raise it when there is headroom. */
  private maxPixelRatio = Math.min(window.devicePixelRatio, 2);
  private pixelRatio = this.maxPixelRatio;
  private slowFor = 0;
  private fastFor = 0;
  /** Bloom post-processing; created on first use and run only while `bloom` is on. */
  private composer?: EffectComposer;
  private glowComposer?: EffectComposer;
  private bloomPass?: UnrealBloomPass;
  private bloom = false;
  private shadowsDirty = true;

  constructor(private opts: StageOptions) {
    const { container, subjectRadius: R } = opts;

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    // Shadows are redrawn only when something moved (see invalidateShadows); a paused machine costs no shadow pass.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('stage-canvas');

    this.camera = new PerspectiveCamera(32, 1, R * 0.02, R * 40);
    this.camera.layers.enable(GLOW_LAYER);
    this.camera.layers.enable(OVERLAY_LAYER);
    this.camera.position.copy(opts.cameraPosition);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(opts.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = R * 0.3;
    this.controls.maxDistance = R * 8;
    this.controls.update();

    // Image-based lighting: a neutral studio room, dimmed for the dark look.
    const pmrem = new PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    envScene.dispose();
    pmrem.dispose();

    // Warm key light from upper front-left; casts the soft shadows.
    this.keyLight = new DirectionalLight(new Color('#ffe2b8'), 2.6);
    this.keyLight.position.set(-R * 1.2, R * 2.2, R * 1.6).add(opts.target);
    this.keyLight.target.position.copy(opts.target);
    this.keyLight.castShadow = true;
    const sc = this.keyLight.shadow.camera;
    sc.left = -R * 1.3;
    sc.right = R * 1.3;
    sc.top = R * 1.3;
    sc.bottom = -R * 1.3;
    sc.near = R * 0.5;
    sc.far = R * 6;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.6;
    this.keyLight.shadow.radius = 4;
    this.scene.add(this.keyLight, this.keyLight.target);

    // Cool rim light from behind to separate silhouettes from the dark backdrop.
    // decay = 0: no inverse-square falloff, so the intensity is independent of the mm scale.
    const rim = new SpotLight(new Color('#a9c4ff'), 2.2, R * 8, Math.PI / 5, 0.6, 0);
    rim.position.set(R * 1.5, R * 1.2, -R * 2.2).add(opts.target);
    rim.target.position.copy(opts.target);
    this.scene.add(rim, rim.target);

    this.scene.add(new HemisphereLight(new Color('#fff0dc'), new Color('#20180f'), 0.35));

    // Shadow catcher floor.
    const floor = new Mesh(new PlaneGeometry(R * 20, R * 20), new ShadowMaterial({ opacity: 0.38 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = opts.floorY;
    floor.receiveShadow = true;
    floor.name = 'floor';
    this.scene.add(floor);
    this.floor = floor;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /**
   * Reserve space on the right edge (side panel) or the bottom edge (bottom
   * sheet on phones) and keep the subject centred and fitted in the rest.
   */
  setInsets(right: number, bottom = 0): void {
    this.rightInset = right;
    this.bottomInset = bottom;
    this.resize();
  }

  resize(): void {
    const w = this.opts.container.clientWidth || window.innerWidth;
    const h = this.opts.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Shift the projection so the orbit target sits in the middle of the free area.
    const right = Math.min(this.rightInset, w * 0.45);
    const bottom = Math.min(this.bottomInset, h * 0.6);
    if (right > 0 || bottom > 0) this.camera.setViewOffset(w, h, right / 2, bottom / 2, w, h);
    else this.camera.clearViewOffset();
    // Fit: shrink with the free height, and further when the free area is
    // narrower than the subject's framing aspect (portrait phones).
    const freeH = Math.max(1, h - bottom);
    const freeAspect = (w - right) / freeH;
    this.camera.zoom = (freeH / h) * Math.min(1, freeAspect / this.opts.framingAspect) * this.fit;
    this.camera.updateProjectionMatrix();
    for (const c of [this.composer, this.glowComposer]) {
      if (!c) continue;
      c.setPixelRatio(this.renderer.getPixelRatio());
      c.setSize(w, h);
    }
  }

  /**
   * Selective bloom (VISION §2: only for combustion and the spark).
   *
   * Objects on GLOW_LAYER are the only bloom sources: a glow pass renders the
   * OCCLUDER_LAYER objects in plain black (so a flame hidden behind metal does
   * not glow through it) and then the glow objects in
   * colour; the blurred result is added onto the normal render. The two
   * composers only run while `setBloom(true)`; otherwise the scene is
   * rendered directly at no extra cost.
   */
  setBloom(on: boolean, strength = 1): void {
    this.bloom = on;
    if (!on) return;
    if (!this.composer) this.createBloom();
    this.bloomPass!.strength = strength;
  }

  /** Clipping planes applied to the black occluders of the glow pass (e.g. a section plane). */
  setGlowOccluderClipping(planes: Plane[] | null): void {
    this.occluder.clippingPlanes = planes;
    this.occluder.needsUpdate = true;
  }

  private occluder = new MeshBasicMaterial({ color: 0x000000, side: DoubleSide });

  private createBloom(): void {
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const glow = new EffectComposer(this.renderer, new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType }));
    glow.renderToScreen = false;
    glow.addPass(new GlowPass(this.scene, this.camera, this.occluder));
    this.bloomPass = new UnrealBloomPass(new Vector2(size.x, size.y), 1, 0.5, 0);
    glow.addPass(this.bloomPass);
    this.glowComposer = glow;

    const rt = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4, stencilBuffer: true });
    const final = new EffectComposer(this.renderer, rt);
    final.addPass(new RenderPass(this.scene, this.camera));
    const mix = new ShaderPass(
      new ShaderMaterial({
        uniforms: { baseTexture: { value: null }, bloomTexture: { value: glow.renderTarget2.texture } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform sampler2D baseTexture;
          uniform sampler2D bloomTexture;
          varying vec2 vUv;
          void main() {
            vec4 base = texture2D(baseTexture, vUv);
            vec3 b = texture2D(bloomTexture, vUv).rgb;
            gl_FragColor = vec4(base.rgb + b, clamp(base.a + max(b.r, max(b.g, b.b)), 0.0, 1.0));
          }`,
      }),
      'baseTexture',
    );
    final.addPass(mix);
    final.addPass(new OutputPass());
    this.composer = final;
    this.resize();
  }

  /** Request a shadow-map redraw on the next frame (call whenever a shadow caster moved or changed). */
  invalidateShadows(): void {
    this.shadowsDirty = true;
  }

  /** Zoom out to keep a spread-out subject in view (1 = default framing). */
  setFit(f: number): void {
    if (Math.abs(f - this.fit) < 1e-4) return;
    this.fit = f;
    this.resize();
  }

  private adaptResolution(dt: number): void {
    if (dt <= 0 || dt > 0.25) return; // tab switches etc.
    if (dt > 1 / 50) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (dt < 1 / 75) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = this.fastFor = 0;
    }
    let next = this.pixelRatio;
    if (this.slowFor > 1.5 && this.pixelRatio > 1) next = Math.max(1, this.pixelRatio - 0.25);
    else if (this.fastFor > 4 && this.pixelRatio < this.maxPixelRatio) next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.25);
    if (next !== this.pixelRatio) {
      this.pixelRatio = next;
      this.slowFor = this.fastFor = 0;
      this.renderer.setPixelRatio(next);
      this.resize();
    }
  }

  /** Runs after the controls were updated, right before rendering (for screen-space overlays). */
  onLateFrame(cb: FrameCallback): void {
    this.lateCallbacks.push(cb);
  }

  onFrame(cb: FrameCallback): void {
    this.callbacks.push(cb);
  }

  start(): void {
    this.timer.connect(document);
    const loop = (time: number) => {
      this.timer.update(time);
      const dt = this.timer.getDelta();
      const t = this.timer.getElapsed();
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 60) this.frameTimes.shift();
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.fps = avg > 0 ? 1 / avg : 0;
      this.adaptResolution(dt);
      for (const cb of this.callbacks) cb(dt, t);
      this.controls.update();
      this.camera.updateMatrixWorld();
      for (const cb of this.lateCallbacks) cb(dt, t);
      if (this.shadowsDirty) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowsDirty = false;
      }
      if (this.bloom && this.composer && this.glowComposer) {
        this.glowComposer.render(dt);
        this.composer.render(dt);
      }
      else this.renderer.render(this.scene, this.camera);
    };
    this.renderer.setAnimationLoop(loop);
  }
}

/**
 * Renders the bloom sources: OCCLUDER_LAYER objects as black occluders (no
 * shadow update), then the GLOW_LAYER objects in colour, into the read buffer.
 */
class GlowPass extends Pass {
  constructor(
    private scene: Scene,
    private camera: PerspectiveCamera,
    private occluder: MeshBasicMaterial,
  ) {
    super();
    this.needsSwap = false;
  }

  override render(renderer: WebGLRenderer, _write: WebGLRenderTarget, read: WebGLRenderTarget): void {
    const mask = this.camera.layers.mask;
    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.autoUpdate;
    // the glow pass draws with a reduced layer mask: it must never refresh the shadow map
    const needs = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    const clear = renderer.getClearColor(new Color());
    const alpha = renderer.getClearAlpha();
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(read);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.autoClear = false;
    this.camera.layers.set(OCCLUDER_LAYER);
    this.scene.overrideMaterial = this.occluder;
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.camera.layers.set(GLOW_LAYER);
    renderer.render(this.scene, this.camera);
    this.camera.layers.mask = mask;
    renderer.autoClear = autoClear;
    renderer.shadowMap.autoUpdate = shadows;
    renderer.shadowMap.needsUpdate = needs;
    renderer.setClearColor(clear, alpha);
  }
}
