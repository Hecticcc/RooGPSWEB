'use client';

import { getMarkerSvgPath, type TrackerIconId } from '@/lib/tracker-icon-svg';

type Props = {
  iconType: TrackerIconId | string;
  color: string;
  size?: number;
  className?: string;
};

const strokeProps = {
  fill: 'none' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 2,
};

export default function TrackerIconPreview({ iconType, color, size = 28, className = '' }: Props) {
  const result = getMarkerSvgPath(iconType);
  const safeColor = color.replace(/[^#0-9A-Fa-f]/g, '') || '#f97316';
  const isStroke = 'stroke' in result && result.stroke && result.paths;
  return (
    <svg
      width={size}
      height={size}
      viewBox={result.viewBox}
      fill={isStroke ? undefined : safeColor}
      stroke={isStroke ? safeColor : undefined}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden
    >
      {isStroke
        ? result.paths!.map((d, i) => (
            <path key={i} d={d} stroke={safeColor} {...strokeProps} />
          ))
        : (
            <path d={result.path!} fillRule={result.fillRule} />
          )}
    </svg>
  );
}
