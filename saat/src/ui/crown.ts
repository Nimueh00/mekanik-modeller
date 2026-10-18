import type { CrownPosition } from '../watch/pose';
import { MAINSPRING } from '../watch/specs';
import { WIND_TURNS_PER_SECOND, type WatchClock } from '../watch/watchClock';

/**
 * Logic behind the "Kurma ve ayar" panel section, kept free of the DOM so it
 * can be tested: what the crown buttons and the drag do to the clock, what the
 * panel says about it, and the "Saati boşalt" shortcut. The clock is only
 * ever touched through its public API (setCrownPosition, turnCrown, wind,
 * wrist); the keyless works decide what a turn means in each position.
 */

/** The part of `WatchClock` the crown controls use (lets tests pass a spy). */
export type CrownClock = Pick<WatchClock, 'crownPosition' | 'setCrownPosition' | 'turnCrown' | 'windTurns' | 'wind' | 'wrist' | 'hacked' | 'running'>;

export interface CrownPositionInfo {
  id: CrownPosition;
  label: string;
  title: string;
  /** One line shown under the buttons while the position is selected. */
  hint: string;
}

export const CROWN_POSITIONS: readonly CrownPositionInfo[] = [
  {
    id: 1,
    label: '1 Kurma',
    title: 'Taç içeride: saat yönünde çevirince zemberek kurulur',
    hint: 'Saat yönünde çevirince zemberek kurulur. Ters yönde çevirmek kurmaz: kayar pinyonun dişleri kayar.',
  },
  {
    id: 2,
    label: '2 Tarih',
    title: 'Taç bir kademe çekik: saat yönünde çevirince tarih ilerler',
    hint: 'Saat yönünde çevirince tarih halkası ilerler (192° = 1 gün). Tarih geri gitmez.',
  },
  {
    id: 3,
    label: '3 Saat ayarı',
    title: 'Taç tam çekik: ibreler iki yönde çevrilir, saniye durur',
    hint: 'İbreleri iki yönde çevirir (1 taç turu = 50 dakika). Saniye durdurma (hack) devrede: balans durur.',
  },
];

/** Crown turned by the "◂ Çevir" / "Çevir ▸" buttons while held, degrees per second, by position. */
export const HOLD_DEG_PER_SECOND: Readonly<Record<CrownPosition, number>> = { 1: 720, 2: 360, 3: 240 };

/** A keyboard activation of a turn button (no pointer hold) turns the crown by this much. */
export const NUDGE_DEG = 30;

/** Crown degrees per pixel of dragging the crown in the model. */
export const DRAG_DEG_PER_PX = 2.5;

/** "Saati boşalt" leaves this many hours of reserve: at 1 sa/s the watch stops within a couple of seconds. */
export const DRAIN_RESERVE_HOURS = 2;

/** +1: clockwise seen from the crown (the winding sense), −1: the other way. */
export type CrownDirection = 1 | -1;

/** Frame steps are capped so that a hidden tab does not turn the crown for minutes on return. */
const MAX_HOLD_DT = 0.1;

export function selectCrownPosition(clock: CrownClock, position: CrownPosition): void {
  clock.setCrownPosition(position);
}

/** Hold-turn for one frame; returns the degrees the crown was turned. */
export function holdTurn(clock: CrownClock, direction: CrownDirection, dt: number): number {
  const deg = direction * HOLD_DEG_PER_SECOND[clock.crownPosition] * Math.min(Math.max(dt, 0), MAX_HOLD_DT);
  if (deg !== 0) clock.turnCrown(deg);
  return deg;
}

/** A single press without holding (keyboard): one small turn in the given direction. */
export function nudge(clock: CrownClock, direction: CrownDirection): number {
  const deg = direction * NUDGE_DEG;
  clock.turnCrown(deg);
  return deg;
}

/**
 * Crown rotation for a pointer drag of `delta` pixels, where `axis` is the
 * unit screen direction in which the crown's surface moves for a turn against
 * the winding sense (dragging along it turns the crown backwards).
 */
export function dragDegrees(delta: readonly [number, number], axis: readonly [number, number]): number {
  return -DRAG_DEG_PER_PX * (delta[0] * axis[0] + delta[1] * axis[1]);
}

/**
 * What to tell the user when the crown is turned a way that does nothing in
 * the current position, or null when the turn has an effect.
 */
export function ineffectiveTurnNote(position: CrownPosition, direction: CrownDirection): string | null {
  if (direction > 0) return null;
  if (position === 1) return 'Ters yön kurmaz: kayar pinyonun dişleri kayar, zemberek boşalmaz.';
  if (position === 2) return 'Tarih geri gitmez: yıldızın parmakları atlama yayının üstünden kayar.';
  return null;
}

/** State of the seconds hand for the panel readout. */
export function secondsState(clock: Pick<CrownClock, 'hacked' | 'running'>): { stopped: boolean; text: string } {
  if (clock.hacked) return { stopped: true, text: 'Saniye durduruldu' };
  if (!clock.running) return { stopped: true, text: 'Durdu (rezerv bitti)' };
  return { stopped: false, text: 'Çalışıyor' };
}

/** Reserve (hours) the drain leaves in the spring, as mainspring turns. */
export const DRAIN_TURNS = DRAIN_RESERVE_HOURS * 3600 * WIND_TURNS_PER_SECOND;

/** "Saati boşalt": take the spring down to `DRAIN_RESERVE_HOURS` (never above what it has). */
export function drain(clock: Pick<CrownClock, 'windTurns' | 'wind'>): void {
  const excess = clock.windTurns - DRAIN_TURNS;
  if (excess > 0) clock.wind(-excess);
}

/** Turn the wrist motion on or off (the rotor swings and winds while it is on). */
export function setWrist(clock: Pick<CrownClock, 'wrist'>, on: boolean): void {
  clock.wrist.enabled = on;
}

/** Share of a full spring, 0–1. */
export const reserveFraction = (windTurns: number): number => Math.min(1, Math.max(0, windTurns / MAINSPRING.effectiveTurns));
