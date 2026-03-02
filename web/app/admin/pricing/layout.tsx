'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DollarSign, Ticket } from 'lucide-react';

const TABS = [
  { href: '/admin/pricing', label: 'Pricing', icon: DollarSign },
  { href: '/admin/pricing/vouchers', label: 'Vouchers', icon: Ticket },
];

export default function AdminPricingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div className="admin-stock-tabs">
        {TABS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/admin/pricing'
              ? pathname === '/admin/pricing'
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
