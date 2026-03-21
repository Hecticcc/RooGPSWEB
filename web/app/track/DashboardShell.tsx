'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Inter } from 'next/font/google';
import AppHeader from '@/components/AppHeader';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { createClient } from '@/lib/supabase';
import { useUser } from '@/lib/UserContext';
import { LayoutDashboard, Bell, Settings, Shield, LogOut, ShoppingBag, CreditCard, Headphones, Info, AlertTriangle, AlertCircle, CheckCircle, X } from 'lucide-react';
import { isStaffOrAbove, roleLabel } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';

type SystemBanner = {
  id: string;
  title: string | null;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
};

const inter = Inter({ subsets: ['latin'], variable: '--font-dashboard' });

type Props = {
  children: React.ReactNode;
};

export default function DashboardShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { role: contextRole } = useUser();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [banners, setBanners] = useState<SystemBanner[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());

  function getFirstName(user: { user_metadata?: { full_name?: string; name?: string }; email?: string | null }): string | null {
    const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
    if (typeof name === 'string' && name.trim()) {
      const first = name.trim().split(/\s+/)[0];
      return first ?? null;
    }
    const email = user.email?.trim();
    if (email) {
      const local = email.split('@')[0];
      if (local) {
        const cleaned = local.replace(/[._0-9]+/g, ' ').trim() || local;
        const first = cleaned.split(/\s+/)[0] ?? cleaned;
        return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
      }
    }
    return null;
  }

  // Sync role from UserContext (shared fetch — avoids a duplicate /api/me call)
  useEffect(() => {
    if (contextRole !== null) setUserRole(contextRole);
  }, [contextRole]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (cancelled) return;
      if (!user) {
        router.replace('/login');
        return;
      }
      setUserEmail(user.email ?? null);
      setUserFirstName(getFirstName(user));
      setAuthChecked(true);
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      fetch('/api/banners', { credentials: 'include', cache: 'no-store', headers })
        .then((r) => r.ok ? r.json() : { banners: [] })
        .then((bannerData) => {
          if (cancelled) return;
          setBanners(bannerData?.banners ?? []);
        });
    });
    return () => { cancelled = true; };
  }, [router, supabase.auth]);

  function dismissBanner(id: string) {
    setDismissedBanners((prev) => new Set(Array.from(prev).concat(id)));
  }

  const BANNER_ICON: Record<SystemBanner['type'], React.ReactNode> = {
    info: <Info size={16} aria-hidden />,
    warning: <AlertTriangle size={16} aria-hidden />,
    error: <AlertCircle size={16} aria-hidden />,
    success: <CheckCircle size={16} aria-hidden />,
  };

  const visibleBanners = banners.filter((b) => !dismissedBanners.has(b.id));

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (!authChecked) {
    return (
      <div className="dashboard-layout" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <AppLoadingIcon />
      </div>
    );
  }

  const nav = [
    { href: '/track', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/account/orders', label: 'Orders', icon: ShoppingBag },
    { href: '/account/subscription', label: 'Subscription', icon: CreditCard },
    { href: '/account/support', label: 'Support', icon: Headphones },
    { href: '/track/alerts', label: 'Alerts', icon: Bell },
    { href: '/track/settings', label: 'Settings', icon: Settings },
  ];

  const showAdmin = isStaffOrAbove(userRole);

  return (
    <div className={`dashboard-layout ${inter.variable}`}>
      <AppHeader />
      {visibleBanners.length > 0 && (
        <div className="system-banners-bar">
          {visibleBanners.map((b) => (
            <div key={b.id} className={`system-banner-strip system-banner-strip--${b.type}`} role="alert">
              <span className="system-banner-strip__icon">{BANNER_ICON[b.type]}</span>
              <div className="system-banner-strip__content">
                {b.title && <strong className="system-banner-strip__title">{b.title}</strong>}
                <span className="system-banner-strip__message">{b.message}</span>
              </div>
              <button
                type="button"
                className="system-banner-strip__dismiss"
                aria-label="Dismiss banner"
                onClick={() => dismissBanner(b.id)}
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="dashboard-body">
        <aside className="dashboard-sidebar">
          <div className="dashboard-sidebar-inner">
            <div className="dashboard-nav-scroll">
              <nav className="dashboard-nav">
                {nav.map(({ href, label, icon: Icon }) => {
                  const isActive =
                    href === '/track'
                      ? pathname === '/track' || (pathname.startsWith('/track/') && !pathname.startsWith('/track/alerts') && !pathname.startsWith('/track/settings'))
                      : href === '/account/subscription'
                        ? pathname === '/account/subscription'
                        : href === '/account/support'
                          ? pathname.startsWith('/account/support')
                          : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`dashboard-nav-link ${isActive ? 'dashboard-nav-link--active' : ''}`}
                      title={label}
                      aria-label={label}
                    >
                      <Icon size={20} strokeWidth={2} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="dashboard-sidebar-footer">
              <div className="dashboard-sidebar-greeting">
                <p className="dashboard-sidebar-hello">
                  Hello{userFirstName ? `, ${userFirstName}` : ''}
                </p>
                {userRole && (
                  <span className="dashboard-sidebar-role-badge" title={userEmail ?? undefined}>
                    {roleLabel(userRole)}
                  </span>
                )}
              </div>
              <div className="dashboard-sidebar-actions">
                {showAdmin && (
                  <Link href="/admin" className="dashboard-sidebar-admin" title="Admin">
                    <Shield size={16} />
                    <span>Admin</span>
                  </Link>
                )}
                <button type="button" onClick={handleSignOut} className="dashboard-sidebar-logout">
                  <LogOut size={16} />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          </div>
        </aside>
        <div className="dashboard-main">
          {children}
        </div>
      </div>
    </div>
  );
}
