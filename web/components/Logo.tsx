'use client';

import { useState } from 'react';
import LogoIcon from './LogoIcon';

type Props = { size?: number; wide?: boolean };

export default function Logo({ size = 120, wide = false }: Props) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const showSvg = !imgLoaded || imgFailed;
  const w = wide ? Math.round(size * 2.4) : size;
  const h = size;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {showSvg && (
          <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogoIcon size={size} />
          </span>
        )}
        <img
          src="/logo.png"
          alt="RooGPS"
          width={w}
          height={h}
          style={{
            objectFit: 'contain',
            position: 'absolute',
            inset: 0,
            opacity: imgLoaded ? 1 : 0,
            pointerEvents: imgLoaded ? 'auto' : 'none',
          }}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgFailed(true)}
        />
      </div>
    </div>
  );
}
