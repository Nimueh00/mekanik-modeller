import { type BufferGeometry, Group, type Material, Mesh, MeshPhysicalMaterial, type Object3D } from 'three';
import type { PartNode, PartRegistry } from '../core/registry';
import { CAGE_RATIO, reductionAngle, reverser1Angle, reverser2Angle, reverserPinionAngle } from './automatic';
import { BODY_PART, LAYERS, PARTS } from './catalog';
import { jumperAngle, JUMPER_PIVOT, ringAngle, ringFloatAt } from './dateWork';
import { FULL_AMPLITUDE, windTurnsForAmplitude } from './escapement';
import {
  correctorAngle,
  crownWheelAngle,
  intermediateAngle,
  rockerAngle,
  settingLeverAngle,
  settingWheelSpin,
  stemAngle,
  windingPinionAngle,
  yokeAngle,
} from './keyless';
import { arborUnwrappedDeg } from './mainspring';
import type { WatchMaterialKey, WatchMaterials } from './materials';
import { buildBearing, buildRotor } from './parts/automatic';
import { buildBarrelParts, MainspringMesh } from './parts/barrel';
import { buildDateRing, buildJumper, createDateTexture } from './parts/date';
import { buildDial, buildHourHand, buildMinuteHand, buildSecondHand } from './parts/dial';
import { buildBalance, buildEscapeWheel, buildLever, Hairspring } from './parts/escapement';
import { BRIDGES, buildBridge, buildCock, buildPlate, buildScrews, type FrameGeometry } from './parts/frame';
import {
  buildCorrector,
  buildIntermediate,
  buildSettingLever,
  buildSettingWheel,
  buildSlidingPinion,
  buildStem,
  buildWindingPinion,
  buildYoke,
} from './parts/keyless';
import {
  type BodyGeometry,
  buildCannon,
  buildCentre,
  buildDateDriver,
  buildEscapeArbor,
  buildFourth,
  buildHourWheel,
  buildMinuteWheel,
  buildThird,
} from './parts/wheels';
import { buildClick, buildClickSpring, buildCrownWheel, buildRatchet, buildReduction, buildReverser } from './parts/winding';
import type { UpdateOptions } from './pose';
import { CLICK_PIVOT, clickAngle } from './ratchet';
import { balancePose } from './runDown';
import { AXES, type AxisName, type Body, CENTRE, GEARS, KEYLESS, MAINSPRING, SCENE_PER_MM, WIND_AXES } from './specs';
import { trainAngles } from './train';

const DEG = Math.PI / 180;

/** Axis each body turns on. */
const BODY_AXIS = Object.fromEntries(GEARS.map((g) => [g.body, g.axis])) as Record<Body, AxisName>;

/**
 * Assembles the movement and drives it from the watch clock.
 * Every rotating body (barrel, train wheels, motion works), the hands, the
 * lever and the balance are registered parts whose motion node sits on their
 * arbor and turns about +Y; the balance spring and the mainspring are
 * rewritten in place. Static parts (plate, bridges, dial) are drawn in the
 * movement frame.
 *
 * P3 adds the mainspring and ratchet, the keyless works, the rotor with its
 * reversers, and the date ring. Parts that carry more than one rotating body
 * (a reverser: wheel and pinion; the setting wheel on its rocker) hold inner
 * groups, which `spin` names so that the tests can read their angles.
 */
export class Watch {
  private bodies: { body: Body; node: PartNode }[] = [];
  private hands: { body: Body; node: PartNode }[] = [];
  private drumFollowers: PartNode[] = [];
  private balance?: PartNode;
  private lever?: PartNode;
  private spring?: Hairspring;
  private mainspring?: MainspringMesh;
  /** Named moving nodes (rotation in radians, about the axis the part turns on). */
  readonly spin = new Map<string, Object3D>();
  /** Registered part nodes by their short name, for the P3 parts. */
  readonly node = new Map<string, PartNode>();

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
    this.buildBarrel(M);
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

    // ---- winding wheels, keyless works, rotor, date ----
    this.buildWinding(M);
    this.buildKeyless(M);
    this.buildAutomatic(M);
    this.buildDate(M);

    // ---- dial side ----
    const dial = buildDial();
    R.add(PARTS.dial, mesh(dial.dial, M('dial')), mesh(dial.indices, M('hands')), mesh(dial.print, M('dialPrint')));
    this.addHand('hourWheel', PARTS.hourHand, mesh(buildHourHand(), M('hands')));
    this.addHand('cannon', PARTS.minuteHand, mesh(buildMinuteHand(), M('hands')));
    this.addHand('fourth', PARTS.secondHand, mesh(buildSecondHand(), M('blueSteel')));

    this.update(0);
  }

  // ---------------------------------------------------------------- P3 builders

  /** Barrel in parts: drum with teeth, cover (turn with the drum), mainspring, arbor. */
  private buildBarrel(M: (k: WatchMaterialKey) => Material): void {
    const b = buildBarrelParts();
    this.addBody('barrel', PARTS.barrel, [mesh(b.drum, M('brass')), mesh(b.teeth, M('brass'))]);
    this.follower('barrelCover', PARTS.barrelCover, AXES.barrel, [mesh(b.cover, M('brass'))]);
    this.mainspring = new MainspringMesh();
    this.follower('mainspring', PARTS.mainspring, AXES.barrel, [mesh(this.mainspring.geometry, M('blueSteel'))]);
    this.simple('arbor', PARTS.barrelArbor, AXES.barrel, [mesh(b.arbor, M('polishedSteel'))]);
  }

  /** Ratchet with its click, crown wheel, reduction wheel and the two reversers. */
  private buildWinding(M: (k: WatchMaterialKey) => Material): void {
    const r = buildRatchet();
    this.simple('ratchet', PARTS.ratchetWheel, AXES.barrel, [
      mesh(r.gear, M('polishedSteel')),
      mesh(r.saw, M('polishedSteel')),
      mesh(r.hub, M('polishedSteel')),
    ]);
    const c = buildClick();
    this.simple('click', PARTS.click, CLICK_PIVOT, [mesh(c.arm, M('polishedSteel')), mesh(c.post, M('polishedSteel'))]);
    this.simple('clickSpring', PARTS.clickSpring, [0, 0], [mesh(buildClickSpring(), M('blueSteel'))]);
    const cw = buildCrownWheel();
    this.simple('crownWheel', PARTS.crownWheel, WIND_AXES.crownWheel, [mesh(cw.spur, M('brass')), mesh(cw.steel, M('polishedSteel'))]);
    const red = buildReduction();
    this.simple('reduction', PARTS.reductionWheel, WIND_AXES.reduction, [
      mesh(red.wheel, M('brass')),
      mesh(red.pinion, M('polishedSteel')),
      mesh(red.hub, M('polishedSteel')),
    ]);
    for (const n of [1, 2] as const) {
      const rv = buildReverser(n);
      const wheel = new Group();
      wheel.add(mesh(rv.wheel, M('brass')));
      const pinion = new Group();
      pinion.add(mesh(rv.pinion, M('polishedSteel')), mesh(rv.hub, M('polishedSteel')));
      this.simple(`reverser${n}`, n === 1 ? PARTS.reverser1 : PARTS.reverser2, n === 1 ? WIND_AXES.reverser1 : WIND_AXES.reverser2, [wheel, pinion]);
      this.spin.set(`reverser${n}Wheel`, wheel);
      this.spin.set(`reverser${n}Pinion`, pinion);
    }
  }

  /** Stem, sliding and winding pinion, yoke, setting lever; the intermediate and the setting wheels on the dial side. */
  private buildKeyless(M: (k: WatchMaterialKey) => Material): void {
    const S = SCENE_PER_MM;
    const steel = M('polishedSteel');
    const stem = this.simple('stem', PARTS.windingStem, [0, KEYLESS.stemZ], [mesh(buildStem().stem, steel)]);
    stem.motion.position.y = KEYLESS.stemY * S;
    const sliding = this.simple('slidingPinion', PARTS.slidingPinion, [0, KEYLESS.stemZ], [mesh(buildSlidingPinion().body, steel)]);
    sliding.motion.position.y = KEYLESS.stemY * S;
    const winding = this.simple('windingPinion', PARTS.windingPinion, WIND_AXES.windingPinion, [mesh(buildWindingPinion(), steel)]);
    winding.motion.position.y = KEYLESS.stemY * S;
    this.simple('yoke', PARTS.yoke, KEYLESS.yokePivot, [mesh(buildYoke(), steel)]);
    this.simple('settingLever', PARTS.settingLever, KEYLESS.leverPivot, [mesh(buildSettingLever(), steel)]);

    const inter = buildIntermediate();
    // the contrate part carries the axle's lower end; the dial-side gear carries the axle through the plate
    this.simple('intermediateContrate', PARTS.intermediateContrate, WIND_AXES.intermediate, [mesh(inter.contrate, steel)]);
    this.simple('intermediateGear', PARTS.intermediateGear, WIND_AXES.intermediate, [mesh(inter.gear, M('brass')), mesh(inter.axle, steel)]);

    // setting wheel: the part's motion node is the rocker round the intermediate's axis; the wheel spins inside it
    const sw = buildSettingWheel();
    const spinner = new Group();
    spinner.add(mesh(sw.wheel, M('brass')), mesh(sw.axle, steel));
    spinner.position.set(
      (WIND_AXES.rockerTime[0] - WIND_AXES.intermediate[0]) * S,
      0,
      (WIND_AXES.rockerTime[1] - WIND_AXES.intermediate[1]) * S,
    );
    const rocker = this.simple('settingWheel', PARTS.settingWheel, WIND_AXES.intermediate, [mesh(sw.arm, steel), spinner]);
    this.spin.set('settingWheelSpin', spinner);
    this.spin.set('rocker', rocker.motion);

    const corr = buildCorrector();
    this.simple('corrector', PARTS.dateCorrector, WIND_AXES.corrector, [mesh(corr.gear, M('brass')), mesh(corr.star, steel)]);
  }

  /** Rotor with its bearing. */
  private buildAutomatic(M: (k: WatchMaterialKey) => Material): void {
    const rotor = buildRotor();
    this.simple('rotor', PARTS.rotor, CENTRE, [
      mesh(rotor.base, M('rhodium')),
      mesh(rotor.weight, M('brass')),
      mesh(rotor.pinion, M('polishedSteel')),
    ]);
    const bearing = buildBearing();
    const cage = new Group();
    cage.add(mesh(bearing.balls, M('polishedSteel')));
    this.simple('bearing', PARTS.rotorBearing, CENTRE, [mesh(bearing.stud, M('polishedSteel')), cage]);
    this.spin.set('cage', cage);
  }

  /** Date ring (numerals painted on a canvas where there is one) and its jumper. */
  private buildDate(M: (k: WatchMaterialKey) => Material): void {
    const ring = buildDateRing();
    const tex = createDateTexture();
    const material: Material = tex
      ? new MeshPhysicalMaterial({ map: tex, color: 0xffffff, roughness: 0.55, metalness: 0 })
      : M('dial');
    this.simple('dateRing', PARTS.dateRing, CENTRE, [mesh(ring.ring, material)]);
    this.simple('jumper', PARTS.dateJumper, JUMPER_PIVOT, [mesh(buildJumper(), M('blueSteel'))]);
  }

  /** A registered part whose node sits on an axis; remembered under `name`. */
  private simple(name: string, def: PartNodeDef, at: readonly [number, number], content: Object3D[]): PartNode {
    const node = this.registry.add(def, ...content);
    place(node, at);
    this.node.set(name, node);
    this.spin.set(name, node.motion);
    return node;
  }

  /** A part that turns with the drum (cover, mainspring). */
  private follower(name: string, def: PartNodeDef, at: readonly [number, number], content: Object3D[]): void {
    this.drumFollowers.push(this.simple(name, def, at, content));
  }

  private addBody(body: Body, def: PartNodeDef, meshes: Mesh[]): void {
    const node = this.registry.add(def, ...meshes);
    place(node, AXES[BODY_AXIS[body]]);
    this.bodies.push({ body, node });
  }

  private addHand(body: Body, def: PartNodeDef, m: Mesh): void {
    const node = this.registry.add(def, m);
    place(node, AXES[BODY_AXIS[body]]);
    this.hands.push({ body, node });
  }

  /** The registered part that turns with a body of the train. */
  bodyPart(body: Body): PartNode {
    return this.registry.get(BODY_PART[body]);
  }

  /**
   * Pose every moving part for clock time t (s since 00:00 of the first day of
   * the month): wheels and hands from the train, balance and lever from the
   * beat phase (or the run-down), the springs' breath, and the winding, keyless,
   * rotor and date parts from `opts` (see WatchClock.pose). Fields left out
   * default to a watch with nothing set: the wind is read back from the
   * amplitude, the date ring from t.
   */
  update(t: number, opts: UpdateOptions = {}): void {
    const handOffset = opts.handOffset ?? 0;
    const a = trainAngles(t, opts);
    for (const { body, node } of this.bodies) node.motion.rotation.y = a[body] * DEG;
    for (const { body, node } of this.hands) node.motion.rotation.y = a[body] * DEG;
    const train = opts.amplitude ?? FULL_AMPLITUDE;
    const p = balancePose(t, train, opts.drive);
    if (this.balance) this.balance.motion.rotation.y = p.balance * DEG;
    if (this.lever) this.lever.motion.rotation.y = p.lever * DEG;
    this.spring?.update(p.balance);

    const wind = opts.windTurns ?? (opts.amplitude === undefined ? MAINSPRING.effectiveTurns : windTurnsForAmplitude(opts.amplitude));
    const arbor = arborUnwrappedDeg(t, wind);
    const set = (name: string, rad: number) => {
      this.spin.get(name)!.rotation.y = rad;
    };

    // barrel: the cover and the spring turn with the drum; the arbor stays with the click
    for (const f of this.drumFollowers) f.motion.rotation.y = a.barrel * DEG;
    this.mainspring?.update(wind);
    set('arbor', arbor * DEG);
    set('ratchet', arbor * DEG);
    set('click', clickAngle(arbor) * DEG);
    const cw = crownWheelAngle(arbor);
    set('crownWheel', cw * DEG);
    this.spin.get('windingPinion')!.rotation.x = windingPinionAngle(cw) * DEG;
    set('reduction', reductionAngle(arbor) * DEG);

    // rotor and reversers
    const rotor = opts.rotorAngle ?? 0;
    set('rotor', rotor * DEG);
    set('cage', rotor * CAGE_RATIO * DEG);
    set('reverser1Wheel', reverser1Angle(rotor) * DEG);
    set('reverser2Wheel', reverser2Angle(rotor) * DEG);
    set('reverser1Pinion', reverserPinionAngle(arbor) * DEG);
    set('reverser2Pinion', reverserPinionAngle(arbor) * DEG);

    // stem and what rides on it
    const pull = opts.crownPull ?? 0;
    const crown = opts.crownAngle ?? 0;
    const setting = opts.settingAngle ?? 0;
    for (const n of ['stem', 'slidingPinion']) {
      const node = this.spin.get(n)!;
      node.position.x = pull * SCENE_PER_MM;
      node.rotation.x = stemAngle(crown) * DEG;
    }
    set('yoke', yokeAngle(pull) * DEG);
    set('settingLever', settingLeverAngle(pull) * DEG);
    set('intermediateContrate', intermediateAngle(setting) * DEG);
    set('intermediateGear', intermediateAngle(setting) * DEG);
    const rocker = rockerAngle(opts.rocker ?? 2);
    set('rocker', rocker * DEG);
    set('settingWheelSpin', settingWheelSpin(setting, rocker) * DEG);
    set('corrector', correctorAngle(opts.quickAngle ?? 0) * DEG);

    // date
    const ring = opts.dateRing ?? ringFloatAt(t + handOffset);
    set('dateRing', ringAngle(ring) * DEG);
    set('jumper', jumperAngle(ring) * DEG);
  }
}

type PartNodeDef = Parameters<PartRegistry['add']>[0];

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
