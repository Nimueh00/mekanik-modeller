import { pistonDrop } from './kinematics';
import { SPECS } from './specs';
import { VALVE_EVENTS } from './timing';

/*
 * Simplified single-zone Otto cycle for one cylinder, as a function of the
 * cycle angle φ (0 = firing TDC, 0–720°; see timing.ts).
 *
 * Assumptions (all stated so the numbers can be checked by hand):
 *   1. Volume from the exact slider-crank:  V(φ) = V_c + (π/4)·b²·x(φ),
 *      x = pistonDrop(φ) = (r + l) − (r·cosφ + √(l² − r²·sin²φ)),
 *      V_c = V_d / (ε − 1) with ε = 10.5 (the specified ratio, so
 *      V(BDC)/V(TDC) is exactly ε; the modelled chamber measures 10.49).
 *   2. Gas exchange is quasi-static at constant pressure: intake p_in ≈ 1 bar
 *      (wide-open throttle, small manifold depression), exhaust p_ex ≈ 1 bar
 *      (slight back-pressure). Valve flow dynamics are not modelled.
 *   3. Closed part (IVC → EVO): first law for an ideal gas with a polytropic
 *      exponent n = 1.3 instead of γ, which lumps the wall heat loss into the
 *      exponent (Heywood, "Internal Combustion Engine Fundamentals", §9.2,
 *      single-zone heat-release model):
 *          dp/dφ = (n − 1)/V · dQ/dφ − n · p/V · dV/dφ
 *      With dQ = 0 this is exactly p·Vⁿ = const (compression, expansion).
 *   4. Heat release by a Wiebe function (Heywood eq. 9.23):
 *          x_b(φ) = 1 − exp(−a·((φ − φ_s)/Δφ)^(m+1)),  a = 5, m = 2,
 *      start φ_s = −15° (the fixed 15° spark advance), duration Δφ = 55°.
 *      Q_total = m_f · Q_LHV · η_c with the trapped air mass from the ideal-gas
 *      law at IVC, stoichiometric AFR 14.7, Q_LHV = 44 MJ/kg, η_c = 0.95, and
 *      a volumetric efficiency of 0.85. No residual gas, no dissociation.
 *   5. Blowdown (EVO → 40° after BDC): pressure falls smoothly to p_ex
 *      (cosine-shaped), then stays at p_ex until EVC; through the 20° of valve
 *      overlap it blends to p_in. Intake stays at p_in until IVC.
 *   6. Temperature is reported as T = p·V / (m·R) for the trapped mass
 *      (closed part) and as a mixing estimate during gas exchange; it is only
 *      used to colour the flame and burnt gas.
 *
 * The cycle is tabulated once at 0.25° and interpolated. Because the table is
 * indexed by φ on a 720° period and the closed-part integration runs straight
 * through φ = 720 ≡ 0, the P-V loop is closed by construction (tested).
 */

export const THERMO = {
  pIntake: 0.98, // bar
  pExhaust: 1.05, // bar
  tIntake: 320, // K, charge temperature at IVC
  polytropic: 1.3,
  wiebeA: 5,
  wiebeM: 2,
  sparkAdvanceDeg: 15,
  burnDurationDeg: 55,
  volumetricEfficiency: 0.85,
  afr: 14.7,
  lhv: 44e6, // J/kg
  combustionEfficiency: 0.95,
  gasConstant: 287, // J/(kg·K)
  /** Blowdown ends this many degrees after BDC. */
  blowdownEndAbdc: 40,
} as const;

/** Piston area (mm²), swept volume and clearance volume (mm³). */
export const PISTON_AREA = (Math.PI / 4) * SPECS.bore * SPECS.bore;
export const SWEPT_VOLUME = PISTON_AREA * SPECS.stroke;
export const CLEARANCE_VOLUME = SWEPT_VOLUME / (SPECS.compressionRatio - 1);

/** Cycle angle of ignition (705°, i.e. 15° before firing TDC). */
export const IGNITION_PHI = 720 - THERMO.sparkAdvanceDeg;

/** Cylinder volume in mm³ at cycle angle φ (exact slider-crank). */
export function cylinderVolume(phiDeg: number): number {
  return CLEARANCE_VOLUME + PISTON_AREA * pistonDrop(((phiDeg % 360) + 360) % 360);
}

/** dV/dφ in mm³ per degree (central difference of the exact volume). */
export function volumeRate(phiDeg: number): number {
  const h = 0.05;
  return (cylinderVolume(phiDeg + h) - cylinderVolume(phiDeg - h)) / (2 * h);
}

/** Wiebe mass fraction burned for a cycle angle measured from firing TDC (may be negative, e.g. −15). */
export function burnFraction(phiFromTdc: number): number {
  const u = (phiFromTdc + THERMO.sparkAdvanceDeg) / THERMO.burnDurationDeg;
  if (u <= 0) return 0;
  return 1 - Math.exp(-THERMO.wiebeA * Math.pow(u, THERMO.wiebeM + 1));
}

/** Signed angle from firing TDC in (−360, 360]: 705 → −15, 30 → 30. */
export function fromFiringTdc(phiDeg: number): number {
  const w = ((phiDeg % 720) + 720) % 720;
  return w > 360 ? w - 720 : w;
}

const STEP = 0.25;
const N = 720 / STEP;

export interface CycleTable {
  /** Pressure in bar, index i ↔ φ = i·STEP. */
  p: Float64Array;
  /** Volume in cm³. */
  v: Float64Array;
  /** Gas temperature estimate in K. */
  t: Float64Array;
  /** Total heat released per cycle (J). */
  heat: number;
  /** Trapped mass (kg). */
  mass: number;
  peakPressure: number;
  peakPressurePhi: number;
  /** Net indicated work per cycle (J), ∮ p dV. */
  work: number;
}

function buildTable(): CycleTable {
  const T = THERMO;
  const n = T.polytropic;
  const ivc = VALVE_EVENTS.intake.close; // 590
  const evo = VALVE_EVENTS.exhaust.open; // 130
  const evc = VALVE_EVENTS.exhaust.close; // 370
  const ivo = VALVE_EVENTS.intake.open; // 350
  const blowEnd = 180 + T.blowdownEndAbdc;

  const p = new Float64Array(N);
  const v = new Float64Array(N);
  const t = new Float64Array(N);
  for (let i = 0; i < N; i++) v[i] = cylinderVolume(i * STEP) / 1000;

  // trapped charge: m_air = η_v · ρ_in · V_d (ideal gas at intake conditions)
  const massAir = T.volumetricEfficiency * ((T.pIntake * 1e5) / (T.gasConstant * T.tIntake)) * SWEPT_VOLUME * 1e-9;
  const heat = (massAir / T.afr) * T.lhv * T.combustionEfficiency;
  const trapped = massAir * (1 + 1 / T.afr);

  // closed part: integrate from IVC through 720 ≡ 0 to EVO (+720) with RK4 in φ
  const h = 0.025; // degrees
  const dpdphi = (phi: number, pPa: number): number => {
    const V = cylinderVolume(phi) * 1e-9; // m³
    const dV = volumeRate(phi) * 1e-9;
    const a = phi - 720; // angle from firing TDC
    const dx = (burnFraction(a + h * 0.5) - burnFraction(a - h * 0.5)) / h;
    return ((n - 1) / V) * heat * dx - (n * pPa * dV) / V;
  };
  // pressure at IVC: start compression from the intake pressure
  let pPa = T.pIntake * 1e5;
  const closed = new Map<number, number>(); // table index → bar
  const end = 720 + evo;
  let phi = ivc;
  const record = (ph: number, val: number) => {
    const k = Math.round(ph / STEP);
    if (Math.abs(k * STEP - ph) < 1e-6) closed.set(k % N, val / 1e5);
  };
  record(phi, pPa);
  while (phi < end - 1e-9) {
    const k1 = dpdphi(phi, pPa);
    const k2 = dpdphi(phi + h / 2, pPa + (h / 2) * k1);
    const k3 = dpdphi(phi + h / 2, pPa + (h / 2) * k2);
    const k4 = dpdphi(phi + h, pPa + h * k3);
    pPa += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    phi = Math.round((phi + h) * 1000) / 1000;
    record(phi, pPa);
  }
  const pEvo = closed.get(Math.round(evo / STEP))!;

  for (let i = 0; i < N; i++) {
    const ph = i * STEP;
    const c = closed.get(i);
    if (c !== undefined && (ph >= ivc || ph <= evo)) {
      p[i] = c;
    } else if (ph > evo && ph < blowEnd) {
      const s = (ph - evo) / (blowEnd - evo);
      p[i] = T.pExhaust + (pEvo - T.pExhaust) * 0.5 * (1 + Math.cos(Math.PI * s));
    } else if (ph >= blowEnd && ph < ivo) {
      p[i] = T.pExhaust;
    } else if (ph >= ivo && ph < evc) {
      const s = (ph - ivo) / (evc - ivo);
      p[i] = T.pExhaust + (T.pIntake - T.pExhaust) * (0.5 - 0.5 * Math.cos(Math.PI * s));
    } else {
      p[i] = T.pIntake;
    }
  }

  // temperature: closed part from the ideal-gas law, gas exchange by blending
  const R = T.gasConstant;
  let tEvo = 0;
  for (let i = 0; i < N; i++) {
    const ph = i * STEP;
    const tc = (p[i]! * 1e5 * v[i]! * 1e-6) / (trapped * R);
    if (ph >= ivc || ph <= evo) {
      t[i] = tc;
      if (Math.abs(ph - evo) < 1e-9) tEvo = tc;
    }
  }
  const tExhaust = 900;
  for (let i = 0; i < N; i++) {
    const ph = i * STEP;
    if (ph > evo && ph < ivo) {
      const s = Math.min(1, (ph - evo) / (blowEnd - evo));
      t[i] = tEvo + (tExhaust - tEvo) * s;
    } else if (ph >= ivo && ph < ivc) {
      const s = Math.min(1, (ph - ivo) / 60);
      t[i] = tExhaust + (T.tIntake - tExhaust) * s;
    }
  }

  let peak = 0;
  let peakPhi = 0;
  let work = 0;
  for (let i = 0; i < N; i++) {
    if (p[i]! > peak) {
      peak = p[i]!;
      peakPhi = i * STEP;
    }
    const j = (i + 1) % N;
    // trapezoid, bar·cm³ → J: 1e5 Pa · 1e-6 m³ = 0.1 J
    work += 0.5 * (p[i]! + p[j]!) * (v[j]! - v[i]!) * 0.1;
  }
  return { p, v, t, heat, mass: trapped, peakPressure: peak, peakPressurePhi: peakPhi, work };
}

export const CYCLE: CycleTable = buildTable();

function sample(arr: Float64Array, phiDeg: number): number {
  const w = ((phiDeg % 720) + 720) % 720;
  const f = w / STEP;
  const i = Math.floor(f);
  const a = arr[i % N]!;
  const b = arr[(i + 1) % N]!;
  return a + (b - a) * (f - i);
}

/** Cylinder pressure in bar at cycle angle φ. */
export function cylinderPressure(phiDeg: number): number {
  return sample(CYCLE.p, phiDeg);
}

/** Gas temperature estimate in K at cycle angle φ. */
export function gasTemperature(phiDeg: number): number {
  return sample(CYCLE.t, phiDeg);
}

/** Table resolution in degrees (for consumers that iterate the loop). */
export const CYCLE_STEP = STEP;

/** Mean piston speed is 2·s·n; instantaneous piston speed in m/s (positive = moving down). */
export function pistonSpeed(phiDeg: number, rpm: number): number {
  const h = 0.05;
  const dxdphi = (pistonDrop(((phiDeg + h) % 360 + 360) % 360) - pistonDrop(((phiDeg - h) % 360 + 360) % 360)) / (2 * h); // mm/deg
  const degPerSec = rpm * 6;
  return (dxdphi * degPerSec) / 1000;
}
