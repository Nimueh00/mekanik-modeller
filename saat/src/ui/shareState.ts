import type { StateMap } from '../core/urlState';
import { TIME_SCALES } from '../watch/watchClock';
import type { WatchView } from './ghost';

/**
 * The shareable part of the view as hash keys (`#a=0.5&cam=…&p=balance&v=ghost&s=3&t=…`).
 * `encodeShare` and `decodeShare` are the two directions of the same mapping and
 * know nothing of the app; `decodeShare` never trusts what it is given: a value
 * that is missing, not a number, out of range or not a known id comes back as
 * `null` (or the default view), and the rest of the state is still applied.
 *
 *   a    disassembly amount, 0–1 (left out when closed)
 *   cam  camera position and target, six numbers
 *   p    selected part id
 *   v    `ghost` (left out for the solid view)
 *   s    speed, an index into TIME_SCALES (left out at real speed)
 *   t    the clock's time in seconds, written only while paused
 */

export const DEFAULT_SPEED_INDEX = TIME_SCALES.indexOf(1);

export interface ShareView {
  open: number;
  camera: readonly number[];
  part: string | null;
  view: WatchView;
  /** Index into TIME_SCALES. */
  speed: number;
  /** Clock time in seconds when paused. */
  pausedAt: number | null;
}

export interface DecodedShare {
  open: number | null;
  camera: [number, number, number, number, number, number] | null;
  part: string | null;
  view: WatchView | null;
  speed: number | null;
  pausedAt: number | null;
}

const OPEN_EPS = 0.0005;
/** Camera coordinates beyond this (scene units) are not a camera anyone set. */
const CAMERA_LIMIT = 1e5;
/** Largest clock time accepted: a few thousand days of fast-forward. */
const TIME_LIMIT = 1e9;

export function encodeShare(s: ShareView): StateMap {
  const out: StateMap = {};
  if (s.open > OPEN_EPS) out.a = s.open.toFixed(3);
  out.cam = s.camera.map((v) => String(Math.round(v))).join(',');
  if (s.part) out.p = s.part;
  if (s.view !== 'solid') out.v = s.view;
  if (s.speed !== DEFAULT_SPEED_INDEX) out.s = String(s.speed);
  if (s.pausedAt !== null) out.t = s.pausedAt.toFixed(2);
  return out;
}

/** A finite number from a hash value; an empty or blank value is not 0. */
function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function decodeShare(st: StateMap, knownParts: ReadonlySet<string>): DecodedShare {
  const a = num(st.a);
  const cam = (st.cam ?? '').split(',').map(num);
  const camera = cam.length === 6 && cam.every((v) => v !== null && Math.abs(v) <= CAMERA_LIMIT) ? (cam as DecodedShare['camera']) : null;
  const s = num(st.s);
  const t = num(st.t);
  return {
    open: a === null ? null : Math.min(1, Math.max(0, a)),
    camera,
    part: st.p !== undefined && knownParts.has(st.p) ? st.p : null,
    view: st.v === 'ghost' || st.v === 'solid' ? st.v : null,
    speed: s !== null && Number.isInteger(s) && s >= 0 && s < TIME_SCALES.length ? s : null,
    pausedAt: t !== null && t >= 0 && t <= TIME_LIMIT ? t : null,
  };
}
