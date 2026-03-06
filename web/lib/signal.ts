/**
 * CSQ (0–31) to signal bars (0–4) for consumer display.
 * Configurable thresholds; defaults: 0-5=0, 6-11=1, 12-17=2, 18-23=3, 24-31=4.
 */

export const SIGNAL_BAR_THRESHOLDS = [6, 12, 18, 24] as const;
/** CSQ value above which we show N bars (1-4). Below first threshold = 0 bars. */
export const DEFAULT_CSQ_BAR_THRESHOLDS = SIGNAL_BAR_THRESHOLDS;

export function csqToBars(csq: number | null | undefined, thresholds: number[] = [...DEFAULT_CSQ_BAR_THRESHOLDS]): number {
  if (csq == null || csq < 0) return 0;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (csq >= thresholds[i]) return i + 1;
  }
  return 0;
}
