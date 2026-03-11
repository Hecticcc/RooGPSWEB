'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { createClient } from '@/lib/supabase';
import { isStaffOrAbove } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';
import { AdminAuthProvider } from './AdminAuthContext';
import {
  LayoutDashboard,
  Users,
  Smartphone,
  Server,
  ArrowLeft,
  Package,
  ShoppingCart,
  DollarSign,
  Menu,
  X,
  CreditCard,
  Headphones,
  Megaphone,
} from 'lucide-react';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/support', label: 'Support', icon: Headphones },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/admin/pricing', label: 'Pricing', icon: DollarSign },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/devices', label: 'Devices', icon: Smartphone },
  { href: '/admin/stock', label: 'Stock', icon: Package },
  { href: '/admin/banners', label: 'Banners', icon: Megaphone },
  { href: '/admin/system', label: 'System', icon: Server },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paidOrdersCount, setPaidOrdersCount] = useState<number | null>(null);
  const [openTicketsCount, setOpenTicketsCount] = useState<number | null>(null);

  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (cancelled) return;
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
        setAccessToken(session.access_token);
      }
      fetch('/api/me', { credentials: 'include', cache: 'no-store', headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return;
          if (!data?.role) {
            router.replace('/login');
            return;
          }
          if (!isStaffOrAbove(data.role)) {
            router.replace('/track');
            return;
          }
          setRole(data.role);
          setChecked(true);
        })
        .catch(() => {
          if (!cancelled) router.replace('/login');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!checked || !accessToken) return;
    let cancelled = false;
    fetch('/api/admin/orders/count', {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.count === 'number') setPaidOrdersCount(data.count);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [checked, accessToken]);

  useEffect(() => {
    if (!checked || !accessToken) return;
    let cancelled = false;
    fetch('/api/support/stats', {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.open_and_in_progress === 'number') setOpenTicketsCount(data.open_and_in_progress);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [checked, accessToken]);

  if (!checked) {
    return (
      <div
        className="admin-layout"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          width: '100%',
        }}
      >
        <AppLoadingIcon />
      </div>
    );
  }

  return (
    <div className={`admin-layout ${sidebarOpen ? 'admin-layout--sidebar-open' : ''}`}>
      <header className="admin-header">
        <div className="admin-header-inner">
          <button
            type="button"
            className="admin-menu-btn"
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link href="/track" className="admin-back" onClick={closeSidebar}>
            <ArrowLeft size={18} aria-hidden />
            <span>Back to app</span>
          </Link>
          <span className="admin-role">{role}</span>
        </div>
      </header>
      <div
        className="admin-sidebar-overlay"
        aria-hidden="true"
        onClick={closeSidebar}
      />
      <div className="admin-body">
        <aside className="admin-sidebar">
          <nav className="admin-nav">
            {NAV.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === '/admin/dashboard'
                  ? pathname === '/admin' || pathname === '/admin/dashboard'
                  : pathname.startsWith(href);
              const showPaidBadge = href === '/admin/orders' && paidOrdersCount != null && paidOrdersCount > 0;
              const showOpenTicketsBadge = href === '/admin/support' && openTicketsCount != null && openTicketsCount > 0;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`admin-nav-link ${isActive ? 'admin-nav-link--active' : ''}`}
                  onClick={closeSidebar}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {showPaidBadge && (
                    <span className="admin-nav-badge" aria-label={`${paidOrdersCount} paid order${paidOrdersCount === 1 ? '' : 's'}`}>
                      {paidOrdersCount}
                    </span>
                  )}
                  {showOpenTicketsBadge && (
                    <span className="admin-nav-badge" aria-label={`${openTicketsCount} open or in progress ticket${openTicketsCount === 1 ? '' : 's'}`}>
                      {openTicketsCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="admin-main">
          <AdminAuthProvider accessToken={accessToken}>{children}</AdminAuthProvider>
        </main>
      </div>
    </div>
  );
}
