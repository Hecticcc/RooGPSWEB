'use client';

import { useState } from 'react';
import Link from 'next/link';
import LogoIcon from './LogoIcon';

type Props = {
  userEmail?: string | null;
  onSignOut: () => void;
};

export default function AppHeader(props: Props) {
  const { userEmail, onSignOut } = props;
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const showSvg = !logoLoaded || logoFailed;
  return (
    <header className="app-header">
      <div className="app-header-nav">
        <Link href="/devices" style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>
          <span style={{ position: 'relative', height: 36, minWidth: 32, width: logoLoaded ? 'auto' : 32, maxWidth: 180, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
            {showSvg && (
              <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LogoIcon size={28} />
              </span>
            )}
            <img
              src="/logo.png"
              alt="RooGPS"
              height={36}
              width={logoLoaded ? undefined : 32}
              style={{
                position: logoLoaded ? 'relative' : 'absolute',
                inset: logoLoaded ? undefined : 0,
                height: 36,
                width: logoLoaded ? 'auto' : 32,
                maxWidth: 180,
                objectFit: 'contain',
                opacity: logoLoaded ? 1 : 0,
                pointerEvents: logoLoaded ? 'auto' : 'none',
              }}
              onLoad={() => setLogoLoaded(true)}
              onError={() => setLogoFailed(true)}
            />
          </span>
        </Link>
        <nav style={{ display: 'flex', gap: 4 }}>
          <Link
            href="/devices"
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--accent)',
              background: 'var(--accent-muted)',
              borderBottom: '2px solid var(--accent)',
            }}
          >
            Dashboard
          </Link>
        </nav>
      </div>
      <div className="app-header-actions">
        {userEmail ? <span className="app-header-email" title={userEmail}>{userEmail}</span> : null}
        <button
          type="button"
          onClick={onSignOut}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--muted)',
            fontSize: 14,
          }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
