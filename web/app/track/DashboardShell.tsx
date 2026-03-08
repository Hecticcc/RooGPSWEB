'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Inter } from 'next/font/google';
import AppHeader from '@/components/AppHeader';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { createClient } from '@/lib/supabase';
import { LayoutDashboard, Bell, Settings, Shield, LogOut, ShoppingBag, CreditCard, Headphones } from 'lucide-react';
import { isStaffOrAbove, roleLabel } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';

const inter = Inter({ subsets: ['latin'], variable: '--font-dashboard' });

type Props = {
  children: React.ReactNode;
};

export default function DashboardShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

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
      // Use same session as client so API sees correct user (avoids cookie/session mismatch)
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      fetch('/api/me', { credentials: 'include', cache: 'no-store', headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return;
          setUserRole((data?.role ?? 'customer') as UserRole);
        });
    });
    return () => { cancelled = true; };
  }, [router, supabase.auth]);

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
      <div className="dashboard-body">
        <aside className="dashboard-sidebar">
          <nav className="dashboard-nav">
            {nav.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === '/track'
                  ? pathname === '/track' || (pathname.startsWith('/track/') && !pathname.startsWith('/track/alerts') && !pathname.startsWith('/track/settings'))
                  :                 href === '/account/subscription'
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
        </aside>
        <div className="dashboard-main">
          {children}
        </div>
      </div>
    </div>
  );
}
