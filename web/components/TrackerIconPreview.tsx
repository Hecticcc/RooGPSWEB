'use client';

import { getMarkerSvgPath, type TrackerIconId } from '@/lib/tracker-icon-svg';

type Props = {
  iconType: TrackerIconId | string;
  color: string;
  size?: number;
  className?: string;
};

export default function TrackerIconPreview({ iconType, color, size = 28, className = '' }: Props) {
  const { viewBox, path, fillRule } = getMarkerSvgPath(iconType);
  const safeColor = color.replace(/[^#0-9A-Fa-f]/g, '') || '#f97316';
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={safeColor}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden
    >
      <path d={path} fillRule={fillRule} />
    </svg>
  );
}
