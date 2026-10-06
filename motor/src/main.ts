import { Box3, Plane, Vector3 } from 'three';
import { MachineClock } from './core/clock';
import { MaterialLibrary } from './core/materials';
import { PartRegistry } from './core/registry';
import { OCCLUDER_LAYER, Stage } from './core/stage';
import { CameraRig } from './core/cameraRig';
import { Disassembly } from './core/disassembly';
import { LabelSystem } from './core/labels';
import { OcclusionProbe } from './core/occlusion';
import { SectionView } from './core/section';
import { type StateMap, UrlState } from './core/urlState';
import { Selection } from './core/selection';
import { CoachCard } from './core/ui/coach';
import { Panel } from './core/ui/panel';
import { Circuits } from './engine/circuits';
import type { LearnContext } from './engine/learn';
import { Quiz } from './engine/quiz';
import { Tour } from './engine/tour';
import { Combustion } from './engine/combustion';
import { CUT_RANGE, Cutaway, CycleFocus } from './engine/cutaway';
import { CAP_STYLES, capStyleOf, Engine, type BlockView } from './engine/engine';
import { GasFlow } from './engine/gasFlow';
import { buildOpenUi } from './engine/openUi';
import { CAMERA_PRESETS, type EngineLabel, LABELS } from './engine/presentation';
import { SPECS } from './engine/specs';
import { EngineSound } from './engine/sound';
import { buildEngineUi } from './engine/ui';
import './style.css';

const app = document.getElementById('app')!;

const title = document.createElement('div');
title.className = 'title-block';
title.innerHTML = '<h1>Dört Zamanlı Benzinli Motor</h1><p>1.6 L · Sıralı 4 silindir · DOHC 16 supap</p>';
const loading = document.createElement('div');
loading.className = 'loading';
loading.textContent = 'MOTOR HAZIRLANIYOR';
app.append(title, loading);

const stage = new Stage({
  container: app,
  subjectRadius: 380,
  target: new Vector3(...CAMERA_PRESETS[0]!.target),
  cameraPosition: new Vector3(...CAMERA_PRESETS[0]!.position),
  floorY: -168,
  framingAspect: 1.15,
});

const clock = new MachineClock({ rpm: SPECS.speed.defaultRpm });
const registry = new PartRegistry();
const engine = new Engine(registry, new MaterialLibrary());

// Let the loading caption paint before the (synchronous) CSG work starts.
setTimeout(() => {
  engine.build();
  stage.scene.add(registry.root);

  const disassembly = new Disassembly(registry);
  disassembly.rebuild();
  const rig = new CameraRig(stage.camera, stage.controls, registry);
  rig.jump(CAMERA_PRESETS[0]!);
  // Half-extents of the scene around the orbit target; the assembled values (Sergi view) are the reference framing.
  const fitBox = new Box3();
  const reach = (out: Vector3) => {
    fitBox.setFromObject(registry.root);
    const t = stage.controls.target;
    return out.set(
      Math.max(fitBox.max.x - t.x, t.x - fitBox.min.x),
      Math.max(fitBox.max.y - t.y, t.y - fitBox.min.y),
      Math.max(fitBox.max.z - t.z, t.z - fitBox.min.z),
    );
  };
  const rest = reach(new Vector3());
  const labels = new LabelSystem(app, registry);
  labels.build(LABELS);
  void document.fonts?.ready.then(() => labels.remeasure());
  const selection = new Selection(stage.renderer.domElement, stage.camera, registry);

  // ---- cut-away, gas flow, combustion ----
  const section = new SectionView(stage.scene, CAP_STYLES, capStyleOf);
  section.track(registry.root);
  engine.section = section;
  const focus = new CycleFocus();
  const cutaway = new Cutaway(section, focus);
  selection.filter = (obj, point) => !(obj.userData.sectionClipped && section.isCut(point));
  // Effects clip against their own plane: a copy of the cut while it is on, a no-op otherwise.
  const fxPlane = new Plane(new Vector3(0, 0, -1), 1e6);
  const gas = new GasFlow([fxPlane]);
  const combustion = new Combustion([fxPlane]);
  stage.scene.add(gas.points, combustion.root);
  stage.setGlowOccluderClipping([fxPlane]);
  // Only what surrounds the combustion chambers can hide a flame.
  const occluding = new Set(['block', 'cylinder-head', 'rods-pistons', 'valvetrain', 'valve-cover', 'plugs-injectors', 'intake-manifold', 'exhaust-manifold']);
  for (const part of registry.all()) {
    if (!occluding.has(part.def.group)) continue;
    part.motion.traverse((o) => {
      if (!o.userData.sectionHelper) o.layers.enable(OCCLUDER_LAYER);
    });
  }
  // Labels: outside parts always; inner parts once their layer is out or the cut exposes them;
  // never for geometry the cut has removed. One label per per-cylinder part (focused cylinder while cut).
  labels.filter = (d, anchor) => {
    const def = d as EngineLabel;
    const part = registry.get(def.partId);
    const cutOpen = section.isEnabled && disassembly.amount < 0.02;
    if (def.cylinder !== undefined && def.cylinder !== (cutOpen ? focus.cylinder + 1 : def.primary ? def.cylinder : -1)) return false;
    if (section.clipsPart(def.partId) && section.isCut(anchor)) return false;
    if (def.tier === 1) return true;
    if (cutOpen && !section.clipsPart(def.partId)) return true; // whole part inside an open cut
    return disassembly.layerProgress(def.reveal ?? part.def.group) > 0.6;
  };

  // Line of sight for labels: hide a label whose part is behind another one.
  const probe = new OcclusionProbe(registry.root, stage.camera);
  probe.filter = selection.filter;
  setTimeout(() => {
    probe.prepare((m) => String(m.userData.partId).startsWith('springs-')); // springs deform every frame
    labels.occlusion = (id, at) => probe.sees(id, at);
  }, 0);

  let requestView: (v: BlockView) => void = () => {};
  const sectionPreset = CAMERA_PRESETS.find((p) => p.id === 'section')!;
  sectionPreset.resolve = () => cutaway.view();
  sectionPreset.onEnter = () => requestView('section');
  // Views of parts that live inside the housings: see through them if the engine is closed and solid.
  for (const id of ['chain', 'crank', 'valves']) {
    CAMERA_PRESETS.find((p) => p.id === id)!.onEnter = () => {
      if (engine.view === 'solid' && disassembly.amount < 0.05) requestView('ghost');
    };
  }
  engine.setView(engine.view);

  const panel = new Panel(document.body, { title: 'KONTROL', hideLabel: 'Gizle', showLabel: 'KONTROL' });
  const learnSec = panel.section('Öğrenme');
  buildOpenUi(panel, { disassembly, rig, registry, labels, selection });
  const sound = new EngineSound(clock);
  const ui = buildEngineUi(panel, clock, engine, {
    sound,
    focus,
    cutaway,
    beforeMaterialSwap: () => selection.releaseMaterials(),
    onViewRequest: (l) => {
      requestView = l;
    },
  });
  cutaway.onChange(() => selection.releaseMaterials());

  // ---- guided tour, quiz, lubrication/cooling circuits ----
  const circuits = new Circuits();
  stage.scene.add(circuits.root);
  const coach = new CoachCard(document.body);
  const learn: LearnContext = {
    coach,
    panel,
    clock,
    engine,
    ui,
    disassembly,
    rig,
    presets: CAMERA_PRESETS,
    focus,
    cutaway,
    labels,
    selection,
    registry,
    circuits,
  };
  const tour = new Tour(learn);
  const quiz = new Quiz(learn);
  const learnGrid = learnSec.buttons<'tour' | 'quiz' | 'circuits'>(
    [
      { id: 'tour', label: 'Turu başlat', title: '6 adımlı rehberli tur: kamera ve demontaj adım adım ilerler' },
      { id: 'quiz', label: 'Mini sınav', title: '10 soru: parçayı bul, zamanı söyle, temel bilgi' },
      { id: 'circuits', label: 'Yağ ve su devreleri', span: 2, title: 'Yağlama ve soğutma devrelerini şematik göster' },
    ],
    {
      columns: 2,
      onSelect: (id) => {
        // on phones the panel (a bottom sheet) would cover the model: tuck it away during a tour or quiz
        if ((id === 'tour' || id === 'quiz') && window.innerWidth < 760) panel.setOpen(false);
        if (id === 'tour') {
          quiz.stop();
          tour.start();
        } else if (id === 'quiz') {
          tour.stop();
          quiz.start();
        } else {
          circuits.setVisible(!circuits.shown);
          if (circuits.shown && engine.view === 'solid') ui.setView('ghost');
        }
        syncLearn();
      },
    },
  );
  const syncLearn = () => {
    learnGrid.setSelected(tour.active ? 'tour' : quiz.active ? 'quiz' : null);
    learnGrid.el.querySelector<HTMLElement>('button:last-child')?.classList.toggle('is-active', circuits.shown);
  };
  tour.onEnd = syncLearn;
  quiz.onEnd = syncLearn;
  // ---- shareable state in the URL (#a=…&cam=…&p=…) ----
  const r1 = (v: number) => String(Math.round(v));
  const url = new UrlState(
    () => {
      const st: StateMap = {};
      const a = disassembly.amount;
      if (a > 0.0005) st.a = a.toFixed(3);
      const c = stage.camera.position;
      const t = stage.controls.target;
      st.cam = [c.x, c.y, c.z, t.x, t.y, t.z].map(r1).join(',');
      if (selection.selected) st.p = selection.selected.def.id;
      if (engine.view !== 'solid') st.v = engine.view;
      if (focus.cylinder !== 0) st.c = String(focus.cylinder + 1);
      if (cutaway.mode !== 'transverse') st.k = 'boyuna';
      const off = cutaway.offset[cutaway.mode];
      if (off !== CUT_RANGE[cutaway.mode].initial) st.x = off.toFixed(1);
      if (clock.paused) st.t = clock.crankAngle.toFixed(1);
      if (clock.rpm !== SPECS.speed.defaultRpm) st.rpm = String(clock.rpm);
      return st;
    },
    (st) => {
      const num = (k: string) => (st[k] !== undefined && Number.isFinite(Number(st[k])) ? Number(st[k]) : null);
      const c = num('c');
      if (c !== null && c >= 1 && c <= SPECS.cylinders) focus.set(Math.round(c) - 1);
      cutaway.setMode(st.k === 'boyuna' ? 'longitudinal' : 'transverse');
      const x = num('x');
      if (x !== null) {
        const r = CUT_RANGE[cutaway.mode];
        cutaway.setOffset(Math.min(r.max, Math.max(r.min, x)));
      }
      ui.syncCut();
      ui.setView(st.v === 'section' || st.v === 'ghost' ? st.v : 'solid');
      const a = num('a');
      disassembly.stopAnimation();
      disassembly.setAmount(a !== null ? a : 0);
      const rpm = num('rpm');
      if (rpm !== null) ui.setRpm(rpm);
      const t = num('t');
      if (t !== null) {
        ui.setSpeed('pause');
        clock.crankAngle = ((t % 720) + 720) % 720;
      }
      const cam = (st.cam ?? '').split(',').map(Number);
      if (cam.length === 6 && cam.every(Number.isFinite)) {
        rig.jump({ id: 'url', label: '', position: [cam[0]!, cam[1]!, cam[2]!], target: [cam[3]!, cam[4]!, cam[5]!] });
      }
      const p = st.p && registry.all().some((n) => n.def.id === st.p) ? st.p : null;
      selection.select(p);
    },
  );
  url.load();
  url.start();
  const shareSec = panel.find('Bakış açısı')!;
  const shareGrid = shareSec.buttons<'link'>([{ id: 'link', label: '🔗 Bu görünümün bağlantısını kopyala', title: 'Açıklık, kamera, seçili parça, kesit ve zaman bağlantıya yazılır' }], {
    columns: 1,
    onSelect: () => {
      const link = url.link();
      const done = (ok: boolean) => {
        shareGrid.setLabel('link', ok ? '✓ Bağlantı kopyalandı' : 'Adres çubuğundaki bağlantıyı paylaşın');
        setTimeout(() => shareGrid.setLabel('link', '🔗 Bu görünümün bağlantısını kopyala'), 1800);
      };
      navigator.clipboard?.writeText(link).then(() => done(true), () => done(false)) ?? done(false);
    },
  });

  learnSec.note('Tur motoru altı adımda anlatır (genel bakış → krank-biyel → 4 zaman → supaplar ve zamanlama → yağlama/soğutma → demontaj). Sınav on soru sorar ve skoru tutar.');
  // Free area for the model: right of the panel (desktop) or above the bottom sheet / the guide card (phones).
  let bottomInset = -1;
  const syncInset = () => {
    const narrow = window.innerWidth < 760;
    coach.el.classList.toggle('is-top', panel.open && narrow);
    const card = narrow && coach.visible && !panel.open ? coach.el.getBoundingClientRect().height + 20 : 0;
    const bottom = Math.max(panel.occupiedHeight, card);
    bottomInset = bottom;
    stage.setInsets(panel.occupiedWidth, bottom);
    labels.maxVisible = narrow ? 4 : 99;
    labels.area = {
      left: 0,
      top: narrow ? 56 : 84,
      right: window.innerWidth - panel.occupiedWidth,
      bottom: window.innerHeight - bottom,
    };
  };
  panel.onToggle(syncInset);
  window.addEventListener('resize', syncInset);
  syncInset();


  const spread = new Vector3();
  let fit = 1;
  let fitTarget = 1;
  let fitAmount = -1;
  const FLOOR_Y = stage.floor.position.y;
  // Shadows are redrawn only when the picture of the casters changes (Stage.invalidateShadows).
  let shadowKey = '';
  let labelScene = '';
  const labelCam = new Vector3();
  let lastAmount = 0;
  stage.onFrame((dt, elapsed) => {
    disassembly.update(dt);
    rig.update(dt);
    const a = disassembly.amount;
    stage.floor.position.y = FLOOR_Y - 320 * a; // the shadow catcher follows the lowest parts down
    // Zoom out in proportion to how far the parts have actually spread (box only when the spread changed).
    if (a !== fitAmount) {
      fitAmount = a;
      reach(spread);
      const ratio = Math.max(1, spread.y / rest.y, (spread.x / rest.x) * 0.9, (spread.z / rest.z) * 0.6);
      fitTarget = 1 / ratio;
    }
    fit += (fitTarget - fit) * Math.min(1, dt * 6);
    stage.setFit(fit);
    selection.update(elapsed);
    clock.tick(dt);
    engine.update(clock.crankAngle);
    // Inside a closed, solid engine the moving parts' shadows can never be seen: skip them in the shadow pass.
    const allShown = registry.populatedLayers().every((l) => registry.inLayer(l.id).every((p) => p.root.visible));
    engine.setInteriorShadows(!(engine.view === 'solid' && a < 1e-4 && allShown));
    const p = section.plane;
    const scene = `${engine.view}|${section.isEnabled ? `${p.normal.x},${p.normal.z},${p.constant},${focus.cylinder}` : '-'}|${allShown}`;
    const key = `${clock.crankAngle}|${a}|${scene}`;
    if (key !== shadowKey) {
      shadowKey = key;
      stage.invalidateShadows();
    }
    // labels: re-test every line of sight after a discrete change; while parts fly apart, test more per frame
    const camMoved = stage.camera.position.distanceTo(labelCam) > 0.06 * stage.camera.position.distanceTo(stage.controls.target);
    if (scene !== labelScene || camMoved) {
      labelScene = scene;
      labelCam.copy(stage.camera.position);
      labels.invalidateOcclusion();
    }
    labels.occlusionBudget = a !== lastAmount ? 16 : 6;
    lastAmount = a;
    // effects live in the assembled engine and can only be seen into it (cut or ghost); hide them otherwise
    const fxOn = a < 0.01 && engine.view !== 'solid';
    gas.points.visible = fxOn;
    combustion.root.visible = fxOn;
    if (fxOn) {
      if (section.isEnabled) fxPlane.copy(section.plane);
      else fxPlane.set(new Vector3(0, 0, -1), 1e6);
      gas.setScale(stage.renderer.domElement.height / (2 * Math.tan((stage.camera.fov * Math.PI) / 360)) * stage.camera.zoom);
      gas.update(clock.crankAngle);
      combustion.update(clock.crankAngle, elapsed);
    }
    // bloom only while a flame or spark can actually be seen: not in the solid view, and in the
    // transverse cut only for the focused cylinder (the others are cut away or hidden)
    const seen = engine.view === 'solid' ? 0 : section.isEnabled && cutaway.mode === 'transverse' ? combustion.glowOf(focus.cylinder) : combustion.glow;
    stage.setBloom(fxOn && seen > 0.02, 0.85);
    ui.update(stage.fps);
    sound.update();
    if (window.innerWidth < 760 && !panel.open) {
      const want = coach.visible ? Math.round(coach.el.getBoundingClientRect().height + 20) : 0;
      if (Math.abs(want - bottomInset) > 2) syncInset(); // the card changed size (next step / question)
    }
    if (coach.visible) {
      const r = coach.el.getBoundingClientRect();
      labels.blockers = [{ x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 }];
    } else labels.blockers = [];
    circuits.update(dt, elapsed);
    if (circuits.shown && a > 0.3) circuits.setVisible(false); // drawn for the assembled engine only
  });
  stage.onLateFrame(() => {
    section.update();
    labels.update(stage.camera, disassembly.amount);
  });
  stage.start();
  loading.classList.add('is-done');

  if (import.meta.env.DEV) Object.assign(window, { __app: { stage, clock, engine, registry, disassembly, rig, selection, labels, section, cutaway, focus, gas, combustion, ui, sound, tour, quiz, circuits, url, coach } });
}, 50);
