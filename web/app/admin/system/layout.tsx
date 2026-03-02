'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Server, Inbox } from 'lucide-react';

const TABS = [
  { href: '/admin/system', label: 'System', icon: Server },
  { href: '/admin/system/ingest', label: 'Ingest', icon: Inbox },
];

export default function AdminSystemLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div className="admin-stock-tabs">
        {TABS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/admin/system'
              ? pathname === '/admin/system'
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`admin-stock-tab ${isActive ? 'admin-stock-tab--active' : ''}`}
            >
              <Icon size={18} aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
      {children}
    </>
  );
}
