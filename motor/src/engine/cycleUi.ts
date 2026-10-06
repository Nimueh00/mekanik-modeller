import type { MachineClock } from '../core/clock';
import type { Panel } from '../core/ui/panel';
import type { CycleFocus } from './cutaway';
import { pistonDrop } from './kinematics';
import { SPECS } from './specs';
import { CYCLE, CYCLE_STEP, cylinderPressure, cylinderVolume, gasTemperature, IGNITION_PHI, pistonSpeed } from './thermo';
import { cycleAngle, type Stroke, STROKE_TR, strokeOf, VALVE_EVENTS, valveLift } from './timing';

const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const div = (cls: string, text?: string) => {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
};

/** Stroke colours, shared by the stroke pills, the phase wheel and the P-V loop. */
export const STROKE_COLOR: Record<Stroke, string> = {
  intake: '#5b9cf0',
  compression: '#49b3a1',
  power: '#ec8a3c',
  exhaust: '#a3917d',
};
const STROKES: Stroke[] = ['intake', 'compression', 'power', 'exhaust'];
const SHORT: Record<Stroke, string> = { intake: 'Emme', compression: 'Sıkıştırma', power: 'Genişleme', exhaust: 'Egzoz' };

/** Stroke of a cycle angle φ (0 = firing TDC). */
function strokeAt(phi: number): Stroke {
  if (phi < 180) return 'power';
  if (phi < 360) return 'exhaust';
  if (phi < 540) return 'intake';
  return 'compression';
}

/**
 * "Çevrim göstergesi": cylinder selector, stroke indicator, a 720° phase
 * wheel with all four cylinders, a live P-V diagram and numeric readouts for
 * the focused cylinder.
 */
export function buildCycleUi(panel: Panel, clock: MachineClock, focus: CycleFocus): () => void {
  const sec = panel.section('Çevrim göstergesi');

  const cylGrid = sec.buttons<string>(
    Array.from({ length: SPECS.cylinders }, (_, i) => ({ id: String(i), label: `${i + 1}. silindir`, title: `${i + 1}. silindiri izle` })),
    { columns: 4, selected: '0', onSelect: (id) => focus.set(Number(id)) },
  );
  cylGrid.el.classList.add('cyc-cyl-grid');
  focus.onChange((c) => cylGrid.setSelected(String(c)));

  // ---- stroke pills ----
  const pills = div('cyc-strokes');
  const pillEls = new Map<Stroke, HTMLElement>();
  for (const s of STROKES) {
    const p = div('cyc-stroke', SHORT[s]);
    p.style.setProperty('--stroke', STROKE_COLOR[s]);
    pills.append(p);
    pillEls.set(s, p);
  }
  sec.append(pills);

  // ---- phase wheel + key readouts ----
  const row = div('cyc-row');
  const wheel = buildWheel((c) => focus.set(c));
  const side = div('cyc-side');
  const big = div('cyc-big');
  const bigLabel = div('cyc-big-label', 'Çevrim açısı');
  const strokeName = div('cyc-stroke-name');
  side.append(bigLabel, big, strokeName);
  row.append(wheel.el, side);
  sec.append(row);

  // ---- P-V diagram ----
  const pv = buildPv();
  sec.append(pv.el);
  const logGrid = sec.buttons<'lin' | 'log'>(
    [
      { id: 'lin', label: 'Doğrusal' },
      { id: 'log', label: 'Log–log' },
    ],
    {
      columns: 2,
      selected: 'lin',
      onSelect: (id) => {
        pv.setLog(id === 'log');
        logGrid.setSelected(id);
      },
    },
  );

  // ---- readouts ----
  const rCrank = sec.readout('Krank açısı');
  const rPos = sec.readout('Piston konumu (ÜÖN’den)');
  const rSpeed = sec.readout('Piston hızı');
  const rIn = sec.readout('Emme supabı lifti');
  const rEx = sec.readout('Egzoz supabı lifti');
  const rP = sec.readout('Silindir basıncı');
  const rV = sec.readout('Hacim · sıcaklık');
  sec.note(
    `Model: Otto çevrimi, politropik sıkıştırma/genişleme (n = 1.3), Wiebe ısı salınımı (ateşleme 15° ÜÖN önce, 55° süre), emme ≈ 1 bar. Tepe basınç ${CYCLE.peakPressure.toFixed(0)} bar (${(CYCLE.peakPressurePhi).toFixed(0)}° ÜÖN sonra), net iş ${CYCLE.work.toFixed(0)} J/çevrim.`,
  );

  let lastStroke: Stroke | null = null;
  return () => {
    const c = focus.cylinder;
    const a = clock.crankAngle;
    const phi = cycleAngle(c, a);
    const stroke = strokeOf(c, a);
    if (stroke !== lastStroke) {
      for (const [s, el] of pillEls) el.classList.toggle('is-active', s === stroke);
      strokeName.textContent = STROKE_TR[stroke];
      strokeName.style.color = STROKE_COLOR[stroke];
      lastStroke = stroke;
    }
    big.textContent = `${phi.toFixed(1)}°`;
    wheel.update(a, c);
    pv.update(phi);

    const drop = pistonDrop(phi % 360);
    const v = pistonSpeed(phi, clock.rpm);
    rCrank.set(`${a.toFixed(1)}° / 720°`);
    rPos.set(`${drop.toFixed(2)} mm`);
    rSpeed.set(`${Math.abs(v).toFixed(2)} m/s ${Math.abs(v) < 0.005 ? '' : v > 0 ? '↓' : '↑'} (${clock.rpm.toLocaleString('tr-TR')} dev/dk)`);
    rIn.set(`${valveLift('intake', c, a).toFixed(2)} mm`);
    rEx.set(`${valveLift('exhaust', c, a).toFixed(2)} mm`);
    rP.set(`${cylinderPressure(phi).toFixed(2)} bar`);
    rV.set(`${(cylinderVolume(phi) / 1000).toFixed(1)} cm³ · ${Math.round(gasTemperature(phi))} K`);
  };
}

// ------------------------------------------------------------------ phase wheel

/** 720° wheel: stroke arcs, valve events, spark, and a marker per cylinder (click to focus). */
function buildWheel(onPick: (c: number) => void): { el: HTMLElement; update(a: number, focus: number): void } {
  const size = 146;
  const c = size / 2;
  const R = 58;
  const el = div('cyc-wheel');
  const s = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size });
  const pt = (deg: number, r: number) => {
    const t = (deg / 720) * Math.PI * 2 - Math.PI / 2;
    return [c + Math.cos(t) * r, c + Math.sin(t) * r] as const;
  };
  const arc = (from: number, to: number, r: number) => {
    const [x0, y0] = pt(from, r);
    const [x1, y1] = pt(to, r);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 360 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  // stroke arcs (cycle angle: 0 firing TDC → power, exhaust, intake, compression)
  const ranges: [Stroke, number, number][] = [
    ['power', 0, 180],
    ['exhaust', 180, 360],
    ['intake', 360, 540],
    ['compression', 540, 720],
  ];
  for (const [st, a0, a1] of ranges) {
    s.append(svg('path', { d: arc(a0 + 1, a1 - 1, R), class: 'cyc-arc', stroke: STROKE_COLOR[st] }));
  }
  // valve events: intake inside, exhaust outside the ring
  const ev = (from: number, to: number, r: number, cls: string) => s.append(svg('path', { d: arc(from, to, r), class: cls }));
  ev(VALVE_EVENTS.intake.open, VALVE_EVENTS.intake.close, R - 9, 'cyc-ev cyc-ev-in');
  ev(VALVE_EVENTS.exhaust.open, VALVE_EVENTS.exhaust.close, R + 7, 'cyc-ev cyc-ev-ex');
  for (const d of [0, 180, 360, 540]) {
    const [x0, y0] = pt(d, R - 4);
    const [x1, y1] = pt(d, R + 4);
    s.append(svg('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'cyc-tdc' }));
  }
  const tdcLabels: [number, string][] = [
    [0, 'ÜÖN'],
    [180, 'AÖN'],
    [360, 'ÜÖN'],
    [540, 'AÖN'],
  ];
  for (const [d, t] of tdcLabels) {
    const [x, y] = pt(d, R - 19);
    const tx = svg('text', { x, y: y + 3, class: 'cyc-wlabel' });
    tx.textContent = t;
    s.append(tx);
  }
  const [sx, sy] = pt(IGNITION_PHI, R + 1);
  const bolt = svg('text', { x: sx, y: sy + 4, class: 'cyc-spark' });
  bolt.textContent = '⚡';
  s.append(bolt);

  const markers: SVGGElement[] = [];
  for (let i = 0; i < SPECS.cylinders; i++) {
    const g = svg('g', { class: 'cyc-marker' });
    g.append(svg('circle', { r: 8, cx: 0, cy: 0 }));
    const t = svg('text', { x: 0, y: 3.4 });
    t.textContent = String(i + 1);
    g.append(t);
    g.addEventListener('click', () => onPick(i));
    s.append(g);
    markers.push(g);
  }
  el.append(s);
  return {
    el,
    update(a: number, focus: number) {
      for (let i = 0; i < markers.length; i++) {
        const phi = cycleAngle(i, a);
        const [x, y] = pt(phi, R);
        const m = markers[i]!;
        m.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        m.classList.toggle('is-focus', i === focus);
        m.style.setProperty('--stroke', STROKE_COLOR[strokeAt(phi)]);
      }
      // keep the focused marker on top
      const f = markers[focus]!;
      if (f.nextSibling) f.parentNode!.appendChild(f);
    },
  };
}

// ------------------------------------------------------------------ P-V diagram

function buildPv(): { el: HTMLElement; setLog(on: boolean): void; update(phi: number): void } {
  const el = div('cyc-pv');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  el.append(canvas);
  let log = false;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let bg: HTMLCanvasElement | null = null;

  const vMin = (CYCLE.v.reduce((m, x) => Math.min(m, x), Infinity));
  const vMax = (CYCLE.v.reduce((m, x) => Math.max(m, x), 0));
  const pMax = CYCLE.peakPressure;
  const pad = { l: 34, r: 8, t: 8, b: 24 };

  const X = (v: number) => {
    const t = log ? (Math.log10(v) - Math.log10(vMin * 0.9)) / (Math.log10(vMax * 1.08) - Math.log10(vMin * 0.9)) : (v - vMin * 0.0) / (vMax * 1.05);
    return pad.l + t * (w - pad.l - pad.r);
  };
  const Y = (p: number) => {
    const t = log ? (Math.log10(p) - Math.log10(0.6)) / (Math.log10(pMax * 1.4) - Math.log10(0.6)) : p / (pMax * 1.1);
    return h - pad.b - t * (h - pad.t - pad.b);
  };

  const drawBackground = () => {
    const rect = el.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(200, Math.round(rect.width || 296));
    h = Math.round(w * 0.62);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = `${h}px`;
    bg = document.createElement('canvas');
    bg.width = canvas.width;
    bg.height = canvas.height;
    const g = bg.getContext('2d')!;
    g.scale(dpr, dpr);
    g.font = '9px Inter, system-ui, sans-serif';
    // grid + ticks
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.fillStyle = '#8f897e';
    g.lineWidth = 1;
    const pTicks = log ? [1, 2, 5, 10, 20, 50] : [0, 10, 20, 30, 40, 50];
    for (const p of pTicks) {
      if (p > pMax * (log ? 1.4 : 1.1)) continue;
      const y = Math.round(Y(Math.max(p, log ? 0.6 : 0))) + 0.5;
      g.beginPath();
      g.moveTo(pad.l, y);
      g.lineTo(w - pad.r, y);
      g.stroke();
      g.textAlign = 'right';
      g.fillText(String(p), pad.l - 5, y + 3);
    }
    const vTicks = log ? [50, 100, 200, 400] : [0, 100, 200, 300, 400];
    for (const v of vTicks) {
      const x = Math.round(X(Math.max(v, log ? vMin * 0.9 : 0))) + 0.5;
      g.beginPath();
      g.moveTo(x, pad.t);
      g.lineTo(x, h - pad.b);
      g.stroke();
      g.textAlign = 'center';
      g.fillText(String(v), x, h - pad.b + 12);
    }
    g.fillStyle = '#b5ad9f';
    g.textAlign = 'right';
    g.fillText('V (cm³)', w - pad.r, h - 3);
    g.save();
    g.translate(9, pad.t + 2);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'right';
    g.fillText('p (bar)', 0, 0);
    g.restore();
    // the loop, coloured by stroke
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    const n = CYCLE.p.length;
    let cur: Stroke | null = null;
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const phi = k * CYCLE_STEP;
      const st = strokeAt(phi);
      const x = X(CYCLE.v[k]!);
      const y = Y(CYCLE.p[k]!);
      if (st !== cur) {
        if (cur) {
          g.lineTo(x, y);
          g.stroke();
        }
        g.strokeStyle = STROKE_COLOR[st];
        g.beginPath();
        g.moveTo(x, y);
        cur = st;
      } else g.lineTo(x, y);
    }
    g.stroke();
    // event markers
    const mark = (phi: number, label: string, dx: number, dy: number) => {
      const k = Math.round(phi / CYCLE_STEP) % n;
      const x = X(CYCLE.v[k]!);
      const y = Y(CYCLE.p[k]!);
      g.fillStyle = '#e9e4da';
      g.beginPath();
      g.arc(x, y, 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b5ad9f';
      g.textAlign = dx < 0 ? 'right' : 'left';
      g.fillText(label, x + dx, y + dy);
    };
    mark(IGNITION_PHI, 'Ateşleme', 6, 3);
    mark(VALVE_EVENTS.exhaust.open, 'EgAA', 5, -4);
    mark(VALVE_EVENTS.intake.close, 'EAK', 5, -5);
  };

  const ro = new ResizeObserver(() => {
    drawBackground();
  });
  ro.observe(el);

  return {
    el,
    setLog(on: boolean) {
      log = on;
      drawBackground();
    },
    update(phi: number) {
      if (!bg) drawBackground();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bg!, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const v = cylinderVolume(phi) / 1000;
      const p = cylinderPressure(phi);
      const x = X(v);
      const y = Y(Math.max(p, 0.6));
      const col = STROKE_COLOR[strokeAt(phi)];
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 11);
      glow.addColorStop(0, col);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6e4';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}
