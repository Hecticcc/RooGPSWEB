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
  Inbox,
  Server,
  ArrowLeft,
  Package,
  ShoppingCart,
  DollarSign,
  Ticket,
  Menu,
  X,
} from 'lucide-react';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/admin/pricing', label: 'Pricing', icon: DollarSign },
  { href: '/admin/vouchers', label: 'Vouchers', icon: Ticket },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/devices', label: 'Devices', icon: Smartphone },
  { href: '/admin/stock', label: 'Stock', icon: Package },
  { href: '/admin/ingest', label: 'Ingest', icon: Inbox },
  { href: '/admin/system', label: 'System', icon: Server },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  if (!checked) {
    return (
      <div
        className="admin-layout"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
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
              return (
                <Link
                  key={href}
                  href={href}
                  className={`admin-nav-link ${isActive ? 'admin-nav-link--active' : ''}`}
                  onClick={closeSidebar}
                >
                  <Icon size={18} />
                  <span>{label}</span>
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
