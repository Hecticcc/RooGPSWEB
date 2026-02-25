'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Inter } from 'next/font/google';
import AppHeader from '@/components/AppHeader';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { createClient } from '@/lib/supabase';
import { LayoutDashboard, Bell, Settings } from 'lucide-react';

const inter = Inter({ subsets: ['latin'], variable: '--font-dashboard' });

type Props = {
  children: React.ReactNode;
};

export default function DashboardShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;
      if (!user) {
        router.replace('/login');
        return;
      }
      setUserEmail(user.email ?? null);
      setAuthChecked(true);
    });
    return () => { cancelled = true; };
  }, []);

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
    { href: '/track/alerts', label: 'Alerts', icon: Bell },
    { href: '/track/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className={`dashboard-layout ${inter.variable}`}>
      <AppHeader userEmail={userEmail} onSignOut={handleSignOut} />
      <div className="dashboard-body">
        <aside className="dashboard-sidebar">
          <nav className="dashboard-nav">
            {nav.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === '/track'
                  ? pathname === '/track' || (pathname.startsWith('/track/') && !pathname.startsWith('/track/alerts') && !pathname.startsWith('/track/settings'))
                  : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`dashboard-nav-link ${isActive ? 'dashboard-nav-link--active' : ''}`}
                >
                  <Icon size={20} strokeWidth={2} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="dashboard-main">
          {children}
        </div>
      </div>
    </div>
  );
}
