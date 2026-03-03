'use client';

import { useEffect, useState } from 'react';

const BREAKPOINTS = [
  { px: 390, label: 'Mobile' },
  { px: 768, label: 'Tablet' },
  { px: 1024, label: 'Small laptop' },
  { px: 1280, label: 'Desktop' },
  { px: 1440, label: 'Large desktop' },
];

export default function ViewportTestPage() {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const [scrollWidth, setScrollWidth] = useState(0);

  useEffect(() => {
    function check() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const docW = document.documentElement.scrollWidth;
      setWidth(w);
      setHeight(h);
      setScrollWidth(docW);
      setOverflow(docW > w);
      if (docW > w) {
        console.warn('[Viewport] Horizontal scroll detected:', { innerWidth: w, scrollWidth: docW });
      }
    }
    check();
    window.addEventListener('resize', check);
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('resize', check);
      observer.disconnect();
    };
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: 8 }}>Viewport tester (dev)</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
        Test at: 390px, 768px, 1024px, 1280px, 1440px. Check: no horizontal scroll, no overlapping, sidebar behavior.
      </p>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 14 }}>
        <dt>Width</dt>
        <dd><strong>{width}px</strong></dd>
        <dt>Height</dt>
        <dd><strong>{height}px</strong></dd>
        <dt>Scroll width</dt>
        <dd><strong>{scrollWidth}px</strong></dd>
        <dt>Horizontal overflow</dt>
        <dd>
          <strong style={{ color: overflow ? '#c00' : '#0a0' }}>
            {overflow ? 'Yes — fix layout' : 'No'}
          </strong>
        </dd>
      </dl>
      <h2 style={{ fontSize: '1rem', marginTop: 24, marginBottom: 8 }}>Breakpoints</h2>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
        {BREAKPOINTS.map(({ px, label }) => (
          <li key={px}>
            {px}px — {label}
            {width >= px - 2 && width <= px + 2 && ' ← near'}
          </li>
        ))}
      </ul>
    </div>
  );
}
