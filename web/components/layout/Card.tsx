'use client';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section';
};

/**
 * Consistent card: padding, rounded corners, no fixed height, overflow hidden for content safety.
 * Uses existing design tokens (--surface, --border, --radius).
 */
export default function Card({ children, className = '', as: Tag = 'div' }: Props) {
  return <Tag className={`layout-card ${className}`.trim()}>{children}</Tag>;
}
