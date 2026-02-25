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
      <div className="app-header-left">
        <Link href="/track" className="app-header-logo-link" style={{ display: 'flex', alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
          <span className="app-header-logo">
            <Logo size={48} inline />
          </span>
        </Link>
      </div>
      <div className="app-header-actions">
        {userEmail ? <span className="app-header-email" title={userEmail}>{userEmail}</span> : null}
        <button type="button" onClick={onSignOut} className="app-header-logout">
          Log out
        </button>
      </div>
    </header>
  );
}
