import { AXES, ESCAPE_DEG_PER_BEAT, ESCAPEMENT, type P2, PALLETS, TRAIN } from '../specs';
import { angleY, rotY } from './watchGear';

/**
 * Swiss lever escapement in the plane of the escape wheel (plan, mm).
 *
 * Layout (P1): pallet pivot O at d = R / cos 30° from the escape arbor E (R =
 * tip radius), the stones 2½ teeth (60°) apart. The locking corners of the
 * teeth lie on the locking circle RL, the heels of the clubs on the tip
 * circle; each pallet locks at its locking point L, 30° either side of the
 * line of centres, so the two locks are exactly half a pitch apart. At L the
 * tooth moves almost straight towards (entry pallet) or away from (exit
 * pallet) O, so the lock exerts almost no torque on the lever.
 *
 * The motion comes first, the shapes follow from it. Lever and wheel are
 * related by a piecewise-linear map per beat (`escapeOffset`): locked while
 * the lever travels the starting pallet's lock, then the impulse, divided: for
 * the first `palletShare` of the wheel's step the tooth's locking corner K
 * slides over the stone's impulse face, then the stone's let-off corner C2
 * slides over the tooth's club; then locked by the other pallet. Each face is
 * the path the other part's corner traces in its frame (a conjugate pair), so
 * the two stay in contact without interference.
 *
 * Entry and exit stones differ: the entry stone's let-off corner is nearer
 * the pallet pivot than the exit stone's, so it moves less per degree of
 * lever. Both must ride over the same club, so the club phase takes less
 * lever on the exit pallet; the two locks are then solved so that the wheel
 * is exactly half-way on the line of centres in both beats (P1 centres every
 * beat on the balance's zero crossing). The locking circle is chosen so that
 * the heels land on the tip circle.
 *
 * Drop: with the lock at the start of the swing taking lever angle but no
 * wheel motion, centring the beat leaves nothing for a drop with plane-like
 * impulse faces: the next tooth reaches the other pallet's locking face just
 * as the heel leaves the first one (drop = 0); the lock then deepens during
 * the run to the banking. Locking faces have no draw: draw would need the
 * wheel to recoil while unlocking, and the escape progress is monotonic.
 */

const DEG = Math.PI / 180;

/** Escape wheel turns positively about +Y (train.ts; checked in tests). */
const FORWARD = 1;

/** Tip circle: through the heels of the clubs. */
const R = TRAIN.escape.wheel.tipDiameter / 2;
const PITCH = 360 / TRAIN.escape.wheel.teeth;
/** Pallet pivot relative to the escape arbor. */
const O: P2 = [AXES.pallet[0] - AXES.escape[0], AXES.pallet[1] - AXES.escape[1]];
const HALF_SPAN = (ESCAPEMENT.palletSpanTeeth * PITCH) / 2;

const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const unit = (a: P2): P2 => mul(a, 1 / len(a));
/** d/dα rotY(v, α) at α = 0, per radian. */
const turn = (v: P2): P2 => [v[1], -v[0]];
const about = (p: P2, c: P2, deg: number): P2 => add(c, rotY(sub(p, c), deg));
const wrap360 = (a: number) => ((a % 360) + 360) % 360;

// ---------------------------------------------------------------- lever

const HALF_LIFT = ESCAPEMENT.liftAngleDeg / 2;

/**
 * Exact pin-in-slot relation, signs aside: the lever angle at which the fork
 * slot (a line through the pallet pivot) passes through the impulse pin when
 * the balance is `thetaDeg` from the line of centres.
 *   pin, seen from the pallet pivot = (D − r·cosθ, r·sinθ)
 */
export function slotAngle(thetaDeg: number): number {
  const r = ESCAPEMENT.impulsePinRadius;
  const t = thetaDeg * DEG;
  return Math.atan2(r * Math.sin(t), ESCAPEMENT.palletToBalance - r * Math.cos(t)) / DEG;
}

/** Lever angle at either banking: where the slot leaves the pin at the edge of the lift. */
export const BANKING_DEG = slotAngle(HALF_LIFT);

// ---------------------------------------------------------------- one beat

/**
 * Piecewise-linear lever → wheel map of one beat, by progress p ∈ [0, 1]
 * (p = 0 on the starting banking): knots and escape offsets (beats).
 */
interface BeatMap {
  p: number[];
  offset: number[];
}

/** Lever angle at progress p of a beat starting on the banking σ·B. */
const leverAt = (sigma: 1 | -1, p: number) => sigma * BANKING_DEG * (1 - 2 * p);
const progressOf = (sigma: 1 | -1, lever: number) => Math.min(1, Math.max(0, (1 - (sigma * lever) / BANKING_DEG) / 2));

function interpolate(m: BeatMap, p: number): number {
  let i = 1;
  while (i < m.p.length - 1 && m.p[i]! < p) i++;
  const p0 = m.p[i - 1]!;
  const p1 = m.p[i]!;
  if (p <= p0) return m.offset[i - 1]!;
  if (p >= p1) return m.offset[i]!;
  return m.offset[i - 1]! + ((m.offset[i]! - m.offset[i - 1]!) * (p - p0)) / (p1 - p0);
}

/**
 * Beat map from the lever angles (degrees) of the starting pallet's lock, the
 * starting pallet's club phase and the ending pallet's lock. The pallet
 * phase takes `palletShare` of the step; p = ½ (lever on the line of centres)
 * is a knot with offset exactly 0 when the locks are centred (see `centredLocks`).
 */
function beatMap(lockStart: number, club: number, lockEnd: number): BeatMap {
  const B2 = 2 * BANKING_DEG;
  const pu = lockStart / B2;
  const pr = 1 - lockEnd / B2;
  const ps = pr - club / B2;
  const chi = PALLETS.palletShare;
  if (!(pu < 0.5 && 0.5 < ps && ps < pr)) throw new Error('escapement: the impulse must straddle the line of centres');
  // centred locks put the line of centres exactly half-way: that knot is 0 up to rounding, and is written as 0
  if (Math.abs(-0.5 + (chi * (0.5 - pu)) / (ps - pu)) > 1e-9) throw new Error('escapement: beat not centred');
  return { p: [0, pu, 0.5, ps, pr, 1], offset: [-0.5, -0.5, 0, -0.5 + chi, 0.5, 0.5] };
}

/** Escape wheel step per beat, degrees. */
const STEP = ESCAPE_DEG_PER_BEAT;

interface Pallet {
  sigma: 1 | -1;
  entry: boolean;
  /** Wheel angle at which tooth 0's locking corner is at the locking point. */
  psiLock: number;
  /** Lever-frame corners (lever angle 0, relative to the escape arbor): locking corner and let-off corner. */
  C1: P2;
  C2: P2;
  /** Impulse face C1 → C2, lever frame. */
  face: P2[];
  /** Club traced by C2, tooth-0 frame, K → heel. */
  club: P2[];
  /** Where the locked tooth's corner sits on the locking face with the lever on its banking (lever frame). */
  Kbank: P2;
}

const SAMPLES = 24;

/**
 * Trace one pallet (on side ±1 of the line of centres) through the beat it
 * starts: its impulse face is the path of the tooth's locking corner seen
 * from the lever (pallet phase), the club the path of its let-off corner seen
 * from the wheel (club phase).
 */
function tracePallet(RL: number, side: 1 | -1, map: (sigma: 1 | -1) => BeatMap): Pallet {
  const L = rotY(mul(unit(O), RL), side * HALF_SPAN);
  // the stone at L is driven into the wheel by lever angles of sign σ: it is locked on that banking
  const sigma: 1 | -1 = dot(turn(sub(L, O)), mul(L, -1)) > 0 ? 1 : -1;
  const entry = dot(turn(L), sub(O, L)) * FORWARD > 0; // tooth at L moves towards O
  const m = map(sigma);
  const [, pu, , ps, pr] = m.p as [number, number, number, number, number, number];
  const K0: P2 = [RL, 0];
  const psiLock = angleY(L);
  const wheel = (p: number) => psiLock + FORWARD * STEP * (interpolate(m, p) + 0.5);
  const face: P2[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const p = pu + ((ps - pu) * i) / SAMPLES;
    face.push(about(rotY(K0, wheel(p)), O, -leverAt(sigma, p)));
  }
  const C1 = face[0]!;
  const C2 = face[face.length - 1]!;
  const club: P2[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const p = ps + ((pr - ps) * i) / SAMPLES;
    club.push(rotY(about(C2, O, leverAt(sigma, p)), -wheel(p)));
  }
  return { sigma, entry, psiLock, C1, C2, face, club, Kbank: about(L, O, -leverAt(sigma, 0)) };
}

/**
 * Locks that centre both beats: with the impulse lever I = 2B − ΛA − ΛB and the
 * starting pallet's club phase c, the pallet phase covers `palletShare` of the
 * step over I − c, and the wheel is half-way at the line of centres when
 * B − Λstart = (I − c) / (2·share). With the mean lock fixed this gives
 * I = (cA + cB) / (2 − 2·share), hence both locks.
 */
function centredLocks(clubA: number, clubB: number): { A: number; B: number } {
  const chi = PALLETS.palletShare;
  const I = (clubA + clubB) / (2 - 2 * chi);
  return { A: BANKING_DEG - (I - clubA) / (2 * chi), B: BANKING_DEG - (I - clubB) / (2 * chi) };
}

/** Total club-phase lever of both beats, from the mean lock. */
const CLUB_TOTAL = 2 * (2 * BANKING_DEG - 2 * PALLETS.lockDeg) * (1 - PALLETS.palletShare);

interface Solution {
  RL: number;
  clubA: number;
  clubB: number;
  maps: { even: BeatMap; odd: BeatMap };
  A: Pallet;
  B: Pallet;
}

/** Trace both pallets for a locking radius and the + banking pallet's share of the club lever. */
function trial(RL: number, clubA: number): Solution {
  const clubB = CLUB_TOTAL - clubA;
  const lock = centredLocks(clubA, clubB);
  const maps = { even: beatMap(lock.A, clubA, lock.B), odd: beatMap(lock.B, clubB, lock.A) };
  const map = (sigma: 1 | -1) => (sigma === 1 ? maps.even : maps.odd);
  const p1 = tracePallet(RL, 1, map);
  const p2 = tracePallet(RL, -1, map);
  const A = p1.sigma === 1 ? p1 : p2;
  return { RL, clubA, clubB, maps, A, B: A === p1 ? p2 : p1 };
}

/** Heel radius of a traced club once relieved. */
const heel = (p: Pallet) => p.club[0]![0] + PALLETS.clubRelief * (len(p.club[p.club.length - 1]!) - p.club[0]![0]);

/** Split the club lever so that both pallets lift the heel equally. */
function balanceClubs(RL: number): Solution {
  let lo = 0.05 * CLUB_TOTAL;
  let hi = 0.95 * CLUB_TOTAL;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const s = trial(RL, mid);
    // a longer club phase on pallet A lifts its heel higher
    if (heel(s.A) > heel(s.B)) hi = mid;
    else lo = mid;
  }
  return trial(RL, (lo + hi) / 2);
}

/** Locking circle that puts the heels on the tip circle. */
function solve(): Solution {
  let lo = R - 0.3;
  let hi = R;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (heel(balanceClubs(mid).A) > R) hi = mid;
    else lo = mid;
  }
  return balanceClubs(lo);
}

const SOLUTION = solve();
const RL = SOLUTION.RL;
/** Locked on the + banking: starts the even beats. */
const PAL_A = SOLUTION.A;
const PAL_B = SOLUTION.B;

/**
 * The club both pallets ride on: of the two traced clubs (equal up to
 * second-order terms) take, point by point, the one nearer the wheel's
 * centre, so neither stone can be pushed into it, and relieve its rise above
 * the locking circle by `clubRelief`. Without the relief the club, rising
 * behind the locking corner, would brush the entry stone's impulse face that
 * the corner has just slid over (the entry stone's let-off corner is nearer
 * the pallet pivot, so its club is steeper than its impulse face).
 */
const CLUB: readonly P2[] = PAL_A.club.map((a, i) => {
  const b = PAL_B.club[i]!;
  const c = len(a) <= len(b) ? a : b;
  return mul(c, (RL + PALLETS.clubRelief * (len(c) - RL)) / len(c));
});

/**
 * Escape progress within a beat (beats, −½ … ½) for a lever angle, the balance
 * swinging in direction σ (+1: lever running from +banking to −banking).
 * Locked for the starting pallet's lock, linear through the pallet phase and
 * the club phase, locked again by the other pallet for the run. Exactly 0 on
 * the line of centres. The one map shared by the train and the drawing.
 */
export function escapeOffset(leverDeg: number, sigma: 1 | -1): number {
  return interpolate(sigma === 1 ? SOLUTION.maps.even : SOLUTION.maps.odd, progressOf(sigma, leverDeg));
}

// ---------------------------------------------------------------- escape wheel

function escapeTooth(): P2[] {
  const T = PALLETS.teeth;
  const rRoot = R - T.depth;
  const at = (r: number, a: number): P2 => rotY([r, 0], a);
  const K: P2 = [RL, 0];
  // locking face: inward, leaning backwards from the corner
  const lean = T.lockingLeanDeg * DEG;
  const f: P2 = [-Math.cos(lean), FORWARD * Math.sin(lean)];
  const rF = rRoot + T.rootFillet;
  const b = dot(K, f);
  const F = add(K, mul(f, -b - Math.sqrt(b * b - (RL * RL - rF * rF))));
  const H = CLUB[CLUB.length - 1]!;
  const aH = angleY(H);
  // concave back: quadratic Bézier from the heel down to the root
  const aBack = -FORWARD * T.backAngleDeg;
  const Bk = at(rRoot + T.rootFillet, aBack);
  const Q = at(rRoot + T.backBulge, aH - FORWARD * 3);
  const back: P2[] = [];
  for (let i = 1; i <= 6; i++) {
    const u = i / 6;
    const w0 = (1 - u) * (1 - u);
    const w1 = 2 * u * (1 - u);
    const w2 = u * u;
    back.push([w0 * H[0] + w1 * Q[0] + w2 * Bk[0], w0 * H[1] + w1 * Q[1] + w2 * Bk[1]]);
  }
  const aEnd = angleY(F) - FORWARD * PITCH;
  const root: P2[] = [];
  for (let i = 1; i < 4; i++) root.push(at(rRoot, aBack + ((aEnd - aBack) * i) / 4));
  return [F, ...CLUB, ...back, ...root];
}

const TOOTH = escapeTooth();

/**
 * Club-tooth escape wheel outline: centred on its arbor, tooth 0's locking
 * corner on local angle 0, walked rearwards tooth by tooth.
 */
export const ESCAPE_WHEEL_OUTLINE: readonly P2[] = (() => {
  const out: P2[] = [];
  for (let k = 0; k < TRAIN.escape.wheel.teeth; k++) for (const p of TOOTH) out.push(rotY(p, -FORWARD * k * PITCH));
  return out;
})();

/**
 * Per-tooth layout of ESCAPE_WHEEL_OUTLINE: `points` per tooth; within a tooth
 * the locking face runs from index 0 (its root) to `corner` (the locking
 * corner K), the club from `corner` to `heel`.
 */
export const ESCAPE_TOOTH = { points: TOOTH.length, corner: 1, heel: CLUB.length } as const;

// ---------------------------------------------------------------- pallet stones

export type PalletName = 'entry' | 'exit';

/**
 * Stone outline in the lever frame at lever angle 0, relative to the escape
 * arbor: C1, the impulse face to C2, the inner side parallel to the locking
 * face out to the back end, and the locking face back to C1.
 */
function stoneOutline(pal: Pallet): P2[] {
  // Straight locking face through C1 and the banking position of the locked
  // corner: the chord of the corner's arc about O, so the corner never leaves
  // it by more than the sagitta (≈ 0.3 µm). Perpendicular to O→face: no draw.
  let dirOut = unit(sub(pal.Kbank, pal.C1));
  if (dot(dirOut, pal.C1) < 0) dirOut = mul(dirOut, -1); // away from the wheel
  const C1b = add(pal.C1, mul(dirOut, PALLETS.stoneLength));
  const C2b = add(pal.C2, mul(dirOut, dot(sub(C1b, pal.C2), dirOut)));
  return [...pal.face, C2b, C1b];
}

const PALLET_OF: Record<PalletName, Pallet> = PAL_A.entry
  ? { entry: PAL_A, exit: PAL_B }
  : { entry: PAL_B, exit: PAL_A };

/** Stones at lever angle 0, relative to the escape arbor. */
const STONES: Record<PalletName, P2[]> = { entry: stoneOutline(PALLET_OF.entry), exit: stoneOutline(PALLET_OF.exit) };

/**
 * Per-stone layout of the stone outlines: the impulse face runs from index 0
 * (C1, the locking corner) to `letOff` (C2); the locking face from the last
 * point back to index 0.
 */
export const STONE = { letOff: SAMPLES } as const;

/** Stone polygons at lever angle λ, relative to the escape arbor. */
export function stonesAt(leverDeg: number): Record<PalletName, P2[]> {
  const at = (s: readonly P2[]) => s.map((p) => about(p, O, leverDeg));
  return { entry: at(STONES.entry), exit: at(STONES.exit) };
}

/** Pallet stones relative to the pallet arbor (lever frame, lever angle 0). */
export function stonesOnLever(): Record<PalletName, P2[]> {
  const local = (s: readonly P2[]) => s.map((p) => sub(p, O));
  return { entry: local(STONES.entry), exit: local(STONES.exit) };
}

/**
 * Escape wheel phase on its arbor (degrees about +Y): beat 0 starts locked on
 * the + banking's pallet at escape position −½ beat (train angle −6°).
 */
export const ESCAPE_WHEEL_PHASE = wrap360(PAL_A.psiLock + (FORWARD * ESCAPE_DEG_PER_BEAT) / 2);

const phases = (m: BeatMap) => ({
  lock: m.p[1]! * 2 * BANKING_DEG,
  pallet: (m.p[3]! - m.p[1]!) * 2 * BANKING_DEG,
  club: (m.p[4]! - m.p[3]!) * 2 * BANKING_DEG,
});

const widthOf = (p: Pallet) => Math.abs(dot(sub(p.C2, p.C1), unit(sub(p.C1, O))));

/** Derived dimensions, for drawing, tests and the report. */
export const ESCAPE_GEOMETRY = {
  /** Pallet pivot relative to the escape arbor. */
  O,
  tipRadius: R,
  lockRadius: RL,
  /** Width of each stone (C2's distance from its locking face), mm. */
  stoneWidth: { entry: widthOf(PALLET_OF.entry), exit: widthOf(PALLET_OF.exit) },
  /** How much deeper the let-off corner reaches into the wheel than the locking corner, mm. */
  palletLift: {
    entry: len(PALLET_OF.entry.C1) - len(PALLET_OF.entry.C2),
    exit: len(PALLET_OF.exit.C1) - len(PALLET_OF.exit.C2),
  },
  /** Club: angular width and rise from the locking circle to the heel. */
  clubWidthDeg: Math.abs(angleY(CLUB[CLUB.length - 1]!)),
  clubLift: len(CLUB[CLUB.length - 1]!) - RL,
  /** Lever angles (degrees) of each pallet's lock (incl. run), pallet phase and club phase in the beat it starts. */
  lever: {
    [PAL_A.entry ? 'entry' : 'exit']: phases(SOLUTION.maps.even),
    [PAL_B.entry ? 'entry' : 'exit']: phases(SOLUTION.maps.odd),
  } as Record<PalletName, { lock: number; pallet: number; club: number }>,
  /** Pallet locked on the + banking (it starts the even beats). */
  plusBanking: (PAL_A.entry ? 'entry' : 'exit') as PalletName,
  /** Largest radial difference between the clubs traced by the two pallets, mm. */
  clubMismatch: Math.max(...PAL_A.club.map((a, i) => Math.abs(len(a) - len(PAL_B.club[i]!)))),
} as const;
