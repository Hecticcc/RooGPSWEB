'use client';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  colsMobile?: number;
  colsTablet?: number;
  colsDesktop?: number;
  colsWide?: number;
  className?: string;
  as?: 'div' | 'section';
};

/**
 * CSS Grid that responds to viewport:
 * - mobile: colsMobile (default 1)
 * - tablet (768px+): colsTablet (default 2)
 * - desktop (1024px+): colsDesktop (default 3)
 * - wide (1280px+): colsWide (default same as colsDesktop)
 */
export default function ResponsiveGrid({
  children,
  colsMobile = 1,
  colsTablet = 2,
  colsDesktop = 3,
  colsWide,
  className = '',
  as: Tag = 'div',
}: Props) {
  const wide = colsWide ?? colsDesktop;
  return (
    <Tag
      className={`responsive-grid responsive-grid--m${colsMobile}-t${colsTablet}-d${colsDesktop}-w${wide} ${className}`.trim()}
      style={
        {
          '--rg-cols-mobile': colsMobile,
          '--rg-cols-tablet': colsTablet,
          '--rg-cols-desktop': colsDesktop,
          '--rg-cols-wide': wide,
        } as React.CSSProperties
      }
    >
      {children}
    </Tag>
  );
}
