'use client';

import type { BatteryTier } from '@/lib/battery';

/** Bar count per tier (Tabler-style): Full 4, High 3, Mid 2, Low 1, Unknown 0 */
const TIER_BARS: Record<BatteryTier, 0 | 1 | 2 | 3 | 4> = {
  high: 4,
  medium: 2,
  low: 1,
  very_low: 1,
  unknown: 0,
};

type Props = {
  tier: BatteryTier;
  size?: number;
  color?: string;
  className?: string;
  'aria-hidden'?: boolean;
  'aria-label'?: string;
};

/**
 * Tabler-style battery icon: horizontal body with 4 vertical bars indicating level.
 * Full = 4 bars, Medium = 2 bars, Low/Very low = 1 bar, Unknown = outline only.
 */
export default function BatteryLevelIcon({
  tier,
  size = 24,
  color = 'currentColor',
  className,
  'aria-hidden': ariaHidden,
  'aria-label': ariaLabel,
}: Props) {
  const bars = TIER_BARS[tier];
  const strokeStyle = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  // Body: x=2 y=6 w=18 h=12 rx=2; cap at right; 4 bar slots from x 5,9,13,17 width 3 height 8 y=8
  const barWidth = 3;
  const barHeight = 8;
  const barY = 8;
  const barXs = [5, 9, 13, 17];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
    >
      <rect x={2} y={6} width={18} height={12} rx={2} ry={2} {...strokeStyle} />
      <line x1={22} y1={11} x2={22} y2={13} {...strokeStyle} />
      {barXs.slice(0, bars).map((x, i) => (
        <rect
          key={i}
          x={x}
          y={barY}
          width={barWidth}
          height={barHeight}
          rx={0.5}
          fill={color}
          opacity={0.95}
        />
      ))}
    </svg>
  );
}
