'use client';

import Link from 'next/link';
import Logo from './Logo';

const STATUS_URL = 'https://status.roogps.com';

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
      <div className="app-header-right">
        <a
          href={STATUS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="app-header-status"
          aria-label="RooGPS system status"
        >
          Status
        </a>
      </div>
    </header>
  );
}
