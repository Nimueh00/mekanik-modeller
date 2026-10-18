import { MAINSPRING } from '../watch/specs';
import { WIND_TURNS_PER_SECOND } from '../watch/watchClock';

/** Seconds on a 12-hour dial. */
export const DIAL_SECONDS = 12 * 3600;

const two = (n: number) => String(n).padStart(2, '0');

/**
 * The time the watch shows as "SS:DD:ss" (hours 1–12, as on a 12-hour dial).
 * `t` is seconds since 12:00:00 and may be huge (days of fast-forward):
 * it is reduced to the dial first, so precision does not depend on its size.
 */
export function formatDialTime(t: number): string {
  const s = Math.floor((((t % DIAL_SECONDS) + DIAL_SECONDS) % DIAL_SECONDS) + 1e-9);
  const h = Math.floor(s / 3600) % 12;
  return `${two(h === 0 ? 12 : h)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** Seconds since 12:00:00 on a 12-hour dial for a wall-clock date (local time). */
export function secondsOnDial(d: Date): number {
  return (d.getHours() % 12) * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
}

/** Power reserve left for a given number of effective mainspring turns. */
export function reserveOf(windTurns: number): { hours: number; fraction: number } {
  const turns = Math.min(MAINSPRING.effectiveTurns, Math.max(0, windTurns));
  return { hours: turns / WIND_TURNS_PER_SECOND / 3600, fraction: turns / MAINSPRING.effectiveTurns };
}

/** "79,9 sa · %100" */
export function formatReserve(windTurns: number): string {
  const { hours, fraction } = reserveOf(windTurns);
  return `${hours.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sa · %${Math.round(fraction * 100)}`;
}

/** Balance amplitude, degrees. */
export function formatAmplitude(deg: number): string {
  return `${Math.round(deg)}°`;
}
