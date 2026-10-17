import { type BufferGeometry, type Material, Mesh } from 'three';
import type { PartNode, PartRegistry } from '../core/registry';
import { BODY_PART, LAYERS, PARTS } from './catalog';
import { beatPhase, FULL_AMPLITUDE } from './escapement';
import type { WatchMaterialKey, WatchMaterials } from './materials';
import { buildDial, buildHourHand, buildMinuteHand, buildSecondHand } from './parts/dial';
import { buildBalance, buildEscapeWheel, buildLever, Hairspring } from './parts/escapement';
import { BRIDGES, buildBridge, buildCock, buildPlate, buildScrews, type FrameGeometry } from './parts/frame';
import {
  type BodyGeometry,
  buildBarrel,
  buildCannon,
  buildCentre,
  buildDateDriver,
  buildEscapeArbor,
  buildFourth,
  buildHourWheel,
  buildMinuteWheel,
  buildThird,
} from './parts/wheels';
import { AXES, type AxisName, type Body, GEARS, SCENE_PER_MM } from './specs';
import { trainAngles, type TrainOptions } from './train';

const DEG = Math.PI / 180;

/** Axis each body turns on. */
const BODY_AXIS = Object.fromEntries(GEARS.map((g) => [g.body, g.axis])) as Record<Body, AxisName>;

/**
 * Assembles the movement and drives it from the watch clock.
 * Every rotating body (barrel, train wheels, motion works), the hands, the
 * lever and the balance are registered parts whose motion node sits on their
 * arbor and turns about +Y; the balance spring is rewritten in place every
 * frame. Static parts (plate, bridges, dial) are drawn in the movement frame.
 */
export class Watch {
  private bodies: { body: Body; node: PartNode }[] = [];
  private hands: { body: Body; node: PartNode }[] = [];
  private balance?: PartNode;
  private lever?: PartNode;
  private spring?: Hairspring;

  constructor(
    private registry: PartRegistry,
    private materials: WatchMaterials,
  ) {
    registry.defineLayers(LAYERS);
  }

  build(): void {
    const M = (k: WatchMaterialKey) => this.materials.get(k);
    const R = this.registry;

    // ---- plate and bridges (static, movement frame) ----
    R.add(PARTS.plate, ...frameMeshes(buildPlate(), M, 'plate'));
    R.add(PARTS.barrelBridge, ...frameMeshes(buildBridge(BRIDGES.barrel), M));
    R.add(PARTS.trainBridge, ...frameMeshes(buildBridge(BRIDGES.train), M));
    R.add(PARTS.palletBridge, ...frameMeshes(buildBridge(BRIDGES.pallet), M));
    R.add(PARTS.balanceCock, ...frameMeshes(buildCock(), M));
    const screws = buildScrews();
    R.add(PARTS.bridgeScrews, mesh(screws.heads, M('blueSteel')), mesh(screws.slots, M('darkSteel')));

    // ---- going train and motion works: one rotating part per body ----
    const wheel = (g: BodyGeometry) => [
      ...g.brass.map((b) => mesh(b, M('brass'))),
      ...g.steel.map((s) => mesh(s, M('polishedSteel'))),
    ];
    this.addBody('barrel', PARTS.barrel, wheel(buildBarrel()));
    this.addBody('centre', PARTS.centreWheel, wheel(buildCentre()));
    this.addBody('third', PARTS.thirdWheel, wheel(buildThird()));
    this.addBody('fourth', PARTS.fourthWheel, wheel(buildFourth()));
    this.addBody('escape', PARTS.escapeWheel, [
      mesh(buildEscapeWheel(), M('polishedSteel')),
      ...buildEscapeArbor().map((g) => mesh(g, M('polishedSteel'))),
    ]);
    this.addBody('cannon', PARTS.cannonPinion, wheel(buildCannon()));
    this.addBody('minuteWheel', PARTS.minuteWheel, wheel(buildMinuteWheel()));
    this.addBody('hourWheel', PARTS.hourWheel, wheel(buildHourWheel()));
    this.addBody('dateDriver', PARTS.dateDriver, wheel(buildDateDriver()));

    // ---- escapement ----
    const lever = buildLever();
    this.lever = R.add(
      PARTS.lever,
      mesh(lever.body, M('polishedSteel')),
      mesh(lever.stones, M('ruby')),
      mesh(lever.arbor, M('polishedSteel')),
    );
    place(this.lever, AXES.pallet);
    const balance = buildBalance();
    this.balance = R.add(
      PARTS.balance,
      mesh(balance.wheel, M('balance')),
      mesh(balance.staff, M('polishedSteel')),
      mesh(balance.pin, M('ruby')),
    );
    place(this.balance, AXES.balance);
    this.spring = new Hairspring();
    const spring = R.add(PARTS.hairspring, mesh(this.spring.geometry, M('hairspring')));
    place(spring, AXES.balance);

    // ---- dial side ----
    const dial = buildDial();
    R.add(PARTS.dial, mesh(dial.dial, M('dial')), mesh(dial.indices, M('hands')), mesh(dial.print, M('dialPrint')));
    this.addHand('hourWheel', PARTS.hourHand, mesh(buildHourHand(), M('hands')));
    this.addHand('cannon', PARTS.minuteHand, mesh(buildMinuteHand(), M('hands')));
    this.addHand('fourth', PARTS.secondHand, mesh(buildSecondHand(), M('blueSteel')));

    this.update(0);
  }

  private addBody(body: Body, def: (typeof PARTS)[keyof typeof PARTS], meshes: Mesh[]): void {
    const node = this.registry.add(def, ...meshes);
    place(node, AXES[BODY_AXIS[body]]);
    this.bodies.push({ body, node });
  }

  private addHand(body: Body, def: (typeof PARTS)[keyof typeof PARTS], m: Mesh): void {
    const node = this.registry.add(def, m);
    place(node, AXES[BODY_AXIS[body]]);
    this.hands.push({ body, node });
  }

  /** The registered part that turns with a body of the train. */
  bodyPart(body: Body): PartNode {
    return this.registry.get(BODY_PART[body]);
  }

  /**
   * Pose every moving part for clock time t (s since 12:00:00): wheels and hands
   * from the train, balance and lever from the beat phase, the spring's breath.
   */
  update(t: number, opts: TrainOptions = {}): void {
    const a = trainAngles(t, opts);
    for (const { body, node } of this.bodies) node.motion.rotation.y = a[body] * DEG;
    for (const { body, node } of this.hands) node.motion.rotation.y = a[body] * DEG;
    const p = beatPhase(t, opts.amplitude ?? FULL_AMPLITUDE);
    if (this.balance) this.balance.motion.rotation.y = p.balance * DEG;
    if (this.lever) this.lever.motion.rotation.y = p.lever * DEG;
    this.spring?.update(p.balance);
  }
}

/** Put a part's motion node on an arbor (plan position in mm). */
function place(node: PartNode, at: readonly [number, number]): void {
  node.motion.position.set(at[0] * SCENE_PER_MM, 0, at[1] * SCENE_PER_MM);
}

function frameMeshes(
  g: FrameGeometry,
  M: (k: WatchMaterialKey) => Material,
  body: WatchMaterialKey = 'rhodium',
): Mesh[] {
  const out = [mesh(g.rhodium, M(body))];
  if (g.ruby) out.push(mesh(g.ruby, M('ruby')));
  if (g.steel) out.push(mesh(g.steel, M('polishedSteel')));
  return out;
}

function mesh(g: BufferGeometry, m: Material): Mesh {
  const x = new Mesh(g, m);
  x.castShadow = true;
  x.receiveShadow = true;
  return x;
}
