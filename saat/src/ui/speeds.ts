import { TIME_SCALES } from '../watch/watchClock';

export interface SpeedOption {
  /** One of TIME_SCALES. */
  scale: number;
  label: string;
  title: string;
}

/** Labels for the presentation speeds, keyed by scale; a scale without one falls back to "N×". */
const LABELS: Record<number, [string, string]> = {
  [1 / 50]: ['1/50 yavaş', 'Elli kat yavaş çekim: tek bir vuruşu bile izleyebilirsiniz'],
  [1 / 10]: ['1/10 yavaş', 'On kat yavaş çekim'],
  [1]: ['Gerçek', 'Gerçek hız: saniyede 6 vuruş'],
  [60]: ['1 dk/s', 'Saniyede bir dakika (60×)'],
  [600]: ['10 dk/s', 'Saniyede on dakika (600×)'],
  [3600]: ['1 sa/s', 'Saniyede bir saat (3600×)'],
};

/** One button per entry of TIME_SCALES, in the same order. */
export const SPEED_OPTIONS: readonly SpeedOption[] = TIME_SCALES.map((scale) => {
  const [label, title] = LABELS[scale] ?? [`${scale}×`, `${scale} kat hız`];
  return { scale, label, title };
});

/** Button index for the current time scale, or −1 when it is not one of the presets. */
export function speedIndex(timeScale: number): number {
  return TIME_SCALES.findIndex((s) => Math.abs(s - timeScale) <= 1e-9 * Math.max(1, s));
}
