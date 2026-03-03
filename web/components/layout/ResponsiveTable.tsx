'use client';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Optional: on mobile render as stacked cards instead of horizontal scroll */
  mobileStack?: boolean;
  className?: string;
};

/**
 * Wraps a table in a horizontal scroll container so the page does not scroll horizontally.
 * overflow-x: auto; contained width.
 */
export default function ResponsiveTable({ children, mobileStack = false, className = '' }: Props) {
  return (
    <div
      className={`responsive-table-wrap ${mobileStack ? 'responsive-table-wrap--stack-mobile' : ''} ${className}`.trim()}
      role="region"
      aria-label="Table"
    >
      {children}
    </div>
  );
}
