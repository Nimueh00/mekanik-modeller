import type { MachineClock } from '../core/clock';
import type { Panel } from '../core/ui/panel';
import type { BlockView, Engine } from './engine';
import { cylinderCrankAngle, pistonDrop } from './kinematics';
import { DISPLACEMENT_CC, SPECS } from './specs';
import { CUT_RANGE, type CutMode, type Cutaway, type CycleFocus } from './cutaway';
import { buildCycleUi } from './cycleUi';

type SpeedId = 'pause' | 's50' | 's10' | 's4' | 'real';
const SPEEDS: Record<Exclude<SpeedId, 'pause'>, number> = { s50: 1 / 50, s10: 1 / 10, s4: 1 / 4, real: 1 };

const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export interface EngineUiHooks {
  focus: CycleFocus;
  cutaway: Cutaway;
  /** Called before the view mode swaps materials (lets the selection release its highlight clones). */
  beforeMaterialSwap: () => void;
  /** Lets other controls (the "Kesit" camera preset) switch the view mode through the panel. */
  onViewRequest: (l: (v: BlockView) => void) => void;
}

/**
 * Lower half of the control panel (VISION §5): time, speed, crank angle,
 * cycle indicator and the cut-away view. "İçini aç", "Bakış açısı",
 * "Katmanlar" and "Parça bilgisi" come from openUi.ts above these.
 */
export function buildEngineUi(panel: Panel, clock: MachineClock, engine: Engine, o: EngineUiHooks): (fps: number) => void {
  // ---------- Zaman ----------
  const time = panel.section('Zaman');
  let lastSpeed: Exclude<SpeedId, 'pause'> = 's10';
  const speedGrid = time.buttons<SpeedId>(
    [
      { id: 'pause', label: '❚❚', title: 'Durdur / oynat (boşluk)' },
      { id: 's50', label: '1/50×' },
      { id: 's10', label: '1/10×' },
      { id: 's4', label: '1/4×' },
      { id: 'real', label: 'Gerçek', span: 2 },
    ],
    {
      columns: 3,
      onSelect: (id) => {
        if (id === 'pause') {
          clock.paused = !clock.paused;
        } else {
          lastSpeed = id;
          clock.timeScale = SPEEDS[id];
          clock.paused = false;
        }
        syncSpeed();
      },
    },
  );
  const syncSpeed = () => {
    speedGrid.setSelected(clock.paused ? 'pause' : lastSpeed);
    speedGrid.setLabel('pause', clock.paused ? '▶' : '❚❚');
  };
  clock.timeScale = SPEEDS[lastSpeed];
  syncSpeed();

  time.buttons<'back' | 'fwd'>(
    [
      { id: 'back', label: '◂ 1°', title: 'Bir derece geri (←)' },
      { id: 'fwd', label: '1° ▸', title: 'Bir derece ileri (→)' },
    ],
    {
      columns: 2,
      onSelect: (id) => stepBy(id === 'fwd' ? 1 : -1),
    },
  );
  const stepBy = (deg: number) => {
    clock.paused = true;
    clock.advance(deg);
    syncSpeed();
  };

  // ---------- Devir ----------
  const rpmSec = panel.section('Devir');
  rpmSec.slider({
    min: SPECS.speed.idleRpm,
    max: SPECS.speed.redlineRpm,
    step: 50,
    value: clock.rpm,
    format: (v) => `${v.toLocaleString('tr-TR')} dev/dk`,
    onInput: (v) => {
      clock.rpm = v;
    },
    minLabel: 'Rölanti',
    maxLabel: 'Kırmızı çizgi',
  });
  const effective = rpmSec.readout('Ekrandaki hız');

  // ---------- Krank açısı ----------
  const angSec = panel.section('Krank açısı');
  const gauge = buildGauge();
  angSec.append(gauge.el);
  const angle = angSec.readout('Motor saati (0–720°)');
  const mech = angSec.readout('Krank konumu (0–360°)');
  const cam = angSec.readout('Eksantrik açısı (½ hız)');

  // ---------- Çevrim göstergesi (Faz 4) ----------
  const updateCycle = buildCycleUi(panel, clock, o.focus);

  // ---------- Kesit görünümü ----------
  const viewSec = panel.section('Kesit görünümü');
  const viewGrid = viewSec.buttons<BlockView>(
    [
      { id: 'section', label: 'Kesit' },
      { id: 'ghost', label: 'Saydam' },
      { id: 'solid', label: 'Katı' },
    ],
    {
      columns: 3,
      selected: engine.view,
      onSelect: (v) => setView(v),
    },
  );
  const setView = (v: BlockView) => {
    o.beforeMaterialSwap();
    engine.setView(v);
    viewGrid.setSelected(v);
  };
  o.onViewRequest((v) => setView(v));
  const cutGrid = viewSec.buttons<CutMode>(
    [
      { id: 'transverse', label: 'Enine', title: 'Krank eksenine dik düzlem, seçili silindirin ekseni yakınından' },
      { id: 'longitudinal', label: 'Boyuna', title: 'Dört silindir ekseninden geçen düzlem' },
    ],
    {
      columns: 2,
      selected: o.cutaway.mode,
      onSelect: (m) => {
        o.cutaway.setMode(m);
        cutGrid.setSelected(m);
        syncSlider();
        if (engine.view !== 'section') setView('section');
      },
    },
  );
  const slider = viewSec.slider({
    min: CUT_RANGE.longitudinal.min,
    max: CUT_RANGE.longitudinal.max,
    step: 0.5,
    value: o.cutaway.offset[o.cutaway.mode],
    format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} mm`,
    onInput: (v) => {
      const r = CUT_RANGE[o.cutaway.mode];
      o.cutaway.setOffset(Math.min(r.max, Math.max(r.min, v)));
      if (engine.view !== 'section') setView('section');
    },
    minLabel: 'Düzlem konumu',
    maxLabel: 'eksenden uzaklık',
  });
  const syncSlider = () => slider.set(o.cutaway.offset[o.cutaway.mode]);
  viewSec.note(
    'Enine: krank eksenine dik, seçili silindirden; Boyuna: dört silindir ekseninden. Kesilen katı yüzeyler kapalı ve malzemeye göre taralı (alüminyum 45°, çelik −45° sık, bronz, conta). Seçili silindirin hareketli parçaları kesilmez. Saydam: sabit gövdeler yarı saydam.',
  );

  const footer = panel.footer('');

  // keyboard
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Space') {
      e.preventDefault();
      clock.paused = !clock.paused;
      syncSpeed();
    } else if (e.code === 'ArrowRight') stepBy(e.shiftKey ? 10 : 1);
    else if (e.code === 'ArrowLeft') stepBy(e.shiftKey ? -10 : -1);
  });

  const specLine = `${SPECS.cylinders} silindir · ${SPECS.bore} × ${SPECS.stroke} mm · ${Math.round(DISPLACEMENT_CC)} cm³ · l = ${SPECS.rodLength} mm`;

  return (fps: number) => {
    const a = clock.crankAngle;
    angle.set(`${a.toFixed(1)}°`);
    mech.set(`${(a % 360).toFixed(1)}°`);
    cam.set(`${(a / 2).toFixed(1)}°`);
    updateCycle();
    const visRpm = clock.paused ? 0 : clock.rpm * clock.timeScale;
    effective.set(clock.paused ? 'durduruldu' : `${visRpm.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} dev/dk`);
    gauge.update(a);
    footer.textContent = `${specLine} · ${Math.round(fps)} fps`;
  };
}

/** Circular crank-angle dial (0–720°) plus a piston-height bar for each cylinder. */
function buildGauge(): { el: HTMLElement; update(a: number): void } {
  const el = document.createElement('div');
  el.className = 'crank-gauge';
  const size = 132;
  const c = size / 2;
  const R = 54;
  const dial = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'crank-dial' });
  dial.append(svg('circle', { cx: c, cy: c, r: R, class: 'dial-ring' }));
  for (let d = 0; d < 720; d += 15) {
    const major = d % 90 === 0;
    const a = (d / 720) * Math.PI * 2 - Math.PI / 2;
    const r0 = R - (major ? 9 : 4);
    dial.append(
      svg('line', {
        x1: c + Math.cos(a) * r0,
        y1: c + Math.sin(a) * r0,
        x2: c + Math.cos(a) * R,
        y2: c + Math.sin(a) * R,
        class: major ? 'dial-tick major' : 'dial-tick',
      }),
    );
  }
  for (const d of [0, 180, 360, 540]) {
    const a = (d / 720) * Math.PI * 2 - Math.PI / 2;
    const t = svg('text', { x: c + Math.cos(a) * (R - 19), y: c + Math.sin(a) * (R - 19) + 3.5, class: 'dial-label' });
    t.textContent = String(d);
    dial.append(t);
  }
  const needle = svg('line', { x1: c, y1: c, x2: c, y2: c - R + 3, class: 'dial-needle' });
  dial.append(needle, svg('circle', { cx: c, cy: c, r: 3.5, class: 'dial-hub' }));

  const bars = document.createElement('div');
  bars.className = 'cyl-bars';
  const fills: HTMLElement[] = [];
  const labels: HTMLElement[] = [];
  for (let i = 0; i < SPECS.cylinders; i++) {
    const col = document.createElement('div');
    col.className = 'cyl-bar';
    const track = document.createElement('div');
    track.className = 'cyl-track';
    const piston = document.createElement('div');
    piston.className = 'cyl-piston';
    track.append(piston);
    const val = document.createElement('span');
    val.className = 'cyl-val';
    const name = document.createElement('span');
    name.className = 'cyl-name';
    name.textContent = String(i + 1);
    col.append(track, name, val);
    bars.append(col);
    fills.push(piston);
    labels.push(val);
  }
  const caption = document.createElement('div');
  caption.className = 'cyl-caption';
  caption.textContent = 'Piston konumu — ÜÖN’den mm';
  const right = document.createElement('div');
  right.className = 'cyl-wrap';
  right.append(bars, caption);
  el.append(dial, right);

  const lastText: string[] = [];
  return {
    el,
    update(a: number) {
      needle.setAttribute('transform', `rotate(${(a / 2).toFixed(2)} ${c} ${c})`);
      for (let i = 0; i < SPECS.cylinders; i++) {
        const drop = pistonDrop(cylinderCrankAngle(i, a));
        fills[i]!.style.top = `${((drop / SPECS.stroke) * 70).toFixed(2)}%`; // piston is 30% of the track
        const t = drop.toFixed(1);
        if (lastText[i] !== t) {
          labels[i]!.textContent = t;
          lastText[i] = t;
        }
      }
    },
  };
}
