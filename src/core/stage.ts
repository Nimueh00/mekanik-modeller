import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SpotLight,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three';
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

  constructor(private opts: StageOptions) {
    const { container, subjectRadius: R } = opts;

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('stage-canvas');

    this.camera = new PerspectiveCamera(32, 1, R * 0.02, R * 40);
    this.camera.position.copy(opts.cameraPosition);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(opts.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = R * 0.6;
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
      this.renderer.render(this.scene, this.camera);
    };
    this.renderer.setAnimationLoop(loop);
  }
}
