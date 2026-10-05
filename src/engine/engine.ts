import {
  type BufferGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  type MeshPhysicalMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { merge } from '../core/geometry/profile';
import type { MaterialKey, MaterialLibrary } from '../core/materials';
import type { PartNode, PartRegistry } from '../core/registry';
import { LAYERS, PARTS } from './catalog';
import { cylinderCrankAngle, sliderCrankPose } from './kinematics';
import { buildBlock, buildMainCap, buildOilPan, type Sectioned } from './parts/block';
import { buildConnectingRod } from './parts/connectingRod';
import { buildCrankshaft } from './parts/crankshaft';
import { buildFlywheel } from './parts/flywheel';
import { buildPiston } from './parts/piston';
import { CAM_CENTRE, CAM_JOURNAL_X, VALVES, type ValveAxis } from './headLayout';
import { buildCamCap, buildCamshaft } from './parts/camshaft';
import { buildCylinderHead, onValveAxis, sectionCutX } from './parts/cylinderHead';
import { buildInjectors, buildPlugs } from './parts/plugsInjectors';
import { buildChainLink, buildGuides, buildSprockets, buildTimingCase, CHAIN_LINKS, CHAIN_X, chainPins } from './parts/timingChain';
import { buildValveCover } from './parts/valveCover';
import { buildValvePair, ValveSpringPair } from './parts/valvetrain';
import { CYLINDER_X, MAIN_X, SPECS } from './specs';
import { camRotationDeg, valveLift, type ValveKind } from './timing';

export type BlockView = 'section' | 'ghost' | 'solid';

const DEG = Math.PI / 180;

interface SectionedMesh {
  mesh: Mesh;
  geo: Sectioned;
  solid: Material;
  ghost: Material;
}

interface ValvePairNodes {
  kind: ValveKind;
  cylinder: number;
  axis: ValveAxis; // the front valve of the pair: the nodes' frame origin
  moving: PartNode[]; // valves, retainers + keepers, buckets
  spring: ValveSpringPair;
}

interface CylinderNodes {
  piston: PartNode;
  pin: PartNode;
  rings: PartNode;
  rod: PartNode;
  cap: PartNode;
}

/**
 * Assembles the engine and drives it from the crank angle.
 * Moving parts: crankshaft (+ sprocket, flywheel), rods, caps, pistons;
 * camshafts and cam sprockets (half speed), valves, retainers, buckets,
 * springs (compressed per frame) and the timing chain (instanced links).
 * Static parts can be shown cut open, as a ghost, or solid.
 */
export class Engine {
  private cylinders: CylinderNodes[] = [];
  private rotating: PartNode[] = [];
  private camNodes: PartNode[] = [];
  private valvePairs: ValvePairNodes[] = [];
  private chain?: { inner: InstancedMesh; outer: InstancedMesh; joints: InstancedMesh };
  private sectionedMeshes: SectionedMesh[] = [];
  private ghostCache = new Map<Material, Material>();
  view: BlockView = 'section';

  constructor(
    private registry: PartRegistry,
    private materials: MaterialLibrary,
  ) {
    registry.defineLayers(LAYERS);
  }

  build(): void {
    const M = (k: MaterialKey) => this.materials.get(k);

    // ---- static: block, liners, main caps, oil pan ----
    const blockG = buildBlock();
    this.registry.add(
      PARTS.block,
      this.sectioned(blockG.block, M('castAluminum')),
      this.sectioned(blockG.upperShells, M('bronze')),
    );
    CYLINDER_X.forEach((cx, i) => {
      const liner = this.registry.add(PARTS.liner(i + 1), this.sectioned(blockG.liner, M('forgedSteel')));
      liner.motion.position.x = cx;
    });

    const capG = buildMainCap();
    MAIN_X.forEach((mx, i) => {
      const cap = this.registry.add(
        PARTS.mainCap(i + 1),
        this.sectioned(capG.cap, M('forgedSteel')),
        this.sectioned(capG.hardware, M('darkSteel')),
      );
      cap.motion.position.x = mx;
    });

    this.registry.add(PARTS.oilPan, this.sectioned(buildOilPan(), M('stampedSteel')));

    // ---- crank train ----
    const crankG = buildCrankshaft();
    const crank = this.registry.add(
      PARTS.crankshaft,
      mesh(crankG.machined, M('machinedSteel')),
      mesh(crankG.forged, M('forgedSteel')),
      mesh(crankG.hardware, M('darkSteel')),
    );
    const sprocketG = buildSprockets();
    const sprocket = this.registry.add(PARTS.crankSprocket, mesh(sprocketG.crank, M('forgedSteel')));
    const fwG = buildFlywheel();
    const flywheel = this.registry.add(
      PARTS.flywheel,
      mesh(fwG.body, M('forgedSteel')),
      mesh(fwG.frictionFace, M('machinedSteel')),
      mesh(fwG.bolts, M('darkSteel')),
    );
    const ringGear = this.registry.add(PARTS.ringGear, mesh(fwG.ringGear, M('darkSteel')));
    this.rotating = [crank, sprocket, flywheel, ringGear];

    // ---- pistons and rods (one geometry each, shared by all four cylinders) ----
    const pistonG = buildPiston();
    const rodG = buildConnectingRod();
    CYLINDER_X.forEach((cx, i) => {
      const n = i + 1;
      const piston = this.registry.add(PARTS.piston(n), mesh(pistonG.body, M('pistonAluminum')));
      const pin = this.registry.add(PARTS.pistonPin(n), mesh(pistonG.pin, M('machinedSteel')));
      const rings = this.registry.add(
        PARTS.rings(n),
        mesh(pistonG.rings.compression, M('chrome')),
        mesh(pistonG.rings.oil, M('darkSteel')),
      );
      const rod = this.registry.add(
        PARTS.rod(n),
        mesh(rodG.rod, M('forgedSteel')),
        mesh(rodG.shells.upper, M('bronze')),
        mesh(rodG.bush, M('bronze')),
      );
      const cap = this.registry.add(
        PARTS.rodCap(n),
        mesh(rodG.cap, M('forgedSteel')),
        mesh(rodG.shells.lower, M('bronze')),
        mesh(rodG.bolts, M('darkSteel')),
      );
      for (const p of [piston, pin, rings, rod, cap]) p.motion.position.x = cx;
      this.cylinders.push({ piston, pin, rings, rod, cap });
    });

    this.buildTopEnd(sprocketG);
    this.setView(this.view);
    this.update(0);
  }

  /** Phase 2: cylinder head, valve train, camshafts, timing drive, plugs, injectors, cam cover. */
  private buildTopEnd(sprocketG: ReturnType<typeof buildSprockets>): void {
    const M = (k: MaterialKey) => this.materials.get(k);

    const headG = buildCylinderHead();
    const caseG = buildTimingCase(SPECS.block.deckHeight);
    this.registry.add(PARTS.cylinderHead, this.sectioned(headG.head, M('castAluminum')), mesh(caseG.upper, M('castAluminum')));
    this.attach('block', mesh(caseG.lower, M('castAluminum')));
    this.registry.add(PARTS.headGasket, this.sectioned(headG.gasket, M('gasket')));
    this.registry.add(PARTS.headBolts, this.sectioned(headG.bolts, M('darkSteel')));

    // ---- valve train: one node set per cylinder and side (both valves of a pair move together) ----
    const pairG: Partial<Record<ValveKind, ReturnType<typeof buildValvePair>>> = {};
    const seals: BufferGeometry[] = [];
    CYLINDER_X.forEach((_, i) => {
      for (const kind of ['intake', 'exhaust'] as const) {
        const [a, b] = VALVES.filter((v) => v.cylinder === i && v.kind === kind);
        const dx = b!.face.x - a!.face.x;
        const g = (pairG[kind] ??= buildValvePair(kind, dx));
        seals.push(onValveAxis(g.seals.clone(), a!));
        const n = i + 1;
        const valves = this.registry.add(PARTS.valves(n, kind), mesh(g.valves, M('chrome')));
        const retainers = this.registry.add(PARTS.retainers(n, kind), mesh(g.retainers, M('machinedSteel')));
        const buckets = this.registry.add(PARTS.buckets(n, kind), mesh(g.buckets, M('machinedSteel')));
        const spring = new ValveSpringPair(dx);
        const springs = this.registry.add(PARTS.springs(n, kind), mesh(spring.geometry, M('darkSteel')));
        for (const node of [valves, retainers, buckets, springs]) {
          node.motion.position.copy(a!.face);
          node.motion.rotation.x = a!.tiltRad;
        }
        this.valvePairs.push({ kind, cylinder: i, axis: a!, moving: [valves, retainers, buckets], spring });
      }
    });
    this.registry.add(PARTS.valveGuides, this.sectioned(headG.guides, M('bronze')), mesh(merge(seals), M('rubber')));

    // ---- camshafts, caps, cam sprockets ----
    const capG = buildCamCap();
    for (const kind of ['intake', 'exhaust'] as const) {
      const c = CAM_CENTRE[kind];
      const camG = buildCamshaft(kind);
      const cam = this.registry.add(PARTS.camshaft(kind), mesh(camG.machined, M('machinedSteel')), mesh(camG.cast, M('forgedSteel')));
      cam.motion.position.set(0, c.y, c.z);
      const sp = this.registry.add(PARTS.camSprocket(kind), mesh(sprocketG[kind], M('forgedSteel')));
      sp.motion.position.set(0, c.y, c.z);
      this.camNodes.push(cam, sp);

      const caps: BufferGeometry[] = [];
      const bolts: BufferGeometry[] = [];
      for (const jx of CAM_JOURNAL_X) {
        const cg = capG.cap.clone();
        cg.translate(jx, c.y, c.z);
        caps.push(cg);
        const bg = capG.bolts.clone();
        bg.translate(jx, c.y, c.z);
        bolts.push(bg);
      }
      const capsAll = merge(caps);
      this.registry.add(
        PARTS.camCaps(kind),
        this.sectioned({ full: capsAll, cut: sectionCutX(capsAll) }, M('castAluminum')),
        mesh(merge(bolts), M('darkSteel')),
      );
    }

    // ---- timing chain (instanced links) and guides ----
    const link = buildChainLink();
    const half = CHAIN_LINKS / 2;
    const inner = new InstancedMesh(link.innerPlates, M('chainSteel'), half);
    const outer = new InstancedMesh(link.outerPlates, M('chainSteel'), half);
    const joints = new InstancedMesh(link.joint, M('machinedSteel'), CHAIN_LINKS);
    for (const im of [inner, outer, joints]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
    }
    this.chain = { inner, outer, joints };
    this.registry.add(PARTS.timingChain, inner, outer, joints);
    const guides = buildGuides();
    this.registry.add(
      PARTS.chainGuides,
      mesh(guides.facings, M('guidePolymer')),
      mesh(guides.backing, M('forgedSteel')),
      mesh(guides.tensioner, M('castAluminum')),
    );

    // ---- spark plugs + coils, injectors + rail ----
    const plugG = buildPlugs();
    this.registry.add(
      PARTS.plugs,
      mesh(plugG.shell, M('machinedSteel')),
      mesh(plugG.insulator, M('ceramic')),
      mesh(plugG.metal, M('darkSteel')),
      mesh(plugG.coils, M('blackPlastic')),
    );
    const injG = buildInjectors();
    this.registry.add(
      PARTS.injectors,
      mesh(injG.nozzles, M('machinedSteel')),
      mesh(injG.bodies, M('blackPlastic')),
      mesh(injG.rail, M('machinedSteel')),
    );

    // ---- cam cover ----
    const coverG = buildValveCover();
    this.registry.add(
      PARTS.valveCover,
      this.sectioned(coverG.cover, M('crinkleBlack')),
      mesh(coverG.hardware, M('darkSteel')),
      mesh(coverG.filler, M('blackPlastic')),
    );
  }

  /** Pose every moving part for an engine-clock angle (degrees, 0–720). */
  update(crankAngleDeg: number): void {
    const crankRad = (crankAngleDeg % 360) * DEG;
    for (const p of this.rotating) p.motion.rotation.x = crankRad;
    const camRad = camRotationDeg(crankAngleDeg) * DEG;
    for (const p of this.camNodes) p.motion.rotation.x = camRad;
    for (const vp of this.valvePairs) {
      const lift = valveLift(vp.kind, vp.cylinder, crankAngleDeg);
      for (const n of vp.moving) n.motion.position.copy(vp.axis.face).addScaledVector(vp.axis.dir, -lift);
      vp.spring.compress(lift);
    }
    this.updateChain(crankAngleDeg);
    this.cylinders.forEach((c, i) => {
      const pose = sliderCrankPose(cylinderCrankAngle(i, crankAngleDeg));
      c.piston.motion.position.y = pose.pistonY;
      c.pin.motion.position.y = pose.pistonY;
      c.rings.motion.position.y = pose.pistonY;
      for (const n of [c.rod, c.cap]) {
        n.motion.position.y = pose.pinY;
        n.motion.position.z = pose.pinZ;
        n.motion.rotation.x = pose.rodAngle;
      }
    });
  }

  /** Add extra content to an already registered part. */
  private attach(partId: string, obj: Mesh): void {
    obj.traverse((o) => {
      o.userData.partId = partId;
    });
    this.registry.get(partId).motion.add(obj);
  }

  private m4 = new Matrix4();
  private q = new Quaternion();
  private v3 = new Vector3();
  private one = new Vector3(1, 1, 1);
  private axisX = new Vector3(1, 0, 0);

  private updateChain(crankAngleDeg: number): void {
    if (!this.chain) return;
    const pins = chainPins(crankAngleDeg);
    const { inner, outer, joints } = this.chain;
    for (let k = 0; k < pins.length; k++) {
      const a = pins[k]!.p;
      const b = pins[(k + 1) % pins.length]!.p;
      // R_x(φ)·(0,1,0) = (0, cos φ, sin φ) must point from pin k to pin k+1
      const phi = Math.atan2(b[0] - a[0], b[1] - a[1]);
      this.q.setFromAxisAngle(this.axisX, phi);
      this.v3.set(CHAIN_X, a[1], a[0]);
      this.m4.compose(this.v3, this.q, this.one);
      (k % 2 === 0 ? inner : outer).setMatrixAt(k >> 1, this.m4);
      this.m4.makeTranslation(CHAIN_X, a[1], a[0]);
      joints.setMatrixAt(k, this.m4);
    }
    inner.instanceMatrix.needsUpdate = true;
    outer.instanceMatrix.needsUpdate = true;
    joints.instanceMatrix.needsUpdate = true;
  }

  setView(view: BlockView): void {
    this.view = view;
    for (const s of this.sectionedMeshes) {
      s.mesh.geometry = view === 'section' ? s.geo.cut : s.geo.full;
      s.mesh.material = view === 'ghost' ? s.ghost : s.solid;
      s.mesh.castShadow = view !== 'ghost';
      s.mesh.receiveShadow = view !== 'ghost';
      s.mesh.renderOrder = view === 'ghost' ? 10 : 0;
    }
  }

  private sectioned(geo: Sectioned, solid: MeshPhysicalMaterial): Mesh {
    const m = mesh(geo.cut, solid);
    this.sectionedMeshes.push({ mesh: m, geo, solid, ghost: this.ghostOf(solid) });
    return m;
  }

  private ghostOf(m: MeshPhysicalMaterial): Material {
    let g = this.ghostCache.get(m);
    if (!g) {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0.16;
      c.depthWrite = false;
      c.roughness = 0.35;
      g = c;
      this.ghostCache.set(m, g);
    }
    return g;
  }
}

function mesh(g: BufferGeometry, m: Material): Mesh {
  const x = new Mesh(g, m);
  x.castShadow = true;
  x.receiveShadow = true;
  return x;
}
