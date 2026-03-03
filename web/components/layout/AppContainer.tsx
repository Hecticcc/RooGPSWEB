'use client';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Optional extra class for layout variants */
  className?: string;
  /** Semantic tag; default 'div' */
  as?: 'div' | 'main' | 'section';
};

/**
 * Centers content with responsive max-width and padding.
 * - max-width: 1280px–1440px (uses --app-container-max)
 * - padding: mobile 16px, tablet 24px, desktop 32px (uses --page-pad)
 */
export default function AppContainer({ children, className = '', as: Tag = 'div' }: Props) {
  return <Tag className={`app-container ${className}`.trim()}>{children}</Tag>;
}
