'use client';

import Link from 'next/link';
import Logo from './Logo';

export default function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <Link href="/track" className="app-header-logo-link" style={{ display: 'flex', alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
          <span className="app-header-logo">
            <Logo size={128} inline />
          </span>
        </Link>
      </div>
    </header>
  );
}
