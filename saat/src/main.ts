import { Vector3 } from 'three';
import { CameraRig } from './core/cameraRig';
import { Disassembly } from './core/disassembly';
import { LabelSystem } from './core/labels';
import { OcclusionProbe } from './core/occlusion';
import { PartRegistry } from './core/registry';
import { Selection } from './core/selection';
import { Stage } from './core/stage';
import { CoachCard } from './core/ui/coach';
import { Panel } from './core/ui/panel';
import { type StateMap, UrlState } from './core/urlState';
import { PARTS } from './watch/catalog';
import { applyPlanarUv } from './watch/finishes';
import { WatchMaterials } from './watch/materials';
import { Watch } from './watch/watch';
import { TIME_SCALES, WatchClock } from './watch/watchClock';
import { GhostView } from './ui/ghost';
import { partCorners, viewExtents, zoomToFit } from './ui/fit';
import { attachCrownDrag } from './ui/crownDrag';
import type { LearnEnv } from './ui/learn';
import { buildOpenUi } from './ui/openUi';
import { Quiz } from './ui/quiz';
import { DEFAULT_SPEED_INDEX, decodeShare, encodeShare } from './ui/shareState';
import { WatchSound } from './ui/sound';
import { speedIndex } from './ui/speeds';
import { Tour } from './ui/tour';
import { cameraPresets, labelDefs } from './ui/views';
import { buildWatchUi, type ClockRef, clockAtTime } from './ui/watchUi';
import { buildWindingUi } from './ui/windingUi';
import './style.css';

const app = document.getElementById('app')!;

const title = document.createElement('div');
title.className = 'title-block';
title.innerHTML = '<h1>Mekanik Saat</h1><p>Otomatik mekanizma · Ø 25,6 mm · 21.600 A/s</p>';
const loading = document.createElement('div');
loading.className = 'loading';
loading.textContent = 'SAAT HAZIRLANIYOR';
app.append(title, loading);

// Scene unit = 0.1 mm: the Ø 25.6 mm movement is drawn 256 units across. It
// stands on its edge, the back (bridges) towards +Z and 12 o'clock up; the
// default view looks at the back from slightly above and to the side, and
// orbiting half a turn shows the dial.
const stage = new Stage({
  container: app,
  subjectRadius: 150,
  target: new Vector3(0, 0, 0),
  cameraPosition: new Vector3(-190, 120, 500),
  floorY: -142,
  framingAspect: 1.1,
});

/** Nearest part corner stays this share of the closed viewing distance in front of the camera. */
const MIN_DEPTH_SHARE = 0.7;

/** How often the shadow map is redrawn while the watch runs. */
const SHADOW_HZ = 30;

// Let the loading caption paint before the (synchronous) build starts.
setTimeout(() => {
  const registry = new PartRegistry();
  const watch = new Watch(registry, new WatchMaterials());
  watch.build();
  // movement +Y (dial) → world −Z, movement −Z (12 o'clock) → world +Y
  registry.root.rotation.set(Math.PI / 2, Math.PI, 0, 'YXZ');
  stage.scene.add(registry.root);
  registry.root.updateMatrixWorld(true);
  applyPlanarUv(registry.root); // planar UVs for the finishes (perlage, Côtes de Genève)

  const clock = WatchClock.fromDate(new Date());
  // the clock sits in a holder: "şimdiki saate dön" replaces it
  const ref: ClockRef = { clock };

  const disassembly = new Disassembly(registry);
  disassembly.rebuild();
  const presets = cameraPresets(registry.root);
  const rig = new CameraRig(stage.camera, stage.controls, registry);
  rig.jump(presets[0]!);
  const labels = new LabelSystem(app, registry);
  labels.build(labelDefs(registry));
  void document.fonts?.ready.then(() => labels.remeasure());
  // a label belongs to a part: it goes when the part's layer is switched off
  labels.filter = (d) => registry.get(d.partId).root.visible;
  const selection = new Selection(stage.renderer.domElement, stage.camera, registry);

  // Hayalet view: see-through plate, bridges and dial; clicks and sight lines pass through them.
  const ghost = new GhostView(registry, () => selection.releaseMaterials());
  ghost.onChange(() => stage.invalidateShadows());
  selection.filter = (obj) => !ghost.isGhost(obj as never);

  // Line of sight for labels: hide a label whose part is behind another one.
  const probe = new OcclusionProbe(registry.root, stage.camera);
  probe.filter = selection.filter;
  setTimeout(() => {
    probe.prepare((m) => m.userData.partId === 'hairspring'); // the spring changes shape every frame
    labels.occlusion = (id, at) => probe.sees(id, at);
  }, 0);

  const panel = new Panel(document.body, { title: 'KONTROL', hideLabel: 'Gizle', showLabel: 'KONTROL' });
  const learnSec = panel.section('Öğrenme');
  const sound = new WatchSound(() => ref.clock);
  const ui = buildWatchUi(panel, ref, { sound, ghost });
  const winding = buildWindingUi(panel, ref);
  const open = buildOpenUi(panel, { disassembly, rig, registry, labels, selection, presets });
  // the footer line (size, fps) closes the panel: the sections added after it come before it
  const footer = panel.el.querySelector('.pnl-footer');
  if (footer) footer.parentElement!.append(footer);
  // Inner views (escapement, train): the rotor covers the balance and the train, and its weight is gilt brass that
  // the ghost view leaves solid, so the rotor layer is switched off on entering them while the movement is closed
  // (and the train view also goes ghost to see through the bridges). The other views bring the rotor back, but only
  // if this hid it: a layer the user switched off stays off.
  let rotorHiddenByView = false;
  const hasRotor = registry.populatedLayers().some((l) => l.id === 'rotor');
  const inner = (ghostToo: boolean) => () => {
    if (disassembly.amount >= 0.05) return;
    if (hasRotor && registry.inLayer('rotor').every((p) => p.root.visible)) {
      open.setLayerVisible('rotor', false);
      rotorHiddenByView = true;
    }
    if (ghostToo && ghost.mode === 'solid') ui.setView('ghost');
  };
  const outer = () => {
    if (!rotorHiddenByView) return;
    rotorHiddenByView = false;
    open.setLayerVisible('rotor', true);
  };
  for (const p of presets) p.onEnter = p.id === 'escapement' ? inner(false) : p.id === 'train' ? inner(true) : outer;

  // Disassembly back-off. Opening the movement pushes parts along the line of sight (towards the viewer, for the back
  // side), and in perspective they would swell and pass the camera, so the camera backs off with the nearest part:
  // `dolly` is how far, and `applied` how much of it the camera position carries right now. The camera rig and the
  // orbit controls work on the camera without it (it is taken off at the start of a frame and put back at the end),
  // so a preset or a shared link that sets the camera absolutely does not leave a stale back-off behind.
  let dolly = 0;
  let applied = 0;
  const viewDir = new Vector3();
  const shiftCamera = (d: number) => {
    if (d === 0) return;
    viewDir.subVectors(stage.camera.position, stage.controls.target).normalize();
    stage.camera.position.addScaledVector(viewDir, d);
  };
  const plainGo = rig.go.bind(rig);
  const plainJump = rig.jump.bind(rig);
  rig.go = (preset, seconds) => {
    shiftCamera(-applied); // the tween starts from the camera as it is without the back-off
    plainGo(preset, seconds);
    shiftCamera(applied);
  };
  rig.jump = (preset) => {
    shiftCamera(-applied);
    applied = 0;
    plainJump(preset); // the next frame puts the back-off on again
  };

  // ---- guided tour, quiz: they drive the same controls the panel does, through one narrow interface ----
  const coach = new CoachCard(document.body);
  const env: LearnEnv = {
    getClock: () => ref.clock,
    setClock: (c) => {
      ref.clock = c;
      ui.refresh();
    },
    setSpeed: (scale) => ui.setSpeed(scale),
    setPaused: (paused) => ui.setPaused(paused),
    getView: () => ghost.mode,
    setView: (v) => ui.setView(v),
    getOpen: () => disassembly.amount,
    openTo: (amount) => disassembly.animateTo(amount),
    cameraPose: () => {
      const c = stage.camera.position;
      const t = stage.controls.target;
      return { position: [c.x, c.y, c.z], target: [t.x, t.y, t.z] };
    },
    activePreset: () => (presets.some((p) => p.id === rig.activeId) ? rig.activeId : null),
    goPreset: (id, seconds) => rig.go(presets.find((p) => p.id === id)!, seconds),
    // `outer` puts back a rotor that an inner view hid
    goPose: (pose, seconds) => rig.go({ id: 'learn-return', label: '', position: pose.position, target: pose.target, onEnter: outer }, seconds),
    labelsOn: () => labels.enabled,
    setLabels: (on) => labels.setEnabled(on),
    selected: () => selection.selected?.def.id ?? null,
    select: (id) => selection.select(id),
    onSelect: (l) => selection.onChange((p) => l(p?.def.id ?? null)),
    layers: () => Object.fromEntries(registry.populatedLayers().map((l) => [l.id, registry.inLayer(l.id).every((p) => p.root.visible)])),
    setLayer: (id, on) => open.setLayerVisible(id, on),
  };
  const tour = new Tour(env, coach);
  const quiz = new Quiz(env, coach, (id) => registry.get(id));
  const learnGrid = learnSec.buttons<'tour' | 'quiz'>(
    [
      { id: 'tour', label: 'Turu başlat', title: '7 adımlı rehberli tur: kamera, görünüm, hız ve demontaj adım adım ilerler' },
      { id: 'quiz', label: 'Mini sınav', title: '10 soru: parçayı bul, say, kavra' },
    ],
    {
      columns: 2,
      onSelect: (id) => {
        // on phones the panel (a bottom sheet) would cover the model: tuck it away during a tour or quiz
        if (window.innerWidth < 760) panel.setOpen(false);
        if (id === 'tour') {
          quiz.stop();
          tour.start();
        } else {
          tour.stop();
          quiz.start();
        }
        syncLearn();
      },
    },
  );
  const syncLearn = () => learnGrid.setSelected(tour.active ? 'tour' : quiz.active ? 'quiz' : null);
  tour.onEnd = syncLearn;
  quiz.onEnd = syncLearn;
  learnSec.note('Tur mekanizmayı yedi adımda anlatır (genel bakış → enerji → takım → çıkış → balans → kadran → kurma-ayar ve demontaj). Sınav on soru sorar ve skoru tutar. İkisi de bitince her şeyi eski hâline getirir.');

  // the crown can be turned by dragging it in the model
  attachCrownDrag({
    container: app,
    canvas: stage.renderer.domElement,
    camera: stage.camera,
    registry,
    filter: (obj) => !ghost.isGhost(obj as never),
    onTurn: (deg) => winding.turnBy(deg),
    onClick: () => selection.select(PARTS.windingStem.id),
  });

  // ---- shareable state in the URL (#a=…&cam=…&p=…) ----
  const url = new UrlState(
    () => {
      // the camera without the back-off: the opened movement backs the camera off again by itself when the link is loaded
      const t = stage.controls.target;
      const c = viewDir.subVectors(stage.camera.position, t).normalize().multiplyScalar(-applied).add(stage.camera.position);
      return encodeShare({
        open: disassembly.amount,
        camera: [c.x, c.y, c.z, t.x, t.y, t.z],
        part: selection.selected?.def.id ?? null,
        view: ghost.mode,
        speed: speedIndex(ref.clock.timeScale) < 0 ? DEFAULT_SPEED_INDEX : speedIndex(ref.clock.timeScale),
        pausedAt: ref.clock.paused ? ref.clock.t : null,
      }) as StateMap;
    },
    (st) => {
      const d = decodeShare(st, new Set(registry.all().map((p) => p.def.id)));
      ui.setView(d.view ?? 'solid');
      disassembly.stopAnimation();
      disassembly.setAmount(d.open ?? 0);
      if (d.speed !== null) ui.setSpeed(TIME_SCALES[d.speed]!);
      if (d.pausedAt !== null) {
        ref.clock = clockAtTime(ref.clock, d.pausedAt);
        ui.refresh();
      }
      if (d.camera) rig.jump({ id: 'url', label: '', position: [d.camera[0], d.camera[1], d.camera[2]], target: [d.camera[3], d.camera[4], d.camera[5]] });
      selection.select(d.part);
    },
  );
  url.load();
  url.start();
  const shareGrid = panel.find('Bakış açısı')!.buttons<'link'>(
    [{ id: 'link', label: '🔗 Bu görünümün bağlantısını kopyala', title: 'Açıklık, kamera, seçili parça, görünüm, hız ve (duraklatılmışsa) saat bağlantıya yazılır' }],
    {
      columns: 1,
      onSelect: () => {
        const link = url.link();
        const done = (ok: boolean) => {
          shareGrid.setLabel('link', ok ? '✓ Bağlantı kopyalandı' : 'Adres çubuğundaki bağlantıyı paylaşın');
          setTimeout(() => shareGrid.setLabel('link', '🔗 Bu görünümün bağlantısını kopyala'), 1800);
        };
        navigator.clipboard?.writeText(link).then(() => done(true), () => done(false)) ?? done(false);
      },
    },
  );

  // Free area for the model: right of the panel (desktop) or above the bottom sheet (phones), and above the guide
  // card while one is showing, so that the card never covers what it is talking about. On phones with the panel open
  // the card sits at the top instead and takes nothing from the bottom.
  let cardInset = 0;
  const cardHeight = () => {
    const narrow = window.innerWidth < 760;
    return coach.visible && !(narrow && panel.open) ? Math.round(coach.el.getBoundingClientRect().height + 20) : 0;
  };
  const syncInset = () => {
    const narrow = window.innerWidth < 760;
    coach.el.classList.toggle('is-top', panel.open && narrow);
    cardInset = cardHeight();
    const bottom = Math.max(panel.occupiedHeight, cardInset);
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

  // Disassembly framing: while parts are out, the zoom follows where their boxes really are on screen.
  let fit = 1;
  let fitTarget = 1;
  let fitKey = '';
  const corners: Vector3[] = [];
  const fromCam = new Vector3();
  stage.controls.maxDistance = 6000;
  // Shadows are redrawn only when the picture of the casters changes (Stage.invalidateShadows).
  let shadowKey = '';
  let labelScene = '';
  const labelCam = new Vector3();
  let lastAmount = 0;
  stage.onFrame((dt, elapsed) => {
    disassembly.update(dt);
    shiftCamera(-applied);
    applied = 0;
    rig.update(dt);
    const a = disassembly.amount;
    // The camera keeps the nearest corner at a fixed share of the closed-up viewing distance, and returns as the
    // movement closes.
    if (a > 1e-4 || dolly > 1e-3) {
      partCorners(registry.all().map((p) => p.root), corners);
      const cam = stage.camera.position;
      viewDir.subVectors(cam, stage.controls.target);
      const dist = viewDir.length();
      viewDir.divideScalar(dist);
      let nearest = Infinity;
      for (const c of corners) nearest = Math.min(nearest, viewDir.dot(fromCam.subVectors(cam, c)));
      const wanted = Math.max(0, MIN_DEPTH_SHARE * dist - nearest);
      dolly += (wanted - dolly) * Math.min(1, dt * 6);
    }
    shiftCamera(dolly);
    applied = dolly;
    // Zoom: while parts are out it follows where their boxes really are on screen.
    const camKey = `${a}|${stage.camera.position.toArray().map((v) => v.toFixed(1))}|${stage.controls.target.toArray().map((v) => v.toFixed(1))}|${stage.camera.aspect}`;
    if (camKey !== fitKey) {
      fitKey = camKey;
      if (a < 1e-4) fitTarget = 1;
      else {
        const base = stage.camera.zoom / fit; // zoom the stage uses at fit = 1 (free area, aspect)
        const freeW = 1 - Math.min(panel.occupiedWidth, window.innerWidth * 0.45) / window.innerWidth;
        const freeH = 1 - Math.min(panel.occupiedHeight, window.innerHeight * 0.6) / window.innerHeight;
        const need = zoomToFit(viewExtents(stage.camera, corners), freeW, freeH) / base;
        // fades in over the first few percent so that a close-up preset does not jump the moment it opens
        const k = Math.min(1, a / 0.06);
        fitTarget = 1 + (Math.min(1, need) - 1) * k;
      }
    }
    fit += (fitTarget - fit) * Math.min(1, dt * 6);
    stage.setFit(fit);
    selection.update(elapsed);

    const clock = ref.clock;
    clock.tick(dt);
    // the pose carries what the time alone does not: the rotor, crown, hand setting, date ring and the run-down
    const pose = clock.pose;
    watch.update(clock.t, { ...pose, continuous: clock.continuous, amplitude: clock.amplitude });
    const layers = registry.populatedLayers().map((l) => (registry.inLayer(l.id).every((p) => p.root.visible) ? 1 : 0)).join('');
    const scene = `${ghost.mode}|${layers}`;
    // Moving casters: while anything moves (the watch runs, the balance still swings down after the spring ran out,
    // or the crown and rocker travel) the shadow map is refreshed SHADOW_HZ times a second, a shadow this small
    // does not show the difference. Otherwise it is redrawn only when the time, the pose (rotor, date ring, crown,
    // hand setting, ...), the disassembly or the scene changed.
    const live = !clock.paused && (clock.moving || pose.drive.env > 1e-3);
    const poseKey = live
      ? Math.floor(elapsed * SHADOW_HZ)
      : [clock.t, pose.handOffset, pose.dateRing, pose.crownPull, pose.crownAngle, pose.settingAngle, pose.quickAngle, pose.rocker, pose.rotorAngle, pose.drive.env].join(',');
    const key = `${poseKey}|${a}|${scene}`;
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

    ui.update(stage.fps);
    winding.update(dt);
    sound.update();
    // the card changes size from step to step (and from question to question)
    if (Math.abs(cardHeight() - cardInset) > 2) syncInset();
    // labels keep clear of the card
    if (coach.visible) {
      const r = coach.el.getBoundingClientRect();
      labels.blockers = [{ x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 }];
    } else labels.blockers = [];
  });
  stage.onLateFrame(() => labels.update(stage.camera, disassembly.amount));
  stage.start();
  loading.classList.add('is-done');

  if (import.meta.env.DEV) Object.assign(window, { __app: { stage, ref, watch, registry, disassembly, rig, selection, labels, ghost, ui, sound, probe, presets, winding, tour, quiz, url, coach, panel } });
}, 50);
