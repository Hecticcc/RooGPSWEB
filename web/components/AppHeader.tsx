'use client';

import Link from 'next/link';
import Logo from './Logo';

type Props = {
  userEmail?: string | null;
  onSignOut: () => void;
};

export default function AppHeader(props: Props) {
  const { userEmail, onSignOut } = props;
  return (
    <header className="app-header">
      <div className="app-header-nav">
        <Link href="/devices" className="app-header-logo-link" style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>
          <span className="app-header-logo" style={{ height: 44, maxWidth: 220, display: 'flex', alignItems: 'center' }}>
            <Logo size={44} inline />
          </span>
        </Link>
        <nav className="app-header-nav-links" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link href="/devices" className="app-header-dashboard-link">
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
