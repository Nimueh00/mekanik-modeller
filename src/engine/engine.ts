import { type BufferGeometry, type Material, Mesh, type MeshPhysicalMaterial } from 'three';
import type { MaterialKey, MaterialLibrary } from '../core/materials';
import type { PartNode, PartRegistry } from '../core/registry';
import { LAYERS, PARTS } from './catalog';
import { cylinderCrankAngle, sliderCrankPose } from './kinematics';
import { buildBlock, buildMainCap, buildOilPan, type Sectioned } from './parts/block';
import { buildConnectingRod } from './parts/connectingRod';
import { buildCrankshaft } from './parts/crankshaft';
import { buildFlywheel } from './parts/flywheel';
import { buildPiston } from './parts/piston';
import { CYLINDER_X, MAIN_X } from './specs';

export type BlockView = 'section' | 'ghost' | 'solid';

const DEG = Math.PI / 180;

interface SectionedMesh {
  mesh: Mesh;
  geo: Sectioned;
  solid: Material;
  ghost: Material;
}

interface CylinderNodes {
  piston: PartNode;
  pin: PartNode;
  rings: PartNode;
  rod: PartNode;
  cap: PartNode;
}

/**
 * Assembles the phase-1 bottom end and drives it from the crank angle.
 * Moving parts: crankshaft (+ sprocket, flywheel), rods, caps, pistons.
 * Static parts can be shown cut open, as a ghost, or solid.
 */
export class Engine {
  private cylinders: CylinderNodes[] = [];
  private rotating: PartNode[] = [];
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
    const sprocket = this.registry.add(PARTS.crankSprocket, mesh(crankG.sprocket, M('darkSteel')));
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

    this.setView(this.view);
    this.update(0);
  }

  /** Pose every moving part for an engine-clock angle (degrees, 0–720). */
  update(crankAngleDeg: number): void {
    const crankRad = (crankAngleDeg % 360) * DEG;
    for (const p of this.rotating) p.motion.rotation.x = crankRad;
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
